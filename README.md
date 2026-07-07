# Aether Throne

**A Warcraft 3 spiritual-clone RTS for the browser. By Aljay Leodones.**

Command one of three asymmetric factions — the armored **Aether Knights**, the
blisteringly fast **Void Stalkers**, or the unbreakable **Core Elementals** —
harvest gold and aether, raise a base, and crush up to seven AI opponents on
the Crystal Basin battlefield. Classic WC3 feel: fixed-pitch RTS camera,
marquee selection, control groups, smart right-click commands, fog of war,
and armor-type combat math.

## Tech stack

| Concern            | Library                        |
|--------------------|--------------------------------|
| Rendering          | [three](https://threejs.org/) `^0.169` |
| Tweens / camera    | [gsap](https://gsap.com/)      |
| Pathfinding / AI   | [yuka](https://mugen87.github.io/yuka/) (navmesh, steering, FSM) |
| Physics            | [@dimforge/rapier3d-compat](https://rapier.rs/) |
| Audio              | [howler](https://howlerjs.com/) |
| State              | [zustand](https://zustand-demo.pmnd.rs/) v5 |
| UI overlay         | [react](https://react.dev/) 18 |
| Build              | [vite](https://vitejs.dev/) 5 + @vitejs/plugin-react |

The 3D game runs on a raw canvas; React renders only the menu/lobby/HUD
overlay on top of it.

## Quickstart

```bash
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:5173`), hit **Play**,
configure the lobby slots, and **Start Battle**.

> **Note on assets:** v1 ships with no audio/model/texture files — every
> loader fails soft (a single console warning per missing file). Drop files
> into `public/assets/{audio,models,textures}/` and they are picked up
> automatically.

## Controls

| Input | Action |
|---|---|
| Mouse to screen edge | Edge-scroll the camera |
| **Middle-mouse drag** | Pan the camera |
| **Mouse wheel** | Zoom in / out (eased, WC3-style fixed pitch) |
| Arrow keys | Scroll the camera |
| **Left-click** | Select unit (own), inspect (enemy/resource), or clear (ground) |
| **Shift + left-click** | Add / remove unit from the current selection |
| **Left-drag** | Marquee-select your units inside the box |
| **Ctrl + 1..9** | Assign selection to a control group |
| **1..9** | Recall control group (double-tap to jump the camera to it) |
| **Right-click** | Smart command: move to ground, attack enemy, gather resource |
| **A + click** | Attack-move: advance and engage anything hostile en route |
| **S** | Stop — halt and hold position |

## Architecture

The full module contract — every export, signature, event payload, and the
per-frame update order — lives in [ARCHITECTURE.md](./ARCHITECTURE.md). That
document is binding: modules consume each other **only** through the
signatures written there.

The 30-second tour:

- `src/engine/` — game loop orchestrator, scene/renderer, Rapier physics,
  Yuka navigation, event bus, asset loading.
- `src/entities/` — units, buildings, resource nodes, projectile pool, and
  the entity manager that owns them.
- `src/camera/`, `src/input/` — RTS camera controller, selection marquee,
  control groups, smart command dispatch.
- `src/combat/`, `src/ai/` — damage resolution + victory sweep; macro
  (economy/build-order FSM) and micro (focus-fire / kite / retreat) AI brains.
- `src/world/` — terrain, dual-layer fog of war, menu background scene.
- `src/audio/` — Howler wrapper with 3D listener + fail-soft manifest.
- `src/ui/` — the React overlay (menu, lobby, loading screen, HUD).
- `src/config/`, `src/state/` — tuning constants, races, unit stat blocks,
  and the Zustand stores.

## Phase roadmap

| Phase | Status in this scaffold | Deferred |
|---|---|---|
| 1 — Menu / Lobby | Fully functional | Networked lobby, saved presets |
| 2 — Engine / Controls | Camera, marquee, control groups, smart commands | Shift-queueing, patrol, minimap |
| 3 — Nav / Fog / Combat | Steering + separation, flat navmesh path API, dual-layer fog shader, full stat combat + projectiles | Baked navmesh with obstacle holes, formations v2, height advantage |
| 4 — AI | Macro FSM + build orders + economy planner + threat map; micro focus-fire / kiting / retreat | Behavior-tree upgrade, scouting patterns, wall-ins |
| 5+ | — | Hero units, abilities / mana spending, items, save / replay, multiplayer lockstep |

Deferred work is marked in code as `// TODO(phase-N): ...` comments.
