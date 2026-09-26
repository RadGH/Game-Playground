// The single place damage happens (docs/10 §3.6, docs/03 §2.1 + §14). Writes one meter record per hit
// (meters/js/meter.js shape) and emits hit/kill events. Pure.
export const FLAME_KEYS = ['physical', 'ember', 'rime', 'spark', 'bile', 'gleam', 'tide', 'shade'];

/**
 * hit: { source (actor), target (actor), amount, flame ('physical' or flame id), via, viaName, crit?, critMult?,
 *        knock?: {x, y}, tags?: [], dot?: bool, noStatusAmp?: bool, itemId? }
 * returns the amount taken
 */
export function dealDamage(game, hit) {
  const t = hit.target; if (!t || t.dead || t.hp <= 0) return 0;
  if (t.invuln > 0 && !hit.dot) return 0;
  const flame = hit.flame || 'physical';
  // 'heal' resistance: this flame heals the target instead (docs/03 §14)
  if (t.resist?.[flame] === 'heal') { heal(game, hit.source || { id: 'world', name: '' }, t, hit.amount, hit.via, hit.viaName); game.bus?.emit('resist.heal', { target: t, flame }); return 0; }
  const res = (t.resist?.[flame] ?? 0) + (t.statuses?.corrode ? -5 * t.statuses.corrode.stacks : 0);
  let armour = Math.max(0, (t.armour || 0) - (t.statuses?.corrode ? 8 * t.statuses.corrode.stacks : 0) - (hit.armourPierce || 0));
  if (t.statuses?.cracked) armour = Math.max(0, armour - 20);
  const armourF = flame === 'shade' ? 1 : 100 / (100 + armour);
  let amp = 1;
  if (!hit.noStatusAmp && t.statuses?.shocked) amp *= 1.15;
  if (t.statuses?.cracked) amp *= 1.25;
  if (flame === 'spark' && t.statuses?.soaked) amp *= 1.5;
  if (flame === 'gleam' && t.tags?.includes('unlit')) amp *= 2;
  if (hit.source?.statuses?.drained) amp *= 0.85;
  let crit = !!hit.crit;
  if (hit.critChance && !hit.dot && (game.rng?.spell?.next() ?? Math.random()) < hit.critChance) crit = true;
  let amount = hit.amount * (1 - Math.max(-100, Math.min(100, res)) / 100) * armourF * amp * (crit ? (hit.critMult || 1.5) : 1);
  if (t.kind === 'player' && game.difficulty) amount *= game.difficulty.damageTaken ?? 1;
  if (t.shield > 0) { const a = Math.min(t.shield, amount); t.shield -= a; amount -= a; }
  amount = Math.max(0, amount);
  const before = t.hp; t.hp = Math.max(0, t.hp - amount); if (amount > 0) t.lastSource = hit.source;
  const overkill = Math.max(0, amount - before);
  const killingBlow = before > 0 && t.hp <= 0;
  if (hit.knock && t.kind !== 'boss') { const kb = 1 - (t.kbResist || 0); t.vx += hit.knock.x * kb; t.vy += hit.knock.y * kb; if (t.kind === 'player') t.knockT = 0.2; }
  if (amount > 0 && !hit.dot) t.hurtFlash = 0.12;
  if (t.kind === 'player' && amount > 0 && !hit.dot) { t.invuln = game.data?.movesets?.shared?.invulnAfterHit ?? 0.6; t.hurtT = 0.2; }
  // meter
  const src = hit.source || { id: 'world', name: 'The Hollow' };
  game.meter?.record({ t: game.tick / 60, source: src.id, sourceName: src.name, target: t.id, targetName: t.name, kind: 'damage', amount, overkill, crit,
    dtype: meterType(flame), via: hit.via || 'attack', viaName: hit.viaName || 'Attack', itemId: hit.itemId, killingBlow, tags: hit.tags || [] });
  game.bus?.emit('hit', { source: src, target: t, amount, crit, flame, via: hit.via, x: t.x, y: t.y - (t.h || 10) / 2, dot: !!hit.dot });
  if (killingBlow) {
    if (t.kind === 'player') { game.bus?.emit('player.die', { source: src, via: hit.via }); }
    else { t.dead = true; game.bus?.emit('kill', { source: src, target: t, via: hit.via, overkill }); game.meter?.record({ t: game.tick / 60, source: t.id, sourceName: t.name, target: t.id, targetName: t.name, kind: 'death', amount: 0, dtype: 'physical', via: hit.via || 'attack', viaName: hit.viaName || '' }); }
  }
  return amount;
}
export function heal(game, source, target, amount, via = 'heal', viaName = 'Heal') {
  if (!target || target.dead) return 0;
  const room = (target.maxHp || 100) - target.hp; const h = Math.min(room, amount);
  target.hp += h;
  game.meter?.record({ t: game.tick / 60, source: source.id, sourceName: source.name, target: target.id, targetName: target.name, kind: 'heal', amount: h, overheal: amount - h, dtype: 'holy', via, viaName });
  game.bus?.emit('heal', { target, amount: h, x: target.x, y: target.y - (target.h || 10) });
  return h;
}
const MT = { physical: 'physical', ember: 'fire', rime: 'frost', spark: 'lightning', bile: 'poison', gleam: 'holy', tide: 'water', shade: 'shadow' };
export const meterType = f => MT[f] || f;
