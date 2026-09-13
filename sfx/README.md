# Sound Lab — `sfx/`

Sound effects for a game, with four interchangeable ways of making them and one loudness for
everything. Open `sfx/index.html` (served: `./serve.sh --bg`, then `http://<LAN-IP>:8400/sfx/`).

The shape is deliberately the same as `voice-lab/`: a catalog of things you can ask for, several
engines that can produce them, a licence badge and an honest pros/cons list on each, and a dropdown
to switch between them at runtime.

## Why this exists

Two problems, both from the same root.

1. **A game should ask for meaning, not for files.** `sfx.play('spell.fire.impact')` — not
   `play('assets/fx/fire_03.ogg')`. Once the game speaks in logical ids, the whole sound set can be
   swapped by changing one dropdown, and a missing sound is a data problem rather than a crash.
2. **Sounds from different places are wildly different volumes.** A recorded interface click arrives
   at −12 dBFS and a synthesized status effect at −43 dBFS. Mixed naively, half the game is
   deafening and the other half is inaudible. So every clip is measured when it is built and a fixed
   gain is baked in to put it on the target for its category.

## Quick start

```js
import { Sfx } from './sfx/js/sfx.js';

const sfx = await Sfx.create({ method: 'hybrid', volume: 0.8 });

sfx.play('melee.crit', { pan: 0.4 });        // pan follows the character's x position
sfx.play('spell.fire.impact');
sfx.play('ambience.cave');                   // a loop id starts a loop
sfx.ambience('ambience.town');               // ...and this cross-fades to a different bed
sfx.stopLoop('ambience.town');

sfx.setMethod('synth');                      // swap every sound in the game at once
sfx.setBusVolume('ui', 0.5);                 // three buses: sfx, ui, ambience
sfx.setMuted(true);
```

`Sfx.create()` fetches `data/catalog.json`. Nothing touches the speakers until the first `play()`,
because browsers want a user gesture before an AudioContext will start.

### API

| Call | What it does |
|---|---|
| `Sfx.create({ method, volume, catalog, base, context, muted })` | Build an instance; `catalog` lets a test pass one in instead of fetching |
| `play(id, { pan, pitch, gain, at, variant, loop })` | Play a sound. Returns `{ source, gain, done, levels, via, file, stop() }`, or `null` when muted/unknown |
| `cue(id, opts)` | Fire and forget — the same thing with no promise to handle |
| `setMethod(id)` / `method()` / `methods()` | Swap methods; `methods()` returns id, name, license, badge, pros, cons |
| `preload(ids, { variants })` | Build sounds ahead of time so the first play is not late |
| `load(id, variant)` | Build one take and return its buffer, gain and measured levels |
| `analyze(samples, sr)` / `normalize(samples, sr, opts)` | The loudness maths, re-exported from `js/loudness.js`. Both also take an `AudioBuffer` directly — `analyze(buffer)`, `normalize(buffer, -18)` |
| `levels(id, variant)` / `normalizationTable()` | Measured before/after levels, as rows |
| `setVolume` / `setBusVolume(bus, v)` / `setBusMuted` / `setMuted` | Mixing |
| `ambience(id)` / `stopLoop(id)` / `stopLoops()` / `loopingIds()` | Looping beds |
| `entry(id)` / `ids()` / `byCategory()` / `sourceOf(id)` / `targetFor(id)` / `busFor(id)` | Catalog queries |

## Methods

Every method implements the same three functions (`meta`, `has(entry)`, `render(entry, opts)`), so
adding a fifth is a new file in `js/methods/` plus a line in `METHODS`.

| id | What it is | Licence | Coverage |
|---|---|---|---|
| `synth` | Our own procedural Web Audio synthesis, driven by the layer recipes in the catalog | ours | all 118 ids |
| `library` | Recorded samples from three Kenney CC0 packs | **CC0 1.0** | 39 ids |
| `hybrid` | Samples where the pack has them, synth everywhere else — **the default** | CC0 + ours | all 118 ids |
| `retro` | Chiptune: square, triangle and noise channels, stepped envelopes, semitone notes | ours | all 118 ids |

