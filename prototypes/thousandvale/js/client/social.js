// Party frames, the party menu (invite by name, copy the join link, leave) and invite pop-ups. Everything goes
// through stream A's client (`net.partyOp`, `net.joinLink()`; protocol §11). DOM only. Chat channels and the
// slash commands moved to chat.js at M3 (it calls invite / copyLink here).

const $ = id => document.getElementById(id);
const CLASS_NAME = id => String(id || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function createSocial({ net: getNet, hud, actors, onTarget, myChar }) {
  const el = {
    frames: $('party'), btn: $('party-btn'), menu: $('party-menu'), name: $('invite-name'), go: $('invite-go'), link: $('join-link'), copy: $('join-copy'),
    leave: $('party-leave'), close: $('party-close'), help: $('party-help'), pop: $('invite-pop'), popText: $('invite-text'), yes: $('invite-yes'), no: $('invite-no'),
  };
  let party = null, frames = new Map(), pendingInvite = null, wantLink = false;
  const net = () => getNet();

  // --- party menu ---------------------------------------------------------------------------------
  function toggleMenu(open = el.menu.hidden) {
    el.menu.hidden = !open;
    el.btn.classList.toggle('on', open);
    if (open) { refreshLink(); el.name.focus(); }
  }
  el.btn.onclick = () => toggleMenu();
  el.close.onclick = () => toggleMenu(false);
  el.go.onclick = () => invite(el.name.value);
  el.name.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') invite(el.name.value); if (e.key === 'Escape') toggleMenu(false); });
  el.copy.onclick = () => copyLink();
  el.leave.onclick = () => { net()?.partyOp('leave'); toggleMenu(false); };
  el.yes.onclick = () => answer(true);
  el.no.onclick = () => answer(false);

  function invite(name) {
    const n = String(name || '').trim();
    if (!n) return;
    net()?.partyOp('invite', { name: n });
    hud.chat(`You invite ${n} to your party.`, 'party');
    el.name.value = '';
  }
  function refreshLink() {
    const link = net()?.joinLink();
    el.link.value = link || '';
    el.link.placeholder = link ? '' : 'Click "Copy link" to make one';
    el.leave.hidden = !party;
  }
  async function copyLink() {
    const link = net()?.joinLink();
    if (!link) { wantLink = true; net()?.partyOp('code'); return; }   // makes a party; partyState brings the code
    el.link.value = link;
    let ok = false;
    try { await navigator.clipboard.writeText(link); ok = true; } catch { el.link.select(); try { ok = document.execCommand('copy'); } catch {} }
    hud.toast(ok ? 'Join link copied — send it to a friend.' : 'Select the link and copy it.', ok ? 'good' : 'info');
    hud.chat(`Join link: ${link}`, 'party');
  }
  function answer(yes) {
    if (!pendingInvite) return;
    net()?.partyOp(yes ? 'accept' : 'decline', { party: pendingInvite.party });
    el.pop.hidden = true; pendingInvite = null;
  }

  // --- frames -------------------------------------------------------------------------------------
  function render() {
    const me = myChar();
    const others = party ? party.members.filter(m => m.char !== me) : [];
    el.frames.hidden = !others.length;
    // (play-test 6 U1: the Party button's badge is NEWS only — unseen mail / friends, ui/unseen.js — never the size of your party)
    const keep = new Set();
    for (const m of others) {
      keep.add(m.char);
      let f = frames.get(m.char);
      if (!f) {
        const root = document.createElement('div'); root.className = 'pmember';
        root.innerHTML = '<div class="pm-icon"></div><div class="pm-body"><div class="pm-name"></div><div class="bar hp"><i></i></div><div class="bar mp" hidden><i></i><span></span></div><div class="pm-where"></div></div>';
        // T3 (play-test 5): a click targets them — your heals and wards then go to them; say so when they are out of reach
        root.onclick = () => { const fr = frames.get(m.char); if (fr?.id) onTarget?.(fr.id); else hud.toast(`${fr?.member?.name || m.name} is too far away to target.`, 'warn'); };
        root.dataset.tip = 'Click to target — your heals and wards go to your target';
        el.frames.appendChild(root);
        f = { root, icon: root.querySelector('.pm-icon'), name: root.querySelector('.pm-name'), bar: root.querySelector('.bar.hp i'), mp: root.querySelector('.bar.mp'), where: root.querySelector('.pm-where') };
        frames.set(m.char, f);
      }
      // play-test 2 Q13: the member's portrait (ui/portraits.js, static + cached) instead of a letter
      const pic = api.portraitFor?.(m);
      if (pic) { if (f.icon.dataset.pic !== pic) { f.icon.dataset.pic = pic; f.icon.textContent = ''; f.icon.style.backgroundImage = `url("${pic}")`; f.icon.classList.add('pic'); } }
      else if (!f.icon.dataset.pic) f.icon.textContent = (m.name[0] || '?').toUpperCase();
      f.name.innerHTML = '';
      f.name.append(document.createTextNode(m.name));
      const sm = document.createElement('small'); sm.textContent = `${m.level} ${CLASS_NAME(m.cls)}`; f.name.append(sm);
      f.root.classList.toggle('leader', party.leader === m.char);
      f.root.classList.toggle('offline', !m.online);
      f.member = m;
    }
    for (const [c, f] of frames) if (!keep.has(c)) { f.root.remove(); frames.delete(c); }
    refreshLink();
  }
  function onFrames(list) {
    const myRoom = net()?.joined?.room?.id;
    for (const r of list) {
      const f = frames.get(r.char); if (!f) continue;
      f.bar.style.width = (r.hpMax ? Math.max(0, r.hp / r.hpMax) * 100 : 0).toFixed(1) + '%';
      // R6: mana when the server sends it on party frames (mp / mpMax)
      const live = r.id != null && actors?.get?.(r.id);
      if (!(r.mpMax > 0) && live?.mpMax > 0) { r.mp = live.mp; r.mpMax = live.mpMax; }   // in view: the mp events fill in
      if (f.mp) { const has = r.mpMax > 0; f.mp.hidden = !has; if (has) { f.mp.querySelector('i').style.width = (Math.max(0, r.mp / r.mpMax) * 100).toFixed(1) + '%'; f.mp.dataset.tip = `Mana: ${Math.round(r.mp)} / ${Math.round(r.mpMax)}`; } }
      const ac = r.id != null && actors?.get?.(r.id); if (ac && r.mpMax > 0) { ac.mp = r.mp; ac.mpMax = r.mpMax; }
      f.root.classList.toggle('dead', r.dead);
      f.root.classList.toggle('offline', !r.online);
      const away = r.room !== myRoom;
      f.root.classList.toggle('away', away);
      f.id = away ? null : r.id;
      f.where.textContent = !r.online ? 'Offline' : r.dead ? 'Fallen' : away ? roomName(r.room) : '';
    }
  }
  const roomName = id => (!id ? '' : id === 'town' ? 'In town' : id.startsWith('wilds') ? 'In the wilds' : id.startsWith('i:') ? 'In a dungeon' : id);

  // --- wiring -------------------------------------------------------------------------------------
  function wire(n) {
    n.on('party', p => {
      const had = party;
      party = p;
      if (p && !had) hud.chat(p.members.length > 1 ? 'You joined a party.' : 'You formed a party.', 'party');
      if (!p && had) hud.chat('You are no longer in a party.', 'party');
      render();
      if (wantLink && p?.code) { wantLink = false; copyLink(); }
    });
    n.on('partyInvite', m => {
      pendingInvite = m;
      el.popText.textContent = `${m.name} invites you to their party.`;
      el.pop.hidden = false;
      hud.chat(`${m.name} invites you to their party. Click Join to accept.`, 'party');
    });
    n.on('partyFrames', onFrames);
    n.on('ignored', list => hud.chat(list.length ? `Ignoring: ${list.map(i => i.name).join(', ')}` : 'Your ignore list is empty.', 'system'));
    n.on('err', e => { if (['party', 'partyFull', 'noCode'].includes(e.code)) hud.toast(e.msg || e.code, 'warn'); });
  }

  const api = { wire, invite, copyLink, toggleMenu, render, portraitFor: null, get party() { return party; } };
  return api;
}
