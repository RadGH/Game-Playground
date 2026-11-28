#!/usr/bin/env node
// Icon Kit — write the Codex prompt batches for round 3 (owner 2026-11-27: "Generate more icons, all missing spells,
// any missing combination from the matrix … support for items with their own generated glyph"). Writes one folder per
// batch under the given output dir, each with prompt.txt; tools/import-layers.py imports what Codex paints.
//   node iconkit/tools/make-batches.mjs <outDir>
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadKit } from '../js/iconkit.js';
import { bootRules } from '../../prototypes/oathwild/js/rules/boot.js';

const out = process.argv[2]; if (!out) { console.error('usage: make-batches.mjs <outDir>'); process.exit(2); }
const kit = await loadKit({ readJson: async u => JSON.parse(readFileSync(new URL(u), 'utf8')) });
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const STYLE = `Paint GLYPH layers for a fantasy action RPG's icons, using your image generation tool. They sit on a dark stone plate inside a frame (both separate layers — do NOT draw a plate, frame, border, circle or background). Style: hand-painted, chunky, illustrative early-2000s RTS / MMO spell-button art — a real painted ILLUSTRATION (a figure in action, a weapon, a creature, an object, a burst of magic), bold readable silhouette at 40 px, strong value contrast, warm rim light, painterly texture. NOT flat UI symbols, NOT arrows/chevrons/plain rings, NOT diagrams, no text/letters/numbers/watermark. Each file: PNG with a TRANSPARENT background (real alpha), square 1024x1024, subject centred filling about 70% of the canvas. Use the EXACT file names given, in the current folder. After generating, check every file has a real alpha channel and list them.`;

const EL = {
  fire: 'roaring orange-red fire', frost: 'pale blue ice and frost crystals', lightning: 'crackling blue-white lightning',
  arcane: 'swirling violet-pink arcane energy', holy: 'radiant gold-white holy light', nature: 'living green leaves, vines and earth',
  poison: 'sickly green venom and toxic mist', shadow: 'smoky black-violet shadow', physical: 'steel, force and dust (no magic colour)',
};
const MECH = {
  strike: 'a weapon strike or slash wreathed in', bolt: 'a projectile hurtling forward made of', nova: 'an explosive ring bursting outward from a core of',
  area: 'a storm / field covering the ground of', beam: 'a thick searing beam of', leap: 'a warrior leaping high, trailing', dash: 'a figure dashing forward in a streak of',
  buff: 'an empowering aura surrounding a raised fist, glowing with', heal: 'restorative healing hands / a mending wound glowing with', ward: 'a protective barrier or shield made of',
  summon: 'a creature or spirit summoned out of', dot: 'a lingering curse eating away at a target, made of', form: 'a hero changing shape into a beast, wrapped in',
};

// 1) the matrix: every element x mechanic cell with no painted glyph
const m = kit.glyphMatrix();
const cells = [];
for (const e of m.elements) for (const k of Object.keys(m.mechanics)) if (!m.cells[e][k]?.painted?.length) cells.push({ file: `glyph-${e}-${k}.png`, line: `${MECH[k]} ${EL[e]}`, id: `${e}-${k}`, element: e, mechanic: k });
// 2) Oathwild spells still on a fallback glyph
const rules = await bootRules({ seed: 1 });
const seen = new Set(), spells = [];
for (const [cls, c] of Object.entries(rules.data.classes.classes)) for (const n of c.nodes || []) {
  if (n.kind !== 'spell' || !rules.spells[n.spell]) continue;
  const row = { id: n.spell, ...rules.spells[n.spell].base };
  if (seen.has(row.name)) continue; seen.add(row.name);
  const p = kit.iconFor(row, cls);
  if (!p.fallback) continue;
  const el = row.element || 'physical', mech = kit.mechanicOf ? kit.mechanicOf(row) : (p.spec?.mechanic || '');
  spells.push({ file: `glyph-spell-${slug(row.name)}.png`, id: `spell-${slug(row.name)}`, name: row.name, cls, element: el, mechanic: mech, line: `"${row.name}" — a ${c.name} ability (${el}${mech ? `, ${mech}` : ''}): paint what the name says, vividly, with ${EL[el] || EL.physical}` });
}
// 3) items: one glyph per item base the games drop (Emberveil bases in Oathwild's loot tables)
const LT = rules.data.lootTables.kinds, bases = rules.data.items;
const itemKeys = [...new Set([...LT.weapon, ...LT.armour, ...LT.jewellery, ...LT.magic])];
const items = itemKeys.map(k => { const b = bases.weaponBases[k] || bases.armorBases[k] || bases.accessoryBases?.[k] || {}; return { file: `item-${slug(k)}.png`, id: `item-${slug(k)}`, base: k, line: `${b.name || k} — a single ${b.name || k.replace(/_/g, ' ')} (${b.tier ? `${b.tier} ` : ''}${b.slot || b.type || 'item'}), shown as a clean three-quarter view of the object alone, well lit, iconic, no hands, no background` }; });

const ITEM_STYLE = STYLE.replace('icons. They sit on a dark stone plate inside a frame', 'ITEM icons (gear in a bag). They sit on a dark plate inside a square item frame');
const FRAME_ITEM = `\n\nALSO make these two FRAME files (ONLY the border — fully transparent inside and outside, 1024x1024, centred, edge at ~97%):\n- frame-item-square.png — a square item-slot frame with slightly rounded corners, bevelled brushed SILVER-GREY metal (neutral, no colour — the game tints it by item rarity), thickness ~6% of the width, small corner rivets.\n- frame-item-circle.png — the same metal as a round ring (for jewellery), thickness ~6%.`;
const batches = [];
const chunk = (list, n) => { const o = []; for (let i = 0; i < list.length; i += n) o.push(list.slice(i, i + n)); return o; };
chunk(cells, 27).forEach((b, i) => batches.push({ id: `matrix-${i + 1}`, style: STYLE, rows: b }));
chunk(spells, 29).forEach((b, i) => batches.push({ id: `spells-${i + 1}`, style: STYLE, rows: b }));
chunk(items, 26).forEach((b, i) => batches.push({ id: `items-${i + 1}`, style: ITEM_STYLE + (i === 0 ? FRAME_ITEM : ''), rows: b }));
for (const B of batches) {
  const d = join(out, B.id); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'prompt.txt'), `${B.style}\n\nMake these:\n${B.rows.map((r, i) => `${i + 1}. ${r.file} — ${r.line}.`).join('\n')}\n`);
  writeFileSync(join(d, 'rows.json'), JSON.stringify(B.rows, null, 1));
}
console.log(batches.map(b => `${b.id}: ${b.rows.length}`).join('\n'), `\ncells ${cells.length} · spells ${spells.length} · items ${items.length}`);
