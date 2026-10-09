import * as THREE from 'three';
import { POND } from './features.js';
import { POND_LEVEL, heightAt } from '../terrain.js';
import { mulberry } from '../noise.js';
import { prep, merge, blob } from './geo.js';
import { applyWind, tickWind } from './wind.js';

export function buildPond(scene) {
  const R = POND.r * 1.9, N = 96;
  // baked bed depth (0 at/above waterline .. 1 deep) over the pond disc
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = POND.x + ((i + 0.5) / N * 2 - 1) * R, z = POND.z + ((j + 0.5) / N * 2 - 1) * R;
    const dep = POND_LEVEL - heightAt(x, z);
    const k = (j * N + i) * 4;
    data[k] = Math.max(0, Math.min(255, (dep + 0.4) / 2.2 * 255)); data[k + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;

  const g = new THREE.PlaneGeometry(R * 2, R * 2, 1, 1).rotateX(-Math.PI / 2);
  const sun = new THREE.Vector3(0.5, 0.8, 0.3).normalize();
  const mat = new THREE.ShaderMaterial({
    transparent: true, fog: true, depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      time: { value: 0 }, c: { value: new THREE.Vector3(POND.x, POND.z, R) }, bed: { value: tex },
      sunDir: { value: sun }, day: { value: 1 }, sky: { value: new THREE.Color('#bfe4f7') },
    }]),
    vertexShader: `varying vec3 w;
      #include <fog_pars_vertex>
      void main(){vec4 wp=modelMatrix*vec4(position,1.);w=wp.xyz;vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time; uniform vec3 c; uniform sampler2D bed; uniform vec3 sunDir; uniform float day; uniform vec3 sky; varying vec3 w;
      #include <fog_pars_fragment>
      float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 uv = (w.xz - c.xy)/(c.z*2.) + .5;
        float depth = clamp((texture2D(bed, uv).r*2.2 - .4)/1.6, 0., 1.);
        float t = time;
        // ripple normal from two moving noise layers + expanding rings from a few drops
        vec2 p = w.xz;
        float e = .08;
        float n0 = vn(p*1.6+vec2(t*.15,t*.1)) + .6*vn(p*3.7-vec2(t*.2,-t*.13));
        float nx = vn((p+vec2(e,0.))*1.6+vec2(t*.15,t*.1)) + .6*vn((p+vec2(e,0.))*3.7-vec2(t*.2,-t*.13));
        float nz = vn((p+vec2(0.,e))*1.6+vec2(t*.15,t*.1)) + .6*vn((p+vec2(0.,e))*3.7-vec2(t*.2,-t*.13));
        vec3 N = normalize(vec3((n0-nx)*1.4, 1., (n0-nz)*1.4));
        for(int i=0;i<3;i++){
          vec2 dc = c.xy + vec2(sin(float(i)*2.3+1.)*3.2, cos(float(i)*1.7)*3.);
          float ph = fract(t*.18 + float(i)*.33);
          float rr = length(p-dc);
          float ring = exp(-pow((rr-ph*3.2)*3.2,2.))*(1.-ph);
          N.xz += normalize(p-dc+1e-4)*ring*.25;
        }
        N = normalize(N);
        vec3 V = normalize(cameraPosition - w);
        float fres = pow(1.-max(dot(N,V),0.), 3.5);
        vec3 shallow = vec3(.34,.74,.62), deepC = vec3(.02,.2,.32);
        vec3 col = mix(shallow, deepC, smoothstep(.05,.75,depth));
        col = mix(col, vec3(.55,.7,.45)*.8, (1.-smoothstep(.0,.25,depth))*.45); // sunlit sandy/mossy shallows
        col = mix(col, mix(vec3(.05,.1,.16), sky, day), clamp(fres*.8,0.,1.)*.55*mix(.5,1.,day));
        vec3 H = normalize(sunDir + V);
        float spec = pow(max(dot(N,H),0.), 140.) * 1.4;
        col += spec*day*day;
        col += smoothstep(.97,1.,vn(p*7.+t*.6)*vn(p*5.-t*.5)*1.9)*.12*day;
        float edge = smoothstep(.0,.09,depth+.02);
        float foam = (1.-smoothstep(.0,.2,depth)) * smoothstep(-.03,.03,depth) * (.65+.35*sin(t*.8+vn(p*4.)*6.));
        col = mix(col, vec3(1.), foam*.5*mix(.25,1.,day));
        col *= mix(.3, 1., day); // dark teal at night; never blown out
        float rim = 1. - smoothstep(.93,.99, length(uv-.5)*2.);
        float a = mix(.62, .97, smoothstep(.0,.45,depth)) * rim * edge + fres*.1*rim;
        gl_FragColor = vec4(col, clamp(a,0.,1.));
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.position.set(POND.x, POND_LEVEL, POND.z);
  m.renderOrder = 2;
  m.onBeforeRender = () => {
    mat.uniforms.time.value = performance.now() / 1000;
    if (!m.userData.light) m.userData.light = scene.children.find(o => o.isDirectionalLight) || null;
    const sk = scene.userData.sky; mat.uniforms.day.value = sk ? Math.max(0, Math.min(1, 1 - (sk.night ?? 0))) * Math.max(0.35, Math.min(1, sk.exp ?? 1)) : 1;
    const L = m.userData.light; if (L) mat.uniforms.sunDir.value.copy(L.position).sub(L.target.position).normalize();
  };
  scene.add(m);

  // lit lily pads with flowers
  const rnd = mulberry(77);
  const padG = new THREE.CircleGeometry(0.5, 12, 0.35, Math.PI * 2 - 0.7).rotateX(-Math.PI / 2);
  padG.translate(0.05, 0, 0);
  const padGeo = prep(padG, '#ffffff', 0, [0.9, 1.05], 0.02);
  {
    const nrm = padGeo.attributes.normal; for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  }
  const padMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, emissive: '#1d4a1d', emissiveIntensity: 0.35 });
  const spots = [];
  for (let i = 0; i < 60 && spots.length < 22; i++) {
    const a = rnd() * 6.28, rr = POND.r * (0.15 + rnd() * 0.7);
    const x = POND.x + Math.cos(a) * rr, z = POND.z + Math.sin(a) * rr;
    if (heightAt(x, z) > POND_LEVEL - 0.25) continue;
    spots.push([x, z, rnd() * 6.28, 0.7 + rnd() * 0.7]);
  }
  const pads = new THREE.InstancedMesh(padGeo, padMat, spots.length);
  const lotus = merge([blob(0, 0.06, 0, 0.1, '#ffd0e4', { detail: 1, sy: 0.8, lump: 0.05, aw: 0, shade: [0.95, 1.1] }), blob(0, 0.14, 0, 0.06, '#ffe36a', { detail: 0, sy: 1, lump: 0, aw: 0, shade: [1, 1] })]);
  const flowers = new THREE.InstancedMesh(lotus, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: '#ff8ab8', emissiveIntensity: 0.18 }), Math.ceil(spots.length / 2));
  const d = new THREE.Object3D(), c = new THREE.Color();
  let nf = 0;
  spots.forEach((s, i) => {
    d.position.set(s[0], POND_LEVEL + 0.04, s[1]); d.rotation.set(0, s[2], 0); d.scale.setScalar(s[3]); d.updateMatrix();
    pads.setMatrixAt(i, d.matrix);
    pads.setColorAt(i, c.setHSL(0.3 + (rnd() - 0.5) * 0.06, 0.5, 0.33 + rnd() * 0.1));
    if (i % 2 === 0 && nf < flowers.count) { d.position.set(s[0] + 0.12, POND_LEVEL + 0.05, s[1]); d.scale.setScalar(s[3] * 1.2); d.updateMatrix(); flowers.setMatrixAt(nf, d.matrix); flowers.setColorAt(nf++, c.set('#ffffff')); }
  });
  flowers.count = nf;
  pads.receiveShadow = true;
  scene.add(pads, flowers);
}
