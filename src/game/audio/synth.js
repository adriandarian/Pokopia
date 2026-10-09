// Shared WebAudio synthesis kit: graph builder (works on live AND Offline contexts), reverb, noise, instruments.
export const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Generated stereo impulse: darkening exponential noise tail with a short pre-delay. Deterministic. */
export function makeImpulse(ctx, dur = 2.8, seed = 7) {
  const sr = ctx.sampleRate, n = Math.floor(sr * dur), pre = Math.floor(sr * 0.018), b = ctx.createBuffer(2, n, sr), r = mulberry(seed);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let lp = 0;
    for (let i = pre; i < n; i++) {
      const x = (i - pre) / (n - pre), env = Math.pow(1 - x, 2.6) * Math.min(1, (i - pre) / (sr * 0.012));
      const k = 0.62 - 0.5 * x;                      // one-pole lowpass: brighter early, warmer late
      lp += k * ((r() * 2 - 1) - lp);
      d[i] = lp * env * 1.6;
    }
  }
  return b;
}
/** Looping noise buffers: white, pink (Kellet) and brown. */
export function makeNoises(ctx, seed = 11) {
  const sr = ctx.sampleRate, n = sr * 2, r = mulberry(seed), mk = () => ctx.createBuffer(1, n, sr);
  const white = mk(), pink = mk(), brown = mk(), w = white.getChannelData(0), p = pink.getChannelData(0), br = brown.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, bl = 0;
  for (let i = 0; i < n; i++) {
    const x = r() * 2 - 1; w[i] = x;
    b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852; b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926;
    bl = (bl + 0.02 * x) / 1.02; br[i] = bl * 3.5;
  }
  // make loop seamless: short crossfade of the last 256 samples into the start
  for (const d of [w, p, br]) for (let i = 0; i < 256; i++) { const a = i / 256; d[n - 256 + i] = d[n - 256 + i] * (1 - a) + d[i] * a; }
  return { white, pink, brown };
}

/**
 * Build the full output graph. Everything (live game, tests) goes through this.
 *  master -> compressor -> limiter -> destination
 *  music: per-theme fade gains -> musicDuck -> musicGain -> master (+ sends to reverb)
 */
export function buildGraph(ctx, { seed = 1 } = {}) {
  const env = { ctx, rng: mulberry(seed) };
  env.master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 3; comp.attack.value = 0.012; comp.release.value = 0.25;
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.1;
  env.comp = comp; env.lim = lim;
  env.master.connect(comp); comp.connect(lim); lim.connect(ctx.destination);
  env.noise = makeNoises(ctx, seed + 3);
  env.reverb = ctx.createConvolver(); env.reverb.buffer = makeImpulse(ctx, 2.8, seed + 5);
  const wet = ctx.createGain(); wet.gain.value = 0.9; env.reverb.connect(wet); wet.connect(env.master); env.revOut = wet;
  env.revIn = ctx.createGain(); env.revIn.connect(env.reverb);
  // reverb input is low-passed so it never gets shrill
  const rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 5200; env.revIn.disconnect(); env.revIn.connect(rlp); rlp.connect(env.reverb);
  env.sfxBus = ctx.createGain(); env.sfxBus.gain.value = 1; env.sfxBus.connect(env.master);
  env.sfxRev = ctx.createGain(); env.sfxRev.gain.value = 0.32; env.sfxBus.connect(env.sfxRev); env.sfxRev.connect(env.revIn);
  env.ambBus = ctx.createGain(); env.ambBus.gain.value = 1; env.ambBus.connect(env.master);
  env.musicGain = ctx.createGain(); env.musicDuck = ctx.createGain(); env.musicDuck.connect(env.musicGain); env.musicGain.connect(env.master);
  return env;
}

// ---------------- primitives ----------------
function env_(g, t, atk, vol, dec, end = 0.0001) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + atk); g.gain.exponentialRampToValueAtTime(end, t + atk + dec); }

