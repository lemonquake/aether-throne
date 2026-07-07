/**
 * ModelFactory — builds the actual 3D models for every unit and building from
 * Three.js primitives (no GLTF assets ship). Each of the three factions has a
 * distinct visual language, and every archetype within a faction has a unique
 * silhouette:
 *
 *   AETHER_KNIGHTS  — armored humans. Steel plate, gold trim, team-colored
 *                     cloaks/tabards. Castle-keep architecture with blue roofs.
 *   VOID_STALKERS   — lean dark beasts. Chitin carapace, violet glow, membrane
 *                     wings/hoods tinted by team color. Jagged bone spires.
 *   CORE_ELEMENTALS — living rock golems. Basalt bodies veined with molten lava,
 *                     a team-colored core gem. Volcanic forge architecture.
 *
 * Team color is injected on cloth/crest/core parts (cached per owner color);
 * faction-fixed materials (steel, chitin, basalt, lava…) are shared globally.
 * Geometries are shared module caches keyed by dimensions, so a 200-entity
 * match still uses only a few dozen GPU geometries/materials.
 *
 * Every builder returns parts assembled into a THREE.Group with **feet/base at
 * y = 0**, facing **+Z** (Unit._syncMovement yaws the group to face travel).
 */
import * as THREE from 'three';
import { ARCHETYPE } from '../config/UnitTypes.js';
import { getStoneTexture, getRoofTexture, getEmblemTexture, getChitinTexture, getBasaltTexture, getFleshTexture, getBarkTexture, getFoliageTexture } from './ProceduralTextures.js';
import { buildArtificeUnit, buildArtificeBuilding } from './ArtificeHordeModels.js';
import { buildTerraUnit, buildTerraBuilding } from './TerraBornModels.js';
import { buildChaosUnit, buildChaosBuilding } from './ChaosDeepModels.js';

// ─────────────────────────────────────────────────────────────────────────────
// Shared geometry cache
// ─────────────────────────────────────────────────────────────────────────────
const _geoCache = new Map();

export function boxGeo(w, h, d) {
  const k = `box${w.toFixed(2)},${h.toFixed(2)},${d.toFixed(2)}`;
  let g = _geoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); _geoCache.set(k, g); }
  return g;
}
export function cylGeo(rt, rb, h, seg = 12) {
  const k = `cyl${rt.toFixed(2)},${rb.toFixed(2)},${h.toFixed(2)},${seg}`;
  let g = _geoCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, seg); _geoCache.set(k, g); }
  return g;
}
export function sphGeo(r, seg = 12) {
  const k = `sph${r.toFixed(2)},${seg}`;
  let g = _geoCache.get(k);
  if (!g) { g = new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)); _geoCache.set(k, g); }
  return g;
}
export function coneGeo(r, h, seg = 8) {
  const k = `cone${r.toFixed(2)},${h.toFixed(2)},${seg}`;
  let g = _geoCache.get(k);
  if (!g) { g = new THREE.ConeGeometry(r, h, seg); _geoCache.set(k, g); }
  return g;
}
export function octaGeo(r) {
  const k = `octa${r.toFixed(2)}`;
  let g = _geoCache.get(k);
  if (!g) { g = new THREE.OctahedronGeometry(r, 0); _geoCache.set(k, g); }
  return g;
}
export function icoGeo(r, d = 0) {
  const k = `ico${r.toFixed(2)},${d}`;
  let g = _geoCache.get(k);
  if (!g) { g = new THREE.IcosahedronGeometry(r, d); _geoCache.set(k, g); }
  return g;
}
export function torusGeo(r, tube, seg = 10) {
  const k = `tor${r.toFixed(2)},${tube.toFixed(2)},${seg}`;
  let g = _geoCache.get(k);
  if (!g) { g = new THREE.TorusGeometry(r, tube, 8, seg); _geoCache.set(k, g); }
  return g;
}

// ─────────────────────────────────────────────────────────────────────────────
// Material caches — faction-fixed (shared) + team-tinted (per owner color)
// ─────────────────────────────────────────────────────────────────────────────
const _fixedMat = new Map();
const _teamMat = new Map();
const _treeMatCache = new Map();
const _assetTex = new Map();
const _textureLoader = new THREE.TextureLoader();

function assetTexture(file, repeatX = 1, repeatY = 1) {
  const key = `${file}:${repeatX}:${repeatY}`;
  let tex = _assetTex.get(key);
  if (tex) return tex;
  tex = _textureLoader.load(`/assets/textures/${file}`);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  _assetTex.set(key, tex);
  return tex;
}

export function getTreeMaterial(theme, variant, type) {
  const key = `${theme}:${variant}:${type}`;
  let mat = _treeMatCache.get(key);
  if (mat) return mat;

  const barkTex = getBarkTexture();
  barkTex.wrapS = THREE.RepeatWrapping;
  barkTex.wrapT = THREE.RepeatWrapping;
  barkTex.repeat.set(1, 2);
  
  const foliageTex = getFoliageTexture(theme);
  foliageTex.wrapS = THREE.RepeatWrapping;
  foliageTex.wrapT = THREE.RepeatWrapping;
  foliageTex.repeat.set(2, 2);
  
  const barkColor = 0x8a6b46;
  const foliageColor = 0xffffff;

  if (type === 'bark') {
    let color = barkColor;
    let roughness = 0.9;
    let metalness = 0.05;
    if (variant === 2) {
      color = 0xe5e7eb;
      roughness = 0.85;
    } else if (variant === 4) {
      color = 0x4a3728;
      roughness = 0.95;
      metalness = 0.02;
    }
    mat = new THREE.MeshStandardMaterial({
      map: barkTex,
      color,
      roughness,
      metalness
    });
  } else {
    let color = foliageColor;
    let roughness = 0.8;
    let metalness = 0.02;
    if (variant === 4) {
      color = 0x8c6d53;
      roughness = 0.9;
      metalness = 0.0;
    }
    mat = new THREE.MeshStandardMaterial({
      map: foliageTex,
      color,
      roughness,
      metalness,
      flatShading: true
    });
  }
  _treeMatCache.set(key, mat);
  return mat;
}

export function buildTreeModel(theme, variant) {
  const g = new THREE.Group();
  const parts = getTreeParts(variant);
  for (const p of parts) {
    const mat = getTreeMaterial(theme, variant, p.materialType);
    const mesh = new THREE.Mesh(p.geometry, mat);
    mesh.position.fromArray(p.pos);
    mesh.rotation.fromArray(p.rot);
    mesh.scale.fromArray(p.scale ?? [1, 1, 1]);
    g.add(mesh);
  }
  return g;
}

export function getTreeParts(variant) {
  switch (variant) {
    case 0:
      return [
        { geometry: cylGeo(0.2, 0.35, 2.2, 8), materialType: 'bark', pos: [0, 1.1, 0], rot: [0, 0, 0], scale: [1, 1, 1] },
        { geometry: cylGeo(0.12, 0.16, 1.0, 6), materialType: 'bark', pos: [0.3, 1.8, 0.3], rot: [0.4, 0, -0.4], scale: [1, 1, 1] },
        { geometry: cylGeo(0.12, 0.16, 1.0, 6), materialType: 'bark', pos: [-0.3, 1.8, -0.3], rot: [-0.4, 0, 0.4], scale: [1, 1, 1] },
        { geometry: icoGeo(1.2, 1), materialType: 'leaves', pos: [0, 2.8, 0], rot: [0, 0, 0], scale: [1, 1, 1] },
        { geometry: icoGeo(0.9, 1), materialType: 'leaves', pos: [0.6, 2.3, 0.6], rot: [0, 0, 0], scale: [1, 1, 1] },
        { geometry: icoGeo(0.9, 1), materialType: 'leaves', pos: [-0.6, 2.3, -0.6], rot: [0, 0, 0], scale: [1, 1, 1] }
      ];
    case 1:
      return [
        { geometry: cylGeo(0.15, 0.28, 2.6, 8), materialType: 'bark', pos: [0, 1.3, 0], rot: [0, 0, 0], scale: [1, 1, 1] },
        { geometry: coneGeo(1.4, 1.8, 8), materialType: 'leaves', pos: [0, 1.8, 0], rot: [0, 0, 0], scale: [1, 1, 1] },
        { geometry: coneGeo(1.1, 1.5, 8), materialType: 'leaves', pos: [0, 2.7, 0], rot: [0, 0, 0], scale: [1, 1, 1] },
        { geometry: coneGeo(0.8, 1.2, 8), materialType: 'leaves', pos: [0, 3.5, 0], rot: [0, 0, 0], scale: [1, 1, 1] }
      ];
    case 2:
      return [
        { geometry: cylGeo(0.12, 0.2, 3.2, 8), materialType: 'bark', pos: [0, 1.6, 0], rot: [0, 0, 0], scale: [1, 1, 1] },
        { geometry: icoGeo(1.0, 1), materialType: 'leaves', pos: [0, 3.2, 0], rot: [0, 0, 0], scale: [0.8, 1.5, 0.8] }
      ];
    case 3:
      return [
        { geometry: cylGeo(0.18, 0.32, 2.4, 8), materialType: 'bark', pos: [0.2, 1.1, 0], rot: [0, 0, -0.15], scale: [1, 1, 1] },
        { geometry: icoGeo(1.3, 1), materialType: 'leaves', pos: [0, 2.5, 0], rot: [0, 0, 0], scale: [1, 1, 1] },
        { geometry: icoGeo(0.8, 1), materialType: 'leaves', pos: [0.7, 1.9, 0.3], rot: [0, 0, 0], scale: [1, 1.3, 1] },
        { geometry: icoGeo(0.8, 1), materialType: 'leaves', pos: [-0.7, 1.9, -0.3], rot: [0, 0, 0], scale: [1, 1.3, 1] }
      ];
    case 4:
    default:
      return [
        { geometry: cylGeo(0.22, 0.38, 1.6, 8), materialType: 'bark', pos: [0, 0.8, 0], rot: [0, 0, 0], scale: [1, 1, 1] },
        { geometry: cylGeo(0.12, 0.18, 1.2, 6), materialType: 'bark', pos: [0.4, 1.6, 0.2], rot: [0.5, 0, -0.7], scale: [1, 1, 1] },
        { geometry: cylGeo(0.08, 0.12, 1.0, 6), materialType: 'bark', pos: [0.8, 2.1, 0.4], rot: [0.2, 0, -0.3], scale: [1, 1, 1] },
        { geometry: cylGeo(0.12, 0.18, 1.2, 6), materialType: 'bark', pos: [-0.4, 1.6, -0.2], rot: [-0.5, 0, 0.7], scale: [1, 1, 1] },
        { geometry: cylGeo(0.08, 0.12, 1.0, 6), materialType: 'bark', pos: [-0.8, 2.1, -0.4], rot: [-0.2, 0, 0.3], scale: [1, 1, 1] },
        { geometry: icoGeo(0.3, 0), materialType: 'leaves', pos: [0.9, 2.5, 0.5], rot: [0, 0, 0], scale: [1, 1, 1] },
        { geometry: icoGeo(0.25, 0), materialType: 'leaves', pos: [-0.9, 2.5, -0.5], rot: [0, 0, 0], scale: [1, 1, 1] }
      ];
  }
}

/** A shared, faction-fixed material built once from a spec object. */
function fixed(name, spec) {
  let m = _fixedMat.get(name);
  if (!m) { m = new THREE.MeshStandardMaterial(spec); _fixedMat.set(name, m); }
  return m;
}

/**
 * A team-tinted material. `variant` shifts the owner color (bright cloth, dark
 * leather, glowing core) while keeping it recognizably the player's color.
 * @param {string} colorHex
 * @param {'cloth'|'dark'|'bright'|'core'|'metal'} variant
 */
export function team(colorHex, variant) {
  const key = `${colorHex}:${variant}`;
  let m = _teamMat.get(key);
  if (m) return m;
  const c = new THREE.Color(colorHex);
  switch (variant) {
    case 'dark':
      m = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.45), roughness: 0.8, metalness: 0.1 });
      break;
    case 'bright':
      m = new THREE.MeshStandardMaterial({ color: c.clone().lerp(new THREE.Color(0xffffff), 0.25), roughness: 0.55, metalness: 0.15 });
      break;
    case 'core':
      m = new THREE.MeshStandardMaterial({ color: c, emissive: c.clone().multiplyScalar(0.8), emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.3 });
      break;
    case 'metal':
      m = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.7), roughness: 0.35, metalness: 0.8 });
      break;
    case 'cloth':
    default:
      m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.05 });
      break;
  }
  _teamMat.set(key, m);
  return m;
}

function teamBanner(colorHex) {
  const key = `${colorHex}:bioBanner`;
  let m = _teamMat.get(key);
  if (m) return m;
  const c = new THREE.Color(colorHex);
  m = new THREE.MeshStandardMaterial({
    color: c.clone().lerp(new THREE.Color(0xffffff), 0.15),
    map: assetTexture('bio_human_banner.png', 1, 1),
    roughness: 0.82,
    metalness: 0.02,
  });
  _teamMat.set(key, m);
  return m;
}

