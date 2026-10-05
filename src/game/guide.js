// First-run guided objective with a floating arrow that points at the next thing to do.
import * as THREE from 'three';
import { state, saveSoon } from './state.js';
import { on, emit } from './events.js';

const v = new THREE.Vector3();
let objEl, arrowEl, api;
const STEPS = [
  { text: 'Collect your first gem!', sub: 'Walk into a sparkly gem. Gems turn into petals 🌸', target: 'gem' },
  { text: 'You earned petals 🌸!', sub: 'Spend them in the wardrobe 👒. Now find a creature and say hi!', target: 'creature' },
  { text: 'Make a friend!', sub: 'Pick a berry 🍓, then press E (or tap Give) next to a creature. Its favourite colour makes friends instantly!', target: 'berry' },
];
export function startGuide(a) {
  api = a;
  objEl = document.createElement('div'); objEl.id = 'objective'; objEl.className = 'hidden';
  arrowEl = document.createElement('div'); arrowEl.id = 'arrow'; arrowEl.className = 'hidden'; arrowEl.innerHTML = '<div class="tip"></div><span></span>';
  const r = document.getElementById('ui-root'); r.appendChild(objEl); r.appendChild(arrowEl);
  on('collect', () => { if (state.tutorial === 0) advance(1); });
  on('befriend', () => { if (state.tutorial < 3) advance(3); });
  on('gift', () => { if (state.tutorial < 3) advance(3); });
  on('play', () => setTimeout(() => paintObjective(), 900));
  on('ui:open', () => arrowEl.classList.add('hidden'));
  on('discover', () => { if (state.tutorial === 1) advance(2); });
}
function advance(n) {
  if (state.tutorial >= n) return; state.tutorial = n; saveSoon();
  if (n === 1) emit('toast', { icon: '🌸', text: 'Petals are your treasure! Spend them in the wardrobe.', kind: 'good' });
  paintObjective();
}
function paintObjective() {
  const s = STEPS[state.tutorial];
  if (!s) { objEl.classList.add('hidden'); arrowEl.classList.add('hidden'); return; }
  objEl.innerHTML = `<b>🎯 ${s.text}</b><small>${s.sub}</small>`; objEl.classList.remove('hidden');
}
function nearest(list, pos, pred) {
  let best = null, bd = 1e9;
  for (const o of list) { if (pred && !pred(o)) continue; const p = o.position || o.m?.position; const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2; if (d < bd) { bd = d; best = p; } }
  return best && { pos: best, d: Math.sqrt(bd) };
}
export function updateGuide() {
  if (!arrowEl) return;
  const s = STEPS[state.tutorial];
  if (!s || document.getElementById('overlay') || !document.body.classList.contains('playing')) { arrowEl.classList.add('hidden'); return; }
  const pp = api.player.mesh.position; let tgt = null;
  if (s.target === 'gem') tgt = nearest(api.collect.items, pp, g => g.userData.ty.kind === 'gem');
  else if (s.target === 'creature') tgt = nearest(api.creatures.list, pp, c => !c.friend);
  else if (s.target === 'berry') tgt = (state.inv && Object.keys(state.inv).some(k => k.startsWith('berry:') && state.inv[k] > 0)) ? nearest(api.creatures.list, pp, c => !c.friend) : nearest(api.collect.items, pp, g => g.userData.ty.kind === 'berry');
  if (!tgt || tgt.d < 2.2) { arrowEl.classList.add('hidden'); return; }
  v.copy(tgt.pos); v.y += 1.6; v.project(api.camera);
  const W = innerWidth, H = innerHeight; let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
  const behind = v.z > 1; if (behind) { x = W - x; y = H; }
  const m = 70, onscreen = !behind && x > m && x < W - m && y > m && y < H - m * 1.8;
  const cx = W / 2, cy = H / 2; let ang = 0;
  if (onscreen) { ang = 180; y -= 34; } // bouncing marker above target
  else {
    const dx = x - cx, dy = y - cy, k = Math.min((W / 2 - m) / Math.abs(dx || 1e-3), (H / 2 - m * 1.6) / Math.abs(dy || 1e-3));
    x = cx + dx * k; y = cy + dy * k; ang = Math.atan2(dy, dx) * 180 / Math.PI + 90;
  }
  arrowEl.classList.remove('hidden'); arrowEl.classList.toggle('onscreen', onscreen);
  arrowEl.style.transform = `translate(${x}px,${y}px)`;
  arrowEl.firstChild.style.transform = `rotate(${ang}deg)`;
  arrowEl.lastChild.textContent = `${Math.round(tgt.d)}m`;
}
