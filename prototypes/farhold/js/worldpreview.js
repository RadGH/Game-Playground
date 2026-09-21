// Farhold R16 — the map of the starting planet, drawn on the title screen.
//
// "Display world settings on the side and on the other side display a map of the starting planet.
//  Allow changing the seed or options to affect the world generated."
//
// This is the honest way to do that: build the SAME world the run is about to build, with the same
// `createWorld` the game calls, and turn it into a picture. Nothing here is a stand-in — change the
// seed on the title screen and you are looking at the planet you will land on.
//
// It is PURE: no DOM, no canvas, no Three.js. That is the whole point, because it runs inside a Web
// Worker (js/worldpreview-worker.js). A full 256 x 128 world takes about 600 ms to generate, which
// is long enough to freeze the page mid-keystroke if it ran on the main thread — so it does not.
// js/newgame.js falls back to calling `buildPreview` directly at half resolution if the browser
// will not give it a worker, and says so under the map.
//
//   import { buildPreview } from './worldpreview.js';
//   const p = buildPreview({ seed: 7, width: 256, height: 128, regionScale: 2, habitable: true });
//   p.pixels   // Uint8ClampedArray, width * height * 4, ready for putImageData
//   p.nodes    // the towns, ports and dungeons worth a dot
//   p.start    // the town you will be standing beside — see the note on it below

import { createWorld } from './planet.js';
import { worldPixels } from '../../../worldgen/js/render.js';
import { makeRng } from '../../../worldgen/js/noise.js';

/**
 * Which map nodes are worth a dot on a picture this small.
 *
 * Landmarks are deliberately out: a world carries ninety-odd of them and at 512 px across the map
 * came out as speckle rather than as a place people live in. Settlements, ports and the dungeons
 * are the three you would actually choose a seed for.
 */
const SHOWN = new Set(['settlement', 'port', 'dungeon']);

/**
 * Paint a cell, blending towards a colour. Rivers and roads are one cell wide on this map, so they
 * go straight into the pixel buffer rather than being drawn as polylines on top — at 256 px across
 * a vector river would be thinner than the pixel it sits in.
 */
function blend(px, i, r, g, b, k) {
  const o = i * 4;
  px[o] = px[o] * (1 - k) + r * k;
  px[o + 1] = px[o + 1] * (1 - k) + g * k;
  px[o + 2] = px[o + 2] * (1 - k) + b * k;
}

export function buildPreview({ seed = 1, width = 256, height = 128, regionScale = 2, habitable = true } = {}) {
  /**
   * `liveable: true` whether or not the box is ticked — this is exactly what js/main.js passes, and
   * the preview is worthless if it disagrees with the run. The habitable box decides WHERE you land,
   * not which system the seed search settles on, so both have to be handed over the same way.
   */
  const built = createWorld({ seed, width, height, regionScale, habitable, liveable: true });
  const world = built.world;

  const img = worldPixels(world, { layer: 'biomes', hillshade: true });
  const px = img.data;
  const N = width * height;

  // the water you can follow, and the roads between the towns
  for (let i = 0; i < N; i++) {
    if (world.river?.[i]) blend(px, i, 90, 150, 200, 0.55);
    if (world.roadCells?.[i]) blend(px, i, 200, 180, 130, 0.45);
  }

  // a thin line where one level band gives way to the next — a region IS a zone in this game
  if (world.region) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (world.region[i] < 0) continue;
      const right = x < width - 1 ? world.region[i + 1] : world.region[i];
      const down = y < height - 1 ? world.region[i + width] : world.region[i];
      if ((right >= 0 && right !== world.region[i]) || (down >= 0 && down !== world.region[i])) {
        blend(px, i, 20, 24, 34, 0.35);
      }
    }
  }

  const nodes = (world.nodes || [])
    .filter(n => SHOWN.has(n.type))
    .map(n => ({ x: n.x, y: n.y, type: n.type, kind: n.kind, name: n.name, size: n.size ?? 1 }));

  /**
   * THE TOWN YOU WAKE UP BESIDE.
   *
   * `planet.js`'s `spawnPoint()` starts a new character outside the biggest settlement, picking
   * among the top three with a fresh `makeRng(world.seed)`. Repeating those two lines here is the
   * only way the preview can honestly say "you start here" — and because the rng is made fresh from
   * the world seed in both places, the first number it produces is the same number, so it is the
   * same town. If spawnPoint's rule ever changes, this comment is where to look.
   */
  const towns = (world.nodes || []).filter(n => n.type === 'settlement' || n.type === 'port');
  let start = null;
  if (towns.length) {
    const ranked = towns.slice().sort((a, b) => (b.size ?? 1) - (a.size ?? 1));
    const rng = makeRng(world.seed);
    start = ranked[Math.floor(rng() * Math.min(3, ranked.length))] || ranked[0];
    start = { x: start.x, y: start.y, name: start.name };
  }

  const land = (() => { let n = 0; for (let i = 0; i < N; i++) if (!world.water[i]) n++; return n / N; })();
  const biomes = [...new Set(Array.from(world.biome).map(b => b))].length;

  return {
    ok: true,
    width, height,
    pixels: px,
    nodes,
    start,
    regions: (world.regions || []).length,
    towns: towns.length,
    land,
    biomes,
    planet: { name: built.planet.name, archetype: built.planet.archetype, id: built.planet.id },
    star: { name: built.star.name, className: built.star.className || built.star.classKey || '' },
    systemSeed: built.systemSeed,
    movedSeed: !!built.movedSeed,
  };
}
