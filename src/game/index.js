// Game layer entry. initGame({ player, creatures, collect, camera }) wires state, quests, audio, cosmetics, UI.
// creature.friend (set by src/creatures.js) is the single source of truth for friendship; friends.js gates when
// a creature is allowed to become a friend (friendship points per species).
import * as THREE from 'three';
import { state, load, save, saveSoon, addPetals, todayStr } from './state.js';
import { BY_ID, SPECIES, BERRY_COLORS, GEM_COLORS, COLOR_ICON, MILESTONES, WARDROBE, featuredSpecies } from './data.js';
import { GEM_VALUE, COMBO_BONUS, DECOR_BY_ID, LEVEL_NAME, levelOf, eventFor } from './content.js';
import { on, emit } from './events.js';
import { initQuests } from './quests.js';
import { initCosmetics, tickTrail } from './cosmetics.js';
import { initAudio, sfx } from './audio.js';
import { initUI, setPrompt } from '../ui/ui.js';
import { initTouch } from './touch.js';
import { initEmotes } from './emotes.js';
import { startGuide, updateGuide } from './guide.js';
import { initFriends, tickFriends, onGift, speciesOf, lvlOf } from './friends.js';
import { initDecor, tickDecor, isPlacing, confirmPlacing, rotatePlacing, cancelPlacing, storeMoving, nearestDecor, moveDecor } from './decor.js';
import { initDays, tickDays, todayEvent } from './days.js';
import { getFX } from '../chars/fx.js';

const NAMES = { red: 'red berries', purple: 'purple berries', pink: 'pink gems', blue: 'blue gems', yellow: 'yellow gems', green: 'green gems' };
export const luckyGem = (day) => ['pink', 'blue', 'yellow', 'green'][day % 4];
export const itemCount = (kind) => Object.entries(state.inv).filter(([k]) => k.startsWith(kind + ':')).reduce((a, [, n]) => a + n, 0);

