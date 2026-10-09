import * as THREE from 'three';
import { toon, part, sphereGeo, mergeColored } from './toon.js';
import { addFace } from './face.js';

const S = () => sphereGeo(1, 24, 16);
const FUR = { rim: 0.3, fuzz: 0.3, rimTint: true };         // felt / fur body parts
const FLAT = { rim: 0, fuzz: 0, rimTint: true, fill: 0.14 };  // inner ear, pads, belly details
const GLOSS = { rim: 0.15, fuzz: 0, rimTint: true };          // slime
const E = (parent, color, pos, scale, o = {}) => part(parent, S(), toon(color, o.mat || FUR), { pos, scale, rot: o.rot, line: o.line ?? 0.028, cast: true });
const pivot = (parent, pos) => { const g = new THREE.Group(); g.position.set(...pos); parent.add(g); return g; };

// static feet with toe beans (merged into the body at bake time)
function feet(g, color, x = 0.28, z = 0.18, y = 0.1, sc = [0.2, 0.12, 0.26], toe = '#ffffff') {
  [-1, 1].forEach(sx => {
    E(g, color, [sx * x, y, z], sc);
    for (let k = -1; k <= 1; k++) E(g, toe, [sx * x + k * sc[0] * 0.5, y - sc[1] * 0.1, z + sc[2] * 0.82], [sc[0] * 0.26, sc[1] * 0.45, sc[0] * 0.26], { mat: FLAT, line: 0 });
  });
}
// little arms with round paws; pivot at the shoulder so they can wave / swing / raise
function arms(g, color, { x = 0.58, y = 0.6, z = 0.12, len = 0.17, paw = null, w = 0.1 } = {}) {
  return [-1, 1].map(sx => {
    const p = pivot(g, [sx * x, y, z]); p.rotation.z = sx * 0.4;
    part(p, S(), toon(color, FUR), { pos: [0, -len * 0.7, 0], scale: [w, len, w * 0.95], line: 0.024 });
    part(p, S(), toon(paw || color, FUR), { pos: [0, -len * 1.55, 0.01], scale: [w * 1.1, w * 1.05, w * 1.05], line: 0.022 });
    return { g: p, side: sx, base: sx * 0.4 };
  });
}
const whiskers = (g, color, x, y, z) => {
  const items = [];
  for (const sx of [-1, 1]) for (const dy of [-0.04, 0.04]) items.push({ geo: new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), color, pos: [sx * x, y + dy, z], rot: [0, sx * -0.5, Math.PI / 2 + sx * dy * 4] });
  g.add(new THREE.Mesh(mergeColored(items), new THREE.MeshBasicMaterial({ vertexColors: true })));
};

