// Tiny DOM helpers for HUD code that runs every frame: build once, then only touch what changed.

export function h(tag, cls = '', text = null, attrs = null) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style') el.style.cssText = v;
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  return el;
}

export function setText(el, v) {
  const s = String(v);
  if (el._t !== s) { el._t = s; el.textContent = s; }
}

export function setStyle(el, prop, v) {
  const key = '_s_' + prop;
  if (el[key] !== v) { el[key] = v; el.style.setProperty(prop, v); }
}

export function toggle(el, cls, on) {
  const key = '_c_' + cls;
  if (el[key] !== on) { el[key] = on; el.classList.toggle(cls, on); }
}

export function setTip(el, text) {
  if (el._tip !== text) { el._tip = text; if (text) el.dataset.tip = text; else delete el.dataset.tip; }
}

/** m:ss from seconds. */
export function clockText(sec) {
  sec = Math.max(0, Math.floor(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** Seconds with one decimal under 10, whole above. */
export function shortSecs(sec) {
  if (sec <= 0) return '0';
  return sec < 10 ? sec.toFixed(1) : String(Math.ceil(sec));
}

export function setTipHtml(el, html) {
  if (el._tiph !== html) { el._tiph = html; if (html) el.dataset.tipHtml = html; else delete el.dataset.tipHtml; }
}
