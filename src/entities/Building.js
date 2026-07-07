/**
 * Building — a stationary, producing Entity (town hall, barracks, supply).
 *
 * Lifecycle:
 *   1. Spawned (optionally `instant`) → enters a *scaffold* state while
 *      `constructionRemaining > 0` (a squat, growing box; no production).
 *   2. On completion → applies its `providesSupply`, emits BUILDING_COMPLETE,
 *      and can train units from a small production queue.
 *
 * Production: units train one at a time (WC3-style), the front of
 * `productionQueue` counting down its `buildTime`. On completion the unit is
 * spawned at the building's edge and ordered to walk to the rally point.
 *
 * A static box collider is registered at spawn (so even a scaffold blocks
 * pathing) and removed when the building dies.
 */
import * as THREE from 'three';
import { Entity } from './Entity.js';
import { getUnitType, ARCHETYPE } from '../config/UnitTypes.js';
import { getUpgradeType } from '../config/Upgrades.js';
import {
  canProduce,
  canResearch,
  getUpgradeRequirements,
  satisfiesRequirement,
} from '../config/TechTree.js';
import { eventBus, EVENTS } from '../engine/EventBus.js';
import { buildBuildingModel } from '../world/ModelFactory.js';
import { createHealthBar } from '../fx/HealthBar.js';
import { createFireEffect } from '../fx/FireEffect.js';

/** Max simultaneously queued units per building. */
const MAX_QUEUE = 5;
/** Minimum scaffold height fraction (so a just-started building is visible). */
const SCAFFOLD_MIN = 0.18;
/** HP fraction below which a completed structure catches fire until repaired. */
const FIRE_THRESHOLD = 0.4;
/** Seconds a hit-shake decays over. */
const SHAKE_TIME = 0.32;

// ── Rally-flag shared GPU resources (pole + pennant; material per owner) ─────
let _rfPoleGeo = null;
let _rfFlagGeo = null;
let _rfPoleMat = null;
const _rfMatCache = new Map();
function rallyPoleGeo() {
  if (!_rfPoleGeo) _rfPoleGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.7, 6).translate(0, 0.85, 0);
  return _rfPoleGeo;
}
function rallyFlagGeo() {
  if (!_rfFlagGeo) { _rfFlagGeo = new THREE.PlaneGeometry(0.55, 0.34); _rfFlagGeo.translate(0.275, 1.45, 0); }
  return _rfFlagGeo;
}
function rallyPoleMat() {
  if (!_rfPoleMat) _rfPoleMat = new THREE.MeshStandardMaterial({ color: 0x6b5535, roughness: 0.85, metalness: 0.1 });
  return _rfPoleMat;
}
function rallyFlagMat(hex) {
  let m = _rfMatCache.get(hex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.05, emissive: new THREE.Color(hex).multiplyScalar(0.2) });
    _rfMatCache.set(hex, m);
  }
  return m;
}

