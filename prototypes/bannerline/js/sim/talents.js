// Cast plans: a skill row + rank scaling + the picked talent's mod folded in. Pure; returns a fresh
// plain object each call (cheap: skill rows are tiny).
//
// Mod keys (PLAN §6.3): set (dotted paths allowed), add, mul, knock (merge), pullIn (replace),
// pool (replace), statuses (append), forms (merge). Unknown keys throw: build-hero-skills.mjs stops
// them before they reach data, and this is the runtime backstop.

import { gearStats } from './items.js';

export const MOD_KEYS = ['set', 'add', 'mul', 'knock', 'pullIn', 'pool', 'statuses', 'forms'];

const clone = o => JSON.parse(JSON.stringify(o));

function setPath(obj, path, v) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) { if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {}; o = o[parts[i]]; }
  o[parts[parts.length - 1]] = v;
}

export function applyMod(plan, mod) {
  for (const k of Object.keys(mod)) {
    const v = mod[k];
    switch (k) {
      case 'set': for (const p of Object.keys(v)) setPath(plan, p, clone(v[p])); break;
      // `projectiles` counts bolts, so a skill without the key already fires one
      case 'add': for (const p of Object.keys(v)) plan[p] = (plan[p] ?? (p === 'projectiles' ? 1 : 0)) + v[p]; break;
      case 'mul': for (const p of Object.keys(v)) plan[p] = (plan[p] ?? 1) * v[p]; break;
      case 'knock': plan.knock = Object.assign({}, plan.knock || {}, clone(v)); break;
      case 'pullIn': plan.pullIn = clone(v); break;
      case 'pool': plan.pool = clone(v); break;
      case 'statuses': plan.statuses = (plan.statuses || []).concat(clone(v)); break;
      case 'forms': break;   // per-form talent mods are applied by planFor while the hero is in that form
      default: throw new Error(`Unknown talent mod key "${k}"`);
    }
  }
  return plan;
}

/** The plan a player's cast of skillId uses right now. */
export function planFor(data, p, skillId) {
  const row = data.heroes.skills[skillId];
  if (!row) throw new Error(`Unknown skill "${skillId}"`);
  const plan = clone(row);
  plan.id = skillId;
  const sk = p.skills.find(s => s.id === skillId);
  const rank = sk ? Math.max(1, sk.rank) : 1;
  const R = data.heroes.ranks;
  if (plan.mult != null) plan.mult *= 1 + R.multPerRank * (rank - 1);
  plan.cooldown *= 1 - R.cdPerRank * (rank - 1);
  const t = data.heroes.heroes[p.hero].talent;
  const tmod = t && p.talent >= 0 && t.skill === skillId ? t.choices[p.talent].mod : null;
  if (tmod) applyMod(plan, tmod);
  // a shape-changing form (Druid Briarback) overrides the skill while it lasts: keys in the form's
  // block replace the base, `null` removes one; the talent's per-form mod applies on top
  const forms = plan.forms;
  delete plan.forms;
  if (p.form && forms && forms[p.form]) {
    const f = forms[p.form];
    for (const k of Object.keys(f)) { if (f[k] === null) delete plan[k]; else plan[k] = clone(f[k]); }
    if (tmod && tmod.forms && tmod.forms[p.form]) applyMod(plan, tmod.forms[p.form]);
    plan.formOf = p.form;
  }
  // equipment: skill area and cooldowns (items.js affixes)
  const g = gearStats(data, p);
  if (g.areaPct) {
    const k = 1 + g.areaPct / 100;
    for (const key of ['radius', 'reach', 'splash']) if (plan[key] != null) plan[key] *= k;
    if (plan.line) plan.line.length *= k;
    if (plan.pool && plan.pool.radius != null) plan.pool.radius *= k;
  }
  if (g.cdr) plan.cooldown *= 1 - g.cdr / 100;
  return plan;
}
