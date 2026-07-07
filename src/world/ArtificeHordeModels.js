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

// Helper for metal/bronze detailing
const METAL = {
  bronze: () => MAT.gold(), // reuse gold for coppery bronze
  iron: () => MAT.steelDark(),
  brass: () => MAT.gold(),
  glow: (hex) => team(hex, 'core')
};

// ═════════════════════════════════════════════════════════════════════════════
// ARTIFICE HORDE UNITS (23 Unique Models)
// ═════════════════════════════════════════════════════════════════════════════

export function buildArtificeUnit(type, colorHex) {
  const id = type.id;
  switch (id) {
    case 'AH_THRALL': return buildThrall(type, colorHex);
    case 'AH_RIPPER': return buildRipper(type, colorHex);
    case 'AH_WEAVER': return buildWeaver(type, colorHex);
    case 'AH_GEARGUARD': return buildGearguard(type, colorHex);
    case 'AH_STEAM_HULK': return buildSteamHulk(type, colorHex);
    case 'AH_AUTOMATON': return buildAutomaton(type, colorHex);
    case 'AH_CLOCKWORK_SOLDIER': return buildClockworkSoldier(type, colorHex);
    case 'AH_TESLA_REAVER': return buildTeslaReaver(type, colorHex);
    case 'AH_THUNDERER': return buildThunderer(type, colorHex);
    case 'AH_BOMBARD': return buildBombard(type, colorHex);
    case 'AH_REPAIR_DRONE': return buildRepairDrone(type, colorHex);
    case 'AH_CHRONO_WEAVER': return buildChronoWeaver(type, colorHex);
    case 'AH_NULLIFIER': return buildNullifier(type, colorHex);
    case 'AH_COLOSSUS': return buildColossus(type, colorHex);
    case 'AH_BRASS_AVIATOR': return buildBrassAviator(type, colorHex);
    case 'AH_STEAM_GOLEM': return buildSteamGolem(type, colorHex);
    case 'AH_MECHANIZED_SCOUT': return buildMechanizedScout(type, colorHex);
    case 'AH_PYROCLASTIC_MACHINE': return buildPyroclasticMachine(type, colorHex);
    case 'AH_STEEL_CHARGER': return buildSteelCharger(type, colorHex);
    case 'AH_FORGE_SENTINEL': return buildForgeSentinel(type, colorHex);
    case 'AH_SHOCK_SENTINEL': return buildShockSentinel(type, colorHex);
    case 'AH_OVERCHARGED_CORE': return buildOverchargedCore(type, colorHex);
    case 'AH_TINKER_HERO': return buildTinkerHero(type, colorHex);
    default: return buildThrall(type, colorHex);
  }
}

// 1. AH_THRALL (Void Thrall worker - beast base)
function buildThrall(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const body = MAT.chitin();
  
  // Digitigrade legs
  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.15, 0.45, -0.05);
    leg.add(part(cylGeo(0.07, 0.1, 0.45, 6), body, 0, -0.18, 0, { rx: -0.3 }));
    leg.add(part(cylGeo(0.06, 0.08, 0.4, 6), body, 0, -0.38, 0.15, { rx: 0.5 }));
    leg.add(part(coneGeo(0.08, 0.14, 5), MAT.bone(), 0, -0.42, 0.3, { rx: 1.5 }));
    g.add(leg);
    anim.legs.push(leg);
  }
  g.add(part(sphGeo(0.24, 10), body, 0, 0.82, 0.05, { sy: 1.25, sz: 1.05 }));
  g.add(part(sphGeo(0.15, 8), body, 0, 1.22, 0.14, { sz: 1.4 })); // head
  g.add(part(sphGeo(0.035, 6), MAT.voidGlow(), -0.06, 1.24, 0.28)); // glow eyes
  g.add(part(sphGeo(0.035, 6), MAT.voidGlow(), 0.06, 1.24, 0.28));

  // Big gathering pincers
  const armL = pivotAt(-0.26, 0.9, 0.12);
  const armR = pivotAt(0.26, 0.9, 0.12);
  armL.add(part(cylGeo(0.05, 0.06, 0.3, 5), body, 0, -0.15, 0));
  armL.add(part(coneGeo(0.09, 0.35, 5), MAT.bone(), 0, -0.3, 0.12, { rx: 1.1 }));
  armR.add(part(cylGeo(0.05, 0.06, 0.3, 5), body, 0, -0.15, 0));
  armR.add(part(coneGeo(0.09, 0.35, 5), MAT.bone(), 0, -0.3, 0.12, { rx: 1.1 }));
  g.add(armL); g.add(armR);
  
  anim.arms.push(armL, armR);
  anim.toolArm = armR;
  g.userData.anim = anim;
  return { group: g, height: 1.45 };
}

// 2. AH_RIPPER (Ripper melee - claw beast base)
function buildRipper(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const body = MAT.chitin();
  
  // Digitigrade legs
  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.16, 0.5, -0.05);
    leg.add(part(cylGeo(0.08, 0.12, 0.5, 6), body, 0, -0.2, 0, { rx: -0.3 }));
    leg.add(part(cylGeo(0.07, 0.09, 0.44, 6), body, 0, -0.42, 0.17, { rx: 0.5 }));
    leg.add(part(coneGeo(0.09, 0.16, 5), MAT.bone(), 0, -0.46, 0.33, { rx: 1.5 }));
    g.add(leg);
    anim.legs.push(leg);
  }
  g.add(part(sphGeo(0.28, 10), body, 0, 0.92, 0.06, { sy: 1.3, sz: 1.1 }));
  // Spiky back
  for (let i = 0; i < 4; i++) {
    g.add(part(coneGeo(0.05, 0.22, 5), MAT.bone(), 0, 1.05 - i * 0.12, -0.2 - i * 0.04, { rx: -0.6 }));
  }
  g.add(part(sphGeo(0.16, 8), body, 0, 1.34, 0.16, { sz: 1.5 }));
  g.add(part(sphGeo(0.04, 6), MAT.voidGlow(), -0.07, 1.36, 0.32));
  g.add(part(sphGeo(0.04, 6), MAT.voidGlow(), 0.07, 1.36, 0.32));

  // Giant blades
  const armL = pivotAt(-0.3, 1.02, 0.1);
  const armR = pivotAt(0.3, 1.02, 0.1);
  armL.add(part(coneGeo(0.07, 0.65, 4), team(hex, 'bright'), -0.04, 0.15, 0, { rz: -0.5, rx: -0.3 }));
  armR.add(part(coneGeo(0.07, 0.65, 4), team(hex, 'bright'), 0.04, 0.15, 0, { rz: 0.5, rx: -0.3 }));
  g.add(armL); g.add(armR);
  
  anim.arms.push(armL, armR);
  anim.toolArm = armR;
  g.userData.anim = anim;
  return { group: g, height: 1.6 };
}

