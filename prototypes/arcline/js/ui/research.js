// The R&D screen (owner 2026-11-17: "Let's add an R&D tab … where you can spend materials to upgrade or purchase new
// tech, and make the comms center upgrades an alternate, cheaper way to unlock recipes"). Opens from the R&D tab on
// the tool bar, the T key, or a locked tray card ("R&D"). Four branches (City, Defence, Buildings, Policies); each is
// a tree in three tiers — columns on a desktop, one column with tier headings on a phone. A card shows what the tech
// does in numbers, its price (what you're short of in red), the time, what it needs, what it unlocks, and whether
// passing merchants sell it (the same tech, cheaper and at once). Rules live in sim/research.js; this only shows them.
// No toasts on success: the screen itself shows the change (a toast sat on top of the sheet's buttons).
import { el, btn, sheet, toast } from './dom.js';
import { fmt } from '../../../../shared/format.js';
import * as RS from '../sim/research.js';
import { MATS, MAT_NAMES } from '../sim/research-data.js';

const TIER_NAME = { 1: 'Tier 1 · first steps', 2: 'Tier 2 · established city', 3: 'Tier 3 · advanced' };
const STATE_TEXT = { done: 'Researched', active: 'Researching', ready: 'Ready', blocked: 'Can\'t afford yet', locked: 'Locked' };
const secText = s => (s >= 90 ? `${fmt(Math.round(s / 60 * 10) / 10, { decimals: 1 })} min` : `${fmt(Math.max(0, Math.round(s)))} s`);

/** Open the screen. game: the app (needs .r, .refresh(), .openComms()). focus: a tech id to show and highlight. */
export function openResearch(game, focus = null) {
  let branch = (focus && RS.TECH_BY_ID[focus]?.branch) || game._rdBranch || 'city';
  return sheet('Research & Development', (m, close) => {
    m.classList.add('ac-rd');
    const draw = () => {
      const r = game.r, v = RS.researchView(r), head = m.querySelector('h2');
      game._rdBranch = branch;
      m.replaceChildren(head);
      m.append(activeBox(game, v, draw), stockRow(r));
      // branch tabs with done counts
      const tabs = el('div', { class: 'rd-tabs', role: 'tablist', 'aria-label': 'Branches' });
      for (const b of v.branches) {
        const t = btn('', () => { branch = b.id; draw(); }, b.id === branch ? 'on' : '', { role: 'tab', 'aria-selected': b.id === branch ? 'true' : 'false', 'data-branch': b.id });
        t.append(el('b', {}, b.name), el('small', {}, `${fmt(b.done)} of ${fmt(b.techs.length)}`));
        tabs.append(t);
      }
      m.append(tabs);
      const B = v.branches.find(b => b.id === branch);
      m.append(el('p', { class: 'rd-blurb' }, B.blurb));
      const tree = el('div', { class: 'rd-tree' });
      for (const tier of [1, 2, 3]) {
        const list = B.techs.filter(t => t.tier === tier); if (!list.length) continue;
        tree.append(el('section', { class: 'rd-col' }, el('h3', {}, TIER_NAME[tier]), ...list.map(t => card(game, t, draw, focus === t.id))));
      }
      m.append(tree);
      m.append(el('p', { class: 'rd-foot' }, `${fmt(v.done)} of ${fmt(v.total)} researched. One at a time; stopping gives back everything you paid. Merchants passing overhead sell many of these cheaper and at once — whichever way you get one, it is the same tech.`));
      m.append(btn('Back to the city', close, 'primary rd-close'));
      if (focus) { const c = m.querySelector(`[data-tech="${focus}"]`); setTimeout(() => { c?.scrollIntoView({ block: 'center' }); c?.querySelector('button:not([disabled])')?.focus({ preventScroll: true }); }, 0); focus = null; }
    };
    draw();
  });
}

