/**
 * GameEngine — the orchestrator. It owns every subsystem, wires them together
 * from a frozen MatchConfig, runs the requestAnimationFrame loop in the exact
 * update order the modules were written against, and tears everything down.
 *
 * Construction is async (Rapier wasm init) so callers use the static factory
 * `GameEngine.create(canvas, matchConfig)`. Subsystems receive `this` (the
 * engine) by injection and reach each other only through the public fields
 * documented in ARCHITECTURE.md §4 — nothing imports GameEngine directly.
 *
 * Per-frame order (§4):
 *   input → camera → navigation → entities → physics → combat → projectiles →
 *   ai → fog → audio → [throttled HUD sync] → [victory sweep] → render
 */
import * as THREE from 'three';
import { GAME_CONFIG, TEAM_LABELS } from '../config/GameConfig.js';
import { getRaceTypeId } from '../config/Races.js';
import { getUpgradeType } from '../config/Upgrades.js';
import { getUnitType, ARCHETYPE } from '../config/UnitTypes.js';
import { eventBus, EVENTS } from './EventBus.js';
import { GameClock } from './GameClock.js';
import { AssetLoader } from './AssetLoader.js';
import { Player } from './Player.js';
import { SceneManager } from './SceneManager.js';
import { PhysicsWorld } from './PhysicsWorld.js';
import { NavigationManager } from './NavigationManager.js';
import { AethericNexusManager } from '../world/AethericNexusManager.js';
import { NeutralCampManager } from '../world/NeutralCampManager.js';
import { FogOfWar } from '../world/FogOfWar.js';
import { disposeTextures } from '../world/ProceduralTextures.js';
import { disposeModelCache } from '../world/ModelFactory.js';
import { disposeHealthBars } from '../fx/HealthBar.js';
import { disposeFireEffects } from '../fx/FireEffect.js';
import { EntityManager } from '../entities/EntityManager.js';
import { ProjectilePool } from '../entities/ProjectilePool.js';
import { CombatSystem } from '../combat/CombatSystem.js';
import { RTSCameraController } from '../camera/RTSCameraController.js';
import { InputManager } from '../input/InputManager.js';
import { SelectionSystem } from '../input/SelectionSystem.js';
import { CommandSystem } from '../input/CommandSystem.js';
import { PlacementController } from '../input/PlacementController.js';
import { UICommandFacade } from './UICommandFacade.js';
import { AIManager } from '../ai/AIManager.js';
import { AudioManager } from '../audio/AudioManager.js';
import { EffectsManager } from '../fx/EffectsManager.js';
import { FloatingTextManager } from '../fx/FloatingTextManager.js';
import { CorpseManager } from '../fx/CorpseManager.js';
import { CursorController } from '../input/CursorController.js';
import { useGameStore } from '../state/useGameStore.js';

const SIM = GAME_CONFIG.SIM;

export class GameEngine {
  /**
   * Async factory: init physics wasm, build the world, spawn armies, wire input
   * and AI, and return a ready (but not yet started) engine.
   * @param {HTMLCanvasElement} canvas
   * @param {object} matchConfig - Frozen MatchConfig from the lobby.
   * @returns {Promise<GameEngine>}
   */
  static async create(canvas, matchConfig) {
    await PhysicsWorld.init(); // compile Rapier wasm once (idempotent)
    const engine = new GameEngine(canvas, matchConfig);
    await engine._init();
    return engine;
  }