// Each builder returns { ears, tail, wings, leaves, arms, jaw, extra, face, top, mood } where the pivots animate.
export const SPECIES = [
  { name: 'Puffle', sig: 'twitch', color: '#ff9cc8', idles: { eat: 3, sleep: 1, look: 2, dance: 1, stretch: 1 }, build(g) { // pink bunny
    const c = '#ff9cc8', dk = '#f57fb2', R = [0.64, 0.6, 0.6];
    E(g, c, [0, 0.64, 0], R);
    // real muzzle: two cheek puffs + chin + nose + buck teeth
    for (const sx of [-1, 1]) E(g, '#fff3f8', [sx * 0.11, 0.5, 0.47], [0.17, 0.14, 0.15], { line: 0.02 });
    E(g, '#fff3f8', [0, 0.4, 0.5], [0.12, 0.09, 0.1], { line: 0.018 });
    E(g, '#ff6f9f', [0, 0.585, 0.605], [0.055, 0.04, 0.04], { mat: FLAT, line: 0.012 });
    for (const sx of [-1, 1]) E(g, '#ffffff', [sx * 0.03, 0.375, 0.58], [0.028, 0.04, 0.02], { mat: FLAT, line: 0.01 });
    E(g, '#ffd3e6', [0, 0.28, 0.2], [0.35, 0.22, 0.25], { mat: FLAT, line: 0 }); // belly
    feet(g, dk, 0.27, 0.2, 0.1, [0.2, 0.12, 0.28], '#ffd3e6');
    const ears = [-1, 1].map(sx => {
      const p = pivot(g, [sx * 0.3, 1.08, -0.02]); p.rotation.z = -sx * 0.18;
      part(p, new THREE.CapsuleGeometry(0.15, 0.5, 6, 12), toon(c, FUR), { pos: [0, 0.32, 0], scale: [0.85, 1, 0.55], line: 0.028 });
      part(p, new THREE.CapsuleGeometry(0.08, 0.38, 6, 10), toon('#ffc0da', FLAT), { pos: [0, 0.32, 0.06], scale: [0.85, 1, 0.4], line: 0 });
      return { g: p, base: -sx * 0.18, side: sx };
    });
    const tail = pivot(g, [0, 0.5, -0.58]); E(tail, '#ffffff', [0, 0, -0.04], [0.2, 0.2, 0.2]);
    const ar = arms(g, c, { x: 0.6, y: 0.6, z: 0.14, paw: '#ffd3e6' });
    const face = addFace(g, R, [0, 0.64, 0], { ex: 0.38, ey: 0.14, size: 0.1, mouthAt: [0, 0.455, 0.672], mouthKind: 'w', msize: 0.08, cheek: '#ff7aa8' });
    return { ears, tail, wings: [], leaves: [], arms: ar, face, top: 1.9 };
  } },
  { name: 'Bloop', sig: 'wobble', color: '#4fc3f7', idles: { dance: 3, look: 2, stretch: 2, sleep: 1, eat: 1 }, build(g) { // blue gel droplet (opaque, glossy)
    const c = '#49bdf2', R = [0.72, 0.6, 0.66], G = GLOSS;
    E(g, c, [0, 0.58, 0], R, { mat: G });
    E(g, c, [0, 1.12, 0], [0.4, 0.4, 0.38], { mat: G });
    E(g, '#2fa3de', [0, 0.1, 0.05], [0.8, 0.1, 0.74], { line: 0, mat: G });   // puddle skirt
    E(g, '#8fe1ff', [0, 0.3, 0.3], [0.44, 0.22, 0.3], { line: 0, mat: { ...FLAT, fill: 0.2 } }); // lighter belly
    const tip = pivot(g, [0, 1.4, 0]);
    part(tip, new THREE.ConeGeometry(0.18, 0.42, 14), toon(c, G), { pos: [0, 0.12, 0], line: 0.028 });
    // glossy highlights (unlit white) give the sheen
    E(g, '#ffffff', [-0.34, 0.9, 0.4], [0.1, 0.19, 0.05], { rot: [0, 0, 0.5], line: 0, mat: { rim: 0, fuzz: 0, fill: 1, rimTint: true } });
    E(g, '#ffffff', [-0.2, 1.1, 0.34], [0.05, 0.05, 0.03], { line: 0, mat: { rim: 0, fuzz: 0, fill: 1, rimTint: true } });
    E(g, '#e6f9ff', [0.38, 0.5, 0.42], [0.06, 0.1, 0.04], { rot: [0, 0, -0.5], line: 0, mat: { rim: 0, fuzz: 0, fill: 1, rimTint: true } });
    const ar = arms(g, c, { x: 0.7, y: 0.55, z: 0.1, len: 0.12, w: 0.11 }); ar.forEach(a => a.g.children.forEach(m => { m.material = toon(c, G); }));
    return { ears: [], tail: null, wings: [], leaves: [], arms: ar, extra: tip, face: addFace(g, R, [0, 0.58, 0], { ex: 0.36, ey: 0.1, size: 0.115, tongue: true, msize: 0.12, cheek: '#ff93b8' }), top: 1.9 };
  } },
  { name: 'Sunny', sig: 'peep', color: '#ffe066', idles: { dance: 3, look: 3, stretch: 1, eat: 2, sleep: 1 }, build(g) { // yellow chick
    const c = '#ffe36e', R = [0.64, 0.62, 0.62];
    E(g, c, [0, 0.66, 0], R);
    E(g, '#fff6c2', [0, 0.5, 0.24], [0.42, 0.34, 0.34], { line: 0, mat: FLAT });
    feet(g, '#ffa63a', 0.22, 0.15, 0.07, [0.15, 0.07, 0.22], '#ff8a1e');
    const wings = [-1, 1].map(sx => {
      const p = pivot(g, [sx * 0.62, 0.7, 0]);
      part(p, S(), toon('#ffd23f', FUR), { pos: [sx * 0.08, -0.12, 0], scale: [0.13, 0.3, 0.22], rot: [0, 0, sx * 0.3], line: 0.025 });
      return { g: p, side: sx };
    });
    const tuft = pivot(g, [0, 1.25, 0.08]);
    [[-0.1, 0, -0.35], [0, 0.05, 0], [0.1, 0, 0.35]].forEach(([x, y, r]) => part(tuft, S(), toon('#ffd23f', FUR), { pos: [x, y + 0.1, 0], scale: [0.07, 0.2, 0.06], rot: [0, 0, r], line: 0.02 }));
    const f = addFace(g, R, [0, 0.66, 0], { ex: 0.42, ey: 0.16, size: 0.1, mouth: false, cheek: '#ff9d6e' });
    // two-part beak: the lower half is a jaw that opens to peep / eat
    E(g, '#ff9a2e', [0, 0.665, 0.6], [0.14, 0.06, 0.12], { line: 0.02, mat: FLAT });
    const jaw = pivot(g, [0, 0.64, 0.56]); part(jaw, S(), toon('#ff8a1e', FLAT), { pos: [0, -0.02, 0.05], scale: [0.11, 0.04, 0.09], line: 0.016 });
    const tail = pivot(g, [0, 0.6, -0.6]); part(tail, new THREE.ConeGeometry(0.12, 0.3, 8), toon('#ffd23f', FUR), { pos: [0, 0.1, -0.06], rot: [-1.0, 0, 0], line: 0.02 });
    return { ears: [], tail, wings, leaves: [], jaw, extra: tuft, face: f, top: 1.7 };
  } },
  { name: 'Mochi', sig: 'lick', color: '#b997ff', idles: { sleep: 4, stretch: 2, look: 1, dance: 1, eat: 1 }, build(g) { // lavender cat
    const c = '#b997ff', R = [0.62, 0.56, 0.58];
    E(g, c, [0, 0.62, 0], R);
    E(g, '#efe3ff', [0, 0.26, 0.2], [0.33, 0.2, 0.25], { mat: FLAT, line: 0 }); // belly
    for (const sx of [-1, 1]) E(g, '#efe3ff', [sx * 0.1, 0.5, 0.45], [0.16, 0.13, 0.14], { line: 0.02 }); // muzzle puffs
    E(g, '#ff8fb8', [0, 0.565, 0.57], [0.045, 0.032, 0.03], { mat: FLAT, line: 0.01 }); // nose
    for (const k of [-1, 0, 1]) E(g, '#8a63d8', [k * 0.1, 0.99 - Math.abs(k) * 0.03, 0.2], [0.028, 0.1, 0.02], { mat: FLAT, line: 0, rot: [-0.5, 0, k * 0.2] }); // forehead stripes
    feet(g, '#a57cf2', 0.26, 0.2, 0.1, [0.2, 0.12, 0.26], '#ffb6d6');
    const ears = [-1, 1].map(sx => {
      const p = pivot(g, [sx * 0.38, 1.0, 0]); p.rotation.z = -sx * 0.35;
      part(p, new THREE.ConeGeometry(0.22, 0.46, 4), toon(c, FUR), { pos: [0, 0.18, 0], rot: [0, Math.PI / 4, 0], scale: [1, 1, 0.55], line: 0.03 });
      part(p, new THREE.ConeGeometry(0.12, 0.3, 4), toon('#ffb6d6', FLAT), { pos: [0, 0.14, 0.05], rot: [0, Math.PI / 4, 0], scale: [1, 1, 0.4], line: 0 });
      return { g: p, base: -sx * 0.35, side: sx };
    });
    const tail = pivot(g, [0, 0.45, -0.52]);
    [[0, 0.02, -0.15, 0.1], [0.04, 0.2, -0.3, 0.09], [0.12, 0.42, -0.34, 0.085], [0.24, 0.6, -0.28, 0.1]].forEach(([x, y, z, r], i) => E(tail, i == 3 ? '#efe3ff' : c, [x, y, z], [r, r, r], { line: 0.022 }));
    const face = addFace(g, R, [0, 0.62, 0], { ex: 0.38, ey: 0.12, size: 0.1, mouthAt: [0, 0.505, 0.6], mouthKind: 'w', msize: 0.075, cheek: '#ff8fb8' });
    whiskers(g, '#6d4fb0', 0.5, 0.53, 0.4);
    const ar = arms(g, c, { x: 0.58, y: 0.55, z: 0.14, paw: '#efe3ff' });
    return { ears, tail, wings: [], leaves: [], arms: ar, face, top: 1.7 };
  } },
  { name: 'Leafy', sig: 'sway', color: '#8fdc6e', idles: { stretch: 4, look: 2, dance: 1, sleep: 1, eat: 2 }, build(g) { // green sprout
    const c = '#8fdc6e', R = [0.62, 0.56, 0.6];
    E(g, c, [0, 0.6, 0], R);
    E(g, '#e8ffd6', [0, 0.28, 0.2], [0.34, 0.2, 0.25], { mat: FLAT, line: 0 });
    for (const [x, y, z, r] of [[-0.35, 0.8, -0.2, 0.06], [0.4, 0.5, -0.2, 0.07], [-0.2, 0.4, -0.5, 0.06], [0.1, 0.9, -0.3, 0.05]]) E(g, '#6fc457', [x, y, z], [r, r, r * 0.5], { mat: FLAT, line: 0 });
    feet(g, '#6bc24e', 0.25, 0.18, 0.1, [0.19, 0.11, 0.25], '#c8f0b0');
    const crown = pivot(g, [0, 1.12, 0]);
    part(crown, new THREE.CylinderGeometry(0.03, 0.04, 0.3, 6), toon('#5fb243', FLAT), { pos: [0, 0.14, 0], line: 0.02 });
    const leaves = [-1, 1].map(sx => {
      const p = pivot(crown, [0, 0.28, 0]); p.rotation.z = -sx * 0.9;
      part(p, S(), toon('#4fc060', FUR), { pos: [0, 0.22, 0], scale: [0.14, 0.34, 0.04], line: 0.024 });
      part(p, S(), toon('#8fe28a', FLAT), { pos: [0, 0.22, 0.03], scale: [0.03, 0.28, 0.02], line: 0 });
      return { g: p, base: -sx * 0.9, side: sx };
    });
    E(crown, '#ff9ac4', [0, 0.36, 0], [0.09, 0.09, 0.09], { line: 0.02 });
    const tail = pivot(g, [0, 0.4, -0.55]); E(tail, '#6bc24e', [0, 0, -0.04], [0.15, 0.11, 0.15]);
    const ar = arms(g, c, { x: 0.56, y: 0.55, z: 0.1, paw: '#a8ec8a' });
    return { ears: [], tail, wings: [], leaves, arms: ar, extra: crown, face: addFace(g, R, [0, 0.6, 0], { ex: 0.38, ey: 0.1, size: 0.1, msize: 0.09, cheek: '#ff9eae' }), top: 1.9 };
  } },
  { name: 'Bobo', sig: 'sniff', color: '#ffb561', idles: { eat: 4, sleep: 2, look: 1, stretch: 2, dance: 1 }, build(g) { // orange bear
    const c = '#ffb04f', R = [0.68, 0.6, 0.62];
    E(g, c, [0, 0.64, 0], R);
    E(g, '#ffe4b8', [0, 0.3, 0.24], [0.4, 0.24, 0.28], { mat: FLAT, line: 0 });
    feet(g, '#f09a46', 0.3, 0.16, 0.1, [0.22, 0.14, 0.26], '#ffe4b8');
    const ears = [-1, 1].map(sx => {
      const p = pivot(g, [sx * 0.46, 1.1, -0.02]);
      E(p, c, [0, 0, 0], [0.2, 0.2, 0.14], { line: 0.026 });
      E(p, '#ffe0b0', [0, 0, 0.05], [0.11, 0.11, 0.08], { line: 0, mat: FLAT });
      return { g: p, base: 0, side: sx };
    });
    const face = addFace(g, R, [0, 0.64, 0], { ex: 0.4, ey: 0.16, size: 0.1, mouthAt: [0, 0.455, 0.655], mouthTilt: -0.12, msize: 0.085, cheek: '#ff8a6a' });
    E(g, '#ffe4b8', [0, 0.52, 0.5], [0.24, 0.18, 0.15], { line: 0.02 });                       // muzzle
    E(g, '#4a2f2a', [0, 0.575, 0.635], [0.07, 0.05, 0.05], { line: 0, mat: FLAT });          // nose
    const tail = pivot(g, [0, 0.45, -0.6]); E(tail, c, [0, 0, -0.03], [0.17, 0.17, 0.17]);
    const ar = arms(g, c, { x: 0.64, y: 0.6, z: 0.1, w: 0.12, paw: '#ffe4b8' });
    return { ears, tail, wings: [], leaves: [], arms: ar, face, top: 1.8 };
  } },
  { name: 'Pengu', sig: 'waddle', color: '#4fb8c6', idles: { dance: 2, look: 3, sleep: 1, stretch: 1, eat: 3 }, build(g) { // penguin
    const c = '#3da5b8', R = [0.56, 0.74, 0.54];
    E(g, c, [0, 0.8, 0], R);
    E(g, '#f6feff', [0, 0.64, 0.2], [0.4, 0.5, 0.38], { line: 0, mat: { rim: 0.2, fuzz: 0.2, rimTint: true } });
    for (const sx of [-1, 1]) {   // webbed feet with toes
      E(g, '#ffa94d', [sx * 0.2, 0.05, 0.22], [0.2, 0.06, 0.28]);
      for (let k = -1; k <= 1; k++) E(g, '#ff9232', [sx * 0.2 + k * 0.09, 0.05, 0.46], [0.05, 0.04, 0.07], { mat: FLAT, line: 0 });
    }
    const wings = [-1, 1].map(sx => {
      const p = pivot(g, [sx * 0.52, 0.95, 0]);
      part(p, S(), toon('#2f93a6', FUR), { pos: [sx * 0.08, -0.2, 0], scale: [0.08, 0.34, 0.2], rot: [0, 0, sx * 0.2], line: 0.025 });
      return { g: p, side: sx };
    });
    const face = addFace(g, R, [0, 0.8, 0], { ex: 0.36, ey: 0.34, size: 0.095, mouth: false, cheek: '#ff9a9a' });
    E(g, '#ffa94d', [0, 0.97, 0.52], [0.13, 0.065, 0.11], { line: 0.02, mat: FLAT });
    const jaw = pivot(g, [0, 0.935, 0.48]); part(jaw, S(), toon('#ff8f2e', FLAT), { pos: [0, -0.02, 0.04], scale: [0.1, 0.04, 0.09], line: 0.016 });
    const tail = pivot(g, [0, 0.35, -0.5]); E(tail, c, [0, 0, -0.04], [0.12, 0.08, 0.14]);
    E(g, '#2f93a6', [0, 1.5, 0.0], [0.05, 0.08, 0.04], { line: 0.02 });
    return { ears: [], tail, wings, leaves: [], jaw, face, top: 1.9 };
  } },
  { name: 'Fluff', sig: 'bounce', color: '#fff0f6', idles: { sleep: 4, eat: 3, look: 2, stretch: 1, dance: 1 }, build(g) { // cloud sheep
    const wool = '#fff4fa', skin = '#ffd9c4';
    const cl = [[0, 0.66, 0, 0.5], [-0.35, 0.62, 0.0, 0.38], [0.35, 0.62, 0.0, 0.38], [0, 0.62, -0.38, 0.4], [-0.25, 0.98, -0.1, 0.32], [0.25, 0.98, -0.1, 0.32], [0, 1.02, 0.08, 0.3], [-0.28, 0.4, 0.2, 0.3], [0.28, 0.4, 0.2, 0.3]];
    cl.forEach(([x, y, z, r]) => E(g, wool, [x, y, z], [r, r, r], { line: 0.026, mat: { rim: 0.3, fuzz: 0.45, rimTint: true } }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {  // four little legs with hooves
      part(g, new THREE.CapsuleGeometry(0.07, 0.1, 5, 8), toon(skin, FUR), { pos: [sx * 0.26, 0.2, sz * 0.2 + 0.1], line: 0.02 });
      E(g, '#6b5560', [sx * 0.26, 0.06, sz * 0.2 + 0.13], [0.09, 0.06, 0.1], { line: 0.02, mat: FLAT });
    }
    const R = [0.38, 0.34, 0.32], hc = [0, 0.7, 0.35];
    E(g, skin, hc, R);
    E(g, '#fff4fa', [0, 0.98, 0.34], [0.2, 0.12, 0.14], { mat: { rim: 0.2, fuzz: 0.5, rimTint: true } }); // fringe
    const ears = [-1, 1].map(sx => {
      const p = pivot(g, [sx * 0.38, 0.78, 0.33]); p.rotation.z = sx * 0.9;
      E(p, skin, [sx * 0.1, 0, 0], [0.17, 0.08, 0.1], { line: 0.022 });
      E(p, '#ffb6c0', [sx * 0.1, 0, 0.04], [0.1, 0.045, 0.05], { line: 0, mat: FLAT });
      return { g: p, base: sx * 0.9, side: sx };
    });
    const face = addFace(g, R, hc, { ex: 0.42, ey: 0.05, size: 0.075, msize: 0.07, cheek: '#ff9aa8' });
    const tail = pivot(g, [0, 0.6, -0.7]); E(tail, wool, [0, 0, 0], [0.14, 0.14, 0.14]);
    return { ears, tail, wings: [], leaves: [], face, top: 1.7 };
  } },
];
