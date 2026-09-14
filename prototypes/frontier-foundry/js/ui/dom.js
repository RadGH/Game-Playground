// Small helpers every interface module uses. No framework, no build step - just the three or four
// things you end up rewriting in every plain-DOM page.

/** Get an element by id. */
export const $ = id => document.getElementById(id);

/** Build an element: el('div.row.wide', { title: 'x' }, child, child) */
export function el(spec, attrs = null, ...kids) {
  const [tagAndId, ...classes] = String(spec).split('.');
  const [tag, id] = tagAndId.split('#');
  const node = document.createElement(tag || 'div');
  if (id) node.id = id;
  if (classes.length) node.className = classes.join(' ');
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'key') node.dataset.key = v;
    else if (k === 'tip') node.dataset.tip = v;
    else if (k === 'tipHtml') node.dataset.tipHtml = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) node.append(k.nodeType ? k : document.createTextNode(String(k)));
  return node;
}

/** Replace an element's children in one go. */
export function fill(node, ...kids) { node.replaceChildren(); for (const k of kids.flat()) if (k != null && k !== false) node.append(k.nodeType ? k : document.createTextNode(String(k))); return node; }

// ---------------------------------------------------------------------------- live re-rendering
//
// fill() is right for a screen you have just opened. It is wrong for a panel that redraws four
// times a second while you are using it: replacing the children throws away every element, and a
// <select> whose element is thrown away closes its open list. That is the whole of the "dropdowns
// will not stay open" bug.
//
// patch() is a small morph instead. An element is only reused when its subtree carries the same set
// of `key`s as the one replacing it - so a keyed <select> is updated in place, its ancestors are
// updated in place around it, and everything unkeyed is still replaced outright. That last rule
// matters: a reused element keeps the click handlers it was built with, and those close over the
// entities of the render that made them, so reuse is opt-in and only where it is needed.
//
//   const sel = el('select', { key: 'recipe:' + s.id });   // survives a re-render
//   patch(panel, body, closeButton);

/** Every `key` in a subtree, the element's own first. Two trees with the same list can be merged. */
function keysOf(node) {
  if (!node || node.nodeType !== 1) return '';
  const out = node.dataset.key ? [node.dataset.key] : [];
  for (const k of node.querySelectorAll('[data-key]')) out.push(k.dataset.key);
  return out.join('|');
}

/** Can the old node be updated into the new one, rather than thrown away and replaced? */
function canMorph(o, n) {
  if (!o || !n || o.nodeType !== 1 || n.nodeType !== 1 || o.tagName !== n.tagName) return false;
  const kn = keysOf(n);
  return !!kn && keysOf(o) === kn;
}

/** A form control keeps what the player has done to it: its value, and an open list. */
function syncField(o, n) {
  if (o.tagName === 'SELECT') {
    const sig = [...n.options].map(x => x.value + '\u0000' + x.textContent).join('\u0001');
    if (o.dataset.sig !== sig) {
      const had = o.value;
      o.replaceChildren(...n.options);
      o.dataset.sig = sig;
      o.value = [...o.options].some(x => x.value === had) ? had : n.value;
    } else if (document.activeElement !== o) o.value = n.value;
    o.disabled = n.disabled;
    return true;
  }
  if (o.tagName === 'INPUT' || o.tagName === 'TEXTAREA') {
    if (document.activeElement !== o) {
      if (o.type === 'checkbox' || o.type === 'radio') o.checked = n.checked;
      else o.value = n.value;
    }
    o.disabled = n.disabled;
    return true;
  }
  return false;
}

function morph(o, n) {
  if (syncField(o, n)) return;
  for (const a of [...o.attributes]) if (!n.hasAttribute(a.name)) o.removeAttribute(a.name);
  for (const a of n.attributes) if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
  morphChildren(o, [...n.childNodes]);
}

function morphChildren(parent, next) {
  const olds = [...parent.childNodes];
  const n = Math.max(olds.length, next.length);
  for (let i = 0; i < n; i++) {
    const o = olds[i], fresh = next[i];
    if (fresh === undefined) { o.remove(); continue; }
    if (o === undefined) { parent.append(fresh); continue; }
    if (o.nodeType === 3 && fresh.nodeType === 3) { if (o.nodeValue !== fresh.nodeValue) o.nodeValue = fresh.nodeValue; continue; }
    if (canMorph(o, fresh)) morph(o, fresh);
    else parent.replaceChild(fresh, o);
  }
}

/** fill() for a container that redraws while the player is using it. See the note above. */
export function patch(node, ...kids) {
  morphChildren(node, kids.flat().filter(k => k != null && k !== false).map(k => (k.nodeType ? k : document.createTextNode(String(k)))));
  return node;
}

/** 1234 -> "1.2k", 1234567 -> "1.2M". Whole numbers under a thousand stay whole. */
export function num(n) {
  n = Number(n) || 0;
  const s = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e3) return s + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
  if (a >= 10) return s + Math.round(a);
  if (a >= 1) return s + (Math.round(a * 10) / 10);
  return s + (a === 0 ? '0' : a.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
}

/** Power in kW / MW. */
export const kw = n => (Math.abs(n) >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + ' MW' : Math.round(n) + ' kW');

/** Game seconds as "2h 14m" or "0:45". */
export function clock(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Game seconds as a short countdown: "45s", "3m 20s". */
export function countdown(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec >= 60) return `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, '0')}s`;
  return sec + 's';
}

/** A day/time of day reading for a planet with the given day length. */
export function planetClock(time, dayLength = 1200) {
  const day = Math.floor(time / dayLength) + 1;
  const frac = (time % dayLength) / dayLength;
  const hh = Math.floor(frac * 24), mm = Math.floor((frac * 24 % 1) * 60);
  return { day, hhmm: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, frac };
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/** "drill_mk1" -> "Drill mk1" when nothing else names it. */
export const titleCase = s => String(s).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

/** A small progress bar element; call .set(0..1) to move it. */
export function bar(cls = '') {
  const fillEl = el('i.bar-fill');
  const node = el('div.bar' + (cls ? '.' + cls : ''), null, fillEl);
  node.set = (t, colour = null) => { fillEl.style.width = (clamp(t, 0, 1) * 100).toFixed(1) + '%'; if (colour) fillEl.style.background = colour; };
  return node;
}