function activeBox(game, v, redraw) {
  const a = v.active, r = game.r;
  if (!a) return el('div', { class: 'rd-active idle' }, el('b', {}, 'Nothing being researched'), el('small', {}, 'Pick a card below: the price is paid when you start, and the tech is yours when the time runs out (the game must be running).'));
  const stop = btn('Stop and get it back', () => { const res = RS.cancelResearch(r); if (!res.ok) toast(res.why, 'bad'); game.refresh?.(); redraw(); }, 'small danger');
  return el('div', { class: 'rd-active' },
    el('div', { class: 'rd-atext' }, el('small', {}, 'Researching'), el('b', {}, a.name), el('small', {}, `${Math.round(a.progress * 100)}% · about ${secText(a.secLeft)} left at 1× (${fmt(Math.ceil(a.daysLeft))} days)`)),
    el('div', { class: 'rd-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(a.progress * 100), 'aria-label': `${a.name} progress` }, el('i', { style: `width:${Math.max(2, Math.round(a.progress * 100))}%` })),
    stop);
}
function stockRow(r) {
  const chips = [el('span', { class: 'rd-chip money' }, `¢${fmt(Math.floor(r.money))}`), ...MATS.map(k => el('span', { class: 'rd-chip' + ((r.stock?.[k] || 0) < 1 ? ' none' : '') }, `${MAT_NAMES[k]} ${fmt(Math.floor(r.stock?.[k] || 0))}`))];
  return el('div', { class: 'rd-stock', 'aria-label': 'What you have' }, el('small', {}, 'You have'), ...chips);
}

function card(game, t, redraw, hi) {
  const r = game.r;
  const c = el('article', { class: `rd-card ${t.state}${hi ? ' hi' : ''}`, 'data-tech': t.id });
  const badge = t.state === 'done' ? (t.how === 'merchant' ? 'From a ship' : 'Researched') : t.state === 'active' ? `${Math.round(t.progress * 100)}%` : STATE_TEXT[t.state];
  c.append(el('header', {}, el('b', {}, t.name), el('span', { class: 'rd-badge' }, badge)));
  c.append(el('p', { class: 'rd-what' }, t.what));
  const meta = [];
  if (t.unlocks.length) meta.push(el('li', { class: 'un' }, `Unlocks: ${t.unlocks.join(', ')}`));
  for (const e of t.early) meta.push(el('li', { class: 'un' }, `${e.name}: from milestone ${e.at} instead of ${e.from}${(r.milestone ?? 0) >= e.from ? ' (you are past it already)' : ''}`));
  if (t.needs.length) meta.push(el('li', { class: 'needs' }, 'Needs: ', ...t.needs.flatMap((n, i) => [i ? ', ' : '', el('span', { class: n.ok ? 'ok' : 'no' }, `${n.name}${n.ok ? ' ✓' : ''}`)])));
  if (t.from > (r.milestone ?? 0)) meta.push(el('li', { class: 'needs' }, el('span', { class: 'no' }, `Opens at milestone ${t.from}`)));
  if (t.policy) meta.push(el('li', {}, t.policy.upkeep ? `Costs ¢${fmt(t.policy.upkeep)} a month while on` : 'Free to run'));
  if (meta.length) c.append(el('ul', { class: 'rd-meta' }, ...meta));
  if (t.state !== 'done') {
    const chips = [];
    if (t.cost.credits) chips.push(el('span', { class: 'rd-chip money' + (t.short.includes('credits') ? ' short' : '') }, `¢${fmt(t.cost.credits)}`));
    for (const k of MATS) if (t.cost[k]) chips.push(el('span', { class: 'rd-chip' + (t.short.includes(k) ? ' short' : '') }, `${fmt(t.cost[k])} ${MAT_NAMES[k]}`));
    chips.push(el('span', { class: 'rd-chip time' }, `${fmt(t.days)} days · ${secText(t.sec)}`));
    c.append(el('div', { class: 'rd-cost' }, ...chips));
  }
  if (t.merchant && t.state !== 'done') {
    const mb = el('div', { class: 'rd-merchant' + (t.merchant.overhead ? ' now' : '') },
      el('p', {}, t.merchant.overhead ? 'A merchant overhead sells it now: ' : `Also offered by merchants${t.merchant.rare ? ' (deep-space only)' : ''}: `, el('b', {}, t.merchant.price), ', no wait.'));
    if (t.merchant.overhead) mb.append(btn('Open Comms', () => { document.querySelector('#panels .modal-back')?._close?.(); game.openComms?.(); }, 'small'));
    c.append(mb);
  }
  if (t.state === 'active') c.append(el('div', { class: 'rd-bar' }, el('i', { style: `width:${Math.max(2, Math.round(t.progress * 100))}%` })));
  // the action
  if (t.policy && t.state === 'done') {
    const on = t.policy.on;
    c.append(btn(on ? 'On — switch off' : 'Off — switch on', () => { const res = RS.setPolicy(r, t.id, !on); if (!res.ok) toast(res.why, 'bad'); game.refresh?.(); redraw(); }, on ? 'primary small rd-go' : 'small rd-go', { 'aria-pressed': on ? 'true' : 'false' }));
  } else if (t.state === 'ready' || t.state === 'blocked') {
    const b = btn('', () => { const res = RS.startResearch(r, t.id); if (!res.ok) toast(res.why, 'bad'); game.refresh?.(); redraw(); }, 'primary small rd-go', { disabled: t.state === 'ready' ? null : true });
    b.append(el('span', {}, 'Research'));
    c.append(b);
    if (t.why) c.append(el('p', { class: 'rd-why' }, t.why));
  } else if (t.state === 'locked' && t.why) c.append(el('p', { class: 'rd-why' }, t.why));
  return c;
}
