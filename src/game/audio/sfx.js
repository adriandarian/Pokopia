// Tactile SFX recipes. createSfx(env) -> object of functions; every function takes an optional start time t.
import { hz, tone, noise, INST } from './synth.js';

const PENT = [0, 2, 4, 7, 9];
const scaleNote = (root, i) => root + PENT[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5);

// ---- creature voices: syllables with pitch contours, formant-ish filtering, vibrato, breath ----
export const VOICES = {
  Puffle: { vol: 0.22, syl: [{ dt: 0, dur: 0.1, f: [640, 930, 760], type: 'triangle', lp: 2600 }, { dt: 0.125, dur: 0.12, f: [760, 1090, 820], type: 'triangle', lp: 2600 }] },
  Bloop: { vol: 0.2, syl: [{ dt: 0, dur: 0.24, f: [330, 980, 520], type: 'sine', fm: [26, 55] }, { dt: 0.2, dur: 0.14, f: [420, 760, 460], type: 'sine', fm: [30, 30], v: 0.6 }] },
  Sunny: { vol: 0.17, syl: [{ dt: 0, dur: 0.09, f: [980, 1040], type: 'sine', over: 2 }, { dt: 0.08, dur: 0.09, f: [1240, 1300], type: 'sine', over: 2 }, { dt: 0.16, dur: 0.14, f: [1560, 1640, 1500], type: 'sine', over: 2 }] },
  Mochi: { vol: 0.2, syl: [{ dt: 0, dur: 0.42, f: [250, 340, 235], type: 'sawtooth', lp: 650, bp: [900, 2], vib: [5, 8], atk: 0.05 }] },
  Leafy: { vol: 0.17, syl: [{ dt: 0, dur: 0.32, f: [700, 920, 600], type: 'sine', vib: [6, 22], breath: 0.5 }, { dt: 0.3, dur: 0.18, f: [820, 560], type: 'sine', vib: [6, 16], breath: 0.4, v: 0.7 }] },
  Bobo: { vol: 0.28, syl: [{ dt: 0, dur: 0.34, f: [155, 215, 140], type: 'sine', sub: 0.5, lp: 900 }, { dt: 0.3, dur: 0.3, f: [135, 100], type: 'sine', sub: 0.5, lp: 800, v: 0.8 }] },
  Pengu: { vol: 0.14, syl: [{ dt: 0, dur: 0.09, f: [480, 820, 520], type: 'square', bp: [1250, 4] }, { dt: 0.12, dur: 0.09, f: [500, 860, 540], type: 'square', bp: [1300, 4] }, { dt: 0.28, dur: 0.16, f: [560, 400], type: 'square', bp: [1100, 4], v: 0.7 }] },
  Fluff: { vol: 0.2, syl: [{ dt: 0, dur: 0.6, f: [400, 470, 540, 440], type: 'triangle', lp: 1500, vib: [7, 12], atk: 0.1 }] },
};

