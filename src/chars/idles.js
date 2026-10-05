// Species-flavoured idle behaviours for creatures: sleep (curled + zzz), dance, eat a berry, stretch+yawn, look around.
import * as THREE from 'three';
import { sphereGeo, toon } from './toon.js';

const DUR = { sleep: [8, 13], dance: [4, 6], eat: [4.6, 5.4], stretch: [2.8, 3.2], look: [4, 6] };
const KINDS = ['sleep', 'dance', 'eat', 'stretch', 'look'];
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const ZERO = () => ({ sy: 1, bounce: 0, rotX: 0, rotY: 0, rotZ: 0, armRaise: 0, armSwing: 0, mouth: 0, eye: null, ear: 0, tailCurl: 0, beak: 0, prop: 0 });

let berryProto;
export function makeBerryProp() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(sphereGeo(1, 12, 8), toon('#ff4d6d', { rim: 0.2, fuzz: 0 })); m.scale.setScalar(0.12); g.add(m);
  const l = new THREE.Mesh(sphereGeo(1, 8, 6), toon('#5fcf5a', { rim: 0 })); l.scale.set(0.07, 0.03, 0.05); l.position.y = 0.12; g.add(l);
  g.visible = false; return g;
}

export function pickIdle(c) {
  const w = c.sp.idles || {}; let tot = 0;
  for (const k of KINDS) tot += w[k] ?? 1;
  let r = Math.random() * tot, kind = 'look';
  for (const k of KINDS) { r -= w[k] ?? 1; if (r <= 0) { kind = k; break; } }
  const [a, b] = DUR[kind];
  return { kind, t: 0, dur: a + Math.random() * (b - a), z: 0, bites: 0 };
}

// returns modifiers for this frame; fx for zzz/notes
export function stepIdle(c, dt, t, fx, out) {
  const id = c.idle, k = id.kind; id.t += dt; const e = id.t, p = e / id.dur, ph = c.phase;
  const env = sm(0, 0.12, p) * (1 - sm(0.88, 1, p));   // blend in / out
  const top = c.top || 1.7;
  if (k === 'sleep') {
    out.sy = 1 - 0.16 * env + Math.sin(t * 1.7) * 0.035 * env; out.rotX = 0.16 * env; out.rotZ = 0.16 * env * (c.m.id % 2 ? 1 : -1);
    out.bounce = -0.04 * env; out.eye = 'sleep'; out.ear = 0.7 * env; out.tailCurl = env; out.armRaise = -0.3 * env;
    id.z -= dt; if (id.z <= 0 && env > 0.8) { id.z = 1.2; const pos = c.m.position.clone(); pos.y += top * 0.9; pos.x += 0.3;
      fx.spawn({ text: 'z', color: '#cfe8ff', pos, vel: new THREE.Vector3(0.35, 0.8, 0), drag: 0.6, life: 1.9, s0: 0.2, s1: 0.65, aspect: 2, pop: 1, fade: 0.5 }); }
  } else if (k === 'dance') {
    const b = Math.sin(e * 7.5 + ph);
    out.bounce = Math.abs(b) * 0.2 * env; out.sy = 1 + (Math.abs(b) < 0.25 ? -0.1 : 0.04) * env; out.rotZ = Math.sin(e * 3.75 + ph) * 0.22 * env; out.rotY = Math.sin(e * 3.75) * 0.5 * env;
    out.armRaise = (0.7 + 0.3 * b) * env; out.armSwing = b * env; out.mouth = 0.5 * env; out.eye = 'happy'; out.ear = Math.sin(e * 7.5) * 0.4 * env;
    id.z -= dt; if (id.z <= 0) { id.z = 0.5; fx.twinkle(c.m.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, top * (0.7 + Math.random() * 0.5), (Math.random() - 0.5) * 1.2)), '#fff1a8'); }
  } else if (k === 'eat') {
    // lift berry to the mouth, 3 bites with chewing, berry shrinks
    const lift = sm(0, 0.18, p); const chew = Math.abs(Math.sin(e * 9)) * sm(0.2, 0.3, p) * (1 - sm(0.86, 0.94, p));
    out.prop = lift * (1 - sm(0.86, 0.9, p)); out.armRaise = -1.6 * lift * (1 - sm(0.88, 1, p)); out.armSwing = 0; out.mouth = chew * 0.9; out.beak = chew;
    out.rotX = (0.08 + chew * 0.05) * env; out.bounce = chew * 0.02; out.eye = chew > 0.1 && Math.sin(e * 4.5) > 0.4 ? 'happy' : null;
    const bites = Math.floor(sm(0.2, 0.86, p) * 3.2); out.berrySize = Math.max(0.15, 1 - bites * 0.27);
    if (bites > id.bites) { id.bites = bites; fx.twinkle(c.m.position.clone().add(new THREE.Vector3(0, top * 0.5, 0.4)), '#ff8fa8'); }
  } else if (k === 'stretch') {
    const s = Math.sin(Math.PI * Math.min(1, p * 1.05));
    out.sy = 1 + 0.2 * s; out.armRaise = 1.25 * s; out.rotX = -0.2 * s; out.mouth = sm(0.3, 0.55, p) * (1 - sm(0.7, 0.95, p)); out.eye = s > 0.4 ? 'happy' : null; out.beak = out.mouth; out.ear = -0.3 * s;
    out.bounce = 0.02 * s;
  } else if (k === 'look') {
    const ang = Math.sin(e * 1.3 + ph) * 0.9 * env + Math.sin(e * 3.1) * 0.08;
    out.rotY = ang; out.rotZ = Math.sin(e * 1.3 + ph + 1.2) * 0.07 * env; out.ear = Math.sin(e * 6) * 0.25 * (Math.sin(e * 0.9) > 0.5 ? 1 : 0);
    out.rotX = -0.05 * env * Math.abs(Math.cos(e * 1.3 + ph));
  }
  return p >= 1;
}
