// Statuses on any actor (pure): slows, stuns, silences, damage over time, buffs. One list per actor: a.fx = [{ id, kind,
// until, ... }]. Kinds: slow { pct }, stun, silence, dot { per, type, src }, dmgUp { pct }, armourUp { pct }, root.
// The browser predicts its own walking, so a hero's speed factor rides in the snapshot (`spd`) and the client walks with it.
export function addFx(w, a, fx) {
  a.fx ||= [];
  const same = fx.stack ? null : a.fx.find(f => f.id === fx.id);
  if (same) { Object.assign(same, fx, { until: Math.max(same.until, w.time + fx.secs) }); return same; }
  const f = { ...fx, until: w.time + fx.secs, next: w.time + 1 };
  a.fx.push(f);
  w.events.push({ k: 'fx', t: a.id, id: fx.id, kind: fx.kind, secs: fx.secs });
  return f;
}
export const has = (a, kind) => !!a.fx?.some(f => f.kind === kind);
export function speedFactor(a) {
  if (!a.fx?.length) return 1;
  if (a.fx.some(f => f.kind === 'stun' || f.kind === 'root' || f.kind === 'sleep')) return 0;
  let k = 1; for (const f of a.fx) { if (f.kind === 'slow') k *= 1 - Math.min(0.8, f.pct / 100); if (f.kind === 'buff' && f.stat === 'moveSpeed') k *= 1 + Math.min(100, f.pct) / 100; if (f.kind === 'stance' && f.stats?.moveSpeed) k *= 1 + f.stats.moveSpeed / 100; }
  return k;
}
export function dmgFactor(a) { let k = 1; for (const f of a.fx || []) { if (f.kind === 'dmgUp') k *= 1 + f.pct / 100; if (f.kind === 'dmgDown') k *= 1 - f.pct / 100; if (f.kind === 'buff' && f.stat === 'damage') k *= Math.max(0.1, 1 + f.pct / 100); } return k; }
/** An actor with its armour buffs and debuffs applied (buff stat 'armour', in whole percent). */
/** An actor as a monster's blow sees it: armour buffs (percent of armour) and dodge buffs (whole points, stances too). */
export function withArmour(t) {
  let k = 0, dg = 0;
  for (const f of t.fx || []) { if (f.kind === 'buff' && f.stat === 'armour') k += f.pct; if (f.kind === 'buff' && f.stat === 'dodge') dg += f.pct; if (f.kind === 'stance') { k += f.stats?.armour || 0; dg += f.stats?.dodge || 0; } }
  if (!k && !dg) return t;
  return { ...t, armour: Math.max(0, t.armour * (1 + k / 100)), dodge: Math.min(75, (t.dodge || 0) + dg) };
}
/** Expire statuses; tick damage over time through `hurtFn(src, target, amount, type)`. */
export function stepFx(w, a, hurtFn) {
  if (!a.fx?.length) return;
  for (const f of a.fx) if (f.kind === 'dot' && w.time >= f.next) { f.next += 1; hurtFn(f.src, a, f.per, f.type); }
  a.fx = a.fx.filter(f => f.until > w.time);
}
