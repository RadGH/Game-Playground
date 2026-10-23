// Controller-friendly menus: a focus ring that moves between buttons with a d-pad / stick / arrow keys (to the nearest
// one in that direction), A presses the focused one, B presses the screen's [data-back] button. Mouse and touch work as
// usual — hovering a button moves the ring there, so the two never disagree.
//
//   const nav = createNav();
//   nav.attach(rootEl)          the screen whose buttons can take the ring (call again after redrawing it)
//   nav.handle(edges)           edges from input.edges(dev) — returns true if it did something
//   nav.focus(el)               put the ring on an element
// Focusable: buttons, range inputs, and anything with [data-nav]. A range input takes left/right itself.
const SEL = 'button:not([disabled]), input[type=range], [data-nav]';
export function createNav({ onMove = () => {}, onPress = () => {} } = {}) {
  let root = null, cur = null;
  const hooked = new WeakSet();
  const visible = el => el.offsetParent !== null && !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden';
  const items = () => (root ? [...root.querySelectorAll(SEL)].filter(visible).filter(el => !el.closest('[data-nonav]')) : []);
  function focus(el, { quiet = false } = {}) {
    if (cur === el) return;
    cur?.classList.remove('nav-focus');
    cur = el || null;
    if (cur) { cur.classList.add('nav-focus'); cur.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); if (!quiet) onMove(); }
  }
  function attach(el, { keep = true } = {}) {
    root = el;
    if (root && !hooked.has(root)) hooked.add(root), root.addEventListener('pointerover', e => { const t = e.target.closest?.(SEL); if (t && root.contains(t) && e.pointerType === 'mouse') focus(t, { quiet: true }); });
    const list = items();
    if (keep && cur && list.includes(cur)) return;
    if (cur && !list.includes(cur)) { cur.classList.remove('nav-focus'); cur = null; }
    const first = root?.querySelector('[data-autofocus]:not([disabled])') || list[0];
    if (first) focus(first, { quiet: true });
  }
  function move(dir) {
    const list = items(); if (!list.length) return false;
    if (!cur || !list.includes(cur)) { focus(list[0]); return true; }
    const r0 = cur.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      // distance to the nearest edge in the direction of travel, so a wide button next to a small one is still "right"
      const ex = dx ? (dx > 0 ? r.left - r0.right : r0.left - r.right) : 0, ey = dy ? (dy > 0 ? r.top - r0.bottom : r0.top - r.bottom) : 0;
      const along = dx ? (x - cx) * dx : (y - cy) * dy;
      if (along <= 2) continue;
      const across = dx ? Math.max(0, Math.abs(y - cy) - (r.height + r0.height) / 4) : Math.max(0, Math.abs(x - cx) - (r.width + r0.width) / 4);
      const gap = Math.max(0, dx ? ex : ey);
      const score = gap + across * 2.2 + along * 0.05;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) { focus(best); return true; }
    return false;
  }
  function handle(e) {
    if (!e || !root) return false;
    if (cur?.matches('input[type=range]') && (e.left || e.right)) {
      const step = (+cur.max - +cur.min) / 10 || 0.1; cur.value = String(Math.max(+cur.min, Math.min(+cur.max, +cur.value + (e.right ? step : -step))));
      cur.dispatchEvent(new Event('input', { bubbles: true })); onMove(); return true;
    }
    for (const d of ['up', 'down', 'left', 'right']) if (e[d]) return move(d);
    if (e.a && cur && root.contains(cur)) { onPress(); cur.click(); return true; }
    if (e.b) { const back = [...root.querySelectorAll('[data-back]')].find(visible); if (back) { back.click(); return true; } }
    return false;
  }
  return { attach, handle, focus, move, get current() { return cur; }, get root() { return root; } };
}
