// M3 store methods for the in-memory store (stream A): accounts (claim, session tokens, resets, bans), friends,
// guilds, mail with escrowed items, reports, the chat log and world state. Same interface and the same
// all-or-nothing rules as server/db/pg-social.js; js/sim/store-memory.js mixes these in. Pure.
//
// Times are wall-clock ms (the caller's clock), so tests can move time on.
//
// ACCOUNTS
//   claimAccount(account, { username, passHash, email }) -> { ok } | { err: 'taken' | 'claimed' | 'missing' }
//   loginInfo(username) -> { account, passHash, banned (ms) } | null
//   newToken(account, kind='session') -> token          revokeToken(token) -> bool
//   setPassword(account, passHash, keepToken?)            every other token is revoked (a stolen session dies)
//   setReset(account, codeHash, untilMs) ; resetByCode(username, codeHash, nowMs) -> account | null
//   accountInfo(account) -> { id, claimed, username, email, banned, banReason, created } | null
//   banAccount(account, untilMs, reason) ; banIp(ipHash, untilMs, reason) ; ipBanned(ipHash, nowMs) -> bool
// CHARACTERS
//   charByName(name) -> { id, name, account, cls, level, ignore: [char ids] } | null ; charsByIds(ids) -> [brief]
//   renameChar(id, name, nowMs) -> { ok } | { err: 'name' | 'lease' | 'missing' }
// FRIENDS   listFriends(char) -> [brief] ; addFriend(char, friend, max) -> { ok } | { err } ; removeFriend(char, friend)
// GUILDS    createGuild(name, leader) -> { guild } | { err: 'name' | 'inGuild' } ; guildOf(char) -> guild | null
//           guildById(id) ; guildJoin(id, char, rank, max) ; guildLeave(id, char) ; guildSetRank(id, char, rank)
//           guildMotd(id, text) ; guildDisband(id)
//           guild = { id, name, motd, ranks: [4 names], members: [{ char, name, cls, level, rank }] }
// MAIL      mailSend({ ch, fence }, mail) -> { id } | false   (sender blob + letter + escrow rows, all or nothing)
//           mail = { to, fromChar, fromName, subject, body, gold, items: [item], kind, sentAt, expiresAt }
//           mailList(char, limit) ; mailGet(char, id) ; mailRead(char, id, nowMs) ; mailUnread(char)
//           mailTake({ ch, fence }, id, uids, nowMs) -> true | false   (receiver blob + escrow out, all or nothing)
//           mailReturn(char, id, nowMs) -> { to } | false ; mailDelete(char, id) -> bool
//           mailExpire(nowMs) -> [{ to, returned }]    expired player mail goes back to its sender (returned mail keeps)
//           escrow() -> { items, gold }   (conservation checks)
// OTHER     addReport(r) ; listReports(limit) ; handleReport(id, nowMs) ; logChat(rows) ; pruneChat(beforeMs)
//           getWorld(key) ; setWorld(key, value) ; economyReport(sinceMs) -> rows

export const FRIENDS_MAX = 100, GUILD_MAX = 500;
const RANKS = ['Leader', 'Officer', 'Member', 'Recruit'];
const copy = v => JSON.parse(JSON.stringify(v));

