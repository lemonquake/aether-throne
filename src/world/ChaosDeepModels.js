import * as THREE from 'three';
import { ARCHETYPE } from '../config/UnitTypes.js';
import {
  boxGeo,
  cylGeo,
  sphGeo,
  coneGeo,
  octaGeo,
  icoGeo,
  torusGeo,
  part,
  pivotAt,
  team,
  MAT,
  banner
} from './ModelFactory.js';

// ═════════════════════════════════════════════════════════════════════════════
// CHAOS DEEP UNITS (23 Unique Models)
// ═════════════════════════════════════════════════════════════════════════════

export function buildChaosUnit(type, colorHex) {
  const id = type.id;
  switch (id) {
    case 'CD_DREDGER': return buildDredger(type, colorHex);
    case 'CD_RIFTFIEND': return buildRiftFiend(type, colorHex);
    case 'CD_NEEDLESTRIDER': return buildNeedleStrider(type, colorHex);
    case 'CD_PLATEDMAULER': return buildPlatedMauler(type, colorHex);
    case 'CD_SPOREMANTA': return buildSporeManta(type, colorHex);
    case 'CD_IMPALER': return buildImpaler(type, colorHex);
    case 'CD_BILEVESSEL': return buildBileVessel(type, colorHex);
    case 'CD_DREADBEHEMOTH': return buildDreadBehemoth(type, colorHex);
    case 'CD_MIASMAWEAVER': return buildMiasmaWeaver(type, colorHex);
    case 'CD_PARASITICWEAVER': return buildParasiticWeaver(type, colorHex);
    case 'CD_MATRIARCH': return buildMatriarch(type, colorHex);
    case 'CD_BILEDART': return buildBileDart(type, colorHex);
    case 'CD_ABYSSALWATCHER': return buildAbyssalWatcher(type, colorHex);
    case 'CD_SPORELASHER': return buildSporeLasher(type, colorHex);
    case 'CD_BILECASTER': return buildBileCaster(type, colorHex);
    case 'CD_BROODCARRIER': return buildBroodCarrier(type, colorHex);
    case 'CD_SWARMMONARCH': return buildSwarmMonarch(type, colorHex);
    case 'CD_GRIPFIEND': return buildGripFiend(type, colorHex);
    case 'CD_PLAGUETHRALL': return buildPlagueThrall(type, colorHex);
    case 'CD_APEXTYRANT': return buildApexTyrant(type, colorHex);
    case 'CD_CHASMWORM': return buildChasmWorm(type, colorHex);
    case 'CD_SPORELING': return buildSporeling(type, colorHex);
    case 'CD_SWARMSENTINEL': return buildSwarmSentinel(type, colorHex);
    default: return buildDredger(type, colorHex);
  }
}

// Helper base setup for Chaos insectoids
function createChaosBase(hex, a, options = {}) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };

  const org = MAT.organic();
  const cap = MAT.carapace();
  const glow = MAT.acidGlow();

  // Left/Right insectoid leg pivots
  const hipY = 0.44;
  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.22, hipY, 0);
    leg.add(part(cylGeo(0.06, 0.05, 0.44, 5), cap, 0, -0.22, 0, { rx: 0.1 }));
    leg.add(part(coneGeo(0.05, 0.2, 4), MAT.bone(), 0, -0.44, 0.08, { rx: 0.4 })); // claw tip
    g.add(leg);
    anim.legs.push(leg);
  }

  // Fleshy body
  g.add(part(sphGeo(0.26, 8), org, 0, 0.68, 0, { sx: 1.1, sy: 1.3, sz: 1.1 }));
  
  // Head
  g.add(part(sphGeo(0.16, 7), cap, 0, 0.98, 0.12, { sz: 1.4 }));
  g.add(part(sphGeo(0.04, 5), glow, -0.08, 1.0, 0.24)); // eyes
  g.add(part(sphGeo(0.04, 5), glow, 0.08, 1.0, 0.24));

  // Small flag banner
  g.add(part(cylGeo(0.02, 0.02, 0.6, 4), MAT.wood(), 0, 1.1, -0.2));
  g.add(part(boxGeo(0.02, 0.24, 0.38), team(hex, 'cloth'), 0, 1.3, -0.38));

  return { g, anim, org, cap, glow, hipY };
}

