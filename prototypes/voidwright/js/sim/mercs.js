// Mercenaries (play-test #29, owner rulings E1 + E2). A merc is a PERSON, not a ship: you hire them at a
// station's Mercenaries board and give them one of the ships in your hangar. While they fly it they are a
// wingman: an escort that follows you in formation, fights what attacks you or what you shoot, and comes back
// when it strays too far.
//
//   E1  flagship + small wing: 1 wingman with a skiff/corvette flagship, 2 with a frigate/destroyer, 3 with a
//       cruiser or bigger (WING_SLOTS).
//   E2  FIXED stats, no levels. Better mercs are found at more dangerous stations and cost more: a hire fee plus
//       a wage every 10 minutes of play (WAGE_EVERY), taken from your credits. If you cannot pay, they warn you
//       and leave after WAGE_GRACE seconds.
//
// Stats: piloting (the most CPU and crew a ship they fly may need → which hull classes), gunnery (a damage
// multiplier on their ship's weapons) and one trait (TRAITS). Names and callsigns are generated (original).
//
// When a wingman's ship is destroyed the merc ejects (they never die): the ship is marked wrecked in the hangar
// and the merc is "down" (they wait at your hangar) until the ship is repaired or they get another one. A wrecked ship is repaired for credits at any station's
// Mercenaries board or shipyard (repairCost / repairShip).
//
// The save holds G.mercs = [{ id, name, callsign, color, glyph, grade, pilot:{cpu,crew}, gunnery, trait, fee,
// wage, ship: hangar id (string) | null, down, paidUntil, warnAt }]. A hangar ship is referred to by a stable id
// (rec.hid, given out by hidOf) because the hangar list is reordered by the shipyard. Quests read
// `(g.mercs||[]).filter(m => m.ship).length`.
//
// Pure sim + helpers that take `app` (spawnWing, storeWing, wingTick) for the hooks in main.js. No DOM.

import { rng, hash, clamp, angDiff, TAU } from '../core/math.js';
import { gridFromJSON, gridToJSON } from './grid.js';
import { makeBody, recompute } from './ship.js';
import { hostile, near } from './world.js';
import { avoid } from './ai.js';
import { researchBonus } from './research.js';
import { CLASSES, PREMADES } from '../data/hulls.js';
import { matTier } from '../data/types.js';

export const WAGE_EVERY = 600;   // seconds of play between wages
export const WAGE_GRACE = 120;   // seconds you get to find the money after the warning
export const MAX_ROSTER = 6;     // mercs you can have hired at once (only WING_SLOTS fly)
const LEASH = 2200;              // a wingman further than this from you drops its fight and comes back
const CATCH_UP = 6000;           // further than this (you cruised off): it jumps in beside you

/** Piloting grades. A merc of a grade flies ships whose CPU use and crew need are at most these (± their own slack). */
export const GRADES = [
  null,
  { id: 1, label: 'Corvettes', cpu: 24, crew: 6 },
  { id: 2, label: 'Frigates', cpu: 130, crew: 36 },
  { id: 3, label: 'Destroyers', cpu: 180, crew: 46 },
  { id: 4, label: 'Cruisers', cpu: 480, crew: 100 },
  { id: 5, label: 'Battleships', cpu: 800, crew: 180 },
  { id: 6, label: 'Dreadnoughts', cpu: 1200, crew: 260 },
];
const FEE = [0, 1500, 9000, 22000, 60000, 160000, 420000];

/** One trait each. `glyph` is the shape drawn on their emblem (ui/mercs.js). */
export const TRAITS = {
  shields:  { name: 'Shield tech', glyph: 'shield', text: 'Their ship\'s shields hold 35% more and recharge 35% faster.', cost: 1.15 },
  mechanic: { name: 'Field mechanic', glyph: 'wrench', text: 'Their ship repairs twice as fast, and they patch your hull when the fighting stops (+3% a second).', cost: 1.2 },
  missiles: { name: 'Missile ace', glyph: 'missile', text: 'Their missile launchers reload 60% faster.', cost: 1.1 },
  miner:    { name: 'Prospector', glyph: 'pick', text: 'Mines nearby asteroids when there is nothing to fight, and brings you ore now and then.', cost: 0.9 },
  hunter:   { name: 'Hunter', glyph: 'cross', text: 'Goes for whatever is shooting at you first, from further out. +10% damage.', cost: 1.15 },
};
export const TRAIT_IDS = Object.keys(TRAITS);
const COLORS = ['#ff8a5a', '#7dff9a', '#ffd84a', '#b48cff', '#5fd8ff', '#ff6a9a', '#c8ff6a', '#ffb070', '#8fb4ff', '#ff9ef0'];

