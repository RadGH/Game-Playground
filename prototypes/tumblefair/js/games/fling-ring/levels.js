// FLING RING — the decks. One is picked from the match seed; add a deck by adding a row (the sim reads the rules,
// the view reads `theme`). Pure data, no imports.
//
//   shape/r or shape/hw/hd   the floor (no wall: off the edge is in the water)
//   shrink { from, to, start, end }   the radius shrinks from `from` to `to` between `start` and `end` seconds
//   spin                     the floor turns (radians a second); anyone standing on it is carried round
//   sweeper { len, speed, push }      a bar turning round the middle that shoves whoever it meets
//   holes [{ x, z, hw, hd }] gaps in the floor: stand over one and you drop through
//   barrels [{ z, speed, r }]         barrels rolling back and forth along x on that line; they bowl people over
export const DECKS = [
  {
    id: 'raft', name: 'Shrinking Raft', shape: 'circle', r: 8,
    shrink: { from: 8, to: 3.6, start: 10, end: 52 },
    theme: { floor: '#c8955a', plank: '#a8743e', rim: '#6e4424', water: '#2f8fd0', sky: '#8fdcff', flags: ['#ff5f5f', '#ffd23f', '#3d8bff'] },
  },
  {
    id: 'carousel', name: 'Carousel Deck', shape: 'circle', r: 7.4,
    spin: 0.3, sweeper: { len: 6.6, speed: 1.0, push: 7 },
    theme: { floor: '#ff8fb8', plank: '#ffd23f', rim: '#7a2a6a', water: '#3a2a7a', sky: '#ffd6a8', flags: ['#ffffff', '#ff5f5f', '#39d0e0'] },
  },
  {
    id: 'gaps', name: 'Gap Pier', shape: 'rect', hw: 8.5, hd: 6,           // hole edges on the half-metre grid: the view builds the deck from 0.5 m planks
    holes: [{ x: -4, z: -1.5, hw: 1.5, hd: 1 }, { x: 3.5, z: 1.5, hw: 1.5, hd: 1 }, { x: 0, z: 4.5, hw: 1.5, hd: 0.5 }, { x: 0, z: -4.5, hw: 1, hd: 0.5 }],
    barrels: [{ z: -3.1, speed: 4.2, r: 0.75 }, { z: 2.9, speed: -3.6, r: 0.75 }],
    theme: { floor: '#9a8a7a', plank: '#7a6a5a', rim: '#4a3a2a', water: '#1f6fa8', sky: '#bfe8ff', flags: ['#3ecf5a', '#ffd23f', '#f04fd8'] },
  },
  // round 12: four more decks built from the same parts, so a long night of Fling Ring does not keep landing on the same three
  {
    id: 'teacup', name: 'Spinning Teacup', shape: 'circle', r: 7,
    spin: 0.45, shrink: { from: 7, to: 4.4, start: 18, end: 56 },
    theme: { floor: '#9fd8ff', plank: '#ffffff', rim: '#3a6ab8', water: '#2a7fb8', sky: '#d6f0ff', flags: ['#ff7ab8', '#ffd23f', '#ffffff'] },
  },
  {
    id: 'windmill', name: 'Windmill Raft', shape: 'circle', r: 7.8,
    sweeper: { len: 7.2, speed: 1.45, push: 7.5 },
    theme: { floor: '#d8b06a', plank: '#b8863e', rim: '#5a3a1a', water: '#2f8fd0', sky: '#ffe9b0', flags: ['#e8394a', '#ffffff', '#3d8bff'] },
  },
  {
    id: 'barrels', name: 'Barrel Dock', shape: 'rect', hw: 8, hd: 5.5,
    barrels: [{ z: -3.4, speed: 3.6, r: 0.75 }, { z: 0.4, speed: -4.6, r: 0.75 }, { z: 3.6, speed: 3.1, r: 0.75 }],
    theme: { floor: '#b89a72', plank: '#8a6a48', rim: '#4a3220', water: '#1f6f98', sky: '#c8ecff', flags: ['#ffd23f', '#ff5f5f', '#39d0e0'] },
  },
  {
    id: 'checker', name: 'Checker Pier', shape: 'rect', hw: 7.5, hd: 6,      // hole edges on the half-metre grid
    holes: [{ x: -4, z: 0, hw: 1, hd: 1 }, { x: 4, z: 0, hw: 1, hd: 1 }, { x: 0, z: 3.5, hw: 1, hd: 1 }, { x: 0, z: -3.5, hw: 1, hd: 1 }],     // a plus of gaps, clear of the diagonal starts
    barrels: [{ z: -5, speed: 3.4, r: 0.6 }],
    theme: { floor: '#a8b0b8', plank: '#7a8490', rim: '#3a4048', water: '#24609a', sky: '#d0e8ff', flags: ['#3ecf5a', '#ff7ab8', '#ffd23f'] },
  },
];
