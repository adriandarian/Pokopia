import * as THREE from 'three';
import { heightAt, WORLD } from './terrain.js';
import { mulberry } from './noise.js';
import { SPECIES } from './chars/species.js';
import { Blinker } from './chars/face.js';
import { bake, mergeColored, sphereGeo } from './chars/toon.js';
import { pickIdle, stepIdle, ZERO, makeBerryProp } from './chars/idles.js';
import { getFX, tickFX, world } from './chars/fx.js';

export { SPECIES };
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const NEAR = 30, FAR = 75;   // full detail inside NEAR, body-only to FAR, hidden / not simulated beyond

let blobMat, blobGeo;
function makeCreature(sp) {
  const m = new THREE.Group();
  const rig = new THREE.Group(); m.add(rig);
  const parts = sp.build(rig);
  bake(rig, { vc: true });     // merge static parts + outline hulls: ~3 draws for the body instead of ~30
  const prop = makeBerryProp(); rig.add(prop);
  const meshes = []; rig.traverse(o => { if (o.isMesh && !o.userData.isOutline) { o.castShadow = true; meshes.push(o); } });
  blobGeo = blobGeo || new THREE.CircleGeometry(0.7, 16).rotateX(-Math.PI / 2);
  blobMat = blobMat || new THREE.MeshBasicMaterial({ color: '#1d2b12', transparent: true, opacity: 0.25, depthWrite: false });
  const blob = new THREE.Mesh(blobGeo, blobMat); blob.position.y = 0.05; blob.renderOrder = 1; m.add(blob);
  const lod = [...(parts.ears || []).map(e => e.g), ...(parts.wings || []).map(e => e.g), ...(parts.leaves || []).map(e => e.g), ...(parts.arms || []).map(e => e.g), parts.tail, parts.extra, parts.jaw, ...(parts.face.parts || [])].filter(Boolean);
  return { m, rig, blob, prop, meshes, lod, arms: [], ...parts };
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
        idle: null, idleCD: 1 + rnd() * 5, mod: ZERO(), lodLevel: 2, ia: 0,
      });
      // setFriend(true, { silent: true }): restore a saved friendship (no burst / no 'Friend!' pop); follows the player immediately
      c.setFriend = (v = true, o = {}) => {
        c.friend = !!v; c.idle = null; c.affinity = v ? 3 : 0; c.happy = v ? 0.6 : 0; c._fInit = true;
        if (v && !o.silent) { c.jv = 7; this.fx.hearts(c.m.position.clone().setY(c.m.position.y + c.top), 7); this.fx.pop(c.m.position.clone().setY(c.m.position.y + c.top + 0.6), 'Friend!', '#ffd1e8'); }
        return c;
      };
      this.list.push(c);
    }
  }
  get friends() { return this.list.filter(c => c.friend); }
  // QA / scripting: force an idle on a creature. kind: sleep|dance|eat|stretch|look|null
  idle(c, kind, dur) { c.idle = kind ? { ...pickIdle(c), kind, t: 0, dur: dur ?? 6, z: 0, bites: 0 } : null; return c; }
  setLod(c, lv) {
    if (c.lodLevel === lv) return; c.lodLevel = lv;
    const full = lv === 2; for (const o of c.lod) o.visible = full;
    c.m.visible = lv > 0; for (const o of c.meshes) o.castShadow = full;
    c.blob.visible = lv > 0;
  }
  update(dt, t) {
    this.frame++; world.frame++; tickFX(dt, world.frame);
    const pp = world.playerPos; let fi = 0;
    for (const c of this.list) {
      const p = c.m.position, ph = c.phase;
      const dx = pp.x - p.x, dz = pp.z - p.z, dist = Math.hypot(dx, dz);
      // level of detail: far creatures are neither simulated nor drawn
      const lv = dist < NEAR || c.friend || c.pin ? 2 : dist < FAR ? 1 : 0; this.setLod(c, lv);
      if (lv === 0) continue;
      const toPlayer = Math.atan2(dx, dz);
      let want = 0, wantSpeed = 0, faceYaw = null;

      if (c.friend && !c._fInit) { c._fInit = true; c.affinity = 3; c.happy = Math.max(c.happy, 0.6); c.idle = null; }   // friend flag set externally
      // ----- affinity & befriending -----
      const near = dist < 6, notice = dist < 11;
      c.happy = damp(c.happy, c.friend ? (dist < 9 ? 1 : 0.4) : (near ? 1 : 0), 4, dt);
      if (!c.friend) {
        if (dist < 4.2 && Math.abs(pp.y - p.y) < 3) c.affinity += dt; else c.affinity = Math.max(0, c.affinity - dt * 0.5);
        if (c.affinity > 2.5) {
          c.friend = true; c.jv = 7; c.idle = null;
          this.fx.hearts(p.clone().setY(p.y + c.top), 7); this.fx.pop(p.clone().setY(p.y + c.top + 0.6), 'Friend!', '#ffd1e8');
        }
      }

      // ----- behaviour -----
      if (c.friend) {
        // follow the player in a loose trail
        const keep = 2.4 + (fi++ % 4) * 0.6;
        if (dist > 40) { for (const [ox, oz] of [[-3, -3], [3, -3], [-3, 3], [3, 3], [0, 0]]) if (heightAt(pp.x + ox, pp.z + oz) > 0.5 || (ox === 0 && oz === 0)) { p.x = pp.x + ox; p.z = pp.z + oz; break; } }
        else if (dist > keep + 0.4) { wantSpeed = Math.min(8, 1.5 + (dist - keep) * 1.6); faceYaw = toPlayer; }
        else if (dist < keep - 0.5) { wantSpeed = 0; faceYaw = toPlayer; }
        else faceYaw = toPlayer;
        if (wantSpeed > 0) { c.dirX = dx / (dist || 1); c.dirZ = dz / (dist || 1); }
      } else {
        c.wait -= dt;
        if (c.wait <= 0 && !c.idle) {
          const a = Math.random() * 6.28, r = 3 + Math.random() * 6;
          const tx = p.x + Math.cos(a) * r, tz = p.z + Math.sin(a) * r, th = heightAt(tx, tz);
          if (th > 0.8 && th < 10) { c.target.set(tx, th, tz); c.wait = 2 + Math.random() * 4; c.walking = true; } else c.wait = 0.3;
        }
        const d = c.target.clone().sub(p); d.y = 0; const dl = d.length();
        if (c.walking && dl > 0.3 && !near) { wantSpeed = 2.1; c.dirX = d.x / dl; c.dirZ = d.z / dl; faceYaw = Math.atan2(d.x, d.z); }
        else { c.walking = false; if (notice && !c.idle) faceYaw = toPlayer; }
      }
      if (c.pin) { wantSpeed = 0; faceYaw = c.pin.yaw ?? faceYaw; p.x = c.pin.x; p.z = c.pin.z; c.walking = false; }
      // idles run only while standing still; anything that makes it move (or crowds a wild one) wakes it up
      if (c.idle && (wantSpeed > 0 || (!c.friend && near && c.idle.kind !== 'dance' && c.idle.kind !== 'look') || (c.idle.kind === 'sleep' && !c.friend && dist < 4))) c.idle = null;
      if (c.idle && c.idle.kind !== 'look' && c.idle.kind !== 'dance') faceYaw = c.idle.kind === 'sleep' ? null : faceYaw;
      c.speed = damp(c.speed, wantSpeed, 6, dt);
      const moving = c.speed > 0.35;
      if (moving) {
        const nx = p.x + c.dirX * c.speed * dt, nz = p.z + c.dirZ * c.speed * dt, nh = heightAt(nx, nz);
        if (nh > 0.5) { p.x = nx; p.z = nz; } else { c.walking = false; c.speed = 0; }
      }
      if (faceYaw !== null) c.m.rotation.y += wrapPi(faceYaw - c.m.rotation.y) * (1 - Math.exp(-(moving ? 9 : 5) * dt));

      // ----- idle selection -----
      if (!c.idle && !moving && !c.walking && c.jy <= 0.01) {
        c.idleCD -= dt;
        if (c.idleCD <= 0 && !(!c.friend && near)) { c.idle = pickIdle(c); if (c.idle.kind === 'sleep' && (c.friend ? dist < 5 : false)) c.idle = pickIdle(c); }
      }

      // ----- greeting hop + hearts when player is close -----
      const idleLock = c.idle && (c.idle.kind === 'sleep' || c.idle.kind === 'eat' || c.idle.kind === 'stretch');
      if ((near && !c.friend || c.friend && dist < 7) && !idleLock) {
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
      let ground = heightAt(p.x, p.z);
      if (ground < 0.3 && !c.pin) { for (let r = 1; r < 8 && ground < 0.3; r++) for (let a = 0; a < 6.28; a += 0.8) { const tx = p.x + Math.cos(a) * r, tz = p.z + Math.sin(a) * r, th = heightAt(tx, tz); if (th > 0.6) { p.x = tx; p.z = tz; ground = th; break; } } }
      p.y = ground + hop + c.jy;
      const airborne = air || hop > 0.04;
      c.blob.position.y = 0.05 - (hop + c.jy) + 0.0; c.blob.scale.setScalar(Math.max(0.5, 1 - (hop + c.jy) * 0.25));
      if (lv < 2) continue;   // mid distance: body only, no animation

      // ----- idle modifiers -----
      const mod = c.mod; Object.assign(mod, ZERO());
      if (c.idle) {
        mod.berrySize = 1;
        if (stepIdle(c, dt, t, this.fx, mod)) { c.idle = null; c.idleCD = 3 + Math.random() * 7; }
      }
      // ----- squash & stretch spring -----
      const idleB = 1 + Math.sin(t * 2.2 + ph) * 0.025;
      const tgt = airborne ? 1 + Math.min(0.18, (Math.abs(c.jv) + hop * 3) * 0.03) : idleB;
      c.svy += ((tgt - c.sy) * 240 - c.svy * 14) * dt; c.sy += c.svy * dt;
      const sy2 = c.sy * mod.sy, sxz = 1 / Math.sqrt(sy2);
      c.rig.scale.set(sxz, sy2, sxz); c.rig.position.y = mod.bounce;
      c.rig.rotation.x = damp(c.rig.rotation.x, mod.rotX, 8, dt); c.rig.rotation.y = damp(c.rig.rotation.y, mod.rotY, 8, dt);
      c.rig.rotation.z = Math.sin(t * 1.3 + ph) * 0.03 * (1 - c.happy) + (faceYaw !== null && notice && !c.friend ? Math.sin(t * 3 + ph) * 0.05 * c.happy : 0) + mod.rotZ;

      // ----- appendages -----
      const fl = c.happy * 0.5 + (moving ? 0.5 : 0);
      for (const e of c.ears) { const base = e.base, dr = (Math.sign(base) || -e.side) * mod.ear * 0.9; e.g.rotation.z = base + e.side * (Math.sin(t * 2 + ph + e.side) * 0.05 + (c.sy - 1) * -0.9 + (c.happy > 0.5 ? Math.sin(t * 9 + ph) * 0.08 : 0)) + dr; }
      for (const w of c.wings) w.g.rotation.z = w.side * (0.12 + (airborne || c.happy > 0.5 || mod.armRaise > 0.2 ? 0.5 + Math.sin(t * 20 + ph) * 0.45 * Math.max(fl, airborne ? 1 : 0, mod.armRaise) : Math.sin(t * 2 + ph) * 0.05) + Math.max(0, mod.armRaise) * 0.8) * (mod.armRaise < -0.2 ? 0.3 : 1);
      for (const l of c.leaves) l.g.rotation.z = l.base + l.side * (Math.sin(t * 2.4 + ph) * 0.1 + (c.sy - 1) * -1.2 + mod.armRaise * 0.3);
      const swing = moving ? Math.sin(c.hopT * Math.PI * 2) * 0.7 : 0;
      for (const a of c.arms) {
        const happyWave = c.friend && c.happy > 0.7 && !c.idle && !moving ? 0.6 + Math.sin(t * 7 + a.side) * 0.25 : 0;
        const raise = mod.armRaise > 0 ? mod.armRaise : 0;
        a.g.rotation.z = a.base + a.side * (raise * 2.0 + happyWave + (airborne ? 0.7 : 0));
        a.g.rotation.x = (mod.armRaise < 0 ? mod.armRaise : 0) + swing * a.side + mod.armSwing * 0.5 * a.side;
      }
      if (c.tail) { c.tail.rotation.y = Math.sin(t * (4 + c.happy * 10) + ph) * (0.25 + c.happy * 0.45) * (1 - mod.tailCurl) + mod.tailCurl * 1.2; c.tail.rotation.x = Math.sin(t * 2 + ph) * 0.05; }
      if (c.extra) { c.extra.rotation.z = Math.sin(t * 2.7 + ph) * 0.12 + (c.sy - 1) * 0.5; c.extra.rotation.x = Math.sin(t * 2.1 + ph) * 0.06; }
      if (c.jaw) c.jaw.rotation.x = mod.beak * 0.55 + (c.happy > 0.8 ? Math.max(0, Math.sin(t * 6 + ph)) * 0.12 : 0);
      c.face.setOpen(mod.mouth);
      c.blinker.update(dt, (c.happy > 0.85 && c.friend) || mod.eye === 'happy', mod.eye === 'sleep');
      // berry prop for the eat idle
      if (mod.prop > 0.02) {
        c.prop.visible = true; const my = (c.face.mouth?.position.y ?? 0.5), mz = (c.face.mouth?.position.z ?? 0.6);
        c.prop.position.set(0, THREE.MathUtils.lerp(0.25, my + 0.02, mod.prop), THREE.MathUtils.lerp(mz + 0.35, mz + 0.1, mod.prop));
        c.prop.scale.setScalar(mod.berrySize ?? 1);
      } else c.prop.visible = false;
    }
  }
}

