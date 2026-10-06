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
function plush(sp) { const c = PLUSH_COLORS[sp]; return { solid: [sph(0.42, 0, 0.42, 0, c, [1, 0.9, 1]), sph(0.3, 0, 0.95, 0, c), sph(0.11, -0.2, 1.2, 0, c, [1, 1.5, 0.7]), sph(0.11, 0.2, 1.2, 0, c, [1, 1.5, 0.7]), sph(0.045, -0.1, 0.98, 0.27, '#2a1d2e'), sph(0.045, 0.1, 0.98, 0.27, '#2a1d2e'), sph(0.07, 0, 0.9, 0.29, '#ffd1dc', [1, 0.6, 0.5]), sph(0.1, 0, 0.5, -0.4, '#ffffff')] }; }

const SCALE = { d_house: 1.6, d_windmill: 1.6, d_lantern: 1.5, d_well: 1.3, d_arch: 1.3, d_sapling: 1.3, d_mushlamp: 1.4, d_bridge: 1.25, d_flowerbed: 1.2, d_bench: 1.2, d_sign: 1.25 };
const vcMat = () => toon('#ffffff', { vc: true, rimTint: true });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const templates = new Map();
function template(id) {
  if (templates.has(id)) return templates.get(id);
  const b = DECOR_BY_ID[id].species ? plush(DECOR_BY_ID[id].species) : B[id]();
  const t = { solid: mergeColored(b.solid), glow: b.glow && mergeColored(b.glow), spin: b.spin && { origin: b.spin.origin, geo: mergeColored(b.spin.parts) } };
  templates.set(id, t); return t;
}
function makeMesh(id, ghost = false) {
  const t = template(id), g = new THREE.Group();
  const m = new THREE.Mesh(t.solid, ghost ? new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.65, depthWrite: false }) : vcMat());
  m.castShadow = !ghost; if (!ghost) outline(m, 0.018, '#3b2a3a'); g.add(m);
  if (t.glow) g.add(new THREE.Mesh(t.glow, glowMat));
  g.scale.setScalar(SCALE[id] || 1.15);
  if (t.spin) { const s = new THREE.Group(); s.position.set(...t.spin.origin); const sm = new THREE.Mesh(t.spin.geo, ghost ? m.material : vcMat()); s.add(sm); g.add(s); g.userData.spin = s; }
  return g;
}

// ---------- world state ----------
let scene, player, placed = [], ghost = null, ring = null, mode = null, fx; // mode: { id, rot, moving:index|null }
const LIMIT = 150, snap = v => Math.round(v);
export const charm = () => state.decor.reduce((a, d) => a + (DECOR_BY_ID[d.id]?.charm || 0), 0);
export const decorCount = () => state.decor.length;
export const isPlacing = () => !!mode;

