# Aether Throne — Phase 5 "Warcraft 3 Parity" Implementation Prompt

**Author of record:** Aljay Leodones · **Engineered from a raw feature request into a build spec.**

This document is a *ready-to-execute prompt*. It takes the raw wishlist below and turns it
into concrete, contract-accurate work items grounded in the existing codebase
(`ARCHITECTURE.md` is the binding contract; do not violate it). Every feature names the
real files, events, methods, and stores it touches. Anything not already in the scaffold is
specified as a **new contract** in the same style as `ARCHITECTURE.md`.

> **Prime directive:** *Make this feel like Warcraft 3.* Fidelity to WC3's game feel —
> selection, command card, portraits, unit chatter, floating text, minimap, formations —
> beats raw feature count. When a choice is ambiguous, choose the WC3 behavior.

---

## 0. Raw request (verbatim, for traceability)

1. Actual 3D models — unique per unit type, with animations + effects.
2. Floating combat text (`+2`) when workers return Gold or Aether.
3. Spoken warning ("Not enough Gold." / "Not enough Aether.") on unaffordable build/research/train.
4. A real, awesome minimap.
5. Selection-box (marquee) multi-select.
6. Double-click a unit → select all of that type on screen.
7. Unit portraits + unit stats in the bottom UI.
8. A Warcraft 3-style bottom UI with working unit/building command functions.
9. Unit formations for multi-selected groups, with UI buttons to change formation.
10. Overall: as close to Warcraft 3 as possible.

*(Items 5 and part of 8 already partly exist — see "Current state" per feature. The spec
below both completes them and adds the WC3 systems they imply: functional command card with
hotkeys, building-placement mode, rally flags, research/upgrades, hold/patrol, floating
health bars, idle-worker cycling, subgroup tabs, and a store↔engine intent channel that the
scaffold deliberately left out.)*

---

## 1. Non-negotiable constraints (inherited from ARCHITECTURE.md)

Read these before writing a line — every new module is judged against them:

- **ES modules, relative imports keep the file extension** (`./Foo.js`).
- **No per-frame allocations in hot loops.** Pool everything (follow the `ProjectilePool`
  and `CommandSystem` marker-pool patterns). Reuse module-scope scratch `THREE.Vector3`s.
- **No `Date.now()` / `Math.random()` in simulation logic** — use accumulated `dt`
  (`engine.gameTime`) and a seeded PRNG for anything deterministic. Presentation-only
  throttles (audio, voice) may use `performance.now()` (as `AudioManager` already does).
- **Every system with DOM listeners or GPU resources implements `dispose()`** and is torn
  down by its owner.
- **One-way data flow for the HUD:** engine → `useGameStore` → React. The HUD must never
  hold a live `Entity`. The *only* engine import allowed in UI is `GameBootstrap.js`
  (`App.jsx` / `GameHUD.jsx`). Player intent from HUD buttons flows back through a **new
  sanctioned intent channel** (§3.8), not by mutating simulation state from React.
- **Fail-soft assets.** `AssetLoader` returns `null` on 404 and the game must boot
  identically with zero art/audio files. Any new asset path obeys this.
- **Thoroughly commented, JSDoc on every class/public method** — this is an educational
  scaffold. New modules match that density.
- Update the **per-frame update order** in `GameEngine` only in the documented slots, and
  document any addition in this file + `ARCHITECTURE.md`.
- Mark anything intentionally deferred `// TODO(phase-6): ...`.

---

## 2. Key decisions (resolve before building — recommended defaults marked ★)

These forks materially change the work. Defaults are chosen to honor the "ships zero
assets / fail-soft / deterministic / in-repo" ethos of the scaffold.

