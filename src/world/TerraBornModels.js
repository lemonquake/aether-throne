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
// TERRA BORN UNITS (23 Unique Models)
// ═════════════════════════════════════════════════════════════════════════════

export function buildTerraUnit(type, colorHex) {
  const id = type.id;
  switch (id) {
    case 'TB_GOLEMLING': return buildGolemling(type, colorHex);
    case 'TB_BRUTE': return buildBrute(type, colorHex);
    case 'TB_SHARDCASTER': return buildShardcaster(type, colorHex);
    case 'TB_STONE_CRUSHER': return buildStoneCrusher(type, colorHex);
    case 'TB_OBSIDIAN_SHARD': return buildObsidianShard(type, colorHex);
    case 'TB_MUD_ELEMENTAL': return buildMudElemental(type, colorHex);
    case 'TB_GRAVEL_HURLER': return buildGravelHurler(type, colorHex);
    case 'TB_TREMOR_BEAST': return buildTremorBeast(type, colorHex);
    case 'TB_MOUNTAIN_GIANT': return buildMountainGiant(type, colorHex);
    case 'TB_CRYSTAL_HEALER': return buildCrystalHealer(type, colorHex);
    case 'TB_GEODE_LURKER': return buildGeodeLurker(type, colorHex);
    case 'TB_LAVA_SPITTER': return buildLavaSpitter(type, colorHex);
    case 'TB_BOULDER_HURLER': return buildBoulderHurler(type, colorHex);
    case 'TB_GRANITE_SHIELD': return buildGraniteShield(type, colorHex);
    case 'TB_IRONSTONE_GARGOYLE': return buildGargoyle(type, colorHex);
    case 'TB_SAND_WEAVER': return buildSandWeaver(type, colorHex);
    case 'TB_CORE_GUARDIAN': return buildCoreGuardian(type, colorHex);
    case 'TB_EARTHSHAKER': return buildEarthshaker(type, colorHex);
    case 'TB_MAGMA_LORD': return buildMagmaLord(type, colorHex);
    case 'TB_DUST_SPRITE': return buildDustSprite(type, colorHex);
    case 'TB_STALAGMITE_SENTINEL': return buildStalagSentinel(type, colorHex);
    case 'TB_AETHER_GOLEM': return buildAetherGolem(type, colorHex);
    case 'TB_TERRA_ARCHON': return buildTerraArchon(type, colorHex);
    default: return buildGolemling(type, colorHex);
  }
}

// 1. TB_GOLEMLING (Golemling worker)
function buildGolemling(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const rock = MAT.basalt();
  const lite = MAT.basaltLite();
  const sc = 0.8;

  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.16 * sc, 0.4 * sc, 0);
    leg.add(part(boxGeo(0.2, 0.4, 0.2), rock, 0, -0.2 * sc, 0, { sx: sc, sy: sc, sz: sc }));
    g.add(leg);
    anim.legs.push(leg);
  }
  g.add(part(icoGeo(0.35, 0), rock, 0, 0.72 * sc, 0));
  g.add(part(octaGeo(0.1), team(hex, 'core'), 0, 0.78 * sc, 0.28 * sc)); // tiny core chest
  
  // Chisel head
  g.add(part(icoGeo(0.18, 0), lite, 0, 1.1 * sc, 0.02));
  
  const armL = pivotAt(-0.4 * sc, 0.85 * sc, 0);
  armL.add(part(icoGeo(0.14, 0), lite, 0, 0, 0));
  
  const armR = pivotAt(0.4 * sc, 0.85 * sc, 0);
  armR.add(part(icoGeo(0.14, 0), lite, 0, 0, 0));
  armR.add(part(coneGeo(0.08, 0.32, 6), lite, 0, -0.16 * sc, 0.16, { rx: 1.4 })); // chisel
  
  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;
  
  g.userData.anim = anim;
  return { group: g, height: 1.25 };
}

// 2. TB_BRUTE (Basalt Brute melee)
function buildBrute(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const rock = MAT.basalt();
  const lite = MAT.basaltLite();
  const sc = 1.25;

  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.2 * sc, 0.5 * sc, 0);
    leg.add(part(boxGeo(0.24, 0.5, 0.26), rock, 0, -0.25 * sc, 0, { sx: sc, sy: sc, sz: sc }));
    g.add(leg);
    anim.legs.push(leg);
  }
  g.add(part(icoGeo(0.42, 0), rock, 0, 0.85 * sc, 0, { sx: sc * 1.05, sy: sc, sz: sc * 0.95 }));
  g.add(part(boxGeo(0.5, 0.05, 0.05), MAT.lava(), 0, 0.9 * sc, 0.34 * sc, { rz: 0.4 }));
  g.add(part(octaGeo(0.13), team(hex, 'core'), 0, 0.92 * sc, 0.36 * sc));
  
  g.add(part(icoGeo(0.22, 0), lite, 0, 1.28 * sc, 0.02));
  g.add(part(sphGeo(0.04, 6), MAT.lava(), -0.09, 1.3 * sc, 0.18));
  g.add(part(sphGeo(0.04, 6), MAT.lava(), 0.09, 1.3 * sc, 0.18));

  const armL = pivotAt(-0.5 * sc, 1.0 * sc, 0);
  armL.add(part(icoGeo(0.2, 0), lite, 0, 0, 0));
  armL.add(part(icoGeo(0.3, 0), rock, 0, -0.3 * sc, 0.1));
  
  const armR = pivotAt(0.5 * sc, 1.0 * sc, 0);
  armR.add(part(icoGeo(0.2, 0), lite, 0, 0, 0));
  armR.add(part(icoGeo(0.3, 0), rock, 0, -0.3 * sc, 0.1)); // fists
  
  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  return { group: g, height: 2.3 };
}

