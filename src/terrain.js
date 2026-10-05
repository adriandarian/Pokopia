import * as THREE from 'three';
import { fbm } from './noise.js';
import { POND, pathMask, meadowMask, SUMMIT, routeDist } from './nature/features.js';
import { tickWind } from './nature/wind.js';

export const WORLD = 128; // world size in units
const RES = 256;          // grid resolution

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function baseHeight(x, z) {
  const nx = x / WORLD, nz = z / WORLD;
  const coastN = fbm(x * 0.022 + 3, z * 0.022 - 5, 3, 13) - 0.5;
  const d = Math.hypot(nx, nz) * 2 * (1 + coastN * 0.3);
  const island = Math.max(0, 1 - Math.pow(d, 2.2));
  const m = meadowMask(x, z);
  const hills = fbm(x * 0.03 + 10, z * 0.03 + 10, 5, 7);
  const r = Math.hypot(x - SUMMIT.x, z - SUMMIT.z);
  let h = island * (6.0 + hills * 13.5 * (1 - 0.7 * m) + 5.5 * Math.exp(-(r * r) / 400)) - 3.2;
  // cliff ledges / terraces in rocky zones
  const cliff = sstep(0.5, 0.62, fbm(x * 0.035 - 8, z * 0.035 + 4, 2, 9)) * sstep(1.8, 3.6, h) * (1 - m) * sstep(3, 9, routeDist(x, z));
  const T = 3.4, t = h / T + (fbm(x * 0.18, z * 0.18, 2, 3) - 0.5) * 0.12, f = t - Math.floor(t);
  h += ((Math.floor(t) + sstep(0.56, 0.78, f)) * T - h) * cliff * 0.96;
  // flat hilltop viewpoint
  h += (SUMMIT.h - h) * sstep(14, 5, r);
  return h;
}

// Pond: a shelf is blended into the hillside and a bowl carved into it.
const POND_SHELF = baseHeight(POND.x, POND.z) - 0.1;
export const POND_LEVEL = POND_SHELF - 0.45;

export function heightAt(x, z) {
  let h = baseHeight(x, z);
  const d = Math.hypot(x - POND.x, z - POND.z);
  if (d < POND.r * 2.4) {
    const ang = Math.atan2(z - POND.z, x - POND.x);
    const dd = d * (1 + 0.12 * Math.sin(ang * 3 + 1) + 0.07 * Math.sin(ang * 5));
    h = h + (POND_SHELF - h) * sstep(POND.r * 2.4, POND.r * 1.2, dd);
    h -= 1.7 * sstep(POND.r * 1.15, POND.r * 0.25, dd);
  }
  return h;
}

