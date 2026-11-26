// The services people and shrines offer: a trainer's classes, the stable's horse, changing your path (respec), fast
// travel between the shrines your world has found, mending gear, a locked chest, and the SHRINE window (travel, change
// your path, rest here). One module, one window per kind; each redraws when the character changes (gold, bag, what is
// known), so prices and "can I afford it" are always the live ones. Enchanting is the player's own Trade skills window
// (win-trade.js, owner 2026-11-25), not the shrine's.
//
//   open(app, { kind: 'trainer' | 'stable' | 'respec' | 'travel' | 'repair' | 'locked' | 'shrine', … })
// The server's 'win' message is passed in as it came (server/world.js openService); 'shrine' comes from the play
// screen (interacting with a shrine: { id, name }).
// Also exports the small helpers the other world windows share: itemCell, live, goldLine, shrineName, and the
// LOOK-THEN-COMMIT kit (owner 2026-11-25 "shops instantly purchase items on mobile so you can't read their description";
// lessons rule 47): a tap on an item only picks it; a details pane shows its card and the one button that commits.
//   itemCell(it, { pick: 'buy:shop:i1', sel }) · wirePick(app, w, body) · dropGonePick(w, keys) · pickFoot(app, f, w, {…})
// The window gets cls 'ow-pickwin': desktop = the pane is a column beside the grids; phone = the pane is pinned at
// the bottom of the window (its card scrolls by itself; the button never leaves the screen).
import { focusQuiet } from '../../../../../shared/tooltip.js';
import { openWin, esc, ask, toast, findWin } from './kit.js';
import { tipAttrs, hideTip, itemCardHtml } from './tip.js';
import { glyph, uiIcon } from './icons.js';
import { fmt } from '../../../../../shared/format.js';
import { describeClass } from '../../rules/describe.js';
import { respecPrice } from '../../rules/levels.js';
import { repairPrice } from '../../rules/inventory.js';
import { lockpickChance } from '../../rules/skills-use.js';
import { chestDef } from '../../rules/loot.js';
import { hintFor } from '../input/bindings.js';

