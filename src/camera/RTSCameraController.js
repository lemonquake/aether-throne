/**
 * RTSCameraController — classic Warcraft-3-style RTS camera.
 *
 * The camera is defined by two numbers and a point:
 *   - `focus`  : the ground point the camera looks at (y ≈ 0 on flat terrain)
 *   - `height` : the zoom level (world-units above the ground)
 * and the fixed relationship:
 *   camera.position = focus + (0, height, height * OFFSET_RATIO)
 *
 * Because the horizontal offset scales with height, the *pitch angle stays
 * constant while zooming* — exactly how WC3 feels (zoom slides the camera
 * along a fixed diagonal rail).
 *
 * Inputs handled (all listeners owned by this class — it is self-contained
 * and does NOT depend on InputManager so it can be constructed before the
 * rest of the input stack):
 *   - Edge scrolling  : pointer within EDGE_SIZE px of the window border.
 *   - Arrow keys      : same effect as edge scrolling.
 *   - Wheel zoom      : GSAP-tweened `height` change, clamped MIN..MAX.
 *   - Middle-drag pan : grab-the-map semantics (world follows the cursor).
 *   - panTo()         : GSAP-eased jump used by minimap clicks and
 *                       control-group double-tap recall.
 *
 * The focus point is clamped to the supplied bounds every frame so the
 * player can never scroll into the void.
 */
import * as THREE from 'three';
import gsap from 'gsap';
import { GAME_CONFIG } from '../config/GameConfig.js';

const CAM = GAME_CONFIG.CAMERA;

/**
 * Reference height used to scale scroll/drag speed with zoom: at height 40
 * you get exactly EDGE_SPEED / DRAG_SPEED; zoomed out you pan faster,
 * zoomed in you pan slower (keeps on-screen pan speed roughly constant).
 */
const REFERENCE_HEIGHT = 40;

// ── Module-scope scratch objects (no per-frame allocations) ────────────────
const _scrollDir = new THREE.Vector2(); // accumulated scroll direction this frame

