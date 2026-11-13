// The workshop (owner ruling E9 + play-test #25): craft parts and drones from ore, re-roll one bonus on a
// part, and crack open sealed caches. Opened as the station's "Workshop" tab, or from the ☰ menu out in
// space when a Fabricator part is fitted (out of combat; on-board fabricators make lower-tier parts only).
// The maths lives in sim/craft.js; this file only draws it.

import { el, btn, toast, fmt, panel, showSelected, esc } from './dom.js';
import { droneRows } from './drones-ui.js';
import { itemCard, SLOTS, rarityColor } from './items.js';
import { BLOCKS } from '../data/blocks.js';
import { DRONES } from '../data/drones.js';
import { MATERIALS, RARITY_BY_ID, matTier } from '../data/types.js';
import { CLASSES } from '../data/hulls.js';
import { recipe, droneRecipe, craftCost, craftOdds, craft, craftDrone, missing, MAX_BOOST, rerollable, rerollCost, reroll, openCache, cacheFee, cacheOdds, craftable, partMatTier } from '../sim/craft.js';
import { spinReel, reelResult } from './reel.js';
import { rng, hash } from '../core/math.js';
import { reveal, worthRevealing } from './reveal.js';
import { play } from '../core/audio.js';

const AFFIX_WORD = { dmg: 'damage', rate: 'fire rate', range: 'range', hp: 'block health', shield: 'shield strength', regen: 'shield recharge', power: 'less power used', output: 'power made', thrust: 'thrust', turn: 'turning', cargo: 'cargo', repair: 'repair speed', scan: 'scan reach', cpu: 'CPU', crew: 'crew room', slots: 'auto slots', drones: 'drones', cpuLess: 'less CPU used' };
const matName = m => m === 'cr' ? 'credits' : MATERIALS[m]?.name || m;
let sub = 'craft', slot = 'weapon';
const boosts = new Map();

/**
 * Draw the workshop into `box`. ctx = { app, G, tierCap (max part tier), sizeCap, edge (rarity bonus from
 * a Forge bay / factory), station (true at a station: caches and re-rolls need one), render() }.
 */
export function drawWorkshop(box, ctx) {
  const { G } = ctx;
  const tabs = [['craft', 'Craft parts'], ['drones', 'Build drones'], ['reroll', 'Re-roll a bonus'], ['caches', `Sealed caches${(G.caches || []).length ? ` (${G.caches.length})` : ''}`]];
  const shown = tabs.filter(([id]) => ctx.station || id === 'craft' || id === 'drones');
  if (!shown.some(([id]) => id === sub)) sub = 'craft';
  box.append(showSelected(el('div', { class: 'tabs st-sub' }, ...shown.map(([id, label]) => btn(label, () => { sub = id; ctx.render(); }, id === sub ? 'on' : '')))));
  if (sub === 'craft') craftTab(box, ctx);
  else if (sub === 'drones') droneTab(box, ctx);
  else if (sub === 'reroll') rerollTab(box, ctx);
  else cacheTab(box, ctx);
}