// ---------------------------------------------------------------- shared helpers (shop, quests, map use these)
const KIND_GLYPH = { weapon: 'sword', armor: 'shield', accessory: 'star', quest: 'scroll' };
/** One item as a grid cell: rarity-coloured name, a type glyph, the tooltip (the one renderer) and optional price. */
export function itemCell(it, { ref, price = null, sell = false, act = '', disabled = false, why = '', extra = '', pick = '', sel = false, tip = true } = {}) {
  const rar = it.rarity && it.rarity !== 'normal' ? it.rarity : 'normal';
  const g = KIND_GLYPH[it.type] || (it.isShield ? 'shield' : 'info');
  // `pick`: the look-then-commit windows (a tap picks it; the pane commits). `sel` = the picked one ('is-' classes are
  // left out of kit.js keepView's keys, so the focus and scroll survive picking); the picked one has no hover card —
  // its pane already shows it (two copies of one card, and the late hover counted as the window changing by itself)
  return `<button type="button" class="ow-wcell rar-${esc(rar)}${disabled ? ' ow-wcell-off' : ''}${sel ? ' is-sel' : ''}" ${act} ${pick ? `data-pick="${esc(pick)}" aria-pressed="${sel}"` : ''} ${tip && !sel ? tipAttrs('item', { ref, price, sell: sell ? 1 : null }) : ''}>
    <span class="ow-wcell-ico">${glyph(it.isShield ? 'shield' : g, 22)}</span>
    <span class="ow-wcell-name">${esc(it.name)}</span>
    ${price != null ? `<span class="ow-wcell-price${disabled ? ' ow-bad' : ''}">${glyph('coin', 14)}${fmt(price)}</span>` : ''}
    ${why ? `<span class="ow-wcell-why">${esc(why)}</span>` : ''}${extra}
  </button>`;
}
/** Redraw `w` whenever the character or the world state changes; stops when the window closes. */
export function live(app, w, types = ['me']) {
  if (!w || w._live) return w;
  w._live = true;
  const offs = types.map(t => app.on(t, () => { if (w.open) w.render(); }));
  const prevClose = w.close;
  w.close = () => { offs.forEach(f => f()); prevClose(); };
  return w;
}
export const goldOf = app => app.me?.char?.gold || 0;
export const goldLine = app => `<span class="ow-svc-gold">${glyph('coin', 16)}${fmt(goldOf(app))} gold</span>`;
// ---------------------------------------------------------------- look, then commit (shop, repair, trade skills)
/** Hover tooltips on item cells only where there is hovering: on a touch screen the details pane is the card. */
export const cellTips = app => app.device !== 'touch';
/** Wire a body's [data-pick] cells: a tap picks (the pane shows it); a tap on the picked one moves to its button. */
export function wirePick(app, w, body) {
  const cells = [...body.querySelectorAll('[data-pick]')];
  const modeOf = k => k.slice(0, k.indexOf(':'));
  for (const b of cells) {
    b.addEventListener('click', () => {
      const k = b.dataset.pick;
      if (w.data.sel === k) { focusQuiet(w.footEl?.querySelector('[data-commit]:not([disabled])')); hideTip(); return; }
      w.data.sel = k; w.data.opt = null;
      w.data.selIdx = cells.filter(c => modeOf(c.dataset.pick) === modeOf(k)).indexOf(b);
      w.render(); hideTip();
      // on a phone the pane takes the bottom of the window: keep the picked item in sight above it
      w.body?.querySelector('.ow-wcell.is-sel')?.scrollIntoView({ block: 'nearest' });
    });
  }
  // the picked item is gone (bought, sold, broken): the focus moves to its neighbour, so the next one is a press away
  if (w.data.refocus) {
    const { mode, idx } = w.data.refocus; w.data.refocus = null;
    const same = cells.filter(c => modeOf(c.dataset.pick) === mode);
    focusQuiet(same[Math.min(idx, same.length - 1)] || cells[0]);
    hideTip();
  }
}
/** Forget a pick whose item is no longer there; `keys` = every data-pick the body is about to draw. */
export function dropGonePick(w, keys) {
  if (!w.data.sel || keys.includes(w.data.sel)) return;
  const had = w.el.contains(document.activeElement) && document.activeElement !== w.el;
  w.data.refocus = had ? { mode: w.data.sel.slice(0, w.data.sel.indexOf(':')), idx: w.data.selIdx || 0 } : null;
  w.data.sel = null; w.data.opt = null;
}
/** The ref part of a pick key ('buy:shop:i1' → 'shop:i1'). */
export const pickRef = k => (k ? k.slice(k.indexOf(':') + 1) : null);
/**
 * The details pane + the commit row, drawn into a window's footer.
 *   card   HTML of the picked item's card (itemCardHtml) or '' for nothing picked
 *   empty  what the pane says before anything is picked
 *   more   extra HTML under the card (the enchantment choices)
 *   act    { label, sub, icon, kind: 'primary' | 'danger', disabled, run } — the one button that commits
 *   side   extra buttons before it (Repair everything)
 */
export function pickFoot(app, f, w, { card = '', empty = 'Pick an item to see it here.', more = '', act = null, side = '' } = {}) {
  f.innerHTML = `<div class="ow-pick${card ? '' : ' ow-pick-none'}" data-scroll-key="pick">${card ? `<div class="ow-pick-card">${card}</div>${more}` : `<p class="ow-pick-empty">${glyph('info', 18)}<span>${esc(empty)}</span></p>`}</div>
    <div class="ow-pick-row">${goldLine(app)}<span class="ow-spacer"></span>${side}${act ? `<button type="button" class="ow-btn ow-pick-go ${act.kind === 'danger' ? 'ow-danger' : 'ow-primary'}" data-commit ${act.disabled ? 'disabled' : ''}>${act.icon || ''}<span class="ow-pick-go-text"><b>${esc(act.label)}</b>${act.sub ? `<small>${esc(act.sub)}</small>` : ''}</span></button>` : ''}</div>`;
  if (act && !act.disabled) f.querySelector('[data-commit]').onclick = () => act.run?.();
  return f;
}
/** What a pick window redraws on: the parts of my character it shows (lessons rule 12b — never on every update). */
export const charSig = app => { const c = app.me?.char; return c ? JSON.stringify([c.gold, c.bag, c.gear, c.enchant, c.skills]) : ''; };
/** Once per new pick window: redraw only when my gold / bag / gear / enchantments / skills change, and never leave a
 *  hover card floating over the picked item (its pane already shows it). */
