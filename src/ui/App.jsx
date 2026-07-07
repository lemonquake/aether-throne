/**
 * App — the React screen router for the Aether Throne UI overlay.
 *
 * Routes on `useLobbyStore.screen`:
 *   MAIN_MENU → <MainMenu/>     full-screen menu over the ambient background
 *   LOBBY     → <MatchLobby/>   custom-match setup
 *   LOADING   → <LoadingScreen/> shown while the engine bootstraps
 *   IN_GAME   → <GameHUD/>      pointer-events pass-through HUD
 *
 * App also owns THE handoff between the lobby and the simulation: when the
 * screen flips to LOADING (set by useLobbyStore.startMatch()), an effect
 * hands the frozen `pendingMatchConfig` to `bootstrapMatch()` from
 * GameBootstrap.js — the only engine-side import the UI layer is allowed
 * (ARCHITECTURE.md §11). Success advances to IN_GAME via `onMatchReady()`;
 * failure bounces back to the lobby with a readable error via
 * `onMatchFailed(message)`.
 */
import React, { useEffect } from 'react';
import { useLobbyStore, SCREENS } from '../state/useLobbyStore.js';
import { bootstrapMatch } from '../GameBootstrap.js';
import MainMenu from './menu/MainMenu.jsx';
import MatchLobby from './lobby/MatchLobby.jsx';
import LoadingScreen from './hud/LoadingScreen.jsx';
import GameHUD from './hud/GameHUD.jsx';

/**
 * Root overlay component. Subscribes ONLY to `screen` so the router never
 * re-renders on slot edits or HUD ticks — each screen component pulls its
 * own slice of store state.
 * @returns {JSX.Element}
 */
export default function App() {
  const screen = useLobbyStore((s) => s.screen);

  // ── LOADING bootstrap effect (contract shape from ARCHITECTURE.md §11) ──
  useEffect(() => {
    if (screen !== SCREENS.LOADING) return;
    let cancelled = false;

    // Read the config + routing actions imperatively: `pendingMatchConfig`
    // is guaranteed set in the same store update that flipped the screen to
    // LOADING, and zustand action references are stable. Keeping them out of
    // the dependency array preserves the spec's `[screen]` deps exactly.
    const { pendingMatchConfig, onMatchReady, onMatchFailed } = useLobbyStore.getState();

    bootstrapMatch(pendingMatchConfig)
      .then(() => {
        if (!cancelled) onMatchReady();
      })
      .catch((err) => {
        console.error('[App] match bootstrap failed:', err);
        if (!cancelled) onMatchFailed(String(err?.message ?? err));
      });

    // If the component unmounts (or the screen changes) mid-boot, we must
    // not fire stale routing callbacks. The engine singleton itself is
    // idempotent per the GameBootstrap contract, so no teardown call here.
    return () => {
      cancelled = true;
    };
  }, [screen]);

  // ── Screen router ────────────────────────────────────────────────
  switch (screen) {
    case SCREENS.LOBBY:
      return <MatchLobby />;
    case SCREENS.LOADING:
      return <LoadingScreen />;
    case SCREENS.IN_GAME:
      return <GameHUD />;
    case SCREENS.MAIN_MENU:
    default:
      // Unknown screens fall back to the main menu rather than a blank
      // overlay — fail visible, not silent.
      return <MainMenu />;
  }
}
