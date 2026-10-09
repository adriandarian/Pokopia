// First-run guided objective with a floating arrow that points at the next thing to do.
import * as THREE from 'three';
import { heightAt } from '../terrain.js';
import { state, saveSoon } from './state.js';
import { on, emit } from './events.js';
import { WARDROBE, SPECIES } from './data.js';
import { eventFor } from './content.js';
import { activeWishText, hangSpot } from './friends.js';
import { shared } from './shared.js';
import { isTouchDevice } from './touch.js';

const v = new THREE.Vector3();
let objEl, arrowEl, api;
const STEPS = [
  { text: 'Collect your first gem!', sub: 'Walk into a sparkly gem. Gems turn into petals 🌸', target: 'gem' },
  { text: 'You earned petals 🌸!', sub: 'Spend them in the wardrobe 👒. Now find a creature and say hi!', target: 'creature' },
  { text: 'Make a friend!', get sub() { return `Pick up berries 🍓, then ${isTouchDevice() ? 'tap Give' : 'press E'} next to a creature. Favourites help most. Friendship grows slowly, over several days.`; }, target: 'berry' },
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
  for (const ev of ['place', 'gift', 'quest:claimed', 'inventory', 'equip', 'purchase']) on(ev, () => setTimeout(recheck, 50));
  on('ui:open', () => arrowEl.classList.add('hidden'));
  on('discover', () => { if (state.tutorial === 1) advance(2); });
}
function advance(n) {
  if (state.tutorial >= n) return; state.tutorial = n; saveSoon();
  if (n === 1) emit('toast', { icon: '🌸', text: 'Petals are your treasure! Spend them in the wardrobe.', kind: 'good' });
  paintObjective();
}
let nextIdx = 0, hideT = 0, curHint = '';
// drop a visible hint as soon as its reason is gone (e.g. you just placed the decor / gave the gift)
function recheck() { if (!objEl || !objEl.classList.contains('next') || objEl.classList.contains('hidden')) return; const keep = suggestions().some(x => x[0] === curHint); if (!keep) objEl.classList.add('hidden'); }
const HINT_GAP = 10 * 60 * 1000;
function suggestions() {
  const L = [], n = k => Object.entries(state.inv).filter(([x]) => x.startsWith(k + ':')).reduce((a, [, v]) => a + v, 0);
  if (state.quests?.some(q => q.done && !q.claimed)) L.push(['⭐ Quest reward ready!', 'Open the quest list and claim your petals.']);
  const w = activeWishText(); if (w) L.push([`🌟 ${w.sp} has a wish`, w.text]);
  if (n('berry') + n('gem') > 0) L.push(['🎁 You have gifts to give', 'Walk up to a creature and ' + (isTouchDevice() ? 'tap Give' : 'press E') + '. Everyone has favourites!']);
  const aff = WARDROBE.filter(x => !state.owned.includes(x.id) && !x.gift && x.price <= state.petals).sort((a, b) => b.price - a.price)[0];
  if (aff) L.push([`👒 You can afford ${aff.icon} ${aff.name}!`, 'Try it on in the wardrobe.']);
  const dinv = Object.values(state.decorInv || {}).reduce((a, b) => a + b, 0);
  if (dinv) L.push(['🏡 Decorations ready to place', 'Open the island menu and tap Place.']); else if (state.petals >= 40) L.push(['🏡 Decorate your island', 'Buy a lantern or bench, then place it near home.']);
  const left = SPECIES.filter(x => !state.discovered[x.id]).length; if (left) L.push([`🔍 ${left} creature${left > 1 ? 's' : ''} still to discover`, 'Explore new corners of the island.']);
  const ev = eventFor(state.day); L.push([`${ev.icon} ${ev.name}`, ev.blurb]);
  L.push(['💎 Collect gems and berries', 'Yellow gems are worth the most petals!']);
  // do not nag: each hint at most once per 10 minutes (persisted), always keep the fallback entries
  const now = Date.now(), seen = state.hints || (state.hints = {});
  const fresh = L.filter((x, i) => i >= L.length - 3 || !seen[x[0]] || now - seen[x[0]] > HINT_GAP);
  return fresh;
}
function paintObjective() {
  const s = STEPS[state.tutorial];
  if (!s) {
    const L = suggestions(), [t, sub] = L[nextIdx++ % L.length]; (state.hints || (state.hints = {}))[t] = Date.now(); curHint = t;
    objEl.innerHTML = `<b>${t}</b><small>${sub}</small>`; objEl.classList.remove('hidden'); objEl.classList.add('next'); arrowEl.classList.add('hidden'); clearTimeout(hideT); hideT = setTimeout(() => { if (!STEPS[state.tutorial]) objEl.classList.add('hidden'); }, 6000); return;
  }
  objEl.classList.remove('next');
  objEl.innerHTML = `<b>🎯 ${s.text}</b><small>${s.sub}</small>`; objEl.classList.remove('hidden');
}
setInterval(() => { if (document.body.classList.contains('playing') && !STEPS[state.tutorial]) paintObjective(); }, 20000);
function dot(id, on) { const b = document.getElementById(id); if (b) b.classList.toggle('dotted', !!on); }
setInterval(() => {
  if (!document.body.classList.contains('playing')) return;
  dot('b-decor', Object.values(state.decorInv || {}).some(n => n > 0));
  dot('b-journal', !!activeWishText());
  dot('b-shop', WARDROBE.some(x => !state.owned.includes(x.id) && !x.gift && x.price > 0 && x.price <= state.petals));
}, 2500);

