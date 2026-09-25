# Tiny RTS — Design Roast (v1 doc)

## Verdict (3 lines)
Great hook: destructible, gravity-bound pixel forts. The side-view geometry that makes it work is under-specified.
The scope is roughly 3× what one session can build and test, and nothing is playable until M12.
Fix line-of-fire, digging and moat cheese, cut hard, and get a playable slice by M5, or you ship 20 milestones of systems and no game.

## Top 10 problems (ranked)
1. **Your walls block your own turrets (§5.3, §2.4).** Side view + "beams stop on solid cells" = a wall in front of a Pulse Turret eats its shots. Kinetic passes friendly structures and lasers don't. The doc never says whether turrets can sit *on* walls. The core "wall + turrets behind it" loop is undefined.
2. **There is no way to dig.** §5.4 says "dig first", §4.2 says "dig a tunnel", and the intro says "ground dug out from under you". No command, card slot, hotkey or drone job for it exists in §12.
3. **Moat cheese.** Walkers climb ≤ 3 cells (§6.1) and only Borers eat rock. Any pit (drill shaft, mortar craters, Orbital Lance "trench to bedrock" §7) traps every walker forever while turrets farm them. The physics *create* the dominant strategy for free.
4. **Foam deletes the physics (§2.2/2.3).** It's the cheapest per cell, has no span limit, and is "supported if it touches any non-empty cell" (foam holding foam = floating forts). Nobody builds Panel. Support, collapse and span preview become decoration.
5. **Reflection targets the wrong enemy.** The Hollow have essentially no lasers, so Prism is a worse Panel in Siege and in every Hollow mission, including "Glass Garden", which exists to teach it (§9.1). Carapace ignores lasers outright. Most of your arsenal (Pulse, Lance, Troopers, Lancers, Core zap, Commander) is laser, so one director counter-pick shuts off ~80 % of it.
6. **Milestone order hides the game (§18).** Waves come at M12, so there's no fun check for 11 milestones. Save/serialization (M19) arrives after every system holds live object references. The tutorial is scripted last.
7. **Scope ≈ 3× a single session**: 12 enemies + 3 bosses (one a segmented burrowing worm), 8 turrets including projectile-intercepting Flak and a charge-shield dome, 12 research items, fog of war, 3 AI personalities × 4 difficulties, 11 scripted missions × 2 star checks, an attract-mode title screen, a codex, rebinding, 3 colorblind palettes, and crooked-building re-leveling.
8. **Hotkeys fight the browser and each other (§12).** Ctrl held for line-lock + W to switch to Plate = **Ctrl+W closes the tab**. Ctrl+1…0 switches tabs. F5/F6/F7/F12 = reload / address bar / caret dialog / devtools. P = pause *and* patrol. Research slots collide with Z/X.
9. **Screen math doesn't fit (§2.1, §11.6).** 216 rows × 3 = 648 px + ~30 px top bar + ~150 px bottom panel = 828 px on a 720 px screen. At 1080p, ×5 fills all 1080 px, leaving no HUD room. ½× zoom at scale 3 = 1.5 px/cell = blurry shimmer. Railgun 260 / Mortar 220 / deployed Siege 300 outrange half the 384-cell view, so fights happen off-screen.
10. **Walls are dirt cheap against melee, and key numbers are missing.** Panel = 80 HP per Crystal, and a Mite does 4 per bite. A Mite-sized hole through an 8-thick wall is ~200 bites for ~10 C of wall. Also undefined: fire rates (Mortar/Flak/Arc), build times, drone build speed, enemy speeds/costs, phase lengths, friendly fire, and where reflected beams go. The agent will make these up.

---