// 3. AH_WEAVER (Void Weaver ranged - orb beast base)
function buildWeaver(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const body = MAT.chitin();
  
  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.15, 0.48, -0.05);
    leg.add(part(cylGeo(0.07, 0.11, 0.48, 6), body, 0, -0.19, 0, { rx: -0.3 }));
    leg.add(part(cylGeo(0.06, 0.08, 0.42, 6), body, 0, -0.4, 0.16, { rx: 0.5 }));
    leg.add(part(coneGeo(0.08, 0.15, 5), MAT.bone(), 0, -0.44, 0.31, { rx: 1.5 }));
    g.add(leg);
    anim.legs.push(leg);
  }
  g.add(part(sphGeo(0.26, 10), body, 0, 0.88, 0.05, { sy: 1.2, sz: 1.05 }));
  g.add(part(sphGeo(0.15, 8), body, 0, 1.28, 0.15, { sz: 1.4 }));
  
  // Hands cradling orb
  const armL = pivotAt(-0.28, 0.96, 0.16);
  const armR = pivotAt(0.28, 0.96, 0.16);
  armL.add(part(cylGeo(0.05, 0.05, 0.32, 5), body, 0, -0.12, 0.08, { rx: -0.5 }));
  armR.add(part(cylGeo(0.05, 0.05, 0.32, 5), body, 0, -0.12, 0.08, { rx: -0.5 }));
  g.add(armL); g.add(armR);

  // Purple void orb
  g.add(part(sphGeo(0.12, 10), MAT.voidGlow(), 0, 0.88, 0.32));
  g.add(part(torusGeo(0.2, 0.015, 12), MAT.voidGlow(), 0, 0.88, 0.32, { rx: 0.4 }));
  
  anim.arms.push(armL, armR);
  g.userData.anim = anim;
  return { group: g, height: 1.55 };
}

// 4. AH_GEARGUARD (Steampunk guard)
function buildGearguard(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const bronze = METAL.bronze();
  const iron = METAL.iron();

  // 2 cylindrical gear legs
  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.16, 0.6, 0);
    leg.add(part(cylGeo(0.07, 0.07, 0.55, 8), iron, 0, -0.28, 0));
    leg.add(part(boxGeo(0.16, 0.1, 0.22), bronze, 0, -0.55, 0.04));
    g.add(leg);
    anim.legs.push(leg);
  }

  // Gear-plated boxy torso
  g.add(part(boxGeo(0.48, 0.6, 0.42), bronze, 0, 0.92, 0));
  // Gears on shoulders
  const gearL = part(cylGeo(0.22, 0.22, 0.08, 8), iron, -0.28, 1.1, 0, { rz: Math.PI / 2 });
  const gearR = part(cylGeo(0.22, 0.22, 0.08, 8), iron, 0.28, 1.1, 0, { rz: Math.PI / 2 });
  g.add(gearL); g.add(gearR);

  // Head: copper pot helmet
  g.add(part(cylGeo(0.14, 0.16, 0.2, 8), bronze, 0, 1.34, 0));
  g.add(part(sphGeo(0.035, 6), METAL.glow(hex), 0, 1.3, 0.15));

  // Shield on left arm, gear-blade on right arm
  const armL = pivotAt(-0.32, 1.0, 0.05);
  armL.add(part(cylGeo(0.05, 0.05, 0.44, 6), iron, 0, -0.2, 0));
  armL.add(part(cylGeo(0.28, 0.28, 0.04, 8), bronze, -0.06, -0.22, 0.12, { ry: 0.1, rx: Math.PI / 2 }));
  
  const armR = pivotAt(0.32, 1.0, 0.05);
  armR.add(part(cylGeo(0.05, 0.05, 0.44, 6), iron, 0, -0.2, 0));
  armR.add(part(cylGeo(0.24, 0.24, 0.03, 10), iron, 0, -0.42, 0.12, { rx: Math.PI / 2 })); // gear sword

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    const rotSpeed = (speed > 0.4 ? 12 : 3) * dt;
    gearL.rotation.x += rotSpeed;
    gearR.rotation.x -= rotSpeed;
  };

  return { group: g, height: 1.55 };
}

// 5. AH_STEAM_HULK (Steam Hulk giant robot)
function buildSteamHulk(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const bronze = METAL.bronze();
  const iron = METAL.iron();

  // Heavy squat legs
  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.3, 0.5, 0);
    leg.add(part(cylGeo(0.14, 0.18, 0.5, 8), iron, 0, -0.25, 0));
    leg.add(part(boxGeo(0.3, 0.14, 0.35), bronze, 0, -0.5, 0.05));
    g.add(leg);
    anim.legs.push(leg);
  }

  // Giant boiler torso (cylinder horizontal)
  g.add(part(cylGeo(0.48, 0.48, 0.8, 10), bronze, 0, 0.98, 0, { rz: Math.PI / 2 }));
  
  // Steam chimney pipe on back
  const chimney = part(cylGeo(0.08, 0.08, 0.6, 6), iron, 0, 1.45, -0.25, { rx: 0.25 });
  g.add(chimney);

  // Tiny head under hood
  g.add(part(sphGeo(0.14, 8), iron, 0, 1.15, 0.25));
  g.add(part(sphGeo(0.04, 6), METAL.glow(hex), 0, 1.15, 0.38));

  // Piston punching right arm, clamp left arm
  const armL = pivotAt(-0.52, 1.05, 0);
  armL.add(part(cylGeo(0.08, 0.08, 0.5, 6), iron, 0, -0.22, 0));
  armL.add(part(boxGeo(0.24, 0.24, 0.24), bronze, 0, -0.45, 0.08)); // heavy clamp

  const armR = pivotAt(0.52, 1.05, 0);
  armR.add(part(cylGeo(0.08, 0.08, 0.5, 6), iron, 0, -0.22, 0));
  const piston = part(boxGeo(0.28, 0.22, 0.35), bronze, 0, -0.45, 0.18);
  armR.add(piston);

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    // Pulse steam pipe scale to simulate pressure
    chimney.scale.y = 1.0 + Math.sin(now * 8.0) * 0.08;
    // Spawn steam contact particles if attacking
    if (unit._attackAnim < 1 && Math.random() < 0.35 && unit.engine.fx) {
      const pPos = new THREE.Vector3().copy(unit.position);
      pPos.y += 1.6;
      unit.engine.fx.spawnSmoke(pPos, { vy: 2.2, scale: 0.45, life: 0.6 });
    }
  };

  return { group: g, height: 1.7 };
}

// 6. AH_AUTOMATON (Slender golden robot on wheel)
function buildAutomaton(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const brass = METAL.brass();
  const iron = METAL.iron();

  // A single rolling wheel at the base
  const wheel = part(cylGeo(0.32, 0.32, 0.16, 12), iron, 0, 0.32, 0, { rz: Math.PI / 2 });
  g.add(wheel);

  // Slender strut torso
  g.add(part(cylGeo(0.08, 0.12, 0.65, 6), brass, 0, 0.8, 0));
  g.add(part(boxGeo(0.42, 0.18, 0.24), brass, 0, 1.15, 0));

  // Lens head
  g.add(part(sphGeo(0.13, 8), iron, 0, 1.34, 0.05));
  g.add(part(cylGeo(0.07, 0.07, 0.1, 8), METAL.glow(hex), 0, 1.34, 0.16, { rx: Math.PI / 2 }));

  // Two sword blade arms
  const armL = pivotAt(-0.25, 1.15, 0);
  armL.add(part(cylGeo(0.04, 0.04, 0.44, 6), iron, 0, -0.2, 0));
  armL.add(part(coneGeo(0.045, 0.55, 4), brass, 0, -0.42, 0.2, { rx: 0.9 }));
  
  const armR = pivotAt(0.25, 1.15, 0);
  armR.add(part(cylGeo(0.04, 0.04, 0.44, 6), iron, 0, -0.2, 0));
  armR.add(part(coneGeo(0.045, 0.55, 4), brass, 0, -0.42, 0.2, { rx: 0.9 }));

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    // Roll the wheel forward
    wheel.rotation.x += speed * dt * 3.5;
  };

  return { group: g, height: 1.5 };
}

