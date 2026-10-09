// Relationships: friendship points per species, levels with rewards, wishes, speech bubbles, gift-backs.
// creature.friend is still owned by creatures.js; we gate its auto-friend by clamping c.affinity until the
// species has earned enough friendship points (so befriending is an arc, not a single gift).
import * as THREE from 'three';
import { state, addPetals, saveSoon, todayStr } from './state.js';
import { heightAt } from '../terrain.js';
import { BY_ID, WARDROBE, COLOR_ICON } from './data.js';
import { LEVEL_AT, LEVEL_DAYS, LEVEL_KINDS, LEVEL_NAME, MAX_LEVEL, levelOf, WISHES, allLines, tierOf, eventFor } from './content.js';
import { on, emit } from './events.js';
import { getFX } from '../chars/fx.js';
import { giveDecor } from './decor.js';

const v = new THREE.Vector3();
let api, fx, bubbleEl, markEl, bubble = null, nearCreature = null, hangT = 0, hangCD = performance.now() + 60000;
export const speciesOf = c => c.sp?.name || 'Puffle';
export const ptsOf = sp => state.rel[sp] || 0;
export const mem = sp => state.mem[sp] || (state.mem[sp] = { days: [], kinds: {}, lv: 0, log: [] });
export const lvlOf = sp => levelOf(ptsOf(sp), mem(sp));
// What is still needed for the next level (for the journal).
export function nextNeeds(sp) {
  const l = lvlOf(sp); if (l >= MAX_LEVEL) return null; const m = mem(sp), n = l + 1;
  return { pts: [ptsOf(sp), LEVEL_AT[n]], days: [m.days.length, LEVEL_DAYS[n]], kinds: [Object.keys(m.kinds).length, LEVEL_KINDS[n]] };
}
export const memo = (sp, text) => { const m = mem(sp); m.log.push({ t: text, d: todayStr() }); if (m.log.length > 14) m.log.shift(); saveSoon(); };
const noteKind = (sp, k) => { const m = mem(sp); m.kinds[k] = (m.kinds[k] || 0) + 1; };
const noteDay = (sp) => { const m = mem(sp), t = todayStr(); if (!m.days.includes(t)) m.days.push(t); };
export const nextAt = sp => LEVEL_AT[Math.min(MAX_LEVEL, lvlOf(sp) + 1)];
export const hangSpot = () => state.hang;
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
// Add friendship points. May befriend (release the creature) and level up (levels also need days + variety).
export function addPoints(c, n, why) {
  const sp = speciesOf(c); n *= cuddle() ? 1.5 : 1;
  state.rel[sp] = ptsOf(sp) + n; if (why && why !== 'time') noteKind(sp, why);
  checkLevel(c, sp); saveSoon(); emit('rel', { species: sp, points: state.rel[sp], why });
}
function checkLevel(c, sp) {
  const m = mem(sp), now = lvlOf(sp);
  if (!c.friend && now >= 1) { release(c); memo(sp, 'Became friends'); }
  for (let l = (m.lv || 0) + 1; l <= now; l++) { m.lv = l; if (l >= 2) { levelReward(c, sp, l); memo(sp, `Became ${LEVEL_NAME[l]}s`); } }
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
  bubbleSay(c, allLines(sp, tierOf(l))[0], 4.5);
}

