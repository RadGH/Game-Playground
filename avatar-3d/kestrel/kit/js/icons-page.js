// Kestrel kit — icons.html (batch 5): Thousandvale's gear icons for a list of worn items, through the game's own
// ui/item-icons.js (so the picture is exactly what the bag will show). ?chars=kestrel switches the mannequin.
import { iconFor, onIcon, iconsActive, loadLooks, specFor } from '../../../../prototypes/thousandvale/js/client/ui/item-icons.js';
import { KESTREL } from '../../../../prototypes/thousandvale/js/client/chars-mode.js';

// one or more items per frame the icons use (head → bust, chest → torso, legs, feet, hands, back, waist, neck)
const ITEMS = [
  { uid: 'h1', name: 'War Helm', baseKey: 'war_helm', slot: 'head', type: 'armor', tier: 'heavy', rarity: 'normal' },
  { uid: 'h2', name: 'Cloth Hood', baseKey: 'cloth_helm', slot: 'head', type: 'armor', tier: 'cloth', rarity: 'normal' },
  { uid: 'h3', name: 'Leather Cap', baseKey: 'light_helm', slot: 'head', type: 'armor', tier: 'light', rarity: 'normal' },
  { uid: 'h4', name: 'Wyrmscale Helm', baseKey: 'wyrmscale_helm', slot: 'head', type: 'armor', tier: 'plate', rarity: 'rare' },
  { uid: 'c1', name: 'Cloth Robe', baseKey: 'cloth_chest', slot: 'chest', type: 'armor', tier: 'cloth', rarity: 'normal' },
  { uid: 'c2', name: 'Plate Cuirass', baseKey: 'plate_chest', slot: 'chest', type: 'armor', tier: 'plate', rarity: 'normal' },
  { uid: 'c3', name: 'Leather Jerkin', baseKey: 'light_chest', slot: 'chest', type: 'armor', tier: 'light', rarity: 'normal' },
  { uid: 'c4', name: 'Chainmail', baseKey: 'medium_chest', slot: 'chest', type: 'armor', tier: 'medium', rarity: 'magic' },
  { uid: 'l1', name: 'Greaves', baseKey: 'heavy_legs', slot: 'legs', type: 'armor', tier: 'heavy', rarity: 'normal' },
  { uid: 'l2', name: 'Trousers', baseKey: 'light_legs', slot: 'legs', type: 'armor', tier: 'light', rarity: 'normal' },
  { uid: 'f1', name: 'Boots', baseKey: 'light_feet', slot: 'feet', type: 'armor', tier: 'light', rarity: 'normal' },
  { uid: 'f2', name: 'Sabatons', baseKey: 'heavy_feet', slot: 'feet', type: 'armor', tier: 'heavy', rarity: 'normal' },
  { uid: 'f3', name: 'Sandals', baseKey: 'cloth_feet', slot: 'feet', type: 'armor', tier: 'cloth', rarity: 'normal' },
  { uid: 'g1', name: 'Leather Gloves', baseKey: 'light_hands', slot: 'hands', type: 'armor', tier: 'light', rarity: 'normal' },
  { uid: 'g2', name: 'Gauntlets', baseKey: 'heavy_hands', slot: 'hands', type: 'armor', tier: 'heavy', rarity: 'normal' },
  { uid: 'b1', name: 'Travel Cloak', baseKey: 'travel_cloak', slot: 'back', type: 'armor', rarity: 'normal', look: { cape: { id: 'travel_cloak', color: '#3a5a3a' } } },
  { uid: 'b2', name: 'Trail Rucksack', baseKey: 'trail_rucksack', slot: 'back', type: 'armor', rarity: 'magic', pack: true, look: { g5: 'g5_pack_rucksack' }, g5: 'g5_pack_rucksack' },
  { uid: 'w1', name: 'Belt', baseKey: 'belt', slot: 'belt', type: 'armor', rarity: 'normal' },
];

document.getElementById('mode').textContent = KESTREL ? 'Kestrel mannequin (?chars=kestrel)' : 'Chibi 2.5 mannequin';
const grid = document.getElementById('grid'), cells = new Map();
const state = window.__icons = { ready: false, done: 0, total: ITEMS.length, specs: {} };
for (const it of ITEMS) {
  const c = document.createElement('div'); c.className = 'icon-cell';
  c.innerHTML = `<div class="slot"></div><div class="name">${it.name}</div><div class="frame"></div>`;
  grid.append(c); cells.set(it.uid, c);
}
function draw() {
  let done = 0;
  for (const it of ITEMS) {
    const c = cells.get(it.uid), url = iconFor(it), spec = specFor(it);
    if (spec) { c.querySelector('.frame').textContent = spec.kind + (spec.frame ? ' · ' + spec.frame : ''); state.specs[it.uid] = { kind: spec.kind, frame: spec.frame || null, parts: spec.parts || null }; }
    if (url) { done++; const slot = c.querySelector('.slot'); if (!slot.firstChild || slot.firstChild.src !== url) { slot.innerHTML = ''; const im = new Image(); im.src = url; slot.append(im); } }
  }
  state.done = done;
  document.getElementById('status').textContent = `${done} / ${ITEMS.length} drawn`;
  if (done === ITEMS.length) state.ready = true;
}
onIcon(() => draw());
iconsActive(true, 'kestrel-icons');
await loadLooks();
draw();
window.__icons.parts = () => Object.fromEntries(ITEMS.map(it => [it.name, specFor(it)?.parts || null]));
