// Client connection (stream A) — the whole login + game connection for the browser client (stream D)
// and the bots (stream G). docs/protocol.md §9 is the manual.
//
//   const net = connect({ mode: 'ws'|'worker'|'loopback', url?, server?, tokenStore, build, clock?, guestName? })
//   net.on(event, fn) -> unsubscribe     events: status chars joined snap info ev you chat castR kick err pong
//   await net.ready                      authed (guest made if there was no token / it was refused)
//   await net.createChar({ name, cls, look }) -> { id, name, cls, level, room }
//   await net.play(charId) -> joined payload  (and 'joined' fires again after every reconnect)
//   net.input({ s, dt, mx, mz, yaw, b }) ; net.cast({ slot, aim, target, ct }) ; net.target(id)
//   net.say(text) ; net.respawn() ; net.leave() ; net.close()
//   net.clock.serverNow() ; net.clock.rtt ; net.status ; net.joined ; net.you (local id)

import { PROTOCOL_VERSION } from './protocol.js';
import { decodeSnap } from './snapshot.js';
import { socketFactory, OPEN } from './sockets.js';
import { realClock } from './clock.js';

const BACKOFF = [500, 1000, 2000, 4000, 5000];
const NO_RETRY = new Set(['version', 'build', 'elsewhere', 'banned', 'abuse']);

export function connect(opts = {}) {
  const { mode = 'ws', build = 'dev', clock = realClock, guestName = null } = opts;
  const tokenStore = opts.tokenStore || memoryTokenStore();
  const open = opts.socketFactory || socketFactory(mode, opts);
  const handlers = new Map();
  const emit = (ev, a) => { const l = handlers.get(ev); if (l) for (const f of [...l]) { try { f(a); } catch (err) { console.error('[net] handler for', ev, err); } } };

  let gw = null, game = null, closed = false, attempt = 0, retryTimer = 0, pingTimer = 0;
  let wantChar = null, q = 0.125;
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
        const tok = tokenStore.get();
        if (tok) sendJ(s, { t: 'auth', token: tok });
        else sendJ(s, guestName ? { t: 'guest', name: guestName } : { t: 'guest' });
        return;
      }
      case 'refuse': net.lastKick = m; emit('kick', m); setStatus('refused'); stop(); return;
      case 'authed':
        if (m.token) tokenStore.set(m.token);
        net.account = m.account; attempt = 0;
        sendJ(s, { t: 'chars' });
        return;
      case 'charList':
        net.chars = m.chars; emit('chars', m.chars);
        readyResolve(net);
        if (wantChar != null) sendJ(s, { t: 'play', char: wantChar });
        else setStatus('select');
        return;
      case 'created':
        net.chars = [...net.chars, m.char]; emit('chars', net.chars);
        if (createWaiter) { createWaiter.resolve(m.char); createWaiter = null; }
        return;
      case 'ticket': openGame(m.path, m.ticket); return;
      case 'err':
        if (m.code === 'auth') { tokenStore.set(null); sendJ(s, guestName ? { t: 'guest', name: guestName } : { t: 'guest' }); return; }
        emit('err', m);
        if (createWaiter) { createWaiter.reject(Object.assign(new Error(m.msg), { code: m.code })); createWaiter = null; }
        else if (playWaiter && m.code === 'state') { playWaiter.reject(Object.assign(new Error(m.msg), { code: m.code })); playWaiter = null; }
        return;
      case 'kick': net.lastKick = m; emit('kick', m); if (NO_RETRY.has(m.code)) { setStatus('kicked'); stop(); } return;
      case 'pong': onPong(m); return;
    }
  }

  // ---- game socket ----
  function openGame(path, ticket) {
    if (closed) return;
    if (game) { const g = game; game = null; g.close(); }
    setStatus('entering');
    const s = game = open(path);
    s.onopen = () => sendJ(s, { t: 'hello', v: PROTOCOL_VERSION, build });
    s.onmessage = ev => {
      if (typeof ev.data === 'string') onGame(s, JSON.parse(ev.data), ticket);
      else if (net.joined) {
        let snap;
        try { snap = decodeSnap(ev.data, q); snap.bytes = ev.data.byteLength; } catch (err) { console.error('[net] bad snapshot', err); return; }
        emit('snap', snap);
      }
    };
    s.onclose = () => { if (game === s) lost('game'); };
  }
  function onGame(s, m, ticket) {
    switch (m.t) {
      case 'welcome': sendJ(s, { t: 'enter', ticket }); return;
      case 'joined':
        q = m.room.q; net.joined = m; net.you = m.you.id; attempt = 0;
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
      case 'pong': onPong(m); return;
      case 'err': emit('err', m); if (m.code === 'state' && playWaiter) { playWaiter.reject(Object.assign(new Error(m.msg), { code: m.code })); playWaiter = null; } return;
      case 'refuse': net.lastKick = m; emit('kick', m); setStatus('refused'); stop(); return;
      case 'kick': net.lastKick = m; emit('kick', m); if (NO_RETRY.has(m.code)) { setStatus('kicked'); stop(); } return;
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
  net.play = function (charId) {
    wantChar = charId;
    return new Promise((resolve, reject) => {
      playWaiter = { resolve, reject };
      if (net.status === 'select' || net.status === 'online') sendJ(gw, { t: 'play', char: charId });
    });
  };
  net.input = m => sendJ(game, { t: 'in', s: m.s, dt: m.dt, mx: m.mx, mz: m.mz, yaw: m.yaw, b: m.b | 0 });
  net.cast = ({ slot = 0, aim, target, ct } = {}) => {
    const o = { t: 'cast', slot };
    if (aim) o.aim = { x: aim.x, z: aim.z };
    if (target) o.target = target;
    o.ct = ct ?? net.clock.serverNow();
    sendJ(game, o);
  };
  net.target = id => sendJ(game, id ? { t: 'target', id } : { t: 'target' });
  net.say = text => sendJ(game, { t: 'say', text: String(text).slice(0, 200) });
  net.respawn = () => sendJ(game, { t: 'respawn' });
  net.leave = () => { sendJ(game, { t: 'leave' }); sendJ(gw, { t: 'leave' }); stop(); setStatus('left'); };
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
