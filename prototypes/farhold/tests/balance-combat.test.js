// Farhold — the 21 combat knobs in data/balance.json are READ, and stay read.
//
// R19. `player.combat`, `player.ranged` and `player.staff` landed in round 14 with every number in
// them mirrored as a constant in js/combat-feel.js or js/weapons.js, under a different name and in
// one case a different unit (`hitStopMaxMs` is milliseconds; the code holds seconds). They all
// agreed, so the game played correctly and the balance file was decoration: editing it did nothing
// and said nothing. This project's signature fault, one more time.
//
// Two things are checked, and the second is the one that matters:
//
//   1. Every key in the three blocks is consumed by `tuneFeel` or `tuneWeapons` — no new knob can
//      be added to the file and quietly ignored.
//   2. Tuning MOVES THE GAME. Each knob is set to a value nothing else in the file uses and the
//      module is asked what it now thinks. A test that only compared the file against the
//      constants would have passed against the broken code, which is exactly how this survived
//      five rounds.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { tuneFeel, COMBAT_FEEL, feel, staggerFor, staggerWindow } from '../js/combat-feel.js';
import { tuneWeapons, RANGED, STAFF_CHARGE, chargeAt } from '../js/weapons.js';

const here = dirname(fileURLToPath(import.meta.url));
const balance = JSON.parse(readFileSync(join(here, '..', 'data', 'balance.json'), 'utf8'));

const keysOf = block => Object.keys(balance.player?.[block] || {}).filter(k => !k.startsWith('_'));

test('R19.1 — the three blocks exist and carry the knobs round 14 wrote', () => {
  assert.ok(keysOf('combat').length >= 10, 'player.combat lost knobs');
  assert.ok(keysOf('ranged').length >= 6, 'player.ranged lost knobs');
  assert.ok(keysOf('staff').length >= 6, 'player.staff lost knobs');
});

test('R19.2 — every combat knob reaches something, so a new one cannot be ignored', () => {
  // `tuneFeel` reports back what it set: the five it keeps itself plus the module-level three.
  const got = tuneFeel(balance.player.combat);
  const reported = new Set([
    ...Object.keys(got),
    // the three it renames on the way in, listed by their FILE names
    'hitStopMaxMs', 'hitStopFloor', 'shakePerPoint', 'shakeMaxMetres', 'staggerWindowSeconds',
  ]);
  for (const key of keysOf('combat')) {
    assert.ok(reported.has(key), `balance.json player.combat.${key} is read by nobody`);
  }
});

test('R19.3 — the ranged and staff knobs all land on a real field', () => {
  const out = tuneWeapons(balance.player);
  const r = balance.player.ranged, s = balance.player.staff;

  assert.equal(out.ranged.bow.min, r.bowDrawMin);
  assert.equal(out.ranged.bow.full, r.bowDrawFull);
  assert.equal(out.ranged.bow.powerMin, r.bowPowerMin);
  assert.equal(out.ranged.bow.powerFull, r.bowPowerFull);
  assert.equal(out.ranged.crossbow.reload, r.crossbowReload);
  assert.equal(out.ranged.crossbow.power, r.crossbowPower);
  // the shared floor is shared: all three draw bows pay it
  for (const key of ['bow', 'shortbow', 'longbow']) {
    assert.equal(out.ranged[key].powerMin, r.bowPowerMin, `${key} kept its own powerMin`);
  }

  assert.equal(out.staff.min, s.chargeMin);
  assert.equal(out.staff.full, s.chargeFull);
  assert.equal(out.staff.max, s.chargeMax);
  assert.equal(out.staff.mana, s.channelMana);
  assert.equal(out.staff.breakAt, s.breakAtShareOfHealth);
  assert.equal(out.staff.moveWhile, s.moveWhileChannelling);
});

