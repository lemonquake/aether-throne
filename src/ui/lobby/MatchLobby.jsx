/**
 * MatchLobby — the custom-match setup screen (Phase 1).
 *
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │                CUSTOM BATTLE                 │
 *   │ ┌──────────────────────────┐ ┌─────────────┐ │
 *   │ │ header row + 8 PlayerSlot│ │  map card   │ │
 *   │ │ rows (slot table panel)  │ │Crystal Basin│ │
 *   │ └──────────────────────────┘ └─────────────┘ │
 *   │ [Back]  errors / hints          [Start ⚔]    │
 *   └──────────────────────────────────────────────┘
 *
 * The same ambient `MenuBackgroundScene` as the main menu renders behind the
 * panels (mounted/disposed by this component — see the effect note below).
 *
 * Start Battle is wired to the lobby store: the button disables unless
 * `canStart()` and the footer explains *why* via live validation hints;
 * store-side `lobbyErrors` (failed start / failed engine boot) take priority.
 */
import React, { useEffect, useRef } from 'react';
import { useLobbyStore, SCREENS } from '../../state/useLobbyStore.js';
import { validateLobby } from '../../state/MatchConfig.js';
import { GAME_CONFIG, SLOT_TYPES } from '../../config/GameConfig.js';
import { MenuBackgroundScene } from '../../world/MenuBackgroundScene.js';
import { getAvailableNexuses, getNexusType } from '../../config/Nexuses.js';
import PlayerSlot from './PlayerSlot.jsx';

