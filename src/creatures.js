import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, WORLD } from './terrain.js';
import { mulberry } from './noise.js';
import { SPECIES } from './chars/species.js';
import { Blinker } from './chars/face.js';
import { getFX, tickFX, world } from './chars/fx.js';

export { SPECIES };
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

let blobMat, blobGeo;
function makeCreature(sp) {
  const m = new THREE.Group();
  const rig = new THREE.Group(); m.add(rig);
  const parts = sp.build(rig);
  rig.traverse(o => { if (o.isMesh && !o.userData.isOutline) o.castShadow = true; });
  blobGeo = blobGeo || new THREE.CircleGeometry(0.7, 16).rotateX(-Math.PI / 2);
  blobMat = blobMat || new THREE.MeshBasicMaterial({ color: '#1d2b12', transparent: true, opacity: 0.25, depthWrite: false });
  const blob = new THREE.Mesh(blobGeo, blobMat); blob.position.y = 0.05; blob.renderOrder = 1; m.add(blob);
  return { m, rig, blob, ...parts };
}

export class Creatures {
  constructor(scene) {
    this.list = []; this.scene = scene; this.fx = getFX(scene); const rnd = mulberry(99);
    this.frame = 0; if (typeof window !== 'undefined') window.__creatures = this; // QA hook
    for (let i = 0; i < 16; i++) {
      let x, z, h; do { x = (rnd() - 0.5) * WORLD * 0.7; z = (rnd() - 0.5) * WORLD * 0.7; h = heightAt(x, z); } while (h < 1 || h > 9);
      const sp = SPECIES[i % SPECIES.length], c = makeCreature(sp);
      c.m.position.set(x, h, z); c.m.rotation.y = rnd() * 6.28; scene.add(c.m);
      Object.assign(c, {
        sp, target: new THREE.Vector3(x, h, z), phase: rnd() * 6, wait: rnd() * 3, blinker: new Blinker(c.face),
        hopT: 0, sy: 1, svy: 0, jy: 0, jv: 0, speed: 0, affinity: 0, friend: false, heartT: 1 + rnd(), greetT: 2 + rnd() * 3, happy: 0, wasAir: false,
      });
      this.list.push(c);
    }
  }
  get friends() { return this.list.filter(c => c.friend); }
  update(dt, t) {
    this.frame++; world.frame++; tickFX(dt, world.frame);
    const pp = world.playerPos; let fi = 0;
    for (const c of this.list) {
      const p = c.m.position, ph = c.phase;
      const dx = pp.x - p.x, dz = pp.z - p.z, dist = Math.hypot(dx, dz);
      const toPlayer = Math.atan2(dx, dz);
      let want = 0, wantSpeed = 0, faceYaw = null;

      // ----- affinity & befriending -----
      const near = dist < 6, notice = dist < 11;
      c.happy = damp(c.happy, c.friend ? (dist < 9 ? 1 : 0.4) : (near ? 1 : 0), 4, dt);
      if (!c.friend) {
        if (dist < 4.2 && Math.abs(pp.y - p.y) < 3) c.affinity += dt; else c.affinity = Math.max(0, c.affinity - dt * 0.5);
        if (c.affinity > 2.5) {
          c.friend = true; c.jv = 7;
          this.fx.hearts(p.clone().setY(p.y + c.top), 7); this.fx.pop(p.clone().setY(p.y + c.top + 0.6), 'Friend!', '#ffd1e8');
        }
      }

      // ----- behaviour -----
      if (c.friend) {
        // follow the player in a loose trail
        const keep = 2.4 + (fi++ % 4) * 0.6;
        if (dist > 40) { p.x = pp.x - 3; p.z = pp.z - 3; }
        else if (dist > keep + 0.4) { wantSpeed = Math.min(8, 1.5 + (dist - keep) * 1.6); faceYaw = toPlayer; }
        else if (dist < keep - 0.5) { wantSpeed = 0; faceYaw = toPlayer; }
        else faceYaw = toPlayer;
        if (wantSpeed > 0) { c.dirX = dx / (dist || 1); c.dirZ = dz / (dist || 1); }
      } else {
        c.wait -= dt;
        if (c.wait <= 0) {
          const a = Math.random() * 6.28, r = 3 + Math.random() * 6;
          const tx = p.x + Math.cos(a) * r, tz = p.z + Math.sin(a) * r, th = heightAt(tx, tz);
          if (th > 0.8 && th < 10) { c.target.set(tx, th, tz); c.wait = 2 + Math.random() * 4; c.walking = true; } else c.wait = 0.3;
        }
        const d = c.target.clone().sub(p); d.y = 0; const dl = d.length();
        if (c.walking && dl > 0.3 && !near) { wantSpeed = 2.1; c.dirX = d.x / dl; c.dirZ = d.z / dl; faceYaw = Math.atan2(d.x, d.z); }
        else { c.walking = false; if (notice) faceYaw = toPlayer; }
      }
      if (c.pin) { wantSpeed = 0; faceYaw = c.pin.yaw ?? faceYaw; p.x = c.pin.x; p.z = c.pin.z; c.walking = false; }
      c.speed = damp(c.speed, wantSpeed, 6, dt);
      const moving = c.speed > 0.35;
      if (moving) {
        const nx = p.x + c.dirX * c.speed * dt, nz = p.z + c.dirZ * c.speed * dt, nh = heightAt(nx, nz);
        if (nh > 0.4) { p.x = nx; p.z = nz; } else { c.walking = false; c.speed = 0; }
      }
      if (faceYaw !== null) c.m.rotation.y += wrapPi(faceYaw - c.m.rotation.y) * (1 - Math.exp(-(moving ? 9 : 5) * dt));

      // ----- greeting hop + hearts when player is close -----
      if (near && !c.friend || c.friend && dist < 7) {
        c.greetT -= dt;
        if (c.greetT <= 0 && c.jy <= 0.01 && !moving) { c.jv = 5.2; c.greetT = c.friend ? 3 + Math.random() * 3 : 1.8 + Math.random() * 1.6; }
        c.heartT -= dt;
        if (c.heartT <= 0) { this.fx.hearts(p.clone().setY(p.y + c.top), 1); c.heartT = c.friend ? 3 + Math.random() * 2 : 1.6 + Math.random(); }
      }
      // jump physics
      if (c.jv !== 0 || c.jy > 0) { c.jv -= 22 * dt; c.jy += c.jv * dt; if (c.jy <= 0) { c.jy = 0; if (c.jv < -3) { c.sy = 0.72; c.svy = 0; this.fx.dust(p, 3, 0.7); } c.jv = 0; } }

      // ----- hop-walking -----
      let hop = 0, air = c.jy > 0.02;
      if (moving) {
        c.hopT += dt * (2.6 + c.speed * 0.5);
        const q = c.hopT % 1; hop = 4 * q * (1 - q) * (0.28 + c.speed * 0.06);
        if (c.hopT >= 1) { c.hopT -= 1; c.sy = 0.8; c.svy = 0; if (c.speed > 2) this.fx.dust(p, 2, 0.6); }
      } else c.hopT = 0;
      const ground = heightAt(p.x, p.z);
      p.y = ground + hop + c.jy;
      const airborne = air || hop > 0.04;
      c.blob.position.y = 0.05 - (hop + c.jy) + 0.0; c.blob.scale.setScalar(Math.max(0.5, 1 - (hop + c.jy) * 0.25));

      // ----- squash & stretch spring -----
      const idleB = 1 + Math.sin(t * 2.2 + ph) * 0.025;
      const tgt = airborne ? 1 + Math.min(0.18, (Math.abs(c.jv) + hop * 3) * 0.03) : idleB;
      c.svy += ((tgt - c.sy) * 240 - c.svy * 14) * dt; c.sy += c.svy * dt;
      const sxz = 1 / Math.sqrt(c.sy);
      c.rig.scale.set(sxz, c.sy, sxz);
      c.rig.rotation.z = Math.sin(t * 1.3 + ph) * 0.03 * (1 - c.happy) + (faceYaw !== null && notice && !c.friend ? Math.sin(t * 3 + ph) * 0.05 * c.happy : 0);

      // ----- appendages -----
      const fl = c.happy * 0.5 + (moving ? 0.5 : 0);
      for (const e of c.ears) e.g.rotation.z = e.base + e.side * (Math.sin(t * 2 + ph + e.side) * 0.05 + (c.sy - 1) * -0.9 + (c.happy > 0.5 ? Math.sin(t * 9 + ph) * 0.08 : 0));
      for (const w of c.wings) w.g.rotation.z = w.side * (0.12 + (airborne || c.happy > 0.5 ? 0.5 + Math.sin(t * 20 + ph) * 0.45 * Math.max(fl, airborne ? 1 : 0) : Math.sin(t * 2 + ph) * 0.05));
      for (const l of c.leaves) l.g.rotation.z = l.base + l.side * (Math.sin(t * 2.4 + ph) * 0.1 + (c.sy - 1) * -1.2);
      if (c.tail) { c.tail.rotation.y = Math.sin(t * (4 + c.happy * 10) + ph) * (0.25 + c.happy * 0.45); c.tail.rotation.x = Math.sin(t * 2 + ph) * 0.05; }
      if (c.extra) { c.extra.rotation.z = Math.sin(t * 2.7 + ph) * 0.12 + (c.sy - 1) * 0.5; c.extra.rotation.x = Math.sin(t * 2.1 + ph) * 0.06; }
      c.blinker.update(dt, c.happy > 0.85 && c.friend);
    }
  }
}