function costChips(G, cost) {
  const row = el('div', { class: 'ws-cost' });
  for (const [m, n] of Object.entries(cost.mats)) row.append(el('span', { class: 'chip ' + ((G.cargo[m] || 0) >= n ? 'ok' : 'no'), style: `--mc:${MATERIALS[m]?.color || '#ccc'}` }, `${n} ${matName(m)}`, el('small', {}, ` (${fmt(G.cargo[m] || 0)})`)));
  if (cost.cr) row.append(el('span', { class: 'chip ' + (G.credits >= cost.cr ? 'ok' : 'no') }, `${fmt(cost.cr)} cr`));
  return row;
}
function oddsBar(odds) {
  const bar = el('div', { class: 'ws-odds' });
  for (const o of odds) if (o.p >= 0.005) bar.append(el('i', { style: `flex:${o.p};background:${RARITY_BY_ID[o.id].color}`, 'aria-label': `${RARITY_BY_ID[o.id].name} ${Math.round(o.p * 100)}%` }));
  const words = odds.filter(o => o.p >= 0.005 && RARITY_BY_ID[o.id].index >= 2).map(o => `${RARITY_BY_ID[o.id].name} ${o.p < 0.01 ? '<1' : Math.round(o.p * 100)}%`).join(' · ');
  return el('div', {}, bar, el('div', { class: 'hint ws-oddsw' }, words || 'Mostly common and uncommon'));
}
function boostRow(key, tier, ctx) {
  const b = boosts.get(key) || 0;
  const row = el('div', { class: 'row wrap ws-boost' }, el('span', { class: 'hint' }, 'Add exotic ore for better odds: '));
  for (let i = 0; i <= MAX_BOOST; i++) row.append(btn(i ? `+${i}` : 'None', () => { boosts.set(key, i); ctx.render(); }, 'small' + (i === b ? ' on' : '')));
  return { row, b };
}
function landed(ctx, it, what) {
  play(RARITY_BY_ID[it.rarity]?.index >= 4 ? 'legendary' : RARITY_BY_ID[it.rarity]?.index >= 2 ? 'rare' : 'pickup');
  if (worthRevealing(it)) reveal(ctx.app, it, { from: what });
  else toast(`${what}: ${it.name}`, 'loot', rarityColor(it));
  ctx.app.updateQuest?.(); ctx.app.save?.(); ctx.render();
}

function craftTab(box, ctx) {
  const { G } = ctx;
  box.append(el('h3', { class: 'st-h' }, 'Craft parts from ore'), el('p', { class: 'hint' }, `Parts here are made from structural and energy ore of their tier; computing parts need exotic ore. Bonuses are rolled like loot.${ctx.edge ? ' This fabricator adds better odds.' : ''}`));
  box.append(showSelected(el('div', { class: 'tabs st-sub' }, ...SLOTS.map(sl => btn(sl.name, () => { slot = sl.id; ctx.render(); }, sl.id === slot ? 'on' : '')))));
  const sl = SLOTS.find(x => x.id === slot);
  const list = Object.values(BLOCKS).filter(d => craftable(d) && sl.cats.includes(d.cat) && d.tier <= ctx.tierCap && (d.size || 1) <= ctx.sizeCap)
    .sort((a, b) => a.tier - b.tier || (a.size || 1) - (b.size || 1) || a.name.localeCompare(b.name));
  const cards = el('div', { class: 'cards' });
  for (const d of list) {
    const rec = recipe(d.id); const { row, b } = boostRow(d.id, rec.tier, ctx);
    const cost = craftCost(rec, b); const miss = missing(G, cost);
    const card = itemCard(d.id, { compact: true, compare: ctx.app.P || null });
    card.append(costChips(G, cost), row, oddsBar(craftOdds(rec.tier * 2 - 1, b, ctx.edge || 0)));
    card.append(el('div', { class: 'row end it-foot' }, btn('Craft', () => {
      const res = craft(G, rng(hash(G.seed, 'craft', G.stats.crafted || 0, Math.floor(G.playTime * 10))), d.id, b, ctx.edge || 0);
      if (!res.ok) { toast(res.miss ? `Short of ${res.miss.map(([m, n]) => `${fmt(n)} ${matName(m)}`).join(', ')}.` : res.why, 'bad'); return; }
      ctx.app.save?.();   // the part is yours before the reel spins
      spinReel({ odds: craftOdds(rec.tier * 2 - 1, b, ctx.edge || 0), result: reelResult(res.item), label: res.item.name, names: list.map(x => x.name), r: rng(hash(G.seed, 'reel', G.stats.crafted || 0)), heading: `Crafting ${d.name}` })
        .then(() => landed(ctx, res.item, 'Crafted'));
    }, miss.length ? 'off' : 'primary')));
    cards.append(card);
  }
  if (!list.length) cards.append(el('p', { class: 'hint' }, 'Nothing of this kind can be made here.'));
  box.append(cards);
}

