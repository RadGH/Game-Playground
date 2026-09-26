// The Wick builder — the Wicks tab of the Satchel (docs/02 §15, 03 §16). Strand lists (Flames · Shapes · Charms ·
// Knots), sockets you drag strands onto (or focus + Enter), legality with the refusal reason (validateWick),
// live numbers from compileWick compared against the wick being edited, two burn-in bars, the test chamber
// running the real engine, the wick library (save / save as new / duplicate / delete / lock / equip to 1-4),
// wick codes (LF1:), and the first-time 4-step guide. Editable only at a lamp-post (braid mode); elsewhere the
// tab is swap-only (03 §15.1).
import { el, btn, tabStrip, toast, confirmBox, fmt, hp, pct, secs, sign, cap, cycle, FLAME_MARK, FLAME_TERRAIN, statusText } from './menukit.js';
import { compileWick, validateWick, wickName, burnLevel, BURN_THRESHOLDS } from '../spells/wick.js';
import { OC } from '../spells/cast.js';
import { TestChamber } from './chamber.js';
import { wickCode, parseWickCode, validateKnot, KNOT_TRIGGERS, CHILD_BANNED } from './wickcode.js';
export { TestChamber };

const MAX_WICKS = 24;
const CHARM_SOCKET_ACT = ['A2', 'A3', 'A6'];
/** 03 §7's changed meanings (only split, bounce, echo and volatile). */
export const CHANGED = {
  split: { arc: 'Split on an arc: three sweeps at 0° and ±30°, each 90° wide.', beam: 'Split on a beam: three thin beams at ±8°, 55% each.', ring: 'Split on a ring: three rings 0.1 s apart, 55% each.', rune: 'Split on a rune: three runes 14 cells apart (they count against the cap).', wave: 'Split on a wave: forward, backward, and forward again 0.2 s later.' },
  bounce: { lob: 'Bounce on a lob: bounces off solids and bursts on the last bounce.', beam: 'Bounce on a beam: reflects once off the first solid, 85% after.', wave: 'Bounce on a wave: turns round at a wall instead of breaking (twice).' },
  echo: { rune: 'Echo on a rune: the rune fires twice, 0.35 s apart, the second at 60%.' },
  volatile: { lob: 'Volatile on a lob: one bigger burst (radius 22) instead of two.', beam: 'Volatile on a beam: the far end bursts on release, radius 16.', tether: 'Volatile on a tether: both anchors burst when it ends.' },
};
const actNum = u => { if (!u || u === 'start') return 0; const m = /a(?:ct)?(\d)/.exec(u); return m ? +m[1] : 0; };
const heroOf = ctx => (typeof ctx.hero === 'function' ? ctx.hero() : ctx.hero) || ctx.game?.hero;
const atLamp = ctx => !!(typeof ctx.atLampPost === 'function' ? ctx.atLampPost() : ctx.atLampPost);

let S = null; // the open builder's state (one builder at a time)

export const wickbuilder = {
  id: 'wickbuilder', title: 'Wicks', satchel: true,
  canOpen(ctx) { return refusal(ctx); },
  badge(ctx) { const h = heroOf(ctx); return !!h?.flags?.newStrand; },
  render(root, ctx, args = {}) {
    const H = heroOf(ctx), D = ctx.data;
    const why = refusal(ctx); if (why) { root.append(el('p', { class: 'dim', text: why })); return; }
    H.wicks ||= []; H.loadout ||= [0, 1, 2, 3]; H.unlocked ||= {}; H.flags ||= {};
    if (H.flags.newStrand) H.flags.newStrand = false;
    const braid = atLamp(ctx);
    S = { ctx, H, D, braid, root, tab: 'flames', armed: null, sort: 'recent', sel: H.loadout[0] ?? 0, work: null, orig: null, dirty: false, chamber: null, guide: null };
    const guideOn = braid && !H.flags.builderGuideSeen && !args.noGuide;
    if (guideOn) { S.sel = null; S.work = { flame: null, shape: null, charms: [] }; S.orig = null; S.guide = { step: 0 }; }
    else selectWick(S.sel, true);
    // the chamber canvas lives across redraws
    S.canvas = el('canvas', { class: 'lf-chamber', 'aria-label': 'Test chamber: casts the wick at a training dummy', tabindex: 0 });
    S.chamber = new TestChamber(S.canvas, D, { hero: H, stats: H.stats, burn: H.burn, onSlow: () => toast('Test chamber slowed to 30 fps to keep the game smooth.') });
    S.canvas.addEventListener('pointerdown', ev => { const c = S.chamber.cellAt(ev); S.chamber.castAt(c.x, c.y); if (S.guide?.step === 2) advanceGuide(); });
    S.canvas.addEventListener('pointerenter', () => { S.hoverChamber = true; }); S.canvas.addEventListener('pointerleave', () => { S.hoverChamber = false; });
    draw(); S.chamber.start();
    S.tick = setInterval(() => { if (!S?.canvas.isConnected) return; drawMeasured(); if (S.guide?.step === 2 && S.chamber.casts > (S.guide.casts0 ?? 1e9)) advanceGuide(); }, 500);
  },
  onKey(code, e) {
    if (!S) return false;
    if (S.hoverChamber && /^Digit[1-4]$/.test(code)) { const k = +code.slice(5) - 1; const w = S.H.wicks[S.H.loadout[k]]; if (w) { S.chamber.setWick(w, S.H.stats, S.H.burn); S.chamber.castAt(); toast(`Chamber: slot ${k + 1}, ${wickName(w, S.D)}`); } return true; }
    if (code === 'BracketLeft' || code === 'BracketRight') { S.tab = cycle(strandTabs().map(t => t.id), S.tab, code === 'BracketLeft' ? -1 : 1); draw(); return true; }
    const sock = document.activeElement?.closest?.('.lf-socket');
    if ((code === 'Delete' || code === 'KeyX' || code === 'Backspace') && sock) { clearSocket(sock.dataset.sock, +sock.dataset.i || 0); return true; }
    return false;
  },
  destroy() { if (!S) return; S.chamber?.stop(); clearInterval(S.tick); S = null; },
  tips(ctx) {
    return {
      strand: node => { const [kind, id] = (node.dataset.tipStrand || '').split(':'); return strandCard(ctx.data, kind, id, heroOf(ctx)); },
      wick: node => { const H = heroOf(ctx); const w = H?.wicks?.[+node.dataset.tipWick]; return w ? wickCard(w, ctx.data, H) : null; },
    };
  },
};
export const screens = [wickbuilder];