// A gift was given to creature c. Returns { petals, refused }.
export function onGift(c, key, loved) {
  const sp = speciesOf(c), g = d().gifts[sp] || 0;
  if (g >= 6) { bubbleSay(c, 'I am full, thank you! Maybe tomorrow?', 3.2); return { refused: true }; }
  const mult = Math.max(0.2, 1 - 0.2 * g); inc(d().gifts, sp);
  const base = key.startsWith('gem') ? 1.5 : loved ? 5 : 2.5;
  addPoints(c, base * mult, 'gift'); if (loved && !mem(sp).lovedMemo) { mem(sp).lovedMemo = 1; memo(sp, 'Gave them their favourite'); }
  const w = wishOf(sp);
  if (w && w.type === 'gift' && w.key === key && c.friend) { state.wish[sp].p++; if (state.wish[sp].p >= w.n) completeWish(c); else emit('toast', { icon: '🌟', text: `${sp}'s wish: ${state.wish[sp].p}/${w.n}`, kind: 'info' }); }
  return { petals: Math.round(((loved ? 3 : 1) + (key.startsWith('berry') ? 0 : 0)) * mult), mult };
}
function completeWish(c) {
  const sp = speciesOf(c), pool = WISHES[sp], done = wishOf(sp).text; state.wish[sp] = { i: (state.wish[sp].i + 1) % pool.length, p: 0 }; state.wishDone++; memo(sp, `Granted a wish: ${done}`);
  addPetals(15); addPoints(c, 8, 'wish'); fx.hearts(c.m.position.clone().setY(c.m.position.y + (c.top || 1.8)), 6);
  bubbleSay(c, 'Thank you!! You remembered!', 3.6); emit('wish', { species: sp });
  emit('toast', { icon: '🌟', text: `${sp}'s wish came true! +15 🌸`, kind: 'win' }); saveSoon();
}

