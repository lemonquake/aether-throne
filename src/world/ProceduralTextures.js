/**
 * ProceduralTextures — every surface texture in the game, generated at runtime
 * on a 2D canvas and cached module-wide. No image assets ship (public/assets is
 * empty; loaders fail soft), so ground, stone, roofing, bark, water and metal
 * are all drawn here with a seeded PRNG so the look is identical on every boot.
 *
 * Perf: each texture is built once on first request and cached forever (they
 * are shared GPU resources — a whole match uses ≈8 textures total). Textures
 * are marked `sRGBColorSpace` (color maps) and given repeat wrapping so callers
 * can tile them across large geometry.
 *
 * Determinism: no `Math.random()`. All noise/scatter derives from mulberry32.
 */
import * as THREE from 'three';

/** Fixed seed so texture generation is reproducible across boots. */
const TEX_SEED = 0x9e3779b9;

/** Cache of built textures keyed by a string id (built lazily on first use). */
const _cache = new Map();

/**
 * mulberry32 — tiny seedable PRNG returning floats in [0,1). Deterministic.
 * @param {number} seed
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

/**
 * Allocate a square offscreen canvas + 2D context.
 * @param {number} size - Side length in pixels (power of two preferred).
 * @returns {{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D}}
 */
function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  return { canvas, ctx };
}

/**
 * Wrap a finished canvas in a repeat-wrapped, mip-mapped THREE texture.
 * @param {HTMLCanvasElement} canvas
 * @param {boolean} [color=true] - true → sRGB color map; false → linear (data).
 * @returns {THREE.CanvasTexture}
 */
function finish(canvas, color = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Lerp two `[r,g,b]` byte triples. */
function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * Fill a canvas with smooth multi-octave value noise, mapping the noise field
 * through a palette-ramp callback → a natural, non-repetitive organic surface.
 * The noise is periodic (wraps at the canvas edge) so the texture tiles cleanly.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} size
 * @param {(n:number, x:number, y:number, rng:()=>number)=>[number,number,number]} ramp
 * @param {number} seed
 */
function paintNoise(ctx, size, ramp, seed) {
  const rng = mulberry32(seed);
  // Build a small periodic lattice of random values per octave.
  const octaves = [
    { period: 4, amp: 0.5 },
    { period: 8, amp: 0.28 },
    { period: 16, amp: 0.15 },
    { period: 32, amp: 0.07 },
  ];
  const lattices = octaves.map((o) => {
    const grid = new Float32Array(o.period * o.period);
    for (let i = 0; i < grid.length; i++) grid[i] = rng();
    return grid;
  });

  const smooth = (t) => t * t * (3 - 2 * t);
  const sample = (grid, period, u, v) => {
    const x = u * period;
    const y = v * period;
    const x0 = Math.floor(x) % period;
    const y0 = Math.floor(y) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const fx = smooth(x - Math.floor(x));
    const fy = smooth(y - Math.floor(y));
    const a = grid[y0 * period + x0];
    const b = grid[y0 * period + x1];
    const c = grid[y1 * period + x0];
    const d = grid[y1 * period + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };

  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let n = 0;
      for (let o = 0; o < octaves.length; o++) {
        n += sample(lattices[o], octaves[o].period, u, v) * octaves[o].amp;
      }
      const [r, g, b] = ramp(n, x, y, rng);
      const idx = (y * size + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Sprinkle short directional strokes across the canvas — used to add grass
 * blades, stone speckle, or scratches on top of a noise base.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} size
 * @param {number} count
 * @param {number} seed
 * @param {(rng:()=>number)=>{len:number, color:string, width:number}} style
 */
function scatterStrokes(ctx, size, count, seed, style) {
  const rng = mulberry32(seed);
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const { len, color, width } = style(rng);
    const ang = rng() * Math.PI * 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
}

// ──────────────────────────────────────────────────────────────────
const loader = new THREE.TextureLoader();

const DELETED_URLS = [
  '/assets/textures/chitin.png',
  '/assets/textures/flowers_void_rift.png',
  '/assets/textures/water_void_rift.png',
  '/assets/textures/stone.png',
  '/assets/textures/bark.png',
  '/assets/textures/snow_grass.png',
  '/assets/textures/ice.png'
];

function loadOrGenerateTexture(key, url, generator, color = true) {
  if (_cache.has(key)) return _cache.get(key);

  const configure = (tex) => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  };

  // A null/missing url means "this surface is procedural-only" — generate it
  // directly and skip the network round-trip (no 404 warning, no async pop-in).
  if (!url || DELETED_URLS.includes(url)) {
    const canvas = generator();
    const tex = new THREE.CanvasTexture(canvas);
    configure(tex);
    _cache.set(key, tex);
    return tex;
  }

  const canvas = generator();
  const tex = new THREE.CanvasTexture(canvas);
  configure(tex);
  _cache.set(key, tex);

  loader.load(
    url,
    (loadedTex) => {
      const img = loadedTex.image;
      if (img) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          tex.needsUpdate = true;
        }
      }
    },
    undefined,
    (err) => {
      console.warn(`[ProceduralTextures] Failed to load ${url}, keeping procedural fallback.`, err);
    }
  );
  return tex;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public texture builders (each cached by id)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The main terrain texture: lush grass with worn dirt patches and scattered
 * blades / pebbles. Tiles seamlessly. Meant to be repeated across the ground.
 * @param {string} [mapId='crystal_basin']
 * @returns {THREE.CanvasTexture}
 */
export function getGrassTexture(mapId = 'crystal_basin') {
  const key = `grass_${mapId}`;
  const url = mapId === 'tundra' ? '/assets/textures/snow_grass.png' : `/assets/textures/grass_${mapId}.png`;
  return loadOrGenerateTexture(key, url, () => {
    const size = 512;
    const { canvas, ctx } = makeCanvas(size);

    let grassLo = [58, 92, 47];
    let grassHi = [104, 148, 70];
    let dirt = [86, 68, 44];
    let dirtLo = [64, 50, 33];
    let bladeColor = (rng) => `rgba(${120 + (rng() * 40) | 0}, ${150 + (rng() * 50) | 0}, ${70 + (rng() * 30) | 0}, 0.5)`;
    let pebbleColor = (rng) => `rgba(${70 + (rng() * 30) | 0}, ${58 + (rng() * 20) | 0}, ${40 + (rng() * 15) | 0}, 0.6)`;

    if (mapId === 'tundra') {
      grassLo = [220, 225, 230];
      grassHi = [240, 245, 250];
      dirt = [110, 100, 90];
      dirtLo = [80, 70, 60];
      bladeColor = (rng) => `rgba(255, 255, 255, 0.7)`;
      pebbleColor = (rng) => `rgba(180, 190, 200, 0.5)`;
    } else if (mapId === 'emerald_grove') {
      grassLo = [30, 85, 30];
      grassHi = [70, 150, 70];
      dirt = [70, 50, 30];
      dirtLo = [50, 35, 20];
      bladeColor = (rng) => `rgba(${50 + (rng() * 30) | 0}, ${170 + (rng() * 60) | 0}, ${60 + (rng() * 30) | 0}, 0.65)`;
      pebbleColor = (rng) => `rgba(${90 + (rng() * 20) | 0}, ${75 + (rng() * 15) | 0}, ${50 + (rng() * 10) | 0}, 0.5)`;
    } else if (mapId === 'obsidian_wastes') {
      grassLo = [35, 30, 30];
      grassHi = [55, 45, 40];
      dirt = [110, 40, 20];
      dirtLo = [70, 20, 10];
      bladeColor = (rng) => `rgba(${50 + (rng() * 30) | 0}, ${45 + (rng() * 20) | 0}, ${45 + (rng() * 20) | 0}, 0.4)`;
      pebbleColor = (rng) => `rgba(${220 + (rng() * 35) | 0}, ${100 + (rng() * 40) | 0}, ${30 + (rng() * 20) | 0}, 0.7)`;
    } else if (mapId === 'void_rift') {
      grassLo = [40, 25, 65];
      grassHi = [75, 45, 120];
      dirt = [30, 20, 50];
      dirtLo = [18, 10, 35];
      bladeColor = (rng) => `rgba(${110 + (rng() * 50) | 0}, ${60 + (rng() * 40) | 0}, ${210 + (rng() * 45) | 0}, 0.55)`;
      pebbleColor = (rng) => `rgba(${130 + (rng() * 30) | 0}, ${90 + (rng() * 20) | 0}, ${190 + (rng() * 40) | 0}, 0.6)`;
    }

    paintNoise(ctx, size, (n) => {
      if (n < 0.42) {
        return mix(dirtLo, dirt, Math.min(1, n / 0.42));
      }
      const g = (n - 0.42) / 0.58;
      if (g < 0.25) return mix(dirt, grassLo, g / 0.25);
      return mix(grassLo, grassHi, (g - 0.25) / 0.75);
    }, TEX_SEED);

    scatterStrokes(ctx, size, 2600, TEX_SEED + 11, (rng) => ({
      len: 2 + rng() * 4,
      width: 1,
      color: bladeColor(rng),
    }));

    scatterStrokes(ctx, size, 500, TEX_SEED + 21, (rng) => ({
      len: 1,
      width: 1 + rng() * 2,
      color: pebbleColor(rng),
    }));

    return canvas;
  });
}

