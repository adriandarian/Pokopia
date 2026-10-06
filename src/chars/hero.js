import * as THREE from 'three';
import { toonUnique, toon, part, sphereGeo, Mat, mergeColored, bake } from './toon.js';
import { addFace, Blinker } from './face.js';

const S = () => sphereGeo(1, 28, 18);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = THREE.MathUtils.lerp, damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const LEGACY = { hat_none: 'none', hat_party: 'party', hat_crown: 'crown', hat_straw: 'straw', hat_cat: 'cat', hat_flower: 'flower', hat_cap: 'cap', hat_beanie: 'beanie', hat_wizard: 'wizard', hat_halo: 'halo', catears: 'cat', cat_ears: 'cat' };

// Hair as a real shell over the skull. The open region (face, ears, nape) is cut per-pixel in the shader (smooth edge).
const CUT_GLSL = `
float hairCut(vec3 p, float layer) {
  float cut;
  if (layer > 0.0) { cut = layer + 0.1 * sin(atan(p.x, p.z) * 5.0) + 0.25 * smoothstep(0.3, 1.0, p.z); }
  else {
    cut = -0.52 + 0.82 * smoothstep(-0.8, -0.1, p.z);
    cut += 0.2 * smoothstep(0.3, 0.9, p.z);
    cut += 0.045 * sin(p.x * 13.0) * smoothstep(0.3, 0.8, p.z);
    cut -= 0.2 * smoothstep(0.62, 0.95, abs(p.x)) * smoothstep(0.0, 0.6, p.z) * (1.0 - smoothstep(0.6, 0.95, p.z));
  }
  return cut;
}`;
function hairShell() { return new THREE.SphereGeometry(1, 48, 32); }
function hairCutMat(mat, layer) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh) => {
    prev(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + CUT_GLSL)
      .replace('void main() {', 'void main() {\n if (normalize(vObjPos).y < hairCut(normalize(vObjPos), ' + layer.toFixed(3) + ')) discard;');
  };
  mat.customProgramCacheKey = () => 'toonhair' + layer;
  return mat;
}
function hairOutline(mesh, layer, thick) {
  const m = new THREE.MeshBasicMaterial({ color: '#3b2a3a', side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; transformed += normalize(normal) * ' + thick.toFixed(3) + ';');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;\n' + CUT_GLSL)
      .replace('void main() {', 'void main() {\n if (normalize(vOP).y < hairCut(normalize(vOP), ' + layer.toFixed(3) + ')) discard;');
  };
  m.customProgramCacheKey = () => 'hairol' + layer;
  const o = new THREE.Mesh(mesh.geometry, m); o.userData.isOutline = true; mesh.add(o); return o;
}

