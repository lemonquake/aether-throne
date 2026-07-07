/**
 * CorpseManager — plays a short death/collapse animation for a slain entity's
 * *visual model*, then removes it. This is what gives units a proper WC3-style
 * death (topple over, rest, sink into the ground) and buildings a collapse,
 * instead of the mesh vanishing the instant hp hits 0.
 *
 * Memory contract (the "clean slate on death" requirement):
 *  - EntityManager hands us ONLY the detached model group (the body). The rest
 *    of the entity — YUKA vehicle, Rapier body, health bar, selection ring,
 *    cargo cube, id-index entry — is fully torn down synchronously by
 *    EntityManager.remove, so nothing simulation-side lingers.
 *  - The model's geometries and materials are SHARED module caches (ModelFactory
 *    / ResourceNode), so we never dispose them here — that would corrupt living
 *    entities. When a corpse finishes we simply `scene.remove` its group and
 *    drop the reference; the per-entity THREE.Mesh wrappers are then GC-able.
 *  - The number of simultaneous corpses is hard-capped (FX.CORPSE_POOL); a new
 *    death past the cap force-reaps the oldest corpse immediately. So a 200-unit
 *    bloodbath can never grow an unbounded corpse pile.
 *
 * No allocation in update(); the only per-corpse allocation is the small record
 * object at spawn (death rate, not frame rate) — and it is released on reap.
 */
import * as THREE from 'three';
import { GAME_CONFIG } from '../config/GameConfig.js';

const FX = GAME_CONFIG.FX;

/** Corpse lifecycle phases. */
const PHASE = { FALL: 0, LINGER: 1, SINK: 2 };

export class CorpseManager {
  /**
   * @param {import('../engine/GameEngine.js').GameEngine} engine - Injected engine.
   */
  constructor(engine) {
    this.engine = engine;
    /** @type {Array<object>} Active corpse records (oldest first). */
    this._corpses = [];
    /** Deterministic spread counter (avoids Math.random — every corpse topples
     *  a slightly different way without RNG). */
    this._seq = 0;
  }

  /**
   * Take ownership of a detached model group and animate its death.
   * @param {THREE.Object3D} group - The entity's body model (already removed
   *   from its parent; local origin at the feet/base, y-up).
   * @param {THREE.Vector3} worldPos - Where the entity fell.
   * @param {number} yaw - The entity's facing at death (radians).
   * @param {{ kind?: 'unit'|'building', sink?: number }} [opts]
   */
  add(group, worldPos, yaw, opts = {}) {
    if (!group) return;
    const kind = opts.kind ?? 'unit';

    // Reparent to the scene at the death location, preserving facing.
    group.position.set(worldPos.x, worldPos.y, worldPos.z);
    group.rotation.set(0, yaw, 0);
    group.scale.setScalar(group.scale.x || 1); // keep any existing uniform scale
    this.engine.scene.add(group);

    const n = this._seq++;
    const record = {
      group,
      kind,
      phase: kind === 'building' ? PHASE.SINK : PHASE.FALL,
      timer: 0,
      baseY: worldPos.y,
      baseScale: group.scale.x || 1,
      // Topple: alternate pitch/roll sign and mix so no two adjacent corpses
      // fall identically. Units fall pivoting at their feet.
      fallPitch: (n % 2 === 0 ? 1 : -1) * (Math.PI * 0.48),
      fallRoll: (((n >> 1) % 3) - 1) * 0.32,
      fallTime: kind === 'building' ? 0 : FX.CORPSE_FALL_TIME,
      linger: FX.CORPSE_LINGER,
      sinkTime: opts.sink ?? (kind === 'building' ? FX.RUBBLE_SINK_TIME : FX.CORPSE_SINK_TIME),
    };

    // Cap the pile: force-reap the oldest corpse if we're over budget.
    if (this._corpses.length >= FX.CORPSE_POOL) {
      this._finalize(this._corpses.shift());
    }
    this._corpses.push(record);
  }

  /**
   * Advance every corpse's animation; reap finished ones. Allocation-free.
   * @param {number} dt - Clamped frame delta (seconds).
   */
  update(dt) {
    const list = this._corpses;
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      c.timer += dt;
      switch (c.phase) {
        case PHASE.FALL: {
          const t = Math.min(1, c.timer / c.fallTime);
          // Ease-out topple around the feet; a tiny downward settle as it lands.
          const e = 1 - (1 - t) * (1 - t);
          c.group.rotation.x = c.fallPitch * e;
          c.group.rotation.z = c.fallRoll * e;
          c.group.position.y = c.baseY - 0.05 * e;
          if (t >= 1) { c.phase = PHASE.LINGER; c.timer = 0; }
          break;
        }
        case PHASE.LINGER:
          if (c.timer >= c.linger) { c.phase = PHASE.SINK; c.timer = 0; }
          break;
        case PHASE.SINK: {
          const t = Math.min(1, c.timer / c.sinkTime);
          // Sink into the ground and shrink slightly so it reads as "fading".
          const drop = c.kind === 'building' ? 4.5 : 1.6;
          c.group.position.y = c.baseY - drop * t;
          c.group.scale.setScalar(c.baseScale * (1 - 0.25 * t));
          if (t >= 1) {
            this._finalize(c);
            list.splice(i, 1);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  /**
   * Remove a corpse group from the scene and drop the reference. Shared
   * geometries/materials are intentionally NOT disposed (owned by the caches).
   * @param {object} record
   * @private
   */
  _finalize(record) {
    if (!record || !record.group) return;
    this.engine.scene.remove(record.group);
    record.group = null;
  }

  /** Reap every outstanding corpse (match teardown). */
  dispose() {
    for (const c of this._corpses) this._finalize(c);
    this._corpses.length = 0;
    this.engine = null;
  }
}
