// DEFUSE TOGETHER — co-op. A cartoon confetti cannon is about to go off. It has 5 wires to cut, one after another.
// One player at a time holds the DEVICE on their phone (it moves round the team each wire) and is the only one who can
// cut anything; the RULE BOOK is torn up and dealt round everyone else's phones, a few lines each. Every module is the
// same one verb: the device shows a CLUE (a coloured light, a picture, a number or a word) and some coloured wires;
// one line somewhere in the book says "<that clue> -> cut the <COLOUR> wire". The holder says the clue out loud, the
// reader who has it shouts the colour, the holder cuts. A wrong wire burns the fuse. Solo: you hold the device AND
// the whole (shorter) book. Same input, same game: only the seeded rng decides anything.
//
// Round 12 (2026-10-24): rebuilt after 0 thumbs up in 3 ratings ("Didn't get it", "Awkward controls"). It used to be
// four different puzzles (wires with "the first TRUE numbered rule wins", picture columns, a switch table with SET,
// near-twin words with button labels), each with its own controls and its own reading rule. Now every module is the
// same lookup and the same tap, and only the KIND of clue changes, so the second module is already easy.
export const meta = {
  id: 'defuse-together', title: 'Defuse Together', blurb: 'One holds the confetti cannon, the others hold the rule book — shout out the right wire before it blows!',
  how: ['The DEVICE moves round the team: its holder says the CLUE out loud.', 'The others hold the RULE BOOK: "clue → cut the RED wire". Shout it!', 'A wrong wire burns the fuse. Cut all 5 in time!'],
  kind: 'ui', min: 1, max: 4, seconds: 80, scoring: 'coop', unit: 'points', tags: ['coop', 'puzzle', 'social'], card: 'card-defuse-together', css: true,
};

export const COLORS = ['red', 'blue', 'yellow', 'white', 'black', 'green'];
export const LIGHTS = ['purple', 'orange', 'pink', 'teal', 'brown', 'silver'];   // never a wire colour: "the GREEN light -> cut GREEN" read as a trick
export const GLYPHS = ['star', 'moon', 'pretzel', 'balloon', 'anchor', 'crown', 'ghost', 'fish', 'key', 'bell', 'cloud', 'spiral', 'hook', 'eye', 'trident', 'cactus', 'kite', 'teapot'];
export const WORD_PAIRS = [['WAFFLE', 'WAFFEL'], ['WOBBLE', 'WOBBEL'], ['PICKLE', 'PIKKLE'], ['NOODLE', 'NOODEL'], ['GIGGLE', 'GIGGEL'], ['BUBBLE', 'BUBBEL'], ['PUDDLE', 'PUDDEL'], ['TICKLE', 'TIKKLE']];
/** The kinds of clue. The first module is always a light (the easiest to say); the word module, if any, comes last. */
export const KINDS = ['light', 'picture', 'number', 'word'];
export const RULES = { fuse: 70, swap: 1.6, penalty: { team: 7, solo: 5 }, modules: { team: 5, solo: 5 }, wires: { team: 4, solo: 4 }, lines: { team: 6, solo: 4 }, points: { op: 2, reader: 1, solo: 3 } };

/** Every clue value of a kind (indexes for light/picture, the number itself for number, the word for word). */
function valuesOf(kind) {
  if (kind === 'light') return LIGHTS.map((_, i) => i);
  if (kind === 'picture') return GLYPHS.map((_, i) => i);
  if (kind === 'number') return [1, 2, 3, 4, 5, 6, 7, 8, 9];
  return WORD_PAIRS.flat();
}
/** The module order: light first, then the other kinds shuffled, then one more of any kind but word. */
export function moduleKinds(rng, count) {
  const rest = rng.shuffle(['picture', 'number', 'word']);
  const out = ['light', ...rest];
  while (out.length < count) out.push(rng.pick(['light', 'picture', 'number']));
  const k = out.slice(0, count), wi = k.indexOf('word');
  if (wi >= 0 && wi !== k.length - 1) { k.splice(wi, 1); k.push('word'); }   // the near-twin spelling is the hard one: save it for last
  return k;
}
export function makeModule(rng, kind, solo) {
  const nW = solo ? RULES.wires.solo : RULES.wires.team, nL = solo ? RULES.lines.solo : RULES.lines.team;
  const wires = rng.shuffle(COLORS.map((_, i) => i)).slice(0, nW);
  // a word module is made of whole near-twin pairs (WAFFLE + WAFFEL), so the spelling is what decides it
  const clues = kind === 'word' ? rng.shuffle(rng.shuffle(WORD_PAIRS).slice(0, Math.ceil(nL / 2)).flat()) : rng.shuffle(valuesOf(kind)).slice(0, nL);
  const lines = clues.map(v => ({ v, col: rng.pick(wires) }));
  const ansLine = rng.pick(lines);
  if (kind === 'word') {                                               // the answer's twin always points at a DIFFERENT wire
    const pair = WORD_PAIRS.find(p => p.includes(ansLine.v)), twin = lines.find(l => l !== ansLine && pair.includes(l.v));
    if (twin.col === ansLine.col) twin.col = rng.pick(wires.filter(c => c !== ansLine.col));
  }
  // every line points at a wire that IS on the device, so nothing can be ruled out without the book
  return { kind, dev: { k: kind, v: ansLine.v, w: wires, cut: wires.map(() => 0) }, lines, ans: wires.indexOf(ansLine.col) };
}