export class Building extends Entity {
  /**
   * @param {import('../engine/GameEngine.js').GameEngine} engine
   * @param {object} type - Frozen UnitTypes building entry.
   * @param {import('../engine/Player.js').Player} player
   * @param {THREE.Vector3} position
   * @param {{instant?: boolean}} [opts] - instant → skip construction time.
   */
  constructor(engine, type, player, position, opts = {}) {
    super(engine, type, player, position);

    /** @type {number} Seconds of construction left (0 = finished). */
    this.constructionRemaining = opts.instant ? 0 : type.buildTime;
    /** True once a player command explicitly set this rally point. */
    this.rallyExplicit = false;
    /** Entity id/kind the rally was set on, when applicable. */
    this.rallyTargetId = null;
    this.rallyTargetKind = null;
    /** @type {Array<{typeId:string, remaining:number}>} FIFO production queue. */
    this.productionQueue = [];
    /** @type {THREE.Vector3} Where trained units gather. Defaults in front of the hall. */
    this.rallyPoint = new THREE.Vector3(position.x, 0, position.z + type.radius + 2);

    // ── Visual body ──────────────────────────────────────────────────
    // A full faction-specific structure (castle keep / obsidian spire / basalt
    // forge) assembled from primitives. See world/ModelFactory.js.
    const colorHex = player ? player.colorHex : '#888888';
    const { group: model, height: modelHeight } = buildBuildingModel(type, colorHex);
    /** @type {THREE.Group} The building model; scaled on Y during construction. */
    this._body = model;
    
    /** Animatable banner meshes (cloth). @type {Array<THREE.Mesh>} */
    this._banners = [];
    /** Animatable core crystals. @type {Array<THREE.Mesh>} */
    this._cores = [];
    /** Animatable volcanic vents / magma pools. @type {Array<THREE.Mesh>} */
    this._lavaVents = [];
    
    this._body.traverse((child) => {
      if (child.name === 'banner') {
        const cloth = child.getObjectByName('cloth');
        if (cloth) this._banners.push(cloth);
      } else if (child.name === 'core') {
        this._cores.push(child);
      } else if (child.name === 'lavaVent') {
        this._lavaVents.push(child);
      }
    });

    this.mesh.add(model);
    this._applyScaffoldScale();

    /** Floating HP bar (green, 2D screen-facing). Shown when damaged or selected.
     *  Not scaled with the scaffold — it hovers at the finished roofline.
     *  @type {object} */
    this._healthBar = createHealthBar(type.radius * 1.6, modelHeight + 0.5, { construction: true });
    this.mesh.add(this._healthBar.group);

    // ── Rally-point flag (shown while the building is selected) ──────────
    this._rallyFlag = new THREE.Group();
    this._rallyFlag.add(new THREE.Mesh(rallyPoleGeo(), rallyPoleMat()));
    this._rallyFlag.add(new THREE.Mesh(rallyFlagGeo(), rallyFlagMat(colorHex)));
    this._rallyFlag.visible = false;
    this.mesh.add(this._rallyFlag);
    this._positionRallyFlag();

    // ── Static collider (blocks pathing from the moment it's placed) ──
    this._staticCollider = engine.physics
      ? engine.physics.addStaticBox(
          { x: this.position.x, y: type.radius * 0.7, z: this.position.z },
          { x: type.radius, y: 1.5, z: type.radius }
        )
      : null;

    /** Live fire/smoke plume while below FIRE_THRESHOLD; null otherwise. @private */
    this._fire = null;
    /** Model height, kept so the fire plume can be re-seated. @private */
    this._modelHeight = modelHeight;
    /** Remaining hit-shake time (seconds); jitters the body on damage. @private */
    this._shake = 0;

    // If it started finished (e.g. the match-start hall), complete now so its
    // supply is granted and it can produce immediately.
    this._completed = false;
    if (this.constructionRemaining <= 0) this._completeConstruction(true);
  }

  /** @returns {boolean} True while still under construction. */
  get isUnderConstruction() {
    return this.constructionRemaining > 0;
  }

  get constructionProgress() {
    if (this.type.buildTime <= 0) return 1;
    return 1 - Math.max(0, this.constructionRemaining) / this.type.buildTime;
  }

  /**
   * Check if all tech requirements for training a unit / building a structure are met.
   * @param {string} typeId
   * @returns {boolean}
   */
  checkRequirements(typeId) {
    if (!this.player) return false;
    const type = getUnitType(typeId);
    if (!type.requires || type.requires.length === 0) return true;
    const em = this.engine?.entities;
    if (!em) return true;
    for (const reqId of type.requires) {
      const ok = em.buildings.some(
        (b) => b.player === this.player && satisfiesRequirement(reqId, b.type.id) && !b.isUnderConstruction && !b.isDead
      );
      if (!ok) return false;
    }
    return true;
  }

  /**
   * Fire a blocked-purchase notice to the HUD/audio for the local player only.
   * Centralizes the "why did nothing happen?" feedback so no purchase path can
   * fail silently (a full queue or an unfinished building now say so).
   * @param {string} reason - One of GOLD/AETHER/SUPPLY/QUEUE_FULL/CONSTRUCTING/PRODUCER.
   * @private
   */
  _rejectFeedback(reason) {
    if (this.player?.isLocal) {
      eventBus.emit(EVENTS.COMMAND_REJECTED, { player: this.player, reason });
    }
  }

