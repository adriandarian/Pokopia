// Composed generative score. Four time-of-day themes share one pitch collection (C major pentatonic / A minor
// pentatonic) so any crossfade is consonant. Chords are voice-led, melodies are built from motifs
// (call / response / varied call / cadence), forms run A B A' and re-seed every cycle so loops are not obvious.
import { INST, mulberry } from './synth.js';

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const Q = { maj: [0, 4, 7], maj7: [0, 4, 7, 11], m: [0, 3, 7], m7: [0, 3, 7, 10], d7: [0, 4, 7, 10], sus: [0, 2, 7, 10], add9: [0, 4, 7, 14], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], six: [0, 4, 7, 9], min6: [0, 3, 7, 9] };
export function parseChord(s) {
  const [r, q = 'maj'] = s.split(':'); let pc = NOTE[r[0]]; if (r[1] === 'b') pc -= 1; if (r[1] === '#') pc += 1; pc = (pc + 12) % 12;
  let iv = Q[q]; if (iv.length > 4) iv = [iv[0], iv[1], iv[3], iv[4]].map(x => x); // drop the fifth in 9th chords
  const pcs = [...new Set(iv.map(i => (pc + i) % 12))];
  return { name: s, root: pc, pcs };
}

// ---- progression pools (four chords each). 'a' = A-section pool, 'b' = contrasting B pool. ----
const P = {
  morning: {
    a: [['C:maj7', 'A:m7', 'F:maj7', 'G:sus'], ['C:maj', 'E:m7', 'F:maj7', 'G:maj'], ['F:maj7', 'G:six', 'E:m7', 'A:m7'], ['C:add9', 'G:maj', 'A:m7', 'F:maj7']],
    b: [['D:m7', 'G:d7', 'C:maj7', 'A:m7'], ['F:maj', 'C:maj', 'D:m7', 'G:sus'], ['C:maj', 'Bb:maj', 'F:maj7', 'C:maj'], ['A:m7', 'D:m7', 'F:maj7', 'G:six']],
  },
  day: {
    a: [['C:maj7', 'D:maj', 'E:m7', 'F:maj7'], ['C:maj', 'G:maj', 'A:m7', 'F:maj'], ['C:maj7', 'Bb:maj', 'F:maj7', 'G:sus'], ['F:maj7', 'E:m7', 'D:m7', 'C:maj7']],
    b: [['A:m7', 'F:maj7', 'C:maj', 'G:sus'], ['D:m7', 'G:d7', 'C:maj7', 'F:maj7'], ['F:maj', 'G:maj', 'E:m7', 'A:m7'], ['C:maj', 'F:m', 'C:maj', 'G:sus']],
  },
  golden: {
    a: [['A:m7', 'F:maj7', 'C:maj', 'G:sus'], ['F:maj7', 'E:m7', 'A:m7', 'D:m7'], ['D:m7', 'G:d7', 'C:maj7', 'F:maj7'], ['A:m7', 'D:m7', 'G:d7', 'C:maj7']],
    b: [['F:maj7', 'G:six', 'A:m7', 'A:m7'], ['F:maj', 'C:maj', 'D:m7', 'E:sus'], ['C:maj7', 'A:m7', 'D:m7', 'G:d7'], ['F:maj7', 'F:min6', 'C:maj7', 'A:m7']],
  },
  night: {
    a: [['A:m9', 'D:sus', 'F:maj9', 'E:m7'], ['C:maj9', 'A:m9', 'F:maj9', 'G:sus'], ['A:m7', 'F:maj7', 'C:maj7', 'G:sus'], ['F:maj9', 'E:m7', 'D:m7', 'E:m7']],
    b: [['F:maj7', 'E:m7', 'D:m7', 'E:m7'], ['D:m9', 'A:m9', 'F:maj9', 'C:maj9'], ['A:m9', 'C:maj9', 'F:maj9', 'A:m7']],
  },
};
for (const th of Object.values(P)) for (const k of ['a', 'b']) th[k] = th[k].map(pr => pr.map(parseChord));

