import { state, save, addPetals } from './state.js';
import { QUEST_POOL } from './data.js';
import { on, emit } from './events.js';

function pick() {
  let s = state.day * 7919 + state.questSet * 104729;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const pool = [...QUEST_POOL], out = [];
  // always include one of each kind where possible for variety
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out.map(q => ({ id: q.id, progress: 0, done: false, claimed: false }));
}
export const def = (id) => QUEST_POOL.find(q => q.id === id);
export function ensureQuests() { if (!state.quests) { state.quests = pick(); save(); } }
export function allDone() { return state.quests.every(q => q.claimed); }
export function newSet() { state.questSet++; state.quests = pick(); save(); emit('quests:changed'); }

export function claim(i) {
  const q = state.quests[i]; if (!q || !q.done || q.claimed) return;
  q.claimed = true; addPetals(def(q.id).reward); save();
  emit('quests:changed'); emit('quest:claimed', { quest: q, def: def(q.id) });
}
function progress(ev, n = 1) {
  ensureQuests();
  for (const q of state.quests) {
    const d = def(q.id); if (q.done || d.ev !== ev) continue;
    q.progress = Math.min(d.goal, q.progress + n);
    if (q.progress >= d.goal) { q.done = true; emit('quest:complete', { quest: q, def: d }); }
  }
  emit('quests:changed'); save();
}
export function initQuests() {
  ensureQuests();
  on('collect', e => progress('collect', e.amount ?? 1));
  on('befriend', () => progress('befriend'));
  on('discover', e => { if (!e.repeat) progress('discover'); });
  on('day', () => { state.quests = null; ensureQuests(); emit('quests:changed'); });
}
