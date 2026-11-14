// Jobs (missions) from a station's board (Voidwright PLAN §E1 E8 carried over to 3D).
//
//   recovery  harpoon a marked rock / lost hull / disabled freighter and tow it into the station's safe zone
//   delivery  carry sealed freight (it takes hold room) to another system's station, sometimes against a clock
//   clear     destroy every ship at a marked pirate camp (a Hive nest in danger 3+)
//   escort    a slow freighter flies from near the station to a beacon; raiders come in three waves; keep it alive
//   survey    scan N asteroids here (sometimes of one ore), or fly into an anomaly (rift, ion cloud, comet, derelict)
//   acquire   bring N of an ore, or a part of a kind and rarity, to the board
//
// A board offers 3-5 jobs (the owner's standing) from its seed and the play clock (MISSION_WINDOW), so it changes about
// every ten minutes of play and is the same for the same save. Up to MAX_ACTIVE jobs at once. Rewards: credits
// (by danger and standing) + standing with the board's owner + sometimes a part. In-space jobs pay the moment they
// finish; deliveries and acquisitions are handed over at the board. Pure: no DOM.
//
// Save: G.missions = { active: [job], taken: [ids], done: n }; G.freight = { jobId: crates }.

import { rng, hash, vadd, vsub, vscale, vnorm, vdist, vrand, qaxis } from '../core/math.js';
import { ORES, RARITY, PARTS, TURRETS } from '../data/blocks.js';
import { FACTIONS, stationOwner, repLevel, payMul, addRep } from './factions.js';
import { rollLootItem, itemName } from './items.js';
import { createBody, refresh } from './body.js';
import { generateShip, generateRock } from './shipgen.js';
import { addBody, DT, SAFE_RADIUS } from './world.js';
import { pilot } from './npc.js';
import { rockOre } from './scan.js';
import { tractorIn } from './harpoon.js';
import { ANOMALIES } from './encounters.js';
import { fmt } from '../../../../shared/format.js';

export const MISSION_WINDOW = 600;   // s of play: a board's jobs change this often
export const MAX_ACTIVE = 3;
export const KINDS = {
  recovery: { name: 'Recovery', color: '#ffd27a' },
  delivery: { name: 'Delivery', color: '#5fd8ff' },
  clear: { name: 'Clear a site', color: '#ff5a6a' },
  escort: { name: 'Escort', color: '#7affd8' },
  survey: { name: 'Survey', color: '#b48aff' },
  acquire: { name: 'Acquisition', color: '#ffb35a' },
};
const PAY = d => 1 + (d - 1) * 0.75;
const r10 = v => Math.round(v / 10) * 10;
const ORE_BY_DANGER = [['iron'], ['iron', 'copper'], ['copper', 'cobalt'], ['cobalt', 'iridium'], ['iridium', 'sunstone'], ['sunstone', 'iridium']];
const PART_ASKS = ['shield', 'reactor', 'thruster', 'gyro', 'targeting', 'autocannon', 'gatling', 'laser', 'flak', 'mining'];

export const missionState = G => (G.missions ||= { active: [], taken: [], done: 0 });
export const boardOf = sys => ({ id: `S${sys.id}`, seed: hash(sys.seed, 'board'), system: sys.id, name: `${sys.name} Station`, faction: stationOwner(sys), danger: sys.danger });
/** When the board changes next, in seconds of play. */
export const boardRefresh = t => MISSION_WINDOW - (t % MISSION_WINDOW);

/** A point in the system d0..d1 metres from the station (at the origin), off the plane a little. */
function spot(r, d0, d1) { const a = r() * Math.PI * 2, d = r.range(d0, d1); return { x: Math.round(Math.cos(a) * d), y: Math.round(r.range(-200, 200)), z: Math.round(Math.sin(a) * d) }; }
/** Systems one or two jumps away (for deliveries). */
function nearby(gal, sys) {
  const one = sys.links.map(l => gal.systems[l]);
  const two = one.flatMap(s => s.links.map(l => gal.systems[l])).filter(s => s.id !== sys.id && !one.includes(s));
  return { one, two: [...new Set(two)] };
}

