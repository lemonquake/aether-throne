/**
 * CommandSystem — turns right-clicks and hotkeys into unit orders.
 *
 * Behavior contract (ARCHITECTURE.md §5, extended for Phase 5+). With a
 * non-empty unit selection (always local-player units — SelectionSystem
 * guarantees it):
 *  - Right-CLICK issues a SMART command based on what's under the cursor:
 *      hostile unit/building → orderAttack(target) for everyone
 *      own damaged/unfinished building (workers selected) → orderRepair
 *      resource node         → workers orderGather(node); others move beside it
 *      own/allied entity     → move to its position
 *      bare ground           → formation move (per-unit slots)
 *  - With a production BUILDING selected (no units), a right-click on the ground
 *    sets that structure's rally point (trained units walk there).
 *  - A + click (right OR left) → orderAttackMove(groundPos) for everyone.
 *  - S key → orderStop() for everyone.
 *
 * RESPONSIVENESS: the smart right-click fires on pointer-DOWN (button 2), the
 * instant the button is pressed — not on release. This removes the press→release
 * latency and the old "the click didn't register" drops that came from a tiny
 * drag exceeding a pixel threshold on the way up. (Right-drag has no meaning in
 * this game, so there is nothing to lose by committing on down.)
 *
 * Ground-targeted commands flash a pooled world marker: MOVE spawns three
 * animated GREEN arrows pointing down at the destination; ATTACK spawns a RED
 * sword planted at the target. Markers are fully pooled — zero allocation per
 * click; the animation is a hand-rolled timer in update(dt).
 */
import * as THREE from 'three';
import { eventBus, EVENTS } from '../engine/EventBus.js';
import { ENTITY_CLASS, ARCHETYPE } from '../config/UnitTypes.js';
import { layout as formationLayout, FORMATIONS } from './FormationController.js';

/** How many markers of each kind can be alive at once (ring buffer). */
const MARKER_POOL_SIZE = 12;
/** Seconds a click marker takes to animate + fade out. */
const MARKER_DURATION = 0.65;
/** Spacing between per-unit targets in a formation move (world units). */
const FORMATION_SPACING = 1.5;
/** How far beside a resource node non-workers are sent (beyond node radius). */
const BESIDE_NODE_GAP = 1.2;

/** Marker colors (WC3-style: green = move/rally, red = attack). */
const MOVE_GREEN = 0x38e04b;
const ATTACK_RED = 0xe23b2e;

// ── Module-scope scratch objects ────────────────────────────────────────────
const _offset = new THREE.Vector3(); // formation-slot / beside-node offset scratch

export class CommandSystem {
  /**
   * @param {import('../engine/GameEngine.js').GameEngine} engine - Injected
   *        engine (never imported).
   */
  constructor(engine) {
    this.engine = engine;

    // ── Press-position tracking for the left drag-vs-click distinction ──
    this._leftDown = { active: false, x: 0, y: 0 };

    /**
     * Armed targeting mode from a command-card button:
     * 'attackmove' | 'rally' | 'repair' | null. The next left-click consumes it;
     * right-click / Esc cancels.
     */
    this._pendingMode = null;

    // ── Group formation ────────────────────────────────────────────────
    this._formationId = FORMATIONS.LOOSE;
    this._lastFormationCenter = new THREE.Vector3();
    this._hasLastFormation = false;

    // ── World marker pools (one per kind; each slot owns its material so
    //    opacity can animate independently) ─────────────────────────────
    /** @type {THREE.BufferGeometry[]} shared geometries (disposed once). */
    this._markerGeos = [];
    this._moveMarkers = this._buildMarkerPool('move');
    this._attackMarkers = this._buildMarkerPool('attack');
    this._moveCursor = 0;
    this._attackCursor = 0;

    // ── EventBus subscriptions (unsubscribers kept for dispose) ────────
    this._unsubs = [
      eventBus.on(EVENTS.POINTER_DOWN, (p) => this._onPointerDown(p)),
      eventBus.on(EVENTS.POINTER_UP, (p) => this._onPointerUp(p)),
      eventBus.on(EVENTS.KEY_DOWN, (p) => this._onKeyDown(p)),
    ];
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Per-frame update: animates active click markers. Touches at most
   * 2·MARKER_POOL_SIZE slots and allocates nothing.
   * @param {number} dt - Clamped frame delta in seconds.
   */
  update(dt) {
    this._animateMarkers(this._moveMarkers, dt, 'move');
    this._animateMarkers(this._attackMarkers, dt, 'attack');
  }

  /** Unsubscribe from the bus and free the marker pools' GPU resources. */
  dispose() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    for (const pool of [this._moveMarkers, this._attackMarkers]) {
      for (const slot of pool) {
        this.engine.scene.remove(slot.group);
        slot.material.dispose();
      }
    }
    this._moveMarkers = [];
    this._attackMarkers = [];
    for (const g of this._markerGeos) g.dispose();
    this._markerGeos = [];
  }

