// Thousandvale — the READERS for the perk forest's own rule nodes (play-test 1, P6).
//
// Farhold's forest flags (riposte, sunder, mark, cauterise, pack, bloodMagic, doubleGrip, farShot)
// and keystone powers (`perk:*`, js/effects.js) are read by Farhold's own code, which Thousandvale
// runs. The forest in data/rules/perks.json adds twenty more rules; every one of them is read HERE
// (or in the one place named beside it), and tests/C/perks.test.mjs fails if a node's flag has no
// reader — a perk that says something and does nothing is the failure this whole project keeps
// finding. Nothing here runs for a character without the flag, so the parity fixtures (no perks)
// see Farhold's numbers.
//
//   strikeMult(attacker, defender, opts)   the hit-time multipliers   (level-gap.js wrapper)
//   afterHurt(field, victim, result, by)   a player was hit             (monster-ai.js monsterStrike)
//   onKill(field, killer, victim)          a player's kill              (cast.js field.onKill)
//   healed(rt, healer, target, amount)     a heal landed (overheal)     (cast-skills.js healUnit)
//   beforeCast / afterCast                 Weave                        (cast-skills.js castSkillPlan)
//   tickPlayer(field, p, dt, second)       stillness, the Banner aura   (index.js step)
// Readers elsewhere: earlyBond (progression.js), quietHand / ironPresence / threatPct (threat.js),
// healPower (cast-skills.js healUnit), dotPct (cast.js landStatus), xpFind (cast.js onKill).

import { applyStatus } from './farhold.js';

/** Every flag this file (or the reader named) answers for. The perk audit reads this list. */
export const TV_FLAG_READERS = Object.freeze({
  earlyBond: 'js/rules/progression.js companionLevels',
  killHaste: 'js/rules/perk-rules.js onKill',
  killBarrier: 'js/rules/perk-rules.js onKill',
  contagion: 'js/rules/perk-rules.js onKill',
  secondWind: 'js/rules/perk-rules.js afterHurt',
  unbroken: 'js/rules/perk-rules.js afterHurt',
  mindWard: 'js/rules/perk-rules.js afterHurt',
  sharedHide: 'js/rules/perk-rules.js afterHurt',
  quietHand: 'js/rules/threat.js threatFromDamage',
  ironPresence: 'js/rules/threat.js threatFromDamage + taunt',
  brimming: 'js/rules/perk-rules.js healed',
  weave: 'js/rules/perk-rules.js weaveRefund',
  finisher: 'js/rules/perk-rules.js strikeMult',
  opener: 'js/rules/perk-rules.js strikeMult',
  packTactics: 'js/rules/perk-rules.js strikeMult',
  bloodScent: 'js/rules/perk-rules.js strikeMult',
  rally: 'js/rules/perk-rules.js tickPlayer + strikeMult',
  stillness: 'js/rules/perk-rules.js tickPlayer + strikeMult',
  vanguard: 'js/rules/perk-rules.js strikeMult',
  cornered: 'js/rules/perk-rules.js strikeMult',
});
/** Thousandvale's own `derived` keys and their readers (Farhold's are read by Farhold's rpg.js). */
export const TV_STAT_READERS = Object.freeze({
  healPower: 'js/rules/cast-skills.js healUnit',
  dotPct: 'js/rules/cast.js landStatus',
  threatPct: 'js/rules/threat.js threatFromDamage',
  xpFind: 'js/rules/cast.js field.onKill (the room awards the experience)',
});

/** The numbers every rule node quotes. One table, so a card can never disagree with the rule. */
export const PERK_RULES = Object.freeze({
  killHaste: { seconds: 1 },
  killBarrier: { share: 0.08, seconds: 6 },
  contagion: { radius: 6 },
  secondWind: { below: 0.35, heal: 0.2, every: 45 },
  unbroken: { every: 90 },
  mindWard: { share: 0.25 },
  sharedHide: { share: 0.3 },
  quietHand: { threat: 0.6 },
  ironPresence: { threat: 1.6, tauntLonger: 2 },
  brimming: { radius: 30 },
  weave: { window: 3 },
  finisher: { below: 0.25, mult: 1.3 },
  opener: { mult: 1.5 },
  packTactics: { mult: 1.25 },
  bloodScent: { mult: 1.2 },
  rally: { radius: 20, mult: 1.06 },
  stillness: { after: 1.5, mult: 1.25 },
  vanguard: { above: 0.8, mult: 1.12 },
  cornered: { below: 0.35, mult: 1.25 },
});
const R = PERK_RULES;

const flagsOf = u => u?.perkFlags || null;
const isDot = st => !!st && (st.perSecond > 0 || st.dps > 0) && st.kind !== 'buff';

/** The perk multipliers for one hit (1 when nothing applies). */
export function strikeMult(attacker, defender, opts = null) {
  if (!attacker || !defender) return 1;
  let k = 1;
  const f = flagsOf(attacker);
  if (f) {
    const frac = defender.maxHp > 0 ? defender.hp / defender.maxHp : 1;
    const own = attacker.maxHp > 0 ? attacker.hp / attacker.maxHp : 1;
    if (f.finisher && opts?.skill && frac < R.finisher.below) k *= R.finisher.mult;
    if (f.opener && defender.side === 'foe' && defender.hp >= defender.maxHp) k *= R.opener.mult;
    if (f.bloodScent && defender.statuses && Object.values(defender.statuses).some(isDot)) k *= R.bloodScent.mult;
    if (f.stillness && (attacker._stillFor || 0) >= R.stillness.after) k *= R.stillness.mult;
    if (f.vanguard && own > R.vanguard.above) k *= R.vanguard.mult;
    if (f.cornered && own < R.cornered.below) k *= R.cornered.mult;
  }
  if (attacker._rally && defender.side === 'foe') k *= R.rally.mult;
  // a follower's bite on whatever its owner hit last
  const owner = attacker.owner;
  if (owner?.perkFlags?.packTactics && owner.lastHitId != null && owner.lastHitId === defender.id) k *= R.packTactics.mult;
  if (attacker.kind === 'player' && defender.side === 'foe') attacker.lastHitId = defender.id;
  return k;
}

