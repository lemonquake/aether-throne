# Aether Throne — Architecture & Module Contracts

**A Warcraft 3 spiritual clone RTS. By Aljay Leodones.**

This document is the **binding contract** for every module in the codebase.
If you are authoring a module: implement *exactly* the exports and signatures
specified for your files, and *consume* other modules only through the
signatures written here. Deviations must be reported.

---

## 1. Tech stack

| Concern        | Library                        | Import style |
|----------------|--------------------------------|--------------|
| Rendering      | three (`^0.169`)               | `import * as THREE from 'three'` |
| Tweens/camera  | gsap                           | `import gsap from 'gsap'` |
| Pathfinding/AI | yuka (navmesh, steering, FSM)  | `import * as YUKA from 'yuka'` |
| Physics        | @dimforge/rapier3d-compat      | `import RAPIER from '@dimforge/rapier3d-compat'` |
| Audio          | howler                         | `import { Howl, Howler } from 'howler'` |
| State          | zustand (v5)                   | `import { create } from 'zustand'` |
| UI             | react 18 (overlay only)        | JSX in `src/ui/**` only |
| Build          | vite 5 + @vitejs/plugin-react  | — |

**Conventions (mandatory):**
- ES modules everywhere; **relative imports include the file extension** (`./Foo.js`, `./Bar.jsx`).
- JSDoc on every class and public method; inline comments for non-obvious logic. This codebase is intentionally *thoroughly commented* (educational scaffold).
- **No per-frame allocations in hot loops.** Reuse module-scope scratch objects (`const _v = new THREE.Vector3()`), pool projectiles, use `InstancedMesh` for repeated environment geometry.
- No `Date.now()` in simulation logic — use accumulated `dt` (engine game time).
- Every system with DOM listeners or GPU resources implements `dispose()`.

---

## 2. Directory map

```
aether-throne/
├── index.html                     # canvas + #ui-root shells, boot CSS
├── package.json / vite.config.js
├── ARCHITECTURE.md                # ← you are here
├── public/assets/                 # audio/models/textures (empty in v1; loaders fail soft)
└── src/
    ├── main.jsx                   # React root bootstrap
    ├── GameBootstrap.js           # lobby → engine handoff (create/teardown singleton)
    ├── config/
    │   ├── GameConfig.js          # GAME_CONFIG, TEAMS, SLOT_TYPES, AI_DIFFICULTY, AI_PROFILES, PLAYER_COLORS, TEAM_LABELS
    │   ├── Races.js               # RACES, RACE_IDS, getRaceTypeId(raceId, role)
    │   └── UnitTypes.js           # UNIT_TYPES, getUnitType, DAMAGE_TABLE, computeDamage, ENTITY_CLASS, ARCHETYPE
    ├── state/
    │   ├── useLobbyStore.js       # SCREENS + lobby store (slots, startMatch, screen routing)
    │   ├── useGameStore.js        # HUD store (resources, selection snapshots, toasts)
    │   └── MatchConfig.js         # buildMatchConfig(lobby), validateLobby(lobby)
    ├── engine/                    # ← written LAST, adapts to all other modules
    │   ├── EventBus.js            # EventBus class, eventBus singleton, EVENTS catalog
    │   ├── GameEngine.js          # orchestrator: loop, subsystem wiring, picking helpers
    │   ├── SceneManager.js        # scene, lights, renderer sizing
    │   ├── PhysicsWorld.js        # Rapier wrapper (static colliders + kinematic movers)
    │   ├── NavigationManager.js   # Yuka wrapper (navmesh, path queue, vehicles)
    │   ├── GameClock.js           # delta clamping, elapsed game time, fps estimate
    │   ├── AssetLoader.js         # centralized loaders (GLTF/textures), fail-soft
    │   └── Player.js              # per-player economy/team/defeat state
    ├── camera/
    │   └── RTSCameraController.js
    ├── input/
    │   ├── InputManager.js
    │   ├── SelectionSystem.js
    │   └── CommandSystem.js
    ├── entities/
    │   ├── Entity.js
    │   ├── Unit.js
    │   ├── Building.js
    │   ├── ResourceNode.js
    │   ├── EntityManager.js
    │   ├── Projectile.js
    │   └── ProjectilePool.js
    ├── combat/
    │   └── CombatSystem.js
    ├── world/
    │   ├── TerrainManager.js
    │   ├── FogOfWar.js
    │   └── MenuBackgroundScene.js
    ├── ai/
    │   ├── AIManager.js
    │   ├── macro/
    │   │   ├── MacroBrain.js
    │   │   ├── BuildOrders.js
    │   │   ├── EconomyPlanner.js
    │   │   └── ThreatMap.js
    │   └── micro/
    │       ├── MicroBrain.js
    │       └── CombatEvaluator.js
    ├── audio/
    │   └── AudioManager.js
    └── ui/
        ├── App.jsx                # screen router (reads useLobbyStore.screen)
        ├── menu/MainMenu.jsx
        ├── lobby/MatchLobby.jsx
        ├── lobby/PlayerSlot.jsx
        ├── hud/GameHUD.jsx
        ├── hud/LoadingScreen.jsx
        └── styles/ui.css          # the entire UI theme
```

