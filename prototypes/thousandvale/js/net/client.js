// Client connection (stream A) — the whole login + game connection for the browser client (stream D)
// and the bots (stream G). docs/protocol.md §9 is the manual.
//
//   const net = connect({ mode: 'ws'|'worker'|'loopback', url?, server?, tokenStore, build, clock?, guestName? })
//   net.on(event, fn) -> unsubscribe     events: status chars joined snap info ev you chat castR targetR used bag equip
//                                        party partyInvite partyFrames ignored kick err pong lost
//   await net.ready                      authed (guest made if there was no token / it was refused)
//   await net.createChar({ name, cls, look }) -> { id, name, cls, level, room }
//   await net.play(charId, { join }) -> joined payload  ('joined' fires again after every reconnect AND every room
//                                        change — `joined.handoff` set: same socket, new room, clear your entity mirror)
//   net.travel(to) ; net.campfire() ; net.quest(op, id, npc?) ; net.timeOfDay() ; events relocate zone travelR eventFrame zoneEvent quests questR realm groupHint
//   net.tradeOp(op, {...}) -> 'tradeAsk' / 'trade' events ; opts.human = token or async fn for Turnstile
//   net.use(id) ; net.item(op, uid, slot?) ; net.partyOp(op, {...}) ; net.partyChat(text) ; net.ignore(name, on) ; net.joinLink()
//   net.input({ s, dt, mx, mz, yaw, b }) ; net.cast({ slot, aim, target, ct }) ; net.target(id)
//   net.say(text) ; net.respawn() ; net.leave() ; net.close()
//   M3 (docs/protocol.md §16): net.accountOp(op, {...}) -> accountR ; net.login(user, pass) ; net.claim(user, pass, email?)
//     net.logout() ; net.chat(ch, text, to?) ; net.whisper(name, text) ; net.friend(op, name) ; net.guild(op, {...})
//     net.callboard(op, {...}) ; net.report(name, why, text?) ; net.mail(op, {...})
//     events accountR friends friendState guildState guildInvite guildR callboard reportR mailNew mailList mailOpen mailR
//   play-test 1 (§17): net.talent(op, {skill, tier, node}) -> talentR ; net.perk(op, {id}) -> perkR ; net.map() -> mapData ;
//     events discover (zone/places found; merged into joined.you.seen)
//   connect({ login: {user, pass} }) signs in with a username instead of making a guest when there is no token.
//   net.clock.serverNow() ; net.clock.rtt ; net.status ; net.joined ; net.you (local id)

import { PROTOCOL_VERSION } from './protocol.js';
import { decodeSnap } from './snapshot.js';
import { socketFactory, OPEN } from './sockets.js';
import { realClock } from './clock.js';

const BACKOFF = [500, 1000, 2000, 4000, 5000];
const NO_RETRY = new Set(['version', 'build', 'elsewhere', 'banned', 'abuse', 'loggedOut']);

