// Relationships: friendship points per species, levels with rewards, wishes, speech bubbles, gift-backs.
// creature.friend is still owned by creatures.js; we gate its auto-friend by clamping c.affinity until the
// species has earned enough friendship points (so befriending is an arc, not a single gift).
import * as THREE from 'three';
import { state, addPetals, saveSoon } from './state.js';
import { BY_ID, WARDROBE, COLOR_ICON } from './data.js';
import { LEVEL_AT, LEVEL_NAME, MAX_LEVEL, levelOf, WISHES, LINES, tierOf, eventFor } from './content.js';
import { on, emit } from './events.js';
import { getFX } from '../chars/fx.js';
import { giveDecor } from './decor.js';

const v = new THREE.Vector3();
let api, fx, bubbleEl, bubble = null, nearCreature = null;
export const speciesOf = c => c.sp?.name || 'Puffle';
export const ptsOf = sp => state.rel[sp] || 0;
export const lvlOf = sp => levelOf(ptsOf(sp));
export const nextAt = sp => LEVEL_AT[Math.min(MAX_LEVEL, lvlOf(sp) + 1)];
const cuddle = () => eventFor(state.day).id === 'cuddle';
const d = () => state.daily;
const inc = (bag, sp, n = 1) => { bag[sp] = (bag[sp] || 0) + n; return bag[sp]; };

export function wishOf(sp) {
  const pool = WISHES[sp]; if (!pool) return null;
  const s = state.wish[sp] || (state.wish[sp] = { i: (sp.length * 7 + state.day) % pool.length, p: 0 });
  return { ...pool[s.i % pool.length], p: s.p, i: s.i };
}
export function bubbleSay(c, text, ttl = 3.6, voice = true) {
  bubble = { c, t: ttl }; bubbleEl.textContent = text; bubbleEl.classList.remove('hidden'); bubbleEl.classList.remove('pop'); void bubbleEl.offsetWidth; bubbleEl.classList.add('pop');
  if (voice) emit('voice', { species: speciesOf(c) });
}
// Add friendship points. May befriend (release the creature) and level up.
export function addPoints(c, n, why) {
  const sp = speciesOf(c), before = lvlOf(sp); n *= cuddle() ? 1.5 : 1;
  state.rel[sp] = ptsOf(sp) + n; const after = lvlOf(sp);
  if (!c.friend && after >= 1) release(c);
  for (let l = before + 1; l <= after; l++) if (l >= 2) levelReward(c, sp, l);
  saveSoon(); emit('rel', { species: sp, points: state.rel[sp], why });
}
function release(c) { c._release = true; if (c.setFriend) c.setFriend(true); else c.affinity = 3; }
function levelReward(c, sp, l) {
  const fav = BY_ID[sp].fav, petals = [0, 0, 10, 25, 40, 60, 150][l], bits = [];
  addPetals(petals); bits.push(`+${petals} 🌸`);
  const addInv = (k, n) => { state.inv[k] = (state.inv[k] || 0) + n; };
  if (l === 2) { addInv(`berry:${fav.berry}`, 2); bits.push(`2 ${COLOR_ICON[fav.berry]}`); }
  if (l === 3) { addInv(`gem:${fav.gem}`, 1); bits.push(`1 ${COLOR_ICON[fav.gem]}`); }
  if (l === 4) { addInv(`gem:${fav.gem}`, 3); bits.push(`3 ${COLOR_ICON[fav.gem]}`); }
  if (l === 5) { giveDecor('d_plush_' + sp); bits.push(`🧸 ${sp} Plushie for your island!`); }
  if (l === 6) { addInv(`gem:${fav.gem}`, 5); bits.push(`5 ${COLOR_ICON[fav.gem]}`); }
  if (l >= 3 && api.creatures.idle) api.creatures.idle(c, 'dance', 4.5);
  fx.hearts(c.m.position.clone().setY(c.m.position.y + (c.top || 1.8)), 8);
  emit('inventory'); emit('levelup', { species: sp, level: l });
  emit('toast', { icon: '💞', text: `${sp}: ${LEVEL_NAME[l]}! ${bits.join(' · ')}`, kind: 'win' });
  bubbleSay(c, LINES[sp][tierOf(l)][0], 4.5);
}

// A gift was given to creature c. Returns { petals, refused }.
export function onGift(c, key, loved) {
  const sp = speciesOf(c), g = d().gifts[sp] || 0;
  if (g >= 6) { bubbleSay(c, 'I am full, thank you! Maybe tomorrow?', 3.2); return { refused: true }; }
  const mult = Math.max(0.2, 1 - 0.2 * g); inc(d().gifts, sp);
  const base = key.startsWith('gem') ? 1.5 : loved ? 5 : 2.5;
  addPoints(c, base * mult, 'gift');
  const w = wishOf(sp);
  if (w && w.type === 'gift' && w.key === key && c.friend) { state.wish[sp].p++; if (state.wish[sp].p >= w.n) completeWish(c); else emit('toast', { icon: '🌟', text: `${sp}'s wish: ${state.wish[sp].p}/${w.n}`, kind: 'info' }); }
  return { petals: Math.round(((loved ? 3 : 1) + (key.startsWith('berry') ? 0 : 0)) * mult), mult };
}
function completeWish(c) {
  const sp = speciesOf(c), pool = WISHES[sp]; state.wish[sp] = { i: (state.wish[sp].i + 1) % pool.length, p: 0 }; state.wishDone++;
  addPetals(15); addPoints(c, 8, 'wish'); fx.hearts(c.m.position.clone().setY(c.m.position.y + (c.top || 1.8)), 6);
  bubbleSay(c, 'Thank you!! You remembered!', 3.6); emit('wish', { species: sp });
  emit('toast', { icon: '🌟', text: `${sp}'s wish came true! +15 🌸`, kind: 'win' }); saveSoon();
}