| # | Decision | ★ Recommended | Alternative | Why the default |
|---|----------|---------------|-------------|-----------------|
| D1 | **Unit/building art** | ★ **Procedural models** — composed from Three.js primitives per type, with a lightweight code-driven animator (idle bob, walk cycle, attack swing/recoil, death topple). GLTF-ready seam so real assets drop in later via `AssetLoader.loadGLTF`. | Author/source **GLTF** models + skeletal clips (needs art pipeline + licensing + `AnimationMixer` integration). | Zero assets, deterministic, versionable, no licensing, and every one of the 18 types gets a distinct silhouette *today*. GLTF stays a clean drop-in upgrade. |
| D2 | **Voice ("Not enough Gold")** | ★ **Web Speech API** (`window.speechSynthesis`) wrapped in `AudioManager.speak()`, with per-phrase anti-spam; silent no-op if unsupported. | Pre-recorded VO `.mp3` in `SOUND_MANIFEST`. | Instant, cross-browser, zero assets, matches fail-soft. Manifest override can layer real VO later (the manifest already anticipates `unit_<typeId>_<kind>` keys). |
| D3 | **Minimap render** | ★ **2D `<canvas>`** redrawn ~12 Hz from entity positions + terrain tint + fog sample; supports click-to-pan, click-to-command, camera-frustum box, and pings. | Second WebGL top-down render-to-texture camera. | WC3-authentic, cheap, no extra GL pass, trivial input mapping. |
| D4 | **Portraits** | ★ **Procedural 2D portrait** per type (canvas/SVG crest + faction palette), "talking" pulse when a voice line plays. | Live 3D portrait via offscreen render target composited into a HUD `<canvas>`. | No render-target↔React bridge; crisp at any DPI; 3D portrait remains a stretch goal. |
| D5 | **Floating text transport** | ★ **Pooled `THREE.Sprite` layer** in the scene (world-anchored, rises + fades, glyph-texture cache, zero per-frame alloc). | DOM overlay projected to screen each frame. | World-anchored (occludes correctly, scales with zoom), matches the pooling ethos, no DOM churn. |

---

## 3. Feature specs

Each spec: **Goal · Current state · Approach · New/changed contracts · Acceptance criteria.**

### 3.1 Unique animated 3D models per unit type (raw #1)

**Goal.** Each of the 18 `UNIT_TYPES` entries renders as a visually distinct, animated model;
buildings and resource nodes likewise. Workers, melee, ranged read at a glance; the three
races (Aether Knights / Void Stalkers / Core Elementals) share a silhouette language but
differ in palette + form.

**Current state.** `Unit` builds a cached capsule body + sphere head tinted by owner color
(`src/entities/Unit.js`, `getBodyGeometry`/`getHeadGeometry`); `Building` is a tinted box;
`ResourceNode` is a crystal cluster / spire. All geometry/material is module-cached by
radius + `colorHex` (keep this — it is the perf backbone).

**Approach.**
- New module **`src/entities/models/UnitModelFactory.js`** — `buildModel(type, colorHex) →
  { root: THREE.Group, parts: {...}, rig }`. Composes primitives (capsule/box/cone/cylinder/
  torus/lathe) into a per-archetype **and** per-race silhouette. `parts` names animatable
  bones/pivots (e.g. `torso`, `weaponArm`, `legL`, `legR`, `head`). Geometry + materials are
  cached at module scope keyed by `type.id + colorHex` exactly like today, so N units of a
  type share GPU resources.
- New module **`src/entities/models/UnitAnimator.js`** — a tiny, allocation-free procedural
  animator: `UnitAnimator.apply(rig, state, dt, gameTime, phase)` rotates/offsets named
  pivots for `IDLE` (breathing bob), `MOVING` (leg + arm swing, speed-scaled), `ATTACKING`
  (wind-up → strike → recoil synced to `attackCooldown`), `DEAD` (topple + sink). Uses the
  unit's existing FSM `state` (`UNIT_STATES`) and a per-unit `_animPhase` accumulator. No
  `AnimationMixer`, no clips, no skinning — pure hierarchy transforms.
- Wire in `Unit`: replace the capsule/head construction with `UnitModelFactory.buildModel`;
  call `UnitAnimator.apply(...)` at the end of `Unit.update(dt)` (after the FSM sets state).
  Keep the selection ring + cargo cube behavior intact.
