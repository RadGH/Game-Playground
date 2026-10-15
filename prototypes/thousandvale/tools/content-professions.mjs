#!/usr/bin/env node
// Thousandvale — PROFESSIONS CONTENT (round 8, W9; stream P-core).
//
//   node tools/content-professions.mjs            write data/provinces/professions.json (materials, node kinds, tools,
//                                                 recipes, skins, trainers, job frames) and data/provinces/professions-nodes.json
//                                                 (where every boulder, marked tree and patch stands, on the CURRENT bake)
//   node tools/content-professions.mjs --check    change nothing; exit 1 when a file would change
//   --province=<id>   another province (default torbor_downs): its nodes go to data/provinces/<id>-professions-nodes.json;
//                     the recipes, materials and the start-town prospector + his quest chain stay the home province's
//
// Run it again after any re-bake of the zones, after C changes the gear catalog (the gear recipes list real bases), or
// after a number in data/rules/professions.json `tiers[].unit` moves (prices are worked out from it). Same inputs ->
// same output (no random numbers: every choice is a hash of the spot).
//
// WHERE NODES STAND. Never in a town, on a road, in a field, a building, water or a set piece; always somewhere a walker
// can reach from the province hub. Boulders: beside roads (10-70 m off) and on hillsides. Marked trees: at the edge of
// woods. Herbs: open ground. Mushrooms: under trees. Fibre (flax, reeds): by water, else open ground. A zone's level
// band picks the tiers: a starter zone is nearly all tier 1; tier 2 (skill 25) and 3 (skill 50) come in the 6+ zones.
// Torborhold's gate road gets copper within 150 m (`s: 1` = a starter node: it comes back for you in 2 minutes).
import { readFileSync, writeFileSync } from 'node:fs';
import { parseTerrain, parseNav, NAV } from '../js/rules/terrain-read.js';
import { provinceComponents } from './content-place.mjs';
import { CREATURE_TYPES } from '../../../avatar-3d/js/creature-types.js';
import { HOME_PROVINCE, provinceArg, provinceDataPath, provinceDataSync, requireProvince } from './content-lib.mjs';

const ROOT = new URL('../', import.meta.url);
const P = f => new URL(f, ROOT);
const readJ = f => JSON.parse(readFileSync(P(f), 'utf8'));
const opt = f => { try { return readJ(f); } catch { return null; } };
const CHECK = process.argv.includes('--check');
const PROV = provinceArg(process.argv);     // --province=<id> (default torbor_downs)
const HOME = PROV === HOME_PROVINCE;
const ZM = 2048;
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const h01 = s => hash(s) / 4294967296;

// ------------------------------------------------------------------------------------------------ the tables
const TIER_WORD = ['', 'Bronze', 'Iron', 'Silversteel', 'Blackiron', 'Sunsteel'];
// [id, name, tint, desc] per tier 1..5
const ORE = [['copper_ore', 'Copper Ore', '#b87333'], ['iron_ore', 'Iron Ore', '#8a8f98'], ['silver_ore', 'Silver Ore', '#d5dbe3'], ['blackiron_ore', 'Blackiron Ore', '#3b3f4a'], ['sunsteel_ore', 'Sunsteel Ore', '#f0c040']];
const BAR = [['bronze_bar', 'Bronze Bar', '#c08a4a'], ['iron_bar', 'Iron Bar', '#9aa0aa'], ['silversteel_bar', 'Silversteel Bar', '#dfe6ee'], ['blackiron_bar', 'Blackiron Bar', '#4a4f5c'], ['sunsteel_bar', 'Sunsteel Bar', '#f4cf5a']];
const GEM = [['rough_quartz', 'Rough Quartz', '#e8eef4'], ['garnet', 'Garnet', '#a8243a'], ['amethyst', 'Amethyst', '#8e5cc8'], ['sapphire', 'Sapphire', '#2f6fd6'], ['star_opal', 'Star Opal', '#bfe8e0']];
const LOG = [['ash_log', 'Ash Log', '#c9b48a'], ['oak_log', 'Oak Log', '#9a7446'], ['yew_log', 'Yew Log', '#b0623a'], ['ironbark_log', 'Ironbark Log', '#5e5348'], ['heartwood_log', 'Heartwood Log', '#7a2f2a']];
const HERB = [['meadowmint', 'Meadowmint', '#7fc98a'], ['feverleaf', 'Feverleaf', '#d8c24a'], ['moonpetal', 'Moonpetal', '#c9d4f2'], ['frostbloom', 'Frostbloom', '#9fe0ee'], ['sunroot', 'Sunroot', '#f0a030']];
const SHROOM = [['field_mushroom', 'Field Mushroom', '#e6dccb'], ['amber_cap', 'Amber Cap', '#d98a2b'], ['ghost_morel', 'Ghost Morel', '#cfd6d2'], ['king_bolete', 'King Bolete', '#8a5a34'], ['starcap', 'Starcap', '#7a6fe0']];
const FIBRE = [['flax', 'Flax', '#8fb6e0'], ['hemp', 'Hemp', '#8aa35a'], ['silkweed', 'Silkweed', '#f0e6f4'], ['moonflax', 'Moonflax', '#b8c4f0'], ['sunsilk', 'Sunsilk', '#f6dc8a']];
const CLOTH = [['linen_bolt', 'Bolt of Linen', '#e4dcc8'], ['canvas_bolt', 'Bolt of Canvas', '#b9ad8a'], ['silk_bolt', 'Bolt of Silk', '#f2e8f6'], ['moonweave_bolt', 'Bolt of Moonweave', '#c2ccf4'], ['sunsilk_bolt', 'Bolt of Sunsilk', '#f8e29a']];
const HIDE = [['light_hide', 'Light Hide', '#b08a5e'], ['thick_hide', 'Thick Hide', '#8c6a44'], ['rugged_hide', 'Rugged Hide', '#6e5236'], ['heavy_hide', 'Heavy Hide', '#57402a'], ['drake_hide', 'Drake Hide', '#4c7a5a']];
const LEATHER = [['light_leather', 'Light Leather', '#c49a68'], ['thick_leather', 'Thick Leather', '#9c764c'], ['rugged_leather', 'Rugged Leather', '#7c5c3c'], ['heavy_leather', 'Heavy Leather', '#624830'], ['drake_leather', 'Drake Leather', '#588a66']];
const TREE = ['Ash', 'Oak', 'Yew', 'Ironbark', 'Heartwood'];

/**
 * VHARLEN (Expansion 1 §4.5, stream C): materials that grow only on the Burning Isle. Tier 4-5, so they are the island's
 * answer to the tiers Torbor Downs never grows. Each one feeds the existing tier-4/5 recipes as an ALTERNATE (`alt`) and
 * most start one new recipe line of their own (`VHARL_RECIPES` below). Nodes stand only where a province sheet's
 * `gathering.kinds` names them (data/provinces/vharlen.json). `icon` = the icon library's material class
 * (icons/js/game-icons.js itemArtKey falls back by it). [id, name, tier, prof, icon, tint, price class, price, desc]
 */
export const VHARL_MATERIALS = [
  ['obsidian_ore', 'Obsidian', 4, 'mining', 'ore', '#1c1a24', 'ore', 40, 'Black volcanic glass, broken out of a Vharlen outcrop. A smith melts it down with blackiron, or knaps it into an edge that takes a whetstone like nothing else.'],
  ['sulphur', 'Sulphur', 4, 'mining', 'resin', '#e8d24a', 'resin', 40, 'Yellow crust scraped off the flats of Vharlen. It stinks, it burns hot, and it makes a smelting fire do twice the work.'],
  ['ironpalm_log', 'Ironpalm Log', 4, 'logging', 'wood', '#4a3a2a', 'log', 50, 'Timber from the steam jungle of Vharlen: as hard as ironbark and it never warps in the heat. Hafts, bows, staves and shields.'],
  ['steamcap', 'Steamcap', 4, 'foraging', 'mushroom', '#c8d0c0', 'mushroom', 48, 'A pale mushroom that grows only where the ground breathes steam. Good in a broth, better in a caster\'s orb.'],
  ['cinderbloom', 'Cinderbloom', 5, 'foraging', 'herb', '#ff6a2a', 'herb', 78, 'A red flower that opens on warm ash and nowhere else. The still turns it into something that makes your blood run hot.'],
  ['salamander_hide', 'Salamander Hide', 4, 'skinning', 'hide', '#2a2224', 'hide', 24, 'The black, heat-proof skin of an Ashback Salamander. An outfitter cures it into the toughest leather there is.'],
];
/** Node kinds of the Vharlen materials (the hide comes off a corpse: SKIN_HIDE). [id, prof, tier, name, gives, bonus, look] */
export const VHARL_NODES = [
  ['obsidian', 'mining', 4, 'Obsidian Outcrop', 'obsidian_ore', 'sapphire', { model: 'boulder', size: 2, tint: '#1c1a24', n: 8 }],
  ['sulphur', 'mining', 4, 'Sulphur Crust', 'sulphur', null, { model: 'boulder', size: 1.5, tint: '#e8d24a', n: 6 }],
  ['ironpalm', 'logging', 4, 'Marked Ironpalm', 'ironpalm_log', null, { model: 'tree', size: 10, tint: '#8a3ad0', n: 1 }],
  ['steamcap', 'foraging', 4, 'Steamcap Ring', 'steamcap', null, { model: 'mushroom', size: 0.4, tint: '#c8d0c0', n: 6 }],
  ['cinderbloom', 'foraging', 5, 'Cinderbloom Patch', 'cinderbloom', null, { model: 'herb', size: 0.55, tint: '#ff6a2a', n: 6 }],
];
/** A monster whose hide is not its tier's plain one (skins.types[id].hide; js/rules/professions.js skinOf). */
export const SKIN_HIDE = { ashback_salamander: 'salamander_hide' };

