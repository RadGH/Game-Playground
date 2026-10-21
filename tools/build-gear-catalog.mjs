// Build avatar-3d/data/gear-catalog.json — ONE catalog of every wearable / holdable Chibi 2 model, old and new.
//
//   node --import ./avatar-3d/tests/three-register.mjs tools/build-gear-catalog.mjs          (writes the file)
//   node --import ./avatar-3d/tests/three-register.mjs tools/build-gear-catalog.mjs --check  (exit 1 if it would change)
//
// Where each part of a row comes from, so nothing is typed twice:
//   NEW rows (g5_)  avatar-3d/js/chibi2-gear5-ids.js — the design list the builders are held to
//   OLD rows        the vocabulary is the paper doll's part catalog (avatar-2d PARTS: the ids the shared normaliser
//                   lets through) plus CHIBI2_ONLY_PARTS; a row is kept only if Chibi 2 really BUILDS something for
//                   it (the tool builds a body with and without the part and compares the geometry)
//   type/archetype  the small tables below (old ids), the id tables (new)
//   games           which games name the id as a value in their code or data (a text scan — a heuristic)
//   items           Thousandvale's own gear-look tables run over every base in items.json
//
// avatar-3d/tests/gear-catalog.test.js re-derives the code side and fails if the file and the code disagree.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { PARTS } from '../avatar-2d/js/parts/index.js';
import { G5_TABLES, isG5 } from '../avatar-3d/js/chibi2-gear5-ids.js';
import { FARHOLD_WEAPON_INFO, FARHOLD_OFFHAND_INFO, isTwoHandedHeld } from '../avatar-3d/js/chibi2-weapon-ids.js';
import { TOP_STYLES, BOTTOM_STYLES, SHOE_STYLES } from '../avatar-3d/js/chibi2-body.js';
import { createChibi2Character, CHIBI2_ONLY_PARTS } from '../avatar-3d/js/chibi2.js';
import { CLASS_HATS } from '../avatar-3d/js/chibi2-hats.js';
import { T2_DECOR } from '../avatar-3d/js/chibi2-armour2.js';
import { heldLook, offhandLook, gearLook } from '../prototypes/thousandvale/js/client/gear-look.js';
import { installFoci } from '../prototypes/farhold/js/foci.js';
import { installTvGear } from '../prototypes/thousandvale/js/rules/tv-gear.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'avatar-3d/data/gear-catalog.json');
export const WEAR_SLOTS = ['held', 'offhand', 'hat', 'top', 'bottom', 'shoes', 'cape', 'decor', 'accessory'];

// ---------------------------------------------------------------- what the old ids are
const FAMILY_TYPE = { dagger: 'dagger', sword: 'sword', greatsword: 'sword2h', sabre: 'sword', rapier: 'sword', axe: 'axe', hammer: 'hammer', mace: 'mace', polearm: 'spear', staff: 'quarterstaff', wand: 'wand' };
const HELD_TYPE = {
  sword: 'sword', greatsword: 'sword2h', greataxe: 'axe2h', hammer: 'hammer', warhammer: 'hammer2h', mace: 'mace', rapier: 'sword', saber: 'sword', daggers: 'dagger', cleaver: 'sword',
  bow: 'bow', crossbow: 'crossbow', quarterstaff: 'quarterstaff', staff_orb: 'staff', staff_skull: 'staff', staff_crook: 'staff', staff_crystal: 'staff', staff_totem: 'staff',
  lute: 'instrument', book: 'tome', hourglass: 'focus', orb: 'orb', flame: 'spell', lightning: 'spell', ring_rune: 'spell',
  fh_greataxe: 'axe2h', fh_maul: 'hammer2h', fh_halberd: 'polearm', fh_javelin: 'javelin', fh_scepter: 'scepter', tv_warpick: 'axe2h', tv_glaive: 'javelin', tv_club: 'mace',
};
const HELD_TWO = new Set(['greatsword', 'greataxe', 'warhammer', 'bow', 'crossbow', 'quarterstaff', 'staff_orb', 'staff_skull', 'staff_crook', 'staff_crystal', 'staff_totem', 'lute']);
const HELD_FORM = { staff_orb: 'area', staff_crystal: 'projectile', staff_skull: 'projectile', staff_crook: 'area', staff_totem: 'fork', fh_wand: 'projectile' };
const OFF_TYPE = { heater_shield: 'shield', kite_shield: 'shield', round_shield: 'shield', tower_shield: 'shield', buckler: 'shield', fh_heater_shield: 'shield', fh_kite_shield: 'shield', fh_tower_shield: 'shield',
  dagger: 'dagger', map: 'prop', orb: 'focus', relic: 'focus', idol: 'focus', book: 'focus', tv_ward: 'focus', tv_totem: 'focus', quiver: 'quiver', torch: 'torch' };
