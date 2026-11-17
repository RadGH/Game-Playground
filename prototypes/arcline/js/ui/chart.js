// Small SVG charts for the Statistics sheet (no library). One look for every chart: a title with the value at the
// picked day, labelled axes (numbers on the left, "Day N" along the bottom), soft grid lines, 2 px lines or bars in the
// game's colours, and a legend that always shows each series' latest number (reachable without hover — lessons 10).
// Tap, drag or hover across a chart to read any day; leaving it goes back to the latest day.
// Readable on a 360 px phone: the chart takes its box's width (ResizeObserver), text is 12 px or larger.
import { el } from './dom.js';
import { fmt } from '../../../../shared/format.js';

const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v); return e; };

/** A short axis number: 950, 1.2k, 34k, 1.5M (through shared/format.js). */
export function short(n) {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e6) return `${s}${fmt(a / 1e6, { decimals: a >= 1e7 ? 0 : 1 })}M`;
  if (a >= 1e4) return `${s}${fmt(a / 1e3, { decimals: 0 })}k`;
  if (a >= 1e3) return `${s}${fmt(a / 1e3, { decimals: 1 })}k`;
  return `${s}${fmt(a, { decimals: a < 10 && a % 1 ? 1 : 0 })}`;
}
/** Round tick values covering lo..hi (about `count` of them). */
export function ticks(lo, hi, count = 4) {
  if (!(hi > lo)) { hi = lo + 1; }
  const raw = (hi - lo) / Math.max(1, count - 1), mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  const out = []; for (let v = Math.floor(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(Math.round(v / step) * step);
  if (out[out.length - 1] < hi) out.push(out[out.length - 1] + step);
  return out;
}

/**
 * lineChart({ title, days, series: [{ label, color, values, dash?, fill? }], format?, yMin?, yMax?, bars?, zero?, empty? })
 *   format(v) → the text for a value (axis uses short()); bars: draw the first series as bars (counts per day);
 *   zero: draw a stronger line at 0 (demand). → a <div class="ac-chart"> that draws itself at its width.
 */
export function lineChart(o) {
  const fmtV = o.format || (v => fmt(Math.round(v)));
  const days = o.days || [], n = days.length;
  const head = el('div', { class: 'ac-chart-hd' }, el('h4', {}, o.title), el('span', { class: 'ac-chart-day' }, ''));
  const box = el('div', { class: 'ac-chart-plot' });
  const legend = el('div', { class: 'ac-chart-legend' });
  const root = el('div', { class: 'ac-chart' + (o.bars ? ' bars' : '') }, head, box, legend);
  if (n < 2) {
    box.append(el('p', { class: 'ac-chart-empty' }, n ? `1 day recorded so far: ${o.series.map(s => `${s.label} ${fmtV(s.values[0])}`).join(', ')}. The chart draws from the second day.` : (o.empty || 'Nothing recorded yet: the chart fills in as the days pass.')));
    return root;
  }
  const chips = o.series.map(s => { const b = el('b', {}, ''); legend.append(el('span', { class: 'ac-chip-key' }, el('i', { style: `background:${s.color}` + (s.dash ? ';opacity:.7' : '') }), el('span', {}, s.label), b)); return b; });
  let all = o.series.flatMap(s => s.values).filter(Number.isFinite);
  let lo = o.yMin ?? Math.min(0, ...all), hi = o.yMax ?? Math.max(...all);
  if (o.yMin == null && lo < 0) lo = Math.min(...all);
  if (hi <= lo) hi = lo + 1;
  const tk = ticks(lo, hi, 4); lo = Math.min(lo, tk[0]); hi = Math.max(hi, tk[tk.length - 1]);
  let W = 0, pick = -1, svg = null, cursor = null, dots = [];
  const H = o.height || 150, L = 46, R = 10, Tp = 8, B = 22;
  const X = i => L + (n === 1 ? 0 : (i / (n - 1)) * (W - L - R)), Y = v => Tp + (1 - (v - lo) / (hi - lo)) * (H - Tp - B);
  function readout(i) {
    head.lastChild.textContent = `Day ${fmt(days[i])}`;
    o.series.forEach((s, k) => { chips[k].textContent = Number.isFinite(s.values[i]) ? fmtV(s.values[i]) : '—'; });
    if (!cursor) return;
    cursor.setAttribute('x1', X(i)); cursor.setAttribute('x2', X(i)); cursor.style.opacity = i === n - 1 && pick < 0 ? 0 : 1;
    dots.forEach((d, k) => { const v = o.series[k].values[i]; d.setAttribute('cx', X(i)); d.setAttribute('cy', Y(Number.isFinite(v) ? v : lo)); });
  }
  function draw() {
    W = Math.max(200, Math.round(box.clientWidth || 300));
    svg = sv('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${o.title}: ${o.series.map(s => `${s.label} ${fmtV(s.values[n - 1])}`).join(', ')} on day ${fmt(days[n - 1])}` });
    // grid + y labels
    for (const v of tk) {
      const y = Y(v);
      svg.append(sv('line', { x1: L, x2: W - R, y1: y, y2: y, class: v === 0 && o.zero ? 'zero' : 'grid' }));
      const t = sv('text', { x: L - 6, y: y + 4, 'text-anchor': 'end', class: 'ax' }); t.textContent = o.axis ? o.axis(v) : short(v); svg.append(t);
    }
    // x labels: first, middle, last day
    const xs = [...new Set([0, Math.round((n - 1) / 2), n - 1])];
    xs.forEach((i, k) => { const t = sv('text', { x: X(i), y: H - 6, 'text-anchor': k === 0 ? 'start' : k === xs.length - 1 ? 'end' : 'middle', class: 'ax' }); t.textContent = `Day ${fmt(days[i])}`; svg.append(t); });
    // series
    o.series.forEach((s, k) => {
      if (o.bars && k === 0) {
        const bw = Math.max(1, (W - L - R) / n * 0.7);
        for (let i = 0; i < n; i++) { const v = s.values[i]; if (!(v > 0)) continue; svg.append(sv('rect', { x: X(i) - bw / 2, y: Y(v), width: bw, height: Math.max(1, Y(lo) - Y(v)), fill: s.color, rx: Math.min(2, bw / 3) })); }
        return;
      }
      let d = ''; for (let i = 0; i < n; i++) { const v = s.values[i]; if (!Number.isFinite(v)) continue; d += `${d ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; }
      if (s.fill) svg.append(sv('path', { d: `${d}L${X(n - 1).toFixed(1)},${Y(Math.max(lo, 0)).toFixed(1)}L${X(0).toFixed(1)},${Y(Math.max(lo, 0)).toFixed(1)}Z`, fill: s.color, opacity: 0.12 }));
      svg.append(sv('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': s.dash ? '6 4' : null }));
    });
    cursor = sv('line', { y1: Tp, y2: H - B, class: 'cursor' }); svg.append(cursor);
    dots = o.series.map(s => { const c = sv('circle', { r: 3.5, fill: s.color, class: 'dot' }); svg.append(c); return c; });
    box.replaceChildren(svg);
    readout(pick >= 0 ? pick : n - 1);
  }
  const at = e => { const r = box.getBoundingClientRect(); const x = e.clientX - r.left; return Math.max(0, Math.min(n - 1, Math.round((x - L) / Math.max(1, W - L - R) * (n - 1)))); };
  box.addEventListener('pointermove', e => { pick = at(e); readout(pick); });
  box.addEventListener('pointerdown', e => { pick = at(e); readout(pick); });
  box.addEventListener('pointerleave', () => { pick = -1; readout(n - 1); });
  const ro = new ResizeObserver(() => { const w = Math.round(box.clientWidth); if (w && Math.abs(w - W) > 2) draw(); });
  ro.observe(box);
  requestAnimationFrame(() => { if (!W) draw(); });
  return root;
}
