// Your outpost's screen (play-test #39; ruling E3). Opened instead of a station's shops when you dock at an
// outpost you founded (main.js dockAt), and the "Found an outpost" dialog when you press Use over a planet.
//   Stored here — what the modules made while you were away (bars against the storage cap) and Collect all.
//   Modules     — build / upgrade each one: what it makes now, what the next level makes, and the cost with what
//                 you have against what it needs.
//   Defence     — the next raid (warned 3 minutes ahead) and how the turrets would do while you are away.

import { panel, modal, el, btn, toast, banner, fmt } from './dom.js';
import { MATERIALS, matTier } from '../data/types.js';
import { cargoUsed } from '../sim/world.js';
import { playerShip } from '../sim/state.js';
import {
  MODULES, MODULE_IDS, MAX_LEVEL, moduleCost, foundCost, shortOf, levelOf, capOf, storedMats, produce, collectAll, buildModule,
  found, cannotFound, raidOdds, refreshOutpost, hasStore, colonyAt,
} from '../sim/colony.js';

ensureCss();

/** The outpost screen. st = the outpost's station body (st.colony = its id). */
export function openColony(app, st, onUndock) {
  const G = app.G; const c = (G.colonies || []).find(x => x.id === st.colony);
  if (!c) { onUndock(); return null; }
  const p = panel(c.name, () => onUndock(), { closeLabel: 'Undock', cls: 'station colony' });
  const info = el('div', { class: 'st-info' });
  p.head.insertBefore(info, p.head.children[1]);
  const content = el('div', { class: 'st-content co-content' });
  p.body.append(content);
  const cap = () => Math.floor(playerShip(G).stats.cargo);
  const done = (msg, kind = 'good') => { if (msg) toast(msg, kind); app.save?.(); render(); };

  function render() {
    const scroll = p.body.scrollTop;
    produce(c, G.playTime || 0);
    info.innerHTML = '';
    info.append(el('span', { class: 'stat amber' }, `${fmt(G.credits)} cr`),
      el('span', { class: 'stat' + (cargoUsed(G) >= cap() ? ' bad' : '') }, `Hold ${fmt(cargoUsed(G))}/${fmt(cap())}`),
      el('span', { class: 'stat' }, `Danger ${c.tier} · tier ${['', 'I', 'II', 'III', 'IV', 'V'][matTier(c.tier)]} materials`));
    content.innerHTML = '';
    storeSection(content);
    modulesSection(content);
    defenceSection(content);
    p.body.scrollTop = scroll;
  }

  function storeSection(box) {
    const C = capOf(c); const S = c.store;
    box.append(el('h3', { class: 'st-h' }, 'Stored here'));
    const card = el('div', { class: 'card co-store' });
    card.append(el('div', { class: 'co-bars' },
      bar('Ore', storedMats(c), C.mats, '#c0805a'), bar('Parts', S.items.length, C.items, '#4da6ff'),
      bar('Credits', S.cr || 0, C.cr, '#ffd84a'), bar('Research points', S.rp || 0, C.rp, '#c48cff')));
    const mats = Object.entries(S.mats).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    if (mats.length) card.append(el('div', { class: 'co-chips' }, ...mats.map(([m, n]) => el('span', { class: 'co-chip', style: `border-color:${MATERIALS[m]?.color}` }, el('i', { style: `background:${MATERIALS[m]?.color}` }), `${MATERIALS[m]?.name || m} ${fmt(n)}`))));
    if (S.items.length) card.append(el('div', { class: 'hint' }, `Parts: ${S.items.map(i => i.name).slice(0, 4).join(', ')}${S.items.length > 4 ? ` and ${S.items.length - 4} more` : ''}`));
    const room = Math.max(0, cap() - cargoUsed(G));
    const any = hasStore(c);
    card.append(el('div', { class: 'row wrap' },
      btn('Collect all', () => {
        if (!any) return toast('Nothing to collect yet. Modules keep working while you fly.');
        const got = collectAll(G, c, room);
        const bits = [got.n && `${fmt(got.n)} ore`, got.items && `${got.items} part${got.items > 1 ? 's' : ''}`, got.cr && `${fmt(got.cr)} cr`, got.rp && `${got.rp} research points`].filter(Boolean);
        done(bits.length ? `Collected ${bits.join(', ')}${got.left ? ` — ${fmt(got.left)} ore left (hold full)` : ''}` : 'Your hold is full.', bits.length ? 'good' : 'bad');
      }, any ? 'primary big' : 'big off'),
      el('span', { class: 'hint' }, any ? `Ore goes to your hold (room for ${fmt(room)}), parts to your parts hold, research points to your research.` : 'Empty. Output piles up while you play, up to the storage limit.')));
    box.append(card);
  }

  function modulesSection(box) {
    box.append(el('h3', { class: 'st-h' }, 'Modules'));
    const mt = matTier(c.tier);
    const cards = el('div', { class: 'cards co-mods' });
    for (const kind of MODULE_IDS) {
      const M = MODULES[kind]; const L = levelOf(c, kind);
      const card = el('div', { class: 'card co-mod' + (L ? ' built' : '') });
      card.append(el('div', { class: 'co-mod-head' }, el('b', {}, M.name), pips(L)));
      card.append(el('div', { class: 'hint' }, M.blurb + (kind === 'ore' ? ` This planet: ${c.ores.map(m => MATERIALS[m]?.name || m).join(', ')}.` : '')));
      const now = L ? rateText(kind, L, mt) : 'Not built';
      card.append(el('div', { class: 'kv', html: `<span>Now</span><span>${now}</span>` + (L < MAX_LEVEL ? `<span>Level ${L + 1}</span><span class="good">${rateText(kind, L + 1, mt)}</span>` : '') }));
      if (L < MAX_LEVEL) {
        const cost = moduleCost(kind, L + 1, mt); const short = shortOf(G, cost);
        card.append(costRow(G, cost));
        card.append(btn(`${L ? 'Upgrade' : 'Build'} (${fmt(cost.cr)} cr)`, () => {
          const why = buildModule(G, c, kind); if (why) return toast(why, 'bad');
          if (kind === 'turrets') refreshOutpost(app, c);
          done(`${M.name} ${L ? `upgraded to level ${L + 1}` : 'built'}.`);
        }, short.length ? 'off' : 'primary'));
      } else card.append(el('div', { class: 'good' }, 'Top level.'));
      cards.append(card);
    }
    box.append(cards);
  }

  function defenceSection(box) {
    box.append(el('h3', { class: 'st-h' }, 'Defence'));
    const R = c.raid || {}; const now = G.playTime || 0;
    const L = levelOf(c, 'turrets');
    box.append(el('div', { class: 'card' },
      el('div', { class: R.warned ? 'bad' : '' }, R.live ? 'Raiders are attacking right now. Undock and drive them off.' : R.warned ? `Raiders arrive in ${clock(Math.max(0, R.at - now))}.` : 'No raiders sighted. You get a 3-minute warning before any raid.'),
      el('div', { class: 'kv', html: `<span>Turrets</span><span>${MODULES.turrets.rate(L)}</span><span>While you are away</span><span>${raidOdds(c)}</span><span>If you are here</span><span>Fight them at the outpost (its turrets help) for their loot and a bonus.</span>` }),
      el('div', { class: 'hint' }, 'An outpost is never destroyed. Raids only take from what is stored, so collecting often keeps it safe.')));
  }

  render();
  return p;
}

