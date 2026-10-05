// Procedural WebAudio: SFX + gentle generative music. No assets.
import { state } from './state.js';
import { on } from './events.js';
let ctx, master, sfxBus, musicBus, reverb, started = false, combo = 0, lastCollect = 0;

function mkImpulse(c, dur = 2.4, decay = 3) {
  const n = c.sampleRate * dur, b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
  return b;
}
export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.connect(master);
  reverb = ctx.createConvolver(); reverb.buffer = mkImpulse(ctx);
  const wet = ctx.createGain(); wet.gain.value = 0.45; reverb.connect(wet); wet.connect(master);
  applySettings(); startMusic();
}
export function applySettings() {
  if (!ctx) return;
  master.gain.value = state.settings.volume;
  musicBus.gain.value = state.settings.music * 0.6;
}
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function tone(freq, t0, dur, { type = 'sine', vol = 0.2, bus = sfxBus, rev = 0.3, glideTo, attack = 0.01 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(bus);
  if (rev) { const s = ctx.createGain(); s.gain.value = rev; g.connect(s); s.connect(reverb); }
  o.start(t0); o.stop(t0 + dur + 0.05);
}
const PENT = [0, 2, 4, 7, 9];
const scale = (root, i) => root + PENT[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5);

export const sfx = {
  click() { if (!ctx) return; const t = ctx.currentTime; tone(660, t, 0.12, { type: 'triangle', vol: 0.15 }); tone(990, t + 0.04, 0.12, { type: 'triangle', vol: 0.1 }); },
  collect() {
    if (!ctx) return; const t = ctx.currentTime;
    combo = (t - lastCollect < 1.6) ? Math.min(combo + 1, 7) : 0; lastCollect = t;
    const f = hz(scale(72, combo));
    tone(f, t, 0.3, { type: 'sine', vol: 0.22 }); tone(f * 2, t + 0.05, 0.25, { type: 'triangle', vol: 0.1 });
  },
  discover() { if (!ctx) return; const t = ctx.currentTime; [0, 2, 4, 7].forEach((s, i) => tone(hz(76 + s), t + i * 0.08, 0.5, { vol: 0.16, type: 'triangle' })); },
  befriend() { if (!ctx) return; const t = ctx.currentTime; [0, 4, 7, 12, 16].forEach((s, i) => tone(hz(67 + s), t + i * 0.09, 0.6, { vol: 0.17, type: 'sine', rev: 0.5 })); tone(hz(84), t + 0.5, 0.9, { vol: 0.1, type: 'sine', rev: 0.6 }); },
  quest() { if (!ctx) return; const t = ctx.currentTime; [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, i) => tone(hz(72 + s), t + i * 0.1, 0.5, { vol: 0.17, type: 'triangle', rev: 0.5 })); },
  buy() { if (!ctx) return; const t = ctx.currentTime; tone(hz(79), t, 0.15, { type: 'square', vol: 0.06 }); tone(hz(84), t + 0.08, 0.35, { type: 'triangle', vol: 0.15 }); },
  nope() { if (!ctx) return; const t = ctx.currentTime; tone(220, t, 0.2, { type: 'triangle', vol: 0.12, glideTo: 160 }); },
  open() { if (!ctx) return; const t = ctx.currentTime; tone(440, t, 0.25, { type: 'sine', vol: 0.12, glideTo: 880 }); },
  close() { if (!ctx) return; const t = ctx.currentTime; tone(660, t, 0.2, { type: 'sine', vol: 0.1, glideTo: 330 }); },
};

// Generative music: slow chord pads (I-vi-IV-V in C pentatonic-friendly) + sparse plucks.
const CHORDS = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]];
let bar = 0, nextBar = 0, timerId;
function scheduleBar(t0) {
  const ch = CHORDS[bar % 4]; const barLen = 6;
  for (const n of ch) tone(hz(n), t0 + Math.random() * 0.08, barLen * 0.95, { type: 'sine', vol: 0.05, bus: musicBus, rev: 0.7, attack: 1.4 });
  tone(hz(ch[0] - 12), t0, barLen * 0.9, { type: 'sine', vol: 0.06, bus: musicBus, rev: 0.3, attack: 0.8 });
  let t = t0 + 0.4;
  while (t < t0 + barLen - 0.5) {
    if (Math.random() < 0.6) tone(hz(scale(72, Math.floor(Math.random() * 8))), t, 1.4, { type: 'triangle', vol: 0.07, bus: musicBus, rev: 0.8, attack: 0.008 });
    t += 0.5 + Math.floor(Math.random() * 3) * 0.5;
  }
  bar++;
}
function startMusic() {
  if (started) return; started = true; nextBar = ctx.currentTime + 0.3;
  timerId = setInterval(() => {
    if (ctx.state !== 'running') return;
    while (nextBar < ctx.currentTime + 3) { scheduleBar(nextBar); nextBar += 6; }
  }, 500);
}

on('collect', () => sfx.collect());
on('discover', () => sfx.discover());
on('befriend', () => sfx.befriend());
on('quest:complete', () => sfx.quest());
on('purchase', () => sfx.buy());
on('equip', () => sfx.click());
on('settings', applySettings);