// 3. TB_SHARDCASTER (Shardcaster ranged)
function buildShardcaster(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const rock = MAT.basalt();
  const lite = MAT.basaltLite();

  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.2, 0.5, 0);
    leg.add(part(boxGeo(0.24, 0.5, 0.26), rock, 0, -0.25, 0));
    g.add(leg);
    anim.legs.push(leg);
  }
  g.add(part(icoGeo(0.42, 0), rock, 0, 0.85, 0));
  g.add(part(octaGeo(0.12), team(hex, 'core'), 0, 0.92, 0.35));

  g.add(part(icoGeo(0.22, 0), lite, 0, 1.28, 0.02));

  const armL = pivotAt(-0.5, 1.0, 0);
  armL.add(part(icoGeo(0.2, 0), lite, 0, 0, 0));
  
  const armR = pivotAt(0.5, 1.0, 0);
  armR.add(part(icoGeo(0.2, 0), lite, 0, 0, 0));
  armR.add(part(coneGeo(0.14, 0.38, 6), team(hex, 'core'), 0, -0.05, 0.22, { rx: 1.1 })); // crystal cannon

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  return { group: g, height: 1.6 };
}

// 4. TB_STONE_CRUSHER (Stone Crusher)
function buildStoneCrusher(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const rock = MAT.basalt();
  const lite = MAT.basaltLite();

  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.22, 0.55, 0);
    leg.add(part(boxGeo(0.28, 0.55, 0.28), rock, 0, -0.26, 0));
    g.add(leg);
    anim.legs.push(leg);
  }
  g.add(part(icoGeo(0.45, 0), rock, 0, 0.9, 0));

  const armL = pivotAt(-0.54, 1.05, 0);
  armL.add(part(icoGeo(0.22, 0), lite, 0, 0, 0));
  armL.add(part(boxGeo(0.35, 0.35, 0.35), rock, 0, -0.32, 0.1)); // stone hammers
  
  const armR = pivotAt(0.54, 1.05, 0);
  armR.add(part(icoGeo(0.22, 0), lite, 0, 0, 0));
  armR.add(part(boxGeo(0.35, 0.35, 0.35), rock, 0, -0.32, 0.1));

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  return { group: g, height: 1.7 };
}

// 5. TB_OBSIDIAN_SHARD (Floating spiked crystal)
function buildObsidianShard(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const glow = team(hex, 'core');
  const dark = MAT.emberDark();

  // Floating tall obsidian spikes (nested double octahedron)
  const shardOuter = part(octaGeo(0.34), dark, 0, 0, 0, { sy: 2.2 });
  g.add(shardOuter);
  
  // Inner glowing core
  const core = part(octaGeo(0.18), glow, 0, 0, 0, { sy: 1.5 });
  g.add(core);

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    // Floating bobbing
    g.position.y = 0.9 + Math.sin(now * 2.8) * 0.14;
    shardOuter.rotation.y = now * 1.5;
    core.scale.setScalar(0.95 + Math.sin(now * 8.0) * 0.08);
  };

  return { group: g, height: 1.7 };
}

// 6. TB_MUD_ELEMENTAL (Mud Elemental blob)
function buildMudElemental(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const mud = MAT.wood(); // brown wood color matches mud

  // Bubbling sphere elements stacked
  const baseBlob = part(sphGeo(0.34, 8), mud, 0, 0.34, 0, { sx: 1.3, sz: 1.2 });
  const midBlob = part(sphGeo(0.26, 8), mud, 0, 0.72, 0.02, { sx: 1.2 });
  const headBlob = part(sphGeo(0.18, 8), mud, 0, 1.05, 0.04);
  g.add(baseBlob); g.add(midBlob); g.add(headBlob);

  // Spitting mud claws
  const armL = pivotAt(-0.3, 0.76, 0.06);
  armL.add(part(sphGeo(0.12, 6), mud, 0, -0.1, 0.05));
  const armR = pivotAt(0.3, 0.76, 0.06);
  armR.add(part(sphGeo(0.12, 6), mud, 0, -0.1, 0.05));
  g.add(armL); g.add(armR);

  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    // Bubble bobbing
    midBlob.position.y = 0.72 + Math.sin(now * 3.5) * 0.04;
    headBlob.position.y = 1.05 + Math.cos(now * 2.8) * 0.03;
    
    // Spawn mud drops en route
    if (speed > 0.4 && Math.random() < 0.15 && unit.engine.fx) {
      const dropPos = new THREE.Vector3().copy(unit.position);
      dropPos.y += 0.2;
      unit.engine.fx.spawn('spark', dropPos, '#523a28', { vy: 0.5, grav: 12 });
    }
  };

  return { group: g, height: 1.4 };
}

