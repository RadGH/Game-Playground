// Thousandvale tooltips (play-test P5): every hover bubble in the game goes through the shared engine
// (shared/tooltip.js — data-tip / data-tip-html / data-tip-render), never the browser's native `title`, which
// cannot be styled, arrives after a second, and never shows while a mouse button or key is held.
//
//   import { installGameTips, registerTip, tipAttrs } from './ui/tips.js';
//   installGameTips();                       // once, at boot (main.js)
//   el.dataset.tip = 'Plain text';           // or data-tip-html / data-tip-render="item" (+ registerTip)
//
// A safety net converts any `title` attribute that still turns up (another module, a library, a future
// edit) into `data-tip` the moment it is set, so a native bubble can never come back silently. The test
// (tests/D/ui-tips.test.js) also scans the client source for `title=` / `.title =`.

import { installTooltips, registerTip as reg, refreshTip, hideTip, tipOpen } from '../../../../../shared/tooltip.js';

export { refreshTip, hideTip, tipOpen };
export const registerTip = reg;

/** Move a native `title` onto the shared engine. Pure-ish (one element). Returns true when it changed something. */
export function adoptTitle(el) {
  if (!el || !el.getAttribute) return false;
  const t = el.getAttribute('title');
  if (t == null) return false;
  el.removeAttribute('title');
  if (t && !el.dataset.tip && !el.dataset.tipHtml && !el.dataset.tipRender) el.dataset.tip = t;
  return true;
}

let installed = false;
export function installGameTips(root = document.body) {
  if (installed) return;
  installed = true;
  installTooltips(document, { keepOnPress: true });
  // the tooltip must sit above every HUD window, the map and the minimap
  const st = document.createElement('style');
  st.textContent = '.tipbox{z-index:100000}';
  document.head.appendChild(st);
  for (const el of root.querySelectorAll('[title]')) adoptTitle(el);
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'attributes') adoptTitle(m.target);
        else for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          adoptTitle(n);
          if (n.querySelectorAll) for (const c of n.querySelectorAll('[title]')) adoptTitle(c);
        }
      }
    }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
  }
}

/** Small HTML builder for rich tips: tipHtml('Title', 'sub line', ['row', 'row']). Escapes everything. */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function tipHtml(title, sub = '', rows = []) {
  return `<div class="tip-title">${esc(title)}</div>${sub ? `<div class="tip-sub">${esc(sub)}</div>` : ''}${rows.length ? '<hr>' + rows.map(r => `<div>${esc(r)}</div>`).join('') : ''}`;
}
export { esc };
