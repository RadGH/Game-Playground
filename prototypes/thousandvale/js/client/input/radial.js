// Input layer (T26/T27) — the quick wheel: every window in one hold. The same wheel serves a gamepad (hold LB, point
// with a stick, let go) and the phone layout (hold or tap the wheel button, slide or tap a slice). Its slices are
// WHEEL / WHEEL_ACTIONS in input/bindings.js; picking one presses that action's default key (or runs it), so the wheel
// can never open something the keyboard cannot.
import { WHEEL, WHEEL_ACTIONS, ACTION_BY_ID } from './bindings.js';
import { actionKey } from './emit.js';

const ICON = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  chat: '<path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"/>',
  autorun: '<path d="M5 12h13"/><path d="M13 6l6 6-6 6"/><path d="M4 6v12"/>',
  mount: '<path d="M4 20v-6l3-6 5-3 2 3 4 1 2 4-3 1-3-2-3 3v5"/><path d="M12 5l1-3"/>',
  fish: '<path d="M3 12c3-5 9-6 14-2l4-3v10l-4-3c-5 4-11 3-14-2Z"/><circle cx="8" cy="11" r="1"/>',
  camp: '<path d="M12 3c2 3 4 5 4 8a4 4 0 0 1-8 0c0-3 2-5 4-8Z"/><path d="M4 21l8-4 8 4M4 17l16 4"/>',
};
const svg = inner => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
/** The game's own menu-bar icon for a window when there is one (no second set of drawings), else ours. */
function iconFor(w) {
  const mb = document.querySelector(`#menubar [data-panel="${w.id}"] svg`) || (w.id === 'help' ? document.querySelector('#menubar [data-panel="help"] svg') : null);
  if (mb) return mb.outerHTML;
  return svg(ICON[w.icon] || ICON.menu);
}

export function createRadial({ run, parent = document.body } = {}) {
  const root = document.createElement('div');
  root.className = 'tv-radial pad-ui'; root.hidden = true; root.setAttribute('role', 'menu'); root.setAttribute('aria-label', 'Quick wheel');
  root.innerHTML = '<div class="rd-ring"></div><div class="rd-hub"><strong></strong><small></small></div>';
  parent.appendChild(root);
  const ringEl = root.querySelector('.rd-ring'), hub = root.querySelector('.rd-hub');
  const S = { open: false, ring: 0, at: -1, hold: false, onPick: null, custom: null };
  const extra = [];               // play-test 10 (Y5): more rings added by the game — { title, items, onPick } (the emotes)
  const lists = () => [WHEEL, WHEEL_ACTIONS, ...extra.map(r => r.items)];
  const list = () => S.custom || lists()[S.ring];

  function draw() {
    const L = list(), n = L.length;
    ringEl.replaceChildren(...L.map((w, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'rd-slice' + (i === S.at ? ' on' : ''); b.dataset.id = w.id; b.dataset.i = String(i); b.setAttribute('role', 'menuitem');
      b.style.setProperty('--x', Math.cos(a).toFixed(4)); b.style.setProperty('--y', Math.sin(a).toFixed(4));
      b.innerHTML = `${w.html || iconFor(w)}<span>${w.label}</span>`;
      b.addEventListener('pointerenter', () => point(i));
      b.addEventListener('click', e => { e.stopPropagation(); point(i); select(); });
      return b;
    }));
    const cur = L[S.at];
    hub.querySelector('strong').textContent = cur ? cur.label : S.custom ? (S.title || '') : S.ring >= 2 ? (extra[S.ring - 2]?.title || '') : S.ring ? 'Do' : 'Windows';
    hub.querySelector('small').textContent = cur ? (ACTION_BY_ID[cur.id]?.label || cur.sub || '') : S.custom ? 'Slide to one and let go' : S.hold ? 'Point and let go' : 'Tap one — tap here for more';
    root.dataset.ring = String(S.ring);
  }
  function point(i) { if (i === S.at) return; S.at = i; for (const b of ringEl.children) b.classList.toggle('on', +b.dataset.i === i); const cur = list()[i]; hub.querySelector('strong').textContent = cur ? cur.label : ''; hub.querySelector('small').textContent = cur ? (ACTION_BY_ID[cur.id]?.label || cur.sub || '') : ''; }
  /** Point by a stick: x right, y down, magnitude 0..1 (under 0.45 = nothing chosen). */
  function aim(x, y) { const m = Math.hypot(x, y); if (m < 0.45) return; const n = list().length; let a = Math.atan2(y, x) + Math.PI / 2; if (a < 0) a += Math.PI * 2; point(Math.round(a / (Math.PI * 2) * n) % n); }
  function open({ ring = 0, hold = false, point: id = null, items = null, title = '', onPick = null, at = null } = {}) {
    S.openedAt = performance.now(); S.open = true; S.ring = ring; S.hold = hold; S.custom = items; S.title = title; S.onPick = onPick; S.at = -1;
    root.hidden = false; root.classList.toggle('held', hold);
    if (at) { root.style.setProperty('--cx', at.x + 'px'); root.style.setProperty('--cy', at.y + 'px'); root.classList.add('placed'); } else root.classList.remove('placed');
    draw();
    if (id != null) { const i = list().findIndex(w => w.id === id); if (i >= 0) point(i); }
    document.documentElement.dataset.radial = '1';
  }
  function close() { if (!S.open) return; S.open = false; root.hidden = true; delete document.documentElement.dataset.radial; }
  function select() {
    const w = list()[S.at]; const pick = S.onPick; close();
    if (!w) return null;
    if (pick) { pick(w); return w.id; }
    if (!S.custom && S.ring >= 2) { extra[S.ring - 2]?.onPick?.(w); return w.id; }
    const a = ACTION_BY_ID[w.id];
    if (a?.run || w.id === 'chat') run?.(a?.run || w.id, w.id); else actionKey(w.id);
    return w.id;
  }
  function swap() { if (S.custom) return; S.ring = (S.ring + 1) % lists().length; S.at = -1; draw(); }
  root.addEventListener('click', () => { if (performance.now() - S.openedAt > 400) close(); });   // (the tap that opened it also 'clicks' the overlay a moment later)
  hub.addEventListener('click', e => { e.stopPropagation(); swap(); });   // touch: tap the middle for the other ring (things you do: mount, fish, camp, map, help)
  /** Y5: one more ring after Windows and Do (tap the middle / RB steps through them). `items` = [{ id, label, html?, sub? }]. */
  function addRing({ title = '', items = [], onPick = null } = {}) { if (!items.length) return -1; extra.push({ title, items, onPick }); return 1 + extra.length; }
  return { root, open, close, select, aim, point, swap, addRing, get rings() { return lists().length; }, get isOpen() { return S.open; }, get at() { return list()[S.at]?.id || null; }, get ring() { return S.ring; } };
}
