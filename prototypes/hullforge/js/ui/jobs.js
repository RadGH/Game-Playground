// The Jobs board (a station service) and the Jobs screen (K, or the ☰ menu): the jobs a station offers side by side
// with the ones you took, with the reward stated in numbers, where each one happens, hand-over at the right board
// and a styled confirm before you drop one.

import { el, btn, panel, toast, num, dist, credits as cr } from './dom.js';
import { play } from '../core/audio.js';
import { ask } from '../../../../shared/dialog.js';
import { save, cargoUsed, designGrid } from '../sim/state.js';
import { computeStats } from '../sim/stats.js';
import { boardOf, boardOffers, boardRefresh, acceptMission, abandonMission, progressOf, handInBlock, handIn, missionState, missionTarget, MAX_ACTIVE, KINDS } from '../sim/missions.js';
import { FACTIONS, repLevel } from '../sim/factions.js';
import { checkGoals } from '../sim/goals.js';
import { vdist } from '../core/math.js';
import { $ } from './dom.js';

/** Where a job happens, in a few words ("Here · 2.4 km", "In Varos · 1 jump", "Hand over at Kel Station"). */
export function jobWhere(app, m) {
  const G = app.G, gal = app.gal; const here = G.system;
  const jumps = to => hops(gal, here, to);
  if (m.kind === 'delivery') return m.to.system === here ? `Hand over at ${m.to.name}` : `Deliver to ${m.to.name} · ${jumpText(jumps(m.to.system))}`;
  if (m.kind === 'acquire') { const p = progressOf(G, m); return p.have >= p.need ? `Hand over at ${m.board.name}${m.board.system === here ? '' : ` · ${jumpText(jumps(m.board.system))}`}` : `${num(p.have)} of ${num(p.need)} · hand over at ${m.board.name}`; }
  if (m.kind === 'survey' && m.survey.what === 'anomaly') return 'Any system: fly into an anomaly';
  if (m.system !== here) return `In ${gal.systems[m.system].name} · ${jumpText(jumps(m.system))}`;
  const t = app.w && app.mode === 'fly' ? missionTarget(m, app.w, here) : null;
  if (m.kind === 'survey') return `${num(progressOf(G, m).have)} of ${num(m.need)} scanned here`;
  if (t && app.P) return `${t.label} · ${dist(vdist(app.P.pos, t.pos))}`;
  const pos = m.target?.pos || m.site?.pos || m.from;   // the station sits at the system's middle
  return pos ? `Here · ${dist(Math.hypot(pos.x, pos.y, pos.z))} from the station` : 'In this system';
}
const jumpText = n => (n === 0 ? 'here' : n === 1 ? '1 jump' : n > 50 ? 'far away' : `${n} jumps`);
function hops(gal, a, b) {
  if (a === b) return 0; const seen = new Set([a]); let front = [a], n = 0;
  while (front.length && n < 60) { n++; const next = []; for (const s of front) for (const l of gal.systems[s].links) { if (l === b) return n; if (!seen.has(l)) { seen.add(l); next.push(l); } } front = next; }
  return 99;
}
const repWord = (f, n) => `${n > 0 ? '+' : ''}${n} ${FACTIONS[f].short}`;
const minutes = s => (s >= 60 ? `${Math.round(s / 60)} min` : `${Math.ceil(s)} s`);

/** One job as a card (an offer or one you took). */
function jobCard(app, m, { taken = false, actions = [] } = {}) {
  const G = app.G; const K = KINDS[m.kind];
  const kv = el('div', { class: 'kv' });
  const row = (a, b, cls) => kv.append(el('span', {}, a), el('b', { class: cls || null }, b));
  row('Reward', cr(m.reward.cr), 'amber');
  row('Standing', repWord(m.board.faction, m.reward.rep) + (m.kind === 'clear' ? ` · ${m.site.faction === 'swarm' ? 'Hive' : 'Pirates'} −3` : ''));
  if (m.reward.part) row('Bonus', 'a part (level of this system)');
  if (m.freight) row('Hold room', `${num(m.freight)} until handed over`);
  if (m.limit) row('Clock', taken && m.expires ? `${minutes(Math.max(0, m.expires - (G.playTime || 0)))} left` : `${minutes(m.limit)} once taken`, taken && m.expires && m.expires - G.playTime < 120 ? 'bad' : null);
  row('Where', jobWhere(app, m));
  const card = el('div', { class: 'w-card' + (taken ? ' mine' : ''), style: `--jc:${K.color}` },
    el('span', { class: 'kind' }, K.name), el('h4', {}, m.title), el('p', {}, m.text), kv);
  if (taken) { const p = progressOf(G, m); if (p.need > 1) card.append(el('div', { class: 'prog' }, el('i', { style: `width:${Math.round(p.have / p.need * 100)}%` })), el('small', { class: 'dim' }, `${num(p.have)} of ${num(p.need)}`)); }
  if (actions.length) card.append(el('div', { class: 'row wrap' }, ...actions));
  return card;
}
function abandonBtn(app, m, after) {
  return btn('Drop job', async () => {
    const lose = m.freight ? ' The freight goes back to its owners.' : '';
    if (!(await ask({ title: 'Drop this job?', text: `“${m.title}” is gone for good: you cannot take it again.${lose}`, ok: 'Drop it', danger: true }))) return;
    abandonMission(app.G, m); save(app.G); toast(`Dropped: ${m.title}`); after();
  }, 'small danger');
}

