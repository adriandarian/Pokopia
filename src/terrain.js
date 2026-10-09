import * as THREE from 'three';
import { fbm } from './noise.js';
import { POND, pathMask, meadowMask, SUMMIT, routeDist } from './nature/features.js';
import { tickWind } from './nature/wind.js';
import { onTierChange, setCaster } from './quality.js';

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
  const cliff = sstep(0.44, 0.52, fbm(x * 0.035 - 8, z * 0.035 + 4, 2, 9)) * sstep(1.8, 3.6, h) * (1 - m) * sstep(2.5, 6, routeDist(x, z));
  const ramp = 1 - sstep(0.64, 0.74, fbm(x * 0.055 + 30, z * 0.055 - 7, 2, 21)); // gaps in the ledges act as walkable ramps
  const T = 3.0, t = h / T + (fbm(x * 0.18, z * 0.18, 2, 3) - 0.5) * 0.1, f = t - Math.floor(t);
  h += ((Math.floor(t) + sstep(0.5, 0.86, f)) * T - h) * cliff * ramp;
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
  const n = seg + 1, pos = [], nor = [], msk = [], lip = [], foot = [], ao = [], idx = [];
  const push = (x, z, drop) => {
    const h = heightAt(x, z);
    pos.push(x, h - drop, z);
    const e = 0.5, dx = heightAt(x + e, z) - heightAt(x - e, z), dz = heightAt(x, z + e) - heightAt(x, z - e);
    const l = Math.hypot(dx, 2 * e, dz); nor.push(-dx / l, 2 * e / l, -dz / l);
    msk.push(h > 0.8 ? pathMask(x, z) : 0);
    // ledge lip (top edge of a drop) and foot (bottom of a rise), from neighbours ~1 m away
    let mn = h, mx = h;
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = heightAt(x + ox, z + oz); if (q < mn) mn = q; if (q > mx) mx = q; }
    lip.push(sstep(0.7, 1.5, h - mn)); foot.push(sstep(0.7, 1.5, mx - h));
    let av = 0; for (const [ox, oz] of [[2.2, 0], [-2.2, 0], [0, 2.2], [0, -2.2], [1.6, 1.6], [-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6]]) av += heightAt(x + ox, z + oz);
    ao.push(Math.max(0, Math.min(1, (av / 8 - h) * 0.45))); // concavity: valley floors and ledge feet get darker
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
  g.setAttribute('aLip', new THREE.Float32BufferAttribute(lip, 1));
  g.setAttribute('aFoot', new THREE.Float32BufferAttribute(foot, 1));
  g.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
  g.setIndex(idx);
  return g;
}

