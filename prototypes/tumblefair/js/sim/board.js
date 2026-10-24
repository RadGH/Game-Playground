// The board game between minigames, as rules only (no drawing, no clock of its own). One player's turn:
//   roll (a tap, or the timer rolls for you) -> walk space by space -> stop to ASK at a crossroads -> land -> the
//   space's effect (often a live EVENT that players play on their phones) -> next player. When everyone has had a turn
//   the round is over and the room moves on to the minigame vote.
// Move cards (round 9, live report #16 "card mode instead of dice"): with `moves: 'cards'` every player holds a hand of
// HAND move cards (1 to 6). On your turn you play one of yours (you know what you get) or draw a face-down card from a
// random rival's hand and walk that (it could be anything; they draw a fresh one). A played card is replaced from the
// deck straight away. A golden die adds a roll to the card; sticky shoes cap it at 3. No answer: your first card.
// Round 12 (2026-10-24, owner: "more interactive… better presentation and pacing"): landing on most special spaces opens
// a live EVENT (`S.ev`, sub 'event') that one, two or all players play with taps — a real dice duel (both tap to roll),
// the High Striker (tap in time), the Wheel of Whatever you stop yourself, the Shell Game, Steal or Share, the Tomato
// Toss (everyone votes who gets sent back), the Fortune Teller (pick one of three face-down cards). Every event has a
// timer that answers for anyone who doesn't (so a sleeping phone never holds the board up) and `botChoice()` says what
// a bot would press. Board mechanics added with it: prize cards you hold and play before rolling (Double Die, Whoopee
// Cushion trap, Express Pass), a toll on the shortcut, and the one-way cannon. Prize booths buy automatically.
// Inputs all arrive through choose(pid, i): an event's tap, a card from your prize hand during 'roll' (i = slot), or an
// answer to an ask. The room drives it: call tick(now) every server tick; every visible thing that happens is handed
// to emit(event) for the room to broadcast. Pure: seeded rng in, events out.
import { strikePower, wheelSeg, shellAfter, cleanTapMs } from '../shared/board-rules.js';

export const BOARD = Object.freeze({
  // round 12 pacing: ROLL 12000 -> 9000, DICE 1100 -> 700, STEP 330 -> 270, ASK 8000 -> 6000, FX 1700 -> 1300,
  // plain spaces 500 -> 300, BULLETIN 4200 -> 2600 (the bulletin stays up as a small tag after)
  ROLL_MS: 9000, DICE_MS: 700, STEP_MS: 270, ASK_MS: 6000, FX_MS: 1300, PLAIN_MS: 300, CHANCE_MS: 2400, BULLETIN_MS: 2600, DUEL_MS: 2000,
  RIBBON_MS: 900, TRAP_MS: 1300, CANNON_MS: 1700, REVEAL_MS: 1700,
  HAND: 4, RIBBON_COST: 10, LAP_BONUS: 5, DIE: 6, TICKET: 3, JACKPOT: 8, PIT: 3, DUEL: 4, BUMPER: 3,
  DUCKS: [1, 2, 3, 4, 6, 8, 10],               // what a duck can hide (three are drawn each time)
  // round 12: live events — how long each waits for taps, and the short pause after the last tap ("settle") that
  // lets the dice land / the puck fly / the wheel slow before the result
  EV: { duel: 4000, striker: 4500, wheel: 4000, hide: 2500, guess: 4000, pact: 5000, crowd: 5000, fortune: 4500 },
  SETTLE: { duel: 700, striker: 1100, wheel: 1200, shell: 600, pact: 600, crowd: 600, fortune: 800 },
  STRIKE_PERIOD: 1300, WHEEL_SEG_MS: 130, WHEEL_SEGS: 8, SHELL_SWAPS: 5, SHELL_SWAP_MS: 330, SHELL: 3, CROWD_BACK: 3, CROWD_TIP: 2,
  ITEMS: 2, TRAP: 4, TOLL: 3,
});
/** The live events, by space type (a space type not listed here does its effect at once). */
export const EVENT_SPACES = Object.freeze({ duel: 'duel', striker: 'striker', chance: 'wheel', shell: 'shell', pact: 'pact', crowd: 'crowd', fortune: 'fortune' });
/** Round 5 (2026-10-22): the Fair Bulletin. Each round after the first draws one of `chance.bulletins` (weighted); the
 *  last round is always Last Call. `mods` change the round's numbers: ticket / pit (amounts), mul (multiplies ticket
 *  stands, jackpots and puddles), ribbonCost, gameMul (the minigame's tickets), duckMul, duel (tickets a duel takes);
 *  and one-off things done as the bulletin is read: parade (everyone hops n), pinata [lo, hi] (everyone gets that many),
 *  underdog (whoever is last gets a golden die). Round 12: toll (the shortcut's price), strikeMul (High Striker pays
 *  that many times), pot (Steal or Share's pot), cards (everyone draws a prize card). */
export const LAST_CALL = { id: 'lastcall', title: 'Last Call!', short: 'Everything ×2', text: 'Final round! Ticket stands, jackpots and puddles all count double.', mods: { mul: 2 } };

const DEFAULT_RULES = {
  striker: [{ min: 95, n: 8, item: true, label: 'DING!' }, { min: 75, n: 5, label: 'Huge swing' }, { min: 45, n: 3, label: 'Good swing' }, { min: 0, n: 1, label: 'A tap' }],
  pact: { pot: 6, both: -2 },
  fortune: [{ w: 3, item: 'double' }, { w: 3, item: 'trap' }, { w: 2, item: 'pass' }, { w: 2, tickets: 5 }, { w: 2, tickets: 2 }],
  items: { double: { name: 'Double Die', text: 'Roll two dice this turn.' }, trap: { name: 'Whoopee Cushion', text: 'Leave it on your space: the next rival to stop there pays you 4 tickets.' }, pass: { name: 'Express Pass', text: 'Instead of rolling, ride straight to the next Prize Booth.' } },
};

