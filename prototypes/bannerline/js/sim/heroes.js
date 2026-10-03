// Hero stats, XP, death and respawn. Curves: econ.json `hero` (base + per level) x class multipliers
// (`hero.classes`); mechanics (range, speed, mana, slots): heroes.json.

import { secToTicks } from './state.js';
import { damageFactor } from './statuses.js';
import { gearStats, nearKeepFactor, atArmory } from './items.js';
import { activeForm } from './skills.js';

const OUT_OF_COMBAT = 80;   // ticks without damage before regen kicks in

export function heroStats(data, p) {
  const H = data.econ.hero, cls = H.classes[p.hero] || { dpsK: 1, hpK: 1 }, def = data.heroes.heroes[p.hero];
  const L = p.level;
  // equipment (items.js): shop steps add to the dps multiplier, HP and armour exactly as the econ
  // model's step ladder; affixes add their own stats on top
  const g = gearStats(data, p);
  const form = activeForm(data, p);
  const fs = (form && form.stats) || {};
  return {
    dps: (H.dps + H.dpsPerLevel * (L - 1)) * cls.dpsK + g.damage / def.attackEvery,   // items: flat damage per basic attack
    hpMax: ((H.hp + H.hpPerLevel * (L - 1)) * cls.hpK + g.maxHp) * (1 + (fs.maxHpPct || 0)),
    armor: (H.armor + g.armor) * (1 + (fs.armorPct || 0)),
    thorns: fs.thorns || 0,
    movePct: (fs.movePct || 0) + g.moveSpeed / 100,   /* + items (stream I) */ attackSpeedPct: fs.attackSpeedPct || 0,   // a form's speed (Druid Wolf)
    form,
    selfHeal: cls.selfHeal || 0,
    mpMax: def.mp + def.mpPerLevel * (L - 1) + g.mana,
    mpRegen: def.mpRegen + def.mpRegenPerLevel * (L - 1) + g.manaRegen,
    hpRegen: g.hpRegen,
    g,
  };
}

/** Re-read max HP/MP after gear or level changes (keeps the missing amount). */
export function refreshHero(ctx, p) {
  const h = ctx.state.ents.find(e => e.id === p.heroEnt);
  if (!h) return;
  const hs = heroStats(ctx.data, p);
  if (h.alive) { h.hp += hs.hpMax - h.hpMax; h.mp += hs.mpMax - h.mpMax; }
  h.hpMax = hs.hpMax; h.mpMax = hs.mpMax;
  // a form's basic attack (Briarback gores in an arc at its own reach) changes the hero's reach
  const def = ctx.data.heroes.heroes[p.hero];
  h._range = hs.form && hs.form.basic && hs.form.basic.reach ? hs.form.basic.reach : def.range;
}

export function heroPlayer(ctx, hero) { return ctx.state.players[hero.owner]; }

/** One basic attack's damage before statuses. */
export function weaponHit(ctx, hero) {
  const p = heroPlayer(ctx, hero);
  return heroStats(ctx.data, p).dps * ctx.data.heroes.heroes[p.hero].attackEvery;
}

export function heroDamageFactor(ctx, hero) {
  const g = gearStats(ctx.data, heroPlayer(ctx, hero));
  return damageFactor(hero) * (1 + g.dmgPct / 100) * nearKeepFactor(ctx, hero);
}
export function heroArmor(ctx, hero) {
  let a = heroStats(ctx.data, heroPlayer(ctx, hero)).armor;
  for (const s of hero.statuses) if (s.id === 'shred') a -= 3 * s.stacks;   // traits.js K.shredArmor
  return a > 0 ? a : 0;
}

export function xpForLevel(data, level) {
  const t = data.econ.hero.xpTable;
  return level - 1 < t.length ? t[level - 1] : t[t.length - 1];
}
export const maxLevel = data => data.econ.hero.xpTable.length;

export function gainXp(ctx, p, amount) {
  const { data, state } = ctx;
  p.xp += amount;
  const max = maxLevel(data);
  while (p.level < max && p.xp >= data.econ.hero.xpTable[p.level]) {
    const before = heroStats(data, p);
    p.level++;
    p.skillPts++;
    const after = heroStats(data, p);
    const h = state.ents.find(e => e.id === p.heroEnt);
    if (h) {
      h.level = p.level;
      h.hpMax = after.hpMax; h.mpMax = after.mpMax;
      if (h.alive) { h.hp += after.hpMax - before.hpMax; h.mp += after.mpMax - before.mpMax; }
    }
    ctx.emit('levelUp', { player: p.id, level: p.level });
    if (p.level === data.heroes.ranks.talentLevel && p.talent < 0) ctx.emit('talentReady', { player: p.id });
  }
}

export function respawnTicks(data, level) {
  const H = data.econ.hero;
  return secToTicks(Math.min(H.respawnCap, H.respawnBase + H.respawnPerLevel * level));
}

export function heroDied(ctx, hero, src) {
  const { state, data } = ctx;
  const p = heroPlayer(ctx, hero);
  hero.hp = 0; hero.alive = false; hero.target = -1;
  hero.act = 'dead'; hero.actTick = state.tick;
  for (const s of hero.statuses) ctx.emit('status', { id: hero.id, status: s.id, on: false });
  hero.statuses.length = 0;
  hero.respawnAt = state.tick + respawnTicks(data, p.level);
  hero._ord = { k: 'idle', x: 0, z: 0, target: -1, dir: 0, speed: 0 };
  p.stats.deaths++;
  ctx.emit('death', { id: hero.id, killer: src ? src.id : -1, x: hero.x, z: hero.z });
  ctx.emit('heroDown', { player: p.id, respawnTick: hero.respawnAt });
}

/** Respawn, regen. */
export function heroTick(ctx) {
  const { state, data, map } = ctx;
  for (const p of state.players) {
    const h = state.ents.find(e => e.id === p.heroEnt);
    if (!h) continue;
    const hs = heroStats(data, p);
    p.atArmory = atArmory(ctx, p);
    if (!h.alive) {
      if (state.tick >= h.respawnAt) {
        const f = map.fields[h.field];
        h.alive = true; h.respawnAt = -1;
        h.hpMax = hs.hpMax; h.hp = hs.hpMax; h.mpMax = hs.mpMax; h.mp = hs.mpMax;
        h.x = h.px = f.spawn.x; h.z = h.pz = f.spawn.z; h.face = h.pface = Math.PI;
        h.act = 'idle'; h.actTick = state.tick;
        ctx.emit('respawn', { player: p.id, id: h.id });
      }
      continue;
    }
    h.mp = Math.min(h.mpMax, h.mp + hs.mpRegen / 20);
    if (state.tick - h._lastHurt >= OUT_OF_COMBAT) h.hp = Math.min(h.hpMax, h.hp + h.hpMax * data.econ.hero.regen / 20);
    if (hs.hpRegen > 0) h.hp = Math.min(h.hpMax, h.hp + hs.hpRegen / 20);
    if (hs.selfHeal > 0) h.hp = Math.min(h.hpMax, h.hp + h.hpMax * hs.selfHeal / 20);   // Druid: econ classes.druid.selfHeal per second
  }
}