/**
 * What a merchant pays for ONE raw piece, by tier 1-5 — the knob tools/sim-professions.mjs is tuned with (the rule: an
 * hour of gathering = 70-100% of an hour of questing at the level that tier is worked at; tests/P/economy.test.js).
 */
export const RAW_PRICE = { ore: [2, 6, 26, 38, 64], gem: [5, 14, 36, 70, 120], log: [2, 9, 30, 50, 80], herb: [2, 7, 32, 48, 78], mushroom: [2, 7, 32, 48, 78], fibre: [2, 7, 32, 48, 78],
  hide: [1, 4, 8, 14, 24], resin: [3], meat: [1], fang: [1] };
const REFINE_MARKUP = 1.15;      // a refined good sells for its inputs x this (the mini-game's labour)

/**
 * SKINNING (wrap-up 2026-10-13, report #26 "why can't I skin barrow hounds"): what decides it is the BODY, not the
 * family. A monster drawn as an animal (a four-legged, many-legged, winged or crawling creature body) has a hide,
 * whatever family the bestiary files it under — a Barrow Hound is `family: undead` and is still a dog. The ones with no
 * hide get a plain sentence saying why (`skins.none`), which the server answers with when a skinner tries.
 *   worn   the long dead: the hide comes off one grade lower than the monster's level would give, and no meat
 *   noMeat dragonkin and anything unnatural: nobody eats that
 */
const HIDE_PLANS = new Set(['quad', 'spider', 'bat', 'snake', 'fowl']);
const NO_HIDE_FAMILY = { construct: 'Stone and metal all the way through. There is no hide on it.', elemental: 'Nothing is left of it to skin.', fiend: 'It burns away to ash before a knife can touch it.' };
const NO_HIDE_TYPE = { slime: 'A slime has no hide to take.', mushroom: 'It is fungus, not flesh. There is no hide on it.', wraith: 'A spirit leaves no body to skin.', horror: 'Whatever that was, it has no hide a knife can lift.', mimic: 'Wood, brass and teeth. There is no hide on it.' };
const NO_HIDE_ID = { ossuary_crawler: 'It is bone all the way through. There is no hide on it.' };
export function skinRule(d) {
  if (d.kind !== 'beast' || !d.look || !d.look.creature) return { ok: false, person: true, why: 'People are not skinned.' };
  const type = d.look.creature.type, plan = (CREATURE_TYPES[type] || {}).plan;
  if (NO_HIDE_ID[d.id]) return { ok: false, why: NO_HIDE_ID[d.id] };
  if (NO_HIDE_FAMILY[d.family]) return { ok: false, why: NO_HIDE_FAMILY[d.family] };
  if (NO_HIDE_TYPE[type]) return { ok: false, why: NO_HIDE_TYPE[type] };
  if (!HIDE_PLANS.has(plan)) return { ok: false, why: 'There is no hide on it.' };
  return { ok: true, worn: d.family === 'undead', noMeat: d.family === 'undead' || d.family === 'dragonkin' || (d.family === 'aberration' && d.id !== 'dread_stag') };
}