  /**
   * Queue a unit for production. Validates cost + supply headroom (including
   * units already queued here) and spends gold/aether immediately.
   * @param {string} typeId - UnitTypes id to train.
   * @returns {boolean} true if queued.
   */
  queueUnit(typeId) {
    if (this.isDead) return false;
    if (this.isUnderConstruction) { this._rejectFeedback('CONSTRUCTING'); return false; }
    if (this.productionQueue.length >= MAX_QUEUE) { this._rejectFeedback('QUEUE_FULL'); return false; }
    if (!this.player) return false;
    if (!canProduce(this.type.id, typeId)) { this._rejectFeedback('PRODUCER'); return false; }

    // Check requirements
    if (!this.checkRequirements(typeId)) {
      if (this.player.isLocal) {
        const type = getUnitType(typeId);
        let reqName = '';
        const em = this.engine?.entities;
        if (type.requires && em) {
          for (const reqId of type.requires) {
            const ok = em.buildings.some(
              (b) => b.player === this.player && satisfiesRequirement(reqId, b.type.id) && !b.isUnderConstruction && !b.isDead
            );
            if (!ok) {
              reqName = getUnitType(reqId).name;
              break;
            }
          }
        }
        eventBus.emit(EVENTS.COMMAND_REJECTED, {
          player: this.player,
          reason: 'REQUIREMENTS',
          reqName,
          isUpgradeRequirement: false
        });
      }
      return false;
    }

    const type = getUnitType(typeId);
    // Account for the supply of units already waiting in this queue.
    let queuedSupply = 0;
    for (const q of this.productionQueue) {
      if (!q.isUpgrade) queuedSupply += getUnitType(q.typeId).cost.supply;
    }

    const cost = {
      gold: type.cost.gold,
      aether: type.cost.aether,
      supply: type.cost.supply + queuedSupply,
    };
    const shortfall = this.player.affordShortfall(cost);
    if (shortfall) {
      // Spoken/visual "Not enough X" feedback is fired for the local player only.
      if (this.player.isLocal) {
        eventBus.emit(EVENTS.COMMAND_REJECTED, { player: this.player, reason: shortfall });
      }
      return false;
    }
    // Spend gold/aether now; supply is occupied when the unit actually spawns.
    this.player.spend({ gold: cost.gold, aether: cost.aether });
    this.productionQueue.push({ typeId, remaining: type.buildTime });
    return true;
  }

  /**
   * Queue an upgrade/research.
   * @param {string} upgradeId
   * @returns {boolean}
   */
  queueResearch(upgradeId) {
    if (this.isDead) return false;
    if (this.isUnderConstruction) { this._rejectFeedback('CONSTRUCTING'); return false; }
    if (this.productionQueue.length >= MAX_QUEUE) { this._rejectFeedback('QUEUE_FULL'); return false; }
    if (!this.player) return false;
    if (!canResearch(this.type.id, upgradeId)) { this._rejectFeedback('PRODUCER'); return false; }

    // Verify upgrade not already researched or in progress
    if (this.player.hasUpgrade(upgradeId)) return false;
    const inProgress = this.productionQueue.some((q) => q.isUpgrade && q.upgradeId === upgradeId);
    if (inProgress) return false;

    // Check requirements
    const reqs = getUpgradeRequirements(upgradeId);
    const em = this.engine?.entities;
    for (const req of reqs) {
      let met = false;
      if (req.type === 'upgrade') {
        met = this.player.hasUpgrade(req.id);
      } else if (req.type === 'building' && em) {
        met = em.buildings.some(
          (b) => b.player === this.player && satisfiesRequirement(req.id, b.type.id) && !b.isUnderConstruction && !b.isDead
        );
      }
      if (!met) {
        if (this.player.isLocal) {
          const reqName = req.type === 'upgrade' ? getUpgradeType(req.id).name : getUnitType(req.id).name;
          eventBus.emit(EVENTS.COMMAND_REJECTED, {
            player: this.player,
            reason: 'REQUIREMENTS',
            reqName,
            isUpgradeRequirement: req.type === 'upgrade'
          });
        }
        return false;
      }
    }

    const up = getUpgradeType(upgradeId);
    const cost = { gold: up.cost.gold, aether: up.cost.aether, supply: 0 };
    const shortfall = this.player.affordShortfall(cost);
    if (shortfall) {
      if (this.player.isLocal) {
        eventBus.emit(EVENTS.COMMAND_REJECTED, { player: this.player, reason: shortfall });
      }
      return false;
    }

    this.player.spend(cost);
    this.productionQueue.push({ upgradeId, remaining: up.buildTime, isUpgrade: true });
    return true;
  }

