// The GATEWAY (stream A, PLAN §8.1): logins, characters, entry tickets, and the realm-wide services —
// parties, party chat, ignore lists, presence, the event director. Pure. It never carries game traffic:
// a player's game socket goes straight to the province process that holds them (`/p/<n>`).
//
//   const gw = createGateway({ store, build, classes, now, wallNow, log, verifyHuman, humanSiteKey, ... })
//   gw.attach(procId, busEnd, { provinces: [key…] })    a province process (stage 1: in the same context)
//   const h = gw.accept('/gw', conn) ; h.message(data) ; h.close()
//   gw.step()   (20 Hz: party frames, sweeps, director)  ; gw.status()
//
// BUS (gateway <-> province process), JSON messages with `k`:
//   gw -> p : ticket {ticket, char, account, claimed, near, at?, exp} | party {char, party|null} | ignore {char, list}
//             mute {char, until} | kick {char, code} | relocated {char, path, ticket} | event {op, ev}
//             claimed {account} | charge {req, char, gold, reason} | callboard {char, province, door, party, members, backfill}
//   p -> gw : hello {proc, provinces, doors} | presence {char, name, cls, level, room, province, zone, online, ignore}
//             gone {char} | frames {rows} | hint {key, chars, names} | relocate {char, province, at, via, claimed}
//             status {status} | eventState {id, state, …} | charged {req, ok} | mailed {to} | said {from, name, text, room}
//             eventReward {uid, chars}
// M3 services (js/sim/accounts.js, chat.js, friends.js, guilds.js, callboard.js) hang off this file; the admin page
// (server/admin.mjs) drives `gw.admin`.

import { PROTOCOL_VERSION, TICK_MS, CODES, cleanName, cleanCode, PARTY_OPS, CHAT_CHANNELS } from '../net/protocol.js';
import { createSessionKit } from './session.js';
import { createParties } from './party.js';
import { randomHex } from './sha256.js';
import { createDirector } from './director.js';
import { createAccounts } from './accounts.js';
import { createChat } from './chat.js';
import { createFriends } from './friends.js';
import { createGuilds } from './guilds.js';
import { createCallboard } from './callboard.js';
import { sha256Hex } from './sha256.js';
import { cleanLook } from './looks.js';
import { createFeedback } from './feedback.js';
import { createSystemMail } from './sysmail.js';

const TICKET_MS = 30000;