function refusal(ctx) {
  if (ctx.builderUnlocked === false) return 'You have not learned that yet.';
  const c = typeof ctx.inCombat === 'function' ? ctx.inCombat() : ctx.inCombat;
  if (c) return 'Not with enemies near.';
  if (!heroOf(ctx)) return 'No character yet.';
  return null;
}
function selectWick(i, quiet) {
  const w = S.H.wicks[i];
  S.sel = w ? i : null; S.work = w ? structuredClone(w) : { flame: null, shape: null, charms: [] }; S.orig = w ? structuredClone(w) : null; S.dirty = false;
  if (!quiet) draw();
}
const charmSlots = () => Math.min(3, S.H.unlocked.charmSlots ?? 0);
function strandTabs() {
  const act = S.ctx.act ?? 1, U = S.H.unlocked;
  return [{ id: 'flames', label: 'Flames' }, { id: 'shapes', label: 'Shapes' },
    (charmSlots() > 0 || U.charms?.length || act >= 2) && { id: 'charms', label: 'Charms' },
    (act >= 4 || U.knots?.length) && { id: 'knots', label: 'Knots' }].filter(Boolean);
}
/** The strands of one kind: owned (lit), known (dim, with where to find it) or hidden (acts not reached). */
function strandRows(kind) {
  const D = S.D, U = S.H.unlocked, act = S.ctx.act ?? 1;
  const list = kind === 'flames' ? D.flames.list : kind === 'shapes' ? D.shapes.list : kind === 'charms' ? D.charms.list : KNOT_TRIGGERS;
  const owned = kind === 'knots' ? (U.knots || []) : (U[kind] || []);
  return list.map(s => {
    const own = owned.includes(s.id), reach = actNum(s.unlock) <= Math.max(act, 1) || kind === 'knots';
    if (!own && !reach) return null;
    let bad = null;
    if (own && S.braid && kind === 'charms') bad = validateWick({ ...S.work, flame: S.work.flame || 'ember', shape: S.work.shape || 'bolt', charms: [...new Set([...(S.work.charms || []), s.id])] }, D, U, 3);
    if (own && S.braid && kind === 'shapes' && S.work.charms?.length) bad = validateWick({ ...S.work, flame: S.work.flame || 'ember', shape: s.id }, D, U, 3);
    return { s, own, bad, where: own ? null : s.source || (actNum(s.unlock) ? `Found in Act ${actNum(s.unlock)}` : 'Sold at Wick & Tallow') };
  }).filter(Boolean);
}