function nearest(list, pos, pred) {
  let best = null, bd = 1e9;
  for (const o of list) { if (pred && !pred(o)) continue; const p = o.position || o.m?.position; const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2; if (d < bd) { bd = d; best = p; } }
  return best && { pos: best, d: Math.sqrt(bd) };
}
export function updateGuide() {
  if (!arrowEl) return;
  const hs = hangSpot(); let sr = null;
  if (!STEPS[state.tutorial] && shared.revealed.size) { let bd = 1e9; for (const it of shared.revealed) { if (!api.collect.items.includes(it)) continue; const d = Math.hypot(it.position.x - api.player.mesh.position.x, it.position.z - api.player.mesh.position.z); if (d < bd) { bd = d; sr = it; } } }
  const s = STEPS[state.tutorial] || (hs ? { target: 'hang' } : sr ? { target: 'sense' } : null);
  if (!s || document.getElementById('overlay') || !document.body.classList.contains('playing')) { arrowEl.classList.add('hidden'); return; }
  const pp = api.player.mesh.position; let tgt = null;
  if (s.target === 'gem') tgt = nearest(api.collect.items, pp, g => g.userData.ty.kind === 'gem');
  else if (s.target === 'sense') tgt = { pos: sr.position, d: Math.hypot(sr.position.x - pp.x, sr.position.z - pp.z) };
  else if (s.target === 'hang') tgt = { pos: new THREE.Vector3(hs.x, heightAt(hs.x, hs.z), hs.z), d: Math.hypot(hs.x - pp.x, hs.z - pp.z) };
  else if (s.target === 'creature') tgt = nearest(api.creatures.list, pp, c => !c.friend);
  else if (s.target === 'berry') tgt = (state.inv && Object.keys(state.inv).some(k => k.startsWith('berry:') && state.inv[k] > 0)) ? nearest(api.creatures.list, pp, c => !c.friend) : nearest(api.collect.items, pp, g => g.userData.ty.kind === 'berry');
  if (!tgt || tgt.d < 2.2) { arrowEl.classList.add('hidden'); return; }
  v.copy(tgt.pos); v.y += 1.6; v.project(api.camera);
  const W = innerWidth, H = innerHeight; let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
  const behind = v.z > 1; if (behind) { x = W - x; y = H; }
  const m = 70, onscreen = !behind && x > m && x < W - m && y > 130 && y < H - 230;
  const cx = W / 2, cy = (130 + H - 230) / 2; let ang = 0;
  if (onscreen) { ang = 180; y -= 34; } // bouncing marker above target
  else {
    const dx = x - cx, dy = y - cy, k = Math.min((W / 2 - m) / Math.abs(dx || 1e-3), ((H - 360) / 2) / Math.abs(dy || 1e-3));
    x = cx + dx * k; y = cy + dy * k; ang = Math.atan2(dy, dx) * 180 / Math.PI + 90;
  }
  if (W > 700 && x < 310 && y < 380) x = 320; // keep clear of the left HUD stack
  arrowEl.classList.remove('hidden'); arrowEl.classList.toggle('onscreen', onscreen);
  arrowEl.style.transform = `translate(${x}px,${y}px)`;
  arrowEl.firstChild.style.transform = `rotate(${ang}deg)`;
  arrowEl.lastChild.textContent = `${Math.round(tgt.d)}m`;
}
