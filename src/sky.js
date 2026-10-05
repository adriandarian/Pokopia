import * as THREE from 'three';
import { WORLD, heightAt } from './terrain.js';
import { buildAmbientLife } from './fx/life.js';

const WATER_Y = -0.4;
const DAY_LENGTH = 360; // seconds per full day
const C = (h) => new THREE.Color(h);

// Palette keyframes keyed by sun elevation (sin of angle).
const KEYS = [
  { e: -0.30, zen: C('#050818'), hor: C('#10183a'), sun: C('#6a7bd0'), fog: C('#10183a'), amb: 1.0, hemiSky: C('#4a60b8'), hemiGnd: C('#1c2a3a'), exp: 1.45, tint: C('#c4d0ff') },
  { e: -0.08, zen: C('#1b2358'), hor: C('#c05a78'), sun: C('#ff7a4a'), fog: C('#8a5a8a'), amb: 0.8, hemiSky: C('#8a6aa8'), hemiGnd: C('#3a3038'), exp: 1.15, tint: C('#ffc8d8') },
  { e: 0.04,  zen: C('#4a62b8'), hor: C('#ff9a60'), sun: C('#ff9a50'), fog: C('#f0a880'), amb: 1.25, hemiSky: C('#ffc0a0'), hemiGnd: C('#8a6a50'), exp: 1.15, tint: C('#ffd2b0') },
  { e: 0.20,  zen: C('#3f84e0'), hor: C('#ffd9a8'), sun: C('#ffd59a'), fog: C('#ffdcb8'), amb: 1.2, hemiSky: C('#ffe3c0'), hemiGnd: C('#7a9a5a'), exp: 1.05, tint: C('#fff0dc') },
  { e: 0.55,  zen: C('#2f8cf0'), hor: C('#bfe6ff'), sun: C('#fff3da'), fog: C('#c4e8ff'), amb: 1.1, hemiSky: C('#cfeaff'), hemiGnd: C('#7a9a5a'), exp: 1.0, tint: C('#ffffff') },
  { e: 1.0,   zen: C('#2a86f0'), hor: C('#bfe6ff'), sun: C('#fff6e4'), fog: C('#c4e8ff'), amb: 1.1, hemiSky: C('#cfeaff'), hemiGnd: C('#7a9a5a'), exp: 1.0, tint: C('#ffffff') },
];
const SUNI = [0, 0.8, 2.4, 2.8, 2.8, 2.8]; // sun light intensity per key

function sampleKeys(e, out) {
  let i = 0;
  while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = THREE.MathUtils.clamp((e - a.e) / (b.e - a.e), 0, 1), s = t * t * (3 - 2 * t);
  for (const k of ['zen', 'hor', 'sun', 'fog', 'hemiSky', 'hemiGnd', 'tint']) out[k].copy(a[k]).lerp(b[k], s);
  out.amb = THREE.MathUtils.lerp(a.amb, b.amb, s);
  out.exp = THREE.MathUtils.lerp(a.exp, b.exp, s);
  out.sunI = THREE.MathUtils.lerp(SUNI[i], SUNI[i + 1], s);
  return out;
}

