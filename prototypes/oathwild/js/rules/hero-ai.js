// Oathwild — a hero played by the computer. Pure (no DOM, no sockets). Two users:
//   - the balance bots (tests/rules/bot.mjs, tools/sim-fights.mjs, tools/sim-arena.mjs): a player fighting monsters;
//   - the arena's Champions (server/arena.js, brainstorm 2026-11-27 §2g): made-up heroes built and fought exactly like
//     players — a class plan, points, talents, real gear, their bar of abilities, dodge rolls — on the monsters' side.
// Grown from the test bot (2026-11-26 combat rebuild) so champions "play like heroes, not monsters" and the bot tests
// keep using the very same logic.
//
//   buildCharacter(rules, plan, { seed, gearLevel, gearRarity, … })  → a character record (levels, points, talents, gear, bar)
//   fillBar(rules, char) · outfit(rules, char, level, rng, rarity) · botTalents(rules, char)
//   botInput(world, u, { basic, dodge, dodgeSkill, keepIn })   one step's input for a hero unit (any side)
//   championInput(world, u, mem, { tell, specialCooldown, dodgeSkill, keepIn })  a champion's step: botInput + a red mark
//                     before its big abilities (lessons rule 39) + rolls out of heroes' bolts and ground zones
import { createCharacter, levelUp, addXp, xpToReach } from './levels.js';
import { suggestSpend, classDef, castRow, spellSources } from './classes.js';
import { suggestedSpread } from './attributes.js';
import { castRefusal } from './combat.js';
import { makeRng } from './farhold.js';
import { canWear, profSources } from './proficiency.js';
import { takeTalent, talentPointsLeft } from './talents.js';
import { attrTotals } from './sheet.js';
import { gainSkill } from './skills-use.js';
import { planReach } from './casters.js';

/** Talents the bot takes, in order, when it can (the first one it can take each time). */
export const BOT_TALENTS = ['weapon_focus', 'arcane_focus', 'toughness', 'deep_reserves', 'iron_lungs', 'weapon_specialist', 'battle_caster', 'second_wind', 'pack_master', 'fleet_foot'];
export function botTalents(rules, char) {
  for (let g = 0; g < 10 && talentPointsLeft(rules, char) > 0; g++) {
    const ctx = { attrs: attrTotals(rules, char), profs: profSources(rules, char) };
    const id = BOT_TALENTS.find(t => takeTalent(rules, char, t, ctx).ok);
    if (!id) break;
  }
}

/** A character built along `plan` (a list of class ids, one per level after the first), points auto-spent. */
export function buildCharacter(rules, plan, { seed = 1, background = 'farmhand', prefer = [], attrPlan = null, gearLevel = null, gearRarity = 'magic', skills = {}, id = null, name = 'Bot', look = null } = {}) {
  const rng = makeRng(seed);
  const first = plan[0];
  // raise what the planned classes require first, then the main class's attributes
  const req = {};
  for (const c of new Set(plan)) for (const [k, n] of Object.entries(classDef(rules, c).requires?.attrs || {})) req[k] = Math.max(req[k] || 0, n);
  const lastAdv = plan.findLast(c => classDef(rules, c).tier !== 'base') || first;
  const primary = classDef(rules, lastAdv).primary;
  const order = [...new Set([...Object.keys(req).sort((a, b) => req[b] - req[a]), ...primary, ...classDef(rules, first).primary])];
  const attrs = suggestedSpread(rules, order.slice(0, 3));
  const made = createCharacter(rules, { id: id || `hero_${plan.join('_')}_${seed}`, name, look, background, attributes: attrs, cls: first }, rng);
  if (!made.ok) throw new Error(made.why);
  const char = made.char;
  suggestSpend(rules, char, first, { prefer });
  // use-skills the plan needs (a player raises these by doing them: sneaking past camps, picking locks…)
  for (const [k, v] of Object.entries(skills)) for (let g = 0; g < 5000 && (char.skills[k]?.v || 0) < v; g++) gainSkill(rules, char, k, Object.keys(rules.data.skillsUse.skills[k].gain)[0], 5);
  addXp(rules, char, xpToReach(rules, plan.length));
  for (let i = 1; i < plan.length; i++) {
    const cls = plan[i];
    const attr = char.level % 2 === 1 ? (attrPlan?.[i] || primary[0]) : null;
    const r = levelUp(rules, char, { cls, flags: ['pact_sealed', 'barrow_tome', 'gravecutter_contract'], attr: null });
    if (!r.ok) throw new Error(`level ${i + 1} into ${cls}: ${r.why}`);
    if (r.gained.attrPoint) { const k = attr || primary[0]; char.attrSpent[k] = (char.attrSpent[k] || 0) + 1; }
    for (const c of Object.keys(char.classLevels)) suggestSpend(rules, char, c, { prefer });
    botTalents(rules, char);
  }
  if (gearLevel) outfit(rules, char, gearLevel, rng, gearRarity);
  fillBar(rules, char);
  return char;
}

