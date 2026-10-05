// Procedural WebAudio: SFX + gentle generative music. No assets.
import { state } from './state.js';
import { on } from './events.js';
let noiseBuf, ambBus, ctx, master, sfxBus, musicBus, reverb, started = false, combo = 0, lastCollect = 0;

function mkImpulse(c, dur = 2.4, decay = 3) {
  const n = c.sampleRate * dur, b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
  return b;
}
function mkNoise(c) { const b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
function noise(t0, dur, freq, q, vol, type = 'bandpass', bus = sfxBus) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(bus); src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
}
export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
  master.connect(comp); comp.connect(lim); lim.connect(ctx.destination); // compressor + brick-wall limiter: no clipping
  noiseBuf = mkNoise(ctx); ambBus = ctx.createGain(); ambBus.gain.value = 0.9; ambBus.connect(master);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.connect(master);
  reverb = ctx.createConvolver(); reverb.buffer = mkImpulse(ctx);
  const wet = ctx.createGain(); wet.gain.value = 0.45; reverb.connect(wet); wet.connect(master);
  applySettings(); startMusic(); startAmbient();
}
export function applySettings() {
  if (!ctx) return;
  master.gain.value = state.settings.mute ? 0 : state.settings.volume;
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


// ---- round 3: gameplay SFX, creature voices, footsteps, ambience ----
const VOICES = {
  Puffle: { f: 760, type: 'triangle', pat: [[0, 1], [0.11, 1.18]], len: 0.12 }, Bloop: { f: 520, type: 'sine', pat: [[0, 1.4], [0.09, 1]], len: 0.2, glide: 0.6 },
  Sunny: { f: 1100, type: 'sine', pat: [[0, 1], [0.08, 1.12], [0.16, 1.26]], len: 0.07 }, Mochi: { f: 330, type: 'sawtooth', pat: [[0, 1]], len: 0.36, glide: 1.5, soft: 900 },
  Leafy: { f: 620, type: 'sine', pat: [[0, 1], [0.14, 0.84]], len: 0.16 }, Bobo: { f: 190, type: 'sine', pat: [[0, 1], [0.2, 0.9]], len: 0.3 },
  Pengu: { f: 460, type: 'square', pat: [[0, 1.2]], len: 0.22, glide: 0.7, soft: 1400 }, Fluff: { f: 400, type: 'triangle', pat: [[0, 1.1]], len: 0.5, vib: true },
};
Object.assign(sfx, {
  gift() { if (!ctx) return; const t = ctx.currentTime; [0, 4, 7].forEach((s, i) => tone(hz(79 + s), t + i * 0.06, 0.35, { vol: 0.14, rev: 0.4 })); noise(t, 0.08, 3000, 1, 0.05); },
  emote(name) { if (!ctx) return; const t = ctx.currentTime; if (name === 'cheer') [0, 4, 7, 12].forEach((s, i) => tone(hz(72 + s), t + i * 0.07, 0.3, { vol: 0.14, type: 'triangle' })); else if (name === 'dance') [0, 3, 7, 3].forEach((s, i) => tone(hz(67 + s), t + i * 0.12, 0.2, { vol: 0.12, type: 'square' })); else if (name === 'sit') tone(hz(60), t, 0.5, { vol: 0.1, glideTo: hz(55) }); else [0, 2, 0, 2].forEach((s, i) => tone(hz(76 + s), t + i * 0.1, 0.15, { vol: 0.12, type: 'triangle' })); },
  jump() { if (!ctx) return; const t = ctx.currentTime; tone(340, t, 0.18, { type: 'sine', vol: 0.1, glideTo: 620, rev: 0.1 }); },
  land() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.12, 220, 0.7, 0.18, 'lowpass'); tone(120, t, 0.12, { vol: 0.12, glideTo: 70, rev: 0 }); },
  step(surface = 'grass', run = false) { if (!ctx) return; const t = ctx.currentTime, v = run ? 0.09 : 0.06; if (surface === 'sand') noise(t, 0.09, 1800, 0.5, v * 0.8, 'lowpass'); else if (surface === 'water') { noise(t, 0.16, 1200, 0.8, v * 1.3, 'bandpass'); } else noise(t, 0.07, 2600 + Math.random() * 600, 0.9, v, 'bandpass'); },
  place() { if (!ctx) return; const t = ctx.currentTime; tone(hz(60), t, 0.2, { vol: 0.16, glideTo: hz(55), type: 'triangle', rev: 0.1 }); [0, 7, 12].forEach((s, i) => tone(hz(72 + s), t + 0.08 + i * 0.07, 0.3, { vol: 0.1 })); },
  level() { if (!ctx) return; const t = ctx.currentTime; [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone(hz(72 + s), t + i * 0.08, 0.5, { vol: 0.14, type: 'triangle', rev: 0.5 })); },
  voice(species) {
    if (!ctx) return; const v = VOICES[species] || VOICES.Puffle, t = ctx.currentTime, pitch = 1 + (Math.random() - 0.5) * 0.08;
    for (const [dt, m] of v.pat) {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = v.soft || 3000;
      o.type = v.type; o.frequency.setValueAtTime(v.f * m * pitch, t + dt); if (v.glide) o.frequency.exponentialRampToValueAtTime(v.f * m * pitch * v.glide, t + dt + v.len);
      if (v.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 9; lg.gain.value = 18; l.connect(lg); lg.connect(o.frequency); l.start(t + dt); l.stop(t + dt + v.len + 0.05); }
      g.gain.setValueAtTime(0, t + dt); g.gain.linearRampToValueAtTime(0.1, t + dt + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + v.len);
      o.connect(f); f.connect(g); g.connect(sfxBus); const r = ctx.createGain(); r.gain.value = 0.25; g.connect(r); r.connect(reverb); o.start(t + dt); o.stop(t + dt + v.len + 0.05);
    }
  },
});
// Ambient bed: birds by day, crickets at night (follows scene.userData.sky.night when the sky exposes it).
let ambTimer;
export function startAmbient() {
  if (!ctx || ambTimer) return;
  ambTimer = setInterval(() => {
    if (ctx.state !== 'running' || state.settings.mute) return;
    const sky = window.__game?.scene?.userData?.sky, night = sky ? (sky.night ?? 0) : 0, t = ctx.currentTime;
    if (night < 0.5) { if (Math.random() < 0.55 * (1 - night)) { const f = 2200 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) tone(f * (1 + i * 0.07), t + i * 0.11, 0.09, { type: 'sine', vol: 0.025, bus: ambBus, rev: 0.4, glideTo: f * (1.25 + (i % 2) * 0.1) }); } }
    else { const o = ctx.createOscillator(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain(); o.frequency.value = 4300 + Math.random() * 400; o.type = 'sine'; l.type = 'square'; l.frequency.value = 13 + Math.random() * 3; lg.gain.value = 0.014; g.gain.value = 0.014; l.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(ambBus); o.start(t); l.start(t); o.stop(t + 1.1); l.stop(t + 1.1); }
  }, 1200);
}
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
