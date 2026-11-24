// Class trees: one tab per class the hero has taken, plus "All classes" (every class, what it needs, its tree to read).
// A tree runs left to right by the class level each node opens at: spells (their medallion), passives, training and
// spell modifiers (linked to the spell they change), with rank pips, "choose one" groups and the class's two paths as
// their own rows. Choosing a node shows what it does (the one tooltip card) and Buy rank — or why not, written on it.
//
//   app.openWindow('classes', { cls }) → .win-classes  (.cls-node[data-node], [data-act="buy"], .cls-path [data-act="path"])
import { openWin, esc } from './kit.js';
import { tipAttrs, tipCard } from './tip.js';
import { glyph, spellIcon } from './icons.js';
import { classDef, classIds, classRules, maxClassLevel, nodeKey, nodeMaxRank, nodeRefusal, nodeName, pointsLeft, classRefusal } from '../../rules/classes.js';
import { describeNode, describeClass, describeRequires } from '../../rules/describe.js';
import { attrTotals } from '../../rules/sheet.js';
import { fmt } from '../../../../../shared/format.js';

const KIND = { spell: 'Spell', passive: 'Passive', prof: 'Training', mod: 'Modifier' };
const TIER = { base: 'Base classes', advanced: 'Advanced classes', specialty: 'Specialty classes' };

export function nodeIcon(node, cls, size = 40) {
  if (node.kind === 'spell') return spellIcon(node.spell, size, { cls });
  return `<span class="cls-glyph is-${node.kind}">${glyph({ passive: 'star', prof: 'shield', mod: 'enchant' }[node.kind] || 'star', size * 0.6)}</span>`;
}