// names: syllables + plain-word callsigns (original, nothing borrowed)
const FIRST_A = ['Ar', 'Bel', 'Cor', 'Da', 'Ed', 'Fen', 'Gal', 'Har', 'Isk', 'Jo', 'Ka', 'Lio', 'Mar', 'Nel', 'Or', 'Pell', 'Quin', 'Ros', 'Sa', 'Tam', 'Ula', 'Vin', 'Wes', 'Yor', 'Zan'];
const FIRST_B = ['a', 'en', 'is', 'o', 'ric', 'ette', 'mund', 'ra', 'in', 'ah', 'el', 'y', 'ius', 'ot', 'wen'];
const LAST_A = ['Ash', 'Brae', 'Cald', 'Dunn', 'Fair', 'Gorr', 'Hale', 'Kest', 'Lun', 'Marr', 'Northe', 'Pry', 'Rook', 'Stave', 'Thorn', 'Vant', 'Wick'];
const LAST_B = ['ley', 'well', 'by', 'ford', 'mere', 'son', 'ridge', 'holt', 'stead', 'wright', 'cote', 'hurst'];
const CALLSIGNS = ['Kettle', 'Sprocket', 'Bramble', 'Gravel', 'Pickle', 'Ratchet', 'Thimble', 'Lantern', 'Marrow', 'Gusset', 'Biscuit', 'Tumbler',
  'Magpie', 'Rivet', 'Hobnail', 'Juniper', 'Skillet', 'Dory', 'Cobble', 'Wicket', 'Parsnip', 'Grommet', 'Bobbin', 'Quarry', 'Tallow', 'Brisket',
  'Halfpenny', 'Mortar', 'Spindle', 'Crumpet', 'Jackdaw', 'Pewter', 'Thistle', 'Ladle', 'Nettle', 'Cask'];

// ------------------------------------------------------------------ the hire board
/** Mercs offered at a station today (same list all day; changes every 10 minutes of play like shop stock). */
export function mercsForHire(G, sys, n = null) {
  const day = Math.floor((G.playTime || 0) / WAGE_EVERY);
  const r = rng(hash(G.seed, 'mercs', sys.id, day));
  const count = n ?? 3 + (r() < 0.5 ? 1 : 0);
  const out = [];
  for (let i = 0; i < count; i++) {
    const m = rollMerc(r, sys.tier, `${sys.id}.${day}.${i}`);
    if ((G.mercs || []).some(x => x.id === m.id)) continue;   // already working for you
    out.push(m);
  }
  return out;
}

/** One merc for a danger level (1-10). Same rng → same merc. */
export function rollMerc(r, tier, id = String(Math.floor(r() * 1e9))) {
  const grade = clamp(matTier(tier) + r.pick([-1, 0, 0, 0, 1]) + (tier >= 9 ? 1 : 0), 1, 6);
  const slack = 0.88 + r() * 0.24;
  const G0 = GRADES[grade];
  const gunnery = +(0.9 + grade * 0.05 + r() * 0.3).toFixed(2);
  const trait = r.pick(TRAIT_IDS);
  const fee = Math.round(FEE[grade] * (0.7 + gunnery * 0.4) * TRAITS[trait].cost * slack / 50) * 50;
  const wage = Math.max(20, Math.round(fee * 0.08 / 10) * 10);
  const first = r.pick(FIRST_A) + r.pick(FIRST_B), last = r.pick(LAST_A) + r.pick(LAST_B);
  return {
    id: 'm' + id, name: `${first} ${last}`, callsign: r.pick(CALLSIGNS), color: r.pick(COLORS), glyph: TRAITS[trait].glyph,
    grade, pilot: { cpu: Math.round(G0.cpu * slack), crew: Math.round(G0.crew * slack) }, gunnery, trait, fee, wage,
    ship: null, down: false,
  };
}

