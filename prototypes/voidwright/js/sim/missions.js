// Missions (PLAN §E1 E8): jobs from station and friendly-outpost mission boards.
//
// Kinds:
//   recovery  harpoon a marked asteroid / wreck / disabled ship and tow it within reach of the board's station
//   delivery  bring N of a material or trade good to a station (here or a nearby star), sometimes against a clock
//   clear     wipe out a marked site: an enemy camp, an alien nest or a corsair outpost
//   escort    keep a slow freighter alive from the station to a relay beacon while raiders attack
//   survey    scan asteroids of a type (the Scan key marks body.scanned), or fly into anomalies
//   acquire   bring something you must get yourself: N of a rare ore, or a part of a sort and rarity
//
// A board offers jobs from its seed and the play clock (MISSION_WINDOW), so it refreshes about every ten minutes
// of play and is the same for the same save. Taken jobs live in the save: G.missions = { active: [], done, taken }.
// Finishing one: credits + standing (+ sometimes a part), G.missions.done++ and G.stats.missions++ (the "Odd jobs" goal).
// In-space jobs (recovery, clear, escort, survey) pay the moment they finish; delivery and acquire are handed over
// at the board. Pure: no DOM, no clock.

import { rng, hash, TAU } from '../core/math.js';
import { FACTIONS, factionsForTier } from '../data/factions.js';
import { MATERIALS, RARITY_BY_ID, matTier, matOf } from '../data/types.js';
import { BLOCKS } from '../data/blocks.js';
import { GOODS } from './economy.js';
import { makeRock, canWarpTo } from './galaxy.js';
import { generateShip } from './shipgen.js';
import { itemValue } from './loot.js';
import { spawnEncounter, rollPart, anomaliesNear, encState } from './encounters.js';
import { rockOre } from './scan.js';

export const MISSION_WINDOW = 600;   // the board's jobs change every 10 minutes of play
export const MAX_ACTIVE = 3;

export const MISSION_KINDS = {
  recovery: { name: 'Recovery', color: '#ffd27a' },
  delivery: { name: 'Delivery', color: '#5fd8ff' },
  clear: { name: 'Clear a site', color: '#ff5a6a' },
  escort: { name: 'Escort', color: '#7affd8' },
  survey: { name: 'Survey', color: '#b48aff' },
  acquire: { name: 'Acquisition', color: '#ffb35a' },
};
/** Part sorts an acquisition job can ask for: block.cat → plain words. */
export const PART_SORTS = { shield: 'shield part', weapon: 'weapon', engine: 'engine', power: 'reactor', cpu: 'computer core' };

export const missionState = G => (G.missions ||= { active: [], done: 0, taken: [] });

/**
 * The board a docked station shows. st = the station body; returns { id, seed, system, name, tier, faction, x, y, r }.
 * The main station's board is S<system>; a friendly outpost's is its own (encounters.js sets st.outpost.board).
 */
export function boardOf(sys, st) {
  const out = st.outpost;
  return { id: out ? out.board : `S${sys.id}`, seed: out ? hash(sys.seed, 'board', out.key || out.board) : hash(sys.seed, 'board'), system: sys.id, name: st.name, tier: sys.tier, faction: st.faction, x: st.x, y: st.y, r: st.r, outpost: !!out };
}

/** The jobs a board offers right now (minus ones you already took). */
export function boardOffers(G, gal, board, t = G.playTime || 0) {
  const win = Math.floor(t / MISSION_WINDOW);
  const r = rng(hash('board', board.seed, win));
  const sys = gal.systems[board.system];
  const M = missionState(G);
  const kinds = ['recovery', 'delivery', 'clear', 'escort', 'survey', 'acquire'];
  // four jobs, never two of a kind on one board
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  const out = [];
  kinds.slice(0, 4).forEach((kind, i) => {
    const id = `${board.id}:${win}:${i}`;
    const m = MAKE[kind](rng(hash(id)), board, sys, gal, G);
    if (!m) return;
    Object.assign(m, { id, kind, board: { id: board.id, system: board.system, name: board.name, faction: board.faction, x: board.x, y: board.y }, system: m.system ?? board.system, tier: sys.tier, got: 0, posted: t });
    m.reward = reward(m, sys.tier, rng(hash(id, 'pay')));
    if (!M.taken.includes(id)) out.push(m);
  });
  return out;
}
/** When the board changes next, in seconds. */
export const boardRefresh = t => MISSION_WINDOW - (t % MISSION_WINDOW);

