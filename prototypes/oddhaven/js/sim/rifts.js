// Rifts and the fights at them (PLAN M9). A rift opens at a real place with hours of warning, the town reacts, hunters answer, and a fight is numbers stepped here whether anyone is
// looking or not. Like a fire, a rift is rolled off hashes and never spends the sim's random stream, so it plays the same at every detail level.
//
//   s.rifts = { next, list: [R], last, stats }
//   R = { id, site, x, z, place, size, st: 'signs'|'open'|'seal'|'closing', t0, at (opens), wave, gap, M: [M], crew: [ids], seal, kills, hurt, hands, finds, runs, called, car, hh }
//   M = { i, k, x, z, hp, max, st: 'go'|'wind'|'rest', t, tg, ax, az }     t = the tick this state ends. ax, az = where a blow is aimed: a spit lands there, wherever you are by then
//   p.fg = { r, hp, max, a, s, d, dodge, down, hit, ai, mon }             on a fight. a, s, d = ticks the three buttons are ready again
//
// One set of rules, two ways (rule 3). hit(), burst(), dodge() and sealStep() are the only ways anyone lands anything: the sim runs them for its crew and for the party you brought;
// a player's `fight` command runs the same ones from where the browser says they stand. The sim, here, is the referee for everybody: in a room no browser decides what got hit.
//
// Nobody dies (M5). Knocked down at a rift: you stay down until it is over, then the clinic, and the cover pays.
import { log, say } from './log.js';
import { addMoodlet } from './needs.js';
import { nudge } from './feelings.js';
import { earn, payShift } from './economy.js';
import { startDrive } from './traffic.js';
import { hash01 as h01 } from './rng.js';
import { positionOf } from './levels.js';
import { toClinic } from './fire.js';
import { nearestPlace } from './control.js';
import { onShiftNow, freeVan } from './law.js';

const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const K = c => c.k.rifts;
const r1 = v => Math.round(v * 10) / 10;
const MON = (c, k) => c.d.monsters.kinds[k];

export const newRifts = () => ({ next: 1, list: [], last: -1e9, stats: { rifts: 0, closed: 0, kills: 0, down: 0, finds: 0, hands: 0, county: 0 } });
const riftOf = (c, id) => c.s.rifts.list.find(R => R.id === id) ?? null;
const lodges = c => c.places.filter(pl => pl.kind === 'rift_lodge');

/** Which places a rift keeps shut. Rebuilt on load and on every change, never saved. */
export function refreshRifts(c) {
  const k = K(c);
  for (const pl of c.places) pl.riftShut = false;
  for (const R of c.s.rifts.list) if (R.st !== 'signs') for (const pl of c.places) if (dist(pl.x, pl.z, R.x, R.z) < k.shutMeters) pl.riftShut = true;
  c.riftRev = (c.riftRev || 0) + 1;
}

// ---- how one starts

function pickSite(c, salt) {
  const sites = c.town.riftSites ?? [], used = new Set(c.s.rifts.list.map(R => R.site));
  const list = sites.filter(q => !used.has(q.id));
  return list.length ? list[Math.floor(h01(salt) * list.length)] : null;
}
function pickSize(c, salt) {
  const rows = Object.entries(c.d.monsters.sizes), all = rows.reduce((n, [, r]) => n + r.weight, 0);
  let v = h01(salt) * all;
  for (const [id, r] of rows) { v -= r.weight; if (v <= 0) return id; }
  return rows[0][0];
}
export function startRift(c, { site = null, size = null, now = false } = {}) {
  const s = c.s, S = s.rifts, k = K(c), salt = `${s.seed}/rift/${s.t}`, q = (site && (c.town.riftSites ?? []).find(x => x.id === site)) ?? pickSite(c, salt);
  if (!q) return null;
  const place = nearestPlace(c, q.x, q.z).place, R = { id: S.next++, site: q.id, x: q.x, z: q.z, place: place.id, size: size && c.d.monsters.sizes[size] ? size : pickSize(c, salt + 's'), st: 'signs', t0: s.t, at: s.t + (now ? 0 : c.clock.ticks(k.signsHours * 60)), wave: 0, gap: 0, M: [], crew: [], seal: 0, kills: 0, hurt: 0, hands: 0, finds: [], runs: 0, called: 0, car: -1, nextM: 1 };
  S.list.push(R); S.stats.rifts++; S.last = s.t;
  refreshRifts(c);
  log(c, 'rift.signs', { rift: R.id, place: R.place, size: R.size, x: R.x, z: R.z, hh: nearHomes(c, R) });
  for (const p of s.people) { if (p.at < 0 || dist(c.places[p.at].x, c.places[p.at].z, R.x, R.z) > k.reactMeters) continue; addMoodlet(c, p, 'rift_near', -0.04, 4); if (p.act && c.actionById[p.act.a].interruptible && !p.orders.length && h01(`${salt}/g/${p.id}`) < 0.2) p.orders.push({ kind: 'use', action: 'gawk', place: p.at }); }
  return R;
}
const nearHomes = (c, R) => c.s.households.filter(h => h.members.length && dist(c.places[h.home].x, c.places[h.home].z, R.x, R.z) < K(c).reactMeters * 1.4).map(h => h.id).slice(0, 8);

