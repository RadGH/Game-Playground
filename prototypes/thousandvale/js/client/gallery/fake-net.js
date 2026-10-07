// The gallery's "server": a socket factory for js/net/client.js (its `socketFactory` option) that answers from a recorded
// session (fixtures/session.json, made by tools/record-ui-fixtures.mjs) instead of a network. The client code on top of it
// is the real one, so `net.joined`, `net.party`, the bag merge, the clock … behave exactly as they do in the game.
//
//   const fake = createFakeServer(session, moments);
//   const net = connect({ socketFactory: fake.open, tokenStore: memoryTokenStore('gallery') });
//   fake.play('lootWin');            // a named moment (fixtures/moments.json, or a step recorded in session.moments)
//   fake.push('game', { t: 'you', hp: 120 });   // any message, through the real client
//   fake.sent                        // every message the interface sent ([{ s, m }]) — the notes panel shows the last ones
//
// Requests are answered by key ("map:get", "shop:open", "sheet" — the recorder's replyKey). A request with no recorded
// answer is logged and dropped: the gallery shows states, it does not simulate the rules.

const OPEN = 1, CLOSED = 3;
export const replyKey = m => [m.t, m.op, m.t === 'kits' ? m.cls : null].filter(Boolean).join(':');
const b64ToBuf = b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };

export function createFakeServer(session, moments = {}, { world = true, onSend = null } = {}) {
  const socks = { gw: null, game: null };
  const sent = [];
  const hs = session.handshake || { gw: {}, game: {} };
  let booted = false, bootDone, bootWait = new Promise(r => { bootDone = r; });

  const deliver = (which, m) => { const s = socks[which]; if (s && s.readyState === OPEN && s.onmessage) s.onmessage({ data: typeof m === 'string' ? m : JSON.stringify(m) }); };
  const deliverBin = (which, b64) => { const s = socks[which]; if (s && s.readyState === OPEN && s.onmessage) s.onmessage({ data: b64ToBuf(b64) }); };
  /** Messages in order, a few per task so a long boot never blocks a frame. */
  async function stream(list) {
    let n = 0;
    for (const e of list) { deliver(e.s || 'game', e.m); if (++n % 40 === 0) await new Promise(r => setTimeout(r, 0)); }
  }

  function onGw(m) {
    switch (m.t) {
      case 'hello': return deliver('gw', hs.gw.welcome || { t: 'welcome', v: m.v, accounts: true });
      case 'auth': case 'guest': return deliver('gw', hs.gw.authed || { t: 'authed', account: 1, claimed: false });
      case 'chars': return deliver('gw', hs.gw.charList || { t: 'charList', chars: [] });
      case 'play': return world ? deliver('gw', hs.gw.ticket || { t: 'ticket', path: '/p/0', ticket: 'gallery' }) : null;
      case 'ping': return deliver('gw', { t: 'pong', c: m.c, s: Date.now(), k: 0 });
      case 'leave': return null;
      default: return answer('gw', m);
    }
  }
  function onGame(m) {
    switch (m.t) {
      case 'hello': return deliver('game', hs.game.welcome || { t: 'welcome', v: m.v });
      case 'enter': return enter();
      case 'ping': return deliver('game', { t: 'pong', c: m.c, s: Date.now(), k: 0 });
      case 'in': case 'target': case 'leave': return null;
      default: return answer('game', m);
    }
  }
  async function enter() {
    deliver('game', session.joined);
    for (const s of (session.snaps || []).slice(0, 1)) deliverBin(s.s || 'game', s.bin);
    await stream(session.boot || []);
    const last = (session.snaps || [])[session.snaps.length - 1];
    if (last && session.snaps.length > 1) deliverBin(last.s || 'game', last.bin);
    booted = true; bootDone();
  }
  /** The recorded answer for a request: the one asked of the same npc / id when there are several, else the first. */
  function recorded(key, m = null) {
    const list = (session.replies || {})[key] || (moments.replies || {})[key];
    if (!list || !list.length) return null;
    return (m && list.find(r => (m.npc != null && r.req.npc === m.npc) || (m.id != null && r.req.id === m.id))) || list[0];
  }
  function answer(which, m) {
    const r = recorded(replyKey(m), m);
    if (!r) return null;
    setTimeout(() => { for (const e of r.in) deliver(e.s || which, e.m); }, 30);
    return true;
  }

  function open(path) {
    const which = String(path).startsWith('/gw') ? 'gw' : 'game';
    const s = {
      _state: 0, get readyState() { return s._state; },
      onopen: null, onmessage: null, onclose: null,
      send(d) {
        if (s._state !== OPEN || typeof d !== 'string') return;
        let m = null; try { m = JSON.parse(d); } catch { return; }
        if (m.t !== 'ping' && m.t !== 'in') { sent.push({ s: which, m, at: Date.now() }); if (sent.length > 200) sent.shift(); onSend?.(which, m); }
        Promise.resolve().then(() => (which === 'gw' ? onGw(m) : onGame(m)));
      },
      close() { if (s._state === CLOSED) return; s._state = CLOSED; if (socks[which] === s) socks[which] = null; },
    };
    socks[which] = s;
    setTimeout(() => { if (s._state === 0) { s._state = OPEN; s.onopen && s.onopen(); } }, 0);
    return s;
  }

  /** The list a moment name stands for: moments.json first (hand-kept), then a step the recorder marked. */
  function momentList(name) {
    const m = (moments.moments || moments)[name] ?? (session.moments || {})[name];
    if (!m) return null;
    return (Array.isArray(m) ? m : [m]).map(e => (e && e.m && e.s ? e : { s: e.s || 'game', m: e.m || e }));
  }
  /** "@now+60000", "@me.x+12", "@enemy" … in a hand-kept moment are filled in by the stage's resolver when it is played. */
  const fill = v => (typeof v === 'string' && v[0] === '@' && api.resolve ? api.resolve(v) : Array.isArray(v) ? v.map(fill) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v);
  const api = {
    open, sent, resolve: null, fill,
    get booted() { return booted; }, whenBooted: () => bootWait,
    push: (which, m) => deliver(which, fill(m)),
    /** Play a named moment through the real client. Returns how many messages it held (0 = no such moment). */
    play(name) { const list = momentList(name); if (!list) return 0; for (const e of list) deliver(e.s, fill(e.m)); return list.length; },
    has: name => !!momentList(name),
    item: name => fill((moments.items || {})[name] || null),
    reply: (key, m) => recorded(key, m), replies: key => (session.replies || {})[key] || [],
  };
  return api;
}
