import * as THREE from 'three';
import { heightAt, WORLD } from '../terrain.js';
import { fbm } from '../noise.js';
import { meadowMask, groveMask } from './features.js';
import { windTime } from './wind.js';
import { world } from '../chars/fx.js';

/** Rounded, tapered blades: 4 per tuft, 3 rows each (5 tris), dark base -> bright tip. */
function tuftGeometry() {
  const pos = [], nor = [], aw = [], uvv = [];
  const blades = 3;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + b * 0.9, r = 0.03 + (b % 2) * 0.07;
    const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
    const h = 0.28 + ((b * 37) % 3) * 0.04, w = 0.068;
    const dir = a + 0.8 + b * 0.5, dx = Math.cos(dir), dz = Math.sin(dir);
    const px = -dz, pz = dx; // blade width axis
    const lean = 0.22 * h;
    const rows = [[0, w, 0], [0.55, w * 0.7, 0.4 * lean], [1, 0.0, 1.9 * lean]];
    const P = rows.map(([t, ww, l]) => [t, [ox + dx * l - px * ww, h * t - 0.0 * l, oz + dz * l - pz * ww], [ox + dx * l + px * ww, h * t, oz + dz * l + pz * ww]]);
    const nrm = [dx * 0.3, 0.9, dz * 0.3];
    const push = (p, t) => { pos.push(...p); nor.push(...nrm); aw.push(t); };
    for (let i = 0; i < 2; i++) {
      const [t0, L0, R0] = P[i], [t1, L1, R1] = P[i + 1];
      push(L0, t0); push(R0, t0); push(R1, t1);
      if (i < 1) { push(L0, t0); push(R1, t1); push(L1, t1); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aw', new THREE.Float32BufferAttribute(aw, 1));
  return g;
}

export function buildGrass(scene, { pathMask, pondD, slopeAt, rnd, avoid = [] }) {
  const CELL = 16, MAXD = 28;
  const uFade = { value: new THREE.Vector4(0, 0, 0, 1) }, uPlayer = { value: new THREE.Vector3(1e5, 0, 1e5) }, uCre = { value: Array.from({ length: 16 }, () => new THREE.Vector3(1e5, 0, 1e5)) };
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide, emissive: '#1d4010', emissiveIntensity: 0.55 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windTime;
    sh.uniforms.uFade = uFade; sh.uniforms.uPlayer = uPlayer; sh.uniforms.uCre = uCre;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec4 uFade; uniform vec3 uPlayer; uniform vec3 uCre[16]; attribute float aw; varying float vT; varying float vF;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vT = aw;
        vec3 iw = vec3(instanceMatrix[3]);
        float dist = distance(iw.xz, uFade.xz);
        vF = smoothstep(${MAXD.toFixed(1)}, ${(MAXD * 0.6).toFixed(1)}, dist);
        float pf = smoothstep(0.9, 2.7, distance(iw.xz, uPlayer.xz)); // flatten grass around the hero so feet stay visible
        float dpl = distance(iw.xz, uPlayer.xz);
        float cf = 1.;
        for (int ci = 0; ci < 16; ci++) cf = min(cf, smoothstep(0.7, 1.7, distance(iw.xz, uCre[ci].xz)));
        float sy = length(instanceMatrix[1].xyz);
        float capK = mix(0.5, 1.8, smoothstep(5., 16., dpl)); // keep grass about knee-high around the play area
        transformed.y *= (0.25 + 0.75 * vF) * step(0.001, vF) * (0.12 + 0.88 * pf) * (0.12 + 0.88 * cf) * min(1., capK / (0.5 * sy));
        float ph = iw.x * 0.27 + iw.z * 0.19;
        float gust = sin(uTime * 0.31 + iw.x * 0.045 + iw.z * 0.035) * 0.5 + 0.5;
        float k = aw * aw * (0.05 + gust * 0.11);
        transformed.x += sin(uTime * 1.35 + ph) * k + gust * 0.04 * aw * aw;
        transformed.z += cos(uTime * 1.1 + ph * 1.4) * k * 0.6;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n varying float vT; varying float vF;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 bladeC = mix(vec3(.22,.45,.14), vec3(.4,.68,.2), smoothstep(0.,.45,vT));
        bladeC = mix(bladeC, vec3(.55,.78,.3), smoothstep(.55,1.,vT)*.45);
        diffuseColor.rgb *= bladeC * bladeC * 1.0 * (1.15) ;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.2,.42,.1), (1.-vF)*.5);
        diffuseColor.rgb *= mix(.86, 1., smoothstep(0.,.3,vT));`);;
  };
  mat.customProgramCacheKey = () => 'grassV2';

  const geo = tuftGeometry();
  const cells = new Map();
  const d = new THREE.Object3D(), col = new THREE.Color();
  const TARGET = 30000;
  let n = 0, tries = 0;
  while (n < TARGET && tries++ < TARGET * 8) {
    const x = (rnd() - 0.5) * WORLD * 0.94, z = (rnd() - 0.5) * WORLD * 0.94, h = heightAt(x, z);
    if (h < 1.5 || h > 12.6) continue;
    const pm = pathMask(x, z);
    if (pm > 0.34 || pondD(x, z) < 1.0) continue;
    if (avoid.some(a => (a[0] - x) ** 2 + (a[1] - z) ** 2 < (a[2] * 0.85) ** 2)) continue;
    if (slopeAt(x, z) > 0.62) continue;
    const m = meadowMask(x, z), g = groveMask(x, z);
    // lush in meadows, patchy elsewhere, sparse under groves
    const patchy = 0.55 + fbm(x * 0.13, z * 0.13, 2, 61) * 0.9;
    const edgeFade = Math.min(1, (h - 1.5) / 1.0);
    if (rnd() > edgeFade * Math.min(1, (0.55 + m * 0.5 - g * 0.15) * patchy) * (1 - pm * 2.6)) continue;
    const key = Math.floor((x + WORLD / 2) / CELL) + ',' + Math.floor((z + WORLD / 2) / CELL);
    let c = cells.get(key); if (!c) cells.set(key, c = []);
    const tall = (0.62 + fbm(x * 0.1, z * 0.1, 2, 77) * 0.55) * (0.75 + m * 0.5);
    const s = tall * (0.75 + rnd() * 0.7);
    d.position.set(x, h - 0.04, z); d.rotation.set(0, rnd() * 6.28, 0);
    d.scale.set(s * 1.1, s * (0.75 + rnd() * 0.6), s * 1.1); d.updateMatrix();
    // per-clump hue variation: yellow-green meadow patches vs deep blue-green shade
    const hue = 0.24 + (fbm(x * 0.05, z * 0.05, 2, 4) - 0.5) * 0.14 + (rnd() - 0.5) * 0.03 - g * 0.02 + m * 0.01;
    col.setHSL(hue, 0.5 + rnd() * 0.15, 0.7 + rnd() * 0.14);
    c.push([d.matrix.clone(), col.clone(), x, z]);
    n++;
  }
  const meshes = [];
  for (const [, list] of cells) {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    let cx = 0, cz = 0;
    list.forEach((e, i) => { mesh.setMatrixAt(i, e[0]); mesh.setColorAt(i, e[1]); cx += e[2]; cz += e[3]; });
    mesh.userData.cx = cx / list.length; mesh.userData.cz = cz / list.length;
    mesh.castShadow = false; mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    scene.add(mesh); meshes.push(mesh);
  }
  // distance culling + fade centre follow the camera
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function (r, s, camera, ...rest) {
    prev && prev.call(this, r, s, camera, ...rest);
    const cp = camera.position; uFade.value.set(cp.x, 0, cp.z, 1); uPlayer.value.copy(world.playerPos);
    const cl = typeof window !== 'undefined' && window.__creatures && window.__creatures.list;
    for (let i = 0; i < 16; i++) { const c = cl && cl[i]; if (c && c.m) uCre.value[i].copy(c.m.position); else uCre.value[i].set(1e5, 0, 1e5); }
    for (const m of meshes) {
      const bs = m.boundingSphere, dd = Math.hypot(m.userData.cx - cp.x, m.userData.cz - cp.z);
      m.visible = dd < MAXD + (bs ? bs.radius : CELL);
    }
  };
}
