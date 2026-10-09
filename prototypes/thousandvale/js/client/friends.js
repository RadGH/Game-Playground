// Friends list (M3, protocol §16.3): who is online, their level, class and zone, add by name (online or not),
// whisper / party invite / remove from each row, and a line in chat when a friend comes online or goes offline.
// Server: friends {list}, friendState {char, name, cls, level, online, zone}; net.friend('add'|'remove', name). DOM only.

import { sortFriends, mergeFriend } from './social-core.js';
import { createPanel, h, confirmBox } from './ui-panel.js';
import { zoneName, className } from './names.js';
import { UNSEEN } from './ui/unseen.js';

export function createFriends({ net: getNet, hud, chat, social }) {
  const net = () => getNet();
  let list = [], seen = false, srv = false;      // srv: the server keeps the unseen list (protocol §23.1)
  const tellSeen = () => { if (!srv || !UNSEEN.count('friends')) return; const n = net(); if (typeof n?.friendsSeen === 'function') n.friendsSeen(); else n?._raw?.('gw', JSON.stringify({ t: 'friend', op: 'seen' })); };
  const panel = createPanel({ id: 'friends', title: 'Friends', width: 330, onOpen: () => { tellSeen(); UNSEEN.set('friends', 0); UNSEEN.seen('friends'); draw(); } });   // U1: looking at the list clears its badge

  function add(name) {
    const n = String(name || '').trim();
    if (!n) return;
    net()?.friend('add', n);
    hud.toast(`Adding ${n}…`, 'info');
  }
  async function remove(name) {
    if (!(await confirmBox(`Remove ${name} from your friends?`, { yes: 'Remove', danger: true }))) return;
    net()?.friend('remove', name);
  }
  const isFriend = name => list.some(f => String(f.name).toLowerCase() === String(name).toLowerCase());

  function draw() {
    const online = list.filter(f => f.online).length;
    if (!panel.isOpen) return;
    tellSeen(); UNSEEN.set('friends', 0); UNSEEN.seen('friends');
    panel.setTitle('Friends', list.length ? `${online} of ${list.length} online` : '');
    const input = h('input', { maxLength: 16, placeholder: 'Name', 'aria-label': 'Friend name', onkeydown: e => { if (e.key === 'Enter') { add(input.value); input.value = ''; } } });
    const rows = sortFriends(list).map(f => h('li.fr-row' + (f.online ? '.online' : ''), {},
      portrait(f),
      h('div.fr-main', {},
        h('a.chat-name', { href: '#', onclick: e => { e.preventDefault(); chat.nameMenu(f.name, e.clientX, e.clientY, { char: f.char }); } }, f.name),
        h('small', {}, [f.level ? `Level ${f.level}` : '', className(f.cls)].filter(Boolean).join(' '), f.online ? h('em', {}, ' · ' + (zoneName(f.zone) || 'In the Vale')) : h('em', {}, ' · Offline'))),
      h('div.fr-acts', {},
        f.online ? h('button.ghost.small', { type: 'button', title: 'Whisper', onclick: () => chat.whisper(f.name) }, 'Whisper') : null,
        f.online ? h('button.ghost.small', { type: 'button', title: 'Invite to your party', onclick: () => social?.invite(f.name) }, 'Invite') : null,
        // play-test 10 (Y36): follow a friend — an arrow at the edge of the screen and on the minimap, a marker on the map (ui/pt10.js)
        f.online && api.tracker && f.char != null ? h('button.ghost.small.fr-track' + (api.tracker.isTracked(f.char) ? '.on' : ''), { type: 'button', 'aria-pressed': String(api.tracker.isTracked(f.char)), dataset: { act: 'track' },
          title: api.tracker.isTracked(f.char) ? `Stop tracking ${f.name}` : `Track ${f.name}: an arrow leads you to them`, onclick: () => { api.tracker.track(f.char, f.name, 'friend'); draw(); } }, api.tracker.isTracked(f.char) ? 'Tracked' : 'Track') : null,
        h('button.ghost.small.x', { type: 'button', title: 'Remove friend', 'aria-label': `Remove ${f.name}`, onclick: () => remove(f.name) }, '×'))));
    panel.fill(
      h('div.row', {}, input, h('button.ghost', { type: 'button', onclick: () => { add(input.value); input.value = ''; } }, 'Add')),
      rows.length ? h('ul.fr-list', {}, rows) : h('p.empty', {}, 'No friends yet. Add someone by name, or click a name in chat.'),
      h('p.tiny-left', {}, 'You can always whisper a friend, even before your account can use the public channels.'));
  }

  function wire(n) {
    n.on('friends', m => {
      const before = new Map(list.map(f => [f.char, f]));
      list = m.list || [];
      if (seen) for (const f of list) if (!before.has(f.char)) { hud.chat(`${f.name} is now on your friends list.`, 'system'); if (!panel.isOpen && !srv) UNSEEN.add('friends', 'new:' + f.char); }
      for (const k of [...before.keys()]) if (!list.some(x => x.char === k)) { UNSEEN.drop('friends', 'new:' + k); UNSEEN.drop('friends', 'on:' + k); }
      if (seen) for (const [c, f] of before) if (!list.some(x => x.char === c)) hud.chat(`${f.name} was removed from your friends list.`, 'system');
      // the server's own count of friends you have not looked at yet: it is there after a reload too
      if ('unseenCount' in m || Array.isArray(m.unseen)) { srv = true; UNSEEN.set('friends', panel.isOpen ? 0 : (m.unseenCount ?? m.unseen.length)); }
      seen = true;
      draw();
    });
    n.on('friendNew', m => { srv = true; if (!panel.isOpen) UNSEEN.set('friends', UNSEEN.count('friends') + 1); hud.chat(`${m.name || 'Someone'} added you as a friend.`, 'friend'); hud.toast(`${m.name || 'Someone'} added you as a friend`, 'info'); if (panel.isOpen) tellSeen(); });
    n.on('friendState', r => {
      const old = list.find(f => f.char === r.char);
      list = mergeFriend(list, r);
      if (old && old.online !== r.online) { hud.chat(`${r.name} ${r.online ? 'is online' : 'went offline'}.`, 'friend'); if (r.online) hud.toast(`${r.name} is online`, 'info'); if (r.online && !panel.isOpen) UNSEEN.add('friends', 'on:' + r.char); else if (!r.online) UNSEEN.drop('friends', 'on:' + r.char); }
      draw();
    });
  }

  /** Play-test 2 Q13: a portrait (ui/portraits.js) with the online dot on its corner; the dot alone until it is ready. */
  function portrait(f) {
    const pic = api.portraitFor?.(f);
    return pic ? h('span.fr-pic', { title: f.online ? 'Online' : 'Offline' }, h('img', { src: pic, alt: '' }), h('i.dot')) : h('i.dot', { title: f.online ? 'Online' : 'Offline' });
  }
  const api = { wire, panel, add, remove, isFriend, draw, portraitFor: null, tracker: null, get list() { return list; } };
  return api;
}
