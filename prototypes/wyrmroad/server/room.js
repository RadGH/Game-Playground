// One online room: up to 4 heroes (one per device) playing the host's chapters together. Pure — no sockets, no timers:
// the hub hands it messages and calls step() 60 times a second; tests drive it with fake sockets and a fake clock.
//
// Phases: lobby (the host picks a chapter from the host's own unlocked list) → ready (a ready check, at most 25 s) →
// intro (the chapter's story scene on every device; everyone presses skip, at most 60 s) → play (every device loads
// the street, then the server runs the brawl and sends snapshots + events) → outro (won: the closing scene; the last
// chapter's choice is the host's) or lost (the host picks: again from the last fight, or back to the room) → results
// → lobby. Drop out: a lost connection keeps its seat 90 s while a bot plays the hero; back with the same token, the
// same hero and seat. Leaving, being removed or staying away too long takes the hero out. Join mid-chapter: you watch
// and your hero walks in at the start of the next fight. Host leaves → the next person is host.
import { cleanHero, cleanName, unpackInput, mergePresses, clearPresses, MAX_SEATS, AWAY_MS, READY_MS, SCENE_MS, RESULTS_MS, SNAP_EVERY } from '../js/net/protocol.js';
import { createPacker, packEvents } from '../js/net/snap.js';
import { createBrawl, step as stepBrawl, addHero } from '../js/sim/brawl.js';

export const TIMES = { EMPTY_MS: 60000, LOAD_MS: 30000 };
const QUEUE_MAX = 4;                        // more waiting inputs than this are used together (presses kept)
const OWED_MAX = 8;                         // a line this late stands in the last input this many steps, then stands still

