# Farhold — design review, round 10

A play-and-inspect pass over the whole game: title screen, landing, first five minutes,
combat, all seven sheet screens, the map, the star chart, a town, a shop, a dungeon, space,
night, and the reward popup. Driven with Playwright at 1920×1080 and 1366×768, screenshots read
back by eye, console and `pageerror` collected throughout, and every claim about "this is broken"
checked against the code.

**Headline:** the *screens* are in good shape — the item compare panel, the reward popup, the
skills tree and the crafting bench are all better than most prototypes ever get. What is missing is
the **connective tissue**: the game never tells you what to do, never explains the systems it just
built, and a large part of the Territory expansion is loaded at boot and thrown away. Fix the
first five minutes and surface what already exists, and this plays like a real game.

Method note: no page errors and no console errors were seen in any session. The only console noise
is Three.js warnings (`toNonIndexed(): BufferGeometry is already non-indexed`, `THREE.Clock`
deprecated) and a headless WebGL stall warning — none are findings.

---

## Top ten, in order

1. **The level-up message promises attribute points the game stopped giving out.**
   `js/main.js:1070` logs "3 points to spend (press I)"; `pendingAttr` is never incremented
   anywhere. Pressing I shows four dead `+` buttons and "no points to spend".
2. **Nothing on the HUD says what to do.** You land next to a city with a quest-giver 46 m away
   and a merchant 30 m away, and the screen shows no objective, no tracked quest, no "go here".
3. **The pause menu's control list renders outside the card.** `#hint` is `position:fixed`, so the
   "CONTROLS" heading sits over empty space and the keys float at the bottom of the screen.
4. **The Journal's faction panel is the only place the full faction names exist**, and it
   contradicts itself: the header says "the Reach", the row below says "The Warden's Reach".
5. **Standing shows a band name and a number and explains nothing** — and three of the band
   effects EXPANSION.md promises (prices, hostility, patrol reaction) have zero call sites.
6. **Two whole content files are parsed at boot and discarded**: `data/landmarks.json` (14) and
   `data/faction-rewards.json` (12 × 2 ranks). `landmarkData`/`rewardData` are never used.
7. **The world map opens clipped, buried under an opaque Layers panel, with 59 overlapping region
   labels on by default.** It is the main navigation screen and it is unreadable.
8. **The XP bar on the HUD is a 6px unlabelled sliver** with no number. At level 1 you cannot tell
   you have progress at all.
9. **Dungeons are too dark to navigate** even with the torch lit — the same torch that lights a
   20 m circle outdoors lights ~4 m underground.
