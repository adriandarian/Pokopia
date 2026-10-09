import * as THREE from 'three';
import { runPreloads } from './assets/loader.js';
import { buildTerrain, scatterNature } from './terrain.js';
import { buildSky } from './sky.js';
import { Player } from './player.js';
import { Creatures, Collectibles } from './creatures.js';
import { initGame } from './game/index.js';
import { emit } from './game/events.js';
import { setupPost } from './fx/post.js';
import { initQuality, onTierChange, applyCasters, applyDetail, frame as qualityFrame } from './quality.js';

const loading = window.__loading || { set() {}, done() {} };
const marks = (window.__boot = { t0: performance.now(), marks: {} });
const mark = (k) => { marks.marks[k] = Math.round(performance.now() - marks.t0); };
// Let the browser paint the loading bar between heavy synchronous build steps.
const paint = () => new Promise(r => { let d = false; const go = () => { if (!d) { d = true; r(); } }; requestAnimationFrame(() => setTimeout(go, 0)); setTimeout(go, 60); });

async function boot() {
  loading.set(0.04, 'Waking up the island…');
  // Models registered by modules at import time (registerPreload) are fetched and cached before the scene is built.
  await runPreloads((done, total) => loading.set(0.04 + 0.36 * (done / Math.max(1, total)), 'Gathering things…'));
  mark('preloaded'); loading.set(0.4, 'Shaping the land…'); await paint();

  // antialias:false on purpose: the scene is rendered to a (multisampled) render target by post.js; the canvas only receives a fullscreen quad.
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.body.prepend(renderer.domElement);
  initQuality(renderer); // picks the tier (saved choice, else heuristics) BEFORE anything is built

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1000);

  const sky = buildSky(scene);
  buildTerrain(scene);
  mark('terrain'); loading.set(0.55, 'Planting trees and flowers…'); await paint();
  scatterNature(scene);
  mark('nature'); loading.set(0.78, 'Waking the creatures…'); await paint();
  const player = new Player(scene, camera, renderer.domElement);
  const creatures = new Creatures(scene);
  let score = 0;
  const scoreEl = document.getElementById('score');
  const collect = new Collectibles(scene, () => { score++; scoreEl.textContent = `🌸 ${score}`; emit('collect', { kind: 'gem', amount: 1 }); });
  mark('creatures'); loading.set(0.9, 'Polishing the sunshine…'); await paint();

  const post = setupPost(renderer, scene, camera);
  // Pixel ratio, MSAA and post passes follow the quality tier live.
  let shaderSig = null;
  onTierChange((p) => {
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, p.dprCap));
    renderer.setSize(innerWidth, innerHeight);
    post.setProfile(p);
    applyCasters(scene); applyDetail(scene);
    // shadow filter + dapple change shader source: recompile lit materials once (sky.js already switched the chunk / cache keys)
    renderer.shadowMap.type = p.shadow.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    const sig = `${p.dapple}|${p.shadow.soft}`;
    if (shaderSig !== null && sig !== shaderSig) {
      renderer.shadowMap.needsUpdate = true;
      scene.traverse(o => { const m = o.material; if (m) for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true; });
    }
    shaderSig = sig;
  });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  const clock = new THREE.Clock();
  let lastNow = performance.now(), first = true;
  renderer.setAnimationLoop(() => {
    const now = performance.now(), raw = now - lastNow; lastNow = now;
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    player.update(dt); creatures.update(dt, t); collect.update(t, player.mesh.position); sky.update(t);
    post.render(dt);
    qualityFrame(raw);
    if (first) { first = false; mark('firstFrame'); loading.set(1, 'Ready!'); setTimeout(() => { loading.done(); mark('loadingHidden'); }, 120); }
  });

  // Handles for automated visual QA (screenshots from fixed viewpoints).
  window.__game = ({ scene, camera, renderer, player, setCam(x, y, z, lx, ly, lz) { player.frozen = true; camera.position.set(x, y, z); camera.lookAt(lx, ly, lz); } });
  initGame({ player, creatures, collect, camera });
  mark('game');
}

boot();