  /**
   * Cancel a queued unit or research and refund its gold/aether.
   * @param {number} index - Position in productionQueue.
   * @returns {boolean} true if a slot was cancelled.
   */
  cancelQueueSlot(index) {
    if (index < 0 || index >= this.productionQueue.length) return false;
    const q = this.productionQueue[index];
    if (this.player) {
      if (q.isUpgrade) {
        const up = getUpgradeType(q.upgradeId);
        this.player.deposit({ gold: up.cost.gold, aether: up.cost.aether });
      } else {
        const t = getUnitType(q.typeId);
        this.player.deposit({ gold: t.cost.gold, aether: t.cost.aether });
      }
    }
    this.productionQueue.splice(index, 1);
    return true;
  }

  /**
   * A worker advances this scaffold's construction. No effect once finished.
   * @param {number} seconds - Extra construction time to shave this frame.
   */
  assistConstruction(seconds) {
    if (this.constructionRemaining <= 0) return;
    this.constructionRemaining = Math.max(0, this.constructionRemaining - seconds);
    this._applyScaffoldScale();
    if (this.constructionRemaining <= 0) {
      this.constructionRemaining = 0;
      this._completeConstruction(false);
    }
  }

  /**
   * A worker heals this (completed) building. Clamped to maxHp.
   * @param {number} hpAmount - Hit points to restore this frame.
   */
  applyRepair(hpAmount) {
    if (this.isDead) return;
    this.hp = Math.min(this.maxHp, this.hp + hpAmount);
  }

  /**
   * Set the rally point new units walk to after training.
   * @param {THREE.Vector3} pos
   */
  setRallyPoint(pos, targetEntity = null, opts = {}) {
    const ry = this.engine?.terrain ? this.engine.terrain.getHeightAt(pos.x, pos.z) : 0;
    this.rallyPoint.set(pos.x, ry, pos.z);
    this.rallyExplicit = opts.explicit ?? true;
    this.rallyTargetId = targetEntity?.id ?? null;
    this.rallyTargetKind = targetEntity?.kind ?? targetEntity?.type?.class ?? null;
    this._positionRallyFlag();
  }

  /** Place the rally flag at the rally point in building-local space. @private */
  _positionRallyFlag() {
    if (!this._rallyFlag) return;
    this._rallyFlag.position.set(
      this.rallyPoint.x - this.position.x,
      this.rallyPoint.y - this.position.y,
      this.rallyPoint.z - this.position.z,
    );
  }

  /**
   * Advance construction, then production.
   * @param {number} dt
   */
  update(dt) {
    if (this.isDead) return;

    // HP bar: ALWAYS shown for structures (WC3-style constant readout).
    // Screen-facing billboard (no mana row for buildings).
    this._healthBar.update(
      this.hpFraction, 0, true,
      this.engine.camera, this.mesh.quaternion,
      this.isUnderConstruction ? this.constructionProgress : null,
    );
    // Rally flag: visible only while this finished building is selected.
    this._rallyFlag.visible = this.isSelected && !this.isUnderConstruction;

    // Burning-structure FX + hit shake.
    this._updateDamageFx(dt);

    // Perform procedural animations for building parts (banners, cores, vents)
    this._animateBuildingParts(dt);

    if (this.constructionRemaining > 0) {
      this._applyScaffoldScale();
      return; // no production while building
    }

    // Train the unit / research the upgrade at the front of the queue.
    const front = this.productionQueue[0];
    if (front) {
      front.remaining -= dt;
      if (front.remaining <= 0) {
        this.productionQueue.shift();
        if (front.isUpgrade) {
          this._completeResearch(front.upgradeId);
        } else {
          this._produce(front.typeId);
        }
      }
    }
  }

