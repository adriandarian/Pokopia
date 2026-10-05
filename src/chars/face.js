import * as THREE from 'three';
import { sphereGeo, mergeColored } from './toon.js';

let _vc, _cheekMats = {};
const vcBasic = () => _vc || (_vc = new THREE.MeshBasicMaterial({ vertexColors: true }));
const INK = '#2a1d2e';
const halfArc = (r, t) => new THREE.TorusGeometry(r, t, 6, 14, Math.PI);

// Places a cute face on an ellipsoid surface. radii = [rx, ry, rz], c = ellipsoid centre (in parent space).
// Every face part is merged: per eye 1 mesh (open) / 1 (happy) / 1 (sleep), cheeks 1, mouth 1-2 => ~6 draws per face.
export function addFace(parent, radii, c, o = {}) {
  const [rx, ry, rz] = radii;
  const ex = o.ex ?? 0.38, ey = o.ey ?? 0.1, size = o.size ?? 0.1, cheekCol = o.cheek ?? '#ff8fa8';
  const surf = (u, v, push = 1.0) => {
    const w = Math.sqrt(Math.max(0.02, 1 - u * u - v * v));
    const p = new THREE.Vector3(c[0] + u * rx, c[1] + v * ry, c[2] + w * rz * push);
    const n = new THREE.Vector3(u / rx, v / ry, w / rz).normalize();
    return { p, n };
  };
  const orient = (g, n) => { g.rotation.order = 'YXZ'; g.rotation.y = Math.atan2(n.x, n.z); g.rotation.x = -Math.asin(n.y); };
  const eyes = [];
  for (const sx of [-1, 1]) {
    const { p, n } = surf(sx * ex, ey, 0.985);
    const g = new THREE.Group(); g.position.copy(p); orient(g, n); parent.add(g);
    const open = new THREE.Mesh(mergeColored([
      { geo: sphereGeo(1, 20, 14), color: INK, scale: [size, size * 1.3, size * 0.45] },
      { geo: sphereGeo(1, 10, 8), color: '#ffffff', pos: [sx * -size * 0.25, size * 0.5, size * 0.4], scale: [size * 0.36, size * 0.36, size * 0.36] },
      { geo: sphereGeo(1, 8, 6), color: '#ffffff', pos: [sx * size * 0.3, -size * 0.45, size * 0.4], scale: [size * 0.16, size * 0.16, size * 0.16] },
    ]), vcBasic()); g.add(open);
    const arc = new THREE.Mesh(mergeColored([{ geo: halfArc(size * 0.8, size * 0.17), color: INK }]), vcBasic());
    arc.position.set(0, -size * 0.35, size * 0.05); arc.visible = false; g.add(arc);
    const sleep = new THREE.Mesh(arc.geometry, vcBasic()); sleep.rotation.z = Math.PI; sleep.position.set(0, size * 0.35, size * 0.05); sleep.visible = false; g.add(sleep);
    g.userData = { open: [open], arc, sleep };
    eyes.push(g);
  }
  // cheeks: both merged into one transparent mesh
  const cheekGeos = [];
  for (const sx of [-1, 1]) {
    const { p, n } = surf(sx * (ex + 0.28), ey - 0.3, 0.99);
    const m = new THREE.Mesh(sphereGeo(1, 12, 8)); m.position.copy(p); orient(m, n); m.scale.set(size * 1.1, size * 0.65, size * 0.12); m.updateMatrix();
    const gg = m.geometry.toNonIndexed(); gg.deleteAttribute('uv'); gg.applyMatrix4(m.matrix); cheekGeos.push(gg);
  }
  const cm = _cheekMats[cheekCol] || (_cheekMats[cheekCol] = new THREE.MeshBasicMaterial({ color: cheekCol, transparent: true, opacity: 0.75 }));
  const cheekMesh = new THREE.Mesh(mergeGeoms(cheekGeos), cm); parent.add(cheekMesh);
  const cheeks = [cheekMesh];

  let mouth = null; const mset = {};
  if (o.mouth !== false) {
    const ms = o.msize ?? size;
    mouth = new THREE.Group();
    if (o.mouthAt) { mouth.position.set(...o.mouthAt); mouth.rotation.x = o.mouthTilt ?? 0; }
    else { const { p, n } = surf(0, ey - 0.28, 1.0); mouth.position.copy(p); orient(mouth, n); }
    parent.add(mouth);
    const smileG = halfArc(ms * 0.55, ms * 0.1);
    const smile = new THREE.Mesh(mergeColored([{ geo: smileG, color: INK, pos: [0, ms * 0.3, 0], rot: [0, 0, Math.PI] }]), vcBasic()); mouth.add(smile);
    const wItems = [];
    for (const sx of [-1, 1]) wItems.push({ geo: halfArc(ms * 0.3, ms * 0.09), color: INK, pos: [sx * ms * 0.3, ms * 0.12, 0], rot: [0, 0, Math.PI] });
    wItems.push({ geo: new THREE.CylinderGeometry(ms * 0.07, ms * 0.07, ms * 0.3, 5), color: INK, pos: [0, ms * 0.32, 0] });
    const wm = new THREE.Mesh(mergeColored(wItems), vcBasic()); wm.visible = false; mouth.add(wm);
    const open = new THREE.Mesh(mergeColored([
      { geo: sphereGeo(1, 14, 10), color: INK, scale: [ms * 0.55, ms * 0.5, ms * 0.14] },
      { geo: sphereGeo(1, 10, 8), color: '#ff7a93', pos: [0, -ms * 0.22, ms * 0.05], scale: [ms * 0.34, ms * 0.2, ms * 0.1] },
    ]), vcBasic()); open.visible = false; mouth.add(open);
    Object.assign(mset, { smile, wm, open, base: o.mouthKind || 'smile' });
    if (mset.base === 'w') { smile.visible = false; wm.visible = true; } else if (mset.base === 'none') smile.visible = false;
    if (o.tongue) { mset.base = 'open'; smile.visible = false; open.visible = true; open.userData.rest = 0.7; }
  }
  const f = {
    eyes, mouth, cheeks, _eye: 'open', parts: [...eyes, cheekMesh, mouth].filter(Boolean),
    blinkAmt(v) { for (const e of eyes) e.scale.y = Math.max(0.08, v); },
    // 'open' | 'happy' (^ ^) | 'sleep' (u u)
    setEye(mode) {
      if (mode === this._eye) return; this._eye = mode;
      for (const e of eyes) { const u = e.userData; u.open.forEach(m => m.visible = mode === 'open'); u.arc.visible = mode === 'happy'; u.sleep.visible = mode === 'sleep'; if (mode !== 'open') e.scale.y = 1; }
    },
    setHappy(h) { this.setEye(h ? 'happy' : 'open'); },
    // v 0..1 open amount for talking / chewing / yawning
    setOpen(v) {
      if (!mset.open) return;
      const rest = mset.open.userData.rest || 0; const k = Math.max(v, rest);
      if (k > 0.05) { mset.open.visible = true; mset.smile.visible = false; mset.wm.visible = false; mset.open.scale.y = Math.max(0.05, k); }
      else { mset.open.visible = false; mset.smile.visible = mset.base === 'smile'; mset.wm.visible = mset.base === 'w'; }
    },
  };
  return f;
}
function mergeGeoms(list) { return mergeColored(list.map(g => ({ geo: g, color: '#ffffff' }))); }

// Blink controller: call .update(dt, happyClosed, sleeping) and it drives the face.
export class Blinker {
  constructor(face) { this.face = face; this.t = 1 + Math.random() * 3; this.b = 0; }
  update(dt, happy = false, sleeping = false) {
    this.t -= dt;
    if (this.t < 0) { this.b = 0.16; this.t = 2 + Math.random() * 3.5; if (Math.random() < 0.2) this.t = 0.3; }
    if (this.b > 0) this.b -= dt;
    if (sleeping) { this.face.setEye('sleep'); return; }
    if (happy) { this.face.setEye('happy'); return; }
    this.face.setEye('open');
    this.face.blinkAmt(this.b > 0 ? Math.abs(this.b / 0.16 - 0.5) * 2 : 1);
  }
}
