// Input layer (T27) — the on-screen keyboard a gamepad needs for the few places text cannot be avoided (chat, a name,
// a search box). D-pad / stick moves, A types, X deletes, Y is a space, Start sends, B puts it away.
const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl\'', 'zxcvbnm,.?', '/!- '];

export function createOsk({ parent = document.body, glyphs = null } = {}) {
  const root = document.createElement('div');
  root.className = 'tv-osk pad-ui'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'On-screen keyboard');
  parent.appendChild(root);
  const S = { input: null, r: 1, c: 0, shift: false };
  const keys = () => ROWS.map(r => [...r]);
  let draw = function () {
    const K = keys();
    root.replaceChildren(
      Object.assign(document.createElement('div'), { className: 'osk-text', textContent: (S.input?.value || '') + '▏' }),
      ...K.map((row, r) => { const d = document.createElement('div'); d.className = 'osk-row'; d.append(...row.map((ch, c) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'osk-key' + (r === S.r && c === S.c ? ' on' : '') + (ch === ' ' ? ' space' : ''); b.textContent = ch === ' ' ? 'space' : S.shift ? ch.toUpperCase() : ch; b.onclick = () => { S.r = r; S.c = c; type(); }; return b; })); return d; }),
      (() => { const d = document.createElement('div'); d.className = 'osk-help'; d.innerHTML = '<span><kbd data-key0="" data-action-pad="A" class="pad-glyph" data-btn="A">A</kbd> type</span><span><kbd data-key0="" class="pad-glyph" data-btn="X">X</kbd> delete</span><span><kbd data-key0="" class="pad-glyph" data-btn="Y">Y</kbd> space</span><span><kbd data-key0="" class="pad-glyph" data-btn="L3">LS</kbd> capitals</span><span><kbd data-key0="" class="pad-glyph" data-btn="START">Menu</kbd> send</span><span><kbd data-key0="" class="pad-glyph" data-btn="B">B</kbd> close</span>'; return d; })());
  }
  // 2026-10-16: the help line in the controller's own button names (PlayStation, generic) — and input/hints.js leaves it alone (data-key0="")
  const _draw = draw; draw = function () { _draw(); const G = glyphs?.(); if (G) for (const k of root.querySelectorAll('.osk-help kbd')) k.textContent = G[k.dataset.btn] || k.textContent; };
  const fire = () => S.input?.dispatchEvent(new Event('input', { bubbles: true }));
  function put(ch) { if (!S.input) return; const max = S.input.maxLength > 0 ? S.input.maxLength : 240; if (S.input.value.length >= max) return; S.input.value += ch; fire(); draw(); }
  function type() { const ch = keys()[S.r][S.c]; put(S.shift && ch !== ' ' ? ch.toUpperCase() : ch); if (S.shift) { S.shift = false; draw(); } }
  return {
    root, get isOpen() { return !root.hidden; }, get input() { return S.input; },
    open(input) { S.input = input; S.r = 1; S.c = 0; S.shift = !input.value; root.hidden = false; draw(); },
    close() { root.hidden = true; S.input = null; },
    move(dx, dy) { const K = keys(); S.r = (S.r + dy + K.length) % K.length; S.c = Math.max(0, Math.min(K[S.r].length - 1, S.c + dx)); if (dx && S.c + dx < 0) S.c = K[S.r].length - 1; draw(); },
    type, space: () => put(' '), shift() { S.shift = !S.shift; draw(); },
    back() { if (S.input) { S.input.value = S.input.value.slice(0, -1); fire(); draw(); } },
    /** Send: a form submits, anything else gets Enter. */
    done() { const i = S.input; this.close(); if (!i) return; if (i.form) { if (i.form.requestSubmit) i.form.requestSubmit(); else i.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); } else i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })); i.blur(); },
    setLabels(G) { for (const k of root.querySelectorAll('.osk-help kbd')) k.textContent = G[k.dataset.btn] || k.textContent; },
  };
}
