// Parts hold > Ships (owner 2026-11-13): every ship you own in one place, usable anywhere — in space or docked,
// at any station (some stations have no Mercenaries board). Per ship:
//   - a picture, its class and the numbers that matter (health, speed, cargo, CPU, crew)
//   - who flies it: you, a mercenary, nobody, or "Wrecked"
//   - Fly this one: it becomes your flagship (app.switchShip — crew moves with you, a merc swaps seats)
//   - Choose pilot: every merc you hired, with Assign or the reason they cannot fly it (on the row, rule 10)
// Hiring, dismissing and repairs stay at stations; this tab says where.

import { el, btn, toast, fmt } from './dom.js';
import { CLASSES } from '../data/hulls.js';
import { playerShip } from '../sim/state.js';
import { bakeBody } from '../render/bake.js';
import { hidOf, mercFlying, shipNeeds, cannotFly, assign, flyingMercs, wingSlots, wingSlotsText, repairCost, storeWing, spawnWing } from '../sim/mercs.js';
import { emblem } from './mercs.js';

const previews = new WeakMap();   // ship record -> { key, canvas } (re-baked when its blocks change)

/** Draw the tab into `box`. `redraw` re-renders the hold. */
export function shipsTab(app, box, redraw) {
  const G = app.G; G.hangar ||= []; G.mercs ||= [];
  for (const rec of G.hangar) hidOf(rec);
  const slots = wingSlots(G); const flying = flyingMercs(G);
  const docked = app.mode === 'docked';

  // ---- summary: the wing at a glance
  const idle = G.mercs.filter(m => !m.ship);
  box.append(el('div', { class: 'card sh-sum' },
    el('div', { class: 'mc-sum-row' },
      stat('Ships', `${1 + G.hangar.length}`),
      stat('Wingmen flying', `${flying.length} / ${slots}`),
      stat('Mercenaries', `${G.mercs.length}`),
      idle.length ? stat('Waiting for a ship', idle.map(m => m.callsign).join(', ')) : null),
    el('div', { class: 'hint' }, `${wingSlotsText()} ${G.mercs.length ? '' : 'Hire mercenary pilots at a station\'s Mercenaries board, then give them ships here.'}`)));

  // ---- your flagship
  box.append(el('h3', { class: 'st-h' }, 'Flying now'));
  const fb = app.P && !docked ? app.P : playerShip(G);
  box.append(el('div', { class: 'cards sh-cards' }, shipCard(G, G.ship, fb, { you: true })));

  // ---- the hangar
  box.append(el('h3', { class: 'st-h' }, 'Your other ships'));
  if (!G.hangar.length) {
    box.append(el('p', { class: 'hint' }, 'You own one ship. At a shipyard, "Buy, keep old ship" keeps your old one here for you or a mercenary to fly.'));
  }
  const list = el('div', { class: 'cards sh-cards' });
  for (const rec of G.hangar) list.append(hangarCard(app, rec, redraw, flying));
  if (G.hangar.length) box.append(list);

  if (G.designs?.length) {
    box.append(el('h3', { class: 'st-h' }, 'Saved designs'));
    box.append(el('div', { class: 'row wrap' }, ...G.designs.map(d => el('span', { class: 'sh-design' }, `${d.name} · ${CLASSES[d.cls]?.name || d.cls}`))));
  }
}

function hangarCard(app, rec, redraw, flying) {
  const G = app.G;
  const body = playerShip({ ...G, ship: rec });
  const pilot = mercFlying(G, rec);
  const inWing = pilot && flying.some(x => x.m.id === pilot.id);
  const status = rec.wrecked ? el('div', { class: 'bad' }, `Wrecked — repair it at any station's shipyard or Mercenaries board (${fmt(repairCost(rec))} cr).`)
    : pilot ? el('div', { class: inWing ? 'good' : 'warn', style: `color:${inWing ? pilot.color : ''}` },
      inWing ? `Flown by ${pilot.callsign} — in your wing` : `${pilot.callsign} has it, but your wing is full — lead a bigger flagship to bring them along.`)
      : el('div', { class: 'hint' }, 'No pilot — stays in the hangar.');
  const card = shipCard(G, rec, body, { status });

  const picker = el('div', { class: 'mc-pick hidden' });
  const fly = btn('Fly this one', () => {
    const why = app.switchShip?.(rec);
    if (why) return toast(why, 'bad');
    redraw();
  }, rec.wrecked ? 'off' : 'primary');
  const choose = btn(pilot ? 'Change pilot' : 'Choose pilot', () => {
    picker.classList.toggle('hidden');
    if (!picker.classList.contains('hidden')) fillPilots(app, rec, picker, redraw);
  }, rec.wrecked ? 'off' : '');
  const actions = el('div', { class: 'row wrap' }, fly, choose);
  if (pilot) actions.append(btn('Take the pilot out', () => { assign(G, pilot.id, null); afterPilots(app); toast(`${pilot.callsign} hands back ${rec.name}.`); redraw(); }, 'small'));
  card.append(actions, picker);
  return card;
}