// 1. CD_DREDGER (Larval Dredger worker)
function buildDredger(type, hex) {
  const base = createChaosBase(hex, ARCHETYPE.WORKER);
  // Pincers on shoulders
  const armL = pivotAt(-0.25, 0.76, 0.08);
  const armR = pivotAt(0.25, 0.76, 0.08);
  armL.add(part(coneGeo(0.06, 0.4, 4), base.glow, -0.05, -0.16, 0.15, { rx: 0.8, ry: -0.3 }));
  armR.add(part(coneGeo(0.06, 0.4, 4), base.glow, 0.05, -0.16, 0.15, { rx: 0.8, ry: 0.3 }));
  base.g.add(armL); base.g.add(armR);
  
  base.anim.arms.push(armL, armR);
  base.anim.toolArm = armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 1.5 };
}

// 2. CD_RIFTFIEND (Rift-Fiend melee)
function buildRiftFiend(type, hex) {
  const base = createChaosBase(hex, ARCHETYPE.MELEE);
  // Spiked tail
  base.g.add(part(coneGeo(0.05, 0.38, 4), base.cap, 0, 0.68, -0.32, { rx: -1.3 }));
  
  const armL = pivotAt(-0.25, 0.76, 0.12);
  const armR = pivotAt(0.25, 0.76, 0.12);
  armL.add(part(coneGeo(0.07, 0.5, 4), base.cap, 0, -0.2, 0.1, { rx: 1.0 }));
  armR.add(part(coneGeo(0.07, 0.5, 4), base.cap, 0, -0.2, 0.1, { rx: 1.0 }));
  base.g.add(armL); base.g.add(armR);
  
  base.anim.arms.push(armL, armR);
  base.anim.toolArm = armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 1.5 };
}

// 3. CD_NEEDLESTRIDER (Needle-Strider ranged)
function buildNeedleStrider(type, hex) {
  const base = createChaosBase(hex, ARCHETYPE.RANGED);
  // Slender spine body
  base.g.add(part(cylGeo(0.18, 0.08, 0.62, 7), base.org, 0, 0.3, -0.18, { rx: 0.5 }));
  
  const armL = pivotAt(-0.28, 0.84, 0.08);
  const armR = pivotAt(0.28, 0.84, 0.08);
  armL.add(part(coneGeo(0.09, 0.64, 4), base.glow, -0.08, 0.1, 0.15, { rx: -0.4, rz: -0.4 }));
  armR.add(part(coneGeo(0.09, 0.64, 4), base.glow, 0.08, 0.1, 0.15, { rx: -0.4, rz: 0.4 }));
  base.g.add(armL); base.g.add(armR);
  
  base.anim.arms.push(armL, armR);
  base.anim.toolArm = base.armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 1.85 };
}

// 4. CD_PLATEDMAULER (Plated Mauler)
function buildPlatedMauler(type, hex) {
  const base = createChaosBase(hex, ARCHETYPE.MELEE);
  // Heavy carapace shield plate over the head
  base.g.add(part(sphGeo(0.24, 8), base.cap, 0, 1.15, 0.22, { sy: 0.5, sz: 1.2 }));
  // Pointed horn
  base.g.add(part(coneGeo(0.05, 0.3, 4), MAT.bone(), 0, 1.2, 0.48, { rx: 0.6 }));
  
  const armL = pivotAt(-0.28, 0.72, 0.1);
  const armR = pivotAt(0.28, 0.72, 0.1);
  armL.add(part(coneGeo(0.08, 0.4, 4), base.cap, 0, -0.18, 0.1));
  armR.add(part(coneGeo(0.08, 0.4, 4), base.cap, 0, -0.18, 0.1));
  base.g.add(armL); base.g.add(armR);

  base.anim.arms.push(armL, armR);
  base.anim.toolArm = armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 1.6 };
}

// 5. CD_SPOREMANTA (Flying manta ray)
function buildSporeManta(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const org = MAT.organic();
  const glow = MAT.acidGlow();

  // Manta flat disk body
  g.add(part(sphGeo(0.38, 8), org, 0, 0, 0, { sy: 0.3, sz: 1.4 }));
  
  // Left/Right fleshy wing panels
  const wingL = pivotAt(-0.35, 0.02, 0);
  wingL.add(part(boxGeo(0.72, 0.02, 0.65), org, -0.36, 0, 0));
  const wingR = pivotAt(0.35, 0.02, 0);
  wingR.add(part(boxGeo(0.72, 0.02, 0.65), org, 0.36, 0, 0));
  g.add(wingL); g.add(wingR);

  // Spore sacks on wings
  wingL.add(part(sphGeo(0.12, 6), glow, -0.3, 0.05, 0));
  wingR.add(part(sphGeo(0.12, 6), glow, 0.3, 0.05, 0));

  // Tentacle tails
  g.add(part(cylGeo(0.02, 0.04, 0.85, 4), org, 0, -0.05, -0.68, { rx: -0.6 }));

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    // Hovering
    g.position.y = 1.35 + Math.sin(now * 3.8) * 0.14;
    const flap = Math.sin(now * 9.0) * 0.28;
    wingL.rotation.z = -flap;
    wingR.rotation.z = flap;
  };

  return { group: g, height: 1.45 };
}