function rollRift(c) {
  const s = c.s, S = s.rifts, k = K(c);
  if (S.list.length || s.t - S.last < c.clock.ticks(k.cooldownHours * 60) || !(c.town.riftSites ?? []).length) return;
  if (h01(`${s.seed}/riftroll/${Math.floor(s.t / c.clock.ticks(60))}`) < k.perHour) startRift(c);
}

function openRift(c, R) {
  const s = c.s, k = K(c);
  R.st = 'open'; R.at = s.t; R.opened = s.t;
  spawnWave(c, R);
  refreshRifts(c);
  log(c, 'rift.open', { rift: R.id, place: R.place, size: R.size, x: R.x, z: R.z, crew: [...(R.team ?? R.crew)], hh: nearHomes(c, R) });
  say(c, 'siren', { rift: R.id });
  // the street clears out: people outdoors nearby go home, and those indoors stay there
  for (const p of s.people) {
    if (p.hold || p.beat || p.fg || p.call) continue;
    const pl = p.at >= 0 ? c.places[p.at] : null; if (!pl || dist(pl.x, pl.z, R.x, R.z) > k.reactMeters) continue;
    addMoodlet(c, p, 'rift_panic', -0.1, 8);
    if (p.at !== p.home && p.orders.length < c.k.orders.max && !p.act?.ordered && p.act?.a !== 'cells') { p.orders = [{ kind: 'home' }]; p.wake = s.t; }
  }
}

function spawnWave(c, R) {
  const s = c.s, k = K(c), list = c.d.monsters.sizes[R.size].waves[R.wave] ?? [];
  list.forEach((id, n) => {
    const m = MON(c, id), a = h01(`${s.seed}/sp/${R.id}/${R.wave}/${n}`) * 6.283, d = 2 + h01(`${s.seed}/sd/${R.id}/${R.wave}/${n}`) * k.spawnMeters;
    R.M.push({ i: R.nextM++, k: id, x: r1(R.x + Math.cos(a) * d), z: r1(R.z + Math.sin(a) * d), hp: m.hp, max: m.hp, st: 'go', t: s.t, tg: -1, ax: 0, az: 0 });
  });
  say(c, 'fight.wave', { rift: R.id, wave: R.wave, n: list.length });
}

// ---- who fights

const baseHp = (c, p) => (p.job === 'rift_warden' ? K(c).wardenHp : K(c).hp);
function join(c, R, p, ai) {
  if (p.fg) return p.fg;
  const hp = Math.round(baseHp(c, p) * (1 - Math.min(0.6, p.hurt || 0)));
  p.fg = { r: R.id, hp, max: hp, a: 0, s: 0, d: 0, dodge: 0, down: 0, ai: ai ? 1 : 0, hit: 0 };
  if (!R.crew.includes(p.id)) R.crew.push(p.id);
  if (p.hold) { R.hands = 1; c.s.rifts.stats.hands++; }
  say(c, 'fight.joined', { rift: R.id, who: p.id, owner: p.hold?.owner });
  return p.fg;
}
/** Where a fighter is: the browser's word for anyone played, the sim's for anyone else. */
const fighterAt = p => (p.hold ? { x: p.hold.x, z: p.hold.z } : { x: p.wpos?.[0] ?? 0, z: p.wpos?.[1] ?? 0 });
export const skillOf = (c, p) => c.d.monsters.skills[p.job] ?? c.d.monsters.skills.default;
const power = (c, p) => { const k = K(c), rank = Math.floor((p.xp[c.jobById[p.job]?.skill] || 0) / c.k.economy.rankXpStep); return (p.job === 'rift_warden' ? k.wardenDmg : k.basicDmg) * (1 + 0.04 * rank); };

