// DEFUSE TOGETHER — co-op. A cartoon confetti cannon is about to go off. It has 3-4 modules, one after another. One
// player at a time holds the DEVICE on their phone (it moves round the team each module) and is the only one who can
// cut, press or flip anything; the RULE BOOK for the module is torn up and dealt round everyone else's phones, a few
// lines each, so the holder has to describe what they see and the readers have to talk it through. Mistakes cost
// time. Defuse every module before the fuse runs out to win. Solo: you hold the device AND a shorter rule book for
// it (fewer rules, fewer wires and symbols), with the same fuse.
//
// Modules (each fully decided by its rule lines; `solve()` is the reference answer the tests and bots use):
//   wires     3-5 coloured wires. Rules are numbered; the FIRST rule that is true says which wire to cut.
//   symbols   4 odd little pictures. One column of the book holds all four; press them in that column's order.
//   switches  a coloured light and a number. The book's table says how the four switches must sit; flip, then SET.
//   word      a word on the display (some are near-twins: WAFFLE / WAFFEL). The book says which button it wants.
export const meta = {
  id: 'defuse-together', title: 'Defuse Together', blurb: 'One holds the confetti cannon, the others hold the rule book — talk it out before it blows!',
  how: ['The DEVICE moves round the team: its holder describes it and taps.', 'Everyone else has a few torn pages of the RULE BOOK: read them out!', 'Mistakes burn the fuse. Defuse every module in time!'],
  kind: 'ui', min: 1, max: 4, seconds: 90, scoring: 'coop', unit: 'points', tags: ['coop', 'puzzle', 'social'], card: 'card-defuse-together', css: true,
};

export const COLORS = ['red', 'blue', 'yellow', 'white', 'black', 'green'];
export const LIGHTS = ['red', 'blue', 'green', 'yellow'];
export const GLYPHS = ['star', 'moon', 'pretzel', 'balloon', 'anchor', 'crown', 'ghost', 'fish', 'key', 'bell', 'cloud', 'spiral', 'hook', 'eye', 'trident', 'cactus', 'kite', 'teapot'];
export const WORD_PAIRS = [['WAFFLE', 'WAFFEL'], ['WOBBLE', 'WOBBEL'], ['PICKLE', 'PIKKLE'], ['NOODLE', 'NOODEL'], ['GIGGLE', 'GIGGEL'], ['BUBBLE', 'BUBBEL'], ['PUDDLE', 'PUDDEL'], ['TICKLE', 'TIKKLE']];
export const LABELS = ['PUSH', 'POKE', 'PRESS', 'POP', 'PAT', 'PING', 'PROD', 'PLONK'];
export const ORD = ['first', 'second', 'third', 'last'];
export const KINDS = ['wires', 'symbols', 'switches', 'word'];
export const RULES = { fuse: 85, swap: 2.2, penalty: { team: 8, solo: 6 }, modules: { team: 4, solo: 3 }, points: { op: 2, reader: 1, solo: 3 } };
const UP = s => s.toUpperCase();

