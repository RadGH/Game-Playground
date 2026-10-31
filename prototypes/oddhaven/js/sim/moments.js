// Moments (PLAN §1): the sim notices the beats worth telling and files them, as facts. A Moment is the same record in three places: live on
// Happening now for a couple of hours, in the story of every household it touches, and in the pile the Odd Sheet is written from. The sim
// never decides what interrupts anyone: that is the page's business (js/client/moment-card.js), and nothing here ever pauses anything.
//
//   s.moments = [{ i, t, k, pri, hh, who?, a?, b?, person?, place?, jump?, at? ... }], newest last, capped    h.story = same rows, per household    s.news = since the last paper
import { sendMail } from './mail.js';
import { threadOf } from './threads.js';
import { threadView } from './gossip.js';
import { raceTouch } from './racemood.js';

/** What is worth telling, and how much. Anything not here stays in the log and is never told. */
const BEATS = {
  'fire.call': 9, trapped: 10, rescued: 8, 'fire.out': 7, injured: 6, rehoused: 6, 'home.again': 4, repaired: 3, discharged: 3,
  promoted: 4, friends: 3, quarrel: 3, stir: 4, hardship: 9, tow: 2, mishap: 2, newjob: 3, 'door.forced': 0, sheet: 0,
};
const peopleOf = e => [e.who, e.person, e.a, e.b, e.other].filter(x => x !== undefined && x >= 0);

function whereIs(c, e) {
  if (e.place !== undefined) { const pl = c.places[e.place]; return [pl.x, pl.z]; }
  const id = peopleOf(e)[0], p = c.s.people[id];
  if (!p) return null;
  if (p.hold) return [p.hold.x, p.hold.z];
  const pl = c.places[p.at >= 0 ? p.at : p.home];
  return [pl.x, pl.z];
}
/** Who to fade into if the player says yes. */
function jumpFor(c, e) {
  if (e.kind === 'fire.call') return e.crew[0] ?? -1;
  if (e.kind === 'trapped') { const C = c.s.fire.calls.find(x => c.s.fire.fires.find(f => f.id === x.fire)?.id === e.fire); return C?.crew[0] ?? e.who; }
  return peopleOf(e)[0] ?? -1;
}

export function momentFromLog(c, e) {
  const pri = e.kind === 'story' ? c.d.stories.kinds[e.story]?.pri ?? c.d.stories.beats[e.story]?.pri ?? 3 : BEATS[e.kind];
  if (!pri) return;
  if (e.kind === 'fire.out' && !e.rooms && !e.rescued) return;
  if (e.kind === 'tow' && e.reason !== 'flipped') return;
  if (e.kind === 'quarrel' && e.quiet) return;
  const s = c.s, k = c.k.moments, { kind, t, ...facts } = e, hh = e.hh ?? [...new Set(peopleOf(e).map(id => s.people[id]?.household).filter(h => h !== undefined))];
  const row = { i: (s.momentNext = (s.momentNext || 0) + 1), t, k: kind, pri, ...facts, hh, jump: jumpFor(c, e), at: whereIs(c, e) };
  s.moments.push(row);
  if (s.moments.length > k.cap) s.moments.shift();
  for (const id of hh) { const h = s.households[id]; if (!h) continue; (h.story ||= []).push(row); if (h.story.length > k.storyCap) h.story.shift(); }
  s.news.push(row);
  if (s.news.length > k.newsCap) { s.news.sort((a, b) => a.pri - b.pri || a.t - b.t); s.news.shift(); s.news.sort((a, b) => a.t - b.t); }
  c.momentRev = (c.momentRev || 0) + 1;
  c.out.push({ kind: 'moment', t, m: row });
}

export const liveMoments = c => { const since = c.s.t - c.clock.ticks(c.k.moments.liveHours * 60); return c.s.moments.filter(m => m.t >= since); };

// ---- the paper (PLAN §1: every 3 days, built from what really happened)

