// The Workshop: craft parts from ore (pick a part, its Mk, and how much better ore to add for better rarity odds),
// and improve parts you own (re-roll the workshop bonus, or try for a better rarity). The maths lives in
// sim/craft.js; the rarity reel is ui/reel.js.

import { el, btn, panel, tabs, toast, num, credits as cr } from './dom.js';
import { itemCard } from './cards.js';
import { recipe, craftCost, craftOdds, craft, shortFor, MAX_BOOST, boostOre, CRAFT_KINDS, rerollCost, rerollBonus, upgradeCost, upgradeOdds, upgradeChance, upgradeRarity, TIER_ORES } from '../sim/craft.js';
import { itemName, rarityOf, bonusText, BONUS_STATS, BONUS_WORDS, BONUS_RANGE, BONUS_RARITY_STEP } from '../sim/items.js';
import { designGrid, save } from '../sim/state.js';
import { BLOCKS, ORES, RARITY, TIER_NAMES, TURRETS } from '../data/blocks.js';
import { spinReel } from './reel.js';
import { rng } from '../core/math.js';
import { fmt } from '../../../../shared/format.js';

const pick = { kind: 'autocannon', tier: 1, boost: 0, part: null };
const pc = p => (p < 0.01 ? `${fmt(p * 100, { decimals: 1 })}%` : `${fmt(p * 100, { decimals: 0 })}%`);

