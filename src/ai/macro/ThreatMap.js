/**
 * ThreatMap — a coarse, decaying grid of observed enemy strength.
 *
 * Each AI player owns one ThreatMap. It divides the map into a 16×16 grid;
 * every update it stamps the combat power (CombatEvaluator.unitPower) of
 * enemy entities into the cell they occupy, then lets old information fade
 * away with an exponential half-life. The result is a cheap "heat map" the
 * MacroBrain can query for decisions like:
 *
 *   - DEFEND:  is the threat near my base bigger than my home army?
 *   - EXPAND:  is the candidate expansion spot quiet?
 *   - ASSAULT: where is the enemy strongest / weakest?
 *
 * Fairness model:
 *   - `profile.omniscient` (INSANE) → stamps every enemy on the map (a
 *     deliberate, documented cheat that makes the top difficulty terrifying).
 *   - fair profiles (EASY/MEDIUM)  → only stamp enemies that are currently
 *     within `sightRadius` of at least one of THIS player's own units or
 *     buildings, i.e. the AI plays with the same information a human has.
 *
 * Magnitude contract: cell values are directly comparable to
 * CombatEvaluator.armyPower(...) results. To keep that true, fresh
 * observations REPLACE (max) the decayed value rather than accumulate — a
 * grunt watched for 30 seconds is still one grunt, not six.
 *
 * Update cadence: the owning MacroBrain calls update() once per macro think.
 * All timekeeping uses engine.gameTime (never Date.now()).
 */
import * as THREE from 'three';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { unitPower } from '../micro/CombatEvaluator.js';

/** Grid resolution per side (16×16 = 256 cells over the whole map). */
const GRID_SIZE = 16;

/** Seconds for a stale observation to lose half its weight. */
const DECAY_HALF_LIFE = 8;

/** Cells below this value are snapped to 0 (keeps the grid tidy/queryable). */
const CELL_EPSILON = 0.01;

/** Buildings are a base marker, not an army — stamp them at half weight. */
const BUILDING_WEIGHT = 0.5;

/** hottestCell() ignores cells cooler than this (noise floor). */
const HOT_THRESHOLD = 5;

export class ThreatMap {
  /**
   * @param {object} engine - Injected engine reference (entities, gameTime).
   * @param {import('../../engine/Player.js').Player} player - The owning AI player.
   * @param {object} profile - AI_PROFILES entry (reads `omniscient`).
   */
  constructor(engine, player, profile) {
    this.engine = engine;
    this.player = player;
    this.profile = profile;

    const { WIDTH, DEPTH } = GAME_CONFIG.MAP;
    /** @type {number} World-units width/depth of one grid cell. */
    this._cellW = WIDTH / GRID_SIZE;
    this._cellD = DEPTH / GRID_SIZE;
    /** Map origin is the center, so world x ∈ [-W/2, W/2]. */
    this._minX = -WIDTH / 2;
    this._minZ = -DEPTH / 2;

    /** Persistent decayed threat, one float per cell (row-major z*GRID+x). */
    this._cells = new Float32Array(GRID_SIZE * GRID_SIZE);
    /** Scratch grid for THIS update's fresh observations (zeroed each pass). */
    this._stamp = new Float32Array(GRID_SIZE * GRID_SIZE);

    /** gameTime of the previous update (drives the decay factor). */
    this._lastUpdate = engine.gameTime ?? 0;

    // Reused flat arrays for the fair-vision pass (own entity positions +
    // squared sight radii). Plain arrays reused across updates → no churn.
    this._srcX = [];
    this._srcZ = [];
    this._srcSightSq = [];
  }

  /**
   * Decay old intel, then stamp currently-observed enemy power into the grid.
   * Called by the owning MacroBrain once per macro think.
   */
  update() {
    if (!this._cells) return; // disposed

    const now = this.engine.gameTime ?? 0;
    const elapsed = Math.max(0, now - this._lastUpdate);
    this._lastUpdate = now;

    // 1) Exponential decay of everything we previously believed.
    if (elapsed > 0) {
      const factor = Math.pow(0.5, elapsed / DECAY_HALF_LIFE);
      const cells = this._cells;
      for (let i = 0; i < cells.length; i++) {
        const v = cells[i] * factor;
        cells[i] = v < CELL_EPSILON ? 0 : v;
      }
    }

    // 2) Collect fresh observations into the scratch grid.
    this._stamp.fill(0);
    const omniscient = !!this.profile.omniscient;
    let sources = 0;
    if (!omniscient) sources = this._collectVisionSources();

    const entities = this.engine.entities;
    this._stampGroup(entities.units, 1, omniscient, sources);
    this._stampGroup(entities.buildings, BUILDING_WEIGHT, omniscient, sources);

    // 3) Merge: fresh observation REPLACES the decayed memory (max, not sum),
    //    so threat magnitudes stay comparable to armyPower() and repeated
    //    sightings of the same army don't inflate.
    const cells = this._cells;
    const stamp = this._stamp;
    for (let i = 0; i < cells.length; i++) {
      if (stamp[i] > cells[i]) cells[i] = stamp[i];
    }
  }

