import * as THREE from 'three';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { ARCHETYPE } from '../config/UnitTypes.js';

const PATH = GAME_CONFIG.PATH;
const NEXT_WAYPOINT_DISTANCE = 1.0;

function hasPhasedUnitMovement(unit) {
  return unit?.type?.archetype === ARCHETYPE.WORKER;
}

class MockVector3 extends THREE.Vector3 {
  squaredLength() {
    return this.lengthSq();
  }
}

class MockArriveBehavior {
  constructor() {
    this.target = new MockVector3();
    this.active = false;
  }
}

class MockFollowPathBehavior {
  constructor() {
    this.path = [];
    this.active = false;
  }
}

class MockSeparationBehavior {
  constructor() {
    this.active = true;
    this.weight = PATH.SEPARATION_WEIGHT;
    this.type = 'separation';
  }
}

class MockSteering {
  constructor(arrive, separation, follow) {
    this.behaviors = [arrive, separation, follow];
  }
}

export class CustomVehicle {
  constructor(unit) {
    this.unit = unit;
    this.position = new MockVector3();
    this.velocity = new MockVector3();
    this.maxSpeed = unit.type.moveSpeed;
    this.maxForce = unit.type.moveSpeed * 12;
    this.mass = 1;
    this.boundingRadius = unit.type.radius;
    this.updateNeighborhood = true;
    this.neighborhoodRadius = unit.type.radius * 2 + 0.15;

    this._arrive = new MockArriveBehavior();
    this._follow = new MockFollowPathBehavior();
    this._separation = new MockSeparationBehavior();
    this.steering = new MockSteering(this._arrive, this._separation, this._follow);
  }
}

export class NavigationManager {
  constructor() {
    this._vehicles = new Set();
    this._vehiclesList = [];
    this._queue = new Map();
    this._bounds = null;
    this._terrain = null;

    // Preallocate spatial partition buckets (20x20 = 400 buckets)
    this._buckets = Array.from({ length: 400 }, () => []);

    // Preallocate A* pathfinding scratch buffers (grid size is 200x200 = 40000 cells)
    this._closed = new Uint8Array(40000);
    this._gScore = new Float32Array(40000);
    this._fScore = new Float32Array(40000);
    this._cameFrom = new Int32Array(40000);
  }

  init(nexus) {
    this._nexus = nexus;
    this._bounds = nexus.getBounds();
  }

  createVehicle(unit) {
    const vehicle = new CustomVehicle(unit);
    vehicle.position.set(unit.position.x, 0, unit.position.z);
    this._vehicles.add(vehicle);
    this._vehiclesList.push(vehicle);
    return vehicle;
  }

  removeVehicle(vehicle) {
    if (!vehicle) return;
    this._vehicles.delete(vehicle);
    const idx = this._vehiclesList.indexOf(vehicle);
    if (idx !== -1) {
      this._vehiclesList.splice(idx, 1);
    }
    if (vehicle.unit) {
      this._queue.delete(vehicle.unit.id);
    }
  }

  requestPath(unit, targetVec3, onPath = null) {
    if (!unit || !unit.vehicle) return;
    this._queue.set(unit.id, {
      unit,
      x: targetVec3.x,
      z: targetVec3.z,
      onPath,
    });
  }

