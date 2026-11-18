// The parts dealer (buy what's on the shelves, sell what you don't use) and the workshop (make parts and chips from
// recipes, refit and raise parts, scrap parts for materials). Both are hangar bays (bays.js baySheet).
import { fmt } from '../../../../shared/format.js';
import { ask } from '../../../../shared/dialog.js';
import { RARITY, RARITY_BY_ID } from '../sim/loadout.js';
import { rankOf, dealerStock, bought } from '../sim/progress.js';
import { sellValue, salvageValue, lineText } from '../sim/loot.js';
import { recipeState, canAfford, craft, fabOptions, itemOptions, salvage, COST_KEYS } from '../sim/craft.js';
import { buildsUsing, activeBuild, itemByUid } from '../sim/inventory.js';
import { licenceOf } from '../sim/campaign.js';
import { itemCard, SLOT_LABEL, esc } from './itemcard.js';
import { baySheet, BAY_INFO, click } from './bays.js';
import { play as sound } from '../../../../citykit/js/world/sound.js';

const RANK_ORDER = r => RARITY.findIndex(x => x.id === r);
const MAT = { scrap: 'Scrap', alloy: 'Alloy', exotic: 'Exotic', credits: 'cr' };
/** The fitted item in the active build for a part's slot (for the card's change column). */
function fittedFor(g, part) {
  const b = activeBuild(g.save);
  if (part.slot !== 'weapon') return itemByUid(g.save, b.parts[part.slot]);
  const i = part.mount === 'shoulder' ? 3 : 1;
  return itemByUid(g.save, b.weapons[i]) || itemByUid(g.save, b.weapons[i - 1]);
}
const filterRow = (cur) => `<div class="of-filter" role="group" aria-label="Show">${[['all', 'All'], ['weapon', 'Weapons'], ['frame', 'Frame'], ['inner', 'Inner parts']].map(([id, l]) => `<button type="button" class="of-btn of-chip${cur === id ? ' on' : ''}" data-f="${id}" aria-pressed="${cur === id}">${l}</button>`).join('')}</div>`;
const inFilter = (p, f) => f === 'all' || (f === 'weapon' ? p.slot === 'weapon' : f === 'frame' ? ['head', 'core', 'arms', 'legs'].includes(p.slot) : ['booster', 'generator', 'cooling', 'cpu'].includes(p.slot));