const MAKE = {
  recovery(r, board, sys) {
    const what = r.pick(['rock', 'rock', 'wreck', 'ship']);
    const at = spot(r, 2000, 3400);
    const ore = r.pick(ORE_BY_DANGER[sys.danger - 1]);
    const oreWord = ORES[ore].name.replace(' ore', ''); const title = what === 'rock' ? `Tow in ${/^[AEIOU]/.test(oreWord) ? 'an' : 'a'} ${oreWord} asteroid` : what === 'wreck' ? 'Recover a lost hull' : 'Tow in a disabled freighter';
    return { title, text: `Harpoon it (G) and tow it into ${board.name}'s safe zone.`, target: { what, ore, pos: at, seed: Math.floor(r() * 1e9) }, need: 1, base: 360 + Math.hypot(at.x, at.z) / 9 };
  },
  delivery(r, board, sys, gal) {
    const { one, two } = nearby(gal, sys);
    const far = two.length && r() < 0.35; const to = far ? r.pick(two) : r.pick(one);
    if (!to) return null;
    const n = 6 + Math.floor(r() * 10); const timed = r() < 0.35;
    return { title: `Deliver ${n} crates to ${to.name}`, text: `Sealed freight for ${to.name} Station (${far ? 'two jumps' : 'one jump'}). It takes ${n} hold room until you hand it over.${timed ? ' On a clock.' : ''}`,
      freight: n, to: { system: to.id, id: `S${to.id}`, name: `${to.name} Station`, danger: to.danger }, limit: timed ? (far ? 900 : 600) : 0, need: n, base: (far ? 520 : 300) * (timed ? 1.4 : 1) + n * 12 + to.danger * 40 };
  },
  clear(r, board, sys) {
    const hive = sys.danger >= 3 && r() < 0.35;
    const at = spot(r, 2600, 4200);
    const n = 2 + Math.min(3, Math.floor(sys.danger / 2) + (r() < 0.5 ? 1 : 0));
    return { title: hive ? 'Burn out a Hive nest' : 'Clear out a pirate camp', text: `${n} ${hive ? 'Hive ships' : 'pirate ships'} at the marked spot. Destroy every one.`, site: { pos: at, seed: Math.floor(r() * 1e9), faction: hive ? 'swarm' : 'pirate', n }, need: n, base: 300 + n * 140 };
  },
  escort(r, board, sys) {
    const from = spot(r, 950, 1100); const dir = vnorm(from);
    const to = vadd(from, vscale(vnorm(vadd(dir, vscale(vrand(r), 0.6))), 2600 + r() * 900)); to.y = Math.round(to.y * 0.3);
    return { title: 'Escort a freighter', text: 'A slow freighter is leaving for a relay beacon. Keep it alive: raiders will come in three waves.', from, to: { x: Math.round(to.x), y: Math.round(to.y), z: Math.round(to.z) }, seed: Math.floor(r() * 1e9), need: 1, base: 700 };
  },
  survey(r, board, sys) {
    if (r() < 0.3) return { title: 'Survey an anomaly', text: 'Fly into a space rift, an ion cloud, a comet\'s path or a derelict station — in any system. They show on your radar.', survey: { what: 'anomaly' }, system: -1, need: 1, base: 420 };
    const typed = r() < 0.5; const ore = typed ? r.pick(ORE_BY_DANGER[sys.danger - 1]) : null;
    const n = typed ? 2 + Math.floor(r() * 2) : 5 + Math.floor(r() * 4);
    return { title: typed ? `Find ${n} ${ORES[ore].name.replace(' ore', '')} asteroids` : `Scan ${n} asteroids`, text: `Scan pulse (V) asteroids in ${sys.name}${typed ? ` until you find ${n} that hold ${ORES[ore].name}` : ''}.`, survey: { what: 'rock', ore }, need: n, base: typed ? 90 * n : 45 * n };
  },
  acquire(r, board, sys) {
    if (r() < 0.6) {
      const ore = r.pick(ORE_BY_DANGER[sys.danger - 1]); const n = 12 + Math.floor(r() * 18);
      return { title: `Bring ${n} ${ORES[ore].name}`, text: `${board.name} wants ${n} ${ORES[ore].name} from your hold.`, want: { ore }, need: n, value: ORES[ore].price * n * 1.5, base: 120 };
    }
    const kind = r.pick(PART_ASKS); const rarity = sys.danger >= 4 ? 2 : 1;
    const name = (PARTS[kind] || TURRETS[kind]).name;
    const art = /^[aeiou]/i.test(RARITY[rarity].name) ? 'an' : 'a';
    return { title: `Find ${art} ${RARITY[rarity].name.toLowerCase()} ${name}`, text: `${board.name} wants a ${name} of ${RARITY[rarity].name.toLowerCase()} or better from your spare parts (any Mk). Loot it or buy it.`, want: { kind, rarity }, need: 1, base: 500 + rarity * 250 };
  },
};

