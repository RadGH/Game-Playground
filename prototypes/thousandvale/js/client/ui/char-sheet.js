// T18 (play-test 5): the Character menu (key V, the figure button on the menu bar, or "Stats" in the bag window).
//   · the core stats, each with a tooltip that says how the number is worked out
//   · an "Advanced" switch for the uncommon stats (remembered)
//   · the estimated damage a second of every ability that can be estimated — and a plain reason for the ones that cannot
//   · your Angling skill (T25)
// It stays open beside the bag: while both are open the bag window narrows and this one docks to its left (stacked on a
// phone), so you equip something and watch the numbers move. Every number that changed since your last change of gear
// carries a green ▲ or a red ▼ with the difference, until you change something else or press "Clear".
//
// Numbers: the server's `sheet {core, advanced, abilities, angling}` (C's pure estimator run on the real character).
// Until one arrives the window shows the basic sheet pt5-core.js adds up from `joined.you` and what you wear, and says so.

import { createPanel, h } from '../ui-panel.js';
import { rowText, sheetDiff, basicSheet, anglingText } from './pt5-core.js';
import { fmt } from '../../../../../shared/format.js';

const UI_KEY = 'tv.sheet.ui';
const pretty = id => String(id || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function createCharSheet({ net, hud, bag, self, bar }) {
  const S = { sheet: null, server: false, diff: {}, diffAt: 0, advanced: false, angling: null, lastSig: '' };
  try { S.advanced = !!JSON.parse(localStorage.getItem(UI_KEY) || '{}').advanced; } catch { /* private window */ }
  const panel = createPanel({ id: 'sheet', title: 'Character', width: 310, cls: 'sheet-panel', onOpen: () => { ask(); refresh(); dock(); draw(); }, onClose: () => dock() });

  /** Both open: the bag narrows and this window sits to its left (css/pt5.css body.sheet-with-bag). */
  function dock() { document.body.classList.toggle('sheet-with-bag', panel.isOpen && !!bag?.isOpen); }
  bag?.onToggle?.(() => dock());

  function ask() { const n = net(); if (!n?.joined) return; if (typeof n.sheet === 'function') n.sheet(); else n._raw?.('game', JSON.stringify({ t: 'sheet' })); }
  function setSheet(next, fromServer) {
    if (!next) return;
    if (!fromServer && S.server) return;                         // never let the basic view overwrite the server's
    const sig = JSON.stringify([next.core, next.advanced, next.abilities]);
    if (sig === S.lastSig) return;
    const d = S.sheet && (S.server === fromServer) ? sheetDiff(S.sheet, next) : {};
    S.lastSig = sig; S.sheet = next; S.server = fromServer;
    if (Object.keys(d).length) { S.diff = d; S.diffAt = Date.now(); }
    if (next.angling) S.angling = next.angling;
    draw();
  }
  /** The basic sheet from what the client already knows. */
  function refresh() {
    if (S.server) return;
    const n = net(), you = { ...(n?.joined?.you || {}), ...(self?.() || {}) };
    const sh = basicSheet(you, bag?.state?.equipment || you.equipment || {});
    sh.abilities = (bar?.() || []).filter(b => b && !b.empty && b.id).map(b => ({ id: b.id, slot: b.slot, name: b.name, dps: null, locked: !!b.locked, level: b.level, why: b.locked ? `Unlocks at level ${b.level}.` : 'Waiting for the server to work this one out.' }));
    setSheet(sh, false);
  }

  function row(r) {
    const d = S.diff[String(r.id)];
    return h('li.sh-row', { dataset: { id: String(r.id), ...(r.tip ? { tip: r.tip } : {}) }, tabIndex: r.tip ? 0 : -1 },
      h('span.sh-label', {}, r.label || pretty(r.id)),
      h('b.sh-value', {}, rowText(r)),
      d ? h('span.sh-diff.' + d.dir, { 'aria-label': d.dir === 'up' ? 'better' : 'worse' }, `${d.dir === 'up' ? '▲' : '▼'} ${d.text}`) : h('span.sh-diff'));
  }
  function ability(a) {
    const id = 'ab:' + (a.id ?? a.slot), d = S.diff[id];
    const tip = a.tip || a.why || '';
    const val = a.pending ? 'measuring…' : Number.isFinite(a.dps) ? `${fmt(a.dps, { decimals: a.dps < 10 ? 2 : 1 })} / s` : a.heal != null && Number.isFinite(a.heal) ? `${fmt(a.heal, { decimals: 1 })} healed / s` : '—';
    return h('li.sh-row.sh-ab' + (Number.isFinite(a.dps) ? '' : '.none') + (a.locked ? '.locked' : '') + (a.pending ? '.pending' : ''), { dataset: { id, ...(tip ? { tip } : {}) }, tabIndex: tip ? 0 : -1 },
      h('span.sh-key', {}, a.slot === 0 ? 'F' : a.slot != null ? String(a.slot) : ''),
      h('span.sh-label', {}, a.name || pretty(a.id), a.pending ? h('small', {}, 'Being tried on a training dummy — a moment.') : !Number.isFinite(a.dps) && a.why ? h('small', {}, a.why) : Array.isArray(a.hit) ? h('small', {}, `${fmt(a.hit[0], { decimals: 0 })}–${fmt(a.hit[1], { decimals: 0 })} a hit${a.every ? `, every ${fmt(a.every)} s` : ''}`) : null),
      h('b.sh-value', {}, val),
      d ? h('span.sh-diff.' + d.dir, {}, `${d.dir === 'up' ? '▲' : '▼'} ${d.text}`) : h('span.sh-diff'));
  }
  function draw() {
    if (!panel.isOpen) return;
    const sh = S.sheet || { core: [], advanced: [], abilities: [] }, me = self?.() || {};
    panel.setTitle('Character', `${me.name || ''}${me.level ? ` · level ${me.level}` : ''}${me.cls ? ' ' + pretty(me.cls) : ''}`);
    const changed = Object.keys(S.diff).length;
    const ang = S.angling || net()?.joined?.you?.angling || null;
    const a = ang ? anglingText(ang) : null;
    panel.fill(
      h('div.sh-top', {},
        h('button.ghost.small', { type: 'button', dataset: { act: 'bag' }, title: 'Open your bag beside this window: equip something and watch the numbers change', onclick: () => { bag?.toggle(!bag.isOpen); dock(); draw(); } }, bag?.isOpen ? 'Hide bag' : 'Open bag beside this'),
        h('span.grow'),
        changed ? h('button.ghost.small', { type: 'button', dataset: { act: 'clear' }, title: 'Forget the ▲ ▼ marks', onclick: () => { S.diff = {}; draw(); } }, 'Clear changes') : null),
      changed ? h('p.sh-note.changed', {}, `${changed} ${changed === 1 ? 'number' : 'numbers'} changed with your last change — ▲ better, ▼ worse.`) : h('p.sh-note', {}, 'Hover a number to see how it is worked out.'),
      h('h4', {}, 'Stats'),
      h('ul.sh-list', { dataset: { part: 'core' } }, ...(sh.core || []).map(row)),
      h('label.sh-adv', { title: 'Show the stats most characters never need to look at' }, h('input', { type: 'checkbox', checked: S.advanced, dataset: { act: 'advanced' }, onchange: e => { S.advanced = e.target.checked; try { localStorage.setItem(UI_KEY, JSON.stringify({ advanced: S.advanced })); } catch { /* private window */ } draw(); } }), 'Advanced'),
      S.advanced ? ((sh.advanced || []).length ? h('ul.sh-list.adv', { dataset: { part: 'advanced' } }, ...sh.advanced.map(row)) : h('p.sh-note', {}, sh.basic ? 'Nothing you wear changes an uncommon stat.' : 'Nothing uncommon to show.')) : null,
      h('h4', { title: 'What each ability deals in a second of use against an even-level enemy, counting its cooldown. An estimate, not a promise.' }, 'Damage a second (estimated)'),
      (sh.abilities || []).length ? h('ul.sh-list.abilities', { dataset: { part: 'abilities' } }, ...sh.abilities.map(ability)) : h('p.sh-note', {}, 'No abilities yet.'),
      a ? h('div.sh-angling', { dataset: { tip: 'Rises with every catch. A higher skill hooks better fish, opens the better pools and makes the tug easier.' } }, h('h4', {}, 'Angling'), h('div.sh-angbar', {}, h('i', { style: `width:${(a.frac * 100).toFixed(1)}%` }), h('span', {}, a.text)), h('small', {}, a.sub)) : null,
      sh.basic ? h('p.sh-note.basic', {}, 'Basic view: added up here from your level and what you wear. The full numbers (perks, talents, buffs, every ability) come from the server.') : null);
  }

  function wire(n) {
    n.on('sheet', m => setSheet({ core: m.core || [], advanced: m.advanced || [], abilities: m.abilities || [], angling: m.angling || null }, true));
    n.on('joined', j => { S.server = false; S.sheet = null; S.lastSig = ''; S.diff = {}; const sh = j?.you?.sheet; if (sh && Array.isArray(sh.core)) setSheet(sh, true); else setTimeout(refresh, 0); });
    n.on('equip', () => { setTimeout(() => { refresh(); if (panel.isOpen && S.server) ask(); }, 0); });
    n.on('you', p => { if (p.sheet) setSheet(p.sheet, true); else if (p.angling) { S.angling = { ...(S.angling || {}), ...p.angling }; draw(); } else if (p.level != null || p.hpMax != null || p.mpMax != null || p.bar) setTimeout(refresh, 0); });
  }
  return { panel, wire, draw, refresh, setSheet, dock, get state() { return { open: panel.isOpen, server: S.server, advanced: S.advanced, diff: S.diff, rows: [...panel.body.querySelectorAll('.sh-row')].map(e => e.textContent), docked: document.body.classList.contains('sheet-with-bag') }; } };
}
