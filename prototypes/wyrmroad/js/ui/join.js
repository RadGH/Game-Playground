// Local co-op join ("press to join"): four seats. Join with the whole keyboard (Enter), the keyboard's left half (F) or
// right half (K) for two people on one keyboard, up to four controllers (A), or touch (one player). Each seat picks a
// saved hero (← →) or makes a quick one, then readies up (Attack). Jump / B leaves the seat. Mouse and touch work on
// every card too. Start when everyone seated is ready; the first seat's hero leads on the chapter map.
import { icon } from './icons.js';
import { esc, CLASS_NAMES } from './text.js';
import { hp as n } from '../../../../shared/format.js';
import { SCHEMES, keyLabel, schemeFor } from '../input/bindings.js';
import { COLORS, COLOR_NAMES } from './party.js';
import { newHero } from '../save.js';
import { randomLook, randomName } from './looks.js';

const DEVICE_NAME = { kb: 'Keyboard', kbL: 'Keyboard, left keys', kbR: 'Keyboard, right keys', touch: 'Touch' };
const KEY_DEVICES = ['kb', 'kbL', 'kbR'];
/** Two keyboard seats can share the keyboard only when no key belongs to both (Esc pauses for everyone). The mouse
 *  layout (WASD + clicks) leaves the arrows and right-hand keys free, so it sits beside the right-keys player. */
function clash(a, b) {
  const codes = d => { const S = SCHEMES[schemeFor(d)]; return new Set([...Object.values(S.move), ...Object.values(S.keys)].flat().filter(c => c !== 'Escape')); };
  const A = codes(a); for (const c of codes(b)) if (A.has(c)) return true;
  return false;
}
const devName = d => DEVICE_NAME[d] || (d.startsWith('pad:') ? `Controller ${+d.slice(4) + 1}` : d);
const CLASS_ORDER = ['vanguard', 'duelist', 'arcanist', 'warden'];

