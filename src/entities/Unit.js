/**
 * Unit — a mobile battlefield entity driven by a small finite-state machine.
 *
 * Movement architecture (see ARCHITECTURE.md §8):
 *  - Yuka owns *steering*: each unit has a YUKA.Vehicle (created through
 *    `engine.navigation.createVehicle(this)`) with Arrive + Separation +
 *    FollowPath behaviors. `navigation.update(dt)` integrates vehicle
 *    positions BEFORE `entities.update(dt)` runs (engine frame order).
 *  - Rapier owns *collision*: every frame the unit computes the displacement
 *    the vehicle wants (`vehicle.position − mesh.position`) and pushes it
 *    through `engine.physics.moveUnit(unit, desired, out)`, which slides the
 *    kinematic capsule along static geometry (buildings, resource nodes).
 *    The corrected position is written back into the vehicle so steering
 *    never diverges from the physical truth.
 *  - Unit-vs-unit crowding is handled softly by Yuka SeparationBehavior —
 *    WC3 crowds are squishy, not rigid.
 *
 * Combat: melee applies damage instantly on cooldown; RANGED archetypes fire
 * a homing bolt through `engine.projectiles.fire(...)`. Target acquisition
 * for IDLE / ATTACK_MOVING units is *driven by CombatSystem* (staggered sweep
 * calling `tryAcquireTarget()`) so we never pay a findNearestEnemy per unit
 * per frame.
 *
 * Perf: all hot-path math goes through module-scope scratch vectors; the
 * capsule/head geometries and per-player-color materials are cached at module
 * scope (cache key = colorHex) so hundreds of units share a handful of GPU
 * resources.
 */
import * as THREE from 'three';
import { Entity } from './Entity.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { ARCHETYPE } from '../config/UnitTypes.js';
import { eventBus, EVENTS } from '../engine/EventBus.js';
import { buildUnitModel } from '../world/ModelFactory.js';
import { createHealthBar } from '../fx/HealthBar.js';

/**
 * The unit FSM states. Exported so CommandSystem / CombatSystem / AI brains
 * can reason about unit intent without poking at private fields.
 */
export const UNIT_STATES = Object.freeze({
  IDLE: 'IDLE',
  MOVING: 'MOVING',
  ATTACK_MOVING: 'ATTACK_MOVING',
  ATTACKING: 'ATTACKING',
  HOLDING: 'HOLDING',
  GATHER_MOVING: 'GATHER_MOVING',
  HARVESTING: 'HARVESTING',
  RETURNING: 'RETURNING',
  REPAIR_MOVING: 'REPAIR_MOVING',
  REPAIRING: 'REPAIRING',
  FLEEING: 'FLEEING',
  DEAD: 'DEAD',
});

// ── Tuning constants (local to unit behavior; global knobs live in GameConfig) ──
/** Minimum seconds between path requests while chasing — "repath at ~4 Hz max". */
const REPATH_INTERVAL = 0.25;
/** Seconds between repath attempts while fleeing (fleeing needs less precision). */
const FLEE_REPATH_INTERVAL = 1.0;
/** Below this speed (units/sec) a unit trying to move counts as "not moving". */
const STUCK_SPEED_SQ = 0.05 * 0.05;
/** Seconds of not-moving before a move-like state gives up / repaths. */
const STUCK_TIMEOUT = 1.5;
/** Forced repaths attempted on stuck before abandoning a gather/return trip. */
const MAX_STUCK_REPATHS = 2;
/** Extra edge-to-edge padding for harvest / drop-off interactions. */
const INTERACT_PAD = 0.7;
/** Exponential smoothing rate for yaw facing (higher = snappier turns). */
const FACE_RATE = 10;
/**
 * Velocity bleed rate (1/sec) applied while a unit is *planted* (no active
 * Arrive goal). Yuka's SeparationBehavior is always on and injects a steering
 * force into `vehicle.velocity`, but Yuka has no linear damping — so without
 * this, the tightly-packed starting army gets shoved apart by separation and
 * then COASTS AWAY forever with no friction (the infamous "units walk off at
 * match start" bug). Damping lets separation nudge crowds apart, then settle.
 */
const PLANTED_DAMPING = 12;
/** Seconds between drop-off re-searches when no drop-off building exists. */
const DROPOFF_SEARCH_INTERVAL = 1.0;
/** Squared distance to base considered "home safe" when fleeing. */
const FLEE_HOME_DIST_SQ = 9;
/** Fallback projectile speed if a ranged type forgot its projectile block. */
const DEFAULT_PROJECTILE_SPEED = 25;
/**
 * How far (world units) a DEFENDING unit will chase an attacker away from its
 * guard anchor before breaking off and marching home ("aggro leash").
 */
const AGGRO_RETURN_DIST_SQ = 16 * 16;
/**
 * How far a target may stray from an ATTACK-MOVE point before the unit stops
 * chasing it and resumes clearing the area ("attack-ground leash").
 */
const ATTACKMOVE_LEASH_SQ = 13 * 13;
/** Seconds a unit must stay out of combat before it begins to regenerate. */
const REGEN_DELAY = 8;
/** Fraction of max HP a resting unit regenerates per second (WC3-style). */
const REGEN_RATE = 0.05;

// ── Shared GPU resources (module-scope caches — see perf contract) ─────────
/** One shared cargo-cube geometry (the little resource chunk workers carry). */
let _cargoGeometry = null;
/** Shared cargo materials — gold nugget / aether shard tints. */
let _cargoGoldMaterial = null;
let _cargoAetherMaterial = null;

/** Fallback tint for units without an owner (shouldn't happen in practice). */
const NEUTRAL_UNIT_HEX = '#9a9a9a';

/** @returns {THREE.BoxGeometry} the single shared cargo-cube geometry. */
function getCargoGeometry() {
  if (!_cargoGeometry) _cargoGeometry = new THREE.BoxGeometry(0.28, 0.28, 0.28);
  return _cargoGeometry;
}

/** @returns {THREE.MeshStandardMaterial} shared gold-cargo material. */
function getCargoGoldMaterial() {
  if (!_cargoGoldMaterial) {
    _cargoGoldMaterial = new THREE.MeshStandardMaterial({
      color: '#f5c542', emissive: '#6b4e0a', roughness: 0.35, metalness: 0.6,
    });
  }
  return _cargoGoldMaterial;
}

/** @returns {THREE.MeshStandardMaterial} shared aether-cargo material. */
function getCargoAetherMaterial() {
  if (!_cargoAetherMaterial) {
    _cargoAetherMaterial = new THREE.MeshStandardMaterial({
      color: '#5ce8e8', emissive: '#0d5f66', roughness: 0.3, metalness: 0.2,
    });
  }
  return _cargoAetherMaterial;
}

// ── Module-scope scratch (no per-frame allocation in hot loops) ─────────────
const _desired = new THREE.Vector3();
const _corrected = new THREE.Vector3();
const _v1 = new THREE.Vector3();

/**
 * Shortest-arc angle interpolation, so units never spin the long way round.
 * @param {number} a - Current angle (radians).
 * @param {number} b - Target angle (radians).
 * @param {number} t - Interpolation factor 0..1.
 * @returns {number}
 */
