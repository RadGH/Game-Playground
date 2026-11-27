// Oathwild — write data/placements.json from the hand layout below (world builder 2026-11-23).
//
//   node prototypes/oathwild/tools/place-world.mjs            check + print what moved (no write)
//   node prototypes/oathwild/tools/place-world.mjs --write    write data/placements.json
//
// The LAYOUT below is the source: every building, prop, quest object and roam zone is placed by hand at a spot
// near where it should be; the tool nudges each one (a small spiral, never more than `nudge` metres) until its
// footprint is on walkable, dry, gentle ground, clear of roads, bridges, NPCs and everything placed before it
// (lessons rule 25). Shrines and chests come from data/regions.json, camps from regions.json + data/map.json.
// Buildings and props face their `face` target (a place id or [x, z]); `facing` = three.js rotation.y for a
// model whose front looks down -Z (data/art.json), i.e. facing = atan2(-dx, -dz).
import { readFileSync, writeFileSync } from 'node:fs';
import { createTerrain } from '../js/world/terrain.js';

const here = p => new URL(p, import.meta.url);
const J = p => JSON.parse(readFileSync(here(p), 'utf8'));
const map = J('../data/map.json'), regions = J('../data/regions.json'), npcs = J('../data/npcs.json'), art = J('../data/art.json'), towns = J('../data/towns.json');
// a townsperson's work spot (data/towns.json spots) is where they stand — it wins over npcs.json `at` (written back with --write)
for (const t of Object.values(towns)) for (const s of t.spots || []) if (npcs.npcs[s.npc]) npcs.npcs[s.npc].at = s.at;
const T = createTerrain(map);
const SCEN = Object.fromEntries(art.scenery.map(s => [s.id, s]));

/** Footprint radius from art.json (real size, planned size, or the placeholder's size). */
function radiusOf(id, fallback = 1) {
  const s = SCEN[id];
  if (!s) return fallback;
  const sz = s.size || s.placeholder?.size;
  if (Array.isArray(sz)) return Math.round(Math.hypot(sz[0], sz[2]) / 2 * 0.85 * 100) / 100;
  const p = s.plannedSize || {};
  if (p.long) return p.long / 2;
  if (p.tall) return Math.max(0.4, p.tall * (s.kind === 'building' ? 0.45 : 0.3));
  return fallback;
}

// ---------------------------------------------------------------- the layout
const P = id => map.places[id].at;
const off = (id, dx, dz) => [P(id)[0] + dx, P(id)[1] + dz];

const BUILDINGS = [
  // Larkford (town round 2026-11-25): only the landmarks are placed by hand; js/world/town.js lines every street with
  // houses, yards, lamps and stalls from data/towns.json. The inn fronts the square, the elder's house sits on West
  // Street, the tower on its terrace at the top of the hill, the smithy and the stable at the east way in.
  { id: 'fiddlers_rest', name: "The Fiddler's Rest", art: 'inn', at: [-285.5, 6.5], face: [-263, 6.5], role: 'inn', nudge: 1 },
  { id: 'larkford_smithy', name: 'The Smithy', art: 'smithy', at: [-214, -12.5], face: [-214, 0], role: 'smithy', nudge: 1 },
  { id: 'larkford_stable', name: 'The Stable', art: 'cottage-log', at: [-213, 8.5], face: [-213, -6], role: 'stable', nudge: 1 },
  { id: 'lark_tower', name: 'Lark Tower', art: 'watchtower', at: [-330, -16], face: [-300, -12], role: 'tower', nudge: 1 },
  { id: 'maren_house', name: "The Elder's House", art: 'cottage-stone', at: [-313, -21], face: [-313, 0], nudge: 1 },
  { id: 'larkford_mill', name: 'Larkford Mill', art: 'watermill', at: [-206, -50], face: 'larkford' },
  { id: 'ada_hut', name: "The Shepherd's Hut", art: 'cottage-thatch', at: off('ada_fold', 14, -14), face: 'ada_fold' },
  { id: 'knoll_tower', name: 'Watch Knoll Tower', art: 'watchtower', at: P('watchtower'), face: [-8, 62] },
  // Thornwatch: a log lodge, cabins and a lookout
  { id: 'thornwatch_lodge', name: 'Thornwatch Lodge', art: 'cottage-log', at: off('thornwatch', 2, -30), face: 'thornwatch', role: 'lodge' },
  { id: 'tw_cabin_1', name: 'Cabin', art: 'cottage-log', at: off('thornwatch', -28, -12), face: 'thornwatch' },
  { id: 'tw_cabin_2', name: 'Cabin', art: 'cottage-log', at: off('thornwatch', 30, -14), face: 'thornwatch' },
  { id: 'tw_store', name: 'Thornwatch Stores', art: 'cottage-stone', at: off('thornwatch', -20, -36), face: 'thornwatch', role: 'shop' },
  { id: 'tw_lookout', name: 'Thornwatch Lookout', art: 'lookout', at: off('thornwatch', 34, 10), face: 'thornwatch' },
  // camps and set pieces
  { id: 'goblin_hut_1', name: 'Goblin Hut', art: 'goblin-hut', at: off('goblin_warren', -12, -10), face: 'goblin_warren' },
  { id: 'goblin_hut_2', name: 'Goblin Hut', art: 'goblin-hut', at: off('goblin_warren', 12, -12), face: 'goblin_warren' },
  { id: 'goblin_hut_3', name: 'Goblin Hut', art: 'goblin-hut', at: off('goblin_warren', -2, 16), face: 'goblin_warren' },
  { id: 'bandit_lookout', name: 'Bandit Lookout', art: 'lookout', at: off('bandit_camp', 14, -12), face: 'bandit_camp' },
  { id: 'hag_hut', name: "The Hag's Hut", art: 'hag-hut', at: off('ruins', 12, 14), face: 'ruins' },
  { id: 'ruin_tower', name: 'Drowned Tower', art: 'ruin-tower', at: off('ruins', -16, -10), face: 'ruins' },
  { id: 'barrow_mouth', name: 'The Barrow Mouth', art: 'barrow-entrance', at: off('barrow', 12, -14), face: [520, -262] },
];

