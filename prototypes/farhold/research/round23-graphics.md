# Round 23, item 6 — the graphics round

> "Take a look at the game '3d high def' where we've implemented better graphics including bloom and
> gpu grass. What of these effects can we use to enhance the graphics of the game? It's OK the
> characters are cartoony but I would rather the world feel more atmospheric with multi-colored
> sunsets and more atmospheric weather and enhanced rain and wind effects."

Built, not just looked at. Everything below is in the game, behind one new setting, with screenshots
in `research/round23-graphics/` (each scene has a `-before` and an `-after`).

---

## What you get

| | Before | After |
|---|---|---|
| **Sunset** | One flat orange wash that went straight to a starry black sky while the sun was still up. | Nine colours at every height of the sun: deep blue overhead, violet, rose, orange and gold at the horizon under the sun, and on the far side the planet's own blue shadow with a pink band above it. The rose band arrives after the gold and leaves after it. Clouds are lit from below in the same colours, with a silver edge near the sun. |
| **The sun** | A disc behind the air, dimmed to a ring at the horizon. | A bright core that blooms, throws light shafts through anything in front of it, and glows through the haze. |
| **Night** | Flat black, with the sunlight shining up through the ground (lit chins, dark tops). | A deep moonlit blue sky, a cool blue light from where the full moon would be, and a fill that still shows the ground. |
| **Alien worlds** | The same sunset colours on every world. | The whole sky table is turned round the colour wheel by how far the planet's own palette sits from blue. A yellow-sky desert world gets a magenta-pink sunset (`alien-desert-sunset-after.jpg`). |
| **Fog** | Distance fog only. | Height fog as well: it lies in the valleys and leaves the ridges clear, thickens at dawn (a morning mist, lower and heavier than the evening), thickens in rain and snow, and glows warm when you look toward the sun. It thins as you climb and is gone in orbit. |
| **Rain** | 2,000 line segments, all slanting along +x. | 3,600 (Low) to 9,000 (High) streaks drawn on the graphics card, leaning with the wind; splash rings where drops land and wider ripples on water; grey rain curtains drifting past 120 m out; the ground darkens and picks up a sky sheen as it gets wet (half a minute to soak, a minute and a half to dry). |
| **Storms** | Lightning flashed the scene. | A darker, greyer sky and a darker camera; lightning strikes twice in quick succession the way it does, and the bolt is bright enough to bloom. |
| **Snow** | Round flakes, drifting. | Softer flakes on the graphics card, fluttering, blown much further sideways by the wind than rain is. |
| **Wind** | A strength with no direction. Trees did not move. | ONE wind with a direction that wanders slowly, a strength that follows the weather, and gusts. The rain, the snow, the dust, the cloud deck, the trees, the bushes, the ferns, the reeds and the grass all read it. Leaves (green country), dust (dry ground), spindrift (snow) or ash (burnt lands) tumble along the ground when it gets up. |
| **Clouds** | A texture wrapped on the dome, scrolling round the zenith like a record. | A flat sheet overhead projected onto the dome, so the clouds really cross the sky downwind and bunch toward the horizon. |
| **Grass** | ~1,200 cone tufts per rebuild on the processor. | On High: a field of ~48,000 blades drawn entirely on the graphics card, standing on the exact triangles the ground is drawn with, coloured half by the biome and half by the ground under it, bending in the shared wind and pushed aside as you walk. None on roads, sand, ice, ash, rock, water, levelled plots or town squares. |
| **The picture** | Drawn straight to the screen, values over 1 clipped. | A high-dynamic-range frame, bloom on the raw values, light shafts, ACES tone mapping, and a colour grade that follows the time of day and the weather (warm highlights and violet shadows at sunset, blue shadows at night, cool and flat in a storm), with a light vignette. |

## The setting

**Settings → Picture → Graphics effects: Off / Low / High.** Default **High** (you play on a strong card).
`js/gfx.js` is the one place that says what each level turns on.

| | Off | Low | High |
|---|---|---|---|
| HDR frame, bloom, ACES, colour grade | – | yes (bloom at half resolution) | yes |
| Light shafts | – | – | yes (half resolution) |
| Multisampling in the HDR frame | canvas 4x, as before | none | 4x |
| Sky table, sunsets, moonlight, lit clouds | yes | yes | yes |
| Height fog, wet ground | compiled out | yes | yes |
| Wind sway on plants | yes | yes | yes |
| Rain / snow | the old line rain and point snow, leaning with the wind | GPU, 3,600 drops | GPU, 9,000 drops |
| Splashes, rain curtains, blown debris | – | yes (smaller budgets) | yes |
| Grass | the old CPU tufts | the old CPU tufts | the GPU field |