// =====================================================================================================================
export function openDealer(screens, { onClose, onChange } = {}) {
  const g = screens.g, save = g.save;
  let tab = 'buy', filter = 'all';
  const sheet = baySheet(screens, 'dealer', { title: BAY_INFO.dealer.name, tabs: [['buy', 'Buy'], ['sell', 'Sell'], ['licences', 'Licences']], tab, onTab: t => { tab = t; draw(); }, onClose });
  const draw = () => {
    const rk = rankOf(save.xp).rank;
    if (tab === 'buy') {
      const licences = Object.fromEntries(g.MAKERS.map(m => [m.id, licenceOf(save, g.CAMP, m.id)]));
      const stock = dealerStock(g.P, { rank: rk, played: save.played, licences });
      if (save.dealer?.turn !== stock.turn) save.dealer = { turn: stock.turn, sold: [] };
      for (const it of stock.items) if (!save.seen.includes(it.id)) save.seen.push(it.id);   // seen at the dealer = the workshop can build it
      const left = stock.items.filter(it => !save.dealer.sold.includes(it.uid) && inFilter(g.P[it.id], filter));
      const turnsLeft = 2 - (save.played % 2);
      sheet.body.innerHTML = `<p class="of-note">New stock after ${turnsLeft} more mission${turnsLeft > 1 ? 's' : ''}. Better parts come in as your rank rises.</p>${filterRow(filter)}
        <div class="of-grid">${left.length ? left.map(it => itemCard(g, it, { vs: fittedFor(g, g.P[it.id]), extra: `${it.licence ? `<small class="of-lic">On the shelf through your ${esc(g.MAKERS.find(m => m.id === it.licence)?.short)} licence</small>` : ''}<div class="of-buy"><span class="of-price">${it.full ? `<s>${fmt(it.full, { decimals: 0 })}</s> ` : ''}${fmt(it.price, { decimals: 0 })} cr</span><button type="button" class="of-btn of-small of-primary" data-buy="${it.uid}"${save.credits < it.price ? ' disabled' : ''}>${save.credits < it.price ? 'Not enough credits' : 'Buy'}</button></div>` })).join('') : '<p class="of-empty">Sold out. Fly a mission or two for new stock.</p>'}</div>`;
      sheet.body.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => {
        const it = stock.items.find(x => x.uid === b.dataset.buy); if (!it || save.credits < it.price) return;
        save.credits -= it.price; save.items.push(bought(it)); save.dealer.sold.push(it.uid);
        sound('loot.normal', { global: true, gain: 0.5 }); g.saveNow(); onChange?.(); sheet.wallet(); draw();
      }));
    } else if (tab === 'licences') {
      sheet.body.innerHTML = `<p class="of-note">${g.CAMP.licences.text}</p><div class="of-grid of-lics">${g.MAKERS.map(mk => {
        const L = licenceOf(save, g.CAMP, mk.id), next = L.next;
        const prev = g.CAMP.licences.levels[L.level].rep, span = next ? next.rep - prev : 1, into = next ? L.rep - prev : 1;
        return `<article class="of-item of-lic-card" style="--rc:${mk.colours.glow}"><header><b>${esc(mk.name)}</b><small>${L.label}${L.off ? ` · ${Math.round(L.off * 100)}% off their parts` : ''}</small></header>
          <p>${esc(mk.leaning)}</p>
          <div class="of-fw"><i style="--v:${next ? Math.round(into / span * 100) : 100}%"></i>${next ? `${fmt(L.rep, { decimals: 0 })} / ${fmt(next.rep, { decimals: 0 })} reputation` : 'Top licence'}</div>
          <small class="of-used">${next ? `Next: ${next.label} — ${next.extra} of their parts on the shelf up to their tier ${next.tier} designs, ${Math.round(next.off * 100)}% off.` : 'Every design they make can turn up here.'} Earn it by flying ${esc(mk.short)} contracts.</small></article>`;
      }).join('')}</div>`;
    } else {
      const mine = save.items.filter(it => inFilter(g.P[it.id], filter)).sort((a, b) => RANK_ORDER(a.rarity) - RANK_ORDER(b.rarity));
      sheet.body.innerHTML = `<p class="of-note">The dealer pays about a third of what it charges (more for rarer parts). Parts in a saved build can't be sold — take them off first.</p>${filterRow(filter)}
        <div class="of-grid">${mine.map(it => { const used = buildsUsing(save, it.uid); return itemCard(g, it, { compact: true, extra: used.length ? `<small class="of-used">In ${used.map(b => esc(b.name)).join(', ')}</small>` : `<div class="of-buy"><span class="of-price">${fmt(sellValue(g.P[it.id], it), { decimals: 0 })} cr</span><button type="button" class="of-btn of-small" data-sell="${it.uid}">Sell</button></div>` }); }).join('')}</div>`;
      sheet.body.querySelectorAll('[data-sell]').forEach(b => b.addEventListener('click', async () => {
        const it = save.items.find(x => x.uid === b.dataset.sell); if (!it || buildsUsing(save, it.uid).length) return;
        if (RANK_ORDER(it.rarity) >= 2 && !(await ask({ title: `Sell ${g.P[it.id].name}?`, text: `A ${RARITY_BY_ID[it.rarity].label} part. You can't buy it back.`, ok: 'Sell', danger: true }))) return;
        save.credits += sellValue(g.P[it.id], it); save.items = save.items.filter(x => x !== it);
        sound('loot.common', { global: true, gain: 0.5 }); g.saveNow(); onChange?.(); sheet.wallet(); draw();
      }));
    }
    sheet.body.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { click(); filter = b.dataset.f; draw(); }));
  };
  draw();
  return sheet;
}

