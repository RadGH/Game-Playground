// The browser's end of an online room: one WebSocket to the Wyrmroad room server, hello with this browser's token (kept
// in localStorage, so a refreshed page or a phone that slept gets its seat back), handlers by message type, a ping for
// the connection dot, and reconnecting by itself (rejoining the room it was in) when the line drops.
// Copied from Overdrive Frame's js/net/client.js (round 4).
import { PROTOCOL } from './protocol.js';

const TOKEN_KEY = 'wyrmroad.online-token';

/** Where the room server is: ?server=… wins; the live site goes through its own address; on the LAN the page
 *  servers' ports pair with the room servers' (8400 → 8640, 8442 → wss 8642 stable; 8401 → 8641, 8441 → wss 8643 dev). */
export function serverUrl(loc = location) {
  const q = new URLSearchParams(loc.search).get('server'); if (q) return q;
  if (/(^|\.)games\.radgh\.com$/.test(loc.hostname)) return `wss://${loc.host}/ws/wyrmroad`;
  const secure = loc.protocol === 'https:', stable = ['8400', '8442'].includes(loc.port);
  return `${secure ? 'wss' : 'ws'}://${loc.hostname}:${secure ? (stable ? 8642 : 8643) : (stable ? 8640 : 8641)}/ws`;
}

export class Net {
  constructor(url = serverUrl(), { WebSocketImpl = globalThis.WebSocket, storage = globalThis.localStorage, now = () => performance.now() } = {}) {
    this.url = url; this.WS = WebSocketImpl; this.storage = storage; this.now = now;
    this.ws = null; this.handlers = new Map(); this.state = 'closed'; this.rtt = null; this.code = null;
    this.wanted = false; this.tries = 0; this.build = null; this.drops = 0;
    try { this.token = storage?.getItem(TOKEN_KEY) || null; } catch { this.token = null; }
  }
  /** on('room', fn) → a function that removes the handler. '*' gets every message; 'open'/'close' the line itself. */
  on(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, new Set()); this.handlers.get(type).add(fn); return () => this.handlers.get(type)?.delete(fn); }
  _emit(type, m) { for (const fn of [...(this.handlers.get(type) || [])]) try { fn(m); } catch (e) { console.error('[online]', type, e); } }
  /** Connect (resolves once the server said welcome; rejects if it can't be reached). */
  connect() {
    this.wanted = true;
    if (this.state === 'open') return Promise.resolve();
    if (this._connecting) return this._connecting;
    this._connecting = new Promise((res, rej) => {
      let ws; try { ws = new this.WS(this.url); } catch (e) { this._connecting = null; rej(e); return; }
      this.ws = ws; this.state = 'connecting'; this._emit('state', { state: this.state });
      const fail = setTimeout(() => { if (this.state !== 'open') { try { ws.close(); } catch { /* gone */ } } }, 12000);
      ws.onopen = () => this.sendRaw({ t: 'hello', v: PROTOCOL, ...(this.token ? { token: this.token } : {}) });
      ws.onmessage = ev => {
        let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch { return; }
        if (m.t === 'welcome') {
          clearTimeout(fail); this.state = 'open'; this.tries = 0; this.build = m.build; this._connecting = null;
          if (m.token !== this.token) { this.token = m.token; try { this.storage?.setItem(TOKEN_KEY, m.token); } catch { /* private mode */ } }
          if (this.code) this.sendRaw({ t: 'join', code: this.code });          // back after a drop: the same seat
          this._emit('open', m); this._emit('state', { state: this.state }); res();
        }
        if (m.t === 'pong') this.rtt = Math.round(this.now() - m.at);
        if (m.t === 'room') this.code = m.code;
        if (m.t === 'left' || m.t === 'kicked' || m.t === 'closed') this.code = null;
        this._emit(m.t, m); this._emit('*', m);
      };
      ws.onclose = () => {
        clearTimeout(fail);
        const was = this.state; this.state = 'closed'; this._connecting = null;
        if (was === 'open') this.drops++;
        this._emit('close', { was }); this._emit('state', { state: this.state });
        if (was !== 'open') rej(new Error('closed'));
        if (this.wanted && this.code) {                                        // drop: try again (1, 2, 4… s, up to 10 s)
          const wait = Math.min(10000, 1000 * 2 ** this.tries++);
          setTimeout(() => { if (this.wanted && this.state === 'closed') this.connect().catch(() => {}); }, wait);
        }
      };
      ws.onerror = () => {};
    });
    return this._connecting;
  }
  sendRaw(obj) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  send(obj) { if (this.state === 'open') this.sendRaw(obj); }
  ping() { this.send({ t: 'ping', at: this.now() }); }
  /** Leave the room and hang up. */
  close() { this.wanted = false; if (this.state === 'open') this.sendRaw({ t: 'leave' }); this.code = null; try { this.ws?.close(); } catch { /* gone */ } this.state = 'closed'; this._emit('state', { state: this.state }); }
}