// [art, at, face?] — clutter and set dressing
const PROPS = [
  // Larkford's lamps, stalls, fountain, barrels and yards come from the town plan (data/towns.json); by hand only:
  ['wanted-board', [-235.2, -8.4], [-235.2, 0]], ['anvil', [-219.6, -9.2]], ['trough', [-218.4, 10]], ['haystack', [-207, 13]],
  ['woodpile', [-208.4, -11.5]], ['signpost', [-206.5, -7.6]], ['banner-village', [-203.5, 2.6]], ['banner-village', [-203.5, -8.8]],
  ['pumpkins', [-304, 62]], ['haystack', [-330, 70]], ['scarecrow-post', [-335, 40]], ['scarecrow-post', [-345, -36]], ['wheelbarrow', [-320, -64]],
  ['sacks', [-214, -40]], ['barrel', [-210, -36]], ['rowboat', [-194, 16]], ['fish-rack', [-200, 20]],
  ['fence-rail', [-150, -96]], ['fence-rail', [-150, -120]], ['fence-rail', [-128, -124]], ['fence-rail', [-128, -92]], ['haystack', [-142, -126]], ['trough', [-134, -96]],
  ['signpost', [-36, 14]], ['signpost', [62, 8]], ['road-marker', [20, 12]], ['road-marker', [210, -26]], ['signpost', [150, -20]], ['signpost', [-92, 196]], ['signpost', [252, -218]],
  ['stone-wall-low', [-110, -30]], ['fence-rail', [-190, 96]], ['fence-rail', [-222, 116]],
  // Thornwatch
  ['tent-large', off('thornwatch', -10, 18)], ['tent-small', off('thornwatch', 14, 22)], ['tent-small', off('thornwatch', 26, 26)], ['campfire', off('thornwatch', 4, 4)],
  ['weapon-rack', off('thornwatch', 18, -26)], ['barrel', off('thornwatch', -14, -24)], ['crate-stack', off('thornwatch', -26, -26)], ['banner-village', [150, -40]], ['woodpile', off('thornwatch', -30, 8)],
  // bandit camp
  ['tent-large', off('bandit_camp', -10, 8)], ['tent-small', off('bandit_camp', 8, 12)], ['tent-small', off('bandit_camp', -14, -6)], ['campfire', P('bandit_camp')],
  ['banner-bandit', off('bandit_camp', 4, -14)], ['cage', off('bandit_camp', -16, 12)], ['crate-stack', off('bandit_camp', 12, 2)], ['stolen-goods', off('bandit_camp', -4, 16)], ['bedroll', off('bandit_camp', 6, -6)],
  // goblin warren
  ['goblin-totem', P('goblin_warren')], ['junk-pile', off('goblin_warren', 8, 8)], ['junk-pile', off('goblin_warren', -14, 4)], ['spike-barricade', off('goblin_warren', 18, 14)], ['spike-barricade', off('goblin_warren', 20, 0)], ['campfire', off('goblin_warren', 4, -2)],
  // rook's hideout
  ['tent-small', off('rook_hideout', -6, -6)], ['campfire', P('rook_hideout')], ['fish-rack', off('rook_hideout', 6, -4)], ['woodpile', off('rook_hideout', -8, 6)],
  // the old hill shrine
  ['standing-stone-a', off('old_shrine_cult', -14, 0)], ['standing-stone-a', off('old_shrine_cult', 14, 0)], ['standing-stone-a', off('old_shrine_cult', 0, -14)], ['standing-stone-a', off('old_shrine_cult', 0, 14)], ['statue-broken', off('old_shrine_cult', 10, -10)],
  // druid circle
  ['standing-stone-a', off('druid_circle', -16, 0)], ['standing-stone-b', off('druid_circle', 16, 0)], ['standing-stone-a', off('druid_circle', 0, -16)], ['standing-stone-b', off('druid_circle', 0, 16)],
  ['standing-stone-a', off('druid_circle', 11, 11)], ['standing-stone-b', off('druid_circle', -11, -11)], ['druid-stone', P('druid_circle')], ['antler-totem', off('druid_circle', -12, 12)], ['wicker-effigy', off('druid_circle', 12, -12)],
  // blighted grove
  ['dead-tree', off('blighted_grove', -8, -6)], ['dead-tree', off('blighted_grove', 9, 4)], ['mushroom-giant', off('blighted_grove', -4, 10)], ['mushroom-giant', off('blighted_grove', 6, -10)], ['bog-plant', off('blighted_grove', 0, 0)],
  // troll bridge, scarback, redtusk, ogre hill
  ['rubble', off('troll_bridge', 6, 6)], ['boulder', off('troll_bridge', 10, -6)], ['loot-sack', off('troll_bridge', 4, -8)],
  ['rock-large', off('scarback_den', -8, -4)], ['rock-large', off('scarback_den', 6, -8)], ['log-hollow', off('scarback_den', 6, 6)],
  ['tent-small', off('redtusk_camp', -10, -6)], ['tent-small', off('redtusk_camp', 8, -10)], ['campfire', P('redtusk_camp')], ['spike-barricade', off('redtusk_camp', -14, 10)], ['spike-barricade', off('redtusk_camp', 4, 16)], ['banner-bandit', off('redtusk_camp', -2, -16)], ['weapon-rack', off('redtusk_camp', 14, 4)],
  ['boulder', off('ogre_hill', -12, 6)], ['boulder', off('ogre_hill', 10, 10)], ['rock-cluster', off('ogre_hill', 8, -10)], ['campfire', P('ogre_hill')], ['junk-pile', off('ogre_hill', -8, -10)],
  // the barrow downs
  ['gravestone-a', off('barrow', -14, 4)], ['gravestone-b', off('barrow', -16, 10)], ['gravestone-c', off('barrow', -10, 14)], ['gravestone-a', off('barrow', 2, 16)], ['gravestone-b', off('barrow', -20, -4)], ['gravestone-c', off('barrow', 8, 18)],
  ['grave-fence', off('barrow', -22, 14)], ['grave-fence', off('barrow', -4, 22)], ['statue-broken', off('barrow', -18, -16)],
  // drowned ruins
  ['ruin-wall', off('ruins', -10, 12)], ['ruin-wall', off('ruins', 16, -6)], ['ruin-arch', off('ruins', 0, -18)], ['ruin-pillar', off('ruins', -18, 6)], ['ruin-pillar', off('ruins', 18, 8)], ['ruin-pillar', off('ruins', 6, 20)], ['rubble', off('ruins', -6, -8)],
  // black stone, herb hollow, mire
  ['bog-plant', off('black_stone', 6, 4)], ['dead-tree', off('black_stone', -8, 8)], ['reeds', off('herb_hollow', 6, -6)], ['bog-plant', off('herb_hollow', -6, 4)], ['boardwalk', [436, 128]],
];