// ---- rhythm cells for the melody (position, length) in 8ths over one 4/4 bar ----
const RHY = {
  sparse: [[[0, 4], [4, 2]], [[0, 3], [4, 4]], [[2, 2], [6, 2]], [[0, 8]], [[0, 2], [3, 3]]],
  mid: [[[0, 3], [3, 1], [4, 2], [6, 2]], [[0, 2], [2, 1], [3, 1], [4, 4]], [[1, 1], [2, 2], [4, 1], [5, 1], [6, 2]], [[0, 2], [3, 2], [6, 2]], [[0, 4], [4, 2], [6, 2]], [[2, 2], [4, 2], [6, 2]]],
  busy: [[[0, 1], [1, 1], [2, 2], [4, 1], [5, 1], [6, 2]], [[0, 1], [2, 1], [3, 1], [4, 2], [6, 1], [7, 1]], [[0, 3], [3, 1], [4, 1], [5, 1], [6, 2]], [[1, 1], [2, 1], [3, 2], [5, 1], [6, 2]]],
};
const CONTOURS = [[0, 1, 1, -1], [0, 2, -1, -1], [0, -1, 2, 1], [0, 1, -2, 2], [0, 2, 1, -2], [0, -1, -1, 3], [0, 1, 0, -1]];

const BASS = {
  held: [[[0, 7, 0]], [[0, 7, 0], [4, 7, 7]]],
  walk: [[[0, 3, 0], [3, 2, 0], [4, 3, 7]], [[0, 3, 0], [4, 3, 7], [6, 2, 12]], [[0, 2, 0], [3, 2, 0], [4, 2, 7], [6, 2, 0]]],
  soft: [[[0, 8, 0]], [[0, 6, 0]]],
};
// arp patterns: [step, voice index (0=low), octave shift]; voice index wraps over chord size
const ARP = [
  [[0, 0, 0], [2, 1, 0], [4, 2, 0], [6, 1, 0]],
  [[0, 0, 0], [1, 2, 0], [3, 1, 0], [4, 2, 0], [6, 3, 0]],
  [[0, 1, 0], [3, 2, 0], [5, 3, 0], [7, 2, 0]],
  [[0, 0, 0], [3, 1, 0], [6, 2, 0]],
  [[0, 2, 0], [2, 3, 0], [4, 2, 0], [6, 1, 0]],
];

// ---- theme configuration ----
const THEMES = {
  morning: { bpm: 76, swing: 0.10, chordBars: 1, mel: ['musicbox', 'marimba'], arp: 'pluck', arpP: 0.75, rhy: ['sparse', 'mid'], rest: 0.28, orn: 0.10, lo: 69, hi: 88, pad: 0.45, bass: 'soft', bassV: 0.5, perc: false, turn: 'G:sus', gain: 1.12 },
  day: { bpm: 88, swing: 0.22, chordBars: 1, mel: ['marimba', 'piano', 'musicbox'], arp: 'piano', arpP: 0.7, rhy: ['mid', 'busy'], rest: 0.18, orn: 0.12, lo: 67, hi: 88, pad: 0.30, bass: 'walk', bassV: 0.7, perc: true, turn: 'G:d7', gain: 1.0 },
  golden: { bpm: 72, swing: 0.16, chordBars: 1, mel: ['piano', 'musicbox'], arp: 'piano', arpP: 0.55, rhy: ['sparse', 'mid'], rest: 0.30, orn: 0.08, lo: 64, hi: 84, pad: 0.7, bass: 'held', bassV: 0.6, perc: false, turn: 'E:sus', gain: 1.0 },
  night: { bpm: 70, swing: 0.06, chordBars: 2, mel: ['musicbox'], arp: 'musicbox', arpP: 0.4, rhy: ['sparse'], rest: 0.42, orn: 0.05, lo: 72, hi: 91, pad: 0.85, bass: 'soft', bassV: 0.45, perc: false, turn: 'G:sus', gain: 0.82 },
};
export const THEME_NAMES = Object.keys(THEMES);
const FORM = ['A', 'B', 'A2'];
const PC_PENT = [0, 2, 4, 7, 9];