// 7. TB_GRAVEL_HURLER (Gravel Hurler sling)
function buildGravelHurler(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const rock = MAT.basalt();
  const lite = MAT.basaltLite();

  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.18, 0.5, 0);
    leg.add(part(boxGeo(0.2, 0.5, 0.24), rock, 0, -0.25, 0));
    g.add(leg);
    anim.legs.push(leg);
  }
  g.add(part(icoGeo(0.38, 0), rock, 0, 0.8, 0));

  // Sling arm
  const armL = pivotAt(-0.46, 0.95, 0.05);
  armL.add(part(icoGeo(0.16, 0), lite, 0, 0, 0));
  
  const armR = pivotAt(0.46, 0.95, 0.05);
  armR.add(part(icoGeo(0.16, 0), lite, 0, 0, 0));
  
  // Stone basket hurl
  const basket = part(boxGeo(0.2, 0.2, 0.24), rock, 0.02, -0.22, 0.14);
  basket.add(part(sphGeo(0.08, 6), rock, 0, 0.08, 0)); // stone inside
  armR.add(basket);

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  return { group: g, height: 1.52 };
}

// 8. TB_TREMOR_BEAST (Quadruped rock hound)
function buildTremorBeast(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const rock = MAT.basalt();
  const lava = MAT.lava();

  // Torso
  g.add(part(boxGeo(0.44, 0.44, 1.05), rock, 0, 0.62, 0));
  
  // Lava stripe down the back
  g.add(part(boxGeo(0.1, 0.04, 0.88), lava, 0, 0.84, 0));

  const hipY = 0.62;
  const legFL = pivotAt(-0.18, hipY, 0.35);
  legFL.add(part(cylGeo(0.07, 0.06, 0.52, 6), rock, 0, -0.26, 0));
  g.add(legFL); anim.legs.push(legFL);

  const legFR = pivotAt(0.18, hipY, 0.35);
  legFR.add(part(cylGeo(0.07, 0.06, 0.52, 6), rock, 0, -0.26, 0));
  g.add(legFR); anim.legs.push(legFR);

  const legBL = pivotAt(-0.18, hipY, -0.35);
  legBL.add(part(cylGeo(0.07, 0.06, 0.52, 6), rock, 0, -0.26, 0));
  g.add(legBL); anim.legs.push(legBL);

  const legBR = pivotAt(0.18, hipY, -0.35);
  legBR.add(part(cylGeo(0.07, 0.06, 0.52, 6), rock, 0, -0.26, 0));
  g.add(legBR); anim.legs.push(legBR);

  // Head
  g.add(part(boxGeo(0.24, 0.22, 0.35), rock, 0, 0.85, 0.52));

  g.userData.anim = anim;
  return { group: g, height: 1.15 };
}

// 9. TB_MOUNTAIN_GIANT (Mountain Giant carrying pillar)
function buildMountainGiant(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const rock = MAT.basalt();
  const lite = MAT.basaltLite();
  const sc = 1.45;

  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.22 * sc, 0.6 * sc, 0);
    leg.add(part(boxGeo(0.3, 0.6, 0.3), rock, 0, -0.3 * sc, 0));
    g.add(leg);
    anim.legs.push(leg);
  }
  g.add(part(icoGeo(0.55, 0), rock, 0, 1.05 * sc, 0, { sx: 1.1, sz: 1.05 }));

  g.add(part(icoGeo(0.24, 0), lite, 0, 1.55 * sc, 0.05));

  // Arm R holding tree/stone trunk
  const armL = pivotAt(-0.6 * sc, 1.25 * sc, 0.05);
  armL.add(part(icoGeo(0.24, 0), lite, 0, 0, 0));
  armL.add(part(cylGeo(0.12, 0.14, 0.65, 6), rock, 0, -0.32, 0));

  const armR = pivotAt(0.6 * sc, 1.25 * sc, 0.05);
  armR.add(part(icoGeo(0.24, 0), lite, 0, 0, 0));
  // Massive stone pillar
  const pillar = part(cylGeo(0.18, 0.18, 1.8, 8), lite, 0.08, -0.32, 0.44, { rx: 1.15 });
  armR.add(pillar);

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  return { group: g, height: 2.7 };
}

// 10. TB_CRYSTAL_HEALER (Crystal Healer pink gems)
function buildCrystalHealer(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const rock = MAT.basalt();
  const lite = MAT.basaltLite();
  const core = team(hex, 'core');

  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.15, 0.5, 0);
    leg.add(part(boxGeo(0.2, 0.5, 0.22), rock, 0, -0.25, 0));
    g.add(leg);
    anim.legs.push(leg);
  }
  g.add(part(icoGeo(0.38, 0), rock, 0, 0.8, 0));
  
  // Pink crystals on shoulders
  g.add(part(octaGeo(0.1), core, -0.28, 1.05, 0));
  g.add(part(octaGeo(0.1), core, 0.28, 1.05, 0));

  // Staff with giant healing crystal
  const staff = new THREE.Group();
  staff.add(part(cylGeo(0.025, 0.025, 1.2, 6), MAT.wood(), 0, 0, 0));
  staff.add(part(octaGeo(0.14), core, 0, 0.68, 0)); // floating healing crystal
  staff.position.set(0.02, -0.22, 0.18);

  const armL = pivotAt(-0.25, 0.95, 0.02);
  armL.add(part(cylGeo(0.04, 0.04, 0.44, 6), lite, 0, -0.22, 0));

  const armR = pivotAt(0.25, 0.95, 0.02);
  armR.add(part(cylGeo(0.04, 0.04, 0.44, 6), lite, 0, -0.22, 0));
  armR.add(staff);

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  return { group: g, height: 1.55 };
}

