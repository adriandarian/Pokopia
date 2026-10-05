// Applies wardrobe choices to the hero via player.setOutfit(...) plus extras the hero rig lacks
// (party/cat/wizard/halo hats, cheek stickers, movement trails).
import * as THREE from 'three';
import { state } from './state.js';
import { WARDROBE } from './data.js';
import { on } from './events.js';
import { getFX } from '../chars/fx.js';

let player, extraHat, stickers = [], fx, trailT = 0, rainbow = 0;
const item = id => WARDROBE.find(w => w.id === id);
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, ...o });

function buildHat(id) {
  const g = new THREE.Group();
  const add = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  switch (id) {
    case 'hat_party': { const c = add(new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 16), std('#ff7ac8')), 0, 0.15); c.rotation.z = 0.12; add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), std('#fff27a')), 0.05, 0.6); break; }
    case 'hat_cat': for (const s of [-1, 1]) { const e = add(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 4), std('#555')), s * 0.34, 0.08); e.rotation.z = -s * 0.3; add(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 4), std('#ff9ecb')), s * 0.34, 0.06, 0.06).rotation.z = -s * 0.3; } break;
    case 'hat_wizard': add(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.05, 24), std('#5a3fb0')), 0, -0.08); const c = add(new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 16), std('#6d4fd0')), 0, 0.4); c.rotation.z = -0.1; add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), std('#ffe066', { emissive: '#ffcc00', emissiveIntensity: 0.6 })), 0.04, 0.4, 0.4); break;
    case 'hat_halo': { const t = add(new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 8, 28), std('#ffe066', { emissive: '#ffcc33', emissiveIntensity: 0.9 })), 0, 0.35); t.rotation.x = Math.PI / 2; break; }
    default: return null;
  }
  return g;
}

const stickerTex = {};
function stickerTexture(kind) {
  if (stickerTex[kind]) return stickerTex[kind];
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.translate(32, 32);
  if (kind === 'blush') { const gr = g.createRadialGradient(0, 0, 2, 0, 0, 30); gr.addColorStop(0, 'rgba(255,90,130,.85)'); gr.addColorStop(1, 'rgba(255,90,130,0)'); g.fillStyle = gr; g.fillRect(-32, -32, 64, 64); }
  if (kind === 'freckle') { g.fillStyle = '#b8684a'; for (const [x, y] of [[-12, -4], [0, 6], [10, -8], [-4, -14], [14, 8], [-16, 10]]) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); } }
  if (kind === 'heart') { g.fillStyle = '#ff3d7f'; g.beginPath(); g.moveTo(0, 22); g.bezierCurveTo(-34, -4, -20, -26, 0, -10); g.bezierCurveTo(20, -26, 34, -4, 0, 22); g.fill(); }
  if (kind === 'star') { g.fillStyle = '#ffc800'; g.strokeStyle = '#ff9a00'; g.lineWidth = 3; g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 11 : 26, a = i * Math.PI / 5; g.lineTo(Math.sin(a) * r, -Math.cos(a) * r); } g.closePath(); g.fill(); g.stroke(); }
  if (kind === 'flower') { g.fillStyle = '#fff'; for (let i = 0; i < 6; i++) { g.save(); g.rotate(i * Math.PI / 3); g.beginPath(); g.ellipse(0, -15, 8, 13, 0, 0, 7); g.fill(); g.restore(); } g.fillStyle = '#ffcf33'; g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (stickerTex[kind] = t);
}

export function applyCosmetics() {
  if (!player) return;
  const e = state.equipped, hat = item(e.hat), shirt = item(e.shirt), hair = item(e.hair), pack = item(e.pack), st = item(e.sticker);
  const hero = player.hero, head = hero?.head || player.mesh;
  const o = { hat: hat?.hero || 'none' };
  if (shirt?.value) o.shirt = shirt.value;
  if (hair?.value) o.hair = hair.value;
  if (pack) { o.backpack = !!pack.value; if (pack.value) o.pack = pack.value; }
  try { player.setOutfit(o); } catch (err) { console.warn('setOutfit failed', err); }
  if (extraHat) { extraHat.parent?.remove(extraHat); extraHat = null; }
  const custom = hat && !hat.hero ? buildHat(hat.id) : null;
  if (custom) { custom.position.y = hero?.head ? 1.05 : 2.35; head.add(custom); extraHat = custom; }
  for (const s of stickers) s.parent?.remove(s); stickers = [];
  if (st?.kind && hero?.head) {
    for (const sx of st.kind === 'blush' || st.kind === 'freckle' || st.kind === 'heart' || st.kind === 'star' || st.kind === 'flower' ? [-1, 1] : []) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: stickerTexture(st.kind), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.position.set(sx * 0.37, 0.4, 0.54); m.rotation.y = sx * 0.62; m.renderOrder = 3; head.add(m); stickers.push(m);
    }
  }
}

const TR = {
  sparkle: { c: ['#fff6c0', '#ffe27a', '#ffffff'], fn: 'twinkle' }, leaf: { c: ['#7ed957', '#a8e86b', '#5fbf4a'], fn: 'burst' },
  petal: { c: ['#ffb7d5', '#ff8fbd', '#ffd6e8'], fn: 'burst' }, star: { c: ['#ffd23f', '#fff08a'], fn: 'twinkle' }, heart: { c: ['#ff6a9a'], fn: 'hearts' },
  rainbow: { c: null, fn: 'twinkle' },
};
export function tickTrail(dt) {
  if (!player || !fx) return;
  const it = item(state.equipped.trail); const tr = it?.trail && TR[it.trail]; if (!tr) return;
  if (player.speed < 1) return;
  trailT -= dt; if (trailT > 0) return; trailT = 0.07;
  const p = player.mesh.position.clone(); p.x += (Math.random() - 0.5) * 0.5; p.z += (Math.random() - 0.5) * 0.5; p.y += 0.25 + Math.random() * 0.5;
  let col;
  if (tr.c) col = tr.c[Math.floor(Math.random() * tr.c.length)]; else { rainbow = (rainbow + 0.07) % 1; col = '#' + new THREE.Color().setHSL(rainbow, 0.95, 0.65).getHexString(); }
  if (tr.fn === 'hearts') fx.hearts(p, 1, col); else if (tr.fn === 'burst') fx.burst(p, col, 2); else fx.twinkle(p, col);
}
export function initCosmetics(pl) {
  player = pl; fx = getFX(window.__game?.scene);
  applyCosmetics(); on('equip', applyCosmetics);
  setTimeout(applyCosmetics, 300); // in case hero finished building after us
}