/** The station's Jobs board. */
export function openJobsBoard(app, redraw) {
  const G = app.G; const sys = app.gal.systems[G.system]; const board = boardOf(sys);
  const L = repLevel(G, board.faction);
  const P = panel('Jobs board', redraw, { sub: `${board.name} · run by ${FACTIONS[board.faction].name} · you are ${L.name}` });
  const credLine = el('div', { class: 'stat amber' }); P.head.insertBefore(credLine, P.head.lastChild);
  const room = () => computeStats(designGrid(G)).cargo - cargoUsed(G);
  function draw() {
    credLine.textContent = cr(G.credits);
    const st = P.body.scrollTop;
    const offers = boardOffers(G, app.gal, board); const M = missionState(G);
    const left = el('div', {}, el('div', { class: 'w-col-head' }, el('h3', {}, 'Offered here'), el('small', {}, `New jobs in ${minutes(boardRefresh(G.playTime || 0))}`)));
    if (!L.jobs) left.append(el('div', { class: 'w-empty' }, `${FACTIONS[board.faction].name} will not give you work while you are Hated. Raise your standing with them first (see Standing).`));
    else if (!offers.length) left.append(el('div', { class: 'w-empty' }, `You took every job on this board. New ones in ${minutes(boardRefresh(G.playTime || 0))}.`));
    else {
      const cards = el('div', { class: 'w-cards' }); left.append(cards);
      for (const m of offers) {
        const why = M.active.length >= MAX_ACTIVE ? `You have ${MAX_ACTIVE} jobs: finish or drop one first.` : m.freight && room() < m.freight ? `Needs ${num(m.freight)} free hold room (you have ${num(Math.max(0, room()))}).` : '';
        const c = jobCard(app, m, { actions: [btn('Take job', () => {
          const err = acceptMission(G, m, room()); if (err) { toast(err, 'bad'); return; }
          play('lock'); toast(`Job taken: ${m.title}`, 'good'); save(G); draw(); redraw?.();
        }, why ? '' : 'primary', { disabled: !!why })] });
        if (why) c.append(el('span', { class: 'why' }, why));
        cards.append(c);
      }
    }
    const right = el('div', {}, el('div', { class: 'w-col-head' }, el('h3', {}, 'Your jobs'), el('small', {}, `${num(M.active.length)} of ${MAX_ACTIVE}`)));
    if (!M.active.length) right.append(el('div', { class: 'w-empty' }, 'None taken yet.'));
    else {
      const col = el('div', { class: 'col' }); right.append(col);
      for (const m of M.active) {
        const block = handInBlock(G, m, board.id);
        const acts = [];
        if (!block) acts.push(btn('Hand over', () => {
          const res = handIn(G, m); play('rare'); toast(`Job done: ${res.text}`, 'gold');
          const g = checkGoals(G); if (g) app.goalDone(g);
          save(G); draw(); redraw?.();
        }, 'gold'));
        acts.push(abandonBtn(app, m, () => { draw(); redraw?.(); }));
        col.append(jobCard(app, m, { taken: true, actions: acts }));
      }
    }
    P.body.replaceChildren(el('div', { class: 'w-two' }, left, right));
    P.body.scrollTop = st;
  }
  draw();
  return P;
}

/** The Jobs screen while flying (K): what you took, how far along, where to go; drop one. */
export function openJobsLog(app) {
  if ($('#panels .w-jobs-log')) { $('#panels .w-jobs-log').closePanel(); return; }
  const G = app.G; const M = missionState(G);
  const P = panel('Jobs', null, { cls: 'w-jobs-log', sub: `${num(M.active.length)} of ${MAX_ACTIVE} taken · ${num(M.done || 0)} done in all` });
  function draw() {
    if (!M.active.length) { P.body.replaceChildren(el('div', { class: 'section', style: 'max-width:640px' }, el('div', { class: 'w-empty' }, 'No jobs taken. Every station has a Jobs board.'))); return; }
    const cards = el('div', { class: 'w-cards', style: 'max-width:1100px' });
    for (const m of missionState(G).active) cards.append(jobCard(app, m, { taken: true, actions: [abandonBtn(app, m, draw)] }));
    P.body.replaceChildren(cards);
  }
  draw();
  return P;
}
