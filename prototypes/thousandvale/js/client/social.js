// Party frames, the party menu (invite by name, copy the join link, leave), invite pop-ups, and the chat
// commands. Everything goes through stream A's client (`net.partyOp`, `net.partyChat`, `net.ignore`,
// `net.joinLink()`; protocol §11). DOM only.
//
// Chat commands:  /p text  party chat      /s text  say (the default)     /invite Name     /leave
//                 /ignore Name   /unignore Name     /link  copy the join link     /help

const $ = id => document.getElementById(id);
const CLASS_NAME = id => String(id || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function createSocial({ net: getNet, hud, actors, onTarget, myChar }) {
  const el = {
    frames: $('party'), btn: $('party-btn'), menu: $('party-menu'), name: $('invite-name'), go: $('invite-go'), link: $('join-link'), copy: $('join-copy'),
    leave: $('party-leave'), close: $('party-close'), help: $('party-help'), pop: $('invite-pop'), popText: $('invite-text'), yes: $('invite-yes'), no: $('invite-no'),
    chatCh: $('chat-ch'),
  };
  let party = null, frames = new Map(), pendingInvite = null, wantLink = false;
  const net = () => getNet();

  // --- party menu ---------------------------------------------------------------------------------
  function toggleMenu(open = el.menu.hidden) {
    el.menu.hidden = !open;
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
    el.btn.textContent = party ? `Party (${party.members.length})` : 'Party';
    const keep = new Set();
    for (const m of others) {
      keep.add(m.char);
      let f = frames.get(m.char);
      if (!f) {
        const root = document.createElement('div'); root.className = 'pmember';
        root.innerHTML = '<div class="pm-icon"></div><div class="pm-body"><div class="pm-name"></div><div class="bar hp"><i></i></div><div class="pm-where"></div></div>';
        root.onclick = () => { const fr = frames.get(m.char); if (fr?.id != null) onTarget?.(fr.id); };
        el.frames.appendChild(root);
        f = { root, icon: root.querySelector('.pm-icon'), name: root.querySelector('.pm-name'), bar: root.querySelector('.bar i'), where: root.querySelector('.pm-where') };
        frames.set(m.char, f);
      }
      f.icon.textContent = (m.name[0] || '?').toUpperCase();
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
    n.on('err', e => { if (['party', 'partyFull', 'noCode', 'notFound', 'muted'].includes(e.code)) hud.toast(e.msg || e.code, 'warn'); });
  }

  /** A line typed into the chat box. Returns true when it was handled. */
  function command(text) {
    const n = net(); if (!n) return false;
    const m = /^\/(\w+)\s*(.*)$/.exec(text);
    if (!m) { if (channel === 'party') n.partyChat(text); else n.say(text); return true; }
    const [, cmd, rest] = m;
    switch (cmd.toLowerCase()) {
      case 'p': case 'party': if (rest) n.partyChat(rest); else setChannel('party'); return true;
      case 's': case 'say': if (rest) n.say(rest); else setChannel('say'); return true;
      case 'invite': case 'inv': invite(rest); return true;
      case 'leave': n.partyOp('leave'); return true;
      case 'kick': { const mm = party?.members.find(x => x.name.toLowerCase() === rest.toLowerCase()); if (mm) n.partyOp('kick', { char: mm.char }); return true; }
      case 'lead': { const mm = party?.members.find(x => x.name.toLowerCase() === rest.toLowerCase()); if (mm) n.partyOp('lead', { char: mm.char }); return true; }
      case 'ignore': if (rest) n.ignore(rest, true); return true;
      case 'unignore': if (rest) n.ignore(rest, false); return true;
      case 'link': copyLink(); return true;
      case 'help': hud.chat('/p party chat · /s say · /invite Name · /leave · /kick Name · /lead Name · /ignore Name · /unignore Name · /link', 'system'); return true;
    }
    hud.chat(`Unknown command /${cmd}. Type /help.`, 'system');
    return true;
  }
  let channel = 'say';
  function setChannel(ch) { channel = ch; el.chatCh.textContent = ch === 'party' ? 'Party' : 'Say'; el.chatCh.classList.toggle('party', ch === 'party'); }

  return { wire, command, toggleMenu, render, get party() { return party; } };
}