function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/**
 * A mobile unit: worker, melee or ranged. See module header for the
 * movement/combat architecture.
 */
export class Unit extends Entity {
  /**
   * @param {import('../engine/GameEngine.js').GameEngine} engine - Injected engine.
   * @param {object} type - Frozen UnitTypes entry (class === 'UNIT').
   * @param {object} player - Owning Player (units are never neutral in v1).
   * @param {THREE.Vector3} position - Spawn position.
   */
  constructor(engine, type, player, position) {
    super(engine, type, player, position);

    // ── Visuals: a full procedural model, unique per faction+archetype ────
    // Distinct silhouettes (armored knight / void beast / rock golem), tinted
    // by owner color on cloaks, crests and cores. See world/ModelFactory.js.
    const colorHex = player ? player.colorHex : NEUTRAL_UNIT_HEX;
    const { group: model, height: crownHeight } = buildUnitModel(type, colorHex);
    /** @type {THREE.Group} The assembled body model (feet at y=0, faces +Z). */
    this._model = model;
    this.mesh.add(model);

    /**
     * Tiny cube shown while carrying resources (material swapped between the
     * shared gold/aether tints per trip — assignment only, no allocation).
     * @type {THREE.Mesh}
     */
    this._cargoMesh = new THREE.Mesh(getCargoGeometry(), getCargoGoldMaterial());
    this._cargoMesh.position.set(0, crownHeight * 0.5, -type.radius - 0.18); // on the back
    this._cargoMesh.visible = false;
    this.mesh.add(this._cargoMesh);

    /** Floating HP (green) + mana (blue) bar — 2D, always faces the screen.
     *  Shown when damaged, low on mana, or selected. @type {object} */
    this._healthBar = createHealthBar(type.radius * 2.4, crownHeight + 0.4, {
      mana: this.maxMana > 0,
    });
    this.mesh.add(this._healthBar.group);

    // ── FSM & combat state (public contract fields) ───────────────────────
    /** @type {string} One of UNIT_STATES. */
    this.state = UNIT_STATES.IDLE;
    /** @type {Entity|null} Current combat target. */
    this.attackTarget = null;
    /** @type {import('./ResourceNode.js').ResourceNode|null} Node being worked. */
    this.gatherNode = null;
    /** @type {{gold:number, aether:number}|null} Resources in hand (null = empty). */
    this.carrying = null;
    /** @type {number} Seconds until the next attack is allowed. */
    this.attackCooldown = 0;
    /** @type {number} gameTime before which auto-acquire is suppressed (fleeing). */
    this.fleeUntil = 0;
    /** True while holding position: attack anything in range, never chase. */
    this._holdPosition = false;
    /** gameTime of the last damage dealt or taken — gates out-of-combat regen. */
    this._lastCombatTime = -Infinity;

    // ── Aggro / guard-anchor bookkeeping ─────────────────────────────────
    /** Guard post a defending unit leashes back to. Set on every idle. @type {THREE.Vector3} */
    this._anchor = new THREE.Vector3().copy(position);
    /** True once _anchor holds a meaningful guard post. */
    this._hasAnchor = true;
    /** True while auto-retaliating: chase is leashed to _anchor, then return home. */
    this._defending = false;

    // ── Animation bookkeeping (cheap procedural motion — no allocation) ───
    /** Per-unit phase offset so a crowd doesn't bob/breathe in lockstep. */
    this._animPhase = this.id * 0.7;
    /** Attack-jab progress 0..1 (1 = idle). Reset to 0 on each swing. */
    this._attackAnim = 1;
    /** Hit-flinch progress 0..1 (1 = idle). Reset to 0 when damage lands. */
    this._hitAnim = 1;

    // ── Repair (builder) bookkeeping ──────────────────────────────────────
    /** @type {import('./Building.js').Building|null} Structure being repaired. */
    this._repairTarget = null;
    /** Fractional gold owed for repair, spent in whole units to avoid event spam. */
    this._repairCostAccum = 0;

    // ── Private FSM bookkeeping ───────────────────────────────────────────
    /** True when the current attackTarget came from an explicit player/AI order
     *  (ordered attacks chase forever; auto-acquired ones respect the leash). */
    this._orderedAttack = false;
    /** Destination of the current MOVE order. Preallocated, reused. */
    this._moveTarget = new THREE.Vector3();
    /** Destination of the current ATTACK_MOVE order (resumed after each kill). */
    this._attackMovePos = new THREE.Vector3();
    /** Whether _attackMovePos holds a live attack-move objective. */
    this._hasAttackMovePos = false;
    /** Resource kind ('GOLD_MINE'|'AETHER_WELL') of the active gather loop —
     *  survives node depletion so we can auto-retarget the same resource. */
    this._gatherKind = null;
    /** Drop-off building the current RETURNING leg is heading to. */
    this._returnBuilding = null;
    /** Countdown for the current HARVESTING stint. */
    this._harvestTimer = 0;
    /** Cooldown before re-searching for a drop-off when none exists. */
    this._dropoffSearchCooldown = 0;
    /** gameTime of the last path request (throttling — see _requestPath). */
    this._lastPathTime = -Infinity;
    /** Accumulated seconds of near-zero velocity while trying to move. */
    this._stuckTime = 0;
    /** Forced-repath attempts made since the last successful arrival. */
    this._stuckRepaths = 0;
    /**
     * The vector handed to navigation.requestPath. Reused for every request:
     * if a newer order supersedes a queued request, mutating this vector
     * simply redirects the pending request to the newer goal — exactly the
     * semantics we want, with zero allocation.
     */
    this._pathGoal = new THREE.Vector3();
    /**
     * Reusable carry payload passed to player.deposit(). One field is always
     * zero; reusing the object keeps the gather loop garbage-free.
     */
    this._carryScratch = { gold: 0, aether: 0 };

    // ── Register with navigation (steering) and physics (collision) ───────
    /**
     * The YUKA steering vehicle. NavigationManager configures Arrive +
     * Separation + FollowPath behaviors per its contract.
     * @type {YUKA.Vehicle|null}
     */
    this.vehicle = engine.navigation ? engine.navigation.createVehicle(this) : null;
    if (this.vehicle) {
      // Make sure steering starts exactly where the mesh spawned.
      this.vehicle.position.set(position.x, 0, position.z);
    }
    // Kinematic capsule + character controller (slides around static geometry).
    if (engine.physics) engine.physics.registerUnit(this);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Orders (public command API — called by CommandSystem / AI brains / buildings)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Move to a ground position, dropping any combat/gather intent.
   * @param {THREE.Vector3} pos
   */
  orderMove(pos) {
    if (this.isDead) return;
    this._clearIntent();
    this.state = UNIT_STATES.MOVING;
    this._moveTarget.copy(pos);
    this._requestPath(pos.x, pos.z, true); // player orders bypass the repath throttle
  }

  /**
   * Attack-move: walk toward a position, engaging any hostiles found en route
   * (acquisition is performed by CombatSystem's staggered sweep). After a
   * fight ends the unit resumes marching to the original position.
   * @param {THREE.Vector3} pos
   */
  orderAttackMove(pos) {
    if (this.isDead) return;
    this._clearIntent();
    this.state = UNIT_STATES.ATTACK_MOVING;
    this._attackMovePos.copy(pos);
    this._hasAttackMovePos = true;
    this._requestPath(pos.x, pos.z, true);
  }

  /**
   * Explicitly attack a target. Ordered attacks chase indefinitely (no sight
   * leash), matching WC3 right-click-attack behavior.
   * @param {Entity} target
   */
  orderAttack(target) {
    if (this.isDead) return;
    if (!target || target.isDead || target === this) {
      this.orderStop();
      return;
    }
    this._clearIntent();
    this._beginAttack(target, /* ordered = */ true);
  }

  /**
   * Begin the gather loop on a resource node. Only WORKER archetypes can
   * gather — everyone else just walks over to the node.
   * @param {import('./ResourceNode.js').ResourceNode} node
   */
  orderGather(node) {
    if (this.isDead) return;
    if (!node || node.isDead) return;
    if (this.type.archetype !== ARCHETYPE.WORKER) {
      // Non-workers can't harvest; treat the order as a move-beside.
      this.orderMove(node.position);
      return;
    }
    this._clearIntent();
    this.gatherNode = node;
    this._gatherKind = node.kind;
    this.state = UNIT_STATES.GATHER_MOVING;
    this._requestPath(node.position.x, node.position.z, true);
  }

  /**
   * Repair (or finish building) an own/allied structure. WORKER archetypes only
   * — everyone else just walks over. No-op if the structure needs no work.
   * @param {import('./Building.js').Building} building
   */
  orderRepair(building) {
    if (this.isDead) return;
    if (!building || building.isDead) return;
    if (this.type.archetype !== ARCHETYPE.WORKER) {
      this.orderMove(building.position);
      return;
    }
    // Nothing to do on a finished, undamaged structure.
    if (building.hp >= building.maxHp && !(building.constructionRemaining > 0)) {
      this.orderMove(building.position);
      return;
    }
    this._clearIntent();
    this._repairTarget = building;
    this._repairCostAccum = 0;
    this.state = UNIT_STATES.REPAIR_MOVING;
    this._requestPath(building.position.x, building.position.z, true);
  }

  /**
   * Shortcut: gather from the NEAREST live node of a resource kind (the classic
   * "return to work" / one-key harvest button). WORKER archetypes only.
   * @param {'GOLD_MINE'|'AETHER_WELL'} kind
   * @returns {boolean} true if a node was found and tasked.
   */
  orderGatherNearest(kind) {
    if (this.isDead) return false;
    if (this.type.archetype !== ARCHETYPE.WORKER) return false;
    const pos = this.position;
    let best = null;
    let bestSq = Infinity;
    for (const node of this.engine.entities.resources) {
      if (node.isDead || node.kind !== kind || node.amount <= 0) continue;
      const dx = node.position.x - pos.x;
      const dz = node.position.z - pos.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestSq) { bestSq = dSq; best = node; }
    }
    if (!best) return false;
    this.orderGather(best);
    return true;
  }

