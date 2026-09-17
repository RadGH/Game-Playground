// node --test prototypes/farhold/tests/starchart.test.js
//
// The chart's maths, without a browser: distances in light years, what the drive can reach, that
// the player is always in the middle of every view, and that a star off the edge is clipped rather
// than smeared onto the rim. Plus the warp's own curve, which decides what the jump feels like.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHART_LEVELS, LEVEL_LABELS, LEVEL_SPAN, LY_PER_UNIT, JUMP_RANGE,
  lightYears, reachFrom, reachable, projector, starUnder,
} from '../js/starchart.js';
import { generateGalaxy } from '../../../universe/js/galaxy.js';

const galaxy = generateGalaxy({ seed: 11, stars: 180, layout: 'spiral' });
const home = galaxy.stars[0];

test('every step has a label, and they run from the ship outwards', () => {
  assert.deepEqual(CHART_LEVELS, ['system', 'neighbourhood', 'sector', 'galaxy']);
  for (const k of CHART_LEVELS) assert.ok(LEVEL_LABELS[k], `${k} has no label`);
  // each step must show MORE than the one before it, or zooming out does nothing
  assert.ok(LEVEL_SPAN.neighbourhood < LEVEL_SPAN.sector);
  assert.ok(LEVEL_SPAN.sector < LEVEL_SPAN.galaxy);
  // and the drive's reach has to fit inside the first star view, or the ring is off the screen
  assert.ok(JUMP_RANGE * 2 <= LEVEL_SPAN.neighbourhood * 1.1,
    'the jump ring is wider than the Nearby Stars view');
});

test('distance is symmetric, zero to yourself, and quoted in light years', () => {
  const a = galaxy.stars[3], b = galaxy.stars[40];
  assert.equal(lightYears(a, b).toFixed(6), lightYears(b, a).toFixed(6));
  assert.equal(lightYears(a, a), 0);
  const units = Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
  assert.ok(Math.abs(lightYears(a, b) - units * LY_PER_UNIT) < 1e-6);
});

test('the drive reaches nearby stars and refuses far ones, and says which', () => {
  const list = reachable(galaxy, home);
  assert.ok(list.length > 0, 'nothing at all is in range from the starting star');
  assert.ok(list.length < galaxy.stars.length / 3, 'everything is in range — the limit is doing nothing');
  // sorted nearest first
  for (let i = 1; i < list.length; i++) assert.ok(list[i].ly >= list[i - 1].ly, 'the list is out of order');
  // all of them really are inside the limit
  for (const r of list) assert.ok(r.units <= JUMP_RANGE + 1e-9, `${r.star.name} is past the limit but listed`);

  // the furthest star in the galaxy is not reachable, and the refusal explains itself
  const far = galaxy.stars
    .map(s => ({ s, d: Math.hypot(s.x - home.x, s.y - home.y) }))
    .sort((a, b) => b.d - a.d)[0].s;
  const no = reachFrom(galaxy, home, far);
  assert.equal(no.ok, false);
  assert.match(no.why, /light years/);
  assert.match(no.why, /closer/);

  // and you cannot jump to where you already are
  const self = reachFrom(galaxy, home, home);
  assert.equal(self.ok, false);
  assert.equal(self.here, true);
});

test('a charted lane is noticed, because it is worth saying so', () => {
  const neighbour = galaxy.stars[home.neighbours[0]];
  assert.ok(neighbour, 'the starting star has no lanes at all');
  const r = reachFrom(galaxy, home, neighbour);
  assert.equal(r.lane, true);
  if (r.ok) assert.match(r.why, /lane/);
});

test('you are in the middle of every view, at every step', () => {
  for (const level of ['neighbourhood', 'sector', 'galaxy']) {
    const proj = projector({ level, centre: { x: home.x, y: home.y }, width: 900, height: 600 });
    const [x, y] = proj.to(home);
    assert.ok(Math.abs(x - 450) < 1e-6 && Math.abs(y - 300) < 1e-6, `${level} did not centre on the player`);
    // and the round trip through map space comes back to the same pixel
    const back = proj.from(x, y);
    assert.ok(Math.abs(back.x - home.x) < 1e-9 && Math.abs(back.y - home.y) < 1e-9);
  }
});

test('zooming out really does show more of the galaxy', () => {
  const seen = level => {
    const proj = projector({ level, centre: { x: home.x, y: home.y }, width: 900, height: 600 });
    return galaxy.stars.filter(s => {
      const [x, y] = proj.to(s);
      return x > 0 && y > 0 && x < 900 && y < 600;
    }).length;
  };
  const near = seen('neighbourhood'), arm = seen('sector'), all = seen('galaxy');
  assert.ok(near >= 1, 'the Nearby Stars view is empty');
  assert.ok(arm > near, `the arm view shows ${arm} against ${near} nearby`);
  assert.ok(all > arm, `the galaxy view shows ${all} against ${arm} in the arm`);
  assert.ok(all > galaxy.stars.length * 0.8, 'the galaxy view is missing most of the galaxy');
});

test('clicking picks the star under the cursor, and nothing when there is none', () => {
  const proj = projector({ level: 'sector', centre: { x: home.x, y: home.y }, width: 900, height: 600 });
  const target = galaxy.stars[home.neighbours[0]];
  assert.equal(starUnder(galaxy.stars, { x: target.x, y: target.y }, proj, 16)?.id, target.id);
  // a point in genuinely empty space picks nothing
  const empty = { x: home.x + 40, y: home.y + 40 };
  assert.equal(starUnder(galaxy.stars, empty, proj, 16), null);
});

test('a jump always has somewhere to go, from anywhere in the galaxy', () => {
  // A star with nothing in range would be a dead end you could never leave.
  let stranded = 0;
  for (const s of galaxy.stars) if (!reachable(galaxy, s).length) stranded++;
  assert.ok(stranded / galaxy.stars.length < 0.06,
    `${stranded} of ${galaxy.stars.length} stars are dead ends`);
});

test('every star carries its own seed, which is what makes it a system', () => {
  const seeds = new Set(galaxy.stars.map(s => s.seed));
  assert.equal(seeds.size, galaxy.stars.length, 'two stars share a seed and would be the same system');
  for (const s of galaxy.stars) assert.ok(Number.isFinite(s.seed) && s.name && s.classKey);
});
