// Applies wardrobe choices to the hero mesh.
import * as THREE from 'three';
import { state } from './state.js';
import { WARDROBE } from './data.js';
import { on } from './events.js';

let hero, hatGroup, shirtMat;
const std = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });
function buildHat(id) {
  const g = new THREE.Group(); g.position.y = 2.35;
  const add = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  switch (id) {
    case 'hat_party': { const c = add(new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 16), std('#ff7ac8')), 0, 0.15); c.rotation.z = 0.12; add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), std('#fff27a')), 0.05, 0.6); break; }
    case 'hat_crown': { add(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.32, 0.28, 8, 1, true), new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: 0.5, roughness: 0.3, side: THREE.DoubleSide })), 0, -0.05);
      for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; add(new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 6), new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: 0.5, roughness: 0.3 })), Math.cos(a) * 0.34, 0.2, Math.sin(a) * 0.34); } break; }
    case 'hat_straw': add(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.05, 24), std('#f0cf7a')), 0, -0.12); add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.35, 20), std('#f0cf7a')), 0, 0.05); add(new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.08, 20), std('#ff6b6b')), 0, -0.08); break;
    case 'hat_cat': for (const s of [-1, 1]) { const e = add(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 4), std('#444')), s * 0.3, 0.05); e.rotation.z = -s * 0.25; add(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 4), std('#ff9ecb')), s * 0.3, 0.03, 0.06).rotation.z = -s * 0.25; } break;
    case 'hat_flower': add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.3, 14), std('#d9774a')), 0, -0.02); add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 6), std('#4caf50')), 0, 0.3);
      for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), std('#ff8fcf')), Math.cos(a) * 0.13, 0.52, Math.sin(a) * 0.13); } add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), std('#ffe066')), 0, 0.52); break;
    default: return null;
  }
  return g;
}
export function applyCosmetics() {
  if (!hero) return;
  if (hatGroup) { hero.remove(hatGroup); hatGroup = null; }
  const hat = buildHat(state.equipped.hat); if (hat) { hero.add(hat); hatGroup = hat; }
  const col = WARDROBE.find(w => w.id === state.equipped.color); if (col && shirtMat) shirtMat.color.set(col.value);
}
export function initCosmetics(heroMesh) {
  hero = heroMesh;
  hero.traverse(o => { if (o.isMesh && o.material.color && o.material.color.getHexString() === 'ff6b6b') shirtMat = o.material; });
  applyCosmetics(); on('equip', applyCosmetics);
}