function damage(c, R, M, by, n, what) {
  const s = c.s, k = K(c), crit = h01(`${s.seed}/cr/${R.id}/${M.i}/${s.t}/${by.id}`) < k.critChance, dmg = Math.round(n * (crit ? k.critScale : 1));
  M.hp = Math.max(0, M.hp - dmg);
  R.first ??= s.t;
  if (M.st === 'wind' && !MON(c, M.k).boss && crit) { M.st = 'rest'; M.t = s.t + 4; }     // a good hit knocks the blow aside
  say(c, 'fight.hit', { rift: R.id, m: M.i, who: by.id, dmg, crit: crit ? 1 : 0, what });
  if (M.hp <= 0) {
    R.kills++; s.rifts.stats.kills++;
    R.M = R.M.filter(q => q !== M);
    say(c, 'fight.kill', { rift: R.id, m: M.i, k: M.k, who: by.id, x: M.x, z: M.z });
    if (h01(`${s.seed}/fd/${R.id}/${M.i}`) < k.findPerKill || MON(c, M.k).boss) R.finds.push([M.k, by.id]);
  }
}
/** The first button: the nearest thing in reach. No aiming on a phone. */
function hit(c, R, p, at) {
  const s = c.s, k = K(c), F = p.fg;
  if (F.down || s.t < F.a) return false;
  let best = null, d = k.basicReach;
  for (const M of R.M) { const e = dist(at.x, at.z, M.x, M.z) - (MON(c, M.k).boss ? 0.8 : 0); if (e <= d) { d = e; best = M; } }
  F.a = s.t + c.clock.seconds(k.basicCool);
  if (best) damage(c, R, best, p, power(c, p), 'hit');
  return !!best;
}
function burst(c, R, p, at) {
  const s = c.s, F = p.fg, S = skillOf(c, p);
  if (F.down || s.t < F.s) return false;
  F.s = s.t + c.clock.seconds(S.cool);
  const list = R.M.filter(M => dist(at.x, at.z, M.x, M.z) <= S.radius);
  for (const M of list) damage(c, R, M, p, S.dmg, 'skill');
  say(c, 'fight.skill', { rift: R.id, who: p.id, x: r1(at.x), z: r1(at.z), n: list.length, r: S.radius });
  return list.length > 0;
}
function dodge(c, p) {
  const s = c.s, k = K(c), F = p.fg;
  if (F.down || s.t < F.d) return false;
  F.d = s.t + c.clock.seconds(k.dodgeCool); F.dodge = s.t + c.clock.seconds(k.dodgeSeconds);
  return true;
}
function sealStep(c, R, p, q) {
  const k = K(c), a = q >= c.k.work.perfectAt ? 1.5 : q >= c.k.work.okAt ? 1 : 0.5;
  R.seal += a;
  say(c, 'fight.seal', { rift: R.id, who: p.id, seal: R.seal, of: k.sealHits });
  if (R.seal >= k.sealHits) closeRift(c, R, 'sealed', p.id);
}

function knockDown(c, R, p) {
  const s = c.s, k = K(c), F = p.fg;
  F.down = 1; F.hp = 0; R.hurt++; s.rifts.stats.down++;
  p.hurt = Math.max(p.hurt || 0, k.hurtTo);
  addMoodlet(c, p, 'knocked_down', -0.12, 12);
  log(c, 'hunter.down', { who: p.id, rift: R.id, place: R.place, hh: [p.household] });
  say(c, 'fight.down', { rift: R.id, who: p.id, owner: p.hold?.owner });
}
function wound(c, R, M, p, n) {
  const s = c.s, F = p.fg;
  if (F.dodge > s.t) { say(c, 'fight.miss', { rift: R.id, who: p.id, owner: p.hold?.owner, m: M.i }); return; }
  F.hp = Math.max(0, F.hp - n); F.hit = s.t;
  say(c, 'fight.hurt', { rift: R.id, who: p.id, m: M.i, dmg: n, hp: F.hp, owner: p.hold?.owner });
  if (F.hp <= 0) knockDown(c, R, p);
}

