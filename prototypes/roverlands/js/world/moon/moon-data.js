// The Moon (map 'moon') — every place, name and number the generator reads. Plain data; change numbers here, not in
// moongen.js. Coordinates in metres: x east, z south, origin = the middle of the 2048 m map. Every name is original.
//
//   z = -1024 north      Farside Depot (supply runs end here)          Lumen Ridge (highland crest, NE)
//                        Orrin Crater (huge, NW)        Scatterstone Field
//              ~~~~~~~~~~ Silverthread Rille: a winding channel from the north-west across the Hush Sea ~~~~~~~~~~
//                        Hush Sea (smooth dark plain: speed)                      Kestle Crater (huge, E)
//                        Vandry Crater (huge, SW)
//   z = +1024 south      Greywatch Base (domes, garage pad, sample drop)  —  Greywatch Landing (the pad)

export const MOON = {
  size: 2048, cell: 2,
  gravity: 1.62,                   // m/s^2 (the county is 9.81)
  // the sky: black, the sun low in the east for long hard shadows, the home planet hanging over the north horizon.
  // `hour` is what the full view hands its sun model (8.2 = low morning sun); sunDir / planetDir are unit vectors.
  space: {
    sky: 'black', hour: 8.2,
    sunDir: [0.78, 0.36, 0.51],
    planet: { dir: [-0.18, 0.30, -0.94], size: 0.075, name: 'Wayfare', colour: '#4f8fd0' },
  },

  // the smooth dark plain (an ellipse, its edge wandered by noise): flat and fast
  mare: { x: -120, z: 200, rx: 900, rz: 600, name: 'Hush Sea', h: 0 },
  // the bright rolling uplands everywhere else
  highland: { base: 16, amp: 38 },
  // the crest: a ridged band along this line
  ridge: { name: 'Lumen Ridge', line: [[260, -120], [460, -330], [640, -520], [880, -700]], width: 210, height: 118 },
  // the winding channel: control points (Chaikin-smoothed, then a sideways wiggle), floor half-width, wall run, depth
  rille: {
    name: 'Silverthread Rille',
    line: [[-780, -170], [-620, -60], [-480, 40], [-340, 130], [-160, 170], [60, 290], [280, 300], [430, 380], [560, 440]],
    floorHalf: 16, wall: 20, depth: 9.5, wiggle: 30, endRamp: 150,
  },
  // the three big ones (positions jitter a little per seed). R = rim radius; depth = floor below the old ground.
  bigCraters: [
    { id: 'orrin',  name: 'Orrin Crater',  x: -620, z: -640, R: 185, depth: 30, rim: 13 },
    { id: 'kestle', name: 'Kestle Crater', x: 640,  z: 120,  R: 140, depth: 24, rim: 11 },
    { id: 'vandry', name: 'Vandry Crater', x: -720, z: 560,  R: 118, depth: 20, rim: 9 },
  ],
  // named medium craters get these names in order; the rest stay unnamed
  craterNames: ['Pell Crater', 'Brisk Crater', 'Tamsin Crater', 'Oddly Crater', 'Wren Crater', 'Hobb Crater', 'Ilsey Crater'],
  medium: { count: 16, R: [24, 62] },
  small: { count: 190, R: [4, 15] },
  tiny: { count: 1400, R: [1.6, 4] },

  // the base, its pads and the far-side depot (flattened discs)
  base: { name: 'Greywatch Base', x: -120, z: 640, r: 96 },
  landing: { name: 'Greywatch Landing', x: 130, z: 560, r: 30 },
  depot: { name: 'Farside Depot', x: 120, z: -890, r: 48 },
  // keep the craters off these (extra metres beyond the site's own r)
  keepOut: 70,

  // sample sites: where a sample run picks up (filled in from the terrain by the generator; `at` says how)
  samples: [
    { id: 'orrin_floor', name: 'Orrin Floor', at: 'craterFloor:orrin', kind: 'crater' },
    { id: 'rille_bend', name: 'Rille Bend', at: 'rille:0.42', kind: 'rille' },
    { id: 'lumen_foot', name: 'Lumen Foot', at: 'ridgeFoot', kind: 'ridge' },
    { id: 'scatterstone', name: 'Scatterstone Field', at: 'field:0', kind: 'boulders' },
    { id: 'kestle_rim', name: 'Kestle Rim', at: 'craterRim:kestle', kind: 'rim' },
    { id: 'bright_pit', name: 'Bright Pit', at: 'mediumFloor', kind: 'crater' },   // the biggest medium crater well away from the others
    { id: 'vandry_floor', name: 'Vandry Floor', at: 'craterFloor:vandry', kind: 'crater' },
  ],
  // survey spots (KSP-style kits on the Moon later): the top of the ridge, a big rim, the flattest spot of the sea, a basin
  survey: [
    { id: 'lumen_crest', name: 'Lumen Crest', kind: 'summit', at: 'ridgeTop' },
    { id: 'orrin_rim', name: 'Orrin Rim', kind: 'rim', at: 'craterRim:orrin' },
    { id: 'hush_flat', name: 'Hush Flat', kind: 'flat', at: 'mareFlat' },
    { id: 'kestle_basin', name: 'Kestle Basin', kind: 'basin', at: 'craterFloor:kestle' },
  ],
  // boulder fields (named ones; ejecta round every crater is extra)
  fields: [
    { id: 'scatterstone', name: 'Scatterstone Field', x: 120, z: -560, r: 140, density: 0.32 },
    { id: 'tumble', name: 'Tumblestone Reach', x: -300, z: -420, r: 110, density: 0.24 },
  ],
  // jump ramps: two practice kickers north of the base ([dx, dz, yaw] off its centre; yaw pi = drive north up them), the rest aimed into medium crater bowls (filled by the generator)
  ramps: { practice: [[40, -170, 3.1416], [100, -170, 3.1416]], crater: 4, len: 9, h: 2.6, w: 5 },

  // the base's buildings, relative to the base centre (box placeholders; role = what it is). h = wall height.
  buildings: [
    { role: 'hab_dome', name: 'Hab Dome', dx: -38, dz: -22, hx: 9, hz: 9, h: 8, colour: [0.92, 0.92, 0.9] },
    { role: 'command', name: 'Command Module', dx: -6, dz: -30, hx: 11, hz: 6, h: 5, colour: [0.88, 0.86, 0.82] },
    { role: 'lab_dome', name: 'Lab Dome', dx: 26, dz: -24, hx: 8, hz: 8, h: 7, colour: [0.9, 0.9, 0.92] },
    { role: 'tunnel', name: 'Link Tunnel', dx: -21, dz: -26, hx: 6, hz: 1.6, h: 2.6, colour: [0.78, 0.78, 0.76] },
    { role: 'tunnel', name: 'Link Tunnel', dx: 11, dz: -27, hx: 6, hz: 1.6, h: 2.6, colour: [0.78, 0.78, 0.76] },
    { role: 'garage', name: 'Rover Garage', dx: -44, dz: 26, hx: 14, hz: 8, h: 6, colour: [0.74, 0.76, 0.8] },
    { role: 'sample_drop', name: 'Sample Drop', dx: 40, dz: 18, hx: 3.5, hz: 3.5, h: 3, colour: [0.95, 0.75, 0.25] },
    { role: 'solar', name: 'Solar Array', dx: 66, dz: -40, hx: 12, hz: 2, h: 0.6, colour: [0.2, 0.26, 0.42] },
    { role: 'solar', name: 'Solar Array', dx: 66, dz: -28, hx: 12, hz: 2, h: 0.6, colour: [0.2, 0.26, 0.42] },
    { role: 'mast', name: 'Radio Mast', dx: -70, dz: -40, hx: 0.6, hz: 0.6, h: 14, colour: [0.85, 0.85, 0.85] },
  ],
  depotBuildings: [
    { role: 'depot', name: 'Supply Depot', dx: 0, dz: -14, hx: 12, hz: 7, h: 6, colour: [0.82, 0.8, 0.74] },
    { role: 'tank', name: 'Fuel Tank', dx: -20, dz: -10, hx: 3, hz: 3, h: 7, colour: [0.9, 0.9, 0.9] },
    { role: 'tank', name: 'Fuel Tank', dx: 20, dz: -10, hx: 3, hz: 3, h: 7, colour: [0.9, 0.9, 0.9] },
  ],
  // vehicle pads: [dx, dz] off the garage door, facing south (yaw 0)
  garagePads: [[-56, 46], [-44, 46], [-32, 46], [-20, 46]],
  depotPads: [[-10, 14], [10, 14]],
  vehicle: 'moon_rover',
};
