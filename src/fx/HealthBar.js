/**
 * HealthBar — a flat, screen-facing 2D bar that hovers over a unit or building,
 * in the classic Warcraft 3 style: a solid GREEN health bar, and (for units with
 * a mana pool) a solid BLUE mana bar stacked directly beneath it. Shown only
 * when the entity is damaged / not-full-mana or is selected, so a healthy idle
 * army isn't cluttered with bars.
 *
 * "Always faces the screen": unlike a fixed-tilt quad, the bar group is
 * re-oriented every frame to the camera. Because the bar is parented to the
 * entity's `mesh` (which yaws to face travel), the *local* orientation we write
 * is `inverse(parentWorldQuat) · cameraQuat`, which cancels the unit's spin and
 * leaves the bar perfectly flat to the viewport at any camera angle/zoom.
 *
 * Perf: geometries are cached per width; the fill colors + backdrop are shared
 * unlit (fog-immune) materials. `update()` only mutates a scale, a couple of
 * quaternion multiplies, and — on change — a material swap: zero per-frame
 * allocation (module-scope scratch quaternion reused).
 */
import * as THREE from 'three';

/** Bar thickness in world units (chunkier than v1 so it reads at RTS zoom). */
const BAR_HEIGHT = 0.2;
/** Vertical gap between the HP bar and the mana bar beneath it. */
const BAR_GAP = 0.06;
/** Thickness of the bright frame drawn around the plate. */
const FRAME_PAD = 0.06;

// ── Shared geometry caches (keyed by width string) ──────────────────────────
const _bgGeo = new Map();
const _frameGeo = new Map();
const _fillGeo = new Map();

/**
 * Inner dark plate geometry framing one or two stacked bars. Cache key folds
 * in the row count.
 * @param {number} width @param {number} rows
 */
function bgGeometry(width, rows) {
  const k = `${width.toFixed(2)}x${rows}`;
  let g = _bgGeo.get(k);
  if (!g) {
    const h = BAR_HEIGHT * rows + BAR_GAP * (rows - 1) + 0.04;
    g = new THREE.PlaneGeometry(width + 0.05, h);
    _bgGeo.set(k, g);
  }
  return g;
}

/** Bright outer frame plate (slightly larger than the dark plate). */
function frameGeometry(width, rows) {
  const k = `${width.toFixed(2)}x${rows}`;
  let g = _frameGeo.get(k);
  if (!g) {
    const h = BAR_HEIGHT * rows + BAR_GAP * (rows - 1) + 0.04 + FRAME_PAD;
    g = new THREE.PlaneGeometry(width + 0.05 + FRAME_PAD, h);
    _frameGeo.set(k, g);
  }
  return g;
}

/** A left-anchored fill quad (local x=0 at the left edge) for width-scaling. */
function fillGeometry(width) {
  const k = width.toFixed(2);
  let g = _fillGeo.get(k);
  if (!g) {
    g = new THREE.PlaneGeometry(width, BAR_HEIGHT);
    g.translate(width / 2, 0, 0); // left edge at local x=0 for anchored scaling
    _fillGeo.set(k, g);
  }
  return g;
}

/**
 * Shared unlit materials.
 *
 * CRITICAL RENDER NOTES (this is why the bars were showing up as dark plates):
 *   - `depthTest:false` — the bar layers (frame → dark track → fill → highlight)
 *     sit within ~0.02 world units of each other. With depth testing on, their
 *     transparent draw order was ambiguous and the opaque dark backplate kept
 *     painting OVER the green/blue fill, so all you saw was a dark rectangle.
 *     Disabling depth test + assigning an explicit renderOrder per layer (see
 *     createHealthBar) makes the fill ALWAYS draw last, on top of the track.
 *   - `toneMapped:false` — the renderer uses ACES filmic tone mapping, which
 *     drags a "bright" green toward a muddy olive. Opting the bar colors out of
 *     tone mapping keeps them the exact, screaming green/blue you asked for.
 *   - `fog:false` — bars stay legible through distance fog.
 */
let _bgMat = null;   // inner dark track (drained portion shows through)
let _frameMat = null; // bright steel frame
let _green = null;   // HP fill (vivid emerald)
let _greenHi = null; // HP top highlight sliver
let _blue = null;    // mana fill (bright cyan)
let _blueHi = null;  // mana top highlight sliver
let _yellow = null;  // construction fill
let _yellowHi = null; // construction highlight
function mats() {
  if (!_bgMat) {
    const flat = (color, opacity = 1) =>
      new THREE.MeshBasicMaterial({
        color, fog: false, transparent: true, opacity,
        depthTest: false, depthWrite: false, toneMapped: false,
      });
    _bgMat = flat(0x0a0e16, 1);   // dark empty track
    _frameMat = flat(0x0a0c12, 1); // near-black outer frame (contrast for the fill)
    _green = flat(0x24ff43);   // screaming health green
    _greenHi = flat(0xb7ffc4); // pale highlight band
    _blue = flat(0x2ad0ff);    // bright mana cyan
    _blueHi = flat(0xc0f2ff);  // pale highlight band
    _yellow = flat(0xffd33d);  // construction progress
    _yellowHi = flat(0xfff6a6); // hot yellow highlight band
  }
  return { bg: _bgMat, frame: _frameMat, green: _green, greenHi: _greenHi, blue: _blue, blueHi: _blueHi, yellow: _yellow, yellowHi: _yellowHi };
}

// ── Module-scope scratch (no per-frame allocation) ──────────────────────────
const _pq = new THREE.Quaternion();