const OFF_FOCUS = { orb: 'orb', relic: 'relic', idol: 'idol', book: 'tome', tv_ward: 'ward', tv_totem: 'totem' };
const OFF_SHIELD = { heater_shield: 'heater', fh_heater_shield: 'heater', kite_shield: 'kite', fh_kite_shield: 'kite', round_shield: 'round', tower_shield: 'tower', fh_tower_shield: 'tower', buckler: 'buckler' };
const HAT_ARCH = { hood: 'cloth', hood_down: 'cloth', wizard: 'cloth', cap: 'cloth', bandana: 'cloth', headband: 'cloth', circlet: 'cloth', leather_cap: 'leather', feather_cap: 'leather', wide_brim: 'leather', goggles_up: 'leather', tricorn: 'leather', wolf_helm: 'leather', bone_headdress: 'leather',
  chain_coif: 'mail', helmet: 'mail', horned_helm: 'mail', war_helm: 'mail', rune_helm: 'mail', great_helm: 'plate', plate_helm: 'plate', dragon_helm: 'plate' };
const HATS_IN_CHIBI2 = new Set(['dragon_helm', 'helmet', 'horned_helm', 'wizard', 'feather_cap', 'hood', 'hood_down', 'wide_brim', 'goggles_up']);
const TOP_ARCH = id => { const s = TOP_STYLES[id] || {}; return s.armor === 'plate' || s.armor === 'scale' ? 'plate' : s.armor === 'mail' ? 'mail' : ['leather', 'strapped_leather', 'gambeson', 'harness', 'fur_tunic'].includes(id) ? 'leather' : 'cloth'; };
const BOTTOM_ARCH = { greaves: 'plate' }, SHOE_ARCH = { heavy: 'plate', boots: 'leather', pointed: 'leather' };
const CAPE_TYPE = 'cloak';
const DECOR_TYPE = { belt_lantern: 'lantern', belt_torch: 'torch', wisp_lamp: 'lantern', trophy_belt: 'belt', belt_pouches: 'belt', bone_charms: 'belt', pauldrons: 'shoulders', t2_pauldrons: 'shoulders', t2_mantle: 'shoulders', t2_harness: 'shoulders', t2_vestments: 'tabard', t2_wildmantle: 'shoulders', tabard: 'tabard', bead_necklace: 'amulet' };
const DECOR_SLOT = { lantern: 'light', torch: 'light', belt: 'belt', amulet: 'necklace' };
const ACC_TYPE = { pendant: 'amulet', crescent: 'amulet', bead_necklace: 'amulet', scarf: 'scarf', prayer_beads: 'charm', bandolier: 'bandolier', pocketwatch: 'charm' };
const ARCH_COLOUR = { cloth: '#7a6a8a', leather: '#7a5a3a', mail: '#6a7a6a', plate: '#a0a8b2' };

