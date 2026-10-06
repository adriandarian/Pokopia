import * as THREE from 'three';
import { WORLD, heightAt, POND_LEVEL } from '../terrain.js';
import { fbm, mulberry } from '../noise.js';
import { POND, pathMask, meadowMask, groveMask, LANDMARKS, SUMMIT } from './features.js';
import { applyWind, tickWind } from './wind.js';
import * as S from './species.js';
import { buildGrass } from './grass.js';
import { buildPond } from './pond.js';
import { buildProps } from './props.js';
import { world } from '../chars/fx.js';
import { buildPetals } from './petals.js';

/** CPU frustum + distance culling for instanced foliage (fewer triangles in both main and shadow passes). */
function setupLod(scene, meshes) {
  const fr = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere(), lastP = new THREE.Vector3(1e9, 0, 0), lastD = new THREE.Vector3();
  const fwd = new THREE.Vector3(); let lastT = 0;
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function (r, s, camera, ...rest) {
    prev && prev.call(this, r, s, camera, ...rest);
    const now = performance.now(); camera.getWorldDirection(fwd);
    if (camera.position.distanceTo(lastP) < 0.8 && fwd.dot(lastD) > 0.9995 && now - lastT < 1500) return;
    lastP.copy(camera.position); lastD.copy(fwd); lastT = now;
    camera.updateMatrixWorld(); pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); fr.setFromProjectionMatrix(pm);
    const cp = camera.position;
    for (const m of meshes) {
      if (!m.instanceColor) continue;
      const st = m.userData.store, rad = m.userData.rad, ma = m.instanceMatrix.array, ca = m.instanceColor.array;
      const maxD = rad > 2 ? 80 : 48; let n = 0;
      for (let i = 0; i < st.n; i++) {
        const x = st.pos[i * 3], y = st.pos[i * 3 + 1], z = st.pos[i * 3 + 2], rr = rad * st.sc[i] + 14;
        const dx = x - cp.x, dz = z - cp.z; if (dx * dx + dz * dz > (maxD + rr) * (maxD + rr)) continue;
        sph.center.set(x, y + rad * st.sc[i] * 0.5, z); sph.radius = rr; if (!fr.intersectsSphere(sph)) continue;
        for (let k = 0; k < 16; k++) ma[n * 16 + k] = st.mat[i * 16 + k];
        ca[n * 3] = st.col[i * 3]; ca[n * 3 + 1] = st.col[i * 3 + 1]; ca[n * 3 + 2] = st.col[i * 3 + 2]; n++;
      }
      m.count = n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
    }
  };
}