// 7. AH_CLOCKWORK_SOLDIER (Soldier with winding key)
function buildClockworkSoldier(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const brass = METAL.brass();
  const iron = METAL.iron();

  // legs
  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.14, 0.6, 0);
    leg.add(part(cylGeo(0.06, 0.06, 0.55, 6), iron, 0, -0.25, 0));
    leg.add(part(boxGeo(0.15, 0.1, 0.2), brass, 0, -0.55, 0.02));
    g.add(leg);
    anim.legs.push(leg);
  }

  // Torso
  g.add(part(boxGeo(0.4, 0.55, 0.35), brass, 0, 0.88, 0));

  // Winding key on back
  const keyRoot = new THREE.Group();
  keyRoot.position.set(0, 0.9, -0.22);
  keyRoot.rotation.x = Math.PI / 2;
  keyRoot.add(part(cylGeo(0.03, 0.03, 0.2, 6), iron, 0, 0.1, 0)); // shaft
  keyRoot.add(part(torusGeo(0.12, 0.03, 8), brass, 0, 0.2, 0, { rx: Math.PI / 2 })); // key handle
  g.add(keyRoot);

  // Head with clockwork visual face
  g.add(part(sphGeo(0.14, 8), iron, 0, 1.25, 0.02));
  g.add(part(boxGeo(0.18, 0.18, 0.02), brass, 0, 1.25, 0.15));

  // Sword + Shield
  const armL = pivotAt(-0.25, 1.0, 0);
  armL.add(part(cylGeo(0.04, 0.04, 0.44, 6), iron, 0, -0.2, 0));
  armL.add(part(boxGeo(0.08, 0.48, 0.32), bronzeBanner(hex), -0.06, -0.2, 0.08)); // team-shield
  
  const armR = pivotAt(0.25, 1.0, 0);
  armR.add(part(cylGeo(0.04, 0.04, 0.44, 6), iron, 0, -0.2, 0));
  armR.add(part(boxGeo(0.04, 0.72, 0.08), iron, 0.02, -0.24, 0.18, { rx: 0.3 })); // brass sword

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    // Spin winding key continuously
    keyRoot.rotation.y += dt * 3.5;
  };

  return { group: g, height: 1.48 };
}

function bronzeBanner(hex) {
  return team(hex, 'cloth');
}

// 8. AH_TESLA_REAVER (Reaver with tesla coils)
function buildTeslaReaver(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const iron = METAL.iron();
  const glow = METAL.glow(hex);

  // Hexapod-like tripod legs
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = pivotAt(Math.cos(a) * 0.22, 0.48, Math.sin(a) * 0.22);
    leg.add(part(cylGeo(0.05, 0.05, 0.5, 6), iron, 0, -0.24, 0, { rx: Math.sin(a) * 0.3, rz: -Math.cos(a) * 0.3 }));
    leg.add(part(sphGeo(0.08, 6), iron, 0, -0.48, 0));
    g.add(leg);
    anim.legs.push(leg);
  }

  // Disk torso
  g.add(part(cylGeo(0.42, 0.42, 0.25, 8), iron, 0, 0.6, 0));

  // Central tesla coil stack
  g.add(part(cylGeo(0.06, 0.08, 0.8, 6), iron, 0, 1.1, 0));
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const ring = part(torusGeo(0.15 - i * 0.03, 0.024, 10), glow, 0, 0.82 + i * 0.22, 0, { rx: Math.PI / 2 });
    g.add(ring);
    rings.push(ring);
  }
  const topOrb = part(sphGeo(0.12, 8), glow, 0, 1.58, 0);
  g.add(topOrb);

  // Twin shocker claw arms
  const armL = pivotAt(-0.28, 0.68, 0.15);
  armL.add(part(cylGeo(0.04, 0.04, 0.36, 6), iron, 0, -0.16, 0));
  armL.add(part(coneGeo(0.05, 0.24, 4), glow, 0, -0.32, 0.08));

  const armR = pivotAt(0.28, 0.68, 0.15);
  armR.add(part(cylGeo(0.04, 0.04, 0.36, 6), iron, 0, -0.16, 0));
  armR.add(part(coneGeo(0.05, 0.24, 4), glow, 0, -0.32, 0.08));

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    // Pulse tesla orb glow scale
    const p = 0.95 + Math.sin(now * 25) * 0.08;
    topOrb.scale.setScalar(p);
    rings.forEach((r, idx) => {
      r.scale.set(p, p, 1.0);
    });
  };

  return { group: g, height: 1.75 };
}

// 9. AH_THUNDERER (Sniper with scope rifle)
function buildThunderer(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const brass = METAL.brass();
  const iron = METAL.iron();

  // Legs
  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.14, 0.58, 0);
    leg.add(part(cylGeo(0.06, 0.06, 0.55, 6), iron, 0, -0.25, 0));
    leg.add(part(boxGeo(0.14, 0.09, 0.2), brass, 0, -0.55, 0.03));
    g.add(leg);
    anim.legs.push(leg);
  }

  // Torso
  g.add(part(boxGeo(0.38, 0.52, 0.34), brass, 0, 0.84, 0));
  
  // Boiler backpack
  g.add(part(cylGeo(0.12, 0.12, 0.44, 8), iron, 0, 0.86, -0.22));

  // Head: goggles
  g.add(part(sphGeo(0.13, 8), iron, 0, 1.2, 0.03));
  g.add(part(boxGeo(0.25, 0.08, 0.04), brass, 0, 1.22, 0.12)); // goggles bar
  g.add(part(cylGeo(0.04, 0.04, 0.08, 8), METAL.glow(hex), -0.05, 1.22, 0.14, { rx: Math.PI / 2 })); // lens L
  g.add(part(cylGeo(0.04, 0.04, 0.08, 8), METAL.glow(hex), 0.05, 1.22, 0.14, { rx: Math.PI / 2 })); // lens R

  // Sniper Rifle
  const rf = new THREE.Group();
  rf.add(part(boxGeo(0.05, 0.08, 0.88), MAT.wood(), 0, 0, 0)); // stock
  rf.add(part(cylGeo(0.025, 0.02, 1.15, 6), iron, 0, 0.04, 0.32, { rx: Math.PI / 2 })); // barrel
  rf.add(part(cylGeo(0.018, 0.018, 0.36, 6), brass, 0, 0.12, 0.12, { rx: Math.PI / 2 })); // scope
  rf.position.set(0.04, -0.24, 0.22);

  const armL = pivotAt(-0.25, 0.98, 0.02);
  armL.add(part(cylGeo(0.04, 0.04, 0.44, 6), iron, 0, -0.22, 0));
  
  const armR = pivotAt(0.25, 0.98, 0.02);
  armR.add(part(cylGeo(0.04, 0.04, 0.44, 6), iron, 0, -0.22, 0));
  armR.add(rf);

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  return { group: g, height: 1.45 };
}

// 10. AH_BOMBARD (Scrap Bombard tank)
function buildBombard(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const iron = METAL.iron();
  const brass = METAL.brass();

  // Heavy tank base chassis
  g.add(part(boxGeo(0.95, 0.34, 1.25), iron, 0, 0.32, 0));

  // 4 gear tracks instead of legs
  const wheels = [];
  for (const [sx, sz] of [[-0.52, -0.4], [0.52, -0.4], [-0.52, 0.4], [0.52, 0.4]]) {
    const wheel = part(cylGeo(0.24, 0.24, 0.14, 8), iron, sx, 0.24, sz, { rz: Math.PI / 2 });
    g.add(wheel);
    wheels.push(wheel);
  }

  // Rotating mortar turret
  const turret = new THREE.Group();
  turret.position.set(0, 0.48, 0);
  turret.add(part(cylGeo(0.35, 0.38, 0.2, 8), brass, 0, 0.1, 0)); // base turret
  const barrel = part(cylGeo(0.18, 0.16, 0.72, 8), iron, 0, 0.3, 0.22, { rx: 0.7 }); // barrel pointing up/forward
  turret.add(barrel);
  g.add(turret);

  anim.toolArm = turret;
  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    // Spin tracks/wheels if moving
    if (speed > 0.4) {
      wheels.forEach(w => w.rotation.x += speed * dt * 2.5);
    }
    // Recoil mortar on attack
    const jab = unit._attackAnim < 1 ? Math.sin(unit._attackAnim * Math.PI) : 0;
    barrel.position.z = 0.22 - jab * 0.18;
    barrel.position.y = 0.3 - jab * 0.12;
  };

  return { group: g, height: 1.2 };
}