/** The jobs a board offers right now (minus ones you already took). Hated: none. */
export function boardOffers(G, gal, board, t = G.playTime || 0) {
  const L = repLevel(G, board.faction); if (!L.jobs) return [];
  const win = Math.floor(t / MISSION_WINDOW);
  const r = rng(hash('board', board.seed, win));
  const sys = gal.systems[board.system]; const M = missionState(G);
  const kinds = Object.keys(KINDS);
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  const out = [];
  kinds.slice(0, L.jobs).forEach((kind, i) => {
    const id = `${board.id}:${win}:${i}`;
    const m = MAKE[kind](rng(hash(id)), board, sys, gal); if (!m) return;
    Object.assign(m, { id, kind, board: { id: board.id, system: board.system, name: board.name, faction: board.faction }, system: m.system ?? board.system, danger: sys.danger, got: 0 });
    const k = PAY(sys.danger) * payMul(G, board.faction);
    m.reward = { cr: r10(m.base * k + (m.value || 0)), rep: 3 + Math.floor(rng(hash(id, 'rep'))() * 4), part: rng(hash(id, 'part'))() < (kind === 'clear' || kind === 'escort' ? 0.5 : 0.3) };
    if (!M.taken.includes(id)) out.push(m);
  });
  return out;
}

/** Take a job. Returns null when it worked, or the reason it did not. `room` = free hold room (for freight). */
export function acceptMission(G, m, room = Infinity, t = G.playTime || 0) {
  const M = missionState(G);
  if (M.active.length >= MAX_ACTIVE) return `You already have ${MAX_ACTIVE} jobs. Finish or drop one first.`;
  if (M.taken.includes(m.id)) return 'You already took this job.';
  if (m.freight && room < m.freight) return `The freight needs ${m.freight} hold room; you have ${Math.max(0, Math.floor(room))} free.`;
  M.taken.push(m.id); if (M.taken.length > 80) M.taken.splice(0, M.taken.length - 80);
  const copy = JSON.parse(JSON.stringify(m)); copy.accepted = t; if (copy.limit) copy.expires = t + copy.limit;
  M.active.push(copy);
  if (copy.freight) (G.freight ||= {})[copy.id] = copy.freight;
  return null;
}
export function abandonMission(G, m) {
  const M = missionState(G); M.active = M.active.filter(x => x.id !== m.id);
  if (G.freight) delete G.freight[m.id];
}