/** A fire makes one story: the end of it if it is over, its worst beat if not. */
function pickStories(rows) {
  const out = [], fires = new Map(), threads = new Map();
  for (const r of rows) {
    if (r.thread) { const had = threads.get(r.thread); if (!had || r.pri >= had.pri) threads.set(r.thread, r); continue; }      // a thread makes one story, its biggest step since the last issue
    if (r.fire === undefined) { out.push(r); continue; }
    const had = fires.get(r.fire); if (!had || r.k === 'fire.out' || (had.k !== 'fire.out' && r.pri > had.pri)) fires.set(r.fire, r);
  }
  for (const r of fires.values()) out.push(r);
  for (const r of threads.values()) out.push(r);
  // a rescue is its own story, whatever else happened that night
  for (const r of rows) if (r.k === 'rescued' && !out.includes(r)) out.push(r);
  // a story with a past beats a one-off of the same weight: this is what the town is following
  const weight = r => r.pri + (r.part >= 2 ? Math.min(3, r.part * 0.5) : 0);
  return out.sort((a, b) => weight(b) - weight(a) || b.t - a.t);
}
/** The row as it goes in the paper: a step in a thread carries the steps so far. */
function inPaper(c, r) {
  if (!r?.thread) return r;
  const th = threadOf(c, r.thread);
  return th ? { ...r, arc: threadView(c, th) } : r;
}

export function printSheet(c) {
  const s = c.s, k = c.k.moments, no = (s.sheetNo = (s.sheetNo || 0) + 1), rows = pickStories(s.news);
  const big = rows.filter(r => r.pri >= 4), small = rows.filter(r => r.pri < 4 && r.pri >= 2);
  const lead = big[0] ?? small[0] ?? null, had = new Set([lead?.story ?? lead?.k]);
  // no paper prints three weddings: one of a kind on a page, the rest go to the gossip column
  const stories = (lead ? [...big, ...small].filter(r => r !== lead) : []).filter(r => { const id = r.story ?? r.k; if (had.has(id) && r.story) return false; had.add(id); return true; }).slice(0, k.storiesPerSheet);
  const used = new Set([lead, ...stories]), left = rows.filter(r => !used.has(r) && r.pri < 5);
  // the gossip column wants people, not cake: a birthday only if there is truly nothing else
  const column = [...left.filter(r => r.story !== 'birthday'), ...left.filter(r => r.story === 'birthday').slice(0, 1)].slice(0, 3);
  for (const r of [lead, ...stories]) for (const id of [r?.who, r?.other, r?.person, r?.a, r?.b]) { if (id !== undefined && id >= 0 && s.people[id]) raceTouch(c, s.people[id], 'mentioned'); }
  const count = kind => s.news.filter(r => r.k === kind).length;
  s.columnist ??= s.people.filter(p => p.retired)[0]?.id ?? s.people[0].id;
  const sheet = { no, t: s.t, day: c.clock.day(s.t), lead: inPaper(c, lead), stories: stories.map(r => inPaper(c, r)), column, columnist: s.columnist, tally: { fires: count('fire.out'), rescues: count('rescued'), tows: count('tow'), friends: count('friends'), promoted: count('promoted'), weddings: s.news.filter(r => r.story === 'rm_wedding').length, feuds: s.social.threads.filter(x => x.k === 'feud').length, planks: s.sites?.made.delivered ?? 0 } };
  s.sheets.push(sheet);
  if (s.sheets.length > k.sheetKeep) s.sheets.shift();
  s.news = [];
  for (const h of s.households) sendMail(c, h, 'sheet', { no, lead: lead?.k ?? null });
  c.out.push({ kind: 'sheet', t: s.t, no });
}
export function stepSheet(c) {
  const k = c.k.moments, cl = c.clock, t = c.s.t;
  if (t % cl.ticksPerDay !== (cl.tickAt(1, k.sheetHour * 60) % cl.ticksPerDay)) return;
  if (cl.day(t) % k.sheetEveryDays === 0 && cl.day(t) > 0) printSheet(c);
}