// Chibi hero with outfit hooks. Returns a Group; group.userData.hero is the animation/outfit API.
export function buildHero(opts = {}) {
  const root = new THREE.Group();
  const rig = new THREE.Group(); root.add(rig);        // squash & stretch around the feet
  const mats = {
    skin: toonUnique('#ffd9bd', { rim: 0.25, rimColor: '#ffd0c0' }),
    shirt: toonUnique('#ff6b6b', { fuzz: 0.12, rim: 0.3 }),
    pants: toonUnique('#5b86ff', { fuzz: 0.12 }),
    hair: toonUnique('#6b4429', { rim: 0.5, rimColor: '#ffd9a8', fuzz: 0.1, fill: 0.22 }),
    shoe: toonUnique('#fff4e6'), sole: toonUnique('#d9c3a8', { rim: 0 }),
    pack: toonUnique('#ffc94d', { fuzz: 0.12 }),
  };

  // legs: hip pivot -> knee pivot -> shoe
  const legs = [-1, 1].map(sx => {
    const g = new THREE.Group(); g.position.set(sx * 0.19, 0.8, 0); rig.add(g);
    part(g, new THREE.CapsuleGeometry(0.15, 0.17, 6, 12), mats.pants, { pos: [0, -0.18, 0] });
    const knee = new THREE.Group(); knee.position.y = -0.36; g.add(knee);
    part(knee, new THREE.CapsuleGeometry(0.125, 0.15, 6, 12), mats.skin, { pos: [0, -0.14, 0] });
    const foot = new THREE.Group(); foot.position.y = -0.29; knee.add(foot);
    part(foot, S(), mats.shoe, { pos: [0, -0.06, 0.07], scale: [0.2, 0.13, 0.29] });
    part(foot, S(), mats.shoe, { pos: [0, -0.05, 0.26], scale: [0.165, 0.1, 0.14], line: 0.02 });
    part(foot, S(), mats.sole, { pos: [0, -0.16, 0.09], scale: [0.205, 0.035, 0.32], line: 0 });
    g.userData = { knee, foot }; return g;
  });

  // torso
  const torso = new THREE.Group(); torso.position.y = 1.06; rig.add(torso);
  part(torso, new THREE.CapsuleGeometry(0.36, 0.12, 8, 18), mats.shirt, { pos: [0, 0.02, 0], scale: [1, 1, 0.92] });
  part(torso, new THREE.CylinderGeometry(0.37, 0.45, 0.16, 24), mats.shirt, { pos: [0, -0.24, 0], scale: [1, 1, 0.92], line: 0.02 }); // shirt hem flare
  part(torso, S(), mats.pants, { pos: [0, -0.32, 0], scale: [0.4, 0.14, 0.36], line: 0 });                                          // shorts
  part(torso, new THREE.TorusGeometry(0.2, 0.05, 8, 20), toon('#fff1de', { fuzz: 0.1 }), { pos: [0, 0.34, 0.04], rot: [Math.PI / 2 - 0.15, 0, 0], line: 0.015 }); // collar
  part(torso, new THREE.CylinderGeometry(0.372, 0.385, 0.07, 24), toon('#fff4e0', { fuzz: 0.1 }), { pos: [0, 0.0, 0], scale: [1, 1, 0.92], line: 0 });
  part(torso, new THREE.CylinderGeometry(0.385, 0.4, 0.045, 24), toon('#fff4e0', { fuzz: 0.1 }), { pos: [0, -0.1, 0], scale: [1, 1, 0.92], line: 0 });
  part(torso, S(), toon('#fff4e0', { fuzz: 0.1, rim: 0.1 }), { pos: [0.17, 0.08, 0.31], scale: [0.1, 0.085, 0.03], rot: [-0.15, 0.2, 0], line: 0.012 });
  const pack = new THREE.Group(); torso.add(pack);
  const flapM = toonUnique('#d98a2b', { fuzz: 0.12 }); mats.packFlap = flapM;
  part(pack, new THREE.CapsuleGeometry(0.22, 0.1, 8, 14), mats.pack, { pos: [0, -0.02, -0.4], scale: [1, 1, 0.72] });
  part(pack, S(), flapM, { pos: [0, 0.14, -0.46], scale: [0.25, 0.14, 0.17], line: 0.02 });
  part(pack, S(), mats.pack, { pos: [0, -0.14, -0.5], scale: [0.15, 0.09, 0.08], line: 0.018 });
  part(pack, S(), toon('#fff1c9', { rim: 0 }), { pos: [0, 0.1, -0.6], scale: [0.045, 0.045, 0.03], line: 0.012 });
  for (const sx of [-1, 1]) part(pack, new THREE.CapsuleGeometry(0.035, 0.34, 4, 8), flapM, { pos: [sx * 0.17, 0.16, 0.0], scale: [1, 1, 0.6], line: 0.012 });
  // arms: shoulder -> elbow -> mitten hand with thumb
  const arms = [-1, 1].map(sx => {
    const g = new THREE.Group(); g.position.set(sx * 0.47, 0.25, 0); torso.add(g);
    part(g, new THREE.CapsuleGeometry(0.12, 0.15, 6, 10), mats.shirt, { pos: [0, -0.14, 0] });
    const elbow = new THREE.Group(); elbow.position.y = -0.3; g.add(elbow);
    part(elbow, new THREE.CapsuleGeometry(0.095, 0.14, 6, 10), mats.skin, { pos: [0, -0.12, 0] });
    const hand = new THREE.Group(); hand.position.y = -0.34; elbow.add(hand);
    part(hand, S(), mats.skin, { pos: [0, -0.07, 0.01], scale: [0.14, 0.15, 0.115], line: 0.022 });
    part(hand, S(), mats.skin, { pos: [-sx * 0.13, -0.05, 0.07], scale: [0.065, 0.09, 0.065], line: 0.018, rot: [0.3, 0, -sx * 0.5] });
    for (const fx of [-0.07, 0, 0.07]) part(hand, S(), mats.skin, { pos: [fx, -0.2, 0.025], scale: [0.045, 0.085, 0.05], line: 0.014 });
    g.userData = { elbow, hand }; return g;
  });

  // ---- head ----
  const head = new THREE.Group(); head.position.set(0, 1.4, 0); rig.add(head);
  const headC = [0, 0.52, 0], HR = 0.62, HRX = HR * 1.04;
  part(head, S(), mats.skin, { pos: headC, scale: [HRX, HR, HR] });
  // ears: half-sunk discs on the skull with an inner shell
  for (const sx of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(sx * HRX * 0.99, 0.5, 0.03); ear.rotation.set(0, sx * 0.3, sx * -0.12); head.add(ear);
    part(ear, S(), mats.skin, { scale: [0.085, 0.135, 0.105], line: 0.018 });
    part(ear, S(), toon('#ffb8a8', { rim: 0 }), { pos: [sx * 0.05, -0.005, 0.015], scale: [0.03, 0.08, 0.06], line: 0 });
  }
  const face = addFace(head, [HRX, HR, HR], headC, { ex: 0.36, ey: -0.02, size: 0.085, tongue: false });
  part(head, S(), toon('#ffc4ad', { rim: 0 }), { pos: [0, 0.4, HR * 0.99], scale: [0.03, 0.026, 0.03], line: 0 }); // nose dab
  // hair
  const faceAnchor = new THREE.Object3D(); faceAnchor.position.set(0, 0.52, 0.45); head.add(faceAnchor);
  const hair = new THREE.Group(); head.add(hair);
  mats.hairShell = hairCutMat(toonUnique('#6b4429', { rim: 0.5, rimColor: '#ffd9a8', fuzz: 0.1, fill: 0.22 }), 0);
  mats.hairShell2 = hairCutMat(toonUnique('#6b4429', { rim: 0.5, rimColor: '#ffd9a8', fuzz: 0.1, fill: 0.22 }), 0.15);
  const shell = new THREE.Mesh(hairShell(), mats.hairShell); shell.scale.set(HRX * 1.07, HR * 1.07, HR * 1.09); shell.position.set(0, 0.54, -0.03); shell.rotation.x = -0.05; shell.castShadow = true; shell.userData.noBake = true; hair.add(shell);
  hairOutline(shell, 0, 0.03 / 1.08);
  const HRs = [HRX * 1.08, HR * 1.08, HR * 1.1];
  const onHair = (az, el, push = 1) => [Math.sin(az) * Math.cos(el) * HRs[0] * push, 0.54 + Math.sin(el) * HRs[1] * push, Math.cos(az) * Math.cos(el) * HRs[2] * push - 0.03];
  const lockPts = [[0.001, 0], [0.04, 0.05], [0.085, 0.14], [0.1, 0.24], [0.08, 0.32], [0.001, 0.36]].map(([x, y]) => new THREE.Vector2(x, y));
  const lockGeo = new THREE.LatheGeometry(lockPts, 10); lockGeo.translate(0, -0.36, 0);   // tip at y=0 (hangs down), rounded root at top
  const bangs = new THREE.Group(); hair.add(bangs);
  // lock rotation: flip so the tip points down and toward the face; swoop leans the tip sideways
  [[-0.95, 0.5, 0.55, 1.0, 0.45], [-0.62, 0.62, 0.7, 1.1, 0.3], [-0.3, 0.68, 0.78, 1.1, 0.1], [0.05, 0.7, 0.8, 1.15, -0.1], [0.38, 0.68, 0.72, 1.1, -0.3], [0.7, 0.62, 0.66, 1.05, -0.45], [1.0, 0.5, 0.5, 0.95, -0.5]].forEach(([az, el, len, w, sw]) => {
    const m = part(bangs, lockGeo, mats.hair, { pos: onHair(az, el, 1.0), scale: [1.15 * w, len * 1.35, 0.8 * w], line: 0.02 });
    m.rotation.order = 'YXZ'; m.rotation.set(-0.5, az * 0.5, sw * 0.5);   // x flips tip downward, tipped toward the face
  });
  const sides = new THREE.Group(); hair.add(sides);
  for (const sx of [-1, 1]) {
    const m = part(sides, lockGeo, mats.hair, { pos: onHair(sx * 1.08, 0.2, 1.0), scale: [0.9, 1.0, 0.7], line: 0.02 });
    m.rotation.order = 'YXZ'; m.rotation.set(0.1, sx * 1.1, -sx * 0.05);
    const n = part(sides, lockGeo, mats.hair, { pos: onHair(sx * 2.5, -0.25, 1.0), scale: [1.4, 1.3, 0.9], line: 0.02 });
    n.rotation.order = 'YXZ'; n.rotation.set(0.35, sx * 2.5, 0);
  }
  // nape: one soft wide piece + two small curls
  part(hair, S(), mats.hair, { pos: onHair(Math.PI, -0.3, 0.97), scale: [0.38, 0.15, 0.15], line: 0.022 });
  for (const sx of [-1, 1]) part(hair, S(), mats.hair, { pos: onHair(Math.PI + sx * 0.8, -0.3, 0.98), scale: [0.15, 0.17, 0.13], line: 0.02 });
  // upper layer shell: slightly rotated so a ridge shows (breaks the helmet look)
  { const s2 = new THREE.Mesh(hairShell(), mats.hairShell2); s2.scale.set(HRX * 1.13, HR * 1.12, HR * 1.14); s2.position.set(0, 0.57, -0.06); s2.rotation.set(-0.12, 0.35, 0); s2.castShadow = true; s2.userData.noBake = true; hair.add(s2); hairOutline(s2, 0.15, 0.025 / 1.1); }
  const ahoge = new THREE.Group(); ahoge.position.set(0.05, 1.12, 0.1); hair.add(ahoge);
  part(ahoge, new THREE.CapsuleGeometry(0.035, 0.22, 4, 8), mats.hair, { pos: [0, 0.12, 0], rot: [0, 0, -0.35], line: 0.02 });
  part(ahoge, S(), mats.hair, { pos: [-0.07, 0.3, 0], scale: [0.07, 0.07, 0.07], line: 0.015 });

  // ---- hats (built in head-centre space, sit ON the hair; hats are bigger than the hair shell) ----
  const hats = {}, hatHides = {};
  const hatRoot = new THREE.Group(); hatRoot.position.set(0, 0.52, 0); head.add(hatRoot);
  const vcMat = (o = {}) => toon('#ffffff', { vc: true, fuzz: 0.1, ...o });
  const ring = (R, r, col, y, tilt = 0) => ({ geo: new THREE.TorusGeometry(R, r, 8, 28), color: col, pos: [0, y, 0], rot: [Math.PI / 2 + tilt, 0, 0] });
  { // baseball cap
    const g = new THREE.Group(), red = toon('#ff5d73', { fuzz: 0.15 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 30, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), red);
    dome.scale.set(0.74, 0.62, 0.76); dome.position.set(0, 0.15, -0.03); dome.rotation.x = -0.1; dome.castShadow = true; dome.userData.noBake = true; g.add(dome);
    { const o = new THREE.Mesh(dome.geometry, new THREE.MeshBasicMaterial({ color: '#3b2a3a', side: THREE.BackSide })); o.userData.isOutline = true; o.material.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * 0.03;'); }; o.material.customProgramCacheKey = () => 'hairol'; dome.add(o); }
    part(g, new THREE.CylinderGeometry(0.6, 0.6, 0.06, 24, 1, false, -Math.PI / 2, Math.PI), red, { pos: [0, 0.2, 0.33], scale: [1.0, 1, 0.95], rot: [0.14, 0, 0], line: 0.02 });
    part(g, S(), toon('#fff2c9'), { pos: [0, 0.78, -0.04], scale: [0.07, 0.05, 0.07], line: 0.015 });
    part(g, S(), toon('#fff2c9', { rim: 0 }), { pos: [0, 0.5, 0.62], scale: [0.16, 0.16, 0.04], rot: [-0.55, 0, 0], line: 0.012 });
    part(g, new THREE.TorusGeometry(0.72, 0.03, 6, 28, Math.PI * 2), toon('#ffffff', { rim: 0 }), { pos: [0, 0.17, -0.03], rot: [Math.PI / 2 - 0.1, 0, 0], line: 0 });
    hats.cap = g; hatHides.cap = ['bangs', 'ahoge'];
  }
  { // straw hat with a proper crown + ribbon + bow
    const g = new THREE.Group(), sm = toon('#dba947', { fuzz: 0.35, double: true, fill: 0.04, rim: 0.15 });
    const pts = [[0.001, 0.74], [0.25, 0.73], [0.5, 0.66], [0.64, 0.5], [0.72, 0.25], [0.74, 0.05], [0.8, 0.0], [0.95, -0.02], [1.12, -0.07], [1.22, -0.14]].map(([x, y]) => new THREE.Vector2(x, y));
    const hat = part(g, new THREE.LatheGeometry(pts, 36), sm, { pos: [0, 0.3, 0], scale: [0.93, 1, 0.95], rot: [-0.06, 0, 0], line: 0.02 });
    part(g, new THREE.TorusGeometry(0.745, 0.055, 8, 32), toon('#ff6b7e', { fuzz: 0.1 }), { pos: [0, 0.5, 0.0], rot: [Math.PI / 2 - 0.06, 0, 0], scale: [0.93, 0.95, 1], line: 0.015 });
    for (const sx of [-1, 1]) part(g, S(), toon('#ff6b7e'), { pos: [sx * 0.11, 0.5, 0.7], scale: [0.11, 0.07, 0.05], rot: [0, 0, sx * 0.35], line: 0.012 });
    part(g, S(), toon('#ff4f66'), { pos: [0, 0.5, 0.71], scale: [0.05, 0.05, 0.05], line: 0.01 });
    hats.straw = g; hatHides.straw = ['ahoge', 'bangs'];
  }
  { // beanie
    const g = new THREE.Group(), bm = toon('#52c7b8', { fuzz: 0.35 }), cuff = toon('#fff2c9', { fuzz: 0.4 });
    g.rotation.x = 0.1;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 30, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), bm);
    dome.scale.set(0.76, 0.75, 0.78); dome.position.set(0, 0.2, -0.02); dome.castShadow = true; dome.userData.noBake = true; g.add(dome);
    { const o = new THREE.Mesh(dome.geometry, new THREE.MeshBasicMaterial({ color: '#3b2a3a', side: THREE.BackSide })); o.userData.isOutline = true; o.material.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * 0.03;'); }; o.material.customProgramCacheKey = () => 'hairol'; dome.add(o); }
    part(g, new THREE.TorusGeometry(0.74, 0.12, 10, 32), cuff, { pos: [0, 0.21, -0.02], rot: [Math.PI / 2, 0, 0], scale: [1.02, 1.03, 0.9], line: 0.02 });
    part(g, S(), cuff, { pos: [0, 1.0, -0.02], scale: [0.17, 0.15, 0.17], line: 0.02 });
    hats.beanie = g; hatHides.beanie = ['bangs', 'ahoge'];
  }
  { // flower crown (merged = 1 draw call)
    const g = new THREE.Group(), items = [];
    const cols = ['#ff8fb3', '#fff27a', '#ffffff', '#b99bff', '#ff8fb3', '#fff27a', '#ffffff', '#b99bff'];
    const R = 0.66;
    items.push({ ...ring(R, 0.05, '#5fb84f', 0.0) });
    cols.forEach((c, i) => {
      const a = i / cols.length * Math.PI * 2 + 0.2, r = [Math.sin(a), 0, Math.cos(a)], t = [Math.cos(a), 0, -Math.sin(a)];
      const cx = r[0] * R, cz = r[2] * R, big = (i % 2 ? 0.075 : 0.095);
      for (let k = 0; k < 5; k++) { const p = k / 5 * Math.PI * 2, o = big * 0.95; items.push({ geo: sphereGeo(1, 8, 6), color: c, pos: [cx + t[0] * Math.cos(p) * o + r[0] * 0.02, Math.sin(p) * o, cz + t[2] * Math.cos(p) * o + r[2] * 0.02], scale: [big * 0.85, big * 0.85, big * 0.85] }); }
      items.push({ geo: sphereGeo(1, 8, 6), color: c === '#fff27a' ? '#ff9a5a' : '#ffd84a', pos: [cx + r[0] * 0.06, 0, cz + r[2] * 0.06], scale: [big * 0.55, big * 0.55, big * 0.55] });
      const b = a + Math.PI / 8; items.push({ geo: sphereGeo(1, 8, 6), color: '#6cc15a', pos: [Math.sin(b) * R, -0.02, Math.cos(b) * R], scale: [0.09, 0.035, 0.05], rot: [0, b + Math.PI / 2, 0] });
    });
    const m = part(g, mergeColored(items), vcMat(), { line: 0.012 });
    g.position.y = 0.28; g.rotation.x = 0.1;
    hats.flower = g; hatHides.flower = ['ahoge'];
  }
  { // crown: sits ON the hair, tall spikes, jewels
    const g = new THREE.Group(), gold = '#ffd54a', items = [];
    items.push({ geo: new THREE.CylinderGeometry(0.52, 0.47, 0.22, 20, 1, true), color: gold, pos: [0, 0, 0] });
    items.push({ geo: new THREE.TorusGeometry(0.5, 0.035, 6, 24), color: '#ffe27a', pos: [0, 0.11, 0], rot: [Math.PI / 2, 0, 0] });
    items.push({ geo: new THREE.TorusGeometry(0.47, 0.035, 6, 24), color: '#ffe27a', pos: [0, -0.11, 0], rot: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2;
      items.push({ geo: new THREE.ConeGeometry(0.1, 0.32, 8), color: gold, pos: [Math.sin(a) * 0.5, 0.26, Math.cos(a) * 0.5] });
      items.push({ geo: sphereGeo(1, 8, 6), color: '#fff3a0', pos: [Math.sin(a) * 0.5, 0.44, Math.cos(a) * 0.5], scale: [0.06, 0.06, 0.06] });
      const b = a + Math.PI / 5; items.push({ geo: sphereGeo(1, 8, 6), color: ['#ff4d6d', '#4db8ff', '#6bdc7a', '#c07bff', '#ff4d6d'][i], pos: [Math.sin(b) * 0.51, 0.0, Math.cos(b) * 0.51], scale: [0.055, 0.07, 0.04] });
    }
    part(g, mergeColored(items), vcMat({ emissive: '#ffb300', ei: 0.18, double: true, fuzz: 0, rim: 0.5 }), { line: 0.015 });
    g.position.set(0, 0.6, -0.02); g.rotation.x = 0.1;
    hats.crown = g; hatHides.crown = ['ahoge'];
  }
  { // party hat
    const g = new THREE.Group(), items = [], cs = ['#ff7ac8', '#fff27a', '#7ad7ff', '#ff7ac8'];
    cs.forEach((c, i) => { const y0 = i * 0.21, r0 = 0.4 * (1 - i / 4.4), r1 = 0.4 * (1 - (i + 1) / 4.4); items.push({ geo: new THREE.CylinderGeometry(r1, r0, 0.21, 20), color: c, pos: [0, y0 + 0.105, 0] }); });
    items.push({ geo: sphereGeo(1, 10, 8), color: '#fff27a', pos: [0, 0.86, 0], scale: [0.12, 0.12, 0.12] });
    items.push({ geo: new THREE.TorusGeometry(0.4, 0.04, 6, 24), color: '#fff2c9', pos: [0, 0.01, 0], rot: [Math.PI / 2, 0, 0] });
    part(g, mergeColored(items), vcMat({ fuzz: 0.2 }), { line: 0.02 });
    g.position.set(0.03, 0.5, -0.02); g.rotation.set(0.08, 0, -0.12);
    hats.party = g; hatHides.party = ['ahoge'];
  }
  { // cat-ear headband: big dark ears, pink inner
    const g = new THREE.Group(), items = [], dk = '#2e2a3d';
    items.push({ geo: new THREE.TorusGeometry(0.71, 0.05, 8, 28, Math.PI), color: dk, pos: [0, 0.04, 0] });
    for (const sx of [-1, 1]) {
      items.push({ geo: new THREE.ConeGeometry(0.3, 0.62, 3), color: dk, pos: [sx * 0.44, 0.92, 0], rot: [0, 0, -sx * 0.3], scale: [1, 1, 0.6] });
      items.push({ geo: new THREE.ConeGeometry(0.19, 0.42, 3), color: '#ff7eb8', pos: [sx * 0.445, 0.88, 0.075], rot: [0, 0, -sx * 0.3], scale: [1, 1, 0.45] });
    }
    part(g, mergeColored(items), vcMat({ fuzz: 0.3, rim: 0.2 }), { line: 0.02 });
    g.position.set(0, 0.0, -0.05); g.rotation.x = -0.12;
    hats.cat = g; hatHides.cat = ['ahoge'];
  }
  const hideable = { bangs, ahoge, sides };
  for (const k in hats) { hats[k].visible = false; hatRoot.add(hats[k]); }

  // blob shadow
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.62, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#1d2b12', transparent: true, opacity: 0.28, depthWrite: false }));
  blob.position.y = 0.06; blob.renderOrder = 1; root.add(blob);
  root.traverse(o => { if (o.isMesh && !o.userData.isOutline) o.castShadow = true; });
  const bk = bake(root);

  // ------- animation state -------
  const blinker = new Blinker(face);
  const st = { phase: 0, sy: 1, svy: 0, t: 0, lean: 0, wasGround: true, idle: 0, wave: 0, foot: 0, headYaw: 0, crouch: 0, hatX: 0, hatZ: 0, hatVx: 0, hatVz: 0, ahX: 0, ahZ: 0, prevHX: 0, prevHY: 0, sway: 0, bob: 0, turn: 0, prevVy: 0, landRec: 0 };
  let curHat = 'none';
  const hero = {
    root, mats, hats, head, torso, arms, legs, face, faceAnchor,
    // emote('wave'|'dance'|'cheer'|'sit'|'none', seconds?) -- 'sit' holds until cancelled (or the hero moves)
    emote(name, dur) { if (!name || name === 'none') { st.em = null; return this; } st.em = { name, t: 0, dur: dur ?? ({ wave: 3, dance: 5, cheer: 2.5, sit: 1e9 })[name] ?? 2 }; return this; },
    get emoting() { return st.em ? st.em.name : null; },
    // setOutfit({ hat: 'cap'|'straw'|'beanie'|'flower'|'crown'|'party'|'cat'|'none' (legacy ids 'hat_crown' etc. also accepted),
    //             shirt:'#hex', pants, hair, skin, pack, backpack:bool })
    setOutfit(o = {}) {
      if (o.hat !== undefined) {
        const id = LEGACY[o.hat] ?? o.hat; curHat = hats[id] ? id : 'none';
        for (const k in hats) hats[k].visible = k === curHat;
        for (const k in hideable) hideable[k].visible = !(hatHides[curHat] || []).includes(k);
      }
      if (o.shirt) mats.shirt.color.set(o.shirt);
      if (o.pants) mats.pants.color.set(o.pants);
      if (o.hair) { mats.hair.color.set(o.hair); mats.hairShell.color.set(o.hair); mats.hairShell2.color.set(o.hair); }
      if (o.skin) mats.skin.color.set(o.skin);
      if (o.pack) mats.pack.color.set(o.pack);
      if (o.backpack !== undefined) pack.visible = !!o.backpack;
      return this;
    },
    get hat() { return curHat; },
    hatNames: Object.keys(hats),
    update(dt, s) {
      st.t += dt; const t = st.t;
      const run = THREE.MathUtils.clamp((s.speed - 6) / 5, 0, 1), mv = THREE.MathUtils.clamp(s.speed / 6.5, 0, 1);
      const air = !s.grounded; const emoOn = !!(st.em && st.em.name !== 'wave' && !air && mv < 0.15 + (st.em.name === 'dance' ? 1 : 0));
      st.crouch = damp(st.crouch, s.crouch ? 1 : 0, s.crouch ? 30 : 14, dt);
      st.phase += dt * s.speed * 1.5;
      const sw = Math.sin(st.phase), cw = Math.cos(st.phase), amp = mv * (0.75 + run * 0.45);
      // takeoff stretch (after the crouch) / landing squash
      if (air && st.wasGround) { st.sy = 1.0; st.svy = 9; }
      if (!air && !st.wasGround) { const k = Math.min(1, -s.landVy / 20); st.sy = Math.max(0.6, 0.9 - k * 0.35); st.svy = 0; st.landRec = 0.25 + k * 0.2; s.onLand && s.onLand(Math.min(1, -s.landVy / 15)); }
      st.wasGround = !air; st.landRec = Math.max(0, st.landRec - dt);
      const target = air ? 1 + Math.min(0.2, Math.abs(s.vy) * 0.015) : (1 + Math.sin(t * 2.2) * 0.018 * (1 - mv)) - st.crouch * 0.17;
      st.svy += ((target - st.sy) * 260 - st.svy * 15) * dt; st.sy += st.svy * dt;
      const sxz = 1 / Math.sqrt(st.sy);
      rig.scale.set(sxz, st.sy, sxz);
      // weight: bounce + hip sway + torso side-shift over the planted foot
      const bounce = air ? 0 : Math.abs(sw) * 0.09 * amp;
      st.sway = damp(st.sway, air ? 0 : sw * 0.05 * amp, 20, dt);
      torso.position.y = 1.06 + bounce * 0.5 - st.crouch * 0.1 - st.landRec * 0.1; head.position.y = 1.4 + bounce - st.crouch * 0.14 - st.landRec * 0.12;
      torso.position.x = st.sway; head.position.x = -st.sway * 0.5;
      const f = Math.sign(sw);
      if (!air && mv > 0.3 && f !== st.foot) { st.foot = f; s.onFoot && s.onFoot(f, run); } else if (mv <= 0.3) st.foot = 0;
      // legs: hip + knee bend (crouch folds both knees)
      for (let i = 0; i < 2; i++) {
        const side = i ? -1 : 1, l = legs[i], kn = l.userData.knee, ft = l.userData.foot;
        if (emoOn) { ft.rotation.x = -(l.rotation.x + kn.rotation.x) * 0.55; continue; }
        let hip, knee;
        if (air) { hip = side * (s.vy > 0 ? 0.5 : 0.9); knee = s.vy > 0 ? 0.6 + (i ? 0.3 : 0) : 0.35; }
        else {
          hip = side * sw * amp + st.crouch * -0.55 + st.landRec * -0.5;
          knee = Math.max(0, -side * cw) * amp * 1.1 + st.crouch * 1.1 + st.landRec * 0.9 + (mv < 0.1 ? 0.04 : 0.1 * amp);
        }
        l.rotation.x = lerp(l.rotation.x, hip, Math.min(1, dt * 22));
        kn.rotation.x = lerp(kn.rotation.x, knee, Math.min(1, dt * 22));
        ft.rotation.x = -(l.rotation.x + kn.rotation.x) * 0.55 + (air ? 0.4 : 0);
        l.position.y = 0.8 + (air ? 0.05 : 0);
      }
      // arms: swing + elbow bend + hand flop; crouch pulls arms back, jump throws them up
      st.idle = mv < 0.1 && !air ? st.idle + dt : 0;
      if (st.idle > 6 && st.wave <= 0) st.wave = 2.0;
      if (st.wave > 0) { st.wave -= dt; if (mv > 0.1) st.wave = 0; }
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1, a = arms[i], { elbow, hand } = a.userData;
        if (emoOn) continue;
        let rx = -side * sw * amp * 1.1 + st.crouch * 0.7, rz = (i ? 1 : -1) * 0.27 + st.crouch * (i ? 1 : -1) * 0.1;
        let el = -(0.25 + run * 0.7) * mv - 0.12 - st.crouch * 0.2;
        if (side * sw < 0) el -= 0.3 * amp; // forward arm bends more
        if (air) { rx = lerp(a.rotation.x, -0.4, dt * 10); rz = (i ? -1 : 1) * (s.vy > 0 ? 2.3 : 1.4); el = -0.3; }
        if (i === 1 && st.wave > 0) { rx = 0; rz = -2.6 + Math.sin(t * 14) * 0.35; el = -0.5 + Math.sin(t * 14) * 0.3; }
        a.rotation.x = lerp(a.rotation.x, rx, Math.min(1, dt * 14));
        a.rotation.z = lerp(a.rotation.z, rz, Math.min(1, dt * 12));
        elbow.rotation.x = lerp(elbow.rotation.x, el, Math.min(1, dt * 14));
        hand.rotation.x = -elbow.rotation.x * 0.25 + Math.sin(t * 3 + i) * 0.04 * (1 - mv);
      }
      // lean (forward/back + turning) & head
      st.turn = damp(st.turn, s.yawRate || 0, 10, dt);
      st.lean = lerp(st.lean, air ? (s.vy > 0 ? -0.1 : 0.12) : mv * 0.12 + run * 0.18 + st.crouch * 0.22, Math.min(1, dt * 8));
      torso.rotation.x = st.lean; torso.rotation.z = sw * 0.05 * amp - THREE.MathUtils.clamp(st.turn * 0.035, -0.3, 0.3) * (0.4 + mv);
      torso.scale.set(1, 1 + Math.sin(t * 2.2) * 0.015 * (1 - mv), 1);
      head.rotation.x = -st.lean * 0.6 + (air ? (s.vy > 0 ? -0.15 : 0.1) : 0) + st.crouch * 0.1;
      const lookT = mv < 0.1 ? Math.sin(t * 0.6) * 0.3 + Math.sin(t * 1.7) * 0.1 : 0;
      st.headYaw = lerp(st.headYaw, lookT + THREE.MathUtils.clamp(st.turn * 0.04, -0.4, 0.4), Math.min(1, dt * 5));
      head.rotation.y = st.headYaw; head.rotation.z = mv < 0.1 ? Math.sin(t * 1.1) * 0.05 : -sw * 0.03 * amp - THREE.MathUtils.clamp(st.turn * 0.02, -0.15, 0.15);
      // secondary motion: hat / ahoge are springs lagging the head's motion
      const hvx = (head.position.y - st.prevHY) / Math.max(dt, 1e-3), hvy = (st.headYaw - st.prevHX) / Math.max(dt, 1e-3);
      st.prevHY = head.position.y; st.prevHX = st.headYaw;
      const fx = -hvx * 0.03 - (air ? s.vy * 0.012 : 0) - st.lean * 0.4, fz = hvy * 0.05 + st.sway * 0.8;
      st.hatVx += ((fx - st.hatX) * 160 - st.hatVx * 10) * dt; st.hatX += st.hatVx * dt;
      st.hatVz += ((fz - st.hatZ) * 160 - st.hatVz * 10) * dt; st.hatZ += st.hatVz * dt;
      hatRoot.rotation.x = THREE.MathUtils.clamp(st.hatX, -0.4, 0.4); hatRoot.rotation.z = THREE.MathUtils.clamp(st.hatZ, -0.3, 0.3);
      hatRoot.position.y = 0.52 + Math.max(0, st.hatVx) * 0.004;
      ahoge.rotation.z = Math.sin(t * 3) * 0.1 - (air ? s.vy * 0.03 : 0) - mv * 0.2 + st.hatZ * 1.5; ahoge.rotation.x = Math.sin(t * 2.3) * 0.08 + st.hatX * 1.5;
      bangs.rotation.x = st.hatX * 0.5 + (air ? Math.min(0.3, Math.max(-0.3, -s.vy * 0.02)) : 0); sides.rotation.z = st.hatZ * 0.3;
      // ---- emotes (override poses; blended in with lerps) ----
      let drop = 0, happyForce = false;
      const nv = [torso.rotation.x, torso.rotation.y, torso.rotation.z, head.rotation.x, head.rotation.y, head.rotation.z, torso.position.x, head.position.x];
      if (st.em) {
        const em = st.em; em.t += dt;
        if (!em.fade && ((mv > 0.15 && em.name !== 'dance') || air || em.t > em.dur)) em.fade = 0.4;
        if (em.fade !== undefined) { em.fade -= dt; if (em.fade <= 0) st.em = null; }
        if (!st.em) { /* done */ }
        else {
          const k = Math.min(1, dt * 16), e = em.t, A = arms, L = legs;
          const setArm = (i, rx, rz, el) => { A[i].rotation.x = lerp(A[i].rotation.x, rx, k); A[i].rotation.z = lerp(A[i].rotation.z, rz, k); A[i].userData.elbow.rotation.x = lerp(A[i].userData.elbow.rotation.x, el, k); };
          const setLeg = (i, hip, kn) => { L[i].rotation.x = lerp(L[i].rotation.x, hip, k); L[i].userData.knee.rotation.x = lerp(L[i].userData.knee.rotation.x, kn, k); };
          if (em.name === 'wave') {
            const w = Math.sin(e * 11); happyForce = true;
            setArm(1, 0, 2.55 + w * 0.5, -0.9 + w * 0.7); setArm(0, 0.25, -0.35, -0.25);
            torso.rotation.z = 0.12 + Math.sin(e * 5.5) * 0.06; torso.rotation.x = -0.08; head.rotation.z = -0.22 + Math.sin(e * 5.5) * 0.08; head.rotation.x = -0.12;
            drop = -Math.abs(Math.sin(e * 5.5)) * 0.04;
          } else if (em.name === 'cheer') {
            happyForce = true; const e2 = e - 0.3;
            if (e2 < 0) { // anticipation: crouch, arms swing back
              const q = Math.sin(Math.min(1, e / 0.3) * Math.PI / 2);
              drop = -0.2 * q; setArm(0, 0.9 * q, -0.5, -0.3); setArm(1, 0.9 * q, 0.5, -0.3); setLeg(0, -0.5 * q, 1.0 * q); setLeg(1, -0.5 * q, 1.0 * q);
              torso.rotation.x = 0.3 * q; head.rotation.x = 0.1 * q;
            } else {
              const ph = Math.sin(e2 * 6.5), hop = Math.max(0, ph);
              rig.position.y = hop * 0.7; const air2 = hop > 0.05;
              setArm(0, -0.1, -2.45 - hop * 0.25, -0.12 - hop * 0.2); setArm(1, -0.1, 2.45 + hop * 0.25, -0.12 - hop * 0.2);
              setLeg(0, air2 ? 0.7 : -0.3, air2 ? 1.3 : 0.9); setLeg(1, air2 ? -0.5 : -0.3, air2 ? 1.3 : 0.9);
              drop = ph < 0 ? ph * 0.16 : 0; head.rotation.x = -0.45; torso.rotation.x = -0.18; torso.rotation.z = Math.sin(e2 * 3.25) * 0.12;
            }
          } else if (em.name === 'dance') {
            const b = Math.sin(e * 6.5), b2 = Math.sin(e * 6.5 + Math.PI), c = Math.sin(e * 3.25);
            drop = -Math.abs(b) * 0.16; happyForce = true;
            setArm(0, Math.sin(e * 6.5) * 0.9, -(1.6 + b * 1.0), -0.9 + b * 0.3); setArm(1, Math.sin(e * 6.5 + 2) * 0.9, 1.6 + b2 * 1.0, -0.9 + b2 * 0.3);
            setLeg(0, Math.max(0, b) * 0.9 - 0.2, 0.5 + Math.max(0, b) * 1.3); setLeg(1, Math.max(0, b2) * 0.9 - 0.2, 0.5 + Math.max(0, b2) * 1.3);
            torso.rotation.z = c * 0.34; torso.rotation.y = c * 0.55; head.rotation.z = -c * 0.32; head.rotation.y = -c * 0.45; torso.rotation.x = 0.1;
            torso.position.x = c * 0.16; head.position.x = -c * 0.1; rig.rotation.y = Math.sin(e * 1.4) * 1.3; rig.position.y = Math.abs(b) * 0.1;
          } else if (em.name === 'sit') {
            drop = -0.46 * Math.min(1, e * 5);
            setLeg(0, -1.25, 1.7); setLeg(1, -1.25, 1.7);
            setArm(0, -0.85, 0.28, -0.7); setArm(1, -0.85, -0.28, -0.7);
            torso.rotation.x = 0.16; head.rotation.x = -0.16 + Math.sin(t * 1.2) * 0.04; head.rotation.y = Math.sin(t * 0.7) * 0.35;
          }
        }
      } else { rig.rotation.y = lerp(rig.rotation.y, 0, Math.min(1, dt * 10)); rig.position.y = lerp(rig.position.y, 0, Math.min(1, dt * 12)); }
      if (st.em) {
        const w = Math.min(1, st.em.t / 0.2) * (st.em.fade !== undefined ? Math.max(0, st.em.fade / 0.4) : 1);
        torso.rotation.x = lerp(nv[0], torso.rotation.x, w); torso.rotation.y = lerp(nv[1], torso.rotation.y, w); torso.rotation.z = lerp(nv[2], torso.rotation.z, w);
        head.rotation.x = lerp(nv[3], head.rotation.x, w); head.rotation.y = lerp(nv[4], head.rotation.y, w); head.rotation.z = lerp(nv[5], head.rotation.z, w);
        torso.position.x = lerp(nv[6], torso.position.x, w); head.position.x = lerp(nv[7], head.position.x, w);
        rig.rotation.y *= w; rig.position.y *= w; drop *= w;
      }
      if (drop) { const dd = drop; torso.position.y += dd; head.position.y += dd; for (const l of legs) l.position.y += (st.em?.name === 'sit' ? dd * 0.95 : 0); }
      if (st.em && st.em.name === 'sit') for (const l of legs) l.position.y = 0.8 + drop;
      blinker.update(dt, s.happy || happyForce);
      const h = s.heightAboveGround || 0;
      blob.position.y = 0.06 - h + (s.groundDelta || 0); blob.scale.setScalar(Math.max(0.35, 1 - h * 0.12)); blob.material.opacity = 0.28 * Math.max(0.3, 1 - h * 0.1);
    },
  };
  root.userData.hero = hero; hero.bake = bk;
  root.userData.legs = legs; root.userData.arms = arms;
  root.setOutfit = (o) => hero.setOutfit(o);
  hero.setOutfit({ hat: opts.hat ?? 'none', ...opts });

  return root;
}
