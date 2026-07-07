/**
 * FireEffect — a self-contained, looping fire + smoke plume attached to a
 * structure that has taken heavy damage (below FIRE_THRESHOLD hp). It is the
 * classic WC3 "your building is burning" tell: flickering flames, rising
 * embers, and dark smoke, growing angrier as the structure nears collapse.
 *
 * Cheapness / leak-safety (mirrors HealthBar / EffectsManager):
 *   - Textures (flame / smoke) are shared module-scope CanvasTextures, built
 *     once and freed by `disposeFireEffects()` on engine teardown.
 *   - Each effect owns a small fixed set of Sprites (no per-frame allocation);
 *     flames/embers/smoke loop procedurally from gameTime + per-sprite phase.
 *   - Only buildings actually below the threshold hold a live effect, and a
 *     repaired building disposes its own instantly.
 *
 * The returned group is added as a CHILD of the building mesh (local space), so
 * it inherits the building's world transform and is culled/hidden with it.
 */
import * as THREE from 'three';

// ── Shared textures (built lazily, freed on teardown) ───────────────────────
let _flameTex = null;
let _smokeTex = null;

/** Warm radial gradient: white-hot core → yellow → orange → transparent. */
function flameTexture() {
  if (_flameTex) return _flameTex;
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, 'rgba(255,255,235,1)');
  g.addColorStop(0.35, 'rgba(255,205,90,0.95)');
  g.addColorStop(0.7, 'rgba(255,110,25,0.6)');
  g.addColorStop(1.0, 'rgba(255,80,10,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  _flameTex = new THREE.CanvasTexture(c);
  _flameTex.colorSpace = THREE.SRGBColorSpace;
  return _flameTex;
}

/** Soft dark puff for smoke (normal blending, semi-opaque). */
function smokeTexture() {
  if (_smokeTex) return _smokeTex;
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, 'rgba(40,38,36,0.85)');
  g.addColorStop(0.5, 'rgba(28,26,24,0.5)');
  g.addColorStop(1.0, 'rgba(20,20,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  _smokeTex = new THREE.CanvasTexture(c);
  _smokeTex.colorSpace = THREE.SRGBColorSpace;
  return _smokeTex;
}

