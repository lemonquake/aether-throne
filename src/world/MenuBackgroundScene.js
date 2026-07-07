/**
 * MenuBackgroundScene — the ambient 3D backdrop behind the main menu and
 * match lobby. Fully self-contained: it owns its OWN renderer, scene, camera
 * and requestAnimationFrame loop, and never touches the game engine (which
 * doesn't even exist while the menu is up).
 *
 * Visual recipe (deliberately tiny — 2 draw calls + 3 lights):
 *   - a slow-drifting cluster of glowing aether crystals (ONE InstancedMesh),
 *   - a field of rising mote particles (ONE THREE.Points),
 *   - exponential scene fog over a deep blue-black clear color, so geometry
 *     melts into the UI theme at the edges.
 *
 * Lifecycle contract (owned by React — MainMenu/MatchLobby):
 *   const bg = new MenuBackgroundScene(canvasEl);
 *   bg.start();     // in a mount effect
 *   bg.stop();      // pause without freeing (e.g. tab of a wizard)
 *   bg.dispose();   // in the unmount cleanup — frees every GPU resource
 *
 * Performance budget: < 2 ms/frame. Everything animated is either a typed
 * array walk (particles) or a handful of matrix composes (crystals); there
 * are ZERO allocations inside the animation loop (module-scope scratch math
 * objects only), pixel ratio is capped, and shadows/postprocessing are off.
 */
import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Tuning constants — cosmetic only, safe to tweak freely.
// ─────────────────────────────────────────────────────────────────────────────

/** Seed for the layout PRNG so the menu vista is identical on every boot. */
const MENU_SEED = 0xa37e12;

/** Number of drifting crystal shards. */
const CRYSTAL_COUNT = 18;

/** Number of rising aether motes. */
const PARTICLE_COUNT = 220;

/** Axis-aligned box the particles live (and wrap) inside. */
const PARTICLE_BOUNDS = {
  minX: -32, maxX: 32,
  minY: -3, maxY: 22,
  minZ: -28, maxZ: 6,
};

/** Deep blue-black backdrop matching the UI theme panels. */
const CLEAR_COLOR = 0x060913;

/** Cap the device pixel ratio — the menu doesn't need retina-perfect motes. */
const MAX_PIXEL_RATIO = 1.5;

/** Clamp the animation delta so a background tab doesn't teleport crystals. */
const MAX_DT = 0.05;

