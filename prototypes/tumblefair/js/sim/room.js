// One room: the people in it, the lobby, and a whole match from the first dice roll to the coin payout.
// The server owns one of these per room code and calls tick() twenty times a second; nothing here touches a socket
// or a clock directly (members carry a `send`, time comes in through `now()`), so the tests play whole matches in
// memory on a pretend clock.
//
// Phases:  lobby -> [ board -> vote -> intro -> game -> results ] x rounds -> final -> lobby
//          (the Minigame Marathon mode skips `board`; Custom swaps the vote for `pick`, the host choosing each minigame;
//          Golf plays the golf minigames one after another, a course of holes)
import { MAX_SEATS, cleanName, IN, cleanReasons, cleanChat } from '../shared/protocol.js';
import { DT, packBody } from '../shared/arena.js';
import { makeRng } from '../shared/rng.js';
import { GAMES, eligible } from '../games/index.js';
import { createBoardMatch, boardStandings, BOARD } from './board.js';
import { hasKind } from '../games/tags.js';
import { SEASON_IDS, effectiveSeason, seasonByDate, inSeason } from '../shared/seasons.js';
import { hasCpu, makeCpuMember, createCpuDriver, boardMove, SKILL_IDS } from './cpu.js';   // Expansion 1 M1: CPU fairgoers
import { lobbyEstimates, remainingMs, quickRounds, turnMs } from './match-time.js';                  // Expansion 1 M2: how long a match takes
import { buildHighlights } from './highlights.js';                                             // ... and the highlight reel
import { createPassMatch } from './pass.js';                                                  // Expansion 1 M7: the Fair Pass (stickers, level, daily)
import { createStoryRun, storyEstimates } from './story-run.js';                               // Expansion 1 M8: Story Night (js/sim/story*.js)
import { STORY_ARCS } from './story.js';

export const TIMES = Object.freeze({ VOTE_MS: 10000, INTRO_MS: 25000, KICKVOTE_MS: 45000, RESULTS_MS: 8000, FINAL_MS: 30000, GONE_LOBBY_MS: 300000, GONE_MATCH_MS: 120000, EMPTY_MS: 300000, GAME_GRACE_MS: 3000, BONUS_MS: 11000 });
export const OPTS = Object.freeze({
  mode: { values: ['board', 'marathon', 'endless', 'custom', 'golf', 'story'], def: 'board' },   // M8: story = Story Night
  arc: { values: ['random', ...STORY_ARCS], def: 'random' },                // M8: which story (rounds = how many beats, 3-5)
   // round 10: Custom (the host picks each minigame), Golf
  board: { values: ['fairground', 'pier'], def: 'fairground' },          // round 5: the Moonlit Pier
  teams: { values: [false, true], def: false },
  rounds: { min: 1, max: 18, def: 4 },
  golf: { values: ['mini', 'fairway'], def: 'mini' },                      // 2026-10-24 (owner): Golf mode is a course of Mini golf or Fairway holes
  goal: { values: [0, 60, 100, 150, 200], def: 0 },                         // round 10: board mode "first to X tickets" (0 = a set number of rounds)
  shortlist: { min: 2, max: 4, def: 3 },
  difficulty: { values: ['easy', 'normal', 'hard'], def: 'normal' },
  holiday: { values: ['auto', 'off', 'only', ...SEASON_IDS], def: 'auto' },   // NOT in the lobby since round 10: tests / dev force a season with it
  holidayMode: { values: [false, true], def: false },                       // round 10: "Halloween mode" — only holiday minigames (only offered in season)
  moves: { values: ['dice', 'cards'], def: 'dice' },                     // round 9 (report #16): roll a die, or play move cards
  public: { values: [false, true], def: false },
  votePick: { values: ['mix', 'top', 'fresh'], def: 'mix' },             // round 10 (owner): one top-rated slot / all top rated / anything
  favour: { values: ['', 'funny', 'close', 'teamwork', 'skill', 'chill'], def: '' },
  cpus: { min: 0, max: MAX_SEATS - 1, def: 0 },                             // Expansion 1 M1: computer fairgoers in empty seats (as many as fit)
  cpuSkill: { values: SKILL_IDS, def: 'normal' },
  timers: { values: ['normal', 'relaxed'], def: 'normal' },               // Expansion 1 M3: Relaxed = more time to vote, read, take a turn (never a game's own clock)
  rivals: { values: [true, false], def: true },                             // ... and a game's own computer rival when someone plays alone (owner: all computer players optional)                          // ... and how good they are (Family / Normal / Tricky)   // ... rated best FOR this (a 👍 reason)                           // round 7: listed in "Find a game" on the title screen
});
/** Expansion 1 M3 (comfort): the host's "Relaxed" timers stretch every DECISION and READING timer by this much — the
 *  vote, the intro (practice), the results, the bonus ribbons, the board's roll / crossroads / bulletin, Story Night's
 *  choices and lines. A minigame's own clock (meta.seconds) and the board's live events (timed taps) are never stretched. */
export const RELAXED = 1.6;
export const RELAXED_TIMES = Object.freeze({ ...TIMES, VOTE_MS: TIMES.VOTE_MS * RELAXED, INTRO_MS: TIMES.INTRO_MS * RELAXED, RESULTS_MS: TIMES.RESULTS_MS * RELAXED, BONUS_MS: TIMES.BONUS_MS * RELAXED });
/** Golf mode plays one of these whole-course games, a hole per round (owner 2026-10-24; not in normal rotation). */
export const GOLF_GAMES = Object.freeze({ mini: 'mini-golf', fairway: 'fairway-golf' });
/** Custom mode never runs forever; a ticket goal neither. */
/** A game needs this many 👍/👎 (everyone's, all rooms) before it can be the top-rated pick or show its %. */
export const RATED_MIN = 3;
export const LIMITS = Object.freeze({ CUSTOM_MAX: 40, GOAL_MAX_ROUNDS: 30 });
/** What a minigame placing is worth, best first. Board mode pays tickets, the marathon pays points. */
/** Endless: a 'keep going?' vote after every this many minigames; it gets harder every ENDLESS_STEP; never more than ENDLESS_MAX. */
export const ENDLESS = Object.freeze({ EVERY: 3, STEP: 3, MAX: 30 });
/** Teams: red + green against blue + pink (seat % 2). */
export const TEAM_NAMES = ['Red & Green', 'Blue & Pink'];
export const AWARDS = Object.freeze({ board: [10, 6, 3, 1], marathon: [4, 3, 2, 1], coopWin: { board: 6, marathon: 3 }, coopLose: { board: 2, marathon: 1 } });
/** Persistent coins at the end of a match (they buy costumes; they never help you win). */
export const PAYOUT = Object.freeze({ base: 10, perRibbon: 5, perPoint: 1, winner: 10, perGameWon: 2 });

