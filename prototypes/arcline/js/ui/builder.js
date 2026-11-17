// The builder's tools on the city screen (owner reports 2026-11-16):
//   #81 stat cards for everything in the build trays — on hover, on keyboard focus, and printed on the card itself
//       (key numbers) so a phone or controller sees them without hovering; the full list again on the tool chip.
//   #72/#78/#82 info panels for a tapped turret (its Mk and real numbers) and wall (health %, healing or damaged).
//   #73 ghosts: tap one to rebuild it; Tools › Bulk repair rebuilds every ghost and patches damaged walls, in the
//       game's own dialog with a total and switches for buildings / defences / damaged walls.
//   #76 the Undo button on the tool bar (Ctrl+Z), with the seconds left.
// Numbers come from sim/arms.js (statRows, keyLine), sim/repair.js and sim/undo.js — this file only shows them.
import { $, el, btn, sheet, toast } from './dom.js';
import { fmt, pct } from '../../../../shared/format.js';
import { registerTip } from '../../../../shared/tooltip.js';
import { item, unlocked, materials, lockText } from '../sim/catalog.js';
import { milestones } from '../sim/tuning.js';
import { statRows, keyLine, nameWithMk, priceOf, turretStats, WALL_ID, wallMaxHp } from '../sim/arms.js';
import { ghostName, quoteGhost, bulkPlan, wallState } from '../sim/repair.js';
import { nextUndo } from '../sim/undo.js';
import { GATE } from '../sim/build.js';

const MAT = { metal: 'Metal', stone: 'Stone', crystal: 'Crystal', steel: 'Steel', concrete: 'Concrete', cells: 'Power cells' };
const money = n => `${n < 0 ? '−' : ''}¢${fmt(Math.abs(Math.round(n)))}`;
const matText = m => Object.entries(m || {}).filter(([, v]) => v > 0).map(([k, v]) => `${fmt(Math.ceil(v))} ${MAT[k]}`).join(', ');
const priceText = (cost, mats) => [money(cost), matText(mats)].filter(Boolean).join(' + ');

/** A stat list node: [[label, value], …] → <dl>. */
function dl(rows, cls = 'ac-stats') { return el('dl', { class: cls }, ...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])); }

// ---------------------------------------------------------------- #81 the tray's stat cards
/** Install the tray tooltip renderer (call once with the game). A card carries data-tip-render="buildstats" and
 *  data-tool="<tool id>". */
export function installBuilderTips(game) {
  registerTip('buildstats', node => {
    const t = game.tools?.[node.dataset.tool]; if (!t || !game.r) return null;
    return statCard(game, t);
  });
}
/** The full card: name (with Mk), what it does, price, every stat with its unit, and why it's locked if it is. */
export function statCard(game, t) {
  const r = game.r, e = t.entry, open = !e || unlocked(r, e);
  const box = el('div', { class: 'ac-statcard' });
  box.append(el('b', { class: 'nm' }, e ? nameWithMk(r, e) : t.name));
  if (e?.blurb || t.blurb) box.append(el('p', {}, e?.blurb || t.blurb));
  const rows = [];
  if (e?.cost != null) rows.push(['Price', priceText(priceOf(r, e), materials(e)) + (t.level || t.transit || t.wall || t.layer ? ' a tile' : '')]);
  rows.push(...statRows(r, e));
  if (rows.length) box.append(dl(rows));
  if (!open) box.append(el('p', { class: 'why' }, lockText(r, e)?.text || ''));
  return box;
}
/** Fill a tray card: the name with its Mk, a Mk badge, the price after discounts, the key numbers line, the tooltip. */
export function decorateCard(game, card, id, t) {
  const r = game.r, e = t.entry;
  const nm = card.querySelector('.nm'); if (nm && e) nm.textContent = nameWithMk(r, e);
  const line = keyLine(r, e); if (line) card.append(el('span', { class: 'kl' }, line));
  if (e?.turret) { const s = turretStats(r, e.turret); if (s.mk > 1) card.append(el('span', { class: 'mk' }, s.label.split(' ').pop())); }
  card.dataset.tipRender = 'buildstats'; card.dataset.tool = id; delete card.dataset.tip;
}

/** The tool chip's second line while a tool is held: the key numbers (phones and controllers see them here). */
export function toolChipLine(game, t) { return t?.entry ? keyLine(game.r, t.entry) : ''; }

