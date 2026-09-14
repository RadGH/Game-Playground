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