// Faction-fixed palettes ------------------------------------------------------
export const MAT = {
  // Aether Knights
  steel: () => fixed('steel', { color: 0x9fb2c8, roughness: 0.4, metalness: 0.85 }),
  steelDark: () => fixed('steelDark', { color: 0x5a6a80, roughness: 0.5, metalness: 0.7 }),
  gold: () => fixed('gold', { color: 0xe8c24a, emissive: 0x5a4410, emissiveIntensity: 0.3, roughness: 0.35, metalness: 0.9 }),
  skin: () => fixed('skin', { color: 0xd9a37a, roughness: 0.7, metalness: 0 }),
  wood: () => fixed('wood', { color: 0x6b4a2c, roughness: 0.85, metalness: 0 }),
  robe: () => fixed('robe', { color: 0xdfe3ea, roughness: 0.75, metalness: 0 }),
  bioStone: () => fixed('bioStoneTex', {
    color: 0xffffff,
    map: assetTexture('bio_human_stone.png', 2, 2),
    roughness: 0.88,
    metalness: 0.04,
  }),
  bioStoneDark: () => fixed('bioStoneDarkTex', {
    color: 0xb9bec8,
    map: assetTexture('bio_human_stone.png', 2, 2),
    roughness: 0.94,
    metalness: 0.04,
  }),
  bioRoof: () => fixed('bioRoofSlateTex', {
    color: 0xffffff,
    map: assetTexture('bio_human_roof_slate.png', 2, 2),
    roughness: 0.72,
    metalness: 0.08,
  }),
  bioWood: () => fixed('bioTimberTex', {
    color: 0xffffff,
    map: assetTexture('bio_human_timber.png', 1.5, 2),
    roughness: 0.86,
    metalness: 0.02,
  }),
  bioTrim: () => fixed('bioTrimTex', {
    color: 0xffffff,
    map: assetTexture('bio_human_trim.png', 1, 1),
    roughness: 0.44,
    metalness: 0.82,
  }),
  // Void Stalkers
  chitin: () => {
    let m = _fixedMat.get('chitinTex');
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: getChitinTexture(), roughness: 0.55, metalness: 0.25 });
      _fixedMat.set('chitinTex', m);
    }
    return m;
  },
  chitinLite: () => {
    let m = _fixedMat.get('chitinLiteTex');
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: 0xcccccc, map: getChitinTexture(), roughness: 0.5, metalness: 0.3 });
      _fixedMat.set('chitinLiteTex', m);
    }
    return m;
  },
  voidGlow: () => fixed('voidGlow', { color: 0xb04ce8, emissive: 0x9a2ce0, emissiveIntensity: 1.1, roughness: 0.3, metalness: 0.2 }),
  bone: () => fixed('bone', { color: 0xcfc6b0, roughness: 0.7, metalness: 0.05 }),
  // Core Elementals
  basalt: () => {
    let m = _fixedMat.get('basaltTex');
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: getBasaltTexture(), roughness: 0.95, metalness: 0.05 });
      _fixedMat.set('basaltTex', m);
    }
    return m;
  },
  basaltLite: () => {
    let m = _fixedMat.get('basaltLiteTex');
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: 0xcccccc, map: getBasaltTexture(), roughness: 0.9, metalness: 0.05 });
      _fixedMat.set('basaltLiteTex', m);
    }
    return m;
  },
  lava: () => fixed('lava', { color: 0xff7a1e, emissive: 0xff4a00, emissiveIntensity: 1.3, roughness: 0.4, metalness: 0 }),
  emberDark: () => fixed('emberDark', { color: 0x2c2420, roughness: 1.0, metalness: 0, flatShading: true }),
  // Chaos Deep
  organic: () => {
    let m = _fixedMat.get('organicTex');
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: getFleshTexture(), roughness: 0.6, metalness: 0.1 });
      _fixedMat.set('organicTex', m);
    }
    return m;
  },
  acidGlow: () => fixed('acidGlow', { color: 0x39ff14, emissive: 0x24b300, emissiveIntensity: 1.0, roughness: 0.2, metalness: 0.2 }),
  carapace: () => fixed('carapace', { color: 0x2b1e15, roughness: 0.7, metalness: 0.1, flatShading: true }),
  // Shared architectural
  stone: () => {
    let m = _fixedMat.get('stoneTex');
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: 0xbfc4cc, map: getStoneTexture(), roughness: 0.9, metalness: 0.05 });
      _fixedMat.set('stoneTex', m);
    }
    return m;
  },
  stoneDark: () => {
    let m = _fixedMat.get('stoneDarkTex');
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: 0x6f7480, map: getStoneTexture(), roughness: 0.95, metalness: 0.05 });
      _fixedMat.set('stoneDarkTex', m);
    }
    return m;
  },
};

/** Roof material tinted per faction (shingle texture + color). Cached by hex. */
function roofMat(hex) {
  const key = `roof:${hex}`;
  let m = _fixedMat.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, map: getRoofTexture(), roughness: 0.7, metalness: 0.1 });
    _fixedMat.set(key, m);
  }
  return m;
}

// ─────────────────────────────────────────────────────────────────────────────
// Primitive part helper
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Build a shadow-casting mesh and place/rotate/scale it in one call.
 * @param {THREE.BufferGeometry} geo
 * @param {THREE.Material} mat
 * @param {number} x @param {number} y @param {number} z
 * @param {{rx?:number,ry?:number,rz?:number,sx?:number,sy?:number,sz?:number,noShadow?:boolean}} [o]
 * @returns {THREE.Mesh}
 */
export function part(geo, mat, x, y, z, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (o.rx || o.ry || o.rz) m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  if (o.sx || o.sy || o.sz) m.scale.set(o.sx || 1, o.sy || 1, o.sz || 1);
  m.castShadow = !o.noShadow;
  m.receiveShadow = false;
  return m;
}

/**
 * An empty pivot Group placed at a joint (hip / shoulder). Child limb meshes
 * are positioned RELATIVE to the joint so rotating the pivot swings the whole
 * limb about it — this is what turns the old "floating body" into a unit with
 * actual striding legs and swinging arms (Unit._animate drives the pivots).
 * @param {number} x @param {number} y @param {number} z
 * @returns {THREE.Group}
 */
export function pivotAt(x, y, z) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  return p;
}

// ═════════════════════════════════════════════════════════════════════════════
// UNIT MODELS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Build a unit model.
 * @param {object} type - Frozen UnitTypes entry.
 * @param {string} colorHex - Owner color.
 * @returns {{group: THREE.Group, height: number}} height = crown height (for
 *   worker cargo / floating bars placement).
 */
export function buildUnitModel(type, colorHex) {
  switch (type.race) {
    case 'BIO_HUMAN': return buildKnight(type, colorHex);
    case 'ARTIFICE_HORDE': return buildArtificeUnit(type, colorHex);
    case 'TERRA_BORN': return buildTerraUnit(type, colorHex);
    case 'CHAOS_DEEP': return buildChaosUnit(type, colorHex);
    default: return buildKnight(type, colorHex);
  }
}

// ── Aether Knights ───────────────────────────────────────────────────────────
function createHumanoidBase(hex, a, options = {}) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const legMat = options.legMat || MAT.steelDark();
  const torsoMat = options.torsoMat || (a === ARCHETYPE.WORKER ? MAT.robe() : MAT.steel());
  const armMat = options.armMat || (a === ARCHETYPE.WORKER ? MAT.robe() : MAT.steel());
  const cloth = team(hex, 'cloth');

  // Legs (hip-pivoted so they stride). Foot ends at y≈0.07, hip at 0.72.
  const hipY = 0.72;
  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.14, hipY, 0);
    leg.add(part(cylGeo(0.11, 0.13, 0.7, 8), legMat, 0, -0.37, 0));
    leg.add(part(boxGeo(0.2, 0.14, 0.34), MAT.steelDark(), 0, -0.65, 0.05)); // boot
    g.add(leg);
    anim.legs.push(leg);
  }

  // Torso
  g.add(part(cylGeo(0.26, 0.3, 0.62, 10), torsoMat, 0, 1.02, 0));

  // Team tabard on the chest (unless hidden)
  if (!options.hideTabard) {
    g.add(part(boxGeo(0.34, 0.5, 0.08), cloth, 0, 1.02, 0.24));
  }

  // Shoulder cloak (team color) behind (unless hidden)
  if (!options.hideCloak) {
    g.add(part(boxGeo(0.5, 0.55, 0.06), team(hex, 'dark'), 0, 1.05, -0.24, { rx: 0.15 }));
  }

  // Head + helmet
  g.add(part(sphGeo(0.17, 10), MAT.skin(), 0, 1.48, 0.02));
  if (options.helmet) {
    g.add(options.helmet);
  } else {
    g.add(part(cylGeo(0.19, 0.2, 0.16, 10), MAT.steel(), 0, 1.55, 0));
  }

  // Pauldrons
  g.add(part(sphGeo(options.pauldronR || 0.15, 8), options.pauldronMat || MAT.steel(), -0.32, 1.28, 0, { sy: 0.7 }));
  g.add(part(sphGeo(options.pauldronR || 0.15, 8), options.pauldronMat || MAT.steel(), 0.32, 1.28, 0, { sy: 0.7 }));

  // Arms (shoulder-pivoted so they counter-swing while walking and jab on attack). Hand ends at y≈0.74.
  const shoulderY = 1.24;
  const makeArm = (sx) => {
    const arm = pivotAt(sx * 0.34, shoulderY, 0.02);
    arm.add(part(cylGeo(0.08, 0.09, 0.5, 6), armMat, 0, -0.24, 0));
    arm.add(part(sphGeo(0.075, 6), MAT.skin(), 0, -0.5, 0)); // hand
    g.add(arm);
    return arm;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);
  anim.arms.push(armL, armR);

  return { g, anim, armL, armR, crown: options.crown || 1.72 };
}

function buildAcolyte(type, hex) {
  // Acolyte: hood + a pick/hammer tool held in the right hand.
  const base = createHumanoidBase(hex, ARCHETYPE.WORKER, { hideCloak: true });
  base.g.add(part(coneGeo(0.22, 0.34, 10), team(hex, 'cloth'), 0, 1.55, -0.02));
  base.armR.add(part(cylGeo(0.03, 0.03, 0.8, 6), MAT.wood(), 0, -0.28, 0.2, { rz: 0.2 }));
  base.armR.add(part(boxGeo(0.26, 0.1, 0.1), MAT.steel(), 0.05, 0.1, 0.24)); // pick head
  base.anim.toolArm = base.armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 1.78 };
}

function buildTemplar(type, hex) {
  // Templar: plumed helm, sword in the right hand, kite shield on the left.
  const base = createHumanoidBase(hex, ARCHETYPE.MELEE, {
    helmet: part(cylGeo(0.19, 0.2, 0.16, 10), MAT.steel(), 0, 1.55, 0)
  });
  base.g.add(part(coneGeo(0.06, 0.32, 6), team(hex, 'cloth'), 0, 1.78, -0.04)); // plume
  base.armR.add(part(boxGeo(0.06, 0.9, 0.02), MAT.steel(), 0.02, -0.18, 0.14));
  base.armR.add(part(boxGeo(0.22, 0.06, 0.06), MAT.gold(), 0.02, -0.32, 0.14)); // crossguard
  base.armL.add(part(boxGeo(0.06, 0.5, 0.38), MAT.steelDark(), -0.04, -0.2, 0.1));
  base.armL.add(part(boxGeo(0.04, 0.28, 0.2), team(hex, 'cloth'), -0.08, -0.2, 0.1)); // emblem
  base.anim.toolArm = base.armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 2.1 };
}

function buildArbalist(type, hex) {
  // Arbalist: light helm, crossbow cradled in the right hand.
  const base = createHumanoidBase(hex, ARCHETYPE.RANGED, {
    helmet: part(cylGeo(0.18, 0.18, 0.06, 10), MAT.gold(), 0, 1.62, 0)
  });
  const bow = new THREE.Group();
  bow.add(part(boxGeo(0.05, 0.08, 0.7), MAT.wood(), 0, 0, 0));
  bow.add(part(boxGeo(0.5, 0.04, 0.04), MAT.steelDark(), 0, 0.04, 0.28)); // bow arms
  bow.add(part(boxGeo(0.5, 0.02, 0.02), MAT.gold(), 0, 0.02, 0.34)); // string
  bow.position.set(0, -0.28, 0.14);
  base.armR.add(bow);
  base.anim.toolArm = base.armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 1.78 };
}