// 11. AH_REPAIR_DRONE (Floating repair drone)
function buildRepairDrone(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const iron = METAL.iron();
  const glow = METAL.glow(hex);

  // Floating sphere
  const sphere = part(sphGeo(0.24, 10), METAL.brass(), 0, 0, 0);
  g.add(sphere);

  // Lens eye
  sphere.add(part(cylGeo(0.08, 0.08, 0.08, 8), glow, 0, 0, 0.2, { rx: Math.PI / 2 }));

  // Concentric floating gyro rings
  const ring = part(torusGeo(0.35, 0.015, 12), iron, 0, 0, 0);
  g.add(ring);

  // Weld arm
  const arm = pivotAt(0, -0.15, 0.1);
  arm.add(part(cylGeo(0.02, 0.02, 0.28, 6), iron, 0, -0.14, 0, { rx: 0.4 }));
  arm.add(part(coneGeo(0.03, 0.1, 4), glow, 0, -0.28, 0.06, { rx: 0.4 })); // torch tip
  g.add(arm);

  anim.toolArm = arm;
  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    // Hover bobbing
    g.position.y = 0.8 + Math.sin(now * 3.5) * 0.14;
    // Rotate gyro ring
    ring.rotation.y += dt * 4.0;
    ring.rotation.x = Math.sin(now) * 0.2;
    // Rotate center lens
    sphere.rotation.y = Math.cos(now * 0.8) * 0.35;
  };

  return { group: g, height: 1.3 };
}

// 12. AH_CHRONO_WEAVER (Chrono Weaver)
function buildChronoWeaver(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const brass = METAL.brass();
  const iron = METAL.iron();

  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.14, 0.58, 0);
    leg.add(part(cylGeo(0.06, 0.06, 0.55, 6), iron, 0, -0.25, 0));
    leg.add(part(boxGeo(0.14, 0.09, 0.2), brass, 0, -0.55, 0.03));
    g.add(leg);
    anim.legs.push(leg);
  }

  g.add(part(boxGeo(0.38, 0.55, 0.35), brass, 0, 0.86, 0));
  
  // Head: flat clock gear
  const clockHead = part(cylGeo(0.18, 0.18, 0.04, 12), brass, 0, 1.25, 0.04, { rx: Math.PI / 2 });
  g.add(clockHead);

  // Chrono staff
  const staff = new THREE.Group();
  staff.add(part(cylGeo(0.025, 0.025, 1.2, 6), iron, 0, 0, 0));
  const clockRing = part(torusGeo(0.18, 0.02, 10), brass, 0, 0.65, 0, { ry: Math.PI / 2 });
  const hand = part(boxGeo(0.015, 0.16, 0.015), METAL.glow(hex), 0, 0.65, 0.08); // staff pointer hand
  staff.add(clockRing);
  staff.add(hand);
  staff.position.set(0.02, -0.22, 0.18);

  const armL = pivotAt(-0.25, 0.98, 0.02);
  armL.add(part(cylGeo(0.04, 0.04, 0.44, 6), iron, 0, -0.22, 0));

  const armR = pivotAt(0.25, 0.98, 0.02);
  armR.add(part(cylGeo(0.04, 0.04, 0.44, 6), iron, 0, -0.22, 0));
  armR.add(staff);
  
  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    // Spin clock head face gear
    clockHead.rotation.y = now * 1.5;
    // Rotate chrono staff hand
    hand.rotation.x = now * 6.5;
  };

  return { group: g, height: 1.62 };
}

// 13. AH_NULLIFIER (Floating prism shield)
function buildNullifier(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const iron = METAL.iron();
  const glow = METAL.glow(hex);

  // Floating crystalline prism
  const prism = part(octaGeo(0.26), glow, 0, 0, 0, { sy: 1.6 });
  g.add(prism);

  // Three spinning orbit loops
  const loop1 = part(torusGeo(0.45, 0.015, 12), iron, 0, 0, 0, { rx: Math.PI / 2 });
  const loop2 = part(torusGeo(0.48, 0.015, 12), iron, 0, 0, 0, { ry: Math.PI / 2 });
  g.add(loop1); g.add(loop2);

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    // Float bobbing
    g.position.y = 0.9 + Math.sin(now * 2.8) * 0.12;
    // Spin loops
    loop1.rotation.y += dt * 3.5;
    loop1.rotation.x += dt * 1.5;
    loop2.rotation.z -= dt * 4.2;
    prism.rotation.y += dt * 1.8;
  };

  return { group: g, height: 1.5 };
}

// 14. AH_COLOSSUS (Scrap Colossus titan mech)
function buildColossus(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const iron = METAL.iron();
  const bronze = METAL.bronze();
  const glow = METAL.glow(hex);

  // Four massive arachnoid legs (hip-pivoted)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.38;
    const leg = pivotAt(Math.cos(a) * 0.44, 0.6, Math.sin(a) * 0.44);
    leg.add(part(cylGeo(0.15, 0.15, 0.8, 6), iron, 0, -0.4, 0, { rx: Math.sin(a) * 0.4, rz: -Math.cos(a) * 0.4 }));
    leg.add(part(boxGeo(0.26, 0.16, 0.42), bronze, 0, -0.8, 0.18 * Math.sin(a))); // claw foot
    g.add(leg);
    anim.legs.push(leg);
  }

  // Giant circular scrap hull
  g.add(part(cylGeo(0.85, 0.95, 0.58, 8), iron, 0, 0.8, 0));
  g.add(part(sphGeo(0.55, 10), bronze, 0, 1.1, 0)); // brass dome cover

  // Massive wrecking ball arm R, grinding shredder claw L
  const armL = pivotAt(-0.8, 0.9, 0.2);
  armL.add(part(cylGeo(0.1, 0.1, 0.68, 6), iron, 0, -0.3, 0));
  const gear = part(cylGeo(0.42, 0.42, 0.08, 10), iron, 0, -0.65, 0.15, { rx: Math.PI / 2 });
  armL.add(gear);

  const armR = pivotAt(0.8, 0.9, 0.2);
  armR.add(part(cylGeo(0.1, 0.1, 0.68, 6), iron, 0, -0.3, 0));
  const ball = part(sphGeo(0.36, 10), bronze, 0, -0.65, 0.15); // giant metal ball
  armR.add(ball);

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    // Spin left gear claw
    gear.rotation.y += (speed > 0.4 ? 16 : 4) * dt;
  };

  return { group: g, height: 2.1 };
}