/** Generic enveloped oscillator. opts: type, vol, atk, dur, glideTo, det(cents), lp, bus, rev(0..1 send), pan */
export function tone(env, t, f, o = {}) {
  const c = env.ctx, { type = 'sine', vol = 0.2, atk = 0.008, dur = 0.3, glideTo, det = 0, lp, bus = env.sfxBus, rev = 0, hp, pan } = o;
  if (!(f > 0) || !isFinite(f) || !isFinite(t)) return;
  const osc = c.createOscillator(), g = c.createGain(); let tail = g;
  osc.type = type; osc.frequency.setValueAtTime(f, t); if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t + dur);
  if (det) osc.detune.value = det;
  env_(g, t, atk, vol, dur);
  let node = osc;
  if (lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; node.connect(fl); node = fl; }
  if (hp) { const fl = c.createBiquadFilter(); fl.type = 'highpass'; fl.frequency.value = hp; node.connect(fl); node = fl; }
  node.connect(g);
  if (pan !== undefined && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
  tail.connect(bus);
  if (rev && env.sfxRevSend !== false) { const s = c.createGain(); s.gain.value = rev; tail.connect(s); s.connect(env.revIn); }
  osc.start(t); osc.stop(t + atk + dur + 0.05);
}
/** Filtered noise burst. kind: white|pink|brown; filter type/freq/q, optional sweep to fTo. */
export function noise(env, t, dur, o = {}) {
  const c = env.ctx, { kind = 'white', type = 'bandpass', f = 2000, fTo, q = 0.8, vol = 0.1, atk = 0.004, bus = env.sfxBus, rev = 0, pan } = o;
  const src = c.createBufferSource(); src.buffer = env.noise[kind]; src.loop = true;
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (fTo) fl.frequency.exponentialRampToValueAtTime(fTo, t + dur); fl.Q.value = q;
  const g = c.createGain(); env_(g, t, atk, vol, dur);
  src.connect(fl); fl.connect(g); let tail = g;
  if (pan !== undefined && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
  tail.connect(bus);
  if (rev) { const s = c.createGain(); s.gain.value = rev; tail.connect(s); s.connect(env.revIn); }
  src.start(t, (env.rng() * 1.5)); src.stop(t + atk + dur + 0.05);
}

// ---------------- music instruments (dest = theme bus {dry, wet}) ----------------
// Each: (env, dest, t, midi, vel(0..1), dur). Gains tuned so vel 1 is ~ -14 dBFS pre-mix.
export const INST = {
  // Marimba: wooden bar, partials 1 : 4 (+ tiny knock), quick decay
  marimba(env, d, t, m, v = 0.7, dur = 1) {
    const f = hz(m), vol = 0.34 * v, decay = clamp(0.5 + dur * 0.5, 0.5, 1.4);
    tone(env, t, f, { vol, atk: 0.003, dur: decay, bus: d.dry, det: (env.rng() - 0.5) * 6 });
    tone(env, t, f * 4, { vol: vol * 0.22, atk: 0.002, dur: 0.14, bus: d.dry });
    tone(env, t, f * 0.5, { vol: vol * 0.25, atk: 0.003, dur: decay * 0.6, bus: d.dry });
    noise(env, t, 0.03, { f: 1800, q: 1.2, vol: vol * 0.14, atk: 0.001, bus: d.dry });
    tone(env, t, f, { vol: vol * 0.3, atk: 0.004, dur: decay * 1.4, bus: d.wet, det: 5 });
  },
  // Music box: inharmonic tuned tines
  musicbox(env, d, t, m, v = 0.7, dur = 1) {
    const f = hz(m), vol = 0.26 * v, L = clamp(1.0 + dur * 0.6, 1.0, 2.2);
    tone(env, t, f, { vol, atk: 0.002, dur: L, bus: d.dry, det: -3 });
    tone(env, t, f * 2.99, { vol: vol * 0.34, atk: 0.002, dur: L * 0.4, bus: d.dry, det: 4 });
    tone(env, t, f * 6.1, { vol: vol * 0.10, atk: 0.002, dur: L * 0.18, bus: d.dry });
    tone(env, t, f, { vol: vol * 0.55, atk: 0.003, dur: L * 1.3, bus: d.wet, det: 3 });
  },
  // Felt piano: two detuned triangles, soft attack, lowpass that closes as it decays, sine overtones
  piano(env, d, t, m, v = 0.7, dur = 1.5) {
    const f = hz(m), vol = 0.30 * v, L = clamp(0.9 + dur * 0.8, 1.2, 3.2), lp = 900 + 2400 * v * clamp(1.8 - m / 60, 0.4, 1.2);
    const c = env.ctx, fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(lp, t); fl.frequency.exponentialRampToValueAtTime(Math.max(300, lp * 0.3), t + L * 0.7);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + L);
    fl.connect(g); g.connect(d.dry); const s = c.createGain(); s.gain.value = 0.5; g.connect(s); s.connect(d.wet);
    for (const [ty, ratio, det, a] of [['triangle', 1, -5, 1], ['triangle', 1, 5, 0.8], ['sine', 2, 0, 0.3], ['sine', 3, 0, 0.1]]) {
      const o = c.createOscillator(), og = c.createGain(); o.type = ty; o.frequency.value = f * ratio; o.detune.value = det; og.gain.value = a; o.connect(og); og.connect(fl); o.start(t); o.stop(t + L + 0.05);
    }
  },
  // Soft plucked harp/guitar-ish: sine + triangle, fast pitch settle, pluck lowpass
  pluck(env, d, t, m, v = 0.7, dur = 1) {
    const f = hz(m), vol = 0.28 * v, L = clamp(0.7 + dur * 0.4, 0.8, 1.6);
    tone(env, t, f, { type: 'triangle', vol, atk: 0.003, dur: L, bus: d.dry, lp: 2600 });
    tone(env, t, f * 2, { vol: vol * 0.25, atk: 0.002, dur: L * 0.3, bus: d.dry });
    tone(env, t, f, { vol: vol * 0.4, atk: 0.004, dur: L * 1.3, bus: d.wet, det: 6 });
  },
  // Warm pad: detuned triangles, slow attack / long release, lowpassed
  pad(env, d, t, m, v = 0.5, dur = 6) {
    const f = hz(m), c = env.ctx, vol = 0.07 * v, atk = Math.min(1.4, dur * 0.35), rel = Math.min(2.2, dur * 0.5);
    const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 780 + m * 6; fl.Q.value = 0.3;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + atk); g.gain.setValueAtTime(vol, t + dur - rel * 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel);
    fl.connect(g); g.connect(d.wet); const s = c.createGain(); s.gain.value = 0.35; g.connect(s); s.connect(d.dry);
    for (const [ty, det] of [['triangle', -7], ['triangle', 7], ['sine', 0]]) { const o = c.createOscillator(); o.type = ty; o.frequency.value = f; o.detune.value = det; o.connect(fl); o.start(t); o.stop(t + dur + rel + 0.05); }
  },
  // Round bass pluck
  bass(env, d, t, m, v = 0.7, dur = 0.8) {
    const f = hz(m), vol = 0.34 * v, L = clamp(0.4 + dur * 0.5, 0.5, 1.6);
    tone(env, t, f, { vol, atk: 0.008, dur: L, bus: d.dry });
    tone(env, t, f * 2, { type: 'triangle', vol: vol * 0.18, atk: 0.006, dur: L * 0.4, bus: d.dry, lp: 700 });
  },
  kick(env, d, t, m, v = 0.6) {
    tone(env, t, 105, { vol: 0.34 * v, atk: 0.002, dur: 0.2, glideTo: 42, bus: d.dry });
    noise(env, t, 0.02, { f: 900, q: 0.6, vol: 0.03 * v, atk: 0.001, bus: d.dry });
  },
  shaker(env, d, t, m, v = 0.5) {
    noise(env, t, 0.055, { kind: 'white', type: 'bandpass', f: 5200, q: 0.9, vol: 0.05 * v, atk: 0.012, bus: d.dry, pan: (env.rng() - 0.5) * 0.5 });
  },
};
