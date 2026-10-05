// Touch controls: virtual joystick (left), jump + run (right), drag-to-look on the canvas.
// Drives window.__game.player.keys (KeyW/A/S/D, Space, ShiftLeft) so player.js needs no changes.
import { state } from './state.js';
import { emit } from './events.js';

export function isTouchDevice() {
  const q = new URLSearchParams(location.search);
  if (q.get('touch') === '1') return true; if (q.get('touch') === '0') return false;
  if (state.settings.touch === 'on') return true; if (state.settings.touch === 'off') return false;
  return (navigator.maxTouchPoints > 0) && matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window && innerWidth < 900;
}

export function initTouch(player) {
  if (document.getElementById('touch')) return;
  const el = document.createElement('div'); el.id = 'touch'; el.className = 'hidden';
  el.innerHTML = `<div id="joy"><div id="joy-knob"></div></div>
    <div id="tbtns"><button id="t-run" aria-label="Run (hold)">RUN</button><button id="t-jump" aria-label="Jump">⤒<small>JUMP</small></button></div>`;
  document.getElementById('ui-root').appendChild(el);
  const K = player.keys, joy = el.querySelector('#joy'), knob = el.querySelector('#joy-knob');
  let jid = null, cx = 0, cy = 0; const R = 56;
  const setDir = (dx, dy) => {
    const m = Math.hypot(dx, dy), t = 0.28 * R;
    K.KeyA = dx < -t; K.KeyD = dx > t; K.KeyW = dy < -t; K.KeyS = dy > t;
    // diagonal feel: allow both axes when both clear the threshold
    if (m > R * 0.92) K.ShiftLeft = true; else if (!runHeld) K.ShiftLeft = false;
  };
  let runHeld = false;
  const reset = () => { jid = null; knob.style.transform = ''; K.KeyA = K.KeyD = K.KeyW = K.KeyS = false; if (!runHeld) K.ShiftLeft = false; };
  joy.addEventListener('pointerdown', e => { jid = e.pointerId; try { joy.setPointerCapture(jid); } catch {} const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; mv(e); e.preventDefault(); });
  const mv = e => { if (e.pointerId !== jid) return; let dx = e.clientX - cx, dy = e.clientY - cy; const m = Math.hypot(dx, dy); if (m > R) { dx *= R / m; dy *= R / m; } knob.style.transform = `translate(${dx}px,${dy}px)`; setDir(dx, dy); };
  joy.addEventListener('pointermove', mv);
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) joy.addEventListener(ev, e => { if (e.pointerId === jid) reset(); });
  const hold = (id, on, off) => { const b = el.querySelector(id); b.addEventListener('pointerdown', e => { try { b.setPointerCapture(e.pointerId); } catch {} b.classList.add('down'); on(); e.preventDefault(); }); for (const ev of ['pointerup', 'pointercancel']) b.addEventListener(ev, () => { b.classList.remove('down'); off(); }); };
  hold('#t-run', () => { runHeld = true; K.ShiftLeft = true; }, () => { runHeld = false; K.ShiftLeft = false; });
  hold('#t-jump', () => { K.Space = true; player.jumpBuf = 0.12; }, () => { K.Space = false; });

  // Drag-to-look with our own deltas (movementX is unreliable on iOS). Swallow touch moves from canvas drags so
  // player.js's own movementX handler doesn't double-apply.
  const looks = new Map();
  addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && e.target.tagName === 'CANVAS') looks.set(e.pointerId, { x: e.clientX, y: e.clientY }); }, true);
  addEventListener('pointermove', e => {
    const l = looks.get(e.pointerId); if (!l) return;
    player.yaw -= (e.clientX - l.x) * 0.006; player.pitch = Math.min(1.3, Math.max(0.1, player.pitch + (e.clientY - l.y) * 0.005));
    l.x = e.clientX; l.y = e.clientY; e.stopImmediatePropagation();
  }, true);
  for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, e => looks.delete(e.pointerId), true);

  const show = () => el.classList.toggle('hidden', !(isTouchDevice() && document.body.classList.contains('playing')));
  document.body.classList.toggle('touch-ui', isTouchDevice());
  show();
  new MutationObserver(show).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  return { refresh: () => { document.body.classList.toggle('touch-ui', isTouchDevice()); show(); } };
}