// 15. AH_BRASS_AVIATOR (Brass ornithopter plane)
function buildBrassAviator(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const bronze = METAL.bronze();
  const iron = METAL.iron();

  // Central glider fuselage (steampunk plane)
  g.add(part(cylGeo(0.18, 0.1, 0.92, 8), bronze, 0, 0, 0, { rx: Math.PI / 2 })); // body
  
  // Spinning propeller at front
  const prop = new THREE.Group();
  prop.position.set(0, 0, 0.52);
  prop.add(part(boxGeo(0.04, 0.64, 0.03), iron, 0, 0, 0));
  prop.add(part(sphGeo(0.07, 6), bronze, 0, 0, 0));
  g.add(prop);

  // Left/Right wings (cloth-covered brass frames)
  const wingL = pivotAt(-0.16, 0.05, 0);
  wingL.add(part(boxGeo(0.82, 0.02, 0.48), team(hex, 'cloth'), -0.42, 0, 0, { rz: -0.1 }));
  const wingR = pivotAt(0.16, 0.05, 0);
  wingR.add(part(boxGeo(0.82, 0.02, 0.48), team(hex, 'cloth'), 0.42, 0, 0, { rz: 0.1 }));
  
  g.add(wingL); g.add(wingR);

  // Tail fins
  g.add(part(boxGeo(0.02, 0.32, 0.24), bronze, 0, 0.2, -0.42)); // vertical tail

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    // Hover altitude bobbing
    g.position.y = 1.35 + Math.sin(now * 4.0) * 0.1;
    // Propeller spinning rapidly
    prop.rotation.z += dt * 32.0;
    // Wing flapping
    const flap = Math.sin(now * 12.0) * 0.18;
    wingL.rotation.z = -flap;
    wingR.rotation.z = flap;
  };

  return { group: g, height: 1.5 };
}

// 16. AH_STEAM_GOLEM (Steam Golem giant robot)
function buildSteamGolem(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const bronze = METAL.bronze();
  const iron = METAL.iron();

  // Giant legs
  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.28, 0.6, 0);
    leg.add(part(cylGeo(0.15, 0.18, 0.62, 8), iron, 0, -0.31, 0));
    leg.add(part(boxGeo(0.3, 0.15, 0.35), bronze, 0, -0.62, 0.05));
    g.add(leg);
    anim.legs.push(leg);
  }

  // Giant spherical brass torso
  g.add(part(sphGeo(0.55, 10), bronze, 0, 1.25, 0));
  
  // Double boilers venting steam on shoulders
  g.add(part(cylGeo(0.16, 0.16, 0.48, 8), iron, -0.44, 1.48, -0.15));
  g.add(part(cylGeo(0.16, 0.16, 0.48, 8), iron, 0.44, 1.48, -0.15));

  // Small gear head
  g.add(part(cylGeo(0.18, 0.18, 0.1, 10), iron, 0, 1.8, 0.1, { rx: Math.PI / 2 }));
  g.add(part(sphGeo(0.045, 6), METAL.glow(hex), -0.06, 1.8, 0.18));
  g.add(part(sphGeo(0.045, 6), METAL.glow(hex), 0.06, 1.8, 0.18));

  // Heavy fist arms
  const armL = pivotAt(-0.62, 1.3, 0);
  armL.add(part(cylGeo(0.1, 0.1, 0.58, 6), iron, 0, -0.28, 0));
  armL.add(part(sphGeo(0.24, 8), bronze, 0, -0.58, 0.08));

  const armR = pivotAt(0.62, 1.3, 0);
  armR.add(part(cylGeo(0.1, 0.1, 0.58, 6), iron, 0, -0.28, 0));
  armR.add(part(sphGeo(0.24, 8), bronze, 0, -0.58, 0.08));

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  return { group: g, height: 2.1 };
}

// 17. AH_MECHANIZED_SCOUT (Monocycle speed scout)
function buildMechanizedScout(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const iron = METAL.iron();
  const bronze = METAL.bronze();

  // A huge central rolling wheel
  const wheel = part(cylGeo(0.58, 0.58, 0.22, 12), iron, 0, 0.58, 0, { rz: Math.PI / 2 });
  g.add(wheel);

  // A brass rider body suspended inside/around the wheel
  const rider = new THREE.Group();
  rider.position.set(0, 0.65, 0.05);
  rider.add(part(boxGeo(0.3, 0.44, 0.44), bronze, 0, 0, -0.1));
  rider.add(part(sphGeo(0.12, 8), iron, 0, 0.32, 0.02)); // head
  rider.add(part(sphGeo(0.035, 6), METAL.glow(hex), 0, 0.32, 0.12));
  g.add(rider);

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    // Spin giant wheel
    wheel.rotation.x += speed * dt * 4.5;
    // Rider leans forward depending on speed
    rider.rotation.x = (speed > 0.4 ? 0.35 : 0.05);
  };

  return { group: g, height: 1.35 };
}

// 18. AH_PYROCLASTIC_MACHINE (Mobile furnace)
function buildPyroclasticMachine(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const iron = METAL.iron();
  const lava = MAT.lava();

  // Heavy boxy tank body
  g.add(part(boxGeo(0.92, 0.52, 1.25), iron, 0, 0.38, 0));

  // Glowing furnace grate at front
  g.add(part(boxGeo(0.72, 0.32, 0.04), lava, 0, 0.38, 0.635));

  // 4 iron wheel studs
  const wheels = [];
  for (const [sx, sz] of [[-0.5, -0.42], [0.5, -0.42], [-0.5, 0.42], [0.5, 0.42]]) {
    const wheel = part(cylGeo(0.28, 0.28, 0.14, 10), iron, sx, 0.28, sz, { rz: Math.PI / 2 });
    g.add(wheel);
    wheels.push(wheel);
  }

  // Shoulder mortar launching fireballs
  const cannon = part(cylGeo(0.14, 0.14, 0.58, 8), iron, 0, 0.72, 0, { rx: 0.95 });
  g.add(cannon);

  anim.toolArm = cannon;
  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    if (speed > 0.4) {
      wheels.forEach(w => w.rotation.x += speed * dt * 2.8);
    }
  };

  return { group: g, height: 1.15 };
}

// 19. AH_STEEL_CHARGER (Clockwork tiger)
function buildSteelCharger(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const iron = METAL.iron();
  const glow = METAL.glow(hex);

  // Quadruped chassis body
  g.add(part(boxGeo(0.42, 0.42, 1.05), iron, 0, 0.65, 0));

  // 4 jointed running legs
  const hipY = 0.65;
  const legFL = pivotAt(-0.18, hipY, 0.35);
  legFL.add(part(cylGeo(0.06, 0.05, 0.55, 6), iron, 0, -0.28, 0));
  g.add(legFL); anim.legs.push(legFL);

  const legFR = pivotAt(0.18, hipY, 0.35);
  legFR.add(part(cylGeo(0.06, 0.05, 0.55, 6), iron, 0, -0.28, 0));
  g.add(legFR); anim.legs.push(legFR);

  const legBL = pivotAt(-0.18, hipY, -0.35);
  legBL.add(part(cylGeo(0.06, 0.05, 0.55, 6), iron, 0, -0.28, 0));
  g.add(legBL); anim.legs.push(legBL);

  const legBR = pivotAt(0.18, hipY, -0.35);
  legBR.add(part(cylGeo(0.06, 0.05, 0.55, 6), iron, 0, -0.28, 0));
  g.add(legBR); anim.legs.push(legBR);

  // Mechanical head with glowing ears
  g.add(part(boxGeo(0.24, 0.24, 0.32), iron, 0, 0.88, 0.52));
  g.add(part(sphGeo(0.035, 6), glow, -0.07, 0.94, 0.68));
  g.add(part(sphGeo(0.035, 6), glow, 0.07, 0.94, 0.68));

  g.userData.anim = anim;
  return { group: g, height: 1.15 };
}

