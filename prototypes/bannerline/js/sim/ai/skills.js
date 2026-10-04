// Stream E — the AI's skills: learn order, the level-6 talent, and when / where to cast each skill.
//
// Hero tier (data/ai.json `hero.tier`):
//   0 (Recruit)   learns in a random order, picks a random talent, casts a ready skill on a dice roll
//                 at whatever is nearest, wastes area skills on one or two bodies, toggles shapes at random
//   1 (Veteran)   a fixed generic order (ult first), area skills at 2-3 bodies, sensible shapes
//   2 (Commander) a per-hero order and talent, area skills aimed at the densest cluster in range, skill
//                 sequencing (Firebolt stacks Burning before Flashover sets it off; Quarry before Arrow
//                 Storm), Wolf / Briarback chosen for the fight in front of it, turrets and mines on the
//                 path the next wave will walk, repairs, Overcharge when the guns have targets, leaps
//                 and Grapnel as escapes
//
// Casts go out as `cast { slot, x, z }`; castRefusal is checked first.

import { next, int } from '../rng.js';
import { learnRefusal, castRefusal } from '../skills.js';
import { planFor } from '../talents.js';
import { dist2 } from '../mathx.js';
import { live, bestCluster } from './read.js';

const ORDER_GENERIC = ['R', 'Q', 'W', 'E', 'D'];
const ORDER = {
  warrior:    ['R', 'Q', 'D', 'E', 'W'],
  ranger:     ['R', 'E', 'Q', 'W', 'D'],
  pyromancer: ['R', 'Q', 'E', 'W', 'D'],
  druid:      ['R', 'Q', 'E', 'W', 'D'],   // Wolf (E) early: it is a second kit, not a skill rank
  engineer:   ['R', 'Q', 'W', 'E', 'D'],
};
// Commander talents (index into the hero's two choices): the one that clears lanes
const TALENT = { warrior: 0, ranger: 0, pyromancer: 0, druid: 0, engineer: 0 };

export function learnCommands(ctx, p, K, rng, cmd) {
  const { data } = ctx;
  let pts = p.skillPts;
  const ranks = {};
  for (const s of p.skills) ranks[s.slot] = s.rank;
  const view = () => ({ ...p, skillPts: pts, skills: p.skills.map(s => ({ ...s, rank: ranks[s.slot] })) });
  while (pts > 0) {
    let slot = null;
    if (K.hero.tier === 0) {
      const ok = p.skills.map(s => s.slot).filter(sl => learnRefusal(data, view(), sl) === null);
      if (ok.length) slot = ok[int(rng, ok.length)];
    } else {
      const order = K.hero.tier >= 2 ? (ORDER[p.hero] || ORDER_GENERIC) : ORDER_GENERIC;
      // Commander: every skill at rank 1 first (a whole kit beats a deep one), then the order
      if (K.hero.tier >= 2) slot = order.find(sl => ranks[sl] === 0 && learnRefusal(data, view(), sl) === null) || null;
      if (!slot) slot = order.find(sl => learnRefusal(data, view(), sl) === null) || null;
    }
    if (!slot) break;
    cmd('learn', { slot }); ranks[slot]++; pts--;
  }
  if (p.talent < 0 && p.level >= data.heroes.ranks.talentLevel) {
    const choice = K.hero.tier === 0 ? int(rng, 2) : K.hero.tier >= 2 ? (TALENT[p.hero] ?? 0) : 0;
    cmd('talent', { choice });
  }
}

function enemiesNear(ents, x, z, r) {
  let n = 0;
  const r2 = r * r;
  for (const e of ents) if (dist2(x, z, e.x, e.z) <= (r + e.r) * (r + e.r) || dist2(x, z, e.x, e.z) <= r2) n++;
  return n;
}
const turretsOf = (state, pid) => state.ents.filter(e => e.kind === 'turret' && e.owner === pid && live(e));
const petsOf = (state, pid) => state.ents.filter(e => e.kind === 'pet' && e.owner === pid && live(e));

/**
 * Cast at most one skill this think. `foes` = visible enemies in the hero's field, `target` = what the
 * hero is fighting (may be null), `S` = the situation (lane, guard spot, threat).
 */
