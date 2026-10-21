// Feedback #96 (2026-10-21): "I took the boat to the new island and went to that dungeon near the first town … it
// teleported me to the corner of the ocean." The Brineglass Tubes is a lava tube, which borrows the cave-river layout,
// and its river points are {x, z} objects where the dungeon view destructured [x, z] pairs — createDungeonView threw
// "object is not iterable", the client never left the outdoor world, and the dungeon's own coordinates (x 21, z 39) put
// the player on the far corner of the sea. This builds the view of EVERY dungeon family, eight seeds each, in a real
// browser (the view needs a canvas), straight from the generator the server uses.
// Run: flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/dungeon-families.spec.js
import { test, expect } from '@playwright/test';

const FAMILIES = ['crypt_spiral', 'mine_descent', 'flooded_cistern', 'fortress_keep', 'cave_river', 'tower_climb', 'barrow_maze', 'sunken_temple',
  'lava_tube', 'steam_grotto', 'sulphur_mine', 'drowned_vent', 'glass_tomb', 'buried_town', 'kiln_forge', 'caldera_deep'];

test('every dungeon family, eight seeds each, builds its view without throwing', async ({ page }) => {
  test.setTimeout(300000);
  await page.goto('prototypes/thousandvale/tests/D/fixtures/dungeon-view.html');
  const failed = await page.evaluate(async families => {
    const T = '/prototypes/thousandvale/js/';
    const { planDungeon } = await import(T + 'rules/dungeon-tiers.js');
    const { dungeonTerrain, describeDungeon } = await import(T + 'sim/dungeon.js');
    const { createDungeonView } = await import(T + 'client/dungeon-view.js');
    const out = [];
    for (const family of families) for (let s = 1; s <= 8; s++) {
      try {
        const plan = planDungeon(1000 + s * 17, { floors: 2, level: 11, family });
        const d = JSON.parse(JSON.stringify(describeDungeon(plan, dungeonTerrain(plan))));      // what the wire carries
        const v = createDungeonView(d, { quality: 'high' });
        v.dispose?.();
      } catch (e) { out.push(`${family} seed ${s}: ${e.message}`); }
    }
    return out;
  }, FAMILIES);
  expect(failed, failed.join('\n')).toEqual([]);
});