// 6. CD_IMPALER (Spine Impaler)
function buildImpaler(type, hex) {
  const base = createChaosBase(hex, ARCHETYPE.RANGED);
  // Giant spine launcher cage on its back
  const cage = part(cylGeo(0.12, 0.16, 0.58, 6), base.cap, 0, 0.85, -0.22, { rx: 0.4 });
  cage.add(part(coneGeo(0.04, 0.36, 4), MAT.bone(), 0, 0.3, 0.1, { rx: 0.2 })); // backing spike
  base.g.add(cage);
  
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 1.7 };
}

// 7. CD_BILEVESSEL (Bloated toxic sac)
function buildBileVessel(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const org = MAT.organic();
  const glow = MAT.acidGlow();

  // 4 slug-like stubby leg nodes
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.38;
    const leg = pivotAt(Math.cos(a) * 0.18, 0.2, Math.sin(a) * 0.18);
    leg.add(part(sphGeo(0.1, 6), org, 0, -0.1, 0));
    g.add(leg);
    anim.legs.push(leg);
  }

  // Giant bloated green sphere torso
  const sac = part(sphGeo(0.44, 10), glow, 0, 0.65, 0, { sx: 1.25, sz: 1.15 });
  g.add(sac);

  // Writhing mouth tubes at front
  g.add(part(cylGeo(0.06, 0.08, 0.2, 5), org, 0, 0.5, 0.44, { rx: Math.PI / 2 }));

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    // Pulse sac size
    sac.scale.setScalar(1.0 + Math.sin(now * 15.0) * 0.07);
  };

  return { group: g, height: 1.15 };
}

// 8. CD_DREADBEHEMOTH (Giant beetle behemoth)
function buildDreadBehemoth(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const org = MAT.organic();
  const cap = MAT.carapace();
  const sc = 1.4;

  // 6 giant claw legs
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.52;
    const leg = pivotAt(Math.cos(a) * 0.32 * sc, 0.55 * sc, Math.sin(a) * 0.32 * sc);
    leg.add(part(cylGeo(0.1, 0.08, 0.65 * sc, 5), cap, 0, -0.32, 0, { rx: Math.sin(a) * 0.4, rz: -Math.cos(a) * 0.4 }));
    g.add(leg);
    anim.legs.push(leg);
  }

  // Giant heavy beetle carapace hull
  g.add(part(sphGeo(0.58 * sc, 10), cap, 0, 0.85 * sc, 0, { sx: 1.15, sz: 1.35 }));
  g.add(part(sphGeo(0.48 * sc, 8), org, 0, 0.72 * sc, 0)); // fleshy soft belly

  // Massive scissor mandibles at front
  const pincerL = pivotAt(-0.25 * sc, 0.9 * sc, 0.62 * sc);
  pincerL.add(part(coneGeo(0.08 * sc, 0.58 * sc, 4), MAT.bone(), 0.08, 0, 0.28, { ry: 0.45 }));
  const pincerR = pivotAt(0.25 * sc, 0.9 * sc, 0.62 * sc);
  pincerR.add(part(coneGeo(0.08 * sc, 0.58 * sc, 4), MAT.bone(), -0.08, 0, 0.28, { ry: -0.45 }));
  g.add(pincerL); g.add(pincerR);

  anim.toolArm = pincerR;
  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    // Snap pincers on attack
    const snap = unit._attackAnim < 1 ? Math.sin(unit._attackAnim * Math.PI) : 0;
    pincerL.rotation.y = snap * 0.8;
    pincerR.rotation.y = -snap * 0.8;
  };

  return { group: g, height: 2.2 };
}

// 9. CD_MIASMAWEAVER (Miasma-Weaver)
function buildMiasmaWeaver(type, hex) {
  const base = createChaosBase(hex, ARCHETYPE.RANGED);
  
  // Toxic staff
  const staff = new THREE.Group();
  staff.add(part(cylGeo(0.02, 0.02, 1.2, 5), MAT.wood(), 0, 0, 0));
  staff.add(part(sphGeo(0.12, 6), base.glow, 0, 0.65, 0)); // toxic bubble staff head
  staff.position.set(0.02, -0.22, 0.18);

  const armL = pivotAt(-0.25, 0.78, 0.08);
  armL.add(part(cylGeo(0.04, 0.04, 0.44, 5), base.org, 0, -0.22, 0));

  const armR = pivotAt(0.25, 0.78, 0.08);
  armR.add(part(cylGeo(0.04, 0.04, 0.44, 5), base.org, 0, -0.22, 0));
  armR.add(staff);

  base.g.add(armL); base.g.add(armR);
  base.anim.arms.push(armL, armR);
  base.anim.toolArm = armR;

  base.g.userData.anim = base.anim;
  return { group: base.g, height: 1.6 };
}

