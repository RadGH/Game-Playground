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
// Expansion 1 M4 (2026-11-07): still 0 thumbs up ("confusing", "controls"). The whole game leaned on talking out loud,
// so it did nothing in an online room and a reader's phone had no button at all. Now every step is a TAP that works
// with or without voices: the holder taps CALL OUT to show the clue on every reader's phone, a reader taps the
// matching line to SEND it, and the line lands on the holder's wire ("Wren says: BLACK"). Solo you team up with Gizmo,
// a computer partner who takes its turn holding the device, so one player plays the real game too.
export const meta = {
  id: 'defuse-together', title: 'Defuse Together', blurb: 'One phone holds the confetti cannon, the others hold the rule book — pass the right wire before it pops!',
  how: ['Holding the DEVICE? Tap CALL OUT, then cut the wire your team sends.', 'Holding the RULE BOOK? Find the clue on your page and tap that line to send it.', 'A wrong wire burns the fuse. Cut all 5 in time!'],
  kind: 'ui', min: 1, max: 4, seconds: 90, scoring: 'coop', unit: 'points', tags: ['coop', 'puzzle', 'social'], card: 'card-defuse-together', css: true, rival: true,
};

/** The computer partner who fills the second seat when you play alone. */
export const CPU = 'cpu', CPU_NAME = 'Gizmo';
export const COLORS = ['red', 'blue', 'yellow', 'white', 'black', 'green'];
export const LIGHTS = ['purple', 'orange', 'pink', 'teal', 'brown', 'silver'];   // never a wire colour: "the GREEN light -> cut GREEN" read as a trick
export const GLYPHS = ['star', 'moon', 'pretzel', 'balloon', 'anchor', 'crown', 'ghost', 'fish', 'key', 'bell', 'cloud', 'spiral', 'hook', 'eye', 'trident', 'cactus', 'kite', 'teapot'];
export const WORD_PAIRS = [['WAFFLE', 'WAFFEL'], ['WOBBLE', 'WOBBEL'], ['PICKLE', 'PIKKLE'], ['NOODLE', 'NOODEL'], ['GIGGLE', 'GIGGEL'], ['BUBBLE', 'BUBBEL'], ['PUDDLE', 'PUDDEL'], ['TICKLE', 'TIKKLE']];
/** The kinds of clue. The first module is always a light (the easiest to say); the word module, if any, comes last. */
export const KINDS = ['light', 'picture', 'number', 'word'];
// M2 bug (2026-11-07): an all-Family CPU team defused it at every difficulty (78 s for 5 wires is a lot of time). Easy
// keeps `fuse`; Normal and Tricky light a shorter fuse by team size (index = players - 1; two players are slowest, one
// reader holds the whole book), measured with tools/cpu-bench.mjs so a Normal team usually makes it and a Family team
// usually does not (tests/coop-difficulty.test.js).
// M2 (2026-11-07): tuned with the CPU talking at a person's pace (cpu.js TALK); Easy keeps RULES.fuse (78 s)
export const FUSE_BY_SIZE = { normal: [60, 60, 58, 55], hard: [56, 56, 54, 52] };
export const RULES = { fuse: 78, cpu: { call: 1.2, tell: [1.6, 2.8], cut: 0.9 }, swap: 1.6, penalty: { team: 7, solo: 5 }, modules: { team: 5, solo: 5 }, wires: { team: 4, solo: 4 }, lines: { team: 6, solo: 4 }, points: { op: 2, reader: 1, sent: 1 } };

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

