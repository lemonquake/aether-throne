/**
 * PlacementController — WC3-style building placement mode (PHASE5_PROMPT.md
 * §3.9). Choosing a structure from a worker's command card arms this: a
 * translucent blueprint ghost follows the cursor, tinted green where valid and
 * red where blocked (out of bounds / overlapping a building or resource node).
 * Left-click commits (spends resources, spawns the constructing building, sends
 * the worker over); right-click or Esc cancels. Exposed as `engine.placement`.
 *
 * While `active`, this controller owns pointer input: SelectionSystem and
 * CommandSystem both early-return on `engine.placement.active`, so a placement
 * click never also selects units or issues a move order.
 */
import * as THREE from 'three';
import { getUnitType } from '../config/UnitTypes.js';
import { eventBus, EVENTS } from '../engine/EventBus.js';

/** Clearance (world units) kept between a new building and existing obstacles. */
const CLEARANCE = 1.5;

export class PlacementController {
  /**
   * @param {import('../engine/GameEngine.js').GameEngine} engine
   */
  constructor(engine) {
    this.engine = engine;

    this._active = false;
    this._typeId = null;
    /** @type {import('../entities/Unit.js').Unit[]} Workers who will build. */
    this._workers = [];
    this._valid = false;
    /** @type {THREE.Mesh|null} The blueprint ghost (rebuilt per placement). */
    this._ghost = null;

    // Shared ghost materials (valid/invalid tints), created once.
    this._validMat = new THREE.MeshBasicMaterial({
      color: 0x58d68d, transparent: true, opacity: 0.4, depthWrite: false,
    });
    this._invalidMat = new THREE.MeshBasicMaterial({
      color: 0xe05555, transparent: true, opacity: 0.4, depthWrite: false,
    });

    this._unsubs = [
      eventBus.on(EVENTS.POINTER_UP, (p) => this._onPointerUp(p)),
      eventBus.on(EVENTS.KEY_DOWN, (p) => this._onKeyDown(p)),
    ];
  }

  /** @returns {boolean} true while a blueprint is being positioned. */
  get active() {
    return this._active;
  }

  /**
   * Enter placement mode for a structure type.
   * @param {string} typeId - Building UnitTypes id.
   * @param {import('../entities/Unit.js').Unit|import('../entities/Unit.js').Unit[]} workers - The builders.
   */
  beginPlacement(typeId, workers) {
    this.cancel(); // clear any prior blueprint first
    const type = getUnitType(typeId);
    this._typeId = typeId;
    this._workers = Array.isArray(workers) ? workers.filter(Boolean) : workers ? [workers] : [];

    // Ghost footprint mirrors Building's box (side/height from radius).
    const side = type.radius * 1.6;
    const height = type.radius * 1.4;
    const geo = new THREE.BoxGeometry(side, height, side);
    geo.translate(0, height / 2, 0); // base at y=0
    this._ghost = new THREE.Mesh(geo, this._validMat);
    this._ghost.renderOrder = 2;
    this.engine.scene.add(this._ghost);
    this._active = true;
  }

  /**
   * Per-frame: track the cursor, snap the ghost to the ground, and recolor by
   * validity. Cheap; runs only while active.
   * @param {number} dt
   */
  update(dt) {
    void dt;
    if (!this._active || !this._ghost) return;
    const ndc = this.engine.input.pointerNDC;
    const g = this.engine.raycastGround(ndc.x, ndc.y);
    if (!g) {
      this._ghost.visible = false;
      return;
    }
    this._ghost.visible = true;
    this._ghost.position.set(g.x, g.y, g.z);
    this._valid = this._isValidSpot(g, getUnitType(this._typeId));
    this._ghost.material = this._valid ? this._validMat : this._invalidMat;
  }

  /**
   * Is `pos` a legal build site (in bounds, clear of buildings/resources)?
   * @param {THREE.Vector3} pos @param {object} type
   * @returns {boolean}
   * @private
   */
  _isValidSpot(pos, type) {
    const b = this.engine.terrain.getBounds();
    if (pos.x < b.minX || pos.x > b.maxX || pos.z < b.minZ || pos.z > b.maxZ) return false;
    const r = type.radius;
    for (const bld of this.engine.entities.buildings) {
      if (bld.isDead) continue;
      const dx = bld.position.x - pos.x;
      const dz = bld.position.z - pos.z;
      const min = r + bld.type.radius + CLEARANCE;
      if (dx * dx + dz * dz < min * min) return false;
    }
    for (const nd of this.engine.entities.resources) {
      if (nd.isDead) continue;
      const dx = nd.position.x - pos.x;
      const dz = nd.position.z - pos.z;
      const min = r + (nd.type?.radius ?? 1) + CLEARANCE;
      if (dx * dx + dz * dz < min * min) return false;
    }
    return true;
  }

  /**
   * Commit at the clicked ground point (re-validated for click precision).
   * @param {number} ndcX @param {number} ndcY
   * @private
   */
  _commit(ndcX, ndcY) {
    const g = this.engine.raycastGround(ndcX, ndcY);
    const type = getUnitType(this._typeId);
    if (!g || !this._isValidSpot(g, type)) return; // invalid click → stay armed

    const player = this.engine.localPlayer;
    const shortfall = player.affordShortfall({ gold: type.cost.gold, aether: type.cost.aether });
    if (shortfall) {
      eventBus.emit(EVENTS.COMMAND_REJECTED, { player, reason: shortfall });
      return; // stay armed so the player can wait for resources or cancel
    }
    player.spend({ gold: type.cost.gold, aether: type.cost.aether });

    const pos = new THREE.Vector3(g.x, g.y, g.z);
    const building = this.engine.entities.spawnBuilding(this._typeId, player, pos);
    for (const worker of this._workers) {
      if (worker && !worker.isDead) worker.orderRepair(building);
    }
    this.cancel();
  }

  /** Abandon placement: remove + dispose the ghost, disarm. */
  cancel() {
    if (this._ghost) {
      this.engine.scene.remove(this._ghost);
      this._ghost.geometry.dispose();
      this._ghost = null;
    }
    this._active = false;
    this._typeId = null;
    this._workers = [];
    this._valid = false;
  }

  /** @param {{button:number, ndc:{x:number,y:number}}} p @private */
  _onPointerUp(p) {
    if (!this._active) return;
    if (p.button === 0) this._commit(p.ndc.x, p.ndc.y);
    else if (p.button === 2) this.cancel();
  }

  /** @param {{code:string}} p @private */
  _onKeyDown(p) {
    if (p.code === 'Escape' && this._active) this.cancel();
  }

  /** Detach subscriptions and free GPU resources. */
  dispose() {
    for (const off of this._unsubs) off();
    this._unsubs = [];
    this.cancel();
    this._validMat.dispose();
    this._invalidMat.dispose();
    this.engine = null;
  }
}