  /**
   * Run faction-specific procedural animations for banners, core crystals,
   * and lava vents, with higher intensity when training/producing.
   * @param {number} dt
   * @private
   */
  _animateBuildingParts(dt) {
    const now = this.engine.gameTime ?? 0;
    const isProducing = this.productionQueue.length > 0;

    // 1) Banners (Aether Knights)
    if (this._banners.length > 0) {
      const waveSpeed = isProducing ? 14 : 5;
      const waveAmp = isProducing ? 0.35 : 0.14;
      this._banners.forEach((cloth, idx) => {
        cloth.rotation.y = Math.sin(now * waveSpeed + idx * 0.8) * waveAmp;
        cloth.rotation.z = Math.cos(now * waveSpeed * 0.5 + idx * 0.8) * (waveAmp * 0.4);
      });
    }

    // 2) Core Crystals (Void Stalkers & Core Elementals)
    if (this._cores.length > 0) {
      const spinSpeed = isProducing ? 6.5 : 2.0;
      const bobFreq = isProducing ? 5.5 : 2.2;
      const bobAmp = isProducing ? 0.28 : 0.08;
      this._cores.forEach((core) => {
        core.rotation.y += dt * spinSpeed;
        core.rotation.x = Math.sin(now * 1.5) * 0.05; // slight wobble
        const baseY = core.userData.baseY ?? 1.5;
        core.position.y = baseY + Math.sin(now * bobFreq) * bobAmp;
      });
    }

    // 3) Lava Vents (Core Elementals)
    if (this._lavaVents.length > 0) {
      const pulseSpeed = isProducing ? 12.0 : 4.0;
      const pulseAmp = isProducing ? 0.16 : 0.04;
      const s = 1.0 + Math.sin(now * pulseSpeed) * pulseAmp;
      this._lavaVents.forEach((vent) => {
        vent.scale.set(s, s, s);
      });
    }

    // 4) Active production particle effects
    if (isProducing && !this.isUnderConstruction && Math.random() < 0.12 && this.engine.fx) {
      const spawnPos = new THREE.Vector3(
        this.position.x + (Math.random() - 0.5) * this.type.radius * 0.8,
        this.position.y + this._modelHeight + 0.3,
        this.position.z + (Math.random() - 0.5) * this.type.radius * 0.8
      );
      
      const race = this.type.race;
      if (race === 'BIO_HUMAN') {
        this.engine.fx.spawn('spark', spawnPos, '#ffd27a', {
          vx: (Math.random() - 0.5) * 0.6,
          vy: Math.random() * 0.8 + 0.8,
          vz: (Math.random() - 0.5) * 0.6,
          grav: -0.8, // float up
          scale: Math.random() * 0.6 + 0.5
        });
      } else if (race === 'ARTIFICE_HORDE') {
        this.engine.fx.spawn('spark', spawnPos, '#bc5df6', {
          vx: (Math.random() - 0.5) * 0.8,
          vy: Math.random() * 1.2 + 0.6,
          vz: (Math.random() - 0.5) * 0.8,
          grav: -1.2, // float up faster
          scale: Math.random() * 0.7 + 0.4
        });
      } else if (race === 'TERRA_BORN') {
        this.engine.fx.spawn('spark', spawnPos, '#ff5500', {
          vx: (Math.random() - 0.5) * 1.5,
          vy: Math.random() * 2.0 + 1.2,
          vz: (Math.random() - 0.5) * 1.5,
          grav: 2.0, // falls down
          scale: Math.random() * 0.9 + 0.6
        });
        if (Math.random() < 0.3) {
          this.engine.fx.spawnSmoke(spawnPos, {
            vx: (Math.random() - 0.5) * 0.8,
            vy: Math.random() * 1.5 + 0.8,
            vz: (Math.random() - 0.5) * 0.8,
            scale: Math.random() * 1.2 + 0.8
          });
        }
      } else if (race === 'CHAOS_DEEP') {
        this.engine.fx.spawn('spark', spawnPos, '#39ff14', {
          vx: (Math.random() - 0.5) * 1.0,
          vy: Math.random() * 1.0 + 1.0,
          vz: (Math.random() - 0.5) * 1.0,
          grav: -0.5,
          scale: Math.random() * 0.8 + 0.4
        });
      }
    }
  }

