// The wick compiler (docs/03 §2): Flame + Shape + Charms (+ burn-in, overcharge, character) -> a flat
// CastPlan of numbers. Pure; the same function feeds the game, the builder preview and the balance sim.

// Burn-in (canon v2): two tracks, one per flame and one per shape, 5 levels each, +3% power per level.
export const BURN_THRESHOLDS = [0, 200, 600, 1500, 3500];
export function burnLevel(oilSpent = 0) { let l = 1; for (let k = 1; k < BURN_THRESHOLDS.length; k++) if (oilSpent >= BURN_THRESHOLDS[k]) l = k + 1; return l; }
/** burn = { flame: { ember: oil }, shape: { bolt: oil } } on the hero; returns the two levels. */
export function burnLevels(burn, flame, shape) { return { flame: burnLevel(burn?.flame?.[flame] || 0), shape: burnLevel(burn?.shape?.[shape] || 0) }; }

/** Returns null when legal, or a reason string (shown in the builder). */
export function validateWick(wick, data, unlocks = null, charmSlots = 3) {
  const f = data.flames.byId[wick.flame], s = data.shapes.byId[wick.shape];
  if (!f) return `Unknown flame ${wick.flame}.`; if (!s) return `Unknown shape ${wick.shape}.`;
  const charms = wick.charms || [];
  if (charms.length > charmSlots) return `Only ${charmSlots} charm slot${charmSlots === 1 ? '' : 's'} so far.`;
  if (new Set(charms).size !== charms.length) return 'A wick cannot hold the same charm twice.';
  for (const c of charms) {
    const ch = data.charms.byId[c]; if (!ch) return `Unknown charm ${c}.`;
    if (ch.notOn?.includes(wick.shape)) return `${ch.name} does nothing on a ${s.name}.`;
    if (unlocks && !unlocks.charms?.includes(c)) return `You have not found the ${ch.name} strand yet.`;
  }
  for (const [a, b] of data.charms.exclusive || []) if (charms.includes(a) && charms.includes(b)) return `${data.charms.byId[a].name} and ${data.charms.byId[b].name} cannot share a wick.`;
  if (unlocks && !unlocks.flames?.includes(wick.flame)) return `You have not found the ${f.name} strand yet.`;
  if (unlocks && !unlocks.shapes?.includes(wick.shape)) return `You have not found the ${s.name} strand yet.`;
  return null;
}

/**
 * @param wick  { flame, shape, charms: [], burn: oilSpent }
 * @param hero  { level, spellPower (0.02 per Wick point), gearSpellPct, flamePct: {flame: pct} }
 * @param opts  { overcharge: 1..2, still: bool }
 */
export function compileWick(wick, data, hero = {}, opts = {}) {
  const f = data.flames.byId[wick.flame], s = data.shapes.byId[wick.shape];
  const charms = (wick.charms || []).map(id => data.charms.byId[id]).filter(Boolean);
  const prod = key => charms.reduce((m, c) => m * (c[key] ?? 1), 1);
  const has = id => charms.some(c => c.id === id);
  let dmgMult = Math.min(1.8, Math.max(0.35, prod('dmg') * (has('steady') && opts.still ? 1.2 : 1)));
  const oilMult = Math.min(2.5, prod('oil'));
  const level = hero.level || 1;
  const castScale = (1 + 0.04 * (level - 1)) * (1 + (hero.spellPower || 0)) * (1 + (hero.gearSpellPct || 0) + (hero.flamePct?.[f.id] || 0));
  const oc = Math.max(1, Math.min(2, opts.overcharge || 1));
  const ocPower = 1 + 0.8 * Math.pow(oc - 1, 0.7);
  const lv = opts.burn ? burnLevels(opts.burn, f.id, s.id) : { flame: burnLevel(wick.burn || 0), shape: burnLevel(wick.burn || 0) };
  const bl = Math.max(lv.flame, lv.shape), burnIn = (1 + 0.03 * (lv.flame - 1)) * (1 + 0.03 * (lv.shape - 1));
  const power = f.power * s.mult * dmgMult * castScale * ocPower * burnIn;
  const oil = Math.max(2, Math.round(s.oil * f.oilMult * oilMult * oc * 2) / 2);
  const plan = {
    flame: f.id, shape: s.id, charms: charms.map(c => c.id), color: f.color, meterType: f.meterType, status: f.status,
    damage: power, oil, perSecond: !!s.perSecond,
    cooldown: Math.max(0.12, s.cooldown * prod('cd') * (1 - (hero.haste || 0))),
    castTime: (s.castTime || 0) * prod('cast'),
    speed: (s.speed || 0) * prod('speed'), gravity: s.gravity || 0,
    size: Math.max(1, Math.round((s.size || 1) * prod('size') * (1 + 0.25 * (oc - 1)))),
    lifetime: (s.lifetime || 1) * prod('life'), length: s.length || 0, range: s.range || 0, tickRate: s.tickRate || 0, sweep: s.sweep || 0, maxOut: s.maxOut || 0, armTime: s.armTime || 0,
    dig: (s.dig || 0) + (has('heavy') ? 1 : 0), knock: has('heavy') ? 2 : 1,
    count: has('split') ? 3 : 1, spread: has('split') ? 12 : 0,
    bounces: has('bounce') ? 2 : 0, pierce: has('pierce') ? 3 : 0, seek: has('seek') ? 240 : 0,
    linger: has('linger') ? 3 : 0, volatile: has('volatile') ? 16 : 0, echo: has('echo') ? { delay: 0.35, power: 0.6 } : null,
    siphon: has('siphon') ? { oil: 0.08, hp: 0.04 } : null, steady: has('steady'),
    light: { r: s.light * Math.abs(f.lightMult) * (has('vast') ? 1.5 : 1) * (1 + 0.04 * (bl - 1)), i: f.lightIntensity * (1 + 0.1 * (bl - 1)) * (oc > 1 ? 1 + 0.5 * (oc - 1) : 1), negative: f.lightMult < 0, flicker: f.flicker },
    burnLevel: bl, burn: lv, overcharge: oc,
  };
  if (has('vast')) plan.chainBonus = 1;
  plan.dps = plan.perSecond ? plan.damage * plan.tickRate : plan.damage * plan.count / plan.cooldown;
  plan.perOil = plan.perSecond ? (plan.damage * plan.tickRate) / plan.oil : (plan.damage * plan.count * (plan.echo ? 1.6 : 1)) / plan.oil;
  return plan;
}

/** Default wick name (docs/03 §16.2). */
const CHARM_NOUNS = { split: 'Choir', seek: 'Moth', heavy: 'Anvil', swift: 'Sparrow', vast: 'Bell', echo: 'Twins', linger: 'Mourner', volatile: 'Powderkeg', pierce: 'Needle', bounce: 'Gutter', siphon: 'Leech', steady: 'Watch' };
export function wickName(wick, data) {
  if (wick.name) return wick.name;
  const f = data.flames.byId[wick.flame]?.name || wick.flame, s = data.shapes.byId[wick.shape]?.name || wick.shape;
  const c = wick.charms || [];
  return c.length >= 2 ? `${f} ${s} of the ${CHARM_NOUNS[c[0]] || 'Lamp'}` : c.length === 1 ? `${CHARM_NOUNS[c[0]] || ''} ${f} ${s}`.trim() : `${f} ${s}`;
}