const nice = id => id.replace(/^(fh|tv|t2)_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const nameOf = (slot, id) => (PARTS[slot]?.[id]?.name || nice(id)).replace(/ \(off hand\)$/, '');

// ---------------------------------------------------------------- does Chibi 2 build it?
async function signature(avatar) {
  const a = await createChibi2Character(avatar);
  let n = 0, sum = 0;
  for (const part of a.group.children[0].children) {
    const p = part.geometry?.attributes?.position; if (!p) continue;
    n += p.count; for (let i = 0; i < p.count; i += 7) sum += p.getX(i) * 3 + p.getY(i) * 5 + p.getZ(i) * 7;
  }
  a.dispose();
  return n + ':' + sum.toFixed(3);
}
const BASELINE = { hat: 'none', cape: 'none', decor: 'none', accessory: 'none', held: 'none', offhand: 'none', top: 'tshirt', bottom: 'pants', shoes: 'sneakers' };
async function builds(slot, id) {
  if (id === BASELINE[slot]) return slot === 'top' || slot === 'bottom' || slot === 'shoes';
  return (await signature({ [slot]: { id } })) !== (await signature({ [slot]: { id: BASELINE[slot] } }));
}

// ---------------------------------------------------------------- which games name it
function readTree(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f), st = statSync(p);
    if (st.isDirectory()) { if (!/node_modules|synced|tests|research|world$|provinces|bake/.test(f)) readTree(p, out); }
    else if (/\.(js|mjs|json)$/.test(f) && st.size < 3_000_000) out.push(readFileSync(p, 'utf8'));
  }
  return out;
}
const GAME_TEXT = Object.fromEntries(['farhold', 'emberveil', 'bannerline', 'thousandvale'].map(g => [g, [...readTree(join(ROOT, 'prototypes', g, 'js')), ...readTree(join(ROOT, 'prototypes', g, 'data'))].join('\n')]));
// the class outfit tables are shared: Farhold and Thousandvale dress from them, Emberveil from its own class-looks
const OUTFITS = ['class-outfits.json', 'class-outfits-t2.json'].map(f => readFileSync(join(ROOT, 'avatar-3d/data', f), 'utf8')).join('\n');
GAME_TEXT.farhold += OUTFITS; GAME_TEXT.thousandvale += OUTFITS;
{ const shops = join(ROOT, 'prototypes/thousandvale/data/provinces/shops.json'); if (existsSync(shops)) GAME_TEXT.thousandvale += readFileSync(shops, 'utf8'); }
// a g5_ id is unmistakable, so any mention counts; an old id ('sword', 'cap') only counts where it is a VALUE
const gamesOf = id => isG5(id) ? Object.keys(GAME_TEXT).filter(g => GAME_TEXT[g].includes(id)) : gamesOfOld(id);
const gamesOfOld = id => Object.keys(GAME_TEXT).filter(g => new RegExp(`[:,\\[]\\s*["']${id}["']`).test(GAME_TEXT[g]));

// ---------------------------------------------------------------- Thousandvale: which item bases draw which model
const ITEMS = JSON.parse(readFileSync(join(ROOT, 'prototypes/emberveil/data/items.json'), 'utf8'));
const itemsOf = {};
const note = (slot, id, base) => { if (id && id !== 'none') ((itemsOf[slot + ':' + id] ??= new Set())).add(base); };
for (const [base, b] of Object.entries(ITEMS.weaponBases || {})) {
  note('held', heldLook({ ...b, baseKey: base }).id, base);
  if (b.subtype === 'staff') for (const el of ['fire', 'ice', 'lightning', 'poison', 'shadow', 'holy', 'arcane']) note('held', heldLook({ ...b, baseKey: base, castElement: el }).id, base);
}
for (const [base, b] of Object.entries(ITEMS.armorBases || {})) {
  if (b.slot === 'offhand') { note('offhand', offhandLook({ ...b, baseKey: base }).id, base); continue; }
  const look = gearLook({ [b.slot]: { ...b, baseKey: base } });
  const part = { head: 'hat', chest: 'top', legs: 'bottom', feet: 'shoes' }[b.slot];
  if (part) note(part, look[part]?.id, base);
}
for (const base of ['grimoire', 'psalter', 'seer_orb', 'reliquary', 'effigy', 'totem', 'warded_focus']) note('offhand', offhandLook({ baseKey: base, slot: 'offhand' }).id, base);