// 10. CD_PARASITICWEAVER (Parasitic Weaver)
function buildParasiticWeaver(type, hex) {
  const base = createChaosBase(hex, ARCHETYPE.RANGED);
  // Slithering tail instead of normal legs (stretches Z)
  base.g.add(part(cylGeo(0.15, 0.04, 0.88, 6), base.org, 0, 0.22, -0.36, { rx: 0.35 }));
  
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 1.55 };
}

// 11. CD_MATRIARCH (Brood mother with egg pipes)
function buildMatriarch(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const org = MAT.organic();
  const cap = MAT.carapace();
  const glow = MAT.acidGlow();

  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.18, 0.48, 0);
    leg.add(part(cylGeo(0.07, 0.06, 0.52, 5), cap, 0, -0.25, 0));
    g.add(leg);
    anim.legs.push(leg);
  }

  g.add(part(sphGeo(0.3, 8), org, 0, 0.78, 0));
  
  // Huge egg sac on back
  const sac = part(sphGeo(0.48, 10), glow, 0, 0.85, -0.32, { sx: 1.1, sy: 0.9, sz: 1.4 });
  g.add(sac);

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    sac.scale.setScalar(0.96 + Math.sin(now * 5.0) * 0.05);
  };

  return { group: g, height: 1.6 };
}

// 12. CD_BILEDART (Fast wasp beetle)
function buildBileDart(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const cap = MAT.carapace();
  const glow = MAT.acidGlow();

  g.add(part(sphGeo(0.2, 8), cap, 0, 0.25, 0, { sz: 1.35 })); // wasp body
  
  // Flying wings
  const wingL = pivotAt(-0.16, 0.32, 0.05);
  wingL.add(part(boxGeo(0.48, 0.01, 0.22), glow, -0.24, 0, 0));
  const wingR = pivotAt(0.16, 0.32, 0.05);
  wingR.add(part(boxGeo(0.48, 0.01, 0.22), glow, 0.24, 0, 0));
  g.add(wingL); g.add(wingR);

  // Long glowing stinger
  g.add(part(coneGeo(0.04, 0.38, 4), glow, 0, 0.22, -0.68, { rx: -1.35 }));

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    g.position.y = 0.95 + Math.sin(now * 4.5) * 0.12;
    const flap = Math.sin(now * 16.0) * 0.35;
    wingL.rotation.z = -flap;
    wingR.rotation.z = flap;
  };

  return { group: g, height: 1.15 };
}

// 13. CD_ABYSSALWATCHER (Giant floating eye tentacle)
function buildAbyssalWatcher(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const cap = MAT.carapace();
  const glow = team(hex, 'core');

  // Giant central eyeball sphere
  const eye = part(sphGeo(0.38, 10), MAT.organic(), 0, 0, 0);
  g.add(eye);
  
  // Glowing lens iris
  eye.add(part(cylGeo(0.14, 0.14, 0.04, 8), glow, 0, 0, 0.36, { rx: Math.PI / 2 }));
  eye.add(part(cylGeo(0.06, 0.06, 0.05, 8), cap, 0, 0, 0.38, { rx: Math.PI / 2 })); // pupil

  // 4 writhing tentacles hanging down
  const tentacles = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const tent = pivotAt(Math.cos(a) * 0.18, -0.15, Math.sin(a) * 0.18);
    tent.add(part(cylGeo(0.035, 0.02, 0.58, 5), MAT.organic(), 0, -0.28, 0, { rx: Math.sin(a) * 0.2 }));
    g.add(tent);
    tentacles.push(tent);
  }

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    // Hover altitude bobbing
    g.position.y = 1.05 + Math.sin(now * 2.8) * 0.15;
    // Writhe tentacles
    tentacles.forEach((t, idx) => {
      t.rotation.z = Math.sin(now * 3.2 + idx) * 0.28;
      t.rotation.x = Math.cos(now * 2.8 + idx) * 0.28;
    });
  };

  return { group: g, height: 1.48 };
}

