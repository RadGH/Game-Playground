// Oathwild's weather setup (world-tools round 2026-11-26, owner: "Can we have weather from thousand vale, it has lightning
// and storm effects"). Plain data: js/world/weather.js reads it on the server (which weather each region has) and the
// browser (the same names and the strike timing). World Forge (worldgen/js/weather.js) decides the odds from each
// region's climate below; `bias` then leans a region towards the weather it is known for.
//
// No day clock yet: one weather holds `holdMinutes` real minutes (≈ a few in-game hours) and takes `changeSeconds` to
// roll into the next, so a storm comes in over the hills instead of switching on.

export const WEATHER_SETUP = Object.freeze({
  // the weathers Oathwild uses (World Forge keys). Snow and blizzard are kept for high or northern regions later:
  // a region only gets them with `snow: true`.
  kinds: ['clear', 'fair', 'cloudy', 'overcast', 'drizzle', 'rain', 'storm', 'fog'],
  snowKinds: ['snow', 'blizzard'],
  holdMinutes: [10, 26],
  changeSeconds: 50,
  // lightning: at a weather's full `lightning` (a storm), the chance of a strike in any one second (the same for every
  // player: the strike times come from the world's seed and the world clock)
  strikesPerSecond: 0.11,
  strikeMetres: [140, 1400],          // how far away a strike lands (thunder comes later the further it is)
  border: 45,                         // metres either side of a region border over which two regions' weather blends
  regions: {
    // the meadows, farms and river: mostly fair, the odd shower, a storm now and then
    brightwater_vale: { temperature: 0.62, moisture: 0.5, elevation: 0.55, biome: 5, bias: { rain: 1.5, drizzle: 1.3, storm: 4 } },
    // the deep wood and the mere: wetter, foggier, and where the big storms come in
    thornmere_wilds: { temperature: 0.6, moisture: 0.74, elevation: 0.6, biome: 8, water: 1, bias: { rain: 1.4, fog: 1.3, storm: 5 } },
    // Ashfield (regions, owner 2026-11-27: "the graveyard should be spooky with fog"): grey skies, ground fog most of the
    // time, drizzle; never a clear, fair or cloudy (blue-sky) day
    ashfield: { temperature: 0.48, moisture: 0.78, elevation: 0.62, biome: 8, bias: { fog: 14, overcast: 6, drizzle: 2.5, cloudy: 0, clear: 0, fair: 0, storm: 1.2 } },
  },
  // any region not listed above (a new one from the world builder) gets this climate until it is given its own
  fallback: { temperature: 0.58, moisture: 0.55, elevation: 0.6, biome: 8, bias: { storm: 3 } },
});
