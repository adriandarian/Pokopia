import * as THREE from 'three';
import { windTime } from './wind.js';
import { onTierChange } from '../quality.js';

/** Falling blossom petals: one GPU-animated Points system around every blossom tree. */
export function buildPetals(scene, trees, perTree = 16) {
  const n = trees.length * perTree; if (!n) return;
  const base = new Float32Array(n * 3), seed = new Float32Array(n * 2);
  let k = 0;
  for (let i = 0; i < perTree; i++) for (const [x, y, z, sc] of trees) {   // slot-major order: a draw range keeps every tree covered
    base[k * 3] = x; base[k * 3 + 1] = y; base[k * 3 + 2] = z;
    seed[k * 2] = Math.random(); seed[k * 2 + 1] = sc; k++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(base, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 2));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: windTime, uPx: { value: 1 } },
    vertexShader: `uniform float uTime; uniform float uPx; attribute vec2 seed; varying float vA; varying float vR;
      float h(float n){ return fract(sin(n*91.345)*47453.5453); }
      void main(){
        float s = seed.x, sc = seed.y;
        float life = 7.0 + h(s*3.1)*5.0, t = fract((uTime + s*50.0)/life);
        float H = (3.4 + h(s*7.7)*0.8) * sc;
        vec3 p = position;
        float a = h(s*13.7)*6.283, r = (0.4 + h(s*5.3)*1.6) * sc;
        p.x += cos(a)*r*(0.3+t) + sin(uTime*0.9 + s*20.0)*0.5 + t*1.6;
        p.z += sin(a)*r*(0.3+t) + cos(uTime*0.7 + s*17.0)*0.5;
        p.y += H*0.8 - t*H*0.8 + 0.15;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPx * (0.16 + h(s*2.2)*0.1) * 480.0 / -mv.z;
        vA = smoothstep(0.0,0.08,t) * (1.0 - smoothstep(0.85,1.0,t)); vR = h(s*9.1)*6.283 + uTime*(0.6+h(s)*1.2);
      }`,
    fragmentShader: `varying float vA; varying float vR;
      void main(){
        vec2 p = gl_PointCoord - 0.5; float c = cos(vR), s = sin(vR); p = mat2(c,-s,s,c)*p;
        float d = length(p*vec2(1.0,1.9)); float a = smoothstep(0.5,0.38,d);
        if (a*vA < 0.02) discard;
        gl_FragColor = vec4(mix(vec3(1.0,0.72,0.82), vec3(1.0,0.93,0.96), p.y+0.5), a*vA*0.95);
      }`,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 3;
  mat.onBeforeRender = (r) => { mat.uniforms.uPx.value = r.domElement.height / 720; };
  scene.add(pts);
  // quality: tree-major draw order, so thinning by whole trees' share keeps coverage even
  onTierChange((p) => { pts.visible = p.fx.blossom > 0; g.setDrawRange(0, Math.floor(n * p.fx.blossom)); });
}
