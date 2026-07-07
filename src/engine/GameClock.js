/**
 * GameClock — the single source of truth for frame timing.
 *
 * The whole simulation is driven by the clamped delta this returns: no system
 * calls `performance.now()` itself, so pausing, tab-hiding, or a GC hitch can
 * never teleport units across the map (a 4-second stall becomes one MAX_DELTA
 * step, not a 4-second lurch).
 *
 * `elapsed` is the authoritative *game time* (seconds since the clock started)
 * that every timing-sensitive system reads via `engine.gameTime`. `fps` is an
 * exponentially-smoothed estimate for the HUD's debug corner.
 */
import { GAME_CONFIG } from '../config/GameConfig.js';

/** Smoothing factor for the fps estimate (higher = snappier, noisier). */
const FPS_SMOOTHING = 0.1;

export class GameClock {
  constructor() {
    /** @type {number} Wall-clock timestamp (seconds) of the previous tick. */
    this._last = performance.now() / 1000;
    /** @type {number} Accumulated game time in seconds. */
    this.elapsed = 0;
    /** @type {number} Exponentially-smoothed frames per second. */
    this.fps = 60;
    /** Cached clamp ceiling so a hitch never advances the sim by a huge dt. */
    this._maxDelta = GAME_CONFIG.SIM.MAX_DELTA;
  }

  /**
   * Advance the clock by one frame.
   * @returns {number} The clamped delta time in seconds (0..MAX_DELTA).
   */
  tick() {
    const now = performance.now() / 1000;
    let dt = now - this._last;
    this._last = now;

    // Clamp: a background tab or a long stall must not produce a giant step.
    if (dt > this._maxDelta) dt = this._maxDelta;
    if (dt < 0) dt = 0; // guard against a non-monotonic clock

    this.elapsed += dt;
    if (dt > 0) {
      const instantaneous = 1 / dt;
      this.fps += (instantaneous - this.fps) * FPS_SMOOTHING;
    }
    return dt;
  }

  /** Reset to a fresh match (elapsed 0, clock re-based to now). */
  reset() {
    this._last = performance.now() / 1000;
    this.elapsed = 0;
    this.fps = 60;
  }
}