function buildContent(numbers, engine, shops) {
  const materials = {}, nodeKinds = {}, recipes = [], goods = {};
  const mat = (id, name, tier, prof, icon, tint, cls, desc) => { materials[id] = { id, name, desc, tier, prof, icon, tint, price: RAW_PRICE[cls][tier - 1] ?? RAW_PRICE[cls][0] }; };
  const priceOf = needs => needs.reduce((a, nd) => a + materials[nd.id].price * nd.n, 0);
  const skillAt = (tier, add = 0) => Math.min(100, numbers.tiers[tier - 1].minSkill + add);

  // ---- raw materials + the nodes that give them ----
  for (let t = 1; t <= 5; t++) {
    const i = t - 1;
    mat(ORE[i][0], ORE[i][1], t, 'mining', 'ore', ORE[i][2], 'ore', `Broken out of a boulder. A smith smelts it into ${t === 1 ? 'bronze, with tin' : BAR[i][1].toLowerCase() + 's'}.`);
    mat(GEM[i][0], GEM[i][1], t, 'mining', 'gem', GEM[i][2], 'gem', 'A stone that sometimes comes out with the ore on a clean strike. Jewellery, casters\' tools and tempering use it.');
    mat(LOG[i][0], LOG[i][1], t, 'logging', 'log', LOG[i][2], 'log', 'Timber from a marked tree: hafts, bows, staves and shields.');
    mat(HERB[i][0], HERB[i][1], t, 'foraging', 'herb', HERB[i][2], 'herb', 'A herb for the still: potions and tonics.');
    mat(SHROOM[i][0], SHROOM[i][1], t, 'foraging', 'mushroom', SHROOM[i][2], 'mushroom', 'Grows under trees. Good in a pot, better in a potion.');
    mat(FIBRE[i][0], FIBRE[i][1], t, 'foraging', 'fibre', FIBRE[i][2], 'fibre', 'Plant fibre. An outfitter weaves it into cloth.');
    mat(HIDE[i][0], HIDE[i][1], t, 'skinning', 'hide', HIDE[i][2], 'hide', 'Skinned from a beast. An outfitter cures it into leather.');
    nodeKinds[ORE[i][0].replace('_ore', '')] = { id: ORE[i][0].replace('_ore', ''), prof: 'mining', tier: t, name: ORE[i][1].replace(' Ore', '') + ' Boulder', gives: ORE[i][0], bonus: GEM[i][0],
      look: { model: 'boulder', size: 1.6 + 0.1 * t, tint: ORE[i][2], n: 4 + t } };
    nodeKinds[LOG[i][0].replace('_log', '')] = { id: LOG[i][0].replace('_log', ''), prof: 'logging', tier: t, name: 'Marked ' + TREE[i], gives: LOG[i][0], bonus: 'pine_resin',
      look: { model: 'tree', size: 6 + t, tint: ['#d04a3a', '#e0a020', '#3a7ad0', '#8a3ad0', '#e8e8e8'][i], n: 1 } };
    nodeKinds[HERB[i][0]] = { id: HERB[i][0], prof: 'foraging', tier: t, name: HERB[i][1] + ' Patch', gives: HERB[i][0], bonus: null, look: { model: 'herb', size: 0.5, tint: HERB[i][2], n: 6 } };
    nodeKinds[SHROOM[i][0]] = { id: SHROOM[i][0], prof: 'foraging', tier: t, name: SHROOM[i][1] + ' Ring', gives: SHROOM[i][0], bonus: null, look: { model: 'mushroom', size: 0.35, tint: SHROOM[i][2], n: 6 } };
    nodeKinds[FIBRE[i][0]] = { id: FIBRE[i][0], prof: 'foraging', tier: t, name: FIBRE[i][1] + ' Stand', gives: FIBRE[i][0], bonus: null, look: { model: 'fibre', size: 1.1, tint: FIBRE[i][2], n: 6 } };
  }
  mat('tin_ore', 'Tin Ore', 1, 'mining', 'ore', '#c9ccd2', 'ore', 'Soft grey ore. Smelted with copper it makes bronze.');
  nodeKinds.tin = { id: 'tin', prof: 'mining', tier: 1, name: 'Tin Boulder', gives: 'tin_ore', bonus: GEM[0][0], look: { model: 'boulder', size: 1.6, tint: '#c9ccd2', n: 5 } };
  mat('pine_resin', 'Pine Resin', 1, 'logging', 'resin', '#d9a441', 'resin', 'Sticky sap from a clean cut. Tempering and a few brews need it.');
  mat('game_meat', 'Game Meat', 1, 'skinning', 'meat', '#b8504a', 'meat', 'Fresh meat from a beast. Cook it at any fire.');
  materials.sovereign_core = { id: 'sovereign_core', name: 'Sovereign Core', desc: 'The hot heart of something that should not have been killed. Only world bosses and the hardest events leave one. A master temperer can promote a rare item to legendary with it.', tier: 5, prof: 'tempering', icon: 'core', tint: '#ffd24a', rarity: 'legendary', price: 1 };      // X5 (round 9)
  mat('beast_fang', 'Beast Fang', 1, 'skinning', 'trophy', '#efe6d2', 'fang', 'A good fang, taken with a careful cut. It sells.');
  // Vharlen (Expansion 1 §4.5): the island's own materials and the nodes that give them
  for (const [id, name, tier, prof, icon, tint, , price, desc] of VHARL_MATERIALS) materials[id] = { id, name, desc, tier, prof, icon, tint, price, island: 'vharlen' };
  for (const [id, prof, tier, name, gives, bonus, look] of VHARL_NODES) nodeKinds[id] = { id, prof, tier, name, gives, bonus, look: { ...look } };

  const classes = { ore: ORE.map(x => x[0]), metal: BAR.map(x => x[0]), gem: GEM.map(x => x[0]), wood: LOG.map(x => x[0]), herb: HERB.map(x => x[0]), mushroom: SHROOM.map(x => x[0]),
    fibre: FIBRE.map(x => x[0]), cloth: CLOTH.map(x => x[0]), hide: HIDE.map(x => x[0]), leather: LEATHER.map(x => x[0]), resin: Array(5).fill('pine_resin') };

  // ---- refining (smithing: bars; outfitting: leather, cloth) ----
  const refine = (prof, t, out, needs, verb, icon, cls) => {
    const [id, name, tint] = out;
    materials[id] = { id, name, desc: verb, tier: t, prof, icon, tint, price: Math.max(priceOf(needs) + 1, Math.round(priceOf(needs) * REFINE_MARKUP)), made: true };
    recipes.push({ id: `${prof === 'smithing' ? 'smelt' : cls}_${id}`, prof, tier: t, skill: skillAt(t), name, desc: verb, kind: 'material', refine: true, needs, makes: { id, n: 1 } });
  };
  for (let t = 1; t <= 5; t++) {
    const i = t - 1;
    refine('smithing', t, BAR[i], t === 1 ? [{ id: 'copper_ore', n: 1 }, { id: 'tin_ore', n: 1 }] : t === 3 ? [{ id: 'silver_ore', n: 2 }, { id: 'iron_ore', n: 1 }] : [{ id: ORE[i][0], n: 2 }],
      t === 1 ? 'Copper and tin, smelted together. The metal of a first sword.' : `Smelted ${ORE[i][1].toLowerCase()}, ready for the anvil.`, 'bar', 'smelt');
    refine('outfitting', t, LEATHER[i], [{ id: HIDE[i][0], n: 2 }], 'Hide, scraped, cured and oiled.', 'leather', 'cure');
    refine('outfitting', t, CLOTH[i], [{ id: FIBRE[i][0], n: 2 }], 'Fibre, spun and woven on the bench.', 'cloth', 'weave');
  }

  // ---- tools ----
  const tools = [];
  const TOOL = { mining: ['pick', 'Pick'], logging: ['hatchet', 'Hatchet'], skinning: ['knife', 'Skinning Knife'], foraging: ['sickle', 'Sickle'] };
  const starterTools = {};
  for (const [prof, [kind, word]] of Object.entries(TOOL)) {
    const first = { mining: 'Prospector\'s Pick', logging: 'Woodsman\'s Hatchet', skinning: 'Plain Skinning Knife', foraging: 'Forager\'s Sickle' }[prof];
    tools.push({ id: `plain_${kind}`, name: first, prof, kind, tier: 1, ease: 0, extra: 0, price: numbers.toolPrice,
      desc: `A tool, not a weapon: it takes no slot. With it in your bag you can ${{ mining: 'mine ore boulders', logging: 'fell marked trees', skinning: 'skin beasts you killed', foraging: 'gather herbs, mushrooms and fibre' }[prof]}.` });
    starterTools[prof] = `plain_${kind}`;
    for (const t of [2, 3]) {
      const id = `${BAR[t - 1][0].replace('_bar', '')}_${kind}`, ease = t === 2 ? 0.2 : 0.4, extra = t === 2 ? 0.1 : 0.2;
      tools.push({ id, name: `${TIER_WORD[t]} ${word}`, prof, kind, tier: t, ease, extra, price: Math.round((materials[BAR[t - 1][0]].price * 3 + materials[LOG[t - 1][0]].price) * 1.2),
        desc: `A better ${word.toLowerCase()}: the timing windows are ${Math.round(ease * 50)}% wider and one node in ${Math.round(1 / extra)} gives an extra piece. Takes no slot; the best one in your bag is used.` });
      recipes.push({ id: `tool_${id}`, prof: 'smithing', tier: t, skill: skillAt(t, 5), name: `${TIER_WORD[t]} ${word}`, desc: 'A gathering tool.', kind: 'tool', needs: [{ id: BAR[t - 1][0], n: 3 }, { id: LOG[t - 1][0], n: 1 }], makes: { id, n: 1 } });
    }
  }

  // ---- gear patterns: loot families of C's catalog, by what they are made of ----
  const fam = engine.lootPool.families, items = engine.items;
  const baseRow = (key, from) => { const b = items.weaponBases[key] || items.armorBases[key]; return b ? { key, name: b.name, slot: b.slot || (items.weaponBases[key] ? 'weapon' : null), from } : null; };
  const bases = (ids, keep = null) => ids.flatMap(f => ((fam[f] || {}).bases || []).filter(b => !keep || keep(items.armorBases[b.key] || items.weaponBases[b.key] || {}, b.key)).map(b => baseRow(b.key, b.from))).filter(Boolean).sort((a, b) => a.from - b.from || a.name.localeCompare(b.name));
  const ARMOUR = ['head', 'chest', 'legs', 'hands', 'feet'];
  const weight = (...w) => b => w.includes(b.tier);
  // [id, prof, name word, skill add, families, filter, needs by class]
  const PATTERNS = [
    ['blades', 'smithing', 'Blades', 0, ['sword', 'dagger'], null, { metal: 3 }, 'Swords and daggers.'],
    ['axes', 'smithing', 'Axes', 3, ['axe'], null, { metal: 4, wood: 2 }, 'Axes, one-handed and great.'],
    ['maces', 'smithing', 'Maces and Hammers', 3, ['mace'], null, { metal: 4, wood: 1 }, 'Maces, hammers and mauls.'],
    ['greatblades', 'smithing', 'Greatswords', 6, ['greatsword'], null, { metal: 5, wood: 1 }, 'Two-handed swords.'],
    ['polearms', 'smithing', 'Spears and Polearms', 6, ['spear', 'polearm', 'javelin'], null, { metal: 2, wood: 3 }, 'Spears, javelins and halberds.'],
    ['shields', 'smithing', 'Shields', 5, ['shield'], null, { metal: 3, wood: 2 }, 'Bucklers to tower shields.'],
    ['mail', 'smithing', 'Mail', 8, ARMOUR, weight('medium'), { metal: 4, leather: 1 }, 'Medium armour: mail and scale.'],
    ['plate', 'smithing', 'Plate', 14, ARMOUR, weight('heavy'), { metal: 6, leather: 1 }, 'Heavy armour.'],
    ['jewellery', 'smithing', 'Rings and Amulets', 10, ['ring', 'neck'], null, { metal: 1, gem: 1 }, 'A ring or an amulet, set with a stone.'],
    ['clothwork', 'outfitting', 'Cloth Armour', 0, ARMOUR, weight('cloth'), { cloth: 4 }, 'Robes, hoods, wraps and shoes.'],
    ['leatherwork', 'outfitting', 'Leather Armour', 3, ARMOUR, weight('light'), { leather: 4 }, 'Light armour.'],
    ['belts', 'outfitting', 'Belts', 4, ['belt'], null, { leather: 2, metal: 1 }, 'A belt with a proper buckle.'],
    ['cloaks', 'outfitting', 'Cloaks', 6, ['cloak'], null, { cloth: 3, leather: 1 }, 'A cloak for the back slot.'],
    ['packs', 'outfitting', 'Backpacks', 8, ['pack'], null, { leather: 3, cloth: 2 }, 'A backpack for the back slot: fewer properties than a cloak, more room in your bag.'],
    ['bows', 'outfitting', 'Bows and Quivers', 6, ['bow', 'crossbow', 'quiver'], null, { wood: 3, leather: 1 }, 'Bows, crossbows and quivers.'],
    ['staves', 'alchemy', 'Staves', 6, ['staff'], null, { wood: 3, herb: 2 }, 'A staff, steeped until it holds a charge.'],
    ['wands', 'alchemy', 'Wands and Sceptres', 8, ['wand', 'scepter'], null, { wood: 1, gem: 1, herb: 1 }, 'A wand or a sceptre with a stone at its heart.'],
    ['foci', 'alchemy', 'Orbs, Tomes and Charms', 10, ['orb', 'tome', 'focus'], null, { cloth: 1, gem: 1, mushroom: 2 }, 'A caster\'s off-hand or orb.'],
  ];
  for (const [pid, prof, word, add, fams, keep, need, desc] of PATTERNS) {
    const all = bases(fams, keep);
    for (let t = 1; t <= 5; t++) {
      const tr = numbers.tiers[t - 1];
      const bs = all.filter(b => b.from <= tr.levels[1]);
      if (!bs.length) continue;
      recipes.push({ id: `${pid}_${t}`, prof, tier: t, skill: skillAt(t, add), name: `${TIER_WORD[t]}-grade ${word}`, pattern: pid,
        desc: `${desc} You choose the pattern; the item comes out at up to level ${tr.levels[1]}, and how well you work decides how good.`, kind: 'gear',
        needs: Object.entries(need).map(([c, n]) => ({ id: classes[c][t - 1], n })), bases: bs });
    }
  }

  // ---- alchemy + cooking: the consumables the game already drinks and eats ----
  const pot = id => { const p = (items.potions || {})[id]; if (!p) return null; goods[id] = { kind: 'potion', id, name: p.name || id, desc: p.desc || p.description || '', rarity: 'normal', ...(p.effect ? { effect: p.effect } : {}) }; return id; };
  const cat = id => { const c = ((shops || {}).goodsCatalog || {})[id]; if (!c) return null; goods[id] = { kind: 'good', id, name: c.name, desc: c.desc || '', rarity: 'normal', ...(c.use ? { use: c.use } : {}) }; return id; };
  const meal = (id, name, desc, use) => { goods[id] = { kind: 'good', id, name, desc, rarity: 'normal', cooked: true, value: 3, use }; return id; };
  const brew = (id, t, add, name, needs, makes, n = 1) => { if (makes) recipes.push({ id, prof: 'alchemy', tier: t, skill: skillAt(t, add), name, desc: (goods[makes] || {}).desc || '', kind: goods[makes].kind, needs, makes: { id: makes, n } }); };
  brew('brew_healing', 1, 0, 'Healing Potion', [{ id: 'meadowmint', n: 2 }, { id: 'field_mushroom', n: 1 }], pot('healing_potion'));
  brew('brew_mana', 1, 6, 'Mana Potion', [{ id: 'meadowmint', n: 1 }, { id: 'field_mushroom', n: 2 }], pot('mana_potion'));
  brew('brew_antidote', 1, 12, 'Antidote', [{ id: 'field_mushroom', n: 1 }, { id: 'pine_resin', n: 1 }], pot('antidote'));
  brew('brew_armour_oil', 1, 16, 'Armour Oil', [{ id: 'pine_resin', n: 2 }, { id: 'flax', n: 1 }], cat('armour_oil'));
  brew('brew_greater_healing', 2, 0, 'Greater Healing Potion', [{ id: 'feverleaf', n: 2 }, { id: 'amber_cap', n: 1 }], pot('greater_healing'));
  brew('brew_group_tonic', 2, 10, 'Group Tonic', [{ id: 'feverleaf', n: 2 }, { id: 'amber_cap', n: 2 }], pot('group_tonic'));
  brew('brew_revival', 3, 0, 'Revival Flask', [{ id: 'moonpetal', n: 3 }, { id: 'ghost_morel', n: 2 }, { id: 'amethyst', n: 1 }], pot('revival_flask'));
  const cook = (id, add, name, needs, makes, t = 1) => recipes.push({ id, prof: 'cooking', tier: t, skill: skillAt(t, add), name, desc: goods[makes].desc, kind: 'good', steps: 1, needs, makes: { id: makes, n: 1 } });
  cook('cook_roast', 0, 'Roast Game', [{ id: 'game_meat', n: 1 }], meal('roast_game', 'Roast Game', 'Meat off the spit. Eat out of combat to recover health over 20 seconds.', { type: 'food', regen: 0.045, seconds: 20 }));
  cook('cook_mint_tea', 4, 'Mint Tea', [{ id: 'meadowmint', n: 2 }], meal('mint_tea', 'Mint Tea', 'Hot and sharp. Drink out of combat to recover mana over 20 seconds.', { type: 'drink', regen: 0.045, seconds: 20 }));
  cook('cook_mushroom_skewer', 8, 'Mushroom Skewers', [{ id: 'field_mushroom', n: 2 }, { id: 'game_meat', n: 1 }], meal('mushroom_skewers', 'Mushroom Skewers', 'Eat out of combat to recover health over 20 seconds.', { type: 'food', regen: 0.05, seconds: 20 }));
  cook('cook_foragers_stew', 15, 'Forager\'s Stew', [{ id: 'game_meat', n: 2 }, { id: 'field_mushroom', n: 1 }, { id: 'meadowmint', n: 1 }], meal('foragers_stew', 'Forager\'s Stew', 'Eat out of combat: recover health and mana over 20 seconds, then +5% health for 30 minutes.', { type: 'food', regen: 0.05, seconds: 20, buff: { stat: 'hpPct', amount: 0.05, minutes: 30 } }));
  cook('cook_amber_broth', 0, 'Amber Broth', [{ id: 'amber_cap', n: 2 }, { id: 'feverleaf', n: 1 }, { id: 'game_meat', n: 1 }], meal('amber_broth', 'Amber Broth', 'Eat out of combat: recover health and mana over 20 seconds, then +8% health for 30 minutes.', { type: 'food', regen: 0.06, seconds: 20, buff: { stat: 'hpPct', amount: 0.08, minutes: 30 } }), 2);

  // ---- Vharlen (Expansion 1 §4.5): each island material as an ALTERNATE in the existing tier-4/5 recipes, and a new line ----
  const vh = (r, alt = null) => recipes.push({ ...r, ...(alt ? { alt } : {}), island: 'vharlen' });
  vh({ id: 'smelt_blackiron_bar_obsidian', prof: 'smithing', tier: 4, skill: skillAt(4, 2), name: 'Blackiron Bar (from obsidian)', desc: 'Obsidian melted down in a hot fire comes out as blackiron. Two lumps of the glass for one bar.', kind: 'material', refine: true, needs: [{ id: 'obsidian_ore', n: 2 }], makes: { id: 'blackiron_bar', n: 1 } }, 'smelt_blackiron_bar');
  vh({ id: 'smelt_sunsteel_bar_sulphur', prof: 'smithing', tier: 5, skill: skillAt(5, 2), name: 'Sunsteel Bar (sulphur fire)', desc: 'A sulphur fire burns hot enough to smelt sunsteel from half the ore.', kind: 'material', refine: true, needs: [{ id: 'sunsteel_ore', n: 1 }, { id: 'sulphur', n: 1 }], makes: { id: 'sunsteel_bar', n: 1 } }, 'smelt_sunsteel_bar');
  vh({ id: 'cure_drake_leather_salamander', prof: 'outfitting', tier: 5, skill: skillAt(5, 2), name: 'Drake Leather (from salamander hide)', desc: 'Three salamander hides, cured slow, make a leather as tough as a drake\'s.', kind: 'material', refine: true, needs: [{ id: 'salamander_hide', n: 3 }], makes: { id: 'drake_leather', n: 1 } }, 'cure_drake_leather');
  // the gear patterns that use the island's wood (tier 4, ironpalm for ironbark), mushroom (tier 4, steamcap for king bolete) and herb (tier 5, cinderbloom for sunroot)
  const SWAP = [[4, 'ironbark_log', 'ironpalm_log', 'ironpalm'], [4, 'king_bolete', 'steamcap', 'steamcap'], [5, 'sunroot', 'cinderbloom', 'cinderbloom']];
  for (const [t, from, to, word] of SWAP) for (const r of recipes.filter(x => x.kind === 'gear' && x.tier === t && !x.island && x.needs.some(n => n.id === from)))
    vh({ ...r, id: `${r.id}_${word}`, name: `${r.name} (${materials[to].name})`, needs: r.needs.map(n => (n.id === from ? { id: to, n: n.n } : n)) }, r.id);
  // new lines: a good made from each where one fits
  const vgood = (id, name, desc, use) => { goods[id] = { kind: 'good', id, name, desc, rarity: 'normal', use }; return id; };
  vh({ id: 'knap_obsidian_edge', prof: 'smithing', tier: 4, skill: skillAt(4, 6), name: 'Obsidian Edge', desc: 'Knap a sliver of obsidian along your weapon\'s edge: +6% weapon damage for 15 minutes.', kind: 'good', needs: [{ id: 'obsidian_ore', n: 1 }, { id: 'blackiron_bar', n: 1 }],
    makes: { id: vgood('obsidian_edge', 'Obsidian edge', 'Knap a sliver of obsidian along your weapon\'s edge: +6% weapon damage for 15 minutes.', { type: 'buff', buff: { stat: 'dmgPct', amount: 0.06, minutes: 15 } }), n: 2 } });
  vh({ id: 'brew_brimstone_oil', prof: 'alchemy', tier: 4, skill: skillAt(4, 4), name: 'Brimstone Oil', desc: 'Sulphur boiled into an oil that hardens on leather and mail: +8% armour for 15 minutes.', kind: 'good', needs: [{ id: 'sulphur', n: 2 }, { id: 'moonflax', n: 1 }],
    makes: { id: vgood('brimstone_oil', 'Brimstone oil', 'Sulphur boiled into an oil that hardens on leather and mail: +8% armour for 15 minutes.', { type: 'buff', buff: { stat: 'armorPct', amount: 0.08, minutes: 15 } }), n: 2 } });
  vh({ id: 'brew_cinderbloom_draught', prof: 'alchemy', tier: 5, skill: skillAt(5, 4), name: 'Cinderbloom Draught', desc: 'It burns going down and keeps burning: +8% weapon damage for 20 minutes.', kind: 'good', needs: [{ id: 'cinderbloom', n: 2 }, { id: 'starcap', n: 1 }],
    makes: { id: vgood('cinderbloom_draught', 'Cinderbloom draught', 'It burns going down and keeps burning: +8% weapon damage for 20 minutes.', { type: 'buff', buff: { stat: 'dmgPct', amount: 0.08, minutes: 20 } }), n: 1 } });
  recipes.push({ id: 'cook_steamcap_broth', prof: 'cooking', tier: 4, skill: skillAt(4, 0), name: 'Steamcap Broth', desc: 'Eat out of combat: recover health and mana over 20 seconds, then +10% health for 30 minutes.', kind: 'good', steps: 1, island: 'vharlen',
    needs: [{ id: 'steamcap', n: 2 }, { id: 'game_meat', n: 1 }], makes: { id: meal('steamcap_broth', 'Steamcap Broth', 'Eat out of combat: recover health and mana over 20 seconds, then +10% health for 30 minutes.', { type: 'food', regen: 0.06, seconds: 20, buff: { stat: 'hpPct', amount: 0.1, minutes: 30 } }), n: 1 } });

  // ---- skinning: which monsters have a hide ----
  const en = Array.isArray(engine.bestiary.enemies) ? engine.bestiary.enemies : Object.values(engine.bestiary.enemies || {});
  const skins = { meat: 'game_meat', bonus: 'beast_fang', types: {}, none: {} };
  const bosses = Array.isArray(engine.bestiary.bosses) ? engine.bestiary.bosses : [];
  for (const d of [...en, ...bosses]) {
    const s = skinRule(d);
    if (s.ok) skins.types[d.id] = { name: d.name, ...(s.noMeat ? { noMeat: true } : {}), ...(s.worn ? { worn: 1 } : {}), ...(SKIN_HIDE[d.id] ? { hide: SKIN_HIDE[d.id] } : {}) };
    else skins.none[d.id] = { name: d.name, why: s.why, ...(s.person ? { person: 1 } : {}) };
  }

  // ---- job frames (giverRole: only that kind of NPC offers it) ----
  const job = (id, role, goal, title, text, gold = 4) => ({ id: 'prof_' + id, scope: 'zone', weight: 4, giverRole: role, needs: [], title, text, goal, reward: { xp: 0.2, gold }, where: 'anywhere in {zone.name}' });
  const jobs = [
    job('copper_for_the_forge', 'smith', { kind: 'gather', mat: 'copper_ore', count: 6 }, 'Mine 6 Copper Ore', 'The forge eats copper faster than I can swing. Six lumps of ore, any boulder with green in it.'),
    job('tin_too', 'smith', { kind: 'gather', mat: 'tin_ore', count: 4 }, 'Mine 4 Tin Ore', 'Copper without tin is a doorstop. Four of tin, the grey boulders.'),
    job('bars_on_the_rack', 'smith', { kind: 'craft', recipe: 'smelt_bronze_bar', count: 3 }, 'Smelt 3 Bronze Bars', 'Use my fire. Three bronze bars on the rack and I will pay you for the sweat.', 5),
    job('prospectors_round', 'prospector', { kind: 'gather', prof: 'mining', count: 8 }, 'Mine 8 pieces of ore', 'Walk the road, hit what glints. Eight pieces of any ore and you have earned your supper.'),
    job('timber_for_staves', 'bowyer', { kind: 'gather', prof: 'logging', count: 6 }, 'Fell 6 logs', 'I mark the trees, you fell them. Six logs, from the trees with the painted band.'),
    job('hides_for_the_bench', 'tailor', { kind: 'gather', prof: 'skinning', count: 4 }, 'Skin 4 hides', 'Four hides, off anything with fur. Keep the knife moving and do not hack.'),
    job('herbs_for_the_still', 'apothecary', { kind: 'gather', mat: 'meadowmint', count: 6 }, 'Gather 6 Meadowmint', 'Meadowmint, six sprigs. The blue-green patches in open grass. Not the nettles. Never the nettles.'),
    job('a_brew_for_the_shelf', 'apothecary', { kind: 'craft', recipe: 'brew_healing', count: 2 }, 'Brew 2 Healing Potions', 'My hands shake before noon. Brew two healing potions on my still and the shelf and I are both grateful.', 5),
  ];
  return { materials, classes, nodeKinds, tools, starterTools, recipes, goods, skins, jobs };
}

