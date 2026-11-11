// Party frames (M18): every other hero in the game, their health when they share your area, or where they are when
// they don't; tap one to trade (ruling 5: anywhere). The trade window and the "X wants to trade" ask.
import { itemName } from '../rules/items.js';
import { glyph, rarityClass, itemTip } from './sheet-ui.js';
import { ask, tell, askText } from '../../../../shared/dialog.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function createPartyUI({ content, send, getChar, zoneName }) {
  const D = content.items, frames = document.createElement('div'); frames.className = 'party'; document.body.append(frames);
  const win = document.createElement('div'); win.className = 'modal trade-ui'; win.hidden = true; document.body.append(win);
  let trade = null, roster = [], me = null;
  function setRoster(list, myId) { roster = list; me = myId; }
  /** Called with every snapshot: draw the frames. */
  function update(snapPlayers, myArea) {
    const others = roster.filter(p => p.id !== me);
    frames.hidden = !others.length;
    frames.innerHTML = others.map(p => { const s = snapPlayers?.get(p.id); const here = p.area === myArea && s;
      return `<button class="pf ${s?.dead ? 'dead' : ''} ${p.away ? 'away' : ''}" data-pid="${p.id}"><b>${esc(p.name)}</b><small>${here ? `Level ${s.lvl}` : esc(zoneName(p.area))}${p.away ? ' · away' : ''}</small>${here ? `<i class="hp"><b style="width:${Math.max(0, s.hp / s.mhp * 100)}%"></b></i>` : ''}</button>`; }).join('');
    frames.querySelectorAll('[data-pid]').forEach(b => b.onclick = () => { ask({ title: `Trade with ${roster.find(r => r.id === b.dataset.pid)?.name}?`, ok: 'Ask' }).then(y => y && send({ do: 'trade', op: 'ask', to: b.dataset.pid })); });
  }
  function onEvent(e) {
    if (e.k === 'trade-ask') { ask({ title: `${e.name} wants to trade`, ok: 'Open trade', cancel: 'No thanks' }).then(y => send(y ? { do: 'trade', op: 'accept', from: e.from } : { do: 'trade', op: 'cancel' })); return true; }
    if (e.k === 'trade') { trade = e; draw(); return true; }
    if (e.k === 'trade-end') { trade = null; win.hidden = true; if (e.why !== 'done' && e.why !== 'cancelled') tell({ title: 'Trade ended', text: e.why }); return true; }
    return false;
  }
  function draw() {
    if (!trade) return; const ch = getChar(); win.hidden = false;
    const offered = new Set(trade.mine.items.map(i => i.uid));
    const row = (it, act) => `<button class="trow ${rarityClass(it)}" ${act ? `data-tg="${it.uid}"` : ''}><span class="g">${glyph(D, it)}</span><span class="nm">${esc(it.base === 'potion' || it.base === 'shard' || it.base === 'dust' ? (it.base + ' ×' + it.n) : itemName(D, it))}</span></button>`;
    win.innerHTML = `<div class="panel trade-panel"><h2>Trading with ${esc(trade.name)}</h2>
      <div class="cols2"><section><h3>You give</h3><div class="tlist">${trade.mine.items.map(it => row(it, true)).join('') || '<p>Nothing yet. Tap items in your bag below.</p>'}</div>
        <label class="row">Gold <input type="number" min="0" max="${ch?.gold || 0}" value="${trade.mine.gold}" class="tgold"></label></section>
      <section><h3>You get</h3><div class="tlist">${trade.theirs.items.map(it => row(it, false)).join('') || '<p>Nothing yet.</p>'}</div><p>Gold: <b>${trade.theirs.gold}</b></p><p class="${trade.theyOk ? 'ok' : ''}">${trade.theyOk ? `${esc(trade.name)} says yes.` : `${esc(trade.name)} has not said yes.`}</p></section></div>
      <h3>Your bag</h3><div class="tlist bagpick">${(ch?.bag || []).filter(i => !offered.has(i.uid)).map(it => row(it, true)).join('') || '<p>Empty.</p>'}</div>
      <div class="btns"><button data-cancel>Cancel</button><button class="primary" data-ok ${trade.ok ? 'disabled' : ''}>${trade.ok ? 'Waiting for them…' : 'Yes, trade'}</button></div></div>`;
    win.querySelectorAll('[data-tg]').forEach(b => b.onclick = () => { const id = b.dataset.tg; const items = offered.has(id) ? [...offered].filter(x => x !== id) : [...offered, id]; send({ do: 'trade', op: 'offer', items, gold: +win.querySelector('.tgold').value || 0 }); });
    win.querySelector('.tgold').onchange = e => send({ do: 'trade', op: 'offer', items: [...offered], gold: +e.target.value || 0 });
    win.querySelector('[data-ok]').onclick = () => send({ do: 'trade', op: 'ok' });
    win.querySelector('[data-cancel]').onclick = () => send({ do: 'trade', op: 'cancel' });
    void itemTip;
  }
  return { setRoster, update, onEvent, get open() { return !win.hidden; } };
}
