import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../../state/useGameStore.js';
import { getEngine } from '../../GameBootstrap.js';

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const targetPoint = new THREE.Vector3();

/**
 * Projects the four corners of the screen (NDC space) onto the ground plane (Y=0)
 * to calculate the camera's viewport frustum rectangle.
 */
function getCameraViewportCorners(engine) {
  const camera = engine.camera;
  if (!camera) return null;

  // NDC corners in counter-clockwise order: bottom-left, bottom-right, top-right, top-left
  const ndcCoords = [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 }
  ];

  const points = [];
  const ndcVec = new THREE.Vector3();
  const ray = new THREE.Ray();

  for (const ndc of ndcCoords) {
    ndcVec.set(ndc.x, ndc.y, 0.5);
    ndcVec.unproject(camera);
    const dir = ndcVec.clone().sub(camera.position).normalize();
    ray.set(camera.position, dir);
    
    if (ray.intersectPlane(groundPlane, targetPoint)) {
      points.push({ x: targetPoint.x, z: targetPoint.z });
    } else {
      return null;
    }
  }

  return points;
}

export default function Minimap() {
  const canvasRef = useRef(null);
  const offscreenCanvasRef = useRef(null);
  const imageDataRef = useRef(null);
  const pingTimes = useRef(new Map());
  const isDraggingRef = useRef(false);

  // Helper coordinate conversions: world space (-200..200) -> canvas space (0..150)
  const toCanvasX = (wx) => ((wx + 200) / 400) * 150;
  const toCanvasY = (wz) => ((wz + 200) / 400) * 150;

  const renderMinimap = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const engine = getEngine();
    if (!engine) return;

    const width = canvas.width;
    const height = canvas.height;

    // 1) Clear background (deep space dark blue/black)
    ctx.fillStyle = '#03050a';
    ctx.fillRect(0, 0, width, height);

    const nexus = engine.nexus;
    const isAetherCore = nexus?.nexusId === 'aether_core';
    const resonanceColor = nexus?.nexusType?.resonanceColor || '#00ffff';

    // 2) Draw map background boundary (playable circular area)
    // Walkable bounds is a circle of radius 184 units around (0,0)
    const playableRadiusPx = (184 / 400) * width; // ~69px
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, playableRadiusPx, 0, Math.PI * 2);
    if (isAetherCore) {
      ctx.fillStyle = '#102615'; // Forest fields green
      ctx.fill();
      ctx.strokeStyle = '#254e2f';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#080a12'; // Holographic matrix dark blue
      ctx.fill();
      ctx.strokeStyle = resonanceColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Faint concentric circle & crosshair helpers for sci-fi look
      ctx.strokeStyle = resonanceColor + '10'; // 10% opacity hex
      ctx.lineWidth = 0.8;
      
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, playableRadiusPx * 0.45, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(width / 2 - playableRadiusPx, height / 2);
      ctx.lineTo(width / 2 + playableRadiusPx, height / 2);
      ctx.moveTo(width / 2, height / 2 - playableRadiusPx);
      ctx.lineTo(width / 2, height / 2 + playableRadiusPx);
      ctx.stroke();
    }

    // 3) Draw static obstacles (Void Fissures, Aetheric Spires, Energy Monoliths)
    if (nexus?._staticObstacles) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.strokeStyle = isAetherCore ? 'rgba(37, 78, 47, 0.15)' : resonanceColor + '15';
      ctx.lineWidth = 0.5;

      for (const obs of nexus._staticObstacles) {
        const cx = toCanvasX(obs.x);
        const cy = toCanvasY(obs.z);
        const cr = (obs.r / 400) * width;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // 4) Draw resource nodes (Gold Mines & Aether Wells)
    const resources = engine.entities?.resources || [];
    for (const node of resources) {
      if (node.isDead || node.amount <= 0) continue;

      // Fog of War culling for resource nodes
      if (engine.fog && !engine.isRevealAll?.() && !engine.fog.isExplored(node.position)) {
        continue; // hide completely if never explored
      }

      const cx = toCanvasX(node.position.x);
      const cy = toCanvasY(node.position.z);

      if (node.kind === 'GOLD_MINE') {
        // Gold Mine -> Diamond
        ctx.beginPath();
        ctx.moveTo(cx, cy - 3);
        ctx.lineTo(cx + 3, cy);
        ctx.lineTo(cx, cy + 3);
        ctx.lineTo(cx - 3, cy);
        ctx.closePath();
        ctx.fillStyle = '#ffcf33';
        ctx.fill();
        ctx.strokeStyle = '#3d2e05';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      } else {
        // Aether Well -> Hexagon/Circle
        ctx.beginPath();
        ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#00e5ff';
        ctx.fill();
        ctx.strokeStyle = '#004c54';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // 5) Draw units and buildings
    const units = engine.entities?.units || [];
    const buildings = engine.entities?.buildings || [];

    const drawEntityBlip = (ent, isBuilding) => {
      if (ent.isDead) return;

      const pos = ent.position;
      if (engine.isEntityVisibleToViewer && !engine.isEntityVisibleToViewer(ent)) {
        return;
      }

      const cx = toCanvasX(pos.x);
      const cy = toCanvasY(pos.z);

      let color = '#888888';
      if (ent.player) {
        if (ent.player.isNeutralHostile) {
          color = '#e58c00'; // Orange/neutral hostile creep
        } else {
          color = ent.player.colorHex || '#5fe0ff';
        }
      }

      if (isBuilding) {
        // Buildings are drawn as slightly larger squares
        ctx.fillStyle = color;
        ctx.fillRect(cx - 2.5, cy - 2.5, 5, 5);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(cx - 2.5, cy - 2.5, 5, 5);
      } else {
        // Units are drawn as small circles
        ctx.beginPath();
        ctx.arc(cx, cy, 2.0, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    };

    for (const b of buildings) drawEntityBlip(b, true);
    for (const u of units) drawEntityBlip(u, false);

    // 6) Draw under-attack alerts / pings
    const currentPings = useGameStore.getState().minimapPings || [];
    const now = Date.now();

    // Clean up timestamps for stale pings
    for (const key of pingTimes.current.keys()) {
      if (!currentPings.some((p) => p.id === key)) {
        pingTimes.current.delete(key);
      }
    }

    for (const ping of currentPings) {
      if (!pingTimes.current.has(ping.id)) {
        pingTimes.current.set(ping.id, now);
      }
      const startTime = pingTimes.current.get(ping.id);
      const elapsed = (now - startTime) / 1000; // in seconds

      if (elapsed < 1.2) {
        const px = toCanvasX(ping.x);
        const py = toCanvasY(ping.z);
        const maxRadius = 16;
        const radius = (elapsed / 1.2) * maxRadius;
        const opacity = 1.0 - elapsed / 1.2;

        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 45, 45, ${opacity})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px, py, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 45, 45, ${opacity})`;
        ctx.fill();
      }
    }

    // 7) Draw Fog of War overlay (black/dark grey masks)
    if (engine.fog) {
      const fogRes = 64;
      const fogData = engine.fog.sampleMinimap(fogRes);

      if (!offscreenCanvasRef.current) {
        offscreenCanvasRef.current = document.createElement('canvas');
        offscreenCanvasRef.current.width = fogRes;
        offscreenCanvasRef.current.height = fogRes;
      }
      const offCanvas = offscreenCanvasRef.current;
      const offCtx = offCanvas.getContext('2d');

      if (!imageDataRef.current) {
        imageDataRef.current = offCtx.createImageData(fogRes, fogRes);
      }
      const imgData = imageDataRef.current;
      const pix = imgData.data;

      for (let i = 0; i < fogRes * fogRes; i++) {
        const state = fogData[i];
        const idx = i * 4;
        pix[idx] = 0;     // R
        pix[idx + 1] = 0; // G
        pix[idx + 2] = 0; // B
        // state 255 = visible (0 alpha), state 128 = explored (140 alpha), state 0 = black (255 alpha)
        pix[idx + 3] = state === 255 ? 0 : state === 128 ? 140 : 255;
      }
      offCtx.putImageData(imgData, 0, 0);

      // Draw onto the main canvas with smoothing for nice blurred fog borders
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(offCanvas, 0, 0, width, height);
    }

    // 8) Draw Camera Viewport Box
    const corners = getCameraViewportCorners(engine);
    if (corners) {
      ctx.beginPath();
      ctx.moveTo(toCanvasX(corners[0].x), toCanvasY(corners[0].z));
      for (let i = 1; i < 4; i++) {
        ctx.lineTo(toCanvasX(corners[i].x), toCanvasY(corners[i].z));
      }
      ctx.closePath();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fill();
    }
  };

  useEffect(() => {
    let animId;
    const loop = () => {
      renderMinimap();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Handle left-click panning and right-click smart commanding
  const handlePointerAction = (e, isMoving = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = getEngine();
    if (!engine) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert pixel coordinates (0..rect.width) to world coordinates (-200..200)
    const wx = (clickX / rect.width) * 400 - 200;
    const wz = (clickY / rect.height) * 400 - 200;

    if (e.buttons & 1) {
      // Left-drag or Left-click: Pan the camera instantly (duration = 0)
      engine.cameraController.panTo(new THREE.Vector3(wx, 0, wz), 0);
    } else if (e.button === 2 && !isMoving && !engine.isObserver) {
      // Right-click: issue move/gather/smart order
      engine.ui.minimapCommand(wx, wz, false);
    }
  };

  const onPointerDown = (e) => {
    if (e.button === 0) {
      isDraggingRef.current = true;
    }
    handlePointerAction(e);
  };

  const onPointerMove = (e) => {
    if (isDraggingRef.current) {
      handlePointerAction(e, true);
    }
  };

  const onPointerUp = (e) => {
    if (e.button === 0) {
      isDraggingRef.current = false;
    }
  };

  return (
    <div className="hud-minimap hud-interactive" onContextMenu={(e) => e.preventDefault()}>
      <canvas
        ref={canvasRef}
        width={150}
        height={150}
        style={{ width: 150, height: 150, pointerEvents: 'auto' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </div>
  );
}
