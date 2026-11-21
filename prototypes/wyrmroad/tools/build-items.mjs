#!/usr/bin/env node
// Builds data/items.json from the design tables below (the one place gear is designed). Run after changing a set:
//   node prototypes/wyrmroad/tools/build-items.mjs
// Every base item carries: id, name, slot, cls (who can use it), hand (weapons/off hand: how it is held — game-standards
// §5b), chapter, set, look ({ <avatar slot>: { id, color, color2, emblem } } merged onto the Chibi body), stats (the
// Common numbers; rarity scales them in js/sim/items.js — the ONE stat function). Legendary pieces add `effect`.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../data/items.json');

// Stat budget by chapter (0..5): weapons give power, armour gives defence + health, the off hand splits.
const L = ch => ch * 2 + 1;                       // the level a chapter is played at
const PW = ch => Math.round(3 + 2.4 * L(ch));     // weapon power
const DEF = (ch, k) => Math.max(1, Math.round((1 + 1.15 * L(ch)) * k));
const HP = (ch, k) => Math.round((4 + 3 * L(ch)) * k);
const PIECE = { head: 0.8, chest: 1.4, legs: 1.0, feet: 0.6 };

// One row per chapter set: a name, a palette and, per class, the parts it is cut from.
//   [name, Chibi part id, color, color2?]
const SETS = [
  { ch: 0, set: 'Homespun', pal: ['#8a6a4a', '#d8c8a0'], cls: {
    vanguard: { weapon: ["Millwright's Greatsword", 'fh_greatsword', '#b9c2cc'], head: ['Padded Cap', 'leather_cap'], chest: ['Quilted Jack', 'gambeson'], legs: ['Work Breeches', 'breeches'], feet: ['Hobnail Boots', 'boots'] },
    duelist: { weapon: ['Kitchen Knife', 'fh_dagger', '#c9ccd2'], offhand: ['Paring Knife', 'fh_dagger', '#aab0b8'], head: ['Red Bandana', 'bandana', '#a83a2a'], chest: ['Patched Tunic', 'tunic'], legs: ['Field Leggings', 'leggings'], feet: ['Soft Boots', 'soft_boots'] },
    arcanist: { weapon: ['Willow Crook', 'staff_crook', '#8a6a44'], head: ['Wide Straw Hat', 'straw', '#d8c070'], chest: ['Hedge Robe', 'robe'], legs: ['Wool Trousers', 'pants'], feet: ['Rope Sandals', 'sandals'] },
    warden: { weapon: ["Smith's Mace", 'fh_mace', '#9aa0a8'], offhand: ['Barrel-lid Shield', 'round_shield', '#7a5a3a'], head: ['Chain Coif', 'chain_coif', '#8a8f98'], chest: ['Padded Hauberk', 'gambeson'], legs: ['Thick Breeches', 'breeches'], feet: ['Field Boots', 'boots'] },
  } },
  { ch: 1, set: 'Briarwood', pal: ['#3e5a2e', '#8a5a2a'], cls: {
    vanguard: { weapon: ["Woodcutter's Greataxe", 'fh_greataxe', '#a8b0a0'], head: ['Wolfskin Helm', 'wolf_helm', '#6a6258'], chest: ['Furred Tunic', 'fur_tunic', '#6a5a44'], legs: ['Bark Greaves', 'greaves', '#5a4a32'], feet: ['Root Boots', 'heavy', '#4a3a28'] },
    duelist: { weapon: ['Thornleaf', 'g5_leafblade', '#7aa04a'], offhand: ['Thornleaf Twin', 'g5_leafblade', '#6a9040'], head: ['Leaf Slouch Hat', 'g5_leather_slouch'], chest: ['Briar Brigandine', 'g5_leather_brigandine'], legs: ['Briar Chaps', 'g5_leather_chaps'], feet: ['Moss-soft Boots', 'g5_leather_cuffboots'] },
    arcanist: { weapon: ['Briarheart Staff', 'g5_staff_branch', '#6b4a2a'], head: ['Witchwood Hood', 'hood'], chest: ['Thorn-trim Robe', 'trim_robe'], legs: ['Moss Pleats', 'g5_cloth_pleats'], feet: ['Curled Slippers', 'g5_cloth_curltoes'] },
    warden: { weapon: ['Thornstar', 'g5_morningstar', '#8a9a6a'], offhand: ['Oak Buckler', 'buckler', '#6b4a2a'], head: ['Mossy Mail Cap', 'g5_mail_cap'], chest: ['Ivy Hauberk', 'g5_mail_hauberk'], legs: ['Ivy Chausses', 'g5_mail_chausses'], feet: ['Splinted Boots', 'g5_mail_splints'] },
  } },
  { ch: 2, set: 'Tidewrack', pal: ['#2e5a78', '#e8e0cc'], cls: {
    vanguard: { weapon: ["Dockmaster's Headsman", 'g5_headsman', '#c8d0d8'], head: ['Barnacle Helm', 'war_helm'], chest: ['Saltplate Cuirass', 'scale_plate'], legs: ['Salt Greaves', 'greaves'], feet: ['Wading Boots', 'heavy'] },
    duelist: { weapon: ['Gull Sabre', 'fh_sabre', '#d8e0e8'], offhand: ['Hook Knife', 'g5_kris', '#b0b8c0'], head: ['Sailor Tricorn', 'tricorn'], chest: ["Smuggler's Coat", 'open_coat'], legs: ['Deck Breeches', 'breeches'], feet: ['Knee Boots', 'knee_boots'] },
    arcanist: { weapon: ['Tidewater Lens', 'g5_staff_lens', '#7ac0e0'], head: ['Spray Hood', 'hood'], chest: ['Saltmere Sash Robe', 'sash_robe'], legs: ['Sailcloth Skirt', 'long_skirt'], feet: ['Reef Sandals', 'sandals'] },
    warden: { weapon: ['Anchor-head Hammer', 'fh_hammer', '#8a96a2'], offhand: ['Harbour Targe', 'g5_targe', '#2e5a78'], head: ['Pier Helm', 'helmet'], chest: ['Netted Hauberk', 'hauberk'], legs: ['Salt Chausses', 'g5_mail_chausses'], feet: ['Tarred Boots', 'work_boots'] },
  } },
  { ch: 3, set: 'Lantern-iron', pal: ['#2c3122', '#c6e05a'], cls: {
    vanguard: { weapon: ['Penitent Flamberge', 'g5_flamberge', '#d0d8b0'], head: ['Order Armet', 'g5_plate_armet'], chest: ['Lantern Cuirass', 'g5_plate_cuirass'], legs: ['Lantern Cuisses', 'g5_plate_cuisses'], feet: ['Lantern Sabatons', 'g5_plate_sabatons'] },
    duelist: { weapon: ['Vigil Rapier', 'fh_rapier', '#d8e0b0'], offhand: ['Wick Dagger', 'fh_dagger', '#c6e05a'], head: ['Vigil Hood', 'hood_down'], chest: ['Penitent Harness', 'strapped_leather'], legs: ['Vigil Leggings', 'leggings'], feet: ['Cloister Boots', 'ankle_boots'] },
    arcanist: { weapon: ['Halo Staff', 'g5_staff_halo', '#d8ff6a'], head: ['Rune Helm', 'rune_helm'], chest: ['High-collar Robe', 'high_collar_robe'], legs: ['Cloister Pleats', 'g5_cloth_pleats'], feet: ['Cloister Slippers', 'g5_cloth_curltoes'] },
    warden: { weapon: ['Crown Sceptre', 'g5_crownsceptre', '#c6e05a'], offhand: ['Sun Scutcheon', 'g5_scutcheon', '#3e4a22', 'sun'], head: ['Plate Helm', 'plate_helm'], chest: ['Order Surcoat', 'surcoat'], legs: ['Order Chausses', 'g5_mail_chausses'], feet: ['Order Splints', 'g5_mail_splints'] },
  } },
  { ch: 4, set: 'Wyrmscale', pal: ['#4a5a68', '#e0b040'], cls: {
    vanguard: { weapon: ['Spinebreaker Maul', 'g5_stonemaul', '#7a8a96'], head: ['Wyrm Helm', 'dragon_helm'], chest: ['Scale Plate', 'scale_plate'], legs: ['Scale Greaves', 'greaves'], feet: ['Clawed Sabatons', 'g5_plate_sabatons'] },
    duelist: { weapon: ['Fang Kris', 'g5_kris', '#e0e8f0'], offhand: ['Fang Kris Twin', 'g5_kris', '#d0d8e0'], head: ['Scale Mask', 'war_helm'], chest: ['Scaled Doublet', 'doublet'], legs: ['Scaled Chaps', 'g5_leather_chaps'], feet: ['Ridge Boots', 'g5_leather_cuffboots'] },
    arcanist: { weapon: ['Horn Staff', 'g5_staff_horn', '#e0d0a0'], head: ['Horned Circlet', 'circlet'], chest: ['Smoke Vestment', 'g5_cloth_vestment'], legs: ['Ash Pleats', 'g5_cloth_pleats'], feet: ['Ash Curltoes', 'g5_cloth_curltoes'] },
    warden: { weapon: ['Spine Mallet', 'g5_mallet', '#8a96a2'], offhand: ['Scale Pavise', 'g5_pavise', '#4a5a68'], head: ['Crested Helm', 'horned_helm'], chest: ['Scale Hauberk', 'g5_mail_hauberk'], legs: ['Scale Chausses', 'g5_mail_chausses'], feet: ['Scale Splints', 'g5_mail_splints'] },
  } },
  { ch: 5, set: 'Crownfire', pal: ['#e8dcc0', '#d8a020'], cls: {
    vanguard: { weapon: ['Crownfire Greatsword', 'greatsword', '#ffe080'], head: ['Crowned Helm', 'great_helm'], chest: ['Crownfire Plate', 'plate'], legs: ['Crownfire Greaves', 'g5_plate_cuisses'], feet: ['Gilded Sabatons', 'g5_plate_sabatons'] },
    duelist: { weapon: ['Sunsplit Sabre', 'saber', '#ffe080'], offhand: ['Moonsplit Sabre', 'tv_scimitar', '#d0d8ff'], head: ['Gold Circlet', 'circlet'], chest: ['Silk Duster', 'silks'], legs: ['Gilded Leggings', 'leggings'], feet: ['Gilded Boots', 'knee_boots'] },
    arcanist: { weapon: ['Spire of Crownhollow', 'g5_staff_spire', '#ffe080'], head: ['Starlit Hat', 'wizard'], chest: ['Crownfire Robe', 'trim_robe'], legs: ['Gilded Pleats', 'g5_cloth_pleats'], feet: ['Gilded Curltoes', 'g5_cloth_curltoes'] },
    warden: { weapon: ['Dawnstar', 'g5_morningstar', '#ffe080'], offhand: ['Aegis of the Bells', 'tower_shield', '#e8dcc0', 'sun'], head: ['Bell Helm', 'plate_helm'], chest: ['Crownfire Surcoat', 'surcoat'], legs: ['Gilded Chausses', 'g5_mail_chausses'], feet: ['Gilded Splints', 'g5_mail_splints'] },
  } },
];

