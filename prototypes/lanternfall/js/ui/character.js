// Character screens — two Satchel tabs (docs/02 §16): Attributes (P) with + / − staging and live derived numbers
// from js/rpg/hero.js deriveStats, every stat with a tooltip naming its sources; and Skills (K), the class's
// 12-node board (data/boards.json, js/rpg/boards.js) with the side panel generated from the node's numbers.
// Taking a rank asks no confirmation and can be undone until the screen closes (02 §16.1).
import { el, btn, toast, hp, fmt, pct, sign, cap, clock, ATTRS, ATTR_NAMES, DERIVED, explainStat } from './menukit.js';
import { deriveStats, effAttr } from '../rpg/hero.js';
import { boardFor, canTake, take, untake, nodeSummary, rankOf, branchPoints } from '../rpg/boards.js';

const heroOf = ctx => (typeof ctx.hero === 'function' ? ctx.hero() : ctx.hero) || ctx.game?.hero;
/** What each attribute does, from the same formulas deriveStats uses (04 §5). */
function attrEffects(a, H, s, D) {
  const cls = D.classes.byId[H.class] || {}, cap_ = D.classes.attrCaps?.[a] ?? 99, e = effAttr(H.attrs[a] || 0, cap_);
  const soft = (H.attrs[a] || 0) > cap_ ? ` · past the soft cap (${cap_}) each point counts half` : '';
  switch (a) {
    case 'might': return `Pole damage ${pct(s.meleeMult)} · crit damage ${pct(s.critMult)} · tonics ${Math.floor(3 + e / 5)} · planks ${(6 + Math.floor(e / 4)) * (H.class === 'tinker' ? 2 : 1)}${soft}`;
    case 'wick': return `Spell power ${sign(s.spellPower * 100, { decimals: 1 })}% · status potency ${pct(s.statusPotency)}${soft}`;
    case 'draught': return `Max oil ${hp(s.maxOil)} · oil regen ${fmt(s.oilRegen)}/s · dark burn ${fmt(s.darkBurn)}×${soft}`;
    case 'nerve': return `Max health ${hp(s.maxHp)} · poise ${hp(s.poise)} · resists +${fmt(Math.min(15, 0.5 * e))}${soft}`;
    case 'knack': return `Crit ${pct(s.critChance, 1)} · build speed ${fmt(s.buildSpeed)}× · loot find ${pct(s.lootFind, 1)}${soft}`;
  }
  return '';
}

