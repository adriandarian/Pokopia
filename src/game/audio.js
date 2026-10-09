// Procedural WebAudio for the whole game: composed score, tactile SFX, creature voices, ambience. No audio files.
// Nothing is created until initAudio() runs from a user gesture (Play button). Synthesis lives in ./audio/*.js
// and works on any BaseAudioContext, so the same code is verified offline (see scripts in the dev notes).
import { state } from './state.js';
import { on } from './events.js';
import { buildGraph } from './audio/synth.js';
import { createMusic } from './audio/music.js';
import { createSfx } from './audio/sfx.js';
import { createAmbience } from './audio/ambience.js';

const MUSIC_K = 0.9;          // music slider (0..1) -> musicGain, calibrated by offline render (see report)
const LOOKAHEAD = 4.0, TICK_MS = 300;
let ctx, env, impl, music, amb, started = false, timer, ambTimer, feat = null, curTheme = 'day', duck = 0;
const POND_DEFAULT = { x: -30, z: 14, r: 6.5 };

const sky = () => window.__game?.scene?.userData?.sky;
const pl = () => window.__game?.player?.mesh?.position;

/** Which theme should play now: follows scene.userData.sky (hour / night). */
export function themeForSky(s) {
  if (!s) return 'day';
  const n = s.night ?? 0, h = s.hour ?? 12;
  if (n > 0.5) return 'night';
  if (h < 10.5) return 'morning';
  if (h < 16.5) return 'day';
  if (h < 19.5) return 'golden';
  return n > 0.2 ? 'night' : 'golden';
}
function wantTheme() { curTheme = themeForSky(sky()); return curTheme; }

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  try { ctx = new AC({ latencyHint: 'interactive' }); } catch { return; }
  env = buildGraph(ctx, { seed: (Date.now() & 0xfffff) + 1 });
  impl = createSfx(env);
  music = createMusic(env, { seed: (Date.now() >>> 4) & 0xffffff, getTheme: wantTheme });
  amb = createAmbience(env);
  applySettings();
  env.musicDuck.gain.value = 1;
  import('../nature/features.js').then(m => { feat = m; }).catch(() => {}); // pond centre + path mask for surface-aware audio
  const go = () => {
    if (!started) { started = true; music.resync(ctx.currentTime); const g = env.musicGain.gain, v = g.value; g.setValueAtTime(0, ctx.currentTime); g.linearRampToValueAtTime(v, ctx.currentTime + 4); }
    startAmbient();
    pump();
  };
  if (ctx.state === 'running') go(); else ctx.resume().then(go).catch(() => {});
  ctx.onstatechange = () => { if (ctx.state === 'running' && !started) go(); };
  document.addEventListener('visibilitychange', onVis);
  window.__audio = { get state() { return ctx?.state; }, get theme() { return music?.theme; }, get stats() { return music?.stats; }, get ctx() { return ctx; } };
}
function onVis() {
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {});
  else ctx.resume().then(() => music?.resync(ctx.currentTime)).catch(() => {});
}
export function applySettings() {
  if (!ctx) return;
  const t = ctx.currentTime;
  env.master.gain.setTargetAtTime(state.settings.mute ? 0 : state.settings.volume, t, 0.03);
  env.musicGain.gain.cancelScheduledValues(t); env.musicGain.gain.setTargetAtTime(state.settings.music * MUSIC_K, t, 0.05);
}
function pump() {
  if (timer) return;
  timer = setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    if (music.nextT < ctx.currentTime) music.resync(ctx.currentTime + 0.05); // fell behind (throttled tab): jump forward instead of bursting
    music.fill(ctx.currentTime + LOOKAHEAD);
  }, TICK_MS);
  music.fill(ctx.currentTime + LOOKAHEAD);
}

// ---- surface / environment awareness ----
function surfaceAt(x, z, y, given) {
  if (given === 'sand' || given === 'water') return given;
  for (const d of state.decor || []) if ((d.id === 'b_floor' && Math.abs(d.x - x) < 1.1 && Math.abs(d.z - z) < 1.1) || (d.id === 'd_bridge' && Math.abs(d.x - x) < 1.6 && Math.abs(d.z - z) < 1.6)) return 'wood';
  try { if (feat?.onPath?.(x, z)) return 'path'; } catch { /* ignore */ }
  return given || 'grass';
}
export function startAmbient() {
  if (!ctx || ambTimer) return;
  ambTimer = setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    const s = sky(), night = s ? Math.min(1, Math.max(0, s.night ?? 0)) : 0, p = pl(), t = ctx.currentTime;
    let pond = 0, sea = 0, wind = 0.3;
    if (p) {
      const P = feat?.POND || POND_DEFAULT, d = Math.hypot(p.x - P.x, p.z - P.z) - P.r;
      pond = Math.min(1, Math.max(0, 1 - d / 22));
      const r = Math.hypot(p.x, p.z), beach = Math.min(1, Math.max(0, 1 - (p.y - 0.6) / 5)), far = Math.min(1, Math.max(0, (r - 46) / 18));
      sea = Math.max(beach * 0.9, far); wind = 0.25 + 0.75 * Math.min(1, Math.max(0, p.y / 12));
    }
    amb.update({ wind, pond, sea, t });
    if (!state.settings.mute) amb.step(t + 0.05, 0.4, night);
  }, 400);
}

// ---- public sfx: safe no-ops before the first gesture / while suspended ----
const names = ['click', 'hover', 'open', 'close', 'nope', 'collect', 'discover', 'befriend', 'quest', 'buy', 'gift', 'level', 'place', 'jump', 'land', 'step', 'emote', 'voice'];
export const sfx = {};
for (const n of names) sfx[n] = (...a) => { if (!ctx || ctx.state !== 'running' || state.settings.mute) return; try { if (n === 'step') { const p = pl(); a[0] = p ? surfaceAt(p.x, p.z, p.y, a[0]) : a[0]; } impl[n](...a); } catch (e) { console.warn('[audio]', n, e); } };

// events
on('gift', () => sfx.gift());
on('emote', e => sfx.emote(e.name));
on('voice', e => sfx.voice(e.species));
on('place', () => sfx.place());
on('levelup', () => sfx.level());
on('sfx', e => sfx[e.name]?.());
on('collect', () => sfx.collect());
on('discover', () => sfx.discover());
on('befriend', () => sfx.befriend());
on('quest:complete', () => sfx.quest());
on('purchase', () => sfx.buy());
on('equip', () => sfx.click());
on('settings', applySettings);
// duck the score while a UI panel is open so menus and their sounds stay clear
on('ui:open', () => { duck++; if (ctx) env.musicDuck.gain.setTargetAtTime(0.4, ctx.currentTime, 0.25); });
on('ui:close', () => { duck = Math.max(0, duck - 1); if (ctx && !duck) env.musicDuck.gain.setTargetAtTime(1, ctx.currentTime, 0.4); });
