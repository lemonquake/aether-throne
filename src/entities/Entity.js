/**
 * Entity — abstract base class for everything that lives on the battlefield:
 * units, buildings and neutral resource nodes.
 *
 * Responsibilities:
 *  - stable unique id (module-level counter, never recycled within a session)
 *  - the canonical transform: `mesh` (a THREE.Group) whose `.position` IS the
 *    entity's world position — every other system reads/writes through it
 *  - hp / mana bookkeeping + the WC3-style damage pipeline (`takeDamage`)
 *  - the owner-colored selection ring that SelectionSystem toggles
 *
 * Subclasses (Unit / Building / ResourceNode) add behavior; the EntityManager
 * owns lifecycle (scene add/remove, physics/nav registration cleanup, reaping).
 *
 * Perf notes: selection-ring geometries and materials are cached at module
 * scope (cache key = footprint radius / owner colorHex) so a 200-entity match
 * shares a handful of GPU resources instead of allocating per entity.
 */
import * as THREE from 'three';
import { computeDamage, ENTITY_CLASS } from '../config/UnitTypes.js';
import { eventBus, EVENTS } from '../engine/EventBus.js';

/** Monotonic id counter shared by every entity subclass. */
let _nextEntityId = 1;

/** Ring color used for neutral (unowned) entities like resource nodes. */
const NEUTRAL_RING_HEX = '#d8d2b0';

/**
 * Cached flat ring geometries, keyed by footprint radius (2-decimal string).
 * The -90° X rotation is baked into the geometry so instances lie on the
 * ground without per-mesh rotation bookkeeping.
 * @type {Map<string, THREE.RingGeometry>}
 */
const _ringGeometryCache = new Map();

/**
 * Cached ring materials keyed by owner colorHex ('#rrggbb').
 * @type {Map<string, THREE.MeshBasicMaterial>}
 */
const _ringMaterialCache = new Map();

/**
 * Get (or lazily build) the shared selection-ring geometry for a footprint.
 * @param {number} radius - Entity footprint radius in world units.
 * @returns {THREE.RingGeometry}
 */
function getRingGeometry(radius) {
  const key = radius.toFixed(2);
  let geo = _ringGeometryCache.get(key);
  if (!geo) {
    const inner = radius * 1.35;
    const outer = inner + 0.18;
    geo = new THREE.RingGeometry(inner, outer, 32);
    geo.rotateX(-Math.PI / 2); // lie flat on the ground plane
    _ringGeometryCache.set(key, geo);
  }
  return geo;
}

/**
 * Get (or lazily build) the shared selection-ring material for a color.
 * @param {string} colorHex - '#rrggbb' owner color (cache key).
 * @returns {THREE.MeshBasicMaterial}
 */
function getRingMaterial(colorHex) {
  let mat = _ringMaterialCache.get(colorHex);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false, // never occlude the unit standing inside the ring
    });
    _ringMaterialCache.set(colorHex, mat);
  }
  return mat;
}

/**
 * Base battlefield entity. Never instantiated directly — use the Unit /
 * Building / ResourceNode subclasses via EntityManager spawn helpers.
 */
export class Entity {
  /**
   * @param {import('../engine/GameEngine.js').GameEngine} engine - Injected
   *        engine reference (never imported — see ARCHITECTURE.md rule).
   * @param {object} type - Frozen UnitTypes entry (or resource pseudo-type).
   * @param {object|null} player - Owning Player, or null for neutral entities.
   * @param {THREE.Vector3} position - Spawn position (copied, not referenced).
   */
  constructor(engine, type, player, position) {
    /** @type {number} Unique, session-stable id. */
    this.id = _nextEntityId++;
    /** Injected engine — the only sanctioned handle to other subsystems. */
    this.engine = engine;
    /** Frozen stat block from config/UnitTypes.js. */
    this.type = type;
    /** Owning player or null (neutral). */
    this.player = player ?? null;

    // ── Vital stats ──────────────────────────────────────────────────
    this.maxHp = type.hp;
    this.hp = type.hp;
    this.maxMana = type.mana ?? 0;
    this.mana = type.mana ?? 0;
    /** Set by die(); EntityManager reaps dead entities at end of its pass. */
    this.isDead = false;
    /** Mirrors the selection ring visibility (SelectionSystem toggles it). */
    this.isSelected = false;

    // ── Visual root ──────────────────────────────────────────────────
    /**
     * The canonical transform. Subclasses attach their body meshes as
     * children; the EntityManager adds/removes this group from the scene.
     * @type {THREE.Group}
     */
    this.mesh = new THREE.Group();
    this.mesh.name = `entity-${this.id}-${type.id}`;
    this.mesh.position.copy(position);
    if (engine.terrain) {
      this.mesh.position.y = engine.terrain.getHeightAt(position.x, position.z);
    }
    // Back-reference so engine.pickEntity can walk raycast hits up to the
    // owning entity (child meshes → traverse ancestors → userData.entity).
    this.mesh.userData.entity = this;

    // ── Selection ring (hidden until selected) ───────────────────────
    const ringHex = this.player ? this.player.colorHex : NEUTRAL_RING_HEX;
    /** @type {THREE.Mesh} Owner-colored ground ring, toggled by setSelected. */
    this._ring = new THREE.Mesh(getRingGeometry(type.radius), getRingMaterial(ringHex));
    this._ring.position.y = 0.05; // hover just above the ground to avoid z-fighting
    this._ring.visible = false;
    this.mesh.add(this._ring);
  }

