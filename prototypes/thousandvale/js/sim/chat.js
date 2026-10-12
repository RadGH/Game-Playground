// CHAT CHANNELS (stream A, PLAN §5.5 / §11.7), part of the gateway. Pure.
//
//   say     local, on the province socket (js/sim/province.js); the province reports each line here for the log
//   party   your party                    guild   your guild (js/sim/guilds.js)
//   zone    everyone in your zone         trade   everyone online         world   everyone online, slow mode
//   w       a whisper to one name (`to`); the sender gets an `echo` copy
// Public channels (zone/trade/world) and whispers to strangers need a CLAIMED account at level 5+ (PLAN §5.5:
// stops spam bots without rationing play). A guest can always whisper its party, guild and friends, and answer
// anyone who whispered it in the last 10 minutes. Ignore lists apply everywhere; a mute stops everything.
// Every line goes through the filter hook, into a ring buffer (the admin page's "last hour"; reports quote it)
// and into the chat log (store.logChat, kept 30 days).
//
//   const C = createChat({ store, presence, gwByChar, parties, guilds, friends, wallNow, filter, log, counters, opts })
//   C.chat(s, m) ; C.report(s, m) ; C.logLine(row) ; C.recent(sinceMs) ; C.linesOf(charId, n) ; C.step()

import { CODES } from '../net/protocol.js';

export const CHAT = Object.freeze({
  publicLevel: 5,             // zone / trade / world / whispers to strangers
  worldSlowMs: 10000,         // one world line per 10 s per character
  tradeSlowMs: 5000,
  replyMs: 10 * 60000,        // a guest may answer a whisper for this long
  ringMax: 5000, ringMs: 3600000,
  flushMs: 5000,
  keepDays: 30,
  autoMute: { reports: 3, windowMs: 10 * 60000, muteMs: 10 * 60000 },   // distinct claimed accounts reporting one character
});
export const PUBLIC_CHANNELS = Object.freeze(['zone', 'trade', 'world']);

