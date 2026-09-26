# Pixel RPG — pitch verdict

## Scores (1–10)

| Pitch | Fit to brief (rain/water/light/reflections) | Spell depth vs "start easy" | Unlock ladder | Monster/boss variety | Buildable by one agent (perf) | Originality | **Total /60** |
|---|---|---|---|---|---|---|---|
| **1. Lanternfall** | **10** — rain, flooding, coloured light and reflections *are* the premise | **8** — 3 strands, 2 charm slots; one strand at a time is a natural tutorial | **9** — grapple, sluices, oil economy, gravity, rain-stops: each rewrites play | **8** — dark water, drowned districts, things in the dark, lamp guardians | **7** — sluice chambers keep water local; darkness needs a light buffer anyway | **8** | **50** |
| 2. Runeweald | 5 — water only seasonal; green palette, little reason for coloured light | 7 — graft tree is readable; spells levelling with use is nice | 7 — seasons are drastic but each is a whole re-skin of every level | 7 — beasts, plants, fey | 5 — four states per level is 4x content | 6 | 37 |
| 3. Tidebound | 8 — water everywhere, storms | 7 — overload/heat limit is a strong risk-reward idea | 6 — diving bell + tides are good, ship boarding is a side game | 7 — sea monsters, drowned crews | **4** — large water volumes + rising tides is the expensive case for falling-sand | 6 | 38 |
| 4. Cinderspire | 3 — a volcano fights rain and reflections; red everywhere | 7 — heat-as-mana is elegant | 7 — lava→stone platforms, steam lifts, rising magma | 6 — narrow fire/stone bestiary | 7 — lava is cheap, viscous fluid | 6 | 36 |
| 5. Stormglass | 7 — lightning storm, conductive water, glass glints | 4 — node graph with nested triggers contradicts "start easy" | 8 — magnets, gears, powering machines | 6 — mostly constructs | 6 — circuits are cheap; the editor UI is the cost | **8** | 39 |

## Winner: LANTERNFALL

It is the only pitch where the brief's hardest visual asks (realistic rain, water, coloured light, reflections) are the story instead of decoration, and every spell element doubling as a light colour ties the spell builder to the rendering. The act ladder already fits "start easy, drastically change later", and the canal-city setting localises water into chambers the player drains and floods, which is the cheap way to do pixel water in a browser.

## Ideas to steal into Lanternfall

1. **Triggers as a late-game charm tier** (Stormglass): after Act 3, unlock "on hit / on death / on timer" charms that fire a second wick. That gives Stormglass-level combos without a node graph on day one.
2. **Overload** (Tidebound): a wick over its oil rating can still be cast but may burst in your hand. Risk-reward for experienced players, invisible to new ones.
3. **Spells level with use** (Runeweald): a wick that sees a lot of use gains a small bonus and a cosmetic brighter flame. It rewards having favourites.
4. **Frost freezes water into walkable ice; ember cools molten pixels into stone** (Runeweald + Cinderspire): terrain-building through spells, which makes "build things" part of the spell system.
5. **Conductive water** (Stormglass): spark in a flooded chamber shocks everything in it, you included. Pairs naturally with the Act 3 sluices.
6. **Powering machines with your own spells** (Stormglass): spark a dead lamp-lift, ember a boiler, gleam a light-sensitive door. Puzzles then reuse the spell builder.
7. **Steam lifts and pressure vents** (Cinderspire): ember on water makes steam that rises and carries the player. It's an emergent traversal tool.
8. **Rising-water timer sections** (Tidebound tides + Cinderspire magma): one set piece per act where the flood climbs behind you, instead of a global tide clock.
9. **Vines/ropes you grow** (Runeweald): a "tether" shape that leaves a climbable rope between two hit points, which is the builder's answer to swinging.

## Biggest risks and mitigations

1. **Darkness reads muddy and frustrates players.**
   Keep the darkness an Act 4 unlock, not the default. The base ambient light never drops below a readable floor. Enemies and hazards carry their own rim light or glowing eyes, and every telegraph and void zone is lit by definition. Test with screenshots at the darkest setting.
2. **Water and falling-sand performance in the browser.**
   Simulate only a window around the camera in fixed-size chunks and let off-screen chambers sleep. Run water on a coarser cell grid than sand, or as a height-field per chamber. Cap particles per frame, and do reflections as a screen-space flip in the shader, not a second render. Set a frame budget and a benchmark spec in milestone 1, before any content.
3. **Spell combinations explode (6 flames × 7 shapes × charm pairs) and balance breaks.**
   Make the data drive everything: each strand is a set of numbers in JSON, and one headless sim ranks every wick by damage per oil and flags anything over 1.5× the median. Gate charms by act so the pool grows slowly, and give Endless/Waves their own balance table.

## Recommendation

Build Lanternfall. The first milestones cover the renderer, water, light and reflections, plus one flooded chamber with a benchmark. Steals 4–6 fold into the Act 2–3 milestones, and steals 1–2 into Act 5.
