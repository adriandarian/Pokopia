// Graphics quality tiers: 'low' | 'medium' | 'high', plus the user-facing setting 'auto'.
//
//   getTier()            the SETTING: 'auto' | 'low' | 'medium' | 'high'   (what the Settings control shows)
//   getEffectiveTier()   the tier actually applied right now: 'low' | 'medium' | 'high'
//   setTier(t)           change the setting (persisted in localStorage 'pokopia.quality'); 'auto' re-runs the heuristics
//   onTierChange(fn)     fn(profile, effectiveTier, info) is called immediately and after every change; returns unsubscribe
//   applyTier()          re-apply the current profile to every subscriber (e.g. after a resize / context restore)
//   profile()            the live profile object of the effective tier (read-only knobs, see PROFILES below)
//   frame(dtMs)          called once per rendered frame by main.js; feeds the adaptive controller (auto only)
//
// Every knob in PROFILES is consumed by the module that owns the feature via onTierChange, so switching is live (no reload).
import { on, emit } from './game/events.js';
import { state, saveSoon } from './game/state.js';

export const TIERS = ['low', 'medium', 'high'];
const KEY = 'pokopia.quality';

/*
 * Knobs. Rationale in brackets.
 *  dprCap      renderer pixel ratio cap [fill-rate is the first thing a tablet runs out of]
 *  msaa        samples on the HDR post render target [canvas itself is never multisampled]
 *  post        'lite' = scene -> one combined grade+tonemap pass (no bloom); 'half' = half-res bloom; 'full' = full-res bloom
 *  shadow      size / half = shadow frustum half-extent (m) / every = re-render every Nth frame / soft = PCFSoft vs PCF
 *  casterClass 1 = hero, trees, terrain only; 2 = + creatures, bushes, rocks, decor; 3 = everything incl. merged props
 *  grass       dist = fade/cull distance (m), frac = fraction of tufts drawn
 *  flora       tree = cull distance multiplier for trees/rocks, small = multiplier for flowers/ferns/shrooms, density = share of small flora kept
 *  terrainNear distance under which the 32x32 terrain chunk is used instead of the 10x10 one
 *  creature    near/far LOD ranges (m); animation of 'far' creatures is already skipped by creatures.js
 *  fx          particle budgets (see life.js / petals.js / sky.js); slow = update CPU-driven particles every 2nd frame
 *  outlineMin  inverted-hull outline meshes smaller than this many triangles are hidden (low: only the big silhouette outlines stay)
 *  water       0 = no fine sparkle/foam loops, 1 = no glitter layer, 2 = full
 *  terrainDetail  close-range clover/grain/voronoi layers in the ground shader
 *  dapple      leaf-shadow noise in every lit material (ShaderChunk patch; toggling recompiles materials once)
 */
export const PROFILES = {
  low: {
    dprCap: 1.0, msaa: 0, post: 'lite',
    shadow: { size: 1024, half: 28, every: 3, soft: false }, casterClass: 1,
    grass: { dist: 13, frac: 0.38 }, flora: { tree: 0.55, small: 0.5, density: 0.4 }, terrainNear: 16,
    creature: { near: 14, far: 34 }, pickupRange: 55,
    fx: { motes: 110, petals: 28, butterflies: 2, rays: 0, birds: 0, sparks: 50, blossom: 0.35, clouds: 0.35, slow: true },
    outlineMin: 2000, water: 0, terrainDetail: false, dapple: false,
  },
  medium: {
    dprCap: 1.25, msaa: 2, post: 'half',
    shadow: { size: 2048, half: 38, every: 2, soft: true }, casterClass: 2,
    grass: { dist: 21, frac: 0.7 }, flora: { tree: 0.85, small: 0.8, density: 0.75 }, terrainNear: 26,
    creature: { near: 18, far: 48 }, pickupRange: 90,
    fx: { motes: 280, petals: 60, butterflies: 6, rays: 5, birds: 6, sparks: 110, blossom: 0.7, clouds: 0.65, slow: false },
    outlineMin: 0, water: 1, terrainDetail: true, dapple: true,
  },
  high: {
    dprCap: 2, msaa: 4, post: 'full',
    shadow: { size: 4096, half: 38, every: 1, soft: true }, casterClass: 3,
    grass: { dist: 28, frac: 1 }, flora: { tree: 1, small: 1, density: 1 }, terrainNear: 32,
    creature: { near: 22, far: 60 }, pickupRange: 1e9,
    fx: { motes: 450, petals: 100, butterflies: 16, rays: 9, birds: 9, sparks: 160, blossom: 1, clouds: 1, slow: false },
    outlineMin: 0, water: 2, terrainDetail: true, dapple: true,
  },
};