  /**
   * Gather this player's live entities as vision sources into the reused
   * flat arrays. Returns the number of sources collected.
   * @returns {number}
   * @private
   */
  _collectVisionSources() {
    const { units, buildings } = this.engine.entities;
    let n = 0;
    // Manual index writes into reused arrays — they grow once then stabilize.
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.isDead || u.player !== this.player) continue;
      this._srcX[n] = u.position.x;
      this._srcZ[n] = u.position.z;
      this._srcSightSq[n] = u.type.sightRadius * u.type.sightRadius;
      n++;
    }
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.isDead || b.player !== this.player) continue;
      this._srcX[n] = b.position.x;
      this._srcZ[n] = b.position.z;
      this._srcSightSq[n] = b.type.sightRadius * b.type.sightRadius;
      n++;
    }
    return n;
  }

  /**
   * Stamp every hostile entity in `list` into the scratch grid.
   * @param {Array} list - engine.entities.units or .buildings.
   * @param {number} weight - Power multiplier (buildings count for less).
   * @param {boolean} omniscient - Skip the visibility test entirely.
   * @param {number} sourceCount - Number of valid vision sources collected.
   * @private
   */
  _stampGroup(list, weight, omniscient, sourceCount) {
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.isDead || !e.player) continue; // neutral entities are never threats
      if (e.player === this.player || this.player.isAlliedWith(e.player)) continue;

      const ex = e.position.x;
      const ez = e.position.z;

      // Fair profiles: only stamp what our own entities can actually see.
      if (!omniscient && !this._isSeen(ex, ez, sourceCount)) continue;

      this._stamp[this._indexFor(ex, ez)] += unitPower(e) * weight;
    }
  }

  /**
   * True if (x, z) is within sightRadius of any collected vision source.
   * Early-exits on the first hit — cheap for typical entity counts.
   * @private
   */
  _isSeen(x, z, sourceCount) {
    for (let i = 0; i < sourceCount; i++) {
      const dx = x - this._srcX[i];
      const dz = z - this._srcZ[i];
      if (dx * dx + dz * dz <= this._srcSightSq[i]) return true;
    }
    return false;
  }

  /**
   * Grid index for a world position (clamped to the map).
   * @private
   */
  _indexFor(x, z) {
    let gx = Math.floor((x - this._minX) / this._cellW);
    let gz = Math.floor((z - this._minZ) / this._cellD);
    if (gx < 0) gx = 0; else if (gx >= GRID_SIZE) gx = GRID_SIZE - 1;
    if (gz < 0) gz = 0; else if (gz >= GRID_SIZE) gz = GRID_SIZE - 1;
    return gz * GRID_SIZE + gx;
  }

  /**
   * Threat value of the single cell containing a world position.
   * @param {THREE.Vector3} worldPos
   * @returns {number}
   */
  threatAt(worldPos) {
    if (!this._cells) return 0;
    return this._cells[this._indexFor(worldPos.x, worldPos.z)];
  }

  /**
   * Total threat within `radius` of a world position — sums every cell whose
   * CENTER lies inside the circle. 256 cells → trivially cheap to scan.
   * @param {THREE.Vector3} worldPos
   * @param {number} [radius=30]
   * @returns {number}
   */
  threatNear(worldPos, radius = 30) {
    if (!this._cells) return 0;
    const rSq = radius * radius;
    let total = 0;
    for (let gz = 0; gz < GRID_SIZE; gz++) {
      const cz = this._minZ + (gz + 0.5) * this._cellD;
      const dz = cz - worldPos.z;
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const v = this._cells[gz * GRID_SIZE + gx];
        if (v === 0) continue;
        const cx = this._minX + (gx + 0.5) * this._cellW;
        const dx = cx - worldPos.x;
        if (dx * dx + dz * dz <= rSq) total += v;
      }
    }
    return total;
  }

  /**
   * The single hottest cell on the map, or null if everything is quiet.
   * Allocates a fresh Vector3 — this is only called at macro think rate,
   * never per frame.
   * @returns {{position: THREE.Vector3, threat: number} | null}
   */
  hottestCell() {
    if (!this._cells) return null;
    let best = -1;
    let bestValue = HOT_THRESHOLD;
    for (let i = 0; i < this._cells.length; i++) {
      if (this._cells[i] > bestValue) {
        bestValue = this._cells[i];
        best = i;
      }
    }
    if (best < 0) return null;
    const gx = best % GRID_SIZE;
    const gz = Math.floor(best / GRID_SIZE);
    return {
      position: new THREE.Vector3(
        this._minX + (gx + 0.5) * this._cellW,
        0,
        this._minZ + (gz + 0.5) * this._cellD
      ),
      threat: bestValue,
    };
  }

  /** Release grid memory and break engine references. */
  dispose() {
    this._cells = null;
    this._stamp = null;
    this._srcX.length = 0;
    this._srcZ.length = 0;
    this._srcSightSq.length = 0;
    this.engine = null;
  }
}