  /** Halt in place and clear every order/intent (WC3 "S"). */
  orderStop() {
    if (this.isDead) return;
    this._clearIntent();
    this._becomeIdle();
  }

  /**
   * Hold position (WC3 "H"): stand ground and strike any hostile that enters
   * attack range, but NEVER chase — the unit stays planted at its current spot.
   * A subsequent move/attack/stop order releases the stance (via _clearIntent).
   */
  orderHold() {
    if (this.isDead) return;
    this._clearIntent();
    this._holdPosition = true;
    this._anchor.copy(this.position);
    this._hasAnchor = true;
    this.state = UNIT_STATES.HOLDING;
    this._stopMovement();
  }

  /**
   * Retreat toward the owner's base, ignoring auto-acquire for
   * COMBAT.RETREAT_LOCKOUT seconds. Used by MicroBrain's retreat logic.
   * (Additive extension beyond the base order set — reported as a deviation.)
   */
  orderFlee() {
    if (this.isDead) return;
    this._clearIntent();
    this.state = UNIT_STATES.FLEEING;
    this.fleeUntil = (this.engine.gameTime ?? 0) + GAME_CONFIG.COMBAT.RETREAT_LOCKOUT;
    const base = this.player?.basePosition;
    if (base) this._requestPath(base.x, base.z, true);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Target acquisition (driven by CombatSystem's staggered sweep)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Attempt to auto-acquire the nearest hostile within sightRadius. Only
   * meaningful for IDLE / ATTACK_MOVING units; suppressed during the fleeing
   * lockout and for types that can't deal damage.
   * @returns {boolean} true if a target was acquired.
   */
  tryAcquireTarget() {
    if (this.isDead || this.isIdlePassive) return false;
    if (this.state !== UNIT_STATES.IDLE && this.state !== UNIT_STATES.ATTACK_MOVING) return false;
    // Fleeing lockout persists even after the unit goes idle at its base.
    if ((this.engine.gameTime ?? 0) < this.fleeUntil) return false;
    if (this.type.damage[1] <= 0) return false; // pacifist stat block
    const enemy = this.engine.entities.findNearestEnemy(this, this.type.sightRadius);
    if (!enemy) return false;
    // Guarding units (IDLE) defend their post: the chase leashes back to the
    // anchor. Attack-moving units use the attack-point leash instead.
    this._defending = this.state === UNIT_STATES.IDLE && !this._hasAttackMovePos;
    this._beginAttack(enemy, /* ordered = */ false);
    return true;
  }

  /**
   * Retaliation hook: called from takeDamage. A guarding (IDLE) combat unit
   * that gets hit — even from beyond its sight, e.g. by a ranged attacker —
   * wheels around and chases the attacker, leashed back to its guard post so it
   * never gets kited across the map.
   * @param {Entity|null} attacker
   * @private
   */
  _onAttacked(attacker) {
    if (this.isDead || this.isIdlePassive || !attacker || attacker.isDead) return;
    if (this.type.damage[1] <= 0) return;                 // can't fight back
    if (this.type.archetype === ARCHETYPE.WORKER) return; // workers keep working
    if (this._orderedAttack || this._hasAttackMovePos) return; // orders own the leash
    if (this.state === UNIT_STATES.FLEEING) return;
    if (this.state === UNIT_STATES.ATTACKING) { this._defending = true; return; } // already retaliating
    if (this.state !== UNIT_STATES.IDLE) return;          // only guarding units wheel around
    if (!this._isHostileTo(attacker)) return;
    // _anchor was set when this unit last went idle — that's its guard post.
    this._defending = true;
    this._beginAttack(attacker, /* ordered = */ false);
  }

  /**
   * Is `other` a valid hostile for this unit (different, non-allied player)?
   * @param {Entity} other @returns {boolean} @private
   */
  _isHostileTo(other) {
    if (!other) return false;
    if (!this.player || !other.player) {
      return (!this.player) !== (!other.player);
    }
    if (other.player === this.player) return false;
    if (this.player.isAlliedWith(other.player)) return false;
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Per-frame update — movement sync + FSM dispatch
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Drive the FSM and sync mesh ← vehicle through the physics slide.
   * Called by EntityManager.update every frame.
   * @param {number} dt - Clamped frame delta (seconds).
   */
  update(dt) {
    if (this.isDead) return;
    if (this.attackCooldown > 0) this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    this._syncMovement(dt);

    switch (this.state) {
      case UNIT_STATES.IDLE:
        // Squash any stale steering (e.g. a path that resolved after a stop
        // order). Separation stays active so idle crowds still relax apart.
        this._deactivateSteering();
        break;
      case UNIT_STATES.MOVING: this._updateMoving(dt); break;
      case UNIT_STATES.ATTACK_MOVING: this._updateAttackMoving(dt); break;
      case UNIT_STATES.ATTACKING: this._updateAttacking(dt); break;
      case UNIT_STATES.HOLDING: this._updateHolding(dt); break;
      case UNIT_STATES.GATHER_MOVING: this._updateGatherMoving(dt); break;
      case UNIT_STATES.HARVESTING: this._updateHarvesting(dt); break;
      case UNIT_STATES.RETURNING: this._updateReturning(dt); break;
      case UNIT_STATES.REPAIR_MOVING: this._updateRepairMoving(dt); break;
      case UNIT_STATES.REPAIRING: this._updateRepairing(dt); break;
      case UNIT_STATES.FLEEING: this._updateFleeing(dt); break;
      default: break; // DEAD is unreachable (guarded above)
    }

    this._regen(dt);
    this._animate(dt);
    // HP/mana bars: ALWAYS shown for every unit (WC3-style constant readout).
    // Billboards to the camera each frame (screen-facing 2D bar). Enemy meshes
    // are hidden entirely by the fog pass, so their bars vanish with them.
    const manaFrac = this.maxMana > 0 ? this.mana / this.maxMana : 0;
    this._healthBar.update(this.hpFraction, manaFrac, true, this.engine.camera, this.mesh.quaternion);
  }

  /**
   * Cheap procedural animation on the model group: a walk bob + waddle while
   * moving, gentle idle breathing when still, and a forward jab on each attack.
   * All motion is local to the model group (the parent `mesh` owns yaw/position)
   * and driven by gameTime + a per-unit phase — zero allocation.
   * @param {number} dt
   */
  _animate(dt) {
    const m = this._model;
    if (!m) return;
    const now = this.engine.gameTime ?? 0;
    const v = this.vehicle?.velocity;
    const speed = v ? Math.hypot(v.x, v.z) : 0;
    const anim = m.userData.anim;

    if (m.userData.customAnimate) {
      m.userData.customAnimate(this, dt, now, speed);
    }

    const moving = speed > 0.4;
    // 0..1 stride intensity scaled by how fast we're going vs top speed.
    const s = moving ? Math.min(1, speed / (this.type.moveSpeed || 5)) : 0;

    let dip = 0; // extra downward offset (hit flinch squash)

    if (moving) {
      this._idleTimer = 0;
      // Stride frequency and intensity for RUNNING
      const t = now * 16 + this._animPhase; // Fast stride rate
      const amp = 1.15 * s; // Large stride amplitude
      
      // Vertical bob: bounces twice per stride cycle (each footstep)
      m.position.y = Math.abs(Math.sin(t)) * 0.11 * s;
      
      // Side-to-side roll (hip swaying/tilt)
      m.rotation.z = Math.sin(t) * 0.07 * s;
      
      // Dynamic body twist (shoulders/hips twisting opposite the stride)
      m.rotation.y = Math.sin(t) * 0.1 * s;
      
      // Leaning forward deeply into the run
      m.rotation.x = 0.22 * s;

      if (anim) {
        const stride = Math.sin(t);
        const legs = anim.legs;
        if (legs.length >= 2) {
          legs[0].rotation.x = stride * amp;
          legs[1].rotation.x = -stride * amp;
        } else if (legs.length === 1) {
          legs[0].rotation.x = stride * amp;
        }
        const arms = anim.arms;
        if (arms.length >= 2) {
          // Energetic run arm swing: swing opposite the legs, and bend/swing wide
          arms[0].rotation.x = -stride * amp * 0.9;
          arms[1].rotation.x = stride * amp * 0.9;
          // Flare arms out slightly while running
          arms[0].rotation.z = -0.15 * s;
          arms[1].rotation.z = 0.15 * s;
        } else if (arms.length === 1) {
          arms[0].rotation.x = -stride * amp * 0.9;
        }
      }
    } else {
      if (this._idleTimer === undefined) this._idleTimer = 0;
      this._idleTimer += dt;

      // Cycle through 3 distinct idle states in a 15-second loop:
      // State 1: Default Breathing (0s to 7s)
      // State 2: Look Around (7s to 11s)
      // State 3: Weight Shift / Stretch (11s to 15s)
      const loopLen = 15;
      const cycleTime = (this._idleTimer + this._animPhase * 3) % loopLen;

      let breathY = Math.sin(now * 2 + this._animPhase) * 0.015;
      m.position.y = breathY;
      m.rotation.x = 0;
      m.rotation.y = 0;
      m.rotation.z = 0;

      // Reset leg/arm rotations to default breathing poses first
      if (anim) {
        anim.legs.forEach(l => l.rotation.x = 0);
        anim.arms.forEach(a => {
          a.rotation.x = 0;
          a.rotation.z = 0;
        });
      }

      if (cycleTime >= 7 && cycleTime < 11) {
        // State 2: Look Around (slowly pan yaw left/right)
        const progress = (cycleTime - 7) / 4; // 0..1
        const env = Math.sin(progress * Math.PI); // Smooth envelope
        const lookYaw = Math.sin(now * 2.5) * 0.45 * env;
        m.rotation.y = lookYaw;
      } else if (cycleTime >= 11 && cycleTime < 15) {
        // State 3: Weight Shift / Stretch (bob down and lean side-to-side)
        const progress = (cycleTime - 11) / 4; // 0..1
        const env = Math.sin(progress * Math.PI); // Smooth envelope
        m.position.y = breathY - 0.08 * env; // Bob down slightly
        m.rotation.z = Math.sin(now * 3) * 0.08 * env; // Tilt slightly side-to-side
        
        // Stretch arms outward
        if (anim && anim.arms) {
          if (anim.arms.length >= 2) {
            anim.arms[0].rotation.z = -0.35 * env;
            anim.arms[1].rotation.z = 0.35 * env;
            anim.arms[0].rotation.x = 0.2 * env;
            anim.arms[1].rotation.x = 0.2 * env;
          }
        }
      } else {
        // Default Breathing (State 1)
        // Arms gently rise and fall with breath
        if (anim && anim.arms) {
          const breathArm = (Math.sin(now * 2 + this._animPhase) + 1) * 0.04;
          anim.arms.forEach(a => a.rotation.z = -breathArm);
        }
      }
    }

    // Hit flinch: a quick backward recoil + squash + lateral shudder when
    // damage lands, springing back. Shares position.z with the attack jab.
    let z = 0;
    if (this._hitAnim < 1) {
      this._hitAnim = Math.min(1, this._hitAnim + dt * 6.5);
      const f = Math.sin(this._hitAnim * Math.PI);
      z -= f * 0.16;   // recoil away from the blow (−z = backward)
      dip += f * 0.06; // brief crouch
      m.position.x = Math.sin(this._hitAnim * Math.PI * 9) * f * 0.07; // shudder
    } else if (m.position.x !== 0) {
      m.position.x = 0;
    }

    // Attack/tool jab: swing the weapon/tool arm forward if the model has one;
    // otherwise fall back to a whole-body lunge (+z local = facing).
    if (this._attackAnim < 1) {
      this._attackAnim = Math.min(1, this._attackAnim + dt * 5.5);
      const jab = Math.sin(this._attackAnim * Math.PI);
      if (anim && anim.toolArm) {
        anim.toolArm.rotation.x = -jab * 1.25; // thrust the tool/weapon forward
      } else {
        z += jab * 0.28;
      }
    }
    m.position.z = z;
    m.position.y -= dip;
  }

  /**
   * Apply the steering-proposed displacement through the physics character
   * controller, then write the corrected transform back into the vehicle so
   * yuka and rapier never disagree about where the unit actually is.
   * Also handles yaw facing from the current velocity.
   * @param {number} dt
   */
  _syncMovement(dt) {
    if (!this.vehicle) return;
    const pos = this.mesh.position;

    // Displacement the steering integrator wants this frame (navigation.update
    // already advanced vehicle.position before entities.update runs).
    _desired.set(this.vehicle.position.x - pos.x, 0, this.vehicle.position.z - pos.z);

    if (this.engine.physics) {
      // Slide along static colliders (buildings / resource nodes / doodads).
      this.engine.physics.moveUnit(this, _desired, _corrected);
    } else {
      _corrected.copy(_desired); // physics unavailable (tests) → trust steering
    }

    pos.x += _corrected.x;
    pos.z += _corrected.z;
    // Feet follow the terrain (flat 0 in v1; API future-proofs hills).
    pos.y = this.engine.terrain ? this.engine.terrain.getHeightAt(pos.x, pos.z) : 0;

    // Sync velocity to the actual displacement.
    if (dt > 1e-6) {
      this.vehicle.velocity.set(_corrected.x / dt, 0, _corrected.z / dt);
    } else {
      this.vehicle.velocity.set(0, 0, 0);
    }

    // Write the corrected position back so steering resumes from reality —
    // without this, a vehicle blocked by a wall would drift ever further from
    // the mesh and the unit would "catapult" once the path cleared.
    this.vehicle.position.x = pos.x;
    this.vehicle.position.z = pos.z;

    // Planted-state velocity damping (the match-start "walk away" fix): when
    // the unit has no active Arrive goal it is idle/harvesting/attacking-in-
    // place. Bleed off any residual velocity — chiefly the momentum Separation
    // imparts on the packed opening army — so crowds relax apart and STOP,
    // instead of gliding off the map with Yuka's frictionless integrator.
    const arrive = this.vehicle._arrive;
    if (!arrive || !arrive.active) {
      const damp = Math.exp(-PLANTED_DAMPING * dt);
      this.vehicle.velocity.x *= damp;
      this.vehicle.velocity.z *= damp;
      if (this.vehicle.velocity.squaredLength() < 0.01) {
        this.vehicle.velocity.set(0, 0, 0);
      }
    }

    // Face the direction of travel (attack state overrides toward its target).
    const vx = this.vehicle.velocity.x;
    const vz = this.vehicle.velocity.z;
    if (vx * vx + vz * vz > 0.04) {
      const yaw = Math.atan2(vx, vz);
      this.mesh.rotation.y = lerpAngle(this.mesh.rotation.y, yaw, 1 - Math.exp(-FACE_RATE * dt));
    }
  }

  // ── State handlers ────────────────────────────────────────────────────────

  /** @param {number} dt */
  _updateMoving(dt) {
    const pos = this.mesh.position;
    const dx = this._moveTarget.x - pos.x;
    const dz = this._moveTarget.z - pos.z;
    const tol = GAME_CONFIG.PATH.ARRIVE_TOLERANCE;
    if (dx * dx + dz * dz <= tol * tol) {
      this._becomeIdle();
      return;
    }
    // Grinding against a wall / crowd for too long → give up like WC3 does.
    if (this._trackStuck(dt)) this._becomeIdle();
  }

  /** @param {number} dt */
  _updateAttackMoving(dt) {
    // Hostile acquisition en route is handled by CombatSystem.tryAcquireTarget.
    const pos = this.mesh.position;
    const dx = this._attackMovePos.x - pos.x;
    const dz = this._attackMovePos.z - pos.z;
    const tol = GAME_CONFIG.PATH.ARRIVE_TOLERANCE;
    if (dx * dx + dz * dz <= tol * tol || this._trackStuck(dt)) {
      this._hasAttackMovePos = false;
      this._becomeIdle();
      // One last look around on arrival so units don't nap next to enemies.
      this.tryAcquireTarget();
    }
  }

  /** @param {number} dt */
  _updateAttacking(dt) {
    const target = this.attackTarget;
    if (!target || target.isDead) {
      this._onTargetLost();
      return;
    }
    const pos = this.mesh.position;
    const dx = target.position.x - pos.x;
    const dz = target.position.z - pos.z;
    const distSq = dx * dx + dz * dz;
    // WC3 measures range edge-to-edge, so both footprints extend the reach.
    const reach = this.type.attackRange + this.type.radius + target.type.radius;

    if (distSq <= reach * reach) {
      // In range: plant feet, face the target, swing on cooldown.
      this._stopMovement(); // re-stopped every frame — squashes stale queued paths
      const yaw = Math.atan2(dx, dz);
      this.mesh.rotation.y = lerpAngle(this.mesh.rotation.y, yaw, 1 - Math.exp(-FACE_RATE * dt));
      if (this.attackCooldown <= 0) this._performAttack(target);
    } else {
      // Out of range → chase, but respect the appropriate leash so units never
      // get dragged across the map:
      if (!this._orderedAttack) {
        if (this._hasAttackMovePos) {
          // Attack-ground: stop chasing anything that flees far from the target
          // area, then resume clearing that spot.
          const ax = target.position.x - this._attackMovePos.x;
          const az = target.position.z - this._attackMovePos.z;
          if (ax * ax + az * az > ATTACKMOVE_LEASH_SQ) { this._onTargetLost(); return; }
        } else if (this._defending && this._hasAnchor) {
          // Defensive aggro: march home once WE stray too far from the post.
          const hx = this.position.x - this._anchor.x;
          const hz = this.position.z - this._anchor.z;
          if (hx * hx + hz * hz > AGGRO_RETURN_DIST_SQ) { this._returnToAnchor(); return; }
        } else {
          // Plain auto-acquire: leash to sight + hysteresis.
          const leash = this.type.sightRadius + GAME_CONFIG.COMBAT.ACQUIRE_HYSTERESIS;
          if (distSq > leash * leash) { this._onTargetLost(); return; }
        }
      }
      // Chase — _requestPath internally throttles to ~4 Hz.
      this._requestPath(target.position.x, target.position.z);
    }
  }

  /**
   * Break off a defensive chase and march back to the guard anchor. On arrival
   * the unit idles there and may re-engage anything still in sight.
   * @private
   */
  _returnToAnchor() {
    this.attackTarget = null;
    this._orderedAttack = false;
    this._defending = false;
    if (this._hasAnchor) {
      this.state = UNIT_STATES.MOVING;
      this._moveTarget.copy(this._anchor);
      this._requestPath(this._anchor.x, this._anchor.z, true);
    } else {
      this._becomeIdle();
    }
  }

  /**
   * Hold-position tick: stay planted, but strike any hostile that walks into
   * attack range. Unlike ATTACKING it never chases — a target that leaves range
   * is simply dropped and the unit keeps holding.
   * @param {number} dt
   */
  _updateHolding(dt) {
    this._deactivateSteering();
    if (this.type.damage[1] <= 0) return; // non-combatants just stand their ground

    // Keep hitting the current target while it stays in reach.
    const target = this.attackTarget;
    if (target && !target.isDead) {
      const dx = target.position.x - this.position.x;
      const dz = target.position.z - this.position.z;
      const reach = this.type.attackRange + this.type.radius + target.type.radius;
      if (dx * dx + dz * dz <= reach * reach) {
        const yaw = Math.atan2(dx, dz);
        this.mesh.rotation.y = lerpAngle(this.mesh.rotation.y, yaw, 1 - Math.exp(-FACE_RATE * dt));
        if (this.attackCooldown <= 0) this._performAttack(target);
        return;
      }
    }

    // Otherwise acquire a NEW hostile only if one is already within reach —
    // never step toward it (that would break the "hold" contract).
    this.attackTarget = null;
    if ((this.engine.gameTime ?? 0) < this.fleeUntil) return;
    const reachSearch = this.type.attackRange + this.type.radius + 1.2;
    const enemy = this.engine.entities.findNearestEnemy(this, reachSearch);
    if (enemy) this.attackTarget = enemy;
  }

  /**
   * Out-of-combat regeneration: a unit that has neither dealt nor taken damage
   * for REGEN_DELAY seconds slowly heals back to full. Cuts the tedium of
   * shuttling every scratched unit home, without helping units mid-fight.
   * @param {number} dt @private
   */
  _regen(dt) {
    if (this.hp <= 0 || this.hp >= this.maxHp) return;
    if (this.state === UNIT_STATES.ATTACKING || this.state === UNIT_STATES.FLEEING) return;
    const now = this.engine.gameTime ?? 0;
    if (now - this._lastCombatTime < REGEN_DELAY) return;
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * REGEN_RATE * dt);
  }

  /** @param {number} dt */
  _updateGatherMoving(dt) {
    const node = this.gatherNode;
    if (!node || node.isDead) {
      this._retargetGather();
      return;
    }
    if (this._withinEdgeRange(node, INTERACT_PAD)) {
      // Arrived at the node — start the harvest stint.
      this._stopMovement();
      this._stuckRepaths = 0;
      this.state = UNIT_STATES.HARVESTING;
      this._harvestTimer = GAME_CONFIG.ECONOMY.HARVEST_TIME;
      // Face the crystal we're chipping at.
      const yaw = Math.atan2(node.position.x - this.position.x, node.position.z - this.position.z);
      this.mesh.rotation.y = yaw;
      return;
    }
    if (this._trackStuck(dt)) this._handleStuckTrip(node.position);
  }

  /** @param {number} dt */
  _updateHarvesting(dt) {
    this._deactivateSteering(); // stay planted while separation nudges neighbors
    const node = this.gatherNode;
    if (!node || node.isDead) {
      this._retargetGather();
      return;
    }

    if (typeof node.onHarvestFrame === 'function') {
      node.onHarvestFrame(dt);
    }

    // Spawn harvesting contact particles (different for Gold and Aether)
    if (Math.random() < 0.25 && this.engine.fx) {
      const contactPos = new THREE.Vector3().lerpVectors(this.position, node.position, 0.75);
      contactPos.y += 0.45; // lift up to tool height
      
      const isGold = node.kind === 'GOLD_MINE';
      const sparkColor = isGold ? '#ffe24a' : '#2ad0ff'; // Gold yellow vs Aether cyan
      
      const count = Math.random() < 0.5 ? 1 : 2;
      for (let i = 0; i < count; i++) {
        this.engine.fx.spawn('spark', contactPos, sparkColor, {
          vx: (Math.random() - 0.5) * 2.8,
          vy: Math.random() * 3.2 + 1.8,
          vz: (Math.random() - 0.5) * 2.8,
          grav: isGold ? 10.0 : 4.0, // Gold falls down, Aether floats
          scale: Math.random() * 0.7 + 0.4
        });
      }
    }

    this._harvestTimer -= dt;
    if (this._harvestTimer > 0) return;

    // Trip complete — pull resources out of the node.
    const trip = node.kind === 'GOLD_MINE'
      ? GAME_CONFIG.ECONOMY.GOLD_PER_TRIP
      : GAME_CONFIG.ECONOMY.AETHER_PER_TRIP;
    const got = node.harvest(trip);
    if (got <= 0) {
      this._retargetGather(); // node ran dry under us
      return;
    }
    // Reuse the scratch payload — one field is always zero.
    this._carryScratch.gold = node.kind === 'GOLD_MINE' ? got : 0;
    this._carryScratch.aether = node.kind === 'AETHER_WELL' ? got : 0;
    this.carrying = this._carryScratch;
    this._cargoMesh.material = node.kind === 'GOLD_MINE' ? getCargoGoldMaterial() : getCargoAetherMaterial();
    this._cargoMesh.visible = true;
    this._beginReturn();
  }

  /** @param {number} dt */
  _updateReturning(dt) {
    let dropOff = this._returnBuilding;
    if (!dropOff || dropOff.isDead) {
      // No drop-off (destroyed or never existed) — re-search on a slow timer
      // so a hall finishing construction later resumes the loop automatically.
      this._returnBuilding = null;
      this._dropoffSearchCooldown -= dt;
      if (this._dropoffSearchCooldown <= 0) {
        this._dropoffSearchCooldown = DROPOFF_SEARCH_INTERVAL;
        dropOff = this._findNearestDropOff();
        if (dropOff) {
          this._returnBuilding = dropOff;
          this._requestPath(dropOff.position.x, dropOff.position.z, true);
        }
      }
      return;
    }
    if (this._withinEdgeRange(dropOff, INTERACT_PAD)) {
      // Deliver. Player.deposit applies the AI income multiplier internally.
      if (this.player && this.carrying) {
        const gold = this.carrying.gold;
        const aether = this.carrying.aether;
        this.player.deposit(this.carrying);
        // Floating "+N" feedback — FloatingTextManager filters to the local player.
        if (gold > 0 || aether > 0) {
          eventBus.emit(EVENTS.RESOURCE_DEPOSITED, {
            player: this.player,
            kind: gold > 0 ? 'gold' : 'aether',
            amount: gold > 0 ? gold : aether,
            position: this.position,
          });
        }
      }
      this.carrying = null;
      this._cargoMesh.visible = false;
      this._stuckRepaths = 0;
      // Head back for another trip (or retarget if the node died meanwhile).
      const node = this.gatherNode;
      if (node && !node.isDead && node.amount > 0) {
        this.state = UNIT_STATES.GATHER_MOVING;
        this._requestPath(node.position.x, node.position.z, true);
      } else {
        this._retargetGather();
      }
      return;
    }
    if (this._trackStuck(dt)) this._handleStuckTrip(dropOff.position);
  }

  /** @param {number} dt Walk to the structure being repaired. */
  _updateRepairMoving(dt) {
    const b = this._repairTarget;
    if (!b || b.isDead) { this._repairTarget = null; this._becomeIdle(); return; }
    // Already finished / fully healed before we arrived.
    if (b.hp >= b.maxHp && !(b.constructionRemaining > 0)) {
      this._repairTarget = null;
      this._becomeIdle();
      return;
    }
    if (this._withinEdgeRange(b, INTERACT_PAD)) {
      this._stopMovement();
      this._stuckRepaths = 0;
      this.state = UNIT_STATES.REPAIRING;
      const yaw = Math.atan2(b.position.x - this.position.x, b.position.z - this.position.z);
      this.mesh.rotation.y = yaw;
      return;
    }
    if (this._trackStuck(dt)) this._handleStuckTrip(b.position);
  }

  /** @param {number} dt Hammer the structure: finish construction, then heal. */
  _updateRepairing(dt) {
    this._deactivateSteering();
    const b = this._repairTarget;
    if (!b || b.isDead) { this._repairTarget = null; this._becomeIdle(); return; }

    // Shoved out of reach → walk back.
    if (!this._withinEdgeRange(b, INTERACT_PAD + 0.4)) {
      this.state = UNIT_STATES.REPAIR_MOVING;
      this._requestPath(b.position.x, b.position.z, true);
      return;
    }

    // Repeating hammer jab (same forward-lunge animation as an attack).
    if (this._attackAnim >= 1) this._attackAnim = 0.35;

    if (b.constructionRemaining > 0) {
      // Advance an unfinished scaffold. It only progresses while builders work.
      b.assistConstruction(GAME_CONFIG.ECONOMY.REPAIR_CONSTRUCT_BOOST * dt);
      return;
    }
    if (b.hp >= b.maxHp) {
      this._repairTarget = null; // fully repaired
      this._becomeIdle();
      return;
    }
    // Heal, paying a trickle of gold (repair stalls if the player is broke).
    this._repairCostAccum += GAME_CONFIG.ECONOMY.REPAIR_GOLD_PER_SEC * dt;
    if (this.player && this._repairCostAccum >= 1) {
      const whole = Math.floor(this._repairCostAccum);
      if (this.player.resources.gold >= whole) {
        this.player.spend({ gold: whole });
        this._repairCostAccum -= whole;
      } else {
        return; // out of gold — hold until resources return
      }
    }
    b.applyRepair(GAME_CONFIG.ECONOMY.REPAIR_HP_PER_SEC * dt);
  }

  /** @param {number} dt */
  _updateFleeing(dt) {
    void dt;
    const base = this.player?.basePosition;
    if (!base) {
      this._becomeIdle();
      return;
    }
    const dx = base.x - this.position.x;
    const dz = base.z - this.position.z;
    if (dx * dx + dz * dz <= FLEE_HOME_DIST_SQ) {
      // Home safe. Note: fleeUntil keeps suppressing auto-acquire from IDLE
      // (tryAcquireTarget checks the timestamp, not the state).
      this._becomeIdle();
      return;
    }
    // Keep pressing toward home. Works even when an AI brain set
    // state = FLEEING directly without calling orderFlee().
    const now = this.engine.gameTime ?? 0;
    if (now - this._lastPathTime >= FLEE_REPATH_INTERVAL) {
      this._requestPath(base.x, base.z, true);
    }
  }

  // ── Combat helpers ───────────────────────────────────────────────────────

  /**
   * Enter ATTACKING against a target.
   * @param {Entity} target
   * @param {boolean} ordered - Explicit order (true) vs auto-acquire (false).
   */
  _beginAttack(target, ordered) {
    this.attackTarget = target;
    this._orderedAttack = ordered;
    this.state = UNIT_STATES.ATTACKING;
    this._stuckTime = 0;
    // Chase pathing starts on the next _updateAttacking tick (throttled).
  }

  /**
   * Execute one attack: melee hits instantly, RANGED fires a homing bolt
   * through the shared projectile pool.
   * @param {Entity} target
   */
  _performAttack(target) {
    const [dmin, dmax] = this.type.damage;
    if (dmax <= 0) return;
    const raw = dmin + Math.random() * (dmax - dmin); // WC3-style damage roll
    if (this.type.archetype === ARCHETYPE.RANGED && this.engine.projectiles) {
      this.engine.projectiles.fire({
        source: this,
        target,
        speed: this.type.projectile?.speed ?? DEFAULT_PROJECTILE_SPEED,
        rawDamage: raw,
        attackType: this.type.attackType,
        color: this.player ? this.player.color : undefined,
      });
    } else {
      // Melee (and any non-ranged fallback) applies damage instantly.
      target.takeDamage(raw, this.type.attackType, this);
    }
    this.attackCooldown = this.type.attackSpeed;
    this._attackAnim = 0; // kick off the forward-jab animation
    this._lastCombatTime = this.engine.gameTime ?? 0; // suppress regen while fighting
  }

  /** Target died or leashed out — resume the interrupted intent, if any. */
  _onTargetLost() {
    this.attackTarget = null;
    this._orderedAttack = false;
    if (this._hasAttackMovePos) {
      // Resume the original attack-move march.
      this.state = UNIT_STATES.ATTACK_MOVING;
      this._requestPath(this._attackMovePos.x, this._attackMovePos.z, true);
    } else {
      this._becomeIdle();
      this.tryAcquireTarget(); // pick the next hostile immediately if one is near
    }
  }

  // ── Gathering helpers ────────────────────────────────────────────────────

  /** Transition into RETURNING toward the nearest own drop-off building. */
  _beginReturn() {
    this.state = UNIT_STATES.RETURNING;
    this._returnBuilding = this._findNearestDropOff();
    if (this._returnBuilding) {
      this._requestPath(this._returnBuilding.position.x, this._returnBuilding.position.z, true);
    } else {
      // No drop-off right now — _updateReturning re-searches on a timer.
      this._dropoffSearchCooldown = DROPOFF_SEARCH_INTERVAL;
    }
  }

  /**
   * Current gather node is gone/dry — find the nearest live node of the same
   * kind and continue the loop, or go idle if the map is out of that resource.
   */
  _retargetGather() {
    let best = null;
    let bestSq = Infinity;
    if (this._gatherKind) {
      const pos = this.position;
      for (const node of this.engine.entities.resources) {
        if (node.isDead || node.kind !== this._gatherKind || node.amount <= 0) continue;
        const dx = node.position.x - pos.x;
        const dz = node.position.z - pos.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestSq) { bestSq = dSq; best = node; }
      }
    }
    this.gatherNode = best;
    if (this.carrying) {
      // Deliver what we're holding first; the loop resumes after the deposit.
      this._beginReturn();
      return;
    }
    if (best) {
      this.state = UNIT_STATES.GATHER_MOVING;
      this._requestPath(best.position.x, best.position.z, true);
    } else {
      this._gatherKind = null;
      this._becomeIdle();
    }
  }

  /**
   * Nearest completed, own drop-off building (type.isDropOff — halls in v1).
   * @returns {import('./Building.js').Building|null}
   */
  _findNearestDropOff() {
    const buildings = this.engine.entities.getPlayerBuildings(this.playerId);
    const pos = this.position;
    let best = null;
    let bestSq = Infinity;
    for (const b of buildings) {
      if (b.isDead || !b.type.isDropOff || b.constructionRemaining > 0) continue;
      const dx = b.position.x - pos.x;
      const dz = b.position.z - pos.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestSq) { bestSq = dSq; best = b; }
    }
    return best;
  }

