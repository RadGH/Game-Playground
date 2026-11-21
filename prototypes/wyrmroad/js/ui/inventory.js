// Bag and gear: the paper doll (the live 3D hero wearing every piece, seven slots around it), the stat sheet (every
// number from heroStats — the one stat function — with base and gear parts in green/red, rule 5), the bag grid, and the
// picked item's card beside the one it would replace (compare always on screen, game-standards §5b; the Duelist can
// compare a blade against either hand). Equip, take off, sell (salvage) for gold.
import { heroStats, baseOf, canUse, SLOTS, dressedLook } from '../sim/items.js';
import { ask } from '../../../../shared/dialog.js';
import { hp as n } from '../../../../shared/format.js';
import { icon } from './icons.js';
import { esc, itemCardHtml, itemName, rarityColor, sheetRows, statAmount, SLOT_NAMES, CLASS_NAMES } from './text.js';
import { openSheet } from './kit.js';
import { equip, unequip, BAG_SIZE } from '../save.js';
import { sellPrice } from './peddler.js';

const LEFT = ['head', 'chest', 'legs', 'feet'], RIGHT = ['weapon', 'offhand', 'trinket'];

export function openInventory(app, h, { live = false, onChange = null } = {}) {
  const { data } = app;
  let sel = null, vsSlot = null, preview = null, closed = false;
  const sh = openSheet({ title: `${h.name} · Bag and gear`, wide: true, cls: 'wr-inv', body: `<div class="wr-inv-cols">
      <section class="wr-doll-col">
        <div class="wr-doll">
          <div class="wr-doll-side">${LEFT.map(s => `<button type="button" class="wr-slot" data-slot="${s}"></button>`).join('')}</div>
          <div class="wr-doll-stage"><canvas class="wr-preview" aria-label="${esc(h.name)} wearing their gear"></canvas><p class="wr-doll-cls"></p></div>
          <div class="wr-doll-side">${RIGHT.map(s => `<button type="button" class="wr-slot" data-slot="${s}"></button>`).join('')}</div>
        </div>
        <div class="wr-sheetstats"></div>
      </section>
      <section class="wr-bag-col">
        <h3>${icon('bag')}Bag <small class="wr-bag-count"></small><span class="wr-grow"></span><span class="wr-gold-pill">${icon('gold')}<b class="wr-inv-gold"></b></span></h3>
        <div class="wr-grid wr-bag"></div>
        <div class="wr-inv-detail"></div>
      </section>
    </div>`, onClose: () => { closed = true; preview?.dispose?.(); } });
  const root = sh.body;
  if (app.render?.createPreview) app.render.createPreview(root.querySelector('.wr-preview'), { data, quality: app.settings.quality }).then(p => { if (closed) { p.dispose?.(); return; } preview = p; p.setAnim('idle'); p.spin(false); look(); }).catch(e => console.warn(e));
  const look = () => { try { preview?.setLook(h.look, h.cls, h.gear); } catch (e) { console.warn(e); } };

  const cellHtml = (it, attrs) => {
    const b = baseOf(data.items, it), ok = canUse(data.items, h.cls, it);
    const tint = b?.look ? Object.values(b.look)[0]?.color || '#999' : '#999';
    return `<button type="button" class="wr-cell${sel?.uid === it.uid ? ' on' : ''}${ok ? '' : ' wr-cell-off'}" ${attrs} style="--rar:${rarityColor(data.items, it)};--tint:${tint}" ${b ? `data-icon-base="${esc(b.id)}"` : ''} aria-label="${esc(itemName(data.items, it))}">${icon(b?.slot || 'bag')}</button>`;
  };
  function draw() {
    // slots
    root.querySelectorAll('[data-slot]').forEach(el => {
      const s = el.dataset.slot, it = h.gear[s];
      const twoH = s === 'offhand' && h.gear.weapon && baseOf(data.items, h.gear.weapon)?.hand === 'two';
      el.className = `wr-slot${it ? ' full' : ''}${sel?.slot === s ? ' on' : ''}`;
      el.style.setProperty('--rar', it ? rarityColor(data.items, it) : 'transparent');
      el.innerHTML = `${icon(s)}<span><small>${SLOT_NAMES[s]}</small><b>${it ? esc(itemName(data.items, it)) : twoH ? 'Both hands on the weapon' : 'Empty'}</b></span>`;
      // the drawn icon (from the worn model) replaces the slot glyph once it is ready
      const ib = it && baseOf(data.items, it); if (ib) { el.dataset.iconBase = ib.id; el.dataset.iconPx = '36'; } else { delete el.dataset.iconBase; }
    });
    root.querySelector('.wr-doll-cls').textContent = `Level ${n(h.level)} ${CLASS_NAMES[h.cls]}`;
    root.querySelector('.wr-bag-count').textContent = `${n(h.bag.length)} of ${n(BAG_SIZE)}`;
    root.querySelector('.wr-inv-gold').textContent = n(h.gold);
    root.querySelector('.wr-bag').innerHTML = h.bag.map(it => cellHtml(it, `data-uid="${esc(it.uid)}"`)).join('') + Array.from({ length: Math.max(0, Math.min(6, BAG_SIZE - h.bag.length)) }, () => '<i class="wr-cell wr-cell-empty"></i>').join('');
    app.render?.paintItemIcons(root, data);      // optional: no 3D view → the tinted slot glyphs stay
    sheet(); detail();
  }
  /** The stat sheet; with a bag item picked, what equipping it would change (green/red). */
  function sheet() {
    const rows = sheetRows(data.classes, data.items, h, app.T);
    let after = null;
    const it = sel?.uid && h.bag.find(x => x.uid === sel.uid);
    if (it && canUse(data.items, h.cls, it)) { const b = baseOf(data.items, it), g = { ...h.gear, [b.slot]: it }; if (b.hand === 'two') delete g.offhand; after = heroStats(data.classes, data.items, { cls: h.cls, level: h.level, gear: g }); }
    root.querySelector('.wr-sheetstats').innerHTML = `<h3>${icon('info')}Your numbers</h3><dl class="wr-stats">${rows.map(r => {
      const d = after ? Math.round(((after[r.k] || 0) - r.total) * 10) / 10 : 0;
      const parts = r.gear ? ` <span class="wr-parts">(${statAmount(r.k, r.base, { sign: false })} <i class="${r.gear > 0 ? 'wr-up' : 'wr-down'}">${statAmount(r.k, r.gear)}</i>)</span>` : '';
      return `<div class="wr-stat${r.gear > 0 ? ' wr-stat-up' : r.gear < 0 ? ' wr-stat-down' : ''}"><dt>${esc(r.name)}</dt><dd><b>${statAmount(r.k, r.total, { sign: false })}</b>${parts}${d ? ` <em class="${d > 0 ? 'wr-up' : 'wr-down'}">${statAmount(r.k, d)}</em>` : ''}</dd><p>${esc(r.text)}</p></div>`;
    }).join('')}</dl>`;
  }
  function detail() {
    const box = root.querySelector('.wr-inv-detail');
    if (!sel) { box.innerHTML = '<p class="wr-dim">Pick something in your bag or on your hero to see its numbers next to what you wear.</p>'; return; }
    if (sel.slot) {
      const it = h.gear[sel.slot];
      box.innerHTML = `<div class="wr-compare wr-compare-one"><div><h4>${esc(SLOT_NAMES[sel.slot])}</h4>${itemCardHtml(data.items, it, { cls: h.cls, expand: true })}</div></div>
        <div class="wr-inv-acts">${it ? `<button type="button" class="wr-btn" data-act="unequip" ${h.bag.length >= BAG_SIZE ? 'disabled' : ''}>${icon('bag')}<span>Take off</span></button>${h.bag.length >= BAG_SIZE ? '<p class="wr-why">Your bag is full</p>' : ''}` : ''}</div>`;
      return;
    }
    const it = h.bag.find(x => x.uid === sel.uid); if (!it) { sel = null; return detail(); }
    const b = baseOf(data.items, it), ok = canUse(data.items, h.cls, it);
    const blades = h.cls === 'duelist' && (b.slot === 'weapon' || b.slot === 'offhand');
    const vs = vsSlot && blades ? vsSlot : b.slot, worn = h.gear[vs];
    box.innerHTML = `${blades ? `<div class="wr-vs" role="group" aria-label="Compare with">${['weapon', 'offhand'].map(s => `<button type="button" class="wr-btn wr-small${vs === s ? ' on' : ''}" data-vs="${s}" aria-pressed="${vs === s}">Compare: ${s === 'weapon' ? 'Main blade' : 'Off blade'}</button>`).join('')}</div>` : ''}
      <div class="wr-compare">
        <div><h4>In your bag</h4>${itemCardHtml(data.items, it, { cls: h.cls, vs: worn, expand: true, price: sellPrice(data.items, it), priceLabel: 'Sells for' })}</div>
        <div><h4>You wear (${esc(SLOT_NAMES[vs])})</h4>${itemCardHtml(data.items, worn, { cls: h.cls, expand: true })}</div>
      </div>
      <div class="wr-inv-acts">
        <button type="button" class="wr-btn wr-primary" data-act="equip" ${ok ? '' : 'disabled'}>${icon('check')}<span>Wear it${b.slot !== vs ? ` (${SLOT_NAMES[b.slot]})` : ''}</span></button>
        <button type="button" class="wr-btn wr-ghost" data-act="sell">${icon('gold')}<span>Sell for ${n(sellPrice(data.items, it))} gold</span></button>
        ${ok ? '' : `<p class="wr-why">${esc(b.cls.map(c => CLASS_NAMES[c]).join(', '))} only</p>`}
      </div>`;
  }
  /** In a chapter, the hero on the street wears the change at once (local play; online it counts from the next chapter). */
  function applyLive() {
    look(); onChange?.();
    if (!live) return;
    const s = app.session; if (!s || s.online) return;
    const slot = (app.party || []).find(p => p.heroId === h.id), e = slot && s.G.heroes.find(x => x.pid === slot.pid); if (!e) return;
    const st = heroStats(data.classes, data.items, { cls: h.cls, level: e.level, gear: h.gear });
    const r = e.hp / e.max;
    e.gear = h.gear; e.stats = st; e.max = st.hp; e.mpMax = st.mp; e.hp = Math.max(1, Math.round(st.hp * r)); e.mp = Math.min(e.mp, st.mp);
    e.look = dressedLook(data.classes, data.items, { cls: h.cls, look: h.look, gear: h.gear });
  }
  root.addEventListener('click', async e => {
    const c = e.target.closest('[data-uid]'); if (c) { sel = { uid: c.dataset.uid }; vsSlot = null; app.audio.play('ui.click'); draw(); return; }
    const s = e.target.closest('[data-slot]'); if (s) { sel = { slot: s.dataset.slot }; app.audio.play('ui.click'); draw(); return; }
    const v = e.target.closest('[data-vs]'); if (v) { vsSlot = v.dataset.vs; detail(); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'equip' && sel?.uid) { if (equip(data, h, sel.uid)) { app.audio.play('equip'); sel = null; } }
    else if (a.dataset.act === 'unequip' && sel?.slot) { if (unequip(h, sel.slot)) { app.audio.play('equip'); sel = null; } }
    else if (a.dataset.act === 'sell' && sel?.uid) {
      const it = h.bag.find(x => x.uid === sel.uid); if (!it) return;
      if (['storied', 'legendary'].includes(it.rarity) && !(await ask({ title: `Sell ${itemName(data.items, it)}?`, text: `It is ${it.rarity === 'legendary' ? 'Legendary' : 'Storied'}. The Peddler pays ${n(sellPrice(data.items, it))} gold and it is gone for good.`, ok: 'Sell it', danger: true }))) return;
      h.bag = h.bag.filter(x => x.uid !== it.uid); h.gold += sellPrice(data.items, it); app.audio.play('coin'); sel = null;
    }
    app.saveNow(); applyLive(); draw();
  });
  draw();
  return sh;
}
