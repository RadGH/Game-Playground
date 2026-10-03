// node --test prototypes/farhold/tests/round28-balance.test.js
//
// Farhold round 28 — the balance band every converted skill is budgeted against
// (research/round28-skills-plan.md §9.1 and §9.7). Base numbers, before `effectiveMult`:
//
//   expected = mult x repeats x projectiles x (1 + conditional bonus x 0.5) + DoT share, / cooldown
//
// A conditional bonus counts at 50% uptime, a crowd bonus at half its cap, a resource spender at 3
// points, a variance roll at its mean, a `consumes` at 50%. A row outside its band by more than 10%
// fails, with its number, so a content agent can see by how much.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { STATUS_POWER_SHARE } from '../js/skills.js';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(readFileSync(join(here, '..', 'data', 'skills.json'), 'utf8'));

/** §9.1 — single-target / area / control bands by cooldown. */
export function bandFor(cooldown) {
  if (cooldown <= 5) return { single: [0.30, 0.47], area: [0.25, 0.38], control: [0, 0.25] };
  if (cooldown <= 10) return { single: [0.15, 0.30], area: [0.12, 0.22], control: [0, 0.12] };
  if (cooldown <= 16) return { single: [0.11, 0.22], area: [0.09, 0.16], control: [0, 0.09] };
  return { single: [0.08, 0.18], area: [0.06, 0.14], control: [0, 0.07] };
}

/** What kind of skill a row is, for the band: an area skill, a single-target one, or control-first. */
export function categoryOf(row) {
  if (!row.mult) return 'control';
  const areaShape = row.shape === 'around' || (row.shape === 'ground' && (row.radius ?? 0) >= 4);
  if (areaShape || (row.splash ?? 0) >= 4 || (row.radius ?? 0) >= 4) return 'area';
  return 'single';
}

/** §9.1's expected single-target base share per cooldown second. */
export function expectedOf(row) {
  const mult = row.mult || 0;
  if (!mult) return 0;
  const reps = typeof row.repeats === 'object' ? row.repeats.count || 1 : row.repeats || 1;
  const proj = row.projectiles || 1;
  let bonus = 0;
  for (const b of [].concat(row.bonusIf || [])) {
    const [kind, a, cap] = String(b.when || '').split(':');
    if (kind === 'crowd') bonus += (+cap || 0) * 0.5 * 0.5;
    else if (kind === 'distance' || kind === 'variety' || kind === 'followers') bonus += 0.25;
    else bonus += (b.mult ?? 0.5) * 0.5;
  }
  if (row.consumes) bonus += (row.consumes.mult ?? 0.5) * 0.5;
  let m = mult;
  if (row.resource?.perPoint?.mult) m *= 1 + row.resource.perPoint.mult * 3;
  if (Array.isArray(row.variance)) m *= (row.variance[0] + row.variance[1]) / 2;
  const dotOf = (id, stacks = 1) => {
    const s = id ? DATA.statuses[id] : null;
    return s?.perSecond ? m * STATUS_POWER_SHARE * (row.statusMult || 1) * s.perSecond * s.seconds * stacks : 0;
  };
  let dot = dotOf(row.status);
  for (const r of [].concat(row.statuses || [])) dot += dotOf(typeof r === 'string' ? r : r?.id);
  if (row.stack?.status) dot += dotOf(row.stack.status, (row.stack.max || 1) * 0.5);
  // a damaging pool pays `power` every 0.75 s for its life (js/skillrun.js poolSpec)
  const pool = row.pool && (row.pool.power ?? 0.3) > 0 ? (row.pool.power ?? 0.3) * Math.max(1, Math.round((row.pool.seconds ?? 4) / 0.75)) : 0;
  /**
   * …and a placed post or zone that strikes on a clock (js/skillrun.js scales its pulses by the same
   * effectiveMult as the cast, so a 40 s post's pulses are big): every pulse that could land on one
   * target, at half weight when it picks a random target. A trap fires once.
   */
  let placed = 0;
  const pl = row.place;
  if (pl?.strike?.mult) {
    const pulses = pl.kind === 'trap' ? 1 : Math.max(1, Math.floor((pl.seconds ?? 8) / (pl.every ?? 1)));
    placed = pl.strike.mult * pulses * (pl.strike.nearest === false ? 0.5 : 1) * (pl.kind === 'trap' && row.place.max ? 1 : 1);
  }
  return (m * reps * proj * (1 + bonus) + dot + pool + placed) / Math.max(0.5, row.cooldown || 1);
}

const converted = Object.entries(DATA.classes)
  .filter(([id, list]) => id !== 'custom' && list.every(s => DATA.skills[s]?.talents))
  .map(([id]) => id);

/** Every converted row and every form override on any row. */
function rows() {
  const out = [];
  for (const c of converted) for (const id of DATA.classes[c]) out.push([id, DATA.skills[id]]);
  for (const [id, row] of Object.entries(DATA.skills)) {
    for (const [f, o] of Object.entries(row.forms || {})) out.push([`${id}.${f}`, { ...row, ...o }]);
  }
  return out;
}

/**
 * Legacy rows the plan keeps at numbers older tests pin (R25's Whirlwind x5 — Iron Gyre — sits
 * above the band on purpose: plan §3.1 "m 0.8 x5"). Listed, not silently skipped.
 */
const PINNED = new Set(['whirlwind']);

test('every converted skill and every form override sits inside its §9.1 band (±10%)', () => {
  const out = [];
  for (const [id, row] of rows()) {
    if (PINNED.has(id)) continue;
    const cat = categoryOf(row);
    const [lo, hi] = bandFor(row.cooldown || 1)[cat];
    const e = expectedOf(row);
    if (cat === 'control') continue;
    if (e > hi * 1.1 || e < lo * 0.9) out.push(`${id}: ${cat} ${e.toFixed(3)}/s at ${row.cooldown}s cd, band ${lo}-${hi}`);
  }
  assert.deepEqual(out, [], `\n  ${out.join('\n  ')}`);
});

test('the top of the band is the game\'s simplest skill: nothing beats Precise Strike at its own job', () => {
  const ps = expectedOf(DATA.skills.power_strike);
  for (const [id, row] of rows()) {
    if (PINNED.has(id) || categoryOf(row) !== 'single') continue;
    assert.ok(expectedOf(row) <= ps * 1.1, `${id} ${expectedOf(row).toFixed(3)} beats Precise Strike's ${ps.toFixed(3)}`);
  }
});
