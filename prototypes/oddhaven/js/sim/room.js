// A room: the same sim and the same driver the Worker runs, with several players (PLAN rule 8). Pure, like the rest of this folder: the caller brings the
// sockets and the clock (server/hub.mjs), the tests bring neither.
//
//   const room = createRoom({ data, town, seed | save, paused, meta, options });
//   const me = room.join(send, { token, name, busy, close });     room.message(me, msg, nowMs);     room.pump(nowMs);
//   room.drop(me, nowMs)    the socket died: they keep their seat and their person for `grace`
//   room.leave(me)          they meant to go: everyone they were playing goes back to the town
//   room.dump(nowMs)        { text, meta }: everything needed to close the room and open it again
//
// Messages are the Worker's messages (worker.js), so js/client/town-link.js speaks to either. What a room adds:
// - a SEAT is a player: `p1`, `p2`. It is what `hold.owner` holds, it survives a dropped socket, and the token that claims it is never sent to anyone else;
// - PARTIES and PERMISSIONS live here and never in the sim's state, so a town that went through co-op hashes exactly as it did before (a save comes back byte for byte);
// - every sim command is stamped with the sender's seat and checked against that seat's permissions by `gate`. Hiding a button in the page is a courtesy; this is the rule;
// - `focus` is per client and merged, so each screen stays lit, and each client is sent what is near its own screen;
// - a room runs at 1x. `speed` and `turbo` are ignored; only a vote that everyone online agrees to runs it faster, or runs through the night (PLAN rule 1);
// - `pos` from the browser that runs a body also goes straight on to the others, stamped with the room's clock, without waiting for the next tick (`rel`);
// - a body changes hands in two steps (`yield`, `yielded`, then the `transfer` command between ticks), so the last word on where a fast car is comes from the browser that drove it.
import { createSim } from './index.js';
import { createDriver } from './driver.js';
import { problems, createStuckWatch } from './audit.js';
import { cleanCommand, cleanMessage, cleanName, createBucket, LIMITS } from './protocol.js';

export const PERMS = Object.freeze(['take', 'spend', 'drive', 'settings', 'direct']);
export const DEFAULT_PERMS = Object.freeze({ take: true, spend: false, drive: true, settings: false, direct: false });
export const OPTIONS = Object.freeze({ maxPlayers: LIMITS.players, grace: 90000, yieldMs: 300, voteMs: 30000, relayMs: 100, viewMs: 250, offerMs: 60000, skipSpeed: 30, relayReach: 500, dev: false });
const NIGHT_FROM = 21 * 60, NIGHT_TO = 5 * 60, MORNING = 6 * 60, LINE_DAYS = 5, MAX_LINES = 4000;
const VOTES = { speed2: 2, speed4: 4 }, HEAVY = new Set(['inspect', 'phone', 'facts', 'health', 'save']);

