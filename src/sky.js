import * as THREE from 'three';
import { WORLD, heightAt } from './terrain.js';
import { buildAmbientLife } from './fx/life.js';
import { world } from './chars/fx.js';

const WATER_Y = -0.4;
const DAY_SECONDS = 660, NIGHT_SECONDS = 150; // real seconds for daylight (5.2h-19.2h) and for night: ~13.5 min/day, mostly golden daylight
const C = (h) => new THREE.Color(h);

// Palette keyframes keyed by sun elevation. Hexes are sRGB (converted to linear by THREE.Color) so night/dusk
// values are deliberately bright: lit surfaces still multiply by low albedo.
const KEYS = [
  { e: -0.45, zen: C('#0a1238'), hor: C('#1d3470'), sun: C('#a8c4ff'), fog: C('#1d3470'), amb: 1.2, hemiSky: C('#8db0e4'), hemiGnd: C('#44546a'), exp: 1.3, tint: C('#f0f3ff'), fill: 0.55 },
  { e: -0.15, zen: C('#2a3a8a'), hor: C('#d98a86'), sun: C('#ff8a60'), fog: C('#8a6a9c'), amb: 1.5, hemiSky: C('#b498e0'), hemiGnd: C('#5c4c6c'), exp: 1.45, tint: C('#ffd2e4'), fill: 0.55 },
  { e: -0.02, zen: C('#3a54b0'), hor: C('#ff8446'), sun: C('#ff9a60'), fog: C('#e8906c'), amb: 1.45, hemiSky: C('#ffc0a4'), hemiGnd: C('#8a6a66'), exp: 1.3, tint: C('#ffe2d0'), fill: 0.4 },
  { e: 0.12,  zen: C('#3f78d8'), hor: C('#ffc080'), sun: C('#ffc490'), fog: C('#f6c090'), amb: 1.3, hemiSky: C('#ffdcc0'), hemiGnd: C('#7c8660'), exp: 1.12, tint: C('#fff0e0'), fill: 0.3 },
  { e: 0.35,  zen: C('#3584ea'), hor: C('#a8d2fa'), sun: C('#ffe9c0'), fog: C('#b4d8f8'), amb: 1.1, hemiSky: C('#bfe0ff'), hemiGnd: C('#6a8a54'), exp: 1.0, tint: C('#fff6ea'), fill: 0.25 },
  { e: 1.0,   zen: C('#1e78ec'), hor: C('#94c8f8'), sun: C('#fff0d4'), fog: C('#a6d2f8'), amb: 1.05, hemiSky: C('#bcdcff'), hemiGnd: C('#6a8a54'), exp: 1.0, tint: C('#fff8f0'), fill: 0.25 },
];
const SUNI = [0, 0.6, 2.2, 2.8, 3.0, 3.0]; // sun light intensity per key
// Sunrise 5.2h, sunset 19.2h; longer, slower night arc so dusk/golden hour sits around 18-19.5h.
function sunAngle(h) {
  const SR = 5.2, SS = 19.2;
  if (h >= SR && h <= SS) return (h - SR) / (SS - SR) * Math.PI;
  const n = h >= SS ? h - SS : h + 24 - SS;
  return Math.PI + n / 10 * Math.PI;
}

function sampleKeys(e, out) {
  let i = 0;
  while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = THREE.MathUtils.clamp((e - a.e) / (b.e - a.e), 0, 1), s = t * t * (3 - 2 * t);
  for (const k of ['zen', 'hor', 'sun', 'fog', 'hemiSky', 'hemiGnd', 'tint']) out[k].copy(a[k]).lerp(b[k], s);
  out.amb = THREE.MathUtils.lerp(a.amb, b.amb, s);
  out.exp = THREE.MathUtils.lerp(a.exp, b.exp, s);
  out.fill = THREE.MathUtils.lerp(a.fill, b.fill, s);
  out.sunI = THREE.MathUtils.lerp(SUNI[i], SUNI[i + 1], s);
  return out;
}