// ---------------- Collectibles: gems & berries (instanced: 1 draw call per type + 1 for all halos) ----------------
function gemGeo() {
  const pts = [[0.001, -0.52], [0.13, -0.32], [0.36, 0.02], [0.4, 0.12], [0.3, 0.27], [0.18, 0.34], [0.001, 0.34]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 8); g.computeVertexNormals(); return g.toNonIndexed();
}
const sphere = (r, w = 12, h = 8) => sphereGeo(1, w, h);
function berryGeo(kind) {
  const it = [];
  if (kind === 'straw') {   // strawberry: tapered body, calyx leaves, stem, speckles, glossy highlight
    it.push({ geo: sphere(), color: '#ff4d6d', pos: [0, 0.02, 0], scale: [0.27, 0.25, 0.27] });
    it.push({ geo: sphere(), color: '#ff4d6d', pos: [0, -0.1, 0], scale: [0.2, 0.18, 0.2] });
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; it.push({ geo: new THREE.ConeGeometry(0.09, 0.24, 5), color: '#8cff4a', pos: [Math.sin(a) * 0.12, 0.25, Math.cos(a) * 0.12], rot: [Math.cos(a) * 1.15, 0, -Math.sin(a) * 1.15] }); }
    it.push({ geo: new THREE.CylinderGeometry(0.022, 0.03, 0.2, 6), color: '#7a4a1e', pos: [0, 0.38, 0], rot: [0.2, 0, 0.15] });
    for (const sx of [-1, 1]) it.push({ geo: sphere(), color: '#9cff5a', pos: [sx * 0.12, 0.31, 0], scale: [0.16, 0.035, 0.08], rot: [0, 0, sx * 0.4] });
    for (let i = 0; i < 12; i++) { const a = i * 2.4, y = -0.18 + (i % 4) * 0.1, r = 0.27 * Math.sqrt(Math.max(0.1, 1 - ((y - 0.02) / 0.25) ** 2)) * (y < -0.05 ? 0.8 : 1); it.push({ geo: sphere(), color: '#ffe9a0', pos: [Math.sin(a) * r, y, Math.cos(a) * r], scale: [0.022, 0.034, 0.022] }); }
    it.push({ geo: sphere(), color: '#ffffff', pos: [-0.1, 0.1, 0.2], scale: [0.09, 0.12, 0.05], rot: [0, -0.5, 0.4] });
  } else {                   // blueberry: round, crown calyx, bloom speckle, highlight
    it.push({ geo: sphere(), color: '#7d58f0', pos: [0, 0, 0], scale: [0.27, 0.26, 0.27] });
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; it.push({ geo: new THREE.ConeGeometry(0.08, 0.2, 4), color: '#8affd8', pos: [Math.sin(a) * 0.09, 0.25, Math.cos(a) * 0.075], rot: [Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3] }); }
    it.push({ geo: sphere(), color: '#2f2570', pos: [0, 0.25, 0], scale: [0.045, 0.03, 0.045] });
    it.push({ geo: new THREE.CylinderGeometry(0.022, 0.03, 0.2, 6), color: '#7a4a1e', pos: [0, 0.36, 0], rot: [0.2, 0, 0.15] });
    for (const sx of [-1, 1]) it.push({ geo: sphere(), color: '#9cff5a', pos: [sx * 0.13, 0.33, 0], scale: [0.17, 0.035, 0.09], rot: [0, 0, sx * 0.45] });
    it.push({ geo: sphere(), color: '#5a3ad0', pos: [0, -0.1, 0], scale: [0.26, 0.17, 0.26] });
    for (let i = 0; i < 9; i++) { const a = i * 2.4, y = -0.1 + (i % 3) * 0.1, r = 0.26 * Math.sqrt(Math.max(0.1, 1 - (y / 0.26) ** 2)); it.push({ geo: sphere(), color: '#b9a4ff', pos: [Math.sin(a) * r, y, Math.cos(a) * r], scale: [0.03, 0.03, 0.02] }); }
    it.push({ geo: sphere(), color: '#ffffff', pos: [-0.1, 0.08, 0.2], scale: [0.09, 0.115, 0.05], rot: [0, -0.5, 0.4] });
    it.push({ geo: sphere(), color: '#b8f5ff', pos: [0.12, -0.08, 0.2], scale: [0.04, 0.05, 0.03] });
  }
  const g = mergeColored(it); g.scale(1.55, 1.55, 1.55); return g;
}

