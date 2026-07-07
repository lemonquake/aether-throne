/**
 * InputManager — the single owner of raw DOM input during a match.
 *
 * Responsibilities (ARCHITECTURE.md §5):
 *  - Translate DOM pointer/keyboard events into the canonical eventBus events
 *    (EVENTS.POINTER_DOWN / POINTER_MOVE / POINTER_UP / KEY_DOWN / KEY_UP)
 *    so downstream systems (SelectionSystem, CommandSystem, debug overlays)
 *    never touch the DOM themselves.
 *  - Maintain *live* pointer coordinates in two spaces:
 *      `pointerNDC`    — normalized device coords (-1..+1, +y up) for raycasts
 *      `pointerScreen` — client pixels (+y down) for the selection marquee
 *  - Track held keys for polling via `isKeyDown(code)` (e.g. the CommandSystem
 *    checks 'KeyA' for attack-move clicks).
 *  - Suppress the browser context menu on the canvas — right-click is a
 *    smart-command, not a menu.
 *
 * Listener topology (per contract): keyboard on `window` (the canvas never
 * holds keyboard focus), pointer on the canvas. Left/right pointer-downs
 * grab pointer capture on the canvas so drags that leave the canvas — or the
 * browser window entirely — keep streaming move/up events to us (critical
 * for marquee drags). The middle button is deliberately NOT captured here;
 * RTSCameraController owns middle-drag and does its own capture.
 *
 * Perf contract:
 *  - POINTER_MOVE fires at pointer-device rate (can exceed 120 Hz), so its
 *    payload is a REUSED scratch object — subscribers must copy any values
 *    they retain past the synchronous handler call.
 *  - POINTER_DOWN/UP and KEY_DOWN/UP fire at human click/keystroke rate, so
 *    they get fresh payload objects that are safe to retain.
 *
 * Coordinate gotcha (documented once, relied on everywhere): NDC +y points UP
 * while client-pixel +y points DOWN. The conversion here is the one place the
 * flip happens on the way *in*; SelectionSystem performs the mirror-image flip
 * on the way *out* when projecting world positions back to screen pixels.
 */
import { eventBus, EVENTS } from '../engine/EventBus.js';

