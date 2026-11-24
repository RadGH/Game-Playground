// The browser's line to the world server. Says hello with the tab token (a reload gets the same hero back), the device
// id (this browser's characters) and, when signed in, a one-time games.radgh.com ticket (the account's characters).
// Reconnects by itself after a drop and walks back into the world it was in.
//
//   const net = createNet(); await net.connect(); net.on('s', fn); net.send({ t: 'chars' }); net.act('talk', { npc })
//   net.request('chars', 'chars')  → a promise of the next 'chars' reply (or the error that came instead)
import { PROTOCOL } from '../net/protocol.js';

const TOKEN_KEY = 'oathwild.token', DEVICE_KEY = 'oathwild.device';
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } },
};

/** ws://<this host>:8661 on the LAN dev page (8401/8441), 8660 for stable (8400/8442); wss on games.radgh.com. */
export function serverUrl(loc = location) {
  const q = new URLSearchParams(loc.search).get('server'); if (q) return q;
  if (/(^|\.)games\.radgh\.com$/.test(loc.hostname)) return `wss://${loc.host}/ws/oathwild`;
  const secure = loc.protocol === 'https:', stable = ['8400', '8442'].includes(loc.port);
  return `${secure ? 'wss' : 'ws'}://${loc.hostname}:${secure ? (stable ? 8662 : 8663) : (stable ? 8660 : 8661)}/ws`;
}

function deviceId() {
  let d = store.get(DEVICE_KEY);
  if (!d || !/^[A-Za-z0-9_-]{8,64}$/.test(d)) {
    const a = new Uint8Array(16); crypto.getRandomValues(a);
    d = 'd' + [...a].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 30);
    store.set(DEVICE_KEY, d);
  }
  return d;
}

export function createNet({ url = serverUrl(), getTicket = async () => null } = {}) {
  const handlers = new Map();
  const queue = [];
  let ws = null, state = 'closed', wanted = false, tries = 0, connecting = null, pingAt = 0, timer = 0;
  const net = {
    url, build: null, profile: null, rtt: null, back: null, drops: 0, bytesIn: 0, sent: 0,
    world: null, char: null,           // where to walk back into after a drop
    get state() { return state; },
    on(type, fn) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); return () => handlers.get(type)?.delete(fn); },
    emit(type, m) { for (const fn of [...(handlers.get(type) || [])]) { try { fn(m); } catch (e) { console.error('[net]', type, e); } } },
    /** Sent at once when the server has said welcome; otherwise kept (not inputs) and sent right after it does. */
    send(m) {
      if (ws?.readyState === 1 && state === 'open') { ws.send(JSON.stringify(m)); net.sent++; return true; }
      if (m.t !== 'in' && m.t !== 'ping' && wanted) { queue.push(m); if (queue.length > 20) queue.shift(); return true; }
      return false;
    },
    act(a, fields = {}) { return net.send({ t: 'act', a, ...fields }); },
    /** Send `m` and wait for the next message of type `reply` (or an 'err'). */
    request(m, reply, ms = 8000) {
      return new Promise((res, rej) => {
        const off1 = net.on(reply, x => { done(); res(x); });
        const off2 = net.on('err', x => { if (x.quiet) return; done(); rej(Object.assign(new Error(x.msg || 'Refused'), { code: x.code })); });
        const t = setTimeout(() => { done(); rej(new Error('The world server did not answer.')); }, ms);
        function done() { off1(); off2(); clearTimeout(t); }
        if (!net.send(m)) { done(); rej(new Error('Not connected to the world server.')); }
      });
    },
    connect() {
      wanted = true;
      if (state === 'open') return Promise.resolve();
      if (connecting) return connecting;
      connecting = new Promise((res, rej) => {
        let sock; try { sock = new WebSocket(url); } catch (e) { connecting = null; rej(e); return; }
        ws = sock; state = 'connecting'; net.emit('state', { state });
        const fail = setTimeout(() => { if (state !== 'open') { try { sock.close(); } catch { /* gone */ } } }, 10000);
        sock.onopen = async () => {
          let ticket = null; try { ticket = await getTicket(); } catch { ticket = null; }
          sock.send(JSON.stringify({ t: 'hello', v: PROTOCOL, device: deviceId(), ...(store.get(TOKEN_KEY) ? { token: store.get(TOKEN_KEY) } : {}), ...(ticket ? { ticket } : {}) }));
        };
        sock.onmessage = ev => {
          net.bytesIn += ev.data.length || 0;
          let m; try { m = JSON.parse(ev.data); } catch { return; }
          if (m.t === 'welcome') {
            clearTimeout(fail); state = 'open'; tries = 0; connecting = null;
            net.build = m.build; net.profile = m.profile; net.back = m.back;
            store.set(TOKEN_KEY, m.token);
            if (net.world && net.char) net.send({ t: 'join', code: net.world, char: net.char });   // back after a drop
            net.emit('state', { state }); net.emit('open', m); res();
            for (const q of queue.splice(0)) net.send(q);
            return;
          }
          if (m.t === 'pong') { net.rtt = Math.round(performance.now() - m.at); return; }
          if (m.t === 'err' && m.code === 'version') { net.emit('outdated', m); return; }
          net.emit(m.t, m);
          net.emit('*', m);
        };
        sock.onclose = ev => {
          clearTimeout(fail);
          const was = state;
          state = 'closed'; ws = null; net.emit('state', { state });
          if (connecting) { connecting = null; rej(new Error('Could not reach the world server.')); }
          if (was === 'open') net.drops++;
          if (wanted) { const wait = Math.min(8000, 600 * 2 ** tries++); setTimeout(() => { if (wanted && state === 'closed') net.connect().catch(() => {}); }, ev.code === 1012 ? 1500 : wait); }
        };
        sock.onerror = () => {};
      });
      return connecting;
    },
    close() { wanted = false; try { ws?.close(); } catch { /* gone */ } },
  };
  timer = setInterval(() => { if (state === 'open') { pingAt = performance.now(); net.send({ t: 'ping', at: pingAt }); } }, 3000);
  net.stop = () => clearInterval(timer);
  return net;
}
