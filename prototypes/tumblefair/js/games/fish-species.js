// FISH SPECIES — the one table of everything a Tumblefair fishing game can pull out of the water (Reel Rumble, Pier
// Pressure, Net Gains, Glimmer Ice). Plain data, no code: the rules (sim.js) and the drawings (view.js) both read it,
// so a name or a colour is changed in one place. Every name is our own.
//
//   id       stable key (sent over the network; never rename one)
//   name     what the player reads
//   hw       the Halloween name (a reskin swaps the words only; the fish behaves exactly the same)
//   where    which games' waters it lives in: lake (Reel Rumble), pier (Pier Pressure), lagoon (Net Gains), ice (Glimmer Ice)
//   w        how often it turns up, relative to the others in the same water
//   pts      points for landing it
//   kg       [min, max] weight range (shown only; the rng picks inside it)
//   fight    how hard it pulls on a reel (0 = junk that just drags, 1 = an ordinary fish, 2+ = a brute)
//   speed    how fast its shadow swims (m/s)
//   size     drawn length in metres
//   color    body colour; belly = underside; glow = the colour it shines under ice / at night (optional)
//   junk     true = not a fish (boots, kettles…): no points and a waste of time
export const SPECIES = [
  { id: 'tiddler', name: 'Tiddler', hw: 'Ghost Minnow', where: ['lake', 'pier', 'lagoon'], w: 10, pts: 1, kg: [0.1, 0.3], fight: 0.6, speed: 1.6, size: 0.35, color: '#9fc7d8', belly: '#e8f4fa' },
  { id: 'sunny-perch', name: 'Sunny Perch', hw: 'Pumpkin Perch', where: ['lake', 'pier', 'lagoon'], w: 8, pts: 2, kg: [0.3, 0.8], fight: 0.85, speed: 1.4, size: 0.45, color: '#ffb02e', belly: '#ffe9a8' },
  { id: 'freckled-trout', name: 'Freckled Trout', hw: 'Candy-Stripe Trout', where: ['lake', 'pier'], w: 6, pts: 3, kg: [0.8, 2], fight: 1.05, speed: 1.5, size: 0.6, color: '#7aa86a', belly: '#f2d6c4' },
  { id: 'bubble-carp', name: 'Bubble Carp', hw: 'Cauldron Carp', where: ['lake', 'pier', 'lagoon'], w: 5, pts: 4, kg: [2, 4.5], fight: 1.2, speed: 1.0, size: 0.75, color: '#d98a4a', belly: '#f6d7a8' },
  { id: 'ribbon-eel', name: 'Ribbon Eel', hw: 'Mummy Eel', where: ['lake', 'lagoon'], w: 3, pts: 5, kg: [1, 2.5], fight: 1.35, speed: 2.0, size: 0.9, color: '#5a6fa8', belly: '#c8d4f2' },
  { id: 'whiskerjack', name: 'Whiskerjack', hw: "Witch's Whiskerjack", where: ['lake'], w: 3, pts: 6, kg: [3, 7], fight: 1.55, speed: 0.9, size: 0.95, color: '#7a6a5a', belly: '#d8c8b0' },
  { id: 'barrel-bass', name: 'Barrel Bass', hw: 'Bonfire Bass', where: ['lake', 'lagoon'], w: 2, pts: 8, kg: [4, 9], fight: 1.8, speed: 1.1, size: 1.05, color: '#3f8f5a', belly: '#cfe8b8' },
  { id: 'moonscale', name: 'Moonscale', hw: 'Harvest Moonscale', where: ['lake', 'pier', 'lagoon'], w: 1, pts: 12, kg: [1.5, 3], fight: 1.5, speed: 2.4, size: 0.7, color: '#ffe36b', belly: '#fff8d0', glow: '#fff3a0' },
  { id: 'old-gilbert', name: 'Old Gilbert', hw: 'Count Gillbert', where: ['lake', 'lagoon'], w: 0.4, pts: 20, kg: [12, 20], fight: 2.4, speed: 0.8, size: 1.6, color: '#4a5a7a', belly: '#b8c8e0' },
  // under the ice
  { id: 'frost-minnow', name: 'Frost Minnow', hw: 'Ghost Minnow', where: ['ice'], w: 10, pts: 1, kg: [0.1, 0.3], fight: 0.6, speed: 1.5, size: 0.35, color: '#cfeaff', belly: '#ffffff', glow: '#9fe8ff' },
  { id: 'snowball-puffer', name: 'Snowball Puffer', hw: 'Pumpkin Puffer', where: ['ice'], w: 6, pts: 2, kg: [0.4, 1], fight: 0.8, speed: 0.9, size: 0.45, color: '#f4f8ff', belly: '#ffffff', glow: '#d8e8ff' },
  { id: 'icicle-pike', name: 'Icicle Pike', hw: 'Broomstick Pike', where: ['ice'], w: 4, pts: 3, kg: [1, 3], fight: 1.2, speed: 1.9, size: 0.85, color: '#8fb8e0', belly: '#e0f0ff', glow: '#7fd8ff' },
  { id: 'aurora-char', name: 'Aurora Char', hw: 'Lantern Char', where: ['ice'], w: 1.5, pts: 6, kg: [1.5, 4], fight: 1.4, speed: 1.6, size: 0.7, color: '#8a6aff', belly: '#ffc8f0', glow: '#c08aff' },
  // junk
  { id: 'soggy-boot', name: 'Soggy Boot', hw: "Witch's Boot", where: ['lake', 'pier'], w: 2, pts: 0, kg: [0.6, 0.9], fight: 0.3, speed: 0.4, size: 0.5, color: '#6a4a32', belly: '#4a3222', junk: true },
  { id: 'rusty-kettle', name: 'Rusty Kettle', hw: 'Little Cauldron', where: ['pier'], w: 1.5, pts: 0, kg: [0.8, 1.2], fight: 0.3, speed: 0.4, size: 0.45, color: '#8a5a3a', belly: '#5a3a2a', junk: true },
  { id: 'weed-tangle', name: 'Weed Tangle', hw: 'Cobweb Tangle', where: ['lake', 'pier'], w: 1.5, pts: 0, kg: [0.2, 0.5], fight: 0.2, speed: 0.3, size: 0.55, color: '#4a7a3a', belly: '#2a5a2a', junk: true },
];
export const BY_ID = Object.freeze(Object.fromEntries(SPECIES.map(s => [s.id, s])));
/** The species that live in one water ('lake' | 'pier' | 'lagoon' | 'ice'), optionally fish only / junk only. */
export const speciesIn = (where, { junk = null } = {}) => SPECIES.filter(s => s.where.includes(where) && (junk == null || !!s.junk === junk));
/** The name to show: the Halloween name while that season is on. */
export const fishName = (id, season = null) => { const s = BY_ID[id]; return !s ? '?' : season === 'halloween' ? s.hw : s.name; };