  /**
   * Arm a targeting mode from a command-card button. The next left-click
   * consumes it. Called via engine.ui (UICommandFacade).
   * @param {'attackmove'|'rally'|'repair'|null} mode
   */
  setPendingMode(mode) {
    if (this.engine.isObserver) return;
    this._pendingMode = mode;
  }

  /** @returns {string|null} the armed targeting mode, or null. */
  getPendingMode() {
    return this._pendingMode;
  }

  /** @returns {boolean} true while a targeting cursor is armed. */
  isTargeting() {
    return this._pendingMode !== null;
  }

  /**
   * Issue a command at a world point, used by the minimap (§3.4).
   * @param {number} x @param {number} z
   * @param {boolean} [attackMove=false]
   */
  issueAt(x, z, attackMove = false) {
    if (this.engine.isObserver || !this.engine.localPlayer) return;
    const units = this.engine.selection.getSelectedArray();
    if (units.length === 0) return;
    const groundY = this.engine.terrain ? this.engine.terrain.getHeightAt(x, z) : 0;
    const ground = new THREE.Vector3(x, groundY, z);
    if (attackMove) {
      for (const u of units) u.orderAttackMove(new THREE.Vector3(x, groundY, z));
      this._spawnMarker(ground, 'attack');
      this._emitCommand('ATTACK_MOVE', units, ground, 'attack');
    } else {
      this._formationMove(units, ground);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Pointer / key handling
  // ──────────────────────────────────────────────────────────────────────────

  /** @param {{button:number, ndc:{x:number,y:number}, screen:{x:number,y:number}}} p */
  _onPointerDown(p) {
    if (this.engine.isObserver || !this.engine.localPlayer) return;
    if (this.engine.placement?.active) return; // placement owns pointer input

    if (p.button === 2) {
      // A right-click cancels an armed targeting cursor instead of commanding.
      if (this._pendingMode) { this._pendingMode = null; return; }
      // Fire IMMEDIATELY on press — no wait for release, no drag threshold.
      if (this.engine.input.isKeyDown('KeyA')) {
        this._attackMove(p.ndc.x, p.ndc.y);
      } else {
        this._smartCommand(p.ndc.x, p.ndc.y);
      }
    } else if (p.button === 0) {
      // Left press is tracked so its RELEASE can tell a click from a drag
      // (armed targeting cursors commit on a clean left-click).
      this._leftDown.active = true;
      this._leftDown.x = p.screen.x;
      this._leftDown.y = p.screen.y;
    }
  }

  /** @param {{button:number, ndc:{x:number,y:number}, screen:{x:number,y:number}}} p */
  _onPointerUp(p) {
    if (this.engine.isObserver || !this.engine.localPlayer) return;
    if (this.engine.placement?.active) return; // placement owns pointer input
    if (p.button !== 0) return; // right-clicks already fired on POINTER_DOWN
    if (!this._leftDown.active) return;
    this._leftDown.active = false;
    // A left-DRAG is a marquee, not a targeting commit.
    if (this._dragDistance(this._leftDown, p.screen) > 6) return;

    // Consume an armed command-card targeting cursor.
    if (this._pendingMode === 'rally') {
      this._setRally(p.ndc.x, p.ndc.y);
      this._pendingMode = null;
      return;
    }
    if (this._pendingMode === 'repair') {
      this._setRepair(p.ndc.x, p.ndc.y);
      this._pendingMode = null;
      return;
    }
    if (this._pendingMode === 'attackmove' || this.engine.input.isKeyDown('KeyA')) {
      this._attackMove(p.ndc.x, p.ndc.y);
      this._pendingMode = null;
    }
  }

  /** @param {{code:string, ctrlKey:boolean, repeat:boolean}} p */
  _onKeyDown(p) {
    if (this.engine.isObserver || !this.engine.localPlayer) return;
    if (p.code === 'Escape') { this._pendingMode = null; return; }
    if (p.code !== 'KeyS' || p.repeat || p.ctrlKey) return;
    const units = this.engine.selection.getSelectedArray();
    if (units.length === 0) return;
    for (const unit of units) unit.orderStop();
    this._emitCommand('STOP', units, null, null);
  }

  /**
   * @param {{x:number,y:number}} down @param {{x:number,y:number}} up
   * @returns {number}
   */
  _dragDistance(down, up) {
    return Math.hypot(up.x - down.x, up.y - down.y);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Command dispatch
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * The smart right-click: inspect what's under the cursor and pick the
   * WC3-appropriate order for the whole selection.
   * @param {number} ndcX @param {number} ndcY
   */
  _smartCommand(ndcX, ndcY) {
    const units = this.engine.selection.getSelectedArray();

    // No units selected? A selected production building takes a rally point.
    if (units.length === 0) {
      const building = this.engine.selection.getSelectedBuilding?.();
      if (building) this._rallyToCursor(building, ndcX, ndcY);
      return;
    }

    const hit = this.engine.pickEntity(ndcX, ndcY);
    if (hit && !hit.isDead) {
      if (this._isHostile(hit)) {
        // ── Attack a specific enemy ────────────────────────────────────
        for (const unit of units) unit.orderAttack(hit);
        this._spawnMarker(hit.position, 'attack');
        this._emitCommand('ATTACK', units, hit, 'attack');
        return;
      }
      if (this._isOwnRepairable(hit) && this._anyWorker(units)) {
        // ── Repair an own damaged / unfinished structure ───────────────
        this._repairCommand(units, hit);
        return;
      }
      if (this._isResourceNode(hit)) {
        // ── Gather: workers harvest, fighters escort beside the node ──
        this._gatherCommand(units, hit);
        return;
      }
      // Own or allied entity under the cursor: plain move to its position.
      this._formationMove(units, hit.position);
      return;
    }

    // ── Bare ground: formation move ─────────────────────────────────────
    const ground = this.engine.raycastGround(ndcX, ndcY);
    if (!ground) return;
    this._formationMove(units, ground);
  }

  /**
   * A + click: attack-move everyone to the clicked ground point.
   * @param {number} ndcX @param {number} ndcY
   */
  _attackMove(ndcX, ndcY) {
    const units = this.engine.selection.getSelectedArray();
    if (units.length === 0) return;
    const ground = this.engine.raycastGround(ndcX, ndcY);
    if (!ground) return;

    for (const unit of units) {
      unit.orderAttackMove(new THREE.Vector3(ground.x, 0, ground.z));
    }
    this._spawnMarker(ground, 'attack');
    this._emitCommand('ATTACK_MOVE', units, new THREE.Vector3(ground.x, 0, ground.z), 'attack');
  }

  /**
   * Set the selected production building's rally point (armed rally cursor).
   * @param {number} ndcX @param {number} ndcY
   */
  _setRally(ndcX, ndcY) {
    const building = this.engine.selection.getSelectedBuilding();
    if (!building) return;
    this._rallyToCursor(building, ndcX, ndcY);
  }

  /**
   * Point a building's rally at whatever is under the cursor (an entity's
   * position, else the ground). Flashes a green marker.
   * @param {import('../entities/Building.js').Building} building
   * @param {number} ndcX @param {number} ndcY
   * @private
   */
  _rallyToCursor(building, ndcX, ndcY) {
    const hit = this.engine.pickEntity(ndcX, ndcY);
    let target = null;
    let targetEntity = null;
    if (hit && !hit.isDead && hit !== building) {
      target = hit.position;
      targetEntity = hit;
    } else {
      target = this.engine.raycastGround(ndcX, ndcY);
    }
    if (!target) return;
    building.setRallyPoint(target, targetEntity, { explicit: true });
    this._spawnMarker(target, 'move');
  }

  /**
   * Armed repair cursor (command-card Repair): repair the own building under the
   * cursor with the selected workers.
   * @param {number} ndcX @param {number} ndcY
   */
  _setRepair(ndcX, ndcY) {
    const units = this.engine.selection.getSelectedArray();
    if (units.length === 0) return;
    const hit = this.engine.pickEntity(ndcX, ndcY);
    if (hit && !hit.isDead && this._isOwnRepairable(hit)) {
      this._repairCommand(units, hit);
    }
  }

  /**
   * Send the selected workers to repair a building; escorts just move beside it.
   * @param {import('../entities/Unit.js').Unit[]} units
   * @param {import('../entities/Building.js').Building} building
   * @private
   */
  _repairCommand(units, building) {
    for (const unit of units) {
      if (unit.type.archetype === ARCHETYPE.WORKER) unit.orderRepair(building);
      else unit.orderMove(building.position);
    }
    this._spawnMarker(building.position, 'move');
    this._emitCommand('MOVE', units, building, 'move');
  }

  /**
   * Resource-node right-click: WORKER-archetype units gather; everyone else is
   * parked just beside the node.
   * @param {import('../entities/Unit.js').Unit[]} units
   * @param {import('../entities/ResourceNode.js').ResourceNode} node
   */
  _gatherCommand(units, node) {
    const nodeRadius = node.type?.radius ?? 1;
    for (const unit of units) {
      if (unit.type.archetype === ARCHETYPE.WORKER) {
        unit.orderGather(node);
      } else {
        _offset.copy(unit.position).sub(node.position);
        _offset.y = 0;
        if (_offset.lengthSq() < 1e-4) _offset.set(1, 0, 0);
        _offset.normalize().multiplyScalar(nodeRadius + BESIDE_NODE_GAP);
        const tx = node.position.x + _offset.x;
        const tz = node.position.z + _offset.z;
        const ty = this.engine.terrain ? this.engine.terrain.getHeightAt(tx, tz) : 0;
        unit.orderMove(
          new THREE.Vector3(tx, ty, tz),
        );
      }
    }
    this._spawnMarker(node.position, 'move');
    this._emitCommand('GATHER', units, node, 'move');
  }

  /**
   * Set the active group formation and re-form the current selection at the
   * last move point.
   * @param {string} formationId - One of FORMATIONS.
   */
  setFormation(formationId) {
    this._formationId = formationId;
    if (!this._hasLastFormation) return;
    const units = this.engine.selection.getSelectedArray();
    if (units.length > 0) this._formationMove(units, this._lastFormationCenter);
  }

  /**
   * Ground move with per-unit formation targets from FormationController.
   * @param {import('../entities/Unit.js').Unit[]} units
   * @param {THREE.Vector3} center - Clicked ground point (not retained).
   */
  _formationMove(units, center) {
    this._lastFormationCenter.copy(center);
    this._hasLastFormation = true;
    const targets = formationLayout(units, center, this._formationId, FORMATION_SPACING);
    for (let i = 0; i < units.length; i++) {
      const t = targets[i];
      const ty = this.engine.terrain ? this.engine.terrain.getHeightAt(t.x, t.z) : 0;
      units[i].orderMove(new THREE.Vector3(t.x, ty, t.z));
    }
    this._spawnMarker(center, 'move');
    this._emitCommand('MOVE', units, new THREE.Vector3(center.x, center.y, center.z), 'move');
  }

  /**
   * Shared dispatch tail: COMMAND_ISSUED event + unit voice response.
   * @param {'MOVE'|'ATTACK'|'ATTACK_MOVE'|'GATHER'|'STOP'} type
   * @param {import('../entities/Unit.js').Unit[]} units
   * @param {*} target
   * @param {'move'|'attack'|null} audioKind
   */
  _emitCommand(type, units, target, audioKind) {
    eventBus.emit(EVENTS.COMMAND_ISSUED, {
      type,
      unitIds: units.map((u) => u.id),
      target,
    });
    if (audioKind && units.length > 0) {
      this.engine.audio.playUnitResponse(units[0].type.id, audioKind);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Target classification
  // ──────────────────────────────────────────────────────────────────────────

  /** @param {import('../entities/Entity.js').Entity} entity @returns {boolean} */
  _isHostile(entity) {
    const local = this.engine.localPlayer;
    if (!local) return false;
    if (!entity.player || entity.player === local) return false;
    if (local.isAlliedWith(entity.player)) return false;
    const cls = entity.type?.class;
    return cls === ENTITY_CLASS.UNIT || cls === ENTITY_CLASS.BUILDING;
  }

  /** @param {import('../entities/Entity.js').Entity} entity @returns {boolean} */
  _isResourceNode(entity) {
    return typeof entity.harvest === 'function' || entity.type?.class === 'RESOURCE';
  }

  /**
   * Own/allied building that wants repair (hurt) or is still under construction.
   * @param {import('../entities/Entity.js').Entity} entity @returns {boolean}
   */
  _isOwnRepairable(entity) {
    const local = this.engine.localPlayer;
    if (!local) return false;
    if (!entity.player || entity.type?.class !== ENTITY_CLASS.BUILDING) return false;
    if (entity.player !== local && !local.isAlliedWith(entity.player)) return false;
    return entity.hp < entity.maxHp || entity.constructionRemaining > 0;
  }

  /** @param {import('../entities/Unit.js').Unit[]} units @returns {boolean} */
  _anyWorker(units) {
    for (const u of units) if (u.type.archetype === ARCHETYPE.WORKER) return true;
    return false;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // World markers (pooled): green arrows for MOVE, red sword for ATTACK
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Build a pool of marker slots of one kind.
   * @param {'move'|'attack'} kind
   * @returns {Array<{group:THREE.Group, material:THREE.MeshBasicMaterial,
   *   parts:THREE.Object3D[], ttl:number}>}
   * @private
   */
  _buildMarkerPool(kind) {
    const pool = [];
    for (let i = 0; i < MARKER_POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: kind === 'attack' ? ATTACK_RED : MOVE_GREEN,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false, // always readable, even under a unit standing on it
        side: THREE.DoubleSide,
      });
      const group = kind === 'attack'
        ? this._makeSwordMarker(material)
        : this._makeArrowsMarker(material);
      group.visible = false;
      group.renderOrder = 6;
      this.engine.scene.add(group);
      pool.push({ group, material, parts: group.children, ttl: 0 });
    }
    return pool;
  }

  /**
   * Three green arrows pointing down toward the ground, arranged in a triangle.
   * @param {THREE.Material} material @returns {THREE.Group}
   * @private
   */
  _makeArrowsMarker(material) {
    // A 4-sided pyramid = a chunky arrowhead; apex points DOWN (rx = π).
    let geo = this._arrowGeo;
    if (!geo) {
      geo = new THREE.ConeGeometry(0.24, 0.5, 4);
      this._arrowGeo = geo;
      this._markerGeos.push(geo);
    }
    const group = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      const arrow = new THREE.Mesh(geo, material);
      arrow.position.set(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7);
      arrow.rotation.x = Math.PI; // apex points down at the ground
      group.add(arrow);
    }
    return group;
  }

  /**
   * A red sword planted blade-down at the target.
   * @param {THREE.Material} material @returns {THREE.Group}
   * @private
   */
  _makeSwordMarker(material) {
    let blade = this._swordBladeGeo;
    let guard = this._swordGuardGeo;
    let grip = this._swordGripGeo;
    if (!blade) {
      blade = new THREE.BoxGeometry(0.14, 1.0, 0.05);
      guard = new THREE.BoxGeometry(0.6, 0.14, 0.14);
      grip = new THREE.BoxGeometry(0.12, 0.34, 0.12);
      this._swordBladeGeo = blade; this._swordGuardGeo = guard; this._swordGripGeo = grip;
      this._markerGeos.push(blade, guard, grip);
    }
    const group = new THREE.Group();
    group.add(new THREE.Mesh(blade, material));                 // blade (centered ~y0.5..1.5)
    const g = new THREE.Mesh(guard, material); g.position.y = 0.58; group.add(g);
    const h = new THREE.Mesh(grip, material); h.position.y = 0.8; group.add(h);
    // Lift so the blade tip sits just above the ground, hilt up.
    group.position.y = 0.5;
    return group;
  }

  /**
   * Flash a pooled marker of `kind` at a world position.
   * @param {THREE.Vector3} pos @param {'move'|'attack'} kind
   * @private
   */
  _spawnMarker(pos, kind) {
    const attack = kind === 'attack';
    const pool = attack ? this._attackMarkers : this._moveMarkers;
    const idx = attack ? this._attackCursor : this._moveCursor;
    if (attack) this._attackCursor = (idx + 1) % pool.length;
    else this._moveCursor = (idx + 1) % pool.length;

    const slot = pool[idx];
    slot.baseY = pos.y;
    slot.group.position.set(pos.x, pos.y + (attack ? 0.5 : 0.08), pos.z);
    slot.material.opacity = 0.95;
    slot.group.visible = true;
    slot.ttl = MARKER_DURATION;
    // Reset any per-part transforms the animation applied.
    if (!attack) {
      for (const part of slot.parts) part.position.y = 0;
    } else {
      slot.group.scale.setScalar(1);
      slot.group.position.y = pos.y + 0.5;
    }
  }

  /**
   * Animate a marker pool: MOVE arrows bob downward + fade; the ATTACK sword
   * drives into the ground with a quick pulse + fade. Allocation-free.
   * @param {Array} pool @param {number} dt @param {'move'|'attack'} kind
   * @private
   */
  _animateMarkers(pool, dt, kind) {
    for (let i = 0; i < pool.length; i++) {
      const slot = pool[i];
      if (slot.ttl <= 0) continue;
      slot.ttl -= dt;
      if (slot.ttl <= 0) {
        slot.ttl = 0;
        slot.group.visible = false;
        continue;
      }
      const t = slot.ttl / MARKER_DURATION; // 1 → 0 over life
      slot.material.opacity = 0.95 * t;
      if (kind === 'move') {
        // Arrows bob down toward the ground (reads as "land here"), looping
        // twice across the marker's life.
        const bob = Math.abs(Math.sin((1 - t) * Math.PI * 2)) * 0.35;
        for (const part of slot.parts) part.position.y = 0.45 - bob;
      } else {
        // Sword slams down slightly and pulses wider as it lands.
        slot.group.position.y = slot.baseY + 0.5 - (1 - t) * 0.12;
        const pulse = 1 + (1 - t) * 0.25;
        slot.group.scale.set(pulse, 1, pulse);
      }
    }
  }
}
