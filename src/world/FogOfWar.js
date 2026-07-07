/**
 * FogOfWar — classic WC3 dual-layer fog:
 *
 *   - BLACK  (never explored)          → ground almost invisible
 *   - GREY   (explored, not in vision) → dimmed ground, enemy units hidden
 *   - CLEAR  (currently visible)       → full brightness
 *
 * Implementation: one RGBA DataTexture covering the whole map.
 *   R channel = "currently visible" (rewritten every stamp pass)
 *   G channel = "explored"          (persistent — only ever set, never cleared)
 *   B unused, A fixed at 255.
 *
 * The ground shader (injected via onBeforeCompile) samples this texture using
 * a uv derived from *world position* and darkens `outgoingLight`. CPU-side
 * `isVisible`/`isExplored` sample the same backing array with the same
 * mapping, so gameplay logic and pixels always agree.
 *
 * ── TEXTURE ORIENTATION CONTRACT (the classic gotcha) ────────────────────────
 * We set `texture.flipY = false` (the DataTexture default). Both sides then
 * use the SAME mapping and nothing ever needs mirroring:
 *
 *   uv.x = worldX / mapWidth + 0.5      texelX = floor(uv.x * resolution)
 *   uv.y = worldZ / mapDepth + 0.5      texelY = floor(uv.y * resolution)
 *   byte index = (texelY * resolution + texelX) * 4
 *
 * i.e. data row 0 is the −Z edge of the map, and +Z is increasing v /
 * increasing row index. The shader computes uv from `vWorldPos.xz` with this
 * exact formula, and `_texelIndex()` below is its CPU mirror. If you ever
 * change one side, change the other.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Performance notes:
 *   - update() is throttled to GAME_CONFIG.SIM.FOG_UPDATE_HZ.
 *   - Circle stamping is a row-span fill: ONE sqrt per texel row, then a
 *     straight index-walk write across the span — never per-texel distance.
 *   - Zero allocations after construction (plain loops, no iterators).
 */
import * as THREE from 'three';
import { GAME_CONFIG } from '../config/GameConfig.js';