/**
 * Cut-stone masonry (grey blocks + mortar) for building walls. Grayscale-ish so
 * a material's `color` tints it to any faction palette. Tiles seamlessly.
 * @returns {THREE.CanvasTexture}
 */
export function getStoneTexture() {
  const key = 'stone';
  return loadOrGenerateTexture(key, '/assets/textures/stone.png', () => {
    const size = 256;
    const { canvas, ctx } = makeCanvas(size);

    // Base mottled grey.
    paintNoise(ctx, size, (n) => {
      const v = 150 + n * 90;
      return [v, v * 0.99, v * 0.96];
    }, TEX_SEED + 100);

    // Mortar grid of ashlar blocks with staggered courses.
    const rows = 5;
    const rowH = size / rows;
    const rng = mulberry32(TEX_SEED + 101);
    ctx.strokeStyle = 'rgba(40,38,34,0.55)';
    ctx.lineWidth = 3;
    for (let r = 0; r <= rows; r++) {
      const y = r * rowH;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      const offset = (r % 2) * (size / 8);
      const cols = 4;
      for (let c = 0; c <= cols; c++) {
        const x = (c * size) / cols + offset;
        ctx.beginPath();
        ctx.moveTo(x % size, y);
        ctx.lineTo(x % size, y + rowH);
        ctx.stroke();
      }
    }
    // Block-face shading speckle + a few cracks.
    scatterStrokes(ctx, size, 900, TEX_SEED + 102, (r) => ({
      len: 1 + r() * 2,
      width: 1,
      color: `rgba(${(r() * 60) | 0},${(r() * 60) | 0},${(r() * 55) | 0},0.15)`,
    }));

    return canvas;
  });
}

/**
 * Roof shingle/tile texture — rows of overlapping tiles. Grayscale-tinted so
 * per-faction roof colors come from the material.
 * @returns {THREE.CanvasTexture}
 */
export function getRoofTexture() {
  const key = 'roof';
  return loadOrGenerateTexture(key, '/assets/textures/roof.png', () => {
    const size = 256;
    const { canvas, ctx } = makeCanvas(size);
    ctx.fillStyle = '#8a8f9a';
    ctx.fillRect(0, 0, size, size);

    const rows = 8;
    const rowH = size / rows;
    const rng = mulberry32(TEX_SEED + 200);
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      const cols = 8;
      const offset = (r % 2) * (rowH * 0.5);
      for (let c = -1; c <= cols; c++) {
        const x = (c * size) / cols + offset;
        const shade = 150 + rng() * 70;
        ctx.fillStyle = `rgb(${shade | 0},${(shade * 0.98) | 0},${(shade * 1.02) | 0})`;
        ctx.beginPath();
        // Scalloped tile: a rounded rectangle-ish tab.
        ctx.moveTo(x, y);
        ctx.lineTo(x + size / cols, y);
        ctx.lineTo(x + size / cols, y + rowH * 0.7);
        ctx.arc(x + size / cols / 2, y + rowH * 0.7, size / cols / 2, 0, Math.PI);
        ctx.lineTo(x, y);
        ctx.fill();
      }
      // Row shadow line.
      ctx.fillStyle = 'rgba(20,20,26,0.35)';
      ctx.fillRect(0, y + rowH * 0.92, size, rowH * 0.08);
    }
    return canvas;
  });
}

/**
 * Tree bark — vertical fibrous grooves. Meant to wrap a trunk cylinder.
 * @returns {THREE.CanvasTexture}
 */
export function getBarkTexture() {
  const key = 'bark';
  return loadOrGenerateTexture(key, '/assets/textures/bark.png', () => {
    const size = 128;
    const { canvas, ctx } = makeCanvas(size);
    const lo = [60, 42, 28];
    const hi = [104, 78, 50];
    // Stretch noise vertically for a grain look.
    paintNoise(ctx, size, (n, x, y) => mix(lo, hi, n), TEX_SEED + 300);
    // Vertical grooves.
    scatterStrokes(ctx, size, 260, TEX_SEED + 301, (r) => ({
      len: 20 + r() * 60,
      width: 1 + r() * 2,
      color: `rgba(${30 + (r() * 20) | 0},${20 + (r() * 15) | 0},${12 + (r() * 10) | 0},0.4)`,
    }));
    return canvas;
  });
}

/**
 * Rippling water surface — soft caustic-like blotches. Animated
 * subtly by the caller offsetting `.offset` over time if desired.
 * @param {string} [mapId='crystal_basin']
 * @returns {THREE.CanvasTexture}
 */
export function getWaterTexture(mapId = 'verdant_reach') {
  let kind = 'water';
  const mid = String(mapId).toLowerCase();
  if (mid.includes('lava') || mid.includes('solar') || mid.includes('obsidian') || mid.includes('volcanic')) {
    kind = 'lava';
  } else if (mid.includes('void') || mid.includes('matrix') || mid.includes('rift') || mid.includes('space') || mid.includes('aether')) {
    kind = 'void';
  } else if (mid.includes('ice') || mid.includes('frost') || mid.includes('snow')) {
    kind = 'ice';
  }
  const key = `water_${kind}`;
  return loadOrGenerateTexture(key, null, () => {
    const size = 256;
    const { canvas, ctx } = makeCanvas(size);

    let deep = [22, 58, 78];
    let shallow = [60, 128, 150];
    let glintColor = (r) => `rgba(190,235,245,${0.12 + r() * 0.2})`;

    if (kind === 'ice') {
      deep = [150, 185, 210];
      shallow = [214, 238, 250];
      glintColor = (r) => `rgba(255,255,255,${0.3 + r() * 0.4})`;
    } else if (kind === 'lava') {
      deep = [150, 25, 5];
      shallow = [245, 120, 20];
      glintColor = (r) => `rgba(255,225,120,${0.2 + r() * 0.35})`;
    } else if (kind === 'void') {
      deep = [18, 44, 62];
      shallow = [72, 168, 176];
      glintColor = (r) => `rgba(150,255,235,${0.18 + r() * 0.3})`;
    }

    paintNoise(ctx, size, (n) => mix(deep, shallow, Math.pow(n, 1.6)), TEX_SEED + 400);

    // Bright caustic glints / fire sparks.
    scatterStrokes(ctx, size, 420, TEX_SEED + 401, (r) => ({
      len: 3 + r() * 8,
      width: 1,
      color: glintColor(r),
    }));

    return canvas;
  });
}

