import * as THREE from 'three';

// ---- one atlas for every particle shape + score-pop text; the whole FX pool renders as 2 instanced draws (normal + additive) ----
const AW = 512, AH = 512;
let atlas, actx, atlasTex;
const shapeUV = {}; const textSlots = new Map(); let nextText = 0;
function initAtlas() {
  if (atlas) return;
  atlas = document.createElement('canvas'); atlas.width = AW; atlas.height = AH; actx = atlas.getContext('2d');
  const draw = (i, fn) => { actx.save(); actx.translate(i * 128, 0); actx.beginPath(); actx.rect(0, 0, 128, 128); actx.clip(); fn(actx, 128); actx.restore(); shapeUV[['dot', 'heart', 'star', 'ring'][i]] = [i * 128 / AW, 1 - 128 / AH, (i + 1) * 128 / AW, 1]; };
  draw(0, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
  draw(1, (g, s) => { g.fillStyle = '#fff'; g.translate(s / 2, s / 2 + 8); g.scale(s / 64, s / 64); g.beginPath(); g.moveTo(0, 24); g.bezierCurveTo(-34, -2, -22, -26, -2, -14); g.bezierCurveTo(-1, -13, 0, -12, 0, -10); g.bezierCurveTo(0, -12, 1, -13, 2, -14); g.bezierCurveTo(22, -26, 34, -2, 0, 24); g.fill(); });
  draw(2, (g, s) => { g.translate(s / 2, s / 2); g.scale(s / 64, s / 64); g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 6 : 30, a = i * Math.PI / 4; g.lineTo(Math.sin(a) * r, -Math.cos(a) * r); } g.closePath(); g.fill(); });
  draw(3, (g, s) => { g.strokeStyle = '#fff'; g.lineWidth = 10; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 10, 0, 7); g.stroke(); });
  atlasTex = new THREE.CanvasTexture(atlas); atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.generateMipmaps = false; atlasTex.minFilter = THREE.LinearFilter;
}
// text cells: 4 columns x 6 rows of 128x64 below the shape row (24 slots, recycled round-robin)
function textUV(txt, color) {
  const k = txt + color; if (textSlots.has(k)) return textSlots.get(k);
  const slot = nextText++ % 24, cx = (slot % 4) * 128, cy = 128 + Math.floor(slot / 4) * 64;
  for (const [kk, v] of textSlots) if (v.slot === slot) textSlots.delete(kk);
  actx.save(); actx.clearRect(cx, cy, 128, 64); actx.beginPath(); actx.rect(cx, cy, 128, 64); actx.clip();
  actx.font = '900 46px "Trebuchet MS", system-ui, sans-serif'; actx.textAlign = 'center'; actx.textBaseline = 'middle';
  actx.lineWidth = 9; actx.strokeStyle = '#6a3a5a'; actx.lineJoin = 'round'; actx.strokeText(txt, cx + 64, cy + 34); actx.fillStyle = color; actx.fillText(txt, cx + 64, cy + 34); actx.restore();
  atlasTex.needsUpdate = true;
  const v = { slot, uv: [cx / AW, 1 - (cy + 64) / AH, (cx + 128) / AW, 1 - cy / AH] }; textSlots.set(k, v); return v;
}

const VS = `
attribute vec3 iPos; attribute vec2 iSize; attribute float iRot; attribute vec4 iUV; attribute vec4 iCol;
varying vec2 vUv; varying vec4 vCol;
void main() {
  vUv = mix(iUV.xy, iUV.zw, uv); vCol = iCol;
  float c = cos(iRot), s = sin(iRot); vec2 q = position.xy * iSize;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0); mv.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
uniform sampler2D map; varying vec2 vUv; varying vec4 vCol;
void main() { vec4 t = texture2D(map, vUv) * vCol; if (t.a < 0.01) discard; gl_FragColor = t; }`;

