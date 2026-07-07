/**
 * MicroBrain — an AI player's combat-tactics brain.
 *
 * Runs on the difficulty's micro cadence (fast for INSANE, slower for MEDIUM,
 * disabled entirely for EASY). Each tick, for the player's combat units:
 *
 *   - FOCUS FIRE: retarget onto the lowest-HP hostile in range, with a small
 *     stickiness bonus for the current target so the whole army doesn't thrash
 *     between two similar targets every tick.
 *   - KITING: a ranged unit that just fired (cooldown high) and has a melee
 *     enemy closing inside 0.6× its range steps directly away, then re-engages
 *     when its cooldown clears — classic hit-and-run.
 *   - RETREAT: a unit below RETREAT_HP_FRACTION that is locally outnumbered
 *     flees home (with a lockout so it doesn't immediately re-engage).
 *   - OBJECTIVE: idle units advance on the attack objective the MacroBrain
 *     hands down (attack-move so they fight through resistance).
 *
 * Shared-scratch discipline (see EntityManager.getUnitsInRadius): the combat
 * unit list this iterates is a FRESH array, and every spatial query is fully
 * consumed before the next one — no query result is held across another query.
 */
import * as THREE from 'three';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { ARCHETYPE } from '../../config/UnitTypes.js';
import { UNIT_STATES } from '../../entities/Unit.js';
import { localBalance } from './CombatEvaluator.js';

/** A ranged unit kites only when this much of its cooldown remains. */
const KITE_COOLDOWN_THRESHOLD = 0.25;
/** Kite when a melee enemy is within this fraction of the unit's range. */
const KITE_RANGE_FRACTION = 0.6;
/** How far (world units) a kiting unit steps away from the threat. */
const KITE_DISTANCE = 4;
/** Stickiness: keep the current target unless a new one is this much lower HP. */
const FOCUS_STICKINESS = 1.15;

/** Reused vectors (micro runs a few times per second, but zero churn is free). */
const _away = new THREE.Vector3();
const _dest = new THREE.Vector3();

export class MicroBrain {
  /**
   * @param {import('../../engine/GameEngine.js').GameEngine} engine
   * @param {import('../../engine/Player.js').Player} player
   * @param {object} profile - AI_PROFILES entry (reads microEnabled, microInterval).
   */
  constructor(engine, player, profile) {
    this.engine = engine;
    this.player = player;
    this.profile = profile;

    /** @type {THREE.Vector3|null} Push target handed down by the MacroBrain. */
    this._objective = null;
    /** Tick pacing accumulator (offset per player so ticks stagger). */
    this._accum = (player.id % 5) * 0.05;
  }

  /**
   * The MacroBrain calls this to point the army somewhere (or clear it).
   * @param {THREE.Vector3|null} pos
   */
  setAttackObjective(pos) {
    if (!pos) {
      this._objective = null;
      return;
    }
    if (!this._objective) this._objective = new THREE.Vector3();
    this._objective.set(pos.x, 0, pos.z);
  }

  getObjective() {
    return this._objective
      ? { x: Math.round(this._objective.x), z: Math.round(this._objective.z) }
      : null;
  }

  /**
   * Gate ticks by the difficulty's micro interval.
   * @param {number} dt
   */
  update(dt) {
    this._accum += dt;
    if (this._accum < this.profile.microInterval) return;
    this._accum = 0;
    this.tick();
  }