// Program-cache key suffix: the dapple patch lives in THREE.ShaderChunk, which three's program cache does not look at.
let dappleOn = true;
export const setDappleFlag = (v) => { dappleOn = !!v; };
export const dappleKey = () => (dappleOn ? '' : '|nodapple');

/** Tag a mesh with a shadow-caster class (1 = always, 2 = medium+, 3 = high only); `want` = whether it casts at all. */
export function setCaster(o, cls = 2, want = true) { o.userData.sc = cls; o.userData.cast0 = want; o.castShadow = want && cls <= PROFILES[effective].casterClass; return o; }
const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
/** Hide small outline hulls on low (they cost a draw call each for a sliver of silhouette). Call for freshly built outlines too. */
export function outlineVisible(o) { if (o.userData.tris === undefined) o.userData.tris = triCount(o.geometry); return o.userData.tris >= PROFILES[effective].outlineMin; }
export function applyDetail(root) { root.traverse(o => { if (o.isMesh && o.userData.isOutline) o.visible = outlineVisible(o); }); }
export function applyCasters(root) { const mx = PROFILES[effective].casterClass; root.traverse(o => { if (o.userData.sc !== undefined) o.castShadow = !!o.userData.cast0 && o.userData.sc <= mx; }); }

const listeners = new Set();
let setting = 'auto';        // what the user chose
let effective = 'high';      // what is applied
let inited = false;
let gpuInfo = { renderer: '', vendor: '' };
let reason = 'init';
let lastStepDown = -1e9, changes = 0;

const read = () => { try { const v = localStorage.getItem(KEY); return v === 'auto' || TIERS.includes(v) ? v : 'auto'; } catch { return 'auto'; } };
const write = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private mode etc. */ } };

export const getTier = () => setting;
export const getEffectiveTier = () => effective;
export const profile = () => PROFILES[effective];
export const gpu = () => gpuInfo;

function notify(info = {}) {
  const p = PROFILES[effective];
  for (const fn of [...listeners]) { try { fn(p, effective, info); } catch (e) { console.error('[quality] listener failed', e); } }
}
export function applyTier() { notify({ reason: 'apply' }); }
export function onTierChange(fn) {
  listeners.add(fn);
  try { fn(PROFILES[effective], effective, { reason: 'subscribe' }); } catch (e) { console.error('[quality] listener failed', e); }
  return () => listeners.delete(fn);
}

function setEffective(t, why) {
  if (!PROFILES[t]) return;
  const changed = t !== effective;
  effective = t; reason = why;
  settle();
  if (changed || why === 'init') notify({ reason: why });
  emit('quality', { setting, tier: effective, reason: why });
}

export function setTier(t, opts = {}) {
  if (t !== 'auto' && !TIERS.includes(t)) return;
  const prev = setting; setting = t; write(t);
  state.settings.quality = t; saveSoon();
  if (t === 'auto') {
    resetAuto(); if (prev !== 'auto' || opts.force) setEffective(readAuto() || guessTier(), 'auto');
  } else setEffective(t, 'manual');
}

// ------------------------------------------------------------------ heuristics
export function detectGpu(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) gpuInfo = { renderer: String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || ''), vendor: String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '') };
  } catch { /* ignore */ }
  return gpuInfo;
}
const rank = { low: 0, medium: 1, high: 2 };
const minTier = (a, b) => (rank[a] <= rank[b] ? a : b);

