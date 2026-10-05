// Client connection (stream A) — the whole login + game connection for the browser client (stream D)
// and the bots (stream G). docs/protocol.md §9 is the manual.
//
//   const net = connect({ mode: 'ws'|'worker'|'loopback', url?, server?, tokenStore, build, clock?, guestName? })
//   net.on(event, fn) -> unsubscribe     events: status chars joined snap info ev you chat castR targetR used bag equip
//                                        party partyInvite partyFrames ignored kick err pong lost
//   await net.ready                      authed (guest made if there was no token / it was refused)
//   await net.createChar({ name, cls, look }) -> { id, name, cls, level, room }
//   await net.play(charId, { join }) -> joined payload  ('joined' fires again after every reconnect AND every room
//                                        change — `joined.handoff` set: same socket, new room, clear your entity mirror)
//   net.travel(to) ; net.campfire() ; net.quest(op, id, npc?) ; net.timeOfDay() ; events relocate zone travelR eventFrame zoneEvent quests questR realm groupHint
//   net.tradeOp(op, {...}) -> 'tradeAsk' / 'trade' events ; opts.human = token or async fn for Turnstile
//   net.use(id) ; net.item(op, uid, slot?) ; net.partyOp(op, {...}) ; net.partyChat(text) ; net.ignore(name, on) ; net.joinLink()
//   net.input({ s, dt, mx, mz, yaw, b }) ; net.cast({ slot, aim, target, ct }) ; net.target(id)
//   net.say(text) ; net.respawn() ; net.leave() ; net.close()
//   M3 (docs/protocol.md §16): net.accountOp(op, {...}) -> accountR ; net.login(user, pass) ; net.claim(user, pass, email?)
//     net.logout() ; net.chat(ch, text, to?) ; net.whisper(name, text) ; net.friend(op, name) ; net.guild(op, {...})
//     net.callboard(op, {...}) ; net.report(name, why, text?) ; net.mail(op, {...})
//     events accountR friends friendState guildState guildInvite guildR callboard reportR mailNew mailList mailOpen mailR
//   connect({ login: {user, pass} }) signs in with a username instead of making a guest when there is no token.
//   net.clock.serverNow() ; net.clock.rtt ; net.status ; net.joined ; net.you (local id)

import { PROTOCOL_VERSION } from './protocol.js';
import { decodeSnap } from './snapshot.js';
import { socketFactory, OPEN } from './sockets.js';
import { realClock } from './clock.js';

const BACKOFF = [500, 1000, 2000, 4000, 5000];
const NO_RETRY = new Set(['version', 'build', 'elsewhere', 'banned', 'abuse', 'loggedOut']);

