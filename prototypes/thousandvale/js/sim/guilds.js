// GUILDS (stream A, PLAN §15 M3; roast: "SIMPLIFY: roster + chat + MOTD only"), part of the gateway. Pure.
// Saved in the `guilds` / `guild_members` tables. Four ranks (0 Leader, 1 Officer, 2 Member, 3 Recruit):
//   create        a claimed account, level 5+, not in a guild, a name that passes the filter; costs GUILD_FEE gold
//                 (a sink, PLAN §13), taken by the province process that holds the character (`charge` on the bus)
//   invite        officers and the leader; the invite lasts 2 minutes      accept / decline   the invited player
//   kick          officers and the leader, only someone of lower rank       leave              anyone (the leader passes
//                 the lead first, or disbands when alone)
//   promote/demote one step, only below your own rank (the leader names officers)   lead   the leader hands it on
//   motd          officers and the leader (200 characters, filtered)         disband            the leader
// Every change sends the whole `guildState` to the members who are online. Guild chat is `chat {ch:'guild'}`.
// Operations on one guild run one after another (a promise chain), so two officers cannot interleave.
//
//   const G = createGuilds({ store, presence, gwByChar, wallNow, filter, charge, log, counters })
//   G.load(charId) ; G.op(s, m) ; G.changed(charId) ; G.drop(charId) ; G.idOf(charId) ; G.onlineMembers(charId)

import { economy } from './economy-knobs.js';
import { GUILD_MAX } from './store-memory-m3.js';

export const GUILD_OPS = Object.freeze(['create', 'invite', 'accept', 'decline', 'leave', 'kick', 'promote', 'demote', 'lead', 'motd', 'roster', 'disband']);
export const GUILD = Object.freeze({ fee: 10, minLevel: 5, inviteMs: 120000, motdMax: 200 });