/** One terrain chunk as an indexed grid with a short skirt so LOD borders never show cracks. */
function chunkGeo(x0, z0, size, seg, grad) {
  const n = seg + 1, pos = [], nor = [], msk = [], idx = [];
  const push = (x, z, drop) => {
    const h = heightAt(x, z);
    pos.push(x, h - drop, z);
    const e = 0.5, dx = heightAt(x + e, z) - heightAt(x - e, z), dz = heightAt(x, z + e) - heightAt(x, z - e);
    const l = Math.hypot(dx, 2 * e, dz); nor.push(-dx / l, 2 * e / l, -dz / l);
    msk.push(h > 0.8 ? pathMask(x, z) : 0);
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) push(x0 + i / seg * size, z0 + j / seg * size, 0);
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const ring = []; // boundary loop in order
  for (let i = 0; i < seg; i++) ring.push([i, 0]);
  for (let j = 0; j < seg; j++) ring.push([seg, j]);
  for (let i = seg; i > 0; i--) ring.push([i, seg]);
  for (let j = seg; j > 0; j--) ring.push([0, j]);
  const base = pos.length / 3;
  for (const [i, j] of ring) push(x0 + i / seg * size, z0 + j / seg * size, grad);
  const m = ring.length;
  for (let k = 0; k < m; k++) {
    const [i0, j0] = ring[k], [i1, j1] = ring[(k + 1) % m];
    const t0 = j0 * n + i0, t1 = j1 * n + i1, s0 = base + k, s1 = base + (k + 1) % m;
    idx.push(t0, s0, t1, t1, s0, s1, t0, t1, s0, t1, s1, s0); // double-sided skirt
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aMask', new THREE.Float32BufferAttribute(msk, 1));
  g.setIndex(idx);
  return g;
}

export function buildTerrain(scene) {
  const CH = 6, SZ = WORLD / CH;
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.97, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPond = { value: new THREE.Vector4(POND.x, POND.z, POND.r, POND_LEVEL) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aMask; varying float vP; varying vec3 vW; varying vec3 vN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vP = aMask; vW = position; vN = normal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec4 uPond; varying float vP; varying vec3 vW; varying vec3 vN;
        float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
        float fb(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+17.1; a*=.5; } return s; }
        vec3 vor(vec2 p){ vec2 i=floor(p), f=fract(p); float md=8.; vec2 mid=vec2(0.);
          for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g=vec2(float(x),float(y)); vec2 o=vec2(h21(i+g), h21(i+g+37.));
            vec2 r=g+o*.8+.1-f; float d=dot(r,r); if(d<md){ md=d; mid=i+g; } }
          return vec3(sqrt(md), h21(mid+3.1), h21(mid+9.7)); }
        vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }`)
      .replace('#include <color_fragment>', `
        vec2 xz = vW.xz; float h = vW.y;
        // domain-warped coordinates break up visible tiling
        vec2 wq = xz + 6.*vec2(fb(xz*.03+3.), fb(xz*.03-9.)) - 3.;
        float n1 = fb(wq*.06), n2 = fb(wq*.35+7.), n3 = vn(xz*2.7), fine = vn(xz*vec2(14.,14.)+wq), streak = vn(vec2(xz.x*30., xz.y*6.)+wq);
        float macro = fb(xz*.012+21.), patchN = fb(wq*.11+40.);
        vec3 nrm = normalize(vN); float slope = 1. - nrm.y;
        // grass: layered painterly greens with large-scale colour drift
        vec3 grass = mix(vec3(.30,.62,.2), vec3(.52,.80,.27), smoothstep(.25,.75,n1));
        grass = mix(grass, vec3(.2,.5,.26), smoothstep(.5,.85,n2)*.55);
        grass = mix(grass, vec3(.74,.86,.3), smoothstep(.55,.85,patchN)*.4);
        grass = mix(grass, vec3(.16,.42,.24), smoothstep(.55,.3,macro)*.35);
        grass *= .86 + .26*fine; grass *= .94 + .1*streak;
        grass *= .82 + .36*smoothstep(.2,.8,fb(wq*.9+3.));
        // stylised painted clumps: voronoi tufts with lighter hearts, dark seams and blade strokes (fades with distance)
        float dfade = smoothstep(48., 12., length(vViewPosition)) * smoothstep(.35, .1, 1. - normalize(vN).y);
        vec3 v1 = vor(xz*1.1 + (wq-xz)*.5), v2 = vor(xz*.21+5.);
        // flat painted patches (no round dabs): each polygonal cell gets a small tint shift
        vec3 g2 = grass * mix(vec3(1.), mix(vec3(.93,.98,.92), vec3(1.07,1.05,.9), v1.y), dfade);
        g2 *= 1. + dfade*(v1.z-.5)*.1;
        g2 = mix(g2, g2*vec3(1.14,1.05,.7), v2.y*.4);
        g2 = mix(g2, g2*vec3(.84,.98,1.0), smoothstep(.55,.9,v2.z)*.3);
        grass = g2;
        // sand with ripples
        vec3 sand = mix(vec3(.95,.84,.6), vec3(.99,.91,.7), n2);
        sand *= .95 + .07*fine + .035*sin((wq.x*.9+wq.y*.55)*2.4 + n1*9.);
        float wet = smoothstep(1.25, -.1, h + (n3-.5)*.4);
        sand = mix(sand, sand*vec3(.7,.62,.52), wet*.9);
        sand = mix(sand, sand*vec3(.55,.55,.5), smoothstep(.35,-.3,h)*.7);
        sand = mix(sand, vec3(.42,.72,.66), smoothstep(-.5,-2.6,h)*.9);
        float gm = smoothstep(1.0, 1.9, h + (n2-.5)*.9);
        vec3 col = mix(sand, grass, gm);
        // darker, drier tufty rim where grass meets sand
        col = mix(col, col*vec3(1.05,1.0,.78), smoothstep(.3,.0,abs(gm-.5)-.2)*.5);
        // rock: cut faces with discrete strata layers, blocky seams and warm/cool variation
        float rockM = smoothstep(.3,.5, slope + (n2-.5)*.1);
        float layer = floor(h*2.3 + n1*1.6);
        float lh = h21(vec2(layer, 7.3));
        vec3 rockC = mix(mix(vec3(.66,.6,.54), vec3(.5,.45,.43), lh), vec3(.76,.67,.5), step(.72,lh)*.8);
        float lf = fract(h*2.3 + n1*1.6);
        rockC *= .9 + .13*smoothstep(.0,.2,lf) - .22*smoothstep(.86,1.,lf);   // dark seam under each layer
        vec3 vr = vor(vec2((xz.x+xz.y*.7)*.9, h*1.7));
        rockC *= .9 + .2*vr.y;  rockC *= 1. - .3*smoothstep(.34,.5,vr.x);
        rockC = mix(rockC, vec3(.4,.52,.34), smoothstep(.55,.9,n2)*.3*smoothstep(.5,.3,slope)); // moss on gentler faces
        rockC *= .92 + .14*vn(vec2(xz.x+xz.y, h*3.)*4.);
        col = mix(col, rockC, rockM);
        col *= 1. - .14*smoothstep(.1,.3,slope)*(1.-rockM*.5);
        // pond bank / mud ring + underwater bed gradient
        float pd = length(xz - uPond.xy)/uPond.z;
        float bank = smoothstep(1.55, .95, pd + (n2-.5)*.3) * (1.-rockM);
        vec3 mud = mix(vec3(.46,.35,.24), vec3(.6,.5,.34), n2);
        float shore = smoothstep(uPond.w+1.0, uPond.w+.05, h);
        col = mix(col, mud*(.88+.2*fine), bank*shore*.92);
        // sandy wet rim just above waterline
        col = mix(col, col*vec3(.62,.55,.45), bank*smoothstep(uPond.w+.35, uPond.w, h)*.7);
        float under = smoothstep(uPond.w+.05, uPond.w-.15, h)*smoothstep(1.5,1.,pd);
        col = mix(col, mix(vec3(.42,.5,.36), vec3(.05,.22,.28), smoothstep(uPond.w, uPond.w-1.3, h)), under);
        // dirt path: crisp edge, grass-tuft fringe, darker rim
        float pv = vP + (n3-.5)*.2 + (fine-.5)*.06;
        float pm = smoothstep(.45,.5,pv);
        float rim = smoothstep(.28,.45,pv) - smoothstep(.45,.58,pv);
        vec3 pathC = mix(vec3(.88,.74,.52), vec3(.76,.61,.42), n2)*(.93+.12*fine);
        pathC = mix(pathC, vec3(.7,.64,.58), step(.93, vn(xz*9.))*.5);
        pathC *= 1. - .12*smoothstep(.5,.7,pv); // slightly sunken centre
        col = mix(col, col*vec3(.62,.78,.5), rim*.75*(1.-rockM));
        col = mix(col, pathC*mix(.78,1.,smoothstep(.5,.62,pv)), pm*(1.-rockM*.25));
        diffuseColor.rgb *= lin(clamp(col,0.,1.));
      `);
  };
  const group = new THREE.Group();
  for (let cz = 0; cz < CH; cz++) for (let cx = 0; cx < CH; cx++) {
    const x0 = -WORLD / 2 + cx * SZ, z0 = -WORLD / 2 + cz * SZ;
    const lod = new THREE.Group();
    const hi = new THREE.Mesh(chunkGeo(x0, z0, SZ, 40, 0.6), mat), lo = new THREE.Mesh(chunkGeo(x0, z0, SZ, 10, 0.9), mat);
    for (const m of [hi, lo]) { m.receiveShadow = true; m.castShadow = true; }
    hi.geometry.computeBoundingSphere(); lo.geometry.computeBoundingSphere();
    lod.add(hi, lo); lod.userData.hi = hi; lod.userData.lo = lo;
    lod.userData.c = new THREE.Vector3(x0 + SZ / 2, 0, z0 + SZ / 2);
    group.add(lod);
  }
  // LOD distance is measured from each LOD object origin (0,0,0), so drive levels manually from chunk centres.
  const cp = new THREE.Vector3();
  const update = (camera) => { camera.getWorldPosition(cp); for (const l of group.children) { const c = l.userData.c, d = Math.hypot(c.x - cp.x, c.z - cp.z); const near = d < 46 + SZ * 0.5; l.userData.hi.visible = near; l.userData.lo.visible = !near; } };
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function (r, s, camera, ...rest) { prev && prev.call(this, r, s, camera, ...rest); update(camera); };
  const mesh = group;
  tickWind(group.children[0].userData.hi);
  scene.add(group);
  return mesh;
}

export { scatterNature } from './nature/index.js';
