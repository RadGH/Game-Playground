// The controller everywhere, menus included (game standards §1; modelled on Tumblefair's js/client/padnav.js).
// The d-pad moves an amber highlight between the controls on screen (spatially: the nearest control in the pressed
// direction), A presses it, B backs out. Only the TOP layer is reachable: the last open .modal, else an open drawer,
// else the page. The machine holding the highlight lights its amber FOCUS lamp.
//
// Knobs are grabbed, not trapped: A on a knob takes hold of it (its lamp turns green), then the d-pad turns it one
// detent a press; A or B lets go. So the d-pad alone can always walk to every machine, and LT/RT still turn the
// Range knob straight away.
//
// Everything that is not menu walking (left stick = light pen, right stick = pan, triggers, Start, Select, A-with-no-
// highlight = pen down) is handed to `game` callbacks, so this file never knows about the scope.

const FOCUSABLE = 'button:not([disabled]):not([data-nopad]), [data-pad]:not([disabled]), input:not([type=hidden]), select, a[href]';
export const visible = el => {
  const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
  if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
  const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && s.pointerEvents !== 'none' && !el.closest('[inert]');
};

/** Pure: pick the next item from `cur` in direction (dx, dy). Items are { r: {left,top,right,bottom} }.
 *  First choice: controls wholly past our edge in that direction, scored by the gap between the edges plus how far
 *  off to the side they sit (so a big scope beside a small button still wins over a lamp up the corner). If none,
 *  fall back to centre distance. */
export function pickNext(items, cur, dx, dy) {
  const mid = r => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
  const a = mid(cur.r), ra = cur.r;
  const gapOf = rb => dx > 0 ? rb.left - ra.right : dx < 0 ? ra.left - rb.right : dy > 0 ? rb.top - ra.bottom : ra.top - rb.bottom;
  const sideOf = rb => dx ? Math.max(0, rb.top - ra.bottom, ra.top - rb.bottom) : Math.max(0, rb.left - ra.right, ra.left - rb.right);
  let best = null, score = Infinity;
  for (const it of items) {
    if (it === cur) continue;
    const rb = it.r, g = gapOf(rb);
    if (g < -2) continue;
    const s = Math.max(0, g) + sideOf(rb) * 2.2 + 0.01 * Math.abs((mid(rb).x - a.x) * dy - (mid(rb).y - a.y) * dx);
    if (s < score) { score = s; best = it; }
  }
  if (best) return best;
  for (const it of items) {
    if (it === cur) continue;
    const b = mid(it.r), rb = it.r, along = (b.x - a.x) * dx + (b.y - a.y) * dy, side = Math.abs((b.x - a.x) * dy - (b.y - a.y) * dx);
    if (along <= 4) continue;
    const inLine = dy ? rb.right > ra.left + 2 && rb.left < ra.right - 2 : rb.bottom > ra.top + 2 && rb.top < ra.bottom - 2;
    const s = along + side * (inLine ? 0.5 : 2.5);
    if (s < score) { score = s; best = it; }
  }
  return best;
}

