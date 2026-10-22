// One room: the people in it, the lobby, and a whole match from the first dice roll to the coin payout.
// The server owns one of these per room code and calls tick() twenty times a second; nothing here touches a socket
// or a clock directly (members carry a `send`, time comes in through `now()`), so the tests play whole matches in
// memory on a pretend clock.
//
// Phases:  lobby -> [ board -> vote -> intro -> game -> results ] x rounds -> final -> lobby
//          (the Minigame Marathon mode skips `board`)
import { MAX_SEATS, cleanName, IN } from '../shared/protocol.js';
import { DT, packBody } from '../shared/arena.js';
import { makeRng } from '../shared/rng.js';
import { GAMES, eligible } from '../games/index.js';
import { createBoardMatch, boardStandings } from './board.js';

export const TIMES = Object.freeze({ VOTE_MS: 10000, INTRO_MS: 7000, RESULTS_MS: 8000, FINAL_MS: 20000, GONE_LOBBY_MS: 15000, GONE_MATCH_MS: 90000, EMPTY_MS: 60000, GAME_GRACE_MS: 3000, BONUS_MS: 11000 });
export const OPTS = Object.freeze({
  mode: { values: ['board', 'marathon', 'endless'], def: 'board' },
  board: { values: ['fairground', 'pier'], def: 'fairground' },          // round 5: the Moonlit Pier
  teams: { values: [false, true], def: false },
  rounds: { min: 2, max: 8, def: 4 },
  shortlist: { min: 2, max: 4, def: 3 },
  difficulty: { values: ['easy', 'normal', 'hard'], def: 'normal' },
});
/** What a minigame placing is worth, best first. Board mode pays tickets, the marathon pays points. */
/** Endless: a 'keep going?' vote after every this many minigames; it gets harder every ENDLESS_STEP; never more than ENDLESS_MAX. */
export const ENDLESS = Object.freeze({ EVERY: 3, STEP: 3, MAX: 30 });
/** Teams: red + green against blue + pink (seat % 2). */
export const TEAM_NAMES = ['Red & Green', 'Blue & Pink'];
export const AWARDS = Object.freeze({ board: [10, 6, 3, 1], marathon: [4, 3, 2, 1], coopWin: { board: 6, marathon: 3 }, coopLose: { board: 2, marathon: 1 } });
/** Persistent coins at the end of a match (they buy costumes; they never help you win). */
export const PAYOUT = Object.freeze({ base: 10, perRibbon: 5, perPoint: 1, winner: 10, perGameWon: 2 });