- `?quality=low` (every Playwright spec) boots at **Off**, so the existing specs keep testing the cheap path.
- `?graphics=off|low|high` boots at that level, for testing.
- Picking a level on the panel wins over both — the URL only decides what the page boots at.
- Changing it in play rebuilds the pipeline, swaps the GPU rain in or out, and hands the grass back
  and forth between the GPU field and the CPU tufts. Canvas antialiasing is decided when the page
  loads (a browser cannot change it later), so switching from High to Off in play gives Off without
  antialiasing until the next reload.

---

## What was borrowed from highdef-3d, and how it had to change

**Bloom before tone mapping, the light-shaft trick, ACES, the grade** (`highdef-3d/js/renderer.js`,
`postfx.js`) → `js/postfx.js`. Same order, same ideas, three changes:
- Tone mapping and the grade are **one** pass instead of two (highdef runs an OutputPass then a grade
  pass): the same arithmetic, one fewer full-screen read and write.
- The shafts run at **half resolution** and are added back in the final pass. They are soft by nature,
  so nothing is lost and they cost a quarter.
- Farhold draws **two scenes** into the frame (the sky scene with the planets, then the world), and a
  third one in space, so the pipeline takes a "draw" callback rather than a single scene.
  `renderer.info` is restored after the passes so the draw-call readouts still mean "the world".

**Height fog in closed form, glowing toward the sun** (`highdef-3d/js/materials.js`) →
`js/atmosphere.js`. highdef bolts its fog onto each material through an `enhance()` call. Farhold
makes its materials in a dozen modules, so instead this patches three's fog **chunks** once, at import,
and every fogged material in the game gets the new fog for free. The awkward part is getting the SAME
uniform objects into every material (three copies uniforms when it compiles): a small accessor on
`Material.prototype.onBeforeCompile` injects them first and then runs the material's own hook, and
`customProgramCacheKey` is rewritten to match so two materials with different hooks never share a
program by accident. The exponents are clamped because a Farhold camera can be 40 km up.

