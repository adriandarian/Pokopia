// Ambient bed (wind, pond, sea) + randomised calls (birds by day, crickets & a distant owl at night).
import { tone } from './synth.js';

export function createAmbience(env) {
  const c = env.ctx, bus = env.ambBus;
  const bed = (kind, filters, lfoHz, lfoDepth) => {
    const src = c.createBufferSource(); src.buffer = env.noise[kind]; src.loop = true;
    let node = src; for (const [type, f, q] of filters) { const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; node.connect(fl); node = fl; }
    const g = c.createGain(); g.gain.value = 0; node.connect(g); g.connect(bus);
    if (lfoHz) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = lfoHz; lg.gain.value = lfoDepth; l.connect(lg); lg.connect(g.gain); l.start(); }
    src.start(0, env.rng()); return { g, src, base: 0 };
  };
  // LFO depth is added around the (target) gain; keep depth small relative to the level so gain stays >= 0
  const wind = bed('pink', [['bandpass', 430, 0.5], ['lowpass', 1800, 0.3]], 0.07, 0.006);
  const pond = bed('pink', [['bandpass', 950, 0.7], ['lowpass', 2300, 0.4]], 0.31, 0.012);
  const sea = bed('brown', [['lowpass', 850, 0.5]], 0.11, 0.05);
  const surf = bed('pink', [['highpass', 1500, 0.4], ['lowpass', 5200, 0.4]], 0.11, 0.006);
  const A = { wind, pond, sea };
  const set = (b, v, t, tc = 0.6) => { b.g.gain.setTargetAtTime(Math.max(0, v), t, tc); };
  A.update = ({ wind: w = 0.3, pond: p = 0, sea: s = 0, t = c.currentTime }) => {
    set(wind, 0.012 + 0.016 * w, t, 1.2); set(pond, 0.03 * p * p, t); set(sea, 0.07 * s, t, 1.0); set(surf, 0.012 * s, t, 1.0);
  };

  // ---- calls ----
  const R = () => env.rng();
  A.bird = (t, kind = Math.floor(R() * 4)) => {
    const base = 2300 + R() * 1500, pan = (R() - 0.5) * 1.6, vol = 0.028 + R() * 0.02, o = { bus, rev: 0.35, pan };
    if (kind === 0) { const n = 3 + Math.floor(R() * 4); for (let i = 0; i < n; i++) tone(env, t + i * 0.075, base * (1 + i * 0.03), { ...o, vol, atk: 0.006, dur: 0.055, glideTo: base * 1.3 }); }
    else if (kind === 1) { tone(env, t, base * 1.1, { ...o, vol, atk: 0.02, dur: 0.22, glideTo: base * 1.18 }); tone(env, t + 0.3, base * 0.82, { ...o, vol, atk: 0.02, dur: 0.3, glideTo: base * 0.78 }); }
    else if (kind === 2) { const osc = c.createOscillator(), l = c.createOscillator(), lg = c.createGain(), g = c.createGain(), p = c.createStereoPanner ? c.createStereoPanner() : null;
      osc.frequency.setValueAtTime(base * 1.1, t); osc.frequency.exponentialRampToValueAtTime(base * 0.75, t + 0.45); l.frequency.value = 28 + R() * 14; lg.gain.value = 260; l.connect(lg); lg.connect(osc.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45); osc.connect(g); if (p) { p.pan.value = pan; g.connect(p); p.connect(bus); } else g.connect(bus);
      const s = c.createGain(); s.gain.value = 0.3; g.connect(s); s.connect(env.revIn); osc.start(t); l.start(t); osc.stop(t + 0.5); l.stop(t + 0.5); }
    else { for (let i = 0; i < 2; i++) { tone(env, t + i * 0.16, base * (i ? 1.25 : 1), { ...o, vol, atk: 0.01, dur: 0.12, glideTo: base * (i ? 1.0 : 1.4) }); } tone(env, t + 0.4, base * 1.5, { ...o, vol: vol * 0.8, atk: 0.01, dur: 0.1, glideTo: base * 1.1 }); }
  };
  A.cricket = (t) => {
    const f = 4200 + R() * 500, chirps = 2 + Math.floor(R() * 4), period = 0.26 + R() * 0.1, vol = 0.008 + R() * 0.006;
    const osc = c.createOscillator(), g = c.createGain(), p = c.createStereoPanner ? c.createStereoPanner() : null;
    osc.frequency.value = f; g.gain.setValueAtTime(0, t);
    for (let k = 0; k < chirps; k++) for (let q = 0; q < 3; q++) { const s = t + k * period + q * 0.045; g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(vol, s + 0.008); g.gain.linearRampToValueAtTime(0, s + 0.03); }
    osc.connect(g); if (p) { p.pan.value = (R() - 0.5) * 1.8; g.connect(p); p.connect(bus); } else g.connect(bus);
    osc.start(t); osc.stop(t + chirps * period + 0.1);
  };
  A.owl = (t) => { const o = { bus, rev: 0.7, lp: 700, pan: (R() - 0.5) }; tone(env, t, 430, { ...o, vol: 0.035, atk: 0.06, dur: 0.38, glideTo: 380 }); tone(env, t + 0.5, 360, { ...o, vol: 0.03, atk: 0.06, dur: 0.5, glideTo: 320 }); };
  /** Schedule random calls in [t, t+span). `night` 0..1. Meant to be driven every ~0.4 s. */
  A.step = (t, span, night) => {
    const day = 1 - night;
    if (R() < span * 0.35 * day * day) A.bird(t + R() * span);
    if (R() < span * 0.9 * night * night) A.cricket(t + R() * span);
    if (R() < span * 0.025 * night * night) A.owl(t + R() * span);
  };
  return A;
}