/** Wingmen your flagship can lead (E1). */
export function wingSlots(G) {
  const rank = CLASSES[G.ship?.cls]?.rank ?? 0;
  return rank >= 4 ? 3 : rank >= 2 ? 2 : 1;
}
export const wingSlotsText = () => 'A skiff or corvette leads 1 wingman, a frigate or destroyer 2, a cruiser or bigger 3.';

/** Why you cannot hire this merc, or null. */
export function cannotHire(G, m) {
  if ((G.mercs || []).length >= MAX_ROSTER) return `You already have ${MAX_ROSTER} mercenaries`;
  if ((G.mercs || []).some(x => x.id === m.id)) return 'Already hired';
  if (G.credits < m.fee) return `Needs ${m.fee.toLocaleString()} cr`;
  return null;
}
export function hire(G, m) {
  const why = cannotHire(G, m); if (why) return why;
  G.mercs ||= [];
  G.credits -= m.fee;
  G.mercs.push({ ...m, pilot: { ...m.pilot }, ship: null, down: false, paidUntil: (G.playTime || 0) + WAGE_EVERY, warnAt: null, hiredAt: G.playTime || 0 });
  return null;
}
/** Let a merc go. Their ship stays in your hangar. */
export function dismiss(G, id) {
  G.mercs = (G.mercs || []).filter(m => m.id !== id);
}

// ------------------------------------------------------------------ ships
let hidN = 0;
/** A stable id for a hangar record (the hangar list is reordered by the shipyard, so indexes are no good). */
export function hidOf(rec) { return (rec.hid ||= `h${Date.now().toString(36)}${(hidN++).toString(36)}`); }
export const shipOf = (G, m) => (m.ship ? (G.hangar || []).find(h => h.hid === m.ship) || null : null);
export const mercFlying = (G, rec) => (G.mercs || []).find(m => m.ship && m.ship === rec.hid) || null;

/** What a ship needs from its pilot: CPU in use and crew needed (a body is built once and cached on the record). */
export function shipNeeds(rec) {
  const key = rec.grid?.b?.length + ':' + rec.cls;
  if (rec._needs?.key === key) return rec._needs;
  const b = makeBody('ship', gridFromJSON(rec.grid), { cls: rec.cls });
  const out = { key, cpu: b.stats.cpu, crew: b.stats.crewNeed, cpuCap: b.stats.cpuCap, crewCap: b.stats.crewCap, hp: b.stats.maxHp };
  Object.defineProperty(rec, '_needs', { value: out, enumerable: false, configurable: true, writable: true });
  return out;
}

/** Why this merc cannot fly this ship (one short reason, shown ON the row), or null. */
export function cannotFly(G, m, rec) {
  if (!rec) return 'No ship';
  if (rec === G.ship) return 'That is your flagship';
  if (rec.wrecked) return 'Wrecked — repair it first';
  const other = mercFlying(G, rec); if (other && other.id !== m.id) return `${other.callsign} flies it`;
  const n = shipNeeds(rec);
  if (n.cpu > m.pilot.cpu) return `Needs ${n.cpu} CPU — ${m.callsign} handles ${m.pilot.cpu}`;
  if (n.crew > m.pilot.crew) return `Needs ${n.crew} crew — ${m.callsign} handles ${m.pilot.crew}`;
  return null;
}
/** Give a merc a hangar ship (or null to take it away). Returns a refusal reason or null. */
export function assign(G, mercId, rec) {
  const m = (G.mercs || []).find(x => x.id === mercId); if (!m) return 'No such mercenary';
  if (!rec) { m.ship = null; return null; }
  const why = cannotFly(G, m, rec); if (why) return why;
  m.ship = hidOf(rec); m.down = false;   // an ejected merc is back in the air in a ship that is whole
  return null;
}

