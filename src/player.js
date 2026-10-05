import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { buildHero as _buildHero } from './chars/hero.js';
import { getFX, tickFX, world } from './chars/fx.js';

export const buildHero = _buildHero;
const UP = new THREE.Vector3(0, 1, 0);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const groundAt = (x, z) => Math.max(heightAt(x, z), -0.4);

export class Player {
  constructor(scene, camera, dom) {
    this.mesh = buildHero(); scene.add(this.mesh);
    this.hero = this.mesh.userData.hero;
    this.fx = getFX(scene);
    this.camera = camera; this.vel = new THREE.Vector3(); this.onGround = true;
    this.keys = {}; this.yaw = 0; this.pitch = 0.42; this.dist = 11; this.t = 0;
    this.speed = 0; this.moveDir = new THREE.Vector3(); this.coyote = 0; this.jumpBuf = 0; this.fov = camera.fov; this.baseFov = camera.fov;
    this.camDist = this.dist; this.lookAt = new THREE.Vector3(); this.camInit = false; this.vyPrev = 0;
    this.mesh.position.set(0, heightAt(0, 0), 0);
    addEventListener('keydown', e => { this.keys[e.code] = true; if (e.code === 'Space') this.jumpBuf = 0.12; });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    let drag = false;
    dom.addEventListener('pointerdown', () => { drag = true; });
    addEventListener('pointerup', () => { drag = false; });
    addEventListener('pointermove', e => {
      if (!drag) return;
      this.yaw -= e.movementX * 0.005; this.pitch = THREE.MathUtils.clamp(this.pitch + e.movementY * 0.004, 0.1, 1.3);
    });
    dom.addEventListener('wheel', e => { this.dist = THREE.MathUtils.clamp(this.dist + e.deltaY * 0.01, 5, 25); });
  }
  // Hero customisation hook: player.setOutfit({ hat:'cap'|'straw'|'beanie'|'flower'|'crown'|'none', shirt:'#hex', pants, hair, skin, pack })
  setOutfit(o) { this.hero.setOutfit(o); return this; }

  update(dt) {
    world.frame++; tickFX(dt, world.frame);
    const p = this.mesh.position, k = this.keys;
    let moving = false, running = false;
    if (!this.frozen) {
      const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
      const r = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
      running = !!(k.ShiftLeft || k.ShiftRight);
      const top = running ? 11 : 6.5;
      const dir = new THREE.Vector3(r, 0, -f);
      moving = dir.lengthSq() > 0;
      this._yr = (this._yr || 0) * 0.85;
      if (moving) {
        dir.normalize().applyAxisAngle(UP, this.yaw); this.moveDir.copy(dir);
        const target = Math.atan2(dir.x, dir.z);
        let d = target - this.mesh.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
        const dy = d * (1 - Math.exp(-16 * dt)); this.mesh.rotation.y += dy; this._yr = dy / Math.max(dt, 1e-3);
      }
      // eased acceleration / braking (floatier in the air)
      const accel = moving ? (this.onGround ? 9 : 4) : (this.onGround ? 12 : 1.5);
      this.speed = damp(this.speed, moving ? top : 0, accel, dt);
      if (this.speed < 0.05) this.speed = 0;
      p.x += this.moveDir.x * this.speed * dt; p.z += this.moveDir.z * this.speed * dt;

      // jump with coyote time + input buffer
      this.coyote = this.onGround ? 0.1 : this.coyote - dt; this.jumpBuf -= dt;
      // anticipation: a short crouch (~0.09s) before the launch
      if (this.jumpBuf > 0 && this.coyote > 0 && !(this.wind > 0)) { this.wind = 0.09; this.jumpBuf = 0; }
      if (this.wind > 0) { this.wind -= dt; if (this.wind <= 0) { this.vel.y = 8.6; this.onGround = false; this.coyote = 0; this.fx.dust(p, 5, 1.1); } }
      this.vyPrev = this.vel.y;
      this.vel.y -= (this.vel.y < 0 ? 30 : 24) * dt; p.y += this.vel.y * dt;
      const ground = groundAt(p.x, p.z);
      if (p.y <= ground) {
        const landVy = this.vel.y; p.y = ground; this.vel.y = 0;
        if (!this.onGround) this.landVy = landVy;
        this.onGround = true;
      } else if (p.y > ground + 0.12 || this.vel.y > 0) this.onGround = false;
    }
    this.t += dt;
    world.playerPos.copy(p); world.moving = this.speed > 0.5;

    const ground = groundAt(p.x, p.z);
    this.hero.update(dt, {
      speed: this.speed, crouch: this.wind > 0, yawRate: this._yr || 0, grounded: this.onGround, vy: this.vel.y, landVy: this.landVy ?? -8, heightAboveGround: Math.max(0, p.y - ground),
      onFoot: (side, run) => {
        const q = p.clone(); q.y += 0.1; q.x += (Math.random() - .5) * 0.3;
        this.fx.dust(q, run > 0.3 ? 3 : 2, run > 0.3 ? 0.9 : 0.6);
      },
      onLand: (amt) => { this.fx.dust(p, 4 + Math.round(amt * 5), 1.0 + amt * 0.5); },
    });

    if (this.frozen) return; // QA mode: camera is placed by window.__game.setCam

    // ---- camera: smooth follow, terrain collision, FOV kick ----
    const cp = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const pivot = new THREE.Vector3(p.x, damp(this._py ?? p.y, p.y, 6, dt) + 1.9, p.z); this._py = pivot.y - 1.9;
    let limit = this.dist;
    for (let s = 1; s <= 12; s++) {
      const d = this.dist * s / 12, x = pivot.x + cp.x * d, z = pivot.z + cp.z * d, y = pivot.y + cp.y * d;
      if (y < groundAt(x, z) + 0.9) { limit = Math.max(2.2, this.dist * (s - 1) / 12); break; }
    }
    this.camDist = limit < this.camDist ? damp(this.camDist, limit, 14, dt) : damp(this.camDist, limit, 2.5, dt);
    const desired = pivot.clone().addScaledVector(cp, this.camDist);
    desired.y = Math.max(desired.y, groundAt(desired.x, desired.z) + 0.8);
    if (!this.camInit) { this.camera.position.copy(desired); this.lookAt.copy(pivot); this.camInit = true; }
    this.camera.position.x = damp(this.camera.position.x, desired.x, 9, dt);
    this.camera.position.y = damp(this.camera.position.y, desired.y, 9, dt);
    this.camera.position.z = damp(this.camera.position.z, desired.z, 9, dt);
    this.lookAt.x = damp(this.lookAt.x, p.x, 12, dt); this.lookAt.z = damp(this.lookAt.z, p.z, 12, dt);
    this.lookAt.y = damp(this.lookAt.y, p.y + 1.5, 7, dt);
    this.camera.lookAt(this.lookAt);
    const tf = this.baseFov + (this.speed > 7 ? (this.speed - 7) / 4 * 8 : 0) + (this.onGround ? 0 : 1.5);
    this.fov = damp(this.fov, tf, 4, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
  }
}
