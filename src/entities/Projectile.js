/**
 * Projectile — a single homing bolt slot (data + mesh). Instances are NEVER
 * created ad hoc; they live for the whole match inside ProjectilePool and are
 * activated/deactivated in place, so combat allocates nothing per shot.
 *
 * Behavior (WC3-style tracking projectile): once fired, the bolt homes on its
 * target's live position until it lands, then applies damage through the
 * target's `takeDamage`. If the target dies mid-flight the bolt fizzles at its
 * last position (no damage, slot recycled).
 */
import * as THREE from 'three';

/** Shared geometry for every bolt in the pool (one small glowing shard). */
let _boltGeometry = null;
function getBoltGeometry() {
  if (!_boltGeometry) _boltGeometry = new THREE.IcosahedronGeometry(0.35, 0);
  return _boltGeometry;
}

export class Projectile {
  /**
   * @param {THREE.Scene} scene - Scene the bolt mesh is (permanently) added to.
   */
  constructor(scene) {
    /** Per-slot material so each in-flight bolt can carry its owner's color. */
    this.material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
    this.mesh = new THREE.Mesh(getBoltGeometry(), this.material);
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);

    /** @type {boolean} Whether this slot is currently in flight. */
    this.active = false;
    /** @type {import('./Entity.js').Entity|null} */
    this.target = null;
    /** @type {import('./Entity.js').Entity|null} Attacker (for kill credit). */
    this.source = null;
    this.speed = 0;
    this.rawDamage = 0;
    this.attackType = 'PIERCE';
    /** Safety fuse: seconds before an un-landed bolt self-expires. */
    this.ttl = 0;

    // Reused each frame — no per-update allocation.
    this._pos = this.mesh.position;
  }

  /**
   * Arm this slot and launch it from the source toward the target.
   * @param {object} cfg - { source, target, speed, rawDamage, attackType, color, from }
   */
  launch(cfg) {
    this.active = true;
    this.source = cfg.source;
    this.target = cfg.target;
    this.speed = cfg.speed;
    this.rawDamage = cfg.rawDamage;
    this.attackType = cfg.attackType;
    this.ttl = 3.0; // generous; almost always lands well before this

    // Start a bit above the source's feet so bolts read as fired from the body.
    const from = cfg.from ?? cfg.source.position;
    this._pos.set(from.x, from.y + 1.0, from.z);

    if (cfg.color) this.material.color.copy(cfg.color);
    else this.material.color.setHex(0xffe08a);
    this.material.opacity = 1;
    this.mesh.visible = true;
  }

  /**
   * Advance the bolt. Returns true while still in flight, false once it has
   * landed/fizzled (the pool then frees the slot).
   * @param {number} dt
   * @returns {boolean}
   */
  update(dt) {
    if (!this.active) return false;

    this.ttl -= dt;
    const target = this.target;
    // Fizzle if the target is gone or the fuse burned out.
    if (!target || target.isDead || this.ttl <= 0) {
      this._deactivate();
      return false;
    }

    // Aim at the target's mid-body (approx y=1) and step toward it.
    const tx = target.position.x;
    const ty = target.position.y + 1.0;
    const tz = target.position.z;
    const dx = tx - this._pos.x;
    const dy = ty - this._pos.y;
    const dz = tz - this._pos.z;
    const dist = Math.hypot(dx, dy, dz);
    const step = this.speed * dt;
    // Impact when we would reach/overshoot the target this frame.
    const hitRadius = (target.type?.radius ?? 0.5) + 0.2;

    if (dist <= step + hitRadius) {
      // Landed — apply damage through the shared mitigation pipeline.
      target.takeDamage(this.rawDamage, this.attackType, this.source);
      this._deactivate();
      return false;
    }

    const inv = 1 / dist;
    this._pos.x += dx * inv * step;
    this._pos.y += dy * inv * step;
    this._pos.z += dz * inv * step;
    return true;
  }

  /** Park the slot (hidden, inert) so the pool can reuse it. @private */
  _deactivate() {
    this.active = false;
    this.target = null;
    this.source = null;
    this.mesh.visible = false;
  }

  /** Free GPU resources (called once, on pool dispose). */
  dispose() {
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.material.dispose();
    this.active = false;
    this.target = null;
    this.source = null;
  }
}