// How each class holds its weapon / off hand (§5b: one field drives the card's first line).
const HAND = { vanguard: 'two', arcanist: 'two', duelist: 'one', warden: 'one' };
const OFF_KIND = { duelist: 'blade', warden: 'shield' };
// Where each slot goes on the Chibi avatar.
const AV = { weapon: 'held', offhand: 'offhand', head: 'hat', chest: 'top', legs: 'bottom', feet: 'shoes' };

const items = [];
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
for (const S of SETS) {
  for (const [cls, parts] of Object.entries(S.cls)) {
    for (const [slot, row] of Object.entries(parts)) {
      const [name, part, color, extra] = row;
      const look = { [AV[slot]]: { id: part, color: color || (slot === 'chest' || slot === 'head' ? S.pal[0] : shade(S.pal[0], slot === 'feet' ? -0.25 : -0.1)), color2: S.pal[1] } };
      if (extra && slot === 'offhand') look.offhand.emblem = extra;
      const stats = {};
      if (slot === 'weapon') { stats.power = PW(S.ch); if (cls === 'arcanist') stats.spell = Math.round(PW(S.ch) * 0.5); }
      else if (slot === 'offhand') {
        if (OFF_KIND[cls] === 'shield') { stats.def = DEF(S.ch, 1.2); stats.block = 4 + S.ch; }
        else { stats.power = Math.round(PW(S.ch) * 0.45); stats.crit = 2 + S.ch; }
      } else { stats.def = DEF(S.ch, PIECE[slot]); stats.hp = HP(S.ch, PIECE[slot]); if (cls === 'arcanist' || cls === 'warden') stats.mp = Math.round(HP(S.ch, PIECE[slot]) * 0.4); }
      items.push({
        id: `${slug(S.set)}_${cls}_${slot}`, name, slot, cls: [cls], chapter: S.ch, set: S.set,
        ...(slot === 'weapon' ? { hand: HAND[cls] === 'two' ? 'two' : (cls === 'duelist' ? 'one' : 'main') } : {}),
        ...(slot === 'offhand' ? { hand: 'off', offKind: OFF_KIND[cls] } : {}),
        look, stats,
      });
    }
  }
}