function NexusMapPreview({ slots, nexusId, selectedSlotId, onPickStart }) {
  const colorMap = {
    aether_core: {
      base: '#7b2cbf',
      glow: '#9d4edd',
      name: 'Aetheric',
      bg: 'radial-gradient(circle, #2d6a4f 0%, #1b4332 100%)',
      pathColor: '#8b5a2b',
      pathOpacity: 0.65,
      pathWidth: 2,
      ringColor: '#5c4033',
      poolColor: '#3a86c8',
    },
    void_matrix: {
      base: '#ff007f',
      glow: '#ff5cbc',
      name: 'Void',
      bg: 'radial-gradient(circle, #1a0f2b 0%, #0c0515 100%)',
      pathColor: '#ff007f',
      pathOpacity: 0.25,
      pathWidth: 1,
      ringColor: '#ff007f',
      poolColor: '#ff007f',
    },
    solar_lattice: {
      base: '#ffaa00',
      glow: '#ffcc00',
      name: 'Solar',
      bg: 'radial-gradient(circle, #2a1b08 0%, #120700 100%)',
      pathColor: '#ffaa00',
      pathOpacity: 0.25,
      pathWidth: 1,
      ringColor: '#ffaa00',
      poolColor: '#ffcc00',
    }
  };
  const theme = colorMap[nexusId] || colorMap.aether_core;

  const count = GAME_CONFIG.MAX_PLAYERS;
  const radius = 40; // Base ring radius in viewBox
  const dist = 3.5;  // Resource offset distance
  const spread = 0.55;

  const activeSlots = slots.filter((slot) => slot.type !== SLOT_TYPES.CLOSED);
  const slotByStart = new Map(activeSlots.map((slot) => [slot.startLocationId, slot]));

  // Compute start location spots
  const spots = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const ux = Math.cos(angle);
    const uz = Math.sin(angle);

    const gx = ux * Math.cos(spread) - uz * Math.sin(spread);
    const gz = ux * Math.sin(spread) + uz * Math.cos(spread);

    const ax = ux * Math.cos(-spread) - uz * Math.sin(-spread);
    const az = ux * Math.sin(-spread) + uz * Math.cos(-spread);

    const x = 50 + ux * radius;
    const y = 50 + uz * radius;

    return {
      id: i,
      x,
      y,
      goldX: x + gx * dist,
      goldY: y + gz * dist,
      aetherX: x + ax * dist,
      aetherY: y + az * dist,
    };
  });

  return (
    <div className="nexus-map-preview" style={{
      width: '100%',
      aspectRatio: '1',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: theme.bg,
      borderRadius: '8px',
      border: `1px solid ${theme.base}44`,
      boxShadow: `0 0 20px ${theme.base}22`,
      position: 'relative',
      overflow: 'hidden'
    }}>
      <style>{`
        @keyframes spin-clockwise {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes spin-counter-clockwise {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes pulse-core {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 4px ${theme.glow}); opacity: 0.8; }
          50% { transform: scale(1.1); filter: drop-shadow(0 0 12px ${theme.glow}); opacity: 1; }
        }
        .nexus-ring-outer {
          animation: spin-clockwise 25s linear infinite;
          transform-origin: center;
        }
        .nexus-ring-inner {
          animation: spin-counter-clockwise 15s linear infinite;
          transform-origin: center;
        }
        .nexus-core-crystal {
          animation: pulse-core 3s ease-in-out infinite;
          transform-origin: center;
        }
        .start-pick {
          cursor: pointer;
          outline: none;
        }
        .start-pick:hover .start-ring-hover {
          stroke: #ffffff;
          stroke-opacity: 0.9;
        }
      `}</style>
      <svg width="90%" height="90%" viewBox="0 0 100 100">
        <defs>
          <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={theme.glow} stopOpacity="0.8" />
            <stop offset="100%" stopColor={theme.base} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Outer Circular Boundary */}
        <circle cx="50" cy="50" r="46" fill="none" stroke={theme.ringColor} strokeWidth="1.2" strokeOpacity="0.8" />

        {/* Grid helpers inside void matrix / solar lattice */}
        {nexusId !== 'aether_core' && (
          <>
            <line x1="10" y1="50" x2="90" y2="50" stroke={theme.base} strokeWidth="0.3" strokeOpacity="0.15" />
            <line x1="50" y1="10" x2="50" y2="90" stroke={theme.base} strokeWidth="0.3" strokeOpacity="0.15" />
            <circle cx="50" cy="50" r="30" fill="none" stroke={theme.base} strokeWidth="0.3" strokeOpacity="0.15" />
          </>
        )}

        {/* Dirt Paths or Energy Lines leading to the center */}
        {spots.map((spot) => (
          <line
            key={`path-${spot.id}`}
            x1={spot.x}
            y1={spot.y}
            x2="50"
            y2="50"
            stroke={theme.pathColor}
            strokeOpacity={theme.pathOpacity}
            strokeWidth={theme.pathWidth}
          />
        ))}

        {/* Central Core Pool & Glow */}
        <circle cx="50" cy="50" r="12" fill="url(#core-glow)" />
        <circle cx="50" cy="50" r="8" fill="none" stroke={theme.poolColor} strokeWidth="0.8" strokeOpacity="0.75" />

        {/* Outer Spinning Ring */}
        <g className="nexus-ring-outer">
          <circle cx="50" cy="50" r="14" fill="none" stroke={theme.base} strokeWidth="0.6" strokeDasharray="6 12" strokeOpacity="0.4" />
        </g>

        {/* Central Core Crystal */}
        <g className="nexus-core-crystal">
          <polygon points="50,44 54,50 50,56 46,50" fill={theme.base} fillOpacity="0.9" stroke={theme.glow} strokeWidth="0.6" />
        </g>

        {/* Start locations and resources */}
        {spots.map((spot) => {
          const slot = slotByStart.get(spot.id);
          const active = !!slot;
          const selected = active && slot.id === selectedSlotId;

          return (
            <g
              key={spot.id}
              className="start-pick"
              onClick={() => onPickStart?.(spot.id)}
            >
              {/* Giant hover buffer */}
              <circle cx={spot.x} cy={spot.y} r="5" fill="transparent" />

              {/* Resource offset nodes */}
              {/* Gold Mine (diamond shape) */}
              <rect
                x={spot.goldX - 0.9}
                y={spot.goldY - 0.9}
                width="1.8"
                height="1.8"
                transform={`rotate(45 ${spot.goldX} ${spot.goldY})`}
                fill="#ffd700"
                opacity={active ? 1.0 : 0.4}
              />
              {/* Aether Well (circle shape) */}
              <circle
                cx={spot.aetherX}
                cy={spot.aetherY}
                r="0.95"
                fill="#00e5ff"
                opacity={active ? 1.0 : 0.4}
              />

              {/* Start location base circle */}
              <circle
                cx={spot.x}
                cy={spot.y}
                r={selected ? 2.6 : 2.0}
                fill={active ? slot.color : '#1f273d'}
                stroke={selected ? '#ffffff' : active ? '#ffd700' : '#4f5d75'}
                strokeWidth={selected ? 0.9 : 0.5}
                className="start-ring-hover"
              />
            </g>
          );
        })}
      </svg>
      <div style={{
        position: 'absolute',
        bottom: '4%',
        color: '#ffffff',
        fontSize: '0.75rem',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        fontWeight: 'bold',
        opacity: 0.8,
        pointerEvents: 'none'
      }}>
        {theme.name} Matrix
      </div>
    </div>
  );
}

/**
 * The full lobby screen.
 * @returns {JSX.Element}
 */
