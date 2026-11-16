// Tuning panel: a slider for every tuning number of a game, changed live while playing (added 2026-11-15; idea from
// Claude Code Game Studios' tweak panel, MIT, github.com/Donchitos/Claude-Code-Game-Studios). For games started from
// 2026-11-15 on (owner: "use the new features going forward"); older games don't need it.
//
// A game keeps its tuning numbers in data/tuning.json, one entry per number:
//   { "runSpeed": { "value": 6, "min": 2, "max": 12, "step": 0.5, "label": "Run speed", "group": "Movement", "unit": "m/s" } }
// and reads them through one live object, every time it uses them (never copied into a constant at load):
//   import { loadTuning, tunePanel } from '../../shared/tune.js';
//   const T = await loadTuning(new URL('../data/tuning.json', import.meta.url));
//   player.speed = T.runSpeed;
//   tunePanel({ game: 'grimring', tuning: T });   // hidden: opens with the ` key, or a "Tune" button when the URL has ?tune
//
// Save copies a block like
//   Tuned in the panel: grimring
//   runSpeed 6 → 7.5
// for Radley to paste to Claude, who runs `node tools/apply-tune.mjs grimring --why "…"` with it: the numbers go into
// data/tuning.json and a line into the game's docs/feel-log.md. Tuned values also survive a reload in this browser until
// Reset (shown with a "tuned" mark) so a tune can be played over several sittings.
import { fmt } from './format.js';

const META = Symbol('tune-meta');
const storeKey = game => `tune:${game}`;
const safe = f => { try { return f(); } catch { return null; } };

/** Read data/tuning.json → a plain object of current values ({ runSpeed: 6 }), with the full entries kept for the panel. */
export async function loadTuning(url, { game = null } = {}) {
  const spec = await (await fetch(url)).json();
  return makeTuning(spec, { game });
}

/** Same as loadTuning, from an object already in hand (tests, or a game that bundles its data). */
export function makeTuning(spec, { game = null } = {}) {
  const T = {};
  const entries = {};
  for (const [key, e] of Object.entries(spec)) {
    if (key.startsWith('_') || typeof e !== 'object' || e === null || typeof e.value !== 'number') continue;
    const min = e.min ?? 0, max = e.max ?? Math.max(1, e.value * 2), step = e.step ?? stepFor(min, max);
    entries[key] = { key, value: e.value, min, max, step, label: e.label || key, group: e.group || 'Tuning', unit: e.unit || '', note: e.note || '' };
    T[key] = e.value;
  }
  Object.defineProperty(T, META, { value: { entries, game }, enumerable: false });
  if (game) for (const [k, v] of Object.entries(readSaved(game))) if (k in entries) T[k] = clamp(v, entries[k]);
  return T;
}

export function stepFor(min, max) { const span = Math.abs(max - min) || 1; const p = 10 ** Math.floor(Math.log10(span / 100)); return p >= 1 ? Math.round(p) : +p.toPrecision(1); }
export const clamp = (v, e) => Math.min(e.max, Math.max(e.min, v));
/** Snap to the entry's step and drop float noise (0.30000000000000004 → 0.3). */
export function snap(v, e) {
  const n = Math.round((v - e.min) / e.step) * e.step + e.min;
  const dec = (String(e.step).split('.')[1] || '').length + (String(e.min).split('.')[1] || '').length;
  return +clamp(n, e).toFixed(Math.min(6, dec));
}

/** The block Save copies: only the values that differ from the file. */
export function saveBlock(game, T) {
  const { entries } = T[META];
  const rows = Object.values(entries).filter(e => T[e.key] !== e.value).map(e => `${e.key} ${e.value} → ${T[e.key]}`);
  return rows.length ? [`Tuned in the panel: ${game}`, ...rows].join('\n') : '';
}

function readSaved(game) { return safe(() => JSON.parse(localStorage.getItem(storeKey(game)) || '{}')) || {}; }
function writeSaved(game, T) {
  const { entries } = T[META]; const o = {};
  for (const e of Object.values(entries)) if (T[e.key] !== e.value) o[e.key] = T[e.key];
  safe(() => Object.keys(o).length ? localStorage.setItem(storeKey(game), JSON.stringify(o)) : localStorage.removeItem(storeKey(game)));
}

/**
 * The panel. Hidden until the ` key (Backquote) or, with ?tune in the address, a small "Tune" button.
 * onChange(key, value) is called after every move, for values a game must push somewhere (a shader uniform).
 */
