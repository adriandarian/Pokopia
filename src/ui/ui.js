// HUD, title screen, panels (quests / journal / wardrobe / settings), toasts and celebration FX. Plain DOM, no deps.
import './style.css';
import { state, save, saveSoon, addPetals, resetSave } from '../game/state.js';
import { SPECIES, WARDROBE, SLOTS, COLOR_ICON, BOND_AT, featuredSpecies } from '../game/data.js';
import { isTouchDevice } from '../game/touch.js';
import { EMOTES, playEmote, senseLeft } from '../game/emotes.js';
import { LEVEL_NAME, LEVEL_AT, DECOR, DECOR_CATS, DECOR_BY_ID, eventFor, MAX_LEVEL, CHARM_MS } from '../game/content.js';
import { startPlacing, moveDecor, storeIndex, sizePlacing, tintPlacing, linePlacing, rotatePlacing, cancelPlacing, confirmPlacing, storeMoving, buyDecor, charm, nextCharm } from '../game/decor.js';
import { makePreview } from '../game/cosmetics.js';
import { applySettings } from '../game/audio.js';
import { ptsOf, nextAt, wishOf, activeWishText, lvlOf, nextNeeds, mem } from '../game/friends.js';
import { on, emit } from '../game/events.js';
import { def, claim, allDone, newSet } from '../game/quests.js';
import { sfx, initAudio as _ia } from '../game/audio.js';
import { getTier, getEffectiveTier, setTier } from '../quality.js';

const $ = (s, r = document) => r.querySelector(s);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
let root, overlay, openPanel = null, started = false;

export function setPrompt(text, sub, action = true, chips = null) {
  const el = $('#prompt'); if (!el) return;
  if (!text) { el.classList.add('hidden'); return; }
  const first = el.classList.contains('hidden'); el.classList.remove('hidden');
  el.classList.toggle('hint', !action);
  const b = $('button', el); b.textContent = text; b.disabled = !action; $('.psub', el).textContent = sub || '';
  if (first && action) sfx.open();
  const cb = $('.chips', el), sig = chips ? JSON.stringify(chips) : '';
  if (cb.dataset.sig !== sig) {
    cb.dataset.sig = sig; cb.innerHTML = chips ? chips.map(c => `<button class="chip ${c.sel ? 'sel' : ''} ${c.fav ? 'fav' : ''}" data-k="${c.key}" title="Choose this gift (G)">${c.icon}<small>${c.n}</small></button>`).join('') : '';
    cb.querySelectorAll('.chip').forEach(b => b.onclick = e => { e.stopPropagation(); emit('ui:giftkey', { key: b.dataset.k }); });
  }
}
const sv = (inner, bg = '#fff4e2') => `<svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"><rect x="2" y="2" width="60" height="60" rx="16" fill="${bg}"/>${inner}</svg>`;
const DECOR_SVG = {
  b_floor: sv('<path d="M8 38 L32 26 L56 38 L32 50 Z" fill="#d9a066" stroke="#8a5a3a" stroke-width="2"/><path d="M8 38 V44 L32 56 V50 Z" fill="#b9824f"/><path d="M56 38 V44 L32 56 V50 Z" fill="#a06f40"/><path d="M20 32 L44 44 M32 26 L56 38 M8 38 L32 50" stroke="#8a5a3a" stroke-width="1" opacity=".5"/>', '#f1e4d0'),
  b_wall: sv('<rect x="10" y="12" width="44" height="40" rx="3" fill="#fff0dc" stroke="#9c8a74" stroke-width="2"/><rect x="24" y="22" width="16" height="14" rx="2" fill="#9fd8ff" stroke="#fff" stroke-width="3"/><rect x="10" y="46" width="44" height="6" fill="#c9bdb0"/>', '#e9f4ff'),
  b_door: sv('<rect x="10" y="12" width="44" height="40" rx="3" fill="#fff0dc" stroke="#9c8a74" stroke-width="2"/><rect x="23" y="24" width="18" height="28" rx="9" fill="#9a6b45"/><circle cx="37" cy="40" r="2" fill="#ffd23f"/>', '#e9f4ff'),
  b_roof: sv('<path d="M6 42 L32 14 L58 42 Z" fill="#ee7a8d" stroke="#c9566e" stroke-width="2"/><path d="M14 42 L32 22 L50 42" fill="none" stroke="#fff" stroke-width="2" opacity=".6"/><rect x="6" y="42" width="52" height="5" fill="#c9566e"/>', '#fde8ee'),
  d_bridge: sv('<path d="M6 44 Q32 14 58 44" fill="none" stroke="#9a6b45" stroke-width="8" stroke-linecap="round"/><path d="M12 36 V26 M22 28 V20 M32 25 V17 M42 28 V20 M52 36 V26" stroke="#fff4e2" stroke-width="3" stroke-linecap="round"/><path d="M12 28 Q32 6 52 28" fill="none" stroke="#fff4e2" stroke-width="3"/>', '#dff3ff'),
  d_windmill: sv('<path d="M24 56 L28 28 H36 L40 56 Z" fill="#fff0dc" stroke="#9c8a74" stroke-width="2"/><path d="M26 28 L32 18 L38 28 Z" fill="#ee7a8d"/><g stroke="#fff" stroke-width="5" stroke-linecap="round"><path d="M32 26 L14 14"/><path d="M32 26 L50 14"/><path d="M32 26 L14 38"/><path d="M32 26 L50 38"/></g><circle cx="32" cy="26" r="3" fill="#9a6b45"/>', '#e4f4ff'),
  d_gazebo: sv('<path d="M8 28 L32 10 L56 28 Z" fill="#ee7a8d" stroke="#c9566e" stroke-width="2"/><path d="M14 30 V52 M26 30 V52 M38 30 V52 M50 30 V52" stroke="#fff4e2" stroke-width="4"/><rect x="8" y="50" width="48" height="6" rx="3" fill="#e9d3b0"/>', '#f1ffe9'),
  d_stones: sv('<ellipse cx="20" cy="42" rx="11" ry="7" fill="#cdbfae" stroke="#9c8a74" stroke-width="2"/><ellipse cx="40" cy="30" rx="10" ry="6" fill="#d9ccb9" stroke="#9c8a74" stroke-width="2"/><ellipse cx="42" cy="50" rx="9" ry="5" fill="#c4b6a3" stroke="#9c8a74" stroke-width="2"/>', '#e8f5e0'),
  d_well: sv('<rect x="16" y="32" width="32" height="20" rx="4" fill="#c9bdb0" stroke="#9c8a74" stroke-width="2"/><rect x="18" y="34" width="28" height="5" fill="#4fb4e8"/><path d="M14 30 L32 12 L50 30 Z" fill="#e5788f"/><path d="M20 30 V50 M44 30 V50" stroke="#9a6b45" stroke-width="3"/>', '#e4f4ff'),
};
const decIcon = (d) => DECOR_SVG[d.id] || (d.species ? `<span class="big">${(SPECIES.find(x => x.id === d.species) || {}).icon || '🧸'}</span>` : `<span class="big">${d.icon}</span>`);
const T_ = () => isTouchDevice();
const giveWord = () => (T_() ? 'tap the Give button' : 'press E');
const controlsText = () => isTouchDevice()
  ? [['🕹️', 'Left stick', 'Move'], ['⤒', 'JUMP button', 'Jump'], ['💨', 'RUN (hold)', 'Run'], ['👆', 'Drag the view', 'Look around'], ['🎁', 'Give button', 'Gift near a creature'], ['😊', 'Emote button', 'Wave, dance...']]
  : [['⌨️', 'WASD / arrows', 'Move'], ['␣', 'Space', 'Jump'], ['⇧', 'Shift', 'Run'], ['🖱️', 'Drag mouse', 'Look around'], ['E', 'E (or F / Enter)', 'Give a gift, place or move decor'], ['R', 'R key', 'Rotate decor while placing'], ['1-5', 'Number keys', 'Emotes'], ['J Q H', 'J / Q / H', 'Journal, quests, help']];
