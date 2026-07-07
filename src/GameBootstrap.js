/**
 * GameBootstrap — the single seam between the React UI and the Three.js engine.
 *
 * The UI layer never touches the engine directly: App.jsx calls
 * `bootstrapMatch(config)` when it enters the LOADING screen, and GameHUD.jsx
 * calls `teardownMatch()` on exit. This module owns the one engine singleton,
 * flips the #game-canvas visibility, and guarantees a clean slate between
 * matches (dispose the old engine, reset the HUD store, clear the event bus).
 *
 * Idempotency: `bootstrapMatch` tears down any prior engine before building a
 * new one, so a rage-quit-then-replay can never leave two engines (two rAF
 * loops, two WebGL contexts, duplicate DOM listeners) fighting over the canvas.
 */
import { GameEngine } from './engine/GameEngine.js';
import { eventBus } from './engine/EventBus.js';
import { useGameStore } from './state/useGameStore.js';

/** The lone engine instance for the current match (null between matches). */
let _engine = null;
/** Guards against overlapping bootstrap calls (double-clicks, StrictMode). */
let _booting = false;

/** @returns {HTMLCanvasElement} the in-game canvas element. */
function getCanvas() {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) throw new Error('bootstrapMatch: #game-canvas element not found.');
  return canvas;
}

/**
 * Build and start the engine for a match. Idempotent: any previously running
 * engine is disposed first.
 * @param {object} matchConfig - Frozen MatchConfig from the lobby.
 * @returns {Promise<GameEngine>}
 */
export async function bootstrapMatch(matchConfig) {
  if (!matchConfig) throw new Error('bootstrapMatch: missing matchConfig.');
  if (_booting) throw new Error('bootstrapMatch: a match is already booting.');
  _booting = true;
  try {
    // Clean slate: tear down any prior match and reset shared state.
    await teardownMatch();
    useGameStore.getState().resetGameState();

    const canvas = getCanvas();
    canvas.classList.remove('hidden'); // reveal the viewport

    const engine = await GameEngine.create(canvas, matchConfig);
    _engine = engine;
    window._engine = engine;
    engine.start();
    return engine;
  } catch (err) {
    // On any failure, leave no half-built engine behind and re-hide the canvas.
    if (_engine) {
      try { _engine.dispose(); } catch { /* best-effort */ }
      _engine = null;
    }
    try { getCanvas().classList.add('hidden'); } catch { /* canvas may be gone */ }
    throw err;
  } finally {
    _booting = false;
  }
}

/**
 * @returns {GameEngine|null} the live engine, or null between matches.
 */
export function getEngine() {
  return _engine;
}

/**
 * Dispose the current engine (if any), hide the canvas, and clear the event
 * bus so no stale subscriptions survive into the next match. Safe to call when
 * nothing is running.
 * @returns {Promise<void>}
 */
export async function teardownMatch() {
  if (_engine) {
    try {
      _engine.dispose();
    } finally {
      _engine = null;
    }
  }
  const canvas = document.getElementById('game-canvas');
  if (canvas) canvas.classList.add('hidden');

  // Every match wires fresh subscriptions in each subsystem's constructor;
  // clearing here guarantees no listener from the previous match lingers.
  eventBus.clear();
}