  /** @returns {number} Owning player id, or -1 for neutral entities. */
  get playerId() {
    return this.player?.id ?? -1;
  }

  /** @returns {string} Owning player's team, or 'NEUTRAL'. */
  get team() {
    return this.player?.team ?? 'NEUTRAL';
  }

  /**
   * The canonical world position (live reference to mesh.position).
   * @returns {THREE.Vector3}
   */
  get position() {
    return this.mesh.position;
  }

  /** @returns {number} hp as a 0..1 fraction (0 when maxHp is 0). */
  get hpFraction() {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }

  /**
   * Toggle the selection ring. Called by SelectionSystem on every selection
   * change; dead entities refuse to show the ring.
   * @param {boolean} flag
   */
  setSelected(flag) {
    this.isSelected = !!flag;
    this._ring.visible = this.isSelected && !this.isDead;
  }

  /**
   * Apply incoming damage through the shared WC3 mitigation pipeline
   * (attack-type vs armor-type table + armor reduction — see UnitTypes.js).
   * Emits UNIT_DAMAGED with the *post-mitigation* amount, then die()s at 0 hp.
   * @param {number} rawDamage - Pre-mitigation rolled damage.
   * @param {string} attackType - 'NORMAL'|'PIERCE'|'MAGIC'|'SIEGE'.
   * @param {Entity|null} attacker - Damage source (for kill credit / events).
   */
  takeDamage(rawDamage, attackType, attacker) {
    if (this.isDead || this.isInvulnerable) return; // corpses and invulnerable entities take no damage
    const finalDamage = computeDamage(rawDamage, attackType, this.type.armor, this.type.armorType);
    this.hp -= finalDamage;
    eventBus.emit(EVENTS.UNIT_DAMAGED, { entity: this, amount: finalDamage, attacker });
    if (this.hp <= 0) {
      this.hp = 0;
      this.die(attacker ?? null);
    }
  }

  /**
   * Kill this entity. Emits the class-appropriate lifecycle event
   * (UNIT_DIED / BUILDING_DESTROYED; resource nodes emit RESOURCE_DEPLETED
   * themselves before calling die). The EntityManager performs the actual
   * scene/physics/nav removal on its next reap pass — nothing here touches
   * the entity arrays, so die() is safe to call mid-iteration.
   * @param {Entity|null} [killer]
   */
  die(killer = null) {
    if (this.isDead) return; // idempotent — overkill damage in one frame is common
    this.isDead = true;
    this.hp = 0;
    this.setSelected(false); // hide the ring immediately; SelectionSystem prunes later
    if (this.type.class === ENTITY_CLASS.UNIT) {
      eventBus.emit(EVENTS.UNIT_DIED, { entity: this, killer });
    } else if (this.type.class === ENTITY_CLASS.BUILDING) {
      eventBus.emit(EVENTS.BUILDING_DESTROYED, { entity: this, killer });
    }
    // Resource nodes (class 'RESOURCE') emit RESOURCE_DEPLETED themselves.
    // TODO(phase-5): death animation / fading corpse instead of instant reap.
  }

  /**
   * Per-frame behavior hook. Base entities are inert; subclasses override.
   * @param {number} dt - Clamped frame delta in seconds.
   */
  update(dt) {
    // Intentionally empty — see Unit / Building overrides.
    void dt;
  }

  /**
   * Release per-entity resources. Geometries and materials are shared module
   * caches (never disposed per-entity); this only severs references so the
   * GC can collect the entity after EntityManager.remove detaches the mesh.
   */
  dispose() {
    this.mesh.userData.entity = null;
    this.player = null;
    this.engine = null;
  }
}