// ---- a tick of a fight

function stepMonsters(c, R) {
  const s = c.s, k = K(c), t = s.t, dt = 1 / c.clock.tps, up = R.crew.map(id => s.people[id]).filter(p => p.fg && !p.fg.down);
  const leash = (x, z) => dist(x, z, R.x, R.z) <= k.leashMeters;
  for (const M of R.M) {
    const m = MON(c, M.k);
    if (M.st === 'rest') { if (t >= M.t) M.st = 'go'; continue; }
    if (M.st === 'wind') {
      if (t < M.t) continue;
      M.st = 'rest'; M.t = t + c.clock.seconds(m.rest);
      if (m.move === 'charge') {      // a straight run at where you stood: a beetle does not turn
        const dx = M.ax - M.x, dz = M.az - M.z, d = Math.hypot(dx, dz) || 1, run = Math.min(d, m.speed * K(c).chargeBoost);
        M.x = r1(M.x + dx / d * run); M.z = r1(M.z + dz / d * run);
      }
      const r = m.move === 'spit' ? 1.6 : m.reach + 0.5;
      for (const p of up) { const at = fighterAt(p); if (m.move === 'spit' ? dist(at.x, at.z, M.ax, M.az) <= r : dist(at.x, at.z, M.x, M.z) <= r) { wound(c, R, M, p, m.dmg); if (m.move !== 'spit') break; } }
      say(c, 'fight.blow', { rift: R.id, m: M.i, x: M.ax, z: M.az });
      continue;
    }
    let tg = null, d = k.aggroMeters;
    for (const p of up) { const at = fighterAt(p), e = dist(at.x, at.z, M.x, M.z); if (e < d) { d = e; tg = p; } }
    M.tg = tg ? tg.id : -1;
    if (!tg) {                 // nobody near: they mill round the tear
      const a = h01(`${s.seed}/w/${R.id}/${M.i}/${Math.floor(t / 12)}`) * 6.283, x = M.x + Math.cos(a) * m.speed * 0.3 * dt, z = M.z + Math.sin(a) * m.speed * 0.3 * dt;
      if (leash(x, z)) { M.x = Math.round(x * 100) / 100; M.z = Math.round(z * 100) / 100; }
      continue;
    }
    const at = fighterAt(tg);
    if (d <= m.reach) { M.st = 'wind'; M.t = t + c.clock.seconds(m.wind); M.ax = r1(at.x); M.az = r1(at.z); say(c, 'fight.wind', { rift: R.id, m: M.i, x: M.ax, z: M.az, who: tg.id }); continue; }
    const step = m.speed * dt, x = M.x + (at.x - M.x) / d * step, z = M.z + (at.z - M.z) / d * step;
    if (leash(x, z)) { M.x = Math.round(x * 100) / 100; M.z = Math.round(z * 100) / 100; }
  }
}
/** The crew the sim is running, and everyone in a player's party: what a sensible person with those three buttons would do. */
function stepCrew(c, R) {
  const s = c.s, k = K(c), t = s.t;
  for (const id of [...R.crew]) {
    const p = s.people[id], F = p.fg;
    if (!F || F.down) continue;
    if (p.hold && p.hold.kind === 'you') continue;      // a player's own hands
    if (!p.hold && p.act?.a !== 'fight_work') continue;
    const at = fighterAt(p);
    if (R.st === 'seal') {
      if (!p.hold) {
        if (dist(at.x, at.z, R.x, R.z) > k.sealMeters - 0.5) go(c, p, R.x + 1, R.z + 1);
        else if (t >= F.a) { F.a = t + c.clock.seconds(k.sealSeconds); sealStep(c, R, p, 0.7); if (!s.rifts.list.includes(R)) return; }
      }
      continue;
    }
    if (!R.M.length) continue;
    let best = null, d = Infinity, threat = null;
    for (const M of R.M) { const e = dist(at.x, at.z, M.x, M.z); if (e < d) { d = e; best = M; } if (M.st === 'wind' && M.tg === p.id && M.t - t <= 1) threat = M; }
    if (threat && t >= F.d && h01(`${s.seed}/dg/${R.id}/${p.id}/${t}`) < k.simDodge) dodge(c, p);
    const S = skillOf(c, p), inBurst = R.M.filter(M => dist(at.x, at.z, M.x, M.z) <= S.radius).length;
    if (t >= F.s && inBurst >= 2) { burst(c, R, p, at); if (!R.M.length) break; continue; }
    if (d <= k.basicReach) { if (t >= F.a) hit(c, R, p, at); continue; }
    if (!p.hold) go(c, p, best.x, best.z);
  }
}
function go(c, p, x, z) {
  const t = c.s.t, k = K(c), w = p.wpos ?? (p.wpos = [x, z]), step = k.walkPace * 0.5;
  if (p.task && t >= p.task.en) { p.wpos = [p.task.x1, p.task.z1]; p.task = null; }
  if (p.task) return;
  const q = p.wpos, d = Math.hypot(x - q[0], z - q[1]) || 1, m = Math.min(d, step);
  p.task = { k: 'go', x0: q[0], z0: q[1], x1: r1(q[0] + (x - q[0]) / d * m), z1: r1(q[1] + (z - q[1]) / d * m), st: t, en: t + 2, ref: null, lv: 0 };
  void w;
}
function stepHeldJoin(c, R) {
  const s = c.s, k = K(c);
  for (const id of s.held) {
    const p = s.people[id], H = p.hold;
    if (!p.fg && H.car < 0 && dist(H.x, H.z, R.x, R.z) <= k.joinMeters) join(c, R, p, H.kind !== 'you');
    if (p.fg?.r === R.id && p.fg.ai !== (H.kind === 'you' ? 0 : 1)) p.fg.ai = H.kind === 'you' ? 0 : 1;     // a swap mid-fight: the hands change, nothing else does
    if (p.fg?.r === R.id && dist(H.x, H.z, R.x, R.z) > k.joinMeters * 3) { R.crew = R.crew.filter(q => q !== p.id); delete p.fg; say(c, 'fight.over', { rift: R.id, who: p.id, owner: H.owner, left: 1 }); }
  }
}

