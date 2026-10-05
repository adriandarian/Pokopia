// Shared world features (no dependency on terrain.js to avoid cycles).
import * as THREE from 'three';
import { fbm } from '../noise.js';

export const POND = { x: -30, z: 14, r: 6.5 };

// Path polylines (control points) -> sampled catmull curves
const ROUTES = [
  [[2, 2], [-4, 8], [-12, 11], [-21, 13], [-25, 14]],           // hilltop -> pond
  [[2, 2], [10, 0], [20, -5], [31, -3], [42, 1], [50, 0]],      // hilltop -> east beach
  [[2, 2], [4, -9], [1, -19], [-4, -28], [-6, -36]],            // hilltop -> north
];
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