/**
 * A radial "banner" / heraldry emblem stamp used on some building fronts — a
 * bright disc that a material can additively glow. Cheap flourish.
 * @returns {THREE.CanvasTexture}
 */
export function getEmblemTexture() {
  const key = 'emblem';
  return loadOrGenerateTexture(key, '/assets/textures/emblem.png', () => {
    const size = 128;
    const { canvas, ctx } = makeCanvas(size);
    ctx.clearRect(0, 0, size, size);
    const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,244,200,0.95)');
    g.addColorStop(0.5, 'rgba(230,190,90,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return canvas;
  });
}

/**
 * Organic chitinous plate texture with glowing indigo veins for Artifice Horde / Void Stalkers.
 */
export function getChitinTexture() {
  const key = 'chitin';
  return loadOrGenerateTexture(key, '/assets/textures/chitin.png', () => {
    const size = 256;
    const { canvas, ctx } = makeCanvas(size);
    
    // Base: dark violet-indigo value noise
    paintNoise(ctx, size, (n) => {
      const v = 40 + n * 50;
      return [v * 0.75, v * 0.5, v * 0.95];
    }, TEX_SEED + 500);

    // Overlapping shield-like scale plates
    const rows = 8;
    const rowH = size / rows;
    const rng = mulberry32(TEX_SEED + 501);
    ctx.strokeStyle = 'rgba(12, 6, 20, 0.7)';
    ctx.lineWidth = 2;
    
    for (let r = 0; r <= rows + 1; r++) {
      const y = r * rowH;
      const cols = 6;
      const offset = (r % 2) * (size / cols * 0.5);
      for (let c = -1; c <= cols + 1; c++) {
        const x = (c * size) / cols + offset;
        ctx.fillStyle = `rgba(${110 + rng() * 50}, ${75 + rng() * 35}, ${140 + rng() * 45}, 0.15)`;
        ctx.beginPath();
        ctx.moveTo(x, y - rowH * 0.2);
        ctx.lineTo(x + size / cols * 0.5, y + rowH * 0.4);
        ctx.lineTo(x + size / cols, y - rowH * 0.2);
        ctx.lineTo(x + size / cols, y - rowH * 0.8);
        ctx.lineTo(x, y - rowH * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // Soft glowing violet details
    scatterStrokes(ctx, size, 500, TEX_SEED + 502, (r) => ({
      len: 5 + r() * 10,
      width: 1,
      color: `rgba(160, 90, 240, ${0.12 + r() * 0.16})`,
    }));

    return canvas;
  });
}

/**
 * Volcanic basalt rock texture with glowing magma cracks for Terra Born / Core Elementals.
 */
export function getBasaltTexture() {
  const key = 'basalt';
  return loadOrGenerateTexture(key, '/assets/textures/basalt.png', () => {
    const size = 256;
    const { canvas, ctx } = makeCanvas(size);
    
    // Base: rough grey-charcoal noise
    paintNoise(ctx, size, (n) => {
      const v = 45 + n * 40;
      return [v * 1.02, v, v * 0.98];
    }, TEX_SEED + 600);

    // Volcanic crack veins
    const rng = mulberry32(TEX_SEED + 601);
    ctx.lineCap = 'round';
    for (let i = 0; i < 40; i++) {
      let x = rng() * size;
      let y = rng() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        const dx = (rng() - 0.5) * 24;
        const dy = (rng() - 0.5) * 24;
        x = (x + dx + size) % size;
        y = (y + dy + size) % size;
        ctx.lineTo(x, y);
      }
      // Magma outer glow
      ctx.strokeStyle = `rgba(255, ${65 + rng() * 85}, 0, ${0.45 + rng() * 0.35})`;
      ctx.lineWidth = 1.5 + rng() * 2;
      ctx.stroke();
      
      // Magma inner hot core
      ctx.strokeStyle = 'rgba(255, 215, 90, 0.8)';
      ctx.lineWidth = 0.5 + rng() * 0.8;
      ctx.stroke();
    }

    // Dark soot speckles
    scatterStrokes(ctx, size, 600, TEX_SEED + 602, (r) => ({
      len: 1 + r() * 3,
      width: 1 + r() * 2,
      color: `rgba(${(r() * 15) | 0}, ${(r() * 15) | 0}, ${(r() * 15) | 0}, 0.28)`,
    }));

    return canvas;
  });
}

/**
 * Fleshy, muscle-like organic texture with vein matrices for Chaos Deep swarm.
 */
export function getFleshTexture() {
  const key = 'flesh';
  return loadOrGenerateTexture(key, '/assets/textures/flesh.png', () => {
    const size = 256;
    const { canvas, ctx } = makeCanvas(size);

    // Base flesh: crimson, magenta, and purple hues
    paintNoise(ctx, size, (n) => {
      const r = 75 + n * 70;
      const g = 25 + n * 25;
      const b = 65 + n * 60;
      return [r, g, b];
    }, TEX_SEED + 700);

    // Organic vein network
    const rng = mulberry32(TEX_SEED + 701);
    for (let i = 0; i < 35; i++) {
      let x = rng() * size;
      let y = rng() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        const dx = (rng() - 0.5) * 28;
        const dy = (rng() - 0.5) * 28;
        x = (x + dx + size) % size;
        y = (y + dy + size) % size;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${165 + rng() * 70}, 15, 55, ${0.45 + rng() * 0.3})`;
      ctx.lineWidth = 1.2 + rng() * 1.8;
      ctx.stroke();
    }

    // Spotted skin blobs
    for (let i = 0; i < 70; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 3 + rng() * 5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${80 + rng() * 45}, 20, ${100 + rng() * 40}, 0.55)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    return canvas;
  });
}

/**
 * Generate a leafy, textured canopy with individual leaves scattered over noise.
 * @param {string} mapId
 * @returns {THREE.CanvasTexture}
 */
export function getFoliageTexture(mapId = 'crystal_basin') {
  const key = `foliage_${mapId}`;
  return loadOrGenerateTexture(key, null, () => {
    const size = 256;
    const { canvas, ctx } = makeCanvas(size);

    const leafLo = [34, 76, 26];
    const leafHi = [84, 150, 60];
    const strokeCol = (r) => `rgba(${(40 + r() * 40) | 0}, ${(108 + r() * 50) | 0}, ${(34 + r() * 30) | 0}, ${0.4 + r() * 0.18})`;

    paintNoise(ctx, size, (n) => mix(leafLo, leafHi, n), TEX_SEED + 800);

    // Draw little leafy curves/strokes
    const rng = mulberry32(TEX_SEED + 801);
    ctx.lineCap = 'round';
    for (let i = 0; i < 2000; i++) {
      const cx = rng() * size;
      const cy = rng() * size;
      const radius = 2 + rng() * 5;
      const startAngle = rng() * Math.PI * 2;
      const endAngle = startAngle + 0.5 + rng() * 1.5;
      ctx.strokeStyle = strokeCol(rng);
      ctx.lineWidth = 1.2 + rng() * 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.stroke();
    }

    return canvas;
  });
}

/**
 * Generate a detailed rock/boulder texture with cracks and grain.
 * @param {string} mapId
 * @returns {THREE.CanvasTexture}
 */
export function getDetailedRockTexture(mapId = 'crystal_basin') {
  const key = `detailed_rock_${mapId}`;
  return loadOrGenerateTexture(key, null, () => {
    const size = 256;
    const { canvas, ctx } = makeCanvas(size);

    let rockLo = [90, 85, 80];
    let rockHi = [140, 135, 130];
    let crackColor = 'rgba(50, 48, 45, 0.6)';
    let speckleColor = (r) => `rgba(${50 + r() * 40}, ${50 + r() * 40}, ${50 + r() * 40}, 0.25)`;

    const mid = String(mapId).toLowerCase();
    if (mid.includes('emerald') || mid.includes('green') || mid.includes('verdant')) {
      rockLo = [80, 78, 68];
      rockHi = [125, 120, 105];
    } else if (mid.includes('obsidian') || mid.includes('solar') || mid.includes('lava') || mid.includes('volcanic')) {
      // Return basalt texture colors
      rockLo = [35, 32, 32];
      rockHi = [70, 64, 64];
      crackColor = 'rgba(255, 65, 0, 0.7)';
      speckleColor = (r) => `rgba(255, 215, 90, ${0.15 + r() * 0.2})`;
    } else if (mid.includes('void') || mid.includes('matrix') || mid.includes('rift') || mid.includes('space') || mid.includes('aether')) {
      rockLo = [55, 45, 70];
      rockHi = [95, 80, 120];
      crackColor = 'rgba(160, 90, 240, 0.7)';
      speckleColor = (r) => `rgba(${200 + r() * 55}, 120, 255, 0.3)`;
    }

    paintNoise(ctx, size, (n) => mix(rockLo, rockHi, n), TEX_SEED + 900);

    // Scattered cracks
    const rng = mulberry32(TEX_SEED + 901);
    ctx.lineCap = 'round';
    ctx.strokeStyle = crackColor;
    for (let i = 0; i < 20; i++) {
      let x = rng() * size;
      let y = rng() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineWidth = 1 + rng() * 1.5;
      for (let j = 0; j < 3; j++) {
        x = (x + (rng() - 0.5) * 30 + size) % size;
        y = (y + (rng() - 0.5) * 30 + size) % size;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Detail speckles
    scatterStrokes(ctx, size, 800, TEX_SEED + 902, (r) => ({
      len: 1 + r() * 3,
      width: 1 + r() * 1.5,
      color: speckleColor(r),
    }));

    return canvas;
  });
}

/**
 * Generate a procedural normal map for water waves.
 * @param {string} mapId
 * @returns {THREE.CanvasTexture}
 */
export function getWaterNormalTexture(mapId = 'crystal_basin') {
  const key = `water_normal_${mapId}`;
  return loadOrGenerateTexture(key, null, () => {
    const size = 256;
    const { canvas, ctx } = makeCanvas(size);
    
    // First paint a heights noise canvas
    const heightsCanvas = document.createElement('canvas');
    heightsCanvas.width = size;
    heightsCanvas.height = size;
    const hCtx = heightsCanvas.getContext('2d');
    
    // Paint noise heights
    paintNoise(hCtx, size, (n) => {
      const val = Math.round(n * 255);
      return [val, val, val];
    }, TEX_SEED + 1000);
    
    const hData = hCtx.getImageData(0, 0, size, size).data;
    const normImg = ctx.createImageData(size, size);
    const normData = normImg.data;
    
    const getHeight = (x, y) => {
      const tx = (x + size) % size;
      const ty = (y + size) % size;
      return hData[(ty * size + tx) * 4] / 255.0;
    };
    
    // Sobel filter to compute normals from heights
    const strength = 6.0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Sample surrounding heights
        const hL = getHeight(x - 1, y);
        const hR = getHeight(x + 1, y);
        const hT = getHeight(x, y - 1);
        const hB = getHeight(x, y + 1);
        
        // Calculate tangent vectors
        const dx = (hR - hL) * strength;
        const dy = (hB - hT) * strength;
        
        // Normalize normal vector
        const len = Math.sqrt(dx * dx + dy * dy + 1.0);
        const nx = -dx / len;
        const ny = -dy / len;
        const nz = 1.0 / len;
        
        const idx = (y * size + x) * 4;
        // Map normal [-1, 1] to RGB [0, 255]
        normData[idx] = Math.round((nx * 0.5 + 0.5) * 255);
        normData[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        normData[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        normData[idx + 3] = 255;
      }
    }
    
    ctx.putImageData(normImg, 0, 0);
    return canvas;
  }, false); // Normal maps should not be sRGB
}

/**
 * Dirt / mud texture per tileset.
 * @param {string} [mapId='crystal_basin']
 * @returns {THREE.CanvasTexture}
 */
export function getDirtTexture(mapId = 'crystal_basin') {
  const key = `dirt_${mapId}`;
  return loadOrGenerateTexture(key, `/assets/textures/dirt_${mapId}.png`, () => {
    const size = 256;
    const { canvas, ctx } = makeCanvas(size);
    let dirtLo = [64, 50, 33];
    let dirtHi = [96, 78, 54];
    let speckleColor = (r) => `rgba(${40 + r() * 20}, ${32 + r() * 15}, ${20 + r() * 10}, 0.3)`;

    if (mapId === 'crystal_basin') {
      dirtLo = [70, 75, 85];
      dirtHi = [110, 115, 125];
      speckleColor = (r) => `rgba(180, 200, 220, ${0.1 + r() * 0.15})`;
    } else if (mapId === 'emerald_grove') {
      dirtLo = [50, 35, 20];
      dirtHi = [85, 65, 45];
      speckleColor = (r) => `rgba(40, 28, 15, 0.45)`;
    } else if (mapId === 'obsidian_wastes') {
      dirtLo = [50, 15, 5];
      dirtHi = [80, 25, 10];
      speckleColor = (r) => `rgba(255, 65, 0, ${0.15 + r() * 0.2})`;
    } else if (mapId === 'void_rift') {
      dirtLo = [18, 10, 35];
      dirtHi = [35, 20, 65];
      speckleColor = (r) => `rgba(0, 220, 255, ${0.2 + r() * 0.25})`;
    }

    paintNoise(ctx, size, (n) => mix(dirtLo, dirtHi, n), TEX_SEED + 1100);

    scatterStrokes(ctx, size, 400, TEX_SEED + 1101, (r) => ({
      len: 1 + r() * 3,
      width: 1 + r() * 1.5,
      color: speckleColor(r),
    }));

    return canvas;
  });
}

/**
 * Gravel / rock texture per tileset.
 * @param {string} [mapId='crystal_basin']
 * @returns {THREE.CanvasTexture}
 */
export function getGravelTexture(mapId = 'crystal_basin') {
  const key = `gravel_${mapId}`;
  return loadOrGenerateTexture(key, `/assets/textures/gravel_${mapId}.png`, () => {
    const size = 256;
    const { canvas, ctx } = makeCanvas(size);
    let rockLo = [90, 85, 80];
    let rockHi = [130, 125, 120];
    let crackColor = 'rgba(50, 48, 45, 0.5)';
    let pebbleColor = (r) => `rgba(${160 + r() * 40}, ${150 + r() * 40}, ${140 + r() * 40}, 0.6)`;

    if (mapId === 'crystal_basin') {
      rockLo = [100, 115, 130];
      rockHi = [150, 165, 180];
      crackColor = 'rgba(70, 90, 110, 0.4)';
      pebbleColor = (r) => `rgba(200, 220, 245, ${0.4 + r() * 0.3})`;
    } else if (mapId === 'emerald_grove') {
      rockLo = [75, 75, 68];
      rockHi = [115, 110, 100];
      crackColor = 'rgba(40, 42, 38, 0.6)';
      pebbleColor = (r) => `rgba(${120 + r() * 30}, ${110 + r() * 25}, ${90 + r() * 20}, 0.5)`;
    } else if (mapId === 'obsidian_wastes') {
      rockLo = [30, 28, 28];
      rockHi = [60, 54, 54];
      crackColor = 'rgba(255, 65, 0, 0.6)';
      pebbleColor = (r) => `rgba(${200 + r() * 55}, 100, 30, 0.7)`;
    } else if (mapId === 'void_rift') {
      rockLo = [50, 40, 65];
      rockHi = [85, 70, 110];
      crackColor = 'rgba(150, 80, 230, 0.6)';
      pebbleColor = (r) => `rgba(${180 + r() * 50}, 100, 255, 0.6)`;
    }

    paintNoise(ctx, size, (n) => mix(rockLo, rockHi, n), TEX_SEED + 1200);

    // Crack lines
    const rng = mulberry32(TEX_SEED + 1201);
    ctx.lineCap = 'round';
    ctx.strokeStyle = crackColor;
    for (let i = 0; i < 30; i++) {
      let x = rng() * size;
      let y = rng() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineWidth = 1 + rng() * 1.5;
      for (let j = 0; j < 3; j++) {
        x = (x + (rng() - 0.5) * 20 + size) % size;
        y = (y + (rng() - 0.5) * 20 + size) % size;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Pebbles
    scatterStrokes(ctx, size, 600, TEX_SEED + 1202, (r) => ({
      len: 1 + r() * 3,
      width: 1 + r() * 2,
      color: pebbleColor(r),
    }));

    return canvas;
  });
}

/**
 * Forest floor leaf litter texture per tileset.
 * @param {string} [mapId='crystal_basin']
 * @returns {THREE.CanvasTexture}
 */
export function getLeafLitterTexture(mapId = 'crystal_basin') {
  const key = `leaves_${mapId}`;
  return loadOrGenerateTexture(key, `/assets/textures/leaves_${mapId}.png`, () => {
    const size = 256;
    const { canvas, ctx } = makeCanvas(size);
    let leafLo = [60, 45, 30];
    let leafHi = [90, 75, 45];
    let leafColor = (r) => `rgba(${100 + r() * 50}, ${75 + r() * 35}, ${40 + r() * 20}, 0.5)`;

    if (mapId === 'crystal_basin') {
      leafLo = [80, 90, 100];
      leafHi = [110, 125, 140];
      leafColor = (r) => `rgba(210, 230, 250, ${0.3 + r() * 0.3})`;
    } else if (mapId === 'emerald_grove') {
      leafLo = [45, 35, 20];
      leafHi = [75, 55, 35];
      leafColor = (r) => `rgba(${120 + r() * 60}, ${80 + r() * 50}, ${30 + r() * 25}, 0.55)`;
    } else if (mapId === 'obsidian_wastes') {
      leafLo = [25, 20, 20];
      leafHi = [40, 32, 32];
      leafColor = (r) => `rgba(${60 + r() * 40}, ${30 + r() * 20}, ${20 + r() * 15}, 0.35)`;
    } else if (mapId === 'void_rift') {
      leafLo = [30, 15, 45];
      leafHi = [55, 30, 85];
      leafColor = (r) => `rgba(${130 + r() * 50}, ${50 + r() * 30}, ${195 + r() * 40}, 0.45)`;
    }

    paintNoise(ctx, size, (n) => mix(leafLo, leafHi, n), TEX_SEED + 1300);

    // Leaf shapes
    const rng = mulberry32(TEX_SEED + 1301);
    for (let i = 0; i < 400; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const w = 3 + rng() * 6;
      const h = 2 + rng() * 4;
      const ang = rng() * Math.PI * 2;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = leafColor(rng);
      ctx.beginPath();
      ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    return canvas;
  });
}

/**
 * Transparent wildflower clump texture for meadow detail decals.
 * @param {string} [mapId='crystal_basin']
 * @returns {THREE.Texture}
 */
export function getFlowerTexture(mapId = 'crystal_basin') {
  const key = `flowers_${mapId}`;
  return loadOrGenerateTexture(key, null, () => {
    const size = 256;
    const { canvas, ctx } = makeCanvas(size);
    ctx.clearRect(0, 0, size, size);

    const palettes = {
      crystal_basin: [
        [255, 236, 139],
        [255, 173, 204],
        [180, 220, 255],
        [245, 255, 245],
      ],
      emerald_grove: [
        [176, 230, 128],
        [226, 245, 172],
        [135, 210, 152],
      ],
      obsidian_wastes: [
        [130, 90, 72],
        [166, 116, 88],
      ],
      void_rift: [
        [155, 120, 190],
        [125, 150, 190],
      ],
    };
    const colors = palettes[mapId] ?? palettes.crystal_basin;
    const rng = mulberry32(TEX_SEED + 1600 + hashCode(mapId));

    for (let i = 0; i < 130; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const radius = 1.4 + rng() * 3.4;
      const [r, g, b] = colors[(rng() * colors.length) | 0];
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.55 + rng() * 0.35})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      if (rng() > 0.45) {
        ctx.strokeStyle = `rgba(${Math.max(30, r - 60)}, ${Math.max(60, g - 55)}, ${Math.max(30, b - 70)}, 0.35)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + radius);
        ctx.lineTo(x + (rng() - 0.5) * 5, y + radius + 5 + rng() * 9);
        ctx.stroke();
      }
    }

    for (let i = 0; i < 340; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const len = 4 + rng() * 11;
      const a = -Math.PI * 0.5 + (rng() - 0.5) * 1.4;
      ctx.strokeStyle = `rgba(${45 + rng() * 45}, ${105 + rng() * 70}, ${45 + rng() * 40}, ${0.18 + rng() * 0.22})`;
      ctx.lineWidth = 1 + rng() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }

    return canvas;
  });
}

