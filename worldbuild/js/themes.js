// World Build — region themes: what a "moor" or a "fen" means for the ground, the trees, the towns and the names.
// Data only. A brief names a theme per region; every stage reads this table (add a theme = add a row).
//
// Tree ids are Oathwild's storybook species (prototypes/oathwild/js/world/scatter.js TREE_SPECIES) so every tree this
// pipeline places is a BIG textured tree the game already draws (lessons rules 74 and 77). Ground ids are biome names
// (BIOMES below); `paint` maps each biome to one of the fly view's painted ground layers.

/** Every biome the pipeline writes. The first twelve are Oathwild's own (terrain.js BIOMES, same order, same ids). */
export const BIOMES = Object.freeze(['meadow', 'wildgrass', 'forest', 'field', 'village', 'road', 'trail', 'boardwalk', 'water', 'shore', 'marsh', 'rock',
  'heath', 'snow', 'ash', 'scrub', 'beach', 'scree', 'fen', 'dustland']);
export const BIOME_ID = Object.freeze(Object.fromEntries(BIOMES.map((b, i) => [b, i])));
export const BIOME_COLOUR = Object.freeze({
  meadow: [126, 176, 84], wildgrass: [96, 142, 70], forest: [52, 104, 50], field: [214, 188, 104], village: [176, 150, 112],
  road: [190, 160, 116], trail: [168, 140, 98], boardwalk: [140, 104, 66], water: [64, 128, 196], shore: [196, 186, 140],
  marsh: [92, 122, 84], rock: [138, 132, 122],
  heath: [134, 118, 104], snow: [236, 240, 246], ash: [92, 88, 86], scrub: [150, 146, 88], beach: [222, 206, 160],
  scree: [160, 154, 146], fen: [104, 132, 96], dustland: [186, 120, 82],
});
/** Fly-view ground layer per biome (the painted texture it uses; worldbuild/js/fly/ground-mat.js LAYERS). */
export const PAINT = Object.freeze({
  meadow: 'grass', wildgrass: 'wild', forest: 'forest', field: 'soil', village: 'dirt', road: 'dirt', trail: 'dirt', boardwalk: 'marsh',
  water: 'sand', shore: 'sand', marsh: 'marsh', rock: 'gravel', heath: 'heath', snow: 'snow', ash: 'ash', scrub: 'wild',
  beach: 'sand', scree: 'gravel', fen: 'marsh', dustland: 'dust',
});

// relief presets: how a theme shapes the ground before the brief's ranges and rivers (metres)
export const RELIEF = Object.freeze({
  plains:   { base: 0, roll: 0.7, detail: 0.8, ridge: 0 },
  hills:    { base: 10, roll: 1.4, detail: 1.2, ridge: 0.2 },
  moor:     { base: 22, roll: 1.3, detail: 1.1, ridge: 0.25 },
  mountain: { base: 60, roll: 1.8, detail: 2.2, ridge: 0.6 },
  wetland:  { base: -6, roll: 0.45, detail: 0.5, ridge: 0 },
  coast:    { base: -4, roll: 0.8, detail: 0.9, ridge: 0.1 },
  badlands: { base: 18, roll: 1.2, detail: 1.6, ridge: 0.45, terrace: 6 },
  volcanic: { base: 40, roll: 1.5, detail: 1.8, ridge: 0.5 },
});