export function scatterNature(scene) {
  const rnd = mulberry(42);
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const treePts = [], taken = [];
  const free = (x, z, r) => { for (const t of taken) { const dx = t[0] - x, dz = t[1] - z, rr = t[2] + r; if (dx * dx + dz * dz < rr * rr) return false; } return true; };
  const pondD = (x, z) => Math.hypot(x - POND.x, z - POND.z) / POND.r;
  const slopeAt = (x, z) => { const e = 0.6; return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e); };

  const mkMat = (opts, side = THREE.FrontSide) => applyWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side, emissive: '#27421a', emissiveIntensity: 0.38 }), opts);
  const group = [];
  const lods = [];
  function inst(geo, mat, max, { cast = true, recv = true } = {}) {
    const m = new THREE.InstancedMesh(geo, mat, max);
    m.count = 0; m.castShadow = cast; m.receiveShadow = recv; tickWind(m);
    geo.computeBoundingSphere(); m.userData.rad = geo.boundingSphere.radius;
    const store = { mat: new Float32Array(max * 16), col: new Float32Array(max * 3), sc: new Float32Array(max), pos: new Float32Array(max * 3), n: 0 };
    m.userData.store = store; lods.push(m);
    m.frustumCulled = false;
    scene.add(m); group.push(m);
    m.add1 = (x, y, z, sc, rot, tint, sy = 1, tilt = 0) => {
      dummy.position.set(x, y, z); dummy.rotation.set(tilt * Math.sin(rot * 3), rot, tilt * Math.cos(rot * 3)); dummy.scale.set(sc, sc * sy, sc); dummy.updateMatrix();
      const c = tint || col.set('#ffffff'), i = store.n++;
      dummy.matrix.toArray(store.mat, i * 16); store.col[i * 3] = c.r; store.col[i * 3 + 1] = c.g; store.col[i * 3 + 2] = c.b;
      store.sc[i] = sc * Math.max(1, sy); store.pos[i * 3] = x; store.pos[i * 3 + 1] = y; store.pos[i * 3 + 2] = z;
      m.setMatrixAt(m.count, dummy.matrix); m.setColorAt(m.count, c); m.count++;
    };
    return m;
  }
  const jitter = (v = 0.1) => { const k = 1 - rnd() * v; return col.setRGB(k * (1 + (rnd() - 0.5) * v * 0.9), k * (1 + (rnd() - 0.5) * v * 0.5), k * (1 + (rnd() - 0.5) * v * 1.1)).clone(); };
  const stdMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: '#2a3a1c', emissiveIntensity: 0.22 });

  // species meshes
  const oak = inst(S.roundTree(['#5fbf45', '#78d255', '#4aa83c'], 1), mkMat({ amp: 0.03, heightGain: 0.012 }), 140);
  const oak2 = inst(S.roundTree(['#7ec94a', '#9ad85a', '#68b843'], 2), mkMat({ amp: 0.03, heightGain: 0.012 }), 140);
  const blossom = inst(S.blossomTree(3), mkMat({ amp: 0.03, heightGain: 0.012 }, THREE.DoubleSide), 30);
  const pine = inst(S.pineTree(1), mkMat({ amp: 0.015, heightGain: 0.012 }), 120);
  const palm = inst(S.palmTree(1), mkMat({ amp: 0.05, heightGain: 0.025, speed: 1.2 }, THREE.DoubleSide), 60);
  const bushM = inst(S.bush(['#4fb447', '#68cb52'], 1), mkMat({ amp: 0.03, heightGain: 0.02 }), 200);
  const berry = inst(S.berryBush(3), mkMat({ amp: 0.03, heightGain: 0.02 }), 60);
  const rocks = inst(S.rock(1), stdMat(), 260, { cast: false });
  const rocks2 = inst(S.rock(5), stdMat(), 260);
  const shrooms = inst(S.mushroom(), stdMat(), 200, { cast: false });
  const ferns = inst(S.fern('#3d9a4a'), mkMat({ amp: 0.05, heightGain: 0.06 }, THREE.DoubleSide), 520, { cast: false });
  const reeds = inst(S.reed(), mkMat({ amp: 0.06, heightGain: 0.05 }), 80);

  // trees: groves, meadows with lone trees, landmarks
  const obs = world.obstacles = []; if (typeof window !== 'undefined') { window.__obstacles = obs; window.__world = world; } // camera-occlusion list for the follow camera: {x, z, r, top(world Y)}
  let tries = 0;
  const count = { oak: 0, pine: 0, palm: 0, bloss: 0 };
  const addTree = (kind, x, z, h, sc, rot) => {
    const tint = jitter(0.18), sy = 0.85 + rnd() * 0.45, tilt = 0.02 + rnd() * 0.035;
    const y = h - 0.2;
    if (kind === 'pine') pine.add1(x, y, z, sc * 1.05, rot, tint, sy, tilt * 0.6);
    else if (kind === 'bloss') bloss_add(x, y, z, sc * 0.62, rot, jitter(0.08), 1, tilt);
    else if (kind === 'oak') oak.add1(x, y, z, sc, rot, tint, sy, tilt);
    else oak2.add1(x, y, z, sc, rot, tint, sy, tilt);
    taken.push([x, z, 1.5 * sc]); treePts.push([x, z, sc * 0.6]);
    if (kind === 'pine') obs.push({ x, z, r: 1.2 * sc, top: h + 6.2 * sc * sy });
    else obs.push({ x, z, r: (kind === 'bloss' ? 0.9 : 1.2) * sc, top: h + (kind === 'bloss' ? 3.0 * sc * 0.62 + 0.5 : 4.6 * sc * sy) });
  };
  const bloss_add = (...a) => blossom.add1(...a);
  const propClear = buildProps(scene); for (const t of propClear) taken.push(t);
  for (const L of LANDMARKS) {
    const h = heightAt(L.x, L.z);
    addTree(L.kind === 'blossom' ? 'bloss' : L.kind, L.x, L.z, h, L.s, rnd() * 6.28);
    for (let k = 0; k < 5; k++) { const a = rnd() * 6.28, d = 2 + rnd() * 2.2; const bx = L.x + Math.cos(a) * d * L.s * 0.7, bz = L.z + Math.sin(a) * d * L.s * 0.7; if (free(bx, bz, 0.6) && pathMask(bx, bz) < 0.1) { shrooms.add1(bx, heightAt(bx, bz) - 0.02, bz, 0.9 + rnd() * 0.9, rnd() * 6.28, null, 1, 0.1); } }
  }
  // boulder cluster ring on the summit shoulder (kept away from the centre and the paths)
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.5 + (rnd() - 0.5) * 0.25, d = 8.2 + rnd() * 1.6, x = SUMMIT.x + Math.cos(a) * d, z = SUMMIT.z + Math.sin(a) * d;
    if (pathMask(x, z) > 0.02 || slopeAt(x, z) > 0.9) continue;
    const sc = 0.55 + rnd() * 0.5, tint = col.setHSL(0.09 + rnd() * 0.04, 0.07, 0.72 + rnd() * 0.25).clone();
    rocks2.add1(x, heightAt(x, z) + sc * 0.08, z, sc, rnd() * 6.28, tint, 0.7 + rnd() * 0.4, 0.14);
    taken.push([x, z, sc * 1.2]);
    if (rnd() < 0.7) { const x2 = x + 1 * (rnd() - 0.5) * 2, z2 = z + (rnd() - 0.5) * 2; rocks.add1(x2, heightAt(x2, z2), z2, sc * 0.5, rnd() * 6, tint, 0.8, 0.1); }
  }
  while (tries++ < 22000) {
    const x = (rnd() - 0.5) * WORLD * 0.92, z = (rnd() - 0.5) * WORLD * 0.92, h = heightAt(x, z);
    if (h < 0.4 || pondD(x, z) < 1.9 || pathMask(x, z) > 0.14) continue;
    if (slopeAt(x, z) > 0.8) continue;
    const rot = rnd() * 6.28;
    if (h < 2.0) { // beach palms, clumped
      if (count.palm >= 34 || rnd() > 0.05 * (0.3 + fbm(x * 0.08, z * 0.08, 2, 51) * 2) || !free(x, z, 3.2)) continue;
      palm.add1(x, h - 0.15, z, 0.8 + rnd() * 0.6, rot, jitter(0.12), 0.9 + rnd() * 0.3, 0.05 + rnd() * 0.05); taken.push([x, z, 1.5]); treePts.push([x, z, 0.4]); obs.push({ x, z, r: 0.35, top: h + 5 }); count.palm++; continue;
    }
    if (h > 10.8) continue;
    const g = groveMask(x, z), m = meadowMask(x, z);
    const dens = g * (0.55 + fbm(x * 0.09, z * 0.09, 2, 11) * 0.7) + (1 - g) * (1 - m) * 0.12 + m * 0.01;
    if (rnd() > dens) continue;
    const sc = (0.65 + Math.pow(rnd(), 1.5) * 0.95) * (g > 0.5 ? 1.0 : 0.85);
    if (!free(x, z, (g > 0.5 ? 1.7 : 3.4) * sc)) continue;
    const high = h > 6.5, pick = rnd();
    let kind;
    if ((high && pick < 0.7) || pick < 0.14 + g * 0.22) kind = 'pine';
    else if (!high && pick > 0.94) kind = 'bloss';
    else kind = rnd() < 0.5 ? 'oak' : 'oak2';
    if (kind === 'pine' && count.pine >= 110) continue;
    if (kind === 'bloss' && count.bloss >= 22) continue;
    if (kind === 'oak' && count.oak >= 130) continue;
    if (kind === 'oak2' && oak2.count >= 130) continue;
    count[kind === 'oak2' ? 'oak' : kind]++;
    addTree(kind, x, z, h, sc, rot);
    if (rnd() < 0.3) for (let k = 0; k < 1 + (rnd() * 3 | 0); k++) {
      const a = rnd() * 6.28, d = 1 + rnd() * 0.9, mx = x + Math.cos(a) * d * sc, mz = z + Math.sin(a) * d * sc;
      if (shrooms.count < 160) shrooms.add1(mx, heightAt(mx, mz) - 0.02, mz, 0.9 + rnd() * 0.9, rnd() * 6.28, null, 1, 0.1);
    }
  }
  // ferns under groves
  tries = 0;
  while (tries++ < 20000 && ferns.count < 520) {
    const x = (rnd() - 0.5) * WORLD * 0.9, z = (rnd() - 0.5) * WORLD * 0.9, h = heightAt(x, z);
    if (h < 1.8 || h > 10.5 || pathMask(x, z) > 0.1 || pondD(x, z) < 1.3 || slopeAt(x, z) > 0.7) continue;
    const g = groveMask(x, z);
    if (rnd() > g * 0.9 + 0.01) continue;
    ferns.add1(x, h - 0.05, z, 0.7 + rnd() * 0.8, rnd() * 6.28, jitter(0.25), 0.8 + rnd() * 0.5, 0.05);
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
    if (sc > 0.9) obs.push({ x, z, r: 0.8 * sc, top: h + 1.3 * sc });
  }
  // rocks (beach, cliffs, pond rim)
  tries = 0;
  while (tries++ < 8000 && rocks.count + rocks2.count < 150) {
    const x = (rnd() - 0.5) * WORLD * 0.95, z = (rnd() - 0.5) * WORLD * 0.95, h = heightAt(x, z);
    const sl = slopeAt(x, z), pd = pondD(x, z);
    const beach = h > -0.2 && h < 1.0, cliff = sl > 0.5 && h > 1, rim = pd > 0.9 && pd < 1.5;
    if (!(beach && rnd() < 0.06) && !(cliff && rnd() < 0.09) && !(rim && rnd() < 0.3)) continue;
    if (pathMask(x, z) > 0.015 || !free(x, z, 0.8)) continue;
    const sc = 0.3 + Math.pow(rnd(), 2) * (cliff ? 1.0 : 0.8);
    const tint = col.setHSL(0.07 + rnd() * 0.03, 0.08, 0.7 + rnd() * 0.3).clone();
    (rnd() < 0.5 ? rocks : rocks2).add1(x, h + sc * 0.05, z, sc, rnd() * 6.28, tint, 0.8 + rnd() * 0.5, 0.12);
    if (sc > 0.6) { taken.push([x, z, sc]); if (sc > 0.8) obs.push({ x, z, r: sc * 0.9, top: h + sc * 0.9 }); }
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
  const fl = pal.map((p, pi) => inst(S.flower(p[0], p[1], pi === 1 || pi === 4), mkMat({ amp: 0.06, heightGain: 0.1, speed: 2 }), 900, { cast: false }));
  tries = 0; let nf = 0;
  while (tries++ < 40000 && nf < 4200) {
    const x = (rnd() - 0.5) * WORLD * 0.92, z = (rnd() - 0.5) * WORLD * 0.92, h = heightAt(x, z);
    if (propClear.some(a => (a[0] - x) ** 2 + (a[1] - z) ** 2 < a[2] * a[2]) || h < 1.5 || h > 9 || pathMask(x, z) > 0.08 || pondD(x, z) < 1.0 || slopeAt(x, z) > 0.45) continue;
    const patch = fbm(x * 0.11, z * 0.11, 2, 33) * (0.5 + 0.75 * meadowMask(x, z));
    if (patch < 0.45 || rnd() > (patch - 0.43) * 5) continue;
    const k = Math.floor(fbm(x * 0.03 + 5, z * 0.03, 2, 8) * 2.3 * pal.length) % pal.length;
    const m = fl[(k + (rnd() < 0.15 ? 1 : 0)) % pal.length];
    if (m.count >= 900) continue;
    m.add1(x, h - 0.02, z, 0.8 + rnd() * 0.7, rnd() * 6.28, jitter(0.1), 0.8 + rnd() * 0.5, 0.15); nf++;
  }
  for (const m of group) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); }

  // fern skirt around bigger rocks
  for (const m of [rocks, rocks2]) { const st = m.userData.store; for (let i = 0; i < st.n && ferns.count < 520; i++) if (st.sc[i] > 0.7 && rnd() < 0.8) { const a = rnd() * 6.28, d = st.sc[i] * 1.0, fx = st.pos[i * 3] + Math.cos(a) * d, fz = st.pos[i * 3 + 2] + Math.sin(a) * d; if (pathMask(fx, fz) < 0.05) ferns.add1(fx, heightAt(fx, fz) - 0.03, fz, 0.6 + rnd() * 0.5, rnd() * 6.28, jitter(0.2), 0.8, 0.05); } }
  for (const m of group) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  setupLod(scene, lods);
  const bst = blossom.userData.store, bp = [];
  for (let i = 0; i < bst.n; i++) bp.push([bst.pos[i * 3], bst.pos[i * 3 + 1], bst.pos[i * 3 + 2], bst.sc[i]]);
  buildPetals(scene, bp);
  buildGrass(scene, { free, pathMask, pondD, slopeAt, rnd, avoid: propClear });
  buildPond(scene);
  return { treePts };
}
