// Round 11 (owner's live play-test list, 2026-10-15) — the World stream's content half. What the owner said, and what
// each test holds the data to:
//   #30 / #35  "kill 6 fen croakers — I found 3 … killed 4 dust flitters, there are no more … enough enemies for several
//              players": EVERY kill / collect step of BOTH provinces has needFor(count) = max(count + 4, 2 x count) of its
//              monster where it counts (the camps the server really spawns), and the quest camps come back in 1–1.5 min.
//   #31        "the next step is way far away, in the direction I came from": every class quest's steps are within 150 m
//              of the one before (the Star Blade's own rule, now for all of them).
//   #32        "Bettony has a shop button but nothing to sell — don't call her an herbalist": no placed NPC keeps the
//              herbalist role without a shop; the dialog's shop button is the server's word only.
//   #47        "Spare ribbon … You feel stronger — does it ACTUALLY?": every vignette `use.buff` names a real blessing, and
//              the sentence the player reads comes from its numbers.
//   #48        two reptile mounts on Vharlen: priced, sold there only, dearer = faster across the whole table, with a body.
//   #52        "lots of NPCs say 'Have you seen my goat?' at the same time": one bark at a time, never the same line twice.
//   #45        carts leave along the road: a departure path for (nearly) every stop, heading away from the town.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadLayouts } from '../../server/load.mjs';
import { createQuestBook } from '../../js/sim/quests.js';
import { headsIn, regionOf, stepType, needFor, QUEST_RESPAWN_MIN } from '../../tools/content-hunts.mjs';
import { BLESSINGS, blessingText, applyBlessing, blessMove } from '../../js/rules/blessings.js';
import { createBarkGate, BARK_RULES } from '../../js/sim/barks.js';
import { departPath, createCarts } from '../../js/sim/carts.js';
import { createMountBook } from '../../js/sim/mounts.js';
import { configureEconomy } from '../../js/sim/economy-knobs.js';
import { mergeMounts } from '../../js/sim/province.js';
import { MOUNT_TYPES, mountSpecFor } from '../../../../avatar-3d/js/mount-types.js';

const root = new URL('../../', import.meta.url);
const readJ = f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const q = console.log; console.log = () => {};
const { layouts } = await loadLayouts(['torbor_downs', 'vharlen']);
console.log = q;
const byKey = Object.fromEntries(layouts.map(L => [L.key, L]));

test('#30 #35: every kill / collect step in both provinces has enough of its monster for two players at once', () => {
  assert.deepEqual([needFor(1), needFor(4), needFor(6), needFor(8)], [5, 8, 12, 16], 'the rule: max(count + 4, 2 x count)');
  const bad = [];
  let steps = 0;
  for (const L of layouts) {
    const book = createQuestBook({ layout: L, zones: L.zones, rares: L.rares, jobs: null, rng: () => 0.3 });
    for (const d of book.defs.values()) d.steps.forEach((st, i) => {
      const type = stepType(st); if (!type || !st.at) return;
      steps++;
      const have = headsIn(L.camps, type, regionOf(st)), need = needFor(st.count || 1);
      if (have < need) bad.push(`${L.key} ${d.id}#${i}: ${have}/${need} ${type}`);
    });
  }
  console.log(`# ${steps} kill/collect steps checked over two provinces`);
  assert.ok(steps >= 150, 'steps found: ' + steps);
  assert.deepEqual(bad, []);
});

test('#30 #35: the owner\'s two cases, and the quest camps come back quickly', () => {
  const L = byKey.torbor_downs;
  const book = createQuestBook({ layout: L, zones: L.zones, rares: L.rares, jobs: null, rng: () => 0.3 });
  for (const [id, type] of [['croakers_in_the_keepnet', 'fen_croaker'], ['bats_in_the_timber', 'dusk_flitter']]) {
    const st = book.defs.get(id).steps.find(s => stepType(s) === type);
    assert.ok(headsIn(L.camps, type, regionOf(st)) >= needFor(st.count), id);
  }
  const quest = L.camps.filter(c => /^quest_/.test(c.place || ''));
  assert.ok(quest.length >= 100, 'quest camps loaded: ' + quest.length);
  for (const c of quest) assert.deepEqual(c.respawnMs, QUEST_RESPAWN_MIN.map(m => m * 60000), c.place);
});

