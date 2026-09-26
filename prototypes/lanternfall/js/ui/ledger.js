// The Ledger — Satchel tab (docs/02 §17): the meters/ component (renderMeter) inside our frame, plus our own views
// in the same visual style: Per wick (each wick is a source), The Hollow (trap and world kills, B6), Combos (each of
// 03's combos is its own source), and the Oil / Terrain / Light tallies when the game supplies them
// (ctx.ledgerExtras = { oil: [{name, spent, damage, overcharge, gutters}], terrain: [{name, burned, frozen, …}], light: [{flame, seconds}] }).
// Scope: This room · This node · This act · Whole run — node/act group fights by their label "act2/a2_n05/room1".
import { renderMeter, METER_CSS } from '../../../../meters/js/meter-ui.js';
import { Meter } from '../../../../meters/js/meter.js';
import { el, btn, hp, fmt, secs, clock, cap } from './menukit.js';

const OURS = [['wicks', 'Per wick'], ['hollow', 'The Hollow'], ['combos', 'Combos'], ['oil', 'Oil'], ['terrain', 'Terrain'], ['light', 'Light']];
const SCOPES = [['room', 'This room'], ['node', 'This node'], ['act', 'This act'], ['run', 'Whole run']];
const DTYPE_COLOR = { fire: '#9a4a22', frost: '#2f6f86', lightning: '#8a8030', poison: '#4e7a2a', holy: '#8a7a4a', water: '#2d4c9a', shadow: '#5a3290', physical: '#3d4f6a' };
let LG = { view: 'meter', scope: 'room', state: {} };
let cssDone = false;

/** A Meter holding only the fights in scope (node/act from the fight label), or the real one. */
export function scopedMeter(meter, scope) {
  if (!meter) return { m: null, s: 'current' };
  if (scope === 'room') return { m: meter, s: 'current' };
  if (scope === 'run') return { m: meter, s: 'all' };
  const cur = meter.fight(); const parts = String(cur?.label || '').split('/');
  const prefix = scope === 'act' ? parts[0] : parts.slice(0, 2).join('/');
  const m = new Meter({ maxFights: 999 }); m.fights = meter.fights.filter(f => String(f.label).startsWith(prefix)); m.itemStats = meter.itemStats;
  return { m, s: 'all' };
}

export const ledger = {
  id: 'ledger', title: 'Ledger', satchel: true,
  render(root, ctx) {
    if (!cssDone) { document.head.append(el('style', { text: METER_CSS })); cssDone = true; }
    const meter = ctx.meter || ctx.game?.meter;
    const box = el('div', { class: 'lf-ledger col' });
    root.append(box);
    const draw = () => {
      const { m, s } = scopedMeter(meter, LG.scope);
      const sum = m ? m.summary(s) : null; const fights = m ? (s === 'all' ? m.fights : [m.fight()].filter(Boolean)) : [];
      const dur = fights.reduce((t, f) => t + (m.duration(f) || 0), 0);
      const head = el('div', { class: 'row' },
        el('label', { class: 'row small' }, 'Scope', el('select', { onchange: e => { LG.scope = e.target.value; LG.state = {}; draw(); } }, SCOPES.map(([v, t]) => el('option', { value: v, text: t, selected: v === LG.scope })))),
        el('span', { class: 'small dim grow', text: sum ? `Summary: ${hp(fights.length)} room${fights.length === 1 ? '' : 's'} · ${clock(dur)} · ${hp(sum.deaths)} deaths · ${hp(sum.kills)} kills` : '' }),
        btn('Meter', () => { LG.view = 'meter'; draw(); }, { cls: 'small' + (LG.view === 'meter' ? ' primary' : '') }),
        ...OURS.map(([id, t]) => btn(t, () => { LG.view = id; draw(); }, { cls: 'small' + (LG.view === id ? ' primary' : '') })));
      const body = el('div', { class: 'col' });
      box.replaceChildren(head, body);
      if (!m) { body.append(el('p', { class: 'dim', text: 'Nothing recorded yet. Every hit you land or take is written here, room by room.' })); return; }
      if (LG.view === 'meter') { LG.state.scope = s; const host = el('div'); body.append(host); renderMeter(m, host, LG.state); hideMeterScope(host); host.addEventListener('click', () => requestAnimationFrame(() => hideMeterScope(host))); }
      else body.append(ourView(LG.view, m.records(s), ctx, m));
      const items = Object.values(m.itemStats || {}).filter(x => x.kills || x.damage).sort((a, b) => b.kills - a.kills).slice(0, 5);
      if (items.length) body.append(el('p', { class: 'small dim', text: 'Per item: ' + items.map(x => `${x.name || x.itemId} — ${hp(x.kills)} kills, ${hp(x.damage)} damage`).join(' · ') }));
    };
    draw();
  },
};
export const screens = [ledger];
function hideMeterScope(host) { const sel = host.querySelector('.meter-head select'); if (sel) sel.style.display = 'none'; }

