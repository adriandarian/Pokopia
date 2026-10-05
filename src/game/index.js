// Game layer entry. initGame({ player, creatures, collect, camera }) wires state, quests, audio, cosmetics, UI.
import { state, load, save, saveSoon, addPetals } from './state.js';
import { SPECIES } from './data.js';
import { on, emit } from './events.js';
import { initQuests } from './quests.js';
import { initCosmetics } from './cosmetics.js';
import { initAudio } from './audio.js';
import { initUI, setPrompt } from '../ui/ui.js';

export function initGame(api) {
  load();
  // Core bookkeeping subscribes first so later handlers see normalised payloads.
  on('collect', e => { state.totalGems += e.amount ?? 1; addPetals(e.amount ?? 1); });
  on('discover', e => { if (state.discovered[e.species]) { e.repeat = true; return; } state.discovered[e.species] = Date.now(); saveSoon(); });
  on('befriend', e => {
    if (state.befriended[e.species]) { e.repeat = true; return; }
    state.befriended[e.species] = Date.now(); state.discovered[e.species] ||= Date.now(); addPetals(5); saveSoon();
  });
  initQuests();
  if (api.player?.mesh) initCosmetics(api.player.mesh);
  initUI({ initAudio });

  // Fallback creature interaction (other modules may also emit these events directly).
  const met = new WeakSet(); const hugged = new WeakSet(); let near = null;
  const speciesOf = (c, i) => c.species?.id || c.species || c.name || SPECIES[i % 4].id;
  const tryBefriend = () => {
    if (!near || hugged.has(near.c)) return;
    hugged.add(near.c);
    emit('befriend', { species: near.sp, creature: near.c });
    emit('toast', { icon: '💕', text: `You befriended a ${near.sp}!`, kind: 'love' });
    setPrompt(null);
  };
  addEventListener('keydown', e => { if (e.code === 'KeyE') tryBefriend(); });
  on('ui:befriend', tryBefriend);
  let acc = 0;
  window.__gameTick = (dt) => {
    state.playedSeconds += dt;
    acc += dt; if (acc < 0.2) return; acc = 0;
    const list = api.creatures?.list, pp = api.player?.mesh?.position; if (!list || !pp) return;
    let best = null, bd = 1e9;
    list.forEach((c, i) => {
      const p = (c.m || c.mesh)?.position; if (!p) return;
      const d = Math.hypot(p.x - pp.x, p.z - pp.z), sp = speciesOf(c, i);
      if (d < 9 && !met.has(c)) { met.add(c); emit('discover', { species: sp, creature: c }); if (!state.discovered[sp] || true) emit('toast', { icon: '🔍', text: `${sp} spotted!`, kind: 'info' }); }
      if (d < 3.6 && !hugged.has(c) && d < bd) { bd = d; best = { c, sp }; }
    });
    near = best; setPrompt(best ? `Press E or tap to befriend ${best.sp}` : null);
  };
  { let last = performance.now(); const loop = (n) => { window.__gameTick((n - last) / 1000); last = n; requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  window.__emit = emit; window.__gameState = state; window.__save = save;
}
