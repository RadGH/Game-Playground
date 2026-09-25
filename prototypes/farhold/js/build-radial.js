// Farhold R26 — the build menu as a ring.
//
//   "The building system needs revamped. The build menu needs redesigned, maybe into a radial
//    menu. The user should be able to build a storage box, furnace, and everything needed to smelt
//    iron, right from the beginning."
//
// B puts build mode up with THIS in the middle of the screen instead of the long panel: a ring of
// groups (Storage, Workshop, Refining… and Tools), then a ring of the pieces in the group you
// picked, each with its price and whether you can pay it. Pick one and the ring goes away, the
// ghost follows the cursor exactly as before, and a small card at the bottom of the screen keeps
// the price against what you hold and the live reason the ghost is red.
//
// The long panel is not gone — everything it shows (the first steps, the bench you are at, the
// drills, the work board, the holding, the shipyard) is still one key away:
//
//   B            build mode on, ring up           (B again leaves build mode, as it always did)
//   click / 1-9  pick a group, then a piece       (0 is the tenth; ← → and Enter work too)
//   Backspace    back to the groups               (Esc too, on the pieces ring)
//   Tab          the full panel                   (its "Ring" button comes back here)
//   right-click  the ring again, while placing    (right-click on the ring puts it away)
//
// Created by js/build-ui.js, which already holds everything this needs — the catalogue, the build
// controller, the purse, the research lock — so js/main.js only changes what B opens.
//
// No inline styles: buildradial.css, injected here, like station.css and buildpanel.css.

import { el } from '../../../shared/ui.js';
import { mat } from '../../../shared/format.js';

const CSS_HREF = 'buildradial.css';

/** The groups a new player needs first come first round the ring. The rest keep the catalogue order. */
const FIRST = ['store', 'craft', 'refine', 'extract', 'power', 'home'];

/** How many pieces one ring holds before it pages. Ten, so the number keys 1-9 and 0 cover a page. */
export const PAGE = 10;

/**
 * THE RING'S CONTENTS, AS DATA — pure, so `node --test` can check it without a browser.
 *
 *   ringItems({ level: 'cats', cats, pieces, tools })          -> [{ kind: 'cat', key, name, count }…, { kind: 'tools' }]
 *   ringItems({ level: 'pieces', cat, pieces, page })          -> [{ kind: 'piece', id, name }…, { kind: 'more' }?]
 *   ringItems({ level: 'tools', tools })                       -> [{ kind: 'tool', key, name }…]
 */