export function createChat({ store, presence, gwByChar, parties, guilds = null, friends = null, wallNow, filter = null, log = () => {}, counters = {}, mute = () => {}, opts = {} }) {
  const R = { ...CHAT, ...opts, autoMute: opts.autoMute === false ? null : { ...CHAT.autoMute, ...(opts.autoMute || {}) } };
  const ring = [];
  let pendingLog = [], lastFlush = wallNow(), lastPrune = 0;
  const slow = new Map();                 // `${ch}:${char}` -> wall ms of the last line
  const whispered = new Map();            // `${to}:${from}` -> wall ms (who may answer whom)
  const reportsAbout = new Map();         // char -> [{ account, at }]

  const clean = t => { const s = String(t).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200); return filter ? filter.text(s) : s; };
  const ignores = (pr, fromId) => !!(pr && pr.ignore && pr.ignore.some(i => i.id === fromId));
  const findOnline = name => { const n = String(name || '').toLowerCase(); for (const pr of presence.values()) if (pr.online && pr.name.toLowerCase() === n) return pr; return null; };
  const sendTo = (charId, d) => { const g = gwByChar.get(charId); if (g) g.send(d); };

  function logLine(row) {
    const r = { at: wallNow(), ch: row.ch, from: row.from ?? null, name: row.name ?? null, to: row.to ?? null, text: row.text };
    ring.push(r);
    while (ring.length > R.ringMax || (ring.length && ring[0].at < r.at - R.ringMs)) ring.shift();
    pendingLog.push(r);
    counters.chatLines = (counters.chatLines || 0) + 1;
  }
  /** Is `to` someone `me` may whisper without the public gate? */
  function close(me, to) {
    const p = parties.of(me);
    if (p && p.members.includes(to)) return true;
    if (guilds && guilds.idOf(me) && guilds.idOf(me) === guilds.idOf(to)) return true;
    if (friends && (friends.has(me, to) || friends.has(to, me))) return true;
    return whispered.has(me + ':' + to) && whispered.get(me + ':' + to) > wallNow() - R.replyMs;
  }

  function chat(s, m) {
    const me = s.charId && presence.get(s.charId);
    if (!me) return s.err('state', 'Enter the world first.');
    if ((me.mutedUntil || 0) > wallNow()) return s.err('muted');
    const text = clean(m.text);
    if (!text) return;
    // W11 (round 8): the gate is about the ACCOUNT — claimed, and ANY of its characters at the level (s.alv), not this one
    const ch = m.ch, lvOk = Math.max(me.level || 1, s.alv || 1) >= R.publicLevel, open = !!s.claimed && lvOk;
    const gateMsg = what => (!s.claimed ? what + ' need a claimed account. Claim yours from the Account button — it is free.' : what + ' open when one of your characters reaches level ' + R.publicLevel + '.');
    if (PUBLIC_CHANNELS.includes(ch) && !open) return s.err('chatGate', gateMsg('Public channels'));
    const base = { t: 'chat', ch, from: s.charId, name: me.name, text };
    let to = [], toKey = null;
    switch (ch) {
      case 'party': {
        const p = parties.of(s.charId);
        if (!p) return s.err('party', 'You are not in a party.');
        to = p.members; toKey = 'p' + p.id;
        break;
      }
      case 'guild': {
        const ids = guilds ? guilds.onlineMembers(s.charId) : null;
        if (!ids) return s.err('guild', 'You are not in a guild.');
        to = ids; toKey = 'g' + guilds.idOf(s.charId);
        break;
      }
      case 'zone': {
        const z = me.zone || me.province;
        for (const pr of presence.values()) if (pr.online && (pr.zone || pr.province) === z && pr.province === me.province) to.push(pr.char);
        base.zone = z; toKey = z;
        break;
      }
      case 'trade': case 'world': {
        const k = ch + ':' + s.charId, gap = ch === 'world' ? R.worldSlowMs : R.tradeSlowMs;
        if (slow.has(k) && slow.get(k) > wallNow() - gap) return s.err('slow');
        slow.set(k, wallNow());
        for (const pr of presence.values()) if (pr.online) to.push(pr.char);
        break;
      }
      case 'w': {
        const t = findOnline(m.to);
        if (!t || t.char === s.charId) return s.err('notFound');
        if (!open && !close(s.charId, t.char)) return s.err('chatGate', gateMsg('Whispers to strangers') + ' You can always whisper your party, guild and friends.');
        if (ignores(t, s.charId)) return s.err('ignored');
        whispered.set(t.char + ':' + s.charId, wallNow());
        sendTo(t.char, JSON.stringify(base));
        s.sendJSON({ ...base, to: t.name, echo: true });
        logLine({ ch, from: s.charId, name: me.name, to: t.char, text });
        return;
      }
      default: return 'channel';
    }
    const d = JSON.stringify(base);
    for (const c of to) if (!ignores(presence.get(c), s.charId)) sendTo(c, d);
    logLine({ ch, from: s.charId, name: me.name, to: toKey, text });
  }

  /** report {name, why, text?}: filed with the reported player's recent lines; enough reports in a short while = a short auto-mute. */
  async function report(s, m) {
    const me = s.charId && presence.get(s.charId);
    if (!me) return s.err('state', 'Enter the world first.');
    const about = findOnline(m.name) || await store.charByName(String(m.name || ''));
    if (!about) return s.err('notFound');
    const aboutId = about.char ?? about.id;
    if (aboutId === s.charId) return s.err('state', 'You cannot report yourself.');
    const why = String(m.why || 'other').replace(/[^a-z]/g, '').slice(0, 16) || 'other';
    const id = await store.addReport({ fromChar: s.charId, fromName: me.name, aboutChar: aboutId, aboutName: about.name, reason: why, text: clean(m.text || ''), chat: linesOf(aboutId, 20) });
    counters.reports = (counters.reports || 0) + 1;
    log('report', { id, about: aboutId, why });
    s.sendJSON({ t: 'reportR', ok: true, msg: 'Thank you. The report has been filed.' });
    if (R.autoMute && s.claimed) {
      const t = wallNow();
      const l = (reportsAbout.get(aboutId) || []).filter(x => x.at > t - R.autoMute.windowMs && x.account !== s.account);
      l.push({ account: s.account, at: t });
      reportsAbout.set(aboutId, l);
      if (new Set(l.map(x => x.account)).size >= R.autoMute.reports) { mute(aboutId, t + R.autoMute.muteMs, 'auto'); reportsAbout.delete(aboutId); log('auto-mute', { char: aboutId }); }
    }
  }

  function linesOf(charId, n = 20) { const out = []; for (let i = ring.length - 1; i >= 0 && out.length < n; i--) if (ring[i].from === charId) out.push(ring[i]); return out.reverse(); }
  function recent(sinceMs = 0) { return ring.filter(r => r.at >= sinceMs); }

  function step() {
    const t = wallNow();
    if (t - lastFlush >= R.flushMs && pendingLog.length) {
      lastFlush = t;
      const rows = pendingLog; pendingLog = [];
      if (store.logChat) store.logChat(rows).catch(err => { log('chat log failed', err && err.message); });
    }
    if (t - lastPrune >= 3600000) {
      lastPrune = t;
      if (store.pruneChat) store.pruneChat(t - R.keepDays * 86400000).catch(() => {});
      for (const [k, v] of slow) if (v < t - 60000) slow.delete(k);
      for (const [k, v] of whispered) if (v < t - R.replyMs) whispered.delete(k);
    }
  }

  return { chat, report, logLine, recent, linesOf, step, flush: () => { lastFlush = 0; step(); }, R, CODES };
}