/** The first-meeting chain (data/quests/professions.json): made here so its map marks follow the bake. */
function buildQuests(trainer, smith) {
  const st = trainer.starters[0] || { x: trainer.x, z: trainer.z };
  const cx = trainer.starters.reduce((a, s) => a + s.x, 0) / (trainer.starters.length || 1) || st.x, cz = trainer.starters.reduce((a, s) => a + s.z, 0) / (trainer.starters.length || 1) || st.z;
  const field = { x: Math.round(cx), z: Math.round(cz), r: 70, name: 'the boulders outside the gate' };
  const forge = smith ? { x: smith.x, z: smith.z, r: 9, name: smith.name } : null;
  const me = { x: trainer.x, z: trainer.z, r: 5, name: trainer.name };
  return {
    _doc: 'Stream P-core (round 8, W9 Professions) — MADE by tools/content-professions.mjs (the marks follow the bake); edit the text in the tool. The first meeting: Bram Delver, a prospector just inside Torborhold\'s main gate, teaches Mining the moment you speak to him (and hands over a pick); his chain walks you to the copper, the smith\'s forge and the tempering gauge. Step kinds gather / craft / learn are js/sim/quests.js (W9).',
    zone: 'test', part: 'professions',
    npcs: { [trainer.id]: { name: trainer.name, role: trainer.role, at: trainer.town, greeting: trainer.greeting, placedBy: 'content-professions', titled: true } },
    quests: [
      { id: 'prof_three_good_swings', name: 'Three Good Swings', level: 1, giver: trainer.id,
        offer: 'New boots, clean hands. You want work that pays? That pick I just gave you is yours. Walk out of the gate and look for boulders with green lumps sticking out: copper. Three swings each. Hit when the marker crosses the bright spot, not before, not after.',
        steps: [
          { kind: 'gather', prof: 'mining', count: 3, text: 'Mine 3 pieces of ore', where: 'the ore boulders by the road just outside Torborhold\'s gate', at: field },
          { kind: 'talk', npc: trainer.id, text: 'Show Bram what you dug out', where: 'Bram Delver, just inside Torborhold\'s main gate', at: me },
        ],
        done: 'That is ore, that is. A clean strike sometimes shakes a stone loose too: sell those dear. The boulders fill again for you in a few minutes, and nobody else can empty yours.',
        reward: { xp: 0.4, gold: 8, crates: [{ slot: 'weapon', min: 'uncommon' }] },
        rewardText: 'The Prospector\'s Pick is yours to keep, with a crate from the last fellow who never came back for it.', next: 'prof_bronze_not_copper' },
      { id: 'prof_bronze_not_copper', name: 'Bronze, Not Copper', level: 1, giver: trainer.id, requires: ['prof_three_good_swings'],
        offer: 'Copper alone bends like a spoon. Smelt it with tin and you have bronze. The grey boulders are tin. Take three of each to Garrow at the smithy, ask him to teach you Smithing, and use his fire: three bars, then hammer yourself a blade. Strike while the bar glows in the band. Too cold? Back in the fire.',
        steps: [
          { kind: 'learn', prof: 'smithing', text: 'Ask the smith to teach you Smithing', where: 'the smithy in Torborhold', ...(forge ? { at: forge } : {}) },
          { kind: 'craft', recipe: 'smelt_bronze_bar', count: 3, text: 'Smelt 3 Bronze Bars at the forge (1 Copper Ore + 1 Tin Ore each)', where: 'the smithy in Torborhold', ...(forge ? { at: forge } : {}) },
          { kind: 'craft', recipe: 'blades', count: 1, text: 'Forge a bronze blade (3 Bronze Bars)', where: 'the smithy in Torborhold', ...(forge ? { at: forge } : {}) },
          { kind: 'talk', npc: trainer.id, text: 'Show Bram your blade', where: 'Bram Delver, just inside Torborhold\'s main gate', at: me },
        ],
        done: 'You made that? With those hands? Well. It will not win prizes, but it is yours, and the next one will be better: the steadier your hammer, the better the blade comes out.',
        reward: { xp: 0.5, gold: 14, crates: [{ slot: 'armor', min: 'uncommon' }] }, rewardText: 'Coin for the ore you burned, a crate of armour, and Bram\'s grudging respect.', next: 'prof_an_edge_on_it' },
      { id: 'prof_an_edge_on_it', name: 'An Edge on It', level: 2, giver: trainer.id, requires: ['prof_bronze_not_copper'],
        offer: 'One more trick. A smith can TEMPER a thing you already own: better quality, a new property, never a ruined blade. Ask Garrow to teach you Tempering, put your new blade in your bag, and stop the gauge inside the band. It costs two bars and a little coin. Miss, and you lose the bars. Never the blade.',
        steps: [
          { kind: 'learn', prof: 'tempering', text: 'Ask the smith to teach you Tempering', where: 'the smithy in Torborhold', ...(forge ? { at: forge } : {}) },
          { kind: 'craft', prof: 'tempering', count: 1, text: 'Temper any weapon or armour piece from your bag', where: 'the smithy in Torborhold', ...(forge ? { at: forge } : {}) },
          { kind: 'talk', npc: trainer.id, text: 'Tell Bram how it went', where: 'Bram Delver, just inside Torborhold\'s main gate', at: me },
        ],
        done: 'There. Now you know the whole road: dig it, smelt it, forge it, temper it. The tailor, the bowyer and the apothecary teach the other trades, and every one of them pays.',
        reward: { xp: 0.5, gold: 18, crates: [{ slot: 'weapon', min: 'uncommon' }] }, rewardText: 'A crate with a weapon in it, to practise your tempering on.' },
    ],
  };
}