/**
 * The bar a player would set up: the newest class's spells first, then by power (a multiclass hero whose 8 slots were
 * filled by the first classes would otherwise never cast the advanced class's abilities — found 2026-11-26 when the
 * Paladin lost its level-10 fight holding only Warrior and Cleric spells). One heal is kept if the hero has any.
 */
export function fillBar(rules, char) {
  const known = spellSources(rules, char), order = char.classOrder || [];
  const score = id => { const r = castRow(rules, char, id); return (order.indexOf(known[id].cls) + 1) * 100 + (r.mult || 0) * (r.repeats || 1) * 10 + (r.heal || r.healPower ? 5 : 0); };
  const ids = Object.keys(known).sort((a, b) => score(b) - score(a));
  const heal = ids.find(id => { const r = castRow(rules, char, id); return r.healPower || r.heal; });
  const bar = ids.filter(id => castRow(rules, char, id).mult || castRow(rules, char, id).form).slice(0, heal ? 7 : 8);
  if (heal && !bar.includes(heal)) bar.push(heal);
  char.bar = bar.slice(0, rules.data.classes.rules.barSlots);
}

/** Swap the starter kit for level-appropriate items of the same kinds (what a player would have found). */
export function outfit(rules, char, level, rng, rarity = 'magic') {
  for (const [slot, it] of Object.entries(char.gear)) {
    const fresh = rules.rpg.loot.generate(it.baseKey, rarity, rarity === 'normal' ? 'mid' : 'high', { rng, ilvl: level, level });
    if (fresh && canWear(rules, char, fresh, { slot }).ok) char.gear[slot] = fresh;
  }
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** Who a hero fights: every living body of the other side (monsters, pets, and — in the arena — a champion). */
export function foesOf(world, u) {
  const out = [];
  for (const m of world.units.values()) if (m !== u && m.alive && !m.downed && m.side !== u.side && (m.kind === 'monster' || m.kind === 'player' || m.kind === 'pet')) out.push(m);
  return out;
}

/**
 * One bot input for hero `u`. opts: basic (weapon only, no spells), dodge (roll out of a wind-up that is aimed at it
 * and about to land — what a player does when they see the tell; lessons rule 39), dodgeSkill (the share of tells it
 * reacts to), keepIn { x, z, r } (where it may back away to: the sim's open ground, or the arena floor).
 */
export function botInput(world, u, { basic = false, dodge = false, dodgeSkill = 1, keepIn = { x: 0, z: 0, r: 20 } } = {}) {
  if (u.downed) return { respawn: false };
  const foes = foesOf(world, u);
  if (!foes.length) return {};
  // a champion goes for heroes first, a pet only when no hero is about
  const pool = foes.some(m => m.kind !== 'pet') ? foes.filter(m => m.kind !== 'pet') : foes;
  const t = pool.sort((a, b) => dist(a, u) - dist(b, u))[0];
  const d = dist(u, t);
  const dir = [(t.x - u.x) / (d || 1), 0, (t.z - u.z) / (d || 1)];
  const ranged = (u.sheet.holdsRanged || u.sheet.weapon?.weaponCategory === 'magic') && !u.form;
  // a magic weapon fights at its own reach (a ring or a cone of a staff is close work; a wand's bolt is not)
  const reach = u.sheet.caster && !u.form ? planReach(u.sheet.caster) : null;
  const want = reach != null ? Math.min(9, Math.max(1.6, reach * 0.75)) : ranged && !u.form ? 9 : 1.6;
  const roomBehind = Math.hypot(u.x - keepIn.x, u.z - keepIn.z) < keepIn.r;
  const move = d > want + 0.5 ? { x: dir[0], z: dir[2] } : (d < want - 3 && roomBehind ? { x: -dir[0], z: -dir[2] } : null);
  const input = { aim: { origin: [u.x, 1.5, u.z], dir }, move, attack: d < (reach != null ? reach + 0.5 : ranged ? 30 : 3.5) };
  input.target = t;
  if (dodge && !u.dash && !u.rush && u.stamina >= world.rules.data.combat.stamina.dodge) {
    // a wind-up aimed at me that lands within the next 0.2 s: roll sideways and a little back
    // dodgeSkill: the share of tells this player reacts to (a hash of the tell, so the world's dice are untouched)
    const sees = m => dodgeSkill >= 1 || ((Math.imul(Math.round(m.windup.started * 20) + 7, 2654435761) ^ m.id.length * 977) >>> 0) % 1000 < dodgeSkill * 1000;
    // only a SPECIAL blow shows a mark (owner report #137); a plain blow is too quick to react to, so the bot never rolls from it
    const w = foes.find(m => m.windup && m.windup.special !== false && m.windup.target === u.id && m.windup.until - world.t < 0.2 && dist(m, u) < (m.ranged || m.windup.ranged ? 99 : (m.windup.reach || m.reach || 2.2) + 1.5) && sees(m));
    if (w) { const ax = (u.x - w.x) / (dist(u, w) || 1), az = (u.z - w.z) / (dist(u, w) || 1); input.move = { x: az * 0.8 + ax * 0.6, z: -ax * 0.8 + az * 0.6 }; input.dodge = true; return input; }
  }
  if (basic) return input;
  // spells: heal when hurt, otherwise the first damaging one in range that is ready
  // every known spell, biggest cooldown first (a player would arrange their own bar the same way)
  const known = Object.keys(spellSources(world.rules, u.char)).map(id => castRow(world.rules, u.char, id)).sort((a, b) => (b.cooldown || 0) - (a.cooldown || 0)).map(r => r.id);
  for (const id of known) {
    if (castRefusal(world, u, id)) continue;
    const row = castRow(world.rules, u.char, id);
    if (row.form && u.form) continue;
    // a shapeshifter bot fights as the bear when it knows it (the sturdy shape), else the first it has
    if (row.form && known.includes('bear_shape') && id !== 'bear_shape') continue;
    if (row.revive) continue;
    if ((row.heal || row.healPower || row.target === 'ally') && !row.mult) { if (u.hp < u.maxHp * 0.6) { input.cast = { spell: id, at: [u.x, 0, u.z], held: true }; break; } continue; }
    const reach = row.range || row.reach || row.radius || 6;
    if (row.mult && d > reach + 1) continue;
    input.cast = { spell: id, at: [t.x, 0, t.z], held: true };
    break;
  }
  return input;
}

/** A dice roll from a number (a champion's reaction to one threat is decided once, without touching the world's dice). */
const chance = (n, p) => ((Math.imul((n | 0) + 0x9e37, 2654435761) >>> 0) % 1000) < p * 1000;

/**
 * A champion's step. `mem` is its own memory between steps ({} to start). Same as a hero bot, plus:
 *  - a TELL before every ability with a cooldown of `specialCooldown` s or more (and every ground / cone ability): it
 *    stands still for `tell` seconds with `u.windup` set and a `windup` event out (the client draws the red mark, the
 *    hero bots roll from it), then casts at the marked spot — the blow lands where its mark showed (#137);
 *  - rolls (its own dodge) out of a hero's bolt flying at it, a hero's ground zone it stands in, or a hero's leap
 *    landing on it, for `dodgeSkill` of them.
 * Returns { input, events } — the events go into the world's list before the step (server/arena.js, the sim).
 */
export function championInput(world, u, mem, { tell = 0.7, specialCooldown = 5, dodgeSkill = 0.4, keepIn = { x: 0, z: 0, r: 50 } } = {}) {
  const events = [];
  if (u.downed || !u.alive) { mem.tell = null; u.windup = null; return { input: {}, events }; }
  const C = world.rules.data.combat;
  // a tell running: stand, face the mark, cast when it is over
  if (mem.tell) {
    const T = mem.tell;
    const input = { aim: { origin: [u.x, 1.5, u.z], dir: T.dir } };
    if (world.t >= T.until - 1e-9) {
      mem.tell = null; u.windup = null;
      if (castRefusal(world, u, T.spell)) events.push({ at: round2(world.t), t: 'windupEnd', who: u.id, cancelled: true });
      else input.cast = { spell: T.spell, at: T.at, held: true };
      mem.cooldownTell = world.t + 0.8;
    }
    return { input, events };
  }
  // its own rolls: a hero's bolt about to hit, a hero's zone under its feet
  if (!u.dash && !u.rush && u.stamina >= C.stamina.dodge && !(u.dodgeWait > 0)) {
    let away = null, key = 0;
    for (const p of world.projectiles) {
      const o = world.units.get(p.owner); if (!o || o.side === u.side) continue;
      const rx = u.x - p.x, rz = u.z - p.z, ahead = rx * p.dx + rz * p.dz;
      if (ahead < 0 || ahead > 6) continue;
      const side = Math.abs(rx * p.dz - rz * p.dx);
      if (side > 1.6) continue;
      away = { x: -p.dz, z: p.dx }; key = hashId(p.id); break;
    }
    if (!away) for (const z of world.zones) {
      const o = world.units.get(z.owner); if (!o || o.side === u.side || !z.place?.strike) continue;
      const d = Math.hypot(u.x - z.x, u.z - z.z);
      if (d < z.radius) { away = { x: (u.x - z.x) / (d || 1), z: (u.z - z.z) / (d || 1) }; key = hashId(z.id); break; }
    }
    if (away && !mem.seen?.has(key)) {
      (mem.seen = mem.seen || new Set()).add(key);
      if (mem.seen.size > 64) mem.seen = new Set([key]);
      if (chance(key, dodgeSkill)) {
        const base = botInput(world, u, { keepIn });
        return { input: { ...base, cast: null, attack: false, move: away, dodge: true }, events };
      }
    }
  }
  const input = botInput(world, u, { keepIn, dodge: false });
  const t = input.target; delete input.target;
  if (input.cast && t && !(world.t < (mem.cooldownTell || 0))) {
    const row = castRow(world.rules, u.char, input.cast.spell);
    const big = row && row.mult && ((row.cooldown || 0) >= specialCooldown || ['ground', 'cone', 'line'].includes(row.target) || row.shape === 'leap' || row.shape === 'dash' || (row.radius || 0) >= 3);
    if (big) {
      const dir = input.aim.dir;
      const at = [t.x, 0, t.z];
      const placed = row.target === 'ground' || row.shape === 'leap';
      const reach = round2(placed ? (row.radius || 4) : (row.reach || row.range || row.radius || 6));
      const ranged = !placed && (row.shape === 'bolt' || row.shape === 'line' || row.target === 'line' || (row.range || 0) > 12);
      mem.tell = { spell: row.id, at, dir, until: world.t + tell };
      u.windup = { target: t.id, until: world.t + tell, started: world.t, special: true, reach, ranged };
      u.facing = Math.atan2(dir[0], dir[2]);
      events.push({ at: round2(world.t), t: 'windup', who: u.id, to: t.id, seconds: tell, ranged, special: true, reach, arc: round2((row.arc || 1.9)), facing: round2(u.facing), ...(placed ? { ring: { at: [round2(at[0]), round2(at[2])], radius: reach } } : {}), spell: row.id });
      return { input: { aim: input.aim }, events };
    }
  }
  return { input, events };
}
const round2 = v => Math.round(v * 100) / 100;
const hashId = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