  /** One micro pass over the player's combat units. */
  tick() {
    if (this.player.isDefeated) return;
    const army = this._combatUnits(); // fresh array — safe to hold across queries
    for (let i = 0; i < army.length; i++) {
      const unit = army[i];
      if (unit.isDead) continue;

      // Already fleeing → respect the retreat; don't countermand it.
      if (unit.state === UNIT_STATES.FLEEING) continue;

      // 1) RETREAT — badly hurt AND outnumbered locally.
      if (this.profile.microEnabled && unit.hpFraction < GAME_CONFIG.COMBAT.RETREAT_HP_FRACTION) {
        // localBalance issues its own spatial query; nothing else is held here.
        if (localBalance(this.engine, unit) < 1) {
          unit.orderFlee();
          continue;
        }
      }

      // 2) KITING — ranged unit on cooldown with a melee threat closing in.
      if (this.profile.microEnabled && unit.type.archetype === ARCHETYPE.RANGED && unit.attackCooldown > KITE_COOLDOWN_THRESHOLD) {
        const threat = this._nearestHostileMelee(unit, unit.type.attackRange * KITE_RANGE_FRACTION);
        if (threat) {
          this._kiteAway(unit, threat);
          continue;
        }
      }

      // 3) FOCUS FIRE — pile onto the lowest-HP hostile in sight.
      const focus = this._focusTarget(unit);
      if (this.profile.microEnabled && focus) {
        if (unit.attackTarget !== focus) unit.orderAttack(focus);
        continue;
      }

      // 4) OBJECTIVE — nothing to fight; march on the macro's push target.
      if (this._objective && this._isFree(unit)) {
        unit.orderAttackMove(this._objective);
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Fresh array of this player's living melee/ranged units. */
  _combatUnits() {
    const out = [];
    const units = this.engine.entities.units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.isDead || u.player !== this.player) continue;
      if (u.type.archetype === ARCHETYPE.MELEE || u.type.archetype === ARCHETYPE.RANGED) out.push(u);
    }
    return out;
  }

  /**
   * Lowest-HP hostile within the unit's sight, with stickiness toward the
   * unit's current target. Consumes the shared spatial-query scratch fully.
   * @returns {import('../../entities/Entity.js').Entity|null}
   */
  _focusTarget(unit) {
    const near = this.engine.entities.getUnitsInRadius(unit.position, unit.type.sightRadius);
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < near.length; i++) {
      const other = near[i];
      if (!this._isHostile(other)) continue;
      let score = other.hp;
      if ((this.profile.resourceHarassBias ?? 0) > 0.45 && other.type.archetype === ARCHETYPE.WORKER) {
        score *= 0.45;
      }
      if (other.player?.isNeutralHostile && (this.profile.creepBias ?? 0) > 0.4) {
        score *= 0.8;
      }
      if (score < bestScore) { bestScore = score; best = other; }
    }
    if (!best) return null;

    // Stickiness: keep the current target unless the new pick is clearly lower.
    const cur = unit.attackTarget;
    if (cur && !cur.isDead && this._isHostile(cur)) {
      const dx = cur.position.x - unit.position.x;
      const dz = cur.position.z - unit.position.z;
      const inSight = dx * dx + dz * dz <= unit.type.sightRadius * unit.type.sightRadius;
      if (inSight && cur.hp <= bestScore * FOCUS_STICKINESS) return cur;
    }
    return best;
  }

  /**
   * Nearest hostile MELEE unit within `radius`. Consumes shared scratch fully.
   * @returns {import('../../entities/Unit.js').Unit|null}
   */
  _nearestHostileMelee(unit, radius) {
    const near = this.engine.entities.getUnitsInRadius(unit.position, radius);
    let best = null;
    let bestSq = Infinity;
    for (let i = 0; i < near.length; i++) {
      const other = near[i];
      if (other.type.archetype !== ARCHETYPE.MELEE) continue;
      if (!this._isHostile(other)) continue;
      const dx = other.position.x - unit.position.x;
      const dz = other.position.z - unit.position.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestSq) { bestSq = dSq; best = other; }
    }
    return best;
  }

  /** Step a ranged unit directly away from a threat (bounded to the map). */
  _kiteAway(unit, threat) {
    _away.set(unit.position.x - threat.position.x, 0, unit.position.z - threat.position.z);
    if (_away.lengthSq() < 1e-4) _away.set(1, 0, 0); // exactly overlapping — pick any dir
    _away.normalize().multiplyScalar(KITE_DISTANCE);
    _dest.set(unit.position.x + _away.x, 0, unit.position.z + _away.z);

    const bounds = this.engine.nexus.getBounds();
    if (_dest.x < bounds.minX) _dest.x = bounds.minX; else if (_dest.x > bounds.maxX) _dest.x = bounds.maxX;
    if (_dest.z < bounds.minZ) _dest.z = bounds.minZ; else if (_dest.z > bounds.maxZ) _dest.z = bounds.maxZ;

    unit.orderMove(_dest); // fresh internal copy — Unit copies the vector
  }

  /** A unit is "free" to take an objective if it isn't mid-fight. */
  _isFree(unit) {
    return (
      unit.state === UNIT_STATES.IDLE ||
      (unit.state === UNIT_STATES.ATTACK_MOVING && !unit.attackTarget)
    );
  }

  /** Hostility test from this player's perspective (neutral = not hostile). */
  _isHostile(entity) {
    const p = entity.player;
    if (!p || p === this.player) return false;
    return !this.player.isAlliedWith(p);
  }

  dispose() {
    this._objective = null;
    this.engine = null;
    this.player = null;
  }
}
