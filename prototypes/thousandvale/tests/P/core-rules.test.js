// Round 8, W9 (stream P-core) — the PROFESSION RULES: the eight mini-games (seeded pattern, raw inputs, server scoring,
// the checks that make a made-up result impossible), the skill curve, gathering yields, crafted gear's band, tempering.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProfessions, PROFESSIONS, GATHERING, MAKING } from '../../js/rules/professions.js';
import { makeGame, scoreGame, checkInputs, perfectInputs, botInputs, qualityOf, seeded, GAME_TYPES, GAME_OF, markerAt, heatAt, gaugeAt, gaugeHalf } from '../../js/rules/professions-games.js';
import { temperCheck, temperApply, temperCost, matClassOf } from '../../js/rules/professions-temper.js';
import { rulesEngine, priceOf } from '../../js/rules/index.js';

const J = f => JSON.parse(readFileSync(new URL('../../' + f, import.meta.url), 'utf8'));
const numbers = J('data/rules/professions.json'), content = J('data/provinces/professions.json');
const P = createProfessions(numbers, content);
const engine = rulesEngine();

test('ten professions: five gather, five make; every one has a game, a verb and a blurb in plain words', () => {
  assert.equal(PROFESSIONS.length, 10);
  assert.deepEqual([...GATHERING, ...MAKING], P.list.map(d => d.id));
  for (const d of P.list) {
    assert.ok(d.name && d.verb && d.blurb && d.anim, d.id);
    assert.ok(d.id === 'angling' ? d.game === 'tug' : GAME_TYPES.includes(d.game) && GAME_OF[d.id] === d.game, d.id + ' game ' + d.game);
    assert.ok(!/muster|ember|veil/i.test(d.name + d.blurb), d.id);
  }
  assert.equal(P.list.filter(d => d.start).map(d => d.id).join(), 'angling,cooking', 'angling and cooking need no trainer');
});

test('every mini-game: same seed = same pattern; a flawless play scores 1; no input scores 0; it fits inside its time limit', () => {
  for (const type of GAME_TYPES) {
    for (let s = 1; s <= 200; s++) {
      const g = makeGame(type, { seed: s * 104729, base: numbers.games[type] });
      assert.deepEqual(g, makeGame(type, s * 104729, { base: numbers.games[type] }), 'makeGame(type, seed, opts) is the same game');
      const p = perfectInputs(g);
      assert.equal(scoreGame(g, p).score, 1, `${type} seed ${s}: ${JSON.stringify(scoreGame(g, p))}`);
      assert.ok(p[p.length - 2] <= g.ms && g.ms <= 8000, `${type}: a 3-8 second game (${g.ms})`);
      assert.ok(p.length <= 64, 'inputs fit the wire');
      assert.equal(scoreGame(g, []).score, 0);
      assert.ok(checkInputs(g, p, { elapsedMs: p[p.length - 2] + 30 }).ok);
    }
  }
});

test('a game can be failed, and sloppier play scores worse (all eight)', () => {
  for (const type of GAME_TYPES) {
    const mean = sloppy => { const rng = seeded(7); let sum = 0; for (let s = 1; s <= 200; s++) { const g = makeGame(type, { seed: s * 31 }); sum += scoreGame(g, botInputs(g, rng, sloppy)).score; } return sum / 200; };
    const a = mean(0.3), b = mean(1.2), c = mean(2.5);
    assert.ok(a > b && b > c, `${type}: ${a.toFixed(2)} > ${b.toFixed(2)} > ${c.toFixed(2)}`);
    assert.ok(c < 0.65, `${type}: wild play is not fine work (${c.toFixed(2)})`);
  }
  assert.equal(qualityOf(1), 'perfect'); assert.equal(qualityOf(0.7), 'fine'); assert.equal(qualityOf(0.5), 'good'); assert.equal(qualityOf(0.25), 'poor'); assert.equal(qualityOf(0.1), 'fail');
});