function stepFight(c, R) {
  const s = c.s, k = K(c), t = s.t;
  if (R.st === 'signs') {
    if (t % c.clock.tps === 0) { if (!R.called && t >= R.at - c.clock.seconds(k.turnoutSeconds * 5)) callCrew(c, R); if (R.called && !R.left && t >= R.called + c.clock.seconds(k.turnoutSeconds)) crewLeaves(c, R); }
    if (t >= R.at) openRift(c, R);
    return;
  }
  stepHeldJoin(c, R);
  if (R.st === 'open') {
    if (!R.M.length) {
      if (!R.gap) R.gap = t + c.clock.seconds(k.waveGapSeconds);
      if (t >= R.gap) { R.gap = 0; R.wave++; if (R.wave < c.d.monsters.sizes[R.size].waves.length) spawnWave(c, R); else { R.st = 'seal'; log(c, 'rift.clear', { rift: R.id, place: R.place, kills: R.kills, hh: [] }); } }
    }
    if (R.crew.length) stepMonsters(c, R);
  }
  stepCrew(c, R);
  if (!s.rifts.list.includes(R)) return;
  if (t % c.clock.tps) return;
  c.riftRev++;
  // nobody left standing: the crew are taken off and the next one comes; after a few, the county sends its own people
  const up = R.crew.filter(id => s.people[id].fg && !s.people[id].fg.down);
  if (R.crew.length && !up.length && R.st !== 'signs') { crewOff(c, R); R.runs++; R.called = 0; if (R.runs >= k.maxCrewRuns) closeRift(c, R, 'county'); return; }
  if ((t - R.opened) / c.clock.tps > k.lostSeconds && !up.length) { closeRift(c, R, 'county'); return; }
  if (!R.called) callCrew(c, R);
  if (R.called && !R.left && t >= R.called + c.clock.seconds(k.turnoutSeconds)) crewLeaves(c, R);
}

// ---- the call