- **Effects** (new **`src/fx/EffectsManager.js`**, `engine.fx`): pooled, event-driven —
  muzzle flash / impact spark on `UNIT_DAMAGED`, death puff on `UNIT_DIED`, build dust on
  `BUILDING_PLACED`, gather sparkle on deposit. Same fixed-pool, zero-alloc pattern as
  `ProjectilePool`. Projectiles get per-race tints (already have `projectile.color`).
- **GLTF seam (D1):** `UnitModelFactory` first tries `engine.assets` for an optional
  `type.model` GLTF; on `null` (the default, no files) it falls back to the procedural build.
  Document `// TODO(phase-6): skeletal GLTF via AnimationMixer` at that seam.

**New contracts.**
```js
// src/entities/models/UnitModelFactory.js
export function buildModel(type, colorHex): { root: THREE.Group, parts: object, rig: object }
export function disposeModelCaches(): void   // called from a global teardown if needed
// src/entities/models/UnitAnimator.js
export function apply(rig, state, dt, gameTime, unitAnimState): void
// src/fx/EffectsManager.js
export class EffectsManager { constructor(engine); spawn(kind, position, opts?); update(dt); dispose(); }
```
Add `fx // EffectsManager` to the `GameEngine` subsystem list and a `fx.update(dt)` slot in
the per-frame order (after `projectiles.update`, before `ai.update`).

**Acceptance.** Each type is visually distinguishable at default zoom; units visibly walk,
swing on attack, and topple on death; a 200-unit battle holds frame rate (shared caches
verified: GPU resource count scales with *types × colors*, not entities); zero art files
present → still boots and renders procedural models.

---

### 3.2 Floating resource text `+N` on deposit (raw #2)

**Goal.** When a worker delivers gold/aether, a `+N` rises and fades over the drop-off in the
resource's color (gold `#c9a227`, aether `#5fe0ff`).

**Current state.** Gathering loop in `Unit` calls `player.deposit(...)` on `RETURNING`
completion; only `RESOURCES_CHANGED` is emitted. No world text system exists.

**Approach.**
- New **`src/fx/FloatingTextManager.js`** (`engine.floatingText`, D5): pooled `THREE.Sprite`s
  with a small cached glyph-atlas canvas texture. `spawn(worldPos, text, colorHex, opts)`
  grabs the oldest free slot, sets the sprite's canvas text, and animates rise (`+y`) + fade
  over ~1.0 s in `update(dt)`. Fixed pool (e.g. 48), zero alloc after construction.