test('anti-cheat: the server rejects inputs no person could have sent, and spam never helps', () => {
  const g = makeGame('strike', { seed: 99 });
  const p = perfectInputs(g), last = p[p.length - 2];
  assert.equal(checkInputs(g, p, { elapsedMs: 200 }).why, 'early', 'an answer sent before its last strike could have been played');
  assert.equal(checkInputs(g, p, { elapsedMs: g.ms + 60000 }).why, 'late');
  assert.equal(checkInputs(g, [p[2], 0, p[0], 0], { elapsedMs: last }).why, 'order');
  assert.equal(checkInputs(g, [-5, 0], { elapsedMs: last }).why, 'range');
  assert.equal(checkInputs(g, [g.ms + 5000, 0], { elapsedMs: g.ms + 5000 }).why, 'range');
  assert.equal(checkInputs(g, [1, 2, 3], { elapsedMs: last }).why, 'shape');
  assert.equal(checkInputs(g, new Array(66).fill(1), { elapsedMs: last }).why, 'shape');
  assert.equal(checkInputs(g, [NaN, 0], { elapsedMs: last }).why, 'range');
  // a burst of presses 10 ms apart is ONE press
  const burst = []; for (let t = 100; t < 400; t += 10) burst.push(t, 0);
  assert.equal(checkInputs(g, burst, { elapsedMs: 500 }).inputs.length, 4, 'presses closer than 90 ms are dropped');
  // hammering every 100 ms through the whole game does not beat timing it
  for (const type of ['strike', 'rhythm', 'stitch', 'forge', 'pick']) {
    let spam = 0, n = 0;
    for (let s = 1; s <= 60; s++) { const gg = makeGame(type, { seed: s * 17 }); const inp = []; for (let t = 100, k = 0; t < gg.ms && inp.length < 64; t += 100, k++) inp.push(t, type === 'pick' ? k % gg.spots : k % 2); spam += scoreGame(gg, checkInputs(gg, inp, { elapsedMs: gg.ms }).inputs).score; n++; }
    assert.ok(spam / n < 0.65, `${type}: mashing averages ${(spam / n).toFixed(2)} — below fine work`);
  }
  // the marks are worked out from the times alone: there is no field for a score
  assert.deepEqual(Object.keys(scoreGame(g, p)).sort(), ['flags', 'marks', 'score', 'steps', 'used']);
});

test('the curves a client draws are the curves that are scored (strike marker, forge heat, tempering gauge)', () => {
  const s = makeGame('strike', { seed: 5 });
  for (const t of [0, 100, s.period / 2, s.period]) assert.ok(markerAt(s, t) >= 0 && markerAt(s, t) <= 1);
  const f = makeGame('forge', { seed: 5 });
  assert.equal(heatAt(f, [], 0).heat, 1);
  assert.ok(heatAt(f, [], 1000).heat < 1);
  const re = heatAt(f, [[1000, 1]], 1000 + f.reheat + 1);
  assert.ok(re.heat > 0.99, 're-heating puts the bar back at full heat after the pause');
  assert.equal(scoreGame(f, [1000, 1, 1200, 0]).marks[0], 0, 'a blow while the bar is in the fire does nothing (and is not counted as a step)');
  const g = makeGame('gauge', { seed: 5 });
  assert.ok(gaugeHalf(g, 0) > gaugeHalf(g, g.rise), 'the band narrows');
  assert.ok(gaugeAt(g, g.rise) >= 1);
  assert.ok(scoreGame(g, [g.ms - 10, 0]).flags.includes('over') && scoreGame(g, [50, 0]).flags.includes('under'));
});

test('skill: 1-100, ranks, a tier every 25ish levels; skill past the work and a better tool widen the windows', () => {
  assert.equal(P.levelOf(0), 1); assert.equal(P.levelOf(P.xpAt(25)), 25); assert.equal(P.levelOf(1e9), 100); assert.equal(P.next(100), null);
  assert.equal(P.rank(1), 'Novice'); assert.equal(P.rank(95), 'Master');
  assert.deepEqual(P.tiers.map(t => t.minSkill), [1, 25, 50, 75, 90]);
  assert.equal(P.tierForSkill(49).tier, 2); assert.equal(P.tierForLevel(9).tier, 2); assert.equal(P.tierForLevel(7).tier, 1);
  const g = P.gain({ xp: 0 }, P.xpAt(3) + 1);
  assert.equal(g.level, 3); assert.equal(g.up, 2);
  const plain = P.gatherGame({ prof: 'mining', tier: 1, skill: 1, seed: 3 }), skilled = P.gatherGame({ prof: 'mining', tier: 1, skill: 41, seed: 3 }), tooled = P.gatherGame({ prof: 'mining', tier: 1, skill: 1, seed: 3, tool: { ease: 0.4 } });
  assert.ok(skilled.half > plain.half * 1.4 && tooled.half > plain.half, 'windows widen');
  assert.deepEqual(skilled.spots, plain.spots, 'the pattern itself is the seed\'s');
});