export function createRoom({ code, now, seed = 1, data, profiles = null, log = () => {} }) {
  const rng = makeRng(seed);
  const members = new Map();          // pid -> member
  let nextPid = 1, hostPid = null, phase = 'lobby', until = 0, emptySince = null;
  const opts = { board: OPTS.board.def, mode: OPTS.mode.def, teams: OPTS.teams.def, rounds: OPTS.rounds.def, shortlist: OPTS.shortlist.def, difficulty: OPTS.difficulty.def, pool: [] };
  let match = null;                    // { mode, round, rounds, points, wins, played, board, lastGame }
  let vote = null, game = null, lastPhaseMsg = null, tickNo = 0;

  // ---------------------------------------------------------------- people
  const seated = () => [...members.values()].filter(m => m.seat != null).sort((a, b) => a.seat - b.seat);
  const active = () => seated().filter(m => m.connected);
  const freeSeat = () => { for (let s = 0; s < MAX_SEATS; s++) if (![...members.values()].some(m => m.seat === s)) return s; return null; };
  const pub = m => ({ pid: m.pid, name: m.name, look: m.look, costume: m.costume, seat: m.seat, ready: m.ready, on: m.connected, display: m.display, wait: m.seat == null && !m.display });
  const send = (m, obj) => { if (m.connected && m.send) m.send(JSON.stringify(obj)); };
  const cast = obj => { const s = JSON.stringify(obj); for (const m of members.values()) if (m.connected && m.send) m.send(s); };
  function roomMsg(m) {
    return { t: 'room', code, phase, host: hostPid, you: m.pid, opts, members: [...members.values()].map(pub),
      match: match ? { mode: match.mode, round: match.round, rounds: match.rounds, points: match.points, wins: match.wins, board: match.board ? match.board.view() : null, boardId: match.boardId || null } : null };
  }
  const syncRoom = () => { for (const m of members.values()) send(m, roomMsg(m)); };
  function setPhase(p, msg = {}, ms = 0) { phase = p; until = ms ? now() + ms : 0; lastPhaseMsg = { t: 'phase', phase: p, ms, ...msg }; syncRoom(); cast(lastPhaseMsg); }

  function join({ token, name, look, costume, send: sendFn, display = false }) {
    // the same person coming back (a refresh, a phone that slept): same seat, same score
    for (const m of members.values()) if (m.token === token && !display && !m.display) { m.send = sendFn; m.connected = true; m.goneAt = null; m.name = name; m.look = look; m.costume = costume; emptySince = null; resync(m); syncRoom(); return m; }
    const m = { pid: nextPid++, token, name, look, costume, send: sendFn, connected: true, goneAt: null, ready: false, display, seat: null, queue: [], lastIn: null, starve: 0, ack: 0, skip: false };
    if (!display && phase === 'lobby') m.seat = freeSeat();           // mid-match joiners watch until the next minigame
    members.set(m.pid, m); emptySince = null;
    if (hostPid == null || !members.has(hostPid)) hostPid = m.pid;
    resync(m); syncRoom();
    return m;
  }
  /** Everything a client needs to draw the present moment from nothing. */
  function resync(m) {
    send(m, roomMsg(m));
    if (phase === 'lobby') return;
    if (phase === 'game' && game) { send(m, { ...game.introMsg, phase: 'intro', ms: 0, init: game.inst.init(), b: bodiesOf(game.inst), resume: true }); }
    if (lastPhaseMsg) send(m, { ...lastPhaseMsg, ms: until ? Math.max(0, until - now()) : 0, ...(phase === 'vote' || phase === 'continue' ? { votes: vote?.votes || {} } : {}) });
    if (phase === 'game' && game?.inst.priv && m.seat != null) send(m, { t: 'gp', d: { ...game.inst.priv(m.pid), ...(game.inst.restore?.(m.pid) || {}) } });   // restore: what a returning phone had made (its drawing)
  }
  function disconnect(m) { if (!members.has(m.pid)) return; m.connected = false; m.send = null; m.goneAt = now(); m.queue.length = 0; if (m.display || m.seat == null) return remove(m); syncRoom(); pickHost(); }
  function remove(m) {
    if (!members.delete(m.pid)) return;
    if (match?.board && m.seat != null) match.board.dropPlayer(m.pid);
    if (game && m.seat != null) game.gone?.add(m.pid);
    pickHost(); syncRoom();
    if (![...members.values()].some(x => x.connected)) emptySince = emptySince ?? now();
  }
  function pickHost() {
    const h = members.get(hostPid);
    if (h && h.connected) return;
    const next = active()[0] || [...members.values()].find(m => m.connected && !m.display) || [...members.values()].find(m => m.connected);
    if (next && next.pid !== hostPid) { hostPid = next.pid; syncRoom(); }
  }
  /** Waiting players take free seats (called between minigames, never during one). */
  function promote() {
    let any = false;
    for (const m of members.values()) { if (m.seat != null || m.display || !m.connected) continue; const s = freeSeat(); if (s == null) break; m.seat = s; any = true;
      if (match) { match.points[m.pid] = 0; match.wins[m.pid] = 0; match.board?.addPlayer(m.pid); if (match.teams) match.teams[m.pid] = m.seat % 2; } }
    return any;
  }

  // ---------------------------------------------------------------- the match
  function startMatch(by) {
    if (phase !== 'lobby' || by.pid !== hostPid) return err(by, 'host', 'Only the host can start.');
    promote();
    const players = active();
    if (!players.length) return err(by, 'empty', 'Nobody is seated yet.');
    if (!eligible(players.length, opts.pool).length) return err(by, 'pool', 'No minigame in the chosen pool fits this many players.');
    if (opts.teams && players.length === 3) return err(by, 'teams', 'Teams need 2 or 4 players (red + green against blue + pink).');
    match = { mode: opts.mode, round: 0, rounds: opts.mode === 'endless' ? null : opts.rounds, points: {}, wins: {}, played: [], board: null, lastGame: null, teams: opts.teams ? {} : null };
    if (match.teams) for (const m of players) match.teams[m.pid] = m.seat % 2;
    for (const m of players) { match.points[m.pid] = 0; match.wins[m.pid] = 0; m.ready = false; }
    if (match.mode === 'board') {
      const names = new Proxy({}, { get: (_, pid) => members.get(+pid)?.name });
      match.boardId = data.boards[opts.board] ? opts.board : 'fairground';
      match.board = createBoardMatch({ def: data.boards[match.boardId], chance: data.chance, order: players.map(m => m.pid), rng: rng.fork(), names, emit: ev => cast({ t: 'bd', ...ev }) });
    }
    log('match', { code, mode: match.mode, players: players.length });
    nextRound();
  }
  function nextRound() {
    if (match.mode === 'endless') {
      if (match.round >= ENDLESS.MAX) return finish();
      if (match.round > 0 && match.round % ENDLESS.EVERY === 0 && !match.asked) { match.asked = true; vote = { options: ['keep', 'finish'], votes: {} }; return setPhase('continue', { round: match.round }, TIMES.VOTE_MS); }
      match.asked = false; match.round++; return startVote();
    }
    if (match.round >= match.rounds) return finish();
    match.round++;
    if (match.mode === 'board') { setPhase('board', { round: match.round, rounds: match.rounds }); match.board.beginRound(now(), match.round, match.rounds); }
    else startVote();
  }
  function startVote() {
    promote();
    const n = active().length || 1;
    let pool = eligible(n, opts.pool); if (!pool.length) pool = eligible(n);
    const fresh = pool.filter(id => !match.played.includes(id)), notLast = pool.filter(id => id !== match.lastGame);
    // unplayed games first, then anything but the one just played, then whatever is left
    const ranked = [...rng.shuffle(fresh), ...rng.shuffle(notLast.filter(id => !fresh.includes(id))), ...pool.filter(id => id === match.lastGame && !fresh.includes(id))];
    const options = ranked.slice(0, opts.shortlist);
    if (options.length <= 1) return startGame(options[0] || pool[0]);
    vote = { options, votes: {} };
    setPhase('vote', { options, round: match.round, rounds: match.rounds }, TIMES.VOTE_MS);
  }
  function endVote() {
    const tally = vote.options.map(() => 0);
    for (const i of Object.values(vote.votes)) tally[i]++;
    const best = Math.max(...tally), tied = tally.map((n, i) => (n === best ? i : -1)).filter(i => i >= 0);
    const pick = tied[Math.floor(rng() * tied.length)];
    const id = vote.options[pick]; vote = null;
    cast({ t: 'voted', pick, id, tally });
    startGame(id);
  }
  const bodiesOf = inst => { if (!inst.bodies) return null; const b = {}; for (const [pid, body] of inst.bodies) b[pid] = packBody(body, members.get(pid)?.ack || 0); return b; };
  function startGame(id) {
    const def = GAMES[id], players = active();
    const list = players.map(m => ({ pid: m.pid, seat: m.seat, name: m.name }));
    const difficulty = match.mode === 'endless' ? ['easy', 'normal', 'hard'][Math.min(2, Math.floor((match.round - 1) / ENDLESS.STEP))] : opts.difficulty;   // the endless fair gets harder
    const inst = def.create({ seed: Math.floor(rng() * 2 ** 31), rng: rng.fork(), players: list, difficulty });
    for (const m of members.values()) { m.queue.length = 0; m.lastIn = null; m.starve = 0; m.ack = 0; m.skip = false; }
    game = { id, def, inst, players: list.map(p => p.pid), started: false, endsAt: 0, lastState: '', lastPriv: new Map(), gone: new Set() };
    game.introMsg = { t: 'phase', phase: 'intro', game: id, players: list, round: match.round, rounds: match.rounds, difficulty };
    match.played.push(id); match.lastGame = id;
    setPhase('intro', { game: id, players: list, init: inst.init(), b: bodiesOf(inst), round: match.round, rounds: match.rounds, difficulty }, TIMES.INTRO_MS);
    if (inst.priv) for (const m of players) send(m, { t: 'gp', d: inst.priv(m.pid) });
  }
  function beginPlay() {
    game.started = true; game.endsAt = now() + game.def.meta.seconds * 1000 + TIMES.GAME_GRACE_MS;
    for (const m of members.values()) m.skip = false;
    setPhase('game', { game: game.id, seconds: game.def.meta.seconds });
  }
  function tickGame() {
    const { inst, def } = game, arena = def.meta.kind === 'arena';
    if (arena) for (const pid of game.players) {
      const m = members.get(pid); if (!m) { inst.input(pid, null); continue; }
      // Every input a phone sends is applied exactly once, in order, because the phone predicts its own character by
      // replaying those same inputs (play.js). A late phone simply waits (its character holds still for a tick or two)
      // and then catches up 3 a tick; the old "coast on the last input" applied movement the phone never predicted and
      // THEN the real inputs as well, so the player was moved twice and their own screen snapped forward.
      let n = 0; const cap = m.queue.length > 3 ? 3 : 2;
      while (m.queue.length && n < cap) { const inp = m.queue.shift(); inst.input(pid, inp); m.lastIn = inp; m.ack = inp.s; n++; }
      if (n) m.starve = 0;
      else if (++m.starve >= 8 || !m.connected) inst.input(pid, null);                  // gone for 0.4 s: stop
    }
    inst.step(DT);
    if (inst.events?.length) { for (const ev of inst.events) { if (ev.to != null) { const m = members.get(ev.to); if (m) send(m, { t: 'ge', ...ev, to: undefined }); } else cast({ t: 'ge', ...ev }); } inst.events.length = 0; }
    const g = inst.state();
    if (arena) {
      cast({ t: 's', k: tickNo, b: bodiesOf(inst), g });
    } else { const s = JSON.stringify(g); if (s !== game.lastState) { game.lastState = s; cast({ t: 's', k: tickNo, g }); } }
    if (inst.priv) for (const pid of game.players) { const m = members.get(pid); if (!m) continue; const s = JSON.stringify(inst.priv(pid)); if (s !== game.lastPriv.get(pid)) { game.lastPriv.set(pid, s); send(m, { t: 'gp', d: JSON.parse(s) }); } }
    if (inst.over || now() >= game.endsAt) endGame();
  }
  /** A game's result becomes tickets (board) or points (marathon). The game itself never touches the score. */
  function endGame() {
    const res = game.inst.result(), mode = match.mode, kind = mode === 'board' ? 'board' : 'marathon', table = AWARDS[kind], award = {};
    if (res.coop) for (const pid of game.players) award[pid] = (res.coop.success ? AWARDS.coopWin : AWARDS.coopLose)[kind];
    else { let place = 0; for (const group of res.order) { for (const pid of group) award[pid] = table[Math.min(place, table.length - 1)]; place += group.length; } }
    const alone = game.players.length === 1;
    for (const pid of game.players) {
      if (!(pid in match.points)) continue;
      if (mode === 'board') { award[pid] = (award[pid] || 0) * match.board.gameMul(); match.board.give(pid, award[pid], false); } else match.points[pid] += award[pid] || 0;
    }
    if (res.coop ? res.coop.success : !alone) for (const pid of (res.coop ? game.players : res.order[0] || [])) if (pid in match.wins) match.wins[pid]++;
    const msg = { game: game.id, result: res, award, unit: mode === 'board' ? 'tickets' : 'points', teams: teamTotals(), round: match.round, mul: mode === 'board' ? match.board.gameMul() : 1 };
    game = null;
    for (const m of members.values()) m.skip = false;
    setPhase('results', msg, TIMES.RESULTS_MS);
  }
  /** Each team's score so far (board: ribbons, then tickets; otherwise points), best first. null without teams. */
  function teamTotals() {
    if (!match?.teams) return null;
    const out = [0, 1].map(team => ({ team, name: TEAM_NAMES[team], pids: Object.keys(match.teams).map(Number).filter(pid => match.teams[pid] === team && members.has(pid)), points: 0, ribbons: 0, tickets: 0 }));
    for (const t of out) for (const pid of t.pids) { if (match.board) { t.ribbons += match.board.S.ribbons[pid] || 0; t.tickets += match.board.S.tickets[pid] || 0; } else t.points += match.points[pid] || 0; }
    out.sort((a, b) => b.ribbons - a.ribbons || b.tickets - a.tickets || b.points - a.points);
    out.forEach((t, i) => { const p = out[i - 1]; t.place = p && p.ribbons === t.ribbons && p.tickets === t.tickets && p.points === t.points ? p.place : i + 1; });
    return out.filter(t => t.pids.length);
  }
  function standings() {
    let rows;
    if (match.mode === 'board') rows = boardStandings(match.board.S).map(r => ({ ...r, wins: match.wins[r.pid] || 0 }));
    else {
      rows = Object.keys(match.points).map(Number).filter(pid => members.has(pid)).map(pid => ({ pid, points: match.points[pid], wins: match.wins[pid] || 0 })).sort((a, b) => b.points - a.points || b.wins - a.wins);
      rows.forEach((r, i) => { const p = rows[i - 1]; r.place = p && p.points === r.points && p.wins === r.wins ? p.place : i + 1; });
    }
    return rows;
  }
  function finish() {
    if (match.mode === 'board' && !match.bonusDone) {                 // the closing ceremony: bonus ribbons first
      match.bonusDone = true;
      const awards = match.board.bonus(match.wins);
      if (awards.length) return setPhase('bonus', { awards }, TIMES.BONUS_MS);
    }
    const rows = standings(), payout = {}, teams = teamTotals();
    if (teams) for (const r of rows) r.place = teams.find(t => t.pids.includes(r.pid))?.place ?? r.place;   // in teams, your team's place is yours
    for (const r of rows) {
      const m = members.get(r.pid); if (!m) continue;
      const coins = PAYOUT.base + (r.ribbons || 0) * PAYOUT.perRibbon + (r.points || 0) * PAYOUT.perPoint + r.wins * PAYOUT.perGameWon + (r.place === 1 && rows.length > 1 ? PAYOUT.winner : 0);
      payout[r.pid] = coins;
      const total = profiles?.reward(m.token, coins, { won: r.place === 1 && rows.length > 1 });
      if (total != null) send(m, { t: 'wallet', coins: total, d: coins });
    }
    const mode = match.mode;
    log('final', { code, mode, rows: rows.length });
    setPhase('final', { standings: rows, payout, mode, teams }, TIMES.FINAL_MS);
  }
  function toLobby() { match = null; game = null; vote = null; for (const m of members.values()) { m.ready = false; } promote(); setPhase('lobby'); }

  // ---------------------------------------------------------------- messages
  const err = (m, code2, msg) => { send(m, { t: 'err', code: code2, msg }); return false; };
  function message(m, msg) {
    switch (msg.t) {
      case 'ready': m.ready = msg.on; return syncRoom();
      case 'profile': {                                   // (the hub has already cleaned and saved it)
        if (msg.name) m.name = msg.name; if (msg.look) m.look = msg.look; if (msg.costume !== undefined) m.costume = msg.costume;
        return syncRoom();
      }
      case 'opt': {
        if (m.pid !== hostPid || phase !== 'lobby') return;
        const o = OPTS[msg.key];
        if (msg.key === 'pool') { if (Array.isArray(msg.value)) opts.pool = msg.value.filter(id => typeof id === 'string' && GAMES[id]).slice(0, 120); }
        else if (!o) return;
        else if (o.values) { if (o.values.includes(msg.value)) opts[msg.key] = msg.value; }   // (teams: true / false)
        else if (Number.isInteger(msg.value)) opts[msg.key] = Math.max(o.min, Math.min(o.max, msg.value));
        return syncRoom();
      }
      case 'start': return startMatch(m);
      case 'end': if (m.pid === hostPid && phase !== 'lobby') toLobby(); return;
      case 'kick': { const k = members.get(msg.pid); if (m.pid === hostPid && k && k.pid !== hostPid) { send(k, { t: 'kicked' }); k.connected = false; k.send = null; remove(k); } return; }
      case 'roll': if (phase === 'board' && match?.board) match.board.roll(m.pid, now()); return;
      case 'choose': if (phase === 'board' && match?.board) match.board.choose(m.pid, msg.i, now()); return;
      case 'vote': {
        if ((phase !== 'vote' && phase !== 'continue') || m.seat == null || !(msg.i >= 0 && msg.i < vote.options.length)) return;
        vote.votes[m.pid] = msg.i; cast({ t: 'votes', votes: vote.votes });
        if (active().every(a => a.pid in vote.votes)) until = Math.min(until, now() + 700);
        return;
      }
      case 'skip': {
        if ((phase !== 'intro' && phase !== 'results' && phase !== 'final' && phase !== 'bonus') || m.seat == null) return;
        m.skip = true; cast({ t: 'skips', pids: active().filter(a => a.skip).map(a => a.pid) });
        if (active().every(a => a.skip)) until = Math.min(until, now() + 400);
        return;
      }
      case 'in': {
        if (phase !== 'game' || !game || game.def.meta.kind !== 'arena' || !game.players.includes(m.pid)) return;
        m.queue.push({ s: msg.s, mx: Math.max(-1, Math.min(1, msg.mx)), mz: Math.max(-1, Math.min(1, msg.mz)), b: msg.b & (IN.A | IN.B) });
        if (m.queue.length > 12) { const old = m.queue.shift(); m.queue[0].b |= old.b; }   // hopelessly behind: drop the oldest step (never a button press)
        return;
      }
      case 'act': if (phase === 'game' && game?.inst.act && game.players.includes(m.pid)) game.inst.act(m.pid, msg.a, msg.d); return;
      case 'emote': if (m.seat != null) cast({ t: 'emote', pid: m.pid, e: String(msg.e).replace(/[^a-z]/gi, '').slice(0, 12) }); return;
    }
  }

  // ---------------------------------------------------------------- the clock
  function tick() {
    tickNo++;
    const t = now();
    for (const m of [...members.values()]) if (!m.connected && m.goneAt != null && t - m.goneAt > (phase === 'lobby' ? TIMES.GONE_LOBBY_MS : TIMES.GONE_MATCH_MS)) remove(m);
    if (phase === 'lobby') return;
    if (![...members.values()].some(m => m.connected && !m.display)) return;                       // every phone is asleep: hold everything where it is
    switch (phase) {
      case 'board': match.board.tick(t); if (match.board.roundDone) startVote(); break;
      case 'vote': if (t >= until) endVote(); break;
      case 'continue': if (t >= until) { const v = Object.values(vote.votes), stop = v.filter(i => i === 1).length > v.filter(i => i === 0).length; cast({ t: 'voted', pick: stop ? 1 : 0, id: stop ? 'finish' : 'keep' }); vote = null; if (stop) finish(); else nextRound(); } break;   // a tie keeps the fair open
      case 'intro': if (t >= until) beginPlay(); break;
      case 'game': tickGame(); break;
      case 'results': if (t >= until) nextRound(); break;
      case 'bonus': if (t >= until) finish(); break;
      case 'final': if (t >= until) toLobby(); break;
    }
  }
  return {
    code, join, disconnect, remove, message, tick,
    get phase() { return phase; }, get host() { return hostPid; }, get members() { return members; }, get match() { return match; }, get game() { return game; }, get opts() { return opts; },
    get emptyFor() { return emptySince == null ? 0 : now() - emptySince; },
    get size() { return members.size; },
  };
}