/** "3 / 5" progress for any job. */
export function progressOf(G, m) {
  if (m.kind === 'delivery') return { have: G.freight?.[m.id] ? m.need : 0, need: m.need };
  if (m.kind === 'acquire' && m.want.ore) return { have: Math.min(m.need, G.cargo[m.want.ore] || 0), need: m.need };
  if (m.kind === 'acquire') return { have: partFor(G, m) ? 1 : 0, need: 1 };
  return { have: Math.min(m.need, m.got || 0), need: m.need };
}
/** The least valuable spare part that answers an acquisition job (so your best ones are kept). */
export function partFor(G, m, loose = null) {
  const inst = new Set((G.design || []).map(r => r[6]).filter(Boolean));
  const ok = (loose || G.items.filter(i => !inst.has(i.uid))).filter(i => i.kind === m.want.kind && i.rarity >= m.want.rarity);
  return ok.sort((a, b) => a.rarity - b.rarity || a.tier - b.tier)[0] || null;
}
/** Can this job be handed over at this board? null if so, or what is missing. */
export function handInBlock(G, m, boardId) {
  if (m.kind === 'delivery') return m.to.id === boardId ? null : `Hand over at ${m.to.name}.`;
  if (m.kind === 'acquire') {
    if (m.board.id !== boardId) return `Hand over at ${m.board.name}.`;
    const p = progressOf(G, m); return p.have >= p.need ? null : m.want.ore ? `You carry ${p.have} of ${p.need}.` : 'None in your spare parts yet.';
  }
  return 'Finished out in space.';
}
/** Hand over a delivery / acquisition (check handInBlock first). Returns the reward text. */
export function handIn(G, m) {
  if (m.kind === 'delivery') delete G.freight[m.id];
  else if (m.want.ore) { G.cargo[m.want.ore] -= m.need; if (G.cargo[m.want.ore] <= 0) delete G.cargo[m.want.ore]; }
  else { const p = partFor(G, m); G.items = G.items.filter(i => i !== p); }
  return finish(G, m);
}
/** Pay a finished job and close it. Returns { text, part, rep }. */
export function finish(G, m) {
  const M = missionState(G);
  M.active = M.active.filter(x => x.id !== m.id); M.done = (M.done || 0) + 1; G.stats.missions = (G.stats.missions || 0) + 1;
  G.credits += m.reward.cr; G.stats.earned += m.reward.cr;
  const rep = addRep(G, m.board.faction, m.reward.rep);
  if (m.kind === 'clear') rep.push(...addRep(G, m.site.faction, -3));
  let part = null;
  if (m.reward.part) { part = rollLootItem(hash(m.id, 'part'), m.danger, 0.4); G.items.push(part); }
  const bits = [`+${fmt(m.reward.cr, { decimals: 0 })} cr`, ...rep.map(c => `${FACTIONS[c.faction].short} ${c.d > 0 ? '+' : ''}${fmt(c.d, { decimals: 1 })}`)];
  if (part) bits.push(`${RARITY[part.rarity].name} ${itemName(part)}`);
  return { text: bits.join(' · '), part, rep };
}
/** Timed deliveries that ran out: removed (freight handed back to its owners) and returned. */
export function expireMissions(G, t = G.playTime || 0) {
  const M = missionState(G); const gone = M.active.filter(m => m.expires && t > m.expires);
  for (const m of gone) abandonMission(G, m);
  return gone;
}

/**
 * Where a job wants you to go in this system right now, or null: { pos, label, stage, body? }. A tow job points at
 * the target until it is on your harpoon, then at the station; an escort at the freighter; a hand-over at the board's
 * station; a delivery's destination only in its own system.
 */
export function missionTarget(m, w, sysId) {
  const live = w?.missionLive?.[m.id];
  const st = w?.station;
  if (m.kind === 'delivery') return m.to.system === sysId && st ? { pos: st.pos, label: `Deliver: ${m.to.name}`, stage: 'deliver', body: st } : null;
  if (m.kind === 'acquire') return m.board.system === sysId && st ? { pos: st.pos, label: `Hand over: ${m.board.name}`, stage: 'deliver', body: st } : null;
  if (m.kind === 'survey' && m.survey.what === 'anomaly') {
    const P = w?.player; if (!P) return null;
    const list = (w.enc || []).filter(e => ANOMALIES.includes(e.kind) && e.state !== 'done');
    if (!list.length) return null;
    const e = list.sort((a, b) => vdist(a.pos, P.pos) - vdist(b.pos, P.pos))[0];
    return { pos: e.pos, label: 'Anomaly to survey', stage: 'go' };
  }
  if (m.system !== sysId) return null;
  if (m.kind === 'recovery') {
    const b = live?.body && !live.body.dead ? live.body : null;
    if (b && b.harpooned && st) return { pos: st.pos, label: `Tow it to ${m.board.name}`, stage: 'tow', body: st };
    return { pos: b ? b.pos : m.target.pos, label: 'Tow target', stage: 'find', body: b };
  }
  if (m.kind === 'clear') return { pos: m.site.pos, label: m.site.faction === 'swarm' ? 'Hive nest' : 'Pirate camp', stage: 'go' };
  if (m.kind === 'escort') {
    const f = live?.ship;
    if (f && !f.dead) return { pos: f.pos, label: live.started ? 'Freighter (escort)' : 'Freighter: come alongside', stage: 'escort', body: f };
    return { pos: m.from, label: 'Meet the freighter', stage: 'meet' };
  }
  return null;
}
/** Every active job with a place in this system: [{ m, pos, label, stage, color, body? }]. */
export function missionMarks(G, w, sysId) {
  const out = [];
  for (const m of missionState(G).active) { const tg = missionTarget(m, w, sysId); if (tg) out.push({ m, ...tg, color: KINDS[m.kind].color }); }
  return out;
}

