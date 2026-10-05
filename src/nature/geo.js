import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash2 } from '../noise.js';

const _c = new THREE.Color();
/** Normalise geometry: non-indexed, position/normal/color/aw only. */
export function prep(g, color, aw = 0, shade = [0.75, 1.05], jitter = 0.06) {
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  g.computeBoundingBox();
  const { min, max } = g.boundingBox;
  const base = _c.set(color);
  for (let i = 0; i < n; i++) {
    const y = g.attributes.position.getY(i);
    const t = max.y > min.y ? (y - min.y) / (max.y - min.y) : 0.5;
    const s = shade[0] + (shade[1] - shade[0]) * t;
    const j = 1 + (hash2(Math.round(g.attributes.position.getX(i) * 50), Math.round(g.attributes.position.getZ(i) * 50), Math.round(y * 50)) - 0.5) * jitter * 2;
    col[i * 3] = base.r * s * j; col[i * 3 + 1] = base.g * s * j; col[i * 3 + 2] = base.b * s * j;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aw', new THREE.BufferAttribute(new Float32Array(n).fill(aw), 1));
  return g;
}
export const merge = (list) => { const g = mergeGeometries(list, false); g.computeBoundingSphere(); return g; };

/** Lumpy soft blob with outward (sphere) normals so canopies read as puffy clouds. */
export function blob(x, y, z, r, color, { sy = 0.85, detail = 2, lump = 0.14, aw = 1, shade = [0.8, 1.12], seed = 1 } = {}) {
  let g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    const l = Math.hypot(vx, vy, vz) || 1;
    const nz = hash2(Math.round(vx / l * 6 + 20), Math.round(vy / l * 6 + 20), Math.round(vz / l * 6 + 20) + seed * 7);
    const k = 1 + (nz - 0.5) * lump * 2;
    p.setXYZ(i, vx * k, vy * k * sy, vz * k);
  }
  g = prep(g, color, aw, shade, 0.05);
  const pos = g.attributes.position, nor = g.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i) / sy, pos.getZ(i)).normalize();
    nor.setXYZ(i, v.x, v.y * 0.8 + 0.2, v.z);
  }
  g.translate(x, y, z);
  return g;
}
export function cyl(rt, rb, h, seg, color, { x = 0, y = 0, z = 0, aw = 0, shade = [0.8, 1.05], tiltX = 0, tiltZ = 0 } = {}) {
  let g = new THREE.CylinderGeometry(rt, rb, h, seg, 1);
  g.translate(0, h / 2, 0);
  g.rotateX(tiltX); g.rotateZ(tiltZ);
  g = prep(g, color, aw, shade, 0.03);
  g.translate(x, y, z);
  return g;
}
export function cone(r, h, seg, color, { y = 0, aw = 1, shade = [0.6, 1.1] } = {}) {
  let g = new THREE.ConeGeometry(r, h, seg, 3, false);
  g.translate(0, h / 2 + y, 0);
  g = prep(g, color, aw, shade, 0.04);
  return g;
}