/** A point `d0..d1` from the board, kept inside the system. */
function spot(r, board, sys, d0, d1) {
  const R = (sys.traits?.radius || 30000) * 0.85;
  for (let k = 0; k < 8; k++) {
    const a = r() * TAU, d = r.range(d0, d1);
    const x = board.x + Math.cos(a) * d, y = board.y + Math.sin(a) * d;
    if (Math.hypot(x, y) < R && Math.hypot(x, y) > 1500) return { x: Math.round(x), y: Math.round(y) };
  }
  return { x: Math.round(board.x * 0.4), y: Math.round(board.y * 0.4 + 4000) };
}
const matName = id => MATERIALS[id]?.name || GOODS[id]?.name || id;

const MAKE = {
  recovery(r, board, sys) {
    const what = r.pick(['rock', 'rock', 'wreck', 'ship']);
    const t = matTier(sys.tier);
    const ore = matOf(r.pick(['structural', 'energy', 'exotic']), t);
    const at = spot(r, board, sys, 3500, 6500);
    const title = what === 'rock' ? `Tow in a ${MATERIALS[ore].name} asteroid` : what === 'wreck' ? 'Recover a lost hull' : 'Tow in a disabled ship';
    return { title, text: `Harpoon it (F) and drag it back within reach of ${board.name}.`, target: { what, ore, ...at, seed: r() * 1e9 | 0 }, dest: { x: board.x, y: board.y, r: board.r, name: board.name }, need: 1, base: 200 * (1 + Math.hypot(at.x - board.x, at.y - board.y) / 5000) };
  },
  delivery(r, board, sys, gal, G) {
    // to here, or to a station one jump away that your warp core reaches
    const away = sys.links.map(l => gal.systems[l]).filter(s => s.station === 'trade' && canWarpTo(G, s));
    const to = away.length && r() < 0.55 ? r.pick(away) : sys;
    const useMat = r() < 0.6;
    const good = useMat ? matOf(r.pick(['structural', 'energy']), matTier(sys.tier)) : r.pick(Object.keys(GOODS).filter(k => !GOODS[k].mat));
    const n = useMat ? 10 + Math.floor(r() * 20) : 4 + Math.floor(r() * 8);
    const timed = r() < 0.4;
    const value = (GOODS[good]?.base || MATERIALS[good]?.price || 10) * n;
    return { title: `Deliver ${n} ${matName(good)}`, text: `Bring ${n} ${matName(good)} to ${to.id === sys.id ? board.outpost ? `${sys.name} Station` : 'this station' : `${to.name} Station`}.${timed ? ' On a clock.' : ''}`,
      good, need: n, to: { system: to.id, id: to.id === sys.id && board.outpost ? `S${sys.id}` : `S${to.id}`, name: to.id === sys.id && !board.outpost ? board.name : `${to.name} Station` },
      limit: timed ? 600 + Math.floor(r() * 600) : 0, value: value * 0.6, base: 120 * (to.id !== sys.id ? 2 : 1) * (timed ? 1.5 : 1) };
  },
  clear(r, board, sys) {
    const kinds = ['camp', 'vault'].concat(sys.tier >= 2 ? ['nest'] : []);
    const site = r.pick(kinds);
    const al = factionsForTier(Math.max(2, sys.tier)).filter(f => !FACTIONS[f].human);
    const faction = site === 'nest' ? r.pick(al.length ? al : ['vesh']) : site === 'vault' ? 'redfang' : r.pick(factionsForTier(sys.tier));
    const at = spot(r, board, sys, 4500, 8000);
    const name = site === 'camp' ? `${FACTIONS[faction].short} camp` : site === 'nest' ? `${FACTIONS[faction].short} nest` : 'corsair outpost';
    return { title: `Clear out a ${name}`, text: site === 'vault' ? 'Silence the outpost\'s guns. Its vault is yours to crack.' : site === 'nest' ? 'Break the nest before it swarms the lanes.' : 'Destroy every ship at the marked camp.',
      site: { kind: site, faction, ...at, seed: r() * 1e9 | 0 }, need: 1, base: site === 'camp' ? 380 : 620 };
  },
  escort(r, board, sys) {
    const to = spot(r, board, sys, 6500, 9500);
    return { title: 'Escort a freighter', text: `A slow freighter leaves ${board.name} for a relay beacon. Keep it alive; raiders will come.`, from: { x: board.x, y: board.y + board.r + 300 }, to: { ...to, name: 'Relay beacon' }, seed: r() * 1e9 | 0, need: 1, base: 520 };
  },
  survey(r, board, sys) {
    const roll = r();
    if (roll < 0.3) { const n = 1 + (r() < 0.4 ? 1 : 0); return { title: `Survey ${n} anomal${n > 1 ? 'ies' : 'y'}`, text: 'Fly into a space rift, an ion cloud or alongside a comet in any system. They show on the local map.', survey: { what: 'anomaly' }, system: -1, need: n, base: 300 * n }; }
    const typed = roll < 0.7; const ore = typed ? matOf(r.pick(['structural', 'energy', 'exotic']), matTier(sys.tier)) : null;
    const n = typed ? 3 + Math.floor(r() * 3) : 6 + Math.floor(r() * 5);
    return { title: typed ? `Scan ${n} ${MATERIALS[ore].name} asteroids` : `Scan ${n} asteroids`, text: `Use your scanner (V) on asteroids in ${sys.name}${typed ? ` and find ${MATERIALS[ore].name} ones` : ''}.`, survey: { what: 'rock', ore }, need: n, base: typed ? 60 * n : 35 * n, seen: [] };
  },
  acquire(r, board, sys) {
    if (r() < 0.55) {
      const t = matTier(sys.tier);
      const mat = matOf(r() < 0.6 ? 'exotic' : 'energy', t);
      const n = MATERIALS[mat].role === 'exotic' ? 6 + Math.floor(r() * 10) : 15 + Math.floor(r() * 20);
      return { title: `Find ${n} ${MATERIALS[mat].name}`, text: `Mine it, buy it or salvage it — bring ${n} ${MATERIALS[mat].name} to ${board.name}.`, want: { mat }, need: n, value: MATERIALS[mat].price * n * 1.4, base: 150 };
    }
    const cat = r.pick(Object.keys(PART_SORTS)); const rar = sys.tier >= 5 ? 'epic' : 'rare';
    return { title: `Find a ${RARITY_BY_ID[rar].name.toLowerCase()} ${PART_SORTS[cat]}`, text: `${board.name} wants a ${RARITY_BY_ID[rar].name.toLowerCase()}-or-better ${PART_SORTS[cat]} from your parts hold. Loot it, buy it or craft it.`, want: { cat, rarity: rar }, need: 1, base: 900 };
  },
};