// ------------------------------------------------------------------------------------------------ placement
export const PLACE = Object.freeze({ lattice: 8, edge: 48, perZone: { mining: 64, logging: 56, foraging: 66 }, gapSame: 60, gapAny: 16, road: [9, 400], starterR: 150, starterN: 5, keepOff: 6 });

function zoneFacts(wid) {
  const t = parseTerrain(readFileSync(P(`data/zones/${wid}/terrain.bin`)));
  const nav = parseNav(readFileSync(P(`data/zones/${wid}/nav.bin`)));
  const { size: S, step, bits } = nav;
  const idx = (x, z) => Math.min(S - 1, Math.max(0, Math.round(z / step))) * S + Math.min(S - 1, Math.max(0, Math.round(x / step)));
  const chamfer = bit => {
    const d = new Float32Array(S * S).fill(1e9);
    for (let k = 0; k < S * S; k++) if (bits[k] & bit) d[k] = 0;
    const A = step, D = step * Math.SQRT2;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const k = j * S + i; let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + A); if (j > 0) { v = Math.min(v, d[k - S] + A); if (i > 0) v = Math.min(v, d[k - S - 1] + D); if (i < S - 1) v = Math.min(v, d[k - S + 1] + D); } d[k] = v; }
    for (let j = S - 1; j >= 0; j--) for (let i = S - 1; i >= 0; i--) { const k = j * S + i; let v = d[k];
      if (i < S - 1) v = Math.min(v, d[k + 1] + A); if (j < S - 1) { v = Math.min(v, d[k + S] + A); if (i < S - 1) v = Math.min(v, d[k + S + 1] + D); if (i > 0) v = Math.min(v, d[k + S - 1] + D); } d[k] = v; }
    return d;
  };
  return { wid, t, S, step, bits, idx, dRoad: chamfer(NAV.ROAD), dSolid: chamfer(NAV.SOLID), dWater: chamfer(NAV.SHALLOW | NAV.DEEP), dSteep: chamfer(NAV.STEEP), dTown: chamfer(NAV.TOWN | NAV.BUILDING) };
}
const inPoly = (poly, x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
const segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1; const u = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l)); return Math.hypot(px - ax - u * dx, pz - az - u * dz); };
const lineDist = (pts, x, z) => { let d = 1e9; for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, segDist(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])); return d; };