test('#31: every class quest keeps its steps within 150 m of each other', () => {
  const CQ = readJ('data/quests/classes.json'), M = readJ('data/quests/marks/torbor_downs.json').quests;
  assert.ok(CQ.quests.length >= 32);
  for (const qq of CQ.quests) {
    const m = M[qq.id];
    assert.ok(m && m.steps.length === qq.steps.length && m.steps.every(Boolean), qq.id + ': a mark for every step');
    for (let i = 1; i < m.steps.length; i++) {
      const a = m.steps[i - 1], b = m.steps[i], d = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(d < 150, `${qq.id}: step ${i} -> ${i + 1} is ${Math.round(d)} m`);
    }
  }
  // the owner's case: the Starcaller's flitters are at the Nine Maidens now, and there are enough of them there
  const L = byKey.torbor_downs, book = createQuestBook({ layout: L, zones: L.zones, rares: L.rares, jobs: null, rng: () => 0.3 });
  const st = book.defs.get('class_starcaller').steps[1];
  assert.equal(st.near, 'sp_nine_maidens');
  assert.ok(headsIn(L.camps, 'dusk_flitter', regionOf(st)) >= needFor(st.count));
});

test('#31: every use step names an object its set piece really has', () => {
  const objs = new Map();
  const walk = (x, sp) => { if (Array.isArray(x)) x.forEach(v => walk(v, sp)); else if (x && typeof x === 'object') { if (x.id && /^sp_/.test(x.id) && Array.isArray(x.objects)) objs.set(x.id, new Set(x.objects.map(o => o.name))); for (const v of Object.values(x)) walk(v, sp); } };
  walk(readJ('data/vignettes/setpieces.json'));
  for (const qq of readJ('data/quests/classes.json').quests) for (const st of qq.steps) if (st.kind === 'use') {
    assert.ok(objs.get(st.vignette)?.has(st.object), `${qq.id}: ${st.vignette} has "${st.object}"`);
  }
});

test('#32: no placed NPC is called an herbalist with nothing to sell; Bettony is a wise woman', () => {
  for (const f of readdirSync(new URL('data/vignettes/placements/', root))) {
    if (!f.endsWith('.json')) continue;
    for (const p of readJ('data/vignettes/placements/' + f).placements || []) {
      if (p.type === 'npc' && p.role === 'herbalist') assert.ok(p.shop, `${f}: ${p.name} is an herbalist with no shop`);
      if (p.type === 'folk' && p.role === 'herbalist') assert.notEqual(p.name, 'Herbalist', `${f}: a herb gatherer, not a shop`);
    }
  }
  assert.equal(readJ('data/quests/marks/givers.json').npcs.bettony.role, 'wise_woman');
  const pt2 = readFileSync(new URL('js/client/ui/pt2.js', root), 'utf8');
  assert.match(pt2, /u\.shop \|\| \(u\.shop === undefined && u\.kind !== 'npc'/, 'the dialog\'s shop button follows the server');
});

test('#47: every vignette blessing is real, and says exactly what it does', () => {
  const words = new Set();
  const walk = x => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { if (x.type === 'use' && x.buff) words.add(x.buff.status); for (const v of Object.values(x)) walk(v); } };
  for (const f of readdirSync(new URL('data/vignettes/', root))) if (f.endsWith('.json')) walk(readJ('data/vignettes/' + f));
  assert.ok(words.size >= 5);
  for (const w of words) assert.ok(BLESSINGS[w], 'a blessing for ' + w);
  assert.equal(blessingText({ status: 'haste', seconds: 240 }), 'Light-footed: 10% faster on foot for 4 minutes.');
  assert.equal(blessingText({ status: 'rally', seconds: 300 }), 'Heartened: 4% more damage and 4% less damage taken for 5 minutes.');
  const u = { statuses: {} };
  const r = applyBlessing(u, { status: 'haste', seconds: 240 });
  assert.ok(r.ok && r.id === 'bless:haste' && u.statuses['bless:haste'].remaining === 240);
  assert.equal(blessMove(u), 0.1);
  applyBlessing(u, { status: 'might', seconds: 9999 });
  assert.equal(u.statuses['bless:might'].remaining, 600, 'capped');
  assert.equal(u.statuses['bless:might'].damage, BLESSINGS.might.damage);
  assert.deepEqual(applyBlessing(u, { status: 'nonsense' }), { ok: false });
});