// quest objects (data/quests.json steps name them). kind: container (a quest item in a loot window) | use
const OBJECTS = [
  { id: 'larkford_bell', name: 'the cracked shrine bell', kind: 'use', art: 'shrine-bell', at: [-257, -30] },
  { id: 'torn_satchel', name: 'a torn satchel', kind: 'container', item: 'a Hollow Choir token', art: 'loot-sack', at: off('riverbank', 4, 6) },
  { id: 'bandit_ledger', name: "the chief's ledger", kind: 'container', item: "the chief's ledger", art: 'stolen-goods', at: off('bandit_camp', -12, 14) },
  { id: 'hill_shrine_flame', name: 'the Old Hill Shrine', kind: 'use', art: 'waystone', at: off('old_shrine_cult', 0, 6) },
  { id: 'oath_tablet', name: 'the circle altar', kind: 'container', item: 'the heartwood tablet', art: 'druid-altar', at: off('druid_circle', -6, -6) },
  { id: 'barrow_seal_1', name: 'a seal-stone', kind: 'use', art: 'standing-stone-b', at: [436, -300] },
  { id: 'barrow_seal_2', name: 'a seal-stone', kind: 'use', art: 'standing-stone-b', at: [530, -296] },
  { id: 'barrow_seal_3', name: 'a seal-stone', kind: 'use', art: 'standing-stone-b', at: [520, -214] },
  { id: 'barrow_crown', name: "the oathbreaker's throne", kind: 'container', item: "the oathbreaker's crown", art: 'sarcophagus', at: off('barrow', 4, -6) },
  { id: 'tansy_sack_1', name: 'a flour sack', kind: 'container', item: 'a flour sack', art: 'sacks', at: [-214, 96] },
  { id: 'tansy_sack_2', name: 'a flour sack', kind: 'container', item: 'a flour sack', art: 'sacks', at: [-194, 112] },
  { id: 'tansy_sack_3', name: 'a flour sack', kind: 'container', item: 'a flour sack', art: 'sacks', at: [-206, 116] },
  { id: 'smuggler_stash', name: 'a hollow under the willow', kind: 'container', item: "a smuggler's bundle", art: 'barrel-open', at: [-160, 136] },
  { id: 'runaway_mare', name: 'Chestnut the mare', kind: 'use', art: 'riding-horse', at: [24, 96] },
  { id: 'spirit_pool_1', name: 'a spirit pool', kind: 'use', art: 'spirit-pool', at: off('blighted_grove', -18, -14) },
  { id: 'spirit_pool_2', name: 'a spirit pool', kind: 'use', art: 'spirit-pool', at: off('blighted_grove', 18, -12) },
  { id: 'barrow_tome_case', name: 'a stone coffin', kind: 'container', item: 'the barrow tome', art: 'sarcophagus', at: [458, -238] },
  { id: 'woodcutter_cage', name: "the woodcutter's cage", kind: 'use', art: 'cage', at: off('ruins', -6, 16) },
];