test('gathering: who may work a node, what it gives by quality, a fail gives nothing, old work teaches little', () => {
  const copper = P.nodeKind('copper'), iron = P.nodeKind('iron');
  assert.equal(P.canGather({ known: false, skill: 1, node: copper, tool: {} }).why, 'notLearned');
  assert.equal(P.canGather({ known: true, skill: 1, node: copper, tool: null }).why, 'tool');
  const r = P.canGather({ known: true, skill: 10, node: iron, tool: {} });
  assert.equal(r.why, 'skill'); assert.equal(r.need, 25); assert.match(r.text, /Mining 25/);
  assert.ok(P.canGather({ known: true, skill: 1, node: copper, tool: {} }).ok);
  assert.deepEqual(P.gatherYield({ node: copper, quality: 'fail' }), []);
  const n = q => P.gatherYield({ node: copper, quality: q, rng: () => 0.99 })[0].n;
  assert.deepEqual(['poor', 'good', 'fine', 'perfect'].map(n), [1, 2, 2, 3]);
  const bonus = P.gatherYield({ node: copper, quality: 'perfect', rng: () => 0 });
  assert.ok(bonus.some(y => y.bonus && y.id === 'rough_quartz'), 'a clean strike can shake a gem loose');
  assert.ok(P.xpFor({ tier: 1, quality: 'perfect', skill: 1 }) > P.xpFor({ tier: 1, quality: 'poor', skill: 1 }));
  assert.ok(P.xpFor({ tier: 1, quality: 'good', skill: 60 }) < P.xpFor({ tier: 1, quality: 'good', skill: 20 }), 'tier-1 work 40+ levels under you');
  assert.equal(P.respawnMs({ starter: true }), 120000);
  const ms = P.respawnMs(copper, 0.5); assert.ok(ms >= 6 * 60000 && ms <= 10 * 60000);
  const sk = P.skinOf('moor_hound', 3);
  assert.ok(sk && sk.prof === 'skinning' && sk.tier === 1 && sk.gives[0].id === 'light_hide');
  assert.equal(P.skinOf('road_brigand', 3), null, 'people are not skinned');
  const it = P.item('copper_ore', 3);
  assert.deepEqual([it.kind, it.count, it.stackMax, it.price > 0], ['material', 3, 50, true]);
});

test('recipes: every need is a real material, every product exists, every gear base is in C\'s catalog; nothing is a dead end', () => {
  const makes = new Set(), needs = new Set();
  for (const rc of P.recipes) {
    assert.ok(MAKING.includes(rc.prof) && rc.name && rc.skill >= 1 && rc.skill <= 100, rc.id);
    for (const nd of rc.needs) { assert.ok(P.material(nd.id), `${rc.id} needs ${nd.id}`); needs.add(nd.id); }
    if (rc.kind === 'gear') { assert.ok(rc.bases.length, rc.id); for (const b of rc.bases) assert.ok(engine.items.weaponBases[b.key] || engine.items.armorBases[b.key], `${rc.id}: base ${b.key} is not in the catalog (run tools/content-professions.mjs)`); }
    else { assert.ok(rc.kind === 'material' ? P.material(rc.makes.id) : rc.kind === 'tool' ? P.tool(rc.makes.id) : P.goodItem(rc.makes.id), `${rc.id} makes ${rc.makes.id}`); makes.add(rc.makes.id); }
  }
  // every material a recipe needs comes from a node, a corpse or another recipe
  const raw = new Set([...Object.values(content.nodeKinds).flatMap(k => [k.gives, k.bonus]), ...content.classes.hide, content.skins.meat, content.skins.bonus].filter(Boolean));
  for (const id of needs) assert.ok(raw.has(id) || makes.has(id), `${id} is needed and nothing gives it`);
  for (const p of ['sling_satchel', 'trail_rucksack', 'expedition_pack']) assert.ok(P.recipes.some(r => r.kind === 'gear' && r.bases.some(b => b.key === p)), `Outfitting makes the ${p} (W19)`);
  assert.ok(!P.recipes.some(r => (r.bases || []).some(b => b.slot === 'light')), 'no light items (W22)');
  for (const m of Object.values(content.materials)) assert.ok(!/torch|lantern|muster|ember|veil/i.test(m.id + ' ' + m.name), m.id);
  for (const prof of ['smithing', 'outfitting', 'alchemy', 'cooking']) assert.ok(P.recipes.some(r => r.prof === prof && r.skill === 1), prof + ' has something to make at skill 1');
});