/** Credits to make a wrecked (or damaged) wingman ship whole again. */
export function repairCost(rec) {
  const pm = PREMADES.find(p => p.id === rec.design);
  const hull = pm?.price ?? CLASSES[rec.cls]?.price ?? 2000;
  const dmg = damageShare(rec);
  return Math.max(150, Math.round((rec.wrecked ? hull * 0.12 + 200 : hull * 0.12 * dmg) / 10) * 10);
}
/** 0..1: how much of the ship's block health is missing. */
export function damageShare(rec) {
  let have = 0, max = 0;
  const b = makeBody('ship', gridFromJSON(rec.grid), { cls: rec.cls });
  for (const x of b.grid.blocks) { max += x.maxHp; have += x.alive ? x.hp : 0; }
  return max ? 1 - have / max : 0;
}
export function repairShip(G, rec) {
  const cost = repairCost(rec);
  if (G.credits < cost) return `Needs ${cost.toLocaleString()} cr`;
  G.credits -= cost;
  rec.wrecked = false;
  for (const b of rec.grid.b) b[4] = 1e9;   // every block back to full (gridFromJSON clamps to max)
  for (const m of G.mercs || []) if (m.ship === rec.hid) m.down = false;
  return null;
}

/** Mercs who should be flying right now, in wing order (assigned, not down, ship whole), capped by the slots. */
export function flyingMercs(G) {
  const out = [];
  for (const m of G.mercs || []) {
    if (out.length >= wingSlots(G)) break;
    const rec = shipOf(G, m);
    if (!rec || rec.wrecked || m.down) continue;
    out.push({ m, rec });
  }
  return out;
}

/** Keep merc ↔ hangar links honest after the shipyard changed things (a ship sold, or swapped to be your flagship). */
export function syncMercs(G) {
  const notes = [];
  for (const m of G.mercs || []) {
    if (!m.ship) continue;
    if (G.ship?.hid === m.ship) { m.ship = null; notes.push(`${m.callsign} stepped out: you are flying that ship now.`); continue; }
    if (!(G.hangar || []).some(h => h.hid === m.ship)) { m.ship = null; notes.push(`${m.callsign} has no ship: it left your hangar.`); }
  }
  return notes;
}

// ------------------------------------------------------------------ wages (E2)
/**
 * Pay wages that are due. Returns events: { t: 'paid', cr, n } | { t: 'warn', m, owed } | { t: 'left', m }.
 * A merc who cannot be paid is warned once, then leaves WAGE_GRACE seconds later if still unpaid.
 */
export function payWages(G) {
  const ev = []; const now = G.playTime || 0; let paid = 0, n = 0;
  for (const m of (G.mercs || []).slice()) {
    m.paidUntil ??= now + WAGE_EVERY;
    if (now < m.paidUntil) continue;
    if (G.credits >= m.wage) {
      G.credits -= m.wage; paid += m.wage; n++;
      m.paidUntil += WAGE_EVERY; m.warnAt = null;
      continue;
    }
    if (m.warnAt == null) { m.warnAt = now; ev.push({ t: 'warn', m, owed: m.wage }); continue; }
    if (now - m.warnAt >= WAGE_GRACE) { dismiss(G, m.id); ev.push({ t: 'left', m }); }
  }
  if (paid) ev.unshift({ t: 'paid', cr: paid, n });
  return ev;
}
/** Total wages per 10 minutes, and seconds until the next one is due. */
export function wageBill(G) {
  const ms = G.mercs || [];
  const total = ms.reduce((s, m) => s + m.wage, 0);
  const next = ms.length ? Math.max(0, Math.min(...ms.map(m => (m.paidUntil ?? 0) - (G.playTime || 0)))) : 0;
  return { total, next };
}

// ------------------------------------------------------------------ wingmen in space
/** A ship body for a merc from its hangar record. Team 'player' (never w.player): allies' rules apply. */
export function wingBody(G, m, rec) {
  const s = makeBody('ship', gridFromJSON(rec.grid), {
    cls: rec.cls, team: 'player', faction: 'player', name: `${m.callsign}`,
    palette: { hull: '#46566e', trim: m.color, light: m.color, dark: '#10141e' },
  });
  const bonus = researchBonus(G);
  if (m.trait === 'shields') bonus.shield *= 1.35;
  if (m.trait === 'mechanic') bonus.repair *= 2;
  s.bonus = bonus;
  s.crew = Math.max(s.stats.crewCap, s.stats.crewNeed); recompute(s);   // a merc brings their own crew
  s.dmgMul = m.gunnery * (m.trait === 'hunter' ? 1.1 : 1);
  s.wing = true; s.merc = m.id; s.role = 'escort';
  if (m.trait === 'shields') for (const sh of s.shields) sh.regen *= 1.35;
  return s;
}