export default function MatchLobby() {
  const setScreen = useLobbyStore((s) => s.setScreen);
  const startMatch = useLobbyStore((s) => s.startMatch);
  // Slot rows: the store maps the array immutably, so untouched slots keep
  // referential identity and the memoized <PlayerSlot/> rows skip re-render.
  const slots = useLobbyStore((s) => s.slots);
  // Store-side errors (failed startMatch validation OR engine boot failure
  // routed back by App.onMatchFailed). These outrank the live hints below.
  const lobbyErrors = useLobbyStore((s) => s.lobbyErrors);
  // Derived boolean through the store's own canStart() — the selector
  // returns a primitive, so React only re-renders when readiness flips.
  const canStart = useLobbyStore((s) => s.canStart());

  const nexusId = useLobbyStore((s) => s.nexusId);
  const setNexusId = useLobbyStore((s) => s.setNexusId);
  const selectedSlotId = useLobbyStore((s) => s.selectedSlotId);
  const setSlotStartLocation = useLobbyStore((s) => s.setSlotStartLocation);

  const selectedNexus = getAvailableNexuses()[nexusId] || getNexusType('aether_core');

  const canvasRef = useRef(null);

  // ── Ambient background scene ──────────────────────────────────────
  // NOTE: deliberately duplicated from MainMenu (see the note there):
  // each screen owns its scene lifecycle; the module contract fixes the
  // file list, so no shared hook module exists to host this.
  useEffect(() => {
    let scene = null;
    try {
      scene = new MenuBackgroundScene(canvasRef.current);
      scene.start();
    } catch (err) {
      // Lobby must remain usable without WebGL — panels render regardless.
      console.error('[MatchLobby] background scene failed to start:', err);
    }
    return () => {
      if (scene) {
        scene.stop();
        scene.dispose();
      }
    };
  }, []);

  // Live validation hints for the footer. Recomputed per render (renders
  // only happen on lobby edits, and validateLobby is a trivial array scan),
  // so the player always sees WHY Start Battle is disabled — the store's
  // lobbyErrors only populate after a failed action.
  const liveHints = validateLobby({ slots, nexusId });

  const activeCount = slots.filter((s) => s.type !== SLOT_TYPES.CLOSED).length;

  return (
    <div className="screen-root">
      {/* Same drifting-crystal ambience as the main menu. */}
      <canvas ref={canvasRef} className="bg-canvas" aria-hidden="true" />

      <div className="screen-content lobby-content">
        <div className="lobby-frame">
          <header className="lobby-header">
            <h1>Custom Battle</h1>
            <p>
              {activeCount} of {GAME_CONFIG.MAX_PLAYERS} banners raised - {selectedNexus.name}
            </p>
          </header>

          <div className="lobby-main">
            {/* ── Slot table ─────────────────────────────────────── */}
            <section className="panel lobby-slots" aria-label="Player slots">
              {/* Column headers share .slot-grid with every row so the
                  labels stay pixel-aligned with the controls below. */}
              <div className="slot-grid slot-header" aria-hidden="true">
                <span /> {/* swatch column */}
                <span>Player</span>
                <span>Name</span>
                <span>Race</span>
                <span>Team</span>
                <span>AI Level</span>
                <span>AI Style</span>
              </div>

              {slots.map((slot) => (
                <PlayerSlot key={slot.id} slot={slot} />
              ))}
            </section>

            {/* ── Map info card ──────────────────────────────────── */}
            <aside className="panel map-card" aria-label="Nexus information" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>Nexus</h2>
                <select
                  value={nexusId}
                  onChange={(e) => setNexusId(e.target.value)}
                  style={{
                    background: 'var(--panel-bg-solid, rgba(16, 22, 30, 0.95))',
                    border: '1px solid #c8a2c8',
                    color: '#c8a2c8',
                    borderRadius: '4px',
                    padding: '0.2rem 0.5rem',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                  }}
                >
                  {Object.values(getAvailableNexuses()).map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </div>
              <NexusMapPreview
                slots={slots}
                nexusId={nexusId}
                selectedSlotId={selectedSlotId}
                onPickStart={(startId) => setSlotStartLocation(selectedSlotId, startId)}
              />
              <dl className="map-meta" style={{ marginTop: '0.2rem' }}>
                <dt>Players</dt>
                <dd>2–8</dd>
                <dt>Field</dt>
                <dd>
                  200 × 200
                </dd>
                <dt>Style</dt>
                <dd>Matrix Arena</dd>
                <dt>Resonance</dt>
                <dd style={{ color: selectedNexus.resonanceColor, fontWeight: 'bold' }}>
                  {selectedNexus.id.split('_')[0].toUpperCase()}
                </dd>
              </dl>
              <p className="map-blurb" style={{ margin: '0.2rem 0 0 0', flex: 1, overflowY: 'auto' }}>
                {selectedNexus.blurb}
              </p>
            </aside>
          </div>

          {/* ── Footer: Back | errors/hints | Start Battle ────────── */}
          <footer className="panel lobby-footer">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setScreen(SCREENS.MAIN_MENU)}
            >
              ‹ Back
            </button>

            <div className="lobby-errors" role="status" aria-live="polite">
              {lobbyErrors.length > 0 ? (
                // Hard errors from a failed start / failed engine bootstrap.
                lobbyErrors.map((err, i) => (
                  <span key={i} className="lobby-error">
                    {err}
                  </span>
                ))
              ) : !canStart ? (
                // Live hints explaining why the Start button is disabled.
                liveHints.map((hint, i) => (
                  <span key={i} className="lobby-hint">
                    {hint}
                  </span>
                ))
              ) : (
                <span className="lobby-hint">All banners raised — the basin awaits.</span>
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary btn-start"
              disabled={!canStart}
              onClick={startMatch}
            >
              Start Battle
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