/** Clamp helper (avoids pulling in MathUtils for two call sites). */
function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export class RTSCameraController {
  /**
   * @param {THREE.PerspectiveCamera} camera - The gameplay camera (owned by SceneManager).
   * @param {HTMLElement} domElement - The game canvas (wheel/drag listeners attach here).
   * @param {{ bounds?: {minX:number,maxX:number,minZ:number,maxZ:number} }} [opts]
   *        `bounds` normally comes from `terrain.getBounds()` (map size minus
   *        CAMERA.BOUNDS_MARGIN). Falls back to the config map size if omitted.
   */
  constructor(camera, domElement, opts = {}) {
    this.camera = camera;
    this.domElement = domElement;

    /** @type {THREE.Vector3} Ground point the camera orbits/looks at. */
    this.focus = new THREE.Vector3(0, 0, 0);

    /** @type {number} Current zoom height (MIN_HEIGHT..MAX_HEIGHT). GSAP tweens this. */
    this.height = CAM.START_HEIGHT;

    // The height the zoom tween is heading toward. Kept separate from
    // `height` so rapid wheel notches accumulate instead of each one
    // restarting from the mid-tween value (which would feel mushy).
    this._targetHeight = CAM.START_HEIGHT;

    // Fallback bounds derived from the raw map size if the terrain hasn't
    // provided real ones yet.
    const halfW = GAME_CONFIG.MAP.WIDTH / 2 - CAM.BOUNDS_MARGIN;
    const halfD = GAME_CONFIG.MAP.DEPTH / 2 - CAM.BOUNDS_MARGIN;
    /** @type {{minX:number,maxX:number,minZ:number,maxZ:number}} */
    this.bounds = opts.bounds ?? { minX: -halfW, maxX: halfW, minZ: -halfD, maxZ: halfD };
    this.nexus = opts.nexus ?? null;

    // ── Pointer / window tracking state ─────────────────────────────
    this._pointerClient = { x: 0, y: 0 }; // last known client-pixel position
    this._pointerInWindow = true;         // edge scroll pauses when false
    this._windowFocused = typeof document !== 'undefined' ? document.hasFocus() : true;

    // ── Middle-drag state ────────────────────────────────────────────
    this._dragging = false;
    this._dragLast = { x: 0, y: 0 };

    // ── Keyboard arrow state (Set of active arrow codes) ────────────
    this._keys = new Set();

    // ── Active GSAP tweens (killed on interruption/dispose) ─────────
    this._zoomTween = null;
    this._panTween = null;

    // Bind handlers once so add/removeEventListener get identical refs.
    this._onWheel = this._onWheel.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onWindowBlur = this._onWindowBlur.bind(this);
    this._onWindowFocus = this._onWindowFocus.bind(this);
    this._onMouseLeaveDoc = this._onMouseLeaveDoc.bind(this);
    this._onMouseEnterDoc = this._onMouseEnterDoc.bind(this);

    // Wheel must be non-passive so we can preventDefault page scroll.
    domElement.addEventListener('wheel', this._onWheel, { passive: false });
    domElement.addEventListener('pointerdown', this._onPointerDown);
    // Move/up live on window so a middle-drag that leaves the canvas (or the
    // browser window, thanks to pointer capture) keeps panning smoothly.
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onWindowBlur);
    window.addEventListener('focus', this._onWindowFocus);
    // mouseleave/enter on the root element tell us when the OS cursor exits
    // the browser viewport entirely — that's when edge scrolling must pause
    // (otherwise the camera would fly off whenever the user alt-tabs near an edge).
    document.documentElement.addEventListener('mouseleave', this._onMouseLeaveDoc);
    document.documentElement.addEventListener('mouseenter', this._onMouseEnterDoc);

    // Snap the camera to its initial pose immediately so frame 0 is correct.
    this._applyTransform();
  }

  // ────────────────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Per-frame update: edge scroll + keyboard scroll, bounds clamp, and the
   * final camera transform. Middle-drag and zoom mutate state from their
   * event handlers; this method just integrates and applies.
   * @param {number} dt - Clamped frame delta in seconds.
   */
  update(dt) {
    _scrollDir.set(0, 0);

    // Edge scrolling — only while the window owns the cursor and no drag is
    // in progress (dragging near an edge shouldn't double-pan).
    if (!this._dragging && this._windowFocused && this._pointerInWindow) {
      const px = this._pointerClient.x;
      const py = this._pointerClient.y;
      const edge = CAM.EDGE_SIZE;
      if (px <= edge) _scrollDir.x -= 1;
      if (px >= window.innerWidth - edge) _scrollDir.x += 1;
      if (py <= edge) _scrollDir.y -= 1; // screen-top → world −Z (camera faces −Z)
      if (py >= window.innerHeight - edge) _scrollDir.y += 1;
    }

    // Keyboard arrows behave exactly like edge scrolling.
    if (this._keys.has('ArrowLeft')) _scrollDir.x -= 1;
    if (this._keys.has('ArrowRight')) _scrollDir.x += 1;
    if (this._keys.has('ArrowUp')) _scrollDir.y -= 1;
    if (this._keys.has('ArrowDown')) _scrollDir.y += 1;

    if (_scrollDir.x !== 0 || _scrollDir.y !== 0) {
      // Manual scrolling takes priority over an in-flight panTo tween.
      this._killPanTween();
      // Normalize so diagonal scroll isn't √2 faster than cardinal.
      _scrollDir.normalize();
      // Scroll speed scales with zoom: zoomed out = faster world-space pan.
      const speed = CAM.EDGE_SPEED * (this.height / REFERENCE_HEIGHT);
      this.focus.x += _scrollDir.x * speed * dt;
      this.focus.z += _scrollDir.y * speed * dt;
    }

    this._clampFocus();
    this._applyTransform();
  }

  /**
   * Smoothly recenter the camera on a world position (minimap click,
   * control-group double-tap recall, "jump to base" hotkeys...).
   * @param {THREE.Vector3|{x:number,z:number}} worldPos - Target ground point.
   * @param {number} [duration=0.5] - Tween length in seconds; `0` snaps instantly.
   */
  panTo(worldPos, duration = 0.5) {
    // Clamp the *destination* so the tween never eases outside the map.
    const tx = clamp(worldPos.x, this.bounds.minX, this.bounds.maxX);
    const tz = clamp(worldPos.z, this.bounds.minZ, this.bounds.maxZ);

    this._killPanTween();
    if (duration <= 0) {
      // Immediate snap (used by the engine to frame the start location).
      this.focus.x = tx;
      this.focus.z = tz;
      this._applyTransform();
      return;
    }
    this._panTween = gsap.to(this.focus, {
      x: tx,
      z: tz,
      duration,
      ease: 'power2.inOut',
      onComplete: () => { this._panTween = null; },
    });
  }

  /**
   * Replace the scroll bounds (e.g. after the terrain finishes building).
   * The focus is re-clamped immediately.
   * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds
   */
  setBounds(bounds) {
    this.bounds = bounds;
    this._clampFocus();
    this._applyTransform();
  }

  /** Remove every DOM listener and kill all live GSAP tweens. */
  dispose() {
    this.domElement.removeEventListener('wheel', this._onWheel);
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onWindowBlur);
    window.removeEventListener('focus', this._onWindowFocus);
    document.documentElement.removeEventListener('mouseleave', this._onMouseLeaveDoc);
    document.documentElement.removeEventListener('mouseenter', this._onMouseEnterDoc);

    // Kill tracked tweens plus a belt-and-braces sweep of anything else
    // targeting our objects (e.g. a tween created right before dispose).
    if (this._zoomTween) this._zoomTween.kill();
    if (this._panTween) this._panTween.kill();
    this._zoomTween = null;
    this._panTween = null;
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.focus);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Internals
  // ────────────────────────────────────────────────────────────────────────

  /** Place the camera on its fixed diagonal rail and aim it at the focus. */
  _applyTransform() {
    const terrainY = this.nexus ? this.nexus.getHeightAt(this.focus.x, this.focus.z) : 0;
    this.focus.y = terrainY;
    this.camera.position.set(
      this.focus.x,
      this.focus.y + this.height,
      this.focus.z + this.height * CAM.OFFSET_RATIO,
    );
    this.camera.lookAt(this.focus);
  }

  /** Keep the focus point inside the playable area. */
  _clampFocus() {
    this.focus.x = clamp(this.focus.x, this.bounds.minX, this.bounds.maxX);
    this.focus.z = clamp(this.focus.z, this.bounds.minZ, this.bounds.maxZ);
  }

  /** Kill an in-flight panTo tween (manual input always wins). */
  _killPanTween() {
    if (this._panTween) {
      this._panTween.kill();
      this._panTween = null;
    }
  }

  /**
   * Wheel → zoom. Each notch moves the *target* height by ZOOM_STEP; a GSAP
   * tween eases the live `height` toward it so consecutive notches compound
   * into one smooth glide instead of stuttering.
   * @param {WheelEvent} e
   */
  _onWheel(e) {
    e.preventDefault(); // keep the page (and pinch gestures) from scrolling
    const dir = Math.sign(e.deltaY); // +1 wheel-down = zoom out (higher)
    if (dir === 0) return;
    this._targetHeight = clamp(
      this._targetHeight + dir * CAM.ZOOM_STEP,
      CAM.MIN_HEIGHT,
      CAM.MAX_HEIGHT,
    );
    if (this._zoomTween) this._zoomTween.kill();
    this._zoomTween = gsap.to(this, {
      height: this._targetHeight,
      duration: CAM.ZOOM_EASE,
      ease: 'power2.out',
      onComplete: () => { this._zoomTween = null; },
    });
  }

  /**
   * Middle button starts a map-grab drag.
   * @param {PointerEvent} e
   */
  _onPointerDown(e) {
    if (e.button !== 1) return; // middle button only — left/right belong to selection/commands
    e.preventDefault(); // suppress Windows middle-click autoscroll widget
    this._dragging = true;
    this._dragLast.x = e.clientX;
    this._dragLast.y = e.clientY;
    this._killPanTween(); // grabbing the map cancels any automated pan
    // Capture so the drag keeps feeding us events outside the canvas/window.
    try { this.domElement.setPointerCapture(e.pointerId); } catch { /* non-fatal */ }
  }

  /**
   * Tracks the live cursor position (for edge scrolling) and applies
   * middle-drag panning.
   * @param {PointerEvent} e
   */
  _onPointerMove(e) {
    this._pointerClient.x = e.clientX;
    this._pointerClient.y = e.clientY;
    this._pointerInWindow = true; // any move inside the window re-arms edge scroll

    if (!this._dragging) return;
    const dx = e.clientX - this._dragLast.x;
    const dy = e.clientY - this._dragLast.y;
    this._dragLast.x = e.clientX;
    this._dragLast.y = e.clientY;

    // Grab semantics: dragging the mouse right moves the *world* right,
    // which means the focus (camera) moves left → subtract the delta.
    // Pixel→world scale grows with zoom so the map appears glued to the cursor.
    const scale = CAM.DRAG_SPEED * (this.height / REFERENCE_HEIGHT);
    this.focus.x -= dx * scale;
    this.focus.z -= dy * scale;
    // Clamp immediately (not just in update) so a fast fling can't overshoot
    // the bounds for a frame.
    this._clampFocus();
  }

  /**
   * Ends a middle-drag.
   * @param {PointerEvent} e
   */
  _onPointerUp(e) {
    if (e.button !== 1 || !this._dragging) return;
    this._dragging = false;
    try { this.domElement.releasePointerCapture(e.pointerId); } catch { /* non-fatal */ }
  }

  /** @param {KeyboardEvent} e */
  _onKeyDown(e) {
    // Only the four arrows — everything else belongs to other systems.
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight'
      || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      this._keys.add(e.code);
    }
  }

  /** @param {KeyboardEvent} e */
  _onKeyUp(e) {
    this._keys.delete(e.code);
  }

  /** Window lost focus → freeze scrolling and forget held keys. */
  _onWindowBlur() {
    this._windowFocused = false;
    this._keys.clear(); // avoid "stuck arrow" when refocusing
    this._dragging = false;
  }

  _onWindowFocus() {
    this._windowFocused = true;
  }

  /** OS cursor left the browser viewport → pause edge scrolling. */
  _onMouseLeaveDoc() {
    this._pointerInWindow = false;
  }

  _onMouseEnterDoc() {
    this._pointerInWindow = true;
  }
}
