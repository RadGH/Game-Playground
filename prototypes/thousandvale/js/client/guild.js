// Guild panel (M3, protocol §16.4): found a guild (claimed account, level 5, 10 gold), the invitation pop-up,
// the roster with ranks (Leader, Officer, Member, Recruit) and who is online where, promote / demote / kick /
// hand on the lead, the message of the day, leave and disband. Guild chat is the Guild tab in chat.js.
// Server: guildState {guild|null, joined?, left?, kicked?, disbanded?}, guildInvite {guild, name, from, ms}, guildR.

import { guildPerms, sortRoster, RANK_NAMES, GUILD_FEE, PUBLIC_LEVEL, guildNameCheck } from './social-core.js';
import { createPanel, h, confirmBox } from './ui-panel.js';
import { zoneName, className } from './names.js';

export function createGuild({ net: getNet, hud, chat, me, onMotd }) {
  const net = () => getNet();
  let guild = null, invite = null, inviteTimer = 0, lastMotd = null;
  const panel = createPanel({ id: 'guild', title: 'Guild', width: 380, onOpen: () => { if (guild) net()?.guild('roster'); draw(); } });
  const pop = h('div.invite-pop.guild-pop', { hidden: true, role: 'alertdialog' });
  (document.getElementById('hud') || document.body).appendChild(pop);

  const myRank = () => { const c = me().char; const m = guild?.members.find(x => x.char === c); return m ? m.rank : 9; };
  const rankName = r => (guild?.ranks?.[r]) || RANK_NAMES[r] || 'Member';

  function draw() {
    const online = guild ? guild.members.filter(m => m.online).length : 0;
    // (U1: no badge for "how many are online" — that is in the window's title; a badge is only for news)
    if (!panel.isOpen) return;
    if (!guild) return drawNone();
    panel.setTitle(guild.name, `${online} of ${guild.members.length} online`);
    const rank = myRank(), P = guildPerms(rank, 9);
    const motd = h('div.g-motd', {},
      h('span.label', {}, 'Message of the day'),
      P.motd ? motdEditor() : h('p', {}, guild.motd || 'No message yet.'));
    const inv = h('input', { maxLength: 16, placeholder: 'Invite by name', 'aria-label': 'Invite by name', onkeydown: e => { if (e.key === 'Enter') { inviteName(inv.value); inv.value = ''; } } });
    const rows = sortRoster(guild.members).map(m => {
      const self = m.char === me().char, p = guildPerms(rank, m.rank, self);
      const acts = h('div.g-acts', {},
        p.promote ? h('button.ghost.small', { type: 'button', title: `Make ${rankName(m.rank - 1)}`, onclick: () => net()?.guild('promote', { char: m.char }) }, '▲') : null,
        p.demote ? h('button.ghost.small', { type: 'button', title: `Make ${rankName(m.rank + 1)}`, onclick: () => net()?.guild('demote', { char: m.char }) }, '▼') : null,
        p.lead ? h('button.ghost.small', { type: 'button', title: 'Hand on the lead', onclick: async () => { if (await confirmBox(`Make ${m.name} the guild leader? You become an officer.`, { yes: 'Hand on the lead' })) net()?.guild('lead', { char: m.char }); } }, '♛') : null,
        p.kick ? h('button.ghost.small.x', { type: 'button', title: 'Remove from the guild', onclick: async () => { if (await confirmBox(`Remove ${m.name} from ${guild.name}?`, { yes: 'Remove', danger: true })) net()?.guild('kick', { char: m.char }); } }, '×') : null);
      return h('li.g-row' + (m.online ? '.online' : '') + (self ? '.self' : ''), {},
        h('i.dot'),
        h('div.g-main', {},
          h('a.chat-name', { href: '#', onclick: e => { e.preventDefault(); chat.nameMenu(m.name, e.clientX, e.clientY, { char: m.char }); } }, m.name),
          h('small', {}, `${m.level ? 'Level ' + m.level + ' ' : ''}${className(m.cls)}`, h('em', {}, ' · ' + (m.online ? zoneName(m.zone) || 'Online' : 'Offline')))),
        h('span.g-rank.r' + m.rank, {}, rankName(m.rank)),
        acts);
    });
    panel.fill(motd,
      P.invite ? h('div.row', {}, inv, h('button.ghost', { type: 'button', onclick: () => { inviteName(inv.value); inv.value = ''; } }, 'Invite')) : null,
      h('ul.g-roster', {}, rows),
      h('div.row.end', {},
        h('button.ghost', { type: 'button', onclick: () => { chat.setTab('guild', true); } }, 'Guild chat'),
        h('span.grow'),
        P.disband ? h('button.ghost.danger-text', { type: 'button', onclick: async () => { if (await confirmBox(`Disband ${guild.name}? Everyone is removed and the name is freed.`, { yes: 'Disband', danger: true })) net()?.guild('disband'); } }, 'Disband') : null,
        h('button.ghost', { type: 'button', onclick: async () => { if (await confirmBox(`Leave ${guild.name}?`, { yes: 'Leave' })) net()?.guild('leave'); } }, 'Leave')));
  }
  function motdEditor() {
    const t = h('textarea', { maxLength: 200, rows: 2, value: guild.motd || '', placeholder: 'Say something to everyone who logs in' });
    t.value = guild.motd || '';
    return h('div', {}, t, h('div.row.end', {}, h('button.ghost.small', { type: 'button', onclick: () => net()?.guild('motd', { text: t.value }) }, 'Save message')));
  }
  function drawNone() {
    panel.setTitle('Guild', 'You are not in a guild');
    const n = net(), lv = me().level || 1;
    const name = h('input', { maxLength: 24, placeholder: 'Guild name', 'aria-label': 'Guild name' });
    const note = h('p.note');
    const can = n?.claimed && lv >= PUBLIC_LEVEL;
    panel.fill(
      h('p', {}, 'A guild is a standing group: its own chat, a roster with ranks and a message for everyone who logs in.'),
      invite ? h('div.g-invite', {}, h('p', {}, `${invite.from} invites you to `, h('b', {}, invite.name), '.'), h('div.row', {}, h('button.primary.small', { type: 'button', onclick: () => answer(true) }, 'Join'), h('button.ghost', { type: 'button', onclick: () => answer(false) }, 'No thanks'))) : null,
      h('h4', {}, 'Found a guild'),
      h('p.tiny-left', {}, `Costs ${GUILD_FEE} gold. Needs a claimed account at level ${PUBLIC_LEVEL}.${can ? '' : n?.claimed ? ` You are level ${lv}.` : ' Your account is a guest account.'}`),
      h('div.row', {}, name, h('button.primary.small', { type: 'button', disabled: !can, onclick: () => { const bad = guildNameCheck(name.value); if (bad) { note.textContent = bad; return; } note.textContent = ''; n.guild('create', { name: name.value.trim() }); } }, 'Found')),
      note,
      !n?.claimed ? h('button.linkish', { type: 'button', onclick: () => document.getElementById('menu-account')?.click() }, 'Claim my account') : null);
  }
  function inviteName(name) { const n = String(name || '').trim(); if (n) net()?.guild('invite', { name: n }); }
  function answer(yes) {
    if (!invite) return;
    net()?.guild(yes ? 'accept' : 'decline', { id: invite.guild });
    invite = null; pop.hidden = true; clearTimeout(inviteTimer); draw();
  }

  function wire(n) {
    n.on('guildState', m => {
      const had = guild;
      guild = m.guild || null;
      if (m.joined && guild) hud.chat(`${m.joined} joined the guild.`, 'guild');
      if (m.left && guild) hud.chat(`${m.left} left the guild.`, 'guild');
      if (!guild && had) {
        hud.chat(m.kicked ? `You were removed from ${had.name}.` : m.disbanded ? `${had.name} was disbanded.` : `You left ${had.name}.`, 'guild');
        hud.toast(m.kicked ? 'Removed from the guild' : m.disbanded ? 'Guild disbanded' : 'You left the guild', 'warn');
      }
      if (guild && !had) {
        hud.toast(`Guild: ${guild.name}`, 'good');
        if (guild.members.length === 1) hud.chat(`You founded ${guild.name}. Invite people with /ginvite Name or from the Guild window (G).`, 'guild');
        else hud.chat(`You are a member of ${guild.name}. Talk to them with /g.`, 'guild');
      }
      if (guild && guild.motd && guild.motd !== lastMotd) { hud.chat(`Guild message: ${guild.motd}`, 'guild'); onMotd?.(guild.motd); }
      lastMotd = guild ? guild.motd : null;
      draw();
    });
    n.on('guildInvite', m => {
      invite = m;
      pop.replaceChildren(h('span', {}, `${m.from} invites you to the guild `, h('b', {}, m.name), '.'),
        h('button.primary', { type: 'button', onclick: () => answer(true) }, 'Join'), h('button.ghost', { type: 'button', onclick: () => answer(false) }, 'No thanks'));
      pop.hidden = false;
      clearTimeout(inviteTimer); inviteTimer = setTimeout(() => { invite = null; pop.hidden = true; draw(); }, m.ms || 120000);
      hud.chat(`${m.from} invites you to the guild ${m.name}. Click Join to accept.`, 'guild');
      draw();
    });
    n.on('guildR', r => {
      if (r.ok) {
        if (r.op === 'invite') hud.chat(`You invite ${r.name || 'them'} to the guild.`, 'guild');
        return;
      }
      hud.toast(r.msg || 'That did not work.', 'warn'); hud.chat(r.msg || 'That did not work.', 'bad');
    });
  }

  return {
    wire, panel, draw, invite: inviteName,
    get guild() { return guild; },
    canInvite: () => !!guild && myRank() <= 1,
    get rank() { return myRank(); },
  };
}
