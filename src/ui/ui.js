// HUD, title screen, panels (quests / journal / wardrobe / settings), toasts and celebration FX. Plain DOM, no deps.
import './style.css';
import { state, save, saveSoon, addPetals, resetSave } from '../game/state.js';
import { SPECIES, WARDROBE, SLOTS, COLOR_ICON, BOND_AT, featuredSpecies } from '../game/data.js';
import { isTouchDevice } from '../game/touch.js';
import { EMOTES, playEmote } from '../game/emotes.js';
import { on, emit } from '../game/events.js';
import { def, claim, allDone, newSet } from '../game/quests.js';
import { sfx, initAudio as _ia } from '../game/audio.js';

const $ = (s, r = document) => r.querySelector(s);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
let root, overlay, openPanel = null, started = false;

export function setPrompt(text, sub, action = true) {
  const el = $('#prompt'); if (!el) return;
  if (!text) { el.classList.add('hidden'); return; }
  const first = el.classList.contains('hidden'); el.classList.remove('hidden');
  el.classList.toggle('hint', !action);
  const b = $('button', el); b.textContent = text; b.disabled = !action; $('small', el).textContent = sub || '';
  if (first && action) sfx.open();
}
const controlsText = () => isTouchDevice()
  ? [['🕹️', 'Left stick', 'Move'], ['⤒', 'JUMP button', 'Jump'], ['💨', 'RUN (hold)', 'Run'], ['👆', 'Drag the view', 'Look around'], ['🎁', 'Give button', 'Gift near a creature'], ['😊', 'Emote button', 'Wave, dance...']]
  : [['⌨️', 'WASD / arrows', 'Move'], ['␣', 'Space', 'Jump'], ['⇧', 'Shift', 'Run'], ['🖱️', 'Drag mouse', 'Look around'], ['E', 'E key', 'Give a gift to a creature'], ['1-4', 'Number keys', 'Emotes'], ['J Q H', 'J / Q / H', 'Journal, quests, help']];
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
        <button class="round pink" id="b-quests" aria-label="Quests" title="Quests (Q)">⭐<span class="badge hidden" id="qbadge">0</span></button>
        <button class="round mint" id="b-journal" aria-label="Creature journal" title="Journal (J)">📖</button>
        <button class="round sun" id="b-shop" aria-label="Wardrobe" title="Wardrobe">👒</button>
        <button class="round" id="b-emote" aria-label="Emotes" title="Emotes (1-4)">😊</button>
        <button class="round grape" id="b-help" aria-label="Help" title="Help (H)">?</button>
        <button class="round grape" id="b-settings" aria-label="Settings" title="Settings">⚙️</button>
      </div>
      <div id="emotewheel" class="hidden">${EMOTES.map((e, i) => `<button class="round" data-e="${e.id}" aria-label="${e.label}">${e.icon}<small>${i + 1}</small></button>`).join('')}</div>
      <div id="prompt" class="hidden"><button class="btn mint"></button><small></small></div>
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
  const setHelp = () => { $('#help').textContent = isTouchDevice() ? 'Stick: move · Buttons: jump and run · Drag: look · Tap Give near creatures' : 'WASD/arrows move · Shift run · Space jump · Drag look · E gift · 1-4 emotes · H help'; };
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
    setTimeout(() => emit('toast', { icon: '👋', text: `Welcome to day ${state.day}!`, kind: 'good' }), 700);
    setTimeout(() => { $('#help').style.opacity = 0; }, 14000);
  };
  $('#prompt button').onclick = () => emit('ui:interact');
  $('#b-emote').onclick = () => $('#emotewheel').classList.toggle('hidden');
  $('#emotewheel').querySelectorAll('[data-e]').forEach(b => b.onclick = () => { playEmote(b.dataset.e); $('#emotewheel').classList.add('hidden'); });
  $('#b-help').onclick = () => toggle('help');

  const panels = { quests: renderQuests, journal: renderJournal, shop: renderShop, settings: renderSettings, help: renderHelp };
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
  function close(silent) { if (overlay) { overlay.remove(); overlay = null; if (!silent) sfx.close(); emit('ui:close', { panel: openPanel }); } openPanel = null; }
  const rerender = (name) => { if (openPanel !== name) return; const st = overlay.firstChild.querySelector('.body')?.scrollTop || 0; const p = panels[name](); overlay.firstChild.replaceWith(p); p.style.animation = 'none'; const b = $('.body', p); if (b) b.scrollTop = st; };

  function panel(title, grad, bodyHtml) {
    const p = h(`<section class="panel" role="dialog" aria-label="${title}" style="--hc1:${grad[0]};--hc2:${grad[1]}"><header><h2>${title}</h2><button class="x" aria-label="Close">✕</button></header><div class="body">${bodyHtml}</div></section>`);
    $('.x', p).onclick = () => close(); return p;
  }

  // ---- quests ----
  function questRow(q, i) {
    const d = def(q.id); if (!d) return ''; const pct = Math.round(q.progress / d.goal * 100);
    const btn = q.claimed ? `<div class="rw">✔ Done</div>` : q.done ? `<button class="btn sun sm" data-claim="${i}">🌸 ${d.reward}<br>Claim!</button>` : `<div class="rw">🌸 ${d.reward}</div>`;
    return `<div class="qcard ${q.done ? 'done' : ''} ${q.claimed ? 'claimed' : ''}"><div class="qi">${d.icon}</div><div class="mid"><h3>${d.title}</h3><p>${d.desc} · ${q.progress}/${d.goal}</p><div class="bar"><i style="width:${pct}%"></i></div></div>${btn}</div>`;
  }
  function renderQuests() {
    const p = panel('Cozy Quests', ['#ffc15a', '#ff9a3c'], `<p class="sub">Day ${state.day} · No rush, no penalties. Do them whenever you like!</p><p class="feat">${featuredSpecies(state.day).icon} Featured friend today: <b>${featuredSpecies(state.day).id}</b> (bonus petals)</p>${state.quests.map(questRow).join('')}${allDone() ? `<div style="text-align:center;margin-top:10px"><p class="sub">You finished them all! 🎉 Want more to do?</p><button class="btn mint" id="more">Get new quests</button></div>` : ''}`);
    p.querySelectorAll('[data-claim]').forEach(b => b.onclick = e => { claim(+b.dataset.claim); celebrate(e.clientX, e.clientY, 24); });
    const m = $('#more', p); if (m) m.onclick = () => { newSet(); sfx.open(); };
    return p;
  }
  on('quests:changed', () => { rerender('quests'); renderTracker(); });

  function renderTracker() {
    const f = featuredSpecies(state.day);
    $('#tracker').innerHTML = state.quests.filter(q => !q.claimed).map(q => { const d = def(q.id); return `<div class="tq ${q.done ? 'done' : ''}"><div class="row"><span>${d.icon} ${d.desc}</span><span>${q.done ? '🎁' : q.progress + '/' + d.goal}</span></div><div class="bar"><i style="width:${q.progress / d.goal * 100}%"></i></div></div>`; }).join('') + `<div class="tq feat">${f.icon} Featured today: ${f.id}</div>`;
    const ready = state.quests.filter(q => q.done && !q.claimed).length, b = $('#qbadge');
    b.textContent = ready; b.classList.toggle('hidden', !ready);
  }
  const renderBag = () => { const n = k => Object.entries(state.inv).filter(([x]) => x.startsWith(k + ':')).reduce((a, [, v]) => a + v, 0); $('#bag').textContent = `🍓${n('berry')} 💎${n('gem')}`; };
  on('inventory', renderBag); renderBag();
  on('milestone', ({ m, item }) => { emit('toast', { icon: '🏆', text: `${m.text}${m.petals ? ` +${m.petals} 🌸` : ''}${item ? ` · Unlocked ${item.icon} ${item.name}!` : ''}`, kind: 'win' }); celebrate(innerWidth / 2, innerHeight * 0.4, 40, ['🏆', '✨', '🌸']); });

  // ---- journal ----
  function renderJournal() {
    const total = SPECIES.length, seen = SPECIES.filter(s => state.discovered[s.id]).length, friends = SPECIES.filter(s => state.befriended[s.id]).length;
    const cards = SPECIES.map(s => {
      const known = !!state.discovered[s.id], fr = !!state.befriended[s.id], gifts = state.bond[s.id] || 0;
      const lvl = BOND_AT.reduce((l, n, i) => (gifts >= n ? i : l), 0), hearts = '💗'.repeat(lvl) + '🤍'.repeat(3 - lvl);
      return `<div class="card sp ${known ? '' : 'locked'}" style="--c:${s.color}">${fr ? '<span class="tag">Friend</span>' : ''}<div class="face">${known ? s.icon : '?'}</div><span class="nm">${known ? s.id : '???'}</span><span class="meta">${known ? s.blurb : 'Keep exploring to find me!'}</span>${known ? `<span class="meta fav">Loves ${COLOR_ICON[s.fav.berry]} ${COLOR_ICON[s.fav.gem]}</span><span class="meta hearts" title="Friendship level ${lvl}/3">${hearts}</span>` : ''}</div>`;
    }).join('');
    const reward = state.milestones.m_journal ? '<p class="sub">🏆 Journal complete! Golden Halo unlocked.</p>' : `<p class="sub">Discover all ${total} to unlock a special 😇 Golden Halo!</p>`;
    return panel('Creature Journal', ['#6ee0b0', '#32b886'], `<p class="sub">Discovered ${seen}/${total} · Friends ${friends}/${total}</p>${reward}<div class="grid">${cards}</div>`);
  }

  // ---- wardrobe ----
  let tab = 'hat';
  const HOW = { m_journal: 'discover all 8 creatures', m_gems100: 'collect 100 gems', m_friend3: 'befriend 3 creatures', m_bond3: 'reach best-friend level with a creature', m_friend8: 'befriend all 8 species' };
  function renderShop() {
    const items = WARDROBE.filter(w => w.slot === tab).map(w => {
      const owned = state.owned.includes(w.id), on_ = state.equipped[w.slot] === w.id, locked = !owned && w.gift;
      const sw = w.value ? `<span class="big" style="display:grid;place-items:center"><i style="display:block;width:50px;height:50px;border-radius:50%;background:${w.value};border:4px solid #fff;box-shadow:0 3px 0 rgba(0,0,0,.15)"></i></span>` : `<span class="big">${w.icon}</span>`;
      const meta = on_ ? '✔ Wearing' : owned ? 'Tap to wear' : locked ? '🔒 Play to unlock' : '🌸 ' + w.price;
      return `<button class="card ${on_ ? 'sel' : ''} ${locked ? 'lock' : ''}" data-id="${w.id}">${sw}<span class="nm">${w.name}</span><span class="meta">${meta}</span></button>`;
    }).join('');
    const p = panel('Wardrobe', ['#8fd4ff', '#3a9be0'], `<p class="sub">You have 🌸 ${state.petals} petals · ${state.owned.length}/${WARDROBE.length} items collected</p><div class="tabs">${SLOTS.map(t => `<button class="tab ${tab === t.id ? 'on' : ''}" data-t="${t.id}">${t.label}</button>`).join('')}</div><div class="grid">${items}</div>`);
    p.querySelectorAll('.tab').forEach(b => b.onclick = () => { tab = b.dataset.t; sfx.click(); rerender('shop'); });
    p.querySelectorAll('.card').forEach(b => b.onclick = e => {
      const w = WARDROBE.find(x => x.id === b.dataset.id);
      if (!state.owned.includes(w.id)) {
        if (w.gift) { sfx.nope(); emit('toast', { icon: '🔒', text: `Unlock by playing: ${HOW[w.gift]}`, kind: 'info' }); return; }
        if (state.petals < w.price) { sfx.nope(); emit('toast', { icon: '🌸', text: `Need ${w.price - state.petals} more petals. You'll get there!`, kind: 'info' }); return; }
        addPetals(-w.price); state.owned.push(w.id); emit('purchase', { id: w.id, price: w.price }); celebrate(e.clientX, e.clientY, 14);
      }
      state.equipped[w.slot] = w.id; save(); emit('equip', { slot: w.slot, id: w.id }); rerender('shop');
    });
    return p;
  }

  // ---- help ----
  function renderHelp() {
    return panel('How to Play', ['#ffb36b', '#ff8a3c'], `<ol class="howto"><li>💎 <b>Collect gems</b> by walking into them. Each one gives you a petal 🌸.</li><li>🍓 <b>Berries and gems</b> also go in your gift bag 🎒.</li><li>🐾 <b>Make friends:</b> walk up to a creature and press Give (E). Its favourite colour makes friends instantly!</li><li>👒 <b>Spend petals</b> in the wardrobe on hats, hair, trails and more.</li><li>⭐ <b>Quests</b> give bonus petals. No timers, no rush.</li></ol><h3 class="h3">Controls</h3>${controlsHtml()}`);
  }

  // ---- settings ----
  function renderSettings() {
    const s = state.settings;
    const p = panel('Settings', ['#c7a6ff', '#8d5df0'], `
      <div class="setting"><label for="v1">Volume</label><input id="v1" type="range" min="0" max="1" step="0.05" value="${s.volume}"></div>
      <div class="setting"><label for="v2">Music</label><input id="v2" type="range" min="0" max="1" step="0.05" value="${s.music}"></div>
      <div class="setting"><label>Quality</label><div class="seg">${['low', 'medium', 'high'].map(q => `<button class="tab ${s.quality === q ? 'on' : ''}" data-q="${q}">${q[0].toUpperCase() + q.slice(1)}</button>`).join('')}</div></div>
      <div class="setting"><label>Calm motion</label><button class="tab ${s.reduceMotion ? 'on' : ''}" id="rm">${s.reduceMotion ? 'On' : 'Off'}</button></div>
      <div class="setting"><label>Touch controls</label><div class="seg">${['auto', 'on', 'off'].map(q => `<button class="tab ${s.touch === q ? 'on' : ''}" data-tc="${q}">${q[0].toUpperCase() + q.slice(1)}</button>`).join('')}</div></div>
      <h3 class="h3">Controls</h3>${controlsHtml()}
      <div class="setting"><label>Save data</label><button class="tab" id="reset">Start over…</button></div>
      <p class="sub">Day ${state.day} · ${state.totalGems} gems collected · ${Math.round(state.playedSeconds / 60)} min played</p>`);
    const apply = () => { saveSoon(); emit('settings', { ...s }); };
    $('#v1', p).oninput = e => { s.volume = +e.target.value; apply(); }; $('#v2', p).oninput = e => { s.music = +e.target.value; apply(); };
    $('#v1', p).onchange = () => sfx.collect();
    p.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { s.quality = b.dataset.q; sfx.click(); apply(); rerender('settings'); });
    p.querySelectorAll('[data-tc]').forEach(b => b.onclick = () => { s.touch = b.dataset.tc; sfx.click(); apply(); rerender('settings'); });
    $('#rm', p).onclick = () => { s.reduceMotion = !s.reduceMotion; sfx.click(); applyMotion(); apply(); rerender('settings'); };
    $('#reset', p).onclick = e => { const b = e.target; if (b.dataset.sure) resetSave(); else { b.dataset.sure = 1; b.textContent = 'Really erase? Tap again'; } };
    return p;
  }
  const applyMotion = () => document.body.classList.toggle('reduce', !!state.settings.reduceMotion);
  const applyQuality = () => {
    const r = window.__game?.renderer; if (!r) return; const q = state.settings.quality;
    r.setPixelRatio(q === 'low' ? 0.75 : q === 'medium' ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = q !== 'low'; r.setSize(innerWidth, innerHeight);
  };
  on('settings', applyQuality); applyMotion(); setTimeout(applyQuality, 0);

  // ---- HUD values ----
  const petalsEl = $('#petals'); let shown = state.petals;
  const setPetals = () => { petalsEl.textContent = state.petals; };
  setPetals(); $('#day').textContent = state.day; renderTracker();
  on('currency', e => {
    if (e.delta > 0) { const p = $('#p-petals'); p.classList.add('bump'); setTimeout(() => p.classList.remove('bump'), 180); }
    setPetals(); if (openPanel === 'shop') rerender('shop');
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
  while (box.children.length >= 3) box.firstChild.remove();
  const t = h(`<div class="toast ${kind}"><div class="ti">${icon}</div><div>${text}</div></div>`); box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3200);
}
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
