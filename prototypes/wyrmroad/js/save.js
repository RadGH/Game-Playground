// Wyrmroad's save on this device (docs/ARCH.md "Save"): every hero with their gear, bag, gold, level, story and play
// time. localStorage key `wyrmroad.save.v1`, wrapped so a blocked store never breaks the game; the account copy
// (shared/rgs-cloudsave.js) carries the same key and describeSaves() tells the "which save?" choice what each side holds.
// Settings live per device in their own key (they never travel to another device).
//
//   const save = loadSave(data);   writeSave(save);               // stamp: playedAt = this was play (never "now" for reads)
//   const h = newHero(data, { name, cls, look });  save.heroes.push(h);
//   applyEvents(save, data, heroOfPid, events) → [{ kind: 'bagFull', item, gold } …]   (loot / gold / xp / levelUp)
//   chapterCleared(h, chIndex, secs, chapters)
import { starterGear, levelFor, SLOTS } from './sim/items.js';

export const SAVE_KEY = 'wyrmroad.save.v1';
export const SETTINGS_KEY = 'wyrmroad.settings.v1';
export const SAVE_VERSION = 1;
export const BAG_SIZE = 36;

export const DEFAULT_SETTINGS = { volume: 0.8, quality: 'high', shake: true, damageNumbers: true, music: true };

export function freshSave() { return { v: SAVE_VERSION, playedAt: 0, heroes: [], lastHero: null }; }