/** Job pay multiplier by danger (round 4 economy, tools/econ.mjs). */
export const MISSION_PAY = tier => 1.6 * Math.pow(tier, 1.5);
function reward(m, tier, r) {
  // base pay grows with danger; goods are already priced by tier, so their value (m.value) is added as it is
  // round 4 economy: jobs paid about a sixth of what fighting did past danger 3; now about the same per minute
  const k = MISSION_PAY(tier);
  const cr = Math.round((m.base * k + (m.value || 0)) / 10) * 10;
  return { cr, rep: 3 + Math.floor(r() * 4), part: r() < (m.kind === 'clear' || m.kind === 'escort' ? 0.55 : 0.3) };
}

// ------------------------------------------------------------------ taking, progress, finishing
/** Take a job. Returns null when it worked, or the reason it did not. */
export function acceptMission(G, m, t = G.playTime || 0) {
  const M = missionState(G);
  if (M.active.length >= MAX_ACTIVE) return `You already have ${MAX_ACTIVE} jobs. Finish or drop one first.`;
  if (M.taken.includes(m.id)) return 'You already took this job.';
  M.taken.push(m.id); if (M.taken.length > 60) M.taken.splice(0, M.taken.length - 60);
  const copy = JSON.parse(JSON.stringify(m));
  copy.accepted = t; if (copy.limit) copy.expires = t + copy.limit;
  M.active.push(copy);
  return null;
}
export function abandonMission(G, m) { const M = missionState(G); M.active = M.active.filter(x => x.id !== m.id); }

