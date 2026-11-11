// Town windows (M13): the trader (buy, sell, mend), the potion seller, the gambler, and the stash — the stash is kept on
// this device and shared by every hero here (ruling 11); items move through the sim (it checks anything coming out).
import { itemTip, glyph, rarityClass } from './sheet-ui.js';
import { itemName } from '../rules/items.js';
import { sellPrice } from '../rules/loot.js';
import { fits, findSpot } from '../rules/bag.js';
import { hirePrice, revivePrice } from '../sim/mercs.js';
import { respecPointsCost, respecSpecCost } from '../sim/skills.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const STASH_KEY = 'rogueloot.stash.v1', STASH_W = 10, STASH_H = 8;
export const readStash = () => { try { return JSON.parse(localStorage.getItem(STASH_KEY) || '[]'); } catch { return []; } };
const writeStash = l => { try { localStorage.setItem(STASH_KEY, JSON.stringify(l)); } catch { /* full or private */ } };

export function createTownUI({ content, send, getChar }) {
  const D = content.items, P = content.potions;
  const root = document.createElement('div'); root.className = 'modal town-ui'; root.hidden = true; document.body.append(root);
  let state = null;
  root.addEventListener('click', e => { if (e.target === root || e.target.closest('[data-close]')) close(); });
  function close() { root.hidden = true; state = null; tipOff(); }
  /** The sim answered a 'shop' ask with the stock. */
  function onShop(e) { state = { npc: e.npc, data: e }; root.hidden = false; draw(); }
  function openStash() { state = { npc: 'stash' }; root.hidden = false; draw(); }
  function onStashed(item) { const l = readStash(); const pos = findSpot(D, l, item, STASH_W, STASH_H) || { x: 0, y: 0 }; l.push({ ...item, pos }); writeStash(l); if (state?.npc === 'stash') draw(); }
  function onUnstashed(uid) { writeStash(readStash().filter(i => i.uid !== uid)); if (state?.npc === 'stash') draw(); }
  function draw() {
    if (!state) return; const ch = getChar(); if (!ch) return;
    const gold = `<span class="gold">🪙 ${ch.gold || 0} gold</span>`;
    const bagList = (act, label) => `<div class="tlist">${(ch.bag || []).map(it => `<button class="trow ${rarityClass(it)}" data-uid="${it.uid}" data-act="${act}"><span class="g">${glyph(D, it)}</span><span class="nm">${esc(it.base === 'potion' ? `${P.sizes[it.size]?.name} ${it.kind} potion ×${it.n}` : itemName(D, it))}</span><span class="pr">${label(it)}</span></button>`).join('') || '<p>Your bag is empty.</p>'}</div>`;
    let body = '';
    if (state.npc === 'vendor') {
      const items = state.data.items || [];
      body = `<h2>Trader</h2>${gold}<h3>For sale</h3><div class="tlist">${items.map(it => `<button class="trow ${rarityClass(it)}" data-buy="${it.uid}"><span class="g">${glyph(D, it)}</span><span class="nm">${esc(itemName(D, it))}</span><span class="pr ${it.price > (ch.gold || 0) ? 'bad' : ''}">${it.price}</span></button>`).join('') || '<p>Sold out.</p>'}</div>
        <h3>Sell from your bag</h3>${bagList('sell', it => it.base === 'potion' ? '' : sellPrice(D, it))}
        ${state.data.repair ? `<button class="primary mend" data-repair>Mend all your gear: ${state.data.repair} gold</button>` : '<p class="ok">Your gear is in good repair.</p>'}`;
    } else if (state.npc === 'potions') {
      body = `<h2>Potion seller</h2>${gold}<div class="tlist">${(state.data.potions || []).map(r => `<button class="trow" data-pot="${r.kind}:${r.size}"><span class="g">${r.kind === 'mana' ? '💧' : '❤'}</span><span class="nm">${esc(P.sizes[r.size]?.name)} ${r.kind === 'mana' ? 'mana' : 'healing'} potion</span><span class="pr ${r.price > (ch.gold || 0) ? 'bad' : ''}">${r.price}</span></button>`).join('')}</div>
        <h3>Sell from your bag</h3>${bagList('sell', it => it.base === 'potion' ? '' : sellPrice(D, it))}${state.data.repair ? `<button class="primary mend" data-repair>Mend all your gear: ${state.data.repair} gold</button>` : ''}`;
    } else if (state.npc === 'gambler') {
      body = `<h2>Gambler</h2>${gold}<p>Pay for a covered item of the kind you choose. Most are magic; some are rare; a very few are something special.</p><div class="tlist">${(state.data.gamble || []).map(g => `<button class="trow" data-gamble="${g.kind}"><span class="g">🎲</span><span class="nm">${esc({ weapon: 'A weapon', armour: 'A piece of armour', offhand: 'A shield or off-hand', jewellery: 'A ring or amulet', belt: 'A belt' }[g.kind])}</span><span class="pr ${g.price > (ch.gold || 0) ? 'bad' : ''}">${g.price}</span></button>`).join('')}</div>`;
    } else if (state.npc === 'stash') {
      const st = readStash();
      body = `<h2>Stash</h2><p>Shared by every hero on this device. Tap an item to move it.</p>
        <div class="bag stash" style="--w:${STASH_W};--h:${STASH_H}">${st.map(it => { const g = it.base === 'potion' ? { w: 1, h: 1 } : (D.bases[it.base]?.grid || { w: 1, h: 1 }); return `<button class="item ${rarityClass(it)}" data-out="${it.uid}" style="grid-column:${it.pos.x + 1}/span ${g.w};grid-row:${it.pos.y + 1}/span ${g.h}">${glyph(D, it)}</button>`; }).join('')}${cells(STASH_W, STASH_H)}</div>
        <h3>Your bag</h3>${bagList('stash', () => '→ stash')}`;
    } else if (state.npc === 'crafter') {
      const C = content.currency, cur = (ch.bag || []).filter(i => i.base === 'shard' || i.base === 'dust');
      body = `<h2>Crafter</h2><p>Shape items with shards from your bag (select a shard, then tap the item). Here I can turn ${C?.convert?.up?.ratio || 5} shards into one of the next grade, and ${C?.convert?.dustToGlimmer || 20} dust into a Glimmer Shard.</p>
        <div class="tlist">${cur.map(it => `<button class="trow" data-conv="${it.uid}"><span class="g">${glyph(D, it)}</span><span class="nm">${esc(it.base === 'dust' ? `Shard Dust ×${it.n}` : `${C.grades[it.grade - 1]?.name} ${C.shards.find(x => x.id === it.shard)?.name} ×${it.n}`)}</span><span class="pr">${it.base === 'dust' ? '→ Glimmer' : it.grade < C.grades.length ? `→ ${C.grades[it.grade]?.name} (${C.convert.up.convertGoldPerGrade[it.grade - 1]} gold)` : ''}</span></button>`).join('') || '<p>You carry no shards.</p>'}</div>
        <h3>Break items for shards</h3>${bagList('salvage', () => 'break')}`;
    } else if (state.npc === 'mercenary') {
      const M = content.mercs, m = ch.merc, K = m && M.kinds[m.kind];
      const gearRow = slot => { const it = m?.equip?.[slot]; return `<div class="mrow"><b>${{ weapon: 'Weapon', chest: 'Chest', head: 'Head' }[slot]}</b> ${it ? `<span class="${rarityClass(it)}">${esc(itemName(D, it))}</span> <button data-take="${slot}">Take back</button>` : '<em>nothing</em>'}</div>`; };
      body = `<h2>Mercenary hall</h2><span class="gold">🪙 ${ch.gold || 0} gold</span>
        ${m ? `<h3>${esc(m.name)}, your ${esc(K?.name || m.kind)} (level ${ch.level})</h3><p>${esc(K?.blurb || '')}</p>${m.dead ? `<button class="primary" data-revive>Bring ${esc(m.name)} back: ${revivePrice(M, ch.level)} gold</button>` : '<p class="ok">Ready and at your side.</p>'}
          ${['weapon', 'chest', 'head'].map(gearRow).join('')}<h3>Give from your bag</h3><div class="tlist">${(ch.bag || []).filter(it => ['weapon', 'chest', 'head'].includes(D.bases[it.base]?.slot)).map(it => `<button class="trow ${rarityClass(it)}" data-give="${it.uid}" data-slot="${D.bases[it.base].slot}"><span class="g">${glyph(D, it)}</span><span class="nm">${esc(itemName(D, it))}</span><span class="pr">give</span></button>`).join('') || '<p>Nothing they could wear.</p>'}</div>
          <button data-dismiss>Let ${esc(m.name)} go</button>` : `<p>Hire a companion who fights beside you, grows with you and wears what you give them. One at a time.</p>
          <label class="row">Name (optional) <input class="mname" maxlength="16" placeholder="${esc(M.names[0])}"></label>
          <div class="tlist">${Object.entries(M.kinds).map(([id, k]) => `<button class="trow" data-hire="${id}"><span class="g">${id === 'shieldbearer' ? '🛡' : id === 'archer' ? '🏹' : '🔥'}</span><span class="nm"><b>${esc(k.name)}</b><br><small>${esc(k.blurb)}</small></span><span class="pr ${hirePrice(M, id, ch.level) > (ch.gold || 0) ? 'bad' : ''}">${hirePrice(M, id, ch.level)}</span></button>`).join('')}</div>`}`;
    } else if (state.npc === 'trainer') {
      const others = Object.entries(content.specs || {}).filter(([id, sp]) => (sp.paths || []).includes(ch.path) && id !== ch.spec);
      body = `<h2>Trainer</h2><span class="gold">🪙 ${ch.gold || 0} gold</span>
        <h3>Unlearn your skills</h3><p>Every point you spent comes back to spend again (your Path's first skills stay).</p><button class="primary" data-respec-points>Unlearn everything: ${respecPointsCost(ch.level)} gold</button>
        ${ch.spec && others.length ? `<h3>Change specialization</h3><p>Leave the ${esc(content.specs[ch.spec]?.name)} for another; your points come back too.</p><div class="tlist">${others.map(([id, sp]) => `<button class="trow" data-respec-spec="${id}"><span class="g">✦</span><span class="nm">${esc(sp.name)}</span><span class="pr ${respecSpecCost(ch.level) > (ch.gold || 0) ? 'bad' : ''}">${respecSpecCost(ch.level)}</span></button>`).join('')}</div>` : ch.path ? '<p>You choose a specialization at level 10.</p>' : ''}`;
    } else body = `<h2>${esc(state.npc)}</h2><p>They have nothing for you yet.</p>`;
    root.innerHTML = `<div class="panel town-panel">${body}<div class="btns"><button data-close class="primary">Done</button></div></div>`;
    root.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => send({ do: 'buy', uid: b.dataset.buy }));
    root.querySelectorAll('[data-act="sell"]').forEach(b => b.onclick = () => send({ do: 'sell', uid: b.dataset.uid }));
    root.querySelector('[data-respec-points]')?.addEventListener('click', () => { if (confirm('Unlearn every skill point?')) send({ do: 'respec', op: 'points' }); });
    root.querySelectorAll('[data-respec-spec]').forEach(b => b.onclick = () => { if (confirm(`Become a ${content.specs[b.dataset.respecSpec].name} instead?`)) send({ do: 'respec', op: 'spec', spec: b.dataset.respecSpec }); });
    root.querySelectorAll('[data-hire]').forEach(b => b.onclick = () => send({ do: 'merc', op: 'hire', kind: b.dataset.hire, name: root.querySelector('.mname')?.value || '' }));
    root.querySelector('[data-revive]')?.addEventListener('click', () => send({ do: 'merc', op: 'revive' }));
    root.querySelector('[data-dismiss]')?.addEventListener('click', () => { if (confirm('Let them go? Their gear comes back to your bag.')) send({ do: 'merc', op: 'dismiss' }); });
    root.querySelectorAll('[data-give]').forEach(b => b.onclick = () => send({ do: 'merc', op: 'give', uid: b.dataset.give, slot: b.dataset.slot }));
    root.querySelectorAll('[data-take]').forEach(b => b.onclick = () => send({ do: 'merc', op: 'take', slot: b.dataset.take }));
    root.querySelectorAll('[data-conv]').forEach(b => b.onclick = () => send({ do: 'convert', uid: b.dataset.conv }));
    root.querySelectorAll('[data-act="salvage"]').forEach(b => b.onclick = () => { if (confirm('Break it for dust and shards?')) send({ do: 'salvage', uid: b.dataset.uid }); });
    root.querySelectorAll('[data-act="stash"]').forEach(b => b.onclick = () => send({ do: 'stash', uid: b.dataset.uid }));
    root.querySelectorAll('[data-out]').forEach(b => b.onclick = () => { const it = readStash().find(i => i.uid === b.dataset.out); if (it) send({ do: 'unstash', item: it }); });
    root.querySelectorAll('[data-pot]').forEach(b => b.onclick = () => { const [kind, size] = b.dataset.pot.split(':'); send({ do: 'buyPotion', kind, size }); });
    root.querySelectorAll('[data-gamble]').forEach(b => b.onclick = () => send({ do: 'gamble', kind: b.dataset.gamble }));
    root.querySelector('[data-repair]')?.addEventListener('click', () => send({ do: 'repair' }));
    // hover / long-press tips
    root.querySelectorAll('[data-buy],[data-uid],[data-out]').forEach(b => {
      const it = (state.data?.items || []).find(i => i.uid === b.dataset.buy) || (ch.bag || []).find(i => i.uid === b.dataset.uid) || readStash().find(i => i.uid === b.dataset.out);
      if (!it) return;
      b.onpointerenter = e => { if (e.pointerType === 'mouse') tipOn(b, it, ch); };
      b.onpointerleave = tipOff;
    });
  }
  const cells = (W, H) => { let s = ''; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) s += `<i class="cell" style="grid-column:${x + 1};grid-row:${y + 1}"></i>`; return s; };
  let tip = null;
  function tipOn(anchor, it, ch) { tipOff(); tip = document.createElement('div'); tip.className = 'tip-float'; const b = D.bases[it.base]; tip.innerHTML = itemTip(D, it, ch, b ? ch.equip?.[b.slot === 'ring' ? 'ring1' : b.slot] : null, P); document.body.append(tip); const r = anchor.getBoundingClientRect(); let x = r.right + 8; if (x + tip.offsetWidth > innerWidth - 8) x = Math.max(8, r.left - tip.offsetWidth - 8); tip.style.left = x + 'px'; tip.style.top = Math.min(r.top, innerHeight - tip.offsetHeight - 8) + 'px'; }
  function tipOff() { tip?.remove(); tip = null; }
  return { onShop, openStash, onStashed, onUnstashed, refresh: () => { if (state && state.npc !== 'stash' && state.data) send({ do: 'shop', npc: state.npc }); else draw(); }, close, get open() { return !root.hidden; }, get npc() { return state?.npc; } };
}
void fits;
