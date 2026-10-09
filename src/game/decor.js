// Island decorating: cheap merged toon meshes, placement mode (snap grid, rotate, pick up/move), persistence.
import * as THREE from 'three';
import { heightAt } from '../terrain.js';
import { toon, outline, mergeColored } from '../chars/toon.js';
import { state, saveSoon, addPetals } from './state.js';
import { DECOR, DECOR_BY_ID, PLUSH_COLORS, CHARM_MS } from './content.js';
import { WARDROBE } from './data.js';
import { emit, on } from './events.js';
import { getFX } from '../chars/fx.js';

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
  b_floor: () => ({ solid: [box(2, 0.9, 2, 0, -0.3, 0, '#d9a066'), ...[-0.75, -0.25, 0.25, 0.75].map(z => box(2, 0.02, 0.06, 0, 0.16, z, '#c58a52'))] }),
  b_wall: () => ({ solid: [box(2, 2.5, 0.28, 0, 0.95, 0, '#fff0dc'), box(2.06, 0.25, 0.34, 0, 0.1, 0, '#c9bdb0'), box(0.14, 2.5, 0.34, -0.96, 0.95, 0, '#e8d7bf'), box(0.14, 2.5, 0.34, 0.96, 0.95, 0, '#e8d7bf'), box(0.7, 0.7, 0.34, 0, 1.2, 0, '#9fd8ff'), box(0.82, 0.08, 0.38, 0, 1.58, 0, '#ffffff'), box(0.82, 0.08, 0.38, 0, 0.82, 0, '#ffffff')] }),
  b_door: () => ({ solid: [box(0.55, 2.5, 0.28, -0.72, 0.95, 0, '#fff0dc'), box(0.55, 2.5, 0.28, 0.72, 0.95, 0, '#fff0dc'), box(2, 0.5, 0.28, 0, 1.95, 0, '#fff0dc'), box(0.95, 1.6, 0.1, 0, 0.8, 0, '#9a6b45'), sph(0.06, 0.3, 0.8, 0.08, '#ffd23f'), box(1.0, 0.1, 0.5, 0, 0.0, 0.3, '#c9bdb0')] }),
  b_roof: () => ({ solid: [{ geo: new THREE.ConeGeometry(1.75, 1.25, 4), color: '#ee7a8d', pos: [0, 0.6, 0], rot: [0, Math.PI / 4, 0] }, box(2.5, 0.12, 2.5, 0, -0.04, 0, '#c9566e')] }),
});
function plush(sp) { const c = PLUSH_COLORS[sp]; return { solid: [sph(0.42, 0, 0.42, 0, c, [1, 0.9, 1]), sph(0.3, 0, 0.95, 0, c), sph(0.11, -0.2, 1.2, 0, c, [1, 1.5, 0.7]), sph(0.11, 0.2, 1.2, 0, c, [1, 1.5, 0.7]), sph(0.045, -0.1, 0.98, 0.27, '#2a1d2e'), sph(0.045, 0.1, 0.98, 0.27, '#2a1d2e'), sph(0.07, 0, 0.9, 0.29, '#ffd1dc', [1, 0.6, 0.5]), sph(0.1, 0, 0.5, -0.4, '#ffffff')] }; }

const TINTS = ['#ffffff', '#ffc9dc', '#c9e4ff', '#cff3c9', '#fff0a8', '#dccbff'];
export const TINT_COUNT = TINTS.length, SIZES = [0.8, 1, 1.3];
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const templates = new Map();
function template(id) {
  if (templates.has(id)) return templates.get(id);
  const b = DECOR_BY_ID[id].species ? plush(DECOR_BY_ID[id].species) : B[id]();
  const t = { solid: mergeColored(b.solid), glow: b.glow && mergeColored(b.glow), spin: b.spin && { origin: b.spin.origin, geo: mergeColored(b.spin.parts) } };
  templates.set(id, t); return t;
}
const SCALE = { d_house: 2.0, d_windmill: 2.0, d_lantern: 1.8, d_well: 1.6, d_arch: 1.5, d_sapling: 1.6, d_mushlamp: 1.7, d_bridge: 1.4, d_flowerbed: 1.5, d_bench: 1.5, d_sign: 1.5, d_table: 1.5, d_gazebo: 1.5, d_lamppost: 1.4, d_hedge: 1.4, d_mailbox: 1.5, d_stones: 1.4, d_path: 1.4, d_fence: 1.4 };
const ghostMat = () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, depthTest: false });
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
const footprint = (id) => { const k = DECOR_BY_ID[id].kind; return k === 'kit' ? 1.2 : Math.max(0.7, 0.55 * (SCALE[id] || 1.4)); };