function draw() {
  if (!S) return;
  const { H, D, braid } = S; const root = S.root;
  const focusKey = document.activeElement?.dataset?.k;
  const w = S.work, stats = H.stats || {};
  const why = w.flame && w.shape ? (validateWick(w, D, H.unlocked, charmSlots()) || validateKnot(w.knot, D, H.unlocked)) : 'Pick a Flame and a Shape.';
  // ----- strands column
  const tabs = strandTabs(); if (!tabs.some(t => t.id === S.tab)) S.tab = 'flames';
  const rows = strandRows(S.tab);
  const strandCol = el('div', { class: 'lf-panel strands', dataset: { g: 'strands' } }, el('h3', { class: 'lf-h', text: 'Strands' }),
    tabStrip(tabs, S.tab, id => { S.tab = id; draw(); }, { sub: true }),
    ...rows.map(({ s, own, bad, where }) => {
      const kind = S.tab, color = kind === 'flames' ? s.color : kind === 'knots' ? '#e6c27a' : '#8792a2';
      const b = el('button', { type: 'button', class: 'lf-strand' + (own ? '' : ' known') + (bad ? ' bad' : ''), dataset: { k: `st-${kind}-${s.id}`, tipStrand: `${kind}:${s.id}`, tipRender: 'strand' } },
        el('span', { class: 'sw', style: { background: color } }), el('span', { class: 'grow' }, el('b', { text: (kind === 'flames' ? (FLAME_MARK[s.id] || '') + ' ' : '') + s.name }), el('span', { class: 'sum', text: own ? (bad || s.desc || '') : where })));
      if (own && braid) {
        b.addEventListener('pointerdown', ev => startDrag(ev, kind, s.id, b));
        b.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); pickStrand(kind, s.id); } });
      }
      return b;
    }),
    braid ? el('p', { class: 'dim small', text: 'Drag a strand onto a socket, or focus it and press Enter.' }) : el('p', { class: 'gold small', text: 'Braid at a lamp-post. Here you can swap saved wicks into slots and test them.' }));
  // ----- the braid: sockets
  const f = D.flames.byId[w.flame], sh = D.shapes.byId[w.shape];
  const conflict = c => { const ch = D.charms.byId[c]; return ch?.notOn?.includes(w.shape) || (D.charms.exclusive || []).some(([a, b]) => (a === c && w.charms.includes(b)) || (b === c && w.charms.includes(a))); };
  const sock = (kind, i, label, val, color, extra = {}) => {
    const locked = !braid || extra.locked;
    const s = el('div', { class: 'lf-socket' + (val ? ' filled' : '') + (locked ? ' locked' : '') + (extra.bad ? ' bad' : '') + (S.armed && S.armed.kind === kind + 's' ? ' lit' : ''), tabindex: 0, role: 'button', 'aria-label': `${label}: ${val || 'empty'}`, dataset: { sock: kind, i, k: `so-${kind}-${i}`, ...(extra.tip ? { tip: extra.tip } : {}) } },
      el('span', { class: 'lbl', text: label }), el('span', { class: 'v', style: color ? { color } : null, text: val || (extra.locked ? '🔒 ' + (extra.lockText || '') : '·') }), extra.changed ? el('span', { class: 'changed', text: '≈', 'aria-label': 'changed meaning' }) : null);
    s.addEventListener('click', () => onSocket(kind, i));
    if (val && braid) s.addEventListener('pointerdown', ev => startDrag(ev, 'socket', `${kind}:${i}`, s));
    return s;
  };
  const charmSockets = [0, 1, 2].map(i => {
    const c = w.charms[i]; const open = i < charmSlots(); const ch = c && D.charms.byId[c];
    return sock('charm', i, `Charm ${i + 1}`, ch?.name, null, { locked: !open, lockText: CHARM_SOCKET_ACT[i], bad: c && conflict(c), changed: c && CHANGED[c]?.[w.shape], tip: c && CHANGED[c]?.[w.shape] });
  });
  const knotOpen = (S.ctx.act ?? 1) >= 4 || H.unlocked.knots?.length;
  const knotVal = w.knot?.trigger ? `${KNOT_TRIGGERS.find(t => t.id === w.knot.trigger)?.name} → ${[w.knot.flame, w.knot.shape, w.knot.charm].filter(Boolean).map(cap).join(' ') || '…'}` : null;
  const braidEl = el('div', { class: 'lf-braid', style: { '--c1': f?.color || '#333', '--c2': sh ? '#c9b48a' : '#222', opacity: f && sh ? 1 : 0.25 } });
  const nameIn = el('input', { class: 'lf-input grow', type: 'text', maxlength: 24, value: w.name || (w.flame && w.shape ? wickName({ ...w, name: null }, D) : ''), 'aria-label': 'Wick name', disabled: !braid || w.locked ? true : null, dataset: { k: 'name' },
    onchange: e => { const v = e.target.value.trim().slice(0, 24); S.work.name = v && v !== wickName({ ...S.work, name: null }, D) ? v : null; S.dirty = true; } });
  const braidCol = el('div', { class: 'col' },
    el('div', { class: 'lf-panel col' }, el('div', { class: 'row' }, el('h3', { class: 'lf-h', text: 'The braid' }), S.sel != null && H.mastery === H.wicks[S.sel]?.id ? el('span', { class: 'gold small', text: '◆ mastered' }) : null),
      el('div', { class: 'row' }, nameIn, btn(w.locked ? '🔒' : '🔓', () => { S.work.locked = !S.work.locked; if (S.sel != null) { H.wicks[S.sel].locked = S.work.locked; S.ctx.actions.wicksChanged?.(); } draw(); }, { cls: 'small', tip: w.locked ? 'Locked: cannot be edited, overwritten or deleted. Click to unlock.' : 'Lock this wick.', dataset: { k: 'lock' }, disabled: S.sel == null ? 'Save it first.' : null })),
      el('div', { class: 'lf-sockets' },
        sock('flame', 0, 'Flame', f && `${FLAME_MARK[f.id] || ''} ${f.name}`, f?.color),
        sock('shape', 0, 'Shape', sh?.name),
        el('div', { style: { gridColumn: '1 / -1' } }, braidEl),
        el('div', { class: 'charms' }, ...charmSockets, sock('knot', 0, 'Knot', knotVal, '#e6c27a', { locked: !knotOpen, lockText: 'A4' }))),
      w.knot?.trigger && braid ? knotEditor(w) : null,
      el('div', { class: 'lf-refusal', role: 'status', text: w.flame && w.shape && !why ? '' : why || '' })),
    readout(w, why, stats));
  // ----- chamber column
  S.canvas.classList.toggle('grey', false);
  const chamberCol = el('div', { class: 'lf-panel col', dataset: { g: 'chamber' } }, el('h3', { class: 'lf-h', text: 'Test chamber' }), S.canvas,
    el('div', { class: 'row' },
      btn(S.chamber.auto ? '■ Stop' : '▶ Auto-cast', () => { S.chamber.auto = !S.chamber.auto; draw(); }, { cls: 'small', dataset: { k: 'auto' } }),
      btn('Cast', () => { S.chamber.castAt(); if (S.guide?.step === 2) advanceGuide(); }, { cls: 'small', dataset: { k: 'cast1' } }),
      btn('Reset', () => { S.chamber.reset(); S.chamber.clearStats(); drawMeasured(); }, { cls: 'small', tip: 'Rebuild the chamber: burned wood back, water refilled.', dataset: { k: 'reset' } })),
    el('p', { class: 'dim tiny', text: 'Click in the chamber to cast at that spot. With the mouse over it, 1-4 test your equipped wicks.' }),
    el('h4', { class: 'gold small', text: 'Measured (last 10 s)' }), S.measuredEl = el('div', { class: 'lf-measured' }));
  S.chamber.setWick(w.flame && w.shape && !why ? w : (w.flame && w.shape ? w : null), H.stats, H.burn);
  if (w.flame && w.shape && why) S.canvas.classList.add('grey');
  // ----- library strip
  const lib = library();
  root.replaceChildren(el('div', { class: 'lf-wb' }, strandCol, braidCol, chamberCol), lib);
  drawMeasured();
  if (S.guide) drawGuide();
  if (focusKey) root.querySelector(`[data-k="${CSS.escape(focusKey)}"]`)?.focus();
}