// roam zones: monsters (and wildlife) that wander a circle; `packs` live at once; levels inside the area's band
const ROAM = [
  { id: 'hartwood_wolves', name: 'Hartwood wolves', kind: 'wildlife', at: [-108, -186], radius: 45, levels: [1, 2], packs: 5, roster: [{ id: 'vale_wolf', weight: 1, pack: [1, 3] }] },   // 5 packs of mostly one: the wolf hunt (6) stays quick
  { id: 'fold_boars', name: 'boars by the fold', kind: 'wildlife', at: [-176, -152], radius: 26, levels: [1, 2], packs: 2, roster: [{ id: 'bristleback', weight: 1, pack: [1, 1] }] },
  { id: 'west_meadow_boars', name: 'west meadow boars', kind: 'wildlife', at: [-420, -40], radius: 45, levels: [1, 2], packs: 2, roster: [{ id: 'bristleback', weight: 2, pack: [1, 1] }, { id: 'vale_wolf', weight: 1, pack: [1, 2] }] },
  { id: 'tansy_scarecrows', name: 'the walking scarecrows', kind: 'roamer', at: [-205, 104], radius: 22, levels: [2, 2], packs: 2, roster: [{ id: 'field_scarecrow', weight: 1, pack: [1, 2] }] },
  { id: 'ford_road_thugs', name: 'thugs on the Ford Road', kind: 'roamer', at: [-205, 160], radius: 26, levels: [2, 2], packs: 2, roster: [{ id: 'road_thug', weight: 2, pack: [1, 2] }, { id: 'cutpurse', weight: 1, pack: [1, 1] }] },
  { id: 'gobbet_scouts', name: 'goblin scouts', kind: 'roamer', at: [-352, -186], radius: 26, levels: [2, 2], packs: 2, roster: [{ id: 'goblin_sneak', weight: 1, pack: [1, 1] }, { id: 'goblin_warrior', weight: 2, pack: [1, 2] }] },
  { id: 'knoll_wildlife', name: 'Watch Knoll wolves and boars', kind: 'wildlife', at: [30, 150], radius: 40, levels: [2, 3], packs: 2, roster: [{ id: 'vale_wolf', weight: 1, pack: [1, 2] }, { id: 'bristleback', weight: 1, pack: [1, 1] }] },
  { id: 'old_hill_slopes', name: 'Choir sentries', kind: 'roamer', at: [-456, 184], radius: 18, levels: [3, 3], packs: 1, roster: [{ id: 'shrine_cultist', weight: 2, pack: [1, 1] }, { id: 'bounty_hunter', weight: 1, pack: [1, 1] }] },
  { id: 'gate_wolves', name: 'Thornmere wolves', kind: 'wildlife', at: [132, 70], radius: 38, levels: [3, 3], packs: 2, roster: [{ id: 'thornmere_wolf', weight: 1, pack: [1, 2] }] },
  { id: 'grove_wilds', name: 'Greenhollow thornlings', kind: 'roamer', at: [214, -122], radius: 30, levels: [3, 4], packs: 2, roster: [{ id: 'thornling', weight: 2, pack: [1, 2] }, { id: 'thornmere_wolf', weight: 1, pack: [1, 2] }] },
  { id: 'heights_lions', name: 'Greenhollow mountain lions', kind: 'wildlife', at: [190, -290], radius: 35, levels: [3, 4], packs: 2, roster: [{ id: 'mountain_lion', weight: 1, pack: [1, 1] }] },
  { id: 'bearwood', name: 'Bearwood bears and lions', kind: 'wildlife', at: [262, 110], radius: 45, levels: [3, 4], packs: 3, roster: [{ id: 'brown_bear', weight: 2, pack: [1, 1] }, { id: 'mountain_lion', weight: 1, pack: [1, 1] }, { id: 'thornmere_wolf', weight: 1, pack: [1, 2] }] },
  { id: 'troll_road_orcs', name: 'orc raiders on the road', kind: 'roamer', at: [300, 30], radius: 30, levels: [3, 4], packs: 2, roster: [{ id: 'orc_grunt', weight: 1, pack: [1, 2] }] },
  { id: 'mire_drowned', name: 'drowned things of the mire', kind: 'roamer', at: [444, 178], radius: 34, levels: [4, 5], packs: 2, roster: [{ id: 'drowned_brute', weight: 2, pack: [1, 1] }, { id: 'water_elemental', weight: 1, pack: [1, 1] }] },
  { id: 'barrow_dead', name: 'the restless dead', kind: 'roamer', at: [466, -212], radius: 24, levels: [4, 4], packs: 3, roster: [{ id: 'skeleton_warrior', weight: 3, pack: [1, 2] }, { id: 'hollowborn', weight: 1, pack: [1, 1] }] },
  { id: 'east_downs_stones', name: 'earth elementals', kind: 'roamer', at: [552, -140], radius: 30, levels: [4, 5], packs: 1, roster: [{ id: 'earth_elemental', weight: 1, pack: [1, 1] }] },
  { id: 'ogre_slopes', name: 'orcs below Ogre Hill', kind: 'roamer', at: [490, 96], radius: 26, levels: [4, 5], packs: 2, roster: [{ id: 'orc_grunt', weight: 1, pack: [1, 2] }] },
  // ---- wildlife round 2026-11-25 (owner: "There is too few enemies in the world … Where are all the wild life?"):
  // grazing and fleeing animals everywhere (temperament in data/monsters.json), farm animals and vermin round
  // Larkford, more of the fighting kind in both regions, bats where the dead are
  // Brightwater Vale: farmland and the town's edge (level 1)
  { id: 'lark_pasture', name: 'the town pasture', kind: 'wildlife', at: [-350, -64], radius: 26, levels: [1, 1], packs: 3, roster: [{ id: 'cow', weight: 3, pack: [1, 2] }, { id: 'field_bull', weight: 1, pack: [1, 1] }] },
  { id: 'fold_sheep', name: "the shepherd's flock", kind: 'wildlife', at: [-158, -126], radius: 22, levels: [1, 1], packs: 3, roster: [{ id: 'sheep', weight: 1, pack: [2, 4] }] },
  { id: 'farm_hens', name: 'hens round the farmhouse', kind: 'wildlife', at: [-300, 84], radius: 12, levels: [1, 1], packs: 2, roster: [{ id: 'hen', weight: 1, pack: [2, 3] }] },
  { id: 'mill_rats', name: 'rats at the mill', kind: 'roamer', at: [-198, -62], radius: 12, levels: [1, 1], packs: 2, roster: [{ id: 'barn_rat', weight: 1, pack: [1, 2] }] },
  { id: 'field_rats', name: 'rats in the corn', kind: 'roamer', at: [-340, 30], radius: 18, levels: [1, 2], packs: 2, roster: [{ id: 'barn_rat', weight: 1, pack: [1, 3] }] },
  // Brightwater Vale: the wild (levels 1-4)
  { id: 'west_vale_deer', name: 'deer of the west vale', kind: 'wildlife', at: [-480, -110], radius: 45, levels: [1, 2], packs: 3, roster: [{ id: 'red_deer', weight: 1, pack: [1, 3] }] },
  { id: 'hartwood_deer', name: 'Hartwood deer', kind: 'wildlife', at: [-40, -240], radius: 40, levels: [1, 2], packs: 3, roster: [{ id: 'red_deer', weight: 2, pack: [1, 3] }, { id: 'raccoon', weight: 1, pack: [1, 2] }] },
  { id: 'riverbank_raccoons', name: 'raccoons on the riverbank', kind: 'wildlife', at: [-168, 40], radius: 30, levels: [1, 1], packs: 3, roster: [{ id: 'raccoon', weight: 1, pack: [1, 2] }] },
  { id: 'downs_horses', name: 'wild horses on the downs', kind: 'wildlife', at: [-170, -300], radius: 45, levels: [2, 2], packs: 2, roster: [{ id: 'wild_horse', weight: 1, pack: [2, 4] }] },
  { id: 'south_meadow_deer', name: 'deer of the south meadows', kind: 'wildlife', at: [-300, 190], radius: 40, levels: [2, 2], packs: 3, roster: [{ id: 'red_deer', weight: 2, pack: [1, 3] }, { id: 'bristleback', weight: 1, pack: [1, 1] }] },
  { id: 'ford_meadow', name: 'the ford meadows', kind: 'wildlife', at: [-20, 130], radius: 36, levels: [2, 2], packs: 3, roster: [{ id: 'red_deer', weight: 2, pack: [1, 2] }, { id: 'vale_wolf', weight: 1, pack: [1, 2] }, { id: 'raccoon', weight: 1, pack: [1, 1] }] },
  { id: 'north_hartwood_wolves', name: 'wolves of the north Hartwood', kind: 'wildlife', at: [10, -290], radius: 40, levels: [2, 2], packs: 3, roster: [{ id: 'vale_wolf', weight: 1, pack: [1, 3] }] },
  { id: 'south_boars', name: 'boars of Bramble Rise', kind: 'wildlife', at: [-250, 280], radius: 40, levels: [2, 2], packs: 3, roster: [{ id: 'bristleback', weight: 2, pack: [1, 2] }, { id: 'red_deer', weight: 1, pack: [1, 2] }] },
  { id: 'goblin_hills_wolves', name: 'wolves of the Gobbet Hills', kind: 'wildlife', at: [-470, -260], radius: 40, levels: [2, 3], packs: 2, roster: [{ id: 'vale_wolf', weight: 1, pack: [1, 2] }, { id: 'bristleback', weight: 1, pack: [1, 1] }] },
  { id: 'old_hill_bats', name: 'bats of the Old Hill', kind: 'roamer', at: [-420, 250], radius: 22, levels: [3, 3], packs: 2, roster: [{ id: 'cave_bat', weight: 1, pack: [1, 3] }] },
  // Thornmere Wilds (levels 5-9)
  { id: 'wilds_deer', name: 'deer of the Wilds', kind: 'wildlife', at: [120, -200], radius: 45, levels: [3, 3], packs: 3, roster: [{ id: 'red_deer', weight: 2, pack: [1, 3] }, { id: 'raccoon', weight: 1, pack: [1, 2] }] },
  { id: 'wilds_horses', name: 'wild horses of the Wilds', kind: 'wildlife', at: [300, -320], radius: 45, levels: [3, 4], packs: 2, roster: [{ id: 'wild_horse', weight: 1, pack: [2, 4] }] },
  { id: 'east_glades', name: 'the east glades', kind: 'wildlife', at: [330, -60], radius: 40, levels: [3, 4], packs: 3, roster: [{ id: 'red_deer', weight: 2, pack: [1, 3] }, { id: 'thornmere_wolf', weight: 1, pack: [1, 2] }] },
  { id: 'pinewood_wolves', name: 'pinewood wolves', kind: 'wildlife', at: [380, -190], radius: 40, levels: [4, 4], packs: 3, roster: [{ id: 'thornmere_wolf', weight: 2, pack: [1, 2] }, { id: 'brown_bear', weight: 1, pack: [1, 1] }] },
  { id: 'mire_edge', name: 'the mire edge', kind: 'wildlife', at: [340, 210], radius: 40, levels: [4, 4], packs: 3, roster: [{ id: 'bristleback', weight: 2, pack: [1, 2] }, { id: 'red_deer', weight: 1, pack: [1, 2] }, { id: 'cave_bat', weight: 1, pack: [1, 2] }] },
  { id: 'barrow_bats', name: 'barrow bats', kind: 'roamer', at: [476, -196], radius: 24, levels: [4, 4], packs: 2, roster: [{ id: 'cave_bat', weight: 1, pack: [1, 2] }] },
  { id: 'ruin_bats', name: 'bats of the drowned ruins', kind: 'roamer', at: [470, 230], radius: 24, levels: [4, 5], packs: 2, roster: [{ id: 'cave_bat', weight: 1, pack: [1, 2] }] },
  { id: 'gate_glade_deer', name: 'deer below the gate', kind: 'wildlife', at: [190, 40], radius: 34, levels: [3, 3], packs: 3, roster: [{ id: 'red_deer', weight: 2, pack: [1, 3] }, { id: 'wild_horse', weight: 1, pack: [1, 2] }] },
];