/** Use over a planet: what founding an outpost here costs, what you have, and a Found button. */
export function foundDialog(app, planet) {
  const G = app.G; const sys = app.galaxy.systems[G.system];
  if (colonyAt(G, sys.id, planet.id)) return;
  modal(`Found an outpost on ${planet.name}`, (box, close) => {
    box.classList.add('co-found');
    const cost = foundCost(sys.tier);
    box.append(el('p', {}, 'A small station in orbit that you manage from its own screen: dig ore, research, make parts and earn credits while you are away. Raiders sometimes come for what it stores.'),
      el('div', { class: 'kv', html: `<span>Ores below</span><span>${(planet.ores || []).map(m => MATERIALS[m]?.name || m).join(', ') || 'Rock'}</span><span>Danger</span><span>${sys.tier}</span>` }),
      el('h3', { class: 'st-h' }, 'Cost'), costRow(G, cost));
    const why = cannotFound(G, sys.id, planet, sys.tier);
    if (why) box.append(el('div', { class: 'bad hint' }, why));
    box.append(el('div', { class: 'row end' }, btn('Not now', close), btn(`Found outpost (${fmt(cost.cr)} cr)`, () => {
      const res = found(G, sys, planet);
      if (res.why) return toast(res.why, 'bad');
      close();
      refreshOutpost(app, res.colony);
      banner(`${res.colony.name} founded`, 'Dock at it to build an Ore site, a lab, a factory and more.');
      app.save?.(); app.updateQuest?.();
    }, why ? 'off' : 'primary')));
  });
}

// ------------------------------------------------------------------ bits
function rateText(kind, L, mt) {
  const v = MODULES[kind].rate(L, mt);
  if (kind === 'storage') return `${v}× room`;
  if (kind === 'turrets') return `${v} turrets`;
  return `${fmt(v)} ${v === 1 ? MODULES[kind].unit.replace(/^parts /, 'part ') : MODULES[kind].unit}`;
}
function costRow(G, cost) {
  const items = [el('span', { class: 'co-cost' + (G.credits >= cost.cr ? '' : ' bad') }, `${fmt(cost.cr)} cr`)];
  for (const [m, n] of Object.entries(cost.mats)) {
    const have = G.cargo[m] || 0;
    items.push(el('span', { class: 'co-cost' + (have >= n ? '' : ' bad') }, el('i', { style: `background:${MATERIALS[m]?.color}` }), `${MATERIALS[m]?.name || m} ${fmt(have)}/${fmt(n)}`));
  }
  return el('div', { class: 'co-costs' }, ...items);
}
function bar(label, v, max, color) {
  const k = Math.max(0, Math.min(1, v / Math.max(1, max)));
  return el('div', { class: 'co-bar' }, el('div', { class: 'co-bar-top' }, el('span', {}, label), el('b', { class: k >= 1 ? 'bad' : '' }, `${fmt(v)} / ${fmt(max)}`)),
    el('div', { class: 'co-bar-track' }, el('i', { style: `width:${(k * 100).toFixed(1)}%;background:${color}` })));
}
function pips(L) { return el('span', { class: 'co-pips' }, ...[1, 2, 3].map(i => el('i', { class: i <= L ? 'on' : '' }))); }
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function ensureCss() {
  if (typeof document === 'undefined' || document.getElementById('vw-expansion-css')) return;
  const l = document.createElement('link'); l.id = 'vw-expansion-css'; l.rel = 'stylesheet';
  l.href = new URL('../../css/expansion.css', import.meta.url).href;
  document.head.append(l);
}
