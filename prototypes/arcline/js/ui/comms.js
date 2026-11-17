// The Comms panel (owner 2026-11-16: "I built a comms center but it isn't clear how to access it. Add a menu to the
// building itself so you can see passing ships and maybe request things from there, in addition to special things
// becoming available based on a schedule"). Opens from the Comms button on the second row, the C key, or by tapping a
// Comms Array. Sections: the array's status · ships overhead now (offers + answers) · the timetable (regular convoy and
// patrol, ships you called) · call a ship (fee + delay) · strike charges · recent ships.
// The game is paused while it is open (every sheet pauses), so nothing here needs a live timer.
import { el, btn, sheet, toast } from './dom.js';
import { fmt } from '../../../../shared/format.js';
import * as ships from '../sim/ships.js';
import * as sched from '../sim/schedule.js';

const KIND_LABEL = { settlers: 'Settlers', liner: 'Colony liner', warship: 'Warship', merchant: 'Merchant', supplies: 'Supplies', exotic: 'Exotic goods' };
const kindLabel = v => v.kindName || KIND_LABEL[v.kind] || 'Ship';
const secText = s => (s >= 90 ? `${fmt(Math.round(s / 60))} min` : `${fmt(Math.max(0, Math.round(s)))} s`);

/** Open the panel. game: the app (needs .r, .onShipEvents(events), .refresh()). */
export function openComms(game) {
  return sheet('Comms', (m, close) => {
    m.classList.add('cm-sheet');
    const draw = () => {
      const r = game.r, cv = ships.commsView(r), sv = sched.scheduleView(r);
      const head = m.querySelector('h2');
      m.replaceChildren(head);
      // status
      const tierName = ['No Comms Array', 'Comms Array', 'Long-range Array', 'Deep-space Array'][cv.tier] || 'Comms Array';
      m.append(el('div', { class: `cm-status ${cv.online ? 'on' : 'off'}` },
        el('i', { class: 'cm-dot', 'aria-hidden': 'true' }),
        el('div', {}, el('b', {}, cv.online ? `${tierName} listening` : 'Not listening'),
          el('small', {}, cv.online ? (cv.nextInSec != null ? `Next passing ship in about ${secText(cv.nextInSec)}` : 'Waiting for ships') : (cv.note || 'Build a Comms Array and give it power to hear passing ships.')))));

      // ships overhead
      m.append(el('h3', {}, 'Overhead now'));
      if (!cv.ships.length) m.append(el('p', { class: 'dim cm-empty' }, cv.online ? 'No ships overhead right now.' : 'Ships pass over all the time, but without a powered array you can\'t hear them.'));
      for (const v of cv.ships) m.append(shipCard(game, v, draw));

      // timetable
      m.append(el('h3', {}, 'Timetable'));
      const rows = [
        ...sv.requests.filter(q => q.pending).map(q => ({ name: `${q.kind === 'merchant' ? 'Merchant' : 'Warship'} you called`, when: q.pending.when, note: 'On its way', kind: q.kind })),
        ...sv.visits.map(v => ({ name: v.name, when: v.when, note: v.every, kind: v.kind, blurb: v.blurb })),
      ];
      m.append(el('ul', { class: 'cm-times' }, ...rows.map(t => el('li', { class: t.kind, 'data-tip': t.blurb || null },
        el('span', { class: 'cm-kind' }, t.kind === 'merchant' ? 'Trade' : 'Strikes'), el('b', {}, t.name), el('span', { class: 'cm-when' }, t.when), el('small', {}, t.note)))));
      if (!cv.online) m.append(el('p', { class: 'dim' }, 'A visit that comes while no array is listening is missed until its next run.'));

      // requests
      m.append(el('h3', {}, 'Call a ship'));
      const reqs = el('div', { class: 'cm-reqs' });
      for (const q of sv.requests) {
        const b = btn('', () => {
          const res = sched.requestVisit(game.r, q.id);
          if (!res.ok) { toast(res.why, 'bad'); return; }
          toast(res.text, 'good'); game.refresh?.(); draw();
        }, 'cm-req ' + q.kind, { disabled: q.ok ? null : true, 'data-tip': q.blurb });
        b.append(...[el('b', {}, q.name), el('small', {}, q.pending ? `On its way · ${q.pending.when}` : `${fmt(q.fee)} credits · arrives in about ${fmt(q.delay)} days`), !q.ok && q.why && !q.pending ? el('small', { class: 'why' }, q.why) : null].filter(Boolean));
        reqs.append(b);
      }
      m.append(reqs);

      // strikes on hand
      const st = cv.strikes;
      if (st && (st.charges > 0 || st.lance)) m.append(el('h3', {}, 'Orbital strikes'), el('p', { class: 'cm-line' }, `${fmt(st.charges)} charge${st.charges === 1 ? '' : 's'} on hand${st.lance ? ` · Orbital Lance: ${st.lance.ready ? 'ready' : st.lance.why}` : ''}`));

      // recent
      if (cv.history?.length) m.append(el('h3', {}, 'Recent ships'), el('ul', { class: 'cm-hist' }, ...cv.history.slice(0, 5).map(h => el('li', {}, el('span', {}, h.name || 'A ship'), el('small', {}, HOW[h.how] || h.how || '')))));
      m.append(btn('Back to the city', close, 'primary cm-close'));
      setTimeout(() => (m.querySelector('.cm-ship button:not([disabled]), .cm-req:not([disabled])') || m.querySelector('.cm-close'))?.focus({ preventScroll: true }), 0);
    };
    draw();
  });
}
const HOW = { answered: 'Answered', missed: 'Passed by', refused: 'Waved on', accepted: 'Landed', bought: 'Bought from' };

function shipCard(game, v, redraw) {
  const left = v.secondsLeft != null ? `Leaves in ${secText(v.secondsLeft)}` : '';
  const card = el('article', { class: `cm-ship ${v.kind || ''}` },
    el('header', {}, el('span', { class: 'cm-kind' }, kindLabel(v)), el('b', {}, v.name || v.title || 'A ship'), el('small', {}, left)),
    el('div', { class: 'cm-bar' }, el('i', { style: `width:${Math.round((1 - (v.progress ?? 0)) * 100)}%` })),
    v.text ? el('p', {}, v.text) : null,
    v.lines?.length ? el('ul', { class: 'shiplines' }, ...v.lines.map(t => el('li', {}, t))) : null);
  const acts = el('div', { class: 'cm-acts' });
  for (const c of v.choices || []) {
    const b = btn('', () => {
      const res = ships.answer(game.r, v.id, c.choice);
      if (!res.ok) { toast(res.why || 'Can\'t do that', 'bad'); redraw(); return; }
      if (res.text) toast(res.text, 'good');
      game.onShipEvents?.(res.events || []);
      game.refresh?.(); redraw();
    }, c.choice === 'refuse' ? 'small' : 'primary small', { disabled: c.ok ? null : true, 'data-tip': c.blurb || null });
    b.append(...[el('span', {}, c.label), c.unlocks ? el('small', { class: 'unlocks' }, c.unlocks) : null, c.cost ? el('small', { class: 'cost' }, c.cost) : null, !c.ok && c.why ? el('small', { class: 'why' }, c.why) : null].filter(Boolean));
    acts.append(b);
  }
  card.append(acts);
  return card;
}