---

## 3. Data flow: lobby → engine

1. `MainMenu` → `setScreen(SCREENS.LOBBY)`.
2. `MatchLobby` mutates slots via lobby-store actions.
3. "Start Battle" → `useLobbyStore.startMatch()` → validates, builds frozen
   `MatchConfig`, sets `pendingMatchConfig`, screen → `LOADING`.
4. `App.jsx` effect on `LOADING`: calls `bootstrapMatch(pendingMatchConfig)`
   from `src/GameBootstrap.js`, then `onMatchReady()` (screen → `IN_GAME`)
   or `onMatchFailed(message)` on error.
5. Exit: HUD calls `teardownMatch()` then `exitToMenu()` + `resetGameState()`.

**`src/GameBootstrap.js` contract** (written by the engine integrator):
```js
export async function bootstrapMatch(matchConfig): Promise<GameEngine> // idempotent
export function getEngine(): GameEngine | null
export async function teardownMatch(): Promise<void> // dispose engine, hide canvas, clear bus
```
It finds `#game-canvas`, removes its `hidden` class, awaits `GameEngine.create`,
calls `engine.start()`. Teardown reverses all of it.

---

## 4. Engine core contracts (`src/engine/`)

### GameEngine.js
```js
export class GameEngine {
  /** Async factory: Rapier wasm init, terrain build, subsystem wiring, army spawn. */
  static async create(canvas, matchConfig): Promise<GameEngine>

  // Public fields available to ALL subsystems (constructor-injected `engine`):
  canvas, renderer /* THREE.WebGLRenderer */, scene, camera /* PerspectiveCamera */
  matchConfig
  players            // Player[] in matchConfig order
  localPlayer        // the Player with isLocal === true
  gameTime           // seconds since match start (number)
  // Subsystems:
  clock              // GameClock
  physics            // PhysicsWorld
  navigation         // NavigationManager
  terrain            // TerrainManager
  fog                // FogOfWar (null if settings.fogOfWar === false)
  entities           // EntityManager
  combat             // CombatSystem
  projectiles        // ProjectilePool
  cameraController   // RTSCameraController
  input              // InputManager
  selection          // SelectionSystem
  commands           // CommandSystem
  ai                 // AIManager
  audio              // AudioManager

  getPlayer(id): Player | undefined
  start(): void      // begins requestAnimationFrame loop
  stop(): void
  dispose(): void    // stop + dispose every subsystem + free GL resources

  // Picking helpers (single raycaster reused internally):
  raycastGround(ndcX, ndcY): THREE.Vector3 | null   // intersect terrain plane
  pickEntity(ndcX, ndcY): Entity | null             // nearest entity under cursor
}
```

**Per-frame update order** (inside the rAF callback):
```
dt = clock.tick()                    // clamped by GAME_CONFIG.SIM.MAX_DELTA
input.update(dt)
cameraController.update(dt)
navigation.update(dt)                // yuka steering + path request queue
entities.update(dt)                  // unit FSMs, mesh↔vehicle sync, gathering
physics.step(dt)                     // rapier world step + kinematic corrections
combat.update(dt)                    // acquisition, attacks
projectiles.update(dt)
ai.update(dt)                        // staggered macro/micro thinks
fog?.update(dt)                      // throttled internally to FOG_UPDATE_HZ
audio.update(dt)                     // listener ← camera
[throttled] hud sync                 // resources / clock / fps → useGameStore
[every VICTORY_CHECK_INTERVAL] victory sweep
renderer.render(scene, camera)
```

### Player.js
```js
export class Player {
  constructor(config /* one MatchConfig.players entry */)
  id, name, type /* 'HUMAN'|'AI' */, race, team, difficulty, isLocal
  color              // THREE.Color
  colorHex           // '#rrggbb' string (for UI snapshots)
  resources          // { gold, aether, supplyUsed, supplyCap }
  basePosition       // THREE.Vector3, set by engine from terrain start location
  isDefeated         // boolean

  isAlliedWith(other: Player): boolean  // same non-FFA team (self counts as ally)
  canAfford({gold, aether, supply}): boolean
  spend({gold, aether, supply}): boolean       // false + no-op if unaffordable
  deposit({gold, aether}, multiplier = 1)      // AI income cheats apply here
  addSupplyCap(n) / addSupplyUsed(n)           // clamped to SUPPLY_CAP_MAX
  // All mutations emit EVENTS.RESOURCES_CHANGED {player}.
}
```