/** The wingmen alive in this world (w.wing is reset with every new world). */
export const wingOf = w => (w.wing ||= []);

/**
 * Put the wing in space around the player: keep wingmen who are already flying, add the missing ones behind
 * you, take away any whose merc no longer flies. Called on arriving in a system, undocking and after build mode.
 */
export function spawnWing(app, { fresh = false } = {}) {
  const G = app.G, w = app.w, P = app.P; if (!G || !w || !P) return [];
  checkDowned(app);
  for (const n of syncMercs(G)) app.toast?.(n);
  const want = flyingMercs(G);
  const list = wingOf(w);
  // after docking the hangar records are the truth (repairs, refits): start the wing over from them
  if (fresh) for (const s of list) if (!s.dead) { s.dead = true; s.gone = true; w.bodies = w.bodies.filter(b => b !== s); app.R?.forget?.(s.id); }
  if (fresh) list.length = 0;
  // drop bodies that should not be here (merc dismissed, reassigned, or over the slot limit)
  for (const s of list.slice()) {
    const keep = !s.dead && want.some(x => x.m.id === s.merc && x.rec.hid === s.hid);
    if (!keep) { if (!s.dead) { s.dead = true; s.gone = true; } list.splice(list.indexOf(s), 1); w.bodies = w.bodies.filter(b => b !== s); app.R?.forget?.(s.id); }
  }
  want.forEach(({ m, rec }, i) => {
    let s = list.find(b => b.merc === m.id);
    if (!s) {
      s = wingBody(G, m, rec); s.hid = rec.hid;
      const [x, y] = slotPos(P, s, i);
      s.x = x - Math.cos(P.a) * 120; s.y = y - Math.sin(P.a) * 120; s.a = P.a; s.vx = P.vx; s.vy = P.vy;
      w.bodies.push(s); list.push(s);
    }
    s.slot = i;
  });
  return list;
}

/** A wingman whose ship died: the merc ejects (never dies), the ship is wrecked in the hangar. */
export function wingDown(G, s) {
  const m = (G.mercs || []).find(x => x.id === s.merc);
  const rec = (G.hangar || []).find(h => h.hid === s.hid);
  if (rec) rec.wrecked = true;
  if (m) m.down = true;
  return m;
}
function checkDowned(app) {
  const list = wingOf(app.w);
  for (const s of list.slice()) {
    if (!s.dead || s.gone) continue;
    const m = wingDown(app.G, s);
    app.banner?.(`${m?.callsign || 'Your wingman'} is shot down`, 'They ejected safely. Repair their ship at a station: Mercenaries or Shipyard.');
    list.splice(list.indexOf(s), 1);
  }
}

/** Write each wingman's damage back into its hangar record (before docking, jumping or saving). */
export function storeWing(app) {
  const G = app.G, w = app.w; if (!G || !w) return;
  for (const s of wingOf(w)) {
    if (s.dead) continue;
    const rec = (G.hangar || []).find(h => h.hid === s.hid); if (!rec) continue;
    rec.grid = gridToJSON(s.grid);
  }
}

/** Where wingman i flies: behind you and out to the side, alternating left / right. */
function slotPos(P, s, i) {
  const side = i % 2 ? -1 : 1; const row = Math.floor(i / 2) + 1;
  const back = P.r + s.r + 140 * row, out = (P.r + s.r + 90) * side * (i === 2 ? 0 : 1);
  const ca = Math.cos(P.a), sa = Math.sin(P.a);
  return [P.x - ca * back - sa * out, P.y - sa * back + ca * out];
}

/**
 * Escort brain (called from ai.js think for bodies with s.wing). Same input shape as every AI ship.
 * Picks, in order: whatever is hurting the player, the player's marked target, whatever is hurting this
 * wingman, the nearest hostile close to the player. Drops the fight past LEASH and flies back into formation.
 */