/**
 * A player (or follower) was hit by a monster. Runs BEFORE the death is decided, so Unbroken can
 * keep the body standing. `now` = the room clock.
 */
export function afterHurt(field, victim, result, by, now) {
  const f = flagsOf(victim);
  if (!f || !result || !(result.amount > 0) || victim.kind !== 'player') return;
  const cd = victim.perkCd || (victim.perkCd = {});
  const amount = result.amount;
  // Mind over Body: a share of the blow is paid from mana
  if (f.mindWard && victim.mp > 0) {
    const back = Math.min(victim.mp, Math.round(amount * R.mindWard.share));
    victim.mp -= back; victim.hp += back;
  }
  // Shared Hide: your followers take a share of it
  if (f.sharedHide) {
    const pets = field.allies.filter(p => p.owner === victim && p.dying == null && !p.removed && (p.hp ?? 0) > 1);
    if (pets.length) {
      const share = Math.round(amount * R.sharedHide.share);
      const each = Math.max(1, Math.round(share / pets.length));
      for (const p of pets) p.hp = Math.max(1, p.hp - each);
      victim.hp += share;
    }
  }
  // Unbroken: a killing blow leaves you on 1 health, once every 90 s
  if (f.unbroken && victim.hp <= 0 && now >= (cd.unbroken ?? -Infinity)) {
    victim.hp = 1;
    result.dead = false;
    cd.unbroken = now + R.unbroken.every;
    field.emit({ t: 'fx', kind: 'perk', id: victim.id, perk: 'unbroken' });
  }
  // Second Wind: dropping under 35% heals a fifth of your health, once every 45 s
  if (f.secondWind && victim.hp > 0 && victim.hp < victim.maxHp * R.secondWind.below && now >= (cd.secondWind ?? -Infinity)) {
    const heal = Math.round(victim.maxHp * R.secondWind.heal);
    victim.hp = Math.min(victim.maxHp, victim.hp + heal);
    cd.secondWind = now + R.secondWind.every;
    field.emit({ t: 'heal', src: victim.id, dst: victim.id, amt: heal, hp: Math.round(victim.hp) });
    field.emit({ t: 'fx', kind: 'perk', id: victim.id, perk: 'secondWind' });
  }
  if (victim.hp > victim.maxHp) victim.hp = victim.maxHp;
}

/** A kill that `killer` shared in (cast.js onKill runs this for everybody who tagged it). */
export function onKill(field, killer, victim, { statuses = {}, lastHit = false } = {}) {
  const f = flagsOf(killer);
  if (!f) return;
  if (f.killHaste && lastHit) killer.skills?.refresh(R.killHaste.seconds);
  if (f.killBarrier && lastHit) {
    killer.barrier = Math.max(killer.barrier || 0, Math.round(killer.maxHp * R.killBarrier.share));
    killer.castBarrierFor = Math.max(killer.castBarrierFor || 0, R.killBarrier.seconds);
  }
  if (f.contagion && victim.statuses) {
    const dots = Object.entries(victim.statuses).filter(([, st]) => isDot(st) && st.by === killer.id);
    if (dots.length) {
      const next = field.nearestTo(victim.x, victim.z, R.contagion.radius, victim);
      if (next) for (const [type, st] of dots) {
        const e = applyStatus(next, type, statuses[type] || st, st.power || 1);
        if (e) e.by = killer.id;
      }
    }
  }
}

/** A heal landed: Brimming Cup sends what spilled over to the most hurt party member in reach. */
export function healed(field, healer, target, want, gained, heal) {
  if (!flagsOf(healer)?.brimming) return 0;
  const spill = Math.round(want - gained);
  if (spill <= 0) return 0;
  const party = healer.partyId;
  let best = null, bk = 1;
  for (const p of field.players) {
    if (p === target || p.dead || !(p.maxHp > 0)) continue;
    if (p !== healer && (party == null || p.partyId !== party)) continue;
    if (Math.hypot(p.x - target.x, p.z - target.z) > R.brimming.radius) continue;
    const k = p.hp / p.maxHp;
    if (k < bk) { bk = k; best = p; }
  }
  return best ? heal(best, spill) : 0;
}

/** Weave: casting a different skill than the last within the window costs nothing. Returns mana to give back. */
export function weaveRefund(ch, skillId, spent, now) {
  const last = ch.perkLastCast;
  ch.perkLastCast = { id: skillId, at: now };
  if (!flagsOf(ch)?.weave || !(spent > 0) || !last) return 0;
  return last.id !== skillId && now - last.at <= R.weave.window ? spent : 0;
}

/** Once a tick per player: how long it has stood still; once a second: the Banner's aura. */
export function tickPlayer(field, p, dt, second) {
  const lx = p._stillX, lz = p._stillZ;
  if (lx != null && Math.hypot(p.x - lx, p.z - lz) < 0.05) p._stillFor = (p._stillFor || 0) + dt; else p._stillFor = 0;
  p._stillX = p.x; p._stillZ = p.z;
  if (!second) return;
  p._rally = false;
  if (p.partyId == null) { if (flagsOf(p)?.rally) p._rally = true; return; }
  for (const o of field.players) {
    if (o.dead || o.partyId !== p.partyId || !flagsOf(o)?.rally) continue;
    if (Math.hypot(o.x - p.x, o.z - p.z) <= R.rally.radius) { p._rally = true; break; }
  }
}