// ---------------- Collectibles: gems & berries ----------------
function gemGeo() {
  const pts = [[0.001, -0.5], [0.16, -0.3], [0.36, 0.0], [0.4, 0.1], [0.26, 0.3], [0.001, 0.32]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 8); return g.toNonIndexed();
}
function berryGeo(col, leafCol) {
  const b = new THREE.SphereGeometry(0.27, 14, 10).toNonIndexed();
  const l = new THREE.ConeGeometry(0.12, 0.2, 6).toNonIndexed(); l.translate(0, 0.3, 0);
  const hl = new THREE.SphereGeometry(0.05, 6, 5).toNonIndexed(); hl.translate(-0.1, 0.1, 0.2);
  const paint = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); const cc = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const m = mergeGeometries([paint(b, col), paint(l, leafCol), paint(hl, '#ffffff')]);
  m.deleteAttribute('uv'); return m;
}

export class Collectibles {
  constructor(scene, onCollect) {
    this.onCollect = onCollect; this.items = []; this.scene = scene; this.fx = getFX(scene); this.lastT = 0; this.time = 0;
    this.gem = gemGeo();
    const gemCols = [['#ff6fb0', '#ff2f8a'], ['#6fd0ff', '#2f9cff'], ['#ffe066', '#ffb300'], ['#8cf0b0', '#2fd37a']];
    this.types = gemCols.map(([c, e]) => ({
      kind: 'gem', color: c, geo: this.gem,
      mat: new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: 0.7, roughness: 0.18, metalness: 0.2, flatShading: true }),
      halo: new THREE.SpriteMaterial({ map: haloTex(), color: e, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }),
    }));
    const berries = [['#ff4d6d', '#ff2a4d'], ['#9a6bff', '#6a3dd8']];
    const bmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, emissive: '#ff3355', emissiveIntensity: 0.25 });
    for (const [c, e] of berries) this.types.push({
      kind: 'berry', color: c, geo: berryGeo(c, '#5fcf5a'),
      mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, emissive: e, emissiveIntensity: 0.3 }),
      halo: new THREE.SpriteMaterial({ map: haloTex(), color: e, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.4 }),
    });
    for (let i = 0; i < 60; i++) this.spawn(true);
  }
  spawn(initial = false) {
    let x, z, h; do { x = (Math.random() - 0.5) * WORLD * 0.8; z = (Math.random() - 0.5) * WORLD * 0.8; h = heightAt(x, z); } while (h < 1 || h > 10);
    const ty = this.types[Math.floor(Math.random() * this.types.length)];
    const g = new THREE.Group(); g.position.set(x, h + 1.1, z);
    const mesh = new THREE.Mesh(ty.geo, ty.mat); mesh.castShadow = false; g.add(mesh);
    const halo = new THREE.Sprite(ty.halo); halo.scale.setScalar(1.6); g.add(halo);
    g.userData = { ty, baseY: h + 1.1, mesh, halo, ph: Math.random() * 6.28, born: initial ? -1 : this.time, mag: 0 };
    g.scale.setScalar(initial ? 1 : 0.001);
    this.scene.add(g); this.items.push(g);
  }
  update(t, playerPos) {
    const dt = Math.min(0.05, Math.max(0, t - this.lastT)); this.lastT = t; this.time = t;
    const cx = playerPos.x, cy = playerPos.y + 1.0, cz = playerPos.z;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const m = this.items[i], u = m.userData, ty = u.ty;
      const dx = cx - m.position.x, dy = cy - m.position.y, dz = cz - m.position.z, d = Math.hypot(dx, dy, dz);
      // spawn-in pop
      const age = t - u.born; let sc = 1;
      if (u.born >= 0 && age < 0.5) { const k = age / 0.5, c1 = 1.70158; sc = 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); }
      // magnet pull when the player is near
      if (d < 4.5) {
        u.mag = Math.min(1, u.mag + dt * 2.5); const pull = d > 1e-3 ? u.mag * u.mag * 16 * dt : 0;
        if (pull) { m.position.x += dx / d * pull; m.position.y += dy / d * pull; m.position.z += dz / d * pull; } u.baseY = m.position.y;
        sc *= 1 + 0.15 * Math.sin(t * 20);
      } else { u.mag = 0; m.position.y = u.baseY + Math.sin(t * 2.6 + u.ph) * 0.14; }
      m.scale.setScalar(sc * (1 + Math.sin(t * 3 + u.ph) * 0.04));
      u.mesh.rotation.y = t * 1.8 + u.ph; u.mesh.rotation.z = Math.sin(t * 1.5 + u.ph) * 0.15;
      u.halo.material.opacity = (ty.kind === 'gem' ? 0.5 : 0.35) + Math.sin(t * 4 + u.ph) * 0.15;
      if (d < 20 && Math.random() < 0.004) this.fx.twinkle(m.position.clone().add(new THREE.Vector3((Math.random() - .5) * 0.8, Math.random() * 0.6, (Math.random() - .5) * 0.8)), ty.color);
      if (d < 1.4) {
        this.fx.burst(m.position, ty.color, 18); this.fx.pop(m.position.clone().setY(m.position.y + 0.6), '+1', '#fff6a8');
        this.scene.remove(m); this.items.splice(i, 1); this.onCollect(); this.spawn(); break;
      }
    }
  }
}

let _halo;
function haloTex() {
  if (_halo) return _halo;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _halo = new THREE.CanvasTexture(c); _halo.colorSpace = THREE.SRGBColorSpace; return _halo;
}