// Trinkets (any hero): a necklace drawn on the body.
const TRINKETS = [
  [0, 'Bell-copper Pendant', 'pendant', '#c87a3a', { hp: 12, regen: 1 }],
  [1, 'Briar Torc', 'g5_torc', '#6a9040', { crit: 4, power: 2 }],
  [2, 'Pearl Crescent', 'crescent', '#e8e0cc', { mp: 20, mpRegen: 1 }],
  [3, 'Penitent Beads', 'prayer_beads', '#c6e05a', { def: 6, hp: 30 }],
  [4, 'Wyrm-tooth Charm', 'pendant', '#e0d0a0', { power: 6, crit: 5 }],
  [5, 'Crownfire Torc', 'g5_torc', '#ffe080', { power: 8, hp: 50, mp: 30 }],
];
for (const [ch, name, part, color, stats] of TRINKETS) items.push({ id: `trinket_${slug(name)}`, name, slot: 'trinket', cls: ['vanguard', 'duelist', 'arcanist', 'warden'], chapter: ch, set: 'Trinket', look: { accessory: { id: part, color } }, stats });

// Legendaries: one per class + two trinkets; always drop as Legendary and carry a rule (js/sim/brawl.js `effect`).
const LEGEND = [
  { id: 'leg_bellbreaker', name: 'Bellbreaker', slot: 'weapon', cls: ['vanguard'], hand: 'two', chapter: 3, look: { held: { id: 'g5_stonemaul', color: '#d8a020', color2: '#fff0c0' } }, stats: { power: PW(3) + 6 }, effect: { id: 'shockwave', r: 2.4, dmg: 0.8 } },
  { id: 'leg_twin_fang', name: 'Twin Fang', slot: 'weapon', cls: ['duelist'], hand: 'one', chapter: 2, look: { held: { id: 'g5_kris', color: '#e04a4a' } }, stats: { power: PW(2) + 4, crit: 6 }, effect: { id: 'echo', chance: 0.25 } },
  { id: 'leg_three_flames', name: 'Staff of Three Flames', slot: 'weapon', cls: ['arcanist'], hand: 'two', chapter: 4, look: { held: { id: 'staff_orb', color: '#ff7a2a', color2: '#ffd060' } }, stats: { power: PW(4) + 4, spell: PW(4) }, effect: { id: 'splitbolt', n: 3 } },
  { id: 'leg_mercy', name: 'Mercy of Millbrook', slot: 'offhand', cls: ['warden'], hand: 'off', offKind: 'shield', chapter: 1, look: { offhand: { id: 'kite_shield', color: '#e8dcc0', emblem: 'sun' } }, stats: { def: DEF(1, 1.6), block: 10 }, effect: { id: 'blockheal', amount: 0.04 } },
  { id: 'leg_rook_ring', name: "Grell's Lucky Hook", slot: 'trinket', cls: ['vanguard', 'duelist', 'arcanist', 'warden'], chapter: 2, look: { accessory: { id: 'g5_torc', color: '#2a2a30' } }, stats: { crit: 6 }, effect: { id: 'leech', amount: 0.05 } },
  { id: 'leg_last_bell', name: 'The Last Bell', slot: 'trinket', cls: ['vanguard', 'duelist', 'arcanist', 'warden'], chapter: 5, look: { accessory: { id: 'pendant', color: '#ffe080' } }, stats: { hp: 60 }, effect: { id: 'extralife' } },
];
for (const it of LEGEND) items.push({ ...it, set: 'Legendary', legendary: true });