export function createPadNav({ game = {}, back = () => false, layerRoot = () => null, sound = () => {} } = {}) {
  let cur = null, grabbed = null, held = new Map(), raf = 0, lastPad = 0, padA = false;
  const layer = () => [...document.querySelectorAll('.modal')].filter(visible).pop() || layerRoot() || document.body;
  const items = () => { const L = layer(); return [...L.querySelectorAll(FOCUSABLE)].filter(el => visible(el) && (L !== document.body || !el.closest('.modal'))); };
  const machineOf = el => el?.closest('.machine, .modal, .title-panel');
  function mark(el) {
    if (cur === el) return;
    if (grabbed && grabbed !== el) release();
    cur?.classList.remove('pad-focus'); machineOf(cur)?.classList.remove('pad-machine');
    cur = el;
    if (el) { el.classList.add('pad-focus'); machineOf(el)?.classList.add('pad-machine'); if (/^(INPUT|SELECT)$/.test(el.tagName)) el.focus({ preventScroll: true }); }
    game.onHighlight?.(el);
  }
  function release() { if (!grabbed) return; grabbed.classList.remove('pad-grab'); machineOf(grabbed)?.classList.remove('pad-grabbed'); grabbed = null; }
  function grab(el) { grabbed = el; el.classList.add('pad-grab'); machineOf(el)?.classList.add('pad-grabbed'); sound('press'); }
  const rectOf = el => el.getBoundingClientRect();
  function move(dx, dy) {
    if (grabbed?._knob) { grabbed._knob.padTurn(dx || -dy); return; }
    const all = items(); if (!all.length) return mark(null);
    if (!cur || !all.includes(cur)) return mark(all[0]);
    const list = all.map(el => ({ el, r: rectOf(el) })), me = list.find(i => i.el === cur);
    const nxt = pickNext(list, me, dx, dy);
    if (nxt) mark(nxt.el);
  }
  /** LB / RB: the first control of the previous / next machine (in page order). */
  function jumpMachine(d) {
    const all = items(); if (!all.length) return;
    const machines = [...new Set(all.map(machineOf).filter(Boolean))];
    if (!machines.length) return;
    const at = machines.indexOf(machineOf(cur));
    const m = machines[(at + d + machines.length) % machines.length] || machines[0];
    mark(all.find(el => machineOf(el) === m));
  }
  function press() {
    if (!cur || !items().includes(cur)) { if (game.penDown) return game.penDown(); return move(0, 1); }
    if (cur._knob) { if (grabbed === cur) release(); else grab(cur); return; }
    if (cur.dataset.pad === 'scope') return game.penDown?.();
    if (cur.tagName === 'SELECT') { const n = cur.options.length; if (n) { cur.selectedIndex = (cur.selectedIndex + 1) % n; cur.dispatchEvent(new Event('change', { bubbles: true })); } return; }
    if (cur.tagName === 'INPUT' && !/^(checkbox|radio|button|submit)$/.test(cur.type)) { cur.focus(); return; }
    cur.click();
  }
  function goBack() {
    if (grabbed) { release(); return; }
    if (game.penBack?.()) return;
    back();
  }
  function edge(id, down, t, repeat) {
    const h = held.get(id);
    if (!down) { held.delete(id); return false; }
    if (!h) { held.set(id, { at: t, next: t + 380 }); return true; }
    if (repeat && t >= h.next) { h.next = t + 130; return true; }
    return false;
  }
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const pads = [...(navigator.getGamepads?.() || [])].filter(p => p && p.connected);
    const pad = pads[0];
    if (!pad) { if (cur && t - lastPad > 15000) mark(null); return; }
    const B = i => !!pad.buttons[i]?.pressed, ax = i => pad.axes[i] || 0;
    let any = false;
    const penOn = !!game.penActive?.();
    // with no scope to steer (title, menus) the left stick walks the highlight like the d-pad
    const sx = penOn ? 0 : ax(0), sy = penOn ? 0 : ax(1);
    const dirs = [['u', B(12) || sy < -0.6, 0, -1], ['d', B(13) || sy > 0.6, 0, 1], ['l', B(14) || sx < -0.6, -1, 0], ['r', B(15) || sx > 0.6, 1, 0]];
    for (const [id, down, dx, dy] of dirs) if (edge(id, down, t, true)) { move(dx, dy); any = true; }
    const aDown = B(0);
    if (edge('a', aDown, t, false)) { press(); any = true; }
    if (!aDown && padA) game.penUp?.();
    padA = aDown && (!cur || cur.dataset.pad === 'scope');
    if (edge('b', B(1), t, false)) { goBack(); any = true; }
    if (edge('lb', B(4), t, false)) { jumpMachine(-1); any = true; }
    if (edge('rb', B(5), t, false)) { jumpMachine(1); any = true; }
    if (edge('x', B(2), t, false)) { game.toolbank?.(); any = true; }
    if (edge('lt', B(6), t, true)) { game.range?.(-1); any = true; }
    if (edge('rt', B(7), t, true)) { game.range?.(1); any = true; }
    if (edge('sel', B(8), t, false)) { game.filter?.(1); any = true; }
    if (edge('start', B(9), t, false)) { game.menu?.(); any = true; }
    // sticks: the pen and the pan are continuous, handed over every frame
    const dz = v => Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82;
    const lx = dz(ax(0)), ly = dz(ax(1)), rx = dz(ax(2)), ry = dz(ax(3));
    if (penOn) {
      if ((lx || ly) && cur && !grabbed) mark(null);       // the pen takes over from the highlight
      if (lx || ly || rx || ry) any = true;
      game.sticks?.(lx, ly, rx, ry, t);
    }
    if (any) lastPad = t;
    if (cur && !cur.isConnected) mark(null);
  }
  raf = requestAnimationFrame(frame);
  return {
    stop: () => cancelAnimationFrame(raf),
    get current() { return cur; }, get grabbed() { return grabbed; },
    mark, release, jumpMachine, move, press,
    get penHeld() { return padA; },
  };
}