  update(dt) {
    // 1) Drain a bounded slice of the path queue.
    if (this._queue.size > 0) {
      let budget = PATH.MAX_REQUESTS_PER_FRAME;
      let sharedGroundGrid = null;

      for (const [key, req] of this._queue) {
        if (budget <= 0) break;
        this._queue.delete(key);
        budget -= 1;

        // Optimize: Flying units ignore terrain/buildings and fly straight
        const isFlying = !!(req.unit && (
          req.unit.typeId === 'BH_GRYPHON' ||
          req.unit.typeId === 'AH_BRASS_AVIATOR' ||
          req.unit.typeId === 'TB_IRONSTONE_GARGOYLE' ||
          req.unit.typeId === 'CD_SPOREMANTA' ||
          req.unit.type?.name?.toLowerCase().includes('fly') ||
          req.unit.type?.name?.toLowerCase().includes('wing') ||
          req.unit.type?.name?.toLowerCase().includes('gryphon') ||
          req.unit.type?.name?.toLowerCase().includes('manta') ||
          req.unit.type?.name?.toLowerCase().includes('aviator') ||
          req.unit.type?.name?.toLowerCase().includes('gargoyle')
        ));

        if (isFlying) {
          const vehicle = req.unit.vehicle;
          if (vehicle) {
            vehicle._follow.active = false;
            vehicle._arrive.target.set(req.x, 0, req.z);
            vehicle._arrive.active = true;
            if (req.onPath) {
              req.onPath([
                new THREE.Vector3(vehicle.position.x, 0, vehicle.position.z),
                new THREE.Vector3(req.x, 0, req.z)
              ]);
            }
          }
          continue;
        }

        let grid;
        const isAmphibious = !!(req.unit && (
          req.unit.type?.name?.toLowerCase().includes('amphibious') ||
          req.unit.type?.name?.toLowerCase().includes('turtle') ||
          req.unit.type?.name?.toLowerCase().includes('elemental')
        ));

        if (isAmphibious) {
          grid = this.buildWalkabilityGrid(req.unit); // Rebuild for rare amphibious units
        } else {
          if (!sharedGroundGrid) {
            sharedGroundGrid = this.buildWalkabilityGrid(null); // Build once per frame
          }
          grid = sharedGroundGrid;
        }

        this._resolve(req, grid);
      }
    }

    // 2) Integrate steering & velocities
    const vehicles = this._vehiclesList;

    for (const vehicle of vehicles) {
      const unit = vehicle.unit;
      if (!unit || unit.isDead) continue;

      let speed = unit.type.moveSpeed;
      let desiredVelX = 0;
      let desiredVelZ = 0;

      if (vehicle._follow.active && vehicle._follow.path && vehicle._follow.path.length > 0) {
        const path = vehicle._follow.path;
        let target = path[0];
        let dx = target.x - vehicle.position.x;
        let dz = target.z - vehicle.position.z;
        let dist = Math.hypot(dx, dz);

        while (dist < NEXT_WAYPOINT_DISTANCE && path.length > 1) {
          path.shift();
          target = path[0];
          dx = target.x - vehicle.position.x;
          dz = target.z - vehicle.position.z;
          dist = Math.hypot(dx, dz);
        }

        if (path.length === 1 && dist < GAME_CONFIG.PATH.ARRIVE_TOLERANCE) {
          vehicle._follow.active = false;
          vehicle.velocity.set(0, 0, 0);
        } else {
          desiredVelX = (dx / dist) * speed;
          desiredVelZ = (dz / dist) * speed;
        }
      } else if (vehicle._arrive.active) {
        const target = vehicle._arrive.target;
        const dx = target.x - vehicle.position.x;
        const dz = target.z - vehicle.position.z;
        const dist = Math.hypot(dx, dz);

        if (dist < GAME_CONFIG.PATH.ARRIVE_TOLERANCE) {
          vehicle._arrive.active = false;
          vehicle.velocity.set(0, 0, 0);
        } else {
          const decelDist = GAME_CONFIG.PATH.ARRIVE_DECELERATION;
          const factor = dist < decelDist ? dist / decelDist : 1.0;
          desiredVelX = (dx / dist) * speed * factor;
          desiredVelZ = (dz / dist) * speed * factor;
        }
      }

      vehicle.velocity.set(desiredVelX, 0, desiredVelZ);
    }

    // 3) Unit-vs-Unit Collision, Sliding, and Pushing (Starcraft/WC3 Style)
    // Optimized with a 20x20 spatial partition hash to eliminate O(V^2) CPU cost.
    const passes = 2;
    const numBuckets = 20;
    const bucketSize = 400 / numBuckets; // 20 units per bucket cell
    const buckets = this._buckets;

    for (let pass = 0; pass < passes; pass++) {
      for (let bIdx = 0; bIdx < buckets.length; bIdx++) {
        buckets[bIdx].length = 0;
      }

      for (let i = 0; i < vehicles.length; i++) {
        const v = vehicles[i];
        if (!v.unit || v.unit.isDead) continue;
        const bx = Math.max(0, Math.min(19, Math.floor((v.position.x + 200) / bucketSize)));
        const bz = Math.max(0, Math.min(19, Math.floor((v.position.z + 200) / bucketSize)));
        buckets[bz * numBuckets + bx].push(v);
      }

      for (let i = 0; i < vehicles.length; i++) {
        const vA = vehicles[i];
        if (!vA.unit || vA.unit.isDead) continue;
        const posA = vA.position;
        const rA = vA.boundingRadius;
        
        const bx = Math.max(0, Math.min(19, Math.floor((posA.x + 200) / bucketSize)));
        const bz = Math.max(0, Math.min(19, Math.floor((posA.z + 200) / bucketSize)));

        for (let dbz = -1; dbz <= 1; dbz++) {
          const nbz = bz + dbz;
          if (nbz < 0 || nbz >= 20) continue;

          for (let dbx = -1; dbx <= 1; dbx++) {
            const nbx = bx + dbx;
            if (nbx < 0 || nbx >= 20) continue;

            const bucket = buckets[nbz * numBuckets + nbx];
            for (let k = 0; k < bucket.length; k++) {
              const vB = bucket[k];
              if (vA.unit.id >= vB.unit.id || vB.unit.isDead) continue;
              if (hasPhasedUnitMovement(vA.unit) || hasPhasedUnitMovement(vB.unit)) continue;

              const posB = vB.position;
              const rB = vB.boundingRadius;

              const dx = posB.x - posA.x;
              const dz = posB.z - posA.z;
              const distSq = dx * dx + dz * dz;
              const minDist = rA + rB;

              if (distSq < minDist * minDist) {
                const dist = Math.sqrt(distSq) || 0.001;
                const overlap = minDist - dist;
                
                const nx = dx / dist;
                const nz = dz / dist;

                const isAMoving = vA.velocity.x * vA.velocity.x + vA.velocity.z * vA.velocity.z > 0.01;
                const isBMoving = vB.velocity.x * vB.velocity.x + vB.velocity.z * vB.velocity.z > 0.01;
                const samePlayer = vA.unit.player === vB.unit.player;

                if (samePlayer) {
                  if (isAMoving && !isBMoving) {
                    posB.x += nx * overlap * 0.85;
                    posB.z += nz * overlap * 0.85;
                    posA.x -= nx * overlap * 0.15;
                    posA.z -= nz * overlap * 0.15;

                    const dot = vA.velocity.x * nx + vA.velocity.z * nz;
                    if (dot > 0) {
                      vA.velocity.x -= nx * dot;
                      vA.velocity.z -= nz * dot;
                    }
                  } else if (!isAMoving && isBMoving) {
                    posA.x -= nx * overlap * 0.85;
                    posA.z -= nz * overlap * 0.85;
                    posB.x += nx * overlap * 0.15;
                    posB.z += nz * overlap * 0.15;

                    const dot = vB.velocity.x * (-nx) + vB.velocity.z * (-nz);
                    if (dot > 0) {
                      vB.velocity.x -= (-nx) * dot;
                      vB.velocity.z -= (-nz) * dot;
                    }
                  } else {
                    posA.x -= nx * overlap * 0.5;
                    posA.z -= nz * overlap * 0.5;
                    posB.x += nx * overlap * 0.5;
                    posB.z += nz * overlap * 0.5;

                    const dotA = vA.velocity.x * nx + vA.velocity.z * nz;
                    if (dotA > 0) {
                      vA.velocity.x -= nx * dotA;
                      vA.velocity.z -= nz * dotA;
                    }
                    const dotB = vB.velocity.x * (-nx) + vB.velocity.z * (-nz);
                    if (dotB > 0) {
                      vB.velocity.x -= (-nx) * dotB;
                      vB.velocity.z -= (-nz) * dotB;
                    }
                  }
                } else {
                  posA.x -= nx * overlap * 0.5;
                  posA.z -= nz * overlap * 0.5;
                  posB.x += nx * overlap * 0.5;
                  posB.z += nz * overlap * 0.5;

                  const dotA = vA.velocity.x * nx + vA.velocity.z * nz;
                  if (dotA > 0) {
                    vA.velocity.x -= nx * dotA;
                    vA.velocity.z -= nz * dotA;
                  }
                  const dotB = vB.velocity.x * (-nx) + vB.velocity.z * (-nz);
                  if (dotB > 0) {
                    vB.velocity.x -= (-nx) * dotB;
                    vB.velocity.z -= (-nz) * dotB;
                  }
                }
              }
            }
          }
        }
      }
    }

    // 4) Apply integrated velocities to positions
    for (let i = 0; i < vehicles.length; i++) {
      const vehicle = vehicles[i];
      if (!vehicle.unit || vehicle.unit.isDead) continue;
      vehicle.position.x += vehicle.velocity.x * dt;
      vehicle.position.z += vehicle.velocity.z * dt;
    }
  }