function bars(rows, { value = r => r.total, label = r => r.name, detail = r => '', color = () => '#3d4f6a', empty = 'Nothing here yet.' } = {}) {
  if (!rows.length) return el('p', { class: 'dim', text: empty });
  const top = Math.max(...rows.map(value), 1);
  return el('div', { class: 'lf-bars' }, rows.map(r => el('div', { class: 'bar', 'data-tip': detail(r) || null }, el('i', { style: { width: (value(r) / top * 100) + '%', background: color(r) } }), el('span', { text: label(r) }), el('b', { text: detail(r) }))));
}
function group(recs, keyFn, nameFn) {
  const by = {}; for (const r of recs) { const k = keyFn(r); if (k == null) continue; const g = by[k] ||= { id: k, name: nameFn(r), total: 0, hits: 0, kills: 0, crits: 0, dtype: r.dtype, t0: r.t, t1: r.t }; g.total += r.amount || 0; g.hits++; if (r.crit) g.crits++; if (r.killingBlow) g.kills++; g.t0 = Math.min(g.t0, r.t); g.t1 = Math.max(g.t1, r.t); }
  return Object.values(by).sort((a, b) => b.total - a.total);
}
function ourView(view, recs, ctx, m) {
  const dmg = recs.filter(r => r.kind === 'damage');
  const hollow = r => r.source === 'world' || r.source === 'hollow' || r.sourceName === 'The Hollow';
  const H = typeof ctx.hero === 'function' ? ctx.hero() : ctx.hero || ctx.game?.hero;
  const X = ctx.ledgerExtras || {};
  switch (view) {
    case 'wicks': {
      const mine = dmg.filter(r => r.source === 'player' && !/^(attack|combo:|knot:|gutter:|build:|env:)/.test(r.via || ''));
      const rows = group(mine, r => r.via, r => r.viaName || r.via);
      const oil = Object.fromEntries((X.oil || []).map(o => [o.name, o.spent]));
      const wick = id => H?.wicks?.find(w => w.id === id);
      return el('div', { class: 'col' }, el('p', { class: 'small dim', text: 'Every wick is its own source. Knot children and gutters are listed under the meter as their own sources.' }),
        bars(rows, { color: r => DTYPE_COLOR[r.dtype] || '#3d4f6a', label: r => r.name + (wick(r.id)?.locked ? ' 🔒' : ''), detail: r => `${hp(r.total)} · ${hp(r.hits)} hits${r.crits ? ` · ${hp(r.crits)} crits` : ''}${r.kills ? ` · ${hp(r.kills)} kills` : ''}${oil[r.name] ? ` · ${fmt(r.total / oil[r.name])} per oil` : ''}`, empty: 'No wick has hit anything in this scope yet.' }));
    }
    case 'hollow': {
      const rows = group(dmg.filter(hollow), r => r.via, r => r.viaName || cap(String(r.via).replace(/^env:|^trap_/, '')));
      const kills = recs.filter(r => hollow(r) && r.killingBlow).length;
      return el('div', { class: 'col' }, el('p', {}, el('b', { class: 'gold', text: 'The Hollow' }), ` — ${hp(kills)} kills, ${hp(rows.reduce((s, r) => s + r.total, 0))} damage. Traps, falls, floods, collapses and fires you did not light. Kills here pay half again in XP.`),
        bars(rows, { detail: r => `${hp(r.total)}${r.kills ? ` · ${hp(r.kills)} kills` : ''}`, empty: 'The world has not killed anything for you yet. Drop something on them.' }),
        H?.counters?.rekindled != null ? el('p', { class: 'small dim', text: `Rooms rekindled: ${hp(H.counters.rekindled)}` }) : null);
    }
    case 'combos': {
      const rows = group(dmg.filter(r => /^combo:/.test(r.via || '')), r => r.via, r => r.viaName || cap(r.via.slice(6).replace(/_/g, ' ')));
      return el('div', { class: 'col' }, el('p', { class: 'small dim', text: 'When two flames meet on the same thing, something new happens. Each combo counts as its own source.' }),
        bars(rows, { color: () => '#6a5230', detail: r => `${hp(r.total)} · ${hp(r.hits)} times${r.kills ? ` · ${hp(r.kills)} kills` : ''}`, empty: 'No combos yet. Try Rime on something wet, or Spark on something soaked.' }));
    }
    case 'oil': return X.oil ? bars(X.oil.map(o => ({ ...o, total: o.spent })), { detail: o => `${hp(o.spent)} oil${o.damage ? ` · ${fmt(o.damage / Math.max(1, o.spent))} damage per oil` : ''}${o.overcharge ? ` · ${hp(o.overcharge)} overcharged` : ''}${o.gutters ? ` · ${hp(o.gutters)} gutters` : ''}` })
      : el('p', { class: 'dim', text: 'The oil tally starts recording once the game feeds it (oil spent per wick, overcharge oil, gutter bursts).' });
    case 'terrain': return X.terrain ? bars(X.terrain.map(t => ({ ...t, total: (t.burned || 0) + (t.frozen || 0) + (t.melted || 0) + (t.dissolved || 0) + (t.moved || 0) + (t.planks || 0) })), { detail: t => ['burned', 'melted', 'frozen', 'dissolved', 'moved', 'planks'].filter(k => t[k]).map(k => `${hp(t[k])} ${k}`).join(' · ') })
      : el('p', { class: 'dim', text: 'The terrain tally (cells burned, melted, frozen, dissolved, water moved, planks placed) starts recording once the game feeds it.' });
    case 'light': return X.light ? bars(X.light.map(l => ({ ...l, name: cap(l.flame), total: l.seconds })), { color: l => `var(--m-${l.flame})`, detail: l => secs(l.seconds) })
      : el('p', { class: 'dim', text: 'The light tally (seconds each flame colour lit your lantern, Great Lamps and lamp-posts lit) starts recording once the game feeds it.' });
  }
  return el('p');
}