export function initGame(api) {
  load();
  if (state.tutorial === 0 && state.totalGems > 5) state.tutorial = 3; // returning players skip the tour
  const fx = getFX(window.__game?.scene);
  const summary = () => ({
    discovered: SPECIES.filter(s => state.discovered[s.id]).length, friends: SPECIES.filter(s => state.befriended[s.id]).length,
    gems: state.totalGems, maxBond: Math.max(0, ...Object.values(state.rel).map(levelOf)),
  });
  function checkMilestones() {
    const s = summary();
    for (const m of MILESTONES) {
      if (state.milestones[m.id] || !m.test(s)) continue;
      state.milestones[m.id] = Date.now();
      if (m.petals) addPetals(m.petals);
      if (m.item && !state.owned.includes(m.item)) state.owned.push(m.item);
      emit('milestone', { m, item: m.item && WARDROBE.find(w => w.id === m.item) });
    }
    saveSoon();
  }
  on('rel', checkMilestones); on('levelup', checkMilestones);
  // Core bookkeeping subscribes first so later handlers see normalised payloads.
  // Gentle daily soft cap on petals from picking things up: never a wall (floor 25%), and gifts/wishes/quests are unaffected.
  let carry = 0;
  const gemPay = (n) => {
    const d = state.daily; d.gemPetals = d.gemPetals || 0;
    const mult = d.gemPetals < 150 ? 1 : Math.max(0.25, 1 - (d.gemPetals - 150) / 400);
    if (d.gemPetals < 150 && d.gemPetals + n >= 150) emit('toast', { icon: '🌙', text: 'Petals from gems are resting a little. Gifts, wishes and quests still count!', kind: 'info' });
    d.gemPetals += n; carry += n * mult; const pay = Math.floor(carry); carry -= pay; if (pay > 0) addPetals(pay);
  };
  on('collect', e => { state.totalGems += e.amount ?? 1; gemPay(e.amount ?? 1); checkMilestones(); });
  on('discover', e => { if (state.discovered[e.species]) { e.repeat = true; return; } state.discovered[e.species] = Date.now(); saveSoon(); checkMilestones(); });
  on('befriend', e => {
    if (state.befriended[e.species]) { e.repeat = true; return; }
    state.befriended[e.species] = Date.now(); state.discovered[e.species] ||= Date.now(); addPetals(5); saveSoon(); checkMilestones();
  });
  on('befriend', e => { state.rel[e.species] = Math.max(state.rel[e.species] || 0, 16); if (e.species === featuredSpecies(state.day).id) addPetals(5); });
  initQuests();
  if (api.player?.mesh) { initCosmetics(api.player); initEmotes(api.player); initDecor(api.player); }
  initUI({ initAudio });
  const touch = initTouch(api.player); on('settings', () => touch?.refresh());
  initFriends(api); initDays(api); startGuide(api);
  addEventListener('resize', () => touch?.refresh());

  // ---- restore friends from the save (no burst / no event) ----
  const friended = new WeakSet(), met = new WeakSet();
  for (const sp of Object.keys(state.befriended)) {
    const c = api.creatures.list.find(x => speciesOf(x) === sp); if (!c) continue;
    if (c.setFriend) c.setFriend(true, { silent: true }); else { c.friend = true; c.affinity = 3; }
    friended.add(c); met.add(c); c._release = true;
  }

  // ---- classify pickups: creatures.js calls onCollect(kind, ty) ----
  let combo = 0, lastPick = 0;
  const origCollect = api.collect.onCollect;
  api.collect.onCollect = (kind, ty) => {
    origCollect?.();
    const k = kind || ty?.kind || 'gem', col = String(ty?.color || '').toLowerCase(), colorName = (k === 'berry' ? BERRY_COLORS : GEM_COLORS)[col];
    if (colorName) { const key = `${k}:${colorName}`; state.inv[key] = (state.inv[key] || 0) + 1; }
    // economy: gem colours differ in value; lucky gem of the day; events; combos
    let extra = 0; const ev = todayEvent().id;
    if (k === 'gem') { extra += (GEM_VALUE[colorName] || 1) - 1; if (colorName === luckyGem(state.day)) extra += 1; if (ev === 'petalrain') extra += 1; }
    else if (ev === 'berry') extra += 2;
    const now = performance.now(); combo = now - lastPick < 2000 ? combo + 1 : 1; lastPick = now;
    if (COMBO_BONUS[combo]) { extra += COMBO_BONUS[combo]; emit('toast', { icon: '🔥', text: `Collecting streak x${combo}! +${COMBO_BONUS[combo]} 🌸`, kind: 'win' }); }
    if (extra) gemPay(extra);
    saveSoon(); emit('pickup', { kind: k, colorName }); emit('inventory');
  };

  // ---- gifts ----
  const favKeys = sp => [`berry:${sp.fav.berry}`, `gem:${sp.fav.gem}`];
  let selGift = null;
  const giftKinds = () => Object.keys(state.inv).filter(k => state.inv[k] > 0 && (k.startsWith('berry:') || k.startsWith('gem:'))).sort();
  function pickGift(sp) {
    const has = k => (state.inv[k] || 0) > 0;
    if (selGift && has(selGift)) return { key: selGift, loved: favKeys(sp).includes(selGift) };
    const loved = favKeys(sp).find(has); if (loved) return { key: loved, loved: true };
    const any = (kind) => Object.keys(state.inv).filter(k => k.startsWith(kind + ':') && has(k)).sort((a, b) => state.inv[b] - state.inv[a])[0];
    const k = any('berry') || any('gem'); return k ? { key: k, loved: false } : null;
  }
  const favText = sp => `${COLOR_ICON[sp.fav.berry]} ${NAMES[sp.fav.berry]} or ${COLOR_ICON[sp.fav.gem]} ${NAMES[sp.fav.gem]}`;
  let target = null, decorTarget = -1, decorDist = 99, targetDist = 99;
  function interact() {
    if (document.getElementById('overlay')) return;
    if (isPlacing()) { confirmPlacing(); return; }
    if (decorTarget >= 0 && (!target || decorDist <= targetDist)) { moveDecor(decorTarget); return; }
    if (!target) return;
    const c = target, name = speciesOf(c), sp = BY_ID[name]; if (!sp || (c._gt || 0) > performance.now()) return;
    const g = pickGift(sp);
    if (!g) { emit('toast', { icon: '🍓', text: 'You have nothing to give yet. Pick up berries 🍓 or gems 💎 first!', kind: 'info' }); return; }
    const res = onGift(c, g.key, g.loved); if (res.refused) return;
    c._gt = performance.now() + 500; state.inv[g.key]--; if (!state.inv[g.key]) delete state.inv[g.key];
    const p = c.m.position, featured = name === featuredSpecies(state.day).id;
    c.jv = Math.max(c.jv, 5); fx.hearts(p.clone().setY(p.y + (c.top || 1.8)), g.loved ? 6 : 3);
    const pet = Math.max(0, res.petals + (featured ? Math.round(2 * res.mult) : 0)); if (pet) addPetals(pet);
    emit('gift', { species: name, loved: g.loved, key: g.key, creature: c }); emit('inventory');
    emit('toast', { icon: COLOR_ICON[g.key.split(':')[1]], text: g.loved ? `${name} LOVES it! 💖${res.mult < 1 ? ' (full of treats today)' : ''}` : `${name} liked it!`, kind: 'love' });
    checkMilestones(); saveSoon();
  }
  addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.code === (state.settings.interactKey || 'KeyE') || (e.code === 'Enter' && isPlacing())) interact();
    else if (e.code === 'KeyR') rotatePlacing();
    else if (e.code === 'Escape') cancelPlacing();
    else if (e.code === 'KeyX' || e.code === 'Backspace') storeMoving();
  });
  on('ui:interact', interact);
  on('ui:giftkey', e => { selGift = selGift === e.key ? null : e.key; });
  addEventListener('keydown', e => { if (e.code === 'KeyG' && !e.repeat) { const ks = giftKinds(); if (ks.length) selGift = ks[(ks.indexOf(selGift) + 1) % ks.length]; } });
  window.__gift = interact;

  // ---- per-frame watch ----
  const cells = new Set(), seen = new WeakMap(), v = new THREE.Vector3(); let acc = 0, started = false, stepD = 0, wasAir = false;
  const cellOf = p => `${Math.floor(p.x / 18)},${Math.floor(p.z / 18)}`;
  on('play', () => { started = true; setTimeout(dailyGift, 1500); });
  function dailyGift() {
    const f = featuredSpecies(state.day), lucky = luckyGem(state.day);
    if (state.lastGift !== todayStr()) {
      state.lastGift = todayStr(); const mult = todayEvent().id === 'picnic' ? 2 : 1; addPetals(10 * mult);
      const col = Math.random() < 0.5 ? 'red' : 'purple'; state.inv[`berry:${col}`] = (state.inv[`berry:${col}`] || 0) + mult; emit('inventory'); save();
      emit('toast', { icon: '🎁', text: `Daily gift: ${10 * mult} petals and ${mult} ${COLOR_ICON[col]} berr${mult > 1 ? 'ies' : 'y'}!`, kind: 'good' });
    }
    setTimeout(() => emit('toast', { icon: f.icon, text: `Featured friend: ${f.id}. Lucky gem today: ${COLOR_ICON[lucky]} (+1 petal)`, kind: 'info' }), 3000);
  }
  const sky = () => window.__game?.scene?.userData?.sky;
  window.__gameTick = (dt) => {
    state.playedSeconds += dt; tickTrail(dt); updateGuide(); tickDecor(dt, performance.now() / 1000); tickDays(dt);
    const list = api.creatures?.list, pl = api.player, pp = pl?.mesh?.position; if (!list || !pp) return;
    if (started) {
      // audio: footsteps, jump, land
      const air = !pl.onGround; if (air && !wasAir) sfx.jump(); if (!air && wasAir) sfx.land(); wasAir = air;
      if (!air && pl.speed > 1) { stepD += pl.speed * dt; const run = pl.speed > 8; if (stepD > (run ? 2.2 : 1.7)) { stepD = 0; const h = pp.y; sfx.step(h < 1.3 ? 'sand' : 'grass', run); } }
      tickFriends(dt, performance.now());
    }
    // friendship: creature.friend is the source of truth; emit 'befriend' once on false -> true
    for (const c of list) if (c.friend && !friended.has(c)) { friended.add(c); emit('befriend', { species: speciesOf(c), creature: c }); if (started) emit('toast', { icon: '💕', text: `${speciesOf(c)} is now your friend!`, kind: 'love' }); }
    acc += dt; if (acc < 0.15) return; const step = acc; acc = 0;
    if (started) { const cl = cellOf(pp); if (!cells.size) cells.add(cl); else if (!cells.has(cl)) { cells.add(cl); emit('explore', { cell: cl }); } }
    let best = null, bd = 1e9;
    for (const c of list) {
      const p = c.m.position, d = Math.hypot(p.x - pp.x, p.z - pp.z), name = speciesOf(c);
      // discovery requires actually seeing the creature on screen for ~1s (not just being nearby)
      if (!met.has(c) && started && d < 18 && c.m.visible) {
        v.set(p.x, p.y + 1, p.z).project(api.camera);
        if (v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95) { const t = (seen.get(c) || 0) + step; seen.set(c, t); if (t >= 1) { met.add(c); emit('discover', { species: name, creature: c }); } }
      }
      if (d < 4.8 && d < bd) { bd = d; best = c; }
    }
    target = best; targetDist = bd; decorTarget = started && !isPlacing() ? nearestDecor(pp, 2.2) : -1;
    decorDist = decorTarget >= 0 ? Math.hypot(state.decor[decorTarget].x - pp.x, state.decor[decorTarget].z - pp.z) : 99;
    if (isPlacing() || !started) { setPrompt(null); return; }
    if (decorTarget >= 0 && decorDist <= bd) { setPrompt(`🔄 Move ${DECOR_BY_ID[state.decor[decorTarget].id].name}`, 'Pick it up to move or store it', true); return; }
    if (!best) {
      if (decorTarget >= 0) setPrompt(`🔄 Move ${DECOR_BY_ID[state.decor[decorTarget].id].name}`, 'Pick it up and place it somewhere else', true); else setPrompt(null);
      return;
    }
    const name = speciesOf(best), sp = BY_ID[name], g = sp && pickGift(sp), lv = lvlOf(name), tag = `${name} · ${LEVEL_NAME[lv]}`;
    if (g) { const kinds = giftKinds(); setPrompt(`${best.friend ? 'Give' : 'Gift'} ${COLOR_ICON[g.key.split(':')[1]]} to ${name}`, `${tag} · loves ${favText(sp)}${g.loved ? ' · perfect pick!' : ''}`, true, kinds.length > 1 ? kinds.map(k => ({ key: k, icon: COLOR_ICON[k.split(':')[1]], n: state.inv[k], sel: k === g.key, fav: sp && favKeys(sp).includes(k) })) : null); }
    else if (!best.friend) setPrompt(`${name} is getting to know you...`, `Gifts, emotes and daily hellos build friendship. Loves ${favText(sp)}`, false);
    else setPrompt(null);
  };
  { let last = performance.now(); const loop = (n) => { window.__gameTick(Math.min(0.1, (n - last) / 1000)); last = n; requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  window.__emit = emit; window.__gameState = state; window.__save = save;
}
