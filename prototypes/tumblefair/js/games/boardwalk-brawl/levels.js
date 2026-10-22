// BOARDWALK BRAWL — the data. A level is a long, shallow street walked left to right; the screen stops at each
// wave's `at` (metres from the start) until that wave is beaten. Add a level by adding a row to LEVELS: nothing else
// knows the list (the sim picks one from the seed; the view draws the `theme`).
//
//   foes   who comes at you in that wave (ids in FOES), for ONE player
//   more   added once for every extra player (2 players = foes + more, 4 players = foes + more x3)
//   boss   a BOSSES id; the level is cleared when the wave holding the boss is beaten
//   theme  the scenery: `props` picks the kit (booths | pier | ghost), the colours paint it
//
// Pure data, no imports: the server, the browser and the tests all read it.

/** The fairground roughnecks. hp in punches (a jab is 1, the third punch and a jump-kick are 2). */
export const FOES = {
  tough: { name: 'Roughneck', hp: 5, speed: 2.7, dmg: 12, reach: 1.35, wind: 0.55, cool: 1.3, scale: 1.0, pts: 10, costume: 'cos_fighter', races: ['human', 'dwarf'] },
  quick: { name: 'Pickpocket', hp: 3, speed: 3.9, dmg: 8, reach: 1.25, wind: 0.42, cool: 1.0, scale: 0.86, pts: 8, costume: 'cos_rogue', races: ['halfling', 'elf'] },
  heavy: { name: 'Strongman', hp: 9, speed: 2.0, dmg: 18, reach: 1.6, wind: 0.8, cool: 1.7, scale: 1.25, pts: 15, costume: 'cos_warrior', races: ['dwarf', 'human'], armour: true },   // armour: jabs do not stagger it
};
/** One per level. moves: swing (a big punch), slam (hits everyone round it), charge (a run along the street). */
export const BOSSES = {
  barker: { name: 'Big Barker', hp: 20, perExtra: 9, speed: 2.3, dmg: 20, reach: 1.9, wind: 0.75, cool: 2.0, scale: 1.65, pts: 50, moves: ['swing', 'slam'], costume: 'cos_tactician', race: 'human', seed: 4101 },
  captain: { name: 'Captain Clang', hp: 22, perExtra: 9, speed: 2.4, dmg: 20, reach: 1.8, wind: 0.7, cool: 2.0, scale: 1.6, pts: 50, moves: ['swing', 'charge'], costume: 'cos_knight', race: 'dwarf', seed: 4202 },
  manager: { name: 'The Night Manager', hp: 24, perExtra: 10, speed: 2.5, dmg: 22, reach: 1.9, wind: 0.7, cool: 1.9, scale: 1.7, pts: 60, moves: ['swing', 'slam', 'charge'], costume: 'cos_necromancer', race: 'elf', seed: 4303 },
};

export const LEVELS = [
  {
    id: 'midway', name: 'Midway Lane', length: 84,
    theme: { props: 'booths', ground: '#e7c48a', lane: '#d9a865', sky: '#7fd3f0', walls: ['#ff5f5f', '#3d8bff', '#ffd23f', '#3ecf5a'], roofs: ['#ffffff', '#ff5f5f'], lights: '#fff3a8', trim: '#7a4a2a' },
    waves: [
      { at: 17, foes: ['tough', 'tough'], more: ['tough'] },
      { at: 34, foes: ['tough', 'quick', 'quick'], more: ['quick'] },
      { at: 51, foes: ['tough', 'tough', 'quick'], more: ['tough'] },
      { at: 67, foes: ['quick', 'quick', 'tough'], more: ['quick'] },
      { at: 82, boss: 'barker', foes: ['tough'], more: ['quick'] },
    ],
  },
  {
    id: 'pier', name: 'Pier Planks', length: 80,
    theme: { props: 'pier', ground: '#b98a5a', lane: '#a77548', sky: '#9fe3ff', water: '#2f8fd0', walls: ['#f2f2f2', '#39d0e0', '#ff8a3d'], roofs: ['#3d8bff', '#ffffff'], lights: '#ffffff', trim: '#5a3a22' },
    waves: [
      { at: 16, foes: ['quick', 'quick'], more: ['quick'] },
      { at: 32, foes: ['tough', 'heavy'], more: ['tough'] },
      { at: 48, foes: ['quick', 'quick', 'tough'], more: ['quick'] },
      { at: 63, foes: ['heavy', 'quick', 'quick'], more: ['tough'] },
      { at: 78, boss: 'captain', foes: ['quick'], more: ['quick'] },
    ],
  },
  {
    id: 'ghost', name: 'Spook Alley', length: 86,
    theme: { props: 'ghost', ground: '#5b4a7a', lane: '#4a3a66', sky: '#26204a', walls: ['#3b2a7a', '#6a2a5a', '#2a4a5a'], roofs: ['#1a1430', '#9a3aff'], lights: '#9dff7a', trim: '#1a1430' },
    waves: [
      { at: 16, foes: ['tough', 'quick'], more: ['quick'] },
      { at: 33, foes: ['heavy', 'tough'], more: ['tough'] },
      { at: 50, foes: ['quick', 'quick', 'quick'], more: ['quick'] },
      { at: 66, foes: ['heavy', 'tough', 'quick'], more: ['tough'] },
      { at: 84, boss: 'manager', foes: ['tough'], more: ['quick'] },
    ],
  },
];
