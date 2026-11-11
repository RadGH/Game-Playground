// The prop kit, sim side: what every prop kind is called and how big a circle it blocks (r, metres at scale 1;
// 0 = walk through it). Pure. The meshes are js/client/prop-meshes.js (one builder per kind, same ids). Add a kind here
// AND there; tests/world/props.test.js fails if the two lists disagree.
export const PROP_KIT = {
  // trees and plants
  tree: { r: 0.5, name: 'Oak', group: 'plants' }, tree_big: { r: 0.8, name: 'Great oak', group: 'plants' }, pine: { r: 0.45, name: 'Pine', group: 'plants' },
  palm: { r: 0.35, name: 'Palm', group: 'plants' }, birch: { r: 0.35, name: 'Birch', group: 'plants' }, dead_tree: { r: 0.4, name: 'Dead tree', group: 'plants' },
  elder_tree: { r: 1.4, name: 'Elder tree', group: 'plants' }, bush: { r: 0.55, name: 'Bush', group: 'plants' }, fern: { r: 0, name: 'Fern', group: 'plants' },
  flowers: { r: 0, name: 'Flowers', group: 'plants' }, grass: { r: 0, name: 'Tall grass', group: 'plants' }, reeds: { r: 0, name: 'Reeds', group: 'plants' },
  mushroom: { r: 0, name: 'Mushrooms', group: 'plants' }, stump: { r: 0.4, name: 'Stump', group: 'plants' }, log: { r: 0.6, name: 'Fallen log', group: 'plants' },
  // stone
  rock: { r: 0.9, name: 'Rock', group: 'stone' }, boulder: { r: 1.6, name: 'Boulder', group: 'stone' }, rock_small: { r: 0, name: 'Pebbles', group: 'stone' },
  standing_stone: { r: 0.5, name: 'Standing stone', group: 'stone' }, ruin_pillar: { r: 0.5, name: 'Ruined pillar', group: 'stone' }, ruin_wall: { r: 1.0, name: 'Ruined wall', group: 'stone' },
  ruin_arch: { r: 0.6, name: 'Ruined arch', group: 'stone' }, gravestone: { r: 0.3, name: 'Gravestone', group: 'stone' }, cairn: { r: 0.6, name: 'Cairn', group: 'stone' },
  // built
  fence: { r: 0.25, name: 'Fence', group: 'built' }, wall_stone: { r: 0.9, name: 'Stone wall', group: 'built' }, house: { r: 3.2, name: 'House', group: 'built' },
  hut: { r: 2.0, name: 'Hut', group: 'built' }, tent: { r: 1.4, name: 'Tent', group: 'built' }, windmill: { r: 2.6, name: 'Windmill', group: 'built' },
  well: { r: 0.9, name: 'Well', group: 'built' }, dock: { r: 0, name: 'Dock planks', group: 'built' }, bridge: { r: 0, name: 'Bridge', group: 'built' },
  cart: { r: 1.0, name: 'Cart', group: 'built' }, haystack: { r: 0.9, name: 'Haystack', group: 'built' }, scarecrow: { r: 0.3, name: 'Scarecrow', group: 'built' },
  signpost: { r: 0.2, name: 'Signpost', group: 'built' }, palisade: { r: 0.6, name: 'Palisade', group: 'built' }, watchtower: { r: 1.6, name: 'Watchtower', group: 'built' },
  // small things
  torch: { r: 0.2, name: 'Torch', group: 'small' }, campfire: { r: 0.6, name: 'Campfire', group: 'small' }, banner: { r: 0.2, name: 'Banner', group: 'small' },
  crate: { r: 0.5, name: 'Crate', group: 'small' }, barrel: { r: 0.4, name: 'Barrel', group: 'small' }, bones: { r: 0, name: 'Bones', group: 'small' },
  // caves, crypts and the things the bestiary asked for (2026-11-11)
  stalagmite: { r: 0.6, name: 'Stalagmite', group: 'cave' }, cave_pillar: { r: 1.1, name: 'Cave pillar', group: 'cave' }, crystal: { r: 0.4, name: 'Crystal cluster', group: 'cave' },
  cobweb: { r: 0, name: 'Cobweb', group: 'cave' }, egg_sac: { r: 0.5, name: 'Egg sac', group: 'cave' }, leech_pool: { r: 0, name: 'Leech pool', group: 'cave' },
  coffin: { r: 0.6, name: 'Coffin', group: 'crypt' }, sarcophagus: { r: 1.0, name: 'Sarcophagus', group: 'crypt' }, brazier: { r: 0.4, name: 'Brazier', group: 'crypt' },
  bone_pile: { r: 0.5, name: 'Bone pile', group: 'crypt' }, crypt_wall: { r: 1.0, name: 'Crypt wall', group: 'crypt' }, niche: { r: 0.6, name: 'Burial niche', group: 'crypt' },
  boat_wreck: { r: 2.2, name: 'Wrecked boat', group: 'built' }, lighthouse: { r: 2.6, name: 'Lighthouse', group: 'built' }, grain_sacks: { r: 0.6, name: 'Grain sacks', group: 'small' },
  market_stall: { r: 1.2, name: 'Market stall', group: 'built' }, lantern_post: { r: 0.2, name: 'Lantern post', group: 'small' }, burrow_mound: { r: 0.5, name: 'Burrow', group: 'plants' },
  gate: { r: 0, name: 'Open gate', group: 'built' }, rope_bridge: { r: 0, name: 'Rope bridge', group: 'built' }, mine_cart: { r: 0.7, name: 'Mine cart', group: 'small' }, timber_frame: { r: 0.3, name: 'Timber prop', group: 'cave' },
  // the Elderglade / Elder Roots and the Mirefen / Mire Crypt (2026-11-11): each region's own silhouettes
  moon_well: { r: 2.3, name: 'Moon-well', group: 'stone' }, root_pillar: { r: 1.0, name: 'Root pillar', group: 'plants' }, root_arch: { r: 0, name: 'Root arch', group: 'plants' },
  rune_stone: { r: 0.5, name: 'Rune stone', group: 'stone' }, stilt_hut: { r: 2.0, name: 'Stilt hut', group: 'built' }, boardwalk: { r: 0, name: 'Boardwalk', group: 'built' },
  lily_pads: { r: 0, name: 'Lily pads', group: 'plants' }, swamp_tree: { r: 0.5, name: 'Swamp cypress', group: 'plants' }, totem: { r: 0.3, name: 'Totem', group: 'built' },
  crypt_door: { r: 1.0, name: 'Sealed door', group: 'crypt' }, bell: { r: 1.2, name: 'Great bell', group: 'crypt' }, sconce: { r: 0.3, name: 'Candle sconce', group: 'crypt' },
  // Highcairn Pass, Redcliff Heights and the Warband Mine (2026-11-11)
  snow_pine: { r: 0.45, name: 'Snow pine', group: 'plants' }, drake_nest: { r: 1.2, name: 'Drake nest', group: 'small' }, flag_line: { r: 0, name: 'Flag line', group: 'built' },
  war_tent: { r: 2.4, name: 'War tent', group: 'built' }, drake_post: { r: 0.3, name: 'Drake post', group: 'built' }, skull_pole: { r: 0.2, name: 'Skull pole', group: 'built' },
  firepot_stack: { r: 0.5, name: 'Firepot stack', group: 'small' }, red_spire: { r: 1.2, name: 'Red spire', group: 'stone' }, rail: { r: 0, name: 'Mine rail', group: 'cave' },
  ore_rock: { r: 0.9, name: 'Ore rock', group: 'cave' }, powder_keg: { r: 0.4, name: 'Powder keg', group: 'small' },
  // the Sunken Ruins, Gravewatch Hills and the Deep Catacomb (2026-11-11)
  altar: { r: 1.0, name: 'Altar', group: 'stone' }, drowned_statue: { r: 0.6, name: 'Drowned statue', group: 'stone' }, kelp: { r: 0, name: 'Kelp', group: 'plants' },
  seal_sigil: { r: 0, name: 'Seal sigil', group: 'marker' }, barrow_mound: { r: 3.0, name: 'Barrow', group: 'built' }, obelisk: { r: 0.5, name: 'Obelisk', group: 'stone' },
  bone_cage: { r: 0.6, name: 'Bone cage', group: 'crypt' }, throne: { r: 1.2, name: 'Throne', group: 'crypt' }, bone_pillar: { r: 1.0, name: 'Bone pillar', group: 'crypt' }, candle_cluster: { r: 0, name: 'Candles', group: 'small' },
  // markers drawn in the world (portals, waypoints)
  waypoint_stone: { r: 0.8, name: 'Waypoint', group: 'marker' }, portal_ring: { r: 1.2, name: 'Portal', group: 'marker' }, cave_mouth: { r: 0, name: 'Cave mouth', group: 'marker' },
};
export const PROP_IDS = Object.keys(PROP_KIT);
