// Stream E — play-test 6 U17 ("make healing potions not nearly useless"): where potions are sold, for how much, and
// what drops. What a potion RESTORES is js/sim/consumables.js (stream C's numbers) — checked here against the report.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POTIONS, potionAmount, effectOf, POTION_CD_MS } from '../../js/sim/consumables.js';
import { KILL_GOLD } from '../../js/sim/quests.js';

const root = new URL('../../', import.meta.url);
const J = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const S = J('data/provinces/shops.json'), ITEMS = J('../emberveil/data/items.json');

test('U17: a healing potion is worth drinking — at least 45% of your health at any level, on a cooldown of 20 s or less', () => {
  const ef = effectOf({ kind: 'potion', id: 'healing_potion', effect: ITEMS.potions.healing_potion.effect });
  for (const hp of [120, 184, 280, 450, 900, 2000]) { const got = potionAmount(ef, hp, 100).hp; assert.ok(got >= 0.45 * hp, `healing potion at ${hp} health restores ${got}`); }
  const big = effectOf({ kind: 'potion', id: 'greater_healing', effect: ITEMS.potions.greater_healing.effect });
  assert.ok(potionAmount(big, 1000, 100).hp >= 700, 'greater healing');
  assert.ok(POTION_CD_MS <= 20000);
  assert.ok(POTIONS.healing_potion.pct >= 0.45);
});

test('U17: every town can sell you one — plain at the general store, healer and apothecary; greater from level 5; a potion costs about two kills', () => {
  const has = (k, id) => S.kinds[k].goods.find(g => g.id === id);
  for (const k of ['general', 'apothecary', 'healer']) { const g = has(k, 'healing_potion'); assert.ok(g && g.minLevel === 1 && g.price <= KILL_GOLD(1) * 3, k); }
  for (const k of ['apothecary', 'healer']) { const g = has(k, 'greater_healing'); assert.ok(g && g.minLevel <= 5 && g.price <= KILL_GOLD(5) * 3, k + ' greater'); }
  for (const t of Object.values(S.towns)) if (t.shops) assert.ok(t.shops.some(k => (S.kinds[k].goods || []).some(g => g.id === 'healing_potion')), 'a town with no potion seller');       // the roadside inn sells one too
  for (const k of ['apothecary', 'healer']) assert.deepEqual(S.roles[S.kinds[k].role].goods, S.kinds[k].goods, 'run tools/content-shops.mjs');
});

test('U17: potions drop — a real chance per rank, always from a boss, and every row names real potions', () => {
  const D = S.potionDrops;
  assert.ok(D.chance.normal >= 0.04 && D.chance.normal <= 0.15 && D.chance.boss === 1 && D.chance.rare > D.chance.champion && D.chance.champion > D.chance.normal);
  assert.ok(D.table.some(r => r[0] === 1 && r[1] === 'healing_potion'), 'a healing potion from level 1');
  for (const [lv, id] of D.table) assert.ok(lv >= 1 && ITEMS.potions[id] && POTIONS[id], 'potion ' + id);
  assert.ok(D.table.every((r, i) => !i || r[0] >= D.table[i - 1][0]));
  assert.ok(D.table.some(r => r[1] === 'greater_healing' && r[0] <= 6));
  // a newcomer's 40 kills bring two or three potions
  assert.ok(40 * D.chance.normal >= 2);
});