const onDuty = (c, pl) => c.s.people.filter(p => p.work === pl.id && p.job === 'rift_warden' && !p.fg && !p.beat && !p.call);
function callCrew(c, R) {
  const s = c.s, here = c.places[R.place], want = c.d.monsters.sizes[R.size].crew;
  const list = lodges(c).filter(pl => !c.burning.has(pl.building)).sort((a, b) => c.roads.distance(a.node, here.node) - c.roads.distance(b.node, here.node) || a.id - b.id);
  let pick = null, crew = [];
  for (const pl of list) {
    crew = onDuty(c, pl).filter(p => (p.at === pl.id && p.act?.a === 'work') || (p.hold && onShiftNow(c, p))).sort((a, b) => !!b.hold - !!a.hold).map(p => p.id);
    if (crew.length) { pick = pl; break; }
  }
  if (!pick && list.length) {       // nobody on shift: the nearest lodge pages its people, and they come in
    pick = list[0];
    crew = onDuty(c, pick).filter(p => !p.hold && p.at >= 0).sort((a, b) => c.roads.distance(c.places[a.at].node, pick.node) - c.roads.distance(c.places[b.at].node, pick.node) || a.id - b.id).slice(0, want).map(p => p.id);
    for (const id of crew) { const p = s.people[id]; p.orders = [{ kind: 'go', place: pick.id }]; if (!p.trip) p.wake = s.t; }
  }
  if (!pick || !crew.length) return;
  R.called = s.t; R.lodge = pick.id; R.left = 0; R.team = crew.slice(0, want);
  // short-handed: whoever else the lodge has comes straight there
  for (const p of onDuty(c, pick)) { if (R.team.length >= want) break; if (p.hold || p.at < 0 || R.team.includes(p.id)) continue; R.team.push(p.id); p.ans = { r: R.id, from: s.t }; p.orders = [{ kind: 'go', place: R.place }]; p.wake = s.t; }
  for (const id of R.team) s.people[id].ans ??= { r: R.id, from: s.t };
  log(c, 'rift.call', { rift: R.id, place: R.place, lodge: pick.id, crew: [...R.team], hh: [...new Set(R.team.map(id => s.people[id].household))] });
  say(c, 'radio.rift', { rift: R.id });
}
function crewLeaves(c, R) {
  const s = c.s, list = (R.team ?? []).map(id => s.people[id]).filter(p => p.ans?.r === R.id && !p.hold), ready = list.filter(p => p.at === R.lodge && !p.orders.some(o => o.place === R.place));
  if (!ready.length) { if (s.t >= R.called + c.clock.seconds(90)) { for (const p of list) delete p.ans; R.called = 0; } return; }
  R.left = s.t;
  const car = freeVan(c, R.lodge), d = ready[0], from = R.lodge;
  for (const p of ready) { p.goal = null; p.orders = []; if (p.act) c.finishAct(c, p); }
  d.at = -1; d.since = s.t; if (car) car.at = -1;
  startDrive(c, d, c.places[from], c.places[R.place], from, R.place, car ? car.id : -1);
  const tr = s.trips[s.trips.length - 1]; tr.siren = 1; if (!car) tr.model = 'trail_jeep'; d.wake = c.never;
  R.car = car ? car.id : -1;
  tr.riders = ready.slice(1).map(p => p.id);
  for (const p of ready.slice(1)) { p.at = -1; p.since = s.t; p.trip = { mode: 'ride', id: tr.id, to: R.place }; p.wake = c.never; }
  log(c, 'hunters.out', { rift: R.id, place: R.place, crew: ready.map(p => p.id), hh: [] });
}
/** A hunter has woken: at the rift, or on their way. True if this took care of them. */
export function riftWake(c, p) {
  const s = c.s;
  if (p.act?.a === 'fight_work') { p.act.until = s.t + c.clock.ticks(720); p.wake = p.act.until; return true; }
  if (!p.ans) return false;
  const R = riftOf(c, p.ans.r);
  if (!R) { delete p.ans; return false; }
  if (p.trip) return false;
  if (p.at === R.place) {
    if (p.act) c.finishAct(c, p);
    const a = h01(`${s.seed}/st/${R.id}/${p.id}`) * 6.283;
    p.wpos = [r1(R.x + Math.cos(a) * 14), r1(R.z + Math.sin(a) * 14)]; p.task = null;
    join(c, R, p, true);
    c.startAct(c, p, c.actionById.fight_work, p.at, s.t + c.clock.ticks(720));
    p.wake = p.act.until;
    return true;
  }
  if (p.at === R.lodge && !R.left) { if (p.act) c.finishAct(c, p); c.startAct(c, p, c.actionById.idle, p.at, s.t + c.clock.ticks(4)); return true; }
  return false;
}

