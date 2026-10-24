// DEFUSE TOGETHER on a screen: the top shows the fuse (a burning cord that shortens, with the seconds), one pip per
// wire, and who holds the device / who holds the rule book. A big "do this now" line says what YOUR role does. The
// DEVICE holder's phone (and a watching TV) shows the clue big (a glowing light, a picture, a number or a word) over
// the wires to snip. A reader's phone shows only their torn page of the book: "clue -> cut the COLOUR wire" lines.
// Solo shows the device with the short book under it. A wrong wire shakes the device and burns the fuse; the end is a
// confetti blast (fail) or "Safe!" (win).
import { COLORS, LIGHTS, GLYPHS } from './sim.js';
import { esc, chip } from '../../client/gamehud.js';

const COLHEX = { red: '#e8343b', blue: '#2f7bff', yellow: '#ffd23f', white: '#f7f7f7', black: '#25222b', green: '#36c25a' };
const P = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor"';
/** The picture keys: plain line drawings, so they are told apart by shape alone (people have to describe them). */
export const GLYPH_SVG = {
  star: `<path ${P} d="M0-10 L3-3 L10-3 L4.5 1.5 L6.5 9 L0 4.5 L-6.5 9 L-4.5 1.5 L-10-3 L-3-3 Z"/>`,
  moon: `<path ${P} d="M4-9 A10 10 0 1 0 4 9 A7 7 0 1 1 4-9 Z"/>`,
  pretzel: `<path ${P} d="M-8 7 C-12 0 -8 -8 -2 -6 C3 -4 3 4 0 6 C-3 4 -3 -4 2 -6 C8 -8 12 0 8 7"/><path ${P} d="M-6 8 L6 8"/>`,
  balloon: `<ellipse ${P} cx="0" cy="-3" rx="6.5" ry="8"/><path ${P} d="M0 5 L-1.5 7 L1.5 7 Z M0 7 C-3 9 3 10 0 12"/>`,
  anchor: `<circle ${P} cx="0" cy="-8" r="2.4"/><path ${P} d="M0-5.5 V9 M-5-2 H5 M-9 3 C-7 9 7 9 9 3"/>`,
  crown: `<path ${P} d="M-9 7 V-5 L-4 1 L0-8 L4 1 L9-5 V7 Z"/>`,
  ghost: `<path ${P} d="M-7 9 V-2 A7 7 0 0 1 7-2 V9 L4 6 L1 9 L-2 6 L-5 9 Z"/><circle ${F} cx="-2.5" cy="-2" r="1.4"/><circle ${F} cx="2.5" cy="-2" r="1.4"/>`,
  fish: `<path ${P} d="M-8 0 C-3-7 5-6 7 0 C5 6 -3 7 -8 0 Z M7 0 L11-5 V5 Z"/><circle ${F} cx="-3" cy="-1" r="1.2"/>`,
  key: `<circle ${P} cx="-5" cy="0" r="4.5"/><path ${P} d="M-0.5 0 H10 M6 0 V4 M9 0 V3"/>`,
  bell: `<path ${P} d="M-8 6 C-6 4 -6 -1 -5 -4 C-3 -9 3 -9 5 -4 C6 -1 6 4 8 6 Z"/><circle ${F} cx="0" cy="8.5" r="1.8"/>`,
  cloud: `<path ${P} d="M-8 6 A4 4 0 0 1 -7 -2 A5.5 5.5 0 0 1 3 -5 A4.5 4.5 0 0 1 9 1 A3 3 0 0 1 7 6 Z"/>`,
  spiral: `<path ${P} d="M0 0 C1-2 3 0 2 2 C0 5 -4 3 -4 0 C-4-5 3-6 5-2 C8 3 3 9 -2 8 C-8 7 -10 0 -8-5"/>`,
  hook: `<path ${P} d="M3-10 V4 A5 5 0 0 1 -7 4 V1 L-9 3"/>`,
  eye: `<path ${P} d="M-10 0 C-5-7 5-7 10 0 C5 7 -5 7 -10 0 Z"/><circle ${F} cx="0" cy="0" r="3"/>`,
  trident: `<path ${P} d="M0 10 V-9 M-6-7 V-1 C-6 2 6 2 6-1 V-7 M0-9 L-1.5-6 M0-9 L1.5-6"/>`,
  cactus: `<path ${P} d="M-2 10 V-8 A2 2 0 0 1 2-8 V10 M-2 1 H-5 A1.5 1.5 0 0 1 -6.5-0.5 V-5 M2 3 H5 A1.5 1.5 0 0 0 6.5 1.5 V-2"/>`,
  kite: `<path ${P} d="M0-10 L7-2 L0 6 L-7-2 Z M0-10 V6 M-7-2 H7 M0 6 C-3 8 3 9 0 11"/>`,
  teapot: `<path ${P} d="M-6 7 H5 C8 4 8-2 5-4 H-5 C-8-2 -8 4 -6 7 Z M5-1 L10-5 M-7-1 C-11-1 -11 4 -7 4 M-2-4 V-6 H2 V-4"/>`,
};
const glyph = (g, cls = '') => `<svg class="dt-g ${cls}" viewBox="-12 -12 24 24" role="img" aria-label="${g}">${GLYPH_SVG[g] || ''}</svg>`;
const KIND_NAME = { light: 'Light', picture: 'Picture', number: 'Number', word: 'Word' };
/** The one line each role needs, per clue kind (round 12: one verb for every module). */
const ASK = { light: 'What colour is the light?', picture: 'What does the picture look like?', number: 'What number is it?', word: 'Spell the word, letter by letter!' };
const SAY = { light: 'Say the light\'s COLOUR out loud.', picture: 'Describe the PICTURE out loud.', number: 'Say the NUMBER out loud.', word: 'SPELL the word out loud — some look alike!' };
const LIGHTHEX = { purple: '#b46bff', orange: '#ff8a3d', pink: '#ff7ac8', teal: '#2ad4c4', brown: '#a8693a', silver: '#c8cdd6' };
/** A clue drawn small (in the book) or big (on the device). */
function clueHtml(kind, v, big = false) {
  if (kind === 'light') { const c = LIGHTS[v]; return `<span class="dt-clue light${big ? ' big' : ''}" style="--l:${LIGHTHEX[c]}"><i></i>${c.toUpperCase()}</span>`; }
  if (kind === 'picture') return `<span class="dt-clue pic${big ? ' big' : ''}">${glyph(GLYPHS[v])}</span>`;
  if (kind === 'number') return `<span class="dt-clue num${big ? ' big' : ''}">${v}</span>`;
  return `<span class="dt-clue word${big ? ' big' : ''}">${esc(v)}</span>`;
}
const wireChip = c => `<span class="dt-wchip" style="--w:${COLHEX[COLORS[c]]}"><i></i>${COLORS[c].toUpperCase()}</span>`;

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  const name = pid => pid === me ? 'You' : (players.find(p => p.pid === pid)?.name || '?');
  ui.innerHTML = `
    <div class="dt-top"><span class="dt-title">Defuse Together</span><span class="clock"><b>--</b></span></div>
    <div class="dt-fuse" aria-hidden="true"><i class="cord"></i><i class="spark"></i></div>
    <div class="dt-pips">${init.kinds.map((k, i) => `<span class="dt-pip" data-i="${i}"><b>${i + 1}</b>${KIND_NAME[k]}</span>`).join('')}</div>
    <div class="dt-who"></div>
    <div class="dt-main"></div>
    <div class="dt-banner"></div>
    <div class="dt-confetti"></div>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching);
  let g = null, pv = null, key = '', role = watching ? 'watch' : 'read';

  function whoHtml() {
    const op = players.find(p => p.pid === g.op), readers = pv?.readers?.filter(r => r !== g.op) || players.filter(p => p.pid !== g.op).map(p => p.pid);
    if (init.solo) return `<span class="dt-tag dev">Device + rule book</span>${op ? chip(op) : ''}`;
    return `<span class="dt-tag dev">Device</span>${op ? chip(op) : ''}<span class="dt-tag book">Rule book</span>${readers.map(pid => { const p = players.find(x => x.pid === pid); return p ? chip(p) : ''; }).join('')}`;
  }
  // ---- the device: the clue, big, and the wires to cut
  function deviceHtml(d, live) {
    const dis = live ? '' : ' disabled';
    const wires = `<div class="dt-wires">${d.w.map((c, i) => `<button class="dt-wire${d.cut[i] ? ' cut' : ''}" data-a="cut" data-d="${i}" style="--w:${COLHEX[COLORS[c]]}"${dis || (d.cut[i] ? ' disabled' : '')} aria-label="${COLORS[c]} wire${d.cut[i] ? ', cut' : ''}"><span class="cable"><i></i><i></i></span><span class="lab">${COLORS[c].toUpperCase()}</span><span class="snip" aria-hidden="true">✂</span></button>`).join('')}</div>`;
    return `<div class="dt-device"><div class="dt-cannon" aria-hidden="true"><i class="barrel"></i><i class="wheel"></i><i class="wheel r"></i></div><div class="dt-mod"><h3>Wire ${g.mod + 1} of ${init.n} · the clue</h3><div class="dt-cluebox">${clueHtml(d.k, d.v, true)}</div>${wires}</div></div>`;
  }
  // ---- the rule book page: "clue -> cut the COLOUR wire"
  function pageHtml(p) {
    const lines = p.lines || [];
    const rows = lines.map(l => `<li>${clueHtml(p.kind, l.v)}<span class="arrow">→ cut</span>${wireChip(l.col)}</li>`).join('');
    const others = (p.readers || []).filter(r => r !== me && r !== g.op).map(name);
    const nudge = init.solo ? '' : `<p class="dt-nudge">${others.length ? `${esc(others.join(' and '))} ${others.length > 1 ? 'have' : 'has'} the other lines — the clue may be on theirs.` : 'You have the whole book.'}</p>`;
    return `<div class="dt-book"><h3>Rule book · ${KIND_NAME[p.kind]}</h3><ol class="dt-lines ${p.kind}">${rows || '<li>(no lines for you this time)</li>'}</ol>${nudge}</div>`;
  }
  /** The big "do this now" line at the top of the main panel. */
  function todo(kind) {
    if (role === 'both') return `<p class="dt-todo">Find the clue in the rule book, then <b>cut that wire</b>.</p>`;
    if (role === 'op') return `<p class="dt-todo"><b>You hold the device!</b> ${SAY[kind]} Then cut the wire your team shouts.</p>`;
    if (role === 'read') return `<p class="dt-todo"><b>You hold the rule book.</b> Ask ${esc(name(g.op))}: “${ASK[kind]}” If it is on your page, <b>shout the wire colour!</b></p>`;
    return `<p class="dt-todo">${esc(name(g.op))} holds the device; the rule book is on the other phones.</p>`;
  }
  function draw() {
    if (!g) return;
    $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.left <= 15);
    const frac = Math.max(0, Math.min(1, g.fuse / init.fuse)); ui.style.setProperty('--fuse', frac);
    ui.querySelectorAll('.dt-pip').forEach((p, i) => { p.classList.toggle('done', i < g.mod || g.phase === 'done'); p.classList.toggle('now', i === g.mod && g.phase === 'go'); });
    role = watching ? 'watch' : (pv && pv.mod === g.mod ? pv.role : (g.op === me ? 'op' : 'read'));
    const k2 = JSON.stringify([g.mod, g.phase, g.dev, role, pv?.mod, pv?.lines?.length]);
    if (k2 === key) return; key = k2;
    $('.dt-who').innerHTML = whoHtml();
    if (g.phase === 'swap') { const by = !init.solo && g.by != null ? `<span>${g.by === me ? 'You' : esc(name(g.by))} had the right line!</span>` : ''; $('.dt-main').innerHTML = `<div class="dt-msg"><b>Wire ${g.mod + 1} cut — phew!</b>${by}<span>Next the device goes to <b>${esc(name(init.ops[g.mod + 1]))}</b>…</span></div>`; return; }
    if (g.phase !== 'go') { $('.dt-main').innerHTML = `<div class="dt-msg ${g.phase}"><b>${g.phase === 'done' ? 'Safe! The cannon fizzles out.' : 'POP! Confetti everywhere!'}</b></div>`; return; }
    const live = (role === 'op' || role === 'both');
    if (role === 'read' && pv) $('.dt-main').innerHTML = todo(g.dev.k) + pageHtml(pv);
    else $('.dt-main').innerHTML = todo(g.dev.k) + deviceHtml(g.dev, live) + (role === 'both' && pv ? pageHtml(pv) : '');
  }
  ui.addEventListener('click', e => {
    const b = e.target.closest('button[data-a]'); if (!b || b.disabled || !g || g.phase !== 'go' || (role !== 'op' && role !== 'both')) return;
    const a = b.dataset.a, d = +b.dataset.d;
    ctx.send(a, d); ctx.sfx('tap');
    if (a === 'cut') b.classList.add('cut');
  });
  function banner(text, cls = '') { const b = $('.dt-banner'); b.textContent = text; b.className = 'dt-banner ' + cls; void b.offsetWidth; b.classList.add('show'); }
  function confetti() {
    const box = $('.dt-confetti'), cols = ['#ff4d6d', '#ffd23f', '#3d8bff', '#3ecf5a', '#b46bff', '#ff8a3d'];
    box.innerHTML = Array.from({ length: 70 }, (_, i) => `<i style="--x:${(i * 37) % 100}vw;--d:${(i % 7) * 0.08}s;--r:${(i * 53) % 360}deg;background:${cols[i % cols.length]}"></i>`).join('');
  }
  return {
    state(s) { g = s; draw(); },
    priv(d) { pv = d; key = ''; draw(); },
    event(ev) {
      if (ev.e === 'oops') { ctx.sfx('bad'); banner(`Wrong wire! -${ev.cost}s`, 'bad'); navigator.vibrate?.(120); const d = $('.dt-device'); d?.classList.remove('shake'); void d?.offsetWidth; d?.classList.add('shake'); }
      else if (ev.e === 'defused') { ctx.sfx('good'); banner('Snip! ✓', 'good'); }
      else if (ev.e === 'next') { if (ev.op === me) { ctx.sfx('pick'); banner('You hold the device!'); } else banner(`${name(ev.op)} holds the device`); }
      else if (ev.e === 'snip') ctx.sfx('throw');
      else if (ev.e === 'boom') { ctx.sfx('splat'); confetti(); banner('POP!', 'bad'); }
      else if (ev.e === 'safe') { ctx.sfx('win'); banner('Safe!', 'good'); }
    },
    frame() {},
    dispose() {},
  };
}
