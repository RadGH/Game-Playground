// One-shot powers bought at the Sanctum (owner round 2, R2.3). Data: data/powers.json.
//
//   command power { id, x, z }: pay `cost`, cast at once at (x, z).
//   player.powerCd = { [id]: readyAtTick }
//
// Where a power may land (validated here, refused with a reason):
//   defensive -> inside the caster's own team field      ('ownFieldOnly')
//   offensive -> inside an enemy team's field             ('enemyFieldOnly')
//   neutral   -> inside any field                         ('notInField' if outside every field)
// Powers need no living hero (a way out of a pinch while you wait to respawn). Damage from a power
// is credited to no hero (src null), so hero items never scale it.

import { secToTicks, addTimer } from './state.js';
import { dist2 } from './mathx.js';
import { q2 } from './mathx.js';
import { addStatus } from './statuses.js';
import { addZone } from './zones.js';
import { dealDamage } from './combat.js';
import { spawnUnit } from './economy.js';
import { fieldAt } from './buildings.js';

const P = data => data.powers;

function statusPower(data, id, override) {
  if (override != null) return override;
  const d = data.heroes.statuses[id];
  if (!d) return 0;
  return d.damage ?? d.slow ?? d.takeMore ?? d.move ?? 0;
}

/** Entities in `field` within `r` of (x, z) matching `who` relative to player p. */
function targets(ctx, p, who, field, x, z, r) {
  const out = [];
  for (const e of ctx.state.ents) {
    if (!e.alive || e._gone || e.field !== field) continue;
    let ok;
    if (who === 'enemies') ok = e.team !== p.team;
    else if (who === 'enemyHeroes') ok = e.kind === 'hero' && e.team !== p.team;
    else if (who === 'allyHeroes') ok = e.kind === 'hero' && e.team === p.team;
    else if (who === 'ownUnits') ok = e.kind === 'unit' && e.owner === p.id;
    else throw new Error(`Unknown power target "${who}"`);
    if (!ok) continue;
    const rr = r + e.r;
    if (dist2(e.x, e.z, x, z) <= rr * rr) out.push(e);
  }
  return out;
}

/** Effect handlers: (ctx, p, power id, effect row, at {field, x, z}). */
export const POWER_EFFECTS = {
  zone(ctx, p, id, ef, at) {
    addZone(ctx, { owner: { id: -1, team: p.team, field: at.field }, x: at.x, z: at.z, radius: ef.radius, seconds: ef.seconds,
      perSecond: ef.perSecond || 0, dmgType: ef.dmgType || 'nature', slow: ef.slow || 0, skill: id });
  },
  status(ctx, p, id, ef, at) {
    const pw = statusPower(ctx.data, ef.status, ef.power);
    for (const e of targets(ctx, p, ef.who, at.field, at.x, at.z, ef.radius)) addStatus(ctx, e, ef.status, { ticks: secToTicks(ef.seconds), power: pw, src: -1 });
  },
  heal(ctx, p, id, ef, at) {
    for (const e of targets(ctx, p, ef.who, at.field, at.x, at.z, ef.radius)) {
      const h = Math.min(e.hpMax - e.hp, e.hpMax * ef.pct);
      if (h > 0) { e.hp += h; ctx.emit('heal', { src: -1, dst: e.id, amount: Math.round(h * 10) / 10 }); }
    }
  },
  barrier(ctx, p, id, ef, at) {
    for (const e of targets(ctx, p, ef.who, at.field, at.x, at.z, ef.radius)) addStatus(ctx, e, 'barrier', { ticks: secToTicks(ef.seconds), power: e.hpMax * ef.pct, src: -1 });
  },
  blast(ctx, p, id, ef, at, index) {
    if (ef.delay > 0) { addTimer(ctx.state, ctx.state.tick + secToTicks(ef.delay), 'power', { player: p.id, id, index, field: at.field, x: at.x, z: at.z }); return; }
    blastNow(ctx, p, id, ef, at);
  },
  summon(ctx, p, id, ef, at) {
    const u = ctx.data.derived.units[ef.unit];
    for (let c = 0; c < ef.count; c++) {
      const group = ctx.state.nextGroup++;
      for (let b = 0; b < u.bodies; b++) {
        const dx = (c - (ef.count - 1) / 2) * 1.6 + (b - (u.bodies - 1) / 2) * 0.8;
        spawnUnit(ctx, at.field, p.id, ef.unit, { group, bodies: u.bodies, x: at.x + dx, z: at.z, mk: ef.mk || 1, summon: true });
      }
    }
  },
  reveal(ctx, p, id, ef, at) {
    for (const e of targets(ctx, p, 'enemies', at.field, at.x, at.z, ef.radius)) {
      if (e._traits && e._traits.indexOf('stealth') >= 0) addStatus(ctx, e, 'revealed', { ticks: secToTicks(ef.seconds), src: -1 });
    }
  },
};

function blastNow(ctx, p, id, ef, at) {
  for (const e of targets(ctx, p, 'enemies', at.field, at.x, at.z, ef.radius)) {
    dealDamage(ctx, null, e, ef.amount + (ef.pctMaxHp || 0) * e.hpMax, ef.dmgType || 'fire', { skill: id });
  }
  ctx.emit('powerHit', { player: p.id, power: id, x: at.x, z: at.z, radius: ef.radius });
}

/** Timer: a delayed blast lands. */
export function powerLands(ctx, args) {
  const p = ctx.state.players[args.player];
  const ef = P(ctx.data).powers[args.id].effects[args.index];
  blastNow(ctx, p, args.id, ef, { field: args.field, x: args.x, z: args.z });
}

export function newPowerCooldowns() { return {}; }

/** Why casting power `id` at (x, z) is refused, or null. */
export function powerRefusal(ctx, p, id, x, z) {
  const { state, data, map } = ctx;
  if (state.result) return 'over';
  const def = P(data).powers[id];
  if (!def) return 'bad';
  if (!(typeof x === 'number' && typeof z === 'number' && x === x && z === z && Math.abs(x) < 1e6 && Math.abs(z) < 1e6)) return 'bad';
  const f = fieldAt(map, x, z);
  if (f < 0) return 'notInField';
  const ownField = state.teams[p.team].field;
  if (def.kind === 'defensive' && f !== ownField) return 'ownFieldOnly';
  if (def.kind === 'offensive' && state.fields[f].team === p.team) return 'enemyFieldOnly';
  if (state.tick < (p.powerCd[id] || 0)) return 'cooldown';
  if (p.gold < def.cost) return 'gold';
  return null;
}

export function castPower(ctx, p, id, x0, z0) {
  const why = powerRefusal(ctx, p, id, x0, z0);
  if (why) return why;
  const def = P(ctx.data).powers[id];
  const x = q2(x0), z = q2(z0);
  const at = { field: fieldAt(ctx.map, x, z), x, z };
  p.gold -= def.cost;
  p.stats.powerGold = (p.stats.powerGold || 0) + def.cost;
  p.powerCd[id] = ctx.state.tick + secToTicks(def.cooldown);
  ctx.emit('power', { player: p.id, power: id, kind: def.kind, field: at.field, x, z });
  def.effects.forEach((ef, i) => POWER_EFFECTS[ef.do](ctx, p, id, ef, at, i));
  return null;
}