**synth** builds each sound from a stack of layers: filtered noise bursts, oscillator sweeps,
2-operator FM, Karplus-Strong plucks, grain scatters, stacked chords, and LFO-modulated drones for
loops. A seed jitters pitch and timing per play, so twenty fireballs do not sound like the same file
twenty times. The recipes live in the catalog, not in the code, so retuning a sound is a data edit.

**library** uses `sfx/assets/kenney/` — see `sfx/assets/kenney/README.md` for the download commands,
the licence files and what the packs do and do not cover. CC0 means public domain: commercial use is
fine and credit is optional.

**retro** knows nothing about fire or frostbite. It picks a pattern from the sound's category and
tunes it with a hash of the id, which is a useful proof that the catalog really is an interface.

## The catalog

`data/catalog.json` — 118 ids in 10 categories. **It is generated**: edit
`tools/build-catalog.py` and run `python3 sfx/tools/build-catalog.py`.

```json
{
  "id": "spell.fire.impact",
  "category": "impact",
  "label": "Fire impact",
  "loop": false,
  "trim": 0,
  "synth":   { "dur": 0.72, "jitter": 0.06, "layers": [ { "type": "noise", … } ] },
  "library": { "files": ["kenney/impact/impactPunch_medium_000.ogg", …], "pitch": [0.94, 1.06] },
  "retro":   { "pattern": "hit", "wave": "noise", "dur": 0.22, "loop": false }
}
```

`library` is optional — no block means that method cannot make this sound, and `hybrid` falls back
to `synth`. `trim` is a manual nudge in dB for one sound that still sits wrong after normalization.

What is in there:

| Group | Ids |
|---|---|
| Spells | `spell.<element>.launch` / `.travel` (loop) / `.impact` for all 11 elements in `spellfx.js` |
| Statuses | `status.<type>.apply` and `.tick` for all 23 statuses in `spellfx.js` |
| Casting | `cast.start`, `heal`, `revive` |
| Melee | `melee.swing`, `.hit`, `.crit`, `.miss`, `.block` |
| Deaths | `death.humanoid`, `death.beast`, `death.construct` |
| Stings | `levelup`, `quest.complete`, `night.ambush` |
| Loot | `loot.<rarity>` for common/normal/uncommon/magic/rare/epic/legendary, `coin`, `equip` |
| World | `travel.step`, `camp.fire` (loop) |
| Interface | `ui.click`, `.hover`, `.tab`, `.open`, `.close`, `.error` |
| Ambience | `ambience.forest` / `cave` / `town` / `marsh` / `mountain` / `void` / `fire` / `wind`, all loops |

A node test reads `avatar-3d/js/spellfx.js` directly and fails if an element or status is added there
without a matching sound here.

## Normalization — the actual answer to "some were too quiet, some were way too loud"

Every clip goes through `js/loudness.js` once, when it is first built:

1. **Measure.** A K-weighted loudness estimate: the two real BS.1770 pre-filters (a +4 dB shelf at
   1682 Hz and a 38 Hz high-pass), then mean square over 400 ms blocks with the absolute (−70) and
   relative (−10 LU) gates. A 200 ms sound effect is shorter than one block, so short clips get a
   single ungated block instead. It is an estimate, not a certified meter — but it lines 118 sounds
   up by ear far better than plain RMS does, because it weights the frequencies people actually hear.
2. **Aim.** The target is the sound's category target plus its `trim`:

   | Category | Target | Bus |
   |---|---|---|
   | impacts | −16 LUFS | sfx |
   | melee, deaths | −17 | sfx |
   | stings | −18 | sfx |
   | spells, loot | −19 | sfx |
   | world | −21 | sfx |
   | statuses | −22 | sfx |
   | interface | −26 | ui |
   | ambience | −30 | ambience |

3. **Apply, then bend the peaks.** Gain is clamped to ±24 dB (boosting a near-silent clip 40 dB only
   amplifies its noise floor). Peaks above −7 dBFS are bent along a `tanh` curve that asymptotes at
   the −1 dBFS ceiling. Without that soft ceiling one 2 ms transient would drag a whole punchy sound
   8 dB quieter just to stay legal; with it, an impact can be as loud as it is meant to be. The
   limiter is allowed at most 12 dB of work — past that the gain is backed off instead, because
   squashing a clip 20 dB stops being limiting and starts being distortion.