function buildFootman(type, hex) {
  // Footman: steel bucket helmet, round team-colored shield, arming sword
  const base = createHumanoidBase(hex, ARCHETYPE.MELEE, {
    helmet: part(cylGeo(0.2, 0.22, 0.18, 8), MAT.steel(), 0, 1.55, 0)
  });
  base.g.add(part(cylGeo(0.24, 0.24, 0.03, 8), MAT.steelDark(), 0, 1.64, 0)); // helmet brim
  base.armR.add(part(boxGeo(0.05, 0.65, 0.02), MAT.steel(), 0.02, -0.2, 0.12)); // shortsword
  base.armR.add(part(boxGeo(0.16, 0.05, 0.05), MAT.steelDark(), 0.02, -0.32, 0.12)); // guard
  
  // Round shield
  const sh = new THREE.Group();
  sh.add(part(cylGeo(0.32, 0.32, 0.04, 8), team(hex, 'cloth'), 0, 0, 0, { rx: Math.PI / 2 }));
  sh.add(part(cylGeo(0.35, 0.35, 0.02, 8), MAT.steel(), 0, -0.01, 0, { rx: Math.PI / 2 })); // border
  sh.add(part(sphGeo(0.08, 6), MAT.gold(), 0, 0.02, 0)); // boss
  sh.position.set(-0.06, -0.2, 0.12);
  sh.rotation.y = -0.3;
  base.armL.add(sh);
  
  base.anim.toolArm = base.armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 1.8 };
}

function buildKnightMounted(type, hex) {
  // Knight/Lancer: mounted on a horse!
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const id = type.id;
  
  // Horse body
  g.add(part(boxGeo(0.55, 0.5, 1.1), MAT.bioWood(), 0, 0.65, 0)); // horse torso
  g.add(part(cylGeo(0.14, 0.18, 0.7, 8), MAT.bioWood(), 0, 1.0, 0.45, { rx: 0.4 })); // horse neck
  g.add(part(boxGeo(0.18, 0.22, 0.44), MAT.bioStoneDark(), 0, 1.3, 0.6, { rx: 0.1 })); // horse head
  g.add(part(cylGeo(0.04, 0.08, 0.6), MAT.bioWood(), 0, 0.7, -0.55, { rx: -0.6 })); // tail

  // 4 horse legs swing diagonally
  const hipY = 0.65;
  const legL = pivotAt(-0.18, hipY, 0); // Left Front / Right Back
  legL.add(part(cylGeo(0.08, 0.1, 0.55, 6), MAT.bioStone(), 0, -0.28, 0.4)); // Front Left
  legL.add(part(cylGeo(0.08, 0.1, 0.55, 6), MAT.bioStone(), 0.36, -0.28, -0.4)); // Back Right
  g.add(legL);
  anim.legs.push(legL);

  const legR = pivotAt(0.18, hipY, 0); // Right Front / Left Back
  legR.add(part(cylGeo(0.08, 0.1, 0.55, 6), MAT.bioStone(), 0, -0.28, 0.4)); // Front Right
  legR.add(part(cylGeo(0.08, 0.1, 0.55, 6), MAT.bioStone(), -0.36, -0.28, -0.4)); // Back Left
  g.add(legR);
  anim.legs.push(legR);

  // Rider torso, head, arms
  g.add(part(cylGeo(0.22, 0.24, 0.5, 8), MAT.steel(), 0, 1.25, 0)); // rider torso
  g.add(part(sphGeo(0.15, 8), MAT.skin(), 0, 1.6, 0.02)); // rider head
  g.add(part(cylGeo(0.17, 0.17, 0.14, 8), MAT.steel(), 0, 1.66, 0)); // rider helm

  const shoulderY = 1.45;
  const makeArm = (sx) => {
    const arm = pivotAt(sx * 0.28, shoulderY, 0.02);
    arm.add(part(cylGeo(0.07, 0.08, 0.44, 6), MAT.steel(), 0, -0.22, 0));
    arm.add(part(sphGeo(0.065, 6), MAT.skin(), 0, -0.44, 0));
    g.add(arm);
    return arm;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);
  anim.arms.push(armL, armR);

  if (id === 'BH_KNIGHT') {
    // Knight sword
    armR.add(part(boxGeo(0.05, 0.8, 0.02), MAT.steel(), 0.02, -0.2, 0.14));
    armR.add(part(boxGeo(0.2, 0.05, 0.05), MAT.gold(), 0.02, -0.32, 0.14));
    anim.toolArm = armR;
  } else {
    // Lancer lance
    armR.add(part(coneGeo(0.045, 1.7, 6), MAT.gold(), 0.02, -0.15, 0.45, { rx: 1.1 })); // lance pointing forward
    anim.toolArm = armR;
  }

  g.userData.anim = anim;
  // Add customAnimate to bob the head and wag the tail
  g.userData.customAnimate = (unit, dt, now, speed) => {
    const tail = g.children[3];
    const head = g.children[2];
    if (speed > 0.4) {
      tail.rotation.z = Math.sin(now * 16) * 0.3;
      head.position.y = 1.3 + Math.sin(now * 16) * 0.05;
    } else {
      tail.rotation.z = Math.sin(now * 2) * 0.05;
      head.position.y = 1.3 + Math.sin(now * 2) * 0.01;
    }
  };

  return { group: g, height: 2.3 };
}

function buildCleric(type, hex) {
  // Cleric: robe, hood, staff with floating blue orb
  const base = createHumanoidBase(hex, ARCHETYPE.RANGED, {
    torsoMat: MAT.robe(),
    armMat: MAT.robe(),
    hideCloak: true,
    helmet: part(coneGeo(0.22, 0.35, 8), team(hex, 'cloth'), 0, 1.55, -0.02)
  });
  // staff
  base.armR.add(part(cylGeo(0.025, 0.025, 1.1, 6), MAT.wood(), 0.02, -0.22, 0.15));
  base.armR.add(part(sphGeo(0.12, 8), team(hex, 'core'), 0.02, 0.36, 0.15)); // glowing orb at top
  base.anim.toolArm = base.armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 1.82 };
}

function buildMage(type, hex) {
  // Mage: pointy wizard hat, staff with glowing red fire orb
  const base = createHumanoidBase(hex, ARCHETYPE.RANGED, {
    torsoMat: MAT.robe(),
    armMat: MAT.robe(),
    helmet: part(coneGeo(0.26, 0.55, 8), team(hex, 'cloth'), 0, 1.56, 0)
  });
  base.g.add(part(cylGeo(0.38, 0.38, 0.02, 8), MAT.gold(), 0, 1.52, 0)); // hat brim
  // staff
  base.armR.add(part(cylGeo(0.025, 0.025, 1.1, 6), MAT.wood(), 0.02, -0.22, 0.15));
  base.armR.add(part(sphGeo(0.12, 8), MAT.lava(), 0.02, 0.36, 0.15)); // red fire orb
  base.anim.toolArm = base.armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 2.1 };
}

function buildRifleman(type, hex) {
  // Rifleman: leather cap, holding a musket/rifle
  const base = createHumanoidBase(hex, ARCHETYPE.RANGED, {
    helmet: part(sphGeo(0.19, 8), MAT.steelDark(), 0, 1.55, 0),
    hideCloak: true
  });
  base.g.add(part(boxGeo(0.04, 0.15, 0.18), MAT.steelDark(), -0.18, 1.48, 0));
  base.g.add(part(boxGeo(0.04, 0.15, 0.18), MAT.steelDark(), 0.18, 1.48, 0));
  // Rifle
  const rf = new THREE.Group();
  rf.add(part(boxGeo(0.06, 0.08, 0.75), MAT.wood(), 0, 0, 0));
  rf.add(part(cylGeo(0.02, 0.02, 0.85, 6), MAT.steel(), 0, 0.03, 0.25, { rx: Math.PI / 2 }));
  rf.position.set(0.02, -0.22, 0.15);
  base.armR.add(rf);
  base.anim.toolArm = base.armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 1.76 };
}

function buildHalberdier(type, hex) {
  // Halberdier: halberd polearm, visored helm
  const base = createHumanoidBase(hex, ARCHETYPE.MELEE, {
    helmet: part(cylGeo(0.18, 0.2, 0.18, 8), MAT.steel(), 0, 1.55, 0)
  });
  base.g.add(part(boxGeo(0.24, 0.04, 0.06), MAT.steelDark(), 0, 1.55, 0.16)); // Visor
  // Halberd
  const hb = new THREE.Group();
  hb.add(part(cylGeo(0.025, 0.025, 1.8, 6), MAT.wood(), 0, 0, 0)); // shaft
  hb.add(part(boxGeo(0.22, 0.16, 0.02), MAT.steel(), 0, 0.7, 0.08)); // axe
  hb.add(part(coneGeo(0.04, 0.25, 6), MAT.steel(), 0, 0.95, 0)); // spear tip
  hb.position.set(0.02, -0.15, 0.22);
  base.armR.add(hb);
  base.anim.toolArm = base.armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 2.1 };
}

function buildPaladin(type, hex) {
  // Paladin: gold armor, huge warhammer
  const base = createHumanoidBase(hex, ARCHETYPE.MELEE, {
    legMat: MAT.steel(),
    torsoMat: MAT.gold(),
    armMat: MAT.gold(),
    pauldronMat: MAT.gold(),
    pauldronR: 0.19,
    helmet: part(cylGeo(0.19, 0.2, 0.18, 10), MAT.gold(), 0, 1.55, 0)
  });
  // Hammer
  const hm = new THREE.Group();
  hm.add(part(cylGeo(0.03, 0.03, 1.4, 6), MAT.steelDark(), 0, 0, 0)); // handle
  hm.add(part(boxGeo(0.26, 0.26, 0.42), MAT.steel(), 0, 0.55, 0)); // head
  hm.add(part(sphGeo(0.08, 6), team(hex, 'core'), 0, 0.55, 0.22)); // glow
  hm.add(part(sphGeo(0.08, 6), team(hex, 'core'), 0, 0.55, -0.22));
  hm.position.set(0.02, -0.18, 0.16);
  base.armR.add(hm);
  base.anim.toolArm = base.armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 2.15 };
}

function buildArchmage(type, hex) {
  // Archmage: floating wizard, runestones orbiting
  const base = createHumanoidBase(hex, ARCHETYPE.RANGED, {
    torsoMat: MAT.robe(),
    armMat: MAT.robe(),
    hideCloak: true,
    helmet: part(coneGeo(0.24, 0.35, 8), team(hex, 'cloth'), 0, 1.55, -0.02)
  });
  base.g.add(part(boxGeo(0.08, 0.35, 0.08), MAT.robe(), 0, 1.34, 0.12)); // white beard

  // Orbiting runes
  const runes = [];
  for (let i = 0; i < 3; i++) {
    const rune = part(octaGeo(0.06), team(hex, 'core'), 0, 0, 0);
    base.g.add(rune);
    runes.push(rune);
  }

  base.g.userData.anim = base.anim;
  base.g.userData.customAnimate = (unit, dt, now, speed) => {
    // Float bobbing
    base.g.position.y = 0.4 + Math.sin(now * 3.0) * 0.12;
    // Orbiting runes
    runes.forEach((rune, idx) => {
      const a = now * 2.5 + idx * (Math.PI * 2 / 3);
      rune.position.set(
        Math.cos(a) * 0.52,
        1.0 + Math.sin(now * 3.5 + idx) * 0.08,
        Math.sin(a) * 0.52
      );
    });
  };

  return { group: base.g, height: 2.2 };
}

function buildWarden(type, hex) {
  // Warden: dark hood, circular blade
  const base = createHumanoidBase(hex, ARCHETYPE.MELEE, {
    torsoMat: MAT.steelDark(),
    armMat: MAT.steelDark(),
    helmet: part(coneGeo(0.22, 0.38, 8), team(hex, 'cloth'), 0, 1.55, -0.02)
  });
  base.armR.add(part(torusGeo(0.24, 0.025, 12), MAT.steel(), 0.02, -0.22, 0.15, { rx: Math.PI / 2 }));
  base.anim.toolArm = base.armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 1.84 };
}

function buildGryphonRider(type, hex) {
  // Gryphon Rider
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const gold = MAT.gold();

  // Gryphon body
  g.add(part(boxGeo(0.48, 0.44, 0.95), MAT.bioWood(), 0, 0.5, 0));
  g.add(part(sphGeo(0.22, 8), MAT.bioStone(), 0, 0.72, 0.42)); // head
  g.add(part(coneGeo(0.08, 0.2, 5), MAT.gold(), 0, 0.7, 0.6, { rx: 1.2 })); // beak

  // Wings
  const wingL = pivotAt(-0.25, 0.6, 0.1);
  wingL.add(part(boxGeo(0.02, 0.5, 0.8), MAT.bioStoneDark(), 0, 0.22, 0));
  g.add(wingL);
  anim.arms.push(wingL);

  const wingR = pivotAt(0.26, 0.6, 0.1);
  wingR.add(part(boxGeo(0.02, 0.5, 0.8), MAT.bioStoneDark(), 0, 0.22, 0));
  g.add(wingR);
  anim.arms.push(wingR);

  // Rider
  g.add(part(cylGeo(0.2, 0.22, 0.4, 8), gold, 0, 0.95, 0));
  g.add(part(sphGeo(0.14, 8), MAT.skin(), 0, 1.25, 0.02));
  g.add(part(cylGeo(0.15, 0.15, 0.1, 8), MAT.steel(), 0, 1.3, 0));

  const arm = pivotAt(0.24, 1.05, 0.02);
  arm.add(part(cylGeo(0.06, 0.07, 0.38, 6), gold, 0, -0.18, 0));
  arm.add(part(sphGeo(0.055, 6), MAT.skin(), 0, -0.38, 0));
  arm.add(part(boxGeo(0.16, 0.16, 0.28), MAT.steel(), 0, -0.46, 0.15)); // storm hammer
  g.add(arm);
  anim.toolArm = arm;

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    const flap = Math.sin(now * 15.0) * 0.58;
    wingL.rotation.z = -0.3 - flap;
    wingR.rotation.z = 0.3 + flap;
  };

  return { group: g, height: 1.8 };
}