  buildWalkabilityGrid(unit = null) {
    const isFlying = !!(unit && (
      unit.typeId === 'BH_GRYPHON' ||
      unit.typeId === 'AH_BRASS_AVIATOR' ||
      unit.typeId === 'TB_IRONSTONE_GARGOYLE' ||
      unit.typeId === 'CD_SPOREMANTA' ||
      unit.type?.name?.toLowerCase().includes('fly') ||
      unit.type?.name?.toLowerCase().includes('wing') ||
      unit.type?.name?.toLowerCase().includes('gryphon') ||
      unit.type?.name?.toLowerCase().includes('manta') ||
      unit.type?.name?.toLowerCase().includes('aviator') ||
      unit.type?.name?.toLowerCase().includes('gargoyle')
    ));
    const isAmphibious = !!(unit && (
      unit.type?.name?.toLowerCase().includes('amphibious') ||
      unit.type?.name?.toLowerCase().includes('turtle') ||
      unit.type?.name?.toLowerCase().includes('elemental')
    ));

    const grid = new Uint8Array(200 * 200);
    const nexus = this._nexus;
    
    // 1) Initialize grid with base terrain walkability
    if (nexus) {
      for (let r = 0; r < 200; r++) {
        const cz = r * 2 - 200 + 1.0;
        const czSq = cz * cz;
        for (let c = 0; c < 200; c++) {
          const cx = c * 2 - 200 + 1.0;
          const walkable = (cx * cx + czSq <= 184 * 184);
          grid[r * 200 + c] = (walkable || isFlying || isAmphibious) ? 1 : 0;
        }
      }
    } else {
      grid.fill(1); // Fallback
    }

    if (isFlying) {
      return grid; // Flying units bypass static and building colliders
    }

    // 2) Subtract static obstacles (trees, rocks, etc.) using local swept bounding boxes
    if (nexus && nexus._staticObstacles) {
      for (let i = 0; i < nexus._staticObstacles.length; i++) {
        const obs = nexus._staticObstacles[i];
        const ox = obs.x;
        const oz = obs.z;
        const or = obs.r;

        const colMin = Math.max(0, Math.floor((ox - or - 0.45 + 200) / 2));
        const colMax = Math.min(199, Math.floor((ox + or + 0.45 + 200) / 2));
        const rowMin = Math.max(0, Math.floor((oz - or - 0.45 + 200) / 2));
        const rowMax = Math.min(199, Math.floor((oz + or + 0.45 + 200) / 2));

        for (let r = rowMin; r <= rowMax; r++) {
          const cz = r * 2 - 200 + 1.0;
          const dz = cz - oz;
          const dzSq = dz * dz;
          for (let c = colMin; c <= colMax; c++) {
            const cx = c * 2 - 200 + 1.0;
            const dx = cx - ox;
            if (dx * dx + dzSq < (or + 0.45) * (or + 0.45)) {
              grid[r * 200 + c] = 0;
            }
          }
        }
      }
    }

    // 3) Subtract buildings using local swept bounding boxes
    const entities = nexus?.engine?.entities;
    if (entities && entities.buildings) {
      for (let i = 0; i < entities.buildings.length; i++) {
        const b = entities.buildings[i];
        if (b.isDead) continue;
        const bx = b.position.x;
        const bz = b.position.z;
        const br = b.type.radius;

        const colMin = Math.max(0, Math.floor((bx - br - 0.45 + 200) / 2));
        const colMax = Math.min(199, Math.floor((bx + br + 0.45 + 200) / 2));
        const rowMin = Math.max(0, Math.floor((bz - br - 0.45 + 200) / 2));
        const rowMax = Math.min(199, Math.floor((bz + br + 0.45 + 200) / 2));

        for (let r = rowMin; r <= rowMax; r++) {
          const cz = r * 2 - 200 + 1.0;
          const dz = cz - bz;
          const dzSq = dz * dz;
          for (let c = colMin; c <= colMax; c++) {
            const cx = c * 2 - 200 + 1.0;
            const dx = cx - bx;
            if (dx * dx + dzSq < (br + 0.45) * (br + 0.45)) {
              grid[r * 200 + c] = 0;
            }
          }
        }
      }
    }

    // 4) Subtract resources using local swept bounding boxes
    if (entities && entities.resources) {
      for (let i = 0; i < entities.resources.length; i++) {
        const node = entities.resources[i];
        if (node.isDead) continue;
        const rx = node.position.x;
        const rz = node.position.z;
        const rr = node.type?.radius ?? 1.6;

        const colMin = Math.max(0, Math.floor((rx - rr - 0.45 + 200) / 2));
        const colMax = Math.min(199, Math.floor((rx + rr + 0.45 + 200) / 2));
        const rowMin = Math.max(0, Math.floor((rz - rr - 0.45 + 200) / 2));
        const rowMax = Math.min(199, Math.floor((rz + rr + 0.45 + 200) / 2));

        for (let r = rowMin; r <= rowMax; r++) {
          const cz = r * 2 - 200 + 1.0;
          const dz = cz - rz;
          const dzSq = dz * dz;
          for (let c = colMin; c <= colMax; c++) {
            const cx = c * 2 - 200 + 1.0;
            const dx = cx - rx;
            if (dx * dx + dzSq < (rr + 0.45) * (rr + 0.45)) {
              grid[r * 200 + c] = 0;
            }
          }
        }
      }
    }

    return grid;
  }

