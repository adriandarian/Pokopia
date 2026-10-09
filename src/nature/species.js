import * as THREE from 'three';
import { prep, merge, blob, cyl, cone } from './geo.js';
import { mulberry } from '../noise.js';

const BARK = '#a9743f', BARK2 = '#b9814a';

export function roundTree(leaf = ['#5fbf45', '#7bd556', '#4aa83c'], seed = 1) {
  const r = mulberry(seed * 31 + 7), L = [];
  L.push(cyl(0.2, 0.42, 1.5, 7, BARK));
  L.push(cyl(0.12, 0.2, 1.2, 6, BARK2, { y: 1.3, tiltZ: 0.18 }));
  L.push(cyl(0.09, 0.14, 0.9, 6, BARK2, { y: 1.1, x: 0.05, tiltZ: -0.7 }));
  const cs = [[0, 3.3, 0, 1.55], [0.95, 2.9, 0.3, 1.1], [-0.9, 2.95, -0.2, 1.15], [0.1, 4.1, 0.1, 1.05], [-0.6, 3.8, 0.7, 0.85]];
  cs.forEach((c, i) => L.push(blob(c[0], c[1], c[2], c[3], leaf[i % leaf.length], { seed: i + seed, sy: 0.82, detail: 1, lump: 0.17 })));
  return merge(L);
}
export function pineTree(seed = 1) {
  const L = [];
  L.push(cyl(0.14, 0.34, 1.6, 7, '#6e4a2c'));
  const cols = ['#2f8a4a', '#379a50', '#3fa957', '#46b45e'];
  let y = 1.0, rad = 1.55;
  for (let i = 0; i < 5; i++) {
    L.push(cone(rad, 1.5, 9, cols[i % 4], { y, shade: [0.55, 1.05] }));
    y += 0.95; rad *= 0.8;
  }
  L.push(cone(0.28, 0.7, 7, '#52c068', { y: y - 0.05, shade: [0.8, 1.1] }));
  return merge(L);
}
export function palmTree(seed = 1) {
  const L = [], r = mulberry(seed * 13 + 3);
  // curved trunk of tapered segments
  const segs = 8, H = 5.2, bend = 1.1;
  let px = 0, py = 0, pz = 0;
  for (let i = 0; i < segs; i++) {
    const t = i / segs, t2 = (i + 1) / segs;
    const nx = bend * t2 * t2, ny = H * t2;
    const dx = nx - px, dy = ny - py;
    const len = Math.hypot(dx, dy), ang = Math.atan2(dx, dy);
    const g = cyl(0.17 - t2 * 0.07, 0.2 - t * 0.07, len * 1.04, 7, i % 2 ? '#a77a4d' : '#b98a58', { x: px, y: py, tiltZ: -ang, aw: 0.1 + t * 0.4, shade: [0.85, 1] });
    L.push(g); px = nx; py = ny;
  }
  // coconuts
  for (let i = 0; i < 3; i++) L.push(blob(px + Math.cos(i * 2.1) * 0.25, py - 0.2, Math.sin(i * 2.1) * 0.25, 0.17, '#5b3d22', { detail: 1, sy: 1, lump: 0.03, aw: 0.8 }));
  // fronds
  const F = 9;
  for (let i = 0; i < F; i++) {
    const a = (i / F) * Math.PI * 2 + r() * 0.3, len = 2.9 + r() * 0.7, droop = 1.0 + r() * 0.5;
    L.push(frond(px, py, a, len, droop, i % 2 ? '#4cb04a' : '#5cc455'));
  }
  return merge(L);
}
function frond(x, y, ang, len, droop, color) {
  // ribbon along a parabola, widening then tapering, folded in a V
  const N = 7, pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, w = 0.55 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)) * (1 - t * 0.35);
    const fx = t * len, fy = 0.55 * Math.sin(t * Math.PI * 0.55) * len * 0.5 - droop * t * t;
    for (const s of [-1, 1]) pos.push(fx, fy + Math.abs(s) * w * 0.25 * 0 + (s === 0 ? 0 : -0.0), s * w * 0.5);
    // center crease raised
  }
  // V fold: add centre vertices
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, w = 0.62 * Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.15)) * (1 - t * 0.3);
    const fx = t * len, fy = 0.5 * Math.sin(t * Math.PI * 0.55) * len * 0.5 - droop * t * t;
    pts.push([fx, fy - 0.12 * w, -w], [fx, fy + 0.0, 0], [fx, fy - 0.12 * w, w]);
  }
  const p = [];
  for (let i = 0; i < N; i++) {
    const a = i * 3, b = (i + 1) * 3;
    for (const [q0, q1, q2, q3] of [[a, a + 1, b + 1, b], [a + 1, a + 2, b + 2, b + 1]]) {
      for (const k of [q0, q1, q2, q0, q2, q3]) p.push(...pts[k]);
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  g.rotateY(-ang);
  g = prep(g, color, 1, [0.7, 1.15], 0.05);
  // upward-biased normals + double-sided lighting handled by material side
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3);
  g.translate(x, y, 0);
  return g;
}
export function bush(color = ['#4fb447', '#68cb52'], seed = 1) {
  const L = [];
  const cs = [[0, 0.55, 0, 0.75], [0.6, 0.4, 0.2, 0.55], [-0.55, 0.42, -0.1, 0.55], [0.1, 0.4, 0.6, 0.5], [0.05, 0.95, 0, 0.5]];
  cs.forEach((c, i) => L.push(blob(c[0], c[1], c[2], c[3], color[i % color.length], { seed: seed + i, sy: 0.85, aw: 0.6, shade: [0.65, 1.1], detail: 2 })));
  return merge(L);
}
export function berryBush(seed = 3) {
  const L = [bush(['#3f9f45', '#56b84c'], seed)];
  const r = mulberry(seed);
  for (let i = 0; i < 9; i++) {
    const a = r() * 6.28, u = r() * 0.8 + 0.1;
    L.push(blob(Math.cos(a) * 0.7 * u + 0.05, 0.3 + r() * 0.6, Math.sin(a) * 0.7 * u, 0.09, '#e8465f', { detail: 1, sy: 1, lump: 0, aw: 0.6, shade: [1, 1] }));
  }
  return merge(L);
}
export function rock(seed = 1) {
  let g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // soft, bevelled boulder: low-frequency lumps, flattened top and bottom
    const k = 0.86 + 0.2 * (Math.sin(x * 2.3 + seed) * Math.cos(z * 2.1 + seed * 2) * 0.5 + 0.5) + 0.06 * Math.sin(y * 5 + x * 3 + seed);
    p.setXYZ(i, x * k, Math.max(y, -0.35) * k * 0.7, z * k);
  }
  g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv');
  g.computeVertexNormals();
  const n = g.attributes.normal, pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  const base = new THREE.Color('#a8a097'), moss = new THREE.Color('#6f9a45'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const up = n.getY(i), y = pos.getY(i);
    c.copy(base).multiplyScalar(0.8 + 0.3 * Math.min(1, Math.max(0, up * 0.5 + 0.6)));
    c.lerp(moss, THREE.MathUtils.smoothstep(up, 0.35, 0.8) * 0.75);   // mossy cap
    c.lerp(new THREE.Color('#6a8f48'), THREE.MathUtils.smoothstep(-y, 0.0, 0.4) * 0.55); // grass skirt at the base
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aw', new THREE.BufferAttribute(new Float32Array(pos.count), 1));
  return g;
}
export function mushroom() {
  const L = [cyl(0.05, 0.07, 0.22, 6, '#f1e6d2', { shade: [0.9, 1] })];
  let cap = new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.52);
  cap.scale(1, 0.75, 1); cap.translate(0, 0.2, 0);
  L.push(prep(cap, '#e0453c', 0, [0.8, 1.1], 0.02));
  for (const [x, z] of [[0.08, 0.06], [-0.07, 0.1], [0.02, -0.12], [-0.12, -0.04]]) {
    const y = 0.2 + Math.sqrt(Math.max(0, 0.04 - x * x - z * z)) * 0.72 + 0.005;
    L.push(blob(x, y, z, 0.03, '#fff6e6', { detail: 0, sy: 0.6, lump: 0, aw: 0, shade: [1, 1] }));
  }
  return merge(L);
}
const octa = (sx, sy, sz) => { const g = new THREE.OctahedronGeometry(1, 0); g.scale(sx, sy, sz); return g; };
/** 3D flowers: daisy (radial tilted petals around a domed centre) or tulip (closed cup of petals). */
export function flower(petal, center = '#ffd23f', tulip = false) {
  const L = [cyl(0.014, 0.018, 0.34, 4, '#4f9f3f', { aw: 0.2, shade: [0.8, 1.1] })];
  const lf = octa(0.1, 0.012, 0.035); lf.rotateZ(0.5); lf.translate(0.08, 0.1, 0);
  L.push(prep(lf, '#5cb04a', 0.2, [1, 1], 0));
  if (tulip) {
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2, g = octa(0.065, 0.14, 0.05);
      g.translate(0.06, 0.13, 0); g.rotateZ(-0.12); g.rotateY(a); g.translate(0, 0.34, 0);
      L.push(prep(g, petal, 1, [0.85, 1.15], 0.03));
    }
  } else {
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2, g = octa(0.11, 0.028, 0.05);
      g.translate(0.11, 0, 0); g.rotateZ(0.45); g.rotateY(a); g.translate(0, 0.36, 0);
      L.push(prep(g, petal, 1, [0.9, 1.1], 0.03));
    }
    const cg = octa(0.06, 0.05, 0.06); cg.translate(0, 0.375, 0);
    L.push(prep(cg, center, 1, [1, 1], 0));
  }
  return merge(L);
}
export function reed() {
  const L = [];
  for (let i = 0; i < 4; i++) {
    const h = 1.1 + i * 0.25, a = i * 1.7;
    L.push(cyl(0.015, 0.03, h, 4, '#6fa84a', { x: Math.cos(a) * 0.1, z: Math.sin(a) * 0.1, tiltZ: Math.cos(a) * 0.1, tiltX: Math.sin(a) * 0.1, aw: 0.8, shade: [0.8, 1.1] }));
    if (i % 2 === 0) L.push(cyl(0.06, 0.06, 0.32, 6, '#6b4128', { x: Math.cos(a) * 0.1, z: Math.sin(a) * 0.1, y: h - 0.15, aw: 1, shade: [0.9, 1] }));
  }
  return merge(L);
}

