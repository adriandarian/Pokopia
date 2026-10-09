// Persistent game state (localStorage). No accounts, no servers, no real money.
import { emit } from './events.js';
import { DEFAULT_EQUIP, DEFAULT_OWNED } from './data.js';
const KEY = 'pokopia.save.v1';
export const todayStr = () => new Date().toISOString().slice(0, 10);

const defaults = () => ({
  petals: 0, totalGems: 0, day: 1, lastDate: todayStr(), lastGift: '', playedSeconds: 0,
  discovered: {}, befriended: {}, bond: {}, inv: {}, milestones: {},
  rel: {}, wish: {}, wishDone: 0, daily: { date: '', gifts: {}, near: {}, visit: {}, emote: {}, together: {} },
  decorInv: {}, decor: [], charmMs: {}, eventSeen: 0, mem: {}, hang: null, lastWelcome: 0, placedTypes: {},
  owned: [...DEFAULT_OWNED], equipped: { ...DEFAULT_EQUIP },
  quests: null, questSet: 0, tutorial: 0,
  settings: { volume: 0.8, music: 0.5, quality: 'high', reduceMotion: false, touch: 'auto', textSize: 1, mute: false, interactKey: 'KeyE' },
});

export const state = defaults();

export function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw) {
      Object.assign(state, defaults(), raw, { settings: { ...defaults().settings, ...(raw.settings || {}) } });
      state.equipped = { ...DEFAULT_EQUIP, ...(raw.equipped || {}) };
      if (raw.equipped?.color) state.equipped.shirt = raw.equipped.color;
      delete state.equipped.color; // migrate v1 saves
      for (const id of DEFAULT_OWNED) if (!state.owned.includes(id)) state.owned.push(id);
      state.quests = state.quests && state.quests.every(q => q.id) ? state.quests : null;
      state.daily = { ...defaults().daily, ...(raw.daily || {}) };
    }
  } catch (e) { console.warn('save load failed', e); }
  for (const sp of Object.keys(state.befriended)) state.rel[sp] = Math.max(state.rel[sp] || 0, 16);
  if (state.daily.date !== todayStr()) state.daily = { date: todayStr(), gifts: {}, near: {}, visit: {}, emote: {}, together: {} };
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
