/**
 * EntityManager — the registry and lifecycle owner for every battlefield
 * entity (units, buildings, resource nodes).
 *
 * Responsibilities:
 *   - spawn helpers that also wire scene membership, supply accounting, and
 *     lifecycle events,
 *   - fast-enough spatial/ownership queries for combat + AI (linear scans over
 *     a few hundred entities, routed through a shared scratch array so the hot
 *     ones allocate nothing),
 *   - deferred reaping: dead entities are collected at the END of update() so a
 *     unit dying mid-iteration never corrupts the arrays other systems walk.
 *
 * Alliance rule (single source of truth): entity A is hostile to B iff they
 * have different owners AND neither is allied with the other (FFA ⇒ everyone
 * hostile). Neutral entities (player == null) are never hostile.
 */
import * as THREE from 'three';
import { Unit } from './Unit.js';
import { Building } from './Building.js';
import { ResourceNode } from './ResourceNode.js';
import { getUnitType } from '../config/UnitTypes.js';
import { eventBus, EVENTS } from '../engine/EventBus.js';

/** Shared scratch array for getUnitsInRadius (see class docblock caveats). */
const _radiusScratch = [];

export class EntityManager {
  /**
   * @param {import('../engine/GameEngine.js').GameEngine} engine
   */
  constructor(engine) {
    this.engine = engine;
    /** @type {Unit[]} */
    this.units = [];
    /** @type {Building[]} */
    this.buildings = [];
    /** @type {ResourceNode[]} */
    this.resources = [];
    /** @type {import('./Entity.js').Entity[]} Every entity, for picking/updates. */
    this.all = [];
    /** id → entity index for O(1) lookup. @type {Map<number, object>} */
    this._byId = new Map();
    /** Reused list of dead entities to reap at end of update. @private */
    this._dead = [];
  }

  // ── Spawning ────────────────────────────────────────────────────────────────

  /**
   * Spawn a unit, add it to the scene, and charge its supply to the owner.
   * @param {string} typeId
   * @param {import('../engine/Player.js').Player} player
   * @param {THREE.Vector3} position
   * @returns {Unit}
   */
  spawnUnit(typeId, player, position) {
    const type = getUnitType(typeId);
    const unit = new Unit(this.engine, type, player, position);
    this.units.push(unit);
    this._register(unit);
    if (player) player.addSupplyUsed(type.cost.supply ?? 0);
    eventBus.emit(EVENTS.UNIT_SPAWNED, { entity: unit });
    return unit;
  }

  /**
   * Spawn a building.
   * @param {string} typeId
   * @param {import('../engine/Player.js').Player} player
   * @param {THREE.Vector3} position
   * @param {{instant?: boolean}} [opts]
   * @returns {Building}
   */
  spawnBuilding(typeId, player, position, opts = {}) {
    const type = getUnitType(typeId);
    const building = new Building(this.engine, type, player, position, opts);
    this.buildings.push(building);
    this._register(building);
    eventBus.emit(EVENTS.BUILDING_PLACED, { entity: building });
    return building;
  }

  /**
   * Spawn a neutral resource node.
   * @param {'GOLD_MINE'|'AETHER_WELL'} kind
   * @param {THREE.Vector3} position
   * @returns {ResourceNode}
   */
  spawnResourceNode(kind, position) {
    const node = new ResourceNode(this.engine, kind, position);
    this.resources.push(node);
    this._register(node);
    return node;
  }

  /** @private Add to the `all` list + scene + id index. */
  _register(entity) {
    this.all.push(entity);
    this._byId.set(entity.id, entity);
    if (this.engine?.scene) this.engine.scene.add(entity.mesh);
  }

  // ── Removal / reaping ────────────────────────────────────────────────────────

  /**
   * Fully remove an entity: detach mesh, unwind physics/navigation, drop from
   * every list, and dispose it. Safe to call on an already-removed entity.
   * @param {import('./Entity.js').Entity} entity
   * @param {boolean} [animateCorpse=false] - When true (a battlefield death,
   *   not match teardown), hand the entity's body model to the CorpseManager
   *   for a topple/collapse-and-sink animation before it's gone.
   */
  remove(entity, animateCorpse = false) {
    if (!entity || !this._byId.has(entity.id)) return;
    this._byId.delete(entity.id);

    // Death animation: relinquish the visual model to the corpse manager BEFORE
    // detaching the mesh (so scene.remove(mesh) below doesn't take it with it).
    // Everything else about the entity is still torn down synchronously here.
    if (animateCorpse && this.engine?.corpses && typeof entity.takeDeathModel === 'function') {
      const model = entity.takeDeathModel();
      if (model) {
        const kind = entity instanceof Building ? 'building' : 'unit';
        this.engine.corpses.add(model, entity.position, entity.mesh.rotation.y, { kind });
      }
    }

    // Scene detach.
    if (this.engine?.scene) this.engine.scene.remove(entity.mesh);

    // Subsystem cleanup by kind.
    if (entity instanceof Unit) {
      if (this.engine?.navigation) this.engine.navigation.removeVehicle(entity.vehicle);
      if (this.engine?.physics) this.engine.physics.unregisterUnit(entity);
    } else if (entity._staticCollider && this.engine?.physics) {
      this.engine.physics.removeCollider(entity._staticCollider);
      entity._staticCollider = null;
    }

    // Drop from the type list + master list (swap-pop for O(1)).
    this._removeFrom(this.all, entity);
    if (entity instanceof Unit) this._removeFrom(this.units, entity);
    else if (entity instanceof Building) this._removeFrom(this.buildings, entity);
    else if (entity instanceof ResourceNode) this._removeFrom(this.resources, entity);

    entity.dispose();
  }

