// The character window: a paper doll of what you wear and the bag beside it (protocol §12; play-test P7, P15,
// P16). The server owns both; this draws what `joined.you.bag/equipment`, `bag {add, remove, gold}` and
// `equip {slot, item, equipment}` say, and sends `item {op, uid, slot?}`.
//
//   click a bag item      wear it (in its own slot; drag it onto a slot to choose, e.g. the second ring)
//   click a worn item     take it off (or drag it back onto the bag)
//   right-click           throw it away (asks first)
//   hover                 the item card (ui/item-card.js): required level, properties, compare; Shift = other slot
//
// Every item shows a picture rendered from its 3D model (ui/item-icons.js), a green arrow when it would be an
// upgrade you can wear now, and its required level in red when you are not high enough yet. Filters (weapons,
// armour, jewellery, upgrades, other), a sort and a name search sit over the bag. DOM only.

import { DOLL_LEFT, DOLL_RIGHT, DOLL_BOTTOM, DOLL_EXTRA, SLOT_NAME, FILTERS, SORTS, viewBag, slotOf, altSlotOf, levelCheck, isUpgrade, rarityOf } from './ui/inv-core.js';
import { iconFor, onIcon, specFor, iconsActive, setIconContext } from './ui/item-icons.js';
import { installItemCards, rememberItems, scoreOf, nameOf, farholdReady } from './ui/item-card.js';
import { hideTip, installGameTips } from './ui/tips.js';
import { confirmBox, makeDraggable, mountConfirm } from './ui-panel.js';
import { wearSlot } from './ui/pt2-core.js';
import { offhandRefusal, hasDual2h, BAG_MAX as BAG_CAP } from './ui/pt5-core.js';
import { handRefusal } from './ui/pt10-core.js';
import { UNSEEN } from './ui/unseen.js';
import { uiIconSvg } from '../../../../icons/js/game-icons.js';
// 2026-10-14: the empty paper doll is the icon library's wooden mannequin (the same dummy the armour icons are worn by)
const DOLL_FIGURE = uiIconSvg('doll', 120) || '';
import { packRefusal, bagSlotsOf } from './ui/pt8-core.js';      // W19: a backpack's extra squares

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BAG_MAX = BAG_CAP;
const UI_KEY = 'tv.inv.ui';
const SLOT_GLYPH = { head: '⛑', necklace: '◎', chest: '▣', hands: '✋', legs: '‖', feet: '⌓', ring: '○', ring2: '○', weapon: '⚔', offhand: '⛨', mount: '♞', light: '✦', tool: '⚒', back: '◣', waist: '═' };