  /**
   * Grant supply, register completion, and (for the non-instant path) emit the
   * completion event so listeners/AI can react.
   * @param {boolean} instant - True on match-start halls (skip fanfare timing).
   * @private
   */
  _completeConstruction(instant) {
    if (this._completed) return;
    this._applyScaffoldScale();
    if (this.type.providesSupply && this.player) {
      this.player.addSupplyCap(this.type.providesSupply);
    }
    this._completed = true;
    eventBus.emit(EVENTS.BUILDING_COMPLETE, { entity: this, instant });
  }

  /**
   * Spawn a freshly trained unit at the building's edge and send it to rally.
   * @param {string} typeId
   * @private
   */
  _produce(typeId) {
    const em = this.engine?.entities;
    if (!em) return;

    // Check if the typeId is a building (morphing/upgrading)
    const type = getUnitType(typeId);
    if (type.class === 'BUILDING') {
      const pos = this.position.clone();
      const player = this.player;
      
      const newB = em.spawnBuilding(typeId, player, pos, { instant: true });
      newB.setRallyPoint(this.rallyPoint, em.getById(this.rallyTargetId) ?? null, {
        explicit: this.rallyExplicit,
      });

      // If this building was inspected, update the selection to inspect the upgraded building
      if (this.isSelected && this.engine.selection) {
        this.engine.selection._inspect(newB);
      }

      this.die(null);
      em.remove(this, false);
      return;
    }

    // Spawn just outside the footprint, toward the rally point.
    const dir = new THREE.Vector3(
      this.rallyPoint.x - this.position.x,
      0,
      this.rallyPoint.z - this.position.z
    );
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    dir.normalize().multiplyScalar(this.type.radius + 1.2);
    const sx = this.position.x + dir.x;
    const sz = this.position.z + dir.z;
    const sy = this.engine.terrain ? this.engine.terrain.getHeightAt(sx, sz) : 0;
    const spawnPos = new THREE.Vector3(sx, sy, sz);
    
    const unit = em.spawnUnit(typeId, this.player, spawnPos);
    if (unit) this._dispatchTrainedUnit(unit);
  }

  /**
   * Give a freshly trained unit its opening order (WC3-style smart rally + worker
   * automation):
   *   1. Rally set on/near a resource node → a trained worker auto-mines it.
   *   2. Rally set on/near a hostile → trained soldiers attack-move onto it.
   *   3. Any other worker → auto-mine the nearest resource (no idle workers).
   *   4. Otherwise → walk to the rally point (classic behavior).
   * @param {import('./Unit.js').Unit} unit
   * @private
   */
  _dispatchTrainedUnit(unit) {
    const em = this.engine?.entities;
    const rally = this.rallyPoint;
    const isWorker = unit.type.archetype === ARCHETYPE.WORKER;

    if (em && this.rallyExplicit) {
      const target = this.rallyTargetId ? em.getById(this.rallyTargetId) : null;
      if (isWorker && target && !target.isDead && typeof target.harvest === 'function') {
        unit.orderGather(target);
        return;
      }
      if (!isWorker && target && !target.isDead && target.player && this.player && !this.player.isAlliedWith(target.player)) {
        unit.orderAttackMove(rally);
        return;
      }
    }

    if (em && !this.rallyExplicit) {
      // 1) Rally parked on a resource node → workers harvest it directly.
      if (isWorker) {
        let node = null;
        let bestSq = 64; // within 8u of the rally point
        for (const nd of em.resources) {
          if (nd.isDead || nd.amount <= 0) continue;
          const dx = nd.position.x - rally.x;
          const dz = nd.position.z - rally.z;
          const dSq = dx * dx + dz * dz;
          if (dSq < bestSq) { bestSq = dSq; node = nd; }
        }
        if (node) { unit.orderGather(node); return; }
      } else {
        // 2) Rally in contested space → soldiers march in attack-move.
        for (const e of em.all) {
          if (e.isDead || !e.player || !this.player) continue;
          if (e.player === this.player || this.player.isAlliedWith(e.player)) continue;
          const dx = e.position.x - rally.x;
          const dz = e.position.z - rally.z;
          if (dx * dx + dz * dz < 144) { unit.orderAttackMove(rally); return; } // within 12u
        }
      }
    }

    // 3) Fresh workers with no resource rally still go straight to work.
    if (!this.rallyExplicit && isWorker && (unit.orderGatherNearest('GOLD_MINE') || unit.orderGatherNearest('AETHER_WELL'))) {
      return;
    }

    // 4) Default: gather at the rally point.
    unit.orderMove(rally);
  }

