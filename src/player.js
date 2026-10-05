import * as THREE from 'three';
import { heightAt } from './terrain.js';

export function buildHero() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: '#ffd9b8', roughness: 0.7 });
  const shirt = new THREE.MeshStandardMaterial({ color: '#ff6b6b', roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: '#4d7cff', roughness: 0.8 });
  const hair = new THREE.MeshStandardMaterial({ color: '#5b3a24', roughness: 0.9 });
  const eye = new THREE.MeshStandardMaterial({ color: '#222' });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.5, 8, 16), shirt); body.position.y = 1.0;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 18), skin); head.position.y = 1.9;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.53, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hair); cap.position.y = 1.95;
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eye); e.position.set(sx * 0.18, 1.9, 0.45); g.add(e);
  }
  const legs = [-1, 1].map(sx => {
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.4, 6, 10), pants); l.position.set(sx * 0.18, 0.35, 0);
    g.add(l); return l;
  });
  const arms = [-1, 1].map(sx => {
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.4, 6, 10), skin); a.position.set(sx * 0.55, 1.05, 0);
    g.add(a); return a;
  });
  g.add(body, head, cap);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  g.userData = { legs, arms };
  return g;
}

export class Player {
  constructor(scene, camera, dom) {
    this.mesh = buildHero(); scene.add(this.mesh);
    this.camera = camera; this.vel = new THREE.Vector3(); this.onGround = true;
    this.keys = {}; this.yaw = 0; this.pitch = 0.45; this.dist = 11; this.t = 0;
    this.mesh.position.set(0, heightAt(0, 0), 0);
    addEventListener('keydown', e => { this.keys[e.code] = true; });
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
  update(dt) {
    if (this.frozen) return; // QA mode: camera is placed by window.__game.setCam
    const k = this.keys, p = this.mesh.position;
    const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const r = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const speed = k.ShiftLeft ? 11 : 6.5;
    const dir = new THREE.Vector3(r, 0, -f);
    const moving = dir.lengthSq() > 0;
    if (moving) {
      dir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      const target = Math.atan2(dir.x, dir.z);
      let d = target - this.mesh.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.mesh.rotation.y += d * Math.min(1, dt * 14);
      p.x += dir.x * speed * dt; p.z += dir.z * speed * dt;
      this.t += dt * speed * 1.6;
    }
    const ground = Math.max(heightAt(p.x, p.z), -0.4);
    if (k.Space && this.onGround) { this.vel.y = 8; this.onGround = false; }
    this.vel.y -= 24 * dt; p.y += this.vel.y * dt;
    if (p.y <= ground) { p.y = ground; this.vel.y = 0; this.onGround = true; }
    const { legs, arms } = this.mesh.userData, sw = moving ? Math.sin(this.t) * 0.7 : 0;
    legs[0].rotation.x = sw; legs[1].rotation.x = -sw; arms[0].rotation.x = -sw; arms[1].rotation.x = sw;
    this.mesh.children[0].scale.y = 1 + (moving ? Math.abs(Math.sin(this.t)) * 0.04 : 0);
    const cp = new THREE.Vector3(
      p.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist,
      p.y + 2 + Math.sin(this.pitch) * this.dist,
      p.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist);
    this.camera.position.lerp(cp, Math.min(1, dt * 8));
    this.camera.lookAt(p.x, p.y + 1.6, p.z);
  }
}