function knotEditor(w) {
  const D = S.D, U = S.H.unlocked, k = w.knot;
  const pick = (label, list, val, set, allowNone) => el('label', { class: 'row small' }, label, el('select', { onchange: e => { set(e.target.value || null); S.dirty = true; draw(); } },
    allowNone ? el('option', { value: '', text: '—' }) : null, list.map(s => el('option', { value: s.id, text: s.name, selected: s.id === val }))));
  return el('div', { class: 'row small' },
    pick('Trigger', KNOT_TRIGGERS.filter(t => U.knots?.includes(t.id) || true), k.trigger, v => { k.trigger = v; }),
    pick('Child flame', D.flames.list.filter(f => U.flames?.includes(f.id)), k.flame, v => { k.flame = v; }, true),
    pick('Child shape', D.shapes.list.filter(s => U.shapes?.includes(s.id)), k.shape, v => { k.shape = v; }, true),
    pick('Child charm', D.charms.list.filter(c => U.charms?.includes(c.id) && !CHILD_BANNED.includes(c.id)), k.charm, v => { k.charm = v; }, true),
    btn('Untie', () => { delete S.work.knot; S.dirty = true; draw(); }, { cls: 'small' }));
}

function readout(w, why, stats) {
  const D = S.D, H = S.H;
  const box = el('div', { class: 'lf-panel', dataset: { g: 'readout' } }, el('h3', { class: 'lf-h', text: 'Readout' }));
  if (!w.flame || !w.shape) { box.append(el('p', { class: 'dim', text: 'Put a Flame and a Shape on the braid to see its numbers.' })); return box; }
  const P = compileWick(w, D, stats, { burn: H.burn });
  const B = S.orig && S.orig.flame && S.orig.shape ? compileWick(S.orig, D, stats, { burn: H.burn }) : null;
  const cmp = (a, b, better = 1) => { if (b == null || Math.abs(a - b) < 1e-6) return null; const up = (a > b) === (better > 0); return el('span', { class: up ? 'good' : 'bad', text: (a > b ? ' ▲' : ' ▼') }); };
  const s = D.shapes.byId[w.shape], f = D.flames.byId[w.flame];
  const charms = (w.charms || []).map(c => D.charms.byId[c]).filter(Boolean);
  const oilTip = `${s.name} ${fmt(s.oil)} × ${f.name} ${fmt(f.oilMult)}${charms.map(c => c.oil && c.oil !== 1 ? ` × ${c.name} ${fmt(c.oil)}` : '').join('')} = ${fmt(P.oil)}${P.perSecond ? ' per second' : ''}`;
  const reach = P.range || P.length || (P.speed ? P.speed * P.lifetime : P.size);
  const spam = P.perSecond ? P.oil : P.oil / Math.max(0.1, P.cooldown + P.castTime);
  const regen = stats.oilRegen || 3;
  const dark = typeof S.ctx.inDark === 'function' ? S.ctx.inDark() : S.ctx.inDark;
  const lv = P.burn || { flame: 1, shape: 1 };
  const burnRow = (name, oil, level) => { const next = BURN_THRESHOLDS[level] ?? null; return el('div', { class: 'row small' }, el('span', { style: { minWidth: '60px' }, text: name }), el('span', { class: 'lf-burn', 'aria-label': `level ${level} of 5` }, [1, 2, 3, 4, 5].map(k => el('i', { class: k <= level ? 'on' : '' }))), el('span', { class: 'dim', text: next != null ? `${hp(oil)} / ${hp(next)} oil` : `${hp(oil)} oil · full` })); };
  const status = D.statuses?.byId?.[f.status];
  const effects = [status && `${status.name} (${statusText(status)})`, ...(FLAME_TERRAIN[f.id] || []), w.dry ? 'dry: pushes water already there' : null].filter(Boolean);
  const changed = charms.map(c => CHANGED[c.id]?.[w.shape]).filter(Boolean);
  const ocSafe = Math.min(1.7, OC.safe + (P.steady ? 0.1 : 0) + (stats.overchargeSafe || 0));
  const flag = balanceFlag(P);
  const rows = [
    ['Oil per cast', el('span', { 'data-tip': oilTip }, `${fmt(P.oil)}${P.perSecond ? '/s' : ''}`, cmp(P.oil, B?.oil, -1))],
    ['Cast · cooldown', `${secs(P.castTime)} · ${secs(P.cooldown)}`, cmp(P.cooldown, B?.cooldown, -1)],
    ['Damage per hit', el('span', {}, `${fmt(P.damage)}${P.count > 1 ? ` ×${P.count} ${s.name.toLowerCase()}s` : ''}${P.perSecond ? ` × ${P.tickRate}/s` : ''}`, cmp(P.damage * P.count, B ? B.damage * B.count : null))],
    ['Expected DPS', el('span', {}, fmt(P.dps), cmp(P.dps, B?.dps))],
    ['Damage per oil', el('span', {}, fmt(P.perOil), cmp(P.perOil, B?.perOil))],
    ['Reach', `${hp(reach)} cells`],
    ['Oil/s spammed', el('span', { class: spam > regen ? 'bad' : '' }, `${fmt(spam)}/s`, el('span', { class: 'dim', text: dark ? ' · no regen here' : spam > regen ? ` · over your regen (${fmt(regen)}/s)` : ` · regen ${fmt(regen)}/s` }))],
    ['Light', el('span', {}, el('span', { class: 'sw', style: { display: 'inline-block', width: '10px', height: '10px', background: f.color, borderRadius: '50%', marginRight: '4px' } }), `${hp(P.light.r)} cells${P.light.negative ? ' (eats light)' : ''}`)],
    H.unlocked.overcharge ? ['Overcharge', `safe to ${fmt(ocSafe)}× · ${sign((1 + 0.8 * Math.pow(ocSafe - 1, 0.7) - 1) * 100, { decimals: 0 })}%`] : null,
    ['Effects', effects.join(' · ')],
    w.knot?.trigger && w.knot.flame && w.knot.shape ? ['Knot', knotLine(w)] : null,
    flag ? ['Balance', el('span', { class: 'gold', text: flag })] : null,
  ].filter(Boolean);
  box.append(el('dl', { class: 'lf-readout' }, rows.map(([k, ...v]) => [el('dt', { text: k }), el('dd', {}, ...v)]).flat()),
    el('h4', { class: 'gold small', text: 'Burn-in' }), burnRow(f.name, H.burn?.flame?.[f.id] || 0, lv.flame), burnRow(s.name, H.burn?.shape?.[s.id] || 0, lv.shape),
    changed.length ? el('p', { class: 'small gold', text: changed.join(' ') }) : null,
    why ? el('p', { class: 'bad small', text: why }) : null);
  return box;
}
function knotLine(w) {
  const k = w.knot; const child = compileWick({ flame: k.flame, shape: k.shape, charms: k.charm ? [k.charm] : [] }, S.D, S.H.stats || {}, { burn: S.H.burn });
  return `${cap(k.flame)} ${cap(k.shape)} ${fmt(child.damage * 0.6)} ${k.trigger === 'on_hit' ? 'on hit' : 'on kill'} (max 3) · child oil ${fmt(child.oil * 0.5)} when it fires`;
}
/** 03's wick-rank in small: damage per oil over 1.5× the median of the plain wicks you could braid now. */
function balanceFlag(P) {
  if (['ring', 'rune', 'wave', 'tether'].includes(P.shape)) return null;
  const U = S.H.unlocked; const vals = [];
  for (const f of U.flames || []) for (const s of U.shapes || []) if (!['ring', 'rune', 'wave', 'tether'].includes(s)) vals.push(compileWick({ flame: f, shape: s, charms: [] }, S.D, S.H.stats || {}, {}).perOil);
  if (vals.length < 3) return null; vals.sort((a, b) => a - b); const med = vals[vals.length >> 1];
  return P.perOil > 1.5 * med ? `⚠ Strong for Act ${S.ctx.act ?? 1} — enjoy it` : null;
}
function drawMeasured() {
  if (!S?.measuredEl) return; const m = S.chamber.measured();
  S.measuredEl.replaceChildren(...[['DPS on dummy', fmt(m.dps)], ['Hits', hp(m.hits)], ['Damage / oil', fmt(m.perOil)], ['Crit rate', pct(m.crit)], ['Status uptime', pct(m.statusUptime)], ['Cells changed', hp(m.cells)], ['Oil spent', hp(m.oil)]]
    .flatMap(([k, v]) => [el('span', { class: 'dim', text: k }), el('span', { class: 'num', text: v })]));
}