function buildDefender(type, hex) {
  // Defender: tower shield + spear
  const base = createHumanoidBase(hex, ARCHETYPE.MELEE, {
    helmet: part(cylGeo(0.18, 0.2, 0.18, 8), MAT.steel(), 0, 1.55, 0)
  });
  base.armR.add(part(cylGeo(0.02, 0.02, 0.85, 6), MAT.wood(), 0.02, -0.22, 0.18, { rx: 1.2 }));
  base.armL.add(part(boxGeo(0.06, 1.05, 0.65), MAT.steelDark(), -0.06, -0.15, 0.16, { ry: -0.1 }));
  base.armL.add(part(boxGeo(0.08, 0.9, 0.22), team(hex, 'cloth'), -0.07, -0.15, 0.16)); // shield trim
  base.anim.toolArm = base.armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 1.8 };
}

function buildCatapult(type, hex) {
  // Catapult siege engine
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };

  g.add(part(boxGeo(0.9, 0.32, 1.45), MAT.bioWood(), 0, 0.3, 0)); // chassis

  const wheels = [];
  for (const [sx, sz] of [[-0.5, -0.45], [0.5, -0.45], [-0.5, 0.45], [0.5, 0.45]]) {
    const wheel = part(cylGeo(0.28, 0.28, 0.12, 10), MAT.steelDark(), sx, 0.28, sz, { rz: Math.PI / 2 });
    g.add(wheel);
    wheels.push(wheel);
  }

  const launchArm = pivotAt(0, 0.38, -0.4);
  launchArm.add(part(boxGeo(0.08, 0.82, 0.08), MAT.bioWood(), 0, 0.4, 0));
  launchArm.add(part(cylGeo(0.18, 0.14, 0.12, 8), MAT.steel(), 0, 0.8, 0.05, { rx: Math.PI / 2 }));
  launchArm.add(part(icoGeo(0.13, 0), MAT.bioStoneDark(), 0, 0.85, 0.05));
  g.add(launchArm);
  anim.toolArm = launchArm;

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    if (speed > 0.4) {
      wheels.forEach(w => {
        w.rotation.x += speed * dt * 2.0;
      });
    }
    const jab = unit._attackAnim < 1 ? Math.sin(unit._attackAnim * Math.PI) : 0;
    launchArm.rotation.x = -jab * 1.35;
  };

  return { group: g, height: 1.4 };
}

function buildPriest(type, hex) {
  // Priest
  const base = createHumanoidBase(hex, ARCHETYPE.RANGED, {
    torsoMat: MAT.robe(),
    armMat: MAT.robe(),
    hideCloak: true,
    helmet: part(coneGeo(0.22, 0.35, 8), MAT.robe(), 0, 1.55, -0.02)
  });
  base.armR.add(part(cylGeo(0.02, 0.02, 0.8, 6), MAT.gold(), 0.02, -0.22, 0.15));
  base.armR.add(part(boxGeo(0.18, 0.05, 0.05), MAT.gold(), 0.02, 0.18, 0.15)); // scepter cross
  base.armL.add(part(boxGeo(0.08, 0.22, 0.18), MAT.bioWood(), -0.04, -0.22, 0.12, { ry: 0.2 })); // holy book
  base.anim.toolArm = base.armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 1.8 };
}

function buildInquisitor(type, hex) {
  // Inquisitor: pointed wide hat, flaming sword
  const base = createHumanoidBase(hex, ARCHETYPE.RANGED, {
    helmet: part(coneGeo(0.24, 0.52, 8), team(hex, 'dark'), 0, 1.58, 0)
  });
  base.g.add(part(cylGeo(0.4, 0.4, 0.02, 8), team(hex, 'dark'), 0, 1.54, 0));
  base.armR.add(part(boxGeo(0.05, 0.82, 0.02), MAT.lava(), 0.02, -0.22, 0.15));
  base.armR.add(part(boxGeo(0.18, 0.05, 0.05), MAT.steelDark(), 0.02, -0.32, 0.15));
  base.anim.toolArm = base.armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 2.05 };
}

function buildDuelist(type, hex) {
  // Duelist: feathers in hat, dual rapiers
  const base = createHumanoidBase(hex, ARCHETYPE.MELEE, {
    torsoMat: team(hex, 'dark'),
    armMat: team(hex, 'cloth'),
    helmet: part(cylGeo(0.2, 0.22, 0.1, 8), team(hex, 'dark'), 0, 1.55, 0)
  });
  base.g.add(part(cylGeo(0.35, 0.35, 0.02, 8), team(hex, 'dark'), 0, 1.58, 0));
  base.g.add(part(coneGeo(0.04, 0.28, 6), team(hex, 'bright'), -0.08, 1.68, -0.06, { rz: -0.4 }));
  
  // Dual rapiers
  base.armR.add(part(cylGeo(0.015, 0.015, 0.88, 6), MAT.steel(), 0.02, -0.22, 0.18));
  base.armR.add(part(sphGeo(0.08, 6), MAT.gold(), 0.02, -0.36, 0.18));
  base.armL.add(part(cylGeo(0.015, 0.015, 0.88, 6), MAT.steel(), -0.02, -0.22, 0.18));
  base.armL.add(part(sphGeo(0.08, 6), MAT.gold(), -0.02, -0.36, 0.18));
  base.anim.toolArm = base.armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 1.88 };
}

function buildChampion(type, hex) {
  // Champion: spiky heavy armor, greatsword
  const base = createHumanoidBase(hex, ARCHETYPE.MELEE, {
    pauldronMat: MAT.steelDark(),
    pauldronR: 0.18,
    helmet: part(cylGeo(0.18, 0.2, 0.2, 8), MAT.steelDark(), 0, 1.55, 0)
  });
  base.g.add(part(coneGeo(0.04, 0.18, 5), MAT.gold(), -0.34, 1.4, 0));
  base.g.add(part(coneGeo(0.04, 0.18, 5), MAT.gold(), 0.34, 1.4, 0));
  base.armR.add(part(boxGeo(0.07, 1.25, 0.02), MAT.steel(), 0.02, -0.2, 0.16));
  base.armR.add(part(boxGeo(0.24, 0.06, 0.06), MAT.gold(), 0.02, -0.35, 0.16));
  base.anim.toolArm = base.armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 2.1 };
}

function buildSentinel(type, hex) {
  // Sentinel: light scout hood, longbow, quiver
  const base = createHumanoidBase(hex, ARCHETYPE.RANGED, {
    torsoMat: team(hex, 'dark'),
    armMat: team(hex, 'dark'),
    helmet: part(coneGeo(0.21, 0.34, 8), team(hex, 'cloth'), 0, 1.55, -0.02)
  });
  const bow = new THREE.Group();
  bow.add(part(torusGeo(0.48, 0.02, 10), MAT.wood(), 0, 0, 0, { rx: Math.PI / 2, sx: 0.3 }));
  bow.add(part(boxGeo(0.015, 0.015, 0.95), MAT.robe(), -0.04, 0, 0.48));
  bow.position.set(-0.02, -0.24, 0.18);
  base.armL.add(bow);
  
  base.g.add(part(cylGeo(0.08, 0.08, 0.48, 6), MAT.wood(), 0.15, 1.05, -0.28, { rx: 0.4, rz: 0.3 })); // quiver
  base.anim.toolArm = base.armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 1.76 };
}

function buildAetherCrusader(type, hex) {
  // Aether Crusader: heavy polished gold/steel, glowing runes, blue aether sword
  const base = createHumanoidBase(hex, ARCHETYPE.MELEE, {
    legMat: MAT.steelDark(),
    torsoMat: MAT.steel(),
    armMat: MAT.steel(),
    pauldronMat: MAT.gold(),
    pauldronR: 0.2,
    helmet: part(cylGeo(0.19, 0.22, 0.22, 10), MAT.steel(), 0, 1.56, 0)
  });
  base.g.add(part(boxGeo(0.18, 0.38, 0.02), team(hex, 'core'), 0, 1.05, 0.25)); // glowing runes
  base.armR.add(part(boxGeo(0.06, 0.95, 0.02), team(hex, 'core'), 0.02, -0.2, 0.18)); // glowing blade
  base.armR.add(part(boxGeo(0.24, 0.06, 0.06), MAT.gold(), 0.02, -0.32, 0.18));
  base.anim.toolArm = base.armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 2.2 };
}

function buildKnight(type, hex) {
  const id = type.id;
  
  if (id === 'BH_ACOLYTE') return buildAcolyte(type, hex);
  if (id === 'BH_TEMPLAR') return buildTemplar(type, hex);
  if (id === 'BH_ARBALIST') return buildArbalist(type, hex);
  if (id === 'BH_FOOTMAN') return buildFootman(type, hex);
  if (id === 'BH_KNIGHT' || id === 'BH_LANCER') return buildKnightMounted(type, hex);
  if (id === 'BH_CLERIC') return buildCleric(type, hex);
  if (id === 'BH_MAGE') return buildMage(type, hex);
  if (id === 'BH_RIFLEMAN') return buildRifleman(type, hex);
  if (id === 'BH_HALBERDIER' || id === 'BH_ROYAL_GUARD') return buildHalberdier(type, hex);
  if (id === 'BH_PALADIN') return buildPaladin(type, hex);
  if (id === 'BH_ARCHMAGE') return buildArchmage(type, hex);
  if (id === 'BH_WARDEN') return buildWarden(type, hex);
  if (id === 'BH_GRYPHON') return buildGryphonRider(type, hex);
  if (id === 'BH_DEFENDER') return buildDefender(type, hex);
  if (id === 'BH_CATAPULT') return buildCatapult(type, hex);
  if (id === 'BH_PRIEST') return buildPriest(type, hex);
  if (id === 'BH_INQUISITOR') return buildInquisitor(type, hex);
  if (id === 'BH_DUELIST') return buildDuelist(type, hex);
  if (id === 'BH_CHAMPION') return buildChampion(type, hex);
  if (id === 'BH_SENTINEL') return buildSentinel(type, hex);
  if (id === 'BH_AETHER_CRUSADER') return buildAetherCrusader(type, hex);
  
  // Default fallback for any other or newer unit types
  return buildArbalist(type, hex);
}

