import * as THREE from 'three';
import { heightAt } from '../terrain.js';

function glowTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.15, 'rgba(255,255,255,.55)'); grd.addColorStop(0.4, 'rgba(255,255,255,.15)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

const rnd = (() => { let s = 99; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

// Pollen by day, fireflies by night (GPU animated), falling petals and butterflies (CPU, few).
export function buildAmbientLife(scene, state) {
  // --- motes ---
  const N = 450, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 55;
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 2] = Math.sin(a) * r;
    pos[i * 3 + 1] = Math.max(heightAt(pos[i * 3], pos[i * 3 + 2]), 0) + 0.5 + rnd() * 6;
    seed[i] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const motes = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { map: { value: glowTexture() }, time: { value: 0 }, night: { value: 0 }, col: { value: new THREE.Color('#fff4c0') }, scale: { value: 600 } },
    vertexShader: `attribute float seed;uniform float time,night,scale;varying float a;varying float tw;
      void main(){
        vec3 p=position;
        float t=time*(.15+seed*.2);
        p.x+=sin(t*3.+seed*40.)*1.6+time*.25*(1.-night);
        p.z+=cos(t*2.3+seed*20.)*1.6;
        p.y+=sin(t*4.+seed*10.)*.7;
        p.x=mod(p.x+60.,120.)-60.;
        vec4 mv=modelViewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*mv;
        float size=mix(2.2,3.4,night)*(.6+seed*.8);
        gl_PointSize=clamp(size*scale/(-mv.z),1.,mix(16.,15.,night));
        float pulse=.5+.5*sin(time*(1.5+seed*2.)+seed*50.);
        tw=mix(1.,pow(pulse,1.5)*.85+.15,night);
        a=smoothstep(140.,30.,-mv.z);
      }`,
    fragmentShader: `uniform sampler2D map;uniform vec3 col;uniform float night;varying float a;varying float tw;
      void main(){float m=texture2D(map,gl_PointCoord).a;vec3 c=mix(col,vec3(.55,1.,.3),night);gl_FragColor=vec4(c*(1.+night*1.5),mix(m*.7,m*m,night)*a*tw*mix(.3,1.,night)*mix(1.,2.2,night));}`,
  }));
  motes.frustumCulled = false; scene.add(motes);

  // --- petals ---
  const PN = 100;
  const pg = new THREE.PlaneGeometry(0.16, 0.16);
  const petalTex = (() => { // soft rounded teardrop petal with a faint centre vein
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    g.translate(32, 32); g.beginPath(); g.moveTo(0, 26); g.bezierCurveTo(26, 14, 24, -22, 0, -26); g.bezierCurveTo(-24, -22, -26, 14, 0, 26); g.closePath();
    const gr = g.createRadialGradient(0, 8, 2, 0, 0, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(235,235,235,.9)');
    g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(190,150,160,.5)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 24); g.lineTo(0, -12); g.stroke();
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const pm = new THREE.MeshBasicMaterial({ map: petalTex, side: THREE.DoubleSide, fog: true, transparent: true, alphaTest: 0.08, depthWrite: false });
  const petals = new THREE.InstancedMesh(pg, pm, PN);
  const pcols = ['#ffa8c8', '#ffb7d0', '#ff9fb8', '#ffc6a8', '#ffb090', '#f2a050', '#ff8fb0', '#ffc0a0'];
  const pst = [];
  for (let i = 0; i < PN; i++) {
    petals.setColorAt(i, new THREE.Color(pcols[i % 8]));
    pst.push({ x: 0, y: 0, z: 0, ph: rnd() * 6.28, sp: 0.5 + rnd() * 0.6, rs: 1 + rnd() * 3 });
    respawn(pst[i], true);
  }
  function respawn(p, init) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 50;
    p.x = Math.cos(a) * r; p.z = Math.sin(a) * r;
    p.y = init ? rnd() * 14 : 12 + rnd() * 4;
  }
  petals.frustumCulled = false; scene.add(petals);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();

  // --- butterflies ---
  // One wing = a quad in the XZ plane (hinge at x=0) carrying an alpha-cut two-lobe wing texture, so it reads as a
  // butterfly wing and never as a flat coloured slab. Colour is tinted per butterfly via the material colour.
  const wingG = new THREE.BufferGeometry();
  wingG.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, -0.2, 0.35, 0, -0.2, 0.35, 0, 0.3, 0, 0, 0.3]), 3));
  wingG.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]), 2));
  wingG.setIndex([0, 2, 1, 0, 3, 2]);
  wingG.computeVertexNormals();
  const wingTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128; const g = cv.getContext('2d');
    const lobe = (cx, cy, rx, ry, rot) => { g.beginPath(); g.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); };
    g.fillStyle = '#3a2a40'; lobe(54, 44, 52, 34, -0.35); g.fill(); lobe(46, 94, 34, 26, 0.3); g.fill(); // dark rim silhouette
    g.fillStyle = '#ffffff'; lobe(54, 44, 46, 28, -0.35); g.fill(); lobe(46, 94, 28, 20, 0.3); g.fill(); // light body (tinted)
    g.fillStyle = 'rgba(60,40,70,.55)'; for (const [x, y, r] of [[78, 34, 6], [60, 52, 5], [44, 92, 5]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const bcols = ['#ffd24a', '#ff8fb8', '#8fd0ff', '#fff4d6', '#c59bff'];
  const flies = [];
  for (let i = 0; i < 16; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: bcols[i % 5], map: wingTex, alphaTest: 0.5, side: THREE.DoubleSide, fog: true });
    const grp = new THREE.Group();
    const wl = new THREE.Mesh(wingG, mat), wr = new THREE.Mesh(wingG, mat);
    wr.scale.x = -1; grp.add(wl, wr); grp.scale.setScalar(1.0);
    scene.add(grp);
    const a = rnd() * 6.28, r = 4 + rnd() * 30;
    flies.push({ grp, wl, wr, cx: Math.cos(a) * r, cz: Math.sin(a) * r, rad: 3 + rnd() * 6, sp: 0.2 + rnd() * 0.25, ph: rnd() * 6.28, fl: 14 + rnd() * 6, hh: 1 + rnd() * 1.5 });
  }


  // --- god rays: one draw call, additive slanted light cards along the sun direction ---
  const RN = 9, rA = new Float32Array(RN * 4 * 3), rC = new Float32Array(RN * 4 * 2), rS = new Float32Array(RN * 4), rI = [];
  for (let i = 0; i < RN; i++) {
    const a = rnd() * 6.283, r = 6 + rnd() * 40, ax = Math.cos(a) * r, az = Math.sin(a) * r, ay = 26 + rnd() * 10, sd = rnd();
    [[-1, 0], [1, 0], [-1, 1], [1, 1]].forEach(([cx, cy], k) => { const o = i * 4 + k; rA.set([ax, ay, az], o * 3); rC.set([cx, cy], o * 2); rS[o] = sd; });
    rI.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(rA, 3)); rg.setAttribute('corner', new THREE.BufferAttribute(rC, 2)); rg.setAttribute('seed', new THREE.BufferAttribute(rS, 1)); rg.setIndex(rI);
  const rays = new THREE.Mesh(rg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { sunDir: { value: state.dir }, col: { value: new THREE.Color() }, k: { value: 0 }, time: { value: 0 } },
    vertexShader: `attribute vec2 corner;attribute float seed;uniform vec3 sunDir;uniform float time;varying vec2 c;varying float s;
      void main(){ vec3 L=normalize(vec3(sunDir.x,max(sunDir.y,.25),sunDir.z));
        vec3 side=normalize(cross(L,normalize(position-cameraPosition)));
        float w=2.2+seed*3.;
        vec3 p=position-L*(corner.y*34.)+side*corner.x*w*(.6+.8*corner.y);
        c=vec2(corner.x,corner.y);s=seed;
        gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
    fragmentShader: `uniform vec3 col;uniform float k,time;varying vec2 c;varying float s;
      void main(){ float a=(1.-abs(c.x))*(1.-abs(c.x)); a*=smoothstep(0.,.15,c.y)*(1.-c.y);
        a*=.6+.4*sin(time*.4+s*30.); gl_FragColor=vec4(col*a*k,a*k);}`,
  }));
  rays.frustumCulled = false; scene.add(rays);

  // --- far birds: one Points draw, V shapes drawn in the fragment shader ---
  const BN = 9, bp = new Float32Array(BN * 3), bs = new Float32Array(BN);
  for (let i = 0; i < BN; i++) { bp.set([rnd() * 6.283, 70 + rnd() * 60, 36 + rnd() * 26], i * 3); bs[i] = rnd(); }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(bp, 3)); bg.setAttribute('seed', new THREE.BufferAttribute(bs, 1));
  const birds = new THREE.Points(bg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 }, k: { value: 1 }, scale: { value: 600 } },
    vertexShader: `attribute float seed;uniform float time,scale;varying float f;varying float sd;
      void main(){ float a=position.x+time*(.03+seed*.03)*(seed>.5?1.:-1.); float r=position.y;
        vec3 p=vec3(cos(a)*r,position.z+sin(time*.3+seed*9.)*3.,sin(a)*r);
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(22.*scale/(600.*-mv.z)*30.,4.,40.); f=sin(time*(5.+seed*3.)+seed*20.); sd=seed;}`,
    fragmentShader: `uniform float k;varying float f;varying float sd;
      void main(){ vec2 p=gl_PointCoord-.5; p.y=-p.y; float x=abs(p.x);
        float y=-x*(.5+.5*f*.7)+.1*(1.+f*.3)*0.; float d=abs(p.y-(x*(.7*f)-.0)+.0);
        float line=smoothstep(.07,.02,abs(p.y+x*.8*(1.-.8*f*.5)-.12))*step(x,.42);
        gl_FragColor=vec4(.12,.14,.2,line*k*.8);}`,
  }));
  birds.frustumCulled = false; scene.add(birds);

  // --- shore + pond sparkles: additive twinkling points ---
  const SN = 160, sp = new Float32Array(SN * 3), ss = new Float32Array(SN);
  for (let i = 0; i < SN; i++) {
    const a = rnd() * 6.283; let r = 62; while (r > 20 && heightAt(Math.cos(a) * r, Math.sin(a) * r) < -0.3) r -= 0.5;
    r += 1 + rnd() * 5; sp.set([Math.cos(a) * r, -0.25, Math.sin(a) * r], i * 3); ss[i] = rnd();
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('seed', new THREE.BufferAttribute(ss, 1));
  const sparks = new THREE.Points(sg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { map: { value: glowTexture() }, time: { value: 0 }, k: { value: 1 }, scale: { value: 600 } },
    vertexShader: `attribute float seed;uniform float time,scale;varying float tw;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(1.3*scale/-mv.z,1.,9.); float ph=fract(time*(.3+seed*.4)+seed*7.); tw=pow(max(sin(ph*3.14159),0.),6.);}`,
    fragmentShader: `uniform sampler2D map;uniform float k;varying float tw;
      void main(){ gl_FragColor=vec4(vec3(1.,1.,.95)*texture2D(map,gl_PointCoord).a*tw*k*1.6,1.);}`,
  }));
  sparks.frustumCulled = false; scene.add(sparks);

  return {
    petals, butterflies: flies,
    update(dt, t) {
      const night = state.night || 0;
      motes.material.uniforms.time.value = t;
      motes.material.uniforms.night.value = night;
      motes.material.uniforms.col.value.copy(state.sun).lerp(new THREE.Color('#fff'), 0.4);
      motes.material.uniforms.scale.value = innerHeight * 0.9;
      const camPos = window.__game?.camera?.position || pv;
      const dayK = 1 - night;
      rays.material.uniforms.time.value = t; rays.material.uniforms.col.value.copy(state.sun).lerp(new THREE.Color('#fff'), 0.3);
      rays.material.uniforms.k.value = 0.14 * dayK * THREE.MathUtils.smoothstep(state.e, 0.0, 0.25) * (1.0 - 0.5 * THREE.MathUtils.smoothstep(state.e, 0.5, 0.9));
      rays.visible = rays.material.uniforms.k.value > 0.002;
      birds.material.uniforms.time.value = t; birds.material.uniforms.k.value = dayK; birds.material.uniforms.scale.value = innerHeight * 0.9; birds.visible = dayK > 0.05;
      sparks.material.uniforms.time.value = t; sparks.material.uniforms.k.value = 0.4 + 0.6 * dayK; sparks.material.uniforms.scale.value = innerHeight * 0.9;
      pm.color.setScalar(0.35 + 0.65 * (1 - night));
      for (let i = 0; i < PN; i++) {
        const p = pst[i];
        p.y -= dt * (0.5 + p.sp * 0.5);
        p.x += Math.sin(t * p.sp + p.ph) * dt * 1.2 + dt * 0.6;
        p.z += Math.cos(t * p.sp * 0.8 + p.ph) * dt * 0.8;
        const ground = Math.max(heightAt(p.x, p.z), 0) + 0.05;
        if (p.y < ground) respawn(p, false);
        e.set(t * p.rs + p.ph, t * p.rs * 0.7 + Math.sin(t * 3 + p.ph) * 0.4, Math.sin(t * p.sp + p.ph));
        q.setFromEuler(e); pv.set(p.x, p.y, p.z);
        const cd = pv.distanceTo(camPos), k = THREE.MathUtils.smoothstep(cd, 2.5, 6);
        sc.setScalar(Math.max(k, 1e-4));
        petals.setMatrixAt(i, m4.compose(pv, q, sc));
      }
      petals.instanceMatrix.needsUpdate = true;
      const day = 1 - night;
      for (const f of flies) {
        f.grp.visible = day > 0.15;
        if (!f.grp.visible) continue;
        const a = t * f.sp + f.ph;
        const x = f.cx + Math.cos(a) * f.rad + Math.sin(a * 2.3) * 1.5, z = f.cz + Math.sin(a * 1.3) * f.rad;
        const y = Math.max(heightAt(x, z), 0) + f.hh + Math.sin(a * 3.1) * 0.5;
        const dx = x - f.grp.position.x, dz = z - f.grp.position.z;
        f.grp.position.set(x, y, z);
        f.grp.scale.setScalar(1.0 * THREE.MathUtils.smoothstep(f.grp.position.distanceTo(camPos), 1.5, 4.5) + 1e-3);
        if (dx * dx + dz * dz > 1e-8) f.grp.rotation.y = Math.atan2(dx, dz) - Math.PI / 2 + Math.PI / 2;
        const fl = Math.sin(t * f.fl + f.ph) * 0.9 + 0.35;
        f.wl.rotation.z = fl; f.wr.rotation.z = -fl;
      }
    },
  };
}
