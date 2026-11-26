// LEVEL UP (owner: "every level up you pick a class"). Step 1: choose the class to put the level into — any class you
// already have, a new base class, or an advanced / specialty class whose requirements you meet (the ones you don't
// say what is missing on their card). Step 2: its points on its tree,
// and the attribute point every even level gives, with the result previewed (health, mana, stamina, new spells)
// before Confirm. Look first, then spend (2026-11-25, #128): picking a node opens its full card under it with a
// separate "Spend a point"; picking an attribute shows what it gives. The preview runs the rules' own levelUp on a copy of the character, so what you see is what you get.
//
//   app.openWindow('levelup') → .win-levelup  (step 1: .lu-class[data-cls]; step 2: .lu-node[data-node], .lu-attr[data-attr], [data-act="confirm"])
import { openWin, esc } from './kit.js';
import { tipAttrs, tipCard, describeAttr } from './tip.js';
import { glyph } from './icons.js';
import { nodeIcon } from './win-classes.js';
import { classDef, classIds, classRefusal, classRules, nodeKey, nodeMaxRank, nodeRefusal, nodeName, pointsLeft, spellSources } from '../../rules/classes.js';
import { levelUp, levelRefusal, xpToReach, levelCap } from '../../rules/levels.js';
import { ATTRS } from '../../rules/attributes.js';
import { sheetOf, attrTotals } from '../../rules/sheet.js';
import { describeRequires, describeNode } from '../../rules/describe.js';
import { fmt, sign, hp } from '../../../../../shared/format.js';

const TIER = { base: 'Base classes', advanced: 'Advanced classes', specialty: 'Specialty classes' };

export function open(app) {
  const w = openWin({ id: 'levelup', title: 'Level up', size: 'wide', cls: 'win-levelup', render: (body, tab, w) => render(app, body, w), foot: (el, w) => foot(app, el, w) });
  w.data.pick = w.data.pick || null;
  if (w._on) return w;
  w._on = true;
  const offs = [
    app.on('me', () => { if (!w.open) { w._on = false; return offs.forEach(f => f()); } if (!w.data.sent) w.render(); }),
    app.on('leveled', () => { if (!w.open) return; w.data = { pick: null }; if ((app.me?.pending || 0) <= 0) w.close(); else w.render(); }),
    app.on('err', () => { if (w.open && w.data.sent) { w.data.sent = false; w.render(); } }),
  ];
  return w;
}

/** Run the rules' levelUp on a copy: { ok, why, char (after), gained }. */
function preview(app, sel) {
  const c = structuredClone(app.me.char);
  const r = levelUp(app.rules, c, { cls: sel.cls, spend: sel.spend || [], attr: sel.attr || null, flags: app.me.flags || [] });
  return { ...r, char: c };
}

function render(app, body, w) {
  const c = app.me?.char;
  if (!c) return '<p class="ow-empty">Your character is still on the way.</p>';
  const rules = app.rules, pending = app.me.pending || 0;
  if (pending <= 0) {
    const cap = levelCap(rules);
    return `<div class="lu-none ow-card"><h3>No level waiting</h3><p class="ow-dim">${c.level >= cap ? `Level ${fmt(cap)} is as high as anyone can go for now.` : `${fmt(xpToReach(rules, c.level + 1) - c.xp)} more experience for level ${fmt(c.level + 1)}.`}</p></div>`;
  }
  return w.data.pick ? step2(app, c, w) : step1(app, c);
}

function step1(app, c) {
  const rules = app.rules, flags = app.me.flags || [], attrs = attrTotals(rules, c);
  const card = k => {
    const d = classDef(rules, k), lvl = c.classLevels?.[k] || 0;
    const why = levelRefusal(rules, c, k, { flags }) && classRefusal(rules, c, k, { flags, attrs });
    return `<button type="button" class="lu-class ${why ? 'is-locked' : ''}" data-cls="${esc(k)}" ${tipAttrs('class', { cls: k })} ${why ? 'aria-disabled="true"' : ''}>
      <b>${esc(d.name)}</b><small>${esc(d.role)}</small>
      <span class="lu-lvl">${lvl ? `Level ${fmt(lvl)} → ${fmt(lvl + 1)}` : 'New class · level 1'}</span>
      ${why ? `<span class="cls-why">${esc(why)}</span>` : `<span class="lu-gain">${sign(d.growth?.hp || 0, { decimals: 0 })} health · ${sign(d.growth?.mp || 0, { decimals: 0 })} mana · ${fmt(classRules(rules).pointsPerLevel)} points</span>`}</button>`;
  };
  const mine = (c.classOrder || []).filter(k => classDef(rules, k));
  const by = {};
  for (const k of classIds(rules)) { const d = classDef(rules, k); if (d.round > 1 || mine.includes(k)) continue; (by[d.tier] = by[d.tier] || []).push(k); }
  const sortOpen = list => [...list].sort((a, b) => (classRefusal(rules, c, a, { flags, attrs }) ? 1 : 0) - (classRefusal(rules, c, b, { flags, attrs }) ? 1 : 0));
  return `<p class="lu-intro"><b>Level ${fmt(c.level + 1)}.</b> <span class="ow-dim">Put it into a class you have, or take up a new one — mix as many as you like.</span></p>
    ${mine.length ? `<section class="ow-section"><h3>Your classes</h3><div class="lu-classes">${mine.map(card).join('')}</div></section>` : ''}
    ${Object.entries(TIER).filter(([t]) => by[t]).map(([t, name]) => `<section class="ow-section"><h3>${esc(name)}</h3><div class="lu-classes">${sortOpen(by[t]).map(card).join('')}</div></section>`).join('')}`;
}