// ---- voice leading: choose the voicing nearest the previous one ----
export function voiceLead(prev, pcs, lo = 52, hi = 71) {
  const opts = pcs.map(pc => { const a = []; for (let m = lo; m <= hi; m++) if (m % 12 === pc) a.push(m); return a; });
  let best = null, bestC = 1e9;
  const rec = (i, cur) => {
    if (i === opts.length) {
      const s = [...cur].sort((a, b) => a - b); let c = 0;
      if (prev) { for (let k = 0; k < s.length; k++) c += Math.abs(s[k] - prev[Math.min(k, prev.length - 1)]); }
      else for (const x of s) c += Math.abs(x - 62);
      c += Math.max(0, (s[s.length - 1] - s[0]) - 12) * 2; // keep it compact
      for (let k = 1; k < s.length; k++) if (s[k] - s[k - 1] < 3) c += 3; // avoid muddy seconds
      if (c < bestC) { bestC = c; best = s; }
      return;
    }
    for (const m of opts[i]) rec(i + 1, [...cur, m]);
  };
  rec(0, []);
  return best || [60, 64, 67];
}

const pick = (r, a) => a[Math.floor(r() * a.length)];

/**
 * createMusic: returns an engine. fill(untilTime) schedules whole bars into the context up to untilTime.
 * themeBus: per theme {dry, wet} input nodes (fade gains). onNote: optional note logger (tests).
 */
