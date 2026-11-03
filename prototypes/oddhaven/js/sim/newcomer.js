// Someone made in the creator (M7): a new person moving into town, or an existing one changed. Plain commands, so a room runs
// exactly this. The sim takes what it lives by (name, race, age, traits, quirk, voice) and keeps the rest as `p.design`, plain
// data it never reads: the page turns that into a body. New people go on the END of the list so nobody's id moves.
//
//   { kind:'addPerson', given, family, gender, race, age, traits, quirk, voice, design, household (id or null for a new one), job? }
//   { kind:'editPerson', who, given, family, gender, race, age, traits, quirk, voice, design }
import { rand, randInt, pick } from './rng.js';
import { say, log } from './log.js';
import { nudge } from './feelings.js';
import { buildSchedule } from './people.js';
import { setBill } from './economy.js';
import { openingFor } from './phone.js';
import { householdRow, personRow } from './snapshot.js';

const MAX_DESIGN = 6000;
const text = (v, n) => String(v ?? '').replace(/[<>\n\r\t]/g, '').trim().slice(0, n);
const unit = v => (Number.isFinite(v) ? Math.max(0, Math.min(1, Math.round(v * 100) / 100)) : 0.5);

/** What a client sent, checked. Null: not a person this town can take. */
function cleanMaker(c, cmd) {
  const k = c.d.people, given = text(cmd.given, 24), family = text(cmd.family, 24);
  if (!given || !c.raceById[cmd.race] || (cmd.gender !== 'f' && cmd.gender !== 'm')) return null;
  const design = cmd.design ?? null;
  if (design && JSON.stringify(design).length > MAX_DESIGN) return null;
  const traits = [...new Set((cmd.traits ?? []).filter(t => c.traitById[t]))].slice(0, k.traitsPerPerson);
  const voice = cmd.voice ? { pitch: unit(cmd.voice.pitch), warmth: unit(cmd.voice.warmth), rough: unit(cmd.voice.rough), speed: unit(cmd.voice.speed), engine: text(cmd.voice.engine, 16) || 'formant' } : null;
  return { name: family ? `${given} ${family}` : given, gender: cmd.gender, race: cmd.race, age: Math.max(18, Math.min(120, Math.round(Number(cmd.age) || 30))), traits, quirks: c.quirkById[cmd.quirk] ? [cmd.quirk] : [], voice, design };
}

/** Somewhere nobody lives, nearest the first town's middle: the cheapest row the county can offer a newcomer. */
function emptyHome(c) {
  const s = c.s, taken = new Set(); for (const h of s.households) { taken.add(h.home); if (h.homeWas !== undefined) taken.add(h.homeWas); }
  for (const pl of c.places) if (pl.role === 'home' && !taken.has(pl.id) && !c.burning.has(pl.building) && !s.fire.burnt[pl.building]) return pl;
  return null;
}

function newHousehold(c, family) {
  const s = c.s, pl = emptyHome(c); if (!pl) return null;
  const e = c.k.economy, h = { id: s.households.length, name: family || 'New', members: [], home: pl.id, money: randInt(s, e.startMoneyMin, e.startMoneyMax), start: 0, ledger: {}, bill: 0, cars: [], autonomy: c.k.autonomy.default, ties: 'single', mail: [], book: [], story: [], premade: 'made' };     // picked by a player: treated like a gallery family
  h.start = h.money;
  s.households.push(h);
  return h;
}

function giveJob(c, p, want) {
  const jobs = c.d.jobs.jobs;
  if (want === 'none' && p.age >= 63) { p.retired = true; return; }
  const row = want && want !== 'none' ? c.jobById[want] : null;
  let place = row ? openingFor(c, p, row.id) : null, job = place ? row : null;
  if (!place) for (const j of jobs) { if (j.fallback || j.chain || j.brigade) continue; const pl = openingFor(c, p, j.id); if (pl) { job = j; place = pl; break; } }
  if (!job) { job = jobs.find(j => j.fallback); p.job = job.id; p.work = p.home; } else { p.job = job.id; p.work = place.id; }
  p.shift = 0;
  if (job.brigade) p.van = c.s.cars.find(x => x.engine && x.base === place.id)?.id ?? -1;
}