function spawn(d) {
  const m = makeMesh(d.id); m.position.set(d.x, heightAt(d.x, d.z), d.z); m.rotation.y = d.r * Math.PI / 4; scene.add(m);
  if (DECOR_BY_ID[d.id].kind !== 'flat') m.position.y -= 0.02; // sit slightly in the ground
  placed.push({ d, m }); return m;
}
function validAt(x, z, id) {
  const h = heightAt(x, z); if (h < 0.8) return false;
  const kind = DECOR_BY_ID[id].kind;
  for (const p of state.decor) { if (mode?.moving != null && state.decor[mode.moving] === p) continue; const dd = Math.hypot(p.x - x, p.z - z); if (dd < (kind === 'flat' || DECOR_BY_ID[p.id].kind === 'flat' ? 0.6 : 1.05)) return false; }
  if (state.decor.length >= LIMIT && mode?.moving == null) return false;
  return true;
}
export function initDecor(pl) {
  player = pl; scene = window.__game.scene; fx = getFX(scene);
  for (const d of state.decor) if (DECOR_BY_ID[d.id]) spawn(d);
  ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7dffb0', transparent: true, opacity: 0.9, depthWrite: false })); ring.visible = false; ring.renderOrder = 5; scene.add(ring);
  checkCharm(true);
}
export function tickDecor(dt, t) {
  for (const p of placed) if (p.m.userData.spin) p.m.userData.spin.rotation.z += dt * 0.8;
  if (!mode) return;
  const pos = player.mesh.position, ry = player.mesh.rotation.y;
  const x = snap(pos.x + Math.sin(ry) * 3.2), z = snap(pos.z + Math.cos(ry) * 3.2), y = heightAt(x, z);
  const ok = validAt(x, z, mode.id);
  ghost.position.set(x, Math.max(y, 0), z); ghost.rotation.y = mode.rot * Math.PI / 4; ghost.userData.spin?.rotateZ(dt);
  ring.position.set(x, Math.max(y, 0) + 0.06, z); ring.material.color.set(ok ? '#7dffb0' : '#ff7a7a'); ring.scale.setScalar(1 + Math.sin(t * 6) * 0.05);
  mode.pos = { x, z }; mode.ok = ok;
}
export function startPlacing(id, movingIndex = null) {
  if (mode) cancelPlacing(true);
  mode = { id, rot: movingIndex != null ? state.decor[movingIndex].r : 0, moving: movingIndex };
  ghost = makeMesh(id, true); scene.add(ghost); ring.visible = true;
  if (movingIndex != null) { const p = placed[movingIndex]; p.m.visible = false; fx.burst(p.m.position.clone().setY(p.m.position.y + 0.8), '#fff6a8', 12); }
  emit('placing', { on: true, id, moving: movingIndex != null });
}
export function rotatePlacing() { if (mode) { mode.rot = (mode.rot + 1) % 8; emit('sfx', { name: 'click' }); } }
function endMode() { if (ghost) { scene.remove(ghost); ghost = null; } if (ring) ring.visible = false; mode = null; emit('placing', { on: false }); }
export function cancelPlacing(silent) {
  if (!mode) return;
  if (mode.moving != null) placed[mode.moving].m.visible = true; // put it back
  endMode();
}
export function confirmPlacing() {
  if (!mode) return false;
  if (!mode.ok) { emit('toast', { icon: '🚫', text: 'You cannot place that here. Find a clear spot on dry land.', kind: 'info' }); emit('sfx', { name: 'nope' }); return false; }
  const { x, z } = mode.pos, id = mode.id;
  if (mode.moving != null) {
    const p = state.decor[mode.moving]; p.x = x; p.z = z; p.r = mode.rot;
    const pm = placed[mode.moving].m; pm.position.set(x, heightAt(x, z) - (DECOR_BY_ID[id].kind !== 'flat' ? 0.02 : 0), z); pm.rotation.y = mode.rot * Math.PI / 4; pm.visible = true;
  } else {
    if (!(state.decorInv[id] > 0)) { endMode(); return false; }
    state.decorInv[id]--; const d = { id, x, z, r: mode.rot }; state.decor.push(d); spawn(d);
    emit('place', { id }); emit('inventory');
    state.placedTypes = state.placedTypes || {}; if (!state.placedTypes[id]) { state.placedTypes[id] = 1; addPetals(5); emit('toast', { icon: '✨', text: `First ${DECOR_BY_ID[id].name} placed! +5 🌸`, kind: 'win' }); }
  }
  fx.burst(new THREE.Vector3(x, heightAt(x, z) + 0.5, z), '#fff6a8', 14); fx.hearts(new THREE.Vector3(x, heightAt(x, z) + 1, z), 2);
  emit('sfx', { name: 'place' }); saveSoon(); checkCharm();
  const again = state.decorInv[id] > 0 && mode.moving == null;
  endMode(); if (again) startPlacing(id);
  return true;
}
// Store the piece under the player's feet (nearest within 2.6) back in the inventory.
export function nearestDecor(pos, r = 2.6) {
  let bi = -1, bd = r;
  state.decor.forEach((d, i) => { const dd = Math.hypot(d.x - pos.x, d.z - pos.z); if (dd < bd) { bd = dd; bi = i; } });
  return bi;
}
export function moveDecor(i) { if (i >= 0) startPlacing(state.decor[i].id, i); }
export function storeMoving() {
  if (!mode || mode.moving == null) return;
  const i = mode.moving, d = state.decor[i]; scene.remove(placed[i].m); placed.splice(i, 1); state.decor.splice(i, 1);
  state.decorInv[d.id] = (state.decorInv[d.id] || 0) + 1; endMode(); emit('inventory'); saveSoon(); checkCharm(true);
}
export function buyDecor(id) {
  const d = DECOR_BY_ID[id]; if (!d || d.gift) return false;
  if (state.petals < d.price) return false;
  addPetals(-d.price); state.decorInv[id] = (state.decorInv[id] || 0) + 1; emit('purchase', { id, price: d.price, decor: true }); emit('decorbuy', { id }); emit('inventory'); saveSoon(); return true;
}
export function storeIndex(i) {
  if (i < 0 || i >= state.decor.length) return;
  const d = state.decor[i]; fx.burst(placed[i].m.position.clone().setY(placed[i].m.position.y + 0.8), '#fff6a8', 12); scene.remove(placed[i].m); placed.splice(i, 1); state.decor.splice(i, 1);
  state.decorInv[d.id] = (state.decorInv[d.id] || 0) + 1; emit('inventory'); saveSoon(); checkCharm(true);
}
export function giveDecor(id) { state.decorInv[id] = (state.decorInv[id] || 0) + 1; emit('inventory'); saveSoon(); }
function checkCharm(silent) {
  const c = charm(); emit('charm', { charm: c });
  for (const m of CHARM_MS) {
    if (c < m.at || state.charmMs[m.at]) continue;
    state.charmMs[m.at] = 1; if (silent && false) continue;
    addPetals(m.petals); if (m.item && !state.owned.includes(m.item)) state.owned.push(m.item);
    const it = m.item && WARDROBE.find(w => w.id === m.item);
    emit('toast', { icon: '🏡', text: `Island Charm ${m.at}: ${m.text}! +${m.petals} 🌸${it ? ` · ${it.icon} ${it.name}` : ''}`, kind: 'win' });
  }
  saveSoon();
}
export function nextCharm() { return CHARM_MS.find(m => !state.charmMs[m.at]); }