const ENCOUNTERS = {
  _doc: "Group-size scaling for camp monsters (js/world/encounters.js is the one reader; Guessed, world builder 2026-11-23). `heroScale[rank][n]` = health and damage multipliers when n heroes are in the region (the largest n at or below the count). A boss is tuned for a group by the rules core; a lone hero meets a smaller one. `weaken`: a story flag that makes a camp's boss weaker (the lit seal-stones strip the Barrow King's armour of oaths: hp, dmg and armor multipliers).",
  heroScale: {
    boss: { 1: { hp: 0.4, dmg: 0.5 }, 2: { hp: 0.55, dmg: 0.65 }, 3: { hp: 0.7, dmg: 0.75 }, 4: { hp: 0.85, dmg: 0.88 }, 5: { hp: 1, dmg: 1 } },
  },
  weaken: { barrow: { flag: 'seals_lit', monster: 'barrow_king', hp: 0.75, dmg: 0.8, armor: 0.35 } },
};

// ---------------------------------------------------------------- nudging onto good ground
const roadClear = (x, z, r) => { const rd = T.roadAt(x, z, 20); return !rd || rd.d >= rd.half + r + 0.8; };
const deckClear = (x, z, r) => T.bridges.every(b => Math.hypot(x - b.at[0], z - b.at[1]) > b.reach + r + 2);
const taken = [];   // [x, z, r]
for (const n of Object.values(npcs.npcs)) taken.push([n.at[0], n.at[1], 1.2]);
const shrineSpots = [], chestSpots = [];
for (const r of Object.values(regions.regions)) {
  for (const [id, s] of Object.entries(r.shrines)) { shrineSpots.push({ id, ...s }); taken.push([s.at[0], s.at[1], 2.2]); }
  for (const [id, c] of Object.entries(r.chests)) { chestSpots.push({ id, ...c }); taken.push([c.at[0], c.at[1], 1]); }
}
function okAt(x, z, r, { building = false, onRoadOk = false, wet = false } = {}) {
  const maxSlope = building ? 16 : 30;
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    const px = x + dx, pz = z + dz;
    if (!T.inPlay(px, pz) || !T.walkable(px, pz)) return false;
    const w = T.waterAt(px, pz);
    if (!wet && w && w.depth > -0.05) return false;
  }
  if (T.slopeAt(x, z) > maxSlope) return false;
  if (!onRoadOk && !roadClear(x, z, r)) return false;
  if (!deckClear(x, z, r)) return false;
  return taken.every(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) >= tr + r + 0.4);
}
const moved = [];
function settle(label, at, r, opts = {}, nudge = 18) {
  if (okAt(at[0], at[1], r, opts)) { taken.push([at[0], at[1], r]); return [round(at[0]), round(at[1])]; }
  for (let d = 1; d <= nudge; d += 1) for (let a = 0; a < 16; a++) {
    const x = at[0] + Math.cos(a / 16 * 6.283) * d, z = at[1] + Math.sin(a / 16 * 6.283) * d;
    if (okAt(x, z, r, opts)) { taken.push([x, z, r]); moved.push(`${label} moved ${d} m`); return [round(x), round(z)]; }
  }
  moved.push(`!! ${label}: no good spot within ${nudge} m of ${at}`);
  taken.push([at[0], at[1], r]);
  return [round(at[0]), round(at[1])];
}
const round = v => Math.round(v * 10) / 10;
function facingTo(at, face) {
  const t = Array.isArray(face) ? face : face ? map.places[face].at : null;
  if (!t) return 0;
  const dx = t[0] - at[0], dz = t[1] - at[1];
  return Math.round(Math.atan2(-dx, -dz) * 100) / 100;
}

