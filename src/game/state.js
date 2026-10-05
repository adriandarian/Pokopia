// Persistent game state (localStorage). No accounts, no servers, no real money.
import { emit } from './events.js';
const KEY = 'pokopia.save.v1';
const todayStr = () => new Date().toISOString().slice(0, 10);

const defaults = () => ({
  petals: 0, totalGems: 0, day: 1, lastDate: todayStr(), playedSeconds: 0,
  discovered: {}, befriended: {}, owned: ['hat_none', 'col_red'],
  equipped: { hat: 'hat_none', color: 'col_red' },
  quests: null, questSet: 0,
  settings: { volume: 0.8, music: 0.5, quality: 'high', reduceMotion: false },
});

export const state = defaults();

export function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw) Object.assign(state, defaults(), raw, { settings: { ...defaults().settings, ...(raw.settings || {}) } });
  } catch (e) { console.warn('save load failed', e); }
  // Cozy day counter: +1 on each new calendar day you visit. Never punishes absence.
  if (state.lastDate !== todayStr()) { state.day += 1; state.lastDate = todayStr(); state.quests = null; save(); emit('day', { day: state.day }); }
}
let timer = 0;
export function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
export function saveSoon() { clearTimeout(timer); timer = setTimeout(save, 400); }
export function resetSave() { try { localStorage.removeItem(KEY); } catch {} location.reload(); }

export function addPetals(n) {
  state.petals = Math.max(0, state.petals + n);
  emit('currency', { delta: n, total: state.petals }); saveSoon();
}
addEventListener('beforeunload', save);