// 20. AH_FORGE_SENTINEL (Heavy brass sentinel)
function buildForgeSentinel(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const brass = METAL.brass();
  const iron = METAL.iron();

  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.2, 0.58, 0);
    leg.add(part(cylGeo(0.08, 0.1, 0.55, 8), iron, 0, -0.25, 0));
    leg.add(part(boxGeo(0.2, 0.12, 0.28), brass, 0, -0.58, 0.03));
    g.add(leg);
    anim.legs.push(leg);
  }

  g.add(part(boxGeo(0.5, 0.62, 0.44), brass, 0, 0.88, 0));
  g.add(part(sphGeo(0.15, 8), iron, 0, 1.28, 0.02)); // head
  g.add(part(sphGeo(0.04, 6), METAL.glow(hex), 0, 1.28, 0.15));

  // Big lava hammer on R arm
  const armL = pivotAt(-0.35, 1.05, 0.02);
  armL.add(part(cylGeo(0.06, 0.06, 0.48, 6), iron, 0, -0.24, 0));
  armL.add(part(sphGeo(0.12, 6), brass, 0, -0.48, 0));

  const armR = pivotAt(0.35, 1.05, 0.02);
  armR.add(part(cylGeo(0.06, 0.06, 0.48, 6), iron, 0, -0.24, 0));
  
  const ham = new THREE.Group();
  ham.add(part(boxGeo(0.24, 0.24, 0.48), MAT.lava(), 0, -0.62, 0.12)); // glowing hammer head
  armR.add(ham);

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  return { group: g, height: 1.55 };
}

// 21. AH_SHOCK_SENTINEL (Ranged shocker sentinel)
function buildShockSentinel(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const iron = METAL.iron();
  const glow = METAL.glow(hex);

  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.16, 0.58, 0);
    leg.add(part(cylGeo(0.07, 0.07, 0.55, 6), iron, 0, -0.25, 0));
    leg.add(part(boxGeo(0.16, 0.1, 0.22), iron, 0, -0.55, 0.03));
    g.add(leg);
    anim.legs.push(leg);
  }

  g.add(part(cylGeo(0.32, 0.35, 0.6, 8), iron, 0, 0.88, 0));

  // Dual shoulder-mounted tesla coils
  g.add(part(cylGeo(0.04, 0.04, 0.4, 6), iron, -0.22, 1.25, 0.05, { rx: 0.6 }));
  g.add(part(sphGeo(0.09, 8), glow, -0.22, 1.45, 0.18));

  g.add(part(cylGeo(0.04, 0.04, 0.4, 6), iron, 0.22, 1.25, 0.05, { rx: 0.6 }));
  g.add(part(sphGeo(0.09, 8), glow, 0.22, 1.45, 0.18));

  g.userData.anim = anim;
  return { group: g, height: 1.6 };
}

// 22. AH_OVERCHARGED_CORE (Floating plasma core)
function buildOverchargedCore(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const iron = METAL.iron();
  const glow = METAL.glow(hex);

  // Large plasma core ball in center
  const core = part(sphGeo(0.32, 10), glow, 0, 0, 0);
  g.add(core);

  // Spinning orbital rings representing gear teeth
  const loop1 = part(torusGeo(0.55, 0.03, 10), iron, 0, 0, 0, { rx: Math.PI / 2 });
  const loop2 = part(torusGeo(0.6, 0.03, 10), iron, 0, 0, 0);
  g.add(loop1); g.add(loop2);

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    // Hover bobbing
    g.position.y = 1.25 + Math.sin(now * 3.5) * 0.15;
    // Rotate orbits
    loop1.rotation.y += dt * 3.8;
    loop2.rotation.z -= dt * 4.4;
    core.scale.setScalar(0.95 + Math.sin(now * 15) * 0.06);
  };

  return { group: g, height: 1.7 };
}

// 23. AH_TINKER_HERO (Tinker clockwork dwarf)
function buildTinkerHero(type, hex) {
  const g = new THREE.Group();
  const anim = { legs: [], arms: [], toolArm: null };
  const brass = METAL.brass();
  const iron = METAL.iron();

  // Short thick legs
  for (const sx of [-1, 1]) {
    const leg = pivotAt(sx * 0.14, 0.44, 0);
    leg.add(part(cylGeo(0.08, 0.08, 0.4, 6), iron, 0, -0.18, 0));
    leg.add(part(boxGeo(0.18, 0.1, 0.24), brass, 0, -0.4, 0.04));
    g.add(leg);
    anim.legs.push(leg);
  }

  // Chunky copper torso
  g.add(part(boxGeo(0.48, 0.48, 0.4), brass, 0, 0.68, 0));

  // Giant copper goggles on head
  g.add(part(sphGeo(0.15, 8), iron, 0, 0.98, 0.02));
  g.add(part(boxGeo(0.25, 0.08, 0.04), brass, 0, 0.98, 0.12));
  g.add(part(cylGeo(0.06, 0.06, 0.08, 8), METAL.glow(hex), -0.06, 0.98, 0.14, { rx: Math.PI / 2 }));
  g.add(part(cylGeo(0.06, 0.06, 0.08, 8), METAL.glow(hex), 0.06, 0.98, 0.14, { rx: Math.PI / 2 }));

  // Robotic claw backpack extending over shoulder
  const clawBack = new THREE.Group();
  clawBack.position.set(-0.16, 0.88, -0.22);
  clawBack.add(part(cylGeo(0.03, 0.03, 0.58, 6), iron, 0, 0.22, 0.1, { rx: 0.5 })); // shoulder armature
  clawBack.add(part(boxGeo(0.14, 0.14, 0.14), brass, 0, 0.48, 0.25)); // wrist block
  clawBack.add(part(coneGeo(0.04, 0.18, 4), iron, -0.05, 0.58, 0.32, { rx: 0.8 })); // finger L
  clawBack.add(part(coneGeo(0.04, 0.18, 4), iron, 0.05, 0.58, 0.32, { rx: 0.8 })); // finger R
  g.add(clawBack);

  // Giant wrench hammer in right hand
  const wrench = new THREE.Group();
  wrench.add(part(cylGeo(0.025, 0.025, 0.85, 6), iron, 0, 0, 0));
  wrench.add(part(boxGeo(0.22, 0.14, 0.14), brass, 0, 0.35, 0));
  wrench.add(part(boxGeo(0.08, 0.16, 0.28), iron, 0, 0.38, 0)); // wrench claw head
  wrench.position.set(0.02, -0.16, 0.18);

  const armL = pivotAt(-0.3, 0.8, 0.02);
  armL.add(part(cylGeo(0.05, 0.05, 0.38, 6), iron, 0, -0.18, 0));
  
  const armR = pivotAt(0.3, 0.8, 0.02);
  armR.add(part(cylGeo(0.05, 0.05, 0.38, 6), iron, 0, -0.18, 0));
  armR.add(wrench);

  g.add(armL); g.add(armR);
  anim.arms.push(armL, armR);
  anim.toolArm = armR;

  g.userData.anim = anim;
  g.userData.customAnimate = (unit, dt, now, speed) => {
    // Snap robotic claw open/shut based on attack FSM
    const snap = unit._attackAnim < 1 ? Math.sin(unit._attackAnim * Math.PI) : 0;
    clawBack.rotation.y = Math.sin(now * 1.5) * 0.15;
  };

  return { group: g, height: 1.4 };
}

// ═════════════════════════════════════════════════════════════════════════════
// ARTIFICE HORDE BUILDINGS (23 Unique Models)
// ═════════════════════════════════════════════════════════════════════════════