export class FogOfWar {
  /**
   * @param {object} engine - Injected GameEngine (needs .entities, .localPlayer,
   *   and optionally .terrain for map dimensions).
   * @param {number} [resolution] - Texels per side of the fog texture.
   */
  constructor(engine, resolution = GAME_CONFIG.FOG.RESOLUTION) {
    this.engine = engine;

    /** @type {number} Texels per side of the square fog texture. */
    this.resolution = resolution;

    // Map dimensions: prefer the live nexus (already built by the engine at
    // this point), fall back to config so the class is testable standalone.
    this._mapWidth = engine?.nexus?.size?.width ?? GAME_CONFIG.MAP.WIDTH;
    this._mapDepth = engine?.nexus?.size?.depth ?? GAME_CONFIG.MAP.DEPTH;

    // Backing pixel store. Starts fully unexplored (R=0, G=0). Alpha is set
    // to 255 once so the texture is well-formed if anyone ever displays it.
    const texelCount = resolution * resolution;
    /** @type {Uint8Array} @private */
    this._data = new Uint8Array(texelCount * 4);
    for (let i = 3; i < this._data.length; i += 4) this._data[i] = 255;

    /**
     * The fog texture sampled by the ground shader.
     * R = visible, G = explored. LinearFilter gives soft fog edges for free.
     * @type {THREE.DataTexture}
     */
    this.texture = new THREE.DataTexture(
      this._data,
      resolution,
      resolution,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    );
    this.texture.flipY = false; // see orientation contract in module header
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.colorSpace = THREE.NoColorSpace; // raw data, not color
    this.texture.needsUpdate = true;

    // Throttle accumulator. Primed to the full interval so the very first
    // update() call stamps immediately (no black-screen flash at match start).
    /** @private */
    this._interval = 1 / GAME_CONFIG.SIM.FOG_UPDATE_HZ;
    /** @private */
    this._accum = this._interval;

    // The ground material we injected into (kept to unwind on dispose).
    /** @type {THREE.Material|null} @private */
    this._groundMaterial = null;

    /** World-object materials (trees/rocks/doodads/lakes) we fog-injected. @private */
    this._worldMaterials = [];

    // Shader uniforms shared with the injected program. Created once; the
    // texture reference inside never changes, so no per-frame uniform work.
    /** @private */
    this._uniforms = {
      uFogMap: { value: this.texture },
      uFogMapWorldSize: { value: new THREE.Vector2(this._mapWidth, this._mapDepth) },
      uFogUnexplored: { value: GAME_CONFIG.FOG.UNEXPLORED_BRIGHTNESS },
      uFogExplored: { value: GAME_CONFIG.FOG.EXPLORED_BRIGHTNESS },
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public API (contract)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Throttled fog refresh. At FOG_UPDATE_HZ:
   *   1) clear the R (visible) channel,
   *   2) stamp a filled circle per friendly vision source,
   *   3) upload (needsUpdate),
   *   4) refresh enemy mesh visibility from the fresh data.
   * @param {number} dt - Frame delta seconds (engine game time).
   */
  update(dt) {
    this._accum += dt;
    if (this._accum < this._interval) return;
    // Consume one interval; if we fell far behind (tab hidden), drop the
    // backlog instead of restamping multiple times in one frame.
    this._accum -= this._interval;
    if (this._accum > this._interval) this._accum = 0;

    // Entities/localPlayer may not exist yet during engine construction.
    const em = this.engine?.entities;
    if (!em) return;

    if (this.engine?.isRevealAll?.()) {
      this._revealAll(em);
      return;
    }

    const visionPlayers = this.engine?.getObserverVisionPlayers?.() ?? [];
    if (visionPlayers.length === 0) return;
    this._restamp(em, visionPlayers);
    this._refreshEntityVisibility(em, visionPlayers);
  }

  /**
   * Inject the fog darkening pass into the ground material. Adds a
   * world-position varying in the vertex stage and multiplies
   * `outgoingLight` in the fragment stage by:
   *
   *   mix(UNEXPLORED, mix(EXPLORED, 1.0, visible), explored)
   *
   * Must be called once, on the TerrainManager ground material.
   * @param {THREE.Material} material - The ground's MeshStandardMaterial.
   */
  applyToGround(material) {
    this._groundMaterial = material;
    const uniforms = this._uniforms;
    const previousOnBeforeCompile = material.onBeforeCompile;
    const previousProgramKey = material.customProgramCacheKey?.bind(material);

    material.onBeforeCompile = (shader) => {
      if (previousOnBeforeCompile) previousOnBeforeCompile(shader);
      // Share our uniform objects — updating texture data automatically
      // reaches the GPU; no per-frame uniform assignment needed.
      Object.assign(shader.uniforms, uniforms);

      // Vertex: capture the world-space position. `transformed` is defined by
      // <begin_vertex>, and modelMatrix is a built-in uniform, so injecting
      // right after that chunk is safe for a plain static mesh.
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vFogWorldPos;'
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n' +
            'vFogWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
        );

      // Fragment: sample the fog map with the world-derived uv (see the
      // orientation contract in the module header) and darken outgoingLight
      // just before <opaque_fragment> composes the final gl_FragColor.
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\n' +
            'varying vec3 vFogWorldPos;\n' +
            'uniform sampler2D uFogMap;\n' +
            'uniform vec2 uFogMapWorldSize;\n' +
            'uniform float uFogUnexplored;\n' +
            'uniform float uFogExplored;'
        )
        .replace(
          '#include <opaque_fragment>',
          '// Fog of war: uv = world XZ normalized to [0,1] across the map.\n' +
            'vec2 fogUv = vFogWorldPos.xz / uFogMapWorldSize + 0.5;\n' +
            'vec4 fogTexel = clamp(texture2D(uFogMap, fogUv), 0.0, 1.0);\n' +
            '// r = visible, g = explored. Unexplored → near-black; explored\n' +
            '// but out of vision → grey; visible → untouched.\n' +
            'float fogLit = mix(uFogUnexplored, mix(uFogExplored, 1.0, fogTexel.r), fogTexel.g);\n' +
            'outgoingLight *= fogLit;\n' +
            '#include <opaque_fragment>'
        );
    };

    // CRITICAL: without a custom cache key, three.js may reuse a previously
    // compiled MeshStandardMaterial program (identical feature set) and our
    // onBeforeCompile patch would silently never run.
    material.customProgramCacheKey = () => `aether-throne/fog-ground-${previousProgramKey ? previousProgramKey() : 'base'}`;
    material.needsUpdate = true;
  }

  /**
   * Inject fog into a NON-ground world object's material (trees, rocks, crystal
   * doodads, lakes). Two modes:
   *   - hide:true  (default) → the object is DISCARDED where the map is
   *     unexplored (black fog) and merely darkened where explored-but-unseen.
   *     This is the WC3 behavior: doodads/trees vanish under black fog and grey
   *     out under the remembered-but-unwatched layer.
   *   - hide:false → ground-style darkening only (never discarded), for large
   *     terrain features like lake water that should stay put but dim in fog.
   *
   * Works for both plain meshes and InstancedMesh (the vertex stage folds in
   * `instanceMatrix` when USE_INSTANCING is defined). The custom program cache
   * key is made unique per material so three.js never reuses one object's fog
   * program for another with a different feature set.
   * @param {THREE.Material} material
   * @param {{hide?: boolean}} [opts]
   */
  applyToWorldObject(material, opts = {}) {
    if (!material) return;
    const hide = opts.hide !== false;
    const uniforms = this._uniforms;

    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFogWorldPos;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n' +
            '#ifdef USE_INSTANCING\n' +
            '  vFogWorldPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n' +
            '#else\n' +
            '  vFogWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n' +
            '#endif'
        );

      // Branch the fragment darken/discard by mode (chosen at compile time).
      const darken = hide
        ? '// Doodad fog: hidden under unexplored, dimmed when explored-but-unseen.\n' +
          'if (fogTexel.g < 0.5) discard;\n' +
          'outgoingLight *= mix(uFogExplored, 1.0, fogTexel.r);\n'
        : '// Terrain feature fog: darken like the ground, never discarded.\n' +
          'outgoingLight *= mix(uFogUnexplored, mix(uFogExplored, 1.0, fogTexel.r), fogTexel.g);\n';

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\n' +
            'varying vec3 vFogWorldPos;\n' +
            'uniform sampler2D uFogMap;\n' +
            'uniform vec2 uFogMapWorldSize;\n' +
            'uniform float uFogUnexplored;\n' +
            'uniform float uFogExplored;'
        )
        .replace(
          '#include <opaque_fragment>',
          'vec2 fogUv = vFogWorldPos.xz / uFogMapWorldSize + 0.5;\n' +
            'vec4 fogTexel = clamp(texture2D(uFogMap, fogUv), 0.0, 1.0);\n' +
            darken +
            '#include <opaque_fragment>'
        );
    };

    material.customProgramCacheKey = () => `aether-throne/fog-world-${hide ? 'hide' : 'dim'}-${material.uuid}`;
    material.needsUpdate = true;
    this._worldMaterials.push(material);
  }

  /**
   * Is this world position currently inside friendly vision?
   * CPU mirror of the shader's R-channel sample (same texel mapping).
   * @param {{x: number, z: number}} worldPos - Any Vector3-like with x/z.
   * @returns {boolean}
   */
  isVisible(worldPos) {
    return this._data[this._texelIndex(worldPos.x, worldPos.z)] > 127;
  }

  /**
   * Has this world position ever been seen (G channel)?
   * @param {{x: number, z: number}} worldPos
   * @returns {boolean}
   */
  isExplored(worldPos) {
    return this._data[this._texelIndex(worldPos.x, worldPos.z) + 1] > 127;
  }

  /**
   * Downsample the fog into a small square grid for the minimap overlay.
   * Each cell packs the three fog states into one byte:
   *   0   = unexplored (black), 128 = explored-but-unseen (grey), 255 = visible.
   * Row/column order matches the minimap's world→screen mapping (row 0 = −Z).
   * @param {number} outRes - Cells per side (e.g. 64).
   * @returns {Uint8Array} outRes×outRes packed states.
   */
  sampleMinimap(outRes) {
    const src = this.resolution;
    const d = this._data;
    const out = new Uint8Array(outRes * outRes);
    const step = src / outRes;
    for (let y = 0; y < outRes; y++) {
      let sy = (y * step) | 0;
      if (sy >= src) sy = src - 1;
      for (let x = 0; x < outRes; x++) {
        let sx = (x * step) | 0;
        if (sx >= src) sx = src - 1;
        const idx = (sy * src + sx) * 4;
        out[y * outRes + x] = d[idx] > 127 ? 255 : d[idx + 1] > 127 ? 128 : 0;
      }
    }
    return out;
  }

  /**
   * Free the texture, unwind the ground-shader injection, and restore any
   * meshes we hid so a torn-down scene never keeps fog side effects.
   */
  dispose() {
    // Restore visibility on everything we may have hidden. Entities are about
    // to be disposed anyway on teardown, but this keeps FogOfWar self-cleaning
    // if it's ever toggled off mid-match.
    const em = this.engine?.entities;
    if (em) {
      const lists = [em.units, em.buildings, em.resources];
      for (let l = 0; l < lists.length; l++) {
        const list = lists[l] || [];
        for (let i = 0; i < list.length; i++) {
          if (list[i].mesh) list[i].mesh.visible = true;
        }
      }
    }

    // Unwind the shader injection: restore the prototype no-op/compile-key so
    // the material behaves stock if it outlives us.
    if (this._groundMaterial) {
      this._groundMaterial.onBeforeCompile = function () {};
      delete this._groundMaterial.customProgramCacheKey; // falls back to prototype
      this._groundMaterial.needsUpdate = true;
      this._groundMaterial = null;
    }

    // Unwind fog injection on every world-object material we patched.
    for (let i = 0; i < this._worldMaterials.length; i++) {
      const m = this._worldMaterials[i];
      m.onBeforeCompile = function () {};
      delete m.customProgramCacheKey;
      m.needsUpdate = true;
    }
    this._worldMaterials.length = 0;

    this.texture.dispose();
    this.engine = null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Byte index of the RGBA texel covering world (x, z). This is the exact CPU
   * mirror of the shader's `fogUv` computation — see the orientation contract.
   * @private
   */
  _texelIndex(x, z) {
    const res = this.resolution;
    // floor() then clamp so positions slightly off-map read the edge texel.
    let tx = Math.floor((x / this._mapWidth + 0.5) * res);
    let ty = Math.floor((z / this._mapDepth + 0.5) * res);
    if (tx < 0) tx = 0;
    else if (tx >= res) tx = res - 1;
    if (ty < 0) ty = 0;
    else if (ty >= res) ty = res - 1;
    return (ty * res + tx) * 4;
  }

  /**
   * Full restamp pass: wipe visibility, then stamp every friendly vision
   * source (local player + allies — buildings and units alike).
   * @param {object} em - engine.entities
   * @param {Array<object>} visionPlayers
   * @private
   */
  _restamp(em, visionPlayers) {
    const d = this._data;

    // 1) Clear the R (visible) channel only — G (explored) is persistent.
    for (let i = 0; i < d.length; i += 4) d[i] = 0;

    // 2) Stamp circles for every allied vision source. Plain indexed loops:
    //    this runs 10×/sec over potentially hundreds of entities.
    this._stampList(em.units, visionPlayers);
    this._stampList(em.buildings, visionPlayers);

    // 3) Push the fresh pixels to the GPU this frame.
    this.texture.needsUpdate = true;
  }

  /**
   * Stamp vision circles for every allied, living entity in a list.
   * @private
   */
  _stampList(list, visionPlayers) {
    if (!list) return;
    const visionSet = new Set(visionPlayers);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.isDead) continue;
      const p = e.player;
      if (!p) continue; // neutral entities grant no vision
      if (!visionSet.has(p)) continue;
      this._stampCircle(e.position.x, e.position.z, e.type.sightRadius);
    }
  }

  /**
   * Fill a vision circle into R (visible) and G (explored) using row spans:
   * for each texel row inside the circle we compute the half-width once
   * (ONE sqrt per row) and then index-walk the write — no per-texel math.
   *
   * Radii are converted per-axis, so the fill stays a true world-space circle
   * even if the map (and thus texel aspect) were non-square.
   * @param {number} wx - World x of the circle center.
   * @param {number} wz - World z.
   * @param {number} worldRadius - Sight radius in world units.
   * @private
   */
  _stampCircle(wx, wz, worldRadius) {
    const res = this.resolution;
    const d = this._data;

    // Center in (float) texel coordinates.
    const cx = (wx / this._mapWidth + 0.5) * res;
    const cy = (wz / this._mapDepth + 0.5) * res;
    // Radius in texels along each axis (identical for square maps).
    const rx = (worldRadius / this._mapWidth) * res;
    const ry = (worldRadius / this._mapDepth) * res;
    if (rx <= 0 || ry <= 0) return;

    // Vertical texel range the circle can touch, clamped to the texture.
    let yMin = Math.floor(cy - ry);
    let yMax = Math.ceil(cy + ry);
    if (yMin < 0) yMin = 0;
    if (yMax > res - 1) yMax = res - 1;

    for (let ty = yMin; ty <= yMax; ty++) {
      // Normalized vertical offset of this row's center from the circle center.
      const ny = (ty + 0.5 - cy) / ry;
      const under = 1 - ny * ny;
      if (under <= 0) continue; // row grazes past the circle
      // Half-span of the circle on this row, in texels. The row's ONLY sqrt.
      const span = rx * Math.sqrt(under);

      let xMin = Math.round(cx - span);
      let xMax = Math.round(cx + span);
      if (xMin < 0) xMin = 0;
      if (xMax > res - 1) xMax = res - 1;
      if (xMax < xMin) continue;

      // Straight byte walk across the span: set visible + explored.
      let idx = (ty * res + xMin) * 4;
      for (let tx = xMin; tx <= xMax; tx++, idx += 4) {
        d[idx] = 255; // R: currently visible
        d[idx + 1] = 255; // G: explored forever
      }
    }
  }

  /**
   * Sync entity mesh visibility with the fog:
   *   - local/allied entities: always visible,
   *   - enemy UNITS: visible only inside current vision (R),
   *   - enemy BUILDINGS: visible once explored (G) — they persist as a
   *     "last seen" marker even out of vision. Accepted v1 simplification:
   *     a building placed in an explored-but-unwatched area pops in
   *     immediately instead of on re-scout.
   *     TODO(phase-5): proper "last seen" snapshots (ghost meshes frozen at
   *     the state they had when vision was lost).
   *   - neutral resource nodes: visible once explored (same rationale).
   * @param {object} em - engine.entities
   * @param {Array<object>} visionPlayers
   * @private
   */
  _refreshEntityVisibility(em, visionPlayers) {
    const visionSet = new Set(visionPlayers);
    const units = em.units;
    if (units) {
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (!u.mesh) continue;
        const p = u.player;
        const allied = !p || visionSet.has(p);
        u.mesh.visible = allied ? true : this.isVisible(u.position);
      }
    }

    const buildings = em.buildings;
    if (buildings) {
      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        if (!b.mesh) continue;
        const p = b.player;
        const allied = !p || visionSet.has(p);
        b.mesh.visible = allied ? true : this.isExplored(b.position);
      }
    }

    // Neutral resource nodes appear once the area has been scouted.
    const resources = em.resources;
    if (resources) {
      for (let i = 0; i < resources.length; i++) {
        const r = resources[i];
        if (!r.mesh) continue;
        r.mesh.visible = this.isExplored(r.position);
      }
    }
  }

  _revealAll(em) {
    const d = this._data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255;
      d[i + 1] = 255;
    }
    this.texture.needsUpdate = true;
    const lists = [em.units, em.buildings, em.resources];
    for (const list of lists) {
      for (const e of list ?? []) {
        if (e.mesh) e.mesh.visible = !e.isDead;
      }
    }
  }
}