const buildings = BUILDINGS.map(b => {
  const r = radiusOf(b.art, 4);
  const at = settle(b.id, b.at, r, { building: true }, b.nudge ?? 26);
  return { id: b.id, name: b.name, art: b.art, role: b.role || 'house', at, y: Math.round(T.heightAt(...at) * 100) / 100, facing: facingTo(at, b.face), footprint: Math.round(r * 2 * 10) / 10, region: T.regionAt(...at) };
});
const objects = OBJECTS.map(o => {
  const at = settle(o.id, o.at, radiusOf(o.art, 0.8), {}, 14);
  return { ...o, at, y: Math.round(T.heightAt(...at) * 100) / 100 };
});
// roadside scenes (wildlife round 2026-11-25, owner: "The world still feels empty"): every 75-100 m of road outside
// towns, camps and shrines, a little scene a few metres off the verge, alternating sides. Same map = same scenes.
const WAYSIDE = [
  [['cart', 0, 0], ['barrel', 2.4, 0.8], ['crate-stack', 2.2, -1.2]],
  [['woodpile', 0, 0], ['log', 2.8, 1.5]],
  [['road-marker', 0, 0]],
  [['campfire', 0, 0], ['bedroll', 1.8, 0.6], ['bedroll', -1.6, 1], ['tent-small', 0, 3.4]],
  [['log', 0, 0], ['stump-a', 2, 1]],
  [['haystack', 0, 0], ['haystack', 2.6, 1.2], ['wheelbarrow', -2, 0.5]],
  [['signpost', 0, 0], ['barrel', 1.4, 0.6]],
];
const wayRng = (() => { let a = 20251125; return () => { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; return ((a >>> 0) % 100000) / 100000; }; })();
const farFrom = (x, z) => Object.values(map.places).every(p => typeof p !== 'object' || !p.at || Math.hypot(x - p.at[0], z - p.at[1]) > (p.kind === 'town' ? (p.radius || 40) + 25 : p.kind === 'camp' ? 55 : 35));
let wayN = 0; const wayWhy = { near: 0, bridge: 0, tries: 0 };
for (const r of T.roads) {
  if (r.town) continue;
  const len = r.pts[r.pts.length - 1].s;
  let side = 1;
  for (let s0 = 50; s0 < len - 30; s0 += 75 + wayRng() * 25) {
    wayWhy.tries++; const q = r.pts.findIndex(p => p.s >= s0); if (q < 1) continue;
    const a = r.pts[q - 1], b = r.pts[q], L = Math.hypot(b.x - a.x, b.z - a.z) || 1, tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
    const off = r.width / 2 + 4.5, x = a.x - tz * off * side, z = a.z + tx * off * side;
    side = -side;
    if (!farFrom(x, z)) { wayWhy.near++; continue; } if (!T.bridges.every(br => Math.hypot(x - br.at[0], z - br.at[1]) > 30)) { wayWhy.bridge++; continue; }
    const scene = WAYSIDE[Math.floor(wayRng() * WAYSIDE.length)], face = [a.x, a.z];
    const yaw = Math.atan2(tx, tz);
    for (const [art, dx, dz] of scene) {
      // scene-local (dx along the road, dz away from it)
      const px = x + tx * dx - tz * dz * -side, pz = z + tz * dx + tx * dz * -side;
      PROPS.push([art, [Math.round(px * 10) / 10, Math.round(pz * 10) / 10], face]);
    }
    void yaw; wayN++;
  }
}
console.log(`${wayN} roadside scenes`, JSON.stringify(wayWhy));
const props = PROPS.map(([artId, at0, face], i) => {
  const r = radiusOf(artId, 0.6);
  const roadside = ['signpost', 'road-marker', 'lamp-post', 'banner-village'].includes(artId);
  const at = settle(`${artId}#${i}`, at0, r, { wet: ['reeds', 'bog-plant', 'boardwalk', 'rowboat'].includes(artId) }, roadside ? 8 : 12);
  return { art: artId, at, y: Math.round(T.heightAt(...at) * 100) / 100, facing: facingTo(at, face || nearestFace(at)), r };
});
function nearestFace(at) {
  const rd = T.roadAt(at[0], at[1], 40);
  if (rd) { const r = T.roads.find(x => x.id === rd.road); const p = r.pts.reduce((b, q) => (Math.hypot(q.x - at[0], q.z - at[1]) < Math.hypot(b.x - at[0], b.z - at[1]) ? q : b)); return [p.x, p.z]; }
  return null;
}
const shrines = shrineSpots.map(s => ({ id: s.id, name: s.name, art: 'shrine-respawn', at: s.at, y: Math.round(T.heightAt(...s.at) * 100) / 100, facing: facingTo(s.at, nearestFace(s.at)), services: ['respawn', 'travel', 'respec'], region: T.regionAt(...s.at) }));
const CHEST_ART = { chest_common: 'chest-common', chest_camp: 'chest-rare', chest_boss: 'chest-epic' };
const chests = chestSpots.map(c => ({ id: c.id, name: c.name, art: CHEST_ART[c.table] || 'chest-common', at: c.at, y: Math.round(T.heightAt(...c.at) * 100) / 100, table: c.table, facing: facingTo(c.at, null) }));
const camps = [];
for (const [rid, r] of Object.entries(regions.regions)) for (const [id, c] of Object.entries(r.camps)) camps.push({ id, name: c.name, region: rid, at: c.at, levels: c.levels, clear: 10 });
// ---------------------------------------------------------------- monsters: one at a time
// Owner 2026-11-26: "every enemy I have seen has been in a pack of 5 or more … get rid of it. I can barely fight 1v1."
// Packs used to be 1-3 and roam spots 8 m apart inside an 18 m noticing distance, so a hero pulled every pack in a zone
// at once (tools/pack-sizes.mjs: 19% of encounters were 5+, the barrow 18). Now: every camp is laid out as small groups
// (mostly one monster, some two, a boss alone or with one guard), every hostile group stands SPACE metres from every
// other (camps and zones together) — more than a monster's noticing distance + both wander circles — and the camp's own
// `notice` is shorter. Pack sizes in a zone roll mostly 1 (combat.json packOdds, js/world/encounters.js).
// tests/world/packs.test.mjs holds it.
const MONSTERS = J('../data/monsters.json').monsters;
const COMBAT = J('../data/combat.json');
const hostile = id => (MONSTERS[id]?.temper || 'hostile') === 'hostile';
const ROAM_NOTICE = 16;                      // a roaming fighter notices you at 16 m at most (zone `notice`; encounters.js applies it)
const noticeOf = id => Math.min(ROAM_NOTICE, MONSTERS[id]?.aggroRange ?? COMBAT.monsters.noticeDefault);
const CAMP_NOTICE = 12, CAMP_SPACE = 28;        // a camp group notices you at 12 m; groups 28 m apart (12 + 2 × 3 m wander + slack)
const ROAM_SLACK = (COMBAT.monsters.wanderDefault ?? 9) + 3;   // one wander circle (they rarely both lean in) + the fight drifting
// each camp's groups, boss group first (it stands in the middle); every other group finds its own spot round it
const CAMP_GROUPS = {
  bandit_camp: [['bandit_chief', 'bandit_crossbow'], ['road_thug'], ['road_thug'], ['cutpurse'], ['bandit_crossbow']],
  goblin_warren: [['goblin_warchief'], ['goblin_warrior', 'goblin_warrior'], ['goblin_warrior'], ['goblin_sneak'], ['goblin_shaman'], ['goblin_shaman']],
  old_shrine_cult: [['choir_speaker'], ['shrine_cultist'], ['shrine_cultist'], ['shrine_cultist'], ['bounty_hunter']],
  rook_hideout: [['rook_varrow'], ['cutpurse'], ['cutpurse']],
  barrow: [['barrow_king', 'wraith_knight'], ['skeleton_warrior'], ['skeleton_warrior', 'hollowborn'], ['skeleton_warrior'], ['hollowborn'], ['barrow_ghoul']],
  troll_bridge: [['bridge_troll'], ['drowned_brute'], ['drowned_brute']],
  ruins: [['marsh_hag'], ['drowned_brute'], ['drowned_brute'], ['water_elemental'], ['water_elemental'], ['root_caller'], ['root_caller']],
  ogre_hill: [['hill_ogre'], ['orc_grunt'], ['orc_grunt'], ['orc_grunt']],
  blighted_grove: [['thornling'], ['thornling', 'root_caller'], ['thornling'], ['root_caller']],
  scarback_den: [['scarback']],
  redtusk_camp: [['redtusk'], ['orc_grunt'], ['orc_grunt', 'orc_grunt']],
};
const hostileSpots = [];   // [x, z, space] every hostile group so far (camps, then zones)
const arrivals = [...shrineSpots.map(s => s.at), map.spawn.at];
const farFromArrivals = (x, z) => arrivals.every(a => Math.hypot(a[0] - x, a[1] - z) >= 42);
const spaced = (x, z, space) => hostileSpots.every(([hx, hz, hs]) => Math.hypot(hx - x, hz - z) >= Math.max(space, hs));
const campLog = [];
for (const [rid, r] of Object.entries(regions.regions)) for (const [id, c] of Object.entries(r.camps)) {
  const groups = CAMP_GROUPS[id];
  if (!groups) throw new Error(`camp ${id} has no CAMP_GROUPS layout`);
  // keep each monster's own row data (rank, levels) from the camp's current rows, matched by id
  const rows = c.spawns.flatMap(sp => Array.from({ length: sp.count }, () => ({ id: sp.id, rank: sp.rank, levels: sp.levels })));
  const want = groups.flat().slice().sort().join(), have = rows.map(x => x.id).sort().join();
  if (want !== have) throw new Error(`camp ${id}: CAMP_GROUPS ${want} vs regions.json ${have} (same monsters, new layout only)`);
  const take = mid => rows.splice(rows.findIndex(x => x.id === mid), 1)[0];
  const spawns = [];
  groups.forEach((g, gi) => {
    let at = null;
    if (gi === 0) at = [0, 0];
    else {
      for (const d of [CAMP_SPACE, CAMP_SPACE + 8, CAMP_SPACE + 16, CAMP_SPACE + 24, CAMP_SPACE + 32]) {
        for (let k = 0; k < 24 && !at; k++) {
          const a = gi * 2.4 + k * (Math.PI * 2 / 24), x = c.at[0] + Math.cos(a) * d, z = c.at[1] + Math.sin(a) * d;
          if (okAt(x, z, 2.5, {}) && spaced(x, z, CAMP_SPACE) && farFromArrivals(x, z)) at = [round(x - c.at[0]), round(z - c.at[1])];
        }
        if (at) break;
      }
      if (!at) throw new Error(`camp ${id}: no spot for group ${gi} (${g.join(', ')})`);
    }
    hostileSpots.push([c.at[0] + at[0], c.at[1] + at[1], CAMP_SPACE]);
    // two in a group stand 2.5 m apart (two rows at one spot would stand inside each other)
    g.forEach((mid, k) => { const row = take(mid); spawns.push({ id: mid, count: 1, ...(row.rank ? { rank: row.rank } : {}), at: [round(at[0] + k * 2.5), at[1]], ...(row.levels ? { levels: row.levels } : {}) }); });
  });
  c.spawns = spawns; c.notice = CAMP_NOTICE;
  c._spawns = 'Small groups a hero takes one at a time (owner 2026-11-25 "large packs of goblins I cannot kill", 2026-11-26 "I can barely fight 1v1"): GENERATED by tools/place-world.mjs CAMP_GROUPS — `at` = metres from the camp\'s middle, groups 28 m apart, `notice` = the camp\'s noticing distance.';
  campLog.push(`${id}: ${groups.map(g => g.length).join('+')}`);
}
console.log('camp groups', campLog.join(' · '));