// ------------------------------------------------------------------ the in-space part (every sim step)
/**
 * Spawns what this system's jobs need (tow targets, camps, the freighter), counts progress and finishes jobs.
 * ctx = { G, say }. Returns the jobs finished this step.
 */
export function missionStep(w, ctx) {
  const G = ctx.G; const M = missionState(G); const P = w.player; if (!P || P.dead || !w.sys) return [];
  const sysId = w.sys.id; const L0 = (w.missionLive ||= {}); const out = [];
  for (const m of [...M.active]) {
    const here = m.system === sysId; const L = (L0[m.id] ||= { cd: 0, since: w.t });   // scans before this count for nothing
    if (m.kind === 'recovery' && here) {
      if (!L.body || (L.body.dead && !L.delivered && (L.cd -= DT) <= 0)) { L.body = spawnTowTarget(w, m); L.cd = 15; L.told = false; }
      else if (L.body.dead && !L.delivered && !L.told) { L.told = true; ctx.say({ t: 'toast', text: 'The tow target broke up. Another one will be marked shortly.', kind: 'bad' }); }
      if (!L.body.dead && !L.delivered && w.station && vdist(L.body.pos, w.station.pos) < SAFE_RADIUS) {
        L.delivered = true; m.got = 1; tractorIn(w, L.body, w.station.pos); out.push(m);
      }
    } else if (m.kind === 'clear' && here) {
      if (!L.ships) L.ships = spawnCamp(w, m);
      const left = L.ships.filter(s => !s.dead).length; m.got = m.need - left;
      if (!left) out.push(m);
    } else if (m.kind === 'escort' && here) {
      if (!L.ship && vdist(P.pos, m.from) < 1800) {
        L.ship = spawnFreighter(w, m); L.waves = 0; L.start = vdist(m.from, m.to);
        ctx.say({ t: 'toast', text: 'The freighter is waiting for you. Come alongside and it sets off.', kind: 'good' });
      }
      const s = L.ship;
      if (s) {
        if (s.dead) { abandonMission(G, m); ctx.say({ t: 'banner', title: 'Escort failed', text: 'The freighter was destroyed.' }); ctx.say({ t: 'sound', id: 'warn' }); continue; }
        if (!L.started && vdist(P.pos, s.pos) < 350 + s.radius) { L.started = true; s.ai = { route: [m.to], speed: 0.2, stopAt: 0, reach: 150 }; ctx.say({ t: 'toast', text: 'The freighter is under way. Stay close.', kind: 'good' }); }
        const left = vdist(m.to, s.pos); const prog = 1 - left / Math.max(1, L.start);
        if (L.started && L.waves < 3 && prog > [0.12, 0.45, 0.75][L.waves]) {
          L.waves++; spawnWave(w, m, s, L.waves);
          ctx.say({ t: 'toast', text: `Raiders closing on the freighter (wave ${L.waves} of 3).`, kind: 'bad' }); ctx.say({ t: 'sound', id: 'warn' });
        }
        if (L.started && left < 200) { m.got = 1; s.ai = { hold: true }; out.push(m); }
      }
    } else if (m.kind === 'survey') {
      if (m.survey.what === 'anomaly') {
        for (const e of w.enc || []) if (ANOMALIES.includes(e.kind) && vdist(P.pos, e.pos) < 450) { m.got = 1; break; }
      } else if (here && (L.scanT = (L.scanT || 0) - DT) <= 0) {
        L.scanT = 0.5;
        for (const b of w.bodies) {
          if (b.kind !== 'rock' || b.dead || b.cache || b.derelict || b.scannedAt == null || b.scannedAt < L.since) continue;
          if ((b.surveyed ||= {})[m.id]) continue;
          if (m.survey.ore && rockOre(b).type !== m.survey.ore && !(rockOre(b).cells[m.survey.ore] >= 4)) continue;
          b.surveyed[m.id] = true; m.got = (m.got || 0) + 1;
        }
      }
      if ((m.got || 0) >= m.need) out.push(m);
    }
  }
  for (const m of out) {
    const res = finish(G, m);
    ctx.say({ t: 'banner', title: `Job done: ${m.title}`, text: res.text }); ctx.say({ t: 'sound', id: 'rare' });
  }
  for (const m of expireMissions(G)) ctx.say({ t: 'toast', text: `Too late: ${m.title}. The job was called off.`, kind: 'bad' });
  return out;
}