/** Fern: arching ribbon fronds, tapered, base-dark. */
export function fern(color = '#3f9d4a') {
  const L = [], N = 4, F = 7;
  for (let f = 0; f < F; f++) {
    const a = (f / F) * Math.PI * 2 + (f % 2) * 0.2, len = 0.75 + (f % 3) * 0.12, pos = [];
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, w = 0.14 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.08)) * (1 - t * 0.4);
      pts.push([t * len, 0.55 * Math.sin(t * 2.0) * len * 0.5 + 0.05 - 0.5 * t * t * len * 0.4, w]);
    }
    for (let i = 0; i < N; i++) {
      const [x0, y0, w0] = pts[i], [x1, y1, w1] = pts[i + 1];
      pos.push(x0, y0, -w0, x0, y0, w0, x1, y1, w1, x0, y0, -w0, x1, y1, w1, x1, y1, -w1);
    }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals(); g.rotateY(a);
    g = prep(g, color, 1, [0.55, 1.15], 0.04);
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3);
    L.push(g);
  }
  return merge(L);
}
/** Tall standing stone for the hilltop circle. */
export function standingStone() {
  let g = new THREE.CylinderGeometry(0.45, 0.65, 2.2, 6, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 0.85 + 0.3 * Math.abs(Math.sin(p.getX(i) * 5 + p.getY(i) * 2)); p.setXYZ(i, p.getX(i) * k, p.getY(i) + 1.1, p.getZ(i) * k); }
  g = prep(g, '#a8a095', 0, [0.6, 1.1], 0.05); g.computeVertexNormals();
  return g;
}