// 11. TB_GEODE_LURKER (Crystal Geode spider)
function buildGeodeLurker(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const rock = MAT.basalt();
  const core = team(hex, 'core');

  // Spider-like rock legs (6 legs)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.52;
    const leg = pivotAt(Math.cos(a) * 0.25, 0.42, Math.sin(a) * 0.25);
    leg.add(part(cylGeo(0.045, 0.045, 0.48, 6), rock, 0, -0.24, 0, { rx: Math.sin(a) * 0.4, rz: -Math.cos(a) * 0.4 }));
    g.add(leg);
    anim.legs.push(leg);
  }

  // Crystal geode body hull
  g.add(part(sphGeo(0.38, 8), rock, 0, 0.58, 0, { sy: 0.8, sz: 1.25 }));
  
  // Geode cluster back (orbiting / stacked crystal spikes)
  for (let i = 0; i < 3; i++) {
    g.add(part(octaGeo(0.12), core, 0, 0.82, -0.15 + i * 0.15));
  }

  g.userData.anim = anim;
  return { group: g, height: 1.15 };
}

// 12. TB_LAVA_SPITTER (Lava Spitter element)
function buildLavaSpitter(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const rock = MAT.basalt();
  const lava = MAT.lava();

  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.16, 0.45, 0);
    leg.add(part(boxGeo(0.2, 0.45, 0.22), rock, 0, -0.22, 0));
    g.add(leg);
    anim.legs.push(leg);
  }
  g.add(part(icoGeo(0.38, 0), rock, 0, 0.76, 0));
  
  // Magma throat cylinder
  g.add(part(cylGeo(0.15, 0.18, 0.32, 8), lava, 0, 1.05, 0.18, { rx: 0.4 }));

  // Head
  g.add(part(icoGeo(0.22, 0), rock, 0, 1.2, 0.05));

  const armL = pivotAt(-0.25, 0.95, 0.02);
  armL.add(part(cylGeo(0.04, 0.04, 0.44, 6), rock, 0, -0.22, 0));
  
  const armR = pivotAt(0.25, 0.95, 0.02);
  armR.add(part(cylGeo(0.04, 0.04, 0.44, 6), rock, 0, -0.22, 0));

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);

  g.userData.anim = anim;
  return { group: g, height: 1.55 };
}

// 13. TB_BOULDER_HURLER (Stone Catapult-Construct)
function buildBoulderHurler(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const rock = MAT.basalt();
  const lite = MAT.basaltLite();

  // Tri-leg tripod base
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = pivotAt(Math.cos(a) * 0.25, 0.5, Math.sin(a) * 0.25);
    leg.add(part(cylGeo(0.08, 0.08, 0.52, 6), rock, 0, -0.26, 0, { rx: Math.sin(a) * 0.3, rz: -Math.cos(a) * 0.3 }));
    g.add(leg);
    anim.legs.push(leg);
  }

  // Basket hull torso
  g.add(part(boxGeo(0.72, 0.38, 0.72), rock, 0, 0.68, 0));
  
  // Launching stone spoon arm
  const spoon = pivotAt(0, 0.88, -0.2);
  spoon.add(part(cylGeo(0.05, 0.05, 0.68, 6), rock, 0, 0.34, 0)); // armature
  spoon.add(part(sphGeo(0.24, 8), lite, 0, 0.68, 0.08)); // spoon cup holds boulder
  g.add(spoon);

  anim.toolArm = spoon;
  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    const jab = unit._attackAnim < 1 ? Math.sin(unit._attackAnim * Math.PI) : 0;
    spoon.rotation.x = -jab * 1.25;
  };

  return { group: g, height: 1.55 };
}

// 14. TB_GRANITE_SHIELD (Double shield plates)
function buildGraniteShield(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const rock = MAT.basalt();
  const lite = MAT.basaltLite();

  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.16, 0.5, 0);
    leg.add(part(boxGeo(0.2, 0.5, 0.22), rock, 0, -0.25, 0));
    g.add(leg);
    anim.legs.push(leg);
  }
  g.add(part(icoGeo(0.42, 0), rock, 0, 0.85, 0));

  // Giant shield plates on both arms
  const armL = pivotAt(-0.25, 1.0, 0.02);
  armL.add(part(cylGeo(0.04, 0.04, 0.44, 6), lite, 0, -0.22, 0));
  armL.add(part(boxGeo(0.12, 0.88, 0.48), rock, -0.06, -0.22, 0.12, { rz: 0.1 }));
  
  const armR = pivotAt(0.25, 1.0, 0.02);
  armR.add(part(cylGeo(0.04, 0.04, 0.44, 6), lite, 0, -0.22, 0));
  armR.add(part(boxGeo(0.12, 0.88, 0.48), rock, 0.06, -0.22, 0.12, { rz: -0.1 }));

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);

  g.userData.anim = anim;
  return { group: g, height: 1.6 };
}

// 15. TB_IRONSTONE_GARGOYLE (Flying stone bat)
function buildGargoyle(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const rock = MAT.basalt();
  const dark = MAT.emberDark();

  // Fuselage body
  g.add(part(cylGeo(0.16, 0.1, 0.82, 8), rock, 0, 0, 0, { rx: Math.PI / 2 }));
  g.add(part(sphGeo(0.14, 8), dark, 0, 0.2, 0.35)); // head

  // Rocky wing panels
  const wingL = pivotAt(-0.15, 0.04, 0);
  wingL.add(part(boxGeo(0.72, 0.02, 0.38), dark, -0.36, 0, 0));
  const wingR = pivotAt(0.15, 0.04, 0);
  wingR.add(part(boxGeo(0.72, 0.02, 0.38), dark, 0.36, 0, 0));

  g.add(wingL); g.add(wingR);
  anim.arms.push(wingL, wingR);

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    g.position.y = 1.35 + Math.sin(now * 3.5) * 0.12;
    const flap = Math.sin(now * 10.0) * 0.24;
    wingL.rotation.z = -flap;
    wingR.rotation.z = flap;
  };

  return { group: g, height: 1.45 };
}