// ── Void Stalkers ────────────────────────────────────────────────────────────
function buildStalker(type, hex) {
  const g = new THREE.Group();
  const a = type.archetype;
  const anim = { legs: [], arms: [], toolArm: null };
  const body = MAT.chitin();
  const lite = MAT.chitinLite();

  // Digitigrade legs (hip-pivoted): bent thigh + shin + clawed foot per side.
  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.16, 0.5, -0.05);
    leg.add(part(cylGeo(0.08, 0.12, 0.5, 6), body, 0, -0.2, 0, { rx: -0.3 }));      // thigh
    leg.add(part(cylGeo(0.07, 0.09, 0.44, 6), body, 0, -0.42, 0.17, { rx: 0.5 }));  // shin
    leg.add(part(coneGeo(0.09, 0.16, 5), MAT.bone(), 0, -0.46, 0.33, { rx: 1.5 })); // clawed foot
    g.add(leg);
    anim.legs.push(leg);
  }
  // Hunched torso (leaning forward)
  g.add(part(sphGeo(0.28, 10), body, 0, 0.92, 0.06, { sy: 1.3, sz: 1.1 }));
  // Spine ridge of bone spikes
  for (let i = 0; i < 4; i++) {
    g.add(part(coneGeo(0.05, 0.22, 5), MAT.bone(), 0, 1.05 - i * 0.12, -0.2 - i * 0.04, { rx: -0.6 }));
  }
  // Team-colored membrane hood/frill behind the head
  g.add(part(coneGeo(0.3, 0.4, 6), team(hex, 'cloth'), 0, 1.2, -0.18, { rx: 0.4, sz: 0.4 }));
  // Head — elongated skull with glowing eyes
  g.add(part(sphGeo(0.16, 8), lite, 0, 1.34, 0.16, { sz: 1.5 }));
  g.add(part(sphGeo(0.04, 6), MAT.voidGlow(), -0.07, 1.36, 0.32));
  g.add(part(sphGeo(0.04, 6), MAT.voidGlow(), 0.07, 1.36, 0.32));

  // Shoulder-pivoted arms (present on all archetypes so the frame reads as a
  // striding beast, not a floating one).
  const makeArm = (sx, z = 0.06) => {
    const arm = pivotAt(sx * 0.3, 1.02, z);
    g.add(arm);
    return arm;
  };

  let crown = 1.55;
  if (a === ARCHETYPE.WORKER) {
    // Void Thrall: big gathering claws swung from the shoulders.
    const armL = makeArm(-1, 0.14);
    const armR = makeArm(1, 0.14);
    armL.add(part(cylGeo(0.06, 0.07, 0.34, 5), body, 0, -0.16, 0));
    armL.add(part(coneGeo(0.1, 0.4, 5), MAT.bone(), 0, -0.34, 0.14, { rx: 1.2 }));
    armR.add(part(cylGeo(0.06, 0.07, 0.34, 5), body, 0, -0.16, 0));
    armR.add(part(coneGeo(0.1, 0.4, 5), MAT.bone(), 0, -0.34, 0.14, { rx: 1.2 }));
    anim.arms.push(armL, armR);
    anim.toolArm = armR;
    crown = 1.5;
  } else if (a === ARCHETYPE.MELEE) {
    // Ripper: raised twin scythe-blades on the arms, taller crest.
    const armL = makeArm(-1, 0.1);
    const armR = makeArm(1, 0.1);
    armL.add(part(coneGeo(0.07, 0.6, 4), team(hex, 'bright'), -0.04, 0.12, 0, { rz: -0.5, rx: -0.3 }));
    armR.add(part(coneGeo(0.07, 0.6, 4), team(hex, 'bright'), 0.04, 0.12, 0, { rz: 0.5, rx: -0.3 }));
    g.add(part(coneGeo(0.06, 0.3, 5), MAT.bone(), 0, 1.5, 0.1)); // head crest
    anim.arms.push(armL, armR);
    anim.toolArm = armR;
    crown = 1.85;
  } else if (a === ARCHETYPE.RANGED) {
    // Void Weaver: cradles a glowing orb in both hands (now legged, not floating).
    const armL = makeArm(-1, 0.2);
    const armR = makeArm(1, 0.2);
    armL.add(part(cylGeo(0.05, 0.06, 0.3, 5), body, 0, -0.14, 0.06, { rx: -0.5 }));
    armR.add(part(cylGeo(0.05, 0.06, 0.3, 5), body, 0, -0.14, 0.06, { rx: -0.5 }));
    g.add(part(sphGeo(0.14, 10), MAT.voidGlow(), 0, 0.86, 0.36)); // orb between the hands
    g.add(part(torusGeo(0.22, 0.02, 12), MAT.voidGlow(), 0, 0.86, 0.36, { rx: 0.4 }));
    anim.arms.push(armL, armR);
    crown = 1.7;
  }
  g.userData.anim = anim;
  return { group: g, height: crown };
}

// ── Core Elementals ──────────────────────────────────────────────────────────
function buildGolem(type, hex) {
  const g = new THREE.Group();
  const a = type.archetype;
  const rock = MAT.basalt();
  const rockLite = MAT.basaltLite();

  const scale = a === ARCHETYPE.MELEE ? 1.25 : a === ARCHETYPE.WORKER ? 0.8 : 1.0;
  const anim = { legs: [], arms: [], toolArm: null };

  // Stubby rock legs (hip-pivoted so the golem plods instead of gliding).
  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.2 * scale, 0.5 * scale, 0);
    leg.add(part(boxGeo(0.24, 0.5, 0.26), rock, 0, -0.25 * scale, 0, { sx: scale, sy: scale, sz: scale }));
    g.add(leg);
    anim.legs.push(leg);
  }
  // Boulder torso (icosahedron for a chiseled look)
  g.add(part(icoGeo(0.42, 0), rock, 0, (0.85) * scale, 0, { sx: scale * 1.05, sy: scale, sz: scale * 0.95 }));
  // Lava veins (glowing thin bars across the chest)
  g.add(part(boxGeo(0.5, 0.05, 0.05), MAT.lava(), 0, 0.9 * scale, 0.34 * scale, { rz: 0.4 }));
  g.add(part(boxGeo(0.4, 0.04, 0.04), MAT.lava(), 0.05, 0.7 * scale, 0.34 * scale, { rz: -0.3 }));
  // Team-colored core gem embedded in the chest
  g.add(part(octaGeo(0.13), team(hex, 'core'), 0, 0.92 * scale, 0.36 * scale));
  // Head (small boulder with lava eyes)
  g.add(part(icoGeo(0.22, 0), rockLite, 0, 1.28 * scale, 0.02));
  g.add(part(sphGeo(0.04, 6), MAT.lava(), -0.09, 1.3 * scale, 0.18));
  g.add(part(sphGeo(0.04, 6), MAT.lava(), 0.09, 1.3 * scale, 0.18));

  // Shoulder-pivoted rocky arms (the shoulder boulder rides on the arm pivot).
  const makeArm = (sx) => {
    const arm = pivotAt(sx * 0.5 * scale, 1.0 * scale, 0);
    arm.add(part(icoGeo(0.2, 0), rockLite, 0, 0, 0));
    g.add(arm);
    return arm;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);
  anim.arms.push(armL, armR);

  let crown = 1.55 * scale;
  if (a === ARCHETYPE.WORKER) {
    // Golemling: mining chisel on the right arm.
    armR.add(part(coneGeo(0.1, 0.34, 6), rockLite, 0, -0.2 * scale, 0.2, { rx: 1.4 }));
    anim.toolArm = armR;
  } else if (a === ARCHETYPE.MELEE) {
    // Basalt Brute: massive boulder fists on both arms.
    armL.add(part(icoGeo(0.3, 0), rock, 0, -0.3 * scale, 0.1));
    armR.add(part(icoGeo(0.3, 0), rock, 0, -0.3 * scale, 0.1));
    // Back-mounted molten crystals
    g.add(part(octaGeo(0.16), MAT.lava(), 0, 1.2 * scale, -0.3));
    anim.toolArm = armR;
    crown = 2.0 * scale;
  } else if (a === ARCHETYPE.RANGED) {
    // Shardcaster: a crystal launcher + shard on the right arm.
    armR.add(part(coneGeo(0.16, 0.4, 6), team(hex, 'core'), 0, -0.05 * scale, 0.25, { rx: 1.1 }));
    armR.add(part(octaGeo(0.1), team(hex, 'bright'), 0, 0.0, 0.5));
    anim.toolArm = armR;
  }
  g.userData.anim = anim;
  return { group: g, height: crown };
}

// ═════════════════════════════════════════════════════════════════════════════
// BUILDING MODELS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Build a building model. Base sits at y = 0; the returned group is scaled on Y
 * by Building._applyScaffoldScale during construction.
 * @param {object} type - Frozen UnitTypes building entry.
 * @param {string} colorHex - Owner color.
 * @returns {{group: THREE.Group, height: number}}
 */
export function buildBuildingModel(type, colorHex) {
  let built;
  switch (type.race) {
    case 'BIO_HUMAN': built = buildKnightBuilding(type, colorHex); break;
    case 'ARTIFICE_HORDE': built = buildArtificeBuilding(type, colorHex); break;
    case 'TERRA_BORN': built = buildTerraBuilding(type, colorHex); break;
    case 'CHAOS_DEEP': built = buildChaosBuilding(type, colorHex); break;
    default: built = buildKnightBuilding(type, colorHex); break;
  }
  return decorateBuildingVariant(type, colorHex, built);
}

