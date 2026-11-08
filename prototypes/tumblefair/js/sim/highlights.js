// The highlight reel on the final screen (Expansion 1, M2 "Finish the night", 2026-11-07): 3-5 short cards about the
// match that just ended — the biggest minigame win, the closest finish, the biggest swing on the board, the luckiest (or
// unluckiest) spin of the Wheel of Whatever, a co-op win, and one silly stat. Built ONLY from what the room recorded
// while the match ran (room.js keeps match.reel: one row per minigame, each round's board swing, each wheel result), so a
// card can never describe something that did not happen. A card that has nothing real behind it is simply left out.
// Pure: no clock, no randomness.

const MAX_CARDS = 5;

/** "12 points" / "1 point" (a unit from the game's meta, plural by default). */
const scoreWord = (n, unit) => `${n} ${n === 1 ? String(unit || 'points').replace(/s$/, '') : unit || 'points'}`;
const ticketWord = n => `${n} ticket${Math.abs(n) === 1 ? '' : 's'}`;
const list = names => (names.length <= 1 ? names[0] || '' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/**
 * rec: { games: [{ id, title, round, order, scores, unit, coop }], swings: [{ round, pid, d }], wheel: [{ pid, d, text, round }],
 *        stats: { [pid]: { walked, earned, lost, duels, chance, bells } } | null, wins: { [pid]: n }, players: [pid] }
 * name: pid -> name. Returns [{ id, icon, title, text, pids }], at most five.
 */
export function buildHighlights(rec, name) {
  const out = [], used = new Set();
  const games = (rec.games || []).filter(g => g && g.order);
  const two = g => !g.coop && g.order.flat().length > 1;
  const sc = (g, pid) => (typeof g.scores?.[pid] === 'number' && Number.isFinite(g.scores[pid]) ? g.scores[pid] : null);
  // the gap between first and second place, as a share of the bigger score (so 30-10 is a bigger win than 102-98)
  const gap = g => {
    if (!two(g) || g.order[0].length > 1 || !g.order[1]) return null;
    const a = sc(g, g.order[0][0]), b = sc(g, g.order[1][0]);
    if (a == null || b == null || a === b) return null;
    return { a, b, share: Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1), diff: Math.abs(a - b) };
  };

  // 1. the biggest minigame win
  const wins = games.map(g => ({ g, x: gap(g) })).filter(o => o.x && o.x.share >= 0.25).sort((p, q) => q.x.share - p.x.share || q.x.diff - p.x.diff);
  if (wins.length) {
    const { g, x } = wins[0], w = g.order[0][0], r = g.order[1][0];
    out.push({ id: 'bigwin', icon: '🏆', title: 'Biggest win', text: `${name(w)} ran away with ${g.title}: ${scoreWord(x.a, g.unit)} to ${name(r)}'s ${x.b}.`, pids: [w] });
    used.add(g);
  }
  // 2. the closest finish: a tie for first, or the smallest gap
  const ties = games.filter(g => two(g) && g.order[0].length > 1 && !used.has(g));
  if (ties.length) {
    const g = ties[ties.length - 1];
    out.push({ id: 'close', icon: '📸', title: 'Photo finish', text: `${list(g.order[0].map(name))} tied for first in ${g.title}.`, pids: g.order[0].slice() });
    used.add(g);
  } else {
    const close = games.filter(g => !used.has(g)).map(g => ({ g, x: gap(g) })).filter(o => o.x).sort((p, q) => p.x.share - q.x.share || p.x.diff - q.x.diff);
    if (close.length && close[0].x.share < 0.25) {
      const { g, x } = close[0], w = g.order[0][0], r = g.order[1][0];
      out.push({ id: 'close', icon: '📸', title: 'Closest finish', text: `${name(w)} pipped ${name(r)} at ${g.title}, ${x.a} to ${x.b}.`, pids: [w, r] });
      used.add(g);
    }
  }
  // 3. the biggest swing on the board in one round (tickets, with a ribbon counted at its price)
  const swings = (rec.swings || []).filter(s => Math.abs(s.d) >= 5).sort((p, q) => Math.abs(q.d) - Math.abs(p.d));
  if (swings.length) {
    const s = swings[0];
    out.push({ id: 'swing', icon: s.d > 0 ? '🚀' : '🌧️', title: 'Biggest swing', text: s.d > 0 ? `${name(s.pid)} picked up ${ticketWord(s.d)} on the board in round ${s.round}.` : `${name(s.pid)} dropped ${ticketWord(-s.d)} on the board in round ${s.round}.`, pids: [s.pid] });
  }
  // 4. wheel luck: the best spin, or the worst if nobody got anything good
  const spins = (rec.wheel || []).filter(s => typeof s.d === 'number' && s.d !== 0);
  if (spins.length) {
    const best = spins.slice().sort((p, q) => q.d - p.d)[0], s = best.d > 0 ? best : spins.slice().sort((p, q) => p.d - q.d)[0];
    out.push({ id: 'wheel', icon: '🎡', title: s.d > 0 ? 'Wheel luck' : 'Wheel of woe', text: s.d > 0 ? `${name(s.pid)} spun the Wheel of Whatever for +${ticketWord(s.d)}.` : `The Wheel of Whatever took ${ticketWord(-s.d)} from ${name(s.pid)}.`, pids: [s.pid] });
  }
  // 5. a co-op win
  const coop = games.filter(g => g.coop?.success);
  if (coop.length) out.push({ id: 'coop', icon: '🤝', title: 'Teamwork', text: coop.length > 1 ? `You beat ${coop.length} team games together, ${coop[0].title} first.` : `You beat ${coop[0].title} together.`, pids: (rec.players || []).slice() });
  // 6. one silly stat (the most minigames won, else the longest walk, else the most dice duels)
  const players = rec.players || [];
  const top = f => { let best = 0, who = []; for (const p of players) { const v = f(p) || 0; if (v > best) { best = v; who = [p]; } else if (v === best && v > 0) who.push(p); } return { best, who }; };
  const star = top(p => rec.wins?.[p]);
  if (games.length >= 2 && star.best >= 2 && star.who.length === 1) out.push({ id: 'star', icon: '⭐', title: 'On a roll', text: `${name(star.who[0])} won ${star.best} of the ${games.length} minigames.`, pids: star.who });
  else if (rec.stats) {
    const walk = top(p => rec.stats[p]?.walked), duel = top(p => rec.stats[p]?.duels);
    if (walk.best >= 8 && walk.who.length === 1) out.push({ id: 'walker', icon: '👟', title: 'Comfy shoes', text: `${name(walk.who[0])} walked ${walk.best} spaces round the fair.`, pids: walk.who });
    else if (duel.best >= 1 && duel.who.length === 1) out.push({ id: 'duelist', icon: '🎲', title: 'Dice champion', text: `${name(duel.who[0])} won ${duel.best} dice duel${duel.best > 1 ? 's' : ''}.`, pids: duel.who });
  }
  return out.slice(0, MAX_CARDS);
}
