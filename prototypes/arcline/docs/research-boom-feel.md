# Why Kindlewild's meteor feels good and Stoneward's doesn't — and what Arcline should do

Research for Arcline's big effects (bullet impact, mortar shell, orbital strike). Written 2026-11-15.
Sources: the code in `prototypes/kindlewild` and `prototypes/stoneward`, headless runs of both sims
(12 creatures around the target, every tick counted), and frame captures of a meteor in each game
on the dev server (Kindlewild stepped tick by tick; Stoneward recorded live).

## 1. The short answer

Stoneward copied Kindlewild's blast code almost line for line, so the explosion numbers are nearly
the same (blast push, debris throw, ember fountain). It still feels worse because of everything
**around** the blast:

1. **The meteor does nothing to enemies in Stoneward.** It is the biggest reason. Kindlewild's blast
   sends a `blast` event that every creature listens to: damage, knockback, a hop into the air, set on
   fire. Stoneward's blast only changes the ground; nothing in `military.js` listens. In a test,
   12 wolves at the impact point all came out at full health (18/18 hp). In Kindlewild, 12 goblins on
   the same spot all died on the impact tick, each in a puff of its own pixels, with a death sound.
   **The satisfying part is the crowd going away.**
2. **Kindlewild's glow is real light; Stoneward's is stickers.** Kindlewild draws every hot particle
   into the lighting buffer, so sparks and embers light the ground and bloom (`render/frame.js:232-236`,
   bloom ×4.4 in `render/gl.js:129`). The falling meteor carries a moving light (30-cell radius) that
   lights the ground under it as it comes in. Stoneward draws its fireball, sparks and embers as flat,
   see-through squares **on top of** the finished lit picture (`render/gl.js:413`). Nothing glows,
   nothing lights the ground.
3. **The flash is the wrong kind.** Kindlewild's flash *adds* bright blue-white to every pixel and
   is gone in about 0.15 s: a sharp pop. Stoneward lays a beige see-through sheet over the screen
   for 0.6 s: it washes the picture out instead of lighting it up (visible in the captures as a foggy
   khaki frame).
4. **You can't see Stoneward's meteor coming.** It starts about 94 cells above and 44 cells right of
   the target. Zoomed in, that is off screen for almost the whole fall, so you see a ring and a shadow
   for ~2 s and the fireball only for the last few hundred milliseconds. Kindlewild's streak is on
   screen for the whole 2 s fall, shedding sparks and lighting the ground.
5. **Stoneward's particles stutter and pop.** Its sim runs in a background worker at 20 steps a
   second and the page draws the latest snapshot with no smoothing between steps
   (`sim/particles.js:192`, `features/powers.js:195-203, 262-269`), so debris moves in 20 jumps a second. Its
   particles don't fade at the end of their life; they vanish at full strength. Kindlewild runs at 30
   steps a second and fades each particle over the last 30% of its life (`render/frame.js:228`).
6. **More is not better.** Stoneward throws about 3× as many particles (≈800 on grass, ≈2,100 in a
   forest, because every tree drops its whole height as rubble), much of it grey dust that hangs in
   the air for up to 7 s as flat grey confetti over the sea. Kindlewild throws about 290, nearly all hot
   and bright, gone in 3 s, and leaves a lit crater, glowing rock and then a spreading fire.
7. **The sound lines up in Kindlewild and drifts in Stoneward.** Both use the same two Sound Lab
   sounds (`meteor.fall`, then `explosion.large`). The whistle recordings are 1.7 and 2.0 s long.
   Kindlewild's fall is exactly 2.0 s, so the whistle ends just as the boom hits. Stoneward's fall is
   2.5 s at 1× speed (a dead half-second before the boom), and at 2×/4×/8× the boom lands *in the
   middle of* the whistle. Kindlewild also adds a second layer straight after the boom: a death sound
   for the creatures that died, pans the boom to where it landed, and buzzes the phone for 60 ms.
   Stoneward plays the boom in the middle of the speakers over a music bed, with nothing after it.

Shake is about the same size in both (about one cell either way). Kindlewild's is front-loaded (it
drops fast), Stoneward's fades evenly over a second. Neither game pauses for a split second on
impact, and neither moves the camera.

## 2. Side by side

Kindlewild runs at **30 steps/s**, Stoneward at **20 steps/s**, so "per step" numbers differ in real
speed. KW = `prototypes/kindlewild/`, SW = `prototypes/stoneward/`.