/** A team-color pennant banner on a pole. */
export function banner(hex, x, y, z, h = 1.2) {
  const grp = new THREE.Group();
  grp.name = 'banner';
  grp.add(part(cylGeo(0.04, 0.04, h, 6), MAT.bioWood(), 0, h / 2, 0));
  const cloth = part(boxGeo(0.02, h * 0.4, 0.5), teamBanner(hex), 0.02, h * 0.75, 0.28);
  cloth.name = 'cloth';
  grp.add(cloth);
  grp.position.set(x, y, z);
  return grp;
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function decorateBuildingVariant(type, hex, built) {
  const g = built.group;
  const h = hashString(type.id);
  const R = type.radius;
  const crown = built.height;
  const count = 2 + (h % 3);
  const baseAngle = ((h >>> 4) % 628) / 100;

  for (let i = 0; i < count; i++) {
    const a = baseAngle + (i / count) * Math.PI * 2;
    const x = Math.cos(a) * R * (0.62 + ((h >>> (i + 2)) & 3) * 0.08);
    const z = Math.sin(a) * R * (0.62 + ((h >>> (i + 5)) & 3) * 0.08);
    const tall = 0.7 + (((h >>> (i * 3)) & 7) / 7) * 1.4;

    if (type.race === 'BIO_HUMAN') {
      const pick = (h + i) % 4;
      if (pick === 0) {
        g.add(part(cylGeo(0.18, 0.24, tall + 1.0, 8), MAT.bioStoneDark(), x, (tall + 1.0) / 2, z));
        g.add(part(coneGeo(0.34, 0.55, 8), MAT.bioRoof(), x, tall + 1.28, z));
      } else if (pick === 1) {
        g.add(part(boxGeo(0.34, tall + 0.6, 0.34), MAT.bioWood(), x, (tall + 0.6) / 2, z, { ry: a }));
        g.add(banner(hex, x, tall + 0.25, z, 0.9));
      } else if (pick === 2) {
        g.add(part(boxGeo(0.55, 0.22, 0.12), MAT.bioTrim(), x, crown * 0.52, z, { ry: a }));
        g.add(part(boxGeo(0.22, 0.7 + tall * 0.45, 0.22), MAT.bioStone(), x, 0.5 + tall * 0.25, z));
      } else {
        g.add(part(cylGeo(0.13, 0.16, tall + 0.55, 6), MAT.bioWood(), x, (tall + 0.55) / 2, z));
        g.add(part(boxGeo(0.44, 0.18, 0.44), MAT.bioTrim(), x, tall + 0.68, z, { ry: a }));
      }
    } else if (type.race === 'ARTIFICE_HORDE') {
      g.add(part(cylGeo(0.08, 0.12, tall + 0.9, 8), MAT.steelDark(), x, (tall + 0.9) / 2, z, { rz: 0.18 * Math.sin(a) }));
      if ((h + i) % 2 === 0) g.add(part(torusGeo(0.28, 0.035, 14), MAT.voidGlow(), x, tall + 1.0, z, { rx: Math.PI / 2 }));
      else g.add(part(sphGeo(0.16, 8), team(hex, 'core'), x, tall + 1.0, z));
    } else if (type.race === 'TERRA_BORN') {
      g.add(part(octaGeo(0.28 + tall * 0.12), MAT.lava(), x, 0.8 + tall * 0.45, z, { sy: 1.4 + tall * 0.25, ry: a }));
      g.add(part(icoGeo(0.35, 0), MAT.basaltLite(), x * 0.92, 0.25, z * 0.92, { sy: 0.65 }));
    } else if (type.race === 'CHAOS_DEEP') {
      g.add(part(coneGeo(0.16 + tall * 0.05, 0.9 + tall, 7), MAT.carapace(), x, 0.45 + tall * 0.5, z, { rx: 0.26, ry: a }));
      if ((h + i) % 2 === 0) g.add(part(sphGeo(0.18, 8), MAT.acidGlow(), x * 0.94, 0.75 + tall * 0.35, z * 0.94));
    }
  }

  if (type.archetype === ARCHETYPE.HALL) {
    g.add(part(torusGeo(R * 0.58, 0.05, 18), team(hex, 'bright'), 0, Math.max(1.0, crown * 0.42), 0, { rx: Math.PI / 2 }));
  } else if (type.archetype === ARCHETYPE.SUPPLY) {
    g.add(part(octaGeo(0.2 + (h % 5) * 0.025), team(hex, 'core'), 0, crown + 0.25, 0));
  }

  g.name = type.id;
  built.height = Math.max(built.height, crown + 0.45);
  return built;
}

// ── Aether Knights: stone castle keeps with blue roofs ───────────────────────
function buildKnightBuilding(type, hex) {
  const g = new THREE.Group();
  const id = type.id;
  const a = type.archetype;
  const R = type.radius;
  const stone = MAT.bioStone();
  const roof = MAT.bioRoof();
  const darkStone = MAT.bioStoneDark();
  const timber = MAT.bioWood();
  const trim = MAT.bioTrim();

  if (id === 'BH_CITADEL') {
    // Citadel: Hall
    const w = R * 1.7;
    g.add(part(boxGeo(w, 3.4, w), stone, 0, 1.7, 0));
    // Corner towers with conical roofs
    const t = w / 2;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.add(part(cylGeo(0.7, 0.8, 4.6, 10), stone, sx * t, 2.3, sz * t));
      g.add(part(coneGeo(1.0, 1.6, 10), roof, sx * t, 5.4, sz * t));
      g.add(banner(hex, sx * t, 6.2, sz * t, 0.9));
    }
    // Central keep roof + gatehouse
    g.add(part(boxGeo(w * 0.7, 2.2, w * 0.7), darkStone, 0, 4.2, 0));
    g.add(part(coneGeo(w * 0.62, 2.4, 4), roof, 0, 6.5, 0, { ry: Math.PI / 4 }));
    g.add(part(boxGeo(1.4, 2.0, 0.4), timber, 0, 1.0, w / 2)); // gate
    g.add(part(boxGeo(1.0, 1.2, 0.1), trim, 0, 2.4, w / 2 + 0.05)); // emblem plaque
    return { group: g, height: 7.5 };
  }

  if (id === 'BH_KEEP') {
    // Keep: Hall tier 2 (bigger than citadel, double towers)
    const w = R * 1.7;
    g.add(part(boxGeo(w * 1.1, 4.2, w * 1.1), stone, 0, 2.1, 0));
    const t = (w * 1.1) / 2;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.add(part(cylGeo(0.8, 0.9, 5.5, 10), stone, sx * t, 2.75, sz * t));
      g.add(part(coneGeo(1.1, 1.8, 10), roof, sx * t, 6.4, sz * t));
      g.add(banner(hex, sx * t, 7.3, sz * t, 1.1));
    }
    // Gatehouse & wall battlements
    g.add(part(boxGeo(1.6, 2.4, 0.5), timber, 0, 1.2, t));
    return { group: g, height: 8.2 };
  }

  if (id === 'BH_CASTLE') {
    // Castle: Hall tier 3 (huge keep, grand dome, central spire)
    const w = R * 1.8;
    g.add(part(boxGeo(w * 1.2, 5.2, w * 1.2), stone, 0, 2.6, 0));
    const t = (w * 1.2) / 2;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.add(part(boxGeo(1.4, 6.8, 1.4), darkStone, sx * t, 3.4, sz * t)); // square towers
      g.add(part(coneGeo(1.5, 2.2, 4), roof, sx * t, 7.9, sz * t, { ry: Math.PI / 4 }));
      g.add(banner(hex, sx * t, 9.0, sz * t, 1.3));
    }
    // Central grand dome
    g.add(part(sphGeo(w * 0.5, 12, 10), MAT.gold(), 0, 5.2, 0, { sy: 0.6 })); // gold dome
    g.add(part(cylGeo(0.12, 0.12, 2.5, 6), MAT.gold(), 0, 6.8, 0)); // spire tip
    g.add(part(boxGeo(1.8, 3.0, 0.6), darkStone, 0, 1.5, t)); // gatehouse
    return { group: g, height: 9.3 };
  }

  if (id === 'BH_BASTION' || id === 'BH_BARRACKS_T2') {
    // Bastion / Barracks
    const w = R * 1.6;
    g.add(part(boxGeo(w, 2.4, w * 0.8), stone, 0, 1.2, 0));
    g.add(part(boxGeo(w * 1.05, 1.4, w * 0.85), roof, 0, 3.0, 0)); // pitched roof
    g.add(part(coneGeo(w * 0.62, 1.6, 4), roof, 0, 3.6, 0, { ry: Math.PI / 4 }));
    g.add(part(boxGeo(0.9, 1.6, 0.2), timber, 0, 0.8, w * 0.42)); // door
    
    // Weapon rack and training dummy
    g.add(part(cylGeo(0.04, 0.04, 1.2, 6), timber, w * 0.4, 0.6, w * 0.4));
    g.add(part(boxGeo(0.3, 0.6, 0.08), MAT.steel(), w * 0.4, 0.7, w * 0.4, { ry: 0.4 })); // shield on rack
    
    // Training dummy (post + crossbar)
    g.add(part(cylGeo(0.06, 0.06, 1.1, 6), timber, -w * 0.45, 0.55, w * 0.3));
    g.add(part(boxGeo(0.5, 0.1, 0.1), timber, -w * 0.45, 0.85, w * 0.3));
    
    g.add(banner(hex, w / 2 - 0.2, 2.4, -w * 0.3, 1.4));
    if (id === 'BH_BARRACKS_T2') {
      g.add(banner(hex, -w / 2 + 0.2, 2.4, -w * 0.3, 1.4)); // double banners
    }
    return { group: g, height: 4.4 };
  }

  if (id === 'BH_SANCTUM') {
    // Sanctum: Supply pavilion
    const w = R * 1.7;
    g.add(part(cylGeo(w * 0.55, w * 0.7, 1.4, 8), stone, 0, 0.7, 0));
    g.add(part(coneGeo(w * 0.8, 1.8, 8), roof, 0, 2.3, 0));
    g.add(banner(hex, 0, 3.2, 0, 1.6));
    return { group: g, height: 3.5 };
  }

  if (id === 'BH_BLACKSMITH') {
    // Blacksmith: brick forge house, hot glowing furnace, anvil
    const w = R * 1.5;
    g.add(part(boxGeo(w, 1.8, w * 0.9), stone, 0, 0.9, 0));
    g.add(part(boxGeo(w * 1.05, 1.0, w * 0.95), roof, 0, 2.3, 0));
    
    // Brick chimney
    g.add(part(boxGeo(0.48, 2.6, 0.48), darkStone, w * 0.36, 1.3, -w * 0.36));
    // Hot forge furnace
    g.add(part(boxGeo(0.68, 0.68, 0.68), darkStone, -w * 0.32, 0.34, w * 0.32));
    g.add(part(boxGeo(0.45, 0.35, 0.45), MAT.lava(), -w * 0.32, 0.34, w * 0.35)); // glowing hot fire inside!
    
    // Anvil
    g.add(part(cylGeo(0.18, 0.18, 0.3, 8), timber, w * 0.35, 0.15, w * 0.32)); // log block
    g.add(part(boxGeo(0.24, 0.12, 0.12), MAT.steelDark(), w * 0.35, 0.36, w * 0.32)); // anvil head
    
    return { group: g, height: 2.8 };
  }

  if (id === 'BH_CATHEDRAL') {
    // Cathedral: Grand church, two bell towers, gold crosses
    const w = R * 1.6;
    g.add(part(boxGeo(w * 0.8, 3.0, w * 1.2), stone, 0, 1.5, 0)); // main nave
    g.add(part(boxGeo(w * 0.85, 1.4, w * 1.25), roof, 0, 3.7, 0));
    
    // Two front spires
    g.add(part(boxGeo(0.68, 4.8, 0.68), darkStone, -w * 0.36, 2.4, w * 0.5));
    g.add(part(coneGeo(0.48, 1.6, 4), roof, -w * 0.36, 5.6, w * 0.5, { ry: Math.PI / 4 }));
    // Cross L
    g.add(part(boxGeo(0.04, 0.35, 0.04), MAT.gold(), -w * 0.36, 6.5, w * 0.5));
    g.add(part(boxGeo(0.18, 0.04, 0.04), MAT.gold(), -w * 0.36, 6.55, w * 0.5));

    g.add(part(boxGeo(0.68, 4.8, 0.68), darkStone, w * 0.36, 2.4, w * 0.5));
    g.add(part(coneGeo(0.48, 1.6, 4), roof, w * 0.36, 5.6, w * 0.5, { ry: Math.PI / 4 }));
    // Cross R
    g.add(part(boxGeo(0.04, 0.35, 0.04), MAT.gold(), w * 0.36, 6.5, w * 0.5));
    g.add(part(boxGeo(0.18, 0.04, 0.04), MAT.gold(), w * 0.36, 6.55, w * 0.5));

    // Stained glass front window
    g.add(part(cylGeo(0.36, 0.36, 0.04, 8), team(hex, 'core'), 0, 2.6, w * 0.61, { rx: Math.PI / 2 }));
    
    return { group: g, height: 6.8 };
  }

  if (id === 'BH_ACADEMY') {
    // Academy: circular domed library, columns, floating book
    const w = R * 1.5;
    g.add(part(cylGeo(w * 0.72, w * 0.72, 1.6, 12), stone, 0, 0.8, 0));
    g.add(part(sphGeo(w * 0.68, 12, 10), roof, 0, 1.6, 0, { sy: 0.5 })); // dome roof
    
    // Front columns
    for (const sx of [-1, 1]) {
      g.add(part(cylGeo(0.08, 0.08, 1.5, 6), MAT.bioStoneDark(), sx * w * 0.45, 0.75, w * 0.52));
    }

    // Floating glowing book group named 'core'
    const core = new THREE.Group();
    core.name = 'core';
    core.userData = { baseY: 2.8 };
    core.add(part(boxGeo(0.38, 0.02, 0.26), MAT.robe(), 0, 0, 0)); // pages
    core.add(part(boxGeo(0.4, 0.02, 0.04), team(hex, 'dark'), 0, -0.02, 0)); // spine
    g.add(core);

    return { group: g, height: 3.8 };
  }

  if (id === 'BH_LUMBER_MILL') {
    // Lumber Mill: saw blade or waterwheel, stack of logs
    const w = R * 1.5;
    g.add(part(boxGeo(w, 1.6, w * 0.9), stone, 0, 0.8, 0));
    g.add(part(boxGeo(w * 1.05, 0.9, w * 0.95), roof, 0, 2.05, 0));
    
    // Waterwheel / Saw blade on side
    g.add(part(cylGeo(0.65, 0.65, 0.1, 12), MAT.steelDark(), -w * 0.54, 0.72, 0, { rz: Math.PI / 2 }));
    
    // Stack of logs
    g.add(part(cylGeo(0.12, 0.12, 0.8, 6), MAT.bioWood(), w * 0.38, 0.12, w * 0.28, { rx: Math.PI / 2 }));
    g.add(part(cylGeo(0.12, 0.12, 0.8, 6), MAT.bioWood(), w * 0.38 + 0.22, 0.12, w * 0.28, { rx: Math.PI / 2 }));
    g.add(part(cylGeo(0.12, 0.12, 0.8, 6), MAT.bioWood(), w * 0.38 + 0.11, 0.32, w * 0.28, { rx: Math.PI / 2 }));

    return { group: g, height: 2.6 };
  }

  if (id === 'BH_CASTLE_WALL') {
    // Castle Wall
    const w = R * 1.8;
    g.add(part(boxGeo(w, 1.6, 0.44), stone, 0, 0.8, 0));
    g.add(part(boxGeo(0.24, 0.44, 0.44), darkStone, -w * 0.32, 1.82, 0)); // battlements
    g.add(part(boxGeo(0.24, 0.44, 0.44), darkStone, w * 0.32, 1.82, 0));
    return { group: g, height: 2.1 };
  }

  if (id === 'BH_GUARD_TOWER' || id === 'BH_CANNON_TOWER') {
    // Watchtower / Cannon Tower
    const w = R * 1.5;
    g.add(part(cylGeo(0.4, 0.55, 3.6, 8), stone, 0, 1.8, 0)); // tower base
    g.add(part(boxGeo(1.15, 0.15, 1.15), timber, 0, 3.67, 0)); // wooden deck
    g.add(part(coneGeo(0.85, 1.1, 8), roof, 0, 4.8, 0)); // conical roof

    if (id === 'BH_GUARD_TOWER') {
      // Ballista spear pointing forward
      g.add(part(boxGeo(0.08, 0.08, 0.85), MAT.steelDark(), 0, 3.9, 0.22));
      g.add(part(boxGeo(0.68, 0.04, 0.04), MAT.wood(), 0, 3.9, 0.42)); // bow arm
    } else {
      // Cannon barrel pointing forward
      g.add(part(cylGeo(0.15, 0.12, 0.92, 8), MAT.steelDark(), 0, 3.9, 0.28, { rx: 1.35 }));
    }
    return { group: g, height: 5.6 };
  }

  if (id === 'BH_MAGE_TOWER') {
    // Mage Tower: spiral stair detailing, floating arcane crystal peak
    g.add(part(cylGeo(0.35, 0.48, 4.4, 8), stone, 0, 2.2, 0));
    g.add(part(coneGeo(0.55, 1.4, 8), roof, 0, 5.1, 0));
    
    // Floating spinning core crystal named 'core'
    const core = new THREE.Group();
    core.name = 'core';
    core.userData = { baseY: 6.2 };
    core.add(part(octaGeo(0.25), team(hex, 'core'), 0, 0, 0));
    g.add(core);

    return { group: g, height: 6.8 };
  }

  if (id === 'BH_STABLES') {
    // Stables: wood stalls, hay block
    const w = R * 1.5;
    g.add(part(boxGeo(w, 1.6, w * 0.9), timber, 0, 0.8, 0));
    g.add(part(boxGeo(w * 1.05, 0.95, w * 0.95), roof, 0, 2.08, 0));
    // Arched door slots
    g.add(part(boxGeo(0.48, 1.2, 0.2), MAT.steelDark(), -w * 0.25, 0.6, w * 0.46));
    g.add(part(boxGeo(0.48, 1.2, 0.2), MAT.steelDark(), w * 0.25, 0.6, w * 0.46));
    // Hay bale
    g.add(part(boxGeo(0.3, 0.22, 0.22), MAT.gold(), w * 0.4, 0.11, -w * 0.32));
    return { group: g, height: 2.6 };
  }

  if (id === 'BH_ARCHERY_RANGE') {
    // Archery Range: wooden canopy, target posts
    const w = R * 1.5;
    g.add(part(boxGeo(w, 0.08, w * 0.85), roof, 0, 1.6, 0)); // canopy
    for (const [sx, sz] of [[-0.45, -0.38], [0.45, -0.38], [-0.45, 0.38], [0.45, 0.38]]) {
      g.add(part(cylGeo(0.04, 0.04, 1.6, 6), timber, sx * w, 0.8, sz * w)); // posts
    }
    // Targets
    for (const sx of [-0.3, 0.3]) {
      const tgt = new THREE.Group();
      tgt.add(part(cylGeo(0.22, 0.22, 0.04, 8), MAT.robe(), 0, 0.65, 0.2, { rx: Math.PI / 2 })); // white target circle
      tgt.add(part(cylGeo(0.08, 0.08, 0.05, 8), team(hex, 'cloth'), 0, 0.65, 0.21, { rx: Math.PI / 2 })); // bullseye red
      tgt.add(part(cylGeo(0.03, 0.03, 0.7, 6), timber, 0, 0.35, 0.15, { rx: -0.15 })); // post stand
      tgt.position.set(sx * w, 0, w * 0.45);
      g.add(tgt);
    }
    return { group: g, height: 2.1 };
  }

  if (id === 'BH_GRYPHON_AVIARY') {
    // Gryphon Aviary: rock roosts, high platforms
    const w = R * 1.5;
    g.add(part(cylGeo(0.42, 0.48, 3.2, 8), MAT.bioStoneDark(), -w * 0.28, 1.6, 0)); // rock pillar
    g.add(part(torusGeo(0.38, 0.08, 10), timber, -w * 0.28, 3.25, 0, { rx: Math.PI / 2 })); // straw nest
    g.add(part(sphGeo(0.08, 6), MAT.gold(), -w * 0.28, 3.32, 0.04)); // golden egg

    g.add(part(cylGeo(0.36, 0.44, 2.2, 8), MAT.bioStoneDark(), w * 0.32, 1.1, 0));
    g.add(part(torusGeo(0.32, 0.08, 10), timber, w * 0.32, 2.25, 0, { rx: Math.PI / 2 }));

    return { group: g, height: 3.8 };
  }

  if (id === 'BH_MARKET') {
    // Market: colorful stalls, storage boxes
    const w = R * 1.5;
    // Stall A
    const stA = new THREE.Group();
    stA.add(part(boxGeo(0.8, 0.06, 0.6), team(hex, 'cloth'), 0, 1.35, 0, { rx: 0.18 })); // roof
    stA.add(part(boxGeo(0.85, 0.65, 0.52), timber, 0, 0.32, 0)); // counter box
    for (const [sx, sz] of [[-0.38, -0.28], [0.38, -0.28], [-0.38, 0.28], [0.38, 0.28]]) {
      stA.add(part(cylGeo(0.03, 0.03, 1.35, 6), timber, sx, 0.67, sz));
    }
    stA.position.set(-w * 0.3, 0, 0);
    g.add(stA);
    // Crates outside
    g.add(part(boxGeo(0.32, 0.32, 0.32), darkStone, w * 0.42, 0.16, w * 0.25));
    g.add(part(boxGeo(0.26, 0.26, 0.26), MAT.gold(), w * 0.44, 0.13, -w * 0.25));
    return { group: g, height: 2.2 };
  }

  if (id === 'BH_SHRINE') {
    // Shrine: circular marble columns, glowing well water
    const w = R * 1.5;
    g.add(part(cylGeo(w * 0.68, w * 0.68, 0.25, 8), stone, 0, 0.125, 0)); // floor
    g.add(part(cylGeo(w * 0.68, w * 0.68, 0.1, 8), roof, 0, 1.85, 0)); // roof canopy
    
    // Columns
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.38;
      g.add(part(cylGeo(0.08, 0.08, 1.6, 6), MAT.bioStoneDark(), Math.cos(a) * w * 0.52, 0.92, Math.sin(a) * w * 0.52));
    }

    // Glowing well center
    g.add(part(cylGeo(0.42, 0.42, 0.34, 8), darkStone, 0, 0.3, 0));
    g.add(part(cylGeo(0.36, 0.36, 0.06, 8), team(hex, 'core'), 0, 0.45, 0)); // glowing well water

    return { group: g, height: 2.65 };
  }

  if (id === 'BH_VAULT') {
    // Vault: heavy stone walls, iron door, chests
    const w = R * 1.4;
    g.add(part(boxGeo(w, 1.6, w), stone, 0, 0.8, 0));
    g.add(part(boxGeo(w * 1.05, 0.4, w * 1.05), darkStone, 0, 1.7, 0)); // heavy flat cap
    g.add(part(boxGeo(0.5, 1.1, 0.08), MAT.steelDark(), 0, 0.55, w * 0.5)); // iron door
    // Gold chest
    g.add(part(boxGeo(0.32, 0.22, 0.22), MAT.gold(), w * 0.42, 0.11, w * 0.38));
    return { group: g, height: 2.2 };
  }

  if (id === 'BH_ALCHEMY_LAB') {
    // Alchemy Lab: vat, chimney, tubes
    const w = R * 1.5;
    g.add(part(boxGeo(w, 1.6, w * 0.9), stone, 0, 0.8, 0));
    g.add(part(boxGeo(w * 1.05, 0.9, w * 0.95), roof, 0, 2.05, 0));
    // Green bubbling vat
    g.add(part(cylGeo(0.35, 0.35, 0.55, 8), MAT.steelDark(), w * 0.32, 0.28, w * 0.28));
    g.add(part(cylGeo(0.32, 0.32, 0.04, 8), team(hex, 'core'), w * 0.32, 0.55, w * 0.28)); // liquid surface
    return { group: g, height: 2.7 };
  }

  if (id === 'BH_ARSENAL') {
    // Arsenal: crossed swords outside
    const w = R * 1.5;
    g.add(part(boxGeo(w, 1.8, w * 0.9), stone, 0, 0.9, 0));
    g.add(part(boxGeo(w * 1.05, 1.0, w * 0.95), roof, 0, 2.3, 0));
    // Crossed swords decoration on front wall (z = w * 0.45)
    g.add(part(boxGeo(0.02, 0.65, 0.04), MAT.steel(), 0.08, 0.95, w * 0.46, { rz: 0.78 })); // Sword L
    g.add(part(boxGeo(0.02, 0.65, 0.04), MAT.steel(), -0.08, 0.95, w * 0.46, { rz: -0.78 })); // Sword R
    g.add(part(sphGeo(0.1, 6), MAT.gold(), 0, 0.95, w * 0.48)); // Shield center
    return { group: g, height: 2.8 };
  }

  if (id === 'BH_GARRISON') {
    // Garrison: mini fort outpost
    const w = R * 1.6;
    g.add(part(boxGeo(w, 1.8, w), stone, 0, 0.9, 0));
    g.add(part(boxGeo(w * 1.05, 0.2, w * 1.05), darkStone, 0, 1.9, 0)); // battlement floor
    g.add(part(banner(hex, 0, 2.0, 0, 1.4)));
    return { group: g, height: 3.8 };
  }

  // Supply fallback (Sanctum)
  const wf = R * 1.7;
  g.add(part(cylGeo(wf * 0.55, wf * 0.7, 1.4, 8), stone, 0, 0.7, 0));
  g.add(part(coneGeo(wf * 0.8, 1.8, 8), roof, 0, 2.3, 0));
  g.add(banner(hex, 0, 3.2, 0, 1.6));
  return { group: g, height: 3.5 };
}

