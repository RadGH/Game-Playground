// Playground shared UI helpers. Plain ES module, no dependencies.
// Import with: import { knob, select, checkbox, button, el, toast, downloadJSON, copyText, readJSONFile } from '../shared/ui.js';

/** Create an element: el('div', {class:'row', onclick: fn, text:'hi'}, child1, child2) */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) node.append(c.nodeType ? c : document.createTextNode(String(c)));
  return node;
}

/**
 * Slider with label + live value. onChange(value) fires on every input event.
 * opts: { min, max, step, value, format(v)->string, title }
 * Returns the wrapper element; wrapper.set(v) updates it without firing onChange; wrapper.value reads current.
 */
export function knob(label, opts, onChange) {
  const { min = 0, max = 1, step = 0.01, value = 0, format = v => (Number.isInteger(step) ? String(v) : Number(v).toFixed(2)), title } = opts;
  const input = el('input', { type: 'range', min, max, step, value, 'aria-label': label });
  const val = el('span', { class: 'val', text: format(value) });
  const wrap = el('div', { class: 'knob', title }, el('div', { class: 'head' }, el('span', { text: label }), val), input);
  input.addEventListener('input', () => { val.textContent = format(+input.value); onChange?.(+input.value); });
  wrap.set = v => { input.value = v; val.textContent = format(+v); };
  Object.defineProperty(wrap, 'value', { get: () => +input.value });
  wrap.input = input;
  return wrap;
}

/** Labelled <select>. options: array of strings or {value,label,disabled}. onChange(value). */
export function select(label, options, value, onChange) {
  const sel = el('select');
  for (const o of options) {
    const opt = typeof o === 'string' ? { value: o, label: o } : o;
    sel.append(el('option', { value: opt.value, text: opt.label ?? opt.value, disabled: opt.disabled ? '' : null }));
  }
  if (value != null) sel.value = value;
  sel.addEventListener('change', () => onChange?.(sel.value));
  const wrap = el('div', { class: 'row' }, label ? el('label', { text: label }) : null, sel);
  wrap.select = sel; wrap.set = v => { sel.value = v; };
  Object.defineProperty(wrap, 'value', { get: () => sel.value });
  return wrap;
}

export function checkbox(label, checked, onChange) {
  const input = el('input', { type: 'checkbox' }); input.checked = !!checked;
  input.addEventListener('change', () => onChange?.(input.checked));
  const wrap = el('label', { class: 'row', style: { cursor: 'pointer' } }, input, ' ', label);
  wrap.input = input; Object.defineProperty(wrap, 'value', { get: () => input.checked });
  wrap.set = v => { input.checked = !!v; };
  return wrap;
}

export function button(label, onClick, cls = '') { return el('button', { class: cls, onclick: onClick, text: label }); }

export function textInput(label, value, onChange, opts = {}) {
  const input = el('input', { type: 'text', value: value ?? '', placeholder: opts.placeholder, style: { flex: 1 } });
  input.addEventListener('input', () => onChange?.(input.value));
  const wrap = el('div', { class: 'row' }, label ? el('label', { text: label }) : null, input);
  wrap.input = input; wrap.set = v => { input.value = v ?? ''; };
  Object.defineProperty(wrap, 'value', { get: () => input.value });
  return wrap;
}

/** Collapsible panel: panel('Title', child1, child2). Click title to collapse. */
export function panel(title, ...children) {
  // (2026-11-03: the title is a real button for keyboards and screen readers — Enter/Space toggle, aria-expanded)
  const toggle = () => { p.classList.toggle('closed'); h.setAttribute('aria-expanded', String(!p.classList.contains('closed'))); };
  const h = el('h3', { text: title, role: 'button', tabindex: '0', 'aria-expanded': 'true', onclick: toggle, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } } });
  const p = el('div', { class: 'panel collapsible' }, h, ...children);
  return p;
}

/**
 * Previous / next buttons around a <select> (2026-11-03): click ◀ ▶ to step through the options instead of opening the
 * list. Wraps at both ends, skips disabled options and fires the select's own `change` event, so existing handlers run.
 * Returns the wrapper (class `stepper`); the select is moved inside it. `label` names the buttons for screen readers.
 */
export function stepper(sel, label = '') {
  const go = d => {
    const opts = [...sel.options]; if (!opts.length) return;
    let i = sel.selectedIndex;
    for (let n = 0; n < opts.length; n++) { i = (i + d + opts.length) % opts.length; if (!opts[i].disabled) break; }
    if (i === sel.selectedIndex) return;
    sel.selectedIndex = i; sel.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const name = label ? ' ' + label.toLowerCase() : '';
  const prev = el('button', { type: 'button', class: 'step prev', text: '◀', title: 'Previous' + name, 'aria-label': 'Previous' + name, onclick: () => go(-1) });
  const next = el('button', { type: 'button', class: 'step next', text: '▶', title: 'Next' + name, 'aria-label': 'Next' + name, onclick: () => go(1) });
  const wrap = el('span', { class: 'stepper' });
  sel.replaceWith(wrap); wrap.append(prev, sel, next);
  return wrap;
}

let toastTimer;
export function toast(msg, ms = 2200) {
  let t = document.querySelector('.toast');
  if (!t) { t = el('div', { class: 'toast' }); document.body.append(t); }
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.style.display = 'none'; }, ms);
}

export function downloadJSON(obj, filename = 'export.json') {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); a.remove();
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); }
  catch { const ta = el('textarea', { text }); document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Copied'); }
}

/** Opens a file picker and resolves with parsed JSON. */
export function readJSONFile() {
  return new Promise((resolve, reject) => {
    const input = el('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', async () => {
      const f = input.files[0]; if (!f) return reject(new Error('no file'));
      try { resolve(JSON.parse(await f.text())); } catch (e) { reject(e); }
    });
    input.click();
  });
}

/** Seeded random helpers (mulberry32) so "random character" can be reproduced from a seed. */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  next.pick = arr => arr[Math.floor(next() * arr.length)];
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.int = (lo, hi) => Math.floor(next.range(lo, hi + 1));
  return next;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