export function pickWatch(app, w, fresh) {
  if (!fresh) return w;
  w.follow(app, 'me', () => charSig(app));
  w.onRender = () => { if (document.activeElement?.classList?.contains('is-sel')) hideTip(); };
  return w;
}

export function shrineName(app, id) { return app.W?.data.placements.shrines.find(s => s.id === id)?.name || 'a shrine'; }
const npcName = (app, id) => app.W?.book.npcs[id]?.name || '';

// ---------------------------------------------------------------- the windows
export function open(app, opts = {}) {
  const k = opts.kind;
  if (k === 'trainer') return trainer(app, opts);
  if (k === 'stable') return stable(app, opts);
  if (k === 'respec') return respecWin(app, opts);
  if (k === 'travel') return travel(app, opts);
  if (k === 'repair') return repair(app, opts);
  if (k === 'locked') return locked(app, opts);
  if (k === 'shrine') return shrine(app, opts);
  return null;
}

function trainer(app, opts) {
  const w = openWin({
    id: 'trainer', title: opts.name ? `${opts.name}` : 'Trainer', sub: 'Classes taught here', size: 'wide', cls: 'ow-svc',
    render(body) {
      const char = app.me?.char; if (!char) return '';
      const rows = (opts.classes || []).map(cls => {
        const m = describeClass(app.rules, char, cls, { flags: app.me?.flags || [] });
        const lvl = char.classLevels?.[cls] || 0;
        const state = lvl ? `<span class="ow-svc-tag ow-good">Level ${fmt(lvl)}</span>` : m.ok ? '<span class="ow-svc-tag ow-good">You can take it at your next level</span>' : '<span class="ow-svc-tag ow-bad">Not open to you yet</span>';
        return `<article class="ow-svc-class ow-card">
          <div class="ow-row"><h3 ${tipAttrs('class', { cls })} tabindex="0">${esc(m.title)}</h3>${state}</div>
          <p class="ow-dim">${esc(m.kind)}</p>
          <p>${esc(m.lines[0] || '')}</p>
          <dl class="ow-svc-rows">${m.rows.map(r => `<dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`).join('')}</dl>
          ${m.how.length ? `<p class="ow-dim">${esc(m.how.join(' '))}</p>` : ''}
          ${m.needs.length ? `<p class="ow-svc-need"><b>What you need:</b> ${esc(m.needs.join(' '))}</p>` : ''}
          <div class="ow-row"><span class="ow-spacer"></span><button type="button" class="ow-btn ow-small" data-tree="${esc(cls)}" ${lvl ? 'data-primary' : ''}>${uiIcon('skills', 18)}<span>See the ${esc(m.title)} tree</span></button></div>
        </article>`;
      }).join('');
      body.innerHTML = rows ? `<div class="ow-svc-list">${rows}</div>` : '<p class="ow-empty">Nothing to teach you here.</p>';
      body.querySelectorAll('[data-tree]').forEach(b => { b.onclick = () => app.openWindow('classes', { cls: b.dataset.tree }); });
    },
  });
  return live(app, w);
}

