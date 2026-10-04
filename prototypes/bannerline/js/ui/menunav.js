// Menu navigation for keyboard AND gamepad (PLAN §10: every screen usable by pad alone).
//
// A nav keeps its OWN focused element (class `nav-focus`) instead of using document focus, so two
// players can each drive their own panel in split screen. Feed it DeviceFrames:
//   nav.handle(frame) -> true if it consumed the frame's menu actions
// navUp/navDown/navLeft/navRight move spatially between the items, confirm clicks the focused
// item, back calls `onBack`. Mouse hover moves the focus too, so mouse and pad never disagree.

export function createMenuNav(container, { selector = 'button:not([disabled]), [data-nav]:not([disabled])', onBack = null, initial = null, wrap = true } = {}) {
  let current = null;
  let enabled = true;

  function items() {
    return [...container.querySelectorAll(selector)].filter((el) => {
      if (el.closest('[hidden]')) return false;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }
  function set(el) {
    if (current === el) return;
    current?.classList.remove('nav-focus');
    current = el || null;
    current?.classList.add('nav-focus');
  }
  function ensure() {
    const list = items();
    if (!current || !list.includes(current)) {
      const init = typeof initial === 'function' ? initial() : initial ? container.querySelector(initial) : null;
      set(init && list.includes(init) ? init : list[0] || null);
    }
    return list;
  }
  function move(dx, dy) {
    const list = ensure();
    if (!current) return;
    const a = current.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bs = Infinity;
    for (const el of list) {
      if (el === current) continue;
      const b = el.getBoundingClientRect();
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const ddx = bx - ax, ddy = by - ay;
      const along = dx ? ddx * dx : ddy * dy;
      if (along <= 2) continue;
      const across = dx ? Math.abs(ddy) : Math.abs(ddx);
      const score = along + across * 2.5;
      if (score < bs) { bs = score; best = el; }
    }
    if (!best && wrap) {
      // Wrap around along the axis: furthest item in the opposite direction, same row/column.
      let far = null, fs = -Infinity;
      for (const el of list) {
        const b = el.getBoundingClientRect();
        const bx = b.left + b.width / 2, by = b.top + b.height / 2;
        const along = dx ? (ax - bx) * dx : (ay - by) * dy;
        const across = dx ? Math.abs(by - ay) : Math.abs(bx - ax);
        const score = along - across * 2.5;
        if (el !== current && score > fs) { fs = score; far = el; }
      }
      best = far;
    }
    if (best) set(best);
  }

  const onOver = (e) => { const el = e.target.closest?.(selector); if (el && container.contains(el) && enabled) set(el); };
  container.addEventListener('mouseover', onOver);

  return {
    get current() { return current; },
    get enabled() { return enabled; },
    set enabled(v) { enabled = v; if (!v) set(null); },
    focus(el) { if (typeof el === 'string') el = container.querySelector(el); ensure(); set(el); },
    reset() { set(null); ensure(); },
    refresh() { ensure(); },
    handle(frame) {
      if (!enabled || !frame) return false;
      const p = frame.pressed;
      let used = false;
      if (p.has('navUp')) { move(0, -1); used = true; }
      if (p.has('navDown')) { move(0, 1); used = true; }
      if (p.has('navLeft')) { move(-1, 0); used = true; }
      if (p.has('navRight')) { move(1, 0); used = true; }
      if (p.has('confirm')) { ensure(); const el = current; if (el) { el.click(); pulse(el); } used = true; }
      if (p.has('back') && onBack) { onBack(); used = true; }
      return used;
    },
    destroy() { container.removeEventListener('mouseover', onOver); set(null); },
  };
}

function pulse(el) { el.classList.remove('nav-press'); void el.offsetWidth; el.classList.add('nav-press'); }
