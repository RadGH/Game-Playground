// The board game between minigames, as rules only (no drawing, no clock of its own). One player's turn:
//   roll (a tap, or the timer rolls for you) -> walk space by space -> stop to ASK at a crossroads or when passing a
//   prize booth with enough tickets -> land -> the space's effect -> next player. When everyone has had a turn the
//   round is over and the room moves on to the minigame vote.
// The room drives it: call tick(now) every server tick and roll()/choose() from player messages; every visible thing
// that happens is handed to emit(event) for the room to broadcast. Pure: seeded rng in, events out.

export const BOARD = Object.freeze({
  ROLL_MS: 12000, DICE_MS: 1100, STEP_MS: 330, ASK_MS: 8000, FX_MS: 1700, CHANCE_MS: 3400, BULLETIN_MS: 4200, DUEL_MS: 3200,
  RIBBON_COST: 10, LAP_BONUS: 5, DIE: 6, TICKET: 3, JACKPOT: 8, PIT: 3, DUEL: 4, BUMPER: 3,
  DUCKS: [1, 2, 3, 4, 6, 8, 10],               // what a duck can hide (three are drawn each time)
});
/** Round 5 (2026-10-22): the Fair Bulletin. Each round after the first draws one of `chance.bulletins` (weighted); the
 *  last round is always Last Call. `mods` change the round's numbers: ticket / pit (amounts), mul (multiplies ticket
 *  stands, jackpots and puddles), ribbonCost, gameMul (the minigame's tickets), duckMul, duel (tickets a duel takes);
 *  and one-off things done as the bulletin is read: parade (everyone hops n), pinata [lo, hi] (everyone gets that many),
 *  underdog (whoever is last gets a golden die). */
export const LAST_CALL = { id: 'lastcall', title: 'Last Call!', text: 'Final round! Ticket stands, jackpots and puddles all count double.', mods: { mul: 2 } };

export function indexBoard(def) {
  const byId = new Map(def.spaces.map(s => [s.id, s]));
  for (const s of def.spaces) for (const n of s.next) if (!byId.has(n)) throw new Error(`board ${def.id}: ${s.id} leads to unknown space ${n}`);
  if (!byId.has(def.start)) throw new Error(`board ${def.id}: no start space`);
  return byId;
}

