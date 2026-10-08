// Pure helpers for the M3 social UI (chat channels, friends, guilds, mail, the Callboard, accounts, shortcuts).
// No DOM, no network: the panels in chat.js / friends.js / guild.js / mail.js / callboard.js / account.js call these,
// and tests/D/m3-social.test.js checks them. Wire shapes: docs/protocol.md §16 (protocol v4).

import { shortcutsTable, panelKeys } from './input/bindings.js';

/** Chat channels in tab order. `send` = how a line on this tab goes out ('say' is the province socket). */
export const CHANNELS = [
  { id: 'all', label: 'All', send: 'say', hint: 'Everything. Typing here talks out loud to people near you.' },
  { id: 'say', label: 'Say', send: 'say', slash: ['s', 'say'], hint: 'People within 40 m hear you.' },
  { id: 'party', label: 'Party', send: 'party', slash: ['p', 'party'], hint: 'Your party only.' },
  { id: 'guild', label: 'Guild', send: 'guild', slash: ['g', 'guild'], hint: 'Your guild, wherever they are.' },
  { id: 'zone', label: 'Zone', send: 'zone', slash: ['z', 'zone'], gated: true, hint: 'Everyone in this zone. Needs a claimed account at level 5.' },
  { id: 'trade', label: 'Trade', send: 'trade', slash: ['t', 'trade'], gated: true, hint: 'Buying and selling, realm-wide (one line every 5 s). Needs a claimed account at level 5.' },
  { id: 'world', label: 'World', send: 'world', slash: ['world', '1'], gated: true, hint: 'The whole realm (one line every 10 s). Needs a claimed account at level 5.' },
  { id: 'w', label: 'Whispers', send: 'w', slash: ['w', 'whisper', 'tell'], hint: 'Private lines. Type /w Name to start one, /r to answer the last.' },
];
export const CHANNEL_BY_ID = Object.fromEntries(CHANNELS.map(c => [c.id, c]));
export const PUBLIC_LEVEL = 5;

/** Which tab a line belongs on (besides All). Incoming `chat.ch` or a local kind ('system', 'loot', …). */
export function tabOf(ch) {
  if (ch === 'w') return 'w';
  if (['say', 'party', 'guild', 'zone', 'trade', 'world'].includes(ch)) return ch;
  return 'all';
}

/** The label in front of a line: "[Guild] Aldra:" — say has none, a whisper says who to/from. */
export function linePrefix(m) {
  if (m.ch === 'w') return m.echo ? `To ${m.to}` : `${m.name} whispers`;
  if (m.ch === 'say') return m.name;
  if (m.ch === 'system') return m.name || 'The Vale';
  const c = CHANNEL_BY_ID[m.ch];
  return c ? `${c.label}] [${m.name}` : m.name;
}

/**
 * One typed line -> what to do with it.
 *   { kind: 'send', ch, text, to? }   a chat line (ch: say|party|guild|zone|trade|world|w)
 *   { kind: 'cmd', cmd, arg, rest }   a command (invite, ignore, friend, …) for the caller
 *   { kind: 'switch', ch }            "/g" alone: make guild the sending tab
 *   { kind: 'error', msg }
 * `active` = the tab's send channel; `reply` = whom /r answers; `whisperTo` = a whisper tab's current partner.
 */
export function parseChatLine(raw, { active = 'say', reply = null, whisperTo = null } = {}) {
  const text = String(raw || '').trim();
  if (!text) return { kind: 'none' };
  if (text[0] !== '/') {
    if (active === 'w') return whisperTo ? { kind: 'send', ch: 'w', to: whisperTo, text } : { kind: 'error', msg: 'Whisper whom? Type /w Name and your message.' };
    return { kind: 'send', ch: active || 'say', text };
  }
  const m = /^\/(\S+)\s*([\s\S]*)$/.exec(text);
  const cmd = m[1].toLowerCase(), rest = m[2].trim();
  if (cmd === 'r' || cmd === 'reply') {
    if (!reply) return { kind: 'error', msg: 'Nobody has whispered you yet.' };
    return rest ? { kind: 'send', ch: 'w', to: reply, text: rest } : { kind: 'switch', ch: 'w', to: reply };
  }
  for (const c of CHANNELS) {
    if (!c.slash || !c.slash.includes(cmd)) continue;
    if (c.id === 'w') {
      const mm = /^(\S+)\s*([\s\S]*)$/.exec(rest);
      if (!mm) return { kind: 'error', msg: 'Usage: /w Name message' };
      return mm[2].trim() ? { kind: 'send', ch: 'w', to: mm[1], text: mm[2].trim() } : { kind: 'switch', ch: 'w', to: mm[1] };
    }
    return rest ? { kind: 'send', ch: c.send, text: rest } : { kind: 'switch', ch: c.send };
  }
  const first = rest.split(/\s+/)[0] || '';
  return { kind: 'cmd', cmd: COMMAND_ALIASES[cmd] || cmd, arg: first, rest };
}
const COMMAND_ALIASES = { inv: 'invite', unfriend: 'unfriend', befriend: 'friend', ginv: 'ginvite', gquit: 'gleave', ignorelist: 'ignore' };