/** Tier shares of a zone by the top of its level band. */
export const tierMix = hi => (hi <= 4 ? [0.92, 0.08, 0] : hi <= 5 ? [0.8, 0.2, 0] : hi <= 8 ? [0.45, 0.55, 0] : [0.15, 0.55, 0.3]);

/** A province sheet's own tier shares (`gathering.mix`: [band top, shares of tiers 1-5]) -> five shares, or null (the home rule). */
export const sheetMix = (gathering, hi) => { const rows = (gathering && gathering.mix) || []; const r = rows.find(x => hi <= x[0]) || rows[rows.length - 1]; return r ? r[1] : null; };

function placeZone(F, { eid, band, reach, baked, vig, content, gathering = null }) {
  const mix5 = sheetMix(gathering, band[1]);
  const mix = tierMix(band[1]);
  const fields = baked.filter(p => p.kind === 'field' && p.data && p.data.poly).map(p => p.data.poly);
  const discs = [...baked.filter(p => (p.kind === 'set_piece' || p.kind === 'set_building') && p.data && p.data.piece !== 'belt').map(p => ({ x: p.x, z: p.z, r: (p.data.r || Math.max(p.data.w || 8, p.data.d || 8) / 2) + PLACE.keepOff })),
    ...vig.filter(p => Number.isFinite(p.x) && Number.isFinite(p.z)).map(p => ({ x: p.x, z: p.z, r: (p.radius || (p.type === 'npc' ? 2 : 6)) + PLACE.keepOff }))];
  const mains = baked.filter(p => p.kind === 'town_wall' && p.data && p.data.gates).flatMap(p => p.data.gates.filter(g => g.main && g.main.pts).map(g => ({ pts: g.main.pts, w: g.main.width || 5 })));
  const ok = (x, z) => {
    const k = F.idx(x, z), b = F.bits[k];
    if (!reach[k] || !(b & NAV.WALK) || (b & (NAV.ROAD | NAV.TOWN | NAV.BUILDING | NAV.SHALLOW | NAV.DEEP | NAV.STEEP | NAV.SOLID))) return false;
    if (F.dTown[k] < 14 || F.dRoad[k] < PLACE.road[0] || F.dRoad[k] > PLACE.road[1]) return false;
    if (F.t.waterAt(x, z).depth > 0.05 || F.t.slopeAt(x, z) > 24) return false;
    for (const d of discs) if ((x - d.x) ** 2 + (z - d.z) ** 2 < d.r * d.r) return false;
    for (const poly of fields) if (inPoly(poly, x, z)) return false;
    for (const m of mains) if (lineDist(m.pts, x, z) < m.w / 2 + 4) return false;
    return true;
  };
  const cands = [];
  for (let z = PLACE.edge; z <= ZM - PLACE.edge; z += PLACE.lattice) for (let x = PLACE.edge; x <= ZM - PLACE.edge; x += PLACE.lattice) {
    if (!ok(x, z)) continue;
    const k = F.idx(x, z), j = h01(`${F.wid}:${x}:${z}`);
    const road = 1 / (1 + F.dRoad[k] / 50), slope = F.t.slopeAt(x, z);
    cands.push({ x, z, k, j, road, slope, dSolid: F.dSolid[k], dWater: F.dWater[k], dSteep: F.dSteep[k], dRoad: F.dRoad[k] });
  }
  const score = {
    mining: c => c.road * 1.2 + (c.slope >= 4 && c.slope <= 22 ? 0.5 : 0) + (c.dSteep < 16 ? 0.5 : 0) + c.j * 0.5,
    logging: c => (c.dSolid <= 6 ? 1 : c.dSolid <= 12 ? 0.4 : -2) + c.road * 0.7 + c.j * 0.5,
    herb: c => (c.dSolid > 10 ? 0.8 : 0) + (c.slope < 10 ? 0.3 : 0) + c.road * 0.6 + c.j * 0.6,
    mushroom: c => (c.dSolid <= 5 ? 1 : c.dSolid <= 10 ? 0.3 : -2) + c.road * 0.4 + c.j * 0.6,
    fibre: c => (c.dWater <= 14 ? 1.2 : c.dSolid > 12 ? 0.2 : -0.5) + c.road * 0.5 + c.j * 0.6,
  };
  const placed = [];
  const far = (c, prof) => placed.every(p => { const d = Math.hypot(p.x - c.x, p.z - c.z); return d >= PLACE.gapAny && (p.prof !== prof || d >= PLACE.gapSame); });
  // a group = one family of node (ore, timber, herb, mushroom, fibre). Its spots are taken best-first; then the group's
  // tiers are dealt out in the zone's exact shares, the better tiers to the spots further from a road.
  const take = (prof, sc, n, kindOf) => {
    const order = cands.map(c => ({ c, s: sc(c) })).filter(o => o.s > 0).sort((a, b) => b.s - a.s);
    const got = [];
    for (const { c } of order) { if (got.length >= n) break; if (!far(c, prof)) continue; const p = { x: c.x, z: c.z, prof, kind: null, dRoad: c.dRoad, j: c.j }; placed.push(p); got.push(p); }
    const ranked = got.slice().sort((a, b) => (a.j * 0.5 + Math.min(1, a.dRoad / 150) * 0.5) - (b.j * 0.5 + Math.min(1, b.dRoad / 150) * 0.5));
    if (mix5) {      // a province with its own `gathering` (Vharlen): five tiers, the best tiers to the spots furthest from a road
      const cuts = []; let acc = 0; for (let t = 5; t >= 1; t--) { acc += mix5[t - 1] || 0; cuts.push([t, Math.round(ranked.length * acc)]); }
      ranked.forEach((p, r) => { const from = ranked.length - r; const t = (cuts.find(([, n]) => from <= n) || [1])[0]; p.kind = kindOf(p, t); });
      return;
    }
    const n3 = Math.round(ranked.length * mix[2]), n2 = Math.round(ranked.length * mix[1]);
    ranked.forEach((p, r) => { const t = r >= ranked.length - n3 ? 3 : r >= ranked.length - n3 - n2 ? 2 : 1; p.kind = kindOf(p, t); });
  };
  const i = t => t - 1;
  // a province sheet's `gathering.kinds[family][tier]` replaces the home kind of that tier (several: picked by the spot's hash)
  const own = (fam, t, c, home) => { const l = gathering && gathering.kinds && gathering.kinds[fam] && gathering.kinds[fam][t]; return l && l.length ? l[Math.floor(h01(fam + c.x + ':' + c.z) * l.length)] : home; };
  take('mining', score.mining, PLACE.perZone.mining, (c, t) => own('mining', t, c, t === 1 ? (h01('tin' + c.x + ':' + c.z) < 0.42 ? 'tin' : 'copper') : ORE[i(t)][0].replace('_ore', '')));
  take('logging', score.logging, PLACE.perZone.logging, (c, t) => own('logging', t, c, LOG[i(t)][0].replace('_log', '')));
  const third = Math.round(PLACE.perZone.foraging / 3);
  take('foraging', score.herb, third, (c, t) => own('herb', t, c, HERB[i(t)][0]));
  take('foraging', score.mushroom, third, (c, t) => own('mushroom', t, c, SHROOM[i(t)][0]));
  take('foraging', score.fibre, third, (c, t) => own('fibre', t, c, FIBRE[i(t)][0]));
  return { placed, cands, ok };
}