export function escortThink(w, s, dt) {
  const P = w.player;
  const ai = s.ai || (s.ai = { t: 0, look: 0, target: null, orbit: (s.slot || 0) % 2 ? -1 : 1 });
  ai.look -= dt; ai.t += dt;
  const inp = { mx: 0, my: 0, ax: s.x + Math.cos(s.a) * 100, ay: s.y + Math.sin(s.a) * 100, fire: false, missile: false, boost: false };
  if (!P || P.dead) { s.va *= 0.9; return inp; }
  const dP = Math.hypot(P.x - s.x, P.y - s.y);
  const merc = (w.game?.mercs || []).find(m => m.id === s.merc);
  const hunter = merc?.trait === 'hunter';
  const ok = o => o && !o.dead && o.cloak <= 0 && hostile(w, s, o) && Math.hypot(o.x - P.x, o.y - P.y) < LEASH * (hunter ? 1.2 : 1);
  if (ai.look <= 0) {
    ai.look = 0.5 + ((s.id * 7) % 5) * 0.05;
    const cand = [P.lastAttacker && w.t - P.lastHit < 6 ? P.lastAttacker : null, P.input?.lock, s.lastAttacker && w.t - s.lastHit < 6 ? s.lastAttacker : null];
    let T = cand.find(ok) || null;
    if (!T) {
      let bd = 1000 + (hunter ? 300 : 0);
      for (const o of near(w, P.x, P.y, bd)) {
        if (o.kind !== 'ship' && o.kind !== 'station' && o.kind !== 'ground') continue;
        if (!ok(o) || o.invuln) continue;
        const d = Math.hypot(o.x - P.x, o.y - P.y) - o.r; if (d < bd) { bd = d; T = o; }
      }
    }
    ai.target = T;
  }
  if (ai.target && !ok(ai.target)) ai.target = null;
  if (dP > LEASH) ai.target = null;
  const T = ai.target;
  let reach = 300, lockReach = 0;
  for (const t of s.turrets) { if (!t.b.alive) continue; if (t.w.mode === 'lock') lockReach = Math.max(lockReach, t.w.range); else if (t.w.mode !== 'tool' && t.w.mode !== 'pd') reach = Math.max(reach, t.w.range); }
  if (T) {
    const d = Math.hypot(T.x - s.x, T.y - s.y);
    inp.ax = T.x + T.vx * 0.2; inp.ay = T.y + T.vy * 0.2; inp.lock = T;
    inp.fire = d < reach + T.r; inp.missile = lockReach > 0 && d < lockReach;
    const toT = Math.atan2(T.y - s.y, T.x - s.x);
    inp.noseOn = Math.abs(angDiff(s.a, toT)) < 0.18;
    const keep = reach * 0.7 + T.r * 0.5;
    const radial = clamp((d - keep) / Math.max(60, keep * 0.4), -1, 1);
    const rx = Math.cos(toT), ry = Math.sin(toT);
    const hasFixed = s.turrets.some(t => t.b.alive && t.w.mode === 'fixed');
    const orbitW = hasFixed && d < keep * 1.3 ? 0.2 : 0.8;
    inp.mx = rx * radial - ry * ai.orbit * orbitW; inp.my = ry * radial + rx * ai.orbit * orbitW;
    if (d > keep * 2.2) inp.boost = true;
  } else {
    // formation: slot behind you; match your speed when there, hurry (cruise) when far behind
    const [gx, gy] = slotPos(P, s, s.slot || 0);
    const dx = gx - s.x, dy = gy - s.y; const dg = Math.hypot(dx, dy);
    const vmax = Math.max(1, s.stats.maxSpeed);
    const pv = Math.hypot(P.vx, P.vy);
    const want = Math.min(1.4, pv / vmax + dg / 260);
    inp.mx = dg > 1 ? dx / dg * want : 0; inp.my = dg > 1 ? dy / dg * want : 0;
    if (dg < 40 && pv < 20) { inp.mx = inp.my = 0; inp.face = P.a; }
    inp.cruise = dg > 500 || (P.input?.cruise && pv > vmax * 0.8);
    if (dg > 900) inp.boost = true;
    // prospectors cut rock while there is nothing to fight (their mining lasers aim at rocks by themselves)
    if (merc?.trait === 'miner' && pv < 60 && w.t - (w.combatT ?? -99) > 6) {
      for (const o of near(w, s.x, s.y, 420)) if (o.kind === 'rock' && !o.dead) { inp.fire = true; inp.ax = o.x; inp.ay = o.y; break; }
    }
  }
  avoid(w, s, inp);
  return inp;
}

