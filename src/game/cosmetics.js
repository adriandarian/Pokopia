// Applies wardrobe choices to the hero via player.setOutfit(...) (all hats are native now), plus cheek stickers
// (attached to hero.faceAnchor), movement trails, and a live 3D preview for the wardrobe panel.
import * as THREE from 'three';
import { state } from './state.js';
import { WARDROBE } from './data.js';
import { on } from './events.js';
import { getFX } from '../chars/fx.js';
import { buildHero } from '../player.js';

let player, fx, trailT = 0, rainbow = 0;
const item = id => WARDROBE.find(w => w.id === id);

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

// Apply an equipped map ({hat,shirt,hair,pack,sticker}) to any hero (the real one or the preview one).
function dress(hero, e, holder) {
  const hat = item(e.hat), shirt = item(e.shirt), hair = item(e.hair), pack = item(e.pack), st = item(e.sticker);
  const o = { hat: hat?.hero || 'none' };
  if (shirt?.value) o.shirt = shirt.value; if (hair?.value) o.hair = hair.value;
  if (pack) { o.backpack = !!pack.value; if (pack.value) o.pack = pack.value; }
  try { hero.setOutfit(o); } catch (err) { console.warn('setOutfit failed', err); }
  for (const s of holder.stickers || []) s.parent?.remove(s); holder.stickers = [];
  const anchor = hero.faceAnchor || hero.head;
  if (st?.kind && anchor) for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: stickerTexture(st.kind), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(sx * 0.37, hero.faceAnchor ? -0.12 : 0.4, hero.faceAnchor ? 0.09 : 0.54); m.rotation.y = sx * 0.62; m.renderOrder = 3; anchor.add(m); holder.stickers.push(m);
  }
}
const live = {};
export function applyCosmetics() { if (player) dress(player.hero, state.equipped, live); }

// ---- live preview (second small renderer) ----
export function makePreview(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); r.setPixelRatio(Math.min(devicePixelRatio, 2));
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  sc.add(new THREE.HemisphereLight('#ffffff', '#b9a6d8', 1.6)); const dl = new THREE.DirectionalLight('#fff4e0', 2.4); dl.position.set(2, 4, 3); sc.add(dl);
  const hero = buildHero(); sc.add(hero); const api = hero.userData.hero, holder = {}; let t = 0, alive = true, spin = true, last = performance.now();
  const resize = () => { const w = canvas.clientWidth || 160, h = canvas.clientHeight || 200; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  const loop = () => {
    if (!alive) return; requestAnimationFrame(loop); const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    resize(); cam.position.set(0, 2.4, 7.6); cam.lookAt(0, 1.75, 0); if (spin) hero.rotation.y = Math.sin(t * 0.8) * 0.9 + 0.3;
    api.update(dt, { speed: 0, grounded: true, vy: 0, landVy: -8, heightAboveGround: 0 }); r.render(sc, cam);
  };
  requestAnimationFrame(loop);
  return { set(e) { dress(api, e, holder); }, emote: n => api.emote?.(n), dispose() { alive = false; r.dispose(); r.forceContextLoss?.(); } };
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
  setTimeout(applyCosmetics, 300);
}