export function buildAll(prov = PROV) {
  const home = prov === HOME_PROVINCE;
  const numbers = readJ('data/rules/professions.json');
  const sheet = readJ(`data/provinces/${prov}.json`);
  const map = readJ('data/world/province-map.json').provinces[prov].map;
  const problems = [];
  return import('../js/rules/index.js').then(R => {
    const content = buildContent(numbers, R.rulesEngine(), provinceDataSync(readJ, prov, 'shops'));
    // reach: on foot from the province hub over every zone stitched together
    const navs = Object.fromEntries(Object.entries(map).map(([eid, wid]) => [eid, parseNav(readFileSync(P(`data/zones/${wid}/nav.bin`)))]));
    const se = sheet.grid.start, hubTown = readJ(`data/vignettes/placements/${map[se]}.json`).settlements.find(s => s.name === sheet.zones[se].town);
    const PC = provinceComponents(Object.keys(map).map(eid => ({ eid, gx: sheet.zones[eid].grid[0], gy: sheet.zones[eid].grid[1], nav: navs[eid] })), { gx: sheet.zones[se].grid[0], gy: sheet.zones[se].grid[1], x: hubTown.x, z: hubTown.z });
    const reachOf = eid => { const S = navs[eid].size, r = new Uint8Array(S * S), [gx, gy] = sheet.zones[eid].grid;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) if (PC.label[(gy * PC.n + j) * PC.W + gx * PC.n + i] === PC.main) r[j * S + i] = 1; return r; };
    const zones = {}, meta = {}, trainers = [];
    for (const [eid, wid] of Object.entries(map)) {
      const zs = sheet.zones[eid];
      const [, zx, zy] = /^z(\d+)_(\d+)$/.exec(wid).map(Number), ox = zx * ZM, oz = zy * ZM;
      const F = zoneFacts(wid), reach = reachOf(eid);
      const baked = readJ(`data/zones/${wid}/placements.json`).placements || [];
      const vig = [`${wid}.json`, `${wid}.quest.json`, `${wid}.hunt.json`].flatMap(f => ((opt(`data/vignettes/placements/${f}`) || {}).placements || [])).filter(p => !p.trainer);      // (not the trainers this tool itself places)
      const Z = placeZone(F, { eid, band: zs.band, reach, baked, vig, content, gathering: sheet.gathering || null });
      // Torborhold: copper (and a tin) within sight of the gate road, and the prospector just inside the gate
      if (eid === se && home) {      // (the home province's start town only: a later province's newcomers already know the trade)
        const wall = baked.find(p => p.kind === 'town_wall' && p.data && String(p.data.name).toLowerCase() === String(zs.town).toLowerCase());
        const gate = wall && (wall.data.gates.find(g => g.main && g.road && /spur/.test(g.road)) || wall.data.gates.find(g => g.main && g.road) || wall.data.gates[0]);
        if (!gate) problems.push(`${eid}: no gate found for ${zs.town}`);
        else {
          const out = gate.out || [Math.cos(gate.yaw || 0), Math.sin(gate.yaw || 0)];
          // starter boulders: candidates 25-150 m outside the gate, 9-40 m off a road, nearest the gate road first
          const st = Z.cands.filter(c => { const d = Math.hypot(c.x - gate.x, c.z - gate.z); return d >= 25 && d <= PLACE.starterR && c.dRoad <= 40 && ((c.x - gate.x) * out[0] + (c.z - gate.z) * out[1]) > 10; })
            .sort((a, b) => (a.dRoad + Math.hypot(a.x - gate.x, a.z - gate.z) * 0.2) - (b.dRoad + Math.hypot(b.x - gate.x, b.z - gate.z) * 0.2));
          const starters = [];
          for (const c of st) { if (starters.length >= PLACE.starterN) break; if (starters.every(p => Math.hypot(p.x - c.x, p.z - c.z) >= 18)) starters.push({ x: c.x, z: c.z, prof: 'mining', kind: starters.length === 2 || starters.length === 4 ? 'tin' : 'copper', starter: true, dRoad: c.dRoad }); }
          if (starters.length < 3) problems.push(`${eid}: only ${starters.length} starter boulders within ${PLACE.starterR} m of the gate`);
          // they replace whatever general nodes stood too close
          Z.placed = Z.placed.filter(p => starters.every(s => Math.hypot(p.x - s.x, p.z - s.z) >= PLACE.gapAny));
          Z.placed.unshift(...starters);
          // the trainer: beside the main street, 7-16 m in from the gate, on walkable ground clear of buildings
          const pts = gate.main ? gate.main.pts : [[gate.x, gate.z], [gate.x - out[0] * 20, gate.z - out[1] * 20]];
          let spot = null;
          for (let along = 9; along <= 22 && !spot; along += 2.5) {
            let left = along, a = pts[0], b = pts[1];
            for (let i = 0; i + 1 < pts.length; i++) { a = pts[i]; b = pts[i + 1]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (left <= l) break; left -= l; }
            const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l;
            const cx = a[0] + ux * left, cz = a[1] + uz * left;
            for (const side of [1, -1]) {
              const off = (gate.main ? gate.main.width : 5) / 2 + 2.2;
              const x = +(cx - uz * off * side).toFixed(1), z = +(cz + ux * off * side).toFixed(1);
              const b2 = F.bits[F.idx(x, z)];
              const clear = vig.every(p => !(p.type === 'npc' || p.radius) || Math.hypot(p.x - x, p.z - z) > (p.radius || 1) + 2);
              if ((b2 & NAV.WALK) && !(b2 & (NAV.BUILDING | NAV.SOLID | NAV.DEEP | NAV.SHALLOW)) && clear) { spot = { x, z, yaw: +Math.atan2(cx - x, cz - z).toFixed(2), along }; break; }
            }
          }
          if (!spot) problems.push(`${eid}: no place for the prospector by ${gate.id}`);
          else trainers.push({ id: 'prospector_torborhold', name: 'Bram Delver', role: 'prospector', title: 'Prospector', town: zs.town, zone: wid, gate: gate.id, x: +(spot.x + ox).toFixed(1), z: +(spot.z + oz).toFixed(1), yaw: spot.yaw,
            greeting: 'See the boulders with green in them, out past the gate? That is copper, and it is yours for the price of three good swings.',
            starters: starters.map(s => ({ x: s.x + ox, z: s.z + oz, kind: s.kind })) });
        }
      }
      zones[wid] = Z.placed.map((p, n) => ({ id: `${wid}_${n + 1}`, k: p.kind, x: p.x + ox, z: p.z + oz, v: hash(`${wid}:${p.x}:${p.z}`) % 4, ...(p.starter ? { s: 1 } : {}) }));
      const count = prof => Z.placed.filter(p => p.prof === prof).length;
      const tiers = (sheet.gathering ? [1, 2, 3, 4, 5] : [1, 2, 3]).map(t => Z.placed.filter(p => content.nodeKinds[p.kind].tier === t).length);
      meta[wid] = { sheet: eid, name: zs.name, band: zs.band, mining: count('mining'), logging: count('logging'), foraging: count('foraging'), tiers, roadside: Z.placed.filter(p => p.dRoad <= 45).length };
      if (count('mining') < 20) problems.push(`${eid}: only ${count('mining')} boulders`);
    }
    // the smith's door in the start town (E's offices.json, zone metres there -> world metres), for the chain's marks
    const offices = provinceDataSync(readJ, prov, 'offices'), startWid = map[se];
    const [, sx, sy] = /^z(\d+)_(\d+)$/.exec(startWid).map(Number);
    const ent = offices && Object.values(offices.towns || {}).find(t => String(t.name).toLowerCase() === String(sheet.zones[se].town).toLowerCase());
    const so = ent && (ent.offices || []).find(f => f.role === 'smith');
    const smith = so ? { x: +((so.door ? so.door.x : so.x) + sx * ZM).toFixed(1), z: +((so.door ? so.door.z : so.z) + sy * ZM).toFixed(1), name: so.name || 'the smith' } : null;
    const quests = trainers.length ? buildQuests(trainers[0], smith) : null;
    return { numbers, content: { ...content, trainers }, zones, meta, problems, quests };
  });
}

