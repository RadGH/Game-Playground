// The small custom world, written by hand (PLAN §2): a 3,072 m square, two towns about 2.3 km apart, one road between
// them and one river under that road. Plain data, so the page, a Worker, a Node room and the tests all read the same
// thing with the same import. js/world/build-world.js turns it into the world contract.
//
// Coordinates: x east, z south, y up, metres, centre of the map at 0, 0. Offsets in a town are metres from its centre
// before `turn` (radians) is applied. Node and edge ids are names, never coordinates (PLAN §2 "Positions").
//
// styles[row][col] = what stands on a block: shops, houses, flats, civic (one big building), park.
// skip = street pieces left out, written `<col>,<row>-<col>,<row>` between two crossings.

export const FIRST_MAP = {
  id: 'first-county',
  zone: 'first-county',
  seed: 1907,
  size: 3072,
  cell: 4,
  lane: { halfW: 3.8, offset: 1.9, pavement: 2.4 },
  speed: { town: 11, country: 20, turn: 6.5 },
  river: {
    name: 'River Wend', level: 2, halfW: 16, bank: 14,
    pts: [[-40, -1560], [120, -1160], [-30, -760], [130, -420], [70, -170], [70, -20], [70, 130], [170, 420], [20, 820], [140, 1200], [60, 1560]],
  },
  bridge: { name: 'Wend Bridge', deck: 7.5 },
  towns: [
    {
      id: 'oddhaven', name: 'Oddhaven', x: -1165, z: 110, y: 12, turn: 0,
      xs: [-136, -46, 46, 136], zs: [-112, -36, 40, 118], skip: ['0,0-0,1'],
      styles: [['houses', 'shops', 'flats'], ['shops', 'park', 'shops'], ['houses', 'civic', 'houses']],
    },
    {
      id: 'brackenford', name: 'Brackenford', x: 1120, z: -130, y: 9, turn: 0.32,
      xs: [-126, -38, 58, 132], zs: [-118, -30, 52, 124], skip: ['3,0-3,1', '1,3-2,3'],
      styles: [['flats', 'houses', 'houses'], ['civic', 'shops', 'park'], ['shops', 'houses', 'flats']],
    },
  ],
  // the one road between the towns. `via` is the rough line; the straight run past the river is what the bridge sits on.
  links: [
    { id: 'county-road', name: 'County Road', from: 'oddhaven:3,1', to: 'brackenford:0,2',
      via: [[-850, 40], [-640, 170], [-340, 60], [-130, -20], [270, -20], [560, -170], [800, -60]] },
  ],
  trees: { count: 2400, street: 40 },
  // Timber Lane (M4): one lane off the north-east corner of Oddhaven to the mill and the wood behind it. Only added to, so every
  // older road and building keeps its id. The layout is data, in world metres; the sim reads the same numbers (town.timber).
  timber: {
    name: 'Wend Wood', y: 11.5, gate: [-950, -120], radius: 165,
    link: { id: 'timber-lane', name: 'Timber Lane', from: 'oddhaven:3,0', via: [[-1000, -66]] },
    camp: { x: -893, z: -258, w: 13, d: 10 },      // the loggers' hut, on the forest's south edge
    mill: { x: -985, z: -172, w: 16, d: 11 },      // the mill office, west of the saw benches
    forest: { x: -928, z: -310, cols: 9, rows: 8, step: 6.4 },
    landing: [-930, -263], lever: [-925.5, -263], deck: [-934, -219], rack: [-908, -160], truck: { x: -925, z: -136, yaw: 1.5708 },
    benches: [{ z: -200 }, { z: -187 }, { z: -174 }],   // a saw bench each: logs feed in at the west end, boards come off the east end
    benchX: { infeed: -945, lever: -936, blade: -934, out: -922 },
  },
};