export function createBoardMatch({ def, chance, order, rng, names = {}, emit = () => {} }) {
  const byId = indexBoard(def);
  const S = {
    order: order.slice(), pos: {}, tickets: {}, ribbons: {},
    turn: -1, pid: null, sub: 'idle', until: 0, left: 0, ask: null, rolled: 0, roundDone: false,
    boost: {}, stats: {}, bulletin: null, mods: {},
  };
  const newStats = () => ({ earned: 0, lost: 0, walked: 0, duels: 0, chance: 0 });
  for (const pid of order) { S.pos[pid] = def.start; S.tickets[pid] = 5; S.ribbons[pid] = 0; S.stats[pid] = newStats(); }
  const name = pid => names[pid] || 'Player';
  /** Tickets in or out; returns what actually moved. `count` = false for the minigame's payout (not a board stat). */
  const give = (pid, n, count = true) => {
    const before = S.tickets[pid]; S.tickets[pid] = Math.max(0, before + n); const d = S.tickets[pid] - before;
    const st = S.stats[pid]; if (count && st) { if (d > 0) st.earned += d; else st.lost -= d; }
    return d;
  };
  const mod = (k, def0) => S.mods[k] ?? def0;
  const mul = () => mod('mul', 1);
  const ribbonCost = () => mod('ribbonCost', BOARD.RIBBON_COST);
  const prevOf = at => (def.spaces.find(s => s.next[0] === at) || def.spaces.find(s => s.next.includes(at)))?.id;
  const others = pid => S.order.filter(p => p !== pid);
  const fill = (text, p, o) => text.replaceAll('{p}', name(p)).replaceAll('{o}', o != null ? name(o) : 'nobody');

  function addPlayer(pid) { if (pid in S.pos) return; S.order.push(pid); S.pos[pid] = def.start; S.tickets[pid] = 5; S.ribbons[pid] = 0; S.stats[pid] = newStats(); }
  function dropPlayer(pid) {
    const i = S.order.indexOf(pid); if (i < 0) return;
    S.order.splice(i, 1);
    if (i < S.turn) S.turn--; else if (i === S.turn) { S.turn--; S.sub = 'next'; S.until = 0; }
  }

  /** A round: the Fair Bulletin (from round 2; the last round is Last Call), then everyone's turn. */
  function beginRound(now, round = 1, rounds = null) {
    S.roundDone = false; S.turn = -1; S.mods = {}; S.bulletin = null;
    const list = chance.bulletins || [];
    let b = null;
    if (rounds != null && round >= rounds && round > 1) b = LAST_CALL;
    else if (round > 1 && list.length) { const total = list.reduce((t, e) => t + e.w, 0); let r = rng() * total; b = list[0]; for (const e of list) { r -= e.w; if (r <= 0) { b = e; break; } } }
    if (!b) return nextTurn(now);
    S.bulletin = b; S.mods = { ...(b.mods || {}) };
    const ev = { ev: 'bulletin', id: b.id, title: b.title, text: b.text, round };
    if (S.mods.parade) { const moved = {}; for (const pid of S.order) moved[pid] = stepForward(pid, S.mods.parade); ev.moved = moved; }
    if (S.mods.pinata) { const [lo, hi] = S.mods.pinata; ev.got = {}; for (const pid of S.order) ev.got[pid] = give(pid, rng.int(lo, hi)); }
    if (S.mods.underdog) { const last = standingsOf().at(-1); if (last && S.order.length > 1) { S.boost[last.pid] = 'gold'; ev.with = last.pid; ev.text += ` (${name(last.pid)} gets it.)`; } }
    Object.assign(ev, { pos: { ...S.pos }, tickets: { ...S.tickets }, ribbons: { ...S.ribbons } });
    emit(ev);
    S.sub = 'bulletin'; S.until = now + BOARD.BULLETIN_MS;
  }
  const standingsOf = () => S.order.map(pid => ({ pid, r: S.ribbons[pid], t: S.tickets[pid] })).sort((a, b) => b.r - a.r || b.t - a.t);
  /** Hop n spaces along the main way (passing the gate pays the lap bonus). -> the spaces walked. */
  function stepForward(pid, n) {
    const path = []; let at = S.pos[pid];
    for (let i = 0; i < n; i++) { at = byId.get(at).next[0]; path.push(at); if (byId.get(at).type === 'start') give(pid, BOARD.LAP_BONUS); }
    S.pos[pid] = at; if (S.stats[pid]) S.stats[pid].walked += path.length; return path;
  }
  function nextTurn(now) {
    S.turn++; S.ask = null;
    if (S.turn >= S.order.length) { S.sub = 'idle'; S.pid = null; S.roundDone = true; emit({ ev: 'roundEnd' }); return; }
    S.pid = S.order[S.turn]; S.sub = 'roll'; S.until = now + BOARD.ROLL_MS;
    emit({ ev: 'turn', pid: S.pid, ms: BOARD.ROLL_MS });
  }
  function roll(pid, now, forced = null) {
    if (S.sub !== 'roll' || pid !== S.pid) return false;
    const boost = S.boost[pid]; delete S.boost[pid];
    let dice = [rng.int(1, BOARD.DIE)];
    if (boost === 'gold') dice.push(rng.int(1, BOARD.DIE));              // a golden die: two dice
    else if (boost === 'slow') dice = [rng.int(1, 3)];                    // sticky shoes: 1 to 3
    S.rolled = forced ?? dice.reduce((a, b) => a + b, 0); S.left = S.rolled;
    S.sub = 'dice'; S.until = now + BOARD.DICE_MS;
    emit({ ev: 'rolled', pid, n: S.rolled, ...(boost && forced == null ? { dice, boost } : {}) });
    return true;
  }
  /** Walk until the steps run out or something needs an answer. Emits one `step` with the spaces walked. */
  function walk(now) {
    const pid = S.pid, path = [];
    while (S.left > 0) {
      const here = byId.get(S.pos[pid]);
      if (here.next.length > 1 && !S.ask?.answered) { S.ask = { kind: 'fork', options: here.labels || here.next.map((_, i) => 'Path ' + (i + 1)), at: here.id }; break; }
      const to = here.next[here.next.length > 1 ? S.ask.answer : 0];
      if (S.ask?.kind === 'fork') S.ask = null;
      S.pos[pid] = to; S.left--; path.push(to); S.stats[pid].walked++;
      const sp = byId.get(to);
      if (sp.type === 'start') { give(pid, BOARD.LAP_BONUS); path.lap = true; }
      if (sp.type === 'booth' && S.tickets[pid] >= ribbonCost()) { S.ask = { kind: 'booth', options: [`Buy a ribbon (${ribbonCost()} tickets)`, 'Not now'], at: to }; break; }
    }
    const ms = path.length * BOARD.STEP_MS;
    if (path.length) emit({ ev: 'step', pid, path, ms, lap: !!path.lap, tickets: S.tickets[pid] });
    if (S.ask && !S.ask.answered) { S.sub = 'walk-ask'; S.until = now + ms; }
    else { S.sub = 'walk'; S.until = now + ms + 150; }
  }
  function openAsk(now) { S.sub = 'ask'; S.until = now + BOARD.ASK_MS; emit({ ev: 'ask', pid: S.pid, kind: S.ask.kind, options: S.ask.options, ms: BOARD.ASK_MS }); }
  function choose(pid, i, now) {
    if (S.sub !== 'ask' || pid !== S.pid || !S.ask || !(i >= 0 && i < S.ask.options.length)) return false;
    const ask = S.ask;
    emit({ ev: 'chose', pid, kind: ask.kind, i });
    if (ask.kind === 'duck') return pickDuck(pid, i, now);
    if (ask.kind === 'booth') {
      if (i === 0 && S.tickets[pid] >= ribbonCost()) { give(pid, -ribbonCost(), false); S.ribbons[pid]++; emit({ ev: 'fx', pid, kind: 'ribbon', at: ask.at, text: `${name(pid)} buys a ribbon!`, tickets: S.tickets[pid], ribbons: S.ribbons[pid] }); S.ask = null; S.sub = 'pause'; S.until = now + BOARD.FX_MS; return true; }
      S.ask = null;
    } else { ask.answered = true; ask.answer = i; }
    if (S.left > 0) walk(now); else land(now);
    return true;
  }
  function land(now) {
    const pid = S.pid, sp = byId.get(S.pos[pid]);
    let ms = BOARD.FX_MS;
    const fx = { ev: 'fx', pid, at: sp.id, kind: sp.type };
    if (sp.type === 'ticket' || sp.type === 'join') { const n = mod('ticket', BOARD.TICKET) * mul(); fx.kind = 'ticket'; fx.d = give(pid, n); fx.text = `${name(pid)}: +${n} tickets`; }
    else if (sp.type === 'jackpot') { fx.d = give(pid, BOARD.JACKPOT * mul()); fx.text = `Jackpot! ${name(pid)}: +${fx.d} tickets`; }
    else if (sp.type === 'pit') { fx.d = give(pid, -mod('pit', BOARD.PIT) * mul()); fx.text = fx.d ? `Splat. ${name(pid)} loses ${-fx.d} ticket${fx.d === -1 ? '' : 's'}` : `Splat. ${name(pid)} had nothing to lose`; }
    else if (sp.type === 'mirror') { const o = others(pid); if (o.length) { const w = rng.pick(o); [S.pos[pid], S.pos[w]] = [S.pos[w], S.pos[pid]]; fx.kind = 'swap'; fx.with = w; fx.text = `${name(pid)} and ${name(w)} swap places!`; } else fx.text = 'Nobody to swap with.'; }
    else if (sp.type === 'chance') { Object.assign(fx, spin(pid)); ms = BOARD.CHANCE_MS; S.stats[pid].chance++; }
    else if (sp.type === 'duel') { Object.assign(fx, duel(pid)); ms = BOARD.DUEL_MS; }
    else if (sp.type === 'ghost') {                                     // a friendly ghost: off to a random space on the loop
      const loop = []; let at = def.start; do { loop.push(at); at = byId.get(at).next[0]; } while (at !== def.start && loop.length < 200);
      const to = rng.pick(loop.filter(id => id !== sp.id && byId.get(id).type !== 'ghost')); S.pos[pid] = to; fx.kind = 'swap'; fx.text = `Boo! A friendly ghost whisks ${name(pid)} away to somewhere else on the pier.`;
    }
    else if (sp.type === 'bumper') { const path = stepForward(pid, BOARD.BUMPER); fx.path = path; fx.text = `Bumper cart! ${name(pid)} zooms ${path.length} spaces ahead.`; }
    else if (sp.type === 'duck') {
      const prizes = rng.shuffle(BOARD.DUCKS.slice()).slice(0, 3).map(n => n * mod('duckMul', 1));
      S.ask = { kind: 'duck', options: ['Yellow duck', 'Blue duck', 'Pink duck'], at: sp.id, prizes };
      emit({ ev: 'fx', pid, at: sp.id, kind: 'duckpond', text: `${name(pid)} fishes in the duck pond. Pick a duck!`, pos: { ...S.pos }, tickets: { ...S.tickets }, ribbons: { ...S.ribbons } });
      return openAsk(now);
    }
    else { fx.kind = 'none'; fx.text = ''; ms = 500; }
    fx.pos = { ...S.pos }; fx.tickets = { ...S.tickets }; fx.ribbons = { ...S.ribbons };
    emit(fx);
    S.sub = 'fx'; S.until = now + ms;
  }
  function pickDuck(pid, i, now) {
    const ask = S.ask; S.ask = null;
    const d = give(pid, ask.prizes[i]), colours = ['yellow', 'blue', 'pink'];
    const rest = ask.prizes.filter((_, k) => k !== i);
    emit({ ev: 'fx', pid, at: ask.at, kind: 'duck', d, prizes: ask.prizes, pick: i, text: `${name(pid)} picks the ${colours[i]} duck: +${d} tickets! (The others hid ${rest[0]} and ${rest[1]}.)`, pos: { ...S.pos }, tickets: { ...S.tickets }, ribbons: { ...S.ribbons } });
    S.sub = 'fx'; S.until = now + BOARD.CHANCE_MS;
    return true;
  }
  /** Dice Duel: you and someone picked at random each roll a die; the higher roll takes tickets from the lower. */
  function duel(pid) {
    const o = others(pid);
    if (!o.length) { const d = give(pid, 2); return { kind: 'duel', d, text: `Nobody to duel, so ${name(pid)} practises: +2 tickets.` }; }
    const w = rng.pick(o), a = rng.int(1, 6), b = rng.int(1, 6), stake = mod('duel', BOARD.DUEL);
    const out = { kind: 'duel', with: w, dice: [a, b] };
    if (a === b) { give(pid, 1); give(w, 1); out.d = 1; out.text = `Dice duel! ${name(pid)} ${a}, ${name(w)} ${b}. A draw: +1 each.`; }
    else { const [win, lose] = a > b ? [pid, w] : [w, pid]; const got = -give(lose, -stake); give(win, got); S.stats[win].duels++; out.winner = win; out.d = win === pid ? got : -got; out.text = `Dice duel! ${name(pid)} ${a}, ${name(w)} ${b}. ${name(win)} takes ${got} ticket${got === 1 ? '' : 's'}!`; }
    return out;
  }
  function spin(pid) {
    const list = chance.events, total = list.reduce((s, e) => s + e.w, 0);
    let r = rng() * total, ev = list[0]; for (const e of list) { r -= e.w; if (r <= 0) { ev = e; break; } }
    const o = others(pid), w = o.length ? rng.pick(o) : null;
    const out = { kind: 'chance', id: ev.id };
    let extra = '';
    switch (ev.do) {
      case 'tickets': out.d = give(pid, ev.n); break;
      case 'all': for (const p of S.order) give(p, ev.n); break;
      case 'steal': if (w != null) { const got = -give(w, -ev.n); give(pid, got); out.d = got; out.with = w; } break;
      case 'give': if (w != null) { const got = -give(pid, -ev.n); give(w, got); out.d = -got; out.with = w; } break;
      case 'robin': { const top = S.order.filter(p => p !== pid).sort((a, b) => S.tickets[b] - S.tickets[a])[0]; if (top != null) { const got = -give(top, -ev.n); give(pid, got); out.d = got; out.with = top; } break; }
      case 'swap': if (w != null) { [S.pos[pid], S.pos[w]] = [S.pos[w], S.pos[pid]]; out.with = w; out.swap = true; } break;
      case 'move': { if (ev.n > 0) out.path = stepForward(pid, ev.n);
        else { let at = S.pos[pid]; const moved = []; for (let i = 0; i < -ev.n; i++) { const p = prevOf(at); if (!p) break; at = p; moved.push(at); } S.pos[pid] = at; out.path = moved; }
        break; }
      case 'ribbon': S.ribbons[pid]++; break;
      // round 5
      case 'boost': S.boost[pid] = ev.boost; out.boost = ev.boost; break;
      case 'pinata': out.d = give(pid, ev.n); for (const p of o) give(p, ev.m ?? 1); break;
      case 'tax': { let got = 0; for (const p of o) if (S.tickets[p] > (ev.over ?? 10)) got += -give(p, -ev.n); give(pid, got); out.d = got; extra = got ? ` ${name(pid)} collects ${got}.` : ' Nobody is that rich yet!'; break; }
      case 'lowest': { const low = S.order.slice().sort((a, b) => S.tickets[a] - S.tickets[b])[0]; give(low, ev.n); out.with = low; if (low === pid) out.d = ev.n; break; }
      case 'tobooth': { const path = []; let at = S.pos[pid];
        for (let i = 0; i < def.spaces.length; i++) { at = byId.get(at).next[0]; path.push(at); if (byId.get(at).type === 'start') give(pid, BOARD.LAP_BONUS); if (byId.get(at).type === 'booth') break; }
        S.pos[pid] = at; out.path = path; S.stats[pid].walked += path.length;
        if (S.tickets[pid] >= ribbonCost()) { give(pid, -ribbonCost(), false); S.ribbons[pid]++; extra = ` ${name(pid)} buys a ribbon there!`; }
        break; }
      case 'allmove': out.moved = {}; for (const p of S.order) out.moved[p] = stepForward(p, ev.n); out.path = out.moved[pid]; break;
      case 'flip': { const win = rng.chance(0.5); out.d = give(pid, win ? ev.n : -ev.n); extra = win ? ` Heads! +${out.d} tickets.` : (out.d ? ` Tails. ${out.d} tickets.` : ' Tails, but there was nothing to lose.'); break; }
      case 'shuffle': { const spots = S.order.map(p => S.pos[p]); const mixed = rng.shuffle(spots.slice()); S.order.forEach((p, i) => { S.pos[p] = mixed[i]; }); out.swap = true; break; }
      case 'ribbonother': if (w != null) { S.ribbons[w]++; out.with = w; } else S.ribbons[pid]++; break;
      case 'tostart': { const path = []; let at = S.pos[pid]; for (let i = 0; i < def.spaces.length && at !== def.start; i++) { at = byId.get(at).next[0]; path.push(at); } S.pos[pid] = at; give(pid, BOARD.LAP_BONUS); out.path = path; S.stats[pid].walked += path.length; break; }
      case 'treat': { const spent = -give(pid, -(ev.n * o.length)); let each = o.length ? Math.floor(spent / o.length) : 0; for (const p of o) give(p, each); out.d = -spent; break; }
      case 'swaptickets': if (w != null) { const a = S.tickets[pid], b = S.tickets[w]; give(pid, b - a); give(w, a - b); out.with = w; out.d = b - a; } break;
    }
    out.text = fill(ev.text, pid, out.with ?? w) + extra;
    return out;
  }
  /** End of the match (board mode): bonus ribbons, like a fair's closing ceremony. Two of the awards are drawn from
   *  the seed each match; an award goes to everyone tied for the most, and is skipped when nobody earned it.
   *  `wins` = minigames won (the room's count). Adds the ribbons; returns [{ id, title, text, pids, value }]. */
  function bonus(wins = {}) {
    const AW = [
      { id: 'star', title: 'Minigame Star', text: 'Most minigames won', v: p => wins[p] || 0 },
      { id: 'magnet', title: 'Ticket Magnet', text: 'Most tickets picked up on the board', v: p => S.stats[p]?.earned || 0 },
      { id: 'walker', title: 'Long Walker', text: 'Most spaces walked', v: p => S.stats[p]?.walked || 0 },
      { id: 'unlucky', title: 'Bad Luck Charm', text: 'Most tickets lost on the board', v: p => S.stats[p]?.lost || 0 },
      { id: 'duelist', title: 'Dice Champion', text: 'Most dice duels won', v: p => S.stats[p]?.duels || 0 },
      { id: 'spinner', title: 'Wheel Fan', text: 'Landed on the Wheel of Whatever most', v: p => S.stats[p]?.chance || 0 },
    ];
    if (S.order.length < 2) return [];
    const out = [];
    for (const a of rng.shuffle(AW.slice())) {
      const vals = S.order.map(p => a.v(p)), best = Math.max(...vals);
      if (best <= 0) continue;
      const pids = S.order.filter(p => a.v(p) === best);
      if (pids.length === S.order.length) continue;                   // everyone tied: no award
      for (const p of pids) S.ribbons[p]++;
      out.push({ id: a.id, title: a.title, text: a.text, pids, value: best });
      if (out.length >= 2) break;
    }
    return out;
  }
  function tick(now) {
    if (S.sub === 'idle' || now < S.until) return;
    switch (S.sub) {
      case 'roll': roll(S.pid, now); break;                                   // the timer rolls for you
      case 'dice': walk(now); break;
      case 'walk-ask': openAsk(now); break;
      case 'ask': choose(S.pid, S.ask.kind === 'fork' ? 0 : 0, now); break;    // no answer: the long way / buy the ribbon
      case 'pause': if (S.left > 0) walk(now); else land(now); break;
      case 'walk': if (S.left > 0) walk(now); else land(now); break;
      case 'fx': case 'next': nextTurn(now); break;
      case 'bulletin': nextTurn(now); break;
    }
  }
  const view = () => ({ order: S.order, pos: S.pos, tickets: S.tickets, ribbons: S.ribbons, pid: S.pid, sub: S.sub, until: S.until, rolled: S.rolled, ask: S.sub === 'ask' && S.ask ? { kind: S.ask.kind, options: S.ask.options } : null, bulletin: S.bulletin ? { id: S.bulletin.id, title: S.bulletin.title, text: S.bulletin.text } : null, boost: S.boost });
  return { S, byId, beginRound, roll, choose, tick, view, give, addPlayer, dropPlayer, bonus, gameMul: () => mod('gameMul', 1), get roundDone() { return S.roundDone; } };
}

/** Final order: ribbons first, then tickets. -> [{ pid, ribbons, tickets, place }] (equal on both = the same place). */
export function boardStandings(S) {
  const rows = S.order.map(pid => ({ pid, ribbons: S.ribbons[pid], tickets: S.tickets[pid] })).sort((a, b) => b.ribbons - a.ribbons || b.tickets - a.tickets);
  rows.forEach((r, i) => { const p = rows[i - 1]; r.place = p && p.ribbons === r.ribbons && p.tickets === r.tickets ? p.place : i + 1; });
  return rows;
}
