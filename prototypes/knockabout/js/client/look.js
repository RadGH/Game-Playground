// A fighter's look: the Chibi 2.5 avatar Tumblefair and Thousandvale use, plus a costume picked PIECE BY PIECE.
//
//   look = { race, seed, v: 1,
//            custom?: { body, headShape, hair, eyes, ... }      face + body choices (Thousandvale's appearance-core blob)
//            wear?:   { hat: { id, color, color2? }, top, bottom, shoes, cape, accessory, extras, ears, decor },
//            preset?: 'cos_pirate' }                            the whole-costume preset last applied (a label only)
//   avatarOf(look) -> the full avatar JSON Chibi 2.5 builds (cached)
//
// The face comes from the seed (tidied the way Tumblefair tidies it, so a random face is a friendly one), the editor's
// face/body choices are laid over it, then every costume slot in `wear` is laid over that. A preset (from
// tumblefair/data/cosmetics.json) just FILLS every slot of `wear`; after that any one piece can be changed on its own.
// Looks are kept per local player slot (P1..P8) in localStorage — slot 0 on the account when signed in (see below).
import { randomAvatar, makeRng } from '../../../../avatar-2d/js/random.js';
import { partIds, PARTS } from '../../../../avatar-2d/js/parts/index.js';
import { randomChibi2 } from '../../../../avatar-3d/js/chibi2-races.js';
import { loadClassOutfits, dressAs } from '../../../../avatar-3d/js/class-outfits.js';
import { applyCustom, PALETTES } from '../../../thousandvale/js/client/ui/appearance-core.js';
import { tidyFace } from '../../../tumblefair/js/client/look-tidy.js';

export const RACES = ['human', 'elf', 'dwarf', 'halfling'];
export const RACE_NAMES = { human: 'Human', elf: 'Elf', dwarf: 'Dwarf', halfling: 'Halfling' };

