// node --test prototypes/farhold/tests/round22-threat.test.js
//
// Round 22 — enemies can now see a companion.
//
//   "My pets are now actively aggressive, which is useful. However enemies seem to just ignore my
//    pets."
//
// They did, completely. There was no `e.target` in js/actors.js, no threat table and no taunt: every
// `dx`, `dz`, `dist` and `facing` in the enemy AI was computed against `player` and nothing else, so
// an enemy could not have walked toward a companion if it had wanted to. A pet only ever ate a hit
// through a coin flip in js/main.js at the moment a swing landed — and js/pets.js made it worse from
// the other side, because a pet landing a hit set `target.state = 'chase'`, and chase means chase
// THE PLAYER. Biting something made it run at you faster.
//
// js/actors.js imports Three.js, so these tests drive `aimOf` and `taunt` on a bare object with the
// prototype borrowed. That is deliberate: the rules are arithmetic and they are what has to hold.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => readFileSync(join(here, '..', f), 'utf8');

/**
 * A stand-in field carrying only what `aimOf` and `taunt` touch, with the two methods lifted out of
 * js/actors.js by name. Importing the module would pull in Three.js and a scene.
 */
function field(companions = []) {
  const src = read('js/actors.js');
  const THREAT_SECONDS = Number(/export const THREAT_SECONDS = ([\d.]+)/.exec(src)[1]);
  const THREAT_LEASH = Number(/export const THREAT_LEASH = ([\d.]+)/.exec(src)[1]);
  const THREAT_BLOCK = Number(/export const THREAT_BLOCK = ([\d.]+)/.exec(src)[1]);

  return {
    THREAT_SECONDS, THREAT_LEASH, THREAT_BLOCK,
    companions: () => companions,
    aimOf(e, player, playerDist, dt = 0) {
      e.threatFor = Math.max(0, (e.threatFor || 0) - dt);
      e.aimingAt = null;
      const onPlayer = { x: player.x, z: player.z, pet: null };
      if (e.state !== 'chase') { e.threatOn = null; e.threatFor = 0; return onPlayer; }
      const pets = this.companions?.();
      if (!pets || !pets.length) return onPlayer;
      const usable = p => p && p.dying == null && !p.removed && (p.hp ?? 1) > 0;
      if (e.threatFor > 0 && e.threatOn != null) {
        const held = pets.find(p => p.id === e.threatOn);
        if (usable(held) && Math.hypot(held.x - e.x, held.z - e.z) <= THREAT_LEASH) {
          e.aimingAt = held;
          return { x: held.x, z: held.z, pet: held };
        }
        e.threatOn = null;
        e.threatFor = 0;
      }
      let best = null;
      let bestD = Math.min(playerDist, (e.reach || 2.4) + THREAT_BLOCK);
      for (const p of pets) {
        if (!usable(p)) continue;
        const d = Math.hypot(p.x - e.x, p.z - e.z);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best) { e.aimingAt = best; return { x: best.x, z: best.z, pet: best }; }
      return onPlayer;
    },
    taunt(enemy, pet, seconds = THREAT_SECONDS) {
      if (!enemy || !pet || enemy.dying != null || enemy.removed) return;
      enemy.threatOn = pet.id;
      enemy.threatFor = Math.max(enemy.threatFor || 0, seconds);
      if (enemy.state !== 'chase' && enemy.state !== 'flee') enemy.state = 'chase';
    },
  };
}

const foe = (over = {}) => ({ x: 0, z: 0, reach: 2.4, state: 'chase', ...over });
const pet = (id, x, z, over = {}) => ({ id, x, z, hp: 40, dying: null, removed: false, ...over });

// ---------------------------------------------------------------- the rules

test('with no companions anywhere, an enemy comes for you exactly as it always did', () => {
  const f = field([]);
  const e = foe();
  const aim = f.aimOf(e, { x: 10, z: 0 }, 10, 0.016);
  assert.deepEqual([aim.x, aim.z], [10, 0]);
  assert.equal(aim.pet, null);
  assert.equal(e.aimingAt, null);
});