## 1. Fun / core loop
- The moment-to-moment is strong *if* the geometry works: paint, drones build bottom-up, enemies chew the base, the top sags and falls. Protect that shot.
- **Physics rarely drive decisions.** Blueprint auto-repair, Repair Nodes and Nanite Cloud undo wall damage with no input (§5.4). Foam skips support. Collapse happens *to* you and is never used *by* you. Add **crush damage** from falling clumps/rubble (undermine a ledge onto Mites), and add a physics-puzzle mission.
- **Dominant strategies:** moats (#3); Foam (#4); turtling behind cheap thick walls with Pulse spam (nothing Hollow breaches efficiently); Versus artillery stalemate (Mortar/Railgun/deployed Siege outrange everything); **Call Early spam** (+40 C, no risk, §10.1); **Orbital Lance under the enemy Core**. A 16-wide trench drops a 24-wide Core that needs 40 % support, and Blink (80) gets you in range.
- **Batteries beat Solar**: lasers draw power per shot, so idle turrets are free. One Battery (400) = 100 s of Pulse fire, recharged between waves. Fine if that's intended, but decide on purpose.
- **Director counter-picks (§10.1)** punish what you invested in. That only feels fair if it's telegraphed and *soft*. Make Carapace reflect only from the front (hit it from above or behind). Turret height then matters, which makes the side view earn its keep.

## 2. Scope vs. feasibility
**Cut to a written "v1.1 backlog" (not silently):**
- Enemies: keep Mite, Gnawer, Spitter, Wisp, Carapace, Borer, Bombard, and Titan (the only boss). Cut Splitter, Leech, Nests, Hive Mother, The Maw.
- Turrets: keep Pulse, Lance, Mortar, Railgun, and Flak (AA only, no shell interception). Cut Shield Projector, Arc Coil, and Repair Node (drones repair).
- Units: Drone, Trooper, Lancer, Siege Walker, Commander (3 abilities, no XP). Cut Bulwark (a projectile-blocking system of its own) and Skimmer.
- Research: 6 items, one tier. Cut crooked buildings, Slag behavior (make it glowing Rubble), and Gate-as-material (make it a 4×16 building).
- Cut fog of war, AI personalities (1 AI + tuning knobs), Hollow interference in Versus, attract mode, the Codex (fold into How to Play), rebinding UI, and the AZERTY/QWERTZ remap (bind by `event.code` for free). Use 1 high-contrast palette instead of 3.
- Campaign: **6 missions** with authored waves and 1 star condition each.

**Missing, and players will notice:** a Dig tool; a pause key that always works; "repeat last build"; how units exit their own base; spawn points and what enemies target (walls? buildings? Core?); consistent power units (the doc mixes per-shot and per-second); and finite ore. A 10×48 shaft runs dry mid-mission, so add a Core trickle or drill re-seating.

## 3. Technical risk
- **Cell sim** (1536×320 = 491 k cells): fine in JS with typed arrays + sleeping chunks. The real risks: debris "settling into Rubble" keeps chunks awake forever (cap it, fade the rest), and piles lean unless you alternate the scan direction each tick.
- **Terrain render:** drop "one canvas per chunk row", which re-uploads 1536×32 pixels for one dirty cell. The world is tiny, so use **one world ImageData + one world canvas**, `putImageData` only the dirty rects, render the view at cell resolution, and integer-scale the whole canvas.
- **Support (§2.3):** the 0-1 BFS is ill-defined ("moving down... costs 0" from an anchor?) and mixes per-material spans inside one component. Replace it with a rule players can predict: *a structural cell is supported if the cell below is solid, or it sits within `maxSpan` along its row run of a supported cell.* Run row scans over the dirty box grown by maxSpan: bounded, fast, and trivially previewed in red.
- **Clumps:** fall straight down only, no rotation, collide against a per-column bottom profile, stamp back into the grid, then re-check support once. Add an iteration guard so a land → re-fall loop can't run forever.
- **Nav (§6.1):** this is a 1-D lane world. Flow fields over a 4×4 grid rebuilt 2×/s under constant carving is overkill, and the doc ignores **clearance** for 5–12-cell-tall units. Enemies: a **surface-walker rule** (walk toward the target; if the step ahead is taller than climb height, climb or chew the lowest blocking built cell, which naturally undermines walls). Borers get a heightmap plus a small cave graph. Player units: A* over a **surface-segment graph** (flat runs linked by step/jump/drop edges).
- **Game speed ×3** × 8 ms ticks = 24 ms/frame on Large, over budget. Cap at ×2.
- **Save:** ~2 MB raw (material + HP + Uint16 owner map). Base64 in localStorage (~5 MB, stored as UTF-16) is too tight. Use **IndexedDB** and store HP only where it's below max. Require all sim state to be plain data with integer ids **from M5**, with a save/load round-trip test.

## 4. UI/UX & hotkeys
**Conflicts:**
1. **Ctrl (line-lock) + card keys**: Ctrl+W close tab (unblockable in Chrome), Ctrl+R reload, Ctrl+E/F search, Ctrl+D bookmark, Ctrl+S save page, Ctrl+Q quit (Firefox/Linux). Use **Shift** for line-lock.
2. **Ctrl+1…0**: tab switching, unreliable to block. Only safe in fullscreen with `navigator.keyboard.lock()` (Chromium). Offer an alternate assign chord.
3. **F5–F8 camera spots**: F5 reload (Ctrl+F5 = hard reload, game lost), F6 address bar, F7 caret-browsing dialog. Cut the feature or move it to Alt+1–4.
4. **F1** browser help, **F3** find, **F10** activates the menu bar, **F12** devtools (the debug overlay can't own it).
5. **P** = pause (no selection) *and* patrol. Pause must mean the same thing in every context.
6. **H/P** orders sit off the 4×3 grid, breaking §12.3's "key = card position" rule.
7. **Research Lab** wants Q…C, but "any building" reserves Z (Salvage) and X (Repair priority). That leaves 10 free slots for 12 items.
8. **Alt** does three jobs (HP bars / erase / ping). A bare Alt tap focuses the browser menu on Windows. Alt+Tab drops the keyup, leaving erase mode stuck on. preventDefault the keyup and clear modifiers on `blur`.
9. **Tab** fights browser focus traversal into DOM HUD buttons (preventDefault; `tabindex=-1`).
10. **Space/Enter** re-press the last clicked HUD button instead of jumping to the alert. Blur buttons after click.
11. **Backspace** jumps to the Core while you type in the seed field or rebind box. Guard game keys while an input has focus.
12. **` [ ] + −** are dead keys or need AltGr on AZERTY/QWERTZ; use `event.code`. **Ctrl+±** and trackpad pinch (Ctrl+wheel) change browser zoom and break the integer scale; use a non-passive wheel listener with preventDefault.
13. **N** calls a wave on one stray keypress. Make it Shift+N.
14. **Ctrl+LMB** = right-click on macOS. **Ctrl+Shift+D** = Chrome's bookmark-all-tabs. **Middle-drag** starts autoscroll on Windows.
15. **Esc** always exits fullscreen, so pausing in fullscreen also leaves fullscreen.
16. Drones + army selected together: Build card or Unit card? Undefined.

**Discoverability:** meaningless Q/W/E/R category letters are fine *if the card is always visible with the letters on it*. Add per-category last-used memory and a "repeat last build" key, and let players build with a turret selected (today they must press Esc first).

**Readability:** pick the largest integer scale that fits above a slim (~110 px) bottom HUD, then fill the width. Use integer zoom steps (2/3/4/6). Draw HP bars and text on a screen-resolution overlay, never in cell space. Mirror Borer tremor warnings onto the minimap, because underground ends up under the HUD.

## 5. Balance red flags
- Wall HP per resource (Panel 80/C, Foam 64/C, Plate 120/F) vs. enemy damage per cell (4–20): raise wall costs ~4× or give melee a 3×3 bite.
- Lance (30 DPS, pierce, ~2× range, 90 C 10 A) is strictly better than Pulse (16 DPS, 50 C) once Alloy flows. Lance + Prism mirrors becomes the late-game default.
- Spitter range 120 > Pulse 80, and the tutorial doesn't say what answers it.
- The Railgun (laser-proof) needs 3 research cycles, and mission 8 adds "ore is scarce" on top.
- The Reactor's cost per power ≈ Solar's, with an explosion downside. It's only built to unlock Tier 3.
- Ferrite pays for walls, ammo and machines. That's great in Versus but strangles Siege.
- Drones use pop (up to 12 of 40), so the economy eats the army cap.
- `growth^wave` isn't specified. Use a hand-tuned table for waves 1–10 and growth ≈ 1.12 after that.

## 6. Campaign pacing & tutorial
- **Mission 1 teaches Plate (Ferrite) before Ferrite exists (mission 2).**
- **Mission 3 teaches Prism against lasers no Hollow enemy fires.**
- Mission 5 dumps Fabricator + units + Commander + Nests at once. A free hero with its own Q/W/E/R card shows up only at mission 5 of 10. Research first matters at mission 8.
- 7 of 11 missions are "survive N waves", yet the story is *laying a beacon line*. Add **Extend the Line** (relays across hostile ground), **Demolition** (collapse a mesa onto a target), and **Hold the Bridge** (a fort on an unstable span).
- Tutorial: fine if every step is gated with a ghost outline ("paint a wall here"). Build the objective/hint-step system with the M5 slice, not at M19.
- Use **authored waves** in the campaign. Keep the adaptive director for Free Play.

## 7. Rival AI
Minimum viable that still feels smart:
1. **Build slots, not free placement.** Terrain gen already flattens home pads, so also flatten a **front pad** and emit pre-validated slots (x, y, w) plus wall lanes. The AI fills slots in priority order and can never build nonsense on odd terrain.
2. **Scripted build order + reactive rules:** rebuild lost walls and drills, add AA after seeing flyers, pull the army home when the Core or walls take hits.
3. **Timing pushes:** attack when army value > a threshold that falls over time, and retreat at 30 %. Siege Walkers deploy at max range against your wall, which reads as clever in a lane game.
4. **Visible intent:** "Umbra is massing units" alerts, and Commander abilities used on your wall. Players credit what they see.
5. Difficulty = income multiplier + reaction delay + build-order pace. Skip APM simulation and scouting.
6. Tests: AI vs. a passive player wins, and the AI never sits idle for more than 3 minutes.

---

## Concrete changes I'd make
1. **Your own built cells don't block your own fire.** Fixes the core geometry. §5.3, §2.4.
2. **Turrets can sit on structural cells**, and their footprint counts in support. Undermining a wall drops its turret, so physics becomes a decision. §5.5, §2.3.
3. **Add a Dig tool** (Build card Z = Dig, X = Salvage): drones clear a painted area of rock/dust for Crystal per cell. The doc relies on it everywhere. §5.4, §12.4.
4. **Hollow walkers climb vertical surfaces at ⅓ speed.** Pits slow them instead of trapping them. Kills the moat cheese. §6.1.
5. **Foam = span 2, 1 C / 4 cells, weak to acid.** Stops it bypassing physics. §2.2–2.3.
6. **Replace the support BFS with the row-scan rule** (§3 above). Faster, bounded, predictable. §2.3.
7. **Clumps/rubble deal crush damage.** Gives collapse an offensive use. §2.3.
8. **Carapace reflects only from the front.** Either give 2–3 Hollow types laser attacks or move Prism to the Umbra/Versus missions. §2.4, §6.3, §9.1.
9. **Reorder milestones:** scaffold → world/render → cell physics → walls + drones → Core + Pulse + Mites + waves + objectives + plain-data save = **playable slice with a fun check at M5**. Layer everything else after. §18.
10. **Apply the §2 cut list** and record it in DESIGN.md as a v1.1 backlog. §5–§11.
11. **Campaign → 6 missions**: authored waves, varied objectives, Ferrite before Plate, the Commander from mission 1. §9.1.
12. **Hotkey fixes:** Shift = line-lock; P = pause only; Patrol and Hold on the grid; `?` = cheat sheet; drop F-key camera spots; Shift+N = call early; bind by `event.code`; guard inputs; clear modifiers on blur; preventDefault Tab/Alt/Space/middle-click/Ctrl+wheel; optional fullscreen + Keyboard Lock. §12.
13. **Dynamic view size** with integer scale and zoom, and HUD text drawn at screen resolution. §2.1, §11.6.
14. **Cap turret ranges at ~45 % of view width** (Railgun ~170, Mortar ~160, deployed Siege ~190), or show off-screen target arrows. §5.3, §6.2.
15. **Re-price walls ~4×** (or 3×3 bites) so one brush-8 stroke of Panel ≈ one Pulse Turret. §5.4.
16. **Fill every missing number in the data JSON before coding** (list in Top #10), plus friendly-fire rules: blasts hurt your own cells, reflected beams never hurt your own things. §5–§6.
17. **Economy floor:** Core trickles +2 C/s, and exhausted drills can be re-seated. §4.4.
18. **Orbital Lance → 40-deep crater, can't target within 60 cells of a Core.** Removes the Core-drop and map-split cheats. §7.
19. **Call Early** reward scales with the time left, and 3 early calls in a row trigger a surge. §10.1.
20. **Rival AI = slot-filling build orders + timing pushes**, no scouting or fog in v1. §10.2.
21. **Max game speed ×2**, one world canvas + dirty rects, IndexedDB saves with sparse HP. §13, §16.
22. **Auto-repair runs only between waves by default**, so wall damage during a wave matters. §5.4.
