// W9 professions — the mini-game FRAME: one small panel that plays any of the eight games (prof-games.js is the
// view-model, prof-draw.js the picture; the pattern and the scoring are P-core's js/rules/professions-games.js).
//
//   const mini = createMinigame({ sound, words })
//   const result = await mini.play({ game, prof, title, sub, tint, mins })   // game = gatherR.game / craftR.game
//        -> { type, inputs: [t0, v0, …], marks, score, quality, flags, ms }  or null when the player gave up (Esc / ×)
//   mini.showResult({ quality, lines, items, note })                        // the server's answer, on the card already showing
//   mini.close()
//
// INPUT — every game is playable with one thumb, a keyboard, a mouse or a gamepad (rows `profWork` / `profLeft` /
// `profRight` of js/client/input/bindings.js):
//   work    Space · E · Enter · F          pad A            tap the panel
//   left    A · ←                          pad X · D-pad ←  tap the left half   (logging: that side · foraging: move · forge: the fire)
//   right   D · →                          pad B · D-pad →  tap the right half
//   foraging also takes 1–6 and a tap on the bud itself; skinning follows the mouse / a finger / the left stick, or
//   "hold work = lift the knife".
// While a game is on screen every other game key is swallowed (the character does not walk off, jump or strike), and
// <html data-prof="<type>"> tells the input layer to leave the pad's world layer alone (the stick would walk you away).
//
// TIME — Y19 (G2, report #21: "I do not know where to put the mouse before it begins"): every game opens in a READY
// state — the picture at time 0 and "Tap to begin" over it. The clock starts at the first work key, click or touch (that
// press is NOT an input of the game), or by itself after READY_MAX_MS; the server started its own clock when it sent the
// game, which is why its `lateMs` allowance (data/rules/professions.json) is longer than this wait. From then on every
// input is stamped with the moment it was made, not the moment a frame was drawn: at 10 frames a second a press still
// lands where it was pressed. The picture is one <canvas>, redrawn each frame.

import { h } from '../ui-panel.js';
import { createRun, HOW, GAME_INPUT, QUALITY_WORD, PROF_OF_GAME } from './prof-games.js';
import { drawGame, hitTest, pointFor } from './prof-draw.js';
import { padLayers, PAD_INDEX } from '../input/bindings.js';
import { profIcon, PROF_NAME } from './prof-icons.js';

const WORK = new Set(['Space', 'KeyE', 'Enter', 'NumpadEnter', 'KeyF']);
const LEFT = new Set(['KeyA', 'ArrowLeft']), RIGHT = new Set(['KeyD', 'ArrowRight']), UP = new Set(['KeyW', 'ArrowUp']);
const PASS = /^(F\d+|Tab|Meta|OS|Control|Alt|Shift|CapsLock|PrintScreen)/;          // keys the browser keeps
/** Y19 (G2): how long a game waits for the player before it starts by itself (the server allows lateMs = 10 s). */
export const READY_MAX_MS = 6000;
const READY_HOW = {
  keyboard: { trace: 'Put the mouse on the knife, then click — or press Space — to begin.', any: 'Press Space (or click) when you are ready.' },
  pad: { trace: 'Press the work button when you are ready.', any: 'Press the work button when you are ready.' },
  touch: { trace: 'Put your finger on the knife to begin.', any: 'Tap when you are ready.' },
};
const device = () => document.documentElement.dataset.input || (window.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'keyboard');

/** "{work} when …" -> text nodes and key caps (input/hints.js re-labels a <kbd data-action> for the device in use). */
export function howNodes(text) {
  const CAP = { work: ['profWork', 'Space'], left: ['profLeft', 'A'], right: ['profRight', 'D'] };
  return String(text).split(/(\{work\}|\{left\}|\{right\})/).filter(Boolean).map(part => { const m = /^\{(\w+)\}$/.exec(part); return m ? h('kbd', { dataset: { action: CAP[m[1]][0] } }, CAP[m[1]][1]) : part; });
}