// roam zones: pack spots on good ground inside the circle (the server spawns a pack at each spot). A hostile zone's
// spots stand apart from every other hostile group by its monsters' noticing distance + ROAM_SLACK; a zone that cannot
// fit its packs gets fewer (logged). Peaceful herds (deer, sheep…) keep the old 8 m.
const roam = ROAM.map(z => {
  const spots = [];
  const fighters = z.roster.filter(x => hostile(x.id));
  const space = fighters.length ? Math.max(...fighters.map(x => noticeOf(x.id))) + ROAM_SLACK : 8;
  const want = z.packs + (fighters.length ? 0 : 2);
  for (const reach of fighters.length ? [1, 1.25, 1.5, 1.75] : [1]) {
    for (let k = 0; k < 48 && spots.length < want; k++) {
      const a = k * 2.399, d = z.radius * reach * Math.sqrt((k + 0.5) / 48);
      const x = z.at[0] + Math.cos(a) * d, zz = z.at[1] + Math.sin(a) * d;
      if (!okAt(x, zz, 1.5, {}) || !spots.every(s => Math.hypot(s[0] - x, s[1] - zz) > space)) continue;
      if (fighters.length && (!spaced(x, zz, space) || !farFromArrivals(x, zz))) continue;
      spots.push([round(x), round(zz)]);
    }
    if (spots.length >= want) break;
  }
  if (fighters.length) for (const s of spots) hostileSpots.push([s[0], s[1], space]);
  const packs = Math.min(z.packs, spots.length);
  if (packs < z.packs) console.log(`roam ${z.id}: room for ${packs} of ${z.packs} packs ${space} m apart`);
  return { ...z, packs, ...(fighters.length ? { notice: Math.max(...fighters.map(x => noticeOf(x.id))) } : {}), region: T.regionAt(...z.at), spots };
});

