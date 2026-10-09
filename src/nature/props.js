import * as THREE from 'three';
import { setCaster } from '../quality.js';
import { heightAt } from '../terrain.js';
import { pathMask, PATH_PTS } from './features.js';
import { prep, merge, blob, cyl } from './geo.js';
import { mulberry, hash2 } from '../noise.js';
import { modelGeo, modelsReady } from './models.js';

/** Rounded box with smooth normals (bevelled edges). */
function rbox(w, h, d, rad, color, px = 0, py = 0, pz = 0, ry = 0) {
  const g0 = new THREE.BoxGeometry(w, h, d, 4, 4, 4), p = g0.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
  const ix = Math.max(0, w / 2 - rad), iy = Math.max(0, h / 2 - rad), iz = Math.max(0, d / 2 - rad);
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)); c.set(Math.max(-ix, Math.min(ix, v.x)), Math.max(-iy, Math.min(iy, v.y)), Math.max(-iz, Math.min(iz, v.z)));
    v.sub(c); if (v.lengthSq() > 1e-8) v.normalize().multiplyScalar(rad); p.setXYZ(i, c.x + v.x, c.y + v.y, c.z + v.z);
  }
  g0.computeVertexNormals();
  const g = prep(g0, color, 0, [0.95, 1.05], 0.05); g.rotateY(ry); g.translate(px, py, pz); return g;
}
/** Vertex-colour pass: AO darkening toward the ground, and mottled variation. */
function bake(g, k = 0.6) {
  const pos = g.attributes.position, col = g.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), ao = 0.7 + 0.3 * Math.min(1, Math.max(0, y / 0.35));
    const v = 0.93 + 0.14 * hash2(Math.round(pos.getX(i) * 9), Math.round(pos.getZ(i) * 9), Math.round(y * 9));
    col.setXYZ(i, col.getX(i) * ao * v, col.getY(i) * ao * v, col.getZ(i) * ao * v * 0.98);
  }
  return g;
}
const mossTuft = (x, y, z, s = 1) => blob(x, y, z, 0.13 * s, '#6c9a3c', { sy: 0.55, detail: 1, lump: 0.25, aw: 0, warm: false, shade: [0.9, 1.15] });

