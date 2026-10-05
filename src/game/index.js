// Game layer entry. initGame({ player, creatures, collect, camera }) wires state, quests, audio, cosmetics, UI.
// creature.friend (set by src/creatures.js) is the single source of truth for friendship.
import { state, load, save, saveSoon, addPetals, todayStr } from './state.js';
import { BY_ID, SPECIES, BERRY_COLORS, GEM_COLORS, COLOR_ICON, MILESTONES, BOND_AT, WARDROBE, featuredSpecies } from './data.js';
import { on, emit } from './events.js';
import { initQuests } from './quests.js';
import { initCosmetics, tickTrail } from './cosmetics.js';
import { initAudio } from './audio.js';
import { initUI, setPrompt } from '../ui/ui.js';
import { initTouch } from './touch.js';
import { initEmotes } from './emotes.js';
import { startGuide, updateGuide } from './guide.js';
import { getFX } from '../chars/fx.js';

const bondLevel = n => BOND_AT.reduce((l, need, i) => (n >= need ? i : l), 0);
export const itemCount = (kind) => Object.entries(state.inv).filter(([k]) => k.startsWith(kind + ':')).reduce((a, [, n]) => a + n, 0);

export function initGame(api) {
  load();
  if (state.tutorial === 0 && state.totalGems > 5) state.tutorial = 3; // returning players skip the tour
  const fx = getFX(window.__game?.scene);
  const summary = () => ({
    discovered: SPECIES.filter(s => state.discovered[s.id]).length, friends: SPECIES.filter(s => state.befriended[s.id]).length,
    gems: state.totalGems, maxBond: Math.max(0, ...Object.values(state.bond).map(bondLevel)),
  });
  function checkMilestones() {
    const s = summary();
    for (const m of MILESTONES) {
      if (state.milestones[m.id] || !m.test(s)) continue;
      state.milestones[m.id] = Date.now();
      if (m.petals) addPetals(m.petals);
      if (m.item && !state.owned.includes(m.item)) state.owned.push(m.item);
      const it = m.item && WARDROBE.find(w => w.id === m.item);
      emit('milestone', { m, item: it });
    }
    saveSoon();
  }
  // Core bookkeeping subscribes first so later handlers see normalised payloads.
  on('collect', e => { state.totalGems += e.amount ?? 1; addPetals(e.amount ?? 1); checkMilestones(); });
  on('discover', e => { if (state.discovered[e.species]) { e.repeat = true; return; } state.discovered[e.species] = Date.now(); saveSoon(); checkMilestones(); });
  on('befriend', e => {
    if (state.befriended[e.species]) { e.repeat = true; return; }
    state.befriended[e.species] = Date.now(); state.discovered[e.species] ||= Date.now(); addPetals(5); saveSoon(); checkMilestones();
  });
  on('befriend', e => { if (e.species === featuredSpecies(state.day).id) { addPetals(5); } });
  initQuests();
  if (api.player?.mesh) { initCosmetics(api.player); initEmotes(api.player); }
  initUI({ initAudio });
  const touch = initTouch(api.player); on('settings', () => touch?.refresh());
  startGuide(api);
  addEventListener('resize', () => touch?.refresh());

  // ---- what did the player just pick up? (main.js emits a generic 'collect'; we classify via the burst colour) ----
  let lastBurst = null;
  const burst = api.collect.fx.burst.bind(api.collect.fx);
  api.collect.fx.burst = (pos, color, n) => { lastBurst = { color: String(color).toLowerCase(), t: performance.now() }; return burst(pos, color, n); };
  const origCollect = api.collect.onCollect;
  api.collect.onCollect = (...a) => {
    const lb = lastBurst && performance.now() - lastBurst.t < 100 ? lastBurst : null; lastBurst = null;
    origCollect?.(...a);
    const kind = lb && BERRY_COLORS[lb.color] ? 'berry' : 'gem', colorName = lb && (BERRY_COLORS[lb.color] || GEM_COLORS[lb.color]);
    if (colorName) { const k = `${kind}:${colorName}`; state.inv[k] = (state.inv[k] || 0) + 1; saveSoon(); }
    emit('pickup', { kind, colorName }); emit('inventory');
  };

  // ---- gifts ----
  const favKeys = sp => [`berry:${sp.fav.berry}`, `gem:${sp.fav.gem}`];
  function pickGift(sp) {
    const has = k => (state.inv[k] || 0) > 0;
    const loved = favKeys(sp).find(has); if (loved) return { key: loved, loved: true };
    const any = (kind) => Object.keys(state.inv).filter(k => k.startsWith(kind + ':') && has(k)).sort((a, b) => state.inv[b] - state.inv[a])[0];
    const k = any('berry') || any('gem'); return k ? { key: k, loved: false } : null;
  }
  const speciesOf = c => c.sp?.name || c.species?.name || 'Puffle';
  let target = null; // nearest creature the player could interact with
  function interact() {
    if (!target || document.getElementById('overlay')) return;
    const c = target, name = speciesOf(c), sp = BY_ID[name]; if (!sp || (c._gt || 0) > performance.now()) return;
    const g = pickGift(sp);
    if (!g) { emit('toast', { icon: '🍓', text: 'You have nothing to give yet. Pick up berries 🍓 or gems 💎 first!', kind: 'info' }); return; }
    c._gt = performance.now() + 500; state.inv[g.key]--; if (!state.inv[g.key]) delete state.inv[g.key];
    const p = c.m.position;
    if (!c.friend) c.affinity = g.loved ? 3 : (c.affinity || 0) + 1.4;
    c.jv = Math.max(c.jv, 5); fx.hearts(p.clone().setY(p.y + (c.top || 1.8)), g.loved ? 6 : 3);
    const featured = name === featuredSpecies(state.day).id;
    addPetals((g.loved ? 3 : 1) + (featured ? 2 : 0));
    const before = bondLevel(state.bond[name] || 0); state.bond[name] = (state.bond[name] || 0) + 1; const after = bondLevel(state.bond[name]);
    emit('gift', { species: name, loved: g.loved, key: g.key, creature: c }); emit('inventory');
    emit('toast', { icon: COLOR_ICON[g.key.split(':')[1]], text: g.loved ? `${name} LOVES it! 💖` : `${name} liked it!`, kind: 'love' });
    if (after > before) { addPetals(5 * after); emit('toast', { icon: '💞', text: `${name} friendship level ${after}! +${5 * after} petals`, kind: 'win' }); }
    checkMilestones(); saveSoon();
  }
  addEventListener('keydown', e => { if (e.code === 'KeyE' && !e.repeat) interact(); });
  on('ui:interact', interact);
  window.__gift = interact;

  // ---- per-frame watch ----
  const met = new WeakSet(), friended = new WeakSet(), cells = new Set(); let acc = 0, started = false;
  const cellOf = p => `${Math.floor(p.x / 18)},${Math.floor(p.z / 18)}`;
  on('play', () => { started = true; setTimeout(dailyGift, 1500); });
  function dailyGift() {
    const f = featuredSpecies(state.day);
    if (state.lastGift !== todayStr()) {
      state.lastGift = todayStr(); addPetals(10);
      const col = Math.random() < 0.5 ? 'red' : 'purple'; state.inv[`berry:${col}`] = (state.inv[`berry:${col}`] || 0) + 1; emit('inventory'); save();
      emit('toast', { icon: '🎁', text: `Daily gift: 10 petals and a ${COLOR_ICON[col]} berry!`, kind: 'good' });
    }
    setTimeout(() => emit('toast', { icon: f.icon, text: `Featured friend today: ${f.id}. Gifts and befriending earn bonus petals!`, kind: 'info' }), 3800);
  }
  window.__gameTick = (dt) => {
    state.playedSeconds += dt; tickTrail(dt); updateGuide();
    const list = api.creatures?.list, pp = api.player?.mesh?.position; if (!list || !pp) return;
    // friendship: creature.friend is the source of truth; emit 'befriend' once on false -> true
    for (const c of list) if (c.friend && !friended.has(c)) { friended.add(c); if (started) emit('toast', { icon: '💕', text: `${speciesOf(c)} is now your friend!`, kind: 'love' }); emit('befriend', { species: speciesOf(c), creature: c }); }
    acc += dt; if (acc < 0.15) return; acc = 0;
    if (started) { const cl = cellOf(pp); if (!cells.size) cells.add(cl); else if (!cells.has(cl)) { cells.add(cl); emit('explore', { cell: cl }); } }
    let best = null, bd = 1e9;
    for (const c of list) {
      const p = c.m.position, d = Math.hypot(p.x - pp.x, p.z - pp.z), name = speciesOf(c);
      if (d < 9 && !met.has(c)) { met.add(c); emit('discover', { species: name, creature: c }); }
      if (d < 4.8 && d < bd) { bd = d; best = c; }
    }
    target = best;
    if (!best || !started) { setPrompt(null); return; }
    const name = speciesOf(best), sp = BY_ID[name], g = sp && pickGift(sp), fav = sp ? `${COLOR_ICON[sp.fav.berry]} ${COLOR_ICON[sp.fav.gem]}` : '';
    if (g) setPrompt(`${best.friend ? 'Give' : 'Gift'} ${COLOR_ICON[g.key.split(':')[1]]} to ${name}`, `${name} loves ${fav}${g.loved ? ' - perfect pick!' : ''}`, true);
    else if (!best.friend) setPrompt(`${name} is warming up to you...`, `Stay close, or bring ${fav} to make friends faster`, false);
    else setPrompt(null);
  };
  { let last = performance.now(); const loop = (n) => { window.__gameTick(Math.min(0.1, (n - last) / 1000)); last = n; requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  window.__emit = emit; window.__gameState = state; window.__save = save;
}