- Emit a new event on deposit and let the manager listen (keeps `Unit` decoupled):
  `EVENTS.RESOURCE_DEPOSITED { player, kind:'gold'|'aether', amount, position }` from the
  deposit site in `Unit`'s gather FSM. `FloatingTextManager` subscribes and spawns text
  **only for the local player** (don't clutter with AI economy).
- Reuse the same manager for **floating damage numbers** (§3.10 stretch) and the "Not enough
  X" on-screen flash (§3.3) — one text system, many callers.

**New contracts.**
```js
// src/fx/FloatingTextManager.js
export class FloatingTextManager {
  constructor(engine, poolSize = 48)
  spawn(worldPos /*THREE.Vector3*/, text /*string*/, colorHex /*number|string*/, opts?)
  update(dt); dispose()
}
// EventBus.js — add:
RESOURCE_DEPOSITED: 'economy:resourceDeposited', // { player, kind, amount, position }
```
Add `floatingText.update(dt)` to the frame order (next to `fx`).

**Acceptance.** Delivering a gold trip pops a gold `+N` at the hall that rises and fades; an
aether trip pops cyan; AI deposits produce no text; spamming deposits never allocates
(pool wraps) and never desyncs from the actual `resources.gold` shown in the top bar.

---

### 3.3 Spoken "Not enough Gold/Aether/Supply" (raw #3)

**Goal.** Any *local-player* attempt to train/build/research that fails affordability speaks
the correct phrase and shows a matching HUD toast + a red flash on the relevant top-bar chip.

**Current state.** `Building.queueUnit` checks `player.canAfford` and returns `false`
silently. `Player.canAfford/spend` exist. No error feedback path.

**Approach.**
- Add **`Player.affordShortfall({gold, aether, supply}) → 'GOLD'|'AETHER'|'SUPPLY'|null`**
  (first unmet resource; supply respects the "cost 0 supply skips headroom" rule already
  fixed in `canAfford`). Non-mutating.
- All *player-initiated* purchase entry points (command-card train/build/research in §3.8,
  and `Building.queueUnit` when triggered by the local player) call `affordShortfall` first;
  on non-null they emit `EVENTS.COMMAND_REJECTED { player, reason }` instead of proceeding.
- **`AudioManager.speak(text, {dedupeMs = 1500})`** (D2): `window.speechSynthesis` with a
  short queue + per-text anti-spam; silent no-op if `speechSynthesis` is undefined. Subscribe
  `AudioManager` to `COMMAND_REJECTED` → speak `"Not enough Gold."` / `"Not enough Aether."`
  / `"You must construct additional supply."` (WC3 nods welcome), **local player only**.
- HUD: `GameHUD` (via `useGameStore.notifications`) shows a `warn` toast; the relevant top-bar
  chip (`res-gold` / `res-aether` / `res-supply`) briefly flashes (new `ui.css` keyframe,
  toggled by a transient store flag `resourceAlert`).

**New contracts.**
```js
// Player.js — add:
affordShortfall({ gold=0, aether=0, supply=0 }): 'GOLD'|'AETHER'|'SUPPLY'|null
// AudioManager.js — add:
speak(text, { dedupeMs = 1500 } = {}): void
// EventBus.js — add:
COMMAND_REJECTED: 'command:rejected', // { player, reason:'GOLD'|'AETHER'|'SUPPLY' }
// useGameStore.js — add: resourceAlert: null | 'GOLD'|'AETHER'|'SUPPLY', flashResource(reason)
```

**Acceptance.** With < cost gold, clicking a train button (or hotkey) speaks "Not enough
Gold.", shows a warn toast, flashes the gold chip, and does **not** spend or queue; an AI
hitting the same wall is silent; toggling OS speech off degrades to toast-only without error.

---

### 3.4 Awesome minimap (raw #4)

**Goal.** Bottom-left (or bottom-right, WC3 puts it bottom-left) minimap: terrain, owned
units (team-colored dots), enemies (only where visible per fog), buildings (larger marks),
resource nodes, the camera view rectangle, and blips. Left-click/drag pans the camera;
right-click issues the current smart-command at that world point; alt/ping support.

**Current state.** None in-match (a static SVG map card exists only in the lobby). Marked
"minimap" TODO in Phase 2.

**Approach (D3).**
- New **`src/ui/hud/Minimap.jsx`** owning a `<canvas>` (interactive island). It reads a
  compact, throttled snapshot from `useGameStore.minimap` (never live entities):
  `{ size:{width,depth}, blips:[{x,z,color,kind}], camera:{x,z,halfW,halfD,angle}, fog?:Uint8 }`.
- Engine side: a new **`src/ui/MinimapModel.js`** helper (owned by `GameEngine`, pushed on a
  ~12 Hz throttle alongside HUD sync) builds that snapshot from `entities`, `localPlayer`,
  `fog.isVisible`, and the camera focus/bounds. Enemy blips gated by `fog.isVisible`.
- Input: canvas pixel → world via `terrain.size` and bounds; left → `cameraController.panTo`;
  right → reuse `CommandSystem` smart-command at that world point (expose
  `engine.commands.issueAt(worldVec, { attackMove })` so both the 3D canvas and minimap share
  one dispatch path). Pings: `Alt+click` broadcasts a ping blip (store-driven, fades).
- Blip alerts: on `UNIT_DAMAGED` to a local entity off-screen, flash a red ping ("Your forces
  are under attack").

**New contracts.**
```js
// src/ui/MinimapModel.js
export class MinimapModel { constructor(engine); sample(): MinimapSnapshot; dispose(); }
// engine.commands — add:
issueAt(worldVec3, { attackMove = false } = {}): void   // shared 3D-canvas + minimap dispatch
// useGameStore.js — add: minimap snapshot slice + setMinimap(snapshot), pings
```

**Acceptance.** Minimap shows terrain + correctly team-colored blips; enemies appear/vanish
with fog; the camera rectangle tracks scrolling and rotates if the camera yaws; left-drag
pans; right-click moves/attacks the selection to that spot; off-screen attack pings flash;
redraw stays ≤ ~1 ms and allocates nothing per frame beyond the snapshot.

---

### 3.5 Selection-box multi-select (raw #5) — *complete the existing marquee*

**Goal.** Robust left-drag marquee selecting all local units in the rect; WC3 modifiers.

**Current state.** Implemented in `src/input/SelectionSystem.js` (≥4px drag →
`div.selection-marquee`, project positions, select on release; Ctrl±add; control groups).

**Approach.** Polish, don't rebuild: (a) **Shift = add to selection**, **Ctrl+drag = subtract**;
(b) prefer-units rule — if the marquee contains any of your own *units*, ignore buildings and
enemy/neutral (WC3 never box-selects buildings alongside units); (c) cap combat selection
appropriately but keep the HUD "+N more" overflow; (d) ensure marquee `dispose()` removes the
DOM node on teardown. Emit `SELECTION_CHANGED` and push the (now richer, §3.7) snapshot.

**Acceptance.** Dragging over a mixed field selects only your units; shift-drag unions;
ctrl-drag removes; releasing on empty ground clears; no orphaned marquee div after exit.

---

### 3.6 Double-click → select all of type on screen (raw #6)

**Goal.** Double-clicking an owned unit selects every unit of the **same `typeId` currently
on screen** (WC3 semantics).

**Current state.** Explicitly deferred: TODO in `SelectionSystem` and `GameHUD` selection card
("needs a store→engine intent channel that v1 deliberately does not have").

**Approach.**
- In `SelectionSystem`, track `_lastClick = { id, t }` in `engine.gameTime`; a second
  left-click on the same entity within `DOUBLE_CLICK_S` (~0.35 s, mirrors the control-group
  double-tap window) triggers select-all-of-type.
- "On screen" = units whose projected NDC is within `[-1,1]²` (reuse the marquee projection
  path). Filter to `unit.player === localPlayer && unit.type.id === hit.type.id`.
- Portrait double-click (HUD) does the same via the §3.8 intent channel
  (`engine.selection.selectAllOfTypeOnScreen(typeId)`), satisfying the `GameHUD` TODO.

**New contracts.**
```js
// SelectionSystem.js — add:
selectAllOfTypeOnScreen(typeId): void   // also callable from the HUD intent channel
```

**Acceptance.** Double-clicking a Templar selects all on-screen Templar (not off-screen ones,
not other types); double-clicking a portrait card does the same; single-clicks still behave.

---

### 3.7 Unit portraits + stats in the bottom UI (raw #7)

**Goal.** Single-selection shows a **portrait** + full WC3 stat readout (name, HP, mana,
armor + type, attack (damage range + type), attack speed, range, move speed, sight); multi-
selection shows the portrait grid with HP/mana bars (as today) and a subgroup summary.

**Current state.** `GameHUD.SelectionPanel` renders color-strip "portraits" + HP/mana bars
from the snapshot `{ id, typeId, name, hp, maxHp, mana, maxMana, color }`.

**Approach.**
- **Extend the selection snapshot** (contract change in `SelectionSystem` + `useGameStore` +
  `ARCHITECTURE.md §5`) to carry the static stat block for single-select info:
  `{ id, typeId, name, hp, maxHp, mana, maxMana, color, archetype, level?, armor, armorType,
  attackType, damageMin, damageMax, attackSpeed, attackRange, moveSpeed, sight }`. Static
  fields come straight from the frozen `type`; only hp/mana refresh at ~5 Hz.
- **Portrait (D4):** new `src/ui/hud/Portrait.jsx` renders a per-type procedural crest
  (faction palette + archetype glyph via canvas/SVG). A `talking` prop pulses it when a voice
  line plays (subscribe to a store flag set on `playUnitResponse` / `speak`).
- **Info panel:** new `src/ui/hud/UnitInfoPanel.jsx` for single-select stats; the multi-select
  grid stays but each card becomes clickable (sub-select) / double-clickable (§3.6) through
  the intent channel.

**New contracts.** Snapshot shape above (update `ARCHITECTURE.md §5` and `useGameStore` doc).

**Acceptance.** Selecting one Arbalist shows its portrait + "15–21 Pierce / 0 armor Light /
9 range / 5.4 speed …"; selecting a group shows the grid; hp bars track damage live; clicking
a card sub-selects that single unit.

---

### 3.8 Functional Warcraft 3 command card + intent channel (raw #8)

**Goal.** The bottom-right command card becomes a real 4×3 WC3 grid, context-sensitive to the
selection, with hotkeys, cost tooltips, cooldown/queue state, and working actions:
- **Worker selected:** Build menu → Hall / Barracks / Supply (enters placement mode, §3.9);
  Gather, Return Cargo, (Repair — stretch).
- **Production building selected:** Train buttons for that race's units; Set Rally; research/
  upgrade buttons; live 5-slot production queue with progress + cancel.
- **Combat unit(s) selected:** Move, Stop, Hold Position, Patrol, Attack; formation buttons
  (§3.10); abilities (hero/mana stretch).

**Current state.** `GameHUD.CommandCardPlaceholder` renders 12 empty slots. The scaffold
notes it "needs a store→engine intent channel that v1 deliberately does not have."

**Approach — the missing intent channel first.**
- **Sanctioned channel:** `GameHUD` already may import `GameBootstrap.js`; expose
  `getEngine()` there and route button clicks to a new **`engine.ui` command facade**
  (`src/engine/UICommandFacade.js`, `engine.ui`) with explicit methods —
  `train(typeId)`, `cancelQueue(buildingId, slot)`, `setRallyMode()`, `beginBuild(typeId)`,
  `research(upgradeId)`, `runAbility(abilityId)`, `setFormation(id)`, `stop()/hold()/patrolMode()`.
  This keeps React ignorant of simulation internals while giving one auditable seam. (Update
  `ARCHITECTURE.md §11`'s "UI never imports engine except GameBootstrap" note to name this
  facade as the intent path.)
- **Command-card data model:** new **`src/config/CommandCards.js`** — `getCommandCard(selection)
  → Slot[12]` where `Slot = { slot, kind:'train'|'build'|'ability'|'research'|'basic', typeId?,
  hotkey, icon, cost?, tooltip, enabled, cooldown? }`. Derived from the selection's archetypes
  + race + building type. Basic commands (Move/Stop/Hold/Attack/Patrol) occupy the canonical
  WC3 slots.
- **Hotkeys:** the classic QWER / ASDF / ZXCV grid mapping. Card buttons register the same
  handler the key fires (single dispatch path). Route through `InputManager`/a small
  `HotkeyController` so keys work whether or not the mouse is over the card.
- **Affordability + rejection:** every train/build/research goes through §3.3
  (`affordShortfall` → `COMMAND_REJECTED` → voice/toast) before spending.
- **Queue display:** building snapshots gain `queue:[{typeId, remaining, total}]` +
  `rallyPoint`; HUD renders progress arcs and supports cancel (refunds per WC3).

**New contracts.**
```js
// src/engine/UICommandFacade.js
export class UICommandFacade {
  constructor(engine)
  train(typeId); cancelQueueSlot(buildingId, slotIndex)
  beginBuild(typeId); setRallyMode(); research(upgradeId)
  runAbility(abilityId); setFormation(formationId)
  stop(); hold(); patrolMode(); attackMode()
}
// src/config/CommandCards.js
export function getCommandCard(selectionSnapshot): Slot[]   // pure, data-only
// GameBootstrap.js already exports getEngine(); GameHUD uses engine.ui.*
```

**Acceptance.** Selecting a Barracks shows its race's train buttons with costs; clicking one
(affordable) queues a unit, shows progress, spends resources, and rallies the spawn; an
unaffordable click triggers §3.3; selecting a worker shows the build menu; combat units show
Move/Stop/Hold/Patrol/Attack; every button has a working hotkey.

---

### 3.9 Building placement mode (implied by "build", raw #8)

**Goal.** Choosing a structure from a worker's build menu enters a WC3 placement mode: a
translucent **blueprint ghost** follows the cursor on the ground, tinted green where valid /
red where blocked (terrain bounds + overlap check), grid-friendly; left-click commits (worker
walks over and constructs — `Building.constructionRemaining` scaffold already exists),
right-click/Esc cancels.

**Current state.** Only the AI places buildings (`MacroBrain` spiral-search); the human has no
placement UI. `EntityManager.spawnBuilding` + `Building` construction scaffold exist.

**Approach.** New **`src/input/PlacementController.js`** (`engine.placement`): builds a ghost
mesh from `UnitModelFactory` (semi-transparent), validates against `terrain.getBounds()` +
`entities.getUnitsInRadius` clearance, snaps to the ground via `raycastGround`, commits by
ordering the selected worker(s) to construct (emit `BUILDING_PLACED`, spend via §3.3). Only
active when triggered by `engine.ui.beginBuild`.

**New contracts.**
```js
// src/input/PlacementController.js
export class PlacementController {
  constructor(engine); beginPlacement(typeId); update(dt); cancel(); dispose();
  get active(): boolean
}
```
Add `placement.update(dt)` to the frame order (in the input block) and `placement // PlacementController`
to the engine subsystem list.

**Acceptance.** Build → Supply shows a green/red ghost tracking the cursor; invalid spots
block the commit; committing spends resources and a worker constructs it (scaffold grows,
completes, grants supply); Esc cancels with no spend.

---

### 3.10 Formations + formation UI (raw #9)

**Goal.** Multi-selected groups move in a chosen **formation**; command-card buttons switch
between Box/Grid, Line, Wedge (arrow), Column, and Loose (current ring). Formation orients to
the travel direction; slot assignment minimizes path crossings; fast units wait for slow ones
(optional "move as one" toggle).

**Current state.** `CommandSystem._formationMove` distributes a compact hex ring with a
`// TODO(phase-3): formations v2 — assign slots by proximity … orient to travel direction`.

**Approach.** New **`src/input/FormationController.js`** (or fold into `CommandSystem`):
`layout(units, center, facing, formationId) → per-unit targets`. Implement the shapes; orient
by `facing = normalize(center − groupCentroid)`; assign slots by greedy nearest-match
(`unit ↔ nearest free slot`) to reduce crossings. Persist the active formation on the
selection / control group; expose `engine.ui.setFormation(id)`; render formation buttons in
the command card (basic-command region) with hotkeys.

**New contracts.**
```js
// src/input/FormationController.js
export const FORMATIONS = { BOX, LINE, WEDGE, COLUMN, LOOSE }
export function layout(units, center /*Vec3*/, facing /*Vec3*/, formationId, outTargets): void
// engine.ui.setFormation(formationId) persists + re-issues the last move in the new shape
```

**Acceptance.** Selecting 12 units and picking "Line" then right-clicking moves them into a
facing-oriented line; "Wedge" makes an arrow; switching formation re-forms them; slot
assignment visibly avoids units swapping across each other.

---

### 3.11 "Do more" — WC3 systems that complete the vision (recommended, phase-ordered)

Not in the raw list but expected for "as close to WC3 as possible." Prioritized; each can be
cut without breaking earlier work.

- **Floating health bars** over units (always for damaged/selected; toggle key for all) —
  reuse `FloatingTextManager` infra or a thin instanced bar layer; team-colored.
- **Floating damage numbers** on `UNIT_DAMAGED` (crit/normal styling) — same text system.
- **Rally-point flag** mesh at production buildings; drag on minimap to set (WC3 flag).
- **Research / upgrades** system (raw #3 says "research"): new `src/config/Upgrades.js`
  (weapon/armor tiers), a `ResearchController`, buildings host research slots, upgrades modify
  `computeDamage`/armor via a per-player upgrade table. Ties into §3.3 rejection.
- **Hold Position / Patrol** as real FSM states/orders on `Unit` (Patrol loops two points;
  Hold ignores auto-acquire movement).
- **Shift-queued orders** (waypoints) — `Unit` order queue; shift-click appends.
- **Idle-worker button + hotkey** (cycle idle workers), **control-group tab UI**, **subgroup
  tabs** for mixed selections (Tab cycles subgroup).
- **Hero units + mana abilities** (roadmap Phase 5): one hero per race, 3–4 abilities on the
  command card consuming `mana`, cooldowns, target/point/instant cast. This is the natural
  capstone once the command card + effects + floating text exist.
- **Death corpses / decay** instead of instant reap (existing `Entity.die` TODO).
- **Day/night, weather, ambient critters** — atmosphere stretch (out of scope unless asked).

---

## 4. Build order (dependency-aware)

Do it in vertical slices so each stage is playable and testable:

1. **Foundations:** `FloatingTextManager` (§3.2) + `EffectsManager` (§3.1 fx) + the
   `UICommandFacade`/intent channel (§3.8) + `AudioManager.speak` (§3.3). These unblock
   almost everything and are low-risk. Add their frame-order slots + `dispose()`.
2. **Feedback loop:** deposit `+N` text (§3.2) and "Not enough X" voice/toast/flash (§3.3).
   Immediately visible, validates the new infra.
3. **Selection & info:** finish marquee polish (§3.5), double-click-type (§3.6), rich
   selection snapshot + portrait + stats panel (§3.7).
4. **Command card + placement:** functional card (§3.8) → building placement (§3.9). Now the
   player can actually build/train/rally.
5. **Formations** (§3.10) once groups + command card exist.
6. **Minimap** (§3.4) — independent; can slot in any time after step 1's snapshot plumbing.
7. **Models & animation** (§3.1) — highest-effort, lowest-coupling; land it as its own slice
   so the visual overhaul doesn't block gameplay features. Effects (§3.1) already in from step 1.
8. **"Do more"** (§3.11) in the listed priority, as budget allows.

---

## 5. Definition of done / verification

- `npm run build` stays green (watch the expected Rapier wasm chunk warning only).
- Manual sim verification per the project's method — the preview tab is backgrounded so
  `requestAnimationFrame` is paused; **drive the loop by hand in one `preview_eval`** (boot via
  `bootstrapMatch(buildMatchConfig(...))`, `e.stop()`, then step the pipeline with `dt=1/30`,
  now including the new `fx` / `floatingText` / `placement` slots). Prefer
  `preview_snapshot` / `preview_eval` over screenshots.
- Every new subsystem: JSDoc, `dispose()`, no per-frame allocation (spot-check with a heap
  snapshot across 1000 stepped frames), and a one-line entry added to `ARCHITECTURE.md`'s
  subsystem list + frame order.
- New events added to the `EVENTS` catalog with documented payloads.
- No new UI→engine import except through `GameBootstrap.getEngine()` / `engine.ui`.

---

## 6. Open questions for the author (resolve D1–D5 in §2)

1. **Art (D1):** procedural models now with a GLTF drop-in seam, or commit to sourcing GLTF art?
2. **Voice (D2):** Web Speech synthesis, or wait for recorded VO files?
3. **Scope/sequencing:** build the full §4 order, or start with a vertical slice (steps 1–4:
   feedback + selection + command card) and review before the models overhaul?
4. **Minimap corner & portrait style (D3/D4):** confirm bottom-left minimap + procedural 2D
   portraits, or preferences otherwise?
```
