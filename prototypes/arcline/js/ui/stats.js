// The Statistics sheet (☰ menu › Statistics, or G): Overview, History charts, Neighbours, Defence — owner 2026-11-17:
// "an in game statistics menu with that info and other charts". Numbers come from sim/stats.js (history + tallies),
// sim/transit.js linkReport (the same Neighbours list the world map card shows — neighbourList below prints both), and
// the sim's own helpers. One scroller (the sheet), a new tab starts at the top (lessons 11, 12).
import { el, btn, sheet } from './dom.js';
import { fmt, pct } from '../../../../shared/format.js';
import { lineChart, short } from './chart.js';
import { overview, series, ensureTally, wallHealth, wallCount, ensureHistory } from '../sim/stats.js';
import { linkReport } from '../sim/transit.js';
import { immigrationRate, DAYS_PER_MONTH, WORK_SHARE } from '../sim/city.js';
import { threatView } from '../sim/nests.js';
import { item } from '../sim/catalog.js';
import { money, perDay } from './hud.js';

export const TABS = [['overview', 'Overview'], ['history', 'History'], ['neighbours', 'Neighbours'], ['defence', 'Defence']];
const RANGES = [[30, '30 days'], [120, '120 days'], [0, 'All']];
const COL = { people: '#3ff0ff', money: '#ffb02e', income: '#6bf09a', R: '#56d678', C: '#50a0ff', I: '#ffbe46', supply: '#93a4b8', use: '#ff4fd8', appeal: '#3ff0ff', land: '#c08cff', kills: '#6bf09a', damage: '#ff6a5a', walls: '#ffb02e' };
const BY = { road: 'Road', transit: 'Transit', both: 'Road + transit' };

let lastTab = 'overview', lastRange = 120;

