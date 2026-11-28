// Icon Kit — the drawn item layers (round 3): the neutral silver item frames (square + round, tinted by rarity in the
// kit), the dark item plates, and one stand-in glyph per item base until Codex's item paintings are imported.
//
//   node iconkit/tools/make-item-placeholders.mjs
//
// The stand-in glyphs ARE the old item pictures: Oathwild's line glyphs (sword, axe, bow… — prototypes/oathwild
// js/client/ui/icons.js) and the Codex-drawn SVG item art from icons/ (ring, amulet, focus, potion, quest item), redrawn
// on the kit's 100x100 canvas, centred. It also writes / merges data/items.json: one row per Oathwild item base
// ({ id: 'item-<base>', base, name, slot, subtype, shape, placeholder }) plus the fallbacks by subtype and slot. Rows that
// tools/import-layers.py has already given a painting (file, small, fit) keep them. Safe to run more than once.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { glyph } from '../../prototypes/oathwild/js/client/ui/icons.js';
import { ITEM_ART } from '../../icons/js/game-icons.js';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'layers/placeholder');
mkdirSync(OUT, { recursive: true });
const svg = (body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="256" height="256">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
const lin = (id, stops, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;

// ---- frames: brushed silver-grey, light enough that the kit's multiply tint shows the rarity colour ------------------
// opening (inner edge) at 0.425 of the canvas from the centre: outer edge 48, ring ~6.5 thick
const SILVER = lin('sv', [[0, '#ffffff'], [0.3, '#d6d6d6'], [0.55, '#8e8e8e'], [0.8, '#c9c9c9'], [1, '#6e6e6e']], 1, 1);
const SILVER_IN = lin('svi', [[0, '#4a4a4a'], [1, '#f2f2f2']], 1, 1);
const rivet = (x, y) => `<circle cx="${x}" cy="${y}" r="1.9" fill="#f4f4f4" stroke="#1a1a1a" stroke-width=".7"/><circle cx="${x - 0.5}" cy="${y - 0.5}" r=".7" fill="#fff"/>`;
const frameSquare = svg(`
  <path fill-rule="evenodd" fill="url(#sv)" d="M9 2H91A7 7 0 0 1 98 9V91A7 7 0 0 1 91 98H9A7 7 0 0 1 2 91V9A7 7 0 0 1 9 2ZM11.5 7.5H88.5A4 4 0 0 1 92.5 11.5V88.5A4 4 0 0 1 88.5 92.5H11.5A4 4 0 0 1 7.5 88.5V11.5A4 4 0 0 1 11.5 7.5Z"/>
  <rect x="7.5" y="7.5" width="85" height="85" rx="4" fill="none" stroke="url(#svi)" stroke-width="1.2"/>
  <rect x="2" y="2" width="96" height="96" rx="7" fill="none" stroke="#111" stroke-width="1.1"/>
  <rect x="7" y="7" width="86" height="86" rx="4.4" fill="none" stroke="#111" stroke-opacity=".8" stroke-width=".9"/>
  ${[[4.8, 4.8], [95.2, 4.8], [4.8, 95.2], [95.2, 95.2]].map(([x, y]) => rivet(x, y)).join('')}`, SILVER + SILVER_IN);
const frameCircle = svg(`
  <circle cx="50" cy="50" r="45.25" fill="none" stroke="url(#sv)" stroke-width="5.5"/>
  <circle cx="50" cy="50" r="42.6" fill="none" stroke="url(#svi)" stroke-width="1.1"/>
  <circle cx="50" cy="50" r="48" fill="none" stroke="#111" stroke-width="1.1"/><circle cx="50" cy="50" r="42.3" fill="none" stroke="#111" stroke-opacity=".8" stroke-width=".9"/>
  ${[0, 90, 180, 270].map(a => `<g transform="rotate(${a} 50 50)">${rivet(50, 4.8)}</g>`).join('')}`, SILVER + SILVER_IN);

// ---- plates: dark, neutral (never class-tinted), a faint warm top light and a soft grain ------------------------------
const GRAIN = `<filter id="gr" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="3" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .05 0" result="g"/><feComposite in="g" in2="SourceGraphic" operator="in" result="t"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="t"/></feMerge></filter>`;
const DARK = `<radialGradient id="dk" cx=".5" cy=".38" r=".62"><stop offset="0" stop-color="#2e2b27"/><stop offset=".6" stop-color="#1a1816"/><stop offset="1" stop-color="#0b0a09"/></radialGradient>`;
const plateSquare = svg('<rect x="6" y="6" width="88" height="88" rx="5" fill="url(#dk)" filter="url(#gr)"/>', DARK + GRAIN);
const plateCircle = svg('<circle cx="50" cy="50" r="44" fill="url(#dk)" filter="url(#gr)"/>', DARK + GRAIN);

// ---- stand-in glyphs ---------------------------------------------------------------------------------------------------
const EXTRA = {   // a few line glyphs Oathwild never needed, in the same 24-box weight
  helm: '<path d="M5 16c0-6 3-10 7-10s7 4 7 10v3h-4.5v-5h-5v5H5z"/><path d="M12 6v7"/>',
  hood: '<path d="M5.5 19.5c0-7.5 2.5-14 6.5-15 4 1 6.5 7.5 6.5 15"/><path d="M9 19.5c0-4 1.2-7 3-7s3 3 3 7"/>',
  cap: '<path d="M5 15c0-5 3-8.5 7-8.5s7 3.5 7 8.5z"/><path d="M3.5 15h17M12 6.5v8.5"/>',
  robe: '<path d="M9 4l3 2 3-2 3 3-2 3 2.5 10h-13L8 10 6 7z"/><path d="M12 6v14M9.5 13h5"/>',
  legs: '<path d="M7 4h10l1.2 16h-4.4L12 10.5 10.2 20H5.8z"/><path d="M7 7.5h10"/>',
  gloves: '<path d="M8 20v-4.5L5.8 12V7.5a1.1 1.1 0 0 1 2.2 0V11V5.5a1.1 1.1 0 0 1 2.2 0V10V4.8a1.1 1.1 0 0 1 2.2 0V10V6a1.1 1.1 0 0 1 2.2 0v7.5l1.7-1.7a1.2 1.2 0 0 1 1.8 1.6L15 17v3z"/><path d="M8 17.5h7"/>',
  boots: '<path d="M7.5 4h5.5v9.5l5 2.5c1 .6 1.5 1.6 1.5 2.8V20H7.5v-3l.8-3.5z"/><path d="M7.5 17h12"/>',
  quiver: '<path d="M7.5 10l3.5 10.5h3L17.5 10z"/><path d="M10 10L8.5 4M12.5 10V3.5M15 10l1.5-6"/><path d="M7.3 5.2l1.2-1.6 1.4 1.4M11.3 4l1.2-1.6 1.2 1.6M15.3 4.6l1.2-1.4 1.2 1.6"/>',
};
const lineGlyph = id => {
  const inner = EXTRA[id] || (glyph(id, 24).match(/^<svg[^>]*>([\s\S]*)<\/svg>$/) || [])[1];
  if (!inner) throw new Error(`no line glyph "${id}"`);
  // a dark outline under a parchment-gold stroke, 24-box scaled into ~14..86
  const g = (stroke, w) => `<g transform="translate(14 14) scale(3)" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
  return svg(g('#120b05', 3.1) + g('url(#ink)', 1.7), lin('ink', [[0, '#fff1c8'], [0.55, '#e2c27a'], [1, '#b98a3c']]));
};
const artGlyph = key => {
  const a = ITEM_ART[key];
  if (!a) throw new Error(`no item art "${key}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 68 68" width="256" height="256">${a.art}</svg>\n`;   // the 64-box art, a hair of margin
};

/** base -> [line glyph id | 'art:<ITEM_ART key>'] */
const SOURCE = {
  dagger: 'dagger', sword: 'sword', longsword: 'sword', rapier: 'sword', wand: 'wand', scepter: 'scepter', staff: 'staff', quarterstaff: 'staff',
  hammer: 'hammer', warhammer: 'hammer', battleaxe: 'axe', iron_mace: 'mace', sword2h: 'twohand', axe2h: 'axe', halberd: 'spear', spear: 'spear',
  bow: 'bow', shortbow: 'bow', crossbow: 'crossbow', javelin: 'spear', orb: 'orb', tome: 'tome',
  cloth_helm: 'hood', light_helm: 'cap', medium_helm: 'helm', heavy_helm: 'helm',
  cloth_chest: 'robe', light_chest: 'leather', medium_chest: 'mail', heavy_chest: 'plate',
  cloth_legs: 'legs', light_legs: 'legs', medium_legs: 'legs', heavy_legs: 'legs',
  light_gauntlets: 'gloves', medium_gauntlets: 'gloves', heavy_gauntlets: 'gloves', light_boots: 'boots', medium_boots: 'boots', heavy_boots: 'boots',
  buckler: 'shield', shield: 'shield', kite_shield: 'shield', rune_aegis: 'shield', arcane_bulwark: 'shield', warded_focus: 'art:focus', spellguard_orb: 'orb',
  quiver: 'quiver', ring: 'art:ring', gold_signet: 'art:ring', necklace: 'art:amulet', silver_amulet: 'art:amulet',
  quest: 'art:quest_item', potion: 'art:potion', bundle: 'art:bundle',
};
const ROUND = new Set(['ring', 'gold_signet', 'necklace', 'silver_amulet']);
const GENERIC = { quest: { name: 'Quest item', slot: 'quest' }, potion: { name: 'Potion', slot: 'consumable' }, bundle: { name: 'Goods', slot: 'goods' } };

// the bases' names / slots from the shared item catalogue (Oathwild drops Emberveil bases)
const items = JSON.parse(readFileSync(join(ROOT, '../prototypes/emberveil/data/items.json'), 'utf8'));
const baseDef = b => items.weaponBases[b] || items.armorBases[b] || null;
const rowId = b => `item-${b.replace(/_/g, '-')}`;

const files = { 'frame-item-square.svg': frameSquare, 'frame-item-circle.svg': frameCircle, 'plate-item-square.svg': plateSquare, 'plate-item-circle.svg': plateCircle };
const path = join(ROOT, 'data/items.json');
const old = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { items: [] };
const keep = new Map((old.items || []).map(r => [r.id, r]));
const rows = [];
for (const [base, src] of Object.entries(SOURCE)) {
  const id = rowId(base), d = baseDef(base) || GENERIC[base];
  files[`${id}.svg`] = src.startsWith('art:') ? artGlyph(src.slice(4)) : lineGlyph(src);
  const prev = keep.get(id) || {};
  rows.push({
    ...prev, id, base, name: d?.name || base, slot: d?.slot || (d?.type === 'weapon' ? 'weapon' : prev.slot || 'goods'), subtype: d?.subtype || null,
    shape: ROUND.has(base) ? 'circle' : 'square', placeholder: `layers/placeholder/${id}.svg`,
  });
  keep.delete(id);
}
for (const r of keep.values()) rows.push(r);   // rows only the importer knows (a painted base not listed here)
const data = {
  _doc: 'Icon Kit item glyphs (round 3, 2026-11-27). One row per item base: id item-<base with - for _>, the drawn stand-in (`placeholder`, from tools/make-item-placeholders.mjs: the old item pictures) and, once Codex paints it, `file` / `small` / `fit` (tools/import-layers.py). `shape`: round for jewellery. itemIconFor(item) picks base -> subtype -> slot -> generic. Item glyphs share the id space with data/glyphs.json, so a spec can name either.',
  fallbacks: {
    subtype: { sword: 'item-sword', sword2h: 'item-sword2h', axe: 'item-battleaxe', axe2h: 'item-axe2h', mace: 'item-iron-mace', hammer: 'item-hammer', dagger: 'item-dagger', spear: 'item-spear', polearm: 'item-halberd', staff: 'item-staff', bow: 'item-bow', crossbow: 'item-crossbow', wand: 'item-wand', scepter: 'item-scepter', orb: 'item-orb', tome: 'item-tome', javelin: 'item-javelin', ring: 'item-ring', necklace: 'item-necklace', whip: 'item-dagger', club: 'item-iron-mace', glaive: 'item-halberd', scimitar: 'item-sword' },
    slot: { weapon: 'item-sword', mainhand: 'item-sword', head: 'item-medium-helm', chest: 'item-medium-chest', legs: 'item-medium-legs', hands: 'item-medium-gauntlets', feet: 'item-medium-boots', offhand: 'item-shield', ring: 'item-ring', necklace: 'item-necklace', quest: 'item-quest', consumable: 'item-potion' },
    shield: 'item-shield', focus: 'item-warded-focus', quiver: 'item-quiver', quest: 'item-quest', potion: 'item-potion', default: 'item-bundle',
  },
  items: rows,
};
writeFileSync(path, JSON.stringify(data, null, 1) + '\n');
for (const [n, body] of Object.entries(files)) writeFileSync(join(OUT, n), body);
console.log(`wrote ${Object.keys(files).length} item layers and ${rows.length} rows in data/items.json`);
