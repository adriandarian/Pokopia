let shared = null, lastTick = -1;
export function getFX(scene) { return shared || (shared = new FX(scene)); }
// Tick once per frame regardless of how many systems call it.
export function tickFX(dt, frame) { if (shared && frame !== lastTick) { lastTick = frame; shared.update(dt); } }
// Shared state between player and creatures (avoids touching main.js).
export const world = { playerPos: new THREE.Vector3(), moving: false, frame: 0 };