### GameClock.js
```js
export class GameClock {
  constructor()
  tick(): number          // returns clamped dt; accumulates elapsed + smoothed fps
  elapsed: number         // game seconds
  fps: number             // exponentially smoothed
}
```

### PhysicsWorld.js  (Rapier division of labor — see §8)
```js
export class PhysicsWorld {
  static async init(): Promise<void>            // RAPIER.init() once, cached
  constructor()                                 // gravity (0,0,0) — top-down RTS
  addStaticBox(position, halfExtents): collider  // buildings
  addStaticCylinder(position, radius, height): collider // resource nodes / doodads
  registerUnit(unit): void       // kinematic body + capsule collider + char controller
  unregisterUnit(unit): void
  /**
   * Move a unit's kinematic body by `desired` (THREE.Vector3 displacement),
   * sliding along static geometry. Writes the corrected displacement into
   * `out` and returns it. Called by Unit.update after steering.
   */
  moveUnit(unit, desired, out): THREE.Vector3
  step(dt): void
  removeCollider(collider): void
  dispose(): void
}
```

### NavigationManager.js
```js
export class NavigationManager {
  constructor()
  init(terrain /* TerrainManager */): void  // builds navmesh (v1: flat rect polygon)
  /**
   * Create and register a YUKA.Vehicle for a unit: ArriveBehavior +
   * SeparationBehavior (weight PATH.SEPARATION_WEIGHT) + FollowPathBehavior.
   * maxSpeed = unit.type.moveSpeed. Behaviors start disabled except separation.
   */
  createVehicle(unit): YUKA.Vehicle
  removeVehicle(vehicle): void
  /**
   * Time-sliced pathfinding: enqueue a request; at most
   * PATH.MAX_REQUESTS_PER_FRAME are resolved per update. On resolution the
   * unit's follow-path behavior is populated and `onPath(path)` is called.
   * v1 navmesh is a flat rectangle → paths are near-straight; the API is
   * what matters (Phase 3 bakes real navmeshes with obstacle holes).
   */
  requestPath(unit, targetVec3 /* THREE.Vector3 */, onPath?): void
  update(dt): void      // drains queue + yuka entityManager.update
  dispose(): void
}
```

### SceneManager.js
```js
export class SceneManager {
  constructor(canvas)
  scene, renderer, camera        // camera built from GAME_CONFIG.CAMERA
  handleResize(): void           // bound to window resize internally
  dispose(): void
}
```
Lighting: hemisphere + one shadow-casting directional light (2048 map,
covering the play area). Renderer: `antialias: true`, sRGB output,
ACESFilmic tone mapping, shadowMap PCFSoft.

### AssetLoader.js
```js
export class AssetLoader {
  constructor()
  loadTexture(url): Promise<THREE.Texture|null>   // null + warn on 404 (fail-soft)
  loadGLTF(url): Promise<GLTF|null>
  dispose(): void
}
```

---

## 5. Camera & input contracts

### camera/RTSCameraController.js
```js
export class RTSCameraController {
  /**
   * @param camera THREE.PerspectiveCamera
   * @param domElement canvas
   * @param opts { bounds: {minX,maxX,minZ,maxZ} } // from terrain size − BOUNDS_MARGIN
   */
  constructor(camera, domElement, opts)
  focus: THREE.Vector3          // ground point the camera orbits/looks at
  height: number                // current zoom height (MIN..MAX_HEIGHT)
  update(dt): void              // edge scroll + drag + keyboard arrows
  panTo(worldPos, duration = 0.5): void   // GSAP-eased jump (minimap/ctrl-group recall)
  setBounds(bounds): void
  dispose(): void
}
```
Behavior: camera position = `focus + (0, height, height * OFFSET_RATIO)`,
always `lookAt(focus)`. Wheel zoom tweens `height` by ZOOM_STEP with GSAP
(`ZOOM_EASE`), clamped. Edge scroll speed = `EDGE_SPEED * (height / 40)`.
Middle-drag pans focus by `DRAG_SPEED * pixels * (height / 40)`. Focus is
clamped to bounds every frame. Edge scrolling pauses while the pointer is
outside the window.

### input/InputManager.js
```js
export class InputManager {
  constructor(domElement /* canvas */)
  update(dt): void
  isKeyDown(code): boolean          // e.g. 'ControlLeft', 'KeyA'
  pointerNDC: {x, y}                // live normalized device coords
  pointerScreen: {x, y}             // live client pixels
  dispose(): void
}
```
Translates DOM events into `EVENTS.POINTER_DOWN/MOVE/UP`, `KEY_DOWN/KEY_UP`
on the shared `eventBus` (payload shapes documented in EventBus.js).
`contextmenu` on the canvas is prevented (right-click is a command).
Listeners attach to `window` for keys, canvas for pointer.