export function memoryM3(d, { now, changed, sha256Hex, randomHex, packChar, prune, brief }) {
  d.tokens ||= {};
  d.ipBans ||= {};
  d.friends ||= {};          // char -> [friend ids]
  d.guilds ||= {}; d.nextGuild ||= 1;
  d.members ||= {};          // char -> { guild, rank, joined }
  d.mail ||= {}; d.nextMail ||= 1;
  d.items ||= {};            // uid -> { mail, item }
  d.reports ||= []; d.nextReport ||= 1;
  d.chatLog ||= [];
  d.world ||= {};
  const charRow = id => d.chars[id];
  const lower = s => String(s || '').toLowerCase();
  const bannedMs = a => (a.bannedUntil || 0);
  const okSave = (ch, fence) => { const r = d.chars[ch.id]; return !!(r && r.version === ch.version && r.lease_fence === fence); };
  const writeSave = ch => {
    const r = d.chars[ch.id];
    const { cols, blob } = packChar(ch);
    r.cols = cols; r.blob = blob; r.version++;
    ch.version = r.version;
    prune(ch.id, ch.jseq || 0);
  };
  const guildView = g => ({
    id: g.id, name: g.name, motd: g.motd, ranks: g.ranks.slice(),
    members: Object.entries(d.members).filter(([, m]) => m.guild === g.id).map(([c, m]) => { const r = charRow(+c); return { char: +c, name: r ? r.cols.name : '?', cls: r ? r.cols.cls : '', level: r ? r.cols.level : 1, rank: m.rank }; }).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)),
  });
  const mailHead = m => ({ id: m.id, from: m.fromName, fromChar: m.fromChar, subject: m.subject, kind: m.kind, sentAt: m.sentAt, expiresAt: m.expiresAt, read: !!m.readAt, taken: !!m.takenAt, gold: m.takenAt ? 0 : m.gold,
    items: m.takenAt ? [] : Object.values(d.items).filter(x => x.mail === m.id).map(x => ({ uid: x.item.uid, name: x.item.name, rarity: x.item.rarity, slot: x.item.slot })) });

  return {
    // ---- accounts ----
    async claimAccount(account, { username, passHash, email = null }) {
      const a = d.accounts[account];
      if (!a) return { err: 'missing' };
      if (a.claimed) return { err: 'claimed' };
      if (Object.values(d.accounts).some(x => x.username && lower(x.username) === lower(username))) return { err: 'taken' };
      a.username = username; a.passHash = passHash; a.email = email || null; a.claimed = true; a.claimedAt = now();
      changed();
      return { ok: true };
    },
    async loginInfo(username) {
      const a = Object.values(d.accounts).find(x => x.username && lower(x.username) === lower(username));
      return a ? { account: a.id, passHash: a.passHash, banned: bannedMs(a), admin: !!a.admin } : null;
    },
    async newToken(account, kind = 'session') {
      const token = randomHex(32);
      d.tokens[sha256Hex(token)] = { account, kind, created: now() };
      changed();
      return token;
    },
    async revokeToken(token) {
      const h = sha256Hex(String(token));
      let hit = false;
      if (d.tokens[h]) { delete d.tokens[h]; hit = true; }
      for (const a of Object.values(d.accounts)) if (a.tokenHash === h) { a.tokenHash = null; hit = true; }
      if (hit) changed();
      return hit;
    },
    async setPassword(account, passHash, keepToken = null) {
      const a = d.accounts[account];
      if (!a) return false;
      a.passHash = passHash; a.resetHash = null; a.resetUntil = 0;
      const keep = keepToken ? sha256Hex(String(keepToken)) : null;
      for (const [h, t] of Object.entries(d.tokens)) if (t.account === account && h !== keep) delete d.tokens[h];
      if (a.tokenHash && a.tokenHash !== keep) a.tokenHash = null;
      changed();
      return true;
    },
    async setReset(account, codeHash, untilMs) { const a = d.accounts[account]; if (!a) return false; a.resetHash = codeHash; a.resetUntil = untilMs; changed(); return true; },
    async resetByCode(username, codeHash, nowMs) {
      const a = Object.values(d.accounts).find(x => x.username && lower(x.username) === lower(username));
      if (!a || !a.resetHash || a.resetHash !== codeHash || (a.resetUntil || 0) < nowMs) return null;
      a.resetHash = null; a.resetUntil = 0; changed();
      return a.id;
    },
    async accountInfo(account) {
      const a = d.accounts[account];
      return a ? { id: a.id, claimed: !!a.claimed, username: a.username || null, email: a.email || null, banned: bannedMs(a), banReason: a.banReason || null, created: a.created, admin: !!a.admin } : null;
    },
    async banAccount(account, untilMs, reason = '') {
      const a = d.accounts[account]; if (!a) return false;
      a.bannedUntil = untilMs; a.banReason = reason; changed(); return true;
    },
    async banIp(ipHash, untilMs, reason = '') { d.ipBans[ipHash] = { until: untilMs, reason }; changed(); return true; },
    async ipBanned(ipHash, nowMs) { const b = d.ipBans[ipHash]; return !!(b && b.until > nowMs); },

    // ---- characters ----
    async charByName(name) {
      const r = Object.values(d.chars).find(x => lower(x.cols.name) === lower(name));
      if (!r) return null;
      return { id: r.id, name: r.cols.name, account: r.account, cls: r.cols.cls, level: r.cols.level, ignore: ((r.blob && r.blob.ignore) || []).map(i => i.id) };
    },
    async charsByIds(ids) { return ids.map(id => d.chars[id]).filter(Boolean).map(brief); },
    async renameChar(id, name, nowMs) {
      const r = d.chars[id];
      if (!r) return { err: 'missing' };
      if (r.lease_owner && r.lease_until > nowMs) return { err: 'lease' };
      if (Object.values(d.chars).some(x => x.id !== id && lower(x.cols.name) === lower(name))) return { err: 'name' };
      r.cols.name = name; changed();
      return { ok: true };
    },

    // ---- friends ----
    async listFriends(char) { return (d.friends[char] || []).map(id => d.chars[id]).filter(Boolean).map(brief); },
    async addFriend(char, friend, max = FRIENDS_MAX) {
      const l = d.friends[char] ||= [];
      if (l.includes(friend)) return { ok: true };
      if (l.length >= max) return { err: 'full' };
      if (!d.chars[friend]) return { err: 'missing' };
      l.push(friend); changed();
      return { ok: true };
    },
    async removeFriend(char, friend) { const l = d.friends[char] || []; const i = l.indexOf(friend); if (i >= 0) { l.splice(i, 1); changed(); } return i >= 0; },

    // ---- guilds ----
    async createGuild(name, leader) {
      if (d.members[leader]) return { err: 'inGuild' };
      if (Object.values(d.guilds).some(g => lower(g.name) === lower(name))) return { err: 'name' };
      const id = d.nextGuild++;
      d.guilds[id] = { id, name, motd: '', ranks: RANKS.slice(), createdBy: leader, created: now() };
      d.members[leader] = { guild: id, rank: 0, joined: now() };
      changed();
      return { guild: guildView(d.guilds[id]) };
    },
    async guildOf(char) { const m = d.members[char]; return m && d.guilds[m.guild] ? guildView(d.guilds[m.guild]) : null; },
    async guildById(id) { return d.guilds[id] ? guildView(d.guilds[id]) : null; },
    async guildJoin(id, char, rank = 3, max = GUILD_MAX) {
      if (!d.guilds[id]) return { err: 'missing' };
      if (d.members[char]) return { err: 'inGuild' };
      if (Object.values(d.members).filter(m => m.guild === id).length >= max) return { err: 'full' };
      d.members[char] = { guild: id, rank, joined: now() }; changed();
      return { ok: true };
    },
    async guildLeave(id, char) { const m = d.members[char]; if (!m || m.guild !== id) return false; delete d.members[char]; changed(); return true; },
    async guildSetRank(id, char, rank) { const m = d.members[char]; if (!m || m.guild !== id) return false; m.rank = rank; changed(); return true; },
    async guildMotd(id, text) { const g = d.guilds[id]; if (!g) return false; g.motd = text; changed(); return true; },
    async guildDisband(id) {
      if (!d.guilds[id]) return false;
      delete d.guilds[id];
      for (const [c, m] of Object.entries(d.members)) if (m.guild === id) delete d.members[c];
      changed();
      return true;
    },

    // ---- mail ----
    async mailSend({ ch, fence }, mail) {
      if (!okSave(ch, fence) || !d.chars[mail.to]) return false;
      const uids = (mail.items || []).map(i => i.uid);
      if (uids.some(u => !u || d.items[u]) || new Set(uids).size !== uids.length) return false;     // a uid already in escrow: refuse it all
      writeSave(ch);
      const id = d.nextMail++;
      d.mail[id] = { id, to: mail.to, fromChar: mail.fromChar ?? null, fromName: mail.fromName, subject: mail.subject || '', body: mail.body || '', gold: mail.gold || 0, kind: mail.kind || 'player', sentAt: mail.sentAt ?? now(), expiresAt: mail.expiresAt ?? null, readAt: 0, takenAt: 0 };
      for (const it of mail.items || []) d.items[it.uid] = { mail: id, item: copy(it) };
      changed();
      return { id };
    },
    async mailSystem(mail) {
      if (!d.chars[mail.to]) return false;
      const uids = (mail.items || []).map(i => i.uid);
      if (uids.some(u => !u || d.items[u])) return false;
      const id = d.nextMail++;
      d.mail[id] = { id, to: mail.to, fromChar: null, fromName: mail.fromName || 'The Vale', subject: mail.subject || '', body: mail.body || '', gold: mail.gold || 0, kind: 'system', sentAt: mail.sentAt ?? now(), expiresAt: mail.expiresAt ?? null, readAt: 0, takenAt: 0 };
      for (const it of mail.items || []) d.items[it.uid] = { mail: id, item: copy(it) };
      changed();
      return { id };
    },
    async mailList(char, limit = 50) { return Object.values(d.mail).filter(m => m.to === char).sort((a, b) => b.sentAt - a.sentAt || b.id - a.id).slice(0, limit).map(mailHead); },
    async mailUnread(char) { return Object.values(d.mail).filter(m => m.to === char && !m.readAt).length; },
    async mailGet(char, id) {
      const m = d.mail[id];
      if (!m || m.to !== char) return null;
      return { ...mailHead(m), body: m.body, itemsFull: m.takenAt ? [] : Object.values(d.items).filter(x => x.mail === id).map(x => copy(x.item)) };
    },
    async mailRead(char, id, nowMs) { const m = d.mail[id]; if (!m || m.to !== char) return false; if (!m.readAt) { m.readAt = nowMs; changed(); } return true; },
    async mailTake({ ch, fence }, id, uids, nowMs) {
      const m = d.mail[id];
      if (!m || m.to !== ch.id || m.takenAt) return false;
      const held = Object.entries(d.items).filter(([, x]) => x.mail === id).map(([u]) => u).sort();
      if (held.join('|') !== uids.slice().sort().join('|')) return false;      // exactly the escrow rows the letter holds
      if (!okSave(ch, fence)) return false;
      writeSave(ch);
      for (const u of held) delete d.items[u];
      m.takenAt = nowMs; m.readAt ||= nowMs;
      changed();
      return true;
    },
    async mailReturn(char, id, nowMs) {
      const m = d.mail[id];
      if (!m || m.to !== char || m.takenAt || m.kind !== 'player' || m.fromChar == null || !d.chars[m.fromChar]) return false;
      return returnOne(m, nowMs);
    },
    async mailDelete(char, id) {
      const m = d.mail[id];
      if (!m || m.to !== char) return false;
      const holds = !m.takenAt && (m.gold > 0 || Object.values(d.items).some(x => x.mail === id));
      if (holds) return false;
      delete d.mail[id]; changed();
      return true;
    },
    async mailExpire(nowMs) {
      const out = [];
      for (const m of Object.values(d.mail)) {
        if (!m.expiresAt || m.expiresAt > nowMs) continue;
        const holds = !m.takenAt && (m.gold > 0 || Object.values(d.items).some(x => x.mail === m.id));
        if (holds && m.kind === 'player' && m.fromChar != null && d.chars[m.fromChar]) { const r = returnOne(m, nowMs); if (r) out.push({ to: r.to, returned: true }); continue; }
        if (holds) { m.expiresAt = null; continue; }        // nobody to return it to: keep it (never destroy items)
        delete d.mail[m.id];
      }
      if (out.length) changed();
      return out;
    },
    async escrow() {
      let gold = 0; for (const m of Object.values(d.mail)) if (!m.takenAt) gold += m.gold;
      return { items: Object.keys(d.items).length, gold, uids: Object.keys(d.items) };
    },

    // ---- feedback (play-test 5, T19/T21) + admin accounts ----
    // addFeedback(row) -> { id, first }   first = this character's first report (it earns the thank-you letter, once)
    // listFeedback({ state, kind, limit, before, hideTrashed }) newest first ; feedbackCounts() ; setFeedbackState(id, state, { by, at, note })
    // setAdmin(usernameOrAccountId, on) -> { ok, account, username } | { err } ; isAdmin(account) -> bool
    async addFeedback(row) {
      d.feedback ||= []; d.nextFeedback ||= 1;
      const id = d.nextFeedback++;
      const first = row.char != null && !d.feedback.some(f => f.char === row.char && f.gift);
      d.feedback.push({ id, ...copy(row), at: row.at ?? now(), state: row.state || 'new', note: '', gift: first });
      changed();
      return { id, first };
    },
    async hasFeedback(char) { return (d.feedback || []).some(f => f.char === char); },
    async feedbackGiftFailed(char) { for (const f of d.feedback || []) if (f.char === char) f.gift = false; changed(); },
    async listFeedback({ state = null, kind = null, limit = 100, before = null, hideTrashed = false } = {}) {
      return (d.feedback || []).filter(f => (!state || f.state === state) && (!kind || f.kind === kind) && (!before || f.id < before) && !(hideTrashed && f.state === 'trashed'))
        .sort((x, y) => y.id - x.id).slice(0, limit).map(copy);
    },
    async feedbackCounts() {
      const c = { new: 0, approved: 0, declined: 0, trashed: 0, total: 0 };
      for (const f of d.feedback || []) { c[f.state] = (c[f.state] || 0) + 1; c.total++; }
      return c;
    },
    async setFeedbackState(id, state, { by = 'admin', at = now(), note = null } = {}) {
      const f = (d.feedback || []).find(x => x.id === id);
      if (!f) return false;
      f.state = state; f.stateAt = at; f.stateBy = by; if (note != null) f.note = note;
      changed();
      return true;
    },
    async setAdmin(who, on = true) {
      const a = typeof who === 'number' ? d.accounts[who] : Object.values(d.accounts).find(x => x.username && lower(x.username) === lower(who));
      if (!a) return { err: 'missing' };
      a.admin = !!on; changed();
      return { ok: true, account: a.id, username: a.username || null, admin: a.admin };
    },
    async isAdmin(account) { const a = d.accounts[account]; return !!(a && a.admin); },
    async listAdmins() { return Object.values(d.accounts).filter(a => a.admin).map(a => ({ account: a.id, username: a.username || null })); },

    // ---- reports, chat log, world state, economy ----
    async addReport(r) { const id = d.nextReport++; d.reports.push({ id, ...copy(r), created: r.created ?? now(), handled: 0 }); changed(); return id; },
    async listReports(limit = 100) { return d.reports.slice(-limit).reverse().map(copy); },
    async handleReport(id, nowMs) { const r = d.reports.find(x => x.id === id); if (!r) return false; r.handled = nowMs; changed(); return true; },
    async logChat(rows) { for (const r of rows) d.chatLog.push(copy(r)); if (d.chatLog.length > 50000) d.chatLog.splice(0, d.chatLog.length - 50000); if (rows.length) changed(); },
    async pruneChat(beforeMs) { const n = d.chatLog.length; d.chatLog = d.chatLog.filter(r => r.at >= beforeMs); if (d.chatLog.length !== n) changed(); return n - d.chatLog.length; },
    async getWorld(key) { return d.world[key] === undefined ? null : copy(d.world[key]); },
    async setWorld(key, value) { d.world[key] = copy(value); changed(); },
    async economyReport(sinceMs = 0) { return Object.values(d.economy || {}).filter(r => Date.parse(r.hour) >= sinceMs).map(copy).sort((a, b) => a.hour < b.hour ? 1 : -1); },
  };

  /** Send a letter back to whoever sent it: a new 'return' letter that keeps forever, the same escrow rows. */
  function returnOne(m, nowMs) {
    const id = d.nextMail++;
    d.mail[id] = { id, to: m.fromChar, fromChar: m.to, fromName: (d.chars[m.to] && d.chars[m.to].cols.name) || '?', subject: 'Returned: ' + (m.subject || '').slice(0, 50), body: m.body, gold: m.gold, kind: 'return', sentAt: nowMs, expiresAt: null, readAt: 0, takenAt: 0 };
    for (const x of Object.values(d.items)) if (x.mail === m.id) x.mail = id;
    delete d.mail[m.id];
    changed();
    return { to: m.fromChar, id };
  }
}
