import * as THREE from 'three';
import { part, sphereGeo, Mat, toon } from './toon.js';

// Places a cute face on an ellipsoid surface. radii = [rx, ry, rz], c = ellipsoid centre (in parent space).
// Returns { eyes:[group,group], blinkAmt(v), mouth, cheeks }.
export function addFace(parent, radii, c, o = {}) {
  const [rx, ry, rz] = radii;
  const ex = o.ex ?? 0.38, ey = o.ey ?? 0.1, size = o.size ?? 0.1, cheekCol = o.cheek ?? '#ff8fa8';
  const surf = (u, v, push = 1.0) => { // u,v = normalised offsets (x/rx, y/ry) -> point + outward normal
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
    const pupil = new THREE.Mesh(sphereGeo(1, 20, 14), Mat.eye()); pupil.scale.set(size, size * 1.3, size * 0.45); g.add(pupil);
    const hl = new THREE.Mesh(sphereGeo(1, 10, 8), Mat.white()); hl.scale.setScalar(size * 0.36); hl.position.set(sx * -size * 0.25, size * 0.5, size * 0.4); g.add(hl);
    const hl2 = new THREE.Mesh(sphereGeo(1, 8, 6), Mat.white()); hl2.scale.setScalar(size * 0.16); hl2.position.set(sx * size * 0.3, -size * 0.45, size * 0.4); g.add(hl2);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(size * 0.8, size * 0.17, 6, 14, Math.PI), Mat.eye());
    arc.position.y = -size * 0.35; arc.position.z = size * 0.05; arc.visible = false; g.add(arc);
    g.userData = { open: [pupil, hl, hl2], arc };
    eyes.push(g);
  }
  const cheeks = [];
  const cm = new THREE.MeshBasicMaterial({ color: cheekCol, transparent: true, opacity: 0.75 });
  for (const sx of [-1, 1]) {
    const { p, n } = surf(sx * (ex + 0.28), ey - 0.3, 0.99);
    const g = new THREE.Mesh(sphereGeo(1, 12, 8), cm); g.position.copy(p); orient(g, n);
    g.scale.set(size * 1.1, size * 0.65, size * 0.12); parent.add(g); cheeks.push(g);
  }
  let mouth = null;
  if (o.mouth !== false) {
    const { p, n } = surf(0, ey - 0.28, 1.0);
    mouth = new THREE.Group(); mouth.position.copy(p); orient(mouth, n); parent.add(mouth);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(size * 0.55, size * 0.1, 6, 14, Math.PI), Mat.eye());
    arc.rotation.z = Math.PI; arc.position.y = size * 0.3; mouth.add(arc);
    if (o.tongue) {
      const t = new THREE.Mesh(sphereGeo(1, 8, 6), toon('#ff7a93', { rim: 0 })); t.scale.set(size * 0.35, size * 0.2, size * 0.1); t.position.set(0, -size * 0.15, -0.002); mouth.add(t);
    }
  }
  return {
    eyes, mouth, cheeks,
    // v: 1 open, 0 closed
    blinkAmt(v) { for (const e of eyes) e.scale.y = Math.max(0.08, v); },
    // happy ^ ^ eyes
    setHappy(h) { if (h === this._h) return; this._h = h; for (const e of eyes) { e.userData.open.forEach(m => m.visible = !h); e.userData.arc.visible = h; if (h) e.scale.y = 1; } },
  };
}

// Blink controller: call .update(dt) and it drives face.blinkAmt.
export class Blinker {
  constructor(face) { this.face = face; this.t = 1 + Math.random() * 3; this.b = 0; }
  update(dt, forceClosed = false) {
    this.t -= dt;
    if (this.t < 0) { this.b = 0.16; this.t = 2 + Math.random() * 3.5; if (Math.random() < 0.2) this.t = 0.3; }
    if (this.b > 0) this.b -= dt;
    const closed = forceClosed || this.b > 0;
    const k = closed ? (forceClosed ? 0 : Math.abs(this.b / 0.16 - 0.5) * 2) : 1;
    this.face.setHappy(!!forceClosed);
    if (!forceClosed) this.face.blinkAmt(k);
  }
}
