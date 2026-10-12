// Input layer (T27) — moving through windows with a gamepad: a focus RING you steer with the D-pad or the left stick.
//
// It works on the windows as they are (no per-window code): the ring lives in the top-most open thing (a confirm box, a
// context menu, a dialog, the top window, the bag, the party menu, the death screen, the title screen), jumps to the
// nearest control in the direction pressed, A presses it, X is the "other" click (right-click), Y shows its card, LB/RB
// step through that window's tabs. On a canvas you cannot step through (the perk forest, the world map) the ring turns
// into a POINTER you steer; A clicks under it, the triggers zoom, the right stick pans.
const CONTAINERS = ['.tv-osk:not([hidden])', '.tv-confirm', '.ent-menu:not([hidden])', '.name-menu:not([hidden])', '.phone-sheet:not([hidden])', '.tv-reveal:not([hidden])', '.tv-dialog:not([hidden])'];
const LATE = ['#bag:not([hidden])', '#party-menu:not([hidden])', '.invite-pop:not([hidden])', '#death:not([hidden])', '#title:not([hidden])'];
const FOCUSABLE = 'button, [role="tab"], [role="radio"], input, select, textarea, a[href], [tabindex]:not([tabindex="-1"]), .islot:not(.empty), .pmember, canvas.pad-cursor, .pf-host canvas, .wm-canvas, canvas[data-pad-cursor]';
const vis = e => !!e && !e.hidden && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';