const out = {
  _doc: "Oathwild's hand placements (GENERATED by tools/place-world.mjs from its LAYOUT — edit there and run with --write). Positions are [x, z] on data/map.json's map, `y` = ground height there; `facing` = three.js rotation.y for a model whose front looks down -Z. `art` ids are data/art.json scenery rows (a ready model, or the art helper's placeholder shape until the model is made); quest objects with `art: null` carry their own `fallback` shape. Shrines: respawn + fast travel between discovered shrines + paid respec (data/regions.json ids). Chests: data/regions.json chests (loot tables in data/loot-tables.json). Camps: data/regions.json camps. `roam` zones: monsters / wildlife wandering a circle, `packs` alive at once, one pack per `spots` entry, at levels inside the zone's band (js/world/encounters.js spawnZone). Trees and small decor are NOT here: js/world/scatter.js grows them the same way everywhere, around these placements.",
  version: 1,
  encounters: ENCOUNTERS,
  buildings, props, objects, shrines, chests, camps, roam,
};
for (const m of moved) console.log(m);
console.log(`${buildings.length} buildings, ${props.length} props, ${objects.length} quest objects, ${shrines.length} shrines, ${chests.length} chests, ${camps.length} camps, ${roam.length} roam zones`);
if (process.argv.includes('--write')) {
  const lines = JSON.stringify(out, null, 1).replace(/\[\n\s+(-?[\d.]+),\n\s+(-?[\d.]+)\n\s+\]/g, '[$1, $2]');
  writeFileSync(here('../data/placements.json'), compact(out) + '\n');
  void lines;
  console.log('wrote data/placements.json');
  writeFileSync(here('../data/regions.json'), JSON.stringify(regions, null, 1) + '\n');
  console.log('wrote data/regions.json (camp groups)');
  // keep npcs.json in step with the work spots (text edit of each person's "at", so the file keeps its layout)
  let txt = readFileSync(here('../data/npcs.json'), 'utf8'), synced = 0;
  for (const t of Object.values(towns)) for (const sp of t.spots || []) {
    const re = new RegExp(`("${sp.npc}"\\s*:\\s*\\{[^{}]*?"at"\\s*:\\s*)\\[[^\\]]*\\]`);
    if (re.test(txt)) { txt = txt.replace(re, `$1[${sp.at[0]}, ${sp.at[1]}]`); synced++; }
  }
  writeFileSync(here('../data/npcs.json'), txt);
  console.log(`npcs.json: ${synced} work spots written`);
}
/** One row per line for arrays of objects (readable diffs). */
function compact(o) {
  const parts = Object.entries(o).map(([k, v]) => {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') return `  ${JSON.stringify(k)}: [\n${v.map(r => '    ' + JSON.stringify(r)).join(',\n')}\n  ]`;
    return `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`;
  });
  return `{\n${parts.join(',\n')}\n}`;
}
