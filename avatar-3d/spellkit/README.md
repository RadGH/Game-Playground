# Spell Kit + Spell Lab

**Status:** playable — engine, 38 visuals, every Oathwild spell mapped, Codex-painted textures, browser tests green (2026-11-23).
**Play:** Spell Lab at `avatar-3d/spellkit/` on the playground server (8400 stable / 8401 dev). `?spell=<visual id>`, `?quality=low`.
**Next:** wire into Oathwild's client (`js/client/spells`), tune each visual in the live game camera; Wyrmroad and others can adopt it.
**Parked:** soft particles (fading where a particle meets the ground — needs the depth texture); per-spell sounds (Sound Lab ids in the visual data).

Layered, phased spell visuals for three.js games, after the owner's brief (2026-11-23, "more elaborate spell effects
like in WoW"):

1. **Wind-up** — while you aim, the caster's hands light up in the element: flames licking round the hand bones,
   motes gathering in, a glow, a flickering light. A targeting indicator shows where the spell will land.
2. **Ground spells** (Ring of Dawn, the hallowed-ground example) — a rune circle **projected onto the terrain** (it
   drapes over hills), turning and pulsing; an **expanding see-through wall** of scrolling painted light; **many
   emitters, each with its own painted texture**: rising motes, sparks, flame licks, soft haze, floating sigils.
3. **Impacts** — a painted burst flipbook, a shockwave ring on the ground, sparks and debris, smoke, a scorch or frost
   mark that fades over seconds, a pooled light flash and a small camera shake for big hits.

Builds on `avatar-3d/js/spellfx.js`: its element palettes (`ELEMENT_PALETTE`, `elementName`) are the kit's colours.
spellfx.js is unchanged (Thousandvale and Farhold keep using it).

## Files

| Path | What |
|---|---|
| `js/spellkit.js` | the kit: `createSpellKit`, phases, effects, every layer type |
| `js/particles.js` | the two particle pools (glowing + smoky) and the emitter |
| `js/layers.js` | pooled ground grids (decals + indicators), shells, ribbons, glow meshes, lights |
| `js/shaders.js` | the 5 shader programs (particles, ground, shell, ribbon, glow mesh) |
| `js/textures.js` | loads `textures/manifest.json`, packs all particle sprites + flipbooks into one 2048² atlas |
| `js/schema.js` | the data rules (`validateVisuals`), three-free so Node tests use it |
| `js/lab.js`, `index.html`, `lab.css` | the Spell Lab review page |
| `textures/` | 43 white-on-black webp textures (all from Codex paintings) + `manifest.json` |
| `data/oathwild-spells.json` | Oathwild spell names for the Lab's picker (written by `tools/map-spells.mjs`) |
| `shots/` | phase strips per visual (`<id>.png`), best frames (`best/`), `contact.png` |
| `tools/` | `codex-sheets.mjs` + `sheets.json` (Codex paints), `cut-sheets.py`, `procedural.py`, `map-spells.mjs`, `shots.mjs` + `sheet.py` |
| `tests/spellkit-data.test.js` | data + texture checks (`npm run test:unit`) |
| `../tests/spellkit.spec.js` | browser checks: storm, budget, no shader compiles, dispose, phone layout |

The game's data: `prototypes/oathwild/data/spell-visuals.json`.

## API

```js
import { createSpellKit } from '../../avatar-3d/spellkit/js/spellkit.js';
const kit = await createSpellKit({ THREE, scene, camera, renderer,
  visuals: data /* or a URL */, heightAt: (x, z) => groundY, quality: 'high' /* | 'low' */, onShake });
kit.warm();                                   // compile all its materials now (after the game's lights exist)
// every frame
kit.update(dt); camera.position.add(kit.shakeOffset) /* optional, undo after render */;
```

