// The city's statistics: a compact daily history for the Statistics charts, and the defence tallies (creatures killed,
// damage taken, swarms faced and held). Owner 2026-11-17: "an in game statistics menu with that info and other charts".
//
// History lives in the region save (r.history), small on purpose:
//   { v: 1, cols: [...COLS], recent: [[...one row per day]], old: [[...one row per `every` days]], every, openN, openStart }
//   recent keeps the last T.statsRecentDays days (default 120) one row a day. Rows pushed out of it are folded into
//   `old` in blocks of `every` days (start 10); when old passes T.statsOldRows (default 150) rows, neighbouring pairs
//   are merged and `every` doubles — so a city of any age keeps its whole story in at most ~270 rows.
//   Folding: counts (kills, damage) add up; the day is the block's first; every other column is the block's average.
// Saves from before 2026-11-17 have no history: recording starts from the day they are opened (ensureHistory).
// Pure: recordDay(r, sample) takes the numbers (main.js gathers them from the sim, sampleCity below does it in tests).
import { T } from './tuning.js';
import { census, demand, appeal, dailyNet, monthBudget } from './city.js';
import { wallMaxHp } from './arms.js';

/** Columns of a history row, in order. Demand, appeal, land value and wall health are stored ×100 as whole numbers. */
export const COLS = ['d', 'p', 'm', 'n', 'R', 'C', 'I', 'pu', 'ps', 'wu', 'ws', 'ap', 'lv', 'k', 'x', 'wh'];
const SUM = new Set(['k', 'x']);
export const recentCap = () => Math.max(10, Math.round(T.statsRecentDays ?? 120));
export const oldCap = () => Math.max(10, Math.round(T.statsOldRows ?? 150));

export function ensureHistory(r) {
  if (!r.history || !Array.isArray(r.history.recent)) r.history = { v: 1, cols: COLS.slice(), recent: [], old: [], every: 10 };
  const h = r.history; h.old ||= []; h.every ||= 10;
  // a save from a version with other columns: keep what lines up by name
  if (h.cols?.join() !== COLS.join()) { const from = h.cols || COLS, map = COLS.map(c => from.indexOf(c)); const conv = row => map.map(j => (j >= 0 ? row[j] : 0) ?? 0); h.recent = h.recent.map(conv); h.old = h.old.map(conv); h.cols = COLS.slice(); }
  return h;
}
export function ensureTally(r) {
  const s = r.stats || (r.stats = {});
  s.kills ??= 0; s.wallsBroken ??= 0; s.wrecked ??= 0; s.turretsLost ??= 0; s.swarms ??= 0; s.held ??= 0;
  s.dayKills ??= 0; s.dayDamage ??= 0; s.swarm ??= null; s.since ??= Math.floor(r.day || 0);
  return s;
}
/** A creature died (any cause: turrets, strikes). */
export function noteKill(r, n = 1) { const s = ensureTally(r); s.kills += n; s.dayKills += n; }
/** Something of the city's was broken: 'wall-broken' | 'building-wrecked' | 'turret-wrecked'. */
export function noteDamage(r, type) {
  const s = ensureTally(r);
  if (type === 'wall-broken') s.wallsBroken++; else if (type === 'building-wrecked') s.wrecked++; else if (type === 'turret-wrecked') s.turretsLost++; else return;
  s.dayDamage++; if (s.swarm) s.swarm.breaches++;
}
/** A big swarm set out. It counts as faced once T.swarmHoldDays (default 3) days have passed; held if nothing broke. */
export function noteSwarm(r) { const s = ensureTally(r); closeSwarm(r, true); s.swarm = { day: r.day, breaches: 0 }; }
function closeSwarm(r, force = false) {
  const s = r.stats; if (!s?.swarm) return;
  if (!force && r.day - s.swarm.day < (T.swarmHoldDays ?? 3)) return;
  s.swarms++; if (!s.swarm.breaches) s.held++; s.swarm = null;
}