// ----- placing strands
function pickStrand(kind, id) {
  if (!S.braid) return;
  if (kind === 'charms') { S.armed = { kind, id }; const free = [0, 1, 2].find(i => i < charmSlots() && !S.work.charms[i]); if (free != null && !S.work.charms.includes(id)) { dropOn('charm', free, kind, id); S.armed = null; return; } draw(); S.root.querySelector('.lf-socket[data-sock="charm"]')?.focus(); toast('Pick a charm socket and press Enter.'); return; }
  dropOn(kind === 'flames' ? 'flame' : kind === 'shapes' ? 'shape' : 'knot', 0, kind, id);
}
function onSocket(sockKind, i) {
  if (!S.braid) { toast('Braid at a lamp-post.'); return; }
  if (S.armed) { const a = S.armed; S.armed = null; dropOn(sockKind, i, a.kind, a.id); return; }
  if (sockKind === 'knot' && !S.work.knot && ((S.ctx.act ?? 1) >= 4 || S.H.unlocked.knots?.length)) { S.work.knot = { trigger: S.H.unlocked.knots?.[0] || 'on_hit', flame: null, shape: null, charm: null }; S.dirty = true; draw(); return; }
  S.tab = sockKind === 'flame' ? 'flames' : sockKind === 'shape' ? 'shapes' : sockKind === 'charm' ? 'charms' : 'knots'; draw();
  S.root.querySelector('.lf-strand:not(.known)')?.focus();
}
function dropOn(sockKind, i, kind, id) {
  const want = { flame: 'flames', shape: 'shapes', charm: 'charms', knot: 'knots' }[sockKind];
  const names = { flames: 'Flame', shapes: 'Shape', charms: 'Charm', knots: 'Knot' };
  if (want !== kind) { S.ctx.sound?.('ui.error'); toast(`That's a ${names[kind]}; drop it on a ${names[kind].toLowerCase()} socket.`, 'bad'); return; }
  if (S.work.locked) { toast('This wick is locked.', 'bad'); return; }
  const w = S.work;
  if (sockKind === 'flame') w.flame = id; else if (sockKind === 'shape') w.shape = id;
  else if (sockKind === 'charm') { if (i >= charmSlots()) { toast(`Charm socket ${i + 1} opens in ${CHARM_SOCKET_ACT[i]}.`, 'bad'); return; } const c = [...w.charms]; const j = c.indexOf(id); if (j >= 0) c.splice(j, 1); c[i] = id; w.charms = c.filter(Boolean); }
  else if (sockKind === 'knot') w.knot = { ...(w.knot || {}), trigger: id };
  S.dirty = true; S.ctx.sound?.('ui.click');
  if (w.flame && w.shape && !validateWick(w, S.D, S.H.unlocked, charmSlots())) S.ctx.sound?.('spell.' + ({ ember: 'fire', rime: 'ice', spark: 'lightning', bile: 'poison', gleam: 'holy', tide: 'water', shade: 'shadow' }[w.flame] || 'fire') + '.launch');
  if (S.guide) { if (S.guide.step === 0 && w.flame) advanceGuide(true); if (S.guide?.step === 1 && w.shape) advanceGuide(true); }
  draw();
}
function clearSocket(sockKind, i) {
  if (!S.braid || S.work.locked) return; const w = S.work;
  if (sockKind === 'flame') w.flame = null; else if (sockKind === 'shape') w.shape = null; else if (sockKind === 'charm') w.charms = w.charms.filter((_, k) => k !== i); else if (sockKind === 'knot') delete w.knot;
  S.dirty = true; draw();
}
function startDrag(ev, kind, id, srcEl) {
  if (ev.button !== 0) return;
  const x0 = ev.clientX, y0 = ev.clientY; let ghost = null, over = null;
  const move = e => {
    if (!ghost && Math.hypot(e.clientX - x0, e.clientY - y0) > 5) { ghost = el('div', { class: 'lf-chip', style: { position: 'fixed', zIndex: 99, pointerEvents: 'none' }, text: srcEl.textContent.slice(0, 24) }); document.body.append(ghost); }
    if (!ghost) return; ghost.style.left = e.clientX + 8 + 'px'; ghost.style.top = e.clientY + 8 + 'px';
    const s = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.lf-socket'); if (over !== s) { over?.classList.remove('hover'); over = s; over?.classList.add('hover'); }
  };
  const up = e => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up);
    over?.classList.remove('hover');
    if (!ghost) { if (kind !== 'socket') pickStrand(kind, id); return; }
    ghost.remove();
    const s = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.lf-socket');
    if (kind === 'socket') { const [k, i] = id.split(':'); if (!s) clearSocket(k, +i); return; }
    if (s) dropOn(s.dataset.sock, +s.dataset.i || 0, kind, id);
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
}