let _star;
export class Collectibles {
  constructor(scene, onCollect) {
    if (typeof window !== 'undefined') window.__collect = this; // QA hook
    this.onCollect = onCollect; this.items = []; this.scene = scene; this.fx = getFX(scene); this.lastT = 0; this.time = 0;
    this.uTime = { value: 0 };
    const gem = gemGeo(), uT = this.uTime;
    const gemMat = (c, e) => {
      const m = new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: 0.5, roughness: 0.1, metalness: 0.25, flatShading: true });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = uT;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying float vSeed;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vSeed = instanceMatrix[3][0] * 0.37 + instanceMatrix[3][2] * 0.21;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; varying vec3 vOP; varying float vSeed;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            float sd = vOP.x * 0.8 + vOP.y * 0.75; float sp = fract(uTime * 0.42 + vSeed) * 3.0 - 1.5;
            float band = smoothstep(0.17, 0.0, abs(sd - sp));
            totalEmissiveRadiance += vec3(1.0, 0.98, 0.9) * (band * 1.5 + smoothstep(0.28, 0.34, vOP.y) * 0.22);`);
      };
      m.customProgramCacheKey = () => 'gemsweep';
      return m;
    };
    const gemCols = [['#ff6fb0', '#ff2f8a'], ['#6fd0ff', '#2f9cff'], ['#ffe066', '#ffb300'], ['#8cf0b0', '#2fd37a']];
    this.types = gemCols.map(([c, e]) => ({ kind: 'gem', color: c, geo: gem, mat: gemMat(c, e), glow: new THREE.Color(e) }));
    const berries = [['#ff4d6d', '#ff2a4d', 'straw'], ['#9a6bff', '#6a3dd8', 'blue']];
    for (const [c, e, k] of berries) this.types.push({
      kind: 'berry', color: c, geo: berryGeo(k),
      mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, emissive: e, emissiveIntensity: 0.18 }), glow: new THREE.Color(e),
    });
    const CAP = 90; this.cap = CAP;
    this.types.forEach(ty => { ty.inst = new THREE.InstancedMesh(ty.geo, ty.mat, CAP); ty.inst.count = 0; ty.inst.frustumCulled = false; ty.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(ty.inst); });
    // one Points draw for every halo
    const hg = new THREE.BufferGeometry(); this.haloPos = new Float32Array(CAP * 3); this.haloCol = new Float32Array(CAP * 3);
    hg.setAttribute('position', new THREE.BufferAttribute(this.haloPos, 3).setUsage(THREE.DynamicDrawUsage)); hg.setAttribute('color', new THREE.BufferAttribute(this.haloCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.haloGeo = hg;
    this.halo = new THREE.Points(hg, new THREE.PointsMaterial({ map: haloTex(), size: 1.7, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.halo.frustumCulled = false; scene.add(this.halo);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3();
    for (let i = 0; i < 60; i++) this.spawn(true);
  }
  spawn(initial = false) {
    let x, z, h; do { x = (Math.random() - 0.5) * WORLD * 0.8; z = (Math.random() - 0.5) * WORLD * 0.8; h = heightAt(x, z); } while (h < 1 || h > 10);
    const ty = this.types[Math.floor(Math.random() * this.types.length)];
    // items are lightweight Object3Ds (not in the scene): position + userData are the public contract (guide.js etc.)
    const g = new THREE.Object3D(); g.position.set(x, h + 1.1, z);
    g.userData = { ty, baseY: h + 1.1, ph: Math.random() * 6.28, born: initial ? -1 : this.time, mag: 0 };
    g.scale.setScalar(initial ? 1 : 0.001);
    this.items.push(g);
  }
  update(t, playerPos) {
    const dt = Math.min(0.05, Math.max(0, t - this.lastT)); this.lastT = t; this.time = t; this.uTime.value = t;
    const cx = playerPos.x, cy = playerPos.y + 1.0, cz = playerPos.z;
    for (const ty of this.types) ty._n = 0;
    let collected = null;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const m = this.items[i], u = m.userData, ty = u.ty;
      const dx = cx - m.position.x, dy = cy - m.position.y, dz = cz - m.position.z, d = Math.hypot(dx, dy, dz);
      const age = t - u.born; let sc = 1;
      if (u.born >= 0 && age < 0.5) { const k = age / 0.5, c1 = 1.70158; sc = 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); }
      if (d < 4.5) {
        u.mag = Math.min(1, u.mag + dt * 2.5); const pull = d > 1e-3 ? u.mag * u.mag * 16 * dt : 0;
        if (pull) { m.position.x += dx / d * pull; m.position.y += dy / d * pull; m.position.z += dz / d * pull; } u.baseY = m.position.y;
        sc *= 1 + 0.15 * Math.sin(t * 20);
      } else { u.mag = 0; m.position.y = u.baseY + Math.sin(t * 2.6 + u.ph) * 0.14; }
      sc *= 1 + Math.sin(t * 3 + u.ph) * 0.04; m.scale.setScalar(sc);
      if (d < 20 && Math.random() < 0.004) this.fx.twinkle(m.position.clone().add(new THREE.Vector3((Math.random() - .5) * 0.8, Math.random() * 0.6, (Math.random() - .5) * 0.8)), ty.color);
      if (d < 1.4) { collected = i; continue; }
    }
    if (collected !== null) {
      const m = this.items[collected], ty = m.userData.ty;
      this.fx.burst(m.position, ty.color, 18); this.fx.pop(m.position.clone().setY(m.position.y + 0.6), '+1', '#fff6a8');
      this.items.splice(collected, 1); this.onCollect(ty.kind, ty); this.spawn();
    }
    // write instance matrices + halos
    let hi = 0; const mt = this._m, q = this._q, e = this._e, s = this._s;
    for (const m of this.items) {
      const u = m.userData, ty = u.ty, n = ty._n++; if (n >= this.cap) continue;
      e.set(Math.sin(t * 1.5 + u.ph) * 0.15, t * 1.8 + u.ph, 0, 'YXZ'); q.setFromEuler(e); s.setScalar(m.scale.x);
      mt.compose(m.position, q, s); ty.inst.setMatrixAt(n, mt);
      const pulse = (ty.kind === 'gem' ? 0.5 : 0.35) + Math.sin(t * 4 + u.ph) * 0.15;
      this.haloPos[hi * 3] = m.position.x; this.haloPos[hi * 3 + 1] = m.position.y; this.haloPos[hi * 3 + 2] = m.position.z;
      this.haloCol[hi * 3] = ty.glow.r * pulse * m.scale.x; this.haloCol[hi * 3 + 1] = ty.glow.g * pulse * m.scale.x; this.haloCol[hi * 3 + 2] = ty.glow.b * pulse * m.scale.x; hi++;
    }
    for (const ty of this.types) { ty.inst.count = Math.min(ty._n, this.cap); ty.inst.instanceMatrix.needsUpdate = true; }
    this.haloGeo.setDrawRange(0, hi); this.haloGeo.attributes.position.needsUpdate = true; this.haloGeo.attributes.color.needsUpdate = true;
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