/** Every hired merc, with Assign or why they cannot fly this ship. */
function fillPilots(app, rec, box, redraw) {
  const G = app.G; box.innerHTML = '';
  if (!G.mercs.length) { box.append(el('p', { class: 'hint' }, 'No mercenaries hired. Stations with a Mercenaries board have pilots for hire.')); return; }
  const n = shipNeeds(rec);
  box.append(el('div', { class: 'hint' }, `${rec.name} needs a pilot who handles ${fmt(n.cpu)} CPU and ${fmt(n.crew)} crew.`));
  const current = mercFlying(G, rec);
  for (const m of G.mercs) {
    const mine = m.ship === rec.hid;
    // someone else in the seat is not a reason: picking this merc swaps them in and the other waits for a ship
    let why = null;
    if (!mine) { const keep = current?.ship; if (current) current.ship = null; why = cannotFly(G, m, rec); if (current) current.ship = keep; }
    const now = m.ship ? (G.hangar.find(h => h.hid === m.ship)?.name || null) : null;
    const row = el('div', { class: 'mc-ship sh-pilot' + (why ? ' refused' : '') },
      emblem(m, 30),
      el('div', { class: 'mc-ship-name' }, el('b', { style: `color:${m.color}` }, m.callsign),
        el('div', { class: 'hint' }, now && !mine ? `Flying ${now} now` : now ? 'Flying this ship' : 'Waiting for a ship')),
      el('div', { class: 'mc-ship-need' }, need('CPU', n.cpu, m.pilot.cpu), need('Crew', n.crew, m.pilot.crew)),
      mine ? el('span', { class: 'good mc-why' }, 'Flying it')
        : why ? el('span', { class: 'bad mc-why' }, why)
          : btn(current ? 'Swap in' : now ? 'Move here' : 'Assign', () => {
            if (current) assign(G, current.id, null);
            const r = assign(G, m.id, rec);
            if (r) { if (current) assign(G, current.id, rec); return toast(r, 'bad'); }
            afterPilots(app);
            toast(`${m.callsign} will fly ${rec.name}.${current ? ` ${current.callsign} waits for a ship.` : ''}${app.mode === 'docked' ? ' They launch when you undock.' : ''}`, 'good');
            redraw();
          }, 'primary small'));
    box.append(row);
  }
}

/** Pilots changed: in space the wing re-forms now; docked, the station screen redraws. */
function afterPilots(app) {
  if (app.mode !== 'docked' && app.w && app.P) { storeWing(app); spawnWing(app); }
  else app.stationRefresh?.();
  app.save?.(); app.updateQuest?.();
}

/** One ship: picture, name, class, numbers, and a status line. */
function shipCard(G, rec, body, { you = false, status = null } = {}) {
  const st = body.stats; const C = CLASSES[rec.cls];
  const card = el('div', { class: 'card sh-card' + (you ? ' you' : '') });
  const pic = preview(rec, body);
  if (pic) card.append(el('div', { class: 'st-preview sh-preview' }, pic));
  card.append(el('div', { class: 'sh-title' }, el('b', {}, rec.name), el('span', { class: 'hint' }, ` ${C?.name || rec.cls}`),
    you ? el('span', { class: 'mc-chip sh-you' }, 'You') : null));
  if (status) card.append(status);
  const crew = you ? `${fmt(body.crew)} aboard · ${fmt(st.crewNeed)} needed` : `${fmt(rec.crew || 0)} aboard · ${fmt(st.crewNeed)} needed`;
  card.append(el('div', { class: 'kv sh-kv', html: [
    ['Health', fmt(st.maxHp)], ['Top speed', fmt(st.maxSpeed)], ['Cargo', fmt(st.cargo)],
    ['CPU', `${fmt(st.cpu)} / ${fmt(st.cpuCap)}`], ['Crew', crew], ['Drones', st.droneCap || 0],
  ].map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('') }));
  return card;
}

function preview(rec, body) {
  const key = `${rec.cls}:${rec.grid?.b?.length}:${JSON.stringify(rec.grid?.b?.map(b => b[4] > 0 ? 1 : 0))}`;
  const hit = previews.get(rec);
  if (hit?.key === key) return copy(hit.canvas);
  try {
    const baked = bakeBody(body).hull;
    const c = document.createElement('canvas'); c.width = 240; c.height = 110;
    const s = Math.min(228 / baked.width, 100 / baked.height);
    const w = baked.width * s, h = baked.height * s;
    c.getContext('2d').drawImage(baked, (240 - w) / 2, (110 - h) / 2, w, h);
    previews.set(rec, { key, canvas: c });
    return copy(c);
  } catch (e) { console.warn('ship preview failed', e); return null; }
}
function copy(c) { const d = document.createElement('canvas'); d.width = c.width; d.height = c.height; d.getContext('2d').drawImage(c, 0, 0); return d; }

const need = (label, want, have) => el('span', { class: want > have ? 'bad' : '' }, `${label} ${fmt(want)}/${fmt(have)}`);
const stat = (k, v) => el('div', { class: 'mc-stat' }, el('span', { class: 'hint' }, k), el('b', {}, v));