// ----- the library
function library() {
  const { H, D } = S; const n = Math.max(1, Math.min(4, H.unlocked.wickSlots ?? 2));
  const why = S.work.flame && S.work.shape ? (validateWick(S.work, D, H.unlocked, charmSlots()) || validateKnot(S.work.knot, D, H.unlocked)) : 'Pick a Flame and a Shape.';
  const cap_ = MAX_WICKS + (H.flags?.firstFlameMedal ? 2 : 0);
  const chip = (i, slotN) => {
    const w = H.wicks[i]; if (!w) return el('span', { class: 'lf-chip', text: slotN != null ? `${slotN + 1} ○ —` : '—' });
    const lv = { f: burnLevel(H.burn?.flame?.[w.flame] || 0), s: burnLevel(H.burn?.shape?.[w.shape] || 0) };
    const c = el('button', { type: 'button', class: 'lf-chip' + (i === S.sel ? ' sel' : '') + (H.mastery === w.id ? ' mastered' : ''), dataset: { k: `chip-${slotN ?? 'x'}-${i}`, tipRender: 'wick', tipWick: i } },
      slotN != null ? el('span', { class: 'slotn', text: String(slotN + 1) }) : null, el('span', { class: 'sw', style: { background: D.flames.byId[w.flame]?.color } }), wickName(w, D),
      el('span', { class: 'dim tiny', text: `${'▪'.repeat(lv.f)}/${'▪'.repeat(lv.s)}` }), w.locked ? '🔒' : null);
    c.addEventListener('click', async () => { if (S.dirty && S.braid && !(await confirmBox(S.root.closest('.scr'), { title: 'Discard changes?', text: 'The braid has unsaved changes.', yes: 'Discard' }))) return; selectWick(i); });
    return c;
  };
  const slots = [0, 1, 2, 3].map(k => k < n ? chip(H.loadout[k], k) : el('span', { class: 'lf-chip dim', text: `${k + 1} 🔒`, 'data-tip': ['', 'Opens at the Candlemarket', 'Opens in Act 3', 'Opens in Act 5'][k] }));
  const order = H.wicks.map((w, i) => i).filter(i => !H.loadout.slice(0, n).includes(i));
  if (S.sort === 'name') order.sort((a, b) => wickName(H.wicks[a], D).localeCompare(wickName(H.wicks[b], D)));
  else if (S.sort === 'flame') order.sort((a, b) => H.wicks[a].flame.localeCompare(H.wicks[b].flame));
  else if (S.sort === 'burn') order.sort((a, b) => (H.burn?.flame?.[H.wicks[b].flame] || 0) - (H.burn?.flame?.[H.wicks[a].flame] || 0));
  else order.reverse();
  const selW = S.sel != null ? H.wicks[S.sel] : null;
  const saveWhy = !S.braid ? 'Braid at a lamp-post.' : why || (selW?.locked ? 'This wick is locked.' : S.sel == null ? 'Nothing selected to overwrite: use Save as new.' : null);
  const box = el('div', { class: 'lf-panel col', dataset: { g: 'library' } },
    el('h3', { class: 'lf-h', text: `Your wicks (${H.wicks.length}/${cap_})` }),
    el('div', { class: 'lf-library' }, ...slots, el('span', { class: 'dim', text: '|' }), ...order.map(i => chip(i, null))),
    el('div', { class: 'row' },
      btn('Save', () => save(false), { cls: 'small primary', disabled: saveWhy, dataset: { k: 'save' } }),
      btn('Save as new', () => save(true), { cls: 'small', disabled: !S.braid ? 'Braid at a lamp-post.' : why || (H.wicks.length >= cap_ ? `The library holds ${cap_} wicks.` : null), dataset: { k: 'saveNew' } }),
      btn('Duplicate', () => { if (!selW) return; H.wicks.push({ ...structuredClone(selW), id: nextId(), locked: false, name: selW.name ? selW.name + ' II' : null }); S.ctx.actions.wicksChanged?.(); selectWick(H.wicks.length - 1); }, { cls: 'small', disabled: !S.braid ? 'Braid at a lamp-post.' : !selW ? 'Pick a saved wick.' : H.wicks.length >= cap_ ? 'The library is full.' : null }),
      btn('Delete', async () => {
        if (!selW) return; if (await confirmBox(S.root.closest('.scr'), { title: `Delete ${wickName(selW, D)}?`, yes: 'Delete' })) {
          const i = S.sel; H.wicks.splice(i, 1); H.loadout = H.loadout.map(x => (x === i ? -1 : x > i ? x - 1 : x)); S.ctx.actions.wicksChanged?.(); selectWick(H.loadout[0] >= 0 ? H.loadout[0] : 0);
        }
      }, { cls: 'small danger', disabled: !S.braid ? 'Braid at a lamp-post.' : !selW ? 'Pick a saved wick.' : selW.locked ? 'Locked wicks cannot be deleted.' : H.wicks.length <= 1 ? 'Keep at least one wick.' : null }),
      el('span', { class: 'small dim', text: 'Equip to' }),
      ...[0, 1, 2, 3].map(k => btn(String(k + 1), () => equipTo(k), { cls: 'small', disabled: k >= n ? 'That slot is not open yet.' : S.sel == null ? 'Save the wick first.' : S.dirty && S.braid ? 'Save the wick first.' : null, dataset: { k: 'eq' + k } })),
      el('span', { class: 'grow' }),
      el('label', { class: 'small row' }, 'Sort', el('select', { onchange: e => { S.sort = e.target.value; draw(); } }, ['recent', 'name', 'flame', 'burn'].map(v => el('option', { value: v, text: cap(v === 'burn' ? 'burn-in' : v), selected: v === S.sort })))),
      btn('Copy code', async () => { if (!S.work.flame || !S.work.shape) return; const code = wickCode(S.work); try { await navigator.clipboard.writeText(code); toast(`Copied ${code}`); } catch { toast(code); } }, { cls: 'small', disabled: S.work.flame && S.work.shape ? null : 'Nothing to copy yet.' }),
      btn('Paste code', pasteCode, { cls: 'small', disabled: S.braid ? null : 'Braid at a lamp-post.' })));
  return box;
}
function nextId() { let n = 1; while (S.H.wicks.some(w => w.id === 'w' + n)) n++; return 'w' + n; }
function save(asNew) {
  const { H } = S; const w = structuredClone(S.work); delete w.burn;
  if (asNew || S.sel == null) { w.id = nextId(); w.locked = false; H.wicks.push(w); S.sel = H.wicks.length - 1; }
  else { w.id = H.wicks[S.sel].id; H.wicks[S.sel] = w; }
  S.orig = structuredClone(w); S.dirty = false; S.ctx.actions.wicksChanged?.(); S.ctx.sound?.('ui.click'); toast(`Saved ${wickName(w, S.D)}.`, 'good');
  if (S.guide?.step === 3) S.guide.saved = true;
  draw();
}
function equipTo(k) {
  const { H } = S; const i = S.sel; if (i == null) return;
  const j = H.loadout.indexOf(i); if (j >= 0 && j !== k) H.loadout[j] = H.loadout[k];
  H.loadout[k] = i; S.ctx.actions.wicksChanged?.(); S.ctx.sound?.('ui.tab'); toast(`${wickName(H.wicks[i], S.D)} is in slot ${k + 1}.`);
  if (S.guide?.step === 3 && S.guide.saved) finishGuide();
  draw();
}
async function pasteCode() {
  const host = S.root.closest('.scr'); let text = '';
  try { text = await navigator.clipboard.readText(); } catch {}
  const field = el('input', { class: 'lf-input', type: 'text', value: /^LF1/.test(text) ? text : '', placeholder: 'LF1:ember:bolt:-:-:-:-:-', 'aria-label': 'Wick code' });
  if (!(await confirmBox(host, { title: 'Paste a wick code', extra: field, yes: 'Load it' }))) return;
  const r = parseWickCode(field.value, S.D, S.H.unlocked, charmSlots());
  if (r.error) { toast(r.error, 'bad'); S.ctx.sound?.('ui.error'); return; }
  S.work = { ...r.wick, name: null }; S.dirty = true; draw(); toast('Loaded onto the braid. Save it to keep it.');
}

