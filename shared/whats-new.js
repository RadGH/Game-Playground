// "What's new" — a game's player-facing changelog (2026-10-24, owner: "add a 'what's new' changelog button feature
// just like we have in thousandvale ... and maybe a global policy for the same feature in other games going forward").
// Thousandvale's own (prototypes/thousandvale/js/client/ui/changelog.js) is tied to its account settings; this is the
// same idea for any game, with no server needed.
//
//   import { createWhatsNew } from '../../../shared/whats-new.js';        // + <link rel="stylesheet" href=".../shared/whats-new.css">
//   const news = createWhatsNew({ url: new URL('../../data/changelog.json', import.meta.url), key: 'tumblefair', title: "What's new" });
//   el.append(news.button({ label: "What's new" }));    // a button with a dot while something is unread (any number of them)
//   news.open();                                        // the window: every entry, newest first, unread ones marked New
//   news.onUnread(n => ...)                             // after the first load: how many entries this player hasn't seen
//
// The file: { "entries": [{ "id": "2026-10-24", "date": "2026-10-24", "title": "…", "items": ["…", "…"] }] }, newest
// first, plain language for players (no file names). Append one entry every time the game is published.
// The marker (the newest id this browser has read) lives in localStorage `<key>.whatsnew.seen`. A FIRST visit stores
// the newest id and marks nothing: a brand-new player wasn't here for the old version. Opening the window moves it.
// The window is a dialog on <body> with the class `modal` and a [data-close] button, so pad navigation that walks the
// top `.modal` (Tumblefair's padnav.js) works in it.

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private window */ } },
};
// 'YYYY-MM-DD' is a calendar day, not midnight UTC (which shows as the day before west of Greenwich)
const prettyDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); const t = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(Date.parse(d)); return Number.isFinite(+t) ? t.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : String(d || ''); };

/** Pure: which entries are new to someone who last read `seen` (entries newest first). */
export function unreadOf(entries, seen) {
  if (!entries.length) return [];
  if (seen == null) return [];                                  // (first visit: handled by the caller, which stores the newest)
  const i = entries.findIndex(e => e.id === seen);
  return i < 0 ? entries.slice() : entries.slice(0, i);
}

export function createWhatsNew({ url, key = 'game', title = "What's new", footer = null, load = null } = {}) {
  const KEY = `${key}.whatsnew.seen`;
  let entries = null, loading = null, marked = new Set();
  const subs = new Set(), buttons = new Set();
  const fetchFile = load || (async () => { try { const r = await fetch(url, { cache: 'no-cache' }); if (r.ok) return await r.json(); } catch { /* offline */ } return { entries: [] }; });
  function ensure() {
    if (entries) return Promise.resolve(entries);
    loading ||= Promise.resolve(fetchFile()).then(d => {
      entries = Array.isArray(d?.entries) ? d.entries.filter(e => e && e.id) : [];
      if (ls.get(KEY) == null && entries[0]) ls.set(KEY, entries[0].id);      // first visit
      tell(); return entries;
    }, () => (entries = []));
    return loading;
  }
  const unread = () => unreadOf(entries || [], ls.get(KEY));
  function tell() { const n = unread().length; for (const b of buttons) b.classList.toggle('wn-has-new', n > 0); for (const f of subs) { try { f(n); } catch { /* a listener */ } } }

  let root = null;
  function close() { root?.remove(); root = null; }
  async function open() {
    await ensure();
    close();
    const fresh = new Set(unread().map(e => e.id)); for (const id of fresh) marked.add(id);
    root = document.createElement('div');
    root.className = 'modal wn-modal';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', title);
    const n = [...marked].filter(id => entries.some(e => e.id === id)).length;
    root.innerHTML = `<div class="wn-panel"><header class="wn-head"><h2>${esc(title)}</h2><span class="wn-sub">${!entries.length ? '' : n ? `${n} new since you last looked` : 'Newest first'}</span><button type="button" class="wn-x" data-close aria-label="Close">×</button></header>
      <div class="wn-list">${entries.length ? entries.map(e => `<article class="wn-entry${marked.has(e.id) ? ' new' : ''}"><header>${marked.has(e.id) ? '<span class="wn-new">New</span>' : ''}<time>${esc(prettyDate(e.date || e.id))}</time></header><h3>${esc(e.title || '')}</h3><ul>${(e.items || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul></article>`).join('') : '<p class="wn-empty">Nothing here yet.</p>'}</div>
      ${footer ? `<footer class="wn-foot">${footer}</footer>` : ''}</div>`;
    root.addEventListener('click', e => { if (e.target === root || e.target.closest('[data-close]')) close(); });
    root.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    document.body.append(root);
    root.querySelector('.wn-x')?.focus({ preventScroll: true });
    if (entries[0]) ls.set(KEY, entries[0].id);
    tell();
  }
  function button({ label = title, className = '' } = {}) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = `wn-open ${className}`.trim(); b.textContent = label;
    b.addEventListener('click', () => open());
    buttons.add(b); ensure().then(tell);
    return b;
  }
  ensure();
  return { open, close, button, ensure, get unread() { return unread().length; }, onUnread(f) { subs.add(f); if (entries) f(unread().length); return () => subs.delete(f); } };
}
