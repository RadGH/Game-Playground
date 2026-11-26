# Case study: why Thousandvale's Paladin looks good, and why Oathwild's spells look weak

Written 2026-11-26 for the owner's spell-graphics complaint ("Frost bolt is one bullet I can hardly see", "Sunlance
and Cleave don't even do an attack animation", "TRIPLE the amount of graphics used EVERYWHERE for ALL spells and
attacks"). Research only, no code was changed. TV = `prototypes/thousandvale/js/client/`, OW = `prototypes/oathwild/js/client/`,
SK = `avatar-3d/spellkit/js/`, SFX = `avatar-3d/js/spellfx.js`.

**The short version:** Thousandvale doesn't win on fancier particles. It wins because **five separate systems draw
every cast at once**, all of them **sized to the real area the spell hits**, and the hero **always swings**. Oathwild
draws **one** Spell Kit phase per event (usually only the impact), at a **fixed small size**. On the owner's iPhone
that phase is then **halved, loses its light, and never shakes the camera**.

---

## 1. What each Thousandvale Paladin ability shows, phase by phase

These five systems all get every `cast`/`hit`/`fx` event (TV `main.js:935`):

| System | What it adds | Where |
|---|---|---|
| Element effects (SpellFx) | rune circle at the caster, columns of light, rings, decals, motes, feathers, one light per effect | TV `spells.js:186-229`, SFX `:962`, `:1045-1054`, `:1130-1198`, `:1368-1387`, `:1637-1665` |
| Class signature (sig-fx) | the Paladin's own Codex-drawn shapes (winged hammer, sun cross, oath circle) in gold `#f5c84a` / cream `#fff9d8` **plus a cyan accent `#9de9ff`**: thrown heads, arcs, bursts, ground sigils, a "falling" bloom at the caster | TV `sig-looks.js:38`, `sig-fx.js`; palette `icons/data/game/fx-motifs.js:17`, shapes `:74-81` |
| Hit feedback | 7 sparks (12 on a crit), damage number, camera shake 0.28 (crit 0.55, 0.35 when you're hit), a 55/90 ms **hit-stop** freeze on your own hits | TV `fx.js:44-52`, `:78-93`; `main.js:950-961` |
| Body reactions | the caster **swings their weapon the moment you press the key** (doesn't wait for the server); the target is pushed back 0.28 m, puffs up 12% for a moment, players play a hit clip | TV `main.js:1110`, `actors.js:756-768`, `:799-806`, `:659-667` |
| Revives | per-class revive look (Paladin = "aegis": a light thread to the body, a gold dome that lowers and snaps shut, a ring) | TV `revive-fx.js:13`, `:34` |

Lights: a pool of fixed point lights (8, **4 even on low quality**, TV `main.js:141`); every spell effect lends up to
3 of them a glow in its colour (TV `spells.js:397`, SFX `:2134`).

### Sanctified Blade (melee, holy, 80° arc, 3.2 m)
1. **Cast:** weapon swing clip at key press (TV `main.js:1110`).
2. **Swing arc:** sig-fx throws **9 big sprites** along a 1.9-radian arc 1.6 m out, staggered 14 ms apart, spinning (TV `sig-fx.js:236-242`).
3. **Area along the arc:** **5 holy impacts** across the swing (7 for a heavy one), 25 ms apart (TV `spells.js:154-158`, `:171`). Each holy impact is: white flash 1.3 m, **a column of light 2.4 m+ tall**, rune decal 1.3 m spinning for 1 s, soft gold decal, 16 rising motes, 5 drifting feathers, a camera-facing ring and a ground ring that rises 1.4 m (SFX `:1045-1054`).
4. **Under all that:** an area layer at the real size: rune decal R×2.2, two rings rising off the rim, 40 motes/s from the rim (SFX `:1182-1186`).
5. **On each target:** another full holy impact (TV `spells.js:298-306`), a signature burst (~8 shards, a flash that grows to 1.6× and a **flat ring of 10 shards** skidding out at 4.2 m/s, TV `sig-fx.js:154-172`, `:270-277`), 7 sparks, shake + hit-stop, push-back + puff.

### Blessed Earth / Consecrate (around, 6.5 m, leaves a 6 s zone)
1. Swing clip. 2. **Ground sigil** under the caster: the oath-circle glyph laid flat **8.4 m wide** plus a second one 4.8 m wide turning the other way, 6 shapes circling the rim, motes rising at ~36/s, for 1.3 s (TV `sig-fx.js:177-187`, `:324-344`). 3. 120 ms later a signature burst 1.3× size (TV `sig-fx.js:227`). 4. **12 holy impacts around a 6.5 m ring**: **12 columns of light** at once (TV `spells.js:144-148`, `:166`). 5. The zone: a 6 s swirling holy ground effect (TV `spells.js:285-289`, SFX vortex). 6. Per target: impact + burst + sparks + shake.

### Martyr's Vow (self, barrier for allies)
Swing clip; rune circle at the feet (decal 1.0 m + soft decal 1.4 m + a ring closing in + ~20 motes/s, SFX `:1368-1387`); a per-skill bloom (ring of bursts / spiral / rise, TV `spells.js:203-209`); a **"falling" bloom: 8-16 shapes falling from 3.6 m** above the caster (TV `sig-fx.js:206`); a ground sigil; a barrier aura on each ally.

### Mercy's Touch (self heal)
Swing clip; rune circle (600 ms) + a holy impact at the chest (TV `spells.js:200`); falling bloom + sigil; on every heal a small holy impact on the healed body (TV `spells.js:348`).

### Oathbound Rise (revive)
Heal-style cast as above + the aegis revive (thread, lowering dome, dome snaps + ring) + the body's own stand-up clip.

### Daybreak Descent (leap to an ally, 6 m slam)
Swing clip; **5 footfall bursts** 1.4 m apart along the path, 45 ms apart (TV `spells.js:218-220`); **7 afterimages + 7 flat shards** along the path (TV `sig-fx.js:243-249`); 260 ms later the landing area (a 12-point holy ring) (TV `spells.js:225`); the 8 m zone.

**Sounds:** Thousandvale plays no combat sounds. Oathwild is already ahead here; keep its sounds.

---

## 2. Counted layers per cast (one target, desktop)

"Pieces" = separate things drawn: particles + meshes (rings, columns, shells) + decals; lights listed apart.
Thousandvale's counts are what gets spawned (its live caps are 260 effect particles, 120 on low, plus 1,600 signature sprites).

| Ability | Thousandvale | Oathwild today, desktop | Oathwild today, iPhone ("low") | Ratio TV : OW phone |
|---|---|---|---|---|
| **Sanctified Blade** (same spell in both games) | ~230 pieces, 6 light columns, ~13 rings, 9 arc sprites, up to 3 lights, swing + hit-stop | 32 (only `elemental_slash` impact on the target: 1 flipbook, 20 sparks, 8 flames, 1 rune, light, shake). Sweep never drawn, nothing at the caster | 16, no light, no shake | **~14×** |
| **Cleave** vs TV melee | (Sanctified Blade ~230) | 68: `whirl_slash` at the caster (1 decal, 1 shell, 24 sparks, 8 dust) + the same again on the target; **no light layer at all** | 36 | **~6×** |
| **Sunlance** (beam) vs a TV paladin swing | ~230 | ~44 **only with mouse aiming** (windup 24 + impact 20: 1 star, 18 motes, light). **The beam itself is never drawn** | **10** (no windup on touch, impact halved, no light) | **~23×** |
| **Frost Shard** (bolt) | (TV ice bolt: element body + streams + signature head 1.2 m with 2.1 m halo + 26 shards/s, ~50-piece ice impact) | ~90: mesh shard + 60 motes/s (max 40) + smoke + ribbon + light; impact 33. **Windup and release never play** | ~46, no light on the bolt or the impact | **~3×** pieces, but the bolt is one 0.77 m shard with no halo |
| **Consecrate** (same spell) | ~300 in the first second + 6 s zone | 43 at cast (`ring_of_dawn` impact at 0.7 scale) + its rich 8 s linger (OW's best-looking spell) | ~22 + linger halved, no light | ~5× at the moment of casting |

Counts from OW `data/spell-visuals.json` (`frost_bolt` :48, `ring_of_dawn` :295, `whirl_slash` :507, `beam_generic` :545,
`elemental_slash` :599, spell map :882-1007) and the code paths in §3.

---

## 3. Why Oathwild's spells look weak, cause by cause

1. **Only one phase gets drawn per event.** OW calls the kit's *impact* phase for almost everything (OW `screens/play.js:139`, `:161-162`; `render/fx.js:153-156`). The *windup*, *release*, *sweep* and *aura* phases sitting in the data are mostly dead data:
   - **Windup** plays only while you're aiming with a mouse (`play.js:209-227`). **Bolts are never aimed**, so Frost Shard's 4 windup emitters and light never play. On touch, line spells (Sunlance) and self-area spells (Cleave) skip aiming (`play.js:210-211`), so **on the iPhone they get no windup at all**.
   - **Release** plays only when an aimed windup ends (`render/fx.js:148`). Bolts never get it.
   - **Sweep** (the weapon trail in `melee_slash` / `elemental_slash`) — `kit.trail()` is never called anywhere in OW.
   - **Aura** — only `aura_warded` is ever used (`caster-fx.js:99`); the other 6 aura visuals never play.
2. **Sunlance has no beam.** The rules send no beam event (`js/rules/combat.js:425-427`, only `cast` + `hit`), and the `cast` handler draws nothing for kind `line` (`play.js:158-164`). The beam only exists for wands (`caster-fx.js:34-35`). All you see is a 1.2 m star on each target.
3. **Melee-shaped spells play the spell clip, not a swing.** Every `cast` event plays `act('cast')` (`play.js:159`), which is `Spell_Simple_Shoot`, a one-hand push (`avatar-3d/tabard/js/tabard.js:93`). Cleave, Sanctified Blade, Whirlwind, Power Strike… all push a hand forward instead of swinging the sword. It also waits for the server's reply (one round trip), where Thousandvale swings on the key press.
4. **Wrong size.** A self/around spell's impact is drawn with a hard-coded radius of 1.6 m (`play.js:162`) and every per-target hit with radius 1 (`play.js:139`). Cleave hits 4.5 m around you but draws a 1.6 m ring. Thousandvale spreads 5-12 impacts across the true arc or ring.
5. **No multi-point spread.** Thousandvale's area = N impacts placed over the shape (`spells.js:144-183`). Oathwild draws one burst at one point.
6. **The iPhone gets half.** `autoQuality()` picks `low` on every phone that isn't a big iPad (`main.js:37-50`). The kit then:
   - halves every emitter's burst, rate and cap (`SK particles.js:153`, `:180-182`);
   - has **0 lights** (`SK spellkit.js:42`, `:668`), so no glow on the ground or the hero (Thousandvale keeps 4 lights on low);
   - draws **no bloom** (`render/post.js:3-5`: low = no extra passes).

   The README itself says the phone peak was 701 of a 3,000 budget, so halving buys almost nothing.
7. **Camera shake never happens.** The data has `shake` layers, but OW never adds `kit.shakeOffset` to the camera and passes no `onShake` (grep: no use in `js/client`). The **Settings "Camera shake" toggle (`ui/win-settings.js:33`) controls nothing.** OW also has no hit-stop and no push-back on the target.
8. **Colours get washed out.** Kit particles never go brighter than 1.0 and pass through ACES tone mapping (`SK shaders.js:55-60`). On a bright daytime map that turns pale yellow/white on pale ground. The bloom threshold is 1.15 (`post.js:30`), so **no spell ever blooms** even on high quality. Thousandvale's signature shader multiplies colour by 1.8 (TV `sig-fx.js:78`) and adds a contrasting accent colour (gold + cyan). OW's holy and ice palettes are one colour family each. Cleave is `physical` school: white sparks and brown dust, the least visible palette there is.
9. **Short and small.** Typical OW impact life is 0.25-0.5 s with 0.04-0.1 m sparks. Thousandvale's signature sprites are 0.4-0.8 m × 1.55 (TV `sig-fx.js:27`), its holy columns last 0.7 s, decals 1-1.2 s and feathers 1.5 s.
10. **Bolt problems.** The client draws each server bolt as a kit missile aimed along a fixed 30 m path from the body's centre at +1.3 m, not from the hand (`render/fx.js:115-122`). When the server removes the bolt, the missile is **not stopped**, so it flies on through the target (`render/fx.js:126`). A bolt that misses gets no impact.

---

## 4. The recipe: the minimum every Oathwild ability should draw

Numbers are starting points taken from Thousandvale, already ×3 where the owner asked. "R" = the spell's real radius/reach
from its rules row. **Phones get the same counts** (drop the `q = 0.5` halving; give `low` 2 lights).

| Phase | Minimum | Copy from |
|---|---|---|
| **0. Body** | play a clip **on the key press** (client-side), again when the server confirms: weapon-shaped spells (`melee`, `around` with a weapon, `dash`) → `Sword_Attack`; bolts/beams → `Spell_Simple_Shoot`; ground/self → `Spell_Simple_Enter` then `Spell_Simple_Exit`; channels → `Spell_Simple_Idle_Loop` | TV `main.js:1110`, `actors.js:756-768` |
| **1. Windup** (0.25 s even for instant spells) | at both hands: 2 emitters (≥ 30 motes gathering in a 0.5 m ball, a soft glow 0.45 m), one light 5 / 3 m; on the ground a rune decal 1.4 m spinning + a ring closing from 0.6 → 0.12 m | SFX `cast()` `:1368-1387`; OW `frost_bolt.windup` already has the right layers — just play it for every kind |
| **2. Release** | white flash 1.3 m + coloured flash 1.6 m (0.15-0.25 s), 24-48 motes outward, a camera-facing ring 0.75 m; the Paladin-style "bloom": 12-24 big shapes (0.5 m) falling/rising/spiralling round the caster | SFX impact flash pattern `:1046`; TV `sig-fx.js:196-211` |
| **3. Travel** | body ≥ 1 m across with a **halo 1.7× its size**, trail 60-90 sprites/s living 0.5 s, ribbon ≥ 0.4 m wide, a moving light; start at the hand; stop the missile when the server's bolt ends. **Beams:** draw `kit.beam(hand, [end])` for 0.4-0.7 s for every `line` spell | TV `sig-fx.js:298-322`; OW `caster-fx.js:35` for the beam call |
| **4. Impact** | spread over the real shape: **5-7 points along a melee arc, 12 round a ring, 6 along a line**, 25 ms apart. Each point: flash 1.3 m, 16-30 motes, a ring; for holy a **column of light 2.4-6 m**. Plus one area layer at R: rune decal R×2.2 for 1.2 s, 2 rings rising off the rim, rim motes 40-120/s. Plus a flat ring of 10-30 shards skidding out at 4 m/s | TV `spells.js:144-183` (the point layouts), SFX `:1130-1198`, TV `sig-fx.js:154-172` |
| **5. Linger** | ≥ 1.3 s on the ground: the class/school glyph flat at **2.1×R** + a second at 1.2×R turning the other way, 6 shapes circling the rim, 20-50 motes/s rising | TV `sig-fx.js:177-187`, `:324-344`; OW `ring_of_dawn.linger` is a good model already |
| **6. Target reaction** | hit clip, push 0.28 m away from the caster (eases out in ~0.1 s), puff to 112% size, 7-12 sparks + a 1 m element burst on the chest | TV `actors.js:799-806`, `:659-667`; `fx.js:44-52` |
| **7. Shake + hit-stop** | your hits 0.28 (crit 0.55), you hit 0.35, big area spells 0.4; 55 ms hit-stop (90 crit) on your own hits; obey Settings → Camera shake | TV `fx.js:78-93`, `main.js:958-961`; wire `kit.shakeOffset` (SK README "every frame") |
| **8. Light & colour** | one light per effect (impact 14-30 intensity), 2 kept on phone; particles ×1.6-2 brighter in the kit's particle shader so they cross the bloom threshold; every school gets an **accent colour** that contrasts (holy gold + cyan, ice blue + white-violet, physical steel + warm orange) | TV `sig-fx.js:78`, `fx-motifs.js:17` |

**Sizes to hit:** nothing a player is meant to notice under 0.4 m; the main flash ≥ 1.2 m; area pieces at the spell's
**true** radius; total time on screen ≥ 1 s for a cooldown spell (impact + linger), 0.4 s for a basic swing.

**Porting route:** the Spell Kit can already do every layer above. The work is (a) call every phase the data
has (windup/release/travel/impact/sweep/linger) from `play.js` for every kind, (b) a "points" helper that repeats the
impact across arcs/rings/lines (port `ringPoints` / `arcPoints` / `fillPoints` from TV `spells.js:144-158`), (c) pass
real radii, (d) phone parity, shake, hit-stop, push-back, (e) triple the burst/rate/max numbers in
`data/spell-visuals.json` and add the accent colour. A second signature layer like TV's sig-fx (one instanced sprite
mesh, 1,600 sprites, one draw call) is worth porting as is: it's cheap and it's most of what makes the Paladin feel "his".

---

## 5. Tabard hero animations: what exists, what triggers it

The library `avatar-3d/tabard/models/anims.glb` has 43 clips. Names OW uses (`tabard.js:91-96`, `render/actors.js:112`):

| OW action | Clip | Triggered by (OW `screens/play.js`) |
|---|---|---|
| attack | `Sword_Attack` | weapon basic hits (`:138`), misses (`:157`), arrows without a spell (`:166`), a wand's `melee` style (`:150`) |
| cast | `Spell_Simple_Shoot` | **every** spell's `cast` event, whatever its shape (`:159`), and wand/staff attacks (`:150`) |
| channel | `Spell_Simple_Idle_Loop` | channelled beams (`render/actors.js:255`) |
| hit / block | `Hit_Chest` / `Sword_Idle` | being hit (`:136`) |
| dodge / death | `Roll` / `Death01` | `dodge` / `downed` |

**In the library but never used for combat:** `Spell_Simple_Enter`, `Spell_Simple_Exit` (a real wind-up and
follow-through), `Punch_Jab`, `Punch_Cross` (monk palms/fists), `Pistol_Shoot` (a point-and-fire for wands/bolts),
`Jump_Start` / `Jump_Land` (leaps such as Daybreak Descent, Tracker's Leap, Charge), `Hit_Head`.

**Missing from the library entirely:** a two-handed overhead chop, a spin (Whirlwind/Cleave), a bow draw-and-loose,
a shield bash, a ground slam, a kneeling prayer. These need new clips (or hand-keyed ones) to match Thousandvale's per-weapon swings.

**Spell kinds that trigger the wrong animation or none:**
- `cone` (melee-shaped: Sanctified Blade, Power Strike, Shield Bash…), and `self` with a weapon (Cleave, Whirlwind) → the **spell push**, never a swing.
- `line` (Sunlance, Shadow Lance, Charge, dashes) → the spell push and **no beam/dash drawn**; a dash moves the body with no leap clip.
- `bolt` → the spell push after a server round trip; no windup/release at the hands.
- Wand/staff attacks with style `pool` or `burst` → **no clip at all** (`:150`).
- `revived` / `respawned` → no getting-up clip (`render/actors.js:119` just clears the death pose).
- Buff auras landing (`aura` events), barriers, summons → no reaction on the receiving body.

---

## 6. Recipe status (2026-11-26, the "TRIPLE the graphics" round)

| Recipe phase | Status | Where |
|---|---|---|
| 0. Body on the key press | done — clip + procedural move per kind (swing, overhead, slam, spin, bash, roar, ground push, wand point-and-fire); predicted on the press (`predictCast`, `pressAttack`), the server's cast doesn't replay it; leaps and charges use actors.js leap()/lunge() (combat agent) | `render/moves.js`, `render/spell-look.js` `moveStyle`, `screens/play.js` |
| 1. Wind-up ≥ 0.25 s | done for every cast, touch too (0.22-0.3 s, then the release) — except leaps/charges (their take-off dust instead) | `spell-look.js` `windup()` |
| 2. Release | done — every visual has a release (flash, motes, camera-facing ring, a bloom of runes round the caster) | `tools/triple-visuals.mjs` `releaseFor` |
| 3. Travel | done — bolts start at the hand and ride the server's bolt (`kit.missile({ track })`), stop where it ends, fizzle on a miss; every line spell draws a beam/wave; ground spells with a delay fly in (sky or lob) on that delay; missile bodies ≥ ~1 m with a halo | `render/fx.js`, `spell-look.js` `draw()` |
| 4. Impact over the true shape | done — `kit.spread`: 5-7 arc points at the real reach, 12 ring points on the real radius, 6-10 line points to the real end, a filled disc for ground spells, + the `area` layer at R (rune 2.2 R, rising rings, rim motes, skidding shards, school mark) | `avatar-3d/spellkit/js/spellkit.js` `spread`/`shapePoints`/`swing` |
| 5. Linger | done — linger phases got a 2.1 R glyph + a counter-turning one + rising motes; impacts leave scorch / frost / cracks 5-9 s | data |
| 6. Target reaction | done — actors.js `flinch()` (push 0.28 m / heavy 0.45, puff 12-16%) on every hit; the element burst at the chest (55% size for area spells: the area is the show) | combat agent's actors.js + `spell-look.js` `hit()` |
| 7. Shake + hit-stop | done — wired to the camera (`view.shakeOffset`), obeys Settings → Camera shake (`kit.shakeOn`); hit-stop 55 ms / 90 crit / 70 for a burst on your own big hits | `view.js`, `spell-look.js` |
| 8. Light & colour | done — phones keep 2 pooled lights; particle/glow cores ×1.8 at the centre (cross the bloom cut); `accent` colour per school used by sparks, rims and shards | `spellkit.js` `QUALITY`/`ACCENT`, `shaders.js` |
| Phones | done — no halving; budget 6,000 (desktop 9,000) as the global cap with the pressure slow-down | `particles.js` |
| Fireball (owner ruling) | done — a straight projectile: 0.55 m spinning core + flame shell + halo, falling embers, smoke; the 'burst' event (or the bolt's end) draws the blast at `explode.radius` | `fireball` visual, `spell-look.js` `burst()`, `fx.js` `settleEnds` |
| Wands | done — every style gets a muzzle at the hand and impacts over its shape (cone arc, beam line, nova/burst ring, lob/pool disc), chain/fork crackle, fan's three-way flash, sceptre crescent | `render/caster-fx.js` |
| Not done | a second "signature" instanced-sprite layer like TV's sig-fx (per-class Codex shapes); new hand-keyed clips (two-handed overhead, bow draw, kneel) — procedural moves stand in | — |

### Measured pieces per cast (particles spawned + pooled objects, one target, the game's own code path on the Spell Lab kit)
4 s window per cast; "before" = the old play.js / fx.js calls replayed on the same kit, "after" = render/spell-look.js +
fx.js driven by the same events (scratch harness, Spell Lab page, swiftshader). Lights counted apart.

| Cast | Before desktop | Before phone | After desktop | After phone | x (phone) |
|---|---|---|---|---|---|
| Cleave (4.2 m, 3.6 rad) | 68 | 36 | 632 | 632 | 17x |
| Sunlance (22 m line) | 41 mouse / 19 touch | 20 / 10 | 597 | 597 | 30-60x |
| Frost bolt (wand basic; old Frost Shard spell) | 150 | 77 | 254 | 254 | 3.3x |
| Fire: Firebolt before -> Fireball after (bolt + 4 m burst) | 361 | 182 | 1,684 | 1,683 | 9x |
| Meteor (8 m, ground impact) | 246 | 128 | 1,760 | 1,760 | 14x |
| Ground Slam (7 m nova) | — | — | 1,262 | 1,262 | new |
| Ice Spikes (15 m line) | — | — | 586 | 586 | new |

Storm (avatar-3d/tests/spellkit.spec.js, 10 casters x 10 s of mixed visuals): before peak 1,429 particles / 71 draws
(phone 502 / 58); after peak 6,084 of 9,000 / 182 draws / 156 effects, kit update ~1.0 ms CPU a frame (phone quality
4,982 of 6,000, 163 draws, 136 births refused at the cap, 0.7 ms) — no shader programs compiled mid-storm, nothing left
after. The software renderer can't time a GPU: **real-phone frame time is not measured yet** (the draw count and
additive overdraw of 10 simultaneous casters are the risk; one caster is ~20-40 draws).
