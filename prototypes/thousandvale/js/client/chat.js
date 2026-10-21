// The chat window (M3, protocol §16.2): channel tabs (All, Say, Party, Guild, Zone, Trade, World, Whispers) with
// unread counts, the sending channel shown in front of the box, slash commands, whispers (/w Name, /r), and a menu
// on any name (whisper, party invite, friend, guild invite, mute here, ignore, report). Takes over `hud.chat` so
// every system/combat/loot line in the game lands here too (on the All tab). DOM only; rules in social-core.js.

import { CHANNELS, CHANNEL_BY_ID, tabOf, linePrefix, parseChatLine, CHAT_HELP, channelGate, ERR_TEXT, accountLevel } from './social-core.js';
import { h, createPanel } from './ui-panel.js';
import { rememberItems } from './ui/item-card.js';      // feedback #107: a linked item's card on hover

const $ = id => document.getElementById(id);
const MAX_LINES = 300;
const store = {
  get(k, d) { try { const v = localStorage.getItem('tv.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tv.' + k, JSON.stringify(v)); } catch {} },
};

/**
 * @param o.net        () => the net client
 * @param o.hud        the HUD (its chat() is replaced by ours)
 * @param o.social     party module (invite, copyLink, members)
 * @param o.me         () => { name, claimed, level, inParty, inGuild, guildRank, char }
 * @param o.actions    { openAccount(), friendAdd(name), friendRemove(name), isFriend(name), guildInvite(name), canGuildInvite() }
 * @param o.onTyping   (on) => the controls stop reading WASD while typing
 */