export function guessTier() {
  const nav = navigator, ua = nav.userAgent || '';
  const g = (gpuInfo.renderer + ' ' + gpuInfo.vendor).toLowerCase();
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const ipadOS = /Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1;
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle/i.test(ua) || ipadOS;
  const mobile = mobileUA || (coarse && (nav.maxTouchPoints || 0) > 0 && innerWidth < 1400);
  const cores = nav.hardwareConcurrency || 4, mem = nav.deviceMemory || 8;
  let t = 'high';
  const software = /swiftshader|llvmpipe|software|basic render|softpipe|microsoft basic/.test(g);
  const weakMobileGpu = /mali-?(t|g)?[1-6]\d\d?\b|mali-4|adreno \(?tm\)? ?[2-5]\d\d|adreno[ _-]?[2-5]\d\d|powervr|sgx|videocore|vivante|tegra [234]|apple a(8|9|10|11)\b/.test(g);
  const intelIGP = /intel/.test(g) && !/arc/.test(g);
  if (software) t = 'low';
  else if (mobile) {
    t = 'medium';
    if (cores <= 4 || mem <= 3 || weakMobileGpu) t = 'low';
  } else {
    if (cores <= 4 || mem <= 4) t = minTier(t, 'medium');
    if (intelIGP) t = minTier(t, 'medium');
    if (/intel.*(hd graphics [2-5]\d\d\b|hd graphics\b(?! [6-9])|gma)/.test(g)) t = 'low';
    if (cores <= 2) t = 'low';
  }
  // QA override for the adaptive controller tests: ?qstart=low|medium|high
  try { const q = new URLSearchParams(location.search).get('qstart'); if (TIERS.includes(q)) t = q; } catch { /* ignore */ }
  return t;
}

// ------------------------------------------------------------------ adaptive controller (auto only)
// Conservative on purpose: a healthy machine must never change tier. Windows are judged by the MEDIAN frame time (one-off hitches do not
// count), the first seconds (asset upload / shader compile) are ignored, any big hitch voids its window and the next one, and stepping down
// needs 3 consecutive bad windows. The tier Auto ends up on is remembered, so the next visit starts there (and may still step up).
const WINDOW_MS = 3000, WARMUP_MS = 8000, MAX_CHANGES = 3, SPIKE_MS = 200, DOWN_FPS = 40, UP_FPS = 57, DOWN_WINDOWS = 3, UP_WINDOWS = 4;
const AUTO_KEY = 'pokopia.quality.auto';
let samples = [], accT = 0, bad = 0, good = 0, bootT = 0, settleUntil = 0, voidWindows = 0, dirty = false, stable = 0, started = null;
let ceiling = 'high';        // highest tier auto may use again (lowered when a step up was followed by a step down)
let lastUpFrom = null;
const hist = [];             // window log for QA: {t, fps, tier, valid}

const readAuto = () => { try { const v = localStorage.getItem(AUTO_KEY); return TIERS.includes(v) ? v : null; } catch { return null; } };
const writeAuto = (v) => { try { localStorage.setItem(AUTO_KEY, v); } catch { /* private mode etc. */ } };

function resetAuto() { samples = []; accT = 0; bad = good = stable = 0; dirty = false; }
function settle() { resetAuto(); settleUntil = performance.now() + 3500; voidWindows = 1; } // a tier change recompiles shaders: ignore the next window or two

document.addEventListener?.('visibilitychange', () => { dirty = true; samples = []; accT = 0; });

