// The parts hold: everything you own that is not bolted to the ship — parts, cargo, drones,
// specimens, other ships, and where you stand with each faction.

import { panel, el, btn, toast, fmt, tip } from './dom.js';
import { BLOCKS } from '../data/blocks.js';
import { RARITY_BY_ID, MATERIALS } from '../data/types.js';
import { DRONES } from '../data/drones.js';
import { FACTIONS } from '../data/factions.js';
import { CLASSES } from '../data/hulls.js';
import { GOODS } from '../sim/economy.js';
import { itemValue } from '../sim/loot.js';
import { cargoUsed, spawnPickup } from '../sim/world.js';

import { itemCard } from './items.js';

function simpleCard(item) {
  const d = BLOCKS[item.block]; const R = RARITY_BY_ID[item.rarity];
  const mods = Object.entries(item.mods || {}).filter(([k]) => !['chain', 'splash', 'pierce', 'burn', 'leech', 'twin', 'bulwark', 'overdrive'].includes(k)).map(([k, v]) => `+${Math.round(v * 100)}% ${k}`).join(', ');
  return `<h4 style="color:${R.color}">${item.name}</h4><div class="hint">${R.name} · ${d.name} · ${d.size}×${d.size}</div><div>${d.blurb || ''}</div>${mods ? `<div class="good">${mods}</div>` : ''}<div class="hint">CPU ${d.cpu || 0} · Power ${d.power || 0} · Worth ~${fmt(itemValue(item))} cr</div>`;
}
// The shared item card is an ELEMENT; the plain HTML card is the fallback if it ever throws.
// (It used to be loaded late and fed to innerHTML, which printed "[object HTMLDivElement]".)
function card(item, actions) {
  try { return itemCard(item, { actions, compact: true }); }
  catch { const c = el('div', { class: 'card', html: simpleCard(item) }); c.append(el('div', { class: 'row end' }, ...actions)); return c; }
}