const doc = {
  _doc: 'Generated by tools/build-items.mjs — edit the tables there, not this file. Common numbers; rarity scales them (js/sim/items.js).',
  rarity: [
    { id: 'common', name: 'Common', mul: 1, lines: 0, color: '#c8c4bc' },
    { id: 'fine', name: 'Fine', mul: 1.15, lines: 1, color: '#7ad070' },
    { id: 'rare', name: 'Rare', mul: 1.35, lines: 2, color: '#5aa8f0' },
    { id: 'storied', name: 'Storied', mul: 1.6, lines: 3, color: '#c07af0' },
    { id: 'legendary', name: 'Legendary', mul: 1.9, lines: 3, color: '#f0a030' },
  ],
  // Bonus lines a Fine+ item rolls (per chapter scale = 1 + chapter * 0.6).
  bonus: [
    { stat: 'power', min: 1, max: 3 }, { stat: 'def', min: 1, max: 3 }, { stat: 'hp', min: 6, max: 14 },
    { stat: 'mp', min: 5, max: 12 }, { stat: 'crit', min: 1, max: 3 }, { stat: 'regen', min: 0.5, max: 1.2 },
    { stat: 'mpRegen', min: 0.3, max: 0.8 }, { stat: 'spell', min: 1, max: 4 },
  ],
  // Rarity odds by chapter (weights for common..legendary-sized storied; true legendaries are their own drops).
  odds: [[70, 25, 5, 0], [55, 32, 11, 2], [45, 35, 16, 4], [35, 38, 20, 7], [28, 38, 24, 10], [20, 38, 28, 14]],
  items,
};
writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
console.log(`${items.length} items → ${OUT}`);

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(v + (k < 0 ? v * k : (255 - v) * k))));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
}