  /** @private swap-pop removal (order-agnostic; nothing depends on order). */
  _removeFrom(arr, entity) {
    const i = arr.indexOf(entity);
    if (i >= 0) {
      arr[i] = arr[arr.length - 1];
      arr.pop();
    }
  }

  // ── Queries ──────────────────────────────────────────────────────────────────

  /**
   * @param {number} id
   * @returns {import('./Entity.js').Entity|undefined}
   */
  getById(id) {
    return this._byId.get(id);
  }

  /**
   * Units within `radius` of a point. Returns a SHARED scratch array — consume
   * it before issuing another spatial query, and never retain it across frames.
   * @param {THREE.Vector3} pos
   * @param {number} radius
   * @param {(u: Unit) => boolean} [predicate]
   * @returns {Unit[]}
   */
  getUnitsInRadius(pos, radius, predicate) {
    _radiusScratch.length = 0;
    const rSq = radius * radius;
    const units = this.units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.isDead) continue;
      const dx = u.position.x - pos.x;
      const dz = u.position.z - pos.z;
      if (dx * dx + dz * dz > rSq) continue;
      if (predicate && !predicate(u)) continue;
      _radiusScratch.push(u);
    }
    return _radiusScratch;
  }

  /**
   * Nearest hostile unit or building within `maxDist` of an entity. Units are
   * scanned first, then buildings, sharing one distance bound so the single
   * globally-nearest hostile wins regardless of kind.
   * @param {import('./Entity.js').Entity} entity
   * @param {number} maxDist
   * @returns {Unit|Building|null}
   */
  findNearestEnemy(entity, maxDist) {
    const owner = entity.player;
    if (!owner) return null; // ownerless map props never acquire targets

    // Mutable "best so far" carried across both list scans.
    this._nnBest = null;
    this._nnBestSq = maxDist * maxDist;
    this._scanHostile(this.units, entity, owner);
    this._scanHostile(this.buildings, entity, owner);
    return this._nnBest;
  }

  /**
   * @private Scan a list for hostiles closer than the running best, updating
   * `_nnBest`/`_nnBestSq` in place. One shared hostility test for both kinds.
   */
  _scanHostile(list, self, owner) {
    const from = self.position;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e === self || e.isDead || !e.player) continue;
      if (e.player === owner || owner.isAlliedWith(e.player)) continue;
      const dx = e.position.x - from.x;
      const dz = e.position.z - from.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < this._nnBestSq) {
        this._nnBestSq = dSq;
        this._nnBest = e;
      }
    }
  }

  /**
   * All living units owned by a player. Returns a FRESH array (safe to retain
   * for the duration of a tick — callers iterate it while calling queries that
   * use the shared scratch).
   * @param {number} playerId
   * @returns {Unit[]}
   */
  getPlayerUnits(playerId) {
    const out = [];
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (!u.isDead && u.playerId === playerId) out.push(u);
    }
    return out;
  }

  /**
   * All living buildings owned by a player. Fresh array.
   * @param {number} playerId
   * @returns {Building[]}
   */
  getPlayerBuildings(playerId) {
    const out = [];
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (!b.isDead && b.playerId === playerId) out.push(b);
    }
    return out;
  }

  // ── Per-frame update ─────────────────────────────────────────────────────────

  /**
   * Update every entity, then reap the dead in one deferred pass.
   * @param {number} dt
   */
  update(dt) {
    const all = this.all;
    for (let i = 0; i < all.length; i++) {
      const e = all[i];
      if (!e.isDead) e.update(dt);
    }
    // Deferred reap — collect first, remove after (remove() mutates `all`).
    // These are battlefield deaths, so animate the corpse/collapse on the way out.
    this._dead.length = 0;
    for (let i = 0; i < all.length; i++) {
      if (all[i].isDead) this._dead.push(all[i]);
    }
    for (let i = 0; i < this._dead.length; i++) this.remove(this._dead[i], true);
    this._dead.length = 0;
  }

  /** Remove and dispose every entity (match teardown). */
  dispose() {
    // Copy first — remove() mutates the arrays we'd be iterating.
    const snapshot = this.all.slice();
    for (let i = 0; i < snapshot.length; i++) this.remove(snapshot[i]);
    this.units.length = 0;
    this.buildings.length = 0;
    this.resources.length = 0;
    this.all.length = 0;
    this._byId.clear();
    this._dead.length = 0;
  }
}
