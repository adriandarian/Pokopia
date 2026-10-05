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
// Toon material: soft gradient, cool character rim + sun-independent fill (keeps characters readable at dusk/night),
// optional procedural fuzz (felt / fur noise in object space) and fuzzy rim.
export function toon(color, opts = {}) {
  const key = `${color}|${opts.rim}|${opts.rimColor}|${opts.emissive}|${opts.ei}|${opts.fuzz}|${opts.fill}|${opts.vc}|${opts.double}|${opts.rimTint}`;
  if (cache.has(key)) return cache.get(key);
  const m = toonUnique(color, opts); cache.set(key, m); return m;
}
const COOL = new THREE.Color('#8fb4ff');
export function toonUnique(color, { rim = 0.35, rimColor = '#fff3e0', emissive = null, ei = 0, fuzz = 0, fill = 0.1, vc = false, double = false, rimTint = false } = {}) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradient(), vertexColors: vc, side: double ? THREE.DoubleSide : THREE.FrontSide });
  if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = ei; }
  m.userData.opts = { rim, fuzz, fill, emissive, ei, double, rimTint };
  const rc = new THREE.Color(rimColor);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = { value: rc }; sh.uniforms.rimAmt = { value: rim };
    sh.uniforms.fuzzAmt = { value: fuzz }; sh.uniforms.fillAmt = { value: fill }; sh.uniforms.coolRim = { value: COOL }; sh.uniforms.rimTint = { value: rimTint ? 1 : 0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 rimColor; uniform float rimAmt; uniform float fuzzAmt; uniform float fillAmt; uniform vec3 coolRim; uniform float rimTint;
varying vec3 vObjPos;
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }`)
      .replace('#include <opaque_fragment>',
        `float ndv = saturate(dot(normalize(vNormal), normalize(vViewPosition)));
         float rimF = pow(1.0 - ndv, 2.5);
         float fz = 0.0;
         if (fuzzAmt > 0.0) { vec3 q = vObjPos * 46.0; fz = vn(q) * 0.55 + vn(q * 2.1) * 0.45 - 0.5; outgoingLight *= 1.0 + fz * fuzzAmt; }
         outgoingLight += diffuseColor.rgb * fillAmt;
         outgoingLight += (rimTint > 0.5 ? mix(diffuseColor.rgb, vec3(1.0), 0.5) : rimColor) * rimF * rimAmt * (1.0 + fuzzAmt * 0.8 * (fz + 0.5));
         outgoingLight += coolRim * pow(1.0 - ndv, 3.0) * 0.28;
         #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'toonrim3' + (vc ? 'v' : '') + (rimTint ? 't' : '');
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
  o.userData.isOutline = true; o.userData.thick = thick; o.userData.color = color;
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

// Merge [{geo, color, pos, rot, scale}] into one vertex-coloured geometry (1 draw call).
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
export function mergeColored(items) {
  const q = new THREE.Quaternion(), e = new THREE.Euler(), mtx = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
  const gs = items.map(({ geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] }) => {
    const g = geo.index ? geo.clone() : geo.clone();
    q.setFromEuler(e.set(...rot)); mtx.compose(new THREE.Vector3(...pos), q, new THREE.Vector3(...scale)); g.applyMatrix4(mtx);
    const n = g.attributes.position.count, a = new Float32Array(n * 3), c = new THREE.Color(color);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv');
    return g.index ? g.toNonIndexed() : g;
  });
  return mergeGeometries(gs);
}

// ---- Bake: merge static toon meshes (and their outline hulls) per Group into few draw calls ----
const hullMats = {};
const hullMat = (c) => hullMats[c] || (hullMats[c] = new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide }));
export function bake(root, { vc = false } = {}) {
  const groups = []; root.traverse(o => { if (o.isGroup || o === root) groups.push(o); });
  let before = 0, after = 0;
  for (const g of groups) {
    const fills = new Map(), hulls = new Map(), kill = []; let shadow = false;
    for (const m of g.children) {
      if (!m.isMesh || m.userData.noBake || m.userData.isOutline || !m.material.isMeshToonMaterial || !m.visible) continue;
      if (m.children.some(c => !c.userData.isOutline)) continue;
      m.updateMatrix();
      const opts = m.material.userData.opts || {};
      const key = vc ? `${opts.rim}|${opts.fuzz}|${opts.fill}|${opts.emissive}|${opts.ei}|${opts.double}` : m.material.uuid;
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      geo.deleteAttribute('uv');
      for (const o of m.children) {
        if (!o.userData.isOutline) continue;
        const h = new THREE.BufferGeometry(); const p = geo.attributes.position.clone(), n = geo.attributes.normal, v = new THREE.Vector3(), nn = new THREE.Vector3();
        for (let i = 0; i < p.count; i++) { nn.fromBufferAttribute(n, i).normalize(); v.fromBufferAttribute(p, i).addScaledVector(nn, o.userData.thick); p.setXYZ(i, v.x, v.y, v.z); }
        h.setAttribute('position', p); h.applyMatrix4(m.matrix);
        const hk = o.userData.color; if (!hulls.has(hk)) hulls.set(hk, []); hulls.get(hk).push(h); after += 0; before++;
      }
      if (vc) { const c = m.material.color, a = new Float32Array(geo.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
      geo.applyMatrix4(m.matrix);
      if (!fills.has(key)) fills.set(key, { mat: m.material, opts, list: [] });
      fills.get(key).list.push(geo); kill.push(m); before++; shadow = shadow || m.castShadow;
    }
    if (!kill.length) continue;
    for (const m of kill) g.remove(m);
    for (const f of fills.values()) {
      const mat = vc ? toon('#ffffff', { ...f.opts, vc: true, rimTint: true }) : f.mat;
      const mesh = new THREE.Mesh(mergeGeometries(f.list), mat); mesh.castShadow = shadow; mesh.userData.baked = true; g.add(mesh); after++;
    }
    for (const [c, list] of hulls) { const mesh = new THREE.Mesh(mergeGeometries(list), hullMat(c)); mesh.userData.isOutline = true; mesh.userData.baked = true; g.add(mesh); after++; }
  }
  return { before, after };
}
