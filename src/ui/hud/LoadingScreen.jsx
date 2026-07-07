/**
 * LoadingScreen — shown while GameBootstrap boots the engine (screen ===
 * SCREENS.LOADING; the actual bootstrapMatch call lives in App.jsx).
 *
 * Engine boot has no meaningful progress signal (Rapier wasm init + terrain
 * build + army spawn all resolve in one async chain), so the bar is
 * **indeterminate**: a pure-CSS "aether pulse" comet sweeping the track —
 * CSS animation keeps gliding even while the main thread is busy compiling
 * wasm, which a JS-driven bar would not.
 *
 * Below the bar, flavor tips rotate on a timer. The tip element is re-keyed
 * per tip so the `fadeRiseIn` CSS entrance replays on every rotation.
 *
 * NOTE: no MenuBackgroundScene here — the GPU belongs to the booting engine;
 * ui.css paints a static basin-glow gradient instead.
 */
import React, { useEffect, useState } from 'react';
import { useLobbyStore } from '../../state/useLobbyStore.js';
import { getNexusType } from '../../config/Nexuses.js';

/**
 * Rotating flavor lines: a mix of real control tips (they teach the Phase 2
 * input bindings) and world lore. `lead` renders highlighted via
 * `.loading-tip strong`.
 * @type {Array<{lead: string, text: string}>}
 */
const TIPS = [
  { lead: 'Tip', text: 'Right-click issues smart commands: move to ground, attack enemies, gather from resource nodes.' },
  { lead: 'Tip', text: 'Hold A and click to attack-move — your army will engage everything on the way.' },
  { lead: 'Tip', text: 'Drag with the left mouse button to marquee-select your units.' },
  { lead: 'Tip', text: 'Ctrl+1…9 binds a control group; tap the number twice to jump the camera to it.' },
  { lead: 'Tip', text: 'Press S to halt your selection in place — handy for holding a choke.' },
  { lead: 'Tip', text: 'Keep workers split between gold and aether; an idle worker is a defeat in slow motion.' },
  { lead: 'Tip', text: 'Wounded units flee on their own when badly outnumbered. Let them — a live soldier fights again.' },
  { lead: 'Lore', text: 'The Bio Humans swore to rebuild the throne. The Artifice Horde swore to dismantle whoever sits on it.' },
  { lead: 'Lore', text: 'Terra Born do not march to war. War simply arrives wherever they stand.' },
  { lead: 'Lore', text: 'The Chaos Deep swarm consumes everything in its path, reclaiming raw organic essence.' },
  { lead: 'Lore', text: 'Void Matrix bridges alternate dimensions, spawning volatile void fissures.' },
  { lead: 'Lore', text: 'Aether Core features towering Aetheric Spires containing raw crystalline energy.' },
  { lead: 'Lore', text: 'Solar Lattice is fueled by ancient energy monoliths that power the matrix grid.' },
];

/** Milliseconds between tip rotations. */
const TIP_INTERVAL_MS = 4200;

/**
 * The loading screen.
 * @returns {JSX.Element}
 */
export default function LoadingScreen() {
  const pendingMatchConfig = useLobbyStore((s) => s.pendingMatchConfig);
  const armyCount = pendingMatchConfig?.players.length ?? 0;
  const nexusId = pendingMatchConfig?.mapId || 'aether_core';
  const nexusName = getNexusType(nexusId)?.name || 'Aether Core';

  // Random starting tip so repeat matches don't always open on the same line.
  // Math.random is fine here — this is UI garnish, not simulation state.
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * TIPS.length));

  // ── Tip rotation timer ────────────────────────────────────────────
  useEffect(() => {
    const id = window.setInterval(
      () => setTipIndex((i) => (i + 1) % TIPS.length),
      TIP_INTERVAL_MS
    );
    return () => window.clearInterval(id);
  }, []);

  const tip = TIPS[tipIndex];

  return (
    <div className="screen-root loading-root">
      <div className="panel loading-panel">
        <h1 className="loading-title">Summoning the Battlefield</h1>
        <p className="loading-sub">
          {armyCount > 0 ? `${armyCount} armies converge on ` : ''}{nexusName}
        </p>

        {/* Indeterminate aether-pulse bar (sweep is pure CSS). */}
        <div
          className="loading-track"
          role="progressbar"
          aria-label="Loading the battlefield"
          aria-busy="true"
        >
          <div className="loading-pulse" />
        </div>

        {/* key={tipIndex} forces a remount so the fade-in replays per tip. */}
        <p className="loading-tip" key={tipIndex} role="status" aria-live="polite">
          <strong>{tip.lead}</strong> — {tip.text}
        </p>
      </div>
    </div>
  );
}
