// Emotes: wave, dance, cheer, sit. Uses the native hero.emote(name); emits the bus event 'emote' { name }.
import { emit } from './events.js';
import { state, saveSoon } from './state.js';
export const SENSE_CD = 90000;
export const senseLeft = () => Math.max(0, (state.senseAt || 0) + SENSE_CD - Date.now());

export const EMOTES = [
  { id: 'wave', icon: '👋', label: 'Wave' }, { id: 'dance', icon: '💃', label: 'Dance' },
  { id: 'cheer', icon: '🎉', label: 'Cheer' }, { id: 'sit', icon: '🧘', label: 'Sit' }, { id: 'sense', icon: '👁️', label: 'Sparkle Sense' },
];
let player;
export function playEmote(id) {
  if (!player || !EMOTES.some(e => e.id === id)) return;
  if (id === 'sense') { const l = senseLeft(); if (l > 0) { emit('toast', { icon: '👁️', text: `Sparkle Sense is resting (${Math.ceil(l / 1000)}s). Gems regrow slowly, so there is no hurry!`, kind: 'info' }); return; } state.senseAt = Date.now(); saveSoon(); }
  if (id === 'cheer') player.jumpBuf = 0.12;
  player.hero.emote?.(id === 'sense' ? 'wave' : id);
  emit('emote', { name: id });
}
export function initEmotes(pl) {
  player = pl;
  addEventListener('keydown', e => {
    if (e.repeat || document.getElementById('overlay') || e.ctrlKey || e.metaKey) return;
    const i = '12345'.indexOf(e.key); if (i >= 0 && e.key.length === 1) playEmote(EMOTES[i].id);
  });
}