export function createFocus({ parent = document.body, onText = null } = {}) {
  const ring = document.createElement('div'); ring.className = 'pad-ring pad-ui'; ring.hidden = true; ring.setAttribute('aria-hidden', 'true');
  const ptr = document.createElement('div'); ptr.className = 'pad-pointer pad-ui'; ptr.hidden = true; ptr.setAttribute('aria-hidden', 'true');
  parent.append(ring, ptr);
  let cur = null, cursor = null, drag = null, enabled = false;

  /** The thing the ring is confined to right now (null = nothing open: the pad drives the character). */
  function container() {
    for (const s of CONTAINERS) { const e = document.querySelector(s); if (vis(e)) return e; }
    const panels = [...document.querySelectorAll('.tv-panel:not([hidden])')].filter(vis).sort((a, b) => (+b.style.zIndex || 0) - (+a.style.zIndex || 0));
    if (panels.length) return panels[0];
    for (const s of LATE) { const e = document.querySelector(s); if (vis(e)) return e; }
    return null;
  }
  const items = c => [...c.querySelectorAll(FOCUSABLE)].filter(e => vis(e) && !e.disabled && e.getAttribute('aria-hidden') !== 'true' && !e.closest('[hidden]'));
  const isCanvas = e => e && e.tagName === 'CANVAS';
  function set(el) {
    cur = el || null; cursor = null; ptr.hidden = true;
    if (!cur) { ring.hidden = true; return; }
    try { cur.focus({ preventScroll: true }); } catch { /* not focusable: the ring alone marks it */ }
    cur.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    if (isCanvas(cur)) cursorAt(cur, 0.5, 0.5);
    place();
  }
  function place() {
    if (!enabled || !cur || !vis(cur)) { ring.hidden = true; return; }
    const r = cur.getBoundingClientRect();
    ring.hidden = false;
    ring.style.left = (r.left - 3) + 'px'; ring.style.top = (r.top - 3) + 'px'; ring.style.width = (r.width + 6) + 'px'; ring.style.height = (r.height + 6) + 'px';
    ring.classList.toggle('canvas', isCanvas(cur));
    if (cursor) { ptr.hidden = false; ptr.style.left = cursor.x + 'px'; ptr.style.top = cursor.y + 'px'; }
  }
  /** Keep the ring on something sensible: called every frame while a pad is in use. Returns the container (or null). */
  function sync() {
    const c = enabled ? container() : null;
    if (!c) { if (cur) set(null); return null; }
    if (!cur || !c.contains(cur) || !vis(cur)) {
      const list = items(c);
      set(list.find(e => e.matches('.primary, [aria-selected="true"], [aria-checked="true"], .on')) || list.find(e => !e.matches('.tvp-x, .gs-x')) || list[0] || null);
    } else place();
    return c;
  }
  function move(dx, dy) {
    const c = container(); if (!c) return false;
    if (!cur || !c.contains(cur)) { sync(); return true; }
    // a slider or a list box takes left/right itself
    if (dx && cur.tagName === 'INPUT' && cur.type === 'range') { const st = +cur.step || 1; cur.value = String(Math.max(+cur.min, Math.min(+cur.max, +cur.value + dx * st))); cur.dispatchEvent(new Event('input', { bubbles: true })); cur.dispatchEvent(new Event('change', { bubbles: true })); return true; }
    if (dx && cur.tagName === 'SELECT') { const i = Math.max(0, Math.min(cur.options.length - 1, cur.selectedIndex + dx)); if (i !== cur.selectedIndex) { cur.selectedIndex = i; cur.dispatchEvent(new Event('change', { bubbles: true })); } return true; }
    const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    for (const e of items(c)) {
      if (e === cur) continue;
      const r = e.getBoundingClientRect(), ex = r.left + r.width / 2, ey = r.top + r.height / 2;
      const along = dx ? (ex - ax) * dx : (ey - ay) * dy, across = dx ? Math.abs(ey - ay) : Math.abs(ex - ax);
      if (along < 4) continue;
      // overlap on the other axis counts as "in line"
      const overlap = dx ? Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top) : Math.min(a.right, r.right) - Math.max(a.left, r.left);
      const score = along + (overlap > 0 ? 0 : across * 2.2) + (overlap > 0 ? across * 0.15 : 0);
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (best) set(best);
    return !!best;
  }
  const mouse = (el, type, x, y, more = {}) => el.dispatchEvent(new (type.startsWith('pointer') ? PointerEvent : MouseEvent)(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'mouse', pointerId: 1, isPrimary: true, view: window, ...more }));
  const at = () => { if (cursor) return cursor; const r = cur.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  function press() {
    if (!cur) return false;
    const p = at();
    if (cur.matches('input:not([type]), input[type="text"], input[type="search"], input[type="password"], textarea')) { onText?.(cur); return true; }
    if (cursor) { mouse(cur, 'pointerdown', p.x, p.y, { button: 0, buttons: 1 }); mouse(cur, 'mousedown', p.x, p.y, { button: 0, buttons: 1 }); mouse(cur, 'pointerup', p.x, p.y, { button: 0 }); mouse(cur, 'mouseup', p.x, p.y, { button: 0 }); mouse(cur, 'click', p.x, p.y, { button: 0 }); return true; }
    if (cur.tagName === 'SELECT') { cur.selectedIndex = (cur.selectedIndex + 1) % cur.options.length; cur.dispatchEvent(new Event('change', { bubbles: true })); return true; }
    cur.click(); return true;
  }
  /** The other click: what the right mouse button does there. */
  function alt() { if (!cur) return false; const p = at(); if (cursor) { mouse(cur, 'pointerdown', p.x, p.y, { button: 2, buttons: 2 }); mouse(cur, 'pointerup', p.x, p.y, { button: 2 }); } mouse(cur, 'contextmenu', p.x, p.y, { button: 2 }); return true; }
  /** Show the card of what is focused (the shared tooltip opens on pointerover). */
  function details() { if (!cur) return false; const p = at(); for (const t of ['pointerover', 'mouseover', 'pointermove', 'mousemove']) mouse(cursor ? document.elementFromPoint(p.x, p.y) || cur : cur, t, p.x, p.y); return true; }
  /** Step through the window's tabs (the first tab strip found in the container). */
  function tab(dir) {
    const c = container(); if (!c) return false;
    const strip = [...c.querySelectorAll('[role="tablist"], .set-tabs, .hub-tabs, .j-tabs, .card-tabs')].find(vis);
    const tabs = strip ? [...strip.querySelectorAll('button, [role="tab"]')].filter(vis) : [...c.querySelectorAll('[role="tab"]')].filter(vis);
    if (tabs.length < 2) return false;
    const i = Math.max(0, tabs.findIndex(t => t.getAttribute('aria-selected') === 'true' || t.getAttribute('aria-checked') === 'true' || t.classList.contains('on')));
    const next = tabs[(i + dir + tabs.length) % tabs.length];
    next.click();
    setTimeout(() => { const again = tabs.includes(cur) || !vis(cur) ? null : cur; if (!again) sync(); }, 30);
    return true;
  }
  function scroll(dy) { const c = container(); if (!c) return; let e = cur || c; while (e && e !== document.body) { if (e.scrollHeight > e.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(e).overflowY)) { e.scrollTop += dy; return; } e = e.parentElement; } const b = c.querySelector('.tvp-body'); if (b) b.scrollTop += dy; }
  // ---- the steered pointer (canvases)
  function cursorAt(el, fx = 0.5, fy = 0.5) { const r = el.getBoundingClientRect(); cur = el; cursor = { x: r.left + r.width * fx, y: r.top + r.height * fy }; enabled = true; place(); const p = cursor; mouse(el, 'pointermove', p.x, p.y); mouse(el, 'mousemove', p.x, p.y); }
  function steer(dx, dy) {
    if (!cursor || !cur) return false;
    const r = cur.getBoundingClientRect();
    cursor.x = Math.max(r.left + 2, Math.min(r.right - 2, cursor.x + dx)); cursor.y = Math.max(r.top + 2, Math.min(r.bottom - 2, cursor.y + dy));
    mouse(cur, 'pointermove', cursor.x, cursor.y); mouse(cur, 'mousemove', cursor.x, cursor.y);
    place(); return true;
  }
  function zoom(dir) { if (!cur) return false; const p = at(); cur.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, deltaY: dir > 0 ? -120 : 120 })); return true; }
  /** Pan a canvas by dragging it (the right stick): call every frame with the stick; (0, 0) lets go. */
  function pan(dx, dy) {
    if (!cursor || !cur) return;
    if (!dx && !dy) { if (drag) { mouse(cur, 'pointerup', drag.x, drag.y, { button: 0, pointerId: 7 }); mouse(cur, 'mouseup', drag.x, drag.y, { button: 0 }); drag = null; } return; }
    if (!drag) { const r = cur.getBoundingClientRect(); drag = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; mouse(cur, 'pointerdown', drag.x, drag.y, { button: 0, buttons: 1, pointerId: 7 }); mouse(cur, 'mousedown', drag.x, drag.y, { button: 0, buttons: 1 }); }
    drag.x -= dx; drag.y -= dy;
    mouse(cur, 'pointermove', drag.x, drag.y, { buttons: 1, pointerId: 7 }); mouse(cur, 'mousemove', drag.x, drag.y, { buttons: 1 });
  }
  return {
    ring, ptr, set(el) { enabled = true; set(el); }, sync, move, press, alt, details, tab, scroll, steer, zoom, pan, cursorAt, container,
    enable(on) { enabled = !!on; if (!on) { ring.hidden = true; ptr.hidden = true; cur = null; cursor = null; } },
    get current() { return cur; }, get steering() { return !!cursor; }, get enabled() { return enabled; },
  };
}