export function castCommands(ctx, p, K, rng, hero, foes, target, S, cmd) {
  const { state, data, map } = ctx;
  const tier = K.hero.tier;
  const f = map.fields[hero.field];
  const hp = hero.hp / hero.hpMax;
  const meleeOn = foes.filter(e => e._range <= 3 && dist2(hero.x, hero.z, e.x, e.z) <= 9).length;
  const crowd = r => enemiesNear(foes, hero.x, hero.z, r);
  // shape changes are decided first (they change what every other key does), then the slots in order
  const order = p.skills.slice();
  const shapes = order.filter(sk => data.heroes.skills[sk.id].form), rest = order.filter(sk => !data.heroes.skills[sk.id].form);
  for (const sk of tier >= 1 ? shapes.concat(rest) : order) {
    if (castRefusal(ctx, p, sk.slot)) continue;
    if (next(rng) > K.hero.skillChance) continue;
    const plan = planFor(data, p, sk.id);
    const cast = (x, z) => { cmd('cast', x == null ? { slot: sk.slot } : { slot: sk.slot, x, z }); return true; };

    // ── shapes (Druid Wolf / Briarback) ──
    if (plan.form) {
      const id = plan.form.id;
      if (tier === 0) { if (next(rng) < 0.15) return cast(); continue; }
      if (p.form === id) {
        // leave a shape when it no longer fits the fight
        if (id === 'wolf' && (crowd(5) >= 4 || hp < 0.35)) return cast();
        if (id === 'briarback' && crowd(6) === 0 && hp > 0.7) return cast();
        continue;
      }
      if (p.form && p.form !== id) continue;   // the other shape's key is a wolf skill now
      if (id === 'briarback' && (crowd(5) >= 3 && (tier < 2 || hp < 0.6 || meleeOn >= 3))) return cast();
      if (id === 'wolf' && tier >= 2 && target && crowd(6) <= 2 && hp > 0.5) {
        // a runner slipping toward the Keep, or a single big body: bite it down
        const far = dist2(hero.x, hero.z, target.x, target.z) > 36;
        if (far || target.hp > 1500 || target._spd >= 4.4) return cast();
      }
      continue;
    }
    if (plan.shape === 'turret') {
      const T = plan.turret, have = turretsOf(state, p.id).length;
      const max = T.max[Math.max(0, Math.min(T.max.length, sk.rank) - 1)];
      if (have >= max && !(tier >= 2 && have > 0 && turretsOf(state, p.id).some(t => dist2(t.x, t.z, hero.x, hero.z) > 400))) continue;
      if (tier === 0) return cast(hero.x + (next(rng) - 0.5) * 6, hero.z - 2);
      // on the wave's path: between the hero and the gate side, in the lane; Commander staggers them
      const lx = S.laneX;
      const ahead = tier >= 2 ? 5 : 3;
      const tx = target ? hero.x + (target.x - hero.x) * 0.4 : lx;
      const spread = tier >= 2 ? (have % 3 - 1) * 3 : 0;
      return cast(Math.max(f.x0 + 2, Math.min(f.x1 - 2, (tx + lx) / 2 + spread)), Math.max(f.z0 + 4, hero.z - ahead));
    }
    if (plan.repair) {
      const hurt = turretsOf(state, p.id).filter(t => t.hp < t.hpMax * 0.6 && dist2(t.x, t.z, hero.x, hero.z) <= plan.repair.radius * plan.repair.radius).length;
      if (hurt >= 1 || hp < 0.5) return cast();
      continue;
    }
    if (plan.turretBuff) {
      const guns = turretsOf(state, p.id);
      const busy = guns.filter(g => enemiesNear(foes, g.x, g.z, g._range) >= (tier >= 2 ? 2 : 3)).length;
      if (busy >= Math.min(2, guns.length) && guns.length) return cast();
      continue;
    }
    if (plan.shape === 'summon') {
      const d = plan.pet ? data.heroes.pets[plan.pet] : null;
      if (d) { if (petsOf(state, p.id).length < d.max && (foes.length || tier < 2)) return cast(target ? target.x : hero.x, target ? target.z : hero.z); continue; }
      // a howl / Den Guard (shape versions): when fighting
      if (crowd(8) >= 2) return cast(hero.x, hero.z);
      continue;
    }
    if (!target) {
      // self buffs with no target: Cinder Stride / Pack Run to get back to the lane fast
      if (tier >= 2 && plan.shape === 'self' && plan.selfBuff && plan.selfBuff.movePct > 0 && S.farFromPost) return cast();
      continue;
    }
    const td2 = dist2(hero.x, hero.z, target.x, target.z);
    const range = plan.range || 0;
    if (plan.shape === 'dash') {
      if (plan.dash && plan.dash.to === 'back') { if (meleeOn >= 2 || (tier >= 2 && meleeOn >= 1 && hp < 0.5)) return cast(target.x, target.z); continue; }
      // a leap at a target (Throat Leap / Grapnel): chase a leaker, or escape toward the Keep when low
      if (tier >= 2 && hp < 0.35 && meleeOn >= 2 && plan.mult < 0.5) return cast(hero.x, Math.min(f.leakZ - 3, hero.z + 8));
      const rr = (plan.dash && plan.dash.range) || range || 6;
      if (td2 > 9 && td2 <= rr * rr && (tier < 2 || target.z > hero.z || p.form === 'wolf')) return cast(target.x, target.z);
      continue;
    }
    if (plan.shape === 'ground' && plan.place) {
      // traps on the path: just ahead of where the leading enemies will be
      if (tier === 0) { if (td2 <= range * range) return cast(target.x, target.z); continue; }
      const lead = S.leadFoe || target;
      const ax = lead.x, az = Math.min(f.leakZ - 2, lead.z + (tier >= 2 ? 3 : 2));
      if (dist2(hero.x, hero.z, ax, az) <= range * range) return cast(ax, az);
      continue;
    }
    if (plan.shape === 'ground') {
      const r = plan.line ? plan.line.length / 2 : plan.radius || 3;
      let at = { x: target.x, z: target.z, n: 0 };
      if (tier >= 2) {
        const inRange = foes.filter(e => dist2(hero.x, hero.z, e.x, e.z) <= (range + r) * (range + r));
        at = bestCluster(inRange, r);
      } else at.n = enemiesNear(foes, target.x, target.z, r);
      if (dist2(hero.x, hero.z, at.x, at.z) > range * range) continue;
      const CN = K.hero.castNeed;   // [short cooldown, long cooldown] bodies an area skill must catch
      let need = CN ? (plan.cooldown >= 18 ? CN[1] : CN[0]) : plan.cooldown >= 18 ? 4 : 2;
      if (plan.detonate) {
        // Flashover: only worth it on Burning targets
        const burning = foes.filter(e => dist2(at.x, at.z, e.x, e.z) <= r * r && e.statuses.some(s => s.id === 'burn')).length;
        if (tier >= 2 && burning < 2 && foes.length > 1) continue;
      }
      if (plan.consumes && tier >= 2) {
        const marked = foes.filter(e => dist2(at.x, at.z, e.x, e.z) <= r * r && e.statuses.some(s => s.id === 'quarry')).length;
        if (marked === 0 && at.n < need + 2) continue;
      }
      if (!CN && tier === 0) need = 1;
      if (!CN && tier === 1 && plan.cooldown >= 18) need = 3;
      // a big single target is worth a big skill too (Commander)
      if (tier >= 2 && at.n < need && target.hp > 3000 && dist2(hero.x, hero.z, target.x, target.z) <= range * range) return cast(target.x, target.z);
      if (at.n >= need) return cast(at.x, at.z);
      continue;
    }
    if (plan.shape === 'bolt') {
      if (td2 > range * range) continue;
      // Commander aims a splash bolt at the densest bit near its target
      if (tier >= 2 && (plan.splash || plan.projectiles > 1)) {
        const near = foes.filter(e => dist2(hero.x, hero.z, e.x, e.z) <= range * range);
        const c = bestCluster(near, plan.splash || 3);
        if (c.n >= 2) return cast(c.x, c.z);
      }
      if (plan.projectiles > 1 && tier >= 1 && enemiesNear(foes, target.x, target.z, 5) < 2) continue;
      return cast(target.x, target.z);
    }
    if (plan.shape === 'melee') {
      const reach = (plan.reach || 2) + target.r + hero.r;
      if (td2 > reach * reach) continue;
      if (plan.knock && tier >= 2) {
        // shove units back up the field, not into the Keep: only when the target is between us and the gate
        if (target.z > hero.z + 0.5 && enemiesNear(foes, hero.x, hero.z, 4) < 3) continue;
      }
      return cast(target.x, target.z);
    }
    if (plan.shape === 'around') {
      const n = crowd(plan.radius || 4);
      const CN = K.hero.castNeed;
      const need = CN ? (plan.cooldown >= 12 ? CN[1] : CN[0]) : tier === 0 ? 1 : tier >= 2 ? (plan.cooldown >= 12 ? 4 : 2) : (plan.cooldown >= 12 ? 3 : 2);
      if (n >= need || (tier >= 2 && n >= 1 && target.hp > 2500)) return cast(hero.x, hero.z);
      continue;
    }
    if (plan.shape === 'self') {
      if (plan.taunt) {
        // War Cry / Den Guard: pull the bodies walking past onto me (Commander: when they are slipping by)
        const r = plan.taunt.radius || 6;
        const passing = foes.filter(e => dist2(hero.x, hero.z, e.x, e.z) <= r * r && e.target !== hero.id).length;
        if (passing >= (tier >= 2 ? 3 : 4) && (tier < 2 || hp > 0.45)) return cast();
        continue;
      }
      if (plan.selfBuff && plan.selfBuff.resistPerFoe) { if (crowd(plan.selfBuff.resistPerFoe.radius) >= (tier >= 2 ? 3 : 4)) return cast(); continue; }
      if (plan.status === 'regen' || plan.barrier || (plan.selfBuff && plan.selfBuff.reflect)) { if (hp < (tier >= 2 ? 0.65 : 0.5)) return cast(); continue; }
      if (plan.trail) { if (crowd(4) >= 3 || (tier >= 2 && hp < 0.4)) return cast(); continue; }
      if (plan.selfBuff && plan.selfBuff.movePct > 0) { if (S.farFromPost || (target && td2 > 64)) return cast(); continue; }
      if (crowd(6) >= 3) return cast();
      continue;
    }
  }
  return false;
}
