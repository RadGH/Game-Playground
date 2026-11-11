// One interface for "the server": a solo Worker or a WebSocket to the room server. Both speak js/net/protocol.js.
//   const link = openSolo() | await openOnline();   link.send({ t, ... });   link.on = msg => {...};   link.close()
import { PROTOCOL } from '../net/protocol.js';

// The "same browser as before" key lives in sessionStorage: per TAB (two tabs = two players, as a friend on the same
// computer expects) but it survives a refresh or a phone waking up, which is what seat-keeping needs.
const TOKEN_KEY = 'rogueloot.token';
let memToken = '';
const getToken = () => { try { return sessionStorage.getItem(TOKEN_KEY) || memToken; } catch { return memToken; } };
const putToken = t => { memToken = t; try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* private window */ } };

function wrap(kind, post, closer) {
  const link = { kind, on: () => {}, send: m => post(JSON.stringify(m)), close: closer, ready: null };
  link.ready = new Promise((res, rej) => {
    link._got = text => {
      let m; try { m = JSON.parse(text); } catch { return; }
      if (m.t === 'welcome') { putToken(m.token); res(m); return; }
      if (m.t === 'err' && m.code === 'version') rej(new Error(m.msg));
      link.on(m);
    };
  });
  return link;
}

export function openSolo() {
  const w = new Worker(new URL('./solo-worker.js', import.meta.url), { type: 'module' });
  const link = wrap('solo', d => w.postMessage(d), () => w.terminate());
  w.onmessage = e => link._got(e.data);
  link.send({ t: 'hello', v: PROTOCOL, token: getToken() });
  return link;
}

/** Is a Rogueloot server serving this page? (Static hosts like GitHub Pages have none: solo only.) */
export function serverAvailable() {
  try { const nav = performance.getEntriesByType('navigation')[0]; return !!nav?.serverTiming?.some(s => s.name === 'rogueloot'); } catch { return false; }
}

export function openOnline() {
  const url = location.origin.replace(/^http/, 'ws') + '/ws';
  const ws = new WebSocket(url);
  const link = wrap('online', d => { if (ws.readyState === 1) ws.send(d); }, () => ws.close());
  ws.onmessage = e => link._got(e.data);
  ws.onopen = () => link.send({ t: 'hello', v: PROTOCOL, token: getToken() });
  ws.onclose = () => link.on({ t: 'closed' });
  return link;
}