export function createMusic(env, { seed = 1, getTheme = () => 'day', onNote = null, startAt = 0.2 } = {}) {
  const c = env.ctx, buses = {};
  for (const name of THEME_NAMES) {
    const fadeD = c.createGain(), fadeW = c.createGain(); fadeD.gain.value = 0; fadeW.gain.value = 0;
    fadeD.connect(env.musicDuck); fadeW.connect(env.musicDuck);
    const sD = c.createGain(), sW = c.createGain(); sD.gain.value = 0.14; sW.gain.value = 0.55; fadeD.connect(sD); fadeW.connect(sW); sD.connect(env.revIn); sW.connect(env.revIn);
    buses[name] = { dry: fadeD, wet: fadeW, fades: [fadeD, fadeW] };
  }
  const E = { buses, theme: null, bar: 0, secBar: 0, secIdx: 0, nextT: startAt, rngSeed: seed, stats: { bars: 0, notes: 0 }, onNote };
  let sec = null, voicing = null, curChord = null, lastProgs = {}, sessionRng = mulberry(seed);
  const note = (inst, bus, role, th, t, midi, vel, dur) => {
    if (!isFinite(t) || !isFinite(midi)) return;
    INST[inst](env, bus, t, midi, vel, dur); E.stats.notes++;
    if (E.onNote) E.onNote({ t, dur, midi, inst, role, theme: th, vel });
  };
  function setActive(name, t, instant) {
    for (const n of THEME_NAMES) for (const g of buses[n].fades) {
      const target = n === name ? THEMES[n].gain : 0;
      g.gain.cancelScheduledValues(t);
      if (instant) g.gain.setValueAtTime(target, t); else { g.gain.setValueAtTime(g.gain.value, t); g.gain.setTargetAtTime(target, t, 2.3); }
    }
  }
  function planSection(th) {
    const kind = FORM[E.secIdx % 3], cfg = THEMES[th], r = mulberry(seed * 7919 + E.secIdx * 104729 + 13);
    const cyc = Math.floor(E.secIdx / 3);
    E.cycle = E.cycle || {};
    if (kind === 'A' || !E.cycle[th]) {
      const pool = P[th].a; let pi; do { pi = Math.floor(r() * pool.length); } while (pool.length > 1 && pi === lastProgs[th + 'a']); lastProgs[th + 'a'] = pi;
      const poolB = P[th].b; let pj; do { pj = Math.floor(r() * poolB.length); } while (poolB.length > 1 && pj === lastProgs[th + 'b']); lastProgs[th + 'b'] = pj;
      const mk = () => ({ rhy: [pick(r, RHY[pick(r, cfg.rhy)]), pick(r, RHY[pick(r, cfg.rhy)])], contour: pick(r, CONTOURS), start: Math.floor(r() * 3), inst: pick(r, cfg.mel) });
      E.cycle[th] = { A: { prog: pool[pi], motif: mk() }, B: { prog: poolB[pj], motif: mk() }, arp: pick(r, ARP), bass: pick(r, BASS[cfg.bass]) };
    }
    const cy = E.cycle[th], base = kind === 'B' ? cy.B : cy.A;
    sec = { kind, th, prog: base.prog, motif: base.motif, arp: kind === 'B' ? pick(r, ARP) : cy.arp, bass: cy.bass, r, cyc, shift: kind === 'A2' ? 1 : 0, lastMidi: null, intro: E.bar === 0 };
    if (kind === 'A2') sec.motif = { ...base.motif, inst: cfg.mel[(cfg.mel.indexOf(base.motif.inst) + 1) % cfg.mel.length] };
  }
  function scaleFor(chord, lo, hi) {
    const set = new Set([...PC_PENT, ...chord.pcs]), out = [];
    for (let m = lo; m <= hi; m++) if (set.has(m % 12)) out.push(m);
    return out;
  }
  function melody(T0, step, cfg, b, chord, bus) {
    const r = sec.r, motif = sec.motif, inCall = b % 2 === 0, last = b === 7, notes = scaleFor(chord, cfg.lo + sec.shift * 0, cfg.hi);
    const cadence = last || b === 3;
    if (sec.intro) return;
    // breath: some response bars are pure rests (leaves space) — never on the cadence bar
    if (!inCall && !cadence && r() < cfg.rest) return;
    if (inCall && r() < cfg.rest * 0.4 && b > 0) return;
    let rhy = inCall ? motif.rhy[0] : motif.rhy[1];
    if (b >= 4 && r() < 0.5) rhy = inCall ? motif.rhy[1] : motif.rhy[0]; // vary the repeat
    let idx;
    if (sec.lastMidi == null) idx = Math.min(notes.length - 1, Math.max(0, Math.floor(notes.length * (0.35 + 0.1 * motif.start)))); else { idx = 0; let bd = 1e9; notes.forEach((m, i) => { const d = Math.abs(m - sec.lastMidi); if (d < bd) { bd = d; idx = i; } }); }
    const sgn = inCall ? 1 : -1; const cont = motif.contour;
    rhy.forEach(([pos, len], k) => {
      idx += sgn * cont[k % cont.length] * (b >= 4 && k % 2 ? 1 : 1);
      if (b >= 4 && r() < 0.25) idx += r() < 0.5 ? 1 : -1;
      idx = Math.min(notes.length - 1, Math.max(0, idx));
      const strong = pos === 0 || pos === 4 || len >= 3, final = cadence && k === rhy.length - 1;
      if (strong || final || r() < 0.3) { // snap to chord tone
        let bi = idx, bd = 99; for (let d = -3; d <= 3; d++) { const i = idx + d; if (i < 0 || i >= notes.length) continue; if (chord.pcs.includes(notes[i] % 12) && Math.abs(d) < bd) { bd = Math.abs(d); bi = i; } } idx = bi;
      }
      if (final) { // resolve on root or third, long
        let bi = idx, bd = 99; for (let i = 0; i < notes.length; i++) { const pc = notes[i] % 12; if ((pc === chord.root || pc === chord.pcs[1]) && Math.abs(i - idx) < bd) { bd = Math.abs(i - idx); bi = i; } } idx = bi;
      }
      const m = notes[idx], dur = (final ? Math.min(8 - pos, 6) : len) * step, vel = (strong ? 0.78 : 0.6) * (0.88 + r() * 0.24);
      const t = T0 + pos * step + (pos % 2 ? cfg.swing * step : 0) + (r() - 0.5) * 0.014;
      if (r() < cfg.orn && !final && idx + 1 < notes.length) note(motif.inst, bus, 'grace', sec.th, t - 0.07, notes[idx + 1], vel * 0.45, 0.2);
      note(motif.inst, bus, 'melody', sec.th, t, m, vel, dur);
      sec.lastMidi = m;
      if (sec.kind === 'A2' && r() < 0.18 && pos < 6) note('musicbox', bus, 'echo', sec.th, t + step * 1.5, m + 12 > cfg.hi + 4 ? m : m + 12, vel * 0.32, 0.5); // gentle high echo
    });
  }
  function scheduleBar() {
    const T0 = E.nextT;
    // theme decision (only at even bars so phrases stay together)
    const want = getTheme();
    if (E.theme !== want && (E.theme === null || E.secBar % 2 === 0)) {
      const first = E.theme === null; E.theme = want; setActive(want, T0, first);
      E.secIdx = Math.floor(E.secIdx / 3) * 3 + (first ? 0 : 3); E.secBar = 0; sec = null; voicing = null; E.switches = (E.switches || 0) + 1;
    }
    const th = E.theme, cfg = THEMES[th], bus = buses[th];
    if (!sec || E.secBar >= 8) { if (sec && E.secBar >= 8) { E.secIdx++; E.secBar = 0; } planSection(th); }
    const b = E.secBar, step = 60 / cfg.bpm / 2, barLen = step * 8, r = sec.r;
    // chord for this bar
    const ci = Math.floor(b / cfg.chordBars) % sec.prog.length;
    let chord = sec.prog[ci];
    if (b === 7 && cfg.chordBars === 1 && sec.kind !== 'A2' && r() < 0.5) chord = parseChord(cfg.turn);
    const change = b % cfg.chordBars === 0;
    if (change || !voicing) {
      voicing = voiceLead(voicing, chord.pcs); curChord = chord;
      // pad, voice-led, held through the chord
      const padDur = cfg.chordBars * barLen;
      voicing.forEach(m => note('pad', bus, 'pad', th, T0 + (r() * 0.05), m, cfg.pad, padDur));
    }
    chord = curChord;
    let bassRoot = chord.root; while (bassRoot < 38) bassRoot += 12; while (bassRoot > 49) bassRoot -= 12;
    // bass
    const bpat = sec.bass;
    if (cfg.bass === 'soft' ? (b % 2 === 0) : true) for (const [pos, len, off] of bpat) {
      if (cfg.chordBars === 2 && b % 2 === 1 && pos === 0) continue;
      const t = T0 + pos * step + (pos % 2 ? cfg.swing * step : 0) + (r() - 0.5) * 0.012;
      note('bass', bus, 'bass', th, t, bassRoot + off, cfg.bassV * (0.9 + r() * 0.2), len * step);
    }
    // arpeggio / comping
    if (!sec.intro || b > 0) for (const [pos, vi, oct] of sec.arp) {
      if (r() > cfg.arpP) continue;
      const m = voicing[vi % voicing.length] + 12 + oct * 12;
      const t = T0 + pos * step + (pos % 2 ? cfg.swing * step : 0) + (r() - 0.5) * 0.016;
      note(cfg.arp, bus, 'arp', th, t, m, 0.34 + r() * 0.14, step * 2);
    }
    // melody
    melody(T0, step, cfg, b, chord, bus);
    // percussion: soft kick on 1 (and sometimes 3), brushed shaker on swung offbeats — day only
    if (cfg.perc && !(sec.intro && b < 2)) {
      note('kick', bus, 'kick', th, T0, 36, 0.55, 0.2);
      if (r() < 0.55) note('kick', bus, 'kick', th, T0 + 4 * step + cfg.swing * 0 + (r() - 0.5) * 0.01, 36, 0.4, 0.2);
      for (let s = 1; s < 8; s += 2) if (r() < 0.85) note('shaker', bus, 'shaker', th, T0 + s * step + cfg.swing * step + (r() - 0.5) * 0.01, 60, s === 3 || s === 7 ? 0.62 : 0.4, 0.06);
      for (const s of [2, 6]) if (r() < 0.4) note('shaker', bus, 'shaker', th, T0 + s * step + (r() - 0.5) * 0.008, 60, 0.25, 0.06);
    }
    if (b >= 1) sec.intro = false;
    E.stats.bars++; E.secBar++; E.bar++; E.nextT = T0 + barLen;
  }
  E.fill = (until) => { let guard = 0; while (E.nextT < until && guard++ < 64) scheduleBar(); };
  E.resync = (now) => { if (E.nextT < now) { E.nextT = now + 0.1; } };
  E.setGetTheme = (f) => { getTheme = f; };
  E.themes = THEMES;
  return E;
}