export function initFriends(a) {
  api = a; fx = getFX(window.__game?.scene);
  markEl = document.createElement('div'); markEl.id = 'fmark'; markEl.className = 'hidden'; document.getElementById('ui-root').appendChild(markEl);
  bubbleEl = document.createElement('div'); bubbleEl.id = 'bubble'; bubbleEl.className = 'hidden'; document.getElementById('ui-root').appendChild(bubbleEl);
  on('emote', e => {
    const pp = api.player.mesh.position; let best = null, bd = 7;
    for (const c of api.creatures.list) { const p = c.m.position, dd = Math.hypot(p.x - pp.x, p.z - pp.z); if (dd < bd) { bd = dd; best = c; } }
    if (!best) return; const sp = speciesOf(best);
    if (d().emote[sp] == null || d().emote[sp] < 3) { inc(d().emote, sp); addPoints(best, 1, 'emote'); }
    const w = wishOf(sp); if (best.friend && e.name === 'dance' && !mem(sp).danced) { mem(sp).danced = 1; memo(sp, 'Danced together'); }
    if (w && w.type === 'emote' && w.name === e.name && best.friend) completeWish(best);
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
    if (dist < 5 && d().visit[sp] == null) { d().visit[sp] = 1; noteDay(sp); addPoints(c, 3, 'visit'); bubbleSay(c, allLines(sp, tierOf(lvlOf(sp)))[0], 3.4); emit('toast', { icon: '👋', text: `Daily hello with ${sp}! +friendship`, kind: 'info' }); }
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
  // hang-out: a friend invites you to a favourite spot (small reward, no timer pressure; it just fades if ignored)
  if (state.hang) {
    const h = state.hang;
    if (Date.now() - h.t > 300000) state.hang = null;
    else {
      hangT -= dt; if (hangT <= 0) { hangT = 0.3; for (let i = 0; i < 3; i++) fx.twinkle(new THREE.Vector3(h.x + (Math.random() - 0.5) * 0.8, heightAt(h.x, h.z) + 0.3 + i * 0.9 + Math.random() * 0.5, h.z + (Math.random() - 0.5) * 0.8), '#fff3a0'); }
      if (Math.hypot(pp.x - h.x, pp.z - h.z) < 2.6) {
        const c = list.find(x => speciesOf(x) === h.sp && x.friend) || list.find(x => speciesOf(x) === h.sp);
        state.hang = null; addPetals(10); if (c) { addPoints(c, 5, 'hang'); bubbleSay(c, 'You came! This is my favourite place.', 4); } memo(h.sp, 'Hung out at their favourite spot');
        emit('hang', { species: h.sp }); emit('toast', { icon: '🌟', text: `${h.sp} loved hanging out! +10 🌸`, kind: 'win' });
      }
    }
  } else if (now > hangCD) {
    const c = list.find(x => x.friend && lvlOf(speciesOf(x)) >= 2 && Math.hypot(x.m.position.x - pp.x, x.m.position.z - pp.z) < 6);
    if (c) {
      hangCD = now + 150000 + Math.random() * 120000;
      for (let k = 0; k < 12; k++) {
        const a = Math.random() * 6.283, r = 9 + Math.random() * 7, x = c.m.position.x + Math.cos(a) * r, z = c.m.position.z + Math.sin(a) * r, h = heightAt(x, z);
        if (h > 1.3 && h < 9) { state.hang = { sp: speciesOf(c), x, z, t: Date.now() }; bubbleSay(c, 'Come to my favourite spot? Follow the sparkles!', 5); emit('toast', { icon: '✨', text: `${speciesOf(c)} invites you to hang out. Follow the sparkles, no rush!`, kind: 'info' }); saveSoon(); break; }
      }
    }
  }
  // floating marker over the targeted creature (stays visible when bushes hide it)
  if (nearCreature && !document.getElementById('overlay')) {
    const p = nearCreature.m.position; v.set(p.x, p.y + (nearCreature.top || 1.8) + 0.2, p.z).project(api.camera);
    if (v.z < 1) { markEl.classList.remove('hidden'); markEl.textContent = `▼ ${speciesOf(nearCreature)}`; markEl.style.transform = `translate(${Math.min(innerWidth - 70, Math.max(50, (v.x * 0.5 + 0.5) * innerWidth))}px,${Math.max(90, (-v.y * 0.5 + 0.5) * innerHeight)}px) translate(-50%,-100%)`; } else markEl.classList.add('hidden');
  } else markEl.classList.add('hidden');
  // greetings / wish reminders
  if (nearCreature && !bubble) {
    const c = nearCreature, sp = speciesOf(c), cd = c._bc || 0;
    if (now > cd) {
      c._bc = now + 14000 + Math.random() * 10000; const lv = lvlOf(sp), w = c.friend && wishOf(sp), t = allLines(sp, tierOf(lv));
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
      else { bubbleEl.classList.remove('hidden'); const bw = (bubbleEl.offsetWidth || 160) / 2 + 8, bx = Math.min(innerWidth - bw - (innerWidth < 700 ? 64 : 8), Math.max(bw, (v.x * 0.5 + 0.5) * innerWidth)); bubbleEl.style.transform = `translate(${bx}px,${Math.max(110, (-v.y * 0.5 + 0.5) * innerHeight)}px) translate(-50%,-100%)`; }
    }
  }
}
export const activeWishText = () => { const f = api.creatures.list.find(c => c.friend && wishOf(speciesOf(c))); if (!f) return null; const w = wishOf(speciesOf(f)); return { sp: speciesOf(f), text: w.text, c: f }; };
// Saves from before levels needed days/variety: treat existing friends as having met the Friend requirements.
export function grandfather(sp) { const m = mem(sp); if (!m.days.length) m.days.push(todayStr()); if (!Object.keys(m.kinds).length) { m.kinds.visit = 1; m.kinds.gift = 1; } if (!m.lv) m.lv = Math.max(1, Math.min(lvlOf(sp), 1)); state.rel[sp] = Math.max(ptsOf(sp), LEVEL_AT[1]); }

// QA hook: force a hang-out invitation from the nearest friend (or make the nearest creature a friend first).
export function forceHangout() {
  const list = api.creatures.list, pp = api.player.mesh.position;
  const c = [...list].filter(x => x.friend).sort((a, b) => Math.hypot(a.m.position.x - pp.x, a.m.position.z - pp.z) - Math.hypot(b.m.position.x - pp.x, b.m.position.z - pp.z))[0] || list[0];
  for (let k = 0; k < 200; k++) {
    const a = Math.random() * 6.283, r = 8 + Math.random() * 8, x = pp.x + Math.cos(a) * r, z = pp.z + Math.sin(a) * r, h = heightAt(x, z);
    if (h > 1.3) { state.hang = { sp: speciesOf(c), x, z, t: Date.now() }; bubbleSay(c, 'Come to my favourite spot? Follow the sparkles!', 5); emit('toast', { icon: '✨', text: `${speciesOf(c)} invites you to hang out. Follow the sparkles, no rush!`, kind: 'info' }); saveSoon(); return state.hang; }
  }
  return null;
}
if (typeof window !== 'undefined') window.__hangout = () => forceHangout();