export function createSfx(env) {
  const c = env.ctx;
  let combo = 0, lastCollect = -9;
  const now = () => c.currentTime;
  const jit = (x, a = 0.03) => x * (1 + (env.rng() - 0.5) * 2 * a);
  const bell = (t, m, vol = 0.2, L = 0.9, rev = 0.5) => { // glassy bell: fundamental + inharmonic partial
    const f = hz(m); tone(env, t, f, { vol, atk: 0.003, dur: L, rev }); tone(env, t, f * 2.76, { vol: vol * 0.22, atk: 0.002, dur: L * 0.35, rev: rev * 0.5 }); tone(env, t, f * 5.4, { vol: vol * 0.07, atk: 0.002, dur: L * 0.15 });
  };
  const twinkle = (t, n = 5, base = 90, spread = 14, vol = 0.05) => { for (let i = 0; i < n; i++) tone(env, t + i * 0.045 + env.rng() * 0.02, hz(base + PENT[Math.floor(env.rng() * 5)] + 12 * Math.floor(env.rng() * 2)), { vol, atk: 0.002, dur: 0.18, rev: 0.7, pan: (env.rng() - 0.5) * 1.4 }); };
  const woodTok = (t, f = 880, vol = 0.14) => { tone(env, t, f, { type: 'sine', vol, atk: 0.001, dur: 0.07, glideTo: f * 0.62 }); noise(env, t, 0.025, { f: 2400, q: 1.5, vol: vol * 0.35, atk: 0.001 }); };

  function syllable(t, v, sp, pitch) {
    const dur = sp.dur, vol = v.vol * (sp.v || 1), osc = c.createOscillator(), g = c.createGain();
    osc.type = sp.type; const f = sp.f.map(x => x * pitch);
    osc.frequency.setValueAtTime(f[0], t); f.slice(1).forEach((x, i) => osc.frequency.linearRampToValueAtTime(x, t + dur * (i + 1) / (f.length - 1)));
    let node = osc;
    const chain = (type, freq, q) => { const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = freq; if (q) fl.Q.value = q; node.connect(fl); node = fl; };
    if (sp.lp) chain('lowpass', sp.lp); else chain('lowpass', 4200);
    if (sp.bp) chain('bandpass', sp.bp[0] * pitch, sp.bp[1]);
    const atk = sp.atk || 0.012;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol * (sp.bp ? 2.2 : 1), t + atk); g.gain.setValueAtTime(vol * (sp.bp ? 2.2 : 1) * 0.85, t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g); g.connect(env.sfxBus); const rs = c.createGain(); rs.gain.value = 0.35; g.connect(rs); rs.connect(env.revIn);
    const lfos = [];
    if (sp.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = sp.vib[0]; lg.gain.value = sp.vib[1] * pitch; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.05); }
    if (sp.fm) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = sp.fm[0]; lg.gain.value = sp.fm[1]; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.05); }
    if (sp.over) tone(env, t, f[0] * sp.over, { vol: vol * 0.3, atk, dur, glideTo: f[f.length - 1] * sp.over, rev: 0.3 });
    if (sp.sub) tone(env, t, f[0] * 0.5, { vol: vol * sp.sub, atk: 0.02, dur: dur * 0.9, glideTo: f[f.length - 1] * 0.5 });
    if (sp.breath) noise(env, t, dur, { kind: 'pink', f: 3200 * pitch, q: 1.2, vol: vol * sp.breath * 0.35, atk: 0.04 });
    osc.start(t); osc.stop(t + dur + 0.06);
  }

  const S = {
    click(t = now()) { woodTok(t, jit(980, 0.04), 0.13); },
    hover(t = now()) { tone(env, t, jit(1500), { vol: 0.035, atk: 0.002, dur: 0.045 }); },
    open(t = now()) { noise(env, t, 0.22, { kind: 'pink', f: 500, fTo: 2600, q: 0.9, vol: 0.07, atk: 0.06 }); tone(env, t + 0.02, hz(79), { vol: 0.09, atk: 0.004, dur: 0.22, glideTo: hz(86), rev: 0.4 }); },
    close(t = now()) { noise(env, t, 0.2, { kind: 'pink', f: 2400, fTo: 450, q: 0.9, vol: 0.06, atk: 0.03 }); tone(env, t + 0.01, hz(77), { vol: 0.08, atk: 0.004, dur: 0.2, glideTo: hz(70), rev: 0.4 }); },
    nope(t = now()) { tone(env, t, 230, { type: 'triangle', vol: 0.14, atk: 0.004, dur: 0.12, glideTo: 190, lp: 900 }); tone(env, t + 0.11, 190, { type: 'triangle', vol: 0.13, atk: 0.004, dur: 0.16, glideTo: 140, lp: 800 }); },
    collect(t = now()) {
      combo = (t - lastCollect < 1.8) ? Math.min(combo + 1, 9) : 0; lastCollect = t;
      const m = scaleNote(76, combo);
      bell(t, m, 0.2, 0.7, 0.55); tone(env, t, hz(m - 12), { vol: 0.06, atk: 0.004, dur: 0.18 });
      noise(env, t, 0.1, { type: 'highpass', f: 5200, q: 0.5, vol: 0.02, atk: 0.001 });
      if (combo >= 4) tone(env, t + 0.06, hz(m + 7), { vol: 0.08, atk: 0.003, dur: 0.4, rev: 0.6 });
    },
    discover(t = now()) { [0, 2, 4, 7, 9].forEach((s, i) => bell(t + i * 0.085, 79 + s, 0.17, 0.9, 0.6)); twinkle(t + 0.4, 6, 93); },
    befriend(t = now()) {
      [[0, 0], [4, 0.1], [7, 0.2], [12, 0.3], [16, 0.42]].forEach(([s, d]) => INST.piano(env, { dry: env.sfxBus, wet: env.sfxBus }, t + d, 60 + s, 0.8, 1.4));
      [0, 4, 7, 12, 16, 19].forEach((s, i) => bell(t + 0.15 + i * 0.075, 79 + s, 0.14, 1.1, 0.7));
      tone(env, t + 0.55, hz(60), { vol: 0.12, atk: 0.02, dur: 1.4, rev: 0.5 }); tone(env, t + 0.55, hz(67), { vol: 0.08, atk: 0.03, dur: 1.4, rev: 0.5 });
      twinkle(t + 0.6, 10, 96);
    },
    quest(t = now()) { [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, i) => { bell(t + i * 0.1, 72 + s, 0.15, 0.8, 0.6); }); INST.piano(env, { dry: env.sfxBus, wet: env.sfxBus }, t + 0.8, 60, 0.8, 1.5); INST.piano(env, { dry: env.sfxBus, wet: env.sfxBus }, t + 0.8, 67, 0.7, 1.5); twinkle(t + 0.85, 6, 93); },
    buy(t = now()) { bell(t, 88, 0.14, 0.35, 0.3); bell(t + 0.07, 93, 0.15, 0.7, 0.5); noise(env, t, 0.05, { type: 'highpass', f: 6000, vol: 0.03, atk: 0.001 }); },
    gift(t = now()) { noise(env, t, 0.16, { kind: 'pink', f: 3000, fTo: 6000, q: 1, vol: 0.05, atk: 0.03 }); [0, 4, 7].forEach((s, i) => bell(t + 0.08 + i * 0.07, 79 + s, 0.13, 0.8, 0.6)); twinkle(t + 0.3, 4, 96); },
    level(t = now()) {
      [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => { bell(t + i * 0.075, 72 + s, 0.13, 0.9, 0.6); INST.pluck(env, { dry: env.sfxBus, wet: env.sfxBus }, t + i * 0.075, 60 + s, 0.55, 0.6); });
      [0, 4, 7].forEach(s => INST.piano(env, { dry: env.sfxBus, wet: env.sfxBus }, t + 0.6, 67 + s, 0.8, 2)); twinkle(t + 0.6, 10, 96);
    },
    place(t = now()) {
      tone(env, t, 150, { vol: 0.3, atk: 0.002, dur: 0.22, glideTo: 52 }); noise(env, t, 0.1, { kind: 'brown', type: 'lowpass', f: 700, q: 0.5, vol: 0.2, atk: 0.001 });
      noise(env, t + 0.02, 0.18, { kind: 'pink', f: 1800, fTo: 700, q: 0.8, vol: 0.05, atk: 0.01 });
      [0, 7, 12].forEach((s, i) => bell(t + 0.07 + i * 0.06, 84 + s, 0.09, 0.6, 0.6)); twinkle(t + 0.15, 4, 96, 14, 0.04);
    },
    jump(t = now()) { tone(env, t, 300, { vol: 0.09, atk: 0.006, dur: 0.17, glideTo: 560, type: 'triangle', lp: 1800, rev: 0.12 }); noise(env, t, 0.08, { kind: 'pink', f: 1200, fTo: 2400, q: 0.7, vol: 0.025, atk: 0.02 }); },
    land(t = now()) { tone(env, t, 110, { vol: 0.2, atk: 0.002, dur: 0.12, glideTo: 55 }); noise(env, t, 0.1, { kind: 'brown', type: 'lowpass', f: 600, q: 0.5, vol: 0.14, atk: 0.001 }); },
    step(surface = 'grass', run = false, t = now()) {
      const v = (run ? 1.25 : 1) * (0.85 + env.rng() * 0.3), p = 1 + (env.rng() - 0.5) * 0.2;
      switch (surface) {
        case 'sand': noise(env, t, 0.12, { kind: 'pink', type: 'lowpass', f: 1400 * p, q: 0.4, vol: 0.075 * v, atk: 0.012 }); break;
        case 'path': noise(env, t, 0.05, { kind: 'pink', f: 2200 * p, q: 1.1, vol: 0.075 * v, atk: 0.002 }); tone(env, t, 150 * p, { vol: 0.06 * v, atk: 0.002, dur: 0.06, glideTo: 90 }); break;
        case 'wood': tone(env, t, 170 * p, { vol: 0.12 * v, atk: 0.002, dur: 0.1, glideTo: 110 }); noise(env, t, 0.05, { f: 900 * p, q: 3, vol: 0.07 * v, atk: 0.001 }); tone(env, t + 0.002, 420 * p, { vol: 0.03 * v, atk: 0.001, dur: 0.05 }); break;
        case 'water': noise(env, t, 0.22, { kind: 'pink', f: 1100 * p, fTo: 2400, q: 1.1, vol: 0.09 * v, atk: 0.02 }); tone(env, t + 0.02, 600 * p, { vol: 0.03 * v, atk: 0.003, dur: 0.1, glideTo: 1100 }); break;
        default: noise(env, t, 0.07, { kind: 'pink', f: 2500 * p, q: 0.8, vol: 0.07 * v, atk: 0.006 }); noise(env, t, 0.1, { kind: 'brown', type: 'lowpass', f: 500, q: 0.4, vol: 0.05 * v, atk: 0.004 });
      }
    },
    emote(name, t = now()) {
      const D = { b: env.sfxBus, d: env.sfxBus };
      if (name === 'cheer') { [0, 4, 7, 12, 16].forEach((s, i) => INST.marimba(env, { dry: env.sfxBus, wet: env.sfxBus }, t + i * 0.065, 72 + s, 0.8, 0.5)); twinkle(t + 0.3, 8, 96); }
      else if (name === 'dance') [0, 4, 7, 4, 9, 7, 4, 0].forEach((s, i) => INST.marimba(env, D, t + i * 0.12 + (i % 2 ? 0.025 : 0), 67 + s, 0.65, 0.3));
      else if (name === 'sit') { tone(env, t, hz(64), { vol: 0.1, atk: 0.02, dur: 0.5, glideTo: hz(57), rev: 0.3, lp: 1500 }); noise(env, t, 0.14, { kind: 'brown', type: 'lowpass', f: 400, vol: 0.12, atk: 0.01 }); }
      else if (name === 'sense') { for (let i = 0; i < 9; i++) bell(t + i * 0.06, 74 + PENT[i % 5] + 12 * Math.floor(i / 5), 0.09, 1.0, 0.7); noise(env, t, 0.7, { kind: 'pink', f: 1500, fTo: 6000, q: 1.5, vol: 0.04, atk: 0.2, rev: 0.4 }); }
      else { [0, 2, 0, 4].forEach((s, i) => bell(t + i * 0.1, 79 + s, 0.12, 0.5, 0.5)); }
    },
    voice(species, t = now()) {
      const v = VOICES[species] || VOICES.Puffle, pitch = 1 + (env.rng() - 0.5) * 0.1;
      for (const sp of v.syl) syllable(t + sp.dt, v, sp, pitch);
    },
  };
  // Per-sfx loudness trim (dB-calibrated by offline render): each call routes through a trim gain that replaces sfxBus/revIn for its duration.
  const TRIM = { befriend: 0.34, quest: 0.34, level: 0.26, discover: 0.6, collect: 0.75, place: 0.75, click: 1.5, hover: 2, open: 2, close: 2, nope: 1.5, jump: 2.5, sit: 1.5, 'emote:cheer': 0.4, 'emote:dance': 0.42, 'emote:sit': 1.5, 'emote:wave': 1.1, 'voice:Bobo': 0.6, 'voice:Pengu': 1.5, 'step:grass': 5, 'step:sand': 4.5, 'step:path': 3, 'step:water': 3, 'step:wood': 1.6 };
  for (const k of Object.keys(S)) {
    const fn = S[k];
    S[k] = (...a) => {
      const key = k === 'step' ? 'step:' + (a[0] || 'grass') : k === 'emote' ? 'emote:' + a[0] : k === 'voice' ? 'voice:' + a[0] : k, tr = TRIM[key] ?? 1;
      if (tr === 1) return fn(...a);
      const g = c.createGain(); g.gain.value = tr; const bus = env.sfxBus, rev = env.revIn; const gr = c.createGain(); gr.gain.value = tr; g.connect(bus); gr.connect(rev);
      env.sfxBus = g; env.revIn = gr; try { return fn(...a); } finally { env.sfxBus = bus; env.revIn = rev; }
    };
  }
  S.collect.reset = () => { combo = 0; lastCollect = -9; };
  return S;
}