function step2(app, c, w) {
  const rules = app.rules, sel = w.data.pick, d = classDef(rules, sel.cls);
  const base = preview(app, { cls: sel.cls });
  if (!base.ok) return `<p class="cls-why">${esc(base.why)}</p>`;
  const R = classRules(rules);
  const full = preview(app, sel);
  const after = full.ok ? full.char : base.char;
  // the spends so far, on top of the level — so "can I buy the next one" reads that state
  const pathed = preview(app, { cls: sel.cls, spend: sel.spend });
  const now = pathed.ok ? pathed.char : base.char;
  const left = pointsLeft(rules, now, sel.cls);
  const lvl = now.classLevels[sel.cls];
  const sb = sheetOf(rules, c), sa = sheetOf(rules, after);
  const newSpells = Object.keys(spellSources(rules, after)).filter(id => !spellSources(rules, c)[id]);
  const delta = (label, a, b) => (b !== a ? `<div class="lu-delta"><span>${esc(label)}</span><b>${hp(a)} → ${hp(b)}</b><em class="${b > a ? 'ow-good' : 'ow-bad'}">${sign(b - a, { decimals: 0 })}</em></div>` : '');
  // READ BEFORE YOU SPEND (owner 2026-11-25, live report #128: "cannot click skills when leveling up so I have no idea
  // what they do"): a tap / click / the pad's A on a node only picks it; its full card (the one tooltip card,
  // describe.js describeNode on the character as it would be) opens right under it with "Spend a point" — the same
  // look-then-commit the shop uses. Nothing is spent by picking.
  const look = w.data.look?.cls === sel.cls ? w.data.look.id : null;
  const nodes = d.nodes.filter(n => n.level <= lvl).map(n => {
    const have = now.nodes?.[nodeKey(sel.cls, n.id)] || 0, mx = nodeMaxRank(rules, n);
    const added = (sel.spend || []).filter(x => x === n.id).length;
    const why = have < mx ? nodeRefusal(rules, now, sel.cls, n.id) : null;
    const row = `<button type="button" class="lu-node ${added ? 'is-added' : ''} ${why && !added ? 'is-locked' : ''} ${look === n.id ? 'is-sel' : ''}" data-node="${esc(n.id)}" aria-expanded="${look === n.id}">
      ${nodeIcon(n, sel.cls, 34)}<span class="lu-node-text"><b>${esc(nodeName(rules, n))}</b><small>${added ? 'Learning now' : have >= mx ? 'Learned' : why ? 'Not yet' : 'Open'}</small>
      ${why && have < mx && !added ? `<small class="lu-why">${esc(why)}</small>` : ''}</span>${glyph(look === n.id ? 'up' : 'down', 18)}</button>`;
    if (look !== n.id) return row;
    const cost = n.free && !have ? 0 : n.cost || 1;
    const model = describeNode(rules, now, sel.cls, n.id);
    const spend = have >= mx ? '<span class="ow-good">Highest rank</span>'
      : why ? ((model.needs || []).includes(why) || JSON.stringify(model.next || '').includes(why) ? '' : `<p class="lu-why">${esc(why)}</p>`)   // said once: the card already says it
      : `<button type="button" class="ow-btn ow-primary" data-act="spend" data-node="${esc(n.id)}">${glyph('plus', 18)}${cost === 1 ? 'Spend a point' : cost === 0 ? 'Learn (free)' : `Spend ${fmt(cost)} points`}</button>`;
    const undo = added ? `<button type="button" class="ow-btn ow-ghost" data-act="unspend" data-node="${esc(n.id)}">${glyph('minus', 18)}Take a point back</button>` : '';
    return `${row}<div class="lu-detail ow-card">${tipCard(model)}<div class="lu-detail-acts">${undo}${spend}</div></div>`;
  }).join('');
  const attrs = base.gained.attrPoint ? `<section class="ow-section"><h3>Attribute point <span class="ow-dim">(every even level)</span></h3><div class="lu-attrs">${ATTRS.map(k => `<button type="button" class="lu-attr ${sel.attr === k ? 'is-sel' : ''}" data-attr="${k}"><small>${esc(rules.data.attributes.names[k])}</small><b>${fmt(sb.attrs[k].total)}${sel.attr === k ? ' → ' + fmt(sb.attrs[k].total + 1) : ''}</b></button>`).join('')}</div>
    ${sel.attr ? `<div class="lu-detail ow-card">${tipCard(describeAttr(rules, after, sel.attr))}</div>` : '<p class="ow-dim lu-tip">Tap one to see what it gives; you can change your mind until you confirm.</p>'}</section>` : '';
  return `<div class="lu-step2">
    <div class="lu-head ow-card"><div><h3>${esc(d.name)} ${fmt(lvl)}</h3><small class="ow-dim">Character level ${fmt(c.level)} → ${fmt(c.level + 1)}</small>${d.blurb ? `<p class="lu-blurb">${esc(d.blurb)}</p>` : ''}</div>
      <button type="button" class="ow-btn ow-ghost ow-small" data-act="back">${glyph('back', 16)}Another class</button></div>
    <section class="ow-section"><h3>${esc(d.name)} points <span class="lu-left ${left ? 'has' : ''}">${fmt(left)} left</span></h3><p class="ow-dim lu-tip">Tap one to read what it does, then spend. Points left over stay for later (the Classes window).</p><div class="lu-nodes">${nodes || '<p class="ow-dim">Nothing to buy at this level.</p>'}</div></section>
    ${attrs}
    <section class="ow-section lu-preview"><h3>After this level</h3>
      ${delta('Health', sb.maxHp, sa.maxHp)}${delta('Mana', sb.maxMp, sa.maxMp)}${delta('Stamina', sb.maxStamina, sa.maxStamina)}
      ${newSpells.length ? `<div class="lu-delta"><span>New spells</span><b>${esc(newSpells.map(id => rules.spells[id]?.base?.name || 'Spell').join(', '))}</b></div>` : ''}
      ${base.gained.talentPoint ? '<div class="lu-delta"><span>Talent point</span><b>+1</b></div>' : ''}
      ${!full.ok ? `<p class="cls-why">${esc(full.why)}</p>` : ''}</section></div>`;
}