export function frame(dtMs) {
  if (!inited) return;
  const now = performance.now();
  if (!bootT) bootT = now;
  if (setting !== 'auto' || document.hidden) { dirty = true; return; }
  if (now - bootT < WARMUP_MS || now < settleUntil) { samples = []; accT = 0; return; }
  if (dtMs > SPIKE_MS) { samples = []; accT = 0; voidWindows = 1; return; }   // hitch / compile / throttled tab: void this window and the next
  samples.push(dtMs); accT += dtMs;
  if (accT < WINDOW_MS) return;
  const sorted = samples.slice().sort((x, y) => x - y), med = sorted[sorted.length >> 1], fps = 1000 / med;
  const valid = !dirty && voidWindows === 0;
  samples = []; accT = 0; dirty = false; if (voidWindows > 0) voidWindows--;
  hist.push({ t: Math.round(now - bootT), fps: +fps.toFixed(1), tier: effective, valid }); if (hist.length > 40) hist.shift();
  if (!valid) return;
  if (fps < DOWN_FPS) { bad++; good = 0; stable = 0; } else if (fps > UP_FPS) { good++; bad = 0; stable++; } else { bad = 0; good = 0; stable++; }
  if (stable >= 3 && readAuto() !== effective) writeAuto(effective);   // healthy for ~9 s: this is a good tier for this device
  if (changes >= MAX_CHANGES) return;
  // a step UP needs one change left in reserve, so a failed step up can always be reverted (never stuck on a tier that is too slow)
  if (bad >= DOWN_WINDOWS && rank[effective] > 0) {
    // if we just stepped UP and it did not hold, the higher tier is not sustainable here: remember that
    if (lastUpFrom !== null && rank[effective] > rank[lastUpFrom]) ceiling = lastUpFrom;
    stepTo(TIERS[rank[effective] - 1], 'down');
  } else if (good >= UP_WINDOWS && rank[effective] < rank[ceiling] && now - lastStepDown > 60000 && changes <= MAX_CHANGES - 2) {
    lastUpFrom = effective;
    stepTo(TIERS[rank[effective] + 1], 'up');
  }
}
function stepTo(t, dir) {
  changes++; if (dir === 'down') lastStepDown = performance.now();
  setEffective(t, 'auto-' + dir);
  writeAuto(t);
  if (dir === 'down') showToast(t);   // only a real mid-session slowdown is announced, once per session; step-ups and start-tier decisions are silent
}

// ------------------------------------------------------------------ toast
let toastEl = null, toastTimer = 0, toastShown = false;
function showToast(t) {
  if (typeof document === 'undefined' || toastShown) return;
  toastShown = true;
  const el = document.createElement('div');
  el.className = 'qtoast'; el.setAttribute('role', 'status');
  el.innerHTML = `<span class="qt-ico">🍃</span><span class="qt-tx"><b>Smoother graphics (${t[0].toUpperCase() + t.slice(1)})</b></span><button class="qt-set" type="button">Settings</button><button class="qt-x" type="button" aria-label="Dismiss">×</button>`;
  const gone = () => { clearTimeout(toastTimer); el.classList.add('out'); setTimeout(() => el.remove(), 400); if (toastEl === el) toastEl = null; };
  el.querySelector('.qt-x').onclick = gone;
  el.querySelector('.qt-set').onclick = () => { emit('ui:request', { panel: 'settings' }); gone(); };
  (document.getElementById('ui-root') || document.body).appendChild(el);
  toastEl = el; toastTimer = setTimeout(gone, 4500);
}

// ------------------------------------------------------------------ init
/** Call once, right after the renderer exists and before the scene is built, so every module builds with the final profile. */
export function initQuality(renderer) {
  if (inited) return;
  if (renderer) detectGpu(renderer.getContext());
  setting = read();
  // Auto: start on the tier remembered from the last session (a silent start-tier decision, never a toast), else the heuristic guess
  started = setting === 'auto' ? (readAuto() || guessTier()) : setting;
  try { const q = new URLSearchParams(location.search).get('qstart'); if (setting === 'auto' && TIERS.includes(q)) started = q; } catch { /* ignore */ }
  effective = started;
  inited = true; settle();
  if (typeof window !== 'undefined') window.__quality = { getTier, getEffectiveTier, setTier, profile, gpu, guessTier, history: hist, state: () => ({ setting, effective, started, remembered: readAuto(), changes, ceiling, bad, good, reason }), PROFILES };
  on('settings', (e) => { if (e && e.quality && e.quality !== setting && (e.quality === 'auto' || TIERS.includes(e.quality))) setTier(e.quality); });
  notify({ reason: 'init' });
}
