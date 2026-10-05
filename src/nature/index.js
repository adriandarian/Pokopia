import * as THREE from 'three';
import { WORLD, heightAt, POND_LEVEL } from '../terrain.js';
import { fbm, mulberry } from '../noise.js';
import { POND, pathMask } from './features.js';
import { applyWind, tickWind } from './wind.js';
import * as S from './species.js';
import { buildGrass } from './grass.js';
import { buildPond } from './pond.js';

export function scatterNature(scene) {
  const rnd = mulberry(42);
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const treePts = [], taken = [];
  const free = (x, z, r) => { for (const t of taken) { const dx = t[0] - x, dz = t[1] - z, rr = t[2] + r; if (dx * dx + dz * dz < rr * rr) return false; } return true; };
  const pondD = (x, z) => Math.hypot(x - POND.x, z - POND.z) / POND.r;
  const slopeAt = (x, z) => { const e = 0.6; return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e); };

  const mkMat = (opts, side = THREE.FrontSide) => applyWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side }), opts);
  const group = [];
  function inst(geo, mat, max, { cast = true, recv = true } = {}) {
    const m = new THREE.InstancedMesh(geo, mat, max);
    m.count = 0; m.castShadow = cast; m.receiveShadow = recv; tickWind(m);
    scene.add(m); group.push(m);
    m.add1 = (x, y, z, sc, rot, tint, sy = 1, tilt = 0) => {
      dummy.position.set(x, y, z); dummy.rotation.set(tilt * Math.sin(rot * 3), rot, tilt * Math.cos(rot * 3)); dummy.scale.set(sc, sc * sy, sc); dummy.updateMatrix();
      m.setMatrixAt(m.count, dummy.matrix); m.setColorAt(m.count, tint || col.set('#ffffff')); m.count++;
    };
    return m;
  }
  const jitter = (v = 0.1) => col.setRGB(1, 1, 1).multiplyScalar(1 - rnd() * v).clone();
  const stdMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });

  // species meshes
  const oak = inst(S.roundTree(['#5fbf45', '#78d255', '#4aa83c'], 1), mkMat({ amp: 0.03, heightGain: 0.012 }), 200);
  const oak2 = inst(S.roundTree(['#7ec94a', '#9ad85a', '#68b843'], 2), mkMat({ amp: 0.03, heightGain: 0.012 }), 200);
  const blossom = inst(S.roundTree(['#ffb3cf', '#ffc8dc', '#f79bbd'], 3), mkMat({ amp: 0.03, heightGain: 0.012 }), 40);
  const pine = inst(S.pineTree(1), mkMat({ amp: 0.015, heightGain: 0.012 }), 140);
  const palm = inst(S.palmTree(1), mkMat({ amp: 0.05, heightGain: 0.025, speed: 1.2 }, THREE.DoubleSide), 60);
  const bushM = inst(S.bush(['#4fb447', '#68cb52'], 1), mkMat({ amp: 0.03, heightGain: 0.02 }), 200);
  const berry = inst(S.berryBush(3), mkMat({ amp: 0.03, heightGain: 0.02 }), 60);
  const rocks = inst(S.rock(1), stdMat(), 260);
  const rocks2 = inst(S.rock(5), stdMat(), 260);
  const shrooms = inst(S.mushroom(), stdMat(), 200);
  const reeds = inst(S.reed(), mkMat({ amp: 0.06, heightGain: 0.05 }), 80);

  // trees
  let tries = 0;
  const count = { oak: 0, pine: 0, palm: 0, bloss: 0 };
  while (tries++ < 14000) {
    const x = (rnd() - 0.5) * WORLD * 0.92, z = (rnd() - 0.5) * WORLD * 0.92, h = heightAt(x, z);
    if (h < 0.4 || pondD(x, z) < 1.8 || pathMask(x, z) > 0.12) continue;
    if (slopeAt(x, z) > 0.75) continue;
    const rot = rnd() * 6.28;
    if (h < 2.0) { // beach palms
      if (count.palm >= 40 || rnd() > 0.06 || !free(x, z, 3)) continue;
      palm.add1(x, h - 0.15, z, 0.85 + rnd() * 0.5, rot, jitter(0.12), 1, 0.04); taken.push([x, z, 1.5]); treePts.push([x, z, 0.4]); count.palm++; continue;
    }
    const dens = fbm(x * 0.05, z * 0.05, 3, 11);
    if (dens < 0.4 || h > 10.5) continue;
    const sc = 0.8 + rnd() * 0.7;
    if (!free(x, z, 2.3 * sc)) continue;
    const high = h > 6.5;
    const pick = rnd();
    if ((high && pick < 0.65) || pick < 0.18) { if (count.pine >= 140) continue; pine.add1(x, h - 0.15, z, sc * 1.05, rot, jitter(0.15), 0.9 + rnd() * 0.5); count.pine++; }
    else if (!high && pick > 0.95 && count.bloss < 40) { blossom.add1(x, h - 0.15, z, sc, rot, jitter(0.08), 1, 0.02); count.bloss++; }
    else if (rnd() < 0.5) { if (count.oak >= 200) continue; oak.add1(x, h - 0.15, z, sc, rot, jitter(0.15), 0.9 + rnd() * 0.35, 0.02); count.oak++; }
    else { if (oak2.count >= 200) continue; oak2.add1(x, h - 0.15, z, sc, rot, jitter(0.15), 0.9 + rnd() * 0.35, 0.02); }
    taken.push([x, z, 1.7 * sc]); treePts.push([x, z, sc * 0.6]);
    if (rnd() < 0.3) for (let k = 0; k < 1 + (rnd() * 3 | 0); k++) {
      const a = rnd() * 6.28, d = 1 + rnd() * 0.9, mx = x + Math.cos(a) * d * sc, mz = z + Math.sin(a) * d * sc;
      if (shrooms.count < 160) shrooms.add1(mx, heightAt(mx, mz) - 0.02, mz, 0.9 + rnd() * 0.9, rnd() * 6.28, null, 1, 0.1);
    }
  }
  // bushes
  tries = 0;
  while (tries++ < 4000 && bushM.count + berry.count < 190) {
    const x = (rnd() - 0.5) * WORLD * 0.9, z = (rnd() - 0.5) * WORLD * 0.9, h = heightAt(x, z);
    if (h < 1.8 || h > 10 || pondD(x, z) < 1.6 || pathMask(x, z) > 0.1 || !free(x, z, 1.1) || slopeAt(x, z) > 0.7) continue;
    if (fbm(x * 0.09, z * 0.09, 2, 21) < 0.5) continue;
    const sc = 0.7 + rnd() * 0.7;
    (rnd() < 0.18 ? berry : bushM).add1(x, h - 0.1, z, sc, rnd() * 6.28, jitter(0.2), 0.9 + rnd() * 0.3);
    taken.push([x, z, 0.8 * sc]);
  }
  // rocks (beach, cliffs, pond rim)
  tries = 0;
  while (tries++ < 8000 && rocks.count + rocks2.count < 240) {
    const x = (rnd() - 0.5) * WORLD * 0.95, z = (rnd() - 0.5) * WORLD * 0.95, h = heightAt(x, z);
    const sl = slopeAt(x, z), pd = pondD(x, z);
    const beach = h > -0.2 && h < 1.0, cliff = sl > 0.5 && h > 1, rim = pd > 0.9 && pd < 1.5;
    if (!(beach && rnd() < 0.06) && !(cliff && rnd() < 0.2) && !(rim && rnd() < 0.5)) continue;
    if (pathMask(x, z) > 0.2) continue;
    const sc = 0.3 + Math.pow(rnd(), 2) * (cliff ? 1.4 : 0.9);
    const tint = col.setHSL(0.07 + rnd() * 0.03, 0.08, 0.7 + rnd() * 0.3).clone();
    (rnd() < 0.5 ? rocks : rocks2).add1(x, h + sc * 0.05, z, sc, rnd() * 6.28, tint, 0.8 + rnd() * 0.5, 0.12);
    if (sc > 0.6) taken.push([x, z, sc]);
    if (rnd() < 0.5) { const x2 = x + (rnd() - 0.5) * 1.5, z2 = z + (rnd() - 0.5) * 1.5; rocks2.add1(x2, heightAt(x2, z2) + 0.02, z2, sc * 0.45, rnd() * 6.28, tint, 0.8, 0.12); }
  }
  // reeds around pond
  for (let i = 0; i < 70; i++) {
    const a = rnd() * 6.28, d = POND.r * (0.82 + rnd() * 0.5);
    const x = POND.x + Math.cos(a) * d, z = POND.z + Math.sin(a) * d, h = heightAt(x, z);
    if (h > POND_LEVEL + 0.35 || h < POND_LEVEL - 0.7 || pathMask(x, z) > 0.1) continue;
    reeds.add1(x, h - 0.05, z, 0.8 + rnd() * 0.6, rnd() * 6.28, jitter(0.2), 0.9 + rnd() * 0.4);
  }
  // flowers in patches
  const pal = [['#ff7eb6', '#ffe36a'], ['#ffd23f', '#e8892b'], ['#ffffff', '#ffd23f'], ['#b28dff', '#fff2a0'], ['#ff9f43', '#7a3b1a'], ['#7ec8ff', '#fff2a0']];
  const fl = pal.map(p => inst(S.flower(p[0], p[1]), mkMat({ amp: 0.06, heightGain: 0.1, speed: 2 }), 900, { cast: false }));
  tries = 0; let nf = 0;
  while (tries++ < 40000 && nf < 4200) {
    const x = (rnd() - 0.5) * WORLD * 0.92, z = (rnd() - 0.5) * WORLD * 0.92, h = heightAt(x, z);
    if (h < 1.5 || h > 10 || pathMask(x, z) > 0.08 || pondD(x, z) < 1.0 || slopeAt(x, z) > 0.55) continue;
    const patch = fbm(x * 0.11, z * 0.11, 2, 33);
    if (patch < 0.6 || rnd() > (patch - 0.55) * 3.5) continue;
    const k = Math.floor(fbm(x * 0.03 + 5, z * 0.03, 2, 8) * 2.3 * pal.length) % pal.length;
    const m = fl[(k + (rnd() < 0.15 ? 1 : 0)) % pal.length];
    if (m.count >= 900) continue;
    m.add1(x, h - 0.02, z, 0.8 + rnd() * 0.7, rnd() * 6.28, jitter(0.1), 0.8 + rnd() * 0.5, 0.15); nf++;
  }
  for (const m of group) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); }

  buildGrass(scene, { free, pathMask, pondD, slopeAt, rnd });
  buildPond(scene);
  return { treePts };
}