/** The day's numbers from the city as it is now (main.js passes extra live numbers: wall health). */
export function sampleCity(r, extra = {}) {
  const dm = demand(r), a = appeal(r), pw = r.power || { supply: 0, demand: 0 }, wt = r.waterNet || { supply: 0, demand: 0 };
  const s = ensureTally(r);
  return {
    d: Math.floor(r.day), p: Math.round(r.people.total), m: Math.round(r.money), n: Math.round(dailyNet(r, r.budget || monthBudget(r))),
    R: Math.round(dm.R * 100), C: Math.round(dm.C * 100), I: Math.round(dm.I * 100),
    pu: Math.round(pw.demand || 0), ps: Math.round(pw.supply || 0), wu: Math.round(wt.demand || 0), ws: Math.round(wt.supply || 0),
    ap: Math.round(a.value * 100), lv: Math.round((a.parts.land || 0) * 100),
    k: s.dayKills, x: s.dayDamage, wh: Math.round(extra.wallHealth ?? wallHealth(r) * 100),
  };
}
/** Average health of the city's wall tiles, 0..1 (1 with no walls). */
export function wallHealth(r) {
  let n = 0, hp = 0; const W = r.tiles.wall, H = r.tiles.wallHp;
  for (let i = 0; i < W.length; i++) if (W[i]) { n++; hp += Math.max(0, Math.min(1, H[i] / wallMaxHp(r, W[i]))); }
  return n ? hp / n : 1;
}
/** Wall tiles and gates the city has. */
export function wallCount(r) { let walls = 0, gates = 0; for (const v of r.tiles.wall) if (v === 9) gates++; else if (v) walls++; return { walls, gates }; }

/** Once a game day: store a row (one per day — a second call the same day replaces it), reset the day's tallies. */
export function recordDay(r, sample = sampleCity(r)) {
  const h = ensureHistory(r), s = ensureTally(r);
  const row = COLS.map(c => Number.isFinite(sample[c]) ? sample[c] : 0);
  const last = h.recent[h.recent.length - 1];
  if (last && last[0] === row[0]) h.recent[h.recent.length - 1] = row; else h.recent.push(row);
  while (h.recent.length > recentCap()) foldOld(h, h.recent.shift());
  s.dayKills = 0; s.dayDamage = 0;
  closeSwarm(r);
  return row;
}
function foldOld(h, row) {
  // the open block (the last old row while h.openN > 0) takes rows until it spans `every` days
  const last = h.old[h.old.length - 1];
  if (last && h.openN > 0 && row[0] - h.openStart < h.every) { mergeRows(last, row, h.openN, 1); h.openN++; }
  else { h.old.push(row.slice()); h.openN = 1; h.openStart = row[0]; }
  if (h.old.length > oldCap()) {
    const out = [];
    for (let i = 0; i < h.old.length; i += 2) { const a = h.old[i].slice(); if (h.old[i + 1]) mergeRows(a, h.old[i + 1], 1, 1); out.push(a); }
    h.old = out; h.every *= 2; h.openN = 0;   // merged blocks are closed: the next fold opens a new one
  }
}
function mergeRows(a, b, wa, wb) {
  for (let j = 0; j < COLS.length; j++) {
    const c = COLS[j];
    a[j] = c === 'd' ? a[j] : SUM.has(c) ? a[j] + b[j] : Math.round((a[j] * wa + b[j] * wb) / (wa + wb));
  }
}

/** Rows for a chart: { days: [...], [col]: [...] }. range = days back from the latest (0 / Infinity = all). */
export function series(r, range = 0) {
  const h = ensureHistory(r);
  let rows = [...h.old, ...h.recent];
  if (range && Number.isFinite(range) && rows.length) { const end = rows[rows.length - 1][0]; rows = rows.filter(x => x[0] > end - range); }
  const out = { days: rows.map(x => x[0]) };
  COLS.forEach((c, j) => { if (c !== 'd') out[c] = rows.map(x => x[j]); });
  return out;
}

/** The Overview and Defence numbers in one place (the Statistics sheet prints these). */
export function overview(r) {
  const c = census(r), dm = demand(r), a = appeal(r), pw = r.power || { supply: 0, demand: 0, share: 1 }, wt = r.waterNet || { supply: 0, demand: 0, share: 1 };
  return {
    people: r.people.total, waiting: r.people.arriving, homes: c.homes, jobs: c.jobs, money: r.money, perDay: dailyNet(r, r.budget || monthBudget(r)),
    demand: dm, power: { supply: pw.supply || 0, demand: pw.demand || 0 }, water: { supply: wt.supply || 0, demand: wt.demand || 0 },
    appeal: a.value, land: a.parts.land || 0, edu: r.people.edu || 0, reputation: r.reputation || 0,
  };
}
