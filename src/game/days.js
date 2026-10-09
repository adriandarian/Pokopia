// The day counter drives gentle daily events (no timers, no streaks, nothing is ever missed).
import * as THREE from 'three';
import { state, save } from './state.js';
import { eventFor } from './content.js';
import { on, emit } from './events.js';
import { getFX } from '../chars/fx.js';

export const todayEvent = () => eventFor(state.day);
let api, fx, rain, ffT = 0;
export function initDays(a) {
  api = a; fx = getFX(window.__game?.scene);
  on('play', () => setTimeout(announce, 6500));
}
function announce() {
  const e = todayEvent();
  if (state.eventToast !== state.day) { state.eventToast = state.day; save(); emit('toast', { icon: e.icon, text: `${e.name}: ${e.blurb}`, kind: 'good' }); }
  if (e.id === 'petalrain' && !state.settings.reduceMotion) startRain();
  if (e.id === 'firefly') { const sky = window.__game?.scene?.userData?.sky; if (sky && state.eventSeen !== state.day) { sky.hour = 20.2; } }
  state.eventSeen = state.day;
}
function startRain() {
  if (rain) return;
  rain = document.createElement('div'); rain.id = 'petalrain';
  for (let i = 0; i < 26; i++) { const s = document.createElement('span'); s.textContent = '🌸'; s.style.cssText = `left:${Math.random() * 100}%;animation-duration:${7 + Math.random() * 7}s;animation-delay:${-Math.random() * 12}s;font-size:${12 + Math.random() * 16}px;opacity:.85`; rain.appendChild(s); }
  document.getElementById('ui-root').prepend(rain);
}
// Fireflies: soft glimmers around the player after dark on Firefly Night.
export function tickDays(dt) {
  if (todayEvent().id !== 'firefly' || !api) return;
  const sky = window.__game?.scene?.userData?.sky; if (!sky || (sky.night ?? 0) < 0.35) return;
  ffT -= dt; if (ffT > 0) return; ffT = 0.12;
  const p = api.player.mesh.position, a = Math.random() * 6.283, r = 2 + Math.random() * 12;
  fx.twinkle(new THREE.Vector3(p.x + Math.cos(a) * r, p.y + 0.6 + Math.random() * 2.2, p.z + Math.sin(a) * r), Math.random() < 0.5 ? '#d8ff7a' : '#fff3a0');
}
