// The performance panel (2026-10-20, the owner's "is it the game or my graphics card?" question).
//
// A small box in the corner: a graph of the last 240 frames (green = smooth, amber = a slow frame, red = a stutter),
// frames a second, the slowest frame, how many shaders were built while playing, and the LAST stutter with its cause in
// plain words (perf-log.js causeOf). "Copy performance report" puts a plain-text summary on the clipboard to paste to us;
// the bug report (ui/feedback.js) carries the same log on its own.
//
// Open it from Settings → Graphics → Performance panel, with F9, or by loading the page with ?perf=1. While it is on,
// the game also remembers where each material was made (perf.traceMaterials), so a shader build names the file that
// asked for it — that part starts with the next page load when the panel is switched on from Settings.
//
//   const panel = createPerfPanel({ perf, settings, fps: () => n, info: () => ({ build, quality, ua }) })
//   panel.toggle(); panel.open(); panel.close(); panel.isOpen; panel.text()     (window.thousandvale.perfPanel)

import { reportText, stutterLine } from '../perf-log.js';

const KEY = 'tv.perfPanel';
const q = () => { try { return new URLSearchParams(location.search).get('perf'); } catch { return null; } };
/** Is the panel wanted at boot (?perf=1 / ?perf=trace, or switched on in Settings)? */
export function perfPanelWanted() {
  const v = q();
  if (v === '1' || v === 'trace' || v === 'on') return true;
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}
/** Settings → Graphics remembers the choice (and opens / closes the panel at once when it exists). */
export function setPerfPanel(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private window */ }
  const p = globalThis.thousandvale?.perfPanel;
  if (p) on ? p.open() : p.close();
}

const GRAPH_W = 240, GRAPH_H = 56, MAX_MS = 120;

export function createPerfPanel({ perf, settings = null, fps = () => null, info = () => ({}) } = {}) {
  const root = document.createElement('div');
  root.className = 'perf-panel'; root.id = 'perf-panel'; root.hidden = true;
  root.setAttribute('role', 'region'); root.setAttribute('aria-label', 'Performance');
  root.innerHTML = `<div class="pp-head"><b>Performance</b><span class="pp-fps"></span><button type="button" class="pp-x" aria-label="Close" data-tip="Close (F9)">×</button></div>
    <canvas class="pp-graph" width="${GRAPH_W}" height="${GRAPH_H}" aria-label="Frame times, newest on the right"></canvas>
    <div class="pp-row pp-stats"></div>
    <div class="pp-row pp-last"></div>
    <div class="pp-acts"><button type="button" class="pp-copy">Copy performance report</button><span class="pp-note" aria-live="polite"></span></div>
    <textarea class="pp-text" readonly hidden rows="6" aria-label="Performance report"></textarea>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const cv = $('.pp-graph'), ctx = cv.getContext('2d');
  let timer = 0, isOpen = false;

  function snap() { const i = info() || {}; return perf.snapshot({ fps: fps(), when: new Date().toString().slice(0, 33), build: i.build, quality: i.quality, ua: String(i.ua || '').slice(0, 160) }); }
  function text() { return reportText(snap()); }

  function drawGraph() {
    const { ms } = perf.history();
    const lim = perf.longMs || 100;
    ctx.clearRect(0, 0, GRAPH_W, GRAPH_H);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, GRAPH_W, GRAPH_H);
    const y = v => GRAPH_H - Math.min(1, v / MAX_MS) * GRAPH_H;
    for (const [v, c] of [[16.7, 'rgba(120,200,120,0.35)'], [33.3, 'rgba(230,190,90,0.35)'], [lim, 'rgba(230,90,80,0.45)']]) { ctx.fillStyle = c; ctx.fillRect(0, Math.round(y(v)), GRAPH_W, 1); }
    const x0 = GRAPH_W - ms.length;
    for (let k = 0; k < ms.length; k++) {
      const v = ms[k];
      ctx.fillStyle = v > lim ? '#e25b4a' : v > 33.4 ? '#e3b25a' : '#79c37b';
      const top = y(v); ctx.fillRect(x0 + k, top, 1, GRAPH_H - top);
    }
  }
  function drawText() {
    const s = snap(), c = s.counts, { ms } = perf.history();
    const recentWorst = ms.length ? Math.round(Math.max(...ms)) : 0;
    $('.pp-fps').textContent = s.fps != null ? `${s.fps} fps` : '';
    $('.pp-stats').textContent = `Slowest of the last ${ms.length} frames: ${recentWorst} ms · stutters: ${c.stutters} · shaders built while playing: ${c.compilesAfterLoad}`;
    const last = s.stutters[s.stutters.length - 1];
    $('.pp-last').textContent = last ? `Last stutter: ${stutterLine(last, s.now)}` : 'No stutters so far.';
  }
  function tick() { if (!isOpen) return; try { drawGraph(); drawText(); } catch { /* never break the game */ } }

  async function copy() {
    const t = text(), note = $('.pp-note');
    let ok = false;
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(t); ok = true; } } catch { ok = false; }
    if (!ok) {      // http pages have no clipboard API: select the text and copy it the old way, and leave it on show
      const ta = $('.pp-text'); ta.hidden = false; ta.value = t; ta.focus(); ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
    }
    note.textContent = ok ? 'Copied — paste it in a message to us.' : 'Select the text below and copy it.';
    setTimeout(() => { note.textContent = ''; }, 5000);
  }

  function open() { if (isOpen) return; isOpen = true; root.hidden = false; tick(); clearInterval(timer); timer = setInterval(tick, 250); }
  function close() { isOpen = false; root.hidden = true; clearInterval(timer); $('.pp-text').hidden = true; }
  function toggle(on = !isOpen) { on ? open() : close(); }

  $('.pp-x').addEventListener('click', () => { close(); setPerfPanel(false); });
  $('.pp-copy').addEventListener('click', copy);
  // F9 (a fixed key, not in the binding table: it is a tool for reporting problems, not a game action)
  addEventListener('keydown', e => {
    if (e.code !== 'F9' || e.repeat) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault(); const on = !isOpen; setPerfPanel(on); toggle(on);
  });
  if (perfPanelWanted()) open();
  void settings;
  return { open, close, toggle, text, snap, get isOpen() { return isOpen; }, root };
}
