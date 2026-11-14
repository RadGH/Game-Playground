// The parts hold: everything you own that is not bolted to the ship — parts, cargo, drones,
// specimens, other ships, and where you stand with each faction.

import { panel, el, btn, toast, fmt, tip } from './dom.js';
import { BLOCKS } from '../data/blocks.js';
import { RARITY_BY_ID, MATERIALS, MAT_ROLES } from '../data/types.js';
import { UNIQUES } from '../data/uniques.js';
import { FACTIONS } from '../data/factions.js';
import { GOODS } from '../sim/economy.js';
import { itemValue } from '../sim/loot.js';
import { cargoUsed, spawnPickup } from '../sim/world.js';

import { itemCard } from './items.js';
import { dronePicker } from './drones-ui.js';
import { shipsTab } from './ships-tab.js';

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
  const T = [['parts', 'Parts'], ['cargo', 'Cargo'], ['drones', 'Drones'], ['ships', 'Ships'], ['rep', 'Factions'], ['finds', 'Crew & finds']];
  const show = (id) => { tab = id; for (const b of tabs.children) b.classList.toggle('on', b.dataset.id === id); draw(); };
  for (const [id, label] of T) { const b = btn(label, () => p.root.showTab(id)); b.dataset.id = id; tabs.append(b); }
  p.root.showTab = show;   // main.js: C / I switch tabs while the hold is open (report #51)
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
      B.append(el('p', {}, `Hold: ${fmt(cargoUsed(G))} / ${fmt(cap)} units`));
      // Rock is the filler for hull frames and cargo bays; switch it off when you only want ore
      const noRock = !!G.settings?.noRock;
      B.append(el('div', { class: 'row wrap' }, el('span', {}, `Collect rock while mining: `), btn(noRock ? 'Off — turn on' : 'On — turn off', () => { (G.settings ||= {}).noRock = !noRock; draw(); }, 'small' + (noRock ? '' : ' on')),
        el('span', { class: 'hint' }, ' Rock builds hull frames and cargo bays.')));
      const t = el('table', { class: 'grid' }, el('tr', {}, el('th', {}, 'What'), el('th', {}, 'Kind'), el('th', {}, 'Units'), el('th', {}, 'About'), el('th', {}, '')));
      const mats = Object.entries(G.cargo).filter(([, v]) => v > 0).sort((x, y) => (MATERIALS[x[0]]?.tier ?? 9) - (MATERIALS[y[0]]?.tier ?? 9) || (MATERIALS[x[0]]?.price || 0) - (MATERIALS[y[0]]?.price || 0));
      const rows = [...mats.map(([k, v]) => [k, v, MATERIALS[k], MATERIALS[k] ? (MATERIALS[k].tier ? `Tier ${'I II III IV V'.split(' ')[MATERIALS[k].tier - 1]} ${MAT_ROLES[MATERIALS[k].role].toLowerCase()}` : 'Filler') : '']),
        ...Object.entries(G.goods).filter(([, v]) => v > 0).map(([k, v]) => [k, v, GOODS[k], 'Trade goods'])];
      for (const [k, v, def, kind] of rows) {
        const tr = el('tr', {}, el('td', { style: `color:${def?.color || '#dfe8f6'}` }, def?.name || k), el('td', { class: 'hint' }, kind), el('td', {}, fmt(v)), el('td', {}, el('span', { class: 'hint' }, `~${fmt((def?.price || def?.base || 0) * v)} cr`)));
        tr.append(el('td', {}, btn('Dump', () => { if (G.cargo[k] != null) G.cargo[k] = 0; else G.goods[k] = 0; draw(); }, 'small')));
        t.append(tr);
      }
      if (!rows.length) B.append(el('p', { class: 'hint' }, 'Empty. Mine asteroids or buy goods at a market.')); else B.append(t);
    } else if (tab === 'drones') {
      // report #53: choose which drones fly right here — Store, Fly, or Swap one stored drone in for a flying one
      const cap = app.P?.stats.droneCap || 0;
      B.append(dronePicker({ G, cap, onChange: (msg) => { app.refreshDrones?.(); app.save?.(); if (msg) toast(msg, 'good'); } }));
      B.append(el('p', { class: 'hint' }, 'A drone that is shot down is rebuilt by its port, free, after 12 seconds.'));
    } else if (tab === 'ships') {
      // owner 2026-11-13: switch ships and choose mercenary pilots from anywhere, not only at a shipyard
      shipsTab(app, B, draw);
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
      const P = app.P;
      if (P) B.append(el('p', {}, `Crew ${P.crew} — ${P.stats.crewMin} needed to fly, ${P.stats.crewNeed} for full strength, room for ${P.stats.crewCap}.`));
      B.append(el('p', { class: 'hint' }, `Sealed caches waiting to be opened: ${(G.caches || []).length} (any station workshop). Data cores: ${G.dataCores || 0} (research labs).`));
      B.append(uniquesLog(G));
      if (G.specimens.length) B.append(el('h3', {}, 'Alien specimens'));
      for (const s of G.specimens) B.append(el('div', { class: 'card' }, el('b', { style: `color:${FACTIONS[s.faction]?.color}` }, s.name), el('span', { class: 'hint' }, `Worth ~${fmt(s.value)} cr to a lab`)));
    }
  }
  show(tab);
  void toast;
}

/** The collection log of named uniques (owner E4): found ones in colour, the rest as a hint of where to look. */
function uniquesLog(G) {
  const box = el('div', {});
  const got = new Set(G.uniques || []);
  box.append(el('h3', {}, `Named uniques — ${got.size} of ${UNIQUES.length} found`));
  const list = el('div', { class: 'cards' });
  for (const u of UNIQUES) {
    const have = got.has(u.id);
    list.append(el('div', { class: 'card uq' + (have ? ' got' : '') }, el('b', { style: have ? 'color:#ff9a1f' : '' }, have ? u.name : 'Unknown unique'),
      el('div', { class: 'hint' }, have ? u.power : `Found: ${u.where}`)));
  }
  box.append(list);
  return box;
}