export function open(app, opts = {}) {
  const c = app.me?.char;
  const owned = c ? (c.classOrder || Object.keys(c.classLevels || {})) : [];
  const tabs = () => [...(app.me?.char?.classOrder || owned).map(k => ({ id: k, label: classDef(app.rules, k)?.name || 'Class', badge: pointsLeft(app.rules, app.me.char, k) > 0 ? fmt(pointsLeft(app.rules, app.me.char, k)) : '' })), { id: 'all', label: 'All classes' }];
  const w = openWin({
    id: 'classes', title: 'Classes', size: 'wide', cls: 'win-classes', tabs: tabs(), tab: opts.cls && owned.includes(opts.cls) ? opts.cls : (owned[0] || 'all'),
    render: (body, tab, w) => { w.tabs = tabs(); return render(app, body, tab, w); },
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
  return tree(app, c, tab === 'all' ? w.data.view : tab, w, tab === 'all');
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

function tree(app, c, cls, w, readOnly) {
  const rules = app.rules, d = classDef(rules, cls);
  if (!d) return '<p class="ow-empty">Choose a class.</p>';
  const lvl = c.classLevels?.[cls] || 0, max = maxClassLevel(rules, cls), R = classRules(rules);
  const left = lvl ? pointsLeft(rules, c, cls) : 0;
  const path = c.paths?.[cls] || null;
  const rows = [{ id: null, name: 'Core' }, ...Object.entries(d.paths || {}).map(([id, p]) => ({ id, name: p.name, blurb: p.blurb }))];
  const cols = [...new Set(d.nodes.map(n => n.level))].sort((a, b) => a - b);
  const sel = w.data.sel?.cls === cls ? w.data.sel.id : null;
  const tile = n => {
    const have = c.nodes?.[nodeKey(cls, n.id)] || 0, mx = nodeMaxRank(rules, n);
    const why = lvl && have < mx ? nodeRefusal(rules, c, cls, n.id) : null;
    const state = have >= mx ? 'is-max' : have ? 'is-have' : !lvl || why ? 'is-locked' : 'is-open';
    const target = n.kind === 'mod' ? d.nodes.find(x => x.id === n.on) : null;
    return `<button type="button" class="cls-node ${state}${sel === n.id ? ' is-sel' : ''}${n.choice ? ' is-choice' : ''}" data-node="${esc(n.id)}" ${tipAttrs('node', { cls, id: n.id })}>
      ${nodeIcon(n, cls, 40)}<span class="cls-node-name">${esc(nodeName(rules, n))}</span>
      <span class="cls-pips">${Array.from({ length: mx }, (_, i) => `<i class="${i < have ? 'on' : ''}"></i>`).join('')}</span>
      ${target ? `<span class="cls-on">${glyph('next', 12)}${esc(nodeName(rules, target))}</span>` : ''}${n.choice ? '<span class="cls-choice">Choose one</span>' : ''}</button>`;
  };
  const grid = rows.map(r => {
    const inRow = d.nodes.filter(n => (n.path || null) === r.id);
    if (!inRow.length) return '';
    const dim = r.id && path && path !== r.id ? ' is-other' : '';
    return `<div class="cls-row${dim}"><div class="cls-row-name"><b>${esc(r.name)}</b>${r.id && path === r.id ? '<small class="ow-good">Your path</small>' : r.id ? `<small class="ow-dim">Path at level ${fmt(R.pathLevel)}</small>` : ''}</div>
      ${cols.map(L => `<div class="cls-cell${L > lvl ? ' is-ahead' : ''}">${inRow.filter(n => n.level === L).map(tile).join('')}</div>`).join('')}</div>`;
  }).join('');
  const head = `<div class="cls-head ow-card"><div><h3>${esc(d.name)}</h3><small class="ow-dim">${esc(d.role)} · level ${fmt(lvl)} of ${fmt(max)}${readOnly && !lvl ? ' · not taken yet' : ''}</small></div>
    ${lvl ? `<span class="cls-points ${left ? 'has' : ''}">${fmt(left)} ${esc(d.name)} point${left === 1 ? '' : 's'} left</span>` : ''}
    ${readOnly ? '<button type="button" class="ow-btn ow-ghost ow-small" data-act="back">' + glyph('back', 16) + 'All classes</button>' : ''}</div>`;
  const pathPick = lvl >= R.pathLevel && d.paths && !path ? `<div class="cls-paths"><p><b>Choose your ${esc(d.name)} path.</b> <span class="ow-dim">It opens that row of the tree; a shrine can change it later.</span></p>${Object.entries(d.paths).map(([id, p]) => `<div class="cls-path ow-card"><b>${esc(p.name)}</b><p class="ow-dim">${esc(p.blurb || '')}</p><button type="button" class="ow-btn ow-primary ow-small" data-act="path" data-path="${esc(id)}">Walk the ${esc(p.name)} path</button></div>`).join('')}</div>` : '';
  const levels = `<div class="cls-row cls-levels"><div class="cls-row-name"><small class="ow-dim">${esc(d.name)} level</small></div>${cols.map(L => `<div class="cls-cell"><span class="cls-lvl${L <= lvl ? ' reached' : ''}">${fmt(L)}</span></div>`).join('')}</div>`;
  let detail = '';
  if (sel) {
    const n = d.nodes.find(x => x.id === sel);
    if (n) {
      const have = c.nodes?.[nodeKey(cls, n.id)] || 0, mx = nodeMaxRank(rules, n);
      const why = have >= mx ? null : nodeRefusal(rules, c, cls, n.id);
      const model = describeNode(rules, c, cls, n.id);
      detail = `<div class="cls-detail ow-card">${tipCard(model)}<div class="cls-detail-acts">${have >= mx ? '<span class="ow-good">Highest rank</span>' : readOnly && !lvl ? '<span class="ow-dim">Take this class at a level up to learn it.</span>' : why ? `<p class="cls-why">${esc(why)}</p>` : `<button type="button" class="ow-btn ow-primary" data-act="buy" data-node="${esc(n.id)}" data-primary>${glyph('plus', 18)}${have ? `Rank ${fmt(have + 1)}` : 'Learn'} (${fmt(n.free && !have ? 0 : n.cost || 1)} point${(n.cost || 1) === 1 ? '' : 's'})</button>`}</div></div>`;
    }
  }
  return `${head}${pathPick}<div class="cls-tree" role="group" aria-label="${esc(d.name)} tree">${levels}${grid}</div>${detail}<p class="ow-dim cls-blurb">${esc(d.blurb || '')}</p>`;
}

function wire(app, el, w) {
  el.innerHTML = `<button type="button" class="ow-btn" data-act="talents">${glyph('star', 18)}Talents</button><button type="button" class="ow-btn" data-act="spellbook">${glyph('scroll', 18)}Spellbook</button>`;
  for (const k of ['talents', 'spellbook']) el.querySelector(`[data-act="${k}"]`).onclick = () => { w.close(); app.openWindow(k); };
  const cls = w.tab === 'all' ? w.data.view : w.tab;
  w.body.querySelectorAll('[data-view]').forEach(b => { b.onclick = () => { w.data.view = b.dataset.view; w.data.sel = null; w.render(); }; });
  w.body.querySelector('[data-act="back"]')?.addEventListener('click', () => { w.data.view = null; w.data.sel = null; w.render(); });
  w.body.querySelectorAll('.cls-node').forEach(b => { b.onclick = () => { w.data.sel = w.data.sel?.id === b.dataset.node && w.data.sel?.cls === cls ? null : { cls, id: b.dataset.node }; w.render(); w.body.querySelector('.cls-detail')?.scrollIntoView({ block: 'nearest' }); }; });
  w.body.querySelector('[data-act="buy"]')?.addEventListener('click', e => { app.act('node', { cls, node: e.currentTarget.dataset.node }); app.sfx('ui.click'); });
  w.body.querySelectorAll('[data-act="path"]').forEach(b => { b.onclick = () => app.act('path', { cls, path: b.dataset.path }); });
}

export { describeClass };
