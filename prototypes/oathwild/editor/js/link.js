// The editor's line to the DEV world server's map-editor channel (/ws/edit, server/editor.js). Reconnects by itself.
//   const link = createLink({ who: 'owner', on: msg => … })
//   await link.op({ op: 'tree.add', … })  → { ok, id, at } or throws Error(why)        link.undo() / link.redo()
//   link.marker(at, what)   link.probe(at)   link.state   'connecting' | 'open' | 'closed'
const NAME = 'oathwild.editor.who';

/** ws(s)://<host>:8661|8663/ws/edit beside the dev page; ?server=ws://… overrides (tests). */
export function editUrl(loc = location) {
  const q = new URLSearchParams(loc.search).get('server');
  if (q) return q.replace(/\/ws(\/oathwild)?$/, '') + '/ws/edit';
  if (/(^|\.)games\.radgh\.com$/.test(loc.hostname)) return `wss://${loc.host}/ws/oathwild/edit`;   // (refused there: dev only)
  const secure = loc.protocol === 'https:', stable = ['8400', '8442'].includes(loc.port);
  return `${secure ? 'wss' : 'ws'}://${loc.hostname}:${secure ? (stable ? 8662 : 8663) : (stable ? 8660 : 8661)}/ws/edit`;
}

export function createLink({ who = null, on = () => {}, onState = () => {} } = {}) {
  let ws = null, rid = 0, tries = 0, wanted = true;
  const waits = new Map();
  const link = {
    state: 'connecting', url: editUrl(),
    who: who || (() => { try { return localStorage.getItem(NAME) || 'owner'; } catch { return 'owner'; } })(),
    send(m) { if (ws?.readyState === 1) { ws.send(JSON.stringify(m)); return true; } return false; },
    ask(m, ms = 30000) {
      return new Promise((res, rej) => {
        const id = ++rid;
        const t = setTimeout(() => { waits.delete(id); rej(new Error('The world server did not answer in time.')); }, ms);
        waits.set(id, { res, rej, t });
        if (!link.send({ ...m, rid: id })) { clearTimeout(t); waits.delete(id); rej(new Error('Not connected to the dev world server.')); }
      });
    },
    op(op) { return link.ask({ t: 'op', op }); },
    undo() { return link.ask({ t: 'undo' }); },
    redo() { return link.ask({ t: 'redo' }); },
    probe(at, r = 4) { return link.ask({ t: 'probe', at, r }); },
    marker(at, what = 'looking') { link.send({ t: 'marker', at, what }); },
    close() { wanted = false; ws?.close(); },
  };
  function connect() {
    link.state = 'connecting'; onState(link.state);
    try { ws = new WebSocket(link.url); } catch { retry(); return; }
    ws.onopen = () => { tries = 0; link.state = 'open'; onState(link.state); ws.send(JSON.stringify({ t: 'hello', who: link.who })); };
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if ((m.t === 'ok' || m.t === 'no' || m.t === 'probe') && m.rid && waits.has(m.rid)) {
        const w = waits.get(m.rid); waits.delete(m.rid); clearTimeout(w.t);
        if (m.t === 'no') w.rej(new Error(m.why || 'Refused.')); else w.res(m);
        if (m.t === 'probe') return;
      }
      on(m);
    };
    ws.onclose = () => { link.state = 'closed'; onState(link.state); for (const w of waits.values()) { clearTimeout(w.t); w.rej(new Error('The connection dropped.')); } waits.clear(); retry(); };
    ws.onerror = () => {};
  }
  function retry() { if (wanted) setTimeout(connect, Math.min(8000, 700 * 2 ** tries++)); }
  connect();
  return link;
}