const controlsHtml = () => `<div class="ctrls">${controlsText().map(([i, k, d]) => `<div class="ctrl"><b>${i}</b><span><strong>${k}</strong><small>${d}</small></span></div>`).join('')}</div>`;

export function initUI({ initAudio }) {
  root = h(`<div id="ui-root">
    <div id="hud" class="hidden">
      <div id="hud-left">
        <div class="pill" id="p-petals"><span class="ico">🌸</span><div><small>Petals</small><span class="val" id="petals">0</span></div></div>
        <div class="pill day" id="p-day"><span class="ico">☀️</span><div><small>Day</small><span class="val" id="day">1</span></div></div>
        <div class="pill bag" id="p-bag" title="Berries and gems you can give as gifts"><span class="ico">🎒</span><div><small>Gifts</small><span class="val" id="bag">🍓0 💎0</span></div></div>
      </div>
      <div id="tracker"></div>
      <div id="hud-right">
        <div class="row1">
          <button class="round pink" id="b-quests" aria-label="Quests" title="Quests (Q)">⭐<span class="badge hidden" id="qbadge">0</span></button>
          <button class="round mint" id="b-journal" aria-label="Creature journal" title="Journal (J)">📖</button>
          <button class="round sun" id="b-shop" aria-label="Wardrobe" title="Wardrobe">👒</button>
          <button class="round teal" id="b-decor" aria-label="Island decorating" title="Island">🏡</button>
          <button class="round" id="b-emote" aria-label="Emotes" title="Emotes (1-5)">😊</button>
        </div>
        <div class="row2">
          <button class="round sm" id="b-mute" aria-label="Mute" title="Sound on/off">🔊</button>
          <button class="round sm grape" id="b-help" aria-label="Help" title="Help (H)">?</button>
          <button class="round sm grape" id="b-settings" aria-label="Settings" title="Settings">⚙️</button>
        </div>
      </div>
      <div id="emotewheel" class="hidden">${EMOTES.map((e, i) => `<button class="round" data-e="${e.id}" aria-label="${e.label}" title="${e.label}">${e.icon}<small>${i + 1}</small></button>`).join('')}</div>
      <div id="placebar" class="hidden"><div class="ph"></div><div class="pb"><button class="btn mint sm" id="pl-ok">✔ Place</button><button class="btn sun sm" id="pl-rot">⟲ Turn</button><button class="btn sm" id="pl-size">📏 Size</button><button class="btn sm" id="pl-tint">🎨 Colour</button><button class="btn sm" id="pl-line">↔ Line</button><button class="btn sm" id="pl-store">📦 Store</button><button class="btn sm grey" id="pl-x">✕</button></div></div>
      <div id="prompt" class="hidden"><button class="btn mint"></button><div class="chips"></div><small class="psub"></small></div>
      <div id="help"></div>
    </div>
    <div id="toasts" aria-live="polite"></div>
    <div id="title">
      <div class="logo" aria-label="Pokopia"></div>
      <div class="tagline">A cozy island to explore, collect and make friends</div>
      <button class="btn big" id="play">▶ Play</button>
      <div class="fine">Everything is free and earned by playing. No ads, no purchases, no timers. Your progress is saved on this device.</div>
    </div>
  </div>`);
  document.body.appendChild(root);
  const setHelp = () => { $('#help').textContent = isTouchDevice() ? 'Stick: move · Buttons: jump and run · Drag: look · Tap Give near creatures' : 'WASD/arrows move · Shift run · Space jump · Drag look · E gift · 1-5 emotes · H help'; };
  setHelp(); on('settings', setHelp);

  // logo + sparkles
  const colors = ['#ff7eb6', '#ffb347', '#ffd24a', '#5fd9a8', '#6cc4ff', '#a77bff', '#ff7eb6'];
  const logo = $('.logo'); 'Pokopia'.split('').forEach((c, i) => { const s = document.createElement('span'); s.textContent = c; s.style.setProperty('--i', i); s.style.setProperty('--c', colors[i]); s.style.setProperty('--r', (i % 2 ? -4 : 4) + 'deg'); logo.appendChild(s); });
  for (let i = 0; i < 22; i++) { const s = h(`<span class="sparkle">✦</span>`); s.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 100}%;--s:${12 + Math.random() * 22}px;--d:${Math.random() * 3}s`; $('#title').appendChild(s); }

  $('#play').onclick = () => {
    if (started) return; started = true;
    initAudio(); sfx.open();
    $('#title').classList.add('leave'); $('#hud').classList.remove('hidden'); document.body.classList.add('playing');
    setTimeout(() => $('#title').remove(), 800);
    emit('play');
    if (state.lastWelcome !== state.day) { state.lastWelcome = state.day; saveSoon(); setTimeout(() => emit('toast', { icon: '👋', text: state.day === 1 ? 'Welcome to Pokopia!' : `A new day: day ${state.day}!`, kind: 'good' }), 700); }
    setTimeout(() => { $('#help').style.opacity = 0; }, 14000);
  };
  $('#prompt button').onclick = () => emit('ui:interact');
  $('#prompt .chips').addEventListener('keydown', e => {
    const chips = [...e.currentTarget.querySelectorAll('.chip')], i = chips.indexOf(document.activeElement);
    if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') { e.stopPropagation(); e.preventDefault(); chips[(i + (e.code === 'ArrowRight' ? 1 : chips.length - 1)) % chips.length]?.focus(); }
    else if (e.code === 'Space' || e.code === 'Enter') { e.stopPropagation(); }
    else if (e.code === 'Escape') { document.activeElement.blur(); }
  });
  addEventListener('keydown', e => {
    if (e.code !== 'Tab' || !started || document.getElementById('overlay')) return;
    const chips = $('#prompt .chips')?.querySelectorAll('.chip'); if (!chips || !chips.length || $('#prompt').classList.contains('hidden')) return;
    e.preventDefault(); const sel = [...chips].find(c => c.classList.contains('sel')) || chips[0]; sel.focus();
  });
  $('#b-emote').onclick = () => $('#emotewheel').classList.toggle('hidden');
  const senseBtn = $('#emotewheel [data-e=sense]');
  setInterval(() => { if (!senseBtn) return; const l = senseLeft(); senseBtn.classList.toggle('cool', l > 0); senseBtn.dataset.cd = l > 0 ? Math.ceil(l / 1000) + 's' : ''; }, 500);
  $('#emotewheel').querySelectorAll('[data-e]').forEach(b => b.onclick = () => { playEmote(b.dataset.e); $('#emotewheel').classList.add('hidden'); });
  $('#b-help').onclick = () => toggle('help'); $('#b-decor').onclick = () => toggle('decor');
  const muteIcon = () => { $('#b-mute').textContent = state.settings.mute ? '🔇' : '🔊'; };
  $('#b-mute').onclick = () => { state.settings.mute = !state.settings.mute; applySettings(); saveSoon(); muteIcon(); };
  muteIcon();
  $('#pl-ok').onclick = () => confirmPlacing(); $('#pl-rot').onclick = () => rotatePlacing(); $('#pl-x').onclick = () => cancelPlacing(); $('#pl-store').onclick = () => storeMoving(); $('#pl-size').onclick = () => sizePlacing(); $('#pl-tint').onclick = () => tintPlacing(); $('#pl-line').onclick = () => linePlacing();
  on('placereason', e => { const ph = $('#placebar .ph'); if (!ph) return; ph.classList.toggle('bad', !!e.text); if (e.text) ph.textContent = '🚫 ' + e.text; else ph.textContent = T_() ? 'Use the stick to aim the ghost' : 'Walk to aim · R rotate · E place · Esc cancel'; });
  on('placing', e => {
    $('#placebar').classList.toggle('hidden', !e.on); document.body.classList.toggle('placing', !!e.on); if (!e.on) return;
    $('#pl-store').classList.toggle('hidden', !e.moving); document.body.classList.add('placing');
    $('#placebar .ph').textContent = (T_() ? 'Use the stick to aim the ghost' : 'Walk to aim · R rotate · E place · Esc cancel') + (e.moving ? ' · moving' : '');
    $('#pl-size').classList.toggle('hidden', !!e.kit); $('#pl-line').classList.toggle('hidden', !e.line_ok); $('#pl-line').classList.toggle('on', !!e.line);
    $('#emotewheel').classList.add('hidden');
  });
  // soft click sound on every button/tab/card press
  root.addEventListener('pointerdown', e => { if (e.target.closest('.btn,.tab,.card,.round')) sfx.click(); }, true);
  const applyTextSize = () => { const t = state.settings.textSize || 1; document.documentElement.style.setProperty('--ts', t); document.documentElement.style.setProperty('--tsh', Math.min(t, 1.15)); document.body.classList.toggle('ts-big', t > 1.1); };
  applyTextSize(); on('settings', applyTextSize);

  const panels = { quests: renderQuests, journal: renderJournal, shop: renderShop, settings: renderSettings, help: renderHelp, decor: renderDecor };
  $('#b-quests').onclick = () => toggle('quests'); $('#b-journal').onclick = () => toggle('journal');
  $('#b-shop').onclick = () => toggle('shop'); $('#b-settings').onclick = () => toggle('settings');
  addEventListener('keydown', e => {
    if (!started) { if (e.code === 'Enter' || e.code === 'Space') $('#play').click(); return; }
    if (e.code === 'Escape' && openPanel) close();
    else if (e.code === 'KeyJ') toggle('journal'); else if (e.code === 'KeyQ') toggle('quests'); else if (e.code === 'KeyH' || e.key === '?') toggle('help');
  });
  function toggle(name) { if (openPanel === name) close(); else open(name); }
  function open(name) {
    close(true); openPanel = name; sfx.open();
    overlay = h(`<div id="overlay"></div>`); overlay.onclick = e => { if (e.target === overlay) close(); };
    overlay.appendChild(panels[name]()); root.appendChild(overlay); emit('ui:open', { panel: name });
    $('.x', overlay).focus();
    if (window.__game?.player) window.__game.player.keys = {};
  }
  function close(silent) { disposePreview(); tryOn = {}; if (overlay) { overlay.remove(); overlay = null; if (!silent) sfx.close(); emit('ui:close', { panel: openPanel }); } openPanel = null; }
  const rerender = (name) => { if (openPanel !== name) return; const st = overlay.firstChild.querySelector('.body')?.scrollTop || 0; const p = panels[name](); overlay.firstChild.replaceWith(p); p.style.animation = 'none'; const b = $('.body', p); if (b) b.scrollTop = st; };

  function panel(title, grad, bodyHtml) {
    const p = h(`<section class="panel tall" role="dialog" aria-label="${title}" style="--hc1:${grad[0]};--hc2:${grad[1]}"><header><h2>${title}</h2><button class="x" aria-label="Close">✕</button></header><div class="body">${bodyHtml}</div></section>`);
    $('.x', p).onclick = () => close(); return p;
  }

  // ---- quests ----
  function questRow(q, i) {
    const d = def(q.id); if (!d) return ''; const pct = Math.round(q.progress / d.goal * 100);
    const btn = q.claimed ? `<div class="rw">✔ Done</div>` : q.done ? `<button class="btn sun sm" data-claim="${i}">🌸 ${d.reward}<br>Claim!</button>` : `<div class="rw">🌸 ${d.reward}</div>`;
    return `<div class="qcard ${q.done ? 'done' : ''} ${q.claimed ? 'claimed' : ''}"><div class="qi">${d.icon}</div><div class="mid"><h3>${d.title}</h3><p>${d.desc} · ${q.progress}/${d.goal}</p><div class="bar"><i style="width:${pct}%"></i></div></div>${btn}</div>`;
  }
  function nextUp() {
    const out = [], open_ = state.quests.map((q, i) => ({ q, i, d: def(q.id) })).filter(x => x.d && !x.q.claimed);
    const claimable = open_.find(x => x.q.done);
    if (claimable) out.push(`${claimable.d.icon} ${claimable.d.title}: done! Claim! 🎁`);
    const working = open_.filter(x => !x.q.done).sort((a, b) => b.q.progress / b.d.goal - a.q.progress / a.d.goal)[0];
    if (working) out.push(`${working.d.icon} ${working.d.desc} (${working.q.progress}/${working.d.goal})`);
    const nc = nextCharm(); out.push(nc ? `🏡 Island Charm ${charm()}/${nc.at}: ${nc.text}` : '🏡 Every charm reward earned!');
    const w = activeWishText(); if (out.length < 3) out.push(w ? `🌟 ${w.sp}: ${w.text}` : '🌟 Befriend a creature to hear its wishes');
    return out.slice(0, 3);
  }
  function renderQuests() {
    const goals = nextUp();
    const p = panel('Cozy Quests', ['#ffc15a', '#ff9a3c'], `<div class="goals"><b>🧭 Next up</b>${goals.map(g => `<span>${g}</span>`).join('')}</div><p class="sub">Day ${state.day} · No rush, no penalties. Do them whenever you like!</p><p class="feat">${featuredSpecies(state.day).icon} Featured friend today: <b>${featuredSpecies(state.day).id}</b> (bonus petals)</p>${state.quests.map(questRow).join('')}${allDone() ? `<div style="text-align:center;margin-top:10px"><p class="sub">You finished them all! 🎉 Want more to do?</p><button class="btn mint" id="more">Get new quests</button></div>` : ''}`);
    p.querySelectorAll('[data-claim]').forEach(b => b.onclick = e => { claim(+b.dataset.claim); celebrate(e.clientX, e.clientY, 24); });
    const m = $('#more', p); if (m) m.onclick = () => { newSet(); sfx.open(); };
    return p;
  }
  on('quests:changed', () => { rerender('quests'); renderTracker(); });

  function renderTracker() {
    const f = featuredSpecies(state.day);
    $('#tracker').innerHTML = state.quests.filter(q => !q.claimed).map(q => { const d = def(q.id); return `<div class="tq ${q.done ? 'done' : ''}"><div class="row"><span>${d.icon} ${d.desc}</span><span>${q.done ? '🎁' : q.progress + '/' + d.goal}</span></div><div class="bar"><i style="width:${q.progress / d.goal * 100}%"></i></div></div>`; }).join('') + `<div class="tq feat">${f.icon} Featured: ${f.id} · Lucky gem ${COLOR_ICON[['pink', 'blue', 'yellow', 'green'][state.day % 4]]}</div><div class="tq feat">${eventFor(state.day).icon} ${eventFor(state.day).name}</div>`;
    const ready = state.quests.filter(q => q.done && !q.claimed).length, b = $('#qbadge');
    b.textContent = ready; b.classList.toggle('hidden', !ready);
  }
  const renderBag = () => { const n = k => Object.entries(state.inv).filter(([x]) => x.startsWith(k + ':')).reduce((a, [, v]) => a + v, 0); $('#bag').textContent = `🍓${n('berry')} 💎${n('gem')}`; };
  on('inventory', renderBag); renderBag();
  on('milestone', ({ m, item }) => { emit('toast', { icon: '🏆', text: `${m.text}${m.petals ? ` +${m.petals} 🌸` : ''}${item ? ` · Unlocked ${item.icon} ${item.name}!` : ''}`, kind: 'win' }); celebrate(innerWidth / 2, innerHeight * 0.4, 40, ['🏆', '✨', '🌸']); });

  // ---- journal ----
  function renderJournal() {
    const total = SPECIES.length, seen = SPECIES.filter(s => state.discovered[s.id]).length, friends = SPECIES.filter(s => state.befriended[s.id]).length;
    const cards = [...SPECIES].sort((a, b) => (!!state.discovered[b.id] - !!state.discovered[a.id]) || (!!state.befriended[b.id] - !!state.befriended[a.id])).map(s => {
      const known = !!state.discovered[s.id], fr = !!state.befriended[s.id], pts = ptsOf(s.id), lvl = lvlOf(s.id), nd = nextNeeds(s.id), log = mem(s.id).log.slice(-3).reverse();
      const pct = !nd ? 100 : Math.round(Math.min(1, (pts - LEVEL_AT[lvl]) / (nd.pts[1] - LEVEL_AT[lvl])) * 100);
      const needs = nd ? `Next: ${nd.pts[0] >= nd.pts[1] ? '✔' : '❤'} ${Math.floor(nd.pts[0])}/${nd.pts[1]} · ${nd.days[0] >= nd.days[1] ? '✔' : '📅'} ${nd.days[0]}/${nd.days[1]} days · ${nd.kinds[0] >= nd.kinds[1] ? '✔' : '🎲'} ${nd.kinds[0]}/${nd.kinds[1]} kinds` : 'Best friends forever!';
      const w = fr && wishOf(s.id);
      return `<div class="card sp ${known ? '' : 'locked'}" style="--c:${s.color}">${fr ? '<span class="tag">Friend</span>' : ''}${w ? '<span class="wdot" title="Has a wish">🌟</span>' : ''}<div class="face">${known ? s.icon : '?'}</div><span class="nm">${known ? s.id : '???'}</span><span class="meta">${known ? s.blurb : 'Keep exploring to find me!'}</span>${known ? `<span class="meta fav">Loves ${COLOR_ICON[s.fav.berry]} ${s.fav.berry} berries · ${COLOR_ICON[s.fav.gem]} ${s.fav.gem} gems</span><span class="meta lvl"><b>${LEVEL_NAME[lvl]}</b> · Lv ${lvl}/${MAX_LEVEL}</span><span class="lbar"><i style="width:${pct}%"></i></span>${fr ? `<span class="meta need">${needs}</span>` : ''}${log.length ? `<span class="meta things"><b>Things we did</b>${log.map(x => `<span>• ${x.t}</span>`).join('')}</span>` : ''}${w ? `<span class="meta wish">🌟 ${w.text}${w.type === 'gift' ? ` (${w.p}/${w.n})` : ''}</span>` : ''}` : ''}</div>`;
    }).join('');
    const reward = state.milestones.m_journal ? '<p class="sub">🏆 Journal complete! Golden Halo unlocked.</p>' : `<p class="sub">Discover all ${total} to unlock a special 😇 Golden Halo!</p>`;
    return panel('Creature Journal', ['#6ee0b0', '#32b886'], `<p class="sub">Discovered ${seen}/${total} · Friends ${friends}/${total}</p>${reward}<div class="grid">${cards}</div>`);
  }

  // ---- wardrobe ----
  let tab = 'hat', prev = null, tryOn = {};
  function disposePreview() { if (prev) { prev.dispose(); prev = null; } }
  const HOW = { m_journal: 'discover all 8 creatures', m_gems100: 'collect 100 gems', m_friend3: 'befriend 3 creatures', m_bond3: 'reach friendship level 3 with a creature', m_friend8: 'befriend all 8 species' };
  function renderShop() {
    disposePreview();
    const eq = { ...state.equipped, ...tryOn };
    const items = WARDROBE.filter(w => w.slot === tab).map(w => {
      const owned = state.owned.includes(w.id), on_ = eq[w.slot] === w.id, locked = !owned && w.gift;
      const sw = w.value ? `<span class="big" style="display:grid;place-items:center"><i style="display:block;width:46px;height:46px;border-radius:50%;background:${w.value};border:4px solid #fff;box-shadow:0 3px 0 rgba(0,0,0,.15)"></i></span>` : `<span class="big">${w.icon}</span>`;
      const meta = state.equipped[w.slot] === w.id ? '✔ Wearing' : on_ ? '👀 Trying on' : owned ? 'Tap to wear' : locked ? '🔒 Play to unlock' : '🌸 ' + w.price;
      return `<button class="card ${on_ ? 'sel' : ''} ${locked ? 'lock' : ''}" data-id="${w.id}">${sw}<span class="nm">${w.name}</span><span class="meta">${meta}</span></button>`;
    }).join('');
    const tryItem = Object.values(tryOn).map(id => WARDROBE.find(w => w.id === id)).find(w => w && !state.owned.includes(w.id));
    const buyBar = tryItem ? `<div class="buybar"><b>${tryItem.icon} ${tryItem.name}</b><button class="btn sun sm" id="buy">Buy 🌸 ${tryItem.price}</button></div>` : '<div class="buybar hint">Tap an item to try it on. Own it already? It is worn right away.</div>';
    const p = panel('Wardrobe', ['#8fd4ff', '#3a9be0'], `<div class="shop"><div class="side"><canvas id="prevc" width="320" height="400"></canvas>${buyBar}</div><div class="main"><p class="sub">You have 🌸 <span class="petal-count">${state.petals}</span> petals · ${state.owned.length}/${WARDROBE.length} items</p><div class="tabs">${SLOTS.map(t => `<button class="tab ${tab === t.id ? 'on' : ''}" data-t="${t.id}">${t.label}</button>`).join('')}</div><div class="grid">${items}</div></div></div>`);
    p.classList.add('wide');
    p.querySelectorAll('.tab').forEach(b => b.onclick = () => { tab = b.dataset.t; rerender('shop'); });
    p.querySelectorAll('.card').forEach(b => b.onclick = () => {
      const w = WARDROBE.find(x => x.id === b.dataset.id);
      if (state.owned.includes(w.id)) { delete tryOn[w.slot]; state.equipped[w.slot] = w.id; save(); emit('equip', { slot: w.slot, id: w.id }); sfx.click(); }
      else if (w.gift) { sfx.nope(); emit('toast', { icon: '🔒', text: `Unlock by playing: ${HOW[w.gift] || 'keep playing'}`, kind: 'info' }); tryOn[w.slot] = w.id; }
      else tryOn[w.slot] = w.id;
      rerender('shop');
    });
    const bb = $('#buy', p);
    if (bb) bb.onclick = e => {
      const w = tryItem;
      if (state.petals < w.price) { sfx.nope(); emit('toast', { icon: '🌸', text: `Need ${w.price - state.petals} more petals. You will get there!`, kind: 'info' }); return; }
      addPetals(-w.price); state.owned.push(w.id); delete tryOn[w.slot]; emit('purchase', { id: w.id, price: w.price });
      state.equipped[w.slot] = w.id; save(); emit('equip', { slot: w.slot, id: w.id }); celebrate(e.clientX, e.clientY, 14); rerender('shop');
    };
    setTimeout(() => { const c = $('#prevc'); if (!c || openPanel !== 'shop') return; try { prev = makePreview(c); prev.set(eq); } catch (err) { console.warn('preview failed', err); } }, 0);
    return p;
  }

  // ---- island / decor ----
  let dtab = 'shop', dcat = 'Furniture';
  function renderDecor() {
    const c = charm(), nx = nextCharm(), have = Object.values(state.decorInv).reduce((a, n) => a + n, 0);
    const mk = d => {
      const n = state.decorInv[d.id] || 0, placed = state.decor.filter(x => x.id === d.id).length;
      const act = dtab === 'shop'
        ? `<button class="btn sun sm" data-buy="${d.id}">Buy 🌸 ${d.price}</button>${n ? `<button class="btn mint sm" data-place="${d.id}">Place (${n})</button>` : ''}`
        : (n ? `<button class="btn mint sm" data-place="${d.id}">Place (${n})</button>` : `<span class="meta">🔒 ${d.gift || 'Buy in the shop'}</span>`);
      return `<div class="card dc">${DECOR_SVG[d.id] ? `<span class="big svg">${DECOR_SVG[d.id]}</span>` : decIcon(d)}<span class="nm">${d.name}</span><span class="meta">+${d.charm} charm${placed ? ` · ${placed} placed` : ''}${d.line ? ' · line' : ''}</span><div class="acts">${act}</div></div>`;
    };
    let body = '';
    if (dtab === 'shop') body = `<div class="tabs sub2">${DECOR_CATS.map(x => `<button class="tab ${dcat === x.id ? 'on' : ''}" data-dc="${x.id}">${x.icon} ${x.id}</button>`).join('')}</div><div class="grid">${DECOR.filter(d => !d.gift && d.cat === dcat).map(mk).join('')}</div>${dcat === 'Build kit' ? '<p class="sub">Build kit: floors snap to a 2x2 grid. Put walls and doorways on the floor edges, then a roof on top.</p>' : ''}`;
    else if (dtab === 'mine') {
      const placedList = state.decor.length ? `<h3 class="h3">Placed on your island (${state.decor.length})</h3><div class="placed">${state.decor.map((x, i) => `<div class="prow"><span>${DECOR_BY_ID[x.id].icon} ${DECOR_BY_ID[x.id].name}</span><button class="btn mint sm" data-mv="${i}">Move</button><button class="btn sm" data-st="${i}">Store</button></div>`).join('')}</div>` : '';
      body = `<div class="grid">${DECOR.filter(d => (state.decorInv[d.id] || 0) > 0).map(mk).join('') || '<p class="sub">Nothing in your bag. Buy decorations in the shop.</p>'}</div>${placedList}`;
    } else {
      const by = {}; for (const x of state.decor) { const d = DECOR_BY_ID[x.id]; by[d.cat] = (by[d.cat] || 0) + 1; }
      const names = {}; for (const x of state.decor) names[x.id] = (names[x.id] || 0) + 1;
      body = `<div class="gallery"><div class="gscore"><b>${c}</b><span>Island Charm</span></div><div class="gcats">${DECOR_CATS.map(k => `<div class="gc"><span>${k.icon}</span><b>${by[k.id] || 0}</b><small>${k.id}</small></div>`).join('')}</div></div><h3 class="h3">Your island collection</h3><div class="gitems">${Object.entries(names).map(([id, n]) => `<span class="gi">${DECOR_BY_ID[id].icon} ${DECOR_BY_ID[id].name} ×${n}</span>`).join('') || '<p class="sub">Place something to start your gallery!</p>'}</div><p class="sub">Unlocked ${Object.keys(state.placedTypes || {}).length}/${DECOR.length} kinds · ${Object.values(state.charmMs).length}/${CHARM_MS.length} charm rewards</p>`;
    }
    const pct = nx ? Math.min(100, Math.round(c / nx.at * 100)) : 100;
    const p = panel('My Island', ['#7fe0c8', '#2fb6a0'], `<p class="sub">🌸 <span class="petal-count">${state.petals}</span> petals · ${state.decor.length} placed</p><div class="charm"><b>🏡 Island Charm ${c}</b><span class="lbar big"><i style="width:${pct}%"></i></span><small>${nx ? `Next reward at ${nx.at}: ${nx.text} (+${nx.petals} 🌸)` : 'You earned every charm reward!'}</small></div><div class="tabs"><button class="tab ${dtab === 'shop' ? 'on' : ''}" data-dt="shop">🛍️ Shop</button><button class="tab ${dtab === 'mine' ? 'on' : ''}" data-dt="mine">📦 My items (${have})</button><button class="tab ${dtab === 'gallery' ? 'on' : ''}" data-dt="gallery">🖼️ Gallery</button></div>${body}<p class="sub">Tip: ${T_() ? 'tap Place, use the stick to aim, then Place again.' : 'press Place, walk to aim, then press E.'} To move one later, stand right next to it and ${giveWord()}, or use My items.</p>`);
    p.querySelectorAll('[data-dc]').forEach(b => b.onclick = () => { dcat = b.dataset.dc; rerender('decor'); });
    p.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => { const i = +b.dataset.mv; close(); moveDecor(i); });
    p.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { storeIndex(+b.dataset.st); sfx.click(); });
    p.querySelectorAll('[data-dt]').forEach(b => b.onclick = () => { dtab = b.dataset.dt; rerender('decor'); });
    p.querySelectorAll('[data-buy]').forEach(b => b.onclick = e => { const d = DECOR_BY_ID[b.dataset.buy]; if (!buyDecor(d.id)) { sfx.nope(); emit('toast', { icon: '🌸', text: `Need ${d.price - state.petals} more petals. You will get there!`, kind: 'info' }); } else { sfx.buy(); celebrate(e.clientX, e.clientY, 12); } });
    p.querySelectorAll('[data-place]').forEach(b => b.onclick = () => { const id = b.dataset.place; close(); startPlacing(id); });
    return p;
  }

  // ---- help ----
  function renderHelp() {
    return panel('How to Play', ['#ffb36b', '#ff8a3c'], `<ol class="howto"><li>💎 <b>Collect gems</b> by walking into them. Each one gives you a petal 🌸.</li><li>🍓 <b>Berries and gems</b> also go in your gift bag 🎒.</li><li>🐾 <b>Make friends:</b> ${giveWord()} near a creature to give a gift. Gifts, dances and daily visits build friendship slowly. Deeper friendship needs different days and different kinds of fun. Friends make wishes and invite you to hang out!</li><li>👁️ <b>Sparkle Sense</b> (the eye emote) reveals hidden gems on hilltops and shores.</li><li>🏡 <b>Decorate your island:</b> furniture, gardens, lights, paths, and a build kit for a little house of your own.</li><li>👒 <b>Spend petals</b> in the wardrobe on hats, hair, trails and more.</li><li>⭐ <b>Quests</b> give bonus petals. No timers, no rush.</li></ol><h3 class="h3">Controls</h3>${controlsHtml()}`);
  }

  // ---- settings ----
  function renderSettings() {
    const s = state.settings;
    const p = panel('Settings', ['#c7a6ff', '#8d5df0'], `
      <div class="setting"><label for="v1">Volume</label><input id="v1" type="range" min="0" max="1" step="0.05" value="${s.volume}"></div>
      <div class="setting"><label for="v2">Music</label><input id="v2" type="range" min="0" max="1" step="0.05" value="${s.music}"></div>
      <div class="setting"><label>Quality</label><div class="seg">${['low', 'medium', 'high', 'auto'].map(q => `<button class="tab ${getTier() === q ? 'on' : ''}" data-q="${q}">${q[0].toUpperCase() + q.slice(1)}</button>`).join('')}</div></div>
      <p class="sub" id="qnote">${getTier() === 'auto' ? `Auto picks what runs smoothly on this device (now: ${getEffectiveTier()}).` : 'Lower quality runs smoother on tablets and older computers.'}</p>
      <div class="setting"><label>Calm motion</label><button class="tab ${s.reduceMotion ? 'on' : ''}" id="rm">${s.reduceMotion ? 'On' : 'Off'}</button></div>
      <div class="setting"><label>Touch controls</label><div class="seg">${['auto', 'on', 'off'].map(q => `<button class="tab ${s.touch === q ? 'on' : ''}" data-tc="${q}">${q[0].toUpperCase() + q.slice(1)}</button>`).join('')}</div></div>
      <div class="setting"><label>Sound</label><button class="tab ${s.mute ? '' : 'on'}" id="mu">${s.mute ? 'Muted' : 'On'}</button></div>
      <div class="setting"><label>Text size</label><div class="seg">${[['Small', 0.9], ['Normal', 1], ['Large', 1.2], ['Huge', 1.4]].map(([n, v]) => `<button class="tab ${s.textSize === v ? 'on' : ''}" data-ts="${v}">${n}</button>`).join('')}</div></div>
      <div class="setting"><label>Give / place key</label><div class="seg">${[['E', 'KeyE'], ['F', 'KeyF'], ['Enter', 'Enter']].map(([n, v]) => `<button class="tab ${s.interactKey === v ? 'on' : ''}" data-ik="${v}">${n}</button>`).join('')}</div></div>
      <h3 class="h3">Controls</h3>${controlsHtml()}
      <div class="setting"><label>Save data</label><button class="tab" id="reset">Start over…</button></div>
      <p class="sub">Day ${state.day} · ${state.totalGems} gems collected · ${Math.round(state.playedSeconds / 60)} min played</p>`);
    const apply = () => { saveSoon(); emit('settings', { ...s }); };
    $('#v1', p).oninput = e => { s.volume = +e.target.value; apply(); }; $('#v2', p).oninput = e => { s.music = +e.target.value; apply(); };
    $('#v1', p).onchange = () => sfx.collect();
    p.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { setTier(b.dataset.q); sfx.click(); apply(); rerender('settings'); });
    p.querySelectorAll('[data-tc]').forEach(b => b.onclick = () => { s.touch = b.dataset.tc; sfx.click(); apply(); rerender('settings'); });
    p.querySelectorAll('[data-ts]').forEach(b => b.onclick = () => { s.textSize = +b.dataset.ts; apply(); rerender('settings'); });
    p.querySelectorAll('[data-ik]').forEach(b => b.onclick = () => { s.interactKey = b.dataset.ik; apply(); rerender('settings'); });
    $('#mu', p).onclick = () => { s.mute = !s.mute; applySettings(); muteIcon(); apply(); rerender('settings'); };
    $('#rm', p).onclick = () => { s.reduceMotion = !s.reduceMotion; sfx.click(); applyMotion(); apply(); rerender('settings'); };
    $('#reset', p).onclick = e => { const b = e.target; if (b.dataset.sure) resetSave(); else { b.dataset.sure = 1; b.textContent = 'Really erase? Tap again'; } };
    return p;
  }
  const applyMotion = () => document.body.classList.toggle('reduce', !!state.settings.reduceMotion);
  // quality (pixel ratio, shadows, post, particles ...) is applied by src/quality.js subscribers; here we only keep the open panel in sync
  on('quality', () => { if (openPanel === 'settings') rerender('settings'); });
  on('ui:request', e => { if (e && e.panel && panels[e.panel] && started) open(e.panel); });
  applyMotion();

  // ---- HUD values ----
  const petalsEl = $('#petals'); let shown = state.petals;
  const setPetals = () => { petalsEl.textContent = state.petals; };
  setPetals(); $('#day').textContent = state.day; renderTracker();
  on('inventory', () => { if (openPanel === 'decor') rerender('decor'); });
  on('currency', e => {
    if (e.delta > 0) { const p = $('#p-petals'); p.classList.add('bump'); setTimeout(() => p.classList.remove('bump'), 180); }
    setPetals(); document.querySelectorAll('.petal-count').forEach(el => { el.textContent = state.petals; }); if (openPanel === 'decor') rerender('decor');
    if (e.delta > 0 && started) { const r = petalsEl.getBoundingClientRect(); floatText(`+${e.delta}`, r.right + 8, r.top - 6); }
  });
  on('day', () => { $('#day').textContent = state.day; });

  // ---- toasts / celebrations ----
  on('toast', t => toast(t));
  on('discover', e => { if (!e.repeat) { toast({ icon: '📖', text: `New in your journal: ${e.species}!`, kind: 'good' }); } });
  on('befriend', e => { if (!e.repeat) celebrate(innerWidth / 2, innerHeight / 2, 30, ['💕', '✨', '🌸']); });
  on('quest:complete', ({ def: d }) => {
    const b = h(`<div id="banner"><div class="b"><h2>${d.icon} Quest Complete!</h2><p>${d.desc}</p></div></div>`);
    document.body.appendChild(b); setTimeout(() => b.remove(), 2900); celebrate(innerWidth / 2, innerHeight * 0.42, 50);
  });
}

export function toast({ icon = '✨', text, kind = 'info' }) {
  const box = $('#toasts'); if (!box) return;
  // merge: daily hellos collapse into one row; identical text bumps a counter instead of stacking
  const hello = /^Daily hello with (\w+)/.exec(text), key = hello ? 'hello' : text;
  const ex = [...box.children].find(c => c.dataset.key === key && !c.classList.contains('out'));
  if (ex) {
    if (hello) { const names = new Set((ex.dataset.names || '').split(',').filter(Boolean)); names.add(hello[1]); ex.dataset.names = [...names].join(','); ex.lastChild.textContent = names.size > 2 ? `Daily hellos ×${names.size}` : `Daily hellos: ${[...names].join(', ')}`; }
    else { const n = (+ex.dataset.n || 1) + 1; ex.dataset.n = n; ex.lastChild.textContent = `${text} ×${n}`; }
    clearTimeout(ex._t); ex._t = setTimeout(() => dismiss(ex), 2600); return;
  }
  while (box.children.length >= 2) box.firstChild.remove();
  const t = h(`<div class="toast ${kind}"><div class="ti">${icon}</div><div>${hello ? `Daily hello with ${hello[1]}!` : text}</div></div>`); t.dataset.key = key; if (hello) t.dataset.names = hello[1]; box.appendChild(t);
  t._t = setTimeout(() => dismiss(t), 2600);
}
function dismiss(t) { t.classList.add('out'); setTimeout(() => t.remove(), 400); }
function floatText(text, x, y) { const f = h(`<div class="float">${text}</div>`); f.style.left = x + 'px'; f.style.top = y + 'px'; document.body.appendChild(f); setTimeout(() => f.remove(), 1000); }
export function celebrate(x, y, n = 30, glyphs) {
  if (state.settings.reduceMotion) return;
  const cols = ['#ff7eb6', '#ffd24a', '#5fd9a8', '#6cc4ff', '#a77bff'];
  for (let i = 0; i < n; i++) {
    const c = h(glyphs ? `<div class="confetti" style="width:auto;height:auto;font-size:24px">${glyphs[i % glyphs.length]}</div>` : `<div class="confetti" style="background:${cols[i % 5]}"></div>`);
    c.style.left = x + 'px'; c.style.top = y + 'px'; document.body.appendChild(c);
    const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 280, dx = Math.cos(a) * v, dy = Math.sin(a) * v - 140;
    c.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) rotate(${Math.random() * 720}deg)`, opacity: 1, offset: .6 }, { transform: `translate(${dx * 1.1}px,${dy + 260}px) rotate(900deg)`, opacity: 0 }], { duration: 1100 + Math.random() * 600, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => c.remove();
  }
}
