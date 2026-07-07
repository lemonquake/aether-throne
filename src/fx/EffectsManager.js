/**
 * EffectsManager — pooled, event-driven battlefield VFX (impact sparks, death
 * puffs, construction dust).
 *
 * Phase 5 feature (PHASE5_PROMPT.md §3.1). Kept deliberately cheap and fully
 * pooled, mirroring ProjectilePool: a fixed ring of billboard sprites sharing
 * one soft radial-dot texture. spawn() only sets a slot's transform/tint/ttl —
 * zero allocation — and the pool wraps under heavy fire (dozens of hits/sec).
 *
 * It self-subscribes to the combat/economy events on the shared bus, so no
 * other system needs to know it exists:
 *   UNIT_DAMAGED    → a quick spark at the victim.
 *   UNIT_DIED       → a larger fading puff where the unit fell.
 *   BUILDING_COMPLETE → dust kicked up at the finished structure.
 *
 * TODO(phase-6): richer effects (per-attack-type colors, muzzle flashes tied
 * to projectile spawns, ability FX) once the ability system lands.
 */
import * as THREE from 'three';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { eventBus, EVENTS } from '../engine/EventBus.js';

const FX = GAME_CONFIG.FX;

/**
 * Per-kind tuning: start/end scale + color + how long it lives. `spark`/`debris`
 * end SMALLER than they start (they shrink as they fly), while `flash` is a
 * brief bright pop at the point of impact.
 */
const KINDS = {
  impact: { start: 0.35, end: 1.1, color: '#ffe6a0', life: 0.26 },
  flash: { start: 0.6, end: 2.0, color: '#fff3cf', life: 0.15 },
  blood: { start: 0.42, end: 1.55, color: '#b91414', life: 0.34 },
  chip: { start: 0.34, end: 0.08, color: '#c9bfa8', life: 0.48 },
  dust: { start: 0.75, end: 2.4, color: '#a98355', life: 0.5 },
  spark: { start: 0.5, end: 0.06, color: '#ffd27a', life: 0.4 },
  death: { start: 0.9, end: 3.2, color: '#c9c4d6', life: 0.6 },
  debris: { start: 0.55, end: 0.12, color: '#b3a992', life: 0.65 },
  build: { start: 1.0, end: 4.0, color: '#d8c79a', life: 0.6 },
  // Big rolling fireball for building explosions (grows then fades).
  fireball: { start: 1.4, end: 4.5, color: '#ff7a1e', life: 0.65 },
  bigflash: { start: 1.2, end: 5.5, color: '#fff0c0', life: 0.22 },
};

// ── Module-scope scratch ────────────────────────────────────────────────────
const _pos = new THREE.Vector3();

/**
 * Build the shared soft-dot texture (white radial gradient → transparent).
 * @returns {THREE.CanvasTexture}
 */
function makeDotTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Build a soft dark smoke puff texture (for normal-blended rolling smoke).
 * @returns {THREE.CanvasTexture}
 */
function makeSmokeTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(38,36,34,0.9)');
  g.addColorStop(0.5, 'rgba(26,24,22,0.5)');
  g.addColorStop(1, 'rgba(18,18,18,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBloodSplatTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * size * 0.22;
    const x = size / 2 + Math.cos(a) * d;
    const y = size / 2 + Math.sin(a) * d;
    const rx = size * (0.07 + Math.random() * 0.16);
    const ry = size * (0.04 + Math.random() * 0.11);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.random() * Math.PI);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class EffectsManager {
  /**
   * @param {import('../engine/GameEngine.js').GameEngine} engine - Injected engine.
   * @param {number} [poolSize]
   */
  constructor(engine, poolSize = FX.EFFECT_POOL) {
    this.engine = engine;

    /** Shared soft-dot texture for every slot. */
    this._texture = makeDotTexture();

    /**
     * Fixed pool of billboard slots. Each owns its material (color + opacity
     * animate per-instance); the texture is shared.
     * @type {Array<{sprite:THREE.Sprite, material:THREE.SpriteMaterial,
     *   ttl:number, life:number, start:number, end:number}>}
     */
    this._slots = [];
    for (let i = 0; i < poolSize; i++) {
      const material = new THREE.SpriteMaterial({
        map: this._texture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.renderOrder = 5;
      engine.scene.add(sprite);
      // vx/vy/vz + grav let a slot fly outward as a spark/debris chunk; base
      // opacity lets a bright flash start hotter than a soft dot.
      this._slots.push({ sprite, material, ttl: 0, life: 1, start: 1, end: 1, vx: 0, vy: 0, vz: 0, grav: 0, baseOpacity: 0.9 });
    }
    this._cursor = 0;

    // ── Smoke pool (NORMAL blending, dark) — additive can't render dark smoke,
    //    so rolling explosion/fire smoke gets its own small pool. ──────────
    this._smokeTexture = makeSmokeTexture();
    this._smokeSlots = [];
    const smokeCount = Math.max(16, (poolSize / 3) | 0);
    for (let i = 0; i < smokeCount; i++) {
      const material = new THREE.SpriteMaterial({
        map: this._smokeTexture, color: 0x272320, transparent: true, depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.renderOrder = 4;
      engine.scene.add(sprite);
      this._smokeSlots.push({ sprite, material, ttl: 0, life: 1, start: 1, end: 1, vx: 0, vy: 0, vz: 0 });
    }
    this._smokeCursor = 0;

    // ── Shockwave ring pool (flat expanding rings for explosions) ─────────
    this._ringGeo = new THREE.RingGeometry(0.55, 1.0, 32);
    this._ringGeo.rotateX(-Math.PI / 2);
    this._ringSlots = [];
    for (let i = 0; i < 6; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffb24a, transparent: true, opacity: 0, depthWrite: false,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
      });
      const mesh = new THREE.Mesh(this._ringGeo, material);
      mesh.visible = false;
      mesh.renderOrder = 6;
      engine.scene.add(mesh);
      this._ringSlots.push({ mesh, material, ttl: 0, life: 1, endScale: 6 });
    }
    this._ringCursor = 0;

    this._bloodTexture = makeBloodSplatTexture();
    this._bloodGeo = new THREE.PlaneGeometry(1, 1);
    this._bloodGeo.rotateX(-Math.PI / 2);
    this._bloodSlots = [];
    for (let i = 0; i < FX.BLOOD_DECAL_POOL; i++) {
      const material = new THREE.MeshBasicMaterial({
        map: this._bloodTexture,
        color: 0x8f1212,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
      });
      const mesh = new THREE.Mesh(this._bloodGeo, material);
      mesh.visible = false;
      mesh.renderOrder = 2;
      engine.scene.add(mesh);
      this._bloodSlots.push({ mesh, material, ttl: 0, life: 1, opacity: 0.72 });
    }
    this._bloodCursor = 0;

    // Short-lived point lights for explosions and large fire pops. Shadows stay
    // off, distance is tight, and the pool is tiny so lighting feels alive
    // without turning every hit into a renderer tax.
    this._lightSlots = [];
    for (let i = 0; i < 10; i++) {
      const light = new THREE.PointLight(0xff9a32, 0, 18, 2);
      light.visible = false;
      light.castShadow = false;
      engine.scene.add(light);
      this._lightSlots.push({ light, ttl: 0, life: 1, start: 1, distance: 18 });
    }
    this._lightCursor = 0;

    this._unsubs = [
      eventBus.on(EVENTS.UNIT_DAMAGED, (p) => this._onDamage(p)),
      eventBus.on(EVENTS.PROJECTILE_IMPACT, (p) => this._onProjectileImpact(p)),
      eventBus.on(EVENTS.UNIT_DIED, (p) => this._onDeath(p)),
      eventBus.on(EVENTS.BUILDING_DESTROYED, (p) => this._onBuildingExplode(p)),
      eventBus.on(EVENTS.BUILDING_COMPLETE, (p) => this._at('build', p?.entity)),
    ];
  }

  /**
   * Impact-spray color for a victim: red blood for Knights, violet ichor for
   * Void Stalkers, molten sparks for Core Elementals, grey debris for buildings.
   * @param {object|undefined} entity
   * @returns {string} '#rrggbb'
   * @private
   */
  _impactColor(entity) {
    const t = entity?.type;
    if (t?.class === 'BUILDING') return '#c9bfa8'; // stone dust / debris
    switch (t?.race) {
      case 'ARTIFICE_HORDE': return '#c85cff';   // violet ichor
      case 'TERRA_BORN': return '#ff8a2e'; // molten sparks
      case 'BIO_HUMAN': return '#e23030';  // red blood
      case 'CHAOS_DEEP': return '#39ff14';  // acid green slime
      case 'NEUTRAL_HOSTILE': return '#8e1d16';
      default: return '#ffd27a';
    }
  }

  /**
   * A hit: a bright flash at the point of impact plus a shower of faction-
   * colored sparks flying outward — heavy blows throw more, bigger sparks.
   * @param {{entity:object, amount:number}} p @private
   */
  _onDamage(p) {
    if (p?.projectile) return;
    const e = p?.entity;
    if (!e || !e.position) return;
    const color = this._impactColor(e);
    _pos.copy(e.position);
    _pos.y += 0.6;
    // White-hot flash core.
    this.spawn('flash', _pos, '#fff3cf');
    // Spark shower — count/size scale a touch with the damage dealt.
    const heavy = Math.min(1, (p.amount ?? 6) / 40);
    const count = 4 + Math.round(heavy * 4);
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const up = 1.6 + Math.random() * 2.4;
      const out = 2.4 + Math.random() * 3.2;
      this.spawn('spark', _pos, color, {
        vx: Math.cos(ang) * out,
        vy: up,
        vz: Math.sin(ang) * out,
        grav: 9,
        scale: (0.4 + Math.random() * 0.5) * (1 + heavy),
      });
    }
  }

  _onProjectileImpact(p) {
    if (!p?.position) return;
    if (p.surface === 'ground') {
      this._projectileGroundImpact(p);
      return;
    }
    if (p.surface === 'structure' || p.target?.type?.class === 'BUILDING') {
      this._projectileStructureImpact(p);
      return;
    }
    this._projectileUnitImpact(p);
  }

  _projectileUnitImpact(p) {
    const target = p.target;
    const color = this._impactColor(target);
    _pos.copy(p.position);
    if (_pos.y < 0.35) _pos.y = (target?.position?.y ?? 0) + 0.75;

    const race = target?.type?.race;
    const bloodLike = race === 'BIO_HUMAN' || race === 'NEUTRAL_HOSTILE';
    const slimeLike = race === 'CHAOS_DEEP';
    const stoneLike = race === 'TERRA_BORN';

    this.spawn('flash', _pos, '#fff3cf', { scale: bloodLike ? 0.6 : 0.72 });
    if (bloodLike || slimeLike) {
      this.spawn('blood', _pos, color, { scale: bloodLike ? 1.0 : 0.85 });
      this.spawnBloodSplat(_pos, color, bloodLike ? 0.48 : 0.36);
    } else {
      this.spawn('impact', _pos, color, { scale: 0.82 });
    }

    const count = stoneLike ? 8 : 6;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const out = 1.4 + Math.random() * (stoneLike ? 3.8 : 2.6);
      this.spawn(stoneLike ? 'chip' : 'spark', _pos, color, {
        vx: Math.cos(ang) * out,
        vy: 1.0 + Math.random() * (stoneLike ? 2.3 : 1.8),
        vz: Math.sin(ang) * out,
        grav: slimeLike ? 5 : 9,
        scale: 0.45 + Math.random() * 0.55,
      });
    }
  }

  _projectileStructureImpact(p) {
    const target = p.target;
    _pos.copy(p.position);
    if (_pos.y < 0.35) _pos.y = (target?.position?.y ?? 0) + 0.9;

    this.spawn('flash', _pos, '#fff0c8', { scale: 0.9 });
    this.spawn('impact', _pos, '#d8c79a', { scale: 1.15 });
    this.spawnLight(_pos, '#ffcf8a', { intensity: 1.5, distance: 8, life: 0.18, height: 0.2 });

    for (let i = 0; i < 9; i++) {
      const ang = Math.random() * Math.PI * 2;
      const out = 2.0 + Math.random() * 4.2;
      this.spawn(i % 3 === 0 ? 'debris' : 'chip', _pos, i % 2 ? '#b9ad99' : '#8a8174', {
        vx: Math.cos(ang) * out,
        vy: 1.4 + Math.random() * 3.0,
        vz: Math.sin(ang) * out,
        grav: 11,
        scale: 0.6 + Math.random() * 0.7,
      });
    }
    this.spawnSmoke(_pos, {
      vx: (Math.random() - 0.5) * 0.8,
      vy: 1.0 + Math.random() * 0.8,
      vz: (Math.random() - 0.5) * 0.8,
      scale: 0.75 + Math.random() * 0.45,
      life: 0.7 + Math.random() * 0.3,
    });
  }

  _projectileGroundImpact(p) {
    _pos.copy(p.position);
    _pos.y = this.engine.terrain?.getHeightAt
      ? this.engine.terrain.getHeightAt(_pos.x, _pos.z) + 0.08
      : 0.08;

    this.spawn('dust', _pos, '#9a734a', { scale: 0.85 });
    this._spawnShockwave(_pos, 1.6, '#b9905f');
    this.spawnSmoke(_pos, {
      vx: (Math.random() - 0.5) * 0.45,
      vy: 0.75 + Math.random() * 0.55,
      vz: (Math.random() - 0.5) * 0.45,
      scale: 0.65 + Math.random() * 0.35,
      life: 0.65 + Math.random() * 0.25,
    });

    for (let i = 0; i < 5; i++) {
      const ang = Math.random() * Math.PI * 2;
      const out = 1.2 + Math.random() * 2.0;
      this.spawn('chip', _pos, '#7f684f', {
        vx: Math.cos(ang) * out,
        vy: 0.65 + Math.random() * 1.3,
        vz: Math.sin(ang) * out,
        grav: 10,
        scale: 0.35 + Math.random() * 0.35,
      });
    }
  }

  /**
   * A death: a large faction-colored burst plus flung debris where the entity
   * fell (buildings throw a bigger, greyer cloud).
   * @param {{entity:object}} p @private
   */
  _onDeath(p) {
    const e = p?.entity;
    if (!e || !e.position) return;
    const color = this._impactColor(e);
    const big = e.type?.class === 'BUILDING';
    _pos.copy(e.position);
    _pos.y += 0.6;
    this.spawn('death', _pos, color);
    if (!big) {
      this.spawnBloodSplat(e.position, color, 0.95 + Math.random() * 0.65);
      for (let i = 0; i < 10; i++) {
        const ang = Math.random() * Math.PI * 2;
        const out = 1.6 + Math.random() * 3.8;
        this.spawn('spark', _pos, color, {
          vx: Math.cos(ang) * out,
          vy: 2.8 + Math.random() * 4.2,
          vz: Math.sin(ang) * out,
          grav: 12,
          scale: 0.65 + Math.random() * 0.7,
        });
      }
    }
    const count = big ? 12 : 6;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const out = (big ? 3.5 : 2.2) + Math.random() * (big ? 5 : 3);
      this.spawn('debris', _pos, color, {
        vx: Math.cos(ang) * out,
        vy: 2.5 + Math.random() * (big ? 5 : 3),
        vz: Math.sin(ang) * out,
        grav: 11,
        scale: (big ? 1.0 : 0.6) + Math.random() * 0.8,
      });
    }
  }

  /**
   * A building explosion: total chaos — a huge flash, rolling fireballs, a
   * shockwave ring, showering fiery debris, and a billowing smoke column.
   * @param {{entity:object}} p @private
   */
  _onBuildingExplode(p) {
    const e = p?.entity;
    if (!e || !e.position) return;
    const R = e.type?.radius ?? 2;
    _pos.copy(e.position);
    _pos.y += 0.6;

    // Blinding core flash + a couple of expanding shockwave rings.
    this.spawn('bigflash', _pos, '#fff2cc');
    this.spawnLight(_pos, '#ffb24a', { intensity: 5.5 + R * 1.6, distance: 18 + R * 5, life: 0.5, height: 2.0 });
    this._spawnShockwave(e.position, R * 3.2, '#ffb24a');
    this._spawnShockwave(e.position, R * 4.5, '#ff7a2e');

    // Rolling fireballs erupting upward across the footprint.
    const balls = 5 + Math.round(R);
    for (let i = 0; i < balls; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rr = Math.random() * R * 0.8;
      _pos.set(e.position.x + Math.cos(ang) * rr, 0.6 + Math.random() * R * 0.6, e.position.z + Math.sin(ang) * rr);
      this.spawn('fireball', _pos, i % 2 ? '#ff8a2e' : '#ffd24a', {
        vx: Math.cos(ang) * 1.5, vy: 2 + Math.random() * 3, vz: Math.sin(ang) * 1.5,
        grav: 3, scale: (0.7 + Math.random() * 0.9) * Math.max(1, R * 0.5),
      });
      if (i < 3) {
        this.spawnLight(_pos, i % 2 ? '#ff6a1a' : '#ffd24a', {
          intensity: 2.2 + R * 0.55,
          distance: 9 + R * 2.5,
          life: 0.35 + Math.random() * 0.2,
          height: 0.8,
        });
      }
    }
    // Fiery debris chunks flung out.
    _pos.copy(e.position); _pos.y += 0.6;
    const chunks = 16 + Math.round(R * 3);
    for (let i = 0; i < chunks; i++) {
      const ang = Math.random() * Math.PI * 2;
      const out = 4 + Math.random() * (5 + R * 2);
      this.spawn('debris', _pos, i % 3 === 0 ? '#ff8a2e' : '#b3a992', {
        vx: Math.cos(ang) * out, vy: 3 + Math.random() * 7, vz: Math.sin(ang) * out,
        grav: 12, scale: 0.6 + Math.random() * 1.2,
      });
    }
    // Billowing dark smoke column.
    const puffs = 10 + Math.round(R * 2);
    for (let i = 0; i < puffs; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rr = Math.random() * R * 0.7;
      _pos.set(e.position.x + Math.cos(ang) * rr, 0.8 + Math.random() * R, e.position.z + Math.sin(ang) * rr);
      this.spawnSmoke(_pos, {
        vx: Math.cos(ang) * 0.8, vy: 1.5 + Math.random() * 2.5, vz: Math.sin(ang) * 0.8,
        scale: R * (0.8 + Math.random() * 1.2), life: 1.4 + Math.random() * 1.4,
      });
    }
  }

  /**
   * Emit a dark smoke puff (normal-blended) with a rising drift.
   * @param {THREE.Vector3} worldPos @param {{vx?:number,vy?:number,vz?:number,scale?:number,life?:number}} [motion]
   */
  spawnSmoke(worldPos, motion = {}) {
    const slot = this._smokeSlots[this._smokeCursor];
    this._smokeCursor = (this._smokeCursor + 1) % this._smokeSlots.length;
    slot.sprite.position.set(worldPos.x, worldPos.y, worldPos.z);
    slot.material.opacity = 0.7;
    slot.vx = motion.vx ?? 0;
    slot.vy = motion.vy ?? 1.5;
    slot.vz = motion.vz ?? 0;
    slot.start = motion.scale ?? 2;
    slot.end = slot.start * 2.4; // billows outward as it rises
    slot.life = motion.life ?? 1.6;
    slot.ttl = slot.life;
    slot.sprite.scale.setScalar(slot.start);
    slot.sprite.visible = true;
  }

  /**
   * Flash an expanding shockwave ring on the ground.
   * @param {THREE.Vector3} worldPos @param {number} endScale @param {string} color @private
   */
  _spawnShockwave(worldPos, endScale, color) {
    const slot = this._ringSlots[this._ringCursor];
    this._ringCursor = (this._ringCursor + 1) % this._ringSlots.length;
    slot.mesh.position.set(worldPos.x, 0.15, worldPos.z);
    slot.mesh.scale.setScalar(0.5);
    slot.material.color.set(color);
    slot.material.opacity = 0.9;
    slot.endScale = endScale;
    slot.life = 0.5;
    slot.ttl = 0.5;
    slot.mesh.visible = true;
  }

  /**
   * Emit a short-lived local light flash. Pooled, no shadows.
   * @param {THREE.Vector3} worldPos
   * @param {string|number} color
   * @param {{intensity?:number,distance?:number,life?:number,height?:number}} [opts]
   */
  spawnLight(worldPos, color = '#ff9a32', opts = {}) {
    const slot = this._lightSlots[this._lightCursor];
    this._lightCursor = (this._lightCursor + 1) % this._lightSlots.length;
    slot.light.position.set(worldPos.x, worldPos.y + (opts.height ?? 1.4), worldPos.z);
    slot.light.color.set(color);
    slot.start = opts.intensity ?? 4.5;
    slot.distance = opts.distance ?? 18;
    slot.life = opts.life ?? 0.35;
    slot.ttl = slot.life;
    slot.light.intensity = slot.start;
    slot.light.distance = slot.distance;
    slot.light.visible = true;
  }

  spawnBloodSplat(worldPos, color = '#8f1212', scale = 1) {
    const slot = this._bloodSlots[this._bloodCursor];
    this._bloodCursor = (this._bloodCursor + 1) % this._bloodSlots.length;
    const y = this.engine.terrain?.getHeightAt
      ? this.engine.terrain.getHeightAt(worldPos.x, worldPos.z) + 0.055
      : worldPos.y + 0.02;
    slot.mesh.position.set(worldPos.x, y, worldPos.z);
    slot.mesh.rotation.set(0, Math.random() * Math.PI * 2, 0);
    const s = 1.4 * scale;
    slot.mesh.scale.set(s * (0.8 + Math.random() * 0.5), s * (0.8 + Math.random() * 0.4), 1);
    slot.material.color.set(color);
    slot.opacity = 0.72;
    slot.material.opacity = slot.opacity;
    slot.life = FX.BLOOD_DECAL_LINGER;
    slot.ttl = slot.life;
    slot.mesh.visible = true;
  }

  /**
   * Emit an effect of `kind` at a world position.
   * @param {'impact'|'flash'|'blood'|'chip'|'dust'|'spark'|'death'|'debris'|'build'|'fireball'|'bigflash'} kind
   * @param {THREE.Vector3} worldPos - Anchor (copied, not retained; y used as-is).
   * @param {string} [colorOverride] - '#rrggbb' tint (faction blood/sparks).
   * @param {{vx?:number,vy?:number,vz?:number,grav?:number,scale?:number}} [motion]
   *   Optional initial velocity + gravity + size multiplier (spark/debris).
   */
  spawn(kind, worldPos, colorOverride, motion) {
    const cfg = KINDS[kind] ?? KINDS.impact;
    const slot = this._slots[this._cursor];
    this._cursor = (this._cursor + 1) % this._slots.length;

    // `build`/`death` anchor at the entity origin+0.6 for back-compat; motion
    // callers pass an already-lifted position, so don't double-lift them.
    const lift = motion ? 0 : 0.6;
    slot.sprite.position.set(worldPos.x, worldPos.y + lift, worldPos.z);
    slot.material.color.set(colorOverride ?? cfg.color);
    slot.baseOpacity = kind === 'flash' ? 1 : 0.9;
    slot.material.opacity = slot.baseOpacity;
    const sizeMul = motion?.scale ?? 1;
    slot.start = cfg.start * sizeMul;
    slot.end = cfg.end * sizeMul;
    slot.life = cfg.life;
    slot.ttl = cfg.life;
    slot.vx = motion?.vx ?? 0;
    slot.vy = motion?.vy ?? 0;
    slot.vz = motion?.vz ?? 0;
    slot.grav = motion?.grav ?? 0;
    slot.sprite.scale.setScalar(slot.start);
    slot.sprite.visible = true;
  }

  /**
   * Per-frame: advance velocity/gravity, grow/shrink, and fade live slots.
   * Allocation-free.
   * @param {number} dt
   */
  update(dt) {
    for (let i = 0; i < this._slots.length; i++) {
      const slot = this._slots[i];
      if (slot.ttl <= 0) continue;
      slot.ttl -= dt;
      if (slot.ttl <= 0) {
        slot.ttl = 0;
        slot.sprite.visible = false;
        continue;
      }
      // Ballistic motion for flung sparks/debris (grav pulls them down).
      if (slot.vx || slot.vy || slot.vz) {
        const pos = slot.sprite.position;
        pos.x += slot.vx * dt;
        pos.y += slot.vy * dt;
        pos.z += slot.vz * dt;
        slot.vy -= slot.grav * dt;
        if (pos.y < 0.05) { pos.y = 0.05; slot.vy = 0; slot.vx *= 0.4; slot.vz *= 0.4; }
      }
      const t = 1 - slot.ttl / slot.life; // 0 → 1
      slot.sprite.scale.setScalar(slot.start + (slot.end - slot.start) * t);
      slot.material.opacity = slot.baseOpacity * (1 - t);
    }
    this._updateSmoke(dt);
    this._updateRings(dt);
    this._updateLights(dt);
    this._updateBlood(dt);
  }

  /**
   * Animate the smoke pool: drift up, billow outward, fade. Allocation-free.
   * @param {number} dt @private
   */
  _updateSmoke(dt) {
    for (let i = 0; i < this._smokeSlots.length; i++) {
      const slot = this._smokeSlots[i];
      if (slot.ttl <= 0) continue;
      slot.ttl -= dt;
      if (slot.ttl <= 0) { slot.ttl = 0; slot.sprite.visible = false; continue; }
      const pos = slot.sprite.position;
      pos.x += slot.vx * dt;
      pos.y += slot.vy * dt;
      pos.z += slot.vz * dt;
      slot.vy *= 0.99; // slows as it rises
      const t = 1 - slot.ttl / slot.life;
      slot.sprite.scale.setScalar(slot.start + (slot.end - slot.start) * t);
      // Rise in, hold, fade out.
      slot.material.opacity = 0.7 * Math.sin(Math.min(1, t) * Math.PI);
    }
  }

  /**
   * Animate shockwave rings: expand + fade. Allocation-free.
   * @param {number} dt @private
   */
  _updateRings(dt) {
    for (let i = 0; i < this._ringSlots.length; i++) {
      const slot = this._ringSlots[i];
      if (slot.ttl <= 0) continue;
      slot.ttl -= dt;
      if (slot.ttl <= 0) { slot.ttl = 0; slot.mesh.visible = false; continue; }
      const t = 1 - slot.ttl / slot.life;
      const s = 0.5 + (slot.endScale - 0.5) * t;
      slot.mesh.scale.set(s, s, s);
      slot.material.opacity = 0.9 * (1 - t);
    }
  }

  /**
   * Fade pooled point lights with a hot-front/fast-falloff curve.
   * @param {number} dt @private
   */
  _updateLights(dt) {
    for (let i = 0; i < this._lightSlots.length; i++) {
      const slot = this._lightSlots[i];
      if (slot.ttl <= 0) continue;
      slot.ttl -= dt;
      if (slot.ttl <= 0) {
        slot.ttl = 0;
        slot.light.intensity = 0;
        slot.light.visible = false;
        continue;
      }
      const t = 1 - slot.ttl / slot.life;
      const fade = (1 - t) * (1 - t);
      slot.light.intensity = slot.start * fade;
      slot.light.distance = slot.distance * (0.75 + t * 0.45);
    }
  }

  _updateBlood(dt) {
    for (let i = 0; i < this._bloodSlots.length; i++) {
      const slot = this._bloodSlots[i];
      if (slot.ttl <= 0) continue;
      slot.ttl -= dt;
      if (slot.ttl <= 0) {
        slot.ttl = 0;
        slot.material.opacity = 0;
        slot.mesh.visible = false;
        continue;
      }
      const t = 1 - slot.ttl / slot.life;
      const fade = t < 0.72 ? 1 : 1 - (t - 0.72) / 0.28;
      slot.material.opacity = slot.opacity * Math.max(0, fade);
    }
  }

  /**
   * Spawn `kind` at an entity's current position (skips missing entities).
   * @param {'impact'|'death'|'build'} kind
   * @param {object|undefined} entity
   * @private
   */
  _at(kind, entity) {
    if (entity && entity.position) this.spawn(kind, entity.position);
  }

  /** Detach subscriptions and free GPU resources. */
  dispose() {
    for (const off of this._unsubs) off();
    this._unsubs = [];
    for (const slot of this._slots) {
      this.engine.scene.remove(slot.sprite);
      slot.material.dispose();
    }
    this._slots = [];
    for (const slot of this._smokeSlots) {
      this.engine.scene.remove(slot.sprite);
      slot.material.dispose();
    }
    this._smokeSlots = [];
    for (const slot of this._ringSlots) {
      this.engine.scene.remove(slot.mesh);
      slot.material.dispose();
    }
    this._ringSlots = [];
    this._ringGeo.dispose();
    for (const slot of this._bloodSlots) {
      this.engine.scene.remove(slot.mesh);
      slot.material.dispose();
    }
    this._bloodSlots = [];
    this._bloodGeo.dispose();
    this._bloodTexture.dispose();
    for (const slot of this._lightSlots) {
      this.engine.scene.remove(slot.light);
    }
    this._lightSlots = [];
    this._texture.dispose();
    this._smokeTexture.dispose();
    this.engine = null;
  }
}
