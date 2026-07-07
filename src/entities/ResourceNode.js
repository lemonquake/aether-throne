/**
 * ResourceNode — a neutral, harvestable resource deposit (gold mine or aether
 * well). Workers walk up, harvest a trip's worth over ECONOMY.HARVEST_TIME,
 * carry it back to a drop-off building, and repeat until the node is depleted.
 *
 * A node is a full Entity (so it can be picked, ringed, and fog-culled) but
 * carries a synthesized pseudo-type (class 'RESOURCE') instead of a UnitTypes
 * entry — it has no combat stats and is never a valid attack target (neutral
 * entities are never hostile, and findNearestEnemy only returns units/
 * buildings). It registers a static cylinder collider so units path around it.
 */
import * as THREE from 'three';
import { Entity } from './Entity.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { eventBus, EVENTS } from '../engine/EventBus.js';

/** Footprint radius of a resource node (matches its collider + doodad size). */
const NODE_RADIUS = 1.6;

// Shared geometry/material caches (all nodes of a kind share GPU resources).
const _shared = {};
function shared(key, make) {
  if (!_shared[key]) _shared[key] = make();
  return _shared[key];
}

const NODE_MAT = {
  rock: () => shared('rock', () => new THREE.MeshStandardMaterial({ color: 0x4c463c, roughness: 1.0, metalness: 0.05, flatShading: true })),
  gold: () => shared('gold', () => new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0x7a5211, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.85, flatShading: true })),
  aether: () => shared('aether', () => new THREE.MeshStandardMaterial({ color: 0x6cf0f0, emissive: 0x11868c, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.2, flatShading: true })),
  pool: () => shared('pool', () => new THREE.MeshStandardMaterial({ color: 0x7ff0ff, emissive: 0x2fd0e0, emissiveIntensity: 0.8, transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.3 })),
  stone: () => shared('stone', () => new THREE.MeshStandardMaterial({ color: 0x8a8f98, roughness: 0.9, metalness: 0.05 })),
};

const NODE_GEO = {
  octa: (r) => shared(`octa${r}`, () => new THREE.OctahedronGeometry(r, 0)),
  ico: (r) => shared(`ico${r}`, () => new THREE.IcosahedronGeometry(r, 0)),
  cone: (r, h) => shared(`cone${r}_${h}`, () => new THREE.ConeGeometry(r, h, 6)),
};

/**
 * Build the distinct model group for a resource kind.
 * @param {boolean} isGold
 * @returns {THREE.Group}
 */
function buildNodeModel(isGold) {
  const g = new THREE.Group();
  const mk = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  if (isGold) {
    // Rocky outcrop studded with gold crystal shards.
    mk(NODE_GEO.ico(1.25), NODE_MAT.rock(), 0, 0.5, 0, 1.1, 0.6, 1.1, 0.5);
    const spots = [[0, 0.9, 0, 1.3], [0.7, 0.7, 0.3, 0.9], [-0.6, 0.7, -0.4, 0.85], [0.2, 0.6, -0.7, 0.7], [-0.5, 0.6, 0.6, 0.75]];
    for (const [x, y, z, s] of spots) {
      mk(NODE_GEO.octa(0.5), NODE_MAT.gold(), x, y, z, s, s * 1.6, s, (x + z) * 3);
    }
  } else {
    // Stone-rimmed aether pool with a central glowing spire + floating shards.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.28, 8, 16), NODE_MAT.stone());
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.28;
    ring.castShadow = true;
    g.add(ring);
    const poolGeo = new THREE.CircleGeometry(1.1, 20);
    poolGeo.rotateX(-Math.PI / 2);
    mk(poolGeo, NODE_MAT.pool(), 0, 0.18, 0);
    mk(NODE_GEO.cone(0.55, 2.6), NODE_MAT.aether(), 0, 1.5, 0);
    mk(NODE_GEO.octa(0.32), NODE_MAT.aether(), 0.8, 1.0, 0.2, 1, 1.4, 1, 0.6);
    mk(NODE_GEO.octa(0.26), NODE_MAT.aether(), -0.7, 1.3, -0.3, 1, 1.4, 1, 1.2);
  }
  return g;
}

