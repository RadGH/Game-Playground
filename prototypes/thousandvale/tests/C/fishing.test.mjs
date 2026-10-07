// Stream C — play-test 5 T25: the angling rules (js/rules/fishing.js + data/rules/fishing.json),
// against stream E's real content (data/provinces/angling.json) and against no content at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createFishing, timeSuits, bandSuits } from '../../js/rules/fishing.js';
import { makeRng } from '../../js/rules/rng.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const numbers = read('../../data/rules/fishing.json');
const contentUrl = new URL('../../data/provinces/angling.json', import.meta.url);
const content = existsSync(contentUrl) ? read('../../data/provinces/angling.json') : null;
const F = createFishing(numbers, content);
const withE = { skip: content ? false : 'data/provinces/angling.json is not there yet' };

test('the numbers file holds numbers only (no fish rows)', () => {
  assert.ok(numbers._doc);
  for (const k of ['fish', 'junk', 'legends', 'recipes', 'tools']) assert.equal(numbers[k], undefined);
});

test('no content: only junk bites, lists are empty, nothing throws', () => {
  const E = createFishing(numbers, null);
  const rng = makeRng(3);
  for (let i = 0; i < 300; i++) {
    const c = E.roll({ water: 'river', band: 3, skill: 50, zone: 'test', pool: { tier: 2 }, rng });
    assert.equal(c.kind, 'junk');
    assert.equal(E.tug(c, 50), null);
    assert.equal(E.item(c).kind, 'junk');
  }
  assert.deepEqual(E.listFor({ water: 'river' }), []);
  assert.equal(E.species('x'), null);
  assert.equal(E.rank(40), null);
  assert.equal(E.canFish({ skill: 1, rod: 'angling_rod' }).why, 'noRod');
  assert.equal(E.canFish({ skill: 1, rod: { id: 'r', minSkill: 0 } }).ok, true);
  assert.equal(E.canCook({ needs: [{ tag: 'any', count: 1 }], skill: 0 }, { perch: 1 }, 1).ok, true);
  assert.equal(createFishing(null, null).roll({ rng }).kind, 'junk');
});

test('the wait is always 2..9 s; bait, a good rod and a pool shorten it', () => {
  const rng = makeRng(9);
  const mean = o => { let s = 0; for (let i = 0; i < 4000; i++) { const w = F.wait(rng, o); assert.ok(w >= 2 && w <= 9, `wait ${w}`); s += w; } return s / 4000; };
  const plain = mean({});
  assert.ok(plain > 4.5 && plain < 6.5, `plain ${plain}`);
  assert.ok(mean({ pool: { tier: 1 } }) < plain);
  assert.ok(mean({ bait: { effect: { wait: -0.25 } } }) < plain);
  assert.ok(mean({ rod: { bonus: { wait: -0.2 } } }) < plain);
  assert.ok(F.biteMs(1) >= 1200 && F.biteMs(100) >= F.biteMs(1), 'a newcomer gets a generous window');
});

test('time and band matching', () => {
  assert.ok(timeSuits('any', 'night') && timeSuits('day', 'dawn') && timeSuits('day', 'dusk') && timeSuits('night', 'night'));
  assert.ok(!timeSuits('day', 'night') && !timeSuits('night', 'day') && !timeSuits('dawn', 'dusk') && !timeSuits('dusk', 'day'));
  assert.ok(bandSuits([2, 8], 2) && bandSuits([2, 8], [7, 12]) && !bandSuits([2, 8], 1) && !bandSuits([2, 8], [9, 12]));
});