let AT = null;
export const attributes = {
  id: 'attributes', title: 'Attributes', satchel: true,
  badge(ctx) { return (heroOf(ctx)?.unspent?.attr || 0) > 0; },
  render(root, ctx) {
    const H = heroOf(ctx), D = ctx.data; if (!H || !D.classes) { root.append(el('p', { class: 'dim', text: 'No character yet.' })); return; }
    AT = { staged: Object.fromEntries(ATTRS.map(a => [a, 0])) };
    const draw = () => {
      const fk = document.activeElement?.dataset?.k;
      const now = deriveStats(H, D);
      const spent = Object.values(AT.staged).reduce((s, v) => s + v, 0), left = (H.unspent?.attr || 0) - spent;
      const clone = { ...H, attrs: Object.fromEntries(ATTRS.map(a => [a, H.attrs[a] + AT.staged[a]])) };
      const then = deriveStats(clone, D); deriveStats(H, D);
      const cls = D.classes.byId[H.class];
      const rows = ATTRS.map(a => [
        el('span', { 'data-tip': attrTip(a), text: ATTR_NAMES[a] }),
        el('span', { class: 'val' + (AT.staged[a] ? ' staged' : ''), text: String(H.attrs[a] + AT.staged[a]) }),
        el('span', { class: 'row' }, btn('−', () => { AT.staged[a]--; draw(); }, { cls: 'small', 'aria-label': `Remove a point from ${ATTR_NAMES[a]}`, disabled: AT.staged[a] > 0 ? null : 'Only points staged this visit can come back.', dataset: { k: 'm-' + a } }),
          btn('+', () => { AT.staged[a]++; draw(); }, { cls: 'small', 'aria-label': `Add a point to ${ATTR_NAMES[a]}`, disabled: left > 0 ? null : 'No points to spend.', dataset: { k: 'p-' + a } })),
        el('span', { class: 'eff', text: attrEffects(a, clone, then, D) })]).flat();
      const changes = spent ? DERIVED.filter(([k]) => Math.abs((then[k] || 0) - (now[k] || 0)) > 1e-6).map(([k, n, f]) => `${n} ${f(now[k])} → ${f(then[k])}`) : [];
      const xpF = H.xpNext ? Math.min(1, H.xp / H.xpNext) : 0;
      const c = H.counters || {};
      root.replaceChildren(el('div', { class: 'col' },
        el('div', { class: 'row' }, el('h3', { class: 'lf-h', text: `${(H.name || '').toUpperCase()} — ${cls?.name || cap(H.class)}, Level ${H.level}` }),
          el('span', { class: 'small' }, `XP ${hp(H.xp)} / ${hp(H.xpNext)} `, el('span', { class: 'xpbar', role: 'progressbar', 'aria-valuenow': Math.round(xpF * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 }, el('i', { style: { width: xpF * 100 + '%' } })))),
        el('p', {}, 'Points to spend: ', el('b', { class: left ? 'gold' : '', text: String(left) })),
        el('div', { class: 'lf-panel lf-attr' }, rows),
        el('p', { class: 'small' }, spent ? [el('span', { class: 'gold', text: 'Pending: ' + ATTRS.filter(a => AT.staged[a]).map(a => `${ATTR_NAMES[a]} +${AT.staged[a]}`).join(', ') }), changes.length ? el('span', { class: 'good', text: '   → ' + changes.join(' · ') }) : null] : el('span', { class: 'dim', text: 'Nothing pending.' })),
        el('div', { class: 'row' }, btn('Reset pending', () => { for (const a of ATTRS) AT.staged[a] = 0; draw(); }, { disabled: spent ? null : 'Nothing staged.' }),
          btn('Confirm', () => { const r = ctx.actions.spendAttrs({ ...AT.staged }); if (typeof r === 'string') { toast(r, 'bad'); return; } for (const a of ATTRS) AT.staged[a] = 0; toast('Points spent.', 'good'); draw(); }, { cls: 'primary', disabled: spent ? null : 'Stage some points first.' })),
        el('div', { class: 'lf-panel' }, el('h3', { class: 'lf-h', text: 'Derived' }), el('div', { class: 'lf-derived' }, DERIVED.map(([k, n, f]) => el('div', { tabindex: 0, 'data-tip': explainStat(k, H, now, D) }, el('span', { class: 'dim', text: n }), el('span', { class: 'num', text: f(now[k] || 0) }))),
          ...Object.entries(now.resist || {}).map(([f, v]) => el('div', { tabindex: 0, 'data-tip': `${cap(f)} resist ${fmt(v)}% = class + Nerve (up to 15) + gear; capped at 75` }, el('span', { class: 'dim', text: `${cap(f)} resist` }), el('span', { class: 'num', text: fmt(v) + '%' }))))),
        el('p', { class: 'small dim', text: `Totals: Deaths ${hp(c.deaths || 0)} · Play time ${clock(c.playTime || 0)} · Rooms ${hp(c.rooms || 0)} · Wicks cast ${hp(c.casts || 0)}` })));
      if (fk) root.querySelector(`[data-k="${fk}"]`)?.focus();
    };
    draw();
  },
  destroy() { AT = null; },
};
function attrTip(a) {
  return { might: 'Might: pole damage, crit damage, and how many tonics and planks you can carry.', wick: 'Wick: spell power and how strong your statuses are.', draught: 'Draught: how much oil you hold, how fast it comes back, and how slowly the dark drinks it.',
    nerve: 'Nerve: health, poise (how hard you are to stagger) and a little of every resist.', knack: 'Knack: crit chance, build speed and loot find.' }[a];
}

let SK = null;
export const skills = {
  id: 'skills', title: 'Skills', satchel: true,
  badge(ctx) { const H = heroOf(ctx); return (H?.unspent?.skill || 0) > 0 && boardOpen(ctx); },
  render(root, ctx) {
    const H = heroOf(ctx); if (!H) { root.append(el('p', { class: 'dim', text: 'No character yet.' })); return; }
    const boards = ctx.data.boards; const board = boards ? boardFor(boards, H.class) : null;
    if (!board) { root.append(el('p', { class: 'dim', text: 'The skill boards are loading.' })); loadBoards(ctx).then(b => { if (!root.isConnected) return; root.replaceChildren(); if (b) skills.render(root, ctx); else root.append(el('p', { class: 'bad', text: 'The skill boards could not be loaded.' })); }); return; }
    H.skills ||= {}; H.unspent ||= { attr: 0, skill: 0 };
    SK = { history: [], sel: board.nodes[0].id, ctx, H, board };
    const open = boardOpen(ctx);
    const draw = () => {
      const fk = document.activeElement?.dataset?.k;
      const nodes = [0, 1, 2].map(br => el('div', { class: 'col', style: { alignItems: 'center', gap: '10px' } }, el('div', { class: 'branch', text: board.branches[br] }),
        ...[1, 2, 3, 4].map(t => {
          const n = board.nodes.find(x => x.branch === br && x.tier === t); const r = rankOf(H, n.id); const avail = !canTake(H, board, n.id, { open });
          const b = el('button', { type: 'button', class: `lf-node${n.capstone ? ' cap' : ''}${r ? ' taken' : avail ? ' avail' : ''}${SK.sel === n.id ? ' sel' : ''}`, dataset: { k: 'n-' + n.id }, 'aria-label': `${n.name}, rank ${r} of ${n.ranks}${avail ? ', available' : ''}`, onclick: () => { SK.sel = n.id; draw(); } },
            t > 1 ? el('i', { class: 'wire' }) : null, el('span', { class: 'pip', text: n.ranks > 1 ? `${r}` : '' }), el('span', { class: 'nm', text: n.name }));
          b.addEventListener('dblclick', () => takeSel());
          return b;
        })));
      const node = board.nodes.find(n => n.id === SK.sel); const sum = nodeSummary(H, board, node, { open });
      const side = el('div', { class: 'lf-panel col' }, el('h3', { class: 'lf-h', text: node.name }),
        el('div', { class: 'small dim', text: `${board.branches[node.branch]} · ${node.capstone ? 'capstone' : 'tier ' + node.tier} · rank ${sum.rank} / ${sum.ranks} · ${node.cost} point${node.cost > 1 ? 's' : ''} a rank` }),
        sum.now ? el('p', {}, el('span', { class: 'dim', text: 'Now: ' }), sum.now) : null,
        sum.next ? el('p', {}, el('span', { class: 'dim', text: sum.rank ? 'Next: ' : 'First rank: ' }), sum.next) : el('p', { class: 'gold', text: 'Fully taken.' }),
        sum.need ? el('p', { class: 'small' }, el('span', { class: 'dim', text: 'Requires: ' }), sum.need) : null,
        node.capstone ? el('p', { class: 'small dim', text: 'One capstone at a time.' }) : null,
        sum.refusal && sum.next ? el('p', { class: 'bad small', text: sum.refusal }) : null,
        btn('Take rank ▸', takeSel, { cls: 'primary', disabled: sum.next ? sum.refusal : 'Fully taken.', dataset: { k: 'take' } }));
      root.replaceChildren(el('div', { class: 'col' },
        el('div', { class: 'row between' }, el('span', {}, 'Skill points: ', el('b', { class: 'gold', text: String(H.unspent.skill) }), open ? null : el('span', { class: 'dim', text: ' (banked — the board opens in Act 2)' })),
          el('span', { class: 'dim', text: `Class: ${ctx.data.classes?.byId?.[H.class]?.name || cap(H.class)} · Level ${H.level}` })),
        el('div', { class: 'lf-board-wrap' }, el('div', { class: 'lf-panel' }, el('div', { class: 'lf-board' + (open ? '' : ' closed') }, nodes),
          el('p', { class: 'tiny dim', text: '● taken  ○ gold ring: available  ○ grey: locked  ★ capstone (one at a time)' })), side),
        el('div', { class: 'row' }, btn('Undo', () => { const id = SK.history.pop(); if (id) { untake(H, board, id); ctx.actions.skillsChanged?.(); draw(); } }, { disabled: SK.history.length ? null : 'Nothing to undo this visit.' }),
          el('span', { class: 'dim small', text: 'Ranks can be undone until you close this screen. After that, respec at the Ferry.' }))));
      if (fk) root.querySelector(`[data-k="${fk}"]`)?.focus();
    };
    const takeSel = () => { const why = take(H, board, SK.sel, { open }); if (why) { toast(why, 'bad'); ctx.sound?.('ui.error'); return; } SK.history.push(SK.sel); ctx.sound?.('ui.click'); ctx.actions.skillsChanged?.(); draw(); };
    draw();
  },
  destroy() { if (SK?.history.length) SK.ctx.actions.skillsCommitted?.(); SK = null; },
};
function boardOpen(ctx) { const v = typeof ctx.boardOpen === 'function' ? ctx.boardOpen() : ctx.boardOpen; if (v != null) return !!v; return (ctx.act ?? 1) >= 2; }
/** boards.json is not in the boot manifest yet; fetch it once if the game did not load it. */
export async function loadBoards(ctx) {
  if (ctx.data.boards) return ctx.data.boards;
  try { ctx.data.boards = await (await fetch(new URL('../../data/boards.json', import.meta.url))).json(); } catch (e) { console.warn('boards.json', e); }
  return ctx.data.boards;
}
export const screens = [attributes, skills];
