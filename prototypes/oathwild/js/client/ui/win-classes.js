// Class trees: one tab per class the hero has taken, plus "All classes" (every class, what it needs, its tree to read).
// A tree is one row per class level, top to bottom (owner 2026-11-26: no paths, every node one rank, several choices a
// level): spells (their medallion), spell ranks II / III ("after Cleave"), passives, training, modifiers ("after" the
// spell they change), "choose one" capstones. Choosing a node opens its card right under its row with Learn — or why
// not, written on it.
//
//   app.openWindow('classes', { cls }) → .win-classes  (.cls-node[data-node], [data-act="buy"])
import { openWin, esc } from './kit.js';
import { tipAttrs, tipCard } from './tip.js';
import { glyph, spellIcon, passiveIcon } from './icons.js';
import { classDef, classIds, maxClassLevel, nodeKey, nodeNeeds, nodeRefusal, nodeName, pointsLeft, classRefusal } from '../../rules/classes.js';
import { describeNode, describeClass, describeRequires } from '../../rules/describe.js';
import { attrTotals } from '../../rules/sheet.js';
import { fmt } from '../../../../../shared/format.js';

const KIND = { spell: 'Spell', passive: 'Passive', prof: 'Training', mod: 'Modifier' };
const TIER = { base: 'Base classes', advanced: 'Advanced classes', specialty: 'Specialty classes' };

const KINDS = ['dagger', 'sword', 'axe', 'mace', 'spear', 'staff', 'twohand', 'bow', 'crossbow', 'wand', 'scepter'];
export function nodeIcon(node, cls, size = 40) {
  if (node.kind === 'spell') return spellIcon(node.spell, size, { cls });
  // a training shows its own weapon / armour; a weapon mastery shows that weapon on a passive medallion
  const mastery = node.kind === 'passive' && KINDS.find(k => node.mods?.[`${k}Pct`]);
  const id = node.kind === 'prof' ? (node.grants?.[0] === 'twohand' ? 'twohand' : node.grants?.[0]) : mastery || { passive: 'star', mod: 'enchant' }[node.kind] || 'star';
  // with the Icon Kit: every node that is never pressed (passive, training, modifier) has the kit's passive look —
  // no frame, a soft faded edge, like a buff (owner 2026-11-27); a modifier shows the spell it changes
  const kitPic = passiveIcon({ name: node.name || '', spell: node.kind === 'mod' ? node.on : null, train: node.kind === 'prof' || mastery ? id : null, cls, size });
  if (kitPic) return kitPic;
  return `<span class="cls-glyph is-${node.kind}${mastery ? ' is-mastery' : ''}">${glyph(id, size * 0.6) || glyph('shield', size * 0.6)}</span>`;
}

export function open(app, opts = {}) {
  const c = app.me?.char;
  const owned = c ? (c.classOrder || Object.keys(c.classLevels || {})) : [];
  const tabs = () => [...(app.me?.char?.classOrder || owned).map(k => ({ id: k, label: classDef(app.rules, k)?.name || 'Class', badge: pointsLeft(app.rules, app.me.char, k) > 0 ? fmt(pointsLeft(app.rules, app.me.char, k)) : '' })), { id: 'all', label: 'All classes' }];
  const w = openWin({
    id: 'classes', title: 'Classes', size: 'wide', cls: 'win-classes', tabs, tab: opts.cls && owned.includes(opts.cls) ? opts.cls : (owned[0] || 'all'),
    render: (body, tab, w) => render(app, body, tab, w),   // (tabs is a function: kit.js redraws the points-left badges first)
    foot: (el, w) => wire(app, el, w),
  });
  if (opts.cls && !owned.includes(opts.cls)) { w.tab = 'all'; w.data.view = opts.cls; w.render(); }
  if (!w._on) { w._on = true; w.follow(app, 'me', () => JSON.stringify(app.me)); }   // only when my character changed (the server refreshes every 2 s)
  return w;
}