test('10,000 casts on open water: every kind shows up in a sane share, and nothing breaks the rules', withE, () => {
  const rng = makeRng(77);
  const n = 10000, kinds = {}, rar = {};
  const ctx = { water: 'river', band: 4, time: 'dawn', skill: 20, zone: 'test' };
  const caught = new Set();
  let legendsSeen = 0;
  for (let i = 0; i < n; i++) {
    const c = F.roll({ ...ctx, caught, rng });
    kinds[c.kind] = (kinds[c.kind] || 0) + 1;
    if (c.kind === 'fish') {
      rar[c.rarity] = (rar[c.rarity] || 0) + 1;
      const f = F.species(c.id);
      assert.ok(f.skill <= 20, `${c.id} needs ${f.skill}`);
      assert.ok(!f.pool, `${c.id} is pool-only`);
      assert.ok(f.water.includes('river') && bandSuits(f.bands, 4) && timeSuits(f.time, 'dawn'), c.id);
      assert.ok(c.size >= f.size[0] && c.size <= f.size[1]);
      assert.ok(c.price >= 1);
    }
    if (c.kind === 'legend') { legendsSeen++; assert.equal(c.zone, 'test'); assert.ok(!caught.has(c.id)); caught.add(c.id); }
    if (c.kind === 'monster') assert.ok(content.pullBack.some(b => b.type === c.monster.type && b.water === 'river'));
    if (c.kind === 'crate') assert.deepEqual(c.crate, content.crates.crate);
  }
  const share = k => (kinds[k] || 0) / n;
  assert.equal(legendsSeen, 1, 'the zone legend is caught once and never again');
  assert.ok(share('fish') > 0.7 && share('fish') < 0.85, `fish ${share('fish')}`);
  assert.ok(share('junk') > 0.1 && share('junk') < 0.22, `junk ${share('junk')}`);
  assert.ok(share('crate') > 0.03 && share('crate') < 0.05, `crate ${share('crate')}`);
  assert.ok(share('monster') > 0.02 && share('monster') < 0.04, `monster ${share('monster')}`);
  assert.ok(rar.common > rar.uncommon, JSON.stringify(rar));
});

test('a legend never bites in another zone, at the wrong time, or below its skill', withE, () => {
  const rng = makeRng(5);
  const lg = content.legends[0];
  const none = o => { for (let i = 0; i < 6000; i++) assert.notEqual(F.roll({ water: lg.water, band: 4, time: lg.time, skill: 100, zone: lg.zone, ...o, rng }).kind, 'legend'); };
  none({ zone: 'nowhere' });
  none({ time: lg.time === 'night' ? 'day' : 'night' });
  none({ skill: Math.max(1, lg.skill - 1) });
  none({ caught: [lg.id] });
  let got = null;
  for (let i = 0; i < 6000 && !got; i++) { const c = F.roll({ water: lg.water, band: 4, time: lg.time, skill: 100, zone: lg.zone, pool: 3, rng }); if (c.kind === 'legend') got = c; }
  assert.ok(got, 'it does bite when everything fits');
  const it = F.item(got);
  assert.ok(it.legend && it.title === lg.title && it.trophy.name === lg.trophy.name && it.kind === 'fish');
  assert.equal(F.tug(got, 100).rarity, 'legend');
});

test('pools: pool-only fish only there, better rarities by tier, less junk, a skill gate', withE, () => {
  const rng = makeRng(11);
  const run = pool => {
    const out = { poolOnly: 0, rare: 0, junk: 0, n: 8000 };
    for (let i = 0; i < out.n; i++) {
      const c = F.roll({ water: 'river', band: 6, time: 'dusk', skill: 60, pool, rng });
      if (c.kind === 'junk') out.junk++;
      if (c.kind !== 'fish') continue;
      if (F.species(c.id).pool) out.poolOnly++;
      if (c.rarity === 'rare' || c.rarity === 'epic') out.rare++;
    }
    return out;
  };
  const open = run(null), p1 = run({ tier: 1 }), p3 = run(3);
  assert.equal(open.poolOnly, 0);
  assert.ok(p1.poolOnly > 0);
  assert.ok(p1.rare > open.rare && p3.rare > p1.rare, `${open.rare} ${p1.rare} ${p3.rare}`);
  assert.ok(p1.junk < open.junk);
  assert.deepEqual([F.pool(1).minSkill, F.pool(2).minSkill, F.pool(3).minSkill], [1, 25, 50]);
  assert.equal(F.canFish({ skill: 1, pool: { tier: 1 }, rod: 'angling_rod' }).ok, true, 'a newcomer fishes the first pool');
  assert.equal(F.canFish({ skill: 24, pool: 2, rod: 'angling_rod' }).why, 'skill');
  assert.equal(F.canFish({ skill: 1, rod: null }).why, 'noRod');
  assert.equal(F.canFish({ skill: 10, rod: 'ash_rod' }).why, 'skill');
  for (let i = 0; i < 200; i++) { const k = F.poolCatches(1, rng); assert.ok(k >= 4 && k <= 6); }
});

