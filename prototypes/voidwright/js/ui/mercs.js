// The Mercenaries board at a station (play-test #29; rulings E1 + E2). Registered as the 'mercs' tab in
// ui/station.js. Two parts:
//   Your wing — every merc you hired: their emblem (a coloured badge with their trait's glyph — no face pictures,
//               rule 19), callsign, name, what they can fly, gunnery, trait, wage, status. Give them a ship from your
//               hangar (each ship row says WHY it is refused, rule 10), repair a wrecked one, take it back, dismiss.
//   For hire   — today's mercs at this station: View details (everything, plus which of your ships they could fly)
//               and a separate Hire button with the fee (rule 47).
// hangarExtras(S, rec) adds "Flown by …" / "Wrecked — Repair" to a ship card in the shipyard's hangar list.

import { el, btn, toast, modal, fmt } from './dom.js';
import { CLASSES } from '../data/hulls.js';
import {
  GRADES, TRAITS, MAX_ROSTER, WAGE_EVERY, mercsForHire, wingSlots, wingSlotsText, cannotHire, hire, dismiss, hidOf, shipOf,
  mercFlying, shipNeeds, cannotFly, assign, repairCost, repairShip, wageBill, flyingMercs,
} from '../sim/mercs.js';

ensureCss();

/** The tab. S = the station screen's context (G, sys, done, render). */
export function tabMercs(S, box) {
  const { G, sys } = S;
  G.mercs ||= [];
  const slots = wingSlots(G);
  const flying = flyingMercs(G).length;
  // ---- your wing
  box.append(el('h3', { class: 'st-h' }, 'Your wing'));
  const bill = wageBill(G);
  box.append(el('div', { class: 'mc-sum card' },
    el('div', { class: 'mc-sum-row' },
      stat('Wingmen flying', `${flying} / ${slots}`),
      stat('Hired', `${G.mercs.length} / ${MAX_ROSTER}`),
      stat('Wages', bill.total ? `${fmt(bill.total)} cr / 10 min` : 'none'),
      bill.total ? stat('Next wage in', clock(bill.next)) : null),
    el('div', { class: 'hint' }, `Your ${CLASSES[G.ship.cls]?.name || 'ship'} leads ${slots} wingm${slots > 1 ? 'en' : 'an'}. ${wingSlotsText()} Wages come out of your credits while you fly; a merc you cannot pay warns you, then leaves.`)));
  if (!G.mercs.length) box.append(el('p', { class: 'hint mc-empty' }, 'Nobody hired yet. Pick someone from the list below, then give them a ship from your hangar.'));
  const roster = el('div', { class: 'cards mc-cards' });
  for (const m of G.mercs) roster.append(rosterCard(S, m));
  if (G.mercs.length) box.append(roster);
  // ---- for hire
  box.append(el('h3', { class: 'st-h' }, 'For hire here'));
  box.append(el('p', { class: 'hint' }, `Danger ${sys.tier} station. More dangerous stations have better pilots, who cost more. New faces every 10 minutes.`));
  const offers = mercsForHire(G, sys);
  const list = el('div', { class: 'mc-hire' });
  for (const m of offers) list.append(hireRow(S, m));
  if (!offers.length) list.append(el('p', { class: 'hint' }, 'Nobody is looking for work right now.'));
  box.append(list);
}

// ------------------------------------------------------------------ your wing
function rosterCard(S, m) {
  const { G } = S;
  const rec = shipOf(G, m);
  const card = el('div', { class: 'card mc-card', style: `border-color:${m.color}66` });
  card.append(head(m));
  const status = rec?.wrecked ? el('div', { class: 'bad' }, `Shot down — ${rec.name} is wrecked. ${m.callsign} waits for repairs.`)
    : rec ? (flyingMercs(G).some(x => x.m.id === m.id) ? el('div', { class: 'good' }, `Flying ${rec.name} (${CLASSES[rec.cls]?.name})`) : el('div', { class: 'warn' }, `Has ${rec.name}, but your wing is full: lead a bigger flagship to bring them along.`))
    : el('div', { class: 'warn' }, 'Waiting for a ship.');
  card.append(status, facts(m));
  const actions = el('div', { class: 'row wrap' });
  if (rec?.wrecked) {
    const cost = repairCost(rec);
    actions.append(btn(`Repair ${rec.name} (${fmt(cost)} cr)`, () => { const why = repairShip(G, rec); if (why) return toast(why, 'bad'); S.done(`${rec.name} repaired. ${m.callsign} flies with you when you undock.`); }, G.credits >= cost ? 'primary' : ''));
  }
  const picker = el('div', { class: 'mc-pick hidden' });
  actions.append(btn(rec ? 'Change ship' : 'Give a ship', () => { picker.classList.toggle('hidden'); if (!picker.classList.contains('hidden')) fillPicker(S, m, picker); }, rec ? '' : 'primary'));
  if (rec) actions.append(btn('Take the ship back', () => { assign(G, m.id, null); S.done(`${m.callsign} hands back ${rec.name}.`, ''); }));
  actions.append(btn('Dismiss', () => confirmDismiss(S, m), 'danger small'));
  card.append(actions, picker);
  return card;
}