/** Open the sheet on a tab ('overview' | 'history' | 'neighbours' | 'defence'). */
export function openStats(game, tab = lastTab) {
  const r = game.r; if (!r) return;
  ensureHistory(r); ensureTally(r);
  sheet('Statistics', (m, close) => {
    m.classList.add('ac-statsheet');
    const bar = el('div', { class: 'ac-stats-tabs seg', role: 'tablist', 'aria-label': 'Statistics sections' });
    const body = el('div', { class: 'ac-stats-body' });
    const show = id => {
      lastTab = id;
      bar.querySelectorAll('button').forEach(b => { const on = b.dataset.tab === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
      body.replaceChildren(...build(game, id, () => show(id)));
      m.closest('.modal-back')?.scrollTo?.({ top: 0 });   // a new tab starts at the top
    };
    for (const [id, label] of TABS) bar.append(btn(label, () => show(id), '', { 'data-tab': id, role: 'tab' }));
    m.append(bar, body, btn('Done', close, 'primary ac-stats-done'));
    show(TABS.some(t => t[0] === tab) ? tab : 'overview');
  });
}

function build(game, id, redraw) {
  const r = game.r;
  if (id === 'history') return history(r, redraw);
  if (id === 'neighbours') return neighbours(game);
  if (id === 'defence') return defence(game);
  return overviewTab(r);
}

// ---------------------------------------------------------------- tiles
const tile = (label, value, sub = '', cls = '') => el('div', { class: 'ac-tile ' + cls }, el('small', {}, label), el('b', {}, value), sub ? el('span', {}, sub) : null);
const useLine = (u, s) => s > 0 ? `${pct(u / s)} in use` : u > 0 ? 'none made' : 'none needed';
const useCls = (u, s) => (s <= 0 && u > 0) || u > s ? 'bad' : s > 0 && u / s >= 0.85 ? 'warn' : '';

function overviewTab(r) {
  const o = overview(r), dm = o.demand;
  const dmRow = el('div', { class: 'ac-tile wide ac-stats-dem' }, el('small', {}, 'Demand'),
    ...[['R', 'Homes'], ['C', 'Shops'], ['I', 'Industry']].map(([k, name]) => { const v = Math.round(dm[k] * 100); return el('div', { class: 'dr ' + k.toLowerCase() }, el('span', {}, name), el('span', { class: 'bar two' }, el('i', { style: v >= 0 ? `left:50%;width:${v / 2}%` : `right:50%;width:${-v / 2}%` })), el('b', {}, `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}%`)); }));
  const s = series(r, 30);
  return [
    el('div', { class: 'ac-tiles' },
      tile('People', fmt(o.people), o.waiting > 0 ? `+${fmt(o.waiting)} waiting for homes` : `homes for ${fmt(o.homes)}`),
      tile('Jobs', fmt(o.jobs), `${fmt(Math.round(o.people * WORK_SHARE))} workers`),
      tile('Credits', money(o.money), o.money < 0 ? 'in debt' : '', o.money < 0 ? 'bad' : ''),
      tile('Each day', `${o.perDay >= 0 ? '+' : ''}${perDay(o.perDay)}`, 'taxes minus upkeep', o.perDay < 0 ? 'bad' : 'good'),
      // made / used, the same order as the Power and Water pills on the second row
      tile('Power made / used', `${fmt(Math.round(o.power.supply))} / ${fmt(Math.round(o.power.demand))}`, useLine(o.power.demand, o.power.supply), useCls(o.power.demand, o.power.supply)),
      tile('Water pumped / used', `${fmt(Math.round(o.water.supply))} / ${fmt(Math.round(o.water.demand))}`, useLine(o.water.demand, o.water.supply), useCls(o.water.demand, o.water.supply)),
      tile('Attractiveness', pct(o.appeal), 'how fast people move in (100% = ordinary)'),
      tile('Land value', pct(o.land), 'average where people live'),
      tile('Education', pct(o.edu), 'people near a school'),
      tile('Reputation', `${o.reputation >= 0 ? '+' : '−'}${fmt(Math.abs(Math.round(o.reputation * 100)))}`, 'from −100 to +100'),
      dmRow),
    lineChart({ title: 'People, last 30 days', days: s.days, series: [{ label: 'People', color: COL.people, values: s.p, fill: true }], height: 120 }),
  ];
}

function history(r, redraw) {
  const s = series(r, lastRange);
  const seg = el('div', { class: 'seg ac-stats-range', role: 'group', 'aria-label': 'How far back' },
    ...RANGES.map(([d, label]) => btn(label, () => { lastRange = d; redraw(); }, d === lastRange ? 'on' : '')));
  const h = ensureHistory(r), since = [...h.old, ...h.recent][0]?.[0];
  const signed = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(Math.round(v)))}%`;
  return [
    el('div', { class: 'ac-stats-hd' }, seg, el('small', { class: 'dim' }, since != null ? `Recorded since day ${fmt(since)}` : 'Recording starts today')),
    lineChart({ title: 'People', days: s.days, series: [{ label: 'People', color: COL.people, values: s.p, fill: true }] }),
    lineChart({ title: 'Credits', days: s.days, series: [{ label: 'Credits', color: COL.money, values: s.m }], format: money, axis: v => `¢${short(v)}` }),
    lineChart({ title: 'Income per day', days: s.days, series: [{ label: 'Each day', color: COL.income, values: s.n }], format: v => `${v >= 0 ? '+' : ''}${perDay(v)}`, axis: v => `¢${short(v)}`, zero: true }),
    lineChart({ title: 'Demand', days: s.days, series: [{ label: 'Homes', color: COL.R, values: s.R }, { label: 'Shops', color: COL.C, values: s.C }, { label: 'Industry', color: COL.I, values: s.I }], yMin: -100, yMax: 100, format: signed, axis: v => `${fmt(v)}%`, zero: true }),
    lineChart({ title: 'Power', days: s.days, series: [{ label: 'Made', color: COL.supply, values: s.ps, dash: true }, { label: 'Used', color: COL.use, values: s.pu }] }),
    lineChart({ title: 'Water', days: s.days, series: [{ label: 'Pumped', color: COL.supply, values: s.ws, dash: true }, { label: 'Used', color: COL.C, values: s.wu }] }),
    lineChart({ title: 'Attractiveness and land value', days: s.days, series: [{ label: 'Attractiveness', color: COL.appeal, values: s.ap }, { label: 'Land value', color: COL.land, values: s.lv }], yMin: 0, format: v => `${fmt(Math.round(v))}%`, axis: v => `${fmt(v)}%` }),
  ];
}

// ---------------------------------------------------------------- neighbours (shared with the world map card)
/**
 * The Neighbours list: one row per neighbouring region (cities first) with how it links and what it gives, then the
 * totals. report = transit.js linkReport(). opts.compact: the world map card (no move-in line). → element
 */
export function neighbourList(report, { compact = false, live = null } = {}) {
  const { rows, total } = report;
  const wrap = el('div', { class: 'ac-nb' + (compact ? ' compact' : '') });
  if (!rows.length) { wrap.append(el('p', { class: 'dim' }, 'No regions next door.')); return wrap; }
  const gives = v => [
    ['Homes demand', `+${pct(v.R)}`], ['Shops demand', `+${pct(v.C)}`], ['Move-in speed', `+${pct(v.appeal)}`], ['Arrivals', `${fmt(v.arrivals)} a month`],
  ];
  // regions with no city yet: one quiet line with their names, after the cities
  const empty = rows.filter(x => !x.city && !x.by);
  for (const row of rows.filter(x => x.city || x.by)) {
    const badge = el('span', { class: 'ac-nb-by ' + (row.by || 'none') }, row.by ? BY[row.by] : row.city ? 'Not linked' : 'No city');
    const sub = row.city ? `${fmt(row.people)} people` : 'Unclaimed region';
    const line = el('div', { class: 'ac-nb-row' + (row.by ? ' linked' : '') },
      el('div', { class: 'ac-nb-hd' }, el('b', {}, row.name), badge),
      el('small', { class: 'dim' }, sub));
    if (row.by) line.append(el('div', { class: 'ac-nb-gives' }, ...gives(row).map(([k, v]) => el('span', {}, el('small', {}, k), el('b', {}, v)))));
    else if (row.city) line.append(el('small', { class: 'ac-nb-how' }, 'Link: a road meeting theirs at the border, or transit with a station on both sides'));
    wrap.append(line);
  }
  if (empty.length) wrap.append(el('div', { class: 'ac-nb-empty' }, el('small', { class: 'dim' }, `${fmt(empty.length)} unclaimed region${empty.length === 1 ? '' : 's'} next door`), el('span', {}, empty.map(x => x.name).join(' · '))));
  const t = el('div', { class: 'ac-nb-total' },
    el('div', { class: 'ac-nb-hd' }, el('b', {}, 'All links together'), el('span', { class: 'dim' }, `${fmt(total.linked)} linked`)),
    el('div', { class: 'ac-nb-gives' }, ...gives(total).map(([k, v]) => el('span', {}, el('small', {}, k), el('b', {}, v)))),
    total.capped ? el('small', { class: 'warn' }, `Capped: links add up to at most +${pct(total.cap)} demand (${pct(total.raw)} before the cap)`) : null,
    live ? el('small', { class: 'dim' }, live) : null);
  wrap.append(t);
  return wrap;
}
function neighbours(game) {
  const r = game.r, wr = game.world?.regions?.[r.id];
  if (!wr) return [el('p', { class: 'dim' }, 'This test city has no world around it.')];
  const rep = linkReport(game.world, wr, r.links || []);
  let live = null;
  if (rep.total.linked && r.founded) {
    const keep = r.links; r.links = []; const base = immigrationRate(r); r.links = keep; const now = immigrationRate(r);
    live = `Here and now: about ${fmt(Math.round((now - base) * DAYS_PER_MONTH))} extra newcomers a month while there are free homes. Links are checked once a month.`;
  } else live = 'Links are checked once a month.';
  return [neighbourList(rep, { live })];
}

// ---------------------------------------------------------------- defence
function defence(game) {
  const r = game.r, st = ensureTally(r), wc = wallCount(r), wh = wallHealth(r), tv = threatView(r);
  const kinds = new Map(); let powered = 0;
  for (const t of r.turrets) { const name = item(t.id)?.name || 'Turret'; kinds.set(name, (kinds.get(name) || 0) + 1); powered += Math.min(1, t.powered ?? 1); }
  const s = series(r, lastRange);
  const days = Math.max(0, Math.floor(r.day) - (st.since ?? 0));
  return [
    el('div', { class: 'ac-tiles' },
      tile('Turrets', fmt(r.turrets.length), r.turrets.length ? `${pct(powered / r.turrets.length)} powered` : 'none built', r.turrets.length && powered / r.turrets.length < 0.99 ? 'warn' : ''),
      tile('Walls', fmt(wc.walls), `${fmt(wc.gates)} gate${wc.gates === 1 ? '' : 's'}`),
      tile('Wall health', wc.walls + wc.gates ? pct(wh) : '—', wc.walls + wc.gates ? 'average of every wall tile' : 'no walls yet', wh < 0.5 ? 'bad' : wh < 0.85 ? 'warn' : ''),
      tile('Creatures killed', fmt(st.kills), `in ${fmt(days)} day${days === 1 ? '' : 's'} recorded`),
      tile('Swarms', `${fmt(st.held)} held of ${fmt(st.swarms)}`, st.swarm ? 'one is under way' : 'held = nothing broke'),
      tile('Damage taken', fmt(st.wallsBroken + st.wrecked + st.turretsLost), `${fmt(st.wallsBroken)} wall · ${fmt(st.wrecked)} building · ${fmt(st.turretsLost)} turret`, st.wrecked + st.turretsLost ? 'warn' : ''),
      tile('Nests', fmt(tv.nests), tv.calmSec > 0 ? `calm for ${fmt(tv.calmSec)} s more` : `about ${fmt(tv.perMinute)} creatures a minute`),
      tile('Creatures now', fmt(game.sim?.horde?.list?.length || 0), tv.swarm ? `swarm of ${fmt(tv.swarm.count)} from the ${tv.swarm.dir}` : 'no swarm announced')),
    kinds.size ? el('div', { class: 'ac-stats-kinds' }, ...[...kinds].map(([k, n]) => el('span', {}, el('b', {}, fmt(n)), ` ${k}`))) : null,
    lineChart({ title: 'Creatures killed per day', days: s.days, bars: true, series: [{ label: 'Killed', color: COL.kills, values: s.k }], yMin: 0 }),
    lineChart({ title: 'Damage taken per day', days: s.days, bars: true, series: [{ label: 'Walls, buildings and turrets lost', color: COL.damage, values: s.x }], yMin: 0 }),
    lineChart({ title: 'Wall health', days: s.days, series: [{ label: 'Average', color: COL.walls, values: s.wh }], yMin: 0, yMax: 100, format: v => `${fmt(Math.round(v))}%`, axis: v => `${fmt(v)}%` }),
  ].filter(Boolean);
}
