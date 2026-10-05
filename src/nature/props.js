import * as THREE from 'three';
import { heightAt } from '../terrain.js';
import { pathMask, PATH_PTS } from './features.js';
import { prep, merge, blob, cyl } from './geo.js';
import { mulberry } from '../noise.js';

/** Hand-placed vignettes: fallen log, stump circle, flower arch, picnic spot. One merged mesh. */
export function buildProps(scene) {
  const r = mulberry(909), L = [], taken = [];
  const place = (g, x, z, rot, lift = 0) => { g.rotateY(rot); g.translate(x, heightAt(x, z) + lift, z); L.push(g); };
  const ok = (x, z) => pathMask(x, z) < 0.04;

  // fallen mossy log with mushrooms
  { const x = -17, z = -9;
    const parts = [cyl(0.3, 0.34, 3.4, 9, '#8a5c36', { tiltZ: Math.PI / 2, shade: [0.85, 1.1], x: 1.7, y: 0.32 }),
      blob(0.2, 0.6, 0, 0.3, '#6f9a45', { sy: 0.4, detail: 1, lump: 0.2, aw: 0, warm: false, shade: [1, 1.1] }),
      blob(1.6, 0.62, 0.05, 0.26, '#7fa84c', { sy: 0.4, detail: 1, lump: 0.2, aw: 0, warm: false, shade: [1, 1.1] }),
      blob(2.2, 0.35, 0.3, 0.1, '#e0453c', { detail: 0, sy: 0.7, lump: 0, aw: 0, warm: false, shade: [1, 1] }),
      blob(2.4, 0.33, 0.2, 0.08, '#e0453c', { detail: 0, sy: 0.7, lump: 0, aw: 0, warm: false, shade: [1, 1] }),
      blob(3.45, 0.32, 0, 0.3, '#e2b97a', { sy: 0.1, detail: 0, lump: 0, aw: 0, warm: false, shade: [1, 1] })];
    const g = merge(parts); g.rotateZ(0); place(g, x, z, 0.5, -0.02); taken.push([x, z, 2.2]); }

  // stump circle in the north clearing
  { const cx = -4, cz = -28;
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2, x = cx + Math.cos(a) * 2.3, z = cz + Math.sin(a) * 2.3;
      if (!ok(x, z)) continue;
      const h = 0.4 + r() * 0.35;
      const g = merge([cyl(0.3, 0.38, h, 9, '#9a6a3e', { shade: [0.85, 1.1] }), cyl(0.3, 0.3, 0.03, 9, '#e2bf8a', { y: h, shade: [1, 1] }),
        blob(0.12, h + 0.04, 0.1, 0.1, '#6f9a45', { sy: 0.4, detail: 0, lump: 0.1, aw: 0, warm: false, shade: [1, 1] })]);
      place(g, x, z, r() * 6, -0.03);
    }
    taken.push([cx, cz, 3.2]); }

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
    const box = (w, h, d, c, px, py, pz, ry = 0) => { const g = prep(new THREE.BoxGeometry(w, h, d), c, 0, [1, 1], 0.02); g.rotateY(ry); g.translate(px, py, pz); return g; };
    const parts = [box(2.3, 0.05, 1.8, '#f08a96', 0, 0.03, 0), box(2.3, 0.055, 0.35, '#fff1f1', 0, 0.035, -0.4), box(2.3, 0.055, 0.35, '#fff1f1', 0, 0.035, 0.4),
      box(0.45, 0.22, 0.45, '#8ec7ff', -0.7, 0.16, 0.5, 0.4), box(0.45, 0.22, 0.45, '#ffd96a', 0.8, 0.16, 0.55, -0.3),
      cyl(0.28, 0.24, 0.3, 10, '#b58349', { x: 0.1, y: 0.05, z: -0.35, shade: [0.9, 1.1] }), box(0.6, 0.04, 0.5, '#fffaf0', 0.1, 0.36, -0.35)];
    for (let k = 0; k < 4; k++) parts.push(blob(-0.4 + k * 0.25, 0.1, 0.05 + (k % 2) * 0.1, 0.09, k % 2 ? '#e8465f' : '#9ad85a', { detail: 0, sy: 1, lump: 0, aw: 0, warm: false, shade: [1, 1] }));
    const g = merge(parts); place(g, x, z, 0.4, 0); taken.push([x, z, 2.6]); }

  const m = new THREE.Mesh(merge(L), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, emissive: '#2a3a18', emissiveIntensity: 0.25 }));
  m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
  scene.add(m);
  return taken;
}