// ── Void Stalkers: jagged obsidian spires with violet glow ───────────────────
function buildStalkerBuilding(type, hex) {
  const g = new THREE.Group();
  const a = type.archetype;
  const R = type.radius;
  const shell = MAT.chitin();
  const glow = MAT.voidGlow();

  if (a === ARCHETYPE.HALL) {
    const w = R * 1.5;
    // Cracked obelisk base
    g.add(part(cylGeo(w * 0.5, w * 0.9, 3.0, 6), shell, 0, 1.5, 0));
    // Central jagged spire
    g.add(part(coneGeo(w * 0.55, 5.5, 6), MAT.chitinLite(), 0, 5.0, 0));
    g.add(part(coneGeo(0.3, 2.0, 5), glow, 0, 8.0, 0)); // glowing tip
    // Ring of bone spikes
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      g.add(part(coneGeo(0.4, 2.6, 5), MAT.bone(), Math.cos(ang) * w * 0.8, 1.3, Math.sin(ang) * w * 0.8, { rx: Math.sin(ang) * 0.4, rz: -Math.cos(ang) * 0.4 }));
    }
    // Team-colored void rift at the base
    const core = part(octaGeo(0.6), team(hex, 'core'), 0, 1.4, w * 0.7);
    core.name = 'core';
    core.userData = { baseY: 1.4 };
    g.add(core);
    return { group: g, height: 9.0 };
  }
  if (a === ARCHETYPE.BARRACKS) {
    const w = R * 1.5;
    g.add(part(icoGeo(w * 0.8, 0), shell, 0, w * 0.7, 0, { sy: 1.1 }));
    g.add(part(coneGeo(0.5, 2.4, 5), MAT.chitinLite(), 0, 2.6, 0));
    // Maw entrance with team glow
    g.add(part(sphGeo(0.5, 8), glow, 0, w * 0.5, w * 0.8, { sz: 0.4 }));
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + 0.4;
      g.add(part(coneGeo(0.3, 1.8, 5), MAT.bone(), Math.cos(ang) * w * 0.7, 1.0, Math.sin(ang) * w * 0.7, { rx: Math.sin(ang) * 0.5, rz: -Math.cos(ang) * 0.5 }));
    }
    const core = part(octaGeo(0.3), team(hex, 'core'), 0, 3.9, 0);
    core.name = 'core';
    core.userData = { baseY: 3.9 };
    g.add(core);
    return { group: g, height: 4.8 };
  }
  // SUPPLY — Obelisk: a floating team-lit shard on a dark plinth
  const w = R * 1.4;
  g.add(part(cylGeo(w * 0.5, w * 0.8, 1.0, 6), shell, 0, 0.5, 0));
  g.add(part(coneGeo(w * 0.5, 2.6, 5), MAT.chitinLite(), 0, 2.3, 0));
  const core = part(octaGeo(0.5), team(hex, 'core'), 0, 3.4, 0);
  core.name = 'core';
  core.userData = { baseY: 3.4 };
  g.add(core);
  return { group: g, height: 3.9 };
}

// ── Core Elementals: volcanic basalt forges with molten glow ─────────────────
function buildGolemBuilding(type, hex) {
  const g = new THREE.Group();
  const a = type.archetype;
  const R = type.radius;
  const rock = MAT.basalt();
  const lite = MAT.basaltLite();

  if (a === ARCHETYPE.HALL) {
    const w = R * 1.6;
    // Chunky stepped basalt ziggurat
    g.add(part(boxGeo(w * 1.3, 1.6, w * 1.3), rock, 0, 0.8, 0));
    g.add(part(boxGeo(w * 1.0, 1.4, w * 1.0), lite, 0, 2.2, 0));
    g.add(part(boxGeo(w * 0.65, 1.4, w * 0.65), rock, 0, 3.5, 0));
    // Molten crater on top
    const lava = part(cylGeo(w * 0.3, w * 0.32, 0.5, 10), MAT.lava(), 0, 4.4, 0);
    lava.name = 'lavaVent';
    g.add(lava);
    // Lava seams down the faces
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + 0.78;
      g.add(part(boxGeo(0.12, 3.0, 0.12), MAT.lava(), Math.cos(ang) * w * 0.62, 2.0, Math.sin(ang) * w * 0.62));
    }
    // Team-colored core gem over the entrance
    const core = part(octaGeo(0.5), team(hex, 'core'), 0, 1.4, w * 0.66);
    core.name = 'core';
    core.userData = { baseY: 1.4 };
    g.add(core);
    // Molten crystal chimneys
    g.add(part(coneGeo(0.4, 1.6, 5), MAT.emberDark(), -w * 0.5, 4.6, -w * 0.5));
    g.add(part(coneGeo(0.4, 1.6, 5), MAT.emberDark(), w * 0.5, 4.6, -w * 0.5));
    return { group: g, height: 5.2 };
  }
  if (a === ARCHETYPE.BARRACKS) {
    const w = R * 1.5;
    g.add(part(boxGeo(w * 1.2, 2.0, w), rock, 0, 1.0, 0));
    g.add(part(boxGeo(w * 0.9, 1.0, w * 0.8), lite, 0, 2.4, 0));
    // Forge mouth glowing lava
    const lava = part(boxGeo(w * 0.5, 0.9, 0.2), MAT.lava(), 0, 0.9, w * 0.5);
    lava.name = 'lavaVent';
    g.add(lava);
    g.add(part(cylGeo(0.3, 0.36, 1.8, 8), MAT.emberDark(), w * 0.45, 2.8, -w * 0.3)); // chimney
    const chimneyLava = part(cylGeo(0.16, 0.16, 0.4, 8), MAT.lava(), w * 0.45, 3.8, -w * 0.3, { noShadow: true });
    chimneyLava.name = 'lavaVent';
    g.add(chimneyLava);
    const core = part(octaGeo(0.28), team(hex, 'core'), 0, 3.0, 0);
    core.name = 'core';
    core.userData = { baseY: 3.0 };
    g.add(core);
    return { group: g, height: 3.9 };
  }
  // SUPPLY — Aether Conduit: a lava-cored pillar
  const w = R * 1.4;
  g.add(part(boxGeo(w, 1.0, w), rock, 0, 0.5, 0));
  g.add(part(cylGeo(0.3, 0.5, 2.6, 6), lite, 0, 2.0, 0));
  const lava = part(coneGeo(0.36, 0.8, 6), MAT.lava(), 0, 3.6, 0, { noShadow: true });
  lava.name = 'lavaVent';
  g.add(lava);
  const core = part(octaGeo(0.24), team(hex, 'core'), 0, 1.2, w * 0.55);
  core.name = 'core';
  core.userData = { baseY: 1.2 };
  g.add(core);
  return { group: g, height: 4.0 };
}

