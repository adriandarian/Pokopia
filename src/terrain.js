import * as THREE from 'three';
import { fbm, mulberry } from './noise.js';

export const WORLD = 128; // world size in units
const RES = 256;          // grid resolution

export function heightAt(x, z) {
  const nx = x / WORLD, nz = z / WORLD;
  const d = Math.hypot(nx, nz) * 2; // 0 at centre, 1 at edge
  const island = Math.max(0, 1 - Math.pow(d, 2.2));
  const hills = fbm(x * 0.03 + 10, z * 0.03 + 10, 5, 7);
  return island * (4 + hills * 14) - 3.2;
}

export function buildTerrain(scene) {
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, RES, RES);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const sand = new THREE.Color('#f3dfa8'), grass = new THREE.Color('#7fd45a'), grass2 = new THREE.Color('#5cb848'),
    rock = new THREE.Color('#9a8f86'), deep = new THREE.Color('#3a8f9e');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z);
    pos.setY(i, h);
    const patch = fbm(x * 0.12, z * 0.12, 3, 3);
    if (h < -1.2) c.copy(deep).lerp(sand, THREE.MathUtils.smoothstep(h, -3.2, -1.2));
    else if (h < 0.6) c.copy(sand);
    else if (h > 11) c.copy(rock).lerp(grass, 0.15);
    else c.copy(grass).lerp(grass2, patch);
    c.lerp(sand, 1 - THREE.MathUtils.smoothstep(h, 0.2, 1.1));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  mesh.receiveShadow = true; mesh.castShadow = true;
  scene.add(mesh);
  return mesh;
}

export function scatterNature(scene) {
  const rnd = mulberry(42);
  const trunkG = new THREE.CylinderGeometry(0.25, 0.4, 2.2, 8); trunkG.translate(0, 1.1, 0);
  const leafG = new THREE.IcosahedronGeometry(1.6, 2); leafG.translate(0, 3.4, 0);
  const trunkM = new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 1 });
  const leafM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 });
  const N = 260, trunks = new THREE.InstancedMesh(trunkG, trunkM, N), leaves = new THREE.InstancedMesh(leafG, leafM, N);
  const flowers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.5 }), 900);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  const palette = ['#ff7eb6', '#ffd23f', '#ffffff', '#b28dff', '#ff9f43'];
  let t = 0, f = 0, tries = 0;
  const treePts = [];
  while (t < N && tries++ < 6000) {
    const x = (rnd() - 0.5) * WORLD * 0.9, z = (rnd() - 0.5) * WORLD * 0.9, h = heightAt(x, z);
    if (h < 1.2 || h > 10) continue;
    if (fbm(x * 0.05, z * 0.05, 3, 11) < 0.45) continue;
    const sc = 0.8 + rnd() * 0.8;
    q.setFromAxisAngle(up, rnd() * 6.28);
    m.compose(p.set(x, h - 0.1, z), q, s.set(sc, sc, sc));
    trunks.setMatrixAt(t, m); leaves.setMatrixAt(t, m);
    leaves.setColorAt(t, col.setHSL(0.27 + rnd() * 0.06, 0.6, 0.45 + rnd() * 0.1));
    treePts.push([x, z, sc * 0.6]); t++;
  }
  tries = 0;
  while (f < 900 && tries++ < 8000) {
    const x = (rnd() - 0.5) * WORLD * 0.9, z = (rnd() - 0.5) * WORLD * 0.9, h = heightAt(x, z);
    if (h < 0.8 || h > 9) continue;
    m.compose(p.set(x, h + 0.1, z), q.identity(), s.set(1, 1, 1));
    flowers.setMatrixAt(f, m); flowers.setColorAt(f, col.set(palette[(rnd() * palette.length) | 0])); f++;
  }
  trunks.count = leaves.count = t; flowers.count = f;
  for (const o of [trunks, leaves]) { o.castShadow = true; o.receiveShadow = true; }
  scene.add(trunks, leaves, flowers);
  return { treePts };
}
