// The Keep guard (line war, feel pass 2026-10-03): the Keep shoots. Like the old lane-war maps' towers
// by the castle, it splashes whatever reaches the last stretch of the field, so a swarm of cheap
// tier-1 bodies melts on the Keep while big units walk through it. Nothing about SENDING is limited:
// it only changes what is worth sending. Data: maps.json `keep.guard`:
//   { range, every (s), damage, damagePerMinute, splash (radius), dmgType }
// Damage grows with match time, so tier 2 is shredded later in the game too. Kills pay the normal bounty.
// Events: keepShot { field, x, z, radius } (draw a bolt from the Keep and a blast at x, z).

import { dist2 } from './mathx.js';
import { dealDamage } from './combat.js';
import { secToTicks } from './state.js';

export function keepGuardTick(ctx) {
  const { state, data, map } = ctx;
  for (const f of map.fields) {
    const G = f.keep.guard;
    if (!G) continue;
    if (state.tick % Math.max(1, secToTicks(G.every)) !== 0) continue;
    const team = state.fields[f.id].team;
    const r2 = G.range * G.range;
    // aim at the enemy body closest to the leak line inside range (ties: lowest id)
    let target = null;
    for (const e of state.ents) {
      if (!e.alive || e._gone || e.field !== f.id || e.team === team || (e.kind !== 'unit' && e.kind !== 'tide')) continue;
      if (dist2(e.x, e.z, f.keep.x, f.keep.z) > r2) continue;
      if (!target || e.z > target.z) target = e;
    }
    if (!target) continue;
    const dmg = G.damage + G.damagePerMinute * (state.tick / 1200);
    const s2 = G.splash * G.splash, tx = target.x, tz = target.z;
    ctx.emit('keepShot', { field: f.id, x: tx, z: tz, radius: G.splash });
    for (const e of state.ents) {
      if (!e.alive || e._gone || e.field !== f.id || e.team === team || (e.kind !== 'unit' && e.kind !== 'tide')) continue;
      if (dist2(e.x, e.z, tx, tz) <= s2) dealDamage(ctx, null, e, dmg, G.dmgType || 'pierce', { skill: 'keep' });
    }
  }
}