// Lumpy cauliflower alpha blob (shading is done per-puff in the cloud shader from sun direction).
function puffTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const r = (() => { let q = 11; return () => (q = (q * 16807) % 2147483647) / 2147483647; })();
  const blob = (x, y, rad, a) => {
    const grd = g.createRadialGradient(x, y, rad * 0.15, x, y, rad);
    grd.addColorStop(0, `rgba(255,255,255,${a})`); grd.addColorStop(0.6, `rgba(255,255,255,${a * 0.75})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
  };
  blob(64, 64, 46, 1);
  for (let i = 0; i < 9; i++) { const a = r() * 6.283, d = 18 + r() * 14; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 16 + r() * 10, 0.95); }
  const t = new THREE.CanvasTexture(cv); return t;
}

// Depth lookup texture of the sea floor, so the water shader can colour by depth and draw shoreline foam.
function floorTexture() {
  const N = 256, data = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = ((i + 0.5) / N - 0.5) * WORLD, z = ((j + 0.5) / N - 0.5) * WORLD;
    const h = THREE.MathUtils.clamp(heightAt(x, z), -3.2, 2.8);
    data[j * N + i] = Math.round((h + 3.2) / 6 * 255);
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

// Global 'leaf dapple': modulates the sun's direct light with soft world-space noise in every lit material
// (trees, grass, ground, props) via a ShaderChunk patch - no per-material work or extra uniforms needed.
let dapplePatched = false;
function patchDapple() {
  if (dapplePatched) return; dapplePatched = true;
  const SC = THREE.ShaderChunk;
  SC.lights_pars_begin += `
  float dpH(vec3 p){p=fract(p*.3183+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
  float dpN(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
    return mix(mix(mix(dpH(i),dpH(i+vec3(1,0,0)),f.x),mix(dpH(i+vec3(0,1,0)),dpH(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(dpH(i+vec3(0,0,1)),dpH(i+vec3(1,0,1)),f.x),mix(dpH(i+vec3(0,1,1)),dpH(i+vec3(1,1,1)),f.x),f.y),f.z);}
  float sunDapple(vec3 wp){float n=dpN(wp*vec3(.55,.35,.55))*.6+dpN(wp*1.7)*.4;return mix(.8,1.,smoothstep(.3,.65,n));}`;
  SC.lights_fragment_begin = SC.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );',
    `getDirectionalLightInfo( directionalLight, directLight );
		#if UNROLLED_LOOP_INDEX == 0
		directLight.color *= sunDapple( transpose( mat3( viewMatrix ) ) * ( -vViewPosition ) + cameraPosition );
		#endif`);
}

export function buildSky(scene) {
  patchDapple();
  scene.background = new THREE.Color('#9fd8ff');
  scene.fog = new THREE.Fog('#a6d2f8', 160, 720);
  const hemi = new THREE.HemisphereLight('#cfeaff', '#7a9a5a', 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d0', 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera; const SH = 38; sc.left = -SH; sc.right = SH; sc.top = SH; sc.bottom = -SH; sc.near = 1; sc.far = 320;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05; sun.shadow.radius = 4; sun.shadow.blurSamples = 12;
  sun.shadow.intensity = 0.9; // soft, coloured shadows: the rest of the shadow darkness comes from hemi + fill
  sun.shadow.autoUpdate = false; sun.shadow.needsUpdate = true; // re-render the shadow map every 2nd frame (halves ~560 shadow draw calls)
  scene.add(sun); scene.add(sun.target);
  // shadow frustum follows the player, snapped to shadow-texel increments in light space (no shimmer)
  const lR = new THREE.Vector3(), lU = new THREE.Vector3(), lc = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
  function placeSun(dir) {
    const texel = (2 * SH) / sun.shadow.mapSize.x;
    lR.crossVectors(UPV, dir).normalize(); lU.crossVectors(dir, lR).normalize();
    const cam = window.__game && window.__game.camera;
    if (cam) { cam.getWorldDirection(lc); lc.y = Math.min(lc.y, 0); lc.normalize().multiplyScalar(20).add(cam.position); lc.y = 0; } // view-centre ground point ~ player in 3rd person
    else lc.copy(world.playerPos);
    const r = Math.round(lc.dot(lR) / texel) * texel, u = Math.round(lc.dot(lU) / texel) * texel, d = lc.dot(dir);
    lc.set(0, 0, 0).addScaledVector(lR, r).addScaledVector(lU, u).addScaledVector(dir, d);
    sun.target.position.copy(lc); sun.target.updateMatrixWorld();
    sun.position.copy(lc).addScaledVector(dir, 130);
  }
  // cool fill / rim from the side opposite the sun (sky bounce by day, moon rim by night); no shadows
  const fill = new THREE.DirectionalLight('#a898ff', 0.3);
  scene.add(fill);

  const state = {
    hour: 9.5, auto: true,
    zen: new THREE.Color(), hor: new THREE.Color(), sun: new THREE.Color(), fog: new THREE.Color(),
    hemiSky: new THREE.Color(), hemiGnd: new THREE.Color(), tint: new THREE.Color(),
    amb: 1, exp: 1, sunI: 1, dapple: 'global (ShaderChunk patch)', e: 0.5, dir: new THREE.Vector3(), bloom: 0.28, night: 0, dusk: 0,
  };
  scene.userData.sky = state;

  // ---------- sky dome ----------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { zen: { value: state.zen }, hor: { value: state.hor }, sunCol: { value: state.sun }, sunDir: { value: state.dir }, night: { value: 0 }, dusk: { value: 0 }, time: { value: 0 } },
    vertexShader: 'varying vec3 v;void main(){v=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform vec3 zen,hor,sunCol,sunDir;uniform float night,dusk,time;varying vec3 v;
      float h31(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
      void main(){
        vec3 d=normalize(v);
        float y=max(d.y,0.);
        vec3 col=mix(hor,zen,pow(y,.5));
        float sd=max(dot(d,sunDir),0.);
        float az=pow(max(dot(normalize(d.xz+1e-4),normalize(sunDir.xz+1e-4)),0.),2.)*.75+.25;
        // multi-band dusk: orange rim, rose, violet, deep blue
        float w1=exp(-y*30.), w2=exp(-pow((y-.07)/.05,2.)), w3=exp(-pow((y-.16)/.08,2.));
        col=mix(col,vec3(1.,.28,.05),clamp(dusk*w1*az*.95,0.,1.));
        col=mix(col,vec3(.9,.2,.38),clamp(dusk*w2*az*.55,0.,1.));
        col=mix(col,vec3(.3,.14,.55),clamp(dusk*w3*(.35+.65*az)*.8,0.,1.));
        // sun glow + disc
        float glow=pow(sd,5.)*.3+pow(sd,40.)*.55+pow(sd,300.)*1.4;
        float up=smoothstep(-.08,.05,d.y);
        col+=sunCol*glow*up*(1.-.4*y);
        col=mix(col,col*.55+hor*.45,smoothstep(0.,-.35,d.y));
        float disc=smoothstep(.9986,.9993,sd)*up;
        col=mix(col,sunCol*7.,disc);
        if(night>.01&&d.y>0.){
          vec3 sp=d*160.; vec3 id=floor(sp); float r=h31(id);
          vec3 f=fract(sp)-.5;
          float star=step(.985,r)*smoothstep(.45,0.,length(f))*(.6+.4*sin(time*2.+r*60.));
          col+=vec3(.9,.95,1.)*star*night*smoothstep(0.,.25,d.y)*1.6;
        }
        float md=max(dot(d,-sunDir),0.);
        col+=vec3(.85,.9,1.)*smoothstep(.9990,.9995,md)*night*2.+vec3(.4,.5,.8)*pow(md,120.)*night*.5;
        gl_FragColor=vec4(col,1.);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), skyMat);
  dome.frustumCulled = false; dome.renderOrder = -10;
  dome.onBeforeRender = (r, s, cam) => dome.position.copy(cam.position);
  scene.add(dome);

  // ---------- clouds: ONE instanced draw call, billboarded puffs shaded per-puff from sun direction ----------
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const puffs = [];
  const NC = 40;
  for (let i = 0; i < NC; i++) {
    const low = i % 2 === 0;
    const w = (low ? 26 : 16) + rnd() * 24, n = 14 + Math.floor(rnd() * 8);
    const a = rnd() * Math.PI * 2, r = low ? 120 + rnd() * 220 : 90 + rnd() * 120;
    const cx = Math.cos(a) * r, cy = low ? 30 + rnd() * 18 : 46 + rnd() * 24, cz = Math.sin(a) * r;
    const hgt = w * 0.32;
    for (let j = 0; j < n; j++) {
      const u = rnd() * 2 - 1, hump = Math.sqrt(Math.max(1 - u * u, 0));
      const py = hump * hgt * (0.3 + rnd() * 0.9), pz = (rnd() - 0.5) * w * 0.35;
      const sz = (w * 0.4 + rnd() * w * 0.3) * (0.55 + hump * 0.6);
      const l = new THREE.Vector3(u, (py / hgt) * 1.4 - 0.45, pz / w * 2).normalize();
      puffs.push({ x: cx + u * w, y: cy + py, z: cz + pz, sx: sz * 1.3, sy: sz * 0.95, l, s: rnd() });
    }
  }
  const NP = puffs.length;
  const cg = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  cg.index = quad.index;
  cg.setAttribute('position', quad.getAttribute('position'));
  cg.setAttribute('uv', quad.getAttribute('uv'));
  const aPos = new Float32Array(NP * 3), aSc = new Float32Array(NP * 2), aLoc = new Float32Array(NP * 3), aSeed = new Float32Array(NP);
  puffs.forEach((p, i) => { aPos.set([p.x, p.y, p.z], i * 3); aSc.set([p.sx, p.sy], i * 2); aLoc.set([p.l.x, p.l.y, p.l.z], i * 3); aSeed[i] = p.s; });
  cg.setAttribute('iPos', new THREE.InstancedBufferAttribute(aPos, 3));
  cg.setAttribute('iSc', new THREE.InstancedBufferAttribute(aSc, 2));
  cg.setAttribute('iLoc', new THREE.InstancedBufferAttribute(aLoc, 3));
  cg.setAttribute('iSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
  cg.instanceCount = NP;
  const cloudMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { map: { value: puffTexture() }, sunDir: { value: state.dir }, litCol: { value: new THREE.Color() }, shadCol: { value: new THREE.Color() }, hor: { value: state.hor }, drift: { value: 0 } },
    vertexShader: `attribute vec3 iPos,iLoc;attribute vec2 iSc;attribute float iSeed;uniform float drift;uniform vec3 sunDir;
      varying vec2 vUv;varying float vLit,vDist,vSeed;
      void main(){
        vec3 p=iPos;p.x=mod(p.x+drift*(.7+iSeed*.0)+420.,840.)-420.; p.y+=sin(drift*.02+iPos.x*.05)*.8;
        vec4 mv=viewMatrix*vec4(p,1.);
        float a=iSeed*6.283,c=cos(a),s=sin(a);
        vec2 q=position.xy;q=vec2(c*q.x-s*q.y,s*q.x+c*q.y);
        mv.xy+=q*iSc;
        gl_Position=projectionMatrix*mv;
        vUv=uv;vDist=length(p-cameraPosition);vSeed=iSeed;
        vLit=clamp(.5+.55*dot(normalize(iLoc),sunDir)+.2*iLoc.y,0.,1.);
      }`,
    fragmentShader: `uniform sampler2D map;uniform vec3 litCol,shadCol,hor;varying vec2 vUv;varying float vLit,vDist,vSeed;
      void main(){
        float a=texture2D(map,vUv).a;
        float gy=vUv.y; // bright tops, shaded bellies on every puff
        vec3 col=mix(shadCol,litCol,smoothstep(.05,.95,clamp(vLit+(gy-.5)*.55,0.,1.)));
        col+=litCol*(1.-smoothstep(0.,.5,texture2D(map,vUv).a))*.25;
        col=mix(col,hor,smoothstep(160.,480.,vDist)*.55);
        gl_FragColor=vec4(col,a*.9*(1.-smoothstep(420.,560.,vDist)));
      }`,
  });
  const clouds = new THREE.Mesh(cg, cloudMat);
  clouds.frustumCulled = false; clouds.renderOrder = -5;
  scene.add(clouds);

  // ---------- water ----------
  const floorTex = floorTexture();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    transparent: true, fog: true, depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      time: { value: 0 }, floorTex: { value: floorTex },
      shallow: { value: new THREE.Color('#7ff0e0') }, deep: { value: new THREE.Color('#1a6fc0') },
      zen: { value: state.zen }, hor: { value: state.hor }, sunCol: { value: state.sun }, sunDir: { value: state.dir },
      light: { value: 1 },
    }]),
    vertexShader: `varying vec3 w;
      #include <fog_pars_vertex>
      void main(){vec4 wp=modelMatrix*vec4(position,1.);w=wp.xyz;vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time;uniform float light;uniform vec3 shallow,deep,zen,hor,sunCol,sunDir;uniform sampler2D floorTex;varying vec3 w;
      #include <fog_pars_fragment>
      float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
      float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      vec3 skyCol(vec3 d){
        float y=max(d.y,0.);
        vec3 col=mix(hor,zen,pow(y,.5));
        float sd=max(dot(d,sunDir),0.);
        float glow=pow(sd,5.)*.3+pow(sd,40.)*.55;
        return col+sunCol*glow*(1.-.4*y);
      }
      vec2 ripple(vec2 p,float t){
        vec2 g=vec2(0.);
        g+=vec2(cos(p.x*.9+t*1.1),sin(p.y*.8-t*.9))*.10;
        g+=vec2(cos(dot(p,vec2(.7,.7))*1.7-t*1.6),cos(dot(p,vec2(.7,.7))*1.7-t*1.6))*.05;
        float a=vn(p*1.3+vec2(t*.3,-t*.2)),b=vn(p*1.3+vec2(5.2,1.3)-vec2(t*.25,t*.35));
        g+=vec2(a-.5,b-.5)*.35;
        float a2=vn(p*3.7+vec2(-t*.5,t*.4)),b2=vn(p*3.7+vec2(9.,3.)+vec2(t*.45,t*.3));
        g+=vec2(a2-.5,b2-.5)*.18;
        return g;
      }
      void main(){
        vec2 uv=w.xz/${WORLD.toFixed(1)}+.5;
        vec3 V=normalize(cameraPosition-w);
        float fh=texture2D(floorTex,uv).r*6.-3.2;
        float depth=max(w.y-fh,0.);   // w.y breathes with the tide, so the waterline runs up/down the beach
        vec2 q=abs(uv-.5);
        if(max(q.x,q.y)>.5) depth=3.;
        vec2 g=ripple(w.xz,time);
        float dist=length(cameraPosition-w);
        g*=mix(1.,.25,smoothstep(40.,220.,dist))*mix(.4,1.,clamp(V.y*2.,0.,1.));
        vec3 Ns=normalize(vec3(-g.x*.9,1.,-g.y*.9));
        vec3 N=normalize(vec3(-g.x*.55,1.,-g.y*.55));
        float dd=1.-exp(-depth*.75);
        float pat=vn(w.xz*.035+vec2(time*.01,0.))*.6+vn(w.xz*.09-vec2(0.,time*.015))*.4;
        vec3 col=mix(shallow,deep,dd);
        col=mix(col,deep*vec3(.7,.9,1.15),smoothstep(.35,.8,pat)*dd*.6); // deep-water colour patches
        col=mix(col,shallow*vec3(1.1,1.05,.8),(1.-smoothstep(0.,.6,depth))*.5); // sandy refraction tint at the rim
        vec3 R=reflect(-V,N); R.y=abs(R.y);
        vec3 skyc=skyCol(R);
        float fres=.03+.97*pow(1.-max(dot(V,N),0.),4.);
        col*=light*mix(vec3(1.),sunCol,.4);
        col=mix(col,skyc,clamp(fres,0.,.66));
        vec3 Rs=reflect(-V,Ns); Rs.y=abs(Rs.y); float sds=max(dot(Rs,sunDir),0.);
        float spec=pow(sds,300.)*4.+pow(sds,60.)*.3+pow(sds,14.)*.12;
        float sparkle=smoothstep(.55,.9,vn(w.xz*5.+time*vec2(.8,.5)))*smoothstep(.5,.95,vn(w.xz*2.3-time*.6));
        float glit=smoothstep(.72,.95,vn(w.xz*11.+time*vec2(1.1,.7)))*smoothstep(.6,.95,vn(w.xz*3.1-time*.5));
        col+=sunCol*(spec*(.4+sparkle*1.6)+glit*pow(sds,10.)*2.2);
        float streak=smoothstep(.62,.8,vn(vec2(w.x*.35+time*.12,w.z*.04)))*smoothstep(.55,.75,vn(w.xz*.6+time*.1))*smoothstep(3.,.8,dist/60.)*smoothstep(.3,1.2,depth);
        col=mix(col,vec3(.9,1.,1.)*(.4+.6*light),streak*.08*(1.-smoothstep(.8,3.,depth)));
        // shoreline: depth-faded foam with lace, thin bright leading edge, dark wet film
        float n=vn(w.xz*1.4+time*.2);
        float wash=.5+.5*sin(time*.9+n*3.);
        float edge=depth+n*.10;
        float lace=smoothstep(.40,.75,vn(w.xz*7.+vec2(time*.15,-time*.1)));
        float lead=smoothstep(.16,.0,edge)*(.6+.4*wash);
        float trail=smoothstep(.20+wash*.32,.02,edge)*(.35+.65*lace);
        float band=smoothstep(.05,.0,abs(edge-(.55+wash*.4))-.03)*.5*lace*smoothstep(1.,.3,depth);
        float f=clamp(lead*.95+trail*.85+band*smoothstep(1.4,.4,depth),0.,1.)*(1.-smoothstep(.0,1.3,depth)*.4);
        float film=smoothstep(.16,.0,depth);
        float recede=smoothstep(.5,1.,1.-wash);
        col=mix(col,col*vec3(.5,.44,.36),smoothstep(.34,.0,depth)*(.45+.4*recede)); // dark wet band where waves recede
        col=mix(col,vec3(.97,1.,1.)*(.45+.55*light),f);
        float alpha=mix(.28,1.,smoothstep(0.,1.6,depth));
        alpha=mix(alpha,.55,film*.4);
        alpha=max(alpha,f*.92);
        alpha*=smoothstep(.0,.12,depth+f*.12); // long soft fade: no hard waterline seam
        gl_FragColor=vec4(col,alpha);
        #include <fog_fragment>
      }`,
  }));
  // merge() clones uniform values; re-link the shared state colours
  Object.assign(water.material.uniforms, { zen: { value: state.zen }, hor: { value: state.hor }, sunCol: { value: state.sun }, sunDir: { value: state.dir } });
  water.position.y = WATER_Y; water.renderOrder = 1; scene.add(water);

  const life = buildAmbientLife(scene, state);

  // ---------- update ----------
  const tmp = { zen: C('#fff'), hor: C('#fff'), sun: C('#fff'), fog: C('#fff'), hemiSky: C('#fff'), hemiGnd: C('#fff'), tint: C('#fff') };
  const moonDir = new THREE.Vector3(), ld = new THREE.Vector3(), cl = new THREE.Color(), WHITE = new THREE.Color('#ffffff'), MOONLIT = new THREE.Color('#8ea6e8'), PURP = new THREE.Color('#a39aff');
  const SM = THREE.MathUtils.smoothstep;
  function apply() {
    const a = sunAngle(state.hour);
    state.dir.set(Math.cos(a) * 0.9, Math.sin(a) * 0.8, 0.42).normalize(); // noon elevation ~62 deg so shadows stay readable
    const e = state.e = state.dir.y;
    const k = sampleKeys(e, tmp);
    state.zen.copy(k.zen); state.hor.copy(k.hor); state.sun.copy(k.sun);
    state.hemiSky.copy(k.hemiSky); state.hemiGnd.copy(k.hemiGnd); state.tint.copy(k.tint);
    state.exp = k.exp; state.amb = k.amb;
    state.fog.copy(k.fog);
    scene.fog.color.copy(k.fog); scene.background.copy(k.hor);
    scene.fog.near = 160 + 40 * Math.max(e, 0); scene.fog.far = 720 + 80 * Math.max(e, 0);
    hemi.color.copy(k.hemiSky); hemi.groundColor.copy(k.hemiGnd); hemi.intensity = k.amb * 1.18;
    if (e > -0.12) {
      ld.copy(state.dir); ld.y = Math.max(ld.y, 0.07); ld.normalize();
      placeSun(ld); sun.color.copy(k.sun);
      sun.intensity = k.sunI * SM(e, -0.12, 0.0);
    } else {
      moonDir.copy(state.dir).negate(); moonDir.y = Math.max(moonDir.y, 0.45); moonDir.normalize();
      placeSun(moonDir); sun.color.set('#9bb4ff');
      sun.intensity = 0.85 * SM(e, -0.12, -0.24);
    }
    // fill: opposite side of the sun, cool
    fill.position.set(-state.dir.x * 100, 40, -state.dir.z * 100);
    const nf = SM(e, -0.2, 0.04); // 0 at night, 1 by day
    fill.color.set('#9fbcf4').lerp(WHITE, 0.3 * (1 - nf)).lerp(PURP, 0.35 * nf).lerp(k.hemiSky, 0.2 * nf); fill.intensity = k.fill * (0.75 + 0.75 * nf);
    const night = 1 - SM(e, -0.2, 0.04);
    skyMat.uniforms.night.value = night;
    state.dusk = skyMat.uniforms.dusk.value = THREE.MathUtils.clamp(1 - Math.abs(e + 0.02) / 0.28, 0, 1);
    water.material.uniforms.light.value = 0.6 + 0.4 * SM(e, -0.15, 0.3);
    state.night = night;
    state.bloom = 0.24 + 0.2 * state.dusk - 0.06 * night;
    // clouds: sunlit side takes sun colour, shaded side is cool sky colour
    const day = 0.3 + 0.7 * SM(e, -0.25, 0.2);
    cl.copy(k.sun).lerp(WHITE, 0.5 * (1 - state.dusk * 0.45)).lerp(MOONLIT, night * 0.6).multiplyScalar(day * 1.05);
    cloudMat.uniforms.litCol.value.copy(cl);
    cloudMat.uniforms.shadCol.value.copy(k.zen).lerp(k.hor, 0.5).lerp(WHITE, 0.25).multiplyScalar(0.62 * day + 0.12);
  }

  let last = 0, driftX = 0, fr = 0;
  const api = {
    sun, water, clouds, state, life,
    setHour(h) { state.hour = h; state.auto = false; apply(); sun.shadow.needsUpdate = true; },
    update(t) {
      const dt = Math.min(Math.max(t - last, 0), 0.1); last = t;
      if (state.auto) {
        const isDay = state.hour >= 5.2 && state.hour < 19.2;
        state.hour = (state.hour + dt * (isDay ? 14 / DAY_SECONDS : 10 / NIGHT_SECONDS)) % 24;
      }
      apply(); sun.shadow.needsUpdate = true;
      water.material.uniforms.time.value = t; skyMat.uniforms.time.value = t;
      water.position.y = WATER_Y + 0.07 * (0.5 + 0.5 * Math.sin(t * 0.7)) + 0.03 * Math.sin(t * 0.31 + 1);
      driftX += dt * 1.3; cloudMat.uniforms.drift.value = driftX;
      life.update(dt, t);
    },
  };
  window.__sky = api;
  apply();
  return api;
}