/**
 * Once a frame from main.js (flying only). Pays wages, notices wingmen shot down, keeps the wing close, runs
 * traits. Returns nothing; tells the player through app.toast / app.banner.
 */
export function wingTick(app, dt) {
  const G = app.G, w = app.w, P = app.P; if (!G || !w || !P) return;
  app.wingT = (app.wingT || 0) - dt;
  const slow = app.wingT <= 0; if (slow) app.wingT = 0.5;
  const list = wingOf(w);
  checkDowned(app);
  for (const s of list) {
    if (s.dead) continue;
    // fell far behind (you cruised off, or jumped across the system): bring them in beside you
    if (Math.hypot(P.x - s.x, P.y - s.y) > CATCH_UP && !s.ai?.target) {
      const [x, y] = slotPos(P, s, s.slot || 0); s.x = x; s.y = y; s.vx = P.vx; s.vy = P.vy; s.a = P.a;
    }
    const m = (G.mercs || []).find(x => x.id === s.merc); if (!m) continue;
    const calm = w.t - s.lastHit > 6 && w.t - (w.combatT ?? -99) > 6;
    if (m.trait === 'missiles') for (const t of s.turrets) if (t.w.mode === 'lock') t.cd -= dt * 0.6;
    if (m.trait === 'mechanic' && calm && slow && P.stats.hp < P.stats.maxHp && Math.hypot(P.x - s.x, P.y - s.y) < 900) {
      let amt = P.stats.maxHp * 0.03 * 0.5;
      for (const b of P.grid.blocks) { if (amt <= 0) break; if (b.alive && b.hp < b.maxHp) { const d = Math.min(amt, b.maxHp - b.hp); b.hp += d; amt -= d; } }
      recompute(P);
    }
    if (m.trait === 'miner' && calm && slow) {
      app.mineGift = (app.mineGift || 0) + 0.5;
      if (app.mineGift >= 90) {
        app.mineGift = 0;
        const mat = (w.planets?.[0]?.ores?.[0]) || 'ferrite';
        const n = 3 + Math.floor(w.tier / 2);
        const room = (P.stats.cargo || 0) - cargoUsedLocal(G);
        if (room >= n) { G.cargo[mat] = (G.cargo[mat] || 0) + n; app.toast?.(`${m.callsign} brings you ${n} ore.`, 'good'); }
      }
    }
  }
  if (!slow) return;
  // wages
  for (const e of payWages(G)) {
    if (e.t === 'paid') app.toast?.(`Wages paid: ${e.cr.toLocaleString()} cr to ${e.n} mercenar${e.n > 1 ? 'ies' : 'y'}.`);
    if (e.t === 'warn') app.banner?.(`${e.m.callsign} wants paying`, `${e.owed.toLocaleString()} cr within ${Math.round(WAGE_GRACE / 60)} minutes, or they leave.`);
    if (e.t === 'left') { app.banner?.(`${e.m.callsign} has left`, 'You could not pay their wage. Their ship waits in your hangar.'); spawnWing(app); }
  }
  // HUD line (mini stats under the bars): wing count and anyone waiting to be paid
  const fly = list.filter(s => !s.dead).length;
  const late = (G.mercs || []).find(m => m.warnAt != null);
  app.hudWing = (G.mercs || []).length ? `Wing <b>${fly}/${wingSlots(G)}</b>${late ? ` <b class="bad">Pay ${late.callsign} ${Math.max(0, Math.ceil((WAGE_GRACE - ((G.playTime || 0) - late.warnAt)) / 60))} min</b>` : ''}` : '';
}
function cargoUsedLocal(G) { let n = 0; for (const v of Object.values(G.cargo || {})) n += v; for (const v of Object.values(G.goods || {})) n += v; return n; }
void TAU;