export function connect(opts = {}) {
  const { mode = 'ws', build = 'dev', clock = realClock, guestName = null } = opts;
  // the "are you human" token for a new guest: a string, or async ({siteKey}) => token (the client shows Turnstile)
  const human = opts.human || null;
  const tokenStore = opts.tokenStore || memoryTokenStore();
  const open = opts.socketFactory || socketFactory(mode, opts);
  const handlers = new Map();
  const emit = (ev, a) => { const l = handlers.get(ev); if (l) for (const f of [...l]) { try { f(a); } catch (err) { console.error('[net] handler for', ev, err); } } };

  let gw = null, game = null, closed = false, attempt = 0, retryTimer = 0, pingTimer = 0;
  let wantChar = null, q = 0.125, origin = null, loginTried = false;
  let readyResolve, playWaiter = null, createWaiter = null;
  const net = {
    status: 'idle', joined: null, you: 0, account: null, chars: [], lastKick: null,
    ready: new Promise(r => { readyResolve = r; }),
    on(ev, fn) { if (!handlers.has(ev)) handlers.set(ev, new Set()); handlers.get(ev).add(fn); return () => handlers.get(ev).delete(fn); },
    clock: { offset: 0, rtt: 0, samples: [], serverNow: () => clock.now() + net.clock.offset },
  };
  const setStatus = s => { if (net.status !== s) { net.status = s; emit('status', s); } };
  const sendJ = (sock, o) => { if (sock && sock.readyState === OPEN) sock.send(JSON.stringify(o)); };

  // ---- gateway ----
  function openGateway() {
    if (closed) return;
    setStatus(attempt ? 'reconnecting' : 'connecting');
    const s = gw = open('/gw');
    s.onopen = () => sendJ(s, { t: 'hello', v: PROTOCOL_VERSION, build });
    s.onmessage = ev => { if (typeof ev.data === 'string') onGateway(s, JSON.parse(ev.data)); };
    s.onclose = () => { if (gw === s) lost('gw'); };
  }
  function onGateway(s, m) {
    switch (m.t) {
      case 'welcome': {
        net.humanCheck = m.human || null;
        net.accountsOn = !!m.accounts; net.privacy = m.privacy || null;
        if (m.clock) net.realmClock = { epoch: m.clock.epoch, dayMs: m.clock.dayMs, skew: Date.now() - m.clock.now };
        const tok = tokenStore.get();
        if (tok) sendJ(s, { t: 'auth', token: tok });
        else if (opts.login && !loginTried) { loginTried = true; sendJ(s, { t: 'account', op: 'login', user: opts.login.user, pass: opts.login.pass }); }
        else sendGuest(s);
        return;
      }
      case 'refuse': net.lastKick = m; emit('kick', m); setStatus('refused'); stop(); return;
      case 'authed':
        if (m.token) tokenStore.set(m.token);
        net.account = m.account; net.claimed = !!m.claimed; net.username = m.username || null; attempt = 0;
        sendJ(s, { t: 'chars' });
        return;
      case 'charList':
        net.chars = m.chars; emit('chars', m.chars);
        readyResolve(net);
        if (wantChar != null) sendPlay();
        else setStatus('select');
        return;
      case 'created':
        net.chars = [...net.chars, m.char]; emit('chars', net.chars);
        if (createWaiter) { createWaiter.resolve(m.char); createWaiter = null; }
        return;
      case 'ticket': openGame(m.path, m.ticket); return;
      case 'err':
        if (m.code === 'auth') { tokenStore.set(null); sendGuest(s); return; }
        emit('err', m);
        if (createWaiter) { createWaiter.reject(Object.assign(new Error(m.msg), { code: m.code })); createWaiter = null; }
        else if (playWaiter && m.code === 'state') { playWaiter.reject(Object.assign(new Error(m.msg), { code: m.code })); playWaiter = null; }
        return;
      case 'kick': net.lastKick = m; emit('kick', m); if (NO_RETRY.has(m.code)) { setStatus('kicked'); stop(); } return;
      case 'pong': onPong(m); return;
      case 'partyState': net.party = m.party; emit('party', m.party); return;
      case 'partyInvite': emit('partyInvite', m); return;
      case 'partyFrames': emit('partyFrames', m.m.map(r => ({ char: r[0], hp: r[1], hpMax: r[2], room: r[3], x: r[4], z: r[5], dead: !!r[6], online: !!r[7], id: r[8] }))); return;
      case 'chat': emit('chat', m); return;
      case 'ignored': if (net.joined) net.joined.you.ignore = m.list; emit('ignored', m.list); return;
      case 'groupHint': emit('groupHint', m); return;
      case 'realm': emit('realm', m); return;
      case 'accountR':
        if (m.ok && m.op === 'claim') { net.claimed = true; net.username = m.username; }
        if (m.op === 'login' && !m.ok && net.status !== 'select' && net.status !== 'online') { emit('accountR', m); return; }
        emit('accountR', m); return;
      default: if (typeof m.t === 'string') emit(m.t, m);      // anything newer (friends, guildState, callboard, mailNew …)
    }
  }

  async function sendGuest(s) {
    const o = { t: 'guest' };
    if (guestName) o.name = guestName;
    if (net.humanCheck && human) {
      try { o.human = typeof human === 'function' ? await human(net.humanCheck) : human; } catch (err) { emit('err', { code: 'human', msg: String(err && err.message) }); return; }
    }
    sendJ(s, o);
  }

  // ---- game socket ----
  function openGame(path, ticket) {
    if (closed) return;
    if (game) { const g = game; game = null; g.close(); }
    setStatus('entering');
    net.gamePath = path;           // which province process holds me (`/p/<n>`)
    const s = game = open(path);
    s.onopen = () => sendJ(s, { t: 'hello', v: PROTOCOL_VERSION, build });
    s.onmessage = ev => {
      if (typeof ev.data === 'string') onGame(s, JSON.parse(ev.data), ticket);
      else if (net.joined) {
        let snap;
        try { snap = decodeSnap(ev.data, q, origin); snap.bytes = ev.data.byteLength; } catch (err) { console.error('[net] bad snapshot', err); return; }
        emit('snap', snap);
      }
    };
    s.onclose = () => { if (game === s) lost('game'); };
  }
  function onGame(s, m, ticket) {
    switch (m.t) {
      case 'welcome': sendJ(s, { t: 'enter', ticket }); return;
      case 'joined':
        q = m.room.q; origin = m.room.origin || null; net.joined = m; net.you = m.you.id; attempt = 0;
        setStatus('online');
        emit('joined', m);
        if (playWaiter) { playWaiter.resolve(m); playWaiter = null; }
        startPing();
        return;
      case 'info': emit('info', m.ents); return;
      case 'ev': emit('ev', m); return;
      case 'you': { const p = { ...m }; delete p.t; if (net.joined) Object.assign(net.joined.you, p); emit('you', p); return; }
      case 'chat': emit('chat', m); return;
      case 'castR': emit('castR', m); return;
      case 'targetR': emit('targetR', m); return;
      case 'used': emit('used', m); return;
      case 'bag': {
        if (net.joined) {
          const y = net.joined.you;
          const gone = new Set(m.remove);
          y.bag = y.bag.filter(i => !gone.has(i.uid)).concat(m.add);
          y.gold = m.gold;
        }
        emit('bag', m); return;
      }
      case 'equip': if (net.joined) net.joined.you.equipment = m.equipment; emit('equip', m); return;
      case 'tradeAsk': emit('tradeAsk', m); return;
      case 'relocate': {           // moving to a province another process holds: new socket, same flow as a ticket
        const old = game; game = null;
        if (old) { old.onclose = null; old.close(); }
        setStatus('entering');
        emit('relocate', m);
        openGame(m.path, m.ticket);
        return;
      }
      case 'zone': emit('zone', m); return;
      case 'travelR': emit('travelR', m); return;
      case 'eventFrame': emit('eventFrame', m); return;
      case 'zoneEvent': emit('zoneEvent', m); return;
      case 'tradeState': net.trade = m.trade; emit('trade', m); return;
      case 'pong': onPong(m); return;
      case 'err': emit('err', m); if (m.code === 'state' && playWaiter) { playWaiter.reject(Object.assign(new Error(m.msg), { code: m.code })); playWaiter = null; } return;
      case 'refuse': net.lastKick = m; emit('kick', m); setStatus('refused'); stop(); return;
      case 'kick': net.lastKick = m; emit('kick', m); if (NO_RETRY.has(m.code)) { setStatus('kicked'); stop(); } return;
      default: if (typeof m.t === 'string') emit(m.t, m);      // anything newer: listeners get it under its own type
    }
  }

  // ---- clock ----
  function startPing() {
    if (pingTimer) return;
    const ping = () => sendJ(game && game.readyState === OPEN ? game : gw, { t: 'ping', c: clock.now() });
    ping();
    pingTimer = clock.setInterval(ping, 2000);
  }
  function onPong(m) {
    const t = clock.now(), rtt = Math.max(0, t - m.c);
    const off = m.s + rtt / 2 - t;
    const S = net.clock.samples;
    S.push({ rtt, off }); if (S.length > 8) S.shift();
    const best = S.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    net.clock.offset = best.off; net.clock.rtt = rtt;
    emit('pong', { rtt, offset: net.clock.offset, tick: m.k });
  }

  // ---- loss + retry ----
  function lost(which) {
    if (closed) return;
    const g = gw, p = game;
    gw = null; game = null;
    if (g) { g.onclose = null; g.close(); }
    if (p) { p.onclose = null; p.close(); }
    if (pingTimer) { clock.clearInterval(pingTimer); pingTimer = 0; }
    if (net.status === 'kicked' || net.status === 'refused') return;
    net.joined = null;
    setStatus('reconnecting');
    const wait = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
    attempt++;
    retryTimer = clock.setTimeout(openGateway, wait);
    emit('lost', { which, wait });
  }
  function stop() {
    closed = true;
    if (retryTimer) clock.clearTimeout(retryTimer);
    if (pingTimer) clock.clearInterval(pingTimer);
    pingTimer = 0;
    const g = gw, p = game; gw = null; game = null;
    if (g) { g.onclose = null; g.close(); }
    if (p) { p.onclose = null; p.close(); }
  }

  // ---- API ----
  net.createChar = function ({ name, cls, look }) {
    return new Promise((resolve, reject) => {
      createWaiter = { resolve, reject };
      const o = { t: 'create', name, cls }; if (look) o.look = look;
      sendJ(gw, o);
    });
  };
  let wantJoin = null;
  /** Enter the world as charId. `join` = a party code from a "join my party" link: you land next to the leader. */
  net.play = function (charId, { join = null } = {}) {
    wantChar = charId; wantJoin = join;
    return new Promise((resolve, reject) => {
      playWaiter = { resolve, reject };
      if (net.status === 'select' || net.status === 'online') sendPlay();
    });
  };
  function sendPlay() {
    const o = { t: 'play', char: wantChar };
    if (wantJoin) { o.join = wantJoin; wantJoin = null; }   // only on the first entry, not on reconnects
    sendJ(gw, o);
  }
  net.input = m => sendJ(game, { t: 'in', s: m.s, dt: m.dt, mx: m.mx, mz: m.mz, yaw: m.yaw, b: m.b | 0 });
  net.cast = ({ slot = 0, aim, target, ct, held } = {}) => {
    const o = { t: 'cast', slot };
    if (held != null) o.held = held;
    if (aim) o.aim = { x: aim.x, z: aim.z };
    if (target) o.target = target;
    o.ct = ct ?? net.clock.serverNow();
    sendJ(game, o);
  };
  net.target = id => sendJ(game, id ? { t: 'target', id } : { t: 'target' });
  net.use = id => sendJ(game, { t: 'use', id });
  net.item = (op, uid, slot) => sendJ(game, slot ? { t: 'item', op, uid, slot } : { t: 'item', op, uid });
  /** party('invite', {name}) | ('accept'|'decline', {party: id}) | ('join', {code}) | ('code') | ('leave') | ('kick'|'lead', {char}) */
  net.partyOp = (op, a = {}) => {
    const o = { t: 'party', op };
    if (a.name) o.name = a.name;
    if (a.code) o.code = a.code;
    if (a.char != null) o.char = a.char;
    if (a.party != null) o.char = a.party;      // accept/decline carry the party id in `char`
    sendJ(gw, o);
  };
  net.party = null;
  /** The "join my party" link for the current party (needs a party: partyOp('code') makes one). */
  net.joinLink = (base = globalThis.location ? location.origin + location.pathname : '') => (net.party ? `${base}?join=${net.party.code}` : null);
  net.trade = null;
  /** trade('ask', {id: entityId}) | ('accept', {id: tradeId}) | ('offer', {id, items:[uids], gold}) | ('lock'|'confirm', {id}) | ('cancel') */
  net.tradeOp = (op, a = {}) => {
    const o = { t: 'trade', op };
    if (a.id != null) o.id = a.id;
    if (a.items) o.items = a.items;
    if (a.gold != null) o.gold = a.gold;
    sendJ(game, o);
  };
  net.travel = to => sendJ(game, { t: 'travel', to: String(to) });       // a waystone key, or 'event' (free while a realm event runs)
  net.campfire = () => sendJ(game, { t: 'trace', kind: 'campfire' });
  net.quest = (op, id, npc) => sendJ(game, { t: 'quest', op, id: String(id), ...(npc ? { npc } : {}) });   // accept|turnin (npc = the giver's entity id) | abandon
  /** Realm time of day 0..1 (0 = midnight, 0.5 = noon) from the gateway's clock. */
  net.timeOfDay = () => { const c = net.realmClock; if (!c) return 0.5; const t = Date.now() - (c.skew || 0) - c.epoch; return ((t % c.dayMs) + c.dayMs) % c.dayMs / c.dayMs; };
  net.partyChat = text => sendJ(gw, { t: 'chat', ch: 'party', text: String(text).slice(0, 200) });
  net.ignore = (name, on = true) => sendJ(gw, { t: 'ignore', name, on });
  net.say = text => sendJ(game, { t: 'say', text: String(text).slice(0, 200) });
  net.respawn = () => sendJ(game, { t: 'respawn' });
  net.leave = () => { sendJ(game, { t: 'leave' }); sendJ(gw, { t: 'leave' }); stop(); setStatus('left'); };
  // ---- M3: accounts, channels, friends, guilds, the Callboard, reports, mail ----
  const pick = (o, a, keys) => { for (const k of keys) if (a[k] !== undefined && a[k] !== null) o[k] = a[k]; return o; };
  /** account('claim', {user, pass, email?, human?}) | ('login', {user, pass}) | ('logout') | ('password', {old, pass})
   *  | ('resetAsk', {user}) | ('reset', {user, code, pass}) | ('info'). Answer: 'accountR' (login answers with 'authed'). */
  net.accountOp = (op, a = {}) => sendJ(gw, pick({ t: 'account', op }, a, ['user', 'pass', 'old', 'email', 'code', 'human']));
  net.claim = (user, pass, email) => net.accountOp('claim', { user, pass, email });
  net.login = (user, pass) => net.accountOp('login', { user, pass });
  /** Revoke this browser's token and stop (claimed accounts only; the server refuses a guest). */
  net.logout = () => { sendJ(gw, { t: 'account', op: 'logout' }); tokenStore.set(null); };
  net.chat = (ch, text, to) => sendJ(gw, to ? { t: 'chat', ch, text: String(text).slice(0, 200), to } : { t: 'chat', ch, text: String(text).slice(0, 200) });
  net.whisper = (name, text) => net.chat('w', text, name);
  net.friend = (op, name) => sendJ(gw, name ? { t: 'friend', op, name } : { t: 'friend', op });
  /** guild('create', {name}) | ('invite', {name}) | ('accept'|'decline', {id}) | ('kick'|'promote'|'demote'|'lead', {char}) | ('motd', {text}) | ('leave'|'roster'|'disband') */
  net.guild = (op, a = {}) => sendJ(gw, pick({ t: 'guild', op }, a, ['name', 'char', 'id', 'text']));
  /** callboard('join', {dungeon:'<key>'|'any', role:'tank'|'healer'|'dps'}) | ('leave') | ('accept'|'decline', {id}) | ('list') */
  net.callboard = (op, a = {}) => sendJ(gw, pick({ t: 'callboard', op }, a, ['dungeon', 'role', 'id']));
  net.report = (name, why, text) => sendJ(gw, text ? { t: 'report', name, why, text } : { t: 'report', name, why });
  /** mail('list') | ('read'|'take'|'return'|'delete', {id}) | ('send', {to, subject, body, items:[uids], gold}) — province socket */
  net.mail = (op, a = {}) => sendJ(game, pick({ t: 'mail', op }, a, ['id', 'to', 'subject', 'body', 'items', 'gold']));
  net.close = () => { stop(); setStatus('closed'); };
  /** Raw access for tests (evil client): send any string/bytes on a socket. */
  net._raw = (which, data) => { const s = which === 'gw' ? gw : game; if (s && s.readyState === OPEN) s.send(data); };

  openGateway();
  return net;
}

export function memoryTokenStore(initial = null) {
  let t = initial;
  return { get: () => t, set: v => { t = v || null; } };
}

/** Browser localStorage token store (wrapped: private windows may throw). */
export function localTokenStore(key = 'thousandvale.token') {
  return {
    get() { try { return localStorage.getItem(key); } catch { return null; } },
    set(v) { try { if (v) localStorage.setItem(key, v); else localStorage.removeItem(key); } catch { /* ignore */ } },
  };
}
