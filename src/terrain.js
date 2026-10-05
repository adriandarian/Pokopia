import * as THREE from 'three';
import { fbm } from './noise.js';
import { POND, pathMask } from './nature/features.js';
import { tickWind } from './nature/wind.js';

export const WORLD = 128; // world size in units
const RES = 320;          // grid resolution

function baseHeight(x, z) {
  const nx = x / WORLD, nz = z / WORLD;
  const d = Math.hypot(nx, nz) * 2; // 0 at centre, 1 at edge
  const island = Math.max(0, 1 - Math.pow(d, 2.2));
  const hills = fbm(x * 0.03 + 10, z * 0.03 + 10, 5, 7);
  return island * (4 + hills * 14) - 3.2;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

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
        float n1 = fb(xz*.06), n2 = fb(xz*.35+7.), n3 = vn(xz*2.7), fine = vn(xz*vec2(22.,22.)), streak = vn(vec2(xz.x*38., xz.y*5.));
        vec3 nrm = normalize(vN); float slope = 1. - nrm.y;
        // grass: layered painterly greens
        vec3 grass = mix(vec3(.31,.66,.22), vec3(.52,.82,.28), smoothstep(.25,.75,n1));
        grass = mix(grass, vec3(.22,.55,.27), smoothstep(.5,.85,n2)*.55);
        grass = mix(grass, vec3(.72,.88,.34), smoothstep(.62,.9,fb(xz*.9+3.))*.28);
        grass *= .9 + .2*fine; grass *= .94 + .1*streak;
        // sand with ripples
        vec3 sand = mix(vec3(.95,.84,.6), vec3(.99,.91,.7), n2);
        sand *= .95 + .07*fine + .035*sin((xz.x*.9+xz.y*.55)*2.4 + n1*9.);
        float wet = smoothstep(1.05, -.25, h + (n3-.5)*.35);
        sand = mix(sand, sand*vec3(.66,.6,.52), wet);
        sand = mix(sand, vec3(.42,.72,.66), smoothstep(-.5,-2.6,h)*.9);
        float gm = smoothstep(.95, 1.7, h + (n2-.5)*.8);
        vec3 col = mix(sand, grass, gm);
        col = mix(col, col*vec3(1.08,1.02,.8), smoothstep(.3,.0,abs(gm-.5)-.2)*.6);
        // rock: layered strata on steep faces / peaks
        float rockM = smoothstep(.2,.36, slope + (n2-.5)*.1) + smoothstep(11.5,13.,h)*.6;
        rockM = clamp(rockM,0.,1.);
        float band = sin(h*7. + n1*7. + n3*1.2);
        vec3 rockC = mix(vec3(.66,.6,.55), vec3(.5,.43,.4), smoothstep(-.4,.4,band));
        rockC = mix(rockC, vec3(.78,.7,.6), smoothstep(.55,.9,fb(xz*.8+h))*.3);
        rockC *= .92 + .16*vn(vec2(xz.x+xz.y, h*3.)*4.);
        col = mix(col, rockC, rockM);
        // pond bank / mud
        float pd = length(xz - uPond.xy)/uPond.z;
        float bank = smoothstep(1.5, .95, pd + (n2-.5)*.25) * (1.-rockM);
        vec3 mud = mix(vec3(.5,.38,.26), vec3(.6,.5,.34), n2);
        col = mix(col, mud*(.9+.2*fine), bank*smoothstep(uPond.w+.9, uPond.w+.05, h)*.9);
        col = mix(col, mix(vec3(.28,.5,.45), vec3(.18,.42,.4), smoothstep(uPond.w, uPond.w-1.2, h)), smoothstep(uPond.w+.05, uPond.w-.15, h)*smoothstep(1.4,1.,pd));
        // dirt path
        float pv = vP + (n3-.5)*.22;
        float pm = smoothstep(.42,.56,pv);
        float edge = smoothstep(.3,.42,pv) - pm;
        vec3 pathC = mix(vec3(.86,.72,.5), vec3(.78,.63,.43), n2)*(.93+.12*fine);
        pathC = mix(pathC, vec3(.7,.64,.58), step(.93, vn(xz*9.))*.5);
        col = mix(col, col*.8, edge*.7);
        col = mix(col, pathC, pm*(1.-rockM*.6));
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