export function joinScreen(app) {
  const { data } = app;
  const seats = [null, null, null, null];            // { device, heroId, ready }
  const touchy = matchMedia('(pointer: coarse)').matches;
  let starting = 0;

  app.ui.innerHTML = `<section class="wr-screen wr-join">
    <header class="wr-bar"><button type="button" class="wr-icon-btn" data-back aria-label="Back">${icon('back')}</button><h2>Local co-op</h2><div class="wr-grow"></div>
      <button type="button" class="wr-icon-btn" data-act="menu" aria-label="Menu">${icon('menu')}</button></header>
    <p class="wr-join-lead">Up to four heroes on this screen. Two people can share one keyboard.</p>
    <div class="wr-seats"></div>
    <footer class="wr-join-foot"><p class="wr-join-status" role="status"></p><button type="button" class="wr-btn wr-big wr-primary" data-act="start" disabled>${icon('play')}<span><b>Start</b><small>Everyone ready</small></span></button></footer>
  </section>`;
  const root = app.ui.firstElementChild, box = root.querySelector('.wr-seats');
  const taken = d => seats.some(s => s?.device === d);
  const blocked = d => seats.some(s => s && KEY_DEVICES.includes(s.device) && (s.device === d || clash(s.device, d)));
  const kbTaken = () => blocked('kb');

  function heroesFree(i) { const used = new Set(seats.filter((s, k) => s && k !== i).map(s => s.heroId)); return app.save.heroes.filter(h => !used.has(h.id)); }
  function join(device) {
    if (taken(device)) return;
    if (KEY_DEVICES.includes(device) && blocked(device)) return;
    const i = seats.indexOf(null); if (i < 0) return;
    const free = heroesFree(i);
    const pick = i === 0 && free.find(h => h.id === app.save.lastHero) || free[0];
    seats[i] = { device, heroId: pick?.id || null, ready: false };
    app.audio.play('ui.open'); draw();
  }
  function leave(i) { seats[i] = null; for (let k = i; k < 3; k++) { seats[k] = seats[k + 1]; seats[k + 1] = null; } app.audio.play('ui.close'); draw(); }
  function cycle(i, d) {
    const s = seats[i]; if (!s || s.ready) return;
    const free = heroesFree(i), ids = [...free.map(h => h.id), null];   // null = make a quick hero
    const k = ids.indexOf(s.heroId);
    s.heroId = ids[(k + d + ids.length) % ids.length];
    app.audio.play('ui.tab'); draw();
  }
  function ready(i) {
    const s = seats[i]; if (!s) return;
    if (!s.heroId) { quick(i); return; }
    s.ready = !s.ready; app.audio.play(s.ready ? 'equip' : 'ui.click'); draw();
  }
  function quick(i) {
    const cls = CLASS_ORDER[(i + app.save.heroes.length) % 4];
    const h = newHero(data, { name: randomName(Math.random, app.save.heroes.map(x => x.name)), cls, look: randomLook(data.classes, cls) });
    app.save.heroes.push(h); app.saveNow();
    seats[i].heroId = h.id; app.note(`${h.name} the ${CLASS_NAMES[cls]} joins your heroes.`); draw();
  }
  function draw() {
    const freeDevices = [
      !kbTaken() && ['Enter', 'Keyboard'], !blocked('kbL') && ['F', 'Left keys'], !blocked('kbR') && ['K', 'Right keys'],
    ].filter(Boolean);
    box.innerHTML = seats.map((s, i) => {
      if (!s) return `<article class="wr-seat wr-seat-empty" style="--pc:${COLORS[i]}">
        <p class="wr-seat-num">Player ${i + 1}</p>
        <div class="wr-seat-wait">${icon('plus')}<b>Press to join</b></div>
        <ul class="wr-join-keys">${freeDevices.map(([k, l]) => `<li><kbd>${k}</kbd><span>${l}</span></li>`).join('')}<li><kbd>A</kbd><span>Controller</span></li></ul>
        <div class="wr-seat-btns">${!kbTaken() ? `<button type="button" class="wr-btn wr-small" data-join="kb">${icon('keyboard')}<span>Keyboard</span></button>` : ''}
          ${!taken('touch') && (touchy || i === 0) ? `<button type="button" class="wr-btn wr-small" data-join="touch">${icon('touch')}<span>Touch</span></button>` : ''}</div>
      </article>`;
      const h = s.heroId && app.hero(s.heroId), sch = s.device.startsWith('pad:') ? 'pad' : s.device;
      const k = a => (SCHEMES[sch]?.kind === 'touch' ? '' : a === 'attack' && SCHEMES[schemeFor(sch)]?.mouse ? 'Enter' : keyLabel(sch, a));
      return `<article class="wr-seat${s.ready ? ' wr-seat-ready' : ''}" data-seat="${i}" style="--pc:${COLORS[i]}">
        <p class="wr-seat-num">Player ${i + 1} · <span>${COLOR_NAMES[i]}</span></p>
        <p class="wr-seat-dev">${icon(s.device === 'touch' ? 'touch' : sch === 'pad' ? 'pad' : 'keyboard')}<span>${esc(devName(s.device))}</span></p>
        <div class="wr-seat-hero">
          <button type="button" class="wr-step" data-cyc="-1" aria-label="Previous hero" ${s.ready ? 'disabled' : ''}>${icon('back')}</button>
          <div class="wr-portrait wr-portrait-md" data-portrait="${i}">${h ? '<span class="wr-portrait-wait"></span>' : icon('dice', 'wr-quick-ic')}</div>
          <button type="button" class="wr-step" data-cyc="1" aria-label="Next hero" ${s.ready ? 'disabled' : ''}>${icon('next')}</button>
        </div>
        <h3>${h ? esc(h.name) : 'Quick hero'}</h3>
        <p class="wr-seat-cls">${h ? `Level ${n(h.level)} ${esc(CLASS_NAMES[h.cls])}` : 'A new hero of a random class'}</p>
        ${sch !== 'touch' ? `<p class="wr-seat-keys"><kbd>${esc(k('left'))} ${esc(k('right'))}</kbd> hero <kbd>${esc(k('attack'))}</kbd> ${s.ready ? 'not ready' : h ? 'ready' : 'make'} <kbd>${esc(k('jump'))}</kbd> leave</p>` : ''}
        <div class="wr-seat-btns">
          <button type="button" class="wr-btn ${s.ready ? 'on' : 'wr-primary'}" data-ready="${i}">${icon(s.ready ? 'check' : h ? 'check' : 'dice')}<span>${s.ready ? 'Ready' : h ? 'Ready up' : 'Make hero'}</span></button>
          <button type="button" class="wr-btn wr-ghost" data-leave="${i}">${icon('close')}<span>Leave</span></button>
        </div>
      </article>`;
    }).join('');
    seats.forEach((s, i) => { const h = s?.heroId && app.hero(s.heroId); if (h) app.portrait({ look: app.heroLook(h) }, 160).then(url => { const el = box.querySelector(`[data-portrait="${i}"]`); if (el && url && seats[i]?.heroId === h.id) el.innerHTML = `<img src="${url}" alt="">`; }); });
    const sat = seats.filter(Boolean), allReady = sat.length > 0 && sat.every(s => s.ready);
    const start = root.querySelector('[data-act="start"]'); start.disabled = !allReady;
    root.querySelector('.wr-join-status').textContent = !sat.length ? 'Nobody has joined yet.' : allReady ? `${sat.length} ready. Starting…` : `${sat.filter(s => s.ready).length} of ${sat.length} ready`;
    starting = allReady && sat.length > 1 ? performance.now() + 2500 : 0;
  }
  function go() {
    const sat = seats.filter(Boolean); if (!sat.length || !sat.every(s => s.ready)) return;
    app.party = sat.map((s, i) => ({ pid: `p${i + 1}`, device: s.device, heroId: s.heroId, color: COLORS[i] }));
    app.save.lastHero = sat[0].heroId; app.saveNow(false);
    app.go('map', { heroId: sat[0].heroId });
  }
  root.addEventListener('click', e => {
    const t = e.target;
    const j = t.closest('[data-join]'); if (j) return join(j.dataset.join);
    const c = t.closest('[data-cyc]'); if (c) return cycle(+c.closest('[data-seat]').dataset.seat, +c.dataset.cyc);
    const r = t.closest('[data-ready]'); if (r) return ready(+r.dataset.ready);
    const l = t.closest('[data-leave]'); if (l) return leave(+l.dataset.leave);
    const b = t.closest('[data-act], [data-back]'); if (!b) return;
    if (b.hasAttribute('data-back')) return app.go('title');
    if (b.dataset.act === 'menu') return app.openMenu();
    if (b.dataset.act === 'start') go();
  });

  // keys: join keys open a seat; a seated keyboard scheme's own keys work its card
  const offKey = app.input.onKey((code, e) => {
    if (document.querySelector('.wr-sheet, .modal')) return;
    for (const [i, s] of seats.entries()) {
      if (!s || s.device.startsWith('pad:') || s.device === 'touch') continue;
      const S = SCHEMES[schemeFor(s.device)];
      if (S.move.left.includes(code)) { e.preventDefault(); return cycle(i, -1); }
      if (S.move.right.includes(code)) { e.preventDefault(); return cycle(i, 1); }
      if (S.keys.attack.includes(code) || (s.device === 'kb' && code === 'Enter')) { e.preventDefault(); return ready(i); }
      if (S.keys.jump.includes(code)) { e.preventDefault(); return leave(i); }
    }
    if (code === 'Escape') return app.go('title');
    if (code === 'Enter' || code === 'KeyJ') { if (!kbTaken()) join('kb'); else if (seats.filter(Boolean).every(s => s.ready)) go(); return; }
    if (code === 'KeyF') return join('kbL');
    if (code === 'KeyK') return join('kbR');
  });
  app.loop = () => {
    for (const p of app.input.padPresses([0, 1, 9])) {
      const d = `pad:${p.index}`, i = seats.findIndex(s => s?.device === d);
      if (i < 0) { if (p.button === 0 || p.button === 9) join(d); else if (p.button === 1 && !seats.some(Boolean)) app.go('title'); continue; }
      if (p.axis) cycle(i, p.axis);
      else if (p.button === 0) ready(i);
      else if (p.button === 1) leave(i);
      else if (p.button === 9 && seats.filter(Boolean).every(s => s.ready)) go();
    }
    // d-pad left/right on a seated pad also cycles heroes
    for (const p of app.input.pads()) {
      const i = seats.findIndex(s => s?.device === `pad:${p.index}`); if (i < 0) continue;
      const L = !!p.buttons[14]?.pressed, R = !!p.buttons[15]?.pressed, k = `dp${p.index}`;
      if ((L || R) && !app[k]) cycle(i, L ? -1 : 1);
      app[k] = L || R;
    }
    if (starting && performance.now() > starting) { starting = 0; go(); }
    app.view.update(app.sceneG('millbrook'), 1, 1 / 60);
  };
  app.view.setChapter('millbrook'); app.view.scenic(true);
  draw();
  return () => offKey();
}