// 14. CD_SPORELASHER (Floating spore with whip legs)
function buildSporeLasher(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const org = MAT.organic();
  const glow = MAT.acidGlow();

  // Floating spore sac dome
  g.add(part(sphGeo(0.3, 8), org, 0, 0, 0, { sy: 1.25 }));
  
  // Glowing spore grates
  g.add(part(sphGeo(0.2, 6), glow, 0, 0.1, 0));

  // Whip tentacles
  const whips = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const whip = pivotAt(Math.cos(a) * 0.14, -0.22, Math.sin(a) * 0.14);
    whip.add(part(cylGeo(0.025, 0.015, 0.72, 4), org, 0, -0.35, 0));
    g.add(whip);
    whips.push(whip);
  }

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    g.position.y = 1.1 + Math.sin(now * 3.4) * 0.12;
    whips.forEach((w, idx) => {
      w.rotation.z = Math.sin(now * 4.2 + idx) * 0.35;
    });
  };

  return { group: g, height: 1.4 };
}

// 15. CD_BILECASTER (Acid spitting slug)
function buildBileCaster(type, hex) {
  const base = createChaosBase(hex, ARCHETYPE.RANGED);
  // Glowing acid nozzle tubes on shoulders
  base.g.add(part(cylGeo(0.06, 0.08, 0.38, 6), base.glow, -0.24, 0.85, 0.14, { rx: 0.6 }));
  base.g.add(part(cylGeo(0.06, 0.08, 0.38, 6), base.glow, 0.24, 0.85, 0.14, { rx: 0.6 }));
  
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 1.6 };
}

// 16. CD_BROODCARRIER (Fleshy brood carrier)
function buildBroodCarrier(type, hex) {
  const base = createChaosBase(hex, ARCHETYPE.MELEE);
  // Nest-like opening on its back
  base.g.add(part(torusGeo(0.24, 0.05, 8), base.cap, 0, 0.88, -0.15, { rx: Math.PI / 2 }));
  return { group: base.g, height: 1.5 };
}

// 17. CD_SWARMMONARCH (Hovering insect monarch)
function buildSwarmMonarch(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const cap = MAT.carapace();
  const glow = team(hex, 'core');

  // Slender body, crown crest head
  g.add(part(sphGeo(0.28, 8), MAT.organic(), 0, 0.6, 0, { sy: 1.4 }));
  g.add(part(sphGeo(0.15, 8), cap, 0, 1.15, 0.05));
  g.add(part(coneGeo(0.06, 0.3, 5), MAT.bone(), 0, 1.34, 0.05)); // crown spike

  // Glider crystal wings
  const wingL = pivotAt(-0.2, 0.85, 0.02);
  wingL.add(part(boxGeo(0.68, 0.015, 0.32), glow, -0.32, 0, 0, { rz: -0.1 }));
  const wingR = pivotAt(0.2, 0.85, 0.02);
  wingR.add(part(boxGeo(0.68, 0.015, 0.32), glow, 0.32, 0, 0, { rz: 0.1 }));
  g.add(wingL); g.add(wingR);

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    g.position.y = 1.35 + Math.sin(now * 3.8) * 0.12;
    const flap = Math.sin(now * 15.0) * 0.28;
    wingL.rotation.z = -flap;
    wingR.rotation.z = flap;
  };

  return { group: g, height: 1.7 };
}

// 18. CD_GRIPFIEND (Web spider)
function buildGripFiend(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const cap = MAT.carapace();
  const org = MAT.organic();

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.52;
    const leg = pivotAt(Math.cos(a) * 0.22, 0.42, Math.sin(a) * 0.22);
    leg.add(part(cylGeo(0.045, 0.045, 0.48, 6), cap, 0, -0.24, 0, { rx: Math.sin(a) * 0.4, rz: -Math.cos(a) * 0.4 }));
    g.add(leg);
    anim.legs.push(leg);
  }
  g.add(part(sphGeo(0.34, 8), cap, 0, 0.55, 0, { sy: 0.8, sz: 1.2 }));

  // Spitting web tubes
  g.add(part(cylGeo(0.05, 0.07, 0.2, 5), org, 0, 0.48, 0.42, { rx: Math.PI / 2 }));

  g.userData.anim = anim;
  return { group: g, height: 1.1 };
}

// 19. CD_PLAGUETHRALL (Zombie insect thrall)
function buildPlagueThrall(type, hex) {
  const base = createChaosBase(hex, ARCHETYPE.WORKER);
  // Slouched hunched spine
  base.g.rotation.x = 0.25;
  return { group: base.g, height: 1.4 };
}