  _resolve(req, grid) {
    const vehicle = req.unit.vehicle;
    if (!vehicle || req.unit.isDead) return;

    let gx = req.x;
    let gz = req.z;
    if (this._bounds) {
      const b = this._bounds;
      if (gx < b.minX) gx = b.minX; else if (gx > b.maxX) gx = b.maxX;
      if (gz < b.minZ) gz = b.minZ; else if (gz > b.maxZ) gz = b.maxZ;
    }

    // 1) Raycast check
    if (this._isLineClear(vehicle.position.x, vehicle.position.z, gx, gz, grid)) {
      vehicle._follow.active = false;
      vehicle._arrive.target.set(gx, 0, gz);
      vehicle._arrive.active = true;

      if (req.onPath) {
        req.onPath([
          new THREE.Vector3(vehicle.position.x, 0, vehicle.position.z),
          new THREE.Vector3(gx, 0, gz)
        ]);
      }
      return;
    }

    // 2) A* search
    const startCol = Math.max(0, Math.min(199, Math.floor((vehicle.position.x + 200) / 2)));
    const startRow = Math.max(0, Math.min(199, Math.floor((vehicle.position.z + 200) / 2)));
    let endCol = Math.max(0, Math.min(199, Math.floor((gx + 200) / 2)));
    let endRow = Math.max(0, Math.min(199, Math.floor((gz + 200) / 2)));

    const gridPath = this._findGridPath(startCol, startRow, endCol, endRow, grid);
    if (gridPath && gridPath.length > 1) {
      vehicle._arrive.active = false;
      
      const path = [];
      for (const pt of gridPath) {
        path.push(new MockVector3(pt.x, 0, pt.z));
      }
      path.push(new MockVector3(gx, 0, gz));
      
      vehicle._follow.path = path;
      vehicle._follow.active = true;

      if (req.onPath) {
        req.onPath(path);
      }
    } else {
      // Fallback
      vehicle._follow.active = false;
      vehicle._arrive.target.set(gx, 0, gz);
      vehicle._arrive.active = true;

      if (req.onPath) {
        req.onPath([
          new THREE.Vector3(vehicle.position.x, 0, vehicle.position.z),
          new THREE.Vector3(gx, 0, gz)
        ]);
      }
    }
  }