### input/SelectionSystem.js
```js
export class SelectionSystem {
  constructor(engine)
  selected: Set<Unit>            // live selection (player-owned units)
  getSelectedArray(): Unit[]
  update(dt): void
  dispose(): void
}
```
Behavior contract:
- **Left-drag ≥ 4px** → marquee: creates/positions an absolutely-positioned
  `div.selection-marquee` appended to `document.body` (styled in ui.css).
  On release, selects local-player units whose projected screen position
  falls inside the rect (project `unit.position` via `engine.camera` — no
  GPU picking needed at this scale).
- **Left-click** → `engine.pickEntity`; own unit = select (shift = toggle-add);
  enemy/resource = select-for-inspection (single, no commands); ground = clear.
- **Ctrl+1..9** assign control group; **1..9** recall; recalling the same
  group within 350 ms of game time (double-tap) → `cameraController.panTo(centroid)`.
- On every change: `unit.setSelected(bool)` on affected units, emit
  `EVENTS.SELECTION_CHANGED {ids, units}`, and push plain snapshots to
  `useGameStore.getState().setSelection([...])` — snapshot shape:
  `{ id, typeId, name, hp, maxHp, mana, maxMana, color }` (color = owner colorHex).
- Dead units are pruned from selection/groups each update (also refresh HUD
  snapshots when pruning, and cheaply refresh hp values ~5 Hz while selected).

### input/CommandSystem.js
```js
export class CommandSystem {
  constructor(engine)
  update(dt): void
  dispose(): void
}
```
Right-click (POINTER_UP button 2, no drag) with a non-empty selection issues a
**smart command** to `engine.selection.getSelectedArray()`:
- pick enemy Unit/Building → `unit.orderAttack(target)` for all selected.
- pick ResourceNode → workers `orderGather(node)`; non-workers `orderMove` beside it.
- else `raycastGround` → formation move: distribute per-unit targets in a
  compact ring/grid around the click point (≈1.5u spacing) → `orderMove(p)`.
- **A + right/left-click** (attack-move) → `orderAttackMove(groundPos)`.
- **S key** → `orderStop()` for selection.
Each dispatch emits `EVENTS.COMMAND_ISSUED` and calls
`engine.audio.playUnitResponse(firstUnit.type.id, 'move'|'attack')`.
Also spawns a brief ground click marker (small ring mesh, fades ~0.5 s;
pooled, no per-click allocation).

---

## 6. Entities & combat contracts

### entities/Entity.js
```js
export class Entity {
  /** @param type frozen UnitTypes entry  @param player owning Player|null (neutral) */
  constructor(engine, type, player, position /* THREE.Vector3 */)
  id                 // unique int (module counter)
  engine, type, player
  get playerId()     // player?.id ?? -1
  get team()         // player?.team ?? 'NEUTRAL'
  mesh               // THREE.Object3D root (owns geometry; engine adds to scene)
  get position()     // mesh.position (THREE.Vector3) — the canonical transform
  hp, maxHp, mana, maxMana
  isDead
  get hpFraction()
  setSelected(flag)  // toggles child selection-ring mesh (ring colored by owner)
  takeDamage(rawDamage, attackType, attacker): void
    // uses computeDamage() from UnitTypes.js; emits UNIT_DAMAGED; calls die()
  die(killer): void  // emits UNIT_DIED / BUILDING_DESTROYED; EntityManager reaps
  update(dt): void
  dispose(): void
}
```

### entities/Unit.js — `export class Unit extends Entity`, plus `export const UNIT_STATES`
States: `IDLE, MOVING, ATTACK_MOVING, ATTACKING, GATHER_MOVING, HARVESTING,
RETURNING, FLEEING, DEAD`.
```js
vehicle            // YUKA.Vehicle (navigation.createVehicle(this)), position-synced
state              // one of UNIT_STATES
attackTarget       // Entity|null
gatherNode         // ResourceNode|null
carrying           // { gold|aether amount } | null
attackCooldown     // seconds until next attack allowed
fleeUntil          // gameTime lockout while FLEEING
orderMove(pos: THREE.Vector3): void
orderAttackMove(pos): void
orderAttack(target: Entity): void
orderGather(node): void        // WORKER archetype only; others → orderMove
orderStop(): void
update(dt): void   // drives the FSM; syncs mesh ← vehicle via physics.moveUnit
```
FSM notes:
- IDLE units auto-acquire hostiles within `sightRadius` (via
  `engine.entities.findNearestEnemy`) and transition to ATTACKING.
- ATTACK_MOVING = MOVING that acquires en route.
- ATTACKING: outside `attackRange` → chase (repath at ~4 Hz max); inside →
  face target, on cooldown roll damage. Melee applies instantly; RANGED
  archetype fires via `engine.projectiles.fire(...)`.
- Gathering loop: GATHER_MOVING → HARVESTING (`ECONOMY.HARVEST_TIME`) →
  `node.harvest(trip)` → RETURNING to nearest own `isDropOff` building →
  `player.deposit(...)` (AI incomeMultiplier applied by Player) → repeat
  until node depleted (then idle or auto-retarget nearest same-type node).