/** "3 / 5" style progress for any job. */
export function progressOf(G, m) {
  if (m.kind === 'delivery') return { have: Math.min(m.need, held(G, m.good)), need: m.need };
  if (m.kind === 'acquire' && m.want.mat) return { have: Math.min(m.need, G.cargo[m.want.mat] || 0), need: m.need };
  if (m.kind === 'acquire') return { have: partFor(G, m) ? 1 : 0, need: 1 };
  return { have: Math.min(m.need, m.got || 0), need: m.need };
}
const held = (G, id) => (GOODS[id]?.mat ? G.cargo[id] : G.goods?.[id]) || 0;
/** The worst part in the hold that satisfies an acquisition job (so the best ones are kept). */
export function partFor(G, m) {
  const min = RARITY_BY_ID[m.want.rarity]?.index || 0;
  const ok = (G.parts || []).filter(p => BLOCKS[p.block]?.cat === m.want.cat && (RARITY_BY_ID[p.rarity]?.index || 0) >= min);
  return ok.sort((a, b) => itemValue(a) - itemValue(b))[0] || null;
}
/** Can this job be handed over at this board now? Returns null if so, or what is missing. */
export function handInBlock(G, m, boardId) {
  if (m.kind === 'delivery') { if (m.to.id !== boardId) return `Deliver at ${m.to.name}.`; const p = progressOf(G, m); return p.have >= p.need ? null : `You carry ${p.have} of ${p.need}.`; }
  if (m.kind === 'acquire') { if (m.board.id !== boardId) return `Hand over at ${m.board.name}.`; const p = progressOf(G, m); return p.have >= p.need ? null : m.want.mat ? `You carry ${p.have} of ${p.need}.` : 'None in your parts hold yet.'; }
  return 'Finished out in space.';
}
/** Hand over a delivery / acquisition. Returns the reward text, or throws nothing — check handInBlock first. */
export function handIn(G, m) {
  if (m.kind === 'delivery') { const bag = GOODS[m.good]?.mat ? G.cargo : G.goods; bag[m.good] -= m.need; if (bag[m.good] <= 0) delete bag[m.good]; }
  else if (m.want.mat) { G.cargo[m.want.mat] -= m.need; if (G.cargo[m.want.mat] <= 0) delete G.cargo[m.want.mat]; }
  else { const p = partFor(G, m); G.parts.splice(G.parts.indexOf(p), 1); }
  return finish(G, m);
}
/** Pay a finished job and close it. Returns { text, part } (part is put straight into the parts hold). */
export function finish(G, m) {
  const M = missionState(G);
  M.active = M.active.filter(x => x.id !== m.id);
  M.done = (M.done || 0) + 1; G.stats.missions = (G.stats.missions || 0) + 1;
  G.credits += m.reward.cr;
  const f = m.board.faction; if (f && FACTIONS[f]) G.rep[f] = Math.max(-100, Math.min(100, (G.rep[f] ?? 0) + m.reward.rep));
  let part = null;
  if (m.reward.part) { part = rollPart(rng(hash(m.id, 'part')), m.tier, 0.7, 'uncommon'); G.parts.push(part); }
  const bits = [`+${m.reward.cr.toLocaleString()} cr`, `${FACTIONS[f]?.short || 'Their'} standing +${m.reward.rep}`];
  if (part) bits.push(`${RARITY_BY_ID[part.rarity].name} part: ${part.name}`);
  return { text: bits.join(' · '), part };
}
/** Delivery jobs on a clock that ran out. Removes them and returns them. */
export function expireMissions(G, t = G.playTime || 0) {
  const M = missionState(G); const gone = M.active.filter(m => m.expires && t > m.expires);
  if (gone.length) M.active = M.active.filter(m => !gone.includes(m));
  return gone;
}

