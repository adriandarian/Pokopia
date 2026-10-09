// Island decorating: cheap merged toon meshes, placement mode (snap grid, rotate, pick up/move), persistence.
import * as THREE from 'three';
import { heightAt } from '../terrain.js';
import { toon, outline, mergeColored } from '../chars/toon.js';
import { state, saveSoon, addPetals } from './state.js';
import { DECOR, DECOR_BY_ID, PLUSH_COLORS, CHARM_MS } from './content.js';
import { WARDROBE } from './data.js';
import { emit, on } from './events.js';
import { getFX, world } from '../chars/fx.js';
import { registerPreload, firstMesh, hasModel } from '../assets/loader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------- Kenney CC0 models (see public/assets/CREDITS.md) ----------
const PARTS = ['wall', 'wall-door', 'wall-window-small', 'wall-window-shutters', 'wall-doorway-square', 'roof-gable', 'roof-point', 'roof-high-point', 'chimney', 'planks', 'fence', 'hedge-large', 'lantern', 'windmill', 'stall-stool', 'pillar-wood', 'poles-horizontal', 'tree-high-round', 'rock-flat', 'fountain-round', 'road', 'bench', 'tableRound', 'rugSquare', 'signpost'];
for (const n of PARTS) registerPreload('dc_' + n, `/assets/decor/${n}.glb`);
const _g = new Map(), _c = new THREE.Color();
const srgb = THREE.SRGBColorSpace;
// recolour rules operate on sRGB HSL; return [h,s,l]
const RULES = {
  cream: (h, s, l) => (h > 0.55 && h < 0.75 && s < 0.5) ? [0.09, 0.5, Math.min(0.97, 0.7 + l * 0.3)] : warm(h, s, l),
  roofPink: (h, s, l) => (h > 0.38 && h < 0.52) ? [0.975, 0.6, Math.min(0.74, l + 0.04)] : (h > 0.96 || h < 0.02) && s > 0.4 ? [0.975, 0.6, Math.min(0.72, l + 0.05)] : warm(h, s, l),
  leaf: (h, s, l) => (h > 0.38 && h < 0.52) ? [0.29, 0.55, Math.min(0.62, l + 0.02)] : warm(h, s, l),
  blossom: (h, s, l) => (h > 0.38 && h < 0.52) ? [0.95, 0.72, Math.min(0.8, l + 0.2)] : warm(h, s, l),
  stoneWarm: (h, s, l) => (h > 0.6 && h < 0.75) ? [0.09, 0.2, Math.min(0.9, l + 0.08)] : (h > 0.5 && h <= 0.6) ? [0.55, 0.7, Math.min(0.7, l + 0.05)] : warm(h, s, l),
  dark: (h, s, l) => (h > 0.55 && h < 0.75) ? [0.75, 0.2, l * 0.55] : warm(h, s, l),
  warm: (h, s, l) => warm(h, s, l),
};
function warm(h, s, l) { if (h > 0.6 && h < 0.75 && s < 0.5) return [0.09, 0.35, Math.min(0.85, l * 0.95)]; return (h > 0.02 && h < 0.1 && s > 0.3) ? [0.085, Math.min(0.75, s * 1.15), Math.min(0.85, l + 0.04)] : [h, s, l]; }
const _hsl = { h: 0, s: 0, l: 0 };
function modelGeo(name) {
  if (_g.has(name)) return _g.get(name);
  const fm = firstMesh('dc_' + name); if (!fm) { _g.set(name, null); return null; }
  const g = fm.geometry.index ? fm.geometry.toNonIndexed() : fm.geometry; g.deleteAttribute('uv');
  g.computeBoundingBox(); _g.set(name, g); return g;
}
// item: { model, pos, ry, rx, rz, s: num|[x,y,z], rule, tint, paint, raw }  -> BufferGeometry with position/normal/color
function modelItem(it) {
  const src = modelGeo(it.model); if (!src) return null;
  const g = src.clone(), bb = src.boundingBox, col = g.attributes.color;
  if (!it.raw) g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  const rule = typeof it.rule === 'function' ? it.rule : it.rule && RULES[it.rule], tint = it.tint && new THREE.Color(it.tint), paint = it.paint && new THREE.Color(it.paint);
  if (rule || tint || paint) {
    const a = col.array;
    for (let i = 0; i < a.length; i += 3) {
      _c.setRGB(a[i], a[i + 1], a[i + 2], THREE.LinearSRGBColorSpace);
      if (rule) { _c.getHSL(_hsl, srgb); const [h, s, l] = rule(_hsl.h, _hsl.s, _hsl.l); _c.setHSL(h, s, l, srgb); }
      if (paint) { _c.getHSL(_hsl, srgb); const l = _hsl.l; _c.copy(paint).multiplyScalar(0.55 + l * 0.65); }
      if (tint) _c.multiply(tint);
      a[i] = _c.r; a[i + 1] = _c.g; a[i + 2] = _c.b;
    }
  }
  const sc = Array.isArray(it.s) ? it.s : [it.s ?? 1, it.s ?? 1, it.s ?? 1];
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...(it.pos || [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(it.rx || 0, it.ry || 0, it.rz || 0)), new THREE.Vector3(...sc));
  g.applyMatrix4(m);
  return g;
}
// merged vertex-coloured geometry from procedural ({geo,color}) and model ({model}) items; 1 draw call per template.
function mergeItems(items) {
  const q = new THREE.Quaternion(), e = new THREE.Euler(), mtx = new THREE.Matrix4();
  const gs = [];
  for (const it of items) {
    if (it.model) { const g = modelItem(it); if (g) gs.push(g); continue; }
    const { geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = it;
    const g = geo.clone(); q.setFromEuler(e.set(...rot)); mtx.compose(new THREE.Vector3(...pos), q, new THREE.Vector3(...scale)); g.applyMatrix4(mtx);
    const n = g.attributes.position.count, a = new Float32Array(n * 3), c = new THREE.Color(color);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv');
    gs.push(g.index ? g.toNonIndexed() : g);
  }
  return mergeGeometries(gs.map(g => { const o = new THREE.BufferGeometry(); for (const k of ['position', 'normal', 'color']) o.setAttribute(k, g.attributes[k]); return o; }));
}
const MD = (model, o = {}) => ({ model, ...o });

// ---------- part helpers (all return mergeColored items) ----------
const box = (w, h, d, x, y, z, color, ry = 0, rz = 0) => ({ geo: new THREE.BoxGeometry(w, h, d), color, pos: [x, y, z], rot: [0, ry, rz] });
const cyl = (rt, rb, h, x, y, z, color, seg = 10) => ({ geo: new THREE.CylinderGeometry(rt, rb, h, seg), color, pos: [x, y, z] });
const sph = (r, x, y, z, color, sc = [1, 1, 1]) => ({ geo: new THREE.SphereGeometry(r, 12, 9), color, pos: [x, y, z], scale: sc });
const cone = (r, h, x, y, z, color, seg = 10) => ({ geo: new THREE.ConeGeometry(r, h, seg), color, pos: [x, y, z] });
const tor = (R, r, x, y, z, color, rx = 0) => ({ geo: new THREE.TorusGeometry(R, r, 8, 24), color, pos: [x, y, z], rot: [rx, 0, 0] });

// each builder -> { solid:[parts], glow:[parts], spin?:{part builder} }
const B = {
  d_path: () => ({ solid: [cyl(0.46, 0.5, 0.1, 0, 0.05, 0, '#b8aa98', 9), cyl(0.3, 0.32, 0.06, 0, 0.12, 0, '#cfc2ae', 8)] }),
  d_fence: () => ({ solid: [box(1.0, 0.1, 0.1, 0, 0.5, 0, '#fff4e2'), box(1.0, 0.1, 0.1, 0, 0.25, 0, '#fff4e2'), ...[-0.4, -0.13, 0.13, 0.4].map(x => box(0.14, 0.7, 0.1, x, 0.35, 0, '#ffffff')), ...[-0.4, -0.13, 0.13, 0.4].map(x => cone(0.08, 0.14, x, 0.77, 0, '#ffffff', 4))] }),
  d_sign: () => ({ solid: [cyl(0.06, 0.07, 1.3, 0, 0.65, 0, '#9a6b45'), box(0.9, 0.34, 0.08, 0.05, 1.15, 0.06, '#ffd98a'), box(0.7, 0.28, 0.08, -0.05, 0.8, 0.06, '#ffc2d9', 0.1)] }),
  d_lantern: () => ({ solid: [cyl(0.07, 0.09, 1.5, 0, 0.75, 0, '#5a4a60'), box(0.4, 0.06, 0.4, 0, 1.52, 0, '#5a4a60'), cone(0.3, 0.2, 0, 1.65, 0, '#5a4a60', 4), box(0.28, 0.06, 0.28, 0, 1.0, 0, '#5a4a60')], glow: [sph(0.19, 0, 1.28, 0, '#ffe9a0')] }),
  d_flowerbed: () => ({ solid: [box(1.5, 0.22, 0.8, 0, 0.11, 0, '#a86e48'), box(1.4, 0.12, 0.7, 0, 0.26, 0, '#6b4a34'), ...[[-0.5, 0.1, '#ff8fb3'], [-0.15, -0.1, '#fff27a'], [0.2, 0.12, '#ffffff'], [0.5, -0.08, '#b99bff'], [-0.3, -0.2, '#ff7a7a'], [0.0, 0.2, '#ffb36b']].map(([x, z, c]) => sph(0.13, x, 0.48, z, c)), ...[[-0.5, 0.1], [-0.15, -0.1], [0.2, 0.12], [0.5, -0.08], [-0.3, -0.2], [0, 0.2]].map(([x, z]) => cyl(0.02, 0.02, 0.22, x, 0.36, z, '#5fbf4a', 5))] }),
  d_bench: () => ({ solid: [box(1.5, 0.12, 0.5, 0, 0.5, 0, '#e9b36b'), box(1.5, 0.4, 0.1, 0, 0.82, -0.22, '#e9b36b', 0, 0.0), box(0.12, 0.5, 0.45, -0.62, 0.25, 0, '#b97a45'), box(0.12, 0.5, 0.45, 0.62, 0.25, 0, '#b97a45'), box(1.4, 0.08, 0.06, 0, 0.62, -0.2, '#c98f55')] }),
  d_sapling: () => ({ solid: [cyl(0.09, 0.14, 1.3, 0, 0.65, 0, '#8a5a3a'), sph(0.55, 0, 1.55, 0, '#ffb7d2', [1, 0.85, 1]), sph(0.38, -0.35, 1.35, 0.1, '#ff9ec4'), sph(0.34, 0.36, 1.4, -0.1, '#ffc9de')] }),
  d_mushlamp: () => ({ solid: [cyl(0.12, 0.17, 0.6, 0, 0.3, 0, '#fff4df'), cyl(0.0, 0.62, 0.34, 0, 0.74, 0, '#ff6b8a', 14), sph(0.06, 0.2, 0.86, 0.15, '#ffffff'), sph(0.06, -0.18, 0.8, 0.2, '#ffffff'), sph(0.05, 0.0, 0.95, -0.2, '#ffffff')], glow: [sph(0.12, 0, 0.55, 0.0, '#fff6c0', [1.4, 0.4, 1.4])] }),
  d_picnic: () => ({ solid: [box(1.6, 0.05, 1.3, 0, 0.03, 0, '#ff8c9e'), ...[-0.6, -0.2, 0.2, 0.6].map(x => box(0.2, 0.06, 1.3, x, 0.035, 0, '#ffffff')), cyl(0.2, 0.2, 0.1, 0.3, 0.1, 0.2, '#ffe5a0', 12), sph(0.1, -0.4, 0.14, -0.2, '#ff4d6d'), sph(0.1, -0.2, 0.14, -0.35, '#9a6bff')] }),
  d_fairy: () => ({ solid: [...Array.from({ length: 8 }, (_, i) => { const a = i / 8 * 6.283; return [cyl(0.05, 0.07, 0.25, Math.cos(a) * 0.85, 0.12, Math.sin(a) * 0.85, '#fff4df', 6), cyl(0, 0.22, 0.14, Math.cos(a) * 0.85, 0.3, Math.sin(a) * 0.85, i % 2 ? '#ff7aa8' : '#ffcf5a', 8)]; }).flat()], glow: [tor(0.85, 0.03, 0, 0.04, 0, '#d9f3ff', Math.PI / 2)] }),
  d_bridge: () => ({ solid: [...Array.from({ length: 9 }, (_, i) => { const t = i / 8, x = -1.6 + t * 3.2, y = 0.18 + Math.sin(t * Math.PI) * 0.5; return box(0.42, 0.1, 1.0, x, y, 0, '#d9a066', 0, (t - 0.5) * -0.8); }), ...[-0.5, 0.5].flatMap(z => Array.from({ length: 5 }, (_, i) => { const t = i / 4, x = -1.6 + t * 3.2, y = 0.62 + Math.sin(t * Math.PI) * 0.5; return cyl(0.05, 0.05, 0.5, x, y, z, '#fff4e2', 6); })), ...[-0.5, 0.5].map(z => box(3.2, 0.06, 0.06, 0, 1.0, z, '#fff4e2'))] }),
  d_well: () => ({ solid: [cyl(0.7, 0.75, 0.7, 0, 0.35, 0, '#c9bdb0', 12), cyl(0.55, 0.55, 0.05, 0, 0.72, 0, '#4fb4e8', 12), box(0.1, 1.2, 0.1, -0.65, 1.1, 0, '#9a6b45'), box(0.1, 1.2, 0.1, 0.65, 1.1, 0, '#9a6b45'), cone(1.0, 0.5, 0, 1.95, 0, '#e5788f', 4)] }),
  d_arch: () => ({ solid: [...['#ff6b6b', '#ffb347', '#ffe066', '#7ed957', '#5db8ff', '#a77bff'].map((c, i) => ({ geo: new THREE.TorusGeometry(2.2 - i * 0.16, 0.09, 6, 22, Math.PI), color: c, pos: [0, 0.0, 0] })), cyl(0.3, 0.3, 0.15, -2.1, 0.07, 0, '#ffffff', 8), cyl(0.3, 0.3, 0.15, 2.1, 0.07, 0, '#ffffff', 8)] }),
  d_windmill: () => ({ solid: [cyl(0.7, 1.1, 3.0, 0, 1.5, 0, '#fff0dc', 8), cone(1.1, 1.0, 0, 3.5, 0, '#e5788f', 8), box(0.5, 0.8, 0.1, 0, 0.5, 1.05, '#9a6b45'), cyl(0.12, 0.12, 0.5, 0, 3.0, 0.9, '#8a5a3a', 6)], spin: { origin: [0, 3.0, 1.0], parts: [0, 1, 2, 3].map(i => box(0.28, 1.5, 0.05, 0, 0, 0, i % 2 ? '#ffffff' : '#ffd1e0', 0, 0)).map((b, i) => ({ ...b, pos: [Math.sin(i * Math.PI / 2) * 0.8, Math.cos(i * Math.PI / 2) * 0.8, 0], rot: [0, 0, -i * Math.PI / 2] })) } }),
  d_house: () => ({ solid: [box(2.4, 1.6, 2.0, 0, 0.8, 0, '#fff0dc'), box(2.6, 0.12, 2.2, 0, 0.06, 0, '#c9bdb0'), { geo: new THREE.ConeGeometry(1.9, 1.2, 4), color: '#ee7a8d', pos: [0, 2.2, 0], rot: [0, Math.PI / 4, 0], scale: [1.1, 1, 0.95] }, box(0.55, 0.95, 0.08, 0, 0.5, 1.03, '#9a6b45'), box(0.45, 0.4, 0.08, -0.85, 0.95, 1.03, '#9fd8ff'), box(0.45, 0.4, 0.08, 0.85, 0.95, 1.03, '#9fd8ff'), box(0.3, 0.7, 0.3, 0.7, 2.4, -0.3, '#c9bdb0'), ...[-1, 1].map(s => box(0.7, 0.1, 0.25, s * 0.85, 0.7, 1.12, '#ff9ec4'))] }),
};
Object.assign(B, {
  d_stones: () => ({ solid: [[-0.3, -0.2, 0.28], [0.25, 0.05, 0.24], [-0.05, 0.38, 0.2]].map(([x, z, r]) => cyl(r, r + 0.03, 0.1, x, 0.05, z, '#cdbfae', 7)) }),
  d_mailbox: () => ({ solid: [cyl(0.06, 0.07, 0.95, 0, 0.48, 0, '#8a5a3a'), box(0.55, 0.36, 0.38, 0, 1.08, 0, '#5db8ff'), cyl(0.19, 0.19, 0.38, 0, 1.26, 0, '#5db8ff', 10), box(0.04, 0.24, 0.1, 0.3, 1.22, 0, '#ff6b6b')] }),
  d_table: () => ({ solid: [cyl(0.55, 0.55, 0.08, 0, 0.62, 0, '#fff0dc', 14), cyl(0.07, 0.1, 0.6, 0, 0.3, 0, '#c98f55'), cyl(0.2, 0.2, 0.3, 0.85, 0.15, 0.1, '#ff9ec4', 10), cyl(0.2, 0.2, 0.3, -0.8, 0.15, -0.2, '#9fd8ff', 10), cyl(0.12, 0.1, 0.12, 0.1, 0.72, 0.05, '#ffffff', 10), sph(0.09, -0.15, 0.74, -0.1, '#ff7a9a')] }),
  d_hedge: () => ({ solid: [sph(0.5, 0, 0.5, 0, '#4fbf5a', [1.2, 0.9, 1]), sph(0.36, -0.55, 0.38, 0.05, '#63cf6a'), sph(0.36, 0.55, 0.38, -0.05, '#58c862'), sph(0.07, 0.2, 0.8, 0.35, '#ff8fb3'), sph(0.07, -0.3, 0.7, 0.4, '#fff27a')] }),
  d_lamppost: () => ({ solid: [cyl(0.1, 0.16, 0.2, 0, 0.1, 0, '#4a4058'), cyl(0.06, 0.07, 2.2, 0, 1.2, 0, '#4a4058'), box(0.5, 0.06, 0.5, 0, 2.38, 0, '#4a4058'), cone(0.36, 0.25, 0, 2.55, 0, '#4a4058', 4)], glow: [sph(0.22, 0, 2.18, 0, '#fff0a0')] }),
  d_gazebo: () => ({ solid: [cyl(1.5, 1.5, 0.15, 0, 0.07, 0, '#e9d3b0', 12), ...[[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([x, z]) => cyl(0.09, 0.09, 2.0, x, 1.1, z, '#fff4e2', 6)), cone(1.9, 1.0, 0, 2.6, 0, '#ee7a8d', 8), box(1.4, 0.07, 0.07, 0, 1.0, 1.0, '#fff4e2'), box(1.4, 0.07, 0.07, 0, 1.0, -1.0, '#fff4e2'), sph(0.12, 0, 3.15, 0, '#ffe066')] }),
  b_floor: () => ({ solid: [box(2, 2.4, 2, 0, -0.95, 0, '#c9a27a'), box(2.08, 0.16, 2.08, 0, 0.12, 0, '#d9a066'), ...[-0.75, -0.25, 0.25, 0.75].map(z => box(2.0, 0.02, 0.06, 0, 0.21, z, '#c58a52'))] }),
  b_wall: () => ({ solid: [box(2, 3.3, 0.28, 0, 0.55, 0, '#fff0dc'), box(2.06, 0.25, 0.34, 0, 0.1, 0, '#c9bdb0'), box(0.14, 2.5, 0.34, -0.96, 0.95, 0, '#e8d7bf'), box(0.14, 2.5, 0.34, 0.96, 0.95, 0, '#e8d7bf'), box(0.7, 0.7, 0.34, 0, 1.2, 0, '#9fd8ff'), box(0.82, 0.08, 0.38, 0, 1.58, 0, '#ffffff'), box(0.82, 0.08, 0.38, 0, 0.82, 0, '#ffffff')] }),
  b_door: () => ({ solid: [box(0.55, 3.3, 0.28, -0.72, 0.55, 0, '#fff0dc'), box(0.55, 3.3, 0.28, 0.72, 0.55, 0, '#fff0dc'), box(2, 0.5, 0.28, 0, 1.95, 0, '#fff0dc'), box(0.95, 1.6, 0.1, 0, 0.8, 0, '#9a6b45'), sph(0.06, 0.3, 0.8, 0.08, '#ffd23f'), box(1.0, 0.1, 0.5, 0, 0.0, 0.3, '#c9bdb0')] }),
  b_roof: () => ({ solid: [{ geo: new THREE.ConeGeometry(1.75, 1.25, 4), color: '#ee7a8d', pos: [0, 0.6, 0], rot: [0, Math.PI / 4, 0] }, box(2.5, 0.12, 2.5, 0, -0.04, 0, '#c9566e')] }),
});
function plush(sp) { const c = PLUSH_COLORS[sp]; return { solid: [sph(0.42, 0, 0.42, 0, c, [1, 0.9, 1]), sph(0.3, 0, 0.95, 0, c), sph(0.11, -0.2, 1.2, 0, c, [1, 1.5, 0.7]), sph(0.11, 0.2, 1.2, 0, c, [1, 1.5, 0.7]), sph(0.045, -0.1, 0.98, 0.27, '#2a1d2e'), sph(0.045, 0.1, 0.98, 0.27, '#2a1d2e'), sph(0.07, 0, 0.9, 0.29, '#ffd1dc', [1, 0.6, 0.5]), sph(0.1, 0, 0.5, -0.4, '#ffffff')] }; }

// ---------- model-based builders (final metres, SCALE=1). Fall back to the procedural builders above if a model failed to load. ----------
const HP = Math.PI / 2;
const NEW = {
  d_house: () => {
    const m = 2.2, W = (name, x, z, ry) => MD(name, { pos: [x, 0.3, z], ry, s: m, rule: 'cream' });
    return { solid: [
      box(4.9, 0.3, 4.9, 0, 0.15, 0, '#cbbfb0'),
      W('wall-door', -1.1, m, HP), W('wall-window-shutters', 1.1, m, HP), W('wall-window-small', -1.1, -m, HP), W('wall-window-small', 1.1, -m, HP),
      W('wall-window-small', m, -1.1, 0), W('wall', m, 1.1, 0), W('wall-window-small', -m, -1.1, 0), W('wall-window-small', -m, 1.1, 0),
      MD('roof-gable', { pos: [-1.2, 2.5, 0], s: [2.2, 3.0, 4.5], rule: 'roofPink' }), MD('roof-gable', { pos: [1.2, 2.5, 0], s: [2.2, 3.0, 4.5], rule: 'roofPink' }),
      MD('chimney', { pos: [1.5, 3.1, -0.9], s: [2.2, 1.5, 2.2], rule: 'stoneWarm' }),
      MD('planks', { pos: [-1.1, 0.3, m + 0.45], s: [1.2, 2, 0.8], rule: 'warm' }),
      box(1.1, 0.22, 0.34, 1.1, 0.72, m + 0.3, '#a86e48'), ...[-0.3, 0, 0.3].map((dx, i) => sph(0.11, 1.1 + dx, 0.9, m + 0.3, ['#ff8fb3', '#fff27a', '#ffffff'][i])),
    ] };
  },
  d_windmill: () => {
    const m = 2.6, W = (name, x, z, ry, y) => MD(name, { pos: [x, y, z], ry, s: m, rule: 'cream' });
    const ring = (y, front) => [W(front, 0, m / 2, HP, y), W('wall-window-small', 0, -m / 2, HP, y), W('wall-window-small', m / 2, 0, 0, y), W('wall-window-small', -m / 2, 0, 0, y)];
    return { solid: [
      box(3.0, 0.3, 3.0, 0, 0.15, 0, '#cbbfb0'), ...ring(0.3, 'wall-door'), ...ring(0.3 + m, 'wall'),
      MD('roof-high-point', { pos: [0, 0.3 + 2 * m - 0.1, 0], s: [3.3, 2.4, 3.3], rule: 'roofPink' }),
      cyl(0.16, 0.16, 0.9, 0, 4.4, m / 2 + 0.2, '#8a5a3a', 8),
    ], spin: { origin: [0, 4.4, m / 2 + 0.7], parts: [MD('windmill', { raw: true, ry: HP, s: 1.75, rule: 'warm' })] } };
  },
  d_gazebo: () => ({ solid: [
    cyl(2.3, 2.4, 0.22, 0, 0.11, 0, '#e2d2b8', 8), MD('planks', { pos: [0, 0.22, 0], s: [3.2, 2.5, 3.2], rule: 'warm' }),
    ...[[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([x, z]) => MD('pillar-wood', { pos: [x * 1.5, 0.22, z * 1.5], s: [2.6, 2.7, 2.6], tint: '#fff2dc' })),
    MD('poles-horizontal', { pos: [0, 0.22, -1.5], ry: HP, s: [1.6, 0.9, 3.0], rule: 'warm' }), MD('poles-horizontal', { pos: [1.5, 0.22, 0], s: [1.6, 0.9, 3.0], rule: 'warm' }), MD('poles-horizontal', { pos: [-1.5, 0.22, 0], s: [1.6, 0.9, 3.0], rule: 'warm' }),
    MD('roof-high-point', { pos: [0, 2.85, 0], s: [4.5, 2.1, 4.5], rule: 'roofPink' }), sph(0.16, 0, 4.95, 0, '#ffe066'),
  ] }),
  d_well: () => ({ solid: [
    MD('fountain-round', { s: [0.85, 2.0, 0.85], rule: 'stoneWarm' }),
    ...[-1, 1].map(z => MD('pillar-wood', { pos: [0, 0.4, z * 0.78], s: [2.2, 2.2, 2.2], tint: '#fff2dc' })),
    MD('roof-gable', { pos: [0, 2.35, 0], s: [2.2, 1.7, 2.2], rule: 'roofPink' }),
    cyl(0.07, 0.07, 1.7, 0, 1.9, 0, '#9a6b45', 6), cyl(0.16, 0.14, 0.2, 0.0, 1.35, 0, '#b9916a', 8),
  ] }),
  d_bridge: () => {
    const L = 1.4, arc = t => (0.18 + Math.sin(t * Math.PI) * 0.5) * L, X = t => (-1.6 + t * 3.2) * L;
    const rail = [], post = [];
    for (const z of [-0.72, 0.72]) {
      for (let i = 0; i < 5; i++) { const t = i / 4; post.push(MD('pillar-wood', { pos: [X(t), arc(t) - 0.02, z], s: [1.3, 0.95, 1.3], tint: '#fff2dc' })); }
      for (let i = 0; i < 4; i++) { const t0 = i / 4, t1 = (i + 1) / 4, x0 = X(t0), x1 = X(t1), y0 = arc(t0) + 1.0, y1 = arc(t1) + 1.0; rail.push({ geo: new THREE.BoxGeometry(Math.hypot(x1 - x0, y1 - y0) + 0.1, 0.1, 0.12), color: '#f2d9a8', pos: [(x0 + x1) / 2, (y0 + y1) / 2, z], rot: [0, 0, Math.atan2(y1 - y0, x1 - x0)] }); }
    }
    return { solid: [...Array.from({ length: 9 }, (_, i) => { const t = i / 8; return MD('planks', { pos: [X(t), arc(t), 0], rz: (t - 0.5) * -0.8, s: [0.62, 3, 1.5], rule: 'warm' }); }), ...post, ...rail] };
  },
  d_fence: () => ({ solid: [MD('fence', { ry: HP, s: [1.7, 2.3, 1.6], rule: 'warm', tint: '#fff2e2' })] }),
  d_hedge: () => ({ solid: [MD('hedge-large', { ry: HP, s: [2.3, 2.0, 1.75], rule: 'leaf' }), sph(0.09, 0.2, 1.15, 0.3, '#ff8fb3'), sph(0.09, -0.35, 1.05, 0.34, '#fff27a'), sph(0.09, 0.55, 0.95, 0.38, '#ffffff'), sph(0.09, -0.65, 0.9, -0.3, '#ffb36b')] }),
  d_bench: () => ({ solid: [MD('bench', { ry: 0, s: [5.6, 3.5, 4.0], paint: '#e9b36b' }), box(0.5, 0.1, 0.4, -0.45, 0.62, 0.02, '#ff9ec4'), box(0.5, 0.1, 0.4, 0.45, 0.62, 0.02, '#9fd8ff')] }),
  d_table: () => ({ solid: [MD('tableRound', { s: 2.3, paint: '#f2c98a' }), MD('stall-stool', { pos: [1.15, 0, 0.3], s: 2.2, rule: 'warm' }), MD('stall-stool', { pos: [-0.95, 0, -0.7], s: 2.2, rule: 'warm', ry: 0.7 }), cyl(0.12, 0.1, 0.12, 0.1, 0.82, 0.05, '#ffffff', 10), sph(0.1, -0.2, 0.9, -0.15, '#ff7a9a'), cyl(0.08, 0.08, 0.04, 0.3, 0.79, 0.3, '#ffe5a0', 10)] }),
  d_sign: () => ({ solid: [MD('signpost', { s: 3.4, rule: 'warm' })] }),
  d_lantern: () => ({ solid: [MD('pillar-wood', { s: [1.7, 2.0, 1.7], rule: 'warm' }), box(0.7, 0.07, 0.07, 0.3, 1.9, 0, '#9a6b45'), box(0.3, 0.05, 0.3, 0.6, 1.62, 0, '#5a4a60'), box(0.3, 0.05, 0.3, 0.6, 1.08, 0, '#5a4a60'), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => box(0.035, 0.52, 0.035, 0.6 + a * 0.13, 1.35, b * 0.13, '#5a4a60')), MD('roof-point', { pos: [0.6, 1.64, 0], s: [0.4, 0.6, 0.4], tint: '#8f7a9a' })], glow: [sph(0.15, 0.6, 1.35, 0, '#ffe9a0')] }),
  d_lamppost: () => ({ solid: [MD('lantern', { s: 1.7, rule: 'dark' })], glow: [sph(0.17, 0, 2.4, 0, '#fff0a0')] }),
  d_sapling: () => ({ solid: [MD('tree-high-round', { s: [1.7, 1.05, 1.7], rule: 'blossom' })] }),
  d_stones: () => ({ solid: [MD('rock-flat', { s: [0.55, 1.6, 0.55], rule: 'stoneWarm' })] }),
  d_path: () => ({ solid: [MD('road', { s: [1.25, 3, 1.25], paint: '#dba995', ry: 0.2 }), MD('road', { pos: [0, 0.08, 0], s: [0.8, 2, 0.8], paint: '#efc9b6', ry: 0.2 })] }),
  d_picnic: () => ({ solid: [MD('rugSquare', { s: 1.75, ry: 0.15 }), cyl(0.2, 0.2, 0.1, 0.3, 0.1, 0.2, '#ffe5a0', 12), sph(0.1, -0.4, 0.14, -0.2, '#ff4d6d'), sph(0.1, -0.2, 0.14, -0.35, '#9a6bff'), box(0.4, 0.2, 0.3, 0.5, 0.14, -0.35, '#c98f55')] }),
  b_floor: () => ({ solid: [box(2, 2.2, 2, 0, -0.9, 0, '#cbbfb0'), MD('planks', { pos: [0, 0.2, 0], s: [2.0, 2.2, 2.0], rule: 'warm' })] }),
  b_wall: () => ({ solid: [MD('wall', { pos: [0, 0.32, 0], ry: HP, s: 2, rule: 'cream' })] }),
  b_door: () => ({ solid: [MD('wall-doorway-square', { pos: [0, 0.32, 0], ry: HP, s: 2, rule: 'cream' }), MD('planks', { pos: [0, 0.2, 0.55], s: [0.9, 2, 0.6], rule: 'warm' })] }),
  b_roof: () => ({ solid: [MD('roof-point', { pos: [0, 0.32, 0], s: [2.3, 3.0, 2.3], rule: 'roofPink' })] }),
};

const TINTS = ['#ffffff', '#ffc9dc', '#c9e4ff', '#cff3c9', '#fff0a8', '#dccbff'];
export const TINT_COUNT = TINTS.length, SIZES = [0.8, 1, 1.3];
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const templates = new Map();
function template(id) {
  if (templates.has(id)) return templates.get(id);
  const sp = DECOR_BY_ID[id].species, ok = hasModel('dc_wall');
  const b = sp ? plush(sp) : (ok && NEW[id] ? NEW[id]() : B[id]());
  const t = { solid: mergeItems(b.solid), glow: b.glow && mergeItems(b.glow), spin: b.spin && { origin: b.spin.origin, geo: mergeItems(b.spin.parts) } };
  templates.set(id, t); return t;
}
const SCALE_OLD = { d_house: 2.0, d_windmill: 2.0, d_lantern: 1.8, d_well: 1.6, d_arch: 1.5, d_sapling: 1.6, d_mushlamp: 1.7, d_bridge: 1.4, d_flowerbed: 1.5, d_bench: 1.5, d_sign: 1.5, d_table: 1.5, d_gazebo: 1.5, d_lamppost: 1.4, d_hedge: 1.4, d_mailbox: 1.5, d_stones: 1.4, d_path: 1.4, d_fence: 1.4 };
// model builders are authored in final metres (scale 1); procedural fallbacks keep their old scale
const SCALE = new Proxy({}, { get: (_, id) => (hasModel('dc_wall') && NEW[id]) ? 1 : SCALE_OLD[id] });
const FOOT = { d_house: 2.4, d_windmill: 1.8, d_gazebo: 2.0, d_well: 1.2, d_bridge: 1.7, d_arch: 1.6, d_table: 1.3, d_bench: 1.1, d_hedge: 0.9, d_fence: 0.8, d_sapling: 0.8, d_lamppost: 0.5, d_lantern: 0.5 };
const ghostMat = () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.78, depthWrite: true, depthTest: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
function makeMesh(id, ghost = false, s = 1, v = 0) {
  const t = template(id), g = new THREE.Group(), kit = DECOR_BY_ID[id].kind === 'kit';
  const inner = new THREE.Group(); g.add(inner);
  const m = new THREE.Mesh(t.solid, ghost ? ghostMat() : toon(TINTS[v % TINTS.length], { vc: true, rimTint: true }));
  m.castShadow = !ghost; if (ghost) m.renderOrder = 10; else outline(m, 0.02, '#3b2a3a'); inner.add(m);
  if (t.glow) { const gm = new THREE.Mesh(t.glow, glowMat); if (ghost) { gm.material = ghostMat(); gm.renderOrder = 10; } inner.add(gm); }
  if (t.spin) { const sg = new THREE.Group(); sg.position.set(...t.spin.origin); const sm = new THREE.Mesh(t.spin.geo, ghost ? ghostMat() : toon(TINTS[v % TINTS.length], { vc: true, rimTint: true })); if (ghost) sm.renderOrder = 10; sg.add(sm); inner.add(sg); g.userData.spin = sg; }
  inner.scale.setScalar((kit ? 1 : (SCALE[id] || 1.4)) * (kit ? 1 : (SIZES[s] ?? 1)));
  return g;
}
const footprint = (id) => { const k = DECOR_BY_ID[id].kind; return k === 'kit' ? 1.2 : (hasModel('dc_wall') && FOOT[id]) || Math.max(0.7, 0.55 * (SCALE_OLD[id] || 1.4)); };

// ---------- world state ----------
let scene, player, placed = [], ghost = null, ring = null, beam = null, mode = null, fx;
const LIMIT = 220;
export const charm = () => state.decor.reduce((a, d) => a + (DECOR_BY_ID[d.id]?.charm || 0), 0);
export const decorCount = () => state.decor.length;
export const isPlacing = () => !!mode;
// Nature culling: tell grass/flowers where decor sits (world.clearings is read by src/nature; first 32 entries drive the grass).
const CLEAR_R = { b_floor: 1.7, d_house: 3.1, d_gazebo: 2.7, d_windmill: 2.4, d_well: 1.5, d_bridge: 2.4, d_table: 1.3, d_picnic: 1.4, d_fairy: 1.2, d_bench: 1.1, d_gallery: 0 };
function syncClearings() {
  const list = [];
  for (const d of state.decor) { const r = CLEAR_R[d.id]; if (r) list.push({ x: d.x, z: d.z, r: r * (d.id === 'b_floor' ? 1 : (SIZES[d.s ?? 1] ?? 1)) }); }
  list.sort((a, b) => b.r - a.r);
  world.clearings = list; world.clearingsVersion = (world.clearingsVersion || 0) + 1;
}
const baseY = (x, z) => heightAt(x, z);
const isKit = id => DECOR_BY_ID[id].kind === 'kit';
function kitSamples(x, z) { let hi = -9, lo = 99; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const h = heightAt(x + i * 1.2, z + j * 1.2); hi = Math.max(hi, h); lo = Math.min(lo, h); } return { hi, lo }; }
// All pieces of one house share a level: adopt a neighbour's level, otherwise the highest ground under the piece (+ a small rise so grass cannot poke through).
function kitLevel(x, z, skipIdx = -1) {
  let best = null, bd = 1.9;
  state.decor.forEach((d, i) => { if (i === skipIdx || !isKit(d.id) || d.y == null) return; const dd = Math.hypot(d.x - x, d.z - z); if (dd < bd) { bd = dd; best = d; } });
  return best ? best.y : kitSamples(x, z).hi + 0.3;
}
const ev = v => 2 * Math.round(v / 2);
function nearestFloor(x, z, r) { let best = null, bd = r; for (const d of state.decor) if (d.id === 'b_floor') { const dd = Math.hypot(d.x - x, d.z - z); if (dd < bd) { bd = dd; best = d; } } return best; }
function snapPos(x, z, id, rot) {
  const def = DECOR_BY_ID[id];
  if (def.kind !== 'kit') return [Math.round(x * 2) / 2, Math.round(z * 2) / 2];
  const f = nearestFloor(x, z, 7), ax = f ? f.x : 0, az = f ? f.z : 0;       // magnetic: snap relative to the nearest existing floor
  const gx = v => ax + 2 * Math.round((v - ax) / 2), gz = v => az + 2 * Math.round((v - az) / 2);
  const ox = v => ax + 1 + 2 * Math.round((v - ax - 1) / 2), oz = v => az + 1 + 2 * Math.round((v - az - 1) / 2);
  if (def.layer === 1) return rot % 4 === 0 ? [gx(x), oz(z)] : [ox(x), gz(z)];  // walls and doorways sit on floor edges
  if (def.layer === 2) { const fl = nearestFloor(x, z, 2.6); if (fl) return [fl.x, fl.z]; }  // roofs centre over a floor
  return [gx(x), gz(z)];
}
function placeMesh(m, d) {
  const def = DECOR_BY_ID[d.id];
  if (def.kind === 'kit') { if (d.y == null) d.y = kitLevel(d.x, d.z); m.position.set(d.x, d.y + (def.elev || 0), d.z); }
  else { const y = heightAt(d.x, d.z); m.position.set(d.x, def.kind === 'flat' ? y : y - 0.02, d.z); }
  m.rotation.y = d.r * Math.PI / 4;
}
function spawn(d) { const m = makeMesh(d.id, false, d.s ?? 1, d.v ?? 0); placeMesh(m, d); scene.add(m); placed.push({ d, m }); return m; }
// returns { ok, reason, replace }
function check(x, z, id, rot) {
  const def = DECOR_BY_ID[id];
  if (heightAt(x, z) < 0.8) return { ok: false, reason: 'In the water or on the beach edge' };
  if (state.decor.length >= LIMIT && mode?.moving == null) return { ok: false, reason: 'Your island is full (220 pieces)' };
  if (def.kind === 'kit') { const { hi, lo } = kitSamples(x, z); if (hi - lo > 2.0) return { ok: false, reason: 'Too steep for a house here' }; }
  let replace = null;
  for (let i = 0; i < state.decor.length; i++) {
    const p = state.decor[i]; if (mode?.moving != null && mode.moving === i) continue;
    const o = DECOR_BY_ID[p.id], dd = Math.hypot(p.x - x, p.z - z);
    if (def.kind === 'kit' || o.kind === 'kit') {
      if (def.kind === 'kit' && o.kind === 'kit') {
        if (def.layer === o.layer && dd < 0.9 && p.r % 4 === rot % 4) { if (def.layer === 1 && p.id !== id) { replace = i; continue; } return { ok: false, reason: `${o.name} is already here` }; }
        continue;
      }
      if (def.kind !== 'flat' && o.kind !== 'flat' && dd < 1.6) return { ok: false, reason: `Overlaps your ${o.name}` };
      continue;
    }
    if (dd < (def.kind === 'flat' || o.kind === 'flat' ? 0.55 : Math.max(0.9, (footprint(id) + footprint(p.id)) * 0.55))) return { ok: false, reason: `Overlaps your ${o.name}` };
  }
  return { ok: true, replace };
}
export function initDecor(pl) {
  player = pl; scene = window.__game.scene; fx = getFX(scene);
  for (const d of state.decor) if (DECOR_BY_ID[d.id]) spawn(d);
  ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7dffb0', transparent: true, opacity: 0.95, depthWrite: false, depthTest: false })); ring.visible = false; ring.renderOrder = 11; scene.add(ring);
  beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7, 8), new THREE.MeshBasicMaterial({ color: '#7dffb0', transparent: true, opacity: 0.55, depthWrite: false, depthTest: false })); beam.visible = false; beam.renderOrder = 11; scene.add(beam);
  syncClearings(); checkCharm();
}
export function tickDecor(dt, t) {
  for (const p of placed) if (p.m.userData.spin) p.m.userData.spin.rotation.z += dt * 0.8;
  if (!mode) return;
  const pos = player.mesh.position, ry = player.mesh.rotation.y, def = DECOR_BY_ID[mode.id];
  const dist = 3.2 + (def.kind === 'kit' ? 0 : Math.max(0, footprint(mode.id) * (SIZES[mode.s] ?? 1) - 1.2) * 0.9);
  const [x, z] = snapPos(pos.x + Math.sin(ry) * dist, pos.z + Math.cos(ry) * dist, mode.id, mode.rot);
  const chk = check(x, z, mode.id, mode.rot), ok = chk.ok, y = (def.kind === 'kit' ? kitLevel(x, z, mode.moving ?? -1) : heightAt(x, z)) + (def.elev || 0);
  ghost.position.set(x, Math.max(y, 0), z); ghost.rotation.y = mode.rot * Math.PI / 4; ghost.userData.spin?.rotateZ(dt);
  const gy = Math.max(def.kind === 'kit' ? y - (def.elev || 0) : heightAt(x, z), 0), col = ok ? '#7dffb0' : '#ff7a7a', fp = footprint(mode.id) * (def.kind === 'kit' ? 1 : (SIZES[mode.s] ?? 1));
  ring.position.set(x, gy + 0.08, z); ring.material.color.set(col); ring.scale.setScalar(fp * (1 + Math.sin(t * 6) * 0.04));
  beam.position.set(x, gy + 3.5, z); beam.material.color.set(col);
  mode.pos = { x, z, y: def.kind === 'kit' ? y - (def.elev || 0) : null }; mode.ok = ok; mode.replace = chk.replace;
  const reason = ok ? '' : chk.reason; if (reason !== mode.reason) { mode.reason = reason; emit('placereason', { text: reason }); }
  // Line mode: walking lays a row of pieces
  if (mode.line && def.line && ok && mode.moving == null) { const k = `${x},${z},${mode.rot}`; if (mode.lastCell !== k && (state.decorInv[mode.id] || 0) > 0) { mode.lastCell = k; doPlace(true); if (!(state.decorInv[mode.id] > 0)) endMode(); } }
}
const modeInfo = () => ({ on: true, id: mode.id, moving: mode.moving != null, line: mode.line, line_ok: !!DECOR_BY_ID[mode.id].line, kit: DECOR_BY_ID[mode.id].kind === 'kit' });
export function startPlacing(id, movingIndex = null) {
  if (mode) cancelPlacing();
  const mv = movingIndex != null ? state.decor[movingIndex] : null;
  mode = { id, rot: mv ? mv.r : 0, s: mv ? (mv.s ?? 1) : 1, v: mv ? (mv.v ?? 0) : 0, line: false, moving: movingIndex };
  rebuildGhost(); ring.visible = true; beam.visible = true;
  if (mv) { const p = placed[movingIndex]; p.m.visible = false; fx.burst(p.m.position.clone().setY(p.m.position.y + 0.8), '#fff6a8', 12); }
  emit('placing', modeInfo());
}
function rebuildGhost() { if (ghost) scene.remove(ghost); ghost = makeMesh(mode.id, true, mode.s, mode.v); scene.add(ghost); }
export function rotatePlacing() { if (!mode) return; const kit = DECOR_BY_ID[mode.id].kind === 'kit'; mode.rot = (mode.rot + (kit ? 2 : 1)) % 8; emit('sfx', { name: 'click' }); }
export function sizePlacing() { if (!mode || DECOR_BY_ID[mode.id].kind === 'kit') return; mode.s = (mode.s + 1) % SIZES.length; emit('toast', { icon: '📏', text: ['Small', 'Normal', 'Large'][mode.s], kind: 'info' }); rebuildGhost(); }
export function tintPlacing() { if (!mode) return; mode.v = (mode.v + 1) % TINTS.length; rebuildGhost(); emit('sfx', { name: 'click' }); }
export function linePlacing() { if (!mode || !DECOR_BY_ID[mode.id].line) return; mode.line = !mode.line; mode.lastCell = null; emit('toast', { icon: '↔️', text: mode.line ? 'Line mode: walk to lay a row' : 'Line mode off', kind: 'info' }); emit('placing', modeInfo()); }
function endMode() { if (ghost) { scene.remove(ghost); ghost = null; } if (ring) ring.visible = false; if (beam) beam.visible = false; mode = null; emit('placing', { on: false }); }
export function cancelPlacing() {
  if (!mode) return;
  if (mode.moving != null) placed[mode.moving].m.visible = true;
  endMode();
}
function doPlace(quiet) {
  const { x, z } = mode.pos, id = mode.id;
  if (mode.moving != null) {
    const p = state.decor[mode.moving]; Object.assign(p, { x, z, r: mode.rot, s: mode.s, v: mode.v }); if (isKit(id)) p.y = mode.pos.y;
    scene.remove(placed[mode.moving].m); const m = makeMesh(id, false, mode.s, mode.v); placeMesh(m, p); scene.add(m); placed[mode.moving].m = m;
  } else {
    if (!(state.decorInv[id] > 0)) return false;
    if (mode.replace != null) storeIndex(mode.replace);
    state.decorInv[id]--; const d = { id, x, z, r: mode.rot, s: mode.s, v: mode.v }; if (isKit(id)) d.y = kitLevel(x, z); state.decor.push(d); spawn(d);
    emit('place', { id }); emit('inventory');
    if (!state.placedTypes[id]) { state.placedTypes[id] = 1; addPetals(5); emit('toast', { icon: '✨', text: `First ${DECOR_BY_ID[id].name} placed! +5 🌸`, kind: 'win' }); }
  }
  const y = baseY(x, z);
  fx.burst(new THREE.Vector3(x, y + 0.6, z), '#fff6a8', quiet ? 6 : 18); if (!quiet) fx.hearts(new THREE.Vector3(x, y + 1.4, z), 3);
  emit('sfx', { name: 'place' }); saveSoon(); syncClearings(); checkCharm(); return true;
}
export function confirmPlacing() {
  if (!mode) return false;
  if (!mode.ok) { emit('toast', { icon: '🚫', text: mode.reason || 'You cannot place that here.', kind: 'info' }); emit('sfx', { name: 'nope' }); return false; }
  const ok = doPlace(false), left = state.decorInv[mode.id] > 0 && mode.moving == null;
  if (!left) endMode();
  return ok;
}
export function nearestDecor(pos, r = 2.6) {
  let bi = -1, bd = r;
  state.decor.forEach((d, i) => { const dd = Math.hypot(d.x - pos.x, d.z - pos.z); if (dd < bd) { bd = dd; bi = i; } });
  return bi;
}
export function moveDecor(i) { if (i >= 0) startPlacing(state.decor[i].id, i); }
export function storeIndex(i) {
  if (i < 0 || i >= state.decor.length) return;
  const d = state.decor[i]; fx.burst(placed[i].m.position.clone().setY(placed[i].m.position.y + 0.8), '#fff6a8', 12); scene.remove(placed[i].m); placed.splice(i, 1); state.decor.splice(i, 1);
  state.decorInv[d.id] = (state.decorInv[d.id] || 0) + 1; emit('inventory'); saveSoon(); syncClearings(); checkCharm();
}
export function storeMoving() { if (!mode || mode.moving == null) return; const i = mode.moving; endMode(); storeIndex(i); }
export function buyDecor(id) {
  const d = DECOR_BY_ID[id]; if (!d || d.gift) return false;
  if (state.petals < d.price) return false;
  addPetals(-d.price); state.decorInv[id] = (state.decorInv[id] || 0) + 1; emit('purchase', { id, price: d.price, decor: true }); emit('decorbuy', { id }); emit('inventory'); saveSoon(); return true;
}
export function giveDecor(id) { state.decorInv[id] = (state.decorInv[id] || 0) + 1; emit('inventory'); saveSoon(); }
function checkCharm() {
  const c = charm(); emit('charm', { charm: c });
  for (const m of CHARM_MS) {
    if (c < m.at || state.charmMs[m.at]) continue;
    state.charmMs[m.at] = 1;
    addPetals(m.petals); if (m.item && !state.owned.includes(m.item)) state.owned.push(m.item);
    const it = m.item && WARDROBE.find(w => w.id === m.item);
    emit('toast', { icon: '🏡', text: `Island Charm ${m.at}: ${m.text}! +${m.petals} 🌸${it ? ` · ${it.icon} ${it.name}` : ''}`, kind: 'win' });
  }
  saveSoon();
}
export function nextCharm() { return CHARM_MS.find(m => !state.charmMs[m.at]); }