export function createBag({ net: getNet, hud, me = null }) {
  const root = $('bag');
  const btn = $('bag-btn');
  let useHook = null;
  const toggleFns = new Set();
  /** T7 (play-test 5): the Doubled Grasp perk lets a two-handed weapon sit in each hand. */
  const dual2h = () => hasDual2h(getNet()?.joined?.you);
  // W19: the bag is 40 squares + the worn pack's (the server's `you.bagMax`, kept current by `you {bagMax}`)
  const bagMax = () => S.bagMax || getNet()?.joined?.you?.bagMax || BAG_MAX;
  const S = { bag: [], equipment: {}, gold: 0, fresh: new Set(), level: 1, filter: 'all', sort: 'new', search: '', bagMax: 0 };
  try { Object.assign(S, JSON.parse(localStorage.getItem(UI_KEY) || '{}')); S.search = ''; S.bagMax = 0; } catch {}
  const level = () => (me?.()?.level ?? S.level ?? getNet()?.joined?.you?.level ?? 1);
  setIconContext({ cls: () => me?.()?.cls || getNet()?.joined?.you?.cls || null });      // W25: icons wear what YOUR class would
  installGameTips();                 // idempotent: the item cards need the shared tooltip engine running
  installItemCards({ equipment: () => S.equipment, level });

  root.classList.add('inv');
  root.innerHTML = `
    <header><h3>Character</h3><span class="inv-sub" id="inv-sub"></span><button class="ghost small inv-stats" id="inv-stats" type="button" data-tip="Stats and damage, beside this window (V)">Stats</button><span class="gold" id="bag-gold">0 gold</span><button class="ghost" id="bag-close" aria-label="Close" data-tip="Close (Esc)">×</button></header>
    <div class="inv-body">
      <section class="inv-doll" aria-label="Worn gear">
        <div class="doll-col" id="doll-left"></div>
        <div class="doll-figure">${DOLL_FIGURE}
          <div class="doll-stats" id="doll-stats"></div></div>
        <div class="doll-col" id="doll-right"></div>
        <div class="doll-bottom" id="doll-bottom"></div>
      </section>
      <section class="inv-bag" aria-label="Bag">
        <div class="inv-tools">
          <div class="chips inv-filters" id="inv-filters" role="radiogroup" aria-label="Show"></div>
          <div class="row"><input id="inv-search" type="search" placeholder="Find by name…" aria-label="Find by name"><select id="inv-sort" aria-label="Sort"></select></div>
        </div>
        <div class="bag-grid" id="bag-grid"></div>
        <p class="bag-hint"><span id="inv-count"></span> Click to wear (or use / open) · <kbd>Shift</kbd>-click for the other hand (a stack: split it; drop one stack on another to join them) · drag onto a slot or a 7–0 key · right-click to throw away · hold <kbd>Shift</kbd> to compare the other hand.</p>
      </section>
    </div>`;
  const el = { gold: $('bag-gold'), sub: $('inv-sub'), grid: $('bag-grid'), left: $('doll-left'), right: $('doll-right'), bottom: $('doll-bottom'), stats: $('doll-stats'),
    filters: $('inv-filters'), sort: $('inv-sort'), search: $('inv-search'), count: $('inv-count'), badge: btn?.querySelector('b') || $('bag-count') };
  // the old #paperdoll / #itemcard elements are not used any more (the card is the shared tooltip)
  $('itemcard')?.setAttribute('hidden', '');

  $('bag-close').onclick = () => toggle(false);
  // play-test 9 (X3, S#49): the character window drags by its title bar like every other window (not on a phone: it is a sheet there)
  const drag = makeDraggable({ root, handle: root.querySelector('header'), id: 'bag' });
  if (btn) btn.onclick = () => toggle();
  el.sort.innerHTML = SORTS.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
  el.sort.value = S.sort;
  el.sort.onchange = () => { S.sort = el.sort.value; saveUi(); draw(); };
  el.search.oninput = () => { S.search = el.search.value; draw(); };
  for (const f of FILTERS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.dataset.f = f.id; b.textContent = f.label; b.setAttribute('role', 'radio');
    b.onclick = () => { S.filter = f.id; saveUi(); draw(); };
    el.filters.appendChild(b);
  }
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { toggle(false); e.preventDefault(); } e.stopPropagation(); });
  function saveUi() { try { localStorage.setItem(UI_KEY, JSON.stringify({ filter: S.filter, sort: S.sort })); } catch {} }

  function toggle(open = root.hidden) {
    root.hidden = !open; btn?.classList.toggle('on', open);
    iconsActive(open);                    // icons render only while this window is open (P1: no freezes in play)
    if (open) { draw(); drag.clamp(); } else hideTip();
    for (const fn of toggleFns) fn(open);
    return open;
  }

  // ---- one slot ----
  function slotEl(item, { slot = null, worn = false } = {}) {
    const d = document.createElement('div');
    const lv = level();
    d.className = 'islot' + (item ? ` r-${rarityOf(item)}` + (item.kind === 'junk' ? ' junk' : '') + (S.fresh.has(item.uid) ? ' fresh' : '') : ' empty');
    if (slot) d.dataset.slot = slot;
    if (item) {
      d.dataset.tipRender = 'item'; d.dataset.tipItem = String(item.uid);
      if (worn) d.dataset.worn = '1';
      const url = iconFor(item);
      if (url) { const img = document.createElement('img'); img.src = url; img.alt = ''; img.draggable = false; d.appendChild(img); }
      else { const g = document.createElement('span'); g.className = 'glyph'; g.textContent = (nameOf(item)[0] || '?').toUpperCase(); d.appendChild(g); d.classList.add('pending'); }
      if (item.count > 1) { const n = document.createElement('b'); n.className = 'stack'; n.textContent = item.count > 999 ? '999+' : String(item.count); d.appendChild(n); }   // U5: a stack shows how many
      if (slotOf(item)) {
        const req = levelCheck(item, lv, S.equipment);
        if (!req.ok) { const r = document.createElement('span'); r.className = 'req no'; r.textContent = req.level; d.appendChild(r); d.classList.add('toohigh'); }
        else if (!worn && isUpgrade(item, S.equipment, lv, scoreOf)) { const u = document.createElement('span'); u.className = 'up'; u.textContent = '▲'; d.appendChild(u); }
      }
      d.draggable = true;
      d.addEventListener('dragstart', e => { hideTip(); e.dataTransfer.setData('text/x-tv-item', JSON.stringify({ uid: item.uid, worn: worn ? slot : null })); e.dataTransfer.effectAllowed = 'move'; });
    } else if (slot) {
      const g = document.createElement('span'); g.className = 'slotglyph'; g.textContent = SLOT_GLYPH[slot] || ''; d.appendChild(g);
      d.dataset.tip = `${SLOT_NAME[slot] || slot} — empty`;
      // T7: say what the off hand will take while a two-hander is in the main hand
      if (slot === 'offhand' && S.equipment?.weapon?.twoHanded) d.dataset.tip = dual2h() ? 'Off hand — empty. Doubled Grasp: drag a second two-handed weapon here (or Shift-click it in your bag).' : `Off hand — ${S.equipment.weapon.name || 'your weapon'} needs both hands. The Doubled Grasp perk lets you hold a two-hander in each hand.`;
    }
    if (slot) {
      const s = document.createElement('span'); s.className = 'slotname'; s.textContent = SLOT_NAME[slot] || slot; d.appendChild(s);
      d.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/x-tv-item')) { e.preventDefault(); d.classList.add('drop'); } });
      d.addEventListener('dragleave', () => d.classList.remove('drop'));
      d.addEventListener('drop', e => { e.preventDefault(); d.classList.remove('drop'); dropOnSlot(e, slot); });
    }
    return d;
  }
  function find(uid) { return S.bag.find(i => i.uid === uid) || null; }
  function wear(it, slot = null) {
    const req = levelCheck(it, level(), S.equipment);
    if (!slotOf(it)) { hud.toast('That cannot be worn.', 'warn'); return; }
    if (!req.ok) { hud.toast(`${nameOf(it)} needs level ${req.level} — you are level ${level()}.`, 'warn'); return; }
    // Q12: a click on a second ring puts it on the EMPTY hand (never over the first); a drag onto an exact ring slot
    // names it ('ring1' / 'ring2' on the wire — 'ring' alone means "you pick" to the server, protocol v6)
    { const no = handRefusal(it, slot === 'offhand' ? 'offhand' : slot === 'weapon' ? 'weapon' : null); if (no) { hud.toast(no, 'warn'); return; } }      // Y16: Main hand / Off hand items fit only that hand
    if (slot === 'offhand') { const no = offhandRefusal(it, S.equipment, { dual2h: dual2h() }); if (no) { hud.toast(no, 'warn'); return; } }
    // W19: a cloak (or a smaller pack) over a pack whose extra squares are in use — say why before asking the server
    if (slotOf(it) === 'back' && S.equipment?.back) { const no = packRefusal(S.equipment.back, { bagCount: S.bag.length, bagMax: bagMax(), next: it }); if (no) { hud.toast(no, 'warn'); return; } }
    const wire = slot === 'ring' ? 'ring1' : slot || wearSlot(it, S.equipment) || undefined;
    getNet()?.item('equip', it.uid, wire === 'ring' ? undefined : wire); hideTip();
  }
  function dropOnSlot(e, slot) {
    let d; try { d = JSON.parse(e.dataTransfer.getData('text/x-tv-item')); } catch { return; }
    if (d.worn) return;                                        // worn -> another slot: not a thing the server does
    const it = find(d.uid); if (!it) return;
    // T7: the off hand takes a second two-hander when the perk is owned — and says why not otherwise
    const hand = slot === 'offhand' && slotOf(it) === 'weapon';
    { const no = handRefusal(it, slot); if (no) { hud.toast(no, 'warn'); return; } }
    if (hand) { const no = offhandRefusal(it, S.equipment, { dual2h: dual2h() }); if (no) { hud.toast(no, 'warn'); return; } }
    else if (slotOf(it) !== slot && altSlotOf(it) !== slot) { hud.toast(`${nameOf(it)} does not go in ${SLOT_NAME[slot] || slot}.`, 'warn'); return; }
    wear(it, slot);
  }
  el.grid.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/x-tv-item')) e.preventDefault(); });
  el.grid.addEventListener('drop', e => {
    e.preventDefault();
    let d; try { d = JSON.parse(e.dataTransfer.getData('text/x-tv-item')); } catch { return; }
    if (d.worn) takeOff(S.equipment?.[d.worn] || { uid: d.uid }, d.worn);
  });
  /** Take a worn piece off. W19: a pack whose extra squares are holding things stays on, and says how many to empty. */
  function takeOff(it, sl) {
    const no = packRefusal(it, { bagCount: S.bag.length, bagMax: bagMax() });
    if (no) { hud.toast(no, 'warn'); return false; }
    getNet()?.item('unequip', it.uid, sl); hideTip(); return true;
  }

  /** U7 (play-test 6): the numbers under the figure are the CHARACTER MENU's (the server's sheet) — one source. fn() -> [{label, text, tip}] | null */
  let sheetLines = null;
  function stats() {
    const rows = sheetLines?.();
    if (rows && rows.length) return `<b>Level ${level()}</b>` + rows.map(r => `<span data-tip="${esc(r.tip || '')}">${esc(r.text)} <i>${esc(r.label)}</i></span>`).join('');
    // before any sheet has arrived: say so rather than add things up a second way
    return `<b>Level ${level()}</b><span class="dim" data-tip="The numbers come from the Character menu (V) the moment the server sends them.">Counting…</span>`;
  }
  /** Split a stack: how many to take off (1 .. count-1). The server answers with both stacks. */
  function splitAsk(it) {
    hideTip();
    document.querySelector('.tv-split')?.remove();
    const max = it.count - 1, half = Math.max(1, Math.floor(it.count / 2));
    const num = document.createElement('input'); Object.assign(num, { type: 'number', min: 1, max, step: 1, value: half }); num.setAttribute('aria-label', 'How many to split off');
    const range = document.createElement('input'); Object.assign(range, { type: 'range', min: 1, max, step: 1, value: half });
    const box = document.createElement('div'); box.className = 'tv-confirm tv-split'; box.setAttribute('role', 'dialog');
    const p = document.createElement('p'); p.textContent = `Split ${nameOf(it)} (${it.count}) — how many go in the new stack?`;
    const row = document.createElement('div'); row.className = 'row';
    const no = document.createElement('button'); no.type = 'button'; no.className = 'ghost'; no.textContent = 'Cancel';
    const yes = document.createElement('button'); yes.type = 'button'; yes.className = 'primary'; yes.dataset.act = 'split';
    const val = () => Math.max(1, Math.min(max, Math.round(+num.value || 0)));
    const paint = () => { yes.textContent = `Split off ${val()}`; };
    num.oninput = () => { range.value = String(val()); paint(); }; range.oninput = () => { num.value = range.value; paint(); };
    const done = ok => { box.remove(); if (ok) { const n = getNet(); if (typeof n?.splitItem === 'function') n.splitItem(it.uid, val()); else n?._raw?.('game', JSON.stringify({ t: 'item', op: 'split', uid: String(it.uid), n: val() })); } };
    no.onclick = () => done(false); yes.onclick = () => done(true);
    box.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); });
    row.append(no, yes); box.append(p, range, num, row); paint();
    mountConfirm(box);
    num.focus(); num.select();
  }
  const sameStack = (a, b) => !!a && !!b && a.uid !== b.uid && a.kind === b.kind && (a.id ?? a.baseKey) === (b.id ?? b.baseKey) && !!a.cooked === !!b.cooked && (a.stackMax || b.stackMax || a.count > 1 || b.count > 1 || a.kind === 'potion');
  function merge(fromUid, onto) {
    const n = getNet();
    if (typeof n?.mergeItem === 'function') n.mergeItem(fromUid, onto.uid); else n?._raw?.('game', JSON.stringify({ t: 'item', op: 'merge', uid: String(fromUid), onto: String(onto.uid) }));
  }
  let drawT = 0;
  function draw() {
    el.gold.textContent = `${S.gold.toLocaleString()} gold`;
    if (!root.hidden) UNSEEN.seen('bag');      // U1: the badge is "new since you last looked", not how much you carry
    if (root.hidden) return;
    const worn = S.equipment || {};
    const put = (box, list) => { box.replaceChildren(...list.map(sl => { const it = worn[sl] || null; const d = slotEl(it, { slot: sl, worn: !!it }); if (it) d.onclick = () => takeOff(it, sl); return d; })); };
    put(el.left, DOLL_LEFT); put(el.right, DOLL_RIGHT);
    put(el.bottom, [...DOLL_BOTTOM, ...DOLL_EXTRA.filter(s => worn[s])]);          // (W22: no Light slot — an old save's `light` is refunded by the server and never drawn)
    el.stats.innerHTML = stats();
    for (const b of el.filters.children) b.setAttribute('aria-checked', String(b.dataset.f === S.filter));
    el.sort.value = S.sort;
    const list = viewBag(S.bag, { filter: S.filter, sort: S.sort, equipment: worn, level: level(), score: scoreOf, search: S.search });
    const cells = list.map(it => {
      const d = slotEl(it);
      d.onclick = e => {
        // §23.1: Shift-click a stack = split some off (before anything would drink it)
        if (e.shiftKey && it.count > 1) { splitAsk(it); return; }
        if (useHook && useHook(it)) return;
        // Shift-click = the other hand / the other ring (T7: a second two-hander with Doubled Grasp)
        if (e.shiftKey && slotOf(it) === 'weapon') { wear(it, 'offhand'); return; }
        if (e.shiftKey && altSlotOf(it)) { wear(it, altSlotOf(it)); return; }
        wear(it);
      };   // potions / food: used (play-test 2 §18.10)
      // §23.1: drop a stack on another stack of the same thing = merge them
      d.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/x-tv-item')) { e.preventDefault(); d.classList.add('drop'); } });
      d.addEventListener('dragleave', () => d.classList.remove('drop'));
      d.addEventListener('drop', e => {
        d.classList.remove('drop');
        let x; try { x = JSON.parse(e.dataTransfer.getData('text/x-tv-item')); } catch { return; }
        if (x.worn || x.uid === it.uid) return;
        const from = find(x.uid); if (!from) return;
        e.preventDefault(); e.stopPropagation();
        if (!sameStack(from, it)) { hud.toast('Only two stacks of the same thing go together.', 'warn'); return; }
        merge(from.uid, it);
      });
      d.oncontextmenu = async e => { e.preventDefault(); hideTip(); if (await confirmBox(`Throw away ${nameOf(it)}? It is gone for good.`, { yes: 'Throw away', danger: true })) getNet()?.item('destroy', it.uid); };
      return d;
    });
    const cols = Math.max(1, (getComputedStyle(el.grid).gridTemplateColumns || '').split(' ').filter(Boolean).length || 6);
    // W19: with no filter the grid IS the bag — every square you have, used or not (an old save over its capacity keeps its extra rows)
    const cap = S.bagMax || getNet()?.joined?.you?.bagMax || 0;      // 0 = the server has not said: the old four rows
    const want = S.filter === 'all' && !S.search ? (cap ? Math.max(cap, list.length) : Math.max(cols * 4, list.length + 1)) : list.length;
    const pad = Math.max(0, (cap && S.filter === 'all' && !S.search ? want : Math.ceil(want / cols) * cols) - list.length);      // a known capacity is drawn exactly: 46 squares are 46
    for (let k = 0; k < pad; k++) cells.push(slotEl(null));
    el.grid.replaceChildren(...cells);
    rehover();
    const pack = bagSlotsOf(worn.back);
    el.count.textContent = `${S.bag.length} / ${bagMax()}${list.length !== S.bag.length ? ` (showing ${list.length})` : ''} ·`;
    el.count.dataset.tip = pack ? `${bagMax() - pack} squares of your own + ${pack} from ${nameOf(worn.back)}.` : 'A backpack in the Back slot adds squares.';
    el.count.classList.toggle('over', S.bag.length > bagMax());
    el.sub.textContent = S.filter !== 'all' ? FILTERS.find(f => f.id === S.filter)?.label || '' : '';
  }
  // A redraw replaces the square under the pointer, and the tooltip engine only hears about a square when the
  // pointer ENTERS it: tell it about the new one so the card stays up through icon/loot redraws.
  const ptr = { x: -1, y: -1 };
  root.addEventListener('pointermove', e => { ptr.x = e.clientX; ptr.y = e.clientY; });
  root.addEventListener('pointerleave', () => { ptr.x = -1; });
  function rehover() {
    if (ptr.x < 0) return;
    const under = document.elementFromPoint(ptr.x, ptr.y);
    if (under && root.contains(under)) under.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, clientX: ptr.x, clientY: ptr.y }));
  }
  const redrawSoon = () => { clearTimeout(drawT); drawT = setTimeout(draw, 60); };
  // An icon that finishes is put INTO its square (play-test 8): rebuilding the whole grid for each picture detached the square
  // under the pointer again and again while a bag of new things was being drawn — a click could land on nothing.
  function fillIcons() {
    for (const d of root.querySelectorAll('.islot.pending')) {
      const uid = d.dataset.tipItem;
      const it = S.bag.find(i => String(i.uid) === uid) || Object.values(S.equipment || {}).find(i => i && String(i.uid) === uid);
      const url = it && iconFor(it); if (!url) continue;
      const img = document.createElement('img'); img.src = url; img.alt = ''; img.draggable = false;
      const g = d.querySelector('.glyph'); if (g) g.replaceWith(img); else d.prepend(img);
      d.classList.remove('pending');
    }
  }
  onIcon(() => { if (!root.hidden) fillIcons(); });
  farholdReady().then(() => { if (!root.hidden) draw(); });

  function remember() { rememberItems(S.bag); rememberItems(Object.values(S.equipment || {}).filter(Boolean)); }
  /** Warm the icon cache for what you carry (rendering is idle-time, one at a time). */
  function warm() { for (const it of [...S.bag, ...Object.values(S.equipment || {})]) if (it) iconFor(it); }

  function wire(n) {
    n.on('joined', j => { S.bagMax = j.you.bagMax || 0; S.bag = [...(j.you.bag || [])]; S.equipment = { ...(j.you.equipment || {}) }; S.gold = j.you.gold || 0; if (j.you.level) S.level = j.you.level; remember(); warm(); draw(); });
    n.on('you', p => { let ch = false; if (p.bagMax != null && p.bagMax !== S.bagMax) { S.bagMax = p.bagMax; ch = true; } if (p.gold != null) { S.gold = p.gold; ch = true; } if (p.level != null && p.level !== S.level) { S.level = p.level; ch = true; } if (ch) draw(); });
    n.on('bag', m => {
      const rm = new Set(m.remove || []);
      // U5: a stack that changed arrives as remove + add of the SAME uid — it keeps its place, and only a bigger count is news
      const was = new Map(S.bag.filter(i => rm.has(i.uid)).map(i => [i.uid, { at: S.bag.indexOf(i), count: i.count || 1 }]));
      for (const u of rm) if (!(m.add || []).some(i => i.uid === u)) UNSEEN.drop('bag', u);
      S.bag = S.bag.filter(i => !rm.has(i.uid));
      for (const it of m.add || []) {
        const old = was.get(it.uid);
        if (old) { S.bag.splice(Math.min(old.at, S.bag.length), 0, it); if ((it.count || 1) <= old.count) continue; }
        else S.bag.push(it);
        S.fresh.add(it.uid); if (root.hidden) UNSEEN.add('bag', it.uid); setTimeout(() => { S.fresh.delete(it.uid); if (!root.hidden) redrawSoon(); }, 2000);
        iconFor(it);
        if (slotOf(it)) { const req = levelCheck(it, level(), S.equipment); if (!req.ok) hud.chat(`${nameOf(it)} needs level ${req.level} to wear.`, 'system'); }
      }
      if (m.gold != null) S.gold = m.gold;
      remember(); draw();
    });
    n.on('equip', m => { S.equipment = { ...(m.equipment || {}) }; remember(); draw(); if (m.item) hud.chat(`You equip ${nameOf(m.item)}.`, 'system'); });
    // W19: the server's own refusal (it has the last word on what fits)
    n.on('itemR', r => { if (r.ok === false && r.why === 'bagSlots' && !(r.op === 'equip' && r.msg)) hud.toast(r.msg || `Empty ${r.need || 'some'} more bag slot${r.need === 1 ? '' : 's'} first — the pack's extra room is holding things.`, 'warn'); });
    n.on('itemR', r => { if ((r.op === 'split' || r.op === 'merge') && r.ok === false) hud.toast(r.msg || ({ count: 'There are not that many in the stack.', bagFull: 'Your bag is full — a split needs a free square.', full: 'That stack is full.', item: 'Those two do not go together.' }[r.why]) || 'That did not work.', 'warn'); });
    n.on('err', e => { if (e.code === 'item' || e.code === 'bagFull') hud.toast(e.msg || 'You cannot do that.', 'warn'); });
  }

  return {
    wire, toggle, state: S, draw,
    /** fn(open) each time the window opens or closes (the Character menu docks beside it). */
    splitAsk, sameStack,
    onToggle(fn) { toggleFns.add(fn); return () => toggleFns.delete(fn); },
    /** U7: where the stat lines under the figure come from (the Character menu's sheet). */
    setStats(fn) { sheetLines = fn; if (!root.hidden) draw(); },
    get max() { return bagMax(); }, takeOff, get dual2h() { return dual2h(); },
    /** fn(item) -> true when it USED the item (a consumable) instead of wearing it. */
    setUseHook(fn) { useHook = fn; },
    /** Kept for older callers: the card is the shared tooltip now (data-tip-render="item"). */
    card() {}, hideCard: hideTip,
    get isOpen() { return !root.hidden; },
    /** Optional: tell the window your level when the game learns it first (a `level` event). */
    setLevel(lv) { if (lv && lv !== S.level) { S.level = lv; draw(); } },
    iconSpec: specFor,
  };
}