  /**
   * Stuck during a gather/return leg: try a couple of forced repaths, then
   * abandon the trip rather than vibrating against a wall forever.
   * @param {THREE.Vector3} goal - Where the leg was headed.
   */
  _handleStuckTrip(goal) {
    if (++this._stuckRepaths <= MAX_STUCK_REPATHS) {
      this._requestPath(goal.x, goal.z, true);
    } else {
      this._stuckRepaths = 0;
      this._clearIntent();
      this._becomeIdle();
    }
  }

  // ── Movement plumbing ────────────────────────────────────────────────────

  /**
   * Enqueue a path request toward (x, z). Throttled to REPATH_INTERVAL unless
   * forced (explicit orders always go through immediately).
   * @param {number} x
   * @param {number} z
   * @param {boolean} [force=false]
   * @returns {boolean} true if a request was actually issued.
   */
  _requestPath(x, z, force = false) {
    const now = this.engine.gameTime ?? 0;
    if (!force && now - this._lastPathTime < REPATH_INTERVAL) return false;
    this._lastPathTime = now;
    this._stuckTime = 0; // fresh path → fresh patience
    // _pathGoal is reused; NavigationManager may hold the reference in its
    // queue, in which case a newer goal simply redirects the pending request.
    this._pathGoal.set(x, 0, z);
    this.engine.navigation?.requestPath(this, this._pathGoal);
    return true;
  }