| Call | Does |
|---|---|
| `kit.windup(caster, visual, { hands: [boneL, boneR] })` → handle | hands light up; loops until `kit.release(handle)` or `handle.stop()` |
| `kit.release(handle)` | ends the wind-up with the release flash at the hands |
| `kit.indicator(shape, { at, dir, radius, length, width, angle, kind, valid, color })` → `{ set(o), stop() }` | targeting: `circle`, `cone`, `line` — drapes over `heightAt`, painted rune rim that runs round, a sweep pulse; `kind`: valid / invalid / friendly / hostile / neutral |
| `kit.missile(from, to, visual, { speed, arc, delay })` → Promise(point) | body mesh + ribbon trail + emitters; `to` may be an Object3D (followed, aimed at the chest) or `{ dir, range }` |
| `kit.impact(at, visual, { scale, radius, dir, target })` | one-shot burst |
| `kit.ground(at, visual, { radius, seconds, dir, length })` → `{ stop() }` | lingering ground effect; `dir` + `length` for line spells (walls) |
| `kit.aura(target, visual, { seconds })` → `{ stop() }` | looping body effect (buffs / debuffs) |
| `kit.beam(from, [points], visual, { seconds, hop })` → `{ stop() }` | jagged arcs hop by hop (chain lightning) or a held beam |
| `kit.trail(weapon, visual, { base, tip, seconds })` | weapon sweep between two points in the weapon's frame |
| `kit.cast(visual, { caster, hands, target, at, dir, chain, weapon, tip, onPhase })` | a whole cast, phase by phase (the Lab and quick use) |
| `kit.visualFor(spellId, { kind, element })` | the spells map, then `fallback['<kind>:<element>']`, then `fallback[kind]` |
| `kit.update(dt)`, `kit.warm()`, `kit.stats()`, `kit.clear()`, `kit.dispose()`, `kit.wait(s)` | `stats()`: particles, glow/smoke split, budget, effects, draws, lights lit, births refused, objects borrowed |