export function openWorkshop(app, redraw) {
  const G = app.G;
  const P = panel('Workshop', redraw, { cls: 'ws-panel', sub: 'Craft parts from ore · improve the parts you own' });
  const credLine = el('div', { class: 'stat amber' }); P.head.insertBefore(credLine, P.head.lastChild);
  const fitted = () => [...designGrid(G).cells.values()].filter(b => b.item).map(b => b.item);
  const fittedSet = () => new Set(fitted().map(i => i.uid));
  let busy = false;
  const r = rng((Date.now() ^ (G.items.length * 7919)) >>> 0);
  credLine.textContent = cr(G.credits);

  function costChips(cost) {
    return el('div', { class: 'ws-cost' },
      ...Object.entries(cost.ore).map(([o, n]) => el('span', { class: 'ws-chip ' + ((G.cargo[o] || 0) >= n ? 'ok' : 'no'), style: `--mc:${ORES[o].color}` }, el('i', {}), `${num(n)} ${ORES[o].name}`, el('small', {}, ` you have ${num(G.cargo[o] || 0)}`))),
      el('span', { class: 'ws-chip ' + (G.credits >= cost.cr ? 'ok' : 'no') }, `${cr(cost.cr)} fee`));
  }
  function oddsBlock(odds, from = 0) {
    const shown = odds.filter(o => o.i >= from);
    return el('div', { class: 'ws-odds-box' },
      el('div', { class: 'ws-odds' }, ...shown.filter(o => o.p > 0.002).map(o => el('i', { style: `flex:${o.p};background:${RARITY[o.i].color}` }))),
      el('div', { class: 'ws-odds-list' }, ...shown.map(o => el('span', { style: `color:${RARITY[o.i].color}` }, `${RARITY[o.i].name} ${pc(o.p)}`))));
  }
  const shortText = short => 'Short of ' + short.map(([k, v]) => (k === 'cr' ? cr(v) : `${num(v)} ${ORES[k].name}`)).join(', ');

  // ---------------------------------------------------------------- craft
  function craftTab(host) {
    const left = el('div', { class: 'ws-kinds section' });
    const groups = [['Turrets', CRAFT_KINDS.filter(k => TURRETS[k])], ['Ship parts', CRAFT_KINDS.filter(k => !TURRETS[k])]];
    for (const [title, list] of groups) {
      left.append(el('h4', {}, title));
      const grid = el('div', { class: 'ws-kind-grid' });
      for (const k of list) grid.append(btn(BLOCKS[k].name, () => { pick.kind = k; T.redraw(); }, 'small' + (pick.kind === k ? ' on' : ''), { 'data-kind': k }));
      left.append(grid);
    }
    const rec = recipe(pick.kind, pick.tier); const cost = craftCost(rec, pick.boost); const short = shortFor(G, cost);
    const odds = craftOdds(G, pick.tier, pick.boost);
    const better = TIER_ORES[pick.tier - 1].boost; const perStep = boostOre(pick.tier)[better];
    const mid = el('div', { class: 'section ws-mid' },
      el('h3', {}, `${BLOCKS[pick.kind].name} ${TIER_NAMES[pick.tier - 1]}`),
      el('span', { class: 'hint' }, `Made from ${TIER_ORES[pick.tier - 1].ore.map(o => ORES[o].name).join(' and ')}`),
      el('h4', {}, 'Mk'),
      el('div', { class: 'seg' }, ...TIER_NAMES.map((t, i) => btn(t, () => { pick.tier = i + 1; T.redraw(); }, pick.tier === i + 1 ? 'on' : '', { 'data-tier': i + 1 }))),
      el('h4', {}, `Better ore for better odds (${num(perStep)} ${ORES[better].name} a step)`),
      el('div', { class: 'seg' }, ...Array.from({ length: MAX_BOOST + 1 }, (_, i) => btn(i ? `+${i}` : 'None', () => { pick.boost = i; T.redraw(); }, pick.boost === i ? 'on' : '', { 'data-boost': i }))),
      el('h4', {}, 'Rarity odds'),
      oddsBlock(odds),
      el('h4', {}, 'Cost'),
      costChips(cost),
      btn(short.length ? shortText(short) : `Craft ${BLOCKS[pick.kind].name} ${TIER_NAMES[pick.tier - 1]}`, () => doCraft(), short.length ? '' : 'primary', { disabled: !!short.length || busy, 'data-act': 'craft' }),
      el('span', { class: 'hint' }, `Every crafted part also rolls one workshop bonus (${fmt(BONUS_RANGE[0] * 100, { decimals: 0 })}-${fmt(BONUS_RANGE[1] * 100, { decimals: 0 })}% at common, +${fmt(BONUS_RARITY_STEP * 100, { decimals: 0 })}% bigger per rarity step): ${BONUS_STATS[pick.kind].map(s => BONUS_WORDS[s]).join(', ')}.`));
    const preview = { uid: -1, kind: pick.kind, tier: pick.tier, rarity: 0 };
    const right = el('div', { class: 'ws-preview' }, el('h4', {}, 'Common version (better rarities are stronger)'), itemCard(preview, { fitted: fitted() }));
    host.append(el('div', { class: 'ws-craft' }, left, mid, right));
  }
  async function doCraft() {
    if (busy) return;
    const out = craft(G, r, pick.kind, pick.tier, pick.boost);
    if (!out.ok) { toast(shortText(out.short), 'bad'); return; }
    busy = true; save(G); credLine.textContent = cr(G.credits);
    await spinReel({ odds: out.odds, result: out.item.rarity, label: itemName(out.item), names: CRAFT_KINDS.map(k => BLOCKS[k].name), r, heading: `Crafting ${BLOCKS[pick.kind].name} ${TIER_NAMES[pick.tier - 1]}` });
    busy = false;
    const R = rarityOf(out.item);
    toast(`Crafted: ${R.name} ${itemName(out.item)} (${bonusText(out.item)})`, 'loot', R.color);
    pick.part = out.item.uid;
    app.redrawStation?.(); T.redraw();
  }

  // ---------------------------------------------------------------- improve
  function improveTab(host) {
    const fs = fittedSet();
    const parts = [...G.items].sort((a, b) => b.rarity - a.rarity || b.tier - a.tier || (fs.has(b.uid) - fs.has(a.uid)) || a.kind.localeCompare(b.kind));
    if (!pick.part || !G.items.some(i => i.uid === pick.part)) pick.part = parts[0]?.uid ?? null;
    const list = el('div', { class: 'section ws-list' }, el('h4', {}, `Your parts (${num(parts.length)})`));
    for (const it of parts) {
      const R = rarityOf(it);
      const b = btn('', () => { pick.part = it.uid; T.redraw(); }, 'ws-part' + (pick.part === it.uid ? ' on' : ''), { 'data-uid': it.uid });
      b.append(el('i', { class: 'b-chip', style: `background:${R.color}` }), el('span', {}, el('b', { style: `color:${R.color}` }, itemName(it)), el('small', {}, `${R.name}${fs.has(it.uid) ? ' · fitted' : ''}${it.bonus ? ' · ' + bonusText(it) : ''}`)));
      list.append(b);
    }
    const it = G.items.find(i => i.uid === pick.part);
    if (!it) { host.append(el('div', { class: 'ws-improve' }, list, el('p', { class: 'hint' }, 'No parts to improve.'))); return; }
    const rc = rerollCost(it), rs = shortFor(G, rc);
    const reroll = el('div', { class: 'section ws-act' },
      el('h3', {}, 'Re-roll the bonus'),
      el('p', {}, it.bonus ? ['Now: ', el('b', { class: 'good' }, bonusText(it))] : 'This part has no workshop bonus yet: a re-roll gives it one.'),
      el('span', { class: 'hint' }, `A new bonus from: ${BONUS_STATS[it.kind].map(s => BONUS_WORDS[s]).join(', ')} — ${fmt(BONUS_RANGE[0] * (1 + it.rarity * BONUS_RARITY_STEP) * 100, { decimals: 1 })}-${fmt(BONUS_RANGE[1] * (1 + it.rarity * BONUS_RARITY_STEP) * 100, { decimals: 1 })}% at ${rarityOf(it).name}. It may land lower than now.`),
      costChips(rc),
      btn(rs.length ? shortText(rs) : 'Re-roll the bonus', async () => {
        const out = rerollBonus(G, r, it); if (!out.ok) return;
        save(G); toast(`New bonus: ${bonusText(it)}${out.before ? ` (was +${fmt(out.before.amount * 100, { decimals: 1 })}% ${BONUS_WORDS[out.before.stat]})` : ''}`, 'good');
        app.redrawStation?.(); T.redraw();
      }, rs.length ? '' : 'primary', { disabled: !!rs.length, 'data-act': 'reroll' }));
    const top = it.rarity >= RARITY.length - 1;
    const uc = top ? null : upgradeCost(it), us = top ? [] : shortFor(G, uc);
    const upgrade = el('div', { class: 'section ws-act' },
      el('h3', {}, 'Try for a better rarity'),
      top ? el('p', { class: 'good' }, 'Already legendary.') : [
        el('p', {}, 'Chance to go up: ', el('b', { class: 'amber' }, pc(upgradeChance(G, it))), '. If the roll is not better, the part stays as it is.'),
        oddsBlock(upgradeOdds(G, it), it.rarity + 1),
        costChips(uc),
        btn(us.length ? shortText(us) : `Roll for better than ${rarityOf(it).name}`, async () => {
          if (busy) return;
          const before = rarityOf(it).name; const out = upgradeRarity(G, r, it); if (!out.ok) return;
          busy = true; save(G); credLine.textContent = cr(G.credits);
          await spinReel({ odds: out.odds, result: out.rolled, label: out.upgraded ? itemName(it) : 'No better: part unchanged', names: [itemName(it)], r, heading: `Improving ${itemName(it)}` });
          busy = false;
          if (out.upgraded) toast(`${itemName(it)} is now ${rarityOf(it).name} (was ${before}).`, 'loot', rarityOf(it).color); else toast(`No luck: ${itemName(it)} stays ${before}.`);
          app.redrawStation?.(); T.redraw();
        }, us.length ? '' : 'gold', { disabled: !!us.length, 'data-act': 'upgrade' })].flat());
    host.append(el('div', { class: 'ws-improve' }, list, el('div', { class: 'ws-sel' }, itemCard(it, { fitted: fitted() })), el('div', { class: 'col' }, reroll, upgrade)));
  }

  const T = tabs(P.body, [
    { id: 'craft', label: 'Craft a part', render: h => { credLine.textContent = cr(G.credits); craftTab(h); } },
    { id: 'improve', label: 'Improve a part', render: h => { credLine.textContent = cr(G.credits); improveTab(h); } },
  ]);
}
