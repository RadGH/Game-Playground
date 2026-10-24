// Two Truths, One Goblin's claims (round 10, report #22: "all text just looks arbitrary random").
//
// The old deck was ~100 silly stories ("I once rode a goose to the fair") and the game picked at random which of them
// were "true" — so there was nothing to go on and every guess was a coin toss. Now every claim is a FACT ABOUT THE
// TELLER that the game actually knows, and the other players can check it:
//   * on the screen right now — the Teller's colour, the letters of their name, their points (all on the chips), or
//   * from earlier in this game — whether they caught the Goblin last round, how many they have caught or fooled, how
//     many times they have been the Teller.
// A TRUTH is the fact as it is; a GOBLIN is the same fact with one thing changed. The Teller still picks which of two
// Goblins to plant, a plain or a showy wording for each card, and the order — so a sneaky Goblin ("My name has 6
// letters") beats an obvious one ("My colour is Blue"), and that choice is the Teller's game.
// Pure and seeded: the room's rng picks the kinds, the changed values and the order.

export const COLOURS = ['Red', 'Blue', 'Green', 'Pink'];
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const num = n => (n >= 0 && n < NUM.length ? NUM[n] : String(n));
const times = n => (n === 1 ? 'once' : n === 2 ? 'twice' : `${num(n)} times`);
const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
/** Letters in a name (spaces and symbols do not count), and its first letter (A-Z) or null. */
export const letters = name => [...String(name || '')].filter(ch => /\p{L}|\p{N}/u.test(ch)).length;
export const initial = name => { const c = [...String(name || '').trim()][0]?.toUpperCase(); return c && /[A-Z]/.test(c) ? c : null; };

/** Another whole number near `n` (never negative, never `n`). */
function near(rng, n, spread = 2) {
  const opts = []; for (let d = -spread; d <= spread; d++) if (d && n + d >= 0) opts.push(n + d);
  return rng.pick(opts);
}

/**
 * Every fact the game can state about the Teller this round, true and twisted.
 * who: { name, colour (one of COLOURS, or 'Purple' for the House), points, caught, fooled, tellerTurn (1 = first),
 *        last: null | 'caught' | 'fooled' | 'missed' | 'teller' (what they did last round), house (solo's House: it
 *        never guesses, so nothing about catching) }
 * -> [{ k, look (true = checkable on screen), truth: [plain, showy], lie: [plain, showy] }]
 */
export function factsAbout(who, rng) {
  const out = [];
  const cap = t => t[0].toUpperCase() + t.slice(1);
  const add = (k, look, truth, lie) => out.push({ k, look, truth: truth.map(cap), lie: lie.map(cap) });
  // ---- on the screen
  { const other = rng.pick(COLOURS.filter(c => c !== who.colour));
    const say = c => [`My colour is ${c}.`, `${c} is my colour. Always has been.`];
    add('colour', true, say(who.colour), say(other)); }
  { const n = letters(who.name), m = near(rng, n, n > 3 ? 2 : 1);
    if (n > 0) { const say = v => [`My name has ${v} letters.`, `Count them: ${num(v)} letters in my name.`]; add('length', true, say(n), say(m)); } }
  { const c = initial(who.name);
    if (c) { const other = rng.pick('ABCDEFGHJKLMNPRSTW'.split('').filter(x => x !== c));
      const say = v => [`My name starts with ${v}.`, `${v}! That's the first letter of my name.`]; add('initial', true, say(c), say(other)); } }
  { const p = who.points, q = near(rng, p, 2);
    const say = v => [v === 0 ? 'I have no points yet.' : `I have ${v} point${v === 1 ? '' : 's'} right now.`, v === 0 ? 'Zero points so far. Be nice to me.' : `${v} point${v === 1 ? '' : 's'} on my chip. Look!`];
    add('points', true, say(p), say(q)); }
  // ---- from earlier in this game
  { const t = who.tellerTurn, u = t === 1 ? 2 : rng.pick([t - 1, t + 1]);
    const say = v => [`This is my ${ORD[v - 1] || v + 'th'} turn as the Teller.`, v === 1 ? 'Never been the Teller before. First time!' : `I've been the Teller before. This is turn ${num(v)}.`];
    add('turn', false, say(t), say(u)); }
  if (!who.house) { const n = who.caught, m = near(rng, n, 1);
    const say = v => [v === 0 ? "I haven't caught a Goblin yet." : `I've caught the Goblin ${times(v)}.`, v === 0 ? 'Not one Goblin caught. Not yet.' : `Goblins I've caught so far: ${num(v)}.`];
    add('caught', false, say(n), say(m)); }
  if (who.tellerTurn > 1) { const n = who.fooled, m = near(rng, n, 1);
    const say = v => [v === 0 ? "As the Teller I haven't fooled anyone yet." : `As the Teller I've fooled ${v === 1 ? 'one player' : `${num(v)} players`}.`, v === 0 ? 'Nobody has fallen for my Goblins. Yet.' : `${v === 1 ? 'One player has' : `${num(v)} players have`} fallen for my Goblins.`];
    add('fooled', false, say(n), say(m)); }
  if (who.last && !who.house) {
    const L = {
      caught: ['Last round I caught the Goblin.', 'Last round? Caught that Goblin red-handed.'],
      fooled: ['Last round the Goblin fooled me.', 'The Goblin got me last round. I fell for it.'],
      missed: ["Last round I didn't pick a card.", 'Last round I never tapped a card at all.'],
      teller: ['Last round I was the Teller.', 'I was the one telling last round.'],
    };
    const wrong = rng.pick(Object.keys(L).filter(k => k !== who.last));
    add('last', false, L[who.last], L[wrong]);
  }
  return out;
}

/**
 * Deal a round: two truths and two Goblins, four different kinds of fact; at least one of the four is something you
 * can check on screen and at least one is something you have to remember, when the game has both.
 * -> { truths: [[plain, showy], …2], gobs: [[plain, showy], …2] }
 */
export function dealFacts(who, rng) {
  const all = rng.shuffle(factsAbout(who, rng));
  const look = all.filter(f => f.look), mem = all.filter(f => !f.look);
  const pick = [];
  if (look.length) pick.push(look[0]);
  if (mem.length) pick.push(mem[0]);
  for (const f of all) if (pick.length < 4 && !pick.includes(f)) pick.push(f);
  const order = rng.shuffle(pick.slice(0, 4));
  return { truths: order.slice(0, 2).map(f => f.truth), gobs: order.slice(2, 4).map(f => f.lie), kinds: order.map(f => f.k) };
}