export function createChat({ net: getNet, hud, social, me, actions = {}, onTyping }) {
  const net = () => getNet();
  const el = { root: $('chat'), log: $('chat-log'), form: $('chat-form'), input: $('chat-input'), ch: $('chat-ch') };
  const S = { tab: store.get('chatTab', 'all'), send: 'say', whisperTo: null, reply: null, unread: {}, muted: new Set(store.get('muted', [])), mutedUntil: 0 };

  // ---- tabs ----
  const tabs = h('div.chat-tabs', { role: 'tablist', 'aria-label': 'Chat channels' });
  const tabBtn = {};
  for (const c of CHANNELS) {
    const b = h('button.chat-tab', { type: 'button', role: 'tab', title: c.hint, dataset: { tab: c.id }, onclick: () => setTab(c.id, true) }, c.label, h('i.badge'));
    tabBtn[c.id] = b; tabs.appendChild(b);
  }
  el.root.insertBefore(tabs, el.log);
  el.root.classList.add('m3');

  function setTab(id, focus = false) {
    if (!CHANNEL_BY_ID[id]) id = 'all';
    S.tab = id; store.set('chatTab', id);
    for (const [k, b] of Object.entries(tabBtn)) { b.setAttribute('aria-selected', String(k === id)); b.classList.toggle('on', k === id); }
    el.log.dataset.show = id;
    S.unread[id] = 0; badge(id);
    const c = CHANNEL_BY_ID[id];
    setSend(c.send, id === 'w' ? S.whisperTo || S.reply : null);
    el.log.scrollTop = el.log.scrollHeight;
    if (focus) el.input.focus();
  }
  function badge(id) { const b = tabBtn[id]?.querySelector('.badge'); if (b) b.textContent = S.unread[id] ? (S.unread[id] > 99 ? '99+' : S.unread[id]) : ''; }
  /** The channel the next plain line goes to (shown in front of the box). */
  function setSend(ch, to = null) {
    S.send = ch; if (ch === 'w') S.whisperTo = to || S.whisperTo;
    const label = ch === 'w' ? (S.whisperTo ? `To ${S.whisperTo}` : 'Whisper') : CHANNEL_BY_ID[ch]?.label || 'Say';
    el.ch.textContent = label;
    el.ch.className = 'chat-ch ch-' + ch;
    el.input.placeholder = ch === 'w' && !S.whisperTo ? 'Type /w Name message' : `Talk in ${label.toLowerCase().startsWith('to ') ? 'a whisper' : label} — Enter to send`;
  }

  // ---- lines ----
  function append(p, tab) {
    p.dataset.tab = tab;
    const atBottom = el.log.scrollTop + el.log.clientHeight >= el.log.scrollHeight - 8;
    el.log.appendChild(p);
    while (el.log.children.length > MAX_LINES) el.log.firstChild.remove();
    if (atBottom) el.log.scrollTop = el.log.scrollHeight;
    if (tab !== 'all' && S.tab !== tab && S.tab !== 'all') { S.unread[tab] = (S.unread[tab] || 0) + 1; badge(tab); }
    else if (tab !== 'all' && S.tab === 'all' && tab === 'w') { S.unread.w = (S.unread.w || 0) + 1; badge('w'); }
  }
  /** hud.chat(text, cls, from): local lines (system, combat, loot…) — the All tab. `from` "Party] [Name" style kept. */
  function line(text, cls = 'system', from = null) {
    const p = h('p', { className: cls });
    if (from) p.append(h('b', {}, `[${from}]: `));
    p.append(text);
    append(p, cls === 'party' ? 'party' : cls === 'guild' ? 'guild' : 'all');
    return p;
  }
  function nameEl(name, char) {
    return h('a.chat-name', { href: '#', title: `${name} — click for options`, dataset: { name, char: char ?? '' },
      onclick: e => { e.preventDefault(); nameMenu(name, e.clientX, e.clientY, { char }); } }, name);
  }
  /** A line from the server: chat {ch, from, name, text, echo?, to?, zone?}. */
  function incoming(m) {
    const mine = m.name && me().name && m.name.toLowerCase() === me().name.toLowerCase();
    if (!mine && m.name && S.muted.has(m.name.toLowerCase()) && m.ch !== 'system') return null;
    const tab = tabOf(m.ch);
    const p = h('p', { className: 'ch-' + (m.ch || 'system') + (m.echo ? ' echo' : '') });
    const T = () => linkParts(m.text, m.links);      // feedback #107: [[L…]] -> a chip with the thing's card
    if (m.ch === 'system') p.append(h('b', {}, `[${m.name || 'The Vale'}]: `), ...T());
    else if (m.ch === 'w') {
      if (m.echo) p.append(h('b', {}, '[To '), nameEl(m.to), h('b', {}, ']: '), ...T());
      else { p.append(h('b', {}, '['), nameEl(m.name, m.from), h('b', {}, ' whispers]: '), ...T()); S.reply = m.name; if (!S.whisperTo) S.whisperTo = m.name; }
    } else {
      const label = m.ch === 'say' ? '' : `${CHANNEL_BY_ID[m.ch]?.label || m.ch}`;
      if (label) p.append(h('b.chl', {}, `[${label}] `));
      p.append(h('b', {}, '['), nameEl(m.name, m.ch === 'say' ? null : m.from), h('b', {}, ']: '), ...T());
    }
    p.dataset.tip = linePrefix(m);
    append(p, tab);
    return p;
  }

  // ---- sending ----
  // ---- feedback #107: links to items, achievements and trophies ----
  // The server makes a link from what you hold (js/sim/province.js makeLink) and answers its id; the box shows "[Name]"
  // and the id goes out in its place on Enter. A line arriving with `links` turns each [[id]] into a chip.
  S.pending = new Map();         // "[Name]" in the box -> link id
  const wantLink = new Map();    // req -> true (only our own answers are put in the box)
  function linkChip(v) {
    const r = v.rarity || (v.kind === 'item' ? 'normal' : v.kind);
    const chip = h('span.chat-link.r-' + r, { tabIndex: 0, dataset: { link: v.kind } }, `[${v.label || 'link'}]`);
    if (v.kind === 'item' && v.item) { rememberItems([v.item]); chip.dataset.tipRender = 'item'; chip.dataset.tipItem = String(v.item.uid); }
    else chip.dataset.tip = `${v.kind === 'trophy' ? 'Trophy' : 'Achievement'}: ${v.label}${v.n > 1 ? ` ×${v.n}` : ''}${v.desc ? ` — ${v.desc}` : ''}${v.who ? ` (${v.who}'s)` : ''}`;
    if (v.kind !== 'item') chip.addEventListener('click', () => actions.openAchievements?.(v.kind === 'trophy' ? 'trophies' : 'ach'));
    return chip;
  }
  function linkParts(text, links) {
    const t = String(text ?? '');
    if (!t.includes('[[')) return [t];
    const out = [];
    let last = 0;
    for (const m of t.matchAll(/\[\[(L[0-9a-z]{2,10})\]\]/g)) {
      if (m.index > last) out.push(t.slice(last, m.index));
      const v = links && links[m[1]];
      out.push(v ? linkChip(v) : h('span.chat-link.gone', {}, '[a link]'));
      last = m.index + m[0].length;
    }
    if (last < t.length) out.push(t.slice(last));
    return out;
  }
  /** Ask the server for a link to `ref` (an item uid, an achievement id, a trophy id); it lands in the chat box. */
  function linkThing(kind, ref) {
    const n = net();
    if (!n?.link) return false;
    wantLink.set(n.link(kind, ref), true);
    return true;
  }
  function onLinkR(r) {
    if (!r || !wantLink.delete(r.req)) return;
    if (!r.ok) { line(r.msg || 'That cannot be linked.', 'bad'); return; }
    let label = `[${r.label}]`;
    for (let k = 2; S.pending.has(label) && S.pending.get(label) !== r.id; k++) label = `[${r.label} ${k}]`;
    S.pending.set(label, r.id);
    const v = el.input.value, at = el.input === document.activeElement && Number.isFinite(el.input.selectionStart) ? el.input.selectionStart : v.length;
    const pad = at > 0 && !/\s$/.test(v.slice(0, at)) ? ' ' : '';
    el.input.value = v.slice(0, at) + pad + label + ' ' + v.slice(at);
    el.input.focus();
    const c = at + pad.length + label.length + 1; try { el.input.setSelectionRange(c, c); } catch { /* not a text box */ }
  }
  /** The chat box is being written in (Shift-click on an item then links it instead of splitting it / swapping hands). */
  let blurAt = -1e9;
  el.input.addEventListener('blur', () => { blurAt = performance.now(); });
  const composing = () => document.activeElement === el.input || el.input.value.trim() !== '' || performance.now() - blurAt < 1500;
  /** A local line with a link chip (an achievement or trophy you just earned). */
  function systemLink(before, v, after = '') { const p = h('p', { className: 'system ach-line' }, before, linkChip(v), after); append(p, 'all'); return p; }
  function submit(raw) {
    // [Name] placeholders the box holds for links -> their ids
    if (S.pending.size) { for (const [label, id] of S.pending) raw = String(raw).split(label).join(`[[${id}]]`); S.pending.clear(); }
    const r = parseChatLine(raw, { active: S.send, reply: S.reply, whisperTo: S.whisperTo });
    const n = net();
    if (!n) return true;
    if (r.kind === 'error') { line(r.msg, 'bad'); return true; }
    if (r.kind === 'switch') {
      const tab = r.ch === 'w' ? 'w' : CHANNELS.find(c => c.send === r.ch && c.id !== 'all')?.id || 'all';
      if (r.ch === 'w' && r.to) S.whisperTo = r.to;
      setTab(tab); setSend(r.ch, r.to);
      setTimeout(() => el.input.focus(), 0);
      return true;
    }
    if (r.kind === 'send') {
      const gate = channelGate(r.ch, { claimed: n.claimed, level: accountLevel(n, me().level), party: !!social?.party, guild: !!me().inGuild });
      if (gate) { gateLine(gate, r.ch); return true; }
      if (S.mutedUntil > Date.now()) { line(`You are muted for ${Math.ceil((S.mutedUntil - Date.now()) / 60000)} more minute(s).`, 'bad'); return true; }
      if (r.ch === 'say') n.say(r.text);
      else if (r.ch === 'party') n.partyChat(r.text);
      else if (r.ch === 'w') { n.whisper(r.to, r.text); S.whisperTo = r.to; if (S.send === 'w') setSend('w', r.to); }
      else n.chat(r.ch, r.text);
      return true;
    }
    if (r.kind === 'cmd') return command(r.cmd, r.arg, r.rest);
    return true;
  }
  function gateLine(text, ch) {
    const p = line(text, 'bad');
    if (/claim/i.test(text) || ch === 'chatGate') p.append(' ', h('button.linkish', { type: 'button', onclick: () => actions.openAccount?.() }, 'Claim my account'));
  }
  function command(cmd, arg, rest) {
    const n = net();
    switch (cmd) {
      case 'help': for (const l of CHAT_HELP) line(l, 'system'); return true;
      case 'invite': if (arg) social?.invite(arg); else line('Usage: /invite Name', 'bad'); return true;
      case 'leave': n.partyOp('leave'); return true;
      case 'kick': case 'lead': { const mm = social?.party?.members.find(x => x.name.toLowerCase() === arg.toLowerCase()); if (mm) n.partyOp(cmd, { char: mm.char }); else line(`${arg || 'Who'} is not in your party.`, 'bad'); return true; }
      case 'link': social?.copyLink(); return true;
      case 'ignore': if (arg) n.ignore(arg, true); else line('Usage: /ignore Name', 'bad'); return true;
      case 'unignore': if (arg) n.ignore(arg, false); return true;
      case 'friend': if (arg) actions.friendAdd?.(arg); else actions.openFriends?.(); return true;
      case 'unfriend': if (arg) actions.friendRemove?.(arg); return true;
      case 'ginvite': if (arg) actions.guildInvite?.(arg); else line('Usage: /ginvite Name', 'bad'); return true;
      case 'gleave': n.guild('leave'); return true;
      case 'motd': n.guild('motd', { text: rest }); return true;
      case 'report': if (arg) reportBox(arg); else line('Usage: /report Name', 'bad'); return true;
      case 'mute': if (arg) muteLocal(arg, true); return true;
      case 'unmute': if (arg) muteLocal(arg, false); return true;
      case 'claim': actions.openAccount?.(); return true;
      case 'reset': if (n.unstuck) { n.unstuck(); line('Getting you unstuck…', 'system'); } return true;      // feedback #96
    }
    if (actions.command?.(cmd, arg, rest)) return true;      // play-test 2: /follow, /trade, /settings (ui/pt2.js)
    line(`Unknown command /${cmd}. Type /help.`, 'bad');
    return true;
  }
  function muteLocal(name, on) {
    const k = name.toLowerCase();
    if (on) S.muted.add(k); else S.muted.delete(k);
    store.set('muted', [...S.muted]);
    line(on ? `${name} is muted on this screen (they are not told). Use Ignore to block them everywhere.` : `${name} is no longer muted.`, 'system');
  }

  // ---- the name menu ----
  const menu = h('div.name-menu', { role: 'menu', hidden: true });
  (document.getElementById('hud') || document.body).appendChild(menu);
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; }, true);
  function nameMenu(name, x, y, { char = null } = {}) {
    if (!name) return;
    const self = me().name && name.toLowerCase() === me().name.toLowerCase();
    menu.innerHTML = '';
    menu.append(h('div.nm-title', {}, name));
    const item = (label, fn, cls = '') => menu.append(h('button.nm-item' + (cls ? '.' + cls : ''), { type: 'button', role: 'menuitem', onclick: () => { menu.hidden = true; fn(); } }, label));
    if (!self) {
      item('Whisper', () => { S.whisperTo = name; setTab('w'); setSend('w', name); el.input.focus(); });
      item('Invite to party', () => social?.invite(name));
      if (actions.isFriend?.(name)) item('Remove friend', () => actions.friendRemove?.(name)); else item('Add friend', () => actions.friendAdd?.(name));
      if (actions.canGuildInvite?.()) item('Invite to guild', () => actions.guildInvite?.(name));
      const k = name.toLowerCase();
      item(S.muted.has(k) ? 'Unmute here' : 'Mute here', () => muteLocal(name, !S.muted.has(k)));
      const ign = (net()?.joined?.you?.ignore || []).some(i => String(i.name).toLowerCase() === k);
      item(ign ? 'Stop ignoring' : 'Ignore', () => net()?.ignore(name, !ign));
      item('Report…', () => reportBox(name), 'warn');
    } else item('That is you.', () => {});
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(window.innerWidth - r.width - 6, x + 4) + 'px';
    menu.style.top = Math.max(6, Math.min(window.innerHeight - r.height - 6, y - r.height / 2)) + 'px';
  }

  // ---- report ----
  const report = createPanel({ id: 'report', title: 'Report a player', width: 320, cls: 'report-panel' });
  function reportBox(name) {
    const b = report.body; b.innerHTML = '';
    const why = h('select', { 'aria-label': 'Reason' }, ...[['spam', 'Spam or advertising'], ['abuse', 'Abuse or harassment'], ['cheat', 'Cheating or botting'], ['name', 'Offensive name'], ['other', 'Something else']].map(([v, t]) => h('option', { value: v }, t)));
    const text = h('textarea', { maxLength: 200, rows: 3, placeholder: 'What happened? (optional)' });
    b.append(h('p.tiny-left', {}, `Reporting ${name}. Their last few chat lines go with the report so the keeper can check.`), why, text,
      h('div.row.end', {}, h('button.ghost', { type: 'button', onclick: () => report.close() }, 'Cancel'),
        h('button.primary.small', { type: 'button', onclick: () => { net()?.report(name, why.value, text.value.trim() || undefined); report.close(); } }, 'Send report')));
    report.setTitle('Report a player', name);
    report.open(); why.focus();
  }

  // ---- input wiring (hud.js already submits the form through onChatSubmit) ----
  el.input.addEventListener('keydown', e => {
    if (e.key === 'Tab' && el.input.value.startsWith('/')) e.preventDefault();
    if (e.key === 'Backspace' && !el.input.value && S.send !== 'say' && S.tab === 'all') setSend('say');
  });
  el.input.addEventListener('focus', () => onTyping?.(true));

  function wire(n) {
    n.on('chat', m => incoming(m));
    n.on('linkR', onLinkR);      // feedback #107
    n.on('err', e => {
      if (e.code === 'chatGate') gateLine(e.msg || ERR_TEXT.chatGate, 'chatGate');
      else if (['slow', 'muted', 'ignored'].includes(e.code)) line(e.msg || ERR_TEXT[e.code], 'bad');
      else if (e.code === 'notFound') line(e.msg || ERR_TEXT.notFound, 'bad');
      else if (e.code === 'guild' && !e.msg) line(ERR_TEXT.guild, 'bad');
    });
    n.on('muted', m => {
      S.mutedUntil = m.until || 0;
      const left = Math.max(0, (m.until || 0) - Date.now());
      line(m.msg || (left > 0 ? `You have been muted for ${Math.ceil(left / 60000)} minute(s)${m.by === 'auto' ? ' after several reports' : ''}.` : 'You can talk again.'), left > 0 ? 'bad' : 'system');
    });
    n.on('reportR', r => { hud.toast(r.msg || 'Report filed.', r.ok ? 'good' : 'warn'); line(r.msg || 'Report filed.', 'system'); });
  }

  setTab(S.tab);
  return {
    wire, line, incoming, submit, nameMenu, setTab, setSend, reportBox, linkThing, systemLink, composing, linkParts,
    focus(prefill = '') { if (prefill) el.input.value = prefill; el.input.focus(); },
    whisper(name) { S.whisperTo = name; setTab('w'); setSend('w', name); el.input.focus(); },
    get state() { return S; },
  };
}