test('crafted gear is semi-random inside a band: level under yours and under the tier cap, rarity never above rare', () => {
  const rc = P.recipe('blades_1');
  assert.equal(P.gearLevel(rc, 1), 1); assert.equal(P.gearLevel(rc, 6), 5); assert.equal(P.gearLevel(rc, 30), 10, 'bronze tops out at level 10');
  assert.equal(P.canCraft(rc, { skill: 1, counts: { bronze_bar: 2 }, gold: 99, station: ['smithing'] }).why, 'needs');
  assert.equal(P.canCraft(rc, { skill: 1, counts: { bronze_bar: 3 }, gold: 0, fee: 5, station: ['smithing'] }).why, 'gold');
  assert.equal(P.canCraft(rc, { skill: 1, counts: { bronze_bar: 3 }, gold: 99, station: ['alchemy'] }).why, 'station');
  assert.equal(P.canCraft(rc, { known: false }).why, 'notLearned');
  assert.equal(P.canCraft(rc, { skill: 1, counts: { bronze_bar: 3 }, gold: 99, station: ['smithing'], level: 1, base: 'longsword' }).why, 'base', 'a level-6 pattern is not for a level-1 smith');
  assert.equal(P.craftResult(rc, { quality: 'fail' }).gear, null);
  const rng = seeded(11), seen = { normal: 0, magic: 0, rare: 0 };
  for (let i = 0; i < 4000; i++) { const g = P.craftResult(rc, { quality: 'perfect', skill: 100, level: 50, rng }).gear; seen[g.rarity]++; assert.ok(g.level <= 10 && !(g.extraAffix && g.rarity === 'rare')); }
  assert.deepEqual(Object.keys(seen).sort(), ['magic', 'normal', 'rare'], 'never legendary');
  assert.ok(seen.rare > 0 && seen.rare < 4000 * 0.3 && seen.magic > seen.rare);
  for (let i = 0; i < 500; i++) assert.equal(P.craftResult(rc, { quality: 'poor', skill: 100, level: 50, rng }).gear.rarity, 'normal', 'rough work is plain');
});

test('crafted gear is never strictly better than a same-level dungeon rare', () => {
  // a dungeon rare of level L: rarity rare at item level L. The best a crafter can do at level L: rarity rare (12-21% of
  // perfect games) at item level L - 1, made by the SAME item maker — so every input is at or below the drop's.
  const score = it => (it.dmg ? (it.dmg[0] + it.dmg[1]) / 2 : it.armor || 0) + (it.affixes || []).reduce((a, x) => a + (typeof x.value === 'number' && x.min != null ? x.value / Math.max(1, x.max) : 0), 0) * 3;
  for (const L of [5, 10, 20, 30]) {
    const rc = P.recipes.find(r => r.pattern === 'blades' && r.tier === P.tierForLevel(L).tier);
    const rng = seeded(L);
    let craft = 0, drop = 0, maxCraftAff = 0, n = 400;
    for (let i = 0; i < n; i++) {
      const order = P.craftResult(rc, { quality: 'perfect', skill: 100, level: L, base: 'sword', rng }).gear;
      assert.ok(order.level <= L - 1 && order.level >= 1, 'item level under the crafter\'s');
      const a = engine.makeItem({ base: 'sword', rarity: order.rarity, level: order.level, rng });
      const b = engine.makeItem({ base: 'sword', rarity: 'rare', level: L, rng });
      craft += score(a); drop += score(b);
      maxCraftAff = Math.max(maxCraftAff, a.affixes.length + (order.extraAffix ? 1 : 0));
      assert.ok(a.affixes.length + (order.extraAffix ? 1 : 0) <= b.affixes.length, 'never more properties than a rare');
    }
    assert.ok(craft / n < drop / n, `level ${L}: crafted ${(craft / n).toFixed(1)} < dungeon rare ${(drop / n).toFixed(1)}`);
  }
});