// 16. TB_SAND_WEAVER (Sand tornado weaver)
function buildSandWeaver(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const sand = MAT.wood(); // brown wood color matches sand/earth

  // Swirling sand tornado underbody (stacked concentric rings/cones rotating)
  const cone1 = part(coneGeo(0.38, 0.58, 8), sand, 0, 0.29, 0, { rx: Math.PI });
  const cone2 = part(coneGeo(0.28, 0.44, 8), sand, 0, 0.72, 0);
  g.add(cone1); g.add(cone2);

  // Basalt torso hovering above tornado
  g.add(part(icoGeo(0.24, 0), MAT.basalt(), 0, 1.05, 0));

  const armL = pivotAt(-0.24, 1.05, 0.02);
  armL.add(part(cylGeo(0.04, 0.04, 0.44, 6), sand, 0, -0.22, 0));

  const armR = pivotAt(0.24, 1.05, 0.02);
  armR.add(part(cylGeo(0.04, 0.04, 0.44, 6), sand, 0, -0.22, 0));
  armR.add(part(cylGeo(0.02, 0.02, 0.95, 6), MAT.basalt(), 0.02, -0.22, 0.15)); // sand rod staff

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    g.position.y = 0.5 + Math.sin(now * 3.0) * 0.06;
    cone1.rotation.y = now * 4.5;
    cone2.rotation.y = -now * 6.2;
  };

  return { group: g, height: 1.6 };
}

// 17. TB_CORE_GUARDIAN (Protected chest core)
function buildCoreGuardian(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const rock = MAT.basalt();
  const lite = MAT.basaltLite();
  const core = team(hex, 'core');

  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.18, 0.55, 0);
    leg.add(part(boxGeo(0.24, 0.55, 0.24), rock, 0, -0.26, 0));
    g.add(leg);
    anim.legs.push(leg);
  }
  
  // Chunky hollow shield cage torso
  g.add(part(boxGeo(0.55, 0.65, 0.55), rock, 0, 0.92, 0));
  // Large glowing core inside the chest box
  g.add(part(octaGeo(0.22), core, 0, 0.92, 0));

  g.add(part(icoGeo(0.2, 0), lite, 0, 1.35, 0.02));

  const armL = pivotAt(-0.35, 1.05, 0.02);
  armL.add(part(cylGeo(0.06, 0.06, 0.44, 6), lite, 0, -0.22, 0));
  armL.add(part(icoGeo(0.2, 0), rock, 0, -0.44, 0));
  
  const armR = pivotAt(0.35, 1.05, 0.02);
  armR.add(part(cylGeo(0.06, 0.06, 0.44, 6), lite, 0, -0.22, 0));
  armR.add(part(icoGeo(0.2, 0), rock, 0, -0.44, 0));

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  return { group: g, height: 1.62 };
}

// 18. TB_EARTHSHAKER (Basalt hammer fists)
function buildEarthshaker(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const rock = MAT.basalt();
  const lite = MAT.basaltLite();
  const sc = 1.3;

  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.2 * sc, 0.52 * sc, 0);
    leg.add(part(boxGeo(0.26, 0.52, 0.26), rock, 0, -0.26 * sc, 0, { sx: sc, sy: sc, sz: sc }));
    g.add(leg);
    anim.legs.push(leg);
  }
  g.add(part(icoGeo(0.44, 0), rock, 0, 0.9 * sc, 0));
  g.add(part(icoGeo(0.2, 0), lite, 0, 1.34 * sc, 0.02));

  // Giant sledgehammer hands
  const armL = pivotAt(-0.54 * sc, 1.1 * sc, 0);
  armL.add(part(cylGeo(0.06, 0.06, 0.55 * sc, 6), lite, 0, -0.26, 0));
  armL.add(part(boxGeo(0.36, 0.24, 0.48), rock, 0, -0.6 * sc, 0.1));
  
  const armR = pivotAt(0.54 * sc, 1.1 * sc, 0);
  armR.add(part(cylGeo(0.06, 0.06, 0.55 * sc, 6), lite, 0, -0.26, 0));
  armR.add(part(boxGeo(0.36, 0.24, 0.48), rock, 0, -0.6 * sc, 0.1));

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  return { group: g, height: 2.1 };
}

// 19. TB_MAGMA_LORD (Orbiting rock magma lord)
function buildMagmaLord(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const lava = MAT.lava();
  const rock = MAT.basalt();

  // Floating core magma orb
  const core = part(sphGeo(0.34, 10), lava, 0, 0, 0);
  g.add(core);

  // Orbiting basalt chunks
  const orbits = [];
  for (let i = 0; i < 4; i++) {
    const chunk = part(icoGeo(0.16, 0), rock, 0, 0, 0);
    g.add(chunk);
    orbits.push(chunk);
  }

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    g.position.y = 1.0 + Math.sin(now * 2.5) * 0.15;
    core.scale.setScalar(0.92 + Math.sin(now * 16.0) * 0.08);
    
    // Rotate orbits
    orbits.forEach((chunk, idx) => {
      const a = now * 1.8 + idx * (Math.PI / 2);
      chunk.position.set(
        Math.cos(a) * 0.62,
        Math.sin(now * 3.5 + idx) * 0.08,
        Math.sin(a) * 0.62
      );
      chunk.rotation.y = now * 2.2;
    });
  };

  return { group: g, height: 1.6 };
}