/** The costume slots, in builder order. `skip` = ids Chibi 2 draws as nothing, or that are not right for this game. */
export const WEAR_SLOTS = [
  { slot: 'hat', label: 'Hat', skip: [] },
  { slot: 'top', label: 'Top', skip: ['tank'] },
  { slot: 'bottom', label: 'Bottom', skip: ['shorts'] },
  { slot: 'shoes', label: 'Shoes', skip: ['hooves'] },
  { slot: 'cape', label: 'Cape / back', skip: [] },
  { slot: 'accessory', label: 'Accessory', skip: ['blindfold'] },
  { slot: 'extras', label: 'Face marks', skip: ['dirt', 'mud', 'blood', 'brand', 'undead_skin', 'pale', 'burn_scar'] },
  { slot: 'ears', label: 'Ears', skip: ['fins'] },
  { slot: 'decor', label: 'Extra gear', skip: ['t2_pauldrons', 't2_mantle', 't2_harness', 't2_vestments', 't2_wildmantle'] },
];
const NO_COLOUR = new Set(['ears', 'extras']);
export const wearIds = slot => { const s = WEAR_SLOTS.find(x => x.slot === slot); return partIds(slot).filter(id => !s.skip.includes(id)); };
export const wearHasColour = slot => !NO_COLOUR.has(slot);
const pretty = id => String(id || '').replace(/^g5_/, '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
/** A menu name for a part: the catalogue's own name, shortened at the first bracket. */
export function partName(slot, id) {
  const n = PARTS[slot]?.[id]?.name;
  return n ? String(n).replace(/\s*\(.*$/, '') : pretty(id);
}
/** Colours for clothes (a wider set than the face palettes: this is a toy box). */
export const CLOTH = ['#ffffff', '#1d1d24', '#e23b3b', '#ff8a2a', '#ffd23f', '#3ecf5a', '#2a9d8f', '#3d8bff', '#6a4cff', '#f04fd8', '#8a5a3a', '#9aa3ad'];
export { PALETTES };

let outfits = null, costumes = null, avPresets = null, ready = null;
/** Load the class outfits and Tumblefair's costume list once. */
export function loadLookData() {
  if (!ready) ready = (async () => {
    const get = async u => { try { return await (await fetch(new URL(u, import.meta.url))).json(); } catch { return null; } };
    const [o, c, p] = await Promise.all([loadClassOutfits().catch(() => ({})), get('../../../tumblefair/data/cosmetics.json'), get('../../../../avatar-2d/data/presets.json')]);
    outfits = o || {}; avPresets = p || {}; costumes = (c?.items || []).filter(i => i.kind === 'costume');
  })();
  return ready;
}
/** Whole-costume presets: { id, name, season? }. */
export const presets = () => costumes || [];

const cache = new Map();
/** The base avatar of a look (face from the seed, the editor's face/body choices), before the costume. */
function baseOf(look) {
  const race = RACES.includes(look?.race) ? look.race : 'human', seed = (look?.seed >>> 0) || 1;
  const av = applyCustom(tidyFace(randomChibi2(randomAvatar, avPresets, { race, seed, makeRng, known: (slot, id) => partIds(slot).includes(id) }), seed), look?.custom || null);
  av.held = { id: 'none' }; av.offhand = { id: 'none' };     // fists only in a brawl
  return av;
}
/** look -> full avatar JSON (cached). */
export function avatarOf(look) {
  const key = JSON.stringify(look || null);
  if (cache.has(key)) return cache.get(key);
  let av = baseOf(look);
  for (const [slot, part] of Object.entries(look?.wear || {})) {
    if (!part || !WEAR_SLOTS.some(s => s.slot === slot) || !partIds(slot).includes(part.id)) continue;
    av[slot] = { ...(av[slot] || {}), ...part };
    if (!part.color2) delete av[slot].color2;
  }
  if (cache.size > 120) cache.clear();
  cache.set(key, av);
  return av;
}
/** Every costume slot of an avatar, as a `wear` map. */
export function wearOf(av) {
  const w = {};
  for (const { slot } of WEAR_SLOTS) { const p = av?.[slot]; w[slot] = p?.id ? { id: p.id, ...(p.color ? { color: p.color } : {}), ...(p.color2 ? { color2: p.color2 } : {}) } : { id: slot === 'ears' ? 'normal' : 'none' }; }
  return w;
}
/** Apply a whole-costume preset: every slot filled from it (slots the preset leaves out keep the look's own). */
export function withPreset(look, presetId) {
  const c = (costumes || []).find(x => x.id === presetId);
  const base = baseOf({ ...look, wear: undefined });
  let av = { ...base, ...(look.wear ? Object.fromEntries(Object.entries(look.wear).map(([k, v]) => [k, { ...v }])) : {}) };
  if (c && typeof c.outfit === 'string' && outfits?.[c.outfit]) av = dressAs(av, outfits[c.outfit], { hands: false });
  else if (c && c.outfit && typeof c.outfit === 'object') for (const [slot, part] of Object.entries(c.outfit)) { if (slot !== 'held' && slot !== 'offhand') av[slot] = { ...part }; }
  else if (c && c.outfit == null) av = { ...base };          // "come as you are": the seed's own clothes
  return { ...look, wear: wearOf(av), preset: presetId };
}

/** A fresh random look (friendly face, the seed's own clothes). */
export function randomLook(rand = Math.random) {
  const race = RACES[Math.floor(rand() * RACES.length)], seed = (rand() * 2 ** 31) >>> 0;
  const look = { race, seed, v: 1 };
  return { ...look, wear: wearOf(baseOf(look)) };
}

// ---- per-slot storage (P1..P8) --------------------------------------------------------------------------------------
// Accounts (2026-10-23): when this browser is signed in to games.radgh.com, slot 0 (this device's first player) is the
// ACCOUNT's fighter instead of the browser's: js/client/account.js calls setAccountSlot(profile, save) and every save
// of slot 0 goes to the server too. Signed out (setAccountSlot(null)) slot 0 is the browser's guest fighter again.
const KEY = 'knockabout.slot.';
let acct = null;           // { data: { name, look } | null, save(data) }
export function setAccountSlot(data, save = null) { acct = save ? { data: data && data.look ? data : null, save } : null; }
export const accountSlotOn = () => !!acct;
export function loadGuestSlot(i) {
  try { const s = JSON.parse(localStorage.getItem(KEY + i) || 'null'); if (s && s.look && typeof s.look === 'object') return s; } catch { /* private window */ }
  return null;
}
export function loadSlot(i) {
  if (i === 0 && acct) return acct.data;
  return loadGuestSlot(i);
}
export function saveSlot(i, data) {
  if (i === 0 && acct) { acct.data = data; acct.save(data); return; }
  try { localStorage.setItem(KEY + i, JSON.stringify(data)); } catch { /* storage blocked: the look lasts this visit */ }
}