  /**
   * Accumulate "not actually moving" time while in a move-like state.
   * @param {number} dt
   * @returns {boolean} true once STUCK_TIMEOUT of near-zero velocity elapsed.
   */
  _trackStuck(dt) {
    const v = this.vehicle?.velocity;
    const speedSq = v ? v.x * v.x + v.z * v.z : 0;
    if (speedSq < STUCK_SPEED_SQ) {
      this._stuckTime += dt;
    } else {
      this._stuckTime = 0;
    }
    if (this._stuckTime >= STUCK_TIMEOUT) {
      this._stuckTime = 0;
      return true;
    }
    return false;
  }

  /**
   * Edge-to-edge proximity test against another entity.
   * @param {Entity} other
   * @param {number} pad - Extra allowance beyond the two footprint radii.
   * @returns {boolean}
   */
  _withinEdgeRange(other, pad) {
    const dx = other.position.x - this.position.x;
    const dz = other.position.z - this.position.z;
    const reach = this.type.radius + other.type.radius + pad;
    return dx * dx + dz * dz <= reach * reach;
  }

  /** Hard stop: zero velocity + deactivate all steering except separation. */
  _stopMovement() {
    if (!this.vehicle) return;
    this.vehicle.velocity.set(0, 0, 0);
    this._deactivateSteering();
  }