**The day/night colour table** (highdef's 11 keyframes on the hour) → `js/sky-palette.js`, nine
keyframes on the **height of the sun** — a Farhold world has an axial tilt and you can walk round it,
so the hour does not say how high the sun is. highdef's table has one "sky" and one "ground" haze
colour; Farhold's has nine bands (five on the sun side, four opposite), because the brief was
multi-coloured sunsets. Plus the palette turn for alien worlds, which highdef has no need of.

**GPU grass on a world-fixed lattice** (`highdef-3d/js/grass.js`) → `js/grass-gpu.js`. The one idea
that matters is kept exactly: an instance is a **slot**, not a blade; the patch centre moves in whole
lattice squares; everything about a blade is a hash of its square's own coordinates. So the same
ground always grows the same blade and the field cannot crawl. What changed, because Farhold is a
160 km planet that streams rather than one 1024 m heightmap:
- **Height**: there is no world heightmap to upload. But the innermost clipmap ring already samples
  the ground on a 2 m lattice round the player, and that lattice IS the ground you see. Its height
  array goes to the card as a 97×97 float texture whenever the ring rebuilds, and the shader
  interpolates along the **same diagonal the ring's triangles use** — so a blade stands on the drawn
  triangle, not a smooth surface a few centimetres off it.
- **Where it grows**: a 128×128 texture, 1 m a texel, that **wraps** (each texel holds whichever
  world metre is congruent to it and nearest you). Walking only re-samples the strip that came into
  range, a few hundred cheap terrain queries a frame.
- **Precision**: 30 km from the origin a float is good to a couple of centimetres, enough to make a
  square jump. So the lattice is addressed in whole numbers and the hash is an integer hash.
- **The CPU tufts step aside** (`props.setGrassMode('gpu')`) — grass is the last thing a prop cell
  draws from its random stream, so skipping it moves nothing else (the round-12 subset rule holds).

**Wind sway through the one material hook** (highdef's `enhance({ wind })`) → `markSway()` in
`js/atmosphere.js`, used by `js/props.js` on trees (4% of their height at a gale), bushes, ferns,
reeds and the CPU grass. The bend grows with the square of the height, the phase comes from where
the plant stands so a wood does not rock in step, and the direction is the one wind.

## What was not borrowed, and why

- **Three's physical sky and the reflection probe.** Farhold's sky is its own scene with the other
  planets and moons in it, the air drawn in front of them, a per-star galaxy behind, and alien
  palettes; a Preetham/Hosek sky is Earth air and nothing else. And Farhold's materials are Lambert,
  which do not read an environment map, so a probe would be rendered every time the sun moved for
  nothing to reflect it. The wet-ground sheen uses the sky table's own colour instead.
- **Cascaded shadow maps.** Farhold has no shadows at all. Adding them to a 15 km clipmap with
  instanced scatter is its own project (every caster drawn once per cascade), and the brief was
  atmosphere, not shadows.
- **Ambient occlusion (GTAO)** — two more full-scene passes; the flat-shaded low-poly look has little
  for it to find. highdef leaves it off by default too.
- **SMAA** — High multisamples the HDR frame instead. Low has no antialiasing (it is the cheap level).
- **Textured, triplanar ground and the texture kits** — Farhold's ground is vertex-coloured by biome
  and its props are its own low-poly kit; changing that is a different look, not an atmosphere pass.
- **Water depth colour and shoreline foam** — not in the brief; a good next step.

---

## Performance

Measured in headless Chromium, 1280×720, seed 11, noon, clear, facing the same way.
**This is a software renderer (SwiftShader) running on the processor, not a graphics card.** It is
what this machine has; it cannot tell you what your card will do. It is honest about relative cost
of CPU-side work and of the cheap levels, and it wildly overstates anything a GPU does in parallel —
vertex-heavy work (the grass) and multisampling in particular.

"Render" is the time to draw one frame with the game loop paused, synchronised with a one-pixel read;
"frame" is the whole frame with the game running. Draw calls and triangles are the world scene only,
as the readout has always meant.

**Town (spawn, Hollowcrown)**

| | frame | render | draw calls | triangles | post passes |
|---|---|---|---|---|---|
| before (f528653) | 178–187 ms | 174–184 ms | 135 | 370k | – |
| **Off** | 190 ms | 182 ms | 135 | 370k | 0 |
| **Low** | 177 ms | 172 ms | 135 | 370k | 3 |
| **High** | 1,110 ms | 1,150 ms | 135 | 609k | 3–4 |

**Grassland outside town**

| | frame | render | draw calls | triangles |
|---|---|---|---|---|
| before | 175 ms | 168 ms | 117 | 360k |
| Off | 195 ms | 194 ms | 117 | 360k |
| Low | 186 ms | 180 ms | 117 | 360k |
| High | 1,043 ms | 1,037 ms | 115 | 556k |

**Rain (town)**: before 183 ms render; Low 225 ms (+3 draws: streaks, splashes, curtains); High 1,219 ms.

**Where High's time goes on the software renderer** (render only, town):

| | ms |
|---|---|
| scene without grass, no post | 101 |
| + GPU grass (48k blades, 384k vertices) | +360 |
| + grade | +13 |
| + bloom (half / full) | +23 / +60 |
| + 4x multisampling of the HDR frame | +470 |
| + light shafts (half resolution) | +42 |

What that means for a real card: Off and Low cost what the old picture did (Low is slightly cheaper
here because it drops the canvas's 4x antialiasing). High's two big items are exactly the two things a
graphics card is built for — a few hundred thousand simple vertices and a multisampled target — and on
any recent desktop GPU both are in the low single milliseconds at 1080p. **Not measured on your card;
please check the frame rate on High, and if it is not smooth, Low keeps everything but the grass
field, the shafts and the multisampling.**

Two things done for cost along the way:
- **Off compiles the height fog and the wet ground out of every shader** (`FEATURES` in
  `js/atmosphere.js`, whose version is part of every program's cache key so a change recompiles).
  Even at zero strength, a branch on a uniform still runs both sides on this renderer, and Off
  measured 25% over the old picture until they were compiled out.
- **A clear sky skips the cloud decks** (4% cover is invisible anyway; a whole-sky shader is not free).

---

## Tests

- `tests/round23-graphics.test.js` (node, 17 tests): a sunset has at least four distinct hues up the
  sun side, blue at the top and gold at the horizon, and the sun side is brighter than the far side;
  the rose band outlasts the gold; a night is blue and not black, with a cool light and a real fill;
  an alien palette keeps its own noon and gets a turned sunset; storms desaturate, lightning floods,
  orbit is black with a limb of air; the height fog is thicker at dawn than dusk, lower at dawn, fuller
  in rain, zero indoors and zero in orbit; **one wind** — turn it east, then south, then calm, and ask
  the rain, the snow, the debris, the clouds and the sway which way they blow; the drift, the
  following and the per-world direction; by reading the source, that no consumer keeps its own rule
  and both weather-view construction sites get the shared wind; **Off really turns things off**, Low
  and High turn on what they say, `?quality=low` forces Off and `?graphics=` wins; where the grass
  grows; the lattice property 30 km from the origin; and that the GPU grass reads ring 0's own heights
  along its own diagonal.
- `tests/round23-graphics.spec.js` (Playwright, 6 specs): boots clean at Off, Low and High and draws
  a real picture (mean brightness and variation read back from the frame) at noon, sunset and night,
  with the right number of post passes and the right grass; the panel switches the level in play and
  the grass and rain follow; rain is the GPU rain with splashes and curtains, leaning toward the wind
  it was given, and the ground gets wet; orbit has no fog wall (the fog amount falls with the air and
  is zero at the top, the space scene has none, the sky is black with the stars out).
- Existing specs re-run: phase2, farhold, round3, round4, round5, space, settings, density — 72 tests.
  One failed on the first run: round4's "the galaxy is behind the planets" wound the clock with
  `setTime`, which updated the sky **without the player's longitude**, found a night at the map's left
  edge and then read a local morning. It had been passing only because the old galaxy was drawn
  whenever the sun was under 20° up. Fixed in `setTime` (it passes the longitude now, as the frame
  loop always did). 71 passed on the first run; the failing one, the day-cycle spec and the eclipse
  spec pass after the fix, and the phase2 weather specs pass after the last tuning change.
- All 1,221 node tests in `prototypes/farhold/tests/` pass.

## Files

New: `js/gfx.js` (the setting), `js/sky-palette.js` (the sky table, fog numbers, the grade),
`js/wind.js` (the one wind), `js/atmosphere.js` (fog / wet / sway chunks and the material hook),
`js/postfx.js` (the pipeline), `js/rain.js` (GPU rain, splashes, curtains, snow, debris),
`js/grass-plan.js` + `js/grass-gpu.js` (the GPU grass), `js/graphics.js` (wires it all, so
`js/main.js` needs only hook lines).

Changed: `js/sky.js` (the banded backdrop and veil, the HDR sun core, moonlight, smaller stars),
`js/weather.js` (shared wind, planar lit cloud decks, GPU precipitation, double-stroke lightning),
`js/props.js` (sway, `setGrassMode`, `isCleared`), `js/terrain.js` (a ring `version`),
`js/settings.js` (the Graphics effects choice), `js/main.js` (grouped hooks — imports, the canvas
antialias choice, `createGraphics` beside the weather view, `graphics.update` after each
`sky.update`, the render wrapper, resize, the settings line, `window.farhold.graphics`, `setTime`'s
longitude), `index.html` (the generated modulepreload list).

## Not done, and why

- **No measurement on a real graphics card.** This machine has only the software renderer; the
  numbers above say what is cheap and what is not, not what your frame rate will be on High.
- **Grass only near you, only on High.** The GPU field reaches 38 m. Beyond that there is no grass on
  High (the CPU tufts reached ~130 m, but mixing the two drew both at the seam). Low and Off keep the
  CPU tufts. Grass bends round the player only, not round monsters or followers.
- **Rain ignores roofs.** It falls through a porch or an archway. The streaks fade just below the
  ground height under the camera, not under the drop.
- **Lightning lights everything evenly.** The flash has no direction (no light at the bolt).
- **Snow does not settle.** Flakes fall and vanish; the ground is not whitened.
- **The wet look is on Lambert materials only** — the ground, the scatter, the buildings and the
  characters. The river ribbons and a few custom shaders do not darken.
- **Two things noticed and not touched** (both the same before and after this round): entering the
  nearest dungeon on seed 11 leaves the camera looking at a black wall for a moment; and the desert
  world Xaetrix 6E II was in a solar eclipse at both noon and dawn when screenshotted.
