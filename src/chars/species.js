import * as THREE from 'three';
import { toon, part, sphereGeo } from './toon.js';
import { addFace } from './face.js';

const S = () => sphereGeo(1, 26, 18);
const E = (parent, color, pos, scale, o = {}) => part(parent, S(), toon(color, o.mat), { pos, scale, rot: o.rot, line: o.line ?? 0.028, cast: true });
const pivot = (parent, pos) => { const g = new THREE.Group(); g.position.set(...pos); parent.add(g); return g; };

function feet(g, color, x = 0.28, z = 0.18, y = 0.1, sc = [0.2, 0.12, 0.26]) {
  return [-1, 1].map(sx => E(g, color, [sx * x, y, z], sc));
}

// Each builder returns { g (inside rig), ears:[{g,base,side}], tail, wings:[], leaves:[], face, top } where
// g is a Group at the creature's feet. Species silhouettes are intentionally distinct.
export const SPECIES = [
  { name: 'Puffle', color: '#ffa9cf', build(g) { // pink bunny
    const c = '#ffa9cf', dk = '#ff7fb4', R = [0.64, 0.6, 0.6];
    E(g, c, [0, 0.64, 0], R);
    E(g, '#fff0f6', [0, 0.52, 0.28], [0.4, 0.34, 0.3], { line: 0 });
    feet(g, dk);
    const ears = [-1, 1].map(sx => {
      const p = pivot(g, [sx * 0.3, 1.08, -0.02]); p.rotation.z = -sx * 0.18;
      part(p, new THREE.CapsuleGeometry(0.15, 0.5, 6, 12), toon(c), { pos: [0, 0.32, 0], scale: [0.85, 1, 0.55], line: 0.028 });
      part(p, new THREE.CapsuleGeometry(0.08, 0.38, 6, 10), toon('#ffd3e6', { rim: 0 }), { pos: [0, 0.32, 0.06], scale: [0.85, 1, 0.4], line: 0 });
      return { g: p, base: -sx * 0.18, side: sx };
    });
    const tail = pivot(g, [0, 0.5, -0.58]); E(tail, '#ffffff', [0, 0, -0.04], [0.2, 0.2, 0.2]);
    return { ears, tail, wings: [], leaves: [], face: addFace(g, R, [0, 0.64, 0], { ex: 0.38, ey: 0.12, size: 0.1 }), top: 1.9 };
  } },
  { name: 'Bloop', color: '#7fd7ff', build(g) { // blue droplet slime
    const c = '#86dcff', R = [0.72, 0.6, 0.66];
    E(g, c, [0, 0.58, 0], R, { mat: { rim: 0.5, rimColor: '#e8fbff' } });
    E(g, c, [0, 1.12, 0], [0.4, 0.4, 0.38], { mat: { rim: 0.5, rimColor: '#e8fbff' } });
    const tip = pivot(g, [0, 1.4, 0]);
    part(tip, new THREE.ConeGeometry(0.18, 0.42, 14), toon(c, { rim: 0.5, rimColor: '#e8fbff' }), { pos: [0, 0.12, 0], line: 0.028 });
    E(g, '#ffffff', [-0.34, 0.92, 0.38], [0.1, 0.17, 0.05], { rot: [0, 0, 0.5], line: 0, mat: { rim: 0 } });
    E(g, '#5fc2f2', [0, 0.1, 0.1], [0.62, 0.1, 0.6], { line: 0 });
    return { ears: [], tail: null, wings: [], leaves: [], extra: tip, face: addFace(g, R, [0, 0.58, 0], { ex: 0.36, ey: 0.1, size: 0.11, tongue: true, cheek: '#ffa0c0' }), top: 1.9 };
  } },
  { name: 'Sunny', color: '#ffe066', build(g) { // yellow chick
    const c = '#ffe36e', R = [0.64, 0.62, 0.62];
    E(g, c, [0, 0.66, 0], R);
    E(g, '#fff6c2', [0, 0.5, 0.24], [0.42, 0.34, 0.34], { line: 0 });
    feet(g, '#ffa63a', 0.22, 0.15, 0.07, [0.15, 0.07, 0.22]);
    const wings = [-1, 1].map(sx => {
      const p = pivot(g, [sx * 0.62, 0.7, 0]);
      part(p, S(), toon('#ffd23f'), { pos: [sx * 0.08, -0.12, 0], scale: [0.13, 0.3, 0.22], rot: [0, 0, sx * 0.3], line: 0.025 });
      return { g: p, side: sx };
    });
    const tuft = pivot(g, [0, 1.25, 0.08]);
    [[-0.1, 0, -0.35], [0, 0.05, 0], [0.1, 0, 0.35]].forEach(([x, y, r]) => part(tuft, S(), toon('#ffd23f'), { pos: [x, y + 0.1, 0], scale: [0.07, 0.2, 0.06], rot: [0, 0, r], line: 0.02 }));
    const f = addFace(g, R, [0, 0.66, 0], { ex: 0.42, ey: 0.16, size: 0.1, mouth: false });
    E(g, '#ff9a2e', [0, 0.64, 0.6], [0.14, 0.09, 0.12], { line: 0.02 });
    E(g, '#ff8a1e', [0, 0.57, 0.58], [0.1, 0.04, 0.1], { line: 0 });
    const tail = pivot(g, [0, 0.6, -0.6]); part(tail, new THREE.ConeGeometry(0.12, 0.3, 8), toon('#ffd23f'), { pos: [0, 0.1, -0.06], rot: [-1.0, 0, 0], line: 0.02 });
    return { ears: [], tail, wings, leaves: [], extra: tuft, face: f, top: 1.7 };
  } },
  { name: 'Mochi', color: '#c7a6ff', build(g) { // lavender cat
    const c = '#c9a9ff', R = [0.62, 0.56, 0.58];
    E(g, c, [0, 0.62, 0], R);
    E(g, '#efe3ff', [0, 0.5, 0.26], [0.36, 0.3, 0.3], { line: 0 });
    feet(g, '#b48cff', 0.26, 0.2, 0.1);
    const ears = [-1, 1].map(sx => {
      const p = pivot(g, [sx * 0.38, 1.0, 0]); p.rotation.z = -sx * 0.35;
      part(p, new THREE.ConeGeometry(0.22, 0.46, 4), toon(c), { pos: [0, 0.18, 0], rot: [0, Math.PI / 4, 0], scale: [1, 1, 0.55], line: 0.03 });
      part(p, new THREE.ConeGeometry(0.12, 0.3, 4), toon('#ffb6d6', { rim: 0 }), { pos: [0, 0.14, 0.05], rot: [0, Math.PI / 4, 0], scale: [1, 1, 0.4], line: 0 });
      return { g: p, base: -sx * 0.35, side: sx };
    });
    const tail = pivot(g, [0, 0.45, -0.52]);
    [[0, 0.02, -0.15, 0.1], [0.04, 0.2, -0.3, 0.09], [0.12, 0.42, -0.34, 0.085], [0.24, 0.6, -0.28, 0.1]].forEach(([x, y, z, r], i) => E(tail, i == 3 ? '#efe3ff' : c, [x, y, z], [r, r, r], { line: 0.022 }));
    const face = addFace(g, R, [0, 0.62, 0], { ex: 0.38, ey: 0.1, size: 0.1 });
    for (const sx of [-1, 1]) for (const dy of [-0.03, 0.05]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.28, 4), new THREE.MeshBasicMaterial({ color: '#7a5aa8' }));
      w.position.set(sx * 0.5, 0.53 + dy, 0.4); w.rotation.set(0, sx * -0.5, Math.PI / 2 + sx * dy * 2); g.add(w);
    }
    return { ears, tail, wings: [], leaves: [], face, top: 1.7 };
  } },
  { name: 'Leafy', color: '#9ae27a', build(g) { // green sprout
    const c = '#a6e585', R = [0.62, 0.56, 0.6];
    E(g, c, [0, 0.6, 0], R);
    E(g, '#e8ffd6', [0, 0.48, 0.26], [0.36, 0.28, 0.3], { line: 0 });
    feet(g, '#7acb5a');
    const crown = pivot(g, [0, 1.12, 0]);
    part(crown, new THREE.CylinderGeometry(0.03, 0.04, 0.3, 6), toon('#6cbf4e'), { pos: [0, 0.14, 0], line: 0.02 });
    const leaves = [-1, 1].map(sx => {
      const p = pivot(crown, [0, 0.28, 0]); p.rotation.z = -sx * 0.9;
      part(p, S(), toon('#58c46a'), { pos: [0, 0.22, 0], scale: [0.14, 0.34, 0.04], line: 0.024 });
      part(p, S(), toon('#8fe28a', { rim: 0 }), { pos: [0, 0.22, 0.03], scale: [0.03, 0.28, 0.02], line: 0 });
      return { g: p, base: -sx * 0.9, side: sx };
    });
    const bud = E(crown, '#ff9ac4', [0, 0.36, 0], [0.09, 0.09, 0.09], { line: 0.02 });
    const tail = pivot(g, [0, 0.4, -0.55]); E(tail, '#7acb5a', [0, 0, -0.04], [0.15, 0.11, 0.15]);
    return { ears: [], tail, wings: [], leaves, extra: crown, face: addFace(g, R, [0, 0.6, 0], { ex: 0.38, ey: 0.1, size: 0.1, cheek: '#ff9eae' }), top: 1.9 };
  } },
  { name: 'Bobo', color: '#ffb561', build(g) { // orange bear
    const c = '#ffb766', R = [0.68, 0.6, 0.62];
    E(g, c, [0, 0.64, 0], R);
    E(g, '#ffe4b8', [0, 0.46, 0.3], [0.42, 0.34, 0.28], { line: 0 });
    feet(g, '#f09a46', 0.3, 0.15, 0.1, [0.22, 0.14, 0.26]);
    const ears = [-1, 1].map(sx => {
      const p = pivot(g, [sx * 0.46, 1.1, -0.02]);
      E(p, c, [0, 0, 0], [0.2, 0.2, 0.14], { line: 0.026 });
      E(p, '#ffe0b0', [0, 0, 0.05], [0.11, 0.11, 0.08], { line: 0, mat: { rim: 0 } });
      return { g: p, base: 0, side: sx };
    });
    const face = addFace(g, R, [0, 0.64, 0], { ex: 0.4, ey: 0.16, size: 0.1, mouth: false });
    E(g, '#ffe4b8', [0, 0.52, 0.5], [0.22, 0.17, 0.14], { line: 0.02 });
    E(g, '#5a3a35', [0, 0.57, 0.62], [0.07, 0.05, 0.05], { line: 0, mat: { rim: 0 } });
    const tail = pivot(g, [0, 0.45, -0.6]); E(tail, c, [0, 0, -0.03], [0.17, 0.17, 0.17]);
    return { ears, tail, wings: [], leaves: [], face, top: 1.8 };
  } },
  { name: 'Pengu', color: '#6fd0d6', build(g) { // penguin
    const c = '#5fc4cf', R = [0.56, 0.74, 0.54];
    E(g, c, [0, 0.8, 0], R);
    E(g, '#f6feff', [0, 0.64, 0.2], [0.4, 0.5, 0.38], { line: 0 });
    for (const sx of [-1, 1]) E(g, '#ffa94d', [sx * 0.2, 0.05, 0.22], [0.2, 0.06, 0.28]);
    const wings = [-1, 1].map(sx => {
      const p = pivot(g, [sx * 0.52, 0.95, 0]);
      part(p, S(), toon('#4fb0bd'), { pos: [sx * 0.08, -0.2, 0], scale: [0.08, 0.34, 0.2], rot: [0, 0, sx * 0.2], line: 0.025 });
      return { g: p, side: sx };
    });
    const face = addFace(g, R, [0, 0.8, 0], { ex: 0.36, ey: 0.34, size: 0.095, mouth: false });
    E(g, '#ffa94d', [0, 0.97, 0.52], [0.13, 0.07, 0.12], { line: 0.02 });
    E(g, '#ff8f2e', [0, 0.91, 0.5], [0.1, 0.04, 0.1], { line: 0 });
    const tail = pivot(g, [0, 0.35, -0.5]); E(tail, c, [0, 0, -0.04], [0.12, 0.08, 0.14]);
    return { ears: [], tail, wings, leaves: [], face, top: 1.9 };
  } },
  { name: 'Fluff', color: '#fff0f6', build(g) { // cloud sheep
    const wool = '#fff7fb', skin = '#ffe0cc';
    const cl = [[0, 0.66, 0, 0.5], [-0.35, 0.62, 0.0, 0.38], [0.35, 0.62, 0.0, 0.38], [0, 0.62, -0.38, 0.4], [-0.25, 0.98, -0.1, 0.32], [0.25, 0.98, -0.1, 0.32], [0, 1.02, 0.08, 0.3], [-0.28, 0.4, 0.2, 0.3], [0.28, 0.4, 0.2, 0.3]];
    cl.forEach(([x, y, z, r]) => E(g, wool, [x, y, z], [r, r, r], { line: 0.026, mat: { rimColor: '#ffd9ee' } }));
    for (const sx of [-1, 1]) E(g, '#6b5560', [sx * 0.22, 0.08, 0.2], [0.1, 0.1, 0.1], { line: 0.02 });
    const R = [0.38, 0.34, 0.32], hc = [0, 0.7, 0.35];
    E(g, skin, hc, R);
    const ears = [-1, 1].map(sx => {
      const p = pivot(g, [sx * 0.38, 0.78, 0.33]); p.rotation.z = sx * 0.9;
      E(p, skin, [sx * 0.1, 0, 0], [0.17, 0.08, 0.1], { line: 0.022 });
      return { g: p, base: sx * 0.9, side: sx };
    });
    const face = addFace(g, R, hc, { ex: 0.42, ey: 0.05, size: 0.075, cheek: '#ff9aa8' });
    const tail = pivot(g, [0, 0.6, -0.7]); E(tail, wool, [0, 0, 0], [0.14, 0.14, 0.14]);
    return { ears, tail, wings: [], leaves: [], face, top: 1.7 };
  } },
];