/** Fractional hash for deterministic-ish per-sprite variation (no allocation). */
function frac(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Create a fire/smoke plume sized to a structure footprint.
 * @param {number} radius - Building footprint radius (world units).
 * @param {number} baseHeight - Height above the origin to seat the flames.
 * @returns {{group: THREE.Group, update: (dt:number, now:number)=>void,
 *   setIntensity:(f:number)=>void, dispose:()=>void}}
 */
export function createFireEffect(radius = 1.5, baseHeight = 0.4) {
  const group = new THREE.Group();
  group.renderOrder = 7;

  // Emitter clusters spread over the footprint so a big keep burns across its
  // whole roofline, not from one point. More clusters + sprites = real chaos.
  const clusters = radius > 2.5 ? 5 : radius > 1.6 ? 4 : radius > 1 ? 3 : 2;
  const fscale = Math.min(2.2, Math.max(0.9, radius));
  const flames = [];
  const embers = [];
  const smokes = [];
  const light = new THREE.PointLight(0xff7a1e, 0, Math.max(8, radius * 5.5), 2);
  light.castShadow = false;
  light.position.set(0, baseHeight + radius * 1.15, 0);
  group.add(light);

  const flameMat = () =>
    new THREE.SpriteMaterial({ map: flameTexture(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const smokeMat = () =>
    new THREE.SpriteMaterial({ map: smokeTexture(), color: 0x2a2622, transparent: true, depthWrite: false, opacity: 0.6 });

  for (let ci = 0; ci < clusters; ci++) {
    const ang = (ci / clusters) * Math.PI * 2 + 0.6;
    const cr = clusters === 1 ? 0 : radius * (0.35 + 0.35 * frac(ci * 2.3));
    const ox = Math.cos(ang) * cr;
    const oz = Math.sin(ang) * cr;

    // Flames: a fat deep base, a mid body, and a bright licking tip per cluster.
    for (let f = 0; f < 3; f++) {
      const sp = new THREE.Sprite(flameMat());
      const sz = (f === 0 ? 1.8 : f === 1 ? 1.25 : 0.8) * fscale;
      sp.userData = { ox, oz, oy: baseHeight + f * 0.55 * fscale, sz, phase: frac(ci * 3 + f) * 6.28, tip: f };
      sp.scale.set(sz * 0.8, sz, 1);
      group.add(sp);
      flames.push(sp);
    }
    // Rising embers (two per cluster, staggered).
    for (let e = 0; e < 2; e++) {
      const em = new THREE.Sprite(flameMat());
      em.userData = { ox, oz, oy: baseHeight, phase: frac(ci * 7 + e * 2.7) };
      em.scale.setScalar((0.18 + 0.1 * frac(ci + e)) * fscale);
      group.add(em);
      embers.push(em);
    }
    // Smoke: a dark billowing column rising well above the flames.
    for (let s = 0; s < 2; s++) {
      const sm = new THREE.Sprite(smokeMat());
      sm.userData = { ox, oz, oy: baseHeight, phase: frac(ci * 5 + s * 3.1) };
      sm.scale.setScalar(radius);
      group.add(sm);
      smokes.push(sm);
    }
  }

  let intensity = 1; // 0 (just crossed threshold) → 1 (near collapse)

  return {
    group,

    /** Ramp fire size/opacity with how close the structure is to destroyed. */
    setIntensity(f) {
      intensity = f < 0 ? 0 : f > 1 ? 1 : f;
    },

    /**
     * Animate flicker, ember rise, and smoke loop. Allocation-free.
     * @param {number} dt @param {number} now - engine game time (seconds).
     */
    update(dt, now) {
      const grow = 0.55 + 0.45 * intensity;
      for (let i = 0; i < flames.length; i++) {
        const sp = flames[i];
        const u = sp.userData;
        const flick = 0.75 + 0.25 * Math.sin(now * 13 + u.phase) + 0.12 * Math.sin(now * 27 + u.phase * 2);
        const sc = u.sz * flick * grow;
        sp.scale.set(sc * 0.8, sc, 1);
        sp.position.set(u.ox + Math.sin(now * 9 + u.phase) * 0.05, u.oy + Math.abs(Math.sin(now * 6 + u.phase)) * 0.15, u.oz);
        sp.material.opacity = (u.tip ? 0.9 : 0.75) * (0.7 + 0.3 * flick) * (0.5 + 0.5 * intensity);
      }
      for (let i = 0; i < embers.length; i++) {
        const em = embers[i];
        const u = em.userData;
        const t = (now * 0.8 + u.phase) % 1; // 0→1 loop
        em.position.set(u.ox + Math.sin(now * 4 + u.phase * 6) * 0.25, u.oy + t * radius * 2.2, u.oz);
        em.material.opacity = (1 - t) * 0.9 * intensity;
      }
      for (let i = 0; i < smokes.length; i++) {
        const sm = smokes[i];
        const u = sm.userData;
        const t = (now * 0.35 + u.phase) % 1; // slow rise loop
        sm.position.set(u.ox + Math.sin(now * 1.5 + u.phase * 6) * 0.4, u.oy + radius * 0.6 + t * radius * 3.0, u.oz);
        sm.scale.setScalar(radius * (0.8 + t * 1.4));
        sm.material.opacity = Math.sin(t * Math.PI) * 0.5 * (0.4 + 0.6 * intensity);
      }
      const flicker = 0.75 + 0.2 * Math.sin(now * 17.0) + 0.08 * Math.sin(now * 31.0 + radius);
      light.intensity = Math.max(0, radius * 0.55 * (0.35 + intensity * 1.25) * flicker);
      light.distance = Math.max(8, radius * (4.0 + intensity * 3.0));
    },

    /** Free this effect's per-instance sprite materials and detach children. */
    dispose() {
      for (const sp of group.children) sp.material?.dispose();
      group.clear();
      group.parent?.remove(group);
    },
  };
}

/** Free the shared fire/smoke textures (engine teardown). */
export function disposeFireEffects() {
  _flameTex?.dispose();
  _smokeTex?.dispose();
  _flameTex = _smokeTex = null;
}