/**
 * Create a health-bar controller.
 * @param {number} width - Bar width in world units (≈ 2× the footprint).
 * @param {number} yPos - Height above the entity origin to float the bar.
 * @param {{ mana?: boolean, construction?: boolean }} [opts] - mana:true adds
 *   the blue mana row; construction:true adds a yellow row above HP.
 * @returns {{ group: THREE.Group,
 *   update: (hpFrac:number, manaFrac:number, visible:boolean,
 *            camera:THREE.Camera, parentQuat:THREE.Quaternion)=>void }}
 */
export function createHealthBar(width, yPos, opts = {}) {
  const m = mats();
  const hasMana = !!opts.mana;
  const hasConstruction = !!opts.construction;
  const rows = 1 + (hasMana ? 1 : 0) + (hasConstruction ? 1 : 0);

  const group = new THREE.Group();
  group.position.set(0, yPos, 0);
  group.renderOrder = 20;
  group.visible = false;

  // Layered painter's order via explicit renderOrder (depthTest is off on every
  // bar material). Higher renderOrder = drawn later = on top:
  //   frame(20) → dark track(21) → fill(22) → highlight(23).
  // This guarantees the bright fill sits ON the dark track instead of under it.
  const frame = new THREE.Mesh(frameGeometry(width, rows), m.frame);
  frame.renderOrder = 20;
  frame.raycast = () => {};
  group.add(frame);
  const bg = new THREE.Mesh(bgGeometry(width, rows), m.bg);
  bg.renderOrder = 21;
  bg.raycast = () => {}; // never intercept entity picking
  group.add(bg);

  const rowStep = BAR_HEIGHT + BAR_GAP;
  const topY = ((rows - 1) * rowStep) / 2;
  const constructionY = hasConstruction ? topY : null;
  const hpY = hasConstruction ? topY - rowStep : topY;
  const manaY = hasMana ? hpY - rowStep : null;

  // Each bar: a pivot anchored at the bar's LEFT edge so scaling x drains it
  // rightward (WC3 bars empty toward the right). A thin brighter highlight
  // band sits along the top third of the fill to give it a lit, glossy read.
  const makeBar = (yOff, fillMat, hiMat) => {
    const pivot = new THREE.Group();
    pivot.position.set(-width / 2, yOff, 0);
    pivot.renderOrder = 20; // FIX: Match group's renderOrder so nested children sort correctly in Three.js
    const fill = new THREE.Mesh(fillGeometry(width), fillMat);
    fill.renderOrder = 22;
    fill.raycast = () => {};
    pivot.add(fill);
    const hi = new THREE.Mesh(fillGeometry(width), hiMat);
    hi.scale.y = 0.34;
    hi.position.y = BAR_HEIGHT * 0.3;
    hi.renderOrder = 23;
    hi.raycast = () => {};
    pivot.add(hi);
    group.add(pivot);
    return pivot;
  };
  const constructionPivot = hasConstruction ? makeBar(constructionY, m.yellow, m.yellowHi) : null;
  const hpPivot = makeBar(hpY, m.green, m.greenHi);
  const manaPivot = hasMana ? makeBar(manaY, m.blue, m.blueHi) : null;

  let lastHp = -1;
  let lastMana = -1;
  let lastConstruction = -1;
  return {
    group,
    /**
     * @param {number} hpFrac - Current hp fraction (0..1).
     * @param {number} manaFrac - Current mana fraction (0..1); ignored if no mana row.
     * @param {boolean} visible - Whether to show the bar this frame.
     * @param {THREE.Camera} camera - Live camera (for screen-facing billboard).
     * @param {THREE.Quaternion} parentQuat - Owner mesh world quaternion.
     * @param {number|null} [constructionFrac] - 0..1 progress, or null to hide.
     */
    update(hpFrac, manaFrac, visible, camera, parentQuat, constructionFrac = null) {
      group.visible = visible;
      if (!visible) return;

      // Billboard: local = inverse(parentWorld) · camera → world == camera.
      if (camera && parentQuat) {
        _pq.copy(parentQuat).invert();
        group.quaternion.multiplyQuaternions(_pq, camera.quaternion);
      }

      const h = hpFrac < 0 ? 0 : hpFrac > 1 ? 1 : hpFrac;
      if (h !== lastHp) {
        hpPivot.scale.x = Math.max(0.0001, h);
        lastHp = h;
      }
      if (manaPivot) {
        const mn = manaFrac < 0 ? 0 : manaFrac > 1 ? 1 : manaFrac;
        if (mn !== lastMana) {
          manaPivot.scale.x = Math.max(0.0001, mn);
          lastMana = mn;
        }
      }
      if (constructionPivot) {
        const showConstruction = constructionFrac !== null && constructionFrac < 1;
        constructionPivot.visible = showConstruction;
        if (showConstruction) {
          const cp = constructionFrac < 0 ? 0 : constructionFrac > 1 ? 1 : constructionFrac;
          if (cp !== lastConstruction) {
            constructionPivot.scale.x = Math.max(0.0001, cp);
            lastConstruction = cp;
          }
        }
      }
    },
  };
}

/** Dispose the shared bar geometries/materials (engine teardown). */
export function disposeHealthBars() {
  for (const g of _bgGeo.values()) g.dispose();
  for (const g of _frameGeo.values()) g.dispose();
  for (const g of _fillGeo.values()) g.dispose();
  _bgGeo.clear();
  _frameGeo.clear();
  _fillGeo.clear();
  for (const mat of [_bgMat, _frameMat, _green, _greenHi, _blue, _blueHi, _yellow, _yellowHi]) mat?.dispose();
  _bgMat = _frameMat = _green = _greenHi = _blue = _blueHi = _yellow = _yellowHi = null;
}