  /**
   * Deactivate every steering behavior except SeparationBehavior (which stays
   * on for life so crowds keep relaxing apart). NavigationManager re-activates
   * arrive/follow-path when the next path resolves.
   */
  _deactivateSteering() {
    const behaviors = this.vehicle?.steering?.behaviors;
    if (!behaviors) return;
    for (let i = 0; i < behaviors.length; i++) {
      const b = behaviors[i];
      if (b.active && b.type !== 'separation') b.active = false;
    }
  }

  /** Enter IDLE cleanly (stops steering, resets stuck bookkeeping, drops anchor). */
  _becomeIdle() {
    this.state = UNIT_STATES.IDLE;
    this._stopMovement();
    this._stuckTime = 0;
    // Wherever a unit comes to rest becomes its new guard post, so a later
    // retaliation leashes back to HERE rather than some stale spawn point.
    this._anchor.copy(this.position);
    this._hasAnchor = true;
    this._defending = false;
  }

  /** Wipe all combat/gather/move intent (shared prologue for every order). */
  _clearIntent() {
    this.attackTarget = null;
    this._orderedAttack = false;
    this._hasAttackMovePos = false;
    this._holdPosition = false; // a fresh order releases the hold-position stance
    this._defending = false; // an explicit order overrides any defensive aggro
    this.gatherNode = null;
    this._returnBuilding = null;
    this._repairTarget = null;
    this._stuckTime = 0;
    this._stuckRepaths = 0;
    // Note: `carrying` is intentionally kept — a worker re-tasked mid-trip
    // keeps its cargo and will deposit if it ever gathers again. v1 accepts
    // the cargo cube staying visible; WC3 does the same.
  }