export function create({ rng, players, rivals = true, difficulty = 'normal' }) {
  const n = players.length, solo = n === 1, pids = players.map(p => p.pid), events = [];
  const gizmo = solo && rivals !== false;                              // "Rival when alone" off: you hold the device AND the whole book
  const seats = gizmo ? [pids[0], CPU] : pids.slice();                 // solo: Gizmo takes every other turn
  const count = solo ? RULES.modules.solo : RULES.modules.team;
  const kinds = moduleKinds(rng, count);
  const mods = kinds.map(k => makeModule(rng, k, solo));
  const cpuTell = mods.map(() => rng.range(RULES.cpu.tell[0], RULES.cpu.tell[1]));
  const penalty = solo ? RULES.penalty.solo : RULES.penalty.team;
  const pts = Object.fromEntries(pids.map(p => [p, 0]));
  const fuseMax = FUSE_BY_SIZE[difficulty]?.[Math.min(4, n) - 1] ?? RULES.fuse;
  let mi = 0, phase = 'go', fuse = fuseMax, wait = 0, mistakes = 0, over = false, success = false, dev = structuredClone(mods[0].dev), lastBy = null;
  let called = false, hint = null, sinceCall = 0, sinceHint = 0, sinceGo = 0;
  const opOf = i => seats[i % seats.length];
  const readersOf = i => seats.filter(p => p !== opOf(i));
  /** Book lines for each reader of module i: dealt round them (rotated each module so nobody always gets line 1). */
  const pages = mods.map((m, i) => {
    const rs = readersOf(i).length ? readersOf(i) : [opOf(i)], out = new Map(rs.map(p => [p, []]));
    m.lines.forEach((l, k) => out.get(rs[(k + i) % rs.length]).push(l));
    return out;
  });
  /** Who holds the line that answers module i (for the "X had it!" shout-out). */
  const holderOf = i => { const l = mods[i].lines.find(x => x.v === mods[i].dev.v); for (const [p, ls] of pages[i]) if (ls.includes(l)) return p; return null; };
  const give = (p, v) => { if (p in pts) pts[p] += v; };
  function mistake(why) {
    mistakes++; fuse = Math.max(0, fuse - penalty); hint = null;
    events.push({ e: 'oops', why, cost: penalty });
    if (fuse <= 0) boom();
  }
  function boom() { if (over) return; phase = 'boom'; over = true; success = false; events.push({ e: 'boom' }); }
  function solved() {
    const op = opOf(mi);
    give(op, RULES.points.op); for (const r of readersOf(mi)) give(r, RULES.points.reader);
    lastBy = holderOf(mi);
    if (hint && hint.ok) give(hint.by, RULES.points.sent);
    events.push({ e: 'defused', mod: mi, by: op, line: lastBy });
    if (mi + 1 >= mods.length) { phase = 'done'; over = true; success = true; events.push({ e: 'safe' }); return; }
    phase = 'swap'; wait = RULES.swap;
  }
  function call() { called = true; sinceCall = 0; events.push({ e: 'call', mod: mi }); }
  function tell(by, line) {
    hint = { by, v: line.v, col: line.col, ok: line.v === dev.v }; sinceHint = 0;
    events.push({ e: 'tell', by, col: hint.col });
  }
  function cut(d) {
    dev.cut[d] = 1; events.push({ e: 'snip', i: d });
    if (d === mods[mi].ans) solved(); else mistake('wrong wire');
  }
  /** Gizmo: calls the clue, finds its line and sends it, cuts whatever it is sent. Never guesses a wire blind. */
  function cpuStep() {
    if (!gizmo || phase !== 'go') return;
    if (opOf(mi) === CPU) {
      if (!called && sinceGo >= RULES.cpu.call) call();
      else if (hint && sinceHint >= RULES.cpu.cut) { const i = dev.w.indexOf(hint.col); if (i >= 0 && !dev.cut[i]) cut(i); else hint = null; }
    } else if (called && !hint && sinceCall >= cpuTell[mi]) {
      const line = (pages[mi].get(CPU) || []).find(l => l.v === dev.v); if (line) tell(CPU, line);
    }
  }
  return {
    events,
    init: () => ({ n: mods.length, kinds, fuse: fuseMax, penalty, solo, cpu: gizmo ? CPU_NAME : null, ops: mods.map((_, i) => opOf(i)) }),
    act(pid, a, d) {
      if (over || phase !== 'go' || !pids.includes(pid)) return;
      const op = opOf(mi);
      if (a === 'call') { if (pid === op && !called) call(); return; }
      if (a === 'tell') {
        const page = pages[mi].get(pid); if (!called || pid === op || !page || !Number.isInteger(d) || d < 0 || d >= page.length) return;
        tell(pid, page[d]); return;
      }
      if (pid !== op) return;
      if (a !== 'cut' || !Number.isInteger(d) || d < 0 || d >= dev.w.length || dev.cut[d]) return;
      if (!called) call();                                               // cutting shows the clue anyway
      cut(d);
    },
    step(dt) {
      if (over) return;
      if (phase === 'swap') { wait -= dt; if (wait <= 0) { mi++; dev = structuredClone(mods[mi].dev); phase = 'go'; called = false; hint = null; sinceGo = 0; events.push({ e: 'next', mod: mi, op: opOf(mi) }); } return; }
      sinceGo += dt; sinceCall += dt; sinceHint += dt;
      cpuStep();
      if (over || phase !== 'go') return;
      fuse -= dt;
      if (fuse <= 0) { fuse = 0; boom(); }
    },
    state: () => ({ phase, mod: mi, op: opOf(mi), fuse: Math.round(fuse * 10) / 10, left: Math.max(0, Math.ceil(fuse)), mistakes, dev, called, hint: hint && { by: hint.by, v: hint.v, col: hint.col }, sc: pts, by: lastBy }),
    priv(pid) {
      if (!pids.includes(pid)) return {};
      const page = pages[mi].get(pid);
      return { mod: mi, role: pid === opOf(mi) ? 'op' : 'read', kind: mods[mi].kind, lines: page || [], readers: readersOf(mi) };
    },
    get over() { return over; },
    /** For tests. */
    mods, pages, seats, get mi() { return mi; }, get fuse() { return fuse; },
    result() { return { coop: { success }, order: [pids.slice()], scores: { ...pts }, unit: meta.unit }; },
  };
}