function spawnTowTarget(w, m) {
  const T = m.target; let b;
  if (T.what === 'rock') {
    b = createBody(generateRock(T.seed, { radius: 3, danger: Math.min(6, m.danger + 1) }), { kind: 'rock', pos: T.pos, name: `${ORES[T.ore].name.replace(' ore', '')} asteroid (job)` });
  } else {
    const { grid } = generateShip(T.seed, { danger: m.danger, faction: T.what === 'ship' ? 'traders' : 'navy', small: true });
    b = createBody(grid, { kind: 'wreck', team: 'neutral', pos: T.pos, name: T.what === 'ship' ? 'Disabled freighter (job)' : 'Lost hull (job)' });
    b.keep = true;
  }
  b.job = m.id; b.angVel = { x: 0.01, y: 0.03, z: 0 };
  return addBody(w, b);
}
function spawnCamp(w, m) {
  const r = rng(m.site.seed); const out = [];
  for (let i = 0; i < m.site.n; i++) {
    const { grid } = generateShip(hash(m.site.seed, i), { danger: m.danger, faction: m.site.faction, small: m.danger <= 1 && i > 0 });
    const b = createBody(grid, { kind: 'ship', team: 'hostile', faction: m.site.faction, danger: m.danger, pos: vadd(m.site.pos, vscale(vrand(r), 50 + i * 30)), name: `${m.site.faction === 'swarm' ? 'Nest' : 'Camp'} guard ${i + 1}` });
    b.post = { ...m.site.pos }; b.mode = 'patrol'; b.job = m.id; b.quat = qaxis({ x: 0, y: 1, z: 0 }, r() * 6);
    out.push(addBody(w, b));
  }
  return out;
}
function spawnFreighter(w, m) {
  const { grid } = generateShip(m.seed, { danger: Math.max(1, m.danger), faction: 'traders' });
  const b = createBody(grid, { kind: 'ship', team: 'neutral', faction: 'traders', danger: m.danger, pos: m.from, name: 'Freighter Saffron Tern' });
  for (const bl of b.grid.cells.values()) { bl.maxHp *= 2.5; bl.hp = bl.maxHp; }      // a freighter is built to take a beating
  refresh(b); b.baseHp = b.stats.maxHp; b.shield = b.stats.shield;
  b.think = pilot; b.ai = { hold: true }; b.job = m.id;
  return addBody(w, b);
}
function spawnWave(w, m, s, wave) {
  const r = rng(hash(m.seed, 'wave', wave));
  const ahead = vnorm(vsub(m.to, s.pos)); const side = vnorm(vrand(r));
  const at = vadd(s.pos, vadd(vscale(ahead, 700), vscale(side, 350)));       // in front, where you can see them coming
  const n = 1 + Math.min(3, Math.floor(m.danger / 2) + (wave >= 2 ? 1 : 0));
  for (let i = 0; i < n; i++) {
    const { grid } = generateShip(hash(m.seed, 'wv', wave, i), { danger: m.danger, faction: 'pirate', small: m.danger <= 1 && i > 0 });
    const b = createBody(grid, { kind: 'ship', team: 'hostile', faction: 'pirate', danger: m.danger, pos: vadd(at, vscale(vrand(r), 40 + i * 25)), name: `Raider ${i + 1}` });
    b.think = pilot; b.ai = { sight: 1400, prefer: s, post: at, leash: 4000 }; b.job = m.id;
    addBody(w, b);
  }
}
export { SAFE_RADIUS };