// `report(kind, data)` (round 7) is how a room tells the server what happened, for the insights log the owner reads to
// find the unfun minigames: 'rate' (a player's 👍/👎 + reasons), 'played' (a minigame ran: how long, who dropped out),
// 'vote' (which minigames were offered and which won), 'match' / 'final'. Never a name, a token or an address.
export function createRoom({ code, now, seed = 1, data, profiles = null, log = () => {}, report = () => {}, ratings: allRatings = () => ({}), fresh: freshNow = () => ({}) }) {
  const rng = makeRng(seed);
  const members = new Map();          // pid -> member
  let nextPid = 1, hostPid = null, ownerPid = null, guestHost = true, phase = 'lobby', until = 0, emptySince = null;
  const opts = { board: OPTS.board.def, mode: OPTS.mode.def, teams: OPTS.teams.def, rounds: OPTS.rounds.def, shortlist: OPTS.shortlist.def, difficulty: OPTS.difficulty.def, holiday: OPTS.holiday.def, holidayMode: OPTS.holidayMode.def, goal: OPTS.goal.def, moves: OPTS.moves.def, golf: OPTS.golf.def, public: OPTS.public.def, votePick: OPTS.votePick.def, favour: OPTS.favour.def, cpus: OPTS.cpus.def, cpuSkill: OPTS.cpuSkill.def, rivals: OPTS.rivals.def, arc: OPTS.arc.def, timers: OPTS.timers.def, pool: [] };
  const T = () => (opts.timers === 'relaxed' ? RELAXED_TIMES : TIMES);   // M3: the timers this room plays with
  const cpuRng = makeRng((seed ^ 0x5bd1e995) >>> 0);   // the CPUs' own dice, so a room without CPUs rolls exactly as before
  const banned = new Set();            // round 10 (#26): tokens kicked out of this room (by the host or a vote) can't come back
  let kickVote = null;                 // { target, by: Set(pid), until }
  const playedBy = new Map();          // round 7: game id -> the pids who played it in this room (only they may rate it)
  const ratings = new Map();           // `${game}:${pid}` -> { v, why } (a change of mind replaces, never adds)
  const date = () => new Date(now());
  const season = () => effectiveSeason(opts.holiday, date());
  const seasonNow = season;              // holiday games + reskins (the host can force it)
  /** Halloween mode (round 10): only holiday minigames — and only while a holiday is actually on. */
  const holidayOnly = () => !!season() && (opts.holidayMode || opts.holiday === 'only');
  /** The minigames this many players may get right now: the host's pool, the season, Halloween mode, the mode. */
  function gamesFor(n, mode = opts.mode) {
    if (mode === 'golf') { const id = GOLF_GAMES[opts.golf] || GOLF_GAMES.mini, g = GAMES[id]?.meta; return g && g.min <= n && g.max >= n && (!cpusIn() || hasCpu(id)) ? [id] : []; }
    let pool = eligible(n, opts.pool, season()); if (!pool.length) pool = eligible(n, [], season());
    if (n === 1 && opts.rivals === false) { const ok = pool.filter(id => GAMES[id]?.meta.rival !== 'needed'); if (ok.length) pool = ok; }   // a game that is only a game with its rival
    if (cpusIn()) { pool = pool.filter(hasCpu); if (!pool.length) pool = eligible(n, [], season()).filter(hasCpu); }   // CPUs seated: only games they can play
    if (holidayOnly()) { const s = season(), hol = pool.filter(id => GAMES[id]?.meta.season === s); if (hol.length) return hol; const all = eligible(n, [], s).filter(id => GAMES[id]?.meta.season === s); if (all.length) return all; }
    return pool;
  }
  const costumeOk = id => inSeason(data.cosmetics?.items?.find(c => c.id === id), seasonByDate(date()));   // costumes: the date only
  let match = null;                    // { mode, round, rounds, points, wins, played, board, lastGame }
  let vote = null, game = null, lastPhaseMsg = null, tickNo = 0;
  let prevTickAt = null;
  const again = new Set();             // Expansion 1 M2: on the final screen, the people who tapped Play again
  let quickNext = false, againNext = false;   // ... and how the next match was started (for the insights log)
  const chatLog = [];                  // report #34: the last few chat lines, for a phone that joins or comes back
  /** Report #40: a seated player whose phone has gone (closed, or asleep). The board plays their turns for them at once. */
  const away = pid => { const m = members.get(pid); return !!m && !m.connected; };

  // ---------------------------------------------------------------- people
  const seated = () => [...members.values()].filter(m => m.seat != null).sort((a, b) => a.seat - b.seat);
  const active = () => seated().filter(m => m.connected);
  // Expansion 1 M1: a CPU fairgoer is a seated member with `cpu` set and no socket. It counts as a player everywhere a
  // player is counted (seats, the board, minigames, results) and as nobody where people are counted (host, "everyone
  // has voted/skipped", keeping the room open, kick votes, the public list).
  const isCpu = m => !!m?.cpu;
  const people = () => [...members.values()].filter(m => !m.cpu);
  const humansActive = () => active().filter(m => !m.cpu);
  const cpusIn = () => seated().some(isCpu);
  const freeSeat = () => { for (let s = 0; s < MAX_SEATS; s++) if (![...members.values()].some(m => m.seat === s)) return s; return null; };
  const pub = m => ({ pid: m.pid, name: m.name, look: m.look, costume: costumeOk(m.costume) ? m.costume : 'cos_none', seat: m.seat, ready: m.ready, on: m.connected, display: m.display, wait: m.seat == null && !m.display, ...(m.cpu ? { cpu: m.cpu.skill } : {}), ...(!m.cpu && !m.display && m.token ? profiles?.badge?.(m.token) || {} : {}) });   // M7: Fair Pass level + name plate
  const send = (m, obj) => { if (m.connected && m.send) m.send(JSON.stringify(obj)); };
  const cast = obj => { const s = JSON.stringify(obj); for (const m of members.values()) if (m.connected && m.send) m.send(s); };
  function roomMsg(m) {
    return { t: 'room', code, phase, host: hostPid, owner: ownerPid, guestHost: ownerPid != null ? guestHost : undefined, you: m.pid, opts, fresh: freshNow() || {}, season: (match?.mode ?? opts.mode) === 'golf' ? null : season(), dateSeason: seasonByDate(date()), members: [...members.values()].map(pub),
      kickVote: kickVote ? { target: kickVote.target, yes: [...kickVote.by], need: kickNeed() } : null,
      match: match ? { mode: match.mode, round: match.round, rounds: match.rounds, goal: match.goal || 0, ribbonWorth: match.goal ? ribbonWorth() : 0, points: match.points, wins: match.wins, board: match.board ? match.board.view() : null, boardId: match.boardId || null, left: timeLeft(), quick: !!match.quick } : null,
      ...(phase === 'lobby' ? { est: estimates() } : {}), ...(phase === 'final' && again.size ? { again: [...again] } : {}) };
  }
  // Expansion 1 M2: how long things take, from the real timers (js/sim/match-time.js). Lobby: minutes for every choice.
  let estKey = null, estVal = null;
  function estimates() {
    const n = Math.max(1, seated().length), pool = gamesFor(n, opts.mode === 'golf' ? 'board' : opts.mode), key = `${n}|${opts.golf}|${opts.timers}|${pool.join()}`;
    if (key !== estKey) { estKey = key; estVal = { ...lobbyEstimates({ players: n, pool, times: T(), golf: opts.golf }), story: storyEstimates({ players: n, pool, times: T() }) }; }
    return estVal;
  }
  /** In a match: about how long is left (ms), or null for a match with no set end. */
  function timeLeft() {
    if (!match || phase === 'final' || phase === 'lobby') return null;
    if (match.story) return match.story.left();                                    // M8
    const n = Math.max(1, active().length), lead = match.goal && match.board ? Math.max(0, ...match.board.S.order.map(worthOf)) : 0;
    return remainingMs({ mode: match.mode, round: match.round, rounds: match.rounds, goal: match.goal, players: n, pool: match.mode === 'golf' ? null : gamesFor(n), golf: match.golf, times: T(), phase, phaseLeft: phaseLeft(), leader: lead });
  }
  function phaseLeft() {
    if (phase === 'game' && game) return game.started ? Math.max(0, game.endsAt - now()) : 0;
    if (phase === 'board' && match.board) return Math.max(0, match.board.S.order.length - Math.max(0, match.board.S.turn)) * turnMs();
    return until ? Math.max(0, until - now()) : 0;
  }
  const syncRoom = () => { for (const m of members.values()) send(m, roomMsg(m)); };
  function setPhase(p, msg = {}, ms = 0) { phase = p; until = ms ? now() + ms : 0; lastPhaseMsg = { t: 'phase', phase: p, ms, ...msg }; syncRoom(); cast(lastPhaseMsg); }

  function join({ token, name, look, costume, send: sendFn, display = false }) {
    if (banned.has(token)) { try { sendFn?.(JSON.stringify({ t: 'kicked' })); } catch {} return null; }
    // the same person coming back (a refresh, a phone that slept): same seat, same score
    // a TV that owns the room (2026-10-24) coming back after a wifi blip: still the owner
    for (const m of members.values()) if (display && m.display && m.pid === ownerPid && m.token === token) { m.send = sendFn; m.connected = true; m.goneAt = null; emptySince = null; resync(m); syncRoom(); return m; }
    // Report #43 (2026-11-06): the same person can also arrive while their first window is still connected (signed in on
    // a phone, then the same account in an incognito window; or two tabs of one browser). It is still one seat: the new
    // window takes it over and the old one is told so and leaves (before, the old socket kept the member and its later
    // drop marked the NEW window's seat as gone). js/sim/hub.js only acts for a socket that still owns its member.
    for (const m of members.values()) if (m.token === token && !display && !m.display) { if (m.connected && m.send && m.send !== sendFn) { try { m.send(JSON.stringify({ t: 'kicked', why: 'elsewhere' })); } catch { /* gone */ } } m.send = sendFn; m.connected = true; m.goneAt = null; m.name = name; m.look = look; m.costume = costume; emptySince = null; resync(m); syncRoom(); return m; }
    const m = { pid: nextPid++, token, name, look, costume, send: sendFn, connected: true, goneAt: null, ready: false, display, seat: null, queue: [], lastIn: null, starve: 0, ack: 0, skip: false };
    if (!display && phase === 'lobby') { if (freeSeat() == null) dropCpu(); m.seat = freeSeat(); }   // mid-match joiners watch until the next minigame; in the lobby a CPU gives up its seat
    members.set(m.pid, m); emptySince = null;
    syncCpus();
    if (ownerPid == null && (hostPid == null || !members.has(hostPid))) hostPid = m.pid;
    else if (ownerPid != null) pickHost(true);
    resync(m); syncRoom();
    return m;
  }
  /**
   * Report #43: a member signs in (js/sim/hub.js become) as an account that is already sitting in this room from another
   * window. One person, one seat: the other window is told and leaves, this one keeps its own seat.
   */
  function rekey(m, token) {
    if (!members.has(m.pid)) return;
    for (const x of [...members.values()]) if (x !== m && x.token === token && !x.display && !m.display) { send(x, { t: 'kicked', why: 'elsewhere' }); x.connected = false; x.send = null; remove(x); }
    m.token = token;
  }
  /** Everything a client needs to draw the present moment from nothing. */
  function resync(m) {
    send(m, roomMsg(m));
    if (chatLog.length) send(m, { t: 'chatlog', list: chatLog });
    if (phase === 'lobby') return;
    if (phase === 'game' && game) { send(m, { ...game.introMsg, phase: 'intro', ms: 0, init: game.inst.init(), b: bodiesOf(game.inst), resume: true }); }
    if (lastPhaseMsg) send(m, { ...lastPhaseMsg, ms: until ? Math.max(0, until - now()) : 0, ...(phase === 'vote' || phase === 'continue' ? { votes: vote?.votes || {} } : {}) });
    if (phase === 'game' && game?.inst.priv && m.seat != null) send(m, { t: 'gp', d: { ...game.inst.priv(m.pid), ...(game.inst.restore?.(m.pid) || {}) } });   // restore: what a returning phone had made (its drawing)
  }
  function disconnect(m) {
    if (!members.has(m.pid)) return; m.connected = false; m.send = null; m.goneAt = now(); m.queue.length = 0;
    if ((m.display && m.pid !== ownerPid) || (!m.display && m.seat == null)) return remove(m);
    if (!people().some(x => x.connected)) emptySince = emptySince ?? now();   // a match nobody comes back to still closes (EMPTY_MS)
    syncRoom(); pickHost();
  }
  function remove(m) {
    if (!members.delete(m.pid)) return;
    if (match?.board && m.seat != null) match.board.dropPlayer(m.pid);
    if (game && m.seat != null) game.gone?.add(m.pid);
    if (!m.cpu) syncCpus(true);
    pickHost(); syncRoom();
    if (!people().some(x => x.connected)) emptySince = emptySince ?? now();
  }
  /**
   * Expansion 1 M1: in the lobby, seat as many CPUs as the host asked for that fit beside the people (people always come
   * first: a CPU gives up its seat to anyone who joins). Outside the lobby the CPUs stay as they are (a joiner takes one
   * over at the next minigame, see promote()).
   */
  function syncCpus(quiet = false) {
    if (phase !== 'lobby') return false;
    const humans = seated().filter(m => !m.cpu).length + people().filter(m => m.seat == null && !m.display && m.connected).length;
    const want = Math.max(0, Math.min(opts.cpus, MAX_SEATS - humans));
    let cpus = seated().filter(isCpu), changed = false;
    while (cpus.length > want) { const c = cpus.pop(); members.delete(c.pid); changed = true; }
    for (const c of cpus) if (c.cpu.skill !== opts.cpuSkill) { c.cpu.skill = opts.cpuSkill; changed = true; }
    while (cpus.length < want) {
      const s = freeSeat(); if (s == null) break;
      const costumes = (data.cosmetics?.items || []).filter(c => c.kind === 'costume' && !c.pass && costumeOk(c.id)).map(c => c.id);
      const c = makeCpuMember({ pid: nextPid++, seat: s, skill: opts.cpuSkill, rng: cpuRng, taken: [...members.values()].map(x => x.name), costumes });
      members.set(c.pid, c); cpus.push(c); changed = true;
    }
    if (changed && !quiet) syncRoom();
    return changed;
  }
  /** A CPU leaves its seat (the last one seated) so a person can sit. */
  function dropCpu() { const c = seated().filter(isCpu).pop(); if (c) members.delete(c.pid); return !!c; }
  /**
   * The host runs the game (options, start, kick). In a room a TV made (`ownerPid`), the TV keeps the room, and the host
   * is a PLAYER: the earliest to join who is seated and here; when they go, the next one. No players yet: no host.
   */
  function pickHost(quiet = false) {
    if (ownerPid != null) {
      if (!guestHost) { if (hostPid !== null) { hostPid = null; if (!quiet) syncRoom(); } return; }   // the TV keeps control
      const h = members.get(hostPid);
      if (h && h.connected && !h.display && h.seat != null) return;
      const next = seated().filter(x => x.connected && !x.cpu).sort((a, b) => a.pid - b.pid)[0] || null;
      const pid = next ? next.pid : null;
      if (pid !== hostPid) { hostPid = pid; if (!quiet) syncRoom(); }
      return;
    }
    const h = members.get(hostPid);
    if (h && h.connected) return;
    const next = humansActive()[0] || people().find(m => m.connected && !m.display) || people().find(m => m.connected);
    if (next && next.pid !== hostPid) { hostPid = next.pid; syncRoom(); }
  }
  /** Round 10 (#26): put someone out of the room for good (the host's ×, or a vote). */
  function kickOut(k, why) {
    if (!k) return;
    if (k.cpu) { if (phase === 'lobby') opts.cpus = Math.max(0, opts.cpus - 1); remove(k); return syncRoom(); }   // the host's × on a CPU: one fewer
    banned.add(k.token); send(k, { t: 'kicked', why }); k.connected = false; k.send = null; remove(k);
    if (kickVote?.target === k.pid) kickVote = null;
    log('kick', { code, why });
  }
  /** A vote-kick passes with more than half of the OTHER players in the room (seated and connected). */
  const kickNeed = () => { const voters = humansActive().filter(m => m.pid !== kickVote?.target).length; return Math.max(1, Math.floor(voters / 2) + 1); };
  /** Waiting players take free seats (called between minigames, never during one). */
  function promote() {
    let any = false;
    for (const m of [...members.values()]) { if (m.seat != null || m.display || !m.connected || m.cpu) continue; const s = freeSeat();
      if (s == null) { if (match && takeOver(m)) any = true; continue; }
      m.seat = s; any = true;
      if (match) { match.points[m.pid] = 0; match.wins[m.pid] = 0; match.board?.addPlayer(m.pid); if (match.teams) match.teams[m.pid] = m.seat % 2; } }
    return any;
  }
  /**
   * Expansion 1 M1: mid-match, someone waiting for a seat takes over a CPU's (between minigames). They take its place
   * whole — its pid, so its tickets, ribbons, board space, points and team carry on under their name.
   */
  function takeOver(m) {
    const c = seated().filter(isCpu).pop(); if (!c) return false;
    const old = m.pid;
    members.delete(old); members.delete(c.pid);
    m.pid = c.pid; m.seat = c.seat; members.set(m.pid, m);
    if (hostPid === old) hostPid = m.pid;
    if (ownerPid === old) ownerPid = m.pid;
    log('cpu.takeover', { code });
    return true;
  }

  // ---------------------------------------------------------------- the match
  /** The host, or the TV that owns the room, may run the game. */
  const isAdmin = m => m && (m.pid === hostPid || (ownerPid != null && m.pid === ownerPid));
  function startMatch(by) {
    if (phase !== 'lobby' || !isAdmin(by)) return err(by, 'host', 'Only the host can start.');
    promote();
    for (const m of seated()) if (!m.connected) remove(m);          // a lobby keeps a phone that slept for five minutes (report #13); a match starts without it
    syncCpus(true);
    const players = active();
    if (!players.some(m => !m.cpu)) return err(by, 'empty', 'Nobody is seated yet.');
    if (!gamesFor(players.length).length) return err(by, 'pool', opts.mode === 'golf' ? 'No golf game fits this many players.' : 'No minigame in the chosen pool fits this many players.');
    if (opts.teams && players.length === 3) return err(by, 'teams', 'Teams need 2 or 4 players (red + green against blue + pink).');
    const goal = opts.mode === 'board' && opts.goal > 0 ? opts.goal : 0;
    match = { mode: opts.mode, round: 0, rounds: opts.mode === 'endless' || opts.mode === 'custom' || goal ? null : opts.rounds, goal, points: {}, wins: {}, played: [], board: null, lastGame: null, teams: opts.teams ? {} : null,
      startedAt: now(), quick: !!quickNext, again: !!againNext, reel: { games: [], swings: [], wheel: [] } };   // M2: what the highlight reel is built from
    quickNext = false; againNext = false; again.clear();
    match.pass = createPassMatch({ profiles, member: pid => members.get(pid), send, season: () => (match?.mode === 'golf' ? null : season()), mode: match.mode });   // M7
    if (match.teams) for (const m of players) match.teams[m.pid] = m.seat % 2;
    if (match.mode === 'golf') { match.golf = GOLF_GAMES[opts.golf] ? opts.golf : 'mini'; match.course = Math.floor(rng() * 2 ** 31); match.card = Object.fromEntries(players.map(m => [m.pid, []])); }
    for (const m of players) { match.points[m.pid] = 0; match.wins[m.pid] = 0; m.ready = false; }
    if (match.mode === 'board') {
      const names = new Proxy({}, { get: (_, pid) => members.get(+pid)?.name });
      match.boardId = data.boards[opts.board] ? opts.board : 'fairground';
      match.board = createBoardMatch({ def: data.boards[match.boardId], chance: seasonal(data.chance, season()), order: players.map(m => m.pid), rng: rng.fork(), names, moves: opts.moves, away, slow: opts.timers === 'relaxed' ? RELAXED : 1, emit: ev => { noteBoard(ev); cast({ t: 'bd', ...ev }); } });
    }
    if (match.mode === 'story') { if (!data.story) { match = null; return err(by, 'story', 'Story Night is not available here.'); } match.story = createStoryRun({ data: data.story, arcId: opts.arc, beats: opts.rounds, rng: rng.fork(), cpuRng, now, match, seated, setPhase, cast, gamesFor: n => gamesFor(n), startGame: id => { promote(); startGame(id); }, finish, times: T(), slow: opts.timers === 'relaxed' ? RELAXED : 1, log }); }   // M8
    log('match', { code, mode: match.mode, players: players.length });
    report('match', { mode: match.mode, players: players.length, cpus: players.filter(isCpu).length, cpuSkill: players.some(isCpu) ? opts.cpuSkill : null, teams: !!opts.teams, board: match.boardId || null, rounds: match.rounds, difficulty: opts.difficulty, pool: opts.pool.length, public: !!opts.public, quick: match.quick, again: match.again });
    nextRound();
  }
  /** The board's chance events and bulletins, with this season's added (and other seasons' left out). */
  /** M2: the board's wheel results, for the highlight reel (only what really happened on the board). */
  function noteBoard(ev) { match?.pass?.board(ev); if (match?.reel && ev.ev === 'fx' && ev.kind === 'chance' && typeof ev.d === 'number' && ev.pid != null) match.reel.wheel.push({ pid: ev.pid, d: ev.d, round: match.round }); }
  /** ... and each round's swing on the board: what each player's tickets (+ ribbons at their price) did this round. */
  const boardWorth = () => Object.fromEntries(match.board.S.order.map(pid => [pid, worthOf(pid)]));
  function noteSwings() { const was = match.reel.before || {}, now2 = boardWorth(); for (const pid of Object.keys(now2)) if (pid in was) match.reel.swings.push({ round: match.round, pid: +pid, d: now2[pid] - was[pid] }); match.reel.before = null; }
  const seasonal = (ch, s) => ({ ...ch, events: ch.events.filter(e => inSeason(e, s)), bulletins: (ch.bulletins || []).filter(e => inSeason(e, s)) });
  function nextRound() {
    if (match.story) return match.story.resume();                                   // M8: the story decides what comes next
    if (match.mode === 'endless') {
      if (match.round >= ENDLESS.MAX) return finish();
      if (match.round > 0 && match.round % ENDLESS.EVERY === 0 && !match.asked) { match.asked = true; vote = { options: ['keep', 'finish'], votes: {} }; return setPhase('continue', { round: match.round }, T().VOTE_MS); }
      match.asked = false; match.round++; return startVote();
    }
    if (match.mode === 'custom') {
      if (match.round >= LIMITS.CUSTOM_MAX) return finish();
      match.round++; promote();
      return setPhase('pick', { round: match.round, options: gamesFor(active().length || 1) });
    }
    if (match.goal) { if (goalReached() || match.round >= LIMITS.GOAL_MAX_ROUNDS) return finish(); }
    else if (match.round >= match.rounds) return finish();
    match.round++;
    if (match.mode === 'golf') { promote(); for (const m of active()) match.card[m.pid] ||= []; return startGame(GOLF_GAMES[match.golf], { hole: match.round - 1, holes: match.rounds, course: match.course, card: match.card }); }
    if (match.mode === 'board') { match.reel.before = boardWorth(); setPhase('board', { round: match.round, rounds: match.rounds }); match.board.beginRound(now(), match.round, match.rounds); }
    else startVote();
  }
  /** Golf: every course hole once (shuffled) before any repeats, never the same hole twice in a row. */
  function nextHole() {
    const holes = gamesFor(active().length || 1, 'golf');
    const fresh = holes.filter(id => !match.played.includes(id)), other = holes.filter(id => id !== match.lastGame);
    return rng.shuffle(fresh.length ? fresh : other.length ? other : holes)[0];
  }
  /**
   * The candidates best first by everyone's ratings: the share of 👍 (Wilson lower bound, so 3/3 doesn't beat 40/45),
   * or with Favour set, how often a 👍 named that reason. Games with too few ratings come after the rated ones. The
   * first pick is drawn from the best few, so the same game isn't the top slot every round.
   */
  function topRated(cands, R) {
    const rated = cands.filter(id => R[id] && R[id].up + R[id].down >= RATED_MIN);
    if (!rated.length) return [];
    const key = id => { const r = R[id]; if (!opts.favour) return r.score; const n = r.reasons?.['+' + opts.favour] || 0; return n / (r.up + r.down + 2) * 100 + r.score / 1000; };
    const best = rated.sort((a, b) => key(b) - key(a));
    // with Favour set, only games someone actually gave that 👍 reason can be the special pick (if there are any)
    const named = opts.favour ? best.filter(id => (R[id].reasons?.['+' + opts.favour] || 0) > 0) : best;
    const lead = (named.length ? named : best).slice(0, Math.min(4, (named.length ? named : best).length)), first = lead[Math.floor(rng() * lead.length)];
    return [first, ...best.filter(id => id !== first)];
  }
  /** "First to X tickets": what a player is worth toward the goal — tickets in hand plus every ribbon at its price. */
  const ribbonWorth = () => BOARD.RIBBON_COST;
  const worthOf = pid => (match.board.S.tickets[pid] || 0) + (match.board.S.ribbons[pid] || 0) * ribbonWorth();
  const goalReached = () => match.board.S.order.some(pid => members.has(pid) && worthOf(pid) >= match.goal);
  function startVote() {
    promote();
    const n = active().length || 1;
    const pool = gamesFor(n);
    const fresh = pool.filter(id => !match.played.includes(id)), notLast = pool.filter(id => id !== match.lastGame);
    // unplayed games first, then anything but the one just played, then whatever is left
    let ranked = [...rng.shuffle(fresh), ...rng.shuffle(notLast.filter(id => !fresh.includes(id))), ...pool.filter(id => id === match.lastGame && !fresh.includes(id))];
    // round 10 (owner): "one of those slots is the top rated" — or every slot (votePick 'top'), or none ('fresh');
    // 'favour' ranks by one 👍 reason instead of the 👍 share
    const R = allRatings() || {}, top = topRated(ranked.filter(id => !match.played.includes(id)).length ? ranked.filter(id => !match.played.includes(id)) : ranked, R);
    let options, labels = {};
    if (opts.votePick === 'top') options = top.slice(0, opts.shortlist);
    else if (opts.votePick === 'mix' && top.length) { options = [top[0], ...ranked.filter(id => id !== top[0])].slice(0, opts.shortlist); labels[top[0]] = opts.favour || 'top'; }
    else options = ranked.slice(0, opts.shortlist);
    if (opts.votePick === 'top') for (const id of options) labels[id] = opts.favour || 'top';
    if (options.length <= 1) return startGame(options[0] || pool[0]);
    options = rng.shuffle(options);                 // the special slot isn't always the first card
    const rating = Object.fromEntries(options.filter(id => R[id] && R[id].up + R[id].down >= RATED_MIN).map(id => [id, Math.round(100 * R[id].up / (R[id].up + R[id].down))]));
    vote = { options, votes: {} };
    const F = freshNow() || {}, badges = Object.fromEntries(options.filter(id => F[id]).map(id => [id, F[id]]));
    setPhase('vote', { options, labels, rating, fresh: badges, round: match.round, rounds: match.rounds }, T().VOTE_MS);
  }
  function endVote() {
    const tally = vote.options.map(() => 0);
    // Expansion 1 M1: people choose; the CPUs' votes only break a tie among what the people picked (or decide alone)
    const cpuVote = pid => isCpu(members.get(+pid));
    for (const [pid, i] of Object.entries(vote.votes)) if (!cpuVote(pid)) tally[i]++;
    { const top = Math.max(...tally); for (const [pid, i] of Object.entries(vote.votes)) if (cpuVote(pid) && tally[i] === top) tally[i] += 0.5; }
    const best = Math.max(...tally), tied = tally.map((n, i) => (n === best ? i : -1)).filter(i => i >= 0);
    const pick = tied[Math.floor(rng() * tied.length)];
    const id = vote.options[pick], offered = vote.options.map((game, i) => ({ game, votes: tally[i] })); vote = null;
    cast({ t: 'voted', pick, id, tally });
    report('vote', { offered, pick: id, players: active().length });
    startGame(id);
  }
  const bodiesOf = inst => { if (!inst.bodies) return null; const b = {}; for (const [pid, body] of inst.bodies) b[pid] = packBody(body, members.get(pid)?.ack || 0); return b; };
  function startGame(id, extra = {}) {
    const def = GAMES[id], players = active(), season = () => (match.mode === 'golf' ? null : seasonNow());   // no Halloween in Golf mode (owner)
    const list = players.map(m => ({ pid: m.pid, seat: m.seat, name: m.name }));
    const difficulty = match.mode === 'endless' ? ['easy', 'normal', 'hard'][Math.min(2, Math.floor((match.round - 1) / ENDLESS.STEP))] : opts.difficulty;   // the endless fair gets harder
    const inst = def.create({ seed: Math.floor(rng() * 2 ** 31), rng: rng.fork(), players: list, difficulty, season: season(), teams: !!match.teams, rivals: opts.rivals !== false, ...extra });   // rivals: a game's own solo rival (meta.rival) only when on   // teams: Wizard Duel turns off hitting your own side
    for (const m of members.values()) { m.queue.length = 0; m.lastIn = null; m.starve = 0; m.ack = 0; m.skip = false; }
    game = { id, def, inst, players: list.map(p => p.pid), started: false, endsAt: 0, lastState: '', lastPriv: new Map(), gone: new Set(), difficulty };
    const cpus = new Map(players.filter(isCpu).map(m => [m.pid, m.cpu.skill]));
    if (cpus.size) game.cpu = createCpuDriver({ id, inst, players: list, cpus, seed: Math.floor(cpuRng() * 2 ** 31), difficulty, log });
    const who = playedBy.get(id) || new Set(); for (const p of list) who.add(p.pid); playedBy.set(id, who);
    game.introMsg = { t: 'phase', phase: 'intro', game: id, players: list, round: match.round, rounds: match.rounds, difficulty, season: season() };
    match.played.push(id); match.lastGame = id;
    setPhase('intro', { game: id, players: list, init: inst.init(), b: bodiesOf(inst), round: match.round, rounds: match.rounds, difficulty, season: season() }, T().INTRO_MS);
    if (inst.priv) for (const m of players) send(m, { t: 'gp', d: inst.priv(m.pid) });
  }
  function beginPlay() {
    game.started = true; game.startedAt = now(); game.endsAt = now() + game.def.meta.seconds * 1000 + TIMES.GAME_GRACE_MS;
    for (const m of members.values()) m.skip = false;
    setPhase('game', { game: game.id, seconds: game.def.meta.seconds });
  }
  function tickGame() {
    const { inst, def } = game, arena = def.meta.kind === 'arena';
    if (game.cpu) {                                       // the CPUs decide on what they were last shown; arena input goes the phones' way
      const inp = game.cpu.before(now(), pid => members.has(pid));
      for (const [pid, i] of inp) { const m = members.get(pid); if (m) m.queue.push({ s: (m.cpuSeq = (m.cpuSeq || 0) + 1), ...i }); }
    }
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
    const evs = inst.events?.length ? inst.events.slice() : [];
    if (inst.events?.length) { for (const ev of inst.events) { if (ev.to != null) { const m = members.get(ev.to); if (m) send(m, { t: 'ge', ...ev, to: undefined }); } else cast({ t: 'ge', ...ev }); } inst.events.length = 0; }
    const g = inst.state();
    game.cpu?.after(g, evs);
    if (arena) {
      // M2 (2026-11-07): a game may keep some bodies off one viewer's phone (Hide and Seek: where the hiders run while
      // the seeker's eyes are shut). Opt-in; every other game is cast to everyone exactly as before.
      if (!inst.bodiesHiddenFrom) cast({ t: 's', k: tickNo, b: bodiesOf(inst), g });
      else { const b = bodiesOf(inst); for (const m of members.values()) { const out = inst.bodiesHiddenFrom(m.seat != null ? m.pid : null) || []; if (!out.length) send(m, { t: 's', k: tickNo, b, g }); else { const b2 = { ...b }; for (const p of out) delete b2[p]; send(m, { t: 's', k: tickNo, b: b2, g }); } } }
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
    if (mode === 'golf') for (const pid of game.players) if (match.card[pid] && typeof res.scores?.[pid] === 'number') match.card[pid][match.round - 1] = res.scores[pid];
    const msg = { game: game.id, result: res, award, unit: mode === 'board' ? 'tickets' : mode === 'story' ? 'stars' : 'points', teams: teamTotals(), round: match.round, mul: mode === 'board' ? match.board.gameMul() : 1,
      ...(mode === 'golf' ? { golf: { card: match.card, totals: golfTotals(), holes: match.rounds } } : {}) };
    // how the minigame actually went: did it end on its own or on the clock, how long it really took, who dropped out
    const scores = Object.values(res.scores || {}).filter(x => typeof x === 'number');
    report('played', { game: game.id, mode, players: game.players.length, difficulty: game.difficulty, season: season(), seconds: Math.round(((now() - (game.startedAt || now())) / 1000) * 10) / 10, limit: game.def.meta.seconds,
      endedEarly: !!game.inst.over, dropped: game.gone.size + game.players.filter(pid => !members.get(pid)?.connected).length, coop: res.coop ? !!res.coop.success : null, allTied: !res.coop && (res.order?.length || 0) <= 1 && game.players.length > 1,
      scoreSpread: scores.length > 1 ? Math.max(...scores) - Math.min(...scores) : null });
    match.reel.games.push({ id: game.id, title: game.def.meta.title, round: match.round, order: res.order || [], scores: res.scores || {}, unit: res.unit || game.def.meta.unit || 'points', coop: res.coop || null });   // M2: highlight reel
    match.story?.gameResult(res, game.players);                                     // M8: the encounter's outcome shapes the story
    for (const pid of game.players) { const m = members.get(pid); if (m?.token) profiles?.played?.(m.token, game.id); }   // round 10 (#28/#29): the "My games" play count
    match.pass?.game({ id: game.id, players: game.players, res, seconds: (now() - (game.startedAt || now())) / 1000, cpuSkill: pid => members.get(pid)?.cpu?.skill || null });   // M7: Fair Pass
    game = null;
    for (const m of members.values()) m.skip = false;
    setPhase('results', msg, T().RESULTS_MS);
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
  /** Golf mode: total strokes so far (a hole someone missed counts as the worst stroke count anybody had there). */
  function golfTotals() {
    const out = {}, worst = [];
    for (const c of Object.values(match.card)) c.forEach((v, i) => { if (v != null) worst[i] = Math.max(worst[i] ?? 0, v); });
    for (const [pid, c] of Object.entries(match.card)) out[pid] = worst.reduce((a, w, i) => a + (c[i] ?? w ?? 0), 0);
    return out;
  }
  function standings() {
    let rows;
    if (match.mode === 'golf') {
      const T = golfTotals();
      rows = Object.keys(match.card).map(Number).filter(pid => members.has(pid)).map(pid => ({ pid, strokes: T[pid], points: match.points[pid] || 0, wins: match.wins[pid] || 0 })).sort((a, b) => a.strokes - b.strokes || b.wins - a.wins);
      rows.forEach((r, i) => { const p = rows[i - 1]; r.place = p && p.strokes === r.strokes ? p.place : i + 1; });
      return rows;
    }
    if (match.mode === 'board' && match.goal) {         // first to X: tickets + ribbons at their price decide it
      rows = boardStandings(match.board.S).map(r => ({ ...r, worth: worthOf(r.pid), wins: match.wins[r.pid] || 0 })).sort((a, b) => b.worth - a.worth || b.ribbons - a.ribbons);
      rows.forEach((r, i) => { const p = rows[i - 1]; r.place = p && p.worth === r.worth && p.ribbons === r.ribbons ? p.place : i + 1; });
    } else if (match.mode === 'board') rows = boardStandings(match.board.S).map(r => ({ ...r, wins: match.wins[r.pid] || 0 }));
    else {
      rows = Object.keys(match.points).map(Number).filter(pid => members.has(pid)).map(pid => ({ pid, points: match.points[pid], wins: match.wins[pid] || 0 })).sort((a, b) => b.points - a.points || b.wins - a.wins);
      rows.forEach((r, i) => { const p = rows[i - 1]; r.place = p && p.points === r.points && p.wins === r.wins ? p.place : i + 1; });
    }
    return rows;
  }
  function finish() {
    if (match.mode === 'board' && !match.bonusDone && !match.goal) {                 // the closing ceremony: bonus ribbons first
      match.bonusDone = true;
      const awards = match.board.bonus(match.wins);
      if (awards.length) return setPhase('bonus', { awards }, T().BONUS_MS);
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
    const reel = buildHighlights({ ...match.reel, stats: match.board?.S.stats || null, wins: match.wins, players: rows.map(r => r.pid) }, pid => members.get(pid)?.name || 'Someone');
    match.pass?.finish({ rows, teams, quick: match.quick, again: match.again });   // M7: Fair Pass (before the final screen, so its sticker block is ready)
    report('final', { mode, players: rows.length, rounds: match.round, games: match.played.length, minutes: Math.round((now() - match.startedAt) / 6000) / 10, quick: match.quick, again: match.again });
    again.clear();
    setPhase('final', { standings: rows, payout, mode, teams, reel, ...(match.storyEnd ? { story: match.storyEnd } : {}) }, TIMES.FINAL_MS);
  }
  /**
   * Expansion 1 M2: the same match again — same seats, CPUs and settings. People who have left are dropped (startMatch
   * removes a seat whose phone is gone), anyone waiting for a seat takes one, the CPUs keep theirs.
   */
  function rematch() {
    const by = members.get(hostPid) || members.get(ownerPid);
    match = null; game = null; vote = null; phase = 'lobby';
    for (const m of members.values()) m.ready = !!m.cpu;
    syncCpus(true); promote(); againNext = true;
    if (!by || startMatch(by) === false) { againNext = false; again.clear(); setPhase('lobby'); }
  }
  function toLobby() { again.clear(); match = null; game = null; vote = null; for (const m of members.values()) { m.ready = m.cpu ? true : false; } phase = 'lobby'; syncCpus(true); promote(); setPhase('lobby'); }   // CPUs make room for anyone waiting, then they sit

  // ---------------------------------------------------------------- messages
  const err = (m, code2, msg) => { send(m, { t: 'err', code: code2, msg }); return false; };
  function message(m, msg) {
    if (phase === 'story' && (msg.t === 'vote' || msg.t === 'skip')) return match?.story?.act(m, msg);   // M8: a story card's pick / Next
    switch (msg.t) {
      case 'ready': m.ready = msg.on; return syncRoom();
      case 'profile': {                                   // (the hub has already cleaned and saved it)
        if (msg.name) m.name = msg.name; if (msg.look) m.look = msg.look; if (msg.costume !== undefined) m.costume = msg.costume;
        return syncRoom();
      }
      case 'opt': {
        if (!isAdmin(m) || phase !== 'lobby') return;
        const o = OPTS[msg.key];
        if (msg.key === 'pool') { if (Array.isArray(msg.value)) opts.pool = msg.value.filter(id => typeof id === 'string' && GAMES[id]).slice(0, 120); }
        else if (!o) return;
        else if (o.values) { if (o.values.includes(msg.value)) opts[msg.key] = msg.value; }   // (teams: true / false)
        else if (Number.isInteger(msg.value)) opts[msg.key] = Math.max(o.min, Math.min(o.max, msg.value));
        syncCpus(true);
        return syncRoom();
      }
      case 'start': return startMatch(m);
      case 'quick': {                                     // Expansion 1 M2: Quick Match — a board match sized to ~10 minutes, started in one tap
        if (phase !== 'lobby' || !isAdmin(m)) return err(m, 'host', 'Only the host can start.');
        const n = Math.max(1, seated().length);
        opts.mode = 'board'; opts.goal = 0; opts.rounds = quickRounds({ players: n, pool: gamesFor(n, 'board'), times: T() });
        quickNext = true; syncCpus(true);
        if (startMatch(m) === false) { quickNext = false; syncRoom(); }
        return;
      }
      case 'again': {                                     // Expansion 1 M2: Play again — the host's tap (or everyone's) starts the same match again
        if (phase !== 'final' || m.seat == null || m.cpu) return;
        again.add(m.pid);
        if (isAdmin(m) || humansActive().every(a => again.has(a.pid))) return rematch();
        return syncRoom();
      }
      case 'end': if (isAdmin(m) && phase !== 'lobby') { report('quit', { mode: match?.mode || null, round: match?.round || 0, rounds: match?.rounds ?? null, players: active().length, phase, minutes: match ? Math.round((now() - match.startedAt) / 6000) / 10 : 0 }); toLobby(); } return;
      case 'kick': { const k = members.get(msg.pid); if (isAdmin(m) && k && k.pid !== m.pid && k.pid !== ownerPid && (k.pid !== hostPid || m.pid === ownerPid)) kickOut(k, 'host'); return; }
      case 'votekick': {                                  // round 10 (#26): anyone seated may ask; others say yes; the target can't vote
        const k = members.get(msg.pid);
        if (m.seat == null || !k || k.pid === m.pid || k.display || k.cpu) return;   // a CPU is the host's to remove
        if (!kickVote || kickVote.target !== k.pid) { if (kickVote && now() < kickVote.until) return err(m, 'kickvote', 'A kick vote is already running.'); kickVote = { target: k.pid, by: new Set(), until: now() + TIMES.KICKVOTE_MS }; }
        kickVote.by.add(m.pid);
        if (kickVote.by.size >= kickNeed()) { kickOut(k, 'vote'); return syncRoom(); }
        return syncRoom();
      }
      case 'pick': {                                      // round 10: Custom mode — the host picks the next minigame
        if (phase !== 'pick' || !isAdmin(m)) return;
        if (msg.id === 'finish') return finish();
        if (!gamesFor(active().length || 1).includes(msg.id)) return err(m, 'pick', 'That minigame does not fit this many players.');
        return startGame(msg.id);
      }
      case 'roll': if (phase === 'board' && match?.board) match.board.roll(m.pid, now()); return;
      case 'choose': if (phase === 'board' && match?.board) match.board.choose(m.pid, msg.i, now()); return;
      case 'card': if (phase === 'board' && match?.board) match.board.playCard(m.pid, msg.i, now()); return;
      case 'vote': {
        if ((phase !== 'vote' && phase !== 'continue') || m.seat == null || !(msg.i >= 0 && msg.i < vote.options.length)) return;
        vote.votes[m.pid] = msg.i; cast({ t: 'votes', votes: vote.votes });
        if (humansActive().every(a => a.pid in vote.votes) && (phase === 'continue' || active().every(a => a.pid in vote.votes))) until = Math.min(until, now() + 700);
        return;
      }
      case 'skip': {
        if ((phase !== 'intro' && phase !== 'results' && phase !== 'final' && phase !== 'bonus') || m.seat == null) return;
        m.skip = true; cast({ t: 'skips', pids: active().filter(a => a.skip).map(a => a.pid) });
        if (humansActive().every(a => a.skip)) until = Math.min(until, now() + 400);
        return;
      }
      case 'in': {
        if (phase !== 'game' || !game || game.def.meta.kind !== 'arena' || !game.players.includes(m.pid)) return;
        m.queue.push({ s: msg.s, mx: Math.max(-1, Math.min(1, msg.mx)), mz: Math.max(-1, Math.min(1, msg.mz)), b: msg.b & (IN.A | IN.B) });
        if (m.queue.length > 12) { const old = m.queue.shift(); m.queue[0].b |= old.b; }   // hopelessly behind: drop the oldest step (never a button press)
        return;
      }
      case 'act': if (phase === 'game' && game?.inst.act && game.players.includes(m.pid)) game.inst.act(m.pid, msg.a, msg.d); return;
      case 'rate': {                                       // round 7: 👍/👎 + reasons for a minigame this member played here
        if (!(msg.v === 1 || msg.v === -1) || !playedBy.get(msg.game)?.has(m.pid)) return;
        const key = `${msg.game}:${m.pid}`, why = cleanReasons(msg.v, msg.why), prev = ratings.get(key);
        if (prev && prev.v === msg.v && prev.why.join() === why.join()) return;
        ratings.set(key, { v: msg.v, why });
        if (m.token) profiles?.rated?.(m.token, msg.game, msg.v, why);              // round 10 (#28): the "My games" like history
        report('rate', { game: msg.game, v: msg.v, why, change: !!prev, players: playedBy.get(msg.game).size, difficulty: opts.difficulty, mode: match?.mode || null, voter: `${code}:${m.pid}` });
        return send(m, { t: 'rated', game: msg.game, v: msg.v, why });
      }
      case 'chat': {                                      // report #34: anyone in the room, shown to everyone in it
        const text = cleanChat(msg.text); if (!text) return;
        const line = { t: 'chat', pid: m.pid, name: m.name, seat: m.seat, text };
        chatLog.push(line); while (chatLog.length > 12) chatLog.shift();
        return cast(line);
      }
      case 'emote': if (m.seat != null) cast({ t: 'emote', pid: m.pid, e: String(msg.e).replace(/[^a-z]/gi, '').slice(0, 12) }); return;
    }
  }

  // ---------------------------------------------------------------- the clock
  function tick() {
    tickNo++;
    const t = now();
    // Report #40: in a match a player gone for GONE_MATCH_MS (2 min, was 5) leaves the board for good; until then they are
    // shown as away and the board plays their turns at once. A match whose phones are ALL asleep (a break) loses nobody:
    // the gone clock only runs while someone is still playing (the hold below), so everyone comes back to their seats.
    const someoneHere = people().some(m => m.connected && !m.display), lastTickAt = prevTickAt ?? t; prevTickAt = t;
    for (const m of [...members.values()]) {
      if (m.connected || m.goneAt == null) continue;
      if (phase !== 'lobby' && !someoneHere) { m.goneAt += t - lastTickAt; continue; }
      if (t - m.goneAt > (phase === 'lobby' ? TIMES.GONE_LOBBY_MS : TIMES.GONE_MATCH_MS)) remove(m);
    }
    if (kickVote && (t >= kickVote.until || !members.has(kickVote.target))) { kickVote = null; syncRoom(); }
    if (phase === 'lobby') return;
    if (!people().some(m => m.connected && !m.display)) return;                       // every phone is asleep: hold everything where it is (CPUs wait too)
    switch (phase) {
      case 'board': cpuBoard(t); match.board.tick(t); if (match.board.roundDone) { noteSwings(); startVote(); } break;
      case 'vote': cpuVotes(t); if (t >= until) endVote(); break;
      case 'continue': if (t >= until) { const v = Object.values(vote.votes), stop = v.filter(i => i === 1).length > v.filter(i => i === 0).length; cast({ t: 'voted', pick: stop ? 1 : 0, id: stop ? 'finish' : 'keep' }); vote = null; if (stop) finish(); else nextRound(); } break;   // a tie keeps the fair open
      case 'intro': if (t >= until) beginPlay(); break;
      case 'game': tickGame(); break;
      case 'results': if (t >= until) nextRound(); break;
      case 'bonus': if (t >= until) finish(); break;
      case 'story': match.story?.tick(t); break;                                   // M8
      case 'pick': break;                                  // waits for the host (pick / finish); a new host takes over if they leave
      case 'final': if (t >= until) toLobby(); break;
    }
  }
  /** Expansion 1 M1: the CPUs' turns on the board (each at a person's pace; same messages a phone sends). */
  function cpuBoard(t) {
    for (const m of seated()) { if (!m.cpu) continue; const mv = boardMove(match.board, m.pid, t, m.cpu.skill, cpuRng, (m.cpuMem ||= {})); if (mv) message(m, mv); }
  }
  /** ... and their vote: a card a moment after the vote opens (people's votes count first, see endVote). */
  function cpuVotes(t) {
    if (!vote) return;
    vote.cpuAt ||= {};
    for (const m of active()) { if (!m.cpu || m.pid in vote.votes) continue; vote.cpuAt[m.pid] ??= t + 1500 + cpuRng() * 3500; if (t >= vote.cpuAt[m.pid]) message(m, { t: 'vote', i: Math.floor(cpuRng() * vote.options.length) }); }
  }
  /** Round 7: what "Find a game" shows for this room — null unless the host made it public. No tokens, no addresses. */
  function listing() {
    if (!opts.public) return null;
    const seatedN = seated().filter(m => !m.cpu).length, host = members.get(hostPid) || (ownerPid != null ? { name: 'TV' } : null);
    if (!people().some(m => m.connected)) return null;
    return { code, host: host?.name || 'Someone', players: seatedN, seats: MAX_SEATS, phase: phase === 'lobby' ? 'lobby' : 'playing', mode: opts.mode, board: opts.mode === 'board' ? opts.board : null, round: match?.round || 0, rounds: match?.rounds || null, season: season() };
  }
  return {
    code, join, disconnect, remove, message, tick, listing, rekey,
    /** Round 12 (owner): a TV that made the room owns it — no seat, never waited for, keeps the room open. */
    setOwner(m, { public: pub = false, guestHost: gh = true } = {}) { if (!m?.display) return; ownerPid = m.pid; opts.public = !!pub; guestHost = gh !== false; if (hostPid === m.pid) hostPid = null; pickHost(true); syncRoom(); },
    get owner() { return ownerPid; },
    get phase() { return phase; }, get host() { return hostPid; }, get members() { return members; }, get match() { return match; }, get game() { return game; }, get opts() { return opts; },
    get emptyFor() { return emptySince == null ? 0 : now() - emptySince; },
    get size() { return people().length; },                               // CPUs never keep a room open
  };
}