function droneTab(box, ctx) {
  const { G } = ctx;
  box.append(el('h3', { class: 'st-h' }, 'Build drones'), el('p', { class: 'hint' }, 'Drones you build go to your drone list; choose which ones fly in the hold (C → Drones). A lost drone is rebuilt by its port for free.'));
  const cards = el('div', { class: 'cards' });
  for (const D of Object.values(DRONES)) {
    if (D.enemy || D.tier > ctx.tierCap) continue;
    const rec = droneRecipe(D.id); const { row, b } = boostRow('drone:' + D.id, rec.tier, ctx);
    const cost = craftCost(rec, b); const miss = missing(G, cost);
    const have = (G.droneItems || []).filter(x => x.kind === D.id).length;
    cards.append(el('div', { class: 'card' }, el('h4', { style: `color:${D.color}` }, D.name), el('div', { class: 'hint' }, D.blurb), el('div', { class: 'kv', html: droneRows({ kind: D.id, rarity: 'common' }).map(([a, v]) => `<span>${esc(a)}</span><span>${v}</span>`).join('') }), el('div', { class: 'hint' }, `Common numbers shown; rarer rolls are stronger. You own ${have}.`),
      costChips(G, cost), row, oddsBar(craftOdds(rec.tier * 2 - 1, b, ctx.edge || 0)),
      el('div', { class: 'row end' }, btn('Build', () => {
        const res = craftDrone(G, rng(hash(G.seed, 'drone', G.stats.crafted || 0, Math.floor(G.playTime * 10))), D.id, b, ctx.edge || 0);
        if (!res.ok) { toast(res.miss ? `Short of ${res.miss.map(([m, n]) => `${fmt(n)} ${matName(m)}`).join(', ')}.` : res.why, 'bad'); return; }
        const R = RARITY_BY_ID[res.drone.rarity]; ctx.app.save?.();
        spinReel({ odds: craftOdds(rec.tier * 2 - 1, b, ctx.edge || 0), result: res.drone.rarity, label: `${R.index ? R.name + ' ' : ''}${D.name}`, r: rng(hash(G.seed, 'reel', G.stats.crafted || 0)), heading: `Building a ${D.name}`,
          names: Object.values(DRONES).filter(x => !x.enemy).map(x => x.name) }).then(() => {
          play(R.index >= 2 ? 'rare' : 'pickup');
          toast(`${R.index ? R.name + ' ' : ''}${D.name} drone built. Choose it in the hold (C).`, 'good', R.color); ctx.render();
        });
      }, miss.length ? 'off' : 'primary'))));
  }
  box.append(cards);
}

function rerollTab(box, ctx) {
  const { G } = ctx;
  box.append(el('h3', { class: 'st-h' }, 'Re-roll one bonus'), el('p', { class: 'hint' }, 'Pick a bonus on a spare part and roll it again for exotic ore. The new bonus can be any kind that fits the part. Named uniques and named powers cannot be changed.'));
  const parts = G.parts.filter(it => rerollable(it).length).sort((a, b) => (RARITY_BY_ID[b.rarity]?.index || 0) - (RARITY_BY_ID[a.rarity]?.index || 0));
  if (!parts.length) { box.append(el('p', { class: 'hint' }, 'No spare parts with bonuses. Parts fitted to your ship must be taken off in Build mode first.')); return; }
  const cards = el('div', { class: 'cards' });
  for (const it of parts) {
    const cost = rerollCost(it); const miss = missing(G, cost);
    const card = itemCard(it, { compact: true });
    card.append(costChips(G, cost), el('div', { class: 'row wrap' }, ...rerollable(it).map(k => btn(`Re-roll ${AFFIX_WORD[k] || k}`, () => {
      const res = reroll(G, rng(hash(G.seed, 'reroll', G.stats.rerolls || 0, it.uid)), it, k);
      if (!res.ok) { toast(res.miss ? `Short of ${res.miss.map(([m, n]) => `${fmt(n)} ${matName(m)}`).join(', ')}.` : res.why, 'bad'); return; }
      play('rare'); toast(`${it.name}: now ${AFFIX_WORD[res.key] || res.key}`, 'good', rarityColor(it)); ctx.app.save?.(); ctx.render();
    }, 'small' + (miss.length ? ' off' : '')))));
    cards.append(card);
  }
  box.append(cards);
}