/** Crystal tint palette (cyan → violet, same family as the in-game doodads). */
const CRYSTAL_PALETTE = [
  new THREE.Color(0x6fe3d6),
  new THREE.Color(0x7fc9ff),
  new THREE.Color(0x9a86e8),
  new THREE.Color(0xc9a227), // one gold accent shard per ~4, ties into the UI
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers & module-scope scratch (zero per-frame allocation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * mulberry32 — tiny seedable PRNG returning floats in [0, 1).
 * Used only at construction time to lay out crystals/particles.
 * @param {number} seed - 32-bit integer seed.
 * @returns {() => number}
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _lookTarget = new THREE.Vector3(0, 4, 0);

/**
 * Per-crystal animation record layout inside the packed Float32Array.
 * (Packed stride array instead of an array-of-objects: cache-friendly and
 * makes the "no allocation in the loop" guarantee trivially auditable.)
 */
const C_STRIDE = 8;
const C_X = 0;        // base position x
const C_Y = 1;        // base position y (bob center)
const C_Z = 2;        // base position z
const C_SCALE = 3;    // uniform-ish scale (y gets an extra stretch)
const C_PHASE = 4;    // per-crystal phase offset for bob/tilt desync
const C_YAW_SPD = 5;  // radians/sec of slow spin
const C_BOB_AMP = 6;  // vertical bob amplitude (world units)
const C_STRETCH = 7;  // vertical stretch multiplier (shard elongation)

/**
 * MenuBackgroundScene — see module header. One instance per mounted menu
 * canvas; construct → start → stop/dispose.
 */
export class MenuBackgroundScene {
  /**
   * Build the whole scene up-front (cheap: a few hundred verts). Nothing
   * renders until {@link MenuBackgroundScene#start} is called.
   * @param {HTMLCanvasElement} canvas - Full-screen canvas the menu renders
   *   behind its panels. This class never resizes/removes the element itself;
   *   it only draws into it and tracks window resizes.
   */
  constructor(canvas) {
    /** @type {HTMLCanvasElement} */
    this.canvas = canvas;

    // Respect the user's reduced-motion preference: we still render (the menu
    // would look broken fully static-black), but all drift amplitudes and
    // speeds are heavily damped. Checked once — a live preference flip just
    // requires a remount, which is fine for a menu.
    /** @private */
    this._motionScale =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0.15
        : 1.0;

    // ── Renderer ──────────────────────────────────────────────────────────
    /** @type {THREE.WebGLRenderer} */
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      // No alpha: we clear to the theme color ourselves; an opaque buffer is
      // cheaper and avoids blending surprises with the page background.
      alpha: false,
      powerPreference: 'low-power', // it's a menu — be kind to laptops
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.setClearColor(CLEAR_COLOR, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false; // hard perf rule: no menu shadows

    // ── Scene & camera ────────────────────────────────────────────────────
    /** @type {THREE.Scene} */
    this.scene = new THREE.Scene();
    // Exponential fog melts distant shards into the clear color — this is
    // the "fog" of the menu ambience (unrelated to gameplay FogOfWar).
    this.scene.fog = new THREE.FogExp2(CLEAR_COLOR, 0.026);

    /** @type {THREE.PerspectiveCamera} */
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.camera.position.set(0, 4, 26);
    this.camera.lookAt(_lookTarget);

    // ── Lights (3 total, no shadows) ──────────────────────────────────────
    // Hemisphere gives the base ambient wash; two colored points make the
    // crystal facets glint cyan on one side, gold on the other.
    /** @private */
    this._lights = [
      new THREE.HemisphereLight(0x38508c, 0x090a12, 0.9),
      new THREE.PointLight(0x59d6c4, 220, 90, 2), // cyan key
      new THREE.PointLight(0xc9a227, 120, 80, 2), // gold rim
    ];
    this._lights[1].position.set(-14, 10, 6);
    this._lights[2].position.set(16, 6, -8);
    for (const light of this._lights) this.scene.add(light);

    // ── Animated content ──────────────────────────────────────────────────
    const rng = mulberry32(MENU_SEED);
    this._buildCrystals(rng);
    this._buildParticles(rng);

    // ── Loop bookkeeping ──────────────────────────────────────────────────
    /** @private {number} Accumulated animation time in seconds. */
    this._time = 0;
    /** @private {number|null} Last rAF timestamp (ms) for dt computation. */
    this._lastTimestamp = null;
    /** @private {number} Current rAF handle, 0 when not running. */
    this._raf = 0;
    /** @private {boolean} True after dispose() — guards zombie start()s. */
    this._disposed = false;

    // Bind once so add/removeEventListener and rAF get stable references
    // (re-binding per frame would allocate — see perf rules).
    /** @private */
    this._onFrame = this._onFrame.bind(this);
    /** @private */
    this._onResize = this._onResize.bind(this);

    window.addEventListener('resize', this._onResize);
    this._onResize(); // initial sizing from the canvas's CSS layout box
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public API (contract)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Begin the animation loop. Idempotent — calling start() while already
   * running (e.g. React StrictMode double-effects) is a no-op.
   */
  start() {
    if (this._disposed || this._raf) return;
    this._lastTimestamp = null; // forget stale time so dt doesn't jump
    this._raf = requestAnimationFrame(this._onFrame);
  }

  /**
   * Pause the animation loop without freeing anything. The last rendered
   * frame stays on the canvas. Safe to call when already stopped.
   */
  stop() {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
  }

  /**
   * Stop the loop and free EVERY GPU resource (geometries, materials, the
   * GL context itself) plus DOM listeners. The instance is dead afterwards —
   * React unmount cleanup should drop its reference.
   */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;

    this.stop();
    window.removeEventListener('resize', this._onResize);

    // Crystals: InstancedMesh owns per-instance buffers as well.
    if (this._crystalMesh) {
      this.scene.remove(this._crystalMesh);
      this._crystalMesh.geometry.dispose();
      this._crystalMesh.material.dispose();
      this._crystalMesh.dispose(); // frees instanceMatrix/instanceColor GPU buffers
      this._crystalMesh = null;
    }

    // Particles.
    if (this._points) {
      this.scene.remove(this._points);
      this._points.geometry.dispose();
      this._points.material.dispose();
      this._points = null;
    }

    for (const light of this._lights) this.scene.remove(light);
    this._lights.length = 0;

    // Release the renderer's GL objects, then force the context itself loose.
    // Without forceContextLoss, repeatedly mounting/unmounting the menu can
    // exhaust the browser's ~16 simultaneous WebGL context budget before GC
    // gets around to collecting the old canvases.
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.canvas = null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Construction internals
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * One InstancedMesh of low-poly octahedron shards scattered in a loose arc
   * in front of the camera. Layout, scale, spin speed and palette tint are
   * all drawn from the seeded PRNG; the animation state lives in a packed
   * Float32Array (see the C_* stride constants).
   * @param {() => number} rng - Seeded PRNG.
   * @private
   */
  _buildCrystals(rng) {
    // Flat-shaded octahedron reads as a gem at any size — 8 triangles total.
    const geometry = new THREE.OctahedronGeometry(1, 0);
    const material = new THREE.MeshStandardMaterial({
      color: 0xdffcf6,
      emissive: 0x1e8d84,
      emissiveIntensity: 0.7,
      roughness: 0.3,
      metalness: 0.15,
      flatShading: true,
      fog: true, // let scene fog swallow the far shards
    });

    const mesh = new THREE.InstancedMesh(geometry, material, CRYSTAL_COUNT);
    mesh.name = 'menu-crystals';

    /** @private Packed per-crystal animation parameters. */
    this._crystals = new Float32Array(CRYSTAL_COUNT * C_STRIDE);

    for (let i = 0; i < CRYSTAL_COUNT; i++) {
      const o = i * C_STRIDE;
      const c = this._crystals;

      // Scatter across a wide, shallow arc: full width, biased toward the
      // back of the volume so panels in front stay readable.
      c[o + C_X] = (rng() * 2 - 1) * 26;
      c[o + C_Y] = 1.5 + rng() * 11;
      c[o + C_Z] = -22 + rng() * 20;
      c[o + C_SCALE] = 0.5 + rng() * 1.6;
      c[o + C_PHASE] = rng() * Math.PI * 2;
      // Spin direction alternates via the sign flip; speed stays gentle.
      c[o + C_YAW_SPD] = (0.08 + rng() * 0.22) * (rng() < 0.5 ? -1 : 1);
      c[o + C_BOB_AMP] = 0.5 + rng() * 1.1;
      c[o + C_STRETCH] = 1.4 + rng() * 1.4;

      // Static per-instance tint from the palette (deterministic pick).
      mesh.setColorAt(i, CRYSTAL_PALETTE[(rng() * CRYSTAL_PALETTE.length) | 0]);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // Matrices are rewritten every frame; mark the buffer as dynamic so the
    // driver keeps it in an upload-friendly location.
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // The whole shard cluster always fills the view; skip the per-frame
    // frustum test rather than recomputing instance bounds after every move.
    mesh.frustumCulled = false;

    /** @private @type {THREE.InstancedMesh|null} */
    this._crystalMesh = mesh;
    this.scene.add(mesh);
  }

  /**
   * A single THREE.Points cloud of additive glowing motes that drift slowly
   * upward and wrap around inside PARTICLE_BOUNDS. Velocities are stored in
   * a parallel typed array; the position attribute is updated in place.
   * @param {() => number} rng - Seeded PRNG.
   * @private
   */
  _buildParticles(rng) {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    // Two floats per particle: upward speed, sideways drift speed.
    /** @private */
    this._particleVel = new Float32Array(PARTICLE_COUNT * 2);

    const b = PARTICLE_BOUNDS;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3 + 0] = b.minX + rng() * (b.maxX - b.minX);
      positions[i * 3 + 1] = b.minY + rng() * (b.maxY - b.minY);
      positions[i * 3 + 2] = b.minZ + rng() * (b.maxZ - b.minZ);
      this._particleVel[i * 2 + 0] = 0.25 + rng() * 0.55;        // rise speed
      this._particleVel[i * 2 + 1] = (rng() * 2 - 1) * 0.18;     // x drift
    }

    const geometry = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage); // rewritten every frame
    geometry.setAttribute('position', posAttr);
    // Particles wrap within a fixed box; skip per-frame bounds work entirely.
    geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2),
      Math.hypot(b.maxX, b.maxY, -b.minZ) + 2
    );

    const material = new THREE.PointsMaterial({
      color: 0x74e8da,
      size: 0.22,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending, // motes glow instead of occlude
      depthWrite: false, // additive + depthWrite is a classic sparkle-killer
      fog: true,
    });

    /** @private @type {THREE.Points|null} */
    this._points = new THREE.Points(geometry, material);
    this._points.name = 'menu-particles';
    this._points.frustumCulled = false; // always on screen; skip the test
    this.scene.add(this._points);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Frame loop
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * rAF callback: compute a clamped dt, advance the ambient animation, render.
   * Everything in here is allocation-free (typed-array walks + module scratch).
   * @param {DOMHighResTimeStamp} timestamp - Provided by requestAnimationFrame.
   * @private
   */
  _onFrame(timestamp) {
    // Schedule the next frame FIRST so an exception can't silently kill the
    // loop mid-frame without the browser reporting it every frame.
    this._raf = requestAnimationFrame(this._onFrame);

    let dt = this._lastTimestamp === null ? 0 : (timestamp - this._lastTimestamp) / 1000;
    this._lastTimestamp = timestamp;
    if (dt > MAX_DT) dt = MAX_DT; // background-tab catch-up clamp
    dt *= this._motionScale; // reduced-motion: same scene, far gentler drift
    this._time += dt;
    const t = this._time;

    this._updateCrystals(t);
    this._updateParticles(dt);

    // Gentle camera sway — parallax sells the depth for one lookAt's cost.
    this.camera.position.x = Math.sin(t * 0.07) * 1.8;
    this.camera.position.y = 4 + Math.sin(t * 0.11) * 0.5;
    this.camera.lookAt(_lookTarget);

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Recompose every crystal's instance matrix: slow yaw spin, sine bob and a
   * faint tilt wobble. 18 matrix composes ≈ microseconds.
   * @param {number} t - Accumulated animation seconds.
   * @private
   */
  _updateCrystals(t) {
    const mesh = this._crystalMesh;
    const c = this._crystals;
    for (let i = 0; i < CRYSTAL_COUNT; i++) {
      const o = i * C_STRIDE;
      const phase = c[o + C_PHASE];
      const s = c[o + C_SCALE];

      _pos.set(
        c[o + C_X],
        c[o + C_Y] + Math.sin(t * 0.35 + phase) * c[o + C_BOB_AMP],
        c[o + C_Z]
      );
      _euler.set(
        Math.sin(t * 0.2 + phase) * 0.18,      // lazy nod
        t * c[o + C_YAW_SPD] + phase,          // continuous spin
        Math.cos(t * 0.17 + phase * 1.3) * 0.14 // counter-tilt
      );
      _quat.setFromEuler(_euler);
      _scale.set(s, s * c[o + C_STRETCH], s); // elongated shard silhouette
      _mat4.compose(_pos, _quat, _scale);
      mesh.setMatrixAt(i, _mat4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Advance the mote field: rise + sideways drift, wrapping at the bounds so
   * the cloud never thins out. Straight typed-array walk, no vector objects.
   * @param {number} dt - Frame delta seconds (already motion-scaled).
   * @private
   */
  _updateParticles(dt) {
    const attr = this._points.geometry.attributes.position;
    const p = attr.array;
    const v = this._particleVel;
    const b = PARTICLE_BOUNDS;
    const spanX = b.maxX - b.minX;
    const spanY = b.maxY - b.minY;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const pi = i * 3;
      p[pi] += v[i * 2 + 1] * dt;      // sideways drift
      p[pi + 1] += v[i * 2] * dt;      // rise

      // Wrap instead of respawn: cheaper and visually seamless with fog.
      if (p[pi + 1] > b.maxY) p[pi + 1] -= spanY;
      if (p[pi] > b.maxX) p[pi] -= spanX;
      else if (p[pi] < b.minX) p[pi] += spanX;
    }
    attr.needsUpdate = true;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DOM plumbing
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Match the drawing-buffer size to the canvas's CSS layout box. Uses
   * `setSize(w, h, false)` so three.js does NOT stomp the element's CSS
   * (the menu styles the canvas full-screen; we only follow it).
   * @private
   */
  _onResize() {
    if (!this.renderer) return;
    // clientWidth/Height reflect the CSS-laid-out size; fall back to the
    // window for the pathological "canvas not laid out yet" first tick.
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
