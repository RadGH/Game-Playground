// Play-test 2 Q6 — "multiple area-changed notifications overlap on entering a new area". One banner area with a
// hierarchy (province > zone > place): a bigger area replaces whatever is up at once, a smaller one waits its turn in a
// short queue (pt2-core.js bannerPush/bannerTick), and the banner, the boss/event call-outs and the toasts sit in ONE
// column in the middle of the screen, so they stack instead of being drawn over each other.
//
//   const banner = createBanner({ hud });    // takes over hud.zone(name) — every old caller lands here
//   banner.push({ level: 'province'|'zone'|'place', name, sub })

import { bannerState, bannerPush, bannerTick, BANNER_MS } from './pt2-core.js';

const LEAD = { province: 'Province', zone: 'You enter', dungeon: 'You descend into', place: 'You find' };

export function createBanner({ hud }) {
  const root = document.getElementById('hud');
  const el = document.getElementById('zone-banner');
  // one column for everything that speaks in the middle of the screen (ids are kept, so other code still finds them)
  const stack = document.createElement('div');
  stack.className = 'center-stack'; stack.id = 'center-stack';
  root.appendChild(stack);
  for (const id of ['zone-banner', 'callout', 'toasts']) { const e = document.getElementById(id); if (e) stack.appendChild(e); }
  el.innerHTML = '<small></small><strong></strong><span class="zb-sub"></span>';
  const parts = { lead: el.querySelector('small'), name: el.querySelector('strong'), sub: el.querySelector('.zb-sub') };
  const st = bannerState();
  let shown = null, timer = 0;

  function paint() {
    const c = st.cur;
    if (c === shown) return;
    shown = c;
    if (!c) { el.classList.remove('show'); el.dataset.level = ''; return; }
    el.dataset.level = c.level;
    parts.lead.textContent = c.lead || LEAD[c.level] || 'You enter';
    parts.name.textContent = c.name;
    parts.sub.textContent = c.sub || '';
    parts.sub.hidden = !c.sub;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');   // restart the fade for a replacement
  }
  function schedule() {
    clearTimeout(timer);
    if (!st.cur) return;
    timer = setTimeout(() => { bannerTick(st, performance.now()); paint(); schedule(); }, Math.max(30, st.cur.until - performance.now() + 5));
  }
  function push(b) {
    const before = st.cur;
    bannerPush(st, b, performance.now(), b.ms || BANNER_MS);
    if (st.cur && b.lead && st.cur.name === b.name) st.cur.lead = b.lead;
    if (st.cur !== before) { paint(); schedule(); }
  }
  // every old caller of hud.zone(name) is a zone
  hud.zone = (name, opts = {}) => push({ level: opts.level || 'zone', name, sub: opts.sub || '' });
  return {
    push, el, stack,
    get state() { return { cur: st.cur ? { level: st.cur.level, name: st.cur.name, sub: st.cur.sub } : null, queue: st.queue.map(q => q.name) }; },
  };
}
