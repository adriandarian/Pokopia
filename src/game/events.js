/**
 * Tiny event bus shared by every module.  Usage:
 *   import { emit, on, off, once } from './game/events.js';
 *   const stop = on('collect', e => console.log(e));   // returns an unsubscribe fn
 *   emit('collect', { kind: 'gem', amount: 1 });
 *
 * Events (payload fields are optional unless noted):
 *   'collect'       { kind:'gem'|string, amount:number=1, pos?:{x,y,z} }  player picked something up
 *   'discover'      { species:string }   (required) player saw a creature species for the first time
 *   'befriend'      { species:string }   (required) player befriended a creature (fires per creature, once per species counts for journal)
 *   'quest:complete'{ quest }            a quest was finished (emitted by game layer)
 *   'currency'      { delta:number, total:number }   petals changed
 *   'purchase'      { id:string, price:number }      wardrobe item bought
 *   'equip'         { slot:string, id:string }       wardrobe item equipped
 *   'settings'      { volume,music,quality }         settings changed (quality: 'low'|'medium'|'high')
 *   'day'           { day:number }       a new day started
 *   'toast'         { text, icon?, kind? }  ask the UI to show a toast
 *   'ui:open' / 'ui:close' { panel:'journal'|'shop'|'quests'|'settings' }
 *   'play'          {}                   player pressed Play on the title screen
 * Anyone may emit/listen; unknown events are fine.
 */
const map = new Map();
export function on(name, fn) {
  if (!map.has(name)) map.set(name, new Set());
  map.get(name).add(fn);
  return () => off(name, fn);
}
export function off(name, fn) { map.get(name)?.delete(fn); }
export function once(name, fn) { const stop = on(name, e => { stop(); fn(e); }); return stop; }
export function emit(name, payload = {}) {
  const set = map.get(name); if (!set) return;
  for (const fn of [...set]) { try { fn(payload); } catch (err) { console.error(`[events] ${name} handler failed`, err); } }
}