let uidN = 0;
const uid = () => `h${Date.now().toString(36)}${(++uidN).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** A brand-new hero: level 1, the class's starter kit, its first two spells (the second unlocks at its level). */
export function newHero(data, { name, cls, look = {} }) {
  const C = data.classes.classes[cls];
  return {
    id: uid(), name: String(name || C.name).slice(0, 16), cls, look: JSON.parse(JSON.stringify(look)), level: 1, xp: 0, gold: 0,
    gear: starterGear(data.items, cls), bag: [], spells: C.spells.slice(0, 2),
    story: { reached: 0, done: [], ending: null }, playTime: 0, best: {}, shop: { turn: 0, stock: [] }, created: Date.now(),
  };
}

/** Make any stored hero whole (old or hand-edited saves never crash a screen). */
export function fixHero(data, h) {
  const C = data.classes.classes[h?.cls];
  if (!C) return null;
  const out = {
    id: h.id || uid(), name: String(h.name || C.name).slice(0, 16), cls: h.cls, look: h.look && typeof h.look === 'object' ? h.look : {},
    level: 1, xp: Math.max(0, +h.xp || 0), gold: Math.max(0, Math.round(+h.gold || 0)),
    gear: {}, bag: Array.isArray(h.bag) ? h.bag.filter(okItem) : [],
    spells: Array.isArray(h.spells) && h.spells.length === 2 ? h.spells.map(s => (C.spells.includes(s) ? s : null)) : C.spells.slice(0, 2),
    story: { reached: Math.max(0, Math.min(5, +h.story?.reached || 0)), done: Array.isArray(h.story?.done) ? [...new Set(h.story.done)] : [],
      ending: ['free', 'hold'].includes(h.story?.ending) ? h.story.ending : null },
    playTime: Math.max(0, +h.playTime || 0), best: h.best && typeof h.best === 'object' ? { ...h.best } : {},
    shop: { turn: +h.shop?.turn || 0, stock: Array.isArray(h.shop?.stock) ? h.shop.stock.filter(okItem) : [] }, created: +h.created || 0,
  };
  out.level = Math.max(levelFor(data.classes, out.xp), Math.min(12, +h.level || 1));
  for (const s of SLOTS) if (okItem(h.gear?.[s])) out.gear[s] = h.gear[s];
  // heroes made before 2026-11-20's fix kept their skin only in skin.color, which the 3D body never read
  if (out.look.skin?.color && out.look.body && !out.look.body.skin) out.look.body.skin = out.look.skin.color;
  if (!out.spells[0]) out.spells[0] = C.spells[0];
  return out;
}
const okItem = it => !!it && typeof it === 'object' && typeof it.base === 'string' && typeof it.uid === 'string';

export function upgradeSave(data, raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== SAVE_VERSION) return freshSave();
  const s = { ...freshSave(), ...raw };
  s.heroes = (Array.isArray(raw.heroes) ? raw.heroes : []).map(h => fixHero(data, h)).filter(Boolean);
  s.playedAt = Number.isFinite(raw.playedAt) ? raw.playedAt : 0;
  if (!s.heroes.some(h => h.id === s.lastHero)) s.lastHero = s.heroes[0]?.id || null;
  return s;
}

export function loadSave(data) {
  try { const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (raw) return upgradeSave(data, raw); } catch { /* blocked or broken */ }
  return freshSave();
}

/** Write the save. stamp = this was play (a chapter, a purchase, a new hero): the time the "which save?" choice shows. */
export function writeSave(save, stamp = true) {
  if (stamp) save.playedAt = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); return true; } catch { return false; }
}

export function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null') || {}) }; } catch { return { ...DEFAULT_SETTINGS }; }
}
export function writeSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* blocked */ } }

/**
 * Fold one batch of fight events into the save. heroOf(pid) → the saved hero that pid plays (null for bots and quick
 * heroes that are not kept). Returns notes for the HUD (a full bag sells the find on the spot).
 */
export function applyEvents(save, data, heroOf, events, { salvage = () => 1 } = {}) {
  const notes = [];
  for (const e of events) {
    const h = e.pid != null ? heroOf(e.pid) : null;
    if (!h) continue;
    if (e.type === 'loot' && e.item) {
      if (h.bag.length >= BAG_SIZE) { const g = salvage(e.item); h.gold += g; notes.push({ kind: 'bagFull', pid: e.pid, item: e.item, gold: g }); }
      else h.bag.push(e.item);
    } else if (e.type === 'gold') h.gold += Math.max(0, Math.round(e.amount || 0));
    else if (e.type === 'xp') { h.xp += Math.max(0, Math.round(e.amount || 0)); h.level = Math.max(h.level, levelFor(data.classes, h.xp)); }
    else if (e.type === 'levelUp') h.level = Math.max(h.level, e.level || 1);
  }
  return notes;
}

/** A chapter was won: mark it done, open the next place, keep the best time. */
export function chapterCleared(h, chIndex, secs, chapters) {
  const ch = chapters[chIndex]; if (!ch) return;
  if (!h.story.done.includes(ch.id)) h.story.done.push(ch.id);
  h.story.reached = Math.max(h.story.reached, Math.min(chapters.length - 1, chIndex + 1));
  if (secs > 0 && (!h.best[ch.id] || secs < h.best[ch.id])) h.best[ch.id] = Math.round(secs);
}

/** Equip an item from the bag into its slot (the old one goes back in the bag). Returns false if it can't go there. */
export function equip(data, h, uidOf, slot = null) {
  const i = h.bag.findIndex(it => it.uid === uidOf); if (i < 0) return false;
  const it = h.bag[i], b = data.items.items.find(x => x.id === it.base);
  if (!b || !b.cls.includes(h.cls)) return false;
  const to = slot || b.slot;
  if (to !== b.slot) return false;
  h.bag.splice(i, 1);
  if (h.gear[to]) h.bag.push(h.gear[to]);
  h.gear[to] = it;
  // a two-handed weapon empties the off hand
  if (to === 'weapon' && b.hand === 'two' && h.gear.offhand) { h.bag.push(h.gear.offhand); delete h.gear.offhand; }
  if (to === 'offhand' && h.gear.weapon) {
    const wb = data.items.items.find(x => x.id === h.gear.weapon.base);
    if (wb?.hand === 'two') { h.bag.push(h.gear.weapon); delete h.gear.weapon; }
  }
  return true;
}
export function unequip(h, slot) {
  if (!h.gear[slot] || h.bag.length >= BAG_SIZE) return false;
  h.bag.push(h.gear[slot]); delete h.gear[slot]; return true;
}

/** What a set of saves holds, for the "which save to keep?" choice (shared/rgs-cloudsave.js describe hook). */
export function describeSaves(values, data = null) {
  let s = null; try { s = JSON.parse(values?.save || 'null'); } catch { s = null; }
  if (!s || typeof s !== 'object' || !Array.isArray(s.heroes)) return { playedAt: 0, lines: ['No heroes saved'] };
  const n = v => Math.round(+v || 0).toLocaleString('en-US');
  const CLS = { vanguard: 'Vanguard', duelist: 'Duelist', arcanist: 'Arcanist', warden: 'Warden' };
  const chName = i => data?.chapters?.chapters?.[i]?.name || `chapter ${n(i + 1)}`;
  const heroes = s.heroes.filter(h => h && CLS[h.cls]);
  if (!heroes.length) return { playedAt: Number.isFinite(s.playedAt) ? s.playedAt : 0, lines: ['No heroes saved'] };
  const sorted = [...heroes].sort((a, b) => (b.level || 1) - (a.level || 1));
  const lines = sorted.slice(0, 3).map(h => `${String(h.name || 'Hero').slice(0, 16)}: level ${n(h.level || 1)} ${CLS[h.cls]}, at ${chName(h.story?.reached || 0)}, ${n(h.gold)} gold`);
  if (sorted.length > 3) lines.push(`and ${n(sorted.length - 3)} more ${sorted.length - 3 === 1 ? 'hero' : 'heroes'}`);
  const mins = heroes.reduce((a, h) => a + (+h.playTime || 0), 0) / 60;
  const done = heroes.reduce((a, h) => a + (h.story?.done?.length || 0), 0);
  lines.push(`${n(done)} chapters cleared, ${mins >= 90 ? `${n(mins / 60)} h` : `${n(mins)} min`} played`);
  return { playedAt: Number.isFinite(s.playedAt) ? s.playedAt : 0, lines };
}