  // ── Death & cleanup ──────────────────────────────────────────────────────

  /**
   * Take damage through the base mitigation pipeline, then kick off the visible
   * hit-flinch (a quick recoil so the player can read that a unit is under fire).
   * @param {number} rawDamage @param {string} attackType @param {Entity|null} attacker
   */
  takeDamage(rawDamage, attackType, attacker) {
    super.takeDamage(rawDamage, attackType, attacker);
    this._lastCombatTime = this.engine.gameTime ?? 0; // suppress regen while under fire
    if (!this.isDead) {
      this._hitAnim = 0;
      this._onAttacked(attacker); // guarding units wheel around and fight back
    }
  }

  /**
   * Unit death: release supply, halt steering, then run the base lifecycle
   * (UNIT_DIED event; EntityManager reaps scene/physics/nav on its next pass).
   * @param {Entity|null} [killer]
   */
  die(killer = null) {
    if (this.isDead) return; // idempotent, mirrors Entity.die
    this._stopMovement();
    this.state = UNIT_STATES.DEAD;
    this.attackTarget = null;
    this.gatherNode = null;
    // Free the supply this unit occupied (added by EntityManager.spawnUnit).
    if (this.player) this.player.addSupplyUsed(-(this.type.cost?.supply ?? 0));
    super.die(killer);
  }

  /**
   * Relinquish the body model so a CorpseManager can animate its death (topple
   * + sink) after the unit leaves the simulation. Detaches the model from this
   * entity's mesh and returns it; everything else (health bar, ring, cargo,
   * vehicle, physics body) is torn down normally by EntityManager.remove.
   * @returns {THREE.Group|null}
   */
  takeDeathModel() {
    const m = this._model;
    if (m) {
      this.mesh.remove(m);
      this._model = null;
    }
    return m;
  }

  /**
   * Sever references. The vehicle itself is unregistered from navigation by
   * EntityManager.remove *before* dispose is called; geometry/materials are
   * shared module caches and are never disposed per-unit.
   */
  dispose() {
    this.vehicle = null;
    this.attackTarget = null;
    this.gatherNode = null;
    this._returnBuilding = null;
    this._repairTarget = null;
    this.carrying = null;
    super.dispose();
  }
}