  /** @private Use GameEngine.create(). */
  constructor(canvas, matchConfig) {
    this.canvas = canvas;
    this.matchConfig = matchConfig;

    /** Authoritative game time (seconds) — every system reads engine.gameTime. */
    this.gameTime = 0;

    // Subsystem fields (populated in _init) — declared here for shape clarity.
    this.clock = null;
    this.assets = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.physics = null;
    this.navigation = null;
    this.nexus = null;
    this.terrain = null;
    this.fog = null;
    this.entities = null;
    this.projectiles = null;
    this.combat = null;
    this.cameraController = null;
    this.input = null;
    this.selection = null;
    this.commands = null;
    this.placement = null;   // PlacementController (building blueprint mode)
    this.ui = null;          // UICommandFacade (HUD → engine intent channel)
    this.ai = null;
    this.audio = null;
    this.fx = null;
    this.floatingText = null;
    this.corpses = null;      // CorpseManager (death/collapse animations)
    this.cursor = null;       // CursorController (context-sensitive mouse cursor)
    this.neutralCamps = null;  // NeutralCampManager (hostile creep camps)

    /** @type {Player[]} */
    this.players = [];
    /** @type {Player|null} */
    this.localPlayer = null;
    /** @type {Player|null} */
    this.neutralPlayer = null;

    this.isObserver = !!matchConfig.observer?.enabled;
    this.observerView = {
      enabled: this.isObserver,
      revealAll: !!matchConfig.observer?.revealAll,
      focusKind: matchConfig.observer?.focusKind ?? 'ALL',
      focusPlayerId: matchConfig.observer?.focusPlayerId ?? null,
      focusTeam: matchConfig.observer?.focusTeam ?? null,
    };

    // Presentation-feedback bus subscriptions (COMMAND_REJECTED → HUD).
    this._unsubs = [];

    // Loop state.
    this._running = false;
    this._raf = 0;
    this._frame = this._frame.bind(this);

    // Throttle accumulators.
    this._hudAccum = 0;
    this._victoryAccum = 0;

    // Reused picking scratch (one Raycaster for the whole engine).
    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._pickList = []; // rebuilt per pick (click rate, not hot)
  }