function cacheTab(box, ctx) {
  const { G } = ctx;
  box.append(el('h3', { class: 'st-h' }, 'Sealed caches'), el('p', { class: 'hint' }, 'Locked crates from wrecks, vaults and strange places. The workshop cuts them open for a fee: always a rare or better part inside, some ore, and now and then a named unique.'));
  if (!(G.caches || []).length) { box.append(el('p', { class: 'hint' }, 'No caches. Elite ships, bosses, vaults and anomalies drop them.')); return; }
  const cards = el('div', { class: 'cards' });
  G.caches.forEach((c, i) => {
    const fee = cacheFee(c);
    cards.append(el('div', { class: 'card cache-card' }, el('h4', {}, `Sealed cache · tier ${'I II III IV V VI VII VIII IX X'.split(' ')[Math.min(9, (c.tier || 1) - 1)]}`),
      el('div', { class: 'hint' }, 'Something rattles inside.'),
      el('div', { class: 'row end' }, el('span', { class: 'amber' }, `${fmt(fee)} cr`), btn('Open', () => crack(ctx, c, i), G.credits >= fee ? 'primary' : 'off'))));
  });
  box.append(cards);
}

// the cache spins the same rarity reel as crafting (report #62), weighted by the cache's real odds
function crack(ctx, c, i) {
  const { G } = ctx;
  const pool = Object.values(BLOCKS).filter(d => craftable(d) && d.tier <= (c.tier || 1) + 1 && (d.size || 1) <= ctx.sizeCap);
  const r = rng(hash(G.seed, 'cache', G.stats.caches || 0, i, Math.floor(G.playTime)));
  const res = openCache(G, r, c, pool);
  if (!res.ok) { toast(res.miss ? `You need ${fmt(res.miss[0][1])} more credits.` : res.why, 'bad'); return; }
  ctx.app.save?.();
  spinReel({ odds: cacheOdds(c.tier || 1), result: reelResult(res.item), label: res.item.name, names: pool.map(d => d.name), r: rng(hash(G.seed, 'cachereel', G.stats.caches || 0)), heading: 'Cracking a sealed cache' })
    .then(() => { landed(ctx, res.item, 'From a sealed cache'); toast(`Also inside: ${Object.entries(res.ore).map(([m, n]) => `${n} ${matName(m)}`).join(', ')}`, 'good'); });
}

/** The on-board fabricator, from the ☰ menu out in space. */
export function openFabricator(app) {
  const G = app.G; const P = app.P;
  const fab = P?.stats.fab || 0;
  if (!fab) { toast('Fit a Fabricator part to craft out here. Station workshops always can.'); return; }
  if (app.w.t - app.combatOK() < 5) { toast('Too hot — get out of combat first.', 'bad'); return; }
  const wasMode = app.mode; app.mode = 'paused';
  const p = panel('Fabricator', () => { app.mode = wasMode === 'paused' ? 'fly' : wasMode; });
  const ctx = { app, G, tierCap: fab >= 5 ? 6 : 2, sizeCap: CLASSES[G.ship.cls]?.maxBlock || 1, edge: fab >= 5 ? 0.4 : 0, station: false, render: () => { p.body.innerHTML = ''; drawWorkshop(p.body, ctx); } };
  ctx.render();
}
export { partMatTier, matTier };
