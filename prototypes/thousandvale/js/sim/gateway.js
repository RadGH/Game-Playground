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
//   gw -> p : ticket {ticket, char, account, near, at?, exp} | party {char, party|null} | ignore {char, list}
//             mute {char, until} | kick {char, code} | relocated {char, path, ticket} | event {op, ev}
//   p -> gw : hello {proc, provinces} | presence {char, name, cls, level, room, province, online, ignore}
//             gone {char} | frames {rows} | hint {key, chars, names} | relocate {char, province, at, via}
//             status {status} | eventState {id, state, …}

import { PROTOCOL_VERSION, TICK_MS, CODES, cleanName, cleanCode, PARTY_OPS, CHAT_CHANNELS } from '../net/protocol.js';
import { createSessionKit } from './session.js';
import { createParties } from './party.js';
import { randomHex } from './sha256.js';
import { createDirector } from './director.js';

const TICKET_MS = 30000;

export function createGateway(opts) {
  const {
    store, build = 'dev', classes = null, now = () => Date.now(), wallNow = () => Date.now(), log = () => {},
    verifyHuman = null, humanSiteKey = null, guestsPerIpPerHour = 20,
    unlimitedIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'worker'], filterText = t => t,
    starterProvince = null, events = null, clockDayMs = 2 * 3600000, directorOpts = {},
  } = opts;
  const classSet = classes ? new Set(classes) : null;
  const counters = { msgsIn: 0, bytesIn: 0, bytesOut: 0, bad: 0, kicks: 0, logins: 0, humanFails: 0, relocations: 0 };
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
        if (m.waystones) { for (const w of m.waystones) waystones.set(w.key, w); const list = [...waystones.values()]; for (const q of procs.values()) q.bus.send({ k: 'waystones', list }); }
        return;
      }
      case 'presence': {
        const was = presence.get(m.char);
        presence.set(m.char, { ...m, proc: p.id });
        names.set(m.char, { name: m.name, cls: m.cls, level: m.level });
        if (!was || was.online !== m.online || was.level !== m.level) partyChanged([parties.of(m.char)]);
        return;
      }
      case 'gone': {
        const pr = presence.get(m.char);
        if (pr && pr.proc === p.id) { presence.delete(m.char); frames.delete(m.char); partyChanged([parties.of(m.char)]); }
        return;
      }
      case 'frames': for (const r of m.rows) frames.set(r[0], r); return;
      case 'hint': { hints.set(m.key, { chars: m.chars, at: now() }); for (const c of m.chars) { const g = gwByChar.get(c); if (g) g.sendJSON({ t: 'groupHint', key: m.key, with: m.chars.filter(x => x !== c).map(x => ({ char: x, name: names.get(x)?.name || '?' })) }); } return; }
      case 'relocate': return relocate(p, m);
      case 'status': p.status = m.status; return;
      case 'eventState': director.onState(m); return;
    }
  }
  /** A province process moves a character to a province another process holds: ticket there, tell the client. */
  function relocate(from, m) {
    const to = provProc.get(m.province);
    if (to === undefined) { sendTo(from.id, { k: 'relocated', char: m.char, error: 'no such province' }); return; }
    const ticket = randomHex(16);
    sendTo(to, { k: 'ticket', ticket, char: m.char, account: m.account, near: null, at: { province: m.province, x: m.at.x, z: m.at.z }, exp: now() + TICKET_MS });
    counters.relocations++;
    sendTo(from.id, { k: 'relocated', char: m.char, path: '/p/' + to, ticket });
  }

  // ---- sessions ----
  function accept(path, conn) {
    if (path !== '/gw') { conn.close(4404, 'no such path'); return { message() {}, close() {} }; }
    const s = kit.session('gw', conn, onClose);
    return { message(d) { if (!s.closed) kit.frame(s, d, onMessage); }, close() { s.handleClose(); } };
  }
  function onClose(s) { if (s.charId && gwByChar.get(s.charId) === s) gwByChar.delete(s.charId); }
  const bad = kit.bad;

  function hello(s, m) {
    if (m.v !== PROTOCOL_VERSION) { s.sendJSON({ t: 'refuse', code: 'version', msg: CODES.version }); return s.closeSoon('version'); }
    if (m.build !== build) { s.sendJSON({ t: 'refuse', code: 'build', msg: CODES.build }); return s.closeSoon('build'); }
    s.state = 'anon';
    const w = { t: 'welcome', v: PROTOCOL_VERSION, build, server: 'thousandvale', tickMs: TICK_MS, time: ticks * TICK_MS, clock: { epoch, dayMs: clockDayMs, now: wallNow() } };
    if (humanSiteKey) w.human = { provider: 'turnstile', siteKey: humanSiteKey };
    s.sendJSON(w);
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
        s.state = 'busy';
        const check = verifyHuman ? Promise.resolve(m.human ? verifyHuman(m.human, s.ip) : false).catch(err => { log('human check failed', err && err.message); return false; }) : Promise.resolve(true);
        return check.then(ok => {
          if (!ok) { s.state = 'anon'; counters.humanFails++; return s.err('human'); }
          recent.push(t); guestLog.set(key, recent);
          return store.createGuest(m.name ? cleanName(m.name) : null).then(({ account, token }) => {
            s.account = account; s.state = 'authed'; counters.logins++;
            s.sendJSON({ t: 'authed', account, token, claimed: false });
          });
        }).catch(err => { log('guest failed', err); s.state = 'anon'; s.err('auth'); });
      }
      case 'auth':
        if (s.state !== 'anon') return bad(s, 'order');
        s.state = 'busy';
        return store.authToken(m.token).then(a => {
          if (!a) { s.state = 'anon'; return s.err('auth'); }
          s.account = a.account; s.state = 'authed'; counters.logins++;
          s.sendJSON({ t: 'authed', account: a.account, claimed: a.claimed });
        }, err => { log('auth failed', err); s.state = 'anon'; s.err('auth'); });
      case 'chars':
        if (s.state !== 'authed') return bad(s, 'order');
        return store.listChars(s.account).then(chars => s.sendJSON({ t: 'charList', chars }));
      case 'create': {
        if (s.state !== 'authed') return bad(s, 'order');
        const name = cleanName(m.name);
        if (!name) return s.err('name');
        if (classSet ? !classSet.has(m.cls) : !/^[a-z][a-z0-9_]{1,31}$/.test(m.cls)) return s.err('cls');
        let look = null;
        if (m.look) { const j = JSON.stringify(m.look); if (j.length > 4096) return s.err('state', 'Look too big.'); look = JSON.parse(j); }
        return store.createChar(s.account, { name, cls: m.cls, look }).then(r => {
          if (r.err) return s.err(r.err);
          s.sendJSON({ t: 'created', char: r.char });
        });
      }
      case 'play': return play(s, m);
      case 'party': return onParty(s, m);
      case 'chat': return onChat(s, m);
      case 'ignore': return onIgnore(s, m);
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
      sendTo(proc, { k: 'ticket', ticket, char: c.id, account: s.account, near, exp: now() + TICKET_MS });
      const p = parties.of(c.id);
      if (p) sendTo(proc, { k: 'party', char: c.id, party: partyBrief(p) });
      // the province process gets the ticket over the bus first; a ticket that arrives later is waited for
      s.sendJSON({ t: 'ticket', path: '/p/' + proc, ticket, room: 'zone' });
      if (p) s.sendJSON({ t: 'partyState', party: partyView(p) });
    });
  }

  // ---- parties ----
  const partyBrief = p => (p ? { id: p.id, leader: p.leader, members: [...p.members] } : null);
  function partyView(p) {
    return {
      id: p.id, leader: p.leader, code: p.code,
      members: p.members.map(c => { const pr = presence.get(c), n = names.get(c) || {}; return { char: c, name: pr ? pr.name : n.name, cls: pr ? pr.cls : n.cls, level: pr ? pr.level : n.level, online: !!(pr && pr.online) }; }),
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
    }
    if (!r || !r.ok) return s.err(r ? r.why : 'party');
    partyChanged(r.changed || []);
  }
  function sendPartyFrames() {
    for (const p of parties.byId.values()) {
      if (p.members.length < 2) continue;
      const rows = p.members.map(c => frames.get(c) || [c, 0, 0, null, 0, 0, 0, presence.get(c)?.online ? 1 : 0, 0]);
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
  function onChat(s, m) {
    const me = s.charId && presence.get(s.charId);
    if (!me) return s.err('state', 'Enter the world first.');
    if (!CHAT_CHANNELS.includes(m.ch)) return bad(s, 'channel');
    if ((me.mutedUntil || 0) > wallNow()) return s.err('muted');
    const text = clean(m.text);
    if (!text) return;
    const p = parties.of(s.charId);
    if (!p) return s.err('party', 'You are not in a party.');
    const msg = JSON.stringify({ t: 'chat', ch: 'party', from: s.charId, name: me.name, text });
    for (const c of p.members) {
      if (ignores(presence.get(c), s.charId)) continue;
      const g = gwByChar.get(c); if (g) g.send(msg);
    }
  }
  function onIgnore(s, m) {
    const me = s.charId && presence.get(s.charId);
    if (!me) return s.err('state', 'Enter the world first.');
    let list = (me.ignore || []).slice();
    if (m.on) {
      const t = findByName(m.name);
      if (!t) return s.err('notFound');
      if (t.char !== s.charId && !list.some(i => i.id === t.char)) list.push({ id: t.char, name: t.name });
    } else list = list.filter(i => i.name.toLowerCase() !== m.name.toLowerCase());
    me.ignore = list;
    sendTo(me.proc, { k: 'ignore', char: s.charId, list });
    s.sendJSON({ t: 'ignored', list });
  }
  /** Admin hook: mute chat until `untilMs` (wall clock). */
  function mute(charId, untilMs) {
    const pr = presence.get(charId);
    if (!pr) return false;
    pr.mutedUntil = untilMs;
    sendTo(pr.proc, { k: 'mute', char: charId, until: untilMs });
    return true;
  }

  // ---- the event director (js/sim/director.js) ----
  const director = createDirector({
    now, wallNow, log, events, ...directorOpts,
    online: () => [...presence.values()].filter(p => p.online),
    broadcast: msg => { const d = JSON.stringify(msg); for (const g of gwByChar.values()) g.send(d); },
    procOf: prov => provProc.get(prov),
    procList: () => [...procs.keys()],
    sendTo,
  });

  function step() {
    ticks++;
    if (ticks % 10 === 0) sendPartyFrames();
    director.step();
    if (now() - lastSweep >= 30000) { lastSweep = now(); sweepParties(); }
  }

  function status() {
    return {
      gateway: { uptime: Math.round((now() - started) / 1000), sessions: kit.sessions.size, presence: presence.size, parties: parties.byId.size, logins: counters.logins, relocations: counters.relocations, humanFails: counters.humanFails, bad: counters.bad, kicks: counters.kicks },
      procs: [...procs.values()].map(p => ({ id: p.id, provinces: [...p.provinces], status: p.status })),
      director: director.status(),
    };
  }

  return { accept, attach, step, status, parties, presence, director, mute, counters, epoch, clockDayMs, partyChanged };
}