export function buildArtificeBuilding(type, colorHex) {
  const g = new THREE.Group();
  const id = type.id;
  const R = type.radius;
  
  const iron = METAL.iron();
  const brass = METAL.brass();
  const glow = METAL.glow(colorHex);

  let height = 3.5;

  if (id === 'AH_NEXUS') {
    // Nexus Tier 1 Hall: Concentric gears rotating, void portal center
    const w = R * 1.6;
    g.add(part(boxGeo(w, 2.2, w), iron, 0, 1.1, 0)); // mechanical base
    g.add(part(cylGeo(w * 0.65, w * 0.65, 0.8, 10), brass, 0, 2.6, 0)); // collar
    
    // Rotating gear meshes named 'core'
    const gearOuter = part(cylGeo(w * 0.58, w * 0.58, 0.14, 12), iron, 0, 3.1, 0);
    g.add(gearOuter);
    
    const core = part(octaGeo(0.6), glow, 0, 3.1, 0);
    core.name = 'core';
    core.userData = { baseY: 3.1 };
    g.add(core);

    g.userData.customAnimate = (b, dt, now) => {
      gearOuter.rotation.y = now * 1.2;
    };
    height = 4.2;
  }
  else if (id === 'AH_DEN') {
    // Stalker Den (Barracks Tier 1): Ribbed cage dome with pulsing core
    const w = R * 1.5;
    g.add(part(cylGeo(w * 0.72, w * 0.82, 1.4, 8), iron, 0, 0.7, 0));
    g.add(part(sphGeo(w * 0.58, 10), iron, 0, 1.35, 0, { sy: 0.6 })); // cage top
    
    const core = part(sphGeo(0.48, 8), glow, 0, 0.95, 0);
    core.name = 'core';
    core.userData = { baseY: 0.95 };
    g.add(core);
    height = 2.4;
  }
  else if (id === 'AH_OBELISK') {
    // Obelisk (Supply Tier 1): Floating spires
    const w = R * 1.4;
    g.add(part(cylGeo(w * 0.35, w * 0.5, 0.8, 6), iron, 0, 0.4, 0)); // base pedestal
    
    const spire1 = part(coneGeo(0.24, 1.8, 5), iron, 0, 1.8, 0);
    const spire2 = part(coneGeo(0.18, 1.2, 5), glow, 0, 3.1, 0); // floating top spire
    g.add(spire1); g.add(spire2);

    g.userData.customAnimate = (b, dt, now) => {
      spire2.position.y = 3.1 + Math.sin(now * 3.5) * 0.15;
      spire2.rotation.y = now * 2.2;
    };
    height = 3.9;
  }
  else if (id === 'AH_WORKSHOP') {
    // Workshop: smoking chimney stack, spinning cog wheel on front
    const w = R * 1.5;
    g.add(part(boxGeo(w, 1.6, w * 0.9), iron, 0, 0.8, 0));
    g.add(part(boxGeo(w * 1.05, 0.7, w * 0.95), brass, 0, 1.95, 0)); // flat cap
    
    // Steam chimney pipe
    g.add(part(cylGeo(0.1, 0.1, 1.2, 6), iron, w * 0.35, 1.8, -w * 0.32));
    
    // Front spinning gear decoration
    const cog = part(cylGeo(0.38, 0.38, 0.05, 10), iron, 0, 0.8, w * 0.46, { rx: Math.PI / 2 });
    g.add(cog);

    g.userData.customAnimate = (b, dt, now) => {
      cog.rotation.z = now * 1.6;
    };
    height = 2.6;
  }
  else if (id === 'AH_ASSEMBLY_LINE') {
    // Assembly Line: mechanical arms and a conveyor belt structure
    const w = R * 1.6;
    g.add(part(boxGeo(w * 1.1, 0.58, w * 0.8), iron, 0, 0.29, 0)); // flat platform table
    
    // Industrial mechanical crane arm
    const crane = new THREE.Group();
    crane.position.set(-w * 0.35, 0.58, 0);
    crane.add(part(cylGeo(0.06, 0.06, 0.85, 6), iron, 0, 0.42, 0)); // vertical mast
    const boom = part(boxGeo(0.1, 0.1, 0.65), brass, 0, 0.8, 0.25, { rx: 0.15 }); // boom arm
    crane.add(boom);
    g.add(crane);

    g.userData.customAnimate = (b, dt, now) => {
      crane.rotation.y = Math.sin(now * 2.0) * 0.5;
    };
    height = 2.5;
  }
  else if (id === 'AH_TESLA_TOWER') {
    // Tesla Tower: sparks / lightning node coils
    const w = R * 1.5;
    g.add(part(cylGeo(0.38, 0.52, 3.2, 8), iron, 0, 1.6, 0)); // base pillar
    
    // Stack of brass coil disks
    for (let i = 0; i < 4; i++) {
      g.add(part(torusGeo(0.38 - i * 0.05, 0.04, 12), brass, 0, 2.2 + i * 0.38, 0, { rx: Math.PI / 2 }));
    }
    const orb = part(sphGeo(0.28, 8), glow, 0, 4.1, 0);
    g.add(orb);

    g.userData.customAnimate = (b, dt, now) => {
      orb.scale.setScalar(0.95 + Math.sin(now * 30.0) * 0.06);
    };
    height = 4.8;
  }
  else if (id === 'AH_GENERATOR') {
    // Power Generator supply: spinning internal dynamo armature
    const w = R * 1.5;
    g.add(part(cylGeo(w * 0.65, w * 0.72, 0.8, 8), iron, 0, 0.4, 0)); // stator frame
    
    // Spinning copper rotor
    const rotor = part(cylGeo(0.24, 0.24, 1.4, 6), brass, 0, 1.0, 0);
    g.add(rotor);

    g.userData.customAnimate = (b, dt, now) => {
      rotor.rotation.y = now * 6.8;
    };
    height = 2.8;
  }
  else if (id === 'AH_STEAM_PLANT') {
    // Steam Plant: heavy boilers, pistons pumping up and down
    const w = R * 1.5;
    g.add(part(boxGeo(w, 1.5, w), bronzeBanner(colorHex), 0, 0.75, 0)); // core structure
    
    // Steam boilers
    g.add(part(cylGeo(0.28, 0.28, 1.15, 8), iron, -w * 0.32, 1.3, -w * 0.28));
    g.add(part(cylGeo(0.28, 0.28, 1.15, 8), iron, w * 0.32, 1.3, -w * 0.28));

    // Two moving pistons on the front
    const pistL = part(cylGeo(0.06, 0.06, 0.65, 6), iron, -w * 0.3, 0.75, w * 0.52);
    const pistR = part(cylGeo(0.06, 0.06, 0.65, 6), iron, w * 0.3, 0.75, w * 0.52);
    g.add(pistL); g.add(pistR);

    g.userData.customAnimate = (b, dt, now) => {
      pistL.position.y = 0.75 + Math.sin(now * 4.5) * 0.25;
      pistR.position.y = 0.75 - Math.sin(now * 4.5) * 0.25;
    };
    height = 2.6;
  }
  else if (id === 'AH_FOUNDRY') {
    // Scrap Foundry: a lava vat pouring molten metal
    const w = R * 1.5;
    g.add(part(boxGeo(w, 1.6, w), iron, 0, 0.8, 0));
    
    // Lava pool inside
    g.add(part(boxGeo(w * 0.62, 0.1, w * 0.62), MAT.lava(), 0, 1.55, 0));
    return { group: g, height: 2.3 };
  }
  else if (id === 'AH_CLOCKWORK_SPIRE') {
    // Clockwork Spire: tower with huge clocks
    const w = R * 1.4;
    g.add(part(cylGeo(0.42, 0.52, 4.5, 8), iron, 0, 2.25, 0));
    
    // Large brass clock faces on four sides
    const clockN = part(cylGeo(0.38, 0.38, 0.04, 12), brass, 0, 3.2, 0.44, { rx: Math.PI / 2 });
    const clockS = part(cylGeo(0.38, 0.38, 0.04, 12), brass, 0, 3.2, -0.44, { rx: Math.PI / 2 });
    g.add(clockN); g.add(clockS);

    g.userData.customAnimate = (b, dt, now) => {
      clockN.rotation.y = now * 0.5;
      clockS.rotation.y = -now * 0.5;
    };
    height = 5.8;
  }
  else if (id === 'AH_MUNITIONS_DEPOT') {
    // Munitions Depot: boxes, shells, small iron cannon on rack
    const w = R * 1.5;
    g.add(part(boxGeo(w, 1.4, w * 0.9), iron, 0, 0.7, 0));
    
    // Cannon tube lying on top
    g.add(part(cylGeo(0.15, 0.12, 1.05, 8), iron, 0, 1.55, 0, { rx: 1.52 }));
    
    // Stack of round metallic cannonball spheres
    g.add(part(sphGeo(0.12, 6), iron, -w * 0.36, 0.12, w * 0.28));
    g.add(part(sphGeo(0.12, 6), iron, -w * 0.36 + 0.2, 0.12, w * 0.28));
    return { group: g, height: 2.2 };
  }
  else if (id === 'AH_GEAR_TOWER') {
    // Gear Tower: spinning gear defensive platform
    const w = R * 1.5;
    g.add(part(cylGeo(0.38, 0.48, 3.0, 8), iron, 0, 1.5, 0)); // shaft tower
    
    // Giant horizontal cog platform on top
    const gear = part(cylGeo(0.72, 0.72, 0.16, 12), brass, 0, 3.0, 0);
    g.add(gear);

    g.userData.customAnimate = (b, dt, now) => {
      gear.rotation.y = now * 1.4;
    };
    height = 4.2;
  }
  else if (id === 'AH_REPAIR_STATION') {
    // Repair Station: cranes and scaffolding
    const w = R * 1.5;
    g.add(part(boxGeo(w, 0.25, w), iron, 0, 0.125, 0)); // base plate
    
    const derrick = new THREE.Group();
    derrick.position.set(0, 0.25, 0);
    derrick.add(part(cylGeo(0.05, 0.05, 1.4, 6), iron, 0, 0.7, 0));
    derrick.add(part(boxGeo(0.08, 0.08, 0.72), brass, 0, 1.35, 0.25, { rx: 0.15 })); // crane boom
    g.add(derrick);

    g.userData.customAnimate = (b, dt, now) => {
      derrick.rotation.y = Math.sin(now * 1.8) * 0.6;
    };
    height = 2.4;
  }
  else if (id === 'AH_CHRONO_LAB') {
    // Chrono Lab: solar-system gear model rotating
    const w = R * 1.5;
    g.add(part(cylGeo(w * 0.65, w * 0.72, 1.2, 8), iron, 0, 0.6, 0)); // base cylinder
    
    // Chrono rings rotating name 'core'
    const ring1 = part(torusGeo(w * 0.44, 0.02, 10), glow, 0, 1.3, 0, { rx: Math.PI / 2 });
    const ring2 = part(torusGeo(w * 0.28, 0.02, 10), brass, 0, 1.4, 0, { rx: Math.PI / 2 });
    g.add(ring1); g.add(ring2);

    g.userData.customAnimate = (b, dt, now) => {
      ring1.rotation.y = now * 2.5;
      ring2.rotation.y = -now * 1.8;
    };
    height = 2.3;
  }
  else if (id === 'AH_BRASS_FORGE') {
    // Brass Forge: smelting hearth
    const w = R * 1.5;
    g.add(part(boxGeo(w, 1.6, w), brass, 0, 0.8, 0));
    
    // Front arch door slot
    g.add(part(boxGeo(0.55, 0.95, 0.12), iron, 0, 0.48, w * 0.51));
    return { group: g, height: 2.2 };
  }
  else if (id === 'AH_AUTOMATON_FACTORY') {
    // Automaton Factory assembly dome
    const w = R * 1.6;
    g.add(part(cylGeo(w * 0.72, w * 0.82, 1.0, 12), iron, 0, 0.5, 0)); // base wall
    g.add(part(sphGeo(w * 0.65, 12, 10), brass, 0, 0.9, 0, { sy: 0.6 })); // dome roof
    return { group: g, height: 2.1 };
  }
  else if (id === 'AH_IRON_DOME') {
    // Iron Dome defense cage
    const w = R * 1.6;
    g.add(part(torusGeo(w * 0.85, 0.1, 12), iron, 0, 0.08, 0, { rx: Math.PI / 2 }));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.38;
      g.add(part(cylGeo(0.05, 0.05, 1.8, 6), iron, Math.cos(a) * w * 0.8, 0.9, Math.sin(a) * w * 0.8, { rx: Math.sin(a) * 0.25, rz: -Math.cos(a) * 0.25 }));
    }
    return { group: g, height: 2.1 };
  }
  else if (id === 'AH_STEAM_SPIRE') {
    // Steam Spire vent
    g.add(part(cylGeo(0.24, 0.38, 3.5, 8), iron, 0, 1.75, 0));
    
    const chimney = part(cylGeo(0.18, 0.18, 0.48, 8), brass, 0, 3.7, 0);
    g.add(chimney);

    g.userData.customAnimate = (b, dt, now) => {
      chimney.scale.y = 1.0 + Math.sin(now * 15.0) * 0.08;
    };
    height = 4.4;
  }
  else if (id === 'AH_LIGHTNING_ROD') {
    // Lightning Rod
    g.add(part(cylGeo(0.04, 0.08, 4.4, 6), iron, 0, 2.2, 0));
    g.add(part(sphGeo(0.14, 8), glow, 0, 4.4, 0));
    height = 5.2;
  }
  else if (id === 'AH_SCRAP_YARD') {
    // Scrap Yard: boxes stacked
    const w = R * 1.5;
    g.add(part(boxGeo(0.65, 0.65, 0.65), iron, -w * 0.25, 0.325, -w * 0.22));
    g.add(part(boxGeo(0.58, 0.58, 0.58), brass, w * 0.28, 0.29, w * 0.2));
    g.add(part(boxGeo(0.48, 0.48, 0.48), iron, -w * 0.1, 0.88, 0));
    return { group: g, height: 1.5 };
  }
  else if (id === 'AH_BATTERY') {
    // Energy Battery supply
    const w = R * 1.5;
    g.add(part(cylGeo(w * 0.58, w * 0.65, 1.4, 8), iron, 0, 0.7, 0));
    g.add(part(sphGeo(w * 0.52, 10), glow, 0, 1.4, 0, { sy: 0.5 }));
    height = 2.4;
  }
  else if (id === 'AH_REACTOR') {
    // Aether Reactor: glowing glass tubes
    const w = R * 1.6;
    g.add(part(boxGeo(w, 1.8, w), iron, 0, 0.9, 0));
    
    // Core reactor dome
    const core = part(sphGeo(0.42, 8), glow, 0, 1.8, 0);
    core.name = 'core';
    core.userData = { baseY: 1.8 };
    g.add(core);
    height = 2.8;
  }
  else if (id === 'AH_HANGAR') {
    // Brass Hangar flight dome
    const w = R * 1.6;
    g.add(part(cylGeo(w * 0.75, w * 0.85, 0.58, 12), iron, 0, 0.29, 0)); // base landing pad
    
    // Hangar arches
    g.add(part(torusGeo(w * 0.75, 0.08, 12), brass, 0, 0.58, 0, { rx: Math.PI / 2 }));
    return { group: g, height: 2.2 };
  }

  // General fallback decoration
  g.name = type.id;
  return { group: g, height };
}
