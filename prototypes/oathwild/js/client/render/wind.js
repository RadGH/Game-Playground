// Oathwild's ONE wind (world-tools round 4c, owner 2026-11-26: "Can our tree physics bend in the wind"). Every tree,
// leaf tuft, grass blade and crop sheaf reads this one object, so a gust leans the meadow, then the wood, the same way;
// the rain should ask it too (rainVelocity). It is the Tree Kit's wind (treekit/js/wind.js — read the top of that file
// for the model); this file holds the game's single copy and the weather's hook.
//
//   import { wind } from './wind.js'
//   wind.update(dt)                       once a frame (render/world.js does it)
//   wind.setFromWeather({ kind | key, wind, angle, gust })   THE WEATHER CALLS THIS (every frame is fine — it only sets
//                                         the target, the wind eases there over a few seconds): kind/key 'clear' |
//                                         'cloudy' | 'rain' | 'storm' | 'fog' | 'snow' picks a strength and gustiness
//                                         (treekit WEATHER_WIND); `wind` 0..1.5 / `angle` radians (0 blows toward +x,
//                                         PI/2 toward +z) / `gust` 0..1 override it. render/weather.js: pass this object
//                                         to createWeatherView({ wind }) or weatherView.setWind(wind).
//   wind.dirX / dirZ / strength / gust    as drawn (Farhold's names, so the rain code reads it unchanged)
//   wind.hold(v) / hold(null)             pin it (tests, screenshots, the editor): the weather cannot move it
//   wind.storm(on)                        a storm now / back (tests, the editor)
//   wind.now({ strength, angle, gust })   jump straight there (the weather may move it again)
//   wind.state                            { angle, dirX, dirZ, strength, gust, time }
//   wind.rainVelocity(fall)               { x, y, z } metres a second for rain streaks
//   wind.uniforms / WIND_GLSL             for any other shader: Object.assign(shader.uniforms, wind.uniforms) and paste
//                                         WIND_GLSL after #include <common>; then owWindPush(xz) / owGrassLean(xz, k)
//   applyTreeWind(material, wind)         a tree material bends (treekit/js/materials.js does this for every tree)
//
// Changing the wind only changes four numbers on the graphics card — no shader is rebuilt (lessons rule 29).
// `?wind=storm` (or calm / breeze / windy / gale) in the page address holds a named wind (screenshots and tests).
import { createWind, WIND_PRESETS, WIND_GLSL, applyTreeWind, WEATHER_WIND } from '../../../../../treekit/js/wind.js';

export const wind = createWind({ seed: 7, strength: 0.3, gust: 0.45 });
export { WIND_GLSL, applyTreeWind, WIND_PRESETS, WEATHER_WIND };

const held = typeof location !== 'undefined' ? new URLSearchParams(location.search || '').get('wind') : null;
if (held && WIND_PRESETS[held]) wind.hold({ ...WIND_PRESETS[held], angle: 0.6 });
if (typeof window !== 'undefined') window.__owWind = wind;   // tests and the editor reach the one wind here
