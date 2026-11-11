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
  // markers drawn in the world (portals, waypoints)
  waypoint_stone: { r: 0.8, name: 'Waypoint', group: 'marker' }, portal_ring: { r: 1.2, name: 'Portal', group: 'marker' }, cave_mouth: { r: 0, name: 'Cave mouth', group: 'marker' },
};
export const PROP_IDS = Object.keys(PROP_KIT);
