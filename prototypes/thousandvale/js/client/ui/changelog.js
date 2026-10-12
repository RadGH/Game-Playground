// Play-test 10 Y30 (report #25) — the changelog. "On the main menu after an update, a popup saying the game was updated
// with a button to view the changelog — everything since you last played, recent entries highlighted."
//
//   data     data/ops/changelog.json (the lead's; { entries: [{ id, date, title, items: [...] }] }, newest first)
//   marker   the newest entry this ACCOUNT has read: `net.changelog {latest, seen}` (A: on `charList`), moved with
//            `net.settings({ changelogSeen: id })`; a browser with no account yet keeps its own in localStorage.
//            A first visit stores "latest" and shows nothing: a new player was not here for the old version.
//   popup    on the title screen when something is newer than the marker: "The game was updated" + "See what changed"
//   window   every entry, newest first, the unread ones marked New; opening it moves the marker. Reachable any time:
//            "What's new" in the title's foot line and in the pause menu (Esc).
//
// The window is its own overlay on <body> (not a HUD panel): the HUD does not exist on the title screen. DOM + fetch.

import { h } from '../ui-panel.js';
import { changelogView, changelogNewer, changelogDate, changelogPopupText } from './pt10-core.js';

const KEY = 'tv.changelog.seen';
const FILE = new URL('../../../data/ops/changelog.json', import.meta.url);