/** What /help prints. */
export const CHAT_HELP = [
  '/s say · /p party · /g guild · /z zone · /t trade · /world · /w Name text · /r reply',
  '/invite Name · /leave · /kick Name · /lead Name · /link (party join link)',
  '/friend Name · /unfriend Name · /ignore Name · /unignore Name · /report Name',
  '/follow [Name] · /unfollow · /tradewith [Name] · /settings',
  '/ginvite Name · /gleave · /motd text · /claim (save your account)',
];

/**
 * Play-test 8 (W11): the level-5 gates ask the ACCOUNT, not the character you are on — a level-1 alt of an account that has a
 * level-5 character talks, posts mail and founds a guild from day one. `you.acct.level` is the server's number; before it
 * is known, the highest level among the account's characters, else the character's own.
 */
export function accountLevel(net, own = 1) {
  const a = net?.joined?.you?.acct?.level;
  if (Number.isFinite(a)) return Math.max(a, own || 1);
  const best = Math.max(0, ...(net?.chars || []).map(c => c?.level || 0));
  return Math.max(best, own || 1);
}
/** A client-side hint for why a channel is shut (the server decides; this saves a round trip and explains it). `level` = the ACCOUNT's (accountLevel). */
export function channelGate(ch, { claimed = false, level = 1, party = false, guild = false } = {}) {
  if (ch === 'party' && !party) return 'You are not in a party.';
  if (ch === 'guild' && !guild) return 'You are not in a guild.';
  if (['zone', 'trade', 'world'].includes(ch)) {
    if (!claimed) return 'Public channels need a claimed account. Claim yours (it is free) to talk here.';
    if (level < PUBLIC_LEVEL) return `Public channels open when one of your characters reaches level ${PUBLIC_LEVEL}.`;
  }
  return null;
}

/** Plain words for refusals that come without a msg. */
export const ERR_TEXT = {
  chatGate: `That needs a claimed account with a character at level ${PUBLIC_LEVEL}.`,
  slow: 'Slow down a little — that channel has a short wait between lines.',
  muted: 'You are muted for now.',
  ignored: 'They are not taking messages from you.',
  notFound: 'Nobody by that name is around.',
  party: 'You are not in a party.',
  guild: 'You are not in a guild.',
};
export const MAIL_WHY = {
  gate: `Sending mail needs a claimed account with a character at level ${PUBLIC_LEVEL}.`,
  town: 'You can only send or take mail in a town.',
  busy: 'Finish your trade first.',
  items: 'A letter holds at most 6 items.',
  gold: 'You do not have that much gold (postage is 1 gold).',
  item: 'One of those items is not in your bag.',
  trade: 'Finish your trade first.',
  slow: 'Too many letters — wait a little.',
  notFound: 'No character by that name.',
  self: 'You cannot mail this character itself.',
  ignored: 'They are not taking mail from you.',
  failed: 'The post office lost the letter — nothing was taken. Try again.',
  missing: 'That letter is gone.',
  empty: 'Nothing left to take.',
  bagFull: 'Your bag is full.',
  holds: 'Take what is in it first.',
};
export const ACCOUNT_WHY = {
  user: 'Usernames are 3–20 letters, numbers, dots, dashes or underscores, and must be free.',
  pass: 'Passwords are 8 to 128 characters.',
  email: 'That email address does not look right.',
  claimed: 'This account is already claimed.',
  human: 'The human check did not pass. Try again.',
  auth: 'Wrong username or password.',
  tooManyLogins: 'Too many tries. Wait a few minutes and try again.',
  claimFirst: 'A guest account cannot log out — it would be lost. Claim it first (free), then you can log out and back in anywhere.',
  state: 'Not right now.',
};

/** Client checks for the claim form (the server checks again). Returns an error string or null. */
export function claimCheck({ user, pass, pass2, email } = {}) {
  if (!/^[A-Za-z0-9._-]{3,20}$/.test(user || '')) return ACCOUNT_WHY.user;
  if (!pass || pass.length < 8 || pass.length > 128) return ACCOUNT_WHY.pass;
  if (pass2 != null && pass !== pass2) return 'The two passwords do not match.';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ACCOUNT_WHY.email;
  return null;
}

// ---- friends ----
/** Online first, then by name. */
export function sortFriends(list) {
  return [...(list || [])].sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || String(a.name).localeCompare(String(b.name)));
}
/** Merge one friendState row into the list (a new row is added). */
export function mergeFriend(list, row) {
  const out = (list || []).map(f => (f.char === row.char ? { ...f, ...row } : f));
  if (!out.some(f => f.char === row.char)) out.push({ ...row });
  return out;
}

