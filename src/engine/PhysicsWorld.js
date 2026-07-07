/**
 * PhysicsWorld — thin Rapier (wasm) wrapper for the RTS's narrow physics needs.
 *
 * Division of labor (ARCHITECTURE.md §8): this is NOT a general rigid-body sim.
 * Gravity is zero and the world is top-down 2.5D. Rapier's only jobs are:
 *   1. hold STATIC colliders for buildings (boxes) and resource nodes /
 *      large doodads (cylinders), and
 *   2. slide each unit's KINEMATIC capsule around those static colliders via a
 *      shared KinematicCharacterController, so units path *around* buildings
 *      instead of clipping through them.
 *
 * Unit-vs-unit crowding is deliberately NOT rapier's job — that is soft Yuka
 * SeparationBehavior (WC3 crowds are squishy). Units therefore only collide
 * with static geometry, enforced via collision groups.
 *
 * Robustness: every method fails soft. If Rapier isn't initialized or a body
 * is missing, `moveUnit` simply returns the requested displacement unchanged,
 * so the game remains fully playable (units just won't slide around walls).
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { GAME_CONFIG } from '../config/GameConfig.js';

/** Collision group bits (Rapier packs membership<<16 | filter into one u32). */
const GROUP_STATIC = 0x0001;
const GROUP_UNIT = 0x0002;
/** Static colliders belong to STATIC and collide with everything. */
const STATIC_GROUPS = (GROUP_STATIC << 16) | 0xffff;
/** Units belong to UNIT and collide ONLY with STATIC (never other units). */
const UNIT_GROUPS = (GROUP_UNIT << 16) | GROUP_STATIC;

/** Character-controller skin width — small gap that keeps contacts stable. */
const CONTROLLER_OFFSET = 0.05;

/** True once RAPIER.init() has resolved (module-global; wasm loads once). */
let _rapierReady = false;

export class PhysicsWorld {
  /**
   * Initialize the Rapier wasm runtime. Idempotent and safe to await many
   * times; the actual wasm compile happens once.
   * @returns {Promise<void>}
   */
  static async init() {
    if (_rapierReady) return;
    await RAPIER.init();
    _rapierReady = true;
  }

  constructor() {
    /** @type {boolean} False if wasm failed to load — every op then no-ops. */
    this.enabled = _rapierReady;

    if (this.enabled) {
      // Zero gravity: nothing falls in a top-down RTS.
      this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
      /**
       * One shared controller drives every unit's slide-and-collide movement.
       * `true` on autostep would let units climb tiny ledges — irrelevant on
       * flat terrain, so we leave the defaults and just set the skin offset.
       */
      this._controller = this.world.createCharacterController(CONTROLLER_OFFSET);
      this._controller.setApplyImpulsesToDynamicBodies(false);
    } else {
      this.world = null;
      this._controller = null;
      console.warn('[PhysicsWorld] Rapier not initialized — running without collisions.');
    }
  }

  // ── Static colliders ───────────────────────────────────────────────────────