export function createMinigame({ sound = null, words = () => QUALITY_WORD, parent = null } = {}) {
  const root = h('div.tv-prof', { hidden: true });
  (parent || document.getElementById('hud') || document.body).appendChild(root);
  const S = { run: null, t0: 0, raf: 0, resolve: null, opts: null, noteN: 0, canvas: null, ctx: null, w: 0, h: 0, card: null, closeT: 0, padPrev: {}, padAim: false, lastDraw: 0, frames: 0 };
  const PAD = padLayers().ctx?.prof || { A: 'profWork', X: 'profLeft', B: 'profRight' };
  const now = () => performance.now() - S.t0;
  /** The moment an input was MADE: a real key or finger event carries the time the device reported it, which on a busy frame is well before its handler runs. */
  const at = e => { const n = performance.now(), ts = e && e.isTrusted && e.timeStamp > 0 && e.timeStamp <= n && n - e.timeStamp < 3000 ? e.timeStamp : n; return ts - S.t0; };
  const say = (state, extra = {}) => {
    root.dataset.state = state;
    if (state === 'play' || state === 'ready') document.documentElement.dataset.prof = S.run.type; else delete document.documentElement.dataset.prof;   // Y19 (G2): the pad and the keys stand back from "ready" on
    window.dispatchEvent(new CustomEvent('tv:prof', { detail: { state, prof: S.opts?.prof || null, game: S.run?.type || null, ...extra } }));
  };

  // ---- inputs: each one first moves the run to THIS moment, then is applied ---------------------------------------
  function feedback(n) {
    if (!n) return;
    const type = S.run.type;
    if (!n.auto) sound?.note(type, n.kind === 'hit' || n.kind === 'perfect' || n.kind === 'reheat' || n.kind === 'spill' || n.kind === 'over' || n.kind === 'move' ? n.kind : 'miss');
    if (n.kind === 'move' || n.auto) return;
    const cls = n.kind === 'perfect' ? 'flash-perfect' : n.kind === 'hit' ? 'flash-hit' : n.kind === 'reheat' ? '' : 'flash-miss';
    if (cls) { root.classList.remove('flash-perfect', 'flash-hit', 'flash-miss'); void root.offsetWidth; root.classList.add(cls); }
    try { if (n.kind === 'perfect') navigator.vibrate?.(18); else if (n.kind === 'hit') navigator.vibrate?.(8); } catch { /* no haptics */ }
  }
  const playing = () => !!S.run && !S.run.done && root.dataset.state === 'play';
  const waiting = () => !!S.run && root.dataset.state === 'ready';
  /** Y19 (G2): the player is ready — the clock starts NOW. Returns true when this call started it. */
  function begin() {
    if (!waiting()) return false;
    clearTimeout(S.readyT); clearInterval(S.readyTick);
    root.querySelector('.prof-ready')?.remove();
    S.t0 = performance.now(); S.beganAt = S.t0;
    say('play'); draw();
    sound?.note(S.run.type, 'start');
    clearTimeout(S.dog); S.dog = setTimeout(watchdog, 250);
    return true;
  }
  function act(fn, e = null) { if (!playing()) return; S.run.advanceTo(Math.max(S.run.t, at(e))); const n = fn(S.run); feedback(n); if (S.run.done) finish(); else draw(); }
  const work = e => act(r => (r.type === 'trace' ? r.hold(true) : r.type === 'rhythm' ? null : r.press()), e);
  const workUp = e => act(r => (r.type === 'trace' ? r.hold(false) : null), e);
  const side = (dir, e) => act(r => (r.type === 'rhythm' ? r.press(dir > 0 ? 1 : 0) : r.type === 'pick' ? (r.move(dir), r.state.note) : r.type === 'forge' ? r.press(1) : null), e);
  const place = (i, e) => act(r => (r.type === 'pick' && i < r.game.spots ? r.press(i) : null), e);
  const aim = (y, e) => { if (!playing() || S.run.type !== 'trace') return; S.run.advanceTo(Math.max(S.run.t, at(e))); S.run.aim(y); };

  function onKey(e) {
    if (!S.run || root.hidden) return;
    const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (typing || e.ctrlKey || e.metaKey || e.altKey || PASS.test(e.code)) return;
    const down = e.type === 'keydown';
    if (root.dataset.state === 'result') {                               // the card: any work key or Esc puts it away
      if (down && !e.repeat && (WORK.has(e.code) || e.code === 'Escape') && performance.now() - S.cardAt > 350) { e.preventDefault(); e.stopImmediatePropagation(); close(); }
      return;
    }
    e.preventDefault(); e.stopImmediatePropagation();                     // nothing else in the game hears a key while a game is being played
    if (e.repeat) return;
    if (e.code === 'Escape') { if (down) cancel(); return; }
    // Y19 (G2): ready — the first work / side / number key starts the clock and is not an input of the game
    if (waiting()) { if (down && (WORK.has(e.code) || LEFT.has(e.code) || RIGHT.has(e.code) || UP.has(e.code) || /^(Digit|Numpad)[1-9]$/.test(e.code))) { S.startKey = e.code; begin(); } return; }
    if (!down && e.code === S.startKey) { S.startKey = null; return; }       // … and neither is letting that key go
    if (WORK.has(e.code) || (S.run.type === 'trace' && UP.has(e.code))) { if (down) work(e); else workUp(e); return; }
    if (!down) return;
    if (LEFT.has(e.code)) side(-1, e); else if (RIGHT.has(e.code)) side(1, e);
    else if (/^(Digit|Numpad)[1-9]$/.test(e.code)) place(+e.code.slice(-1) - 1, e);
  }
  window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKey, true);
  window.addEventListener('blur', () => { if (playing() && S.run.type === 'trace') S.run.hold(false); });

  function pointer(e) {
    // Y19 (G2): ready — the first touch / click starts the clock; in the trace game it also puts the knife under the finger
    if (waiting()) { if (e.type !== 'pointerdown') return; e.preventDefault(); begin(); if (S.run.type !== 'trace') return; }
    if (!playing()) return;
    const r = S.canvas.getBoundingClientRect(), x = (e.clientX - r.left) * (S.w / r.width), y = (e.clientY - r.top) * (S.h / r.height);
    const hit = hitTest(S.run, S.w, S.h, x, y);
    if (e.type === 'pointerdown') {
      e.preventDefault(); try { S.canvas.setPointerCapture(e.pointerId); } catch { /* old browser */ }
      S.padAim = false;
      if (hit.aim != null) aim(hit.aim, e); else act(run => run.press(hit.press), e);
    } else if (hit.aim != null && (e.pointerType === 'mouse' || e.buttons || e.pressure > 0)) aim(hit.aim, e);
  }
  /** The pad, read here while a game is up (input/gamepad.js stands back: see <html data-prof>). */
  function pollPad() {
    let pad = null; try { pad = [...(navigator.getGamepads?.() || [])].find(p => p && p.connected !== false) || null; } catch { return; }
    if (!pad) return;
    const on = name => { const b = pad.buttons[PAD_INDEX[name]]; return !!b && (b.pressed || b.value > 0.5); };
    const lx = pad.axes[0] || 0, ly = pad.axes[1] || 0;
    const state = { work: Object.keys(PAD).some(b => PAD[b] === 'profWork' && on(b)), left: Object.keys(PAD).some(b => PAD[b] === 'profLeft' && on(b)) || on('LEFT') || lx < -0.6, right: Object.keys(PAD).some(b => PAD[b] === 'profRight' && on(b)) || on('RIGHT') || lx > 0.6, back: on('START') };
    const P = S.padPrev;
    if (root.dataset.state === 'result') { if (state.work && !P.work && performance.now() - S.cardAt > 350) close(); }
    else if (waiting()) { if ((state.work && !P.work) || (state.left && !P.left) || (state.right && !P.right)) begin(); else if (state.back && !P.back) cancel(); }      // Y19 (G2)
    else {
      if (state.work !== !!P.work) { if (state.work) work(); else workUp(); }
      if (state.left && !P.left) side(-1);
      if (state.right && !P.right) side(1);
      if (state.back && !P.back) cancel();
      if (S.run?.type === 'trace') { if (Math.abs(ly) > 0.2) S.padAim = true; if (S.padAim && !state.work) aim(0.5 - ly * 0.46); }
    }
    S.padPrev = state;
  }

  // ---- drawing -----------------------------------------------------------------------------------------------
  function size() {
    if (!S.canvas) return;
    const r = S.canvas.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
    S.w = Math.max(200, Math.round(r.width)); S.h = Math.max(120, Math.round(r.height));
    if (S.canvas.width !== Math.round(S.w * dpr) || S.canvas.height !== Math.round(S.h * dpr)) { S.canvas.width = Math.round(S.w * dpr); S.canvas.height = Math.round(S.h * dpr); }
    S.ctx = S.canvas.getContext('2d'); S.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function draw() {
    if (!S.run || !S.ctx) return;
    const dev = device();
    drawGame(S.ctx, S.run, S.w, S.h, { tint: S.opts.tint, cursor: dev !== 'touch', numbers: dev === 'keyboard' });
    if (S.time) S.time.style.width = (S.run.view().left * 100).toFixed(1) + '%';
  }
  function frame() {
    if (!S.run || root.hidden) return;
    pollPad(); S.frames++;
    if (root.dataset.state === 'play') {
      S.run.advanceTo(now());
      const n = S.run.state.note; if (n && n.n !== S.noteN) { S.noteN = n.n; if (n.auto || n.kind === 'spill' || n.kind === 'over') feedback(n.auto ? null : n); }
      draw();
      if (S.run.done) { finish(); }
    }
    S.raf = requestAnimationFrame(frame);
  }
  // a throttled or hidden tab still has to END the game on time (the server waits ms + 4 s and no longer)
  function watchdog() { if (!S.run) return; if (root.dataset.state === 'play') { S.run.advanceTo(now()); if (S.run.done) finish(); else S.dog = setTimeout(watchdog, 250); } }

  // ---- the life of one game ----------------------------------------------------------------------------------
  function play(opts) {
    if (S.run) abort();
    clearTimeout(S.closeT);
    const game = opts.game, type = game.type, dev = device(), prof = opts.prof || PROF_OF_GAME[type];
    S.opts = { ...opts, prof }; S.run = createRun(game, { mins: opts.mins }); S.noteN = 0; S.padPrev = { work: true, left: true, right: true, back: true }; S.padAim = false; S.frames = 0;
    S.canvas = h('canvas.prof-canvas', { 'aria-label': HOW[type].title });
    S.time = h('i');
    const x = h('button.prof-x', { type: 'button', 'aria-label': 'Stop', dataset: { tip: 'Stop (Esc). Nothing is lost.' }, onclick: () => cancel() }, '×');
    const panel = h('div.prof-game', { role: 'application', 'aria-label': `${PROF_NAME[prof] || prof}: ${HOW[type].title}` },
      h('header.prof-head', {}, h('i.prof-ico', {}, profIcon(prof, 24)),
        h('div.prof-titles', {}, h('strong', {}, opts.title || HOW[type].title), h('span', {}, opts.sub || PROF_NAME[prof] || '')), x),
      h('p.prof-how', {}, ...howNodes(HOW[type][dev] || HOW[type].keyboard)),
      h('div.prof-stage', {}, S.canvas,
        // Y19 (G2): the ready card — nothing moves until the player says so (or READY_MAX_MS pass)
        h('div.prof-ready', { role: 'status' }, h('strong', {}, dev === 'touch' ? 'Tap to begin' : 'Ready?'), h('span', {}, (READY_HOW[dev] || READY_HOW.keyboard)[type === 'trace' ? 'trace' : 'any']), S.readyLeft = h('small', {}, `Begins by itself in ${Math.round(READY_MAX_MS / 1000)} s`))),
      h('div.prof-time', {}, S.time));
    for (const ev of ['pointerdown', 'pointermove']) S.canvas.addEventListener(ev, pointer);
    S.canvas.addEventListener('contextmenu', e => e.preventDefault());
    root.dataset.type = type; root.dataset.prof = prof; root.hidden = false; root.replaceChildren(panel);
    root.classList.remove('flash-perfect', 'flash-hit', 'flash-miss');
    S.t0 = performance.now(); S.startKey = null; S.beganAt = 0;
    size(); say('ready'); draw();
    cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(frame);
    clearTimeout(S.dog);
    // Y19 (G2): wait for the player — but not for ever (the server's clock is already running)
    const wait = Number.isFinite(opts.readyMs) ? opts.readyMs : READY_MAX_MS, shownAt = performance.now();
    clearTimeout(S.readyT); clearInterval(S.readyTick);
    if (wait <= 0) begin();
    else { S.readyT = setTimeout(begin, wait); S.readyTick = setInterval(() => { const left = Math.max(0, Math.ceil((wait - (performance.now() - shownAt)) / 1000)); if (S.readyLeft) S.readyLeft.textContent = `Begins by itself in ${left} s`; }, 250); }
    return new Promise(res => { S.resolve = res; });
  }
  function finish() {
    if (root.dataset.state !== 'play') return;
    clearTimeout(S.dog);
    const r = S.run.result();
    S.endAt = performance.now(); S.cardAt = S.endAt;
    draw();
    // the card comes up at once with what the player's own machine scored; the server's answer fills it in (and wins)
    S.card = h('div.prof-card', { role: 'status' });
    root.querySelector('.prof-game').append(S.card);
    say('result', { quality: r.quality, score: r.score });
    paintCard({ quality: r.quality, pending: true });
    sound?.result(r.quality);
    const res = S.resolve; S.resolve = null; res?.(r);
    clearTimeout(S.closeT); S.closeT = setTimeout(close, 9000);          // nobody answered: do not sit there for ever
  }
  function paintCard({ quality, title = null, lines = [], items = [], note = null, pending = false }) {
    if (!S.card) return;
    const W = words() || QUALITY_WORD, word = W[quality] || QUALITY_WORD[quality] || quality;
    S.card.dataset.q = quality;
    S.card.replaceChildren(...[
      h('strong.prof-q', {}, word), title ? h('span.prof-what', {}, title) : null,
      ...items.map(it => h('span.prof-item' + (it.rarity ? '.r-' + it.rarity : ''), {}, it.tint ? h('i.prof-dot', { style: `background:${it.tint}` }) : null, `${it.count > 1 ? it.count + ' × ' : ''}${it.name}`, it.bonus ? h('em', {}, 'bonus') : null)),
      ...lines.map(l => h('span', {}, l)),
      note ? h('small', {}, note) : null,
      pending ? h('small.prof-wait', {}, '…') : null].filter(Boolean));
  }
  function showResult(o = {}) {
    if (!S.card || root.hidden) return;
    paintCard(o); S.cardAt = performance.now();
    clearTimeout(S.closeT); S.closeT = setTimeout(close, o.stay ?? 3400);
  }
  function abort() { cancelAnimationFrame(S.raf); clearTimeout(S.dog); clearTimeout(S.closeT); clearTimeout(S.readyT); clearInterval(S.readyTick); const res = S.resolve; S.resolve = null; S.run = null; res?.(null); }
  function cancel() { if (!S.run) return; abort(); root.hidden = true; root.replaceChildren(); say('idle', { cancelled: true }); }
  function close() { if (root.hidden) return; cancelAnimationFrame(S.raf); clearTimeout(S.closeT); clearTimeout(S.dog); clearTimeout(S.readyT); clearInterval(S.readyTick); const res = S.resolve; S.resolve = null; res?.(null); S.run = null; S.card = null; root.hidden = true; root.replaceChildren(); say('idle'); }
  window.addEventListener('resize', () => { if (S.run && !root.hidden) { size(); draw(); } });

  return {
    root, play, showResult, close, cancel, begin,
    get isOpen() { return !root.hidden; }, get run() { return S.run; },
    /** For specs and the gallery: where things are on the page right now. */
    get state() {
      const r = S.canvas?.getBoundingClientRect();
      return { open: !root.hidden, state: root.dataset.state || 'idle', type: S.run?.type || null, t: S.run ? S.run.t : 0, done: !!S.run?.done, frames: S.frames, clock: S.run ? now() : 0,
        canvas: r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null, result: S.run?.done ? S.run.result() : null, next: S.run && !S.run.done ? S.run.botNext() : null };
    },
    /** Page coordinates of the thing a finger would tap for input v (the spec's synthetic touch uses this). */
    pointFor(v) { const r = S.canvas.getBoundingClientRect(), [x, y] = pointFor(S.run, S.w, S.h, null, v); return { x: r.left + x * (r.width / S.w), y: r.top + y * (r.height / S.h) }; },
    /** Freeze the game at a moment (the gallery's still pictures): the clock is moved so `ms` is now, and stops. */
    freezeAt(ms, inputs = []) { if (!S.run) return; begin(); cancelAnimationFrame(S.raf); clearTimeout(S.dog); for (const [t, v] of inputs) { S.run.advanceTo(t); if (S.run.type === 'trace') S.run.aim(v); else S.run.press(v); } S.run.advanceTo(ms); size(); draw(); },
  };
}