/**
 * Where a job wants you to go in this system right now, or null (live reports #43/#46: "no clear indicator where to
 * go"; "I am supposed to take him to a mining depot. It is not clear where that mining depot is"). The answer follows
 * the job's stage: a tow job points at the target until it is on your harpoon, then at the station or outpost that
 * wants it; an escort points at the meeting point, then the freighter; a delivery / acquisition points at the board
 * that takes the hand-over; an anomaly survey points at the nearest anomaly not yet recorded. Asteroid surveys
 * (scan any rock here) and jobs in another system have no place. Returns { x, y, label, stage, body? }.
 */
export function missionTarget(m, w, sysId) {
  const here = m.system === sysId || m.system === -1;
  const live = w?.missions?.[m.id];
  if (m.kind === 'delivery') {
    if (m.to.system !== sysId) return null;
    const st = boardBody(w, m.to.id);
    return st ? { x: st.x, y: st.y, label: `Deliver: ${m.to.name}`, stage: 'deliver', body: st } : null;
  }
  if (m.kind === 'acquire') {
    if (m.board.system !== sysId) return null;
    const st = boardBody(w, m.board.id);
    const p = st || (m.board.x != null ? m.board : null);
    return p ? { x: p.x, y: p.y, label: `Hand over: ${m.board.name}`, stage: 'deliver', body: st || null } : null;
  }
  if (!here) return null;
  if (m.kind === 'recovery') {
    const b = live?.body && !live.body.dead ? live.body : null;
    if (b && b.harpooned) return { x: m.dest.x, y: m.dest.y, label: `Tow to ${m.dest.name}`, stage: 'tow', body: boardBody(w, m.board.id) };
    return { x: b?.x ?? m.target.x, y: b?.y ?? m.target.y, label: 'Tow target', stage: 'find', body: b };
  }
  if (m.kind === 'clear') return { x: m.site.x, y: m.site.y, label: m.title.replace('Clear out a ', 'Clear: '), stage: 'go' };
  if (m.kind === 'escort') {
    const f = live?.ship;
    if (f && !f.dead) return { x: f.x, y: f.y, label: 'Freighter (escort)', stage: 'escort', body: f };
    return { x: m.from.x, y: m.from.y, label: 'Meet the freighter', stage: 'meet' };
  }
  if (m.kind === 'survey' && m.survey.what === 'anomaly' && w) {
    const px = w.player?.x || 0, py = w.player?.y || 0; const seen = m.seen || [];
    const left = anomaliesNear(w, px, py, 1e9).filter(e => !seen.includes(`${sysId}:${e.key || e.id}`));
    if (!left.length) return null;
    const e = left.sort((a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py))[0];
    return { x: e.x, y: e.y, label: 'Anomaly to survey', stage: 'go' };
  }
  return null;
}
/** The station or friendly outpost body that runs a board ('S<system>' = the system's station, 'O…' = an outpost). */
export function boardBody(w, id) {
  if (!w || !id) return null;
  if (id.startsWith('S')) return (w.stations || []).find(s => !s.dead && s.dockable && s.team !== 'hostile' && !s.outpost && !s.colony) || null;
  return (w.bodies || []).find(b => !b.dead && b.outpost?.board === id) || null;
}
/** Every active job with a place in this system: [{ m, x, y, label, stage, color }] (markers on screen, radar, map). */
export function missionMarks(G, w, sysId) {
  const out = [];
  for (const m of missionState(G).active) {
    const tg = missionTarget(m, w, sysId);
    if (tg) out.push({ m, ...tg, color: MISSION_KINDS[m.kind].color });
  }
  return out;
}

// ------------------------------------------------------------------ the in-space part (each frame while flying)
/**
 * Spawns what this system's jobs need (tow targets, sites, the freighter), counts progress and finishes jobs.
 * Messages go to w.encMsgs like encounters.js. Returns the jobs finished this tick.
 */
