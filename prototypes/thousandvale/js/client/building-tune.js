// How tall Thousandvale builds (stream W, owner play-test 5, T13: "many buildings are too short/squat, especially
// the new trade-skill buildings").
//
// What was wrong, measured (tests/B/buildings.test.js prints the table): every town of Torbor Downs is HALFLING
// culture, whose storeys are 2.0-2.5 m with a 1.75-2.2 m door, against a Chibi 2 character 1.5-2.0 m tall (1.75 typical,
// before the hat). 91% of buildings were one storey; a burrow SINKS 48% of a storey, so its door started 1.1 m under the
// grass; and the trade plots are shallow strips (the town hall's is 8.6 x 3.7 m) that only a hovel fits, and a hovel is
// nearly square — so the hall was a 2.6 m hut on a plot three times as long, no bigger than the market stall beside it.
//
// proctown's `describeBuilding({ tune })` is the opt-in that fixes it without moving anything: the plot, the door's
// side and the yaw stay, so nav.bin, the NPC spots and stream E's offices are untouched (Farhold passes no tune and is
// byte-identical). Pure data + one function: no three, no DOM.

/** Metres. A typical Chibi 2 body is 1.75 m (1.5-2.0 over the height dial; avatar-3d/js/chibi2-geometry.js createRig). */
export const CHARACTER_HEIGHT = { min: 1.5, typical: 1.75, max: 2.0 };

export const BUILDING_SCALE = {
  storeyHeight: [3.3, 3.9],     // ~2x a character: the ceiling is well clear of a hat (was 2.0-2.5 halfling, 2.5-3.1 human)
  doorHeight: [2.6, 3.0],       // ~1.5x a character, and never under 1.3x the tallest one (was 1.75-2.2)
  doorWidth: [1.3, 1.8],        // (was 1.0-1.5)
  sink: 0,                      // nothing is dug in: a door stands on the ground you walk on
  windowScale: 1.3,
  minPitch: 0.8,                // as far as the roof type allows (a turf mound stops at 0.6)
  roofBias: { turf_mound: 0.35, flat: 0.5 },   // fewer flat lids; the culture's other roofs take their place
  fill: { office: 0.92, home: 0.78 },          // share of the plot a building takes at least, each way
  /** Trades that are two storeys wherever their plot is deep enough to carry it. */
  twoStorey: ['hall', 'inn', 'temple', 'chapel', 'counting_house', 'study', 'jeweller', 'tailor', 'apothecary', 'armoury', 'shop', 'provisioner', 'barber', 'bowyer', 'mill', 'barracks', 'watchpost'],
  /** A building shallower than this stays one storey (two would be a wall with a roof on it). */
  twoStoreyMinDepth: 2.4,
  /** One home in this many is two storeys, by its seed. */
  homeTwoStoreyEvery: 3,
};

/**
 * The `tune` for one building. `want` = its trade (or 'house'), `office` = stream B's office id when it has one,
 * `plot` = its proctown plot ({w, d}), `seed` = its own seed.
 */
export function tuneFor(want = 'house', { office = null, plot = null, seed = 0 } = {}) {
  const S = BUILDING_SCALE, job = office || want || 'house';
  const isOffice = !!office || !['house', 'hut'].includes(job);
  const depth = plot ? Math.min(plot.w || 6, plot.d || 6) - 1.1 : 6;
  let minStoreys = 1;
  if (depth >= S.twoStoreyMinDepth) {
    if (S.twoStorey.includes(job) || S.twoStorey.includes(want)) minStoreys = 2;
    else if (!isOffice && (seed >>> 0) % S.homeTwoStoreyEvery === 0) minStoreys = 2;
  }
  return { storeyHeight: S.storeyHeight, doorHeight: S.doorHeight, doorWidth: S.doorWidth, sink: S.sink, windowScale: S.windowScale,
    minPitch: S.minPitch, roofBias: S.roofBias, fill: isOffice ? S.fill.office : S.fill.home, minStoreys };
}