test('tempering: quality up as far as skill allows, promote stops at rare, reweave swaps one property, brand once — and the item always survives', () => {
  const rng = seeded(3);
  const mk = (rarity, level = 6, base = 'longsword') => engine.makeItem({ base, rarity, level, rng });
  // quality
  let it = mk('magic');
  const q0 = it.quality, d0 = it.dmg.slice();
  let chk = temperCheck(P, engine, 'temper_quality', it, { skill: 1 });
  if (q0 === 'low') { assert.ok(chk.ok && chk.to === 'medium'); assert.ok(temperApply(P, engine, 'temper_quality', it, { skill: 1, rng }).ok); assert.equal(it.quality, 'medium'); assert.ok(it.dmg[1] > d0[1]); }
  it.quality = 'medium';
  assert.equal(temperCheck(P, engine, 'temper_quality', it, { skill: 1 }).why, 'skill', 'high quality needs Tempering 25');
  assert.ok(temperCheck(P, engine, 'temper_quality', it, { skill: 25 }).ok);
  it.quality = 'exotic'; assert.equal(temperCheck(P, engine, 'temper_quality', it, { skill: 100 }).why, 'max');
  // promote
  it = mk('normal');
  assert.ok(temperApply(P, engine, 'temper_promote', it, { rng }).ok); assert.equal(it.rarity, 'magic'); assert.ok(it.affixes.length >= 1);
  assert.ok(temperApply(P, engine, 'temper_promote', it, { rng }).ok); assert.equal(it.rarity, 'rare');
  assert.equal(temperCheck(P, engine, 'temper_promote', it).why, 'max', 'never above rare');
  const pack = mk('normal', 6, 'sling_satchel'); temperApply(P, engine, 'temper_promote', pack, { rng }); temperApply(P, engine, 'temper_promote', pack, { rng });
  assert.ok(pack.rarity === 'rare' && pack.affixes.filter(a => !a.baseIntrinsic && !a.intrinsic).length <= 1 && pack.bagSlots === 4, 'a backpack keeps its one property (W19)');
  // reweave
  it = mk('rare');
  const was = it.affixes[0].id, others = it.affixes.slice(1).map(a => a.id);
  const rw = temperApply(P, engine, 'temper_reweave', it, { index: 0, rng });
  assert.ok(rw.ok && it.affixes[0].id !== was && !others.includes(it.affixes[0].id) && it.affixes.length === others.length + 1);
  assert.equal(temperCheck(P, engine, 'temper_reweave', it, { index: 9 }).why, 'index');
  // brand
  it = mk('magic');
  assert.equal(temperCheck(P, engine, 'temper_brand', it, { element: 'jam' }).why, 'element');
  assert.equal(temperCheck(P, engine, 'temper_brand', mk('normal'), { element: 'fire' }).why, 'item');
  const n0 = it.affixes.length;
  assert.ok(temperApply(P, engine, 'temper_brand', it, { element: 'fire', rng, quality: 'perfect' }).ok);
  assert.ok(it.brand === 'fire' && it.affixes.length === n0, 'the brand replaces a property; the item is not simply richer');
  assert.equal(temperCheck(P, engine, 'temper_brand', it, { element: 'ice' }).why, 'item', 'one brand per weapon');
  assert.equal(temperCheck(P, engine, 'temper_brand', mk('magic', 6, 'medium_chest'), { element: 'fire' }).why, 'item');
  // what cannot be touched
  assert.equal(temperCheck(P, engine, 'temper_quality', { kind: 'potion' }).why, 'item');
  assert.equal(temperCheck(P, engine, 'temper_quality', { ...mk('rare'), rarity: 'legendary' }).why, 'item');
  // costs: the item's own tier material, by what it is made of
  assert.equal(matClassOf(engine, mk('magic')), 'metal'); assert.equal(matClassOf(engine, mk('magic', 6, 'bow')), 'wood');
  assert.equal(matClassOf(engine, mk('magic', 6, 'cloth_chest')), 'cloth'); assert.equal(matClassOf(engine, mk('magic', 6, 'light_chest')), 'leather');
  const c1 = temperCost(P, engine, 'temper_quality', mk('magic', 4), priceOf(mk('magic', 4))), c2 = temperCost(P, engine, 'temper_quality', mk('magic', 12), 5000);
  assert.deepEqual(c1.needs, [{ id: 'bronze_bar', n: 2 }]); assert.equal(c1.skill, 1); assert.ok(c1.gold >= 1);
  assert.equal(c2.needs[0].id, 'iron_bar'); assert.equal(c2.skill, 25); assert.equal(c2.gold, 200);
});
