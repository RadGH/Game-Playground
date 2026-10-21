// Input layer (T27) — the on-screen keyboard a gamepad needs for the few places text cannot be avoided (chat, a name,
// a search box). D-pad / stick moves, A types, X deletes, Y is a space, Start sends, B puts it away.
//
// Play-test 12 (2026-10-17):
//  · #68 — the controller could never reach the LEFT column: move() clamped the column first and THEN asked "would this
//    step go below 0?", so one step left from column 1 landed on 0 and was immediately wrapped to the far end. Moving is
//    now one wrap rule (oskStep below, pure + unit tested), and up/down keep the cursor under the same spot on screen.
//  · #74 — wide screens (Steam Deck 1280x800, a 1024x576 window): the board was a 640px-wide stack of six 40px rows, a
//    tall block over the middle of a short screen. The board now carries its own action keys (⇧ capitals, ⌫ delete,
//    space, Send) so a mouse/touch user and a pad user see the same thing, and css/input.css lays it out wider and lower
//    on a wide or short screen.

/** Keys per row. A one-character string is a letter; the rest are action keys. `w` = how wide (flex weight). */
export const OSK_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', { k: 'back', label: '⌫', w: 1.5 }],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '-'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '\'', '!'],
  [{ k: 'shift', label: '⇧', w: 1.5 }, 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '?'],
  ['/', ':', { k: 'space', label: 'space', w: 5 }, { k: 'done', label: 'Send', w: 2 }],
].map(row => row.map(k => typeof k === 'string' ? { k: 'char', ch: k, label: k, w: 1 } : k));

/** Centre of each key in a row, 0..1 across the board (so up/down can stay under the same spot). */
export function oskCentres(row) {
  const total = row.reduce((s, k) => s + k.w, 0); let x = 0;
  return row.map(k => { const c = (x + k.w / 2) / total; x += k.w; return c; });
}

/**
 * One step on the board. Left/right wrap within the row (column 0 is reachable from column 1 — the #68 bug);
 * up/down wrap between rows and land on the key nearest the remembered x (`sx`, 0..1).
 * @returns {{ r:number, c:number, sx:number }}
 */
export function oskStep(rows, { r, c, sx = null }, dx, dy) {
  if (dx) {
    const n = rows[r].length;
    c = ((c + dx) % n + n) % n;
    return { r, c, sx: oskCentres(rows[r])[c] };
  }
  if (dy) {
    const x = sx ?? oskCentres(rows[r])[c];
    r = ((r + dy) % rows.length + rows.length) % rows.length;
    const cs = oskCentres(rows[r]); let best = 0;
    for (let i = 1; i < cs.length; i++) if (Math.abs(cs[i] - x) < Math.abs(cs[best] - x)) best = i;
    return { r, c: best, sx: x };
  }
  return { r, c, sx };
}

export function createOsk({ parent = document.body, glyphs = null } = {}) {
  const root = document.createElement('div');
  root.className = 'tv-osk pad-ui'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'On-screen keyboard');
  parent.appendChild(root);
  const S = { input: null, r: 1, c: 0, sx: null, shift: false };
  function draw() {
    const help = document.createElement('div'); help.className = 'osk-help';
    help.innerHTML = '<span><kbd data-key0="" class="pad-glyph" data-btn="A">A</kbd> type</span><span><kbd data-key0="" class="pad-glyph" data-btn="X">X</kbd> delete</span><span><kbd data-key0="" class="pad-glyph" data-btn="Y">Y</kbd> space</span><span><kbd data-key0="" class="pad-glyph" data-btn="L3">LS</kbd> capitals</span><span><kbd data-key0="" class="pad-glyph" data-btn="START">Menu</kbd> send</span><span><kbd data-key0="" class="pad-glyph" data-btn="B">B</kbd> close</span>';
    root.replaceChildren(
      Object.assign(document.createElement('div'), { className: 'osk-text', textContent: (S.input?.value || '') + '▏' }),
      ...OSK_ROWS.map((row, r) => {
        const d = document.createElement('div'); d.className = 'osk-row';
        d.append(...row.map((key, c) => {
          const b = document.createElement('button'); b.type = 'button';
          b.className = 'osk-key' + (r === S.r && c === S.c ? ' on' : '') + (key.k !== 'char' ? ' act act-' + key.k : '') + (key.k === 'shift' && S.shift ? ' lit' : '');
          b.style.flexGrow = String(key.w);
          b.textContent = key.k === 'char' ? (S.shift ? key.ch.toUpperCase() : key.ch) : key.label;
          b.onclick = () => { S.r = r; S.c = c; S.sx = null; api.type(); };
          return b;
        }));
        return d;
      }),
      help);
    // 2026-10-16: the help line in the controller's own button names (PlayStation, generic) — input/hints.js leaves it alone (data-key0="")
    const G = glyphs?.(); if (G) for (const k of root.querySelectorAll('.osk-help kbd')) k.textContent = G[k.dataset.btn] || k.textContent;
  }
  const fire = () => S.input?.dispatchEvent(new Event('input', { bubbles: true }));
  function put(ch) { if (!S.input) return; const max = S.input.maxLength > 0 ? S.input.maxLength : 240; if (S.input.value.length >= max) return; S.input.value += ch; fire(); draw(); }
  const api = {
    root, get isOpen() { return !root.hidden; }, get input() { return S.input; },
    /** Where the cursor is (tests + the gallery). */
    get at() { const key = OSK_ROWS[S.r][S.c]; return { r: S.r, c: S.c, key: key.k === 'char' ? key.ch : key.k }; },
    open(input) { S.input = input; S.r = 1; S.c = 0; S.sx = null; S.shift = !input.value; root.hidden = false; draw(); },
    close() { root.hidden = true; S.input = null; },
    move(dx, dy) { Object.assign(S, oskStep(OSK_ROWS, S, dx, dy)); draw(); },
    type() {
      const key = OSK_ROWS[S.r][S.c];
      if (key.k === 'back') return api.back();
      if (key.k === 'shift') return api.shift();
      if (key.k === 'space') return api.space();
      if (key.k === 'done') return api.done();
      put(S.shift ? key.ch.toUpperCase() : key.ch);
      if (S.shift) { S.shift = false; draw(); }
    },
    space: () => put(' '), shift() { S.shift = !S.shift; draw(); },
    back() { if (S.input) { S.input.value = S.input.value.slice(0, -1); fire(); draw(); } },
    /** Send: a form submits, anything else gets Enter. */
    done() { const i = S.input; api.close(); if (!i) return; if (i.form) { if (i.form.requestSubmit) i.form.requestSubmit(); else i.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); } else i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })); i.blur(); },
    setLabels(G) { for (const k of root.querySelectorAll('.osk-help kbd')) k.textContent = G[k.dataset.btn] || k.textContent; },
  };
  return api;
}