// ---- guilds ----
export const RANK_NAMES = ['Leader', 'Officer', 'Member', 'Recruit'];
/** What a member of rank `me` may do to a member of rank `them` (protocol §16.4). `self` = it is me. */
export function guildPerms(me, them, self = false) {
  const officer = me <= 1;
  return {
    invite: officer,
    motd: officer,
    kick: !self && officer && them > me,
    // js/sim/guilds.js: only officers, only someone below you, and the new rank stays below yours, within 1..3
    promote: !self && officer && them > me && them - 1 > me && them - 1 >= 1,
    demote: !self && officer && them > me && them + 1 <= 3,
    lead: !self && me === 0,
    disband: me === 0,
    leave: true,
  };
}
/** Roster order: rank, then online, then name. */
export function sortRoster(members) {
  return [...(members || [])].sort((a, b) => a.rank - b.rank || (b.online ? 1 : 0) - (a.online ? 1 : 0) || String(a.name).localeCompare(String(b.name)));
}
export const GUILD_FEE = 10;
export function guildNameCheck(name) {
  const n = String(name || '').trim();
  if (!/^[A-Za-z' -]{3,24}$/.test(n)) return 'Guild names are 3–24 letters, spaces, apostrophes or dashes.';
  return null;
}

// ---- mail ----
export const MAIL_LIMITS = { items: 6, postage: 1, subject: 60, body: 500 };
/** Compose checks. `gold` = what you carry. Returns { ok, why?, cost }. */
export function composeCheck({ to, subject = '', body = '', items = [], gold: send = 0 } = {}, { gold = 0, me = '' } = {}) {
  const cost = MAIL_LIMITS.postage + Math.max(0, Math.floor(+send || 0));
  if (!String(to || '').trim()) return { ok: false, why: 'Who is it for?', cost };
  if (me && String(to).trim().toLowerCase() === String(me).toLowerCase()) return { ok: false, why: MAIL_WHY.self, cost };
  if (String(subject).length > MAIL_LIMITS.subject) return { ok: false, why: `Subjects are at most ${MAIL_LIMITS.subject} letters.`, cost };
  if (String(body).length > MAIL_LIMITS.body) return { ok: false, why: `Letters are at most ${MAIL_LIMITS.body} letters.`, cost };
  if (items.length > MAIL_LIMITS.items) return { ok: false, why: MAIL_WHY.items, cost };
  if (!(+send >= 0) || Math.floor(+send) !== +send) return { ok: false, why: 'Gold must be a whole number.', cost };
  if (cost > gold) return { ok: false, why: `That costs ${cost} gold with postage; you have ${gold}.`, cost };
  if (!String(subject).trim() && !String(body).trim() && !items.length && !send) return { ok: false, why: 'The letter is empty.', cost };
  return { ok: true, cost };
}
/** "in 29 days" / "in 5 hours" / "today" for when a letter goes back. */
export function expiresText(at, now = Date.now()) {
  if (!at) return '';
  const ms = at - now;
  if (ms <= 0) return 'going back now';
  const h = ms / 3600000;
  if (h < 1) return 'goes back within the hour';
  if (h < 48) return `goes back in ${Math.round(h)} hours`;
  return `goes back in ${Math.round(h / 24)} days`;
}
/** What a letter holds, in one line: "2 items, 15 gold". */
export function attachText(m) {
  const n = (m.items || []).length, parts = [];
  if (n) parts.push(n === 1 ? '1 item' : `${n} items`);
  if (m.gold) parts.push(`${m.gold} gold`);
  return parts.join(', ');
}
/** Something left to take? */
export const hasAttachments = m => !m.taken && (((m.items || []).length > 0) || (m.gold || 0) > 0);
/** Inbox order: unread first, then newest. */
export function sortMail(list) {
  return [...(list || [])].sort((a, b) => (a.read ? 1 : 0) - (b.read ? 1 : 0) || (b.sentAt || 0) - (a.sentAt || 0));
}

// ---- the Callboard ----
export const CALLBOARD_LEVEL = 8;
export const ROLES = [{ id: 'tank', label: 'Tank' }, { id: 'healer', label: 'Healer' }, { id: 'dps', label: 'Damage' }];
/** A sensible first role from a class id (the player can change it). */
export function defaultRole(cls) {
  const c = String(cls || '');
  if (/(knight|warrior|paladin|guardian|dragon|juggernaut|templar)/.test(c)) return 'tank';
  if (/(cleric|priest|druid|shaman|oracle|bard|healer|monk_mist)/.test(c)) return 'healer';
  return 'dps';
}
/** m:ss */
export function mmss(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
/** The pop's countdown 0..1 left. */
export const popLeft = (pop, now) => Math.max(0, Math.min(1, (pop.until - now) / (pop.ms || 30000)));

// ---- keyboard shortcuts (the help overlay reads this; main.js/panels bind them) ----
// Play-test 5 (T27, stream G): both tables are BUILT from the one binding table (js/client/input/bindings.js), so the help
// window, the settings tab, the on-screen hints, the controller and the touch layout can never disagree about a key.
export const SHORTCUTS = shortcutsTable();
/** Window hotkeys: KeyboardEvent.code -> panel id. */
export const PANEL_KEYS = panelKeys();
