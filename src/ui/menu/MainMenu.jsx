/**
 * MainMenu — the full-screen title screen of Aether Throne.
 *
 * Renders over a live `MenuBackgroundScene` (drifting aether crystals on its
 * own <canvas>, owned entirely by this component: constructed in an effect,
 * started, and fully disposed on unmount so no rAF loop or GL context leaks
 * into the lobby/game).
 *
 * Entrance animation: GSAP staggered fade/rise on every `.menu-anim`
 * element, skipped entirely when the OS requests reduced motion.
 */
import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useLobbyStore, SCREENS } from '../../state/useLobbyStore.js';
import { MenuBackgroundScene } from '../../world/MenuBackgroundScene.js';

/** Which inline note panel is open below the buttons. */
const NOTE = {
  NONE: null,
  OPTIONS: 'OPTIONS',
  CREDITS: 'CREDITS',
  EXIT: 'EXIT',
};

/**
 * The main menu screen.
 * @returns {JSX.Element}
 */
export default function MainMenu() {
  const setScreen = useLobbyStore((s) => s.setScreen);
  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  const [note, setNote] = useState(NOTE.NONE);

  // ── Mount the ambient background scene on our canvas ─────────────
  // NOTE: MatchLobby carries an identical effect. The duplication is
  // deliberate: both screens own their scene lifecycle independently and
  // the module contract fixes the file list (no shared hook file).
  useEffect(() => {
    let scene = null;
    try {
      scene = new MenuBackgroundScene(canvasRef.current);
      scene.start();
    } catch (err) {
      // The menu must stay usable even if WebGL context creation fails
      // (e.g. headless CI, exhausted contexts) — panels render regardless.
      console.error('[MainMenu] background scene failed to start:', err);
    }
    return () => {
      if (scene) {
        scene.stop();
        scene.dispose();
      }
    };
  }, []);

  // ── GSAP staggered entrance (respecting prefers-reduced-motion) ──
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduced) return undefined; // elements are simply visible via CSS

    // gsap.context scopes selector text to this component's subtree and
    // gives us one-call cleanup (revert kills tweens AND restores styles).
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.menu-anim',
        { opacity: 0, y: 26 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'power3.out',
          stagger: 0.09,
          delay: 0.15,
        }
      );
    }, rootRef);
    return () => ctx.revert();
  }, []);

  /**
   * Exit handler. Browsers only honor window.close() for script-opened
   * windows; when it is ignored we show a graceful farewell note instead
   * of silently doing nothing.
   */
  const handleExit = () => {
    window.close();
    setNote(NOTE.EXIT);
  };

  /** Toggle an inline note panel (clicking the same button closes it). */
  const toggleNote = (which) => setNote((cur) => (cur === which ? NOTE.NONE : which));

  return (
    <div className="screen-root" ref={rootRef}>
      {/* Ambient Three.js background — purely decorative. */}
      <canvas ref={canvasRef} className="bg-canvas" aria-hidden="true" />

      <div className="screen-content menu-content">
        <h1 className="menu-title menu-anim">AETHER THRONE</h1>
        <p className="menu-subtitle menu-anim">by Aljay Leodones</p>
        <hr className="divider menu-rule menu-anim" />

        <nav className="menu-buttons" aria-label="Main menu">
          <button
            type="button"
            className="btn btn-primary menu-anim"
            onClick={() => setScreen(SCREENS.LOBBY)}
          >
            Play
          </button>
          <button
            type="button"
            className="btn menu-anim"
            aria-expanded={note === NOTE.OPTIONS}
            onClick={() => toggleNote(NOTE.OPTIONS)}
          >
            Options
          </button>
          <button
            type="button"
            className="btn menu-anim"
            aria-expanded={note === NOTE.CREDITS}
            onClick={() => toggleNote(NOTE.CREDITS)}
          >
            Credits
          </button>
          <button type="button" className="btn btn-ghost menu-anim" onClick={handleExit}>
            Exit
          </button>
        </nav>

        {/* Inline note panels — lightweight stand-ins until Phase 5. */}
        {note === NOTE.OPTIONS && (
          <div className="panel menu-note" role="status">
            <h3>Options</h3>
            <p>
              Audio, graphics, and hotkey settings are coming soon.
            </p>
            {/* TODO(phase-5): wire volume sliders to AudioManager.setMasterVolume
                and expose camera/scroll sensitivity from GAME_CONFIG.CAMERA. */}
          </div>
        )}

        {note === NOTE.CREDITS && (
          <div className="panel menu-note" role="status">
            <h3>Credits</h3>
            <p>Design, code &amp; direction — Aljay Leodones</p>
            <p>
              Forged with Three.js, Yuka, Rapier, Howler, GSAP, Zustand, and
              React. A spiritual homage to the golden age of real-time strategy.
            </p>
          </div>
        )}

        {note === NOTE.EXIT && (
          <div className="panel menu-note" role="status">
            <h3>Farewell</h3>
            <p>
              Your browser will not let the throne close this tab — you may
              close it yourself. Until then, the Aether waits.
            </p>
          </div>
        )}
      </div>

      <span className="menu-version">v1 scaffold</span>
    </div>
  );
}