/** Free all cached model geometries/materials (engine teardown). */
// ── Chaos Deep organic builders ──────────────────────────────────────────────
function buildChaosDeep(type, hex) {
  const a = type.archetype;
  const g = new THREE.Group();
  g.name = type.id;

  const anim = { legs: [], arms: [], toolArm: null };
  g.userData.anim = anim;

  const org = MAT.organic();
  const cap = MAT.carapace();
  const glow = MAT.acidGlow();

  // Basic base leg-pivots (left/right hips) so the walker animation walks
  const makeLeg = (sx) => {
    const hip = pivotAt(sx * 0.22, 0.44, 0);
    g.add(hip);
    anim.legs.push(hip);
    return hip;
  };

  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  legL.add(part(cylGeo(0.06, 0.05, 0.44, 5), cap, 0, -0.22, 0, { rx: 0.1 }));
  legR.add(part(cylGeo(0.06, 0.05, 0.44, 5), cap, 0, -0.22, 0, { rx: 0.1 }));

  // Main organic body
  g.add(part(sphGeo(0.26, 8), org, 0, 0.68, 0, { sx: 1.1, sy: 1.3, sz: 1.1 }));

  if (a === ARCHETYPE.WORKER) {
    // Larval Dredger: Pincers on shoulders
    const armL = pivotAt(-0.25, 0.76, 0.08);
    const armR = pivotAt(0.25, 0.76, 0.08);
    g.add(armL); g.add(armR);
    armL.add(part(coneGeo(0.06, 0.4, 4), glow, -0.05, -0.16, 0.15, { rx: 0.8, ry: -0.3 }));
    armR.add(part(coneGeo(0.06, 0.4, 4), glow, 0.05, -0.16, 0.15, { rx: 0.8, ry: 0.3 }));
    anim.arms.push(armL, armR);
    anim.toolArm = armR;
  } else if (a === ARCHETYPE.MELEE) {
    // Rift-Fiend: Spike tail and small scythes
    g.add(part(coneGeo(0.05, 0.38, 4), cap, 0, 0.68, -0.32, { rx: -1.3 }));
    const armL = pivotAt(-0.25, 0.76, 0.12);
    const armR = pivotAt(0.25, 0.76, 0.12);
    g.add(armL); g.add(armR);
    armL.add(part(coneGeo(0.07, 0.5, 4), cap, 0, -0.2, 0.1, { rx: 1.0 }));
    armR.add(part(coneGeo(0.07, 0.5, 4), cap, 0, -0.2, 0.1, { rx: 1.0 }));
    anim.arms.push(armL, armR);
    anim.toolArm = armR;
  } else if (a === ARCHETYPE.RANGED) {
    // Needle-Strider: Snake tail and giant blades
    g.add(part(cylGeo(0.18, 0.08, 0.62, 7), org, 0, 0.3, -0.18, { rx: 0.5 }));
    const armL = pivotAt(-0.28, 0.84, 0.08);
    const armR = pivotAt(0.28, 0.84, 0.08);
    g.add(armL); g.add(armR);
    armL.add(part(coneGeo(0.09, 0.64, 4), glow, -0.08, 0.1, 0.15, { rx: -0.4, rz: -0.4 }));
    armR.add(part(coneGeo(0.09, 0.64, 4), glow, 0.08, 0.1, 0.15, { rx: -0.4, rz: 0.4 }));
    anim.arms.push(armL, armR);
    anim.toolArm = armR;
  }

  // Head and glowing eyes
  g.add(part(sphGeo(0.16, 7), cap, 0, 0.98, 0.12, { sz: 1.4 }));
  g.add(part(sphGeo(0.04, 5), glow, -0.08, 1.0, 0.24));
  g.add(part(sphGeo(0.04, 5), glow, 0.08, 1.0, 0.24));

  // Team flag banner
  g.add(part(cylGeo(0.02, 0.02, 0.6, 4), MAT.wood(), 0, 1.1, -0.2));
  g.add(part(boxGeo(0.02, 0.24, 0.38), team(hex, 'cloth'), 0, 1.3, -0.38));

  let height = 1.6;
  if (a === ARCHETYPE.WORKER) height = 1.5;
  else if (a === ARCHETYPE.MELEE) height = 1.5;
  else if (a === ARCHETYPE.RANGED) height = 1.85;

  g.userData.anim = anim;
  return { group: g, height };
}

function buildChaosDeepBuilding(type, hex) {
  const a = type.archetype;
  const g = new THREE.Group();
  g.name = type.id;

    const glow = MAT.acidGlow();

  let height = 3.5;

  // Fleshy organic base ring footprint
  g.add(part(torusGeo(type.radius * 0.85, 0.26, 12), cap, 0, 0.15, 0, { rx: Math.PI / 2 }));

  if (a === ARCHETYPE.HALL) {
    // Incubation Chamber: Large fleshy mountain with breathing cones
    g.add(part(sphGeo(type.radius * 0.75, 10), org, 0, type.radius * 0.4, 0, { sy: 0.7 }));
    g.add(part(coneGeo(type.radius * 0.26, type.radius * 0.9, 7), cap, 0, type.radius * 0.45, 0));
    g.add(part(cylGeo(0.18, 0.35, 0.8, 6), glow, -type.radius * 0.4, 0.5, 0.1, { rz: 0.4 }));
    g.add(part(cylGeo(0.18, 0.35, 0.8, 6), glow, type.radius * 0.4, 0.5, -0.1, { rz: -0.4 }));
    height = type.radius * 1.2;
  } else if (a === ARCHETYPE.BARRACKS) {
    // Gestational Pit: low sludge caldera filled with acid
    g.add(part(cylGeo(type.radius * 0.8, type.radius * 0.9, 0.4, 10), cap, 0, 0.2, 0));
    g.add(part(cylGeo(type.radius * 0.68, type.radius * 0.68, 0.1, 8), glow, 0, 0.36, 0));
    for (let i = 0; i < 3; i++) {
      const theta = (i * Math.PI * 2) / 3;
      g.add(part(torusGeo(type.radius * 0.5, 0.08, 8), MAT.bone(),
        Math.cos(theta) * type.radius * 0.4, 0.3, Math.sin(theta) * type.radius * 0.4,
        { ry: -theta, rx: 0.3 }));
    }
    height = 2.8;
  } else if (a === ARCHETYPE.SUPPLY) {
    // Floating sac over a tripod of bone claws
    for (let i = 0; i < 3; i++) {
      const theta = (i * Math.PI * 2) / 3;
      g.add(part(cylGeo(0.06, 0.04, 0.92, 5), MAT.bone(),
        Math.cos(theta) * 0.36, 0.46, Math.sin(theta) * 0.36,
        { rx: 0.35, ry: -theta }));
    }
    g.add(part(sphGeo(0.36, 8), org, 0, 0.92, 0, { sy: 1.3 }));
    g.add(part(sphGeo(0.24, 6), glow, 0, 0.92, 0));
    height = 3.2;
  } else {
    // Generic advanced spire
    g.add(part(coneGeo(type.radius * 0.5, type.radius * 1.5, 6), org, 0, type.radius * 0.75, 0));
    g.add(part(sphGeo(type.radius * 0.24, 6), glow, 0, type.radius * 1.35, 0));
    height = type.radius * 1.6;
  }

  // Small team colored banner
  g.add(part(cylGeo(0.02, 0.02, type.radius * 1.1, 4), MAT.wood(), 0, type.radius * 0.55, -type.radius * 0.6));
  g.add(part(boxGeo(0.02, 0.34, 0.58), team(hex, 'cloth'), 0, type.radius * 1.0, -type.radius * 0.86));

  return { group: g, height };
}

export function buildAetherSpireModel(colorHex) {
  const g = new THREE.Group();
  const c = new THREE.Color(colorHex);

  const baseMat = new THREE.MeshStandardMaterial({ color: 0x181c2b, roughness: 0.2, metalness: 0.9 });
  const glowMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 });

  // Base metallic pedestal
  g.add(part(cylGeo(0.35, 0.45, 0.8, 6), baseMat, 0, 0.4, 0));
  
  // Center vertical core spire
  g.add(part(cylGeo(0.08, 0.15, 3.4, 6), baseMat, 0, 2.1, 0));

  // Floating rings
  g.add(part(torusGeo(0.26, 0.05, 8), baseMat, 0, 1.4, 0, { rx: Math.PI / 2 }));
  g.add(part(torusGeo(0.18, 0.04, 8), baseMat, 0, 2.4, 0, { rx: Math.PI / 2 }));

  // Glowing core floating at the top
  const core = part(octaGeo(0.24), glowMat, 0, 4.0, 0);
  g.add(core);

  // Small auxiliary floating shards
  g.add(part(octaGeo(0.08), glowMat, 0.4, 1.8, 0.2));
  g.add(part(octaGeo(0.08), glowMat, -0.4, 2.6, -0.2));

  return g;
}

export function buildEnergyMonolithModel(colorHex) {
  const g = new THREE.Group();
  const c = new THREE.Color(colorHex);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x0c0e18, roughness: 0.7, metalness: 0.6 });
  const glowMat = new THREE.MeshBasicMaterial({ color: c });

  // Main tall monolith pillar
  g.add(part(boxGeo(0.7, 3.2, 0.7), stoneMat, 0, 1.6, 0, { ry: 0.3 }));
  // Glowing core slot inside the pillar
  g.add(part(boxGeo(0.72, 1.8, 0.1), glowMat, 0, 1.8, 0.32, { ry: 0.3 }));

  // Second smaller leaning monolith pillar
  g.add(part(boxGeo(0.5, 2.0, 0.5), stoneMat, -0.5, 1.0, 0.3, { rx: 0.15, rz: 0.2 }));
  g.add(part(boxGeo(0.52, 1.0, 0.08), glowMat, -0.4, 1.1, 0.45, { rx: 0.15, rz: 0.2 }));

  // Third small cluster stone
  g.add(part(boxGeo(0.4, 1.0, 0.4), stoneMat, 0.4, 0.5, -0.4, { rx: -0.2, rz: -0.1 }));

  return g;
}

export function buildVoidFissureModel(radius, colorHex) {
  const g = new THREE.Group();
  const c = new THREE.Color(colorHex);

  const rimMat = new THREE.MeshStandardMaterial({ color: 0x1f273d, roughness: 0.3, metalness: 0.8 });
  
  // Outer matrix rim
  g.add(part(torusGeo(radius, 0.2, 16), rimMat, 0, 0, 0, { rx: Math.PI / 2 }));

  // Glowing pool mesh (semi-transparent)
  const poolGeo = new THREE.CircleGeometry(radius - 0.1, 32);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({
    color: c,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide
  });
  g.add(new THREE.Mesh(poolGeo, poolMat));

  // Glowing energy core center
  const centerMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.7 });
  g.add(part(sphGeo(1.2, 8), centerMat, 0, 0.1, 0));

  return g;
}

export function disposeModelCache() {
  for (const g of _geoCache.values()) g.dispose();
  for (const m of _fixedMat.values()) m.dispose();
  for (const m of _teamMat.values()) m.dispose();
  for (const m of _treeMatCache.values()) m.dispose();
  for (const t of _assetTex.values()) t.dispose();
  _geoCache.clear();
  _fixedMat.clear();
  _teamMat.clear();
  _treeMatCache.clear();
  _assetTex.clear();
}