// 20. CD_APEXTYRANT (Scythe monster predator)
function buildApexTyrant(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const cap = MAT.carapace();
  const org = MAT.organic();
  const sc = 1.35;

  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.22 * sc, 0.55 * sc, 0);
    leg.add(part(cylGeo(0.09, 0.11, 0.58, 6), cap, 0, -0.29, 0));
    g.add(leg);
    anim.legs.push(leg);
  }

  // Giant dinosaur posture body
  g.add(part(sphGeo(0.4 * sc, 8), org, 0, 0.88 * sc, 0, { sx: 1.1, sy: 1.35, sz: 1.2 }));
  g.add(part(coneGeo(0.06 * sc, 0.65 * sc, 4), cap, 0, 0.82 * sc, -0.42 * sc, { rx: -1.35 })); // tail

  // Long scythe arms
  const armL = pivotAt(-0.35 * sc, 1.15 * sc, 0.12);
  armL.add(part(cylGeo(0.06, 0.06, 0.48, 5), cap, 0, -0.24, 0));
  armL.add(part(coneGeo(0.08, 0.65, 4), MAT.bone(), 0, -0.35 * sc, 0.18, { rx: 1.25 }));

  const armR = pivotAt(0.35 * sc, 1.15 * sc, 0.12);
  armR.add(part(cylGeo(0.06, 0.06, 0.48, 5), cap, 0, -0.24, 0));
  armR.add(part(coneGeo(0.08, 0.65, 4), MAT.bone(), 0, -0.35 * sc, 0.18, { rx: 1.25 }));

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  return { group: g, height: 2.1 };
}

// 21. CD_CHASMWORM (Burrowing giant worm)
function buildChasmWorm(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const org = MAT.organic();
  const cap = MAT.carapace();

  // Stacked segments wiggling vertical
  const segments = [];
  for (let i = 0; i < 4; i++) {
    const seg = part(cylGeo(0.24 - i * 0.04, 0.28 - i * 0.04, 0.38, 8), org, 0, 0.19 + i * 0.35, 0);
    g.add(seg);
    segments.push(seg);
  }

  // Toothy maw at the top
  const mouth = part(torusGeo(0.18, 0.05, 8), cap, 0, 1.55, 0, { rx: Math.PI / 2 });
  g.add(mouth);

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    // Wiggle segments like a worm burrowing
    segments.forEach((seg, idx) => {
      seg.rotation.z = Math.sin(now * 3.5 + idx * 0.8) * 0.14;
      seg.rotation.x = Math.cos(now * 2.8 + idx * 0.8) * 0.14;
    });
    mouth.position.y = 1.55 + Math.sin(now * 3.5) * 0.05;
  };

  return { group: g, height: 1.85 };
}

// 22. CD_SPORELING (Tiny cute mushroom walker)
function buildSporeling(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const org = MAT.organic();
  const cap = team(hex, 'cloth'); // team colored mushroom cap

  // Stubby legs
  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.1, 0.28, 0);
    leg.add(part(cylGeo(0.04, 0.04, 0.3, 5), org, 0, -0.15, 0));
    g.add(leg);
    anim.legs.push(leg);
  }

  // Stem body
  g.add(part(cylGeo(0.14, 0.16, 0.5, 6), org, 0, 0.45, 0));
  
  // Large mushroom cap
  g.add(part(sphGeo(0.26, 8), cap, 0, 0.7, 0, { sy: 0.6 }));

  g.userData.anim = anim;
  return { group: g, height: 0.95 };
}

// 23. CD_SWARMSENTINEL (Mantis sentinel)
function buildSwarmSentinel(type, hex) {
  const base = createChaosBase(hex, ARCHETYPE.RANGED);
  // Standing mantis spikes
  const armR = pivotAt(0.25, 0.84, 0.12);
  armR.add(part(coneGeo(0.06, 0.5, 4), MAT.bone(), 0, -0.22, 0.18, { rx: 1.1 }));
  base.g.add(armR);
  
  base.anim.arms.push(armR);
  base.anim.toolArm = armR;
  base.g.userData.anim = base.anim;
  return { group: base.g, height: 1.7 };
}

// ═════════════════════════════════════════════════════════════════════════════
// CHAOS DEEP BUILDINGS (23 Unique Models)
// ═════════════════════════════════════════════════════════════════════════════

