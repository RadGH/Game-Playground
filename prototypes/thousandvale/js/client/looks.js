// Character looks. The wire carries only `{ race, cls, seed }` for a player (a few bytes); every client
// builds the same Chibi 2 avatar from it: a race-weighted random face and body (avatar-3d's
// randomChibi2, the generator Farhold's Randomise button uses), dressed in the class outfit
// (avatar-3d/data/class-outfits.json). Same input -> same look on every screen.

import { dropRetired } from './retired-parts.js';
import { randomAvatar, makeRng } from '../../../../avatar-2d/js/random.js';
import { partIds } from '../../../../avatar-2d/js/parts/index.js';
import { randomChibi2, CHIBI2_RACES } from '../../../../avatar-3d/js/chibi2-races.js';
import { loadClassOutfits, loadClassOutfits2, dressAs } from '../../../../avatar-3d/js/class-outfits.js';
import { CREATURE_TYPES } from '../../../../avatar-3d/js/creature-types.js';
import { gearLook, gearKey } from './gear-look.js';
import { loadGearCatalog } from '../../../../avatar-3d/js/gear-catalog.js';   // play-test 5 (T23): stream F's new models for every slot
import { applyCustom, customKey, lookCustom } from './ui/appearance-core.js';   // play-test 2 Q20/Q21: the face/body a player chose

export const PLAYABLE_RACES = ['human', 'elf', 'dwarf', 'halfling'];
export const RACE_NAMES = Object.fromEntries(PLAYABLE_RACES.map(r => [r, CHIBI2_RACES[r]?.name?.replace(/^Chibi 2 /, '') || r]));

let presets = null, outfits = null, bases = null, outfits2 = null, armourThemes = null, gearCatalog = null, tvOutfits = null;
export async function loadLookData() {
  if (!presets) presets = fetch(new URL('../../../../avatar-2d/data/presets.json', import.meta.url)).then(r => r.json());
  if (!outfits) outfits = loadClassOutfits();
  // item bases (emberveil items.json, the table Farhold's loot reads): an armour base's tier, a weapon's subtype
  // play-test 8 (W19/W25): plus Thousandvale's own bases (data/rules/gear-tv.json — backpacks, cloaks, belts), which the
  // server adds to that table in memory; without them a compact `info.gear` entry of one had no tier, no slot, no pack model
  if (!bases) bases = Promise.all([
    fetch(new URL('../../../emberveil/data/items.json', import.meta.url)).then(r => (r.ok ? r.json() : {})).catch(() => ({})),
    fetch(new URL('../../data/rules/gear-tv.json', import.meta.url)).then(r => (r.ok ? r.json() : {})).catch(() => ({})),
  ]).then(([d, tv]) => ({ ...(d.weaponBases || {}), ...(d.armorBases || {}), ...(tv.bases?.weapon || {}), ...(tv.bases?.armor || {}) })).catch(() => ({}));
  // play-test 4 S18: tier-2 class armour (avatar-3d class-outfits-t2.json) + C/E's themes for themed worn pieces
  if (!outfits2) outfits2 = loadClassOutfits2();
  if (!armourThemes) armourThemes = fetch(new URL('../../data/rules/armour-tiers.json', import.meta.url)).then(r => (r.ok ? r.json() : {})).then(d => d.themes || {}).catch(() => ({}));
  if (!gearCatalog) gearCatalog = Promise.resolve().then(() => loadGearCatalog()).catch(() => null);      // absent = the older tables draw everything
  // wrap-up (Y32): the Starcaller's and Star Blade's OUTFITS are in the shared avatar-3d tables (moved 2026-10-22, so the
  // galleries show them); data/class-outfits-tv.json keeps only how those classes cut their WORN pieces (`wear`).
  if (!tvOutfits) tvOutfits = fetch(new URL('../../data/class-outfits-tv.json', import.meta.url)).then(r => (r.ok ? r.json() : {})).catch(() => ({}));
  const [p, o, b, o2, th, gc, tv] = await Promise.all([presets, outfits, bases, outfits2, armourThemes, gearCatalog, tvOutfits]);
  loaded = { presets: p, outfits: o, bases: b, outfits2: o2, themes: th, catalog: gc, wear: tv.wear || {} };
  return loaded;
}

/**
 * W25: the options every body in the world is dressed with — and so the ones an item's ICON must be drawn with
 * (gear-look.js `wornLook(item, slot, gearOpts(cls))`). Sync: before the look data has loaded it answers with empty
 * tables (the icon queue starts after boot); `await loadLookData()` first where that matters.
 */
