// Shared world features (no dependency on terrain.js to avoid cycles).
import * as THREE from 'three';
import { fbm } from '../noise.js';

export const POND = { x: -30, z: 14, r: 6.5 };
const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Island design: open meadows, dense groves, landmark trees, a hilltop viewpoint. */
export const SUMMIT = { x: 0, z: 0, h: 12.4 };
export const MEADOWS = [
  { x: -29, z: 16, r: 19 },   // pond meadow
  { x: 27, z: -6, r: 13 },    // east meadow by the beach path
  { x: -4, z: -27, r: 11 },   // north clearing
  { x: -8, z: 36, r: 15 },    // south flower field
  { x: 34, z: 30, r: 11 },    // south-east glade
];
export const GROVES = [
  { x: -24, z: -22, r: 17 }, { x: 20, z: -30, r: 14 }, { x: 40, z: 14, r: 12 },
  { x: -46, z: -6, r: 11 }, { x: 14, z: 14, r: 11 }, { x: -10, z: 18, r: 9 }, { x: 12, z: -14, r: 8 },
];
export const LANDMARKS = [
  { kind: 'oak', x: 24, z: -10, s: 2.1 }, { kind: 'blossom', x: -4, z: 35, s: 1.9 },
  { kind: 'pine', x: -9, z: -25, s: 2.1 }, { kind: 'oak', x: -41, z: 21, s: 1.9 },
  { kind: 'blossom', x: -6, z: -3, s: 1.5 }, { kind: 'oak', x: 36, z: 31, s: 1.8 },
];
const wobble = (x, z) => (fbm(x * 0.07 + 40, z * 0.07 - 12, 2, 17) - 0.5) * 7;
export function meadowMask(x, z) {
  let m = 0;
  for (const c of MEADOWS) m = Math.max(m, sst(c.r, c.r * 0.55, Math.hypot(x - c.x, z - c.z) + wobble(x, z)));
  return Math.max(m, sst(11, 6, Math.hypot(x - SUMMIT.x, z - SUMMIT.z)));
}
export function groveMask(x, z) {
  let m = 0;
  for (const c of GROVES) m = Math.max(m, sst(c.r, c.r * 0.45, Math.hypot(x - c.x, z - c.z) + wobble(x + 9, z - 4)));
  return m;
}

// Path polylines (control points) -> sampled catmull curves
const ROUTES = [
  [[2, 2], [-4, 8], [-12, 11], [-21, 13], [-25, 14]],           // hilltop -> pond
  [[2, 2], [10, 0], [20, -5], [31, -3], [42, 1], [50, 0]],      // hilltop -> east beach
  [[2, 2], [4, -9], [1, -19], [-4, -28], [-6, -36]],            // hilltop -> north
];
/** Cheap distance to the path control polylines (used by heightAt to keep paths off cliffs). */
export function routeDist(x, z) {
  let best = 1e9;
  for (const r of ROUTES) for (let i = 0; i < r.length - 1; i++) {
    const ax = r[i][0], az = r[i][1], bx = r[i + 1][0] - ax, bz = r[i + 1][1] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz)));
    const dx = ax + bx * t - x, dz = az + bz * t - z, d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
export const PATH_PTS = [];
for (const r of ROUTES) {
  const c = new THREE.CatmullRomCurve3(r.map(p => new THREE.Vector3(p[0], 0, p[1])), false, 'catmullrom', 0.5);
  PATH_PTS.push(c.getSpacedPoints(Math.round(c.getLength() / 1.2)));
}
const HALF_W = 1.35;
/** 0..1 mask: 1 on path centre, 0 outside. */
export function pathMask(x, z) {
  let best = 1e9;
  const wob = (fbm(x * 0.2, z * 0.2, 2, 5) - 0.5) * 0.9;
  for (const pts of PATH_PTS) {
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i].x - x, dz = pts[i].z - z;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
  }
  const d = Math.sqrt(best) + wob;
  return THREE.MathUtils.clamp(1 - d / (HALF_W * 1.6), 0, 1);
}
export const onPath = (x, z, pad = 0) => pathMask(x, z) > 0.28 - pad;
