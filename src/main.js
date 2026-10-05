import * as THREE from 'three';
import { buildTerrain, scatterNature } from './terrain.js';
import { buildSky } from './sky.js';
import { Player } from './player.js';
import { Creatures, Collectibles } from './creatures.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1000);

const sky = buildSky(scene);
buildTerrain(scene);
scatterNature(scene);
const player = new Player(scene, camera, renderer.domElement);
const creatures = new Creatures(scene);
let score = 0;
const scoreEl = document.getElementById('score');
const collect = new Collectibles(scene, () => { score++; scoreEl.textContent = `🌸 ${score}`; });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  player.update(dt); creatures.update(dt, t); collect.update(t, player.mesh.position); sky.update(t);
  renderer.render(scene, camera);
});

// Handles for automated visual QA (screenshots from fixed viewpoints).
window.__game = { scene, camera, renderer, player, setCam(x, y, z, lx, ly, lz) { player.frozen = true; camera.position.set(x, y, z); camera.lookAt(lx, ly, lz); } };