| | Kindlewild meteor | Stoneward meteor (medium) |
|---|---|---|
| Cost / cooldown | 40 mana, 5 s cooldown (`KW data/spells.json:45-55`) | 40 / 100 / 220 faith by size, **no cooldown** (`SW data/buildings-faith.json:169-190`, `SW js/sim/powers.js:6`) |
| Blast radius / power / crater | 12 / 6 / 10 (+20% per spell level) (`KW data/spells.json:52-54`, `KW js/sim/spells.js:37-45`) | 12/20/32, power 6/9/14, crater 8/14/24 (small/medium/large) |
| Warning on the ground | Dashed ring at the blast radius, pulsing, for the whole fall (`KW js/ui/stage.js:157-167`) | Pulsing ring + a second ring closing in + a growing shadow (`SW js/features/powers.js:237-240`) |
| Fall time | 60 steps = **2.0 s**, any speed setting scales it (`KW js/sim/spells.js:38`) | 50 steps = **2.5 s** at 1×; 1.25 s at 2×, 0.3 s at 8× (`SW js/sim/powers.js:118`, data `fall: 50`) |
| Path | From 40 cells left / 30 up, 80 high, straight line, even speed (`KW spells.js:42, 345-353`) | From 44 right / 14 up, 80 high, speeding up as it falls (`SW powers.js:167-173`) |
| Visible during the fall? | Yes, whole fall at normal zoom; streak drawn into the world | Mostly **off screen** when zoomed in; fireball only near the end (captures) |
| Trail | 4 sparks/step lasting 0.6 s + 4 white-hot core dots + a **moving light**, radius 30 cells (`KW spells.js:349-351`) | 7 sparks/step lasting 1.1-1.5 s + grey dust puffs; fireball drawn as 14 stacked see-through discs, no light (`SW powers.js:177-180`, `features/powers.js:242-247`) |
| Particles at impact (open grass) | ≈290: 70 fast sparks, 60 embers, 120 death-puff pixels from the creatures (headless run) | ≈800: 250 sparks, 120 embers, 24 burning chunks, 132 dust (headless run) |
| Particles at impact (woods) | +60 debris pieces | +1,639 debris pieces (tall trees drop as rubble) |
| Sparks | speed up to 2.1 cells/step (63 cells/s), last 0.4-0.8 s, no gravity (`KW js/sim/blast.js:84`) | speed up to 1.5 cells/step (30 cells/s), last ~0.8 s (`SW js/sim/blast.js:122`) |
| Embers | 36 + 24, speed 1.2, up 1.6, gravity 0.04, ~3 s; can light what they land on (`KW spells.js:301`, `blast.js:85`) | 120 + 40, same shape, ~4.5 s (`SW powers.js:194`) |
| Debris | breaks cells, throws 35% of them on arcs at 0.25-1.5 cells/step, gravity 0.06; **lands as a real cell**, burning pieces start fires (`KW blast.js:53-58`, `particles.js:99-105`) | same idea at 40%, lands as rubble that **fades after ~3 min** (`SW sim/particles.js:107-121`) |
| Particle drawing | One pixel in the world image, **adds to the light and bloom**, fades over the last 30% of life, shadow when high (`KW render/frame.js:219-237`) | Flat squares over the lit picture (no glow, no light on the ground), full strength until they vanish, 20 jumps a second (`SW features/powers.js:195-203, 262-269`) |
| Flash | Adds 0.7 × blue-white to the whole screen, ×0.8 per step (gone in ~0.15-0.3 s) (`KW spells.js:302`, `sim/weather.js:65`, `render/gl.js:130`) + a ground light of radius 42 cells for 0.8 s (`blast.js:82`) | Beige see-through sheet, 50% strength fading evenly over 0.6 s; a flat disc at the spot for 0.5 s (`SW features/powers.js:310-312`, `sim/powers.js:199-201`) |
| Shockwave ring | Ring growing to 1.7 × radius in 14 steps (0.47 s) (`KW blast.js:81`, `stage.js:179-189`) | None for the meteor |
| Screen shake | Set to 16 → about ±1 cell (±3-8 px), random each frame, ×0.86 a step (half gone every 0.15 s) (`KW spells.js:303`, `weather.js:64`, `stage.js:212-220`) | Medium: 1.0 s, about ±0.7 cell at close zoom, fades evenly; off when zoomed far out or off screen (`SW features/powers.js:63, 257-260`) |
| Pause on impact / camera | None / none | None / none |
| Crater and ground | Height dug by crater × closeness², rock floor in the middle, scorched ring, a core of lava and crust, then a spreading fire (459 burning cells 13 s later in a meadow-and-wood test) | Similar dig, scorch, a lava pool (30% of radius) and core; walls/houses lose hit points |
| Damage to enemies | 6 × 26 = **156 at the centre**, falling off in a straight line to zero at 1.2 × radius (`KW js/sim/creatures.js:236-249`) | **None.** The blast is never passed to units (`SW sim/blast.js:126`; only lightning and frost call `military.strike`) |
| Knockback | Up to 3 cells/step slide, ×0.8 a step (up to ~15 cells); hop up to 3.6, fall damage on landing; big beasts 1/3, bosses 1/6 (`KW creatures.js:245-247, 715-728`) | None |
| Set on fire | 50% chance if close (`KW creatures.js:248`) | No |
| Death | Pops into up to 10 of its own pixels on little arcs, leaves bones or ash (`KW creatures.js:191-200`) | — |
| Typical haul | 12 of 12 goblins/skeletons dead in the test; a troll (160 hp) survives, flung 4-15 cells | 0 of 12 wolves hurt |
| Cast sound | `meteor.fall` (1.7 / 2.0 s whistle) at cast, panned (`KW js/ui/audio.js:36, 56`) | `meteor.fall` at cast, centred (`SW sim/powers.js:120`, `features/sound.js:59`) |
| Impact sound | `explosion.large` (2.6-3.0 s with a tail) on the impact step, **panned** to the spot (`KW audio.js:49-51`) | `explosion.large` on the impact step, centred, passed through the worker message (up to 50 ms late) (`SW powers.js:202`) |
| After-sounds | One death sound per kind of creature that died (`death.beast` etc., at most every 200 ms) + phone buzz 60 ms (`KW audio.js:57-66`, `ui/play.js:167`) | Nothing (nothing dies); a music bed keeps playing |
| Whistle vs boom timing | Whistle ends 0-0.3 s before the boom | Dead gap of 0.5-0.8 s at 1×; boom overlaps the whistle at 2× and up |
| Loudness | Every impact in the Sound Lab is set to the same level (−16 LUFS); neither game turns the big boom up with `gain` | same |