export function openHold(app, tab = 'parts') {
  const G = app.G;
  const wasMode = app.mode; if (app.mode === 'fly') app.mode = 'paused';
  const p = panel('Parts hold', () => { if (app.mode === 'paused') app.mode = wasMode === 'paused' ? 'fly' : wasMode; });
  const tabs = el('div', { class: 'tabs' }); p.head.insertBefore(tabs, p.head.children[1]);
  const T = [['parts', 'Parts'], ['cargo', 'Cargo'], ['drones', 'Drones'], ['ships', 'Ships'], ['rep', 'Factions'], ['finds', 'Finds']];
  const show = (id) => { tab = id; for (const b of tabs.children) b.classList.toggle('on', b.dataset.id === id); draw(); };
  for (const [id, label] of T) { const b = btn(label, () => show(id)); b.dataset.id = id; tabs.append(b); }
  function draw() {
    const B = p.body; B.innerHTML = '';
    if (tab === 'parts') {
      if (!G.parts.length) { B.append(el('p', { class: 'hint' }, 'No spare parts. Destroyed ships drop them; outfitters sell them.')); return; }
      B.append(el('p', { class: 'hint' }, G.unlocked.build ? 'Fit parts in Build mode (B). Rarer parts hit harder and last longer.' : 'Build mode unlocks soon — keep these for then.'));
      const sorted = [...G.parts].sort((a, b) => (RARITY_BY_ID[b.rarity].index - RARITY_BY_ID[a.rarity].index) || a.block.localeCompare(b.block));
      const grid = el('div', { class: 'cards' });
      for (const it of sorted) {
        grid.append(card(it, [btn('Jettison', () => {
          G.parts.splice(G.parts.indexOf(it), 1);
          if (app.w && app.P && wasMode === 'fly') spawnPickup(app.w, { kind: 'item', item: it, rarity: it.rarity }, app.P.x - Math.cos(app.P.a) * (app.P.r + 30), app.P.y - Math.sin(app.P.a) * (app.P.r + 30), 0, 0, 10);
          draw();
        }, 'small')]));
      }
      B.append(grid);
    } else if (tab === 'cargo') {
      const cap = app.P?.stats.cargo || 0;
      B.append(el('p', {}, `Hold: ${cargoUsed(G)} / ${Math.floor(cap)} units`));
      const t = el('table', { class: 'grid' }, el('tr', {}, el('th', {}, 'What'), el('th', {}, 'Units'), el('th', {}, 'About')), el('tr'));
      const rows = [...Object.entries(G.cargo).map(([k, v]) => [k, v, MATERIALS[k]]), ...Object.entries(G.goods).map(([k, v]) => [k, v, GOODS[k]])].filter(r => r[1] > 0);
      for (const [k, v, def] of rows) {
        const tr = el('tr', {}, el('td', { style: `color:${def?.color || '#dfe8f6'}` }, def?.name || k), el('td', {}, String(v)), el('td', {}, el('span', { class: 'hint' }, `~${fmt((def?.price || def?.base || 0) * v)} cr`)));
        tr.append(el('td', {}, btn('Dump', () => { if (G.cargo[k] != null) G.cargo[k] = 0; else G.goods[k] = 0; draw(); }, 'small')));
        t.append(tr);
      }
      if (!rows.length) B.append(el('p', { class: 'hint' }, 'Empty. Mine asteroids or buy goods at a market.')); else B.append(t);
    } else if (tab === 'drones') {
      const cap = app.P?.stats.droneCap || 0;
      B.append(el('p', {}, `Drone bays: ${cap} drone${cap === 1 ? '' : 's'} can fly with you.`));
      if (!cap) B.append(el('p', { class: 'hint' }, 'Fit a drone bay to carry drones. Drones fly ahead of your ship, ready for action.'));
      const list = el('div', { class: 'cards' });
      G.drones.forEach((k, i) => {
        const D = DRONES[k]; if (!D) return;
        list.append(el('div', { class: 'card' }, el('b', { style: `color:${D.color}` }, D.name), el('div', { class: 'hint' }, D.blurb || ''), el('div', { class: 'hint' }, i < cap ? 'Flies with you' : 'In storage (no bay space)')));
      });
      if (!G.drones.length) list.append(el('p', { class: 'hint' }, G.unlocked.drones ? 'Build drones at a drone shop.' : 'Drone shops unlock as you progress.'));
      B.append(list);
    } else if (tab === 'ships') {
      B.append(el('div', { class: 'card' }, el('b', {}, `${G.ship.name} — ${CLASSES[G.ship.cls].name} (flying)`), el('div', { class: 'hint' }, CLASSES[G.ship.cls].blurb)));
      for (const h of G.hangar) B.append(el('div', { class: 'card' }, el('b', {}, `${h.name} — ${CLASSES[h.cls].name}`), el('div', { class: 'hint' }, 'Stored at shipyards. Swap ships at any shipyard.')));
      if (G.designs.length) { B.append(el('h3', {}, 'Saved designs')); for (const d of G.designs) B.append(el('div', { class: 'hint' }, `${d.name} (${CLASSES[d.cls]?.name || d.cls})`)); }
    } else if (tab === 'rep') {
      const t = el('table', { class: 'grid' }, el('tr', {}, el('th', {}, 'Faction'), el('th', {}, 'Standing'), el('th', {}, '')));
      for (const [id, F] of Object.entries(FACTIONS)) {
        const r = G.rep[id] ?? 0; const word = r >= 50 ? 'Allied' : r >= 15 ? 'Friendly' : r > -15 ? 'Neutral' : r > -40 ? 'Unfriendly' : 'Hostile';
        const row = el('tr', {}, el('td', { style: `color:${F.color}` }, F.name), el('td', { class: r < -15 ? 'bad' : r > 15 ? 'good' : '' }, `${word} (${r})`), el('td', { class: 'hint' }, F.human ? '' : 'alien'));
        tip(row, `<b>${F.name}</b><div>${F.blurb}</div><div class="hint">Rivals: ${F.rivals.map(x => FACTIONS[x].short).join(', ')} — hurting a faction pleases its rivals.</div>`);
        t.append(row);
      }
      B.append(t);
    } else if (tab === 'finds') {
      B.append(el('p', {}, `Rescued: ${G.stats.rescued} people · Passengers waiting for a bunk: ${G.passengers || 0}`));
      if (!G.specimens.length) B.append(el('p', { class: 'hint' }, 'No alien specimens yet. Alien ships sometimes drop them; research labs pay well.'));
      for (const s of G.specimens) B.append(el('div', { class: 'card' }, el('b', { style: `color:${FACTIONS[s.faction]?.color}` }, s.name), el('span', { class: 'hint' }, `Worth ~${fmt(s.value)} cr to a lab`)));
      if (G.claims.length) { B.append(el('h3', {}, 'Mining claims')); for (const c of G.claims) B.append(el('div', {}, `${c.name}: ${MATERIALS[c.mat]?.name || c.mat}, about ${c.rate.toFixed(1)} a minute (${Math.floor(c.store || 0)} waiting)`)); }
    }
  }
  show(tab);
  void toast;
}