function foot(app, el, w) {
  const sel = w.data.pick;
  const pending = app.me?.pending || 0;
  let ok = false, why = '';
  if (sel && pending > 0) {
    const d = classDef(app.rules, sel.cls);
    const base = preview(app, { cls: sel.cls });
    const full = preview(app, sel);
    ok = full.ok;
    why = full.ok ? '' : full.why;
    if (ok && base.gained?.attrPoint && !sel.attr) { ok = false; why = 'Choose where your attribute point goes.'; }
  }
  el.innerHTML = sel ? `${why ? `<span class="lu-foot-why">${esc(why)}</span>` : ''}<button type="button" class="ow-btn ow-primary" data-act="confirm" ${ok && !w.data.sent ? '' : 'disabled'} data-primary>${glyph('check', 18)}${w.data.sent ? 'Levelling…' : `Take ${esc(classDef(app.rules, sel.cls).name)} level ${fmt((app.me.char.classLevels?.[sel.cls] || 0) + 1)}`}</button>`
    : `<button type="button" class="ow-btn ow-ghost" data-act="close">Later</button>`;
  el.querySelector('[data-act="close"]')?.addEventListener('click', () => w.close());
  el.querySelector('[data-act="confirm"]')?.addEventListener('click', () => {
    if (!ok) return;
    w.data.sent = true;
    app.act('levelup', { cls: sel.cls, spend: sel.spend || [], attr: sel.attr || undefined });
    app.sfx('levelup');
    w.render();
  });
  const B = w.body;
  B.querySelectorAll('.lu-class').forEach(b => { b.onclick = () => { if (b.getAttribute('aria-disabled')) return; w.data.pick = { cls: b.dataset.cls, spend: [], attr: null }; w.data.look = null; w.render(); }; });
  B.querySelector('[data-act="back"]')?.addEventListener('click', () => { w.data.pick = null; w.data.look = null; w.render(); });
  // pick a node to read it (again to close it); its card opens under it with the spend button
  B.querySelectorAll('.lu-node').forEach(b => { b.onclick = () => {
    const open = w.data.look?.cls === sel.cls && w.data.look.id === b.dataset.node;
    w.data.look = open ? null : { cls: sel.cls, id: b.dataset.node };
    w.render();
    if (!open) w.body.querySelector('.lu-detail')?.scrollIntoView({ block: 'nearest' });
  }; });
  B.querySelectorAll('[data-act="spend"]').forEach(b => { b.onclick = () => { sel.spend = [...(sel.spend || []), b.dataset.node]; w.render(); }; });
  B.querySelectorAll('[data-act="unspend"]').forEach(b => { b.onclick = () => { const i = sel.spend.lastIndexOf(b.dataset.node); if (i >= 0) sel.spend.splice(i, 1); w.render(); }; });
  B.querySelectorAll('.lu-attr').forEach(b => { b.onclick = () => { sel.attr = sel.attr === b.dataset.attr ? null : b.dataset.attr; w.render(); }; });
}

export { describeRequires };