export function missionTick(w, G, dt) {
  const M = missionState(G); const P = w.player; if (!P || P.dead || !w.system) return [];
  const sysId = w.system.id; w.missions ||= {};
  const out = [];
  const say = m => (w.encMsgs ||= []).push(m);
  tractorTick(w, dt);
  for (const m of [...M.active]) {
    const here = m.system === sysId;
    const L = (w.missions[m.id] ||= { cd: 0 });
    if (m.kind === 'recovery' && here) {
      if (!L.body || (L.body.dead && (L.cd -= dt) <= 0)) {
        L.body = spawnTowTarget(w, m); L.cd = 15;
        L.poi = { kind: 'enc', body: L.body, color: '#ffd27a', label: 'Tow target', mission: m.id }; (w.poi ||= []).push(L.poi);
      } else if (L.body.dead && !L.told) { L.told = true; say({ t: 'toast', text: 'The tow target broke up. Another will be marked shortly.', kind: 'bad' }); }
      if (!L.body.dead) { L.told = false; if (Math.hypot(L.body.x - m.dest.x, L.body.y - m.dest.y) < m.dest.r + 700) { m.got = 1; L.body.missionDone = true; L.poi.done = true; out.push(m); pullIn(w, L.body, m); say({ t: 'sound', id: 'dock' }); } }
    } else if (m.kind === 'clear' && here) {
      if (!L.entry) L.entry = spawnEncounter(w, m.site.kind, m.site.x, m.site.y, { seed: m.site.seed, faction: m.site.faction, missionId: m.id, timed: true });
      if (L.entry.cleared || (m.site.kind === 'vault' && L.entry.open)) { m.got = 1; out.push(m); }
    } else if (m.kind === 'escort' && here) {
      if (!L.ship && Math.hypot(P.x - m.from.x, P.y - m.from.y) < 3000) {
        const s = generateShip({ cls: m.tier >= 3 ? 'frigate' : 'corvette', faction: FACTIONS[m.board.faction]?.human && !FACTIONS[m.board.faction].hostile ? m.board.faction : 'guild', tier: m.tier, seed: m.seed, role: 'trader' });
        s.x = m.from.x; s.y = m.from.y; s.team = 'friendly'; s.name = `Freighter ${s.name}`; s.route = [m.to]; s.escort = m.id; s.missionId = m.id;
        w.bodies.push(s); L.ship = s; L.waves = 0; L.start = Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y);
        L.poi = { kind: 'enc', body: s, color: '#7affd8', label: 'Freighter (escort)', mission: m.id }; L.poi2 = { kind: 'enc', x: m.to.x, y: m.to.y, color: '#7affd8', label: 'Relay beacon', mission: m.id };
        w.poi.push(L.poi, L.poi2);
        say({ t: 'toast', text: 'The freighter is under way. Stay close.', kind: 'good' });
      }
      const s = L.ship;
      if (s) {
        if (s.dead) {
          abandonMission(G, m); L.poi.done = L.poi2.done = true;
          say({ t: 'banner', title: 'Escort failed', text: 'The freighter was destroyed.' }); say({ t: 'sound', id: 'warn' });
          continue;
        }
        const left = Math.hypot(m.to.x - s.x, m.to.y - s.y);
        const prog = 1 - left / Math.max(1, L.start);
        if (L.waves < 3 && prog > [0.15, 0.5, 0.8][L.waves]) {
          L.waves++;
          const r = rng(hash(m.seed, 'wave', L.waves)); const a = Math.atan2(m.to.y - s.y, m.to.x - s.x) + r.range(-0.8, 0.8);
          spawnEncounterWave(w, s.x + Math.cos(a) * 1500, s.y + Math.sin(a) * 1500, m, r);
          say({ t: 'toast', text: `Raiders closing on the freighter (wave ${L.waves} of 3).`, kind: 'bad' }); say({ t: 'sound', id: 'warn' });
        }
        if (left < 600) { m.got = 1; L.poi.done = L.poi2.done = true; s.route = [{ x: m.from.x, y: m.from.y }]; out.push(m); }
      }
    } else if (m.kind === 'survey') {
      if (m.survey.what === 'anomaly') {
        for (const e of anomaliesNear(w, P.x, P.y, 1100)) { const k = `${sysId}:${e.key || e.id}`; if (!(m.seen ||= []).includes(k)) { m.seen.push(k); m.got = (m.got || 0) + 1; say({ t: 'toast', text: `Anomaly recorded (${Math.min(m.got, m.need)} / ${m.need}).`, kind: 'good' }); } }
      } else if (here && (L.scanT = (L.scanT || 0) - dt) <= 0) {
        L.scanT = 0.5;
        for (const b of w.bodies) if (b.kind === 'rock' && b.scanned && !b.dead && !(b.surveyed ||= {})[m.id] && (!m.survey.ore || rockOre(b).type === m.survey.ore)) { b.surveyed[m.id] = true; m.got = (m.got || 0) + 1; }
      }
      if ((m.got || 0) >= m.need) out.push(m);
    }
  }
  // pay what finished
  for (const m of out) {
    const res = finish(G, m);
    say({ t: 'banner', title: `Job done: ${m.title}`, text: res.text }); say({ t: 'sound', id: 'rare' });
  }
  for (const m of expireMissions(G)) say({ t: 'toast', text: `Too late: ${m.title}. The job was cancelled.`, kind: 'bad' });
  // course markers for jobs that are gone
  if (w.poi) w.poi = w.poi.filter(p => !p.mission || M.active.some(m => m.id === p.mission));
  void encState;
  return out;
}