`visual` everywhere = a visual id, a spell id, or `{ visual, school, scale }`. Slow motion = pass a smaller `dt`
(the kit's own clock drives cast sequences, so they slow down too).

## Data: a spell visual

```json
"fire_bolt": {
  "label": "Fire bolt", "kind": "missile", "school": "fire", "windupTime": 0.9,
  "windup":  [ layers… ],  "release": [ … ],
  "travel":  { "speed": 17, "arc": 0.04, "count": 1, "every": 0.12, "from": "hand|sky", "layers": [ … ] },
  "impact":  [ … ],
  "linger":  { "seconds": 8, "radius": 4.5, "length": 8, "layers": [ … ] },
  "aura":    [ … ],  "beam": { "seconds": 0.6, "layers": [ … ] },  "sweep": [ … ]
}
```

`kind`: missile, ground, line, nova, beam, cone, melee, self, shift, summon, aura (decides what `cast()` plays).
`school` picks the palette (spellfx elements + blood, fel, dawn, moon, haste) and fills `{school}` in texture names
(`rune_{school}`). `ref: "<other visual>"` borrows another visual. In the game file, `spells` maps each spell id to
a visual (`"firebolt": "fire_bolt"` or `{ "visual", "school", "scale" }`) and `fallback` covers spells added later.

Colours: `hot`, `mid`, `deep`, `smoke` (from the school), `white`, `black` or `#rrggbb`. Every texture is
white-on-black; a layer's `color` is its bright parts, `edge` its dim parts (painted fire: white-yellow core, red edge).

### Layer types (common fields: `type`, `at`, `offset`, `delay`, `life`, `fadeIn`, `fadeOut`, `opacity`, `quality`)

`at` (anchor): `point` (the phase's point), `ground`, `hands` (one copy per hand), `hand_l`, `hand_r`, `caster`,
`chest`, `head`, `feet`, `body`, `target`, `missile`.

| type | fields |
|---|---|
| `emitter` | `tex` or `texs` (random pick), `blend` add/normal, `rate`/s, `burst`, `max` (this emitter's cap), `life [a,b]`, `size [a,b]`, `sizeCurve [start,mid,end]`, `color` (1–3 stops over life), `edge`, `alpha [3 stops]`, `shape` point/sphere/disc/ring/line/cylinder, `radius` (m) or `rad` (share of the effect radius), `height`, `dir` up/down/out/outUp/in/forward/back/random, `speed`, `spread`, `up`, `swirl` (rad/s round the anchor), `gravity`, `drag`, `spin`, `rot: 0` (upright), `stretch` (streak along travel), `fps` (flipbook; default plays over life), `follow` (moves with the anchor), `converge` (gathers into the anchor), `onGround`, `duration` |
| `flipbook` | one big flipbook particle: `tex` (fx_burst, fx_flame, fx_smoke), `size`, `life`, `count` |
| `decal` | projected on the terrain: `tex`, `size` (m) or `rad`, `spin`, `pulse [amount, hz]`, `grow [from, to, seconds]`, `blend` (normal = darkening scorch), `layer` (stack order), `follow` (re-drapes under a moving target) |
| `shell` | see-through wall: `shape` cylinder/cone/funnel/dome/sphere, `tex` (band), `radius`/`rad`, `height`, `grow`, `heightGrow`, `scroll [u,v]/s`, `repeat [u,v]`, `fade` (upward fade power), `spin`, `y`, `pulse` |
| `mesh` | glowing body: `kind` core/shard/spike/ring/pillar/arrow, `size`, `stretch`, `spin [x,y,z]`, `pulse`, `grow`, `align: false` (don't point along travel) |
| `ribbon` | trail behind its anchor: `width`, `seconds`, `step`, `tex` + `texMix`, `taper` |
| `arc` | lightning/beam between the beam's points: `width`, `jitter`, `every` (re-shape), `fork` |
| `sweep` | weapon trail between base and tip: `seconds`, `tex` |
| `light` | pooled point light: `intensity`, `range`, `flicker`, `y` |
| `shake` | `strength`, `seconds` (trauma-style; `kit.shakeOffset` + `onShake`) |

### Adding a spell visual

1. Copy the closest entry in `prototypes/oathwild/data/spell-visuals.json` (or add `{ "ref": "bolt_generic",
   "school": "fel" }` for a recolour). Keep each layer on one line.
2. Map spells to it in `HAND` in `tools/map-spells.mjs`, run `node avatar-3d/spellkit/tools/map-spells.mjs`.
3. Look at it in the Lab (slow motion 0.25×), then `node avatar-3d/spellkit/tools/shots.mjs <id>` for its strip.
4. `node --test avatar-3d/spellkit/tests/` (the data rules) — the kit also warns in the console on bad data.

New textures: add a sheet to `tools/sheets.json`, `node tools/codex-sheets.mjs <sheet>`, `python3 tools/cut-sheets.py`.
Without Codex, `python3 tools/procedural.py` makes a fallback for every id (run it first; cut-sheets overwrites).

## Textures

All 43 come from Codex paintings (7 sheets of 6 items, 1536×1024, white on black — `ref/<sheet>/painted.png`):
rune circles for fire, frost, holy, nature, arcane, shadow, lightning, poison + a summoning circle; shockwave ring,
targeting reticle, starburst; 6 flame licks; 4 smoke puffs, poison cloud, dust; scorch, frost patch, ground cracks,
poison splat, shadow stain, holy glow; spark streak, star mote, soft dot, leaf, ice shard, lightning fork; 4 wall
bands (rising light, flame wall, rune row, mist). The flame, smoke and burst **flipbooks** are animated from those
paintings (warped frame by frame) by `cut-sheets.py`. `procedural.py` keeps a drawn fallback for every id in case a sheet is ever missing.

## Performance rules

- **Two particle draws for everything**: every sprite and flipbook frame is in one atlas; glowing and smoky
  particles are two instanced meshes. CPU moves the particles (a few thousand is cheap) and writes one buffer a frame.
- **Budget**: 6,000 particles (phone quality 3,000); each emitter has its own `max`; emitters slow down above 60% of
  the budget and births are refused at the cap (counted in `stats().refused`).
- **Pools, made at load**: ground grids 64, walls per shape (cylinder 20…), ribbons 56, glow meshes 10 per shape,
  lights 6 (phone: none). When a pool runs dry the oldest item is taken over (`stats().stolen`) — never a new object.
- **No shader rebuilds mid-game** (lessons rule 29): lights are always in the scene and always visible — only their
  intensity moves; nothing is created or disposed while playing; every pooled material is an instance of one of 5
  programs; `warm()` compiles them all at load. Create the kit before warming the game's own materials (its 6 lights
  change the light count once).
- **Quality** is chosen at creation (`quality: 'low'` halves particles, drops lights); switching = a new kit.
- Measured (Playwright, software renderer, `avatar-3d/tests/spellkit.spec.js`): 10 casters × a mixed storm of 15
  visuals for 10 s → peak 1,529 particles of 6,000, 92 spell draw calls, 61 effects at once, **0 shader programs
  compiled after warm()**, 0 pooled objects taken over, nothing left after; phone quality peak 701 of 3,000;
  three create/storm/dispose rounds leave the renderer's geometry and texture counts unchanged.

## Lessons

- A name clash between a pool (`kit.ground`) and a method (`kit.ground()`) only showed in the first linger phase —
  give pools plural names.
- Waiting for a phase a visual doesn't have burned 15 s of kit time in the shots tool: filter steps by the phases the
  data actually has.
- A procedural burst read as a flat white disc (a "blob"); animating the Codex starburst + shock ring reads as a burst.
  Paint first, animate the painting.
- Number formats change when a tool rewrites JSON (`1.0` → `1`): edit data through the parsed object, not text.
- Pools sized evenly ran dry on the busy shape (cylinder walls) while others sat idle — size each pool by use.
- A 6-second scorch mark is not a leak: wait for the longest layer before asserting "everything ended".
