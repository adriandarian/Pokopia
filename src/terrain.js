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
  const cliff = sstep(0.54, 0.66, fbm(x * 0.035 - 8, z * 0.035 + 4, 2, 9)) * sstep(1.8, 3.6, h) * (1 - m) * sstep(3, 9, routeDist(x, z));
  const T = 3.4, t = h / T, f = t - Math.floor(t);
  h += ((Math.floor(t) + sstep(0.45, 0.88, f)) * T - h) * cliff * 0.9;
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

export function buildTerrain(scene) {
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, RES, RES);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, mask = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z);
    pos.setY(i, h);
    mask[i] = h > 0.8 ? pathMask(x, z) : 0;
  }
  geo.setAttribute('aMask', new THREE.BufferAttribute(mask, 1));
  geo.computeVertexNormals();

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
        // rock: layered strata on steep faces, ledge faces and summit stones
        float rockM = smoothstep(.28,.55, slope + (n2-.5)*.12);
        float band = sin(h*5.5 + n1*5. + n3*1.1);
        vec3 rockC = mix(vec3(.62,.56,.52), vec3(.46,.4,.38), smoothstep(-.5,.5,band));
        rockC = mix(rockC, vec3(.8,.72,.58), smoothstep(.55,.9,fb(wq*.8+h))*.28);
        rockC = mix(rockC, vec3(.4,.52,.34), smoothstep(.55,.9,n2)*.25*(1.-slope*2.)); // moss
        rockC *= .9 + .2*vn(vec2(xz.x+xz.y, h*3.)*4.);
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
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true; mesh.castShadow = true;
  mesh.frustumCulled = false;
  tickWind(mesh);
  scene.add(mesh);
  return mesh;
}

export { scatterNature } from './nature/index.js';
