// The screen furniture while you are playing someone. Everything that opens something opens a real sheet (.modal), which is
// what the controller highlight and the keyboard walk, so touch, keys and pad all reach the same lists (PLAN rule 7).
import { clockText } from './mood.js';
import { el } from './shell.js';

export function createHandsHud({ parent, game }) {
  const root = el('div', { class: 'od-hands', hidden: '' });
  const who = el('b', { class: 'od-hwho' }), clock = el('span', { class: 'od-hclock' });
  const handBack = el('button', { type: 'button', class: 'od-hbtn go', text: 'Hand back', on: { click: () => game.handBack() } });
  const partyB = el('button', { type: 'button', class: 'od-hbtn', text: 'Party', on: { click: () => game.partyMenu() } });
  const carB = el('button', { type: 'button', class: 'od-hbtn', text: 'Car', on: { click: () => game.carMenu() } });
  const phoneB = el('button', { type: 'button', class: 'od-hbtn', text: 'Phone', 'aria-label': 'Phone', on: { click: () => game.phoneOpen() } });
  const note = el('div', { class: 'od-hnote', hidden: '' }), hint = el('div', { class: 'od-hhint', hidden: '' });
  root.append(el('div', { class: 'od-htop' }, who, clock), el('div', { class: 'od-hbar' }, handBack, partyB, carB, phoneB), note, hint);
  // the job: what to do, how far, and the needle. It reads the world rather than replacing it (rule 6)
  const job = el('div', { class: 'od-job', hidden: '' }), jobText = el('span'), jobWhere = el('small'), meter = el('div', { class: 'od-meter', hidden: '' }), zone = el('i', { class: 'od-zone' }), nee = el('b');
  meter.append(zone, nee); job.append(jobText, jobWhere, meter); root.append(job);
  parent.append(root);
  let noteTimer = 0;
  return {
    root,
    show(v) { root.hidden = !v; },
    who(text) { who.textContent = text; },
    job(j) {
      job.hidden = !j; if (!j) return;
      if (jobText.textContent !== j.hint) jobText.textContent = j.hint;
      if (jobWhere.textContent !== (j.where ?? '')) jobWhere.textContent = j.where ?? '';
      meter.hidden = j.needle == null;
      if (j.needle != null) { nee.style.left = `${(j.needle * 100).toFixed(1)}%`; const w = (1 - j.zone) * 100; zone.style.left = `${50 - w / 2}%`; zone.style.width = `${w}%`; }
    },
    jobPress(good) { meter.classList.remove('good', 'bad'); void meter.offsetWidth; meter.classList.add(good ? 'good' : 'bad'); },
    time(minute, day) { clock.textContent = clockText(minute, day); },
    /** A small card that goes by itself: nothing to dismiss, nothing that stops you walking. */
    note(title, lines, ms = 6000) { note.textContent = ''; note.append(el('b', { text: title }), ...lines.map(t => el('span', { text: t }))); note.hidden = false; clearTimeout(noteTimer); noteTimer = setTimeout(() => { note.hidden = true; }, ms); },
    hint(text) { hint.hidden = !text; if (text && hint.textContent !== text) hint.textContent = text; },
  };
}
