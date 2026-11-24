// THE tooltip renderer (owner 2026-11-23: tooltips "must be standardized"). Every tooltip in the game — spells, items,
// buffs and debuffs, talents, class tree nodes, classes, skills, attributes — is a describe.js model drawn by tipCard().
// No other code writes tooltip text (lessons rule 4: one printer per sentence). In-page panel through shared/tooltip.js
// (never the browser's title=); one tooltip at a time; reachable by keyboard focus and the controller (padnav focuses
// anything with data-tip-render, rule 10).
//
// Markup: <button data-tip-render="ow" data-k="spell" data-id="cleave">           a spell (the rank you know)
//         data-k="item" data-ref="bag:i123" | "gear:chest" | "loot:k5:i9" | "shop:s3_1"   an item (app.itemRef finds it)
//         data-k="aura" data-unit="p1" data-id="bleed"   ·  data-k="talent|node|class|skill|attr" …
// Items compare against what is worn; for a ring/second ring the Shift key (or the pad's left shoulder, or the
// "Compare: Ring 2" button on touch) switches which one (game-standards §5b).
import { installTooltips, registerTip, refreshTip, hideTip } from '../../../../../shared/tooltip.js';
import { describeSpell, describeItem, describeAura, describeTalent, describeNode, describeClass, describeSkill } from '../../rules/describe.js';
import { attrBreakdown } from '../../rules/attributes.js';
import { attrTotals } from '../../rules/sheet.js';
import { fmt, sign } from '../../../../../shared/format.js';
import { esc } from './kit.js';

let compareAlt = false;
export const compareSlotAlt = () => compareAlt;
export function setCompareAlt(on) { if (compareAlt !== !!on) { compareAlt = !!on; refreshTip(); } }

/** One describe.js model → the card's HTML. */
export function tipCard(m, { hint = '', extraLines = [] } = {}) {
  if (!m) return '';
  const rank = m.rank && m.rank.max > 1 ? `<span class="tt-rank">Rank ${fmt(m.rank.now)} / ${fmt(m.rank.max)}</span>` : '';
  let h = `<div class="tt">${rank}<div class="tt-title">${esc(m.title)}</div>${m.kind ? `<div class="tt-kind">${esc(m.kind)}</div>` : ''}`;
  if (m.rows?.length) h += `<dl class="tt-rows">${m.rows.map(r => `<dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`).join('')}</dl>`;
  const lines = [...(m.lines || []), ...extraLines];
  if (lines.length) h += `<div class="tt-lines">${lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>`;
  for (const a of m.auras || []) h += `<div class="tt-aura"><b>${esc(a.name)}</b>: ${esc(a.text)}</div>`;
  if (m.compare?.length) {
    h += `<div class="tt-cmp"><div class="tt-cmp-head">If you wear it instead</div>${m.compare.map(c => `<div class="${c.better ? 'up' : 'down'}">${esc(c.label)}: ${esc(c.now)} → ${esc(c.then)} (${esc(c.diff)})</div>`).join('')}</div>`;
  }
  if (m.next) h += `<div class="tt-next"><b>${esc(m.next.title)}</b>${m.next.needs ? ` <span class="ow-dim">(${esc(m.next.needs)})</span>` : ''}${(m.next.lines || []).map(l => `<p>${esc(l)}</p>`).join('')}</div>`;
  if (m.how?.length) h += `<div class="tt-how"><b>How it's worked out</b>${m.how.map(l => `<p>${esc(l)}</p>`).join('')}</div>`;
  if (m.needs?.length) h += `<div class="tt-needs">${m.needs.map(esc).join('<br>')}</div>`;
  if (hint) h += `<div class="tt-hint">${esc(hint)}</div>`;
  return h + '</div>';
}