let loaded = null;
export function gearOpts(cls = null) {
  const L = loaded || {};
  return { baseOf: k => L.bases?.[k] || null, tier2: (cls && L.outfits2?.[cls]) || null, themes: L.themes || null, catalog: L.catalog || null, classWear: (cls && L.wear?.[cls]) || null };
}
export const lookDataReady = () => !!loaded;

/** The avatar JSON for a player look. Cached by key: a crowd of the same class+seed builds once. */
const cache = new Map();
export async function avatarFor(look) {
  // A bare avatar JSON (no race/seed wrapper) is used as it is. `look.avatar` (protocol v6) is the face and body the
  // player chose in the editor: laid over the seeded body below, so clothes still follow the class / worn gear (P22).
  if (look?.body && look?.headShape) return dropRetired(look);      // #77: no blindfold, whoever asks
  const race = PLAYABLE_RACES.includes(look?.race) ? look.race : 'human';
  const cls = look?.cls || 'warrior';
  const seed = (look?.seed >>> 0) || 1;
  // P22: in the world a character wears plain clothes plus exactly its gear (`look.gear`, slot -> item); with no
  // `gear` field at all (the title preview, town folk) it is dressed in its class outfit as before
  const worn = look && look.gear !== undefined && look.gear !== null;
  const custom = lookCustom(look), ck = custom ? customKey(custom) : '';
  const key = `${race}|${cls}|${seed}${ck ? '|c:' + ck : ''}${worn ? '|g:' + gearKey(look.gear) : ''}`;
  if (cache.has(key)) return cache.get(key);
  const { presets: data, outfits: o, bases: B, outfits2: O2, themes: TH, catalog: GC } = await loadLookData();
  const base = applyCustom(randomChibi2(randomAvatar, data, { race, seed, makeRng, known: (slot, id) => partIds(slot).includes(id) }), custom);
  let a;
  if (worn) a = { ...base, ...gearLook(look.gear, gearOpts(cls)) };      // W25: the one set of options (icons use the same)
  else { const outfit = o[cls] || o.warrior; a = outfit ? dressAs(base, outfit) : base; }
  a = dropRetired(a);                                                 // #77: the seeded face may roll a blindfold; it is drawn as none
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  cache.set(key, a);
  return a;
}

/** The avatar-3d creature type for a server monster type id (a type with no body yet is drawn as a wolf). */
export function bodyTypeFor(type) { return MONSTER_BODIES[type] || (CREATURE_TYPES[type] ? type : 'wolf'); }

/** Monster type ids (server) whose avatar-3d body has a different name. */
export const MONSTER_BODIES = { grey_wolf: 'wolf', direwolf: 'dire_wolf', dire_wolf: 'dire_wolf' };

/** A stable look for a character that sent none (bots): human, seed from its id. */
export function defaultLook(charId, cls) {
  let h = 2166136261; for (const c of String(charId)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return { race: PLAYABLE_RACES[(h >>> 0) % 4], seed: (h >>> 0) || 1, cls };
}

/**
 * Monster looks by type id, from Farhold's bestiary (prototypes/farhold/data/enemies.json: enemies, bosses,
 * pets): `{ avatar }` = a Chibi 2 humanoid (brigands, cultists, knights), `{ creature }` = a beast spec.
 * Thousandvale-only monsters can add `data/monster-looks.json` ({ type: look }) later; it wins when present.
 */
let monsterLooks = null;
export function loadMonsterLooks() {
  if (!monsterLooks) monsterLooks = (async () => {
    const out = {};
    try {
      const d = await (await fetch(new URL('../../../farhold/data/enemies.json', import.meta.url))).json();
      for (const k of ['enemies', 'bosses', 'pets']) for (const e of d[k] || []) if (e.look) out[e.id] = e.flying ? { ...e.look, flying: true } : e.look;   // flying: drawn hovering (C: the snapshot has no hover)
    } catch {}
    try { const r = await fetch(new URL('../../data/monster-looks.json', import.meta.url)); if (r.ok) Object.assign(out, await r.json()); } catch {}
    // EXPANSION-1 §5: Thousandvale-only monsters carry their own look (js/rules/tv-monsters.js gives them stats)
    try { const r = await fetch(new URL('../../data/rules/monsters-tv.json', import.meta.url)); if (r.ok) for (const m of (await r.json()).monsters || []) if (m.look) out[m.id] = m.flying ? { ...m.look, flying: true } : m.look; } catch {}
    return out;
  })();
  return monsterLooks;
}
