import * as THREE from 'three';
import { buildUnitModel, buildBuildingModel } from './ModelFactory.js';
import { getUnitType } from '../config/UnitTypes.js';

// Cache for generated portraits (data URLs)
const portraitCache = new Map();

// Single shared offscreen renderer, scene, camera, lights
let renderer = null;
let scene = null;
let camera = null;
let sunLight = null;
let hemiLight = null;

function initOffscreen() {
  if (renderer) return;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true, // transparent background
    preserveDrawingBuffer: true,
  });
  renderer.setSize(128, 128);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  scene = new THREE.Scene();
  scene.background = null;

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

  hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.25);
  hemiLight.position.set(0, 20, 0);
  scene.add(hemiLight);

  sunLight = new THREE.DirectionalLight(0xffffff, 1.6);
  sunLight.position.set(10, 15, 10);
  scene.add(sunLight);
}

/**
 * Generate and cache a 3D model render portrait as a base64 PNG data URL.
 * @param {string} typeId - The unit or building type ID (e.g. 'BH_FOOTMAN').
 * @param {string} [colorHex='#4da6ff'] - The team/owner color to apply to parts.
 * @returns {string|null} Base64 data URL representing the rendered portrait, or null if failed.
 */
export function get3DPortrait(typeId, colorHex = '#4da6ff') {
  const cacheKey = `${typeId}:${colorHex}`;
  if (portraitCache.has(cacheKey)) {
    return portraitCache.get(cacheKey);
  }

  try {
    initOffscreen();

    // Look up unit/building type
    const type = getUnitType(typeId);
    const isBuilding = type.class === 'BUILDING';

    // Clear previous model from scene (hemiLight is at index 0, sunLight at index 1)
    while (scene.children.length > 2) {
      scene.remove(scene.children[2]);
    }

    // Build the 3D model Group
    let modelObj;
    if (isBuilding) {
      modelObj = buildBuildingModel(type, colorHex);
    } else {
      modelObj = buildUnitModel(type, colorHex);
    }

    const group = modelObj.group;
    const height = modelObj.height || 1.5;
    scene.add(group);

    const radius = type.radius || 0.6;
    
    // Position camera dynamically based on type category
    if (isBuilding) {
      // Fit building from slightly higher front-right-top angle
      camera.position.set(radius * 1.5, height * 0.9, radius * 2.2);
      camera.lookAt(0, height * 0.35, 0);
    } else {
      // Zoom closer on units for detail portrait
      camera.position.set(radius * 1.6, height * 0.75, radius * 2.0);
      camera.lookAt(0, height * 0.55, 0);
    }

    // Render offscreen
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/png');
    
    // Cache it
    portraitCache.set(cacheKey, dataUrl);
    
    // Cleanup group
    scene.remove(group);

    return dataUrl;
  } catch (err) {
    console.error('Failed to render 3D portrait for', typeId, err);
    return null;
  }
}
