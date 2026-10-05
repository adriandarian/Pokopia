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