export function addPerson(c, cmd, refuse) {
  const s = c.s, row = cleanMaker(c, cmd), d = c.d.people, k = c.k.needs;
  if (!row) return refuse('not a person');
  let h = cmd.household == null ? null : s.households[cmd.household];
  if (cmd.household != null && !h) return refuse('no such household');
  if (h && h.members.length >= (c.places[h.home].caps.bed ?? 6)) return refuse('household full');
  const fresh = !h;
  if (fresh) h = newHousehold(c, text(cmd.family, 24));
  if (!h) return refuse('no empty homes');
  while (row.traits.length < d.traitsPerPerson) { const t = pick(s, d.traits).id; if (!row.traits.includes(t)) row.traits.push(t); }
  if (!row.quirks.length) row.quirks = [pick(s, d.quirks).id];
  const id = s.people.length, t = s.t;
  const p = {
    id, ...row, look: `custom-${id}-1`, lookRev: 1, household: h.id, home: h.home, job: null, work: -1, shift: 0, dayOffset: randInt(s, 0, 6), retired: false, wear: 'casual',
    car: -1, sch: { wake: 450, bed: 1410 }, n: c.needIds.map(() => k.startMax), mood: 0.75, nt: t, moodlets: [],
    at: h.home, act: null, trip: null, goal: null, wake: t + 1, since: t, lv: 2, last: null, lastMorning: -1, orders: [], xp: {}, shifts: 0, f: {},
  };
  s.people.push(p);
  h.members.push(id); s.made = (s.made ?? 0) + 1;
  if (h.members.length > 1) h.ties = fresh ? h.ties : h.ties === 'single' ? 'housemates' : h.ties;
  for (const o of h.members) { if (o === id) continue; const q = s.people[o]; nudge(c, p, o, 'known', 60); nudge(c, q, id, 'known', 60); nudge(c, p, o, 'like', 30); nudge(c, q, id, 'like', 30); nudge(c, p, o, 'trust', 25); nudge(c, q, id, 'trust', 25); }
  c.reindex();
  giveJob(c, p, cmd.job);
  if (fresh) {
    const models = d.cars.filter(m => m !== 'semi_truck'), car = { id: s.cars.length, household: h.id, driver: id, model: models[Math.floor(rand(s) * models.length)], at: h.home };
    s.cars.push(car); h.cars.push(car.id); p.car = car.id;
  }
  c.reindex();
  buildSchedule(c, p);
  for (const m of h.members) if (m !== id) setBill(c, h);
  setBill(c, h);
  if (cmd.guest) s.guests.push({ id, name: text(cmd.guest, 24), t });       // someone a friend brought with them (M8): the room writes this, a client cannot
  log(c, 'newcomer', { who: id, household: h.id, fresh });
  say(c, 'person.added', { row: personRow(p), house: householdRow(c, h), owner: cmd.owner ?? 'solo' });
}

export function editPerson(c, cmd, refuse) {
  const p = c.s.people[cmd.who], row = cleanMaker(c, cmd);
  if (!p || !row) return refuse('not a person');
  Object.assign(p, { name: row.name, gender: row.gender, race: row.race, age: row.age, voice: row.voice ?? p.voice, design: row.design ?? p.design });
  if (row.traits.length) p.traits = row.traits;
  if (row.quirks.length) p.quirks = row.quirks;
  p.lookRev = (p.lookRev ?? 0) + 1; p.look = `custom-${p.id}-${p.lookRev}`;
  c.reindex();
  setBill(c, c.s.households[p.household]);
  say(c, 'person.edited', { row: personRow(p) });
}
