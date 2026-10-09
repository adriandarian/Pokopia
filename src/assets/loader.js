// Shared glTF loading. Modules call registerPreload(() => loadModel(url)) at module top level; main.js awaits
// runPreloads() BEFORE building the scene, so every model is cached and getModel()/cloneModel() are synchronous.
//
//   registerPreload('rock', '/assets/nature/rock_a.glb')      // name -> url, preloaded at boot
//   const scene = cloneModel('rock')                            // THREE.Group clone (shared geometry+materials)
//   const { geometry, material } = firstMesh('rock')            // for InstancedMesh building (world-baked transforms)
//
// Assets live in /public/assets/** and are CC0 / permissively licensed. Record each pack in /public/assets/CREDITS.md.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();   // name -> gltf scene (Group)
const wanted = new Map();  // name -> url

export function registerPreload(name, url) { wanted.set(name, url); }

export async function loadModel(name, url) {
  if (cache.has(name)) return cache.get(name);
  const gltf = await loader.loadAsync(url);
  gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  cache.set(name, gltf);
  return gltf;
}

export async function runPreloads(onProgress) {
  const entries = [...wanted.entries()];
  let done = 0;
  await Promise.all(entries.map(async ([name, url]) => {
    try { await loadModel(name, url); }
    catch (e) { console.warn('[assets] failed to load', name, url, e); }
    onProgress && onProgress(++done, entries.length);
  }));
}

export const hasModel = (name) => cache.has(name);
export const getGltf = (name) => cache.get(name);

/** Deep-ish clone (geometry and materials are shared; skinned meshes are cloned properly). */
export function cloneModel(name) {
  const g = cache.get(name);
  if (!g) return null;
  return cloneSkinned(g.scene);
}

/** First mesh with its world matrix baked into a cloned geometry — handy for InstancedMesh. */
export function firstMesh(name) {
  const g = cache.get(name); if (!g) return null;
  let found = null;
  g.scene.updateMatrixWorld(true);
  g.scene.traverse(o => { if (!found && o.isMesh) found = o; });
  if (!found) return null;
  const geometry = found.geometry.clone().applyMatrix4(found.matrixWorld);
  return { geometry, material: found.material };
}

// Minimal SkeletonUtils.clone (avoids importing the whole utils file for the static case).
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
export { THREE };