export function createRoom({ code, now = () => Date.now(), seed = 1, data, T, log = () => {}, clock = () => performance.now() }) {
  const seats = [];
  const kicked = new Set();
  const opts = { public: false };
  const CH = data.chapters.chapters;
  let phase = 'lobby', pick = null, until = 0, scene = null, G = null, packer = null, tick = 0, loading = false, loadUntil = 0;
  let emptySince = null, nextPid = 1, seedN = seed, result = null, lostAt = null, ending = null, evBuf = [];
  const stats = { steps: 0, stepMs: 0, maxStepMs: 0, bytesOut: 0, msgs: 0 };

  const send = (seat, obj) => { if (!seat.send || seat.away) return; const d = typeof obj === 'string' ? obj : JSON.stringify(obj); stats.bytesOut += d.length; stats.msgs++; seat.send(d); };
  const all = obj => { const d = JSON.stringify(obj); for (const s of seats) send(s, d); };
  const hostSeat = () => seats.find(s => s.host);
  const here = () => seats.filter(s => !s.away);
  const heroOf = s => G?.heroes.find(h => h.pid === s.pid && h.state !== 'gone') || null;
  const chIndex = id => CH.findIndex(c => c.id === id);
  const reachOf = s => s?.hero ? s.hero.reached : 0;

  function seatView(s) {
    const h = s.hero;
    return { pid: s.pid, name: s.name, ready: s.ready, host: s.host, away: s.away, votes: s.votes.size, skip: s.skip, inGame: !!heroOf(s), waiting: !!s.dropIn,
      hero: h ? { cls: h.cls, level: heroOf(s)?.level ?? h.level, look: h.look, gear: h.gear } : null };
  }
  function roomMsg(seat) {
    return { t: 'room', code, phase, you: seat.pid, host: hostSeat()?.pid || null, public: opts.public, pick,
      pickable: CH.slice(0, reachOf(hostSeat()) + 1).map(c => c.id), left: until ? Math.max(0, Math.round((until - now()) / 1000)) : null,
      scene, result, lost: lostAt, seats: seats.map(seatView) };
  }
  const announce = () => { for (const s of seats) send(s, roomMsg(s)); };

  // ---- seats -------------------------------------------------------------------------------------------------
  function join({ token, send: sendFn }) {
    if (kicked.has(token)) { sendFn(JSON.stringify({ t: 'err', code: 'kicked', msg: 'You were removed from this room.' })); return null; }
    let seat = seats.find(s => s.token === token);
    if (seat) {
      seat.send = sendFn; seat.away = false; seat.awayAt = 0;
      const h = heroOf(seat); if (h) h.ctrl = 'player';                 // back: the bot hands the hero back
      log('room.back', { code, pid: seat.pid });
    } else {
      if (seats.length >= MAX_SEATS) { sendFn(JSON.stringify({ t: 'err', code: 'full', msg: 'That room is full (4 heroes).' })); return null; }
      seat = { pid: 'p' + (nextPid++), token, name: 'Hero', hero: null, ready: false, host: !seats.length, away: false, awayAt: 0, send: sendFn,
        loaded: false, inputs: [], last: null, ack: 0, lastSeq: 0, owed: 0, missed: 0, carry: {}, win: 0, minQ: 99, needFull: false, votes: new Set(), skip: false, dropIn: false };
      seats.push(seat);
      log('room.join', { code, pid: seat.pid });
    }
    emptySince = null;
    send(seat, roomMsg(seat));
    if (phase === 'intro' || phase === 'outro') send(seat, { t: 'scene', id: scene.id, kind: scene.kind, until: until - now() });
    if (phase === 'play' && seat.hero) sendStart(seat);
    announce();
    return { id: seat.pid };
  }

  function heroLeaves(seat) {
    const h = heroOf(seat); if (!h) return;
    if (h.state === 'grab') { const o = G.foes.find(f => f.id === h.grab); if (o && o.state === 'held') { o.state = 'hurt'; o.stunT = 0.2; o.heldBy = null; } h.grab = null; }
    if (h.state === 'held') { const g = G.foes.find(f => f.id === h.heldBy); if (g) { g.grabbing = null; g.state = 'idle'; } }
    h.state = 'gone'; h.ctrl = 'bot'; h.hp = 0; h.left = true;
    evBuf.push({ type: 'gone', id: h.id, pid: h.pid, left: true });
  }
  function dropSeat(seat, why) {
    const i = seats.indexOf(seat); if (i < 0) return;
    seats.splice(i, 1);
    if (G) heroLeaves(seat);
    if (seat.host && seats.length) { const next = seats.find(s => !s.away) || seats[0]; next.host = true; log('room.host', { code, pid: next.pid }); keepPickValid(); }
    for (const s of seats) s.votes.delete(seat.pid);
    log('room.leave', { code, pid: seat.pid, why });
    if (!seats.length) emptySince = now();
    announce();
  }
  function remove(dev) { const s = seats.find(x => x.pid === dev.id); if (s) dropSeat(s, 'left'); }
  function disconnect(dev) {
    const s = seats.find(x => x.pid === dev.id); if (!s) return;
    s.away = true; s.awayAt = now(); s.send = null; s.loaded = false;
    const h = heroOf(s); if (h) h.ctrl = 'bot';                         // a bot plays the hero while they're gone
    if (!seats.some(x => !x.away)) emptySince = now();
    log('room.away', { code, pid: s.pid });
    announce();
  }
  function keepPickValid() {
    const max = reachOf(hostSeat());
    if (pick == null || chIndex(pick) > max) pick = CH[Math.min(max, CH.length - 1)].id;
  }

  // ---- messages ----------------------------------------------------------------------------------------------
  function message(dev, msg) {
    const seat = seats.find(x => x.pid === dev.id); if (!seat) return;
    const isHost = seat.host;
    switch (msg.t) {
      case 'me': {
        if (phase !== 'lobby' && phase !== 'results' && seat.hero && !seat.dropIn) return send(seat, { t: 'err', code: 'busy', msg: 'Change heroes back in the room.' });
        const h = cleanHero(data, msg.hero);
        if (h.error) return send(seat, { t: 'err', code: 'hero', msg: h.error });
        seat.hero = h; seat.name = cleanName(h.name) || seat.name;
        if (isHost) keepPickValid();
        if (phase === 'play' && !heroOf(seat)) { seat.dropIn = true; sendStart(seat); }
        return announce();
      }
      case 'opt': if (isHost && msg.key === 'public') { opts.public = msg.value; announce(); } return;
      case 'pick': {
        if (!isHost || phase !== 'lobby') return;
        const i = chIndex(msg.chapter);
        if (i < 0 || i > reachOf(seat)) return send(seat, { t: 'err', code: 'pick', msg: 'That chapter is not open for you yet.' });
        pick = msg.chapter; for (const s of seats) s.ready = false;
        return announce();
      }
      case 'start': {
        if (!isHost || phase !== 'lobby') return;
        keepPickValid();
        if (!seat.hero) return send(seat, { t: 'err', code: 'hero', msg: 'Bring a hero first.' });
        // whoever already said Ready in the room stays ready: everyone ready → straight on; else a 25 s ready check
        phase = 'ready'; until = now() + READY_MS; seat.ready = true;
        log('room.ready', { code, chapter: pick });
        announce();
        return checkReady();
      }
      case 'ready': {
        if (phase === 'ready' || phase === 'lobby') { seat.ready = msg.on && !!seat.hero; announce(); return checkReady(); }
        if (phase === 'intro' || phase === 'outro') { if (scene?.choice && !isHost) return; seat.skip = msg.on; announce(); return checkSkip(); }
        return;
      }
      case 'ending': return choose(dev, msg.id);
      case 'loaded': {
        if (phase !== 'play' || seat.loaded) return;
        seat.loaded = true; seat.needFull = true;
        const h = heroOf(seat); if (h && !seat.away) h.ctrl = 'player';
        return announce();
      }
      case 'in': {
        if (phase !== 'play' || !heroOf(seat)) return;
        for (let j = 0; j < msg.i.length; j++) {
          const sq = msg.s + j; if (sq <= seat.lastSeq) continue;
          const inp = unpackInput(msg.i[j]); if (!inp) return;
          seat.lastSeq = sq; seat.inputs.push([sq, inp]);
        }
        while (seat.inputs.length > 30) { const [, old] = seat.inputs.shift(); mergePresses(seat.carry, old); }
        return;
      }
      case 'retry': {
        if (!isHost || phase !== 'lost') return;
        if (msg.on) return launch(lostAt?.section ?? 0, true);
        return finish('lost');
      }
      case 'back': if (isHost && phase === 'results') toLobby(); return;
      case 'end': if (isHost && phase !== 'lobby' && phase !== 'results') { all({ t: 'ended', why: 'The host called everyone back to the room.' }); toLobby(); } return;
      case 'kick': { const t = seats.find(s => s.pid === msg.pid); if (t && t !== seat && isHost) kick(t); return; }
      case 'vote': {
        const t = seats.find(s => s.pid === msg.pid); if (!t || t === seat) return;
        t.votes.add(seat.pid);
        const voters = seats.filter(s => s !== t && !s.away).length;
        if (t.votes.size * 2 > voters) return kick(t);
        return announce();
      }
      case 'host': {
        const t = seats.find(s => s.pid === msg.pid); if (!t || t === seat || !isHost) return;
        seat.host = false; t.host = true; keepPickValid(); log('room.host', { code, pid: t.pid, passed: true });
        return announce();
      }
    }
  }
  /** The ending choice (last chapter): only the host picks; everyone then sees that ending. */
  function choose(dev, id) {
    const seat = seats.find(x => x.pid === dev.id); if (!seat?.host || phase !== 'outro' || !scene?.choice) return;
    const opt = scene.choice.options.find(o => o.id === id); if (!opt) return;
    ending = opt.id; showScene(opt.scene, 'outro');
  }
  function kick(t) { kicked.add(t.token); send(t, { t: 'kicked', msg: 'You were removed from the room.' }); dropSeat(t, 'kicked'); }

  // ---- ready check, scenes ----------------------------------------------------------------------------------
  function checkReady() {
    if (phase !== 'ready') return;
    const people = seats.filter(s => s.hero && !s.away);
    if (people.length && people.every(s => s.ready)) afterReady();
  }
  function afterReady() {
    const ch = CH[chIndex(pick)];
    if (ch.intro && data.story.scenes[ch.intro]) showScene(ch.intro, 'intro'); else launch(0, false);
  }
  function showScene(id, kind) {
    const sc = data.story.scenes[id];
    phase = kind; until = now() + SCENE_MS; for (const s of seats) s.skip = false;
    scene = { id, kind, choice: !!sc?.choice && !ending ? sc.choice : null };
    all({ t: 'scene', id, kind, until: SCENE_MS });
    announce();
  }
  function checkSkip() {
    if (phase !== 'intro' && phase !== 'outro') return;
    if (scene?.choice) return;                       // the host's choice ends this one
    const people = here();
    if (people.length && people.every(s => s.skip)) afterScene();
  }
  function afterScene() {
    if (phase === 'intro') return launch(0, false);
    if (scene?.choice) { const opt = scene.choice.options[0]; ending = opt.id; return showScene(opt.scene, 'outro'); }   // nobody chose in time: the first ending
    finish('won');
  }

  // ---- a chapter ---------------------------------------------------------------------------------------------
  function heroSpec(s, carry) {
    const h = s.hero, was = carry?.find(x => x.pid === s.pid);
    return { pid: s.pid, name: s.name, cls: h.cls, level: was?.level ?? h.level, xp: was?.xp ?? h.xp, gear: h.gear, spells: h.spells, look: h.look, ctrl: s.away ? 'bot' : 'player' };
  }
  function sendStart(seat) {
    if (!G) return;
    const h = heroOf(seat);
    seat.loaded = false;
    send(seat, { t: 'start', chapter: G.ch.id, section: G.secI, seed: G.seed, you: seat.pid, heroId: h?.id ?? null, code, dropIn: !h,
      roster: G.heroes.filter(x => x.state !== 'gone').map(x => ({ pid: x.pid, id: x.id, name: x.name, cls: x.cls, level: x.level })),
      snap: packer.pack(G, { full: true, step: tick }) });                // the street as it is now, so the screen has everyone from the start
  }
  function launch(section, retry) {
    const carry = retry && G ? G.heroes.map(h => ({ pid: h.pid, level: h.level, xp: h.xp })) : null;
    const heroes = seats.filter(s => s.hero).map(s => heroSpec(s, carry));
    seedN = (Math.imul(seedN, 1664525) + 1013904223) >>> 0;
    G = createBrawl({ data, T, chapter: pick, heroes, seed: seedN % 1e9, section });
    G.startSection = section;
    packer = createPacker(); tick = 0; evBuf = []; result = null; lostAt = null; scene = null; until = 0; if (!retry) ending = null;
    for (const s of seats) { s.inputs = []; s.last = null; s.ack = 0; s.lastSeq = 0; s.owed = 0; s.missed = 0; s.carry = {}; s.skip = false; s.ready = false; s.dropIn = false; s.levelUps = 0; }
    phase = 'play'; loading = true; loadUntil = now() + TIMES.LOAD_MS;
    log('room.launch', { code, chapter: pick, section, heroes: heroes.length, retry: !!retry });
    for (const s of seats) if (s.hero) sendStart(s);
    announce();
  }
  function toLobby() {
    phase = 'lobby'; G = null; packer = null; scene = null; until = 0; result = null; lostAt = null; loading = false;
    for (const s of seats) { s.loaded = false; s.ready = false; s.skip = false; s.dropIn = false; }
    announce();
  }
  /** The chapter is over: everyone's own share, then the results screen. */
  function finish(outcome) {
    const g = G;
    result = { outcome, chapter: g.ch.id, name: g.ch.name, time: Math.round(g.stats.time), kills: g.stats.kills, ending: outcome === 'won' ? ending : null,
      next: outcome === 'won' ? (CH[chIndex(g.ch.id) + 1]?.id ?? null) : null,
      players: g.heroes.filter(h => !h.left).map(h => ({ pid: h.pid, name: h.name, cls: h.cls, level: h.level, xp: h.xp, xpGained: h.xpGained, gold: h.gold, kills: h.kills, lives: h.lives })) };
    phase = 'results'; until = now() + RESULTS_MS; scene = null;
    log('room.result', { code, outcome, chapter: g.ch.id, time: result.time });
    all({ t: 'result', result });
    announce();
  }
  function chapterOver() {
    const ch = G.ch;
    if (G.outcome === 'won') {
      all({ t: 'over', outcome: 'won' });
      if (ch.outro && data.story.scenes[ch.outro]) showScene(ch.outro, 'outro'); else finish('won');
    } else {
      lostAt = { section: G.secI, label: `Fight ${G.secI + 1} of ${ch.sections.length}` };
      phase = 'lost'; until = 0;
      all({ t: 'over', outcome: 'lost' });
      log('room.lost', { code, chapter: ch.id, section: G.secI });
      announce();
    }
  }

  /** One input per hero per step. A late input is stood in for by the last one ("owed") and counted as used when it
   *  arrives, so the server and the browser's prediction agree on how far the hero walked. Presses are never lost:
   *  inputs used together, skipped as owed, or trimmed keep their presses for the next input used (`carry`). */
  function inputFor(s) {
    while (s.owed > 0 && s.inputs.length) { const [seq, inp] = s.inputs.shift(); s.ack = seq; s.owed--; mergePresses(s.carry, inp); }
    let use = null;
    if (s.inputs.length) {
      const [seq, inp] = s.inputs.shift(); use = inp; s.ack = seq;
      while (s.inputs.length > QUEUE_MAX) { const [sq, more] = s.inputs.shift(); use = mergePresses(more, use); s.ack = sq; }
    }
    // a line that stays bunched up (never under 2 waiting for a whole second) is a delay nobody needs: catch up a step
    s.minQ = Math.min(s.minQ ?? 99, s.inputs.length);
    if (++s.win >= 60) { if (s.minQ >= 2 && use) { const [sq, more] = s.inputs.shift(); use = mergePresses(more, use); s.ack = sq; s.trims = (s.trims || 0) + 1; } s.win = 0; s.minQ = 99; }
    if (use) { s.missed = 0; s.last = clearPresses(use); }
    else { s.missed++; if (s.missed <= OWED_MAX && s.last) { use = { ...s.last }; s.owed++; } else { use = { mx: 0, mz: 0 }; s.owed = 0; } }
    mergePresses(use, s.carry); s.carry = {};
    return use;
  }

  function step() {
    const t = now();
    for (const s of [...seats]) if (s.away && t - s.awayAt > (phase === 'play' || phase === 'lost' ? AWAY_MS.play : AWAY_MS.lobby)) dropSeat(s, 'away');
    if (phase === 'ready' && t > until) afterReady();
    if ((phase === 'intro' || phase === 'outro') && t > until) afterScene();
    if (phase === 'results' && t > until) toLobby();
    if (phase !== 'play') return;
    if (loading) {
      const inGame = seats.filter(s => heroOf(s) && !s.away);
      if (inGame.every(s => s.loaded) || t > loadUntil) { loading = false; announce(); } else return;
    }
    const t0 = clock();
    const inputs = {};
    for (const s of seats) { const h = heroOf(s); if (h && h.ctrl !== 'bot') { stats.qSum = (stats.qSum || 0) + s.inputs.length; stats.qN = (stats.qN || 0) + 1; inputs[s.pid] = inputFor(s); } }
    stepBrawl(G, inputs);
    tick++; stats.steps++;
    let fight = false;
    for (const e of G.events) { evBuf.push(e); if (e.type === 'fight') fight = true; }
    // someone who joined mid-chapter walks in as the fight starts
    if (fight) for (const s of seats) if (s.dropIn && s.hero && !heroOf(s)) {
      const h = addHero(G, heroSpec(s, null), G.heroes.length);
      h.ctrl = s.away ? 'bot' : 'player'; s.dropIn = false;
      evBuf.push({ type: 'respawn', id: h.id, pid: s.pid, joined: true });
      log('room.dropin', { code, pid: s.pid });
      send(s, { t: 'joined', heroId: h.id }); announce();
    }
    const ms = clock() - t0; stats.stepMs += ms; if (ms > stats.maxStepMs) stats.maxStepMs = ms;
    // events: every step (each player gets their own loot only), snapshots every SNAP_EVERY steps
    if (evBuf.length) {
      const ev = packEvents(evBuf); evBuf = [];
      for (const s of seats) {
        if (!s.loaded || s.away) continue;
        const mine = ev.filter(e => e.type !== 'loot' || e.pid === s.pid);
        if (mine.length) send(s, { t: 'e', k: tick, ev: mine });
      }
    }
    if (tick % SNAP_EVERY === 0 || G.over || seats.some(s => s.needFull && s.loaded)) {
      const body = JSON.stringify(packer.pack(G, { step: tick })).slice(1);
      let full = null;
      for (const s of seats) {
        if (!s.loaded || s.away) continue;
        if (s.needFull) { full ||= JSON.stringify(packer.pack(G, { full: true, step: tick })).slice(1); send(s, `{"t":"s","a":${s.ack},${full}`); s.needFull = false; }
        else send(s, `{"t":"s","a":${s.ack},${body}`);
      }
    }
    if (G.over) chapterOver();
  }

  function listing() {
    if (!opts.public) return null;
    const ch = pick && CH[chIndex(pick)];
    return { code, host: hostSeat()?.name || '', players: seats.length, seats: MAX_SEATS, phase, chapter: ch ? ch.name : null, chapterNo: ch ? chIndex(pick) + 1 : null };
  }
  return {
    join, remove, disconnect, message, choose, step, listing, kick,
    close(why = 'closed') { for (const s of seats) send(s, { t: 'closed', why }); seats.length = 0; },
    get size() { return seats.length; },
    get emptyFor() { return seats.some(s => !s.away) ? 0 : emptySince ? now() - emptySince : 0; },
    get phase() { return phase; }, get G() { return G; }, get loading() { return loading; }, get pick() { return pick; },
    code, opts, seats, stats, devices: { has: id => seats.some(s => s.pid === id) },
  };
}
