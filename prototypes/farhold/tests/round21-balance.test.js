// Farhold — round 21b: the damage-over-time was the skill, and the seeking bolt did not seek.
//
// Both came out of round 21's description generator. Generating a skill's text from its own numbers
// meant adding those numbers up for the first time, and two of them did not survive being read
// aloud.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { STATUS_POWER_SHARE } from '../js/skills.js';
import {
  TALENT_LIBRARY, PENDING_MODS, IMPLEMENTED_MODS, OFFERED_TALENTS, inertTalents,
} from '../js/skilltalents.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, '..', f), 'utf8'));
const DATA = read('data/skills.json');

/** What a skill deals on impact, and what its status deals afterwards, as shares of weapon damage. */
function damageOf(skill) {
  const spec = skill.status ? DATA.statuses[skill.status] : null;
  const impact = skill.mult || 0;
  const dot = (spec && spec.perSecond)
    ? impact * STATUS_POWER_SHARE * (skill.statusMult || 1) * spec.perSecond * spec.seconds
    : 0;
  return { impact, dot, total: impact + dot };
}

test('a damage-over-time is part of a skill, not the whole of it', () => {
  const over = [];
  for (const [id, s] of Object.entries(DATA.skills)) {
    const { impact, dot } = damageOf(s);
    if (!dot || !impact) continue;
    /**
     * Poison Dart is the deliberate exception: it carries `statusMult: 1.8` on a 110% dart because
     * being mostly poison is the point of it. Everything else has to land under its own impact.
     */
    const cap = id === 'poison_dart' ? 1.5 : 1.0;
    if (dot / impact > cap) over.push(`${id}: impact ${(impact * 100) | 0}%, dot ${(dot * 100) | 0}% (${((dot / impact) * 100) | 0}% of the hit)`);
  }
  assert.deepEqual(over, [],
    `the status is worth more than the hit that applies it:\n  ${over.join('\n  ')}`);
});

test('a skill with a damage-over-time is not simply better than one without', () => {
  // measured per second of cooldown, which is the only comparison that means anything
  const rows = [];
  for (const [id, s] of Object.entries(DATA.skills)) {
    const { total, dot } = damageOf(s);
    if (!total) continue;
    rows.push({ id, dps: total / (s.cooldown || 1), hasDot: !!dot });
  }
  const avg = list => list.reduce((n, r) => n + r.dps, 0) / Math.max(1, list.length);
  const withDot = avg(rows.filter(r => r.hasDot));
  const bestDirect = Math.max(...rows.filter(r => !r.hasDot).map(r => r.dps));

  // Before this round the three best skills in the game were the three with a DoT, and the DoT
  // skills averaged 3.4x everything else. A DoT skill may be good; it may not be in its own league.
  assert.ok(withDot <= bestDirect * 1.15,
    `damage-over-time skills average ${(withDot * 100) | 0}%/s against the best direct skill's ${(bestDirect * 100) | 0}%/s`);
});

test('the status share lives in one place, and js/main.js reads it', () => {
  const main = readFileSync(join(here, '..', 'js/main.js'), 'utf8');
  assert.match(main, /STATUS_POWER_SHARE/, 'main.js should read the constant, not carry a copy');
  assert.ok(!/plan\.damage \* 0\.9 \*/.test(main),
    'main.js still has its own hard-coded status share — the two will drift apart again');
  assert.ok(STATUS_POWER_SHARE > 0 && STATUS_POWER_SHARE < 1);
});

test('every skill talent the game offers actually does something', () => {
  assert.deepEqual(inertTalents(), [],
    'a talent is offered whose mod nothing reads — that is a sentence, not a feature');
});

test('Seeking is implemented, offered, and says how far it reaches', () => {
  assert.ok(!('homing' in PENDING_MODS), 'homing is implemented now');
  assert.ok(IMPLEMENTED_MODS.has('homing'), 'homing must be on the implemented list too');
  assert.ok(OFFERED_TALENTS.includes('seeking'),
    'Seeking was in the library and in no offer list, so nobody could take it');
  const desc = String(TALENT_LIBRARY.seeking.desc || '');
  assert.match(desc, /\d/, `Seeking should say how far it reaches: "${desc}"`);
});

test('fireBolt reads the homing it is handed', () => {
  const main = readFileSync(join(here, '..', 'js/main.js'), 'utf8');
  const start = main.indexOf('function fireBolt');
  assert.ok(start > 0, 'fireBolt moved');
  const body = main.slice(start, start + 4000);
  assert.match(body, /plan\.homing/, 'fireBolt ignores plan.homing again');
  assert.match(body, /nearestTo/, 'fireBolt no longer sweeps for a body to turn onto');
  // the wand behaviour that depends on it is a real, purchasable item
  const weapons = readFileSync(join(here, '..', 'js/weapons.js'), 'utf8');
  assert.match(weapons, /key: 'seeking'[\s\S]{0,200}homing: 1/,
    'the seeking wand behaviour should still set homing');
});