// ---------------------------------------------------------------- info panels: turret, wall, ghost
function panel(game, title, blurb, rows, buttons, kind) {
  const box = $('#h-info');
  box.replaceChildren(el('h3', {}, title), blurb ? el('p', { class: 'dim' }, blurb) : null, rows.length ? dl(rows) : null,
    el('div', { class: 'row' }, ...buttons.filter(Boolean), btn('Close', () => { box.hidden = true; game.selected = null; game.picked = null; }, 'small')));
  box.dataset.kind = kind; box.hidden = false;
  return box;
}
/** A tapped turret: its Mk and real numbers, power, health. */
export function showTurret(game, tu) {
  const r = game.r, e = item(tu.id), s = turretStats(r, tu.kind, tu.tier || 1);
  game.selected = null; game.picked = { kind: 'turret', x: tu.x, z: tu.z };
  const rows = statRows(r, { ...e, turret: tu.kind }).filter(([k]) => k !== 'Health');
  // statRows uses the region's Mk; this turret's own Mk wins (they agree once refitted)
  rows[0] = ['Damage', `${fmt(s.damage, { decimals: 0 })} ${rows[0][1].replace(/^[\d,.]+ /, '')}`];
  rows.splice(2, 1, ['Damage a second', fmt(s.dps, { decimals: 0 })]);
  rows.splice(3, 1, ['Range', `${fmt(s.range, { decimals: 1 })} tiles`]);
  rows.push(['Power', (tu.powered ?? 1) >= 1 ? 'Connected' : (tu.powered ?? 0) > 0 ? `Short: firing at ${pct(tu.powered)}` : 'No power: idle']);
  const next = s.mk < 3 ? (s.mk === 1 ? 'Mk II (research it in R&D, or buy the parts from a passing merchant) refits it: 40% more damage.' : 'Mk III (R&D, or parts from a deep-space merchant): twice Mk I damage, more reach.') : 'Fully upgraded.';
  panel(game, s.label, `${e?.blurb || ''} ${next}`.trim(), rows, [btn('Bulldoze', () => game.bulldozeAt(tu.x, tu.z), 'danger small')], 'turret');
}
/** A tapped wall or gate: health %, whether it is healing, the repair price. */
export function showWall(game, x, z) {
  const r = game.r, i = z * r.size + x, v = r.tiles.wall[i], e = item(WALL_ID[v] || 'wall-1');
  game.selected = null; game.picked = { kind: 'wall', x, z };
  const box = panel(game, e?.name || 'Wall', v === GATE ? 'Roads pass through; creatures have to break it.' : 'Blocks creatures and everything they throw.', wallRows(r, i),
    [btn('Repair', () => game.repairAt(x, z), 'small', { id: 'h-wallfix' }), btn('Bulldoze', () => game.bulldozeAt(x, z), 'danger small')], 'wall');
  box.querySelector('dl').id = 'h-wallstats';
  refreshWall(game);
}
function wallRows(r, i) {
  const st = wallState(r, i), max = wallMaxHp(r, r.tiles.wall[i]);
  return [['Health', `${pct(st.frac)} (${fmt(Math.round(r.tiles.wallHp[i]))} of ${fmt(Math.round(max))})`], ['State', st.text]];
}
/** Live numbers on an open wall panel (called a few times a second). */
export function refreshWall(game) {
  const box = $('#h-info'), p = game.picked; if (!box || box.hidden || p?.kind !== 'wall') return;
  const r = game.r, i = p.z * r.size + p.x;
  if (!r.tiles.wall[i]) { box.hidden = true; game.picked = null; return; }
  const d = $('#h-wallstats'); if (d) d.replaceWith(Object.assign(dl(wallRows(r, i)), { id: 'h-wallstats' }));
  const fix = $('#h-wallfix'), q = game.quoteRepairAt?.(p.x, p.z);
  if (fix && q) { fix.disabled = !q.ok; fix.textContent = q.cost ? `Repair · ${money(q.cost)}` : 'Repair'; }
}
/** A tapped ghost: what stood there, the price to rebuild it, or what is in the way. */
export function showGhost(game, g) {
  const r = game.r, q = quoteGhost(r, g);
  game.selected = null; game.picked = { kind: 'ghost', g };
  const what = g.kind === 'lot' ? 'Destroyed by creatures. Rebuild it as it was, at its normal price.' : 'Destroyed by creatures. Rebuild it, or use Tools › Bulk repair to rebuild every ghost at once.';
  const rows = [['Rebuild', priceText(q.cost, q.mats)]];
  if (g.kind === 'turret') rows.push(['Comes back as', turretStats(r, item(g.id)?.turret).label]);
  if (!q.ok) rows.push(['Can\'t yet', q.why || 'Something is in the way']);
  panel(game, `${ghostName(g)} (destroyed)`, what, rows,
    [btn(`Rebuild · ${money(q.cost)}`, () => game.rebuildGhost(g), 'primary small', { disabled: q.ok ? null : true }), btn('Clear', () => game.clearGhost(g), 'small')], 'ghost');
}