10. **Job titles render broken sentences**: "Burn Burn Camp out", "Ebba is missing somebody",
    "Something has taken …" (the champion's name the frame binds is thrown away).

**Count by severity:** 2 blocker · 14 high · 17 medium · 12 low · 9 polish.

---

## A. The first five minutes

### A1. Nothing tells a new player what to do — blocker — S
**Where:** the HUD (`index.html:104-142`), `js/hud.js` `tick()`
**What is wrong:** on landing the log prints four lines (landing, an eclipse, "Pebelkeep charted",
"The Bleak Moor is the Reach's ground") and then nothing. The HUD has no objective, no tracked
quest, no arrow. Meanwhile `folk.marks()` already returns a `!` quest mark 46 m away and a `$` shop
30 m away, and the Journal's "Work going here" already lists five jobs with gold and XP. The
player has no way to know any of that exists. Verified: `folk.nearest()` returned
`Rosie Nine-Pies, merchant` at 30 m from spawn, and `folk.marks()` returned a `!` at 46 m, with an
empty `#prompt` and no HUD objective.
**What to do:** add a one-line **tracked objective strip** under the HP/MP bars (or above the skill
bar) that shows the top marker from `markers` — name and distance, reusing `distanceText()` which
`js/hud.js:686` already has. On a fresh run, seed it with "Pebelkeep — find work" pointing at the
nearest settlement. One strip, one line, driven off the marker book that already exists.

### A2. The level-up message promises points that no longer exist — blocker — S
**Where:** `js/main.js:1070`; `js/hud.js:894-906`; `js/rpg.js:429,438-441,710-714,767`
**What is wrong:**
```js
hud.log(`Level ${player.level}! ${levels * (balance.progression?.attrPerLevel ?? 3)} points to spend (press I).`, 'level');
```
`data/balance.json:46` still carries `"attrPerLevel": 3`, so every level-up says "3 points to
spend". But `player.pendingAttr` starts at 0 (`js/rpg.js:429`) and is **never incremented** — the
level loop has a comment saying so ("attributes are no longer bought a point at a time - the forest
is where a level goes", `js/rpg.js:438-441`), and `gainXp()` only bumps `pendingPassive` and
`pendingTalent`. `spendAttr()` (`js/rpg.js:767`) always returns false. The Character rail badge
(`js/hud.js:802`) is fed `pendingAttr` and so can never light up.
**What to do:** change the message to name the real currency — the perk point.
`perks.pointsFor(level) - perks.pointsFor(level - 1)` gives the number
(`js/perks.js:314-317`). Then either delete the `+` buttons at `js/hud.js:894-904` and render
Attributes as a read-only block, or delete the pane. Also drop `attrPerLevel` from
`data/balance.json` so nobody re-wires it by accident.

### A3. The title screen's control row wraps into nonsense — high — S
**Where:** `index.html:24-31`, `.row` in `style.css`
**What is wrong:** at both 1920 and 1366 the Name/Class/Seed row wraps so that "Class" sits at the
end of line one with nothing under it, and the class `<select>` drops to line two with "Seed" to
its right. Three labels, three controls, and none of them line up with each other.
**What to do:** give the row `display:grid; grid-template-columns:auto 1fr auto 1fr auto 1fr;`
(or put each label/control pair in its own wrapper with `display:inline-flex; gap:6px;` so a pair
can never be split). Cap the class select at ~340px.

### A4. The title screen calls itself "Round 4" — high — S
**Where:** `index.html:97-103`
**What is wrong:** the blurb under New game opens "Round 4: the RPG expansion." The game is at
round 10 with a Territory expansion on top. "Round 4" is a build number, not something to show a
player, and the text it introduces is now wrong about what the game contains.
**What to do:** replace with two sentences of what the game is, then the control legend. Something
like: "A whole planet, a level band per region, packs with champions in them, dungeons you go
inside, and twelve factions who all remember what you did." Then the keys. And bump the font: it
is currently 11px at ~40% contrast, which is the least readable text on the screen and the only
place the controls appear before you start.

### A5. Thirty classes, no way to choose between them — high — M
**Where:** `index.html:27` `#boot-class`, populated from `data/classes.json`
**What is wrong:** one `<select>` with 30 entries, each labelled like
"Ranger — Precision Ranged (companions)". You cannot see a class's skills, its weapon, whether it
brings a companion, or what it looks like. The Skills screen has all four skill names and
descriptions, and the game has full 2D/3D avatars — none of it is offered at the one moment it
matters.
**What to do:** keep the select, and put a small panel beside it that fills in on change: the four
skill names with their one-line `desc` from `data/skills.json`, the starting weapon, and the
companion line if there is one. No new data needed — the Skills tab already renders exactly this.

### A6. The starting spawn is inside the town watch, so nothing attacks you — medium — S
**Where:** `js/actors.js:349-357`
**What is wrong:** anything hostile inside a settlement's watch radius switches to `state:'flee'`
and runs. This is a good rule (it fixes "I get attacked while talking to NPCs"), but the player
*starts* inside that radius, so a new player who walks around the spawn point meets nothing, learns
nothing about combat, and has no idea a boundary exists. Verified: seven enemies spawned 3 m away
all went to `state:'flee'` and ran 30 m to the wall; six clicks of attack did nothing. The same
test 1.4 km out worked immediately (94 → 30 hp in about seven seconds).
**What to do:** nothing to the rule. Add the feedback: when a hostile flees the watch, log it once
per zone — "The hounds will not come inside Pebelkeep's watch." — and draw the watch radius as a
faint ring on the minimap. The player then understands the town is safe *and* that the danger is
outside it.

### A7. The first thing you see is an eclipse, in the dark — medium — S
**Where:** `js/sky.js` eclipse scheduling; seed 3 reproduces it
**What is wrong:** on seed 3 the run opens with "A solar eclipse begins" at 08:16 and the world is
murky grey-green for the whole first minute. It is a great effect landing at the worst possible
moment — the player's first impression of a sunlit world is a dim one, and they have no idea it is
temporary.
**What to do:** suppress an eclipse for the first two in-game hours after landing (or push the
landing time of day to mid-morning clear). Cheap, and it costs nothing — the eclipse still happens.

### A8. The log is the only teacher, and it scrolls away — medium — S
**Where:** `#log`, `style.css`
**What is wrong:** five lines, bottom-left, 12px, ~55% contrast, no history, no scrollback. Every
first-run explanation goes through it and is gone in seconds. The one line that introduces the
entire faction system — "The Bleak Moor is the Reach's ground." — is line four of five and uses a
short name the player has never seen expanded.
**What to do:** raise the log's contrast and keep the last 12 lines instead of 5; and add a `L`
key (or a Journal panel) that shows the last 50. Separately, make the first appearance of any
faction use the full name (see B2).

---

## B. Systems legibility

### B1. Two content files are loaded and then thrown away — high — M
**Where:** `js/main.js:107-108` (load), `:89` (destructure), `:146,159,167,177` (passed through),
then never referenced again
**What is wrong:** `data/landmarks.json` (14 landmarks with `blurb`, `does`, `gives`) and
`data/faction-rewards.json` (12 factions × Trusted/Sworn rewards) are parsed at boot and no code in
`js/` reads a single field. EXPANSION.md presents both as shipped systems. That is 26 authored
entries of content the player can never reach, and a doc that is wrong.
**What to do:** pick one. Either wire the cheapest half — landmarks are the bigger win, because
they fill a zone and `js/sites.js` already places points of interest — or mark both as not-built in
EXPANSION.md's table so the next person does not assume they work. Do not leave them loading.

### B2. The player is never told a faction's full name — high — S
**Where:** `js/main.js:2328,904,1025,2358,2379`; `js/hud.js:2006`; `js/rumours.js:100-101`
**What is wrong:** seven sites use `faction.short` ("the Reach", "the Cut", "the Wrights") and
exactly one uses `faction.name` — the standing row at `js/hud.js:1999`. So the zone-entry log, the
job giver, the zone-flip message and every rumour use a nickname the player has never seen
expanded. Worse, the Journal panel contradicts itself on screen: the header
(`js/hud.js:2006`) reads "the Reach · Known" while the row three pixels below reads
"The Warden's Reach". Verified in the Journal screenshot at both resolutions.
**What to do:** track a per-faction "introduced" flag. The first time a faction is named in the log
or a rumour, use `name`; every time after, use `short`. One helper in `js/factions.js`:
`nameFor(key)` that returns the full name once and the short form thereafter. And make the Journal
header use `name` — it is the reference screen.

### B3. Standing is a number with no explanation — high — M
**Where:** `js/hud.js:1986-2007` (the "Who holds this ground" panel); `data/factions.json:5-9`
**What is wrong:** the panel shows a colour chip, the full name, the band name, and a number. It
never shows the five-band ladder, the thresholds, the price effect, or *what moves the number*.
`data/factions.json` has a 13-entry `deeds` table that no screen surfaces. A player watching a
number go from 0 to −10 has no idea why or what it costs them.
**What to do:** three additions to that panel, all data you already have:
- a thin five-segment bar per faction with the current position marked, so the ladder is visible;
- the band's `priceMult` as plain text on the row ("+40% in their shops");
- a footer listing the five biggest `deeds` entries ("finish a job +6 · clear their enemy's camp
  +4 · kill one of their patrol −10 · rob a caravan −15 · desecrate a landmark −20").

### B4. Three promised standing effects have no call sites — high — M
**Where:** `js/factions.js:112` `priceMult`, `:114-118` `hostile`; `js/patrols.js:151` `reaction`
**What is wrong:** all three are written, exported, and never called. The shop uses
`campaign.priceMultiplier()` instead (`js/main.js:1595,1598`), so the discount/mark-up does
nothing; "Hunted → they attack on sight" is not wired; "Trusted → patrols reinforce you" is not
wired. Standing therefore changes nothing a player can feel.
**What to do:** wire `priceMult` first — it is one multiplication at `js/main.js:1595` and it makes
standing immediately legible at the shop counter ("Trusted here — 15% off"). `hostile()` next, in
the same place the actor field decides whether a spawn is hostile.

### B5. Patrols, caravans, incidents and wanderers are invisible — high — M
**Where:** `js/patrols.js`, `js/caravans.js`, `js/incidents.js`, `js/wanderers.js`
**What is wrong:** all four modules are complete and none of them reach the screen.
- Patrols: only `enter`/`candidates`/`update` are called. `near`, `reaction`, `killed`, `loseOne`
  are never called, so "kill one of their patrol −10" cannot fire. Patrols exist only as job
  targets.
- Caravans: only `dispatch`/`inZone`/`candidates`/`update`. `near`, `escort`, `rob` never called —
  three of the four ways EXPANSION.md says you can meet one do not exist in play.
- Incidents: `trouble.effects()` is never called from `js/main.js`, so an incident is one red log
  line and changes nothing — no spawn change, no shop closure, no frames opened.
- Wanderers: fully implemented (`meetOnTheRoad()`, `js/main.js:1356-1460`) but nothing renders a
  body and the detection radius is **6 m** (`js/main.js:1343`) on a 57 km world. You will only meet
  one by walking over the exact spot.
**What to do:** the cheapest visible win is a **minimap mark for each**. `js/main.js:3108-3116`
already feeds the minimap a list of `{x,z,icon,color}`; add patrols, caravans and wanderers to it
with their own glyphs. That alone turns four invisible systems into things you can walk towards.
Then raise the wanderer radius to ~25 m so a person on the road is meetable.

### B6. Job titles read as broken sentences — high — S
**Where:** `data/job-frames.json`
**What is wrong:** three frames produce bad copy, seen live in the Journal's "Work going here":
- `the_claim`: `"Burn {camp.name} out"` and `data/factions.json:167` names that site kind
  **"Burn Camp"** → **"Burn Burn Camp out"**.
- `someones_boy`: `"{who.name} is missing somebody"` → "Ebba is missing somebody" / "Grimm the
  Patient is missing somebody". It reads as the giver doing the missing.
- `beast_moved_in`: `"Something has taken {site.name}"` — the frame binds a champion and then
  throws its name away. EXPANSION.md's own example was `"{beast.name} has taken {site.name}"`.
**What to do:** `"Clear out {camp.name}"`; `"{who.name}'s boy has not come back"`;
`"{beast.name} has taken {site.name}"`. Also: every site of a kind shares one name ("Burn Camp",
"Wreck Camp", `data/factions.json:167-184`), so two jobs in the same zone can name the same place.
Suffix the site name with its zone or a Name Forge word at generation time.

### B7. Eight incident rumours carry unrendered `{zone}` and never fire — medium — S
**Where:** `data/incidents.json:11,19,27,41,48,62,69,76` (`onExpire.rumour`)
**What is wrong:** `onExpire` is never read by any JS — incidents just vanish at
`js/territory.js:303-305`. So eight aftermath rumours are dead data, and the `{zone}` templating
they use was never implemented. `resolvedBy` (4 frames) and `effects.patrolMult` are dead in the
same file.
**What to do:** either implement `onExpire` in the filter at `js/territory.js:303` (push the rumour
before dropping the incident, running it through the same `phrase()` helper `js/jobgen.js:236`
uses) or delete the keys. Right now they read as shipped features.

### B8. The map shows the whole planet from the first second — medium — M
**Where:** `js/map.js`
**What is wrong:** every one of 59 regions, every settlement and every node is visible on the map
before you have walked anywhere. EXPANSION.md's design rule 1 says "rumours are the ONLY thing that
describes somewhere you are not" — but the map already told you. There is no discovery, and the
Journal's "Word going round" is therefore redundant with a screen you already have.
**What to do:** you do not need fog of war. Grey out the *names* of regions you have not entered
and show their level band only (the danger colour is enough to plan a route), and reveal the name
when you cross the border or hear a rumour about it. `zones` already tracks `visits`/`lastVisit`
on the territory record.

---

## C. Moment-to-moment play

### C1. The XP bar is a 6px unlabelled sliver — high — S
**Where:** `index.html:114`; `style.css:45,50,51`; filled at `js/hud.js:465`
**What is wrong:** `.bar.xp { height: 8px }` with a 1px border leaves 6px of dark gold fill, and
unlike the HP and MP bars it gets no `<span>` readout (`index.html:112-113` have one,
`:114` does not). At level 1 with 0 XP it is invisible. The only XP number in the game is
"58 xp to level 2" in the sheet header, which you have to open a screen to see.
**What to do:** give the XP bar the same `<span>` the other two have, showing `x / y to level N`,
and raise it to 10px. One line of HTML, one line of JS.

### C2. Locked skill slots never name the skill — high — S
**Where:** `js/hud.js:441` — `s.locked ? \`level ${s.unlockAt}\` : s.name`
**What is wrong:** slots 2–6 read "level 3", "level 7", "level 12", "level 18", "level 24". You
learn what your class gets only by opening the Skills tab. The bar is the thing you stare at all
game and it tells you nothing about your future.
**What to do:** show the name greyed with the level under it — "Poison Dart / lvl 3". The Skills
tab already has both strings; the state object already carries `unlockAt`.

### C3. Cooldown and "not enough mana" look identical — medium — S
**Where:** `js/hud.js:443-446`; `style.css:482`
**What is wrong:** `.skill-slot.blocked { opacity: .45 }` is applied whenever `!s.usable`, which
covers both "on cooldown" and "cannot afford". The cooldown sweep (`.skill-cd`) is a dark overlay
with no number. So a key that does nothing gives you no reason. The mana cost is rendered at 9px
in the corner (`style.css:479`) in the same blue whether you can afford it or not.
**What to do:** two classes instead of one — `.cooling` (keep the sweep, add the seconds as text in
the centre when > 1.5 s) and `.poor` (tint `.skill-mp` red). Then a dead key always says why.

### C4. Dungeons are unnavigably dark — high — S
**Where:** `js/light.js`, `js/dungeon.js` lighting
**What is wrong:** outdoors at night the torch throws a clear ~20 m pool of light. Inside
`The Jurrohaun Lair` with the same torch lit ("It is very dark. Your torch is lit.") the corridor
is black past roughly four metres and the wall openings are not visible at all — you cannot tell a
doorway from a wall. Verified by comparing the night and dungeon screenshots: same character, same
torch, wildly different radius.
**What to do:** raise the dungeon ambient floor so geometry is readable at ~12 m (a very dim
blue-grey is enough — it still reads as dark) and let the torch keep its outdoor radius. The
atmosphere comes from the colour, not from the player being unable to see.

### C5. The target bar sticks to something 30 m away and never says how far — medium — S
**Where:** `#target` (`index.html:135-138`), `js/hud.js` `tick()`
**What is wrong:** after the hounds fled, the target bar still read "Moor Hound · level 1" at full
health with the hound 30+ m away and out of reach. No distance, no out-of-range state, no portrait,
no rank ("champion"/"rare"). And in the dungeon it stacks directly under the boss bar, so two red
bars sit on top of each other and only one has a name.
**What to do:** add the distance beside the level ("Moor Hound · level 1 · 34 m"), dim the bar when
the target is beyond your weapon's reach, and drop the target bar down (or hide it) while
`#boss-bar` is showing.

### C6. No damage numbers in the world — medium — M
**Where:** combat feedback, `js/combat-fx.js`
**What is wrong:** every hit, crit, heal and status tick goes only to the text log at the far
bottom-left of the screen, away from where you are looking. Verified: "You hit Moor Hound for 3."
appears in the log while the fight happens at the crosshair. Crits, status damage and overkill are
therefore invisible in practice.
**What to do:** floating numbers above the target, rising and fading over ~0.6 s, white for normal
and amber for a crit, using the same screen-projection `js/hud.js` already does for name plates.
Put a "Damage numbers" toggle in Settings for people who hate them.

### C7. The debug readout is on by default — medium — S
**Where:** `#hud-where` (`index.html:132`)
**What is wrong:** "seed 3 · x 22812 z 10105 · cell 102,45 · altitude 22 m · Grassland" in
monospace, right-aligned, permanently under the minimap, and it visually collides with the minimap's
bottom edge. In the dungeon it becomes "seed 3 · The Jurrohaun Lair · x -37 z 28 · 8 rooms · level
22"; in space "seed 3 · in flight". None of it is player information.
**What to do:** keep the biome and altitude (those are useful), drop seed/x/z/cell behind the
backtick debug menu, and add a "Show coordinates" toggle in Settings.

### C8. The minimap hides its own information — medium — S
**Where:** `js/hud.js:596-700`
**What is wrong:** the drawing code is good — shop/quest glyphs, enemy pips by rank, marker pins,
rim arrows with distances — but the glyphs are 11px (`js/hud.js:630`) on a 180px map, there is no
legend, no north marker, and no scale. The `+`/`-` zoom is not in any control list. At night the
map stays in full daylight colours while the world is dark. Verified: the `!` quest mark 46 m from
spawn rendered as a 4px orange dot I could not identify without reading the code.
**What to do:** 13px glyphs with a heavier outline; a tiny "N" on the rim; the span in km printed
under the map permanently (you already compute it for the log line at `js/hud.js:180`); add `+`/`-`
to the control legend; and multiply the base image by the sky's gloom at night.

### C9. The right-hand place card is right-aligned ragged prose — medium — S
**Where:** `#hud-place` (`index.html:122-129`), `style.css`
**What is wrong:** five lines of right-aligned text of wildly different lengths, so the left edge is
a ragged staircase. The planet line wraps to three lines ("Shaukraen Anchor IV — Tundra World,
1.39 g, breathable air, orbiting Shaukraen Anchor (Red Dwarf).") and repeats the planet name that is
already the first line. Underground it still reports the weather, the daylight and the surface
gravity.
**What to do:** left-align the card body (keep the title right-aligned if you like the look), drop
the repeated planet name from the description line, and when `dungeon` is set replace the sky and
weather lines with the dungeon's room count and depth.

### C10. The sky line is a sentence with no verb, and names a moon by its catalogue id — medium — S
**Where:** `js/main.js:3153-3157`; `universe/js/system.js:127,302`
**What is wrong:**
```js
return up.map(b => b.name).join(', ') + (s.isNight ? ' overhead' : ' in the daylight');
```
renders "Shaukraen Anchor III, Shaukraen Anchor IV a in the daylight" — no verb, a comma where an
"and" belongs, and "Shaukraen Anchor IV a" is the moon's raw designation
(`name: \`${planet.name} ${MOON_LETTER[i]}\``). The rest of the game already handles this:
`js/space.js:472` and `js/starchart.js:196` both render `Moon of ${parent.name}`.
**What to do:** join with "and", add "is up"/"are up", and route moons through the same display
form the chart uses — the moon record already carries `parentName` and `index`
(`universe/js/system.js:300-301`). Result: "Shaukraen Anchor III and its moon are up in the
daylight."

### C11. Level 1 is fragile against the ambient spawn rate — medium — M
**Where:** `js/actors.js` spawn budget; `data/balance.json`
**What is wrong:** fighting 1.4 km outside town at level 1 took the player from 94 to 30 health in
about seven seconds, with 33 live enemies in the field at once. A Moor Hound has ~35 hp and a swing
does 3–7, so a single hound is seven swings; three of them arriving together is death. There is no
health regeneration visible and no potion in the starting kit.
**What to do:** this is a balance pass, not a rewrite — halve the ambient enemy count inside the
level 1–4 band (the `density` knob already exists on the title screen; apply a band-based multiplier
on top), and give a new character three healing draughts in the bag so the first fight has an
answer.

---

## D. The screens

### E1 note on shared layout
Six of the seven sheet tabs leave between a third and two thirds of the screen empty at 1920×1080
while the same panels are **clipped** at 1366×768. The fix is the same everywhere: let the panes
flex to content and scroll rather than sit at fixed heights in a fixed grid. Listed once here, cited
per screen below.

### D1. Journal: the two most important panels are cut off at 1366 — high — S
**Where:** `index.html:430-460`, the Journal grid in `style.css`
**What is wrong:** at 1366×768, "The Survey" shows 6 of its 8 goals (cut mid-row at "Three ruins")
and "Who holds this ground" shows 7 of 12 factions (cut mid-row at "The Greenhand"). Five factions —
including the Hollowed, who cannot be liked, and the Longsight, who pay for places — are simply not
on screen, with no scrollbar to suggest there is more.
**What to do:** `overflow-y:auto` with a visible scrollbar on both panes, and a `+5 more` affordance.

### D2. Journal: "Work in hand — nobody has asked you for anything" next to five available jobs — high — S
**Where:** `js/hud.js:2010-2022`
**What is wrong:** the panel on the left says you have no work; the panel immediately to its right
lists five jobs with gold and XP. Nothing says how to take one, and the rows are not obviously
clickable.
**What to do:** make the "Work going here" rows accept a click to track (drop a marker), and add the
giver's name and the distance to each row — "See the toll coin run through · Rosie Nine-Pies ·
340 m · 149g · 148 xp". That turns the Journal into the place jobs come from instead of a list you
cannot act on.

### D3. Perks: 89 unlabelled black dots on a black field — high — M
**Where:** `js/hud.js:1292-1295` and the perk canvas
**What is wrong:** the forest is drawn as near-black dots on a near-black background. Only the four
branch names are coloured. You cannot tell which node belongs to which branch, which nodes are
reachable, or what any of them do without clicking each one. At level 1 the whole screen is inert
and says "0 taken · none left to spend" with no hint that the first point arrives at level 2
(`js/perks.js:314-317`: `pointsFor(1) === 0`).
**What to do:** three changes, all in the draw call. (a) Tint every node with its branch colour at
low saturation, so the four arms are visible at a glance. (b) Ring the nodes that are *takeable
right now* in white. (c) When `pointsLeft === 0`, change the header to "your next point comes at
level {n}". The "THIS NODE" panel is also mislabelled when nothing is selected — call it "The
forest" until a node is clicked.

### D4. Perks/Inventory: destructive buttons with no cost and no confirm — medium — S
**Where:** "Take it all back" (Perks footer); "Recycle everything up to: normal / magic / rare"
(Inventory footer, `index.html`)
**What is wrong:** the respec button states no cost and implies no confirmation. The bulk-recycle
chips look like filter chips, sit in a row of filter chips, and irreversibly destroy gear. The
reassurance text ("uniques and set pieces are never taken in bulk") is 11px grey below them.
**What to do:** make the recycle chips look like buttons (a border and a verb — "Recycle all
normal"), and put a two-step confirm on both: first click arms, second click commits, with the
count in the label ("Recycle 7 normal items?").

### D5. Character: a 750px empty "Powers" column at level 1 — medium — S
**Where:** the Character tab's third column (`index.html`, `.col-*` grid in `style.css`)
**What is wrong:** "Nothing on your gear does anything clever yet." occupies a full-height panel,
pushing Companions and Boat and Ship to the bottom of the screen. At 1366 the same three panels are
squeezed.
**What to do:** let the Powers pane size to its content when empty (`.pane { flex: 0 1 auto }` for
the empty state) so the panels below rise. Same for the Inventory's "Compare" column.

### D6. Character: half the stat list is em-dashes — medium — S
**Where:** `js/hud.js:881-890`
**What is wrong:** Accuracy, Cooldowns, Block, Barrier, Better loot and Gold find all render "—" at
level 1. Six of eighteen rows carry no information, and "—" does not tell you whether that means
zero or not-applicable. "Kills 0" is also filed under "Everything else" as though a lifetime counter
were a stat.
**What to do:** hide zero-valued rows behind a "Show everything" toggle in the pane header (default
off), and move Kills to the Journal's Survey panel where the other counters live.

### D7. Character: "Boat and Ship" in a jokey voice on the stat screen — low — S
**Where:** the Character tab's bottom panel
**What is wrong:** two dropdowns with copy that does not match the rest of the game's tone — "Six
logs and a great deal of rope. It floats, which is the entire specification." / "Standard issue. It
gets down, and usually back up." Everything else on this screen is terse and dry.
**What to do:** move the vehicle picker to Inventory (it is equipment), or keep it here and cut the
descriptions to their function — "Shallow water only" / "Reaches orbit".

### D8. Upgrade: two panels called "On the bench" and "The bench" — medium — S
**Where:** `index.html` (Upgrade tab)
**What is wrong:** the two panels either side of each other are named "ON THE BENCH" and "THE
BENCH". Nobody can tell which is which. Item rows also show "– 0" on the right with no label — that
is the upgrade level, rendered as a dash then a zero.
**What to do:** rename to "Chosen item" and "What it becomes". Render the upgrade level as "+0" (or
blank when zero) and label the column.

### D9. Crafting: the Forge button is disabled with no reason on the button — medium — S
**Where:** the Crafting tab's right column
**What is wrong:** "Forge it" is greyed. The reason — "Scrap Iron 0 / 10" — is 300px above it in
red. And nothing on this screen says where Scrap Iron comes from; the only clue is "no materials
yet" in the sheet header.
**What to do:** put the reason in the button ("Need 10 Scrap Iron") and add a one-line footer:
"Materials come from recycling gear you do not want — Inventory, then R." Also flag class
restrictions on the base cards: a Ranger is currently offered a Wand, a Scepter and a Staff with no
indication they cannot use them.

### D10. Skills: locked talent tiers look identical to the one you can pick — medium — S
**Where:** the Skills tab's talent columns
**What is wrong:** Tier 2 (level 8) and Tier 3 (level 18) render at the same contrast as the Tier 1
cards you can actually take. Only the column header carries "· LEVEL 8". The footer says "Pick one
from each tier", which reads as an instruction you can follow now. There is also no visible
affordance on the Tier 1 cards — no button, no "pick" label.
**What to do:** dim the locked tiers to ~40% and put "opens at level 8" as a card-level overlay.
Give the pickable cards a hover state and a "Take" label.

### D11. The map opens clipped and buried — high — M
**Where:** `js/map.js`, the map screen's layout
**What is wrong:** at both resolutions the map canvas extends under the opaque Layers panel and off
the right edge — region names on the eastern third are cut mid-word ("Old Rave…", "The Bleak…",
"The Hollow Lowlan…"). The HUD's place card shows through behind the map header at ~20% opacity.
The Levels layer is on by default and paints 59 name+band+danger labels that overlap each other into
illegibility in the dense middle. And the legend row mixes two unrelated scales: danger colours
("far below you / easy / a fair fight / dangerous / do not go here yet") next to World Forge biome
percentages ("Sea Ice 22% Grassland 13% …"), which are a debug readout.
**What to do:** four changes, all small. (a) Fit the map to the space *left of* the panel on open.
(b) Make the Layers panel a collapsible drawer, closed by default. (c) Hide the HUD while the map is
open. (d) Split the legend: danger scale under the map, biome percentages behind a "Composition"
disclosure or gone. And at this label density, only draw a region's name when it is the one you are
in or adjacent — the rest get their band colour only.

### D12. The star chart wastes the screen and does not say where you are — medium — S
**Where:** `js/starchart.js`
**What is wrong:** five planets drawn as 3px dots in the middle of a 1600×1000 canvas with the
bottom third empty. The "Worlds" list gives all five identical blue dots and an AU figure, with no
mark on the one you are standing on, no indication of which are landable or breathable, and no level
band. The header says "2 moons" and the list contains none. "Getting around" explains the mouse
wheel but not how to actually travel.
**What to do:** scale the orbit drawing to fill the canvas height; mark the current world in the
list ("· you are here") and colour its dot; add the moons as indented rows under their parent (the
chart already renders `Moon of ${parent.name}` elsewhere, `js/starchart.js:196`); and add
"breathable" / "level band" to each row, since that is the only thing a player needs to choose.

### D13. The pause menu's controls render outside the card — high — S
**Where:** `index.html:152-156`; `style.css:89-92` and `:853`
**What is wrong:**
```css
#hint { position: fixed; bottom: 14px; left: 50%; transform: translateX(-50%); … }
```
`#hint` sits inside `.pause-card` in the markup but is pinned to the viewport. So the card shows a
"CONTROLS" heading with 24px of empty space under it (`.pause-card h3`, `style.css:1018-1020`) and
the key list appears across the bottom of the screen, on top of the skill bar. `#hint` is also never
referenced by any JS and lives inside `#pause`, which is `display:none` while playing — so the hints
are invisible during play *and* misplaced when paused. `style.css:852-854` still reserves 44px of
skill-bar clearance for it.
**What to do:** drop the `position:fixed` block for `#hint` when it is inside the card (scope it to
`#pause #hint { position: static; transform: none; }`), and reclaim the 44px at
`style.css:852` so the skill bar sits where it should.

### D14. The pause menu says "0m" where it means playtime — low — S
**Where:** `js/main.js:2500` `playtimeText(state.playtime)`
**What is wrong:** "Shaukraen Anchor IV · The Bleak Moor · 0m". Elsewhere on screen "22 m" means
metres of altitude. Two units, one abbreviation, four inches apart.
**What to do:** "0 min played" (or "just landed" under a minute).

### D15. Settings has no key rebinding and no gameplay toggles — medium — M
**Where:** `js/settings.js`
**What is wrong:** the Controls section offers camera shoulder, two invert toggles and mouse
sensitivity. There is no way to remap a key in a game with fifteen of them — which locks out AZERTY
and left-handed players entirely. There is also no damage-numbers toggle, no UI scale, no field of
view, and no "show coordinates". Label wrapping is poor ("Trees and rocks" wraps over three lines),
the slider values are raw numbers with no units, and "Everything back to normal · Reset" wipes
settings with no confirm.
**What to do:** rebinding is the one worth building — a simple click-a-row, press-a-key list over
the existing key constants. The rest are one-line additions to the same dialog. Widen the label
column to stop the wrapping and suffix the sliders ("1.0×", "75%").

---

## E. The reward popup, the shop and the world

### E2. The shop gives you nothing to decide with — high — S
**Where:** `js/talkui.js`, the trade panel
**What is wrong:** rows read "Scepter — 8g — Buy", three identical Scepters in a row, no damage, no
slot, no level requirement, no class restriction, and no indication whether it beats what you are
wearing. The Inventory has a full compare panel; the shop has none. Buy buttons stay lit at 0 gold.
And the panel is semi-transparent, so the 3D character shows through the stock list.
**What to do:** reuse the item card the Inventory already renders — hovering a shop row should show
the same "Instead of Longsword +32 / it has 6–11 damage" comparison. Disable Buy below the price.
Raise the panel's background opacity.

### E3. A village merchant sells starships — medium — S
**Where:** the "Boats and Ships" block in the trade panel
**What is wrong:** a level-1 halfling general store in a starting village offers a 5200g
interstellar hauler, and that block is over half the panel's height. Tonally it lands wrong and it
buries the actual stock.
**What to do:** collapse it behind a "Boats and ships" disclosure, and only offer ships at a
settlement with a port (World Forge already flags port nodes).

### E4. Two conflicting "E" prompts on screen at once — low — S
**Where:** `#prompt` (`js/main.js:3030`) and the talk panel footer
**What is wrong:** while the shop is open, the world prompt still reads "**E** speak to Rosie
Nine-Pies" at the bottom of the screen, while the panel's own footer reads "E or Esc to step away".
**What to do:** clear `#prompt` whenever `talk.isOpen`.

### E5. The reward popup cannot tell you if the loot is an upgrade — high — S
**Where:** the reward overlay (`.rw-overlay`)
**What is wrong:** the presentation is genuinely good — banner, rays, gold count, rarity-coloured
cards. But a card shows only the item's own numbers ("2 armour, +2.9 constitution, +21.1 health").
Nothing compares it to what you are wearing, which is the only question you have at that moment.
Also: both cards use the same generic diamond glyph whether the item is boots or a wand; the rarity
badge appears on one card and not the other; and the world behind is not dimmed enough — the HUD,
the skill bar and the "E open the gilded chest" prompt are all still legible through it.
**What to do:** put the same one-line delta the Inventory already computes on each card ("+32 over
your Longsword" / "worse than your Leather Boots"). Give each card a slot silhouette instead of the
diamond. Show the rarity badge on every card. Push the backdrop dim to ~80%.

### E6. Affix text is missing its units — medium — S
**Where:** `js/affixes.js` display strings
**What is wrong:** the compare card reads "anything that hits you takes 10.7". 10.7 what? The
neighbouring lines carry units correctly ("+5.2% dodge", "+4.1% accuracy"). The bag row also shows
"▲ +32" — an unexplained score — and an orange warning icon with no label.
**What to do:** append the unit ("takes 10.7 damage"); give the score a tooltip ("32 points better
than what you are wearing"); give the warning icon a `data-tip` ("your level is too low").

### E7. "Plate Armor" / "Leather Armor" in a game that says "Armour" everywhere else — low — S
**Where:** the shared `items.json` base names, rendered in Worn slots, Inventory, shop and reward
cards
**What is wrong:** the UI is consistently British ("Armour", "Colour", and `js/talkui.js:159` even
relabels the `armor` stat key to "Armour") — but the item *base names* come through as
"Plate Armor", "Leather Armor". `items.json` is shared with Emberveil, so it must not be edited
here.
**What to do:** one display-time substitution at the point the name is rendered — the same place
Farhold already injects its own affix handling at load. `name.replace(/\bArmor\b/g, 'Armour')`.

### E8. The mage's hair is a solid dark sphere over the whole head — medium — S
**Where:** the mage class look, `js/actors.js` / avatar-3d hair part mapping
**What is wrong:** the ranger and warrior presets render normal hair. The mage renders as a large
solid dark-purple dome engulfing the head, which at night reads as a black blob with no face.
Verified across three separate runs at `?class=mage`.
**What to do:** check the mage's hair part id against the Chibi 2 part table — this looks like a
missing mapping falling back to a scaled sphere. `avatar-3d/CHIBI2.md` documents the incomplete part
mappings.

### E9. The torch pool has a hard edge — polish — S
**Where:** `js/light.js`
**What is wrong:** at night the torch throws a crisp-edged yellow disc on flat ground. It reads as a
projected spotlight, not firelight.
**What to do:** soften the falloff and add a small flicker on the intensity (±8% at ~6 Hz). Cheap
and it transforms the night.

### E10. In space, the HUD still shows the ground — medium — S
**Where:** `js/hud.js` minimap, `#hud-left`
**What is wrong:** flying, the minimap still draws the planet's surface with the player arrow on the
ground, and the HP/MP bars are still up. The status line reads "cruise · 0 u/s · slowing (26%) ·
warp locked" — "u/s" is an unexplained unit and "warp locked" reads like a fault rather than "too
close to warp".
**What to do:** swap the minimap for the system's orbit ring while `mode === 'space'` (the chart
already draws it), hide the HP/MP bars, and reword to "warp needs open space".

### E11. `colorAt` throws on an out-of-world coordinate — low — S
**Where:** `js/planet.js:873` — `const base = BIOME_RGB[id]; let r = base[0]`
**What is wrong:** if `biomeIdAt` returns an id with no entry in `BIOME_RGB`, `base` is undefined
and the terrain ring rebuild throws, killing the frame loop. Reproduced by calling
`farhold.teleport()` with a coordinate outside the world: `TypeError: Cannot read properties of
undefined (reading '0')` at `planet.js:873` → `terrain.js:113` → `main.js:2259`. The in-game debug
teleports use real node coordinates so this is not reachable in normal play today, but it is one
unclamped caller away.
**What to do:** two one-liners — `const base = BIOME_RGB[id] || BIOME_RGB[0];` at `js/planet.js:873`,
and run the coordinates through the existing `clampToWorld()` (`js/planet.js:919`) inside
`teleport()` at `js/main.js:3191`.

### E12. Region descriptions repeat, and some contradict their own names — low — M
**Where:** the Journal's "The world" list; World Forge region descriptors
**What is wrong:** five consecutive entries read "a wide stretch of warm, green open grass, easy
going, open to the sea". With 59 regions the list is mostly the same sentence. And "The Frost
Wastes" is described as "mild, green open grass, easy going, well watered" — the name and the
description disagree, because the name comes from Name Forge and the description from the biome
sample.
**What to do:** either bias the name generator with the biome (a grassland should not be called a
Frost Waste) or drop the descriptor from the list rows and keep it for the one region you are
standing in. The duplication is the bigger readability cost.

### E13. "Six settlements 1/6" repeats its own count — polish — S
**Where:** the Journal's Survey panel
**What is wrong:** the goal names carry the number ("Six settlements", "Eight jobs", "A hundred
kills", "Three worlds") and then the progress column repeats it ("1 / 6", "0 / 8").
**What to do:** name the goal by the thing ("Settlements", "Jobs taken", "Kills") and let the
counter carry the target.

### E14. Rumours treat every faction as plural — polish — S
**Where:** `js/rumours.js:41`
**What is wrong:** `` `${c.contestedName} are pushing into ${c.zone} and ${c.holderName} are not
winning` `` reads fine for "the Cut are" and wrong for "the Longsight are" / "the Stone Count are".
**What to do:** add a `plural` boolean to each faction in `data/factions.json` and pick "are"/"is"
from it. Twelve booleans.

### E15. Rumours are attributed to "somebody in The Bleak Moor" — polish — S
**Where:** `js/rumours.js`
**What is wrong:** every rumour is signed by an anonymous somebody, which is exactly the flavour a
rumour system is supposed to avoid.
**What to do:** the rumour already knows which zone it came from — bind it to a real townsperson
from `folk.roster()` when one exists ("Pin Rootstar, at the inn in Pebelkeep").

### E16. `#sheet-stats` is dead markup — polish — S
**Where:** `index.html:240`, `js/hud.js:881-890`
**What is wrong:** the flat stat list is a fallback for a build that no longer exists — the three
grouped `<dl>`s are always supplied, so `grouped` is always true and the flat list is always
`hidden`.
**What to do:** delete the element and the branch.

---

## What I could not check, and why

- **A genuine zone crossing.** I could not walk 1–2 km into a neighbouring band inside a headless
  session's time budget, so the zone banner was triggered by hand. The banner mechanism reads
  correct in code (`js/hud.js:304-327`); the "you should not be here yet" line I saw was my own
  hand-built zone object missing `midLevel`, not a bug.
- **Death and respawn.** I could not get the player killed. Setting `player.hp` directly does not
  trip the death check (nothing watches the value), and enemies spawned via the test handle did not
  close to melee within the time I gave them. The death screen, the revive rule and the respawn
  point are unreviewed.
- **Real flight and landing.** I entered space through the `toSpace()` shortcut, which does not
  frame the planet you left — so the "you are in space and cannot see the world" observation in E10
  may be an artefact of that shortcut rather than of pressing `J`. The minimap and HP/MP findings in
  E10 stand either way.
- **Sound.** Every session ran with `sound=off` for speed. The audio layer is unreviewed.
- **Whether Settings pauses the world.** My first reading suggested the clock advanced while the
  dialog was open; checking the code, `settings.isOpen` is inside `panelOpen()` and `tick()` returns
  before `state.elapsed += dt` (`js/main.js:644-662, 2606-2620`), so it does pause. The apparent
  movement was time that had already passed between panels. **Not a finding.**
- **Encounters, meteors, mounts, swimming, crafting a real item, and the 12 rank rewards** — not
  reached in the time available.