export function buildChaosBuilding(type, colorHex) {
  const g = new THREE.Group();
  const id = type.id;
  const R = type.radius;

  const org = MAT.organic();
  const cap = MAT.carapace();
  const glow = MAT.acidGlow();
  const bannerTeam = team(colorHex, 'cloth');

  let height = 3.5;

  // Base fleshy ring footprint
  g.add(part(torusGeo(R * 0.85, 0.22, 12), cap, 0, 0.15, 0, { rx: Math.PI / 2 }));

  if (id === 'CD_INCUBATOR') {
    // Incubator Level 1 Hall: Large flesh dome, breathing cones
    g.add(part(sphGeo(R * 0.75, 10), org, 0, R * 0.38, 0, { sy: 0.7 }));
    g.add(part(coneGeo(R * 0.28, R * 0.88, 7), cap, 0, R * 0.44, 0));
    
    // Breathing chimneys
    g.add(part(cylGeo(0.18, 0.32, 0.85, 6), glow, -R * 0.4, 0.5, 0.1, { rz: 0.4 }));
    g.add(part(cylGeo(0.18, 0.32, 0.85, 6), glow, R * 0.4, 0.5, -0.1, { rz: -0.4 }));
    height = R * 1.25;
  }
  else if (id === 'CD_GROWTHCITADEL') {
    // Growth Citadel Level 2 Hall: Pulsing central core
    const w = R * 1.5;
    g.add(part(sphGeo(w * 0.65, 10), org, 0, w * 0.45, 0));
    
    const core = part(sphGeo(w * 0.34, 8), glow, 0, w * 0.45, 0);
    core.name = 'core';
    core.userData = { baseY: w * 0.45 };
    g.add(core);
    height = w * 1.3;
  }
  else if (id === 'CD_BROODTHRONE') {
    // Brood Throne Level 3 Hall: Huge shell layers
    const w = R * 1.6;
    g.add(part(sphGeo(w * 0.72, 10), org, 0, w * 0.5, 0));
    g.add(part(torusGeo(w * 0.68, 0.15, 10), cap, 0, w * 0.65, 0, { rx: Math.PI / 2 }));
    height = w * 1.4;
  }
  else if (id === 'CD_GESTATIONPIT') {
    // Gestation Pit (Barracks Level 1): caldera sludge filled with acid
    g.add(part(cylGeo(R * 0.8, R * 0.9, 0.4, 10), cap, 0, 0.2, 0));
    g.add(part(cylGeo(R * 0.68, R * 0.68, 0.1, 8), glow, 0, 0.36, 0));
    height = 1.6;
  }
  else if (id === 'CD_SPORESACK') {
    // Spore-Sack (Supply Level 1): Floating sac on tripod bones
    for (let i = 0; i < 3; i++) {
      const theta = (i * Math.PI * 2) / 3;
      g.add(part(cylGeo(0.06, 0.04, 0.95, 5), MAT.bone(),
        Math.cos(theta) * 0.38, 0.46, Math.sin(theta) * 0.38,
        { rx: 0.35, ry: -theta }));
    }
    g.add(part(sphGeo(0.36, 8), org, 0, 0.95, 0, { sy: 1.35 }));
    
    const core = part(sphGeo(0.24, 6), glow, 0, 0.95, 0);
    core.name = 'core';
    core.userData = { baseY: 0.95 };
    g.add(core);
    height = 3.3;
  }
  else if (id === 'CD_ADAPTATIONVAULT') {
    // Adaptation Vault
    const w = R * 1.5;
    g.add(part(sphGeo(w * 0.55, 8), org, 0, 0.55, 0));
    return { group: g, height: 1.85 };
  }
  else if (id === 'CD_SPORESENTRY') {
    // Spore Sentry: acid projectile spitter tower
    g.add(part(cylGeo(0.26, 0.38, 3.4, 6), cap, 0, 1.7, 0));
    g.add(part(sphGeo(0.35, 8), org, 0, 3.4, 0));
    g.add(part(cylGeo(0.12, 0.15, 0.48, 6), glow, 0, 3.6, 0.16, { rx: Math.PI / 2 })); // spitter nozzle
    height = 4.2;
  }
  else if (id === 'CD_IMPALINGSINE') {
    // Impaling Spine tower: long bone spire
    g.add(part(coneGeo(0.28, 4.2, 5), MAT.bone(), 0, 2.1, 0));
    height = 4.2;
  }
  else if (id === 'CD_MAULERWARREN') {
    // Mauler Warren barracks
    const w = R * 1.5;
    g.add(part(sphGeo(w * 0.55, 8), org, 0, 0.55, 0));
    g.add(part(boxGeo(0.45, 0.55, 0.12), cap, 0, 0.28, w * 0.52)); // entrance shell
    return { group: g, height: 2.1 };
  }
  else if (id === 'CD_STRIDERDEN') {
    // Strider Den
    const w = R * 1.5;
    g.add(part(boxGeo(w, 1.4, w), org, 0, 0.7, 0));
    return { group: g, height: 2.2 };
  }
  else if (id === 'CD_IMPALERDEN') {
    // Impaler Den
    const w = R * 1.5;
    g.add(part(boxGeo(w, 1.6, w), org, 0, 0.8, 0));
    return { group: g, height: 2.4 };
  }
  else if (id === 'CD_GLIDERMOUND') {
    // Glider Mound Hangar
    const w = R * 1.6;
    g.add(part(cylGeo(w * 0.75, w * 0.85, 0.55, 10), cap, 0, 0.275, 0));
    return { group: g, height: 2.1 };
  }
  else if (id === 'CD_MONARCHMOUND') {
    // Monarch Mound Hall
    const w = R * 1.6;
    g.add(part(sphGeo(w * 0.65, 8), org, 0, 0.65, 0));
    return { group: g, height: 2.3 };
  }
  else if (id === 'CD_DREADCAVERN') {
    // Dread Cavern: huge ribbed ribcage bones covering a glowing pit
    const w = R * 1.6;
    g.add(part(cylGeo(w * 0.75, w * 0.85, 0.4, 8), cap, 0, 0.2, 0));
    
    // Rib bone arches
    for (let i = 0; i < 4; i++) {
      const theta = (i * Math.PI) / 3;
      g.add(part(torusGeo(w * 0.62, 0.08, 10), MAT.bone(), 0, 0.5, 0, { ry: theta, rx: Math.PI / 2 }));
    }
    return { group: g, height: 2.3 };
  }
  else if (id === 'CD_PLAGUEPOOL') {
    // Plague Pool: green bubbling sludge
    const w = R * 1.5;
    g.add(part(cylGeo(w * 0.65, w * 0.75, 0.5, 8), cap, 0, 0.25, 0));
    g.add(part(cylGeo(w * 0.58, w * 0.58, 0.05, 8), glow, 0, 0.48, 0));
    return { group: g, height: 0.65 };
  }
  else if (id === 'CD_BURSTERNEST') {
    // Burster Nest
    const w = R * 1.4;
    g.add(part(sphGeo(w * 0.52, 8), org, 0, 0.52, 0));
    return { group: g, height: 2.1 };
  }
  else if (id === 'CD_BIOMASSNODULE') {
    // Biomass Nodule
    const w = R * 1.5;
    g.add(part(boxGeo(w, 0.8, w), org, 0, 0.4, 0));
    return { group: g, height: 1.5 };
  }
  else if (id === 'CD_RIFTNETWORK') {
    // Rift Network
    const w = R * 1.5;
    g.add(part(boxGeo(w, 1.4, w), org, 0, 0.7, 0));
    return { group: g, height: 2.2 };
  }
  else if (id === 'CD_PLAGUECHAMBER') {
    // Plague Chamber
    const w = R * 1.6;
    g.add(part(boxGeo(w, 1.6, w), org, 0, 0.8, 0));
    return { group: g, height: 2.4 };
  }
  else if (id === 'CD_MATRIARCHNEST') {
    // Matriarch Nest
    const w = R * 1.5;
    g.add(part(boxGeo(w, 1.4, w), org, 0, 0.7, 0));
    return { group: g, height: 2.2 };
  }
  else if (id === 'CD_SIPHONINGNODE') {
    // Siphoning Node scepter
    g.add(part(cylGeo(0.08, 0.12, 3.4, 6), cap, 0, 1.7, 0));
    g.add(part(sphGeo(0.24, 6), glow, 0, 3.4, 0));
    height = 4.0;
  }
  else if (id === 'CD_MUTAGENICSANCTUM') {
    // Mutagenic Sanctum pulsing chamber
    const w = R * 1.6;
    g.add(part(cylGeo(w * 0.72, w * 0.82, 1.2, 10), cap, 0, 0.6, 0));
    
    const core = part(sphGeo(w * 0.44, 8), glow, 0, 1.2, 0);
    core.name = 'core';
    core.userData = { baseY: 1.2 };
    g.add(core);
    height = 2.4;
  }
  else if (id === 'CD_CAUSTICNEST') {
    // Caustic Nest
    const w = R * 1.5;
    g.add(part(boxGeo(w, 1.4, w), org, 0, 0.7, 0));
    return { group: g, height: 2.2 };
  }

  // Small team colored flag
  g.add(part(cylGeo(0.02, 0.02, R * 1.1, 4), MAT.wood(), 0, R * 0.55, -R * 0.6));
  g.add(part(boxGeo(0.02, 0.34, 0.58), bannerTeam, 0, R * 1.0, -R * 0.86));

  g.name = type.id;
  return { group: g, height };
}