// ----- first-time guide (02 §15.7)
const GUIDE = [
  { g: 'strands', sock: 'flame', text: 'Drag a Flame onto the braid.' },
  { g: 'strands', sock: 'shape', text: 'Now a Shape: how it travels.' },
  { g: 'chamber', text: 'Try it. Cast into the chamber.' },
  { g: 'library', text: 'Save it and put it in slot 2.' },
];
function advanceGuide(noDraw) {
  if (!S?.guide) return; S.guide.step++;
  if (S.guide.step === 2) { S.tab = 'flames'; S.guide.casts0 = S.chamber.casts; S.chamber.auto = false; }
  if (S.guide.step >= GUIDE.length) return finishGuide();
  if (S.guide.step === 1) S.tab = 'shapes';
  if (!noDraw) draw();
}
function finishGuide() { if (!S) return; S.guide = null; S.H.flags.builderGuideSeen = true; S.chamber.auto = true; S.root.querySelector('.lf-guide')?.remove(); toast('That is a wick. Every wick is built this way.', 'good'); }
function drawGuide() {
  const st = GUIDE[S.guide.step]; S.root.querySelector('.lf-guide')?.remove();
  const target = S.root.querySelector(`[data-g="${st.g}"]`); if (!target) return;
  const layer = el('div', { class: 'lf-guide' }); const hole = el('div', { class: 'hole' });
  const say = el('div', { class: 'say', role: 'status' }, el('span', { class: 'gold', text: `${S.guide.step + 1}/4` }), el('span', { class: 'grow', text: st.text }), btn('Skip', () => finishGuide(), { cls: 'small' }));
  layer.append(hole, say); S.root.append(layer);
  const place = () => {
    if (!layer.isConnected) return; const R = S.root.getBoundingClientRect(), r = target.getBoundingClientRect();
    const sock = st.sock && S.root.querySelector(`.lf-socket[data-sock="${st.sock}"]`);
    let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
    if (sock) { const q = sock.getBoundingClientRect(); x0 = Math.min(x0, q.left); y0 = Math.min(y0, q.top); x1 = Math.max(x1, q.right); y1 = Math.max(y1, q.bottom); }
    Object.assign(hole.style, { left: x0 - R.left - 4 + S.root.scrollLeft + 'px', top: y0 - R.top - 4 + S.root.scrollTop + 'px', width: x1 - x0 + 8 + 'px', height: y1 - y0 + 8 + 'px' });
    const below = y1 - R.top + 10 + S.root.scrollTop; say.style.left = Math.max(4, Math.min(x0 - R.left, R.width - 330)) + 'px'; say.style.top = (below + 60 > S.root.scrollHeight ? Math.max(4, y0 - R.top - 56 + S.root.scrollTop) : below) + 'px';
  };
  requestAnimationFrame(place);
}
export function skipGuide() { if (S?.guide) finishGuide(); }