What the captures showed, in order: Kindlewild — a bright streak crossing the field lighting the
grass under it → one bright frame where the whole picture brightens → a white-hot core with a ring
racing out → a black, glowing crater ringed with orange embers → smoke and a fire creeping out.
Stoneward — a ring and a dark shadow for about 2 s with nothing in the sky → the fireball appears
very late → a khaki fog over the whole screen → a cloud of flat orange and grey squares floating over
the sea and trees → a brown scar. The wolf markers are still there afterwards.

## 3. The recipe for Arcline

Arcline is a 2D isometric canvas game drawn over pre-made sprites and has **no fire** (PLAN). So the
Kindlewild "aftermath fire" is replaced by cooling molten glow, smoke and scorch marks that stay a
while. Numbers below are in **tiles** (one iso ground tile) and **seconds**. Treat them as starting
points to tune by eye.

### Rules that apply to all three

- **Move effects every drawn frame**, using the real time since the last frame, not the sim step.
  If the sim steps slower, blend between the last two positions. Nothing may jump.
- **Hot things use additive drawing** (`ctx.globalCompositeOperation = 'lighter'`) with a pre-made
  soft round glow sprite: a small white-hot core plus a big faint halo. Smoke and dust use normal
  drawing and are dark or neutral, never beige over everything.
- **A light layer.** On impact, draw a big additive glow on the ground (and on the sprites near it)
  that fades quickly. This is the Canvas version of Kindlewild's light, and it is most of the "it lit
  up" feeling. A falling shell carries its own small ground light that grows as it gets close.
- **Every particle fades and shrinks at the end of its life** (fade over the last 30-40%). Colour runs
  white → yellow → orange → dark red → grey smoke.
- **Height is separate from ground position.** Each particle has ground x/y plus a height z. Draw it
  at y − z with a small shadow at y. Gravity pulls z down. When z hits 0, chunks **bounce once**
  (keep 30% of the up speed, 50% sideways), slide to a stop and **stay as a small dark rubble mark for
  15-30 s**, then fade. This "lands and settles" behaviour is what made Kindlewild's debris feel solid.
  Sparks have no gravity and slow down fast (×0.88 a frame at 60 fps); embers fall slowly.