/**
 * Field-row texture used for worked grass, tilled paths, and map-one fields.
 * @param {string} [mapId='crystal_basin']
 * @returns {THREE.Texture}
 */
export function getFieldRowsTexture(mapId = 'crystal_basin') {
  const key = `field_rows_${mapId}`;
  return loadOrGenerateTexture(key, null, () => {
    const size = 256;
    const { canvas, ctx } = makeCanvas(size);
    const rng = mulberry32(TEX_SEED + 1700 + hashCode(mapId));

    let soilLo = [75, 57, 34];
    let soilHi = [116, 91, 52];
    let crop = [126, 164, 79];
    if (mapId === 'emerald_grove') {
      soilLo = [48, 42, 25];
      soilHi = [85, 70, 40];
      crop = [84, 140, 72];
    } else if (mapId === 'obsidian_wastes') {
      soilLo = [47, 30, 25];
      soilHi = [91, 58, 43];
      crop = [90, 75, 61];
    } else if (mapId === 'void_rift') {
      soilLo = [36, 25, 54];
      soilHi = [70, 48, 95];
      crop = [83, 79, 124];
    }

    paintNoise(ctx, size, (n) => mix(soilLo, soilHi, n), TEX_SEED + 1701 + hashCode(mapId));
    const rowCount = 9;
    for (let r = 0; r < rowCount; r++) {
      const y = (r + 0.5) * (size / rowCount);
      ctx.strokeStyle = `rgba(${crop[0]}, ${crop[1]}, ${crop[2]}, 0.55)`;
      ctx.lineWidth = 4.5 + rng() * 2.5;
      ctx.beginPath();
      for (let x = -8; x <= size + 8; x += 8) {
        const yy = y + Math.sin(x * 0.08 + r) * 1.8 + (rng() - 0.5) * 1.2;
        if (x === -8) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }

    scatterStrokes(ctx, size, 700, TEX_SEED + 1702 + hashCode(mapId), (r) => ({
      len: 1 + r() * 4,
      width: 0.8 + r() * 1.2,
      color: `rgba(${35 + r() * 40}, ${28 + r() * 32}, ${18 + r() * 22}, 0.16)`,
    }));

    return canvas;
  });
}

/**
 * Vertical cliff wall texture per tileset.
 * @param {string} [mapId='crystal_basin']
 * @returns {THREE.CanvasTexture}
 */
export function getCliffTexture(mapId = 'crystal_basin') {
  const key = `cliff_${mapId}`;
  return loadOrGenerateTexture(key, `/assets/textures/cliff_${mapId}.png`, () => {
    const size = 256;
    const { canvas, ctx } = makeCanvas(size);
    let wallLo = [110, 105, 100];
    let wallHi = [150, 145, 140];
    let crackColor = 'rgba(40,38,36,0.6)';
    let mortarColor = 'rgba(30,30,28,0.7)';
    let highlightColor = (r) => `rgba(${200 + r() * 55}, ${190 + r() * 50}, ${180 + r() * 45}, 0.15)`;

    if (mapId === 'crystal_basin') {
      wallLo = [120, 150, 180];
      wallHi = [170, 210, 240];
      crackColor = 'rgba(40, 80, 130, 0.5)';
      mortarColor = 'rgba(30, 60, 100, 0.6)';
      highlightColor = (r) => `rgba(240, 250, 255, ${0.3 + r() * 0.25})`;
    } else if (mapId === 'emerald_grove') {
      wallLo = [85, 88, 80];
      wallHi = [125, 130, 115];
      crackColor = 'rgba(30, 32, 28, 0.65)';
      mortarColor = 'rgba(25, 28, 22, 0.75)';
      highlightColor = (r) => `rgba(160, 210, 150, ${0.15 + r() * 0.2})`;
    } else if (mapId === 'obsidian_wastes') {
      wallLo = [30, 26, 26];
      wallHi = [60, 50, 50];
      crackColor = 'rgba(255, 65, 0, 0.85)';
      mortarColor = 'rgba(20, 15, 15, 0.9)';
      highlightColor = (r) => `rgba(255, 180, 50, ${0.2 + r() * 0.3})`;
    } else if (mapId === 'void_rift') {
      wallLo = [45, 30, 70];
      wallHi = [80, 55, 115];
      crackColor = 'rgba(160, 90, 240, 0.8)';
      mortarColor = 'rgba(20, 10, 35, 0.85)';
      highlightColor = (r) => `rgba(220, 150, 255, ${0.15 + r() * 0.25})`;
    }

    paintNoise(ctx, size, (n) => mix(wallLo, wallHi, n), TEX_SEED + 1400);

    const rows = 6;
    const rowH = size / rows;
    const rng = mulberry32(TEX_SEED + 1401);
    ctx.strokeStyle = mortarColor;
    ctx.lineWidth = 4;
    for (let r = 0; r <= rows; r++) {
      const y = r * rowH;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      const offset = (r % 2) * (size / 8);
      const cols = 4;
      for (let c = 0; c <= cols; c++) {
        const x = (c * size) / cols + offset;
        ctx.beginPath();
        ctx.moveTo(x % size, y);
        ctx.lineTo(x % size, y + rowH);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = crackColor;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 20; i++) {
      let x = rng() * size;
      let y = rng() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 3; j++) {
        x = (x + (rng() - 0.5) * 25 + size) % size;
        y = (y + (rng() - 0.5) * 25 + size) % size;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    scatterStrokes(ctx, size, 500, TEX_SEED + 1402, (r) => ({
      len: 2 + r() * 5,
      width: 1 + r() * 1.5,
      color: highlightColor(r),
    }));

    return canvas;
  });
}

/**
 * Large landmark/doodad surface texture per tileset. These are used by the
 * epic map set pieces: throne crystal plinths, ancient grove roots, basalt
 * vents, and void monoliths. Generated once and reused like every terrain
 * surface texture.
 * @param {string} [mapId='crystal_basin']
 * @returns {THREE.CanvasTexture}
 */
export function getLandmarkTexture(mapId = 'crystal_basin') {
  const key = `landmark_${mapId}`;
  return loadOrGenerateTexture(key, null, () => {
    const size = 256;
    const { canvas, ctx } = makeCanvas(size);

    let lo = [96, 130, 150];
    let hi = [190, 235, 245];
    let veinColor = (r) => `rgba(220, 250, 255, ${0.2 + r() * 0.35})`;
    let scratchColor = (r) => `rgba(40, 80, 110, ${0.16 + r() * 0.18})`;

    if (mapId === 'emerald_grove') {
      lo = [62, 40, 24];
      hi = [118, 82, 48];
      veinColor = (r) => `rgba(80, ${145 + r() * 80}, 70, ${0.14 + r() * 0.2})`;
      scratchColor = (r) => `rgba(28, 18, 10, ${0.25 + r() * 0.25})`;
    } else if (mapId === 'obsidian_wastes') {
      lo = [24, 21, 21];
      hi = [74, 58, 52];
      veinColor = (r) => `rgba(255, ${80 + r() * 120}, 18, ${0.25 + r() * 0.35})`;
      scratchColor = (r) => `rgba(8, 6, 6, ${0.35 + r() * 0.35})`;
    } else if (mapId === 'void_rift') {
      lo = [20, 10, 44];
      hi = [86, 48, 142];
      veinColor = (r) => `rgba(${140 + r() * 80}, ${95 + r() * 80}, 255, ${0.22 + r() * 0.35})`;
      scratchColor = (r) => `rgba(5, 2, 18, ${0.28 + r() * 0.32})`;
    }

    paintNoise(ctx, size, (n) => mix(lo, hi, Math.pow(n, 1.08)), TEX_SEED + 1500 + hashCode(mapId));

    const rng = mulberry32(TEX_SEED + 1501 + hashCode(mapId));
    ctx.lineCap = 'round';
    for (let i = 0; i < 34; i++) {
      let x = rng() * size;
      let y = rng() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x = (x + (rng() - 0.5) * 38 + size) % size;
        y = (y + (rng() - 0.5) * 38 + size) % size;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = veinColor(rng);
      ctx.lineWidth = 1 + rng() * 2.5;
      ctx.stroke();
    }

    scatterStrokes(ctx, size, 900, TEX_SEED + 1502 + hashCode(mapId), (r) => ({
      len: 2 + r() * 8,
      width: 1 + r() * 1.8,
      color: scratchColor(r),
    }));

    return canvas;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Biome terrain surfaces — the tileable ground materials the splat shader mixes.
//
// Every surface is built from *periodic* FBM fields (they wrap at the canvas
// edge, so the texture repeats seamlessly across the whole map) layered with
// palette ramps, macro patches, ambient occlusion in the low spots, and a
// type-specific detail pass (grass blades / stone plates / sand ripples …).
// The result is far richer than a single noise ramp, and combined with the
// height-blend + macro-variation in the terrain shader it reads as one
// continuous, non-repeating landscape.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A periodic multi-octave value-noise field, normalized to roughly [0,1].
 * Periodic because each octave's lattice period is an integer that divides the
 * canvas — so sampling wraps cleanly and the finished texture tiles.
 * @returns {Float32Array} size*size field.
 */
function noiseField(size, seed, basePeriod = 4, octaves = 5, gain = 0.5) {
  const rng = mulberry32(seed >>> 0);
  const grids = [];
  const periods = [];
  let amp = 1;
  let ampSum = 0;
  const amps = [];
  for (let o = 0; o < octaves; o++) {
    const period = basePeriod * (1 << o);
    const grid = new Float32Array(period * period);
    for (let i = 0; i < grid.length; i++) grid[i] = rng();
    grids.push(grid);
    periods.push(period);
    amps.push(amp);
    ampSum += amp;
    amp *= gain;
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  const sample = (grid, period, u, v) => {
    const x = u * period;
    const y = v * period;
    const x0 = Math.floor(x) % period;
    const y0 = Math.floor(y) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const fx = smooth(x - Math.floor(x));
    const fy = smooth(y - Math.floor(y));
    const a = grid[y0 * period + x0];
    const b = grid[y0 * period + x1];
    const c = grid[y1 * period + x0];
    const d = grid[y1 * period + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let n = 0;
      for (let o = 0; o < octaves; o++) n += sample(grids[o], periods[o], u, v) * amps[o];
      out[y * size + x] = n / ampSum;
    }
  }
  return out;
}

/** Byte-clamp helper for the surface painters. */
function b255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

/**
 * Draw a wrapping polyline crack/vein network (used by rock, cracked-earth and
 * ember surfaces). Segments that run off an edge re-enter the opposite side, so
 * the crack field stays seamless.
 */
function crackNetwork(ctx, size, seed, count, steps, jitter, style) {
  const rng = mulberry32(seed >>> 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < count; i++) {
    let x = rng() * size;
    let y = rng() * size;
    const s = style(rng);
    // Draw the same walk into the four wrap-neighbours so it tiles.
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      let cx = x + ox;
      let cy = y + oy;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const r2 = mulberry32((seed ^ (i * 2654435761)) >>> 0);
      for (let j = 0; j < steps; j++) {
        cx += (r2() - 0.5) * jitter;
        cy += (r2() - 0.5) * jitter;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
    x = (x + (rng() - 0.5) * jitter + size) % size;
    y = (y + (rng() - 0.5) * jitter + size) % size;
  }
}

/**
 * Terrain surface texture builder. `spec = { type, palette }`. Cached by `id`.
 * Generated directly (no asset fetch) — these are the new biome ground layers.
 * @param {string} id - cache key / layer id.
 * @param {{type:string, palette:object, seed?:number}} spec
 * @returns {THREE.CanvasTexture}
 */
export function getTerrainSurface(id, spec) {
  if (_cache.has(id)) return _cache.get(id);
  const type = spec?.type ?? 'grass';
  const pal = spec?.palette ?? {};
  const seed = (TEX_SEED + 2000 + hashCode(id)) >>> 0;
  const size = (type === 'grass' || type === 'meadow' || type === 'snow' || type === 'ash') ? 512 : 384;
  const { canvas, ctx } = makeCanvas(size);

  switch (type) {
    case 'grass':
    case 'meadow': paintGrassSurface(ctx, size, pal, seed, type === 'meadow'); break;
    case 'soil': paintSoilSurface(ctx, size, pal, seed); break;
    case 'rock': paintRockSurface(ctx, size, pal, seed); break;
    case 'sand': paintSandSurface(ctx, size, pal, seed); break;
    case 'snow': paintSnowSurface(ctx, size, pal, seed); break;
    case 'ash': paintSoilSurface(ctx, size, pal, seed, true); break;
    case 'ember': paintEmberSurface(ctx, size, pal, seed); break;
    case 'cracked': paintCrackedSurface(ctx, size, pal, seed); break;
    case 'glow': paintGrassSurface(ctx, size, pal, seed, true, true); break;
    default: paintGrassSurface(ctx, size, pal, seed, false); break;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 16;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  _cache.set(id, tex);
  return tex;
}

/** Blit a per-pixel field-driven base color into the canvas. */
function paintFieldBase(ctx, size, colorFn) {
  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let i = 0; i < size * size; i++) {
    const [r, g, b] = colorFn(i);
    const o = i * 4;
    data[o] = b255(r); data[o + 1] = b255(g); data[o + 2] = b255(b); data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function paintGrassSurface(ctx, size, p, seed, meadow, glow) {
  const lo = p.lo ?? [58, 92, 45];
  const hi = p.hi ?? [116, 158, 82];
  const dry = p.dry ?? mix(lo, [110, 96, 60], 0.5);
  const base = noiseField(size, seed, 4, 5, 0.5);
  const patch = noiseField(size, seed + 91, 3, 3, 0.5);   // large dry/lush patches
  const ao = noiseField(size, seed + 47, 24, 3, 0.55);    // fine ambient occlusion
  paintFieldBase(ctx, size, (i) => {
    const n = base[i];
    // low field → soil/dry showing through, mid→lo, high→hi green
    let c;
    if (n < 0.32) c = mix(dry, lo, n / 0.32);
    else c = mix(lo, hi, (n - 0.32) / 0.68);
    // large patches lean toward dry earth (worn areas) or lush
    const pt = patch[i];
    if (pt < 0.4) c = mix(c, dry, (0.4 - pt) * 0.5);
    // ambient occlusion darkens crevices
    const shade = 0.82 + ao[i] * 0.26;
    return [c[0] * shade, c[1] * shade, c[2] * shade];
  });
  // Grass blades.
  const blade = p.blade ?? [150, 194, 96];
  const tip = p.tip ?? [190, 214, 120];
  scatterStrokes(ctx, size, meadow ? 3400 : 2800, seed + 5, (r) => ({
    len: 2 + r() * 5,
    width: 1,
    color: `rgba(${b255(blade[0] + r() * 30)},${b255(blade[1] + r() * 30)},${b255(blade[2] + r() * 24)},${0.35 + r() * 0.3})`,
  }));
  scatterStrokes(ctx, size, meadow ? 900 : 600, seed + 6, (r) => ({
    len: 1 + r() * 3,
    width: 1,
    color: `rgba(${b255(tip[0] + r() * 20)},${b255(tip[1] + r() * 20)},${b255(tip[2] + r() * 20)},${0.3 + r() * 0.3})`,
  }));
  if (meadow || glow) {
    // Speckled flowers / glowing motes.
    const rng = mulberry32((seed + 7) >>> 0);
    for (let i = 0; i < (glow ? 140 : 90); i++) {
      const x = rng() * size, y = rng() * size, rad = 1.4 + rng() * 3;
      const c = glow ? tip : (rng() > 0.5 ? tip : [235, 228, 150]);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${glow ? 0.85 : 0.9})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function paintSoilSurface(ctx, size, p, seed, ashen) {
  const lo = p.lo ?? [78, 60, 40];
  const hi = p.hi ?? [120, 92, 58];
  const speck = p.speck ?? mix(lo, [40, 28, 18], 0.5);
  const base = noiseField(size, seed, 5, 5, 0.52);
  const clump = noiseField(size, seed + 33, 8, 3, 0.5);
  paintFieldBase(ctx, size, (i) => {
    const c = mix(lo, hi, base[i]);
    const cl = 0.86 + clump[i] * 0.24;
    return [c[0] * cl, c[1] * cl, c[2] * cl];
  });
  // Pebbles / grit.
  scatterStrokes(ctx, size, 900, seed + 4, (r) => ({
    len: 1 + r() * 2.5,
    width: 1 + r() * 1.6,
    color: `rgba(${b255(speck[0] + r() * 30)},${b255(speck[1] + r() * 26)},${b255(speck[2] + r() * 22)},${0.3 + r() * 0.3})`,
  }));
  if (ashen) {
    // Faint drifting ash streaks + rare ember fleck.
    scatterStrokes(ctx, size, 500, seed + 8, (r) => ({
      len: 3 + r() * 8, width: 1,
      color: `rgba(${140 + (r() * 40) | 0},${132 + (r() * 30) | 0},${126 + (r() * 26) | 0},${0.08 + r() * 0.12})`,
    }));
  }
}

function paintRockSurface(ctx, size, p, seed) {
  const lo = p.lo ?? [96, 102, 92];
  const hi = p.hi ?? [148, 152, 138];
  const moss = p.moss;
  const base = noiseField(size, seed, 4, 6, 0.55);
  const plate = noiseField(size, seed + 61, 6, 2, 0.5);
  const ao = noiseField(size, seed + 12, 20, 3, 0.5);
  paintFieldBase(ctx, size, (i) => {
    let c = mix(lo, hi, base[i]);
    // Stone plates: quantize the plate field into facets with slight tonal steps.
    const facet = 0.9 + Math.floor(plate[i] * 4) / 4 * 0.22;
    c = [c[0] * facet, c[1] * facet, c[2] * facet];
    const shade = 0.8 + ao[i] * 0.3;
    c = [c[0] * shade, c[1] * shade, c[2] * shade];
    if (moss) {
      // Moss settles where the base field is low (damp crevices).
      const m = Math.max(0, 0.4 - base[i]) * 1.6;
      c = mix(c, moss, m * 0.6);
    }
    return c;
  });
  // Seam cracks between plates.
  const crack = p.crack ?? [52, 58, 50];
  const glow = crack[0] > 180; // ember-lit rock
  crackNetwork(ctx, size, seed + 71, 22, 5, 26, (r) => ({
    color: `rgba(${crack[0]},${crack[1]},${crack[2]},${glow ? 0.55 + r() * 0.35 : 0.4 + r() * 0.28})`,
    width: 1 + r() * 1.8,
  }));
  scatterStrokes(ctx, size, 700, seed + 9, (r) => ({
    len: 1 + r() * 3, width: 1 + r() * 1.4,
    color: `rgba(${b255(hi[0] + 30 + r() * 30)},${b255(hi[1] + 30 + r() * 30)},${b255(hi[2] + 26 + r() * 30)},${0.12 + r() * 0.16})`,
  }));
}

function paintSandSurface(ctx, size, p, seed) {
  const lo = p.lo ?? [188, 176, 138];
  const hi = p.hi ?? [214, 204, 170];
  const speck = p.speck ?? mix(lo, [150, 138, 104], 0.6);
  const base = noiseField(size, seed, 6, 4, 0.5);
  const dune = noiseField(size, seed + 21, 3, 2, 0.5);
  paintFieldBase(ctx, size, (i) => {
    const x = i % size, y = (i / size) | 0;
    // Wind ripples: gentle periodic banding perturbed by noise so it tiles.
    const ripple = 0.5 + 0.5 * Math.sin((x + dune[i] * 40) * (Math.PI * 8 / size) + y * 0.02);
    const n = base[i] * 0.7 + ripple * 0.3;
    return mix(lo, hi, n);
  });
  scatterStrokes(ctx, size, 500, seed + 3, (r) => ({
    len: 1 + r() * 2, width: 1 + r() * 1.2,
    color: `rgba(${b255(speck[0] + r() * 24)},${b255(speck[1] + r() * 22)},${b255(speck[2] + r() * 20)},${0.18 + r() * 0.2})`,
  }));
}

function paintSnowSurface(ctx, size, p, seed) {
  const lo = p.lo ?? [206, 216, 222];
  const hi = p.hi ?? [244, 250, 254];
  const base = noiseField(size, seed, 4, 5, 0.5);
  const drift = noiseField(size, seed + 31, 3, 2, 0.5);
  paintFieldBase(ctx, size, (i) => {
    const n = base[i] * 0.6 + drift[i] * 0.4;
    const c = mix(lo, hi, n);
    // Cool blue shadow in the low drifts.
    const shadow = Math.max(0, 0.4 - base[i]) * 1.5;
    return [c[0] - shadow * 26, c[1] - shadow * 14, c[2] - shadow * 4];
  });
  // Sparkle.
  const tip = p.tip ?? [255, 255, 255];
  const rng = mulberry32((seed + 2) >>> 0);
  for (let i = 0; i < 260; i++) {
    const x = rng() * size, y = rng() * size, rad = 0.6 + rng() * 1.4;
    ctx.fillStyle = `rgba(${tip[0]},${tip[1]},${tip[2]},${0.4 + rng() * 0.5})`;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
}

function paintEmberSurface(ctx, size, p, seed) {
  const lo = p.lo ?? [128, 48, 20];
  const hi = p.hi ?? [214, 96, 30];
  const crack = p.crack ?? [255, 190, 90];
  const base = noiseField(size, seed, 5, 5, 0.55);
  paintFieldBase(ctx, size, (i) => {
    // Cooled crust is dark; molten seams pulse bright — driven by the field.
    const n = base[i];
    if (n < 0.5) return mix([26, 16, 14], lo, n / 0.5);
    return mix(lo, hi, (n - 0.5) / 0.5);
  });
  // Glowing magma veins.
  crackNetwork(ctx, size, seed + 51, 26, 5, 24, (r) => ({
    color: `rgba(255,${100 + (r() * 90) | 0},${20 + (r() * 30) | 0},${0.5 + r() * 0.4})`,
    width: 1.4 + r() * 2,
  }));
  crackNetwork(ctx, size, seed + 52, 26, 5, 24, (r) => ({
    color: `rgba(${crack[0]},${crack[1]},${crack[2]},${0.6 + r() * 0.3})`,
    width: 0.6 + r() * 0.8,
  }));
  scatterStrokes(ctx, size, 500, seed + 9, (r) => ({
    len: 1 + r() * 2, width: 1 + r() * 1.6,
    color: `rgba(${(r() * 18) | 0},${(r() * 12) | 0},${(r() * 10) | 0},0.3)`,
  }));
}

function paintCrackedSurface(ctx, size, p, seed) {
  const lo = p.lo ?? [150, 120, 80];
  const hi = p.hi ?? [186, 152, 104];
  const crack = p.crack ?? [96, 70, 42];
  const base = noiseField(size, seed, 5, 4, 0.5);
  const plate = noiseField(size, seed + 41, 7, 2, 0.5);
  paintFieldBase(ctx, size, (i) => {
    const c = mix(lo, hi, base[i]);
    const facet = 0.9 + plate[i] * 0.2;
    return [c[0] * facet, c[1] * facet, c[2] * facet];
  });
  // Dry mud plate cracks.
  crackNetwork(ctx, size, seed + 81, 30, 6, 22, (r) => ({
    color: `rgba(${crack[0]},${crack[1]},${crack[2]},${0.45 + r() * 0.3})`,
    width: 1 + r() * 1.6,
  }));
  const speck = p.speck ?? mix(lo, crack, 0.5);
  scatterStrokes(ctx, size, 500, seed + 3, (r) => ({
    len: 1 + r() * 2, width: 1 + r() * 1.2,
    color: `rgba(${speck[0]},${speck[1]},${speck[2]},${0.14 + r() * 0.18})`,
  }));
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return h >>> 0;
}

export function getGrassHDTexture() {
  return loadOrGenerateTexture('grass_hd', '/assets/textures/grass_hd.png', () => {
    const size = 512;
    const { canvas, ctx } = makeCanvas(size);
    let grassLo = [58, 92, 47];
    let grassHi = [104, 148, 70];
    let dirt = [86, 68, 44];
    let dirtLo = [64, 50, 33];
    paintNoise(ctx, size, (n) => {
      if (n < 0.42) return mix(dirtLo, dirt, Math.min(1, n / 0.42));
      const g = (n - 0.42) / 0.58;
      if (g < 0.25) return mix(dirt, grassLo, g / 0.25);
      return mix(grassLo, grassHi, (g - 0.25) / 0.75);
    }, TEX_SEED);
    return canvas;
  });
}

export function getDirtHDTexture() {
  return loadOrGenerateTexture('dirt_hd', '/assets/textures/dirt_hd.png', () => {
    const size = 512;
    const { canvas, ctx } = makeCanvas(size);
    let lo = [78, 60, 40];
    let hi = [120, 92, 58];
    paintNoise(ctx, size, (n) => mix(lo, hi, n), TEX_SEED);
    return canvas;
  });
}

/**
 * Dispose and clear every cached texture. Called on engine teardown so the GL
 * textures are freed (they are otherwise held for the process lifetime).
 */
export function disposeTextures() {
  for (const tex of _cache.values()) tex.dispose();
  _cache.clear();
}