function render(app, body, tab, w) {
  const c = app.me?.char;
  if (!c) return '<p class="ow-empty">Your character is still on the way.</p>';
  if (tab === 'all' && !w.data.view) return browse(app, c);
  const cls = tab === 'all' ? w.data.view : tab;
  return treeHtml(app, c, cls, { sel: w.data.sel?.cls === cls ? w.data.sel.id : null, readOnly: tab === 'all' });
}

function browse(app, c) {
  const rules = app.rules, flags = app.me.flags || [], attrs = attrTotals(rules, c);
  const by = {};
  for (const k of classIds(rules)) { const d = classDef(rules, k); if (d.round > 1) continue; (by[d.tier] = by[d.tier] || []).push(k); }
  return Object.entries(TIER).filter(([t]) => by[t]).map(([t, name]) => `<section class="ow-section"><h3>${esc(name)}</h3><div class="cls-browse">${by[t].map(k => {
    const d = classDef(rules, k), lvl = c.classLevels?.[k] || 0, why = classRefusal(rules, c, k, { flags, attrs });
    return `<button type="button" class="cls-card ${why ? 'is-locked' : ''}" data-view="${esc(k)}" ${tipAttrs('class', { cls: k })}>
      <b>${esc(d.name)}</b><small>${esc(d.role)}${lvl ? ` · you have level ${fmt(lvl)}` : ''}</small>
      ${d.requires && !lvl ? `<span class="cls-req">Needs ${esc(describeRequires(rules, d.requires))}</span>` : ''}
      ${why && !lvl ? `<span class="cls-why">${esc(why)}</span>` : (!lvl ? '<span class="ow-good cls-open">You can take it at your next level</span>' : '')}</button>`;
  }).join('')}</div></section>`).join('');
}

/**
 * One class's tree as HTML — the Classes window's tab, and the creator's class step (`preview: true`: a would-be hero
 * at class level 1, no head, the detail says when each node opens instead of offering to buy it).
 * opts: { sel: node id shown in the detail card, readOnly, preview, head = !preview }
 */
