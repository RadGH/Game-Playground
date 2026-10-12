// Play-test 10 Y29 — the title screen's front card: a loading state until the character list has arrived, the list, or
// one "Create character" button when there is nobody to play. And WHICH character the 3D figure on the title shows:
// the row under the pointer / the focused row, first of all the one played last (the figure used to be whatever the
// new-character form last held — a dwarf in purple robes for someone who plays a blonde elf in tan armour).
//
//   const F = createTitleFront({ onShow: char => … });     // char = a row of net.chars, or null (no characters)
//   F.set({ hasToken, loaded, failed, count })             // pure rule: pt10-core.js titleFront
//   F.chars(list)                                          // the list arrived (or changed): picks the row to show
//
// The markup is index.html's (#front, #mychars, #char-chips, #front-state, #new-char). DOM only; the gallery uses it too.

import { titleFront, titleFirstChar } from './pt10-core.js';

const $ = id => document.getElementById(id);
const LAST = 'tv.title.last';

export function createTitleFront({ onShow = null, storage = null } = {}) {
  const st = storage || (() => { try { return window.localStorage; } catch { return null; } })();
  const front = $('front'), chips = $('char-chips'), btn = $('new-char');
  let note = $('front-state');
  if (!note && front) { note = document.createElement('p'); note.id = 'front-state'; note.className = 'front-state'; note.setAttribute('aria-live', 'polite'); front.prepend(note); }
  let list = [], shown = null, cur = { state: '' };

  function set(o) {
    cur = titleFront(o);
    if (!front) return cur;
    front.dataset.state = cur.state;
    note.textContent = cur.note; note.hidden = !cur.note;
    note.classList.toggle('busy', cur.state === 'loading');
    if (btn) { btn.hidden = cur.state === 'loading'; if (cur.button) btn.textContent = cur.button; }
    const tiny = front.querySelector(':scope > .tiny'); if (tiny) tiny.hidden = cur.state !== 'list';
    if (cur.state === 'loading') { const m = $('mychars'); if (m) m.hidden = true; }
    return cur;
  }
  function mark() { for (const r of chips?.querySelectorAll('.char-row') || []) r.classList.toggle('shown', shown != null && r.dataset.char === String(shown.id)); }
  function show(c, { quiet = false } = {}) {
    if ((c?.id ?? null) === (shown?.id ?? null) && c === shown) { mark(); return; }
    shown = c || null; mark();
    if (!quiet) onShow?.(shown);
  }
  function chars(l) {
    list = Array.isArray(l) ? l : [];
    let lastId = null, lastName = null;
    try { lastId = st?.getItem(LAST); lastName = JSON.parse(st?.getItem('tv.name') || 'null'); } catch { /* private window */ }
    const keep = shown && list.find(c => String(c.id) === String(shown.id));
    show(keep || titleFirstChar(list, lastId, lastName));
  }
  const fromRow = e => { const row = e.target.closest?.('.char-row'); if (!row) return; const c = list.find(x => String(x.id) === row.dataset.char); if (c) show(c); };
  chips?.addEventListener('pointerover', fromRow);
  chips?.addEventListener('focusin', fromRow);
  // a redraw of the list (a portrait arrived) keeps the mark
  if (chips && typeof MutationObserver !== 'undefined') new MutationObserver(mark).observe(chips, { childList: true });

  return {
    set, chars, show,
    played(c) { try { if (c?.id != null) st?.setItem(LAST, String(c.id)); } catch { /* private window */ } },
    get state() { return { ...cur, shown: shown ? { id: shown.id, name: shown.name } : null }; },
    get shown() { return shown; },
  };
}

// ---- the gear a character was last seen wearing, kept in this browser (until the server sends `gear` on the list rows) ----
const GEAR = 'tv.title.gear';
export function rememberGear(charId, gear, storage = null) {
  if (charId == null || !gear || typeof gear !== 'object') return;
  try {
    const st = storage || window.localStorage, all = JSON.parse(st.getItem(GEAR) || '{}');
    all[String(charId)] = { t: Date.now(), gear };
    const ids = Object.keys(all).sort((a, b) => all[b].t - all[a].t);
    for (const id of ids.slice(24)) delete all[id];
    st.setItem(GEAR, JSON.stringify(all));
  } catch { /* private window / full */ }
}
export function rememberedGear(charId, storage = null) {
  try { const all = JSON.parse((storage || window.localStorage).getItem(GEAR) || '{}'); return all[String(charId)]?.gear || null; } catch { return null; }
}