// ---- wires ----
const countOf = (w, c) => w.filter(x => x === c).length;
function condTrue(c, w) {
  switch (c.t) {
    case 'none': return countOf(w, c.col) === 0;
    case 'many': return countOf(w, c.col) > 1;
    case 'one': return countOf(w, c.col) === 1;
    case 'lastIs': return w[w.length - 1] === c.col;
    case 'firstIs': return w[0] === c.col;
    case 'else': return true;
  }
  return false;
}
function actIndex(a, w) {
  if (a.t === 'pos') return a.p === 3 ? w.length - 1 : a.p;
  if (a.t === 'lastOf') return w.lastIndexOf(a.col);
  if (a.t === 'firstOf') return w.indexOf(a.col);
  return -1;
}
function wireText(r) {
  const C = r.c.col != null ? UP(COLORS[r.c.col]) : '';
  const act = r.a.t === 'pos' ? `cut the ${ORD[r.a.p]} wire` : `cut the ${r.a.t === 'lastOf' ? 'last' : 'first'} ${UP(COLORS[r.a.col])} wire`;
  switch (r.c.t) {
    case 'none': return `If there is no ${C} wire, ${act}.`;
    case 'many': return `If there is more than one ${C} wire, ${act}.`;
    case 'one': return `If there is exactly one ${C} wire, ${act}.`;
    case 'lastIs': return `If the last wire is ${C}, ${act}.`;
    case 'firstIs': return `If the first wire is ${C}, ${act}.`;
    default: return `Otherwise, ${act}.`;
  }
}
/** The wire to cut: the first rule (by number) that is true. */
export function wireAnswer(rules, w) { for (const r of [...rules].sort((a, b) => a.n - b.n)) if (condTrue(r.c, w)) return actIndex(r.a, w); return -1; }
function makeWires(rng, solo) {
  const M = solo ? 3 : 5;
  for (let tries = 0; tries < 400; tries++) {
    const rules = [], seen = new Set();
    while (rules.length < M) {
      const t = rng.pick(['none', 'many', 'one', 'lastIs', 'firstIs']), col = rng.int(0, COLORS.length - 1), key = t + col;
      if (seen.has(key) || seen.has('c' + col) && rng.chance(0.5)) continue;
      seen.add(key); seen.add('c' + col);
      const a = t === 'none' || rng.chance(0.55) ? { t: 'pos', p: rng.int(0, 3) } : { t: rng.pick(['lastOf', 'firstOf']), col };
      rules.push({ c: { t, col }, a });
    }
    rules.push({ c: { t: 'else' }, a: { t: 'pos', p: rng.int(0, 3) } });
    rules.forEach((r, i) => { r.n = i + 1; r.text = wireText(r); });
    const want = rng.int(0, rules.length - 1);
    for (let k = 0; k < 300; k++) {
      const w = Array.from({ length: rng.int(3, solo ? 4 : 5) }, () => rng.int(0, COLORS.length - 1));
      const first = rules.findIndex(r => condTrue(r.c, w));
      if (first !== want) continue;
      const ans = wireAnswer(rules, w);
      if (ans < 0 || ans >= w.length) continue;
      return { kind: 'wires', dev: { k: 'wires', w, cut: w.map(() => 0) }, lines: rules, ans };
    }
  }
  throw new Error('defuse-together: no wire module');
}
// ---- symbols ----
/** Which column holds every shown symbol, and the order to press them in (as slots of `shown`). */
export function symbolOrder(cols, shown) {
  const col = cols.find(c => shown.every(s => c.g.includes(s)));
  return col ? col.g.filter(s => shown.includes(s)).map(s => shown.indexOf(s)) : null;
}
function makeSymbols(rng, solo) {
  const nCols = solo ? 2 : 4, show = solo ? 3 : 4;
  for (let tries = 0; tries < 400; tries++) {
    const cols = Array.from({ length: nCols }, (_, i) => ({ n: i + 1, g: rng.shuffle(GLYPHS).slice(0, 5) }));
    const ci = rng.int(0, nCols - 1), shown = rng.shuffle(rng.shuffle(cols[ci].g).slice(0, show));
    if (cols.some((c, j) => j !== ci && shown.every(s => c.g.includes(s)))) continue;
    if (cols.filter((c, j) => j !== ci && shown.filter(s => c.g.includes(s)).length >= show - 1).length === 0 && !solo && rng.chance(0.5)) continue;   // usually a decoy column shares most of them
    return { kind: 'symbols', dev: { k: 'symbols', s: shown, got: 0 }, lines: cols, ans: symbolOrder(cols, shown) };
  }
  throw new Error('defuse-together: no symbol module');
}
// ---- switches ----
export function switchTarget(rows, light, num) { const r = rows.find(r => r.c === light && r.odd === num % 2); return r ? r.p : null; }
function makeSwitches(rng, solo) {
  const colors = solo ? rng.shuffle([0, 1, 2, 3]).slice(0, 2) : [0, 1, 2, 3];
  const pats = rng.shuffle([...Array(16).keys()]);
  const rows = [];
  for (const c of colors) for (const odd of [1, 0]) { const m = pats[rows.length]; rows.push({ c, odd, p: [0, 1, 2, 3].map(i => (m >> i) & 1) }); }
  rng.shuffle(rows).forEach((r, i) => { r.n = i + 1; });
  rows.sort((a, b) => a.n - b.n);
  const light = rng.pick(colors), num = rng.int(1, 9), want = switchTarget(rows, light, num);
  let sw; do { sw = [0, 1, 2, 3].map(() => rng.int(0, 1)); } while (sw.join('') === want.join(''));
  return { kind: 'switches', dev: { k: 'switches', light, num, sw }, lines: rows, ans: want };
}
// ---- word ----
export function wordLabel(rows, word) { return rows.find(r => r.w === word)?.l ?? null; }
function makeWord(rng, solo) {
  const pairs = rng.shuffle(WORD_PAIRS).slice(0, solo ? 2 : 4);
  const rows = [];
  for (const [a, b] of pairs) { const [la, lb] = rng.shuffle(LABELS).slice(0, 2); rows.push({ w: a, l: la }, { w: b, l: lb }); }
  rng.shuffle(rows).forEach((r, i) => { r.n = i + 1; });
  rows.sort((a, b) => a.n - b.n);
  const row = rng.pick(rows), twin = rows.find(r => r !== row && WORD_PAIRS.some(p => p.includes(r.w) && p.includes(row.w)));
  const btns = new Set([row.l, twin.l]); for (const l of rng.shuffle(LABELS)) { if (btns.size >= 4) break; btns.add(l); }
  return { kind: 'word', dev: { k: 'word', word: row.w, b: rng.shuffle([...btns]) }, lines: rows, ans: row.l };
}
const MAKERS = { wires: makeWires, symbols: makeSymbols, switches: makeSwitches, word: makeWord };
export function makeModule(rng, kind, solo) { return MAKERS[kind](rng, solo); }