test('#48: two Vharlen lizards — sold on Vharlen only, priced, dearer = faster, with their own bodies', () => {
  configureEconomy(readJ('data/provinces/economy.json'));      // E's prices (the server installs them at boot)
  const merged = createMountBook(mergeMounts(layouts.map(L => L.mounts)));
  const alone = createMountBook(mergeMounts([byKey.vharlen.mounts]));
  for (const book of [merged, alone]) {
    for (const id of ['trail_horse', 'pony', 'courser', 'dray', 'ash_strider', 'slag_basker']) assert.ok(book.get(id), id + ' in the table');
    const priced = book.list.filter(m => m.price > 0).sort((a, b) => a.price - b.price);
    for (let i = 1; i < priced.length; i++) assert.ok(priced[i].speed > priced[i - 1].speed, `${priced[i].id} (${priced[i].price} g) is faster than ${priced[i - 1].id}`);
  }
  assert.equal(merged.get('ash_strider').level, 10); assert.equal(merged.get('slag_basker').level, 15);
  const vs = readJ('data/provinces/vharlen-shops.json'), ts = readJ('data/provinces/shops.json');
  for (const id of ['ash_strider', 'slag_basker']) {
    assert.ok(vs.kinds.stable.goods.some(g => g.id === id) && vs.roles.stablehand.goods.some(g => g.id === id), id + ' at Vharlen stables');
    assert.ok(!JSON.stringify(ts).includes(id), id + ' not on Torbor shelves');
    assert.ok(MOUNT_TYPES[id], id + ' has a mount body');
    assert.equal(mountSpecFor(id).type, id, id + ' never falls back to a horse');
  }
  // [D-world round 11, Z47] each rides its OWN lizard body now (avatar-3d creature-types.js ash_strider / slag_basker), not a recoloured frame
  assert.equal(mountSpecFor('slag_basker').creature, 'slag_basker');
  assert.equal(mountSpecFor('ash_strider').creature, 'ash_strider');
});

test('#52: one bark at a time, never the same line twice in a row, at most three in twenty seconds', () => {
  const g = createBarkGate(), pool = ['Have you seen my goat?', 'Fine weather.', 'Mind the ash.', 'Fish today.'];
  let t = 0;
  const first = g.pick(pool, t, () => 0);
  assert.equal(first, 'Have you seen my goat?');
  assert.equal(g.pick(pool, t, () => 0), null, 'a second NPC in the same instant says nothing');
  assert.equal(g.pick(pool, t + 1000, () => 0), null, 'still inside the gap');
  const second = g.pick(pool, t + BARK_RULES.GAP_MS, () => 0);
  assert.ok(second && second !== first, 'the next one says something else');
  const third = g.pick(pool, t + 2 * BARK_RULES.GAP_MS, () => 0);
  assert.ok(third && ![first, second].includes(third));
  assert.equal(g.pick(pool, t + 3 * BARK_RULES.GAP_MS, () => 0), null, 'three in the burst window is the most');
  const later = g.pick(pool, t + BARK_RULES.BURST_MS + 1, () => 0);
  assert.equal(later, 'Fish today.', 'only the line not said lately');
  assert.equal(g.pick(pool, t + BARK_RULES.BURST_MS + BARK_RULES.GAP_MS + 2, () => 0), null, 'every line said lately: quiet');
  assert.equal(g.pick(pool, t + BARK_RULES.REPEAT_MS + 1, () => 0), 'Have you seen my goat?', 'after two minutes it may come round again');
});

test('#45: a cart leaves along the road — a path for nearly every stop, heading away from its town', () => {
  let n = 0, none = 0, inward = 0;
  for (const L of layouts) {
    const C = createCarts({ data: L.carts, layouts: [L], online: new Map(), setTimeoutTicks: () => {}, moveTo: () => {} });
    const objs = [...(L.objects || []), ...((L.townObjects || []).flat())];
    for (const s of C.stops.values()) {
      const cart = objs.find(o => o.cart && o.cart.stop === s.id); if (!cart) continue;
      const town = (L.towns || []).find(t => t.name === s.town);
      for (const dest of [...C.stops.values()].filter(d => d.id !== s.id).slice(0, 2)) {
        n++;
        const p = departPath(L.travel.routes, { x: cart.x, z: cart.z }, s.town, C.place(dest.id), { centre: town });
        if (!p.length) { none++; continue; }
        assert.deepEqual(p[0], [Math.round(cart.x * 10) / 10, Math.round(cart.z * 10) / 10], 'starts at the cart');
        if (town) { const d0 = Math.hypot(p[0][0] - town.x, p[0][1] - town.z), d1 = Math.hypot(p.at(-1)[0] - town.x, p.at(-1)[1] - town.z); if (d1 < d0) inward++; }
      }
    }
  }
  console.log(`# ${n} rides, ${none} without a path, ${inward} ending nearer the town than they began`);
  assert.ok(n >= 100 && none / n < 0.05, `${none} of ${n} without a path`);
  assert.ok(inward / n < 0.1, `${inward} of ${n} ride back into town`);
  // with no road at all: straight out, away from the middle
  assert.deepEqual(departPath([], { x: 110, z: 100 }, 'X', { x: 0, z: 0 }, { centre: { x: 100, z: 100 } }), [[110, 100], [150, 100]]);
});
