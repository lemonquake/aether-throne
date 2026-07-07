/**
 * SceneManager — owns the Three.js renderer, scene, gameplay camera, and the
 * global lighting rig. It is deliberately dumb: it builds the render context
 * and keeps it sized to the window, and nothing else. Camera *movement* is the
 * RTSCameraController's job; SceneManager only constructs the camera.
 *
 * Lighting: a hemisphere light for soft ambient fill plus one shadow-casting
 * directional "sun" whose orthographic shadow frustum covers the whole play
 * area (so unit/building shadows are crisp across the map).
 */
import * as THREE from 'three';
import { GAME_CONFIG } from '../config/GameConfig.js';

const CAM = GAME_CONFIG.CAMERA;

const NORMAL_ENVIRONMENT = {
  horizon: 0x6f8aa0,
  fogNear: CAM.FAR * 0.58,
  fogFar: CAM.FAR * 0.96,
  skyTop: 0x356b9a,
  skyMid: 0x9db8c7,
  skyBottom: 0x6f8aa0,
  hemiSky: 0xf2f7ff,
  hemiGround: 0x56604e,
  hemiIntensity: 0.98,
  sun: 0xfff0d0,
  sunIntensity: 1.45,
  sunPosition: [58, 94, 34],
  exposure: 1.03,
};

export class SceneManager {
  /**
   * @param {HTMLCanvasElement} canvas - The in-game canvas (#game-canvas).
   */
  constructor(canvas) {
    this.canvas = canvas;

    // ── Renderer ────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // ── Scene ───────────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    // Horizon haze color — distant terrain fades into it, blending with the
    // sky dome instead of dropping to a black void at the map edge.
    const horizon = new THREE.Color(0x4a5a6c);
    this.scene.background = horizon.clone();
    this.scene.fog = new THREE.Fog(horizon.clone(), CAM.FAR * 0.5, CAM.FAR * 0.94);

    // ── Camera ──────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(
      CAM.FOV,
      window.innerWidth / Math.max(1, window.innerHeight),
      CAM.NEAR,
      CAM.FAR
    );
    // Initial pose is a sane top-down; RTSCameraController overrides it at once.
    this.camera.position.set(0, CAM.START_HEIGHT, CAM.START_HEIGHT * CAM.OFFSET_RATIO);
    this.camera.lookAt(0, 0, 0);

    this._buildSky();
    this._buildLights();
    this.applyMapEnvironment('aether_plains');

    // Keep the render target matched to the window.
    this._onResize = this.handleResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this.handleResize();
  }

  /**
   * A large gradient sky dome (deep blue zenith → warm horizon haze) rendered
   * behind everything. Cheap 2-color shader; static at the origin (the camera
   * always stays well inside its radius).
   * @private
   */
  _buildSky() {
    const geo = new THREE.SphereGeometry(CAM.FAR * 0.92, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x21406e) },
        midColor: { value: new THREE.Color(0x6a8296) },
        bottomColor: { value: new THREE.Color(0x3a4652) },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        void main() {
          float h = vDir.y;
          vec3 c = h > 0.0
            ? mix(midColor, topColor, pow(clamp(h, 0.0, 1.0), 0.55))
            : mix(midColor, bottomColor, pow(clamp(-h, 0.0, 1.0), 0.5));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this._sky = new THREE.Mesh(geo, mat);
    this._sky.name = 'sky-dome';
    this._sky.frustumCulled = false;
    this.scene.add(this._sky);
  }

  /**
   * Hemisphere ambient + a directional sun with a map-covering shadow frustum.
   * @private
   */
  _buildLights() {
    const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x3a3a2c, 0.95);
    hemi.position.set(0, 50, 0);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff1cf, 1.45);
    sun.position.set(60, 90, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);

    // Orthographic shadow camera sized to enclose the whole map.
    const half = Math.max(GAME_CONFIG.MAP.WIDTH, GAME_CONFIG.MAP.DEPTH) * 0.6;
    const sc = sun.shadow.camera;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 1;
    sc.far = 400;
    sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.08;
    sun.shadow.radius = 4.0;

    this.scene.add(sun);
    this.scene.add(sun.target); // target defaults to origin — the map center
    this._sun = sun;
    this._hemi = hemi;
  }

  /**
   * Retune global ambience for a battleground. This keeps the expensive light
   * count fixed while making each tileset read like a different place.
   * @param {string} mapId
   */
  applyMapEnvironment(mapId) {
    void mapId;
    const env = NORMAL_ENVIRONMENT;
    const horizon = new THREE.Color(env.horizon);
    this.scene.background = horizon.clone();
    if (this.scene.fog) {
      this.scene.fog.color.copy(horizon);
      this.scene.fog.near = env.fogNear;
      this.scene.fog.far = env.fogFar;
    }
    if (this._sky?.material?.uniforms) {
      this._sky.material.uniforms.topColor.value.setHex(env.skyTop);
      this._sky.material.uniforms.midColor.value.setHex(env.skyMid);
      this._sky.material.uniforms.bottomColor.value.setHex(env.skyBottom);
    }
    if (this._hemi) {
      this._hemi.color.setHex(env.hemiSky);
      this._hemi.groundColor.setHex(env.hemiGround);
      this._hemi.intensity = env.hemiIntensity;
    }
    if (this._sun) {
      this._sun.color.setHex(env.sun);
      this._sun.intensity = env.sunIntensity;
      this._sun.position.set(env.sunPosition[0], env.sunPosition[1], env.sunPosition[2]);
      this._sun.target.position.set(0, 0, 0);
    }
    this.renderer.toneMappingExposure = env.exposure;
  }

  /** Resize renderer + camera aspect to the current window. */
  handleResize() {
    const w = window.innerWidth;
    const h = Math.max(1, window.innerHeight);
    this.renderer.setSize(w, h, false); // false: don't touch the canvas CSS size
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Detach listeners and free the renderer's GL context. */
  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.scene.remove(this._sun, this._sun.target, this._hemi);
    if (this._sky) {
      this.scene.remove(this._sky);
      this._sky.geometry.dispose();
      this._sky.material.dispose();
      this._sky = null;
    }
    this.renderer.dispose();
  }
}
