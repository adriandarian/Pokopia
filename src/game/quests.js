import { state, save, addPetals } from './state.js';
import { QUEST_POOL } from './data.js';
import { on, emit } from './events.js';

// Pick 3 quests from distinct groups (so never two near-identical "collect N" quests), deterministic per day/set.
function pick() {
  let s = state.day * 7919 + state.questSet * 104729 + 17;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const pool = [...QUEST_POOL], out = [], groups = new Set();
  // First slot: an easy gem-ish quest keeps the core loop obvious.
  const first = pool.filter(q => q.group === 'gems' || q.group === 'berries');
  const fq = first[Math.floor(rnd() * first.length)]; out.push(fq); groups.add(fq.group);
  // Treat the 'befriend' family as one group so we don't get "befriend 1" + "befriend 3" together.
  const fam = g => (g === 'befriendX' ? 'befriend' : g);
  groups.add(fam(fq.group));
  let guard = 200;
  while (out.length < 3 && guard--) {
    const q = pool[Math.floor(rnd() * pool.length)];
    if (groups.has(fam(q.group)) || out.includes(q)) continue;
    out.push(q); groups.add(fam(q.group));
  }
  return out.map(q => ({ id: q.id, progress: 0, done: false, claimed: false }));
}
export const def = (id) => QUEST_POOL.find(q => q.id === id);
export function ensureQuests() {
  if (state.quests && state.quests.some(q => !def(q.id))) state.quests = null; // old saves
  if (!state.quests) { state.quests = pick(); save(); }
}
export function allDone() { return state.quests.every(q => q.claimed); }
export function newSet() { state.questSet++; state.quests = pick(); save(); emit('quests:changed'); }

export function claim(i) {
  const q = state.quests[i]; if (!q || !q.done || q.claimed) return;
  q.claimed = true; addPetals(def(q.id).reward); save();
  emit('quests:changed'); emit('quest:claimed', { quest: q, def: def(q.id) });
}
function progress(ev, payload = {}) {
  ensureQuests();
  for (const q of state.quests) {
    const d = def(q.id); if (q.done || d.ev !== ev) continue;
    if (d.match && !d.match(payload)) continue;
    q.progress = Math.min(d.goal, q.progress + 1);
    if (q.progress >= d.goal) { q.done = true; emit('quest:complete', { quest: q, def: d }); }
  }
  emit('quests:changed'); save();
}
export function initQuests() {
  ensureQuests();
  for (const ev of ['collect', 'pickup', 'befriend', 'discover', 'gift', 'explore', 'equip', 'emote']) on(ev, e => progress(ev, e));
  on('day', () => { state.quests = null; ensureQuests(); emit('quests:changed'); });
}
