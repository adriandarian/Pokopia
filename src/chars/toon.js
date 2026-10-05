import * as THREE from 'three';

// Soft 4-step gradient so shading is toon-like but gentle (Animal Crossing feel).
let _grad;
export function gradient() {
  if (_grad) return _grad;
  const d = new Uint8Array([120, 120, 120, 255, 185, 185, 185, 255, 235, 235, 235, 255, 255, 255, 255, 255]);
  _grad = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat);
  _grad.minFilter = _grad.magFilter = THREE.NearestFilter; _grad.needsUpdate = true;
  return _grad;
}

const cache = new Map();
// Toon material with a soft rim light. Cached per colour+rim (so setColor on a shared one affects all users;
// use toonUnique for per-instance colour).
export function toon(color, opts = {}) {
  const key = `${color}|${opts.rim}|${opts.rimColor}|${opts.emissive}|${opts.ei}`;
  if (cache.has(key)) return cache.get(key);
  const m = toonUnique(color, opts); cache.set(key, m); return m;
}
export function toonUnique(color, { rim = 0.35, rimColor = '#fff3e0', emissive = null, ei = 0 } = {}) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradient() });
  if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = ei; }
  const rc = new THREE.Color(rimColor);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = { value: rc }; sh.uniforms.rimAmt = { value: rim };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor; uniform float rimAmt;')
      .replace('#include <opaque_fragment>',
        `float rimF = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.5);
         outgoingLight += rimColor * rimF * rimAmt;
         #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'toonrim';
  return m;
}

const outlineCache = new Map();
function outlineMat(thick, color) {
  const key = thick + color;
  if (outlineCache.has(key)) return outlineCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(normal) * ${thick.toFixed(4)};`);
  };
  m.customProgramCacheKey = () => 'ol' + thick.toFixed(4);
  outlineCache.set(key, m); return m;
}

// Inverted-hull outline as a child of the mesh (inherits its scale, so thickness is in local units).
export function outline(mesh, thick = 0.035, color = '#3b2a3a') {
  const o = new THREE.Mesh(mesh.geometry, outlineMat(Math.round(thick * 2000) / 2000, color));
  o.userData.isOutline = true;
  mesh.add(o); return o;
}

// Convenience: toon mesh (+outline) added to parent.
export function part(parent, geo, mat, { pos, scale, rot, line = 0.03, lineColor, cast = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(...pos);
  if (scale) m.scale.set(...scale);
  if (rot) m.rotation.set(...rot);
  m.castShadow = cast;
  if (line) outline(m, line / (scale ? Math.max(...scale) : 1), lineColor);
  if (parent) parent.add(m);
  return m;
}

const sphereCache = new Map();
export function sphereGeo(r = 1, w = 24, h = 16) {
  const k = `${r}|${w}|${h}`;
  if (!sphereCache.has(k)) sphereCache.set(k, new THREE.SphereGeometry(r, w, h));
  return sphereCache.get(k);
}
const basic = {};
export const Mat = {
  eye: () => basic.eye || (basic.eye = new THREE.MeshBasicMaterial({ color: '#2a1d2e' })),
  white: () => basic.white || (basic.white = new THREE.MeshBasicMaterial({ color: '#ffffff' })),
};