test('every water kind, band and time offers a level-1 newcomer something to catch', withE, () => {
  for (const water of ['river', 'lake', 'marsh', 'coast']) for (const time of ['day', 'night', 'dawn', 'dusk']) for (let band = 1; band <= 10; band++) {
    assert.ok(F.listFor({ water, band, time, skill: 1 }).length >= 1, `${water} ${time} band ${band}`);
  }
});

test('the tug is harder for rarer fish and easier with skill and a better rod', () => {
  const c = r => ({ kind: 'fish', rarity: r, size: 30, seed: 4 });
  const t = ['common', 'uncommon', 'rare', 'epic'].map(r => F.tug(c(r), 1));
  for (let i = 1; i < t.length; i++) {
    assert.ok(t[i].band < t[i - 1].band && t[i].need > t[i - 1].need && t[i].ms > t[i - 1].ms && t[i].pull > t[i - 1].pull);
  }
  for (const x of t) { assert.ok(x.ms >= 3000 && x.ms <= 6000 && x.band >= 0.15 && x.band <= 0.5 && x.need >= 0.5 && x.need <= 0.7); assert.equal(x.seed, 4); }
  assert.ok(F.tug(c('rare'), 100).band > F.tug(c('rare'), 1).band);
  assert.ok(F.tug(c('rare'), 1, { bonus: { band: 0.25 } }).band > F.tug(c('rare'), 1).band);
  assert.equal(F.tug({ kind: 'junk' }, 1), null);
  assert.equal(F.tug({ kind: 'monster' }, 1), null);
  assert.equal(F.tug({ kind: 'crate', seed: 1 }, 1).heft, 'heavy');
  assert.deepEqual(['light', 'heavy', 'huge'], [20, 60, 120].map(size => F.tug({ kind: 'fish', rarity: 'common', size }, 1).heft));
  const tg = F.tug(c('epic'), 1);
  assert.ok(F.lands(tg, tg.need) && !F.lands(tg, tg.need - 0.01) && F.lands(null, 0));
});

test('the level curve: 1..100, monotonic, gain() reports level-ups', () => {
  let prev = -1;
  for (let L = 1; L < 100; L++) { const n = F.next(L); assert.ok(n > prev, `level ${L}`); prev = n; assert.equal(F.levelOf(n), L + 1); assert.equal(F.levelOf(n - 1), L); }
  assert.equal(F.next(100), null);
  assert.equal(F.levelOf(0), 1);
  assert.equal(F.levelOf(1e12), 100);
  const g = F.gain({ xp: 0 }, F.next(2) + 1);
  assert.deepEqual([g.level, g.up], [3, 2]);
  assert.equal(F.gain({ xp: g.xp }, 1).up, 0);
  assert.equal(F.gain({ xp: 1e12 }, 50).level, 100);
  assert.ok(F.xp({ kind: 'fish', rarity: 'rare', skill: 30 }, { first: true }) > F.xp({ kind: 'fish', rarity: 'rare', skill: 30 }, { best: true }));
  assert.ok(F.xp({ kind: 'fish', rarity: 'rare', skill: 30 }, { best: true }) > F.xp({ kind: 'fish', rarity: 'rare', skill: 30 }));
  assert.ok(F.xp({ kind: 'junk' }) > 0 && F.xp({ kind: 'junk' }) < F.xp({ kind: 'fish', rarity: 'common' }));
});