function puffTexture(seed) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  // soft lit blob: bright top, bluish-grey shaded base
  const grd = g.createRadialGradient(64, 50, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.45, 'rgba(255,255,255,.85)');
  grd.addColorStop(0.75, 'rgba(235,242,255,.35)'); grd.addColorStop(1, 'rgba(225,235,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'source-atop';
  const sh = g.createLinearGradient(0, 30, 0, 118);
  sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(150,170,205,.75)');
  g.fillStyle = sh; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
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

export function buildSky(scene) {
  scene.background = new THREE.Color('#9fd8ff');
  scene.fog = new THREE.Fog('#bfe6ff', 120, 520);
  const hemi = new THREE.HemisphereLight('#cfeaff', '#7a9a5a', 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d0', 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera; sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 1; sc.far = 320;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
  scene.add(sun);

  const state = {
    hour: 9.5, auto: true,
    zen: new THREE.Color(), hor: new THREE.Color(), sun: new THREE.Color(), fog: new THREE.Color(),
    hemiSky: new THREE.Color(), hemiGnd: new THREE.Color(), tint: new THREE.Color(),
    amb: 1, exp: 1, sunI: 1, e: 0.5, dir: new THREE.Vector3(), bloom: 0.28,
  };
  scene.userData.sky = state;

  // ---------- sky dome ----------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { zen: { value: state.zen }, hor: { value: state.hor }, sunCol: { value: state.sun }, sunDir: { value: state.dir }, night: { value: 0 }, time: { value: 0 } },
    vertexShader: 'varying vec3 v;void main(){v=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform vec3 zen,hor,sunCol,sunDir;uniform float night,time;varying vec3 v;
      float h31(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
      void main(){
        vec3 d=normalize(v);
        float y=max(d.y,0.);
        vec3 col=mix(hor,zen,pow(y,.55));
        float sd=max(dot(d,sunDir),0.);
        // warm glow band around sun, strongest near horizon
        float glow=pow(sd,6.)*.45+pow(sd,48.)*.6;
        col+=sunCol*glow*(1.-.5*y);
        col=mix(col,col*.5+hor*.5,smoothstep(0.,-.35,d.y)); // below horizon
        float disc=smoothstep(.9994,.9998,sd);
        col=mix(col,sunCol*3.,disc);
        // stars
        if(night>.01&&d.y>0.){
          vec3 sp=d*160.; vec3 id=floor(sp); float r=h31(id);
          vec3 f=fract(sp)-.5;
          float star=step(.985,r)*smoothstep(.45,0.,length(f))*(.6+.4*sin(time*2.+r*60.));
          col+=vec3(.9,.95,1.)*star*night*smoothstep(0.,.25,d.y)*1.6;
        }
        // moon
        float md=max(dot(d,-sunDir),0.);
        col+=vec3(.85,.9,1.)*smoothstep(.9992,.9996,md)*night*1.5+vec3(.4,.5,.8)*pow(md,200.)*night*.4;
        gl_FragColor=vec4(col,1.);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), skyMat);
  dome.frustumCulled = false; dome.renderOrder = -10;
  dome.onBeforeRender = (r, s, cam) => dome.position.copy(cam.position);
  scene.add(dome);

  // ---------- clouds ----------
  const clouds = new THREE.Group();
  const texes = [puffTexture(1), puffTexture(2)];
  const cloudMats = texes.map((t) => new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false, opacity: 0.95 }));
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const cloudList = [];
  for (let i = 0; i < 26; i++) {
    const g = new THREE.Group();
    const w = 14 + rnd() * 22, n = 9 + Math.floor(rnd() * 8);
    for (let j = 0; j < n; j++) {
      const sp = new THREE.Sprite(cloudMats[j % 2]);
      const u = rnd() * 2 - 1, hump = 1 - u * u;
      const sz = (9 + rnd() * 9) * (0.6 + hump * 0.6);
      sp.scale.set(sz * 1.25, sz * 0.8, 1);
      sp.position.set(u * w, hump * (3 + rnd() * 3) + rnd() * 1.5, (rnd() - 0.5) * 6);
      g.add(sp);
    }
    const a = rnd() * Math.PI * 2, r = 70 + rnd() * 230;
    g.position.set(Math.cos(a) * r, 62 + rnd() * 30, Math.sin(a) * r);
    clouds.add(g); cloudList.push(g);
  }
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
        vec3 col=mix(hor,zen,pow(y,.55));
        float sd=max(dot(d,sunDir),0.);
        float glow=pow(sd,6.)*.45+pow(sd,48.)*.6;
        return col+sunCol*glow*(1.-.5*y);
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
        float depth=max(${WATER_Y.toFixed(2)}-fh,0.);
        // outside floor texture treat as deep
        vec2 q=abs(uv-.5);
        if(max(q.x,q.y)>.5) depth=3.;
        vec2 g=ripple(w.xz,time);
        float dist=length(cameraPosition-w);
        g*=mix(1.,.25,smoothstep(40.,220.,dist))*mix(.4,1.,clamp(V.y*2.,0.,1.));
        vec3 Ns=normalize(vec3(-g.x*.9,1.,-g.y*.9));
        vec3 N=normalize(vec3(-g.x*.55,1.,-g.y*.55));
        // depth colour (beer-lambert-ish)
        float dd=1.-exp(-depth*.75);
        vec3 col=mix(shallow,deep,dd);
        // sky reflection with fresnel
        vec3 R=reflect(-V,N); R.y=abs(R.y);
        vec3 skyc=skyCol(R);
        float sd=max(dot(R,sunDir),0.);
        float fres=.03+.97*pow(1.-max(dot(V,N),0.),4.);
        col*=light*mix(vec3(1.),sunCol,.45);
        col=mix(col,skyc,clamp(fres,0.,.66));
        // sun glints: sharp highlight + sparkling breakup
        vec3 Rs=reflect(-V,Ns); Rs.y=abs(Rs.y); float sds=max(dot(Rs,sunDir),0.);
        float spec=pow(sds,300.)*4.+pow(sds,60.)*.18;
        float sparkle=smoothstep(.55,.9,vn(w.xz*5.+time*vec2(.8,.5)))*smoothstep(.5,.95,vn(w.xz*2.3-time*.6));
        col+=sunCol*(spec*(.4+sparkle*1.6));
        // shoreline foam: pulsing bands that wash up the beach
        float n=vn(w.xz*1.4+time*.2);
        float wash=.5+.5*sin(time*.9+n*3.);
        float edge=depth+n*.12-.05;
        float foam=smoothstep(.16+wash*.30,.0,edge);
        float band=smoothstep(.02,.0,abs(edge-(.45+wash*.35))-.025+.0)*.55*smoothstep(.9,.3,depth);
        float lace=smoothstep(.45,.75,vn(w.xz*7.+time*.15));
        float f=clamp(foam*(.55+.45*lace)+band*lace,0.,1.);
        col=mix(col,vec3(.97,1.,1.)*light,f*.9);
        float alpha=mix(.30,1.,smoothstep(0.,2.0,depth));
        alpha=max(alpha,f);
        alpha*=smoothstep(.0,.06,depth+.0);
        alpha=max(alpha,f*.9*smoothstep(-.02,.04,depth+.01));
        gl_FragColor=vec4(col,alpha);
        #include <fog_fragment>
      }`,
  }));
  Object.assign(water.material.uniforms, { zen: { value: state.zen }, hor: { value: state.hor }, sunCol: { value: state.sun }, sunDir: { value: state.dir } });
  water.position.y = WATER_Y; water.renderOrder = 1; scene.add(water);

  const life = buildAmbientLife(scene, state);

  // ---------- update ----------
  const tmp = { zen: C('#fff'), hor: C('#fff'), sun: C('#fff'), fog: C('#fff'), hemiSky: C('#fff'), hemiGnd: C('#fff'), tint: C('#fff') };
  const moonDir = new THREE.Vector3();
  function apply() {
    const a = (state.hour - 6) / 12 * Math.PI;
    state.dir.set(Math.cos(a) * 0.9, Math.sin(a) * 0.92 + 0.0, 0.42).normalize();
    const e = state.e = state.dir.y;
    const k = sampleKeys(e, tmp);
    state.zen.copy(k.zen); state.hor.copy(k.hor); state.sun.copy(k.sun);
    state.hemiSky.copy(k.hemiSky); state.hemiGnd.copy(k.hemiGnd); state.tint.copy(k.tint);
    state.exp = k.exp; state.amb = k.amb;
    state.fog.copy(k.fog);
    scene.fog.color.copy(k.fog); scene.background.copy(k.hor);
    scene.fog.near = 120 + 40 * Math.max(e, 0); scene.fog.far = 520 + 80 * Math.max(e, 0);
    hemi.color.copy(k.hemiSky); hemi.groundColor.copy(k.hemiGnd); hemi.intensity = k.amb;
    const dayF = THREE.MathUtils.smoothstep(e, -0.06, 0.1);
    if (e > -0.06) {
      sun.position.copy(state.dir).multiplyScalar(130); sun.color.copy(k.sun); sun.intensity = k.sunI * dayF;
    } else {
      moonDir.copy(state.dir).negate(); moonDir.y = Math.max(moonDir.y, 0.3);
      sun.position.copy(moonDir).multiplyScalar(130); sun.color.set('#8fa6ff');
      sun.intensity = 1.1 * THREE.MathUtils.smoothstep(e, -0.06, -0.25);
    }
    const night = 1 - THREE.MathUtils.smoothstep(e, -0.18, 0.06);
    skyMat.uniforms.night.value = night;
    water.material.uniforms.light.value = 0.4 + 0.6 * THREE.MathUtils.smoothstep(e, -0.15, 0.3);
    state.night = night;
    state.bloom = 0.26 + 0.18 * (1 - Math.abs(e - 0.08) / 0.5 > 0 ? Math.max(0, 1 - Math.abs(e - 0.08) / 0.5) : 0);
    // clouds: lit by sun colour, dim at night
    const cl = new THREE.Color().copy(k.sun).lerp(new THREE.Color('#ffffff'), 0.55).multiplyScalar(0.25 + 0.75 * THREE.MathUtils.smoothstep(e, -0.2, 0.25));
    cloudMats.forEach((m) => m.color.copy(cl));
  }

  let last = 0;
  const api = {
    sun, water, clouds, state, life,
    setHour(h) { state.hour = h; state.auto = false; apply(); },
    update(t) {
      const dt = Math.min(Math.max(t - last, 0), 0.1); last = t;
      if (state.auto) state.hour = (state.hour + dt * 24 / DAY_LENGTH) % 24;
      apply();
      water.material.uniforms.time.value = t; skyMat.uniforms.time.value = t;
      for (const g of cloudList) { g.position.x += dt * 1.2; if (g.position.x > 320) g.position.x = -320; }
      life.update(dt, t);
    },
  };
  window.__sky = api;
  apply();
  return api;
}