function stable(app, opts) {
  const w = openWin({
    id: 'stable', title: opts.name || 'Stable', sub: 'A riding horse', size: 'narrow', cls: 'ow-svc',
    render(body) {
      const owned = !!app.me?.char?.horse;
      const price = opts.price ?? app.rules.data.inventory.mount.price;
      const key = hintFor(app.bindings, 'mount', app.device || 'keys');
      const speed = app.rules.data.inventory.mount.speedMult;
      body.innerHTML = `<div class="ow-svc-horse ow-card">
        <div class="ow-svc-horse-ico">${glyph('horse', 54)}</div>
        <div><h3>Riding horse</h3>
        <p>Rides ${fmt(Math.round((speed - 1) * 100))}% faster than you run. Getting hit or attacking throws you off; you cannot call it during a fight.</p>
        ${opts.discount ? `<p class="ow-good">The stable owes your world a favour: ${fmt(Math.round(opts.discount * 100))}% off.</p>` : ''}
        ${owned ? `<p class="ow-good"><b>You own a horse.</b> ${key ? `Press ${esc(key)} to call it and to get off.` : 'Use the Mount button to call it and to get off.'}</p>` : ''}</div>
      </div>`;
    },
    foot(f, w) {
      const owned = !!app.me?.char?.horse;
      const price = opts.price ?? app.rules.data.inventory.mount.price;
      const short = goldOf(app) < price;
      f.innerHTML = `${goldLine(app)}<span class="ow-spacer"></span>${owned ? '<button type="button" class="ow-btn ow-primary" data-close-svc>Done</button>' : `<button type="button" class="ow-btn ow-primary" data-buy ${short ? 'disabled' : ''}>${glyph('coin', 16)}<span>Buy for ${fmt(price)} gold</span></button>`}`;
      if (short && !owned) f.insertAdjacentHTML('afterbegin', `<span class="ow-bad ow-svc-short">You need ${fmt(price - goldOf(app))} more gold.</span>`);
      f.querySelector('[data-buy]')?.addEventListener('click', () => app.act('horse', { npc: opts.npc }));
      f.querySelector('[data-close-svc]')?.addEventListener('click', () => w.close());
    },
  });
  return live(app, w);
}

function respecBody(app, prices, { onPick }) {
  const char = app.me?.char; if (!char) return '';
  const p = prices || { points: respecPrice(app.rules, char, 'points'), full: respecPrice(app.rules, char, 'full') };
  const card = (kind, head, text, price) => {
    const short = goldOf(app) < price;
    return `<article class="ow-svc-respec ow-card">
      <h3>${esc(head)}</h3><p>${esc(text)}</p>
      <div class="ow-row">${short ? `<span class="ow-bad">You need ${fmt(price - goldOf(app))} more gold.</span>` : ''}<span class="ow-spacer"></span>
      <button type="button" class="ow-btn ${kind === 'points' ? 'ow-primary' : 'ow-danger'}" data-respec="${kind}" ${short ? 'disabled' : ''}>${glyph('coin', 16)}<span>${fmt(price)} gold</span></button></div>
    </article>`;
  };
  return `<div class="ow-svc-list">
    ${card('points', 'Take back your points', 'Every class point and talent point comes back to spend again. Your class levels and attributes stay.', p.points)}
    ${card('full', 'Start your path again', 'Class levels, level-up attribute points, class points and talents all come back. You choose a class again for every level you have.', p.full)}
  </div><p class="ow-svc-goldrow">${goldLine(app)}</p>`;
}
async function confirmRespec(app, kind) {
  const ok = await ask({ title: kind === 'full' ? 'Start your path again?' : 'Take back your points?', text: kind === 'full' ? 'Every class level comes back and you choose again level by level. Your gear, gold, quests and the world stay.' : 'Every class and talent point comes back. Class levels stay.', ok: 'Yes, change it', cancel: 'Keep it', danger: kind === 'full' });
  if (ok) app.act('respec', { kind });
}
function respecWin(app, opts) {
  const w = openWin({
    id: 'respec', title: 'Change your path', sub: 'Paid at a shrine', cls: 'ow-svc',
    render(body) { body.innerHTML = respecBody(app, opts.prices, {}); body.querySelectorAll('[data-respec]').forEach(b => { b.onclick = () => confirmRespec(app, b.dataset.respec); }); },
  });
  return live(app, w);
}