/** Every hangar ship with an Assign button, or the reason it is refused, on its own row. */
function fillPicker(S, m, box) {
  const { G } = S;
  box.innerHTML = '';
  if (!(G.hangar || []).length) { box.append(el('p', { class: 'hint' }, 'Your hangar is empty. At a shipyard, buy a ship with "Buy, keep old ship" and your old one waits here for a merc.')); return; }
  for (const rec of G.hangar) {
    hidOf(rec);
    const n = shipNeeds(rec); const why = cannotFly(G, m, rec); const mine = m.ship === rec.hid;
    const row = el('div', { class: 'mc-ship' + (why && !mine ? ' refused' : '') },
      el('div', { class: 'mc-ship-name' }, el('b', {}, rec.name), el('span', { class: 'hint' }, ` ${CLASSES[rec.cls]?.name || ''}`)),
      el('div', { class: 'mc-ship-need' }, need('CPU', n.cpu, m.pilot.cpu), need('Crew', n.crew, m.pilot.crew)),
      mine ? el('span', { class: 'good mc-why' }, 'Flying it') : why ? el('span', { class: 'bad mc-why' }, why)
        : btn('Assign', () => { const r = assign(G, m.id, rec); if (r) return toast(r, 'bad'); S.done(`${m.callsign} will fly ${rec.name}. They launch when you undock.`); }, 'primary small'));
    box.append(row);
  }
}
const need = (label, want, have) => el('span', { class: want > have ? 'bad' : '' }, `${label} ${fmt(want)}/${fmt(have)}`);

function confirmDismiss(S, m) {
  modal(`Dismiss ${m.callsign}?`, (box, close) => {
    box.append(el('p', {}, `${m.name} leaves your service. You do not get the hire fee back${m.ship ? '; their ship stays in your hangar' : ''}.`),
      el('div', { class: 'row end' }, btn('Keep them', close), btn('Dismiss', () => { dismiss(S.G, m.id); close(); S.done(`${m.callsign} has left your service.`, ''); }, 'danger')));
  });
}

// ------------------------------------------------------------------ for hire
function hireRow(S, m) {
  const { G } = S;
  const why = cannotHire(G, m);
  return el('div', { class: 'mc-row card', style: `border-left:3px solid ${m.color}` },
    emblem(m, 40),
    el('div', { class: 'mc-row-text' },
      el('div', {}, el('b', { class: 'mc-call' }, m.callsign), el('span', { class: 'hint' }, ` ${m.name}`)),
      el('div', { class: 'hint' }, `${GRADES[m.grade].label} · ${pctText(m.gunnery)} damage · ${TRAITS[m.trait].name}`),
      el('div', { class: 'amber mc-price' }, `${fmt(m.fee)} cr to hire · ${fmt(m.wage)} cr / 10 min`)),
    el('div', { class: 'row wrap mc-row-btns' },
      btn('View details', () => details(S, m)),
      btn(`Hire (${fmt(m.fee)} cr)`, () => doHire(S, m), why ? 'off' : 'primary')));
}
function doHire(S, m) {
  const why = hire(S.G, m); if (why) return toast(why, 'bad');
  S.done(`${m.callsign} joins you. Give them a ship from your hangar.`);
}
function details(S, m) {
  const { G } = S;
  modal('Mercenary for hire', (box, close) => {
    box.classList.add('mc-modal');
    box.append(head(m), facts(m));
    box.append(el('h3', { class: 'st-h' }, 'Your ships they could fly'));
    if (!(G.hangar || []).length) box.append(el('p', { class: 'hint' }, 'Your hangar is empty. Mercs fly ships you own besides your flagship.'));
    for (const rec of G.hangar || []) {
      const why = cannotFly(G, m, rec);
      box.append(el('div', { class: 'mc-ship' + (why ? ' refused' : '') }, el('b', {}, rec.name), el('span', { class: 'hint' }, ` ${CLASSES[rec.cls]?.name || ''}`), el('span', { class: (why ? 'bad' : 'good') + ' mc-why' }, why || 'Yes')));
    }
    const no = cannotHire(G, m);
    box.append(el('div', { class: 'row end' }, btn('Back', close),
      btn(`Hire (${fmt(m.fee)} cr)`, () => { close(); doHire(S, m); }, no ? 'off' : 'primary')));
    if (no) box.append(el('div', { class: 'bad hint' }, no));
  });
}

