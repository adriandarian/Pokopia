import * as THREE from 'three';
import { dappleKey } from '../quality.js';
export const windTime = { value: 0 };
let hooked = false;
/** Adds vertex sway driven by attribute `aw` (0 = rigid, 1 = free tip). */
export function applyWind(mat, { amp = 0.05, heightGain = 0.012, speed = 1.5 } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; attribute float aw;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 iw = vec3(instanceMatrix[3]);
          #else
            vec3 iw = vec3(0.);
          #endif
          float ph = iw.x * 0.31 + iw.z * 0.23;
          float gust = sin(uTime * 0.37 + iw.x * 0.05 + iw.z * 0.04) * 0.5 + 0.5;
          float k = aw * (${amp.toFixed(4)} + position.y * ${heightGain.toFixed(4)}) * (0.6 + gust * 0.9);
          transformed.x += sin(uTime * ${speed.toFixed(2)} + ph + position.y * 0.9) * k;
          transformed.z += cos(uTime * ${(speed * 0.8).toFixed(2)} + ph * 1.3 + position.y * 0.7) * k * 0.7;
          transformed.y -= abs(k) * 0.15;
        }`);
  };
  mat.customProgramCacheKey = () => 'wind' + amp + heightGain + speed + dappleKey();
  return mat;
}
/** Call from any mesh's onBeforeRender to tick wind time. */
export function tickWind(mesh) {

  mesh.onBeforeRender = () => { windTime.value = performance.now() / 1000; };
}