function travelBody(app, here) {
  const known = app.ws?.shrines || [];
  const home = app.me?.home;
  const rows = (app.W?.data.placements.shrines || []).map(s => {
    const found = known.includes(s.id);
    const region = app.W.terrain.regionAt(s.at[0], s.at[1]) === 'thornmere_wilds' ? 'Thornmere Wilds' : 'Brightwater Vale';
    return `<li class="ow-svc-shrine${found ? '' : ' ow-svc-unfound'}">
      <span class="ow-svc-shrine-ico">${glyph('shrine', 22)}</span>
      <span class="ow-svc-shrine-text"><b>${found ? esc(s.name) : 'Not found yet'}</b><small>${esc(region)}${s.id === home ? ' · you return here after a fall' : ''}${s.id === here ? ' · you are here' : ''}</small></span>
      ${found && s.id !== here ? `<button type="button" class="ow-btn ow-small ow-primary" data-go="${esc(s.id)}">Travel</button>` : ''}
      ${found && s.id === here && s.id !== home ? `<button type="button" class="ow-btn ow-small" data-home="${esc(s.id)}">Rest here</button>` : ''}
    </li>`;
  }).join('');
  return `<ul class="ow-svc-shrines">${rows}</ul>`;
}
function wireTravel(app, body, w) {
  body.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => { app.act('travel', { shrine: b.dataset.go }); w.close(); }; });
  body.querySelectorAll('[data-home]').forEach(b => { b.onclick = () => app.act('home', { shrine: b.dataset.home }); });
}
function nearestShrine(app) {
  const me = app.play?.positions?.()?.find(p => p.me);
  if (!me) return null;
  let best = null, bd = 12;
  for (const s of app.W?.data.placements.shrines || []) { const d = Math.hypot(s.at[0] - me.x, s.at[1] - me.z); if (d < bd) { bd = d; best = s.id; } }
  return best;
}
function travel(app, opts) {
  const w = openWin({
    id: 'travel', title: 'Travel', sub: 'Between the shrines your world has found', cls: 'ow-svc',
    render(body, tab, win) { body.innerHTML = travelBody(app, opts.here || nearestShrine(app)); wireTravel(app, body, win); },
  });
  return live(app, w, ['me', 'wstate']);
}

// repairs: tap a worn item to see it (its wear is on the card), then Repair; or Repair everything at once
const repairList = (app, c) => [...Object.entries(c.gear || {}).filter(([, it]) => it).map(([s, it]) => ({ it, ref: `gear:${s}` })), ...(c.bag || []).map(it => ({ it, ref: `bag:${it.id}` }))]
  .map(x => ({ ...x, price: repairPrice(app.rules, x.it) })).filter(x => x.price > 0);
function repair(app, opts) {
  const fresh = !findWin('repair');
  const w = openWin({
    id: 'repair', title: opts.name ? `${opts.name}: repairs` : 'Repairs', sub: 'Mend worn gear', size: 'wide', cls: 'ow-svc ow-repair ow-pickwin',
    render(body, tab, w) {
      const c = app.me?.char; if (!c) return '';
      const items = repairList(app, c);
      dropGonePick(w, items.map(x => `fix:${x.ref}`));
      w.data.total = items.reduce((s, x) => s + x.price, 0);
      body.innerHTML = items.length
        ? `<section class="ow-section"><h3>${uiIcon('prof_smithing', 18)} Worn gear (${fmt(items.length)})</h3><div class="ow-shop-grid">${items.map(x => itemCell(x.it, { ref: x.ref, price: x.price, pick: `fix:${x.ref}`, sel: w.data.sel === `fix:${x.ref}`, disabled: goldOf(app) < x.price, tip: cellTips(app), why: goldOf(app) < x.price ? `${fmt(x.price - goldOf(app))} gold short` : '' })).join('')}</div></section>`
        : '<p class="ow-empty">Everything you carry is in good repair.</p>';
      wirePick(app, w, body);
    },
    foot(f, w) {
      const c = app.me?.char; if (!c) return;
      const x = repairList(app, c).find(r => `fix:${r.ref}` === w.data.sel) || null;
      const gold = goldOf(app), total = w.data.total || 0;
      const side = total ? `<button type="button" class="ow-btn ow-ghost ow-pick-side" data-all ${gold < total ? 'disabled' : ''}>${uiIcon('prof_smithing', 18)}<span>All (${fmt(total)} gold)</span></button>` : '';
      pickFoot(app, f, w, {
        card: x ? itemCardHtml(app, x.ref, { price: x.price, label: 'Repair cost' }) : '',
        empty: total ? 'Pick an item to see how worn it is.' : 'Nothing needs mending.',
        side,
        act: x ? { label: `Repair — ${fmt(x.price)} gold`, sub: gold < x.price ? `${fmt(x.price - gold)} gold short` : '', disabled: gold < x.price, icon: uiIcon('prof_smithing', 18), run: () => app.act('repair', { npc: opts.npc, item: x.it.id }) } : null,
      });
      f.querySelector('[data-all]:not([disabled])')?.addEventListener('click', () => app.act('repair', { npc: opts.npc, item: 'all' }));
    },
  });
  return pickWatch(app, w, fresh);
}