export function connect(opts = {}) {
  const { mode = 'ws', build = 'dev', clock = realClock, guestName = null } = opts;
  // the "are you human" token for a new guest: a string, or async ({siteKey}) => token (the client shows Turnstile)
  const human = opts.human || null;
  const tokenStore = opts.tokenStore || memoryTokenStore();
  const open = opts.socketFactory || socketFactory(mode, opts);
  const handlers = new Map();
  const emit = (ev, a) => { const l = handlers.get(ev); if (l) for (const f of [...l]) { try { f(a); } catch (err) { console.error('[net] handler for', ev, err); } } };

  let gw = null, game = null, closed = false, attempt = 0, retryTimer = 0, pingTimer = 0;
  let wantChar = null, q = 0.125, origin = null, loginTried = false;
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
        net.humanCheck = m.human || null;
        net.accountsOn = !!m.accounts; net.privacy = m.privacy || null;
        if (m.clock) net.realmClock = { epoch: m.clock.epoch, dayMs: m.clock.dayMs, skew: Date.now() - m.clock.now };
        const tok = tokenStore.get();
        if (tok) sendJ(s, { t: 'auth', token: tok });
        else if (opts.login && !loginTried) { loginTried = true; sendJ(s, { t: 'account', op: 'login', user: opts.login.user, pass: opts.login.pass }); }
        else sendGuest(s);
        return;
      }
      case 'refuse': net.lastKick = m; emit('kick', m); setStatus('refused'); stop(); return;
      case 'authed':
        if (m.token) tokenStore.set(m.token);
        if (m.charLimit) net.charLimit = m.charLimit; net.account = m.account; net.claimed = !!m.claimed; net.username = m.username || null; net.admin = !!m.admin; attempt = 0;
        sendJ(s, { t: 'chars' });
        return;
      case 'charList':
        net.chars = m.chars; if (m.limit) net.charLimit = m.limit; emit('chars', m.chars);      // charLimit (round 9, X6): how many characters the account may hold
        readyResolve(net);
        if (wantChar != null) sendPlay();
        else setStatus('select');
        return;
      case 'created':
        net.chars = [...net.chars, m.char]; emit('chars', net.chars);
        if (createWaiter) { createWaiter.resolve(m.char); createWaiter = null; }
        return;
      case 'ticket': openGame(m.path, m.ticket); return;
      case 'err':
        if (m.code === 'auth') { tokenStore.set(null); sendGuest(s); return; }
        emit('err', m);
        if (createWaiter) { createWaiter.reject(Object.assign(new Error(m.msg), { code: m.code })); createWaiter = null; }
        else if (playWaiter && m.code === 'state') { playWaiter.reject(Object.assign(new Error(m.msg), { code: m.code })); playWaiter = null; }
        return;
      case 'kick': net.lastKick = m; emit('kick', m); if (NO_RETRY.has(m.code)) { setStatus('kicked'); stop(); } return;
      case 'pong': onPong(m); return;
      case 'partyState': net.party = m.party; emit('party', m.party); return;
      case 'partyInvite': emit('partyInvite', m); return;
      case 'partyFrames': emit('partyFrames', m.m.map(r => ({ char: r[0], hp: r[1], hpMax: r[2], room: r[3], x: r[4], z: r[5], dead: !!r[6], online: !!r[7], id: r[8], mp: r[9], mpMax: r[10] }))); return;
      case 'chat': emit('chat', m); return;
      case 'ignored': if (net.joined) net.joined.you.ignore = m.list; emit('ignored', m.list); return;
      case 'groupHint': emit('groupHint', m); return;
      case 'realm': emit('realm', m); return;
      case 'accountR':
        if (m.ok && m.op === 'claim') { net.claimed = true; net.username = m.username; }
        if (m.op === 'login' && !m.ok && net.status !== 'select' && net.status !== 'online') { emit('accountR', m); return; }
        emit('accountR', m); return;
      default: if (typeof m.t === 'string') emit(m.t, m);      // anything newer (friends, guildState, callboard, mailNew …)
    }
  }

  async function sendGuest(s) {
    const o = { t: 'guest' };
    if (guestName) o.name = guestName;
    if (net.humanCheck && human) {
      try { o.human = typeof human === 'function' ? await human(net.humanCheck) : human; } catch (err) { emit('err', { code: 'human', msg: String(err && err.message) }); return; }
    }
    sendJ(s, o);
  }

  // ---- game socket ----
  function openGame(path, ticket) {
    if (closed) return;
    if (game) { const g = game; game = null; g.close(); }
    setStatus('entering');
    net.gamePath = path;           // which province process holds me (`/p/<n>`)
    const s = game = open(path);
    s.onopen = () => sendJ(s, { t: 'hello', v: PROTOCOL_VERSION, build });
    s.onmessage = ev => {
      if (typeof ev.data === 'string') onGame(s, JSON.parse(ev.data), ticket);
      else if (net.joined) {
        let snap;
        try { snap = decodeSnap(ev.data, q, origin); snap.bytes = ev.data.byteLength; } catch (err) { console.error('[net] bad snapshot', err); return; }
        emit('snap', snap);
      }
    };
    s.onclose = () => { if (game === s) lost('game'); };
  }
  function onGame(s, m, ticket) {
    switch (m.t) {
      case 'welcome': sendJ(s, { t: 'enter', ticket }); return;
      case 'joined':
        q = m.room.q; origin = m.room.origin || null; net.joined = m; net.you = m.you.id; attempt = 0;
        setStatus('online');
        emit('joined', m);
        if (playWaiter) { playWaiter.resolve(m); playWaiter = null; }
        startPing();
        return;
      case 'info': emit('info', m.ents); return;
      case 'ev': emit('ev', m); return;
      case 'you': { const p = { ...m }; delete p.t; if (net.joined) Object.assign(net.joined.you, p); emit('you', p); return; }
      case 'discover': {             // P3: new zone / places found — kept in joined.you.seen as well
        const seen = net.joined && (net.joined.you.seen ||= { zones: [], places: [] });
        if (seen) { if (m.zone && !seen.zones.includes(m.zone)) seen.zones.push(m.zone); for (const p of m.places || []) if (!seen.places.includes(p.key)) seen.places.push(p.key); }
        emit('discover', m); return;
      }
      case 'chat': emit('chat', m); return;
      case 'castR': emit('castR', m); return;
      case 'targetR': emit('targetR', m); return;
      case 'used': emit('used', m); return;
      case 'bag': {
        if (net.joined) {
          const y = net.joined.you;
          const gone = new Set(m.remove);
          y.bag = y.bag.filter(i => !gone.has(i.uid)).concat(m.add);
          y.gold = m.gold;
        }
        emit('bag', m); return;
      }
      case 'equip': if (net.joined) net.joined.you.equipment = m.equipment; emit('equip', m); return;
      case 'tradeAsk': emit('tradeAsk', m); return;
      case 'relocate': {           // moving to a province another process holds: new socket, same flow as a ticket
        const old = game; game = null;
        if (old) { old.onclose = null; old.close(); }
        setStatus('entering');
        emit('relocate', m);
        openGame(m.path, m.ticket);
        return;
      }
      case 'zone': emit('zone', m); return;
      case 'travelR': emit('travelR', m); return;
      case 'eventFrame': emit('eventFrame', m); return;
      case 'zoneEvent': emit('zoneEvent', m); return;
      case 'tradeState': net.trade = m.trade; emit('trade', m); return;
      case 'pong': onPong(m); return;
      case 'err': emit('err', m); if (m.code === 'state' && playWaiter) { playWaiter.reject(Object.assign(new Error(m.msg), { code: m.code })); playWaiter = null; } return;
      case 'refuse': net.lastKick = m; emit('kick', m); setStatus('refused'); stop(); return;
      case 'kick': net.lastKick = m; emit('kick', m); if (NO_RETRY.has(m.code)) { setStatus('kicked'); stop(); } return;
      default: if (typeof m.t === 'string') emit(m.t, m);      // anything newer: listeners get it under its own type
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
  net.createChar = function ({ name, cls, look, kit }) {
    return new Promise((resolve, reject) => {
      createWaiter = { resolve, reject };
      const o = { t: 'create', name, cls }; if (look) o.look = look; if (kit) o.kit = kit;      // kit {armour, weapons}: T5
      sendJ(gw, o);
    });
  };
  let wantJoin = null;
  /** Enter the world as charId. `join` = a party code from a "join my party" link: you land next to the leader. */
  net.play = function (charId, { join = null } = {}) {
    wantChar = charId; wantJoin = join;
    return new Promise((resolve, reject) => {
      playWaiter = { resolve, reject };
      if (net.status === 'select' || net.status === 'online') sendPlay();
    });
  };
  function sendPlay() {
    const o = { t: 'play', char: wantChar };
    if (wantJoin) { o.join = wantJoin; wantJoin = null; }   // only on the first entry, not on reconnects
    sendJ(gw, o);
  }
  net.input = m => sendJ(game, { t: 'in', s: m.s, dt: m.dt, mx: m.mx, mz: m.mz, yaw: m.yaw, b: m.b | 0 });
  net.cast = ({ slot = 0, aim, target, ct, held } = {}) => {
    const o = { t: 'cast', slot };
    if (held != null) o.held = held;
    if (aim) o.aim = { x: aim.x, z: aim.z };
    if (target) o.target = target;
    o.ct = ct ?? net.clock.serverNow();
    sendJ(game, o);
  };
  net.target = id => sendJ(game, id ? { t: 'target', id } : { t: 'target' });
  net.use = (id, to) => sendJ(game, to ? { t: 'use', id, to: String(to) } : { t: 'use', id });      // to: a lift's floor 'f:<n>' (U12)
  net.item = (op, uid, slot) => sendJ(game, slot ? { t: 'item', op, uid, slot } : { t: 'item', op, uid });
  net.splitItem = (uid, n) => sendJ(game, { t: 'item', op: 'split', uid: String(uid), n: n | 0 });            // -> itemR {op:'split', ok, uid, made} + bag
  net.mergeItem = (uid, onto) => sendJ(game, { t: 'item', op: 'merge', uid: String(uid), onto: String(onto) });   // drop one stack on another -> itemR {op:'merge'} + bag
  net.friendsSeen = char => sendJ(gw, char != null ? { t: 'friend', op: 'seen', char } : { t: 'friend', op: 'seen' });   // clears `friends.unseen`
  /** party('invite', {name}) | ('accept'|'decline', {party: id}) | ('join', {code}) | ('code') | ('leave') | ('kick'|'lead', {char}) */
  net.partyOp = (op, a = {}) => {
    const o = { t: 'party', op };
    if (a.name) o.name = a.name;
    if (a.code) o.code = a.code;
    if (a.rarity && !a.code) o.code = a.rarity;   // party('loot', {rarity}) (D-UI's name)
    if (a.char != null) o.char = a.char;
    if (a.party != null) o.char = a.party;      // accept/decline carry the party id in `char`
    sendJ(gw, o);
  };
  net.party = null;
  /** The "join my party" link for the current party (needs a party: partyOp('code') makes one). */
  net.joinLink = (base = globalThis.location ? location.origin + location.pathname : '') => (net.party ? `${base}?join=${net.party.code}` : null);
  net.trade = null;
  /** trade('ask', {id: entityId}) | ('accept', {id: tradeId}) | ('offer', {id, items:[uids], gold}) | ('lock'|'confirm', {id}) | ('cancel') */
  net.tradeOp = (op, a = {}) => {
    const o = { t: 'trade', op };
    if (a.id != null) o.id = a.id;
    if (a.items) o.items = a.items;
    if (a.gold != null) o.gold = a.gold;
    sendJ(game, o);
  };
  net.travel = to => sendJ(game, { t: 'travel', to: String(to) });       // a waystone key, or 'event' (free while a realm event runs)
  net.campfire = () => sendJ(game, { t: 'trace', kind: 'campfire' });
  // play-test 1 (docs/protocol.md §17): talents + perk forest (P6), the world map (P3/P27)
  net.talent = (op, { skill, tier, node } = {}) => sendJ(game, { t: 'talent', op, ...(skill ? { skill } : {}), ...(Number.isInteger(tier) ? { tier } : {}), ...(node ? { node } : {}) });   // pick|clear -> talentR
  net.perk = (op, { id } = {}) => sendJ(game, { t: 'perk', op, ...(id ? { id } : {}) });   // take|refund|reset -> perkR
  net.map = () => sendJ(game, { t: 'map', op: 'get' });                                     // -> mapData
  net.quest = (op, id, npc) => sendJ(game, { t: 'quest', op, id: String(id), ...(npc ? { npc } : {}) });   // accept|turnin (npc = the giver's entity id) | abandon
  /** Realm time of day 0..1 (0 = midnight, 0.5 = noon) from the gateway's clock. */
  net.timeOfDay = () => { const c = net.realmClock; if (!c) return 0.5; const t = Date.now() - (c.skew || 0) - c.epoch; return ((t % c.dayMs) + c.dayMs) % c.dayMs / c.dayMs; };
  net.partyChat = text => sendJ(gw, { t: 'chat', ch: 'party', text: String(text).slice(0, 200) });
  net.ignore = (name, on = true) => sendJ(gw, { t: 'ignore', name, on });
  net.say = text => sendJ(game, { t: 'say', text: String(text).slice(0, 200) });
  net.respawn = () => sendJ(game, { t: 'respawn' });
  net.leave = () => { sendJ(game, { t: 'leave' }); sendJ(gw, { t: 'leave' }); stop(); setStatus('left'); };
  // ---- M3: accounts, channels, friends, guilds, the Callboard, reports, mail ----
  const pick = (o, a, keys) => { for (const k of keys) if (a[k] !== undefined && a[k] !== null) o[k] = a[k]; return o; };
  /** account('claim', {user, pass, email?, human?}) | ('login', {user, pass}) | ('logout') | ('password', {old, pass})
   *  | ('resetAsk', {user}) | ('reset', {user, code, pass}) | ('info'). Answer: 'accountR' (login answers with 'authed'). */
  net.accountOp = (op, a = {}) => sendJ(gw, pick({ t: 'account', op }, a, ['user', 'pass', 'old', 'email', 'code', 'human']));
  net.claim = (user, pass, email) => net.accountOp('claim', { user, pass, email });
  net.login = (user, pass) => net.accountOp('login', { user, pass });
  /** Revoke this browser's token and stop (claimed accounts only; the server refuses a guest). */
  net.logout = () => { sendJ(gw, { t: 'account', op: 'logout' }); tokenStore.set(null); };
  net.chat = (ch, text, to) => sendJ(gw, to ? { t: 'chat', ch, text: String(text).slice(0, 200), to } : { t: 'chat', ch, text: String(text).slice(0, 200) });
  net.whisper = (name, text) => net.chat('w', text, name);
  net.friend = (op, name) => sendJ(gw, name ? { t: 'friend', op, name } : { t: 'friend', op });
  /** guild('create', {name}) | ('invite', {name}) | ('accept'|'decline', {id}) | ('kick'|'promote'|'demote'|'lead', {char}) | ('motd', {text}) | ('leave'|'roster'|'disband') */
  net.guild = (op, a = {}) => sendJ(gw, pick({ t: 'guild', op }, a, ['name', 'char', 'id', 'text']));
  /** callboard('join', {dungeon:'<key>'|'any', role:'tank'|'healer'|'dps'}) | ('leave') | ('accept'|'decline', {id}) | ('list') */
  net.callboard = (op, a = {}) => sendJ(gw, pick({ t: 'callboard', op }, a, ['dungeon', 'role', 'id']));
  net.report = (name, why, text) => sendJ(gw, text ? { t: 'report', name, why, text } : { t: 'report', name, why });
  /** mail('list') | ('read'|'take'|'return'|'delete', {id}) | ('send', {to, subject, body, items:[uids], gold}) — province socket */
  net.mail = (op, a = {}) => sendJ(game, pick({ t: 'mail', op }, a, ['id', 'to', 'subject', 'body', 'items', 'gold']));
  // ---- play-test 2 (docs/protocol.md §18) ----
  /** loot('open'|'take'|'all'|'close', {id: corpse entity id, uid?}) | ('roll', {roll, choice:'need'|'greed'|'skip'}) -> lootWin / lootR / lootRolled */
  net.loot = (op, a = {}) => sendJ(game, pick({ t: 'loot', op }, a, ['id', 'uid', 'roll', 'choice', 'gold', 'near']));
  /** shop('open', {npc}) | ('buy', {npc, id}) | ('sell'|'back', {npc, uid}) -> shopView / shopR */
  net.shop = (op, a = {}) => sendJ(game, pick({ t: 'shop', op }, a, ['npc', 'id', 'uid']));
  /** mount('summon', {id?}) | ('off') -> mountR + you {mount, speedMul} */
  net.mount = (op, a = {}) => sendJ(game, pick({ t: 'mount', op }, a, ['id']));
  net.barber = (npc, look) => sendJ(game, { t: 'barber', npc, look });            // -> lookR
  net.pref = (k, v) => sendJ(game, { t: 'pref', k, v: !!v });                      // showGear | showHelm -> you {prefs}
  net.follow = id => sendJ(game, { t: 'follow', id });                             // -> followR (may I follow them?)
  net.settings = data => sendJ(gw, data ? { t: 'settings', op: 'set', data } : { t: 'settings', op: 'get' });   // -> settings {data}
  net.setLook = (char, look) => sendJ(gw, { t: 'look', char, look });              // title screen -> lookR
  net.partyLoot = min => net.partyOp('loot', { code: min });                       // 'magic' | 'rare' | 'legendary' | 'unique' (leader)
  net.inspect = id => sendJ(game, { t: 'inspect', id });
  net.bind = npc => sendJ(game, { t: 'bind', npc });                               // innkeeper: make this town home -> bindR
  net.stand = () => sendJ(game, { t: 'item', op: 'stand' });                       // S20: get up from a meal -> you {regen:null, why:'stood'}
  net.useItem = uidOrKind => sendJ(game, { t: 'item', op: 'use', uid: String(uidOrKind) });   // a bag uid, or 'id:healing_potion' (hotbar) -> itemR                           // -> inspectR
  // ---- play-test 5 (docs/protocol.md §21) ----
  net.kits = cls => sendJ(gw, { t: 'kits', cls });                                  // -> kitsR {cls, kits} (C's kitsFor)
  net.revive = (op, id) => sendJ(game, id != null ? { t: 'revive', op, id } : { t: 'revive', op });   // accept | decline a reviveAsk -> reviveR
  net.sheet = () => sendJ(game, { t: 'sheet' });                                    // -> sheet {core, advanced, abilities, angling}
  net.openItem = uid => sendJ(game, { t: 'item', op: 'open', uid: String(uid) });   // a crate / gift box -> itemR {opened}
  /** feedback('suggestion'|'bug', text, ctx?) -> feedbackR. Goes over the game socket when in the world (the server adds where you stand). */
  net.feedback = (kind, text, ctx, ref) => sendJ(game && game.readyState === OPEN && net.joined ? game : gw, { t: 'feedback', kind, text: String(text).slice(0, 2000), ...(ctx ? { ctx } : {}), ...(Number.isSafeInteger(ref) ? { ref } : {}) });
  /** Round 9 (X6): deleteChar(id, typedName) -> `deleted {ok, char, name, freeAt, returned, why?, msg?}`; a fresh `charList {chars, limit}` follows a success. */
  net.deleteChar = (id, name) => sendJ(gw, { t: 'delete', char: id, name: String(name || '').slice(0, 24) });
  /** Round 9 (X1): who is online (admin accounts only) -> `adminOnline {ok, at, count, accounts, list}`. Always asked of the gateway, which knows every process. */
  net.adminOnline = () => sendJ(gw, { t: 'admin', op: 'online' });
  /** Round 8 (W5): cart('list', id) -> cartList ; cart('go', id, stopId) -> cartR, then cartRide and (ms later) the arrival `joined`. `id` = the carter / cart entity. */
  net.cart = (op, id, to, token) => sendJ(game, { t: 'cart', op, id, ...(to ? { to } : {}), ...(token ? { token: true } : {}) });
  /** Round 8 (W21): meter(true|false) -> `meterR {on}`, then `hits {l: [[src, tgt, n, flags, sk, el, over, abs], …]}` a few times a second while on. */
  net.meter = on => sendJ(game, { t: 'meter', on: !!on });
  /** Round 8 (W29): myReports({limit?, before?}) -> `feedbackMine {ok, list:[{id, at, kind, text, state, note, noteAt, adminNote, done, doneAt, ref}], more}` — your account's own reports, newest first. */
  net.myReports = (q = {}) => sendJ(game && game.readyState === OPEN && net.joined ? game : gw, { t: 'feedbackMine', ...(q.limit ? { limit: q.limit } : {}), ...(q.before ? { before: q.before } : {}) });
  /** admin('reports', {kind?, state?, limit?, before?}) -> adminReports ; admin('report', {id, state, note?}) -> adminR (admin accounts only) */
  net.adminOp = (op, a = {}) => sendJ(game && game.readyState === OPEN && net.joined ? game : gw, pick({ t: 'admin', op }, a, ['id', 'state', 'kind', 'limit', 'before', 'note']));
  /** fish('cast', {aim?}) | ('hook') | ('land', {held}) | ('stop') -> fishR / fishBite / fishTug / fishCatch */
  net.fish = (op, a = {}) => sendJ(game, pick({ t: 'fish', op }, a, ['aim', 'held', 'score', 'holds']));
  /** cook() -> cookList ; cook(id, n?) -> cookR */
  // ---- round 8 W9 (P-core, docs/protocol.md §25): professions ----
  /** prof('learn'|'tool', {id, npc}) -> profR */
  net.prof = (op, a = {}) => sendJ(game, pick({ t: 'prof', op }, a, ['id', 'npc']));
  /** gather('start', {id?}) -> gatherR {game} ; gather('done', {id, inputs}) -> gatherDone ; gather('stop') */
  net.gather = (op, a = {}) => sendJ(game, pick({ t: 'gather', op }, a, ['id', 'inputs']));
  /** craft('list', {npc?}) -> craftList ; ('start', {id, base?, n?, uid?, index?, element?}) -> craftR ; ('done', {id, inputs}) -> craftDone ; ('quote', {id, uid, index?, element?}) -> craftQuote ; ('stop') */
  net.craft = (op, a = {}) => sendJ(game, pick({ t: 'craft', op }, a, ['id', 'npc', 'base', 'n', 'uid', 'index', 'element', 'inputs']));
  net.cook = (id, n) => sendJ(game, id ? (n ? { t: 'cook', id, n } : { t: 'cook', id }) : { t: 'cook' });
  // D-UI's first names (play-test 2): the same messages
  net.lootOp = net.loot;
  net.roll = (roll, choice) => net.loot('roll', { roll, choice });
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