export function buildTerrain(scene) {
  const CH = 6, SZ = WORLD / CH;
  // baked, smoothly filtered path distance field (fragment shader samples it; avoids vertex-interpolated stair-stepping)
  const PN = 512, pd8 = new Uint8Array(PN * PN * 4);
  for (let j = 0; j < PN; j++) for (let i = 0; i < PN; i++) {
    const x = (i + 0.5) / PN * WORLD - WORLD / 2, z = (j + 0.5) / PN * WORLD - WORLD / 2, k = (j * PN + i) * 4;
    pd8[k] = Math.round(pathMask(x, z) * 255); pd8[k + 3] = 255;
  }
  const pathTex = new THREE.DataTexture(pd8, PN, PN, THREE.RGBAFormat); pathTex.magFilter = THREE.LinearFilter; pathTex.minFilter = THREE.LinearFilter; pathTex.generateMipmaps = false; pathTex.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.97, metalness: 0 });
  const uNight = { value: 0 }; const uDetail = { value: 1 }; let nearD = 32; // quality: close-range ground detail layers on/off, distance of the high-res chunk ring
  onTierChange((p) => { uDetail.value = p.terrainDetail ? 1 : 0; nearD = p.terrainNear; });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = uDetail; sh.uniforms.uNight = uNight;
    sh.uniforms.uPath = { value: pathTex };
    sh.uniforms.uPond = { value: new THREE.Vector4(POND.x, POND.z, POND.r, POND_LEVEL) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aMask; attribute float aLip; attribute float aFoot; attribute float aAO; varying float vAO; varying float vLip; varying float vFoot; varying float vP; varying vec3 vW; varying vec3 vN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vP = aMask; vLip = aLip; vFoot = aFoot; vAO = aAO; vW = position; vN = normal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uDetail; uniform float uNight; uniform vec4 uPond; uniform sampler2D uPath; varying float vAO; varying float vLip; varying float vFoot; varying float vP; varying vec3 vW; varying vec3 vN;
        float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
        float fb(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+17.1; a*=.5; } return s; }
        vec3 vor(vec2 p){ vec2 i=floor(p), f=fract(p); float md=8.; vec2 mid=vec2(0.);
          for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g=vec2(float(x),float(y)); vec2 o=vec2(h21(i+g), h21(i+g+37.));
            vec2 r=g+o*.8+.1-f; float d=dot(r,r); if(d<md){ md=d; mid=i+g; } }
          return vec3(sqrt(md), h21(mid+3.1), h21(mid+9.7)); }
        float gRock = 0.; vec3 gBlk = vec3(0.);
        vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(normal + gBlk*.12*gRock);`)
      .replace('#include <color_fragment>', `
        vec2 xz = vW.xz; float h = vW.y;
        float pT = texture2D(uPath, (xz + 64.) / 128.).r;
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
        vec3 g2 = grass; float dn = 0.;
        if (uDetail > .5) {
        float dfade = smoothstep(48., 12., length(vViewPosition)) * smoothstep(.35, .1, 1. - normalize(vN).y);
        vec3 v1 = vor(xz*1.1 + (wq-xz)*.5), v2 = vor(xz*.21+5.);
        // flat painted patches (no round dabs): each polygonal cell gets a small tint shift
        g2 = grass * mix(vec3(1.), mix(vec3(.93,.98,.92), vec3(1.07,1.05,.9), v1.y), dfade);
        g2 *= 1. + dfade*(v1.z-.5)*.1;
        g2 = mix(g2, g2*vec3(1.14,1.05,.7), v2.y*.4);
        g2 = mix(g2, g2*vec3(.84,.98,1.0), smoothstep(.55,.9,v2.z)*.3);
        // crisp close-range layer (no extra triangles): grain, light/dark flecks and clover sprites within ~10 m
        dn = smoothstep(9., 2.5, length(vViewPosition));
        vec2 cc = floor(xz*70.); float grn = h21(cc); float bl = vn(xz*26.+wq);   // finer grain + soft blade-clump strokes instead of coarse mosaic squares
        g2 *= 1. + dn*((grn-.5)*.12 + (bl-.5)*.2 + step(.95, grn)*.1 - step(grn,.04)*.12);
        vec2 cl = xz*5.5, ci = floor(cl), cf = fract(cl) - .5; float ch = h21(ci+11.);
        vec2 co = (vec2(h21(ci+3.), h21(ci+7.)) - .5)*.4;
        float lobe = max(max(smoothstep(.17,.12,length(cf-co-vec2(.0,.1))), smoothstep(.17,.12,length(cf-co-vec2(.09,-.06)))), smoothstep(.17,.12,length(cf-co-vec2(-.09,-.06))));
        g2 = mix(g2, g2*vec3(.82,1.12,.82) + .03, lobe*step(.78,ch)*dn*.9);
        g2 = mix(g2, vec3(.95,.93,.8), smoothstep(.07,.04,length(cf-co))*step(.96,ch)*dn);   // tiny white clover bloom
        }
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
        // rock: warm tan / grey-beige stone. Tall irregular blocks from 3D cells (they follow the surface, no world-aligned stripes),
        // faint seams, low-contrast per-block value, very faint strata. Night: cool dark grey-blue (no warm brick).
        float rockM = max(smoothstep(.34,.5, slope), smoothstep(.45,1.1, vLip+vFoot)*.95);
        if (rockM > .004) {
          // slope-aligned block grid: u runs along the contour (perpendicular to the fall line), so vertical seams follow the surface
          vec2 nh = normalize(nrm.xz + 1e-4), tH = vec2(-nh.y, nh.x);
          float vdist = length(vViewPosition);
          float u = dot(xz, tH)*.62 + (n1-.5)*2.5 + (vn(vec2(h*.7, 5.)) - .5)*.8, cid = floor(u), fu = fract(u);
          float vv = h*.5 + h21(vec2(cid, 2.))*6., vid = floor(vv), fv = fract(vv);
          float bk = h21(vec2(cid, vid + 11.));
          float seamW = mix(.045, .2, smoothstep(10., 60., vdist)), sl = smoothstep(.12, .3, slope);
          float seam = (1. - smoothstep(.0, seamW, min(fu, 1. - fu)));
          seam = max(seam, (1. - smoothstep(.0, seamW*.8, min(fv, 1. - fv)))*step(.6, bk)*.35) * sl;
          vec3 vc = vec3(0., 1., bk);
          vec3 stoneA = vec3(.72,.66,.55), stoneB = vec3(.65,.62,.56);
          vec3 rockC = mix(stoneA, stoneB, smoothstep(.3,.7,vc.z)*.7);
          rockC *= .97 + .06*h21(vec2(vc.z*91., vc.z*17.));                  // per-block value, low contrast
          rockC *= 1. + .035*sin(h*4.6 + n1*5.);                                  // faint strata
          rockC *= .96 + .08*vn(xz*3.1 + h*2.3);                                 // soft grain
          rockC *= 1. - .11*seam*(1.-smoothstep(40.,90.,vdist));                 // subtle block seams
          rockC *= 1. + .13*vLip*(1.-vFoot);                                     // clean lighter lip
          rockC *= 1. - .22*vFoot*(1.-vLip);                                     // soft AO at the foot
          gRock = rockM; gBlk = vec3(vc.z-.5, h21(vec2(vc.z*13., 4.))-.5, h21(vec2(vc.z*7., 9.))-.5);
          float lum = dot(rockC, vec3(.3,.59,.11));
          rockC = mix(rockC, vec3(lum*1.15)*vec3(.88,.93,1.04), uNight*.85);          // night: cool grey-blue
          col = mix(col, rockC, rockM);
        }
        float pm0 = smoothstep(.45,.5, pT);
        // ledge lip: sunny yellow-green grass trim with a fringe, dark crevice at the foot
        float topFlat = smoothstep(.16,.04,slope);
        float fringe = smoothstep(.0,.5, vLip + (n3-.5)*.5);
        vec3 lipC = mix(vec3(.62,.72,.22), vec3(.78,.78,.3), n2);
        col = mix(col, lipC, fringe*topFlat*(1.-pm0)*.85);
        col *= 1. - .32*vFoot*(1.-vLip)*(1.+rockM*.2);
        col *= 1. - .14*smoothstep(.1,.3,slope)*(1.-rockM*.5);
        // pond bank / mud ring + underwater bed gradient
        float pd = length(xz - uPond.xy)/uPond.z;
        float bank = smoothstep(1.55, .95, pd + (n2-.5)*.3) * (1.-rockM);
        vec3 mud = mix(vec3(.8,.7,.5), vec3(.9,.8,.6), n2); mud = mix(mud, vec3(.62,.6,.57)*(.85+.3*vn(xz*14.)), step(.82, vn(xz*8.+3.))*.8);
        float shore = smoothstep(uPond.w+1.0, uPond.w+.05, h);
        col = mix(col, mud*(.88+.2*fine), bank*shore*.92);
        // sandy wet rim just above waterline
        col = mix(col, col*vec3(.72,.66,.56), bank*smoothstep(uPond.w+.3, uPond.w, h)*.6);
        float under = smoothstep(uPond.w+.05, uPond.w-.15, h)*smoothstep(1.5,1.,pd);
        col = mix(col, mix(vec3(.42,.5,.36), vec3(.05,.22,.28), smoothstep(uPond.w, uPond.w-1.3, h)), under);
        // dirt path: distance-field edge, soft grass overhang, muted tan; never painted up steep faces
        float pv = pT + (n3-.5)*.12 + (fine-.5)*.04;
        float aaw = max(fwidth(pv)*1.5, .03);
        float onFlat = smoothstep(.34, .2, slope);
        float pm = smoothstep(.46-aaw, .46+aaw, pv) * onFlat;
        float rim = (smoothstep(.26,.44,pv) - smoothstep(.44,.6,pv)) * onFlat;
        vec3 pathC = mix(vec3(.76,.68,.55), vec3(.66,.59,.48), n2)*(.94+.1*fine);
        pathC = mix(pathC, vec3(.66,.62,.57), step(.93, vn(xz*9.))*.4);
        pathC *= 1. - .1*smoothstep(.5,.7,pv);
        col = mix(col, col*vec3(.7,.84,.58), rim*.6*(1.-rockM));
        pathC *= 1. + dn*((h21(floor(xz*90.))-.5)*.14 + step(.93,h21(floor(xz*22.+4.)))*.1);
        col = mix(col, pathC*mix(.86,1.,smoothstep(.5,.62,pv)), pm*(1.-rockM));
        // baked AO: concave valley floors and ledge feet
        col *= 1. - .3*vAO*(1.-pm);
        diffuseColor.rgb *= lin(clamp(col,0.,1.));
      `);
  };
  const group = new THREE.Group();
  for (let cz = 0; cz < CH; cz++) for (let cx = 0; cx < CH; cx++) {
    const x0 = -WORLD / 2 + cx * SZ, z0 = -WORLD / 2 + cz * SZ;
    const lod = new THREE.Group();
    // the 32x32 'hi' chunk is built lazily the first time the camera gets near (it is ~85% of terrain build time); the cheap 10x10 one is always there
    const lo = new THREE.Mesh(chunkGeo(x0, z0, SZ, 10, 0.9), mat);
    lo.receiveShadow = true; setCaster(lo, 3, true); lo.geometry.computeBoundingSphere(); // terrain self-shadowing (hill/cliff shadows) is a high-tier feature
    lod.add(lo); lod.userData.hi = null; lod.userData.lo = lo; lod.userData.x0 = x0; lod.userData.z0 = z0;
    lod.userData.c = new THREE.Vector3(x0 + SZ / 2, 0, z0 + SZ / 2);
    group.add(lod);
  }
  // LOD distance is measured from each LOD object origin (0,0,0), so drive levels manually from chunk centres.
  const cp = new THREE.Vector3(); let budget = Infinity;   // first frame builds every nearby chunk at once, afterwards one per frame
  const buildHi = (l) => {
    const hi = new THREE.Mesh(chunkGeo(l.userData.x0, l.userData.z0, SZ, 32, 0.6), mat);
    hi.receiveShadow = true; setCaster(hi, 3, true); hi.geometry.computeBoundingSphere(); hi.visible = false;
    l.add(hi); l.userData.hi = hi;
  };
  const update = (camera) => {
    camera.getWorldPosition(cp); uNight.value = (scene.userData.sky && scene.userData.sky.night) || 0;
    for (const l of group.children) {
      const c = l.userData.c, d = Math.hypot(c.x - cp.x, c.z - cp.z), near = d < nearD + SZ * 0.5;
      if (!l.userData.hi && d < nearD + SZ * 0.5 + 14 && budget > 0) { buildHi(l); budget--; }   // pre-build a little before it is needed
      if (l.userData.hi) { l.userData.hi.visible = near; l.userData.lo.visible = !near; } else l.userData.lo.visible = true;
    }
    budget = 1;
  };
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function (r, s, camera, ...rest) { prev && prev.call(this, r, s, camera, ...rest); update(camera); };
  const mesh = group;
  tickWind(group.children[0].userData.lo);
  scene.add(group);
  return mesh;
}

export { scatterNature } from './nature/index.js';