test('R19.4 — tuning the file MOVES the game, which is the whole point', () => {
  // values nothing else uses, so a stale constant cannot pass by coincidence
  tuneFeel({
    hitStopMaxMs: 410, hitStopFloor: 0.17, shakePerPoint: 0.071, shakeMaxMetres: 0.29,
    staggerWindowSeconds: 11, knockbackSeconds: 0.47, recoilMetres: 0.23,
    wallSlamShare: 0.061, windCommitSpeed: 0.31, inputBufferSeconds: 0.39,
  });

  assert.equal(staggerWindow(), 11, 'the stagger window ignored the file');
  assert.equal(COMBAT_FEEL.knockbackSeconds, 0.47);
  assert.equal(COMBAT_FEEL.recoilMetres, 0.23);
  assert.equal(COMBAT_FEEL.wallSlamShare, 0.061);
  assert.equal(COMBAT_FEEL.windCommitSpeed, 0.31);
  assert.equal(COMBAT_FEEL.inputBufferSeconds, 0.39);

  // the hit-stop ceiling is enforced through `hit()`, so ask the running thing rather than the binding
  feel.setEnabled({ hitStop: true, screenShake: true });
  feel.reset();
  feel.hit({ strike: { hitstop: 9000, shake: 0 }, crit: false });
  assert.ok(Math.abs(feel.stopLeft - 0.41) < 1e-6,
    `hit-stop clamped to ${feel.stopLeft}, not the file's 410 ms`);

  // and the floor: mid-stop the world runs at 0.17x, not the old 0.05x
  assert.ok(Math.abs(feel.scale - 0.17) < 1e-6, `world ran at ${feel.scale} mid-stop, not 0.17`);

  // a staff tuned to a different ladder charges on the new one
  tuneWeapons({ staff: { chargeMin: 0.9, chargeFull: 2.2, chargeMax: 3.7, channelMana: 13 } });
  assert.equal(STAFF_CHARGE.mana, 13);
  assert.equal(chargeAt(0.5).ready, false, 'a 0.5 s hold beat a 0.9 s minimum');
  assert.equal(chargeAt(1.0).ready, true, 'a 1.0 s hold did not clear a 0.9 s minimum');

  // put the real numbers back — node --test shares one module graph across files in a process
  tuneFeel(balance.player.combat);
  tuneWeapons(balance.player);
  feel.reset();
});

test('R19.5 — a half-written block degrades to the defaults, it does not NaN the clock', () => {
  const before = { ...COMBAT_FEEL };
  tuneFeel({ hitStopMaxMs: 'soon', knockbackSeconds: null, recoilMetres: undefined });
  assert.equal(COMBAT_FEEL.knockbackSeconds, before.knockbackSeconds);
  assert.equal(COMBAT_FEEL.recoilMetres, before.recoilMetres);

  feel.reset();
  feel.hit({ strike: { hitstop: 120, shake: 4 }, crit: false });
  assert.ok(Number.isFinite(feel.stopLeft), 'the hit-stop clock went non-finite');
  assert.ok(Number.isFinite(feel.scale) && feel.scale > 0,
    'the world time scale went non-finite, which freezes every simulated system');

  tuneWeapons({ ranged: { bowDrawMin: 'quick' }, staff: { chargeMax: NaN } });
  assert.ok(Number.isFinite(RANGED.bow.min) && Number.isFinite(STAFF_CHARGE.max));

  tuneFeel(balance.player.combat);
  tuneWeapons(balance.player);
  feel.reset();
});

test('R19.6 — nothing restates a combat knob as its own constant any more', () => {
  const src = f => readFileSync(join(here, '..', 'js', f), 'utf8');

  // The exact literals that used to be duplicated, each at the site that used to hold it. A line
  // is only a finding if it is CODE — the comments above these fixes quote the old numbers.
  const banned = [
    ['actors.js', /\*\s*0\.015\)/, 'the wall slam share'],
    ['actors.js', /const back = 0\.08/, 'the recoil nudge'],
    ['actors.js', /t: 0\.18, span: 0\.18/, 'the knockback ease'],
    ['player.js', /committed \? 0\.55/, 'the wind-up move speed'],
    ['player.js', /self\.buffered = 0\.18/, 'the input buffer'],
  ];
  for (const [file, re, what] of banned) {
    assert.equal(re.test(src(file)), false,
      `js/${file} has gone back to its own copy of ${what} instead of COMBAT_FEEL`);
  }

  // and the two tuners are actually CALLED — an exported tuner nobody calls is the fault this
  // whole test exists to close
  const main = src('main.js');
  assert.match(main, /tuneFeel\(balance\.player\?\.combat\)/, 'main.js never calls tuneFeel');
  assert.match(main, /tuneWeapons\(balance\.player\)/, 'main.js never calls tuneWeapons');
});