export const THEMES = Object.freeze({
  farmland: {
    label: 'Farmland downs', relief: 'plains', ground: 'meadow', forest: 0.16, wet: 0.5,
    trees: [['oak-a', 4], ['oak-b', 3], ['birch', 3]], giant: 'ancient-oak', giantWood: 0.45,
    decor: [['rock-small', 3], ['bush-a', 3], ['bush-b', 2]],
    houses: [['timber', 4], ['plaster', 4], ['stone', 1]], fences: [['wood', 4], ['hedge', 4]], farms: 1,
    names: { town: ['Harrow', 'Wheat', 'Barley', 'Mill', 'Hay', 'Oat', 'Fair', 'Brook', 'Meadow', 'Corn'], townEnd: ['by', 'ley', 'stead', 'ton', 'ford', 'field'],
      camp: ['Raider Camp', 'Poachers\' Camp', 'Bandit Barn'], dungeon: ['Old Granary Cellars', 'the Sunken Mill', 'the Barrow Field'], shrine: ['Harvest Shrine', 'Field Shrine', 'Crossroads Shrine'] },
    camps: ['bandit', 'gnoll'], dungeons: ['cellar', 'barrow'],
  },
  moor: {
    label: 'Heather moors', relief: 'moor', ground: 'heath', forest: 0.08, wet: 0.55,
    trees: [['pine-a', 3], ['birch', 2], ['dead-tree', 1]], giant: null,
    decor: [['rock-medium', 3], ['boulder', 2], ['rock-small', 3], ['bush-c', 1]],
    houses: [['stone', 5], ['timber', 1]], fences: [['stone', 5], ['wood', 1]], farms: 0.3,
    names: { town: ['Fell', 'Grey', 'Heather', 'Crag', 'Stone', 'Kestrel', 'Wind'], townEnd: ['wick', 'by', 'gate', 'hold', 'side'],
      camp: ['Moor Raiders\' Camp', 'Gnoll Den', 'Wolfpack Hollow'], dungeon: ['the Cairn Halls', 'the Peat Barrow', 'the Old Mine'], shrine: ['Moor Shrine', 'Cairn Shrine', 'Wayfarer Stone'] },
    camps: ['gnoll', 'wolf'], dungeons: ['barrow', 'mine'],
  },
  oldwood: {
    label: 'Old deep forest', relief: 'hills', ground: 'wildgrass', forest: 0.82, wet: 0.65,
    trees: [['oak-b', 5], ['oak-a', 2], ['pine-b', 2], ['birch', 1]], giant: 'ancient-oak', giantWood: 0.35, giantShare: 0.16,
    decor: [['fern', 4], ['mushrooms', 3], ['stump-a', 2], ['log', 2], ['bush-c', 2]],
    houses: [['wood', 5], ['timber', 2]], fences: [['wood', 5], ['hedge', 1]], farms: 0.15,
    names: { town: ['Oak', 'Elder', 'Moss', 'Fern', 'Bramble', 'Ash', 'Thorn'], townEnd: ['hollow', 'wood', 'glade', 'dell', 'hurst'],
      camp: ['Spider Nest', 'Outlaw Camp', 'Boar Wallow'], dungeon: ['the Root Cave', 'the Hollow Oak', 'the Old Lodge Cellars'], shrine: ['Grove Shrine', 'Oak Shrine', 'Hunter\'s Shrine'] },
    camps: ['spider', 'outlaw'], dungeons: ['cave', 'lodge'],
  },
  fen: {
    label: 'Lakes and fens', relief: 'wetland', ground: 'fen', forest: 0.3, wet: 0.9,
    trees: [['willow', 4], ['marsh-tree', 4], ['dead-tree', 1]], giant: null,
    decor: [['reeds', 5], ['bog-plant', 3], ['log-hollow', 1]],
    houses: [['wood', 4], ['plaster', 2]], fences: [['wood', 5]], farms: 0.3,
    names: { town: ['Reed', 'Heron', 'Mere', 'Willow', 'Still', 'Eel', 'Mist'], townEnd: ['by', 'mere', 'holm', 'wick', 'stead'],
      camp: ['Bog Raiders\' Camp', 'Croaker Mound', 'Drowned Camp'], dungeon: ['the Sunken Chapel', 'the Mire Vault', 'the Reed Barrow'], shrine: ['Lake Shrine', 'Heron Shrine', 'Reed Shrine'] },
    camps: ['croaker', 'raider'], dungeons: ['sunken', 'barrow'],
  },
  coast: {
    label: 'Sea cliffs and coves', relief: 'coast', ground: 'wildgrass', forest: 0.12, wet: 0.6,
    trees: [['pine-a', 4], ['birch', 2], ['oak-a', 1]], giant: null,
    decor: [['rock-medium', 3], ['rock-small', 3], ['bush-b', 2], ['reeds', 1]],
    houses: [['plaster', 4], ['stone', 3], ['timber', 1]], fences: [['stone', 3], ['wood', 2]], farms: 0.5,
    names: { town: ['Gull', 'Salt', 'Sand', 'Shell', 'Tide', 'Wreck', 'Cove'], townEnd: ['haven', 'ford', 'port', 'by', 'mouth'],
      camp: ['Smugglers\' Cove', 'Wrecker Camp', 'Crab Beach'], dungeon: ['the Sea Cave', 'the Drowned Crypt', 'the Smugglers\' Tunnels'], shrine: ['Tide Shrine', 'Gull Shrine', 'Harbour Shrine'] },
    camps: ['smuggler', 'crab'], dungeons: ['seacave', 'crypt'],
  },
  badlands: {
    label: 'Red rock barrens', relief: 'badlands', ground: 'dustland', forest: 0.04, wet: 0.2,
    trees: [['dead-tree', 3], ['pine-a', 1]], giant: null,
    decor: [['rock-large', 3], ['rock-slab', 2], ['rock-medium', 3], ['cliff-chunk', 1]],
    houses: [['stone', 4], ['plaster', 3]], fences: [['stone', 4]], farms: 0,
    names: { town: ['Dust', 'Red', 'Copper', 'Dry', 'Rust', 'Flint'], townEnd: ['well', 'rock', 'gulch', 'stead', 'post'],
      camp: ['Scorpion Pit', 'Raider Camp', 'Hyena Den'], dungeon: ['the Copper Mine', 'the Red Caves', 'the Buried Temple'], shrine: ['Sun Shrine', 'Well Shrine', 'Dust Shrine'] },
    camps: ['raider', 'scorpion'], dungeons: ['mine', 'cave'],
  },
  alpine: {
    label: 'Snow peaks', relief: 'mountain', ground: 'scrub', forest: 0.3, wet: 0.5, snowline: 280,
    trees: [['pine-b', 5], ['pine-a', 2]], giant: 'giant-spruce', giantWood: 0.4,
    decor: [['rock-large', 2], ['boulder', 3], ['rock-medium', 3]],
    houses: [['stone', 4], ['wood', 3]], fences: [['stone', 3], ['wood', 2]], farms: 0,
    names: { town: ['High', 'Frost', 'Snow', 'Ice', 'Eagle', 'Cold'], townEnd: ['cairn', 'hold', 'peak', 'watch', 'gate'],
      camp: ['Yeti Cave', 'Frost Wolf Den', 'Mountain Raiders\' Camp'], dungeon: ['the Frozen Halls', 'the Deep Mine', 'the Ice Crypt'], shrine: ['Summit Shrine', 'Snow Shrine', 'Pass Shrine'] },
    camps: ['yeti', 'wolf'], dungeons: ['crypt', 'mine'],
  },
  ashland: {
    label: 'Ash and fire vents', relief: 'volcanic', ground: 'ash', forest: 0.05, wet: 0.15,
    trees: [['dead-tree', 5]], giant: null,
    decor: [['rock-large', 3], ['rock-medium', 3], ['cliff-chunk', 2]],
    houses: [['stone', 5]], fences: [['stone', 5]], farms: 0,
    names: { town: ['Ash', 'Cinder', 'Coal', 'Smoke', 'Slag', 'Char'], townEnd: ['gate', 'hold', 'post', 'forge', 'well'],
      camp: ['Fire Cult Camp', 'Salamander Nest', 'Slag Raiders\' Camp'], dungeon: ['the Fire Halls', 'the Smoking Mine', 'the Ash Crypt'], shrine: ['Cinder Shrine', 'Ash Shrine'] },
    camps: ['cult', 'salamander'], dungeons: ['forge', 'mine'],
  },
});