  /**
   * Complete the research on an upgrade, granting the player the upgrades.
   * @param {string} upgradeId
   * @private
   */
  _completeResearch(upgradeId) {
    if (this.player) {
      this.player.researchUpgrade(upgradeId);
      // Emit event
      eventBus.emit(EVENTS.RESEARCH_COMPLETE, { player: this.player, upgradeId });
    }
  }

  /**
   * Take damage through the base pipeline, then kick off a brief hit-shake so
   * a structure visibly flinches under fire (subtle jitter, decays fast).
   * @param {number} rawDamage @param {string} attackType @param {Entity|null} attacker
   */
  takeDamage(rawDamage, attackType, attacker) {
    super.takeDamage(rawDamage, attackType, attacker);
    if (!this.isDead) this._shake = SHAKE_TIME;
  }

  /**
   * Manage the burning-structure plume and hit-shake jitter each frame.
   *  - Fire ignites when a COMPLETED building drops below FIRE_THRESHOLD hp and
   *    is extinguished the instant repair pushes it back above the line.
   *  - Shake applies a small decaying offset to the body model on damage.
   * @param {number} dt @private
   */
  _updateDamageFx(dt) {
    const now = this.engine?.gameTime ?? 0;

    // ── Fire / smoke while badly hurt (only for finished structures) ──
    const burning = this._completed && !this.isUnderConstruction && this.hpFraction < FIRE_THRESHOLD;
    if (burning) {
      if (!this._fire) {
        this._fire = createFireEffect(this.type.radius, this._modelHeight * 0.35);
        this.mesh.add(this._fire.group);
      }
      // Angrier as it nears collapse: intensity 0 at threshold → 1 at 0 hp.
      this._fire.setIntensity(1 - this.hpFraction / FIRE_THRESHOLD);
      this._fire.update(dt, now);
    } else if (this._fire) {
      this._fire.dispose();
      this._fire = null;
    }

    // ── Hit shake (decaying positional jitter on the body) ──
    if (this._shake > 0 && this._body) {
      this._shake = Math.max(0, this._shake - dt);
      const k = this._shake / SHAKE_TIME;
      const amp = 0.08 * k * this.type.radius * 0.5;
      this._body.position.x = Math.sin(now * 90) * amp;
      this._body.position.z = Math.cos(now * 84) * amp;
    } else if (this._body && (this._body.position.x !== 0 || this._body.position.z !== 0)) {
      this._body.position.x = 0;
      this._body.position.z = 0;
    }
  }

  /** Scaffold visual: grow the box from SCAFFOLD_MIN to full as it builds. */
  _applyScaffoldScale() {
    const p = this.type.buildTime > 0
      ? 1 - Math.max(0, this.constructionRemaining) / this.type.buildTime
      : 1;
    const s = SCAFFOLD_MIN + (1 - SCAFFOLD_MIN) * p;
    this._body.scale.y = s;
  }

  /**
   * Relinquish the structure model so a CorpseManager can animate its collapse
   * (sink into rubble) after it leaves the simulation.
   * @returns {THREE.Group|null}
   */
  takeDeathModel() {
    // A collapsing structure stops burning — the CorpseManager handles rubble.
    if (this._fire) { this._fire.dispose(); this._fire = null; }
    const m = this._body;
    if (m) {
      this.mesh.remove(m);
      this._body = null;
    }
    return m;
  }

  /**
   * Building death: remove the static collider and reclaim its supply before
   * running the base lifecycle (BUILDING_DESTROYED + reap).
   * @param {Entity|null} [killer]
   */
  die(killer = null) {
    if (this.isDead) return;
    if (this._fire) { this._fire.dispose(); this._fire = null; }
    if (this._completed && this.type.providesSupply && this.player) {
      this.player.addSupplyCap(-this.type.providesSupply);
    }
    if (this._staticCollider && this.engine?.physics) {
      this.engine.physics.removeCollider(this._staticCollider);
      this._staticCollider = null;
    }
    super.die(killer);
  }
}
