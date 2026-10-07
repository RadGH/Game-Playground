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

export const FRIEND_OPS = Object.freeze(['add', 'remove', 'list', 'seen']);
/**
 * Owner feedback 7 (the badge that never cleared, and did not survive a reload): what a character has NOT SEEN yet is kept
 * by the server — `friendsUnseen:<char>` in world state: `[{ char, name, kind: 'added' | 'addedYou', at }]`. `added` = a
 * friend you just added; `addedYou` = someone put you on their list (told at once with `friendNew` when you are online).
 * It rides on every `friends` message (`unseen`, and `unseen: true` on that list row) and `friend {op:'seen', char?}` clears
 * it (one, or all).
 */
export const UNSEEN_MAX = 50;

export function createFriends({ store, presence, gwByChar, log = () => {}, onList = null, wallNow = () => Date.now() }) {
  const lists = new Map();          // char -> Map(friendId -> { id, name, cls, level })
  const watchers = new Map();       // friendId -> Set(char)

  const view = (c, f) => { const pr = presence.get(f.id); return { char: f.id, name: pr ? pr.name : f.name, cls: pr ? pr.cls : f.cls, level: pr ? pr.level : f.level, online: !!(pr && pr.online), zone: pr ? (pr.zone || null) : null, look: (pr && pr.look) || f.look || null }; };
  const unseen = new Map();         // char -> [{ char, name, kind, at }] (loaded with the list)
  const key = c => 'friendsUnseen:' + c;
  const readUnseen = async c => { const v = store.getWorld ? await store.getWorld(key(c)) : null; return Array.isArray(v) ? v : []; };
  const writeUnseen = (c, l) => (store.setWorld ? store.setWorld(key(c), l.slice(-UNSEEN_MAX)) : null);
  async function mark(c, row) {
    const l = unseen.has(c) ? unseen.get(c) : await readUnseen(c);
    const next = l.filter(x => !(x.char === row.char && x.kind === row.kind)).concat(row).slice(-UNSEEN_MAX);
    if (unseen.has(c) || gwByChar.get(c)) unseen.set(c, next);
    await writeUnseen(c, next);
  }
  function send(c) {
    const g = gwByChar.get(c), l = lists.get(c);
    if (!g || !l) return;
    const u = unseen.get(c) || [], fresh = new Set(u.filter(x => x.kind === 'added').map(x => x.char));
    g.sendJSON({ t: 'friends', list: [...l.values()].map(f => ({ ...view(c, f), ...(fresh.has(f.id) ? { unseen: true } : {}) })), unseen: u, unseenCount: u.length });
  }
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
    unseen.set(c, await readUnseen(c));
    send(c);
    if (onList) onList(c, [...l.keys()]);          // play-test 2 (Q15): the province needs the list for 'friends only' trades
  }

  async function op(s, m) {
    const me = s.charId;
    if (!me || !presence.get(me)) return s.err('state', 'Enter the world first.');
    if (!FRIEND_OPS.includes(m.op)) return 'op';
    if (m.op === 'list') return load(me);
    if (m.op === 'seen') {
      const u = unseen.get(me) || await readUnseen(me);
      const left = m.char != null ? u.filter(x => x.char !== m.char) : [];
      unseen.set(me, left); await writeUnseen(me, left);
      return send(me);
    }
    const name = String(m.name || '');
    const l = lists.get(me) || new Map();
    if (m.op === 'add') {
      const t = await store.charByName(name);
      if (!t) return s.err('notFound', 'Nobody by that name.');
      if (t.id === me) return s.err('state', 'That is you.');
      const r = await store.addFriend(me, t.id, FRIENDS_MAX);
      if (r.err) return s.err('state', r.err === 'full' ? 'Your friend list is full (' + FRIENDS_MAX + ').' : 'Nobody by that name.');
      if (!l.has(t.id)) {
        const at = wallNow(), mine = presence.get(me);
        await mark(me, { char: t.id, name: t.name, kind: 'added', at });
        await mark(t.id, { char: me, name: mine ? mine.name : '?', kind: 'addedYou', at });
        const tg = gwByChar.get(t.id);
        if (tg) { tg.sendJSON({ t: 'friendNew', char: me, name: mine ? mine.name : '?', kind: 'addedYou' }); if (lists.has(t.id)) send(t.id); }
      }
    } else {
      const f = [...l.values()].find(x => x.name.toLowerCase() === name.toLowerCase()) || (m.char != null ? l.get(m.char) : null);
      if (!f) return s.err('notFound', 'Not on your list.');
      await store.removeFriend(me, f.id);
      const u = (unseen.get(me) || []).filter(x => x.char !== f.id);
      if (u.length !== (unseen.get(me) || []).length) { unseen.set(me, u); await writeUnseen(me, u); }
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
  function drop(c) { unindex(c); lists.delete(c); unseen.delete(c); }

  return {
    load: c => load(c).catch(err => log('friends load failed', err && err.message)),
    op: (s, m) => Promise.resolve(op(s, m)).catch(err => { log('friend op failed', err && err.message); s.err('state', 'That did not work.'); }),
    changed, drop,
    has: (a, b) => !!(lists.get(a) && lists.get(a).has(b)),
    ids: c => (lists.get(c) ? [...lists.get(c).keys()] : []),
    size: () => lists.size,
  };
}