/** Landmark kinds: what the place rule looks for, and the set piece drawn there. */
export const LANDMARKS = Object.freeze({
  standing_stones: { name: ['the Standing Stones', 'the Nine Stones', 'the Whispering Ring'], want: 'open', radius: 18 },
  old_tree: { name: ['the Great Oak', 'the Old Giant', 'the Elder Tree'], want: 'forest', radius: 22 },
  peak: { name: ['the Summit Cairn', 'the High Cairn', 'the Lookout Peak'], want: 'peak', radius: 14 },
  ruin: { name: ['the Old Keep', 'the Fallen Tower', 'the Broken Hall', 'the Lost Chapel'], want: 'any', radius: 24 },
  lakeside: { name: ['the Lakeside Shrine', 'the Boathouse Ruin', 'the Pier Stones'], want: 'lake', radius: 16 },
  lighthouse: { name: ['the Old Lighthouse', 'the Beacon Tower'], want: 'cliff', radius: 14 },
  arch: { name: ['the Red Arch', 'the Stone Bridge Arch'], want: 'open', radius: 16 },
  vent: { name: ['the Fire Vent', 'the Smoking Pit'], want: 'any', radius: 18 },
});

/** Town sizes: radius (m), streets laid round the centre, houses wanted. */
export const TOWN_SIZE = Object.freeze({
  town: { radius: 62, flat: 70, relief: 0.6, ring: true, lanes: 3, villagers: 12 },
  village: { radius: 44, flat: 50, relief: 0.62, ring: true, lanes: 2, villagers: 8 },
  hamlet: { radius: 28, flat: 32, relief: 0.65, ring: false, lanes: 1, villagers: 4 },
});