- **Shake by "trauma".** Each hit adds trauma (0-1). The offset is `maxPx × trauma²` with smooth noise
  (not a fresh random number every frame). Trauma falls by about 1.8 per second. It is measured in
  **screen pixels**, so it is the same at every zoom, and it is scaled down by how far the blast is
  from the middle of the screen. Add a "Screen shake" setting.
- **Sound starts on the exact frame of the visual hit**, panned by screen x, quieter with distance.
  Each sound name has its own repeat limit, but different layers may play together.
- **Enemies must react to every blast:** damage with falloff, knockback, and for kills a flung body
  (the death frame thrown on an arc, spinning, landing with a puff) plus a burst of 8-12 pixels in the
  creature's own colours. This matters more than any particle count.
- **Keep effects under a budget** (say 1,500 live particles on desktop, 600 on phone). When over, skip
  smoke first, then sparks, and never the chunks and death bursts.

### Bullet impact (pulse gun, and the base for the other guns)

| Part | Start from |
|---|---|
| Shot | Bright core 2-3 px with a 6-10 px streak behind it (line from its last two positions), additive. Speed 12-16 tiles/s, so you can follow it. |
| Muzzle | 1-frame glow at the barrel (6 px) and a small ground light. |
| Hit | 1-frame white glow (8-10 px). 6-10 sparks at 3-6 tiles/s, lasting 0.15-0.3 s, no gravity, fast slowdown. One small smoke puff 50% of the time. |
| Target | White flash on the sprite for 60 ms; nudge 2-4 px away from the shot. On a kill: the death burst + flung body (smaller fling, 0.5-1.5 tiles). |
| Shake | None (too frequent). |
| Sound | Fire: `tower.shot` (gain 0.5, pitch 1.1-1.3 for small guns). Hit: `melee.hit` or `spell.physical.impact` (gain 0.35). No more than 4 hit sounds per 100 ms across all turrets; a kill gets its `death.*` sound at most every 200 ms. |

Arc coil and rail lance reuse this: arcs as additive jagged lines with a one-frame bright flash
(`spell.lightning.impact`); the rail as a full-length beam that fades in 0.15 s, a small shake
(trauma 0.1) and `thunder` at low gain for the long ones.

### Mortar shell

| Part | Start from |
|---|---|
| Launch | Muzzle glow + 6-8 grey smoke puffs; sprite recoil 2 px. Sound: `explosion.small` at pitch 0.6-0.7, gain 0.4 (a dull thump), panned. |
| Flight | **1.2-1.6 s**, a real arc 3-4 tiles high at the top. Glowing shell (4 px core, 12 px halo) with 2 sparks a frame lasting 0.3 s; its shadow on the ground shrinks as it rises and grows as it falls. In the last 0.4 s, a faint red ring on the ground where it will land. |
| Impact (radius 1.5-2 tiles) | Frame 1: additive flash disc 2.5 tiles across + ground light 3 tiles that fades over 0.3 s. Shock ring growing to 2.2 tiles in 0.2 s. 30-40 sparks at 4-8 tiles/s, 0.25-0.5 s. **12-20 chunks** thrown up 3-5 tiles/s, gravity 12 tiles/s², bounce, settle, stay. **10-15 slow embers** at 1-2 tiles/s, gentle gravity, 1.2-1.8 s. 8-12 smoke puffs rising 0.3 tiles/s, 1.5-2.5 s. Scorch decal for 20 s. |
| Damage | Full inside 0.5 tile, falling in a straight line to 25% at the edge. Kills are flung 1-3 tiles; survivors pushed 0.5-1 tile and stunned 0.3 s. |
| Shake | Trauma 0.2-0.25 (about 3 px), only if the impact is on screen. |
| Sound | `explosion.small` on the impact frame (pitch 0.9-1.1, gain 0.8, panned). Then `fragment.crash.small` at +0.15-0.3 s (gain 0.35) for the chunks landing. At most 3 mortar booms per 150 ms; extra ones in that window only add shake. |

### Orbital strike