export function ringItems({ level = 'cats', cats = {}, pieces = [], cat = null, page = 0, tools = [], lockOf = null } = {}) {
  if (level === 'cats') {
    const keys = Object.keys(cats).filter(k => pieces.some(p => p.cat === k));
    keys.sort((a, b) => {
      const ia = FIRST.indexOf(a), ib = FIRST.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    const out = keys.map(k => ({ kind: 'cat', key: k, name: cats[k]?.name || k, count: pieces.filter(p => p.cat === k).length }));
    if (tools.length) out.push({ kind: 'tools', key: '_tools', name: 'Tools', count: tools.length });
    return out;
  }
  if (level === 'tools') return tools.map(t => ({ kind: 'tool', key: t.key, name: t.name, hint: t.hint }));
  // what you can build at all first, then the cheap end of the group: the Storage Box, not the
  // Logistics Pole, is the first thing on the Storage ring
  const units = p => Object.values(p.cost || {}).reduce((n, v) => n + v, 0);
  const locked = p => (lockOf?.(p) ? 1 : 0);
  const rows = pieces.filter(p => p.cat === cat)
    .sort((a, b) => locked(a) - locked(b) || (a.tier || 1) - (b.tier || 1) || units(a) - units(b) || a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const at = ((page % pages) + pages) % pages;
  const out = rows.slice(at * PAGE, at * PAGE + PAGE).map(p => ({ kind: 'piece', id: p.id, name: p.name, piece: p }));
  if (pages > 1) out.push({ kind: 'more', key: '_more', name: `More (${at + 1}/${pages})` });
  return out;
}

export function createBuildRadial({
  catalogue = null, build = null, store = null, tools = [], onLog = null,
  /** () => void — Tab, or the centre's "Full list" button: put the long panel up instead. */
  onPanel = null,
  /** (piece) => lock | null — js/buildplan.js's research lock, the same sentence the panel prints. */
  lockOf = null,
  /** () => bool — is the long panel up? The placement card hides while it is, the panel says it all. */
  panelOpen = () => false,
} = {}) {
  if (typeof document !== 'undefined' && !document.querySelector(`link[href="${CSS_HREF}"]`)) {
    document.head.appendChild(el('link', { rel: 'stylesheet', href: CSS_HREF }));
  }
  const pieces = catalogue?.structures || [];
  const cats = catalogue?.categories || {};
  const names = catalogue?.materials || {};
  const have = id => (store?.have ? store.have(id) : 0);
  const nameOf = id => (names[id]?.name || id.replace(/_/g, ' ')).toLowerCase();

  let open = false;
  let level = 'cats';
  let cat = null;
  let page = 0;
  let hover = -1;
  let items = [];
  let cardSig = '';

  const ring = el('div', { class: 'br-ring' });
  const centre = el('div', { class: 'br-centre' });
  const root = el('div', { class: 'build-radial hidden', id: 'build-radial' }, ring, centre);
  const card = el('div', { class: 'br-card hidden', id: 'build-card' });
  // a click on the dim backdrop (not on an item) goes back a ring, and off the first ring closes it
  root.addEventListener('click', e => { if (e.target === root) back(true); });
  root.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); api.close(); });
  if (typeof document !== 'undefined') document.body.append(root, card);

  /** Price of a piece against what you hold. */
  function priceOf(p) {
    const lines = Object.entries(p?.cost || {}).map(([id, n]) => {
      const got = have(id);
      return { id, n, got, short: got < n, text: `${mat(n)} ${nameOf(id)}` };
    });
    return { lines, afford: lines.every(l => !l.short) };
  }

  function drawCentre() {
    centre.replaceChildren();
    const it = items[hover] || null;
    const head = level === 'cats' ? 'Build' : level === 'tools' ? 'Tools' : (cats[cat]?.name || cat);
    centre.append(el('b', { class: 'br-title', text: it ? it.name : head }));
    if (it?.kind === 'piece') {
      const p = it.piece;
      const lock = lockOf?.(p) || null;
      if (lock) centre.append(el('p', { class: 'br-why', text: lock.text }));
      const { lines } = priceOf(p);
      const ul = el('ul', { class: 'br-cost' });
      for (const l of lines) ul.append(el('li', { class: l.short ? 'short' : 'ok', text: `${l.text} — you have ${mat(l.got)}` }));
      if (!lines.length) ul.append(el('li', { class: 'ok', text: 'Free' }));
      centre.append(ul);
      if (p.desc) centre.append(el('p', { class: 'br-desc', text: p.desc }));
    } else if (it?.kind === 'cat') {
      const rows = pieces.filter(p => p.cat === it.key);
      const can = rows.filter(p => !lockOf?.(p) && priceOf(p).afford).length;
      centre.append(el('p', { class: 'br-desc', text: `${rows.length} pieces · ${can} you can build now` }));
    } else if (it?.kind === 'tool' || it?.kind === 'tools') {
      centre.append(el('p', { class: 'br-desc', text: it.hint || 'Level, raise and lower ground, lay roads and walls, scan, take things down.' }));
    } else if (it?.kind === 'more') {
      centre.append(el('p', { class: 'br-desc', text: 'The next page of this group.' }));
    } else {
      centre.append(el('p', { class: 'br-desc', text: level === 'cats' ? 'Pick a group.' : 'Pick one to place it.' }));
    }
    const btns = el('div', { class: 'br-btns' });
    if (level !== 'cats') btns.append(el('button', { class: 'br-back', text: '‹ Back', title: 'Backspace', onclick: () => back() }));
    btns.append(el('button', { class: 'br-panel', text: 'Full list (Tab)', title: 'The long panel: first steps, the bench you are at, drills, the work board', onclick: () => toPanel() }));
    centre.append(btns);
  }

  function draw() {
    if (!open) return;
    items = ringItems({ level, cats, pieces, cat, page, tools, lockOf });
    if (hover >= items.length) hover = -1;
    ring.replaceChildren();
    const n = items.length;
    items.forEach((it, i) => {
      // start at the top and go clockwise; CSS turns --a into a spot on the circle
      const angle = (i / n) * 360;
      let state = '';
      let sub = '';
      if (it.kind === 'piece') {
        const lock = lockOf?.(it.piece) || null;
        const { lines, afford } = priceOf(it.piece);
        state = lock ? 'locked' : afford ? 'ok' : 'short';
        sub = lock ? 'locked' : (lines.map(l => l.text).join(' · ') || 'free');
      } else if (it.kind === 'cat') {
        const rows = pieces.filter(p => p.cat === it.key);
        const can = rows.filter(p => !lockOf?.(p) && priceOf(p).afford).length;
        state = can ? 'ok' : 'short';
        sub = `${can}/${rows.length} ready`;
      } else if (it.kind === 'tool') {
        state = build?.tool === it.key ? 'on' : '';
      }
      const b = el('button', {
        class: `br-item br-${it.kind} ${state}${i === hover ? ' hot' : ''}`,
        style: `--a:${angle}deg`,
        title: it.kind === 'piece' ? (it.piece.desc || '') : (it.hint || ''),
        onclick: e => { e.stopPropagation(); choose(i); },
        onmouseenter: () => { hover = i; markHot(); drawCentre(); },
      });
      b.dataset.id = it.id || it.key;
      const key = i < 9 ? String(i + 1) : i === 9 ? '0' : '';
      b.append(
        el('span', { class: 'br-key', text: key }),
        el('span', { class: 'br-name', text: it.name }),
      );
      if (sub) b.append(el('span', { class: 'br-sub', text: sub }));
      ring.append(b);
    });
    root.dataset.level = level;
    drawCentre();
  }

  function markHot() {
    [...ring.children].forEach((c, i) => c.classList.toggle('hot', i === hover));
  }

  function choose(i) {
    const it = items[i];
    if (!it) return;
    if (it.kind === 'cat') { level = 'pieces'; cat = it.key; page = 0; hover = -1; draw(); return; }
    if (it.kind === 'tools') { level = 'tools'; hover = -1; draw(); return; }
    if (it.kind === 'more') { page++; hover = -1; draw(); return; }
    if (it.kind === 'tool') {
      build?.setTool(it.key);
      onLog?.(it.hint || it.name, '');
      api.close();
      return;
    }
    if (it.kind === 'piece') {
      const lock = lockOf?.(it.piece) || null;
      if (lock) { onLog?.(lock.text, 'warn'); return; }
      build?.select(it.id);
      // the same rule the panel follows: a road or a wall piece picked while its run tool is up is
      // choosing WHICH road, so the tool stays; anything else means "place this"
      const runnable = it.piece.cat === 'road' || it.piece.cat === 'defence';
      const onRun = build?.tool === 'road' || build?.tool === 'wall';
      if (build?.tool !== 'build' && !(runnable && onRun)) build?.setTool('build');
      const { afford, lines } = priceOf(it.piece);
      onLog?.(afford
        ? `${it.piece.name}: click the ground to place it. Scroll turns it · right-click for the menu.`
        : `${it.piece.name}: you are short of ${lines.filter(l => l.short).map(l => `${mat(l.n - l.got)} ${nameOf(l.id)}`).join(', ')}.`,
      afford ? '' : 'warn');
      api.close();
    }
  }

  /** One ring back. Off the first ring it closes, unless `fromBackdrop` says the player only missed. */
  function back(fromBackdrop = false) {
    if (level === 'pieces' && page > 0 && !fromBackdrop) { page--; draw(); return; }
    if (level !== 'cats') { level = 'cats'; cat = null; page = 0; hover = -1; draw(); return; }
    api.close();
  }

  function toPanel() {
    api.close();
    onPanel?.();
  }

  // ---------------------------------------------------------------- the card while you place

  function drawCard() {
    const show = !open && !!build?.mode && !panelOpen();
    card.classList.toggle('hidden', !show);
    if (!show) { cardSig = ''; return; }
    const tool = tools.find(t => t.key === build.tool);
    const placing = !tool || tool.kind === 'place';
    const p = placing ? pieces.find(x => x.id === build.selected) : null;
    // it is called every frame; only rebuild when something on it would actually change
    const sig = JSON.stringify([build.tool, p?.id, build.lastCheck?.ok, build.lastCheck?.why,
      p ? Object.keys(p.cost || {}).map(have) : 0]);
    if (sig === cardSig) return;
    cardSig = sig;
    card.replaceChildren();
    const row = el('div', { class: 'br-card-row' });
    row.append(el('b', { text: p ? p.name : tool ? tool.name : 'Build' }));
    if (p) {
      for (const l of priceOf(p).lines) {
        row.append(el('span', { class: `br-chip ${l.short ? 'short' : 'ok'}`, text: `${l.text} (${mat(l.got)})` }));
      }
    }
    card.append(row);
    const why = build?.lastCheck;
    const line = !p && tool ? tool.hint
      : why && !why.ok && why.why ? why.why
      : why?.ok ? 'Clear. Click to build.'
      : 'Aim at the ground.';
    card.append(el('div', { class: `br-card-why ${why && !why.ok && p ? 'bad' : ''}`, text: line }));
    card.append(el('div', { class: 'br-card-keys', text: 'right-click: menu · Tab: full list · scroll: turn · Ctrl+Z: undo · B: leave' }));
  }

  // ---------------------------------------------------------------- keys and the right button

  function onKey(e) {
    if (!open) {
      // Tab while placing opens the long panel rather than the character sheet
      if (e.code === 'Tab' && build?.mode && !panelOpen()) {
        e.preventDefault(); e.stopImmediatePropagation(); onPanel?.();
      }
      return;
    }
    const k = e.code;
    const digit = /^Digit(\d)$/.exec(k);
    let used = true;
    if (digit) choose(digit[1] === '0' ? 9 : Number(digit[1]) - 1);
    else if (k === 'Backspace') back();
    else if (k === 'Escape' && level !== 'cats') back();
    else if (k === 'Tab') toPanel();
    else if (k === 'ArrowRight' || k === 'ArrowDown') { hover = (hover + 1) % Math.max(1, items.length); markHot(); drawCentre(); }
    else if (k === 'ArrowLeft' || k === 'ArrowUp') { hover = (hover - 1 + items.length) % Math.max(1, items.length); markHot(); drawCentre(); }
    else if (k === 'Enter' && hover >= 0) choose(hover);
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
  function onContext(e) {
    if (!build?.mode) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (open) api.close(); else api.open();
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('contextmenu', onContext, true);
  }

  const api = {
    root, card,
    get isOpen() { return open; },
    get level() { return level; },
    get items() { return items; },
    open({ at = 'cats' } = {}) {
      open = true; level = at; cat = null; page = 0; hover = -1;
      root.classList.remove('hidden');
      document.body?.classList.add('radial-open');
      draw(); drawCard();
      return true;
    },
    close() {
      if (!open) { drawCard(); return false; }
      open = false;
      root.classList.add('hidden');
      document.body?.classList.remove('radial-open');
      drawCard();
      return true;
    },
    /** Leave build mode entirely: no ring, no card. */
    hide() { api.close(); card.classList.add('hidden'); },
    /** Open straight on one group — for the tests and the debug menu. */
    openCat(key) { api.open(); level = 'pieces'; cat = key; draw(); return items; },
    choose,
    /** From the frame loop while build mode is up. The ring redraws only when asked; the card is live. */
    tick() {
      if (!build?.mode) { card.classList.add('hidden'); return; }
      drawCard();
    },
    refresh() { draw(); drawCard(); },
    dispose() {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('contextmenu', onContext, true);
      root.remove(); card.remove();
    },
  };
  return api;
}