export function createRoom({ data, town, seed = 1, save = null, paused = false, meta = null, options = {} }) {
  const opt = { ...OPTIONS, ...options };
  const sim = createSim({ seed, data, town, save });
  const driver = createDriver({ sim, post: null });
  const seats = new Map(), parties = new Map(), offers = new Map(), yields = new Map(), lastCar = new Map(), lines = new Map(), fast = new Map();
  const watch = createStuckWatch(sim), stats = { refused: 0, bad: 0, dupes: 0, relayed: 0 };
  let nextSeat = 1, nextParty = 1, nextYield = 1, watched = sim.t, now = 0, vote = null, agreed = 0, skipping = false, relayAt = 0, viewAt = 0, viewSent = '', lastInput = 0;
  let settings = { name: 'A town', public: false, defaults: { ...DEFAULT_PERMS } };
  if (paused) driver.setSpeed(0);

  // ---- a room that slept comes back with its seats, offline, waiting for their tokens
  if (meta) {
    settings = { ...settings, ...meta.settings };
    nextSeat = meta.nextSeat ?? 1; nextParty = meta.nextParty ?? 1;
    for (const r of meta.seats ?? []) seats.set(r.id, { ...r, heavy: createBucket(LIMITS.heavyPerSecond, LIMITS.heavyPerSecond * 2), lines: createBucket(LIMITS.saidPerSecond, LIMITS.saidPerSecond * 2), online: false, send: null, busy: null, close: null, focus: { points: [], party: [] }, playing: false, own: new Set(r.own ?? []), last: 0 });
    for (const r of meta.parties ?? []) parties.set(r.id, { ...r });
    for (const [id, d] of meta.lines ?? []) lines.set(id, d);
  }
  const online = () => [...seats.values()].filter(c => c.online);
  const dayNow = () => sim.t / sim.clock.ticksPerDay;
  /** The host, or while the host is away whoever has been here longest. */
  const hostSeat = () => { const list = [...seats.values()], h = list.find(c => c.host); return h?.online || !online().length ? h : online()[0]; };
  const isHost = cl => hostSeat() === cl;
  const partyOf = cl => parties.get(cl.party) ?? null;
  const send = (cl, m) => { if (cl.online) cl.send(m); };
  const everyone = m => { for (const c of online()) c.send(m); };
  const heldBy = cl => sim.state.held.filter(id => sim.state.people[id].hold.owner === cl.id);
  const frontOf = cl => heldBy(cl).find(id => sim.state.people[id].hold.kind === 'you') ?? -1;
  const crewOf = cl => (partyOf(cl)?.members ?? []).filter(id => id !== cl.id);
  const deny = (cl, cmd, why) => { stats.refused++; send(cl, { type: 'denied', cmd: cmd.kind ?? cmd.type, why, who: cmd.who }); return false; };

  const mergeFocus = () => {
    const points = [], party = new Set();
    for (const cl of online()) { points.push(...cl.focus.points); for (const id of cl.focus.party) party.add(id); }
    for (const c of seats.values()) for (const id of heldBy(c)) party.add(id);
    driver.command({ kind: 'focus', points, party: [...party] });
  };
  const clockHeld = () => driver.setControlled(online().some(c => c.playing) || sim.state.held.length > 0);
  const health = id => ({ type: 'health', id, problems: problems(sim), stuck: watch.found.slice(0, 12), stuckCount: watch.found.length, t: sim.t, day: sim.clock.day(sim.t), trips: sim.state.trips.length, resets: sim.state.stats.resets, tripsDone: sim.state.stats.trips, billsRun: sim.state.stats.billsRun, poorest: Math.min(...sim.state.households.map(h => h.money)) });

  // ---- what every player sees of the room
  function view() {
    const speed = driver.speed;
    return {
      name: settings.name, public: settings.public, defaults: settings.defaults, host: hostSeat()?.id ?? null, owner: [...seats.values()].find(c => c.host)?.id ?? null, speed, skipping, day: sim.clock.day(sim.t),
      vote: vote ? { what: vote.what, by: vote.by, yes: [...vote.yes], until: vote.until } : null,
      players: [...seats.values()].filter(c => !c.gone).map(c => ({ id: c.id, name: c.name, online: c.online, party: c.party, perms: c.perms, me: frontOf(c), n: heldBy(c).length, own: [...c.own], signedIn: !!c.account })),
      parties: [...parties.values()].filter(q => q.members.length).map(q => ({ id: q.id, leader: q.leader, members: q.members })),
      held: sim.state.held.map(id => [id, sim.state.people[id].hold.owner]),
      offers: [...offers.values()].map(o => ({ from: o.from, to: o.to, ask: o.ask, party: o.party })),
    };
  }
  function sendView(force = false) {
    const v = view(), text = JSON.stringify(v);
    if (!force && text === viewSent) return;
    viewSent = text;
    everyone({ type: 'room', room: v });
  }

  // ---- parties
  function newParty(cl) { const q = { id: nextParty++, leader: cl.id, members: [cl.id] }; parties.set(q.id, q); cl.party = q.id; return q; }
  function outOfParty(cl) {
    const q = partyOf(cl); if (!q) return;
    q.members = q.members.filter(id => id !== cl.id);
    if (q.leader === cl.id) q.leader = q.members.find(id => seats.get(id).online) ?? q.members[0] ?? null;
    if (!q.members.length) parties.delete(q.id);
    cl.party = 0;
  }
  function intoParty(cl, q) { if (q.members.includes(cl.id)) return; outOfParty(cl); q.members.push(cl.id); cl.party = q.id; send(cl, { type: 'party', joined: q.id }); }
  /** Someone away too long stops leading; they stay in the party for when they are back. */
  function leaderHere(q) { if (!seats.get(q.leader)?.online) { const n = q.members.find(id => seats.get(id).online); if (n) q.leader = n; } }

  // ---- a body changes hands. `handOver` asks the browser running it to let go first; `finish` does it
  function handOver({ who, from, to, as }) {
    const n = nextYield++, cl = seats.get(from);
    yields.set(n, { who, from, to, as, until: now + opt.yieldMs });
    if (cl?.online) cl.send({ type: 'yield', n, who, to }); else finish(n);
  }
  function finish(n) {
    const y = yields.get(n); if (!y) return;
    yields.delete(n);
    const p = sim.state.people[y.who], row = sim.state.live.find(r => r.driver === y.who);
    if (!p?.hold || p.hold.owner !== y.from) return;
    const pose = row ? lastCar.get(row.id) : null;
    driver.commandNow({ kind: 'transfer', who: y.who, from: y.from, to: y.to, as: y.as, at: pose?.at ?? now });
    sendView(true);
  }
  /** Back to the town, or back to the leader if they are playing someone: nobody is dropped in the road. */
  function giveBack(cl) {
    const q = partyOf(cl), lead = q && q.leader !== cl.id ? seats.get(q.leader) : null, list = heldBy(cl).filter(id => !cl.own.has(id));
    if (lead?.online && frontOf(lead) >= 0) { for (const id of list) if (sim.state.people[id].hold.kind === 'you') handOver({ who: id, from: cl.id, to: lead.id, as: 'party' }); return; }
    for (const id of list) driver.command({ kind: 'release', who: id, owner: cl.id });
  }

  // ---- votes: everyone online has to say yes
  function startVote(cl, what) {
    if (vote) return deny(cl, { type: 'vote' }, 'vote running');
    if (what === 'speed1') { if (agreed || skipping) { agreed = 0; skipping = false; applySpeed(); everyone({ type: 'note', text: 'speed.back', by: cl.id }); } return true; }
    if (what === 'night') { const m = sim.clock.minute(sim.t); if (m < NIGHT_FROM && m >= NIGHT_TO) return deny(cl, { type: 'vote' }, 'not night'); } else if (!VOTES[what]) return deny(cl, { type: 'vote' }, 'no such vote');
    vote = { what, by: cl.id, yes: new Set([cl.id]), until: now + opt.voteMs };
    checkVote();
    return true;
  }
  function checkVote() {
    if (!vote) return;
    const list = online();
    if (list.length && list.every(c => vote.yes.has(c.id))) {
      if (vote.what === 'night') skipping = true; else agreed = VOTES[vote.what];
      everyone({ type: 'note', text: 'vote.yes', what: vote.what });
      vote = null; applySpeed();
    }
    sendView(true);
  }
  const endVote = why => { if (!vote) return; const what = vote.what; vote = null; everyone({ type: 'note', text: why, what }); sendView(true); };
  function applySpeed() { driver.setAgreed(skipping ? opt.skipSpeed : agreed); sendView(true); }

  // ---- the rule on every sim command. Returns a reason, or null to go ahead
  function gate(cl, cmd) {
    const s = sim.state, P = cl.perms, boss = isHost(cl), p = cmd.who !== undefined && cmd.who !== null ? s.people[cmd.who] : null, mine = p?.hold?.owner === cl.id, own = cl.own.has(cmd.who);
    if (boss) return null;
    switch (cmd.kind) {
      case 'take': case 'partyAdd':
        if (!P.take && !own) return 'take';
        if (!P.drive && p?.trip?.mode === 'drive') return 'drive';
        return null;
      case 'order': {
        if (!P.direct) return 'direct';
        const a = cmd.order?.kind === 'use' ? sim.context.actionById[cmd.order.action] : null;
        return a?.cost && !P.spend ? 'spend' : null;
      }
      case 'cancelOrders': return P.direct ? null : 'direct';
      case 'setJob': return mine || P.direct ? null : 'direct';
      case 'autonomy': return P.settings ? null : 'settings';
      case 'editPerson': return P.settings || own ? null : 'settings';
      case 'addPerson': return P.settings || (!cl.brought && cmd.household == null) ? null : 'settings';
      case 'summon': case 'liveAdd': return P.drive ? null : 'drive';
      case 'swap': return !P.drive && p?.hold?.car >= 0 ? 'drive' : null;
      case 'work': case 'fire': case 'wear': case 'press': case 'plate': case 'cast': case 'law': case 'fight': return mine ? null : 'not yours';
      case 'permit': if (!mine && !own) return 'not yours'; return P.spend ? null : 'spend';
      case 'liveDrop': return s.live.find(r => r.id === cmd.id)?.owner === cl.id ? null : 'not yours';
      default: return null;
    }
  }
  /** What the room writes on a command. Nothing here comes from the client. */
  function stamp(cl, cmd) {
    const P = cl.perms, boss = isHost(cl), out = { ...cmd, owner: cl.id };
    if (cmd.kind === 'carIn') { out.crew = crewOf(cl); if (!P.drive && !boss) out.noWheel = true; }
    if (cmd.kind === 'summon' && !P.spend && !boss) out.comp = true;
    if (cmd.kind === 'addPerson' && !boss) { out.guest = cl.name; cl.brought = true; }
    return out;
  }
  /** Straight on to the others: `pos` is what makes someone else's car look like a car. */
  function relay(cl, cmd) {
    const s = sim.state, g = fast.get(cl.id) ?? { at: now, p: new Map(), c: new Map() };
    g.at = now;
    for (const r of cmd.people ?? []) if (s.people[r[0]]?.hold?.owner === cl.id) g.p.set(r[0], [r[0], r[1], r[2], r[3], r[7] ?? 0, r[8] ?? -1]);
    for (const r of cmd.cars ?? []) { const row = s.live.find(q => q.id === r[0]); if (row?.owner !== cl.id) continue; g.c.set(r[0], [r[0], r[1], r[2], r[3], r[4]]); lastCar.set(r[0], { x: r[1], z: r[2], yaw: r[3], v: r[4], at: now }); }
    fast.set(cl.id, g);
  }
  function flushRelay() {
    if (!fast.size) return;
    const groups = [...fast.entries()];
    fast.clear();
    for (const cl of online()) {
      if (cl.busy?.()) continue;
      const crew = partyOf(cl)?.members ?? [], out = [];
      for (const [o, g] of groups) {
        if (o === cl.id) continue;
        const near = r => crew.includes(o) || !cl.focus.points.length || cl.focus.points.some(f => Math.hypot(f.x - r[1], f.z - r[2]) <= opt.relayReach);
        const p = [...g.p.values()].filter(near), c = [...g.c.values()].filter(near);
        if (p.length || c.length) out.push({ o, at: g.at, p, c });
      }
      if (out.length) { stats.relayed++; cl.send({ type: 'rel', at: now, g: out }); }
    }
  }
  function said(cl, id, d) {
    const was = lines.get(id);
    if (was !== undefined && d - was < LINE_DAYS) stats.dupes++;
    lines.set(id, d);
    if (lines.size > MAX_LINES) for (const [k, v] of lines) { if (dayNow() - v >= LINE_DAYS) lines.delete(k); }
    for (const c of online()) if (c !== cl) c.send({ type: 'said', id, d });
  }
  const linesNow = () => { const day = dayNow(), out = []; for (const [id, d] of lines) if (day - d < LINE_DAYS) out.push([id, d]); return out; };
  /** Where this player's people are, for a page that has just loaded: how it picks up where it left off. */
  const holdsOf = cl => {
    const s = sim.state;
    return { people: heldBy(cl).map(id => { const h = s.people[id].hold; return { who: id, as: h.kind, x: h.x, z: h.z, h: h.h, lv: h.lv ?? 0, car: h.car, seat: h.seat, ride: h.ride ?? -1 }; }), cars: s.live.filter(r => r.owner === cl.id).map(r => ({ id: r.id, model: r.model, car: r.car, x: r.x, z: r.z, yaw: r.yaw, v: r.v, seats: r.seats, driver: r.driver })) };
  };

  function hello(cl) {
    driver.addClient(cl.send, { busy: cl.busy, focus: () => cl.focus });
    cl.send({ type: 'ready', roster: driver.roster(), caughtUp: 0, you: cl.id, hash: sim.hash(), t: sim.t, at: now, room: view(), lines: linesNow(), holds: holdsOf(cl), host: isHost(cl), code: settings.code ?? null });
    driver.stepNow(0);
  }

  const room = {
    sim, driver, stats, seats, parties,
    get clients() { return online().length; },
    get players() { return [...seats.values()].filter(c => !c.gone).length; },
    get settings() { return settings; },
    get lastInput() { return lastInput; },
    get closed() { return !!room.closing; },
    hash: () => sim.hash(),
    set(next) { settings = { ...settings, ...next }; },
    /** Claim a seat. Same token, same seat: that is all a reconnect is. Null if the room is full or they were removed; `refused` says why. */
    join(sendFn, { token = null, name = '', busy = null, close = null, account = null } = {}) {
      let cl = token ? [...seats.values()].find(c => c.token === token) : null;
      if (cl?.banned) { sendFn({ type: 'refused', why: 'removed' }); return null; }
      if (!cl) {
        if (room.players >= opt.maxPlayers) { sendFn({ type: 'refused', why: 'full' }); return null; }
        cl = { heavy: createBucket(LIMITS.heavyPerSecond, LIMITS.heavyPerSecond * 2), lines: createBucket(LIMITS.saidPerSecond, LIMITS.saidPerSecond * 2), id: `p${nextSeat++}`, token, name: cleanName(name) || `Player ${nextSeat - 1}`, host: !seats.size, perms: { ...settings.defaults }, party: 0, own: new Set(), brought: false, focus: { points: [], party: [] }, playing: false, online: false, send: null, busy: null, close: null, last: now, account };
        if (cl.host) cl.perms = Object.fromEntries(PERMS.map(k => [k, true]));
        seats.set(cl.id, cl);
        newParty(cl);
        if (agreed || skipping) { agreed = 0; skipping = false; applySpeed(); }       // they did not agree to that
      } else if (cl.online) { driver.removeClient(cl.send); cl.send({ type: 'closed', why: 'elsewhere' }); cl.close?.(); }       // the same player on a new socket: the old one is finished
      cl.online = true; cl.gone = false; cl.send = sendFn; cl.busy = busy; cl.close = close; cl.last = now; if (name) cl.name = cleanName(name) || cl.name;
      if (!parties.has(cl.party)) newParty(cl);
      for (const q of parties.values()) leaderHere(q);
      hello(cl);
      sendView(true);
      return cl.id;
    },
    /** The socket went. The seat, the party and everyone they play wait for `grace`. A car stops: nobody is at the wheel any more. */
    drop(id, at = now, sendFn = null) {
      const cl = seats.get(id);
      if (!cl?.online || (sendFn && cl.send !== sendFn)) return;
      cl.online = false; cl.last = at;
      driver.removeClient(cl.send);
      const cars = sim.state.live.filter(r => r.owner === id).map(r => [r.id, r.x, r.z, r.yaw, 0]);
      if (cars.length) driver.command({ kind: 'pos', cars, owner: id });
      for (const r of sim.state.live) if (r.owner === id) lastCar.delete(r.id);
      for (const [n, y] of yields) if (y.from === id) finish(n);
      for (const q of parties.values()) leaderHere(q);
      if (vote) { if (!online().length) vote = null; else checkVote(); }
      mergeFocus();
      sendView(true);
    },
    /** They meant it: everyone they were playing goes back to the town at once. The seat stays for if they come back. */
    leave(id) {
      const cl = seats.get(id);
      if (!cl) return;
      if (cl.online) room.drop(id);
      cl.gone = true; cl.playing = false;
      driver.command({ kind: 'release', owner: id });
      mergeFocus();
      clockHeld();
      sendView(true);
    },
    message(id, raw, at) {
      if (at !== undefined) now = at;
      const cl = seats.get(id);
      if (!cl?.online) return;
      const msg = cleanMessage(raw);
      if (!msg) { stats.bad++; return false; }
      if (msg.type === 'ping') { cl.send({ type: 'pong', t: msg.t, at: now }); return true; }
      if (msg.type !== 'cmd' || msg.cmd?.kind !== 'focus') lastInput = now;
      if (HEAVY.has(msg.type) && !cl.heavy.take(now)) { stats.bad++; return false; }      // these build whole answers: a page asks about once a second
      switch (msg.type) {
        case 'cmd': {
          const cmd = cleanCommand(msg.cmd, { dev: opt.dev });
          if (!cmd) { stats.bad++; return false; }
          if (cmd.kind === 'focus') { cl.focus = { points: cmd.points ?? [], party: cmd.party ?? [] }; mergeFocus(); return true; }
          const why = gate(cl, cmd);
          if (why) return deny(cl, cmd, why);
          if (cmd.kind === 'pos') relay(cl, cmd);
          driver.command(stamp(cl, cmd));
          if (cmd.kind === 'release' || cmd.kind === 'take') nextPump(mergeFocus);
          break;
        }
        case 'control': cl.playing = msg.on; clockHeld(); break;
        case 'inspect': cl.send({ type: 'inspected', person: driver.inspect(msg.id) }); break;
        case 'phone': cl.send({ type: 'phoned', phone: driver.phone(msg.household, msg.who) }); break;
        case 'facts': cl.send({ type: 'facts', facts: driver.facts(msg.a, msg.b) }); break;
        case 'health': cl.send(health(msg.id)); break;
        case 'save': if (!isHost(cl) && !opt.dev) return deny(cl, msg, 'host'); cl.send({ type: 'saved', id: msg.id, text: sim.save(msg.now ?? null), hash: sim.hash() }); break;
        case 'resend': driver.resendTo(cl.send); break;
        case 'name': cl.name = cleanName(msg.name) || cl.name; sendView(true); break;
        case 'perm': {
          if (!isHost(cl)) return deny(cl, msg, 'host');
          const t = seats.get(msg.to);
          if (!t || !PERMS.includes(msg.key) || t.host) return deny(cl, msg, 'no such player');
          t.perms = { ...t.perms, [msg.key]: msg.on };
          sendView(true);
          break;
        }
        case 'setRoom':
          if (!isHost(cl) && !cl.perms.settings) return deny(cl, msg, 'settings');
          if (msg.public !== undefined) settings.public = msg.public;
          if (msg.name) settings.name = cleanName(msg.name) || settings.name;
          if (msg.defaults && isHost(cl)) settings.defaults = Object.fromEntries(PERMS.map(k => [k, !!msg.defaults[k]]));
          sendView(true);
          break;
        case 'kick': {
          if (!isHost(cl)) return deny(cl, msg, 'host');
          const t = seats.get(msg.to);
          if (!t || t === cl || t.host) return deny(cl, msg, 'no such player');
          t.banned = true;
          if (t.online) { t.send({ type: 'closed', why: 'removed' }); t.close?.(); }
          room.leave(t.id);
          outOfParty(t);
          sendView(true);
          break;
        }
        case 'partyInvite': case 'partyAsk': {
          const t = seats.get(msg.to), ask = msg.type === 'partyAsk', q = ask ? partyOf(t ?? {}) : partyOf(cl);
          if (!t || t === cl || !q) return deny(cl, msg, 'no such player');
          if (q.members.includes(ask ? cl.id : t.id)) return deny(cl, msg, 'already in');
          const lead = ask ? q.leader : t.id;
          offers.set(`${cl.id}>${lead}`, { from: cl.id, to: lead, ask, party: q.id, until: now + opt.offerMs });
          sendView(true);
          break;
        }
        case 'partyAnswer': {
          const o = offers.get(`${msg.from}>${cl.id}`);
          if (!o) return deny(cl, msg, 'no offer');
          offers.delete(`${msg.from}>${cl.id}`);
          if (msg.yes) { const q = parties.get(o.party); if (q) intoParty(o.ask ? seats.get(o.from) : cl, q); }
          sendView(true);
          break;
        }
        case 'partyLeave': case 'partySplit': {
          const q = partyOf(cl);
          if (!q || q.members.length < 2) return deny(cl, msg, 'alone');
          if (msg.type === 'partyLeave') giveBack(cl);          // leave: what is the party's stays with the party. Split: you keep who you are playing, and start your own
          outOfParty(cl); newParty(cl);
          sendView(true);
          break;
        }
        case 'takeback': {
          const q = partyOf(cl), p = sim.state.people[msg.who], from = p?.hold ? seats.get(p.hold.owner) : null;
          if (!q || q.leader !== cl.id) return deny(cl, msg, 'not leader');
          if (!from || from === cl || !q.members.includes(from.id)) return deny(cl, msg, 'not in your party');
          handOver({ who: msg.who, from: from.id, to: cl.id, as: 'you' });
          break;
        }
        case 'yielded': if (yields.get(msg.n)?.from === cl.id) finish(msg.n); break;
        case 'give': {
          const q = partyOf(cl), p = sim.state.people[msg.who], to = seats.get(msg.to);
          if (!q || q.leader !== cl.id) return deny(cl, msg, 'not leader');
          if (p?.hold?.owner !== cl.id || !to?.online || !q.members.includes(to.id)) return deny(cl, msg, 'not in your party');
          handOver({ who: msg.who, from: cl.id, to: to.id, as: frontOf(to) >= 0 ? 'party' : 'you' });
          break;
        }
        case 'vote': startVote(cl, msg.what); break;
        case 'voteAnswer':
          if (!vote) break;
          if (msg.yes) { vote.yes.add(cl.id); checkVote(); } else endVote('vote.no');
          break;
        case 'said': if (cl.lines.take(now)) said(cl, msg.id, msg.d); break;
        case 'bye': room.leave(id); cl.close?.(); break;
        case 'takeHome': {
          if (!cl.host) return deny(cl, msg, 'host');
          room.closing = true;
          const text = sim.save(null), hash = sim.hash();
          for (const c of online()) if (c !== cl) { c.send({ type: 'closed', why: 'home', by: cl.name }); c.close?.(); }
          cl.send({ type: 'home', text, hash, lines: linesNow() });
          break;
        }
        default: break;      // `speed`, `turbo`, `step`: a room's clock is not the client's to set (PLAN rule 1)
      }
      return true;
    },
    pump(nowMs) {
      now = nowMs;
      for (const fn of later.splice(0)) fn();
      const n = driver.pump(nowMs);
      if (sim.t - watched >= sim.clock.ticks(60)) { watched = sim.t; watch.check(); }
      for (const [k, y] of yields) if (now >= y.until) finish(k);
      for (const [k, o] of offers) if (now >= o.until) offers.delete(k);
      if (vote && now >= vote.until) endVote('vote.no');
      if (skipping) { const m = sim.clock.minute(sim.t); if (m >= MORNING && m < NIGHT_FROM) { skipping = false; applySpeed(); everyone({ type: 'note', text: 'morning' }); } }
      for (const cl of seats.values()) {
        if (cl.online || cl.gone || now - cl.last < opt.grace || !heldBy(cl).length) continue;
        driver.command({ kind: 'release', owner: cl.id });       // too long: the town takes them back. The seat stays
        for (const q of parties.values()) leaderHere(q);
        later.push(mergeFocus);
      }
      if (now - relayAt >= opt.relayMs) { relayAt = now; flushRelay(); }
      if (now - viewAt >= opt.viewMs) { viewAt = now; clockHeld(); sendView(); }
      return n;
    },
    /** Everything to close this room and open it again later. */
    dump(at = now) {
      return { text: sim.save(at), meta: { settings, nextSeat, nextParty, seats: [...seats.values()].filter(c => !c.gone || c.host).map(c => ({ id: c.id, token: c.token, name: c.name, host: c.host, perms: c.perms, party: c.party, own: [...c.own], brought: c.brought, banned: c.banned, account: c.account })), parties: [...parties.values()], lines: linesNow() } };
    },
    /** How much a page should be told, for /status. */
    summary: () => ({ name: settings.name, public: settings.public, players: online().length, seats: room.players, day: sim.clock.day(sim.t) }),
  };
  const later = [];
  const nextPump = fn => later.push(fn);
  driver.tap = events => {
    for (const e of events) if (e.kind === 'person.added' && seats.has(e.owner) && !seats.get(e.owner).host) seats.get(e.owner).own.add(e.row.id);
  };
  return room;
}
