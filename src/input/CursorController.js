/**
 * CursorController — the context-sensitive battlefield cursor AND the on-world
 * hover highlight, the twin WC3 tells that tell you at a glance what a click
 * will do:
 *
 *   - Hover a hostile you can attack  → PULSING RED sword cursor + a blinking
 *     RED ring on that enemy. Right-click attacks.
 *   - Hover your own damaged/unfinished building with a worker selected →
 *     animated YELLOW wrench cursor + a blinking YELLOW ring. Right-click repairs.
 *   - Hover a resource node with a worker selected → animated gold gather cursor
 *     + a blinking gold ring. Right-click harvests.
 *   - Armed attack-move → pulsing red reticle; armed rally → gold flag.
 *   - Otherwise → the default arrow, no ring.
 *
 * The cursors are inline SVG data-URIs (zero image assets). Browsers rasterize a
 * cursor once and ignore SMIL, so "animated" cursors are done the only way that
 * actually works: we pre-bake a handful of FRAMES per cursor and rewrite
 * `canvas.style.cursor` on a timer. Hover classification does one raycast at
 * REFRESH_INTERVAL; the frame swap + ring blink run every frame (cheap).
 */
import * as THREE from 'three';
import { ARCHETYPE, ENTITY_CLASS } from '../config/UnitTypes.js';
import { useGameStore } from '../state/useGameStore.js';

/** Hover re-classification cadence (seconds) — decoupled from pointer-move. */
const REFRESH_INTERVAL = 0.05;
/** Animated-cursor frame rate (frames/sec). */
const CURSOR_FPS = 12;

// ── Highlight ring colors ────────────────────────────────────────────────────
const RING_RED = 0xff2a1e;    // enemy
const RING_YELLOW = 0xffe24a; // repair / gather

/**
 * Wrap an SVG body into a CSS cursor value with a hotspot.
 * @param {string} svg @param {number} hx @param {number} hy @returns {string}
 */
function cursorURL(svg, hx, hy) {
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") ${hx} ${hy}, auto`;
}

/**
 * Build an array of cursor frames from a per-frame SVG builder.
 * @param {(i:number,n:number)=>string} makeSvg @param {number} n
 * @param {number} hx @param {number} hy @returns {string[]}
 */
function makeFrames(makeSvg, n, hx, hy) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(cursorURL(makeSvg(i, n), hx, hy));
  return arr;
}

// ── Pulsing RED sword (hover enemy) — a red blade over a throbbing red glow. ──
const SWORD_FRAMES = makeFrames((i, n) => {
  const p = i / n;
  const glow = (7 + Math.sin(p * Math.PI * 2) * 3).toFixed(1);
  const op = (0.35 + 0.35 * (0.5 + 0.5 * Math.sin(p * Math.PI * 2))).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
     <circle cx="16" cy="17" r="${glow}" fill="#ff2a1e" opacity="${op}"/>
     <g stroke="#2a0000" stroke-width="1.4" stroke-linejoin="round">
       <path d="M16 30 L12 12 L16 8 L20 12 Z" fill="#ff3b2e"/>
       <rect x="9" y="7" width="14" height="3" rx="1.2" fill="#ffd24a"/>
       <rect x="14.6" y="2" width="2.8" height="6" rx="1" fill="#ffd24a"/>
     </g>
   </svg>`;
}, 4, 16, 30);

// ── Pulsing RED reticle (armed attack-move / A-held). ───────────────────────
const TARGET_FRAMES = makeFrames((i, n) => {
  const p = i / n;
  const r = (8 + Math.sin(p * Math.PI * 2) * 2).toFixed(1);
  const op = (0.7 + 0.3 * Math.sin(p * Math.PI * 2)).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
     <g fill="none" stroke="#ff2a1e" stroke-width="2.2" opacity="${op}">
       <circle cx="16" cy="16" r="${r}"/>
       <path d="M16 1 V7 M16 25 V31 M1 16 H7 M25 16 H31" stroke-width="2.4"/>
     </g>
     <circle cx="16" cy="16" r="2" fill="#ff2a1e"/>
   </svg>`;
}, 4, 16, 16);

// ── Animated YELLOW wrench (hover own repairable building w/ worker). ───────
const WRENCH_FRAMES = makeFrames((i) => {
  const rot = [-15, 0, 15, 0][i];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
     <g transform="rotate(${rot} 13 16)">
       <path d="M20 4 a7 7 0 0 0 -8 9 L4 21 l7 7 8-8 a7 7 0 0 0 9-8 l-4 4 -5-1 -1-5 z"
         fill="#ffe24a" stroke="#5a4610" stroke-width="1.5" stroke-linejoin="round"/>
     </g>
   </svg>`;
}, 4, 6, 26);

// ── Animated gold gather pick (hover resource w/ worker). ───────────────────
const GATHER_FRAMES = makeFrames((i) => {
  const rot = [-10, 0, 10, 0][i];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
     <g transform="rotate(${rot} 16 22)" stroke="#3a2c05" stroke-width="1.3" stroke-linejoin="round">
       <path d="M4 8 Q16 2 28 8 Q16 6 4 8 Z" fill="#ffd24a"/>
       <rect x="15" y="7" width="2.2" height="22" rx="1" fill="#8a6a34"/>
     </g>
   </svg>`;
}, 4, 16, 29);

