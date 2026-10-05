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
import { iconFor, onIcon, specFor } from './ui/item-icons.js';
import { installItemCards, rememberItems, scoreOf, nameOf, farholdReady } from './ui/item-card.js';
import { hideTip, installGameTips } from './ui/tips.js';
import { confirmBox } from './ui-panel.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BAG_MAX = 120;
const UI_KEY = 'tv.inv.ui';
const SLOT_GLYPH = { head: '⛑', necklace: '◎', chest: '▣', hands: '✋', legs: '‖', feet: '⌓', ring: '○', ring2: '○', weapon: '⚔', offhand: '⛨', mount: '♞', light: '✦', tool: '⚒' };

export function createBag({ net: getNet, hud, me = null }) {
  const root = $('bag');
  const btn = $('bag-btn');
  const S = { bag: [], equipment: {}, gold: 0, fresh: new Set(), level: 1, filter: 'all', sort: 'new', search: '' };
  try { Object.assign(S, JSON.parse(localStorage.getItem(UI_KEY) || '{}')); S.search = ''; } catch {}
  const level = () => (me?.()?.level ?? S.level ?? getNet()?.joined?.you?.level ?? 1);
  installGameTips();                 // idempotent: the item cards need the shared tooltip engine running
  installItemCards({ equipment: () => S.equipment, level });

  root.classList.add('inv');
  root.innerHTML = `
    <header><h3>Character</h3><span class="inv-sub" id="inv-sub"></span><span class="gold" id="bag-gold">0 gold</span><button class="ghost" id="bag-close" aria-label="Close" data-tip="Close (Esc)">×</button></header>
    <div class="inv-body">
      <section class="inv-doll" aria-label="Worn gear">
        <div class="doll-col" id="doll-left"></div>
        <div class="doll-figure"><svg viewBox="0 0 100 200" aria-hidden="true"><g fill="currentColor"><circle cx="50" cy="30" r="22"/><path d="M28 60h44l8 62H66l-3 70H37l-3-70H20z"/><path d="M28 62 12 116l9 4 14-44zM72 62l16 54-9 4-14-44z"/></g></svg>
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
        <p class="bag-hint"><span id="inv-count"></span> Click to wear · drag onto a slot to pick it · right-click to throw away · hold <kbd>Shift</kbd> to compare the other hand.</p>
      </section>
    </div>`;
  const el = { gold: $('bag-gold'), sub: $('inv-sub'), grid: $('bag-grid'), left: $('doll-left'), right: $('doll-right'), bottom: $('doll-bottom'), stats: $('doll-stats'),
    filters: $('inv-filters'), sort: $('inv-sort'), search: $('inv-search'), count: $('inv-count'), badge: btn?.querySelector('b') || $('bag-count') };
  // the old #paperdoll / #itemcard elements are not used any more (the card is the shared tooltip)
  $('itemcard')?.setAttribute('hidden', '');

  $('bag-close').onclick = () => toggle(false);
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
    if (open) draw(); else hideTip();
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
    getNet()?.item('equip', it.uid, slot || undefined); hideTip();
  }
  function dropOnSlot(e, slot) {
    let d; try { d = JSON.parse(e.dataTransfer.getData('text/x-tv-item')); } catch { return; }
    if (d.worn) return;                                        // worn -> another slot: not a thing the server does
    const it = find(d.uid); if (!it) return;
    if (slotOf(it) !== slot && altSlotOf(it) !== slot) { hud.toast(`${nameOf(it)} does not go in ${SLOT_NAME[slot] || slot}.`, 'warn'); return; }
    wear(it, slot);
  }
  el.grid.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/x-tv-item')) e.preventDefault(); });
  el.grid.addEventListener('drop', e => {
    e.preventDefault();
    let d; try { d = JSON.parse(e.dataTransfer.getData('text/x-tv-item')); } catch { return; }
    if (d.worn) { getNet()?.item('unequip', d.uid, d.worn); hideTip(); }
  });

  function stats() {
    let armour = 0, dmg = null;
    for (const it of Object.values(S.equipment || {})) { if (!it) continue; armour += it.armor || 0; }
    const w = S.equipment?.weapon; if (w?.dmg) dmg = w.dmg;
    return `<b>Level ${level()}</b><span data-tip="Armour from everything you wear">${armour} armour</span>${dmg ? `<span data-tip="Your main-hand weapon's damage">${dmg[0]}–${dmg[1]} damage</span>` : '<span class="dim">Bare hands</span>'}`;
  }

  let drawT = 0;
  function draw() {
    el.gold.textContent = `${S.gold.toLocaleString()} gold`;
    if (el.badge) el.badge.textContent = S.bag.length ? S.bag.length : '';
    if (root.hidden) return;
    const worn = S.equipment || {};
    const put = (box, list) => { box.replaceChildren(...list.map(sl => { const it = worn[sl] || null; const d = slotEl(it, { slot: sl, worn: !!it }); if (it) d.onclick = () => { getNet()?.item('unequip', it.uid, sl); hideTip(); }; return d; })); };
    put(el.left, DOLL_LEFT); put(el.right, DOLL_RIGHT);
    put(el.bottom, [...DOLL_BOTTOM, ...DOLL_EXTRA.filter(s => worn[s])]);
    el.stats.innerHTML = stats();
    for (const b of el.filters.children) b.setAttribute('aria-checked', String(b.dataset.f === S.filter));
    el.sort.value = S.sort;
    const list = viewBag(S.bag, { filter: S.filter, sort: S.sort, equipment: worn, level: level(), score: scoreOf, search: S.search });
    const cells = list.map(it => {
      const d = slotEl(it);
      d.onclick = () => wear(it);
      d.oncontextmenu = async e => { e.preventDefault(); hideTip(); if (await confirmBox(`Throw away ${nameOf(it)}? It is gone for good.`, { yes: 'Throw away', danger: true })) getNet()?.item('destroy', it.uid); };
      return d;
    });
    const cols = Math.max(1, (getComputedStyle(el.grid).gridTemplateColumns || '').split(' ').filter(Boolean).length || 6);
    const want = S.filter === 'all' && !S.search ? Math.max(cols * 4, list.length + 1) : list.length;
    const pad = Math.max(0, Math.ceil(want / cols) * cols - list.length);
    for (let k = 0; k < pad; k++) cells.push(slotEl(null));
    el.grid.replaceChildren(...cells);
    rehover();
    el.count.textContent = `${S.bag.length} / ${BAG_MAX}${list.length !== S.bag.length ? ` (showing ${list.length})` : ''} ·`;
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
  onIcon(() => { if (!root.hidden) redrawSoon(); });
  farholdReady().then(() => { if (!root.hidden) draw(); });

  function remember() { rememberItems(S.bag); rememberItems(Object.values(S.equipment || {}).filter(Boolean)); }
  /** Warm the icon cache for what you carry (rendering is idle-time, one at a time). */
  function warm() { for (const it of [...S.bag, ...Object.values(S.equipment || {})]) if (it) iconFor(it); }

  function wire(n) {
    n.on('joined', j => { S.bag = [...(j.you.bag || [])]; S.equipment = { ...(j.you.equipment || {}) }; S.gold = j.you.gold || 0; if (j.you.level) S.level = j.you.level; remember(); warm(); draw(); });
    n.on('you', p => { let ch = false; if (p.gold != null) { S.gold = p.gold; ch = true; } if (p.level != null && p.level !== S.level) { S.level = p.level; ch = true; } if (ch) draw(); });
    n.on('bag', m => {
      const rm = new Set(m.remove || []);
      S.bag = S.bag.filter(i => !rm.has(i.uid));
      for (const it of m.add || []) {
        S.bag.push(it); S.fresh.add(it.uid); setTimeout(() => { S.fresh.delete(it.uid); if (!root.hidden) redrawSoon(); }, 2000);
        iconFor(it);
        if (slotOf(it)) { const req = levelCheck(it, level(), S.equipment); if (!req.ok) hud.chat(`${nameOf(it)} needs level ${req.level} to wear.`, 'system'); }
      }
      if (m.gold != null) S.gold = m.gold;
      remember(); draw();
    });
    n.on('equip', m => { S.equipment = { ...(m.equipment || {}) }; remember(); draw(); if (m.item) hud.chat(`You equip ${nameOf(m.item)}.`, 'system'); });
    n.on('err', e => { if (e.code === 'item' || e.code === 'bagFull') hud.toast(e.msg || 'You cannot do that.', 'warn'); });
  }

  return {
    wire, toggle, state: S, draw,
    /** Kept for older callers: the card is the shared tooltip now (data-tip-render="item"). */
    card() {}, hideCard: hideTip,
    get isOpen() { return !root.hidden; },
    /** Optional: tell the window your level when the game learns it first (a `level` event). */
    setLevel(lv) { if (lv && lv !== S.level) { S.level = lv; draw(); } },
    iconSpec: specFor,
  };
}