4. **Re-measure and make up.** Limiting takes loudness off as well as peaks, so one pass usually
   lands short; two or three make-up passes close the gap.

The result is baked into the AudioBuffer, so playback is a plain buffer source at gain 1.

Measured on the real catalog, before → after (hybrid method):

```
ui.click          -12.4 → -26.0   (-13.6 dB)
levelup           -10.6 → -18.0    (-7.4 dB)
melee.crit        -21.1 → -16.2    (+6.8 dB)
spell.holy.impact -27.7 → -16.7   (+12.1 dB)
status.burn.apply -42.8 → -22.1   (+20.8 dB)
ambience.forest   -20.6 → -30.0    (-9.4 dB)
```

A 32 dB spread going in, everything on its target coming out.

**At play time** there is still a mixer: `source → panner → category bus (sfx / ui / ambience) →
master → limiter → speakers`. The master limiter is a `DynamicsCompressorNode` at −3 dBFS with a
20:1 ratio. Nothing should reach it on its own; it is there for the moment six spells land in the
same frame.

## The gallery

`index.html` gives you: the method dropdown with its licence badge and pros/cons, the catalog grouped
by category with a play button and a level meter per sound (the tick on the meter is the target),
"play all", a filter, a pan slider, master and per-bus volume sliders, an A/B compare that builds one
id through all four methods and reports what each measured, "measure all", the full before/after
loudness table, and a JSON export of the normalization table.

`window.sfxDemo` exposes `sfx`, `play`, `load`, `setMethod`, `table()` and `measure(ids, method)` for
tests and the console.

## Tying a game in

See `prototypes/emberveil/js/sfx-bridge.js` for a complete worked example. It hooks a running game
**without editing the game's stage at all** — it wraps the stage's methods at runtime:

```js
import { installSfx } from './sfx-bridge.js';
const sound = await installSfx({ stage, game });   // one line, after the stage exists
```

What that buys: swings, spell launches, impacts (including damage-over-time ticks, which go straight
to the effects layer), status applications and ticks, heals, revives, deaths picked by body type,
ambience that follows the backdrop, a campfire loop at camp, footsteps on travel, interface clicks
and hovers by delegated listener, and loot / gold / level-up / quest stings picked up from the text
the game writes into its narrative panel. Panning comes from each character's x position on the
stage. The bridge also fills in the "Sound effects" dropdown and the three volume sliders in the
game's Settings panel and remembers them in `localStorage`.

The pattern is reusable: wrap, do not modify. `dispose()` puts every original method back.

## Files

```
sfx/
  index.html  sfx.css            gallery
  js/sfx.js                      the Sfx class: catalog, methods, mixer, cache
  js/loudness.js                 analyze / normalize / softLimit / loopify (pure, node-testable)
  js/methods/synth.js            our procedural synthesizer
  js/methods/library.js          CC0 sample loader
  js/methods/hybrid.js           samples, then synth
  js/methods/retro.js            chiptune
  js/app.js                      gallery wiring, window.sfxDemo
  data/catalog.json              generated — do not hand-edit
  tools/build-catalog.py         the generator: recipes, sample mapping, category targets
  assets/kenney/{rpg,impact,interface}/   CC0 packs + licences (see assets/kenney/README.md)
  tests/sfx.test.js              node: catalog completeness, method coverage, loudness maths
  tests/sfx.spec.js              playwright: gallery, all four methods, levels, loops, Emberveil
```

## Tests

```bash
node --test sfx/tests/sfx.test.js     # or npm run test:unit
npx playwright test sfx
```

The browser tests assert that each method produces finite, non-silent audio and lands every clip
within 3 dB of what it aims for — which is the property the whole library exists to provide.

## Adding a sound

1. Add it to `tools/build-catalog.py` (a `synth` recipe, optionally a `library` mapping, a category).
2. `python3 sfx/tools/build-catalog.py`.
3. `node --test sfx/tests/sfx.test.js` — the tests check the recipe is renderable and any sample file
   really exists.
4. Play it in the gallery and check where it lands in the loudness table; nudge `trim` if it is
   measurably on target but still feels wrong.