/**
 * True when a keyboard event originates from a text-entry element (chat box,
 * lobby inputs, dev overlay fields). Game hotkeys must not fire while typing.
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
function isEditableTarget(target) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
}

export class InputManager {
  /**
   * @param {HTMLElement} domElement - The game canvas. Pointer listeners and
   *        the contextmenu suppression attach here; NDC math uses its rect.
   */
  constructor(domElement) {
    /** @type {HTMLElement} */
    this.domElement = domElement;

    /**
     * Live pointer position in normalized device coordinates (-1..+1, +y up).
     * Mutated in place — read fields, never retain a stale copy of the object
     * expecting it to freeze.
     * @type {{x:number, y:number}}
     */
    this.pointerNDC = { x: 0, y: 0 };

    /**
     * Live pointer position in client pixels (+y down). Same mutation caveat.
     * @type {{x:number, y:number}}
     */
    this.pointerScreen = { x: 0, y: 0 };

    /** @type {Set<string>} Currently held KeyboardEvent.code values. */
    this._keys = new Set();

    /**
     * Cached canvas rect for the client-pixel → NDC conversion. Refreshed on
     * resize and on every pointerdown (cheap, and covers layout changes that
     * don't fire a window resize). Width/height floored at 1 so a hidden
     * canvas can never divide by zero.
     */
    this._rect = { left: 0, top: 0, width: 1, height: 1 };

    /**
     * REUSED payload for the high-frequency POINTER_MOVE event — see the
     * class docblock. Down/up payloads are freshly allocated instead.
     */
    this._movePayload = {
      ndc: { x: 0, y: 0 },
      screen: { x: 0, y: 0 },
      buttons: 0,
    };

    // Bind handlers once so add/removeEventListener get identical references.
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onPointerCancel = this._onPointerCancel.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onWindowBlur = this._onWindowBlur.bind(this);
    this._onWindowResize = this._onWindowResize.bind(this);

    // Pointer events on the canvas (capture keeps drags flowing here even
    // when the cursor leaves the canvas — see _onPointerDown).
    domElement.addEventListener('pointerdown', this._onPointerDown);
    domElement.addEventListener('pointermove', this._onPointerMove);
    domElement.addEventListener('pointerup', this._onPointerUp);
    domElement.addEventListener('pointercancel', this._onPointerCancel);
    // Right-click is a command — never show the browser menu over the game.
    domElement.addEventListener('contextmenu', this._onContextMenu);

    // Keyboard on window: the canvas has tabindex="-1" and never focuses.
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    // Alt-tab must not leave "stuck" keys (a held A would turn every click
    // into an attack-move after refocusing).
    window.addEventListener('blur', this._onWindowBlur);
    window.addEventListener('resize', this._onWindowResize);

    this._refreshRect();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Per-frame hook (called by the engine loop before everything else).
   * All InputManager state is event-driven, so this is intentionally empty —
   * it exists so the engine's update order stays uniform and future
   * frame-coupled input features (gesture timing, key-repeat synthesis) have
   * a home without an engine change.
   * @param {number} dt - Clamped frame delta in seconds (unused).
   */
  update(dt) {
    void dt; // TODO(phase-5): input recording/replay hooks live here.
  }

  /**
   * Poll whether a key is currently held.
   * @param {string} code - KeyboardEvent.code, e.g. 'ControlLeft', 'KeyA'.
   * @returns {boolean}
   */
  isKeyDown(code) {
    return this._keys.has(code);
  }

  /** Detach every DOM listener. Idempotent. */
  dispose() {
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointercancel', this._onPointerCancel);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onWindowBlur);
    window.removeEventListener('resize', this._onWindowResize);
    this._keys.clear();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internals
  // ──────────────────────────────────────────────────────────────────────────

  /** Re-measure the canvas rect used for the NDC conversion. */
  _refreshRect() {
    const r = this.domElement.getBoundingClientRect();
    this._rect.left = r.left;
    this._rect.top = r.top;
    // Floor at 1: the canvas starts with the `hidden` class before bootstrap
    // reveals it — a 0-sized rect must never produce NaN coordinates.
    this._rect.width = Math.max(1, r.width);
    this._rect.height = Math.max(1, r.height);
  }

  /**
   * Update both live coordinate spaces from a pointer event.
   * NDC: x maps left→-1 / right→+1; y maps top→+1 / bottom→-1 (the y FLIP —
   * WebGL NDC is +y up, client pixels are +y down).
   * @param {PointerEvent} e
   */
  _updatePointer(e) {
    this.pointerScreen.x = e.clientX;
    this.pointerScreen.y = e.clientY;
    const r = this._rect;
    this.pointerNDC.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.pointerNDC.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
  }

  /**
   * Build a fresh (retainable) payload for POINTER_DOWN/UP.
   * @param {PointerEvent} e
   * @returns {{button:number, ndc:{x:number,y:number}, screen:{x:number,y:number},
   *            shiftKey:boolean, ctrlKey:boolean, altKey:boolean}}
   */
  _makeButtonPayload(e) {
    return {
      button: e.button,
      ndc: { x: this.pointerNDC.x, y: this.pointerNDC.y },
      screen: { x: this.pointerScreen.x, y: this.pointerScreen.y },
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
    };
  }

  /** @param {PointerEvent} e */
  _onPointerDown(e) {
    // Cheap re-measure so a resized/moved canvas can't skew this click's NDC.
    this._refreshRect();
    this._updatePointer(e);

    // Capture left/right so marquee & command drags survive leaving the
    // canvas (middle belongs to the camera controller — it captures itself).
    if (e.button === 0 || e.button === 2) {
      try {
        this.domElement.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone (e.g. pen lifted) — non-fatal */
      }
    }

    eventBus.emit(EVENTS.POINTER_DOWN, this._makeButtonPayload(e));
  }

  /** @param {PointerEvent} e */
  _onPointerMove(e) {
    this._updatePointer(e);

    // Hot path: reuse one payload object (see class docblock). Subscribers
    // copy what they keep; nobody may stash a reference to `p.ndc`/`p.screen`.
    const p = this._movePayload;
    p.ndc.x = this.pointerNDC.x;
    p.ndc.y = this.pointerNDC.y;
    p.screen.x = this.pointerScreen.x;
    p.screen.y = this.pointerScreen.y;
    p.buttons = e.buttons;
    eventBus.emit(EVENTS.POINTER_MOVE, p);
  }

  /** @param {PointerEvent} e */
  _onPointerUp(e) {
    this._updatePointer(e);
    try {
      if (this.domElement.hasPointerCapture?.(e.pointerId)) {
        this.domElement.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* non-fatal */
    }
    eventBus.emit(EVENTS.POINTER_UP, this._makeButtonPayload(e));
  }

  /**
   * A cancelled pointer (OS gesture, pen leaving range, tab switch mid-drag)
   * is surfaced as a normal POINTER_UP so drag consumers (marquee, right-drag
   * threshold) can't get stuck in a "button held forever" state.
   * @param {PointerEvent} e
   */
  _onPointerCancel(e) {
    this._onPointerUp(e);
  }

  /** @param {MouseEvent} e */
  _onContextMenu(e) {
    e.preventDefault(); // right-click issues commands, never opens a menu
  }

  /** @param {KeyboardEvent} e */
  _onKeyDown(e) {
    // Never steal keystrokes from text inputs (lobby name fields, dev tools).
    if (isEditableTarget(e.target)) return;
    this._keys.add(e.code);
    eventBus.emit(EVENTS.KEY_DOWN, {
      code: e.code,
      key: e.key,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      repeat: e.repeat,
    });
  }

  /** @param {KeyboardEvent} e */
  _onKeyUp(e) {
    // No editable-target guard here: if keydown was tracked, keyup must
    // always clear it, even if focus moved into an input mid-press.
    this._keys.delete(e.code);
    eventBus.emit(EVENTS.KEY_UP, { code: e.code, key: e.key });
  }

  /** Window lost focus → forget every held key (prevents stuck modifiers). */
  _onWindowBlur() {
    this._keys.clear();
  }

  _onWindowResize() {
    this._refreshRect();
  }
}