// ---------------------------------------------------------------- rows
const rows = [];
const row = r => rows.push({
  id: r.id, ...(r.base ? { base: r.base } : {}), kind: r.kind, slot: r.slot, field: r.field || null, gameSlot: r.gameSlot ?? null, type: r.type ?? null,
  archetype: r.archetype ?? null, hands: r.hands ?? null, file: r.file, builder: r.builder, name: r.name, element: r.element ?? null, form: r.form ?? null,
  tags: [...new Set([r.kind, r.type, r.archetype, r.form && 'form:' + r.form, r.element && 'element:' + r.element, r.hands === 2 && 'two-handed', ...(r.tags || [])].filter(Boolean))],
  color: r.color ?? null, color2: r.color2 ?? null, minLevel: r.minLevel ?? null, new: !!r.new, round: r.round ?? null,
  games: r.games ?? gamesOf(r.id), items: r.items ?? [...(itemsOf[r.slot + ':' + r.id] || [])].sort().map(base => ({ game: 'thousandvale', base })),
  ...(r.offhandToo ? { offhandToo: true } : {}),
});

// ---- new
for (const t of G5_TABLES) for (const [id, r] of Object.entries(t.table)) {
  row({
    id, base: id, kind: t.kind, slot: t.slot, field: t.field, gameSlot: r.gameSlot || t.gameSlot, type: t.type || r.type, archetype: r.archetype,
    hands: r.hands, file: t.file, builder: `${t.export}.${id}`, name: r.name, form: r.form, element: r.element,
    tags: [r.focus && 'focus:' + r.focus, r.shield && 'shield:' + r.shield], minLevel: r.minLevel, new: true, round: 5,
    color: r.color || (r.archetype ? ARCH_COLOUR[r.archetype] : t.slot === 'held' ? '#c8ccd6' : null), color2: r.color2,
    offhandToo: t.slot === 'held' && r.hands === 1 && !['caster', 'none', 'crossbow', 'staff'].includes(r.hold),
    games: gamesOf(id),
  });
}