// =====================================================================================================================
export function openWorkshop(screens, { onClose, onChange } = {}) {
  const g = screens.g, save = g.save;
  let tab = 'craft', sel = null, pick = null, line = 0, made = null;
  const sheet = baySheet(screens, 'workshop', { title: BAY_INFO.workshop.name, tabs: [['craft', 'Make'], ['scrap', 'Scrap parts']], tab, onTab: t => { tab = t; made = null; draw(); }, onClose });
  const costHtml = cost => `<ul class="of-cost">${COST_KEYS.filter(k => cost[k]).map(k => { const have = k === 'credits' ? save.credits : save.mats[k] || 0; return `<li class="${have < cost[k] ? 'of-bad' : ''}"><b>${fmt(cost[k], { decimals: 0 })}</b> ${MAT[k]}<small>have ${fmt(have, { decimals: 0 })}</small></li>`; }).join('')}</ul>`;

  const drawCraft = () => {
    const rk = rankOf(save.xp).rank;
    const list = g.RECIPES.map(r => ({ r, st: recipeState(r, save, rk) })).filter(x => x.st.state !== 'hidden');
    const secrets = g.RECIPES.filter(r => r.state === 'secret'), known = secrets.filter(r => save.learned?.includes(r.id)).length;
    sel ||= list[0].r;
    sheet.body.innerHTML = `<div class="of-shop">
      <section class="of-recipes" aria-label="Recipes">${list.map(({ r, st }) => `<button type="button" class="of-recipe${sel === r ? ' on' : ''}${st.state === 'locked' ? ' of-locked' : ''}${r.state === 'secret' ? ' of-secret' : ''}" data-r="${r.id}"><b>${r.name}</b><small>${st.state === 'locked' ? `Locked: ${st.why}` : r.state === 'secret' ? 'Secret recipe' : r.text.split('.')[0]}</small></button>`).join('')}
        <p class="of-note">Secret recipes: ${known} of ${secrets.length} learned. Schematics turn up in crates; some are taught by an S grade.</p></section>
      <section class="of-recipe-detail" aria-live="polite"></section></div>`;
    sheet.body.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => { click(); sel = g.RECIPES.find(r => r.id === b.dataset.r); pick = null; line = 0; made = null; drawCraft(); }));
    drawDetail(rk);
  };

  const drawDetail = rk => {
    const r = sel, st = recipeState(r, save, rk), box = sheet.body.querySelector('.of-recipe-detail');
    let picker = '', ready = st.state === 'ready';
    if (r.type === 'fabricate') {
      const opts = fabOptions(r, save, g.P).sort((a, b) => (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : a.name < b.name ? -1 : 1));
      pick = opts.find(p => p.id === pick) ? pick : opts[0]?.id;
      picker = opts.length ? `<label class="of-pick"><span>Part</span><select data-pick>${opts.map(p => `<option value="${p.id}"${p.id === pick ? ' selected' : ''}>${SLOT_LABEL[p.slot]}: ${esc(p.name)}</option>`).join('')}</select></label>
        ${pick ? itemCard(g, { id: pick, rarity: r.rarity, rolls: [] }, { vs: fittedFor(g, g.P[pick]), extra: `<p class="of-note">Built ${RARITY_BY_ID[r.rarity].label}: ${RARITY_BY_ID[r.rarity].rolls} random bonus line${RARITY_BY_ID[r.rarity].rolls > 1 ? 's' : ''} on top.</p>` }) : ''}`
        : '<p class="of-empty">You haven\'t seen a part for this yet. Parts you own or see at the dealer can be built here.</p>';
      ready &&= !!pick;
    } else if (r.type === 'crafted') {
      picker = itemCard(g, { id: r.makes, rarity: 'refined', rolls: [] }, { vs: fittedFor(g, g.P[r.makes]), extra: `<p class="of-note">Uses the ${esc(g.P[g.P[r.makes].model]?.name)} frame, with its own numbers. Built Refined.</p>` });
    } else if (r.type === 'refit' || r.type === 'upgrade') {
      const opts = itemOptions(r, save).sort((a, b) => RANK_ORDER(b.rarity) - RANK_ORDER(a.rarity));
      pick = opts.find(i => i.uid === pick) ? pick : opts[0]?.uid;
      const it = opts.find(i => i.uid === pick);
      picker = opts.length ? `<label class="of-pick"><span>Part</span><select data-pick>${opts.map(i => `<option value="${i.uid}"${i.uid === pick ? ' selected' : ''}>${RARITY_BY_ID[i.rarity].label} ${esc(g.P[i.id].name)}${i.rolls.length ? ' — ' + i.rolls.map(lineText).join(', ') : ''}</option>`).join('')}</select></label>
        ${r.type === 'refit' && it ? `<div class="of-lines" role="group" aria-label="Bonus line to re-roll">${it.rolls.map((x, j) => `<button type="button" class="of-btn of-chip${j === line ? ' on' : ''}" data-line="${j}" aria-pressed="${j === line}">${lineText(x)}</button>`).join('')}</div>` : ''}
        ${it ? itemCard(g, it) : ''}`
        : `<p class="of-empty">${r.type === 'refit' ? 'No parts with a bonus line yet.' : 'No parts of the right rarity.'}</p>`;
      ready &&= !!pick;
    } else if (r.type === 'chip') {
      const opts = g.CHIPS.slice().sort((a, b) => (a.rank || 1) - (b.rank || 1));
      pick = opts.find(c => c.id === pick && (c.rank || 1) <= rk) ? pick : opts.find(c => (c.rank || 1) <= rk)?.id;
      picker = `<div class="of-chip-pick">${opts.map(c => { const lk = (c.rank || 1) > rk; return `<button type="button" class="of-item of-chipcard${c.id === pick ? ' on' : ''}" data-chip="${c.id}" style="--rc:${c.colour}"${lk ? ' disabled' : ''}><header><b>${c.name}</b><small>${c.cost} firmware${lk ? ` · Rank ${c.rank}` : ''}</small></header><p>${c.text}</p></button>`; }).join('')}</div>`;
    }
    const can = ready && canAfford(save, r.cost);
    box.innerHTML = `<h3>${r.name}</h3><p>${r.text}</p>${st.state === 'locked' ? `<p class="of-bad">Locked until ${st.why.toLowerCase()}.</p>` : ''}
      ${picker}
      ${costHtml(r.cost)}
      <div class="of-make"><button type="button" class="of-btn of-primary" data-make${can ? '' : ' disabled'}>${st.state === 'locked' ? 'Locked' : !canAfford(save, r.cost) ? 'Not enough materials' : 'Make it'}</button></div>
      ${made ? `<div class="of-made" role="status"><h4>Made</h4>${made}</div>` : ''}`;
    box.querySelector('[data-pick]')?.addEventListener('change', e => { pick = e.target.value; line = 0; made = null; drawDetail(rk); });
    box.querySelectorAll('[data-line]').forEach(b => b.addEventListener('click', () => { click(); line = +b.dataset.line; drawDetail(rk); }));
    box.querySelectorAll('[data-chip]').forEach(b => b.addEventListener('click', () => { click(); pick = b.dataset.chip; drawDetail(rk); }));
    box.querySelector('[data-make]').addEventListener('click', () => {
      const opts = r.type === 'fabricate' ? { partId: pick } : r.type === 'chip' ? { chipId: pick } : { uid: pick, line };
      const out = craft(save, r, opts, { P: g.P, CHIPS: g.CHIPS, rank: rk, seed: (Date.now() ^ (save.played * 2654435761)) >>> 0 });
      if (!out.ok) { made = `<p class="of-bad">${out.why}</p>`; return drawDetail(rk); }
      if (out.item) { if (!save.seen.includes(out.item.id)) save.seen.push(out.item.id); made = (out.before ? `<div class="of-before">${itemCard(g, out.before, { compact: true, tag: '<span class="of-fit-tag">Before</span>' })}</div>` : '') + itemCard(g, out.item, { tag: '<span class="of-fit-tag">New</span>' }); }
      if (out.chip) { const c = g.C[out.chip.id]; made = `<article class="of-item of-chipcard" style="--rc:${c.colour}"><header><b>${c.name}</b><small>${c.cost} firmware</small></header><p>${c.text}</p><p class="of-note">Slot it at the assembly bay.</p></article>`; }
      sound('build.done', { global: true, gain: 0.5 }); g.saveNow(); onChange?.(); sheet.wallet(); drawDetail(rk);
      sheet.body.querySelector('.of-made')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    });
  };

  const drawScrap = () => {
    const spare = save.items.filter(it => !buildsUsing(save, it.uid).length).sort((a, b) => RANK_ORDER(a.rarity) - RANK_ORDER(b.rarity));
    const commons = spare.filter(it => it.rarity === 'common');
    const sum = list => list.reduce((s, it) => { const v = salvageValue(g.P[it.id], it); for (const k in v) s[k] += v[k]; return s; }, { scrap: 0, alloy: 0, exotic: 0 });
    const words = v => Object.entries(v).filter(([, n]) => n).map(([k, n]) => `${fmt(n, { decimals: 0 })} ${MAT[k]}`).join(' · ');
    sheet.body.innerHTML = `<p class="of-note">Scrapping turns a part into materials. Rarer parts give rarer materials. Parts in a saved build are kept safe.</p>
      ${commons.length > 1 ? `<div class="of-make"><button type="button" class="of-btn" data-all>Scrap all ${commons.length} spare Common parts <small>${words(sum(commons))}</small></button></div>` : ''}
      <div class="of-grid">${spare.length ? spare.map(it => itemCard(g, it, { compact: true, extra: `<div class="of-buy"><span class="of-price">${words(salvageValue(g.P[it.id], it))}</span><button type="button" class="of-btn of-small" data-scrap="${it.uid}">Scrap</button></div>` })).join('') : '<p class="of-empty">Every part you own is in a saved build.</p>'}</div>`;
    const done = () => { sound('build.place', { global: true, gain: 0.5 }); g.saveNow(); onChange?.(); sheet.wallet(); drawScrap(); };
    sheet.body.querySelectorAll('[data-scrap]').forEach(b => b.addEventListener('click', async () => {
      const it = save.items.find(x => x.uid === b.dataset.scrap); if (!it) return;
      if (RANK_ORDER(it.rarity) >= 2 && !(await ask({ title: `Scrap ${g.P[it.id].name}?`, text: `A ${RARITY_BY_ID[it.rarity].label} part, gone for good.`, ok: 'Scrap', danger: true }))) return;
      salvage(save, it.uid, g.P); done();
    }));
    sheet.body.querySelector('[data-all]')?.addEventListener('click', async () => {
      if (!(await ask({ title: `Scrap ${commons.length} Common parts?`, text: `You get ${words(sum(commons))}. Parts in saved builds are kept.`, ok: 'Scrap them', danger: true }))) return;
      for (const it of commons) salvage(save, it.uid, g.P); done();
    });
  };

  const draw = () => (tab === 'craft' ? drawCraft() : drawScrap());
  draw();
  return sheet;
}