  /** @private Full match bring-up. Order matters — see inline notes. */
  async _init() {
    // 1) Core render context + clock + loaders.
    const sceneMgr = new SceneManager(this.canvas);
    this._sceneMgr = sceneMgr;
    this.renderer = sceneMgr.renderer;
    this.scene = sceneMgr.scene;
    this.camera = sceneMgr.camera;
    sceneMgr.applyMapEnvironment(this.matchConfig?.mapId || 'aether_plains');
    this.clock = new GameClock();
    this.assets = new AssetLoader();

    // 2) Physics + navigation (units register into these at spawn).
    this.physics = new PhysicsWorld();
    this.navigation = new NavigationManager();

    // 3) Terrain first — navigation, fog, camera bounds and start locations
    //    all derive from it.
    this.nexus = new AethericNexusManager(this);
    this.terrain = this.nexus;
    this.nexus.build();
    this.navigation.init(this.nexus);

    // 4) Players from the match config (before entities so ownership resolves).
    this._buildPlayers();
    this._buildNeutralPlayer();

    // 5) Entity registry + projectile pool.
    this.entities = new EntityManager(this);
    this.neutralCamps = new NeutralCampManager(this);
    this.projectiles = new ProjectilePool(this.scene);
    // Presentation FX: pooled impact/death effects + floating "+N"/status text
    // + animated corpses (death/collapse cleanup).
    this.fx = new EffectsManager(this);
    this.floatingText = new FloatingTextManager(this);
    this.corpses = new CorpseManager(this);

    // 6) Fog of war (optional) — injects into the ground material built above,
    //    plus every environment object (trees/rocks/doodads hide under fog;
    //    lakes only dim). Resource nodes are excluded (they show once scouted).
    this.fog = this.matchConfig.settings.fogOfWar ? new FogOfWar(this) : null;
    if (this.fog) {
      this.fog.applyToGround(this.nexus.groundMesh.material);
      for (const { material, hide } of this.nexus.getFogReceivers()) {
        this.fog.applyToWorldObject(material, { hide });
      }
    }

    // 7) Combat + input + camera + AI.
    this.combat = new CombatSystem(this);
    this.cameraController = new RTSCameraController(this.camera, this.canvas, {
      bounds: this.nexus.getBounds(),
      nexus: this.nexus,
    });
    this.input = new InputManager(this.canvas);
    this.selection = new SelectionSystem(this);
    this.commands = new CommandSystem(this);
    // Placement subscribes to pointer events AFTER selection/commands so, on a
    // committing click, those systems see placement.active (and skip) first.
    this.placement = new PlacementController(this);
    this.ui = new UICommandFacade(this);
    // Context-sensitive mouse cursor (sword over enemies, targeting cursors…).
    this.cursor = new CursorController(this);
    this.ai = new AIManager(this);

    // 8) Audio (fail-soft; nothing to preload).
    this.audio = new AudioManager();
    await this.audio.init();
    this.audio.attachCamera(this.camera);

    // Minimap is removed in the new Aetheric Matrix System.
    this._minimap = null;

    // 9) Populate the world: bases, starting armies, resources, AI wiring.
    this._spawnStartingForces();
    this._spawnResources();
    this.neutralCamps.spawnFromLayout(this.nexus);
    this._assignStartingWorkers();
    this._registerAI();

    // 10) Blocked-purchase feedback: flash the HUD + toast for the local player.
    //     (AudioManager speaks the phrase off the same event, independently.)
    this._unsubs.push(
      eventBus.on(EVENTS.COMMAND_REJECTED, (p) => {
        if (p?.player !== this.localPlayer) return;
        const store = useGameStore.getState();
        let errorText = '';
        if (p.reason === 'GOLD') {
          errorText = 'Insufficient Gold';
        } else if (p.reason === 'AETHER') {
          errorText = 'Insufficient Aether';
        } else if (p.reason === 'SUPPLY') {
          errorText = 'Not enough supply — build a supply structure';
        } else if (p.reason === 'QUEUE_FULL') {
          errorText = 'Production queue is full';
        } else if (p.reason === 'CONSTRUCTING') {
          errorText = 'Building still under construction';
        } else if (p.reason === 'PRODUCER') {
          errorText = 'Wrong production building';
        } else if (p.reason === 'REQUIREMENTS') {
          if (p.isUpgradeRequirement) {
            errorText = `Need to research ${p.reqName}`;
          } else {
            errorText = `Need to construct ${p.reqName}`;
          }
        }
        if (errorText) {
          store.showCenterError(errorText);
        }
        store.flashResource(p.reason);
      }),
    );

    // 10b) Under-attack alerts: ping the minimap (and, less often, toast) when a
    //      local/allied unit or building takes damage. Throttled so a big fight
    //      doesn't spam a hundred pings a second.
    this._lastPingTime = -Infinity;
    this._lastAttackAlert = -Infinity;
    this._lastAllyAttackAlert = -Infinity;
    const onFriendlyHit = (p) => this._onFriendlyUnderAttack(p?.entity);
    this._unsubs.push(
      eventBus.on(EVENTS.UNIT_DAMAGED, onFriendlyHit),
      eventBus.on(EVENTS.BUILDING_DESTROYED, onFriendlyHit),
    );

    // 10c) Completion alerts (building complete, unit trained, research complete)
    this._unsubs.push(
      eventBus.on(EVENTS.BUILDING_COMPLETE, (p) => {
        if (!p || p.instant) return;
        const b = p.entity;
        if (b && b.player === this.localPlayer) {
          const store = useGameStore.getState();
          store.pushGameAlert(`${b.type.name} is complete`, 'info');
          if (this.audio) this.audio.speak('Building complete.');
        }
      }),
      eventBus.on(EVENTS.UNIT_SPAWNED, (p) => {
        if (!p) return;
        const u = p.entity;
        if (u && u.player === this.localPlayer && this.gameTime > 0.1) {
          const store = useGameStore.getState();
          store.pushGameAlert(`${u.type.name} trained`, 'info');
          if (this.audio) this.audio.speak('Unit trained.');
        }
      }),
      eventBus.on(EVENTS.RESEARCH_COMPLETE, (p) => {
        if (!p) return;
        if (p.player === this.localPlayer) {
          const up = getUpgradeType(p.upgradeId);
          const store = useGameStore.getState();
          store.pushGameAlert(`${up.name} researched`, 'info');
          if (this.audio) this.audio.speak('Research complete.');
        }
      })
    );

    // 11) Frame the local player's base and announce the match.
    if (this.localPlayer) this.cameraController.panTo(this.localPlayer.basePosition, 0);
    else if (this.isObserver && this.players[0]) this.cameraController.panTo(this.players[0].basePosition, 0);
    this._syncHud(true);
    eventBus.emit(EVENTS.MATCH_STARTED, { matchConfig: this.matchConfig });
  }

  // ── Setup helpers ────────────────────────────────────────────────────────────

  /** @private Build Player objects and assign selected start locations. */
  _buildPlayers() {
    for (const cfg of this.matchConfig.players) {
      const player = new Player(cfg);
      const startLocationId = Number.isInteger(cfg.startLocationId) ? cfg.startLocationId : cfg.id;
      const loc = this.nexus.startLocations[startLocationId];
      if (loc) player.basePosition.copy(loc.position);
      this.players.push(player);
      if (player.isLocal) this.localPlayer = player;
    }
    // Fallback only for playable matches. Observer matches intentionally have
    // no local player so input, audio, and fog use viewer-safe paths.
    if (!this.localPlayer && !this.isObserver && this.players.length > 0) this.localPlayer = this.players[0];
  }