// 20. TB_DUST_SPRITE (Floating sand sprite)
function buildDustSprite(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const sand = MAT.wood(); // brown mud/sand

  // Group of small spheres rotating to form a cloud
  const cloud = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    cloud.add(part(sphGeo(0.12 + i * 0.02, 6), sand, (Math.random() - 0.5) * 0.38, (Math.random() - 0.5) * 0.38, (Math.random() - 0.5) * 0.38));
  }
  g.add(cloud);
  
  // Tiny core gem center
  cloud.add(part(octaGeo(0.1), team(hex, 'core'), 0, 0, 0));

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    g.position.y = 0.8 + Math.sin(now * 4.0) * 0.1;
    cloud.rotation.y += dt * 4.5;
    cloud.rotation.x += dt * 1.5;
  };

  return { group: g, height: 1.15 };
}

// 21. TB_STALAGMITE_SENTINEL (Stone needle launcher)
function buildStalagSentinel(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const rock = MAT.basalt();
  const lite = MAT.basaltLite();

  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.16, 0.48, 0);
    leg.add(part(boxGeo(0.2, 0.48, 0.22), rock, 0, -0.24, 0));
    g.add(leg);
    anim.legs.push(leg);
  }
  g.add(part(icoGeo(0.38, 0), rock, 0, 0.78, 0));

  // Spike needle staff on R arm
  const armL = pivotAt(-0.26, 0.95, 0.02);
  armL.add(part(cylGeo(0.04, 0.04, 0.44, 6), lite, 0, -0.22, 0));

  const armR = pivotAt(0.26, 0.95, 0.02);
  armR.add(part(cylGeo(0.04, 0.04, 0.44, 6), lite, 0, -0.22, 0));
  armR.add(part(coneGeo(0.07, 0.72, 6), rock, 0.02, -0.22, 0.22, { rx: 1.25 })); // stone launcher spike

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  return { group: g, height: 1.52 };
}

// 22. TB_AETHER_GOLEM (Aether cyan basalt golem)
function buildAetherGolem(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const rock = MAT.basalt();
  const lite = MAT.basaltLite();
  const aetherCore = team(hex, 'core'); // Aether cyan core color from slot

  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.2, 0.58, 0);
    leg.add(part(boxGeo(0.25, 0.58, 0.25), rock, 0, -0.29, 0));
    g.add(leg);
    anim.legs.push(leg);
  }
  g.add(part(icoGeo(0.44, 0), rock, 0, 0.9, 0));
  // Aether glowing veins
  g.add(part(boxGeo(0.48, 0.06, 0.06), aetherCore, 0, 0.95, 0.35, { rz: 0.35 }));
  g.add(part(octaGeo(0.14), aetherCore, 0, 0.98, 0.36));

  g.add(part(icoGeo(0.22, 0), lite, 0, 1.32, 0.02));

  const armL = pivotAt(-0.48, 1.05, 0);
  armL.add(part(icoGeo(0.2, 0), lite, 0, 0, 0));
  armL.add(part(icoGeo(0.28, 0), rock, 0, -0.28, 0.08));

  const armR = pivotAt(0.48, 1.05, 0);
  armR.add(part(icoGeo(0.2, 0), lite, 0, 0, 0));
  armR.add(part(icoGeo(0.28, 0), rock, 0, -0.28, 0.08));

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  return { group: g, height: 1.62 };
}

// 23. TB_TERRA_ARCHON (Terra Archon float elemental)
function buildTerraArchon(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const rock = MAT.basalt();
  const core = team(hex, 'core');

  // Floating core crystal
  const centerCore = part(octaGeo(0.28), core, 0, 0, 0, { sy: 1.4 });
  g.add(centerCore);

  // Orbiting stone rings/runes
  const runes = [];
  for (let i = 0; i < 3; i++) {
    const rune = part(boxGeo(0.2, 0.12, 0.05), rock, 0, 0, 0);
    g.add(rune);
    runes.push(rune);
  }

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    g.position.y = 1.25 + Math.sin(now * 3.0) * 0.12;
    centerCore.rotation.y += dt * 1.5;
    runes.forEach((r, idx) => {
      const a = now * 1.6 + idx * (Math.PI * 2 / 3);
      r.position.set(
        Math.cos(a) * 0.52,
        Math.sin(now * 3.2 + idx) * 0.08,
        Math.sin(a) * 0.52
      );
      r.rotation.y = -a + Math.PI / 2;
    });
  };

  return { group: g, height: 1.65 };
}

// ═════════════════════════════════════════════════════════════════════════════
// TERRA BORN BUILDINGS (23 Unique Models)
// ═════════════════════════════════════════════════════════════════════════════

