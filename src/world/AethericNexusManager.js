/**
 * AethericNexusManager — replaces TerrainManager.
 * Renders the play field as a floating Aetheric Matrix Arena.
 * 
 * Instead of a sculpted terrain with heights and procedural texture blending,
 * it builds a flat, glowing holographic energy grid suspended in cosmic space.
 */

import * as THREE from 'three';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { getNexusType, DEFAULT_NEXUS } from '../config/Nexuses.js';
import { buildAetherSpireModel, buildEnergyMonolithModel, buildVoidFissureModel, buildTreeModel } from './ModelFactory.js';
import { getGrassHDTexture, getDirtHDTexture } from './ProceduralTextures.js';

const NEXUS_SEED = 0xa37f9e;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class AethericNexusManager {
  constructor(engine) {
    this.engine = engine;
    this.nexusId = this.engine.matchConfig?.mapId || DEFAULT_NEXUS;
    // Map mapId (historically stored) to nexusId
    if (this.nexusId === 'aether_plains' || this.nexusId === 'ironhold_caldera') {
      this.nexusId = 'aether_core';
    }
    this.nexusType = getNexusType(this.nexusId);
    this._seed = NEXUS_SEED;

    this.size = {
      width: GAME_CONFIG.MAP.WIDTH,
      depth: GAME_CONFIG.MAP.DEPTH,
    };

    this.groundMesh = null;
    this.startLocations = [];
    this.neutralNodes = [];

    const margin = GAME_CONFIG.CAMERA.BOUNDS_MARGIN;
    this._bounds = Object.freeze({
      minX: -this.size.width / 2 + margin,
      maxX: this.size.width / 2 - margin,
      minZ: -this.size.depth / 2 + margin,
      maxZ: this.size.depth / 2 - margin,
    });

    this._sceneObjects = [];
    this._staticObstacles = [];
    this._fogMaterials = [];

    // Creep camps scattered procedurally across the energy matrix
    this.neutralCamps = [
      {
        id: 'center_boss',
        x: 0,
        z: 0,
        radius: 14,
        rewardGold: 150,
        respawnSeconds: 60,
        units: [{ typeId: 'NH_BEHEMOTH', count: 1 }, { typeId: 'NH_MYSTIC', count: 2 }]
      },
      {
        id: 'outer_camp_1',
        x: -120,
        z: 120,
        radius: 10,
        rewardGold: 60,
        respawnSeconds: 60,
        units: [{ typeId: 'NH_MARAUDER', count: 2 }, { typeId: 'NH_SENTINEL', count: 1 }]
      },
      {
        id: 'outer_camp_2',
        x: 120,
        z: -120,
        radius: 10,
        rewardGold: 60,
        respawnSeconds: 60,
        units: [{ typeId: 'NH_MARAUDER', count: 2 }, { typeId: 'NH_SENTINEL', count: 1 }]
      }
    ];

    this._computeStartLocations();
    this._computeNeutralNodes();
  }

  build() {
    const scene = this.engine.scene;
    const colorHex = this.nexusType.resonanceColor;

    // 1) Build the energy matrix floor
    this._buildGround(colorHex);

    // 2) Build static obstacles (Void Fissures, Aetheric Spires, Energy Monoliths)
    this._buildVoidFissures();
    this._buildSpiresAndMonoliths();

    // 3) Register grid helper for debug / structure placement visual
    this._buildGridHelper();
  }

  update(dt) {
    // Subtle scrolling/pulse of the matrix grid texture (skip for organic grass map)
    if (this.nexusId !== 'aether_core' && this.groundMesh && this.groundMesh.material.map) {
      this.groundMesh.material.map.offset.x += 0.005 * dt;
      this.groundMesh.material.map.offset.y += 0.003 * dt;
    }
  }

  getHeightAt(wx, wz) {
    // Flat matrix system - height is always 0.
    return 0;
  }

  isWalkable(wx, wz) {
    // Walkable if within the circular bounds of 184 units
    return (wx * wx + wz * wz <= 184 * 184);
  }

  getBounds() {
    return this._bounds;
  }

  getFogReceivers() {
    // Return materials that FogOfWar should inject into
    return this._fogMaterials;
  }

  _computeStartLocations() {
    const count = GAME_CONFIG.MAX_PLAYERS;
    const radius = GAME_CONFIG.MAP.BASE_RING_RADIUS;
    const spread = 0.55;
    const dist = 14;

    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count - Math.PI / 2;
      const pos = new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
      
      const ux = Math.cos(a);
      const uz = Math.sin(a);
      
      // Symmetrically rotate unit direction outwards by spread
      const gx = ux * Math.cos(spread) - uz * Math.sin(spread);
      const gz = ux * Math.sin(spread) + uz * Math.cos(spread);
      
      const ax = ux * Math.cos(-spread) - uz * Math.sin(-spread);
      const az = ux * Math.sin(-spread) + uz * Math.cos(-spread);
      
      const goldPos = new THREE.Vector3(pos.x + gx * dist, 0, pos.z + gz * dist);
      const aetherPos = new THREE.Vector3(pos.x + ax * dist, 0, pos.z + az * dist);
      
      this.startLocations.push({ position: pos, goldPos, aetherPos });
    }
  }

  _computeNeutralNodes() {
    // Alternate gold/aether expansion nodes near center (radius 65)
    const count = 6;
    const radius = 65;
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count + Math.PI / count;
      const kind = i % 2 === 0 ? 'GOLD_MINE' : 'AETHER_WELL';
      const pos = new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
      this.neutralNodes.push({ kind, position: pos });
    }
  }

  _buildGround(colorHex) {
    const geometry = new THREE.PlaneGeometry(this.size.width, this.size.depth);
    geometry.rotateX(-Math.PI / 2);

    if (this.nexusId === 'aether_core') {
      // Lush green Forest Fields using grass_hd texture
      const texture = getGrassHDTexture();
      texture.repeat.set(32, 32);

      const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.8,
        metalness: 0.05,
      });

      this.groundMesh = new THREE.Mesh(geometry, material);
      this.groundMesh.name = 'nexus-ground';
      this.groundMesh.receiveShadow = true;
      
      this.engine.scene.add(this.groundMesh);
      this._sceneObjects.push(this.groundMesh);

      // Build dirt pathways from each start location to the center
      const dirtTex = getDirtHDTexture();
      dirtTex.repeat.set(1, 10);
      const dirtMat = new THREE.MeshStandardMaterial({
        map: dirtTex,
        roughness: 0.9,
        metalness: 0.05,
      });

      for (const loc of this.startLocations) {
        const startPos = loc.position;
        const distToCenter = startPos.length();
        const pathGeo = new THREE.PlaneGeometry(8, distToCenter);
        pathGeo.rotateX(-Math.PI / 2);
        
        const pathMesh = new THREE.Mesh(pathGeo, dirtMat);
        pathMesh.position.set(startPos.x / 2, 0.01, startPos.z / 2);
        
        // Orient path from base to center
        const angle = Math.atan2(startPos.x, startPos.z);
        pathMesh.rotation.y = angle;
        
        this.engine.scene.add(pathMesh);
        this._sceneObjects.push(pathMesh);
      }

      this._fogMaterials.push({ material: dirtMat, hide: false });

      // Add a rustic boundary ring
      const ringGeo = new THREE.RingGeometry(183.5, 184.5, 64);
      ringGeo.rotateX(-Math.PI / 2);
      const boundaryMat = new THREE.MeshStandardMaterial({
        color: 0x5c4033,
        roughness: 0.9,
        metalness: 0.1,
      });
      const ringMesh = new THREE.Mesh(ringGeo, boundaryMat);
      ringMesh.position.y = 0.02;
      this.engine.scene.add(ringMesh);
      this._sceneObjects.push(ringMesh);
      this._fogMaterials.push({ material: boundaryMat, hide: false });
    } else {
      // Holographic Energy Grid floor
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#060a16'; // Deep dark background
      ctx.fillRect(0, 0, 256, 256);

      // Draw glowing grid lines
      ctx.strokeStyle = colorHex;
      ctx.shadowColor = colorHex;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 3;

      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(256, 0);
      ctx.moveTo(0, 128); ctx.lineTo(256, 128);
      ctx.moveTo(0, 0); ctx.lineTo(0, 256);
      ctx.moveTo(128, 0); ctx.lineTo(128, 256);
      ctx.stroke();

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(50, 50);
      texture.colorSpace = THREE.SRGBColorSpace;

      const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.25,
        metalness: 0.9,
      });

      this.groundMesh = new THREE.Mesh(geometry, material);
      this.groundMesh.name = 'nexus-ground';
      this.groundMesh.receiveShadow = true;
      
      this.engine.scene.add(this.groundMesh);
      this._sceneObjects.push(this.groundMesh);

      // Add a glowing circular outer containment ring at playable boundary
      const ringGeo = new THREE.RingGeometry(183.5, 184.5, 64);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorHex),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = 0.05;
      this.engine.scene.add(ringMesh);
      this._sceneObjects.push(ringMesh);
    }
  }

  _buildVoidFissures() {
    // Void Fissures replace lakes (block navigation but visual only)
    const positions = [
      new THREE.Vector3(-100, 0, 0),
      new THREE.Vector3(100, 0, 0),
      new THREE.Vector3(0, 0, -100),
      new THREE.Vector3(0, 0, 100),
    ];

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      const radius = 22;
      
      // Register fissure obstacle
      this._staticObstacles.push({ x: pos.x, z: pos.z, r: radius * 0.95 });

      // Build 3D mesh representation
      const fissureMesh = buildVoidFissureModel(radius, this.nexusType.resonanceColor);
      fissureMesh.position.copy(pos);
      fissureMesh.position.y = 0.05; // Sit slightly above floor
      this.engine.scene.add(fissureMesh);
      this._sceneObjects.push(fissureMesh);

      // Collect fog receiver materials
      fissureMesh.traverse((child) => {
        if (child.isMesh && child.material) {
          this._fogMaterials.push({ material: child.material, hide: false });
        }
      });
    }
  }

  _buildSpiresAndMonoliths() {
    const rng = mulberry32(this._seed);
    const numSpires = Math.floor(100 * this.nexusType.doodadDensity);
    const numMonoliths = Math.floor(40 * this.nexusType.doodadDensity);

    // Helper to check if a location is clear of bases/start regions
    const isPositionClear = (x, z, checkRadius) => {
      // Keep clear of center
      if (Math.hypot(x, z) < 40) return false;

      // Keep clear of start locations
      for (const loc of this.startLocations) {
        if (Math.hypot(x - loc.position.x, z - loc.position.z) < 26) return false;
        if (Math.hypot(x - loc.goldPos.x, z - loc.goldPos.z) < 14) return false;
        if (Math.hypot(x - loc.aetherPos.x, z - loc.aetherPos.z) < 14) return false;
      }

      // Keep clear of neutral expansion spots
      for (const node of this.neutralNodes) {
        if (Math.hypot(x - node.position.x, z - node.position.z) < 16) return false;
      }

      // Keep clear of void fissures
      const fissurePositions = [
        { x: -100, z: 0 }, { x: 100, z: 0 }, { x: 0, z: -100 }, { x: 0, z: 100 }
      ];
      for (const fis of fissurePositions) {
        if (Math.hypot(x - fis.x, z - fis.z) < 32) return false;
      }

      // Must be inside outer circular bounds
      if (Math.hypot(x, z) > 180) return false;

      return true;
    };

    // Spawn Aetheric Spires (replacing trees)
    let spiresSpawned = 0;
    let attempts = 0;
    while (spiresSpawned < numSpires && attempts < 500) {
      attempts++;
      const x = (rng() - 0.5) * 360;
      const z = (rng() - 0.5) * 360;
      if (isPositionClear(x, z, 6)) {
        // Register obstacle
        this._staticObstacles.push({ x, z, r: 0.85 });

        // Add visual model
        let spire;
        if (this.nexusId === 'aether_core') {
          // Lush trees
          spire = buildTreeModel('crystal_basin', Math.floor(rng() * 4));
          spire.scale.setScalar(1.0 + rng() * 0.6);
        } else {
          spire = buildAetherSpireModel(this.nexusType.resonanceColor);
          spire.scale.setScalar(0.8 + rng() * 0.4);
        }
        spire.position.set(x, 0, z);
        spire.rotation.y = rng() * Math.PI * 2;
        this.engine.scene.add(spire);
        this._sceneObjects.push(spire);

        spire.traverse((child) => {
          if (child.isMesh && child.material) {
            this._fogMaterials.push({ material: child.material, hide: true });
          }
        });
        spiresSpawned++;
      }
    }

    // Spawn Energy Monoliths (replacing rocks)
    let monolithsSpawned = 0;
    attempts = 0;
    while (monolithsSpawned < numMonoliths && attempts < 300) {
      attempts++;
      const x = (rng() - 0.5) * 360;
      const z = (rng() - 0.5) * 360;
      if (isPositionClear(x, z, 10)) {
        // Register obstacle
        this._staticObstacles.push({ x, z, r: 2.2 });

        // Add visual model
        let monolith;
        if (this.nexusId === 'aether_core') {
          // Gray boulder
          monolith = new THREE.Group();
          const boulderMat = new THREE.MeshStandardMaterial({
            color: 0x5a5d64,
            roughness: 0.9,
            metalness: 0.1
          });
          const baseRock = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + rng() * 0.8, 1), boulderMat);
          baseRock.scale.set(1.0, 0.6 + rng() * 0.6, 1.2 + rng() * 0.4);
          monolith.add(baseRock);
        } else {
          monolith = buildEnergyMonolithModel(this.nexusType.resonanceColor);
          monolith.scale.set(1.2 + rng() * 0.8, 1.5 + rng() * 1.5, 1.2 + rng() * 0.8);
        }
        monolith.position.set(x, 0, z);
        monolith.rotation.y = rng() * Math.PI * 2;
        this.engine.scene.add(monolith);
        this._sceneObjects.push(monolith);

        monolith.traverse((child) => {
          if (child.isMesh && child.material) {
            this._fogMaterials.push({ material: child.material, hide: true });
          }
        });
        monolithsSpawned++;
      }
    }
  }

  _buildGridHelper() {
    if (this.nexusId === 'aether_core') return; // No digital grid on lush fields!
    // Flat energy lines on floor
    const grid = new THREE.GridHelper(380, 38, 0x00e5ff, 0x1f3c4d);
    grid.position.y = 0.02;
    grid.material.opacity = 0.15;
    grid.material.transparent = true;
    this.engine.scene.add(grid);
    this._sceneObjects.push(grid);
  }

  dispose() {
    const scene = this.engine.scene;
    for (const obj of this._sceneObjects) {
      scene.remove(obj);
      obj.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }
    this._sceneObjects.length = 0;
    this._staticObstacles.length = 0;
    this._fogMaterials.length = 0;
    this.groundMesh = null;
  }
}