  _buildNeutralPlayer() {
    this.neutralPlayer = new Player({
      id: -1,
      name: 'Neutral Hostile',
      type: 'NEUTRAL',
      race: 'NEUTRAL_HOSTILE',
      team: 'NEUTRAL_HOSTILE',
      difficulty: null,
      personality: null,
      color: '#9d7a45',
      startLocationId: -1,
      isLocal: false,
      isNeutralHostile: true,
    });
    this.neutralPlayer.resources.gold = 0;
    this.neutralPlayer.resources.aether = 0;
    this.neutralPlayer.resources.supplyCap = 9999;
  }

  /**
   * @private Spawn each player's starting hall + worker/melee/ranged army,
   * arranged in a small cluster around the base facing map center.
   */
  _spawnStartingForces() {
    const forces = GAME_CONFIG.STARTING_FORCES;
    for (const player of this.players) {
      const base = player.basePosition;

      // Town hall (instant — the match starts with it standing).
      const hallType = getRaceTypeId(player.race, 'hall');
      const hall = this.entities.spawnBuilding(hallType, player, base.clone(), { instant: true });
      // Rally toward map center so trained units gather in front of the base.
      const toCenter = new THREE.Vector3(-base.x, 0, -base.z);
      if (toCenter.lengthSq() < 1e-4) toCenter.set(0, 0, 1);
      toCenter.normalize();
      hall.setRallyPoint(new THREE.Vector3(
        base.x + toCenter.x * (hall.type.radius + 6),
        0,
        base.z + toCenter.z * (hall.type.radius + 6),
      ), null, { explicit: false });

      // Starting army in a ring just inside the hall's rally direction.
      const workerType = getRaceTypeId(player.race, 'worker');
      const meleeType = getRaceTypeId(player.race, 'melee');
      const rangedType = getRaceTypeId(player.race, 'ranged');
      let slot = 0;
      const spawnAround = (typeId, count) => {
        for (let i = 0; i < count; i++) {
          const pos = this._ringSpot(base, toCenter, hall.type.radius + 3, slot++);
          this.entities.spawnUnit(typeId, player, pos);
        }
      };
      spawnAround(workerType, forces.WORKERS);
      spawnAround(meleeType, forces.MELEE);
      spawnAround(rangedType, forces.RANGED);
    }
  }

  /**
   * @private A spread-out spawn point around the base, biased toward `dir`.
   * @param {THREE.Vector3} base
   * @param {THREE.Vector3} dir - Unit vector toward map center.
   * @param {number} radius
   * @param {number} index
   * @returns {THREE.Vector3}
   */
  _ringSpot(base, dir, radius, index) {
    // Fan units across a ~150° arc centered on `dir` so they don't stack.
    const baseAngle = Math.atan2(dir.x, dir.z);
    const spread = ((index % 7) - 3) * 0.35;
    const r = radius + (Math.floor(index / 7)) * 1.6;
    const a = baseAngle + spread;
    return new THREE.Vector3(
      base.x + Math.sin(a) * r,
      0,
      base.z + Math.cos(a) * r,
    );
  }

  /**
   * @private Spawn a gold + aether node at every used start location, plus the
   * contested neutral nodes near map center.
   */
  _spawnResources() {
    const usedSlots = new Set(this.players.map((p) => p.startLocationId));
    this.nexus.startLocations.forEach((loc, slotId) => {
      if (!usedSlots.has(slotId)) return; // don't dress empty start locations
      this.entities.spawnResourceNode('GOLD_MINE', loc.goldPos.clone());
      this.entities.spawnResourceNode('AETHER_WELL', loc.aetherPos.clone());
    });
    for (const node of this.nexus.neutralNodes) {
      this.entities.spawnResourceNode(node.kind, node.position.clone());
    }
  }

