// The board game between minigames, as rules only (no drawing, no clock of its own). One player's turn:
//   roll (a tap, or the timer rolls for you) -> walk space by space -> stop to ASK at a crossroads or when passing a
//   prize booth with enough tickets -> land -> the space's effect -> next player. When everyone has had a turn the
//   round is over and the room moves on to the minigame vote.
// The room drives it: call tick(now) every server tick and roll()/choose() from player messages; every visible thing
// that happens is handed to emit(event) for the room to broadcast. Pure: seeded rng in, events out.

export const BOARD = Object.freeze({
  ROLL_MS: 12000, DICE_MS: 1100, STEP_MS: 330, ASK_MS: 8000, FX_MS: 1700, CHANCE_MS: 3400,
  RIBBON_COST: 10, LAP_BONUS: 5, DIE: 6,
});

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
  };
  for (const pid of order) { S.pos[pid] = def.start; S.tickets[pid] = 5; S.ribbons[pid] = 0; }
  const name = pid => names[pid] || 'Player';
  const give = (pid, n) => { const before = S.tickets[pid]; S.tickets[pid] = Math.max(0, before + n); return S.tickets[pid] - before; };
  const others = pid => S.order.filter(p => p !== pid);
  const fill = (text, p, o) => text.replaceAll('{p}', name(p)).replaceAll('{o}', o != null ? name(o) : 'nobody');

  function addPlayer(pid) { if (pid in S.pos) return; S.order.push(pid); S.pos[pid] = def.start; S.tickets[pid] = 5; S.ribbons[pid] = 0; }
  function dropPlayer(pid) {
    const i = S.order.indexOf(pid); if (i < 0) return;
    S.order.splice(i, 1);
    if (i < S.turn) S.turn--; else if (i === S.turn) { S.turn--; S.sub = 'next'; S.until = 0; }
  }

  function beginRound(now) { S.roundDone = false; S.turn = -1; nextTurn(now); }
  function nextTurn(now) {
    S.turn++; S.ask = null;
    if (S.turn >= S.order.length) { S.sub = 'idle'; S.pid = null; S.roundDone = true; emit({ ev: 'roundEnd' }); return; }
    S.pid = S.order[S.turn]; S.sub = 'roll'; S.until = now + BOARD.ROLL_MS;
    emit({ ev: 'turn', pid: S.pid, ms: BOARD.ROLL_MS });
  }
  function roll(pid, now, forced = null) {
    if (S.sub !== 'roll' || pid !== S.pid) return false;
    S.rolled = forced ?? rng.int(1, BOARD.DIE); S.left = S.rolled;
    S.sub = 'dice'; S.until = now + BOARD.DICE_MS;
    emit({ ev: 'rolled', pid, n: S.rolled });
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
      S.pos[pid] = to; S.left--; path.push(to);
      const sp = byId.get(to);
      if (sp.type === 'start') { give(pid, BOARD.LAP_BONUS); path.lap = true; }
      if (sp.type === 'booth' && S.tickets[pid] >= BOARD.RIBBON_COST) { S.ask = { kind: 'booth', options: [`Buy a ribbon (${BOARD.RIBBON_COST} tickets)`, 'Not now'], at: to }; break; }
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
    if (ask.kind === 'booth') {
      if (i === 0 && S.tickets[pid] >= BOARD.RIBBON_COST) { give(pid, -BOARD.RIBBON_COST); S.ribbons[pid]++; emit({ ev: 'fx', pid, kind: 'ribbon', at: ask.at, text: `${name(pid)} buys a ribbon!`, tickets: S.tickets[pid], ribbons: S.ribbons[pid] }); S.ask = null; S.sub = 'pause'; S.until = now + BOARD.FX_MS; return true; }
      S.ask = null;
    } else { ask.answered = true; ask.answer = i; }
    if (S.left > 0) walk(now); else land(now);
    return true;
  }
  function land(now) {
    const pid = S.pid, sp = byId.get(S.pos[pid]);
    let ms = BOARD.FX_MS;
    const fx = { ev: 'fx', pid, at: sp.id, kind: sp.type };
    if (sp.type === 'ticket' || sp.type === 'join') { fx.kind = 'ticket'; fx.d = give(pid, 3); fx.text = `${name(pid)}: +3 tickets`; }
    else if (sp.type === 'jackpot') { fx.d = give(pid, 8); fx.text = `Jackpot! ${name(pid)}: +8 tickets`; }
    else if (sp.type === 'pit') { fx.d = give(pid, -3); fx.text = fx.d ? `Splat. ${name(pid)} loses ${-fx.d} ticket${fx.d === -1 ? '' : 's'}` : `Splat. ${name(pid)} had nothing to lose`; }
    else if (sp.type === 'mirror') { const o = others(pid); if (o.length) { const w = rng.pick(o); [S.pos[pid], S.pos[w]] = [S.pos[w], S.pos[pid]]; fx.kind = 'swap'; fx.with = w; fx.text = `${name(pid)} and ${name(w)} swap places!`; } else fx.text = 'Nobody to swap with.'; }
    else if (sp.type === 'chance') { Object.assign(fx, spin(pid)); ms = BOARD.CHANCE_MS; }
    else { fx.kind = 'none'; fx.text = ''; ms = 500; }
    fx.pos = { ...S.pos }; fx.tickets = { ...S.tickets }; fx.ribbons = { ...S.ribbons };
    emit(fx);
    S.sub = 'fx'; S.until = now + ms;
  }
  function spin(pid) {
    const list = chance.events, total = list.reduce((s, e) => s + e.w, 0);
    let r = rng() * total, ev = list[0]; for (const e of list) { r -= e.w; if (r <= 0) { ev = e; break; } }
    const o = others(pid), w = o.length ? rng.pick(o) : null;
    const out = { kind: 'chance', id: ev.id };
    switch (ev.do) {
      case 'tickets': out.d = give(pid, ev.n); break;
      case 'all': for (const p of S.order) give(p, ev.n); break;
      case 'steal': if (w != null) { const got = -give(w, -ev.n); give(pid, got); out.d = got; out.with = w; } break;
      case 'give': if (w != null) { const got = -give(pid, -ev.n); give(w, got); out.d = -got; out.with = w; } break;
      case 'robin': { const top = S.order.filter(p => p !== pid).sort((a, b) => S.tickets[b] - S.tickets[a])[0]; if (top != null) { const got = -give(top, -ev.n); give(pid, got); out.d = got; out.with = top; } break; }
      case 'swap': if (w != null) { [S.pos[pid], S.pos[w]] = [S.pos[w], S.pos[pid]]; out.with = w; out.swap = true; } break;
      case 'move': { let at = S.pos[pid]; const moved = [];
        if (ev.n > 0) for (let i = 0; i < ev.n; i++) { at = byId.get(at).next[0]; moved.push(at); }
        else for (let i = 0; i < -ev.n; i++) { const prev = def.spaces.find(s => s.next[0] === at) || def.spaces.find(s => s.next.includes(at)); if (!prev) break; at = prev.id; moved.push(at); }
        S.pos[pid] = at; out.path = moved; break; }
      case 'ribbon': S.ribbons[pid]++; break;
    }
    out.text = fill(ev.text, pid, out.with ?? w);
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
    }
  }
  const view = () => ({ order: S.order, pos: S.pos, tickets: S.tickets, ribbons: S.ribbons, pid: S.pid, sub: S.sub, until: S.until, rolled: S.rolled, ask: S.sub === 'ask' && S.ask ? { kind: S.ask.kind, options: S.ask.options } : null });
  return { S, byId, beginRound, roll, choose, tick, view, give, addPlayer, dropPlayer, get roundDone() { return S.roundDone; } };
}

/** Final order: ribbons first, then tickets. -> [{ pid, ribbons, tickets, place }] (equal on both = the same place). */
export function boardStandings(S) {
  const rows = S.order.map(pid => ({ pid, ribbons: S.ribbons[pid], tickets: S.tickets[pid] })).sort((a, b) => b.ribbons - a.ribbons || b.tickets - a.tickets);
  rows.forEach((r, i) => { const p = rows[i - 1]; r.place = p && p.ribbons === r.ribbons && p.tickets === r.tickets ? p.place : i + 1; });
  return rows;
}