class Batch {
  constructor(scene, n, additive) {
    this.n = n; this.count = 0;
    const g = new THREE.InstancedBufferGeometry(); const q = new THREE.PlaneGeometry(1, 1); g.index = q.index; g.attributes.position = q.attributes.position; g.attributes.uv = q.attributes.uv;
    const mk = (size) => new THREE.InstancedBufferAttribute(new Float32Array(n * size), size).setUsage(THREE.DynamicDrawUsage);
    this.pos = mk(3); this.size = mk(2); this.rot = mk(1); this.uvr = mk(4); this.col = mk(4);
    g.setAttribute('iPos', this.pos); g.setAttribute('iSize', this.size); g.setAttribute('iRot', this.rot); g.setAttribute('iUV', this.uvr); g.setAttribute('iCol', this.col);
    g.instanceCount = 0; this.geo = g;
    const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { map: { value: atlasTex } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 11 : 10; scene.add(this.mesh);
  }
  push(p, x, y, z, w, h, rot, uv, r, g, b, a) {
    const i = this.count; if (i >= this.n) return; this.count++;
    this.pos.setXYZ(i, x, y, z); this.size.setXY(i, w, h); this.rot.setX(i, rot); this.uvr.setXYZW(i, uv[0], uv[1], uv[2], uv[3]); this.col.setXYZW(i, r, g, b, a);
  }
  flush() { this.geo.instanceCount = this.count; for (const a of [this.pos, this.size, this.rot, this.uvr, this.col]) a.needsUpdate = true; this.count = 0; }
}

const _c = new THREE.Color();
// Pooled particle system (dust, hearts, sparkles, rings, score pops): two instanced draw calls in total.
export class FX {
  constructor(scene, n = 320) {
    initAtlas(); this.live = []; this.max = n;
    this.norm = new Batch(scene, n, false); this.addb = new Batch(scene, n, true);
  }
  spawn(o) {
    if (this.live.length >= this.max) return null;
    let uv, slot = null;
    if (o.text) { const t = textUV(o.text, o.color || '#fff'); uv = t.uv; _c.set('#ffffff'); } else { uv = shapeUV[o.map || 'dot']; _c.set(o.color || '#fff'); }
    const p = { pos: o.pos.clone(), vel: o.vel || new THREE.Vector3(), g: o.g ?? 0, life: o.life ?? 0.8, age: 0, s0: o.s0 ?? 0.4, s1: o.s1 ?? 0.8,
      drag: o.drag ?? 0, spin: o.spin ?? 0, aspect: o.aspect || 1, pop: o.pop || 0, fade: o.fade ?? 0.5, rot: o.rot || 0, uv, r: _c.r, gg: _c.g, b: _c.b, add: !!o.add };
    this.live.push(p); return p;
  }
  dust(pos, n = 4, scale = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28;
      this.spawn({ pos: pos.clone().add(new THREE.Vector3(Math.cos(a) * 0.2, 0.1, Math.sin(a) * 0.2)), color: '#fff6e6',
        vel: new THREE.Vector3(Math.cos(a) * 0.9, 0.7 + Math.random() * 0.5, Math.sin(a) * 0.9).multiplyScalar(scale), drag: 3,
        life: 0.5 + Math.random() * 0.25, s0: 0.25 * scale, s1: 0.8 * scale });
    }
  }
  hearts(pos, n = 1, color = '#ff6a9a') {
    for (let i = 0; i < n; i++) this.spawn({ map: 'heart', pos: pos.clone().add(new THREE.Vector3((Math.random() - .5) * .6, 0, (Math.random() - .5) * .6)),
      color, vel: new THREE.Vector3((Math.random() - .5) * 0.6, 1.4 + Math.random() * 0.6, (Math.random() - .5) * 0.6), life: 1.3, s0: 0.1, s1: 0.5, pop: 1, fade: 0.4 });
  }
  burst(pos, color = '#ffe27a', n = 16) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, e = (Math.random() - 0.2) * 1.6, sp = 3 + Math.random() * 3;
      this.spawn({ map: 'star', add: true, color, pos: pos.clone(), vel: new THREE.Vector3(Math.cos(a) * sp, Math.sin(e) * sp + 2, Math.sin(a) * sp),
        g: -9, drag: 1.5, life: 0.6 + Math.random() * 0.4, s0: 0.5, s1: 0.05, spin: (Math.random() - .5) * 8, fade: 0.6 });
    }
    this.spawn({ map: 'ring', add: true, color, pos: pos.clone(), life: 0.45, s0: 0.3, s1: 3.2 });
    this.spawn({ add: true, color, pos: pos.clone(), life: 0.3, s0: 1.0, s1: 3.0 });
  }
  pop(pos, text, color = '#fff6a8') {
    this.spawn({ text, color, pos: pos.clone(), vel: new THREE.Vector3(0, 2.2, 0), drag: 1.6, life: 1.0, s0: 0.3, s1: 1.0, aspect: 2, pop: 1, fade: 0.35 });
  }
  twinkle(pos, color = '#fff6c0') {
    this.spawn({ map: 'star', add: true, color, pos: pos.clone(), vel: new THREE.Vector3(0, 0.4, 0), life: 0.7, s0: 0.05, s1: 0.35, pop: 1, spin: 2 });
  }
  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]; p.age += dt; const k = p.age / p.life;
      if (k >= 1) { this.live.splice(i, 1); continue; }
      p.vel.y += p.g * dt; p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt)); p.pos.addScaledVector(p.vel, dt);
      let sz = p.s0 + (p.s1 - p.s0) * (p.pop ? Math.sin(Math.min(1, k * 3) * Math.PI / 2) : k);
      if (p.pop) sz *= 1 + 0.25 * Math.sin(Math.min(1, k * 4) * Math.PI) * (1 - k);
      p.rot += p.spin * dt;
      const a = k < 1 - p.fade ? 1 : (1 - k) / p.fade;
      (p.add ? this.addb : this.norm).push(p, p.pos.x, p.pos.y, p.pos.z, sz * p.aspect, sz, p.rot, p.uv, p.r, p.gg, p.b, a);
    }
    this.norm.flush(); this.addb.flush();
  }
}

let shared = null, lastTick = -1;
export function getFX(scene) { return shared || (shared = new FX(scene)); }
// Tick once per frame regardless of how many systems call it.
export function tickFX(dt, frame) { if (shared && frame !== lastTick) { lastTick = frame; shared.update(dt); } }
// Shared state between player and creatures (avoids touching main.js).
// playerPos / cameraPos: THREE.Vector3 updated every frame. creaturePos: [{x,z,r}] (r ~ body radius, metres) refreshed every Creatures.update.
// obstacles: optional [{x,z,r,top}] that the nature builder may fill (trunks/bushes/rocks) so the follow camera can pull in.
export const world = { playerPos: new THREE.Vector3(), cameraPos: new THREE.Vector3(), creaturePos: [], obstacles: null, moving: false, frame: 0 };