export class ResourceNode extends Entity {
  /**
   * @param {import('../engine/GameEngine.js').GameEngine} engine
   * @param {'GOLD_MINE'|'AETHER_WELL'} kind
   * @param {THREE.Vector3} position
   */
  constructor(engine, kind, position) {
    const isGold = kind === 'GOLD_MINE';
    // Synthesized pseudo-type — enough for Entity's bookkeeping + fog + picking.
    const pseudoType = {
      id: kind,
      name: isGold ? 'Gold Mine' : 'Aether Well',
      class: 'RESOURCE',
      radius: NODE_RADIUS * 2.3,
      hp: 1, // never actually damaged (neutral, non-targetable)
      mana: 0,
      armor: 0,
      armorType: 'FORTIFIED',
      sightRadius: 0,
    };
    super(engine, pseudoType, null, position);

    /** @type {'GOLD_MINE'|'AETHER_WELL'} */
    this.kind = kind;
    /** @type {number} Remaining harvestable resource. */
    this.amount = isGold
      ? GAME_CONFIG.ECONOMY.GOLD_MINE_AMOUNT
      : GAME_CONFIG.ECONOMY.AETHER_WELL_AMOUNT;

    // ── Visual: distinct model per kind (gold outcrop / aether pool) ──
    this._body = buildNodeModel(isGold);
    this._body.scale.set(2.3, 2.3, 2.3);
    this.mesh.add(this._body);

    // Anim timers
    this._harvestFrameTimer = 0;
    this._harvestAccum = 0;

    // ── Static collider so units path around the deposit ─────────────
    this._staticCollider = engine.physics
      ? engine.physics.addStaticCylinder(
          { x: this.position.x, y: 1.5, z: this.position.z },
          NODE_RADIUS * 2.3,
          3
        )
      : null;
  }

  /**
   * Extract up to `requested` resource. Depletes and dies when empty.
   * @param {number} requested - Amount the worker wants this trip.
   * @returns {number} Amount actually granted (0 once empty).
   */
  harvest(requested) {
    if (this.isDead || this.amount <= 0) return 0;
    const granted = Math.min(requested, this.amount);
    this.amount -= granted;
    if (this.amount <= 0) {
      this.amount = 0;
      eventBus.emit(EVENTS.RESOURCE_DEPLETED, { node: this });
      this.die(null); // Entity.die won't emit UNIT/BUILDING events for RESOURCE
    }
    return granted;
  }

  onHarvestFrame(dt) {
    this._harvestFrameTimer = 0.2;
    this._harvestAccum += dt;
  }

  /** Resource nodes update their bouncy animations or dust particles. */
  update(dt) {
    if (this.isDead) return;

    if (this._harvestFrameTimer > 0) {
      this._harvestFrameTimer -= dt;
      
      if (this.kind === 'AETHER_WELL') {
        // Bouncy squash-and-stretch animation
        const bounceY = 1.0 + 0.15 * Math.abs(Math.sin(this._harvestAccum * 14));
        const bounceXZ = 1.0 - 0.05 * Math.abs(Math.sin(this._harvestAccum * 14));
        this._body.scale.set(2.3 * bounceXZ, 2.3 * bounceY, 2.3 * bounceXZ);
      } else if (this.kind === 'GOLD_MINE') {
        // Slow drifting gold dust particles
        if (Math.random() < 0.12 && this.engine.fx) {
          const px = this.position.x + (Math.random() - 0.5) * 3.5;
          const pz = this.position.z + (Math.random() - 0.5) * 3.5;
          const py = this.position.y + 0.5 + Math.random() * 2.0;
          const contactPos = new THREE.Vector3(px, py, pz);
          
          this.engine.fx.spawn('spark', contactPos, '#ffd24a', {
            vx: (Math.random() - 0.5) * 1.5,
            vy: -Math.random() * 0.8 - 0.2, // drifting down slowly (gold dust!)
            vz: (Math.random() - 0.5) * 1.5,
            grav: 0.8, // low gravity
            scale: Math.random() * 0.4 + 0.2
          });
        }
      }
    } else {
      if (this.kind === 'AETHER_WELL') {
        this._body.scale.set(2.3, 2.3, 2.3);
      }
    }
  }
}