function locked(app, opts) {
  const w = openWin({
    id: 'locked', title: opts.name || 'A locked chest', sub: 'Locked', size: 'narrow', cls: 'ow-svc',
    render(body, tab, w) {
      const def = chestDef(app.rules, opts.id);
      const chance = def?.lock && app.me?.char ? lockpickChance(app.rules, app.me.char, def.lock) : null;
      body.innerHTML = `<div class="ow-svc-lock ow-card"><div class="ow-svc-horse-ico">${glyph('lockOpen', 48)}</div>
        <div><p>${esc(opts.why || 'It is locked.')}</p>${chance != null ? `<p>Your Lockpicking gives you a <b>${fmt(Math.round(chance * 100))}%</b> chance each try. Every success trains the skill.</p>` : ''}</div></div>`;
      w.data.chance = chance;
    },
    foot(f, w) {
      f.innerHTML = `<button type="button" class="ow-btn ow-ghost" data-leave>Leave it</button><button type="button" class="ow-btn ow-primary" data-pick>${glyph('lockOpen', 18)}<span>Pick the lock${w?.data?.chance != null ? ` (${fmt(Math.round(w.data.chance * 100))}%)` : ''}</span></button>`;
      f.querySelector('[data-pick]').onclick = () => app.act('pick', { id: opts.id });
      f.querySelector('[data-leave]').onclick = () => w.close();
    },
  });
  return w;
}

// ---------------------------------------------------------------- the shrine
function shrine(app, opts) {
  const sid = opts.id || nearestShrine(app);
  const w = openWin({
    id: 'shrine', title: opts.name || shrineName(app, sid), sub: 'Shrine', size: 'wide', cls: 'ow-svc ow-shrine',
    tab: opts.tab || 'travel',
    tabs: [{ id: 'travel', label: 'Travel' }, { id: 'path', label: 'Change your path' }, { id: 'rest', label: 'Rest here' }],
    render(body, tab, w) {
      const c = app.me?.char; if (!c) return '';
      if (tab === 'travel') { body.innerHTML = travelBody(app, sid); wireTravel(app, body, w); return; }
      if (tab === 'path') { body.innerHTML = respecBody(app, null, {}); body.querySelectorAll('[data-respec]').forEach(b => { b.onclick = () => confirmRespec(app, b.dataset.respec); }); return; }
      const home = app.me?.home === sid;
      body.innerHTML = `<div class="ow-card ow-svc-rest"><div class="ow-svc-horse-ico">${glyph('shrine', 48)}</div><div>
        <h3>${esc(shrineName(app, sid))}</h3>
        <p>${home ? 'This is where you wake after a fall.' : `After a fall you wake at ${esc(shrineName(app, app.me?.home))}.`}</p>
        ${home ? '' : '<button type="button" class="ow-btn ow-primary" data-rest data-primary>Wake here after a fall</button>'}</div></div>`;
      body.querySelector('[data-rest]')?.addEventListener('click', () => app.act('home', { shrine: sid }));
    },
    foot(f, w) { f.innerHTML = `${goldLine(app)}<span class="ow-spacer"></span><button type="button" class="ow-btn" data-done>Done</button>`; f.querySelector('[data-done]').onclick = () => w.close(); },
  });
  return live(app, w, ['me', 'wstate']);
}

export { npcName, toast };