/** What the device holder should do, worked out ONLY from the device and the book lines (tests + bots). */
export function solve(dev, lines) {
  const l = lines.find(x => x.v === dev.v); if (!l) return null;
  const i = dev.w.indexOf(l.col); return i >= 0 && !dev.cut[i] ? [['cut', i]] : null;
}

export function create({ rng, players }) {
  const n = players.length, solo = n === 1, pids = players.map(p => p.pid), events = [];
  const count = solo ? RULES.modules.solo : RULES.modules.team;
  const kinds = moduleKinds(rng, count);
  const mods = kinds.map(k => makeModule(rng, k, solo));
  const penalty = solo ? RULES.penalty.solo : RULES.penalty.team;
  const pts = Object.fromEntries(pids.map(p => [p, 0]));
  let mi = 0, phase = 'go', fuse = RULES.fuse, wait = 0, mistakes = 0, over = false, success = false, dev = structuredClone(mods[0].dev), lastBy = null;
  const opOf = i => pids[i % n];
  const readersOf = i => solo ? pids.slice() : pids.filter(p => p !== opOf(i));
  /** Book lines for each reader of module i: dealt round them (rotated each module so nobody always gets line 1). */
  const pages = mods.map((m, i) => {
    const rs = readersOf(i), out = new Map(rs.map(p => [p, []]));
    m.lines.forEach((l, k) => out.get(rs[(k + i) % rs.length]).push(l));
    return out;
  });
  /** Who holds the line that answers module i (for the "X had it!" shout-out). */
  const holderOf = i => { const l = mods[i].lines.find(x => x.v === mods[i].dev.v); for (const [p, ls] of pages[i]) if (ls.includes(l)) return p; return null; };
  function mistake(why) {
    mistakes++; fuse = Math.max(0, fuse - penalty);
    events.push({ e: 'oops', why, cost: penalty });
    if (fuse <= 0) boom();
  }
  function boom() { if (over) return; phase = 'boom'; over = true; success = false; events.push({ e: 'boom' }); }
  function solved() {
    const op = opOf(mi);
    if (solo) pts[op] += RULES.points.solo; else { pts[op] += RULES.points.op; for (const r of readersOf(mi)) pts[r] += RULES.points.reader; }
    lastBy = holderOf(mi);
    events.push({ e: 'defused', mod: mi, by: op, line: lastBy });
    if (mi + 1 >= mods.length) { phase = 'done'; over = true; success = true; events.push({ e: 'safe' }); return; }
    phase = 'swap'; wait = RULES.swap;
  }
  return {
    events,
    init: () => ({ n: mods.length, kinds, fuse: RULES.fuse, penalty, solo, ops: mods.map((_, i) => opOf(i)) }),
    act(pid, a, d) {
      if (over || phase !== 'go' || pid !== opOf(mi)) return;
      if (a !== 'cut' || !Number.isInteger(d) || d < 0 || d >= dev.w.length || dev.cut[d]) return;
      dev.cut[d] = 1; events.push({ e: 'snip', i: d });
      if (d === mods[mi].ans) solved(); else mistake('wrong wire');
    },
    step(dt) {
      if (over) return;
      if (phase === 'swap') { wait -= dt; if (wait <= 0) { mi++; dev = structuredClone(mods[mi].dev); phase = 'go'; events.push({ e: 'next', mod: mi, op: opOf(mi) }); } return; }
      fuse -= dt;
      if (fuse <= 0) { fuse = 0; boom(); }
    },
    state: () => ({ phase, mod: mi, op: opOf(mi), fuse: Math.round(fuse * 10) / 10, left: Math.max(0, Math.ceil(fuse)), mistakes, dev, sc: pts, by: lastBy }),
    priv(pid) {
      if (!pids.includes(pid)) return {};
      const page = pages[mi].get(pid);
      return { mod: mi, role: solo ? 'both' : pid === opOf(mi) ? 'op' : 'read', kind: mods[mi].kind, lines: page || [], readers: readersOf(mi) };
    },
    get over() { return over; },
    /** For tests. */
    mods, pages, get mi() { return mi; }, get fuse() { return fuse; },
    result() { return { coop: { success }, order: [pids.slice()], scores: { ...pts }, unit: meta.unit }; },
  };
}