- FLEEING: forced move toward `player.basePosition`; ignores auto-acquire
  until `fleeUntil`.
- Unit visuals: capsule body tinted `player.color`, small darker head; a
  hidden selection ring; +y so feet touch ground. Keep geometry shared
  (module-level cached geometries/materials per player color).

### entities/Building.js — `export class Building extends Entity`
```js
constructionRemaining   // seconds; >0 → scaffold state (scale-y grows, no production)
productionQueue         // [{typeId, remaining}] max 5
rallyPoint              // THREE.Vector3
queueUnit(typeId): boolean   // checks player.canAfford + supply; spends immediately
setRallyPoint(pos)
update(dt)              // construction progress; pops queue → entities.spawnUnit at rally
```
On construction complete: apply `providesSupply`, emit BUILDING_COMPLETE,
register static collider via `physics.addStaticBox`. Box mesh footprint from
`type.radius`, color tinted by owner.

### entities/ResourceNode.js — `export class ResourceNode extends Entity`
```js
constructor(engine, kind /* 'GOLD_MINE'|'AETHER_WELL' */, position)
kind, amount          // from ECONOMY config
harvest(requested): number   // min(requested, amount); emits RESOURCE_DEPLETED at 0 then die()
```
Neutral (player = null). Distinct silhouettes: gold = squat yellow crystal
cluster, aether = tall cyan spire. Registers a static cylinder collider.

### entities/EntityManager.js
```js
export class EntityManager {
  constructor(engine)
  units: Unit[]; buildings: Building[]; resources: ResourceNode[]; all: Entity[]
  spawnUnit(typeId, player, position): Unit          // emits UNIT_SPAWNED; adds supplyUsed
  spawnBuilding(typeId, player, position, {instant=false}): Building
  spawnResourceNode(kind, position): ResourceNode
  remove(entity): void                               // scene/physics/nav cleanup
  getById(id): Entity | undefined
  /** Spatial query — iterate linearly in v1 (≤ a few hundred entities), but
   *  through a single shared scratch array to avoid garbage. */
  getUnitsInRadius(pos, radius, predicate?): Unit[]
  findNearestEnemy(entity, maxDist): Unit | Building | null  // respects alliances (FFA hostile to all)
  getPlayerUnits(playerId): Unit[]; getPlayerBuildings(playerId): Building[]
  update(dt): void      // updates all, reaps isDead (deferred to end of pass)
  dispose(): void
}
```
Hostility rule: `a` hostile to `b` ⇔ different players AND
`!a.player.isAlliedWith(b.player)` (neutral entities are never hostile).

### entities/Projectile.js + ProjectilePool.js
```js
export class ProjectilePool {
  constructor(scene, size = GAME_CONFIG.COMBAT.PROJECTILE_POOL_SIZE)
  /** Homing WC3-style bolt: tracks target until impact, then applies damage.
   *  If target dies mid-flight the bolt fizzles at last position. */
  fire({ source, target, speed, rawDamage, attackType, color }): void
  update(dt): void
  dispose(): void
}
```
Pool contract: fixed-size ring of small glowing meshes (shared geometry +
per-instance material color via one mesh per slot); `fire` reuses the oldest
inactive slot; **zero allocation** after construction.

### combat/CombatSystem.js
```js
export class CombatSystem {
  constructor(engine)
  update(dt): void
  dispose(): void
}
```
Owns global combat concerns that aren't per-unit: periodic target
re-acquisition for IDLE/ATTACK_MOVING units (staggered — check ~1/8 of units
per frame), and the victory sweep helper `checkVictory()` the engine calls on
its interval: a player with zero buildings AND zero units → defeated
(emit PLAYER_DEFEATED); if every surviving player is mutually allied →
MATCH_ENDED (winners/losers), and set `useGameStore` matchOutcome to
VICTORY/DEFEAT from the local player's perspective.

---

## 7. World contracts

### world/TerrainManager.js
```js
export class TerrainManager {
  constructor(engine)
  build(): void
  groundMesh                 // receives shadows; fog shader is applied by FogOfWar
  size                       // { width, depth } from GAME_CONFIG.MAP
  getHeightAt(x, z): number  // 0 in v1 (flat); API future-proofs hills
  getBounds(): {minX,maxX,minZ,maxZ}   // play area minus CAMERA.BOUNDS_MARGIN
  /** 8 start locations on the BASE_RING_RADIUS circle, index-stable:
   *  [{ position, goldPos, aetherPos }] — resource spots ~14u from the hall,
   *  angled to sit away from map center. */
  startLocations: Array<{position, goldPos, aetherPos}>
  /** Neutral expansion nodes near the center: [{kind, position}] */
  neutralNodes: Array<{kind, position}>
  dispose(): void
}
```
Ground: a sculpted `PlaneGeometry(WIDTH, DEPTH, 128, 128)` whose vertices are
displaced by a per-map **height recipe** (`layout.terrain`: rolling-hill FBM +
domain warp, optional central basin, lake dips, border-mountain rim). Vertex
colour is near-white brightness modulation only, so the textures show through.
`getHeightAt`/`isWalkable` read the recipe (no longer flat).

