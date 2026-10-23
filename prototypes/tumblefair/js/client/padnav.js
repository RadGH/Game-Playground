// Menus with a controller (report #14, 2026-10-23: "Controller doesn't work on the lobby menu"). Whenever no arena
// minigame owns the pad (`busy()` is false), the d-pad or left stick moves a highlight between the buttons on screen,
// A presses the highlighted one and B goes back (closes the top sheet). Only the TOP layer is reachable: the big QR,
// else the last open .modal, else the page. Moves are spatial: the nearest button whose middle lies in the pressed
// direction, measured mostly along that direction so a long row is walked in order.
const FOCUSABLE = 'button:not([disabled]), [data-act]:not([disabled]), input:not([type=hidden]), select, textarea, a[href]';
const visible = el => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && s.pointerEvents !== 'none'; };

export function createPadNav({ busy = () => false, back = () => false } = {}) {
  let cur = null, curSig = '', held = new Map(), raf = 0, lastPad = 0;
  const sig = el => [el.tagName, el.id, el.dataset.act, el.dataset.key, el.dataset.value, el.dataset.num, el.dataset.bool, el.dataset.i, el.dataset.pid, el.textContent.trim().slice(0, 40)].join('|');
  const layer = () => document.querySelector('.qr-big') || [...document.querySelectorAll('.modal')].filter(visible).pop() || document.body;
  const items = () => { const L = layer(); return [...L.querySelectorAll(FOCUSABLE)].filter(el => visible(el) && (L !== document.body || !el.closest('.modal'))); };
  function mark(el) {
    if (cur === el) return;
    cur?.classList.remove('pad-focus'); cur = el; curSig = el ? sig(el) : '';
    if (el) { el.classList.add('pad-focus'); el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el.focus({ preventScroll: true }); }
  }
  const mid = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  function move(dx, dy) {
    const all = items(); if (!all.length) return mark(null);
    if (!cur || !all.includes(cur)) return mark(all[0]);
    const a = mid(cur), ra = cur.getBoundingClientRect(); let best = null, score = Infinity;
    for (const el of all) {
      if (el === cur) continue;
      const b = mid(el), rb = el.getBoundingClientRect(), along = (b.x - a.x) * dx + (b.y - a.y) * dy, side = Math.abs((b.x - a.x) * dy - (b.y - a.y) * dx);
      if (along <= 4) continue;
      // in line with this one (its edges overlap ours across the move): a small sideways cost; off to one side: a big one
      const inLine = dy ? rb.right > ra.left + 2 && rb.left < ra.right - 2 : rb.bottom > ra.top + 2 && rb.top < ra.bottom - 2;
      const s = along + side * (inLine ? 0.5 : 2.5);
      if (s < score) { score = s; best = el; }
    }
    if (best) mark(best);
  }
  function press() {
    if (!cur || !items().includes(cur)) return move(0, 1);
    if (cur.tagName === 'SELECT') { cur.focus(); const n = cur.options.length; if (n) { cur.selectedIndex = (cur.selectedIndex + 1) % n; cur.dispatchEvent(new Event('change', { bubbles: true })); cur.dispatchEvent(new Event('input', { bubbles: true })); } return; }
    if (cur.tagName === 'INPUT' && !/^(checkbox|radio|button|submit)$/.test(cur.type)) { cur.focus(); return; }
    cur.click();
  }
  // a button counts once when it goes down, then repeats while held (menus are walked by holding the d-pad)
  function edge(id, down, t, repeat) {
    const h = held.get(id);
    if (!down) { held.delete(id); return false; }
    if (!h) { held.set(id, { at: t, next: t + 380 }); return true; }
    if (repeat && t >= h.next) { h.next = t + 130; return true; }
    return false;
  }
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const pad = [...(navigator.getGamepads?.() || [])].find(p => p && p.connected);
    if (!pad) { if (cur && t - lastPad > 8000) mark(null); return; }
    if (busy()) { held.clear(); mark(null); return; }
    const B = i => !!pad.buttons[i]?.pressed, ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const dirs = [['u', B(12) || ay < -0.6, 0, -1], ['d', B(13) || ay > 0.6, 0, 1], ['l', B(14) || ax < -0.6, -1, 0], ['r', B(15) || ax > 0.6, 1, 0]];
    let any = false;
    for (const [id, down, dx, dy] of dirs) { if (edge(id, down, t, true)) { move(dx, dy); any = true; } }
    if (edge('a', B(0), t, false)) { press(); any = true; }
    if (edge('b', B(1), t, false)) { back(); mark(null); any = true; }
    if (any) lastPad = t;
    if (cur && !cur.isConnected) {                 // the screen was redrawn under us: the same button again, if it is still there
      const same = items().find(el => sig(el) === curSig), keep = curSig;
      cur = null; mark(same || null); if (!same) curSig = keep;
    }
  }
  raf = requestAnimationFrame(frame);
  return { stop: () => cancelAnimationFrame(raf), get current() { return cur; } };
}