export function initFriends(a) {
  api = a; fx = getFX(window.__game?.scene);
  bubbleEl = document.createElement('div'); bubbleEl.id = 'bubble'; bubbleEl.className = 'hidden'; document.getElementById('ui-root').appendChild(bubbleEl);
  on('emote', e => {
    const pp = api.player.mesh.position; let best = null, bd = 7;
    for (const c of api.creatures.list) { const p = c.m.position, dd = Math.hypot(p.x - pp.x, p.z - pp.z); if (dd < bd) { bd = dd; best = c; } }
    if (!best) return; const sp = speciesOf(best);
    if (d().emote[sp] == null || d().emote[sp] < 3) { inc(d().emote, sp); addPoints(best, 1, 'emote'); }
    const w = wishOf(sp); if (w && w.type === 'emote' && w.name === e.name && best.friend) completeWish(best);
    else if (best.jy <= 0.01) best.jv = 5;
  });
}
const lastGB = {};
export function tickFriends(dt, now) {
  const list = api.creatures.list, pp = api.player.mesh.position, hatId = WARDROBE.find(w => w.id === state.equipped.hat)?.hero;
  let nc = null, nd = 1e9;
  for (const c of list) {
    const sp = speciesOf(c), p = c.m.position, dist = Math.hypot(p.x - pp.x, p.z - pp.z);
    // gate the auto-friend in creatures.js until friendship points allow it
    if (!c.friend && !c._release && lvlOf(sp) < 1) c.affinity = Math.min(c.affinity, 0.8);
    if (dist < nd) { nd = dist; nc = c; }
    if (dist < 5 && d().visit[sp] == null) { d().visit[sp] = 1; addPoints(c, 3, 'visit'); bubbleSay(c, LINES[sp][tierOf(lvlOf(sp))][0], 3.4); emit('toast', { icon: '👋', text: `Daily hello with ${sp}! +friendship`, kind: 'info' }); }
    if (!c.friend && dist < 4.2) { c._nt = (c._nt || 0) + dt; if (c._nt > 6) { c._nt = 0; if ((d().near[sp] || 0) < 3) { inc(d().near, sp); addPoints(c, 1, 'time'); } } }
    if (c.friend && dist < 6) {
      c._tg = (c._tg || 0) + dt; if (c._tg > 40) { c._tg = 0; if ((d().together[sp] || 0) < 5) { inc(d().together, sp); addPoints(c, 1, 'together'); } }
      const w = wishOf(sp); if (w && w.type === 'hat' && hatId === w.hat) completeWish(c);
      // gift-backs from good friends
      if (lvlOf(sp) >= 3 && (c._gb = (c._gb ?? 60 + Math.random() * 60) - dt) <= 0) {
        c._gb = 90 + Math.random() * 90; const fav = BY_ID[sp].fav, k = Math.random() < 0.5 ? `berry:${fav.berry}` : `gem:${fav.gem}`;
        state.inv[k] = (state.inv[k] || 0) + 1; emit('inventory'); bubbleSay(c, 'I found this for you!', 3.4); emit('toast', { icon: COLOR_ICON[k.split(':')[1]], text: `${sp} gave you a present!`, kind: 'love' }); saveSoon();
      }
    }
  }
  nearCreature = nd < 5.5 ? nc : null;
  // greetings / wish reminders
  if (nearCreature && !bubble) {
    const c = nearCreature, sp = speciesOf(c), cd = c._bc || 0;
    if (now > cd) {
      c._bc = now + 14000 + Math.random() * 10000; const lv = lvlOf(sp), w = c.friend && wishOf(sp), t = LINES[sp][tierOf(lv)];
      if (w && Math.random() < 0.6) bubbleSay(c, `🌟 ${w.text}`, 5); else bubbleSay(c, t[Math.floor(Math.random() * t.length)]);
    }
  }
  // bubble anchoring
  if (bubble) {
    bubble.t -= dt;
    if (bubble.t <= 0) { bubble = null; bubbleEl.classList.add('hidden'); }
    else {
      const p = bubble.c.m.position; v.set(p.x, p.y + (bubble.c.top || 1.8) + 0.5, p.z).project(api.camera);
      if (v.z > 1) bubbleEl.classList.add('hidden');
      else { bubbleEl.classList.remove('hidden'); bubbleEl.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px,${(-v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-100%)`; }
    }
  }
}
export const activeWishText = () => { const f = api.creatures.list.find(c => c.friend && wishOf(speciesOf(c))); if (!f) return null; const w = wishOf(speciesOf(f)); return { sp: speciesOf(f), text: w.text, c: f }; };