export function tunePanel({ game, tuning: T, onChange = null, key = 'Backquote', button = null } = {}) {
  if (!T?.[META]) throw new Error('tunePanel: pass the object from loadTuning()');
  T[META].game = game;
  for (const [k, v] of Object.entries(readSaved(game))) if (k in T[META].entries) T[k] = clamp(v, T[META].entries[k]);
  ensureCss();
  const { entries } = T[META];
  const root = document.createElement('div');
  root.className = 'tune-root'; root.hidden = true;
  root.innerHTML = `<div class="tune-panel" role="dialog" aria-label="Tuning">
    <header class="tune-head"><h2>Tuning</h2><span class="tune-count"></span><button class="tune-x" aria-label="Close">×</button></header>
    <div class="tune-list"></div>
    <footer class="tune-foot"><button class="tune-reset-all">Reset all</button><button class="tune-save">Save</button></footer>
    <div class="tune-out" hidden><p>Copied. Paste this to Claude to keep these numbers:</p><textarea readonly rows="5"></textarea></div>
  </div>`;
  const list = root.querySelector('.tune-list');
  const groups = {};
  for (const e of Object.values(entries)) (groups[e.group] ||= []).push(e);
  const rows = {};
  for (const [g, items] of Object.entries(groups)) {
    const sec = document.createElement('section'); sec.className = 'tune-group';
    sec.innerHTML = `<h3>${esc(g)}</h3>`;
    for (const e of items) {
      const row = document.createElement('div'); row.className = 'tune-row';
      row.innerHTML = `<label><span class="tune-label">${esc(e.label)}</span><span class="tune-val"></span>
        <input type="range" min="${e.min}" max="${e.max}" step="${e.step}"></label>
        <button class="tune-reset" aria-label="Reset ${esc(e.label)}">↺</button>${e.note ? `<p class="tune-note">${esc(e.note)}</p>` : ''}`;
      const input = row.querySelector('input');
      input.addEventListener('input', () => { T[e.key] = snap(+input.value, e); paint(e.key); writeSaved(game, T); onChange?.(e.key, T[e.key]); });
      row.querySelector('.tune-reset').addEventListener('click', () => { T[e.key] = e.value; paint(e.key); writeSaved(game, T); onChange?.(e.key, T[e.key]); });
      rows[e.key] = row; sec.append(row);
    }
    list.append(sec);
  }
  const paint = k => {
    const e = entries[k], row = rows[k], v = T[k];
    row.querySelector('input').value = v;
    row.querySelector('.tune-val').textContent = fmt(v) + (e.unit ? ' ' + e.unit : '');
    row.classList.toggle('tuned', v !== e.value);
    const n = Object.values(entries).filter(x => T[x.key] !== x.value).length;
    root.querySelector('.tune-count').textContent = n ? `${n} tuned` : '';
  };
  Object.keys(rows).forEach(paint);
  let btn = null;
  const open = (on = root.hidden) => { root.hidden = !on; root.querySelector('.tune-out').hidden = true; if (btn) btn.hidden = on; };
  root.querySelector('.tune-x').addEventListener('click', () => open(false));
  root.addEventListener('click', ev => { if (ev.target === root) open(false); });
  root.querySelector('.tune-reset-all').addEventListener('click', () => { for (const e of Object.values(entries)) { T[e.key] = e.value; paint(e.key); onChange?.(e.key, e.value); } writeSaved(game, T); });
  root.querySelector('.tune-save').addEventListener('click', async () => {
    const text = saveBlock(game, T) || `Tuned in the panel: ${game}\n(nothing changed)`;
    const out = root.querySelector('.tune-out'); out.hidden = false;
    const ta = out.querySelector('textarea'); ta.value = text; ta.select();
    const ok = await navigator.clipboard?.writeText(text).then(() => true, () => false);
    out.querySelector('p').textContent = ok ? 'Copied. Paste this to Claude to keep these numbers:' : 'Copy this and paste it to Claude to keep these numbers:';
  });
  // keys never reach the game while the panel is open and a slider has focus
  root.addEventListener('keydown', ev => { if (ev.code === 'Escape') { open(false); ev.stopPropagation(); } else if (ev.target.matches('input,textarea')) ev.stopPropagation(); });
  window.addEventListener('keydown', ev => { if (ev.code === key && !ev.target.matches?.('input[type=text],textarea')) { ev.preventDefault(); open(); } });
  document.body.append(root);
  if (button ?? /[?&]tune\b/.test(location.search)) {
    btn = document.createElement('button'); btn.className = 'tune-open'; btn.textContent = 'Tune';
    btn.addEventListener('click', () => open()); document.body.append(btn);
  }
  return { open: () => open(true), close: () => open(false), element: root, button: btn };
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function ensureCss() {
  if (document.querySelector('link[data-tune-css]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.tuneCss = '';
  l.href = new URL('./tune.css', import.meta.url).href; document.head.append(l);
}