**Texturing is biome-driven and seamless** (the "beautiful environments" goal):
- `world/Biomes.js` is the single source of truth — one entry per biome bundles
  its 5 terrain-surface layers (grass/soil/rock/sand/accent, each a procedural
  recipe), the height/slope/shore/peak splat **rules**, water/tree/rock/crystal/
  minimap palettes, and a landmark style. `Maps.js`/`MapLayouts.js` derive from
  it: 5 built-in maps (`verdant_reach` default, `amber_savanna`, `frostmere`,
  `emberfall`, `moonlit_marsh`), each a compact symmetric recipe.
- The splat mask is painted from the **sculpted terrain** (rock on slopes, shore
  near water, snow/crust on peaks, soil/accent noise patches), not arbitrary
  noise — texturing follows real contours.
- `TerrainTextureRegistry.js` layers are blended in a `MeshStandardMaterial`
  `onBeforeCompile` shader using **height-based blending** (detail-luminance
  interlock instead of a linear fade) + **macro variation** (large-scale noise
  breaks up tiling). All surfaces are generated procedurally in
  `ProceduralTextures.js` (no shipped map textures).

Doodads: **one `InstancedMesh`** of biome crystal shards scattered via seeded
PRNG, kept outside base/resource clearings and dense near map edges. Trees,
rocks, shrubs, flowers, lakes and landmarks are all biome-palette driven. A
faint grid helper is toggled off by default.

### world/FogOfWar.js  (dual-layer: black unexplored / grey explored)
```js
export class FogOfWar {
  constructor(engine, resolution = GAME_CONFIG.FOG.RESOLUTION)
  texture            // THREE.DataTexture RGBA — R = currently visible, G = explored
  update(dt): void   // throttled to FOG_UPDATE_HZ:
                     //   1) clear R channel; 2) stamp filled circles (row-span
                     //   algorithm, no per-texel sqrt) for every vision source =
                     //   local player + allied units/buildings (sightRadius);
                     //   3) needsUpdate; 4) refresh enemy mesh visibility.
  applyToGround(material): void   // onBeforeCompile injection (see below)
  isVisible(worldPos): boolean    // CPU-side sample of R
  isExplored(worldPos): boolean   // CPU-side sample of G
  dispose(): void
}
```
Shader injection: vertex adds `varying vec3 vWorldPos`; fragment samples
`fogMap` with uv = (worldPos.xz / mapSize) + 0.5 and multiplies
`gl_FragColor.rgb`/`outgoingLight` by
`mix(UNEXPLORED, mix(EXPLORED_BRIGHTNESS, 1.0, visible), explored)`.
LinearFilter gives soft edges for free. Enemy units/buildings:
`mesh.visible = fog.isVisible(entity.position)` (explored-but-hidden
buildings stay visible as "last seen" — acceptable v1 simplification, noted
in code). Local/allied entities are always visible.

### world/MenuBackgroundScene.js  (menu ambience — independent of the engine)
```js
export class MenuBackgroundScene {
  constructor(canvas)   // its own renderer/scene/camera; transparent-dark theme
  start(): void         // own rAF loop: slow-drifting glowing crystals, particles, fog
  stop(): void
  dispose(): void
}
```
Owned by React (MainMenu/MatchLobby mount it on a full-screen canvas they
render behind the panels). Must be cheap (< 2 ms/frame) and fully disposed on
unmount.

---

## 8. Physics division of labor (Rapier)

- Gravity zero; simulation is top-down 2.5D.
- **Static colliders:** buildings (box), resource nodes + large doodads (cylinder).
- **Units:** kinematic position-based body + capsule + one shared
  `KinematicCharacterController` (offset ~0.05). Steering (Yuka) proposes a
  displacement; `physics.moveUnit` corrects it against static geometry so
  units *slide around buildings* instead of clipping.
- **Unit-vs-unit crowding:** Yuka `SeparationBehavior` (soft, flow-friendly),
  NOT rigid-body collision — WC3 crowds are squishy.
- **Projectiles:** homing, pure math — no rapier bodies (pool of 256).
- Rapier is stepped every frame with `world.timestep = dt` (clamped).

---

## 9. AI contracts (`src/ai/`)

### AIManager.js
```js
export class AIManager {
  constructor(engine)
  controllers: Map<playerId, AIPlayerController>
  registerPlayer(player /* Player, type==='AI' */): void  // engine calls at init
  update(dt): void   // ticks every controller; controllers self-throttle and
                     // stagger their think offsets so brains never all fire
                     // on the same frame (offset = index * 0.35s)
  dispose(): void
}
export class AIPlayerController {
  constructor(engine, player)
  profile   // AI_PROFILES[player.difficulty]
  macro     // MacroBrain
  micro     // MicroBrain
  update(dt): void
}
```

