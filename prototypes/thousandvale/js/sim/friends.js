// FRIENDS (stream A, PLAN §15 M3), part of the gateway. Pure. A friend list belongs to a CHARACTER (saved in
// the `friends` table, up to 100 names, offline names too). While you are signed in the gateway keeps your list in
// memory plus a reverse index (who is watching whom), so a friend coming online, going offline, levelling or
// changing zone reaches you as one small `friendState` message.
//
//   const F = createFriends({ store, presence, gwByChar, log })
//   F.load(charId)            on play: read the list, send `friends`
//   F.op(s, m)                friend {op:'add'|'remove'|'list', name}
//   F.changed(charId, was)    presence moved (online / level / zone): tell the watchers
//   F.drop(charId)            the gateway session ended
//   F.has(a, b)               is b on a's list (chat uses it for whispers)

import { FRIENDS_MAX } from './store-memory-m3.js';

export const FRIEND_OPS = Object.freeze(['add', 'remove', 'list']);

export function createFriends({ store, presence, gwByChar, log = () => {}, onList = null }) {
  const lists = new Map();          // char -> Map(friendId -> { id, name, cls, level })
  const watchers = new Map();       // friendId -> Set(char)

  const view = (c, f) => { const pr = presence.get(f.id); return { char: f.id, name: pr ? pr.name : f.name, cls: pr ? pr.cls : f.cls, level: pr ? pr.level : f.level, online: !!(pr && pr.online), zone: pr ? (pr.zone || null) : null, look: (pr && pr.look) || f.look || null }; };
  function send(c) { const g = gwByChar.get(c), l = lists.get(c); if (g && l) g.sendJSON({ t: 'friends', list: [...l.values()].map(f => view(c, f)) }); }
  function index(c, l) {
    for (const f of l.keys()) { if (!watchers.has(f)) watchers.set(f, new Set()); watchers.get(f).add(c); }
  }
  function unindex(c) {
    const l = lists.get(c);
    if (l) for (const f of l.keys()) { const w = watchers.get(f); if (w) { w.delete(c); if (!w.size) watchers.delete(f); } }
  }
  async function load(c) {
    const rows = await store.listFriends(c);
    unindex(c);
    const l = new Map(rows.map(r => [r.id, { id: r.id, name: r.name, cls: r.cls, level: r.level }]));
    lists.set(c, l); index(c, l);
    send(c);
    if (onList) onList(c, [...l.keys()]);          // play-test 2 (Q15): the province needs the list for 'friends only' trades
  }

  async function op(s, m) {
    const me = s.charId;
    if (!me || !presence.get(me)) return s.err('state', 'Enter the world first.');
    if (!FRIEND_OPS.includes(m.op)) return 'op';
    if (m.op === 'list') return load(me);
    const name = String(m.name || '');
    const l = lists.get(me) || new Map();
    if (m.op === 'add') {
      const t = await store.charByName(name);
      if (!t) return s.err('notFound', 'Nobody by that name.');
      if (t.id === me) return s.err('state', 'That is you.');
      const r = await store.addFriend(me, t.id, FRIENDS_MAX);
      if (r.err) return s.err('state', r.err === 'full' ? 'Your friend list is full (' + FRIENDS_MAX + ').' : 'Nobody by that name.');
    } else {
      const f = [...l.values()].find(x => x.name.toLowerCase() === name.toLowerCase()) || (m.char != null ? l.get(m.char) : null);
      if (!f) return s.err('notFound', 'Not on your list.');
      await store.removeFriend(me, f.id);
    }
    return load(me);
  }

  function changed(c) {
    const w = watchers.get(c);
    if (!w || !w.size) return;
    const pr = presence.get(c);
    for (const x of w) {
      const l = lists.get(x), f = l && l.get(c);
      if (!f) continue;
      if (pr) { f.name = pr.name; f.level = pr.level; }
      const g = gwByChar.get(x);
      if (g) g.sendJSON({ t: 'friendState', ...view(x, f) });
    }
  }
  function drop(c) { unindex(c); lists.delete(c); }

  return {
    load: c => load(c).catch(err => log('friends load failed', err && err.message)),
    op: (s, m) => Promise.resolve(op(s, m)).catch(err => { log('friend op failed', err && err.message); s.err('state', 'That did not work.'); }),
    changed, drop,
    has: (a, b) => !!(lists.get(a) && lists.get(a).has(b)),
    ids: c => (lists.get(c) ? [...lists.get(c).keys()] : []),
    size: () => lists.size,
  };
}
