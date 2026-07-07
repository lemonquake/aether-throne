/**
 * UICommandFacade — the ONE sanctioned channel for HUD → engine intent
 * (PHASE5_PROMPT.md §3.8). The React command card can reach the engine only
 * through `GameBootstrap.getEngine()`; this facade gives it a small, auditable
 * verb set instead of poking simulation internals. Exposed as `engine.ui`.
 *
 * Every method operates on the engine's CURRENT selection state, so the HUD
 * never has to pass entity references across the React↔engine boundary.
 */
import * as THREE from 'three';
import { ARCHETYPE, getUnitType } from '../config/UnitTypes.js';
import { satisfiesRequirement } from '../config/TechTree.js';
import { eventBus, EVENTS } from './EventBus.js';

export class UICommandFacade {
  /**
   * @param {import('./GameEngine.js').GameEngine} engine
   */
  constructor(engine) {
    this.engine = engine;
  }

  /** @returns {import('../entities/Unit.js').Unit[]} the live unit selection. */
  _units() {
    if (this.engine.isObserver) return [];
    return this.engine.selection.getSelectedArray();
  }

  /**
   * Queue a unit at the selected production building. Affordability + the
   * spoken "Not enough X" feedback are handled inside Building.queueUnit.
   * @param {string} typeId
   */
  train(typeId) {
    if (this.engine.isObserver) return;
    const building = this.engine.selection.getSelectedBuilding();
    if (building) building.queueUnit(typeId);
  }

  /**
   * Queue an upgrade/research at the selected building.
   * @param {string} upgradeId
   */
  research(upgradeId) {
    if (this.engine.isObserver) return;
    const building = this.engine.selection.getSelectedBuilding();
    if (building) building.queueResearch(upgradeId);
  }

  /**
   * Cancel (and refund) a queued unit at the selected building.
   * @param {number} slotIndex
   */
  cancelQueueSlot(slotIndex) {
    if (this.engine.isObserver) return;
    const building = this.engine.selection.getSelectedBuilding();
    if (building) building.cancelQueueSlot(slotIndex);
  }

  /**
   * Enter building-placement mode for a structure, using the first selected
   * worker as the builder. No-op if no worker is selected.
   * @param {string} typeId
   */
  beginBuild(typeId) {
    if (this.engine.isObserver) return;
    const workers = this._units().filter(
      (u) => !u.isDead && u.type.archetype === ARCHETYPE.WORKER,
    );
    const worker = workers[0];
    if (!worker) return;

    // Check requirements
    const player = worker.player;
    if (player) {
      const type = getUnitType(typeId);
      if (type.requires && type.requires.length > 0) {
        const em = this.engine.entities;
        for (const reqId of type.requires) {
          const ok = em.buildings.some(
            (b) => b.player === player && satisfiesRequirement(reqId, b.type.id) && !b.isUnderConstruction && !b.isDead
          );
          if (!ok) {
            if (player.isLocal) {
              const reqName = getUnitType(reqId).name;
              eventBus.emit(EVENTS.COMMAND_REJECTED, {
                player,
                reason: 'REQUIREMENTS',
                reqName,
                isUpgradeRequirement: false
              });
            }
            return;
          }
        }
      }
    }

    this.engine.placement.beginPlacement(typeId, workers);
  }

  /** Arm targeting so the next left-click sets the selected building's rally. */
  setRallyMode() {
    if (this.engine.isObserver) return;
    this.engine.commands.setPendingMode('rally');
  }

  /** Arm attack-move targeting (next left-click issues an attack-move). */
  attackMode() {
    if (this.engine.isObserver) return;
    this.engine.commands.setPendingMode('attackmove');
  }

  /** Arm repair targeting (next left-click on an own building repairs it). */
  repairMode() {
    if (this.engine.isObserver) return;
    this.engine.commands.setPendingMode('repair');
  }

  /**
   * One-key harvest: send every selected worker to the NEAREST live node of a
   * resource kind (each finds its own closest source).
   * @param {'GOLD_MINE'|'AETHER_WELL'} kind
   */
  gatherNearest(kind) {
    for (const u of this._units()) u.orderGatherNearest?.(kind);
  }

  /**
   * Set the active group movement formation (PHASE5_PROMPT.md §3.10).
   * @param {string} formationId - One of FormationController.FORMATIONS.
   */
  setFormation(formationId) {
    if (this.engine.isObserver) return;
    this.engine.commands.setFormation(formationId);
  }

  /**
   * Pan the camera to a world point (minimap left-click, §3.4).
   * @param {number} x @param {number} z
   */
  panCameraTo(x, z) {
    this.engine.cameraController.panTo(new THREE.Vector3(x, 0, z));
  }

  /**
   * Issue a move / attack-move at a world point (minimap right-click, §3.4).
   * @param {number} x @param {number} z @param {boolean} [attackMove=false]
   */
  minimapCommand(x, z, attackMove = false) {
    if (this.engine.isObserver) return;
    this.engine.commands.issueAt(x, z, attackMove);
  }

  /** Immediate: stop every selected unit. */
  stop() {
    for (const u of this._units()) u.orderStop();
  }

  /** Immediate: hold position — stand ground and strike in-range enemies without chasing. */
  hold() {
    for (const u of this._units()) u.orderHold();
  }

  /**
   * Dispatch a basic-command slot by its action id.
   * @param {'attack'|'stop'|'hold'|'rally'|'repair'|'gathergold'|'gatheraether'} action
   */
  runBasic(action) {
    switch (action) {
      case 'attack': this.attackMode(); break;
      case 'stop': this.stop(); break;
      case 'hold': this.hold(); break;
      case 'rally': this.setRallyMode(); break;
      case 'repair': this.repairMode(); break;
      case 'gathergold': this.gatherNearest('GOLD_MINE'); break;
      case 'gatheraether': this.gatherNearest('AETHER_WELL'); break;
      default: break;
    }
  }
}