### macro/MacroBrain.js — economy & production FSM
```js
export class MacroBrain {
  constructor(engine, player, profile)
  state        // 'BOOTSTRAP'|'GROW_ECONOMY'|'BUILD_ARMY'|'EXPAND'|'ASSAULT'|'DEFEND'
  update(dt)   // gates think() by profile.thinkInterval
  think()      // FSM transition + one or two concrete actions per think
  dispose()
}
```
Responsibilities (each as a small private method — keep it legible):
- Follow `BuildOrders.getOrder(race, difficulty)` while it lasts, then switch
  to reactive rules (supply headroom < 4 → supply building; barracks idle →
  queue army; workers < target → queue worker).
- `EconomyPlanner.rebalance()` each think — assigns idle workers to nodes at
  the difficulty's gold:aether ratio.
- DEFEND: if `ThreatMap.threatNear(basePosition)` exceeds own home power,
  pull army home (delegate targets to micro).
- EXPAND: if safe (low map threat, bank > expansion cost), order a new hall
  at the nearest unclaimed neutral/start resource spot.
- ASSAULT: army value > enemy estimate * (1.6 − aggression) → pick weakest
  known enemy base; hand objective to `micro.setAttackObjective(pos)`.
- All spending goes through `player.canAfford`/`spend`; building placement
  via spiral-search for a clear spot near the base (use
  `entities.getUnitsInRadius` + terrain bounds; keep 3u clearance).
- Emit `EVENTS.AI_STATE_CHANGED` on FSM transitions.

### macro/BuildOrders.js
```js
export function getOrder(raceId, difficulty): Array<Step>
// Step = { action:'TRAIN'|'BUILD'|'EXPAND'|'ATTACK_AT', role:'worker'|'melee'|..., count?, supplyTrigger? }
```
Data-only module. EASY = short, worker-light order; MEDIUM = standard
macro-cycle; INSANE = tight order tuned around its income cheat.

### macro/EconomyPlanner.js
```js
export class EconomyPlanner {
  constructor(engine, player)
  goldRatio         // target fraction of workers on gold (per difficulty)
  rebalance(): void // finds IDLE workers → orderGather(best node); nodes chosen
                    // by distance + current worker saturation (≤5 per node)
  workerCounts(): { gold, aether, idle }
  dispose()
}
```

### macro/ThreatMap.js
```js
export class ThreatMap {
  constructor(engine, player, profile)
  update(): void            // decays cells; stamps enemy power into a coarse
                            // grid (16×16 over the map). profile.omniscient
                            // sees everything; otherwise only enemies within
                            // sight of this player's own entities.
  threatAt(worldPos): number
  threatNear(worldPos, radius = 30): number
  hottestCell(): {position, threat} | null
  dispose()
}
```

### micro/MicroBrain.js — combat tactics
```js
export class MicroBrain {
  constructor(engine, player, profile)
  setAttackObjective(pos | null): void   // macro hands down a push target
  update(dt)    // gates tick() by profile.microInterval; no-op if !profile.microEnabled
  tick()
  dispose()
}
```
Per tick, for this player's combat units (skip workers unless base attacked):
- **Focus fire:** for units in combat, find enemies within `sightRadius`;
  retarget everyone onto the enemy with the lowest *absolute* HP (classic
  WC3 focus), with a small stickiness bonus for the current target to avoid
  thrash.
- **Kiting:** RANGED archetype with `attackCooldown > 0.25` and a hostile
  MELEE unit within `0.6 * attackRange` → `orderMove` to a point directly
  away from that enemy (distance ≈ 4u), resuming attack when cooldown clears.
- **Retreat:** unit hp < `COMBAT.RETREAT_HP_FRACTION` AND
  `CombatEvaluator.localBalance(unit)` < 1 (outnumbered) → set FLEEING toward
  `player.basePosition` with `RETREAT_LOCKOUT`.
- **Objective:** units not in combat and an objective is set →
  `orderAttackMove(objective)`.

### micro/CombatEvaluator.js
```js
export function unitPower(unit): number        // dps × effective hp heuristic
export function armyPower(units): number
export function localBalance(engine, unit, radius = 14): number // ally/enemy power ratio near unit
```

---

## 10. Audio contract (`src/audio/AudioManager.js`)