  _isLineClear(x1, z1, x2, z2, grid) {
    const c1 = Math.floor((x1 + 200) / 2);
    const r1 = Math.floor((z1 + 200) / 2);
    const c2 = Math.floor((x2 + 200) / 2);
    const r2 = Math.floor((z2 + 200) / 2);
    
    const dc = Math.abs(c2 - c1);
    const dr = Math.abs(r1 - r2);
    const sc = c1 < c2 ? 1 : -1;
    const sr = r1 < r2 ? 1 : -1;
    let err = dc - dr;
    
    let c = c1;
    let r = r1;
    
    while (true) {
      if (c < 0 || c >= 200 || r < 0 || r >= 200) return false;
      if (grid[r * 200 + c] === 0) return false;
      if (c === c2 && r === r2) break;
      const e2 = 2 * err;
      if (e2 > -dr) {
        err -= dr;
        c += sc;
      }
      if (e2 < dc) {
        err += dc;
        r += sr;
      }
    }
    return true;
  }

  _findGridPath(startCol, startRow, endCol, endRow, grid) {
    const width = 200;
    const height = 200;
    const size = width * height;
    
    const closed = this._closed;
    closed.fill(0);
    const openSet = [];
    const gScore = this._gScore;
    gScore.fill(Infinity);
    const fScore = this._fScore;
    fScore.fill(Infinity);
    const cameFrom = this._cameFrom;
    cameFrom.fill(-1);
    
    let startIdx = startRow * width + startCol;
    let endIdx = endRow * width + endCol;
    
    if (grid[startIdx] === 0) {
      let bestDist = Infinity;
      let targetCol = startCol;
      let targetRow = startRow;
      for (let dr = -10; dr <= 10; dr++) {
        for (let dc = -10; dc <= 10; dc++) {
          const nc = startCol + dc;
          const nr = startRow + dr;
          if (nc >= 0 && nc < width && nr >= 0 && nr < height) {
            const nidx = nr * width + nc;
            if (grid[nidx] === 1) {
              const d = Math.hypot(nc - startCol, nr - startRow);
              if (d < bestDist) {
                bestDist = d;
                targetCol = nc;
                targetRow = nr;
              }
            }
          }
        }
      }
      startCol = targetCol;
      startRow = targetRow;
      startIdx = startRow * width + startCol;
    }

    if (grid[endIdx] === 0) {
      let bestDist = Infinity;
      let targetCol = endCol;
      let targetRow = endRow;
      for (let dr = -10; dr <= 10; dr++) {
        for (let dc = -10; dc <= 10; dc++) {
          const nc = endCol + dc;
          const nr = endRow + dr;
          if (nc >= 0 && nc < width && nr >= 0 && nr < height) {
            const nidx = nr * width + nc;
            if (grid[nidx] === 1) {
              const d = Math.hypot(nc - endCol, nr - endRow);
              if (d < bestDist) {
                bestDist = d;
                targetCol = nc;
                targetRow = nr;
              }
            }
          }
        }
      }
      endCol = targetCol;
      endRow = targetRow;
      endIdx = endRow * width + endCol;
      if (grid[endIdx] === 0) return null;
    }
    
    gScore[startIdx] = 0;
    fScore[startIdx] = heuristic(startCol, startRow, endCol, endRow);
    openSet.push(startIdx);
    
    function heuristic(c1, r1, c2, r2) {
      const dc = Math.abs(c1 - c2);
      const dr = Math.abs(r1 - r2);
      return Math.min(dc, dr) * 1.414 + Math.abs(dc - dr);
    }
    
    const dirs = [
      { dc: 1, dr: 0, cost: 1 },
      { dc: -1, dr: 0, cost: 1 },
      { dc: 0, dr: 1, cost: 1 },
      { dc: 0, dr: -1, cost: 1 },
      { dc: 1, dr: 1, cost: 1.414 },
      { dc: -1, dr: 1, cost: 1.414 },
      { dc: 1, dr: -1, cost: 1.414 },
      { dc: -1, dr: -1, cost: 1.414 },
    ];
    
    let attempts = 0;
    const maxAttempts = 1500;
    
    while (openSet.length > 0 && attempts++ < maxAttempts) {
      let bestIdx = 0;
      for (let i = 1; i < openSet.length; i++) {
        if (fScore[openSet[i]] < fScore[openSet[bestIdx]]) {
          bestIdx = i;
        }
      }
      const current = openSet[bestIdx];
      if (current === endIdx) {
        const path = [];
        let curr = current;
        while (curr !== -1) {
          const c = curr % width;
          const r = Math.floor(curr / width);
          path.push({ x: c * 2 - 200 + 1.0, z: r * 2 - 200 + 1.0 });
          curr = cameFrom[curr];
        }
        path.reverse();
        return path;
      }
      
      openSet.splice(bestIdx, 1);
      closed[current] = 1;
      
      const currC = current % width;
      const currR = Math.floor(current / width);
      
      for (const dir of dirs) {
        const neighborC = currC + dir.dc;
        const neighborR = currR + dir.dr;
        if (neighborC < 0 || neighborC >= width || neighborR < 0 || neighborR >= height) continue;
        const neighborIdx = neighborR * width + neighborC;
        
        if (closed[neighborIdx] === 1) continue;
        if (grid[neighborIdx] === 0) continue;
        
        if (dir.dc !== 0 && dir.dr !== 0) {
          const side1 = currR * width + neighborC;
          const side2 = neighborR * width + currC;
          if (grid[side1] === 0 || grid[side2] === 0) continue;
        }
        
        const tentativeG = gScore[current] + dir.cost;
        if (tentativeG < gScore[neighborIdx]) {
          cameFrom[neighborIdx] = current;
          gScore[neighborIdx] = tentativeG;
          fScore[neighborIdx] = tentativeG + heuristic(neighborC, neighborR, endCol, endRow);
          if (!openSet.includes(neighborIdx)) {
            openSet.push(neighborIdx);
          }
        }
      }
    }
    return null;
  }

  dispose() {
    this._vehicles.clear();
    this._vehiclesList.length = 0;
    this._queue.clear();
    this._bounds = null;
    this._nexus = null;
  }
}