// ----- tooltip cards
function strandCard(D, kind, id, H) {
  const s = kind === 'flames' ? D.flames.byId[id] : kind === 'shapes' ? D.shapes.byId[id] : kind === 'charms' ? D.charms.byId[id] : KNOT_TRIGGERS.find(t => t.id === id);
  if (!s) return null;
  const lines = [];
  if (kind === 'flames') { lines.push(`Base power ${fmt(s.power)} · oil ×${fmt(s.oilMult)}`); const st = D.statuses?.byId?.[s.status]; if (st) lines.push(`${st.name}: ${statusText(st)}`); lines.push((FLAME_TERRAIN[id] || []).join(' · ')); if (H?.burn) lines.push(`Burn-in level ${burnLevel(H.burn.flame?.[id] || 0)} (${hp(H.burn.flame?.[id] || 0)} oil)`); }
  if (kind === 'shapes') { lines.push(`Power ×${fmt(s.mult)} · oil ${fmt(s.oil)}${s.perSecond ? '/s' : ''} · cooldown ${secs(s.cooldown)}`); if (H?.burn) lines.push(`Burn-in level ${burnLevel(H.burn.shape?.[id] || 0)} (${hp(H.burn.shape?.[id] || 0)} oil)`); }
  if (kind === 'charms') { const bits = []; for (const [k, n] of [['dmg', 'power'], ['oil', 'oil'], ['cd', 'cooldown'], ['speed', 'speed'], ['size', 'size']]) if (s[k] != null && s[k] !== 1) bits.push(`${n} ×${fmt(s[k])}`); if (bits.length) lines.push(bits.join(' · ')); if (s.notOn?.length) lines.push(`Cannot go on: ${s.notOn.join(', ')}`); const ch = Object.entries(CHANGED[id] || {}); if (ch.length) lines.push(`Means something different on: ${ch.map(([k]) => k).join(', ')}`); }
  return el('div', { class: 'lf-card' }, el('div', { class: 'card-name', style: { color: s.color || '#e6c27a' }, text: s.name }), el('div', { class: 'card-sub', text: cap(kind.replace(/s$/, '')) }),
    el('div', { class: 'card-line', text: s.desc || '' }), ...lines.filter(Boolean).map(t => el('div', { class: 'card-line dim', text: t })));
}
export function wickCard(w, D, H) {
  const p = compileWick(w, D, H?.stats || {}, { burn: H?.burn });
  return el('div', { class: 'lf-card', style: { borderColor: p.color } }, el('div', { class: 'card-name', style: { color: p.color }, text: wickName(w, D) }),
    el('div', { class: 'card-sub', text: `${cap(w.flame)} · ${cap(w.shape)}${w.charms?.length ? ' · ' + w.charms.map(cap).join(', ') : ''}` }),
    el('div', { class: 'card-line', text: `${fmt(p.damage)} damage · ${fmt(p.oil)} oil · ${secs(p.cooldown)} cooldown` }),
    el('div', { class: 'card-line', text: `${fmt(p.dps)} DPS · ${fmt(p.perOil)} damage per oil` }),
    el('div', { class: 'card-line dim', text: wickCode(w) }));
}