  /**
   * Add a static box collider (buildings).
   * @param {{x:number,y:number,z:number}} position - Center of the box.
   * @param {{x:number,y:number,z:number}} halfExtents - Half-size on each axis.
   * @returns {object|null} The Rapier collider (or null when disabled).
   */
  addStaticBox(position, halfExtents) {
    if (!this.enabled) return null;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z)
    );
    const desc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setCollisionGroups(STATIC_GROUPS);
    const collider = this.world.createCollider(desc, body);
    collider._atBody = body; // remember the owning body for removeCollider
    return collider;
  }

  /**
   * Add a static vertical cylinder collider (resource nodes / big doodads).
   * @param {{x:number,y:number,z:number}} position - Center of the cylinder.
   * @param {number} radius
   * @param {number} height - Full height (converted to half-height for Rapier).
   * @returns {object|null}
   */
  addStaticCylinder(position, radius, height) {
    if (!this.enabled) return null;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z)
    );
    const desc = RAPIER.ColliderDesc.cylinder(height * 0.5, radius)
      .setCollisionGroups(STATIC_GROUPS);
    const collider = this.world.createCollider(desc, body);
    collider._atBody = body;
    return collider;
  }

  // ── Units (kinematic capsules) ──────────────────────────────────────────────

  /**
   * Register a unit: a kinematic-position body + upright capsule collider that
   * the character controller will slide around static geometry. Stores handles
   * on the unit (`_physicsBody`, `_physicsCollider`).
   * @param {import('../entities/Unit.js').Unit} unit
   */
  registerUnit(unit) {
    if (!this.enabled) return;
    const r = unit.type.radius;
    const capRadius = r * 0.75;
    // Capsule half-height (cylinder part). Center it so it spans y≈0..1.8,
    // overlapping building boxes (centered higher) for xz collision tests.
    const halfHeight = 0.45;
    const centerY = halfHeight + capRadius;

    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        unit.position.x,
        centerY,
        unit.position.z
      )
    );
    const desc = RAPIER.ColliderDesc.capsule(halfHeight, capRadius)
      .setCollisionGroups(UNIT_GROUPS);
    const collider = this.world.createCollider(desc, body);

    unit._physicsBody = body;
    unit._physicsCollider = collider;
    unit._physicsCenterY = centerY;
  }

  /**
   * Remove a unit's body/collider from the world.
   * @param {import('../entities/Unit.js').Unit} unit
   */
  unregisterUnit(unit) {
    if (!this.enabled) return;
    if (unit._physicsBody) {
      // Removing the body also removes its attached collider.
      this.world.removeRigidBody(unit._physicsBody);
      unit._physicsBody = null;
      unit._physicsCollider = null;
    }
  }

  /**
   * Slide a unit by `desired` (an XZ displacement) against static geometry.
   * Writes the collision-corrected displacement into `out` and queues the
   * kinematic body to follow. Falls back to the raw displacement if physics
   * is unavailable for this unit.
   * @param {import('../entities/Unit.js').Unit} unit
   * @param {import('three').Vector3} desired - Requested XZ movement (y ignored).
   * @param {import('three').Vector3} out - Receives the corrected XZ movement.
   * @returns {import('three').Vector3} out
   */
  moveUnit(unit, desired, out) {
    const body = unit._physicsBody;
    const collider = unit._physicsCollider;
    if (!this.enabled || !body || !collider || !this._controller) {
      out.copy(desired);
      return out;
    }

    // Compute the allowed movement given static collisions.
    this._controller.computeColliderMovement(collider, {
      x: desired.x,
      y: 0,
      z: desired.z,
    });
    const corrected = this._controller.computedMovement();

    let cx = corrected.x;
    let cz = corrected.z;
    const nexus = this.engine?.nexus;

    // Slide-along-terrain-boundaries if the next position is un-walkable
    if (nexus && !nexus.isWalkable(unit.position.x + cx, unit.position.z + cz)) {
      let found = false;
      const angleStep = Math.PI / 12; // 15 degrees
      const originalLength = Math.hypot(cx, cz);
      const originalAngle = Math.atan2(cz, cx);

      for (let i = 1; i <= 5; i++) {
        const da = i * angleStep;
        for (const sign of [1, -1]) {
          const testAngle = originalAngle + sign * da;
          const scale = Math.cos(da);
          const testCx = Math.cos(testAngle) * originalLength * scale;
          const testCz = Math.sin(testAngle) * originalLength * scale;
          if (nexus.isWalkable(unit.position.x + testCx, unit.position.z + testCz)) {
            cx = testCx;
            cz = testCz;
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (!found) {
        cx = 0;
        cz = 0;
      }
    }

    out.set(cx, 0, cz);

    // Advance the kinematic body so its collider tracks the mesh next step.
    const t = body.translation();
    body.setNextKinematicTranslation({
      x: t.x + cx,
      y: unit._physicsCenterY ?? t.y,
      z: t.z + cz,
    });
    return out;
  }

  /**
   * Step the physics world. Called every frame with the clamped dt so kinematic
   * translations set during `entities.update` are applied.
   * @param {number} dt
   */
  step(dt) {
    if (!this.enabled) return;
    // Match Rapier's integration step to the (clamped) frame delta.
    this.world.timestep = dt;
    this.world.step();
  }

  /**
   * Remove a static collider (e.g. a destroyed building).
   * @param {object|null} collider - A collider returned by addStatic*.
   */
  removeCollider(collider) {
    if (!this.enabled || !collider) return;
    // Removing the owning body cleans up the collider too.
    if (collider._atBody) {
      this.world.removeRigidBody(collider._atBody);
      collider._atBody = null;
    } else {
      this.world.removeCollider(collider, true);
    }
  }

  /** Free the entire Rapier world (frees the underlying wasm memory). */
  dispose() {
    if (this.world) {
      this.world.free();
      this.world = null;
    }
    this._controller = null;
    this.enabled = false;
  }
}