export function treeHtml(app, c, cls, { sel = null, readOnly = false, preview = false, head: withHead = !preview } = {}) {
  const rules = app.rules, d = classDef(rules, cls);
  if (!d) return '<p class="ow-empty">Choose a class.</p>';
  const lvl = c.classLevels?.[cls] || 0, max = maxClassLevel(rules, cls);
  const left = lvl ? pointsLeft(rules, c, cls) : 0;
  const tile = n => {
    const have = c.nodes?.[nodeKey(cls, n.id)] || 0;
    const why = lvl && !have ? nodeRefusal(rules, c, cls, n.id) : null;
    const state = have ? 'is-have' : !lvl || why ? 'is-locked' : 'is-open';
    // what it builds on: a rank's earlier rank, a modifier's spell, a mastery's training (owner 2026-11-26: "multiple
    // ranks appear in higher level as separate icons to unlock that require the predecessor")
    const after = nodeNeeds(n).map(id => nodeName(rules, d.nodes.find(x => x.id === id))).filter(Boolean);
    return `<button type="button" class="cls-node ${state}${sel === n.id ? ' is-sel' : ''}${n.choice ? ' is-choice' : ''}${n.rank > 1 ? ' is-rank' : ''}" data-node="${esc(n.id)}" ${tipAttrs('node', { cls, id: n.id })}>
      ${nodeIcon(n, cls, 40)}${n.rank > 1 ? `<span class="cls-rank">${n.rank === 2 ? 'II' : 'III'}</span>` : ''}<span class="cls-node-name">${esc(nodeName(rules, n))}</span>
      ${after.length ? `<span class="cls-on">${glyph('next', 12)}after ${esc(after.join(', '))}</span>` : ''}${n.free ? '<span class="cls-free">Free</span>' : ''}${n.choice ? '<span class="cls-choice">Choose one</span>' : ''}${have ? `<span class="cls-got">${glyph('check', 14)}</span>` : ''}</button>`;
  };
  let detail = '';
  if (sel) {
    const n = d.nodes.find(x => x.id === sel);
    if (n) {
      const have = c.nodes?.[nodeKey(cls, n.id)] || 0;
      const why = have ? null : nodeRefusal(rules, c, cls, n.id);
      const model = describeNode(rules, c, cls, n.id);
      detail = `<div class="cls-detail ow-card">${tipCard(model)}<div class="cls-detail-acts">${preview ? (have ? '<span class="ow-good">You start with this</span>' : `<span class="ow-dim">Opens at ${esc(d.name)} level ${fmt(n.level)}</span>`) : have ? '<span class="ow-good">Learned</span>' : readOnly && !lvl ? '<span class="ow-dim">Take this class at a level up to learn it.</span>' : why ? `<p class="cls-why">${esc(why)}</p>` : `<button type="button" class="ow-btn ow-primary" data-act="buy" data-node="${esc(n.id)}" data-primary>${glyph('plus', 18)}Learn (${fmt(n.cost || 1)} point${(n.cost || 1) === 1 ? '' : 's'})</button>`}</div></div>`;
    }
  }
  // one row per class level, top to bottom (a phone scrolls down, never sideways); the picked node's card opens
  // right under its own row
  const levels = [...new Set(d.nodes.map(n => n.level))].sort((a, b) => a - b);
  const rows = levels.map(L => {
    const here = d.nodes.filter(n => n.level === L);
    const hasSel = sel && here.some(n => n.id === sel);
    return `<div class="cls-tier${L > lvl ? ' is-ahead' : ''}"><span class="cls-lvl${L <= lvl ? ' reached' : ''}" aria-label="${esc(d.name)} level ${fmt(L)}">${fmt(L)}</span><div class="cls-tier-nodes">${here.map(tile).join('')}</div></div>${hasSel ? detail : ''}`;
  }).join('');
  const head = `<div class="cls-head ow-card"><div><h3>${esc(d.name)}</h3><small class="ow-dim">${esc(d.role)} · level ${fmt(lvl)} of ${fmt(max)}${readOnly && !lvl ? ' · not taken yet' : ''}</small></div>
    ${lvl ? `<span class="cls-points ${left ? 'has' : ''}">${fmt(left)} ${esc(d.name)} point${left === 1 ? '' : 's'} left</span>` : ''}
    ${readOnly ? '<button type="button" class="ow-btn ow-ghost ow-small" data-act="back">' + glyph('back', 16) + 'All classes</button>' : ''}</div>`;
  return `${withHead ? head : ''}<div class="cls-tree" role="group" aria-label="${esc(d.name)} tree">${rows}</div>${preview ? '' : `<p class="ow-dim cls-blurb">${esc(d.blurb || '')}</p>`}`;
}

function wire(app, el, w) {
  el.innerHTML = `<button type="button" class="ow-btn" data-act="talents">${glyph('star', 18)}Talents</button><button type="button" class="ow-btn" data-act="spellbook">${glyph('scroll', 18)}Spellbook</button>`;
  for (const k of ['talents', 'spellbook']) el.querySelector(`[data-act="${k}"]`).onclick = () => { w.close(); app.openWindow(k); };
  const cls = w.tab === 'all' ? w.data.view : w.tab;
  w.body.querySelectorAll('[data-view]').forEach(b => { b.onclick = () => { w.data.view = b.dataset.view; w.data.sel = null; w.render(); }; });
  w.body.querySelector('[data-act="back"]')?.addEventListener('click', () => { w.data.view = null; w.data.sel = null; w.render(); });
  w.body.querySelectorAll('.cls-node').forEach(b => { b.onclick = () => { w.data.sel = w.data.sel?.id === b.dataset.node && w.data.sel?.cls === cls ? null : { cls, id: b.dataset.node }; w.render(); w.body.querySelector('.cls-detail')?.scrollIntoView({ block: 'nearest' }); }; });
  w.body.querySelector('[data-act="buy"]')?.addEventListener('click', e => { app.act('node', { cls, node: e.currentTarget.dataset.node }); app.sfx('ui.click'); });
}

export { describeClass };