/** Cherry-blossom tree: curved trunk, branch forks and a cluster of small canopy puffs with scattered petals. */
export function blossomTree(seed = 3) {
  const r = mulberry(seed * 17 + 5), L = [];
  const pinks = ['#ff9cc0', '#ffb5d1', '#f581ad', '#ffc4da'];
  L.push(cyl(0.13, 0.3, 1.3, 7, '#6b4630'));
  L.push(cyl(0.09, 0.14, 1.1, 6, '#7a5236', { y: 1.15, tiltZ: 0.35 }));
  L.push(cyl(0.07, 0.11, 1.0, 6, '#7a5236', { y: 1.1, x: -0.05, tiltZ: -0.55 }));
  L.push(cyl(0.06, 0.09, 0.8, 6, '#7a5236', { y: 1.2, tiltX: 0.5 }));
  const puffs = [[0.5, 2.5, 0, 0.7], [-0.7, 2.3, 0.1, 0.65], [0, 2.9, 0.2, 0.75], [0.1, 2.4, 0.8, 0.6], [-0.3, 2.6, -0.8, 0.6], [0.9, 2.8, -0.5, 0.55], [-1.0, 2.8, -0.5, 0.5], [0.4, 3.3, -0.2, 0.55], [-0.5, 3.2, 0.4, 0.5], [1.0, 2.3, 0.7, 0.45]];
  puffs.forEach((c, i) => L.push(blob(c[0], c[1], c[2], c[3], pinks[i % 4], { seed: i + seed, sy: 0.8, detail: 1, lump: 0.22, shade: [0.95, 1.12] })));
  // loose petal flakes clinging to the canopy
  for (let i = 0; i < 0; i++) { // flat flakes removed: they read as dark/white shards (falling petals are drawn by petals.js)
    const p = puffs[i % puffs.length], a = r() * 6.28, b = r() * 2.4 - 0.4, rr = p[3] * 0.97;
    const x = p[0] + Math.cos(a) * Math.cos(b) * rr, y = p[1] + Math.sin(b) * rr * 0.8, z = p[2] + Math.sin(a) * Math.cos(b) * rr;
    let g = new THREE.CircleGeometry(0.05 + r() * 0.03, 6); g.rotateY(-a + Math.PI / 2); g.rotateX(-b * 0.4);
    g.translate(x, y, z);
    L.push(prep(g, pinks[(i * 7) % 4], 0.9, [0.92, 1.05], 0.02));
  }
  return merge(L);
}