test('a newcomer who lands 30 catches around Torborhold is about level 10; 100 is a long road', withE, () => {
  const levels = [];
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const rng = makeRng(seed);
    const st = { xp: 0 }, seen = new Set(), best = {};
    let landed = 0, guard = 0;
    while (landed < 30 && guard++ < 500) {
      const lvl = F.levelOf(st.xp);
      const c = F.roll({ water: landed % 2 ? 'river' : 'lake', band: 2, time: 'day', skill: lvl, zone: 'test', pool: landed % 5 === 0 ? 1 : null, rng });
      if (c.kind === 'monster') continue;
      const first = c.kind === 'fish' && !seen.has(c.id), pb = c.kind === 'fish' && c.size > (best[c.id] || 0);
      seen.add(c.id); if (pb) best[c.id] = c.size;
      st.xp = F.gain(st, F.xp(c, { first, best: pb })).xp;
      landed++;
    }
    levels.push(F.levelOf(st.xp));
  }
  for (const L of levels) assert.ok(L >= 8 && L <= 12, `levels after 30 catches: ${levels}`);
  // the road to 100: at 40 xp a catch it is thousands of catches, but finite
  const total = F.next(99);
  assert.ok(total / 40 > 1500 && total / 40 < 8000, `${total} xp to 100`);
});

test('item(): the bag item for each kind', withE, () => {
  const rng = makeRng(21);
  const seen = {};
  for (let i = 0; i < 3000; i++) { const c = F.roll({ water: 'lake', band: 3, skill: 30, rng }); seen[c.kind] = seen[c.kind] || c; }
  const f = F.item(seen.fish);
  assert.deepEqual(Object.keys(f).sort(), ['desc', 'id', 'kind', 'name', 'price', 'rarity', 'size', 'species', 'type'].sort());
  assert.ok(f.kind === 'fish' && f.type === 'fish' && f.species === f.id && F.species(f.id).name === f.name);
  const j = F.item(seen.junk);
  assert.ok(j.kind === 'junk' && j.type === 'junk' && content.junk.some(x => x.id === j.id));
  assert.equal(F.item(seen.crate).kind, 'crate');
  assert.equal(F.item(seen.monster), null);
});

test('canCook: every recipe in E\'s file can be cooked with the right fish, and not without', withE, () => {
  const fishOf = tag => content.fish.filter(f => tag === 'any' || f.water.includes(tag) || f.rarity === tag);
  for (const r of content.recipes) {
    const counts = {};
    for (const nd of r.needs) {
      if (nd.fish) { assert.ok(F.species(nd.fish), `${r.id}: unknown fish ${nd.fish}`); counts[nd.fish] = (counts[nd.fish] || 0) + nd.count; }
      else { const pool = fishOf(nd.tag); assert.ok(pool.length, `${r.id}: tag ${nd.tag} matches no fish`); counts[pool[0].id] = (counts[pool[0].id] || 0) + nd.count; }
    }
    const yes = F.canCook(r, counts, 100);
    assert.equal(yes.ok, true, `${r.id}: ${yes.text}`);
    assert.equal(Object.values(yes.uses).reduce((a, b) => a + b, 0), r.needs.reduce((a, nd) => a + nd.count, 0));
    assert.ok(content.meals[r.makes], `${r.id}: makes ${r.makes}, which is not a meal`);
    assert.equal(F.canCook(r, {}, 100).ok, false);
    if (r.skill > 1) assert.equal(F.canCook(r, counts, r.skill - 1).why, 'skill');
    const first = Object.keys(counts)[0];
    assert.equal(F.canCook(r, { ...counts, [first]: counts[first] - 1 }, 100).ok, false, `${r.id} one short`);
  }
  // junk and unknown ids never count as fish
  assert.equal(F.canCook(content.recipes[0], { old_boot: 3 }, 100).ok, false);
  // a named fish is set aside before a tag can eat it
  const mixed = { needs: [{ tag: 'any', count: 1 }, { fish: 'silver_perch', count: 1 }], skill: 0 };
  assert.equal(F.canCook(mixed, { silver_perch: 1 }, 1).ok, false);
  assert.equal(F.canCook(mixed, { silver_perch: 2 }, 1).ok, true);
});

test('rank names come from E\'s ladder', withE, () => {
  assert.equal(F.rank(1), 'Dabbler');
  assert.equal(F.rank(100), content.skill.ranks.at(-1).name);
});
