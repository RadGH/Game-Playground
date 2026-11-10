// The survey kits (Expansion 1 M10) as DATA: a plain module (no JSON import — browsers that lack import attributes would
// lose the page), read by the pure rules (js/game/survey.js), the room's referee (js/game/jobs/survey.js), the page
// (js/game/survey-play.js) and the Moon jobs (M12). data/shop.json sells them under the same ids (tests/survey.test.js
// checks the two agree).
//
// A kit:
//   id, name, letter (map glyph), colour, blurb       what a player sees
//   max      how many of this kit one player may have set up at once (crates waiting to be set up count too)
//   setup    seconds of holding E to unfold it (the Quick setup upgrade halves it)
//   pay      { base, per_km }  gold at the Survey Office: (base + per_km x km from the office) x (0.75 + 0.5 x spot quality)
//   model    the deployed look survey-play.js builds: 'mast' | 'probe' | 'dish' | 'lab' | 'relay'
//   rules    [{ t, … }] every one must pass (js/game/survey.js judgeSpot says what each one means)
//   places   { <map>: { rules } }   a place with its own rules (the Moon: no weather, no water) — overrides `rules`
//
// Rule kinds (js/game/survey.js RULES): high { pct } higher than that share of the place's dry land; slope { max } in
// degrees (word: what the readout calls it); road { min } metres from any road; ground { not | only } ground kinds
// (SURFACES names + 'water'); summit { r, by, rise } nothing within r metres is more than `by` metres higher, and the spot stands `rise` metres
// above the average of the ground round it (a hilltop, not a flat field); apart { m, any }
// metres from your other kits of this kind (any: from every set-up kit); near { water, special } within `water` metres
// of water OR inside one of the `special` areas (the place's grid specials: 'giant_wood'); office { min } metres from
// the Survey Office.

export const KITS = Object.freeze([
  { id: 'weather_mast', name: 'Weather Mast', letter: 'W', colour: '#5aa7e8', model: 'mast', max: 3, setup: 5,
    blurb: 'A folding mast with wind cups and a vane. It wants to stand high up, where the wind is honest.',
    pay: { base: 70, per_km: 45 },
    rules: [{ t: 'high', pct: 0.7 }, { t: 'slope', max: 24 }, { t: 'ground', not: ['water', 'shallows', 'ice', 'road', 'asphalt', 'concrete'] }],
    places: { moon: { rules: [{ t: 'high', pct: 0.7 }, { t: 'slope', max: 24 }] } } },
  { id: 'seismic_probe', name: 'Seismic Probe', letter: 'Q', colour: '#d9a441', model: 'probe', max: 3, setup: 6,
    blurb: 'A spike that listens to the ground. Traffic drowns it out: flat, firm ground, well away from the roads.',
    pay: { base: 90, per_km: 45 },
    rules: [{ t: 'slope', max: 6, word: 'flat' }, { t: 'road', min: 90 }, { t: 'ground', not: ['water', 'shallows', 'mud', 'sand', 'ice', 'snow', 'farm'] }] },
  { id: 'radar_dish', name: 'Radar Dish', letter: 'R', colour: '#e05a5a', model: 'dish', max: 3, setup: 7,
    blurb: 'Needs a clear view all round: the top of a hill, and far from any other dish.',
    pay: { base: 110, per_km: 50 },
    rules: [{ t: 'summit', r: 50, by: 1.5, rise: 4 }, { t: 'high', pct: 0.45 }, { t: 'apart', m: 500 }, { t: 'slope', max: 20 }] },
  { id: 'field_lab', name: 'Field Lab', letter: 'L', colour: '#59c97a', model: 'lab', max: 2, setup: 8,
    blurb: 'A tent full of jars. It studies life, so it wants water nearby — or the giant trees of the Elderwood.',
    pay: { base: 140, per_km: 45 },
    rules: [{ t: 'near', water: 45, special: ['giant_wood'] }, { t: 'slope', max: 12 }, { t: 'road', min: 15 }, { t: 'ground', not: ['water', 'shallows', 'ice', 'road', 'asphalt', 'concrete'] }],
    places: { moon: { rules: [{ t: 'slope', max: 12 }, { t: 'near', special: ['crater', 'base'] }] } } },
  { id: 'signal_relay', name: 'Signal Relay', letter: 'S', colour: '#b07be0', model: 'relay', max: 3, setup: 5,
    blurb: 'Passes the readings home. Far out from the office, on a rise, not crowded by the other kits.',
    pay: { base: 80, per_km: 40 },
    rules: [{ t: 'office', min: 900 }, { t: 'summit', r: 30, by: 3, rise: 2 }, { t: 'apart', m: 150, any: true }, { t: 'slope', max: 22 }] },
]);

/** The crate a kit travels in (a prop in data/vehicles.json, kind 'kit_crate'). */
export const CRATE = Object.freeze({ kind: 'kit_crate', hx: 0.42, hy: 0.32, hz: 0.42 });

/**
 * Where a carried kit crate goes when you press E beside a vehicle ("Load"): slots in the vehicle's frame (+z forward,
 * +x left), the crate's MIDDLE, a little above the floor it settles on. Anything not listed still takes a crate the
 * plain way (put it down on the bed / deck yourself); the helicopter slings it instead (js/game/survey-play.js).
 */
export const HOLDS = Object.freeze({
  trail_jeep: [[0, 1.0, -1.25]],
  quad: [[0, 1.05, -0.62]],
  dune_buggy: [[0, 0.85, -1.15]],
  army_truck: [[0, 0.85, -1.0], [0, 0.85, -2.4]],
  tow_truck: [[0, 1.0, -1.6]],
  trailer_utility: [[0, 0.62, 0]],
  trailer_flatbed: [[0, 0.62, 0.8], [0, 0.62, -1.4]],
  delivery_van: [[0, 1.0, -1.4]],
});

/** Upgrades (data/jobs.json survey) and what each changes. */
export const SURVEY_UPS = Object.freeze({ quick: 'survey_quick_setup', scanner: 'survey_scanner', twin: 'survey_twin_crates', sling: 'survey_long_sling' });
export const SLING = Object.freeze({ short: 6, long: 16 });      // metres of rope under the helicopter
