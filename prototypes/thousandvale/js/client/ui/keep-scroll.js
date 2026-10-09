// Play-test 10 Y27 — a list keeps its scroll position when it is redrawn. ONE rule for the whole interface.
//
// The reports (#27 #38 #40 #57 #51): the shop's Buy and Sell lists jumped back to the top about once a second and
// after every sale, and the ox-cart window jumped when a destination was clicked. Cause: those windows redraw by
// building a NEW list element from the server's data (`panel.fill(...)`), and they redraw whenever gold, the bag or an
// item icon changes — a new element starts at scrollTop 0. Nearly every window in the game redraws that way, so
// fixing two of them would leave the rest waiting for their own report.
//
// So instead of teaching each window: this module remembers how far every scrolled element is scrolled (one
// capture-phase `scroll` listener), and when an element it remembers is REPLACED by a new one at the same place in the
// same window (a MutationObserver, which runs before the browser paints), it puts the new one where the old one was.
// "The same place" = the same path of tags/classes under the nearest ancestor with an id. It is NOT restored when the
// window's selected tab or filter changed in between (a different list deserves its top), or when the window closed.
//
//   installKeepScroll()            once per page (ui-panel.js does it)
//   keepScroll(root, redraw)       for a redraw that tears the scroller's content down in several steps
//   pathOf / tabsOf                pure helpers, exported for the node test
//
// A new list needs nothing. tests/D/pt10.spec.js redraws every scrolling list it can find and fails on a reset.

const SEL_TABS = '[aria-checked="true"], [aria-selected="true"]';

/** A stable address for `el` under `root`: "div.shop-buy:0>div:0>div.shop-list:0" (index among same-tag-and-class siblings). */
export function pathOf(el, root) {
  const parts = [];
  for (let n = el; n && n !== root; n = n.parentElement) {
    const cls = (typeof n.className === 'string' ? n.className : '').split(/\s+/).filter(Boolean)[0] || '';
    const tag = n.tagName.toLowerCase() + (cls ? '.' + cls : '');
    let i = 0;
    for (let s = n.previousElementSibling; s; s = s.previousElementSibling) {
      const c = (typeof s.className === 'string' ? s.className : '').split(/\s+/).filter(Boolean)[0] || '';
      if (s.tagName === n.tagName && c === cls) i++;
    }
    parts.push(tag + ':' + i);
    if (!n.parentElement) return null;
  }
  return parts.reverse().join('>');
}
/** Follow a path made by pathOf back down from `root`; null when nothing is there. */
export function findPath(root, path) {
  let n = root;
  if (!path) return root;
  for (const part of path.split('>')) {
    const k = part.lastIndexOf(':'), tag = part.slice(0, k), want = +part.slice(k + 1);
    const [t, cls = ''] = tag.split('.');
    let i = 0, hit = null;
    for (const c of n.children) {
      const first = (typeof c.className === 'string' ? c.className : '').split(/\s+/).filter(Boolean)[0] || '';
      if (c.tagName.toLowerCase() !== t || first !== cls) continue;
      if (i++ === want) { hit = c; break; }
    }
    if (!hit) return null;
    n = hit;
  }
  return n;
}
/** What is selected in a window right now (its tabs, chips, filters): a change means "a different list". */
export function tabsOf(root) {
  if (!root?.querySelectorAll) return '';
  return [...root.querySelectorAll(SEL_TABS)].map(e => e.dataset?.tab || e.dataset?.cat || e.dataset?.k || e.id || (e.textContent || '').trim().replace(/\s*\(\d+\)\s*$/, '').slice(0, 24)).join('|');
}
const rootOf = el => { for (let n = el.parentElement; n; n = n.parentElement) if (n.id) return n; return el.ownerDocument?.body || null; };

let installed = null;
export function installKeepScroll(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || installed) return installed;
  const seen = new Map();          // key -> { el, root, path, top, left, tabs }
  const stats = { restored: 0, tracked: 0 };
  function note(el) {
    if (!el || el.nodeType !== 1 || el === doc.documentElement || el === doc.body) return;
    const root = rootOf(el); if (!root) return;
    const path = pathOf(el, root); if (path == null) return;
    const key = (root.id || 'body') + '>' + path;
    if (el.scrollTop <= 0 && el.scrollLeft <= 0) { seen.delete(key); return; }
    seen.set(key, { el, root, path, top: el.scrollTop, left: el.scrollLeft, tabs: tabsOf(root) });
    stats.tracked = seen.size;
  }
  doc.addEventListener('scroll', e => note(e.target), true);
  function sweep() {
    for (const [key, s] of seen) {
      if (s.el.isConnected) continue;
      if (!s.root.isConnected && s.root.id) { const again = doc.getElementById(s.root.id); if (again) s.root = again; }   // the window itself was rebuilt
      if (!s.root.isConnected || s.root.hidden) { seen.delete(key); continue; }
      const now = findPath(s.root, s.path);
      if (tabsOf(s.root) !== s.tabs) { seen.delete(key); continue; }
      // not there yet: a redraw that clears first and fills after an await gets two seconds to bring the list back
      if (!now) { const t = Date.now(); s.lost ??= t; if (t - s.lost > 2000) seen.delete(key); continue; }
      s.lost = undefined;
      s.el = now;
      if (now.scrollTop !== s.top) now.scrollTop = s.top;
      if (s.left && now.scrollLeft !== s.left) now.scrollLeft = s.left;
      stats.restored++;
    }
    stats.tracked = seen.size;
  }
  const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => { if (seen.size) sweep(); }) : null;
  const start = () => mo?.observe(doc.body, { childList: true, subtree: true });
  if (doc.body) start(); else doc.addEventListener('DOMContentLoaded', start, { once: true });
  installed = { sweep, note, stats, forget: () => seen.clear(), get size() { return seen.size; } };
  return installed;
}

/** For a redraw done in steps (clear, await, fill): remember every scrolled element under `root`, redraw, put them back. */
export function keepScroll(root, redraw) {
  if (!root) return redraw?.();
  const keep = [];
  for (const el of [root, ...root.querySelectorAll('*')]) if (el.scrollTop > 0 || el.scrollLeft > 0) keep.push({ path: pathOf(el, root), top: el.scrollTop, left: el.scrollLeft });
  const tabs = tabsOf(root);
  const out = redraw?.();
  const back = () => { if (tabsOf(root) !== tabs) return; for (const k of keep) { const el = k.path != null ? findPath(root, k.path) : null; if (el) { el.scrollTop = k.top; el.scrollLeft = k.left; } } };
  if (out && typeof out.then === 'function') return out.then(v => { back(); return v; });
  back();
  return out;
}