// ------------------------------------------------------------------ shared bits
function head(m) {
  return el('div', { class: 'mc-head' }, emblem(m, 52),
    el('div', { class: 'mc-names' }, el('div', { class: 'mc-call', style: `color:${m.color}` }, m.callsign), el('div', { class: 'hint' }, m.name)),
    el('span', { class: 'mc-chip', style: `border-color:${m.color};color:${m.color}` }, TRAITS[m.trait].name));
}
function facts(m) {
  const G0 = GRADES[m.grade];
  return el('div', { class: 'kv' , html: [
    ['Flies', `${G0.label} — ships up to ${fmt(m.pilot.cpu)} CPU and ${fmt(m.pilot.crew)} crew`],
    ['Gunnery', `${pctText(m.gunnery)} damage with every gun`],
    ['Trait', `${TRAITS[m.trait].name}: ${TRAITS[m.trait].text}`],
    ['Wage', `${fmt(m.wage)} cr every ${WAGE_EVERY / 60} minutes of flying`],
  ].map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('') });
}
const pctText = g => `${g >= 1 ? '+' : '−'}${Math.abs(Math.round((g - 1) * 100))}%`;
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const stat = (k, v) => el('div', { class: 'mc-stat' }, el('span', { class: 'hint' }, k), el('b', {}, v));

/** A merc's badge: a coloured shield shape with their trait's glyph. Never a face (rule 19). */
const GLYPHS = {
  shield: 'M12 4 L18 6.5 V11.5 C18 15 15.5 17.5 12 19 C8.5 17.5 6 15 6 11.5 V6.5 Z',
  wrench: 'M15.5 4.5 a4 4 0 0 0 -4.6 5.4 L5 15.8 L7.2 18 L13.1 12.1 a4 4 0 0 0 5.4 -4.6 L16 10 L14 8 Z',
  missile: 'M17.5 5.5 L12 7 L7 12 L9 13 L6 17 L7 18 L11 15 L12 17 L17 12 Z',
  pick: 'M5 9 C8 5 15 4.5 19 6 C15 6.5 13 7.5 12.5 8.5 L18 18 L16.5 19 L11 9.6 C10 10 8 10 5 9 Z',
  cross: 'M11 4 H13 V8.2 A4 4 0 0 1 15.8 11 H20 V13 H15.8 A4 4 0 0 1 13 15.8 V20 H11 V15.8 A4 4 0 0 1 8.2 13 H4 V11 H8.2 A4 4 0 0 1 11 8.2 Z M12 10.2 A1.8 1.8 0 1 0 12.01 10.2 Z',
};
export function emblem(m, size = 48) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', size); svg.setAttribute('height', size); svg.setAttribute('class', 'mc-emblem');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<defs><linearGradient id="g${m.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${m.color}" stop-opacity="0.55"/><stop offset="1" stop-color="${m.color}" stop-opacity="0.12"/></linearGradient></defs>`
    + `<path d="M12 1.2 L21.5 6.6 V17.4 L12 22.8 L2.5 17.4 V6.6 Z" fill="url(#g${m.id})" stroke="${m.color}" stroke-width="1"/>`
    + `<path d="${GLYPHS[m.glyph] || GLYPHS.cross}" fill="#f4f8ff" fill-rule="evenodd" opacity="0.92"/>`;
  return svg;
}

/** Shipyard hangar card: which merc flies this ship, or "Wrecked" with a Repair button. */
export function hangarExtras(S, rec) {
  const { G } = S;
  const m = rec.hid ? mercFlying(G, rec) : null;
  if (rec.wrecked) {
    const cost = repairCost(rec);
    return el('div', { class: 'row wrap' }, el('span', { class: 'bad' }, 'Wrecked'),
      btn(`Repair (${fmt(cost)} cr)`, () => { const why = repairShip(G, rec); if (why) return toast(why, 'bad'); S.done(`${rec.name} repaired.`); }, 'small'));
  }
  return m ? el('div', { class: 'hint', style: `color:${m.color}` }, `Flown by ${m.callsign} (mercenary)`) : null;
}

function ensureCss() {
  if (typeof document === 'undefined' || document.getElementById('vw-expansion-css')) return;
  const l = document.createElement('link'); l.id = 'vw-expansion-css'; l.rel = 'stylesheet';
  l.href = new URL('../../css/expansion.css', import.meta.url).href;
  document.head.append(l);
}
