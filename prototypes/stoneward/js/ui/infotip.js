// Info cards on menu buttons (owner 2026-11-04: "hover tooltips that explain what it is and does, and
// any of its calculable stats… on mobile you should be able to click a button to read info about it").
//
//   initInfo({ data, about, esc, sheet })   once, from main.js
//   withInfo(el, 'kind:outpost')            any menu button: hover shows the card (a mouse), and an ⓘ
//                                           inside the button opens the same card in the sheet (a tap)
//   specs: kind:<building id> · tool:<road/wall/track id> · power:<id>:<size 0-2>
//
// The words and numbers come from js/ui/about.js (pure). The hover box is the shared tooltip engine;
// it is only switched on where the device has a real hover, so a phone never gets a box popping up
// under its finger (focus would otherwise open one on every tap).

import { installTooltips, registerTip, hideTip } from '../../../../shared/tooltip.js';
import { kindCard, toolCard, powerCard, cardHtml } from './about.js';

let ctx = null;
const canHover = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

export function cardFor(spec) {
  if (!ctx || !spec) return null;
  const [type, id, size] = spec.split(':');
  if (type === 'kind') return kindCard(id, ctx.data, ctx.about);
  if (type === 'tool') return toolCard(id, ctx.data, ctx.about);
  if (type === 'power') return powerCard(id, ctx.data, +size || 0);
  return null;
}
export const infoHtml = spec => cardHtml(cardFor(spec), ctx?.esc);

export function initInfo(c) {
  ctx = c;
  for (const href of ['../../../../shared/tooltip.css']) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL(href, import.meta.url).href; document.head.append(l);
  }
  registerTip('sw-info', el => { const h = infoHtml(el.dataset.info); if (!h) return null; const d = document.createElement('div'); d.className = 'info-card'; d.innerHTML = h; return d; });
  if (canHover()) installTooltips();
}

/** Show the card in the sheet (the phone path, and the ⓘ on a computer). */
export function openInfo(spec) {
  const h = infoHtml(spec); if (!h || !ctx) return;
  hideTip();
  const el = ctx.sheet(`<div class="info-card">${h}<div class="tip-sub info-close">Tap to close</div></div>`, 30000);
  if (!el) return;
  el.classList.add('info-sheet');
  el.onclick = () => el.classList.add('hidden');
}

/** Give a menu button its card. Safe to call again on the same button (updates the spec). */
export function withInfo(el, spec) {
  if (!el) return el;
  el.dataset.info = spec;
  if (canHover()) { el.dataset.tipRender = 'sw-info'; el.dataset.tipClass = 'sw-tip'; el.removeAttribute('title'); }
  if (!el.querySelector(':scope > .info-btn')) {
    const i = document.createElement('span');
    i.className = 'info-btn'; i.setAttribute('role', 'button'); i.setAttribute('aria-label', 'About this'); i.textContent = 'i';
    // the ⓘ sits INSIDE the menu button: stop the press from also choosing the item
    const stop = e => { e.stopPropagation(); };
    i.addEventListener('pointerdown', stop);
    i.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); openInfo(el.dataset.info); });
    el.append(i);
  }
  return el;
}