// ---- old
const vocab = slot => [...new Set([...Object.keys(PARTS[slot] || {}), ...(CHIBI2_ONLY_PARTS[slot] || [])])].filter(id => id !== 'none' && !isG5(id));
for (const id of vocab('held')) {
  if (!await builds('held', id)) continue;
  const fh = FARHOLD_WEAPON_INFO[id];
  row({ id, kind: 'weapon', slot: 'held', gameSlot: 'weapon', type: HELD_TYPE[id] || (fh && FAMILY_TYPE[fh.family]) || 'sword', hands: (fh ? fh.hands === 2 : HELD_TWO.has(id)) || isTwoHandedHeld(id) ? 2 : 1,   // W11 (2026-10-21): the builder's own two-handed rule decides too
    file: id.startsWith('tv_') ? 'avatar-3d/js/chibi2-weapons-tv.js' : fh ? 'avatar-3d/js/chibi2-weapons.js' : 'avatar-3d/js/chibi2-gear.js',
    builder: id.startsWith('tv_') ? `TV_BUILDERS.${id}` : fh ? `BUILDERS.${id}` : `buildHeld('${id}')`, name: nameOf('held', id), form: HELD_FORM[id], color: '#c8ccd6',
    offhandToo: !!PARTS.offhand[id] });
}
for (const id of vocab('offhand')) {
  if (PARTS.held[id] && id !== 'book' && id !== 'orb') continue;                // a second weapon: the held row covers it (`offhandToo`)
  if (!await builds('offhand', id)) continue;
  const type = OFF_TYPE[id] || 'prop';
  row({ id, kind: 'offhand', slot: 'offhand', gameSlot: 'offhand', type, file: FARHOLD_OFFHAND_INFO[id] ? 'avatar-3d/js/chibi2-weapons.js' : 'avatar-3d/js/chibi2-gear.js',
    builder: FARHOLD_OFFHAND_INFO[id] ? `OFFHAND_BUILDERS.${id}` : `buildOffhand('${id}')`, name: nameOf('offhand', id), color: type === 'shield' ? '#8d97a3' : null,
    tags: [OFF_FOCUS[id] && 'focus:' + OFF_FOCUS[id], OFF_SHIELD[id] && 'shield:' + OFF_SHIELD[id]] });
}
for (const id of vocab('hat')) {
  if (!await builds('hat', id)) continue;
  const arch = HAT_ARCH[id] || null;
  row({ id, kind: arch ? 'armour' : 'hat', slot: 'hat', gameSlot: 'head', type: 'head', archetype: arch, file: HATS_IN_CHIBI2.has(id) ? 'avatar-3d/js/chibi2.js' : 'avatar-3d/js/chibi2-hats.js',
    builder: HATS_IN_CHIBI2.has(id) ? `buildTemplate('${id}')` : `buildExtraHat('${id}')`, name: nameOf('hat', id), color: arch ? ARCH_COLOUR[arch] : null, tags: [CLASS_HATS.includes(id) && 'class-hat'] });
}
for (const [slot, styles, gameSlot, arch] of [['top', TOP_STYLES, 'chest', TOP_ARCH], ['bottom', BOTTOM_STYLES, 'legs', id => BOTTOM_ARCH[id] || 'cloth'], ['shoes', SHOE_STYLES, 'feet', id => SHOE_ARCH[id] || 'cloth']]) {
  for (const id of vocab(slot)) {
    if (!styles[id]) continue;                                                  // an id the body has no style for falls back to the default garment: not a model
    const a = arch(id);
    row({ id, kind: 'armour', slot, gameSlot, type: gameSlot, archetype: a, file: 'avatar-3d/js/chibi2-body.js', builder: `${slot.toUpperCase()}_STYLES.${id}`.replace('SHOES_', 'SHOE_'), name: nameOf(slot, id), color: ARCH_COLOUR[a] });
  }
}
// (2026-10-21: scarves can be worn in the back slot too — they are typed 'scarf' there, as in the accessory slot)
for (const id of vocab('cape')) if (await builds('cape', id)) row({ id, kind: 'accessory', slot: 'cape', gameSlot: 'cape', type: /scarf|cowl|neckerchief/.test(id) ? 'scarf' : CAPE_TYPE, file: 'avatar-3d/js/chibi2-gear.js', builder: `buildCape('${id}')`, name: nameOf('cape', id) });
for (const id of vocab('decor')) if (await builds('decor', id)) {
  const type = DECOR_TYPE[id] || 'decor';
  row({ id, kind: 'accessory', slot: 'decor', gameSlot: DECOR_SLOT[type] || null, type, file: T2_DECOR.includes(id) ? 'avatar-3d/js/chibi2-armour2.js' : 'avatar-3d/js/chibi2-gear.js',
    builder: T2_DECOR.includes(id) ? `buildArmour2('${id}')` : `buildDecor('${id}')`, name: nameOf('decor', id), tags: [T2_DECOR.includes(id) && 'tier2'] });
}
for (const id of vocab('accessory')) if (await builds('accessory', id)) {
  const type = ACC_TYPE[id] || (/^scarf_(trailing|cowl|striped)$|^neckerchief$/.test(id) ? 'scarf' : 'face');
  row({ id, kind: 'accessory', slot: 'accessory', gameSlot: type === 'amulet' ? 'necklace' : null, type, file: ACC_TYPE[id] || type === 'scarf' ? 'avatar-3d/js/chibi2-gear.js' : 'avatar-3d/js/chibi2-face.js',
    builder: ACC_TYPE[id] || type === 'scarf' ? `buildAccessory('${id}')` : `buildFace('${id}')`, name: nameOf('accessory', id) });
}