/** Guild names: 3-24 letters and spaces / apostrophes / hyphens, starting with a letter. */
export function cleanGuildName(s) {
  const n = String(s || '').replace(/\s+/g, ' ').trim();
  return n.length >= 3 && n.length <= 24 && /^\p{L}[\p{L} '\-]*$/u.test(n) ? n : null;
}

export function createGuilds({ store, presence, gwByChar, wallNow, filter = null, charge = async () => true, log = () => {}, counters = {}, opts = {} }) {
  const R = { ...GUILD, fee: economy().guild.fee, ...opts };          // V2: the founding fee from data/rules/economy.json server.guild
  const byId = new Map();           // guild id -> view { id, name, motd, ranks, members: [{ char, name, cls, level, rank }] }
  const ofChar = new Map();         // char -> guild id
  const invites = new Map();        // char -> { guild, from, at }
  const chains = new Map();         // guild id (or 'c'+char for create) -> promise
  const serial = (k, fn) => { const p = (chains.get(k) || Promise.resolve()).then(fn, fn); chains.set(k, p.catch(() => {})); return p; };

  function put(g) {
    const old = byId.get(g.id);
    if (old) for (const m of old.members) if (ofChar.get(m.char) === g.id) ofChar.delete(m.char);
    byId.set(g.id, g);
    for (const m of g.members) ofChar.set(m.char, g.id);
  }
  function forget(id) { const g = byId.get(id); if (g) for (const m of g.members) if (ofChar.get(m.char) === id) ofChar.delete(m.char); byId.delete(id); }
  const view = g => ({ id: g.id, name: g.name, motd: g.motd, ranks: g.ranks, members: g.members.map(m => { const pr = presence.get(m.char); return { ...m, name: pr ? pr.name : m.name, level: pr ? pr.level : m.level, online: !!(pr && pr.online), zone: pr ? pr.zone || null : null }; }) });
  function tell(g, extra = {}) { const d = JSON.stringify({ t: 'guildState', guild: view(g), ...extra }); for (const m of g.members) { const s = gwByChar.get(m.char); if (s) s.send(d); } }
  const tellOne = (c, guild, extra = {}) => { const s = gwByChar.get(c); if (s) s.sendJSON({ t: 'guildState', guild: guild ? view(guild) : null, ...extra }); };
  const reply = (s, op, x) => s.sendJSON({ t: 'guildR', op, ...x });
  const fail = (s, op, msg) => reply(s, op, { ok: false, why: 'guild', msg });
  async function refresh(id) { const g = await store.guildById(id); if (g) put(g); else forget(id); return g; }

  async function load(c) {
    let g = await store.guildOf(c);
    // a guild whose leader is gone (an account deleted) gets the highest-ranked member, longest in it, as leader
    if (g && g.members.length && !g.members.some(m => m.rank === 0)) {
      const next = g.members.slice().sort((a, b) => a.rank - b.rank)[0];
      await store.guildSetRank(g.id, next.char, 0);
      g = await store.guildById(g.id);
    }
    if (g) { put(g); tellOne(c, byId.get(g.id)); } else ofChar.delete(c);
  }

  async function op(s, m) {
    const me = s.charId, pr = me && presence.get(me);
    if (!pr) return s.err('state', 'Enter the world first.');
    if (!GUILD_OPS.includes(m.op)) return 'op';
    const gid = ofChar.get(me);
    const g = gid ? byId.get(gid) : null;
    const mine = g ? g.members.find(x => x.char === me) : null;
    const target = () => (g && m.char != null ? g.members.find(x => x.char === m.char) : null);
    switch (m.op) {
      case 'create': return serial('c' + me, async () => {
        if (ofChar.get(me)) return fail(s, 'create', 'You are already in a guild.');
        // W11 (round 8): claimed is the account's; so is the level (its highest character, s.alv)
        if (!s.claimed) return fail(s, 'create', 'Founding a guild needs a claimed account. Claim yours from the Account button — it is free.');
        if (Math.max(pr.level || 1, s.alv || 1) < R.minLevel) return fail(s, 'create', 'Founding a guild opens when one of your characters reaches level ' + R.minLevel + '.');
        const name = cleanGuildName(m.name);
        if (!name || (filter && !filter.name(name))) return fail(s, 'create', 'Pick a guild name: 3 to 24 letters, spaces, apostrophes or hyphens.');
        const r = await store.createGuild(name, me);
        if (r.err) return fail(s, 'create', r.err === 'name' ? 'That guild name is taken.' : 'You are already in a guild.');
        const paid = await charge(me, R.fee, 'guild');
        if (!paid) { await store.guildDisband(r.guild.id); return fail(s, 'create', 'Founding a guild costs ' + R.fee + ' gold.'); }
        put(r.guild);
        counters.guildsMade = (counters.guildsMade || 0) + 1;
        reply(s, 'create', { ok: true, guild: r.guild.id });
        return tell(byId.get(r.guild.id));
      });
      case 'accept': case 'decline': {
        const inv = invites.get(me);
        if (!inv || (m.id != null && inv.guild !== m.id) || inv.at < wallNow() - R.inviteMs) { invites.delete(me); return fail(s, m.op, 'That invitation has run out.'); }
        invites.delete(me);
        if (m.op === 'decline') { const from = gwByChar.get(inv.from); if (from) reply(from, 'invite', { ok: false, msg: pr.name + ' declined.' }); return reply(s, 'decline', { ok: true }); }
        return serial(inv.guild, async () => {
          if (ofChar.get(me)) return fail(s, 'accept', 'You are already in a guild.');
          const r = await store.guildJoin(inv.guild, me, 3, GUILD_MAX);
          if (r.err) return fail(s, 'accept', r.err === 'full' ? 'That guild is full.' : r.err === 'inGuild' ? 'You are already in a guild.' : 'That guild is gone.');
          const ng = await refresh(inv.guild);
          reply(s, 'accept', { ok: true });
          if (ng) tell(byId.get(ng.id), { joined: pr.name });
        });
      }
    }
    if (!g || !mine) return fail(s, m.op, 'You are not in a guild.');
    return serial(g.id, async () => {
      const cur = byId.get(g.id);
      if (!cur) return fail(s, m.op, 'That guild is gone.');
      const me2 = cur.members.find(x => x.char === me);
      if (!me2) return fail(s, m.op, 'You are not in that guild any more.');
      const rank = me2.rank;
      switch (m.op) {
        case 'roster': return tellOne(me, cur);
        case 'invite': {
          if (rank > 1) return fail(s, 'invite', 'Only officers can invite.');
          const t = [...presence.values()].find(x => x.online && x.name.toLowerCase() === String(m.name || '').toLowerCase());
          if (!t) return fail(s, 'invite', CODES_NOT_FOUND);
          if (ofChar.get(t.char)) return fail(s, 'invite', t.name + ' is already in a guild.');
          if (t.ignore && t.ignore.some(i => i.id === me)) return fail(s, 'invite', t.name + ' is not taking invitations from you.');
          invites.set(t.char, { guild: cur.id, from: me, at: wallNow() });
          const ts = gwByChar.get(t.char);
          if (ts) ts.sendJSON({ t: 'guildInvite', guild: cur.id, name: cur.name, from: pr.name, ms: R.inviteMs });
          return reply(s, 'invite', { ok: true, name: t.name });
        }
        case 'kick': {
          const t = target();
          if (!t || t.char === me) return fail(s, 'kick', 'Not in your guild.');
          if (rank > 1 || t.rank <= rank) return fail(s, 'kick', 'You can only remove someone of lower rank.');
          await store.guildLeave(cur.id, t.char);
          ofChar.delete(t.char);
          await refresh(cur.id);
          tellOne(t.char, null, { kicked: true });
          return tell(byId.get(cur.id), { left: t.name });
        }
        case 'promote': case 'demote': {
          const t = target();
          if (!t || t.char === me) return fail(s, m.op, 'Not in your guild.');
          const to = t.rank + (m.op === 'promote' ? -1 : 1);
          if (rank > 1 || t.rank <= rank || to <= rank || to < 1 || to > 3) return fail(s, m.op, 'You can only move ranks below your own.');
          await store.guildSetRank(cur.id, t.char, to);
          await refresh(cur.id);
          return tell(byId.get(cur.id));
        }
        case 'lead': {
          const t = target();
          if (rank !== 0) return fail(s, 'lead', 'Only the leader can hand on the lead.');
          if (!t || t.char === me) return fail(s, 'lead', 'Not in your guild.');
          await store.guildSetRank(cur.id, t.char, 0);
          await store.guildSetRank(cur.id, me, 1);
          await refresh(cur.id);
          return tell(byId.get(cur.id));
        }
        case 'motd': {
          if (rank > 1) return fail(s, 'motd', 'Only officers can set the message of the day.');
          const raw = String(m.text || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, R.motdMax);
          const text = filter ? filter.text(raw) : raw;
          await store.guildMotd(cur.id, text);
          await refresh(cur.id);
          return tell(byId.get(cur.id));
        }
        case 'leave': {
          if (rank === 0 && cur.members.length > 1) return fail(s, 'leave', 'Hand the lead to someone first (or disband the guild).');
          if (cur.members.length <= 1) { await store.guildDisband(cur.id); forget(cur.id); return tellOne(me, null, { disbanded: true }); }
          await store.guildLeave(cur.id, me);
          ofChar.delete(me);
          await refresh(cur.id);
          tellOne(me, null);
          return tell(byId.get(cur.id), { left: pr.name });
        }
        case 'disband': {
          if (rank !== 0) return fail(s, 'disband', 'Only the leader can disband the guild.');
          const members = cur.members.map(x => x.char);
          await store.guildDisband(cur.id);
          forget(cur.id);
          for (const c of members) tellOne(c, null, { disbanded: true });
          return;
        }
      }
      return 'op';
    });
  }

  return {
    load: c => load(c).catch(err => log('guild load failed', err && err.message)),
    op: (s, m) => Promise.resolve(op(s, m)).catch(err => { log('guild op failed', err && err.stack); s.err('state', 'That did not work.'); }),
    /** presence moved (online / level): resend the roster to the members online (at most once per change) */
    changed(c) { const id = ofChar.get(c); const g = id && byId.get(id); if (g) tell(g); },
    drop(c) {
      const id = ofChar.get(c);
      if (!id) return;
      const g = byId.get(id);
      if (g && !g.members.some(m => m.char !== c && gwByChar.get(m.char))) forget(id);     // nobody of that guild left online: drop the cache
      else ofChar.delete(c);
    },
    idOf: c => ofChar.get(c) || null,
    onlineMembers(c) { const id = ofChar.get(c); const g = id && byId.get(id); return g ? g.members.map(m => m.char).filter(x => presence.get(x)?.online) : null; },
    get: id => byId.get(id) || null,
    size: () => byId.size,
  };
}

const CODES_NOT_FOUND = 'Nobody by that name is online.';
