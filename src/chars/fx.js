import * as THREE from 'three';

function canvasTex(draw, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const T = {};
function tex(name) {
  if (T[name]) return T[name];
  if (name === 'dot') T[name] = canvasTex((g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  });
  if (name === 'heart') T[name] = canvasTex((g, s) => {
    g.fillStyle = '#fff'; g.translate(s / 2, s / 2 + 4); g.scale(s / 64, s / 64); g.beginPath();
    g.moveTo(0, 24); g.bezierCurveTo(-34, -2, -22, -26, -2, -14); g.bezierCurveTo(-1, -13, 0, -12, 0, -10);
    g.bezierCurveTo(0, -12, 1, -13, 2, -14); g.bezierCurveTo(22, -26, 34, -2, 0, 24); g.fill();
  });
  if (name === 'star') T[name] = canvasTex((g, s) => {
    g.translate(s / 2, s / 2); g.fillStyle = '#fff'; g.beginPath();
    for (let i = 0; i < 8; i++) { const r = i % 2 ? 6 : 30, a = i * Math.PI / 4; g.lineTo(Math.sin(a) * r, -Math.cos(a) * r); }
    g.closePath(); g.fill();
  });
  if (name === 'ring') T[name] = canvasTex((g, s) => {
    g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 5, 0, 7); g.stroke();
  });
  return T[name];
}

const popCache = new Map();
function textTex(txt, color) {
  const k = txt + color; if (popCache.has(k)) return popCache.get(k);
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d');
  g.font = '900 46px "Trebuchet MS", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 9; g.strokeStyle = '#6a3a5a'; g.lineJoin = 'round'; g.strokeText(txt, 64, 34);
  g.fillStyle = color; g.fillText(txt, 64, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; popCache.set(k, t); return t;
}

// Pooled sprite particle system (dust, hearts, sparkles, rings, score pops).
export class FX {
  constructor(scene, n = 260) {
    this.pool = []; this.live = [];
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('dot'), transparent: true, depthWrite: false }));
      s.visible = false; s.frustumCulled = false; scene.add(s); this.pool.push(s);
    }
  }
  spawn(o) {
    const s = this.pool.pop(); if (!s) return null;
    const m = s.material;
    m.map = o.text ? textTex(o.text, o.color || '#fff') : tex(o.map || 'dot');
    m.color.set(o.text ? '#ffffff' : (o.color || '#fff'));
    const bl = o.add ? THREE.AdditiveBlending : THREE.NormalBlending;
    if (m.blending !== bl) { m.blending = bl; m.needsUpdate = true; }
    m.rotation = o.rot || 0; m.opacity = 1; s.visible = true; s.position.copy(o.pos);
    const p = { s, vel: o.vel || new THREE.Vector3(), g: o.g ?? 0, life: o.life ?? 0.8, age: 0, s0: o.s0 ?? 0.4, s1: o.s1 ?? 0.8,
      drag: o.drag ?? 0, spin: o.spin ?? 0, aspect: o.aspect || 1, pop: o.pop || 0, fade: o.fade ?? 0.5 };
    s.scale.set(p.s0 * p.aspect, p.s0, 1);
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
      if (k >= 1) { p.s.visible = false; this.pool.push(p.s); this.live.splice(i, 1); continue; }
      p.vel.y += p.g * dt; p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt)); p.s.position.addScaledVector(p.vel, dt);
      let sz = p.s0 + (p.s1 - p.s0) * (p.pop ? Math.sin(Math.min(1, k * 3) * Math.PI / 2) : k);
      if (p.pop) sz *= 1 + 0.25 * Math.sin(Math.min(1, k * 4) * Math.PI) * (1 - k);
      p.s.scale.set(sz * p.aspect, sz, 1); p.s.material.rotation += p.spin * dt;
      p.s.material.opacity = k < 1 - p.fade ? 1 : (1 - k) / p.fade;
    }
  }
}

let shared = null, lastTick = -1;
export function getFX(scene) { return shared || (shared = new FX(scene)); }
// Tick once per frame regardless of how many systems call it.
export function tickFX(dt, frame) { if (shared && frame !== lastTick) { lastTick = frame; shared.update(dt); } }
// Shared state between player and creatures (avoids touching main.js).
export const world = { playerPos: new THREE.Vector3(), moving: false, frame: 0 };
