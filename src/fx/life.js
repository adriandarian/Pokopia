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
        float size=mix(2.2,1.4,night)*(.6+seed*.8);
        gl_PointSize=clamp(size*scale/(-mv.z),1.,mix(16.,9.,night));
        float pulse=.5+.5*sin(time*(1.5+seed*2.)+seed*50.);
        tw=mix(1.,pow(pulse,2.5)*.9+.1,night);
        a=smoothstep(140.,30.,-mv.z);
      }`,
    fragmentShader: `uniform sampler2D map;uniform vec3 col;uniform float night;varying float a;varying float tw;
      void main(){float m=texture2D(map,gl_PointCoord).a;vec3 c=mix(col,vec3(.55,1.,.3),night);gl_FragColor=vec4(c*(1.+night*1.5),m*m*a*tw*mix(.3,1.,night));}`,
  }));
  motes.frustumCulled = false; scene.add(motes);

  // --- petals ---
  const PN = 70;
  const pg = new THREE.PlaneGeometry(0.28, 0.2);
  const pm = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: true, transparent: true, opacity: 0.95 });
  const petals = new THREE.InstancedMesh(pg, pm, PN);
  const pcols = ['#ffb7d0', '#ffd1e2', '#ffffff', '#ffc6a8'];
  const pst = [];
  for (let i = 0; i < PN; i++) {
    petals.setColorAt(i, new THREE.Color(pcols[i % 4]));
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
  const wingG = new THREE.BufferGeometry();
  wingG.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.35, 0, -0.2, 0.3, 0, 0.22, 0, 0, 0, 0.3, 0, 0.22, 0.05, 0, 0.3]), 3));
  wingG.computeVertexNormals();
  const bcols = ['#ffd24a', '#ff8fb8', '#8fd0ff', '#ffffff', '#c59bff'];
  const flies = [];
  for (let i = 0; i < 14; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: bcols[i % 5], side: THREE.DoubleSide, fog: true });
    const grp = new THREE.Group();
    const wl = new THREE.Mesh(wingG, mat), wr = new THREE.Mesh(wingG, mat);
    wr.scale.x = -1; grp.add(wl, wr); grp.scale.setScalar(1.3);
    scene.add(grp);
    const a = rnd() * 6.28, r = 8 + rnd() * 38;
    flies.push({ grp, wl, wr, cx: Math.cos(a) * r, cz: Math.sin(a) * r, rad: 3 + rnd() * 6, sp: 0.2 + rnd() * 0.25, ph: rnd() * 6.28, fl: 14 + rnd() * 6, hh: 1 + rnd() * 1.5 });
  }

  return {
    petals, butterflies: flies,
    update(dt, t) {
      const night = state.night || 0;
      motes.material.uniforms.time.value = t;
      motes.material.uniforms.night.value = night;
      motes.material.uniforms.col.value.copy(state.sun).lerp(new THREE.Color('#fff'), 0.4);
      motes.material.uniforms.scale.value = innerHeight * 0.9;
      pm.color.setScalar(0.35 + 0.65 * (1 - night));
      for (let i = 0; i < PN; i++) {
        const p = pst[i];
        p.y -= dt * (0.5 + p.sp * 0.5);
        p.x += Math.sin(t * p.sp + p.ph) * dt * 1.2 + dt * 0.6;
        p.z += Math.cos(t * p.sp * 0.8 + p.ph) * dt * 0.8;
        const ground = Math.max(heightAt(p.x, p.z), 0) + 0.05;
        if (p.y < ground) respawn(p, false);
        e.set(t * p.rs + p.ph, t * p.rs * 0.7, Math.sin(t * p.sp + p.ph));
        q.setFromEuler(e); pv.set(p.x, p.y, p.z);
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
        if (dx * dx + dz * dz > 1e-8) f.grp.rotation.y = Math.atan2(dx, dz) - Math.PI / 2 + Math.PI / 2;
        const fl = Math.sin(t * f.fl + f.ph) * 0.9 + 0.35;
        f.wl.rotation.z = fl; f.wr.rotation.z = -fl;
      }
    },
  };
}