// ---- over

function clearFighter(c, p, R, paid) {
  const s = c.s, F = p.fg; if (!F) return;
  const was = F.down, job = c.jobById[p.job], q = p.ans;
  delete p.fg; delete p.ans;
  if (!p.hold && q) { const ticks = s.t - q.from; if (job?.beat === 'rift' && paid) payShift(c, p, job, ticks); }
  p.task = null;
  if (p.hold) { say(c, 'fight.over', { rift: R.id, who: p.id, owner: p.hold.owner, down: was }); return; }
  if (p.act?.a === 'fight_work') { c.finishAct(c, p); p.wpos = null; p.wake = s.t; }
  if (was && !p.trip && p.at >= 0) toClinic(c, p);
}
function crewOff(c, R) {
  const s = c.s;
  for (const id of [...R.crew]) clearFighter(c, s.people[id], R, true);
  R.crew = [];
}
function closeRift(c, R, how, by = -1) {
  const s = c.s, S = s.rifts, k = K(c), people = R.crew.map(id => s.people[id]), hunters = people.filter(p => p.fg);
  const out = { rift: R.id, place: R.place, how, by, size: R.size, kills: R.kills, hurt: R.hurt, hands: R.hands, seconds: Math.round((s.t - (R.first ?? R.opened ?? s.t)) / c.clock.tps), crew: [...R.crew], hh: [...new Set(people.map(p => p.household))] };
  // finds: every kill may drop something. Shared out, and the odd one is a curiosity the household keeps talking about
  const n = R.finds.length, each = hunters.length ? Math.round(n * k.findCoins / hunters.length) : 0;
  for (const p of hunters) { if (each > 0) earn(c, s.households[p.household], each, 'finds'); nudge(c, p, by >= 0 ? by : p.id, 'respect', p.id === by ? 0 : 4); addMoodlet(c, p, 'held_the_line', 0.12, 16); }
  if (n && how === 'sealed' && h01(`${s.seed}/rare/${R.id}`) < k.rareFind + (R.size === 'big' ? 0.4 : 0)) { const f = c.d.monsters.finds, who = hunters[Math.floor(h01(`${s.seed}/rw/${R.id}`) * hunters.length)]; if (who) { log(c, 'hunter.find', { who: who.id, find: Math.floor(h01(`${s.seed}/rf/${R.id}`) * f.length), place: R.place, hh: [who.household] }); S.stats.finds++; } }
  crewHome(c, R, hunters);
  S.list = S.list.filter(q => q !== R);
  S.stats.closed++; if (how === 'county') S.stats.county++;
  refreshRifts(c);
  log(c, 'rift.closed', { ...out, each });
  void by;
}
function crewHome(c, R, hunters) {
  const s = c.s, here = R.place, sim = hunters.filter(p => !p.hold && !p.fg.down && p.act?.a === 'fight_work');
  for (const p of hunters) clearFighter(c, p, R, true);
  const live = sim.filter(p => p.at === here && !p.act), car = R.car >= 0 ? s.cars[R.car] : null;
  if (car && car.at === here && live.length) {
    const d = live[0], home = R.lodge ?? d.work;
    d.at = -1; d.since = s.t; car.at = -1;
    startDrive(c, d, c.places[here], c.places[home], here, home, car.id);
    const tr = s.trips[s.trips.length - 1]; d.wake = c.never; tr.riders = live.slice(1).map(p => p.id);
    for (const p of live.slice(1)) { p.at = -1; p.since = s.t; p.trip = { mode: 'ride', id: tr.id, to: home }; p.wake = c.never; }
  } else if (car && car.at === here) car.at = car.base;
}

// ---- a player's hands

