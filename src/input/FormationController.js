/**
 * FormationController — group-movement formation layouts (PHASE5_PROMPT.md
 * §3.10). Given the selected units, a destination, and a formation id, it
 * produces one world-space target per unit, oriented to the travel direction,
 * with slots assigned to units by nearest-match so paths don't cross.
 *
 * Pure geometry (no engine/THREE dependency); CommandSystem calls `layout()`
 * at click rate (not a hot loop), so the small per-call arrays are fine.
 */

/** Selectable formation shapes (also the UI button ids). */
export const FORMATIONS = {
  LOOSE: 'LOOSE',     // compact hex cluster (the classic default)
  BOX: 'BOX',         // filled grid
  LINE: 'LINE',       // one rank, perpendicular to travel
  COLUMN: 'COLUMN',   // single file, along travel
  WEDGE: 'WEDGE',     // arrowhead
};

/**
 * Hex-ring offset for index i (slot 0 at center, ring r holds 6·r slots).
 * @returns {{x:number, z:number}} local offset (x = right, z = forward)
 */
function hexOffset(index, spacing) {
  if (index === 0) return { x: 0, z: 0 };
  let ring = 1;
  let firstInRing = 1;
  while (index >= firstInRing + 6 * ring) {
    firstInRing += 6 * ring;
    ring += 1;
  }
  const slot = index - firstInRing;
  const slotsOnRing = 6 * ring;
  const angle = (slot / slotsOnRing) * Math.PI * 2 + ring * 0.5;
  const radius = ring * spacing;
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

/**
 * Local (pre-rotation) slot offsets for `n` units in a formation.
 * Convention: +x = formation right, +z = forward (toward the destination).
 * @returns {Array<{x:number, z:number}>}
 */
function slotOffsets(n, formationId, spacing) {
  const out = [];
  switch (formationId) {
    case FORMATIONS.LINE:
      for (let i = 0; i < n; i++) out.push({ x: (i - (n - 1) / 2) * spacing, z: 0 });
      break;
    case FORMATIONS.COLUMN:
      for (let i = 0; i < n; i++) out.push({ x: 0, z: (i - (n - 1) / 2) * spacing });
      break;
    case FORMATIONS.BOX: {
      const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
      const rows = Math.ceil(n / cols);
      for (let i = 0; i < n; i++) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        out.push({ x: (c - (cols - 1) / 2) * spacing, z: (r - (rows - 1) / 2) * spacing });
      }
      break;
    }
    case FORMATIONS.WEDGE: {
      // Point at the front (z=0), ranks fanning backward and outward.
      out.push({ x: 0, z: 0 });
      let placed = 1;
      let row = 1;
      while (placed < n) {
        for (let s = -row; s <= row && placed < n; s += 2) {
          out.push({ x: s * spacing * 0.6, z: -row * spacing });
          placed += 1;
        }
        row += 1;
      }
      break;
    }
    case FORMATIONS.LOOSE:
    default:
      for (let i = 0; i < n; i++) out.push(hexOffset(i, spacing));
      break;
  }
  return out;
}

/**
 * Compute a world-space move target for each selected unit.
 * @param {Array<{position:{x:number,z:number}}>} units
 * @param {{x:number, z:number}} center - Destination (click point).
 * @param {string} formationId - One of FORMATIONS.
 * @param {number} spacing - Slot spacing in world units.
 * @returns {Array<{x:number, z:number}>} target per unit (aligned to `units`).
 */
export function layout(units, center, formationId, spacing) {
  const n = units.length;
  if (n === 0) return [];

  // Facing = from the group's current centroid toward the destination.
  let cx = 0;
  let cz = 0;
  for (const u of units) { cx += u.position.x; cz += u.position.z; }
  cx /= n; cz /= n;
  let fx = center.x - cx;
  let fz = center.z - cz;
  const flen = Math.hypot(fx, fz);
  if (flen < 1e-3) { fx = 0; fz = 1; } else { fx /= flen; fz /= flen; }
  const rx = fz;   // right = forward rotated -90°
  const rz = -fx;

  // Rotate local slots into world space.
  const local = slotOffsets(n, formationId, spacing);
  const slots = local.map((o) => ({
    x: center.x + rx * o.x + fx * o.z,
    z: center.z + rz * o.x + fz * o.z,
  }));

  // Greedy nearest-slot assignment (O(n²), fine at selection sizes) so units
  // walk to the closest slot and paths don't cross.
  const result = new Array(n);
  const used = new Array(slots.length).fill(false);
  for (let ui = 0; ui < n; ui++) {
    const up = units[ui].position;
    let best = -1;
    let bestSq = Infinity;
    for (let si = 0; si < slots.length; si++) {
      if (used[si]) continue;
      const dx = slots[si].x - up.x;
      const dz = slots[si].z - up.z;
      const d = dx * dx + dz * dz;
      if (d < bestSq) { bestSq = d; best = si; }
    }
    used[best] = true;
    result[ui] = slots[best];
  }
  return result;
}