export function createChangelog({ net = () => null, storage = null, load = null, titleEl = null } = {}) {
  const st = storage || (() => { try { return window.localStorage; } catch { return null; } })();
  const S = { entries: null, account: null, shownNew: new Set(), loading: null, popupDismissed: false };
  const local = () => { try { return st?.getItem(KEY) || null; } catch { return null; } };
  const setLocal = id => { try { if (id) st?.setItem(KEY, String(id)); } catch { /* private window */ } };

  // ---- data
  const fetchFile = load || (async () => {
    try { const r = await fetch(FILE, { cache: 'no-cache' }); if (r.ok) return await r.json(); } catch { /* try the server's own copy */ }
    try { const r = await fetch('changelog.json', { cache: 'no-cache' }); if (r.ok) return await r.json(); } catch { /* none */ }
    return { entries: [] };
  });
  function ensure() {
    if (S.entries) return Promise.resolve(S.entries);
    S.loading ||= Promise.resolve(fetchFile()).then(d => { S.entries = Array.isArray(d?.entries) ? d.entries : []; return S.entries; }, () => (S.entries = []));
    return S.loading;
  }
  /** The marker in force: the newer of the account's and this browser's. */
  const seen = () => changelogNewer(S.entries || [], S.account?.seen ?? null, local());
  const view = () => changelogView(S.entries || [], seen());

  // ---- the window
  const root = h('section.tv-changelog', { hidden: true, role: 'dialog', 'aria-label': 'Changelog', tabIndex: -1 },
    h('header.cl-head', {}, h('h3', {}, 'What\'s new'), h('span.cl-sub'), h('button.ghost.cl-x', { type: 'button', 'aria-label': 'Close', onclick: () => close() }, '×')),
    h('div.cl-list'));
  root.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { close(); e.preventDefault(); } });
  for (const ev of ['pointerdown', 'mousedown', 'click', 'wheel', 'touchstart']) root.addEventListener(ev, e => e.stopPropagation());
  document.body.appendChild(root);
  const listEl = root.querySelector('.cl-list'), subEl = root.querySelector('.cl-sub');

  function draw() {
    const v = view();
    // an entry that was new when the window opened stays marked while it is open (opening is what moves the marker)
    const rows = v.rows.map(r => ({ ...r, isNew: r.isNew || S.shownNew.has(r.id) }));
    const n = rows.filter(r => r.isNew).length;
    subEl.textContent = !rows.length ? '' : n ? `${n} new since you last looked` : 'Newest first';
    listEl.replaceChildren(...(rows.length ? rows.map(r => h('article.cl-entry' + (r.isNew ? '.new' : ''), { dataset: { id: r.id } },
      h('header', {}, h('time', {}, changelogDate(r.date || r.id)), r.isNew ? h('b.cl-new', {}, 'New') : null),
      r.title ? h('h4', {}, r.title) : null,
      h('ul', {}, ...r.items.map(t => h('li', {}, t))))) : [h('p.empty', {}, S.entries ? 'Nothing has been written down yet.' : 'Reading the notices…')]));
  }
  async function open() {
    root.hidden = false; popup.hidden = true; S.popupDismissed = true;
    draw(); root.focus({ preventScroll: true });
    await ensure();
    const v = view();
    for (const r of v.rows) if (r.isNew) S.shownNew.add(r.id);
    draw();
    markSeen(v.latest);
    paintDots();
  }
  function close() { if (root.hidden) return; root.hidden = true; S.shownNew.clear(); paintDots(); }
  /** Move the marker to `id` (this browser, and the account when there is one). */
  function markSeen(id) {
    if (!id) return;
    setLocal(id);
    if (S.account && String(S.account.seen) !== String(id)) { S.account = { ...S.account, seen: String(id) }; try { net()?.settings?.({ changelogSeen: id }); } catch { /* not connected */ } }
  }

  // ---- the popup on the title screen
  const popup = h('aside.tv-updated', { hidden: true, role: 'status', 'aria-live': 'polite' },
    h('strong', {}, 'The game was updated'), h('p'),
    h('div.row', {}, h('button.primary.small', { type: 'button', dataset: { act: 'view' }, onclick: () => open() }, 'See what changed'),
      h('button.ghost.small', { type: 'button', dataset: { act: 'later' }, onclick: () => { popup.hidden = true; S.popupDismissed = true; } }, 'Later')));
  // on <body>, not inside the title's markup: a test or a script that asks the title for "its primary button" must never
  // get this one (tests/D/m3-social.spec.js did, and walked into the world with the changelog open over everything)
  document.body.appendChild(popup);
  const onTitle = () => { const t = titleEl || document.getElementById('title'); return !!t && !t.hidden && getComputedStyle(t).display !== 'none'; };
  const dots = new Set();
  function paintDots() { const n = S.entries ? view().unseen : 0; for (const el of dots) { el.classList.toggle('has-new', n > 0); el.dataset.new = n > 0 ? String(n) : ''; } }
  /** A button that opens the window; it wears a dot while something is unread. */
  function button(el) { if (!el) return el; el.addEventListener('click', e => { e.preventDefault(); open(); }); dots.add(el); paintDots(); return el; }

  /** Decide the popup. Called when the file is in and whenever the account's marker arrives. */
  async function check() {
    await ensure();
    const v = view();
    // A first visit: nothing is "new". The marker is only written here for a browser with NO account on the way — one that
    // is connecting must wait for the account's own marker (writing "latest" now would hide the popup from a returning
    // player on a new browser); a new account's marker is set by the server.
    if (v.first) { if (v.latest && !S.account && !net()) setLocal(v.latest); popup.hidden = true; paintDots(); return v; }
    paintDots();
    if (v.unseen > 0 && !S.popupDismissed && root.hidden && onTitle()) {
      popup.querySelector('p').textContent = `${changelogPopupText(v.unseen)}${v.rows[0]?.title ? ` Latest: ${v.rows[0].title}.` : ''}`;
      popup.hidden = false;
    } else popup.hidden = true;
    return v;
  }
  function wire(n) {
    if (!n) return;
    if (n.changelog) { S.account = n.changelog; check(); }
    n.on?.('changelog', c => { S.account = c; check(); });
    // walking into the world puts both away: the popup belongs to the title, and nothing may sit over the game unasked
    n.on?.('joined', () => { popup.hidden = true; close(); });
  }
  check();
  return { root, popup, open, close, check, wire, button, markSeen, get isOpen() { return !root.hidden; },
    get state() { const v = S.entries ? view() : { rows: [], unseen: 0, latest: null, first: true }; return { open: !root.hidden, popup: !popup.hidden, unseen: v.unseen, latest: v.latest, seen: seen(), entries: v.rows.length }; } };
}