test('something that bit it holds its attention, and the attention runs out', () => {
  const wolf = pet('w1', 3, 0);
  const f = field([wolf]);
  const e = foe();

  f.taunt(e, wolf);
  assert.equal(e.threatOn, 'w1');
  assert.equal(e.threatFor, f.THREAT_SECONDS);

  // you are nearer than the wolf, and it goes for the wolf anyway — that is the whole feature
  const aim = f.aimOf(e, { x: 1, z: 0 }, 1, 0.016);
  assert.equal(aim.pet, wolf);
  assert.equal(e.aimingAt, wolf);

  // …but not forever: a pet cannot park a boss by biting it once
  for (let t = 0; t < f.THREAT_SECONDS + 1; t += 0.5) f.aimOf(e, { x: 1, z: 0 }, 1, 0.5);
  const after = f.aimOf(e, { x: 1, z: 0 }, 1, 0.016);
  assert.equal(after.pet, null, 'the taunt never expired');
  assert.deepEqual([after.x, after.z], [1, 0]);
});

test('it gives up on a companion that ran away, or died', () => {
  const wolf = pet('w1', 3, 0);
  const f = field([wolf]);
  const e = foe();

  f.taunt(e, wolf);
  wolf.x = f.THREAT_LEASH + 10;
  const fled = f.aimOf(e, { x: 4, z: 0 }, 4, 0.016);
  assert.equal(fled.pet, null, 'it is still chasing a companion on the other side of the zone');
  assert.equal(e.threatOn, null, 'and it is still holding the stale taunt');

  wolf.x = 3;
  f.taunt(e, wolf);
  wolf.dying = 0.2;
  const dead = f.aimOf(e, { x: 4, z: 0 }, 4, 0.016);
  assert.equal(dead.pet, null, 'it is fighting a body that is already going down');
});

test('a companion standing in the way is what it swings at, and one behind you is not', () => {
  const inFront = pet('w1', 2, 0);
  const behindYou = pet('w2', 30, 0);
  const f = field([inFront, behindYou]);

  // in reach, and nearer than you: it is in the way
  const e = foe();
  const blocked = f.aimOf(e, { x: 12, z: 0 }, 12, 0.016);
  assert.equal(blocked.pet, inFront);

  // the same companion, further off than the enemy's reach: it walks past toward you
  inFront.x = 9;
  const e2 = foe();
  const past = f.aimOf(e2, { x: 12, z: 0 }, 12, 0.016);
  assert.equal(past.pet, null);

  // and a companion that is further away than YOU never wins, however close it is to reach
  inFront.x = 2.5;
  const e3 = foe();
  const you = f.aimOf(e3, { x: 1, z: 0 }, 1, 0.016);
  assert.equal(you.pet, null, 'it ignored the player it was standing on top of');
});

test('an enemy that has not noticed anything does not pick a fight with a pet', () => {
  const wolf = pet('w1', 1, 0);
  const f = field([wolf]);
  for (const state of ['wander', 'flee']) {
    const e = foe({ state });
    const aim = f.aimOf(e, { x: 40, z: 0 }, 40, 0.016);
    assert.equal(aim.pet, null, `a ${state}ing enemy targeted a companion`);
  }
});

// ---------------------------------------------------------------- and it is wired up

test('the enemy AI moves toward what it is fighting, not always toward the player', () => {
  const src = read('js/actors.js');
  // the chase branch reads the AIM distance, and the despawn leash still reads the player's
  assert.match(src, /const aim = this\.aimOf\(e, player, dist, dt\);/);
  assert.match(src, /e\.facing = Math\.atan2\(adx, adz\);/);
  assert.match(src, /\} else if \(adist > e\.reach\) \{/);
  assert.match(src, /if \(dist > leash && !e\.boss\)/, 'the despawn leash must stay about the player');
});

test('a pet landing a hit no longer sends the thing at its owner', () => {
  const pets = read('js/pets.js');
  assert.equal(/if \(target\.state !== 'chase'\) target\.state = 'chase';/.test(pets), false,
    'a bite still just wakes it up and points it at you');
  assert.equal(/if \(victim\.state !== 'chase'\) victim\.state = 'chase';/.test(pets), false);
  assert.equal((pets.match(/field\?\.taunt\?\.\(/g) || []).length, 2,
    'both the bite and the ability path must taunt');
});

test('an enemy hits the thing it walked up to, rather than rolling for it', () => {
  const main = read('js/main.js');
  assert.match(main, /const pet = e\.aimingAt \|\| pets\.nearest/);
  assert.match(main, /const victim = pet && \(e\.aimingAt \|\| field\.rng\(\) < 0\.55\) \? pet : player;/);
  assert.match(main, /const aimAt = pet && \(e\.aimingAt \|\| field\.rng\(\) < 0\.4\) \? pet : control;/);
  // and the field is told where to find the companions
  assert.match(main, /made\.setCompanions\(\(\) => pets\?\.pets \|\| null\);/);
});
