// The browser's end of a co-op connection: one WebSocket to the co-op server, hello with this browser's token (kept in
// localStorage, so a refreshed page or a phone that slept gets its seat back), handlers by message type, a ping for
// the connection dot, and reconnecting by itself (rejoining the room it was in) when the line drops.
import { PROTOCOL } from './protocol.js';

const TOKEN_KEY = 'overdrive-frame.coop-token';

/** Where the co-op server is: ?server=… wins; the live site goes through its own address; on the LAN the page
 *  servers' ports pair with the co-op servers' (8400/8442 stable → 8620/8622, 8401/8441 dev → 8621/8623). */
export function serverUrl(loc = location) {
  const q = new URLSearchParams(loc.search).get('server'); if (q) return q;
  if (/(^|\.)games\.radgh\.com$/.test(loc.hostname)) return `wss://${loc.host}/ws/overdrive-frame`;
  const secure = loc.protocol === 'https:', stable = ['8400', '8442'].includes(loc.port);
  return `${secure ? 'wss' : 'ws'}://${loc.hostname}:${secure ? (stable ? 8622 : 8623) : (stable ? 8620 : 8621)}/ws`;
}

export class Net {
  constructor(url = serverUrl()) {
    this.url = url; this.ws = null; this.handlers = new Map(); this.state = 'closed'; this.rtt = null; this.code = null;
    this.wanted = false; this.tries = 0; this.build = null;
    try { this.token = localStorage.getItem(TOKEN_KEY) || null; } catch { this.token = null; }
  }
  /** on('room', fn) → a function that removes the handler. '*' gets every message; 'open'/'close' the line itself. */
  on(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, new Set()); this.handlers.get(type).add(fn); return () => this.handlers.get(type)?.delete(fn); }
  _emit(type, m) { for (const fn of [...(this.handlers.get(type) || [])]) try { fn(m); } catch (e) { console.error('[coop]', type, e); } }
  /** Connect (resolves once the server said welcome; rejects if it can't be reached). */
  connect() {
    this.wanted = true;
    if (this.state === 'open') return Promise.resolve();
    return new Promise((res, rej) => {
      let ws; try { ws = new WebSocket(this.url); } catch (e) { rej(e); return; }
      this.ws = ws; this.state = 'connecting';
      const fail = setTimeout(() => { if (this.state !== 'open') { try { ws.close(); } catch { /* gone */ } rej(new Error('timeout')); } }, 8000);
      ws.onopen = () => this.sendRaw({ t: 'hello', v: PROTOCOL, ...(this.token ? { token: this.token } : {}) });
      ws.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'welcome') {
          clearTimeout(fail); this.state = 'open'; this.tries = 0; this.build = m.build;
          if (m.token !== this.token) { this.token = m.token; try { localStorage.setItem(TOKEN_KEY, m.token); } catch { /* private mode */ } }
          if (this.code) this.sendRaw({ t: 'join', code: this.code });          // back after a drop: the same seat
          this._emit('open', m); res();
        }
        if (m.t === 'pong') this.rtt = Math.round(performance.now() - m.at);
        if (m.t === 'room') this.code = m.code;
        if (m.t === 'left' || m.t === 'kicked' || m.t === 'closed') this.code = null;
        this._emit(m.t, m); this._emit('*', m);
      };
      ws.onclose = () => {
        clearTimeout(fail);
        const was = this.state; this.state = 'closed'; this._emit('close', { was });
        if (was !== 'open') { rej(new Error('closed')); }
        if (this.wanted && this.code) {                                        // drop: try again (1, 2, 4… s, up to 10 s)
          const wait = Math.min(10000, 1000 * 2 ** this.tries++);
          setTimeout(() => { if (this.wanted && this.state === 'closed') this.connect().catch(() => {}); }, wait);
        }
      };
      ws.onerror = () => {};
    });
  }
  sendRaw(obj) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  send(obj) { if (this.state === 'open') this.sendRaw(obj); }
  ping() { this.send({ t: 'ping', at: performance.now() }); }
  /** Leave the room and hang up. */
  close() { this.wanted = false; if (this.state === 'open') this.sendRaw({ t: 'leave' }); this.code = null; try { this.ws?.close(); } catch { /* gone */ } this.state = 'closed'; }
}