| Part | Start from |
|---|---|
| Aim | Circle of the blast radius (4-5 tiles) while aiming. After casting: a pulsing ring + a second ring closing in over the fall + a ground glow that grows as the shell gets close. |
| Fall | **2.2 s** (set it to fit the whistle; see Sound). Starts **from a fixed spot on screen** (about 70% of the screen height above the target, a little to one side), whatever the zoom, so it is always in view. Speeds up as it falls. Core 6 px white, halo 30 px orange, additive; trail of 6-8 particles a frame lasting 0.4-0.6 s fading white → orange → grey smoke; its own ground light widening from 1 to 4 tiles. |
| Impact frame | Optional pause of 60-80 ms (the sim stops, the flash keeps drawing). Full-screen **additive** white-blue flash at 0.8 for 2 frames, fading over 0.25 s. Ground light of 10 tiles fading over 0.8 s. Bright core sprite 3 tiles across. |
| Rings | Shock ring growing to 7 tiles in 0.35 s; a slower brown dust ring to 5 tiles in 1 s. |
| Particles | 120-200 sparks at 8-14 tiles/s, 0.3-0.6 s. **40-60 chunks** thrown up 6-10 tiles/s, gravity 14, bounce, settle, stay 20-30 s; glowing ones cool from orange to dark over 3-4 s. **40-60 slow embers** at 1-3 tiles/s, thrown up 4-7, gentle gravity 4, lasting 2-3 s: these are the "slow-moving particles" Radley liked. 25-40 big smoke puffs rising and spreading over 3-5 s. |
| Ground | Crater decal: dark ring with a molten orange middle that glows on the light layer and cools over 6-10 s (no fire). Sprites near the edge get a scorch tint for 30 s. Walls inside take damage. |
| Damage | 100% at the centre falling to 20% at the edge. Every ordinary creature inside 60% of the radius dies. Bodies flung 2-5 tiles on arcs, spinning, landing in a puff. Survivors pushed 1-3 tiles, thrown up a little, stunned 0.5 s. Big beasts take 1/3 of the push. |
| Shake | Trauma 0.8 (about 12-14 px at peak), mostly gone in 0.6 s, plus a slower 3-4 px roll for 1 s. |
| Sound | `meteor.fall` started so it **ends 0.1-0.2 s before impact** (the takes are 1.7 and 2.0 s: start it at fall time − take length − 0.15 s, or pick the 2.0 s take with a 2.2 s fall). In the last 0.3 s, turn the music and ambience down about 10 dB (the breath before the hit). On the impact frame: `explosion.large` (gain 1.3, pitch 0.85-0.95 for weight) **and** `quake.rumble` (gain 0.6) for the low end. Then `fragment.crash.large` at +0.25 s (gain 0.5), `stone.crumble` at +0.6 s (gain 0.35), and 2-3 death sounds over 0.4 s. Phone buzz 80 ms. Bring the music back up over 1.5 s. Not tied to game speed: at 2×/4× the fall stays 2.2 s of real time. |
| Pacing | Charges are rare and bought (PLAN), so each must pay off: creatures should flock into groups big enough that one strike takes out 10-30. |

## 4. What to avoid (Stoneward's mistakes)

1. **A blast that doesn't touch the enemies.** Every explosion must go through the same "who's in
   range" step that damages, pushes and flings creatures. Test it: drop one on 12 creatures and count
   the dead.
2. **Drawing glow as flat see-through squares on top of the finished picture.** Hot things are
   additive and light the ground around them.
3. **A beige see-through sheet as the flash.** It washes the picture out. Use a short additive
   brightening instead (2 frames up, 0.25 s down).
4. **A falling thing that starts off screen.** Start position should be a screen offset, not a world
   offset, so zoom can't hide it.
5. **Effect timing tied to game speed.** At 4× or 8×, the meteor and its sound fell apart. Big effects
   run in real time; only the damage timing follows the sim.
6. **Drawing from 20-a-second snapshots without blending.** Particles must move every frame.
7. **Particles that never fade.** They should fade and shrink, not vanish at full strength.
8. **Too many particles of the wrong kind.** 1,600 rubble pieces from a forest and grey dust hanging
   for 7 s look like clutter. A few hundred bright, short-lived particles plus a few dozen chunks that
   land and stay read better.
9. **The boom at the same level as every other hit.** The Sound Lab levels every impact to the same
   loudness, so the big one needs `gain` above 1 and a low rumble layer.
10. **A boom centred in the speakers with nothing after it.** Pan it, follow it with debris landing
    and death sounds, and duck the music just before it.
11. **Shake that ignores zoom and fades evenly.** Measure it in screen pixels and make it drop off
    fast at first.
12. **No cooldown and cheap casts.** Stoneward made the meteor spammable, which makes each one matter
    less. Arcline's charges being rare is right.