export function buildTerraBuilding(type, colorHex) {
  const g = new THREE.Group();
  const id = type.id;
  const R = type.radius;

  const rock = MAT.basalt();
  const lite = MAT.basaltLite();
  const lava = MAT.lava();
  const core = team(colorHex, 'core');

  let height = 3.5;

  if (id === 'TB_CORE') {
    // Core Level 1 Hall: Ziggurat steps, molten vent
    const w = R * 1.6;
    g.add(part(boxGeo(w * 1.2, 1.4, w * 1.2), rock, 0, 0.7, 0));
    g.add(part(boxGeo(w * 0.9, 1.2, w * 0.9), lite, 0, 2.0, 0));
    
    // Core vent
    const vent = part(cylGeo(w * 0.28, w * 0.3, 0.4, 8), lava, 0, 2.8, 0);
    g.add(vent);
    
    // Core crest
    const crest = part(octaGeo(0.48), core, 0, 1.1, w * 0.56);
    crest.name = 'core';
    crest.userData = { baseY: 1.1 };
    g.add(crest);
    height = 3.2;
  }
  else if (id === 'TB_GRANITE_KEEP') {
    // Granite Keep Level 2 Hall: Dual volcanic chimneys
    const w = R * 1.7;
    g.add(part(boxGeo(w * 1.2, 2.0, w * 1.2), rock, 0, 1.0, 0));
    g.add(part(boxGeo(w * 0.95, 1.6, w * 0.95), lite, 0, 2.8, 0));

    // Two side molten vents
    g.add(part(cylGeo(0.3, 0.35, 1.2, 6), rock, -w * 0.35, 3.4, -w * 0.35));
    g.add(part(cylGeo(0.3, 0.35, 1.2, 6), rock, w * 0.35, 3.4, -w * 0.35));
    
    const crest = part(octaGeo(0.55), core, 0, 1.5, w * 0.6);
    crest.name = 'core';
    crest.userData = { baseY: 1.5 };
    g.add(crest);
    height = 4.4;
  }
  else if (id === 'TB_FORGE') {
    // Ember Forge (Barracks Level 1): Basalt forge with slag vent
    const w = R * 1.5;
    g.add(part(boxGeo(w * 1.1, 1.6, w), rock, 0, 0.8, 0));
    
    // Slag vent
    const vent = part(boxGeo(w * 0.44, 0.8, 0.18), lava, 0, 0.8, w * 0.5);
    g.add(vent);
    
    const crest = part(octaGeo(0.28), core, 0, 2.6, 0);
    crest.name = 'core';
    crest.userData = { baseY: 2.6 };
    g.add(crest);
    height = 3.2;
  }
  else if (id === 'TB_CONDUIT') {
    // Aether Conduit (Supply Level 1): Magma core pillar
    const w = R * 1.4;
    g.add(part(boxGeo(w, 0.8, w), rock, 0, 0.4, 0));
    g.add(part(cylGeo(0.26, 0.44, 2.4, 6), lite, 0, 1.8, 0));
    
    const vent = part(coneGeo(0.32, 0.72, 6), lava, 0, 3.2, 0);
    g.add(vent);
    
    const crest = part(octaGeo(0.24), core, 0, 1.1, w * 0.52);
    crest.name = 'core';
    crest.userData = { baseY: 1.1 };
    g.add(crest);
    height = 3.8;
  }
  else if (id === 'TB_STONE_WALL') {
    // Stone Wall
    const w = R * 1.8;
    g.add(part(boxGeo(w, 1.5, 0.45), rock, 0, 0.75, 0));
    return { group: g, height: 1.5 };
  }
  else if (id === 'TB_EARTH_SPIRE') {
    // Earth Spire barracks: tall spike
    g.add(part(coneGeo(0.38, 3.8, 6), rock, 0, 1.9, 0));
    height = 3.8;
  }
  else if (id === 'TB_BASALT_TOWER') {
    // Basalt Tower watchtower
    g.add(part(cylGeo(0.34, 0.48, 3.4, 8), rock, 0, 1.7, 0));
    g.add(part(boxGeo(0.9, 0.15, 0.9), lite, 0, 3.47, 0)); // deck
    g.add(part(coneGeo(0.7, 1.0, 8), rock, 0, 4.05, 0));
    height = 4.8;
  }
  else if (id === 'TB_MAGMA_CHAMBER') {
    // Magma Chamber: pool of glowing hot lava
    const w = R * 1.5;
    g.add(part(cylGeo(w * 0.65, w * 0.75, 0.6, 8), rock, 0, 0.3, 0));
    g.add(part(cylGeo(w * 0.58, w * 0.58, 0.05, 8), lava, 0, 0.58, 0));
    return { group: g, height: 0.8 };
  }
  else if (id === 'TB_CRYSTAL_MATRIX') {
    // Crystal Matrix: 3 floating crystal shards
    const w = R * 1.4;
    g.add(part(boxGeo(w, 0.4, w), rock, 0, 0.2, 0));
    
    const crystal = part(octaGeo(0.28), core, 0, 1.4, 0, { sy: 1.6 });
    crystal.name = 'core';
    crystal.userData = { baseY: 1.4 };
    g.add(crystal);

    g.userData.customAnimate = (b, dt, now) => {
      crystal.rotation.y = now * 1.5;
    };
    height = 2.4;
  }
  else if (id === 'TB_GEODE_MINE') {
    // Geode Mine: geode cluster cave
    const w = R * 1.5;
    g.add(part(sphGeo(w * 0.55, 8), rock, 0, 0.55, 0, { sy: 0.7 }));
    
    // Glowing cave entry
    g.add(part(boxGeo(0.48, 0.65, 0.12), core, 0, 0.32, w * 0.5));
    return { group: g, height: 1.2 };
  }
  else if (id === 'TB_QUAKE_ENGINE') {
    // Quake Engine: rotating stone hammer mill
    const w = R * 1.6;
    g.add(part(boxGeo(w, 1.0, w), rock, 0, 0.5, 0));
    
    // Rotating stone hammer shaft
    const shaft = part(cylGeo(0.12, 0.12, 1.4, 6), lite, 0, 1.3, 0);
    g.add(shaft);
    const hammer = part(boxGeo(0.72, 0.28, 0.28), rock, 0, 2.0, 0);
    g.add(hammer);

    g.userData.customAnimate = (b, dt, now) => {
      shaft.rotation.y = now * 1.8;
      hammer.rotation.y = now * 1.8;
    };
    height = 2.4;
  }
  else if (id === 'TB_OBSIDIAN_PILLAR') {
    // Obsidian Pillar
    g.add(part(cylGeo(0.18, 0.24, 3.8, 6), rock, 0, 1.9, 0));
    g.add(part(octaGeo(0.24), core, 0, 4.05, 0, { sy: 1.4 }));
    height = 4.8;
  }
  else if (id === 'TB_MUD_POOL') {
    // Mud Pool: bubbling pool
    const w = R * 1.5;
    g.add(part(cylGeo(w * 0.65, w * 0.75, 0.5, 8), MAT.wood(), 0, 0.25, 0)); // brown mud pool rim
    return { group: g, height: 0.6 };
  }
  else if (id === 'TB_MOUNTAIN_VAULT') {
    // Mountain Vault: huge solid rock mountain
    const w = R * 1.6;
    g.add(part(sphGeo(w * 0.68, 10), rock, 0, 0.8, 0, { sy: 1.1 }));
    g.add(part(boxGeo(0.48, 0.9, 0.1), lite, 0, 0.45, w * 0.62)); // stone door
    return { group: g, height: 2.2 };
  }
  else if (id === 'TB_AETHER_SPIRE') {
    // Aether Spire: blue crystal conduit
    g.add(part(cylGeo(0.26, 0.38, 3.4, 8), rock, 0, 1.7, 0));
    
    // Floating blue crystal named 'core'
    const aetherCore = part(octaGeo(0.24), core, 0, 4.0, 0);
    aetherCore.name = 'core';
    aetherCore.userData = { baseY: 4.0 };
    g.add(aetherCore);

    g.userData.customAnimate = (b, dt, now) => {
      aetherCore.rotation.y = now * 1.8;
    };
    height = 4.8;
  }
  else if (id === 'TB_CORE_REACTOR') {
    // Core Reactor: glowing volcanic steam engine
    const w = R * 1.5;
    g.add(part(boxGeo(w, 1.6, w), rock, 0, 0.8, 0));
    
    const steamCore = part(sphGeo(0.38, 8), core, 0, 1.8, 0);
    steamCore.name = 'core';
    steamCore.userData = { baseY: 1.8 };
    g.add(steamCore);
    height = 2.6;
  }
  else if (id === 'TB_TERRAN_MONOLITH') {
    // Terran Monolith: huge flat rune-engraved rock slab
    const w = R * 1.4;
    g.add(part(boxGeo(0.65, 3.2, 0.65), rock, 0, 1.6, 0));
    g.add(part(boxGeo(0.68, 1.8, 0.08), core, 0, 1.8, 0.29)); // glowing runes
    height = 3.6;
  }
  else if (id === 'TB_SEISMIC_PILLAR') {
    // Seismic Pillar defense
    g.add(part(cylGeo(0.28, 0.38, 3.6, 6), rock, 0, 1.8, 0));
    g.add(part(boxGeo(0.68, 0.34, 0.68), lite, 0, 3.75, 0)); // capping block
    height = 4.2;
  }
  else if (id === 'TB_PEBBLE_NEST') {
    // Pebble Nest gargoyle roost
    const w = R * 1.4;
    g.add(part(cylGeo(0.38, 0.44, 2.8, 8), rock, -w * 0.28, 1.4, 0)); // rock pillar
    g.add(part(torusGeo(0.34, 0.08, 10), MAT.wood(), -w * 0.28, 2.85, 0, { rx: Math.PI / 2 })); // nest
    return { group: g, height: 3.2 };
  }
  else if (id === 'TB_EARTH_ALTAR') {
    // Earth Altar: stone slab
    const w = R * 1.5;
    g.add(part(cylGeo(w * 0.65, w * 0.65, 0.2, 8), rock, 0, 0.1, 0));
    g.add(part(boxGeo(w * 0.55, 0.44, 0.35), lite, 0, 0.32, 0)); // altar table
    return { group: g, height: 0.8 };
  }
  else if (id === 'TB_GRAVEL_PIT') {
    // Gravel Pit: pile of boulders
    const w = R * 1.5;
    g.add(part(sphGeo(0.26, 6), rock, -w * 0.22, 0.24, -w * 0.18));
    g.add(part(sphGeo(0.22, 6), rock, w * 0.25, 0.2, w * 0.2));
    g.add(part(sphGeo(0.18, 6), rock, 0, 0.44, 0));
    return { group: g, height: 0.8 };
  }
  else if (id === 'TB_SAND_WALL') {
    // Sand Wall
    const w = R * 1.8;
    g.add(part(boxGeo(w, 1.2, 0.52), MAT.wood(), 0, 0.6, 0)); // brown sand wall
    return { group: g, height: 1.2 };
  }
  else if (id === 'TB_LAVA_FORGE') {
    // Lava Forge smelting blast
    const w = R * 1.5;
    g.add(part(boxGeo(w, 1.8, w), rock, 0, 0.9, 0));
    
    // Slag vent
    g.add(part(boxGeo(w * 0.5, 0.72, 0.15), lava, 0, 0.72, w * 0.5));
    return { group: g, height: 2.2 };
  }

  g.name = type.id;
  return { group: g, height };
}