/** Hand-placed vignettes: fallen log, stump circle, flower arch, picnic spot. One merged mesh. */
export function buildProps(scene) {
  const r = mulberry(909), L = [], taken = [];
  const place = (g, x, z, rot, lift = 0) => { bake(g); g.scale(1.4, 1.4, 1.4); g.rotateY(rot); g.translate(x, heightAt(x, z) + lift, z); L.push(g); };
  const ok = (x, z) => pathMask(x, z) < 0.04;

  // fallen mossy log with mushrooms
  { const x = -17, z = -9;
    const LG = false && modelGeo('log_large', { w: 3.4, colors: { woodBark: '#7f5632', woodInner: '#e6c48e' }, shade: [0.85, 1.12], smooth: 0.3 }); if (LG) LG.translate(1.7, 0, 0);
    const parts = [LG || cyl(0.3, 0.34, 3.4, 9, '#6f4a2b', { tiltZ: Math.PI / 2, shade: [0.8, 1.12], x: 1.7, y: 0.32 }),
      mossTuft(0.8, 0.62, -0.1, 1.3), mossTuft(1.2, 0.6, 0.15, 1), mossTuft(2.3, 0.6, 0, 1.2), mossTuft(0.1, 0.1, 0.4, 1.3), mossTuft(1.9, 0.08, -0.4, 1.4), mossTuft(3.1, 0.1, 0.35, 1.1),
      blob(0.2, 0.6, 0, 0.3, '#6f9a45', { sy: 0.4, detail: 1, lump: 0.2, aw: 0, warm: false, shade: [1, 1.1] }),
      blob(1.6, 0.62, 0.05, 0.26, '#7fa84c', { sy: 0.4, detail: 1, lump: 0.2, aw: 0, warm: false, shade: [1, 1.1] }),
      blob(2.2, 0.35, 0.3, 0.1, '#e0453c', { detail: 0, sy: 0.7, lump: 0, aw: 0, warm: false, shade: [1, 1] }),
      blob(2.4, 0.33, 0.2, 0.08, '#e0453c', { detail: 0, sy: 0.7, lump: 0, aw: 0, warm: false, shade: [1, 1] }),
      ...(LG ? [] : [blob(3.45, 0.32, 0, 0.3, '#e2b97a', { sy: 0.1, detail: 0, lump: 0, aw: 0, warm: false, shade: [1, 1] })])];
    const g = merge(parts); g.rotateZ(0); place(g, x, z, 0.5, -0.02); taken.push([x, z, 3.0]); }

  // stump circle in the north clearing
  { const cx = -4, cz = -28;
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2, x = cx + Math.cos(a) * 2.3, z = cz + Math.sin(a) * 2.3;
      if (!ok(x, z)) continue;
      const h = 0.4 + r() * 0.35;
      const SG = modelsReady() && modelGeo(i % 3 === 2 ? 'stump_roundDetailed' : 'stump_round', { h, w: 0.85, colors: { woodBark: '#9a6a3e', woodInner: '#ecc98f' }, shade: [0.88, 1.12], smooth: 0.3 });
      const g = merge([SG || cyl(0.3, 0.38, h, 9, '#9a6a3e', { shade: [0.85, 1.1] }), ...(SG ? [] : [cyl(0.3, 0.3, 0.03, 9, '#e2bf8a', { y: h, shade: [1, 1] })]),
        mossTuft(0.34, 0.05, 0.1, 1.1), mossTuft(-0.3, 0.05, -0.2, 0.9), blob(0.12, h + 0.04, 0.1, 0.1, '#6f9a45', { sy: 0.4, detail: 0, lump: 0.1, aw: 0, warm: false, shade: [1, 1] })]);
      place(g, x, z, r() * 6, -0.03);
    }
    taken.push([cx, cz, 4.0]); }

  // flower arch over the east path
  { const pts = PATH_PTS[1], i = Math.min(pts.length - 3, 13), p = pts[i], q = pts[i + 2];
    const ang = Math.atan2(q.z - p.z, q.x - p.x), W = 1.7, parts = [];
    const cols = ['#ff7eb6', '#ffd23f', '#ffffff', '#b28dff'];
    parts.push(cyl(0.07, 0.09, 1.9, 6, '#a9743f', { x: 0, z: -W }), cyl(0.07, 0.09, 1.9, 6, '#a9743f', { x: 0, z: W }));
    for (let k = 0; k <= 10; k++) {
      const t = k / 10 * Math.PI, z = -Math.cos(t) * W, y = 1.9 + Math.sin(t) * 0.8;
      parts.push(blob(0, y, z, 0.17 + r() * 0.05, k % 3 === 1 ? '#4f9f3f' : cols[k % 4], { sy: 0.8, detail: 0, lump: 0.25, aw: 0, warm: false, shade: [0.95, 1.1] }));
      if (k < 10) parts.push(blob((r() - 0.5) * 0.15, y - 0.1, z + 0.12, 0.12, cols[(k + 2) % 4], { sy: 0.8, detail: 0, lump: 0.2, aw: 0, warm: false, shade: [1, 1.1] }));
    }
    for (const s of [-W, W]) for (let k = 0; k < 4; k++) parts.push(blob(0.05, 0.4 + k * 0.45, s, 0.14, cols[(k + (s > 0 ? 1 : 0)) % 4], { sy: 0.8, detail: 0, lump: 0.2, aw: 0, warm: false, shade: [1, 1.1] }));
    const g = merge(parts); place(g, p.x, p.z, -ang + Math.PI / 2 * 0 + Math.PI / 2 * 0, 0); taken.push([p.x, p.z, 2.5]); }

  // picnic spot in the pond meadow
  { let x = -23, z = 27; for (let n = 0; n < 20 && !ok(x, z); n++) { x += 1.5; }
    const box = (w, h, d, c, px, py, pz, ry = 0) => rbox(w, h, d, Math.min(0.04, h * 0.45), c, px, py, pz, ry);
    const parts = [box(2.3, 0.05, 1.8, '#f08a96', 0, 0.03, 0), box(2.3, 0.055, 0.35, '#fff1f1', 0, 0.035, -0.4), box(2.3, 0.055, 0.35, '#fff1f1', 0, 0.035, 0.4),
      rbox(0.45, 0.22, 0.45, 0.09, '#8ec7ff', -0.7, 0.16, 0.5, 0.4), rbox(0.45, 0.22, 0.45, 0.09, '#ffd96a', 0.8, 0.16, 0.55, -0.3), mossTuft(1.25, 0.05, 0.9, 1.2), mossTuft(-1.3, 0.05, -0.8, 1.3),
      cyl(0.28, 0.24, 0.3, 10, '#b58349', { x: 0.1, y: 0.05, z: -0.35, shade: [0.9, 1.1] }), box(0.6, 0.04, 0.5, '#fffaf0', 0.1, 0.36, -0.35)];
    for (let k = 0; k < 4; k++) parts.push(blob(-0.4 + k * 0.25, 0.1, 0.05 + (k % 2) * 0.1, 0.09, k % 2 ? '#e8465f' : '#9ad85a', { detail: 0, sy: 1, lump: 0, aw: 0, warm: false, shade: [1, 1] }));
    const g = merge(parts); place(g, x, z, 0.4, 0); taken.push([x, z, 3.6]);
    if (modelsReady()) { // low picket backdrop behind the blanket (hand-made CC0 fence model, each piece follows the ground)
      const R0 = 4.3, N = 7;
      for (let k = 0; k < N; k++) {
        const a = Math.PI * (0.05 + 0.9 * k / (N - 1)) + 0.4 + Math.PI * 0.5, fx = x + Math.cos(a) * R0, fz = z + Math.sin(a) * R0;
        if (!ok(fx, fz)) continue;
        const f = modelGeo(k === 3 ? 'fence_gate' : 'fence_simple', { w: 1.75, colors: { wood: '#d9a066', woodDark: '#b9824c' }, shade: [0.85, 1.15], smooth: 0.15 });
        if (!f) break; f.rotateY(-a - Math.PI / 2); bake(f); f.translate(fx, heightAt(fx, fz) - 0.04, fz); L.push(f);
      }
      taken.push([x, z, 5]);
    } }

  const m = new THREE.Mesh(merge(L), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, emissive: '#2a3a18', emissiveIntensity: 0.12 }));
  setCaster(m, 3, true); m.receiveShadow = true; m.frustumCulled = false;
  scene.add(m);
  return taken;
}