export function createGateway(opts) {
  const {
    store, build = 'dev', classes = null, now = () => Date.now(), wallNow = () => Date.now(), log = () => {},
    verifyHuman = null, humanSiteKey = null, guestsPerIpPerHour = 20, guestsPerHour = 0,   // 0 = no realm-wide cap
    unlimitedIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'worker'], filterText = t => t,
    starterProvince = null, events = null, clockDayMs = 2 * 3600000, directorOpts = {},
    hasher = null, chatFilter = null, ipSalt = 'thousandvale', chatOpts = {}, guildOpts = {}, callboardOpts = {},
    mailSweepMs = 60000, chargeTimeoutMs = 5000, classNames = null,
    kitsFor = null, feedbackSink = null, feedbackOpts = {},      // play-test 5: C's kitsFor(classId) (T5); the JSONL sink + limits (T19)
  } = opts;
  const nameOk = n => !chatFilter || chatFilter.name(n);
  const classSet = classes ? new Set(classes) : null;
  const counters = { msgsIn: 0, bytesIn: 0, bytesOut: 0, bad: 0, kicks: 0, logins: 0, humanFails: 0, relocations: 0, mailNotes: 0, charges: 0 };
  const kit = createSessionKit({ now, log, counters });
  const parties = createParties();
  const procs = new Map();         // proc id -> { bus, provinces: Set, status }
  const provProc = new Map();      // province key -> proc id
  const presence = new Map();      // char id -> { char, name, cls, level, room, province, proc, online, ignore }
  const gwByChar = new Map();      // char id -> gateway session
  const names = new Map();         // char id -> { name, cls, level }
  const frames = new Map();        // char id -> latest frame row
  const hints = new Map();         // key -> { chars, at }
  const waystones = new Map();     // every province's waystones, shared with every process (cross-province travel)
  const guestLog = new Map();
  let guestsAll = [];             // wall ms of every guest made in the last hour (the realm-wide cap)
  let ticks = 0, lastSweep = now();
  const started = now();
  const epoch = wallNow();         // the realm clock (day/night) starts here; clients get it in `welcome`

  // ---- province processes ----
  function attach(proc, bus, { provinces = [] } = {}) {
    const p = { id: proc, bus, provinces: new Set(provinces), status: null };
    procs.set(proc, p);
    for (const k of provinces) provProc.set(k, proc);
    bus.on(m => onBus(p, m));
    return p;
  }
  const sendTo = (proc, msg) => { const p = procs.get(proc); if (p) p.bus.send(msg); };
  const procOfChar = c => presence.get(c)?.proc;
  function procForRoom(room) {
    const prov = room && room.includes('/') ? room.split('/')[0] : null;
    if (prov && provProc.has(prov)) return provProc.get(prov);
    if (starterProvince && provProc.has(starterProvince)) return provProc.get(starterProvince);
    return procs.keys().next().value;
  }
  function onBus(p, m) {
    switch (m.k) {
      case 'hello': {
        for (const k of m.provinces || []) { p.provinces.add(k); provProc.set(k, p.id); }
        if (m.events) director.addEvents(m.events);
        if (m.doors) callboard.addDungeons(m.doors);
        if (m.waystones) { for (const w of m.waystones) waystones.set(w.key, w); const list = [...waystones.values()]; for (const q of procs.values()) q.bus.send({ k: 'waystones', list }); }
        return;
      }
      case 'presence': {
        const was = presence.get(m.char);
        presence.set(m.char, { ...m, proc: p.id, mutedUntil: Math.max(m.mutedUntil || 0, (was && was.mutedUntil) || 0) });
        names.set(m.char, { name: m.name, cls: m.cls, level: m.level });
        if (!was || was.online !== m.online || was.level !== m.level) { partyChanged([parties.of(m.char)]); guilds.changed(m.char); }
        if (!was || was.online !== m.online || was.level !== m.level || was.zone !== m.zone) friends.changed(m.char);
        if (was && was.online && !m.online) callboard.drop(m.char);
        if ((!was || was.proc !== p.id) && social.has(m.char)) p.bus.send({ k: 'social', char: m.char, ...social.get(m.char) });
        return;
      }
      case 'gone': {
        const pr = presence.get(m.char);
        if (pr && pr.proc === p.id) { presence.delete(m.char); frames.delete(m.char); partyChanged([parties.of(m.char)]); friends.changed(m.char); guilds.changed(m.char); callboard.drop(m.char); }
        return;
      }
      case 'charged': { const w = charges.get(m.req); if (w) { charges.delete(m.req); w(!!m.ok); } return; }
      case 'mailed': return mailNote(m.to);
      case 'said': return chat.logLine({ ch: 'say', from: m.from, name: m.name, to: m.room, text: m.text });
      case 'frames': for (const r of m.rows) frames.set(r[0], r); return;
      case 'hint': { hints.set(m.key, { chars: m.chars, at: now() }); for (const c of m.chars) { const g = gwByChar.get(c); if (g) g.sendJSON({ t: 'groupHint', key: m.key, with: m.chars.filter(x => x !== c).map(x => ({ char: x, name: names.get(x)?.name || '?' })) }); } return; }
      case 'relocate': return relocate(p, m);
      case 'status': p.status = m.status; return;
      case 'eventState': director.onState(m); return;
      case 'eventNear': director.near(m.id, m.levels || []); return;      // R3: someone walked up to a realm event
    }
  }
  /** A province process moves a character to a province another process holds: ticket there, tell the client. */
  function relocate(from, m) {
    const to = provProc.get(m.province);
    if (to === undefined) { sendTo(from.id, { k: 'relocated', char: m.char, error: 'no such province' }); return; }
    const ticket = randomHex(16);
    sendTo(to, { k: 'ticket', ticket, char: m.char, account: m.account, claimed: !!m.claimed, near: null, at: { province: m.province, x: m.at.x, z: m.at.z, door: m.at.door ?? null, party: m.at.party ?? null }, exp: now() + TICKET_MS });
    counters.relocations++;
    sendTo(from.id, { k: 'relocated', char: m.char, path: '/p/' + to, ticket });
  }

  // ---- sessions ----
  function accept(path, conn) {
    if (path !== '/gw') { conn.close(4404, 'no such path'); return { message() {}, close() {} }; }
    const s = kit.session('gw', conn, onClose);
    return { message(d) { if (!s.closed) kit.frame(s, d, onMessage); }, close() { s.handleClose(); } };
  }
  function onClose(s) {
    if (s.charId && gwByChar.get(s.charId) === s) { gwByChar.delete(s.charId); friends.drop(s.charId); guilds.drop(s.charId); callboard.drop(s.charId); }
  }
  const bad = kit.bad;

  function hello(s, m) {
    if (m.v !== PROTOCOL_VERSION) { s.sendJSON({ t: 'refuse', code: 'version', msg: CODES.version }); return s.closeSoon('version'); }
    if (m.build !== build) { s.sendJSON({ t: 'refuse', code: 'build', msg: CODES.build }); return s.closeSoon('build'); }
    s.state = 'busy';
    const go = () => {
      if (s.closed) return;
      s.state = 'anon';
      const w = { t: 'welcome', v: PROTOCOL_VERSION, build, server: 'thousandvale', tickMs: TICK_MS, time: ticks * TICK_MS, clock: { epoch, dayMs: clockDayMs, now: wallNow() }, privacy: 'privacy.json', accounts: !!hasher };
      if (humanSiteKey) w.human = { provider: 'turnstile', siteKey: humanSiteKey };
      s.sendJSON(w);
    };
    if (!store.ipBanned || !s.ip || s.ip === 'worker') return go();
    return store.ipBanned(ipHash(s.ip), wallNow()).then(b => {
      if (b) { s.sendJSON({ t: 'refuse', code: 'banned', msg: CODES.banned }); return s.closeSoon('banned'); }
      go();
    }, () => go());
  }

  function onMessage(s, m) {
    switch (m.t) {
      case 'hello': return s.state === 'hello' ? hello(s, m) : bad(s, 'order');
      case 'ping': return s.sendJSON({ t: 'pong', c: m.c, s: ticks * TICK_MS, k: ticks });
      case 'guest': {
        if (s.state !== 'anon') return bad(s, 'order');
        const t = wallNow(), key = s.ip || '?';
        const recent = (guestLog.get(key) || []).filter(x => x > t - 3600000);
        if (recent.length >= guestsPerIpPerHour && !unlimitedIps.includes(key)) { guestLog.set(key, recent); return s.err('tooMany'); }
        if (guestsPerHour > 0 && !unlimitedIps.includes(key)) {
          guestsAll = guestsAll.filter(x => x > t - 3600000);
          if (guestsAll.length >= guestsPerHour) return s.err('tooMany', 'Too many new accounts right now. Try again in a little while.');
        }
        s.state = 'busy';
        const check = verifyHuman ? Promise.resolve(m.human ? verifyHuman(m.human, s.ip) : false).catch(err => { log('human check failed', err && err.message); return false; }) : Promise.resolve(true);
        return check.then(ok => {
          if (!ok) { s.state = 'anon'; counters.humanFails++; return s.err('human'); }
          recent.push(t); guestLog.set(key, recent); guestsAll.push(t);
          return store.createGuest(m.name ? cleanName(m.name) : null).then(({ account, token }) => {
            s.account = account; s.state = 'authed'; counters.logins++; s.token = token; s.claimed = false;
            s.sendJSON({ t: 'authed', account, token, claimed: false });
          });
        }).catch(err => { log('guest failed', err); s.state = 'anon'; s.err('auth'); });
      }
      case 'auth':
        if (s.state !== 'anon') return bad(s, 'order');
        s.state = 'busy';
        return store.authToken(m.token).then(a => {
          if (!a) { s.state = 'anon'; return s.err('auth'); }
          if ((a.banned || 0) > wallNow()) { s.sendJSON({ t: 'refuse', code: 'banned', msg: CODES.banned }); return s.closeSoon('banned'); }
          s.account = a.account; s.state = 'authed'; counters.logins++;
          s.token = m.token; s.claimed = !!a.claimed; s.username = a.username || null; s.admin = !!a.admin;
          s.sendJSON({ t: 'authed', account: a.account, claimed: !!a.claimed, username: a.username || undefined, ...(a.admin ? { admin: true } : {}) });
        }, err => { log('auth failed', err); s.state = 'anon'; s.err('auth'); });
      case 'chars':
        if (s.state !== 'authed') return bad(s, 'order');
        // play-test 2, Q25: the class's NAME ("Ranger", not "Adventurer"); the account settings (Q15) ride along
        return store.listChars(s.account).then(chars => {
          s.sendJSON({ t: 'charList', chars: chars.map(c => ({ ...c, clsName: clsName(c.cls) })) });
          return settingsOf(s.account).then(data => s.sendJSON({ t: 'settings', data }));
        });
      case 'create': {
        if (s.state !== 'authed') return bad(s, 'order');
        const name = cleanName(m.name);
        if (!name || !nameOk(name)) return s.err('name');
        if (classSet ? !classSet.has(m.cls) : !/^[a-z][a-z0-9_]{1,31}$/.test(m.cls)) return s.err('cls');
        let look = null;
        if (m.look) { const c = cleanLook(m.look); if (!c.ok) return s.err('state', c.msg); look = c.look; }
        // T5 (play-test 5): the starting equipment picked on the new screen — an armour set id + a weapon pack id out of
        // C's kitsFor(cls). Unknown ids are refused; nothing picked = the first of each (applied on first entry).
        return Promise.resolve(kitChoice(m.cls, m.kit)).then(k => {
          if (k && k.err) { s.err('kit', k.err); return null; }
          return store.createChar(s.account, { name, cls: m.cls, look, kit: k });
        }).then(r => {
          if (!r) return;
          if (r.err) return s.err(r.err);
          s.sendJSON({ t: 'created', char: r.char });
        });
      }
      case 'play': return play(s, m);
      case 'kits': {
        if (s.state !== 'authed') return bad(s, 'order');
        return Promise.resolve(kitsOf(m.cls)).then(kits => s.sendJSON({ t: 'kitsR', cls: m.cls, kits: kits || null, ok: !!kits }));
      }
      case 'feedback': {
        if (s.state !== 'authed') return bad(s, 'order');
        const pr = s.charId != null ? presence.get(s.charId) : null;
        const who = { account: s.account, char: pr ? pr.char : null, name: pr ? pr.name : null, cls: pr ? pr.cls : null, level: pr ? pr.level : null };
        const server = { via: 'gateway', build, protocol: PROTOCOL_VERSION, claimed: !!s.claimed, username: s.username || null, ...(pr ? { room: pr.room, province: pr.province, zone: pr.zone || null, online: !!pr.online } : {}), at: new Date(wallNow()).toISOString() };
        return feedback.submit(who, m, server).then(r => s.sendJSON({ t: 'feedbackR', ...r }), err => { log('feedback failed', err && err.message); s.sendJSON({ t: 'feedbackR', ok: false, why: 'failed', msg: 'That did not go through. Please try again.' }); });
      }
      case 'admin': {
        if (s.state !== 'authed') return bad(s, 'order');
        // the flag is read from the store every time: tools/make-admin.mjs takes effect (and is taken away) without a re-login
        return Promise.resolve(store.isAdmin ? store.isAdmin(s.account) : false).then(ok => { s.admin = !!ok; return feedback.adminOp({ admin: !!ok, by: s.username || 'account ' + s.account }, m); })
          .then(r => s.sendJSON(r), err => { log('admin op failed', err && err.message); s.sendJSON({ t: 'adminR', op: m.op, ok: false, why: 'failed', msg: 'That did not work.' }); });
      }
      case 'settings': return settingsOp(s, m);
      case 'look': return lookOp(s, m);
      case 'party': return onParty(s, m);
      case 'chat': { if (!CHAT_CHANNELS.includes(m.ch)) return bad(s, 'channel'); return chat.chat(s, m); }
      case 'ignore': return onIgnore(s, m);
      case 'account': {
        if (s.busyAccount) return s.err('busy');
        return accounts.handle(s, m).then(why => { if (typeof why === 'string') bad(s, why); });
      }
      case 'friend': return friends.op(s, m).then(why => { if (typeof why === 'string') bad(s, why); });
      case 'guild': return guilds.op(s, m).then(why => { if (typeof why === 'string') bad(s, why); });
      case 'callboard': { const why = callboard.op(s, m); if (typeof why === 'string') bad(s, why); return; }
      case 'report': return chat.report(s, m).catch(err => { log('report failed', err && err.message); s.err('state', 'That did not work.'); });
      case 'leave': return s.closeSoon('leave');
      default: return bad(s, 'socket');
    }
  }

  function play(s, m) {
    if (s.state !== 'authed') return bad(s, 'order');
    return store.listChars(s.account).then(chars => {
      const c = chars.find(x => x.id === m.char);
      if (!c) return s.err('state', 'No such character.');
      if (s.charId && gwByChar.get(s.charId) === s) gwByChar.delete(s.charId);
      s.charId = c.id; gwByChar.set(c.id, s);
      names.set(c.id, { name: c.name, cls: c.cls, level: c.level });
      let near = null;
      if (m.join !== undefined) {
        const code = cleanCode(m.join);
        const r = code ? parties.join(c.id, code) : { ok: false, why: 'noCode' };
        if (!r.ok) s.err(r.why);
        else {
          partyChanged(r.changed);
          const lead = r.party.leader !== c.id ? r.party.leader : r.party.members.find(x => x !== c.id);
          if (lead && presence.get(lead)?.online) near = lead;
        }
      }
      // already in the world somewhere? go back to that process (it takes over the entity)
      const proc = presence.has(c.id) ? procOfChar(c.id) : near ? procOfChar(near) : procForRoom(c.room);
      const ticket = randomHex(16);
      sendTo(proc, { k: 'ticket', ticket, char: c.id, account: s.account, claimed: !!s.claimed, admin: !!s.admin, username: s.username || null, near, exp: now() + TICKET_MS });
      const p = parties.of(c.id);
      if (p) sendTo(proc, { k: 'party', char: c.id, party: partyBrief(p) });
      // the province process gets the ticket over the bus first; a ticket that arrives later is waited for
      s.sendJSON({ t: 'ticket', path: '/p/' + proc, ticket, room: 'zone' });
      if (p) s.sendJSON({ t: 'partyState', party: partyView(p) });
      friends.load(c.id); guilds.load(c.id);
      settingsOf(s.account).then(d => pushSocial(c.id, { tradeFriendsOnly: !!d.tradeFriendsOnly }));
      if (store.mailUnread) store.mailUnread(c.id).then(n => { if (n && gwByChar.get(c.id) === s) s.sendJSON({ t: 'mailNew', unread: n }); }, () => {});
    });
  }

  // ---- play-test 5: starter kits (T5), feedback + admins (T19/T21), system mail (T20) ----
  /** C's kitsFor(cls) -> { armour: [{id, name, blurb, items}], weapons: [...] } (sync or a promise), or null when the rules have none. */
  function kitsOf(cls) {
    if (typeof kitsFor !== 'function') return null;
    try { return Promise.resolve(kitsFor(cls)).then(k => (k && typeof k === 'object' && (Array.isArray(k.armour) || Array.isArray(k.weapons)) ? k : null), () => null); } catch { return null; }
  }
  /** Validate `create.kit` against the class's kits: -> { armour, weapons } | null (no kits on this server) | { err } */
  function kitChoice(cls, kit) {
    if (kit == null) return null;                  // nothing picked: today's default gear (bots, old clients)
    return Promise.resolve(kitsOf(cls)).then(k => {
      if (!k) {      // no kits known HERE (a gateway without the rules): keep clean ids, the province looks them up when it applies them
        const id = v => (typeof v === 'string' && /^[a-z0-9][a-z0-9_:\-]{0,47}$/i.test(v) ? v : null);
        const a = id(kit && (kit.armour ?? kit.armor)), w = id(kit && (kit.weapons ?? kit.weapon));
        return a || w ? { armour: a, weapons: w } : null;
      }
      const pickOf = (list, id, what) => {
        const l = Array.isArray(list) ? list : [];
        if (id == null) return l.length ? l[0].id : null;
        return typeof id === 'string' && l.some(x => x.id === id) ? id : { err: 'That ' + what + ' is not one your class can start with.' };
      };
      const want = kit && typeof kit === 'object' ? kit : {};
      const a = pickOf(k.armour, want.armour ?? want.armor, 'armour set'), w = pickOf(k.weapons, want.weapons ?? want.weapon, 'weapon pack');
      if (a && a.err) return a;
      if (w && w.err) return w;
      return { armour: a, weapons: w };
    });
  }
  let gwUid = 0;
  const gwNonce = randomHex(4);
  const sysmail = createSystemMail({ store, newUid: () => `gw-${gwNonce}-${(++gwUid).toString(36)}`, wallNow, notify: c => mailNote(c), log, counters });
  const feedback = createFeedback({ store, wallNow, sink: feedbackSink, sysmail, log, counters, filter: chatFilter, opts: feedbackOpts });

  // ---- play-test 2: class names (Q25), account settings (Q15), a title-screen look (Q21) ----
  function clsName(id) {
    if (classNames && classNames[id]) return classNames[id];
    return String(id || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  /** Account settings, stored per account (world_state `settings:<account>`, both stores have it). */
  const SETTING_KEYS = { tradeFriendsOnly: 'bool' };
  const SETTING_DEFAULTS = { tradeFriendsOnly: false };
  const settingsCache = new Map();
  function settingsOf(account) {
    if (settingsCache.has(account)) return Promise.resolve(settingsCache.get(account));
    const get = store.getWorld ? store.getWorld('settings:' + account) : Promise.resolve(null);
    return Promise.resolve(get).then(v => { const d = { ...SETTING_DEFAULTS, ...(v && typeof v === 'object' ? v : {}) }; settingsCache.set(account, d); return d; }, () => ({ ...SETTING_DEFAULTS }));
  }
  function settingsOp(s, m) {
    if (s.state !== 'authed') return bad(s, 'order');
    if (m.op === 'get') return settingsOf(s.account).then(data => s.sendJSON({ t: 'settings', data }));
    if (m.op !== 'set' || !m.data) return bad(s, 'op');
    return settingsOf(s.account).then(cur => {
      const next = { ...cur };
      for (const [k, v] of Object.entries(m.data)) { if (SETTING_KEYS[k] === 'bool' && typeof v === 'boolean') next[k] = v; }
      settingsCache.set(s.account, next);
      const save = store.setWorld ? store.setWorld('settings:' + s.account, next) : null;
      return Promise.resolve(save).then(() => {
        s.sendJSON({ t: 'settings', data: next });
        for (const g of gwByChar.values()) if (g.account === s.account && g.charId != null) pushSocial(g.charId, { tradeFriendsOnly: next.tradeFriendsOnly });
      });
    });
  }
  /** What a province needs to refuse a trade request (Q15): the target's friends and its account setting. */
  const social = new Map();       // char id -> { friends: [ids], tradeFriendsOnly }
  function pushSocial(c, patch) {
    const cur = { friends: [], tradeFriendsOnly: false, ...(social.get(c) || {}), ...patch };
    social.set(c, cur);
    const proc = procOfChar(c);
    if (proc !== undefined) sendTo(proc, { k: 'social', char: c, ...cur });
  }
  function lookOp(s, m) {
    if (s.state !== 'authed') return bad(s, 'order');
    const reply = x => s.sendJSON({ t: 'lookR', char: m.char, ...x });
    return store.listChars(s.account).then(chars => {
      const c = chars.find(x => x.id === m.char);
      if (!c) return reply({ ok: false, why: 'missing', msg: 'No such character.' });
      if (presence.get(c.id)?.online) return reply({ ok: false, why: 'online', msg: 'That character is in the world. Change looks at a barber there.' });
      const r = cleanLook(m.look, c.look);
      if (!r.ok) return reply({ ok: false, why: r.why, msg: r.msg });
      if (!store.setLook) return reply({ ok: false, why: 'state', msg: 'Not on this server.' });
      return store.setLook(s.account, c.id, r.look).then(w => {
        if (w.err) return reply({ ok: false, why: w.err, msg: w.err === 'lease' ? 'That character is still logged in. Try again in a few seconds.' : 'No such character.' });
        reply({ ok: true, look: r.look });
      });
    }).catch(err => { log('look failed', err && err.message); reply({ ok: false, why: 'state', msg: 'That did not work.' }); });
  }

  // ---- parties ----
  const partyBrief = p => (p ? { id: p.id, leader: p.leader, members: [...p.members], lootMin: p.lootMin || 'rare' } : null);
  function partyView(p) {
    return {
      id: p.id, leader: p.leader, code: p.code, lootMin: p.lootMin || 'rare', loot: p.lootMin || 'rare',
      members: p.members.map(c => { const pr = presence.get(c), n = names.get(c) || {}; return { char: c, name: pr ? pr.name : n.name, cls: pr ? pr.cls : n.cls, level: pr ? pr.level : n.level, online: !!(pr && pr.online), look: (pr && pr.look) || null }; }),
    };
  }
  /** Tell every member's gateway session and every province process that holds a member. */
  function partyChanged(list) {
    for (const p of list) {
      if (!p) continue;
      const view = partyView(p), brief = partyBrief(p);
      for (const c of p.members) {
        const g = gwByChar.get(c); if (g) g.sendJSON({ t: 'partyState', party: view });
        const proc = procOfChar(c); if (proc !== undefined) sendTo(proc, { k: 'party', char: c, party: brief });
      }
    }
  }
  function leftParty(c) {
    const g = gwByChar.get(c); if (g) g.sendJSON({ t: 'partyState', party: null });
    const proc = procOfChar(c); if (proc !== undefined) sendTo(proc, { k: 'party', char: c, party: null });
  }
  const findByName = name => { const n = String(name || '').toLowerCase(); for (const pr of presence.values()) if (pr.online && pr.name.toLowerCase() === n) return pr; return null; };
  function onParty(s, m) {
    if (!s.charId || !presence.get(s.charId)) return s.err('party', 'Enter the world first.');
    if (!PARTY_OPS.includes(m.op)) return bad(s, 'op');
    const me = s.charId, myName = presence.get(me).name;
    let r;
    switch (m.op) {
      case 'invite': {
        const to = findByName(m.name);
        if (!to) return s.err('notFound');
        r = parties.invite(me, to.char);
        if (r.ok) { const g = gwByChar.get(to.char); if (g) g.sendJSON({ t: 'partyInvite', from: me, name: myName, party: r.party.id }); }
        break;
      }
      case 'accept': r = parties.accept(me, m.char ?? -1); break;
      case 'decline': r = parties.decline(me, m.char ?? -1); break;
      case 'join': { const code = cleanCode(m.code); r = code ? parties.join(me, code) : { ok: false, why: 'noCode' }; break; }
      case 'code': r = parties.create(me); r.changed = [r.party]; break;
      case 'group': {          // one-click "Group up" from a groupHint (open groups, PLAN §5.3)
        const h = hints.get(m.code || '');
        if (!h || !h.chars.includes(me)) return s.err('party', 'That group has moved on.');
        const ex = h.chars.map(c => parties.of(c)).find(p => p && p.members.length < 5);
        r = ex ? parties.join(me, ex.code) : parties.create(me);
        if (r.ok && !ex) r.changed = [r.party];
        break;
      }
      case 'leave': r = parties.leave(me); if (r.ok) leftParty(me); break;
      case 'kick': r = parties.kick(me, m.char); if (r.ok) leftParty(m.char); break;
      case 'lead': r = parties.lead(me, m.char); break;
      case 'loot': r = parties.loot(me, String(m.code || m.name || '')); if (!r.ok) return s.err('party', 'Only the party leader can set the loot rule (magic, rare, legendary or unique).'); break;
    }
    if (!r || !r.ok) return s.err(r ? r.why : 'party');
    if (m.op !== 'code' && m.op !== 'invite' && m.op !== 'decline' && m.op !== 'loot') {      // a queued party that changed shape leaves the Callboard
      for (const q of r.changed || []) if (q) callboard.partyGone(q.id);
      callboard.drop(me); if (m.op === 'kick' && m.char != null) callboard.drop(m.char);
    }
    partyChanged(r.changed || []);
  }
  function sendPartyFrames() {
    for (const p of parties.byId.values()) {
      if (p.members.length < 2) continue;
      const rows = p.members.map(c => frames.get(c) || [c, 0, 0, null, 0, 0, 0, presence.get(c)?.online ? 1 : 0, 0, 0, 0]);
      if (!rows.some(r => r[7])) continue;
      const msg = JSON.stringify({ t: 'partyFrames', m: rows });
      for (const c of p.members) { const g = gwByChar.get(c); if (g && presence.get(c)) g.send(msg); }
    }
  }
  function sweepParties() {
    for (const p of [...parties.byId.values()]) {
      if (p.members.some(c => presence.has(c))) { p.lastOnline = now(); continue; }
      if (now() - (p.lastOnline || now()) > 15 * 60000) for (const c of [...p.members]) parties.leave(c);
      else p.lastOnline ||= now();
    }
    for (const [k, h] of hints) if (now() - h.at > 120000) hints.delete(k);
  }

  // ---- chat + ignore ----
  const clean = text => filterText(String(text).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 200);
  const ignores = (pr, fromId) => !!(pr && pr.ignore && pr.ignore.some(i => i.id === fromId));
  function onIgnore(s, m) {
    const me = s.charId && presence.get(s.charId);
    if (!me) return s.err('state', 'Enter the world first.');
    let list = (me.ignore || []).slice();
    const done = () => { me.ignore = list; sendTo(me.proc, { k: 'ignore', char: s.charId, list }); s.sendJSON({ t: 'ignored', list }); };
    if (!m.on) { list = list.filter(i => i.name.toLowerCase() !== m.name.toLowerCase()); return done(); }
    if (list.length >= 100) return s.err('state', 'Your ignore list is full (100).');
    const add = t => { if (!t) return s.err('notFound', 'Nobody by that name.'); const id = t.char ?? t.id; if (id !== s.charId && !list.some(i => i.id === id)) list.push({ id, name: t.name }); done(); };
    const t = findByName(m.name);
    if (t || !store.charByName) return add(t);
    return store.charByName(String(m.name)).then(add, () => s.err('notFound'));     // offline names too (M3)
  }
  /** Admin hook: mute chat until `untilMs` (wall clock). */
  function mute(charId, untilMs, by = 'admin') {
    const pr = presence.get(charId);
    if (!pr) return false;
    pr.mutedUntil = untilMs;
    sendTo(pr.proc, { k: 'mute', char: charId, until: untilMs });
    const g = gwByChar.get(charId);
    if (g) g.sendJSON({ t: 'muted', until: untilMs, by, msg: untilMs > wallNow() ? 'You are muted for ' + Math.max(1, Math.round((untilMs - wallNow()) / 60000)) + ' min.' : 'You can chat again.' });
    log('mute', { char: charId, until: untilMs, by });
    return true;
  }
  const ipHash = ip => sha256Hex(ipSalt + ':' + String(ip || ''));
  function kickChar(charId, code = 'restart') {
    const proc = procOfChar(charId);
    if (proc !== undefined) sendTo(proc, { k: 'kick', char: charId, code });
    const g = gwByChar.get(charId);
    if (g) g.kick(code);
  }
  const sendAll = msg => { for (const pid of procs.keys()) sendTo(pid, msg); };
  /** Take gold from an online character through the province that holds them (guild fee). */
  const charges = new Map();
  let chargeN = 0;
  function charge(charId, gold, reason) {
    const proc = procOfChar(charId);
    if (proc === undefined) return Promise.resolve(false);
    const req = ++chargeN;
    counters.charges++;
    return new Promise(res => {
      charges.set(req, res);
      sendTo(proc, { k: 'charge', req, char: charId, gold, reason });
      setTimeoutTicks(() => { if (charges.has(req)) { charges.delete(req); res(false); } }, Math.ceil(chargeTimeoutMs / TICK_MS));
    });
  }
  const timers = [];
  function setTimeoutTicks(fn, n) { timers.push({ at: ticks + n, fn }); }
  function mailNote(to) {
    const g = gwByChar.get(to);
    if (!g || !store.mailUnread) return;
    counters.mailNotes++;
    store.mailUnread(to).then(n => g.sendJSON({ t: 'mailNew', unread: n }), () => {});
  }

  // ---- M3 services ----
  const accounts = createAccounts({ store, hasher, verifyHuman, wallNow, log, filter: chatFilter, sendAll, kickChar, counters, trustIps: unlimitedIps });
  const friends = createFriends({ store, presence, gwByChar, log, onList: (c, ids) => pushSocial(c, { friends: ids }) });
  const guilds = createGuilds({ store, presence, gwByChar, wallNow, filter: chatFilter, charge, log, counters, opts: guildOpts });
  const chat = createChat({ store, presence, gwByChar, parties, guilds, friends, wallNow, filter: chatFilter, log, counters, mute, opts: chatOpts });
  const callboard = createCallboard({ parties, presence, gwByChar, partyChanged: list => partyChanged(list), sendTo, procOf: c => procOfChar(c), now, wallNow, log, opts: callboardOpts });
  let lastMailSweep = now();
  function sweepMail() {
    if (!store.mailExpire) return;
    store.mailExpire(wallNow()).then(list => { for (const x of list) mailNote(x.to); }, err => log('mail sweep failed', err && err.message));
  }

  // ---- the event director (js/sim/director.js) ----
  const director = createDirector({
    now, wallNow, log, events, ...directorOpts,
    online: () => [...presence.values()].filter(p => p.online),
    broadcast: msg => { const d = JSON.stringify(msg); for (const g of gwByChar.values()) g.send(d); },
    procOf: prov => provProc.get(prov),
    procList: () => [...procs.keys()],
    sendTo,
    persist: store.getWorld ? { load: () => store.getWorld('director'), save: v => store.setWorld('director', v) } : null,
  });

  function step() {
    ticks++;
    if (ticks % 10 === 0) sendPartyFrames();
    director.step();
    if (now() - lastSweep >= 30000) { lastSweep = now(); sweepParties(); }
    if (timers.length) for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= ticks) { const f = timers[i].fn; timers.splice(i, 1); f(); }
    chat.step();
    if (ticks % 20 === 3) callboard.step();
    if (now() - lastMailSweep >= mailSweepMs) { lastMailSweep = now(); sweepMail(); }
  }

  function status() {
    return {
      gateway: { uptime: Math.round((now() - started) / 1000), sessions: kit.sessions.size, presence: presence.size, parties: parties.byId.size, logins: counters.logins, relocations: counters.relocations, humanFails: counters.humanFails, bad: counters.bad, kicks: counters.kicks, chatLines: counters.chatLines || 0, reports: counters.reports || 0, guilds: guilds.size(), friendLists: friends.size() },
      callboard: callboard.status(),
      procs: [...procs.values()].map(p => ({ id: p.id, provinces: [...p.provinces], status: p.status })),
      director: director.status(),
    };
  }

  // ---- the admin page's handle (server/admin.mjs; 127.0.0.1 only) ----
  const admin = {
    online: () => [...presence.values()].map(pr => { const g = gwByChar.get(pr.char); return { char: pr.char, name: pr.name, cls: pr.cls, level: pr.level, room: pr.room, province: pr.province, zone: pr.zone || null, online: !!pr.online, account: pr.account ?? (g ? g.account : null), claimed: g ? !!g.claimed : null, mutedUntil: pr.mutedUntil || 0, party: (parties.of(pr.char) || {}).id || null, guild: guilds.idOf(pr.char) }; }),
    kick: (charId, code = 'restart') => { if (!presence.has(charId) && !gwByChar.has(charId)) return false; kickChar(charId, code); log('admin kick', { char: charId }); return true; },
    mute: (charId, untilMs) => mute(charId, untilMs, 'admin'),
    /** ban an account (by character or account id) until a wall time; ip: also ban the address that character uses (stored hashed). */
    async ban({ char = null, account = null, untilMs, reason = '', ip = false }) {
      let acct = account;
      const pr = char != null ? presence.get(char) : null;
      const g = char != null ? gwByChar.get(char) : null;
      if (acct == null && pr) acct = pr.account ?? (g && g.account);
      if (acct == null && char != null) { const rows = await store.charsByIds([char]); if (rows.length) { const c = await store.charByName(rows[0].name); acct = c && c.account; } }
      if (acct == null) return { ok: false, why: 'No such character or account.' };
      await store.banAccount(acct, untilMs, reason);
      let ipDone = false;
      if (ip && g && g.ip) { await store.banIp(ipHash(g.ip), untilMs, reason); ipDone = true; }
      for (const x of [...kit.sessions]) if (x.account === acct) { if (x.charId) kickChar(x.charId, 'banned'); x.kick('banned'); }
      log('admin ban', { account: acct, until: untilMs, ip: ipDone });
      return { ok: true, account: acct, ip: ipDone };
    },
    unban: async account => { await store.banAccount(account, 0, ''); return { ok: true }; },
    rename: async (charId, name) => {
      const n = cleanName(name);
      if (!n) return { ok: false, why: 'That name is not allowed.' };
      if (presence.get(charId)?.online) kickChar(charId, 'restart');
      const r = await store.renameChar(charId, n, wallNow());
      return r.ok ? { ok: true, name: n } : { ok: false, why: r.err === 'lease' ? 'They are still logged in; try again in a minute.' : r.err === 'name' ? 'That name is taken.' : 'No such character.' };
    },
    chat: (sinceMs = wallNow() - 3600000) => chat.recent(sinceMs),
    resets: () => accounts.resets(),
    reports: limit => store.listReports(limit),
    handleReport: id => store.handleReport(id, wallNow()),
    announce: text => { const t = String(text || '').slice(0, 300); if (!t) return false; const d = JSON.stringify({ t: 'chat', ch: 'system', from: 0, name: 'The Vale', text: t }); for (const g of gwByChar.values()) g.send(d); chat.logLine({ ch: 'system', name: 'admin', text: t }); return true; },
    forceEvent: (id, announceMs = 60000) => director.force(id || null, { announce: announceMs }),
    economy: hours => store.economyReport ? store.economyReport(wallNow() - (hours || 24) * 3600000) : Promise.resolve([]),
    // play-test 5 (T21): feedback reports for the admin page — the same calls an in-game admin makes
    feedback: (q = {}) => feedback.adminOp({ admin: true, by: 'admin page' }, { op: 'reports', ...q }),
    feedbackState: (id, state, note) => feedback.adminOp({ admin: true, by: 'admin page' }, { op: 'report', id, state, ...(note != null ? { note } : {}) }),
    admins: () => (store.listAdmins ? store.listAdmins() : Promise.resolve([])),
    /** T20: post a system letter (items, gold, a gift box) to any character — the one API every system uses. */
    mailTo: a => sysmail.mailTo(a),
  };

  return { accept, attach, step, status, parties, presence, director, mute, counters, epoch, clockDayMs, partyChanged, admin, chat, friends, guilds, callboard, accounts, ipHash, kickChar, mailTo: a => sysmail.mailTo(a), feedback, kitsOf };
}