/** Static gold rally flag on a pole. */
const FLAG_FRAMES = [cursorURL(
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
     <g stroke="#3a2c05" stroke-width="1.2" stroke-linejoin="round">
       <rect x="8" y="3" width="2.4" height="26" rx="1" fill="#caa63a"/>
       <path d="M10.4 4 L26 8 L10.4 13 Z" fill="#f4d24a"/>
     </g>
   </svg>`,
  9, 29,
)];

export class CursorController {
  /**
   * @param {import('../engine/GameEngine.js').GameEngine} engine
   */
  constructor(engine) {
    this.engine = engine;
    this._accum = 0;       // hover-classification throttle accumulator
    this._frameClock = 0;  // drives animated-cursor frame index
    /** Last cursor string written to the DOM (change-guard). */
    this._current = '';
    /** Active cursor frame set (null = default arrow). @type {string[]|null} */
    this._frames = null;

    // Hover-highlight ring: one shared mesh moved onto the hovered entity,
    // recolored + blinked per context. A unit ring geometry (inner 1) is scaled
    // by the entity footprint so it matches the selection ring exactly.
    const geo = new THREE.RingGeometry(1.0, 1.16, 40);
    geo.rotateX(-Math.PI / 2);
    this._ringGeo = geo;
    this._ringMat = new THREE.MeshBasicMaterial({
      color: RING_RED, transparent: true, opacity: 0, side: THREE.DoubleSide,
      depthWrite: false, depthTest: false,
    });
    this._ring = new THREE.Mesh(geo, this._ringMat);
    this._ring.renderOrder = 8;
    this._ring.visible = false;
    this._ring.raycast = () => {};
    engine.scene.add(this._ring);

    /** Current hover context (recomputed on the throttle). @private */
    this._hoverEntity = null;
    this._ringColor = RING_RED;
    this._ringActive = false;
    /** Id of the entity whose hover-info was last pushed (change guard). @private */
    this._lastHoverId = 0;
  }

  /**
   * Per-frame: re-classify hover on a throttle, then animate the cursor frame
   * and the highlight ring every frame.
   * @param {number} dt - Clamped frame delta (seconds).
   */
  update(dt) {
    this._accum += dt;
    this._frameClock += dt;
    if (this._accum >= REFRESH_INTERVAL) {
      this._accum = 0;
      this._resolve();
    }
    this._applyCursorFrame();
    this._animateRing();
  }

  /**
   * Decide the cursor frame set + hover-ring context for the current pointer.
   * @private
   */
  _resolve() {
    const engine = this.engine;
    this._frames = null;
    this._ringActive = false;
    this._hoverEntity = null;

    // Placement mode paints its own ghost; leave the OS arrow + no ring/tooltip.
    if (engine.placement?.active) { this._pushHoverInfo(null); return; }

    const units = engine.isObserver ? [] : engine.selection.getSelectedArray();
    const ndc = engine.input.pointerNDC;
    const hover = engine.pickEntity(ndc.x, ndc.y);
    // World hover tooltip (Name + Owner, colored by relation) — updated whatever
    // the cursor mode is.
    this._pushHoverInfo(hover);

    // Armed command-card targeting cursors take precedence for the CURSOR.
    const mode = engine.commands?.getPendingMode?.();
    if (mode === 'attackmove') { this._frames = TARGET_FRAMES; return; }
    if (mode === 'rally') { this._frames = FLAG_FRAMES; return; }
    if (mode === 'repair') { this._frames = WRENCH_FRAMES; return; }

    if (hover && !hover.isDead) {
      // Enemy under the cursor + a selection that can fight → red sword + ring.
      if (units.length > 0 && this._isHostile(hover) && this._anyCanAttack(units)) {
        this._frames = SWORD_FRAMES;
        this._setRing(hover, RING_RED);
        return;
      }
      if (this._anyWorker(units)) {
        // Own damaged / unfinished building → yellow wrench + yellow ring.
        if (this._isOwnRepairable(hover)) {
          this._frames = WRENCH_FRAMES;
          this._setRing(hover, RING_YELLOW);
          return;
        }
        // Resource node → gather pick + gold ring.
        if (this._isResourceNode(hover)) {
          this._frames = GATHER_FRAMES;
          this._setRing(hover, RING_YELLOW);
          return;
        }
      }
    }
    // Attack held (attack-move via left click) also shows the target reticle.
    if (units.length > 0 && engine.input.isKeyDown('KeyA')) this._frames = TARGET_FRAMES;
  }

  /** @private Arm the hover ring on an entity with a color. */
  _setRing(entity, color) {
    this._hoverEntity = entity;
    this._ringColor = color;
    this._ringActive = true;
  }

  /**
   * Write the current animated frame to the DOM cursor (change-guarded).
   * @private
   */
  _applyCursorFrame() {
    let value = '';
    if (this._frames) {
      const idx = Math.floor(this._frameClock * CURSOR_FPS) % this._frames.length;
      value = this._frames[idx];
    }
    if (value === this._current) return;
    this._current = value;
    if (this.engine.canvas) this.engine.canvas.style.cursor = value || '';
  }

  /**
   * Blink + position the hover-highlight ring under the hovered entity.
   * @private
   */
  _animateRing() {
    const ent = this._hoverEntity;
    if (!this._ringActive || !ent || ent.isDead || !ent.mesh?.visible) {
      if (this._ring.visible) { this._ring.visible = false; this._ringMat.opacity = 0; }
      return;
    }
    const now = this.engine.gameTime ?? 0;
    const r = (ent.type?.radius ?? 1) * 1.35;
    this._ring.position.set(ent.position.x, ent.position.y + 0.06, ent.position.z);
    this._ring.scale.set(r, r, r);
    this._ringMat.color.setHex(this._ringColor);
    // Blink: a fast pulse so it clearly reads as "targetable".
    this._ringMat.opacity = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(now * 7));
    this._ring.visible = true;
  }

  /**
   * Push (or clear) the world hover tooltip: entity Name + Owner, plus a
   * relation ('ally'|'enemy'|'neutral') the HUD colors green/red/yellow.
   * @param {import('../entities/Entity.js').Entity|null} hover @private
   */
  _pushHoverInfo(hover) {
    const store = useGameStore.getState();
    if (!hover || hover.isDead) {
      if (this._lastHoverId !== 0) { this._lastHoverId = 0; store.setHoverInfo(null); }
      return;
    }
    const local = this.engine.localPlayer;
    const owner = hover.player;
    let relation = 'neutral';
    let ownerName = 'Neutral';
    if (owner) {
      relation = local && (owner === local || local.isAlliedWith(owner)) ? 'ally' : owner ? 'enemy' : 'neutral';
      ownerName = owner.name;
    } else if (this._isResourceNode(hover)) {
      ownerName = 'Unclaimed';
    }
    const name = hover.type?.name ?? this._prettyKind(hover.kind);
    const screen = this.engine.input.pointerScreen;
    store.setHoverInfo({ name, owner: ownerName, relation, x: screen.x, y: screen.y });
    this._lastHoverId = hover.id;
  }

  /** @private Human-readable resource-node name from its kind. */
  _prettyKind(kind) {
    if (kind === 'GOLD_MINE') return 'Gold Mine';
    if (kind === 'AETHER_WELL') return 'Aether Well';
    return kind || 'Unknown';
  }

  // ── Classification helpers ────────────────────────────────────────────────

  /** @private Hostile to the local player (mirrors CommandSystem rules). */
  _isHostile(entity) {
    const local = this.engine.localPlayer;
    if (!local) return false;
    if (!entity.player || entity.player === local) return false;
    if (local.isAlliedWith(entity.player)) return false;
    const cls = entity.type?.class;
    return cls === ENTITY_CLASS.UNIT || cls === ENTITY_CLASS.BUILDING;
  }

  /** @private Any selected unit that can deal damage. */
  _anyCanAttack(units) {
    for (const u of units) if (!u.isDead && u.type.damage?.[1] > 0) return true;
    return false;
  }

  /** @private Any selected worker (builder). */
  _anyWorker(units) {
    for (const u of units) if (!u.isDead && u.type.archetype === ARCHETYPE.WORKER) return true;
    return false;
  }

  /** @private Own (or allied) building that wants repair or is still building. */
  _isOwnRepairable(entity) {
    const local = this.engine.localPlayer;
    if (!local) return false;
    if (!entity.player || entity.type?.class !== ENTITY_CLASS.BUILDING) return false;
    if (entity.player !== local && !local.isAlliedWith(entity.player)) return false;
    return entity.hp < entity.maxHp || entity.constructionRemaining > 0;
  }

  /** @private Structural resource-node test (no entity-class import cycle). */
  _isResourceNode(entity) {
    return typeof entity.harvest === 'function' || entity.type?.class === 'RESOURCE';
  }

  /** Restore the default cursor, free the ring, and drop references. */
  dispose() {
    try { useGameStore.getState().setHoverInfo(null); } catch { /* store may be gone */ }
    if (this.engine?.canvas) this.engine.canvas.style.cursor = '';
    if (this.engine?.scene && this._ring) this.engine.scene.remove(this._ring);
    this._ringGeo?.dispose();
    this._ringMat?.dispose();
    this._ring = null;
    this.engine = null;
  }
}
