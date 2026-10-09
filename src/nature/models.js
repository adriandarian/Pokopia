// Hand-made CC0 glTF models (Kenney Nature Kit) converted into the game's vertex-coloured, wind-ready geometry.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { registerPreload, getGltf, hasModel } from '../assets/loader.js';
import { hash2 } from '../noise.js';

const FILES = ['rock_largeA', 'rock_largeC', 'rock_largeE', 'rock_smallA', 'rock_smallB', 'rock_smallC', 'rock_tallA', 'rock_tallC', 'stone_largeA', 'stone_largeC', 'stone_tallA',
  'stump_round', 'stump_old', 'stump_roundDetailed', 'log', 'log_large', 'log_stack', 'mushroom_redGroup', 'mushroom_tanGroup', 'mushroom_red', 'mushroom_tan',
  'tree_palmBend', 'tree_palmTall', 'tree_pineRoundA', 'tree_pineTallA', 'tree_fat', 'tree_oak', 'tree_default', 'plant_bushDetailed', 'plant_bushLarge', 'plant_bushSmall',
  'fence_simple', 'fence_planks', 'fence_gate'];
for (const f of FILES) registerPreload('n_' + f, `/assets/nature/${f}.glb`);

// material name -> colour (game palette: saturated, soft toon)
const PAL = {
  dirt: '#a99d8e', stone: '#bdb3a5', grass: '#78b84e', woodBark: '#a9743f', woodBarkDark: '#8a5c33', woodInner: '#ecc98f', wood: '#c08a50', woodDark: '#8f6338',
  leafsGreen: '#5fbf45', leafsDark: '#3a9a50', leafsFall: '#e0953a', colorRed: '#e0453c', colorTan: '#e8c48a', _defaultMat: '#f6ecd8',
};
const _c = new THREE.Color();

/**
 * Build one merged BufferGeometry from a loaded model.
 *  opts.h / opts.w: target height / max horizontal extent (metres) — scale so it fits; base is moved to y=0 and centred on x/z.
 *  opts.colors: per-material colour overrides. opts.aw: wind weight mode ('none' | 'canopy' | 'all'), canopy = leaf materials only, rising with height.
 *  opts.smooth: blend flat normals toward a radial/up normal for a softer toon read (0..1).
 */
export function modelGeo(name, { h, w, scale = 1, colors = {}, aw = 'none', smooth = 0.0, shade = [0.82, 1.08], moss = 0 } = {}) {
  const g = getGltf('n_' + name); if (!g) return null;
  g.scene.updateMatrixWorld(true);
  const list = [];
  g.scene.traverse(o => {
    if (!o.isMesh) return;
    let geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (geo.index) geo = geo.toNonIndexed();
    const mn = o.material.name || '_defaultMat';
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal'].includes(k)) geo.deleteAttribute(k);
    geo.userData = { mat: mn }; list.push(geo);
  });
  const bb = new THREE.Box3(); for (const geo of list) { geo.computeBoundingBox(); bb.union(geo.boundingBox); }
  const size = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3());
  let s = scale; if (h) s = h / size.y; if (w) s = Math.min(h ? s : 1e9, w / Math.max(size.x, size.z));
  if (!isFinite(s)) s = scale;
  const out = [];
  for (const geo of list) {
    geo.translate(-ctr.x, -bb.min.y, -ctr.z); geo.scale(s, s, s);
    const mn = geo.userData.mat, base = _c.set(colors[mn] || PAL[mn] || '#cccccc').clone();
    const pos = geo.attributes.position, nor = geo.attributes.normal, n = pos.count, col = new Float32Array(n * 3), awA = new Float32Array(n);
    const H = size.y * s, leaf = /leafs/.test(mn);
    for (let i = 0; i < n; i++) {
      const y = pos.getY(i), t = Math.min(1, Math.max(0, y / (H || 1)));
      let k = shade[0] + (shade[1] - shade[0]) * t;
      k *= 0.96 + 0.08 * hash2(Math.round(pos.getX(i) * 40), Math.round(y * 40), Math.round(pos.getZ(i) * 40));
      let r = base.r, gg = base.g, b = base.b;
      if (moss && /dirt|stone/.test(mn)) { const m = THREE.MathUtils.smoothstep(nor.getY(i), 0.45, 0.9) * moss; const mc = _c.set('#7fb552'); r += (mc.r - r) * m; gg += (mc.g - gg) * m; b += (mc.b - b) * m; }
      col[i * 3] = r * k; col[i * 3 + 1] = gg * k; col[i * 3 + 2] = b * k;
      awA[i] = aw === 'all' ? 1 : aw === 'canopy' && leaf ? 0.3 + 0.7 * t : 0;
      if (smooth > 0) { // soften: bias normals up (leaf) or toward radial from the model axis
        const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i), rr = Math.hypot(pos.getX(i), pos.getZ(i)) || 1;
        const tx = pos.getX(i) / rr * 0.8, tz = pos.getZ(i) / rr * 0.8, ty = leaf ? 0.7 : 0.3;
        const m = smooth, x = nx * (1 - m) + tx * m, yy = ny * (1 - m) + ty * m, z = nz * (1 - m) + tz * m, l = Math.hypot(x, yy, z) || 1;
        nor.setXYZ(i, x / l, yy / l, z / l);
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aw', new THREE.BufferAttribute(awA, 1));
    out.push(geo);
  }
  const m = mergeGeometries(out, false); m.computeBoundingSphere(); m.computeBoundingBox();
  return m;
}
export const modelsReady = () => hasModel('n_rock_largeA');
