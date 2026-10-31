// God view's screen furniture: the clock and speed buttons, your household's faces, and the sheet for whoever is selected.
// Written for a thumb in portrait: every target 44 px or more, nothing over the corner buttons, and the town stays tappable
// everywhere the sheet is not.
import { moodOf, NEED_NAMES, RACE_NAMES, clockText } from './mood.js';
import { placeName } from './orders.js';
import { el } from './shell.js';

const SPEEDS = [[0, '❚❚'], [1, '1x'], [2, '2x'], [4, '4x']];

export function createGodHud({ parent, game, portrait }) {
  const root = el('div', { class: 'od-god', hidden: '' });
  const clock = el('b', { class: 'od-clock', text: '' }), speedRow = el('div', { class: 'od-speeds' });
  const speedBtns = SPEEDS.map(([x, label]) => { const b = el('button', { type: 'button', 'aria-label': x ? `Speed ${label}` : 'Pause', text: label, on: { click: () => game.setSpeed(x) } }); b.dataset.speed = x; speedRow.append(b); return b; });
  const top = el('div', { class: 'od-gtop' }, clock, speedRow);
  const family = el('div', { class: 'od-family' });
  const hint = el('div', { class: 'od-ghint', hidden: '' });
  const sheet = el('div', { class: 'od-sheet', hidden: '' });
  const driveBtn = el('button', { class: 'od-drivebtn', type: 'button', text: 'Drive', 'aria-label': 'Take a car', on: { click: () => game.toDrive() } });
  const reticle = el('i', { class: 'od-reticle', hidden: '' });
  // the floors of a block that is open: up and down, for a thumb
  const floors = el('div', { class: 'od-floors', hidden: '' }), floorName = el('b', { text: '' });
  floors.append(el('button', { type: 'button', 'aria-label': 'Floor up', text: '▲', on: { click: () => game.stepFloor(1) } }), floorName, el('button', { type: 'button', 'aria-label': 'Floor down', text: '▼', on: { click: () => game.stepFloor(-1) } }));
  const phoneB = el('button', { class: 'od-phonebtn', type: 'button', 'aria-label': 'Phone', text: '📱', on: { click: () => game.phoneOpen() } });
  const now = el('button', { class: 'od-now', type: 'button', hidden: '', on: { click: () => game.happeningOpen() } });
  const stirLine = el('div', { class: 'od-stirline', hidden: '' });
  root.append(top, family, hint, sheet, driveBtn, reticle, floors, phoneB, now, stirLine);
  parent.append(root);

  const quirk = el('p', { class: 'od-quirk' }), pic = el('img', { class: 'od-face', alt: '' }), name = el('h3'), sub = el('small'), doing = el('p', { class: 'od-doing' }), mood = el('span', { class: 'od-mood' });
  const bars = el('div', { class: 'od-needs' }), queue = el('div', { class: 'od-queue' });
  const barEls = {};
  const take = el('button', { type: 'button', class: 'od-sbtn go', text: 'Take over', on: { click: () => game.takeOver(game.selected) } });
  const tell = el('button', { type: 'button', class: 'od-sbtn', text: 'Tell them', on: { click: () => game.tellSelf() } });
  const follow = el('button', { type: 'button', class: 'od-sbtn', text: 'Follow', on: { click: () => game.toggleFollow() } });
  const closeB = el('button', { type: 'button', class: 'od-sbtn', text: 'Close', on: { click: () => game.deselect() } });
  sheet.append(el('div', { class: 'od-shead' }, pic, el('div', { class: 'od-who' }, name, sub, mood)), quirk, doing, bars, queue, el('div', { class: 'od-sbtns' }, take, tell, follow, closeB));

  let shownId = -1;
  const self = {
    floor(n, lv) { floors.hidden = n < 2; if (n >= 2) { const t = lv ? `Floor ${lv}` : 'Ground'; if (floorName.textContent !== t) floorName.textContent = t; } },
    root, sheet,
    /** The top of Happening now: it may catch your eye, nothing more. */
    now(text, count) { now.hidden = !text; if (text) { const t = `📣 ${text}${count > 1 ? ` +${count - 1}` : ''}`; if (now.textContent !== t) now.textContent = t; } },
    stirLine(a, b) { stirLine.hidden = !a; if (a) { const dx = b.x - a.x, dy = b.y - a.y; stirLine.style.cssText = `left:${a.x}px;top:${a.y}px;width:${Math.hypot(dx, dy)}px;transform:rotate(${Math.atan2(dy, dx)}rad)`; } },
    show(v) { root.hidden = !v; },
    time(minute, day) { clock.textContent = clockText(minute, day); },
    speed(x) { for (const b of speedBtns) b.classList.toggle('on', Number(b.dataset.speed) === x); },
    reticle(v) { reticle.hidden = !v; },
    hint(text) { hint.hidden = !text; hint.textContent = text || ''; },
    family(list, town) {
      family.textContent = '';
      for (const id of list) {
        const p = town.roster.people[id], b = el('button', { type: 'button', class: 'od-fam', 'aria-label': p.name, on: { click: () => game.select(id, true) } }, el('img', { alt: '', src: portrait(p) }));
        b.dataset.id = id; family.append(b);
      }
    },
    /** info = the sim's inspect reply; live = the mirror's row, if near. */
    person(id, p, info, row, town) {
      sheet.hidden = id < 0;
      driveBtn.hidden = id >= 0;
      if (id < 0) { shownId = -1; return; }
      if (id !== shownId) {
        shownId = id; pic.src = portrait(p); name.textContent = p.name;
        const job = p.job ? town.roster.jobs[p.job]?.title : p.retired ? 'Retired' : 'Between jobs';
        sub.textContent = `${RACE_NAMES[p.race] || p.race}, ${p.age} · ${job}`;
        quirk.textContent = [...(p.quirks ?? []).map(q => town.roster.quirkLabels?.[q]).filter(Boolean), town.roster.raceMoods?.[p.race]].filter(Boolean).join('. ');
      }
      if (!info) return;
      const m = moodOf(info.mood);
      const bits = info.bits ?? 0;
      mood.textContent = `${bits & 16 ? '🤫 ' : bits & 2 ? '⚡ ' : bits & 1 ? '❤️ ' : ''}${m.icon} ${m.word}`;
      const places = town.roster.places;
      let text = 'Out of sight';
      if (info.trip) text = `${info.trip.mode === 'drive' ? 'Driving' : 'Walking'} to ${placeName(places[info.trip.to])}`;
      else if (info.act) text = `${town.roster.actions[info.act.a]?.label ?? info.act.a} · ${placeName(places[info.act.place])}`;
      doing.textContent = text;
      for (const [n, v] of Object.entries(info.needs)) {
        let e = barEls[n];
        if (!e) { const fill = el('i'); e = barEls[n] = { box: el('div', { class: 'od-need' }, el('span', { text: NEED_NAMES[n] || n }), el('b', {}, fill)), fill }; bars.append(e.box); }
        e.fill.style.width = `${Math.round(v * 100)}%`;
        e.fill.className = v < 0.25 ? 'low' : v < 0.5 ? 'mid' : '';
      }
      queue.textContent = '';
      if (info.orders.length) {
        queue.append(el('span', { class: 'od-qlabel', text: 'Next:' }));
        for (const o of info.orders) queue.append(el('span', { class: 'od-chip', text: game.orderName(o) }));
        queue.append(el('button', { type: 'button', class: 'od-chip x', text: 'Clear', on: { click: () => game.clearOrders() } }));
      }
    },
    following(v) { follow.classList.toggle('on', !!v); },
  };
  return self;
}
