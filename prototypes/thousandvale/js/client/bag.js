// The bag and worn gear (protocol §12). The server owns both; this draws what `joined.you.bag/equipment`,
// `bag {add, remove, gold}` and `equip {slot, item, equipment}` say, and sends `item {op, uid, slot?}`.
// Click a bag item to wear it, click a worn item to take it off, right-click to throw it away (asks first).
// Hovering any item shows its card. DOM only.

const $ = id => document.getElementById(id);
const SLOTS = ['weapon', 'offhand', 'head', 'chest', 'legs', 'hands', 'feet', 'necklace', 'ring', 'ring2'];   // Farhold's rpg.js SLOTS (mount/light/tool shown when worn)
const SLOT_NAME = { head: 'Head', chest: 'Chest', legs: 'Legs', feet: 'Feet', hands: 'Hands', mainhand: 'Weapon', offhand: 'Off hand', neck: 'Neck', necklace: 'Neck', ring: 'Ring', ring2: 'Ring', weapon: 'Weapon', shield: 'Off hand', mount: 'Mount', light: 'Light', tool: 'Tool' };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const title = s => String(s || '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase());

export function createBag({ net: getNet, hud }) {
  const el = { root: $('bag'), grid: $('bag-grid'), doll: $('paperdoll'), gold: $('bag-gold'), close: $('bag-close'), btn: $('bag-btn'), count: $('bag-count'), card: $('itemcard') };
  const S = { bag: [], equipment: {}, gold: 0, fresh: new Set() };
  el.close.onclick = () => toggle(false);
  el.btn.onclick = () => toggle();

  function toggle(open = el.root.hidden) { el.root.hidden = !open; if (open) draw(); else hideCard(); }

  function card(item, ev) {
    if (!item) return hideCard();
    const r = item.rarity || 'common';
    const lines = [];
    if (item.damage) lines.push(`${Array.isArray(item.damage) ? item.damage.join('–') : item.damage} damage`);
    if (item.armor || item.armour) lines.push(`${item.armor || item.armour} armour`);
    for (const a of item.affixes || item.mods || []) lines.push(esc(a.text || `${title(a.stat || a.id)} ${a.value > 0 ? '+' : ''}${a.value ?? ''}`));
    if (item.stats && typeof item.stats === 'object') for (const [k, v] of Object.entries(item.stats)) lines.push(`${title(k)} ${v > 0 ? '+' : ''}${v}`);
    if (item.power?.text || item.uniquePower) lines.push(`<span class="r-legendary">${esc(item.power?.text || item.uniquePower)}</span>`);
    el.card.innerHTML = `<h4 class="r-${esc(r)}">${esc(item.name)}</h4>
      <div class="meta">${esc(title(r))} ${esc(item.kind === 'junk' ? 'junk' : SLOT_NAME[item.slot] || title(item.slot || item.kind || 'item'))}${item.level ? ` · level ${item.level}` : ''}</div>
      ${lines.map(l => `<div class="line">${l}</div>`).join('')}
      ${item.value ? `<div class="value">Worth ${item.value} gold</div>` : ''}`;
    el.card.hidden = false;
    const x = Math.min(window.innerWidth - 270, ev.clientX + 14), y = Math.min(window.innerHeight - el.card.offsetHeight - 8, ev.clientY + 10);
    el.card.style.left = x + 'px'; el.card.style.top = y + 'px';
  }
  function hideCard() { el.card.hidden = true; }

  function slotEl(item, label = '') {
    const d = document.createElement('div');
    d.className = 'islot' + (item ? ` r-${item.rarity || 'common'}` + (item.kind === 'junk' ? ' junk' : '') + (S.fresh.has(item.uid) ? ' fresh' : '') : ' empty');
    d.innerHTML = item ? `<span class="glyph">${esc((item.name || '?')[0])}</span>` : '';
    if (label) { const s = document.createElement('span'); s.className = 'slotname'; s.textContent = label; d.appendChild(s); }
    if (item) {
      d.addEventListener('pointermove', e => card(item, e));
      d.addEventListener('pointerleave', hideCard);
    }
    return d;
  }

  function draw() {
    el.gold.textContent = `${S.gold.toLocaleString()} gold`;
    el.count.textContent = S.bag.length ? S.bag.length : '';
    if (el.root.hidden) return;
    el.doll.innerHTML = '';
    const worn = S.equipment || {};
    const slots = [...new Set([...SLOTS, ...Object.keys(worn).filter(k => worn[k])])];
    for (const sl of slots) {
      const it = worn[sl] || null;
      const d = slotEl(it, SLOT_NAME[sl] || title(sl));
      if (it) d.onclick = () => { getNet()?.item('unequip', it.uid, sl); hideCard(); };
      el.doll.appendChild(d);
    }
    el.grid.innerHTML = '';
    const n = Math.max(24, Math.ceil((S.bag.length + 1) / 6) * 6);
    for (let k = 0; k < n; k++) {
      const it = S.bag[k] || null;
      const d = slotEl(it);
      if (it) {
        d.onclick = () => { if (it.slot) { getNet()?.item('equip', it.uid); hideCard(); } else hud.toast('That cannot be worn.', 'warn'); };
        d.oncontextmenu = e => { e.preventDefault(); if (confirm(`Throw away ${it.name}?`)) getNet()?.item('destroy', it.uid); };
      }
      el.grid.appendChild(d);
    }
  }

  function wire(n) {
    n.on('joined', j => { S.bag = [...(j.you.bag || [])]; S.equipment = { ...(j.you.equipment || {}) }; S.gold = j.you.gold || 0; draw(); });
    n.on('you', p => { if (p.gold != null) { S.gold = p.gold; draw(); } });
    n.on('bag', m => {
      const rm = new Set(m.remove || []);
      S.bag = S.bag.filter(i => !rm.has(i.uid));
      for (const it of m.add || []) { S.bag.push(it); S.fresh.add(it.uid); setTimeout(() => S.fresh.delete(it.uid), 2000); }
      if (m.gold != null) S.gold = m.gold;
      draw();
    });
    n.on('equip', m => { S.equipment = { ...(m.equipment || {}) }; draw(); if (m.item) hud.chat(`You equip ${m.item.name}.`, 'system'); });
    n.on('err', e => { if (e.code === 'item' || e.code === 'bagFull') hud.toast(e.msg || 'You cannot do that.', 'warn'); });
  }

  return { wire, toggle, state: S, draw };
}