  /**
   * @private Send every player's opening workers straight to work, split ~2:1
   * gold:aether, so the economy is running the instant the match starts rather
   * than leaving five workers idling next to the hall.
   */
  _assignStartingWorkers() {
    for (const player of this.players) {
      const workers = this.entities
        .getPlayerUnits(player.id)
        .filter((u) => !u.isDead && u.type.archetype === ARCHETYPE.WORKER);
      workers.forEach((w, i) => {
        const kind = i % 3 === 2 ? 'AETHER_WELL' : 'GOLD_MINE';
        const alt = kind === 'GOLD_MINE' ? 'AETHER_WELL' : 'GOLD_MINE';
        // Fall back to the other resource if this player's preferred one is gone.
        if (!w.orderGatherNearest(kind)) w.orderGatherNearest(alt);
      });
    }
  }

  /** @private Register every AI player with the AI manager. */
  _registerAI() {
    for (const player of this.players) {
      if (player.type === 'AI') this.ai.registerPlayer(player);
    }
  }

  // ── Loop control ──────────────────────────────────────────────────────────────

  /** Begin the render loop. */
  start() {
    if (this._running) return;
    this._running = true;
    this.clock.reset();
    this._raf = requestAnimationFrame(this._frame);
  }

  /** Pause the render loop (state is preserved). */
  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  /**
   * The main frame. Updates every subsystem in the contract order, throttles
   * the HUD/victory work, and renders.
   * @private
   */
  _frame() {
    if (!this._running) return;
    this._raf = requestAnimationFrame(this._frame);

    const dt = this.clock.tick();
    this.gameTime = this.clock.elapsed;

    this.input.update(dt);
    this.placement.update(dt);   // blueprint ghost tracks the cursor
    this.cameraController.update(dt);
    this.navigation.update(dt);
    this.entities.update(dt);
    this.neutralCamps.update(dt);
    this.nexus.update(dt);
    this.physics.step(dt);
    this.combat.update(dt);
    this.projectiles.update(dt);
    this.fx.update(dt);
    this.floatingText.update(dt);
    this.corpses.update(dt);
    this.ai.update(dt);
    if (this.fog) this.fog.update(dt);
    this.audio.update(dt);
    this.selection.update(dt);
    this.commands.update(dt);
    this.cursor.update(dt);

    // Throttled HUD sync (resources/clock/fps → useGameStore).
    this._hudAccum += dt;
    if (this._hudAccum >= SIM.HUD_SYNC_INTERVAL) {
      this._hudAccum = 0;
      this._syncHud(false);
    }

    // Periodic victory sweep.
    this._victoryAccum += dt;
    if (this._victoryAccum >= SIM.VICTORY_CHECK_INTERVAL) {
      this._victoryAccum = 0;
      this.combat.checkVictory();
    }

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Push the local player's economy + clock + fps into the HUD store.
   * @param {boolean} force - Ignored; present for call-site symmetry.
   * @private
   */
  _syncHud(force) {
    void force;
    const store = useGameStore.getState();
    if (this.localPlayer) {
      const r = this.localPlayer.resources;
      // Fresh object so React re-renders on change.
      store.setResources({
        gold: Math.floor(r.gold),
        aether: Math.floor(r.aether),
        supplyUsed: r.supplyUsed,
        supplyCap: r.supplyCap,
      });

      const completedB = this.entities.buildings
        .filter((b) => b.player === this.localPlayer && !b.isUnderConstruction && !b.isDead)
        .map((b) => b.type.id);
      store.setCompletedBuildings(completedB);
      store.setResearchedUpgrades(Array.from(this.localPlayer.researchedUpgrades));
    } else if (this.isObserver) {
      store.setResources({ gold: 0, aether: 0, supplyUsed: 0, supplyCap: 0 });
      store.setCompletedBuildings([]);
      store.setResearchedUpgrades([]);
    }
    if (this.isObserver) store.setObserver(this._observerSnapshot());
    store.setGameTime(this.gameTime);
    store.setFps(this.clock.fps);
  }

  /**
   * A local/allied entity took damage → drop a minimap ping (throttled) and,
   * occasionally, a spoken/toast "under attack" alert.
   * @param {import('../entities/Entity.js').Entity|undefined} entity
   * @private
   */
  _onFriendlyUnderAttack(entity) {
    if (!entity || !entity.position) return;
    if (this.isObserver) return;
    const owner = entity.player;
    const local = this.localPlayer;
    if (!owner || !local) return;
    if (owner !== local && !local.isAlliedWith(owner)) return;

    const now = this.gameTime;
    if (now - this._lastPingTime < 0.8) return; // at most ~1.25 pings/sec
    this._lastPingTime = now;

    const store = useGameStore.getState();
    store.pushMinimapPing(entity.position.x, entity.position.z);

    if (owner !== local) {
      if (now - this._lastAllyAttackAlert > 30) {
        this._lastAllyAttackAlert = now;
        store.pushGameAlert(`${owner.name}'s forces are under attack`, 'danger');
      }
      return;
    }

    // Add to the upper left game alerts as a red text notification!
    const isBuilding = entity.type && (entity.type.archetype === 'HALL' || entity.type.archetype === 'BARRACKS' || entity.type.archetype === 'SUPPLY');
    const message = isBuilding
      ? `${entity.type.name} is under attack!`
      : 'Your forces are under attack!';

    if (now - this._lastAttackAlert > 30) {
      this._lastAttackAlert = now;
      store.pushGameAlert(message, 'danger');
      if (this.audio) {
        this.audio.speak(isBuilding ? 'Our base is under attack.' : 'Our forces are under attack.');
      }
    }
  }

  // ── Public queries ──────────────────────────────────────────────────────────

  setObserverView(patch = {}) {
    if (!this.isObserver) return;
    this.observerView = { ...this.observerView, ...patch, enabled: true };
    if (this.observerView.focusKind === 'PLAYER' && this.observerView.focusPlayerId == null) {
      this.observerView.focusPlayerId = this.players.find((p) => !p.isDefeated)?.id ?? this.players[0]?.id ?? null;
    }
    if (this.observerView.focusKind === 'TEAM' && !this.observerView.focusTeam) {
      this.observerView.focusTeam = this.players.find((p) => !p.isDefeated && p.team !== 'FFA')?.team ?? this.players[0]?.team ?? null;
    }
    if (this.fog) this.fog.update(999);
    this._syncHud(true);
  }

  getObserverVisionPlayers() {
    if (!this.isObserver) {
      const local = this.localPlayer;
      if (!local) return [];
      return this.players.filter((p) => !p.isDefeated && (p === local || p.isAlliedWith(local)));
    }
    if (this.observerView.revealAll || this.observerView.focusKind === 'ALL') {
      return this.players.filter((p) => !p.isDefeated);
    }
    if (this.observerView.focusKind === 'PLAYER') {
      const player = this.getPlayer(this.observerView.focusPlayerId);
      return player && !player.isDefeated ? [player] : [];
    }
    if (this.observerView.focusKind === 'TEAM') {
      return this.players.filter((p) => !p.isDefeated && p.team === this.observerView.focusTeam);
    }
    return [];
  }

  isRevealAll() {
    return this.isObserver && this.observerView.revealAll;
  }

  isEntityVisibleToViewer(entity) {
    if (!entity || entity.isDead) return false;
    if (!this.fog || this.isRevealAll()) return true;
    const visionPlayers = this.getObserverVisionPlayers();
    if (entity.player && visionPlayers.includes(entity.player)) return true;
    if (!entity.player && typeof entity.harvest !== 'function') return true;
    if (typeof entity.harvest === 'function') return this.fog.isExplored(entity.position);
    if (entity.type?.class === 'BUILDING') return this.fog.isExplored(entity.position);
    return this.fog.isVisible(entity.position);
  }

  focusObserverTarget(kind) {
    if (!this.isObserver || !this.cameraController) return;
    let target = null;
    if (kind === 'base') target = this._observerBaseTarget();
    else if (kind === 'army') target = this._observerArmyTarget();
    else if (kind === 'battle') target = this._observerBattleTarget();
    if (target) this.cameraController.panTo(target, 0.2);
  }

  _observerFocusedPlayers() {
    const list = this.getObserverVisionPlayers();
    return list.length > 0 ? list : this.players.filter((p) => !p.isDefeated);
  }

  _observerBaseTarget() {
    const player = this._observerFocusedPlayers()[0];
    return player?.basePosition ?? null;
  }

  _observerArmyTarget() {
    const focused = new Set(this._observerFocusedPlayers());
    const units = this.entities?.units ?? [];
    const center = new THREE.Vector3();
    let count = 0;
    for (const u of units) {
      if (u.isDead || !focused.has(u.player)) continue;
      if (u.type.archetype !== ARCHETYPE.MELEE && u.type.archetype !== ARCHETYPE.RANGED) continue;
      center.add(u.position);
      count++;
    }
    if (count === 0) return this._observerBaseTarget();
    center.divideScalar(count);
    return center;
  }

  _observerBattleTarget() {
    const units = this.entities?.units ?? [];
    for (const u of units) {
      const target = u.attackTarget;
      if (u.isDead || !target || target.isDead || !u.player || !target.player) continue;
      if (u.player === target.player || u.player.isAlliedWith(target.player)) continue;
      return new THREE.Vector3(
        (u.position.x + target.position.x) * 0.5,
        0,
        (u.position.z + target.position.z) * 0.5,
      );
    }
    return this._observerArmyTarget();
  }

  _observerSnapshot() {
    const teams = [...new Set(this.players.map((p) => p.team))].map((team) => ({
      id: team,
      label: TEAM_LABELS[team] ?? team,
    }));
    return {
      ...this.observerView,
      enabled: this.isObserver,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        race: p.race,
        color: p.colorHex,
        type: p.type,
        defeated: p.isDefeated,
      })),
      teams,
      diagnostics: this.ai?.getDiagnostics?.() ?? [],
    };
  }

  /**
   * @param {number} id
   * @returns {Player|undefined}
   */
  getPlayer(id) {
    if (id === -1) return this.neutralPlayer;
    return this.players.find((p) => p.id === id);
  }

  /**
   * Raycast the ground plane at NDC coordinates.
   * @param {number} ndcX @param {number} ndcY
   * @returns {THREE.Vector3|null} World-space hit point, or null if off-map.
   */
  raycastGround(ndcX, ndcY) {
    if (!this.nexus?.groundMesh) return null;
    this._ndc.set(ndcX, ndcY);
    this._raycaster.setFromCamera(this._ndc, this.camera);
    const hits = this._raycaster.intersectObject(this.nexus.groundMesh, false);
    return hits.length > 0 ? hits[0].point.clone() : null;
  }

  /**
   * Pick the nearest entity under the cursor.
   * @param {number} ndcX @param {number} ndcY
   * @returns {import('../entities/Entity.js').Entity|null}
   */
  pickEntity(ndcX, ndcY) {
    this._ndc.set(ndcX, ndcY);
    this._raycaster.setFromCamera(this._ndc, this.camera);

    // Gather visible, living entity mesh roots (click rate — allocation is fine).
    this._pickList.length = 0;
    const all = this.entities.all;
    for (let i = 0; i < all.length; i++) {
      const e = all[i];
      if (!e.isDead && e.mesh.visible) this._pickList.push(e.mesh);
    }
    const hits = this._raycaster.intersectObjects(this._pickList, true);
    for (let i = 0; i < hits.length; i++) {
      // Walk up from the hit child mesh to the entity-tagged root group.
      let obj = hits[i].object;
      while (obj && !obj.userData.entity) obj = obj.parent;
      if (obj && obj.userData.entity && !obj.userData.entity.isDead) {
        return obj.userData.entity;
      }
    }
    return null;
  }

  // ── Teardown ────────────────────────────────────────────────────────────────

  /** Stop the loop and dispose every subsystem + GL resource. Idempotent. */
  dispose() {
    this.stop();

    // Dispose input-facing systems first (they hold DOM listeners / tweens).
    this.cursor?.dispose();
    this.placement?.dispose();
    this.commands?.dispose();
    this.selection?.dispose();
    this.input?.dispose();
    this.cameraController?.dispose();

    for (const off of this._unsubs) off();
    this._unsubs = [];

    this.ai?.dispose();
    this.neutralCamps?.dispose();
    this.combat?.dispose();
    this.fog?.dispose();
    this.corpses?.dispose();
    this.floatingText?.dispose();
    this.fx?.dispose();
    this.projectiles?.dispose();
    this.entities?.dispose();
    this.navigation?.dispose();
    this.physics?.dispose();
    this.nexus?.dispose();
    this.audio?.dispose();
    this.assets?.dispose();
    this._sceneMgr?.dispose();

    // Free the shared procedural texture + model geometry/material caches so a
    // subsequent match rebuilds them fresh (they are module-global otherwise).
    disposeModelCache();
    disposeTextures();
    disposeHealthBars();
    disposeFireEffects();

    // Drop references so a torn-down engine can be GC'd promptly.
    this.players = [];
    this.localPlayer = null;
    this.neutralPlayer = null;
    this.neutralCamps = null;
    this._pickList.length = 0;
  }
}