// ---- Thousandvale's items made FROM the catalog (stream C, js/rules/tv-gear.js + data/rules/gear-tv.json): each new row
// becomes an item base whose key is the row's `base` and whose numbers are copied from a plain `template` base. The
// plain bases of the extra slots (travel_cloak, leather_belt, and the backpacks) land on the model gear-look draws for
// them. (Light items left Thousandvale in owner feedback 8: the lantern / torch models stay in the catalog for other games.)
{
  const cfgPath = join(ROOT, 'prototypes/thousandvale/data/rules/gear-tv.json');
  if (existsSync(cfgPath)) {
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')), table = JSON.parse(JSON.stringify(ITEMS));
    installFoci(table);                                   // the engine installs Farhold's foci first: four catalog foci copy them
    const report = installTvGear(table, cfg, { rows });
    for (const r of rows) {
      if (!r.new || !report.catalog.includes(r.base)) continue;
      const b = table.weaponBases[r.base] || table.armorBases[r.base];
      r.items = [{ game: 'thousandvale', base: r.base, template: b.tvFrom || null, slot: b.slot || (b.type === 'weapon' ? 'weapon' : null) }];
    }
    for (const [key, b] of Object.entries(cfg.bases?.armor || {})) {
      if (!['back', 'waist', 'light'].includes(b.slot)) continue;
      const look = gearLook({ [b.slot]: { ...b, baseKey: key } });
      for (const slot of ['cape', 'decor', 'offhand']) {
        // (a backpack base lands on a NEW row — the pack models of owner feedback 8, W19 — so new rows count here too)
        const id = look[slot]?.id, r = id && id !== 'none' && rows.find(x => x.id === id && x.slot === slot && (!x.new || b.pack));
        if (r && !r.items.some(i => i.base === key)) r.items.push({ game: 'thousandvale', base: key, slot: b.slot });
      }
      // a rare-or-better pack draws the model the rules name in `packs.rareLook`
      if (b.pack && cfg.packs?.rareLook) {
        const id = gearLook({ [b.slot]: { ...b, baseKey: key, rarity: 'rare', g5: cfg.packs.rareLook } }).cape?.id, r = rows.find(x => x.id === id && x.slot === 'cape');
        if (r && !r.items.some(i => i.base === key)) r.items.push({ game: 'thousandvale', base: key, slot: b.slot, rarity: 'rare' });
      }
    }
  }
}

const order = { weapon: 0, offhand: 1, armour: 2, hat: 3, accessory: 4 };
rows.sort((a, b) => order[a.kind] - order[b.kind] || (a.slot + (a.field || '')).localeCompare(b.slot + (b.field || '')) || Number(b.new) - Number(a.new) || a.id.localeCompare(b.id));

const catalog = {
  _doc: 'ONE catalog of every wearable / holdable Chibi 2 model (avatar-3d), old and new. GENERATED by tools/build-gear-catalog.mjs — edit avatar-3d/js/chibi2-gear5-ids.js (new models) or the tables in the tool (old ones) and re-run; avatar-3d/tests/gear-catalog.test.js fails if this file and the code disagree. Read it through avatar-3d/js/gear-catalog.js. Row fields: CHIBI2.md "Gear catalog".',
  version: 1,
  counts: { rows: rows.length, new: rows.filter(r => r.new).length },
  rows,
};
const text = JSON.stringify(catalog, null, 1).replace(/\n {3,}/g, ' ').replace(/\n {2}([\]}])/g, ' $1') + '\n';
if (process.argv.includes('--check')) {
  // `games` and `items` are read out of the games' own code and data, which other work changes all the time: a
  // stale usage note is not a model missing from the catalog, so the check compares everything BUT those two.
  const core = c => JSON.stringify((c.rows || []).map(({ games, items, ...r }) => r));
  const cur = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
  if (core(cur) !== core(catalog)) {
    const have = new Set((cur.rows || []).map(r => r.slot + ':' + r.id)), want = new Set(rows.map(r => r.slot + ':' + r.id));
    console.error('gear-catalog.json is stale: run tools/build-gear-catalog.mjs', { missingFromCatalog: [...want].filter(k => !have.has(k)), notBuiltByCode: [...have].filter(k => !want.has(k)) });
    process.exit(1);
  }
  console.log('gear-catalog.json is current');
} else {
  writeFileSync(OUT, text);
  const by = {}; for (const r of rows) by[r.kind] = (by[r.kind] || 0) + 1;
  console.log(`wrote ${rows.length} rows (${catalog.counts.new} new)`, by);
}
