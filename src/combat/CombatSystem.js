/**
 * CombatSystem — global combat concerns that aren't per-unit.
 *
 * Two jobs:
 *   1. STAGGERED TARGET ACQUISITION. Instead of every idle unit calling
 *      findNearestEnemy every frame (O(n²) per frame), this sweeps a fraction
 *      of the unit list each frame (~1/ACQUIRE_SLICES of it), asking only
 *      IDLE / ATTACK_MOVING units to look for a fight. Amortized, every unit is
 *      re-checked a few times per second — plenty responsive, far cheaper.
 *   2. VICTORY DETECTION. `checkVictory()` (called by the engine on its
 *      interval) marks players with no units and no buildings as defeated,
 *      ends the match when only mutually-allied players remain, and pushes the
 *      local player's VICTORY/DEFEAT outcome into the HUD store.
 *
 * Per-unit combat (chasing, facing, swinging, projectile fire) lives in
 * Unit.update — this system only decides *who a resting unit should engage*.
 */
import { eventBus, EVENTS } from '../engine/EventBus.js';
import { UNIT_STATES } from '../entities/Unit.js';
import { useGameStore } from '../state/useGameStore.js';

/** Fraction of units re-checked for acquisition each frame (1/8 → ~7 fps/unit at 60). */
const ACQUIRE_SLICES = 8;

export class CombatSystem {
  /**
   * @param {import('../engine/GameEngine.js').GameEngine} engine
   */
  constructor(engine) {
    this.engine = engine;
    /** Rolling cursor into engine.entities.units for the staggered sweep. */
    this._sweepCursor = 0;
    /** Whether the match has already ended (guards duplicate MATCH_ENDED). */
    this._matchEnded = false;
  }

  /**
   * Staggered acquisition sweep. Processes ~1/ACQUIRE_SLICES of the unit list
   * per frame; each visited IDLE/ATTACK_MOVING unit looks for a nearby hostile.
   * @param {number} dt
   */
  update(dt) {
    void dt;
    const units = this.engine.entities.units;
    const n = units.length;
    if (n === 0) return;

    // How many to visit this frame (at least 1, at most the whole list).
    const count = Math.min(n, Math.max(1, Math.ceil(n / ACQUIRE_SLICES)));
    for (let k = 0; k < count; k++) {
      if (this._sweepCursor >= n) this._sweepCursor = 0;
      const unit = units[this._sweepCursor++];
      if (!unit || unit.isDead) continue;
      // Only resting/marching units auto-acquire; fighters already have a
      // target and workers/fleeing units are filtered inside tryAcquireTarget.
      if (unit.state === UNIT_STATES.IDLE || unit.state === UNIT_STATES.ATTACK_MOVING) {
        unit.tryAcquireTarget();
      }
    }
  }

  /**
   * Victory sweep, invoked by the engine every SIM.VICTORY_CHECK_INTERVAL.
   * Defeats emptied players and ends the match once the survivors are all
   * mutually allied.
   */
  checkVictory() {
    if (this._matchEnded) return;
    const engine = this.engine;
    const players = engine.players;

    // 1) Mark freshly-eliminated players (no units AND no buildings).
    for (const player of players) {
      if (player.isDefeated) continue;
      const hasUnits = this._playerHasUnits(player.id);
      const hasBuildings = this._playerHasBuildings(player.id);
      if (!hasUnits && !hasBuildings) {
        player.isDefeated = true;
        eventBus.emit(EVENTS.PLAYER_DEFEATED, { player });
      }
    }

    // 2) Are all survivors on the same side?
    const survivors = players.filter((p) => !p.isDefeated);
    if (survivors.length === 0) return; // draw (mutual annihilation) — leave running
    const allAllied = survivors.every((a) => survivors.every((b) => a === b || a.isAlliedWith(b)));
    if (!allAllied) return; // war continues

    // 3) Match over.
    this._matchEnded = true;
    const winners = survivors;
    const losers = players.filter((p) => p.isDefeated);
    eventBus.emit(EVENTS.MATCH_ENDED, { winners, losers });

    if (engine.isObserver) {
      useGameStore.getState().setMatchOutcome('OBSERVED');
      return;
    }
    const local = engine.localPlayer;
    const localWon = local && winners.includes(local);
    useGameStore.getState().setMatchOutcome(localWon ? 'VICTORY' : 'DEFEAT');
  }

  /** @private */
  _playerHasUnits(playerId) {
    const units = this.engine.entities.units;
    for (let i = 0; i < units.length; i++) {
      if (!units[i].isDead && units[i].playerId === playerId) return true;
    }
    return false;
  }

  /** @private */
  _playerHasBuildings(playerId) {
    const buildings = this.engine.entities.buildings;
    for (let i = 0; i < buildings.length; i++) {
      if (!buildings[i].isDead && buildings[i].playerId === playerId) return true;
    }
    return false;
  }

  dispose() {
    this._sweepCursor = 0;
    this._matchEnded = false;
  }
}