// what one point above 10 gives, in player words: [unit, ×100 for fractions]
const PER = {
  heavyShare: ['% damage with heavy weapons', 100], lightShare: ['% damage with light weapons', 100], rangedShare: ['% bow and crossbow damage', 100],
  carry: [' kg carry weight', 1], critChance: ['% critical chance', 1], dodge: ['% dodge chance', 1], stamina: [' stamina', 1],
  hpFlat: [' health', 1], hpPerLevel: [' health per level', 1], mp: [' mana', 1], spellShare: ['% spell power for its schools', 100],
  healShare: ['% healing', 100], mpRegen: [' mana a second', 1], magicResist: [' magic resistance', 1], petShare: ['% companion damage', 100], priceCut: ['% off shop prices', 100],
};
const SRC = { base: 'chosen', level: 'level points', class: 'classes', gear: 'gear', bonus: 'background and talents' };
/** An attribute as a describe-shaped model: "Strength 13" with where it comes from and what it gives at that value. */
export function describeAttr(rules, char, key) {
  const A = rules.data.attributes;
  const b = attrBreakdown(rules, char)[key] || {};
  const total = attrTotals(rules, char)[key];
  const over = total - (A.average || 10);
  const per = A.perPoint?.[key] || {};
  const gives = Object.entries(per).filter(([k]) => PER[k]).map(([k, v]) => `${sign(v * PER[k][1] * over, { decimals: 1 })}${PER[k][0]}`);
  const parts = Object.entries(b).filter(([k, v]) => k !== 'total' && typeof v === 'number' && v && SRC[k]).map(([k, v]) => `${SRC[k]} ${k === 'base' ? fmt(v) : sign(v, { decimals: 0 })}`);
  const lines = [A.blurbs?.[key] || ''];
  if (gives.length) lines.push(`${over >= 0 ? 'At' : 'Below average at'} ${fmt(total)}: ${gives.join(', ')}.`);
  return { title: `${A.names[key]} ${fmt(total)}`, kind: 'Attribute', rows: [], lines: lines.filter(Boolean), auras: [], how: parts.length ? [parts.join(' · ')] : [], compare: [], next: null, needs: [], ok: true };
}

/** Install the shared tooltip engine with the game's one renderer. `app` gives rules, char, unit lookups and items. */
export function installTips(app) {
  installTooltips(document);
  registerTip('ow', el => {
    const rules = app.rules, char = app.me?.char;
    if (!rules || !char) return null;
    const d = el.dataset;
    let m = null, hint = '';
    try {
      switch (d.k) {
        case 'spell': m = describeSpell(rules, char, d.id, { rank: d.rank ? +d.rank : null, cls: d.cls || null }); break;
        case 'item': {
          const it = app.itemRef(d.ref);
          if (!it) return null;
          let slot = null;
          if (it.slot === 'ring') slot = compareAlt ? 'ring2' : 'ring';
          if (it.type === 'weapon' && compareAlt) slot = 'offhand';
          m = describeItem(rules, char, it, { slot: d.ref?.startsWith('gear:') ? d.ref.slice(5) : slot });
          if (d.price) m.rows = [...m.rows, { label: d.sell ? 'Sells for' : 'Price', value: `${fmt(+d.price)} gold` }];
          if (!d.ref?.startsWith('gear:') && (it.slot === 'ring' || it.type === 'weapon')) hint = it.slot === 'ring' ? `Comparing with ${compareAlt ? 'your second ring' : 'your first ring'} — Shift to switch` : (compareAlt ? 'Comparing with your off hand — Shift to switch' : '');
          if (d.hint) hint = d.hint;
          break;
        }
        case 'aura': { const u = app.auraUnit(d.unit); if (!u) return null; m = describeAura(rules, u, d.id); break; }
        case 'talent': m = describeTalent(rules, char, d.id); break;
        case 'node': m = describeNode(rules, char, d.cls, d.id); break;
        case 'class': m = describeClass(rules, char, d.cls, { flags: app.me?.flags || [] }); break;
        case 'skill': m = describeSkill(rules, char, d.id); break;
        case 'attr': m = describeAttr(rules, char, d.id); break;
        case 'text': m = { title: d.title || '', kind: d.kind || '', rows: [], lines: [d.text || ''], auras: [], how: [], compare: [], next: null, needs: [] }; break;
        default: return null;
      }
    } catch (e) { console.warn('tooltip', d.k, d.id, e); return null; }
    const box = document.createElement('div');
    box.innerHTML = tipCard(m, { hint: hint || d.hint || '' });
    box.closest?.('.tipbox')?.classList.add('ow-tipbox');
    queueMicrotask(() => document.querySelector('.tipbox')?.classList.add('ow-tipbox'));
    return box;
  });
  addEventListener('keydown', e => { if (e.key === 'Shift') setCompareAlt(true); });
  addEventListener('keyup', e => { if (e.key === 'Shift') setCompareAlt(false); });
  addEventListener('blur', () => setCompareAlt(false));
}

/** data-* for a tooltip on an element (string to splice into markup). */
export function tipAttrs(k, fields = {}) {
  return `data-tip-render="ow" data-k="${esc(k)}" ${Object.entries(fields).filter(([, v]) => v != null && v !== '').map(([a, v]) => `data-${a}="${esc(v)}"`).join(' ')}`;
}
export { hideTip, refreshTip };