// ---------------------------------------------------------------- #73 Bulk repair
/** The Bulk repair dialog: switches for buildings / defences / damaged walls, the counts and the total, one button. */
export function bulkSheet(game) {
  const r = game.r, opts = { buildings: true, defences: true, walls: true };
  sheet('Bulk repair', (m, close) => {
    const body = el('div', { class: 'ac-bulk' });
    const sw = (key, label, note) => el('label', { class: 'ac-toggle' }, el('input', { type: 'checkbox', checked: opts[key] || null, onchange: e => { opts[key] = e.target.checked; draw(); } }), el('span', { class: 'ac-switch', 'aria-hidden': 'true' }), el('span', { class: 'ac-toggle-text' }, el('b', {}, label), el('small', {}, note)));
    const go = btn('', () => {
      const res = game.bulkRebuild(opts);
      if (!res.ok) { toast(res.why || 'Nothing to rebuild', 'bad'); draw(); return; }
      close();
      toast(`Rebuilt ${fmt(res.rebuilt)} and repaired ${fmt(res.repaired)} wall tile${res.repaired === 1 ? '' : 's'} for ${money(res.cost)}. ${matchMedia('(pointer: coarse)').matches ? 'Undo on the tool bar' : 'Ctrl+Z'} takes it back for a minute.`, 'good');
    }, 'primary ac-bulkgo');
    const draw = () => {
      const p = bulkPlan(r, opts), c = p.counts;
      const rows = [];
      if (opts.defences) rows.push(['Walls and gates to rebuild', fmt(c.walls)], ['Turrets to rebuild', fmt(c.turrets)]);
      if (opts.buildings) rows.push(['Buildings to rebuild', fmt(c.buildings)]);
      if (opts.walls) rows.push(['Damaged wall tiles to patch', `${fmt(p.repair.tiles)}${p.repair.tiles ? ` (${money(p.repair.cost)})` : ''}`]);
      if (p.blocked) rows.push(['Left as ghosts', `${fmt(p.blocked)}: something stands there now`]);
      rows.push(['Total', priceText(p.total, p.mats)]);
      body.replaceChildren(
        sw('defences', 'Defences', 'Walls, gates and turrets'), sw('buildings', 'Buildings', 'Services, industry, landmarks. Zoned homes and shops grow back by themselves'),
        sw('walls', 'Patch damaged walls', 'Walls below full health, at 1 credit for every 2 points'), dl(rows, 'ac-stats ac-bulkrows'));
      go.replaceChildren(el('span', {}, p.ok ? `Rebuild for ${money(p.total)}` : 'Can\'t rebuild yet'), ...(p.ok ? [] : [el('small', { class: 'why' }, p.why)]));
      go.disabled = !p.ok;
    };
    m.append(el('p', { class: 'dim' }, 'Rebuild everything the creatures destroyed (the see-through ghosts on the map) at normal prices.'), body, go, btn('Cancel', close));
    draw();
  });
}

// ---------------------------------------------------------------- #76 the Undo button
/** Add the Undo button at the start of the tool bar (hidden while there is nothing to undo). */
export function buildUndoButton(game) {
  const bar = $('#h-tools'); if (!bar || $('#h-undo')) return;
  const b = btn('', () => game.undo(), 'ac-undo', { id: 'h-undo', hidden: true, 'aria-label': 'Undo the last build (Ctrl+Z)' });
  b.append(el('span', {}, 'Undo'), el('small', {}, ''));
  bar.prepend(b);
}
/** Refresh it: "Undo Street · 42 s · Ctrl+Z" (called a few times a second). */
export function refreshUndo(game) {
  const b = $('#h-undo'); if (!b || !game.r) return;
  const u = nextUndo(game.r);
  b.hidden = !u; if (!u) return;
  if (b._at !== u.at) { b._at = u.at; document.querySelector('.ac-tabs')?.scrollTo?.({ left: 0, behavior: 'smooth' }); }   // a new step: the tabs roll back to the start beside Undo (phones)
  const key = matchMedia('(pointer: coarse)').matches ? '' : ' · Ctrl+Z';
  b.querySelector('span').textContent = `Undo ${u.label}`;
  b.querySelector('small').textContent = `${fmt(u.secondsLeft)} s left${u.cost ? ` · ${money(u.cost)} back` : ''}${key}`;
  b.dataset.tip = `Undo the last thing you built (${u.label}) and get ${u.cost ? money(u.cost) : 'its price'} back${matText(u.mats) ? ` + ${matText(u.mats)}` : ''}. Works for a minute after building.`;
}