function write(file, text) {
  let old = null; try { old = readFileSync(P(file), 'utf8'); } catch { /* new */ }
  if (old === text) return 0;
  if (!CHECK) writeFileSync(P(file), text);
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  requireProvince(process.argv);
  const { content, zones, meta, problems, quests } = await buildAll();
  let changed = 0;
  const total = Object.values(zones).reduce((a, l) => a + l.length, 0);
  // another province: its own professions file only holds its own trainers (the server lends the home recipes and
  // never the home trainers — js/sim/province-files.js PLACED_KEYS), so it is written only when it has some
  if (!HOME && content.trainers.length) changed += write(provinceDataPath(PROV, 'professions'), JSON.stringify({ _doc: `MADE by tools/content-professions.mjs --province=${PROV}: this province's own profession trainers (world metres), laid over data/provinces/professions.json.`, trainers: content.trainers }, null, 1) + '\n');
  if (HOME) changed += write('data/provinces/professions.json', JSON.stringify({
    _doc: 'Stream P-core (round 8, W9 Professions) — MADE by tools/content-professions.mjs; do not edit by hand (edit the tables in the tool and run it). materials: every stackable material (price = what a merchant pays for one). classes: the material of each tier 1-5 by what it is (metal, leather, cloth, wood, gem, herb, mushroom, fibre, ore, hide, resin). nodeKinds: what a node gives and how it looks (look.model boulder | tree | herb | mushroom | fibre). tools. recipes (kind material | tool | gear | potion | good; a gear recipe lists the real bases of C\'s catalog you may pick). goods: the consumables recipes make, as bag items. skins: which monsters a skinner can skin (types; worn = the hide is one grade lower) and, for the rest, the sentence that says why not (none). trainers: NPCs this system places (world metres). jobs: job frames appended to the job board.',
    ...content }, null, 1) + '\n');
  changed += write(provinceDataPath(PROV, 'professions-nodes'), JSON.stringify({
    _doc: 'Stream P-core (round 8, W9) — MADE by tools/content-professions.mjs from the CURRENT bake; do not edit by hand. zones.<world zone> = every gathering node of that zone, WORLD metres: id, k = node kind (data/provinces/professions.json nodeKinds), v = look variant 0-3, s = 1 for a starter node by Torborhold\'s gate (back in 2 minutes). Nodes are per player: the same entity for everyone, spent only for the one who worked it.',
    nodes: total, meta, zones }, null, 0).replace(/\],"z/g, '],\n"z') + '\n');
  if (quests && HOME) changed += write('data/quests/professions.json', JSON.stringify(quests, null, 2) + '\n');
  for (const [wid, m] of Object.entries(meta)) console.log(`${wid} ${m.sheet.padEnd(18)} band ${m.band.join('-').padEnd(5)} mining ${String(m.mining).padStart(2)} logging ${String(m.logging).padStart(2)} foraging ${String(m.foraging).padStart(2)}  tiers ${m.tiers.join('/')}  roadside ${m.roadside}`);
  for (const t of content.trainers) console.log(`trainer ${t.id} at ${t.x}, ${t.z} (${t.gate}); starter boulders ${t.starters.length}`);
  console.log(`materials ${Object.keys(content.materials).length}, node kinds ${Object.keys(content.nodeKinds).length}, tools ${content.tools.length}, recipes ${content.recipes.length} (${['smithing', 'outfitting', 'alchemy', 'cooking'].map(p => p + ' ' + content.recipes.filter(r => r.prof === p).length).join(', ')}), skins ${Object.keys(content.skins.types).length} (no hide: ${Object.keys(content.skins.none).length}); nodes ${total}; ${changed} file(s) ${CHECK ? 'would change' : 'written'}`);
  if (problems.length) { console.log('PROBLEMS:\n  ' + problems.join('\n  ')); process.exit(2); }
  if (CHECK && changed) process.exit(1);
}
