import * as THREE from 'three';
import { heightAt } from '../terrain.js';
import { fbm } from '../noise.js';
import { WORLD } from '../terrain.js';
import { applyWind, tickWind } from './wind.js';

function tuftGeometry() {
  const pos = [], nor = [], col = [], aw = [];
  const blades = 5;
  const base = new THREE.Color('#3f9a35'), tip = new THREE.Color('#b6ef6c'), c = new THREE.Color();
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + b * 0.7, r = 0.05 + (b % 2) * 0.06;
    const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
    const h = 0.38 + ((b * 37) % 5) * 0.09, w = 0.055;
    const dir = a + 1.2, bx = Math.cos(dir) * 0.12 * h, bz = Math.sin(dir) * 0.12 * h;
    const px = -Math.sin(dir) * w, pz = Math.cos(dir) * w;
    const rows = [
      [ox - px, 0, oz - pz, ox + px, 0, oz + pz, 0],
      [ox - px * 0.75 + bx * 0.4, h * 0.5, oz - pz * 0.75 + bz * 0.4, ox + px * 0.75 + bx * 0.4, h * 0.5, oz + pz * 0.75 + bz * 0.4, 0.4],
    ];
    const tipP = [ox + bx * 2.2, h, oz + bz * 2.2];
    const push = (p, t) => {
      pos.push(...p); nor.push(0, 1, 0); aw.push(t);
      c.copy(base).lerp(tip, t); col.push(c.r, c.g, c.b);
    };
    const [r0, r1] = rows;
    const L0 = [r0[0], r0[1], r0[2]], R0 = [r0[3], r0[4], r0[5]], L1 = [r1[0], r1[1], r1[2]], R1 = [r1[3], r1[4], r1[5]];
    push(L0, 0); push(R0, 0); push(R1, .45);
    push(L0, 0); push(R1, .45); push(L1, .45);
    push(L1, .45); push(R1, .45); push(tipP, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aw', new THREE.Float32BufferAttribute(aw, 1));
  return g;
}

export function buildGrass(scene, { free, pathMask, pondD, slopeAt, rnd }) {
  const MAX = 36000;
  const mat = applyWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), { amp: 0.0, heightGain: 0.0, speed: 2.0 });
  // grass sways in proportion to blade height (aw) not position.y
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh) => {
    base(sh);
    sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>')
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);');
    sh.vertexShader = sh.vertexShader.replace('float k = aw * (0.0000 + position.y * 0.0000)', 'float k = aw * 0.16');
  };
  mat.customProgramCacheKey = () => 'grassWind';
  const mesh = new THREE.InstancedMesh(tuftGeometry(), mat, MAX);
  const d = new THREE.Object3D(), col = new THREE.Color();
  let n = 0, tries = 0;
  while (n < MAX && tries++ < MAX * 6) {
    const x = (rnd() - 0.5) * WORLD * 0.94, z = (rnd() - 0.5) * WORLD * 0.94, h = heightAt(x, z);
    if (h < 1.45 || h > 11.5) continue;
    const pm = pathMask(x, z);
    if (pm > 0.3 || pondD(x, z) < 0.95) continue;
    const sl = slopeAt(x, z);
    if (sl > 0.6) continue;
    // thin out near the sand fringe and path edges
    const edgeFade = Math.min(1, (h - 1.45) / 1.0);
    if (rnd() > edgeFade * (1 - pm * 2.2)) continue;
    const tall = 0.6 + fbm(x * 0.1, z * 0.1, 2, 77) * 0.5;
    d.position.set(x, h - 0.03, z);
    d.rotation.set(0, rnd() * 6.28, 0);
    const s = tall * (0.8 + rnd() * 0.6);
    d.scale.set(s, s * (0.8 + rnd() * 0.5), s);
    d.updateMatrix(); mesh.setMatrixAt(n, d.matrix);
    mesh.setColorAt(n, col.setHSL(0.26 + (fbm(x * 0.06, z * 0.06, 2, 4) - 0.5) * 0.12 + (rnd() - 0.5) * 0.02, 0.55 + rnd() * 0.2, 0.72 + rnd() * 0.3));
    n++;
  }
  mesh.count = n;
  mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  tickWind(mesh);
  scene.add(mesh);
}