export function indexBoard(def) {
  const byId = new Map(def.spaces.map(s => [s.id, s]));
  for (const s of def.spaces) for (const n of s.next) if (!byId.has(n)) throw new Error(`board ${def.id}: ${s.id} leads to unknown space ${n}`);
  for (const s of def.spaces) if (s.to != null && !byId.has(s.to)) throw new Error(`board ${def.id}: ${s.id} fires to unknown space ${s.to}`);
  if (!byId.has(def.start)) throw new Error(`board ${def.id}: no start space`);
  return byId;
}

export function createBoardMatch({ def, chance, order, rng, names = {}, emit = () => {}, moves = 'dice' }) {
  const cards = moves === 'cards';
  const byId = indexBoard(def);
  const R = { ...DEFAULT_RULES, ...(chance.board || {}) };
  const S = {
    order: order.slice(), pos: {}, tickets: {}, ribbons: {},
    turn: -1, pid: null, sub: 'idle', until: 0, left: 0, ask: null, rolled: 0, roundDone: false,
    boost: {}, stats: {}, bulletin: null, mods: {}, hands: {},
    ev: null, items: {}, traps: {}, used: false, after: null,
  };
  const deal = () => rng.int(1, BOARD.DIE);
  const fillHand = pid => { if (!cards) return; const h = S.hands[pid] || (S.hands[pid] = []); while (h.length < BOARD.HAND) h.push(deal()); };
  const newStats = () => ({ earned: 0, lost: 0, walked: 0, duels: 0, chance: 0, bells: 0 });
  const seat = pid => { S.pos[pid] = def.start; S.tickets[pid] = 5; S.ribbons[pid] = 0; S.stats[pid] = newStats(); S.items[pid] = []; fillHand(pid); };
  for (const pid of order) seat(pid);
  const name = pid => names[pid] || 'Player';
  /** Tickets in or out; returns what actually moved. `count` = false for the minigame's payout (not a board stat). */
  const give = (pid, n, count = true) => {
    const before = S.tickets[pid] ?? 0; S.tickets[pid] = Math.max(0, before + n); const d = S.tickets[pid] - before;
    const st = S.stats[pid]; if (count && st) { if (d > 0) st.earned += d; else st.lost -= d; }
    return d;
  };
  const mod = (k, def0) => S.mods[k] ?? def0;
  const mul = () => mod('mul', 1);
  const ribbonCost = () => mod('ribbonCost', BOARD.RIBBON_COST);
  const prevOf = at => (def.spaces.find(s => s.next[0] === at) || def.spaces.find(s => s.next.includes(at)))?.id;
  const others = pid => S.order.filter(p => p !== pid);
  const fill = (text, p, o) => text.replaceAll('{p}', name(p)).replaceAll('{o}', o != null ? name(o) : 'nobody');
  const plural = (n, w = 'ticket') => `${n} ${w}${n === 1 ? '' : 's'}`;
  const snap = () => ({ pos: { ...S.pos }, tickets: { ...S.tickets }, ribbons: { ...S.ribbons } });
  const itemName = id => R.items[id]?.name || id;
  const weighted = list => { const total = list.reduce((t, e) => t + (e.w ?? 1), 0); let r = rng() * total; for (const e of list) { r -= e.w ?? 1; if (r <= 0) return e; } return list[0]; };
  /** A prize card into a hand (ITEMS at most: a full hand drops its oldest card). -> the card. */
  function giveItem(pid, id = null) {
    const ids = Object.keys(R.items); const card = id && R.items[id] ? id : rng.pick(ids);
    const h = S.items[pid] || (S.items[pid] = []); h.push(card); while (h.length > BOARD.ITEMS) h.shift();
    return card;
  }

  function addPlayer(pid) { if (pid in S.pos) return; S.order.push(pid); seat(pid); }
  function dropPlayer(pid) {
    const i = S.order.indexOf(pid); if (i < 0) return;
    S.order.splice(i, 1); delete S.hands[pid];
    for (const [at, owner] of Object.entries(S.traps)) if (owner === pid) delete S.traps[at];
    if (i < S.turn) S.turn--; else if (i === S.turn) { S.turn--; S.sub = 'next'; S.until = 0; S.ev = null; S.ask = null; }
  }

  /** A round: the Fair Bulletin (from round 2; the last round is Last Call), then everyone's turn. */
  function beginRound(now, round = 1, rounds = null) {
    S.roundDone = false; S.turn = -1; S.mods = {}; S.bulletin = null;
    const list = chance.bulletins || [];
    let b = null;
    if (rounds != null && round >= rounds && round > 1) b = LAST_CALL;
    else if (round > 1 && list.length) b = weighted(list);
    if (!b) return nextTurn(now);
    S.bulletin = b; S.mods = { ...(b.mods || {}) };
    const ev = { ev: 'bulletin', id: b.id, title: b.title, short: b.short || '', text: b.text, round };
    if (S.mods.parade) { const moved = {}; for (const pid of S.order) moved[pid] = stepForward(pid, S.mods.parade); ev.moved = moved; }
    if (S.mods.pinata) { const [lo, hi] = S.mods.pinata; ev.got = {}; for (const pid of S.order) ev.got[pid] = give(pid, rng.int(lo, hi)); }
    if (S.mods.underdog) { const last = standingsOf().at(-1); if (last && S.order.length > 1) { S.boost[last.pid] = 'gold'; ev.with = last.pid; ev.text += ` (${name(last.pid)} gets it.)`; } }
    if (S.mods.cards) { ev.cards = {}; for (const pid of S.order) ev.cards[pid] = giveItem(pid); ev.items = itemsView(); }
    Object.assign(ev, snap());
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
  /** Back n spaces (the way you came along the loop). -> the spaces passed. */
  function stepBack(pid, n) {
    let at = S.pos[pid]; const moved = [];
    for (let i = 0; i < n; i++) { const p = prevOf(at); if (!p) break; at = p; moved.push(at); }
    S.pos[pid] = at; return moved;
  }
  function nextTurn(now) {
    S.turn++; S.ask = null; S.ev = null; S.used = false; S.after = null;
    if (S.turn >= S.order.length) { S.sub = 'idle'; S.pid = null; S.roundDone = true; emit({ ev: 'roundEnd' }); return; }
    S.pid = S.order[S.turn]; S.sub = 'roll'; S.until = now + BOARD.ROLL_MS;
    emit({ ev: 'turn', pid: S.pid, ms: BOARD.ROLL_MS, items: itemsView(), ...(cards ? { hands: handsView() } : {}) });
  }
  const handsView = () => Object.fromEntries(Object.entries(S.hands).map(([p, h]) => [p, h.slice()]));
  const itemsView = () => Object.fromEntries(Object.entries(S.items).map(([p, h]) => [p, h.slice()]));
  /** Card mode: play card `i` of your hand, or i = -1 for a face-down card out of a random rival's hand. */
  function playCard(pid, i, now) {
    if (!cards || S.sub !== 'roll' || pid !== S.pid) return false;
    const hand = S.hands[pid] || []; let n, from = null;
    if (i === -1) {
      const rivals = others(pid).filter(p => S.hands[p]?.length);
      if (!rivals.length) return false;
      from = rng.pick(rivals); const h = S.hands[from], k = rng.int(0, h.length - 1); n = h.splice(k, 1)[0]; fillHand(from);
    } else {
      if (!(i >= 0 && i < hand.length)) return false;
      n = hand.splice(i, 1)[0]; fillHand(pid);
    }
    const boost = S.boost[pid]; delete S.boost[pid];
    let extra = null;
    if (boost === 'gold') { extra = rng.int(1, BOARD.DIE); }
    else if (boost === 'slow') n = Math.min(n, 3);
    S.rolled = n + (extra || 0); S.left = S.rolled;
    S.sub = 'dice'; S.until = now + BOARD.DICE_MS;
    emit({ ev: 'rolled', pid, n: S.rolled, card: n, ...(from != null ? { from } : {}), ...(boost ? { boost, ...(extra ? { dice: [n, extra] } : {}) } : {}), hands: handsView() });
    return true;
  }
  function roll(pid, now, forced = null) {
    if (cards && forced == null) return false;
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
  /** Round 12: play prize card `i` from your hand before you roll (one a turn). */
  function useItem(pid, i, now) {
    if (S.sub !== 'roll' || pid !== S.pid || S.used) return false;
    const h = S.items[pid] || [], id = h[i];
    if (!id) return false;
    const at = S.pos[pid], out = { ev: 'item', pid, item: id, name: itemName(id), at };
    if (id === 'double') { S.boost[pid] = 'gold'; out.text = `${name(pid)} plays a Double Die: two dice this turn!`; }
    else if (id === 'trap') {
      if (S.traps[at] != null || byId.get(at).type === 'start') return false;
      S.traps[at] = pid; out.text = `${name(pid)} leaves a Whoopee Cushion here. Don't stop on it!`;
    } else if (id === 'pass') {
      const path = []; let p = at;
      for (let k = 0; k < def.spaces.length; k++) { p = byId.get(p).next[0]; path.push(p); if (byId.get(p).type === 'start') give(pid, BOARD.LAP_BONUS); if (byId.get(p).type === 'booth') break; }
      S.pos[pid] = p; S.stats[pid].walked += path.length; out.path = path;
      out.text = `${name(pid)} flashes an Express Pass and rides to the Prize Booth`;
      if (S.tickets[pid] >= ribbonCost()) { give(pid, -ribbonCost(), false); S.ribbons[pid]++; out.text += ' and buys a ribbon!'; out.ribbon = true; } else out.text += ', but can\'t afford a ribbon yet.';
    } else return false;
    h.splice(i, 1); S.used = true;
    out.items = itemsView(); out.traps = { ...S.traps }; Object.assign(out, snap());
    emit(out);
    if (id === 'pass') { S.sub = 'fx'; S.until = now + path(out).length * BOARD.STEP_MS + BOARD.FX_MS; }
    else S.until = Math.max(S.until, now + 4000);            // a moment to roll after playing a card
    return true;
  }
  const path = o => o.path || [];
  /** Walk until the steps run out or something needs an answer. Emits one `step` with the spaces walked. */
  function walk(now) {
    const pid = S.pid, walked = [];
    let bought = null;
    while (S.left > 0) {
      const here = byId.get(S.pos[pid]);
      if (here.next.length > 1 && !S.ask?.answered) {
        const toll = here.toll || [], cost = k => (k > 0 && toll[k] ? mod('toll', toll[k]) : 0);
        const can = here.next.map((_, k) => S.tickets[pid] >= cost(k));
        if (can.filter(Boolean).length <= 1) { S.ask = { kind: 'fork', answered: true, answer: Math.max(0, can.indexOf(true)), at: here.id, auto: true }; }
        else { S.ask = { kind: 'fork', options: (here.labels || here.next.map((_, k) => 'Path ' + (k + 1))).map((l, k) => cost(k) ? `${l} (${plural(cost(k))})` : l), cost: here.next.map((_, k) => cost(k)), at: here.id }; break; }
      }
      const k = here.next.length > 1 ? S.ask.answer : 0, to = here.next[k];
      if (S.ask?.kind === 'fork') { const c = S.ask.cost?.[k] || 0; if (c) give(pid, -c); S.ask = null; }
      S.pos[pid] = to; S.left--; walked.push(to); S.stats[pid].walked++;
      const sp = byId.get(to);
      if (sp.type === 'start') { give(pid, BOARD.LAP_BONUS); walked.lap = true; }
      // prize booths buy by themselves now (round 12: the "buy a ribbon?" question was a stop on every lap with only one sensible answer)
      if (sp.type === 'booth' && S.tickets[pid] >= ribbonCost()) { give(pid, -ribbonCost(), false); S.ribbons[pid]++; bought = to; break; }
    }
    const ms = walked.length * BOARD.STEP_MS;
    if (walked.length) emit({ ev: 'step', pid, path: walked, ms, lap: !!walked.lap, tickets: S.tickets[pid] });
    if (bought) {
      emit({ ev: 'fx', pid, kind: 'ribbon', at: bought, text: `${name(pid)} buys a ribbon!`, d: -ribbonCost(), ...snap() });
      S.sub = 'pause'; S.until = now + ms + BOARD.RIBBON_MS; return;
    }
    if (S.ask && !S.ask.answered) { S.sub = 'walk-ask'; S.until = now + ms; }
    else { S.sub = 'walk'; S.until = now + ms + 120; }
  }
  function openAsk(now) { S.sub = 'ask'; S.until = now + BOARD.ASK_MS; emit({ ev: 'ask', pid: S.pid, kind: S.ask.kind, options: S.ask.options, ms: BOARD.ASK_MS, at: S.ask.at }); }
  function choose(pid, i, now) {
    if (!Number.isInteger(i)) return false;
    if (S.sub === 'event') return evInput(pid, i, now);
    if (S.sub === 'roll') return useItem(pid, i, now);
    if (S.sub !== 'ask' || pid !== S.pid || !S.ask || !(i >= 0 && i < S.ask.options.length)) return false;
    const ask = S.ask;
    if (ask.kind === 'fork' && ask.cost?.[i] && S.tickets[pid] < ask.cost[i]) return false;
    emit({ ev: 'chose', pid, kind: ask.kind, i });
    if (ask.kind === 'duck') return pickDuck(pid, i, now);
    ask.answered = true; ask.answer = i;
    if (S.left > 0) walk(now); else land(now);
    return true;
  }
  /** Stopped on a space: a waiting Whoopee Cushion first, then the space's own effect. */
  function land(now) {
    const pid = S.pid, at = S.pos[pid], owner = S.traps[at];
    if (owner != null && owner !== pid && S.order.includes(owner)) {
      delete S.traps[at];
      const got = -give(pid, -BOARD.TRAP * mul()); give(owner, got);
      emit({ ev: 'fx', pid, at, kind: 'trap', with: owner, d: -got, traps: { ...S.traps }, text: got ? `PFFFT! ${name(pid)} sits on ${name(owner)}'s Whoopee Cushion: ${plural(got)} to ${name(owner)}.` : `PFFFT! ${name(pid)} sits on a Whoopee Cushion, but has no tickets to pay.`, ...snap() });
      S.sub = 'trap'; S.until = now + BOARD.TRAP_MS; return;
    }
    landEffect(now);
  }
  function landEffect(now) {
    const pid = S.pid, sp = byId.get(S.pos[pid]);
    let ms = BOARD.FX_MS;
    if (EVENT_SPACES[sp.type] && openEvent(EVENT_SPACES[sp.type], pid, sp, now)) return;
    const fx = { ev: 'fx', pid, at: sp.id, kind: sp.type };
    if (sp.type === 'ticket' || sp.type === 'join') { const n = mod('ticket', BOARD.TICKET) * mul(); fx.kind = 'ticket'; fx.d = give(pid, n); fx.text = `${name(pid)}: +${n} tickets`; }
    else if (sp.type === 'jackpot') { fx.d = give(pid, BOARD.JACKPOT * mul()); fx.text = `Jackpot! ${name(pid)}: +${fx.d} tickets`; }
    else if (sp.type === 'pit') { fx.d = give(pid, -mod('pit', BOARD.PIT) * mul()); fx.text = fx.d ? `Splat. ${name(pid)} loses ${plural(-fx.d)}` : `Splat. ${name(pid)} had nothing to lose`; }
    else if (sp.type === 'mirror') { const o = others(pid); if (o.length) { const w = rng.pick(o); [S.pos[pid], S.pos[w]] = [S.pos[w], S.pos[pid]]; fx.kind = 'swap'; fx.with = w; fx.text = `${name(pid)} and ${name(w)} swap places!`; } else fx.text = 'Nobody to swap with.'; }
    else if (sp.type === 'ghost') {                                     // a friendly ghost: off to a random space on the loop
      const loop = []; let at = def.start; do { loop.push(at); at = byId.get(at).next[0]; } while (at !== def.start && loop.length < 200);
      const to = rng.pick(loop.filter(id => id !== sp.id && byId.get(id).type !== 'ghost')); S.pos[pid] = to; fx.kind = 'swap'; fx.text = `Boo! A friendly ghost whisks ${name(pid)} away to somewhere else on the pier.`;
    }
    else if (sp.type === 'bumper') { const p = stepForward(pid, BOARD.BUMPER); fx.path = p; fx.text = `Bumper cart! ${name(pid)} zooms ${p.length} spaces ahead.`; }
    else if (sp.type === 'cannon' && sp.to) {                           // round 12: fired through the air to its landing pad
      let at = sp.id, laps = 0; for (let k = 0; k < def.spaces.length && at !== sp.to; k++) { at = byId.get(at).next[0]; if (byId.get(at).type === 'start') laps++; }
      S.pos[pid] = sp.to; if (laps) give(pid, BOARD.LAP_BONUS * laps);
      fx.fly = [sp.id, sp.to]; fx.lap = laps > 0; ms = BOARD.CANNON_MS;
      fx.text = `BOOM! The cannon fires ${name(pid)} across the fair${laps ? ` (over the gate: +${BOARD.LAP_BONUS})` : ''}!`;
    }
    else if (sp.type === 'duck') {
      const prizes = rng.shuffle(BOARD.DUCKS.slice()).slice(0, 3).map(n => n * mod('duckMul', 1));
      S.ask = { kind: 'duck', options: ['Yellow duck', 'Blue duck', 'Pink duck'], at: sp.id, prizes };
      emit({ ev: 'fx', pid, at: sp.id, kind: 'duckpond', text: `${name(pid)} fishes in the duck pond. Pick a duck!`, ...snap() });
      return openAsk(now);
    }
    else if (EVENT_SPACES[sp.type]) { fx.d = give(pid, 2); fx.text = `Nobody to play with, so ${name(pid)} practises: +2 tickets.`; }   // a two-player event in a solo game
    else { fx.kind = 'none'; fx.text = ''; ms = BOARD.PLAIN_MS; }
    Object.assign(fx, snap());
    emit(fx);
    S.sub = 'fx'; S.until = now + ms;
  }
  function pickDuck(pid, i, now) {
    const ask = S.ask; S.ask = null;
    const d = give(pid, ask.prizes[i]), colours = ['yellow', 'blue', 'pink'];
    const rest = ask.prizes.filter((_, k) => k !== i);
    emit({ ev: 'fx', pid, at: ask.at, kind: 'duck', d, prizes: ask.prizes, pick: i, text: `${name(pid)} picks the ${colours[i]} duck: +${d} tickets! (The others hid ${rest[0]} and ${rest[1]}.)`, ...snap() });
    S.sub = 'fx'; S.until = now + BOARD.CHANCE_MS;
    return true;
  }

  // ------------------------------------------------------------ live events (round 12)
  /** Open an event: `pids` are the players whose taps it waits for; `pub` is what everyone may see; `hid` is kept
   *  on the server until it is revealed. -> true (or false when the event can't run, e.g. nobody to duel). */
  function openEvent(kind, pid, sp, now) {
    const o = others(pid), w = o.length ? rng.pick(o) : null;
    const E = { kind, pid, at: sp.id, stage: 'go', t0: now, inp: {}, hid: {}, pub: {} };
    if (kind === 'duel') {
      if (w == null) return false;
      E.pids = [pid, w]; E.pub = { with: w, stake: mod('duel', BOARD.DUEL) }; E.hid.dice = { [pid]: rng.int(1, BOARD.DIE), [w]: rng.int(1, BOARD.DIE) }; E.ms = BOARD.EV.duel;
    } else if (kind === 'striker') {
      E.pids = [pid]; E.pub = { period: BOARD.STRIKE_PERIOD, tiers: R.striker.map(t => ({ min: t.min, n: t.n * mod('strikeMul', 1), label: t.label })) }; E.ms = BOARD.EV.striker;
    } else if (kind === 'wheel') {
      const list = chance.events, segs = [];
      const left = list.slice();
      for (let k = 0; k < BOARD.WHEEL_SEGS; k++) { const pool = left.length ? left : list, e = weighted(pool); segs.push(e); const j = left.indexOf(e); if (j >= 0) left.splice(j, 1); }
      E.pids = [pid]; E.hid.segs = segs; E.pub = { segs: segs.map(e => ({ id: e.id, label: e.short || '?' })), segMs: BOARD.WHEEL_SEG_MS }; E.ms = BOARD.EV.wheel;
    } else if (kind === 'shell') {
      if (w == null) return false;
      E.pids = [pid]; E.stage = 'hide'; E.pub = { with: w, stake: BOARD.DUEL - 1, cups: BOARD.SHELL }; E.ms = BOARD.EV.hide;
    } else if (kind === 'pact') {
      if (w == null) return false;
      E.pids = [pid, w]; E.pub = { with: w, pot: mod('pot', R.pact.pot) }; E.ms = BOARD.EV.pact;
    } else if (kind === 'crowd') {
      if (w == null) return false;
      E.pids = S.order.slice(); E.pub = { options: S.order.slice(), back: BOARD.CROWD_BACK }; E.ms = BOARD.EV.crowd;
    } else if (kind === 'fortune') {
      E.pids = [pid]; E.hid.cards = [0, 1, 2].map(() => ({ ...weighted(R.fortune) })); E.pub = { n: 3 }; E.ms = BOARD.EV.fortune;
    } else return false;
    S.ev = E; S.sub = 'event'; S.until = now + E.ms;
    emit({ ev: 'event', kind, stage: E.stage, pid, pids: E.pids, at: sp.id, ms: E.ms, ...E.pub });
    return true;
  }
  /** One tap. -> true if it counted. */
  function evInput(p, i, now, auto = false) {
    const E = S.ev; if (!E || E.stage === 'settle' || E.stage === 'shuffle' || !E.pids.includes(p) || p in E.inp) return false;
    const el = now - E.t0;
    let shown;                                              // what everyone gets told about this tap
    switch (E.kind) {
      case 'duel': E.inp[p] = E.hid.dice[p]; shown = { n: E.inp[p] }; break;
      case 'striker': { const ms = auto ? i : cleanTapMs(i, el, E.ms); if (ms == null) return false; E.inp[p] = strikePower(ms, BOARD.STRIKE_PERIOD); shown = { power: E.inp[p], ms }; break; }
      case 'wheel': { const ms = auto ? i : cleanTapMs(i, el, E.ms); if (ms == null) return false; E.inp[p] = wheelSeg(ms, BOARD.WHEEL_SEG_MS, E.hid.segs.length); shown = { seg: E.inp[p], ms }; break; }
      case 'shell': if (!(i >= 0 && i < BOARD.SHELL)) return false; E.inp[p] = i; break;
      case 'pact': if (i !== 0 && i !== 1) return false; E.inp[p] = i; shown = { locked: true }; break;
      case 'crowd': { const target = E.pub.options[i]; if (target == null || target === p) return false; E.inp[p] = target; shown = { vote: target }; break; }
      case 'fortune': if (!(i >= 0 && i < 3)) return false; E.inp[p] = i; shown = { pick: i, cards: E.hid.cards }; break;
    }
    if (E.kind === 'shell') return shellStep(p, i, now, auto);
    emit({ ev: 'evin', kind: E.kind, pid: p, auto, ...shown });
    if (E.pids.every(q => q in E.inp)) { E.stage = 'settle'; S.until = now + BOARD.SETTLE[E.kind]; }
    return true;
  }
  /** The shell game has three stages: the lander hides the pea, the cups shuffle (everyone watches), the rival guesses. */
  function shellStep(p, i, now, auto) {
    const E = S.ev;
    if (E.stage === 'hide') {
      const swaps = []; for (let k = 0; k < BOARD.SHELL_SWAPS; k++) { const a = rng.int(0, BOARD.SHELL - 1); let b = rng.int(0, BOARD.SHELL - 2); if (b >= a) b++; swaps.push([a, b]); }
      E.hid.pea = i; E.hid.swaps = swaps; E.hid.end = shellAfter(i, swaps); E.stage = 'shuffle';
      const ms = swaps.length * BOARD.SHELL_SWAP_MS + 250;
      emit({ ev: 'event', kind: 'shell', stage: 'shuffle', pid: E.pid, pids: [E.pub.with], at: E.at, ms, pea: i, swaps, swapMs: BOARD.SHELL_SWAP_MS, auto, ...E.pub });
      S.until = now + ms; return true;
    }
    // stage 'guess'
    emit({ ev: 'evin', kind: 'shell', pid: p, guess: i, auto });
    E.stage = 'settle'; S.until = now + BOARD.SETTLE.shell; return true;
  }
  /** The timer ran out: answer for everyone who didn't (or move the shell game on). */
  function evTimeout(now) {
    const E = S.ev;
    if (E.stage === 'settle') return evResolve(now);
    if (E.kind === 'shell' && E.stage === 'shuffle') {
      E.stage = 'guess'; E.pids = [E.pub.with]; E.inp = {}; E.t0 = now; E.ms = BOARD.EV.guess;
      emit({ ev: 'event', kind: 'shell', stage: 'guess', pid: E.pid, pids: E.pids, at: E.at, ms: E.ms, ...E.pub });
      S.until = now + E.ms; return;
    }
    for (const p of E.pids.slice()) if (!(p in E.inp)) {
      const pick = E.kind === 'striker' ? rng.int(0, 250)            // too slow: a weak, early swing
        : E.kind === 'wheel' ? rng.int(0, 9999)
        : E.kind === 'shell' ? rng.int(0, BOARD.SHELL - 1)
        : E.kind === 'pact' ? 0                                     // no answer = share
        : E.kind === 'crowd' ? E.pub.options.indexOf(leaderBut(p))
        : 0;
      evInput(p, pick, now, true);
      if (S.ev?.kind === 'shell') return;                            // (hide -> shuffle: handled on the next timeout)
    }
    if (S.ev && S.ev.stage !== 'settle') { S.ev.stage = 'settle'; S.until = now + BOARD.SETTLE[S.ev.kind]; }
  }
  /** Whoever is worth the most apart from `p` (the tomato's favourite target). */
  const leaderBut = p => S.order.filter(q => q !== p).sort((a, b) => (S.ribbons[b] * BOARD.RIBBON_COST + S.tickets[b]) - (S.ribbons[a] * BOARD.RIBBON_COST + S.tickets[a]))[0];
  function evResolve(now) {
    const E = S.ev, pid = E.pid, fx = { ev: 'fx', pid, at: E.at, kind: E.kind };
    let ms = BOARD.REVEAL_MS;
    switch (E.kind) {
      case 'duel': {
        const w = E.pub.with, a = E.hid.dice[pid], b = E.hid.dice[w], stake = E.pub.stake;
        Object.assign(fx, { with: w, dice: [a, b] }); ms = BOARD.DUEL_MS;
        if (a === b) { give(pid, 1); give(w, 1); fx.d = 1; fx.text = `Dice duel! ${name(pid)} ${a}, ${name(w)} ${b}. A draw: +1 each.`; }
        else { const [win, lose] = a > b ? [pid, w] : [w, pid]; const got = -give(lose, -stake); give(win, got); S.stats[win].duels++; fx.winner = win; fx.d = win === pid ? got : -got; fx.text = `${name(win)} wins the duel ${Math.max(a, b)}–${Math.min(a, b)} and takes ${plural(got)}!`; }
        break;
      }
      case 'striker': {
        const power = E.inp[pid] ?? 0, tier = E.pub.tiers.find(t => power >= t.min) || E.pub.tiers.at(-1), src = R.striker.find(t => t.min === tier.min) || {};
        fx.power = power; fx.d = give(pid, tier.n); fx.label = tier.label;
        fx.text = `${tier.label} ${name(pid)} hits ${power}: +${plural(fx.d)}`;
        if (src.item) { const card = giveItem(pid); fx.item = card; fx.items = itemsView(); S.stats[pid].bells++; fx.text += ` and a ${itemName(card)} card!`; } else fx.text += '.';
        break;
      }
      case 'wheel': {
        const seg = E.inp[pid] ?? 0, e = E.hid.segs[seg];
        Object.assign(fx, spin(pid, e)); fx.kind = 'chance'; fx.seg = seg; S.stats[pid].chance++; ms = BOARD.CHANCE_MS;
        break;
      }
      case 'shell': {
        const w = E.pub.with, guess = E.inp[w], right = guess === E.hid.end, stake = E.pub.stake;
        Object.assign(fx, { with: w, pea: E.hid.end, guess, right });
        if (right) { const got = -give(pid, -stake); give(w, got); fx.d = -got; fx.text = `${name(w)} finds the pea! ${name(w)} takes ${plural(got)} from ${name(pid)}.`; }
        else { const got = -give(w, -stake); give(pid, got); fx.d = got; fx.text = `Empty cup! ${name(pid)} fooled ${name(w)} and takes ${plural(got)}.`; }
        break;
      }
      case 'pact': {
        const w = E.pub.with, a = E.inp[pid] ?? 0, b = E.inp[w] ?? 0, pot = E.pub.pot, half = Math.floor(pot / 2);
        Object.assign(fx, { with: w, picks: [a, b] });
        if (!a && !b) { give(pid, half); give(w, half); fx.d = half; fx.text = `Both share! +${half} each for ${name(pid)} and ${name(w)}.`; }
        else if (a && b) { const lose = R.pact.both; fx.d = give(pid, lose); give(w, lose); fx.text = `Both steal! The pot is gone and ${name(pid)} and ${name(w)} each lose ${-lose}.`; }
        else { const thief = a ? pid : w, sucker = a ? w : pid; give(thief, pot); fx.d = a ? pot : 0; fx.thief = thief; fx.text = `${name(thief)} steals all ${pot}! ${name(sucker)} shared and gets nothing.`; }
        break;
      }
      case 'crowd': {
        const count = {}; for (const t of Object.values(E.inp)) count[t] = (count[t] || 0) + 1;
        const best = Math.max(0, ...Object.values(count)), hit = S.order.filter(p => count[p] === best && best > 0);
        fx.votes = { ...E.inp }; fx.hit = hit; fx.moved = {};
        for (const p of hit) fx.moved[p] = stepBack(p, BOARD.CROWD_BACK);
        fx.d = give(pid, BOARD.CROWD_TIP);
        fx.text = hit.length ? `SPLAT! ${hit.map(name).join(' and ')} ${hit.length > 1 ? 'are' : 'is'} sent back ${BOARD.CROWD_BACK} spaces. ${name(pid)} gets +${BOARD.CROWD_TIP} for the show.` : 'Nobody threw a tomato.';
        ms = BOARD.REVEAL_MS + 400;
        break;
      }
      case 'fortune': {
        const k = E.inp[pid] ?? 0, c = E.hid.cards[k];
        fx.cards = E.hid.cards; fx.pick = k;
        if (c.item) { const card = giveItem(pid, c.item); fx.item = card; fx.items = itemsView(); fx.text = `The Fortune Teller turns over… a ${itemName(card)} card for ${name(pid)}!`; }
        else { fx.d = give(pid, c.tickets); fx.text = `The Fortune Teller turns over… +${plural(fx.d)} for ${name(pid)}.`; }
        break;
      }
    }
    S.ev = null;
    Object.assign(fx, snap());
    emit(fx);
    S.sub = 'fx'; S.until = now + ms;
  }
  /** What a bot would press right now in the open event / ask / roll (null = nothing yet). Tests drive bots with it. */
  function botChoice(p, now) {
    const E = S.ev;
    if (S.sub === 'roll' && p === S.pid) { const h = S.items[p] || []; if (!S.used && h.length) { const k = h.findIndex(id => id !== 'trap' || (S.traps[S.pos[p]] == null && byId.get(S.pos[p]).type !== 'start')); if (k >= 0) return { t: 'choose', i: k }; } return cards ? { t: 'card', i: p % 2 ? 0 : -1 } : { t: 'roll' }; }
    if (S.sub === 'ask' && p === S.pid) return { t: 'choose', i: S.ask.kind === 'fork' ? (S.ask.cost?.[1] != null && S.tickets[p] >= S.ask.cost[1] && p % 2 === 0 ? 1 : 0) : p % 3 };
    if (S.sub !== 'event' || !E || !E.pids.includes(p) || p in E.inp || E.stage === 'settle' || E.stage === 'shuffle') return null;
    const el = now - E.t0;
    switch (E.kind) {
      case 'duel': return el >= 300 + (p % 3) * 200 ? { t: 'choose', i: 0 } : null;
      case 'striker': return el > 500 && strikePower(el, BOARD.STRIKE_PERIOD) >= 70 + (p % 3) * 10 ? { t: 'choose', i: el } : null;
      case 'wheel': return el >= 900 + p * 97 ? { t: 'choose', i: el } : null;
      case 'shell': return el >= 500 ? { t: 'choose', i: E.stage === 'hide' ? p % 3 : (p % 2 ? E.hid.end : (E.hid.end + 1) % 3) } : null;
      case 'pact': return el >= 700 ? { t: 'choose', i: p % 3 === 0 ? 1 : 0 } : null;
      case 'crowd': return el >= 600 + p * 50 ? { t: 'choose', i: E.pub.options.indexOf(leaderBut(p)) } : null;
      case 'fortune': return el >= 700 ? { t: 'choose', i: p % 3 } : null;
    }
    return null;
  }
  /** A Wheel of Whatever result (`ev` = the segment it stopped on). */
  function spin(pid, ev) {
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
      case 'move': { if (ev.n > 0) out.path = stepForward(pid, ev.n); else out.path = stepBack(pid, -ev.n); break; }
      case 'ribbon': S.ribbons[pid]++; break;
      // round 5
      case 'boost': S.boost[pid] = ev.boost; out.boost = ev.boost; break;
      case 'pinata': out.d = give(pid, ev.n); for (const p of o) give(p, ev.m ?? 1); break;
      case 'tax': { let got = 0; for (const p of o) if (S.tickets[p] > (ev.over ?? 10)) got += -give(p, -ev.n); give(pid, got); out.d = got; extra = got ? ` ${name(pid)} collects ${got}.` : ' Nobody is that rich yet!'; break; }
      case 'lowest': { const low = S.order.slice().sort((a, b) => S.tickets[a] - S.tickets[b])[0]; give(low, ev.n); out.with = low; if (low === pid) out.d = ev.n; break; }
      case 'tobooth': { const p2 = []; let at = S.pos[pid];
        for (let i = 0; i < def.spaces.length; i++) { at = byId.get(at).next[0]; p2.push(at); if (byId.get(at).type === 'start') give(pid, BOARD.LAP_BONUS); if (byId.get(at).type === 'booth') break; }
        S.pos[pid] = at; out.path = p2; S.stats[pid].walked += p2.length;
        if (S.tickets[pid] >= ribbonCost()) { give(pid, -ribbonCost(), false); S.ribbons[pid]++; extra = ` ${name(pid)} buys a ribbon there!`; }
        break; }
      case 'allmove': out.moved = {}; for (const p of S.order) out.moved[p] = stepForward(p, ev.n); out.path = out.moved[pid]; delete out.moved[pid]; break;
      case 'flip': { const win = rng.chance(0.5); out.d = give(pid, win ? ev.n : -ev.n); extra = win ? ` Heads! +${out.d} tickets.` : (out.d ? ` Tails. ${out.d} tickets.` : ' Tails, but there was nothing to lose.'); break; }
      case 'shuffle': { const spots = S.order.map(p => S.pos[p]); const mixed = rng.shuffle(spots.slice()); S.order.forEach((p, i) => { S.pos[p] = mixed[i]; }); out.swap = true; break; }
      case 'ribbonother': if (w != null) { S.ribbons[w]++; out.with = w; } else S.ribbons[pid]++; break;
      case 'tostart': { const p2 = []; let at = S.pos[pid]; for (let i = 0; i < def.spaces.length && at !== def.start; i++) { at = byId.get(at).next[0]; p2.push(at); } S.pos[pid] = at; give(pid, BOARD.LAP_BONUS); out.path = p2; S.stats[pid].walked += p2.length; break; }
      case 'treat': { const spent = -give(pid, -(ev.n * o.length)); let each = o.length ? Math.floor(spent / o.length) : 0; for (const p of o) give(p, each); out.d = -spent; break; }
      case 'swaptickets': if (w != null) { const a = S.tickets[pid], b = S.tickets[w]; give(pid, b - a); give(w, a - b); out.with = w; out.d = b - a; } break;
      // round 12
      case 'item': { const card = giveItem(pid, ev.item || null); out.item = card; out.items = itemsView(); extra = ` (${itemName(card)})`; break; }
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
      { id: 'bells', title: 'Bell Ringer', text: 'Rang the High Striker bell most', v: p => S.stats[p]?.bells || 0 },
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
      case 'roll': if (cards) playCard(S.pid, 0, now); else roll(S.pid, now); break;   // the timer rolls (or plays your first card) for you
      case 'dice': walk(now); break;
      case 'walk-ask': openAsk(now); break;
      case 'ask': choose(S.pid, 0, now); break;                        // no answer: the first way / the first duck
      case 'pause': case 'walk': if (S.left > 0) walk(now); else land(now); break;
      case 'trap': landEffect(now); break;
      case 'event': evTimeout(now); break;
      case 'fx': case 'next': case 'bulletin': nextTurn(now); break;
    }
  }
  const evView = () => { const E = S.ev; if (!E) return null; return { kind: E.kind, stage: E.stage, pid: E.pid, pids: E.pids, at: E.at, ms: E.ms, done: Object.keys(E.inp).map(Number), ...E.pub }; };
  const view = () => ({ order: S.order, pos: S.pos, tickets: S.tickets, ribbons: S.ribbons, pid: S.pid, sub: S.sub, until: S.until, rolled: S.rolled, ask: S.sub === 'ask' && S.ask ? { kind: S.ask.kind, options: S.ask.options } : null, bulletin: S.bulletin ? { id: S.bulletin.id, title: S.bulletin.title, short: S.bulletin.short || '', text: S.bulletin.text } : null, boost: S.boost, moves, items: itemsView(), traps: { ...S.traps }, ev: evView(), ...(cards ? { hands: handsView() } : {}) });
  return { S, byId, beginRound, roll, playCard, choose, tick, view, give, addPlayer, dropPlayer, bonus, botChoice, giveItem, gameMul: () => mod('gameMul', 1), get roundDone() { return S.roundDone; } };
}

/** Final order: ribbons first, then tickets. -> [{ pid, ribbons, tickets, place }] (equal on both = the same place). */
export function boardStandings(S) {
  const rows = S.order.map(pid => ({ pid, ribbons: S.ribbons[pid], tickets: S.tickets[pid] })).sort((a, b) => b.ribbons - a.ribbons || b.tickets - a.tickets);
  rows.forEach((r, i) => { const p = rows[i - 1]; r.place = p && p.ribbons === r.ribbons && p.tickets === r.tickets ? p.place : i + 1; });
  return rows;
}
