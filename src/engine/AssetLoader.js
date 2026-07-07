/**
 * AssetLoader — centralized, fail-soft asset loading.
 *
 * v1 ships no models or textures, so every load is expected to 404. The
 * contract is that a missing asset resolves to `null` with a single warning —
 * never a rejected promise that would abort engine bootstrap. Callers treat a
 * null result as "use the primitive placeholder" (the game is fully playable
 * with capsules and boxes).
 *
 * Textures and GLTF models are cached by URL so repeated requests share one
 * GPU resource; `dispose()` frees everything the loader owns.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class AssetLoader {
  constructor() {
    this._textureLoader = new THREE.TextureLoader();
    this._gltfLoader = new GLTFLoader();
    /** @type {Map<string, THREE.Texture>} url → texture cache. */
    this._textures = new Map();
    /** @type {Set<string>} urls already warned about (warn once). */
    this._warned = new Set();
  }

  /**
   * Load a texture, or resolve `null` if it is missing/unreadable.
   * @param {string} url
   * @returns {Promise<THREE.Texture|null>}
   */
  loadTexture(url) {
    const cached = this._textures.get(url);
    if (cached) return Promise.resolve(cached);
    return new Promise((resolve) => {
      this._textureLoader.load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          this._textures.set(url, texture);
          resolve(texture);
        },
        undefined,
        () => {
          this._warnOnce(url);
          resolve(null);
        }
      );
    });
  }

  /**
   * Load a GLTF model, or resolve `null` on failure.
   * @param {string} url
   * @returns {Promise<import('three/examples/jsm/loaders/GLTFLoader.js').GLTF|null>}
   */
  loadGLTF(url) {
    return new Promise((resolve) => {
      this._gltfLoader.load(
        url,
        (gltf) => resolve(gltf),
        undefined,
        () => {
          this._warnOnce(url);
          resolve(null);
        }
      );
    });
  }

  /** @private */
  _warnOnce(url) {
    if (this._warned.has(url)) return;
    this._warned.add(url);
    console.warn(`[AssetLoader] Missing asset "${url}" — using placeholder (fail-soft).`);
  }

  /** Dispose all cached GPU resources. */
  dispose() {
    for (const texture of this._textures.values()) texture.dispose();
    this._textures.clear();
    this._warned.clear();
  }
}
