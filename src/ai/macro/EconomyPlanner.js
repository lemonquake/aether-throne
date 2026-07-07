/**
 * EconomyPlanner — keeps an AI player's workers productively mining.
 *
 * Every macro think, `rebalance()` finds idle workers and assigns each to the
 * best resource node, honoring:
 *   - a target GOLD:AETHER worker ratio (per difficulty),
 *   - a per-node saturation cap (≤ WORKERS_PER_NODE) so they don't all pile on
 *     one mine,
 *   - nearest-node preference (shorter round trips = more income).
 *
 * It only ever *starts* idle workers gathering; a worker already on a gather
 * loop is left alone (re-pathing a busy worker every think would thrash it).
 */
import { ARCHETYPE } from '../../config/UnitTypes.js';
import { UNIT_STATES } from '../../entities/Unit.js';

/** Max workers assigned to a single resource node before it's "full". */
const WORKERS_PER_NODE = 5;

/** Per-difficulty share of workers targeted onto gold (rest go to aether). */
const GOLD_RATIO = {
  EASY: 0.7,
  MEDIUM: 0.65,
  INSANE: 0.6,
  NOOB: 0.7,
  CASUAL: 0.65,
  PRO: 0.6,
};

export class EconomyPlanner {
  /**
   * @param {import('../../engine/GameEngine.js').GameEngine} engine
   * @param {import('../../engine/Player.js').Player} player
   */
  constructor(engine, player) {
    this.engine = engine;
    this.player = player;
    /** Target fraction of workers on gold. */
    this.goldRatio = player.aiProfile?.goldRatio ?? GOLD_RATIO[player.difficulty] ?? 0.65;

    // Reused scratch so rebalance() allocates nothing per think.
    this._workers = [];
    this._saturation = new Map(); // node.id → assigned worker count
  }

  /**
   * Assign idle workers to nodes at the target gold:aether ratio.
   */
  rebalance() {
    const workers = this._collectWorkers();
    if (workers.length === 0) return;

    // Count current saturation + how many are already on each resource kind.
    this._saturation.clear();
    let onGold = 0;
    let onAether = 0;
    let idleCount = 0;
    for (let i = 0; i < workers.length; i++) {
      const w = workers[i];
      const node = w.gatherNode;
      if (node && !node.isDead) {
        this._saturation.set(node.id, (this._saturation.get(node.id) ?? 0) + 1);
        if (node.kind === 'GOLD_MINE') onGold++;
        else onAether++;
      } else if (this._isIdle(w)) {
        idleCount++;
      }
    }
    if (idleCount === 0) return;

    // Assign each idle worker to the kind that is under its target share.
    for (let i = 0; i < workers.length; i++) {
      const w = workers[i];
      if (!this._isIdle(w)) continue;
      const total = onGold + onAether;
      const goldShare = total > 0 ? onGold / total : 0;
      const wantGold = goldShare < this.goldRatio;
      const node = this._bestNode(w, wantGold ? 'GOLD_MINE' : 'AETHER_WELL')
        // Fall back to the other kind if the preferred one is unavailable/full.
        ?? this._bestNode(w, wantGold ? 'AETHER_WELL' : 'GOLD_MINE');
      if (!node) break; // no capacity anywhere — stop trying this think
      w.orderGather(node);
      this._saturation.set(node.id, (this._saturation.get(node.id) ?? 0) + 1);
      if (node.kind === 'GOLD_MINE') onGold++; else onAether++;
    }
  }

  /**
   * Current worker distribution — used by the MacroBrain for training targets.
   * @returns {{gold:number, aether:number, idle:number, total:number}}
   */
  workerCounts() {
    const workers = this._collectWorkers();
    let gold = 0;
    let aether = 0;
    let idle = 0;
    for (let i = 0; i < workers.length; i++) {
      const w = workers[i];
      const node = w.gatherNode;
      if (node && !node.isDead) {
        if (node.kind === 'GOLD_MINE') gold++; else aether++;
      } else if (this._isIdle(w)) {
        idle++;
      }
    }
    return { gold, aether, idle, total: workers.length };
  }

  /** @private Gather this player's living worker units into the reused array. */
  _collectWorkers() {
    this._workers.length = 0;
    const units = this.engine.entities.units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.isDead && u.player === this.player && u.type.archetype === ARCHETYPE.WORKER) {
        this._workers.push(u);
      }
    }
    return this._workers;
  }

  /** @private A worker counts as idle if it's resting and not carrying cargo. */
  _isIdle(worker) {
    return worker.state === UNIT_STATES.IDLE && !worker.carrying && !worker.gatherNode;
  }

  /**
   * Nearest non-full node of a kind (using the live saturation map).
   * @private
   */
  _bestNode(worker, kind) {
    const nodes = this.engine.entities.resources;
    const pos = worker.position;
    let best = null;
    let bestSq = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.isDead || n.kind !== kind || n.amount <= 0) continue;
      if ((this._saturation.get(n.id) ?? 0) >= WORKERS_PER_NODE) continue;
      const dx = n.position.x - pos.x;
      const dz = n.position.z - pos.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestSq) { bestSq = dSq; best = n; }
    }
    return best;
  }

  dispose() {
    this._workers.length = 0;
    this._saturation.clear();
    this.engine = null;
    this.player = null;
  }
}