export function fightCommand(c, cmd, refuse) {
  const s = c.s, p = s.people[cmd.who], owner = cmd.owner ?? 'solo', k = K(c);
  if (!p?.hold || p.hold.owner !== owner) return refuse('not yours');
  const answer = (ok, extra = null) => say(c, 'fight.answer', { who: p.id, owner, verb: cmd.verb, ok, ...extra });
  if (p.hold.kind !== 'you') return refuse('not yours');      // your party fights by itself: swap to steer them
  if (!p.fg) return answer(false);
  const R = riftOf(c, p.fg.r); if (!R) return answer(false);
  const at = { x: p.hold.x, z: p.hold.z };
  switch (cmd.verb) {
    case 'hit': return answer(hit(c, R, p, at));
    case 'skill': return answer(burst(c, R, p, at));
    case 'dodge': return answer(dodge(c, p));
    case 'seal': {
      if (R.st !== 'seal' || dist(at.x, at.z, R.x, R.z) > k.sealMeters || s.t < p.fg.a) return answer(false);
      p.fg.a = s.t + c.clock.seconds(k.sealSeconds * 0.5);
      sealStep(c, R, p, Math.max(0, Math.min(1, Number(cmd.q) || 0)));
      return answer(true);
    }
    default: return refuse('no such verb');
  }
}

/** A warden being played: a rift open and you are not there. */
export const wardenCalls = c => c.s.rifts.list.filter(R => R.st !== 'signs').length;
/** Seconds worked in a fight: while you are in it and on your feet, or on the way when one is on. */
export function lawRiftCredit(c, p, d) {
  if (p.job !== 'rift_warden') return;        // a call credits itself, step by step
  const H = p.hold, moved = H.lx !== undefined && dist(H.lx, H.lz, H.x, H.z) > 1; H.lx = H.x; H.lz = H.z;
  if (p.fg ? !p.fg.down : moved) d.credit += 1;
}

/** Taken over mid-fight: the same body with the same bruises, from where they stood. */
export function fightTaken(c, p) { if (p.fg) p.fg.ai = 0; if (p.ans) p.ansT = c.s.t; }
/** Handed back on the scene: the crew carries on; anyone not on the crew goes back to their day, and a bruise goes with them. */
export function backToFight(c, p, h) {
  const F = p.fg; if (!F) return false;
  const R = riftOf(c, F.r);
  if (!R || F.down || p.job !== 'rift_warden') { if (R) R.crew = R.crew.filter(id => id !== p.id); if (F.down) p.hurt = Math.max(p.hurt || 0, K(c).hurtTo); delete p.fg; delete p.ans; return false; }
  const near = nearestPlace(c, h.x, h.z).place;
  p.trip = null; p.at = near.id; p.since = c.s.t; p.wpos = [h.x, h.z]; p.task = null;
  p.ans ||= { r: R.id, from: c.s.t };
  F.ai = 1;
  c.startAct(c, p, c.actionById.fight_work, p.at, c.s.t + c.clock.ticks(720));
  p.wake = p.act.until;
  return true;
}

export function stepRifts(c) {
  const s = c.s, S = s.rifts;
  if (s.t % c.clock.ticks(60) === 0) rollRift(c);
  for (const R of [...S.list]) if (S.list.includes(R)) stepFight(c, R);
}

// ---- what the page gets, and what the audit asks

export function riftsView(c) {
  const s = c.s;
  return s.rifts.list.map(R => ({ id: R.id, x: R.x, z: R.z, st: R.st, size: R.size, at: R.at, place: R.place, seal: R.seal, wave: R.wave, waves: c.d.monsters.sizes[R.size].waves.length, crew: R.crew, kills: R.kills, called: R.called ? 1 : 0, M: R.M.map(M => [M.i, M.k, M.x, M.z, Math.round(M.hp / M.max * 100), M.st === 'wind' ? 1 : M.st === 'rest' ? 2 : 0, M.st === 'wind' ? M.ax : 0, M.st === 'wind' ? M.az : 0, M.tg]) }));
}
export const fighting = c => c.s.rifts.list.some(R => R.st !== 'signs' && R.crew.length);
export function riftProblems(c, fail) {
  const s = c.s;
  for (const R of s.rifts.list) for (const id of R.crew) if (s.people[id].fg?.r !== R.id) fail(`rift ${R.id} lists ${id}, who is not in it`);
  for (const p of s.people) {
    if (p.fg && !riftOf(c, p.fg.r)) fail(`person ${p.id} is fighting at a rift that has gone`);
    if (p.act?.a === 'fight_work' && !p.fg && !p.hold) fail(`person ${p.id} is fighting nothing`);
  }
}
void positionOf;