/**
 * What the device holder should do next, worked out ONLY from the device and the rule lines (the reference solver
 * for tests and bots). -> [[action, value], …] or null if the lines do not decide it.
 */
export function solve(dev, lines) {
  if (dev.k === 'wires') { const i = wireAnswer(lines, dev.w); return i >= 0 && !dev.cut[i] ? [['cut', i]] : null; }
  if (dev.k === 'symbols') { const o = symbolOrder(lines, dev.s); return o ? o.slice(dev.got).map(i => ['sym', i]) : null; }
  if (dev.k === 'switches') { const p = switchTarget(lines, dev.light, dev.num); return p ? [...p.map((v, i) => v !== dev.sw[i] ? ['flip', i] : null).filter(Boolean), ['set', 1]] : null; }
  if (dev.k === 'word') { const l = wordLabel(lines, dev.word); const i = dev.b.indexOf(l); return i >= 0 ? [['btn', i]] : null; }
  return null;
}

export function create({ rng, players }) {
  const n = players.length, solo = n === 1, pids = players.map(p => p.pid), events = [];
  const kinds = rng.shuffle(KINDS).slice(0, solo ? RULES.modules.solo : RULES.modules.team);
  const mods = kinds.map(k => makeModule(rng, k, solo));
  const penalty = solo ? RULES.penalty.solo : RULES.penalty.team;
  const pts = Object.fromEntries(pids.map(p => [p, 0]));
  let mi = 0, phase = 'go', fuse = RULES.fuse, wait = 0, mistakes = 0, over = false, success = false, dev = structuredClone(mods[0].dev);
  const opOf = i => pids[i % n];
  const readersOf = i => solo ? pids.slice() : pids.filter(p => p !== opOf(i));
  /** Rule lines for each reader of module i: dealt round them (rotated each module so nobody always gets line 1). */
  const pages = mods.map((m, i) => {
    const rs = readersOf(i), out = new Map(rs.map(p => [p, []]));
    m.lines.forEach((l, k) => out.get(rs[(k + i) % rs.length]).push(l));
    return out;
  });
  function mistake(why) {
    mistakes++; fuse = Math.max(0, fuse - penalty);
    events.push({ e: 'oops', why, cost: penalty });
    if (fuse <= 0) boom();
  }
  function boom() { if (over) return; phase = 'boom'; over = true; success = false; events.push({ e: 'boom' }); }
  function solved() {
    const op = opOf(mi);
    if (solo) pts[op] += RULES.points.solo; else { pts[op] += RULES.points.op; for (const r of readersOf(mi)) pts[r] += RULES.points.reader; }
    events.push({ e: 'defused', mod: mi, by: op });
    if (mi + 1 >= mods.length) { phase = 'done'; over = true; success = true; events.push({ e: 'safe' }); return; }
    phase = 'swap'; wait = RULES.swap;
  }
  return {
    events,
    init: () => ({ n: mods.length, kinds, fuse: RULES.fuse, penalty, solo, ops: mods.map((_, i) => opOf(i)) }),
    act(pid, a, d) {
      if (over || phase !== 'go' || pid !== opOf(mi)) return;
      const m = mods[mi];
      if (a === 'cut' && dev.k === 'wires') {
        if (!Number.isInteger(d) || d < 0 || d >= dev.w.length || dev.cut[d]) return;
        dev.cut[d] = 1; events.push({ e: 'snip', i: d });
        if (d === m.ans) solved(); else mistake('wrong wire');
      } else if (a === 'sym' && dev.k === 'symbols') {
        if (!Number.isInteger(d) || d < 0 || d >= dev.s.length || m.ans.indexOf(d) < dev.got) return;   // already pressed
        if (m.ans[dev.got] === d) { dev.got++; events.push({ e: 'click', i: d }); if (dev.got >= m.ans.length) solved(); }
        else mistake('wrong symbol');
      } else if (a === 'flip' && dev.k === 'switches') {
        if (!Number.isInteger(d) || d < 0 || d > 3) return;
        dev.sw[d] ^= 1; events.push({ e: 'flip', i: d });
      } else if (a === 'set' && dev.k === 'switches') {
        if (dev.sw.join('') === m.ans.join('')) solved(); else mistake('wrong switches');
      } else if (a === 'btn' && dev.k === 'word') {
        if (!Number.isInteger(d) || d < 0 || d >= dev.b.length) return;
        if (dev.b[d] === m.ans) solved(); else mistake('wrong button');
      }
    },
    step(dt) {
      if (over) return;
      if (phase === 'swap') { wait -= dt; if (wait <= 0) { mi++; dev = structuredClone(mods[mi].dev); phase = 'go'; events.push({ e: 'next', mod: mi, op: opOf(mi) }); } return; }
      fuse -= dt;
      if (fuse <= 0) { fuse = 0; boom(); }
    },
    state: () => ({ phase, mod: mi, op: opOf(mi), fuse: Math.round(fuse * 10) / 10, left: Math.max(0, Math.ceil(fuse)), mistakes, dev, sc: pts }),
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
