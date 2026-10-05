import * as THREE from 'three';
import { heightAt, WORLD } from './terrain.js';
import { mulberry } from './noise.js';

const SPECIES = [
  { name: 'Puffle', color: '#ff9ecb', ear: '#ff6fae' },
  { name: 'Bloop', color: '#7fd7ff', ear: '#3fb5f5' },
  { name: 'Sunny', color: '#ffe066', ear: '#ffbf1f' },
  { name: 'Mochi', color: '#c7a6ff', ear: '#9b6bff' },
];

function makeCreature(sp) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: sp.color, roughness: 0.55 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 18), mat); body.position.y = 0.7; body.scale.set(1, 0.9, 1);
  const earM = new THREE.MeshStandardMaterial({ color: sp.ear, roughness: 0.6 });
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 12), earM); ear.position.set(sx * 0.4, 1.4, 0); ear.rotation.z = -sx * 0.3; g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), new THREE.MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.2 }));
    eye.position.set(sx * 0.25, 0.85, 0.6); g.add(eye);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshStandardMaterial({ color: '#ff7f9f' }));
    cheek.position.set(sx * 0.42, 0.6, 0.52); cheek.scale.z = 0.4; g.add(cheek);
  }
  g.add(body);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Creatures {
  constructor(scene) {
    this.list = []; const rnd = mulberry(99);
    for (let i = 0; i < 16; i++) {
      let x, z, h; do { x = (rnd() - 0.5) * WORLD * 0.7; z = (rnd() - 0.5) * WORLD * 0.7; h = heightAt(x, z); } while (h < 1 || h > 9);
      const m = makeCreature(SPECIES[i % SPECIES.length]); m.position.set(x, h, z); scene.add(m);
      this.list.push({ m, target: new THREE.Vector3(x, h, z), phase: rnd() * 6, wait: rnd() * 3 });
    }
  }
  update(dt, t) {
    for (const c of this.list) {
      const p = c.m.position;
      c.wait -= dt;
      if (c.wait <= 0) {
        const a = Math.random() * 6.28, r = 3 + Math.random() * 6;
        const tx = p.x + Math.cos(a) * r, tz = p.z + Math.sin(a) * r, th = heightAt(tx, tz);
        if (th > 0.8 && th < 10) { c.target.set(tx, th, tz); c.wait = 2 + Math.random() * 4; } else c.wait = 0.3;
      }
      const d = c.target.clone().sub(p); d.y = 0;
      const moving = d.length() > 0.3;
      if (moving) {
        d.normalize(); p.x += d.x * 2.2 * dt; p.z += d.z * 2.2 * dt;
        c.m.rotation.y += Math.atan2(Math.sin(Math.atan2(d.x, d.z) - c.m.rotation.y), Math.cos(Math.atan2(d.x, d.z) - c.m.rotation.y)) * Math.min(1, dt * 8);
      }
      const hop = moving ? Math.abs(Math.sin(t * 8 + c.phase)) * 0.35 : 0;
      p.y = heightAt(p.x, p.z) + hop;
      c.m.scale.set(1 + (moving ? 0 : Math.sin(t * 2 + c.phase) * 0.02), 1 - (moving ? 0 : Math.sin(t * 2 + c.phase) * 0.03), 1);
    }
  }
}

export class Collectibles {
  constructor(scene, onCollect) {
    this.onCollect = onCollect; this.items = []; this.scene = scene;
    this.geo = new THREE.OctahedronGeometry(0.4, 0);
    this.mat = new THREE.MeshStandardMaterial({ color: '#ff7eb6', emissive: '#ff3d8a', emissiveIntensity: 0.5, roughness: 0.3 });
    for (let i = 0; i < 60; i++) this.spawn();
  }
  spawn() {
    let x, z, h; do { x = (Math.random() - 0.5) * WORLD * 0.8; z = (Math.random() - 0.5) * WORLD * 0.8; h = heightAt(x, z); } while (h < 1 || h > 10);
    const m = new THREE.Mesh(this.geo, this.mat); m.position.set(x, h + 1, z); m.castShadow = true; this.scene.add(m); this.items.push(m);
  }
  update(t, playerPos) {
    for (const m of this.items) {
      m.rotation.y = t * 2; m.position.y += Math.sin(t * 3 + m.position.x) * 0.003;
      if (m.position.distanceTo(playerPos) < 2) {
        this.scene.remove(m); this.items.splice(this.items.indexOf(m), 1); this.onCollect(); this.spawn(); break;
      }
    }
  }
}