// ---------- world state ----------
let scene, player, placed = [], ghost = null, ring = null, beam = null, mode = null, fx;
const LIMIT = 220;
export const charm = () => state.decor.reduce((a, d) => a + (DECOR_BY_ID[d.id]?.charm || 0), 0);
export const decorCount = () => state.decor.length;
export const isPlacing = () => !!mode;
const baseY = (x, z, kit) => (kit ? Math.max(heightAt(x, z), heightAt(x + 1, z), heightAt(x - 1, z), heightAt(x, z + 1), heightAt(x, z - 1)) : heightAt(x, z));
function snapPos(x, z, id, rot) {
  const def = DECOR_BY_ID[id];
  if (def.kind !== 'kit') return [Math.round(x * 2) / 2, Math.round(z * 2) / 2];
  const ev = v => 2 * Math.round(v / 2), od = v => 2 * Math.round((v - 1) / 2) + 1;
  if (def.layer === 1) return rot % 4 === 0 ? [ev(x), od(z)] : [od(x), ev(z)]; // walls and doors sit on floor edges
  return [ev(x), ev(z)];
}
function placeMesh(m, d) {
  const def = DECOR_BY_ID[d.id], y = baseY(d.x, d.z, def.kind === 'kit') + (def.elev || 0);
  m.position.set(d.x, def.kind === 'flat' || def.kind === 'kit' ? y : y - 0.02, d.z); m.rotation.y = d.r * Math.PI / 4;
}
function spawn(d) { const m = makeMesh(d.id, false, d.s ?? 1, d.v ?? 0); placeMesh(m, d); scene.add(m); placed.push({ d, m }); return m; }
function validAt(x, z, id, rot) {
  if (heightAt(x, z) < 0.8) return false;
  const def = DECOR_BY_ID[id];
  if (state.decor.length >= LIMIT && mode?.moving == null) return false;
  for (const p of state.decor) {
    if (mode?.moving != null && state.decor[mode.moving] === p) continue;
    const o = DECOR_BY_ID[p.id], dd = Math.hypot(p.x - x, p.z - z);
    if (def.kind === 'kit' || o.kind === 'kit') {
      if (def.kind === 'kit' && o.kind === 'kit' && def.layer === o.layer && dd < 0.9 && (p.r % 4 === rot % 4)) return false;
      if (def.kind !== o.kind && dd < 1.0 && def.kind !== 'flat' && o.kind !== 'flat') return false;
      continue;
    }
    if (dd < (def.kind === 'flat' || o.kind === 'flat' ? 0.55 : Math.max(0.9, (footprint(id) + footprint(p.id)) * 0.55))) return false;
  }
  return true;
}
export function initDecor(pl) {
  player = pl; scene = window.__game.scene; fx = getFX(scene);
  for (const d of state.decor) if (DECOR_BY_ID[d.id]) spawn(d);
  ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7dffb0', transparent: true, opacity: 0.95, depthWrite: false, depthTest: false })); ring.visible = false; ring.renderOrder = 11; scene.add(ring);
  beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7, 8), new THREE.MeshBasicMaterial({ color: '#7dffb0', transparent: true, opacity: 0.55, depthWrite: false, depthTest: false })); beam.visible = false; beam.renderOrder = 11; scene.add(beam);
  checkCharm();
}
export function tickDecor(dt, t) {
  for (const p of placed) if (p.m.userData.spin) p.m.userData.spin.rotation.z += dt * 0.8;
  if (!mode) return;
  const pos = player.mesh.position, ry = player.mesh.rotation.y, def = DECOR_BY_ID[mode.id];
  const [x, z] = snapPos(pos.x + Math.sin(ry) * 3.2, pos.z + Math.cos(ry) * 3.2, mode.id, mode.rot);
  const y = baseY(x, z, def.kind === 'kit') + (def.elev || 0), ok = validAt(x, z, mode.id, mode.rot);
  ghost.position.set(x, Math.max(y, 0), z); ghost.rotation.y = mode.rot * Math.PI / 4; ghost.userData.spin?.rotateZ(dt);
  const gy = Math.max(baseY(x, z, false), 0), col = ok ? '#7dffb0' : '#ff7a7a', fp = footprint(mode.id) * (def.kind === 'kit' ? 1 : (SIZES[mode.s] ?? 1));
  ring.position.set(x, gy + 0.08, z); ring.material.color.set(col); ring.scale.setScalar(fp * (1 + Math.sin(t * 6) * 0.04));
  beam.position.set(x, gy + 3.5, z); beam.material.color.set(col);
  mode.pos = { x, z }; mode.ok = ok;
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
    const p = state.decor[mode.moving]; Object.assign(p, { x, z, r: mode.rot, s: mode.s, v: mode.v });
    scene.remove(placed[mode.moving].m); const m = makeMesh(id, false, mode.s, mode.v); placeMesh(m, p); scene.add(m); placed[mode.moving].m = m;
  } else {
    if (!(state.decorInv[id] > 0)) return false;
    state.decorInv[id]--; const d = { id, x, z, r: mode.rot, s: mode.s, v: mode.v }; state.decor.push(d); spawn(d);
    emit('place', { id }); emit('inventory');
    if (!state.placedTypes[id]) { state.placedTypes[id] = 1; addPetals(5); emit('toast', { icon: '✨', text: `First ${DECOR_BY_ID[id].name} placed! +5 🌸`, kind: 'win' }); }
  }
  const y = baseY(x, z, false);
  fx.burst(new THREE.Vector3(x, y + 0.6, z), '#fff6a8', quiet ? 6 : 18); if (!quiet) fx.hearts(new THREE.Vector3(x, y + 1.4, z), 3);
  emit('sfx', { name: 'place' }); saveSoon(); checkCharm(); return true;
}
export function confirmPlacing() {
  if (!mode) return false;
  if (!mode.ok) { emit('toast', { icon: '🚫', text: 'You cannot place that here. Find a clear spot on dry land.', kind: 'info' }); emit('sfx', { name: 'nope' }); return false; }
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
  state.decorInv[d.id] = (state.decorInv[d.id] || 0) + 1; emit('inventory'); saveSoon(); checkCharm();
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
