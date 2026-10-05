// Emotes: wave, dance, cheer, sit.
// Hook for the chars builder: if `player.hero.emote(name)` exists we call it (and skip our pose layer);
// otherwise we layer a pose on top of hero.update (arms/torso/legs/head are public on the hero API).
// Always emits the bus event 'emote' { name }.
import * as THREE from 'three';
import { emit } from './events.js';
import { getFX } from '../chars/fx.js';

export const EMOTES = [
  { id: 'wave', icon: '👋', label: 'Wave', dur: 2.2 }, { id: 'dance', icon: '💃', label: 'Dance', dur: 4 },
  { id: 'cheer', icon: '🎉', label: 'Cheer', dur: 2.2 }, { id: 'sit', icon: '🧘', label: 'Sit', dur: 6 },
];
let player, cur = null, t = 0;
const lerp = THREE.MathUtils.lerp;

export function playEmote(id) {
  const e = EMOTES.find(x => x.id === id); if (!e || !player) return;
  emit('emote', { name: id });
  if (player.hero.emote) { player.hero.emote(id); return; }
  cur = { ...e, t: 0 };
  const fx = getFX(window.__game.scene), p = player.mesh.position;
  if (id === 'cheer') { player.jumpBuf = 0.12; fx.burst(p.clone().setY(p.y + 2.2), '#ffe27a', 16); }
  if (id === 'dance') fx.hearts(p.clone().setY(p.y + 2.2), 3);
}
export function initEmotes(pl) {
  player = pl;
  const hero = pl.hero, orig = hero.update.bind(hero);
  hero.update = function (dt, s) {
    orig(dt, s);
    if (!cur || hero.emote) return;
    // movement cancels emotes
    if (s.speed > 0.8 || !s.grounded && cur.id !== 'cheer') { cur = null; hero.root.children[0].position.y = 0; return; }
    cur.t += dt; const k = Math.min(1, cur.t / 0.25), T = cur.t, [aL, aR] = hero.arms, rig = hero.root.children[0];
    const out = Math.min(1, (cur.dur - cur.t) / 0.3), w = Math.min(k, Math.max(0, out));
    const set = (o, rx, rz) => { o.rotation.x = lerp(o.rotation.x, rx, w); o.rotation.z = lerp(o.rotation.z, rz, w); };
    switch (cur.id) {
      case 'wave': set(aR, 0, -2.6 + Math.sin(T * 14) * 0.4); break;
      case 'cheer': set(aL, 0, 2.7 + Math.sin(T * 12) * 0.2); set(aR, 0, -2.7 - Math.sin(T * 12) * 0.2); break;
      case 'dance': {
        set(aL, Math.sin(T * 8) * 0.6, 1.8 + Math.sin(T * 8) * 0.5); set(aR, -Math.sin(T * 8) * 0.6, -1.8 + Math.sin(T * 8) * 0.5);
        hero.torso.rotation.z = lerp(hero.torso.rotation.z, Math.sin(T * 8) * 0.25, w);
        hero.head.rotation.z = lerp(hero.head.rotation.z, -Math.sin(T * 8) * 0.2, w);
        rig.position.y = Math.abs(Math.sin(T * 8)) * 0.18 * w;
        hero.legs[0].rotation.x = Math.sin(T * 8) * 0.5 * w; hero.legs[1].rotation.x = -Math.sin(T * 8) * 0.5 * w;
        player.mesh.rotation.y += dt * 2.2 * w; break;
      }
      case 'sit':
        hero.legs.forEach(l => { l.rotation.x = lerp(l.rotation.x, -1.45, w); });
        rig.position.y = lerp(rig.position.y, -0.32, w); set(aL, 0.4, 0.3); set(aR, 0.4, -0.3); break;
    }
    if (cur.id !== 'dance' && cur.id !== 'sit') rig.position.y = 0;
    if (cur.t >= cur.dur) { cur = null; rig.position.y = 0; }
  };
  addEventListener('keydown', e => {
    if (e.repeat || document.getElementById('overlay')) return;
    const i = '1234'.indexOf(e.key); if (i >= 0 && e.key.length === 1) playEmote(EMOTES[i].id);
  });
}