/**
 * A delivered tow is pulled in by the station's tractor beam (live report #48: "the ship is still there. It would be
 * cool if the station used tractor beams to pull the ship in"). The harpoon lets go, the body glides to the
 * station's middle while it shrinks and fades, then it is gone. ui/missions.js draws the beam from w.tractors.
 */
export const TRACTOR_TIME = 3.2;
export function pullIn(w, b, m) {
  for (const s of w.bodies) if (s.tether && s.tether.b === b) { s.tether.dead = true; s.tether = null; }
  b.harpooned = false;
  const st = boardBody(w, m.board.id);
  const tx = st?.x ?? m.dest.x, ty = st?.y ?? m.dest.y;
  b.static = true; b.invuln = true; b.vx = 0; b.vy = 0; b.towed = true;
  (w.tractors ||= []).push({ b, st, x0: b.x, y0: b.y, tx, ty, t: 0, dur: TRACTOR_TIME, va: b.va || 0.3 });
}
export function tractorTick(w, dt) {
  if (!w.tractors?.length) return;
  for (const T of w.tractors) {
    T.t += dt; const k = Math.min(1, T.t / T.dur); const e = k * k * (3 - 2 * k);
    const b = T.b; if (T.st && !T.st.dead) { T.tx = T.st.x; T.ty = T.st.y; }
    b.x = T.x0 + (T.tx - T.x0) * e; b.y = T.y0 + (T.ty - T.y0) * e; b.a += T.va * dt * 0.5;
    b.shrink = 1 - 0.85 * e; b.fade = k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4);
    if (k >= 1) { b.dead = true; b.unloaded = true; T.done = true; }
  }
  w.tractors = w.tractors.filter(T => !T.done);
}

function spawnEncounterWave(w, x, y, m, r) {
  const f = m.tier >= 3 && r() < 0.4 ? r.pick(factionsForTier(m.tier)) : 'redfang';
  const e = spawnEncounter(w, 'camp', x, y, { seed: r() * 1e9 | 0, faction: f, missionId: m.id, timed: true });
  e.pois.forEach(p => { p.done = true; });   // the freighter is the marker that matters
  const target = w.missions[m.id].ship;
  for (const s of e.ships) s.ai = { t: 0, orbit: r() < 0.5 ? 1 : -1, home: { x: target.x, y: target.y }, target, look: 3 };
}

function spawnTowTarget(w, m) {
  const T = m.target; let b;
  if (T.what === 'rock') { b = makeRock(T.seed, 7, m.tier, { type: T.ore, rich: true }); b.name = `${MATERIALS[T.ore].name} asteroid (job)`; }
  else {
    b = generateShip({ cls: T.what === 'ship' ? 'corvette' : 'skiff', faction: T.what === 'ship' ? 'guild' : 'navy', tier: m.tier, seed: T.seed });
    if (T.what === 'wreck') for (const bl of b.grid.blocks) if (!bl.def.core && ((bl.idx * 7) % 10) < 3) { bl.hp = Math.max(1, bl.hp * 0.2); }
    b.kind = 'wreck'; b.team = 'neutral'; b.life = 1e9; b.ai = null; b.name = T.what === 'ship' ? `Disabled ${b.name}` : `Lost hull ${b.name}`;
  }
  b.x = T.x; b.y = T.y; b.vx = 0; b.vy = 0; b.missionId = m.id;
  w.bodies.push(b);
  return b;
}