```js
export const SOUND_MANIFEST = {
  music: { menu: '/assets/audio/music_menu.mp3', battle: '/assets/audio/music_battle.mp3' },
  sfx:   { click: ..., attack_melee: ..., attack_ranged: ..., unit_die: ..., build_place: ... },
}
export class AudioManager {
  constructor()
  async init(): Promise<void>   // create Howls lazily; missing files → warn once, never throw
  attachCamera(camera): void
  update(dt): void              // Howler.pos/orientation ← camera (3D spatial)
  playMusic(key, { fade = 1000 } = {}): void
  playSfx(key, { position, volume = 1 } = {}): void  // positional via howl.pos when given
  playUnitResponse(typeId, kind /* 'select'|'move'|'attack' */): void // 400ms anti-spam per kind
  setMasterVolume(v): void
  stopAll(): void
  dispose(): void
}
```
No audio files ship in v1 — **every path must fail soft** (Howler `loaderror`
→ mark key dead, log once). The manifest + spatial plumbing is the deliverable.

Wire-up via eventBus subscriptions inside AudioManager (UNIT_DAMAGED →
impact sfx throttled, UNIT_DIED → death sfx, BUILDING_PLACED → build sfx,
MATCH_STARTED → battle music).

---

## 11. UI contracts (`src/ui/`)

- **App.jsx** — routes on `useLobbyStore((s) => s.screen)`:
  MAIN_MENU→`<MainMenu/>`, LOBBY→`<MatchLobby/>`, LOADING→`<LoadingScreen/>`,
  IN_GAME→`<GameHUD/>`. Owns the LOADING effect:
  ```js
  useEffect(() => { if (screen !== SCREENS.LOADING) return;
    let cancelled = false;
    bootstrapMatch(pendingMatchConfig)
      .then(() => !cancelled && onMatchReady())
      .catch((err) => { console.error(err); !cancelled && onMatchFailed(String(err?.message ?? err)); });
    return () => { cancelled = true; };
  }, [screen]);
  ```
- **MainMenu.jsx** — full-screen; mounts `MenuBackgroundScene` on its own
  `<canvas>` (create in effect, dispose on unmount). Title "AETHER THRONE",
  subtitle "by Aljay Leodones". Buttons: *Play* (→LOBBY), *Options* &
  *Credits* (toast/inline panel "coming soon" is fine), *Exit*. GSAP
  entrance animation (staggered fade/rise) — respect reduced-motion.
- **MatchLobby.jsx** — keeps the background scene; renders the 8
  `<PlayerSlot/>` rows, a map info card (Crystal Basin, 2–8 players, static
  minimap-style SVG/CSS art), lobby error list, *Back* and *Start Battle*
  (disabled unless `canStart()`; shows why via lobbyErrors).
- **PlayerSlot.jsx** — props `{ slot }`; reads actions from the store.
  Controls per row: occupancy button (Human locked on slot 0; others cycle
  AI/Closed), race `<select>`, team `<select>` (FFA/Team 1/Team 2 via
  TEAM_LABELS), AI difficulty `<select>` (AI slots only), color swatch
  (fixed per slot). Closed slots render dimmed with controls disabled.
- **LoadingScreen.jsx** — indeterminate aether-pulse bar + rotating flavor tips.
- **GameHUD.jsx** — root `div.hud-root` with `pointer-events: none`;
  interactive children re-enable. Top bar: gold/aether/supply/game clock/fps
  from `useGameStore`. Bottom-left: selection card grid (portrait = color
  block + name + hp bar; first 24). Bottom-right: command card placeholder
  (Phase 5). Victory/defeat banner from `matchOutcome` with *Return to Menu*
  → `teardownMatch()` then `exitToMenu()` + `resetGameState()`. A small menu
  button offering "Surrender/Exit" does the same teardown.
- **styles/ui.css** — the entire theme. Dark royal fantasy: deep
  blue-black panels, gold (#c9a227) accents, cyan aether glow; translucent
  bordered panels (backdrop-filter blur), serif display font for titles
  (system serif stack fine), `div.selection-marquee` styling
  (1px gold border, translucent gold fill). All buttons keyboard-focusable.

UI components must never import from `src/engine/` **except**
`GameBootstrap.js` (App/GameHUD) — simulation access goes through the stores.

---

## 12. Phase roadmap (what's real in v1 vs. stubbed)

| Phase | Delivered in this scaffold | Deferred (leave clear TODO hooks) |
|---|---|---|
| 1 Menu/Lobby | Fully functional | Networked lobby, saved presets |
| 2 Engine/Controls | Camera, marquee, groups, smart commands — functional | Shift-queueing, patrol, minimap |
| 3 Nav/Fog/Combat | Steering+separation, flat navmesh path API, dual-layer fog shader, full stat combat + projectiles | Baked navmesh w/ obstacle holes, formations v2, height advantage |
| 4 AI | Macro FSM + build orders + economy + threat map; micro focus/kite/retreat | Behavior-tree upgrade, scouting patterns, wall-ins |
| 5+ | — | Hero units, abilities/mana spending, items, save/replay, multiplayer lockstep |

Mark every deferred item in code as `// TODO(phase-N): ...`.
