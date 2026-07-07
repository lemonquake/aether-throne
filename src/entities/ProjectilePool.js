/**
 * ProjectilePool — a fixed ring of Projectile slots shared by every ranged
 * unit in the match. `fire()` grabs the next free slot (or steals the oldest
 * if the pool is saturated), so combat NEVER allocates a projectile at runtime.
 *
 * The pool owns the update loop for all bolts: one linear pass per frame over
 * at most POOL_SIZE slots, touching only the active ones.
 */
import { GAME_CONFIG } from '../config/GameConfig.js';
import { Projectile } from './Projectile.js';

export class ProjectilePool {
  /**
   * @param {import('three').Scene} scene - Scene the bolt meshes live in.
   * @param {number} [size] - Pool capacity (shared across all ranged units).
   */
  constructor(scene, size = GAME_CONFIG.COMBAT.PROJECTILE_POOL_SIZE) {
    /** @type {Projectile[]} All slots, pre-created up front. */
    this._slots = new Array(size);
    for (let i = 0; i < size; i++) this._slots[i] = new Projectile(scene);
    /** Ring cursor — where the next fire() search begins. */
    this._cursor = 0;
  }

  /**
   * Launch a homing bolt. If every slot is busy, the oldest (cursor) slot is
   * reused — a dropped bolt in a 256-strong pool is imperceptible and keeps
   * the allocation guarantee absolute.
   * @param {object} cfg - { source, target, speed, rawDamage, attackType, color, from? }
   */
  fire(cfg) {
    if (!cfg || !cfg.target || cfg.target.isDead) return;
    const slot = this._acquire();
    slot.launch(cfg);
  }

  /**
   * Advance every active bolt. Inactive slots are skipped cheaply.
   * @param {number} dt
   */
  update(dt) {
    const slots = this._slots;
    for (let i = 0; i < slots.length; i++) {
      const p = slots[i];
      if (p.active) p.update(dt);
    }
  }

  /**
   * Find a free slot, or steal the slot at the ring cursor.
   * @returns {Projectile}
   * @private
   */
  _acquire() {
    const slots = this._slots;
    const n = slots.length;
    // One scan from the cursor for a free slot.
    for (let k = 0; k < n; k++) {
      const idx = (this._cursor + k) % n;
      if (!slots[idx].active) {
        this._cursor = (idx + 1) % n;
        return slots[idx];
      }
    }
    // Saturated: reuse the cursor slot (oldest by construction).
    const idx = this._cursor;
    this._cursor = (idx + 1) % n;
    return slots[idx];
  }

  /** Dispose every slot's GPU resources. */
  dispose() {
    for (const p of this._slots) p.dispose();
    this._slots.length = 0;
  }
}
