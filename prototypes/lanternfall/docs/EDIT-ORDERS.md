# LANTERNFALL — Edit orders for pages 01–10 (canon v2)

> Instructions for the editors who update `01`–`10` after the review. Source of every decision:
> `REVIEW.md` (finding numbers R1–R92, brainstorm B1–B22) and `00-OVERVIEW.md` v2. Each page section below is
> complete on its own, so the ten pages can be edited **in parallel**: where two pages touch one fact, the
> **owners table (00 §3)** says which page writes it, and the other page links to it. Numbers that two pages must
> share are written out here once; both pages use exactly these.

## 0. Rules for every page

1. **Header.** Under the title add: `> Canon v2 — edited per EDIT-ORDERS.md (2026-09-26).`
2. **Parked appendix.** Nothing cut is deleted. Move it to a final section `## Parked (v2)` at the end of the
   page, grouped by subject, each block starting with the finding number that cut it (e.g. "Parked by R30:").
   Keep the text as it was; add one line saying what replaced it, if anything.
3. **"Proposed canon changes" sections** become `## Applied in v2`: one line per item saying what v2 decided,
   with the R number. Delete the old proposals.
4. **Owners.** Do not restate a fact another page owns (00 §3). Link to it: "see 03 §4". In particular: no key
   tables outside 02 (R18), no file lists or JSON field shapes outside 10 (R4), no NPC traits/voices outside
   01 (R24), no status numbers outside 03 (R20), no movement numbers outside 07 (R54), no melee frame data
   outside 04 (R55).
5. **Names and ids** are 00 v2's, verbatim. Act-map node ids are the new ones in §09 below; every page uses them.
6. **Plain language**, as the rest of the bible. No third-party IP in player-facing text; drop the nickname
   "Charon-that-isn't" (call Old Wenna "the ferrywoman").
7. **Engine facts are fixed**: the 36 materials in `data/materials.json`, `data/movement.json`, the room format
   (10 §6), the WebGL2 pipeline, the grid flags (`PINNED`, `BUILT`, `FROM_WATER`…). Write around them.
8. Shared numbers used by more than one page (use these exact values):

| Fact | Value |
|---|---|
| Metre | 1 m = 8 cells |
| Light tiers | `dark` < 0.2, `dim` 0.2–0.5, `lit` ≥ 0.5, `bright` ≥ 0.8; floor 0.08; `lightTier` (all light) vs `ambientTier` (without the player's lantern) |
| Oil in the dark (Act 4+, `ambientTier` dark) | regen 0; lantern burn 2.5 oil/s base (items 2.0–3.0), Draught −1%/pt (max −30%), hooded ×0.25 |
| Guild flask | 2 charges × 40 oil, refills only at lamp-posts (belt item, not a gear slot) |
| Overcharge | hold `cast`; unlocks Act 2 Charmwife's Niche (`a2_n06`); gutter on from the first charge |
| Mastery | one wick cannot gutter, full-charge hold 2.0 s; moved at any lamp-post |
| Burn-in | two tracks (flame, shape), 5 levels, +3%/level, 200 / 600 / 1,500 / 3,500 oil per track |
| Tallow (campaign) | 2 phases, 1,500 HP, wax wave telegraph 1,800 ms; P3 on `lampless` and Boss Rush |
| Awake liquid cap | ≤ 60,000 cells per scene; bigger water is height-field with a ≤ 8-row cell band |
| Save budgets | slot ≤ 64 KB, profile ≤ 16 KB, Long Descent run ≤ 16 KB, 3 slots + 1 backup, ≤ 420 KB |
| Rekindle | free post at the entry of puzzle / lesson / flood / trap rooms; pause-menu entry when no fight is live |
| Ferry health debt | cap 20% of max health, refunded in full at each Great Lamp |
| Act 1 grace | telegraph wind-ups ×1.25 and 1 melee attack token in Act 1, all difficulties |
| Trap kill XP | +50%, Ledger source "The Hollow" |
| Kindling | 8 flags (00 §11); Ending A needs `kindling ≥ 5` and `knows_keeper_rule` |
| Skill board | 12 nodes per class, opens Act 2; skill points +1/level from level 2 (banked in Act 1) + 1 per Great Lamp |
| Floodgate | 15 waves; enemy area level = player level + floor(wave / 5); roster from acts reached |

---

## 01 — World, story, dialogue

**Change**
- **R1, R40** §9.6 Act 6 beats: rewrite to 00 §12 (Last Wall `a6_n05` → Storm's Eye `a6_n06` P1–P3 →
  `cs_rain_stops` → Falling Flood `a6_n07` (3 rooms `a6_flood_1..3`) → Dry Root `a6_n08` → Dry Eye `a6_n09` P4 →
  choice). The "Falling Flood" paragraph: you fall, then climb the dry root (not "climb back up as water pours").
  §10.9 `cs_rain_stops` ≤ 12 s, ends mid-fall with control returned.
- **R2** §11.1 Kindling: 8 flags exactly as 00 §11 (keep `tallow_cooled`, `pim_trusted`, `hollis_lantern`,
  `pale_kept`, `nell_alive`, `widow_mercy`, `corvin_freed`; add `knell_spared` = spare or knock out 10 Knell,
  surrenders count from Act 2, Marl names it as his deal in Act 5; it replaces `marl_deal` and 05's `mercy`).
  §11.2 prompts unchanged; Ending A needs `kindling ≥ 5`. `vane_journal_*` pages are lore only.
- **R15** §11.7: Ending C's reward becomes a cosmetic lantern skin "Lanternfall"; "any ending → NG+" deleted;
  Boss Rush entry for Ossery stays.
- **R22** §6.4 is the only boss voice/manner table; add a **boss lines table** (opener, one per phase, death)
  with line ids that 05 references. 01's lines win over 05's.
- **R23** §6.2 roster: voice roles become `npc_aldra` elder f, `npc_odile` merchant f, `npc_hollis` merchant m,
  `npc_seld` priest m, `npc_pim` child f, `npc_brisket` villager f, `npc_nell` ranger f, `npc_wenna` elder f,
  `npc_voss` mage m, `npc_unna` cleric f + underwater fx, `npc_mothwife` mage f + fx, `npc_marl` cultist m,
  `npc_merrit` stormcaller f, `npc_corvin` elder m. Bosses: Tallow cultist, Bellfather brute, Ossery
  stormcaller, Gnaw babble, Widow stolen voices, Sluicemaw none. Say that `elder`, `merchant`, `priest`,
  `child`, `cultist`, `brute`, `stormcaller` are **added** to `shared/voices.js` in M10.
- **R24** every trait/tic in 01 must be one of the 25 real traits / 14 real tics (01 §6.1 already lists them);
  01 is the only page with NPC personalities.
- **R25** Odile: her comment is the `spell_taste` pool, intent id `odile_names_wick`; the name itself comes from
  08's dish-name rule; any visit, free, no burn-in gate.
- **R26** Crane: memory type `sold_item`, recall intent `pawn_recall`, mood = Lingo `opinion()`.
- **R27, R35** beats: remove strand-drop claims (09's table owns them); A1.3 Candlemarket gives Rime **and lob**;
  A1.6 no Spark (Spark is Act 2, Pickering's Lockhouse); Bile Act 2 Brickgut; Gleam guaranteed Act 4 Last
  Derrick; Shade Act 4 Hanging Houses. A1.5 Gullet Chimney merges into the Drip Gallery (Pim is met there).
  A1.8 Seld's confession moves to room 1 of the Tallow Chapel (`a1_n08`). A1.11: the relight grants the class
  ability; **Aldra** announces Floodgate and the Trials (Hask is parked).
- **R63** §12.8 rule 4 becomes the one bark table: 6 s per enemy, 1.5 s global, 6 s per room, 2 enemy bubbles,
  3 voices.
- **R65** A1.0/A1.1: class pick happens on the menu before `cs_opening`; Aldra hands over *a* pole-lantern.
- **R70** the Drowned Market is one stall (`a3_n05`), Sister Unna speaks, and it is the Mothwife's pearl shelf.
- **R76** add one **hint line** per Kindling flag (who, where, intent id) and the Journal list "People you could
  still help".
- **R77** §12.6: bark pools pre-render at room load, cached per act; the "skip if > 30 ms" path is a fallback.
- **R82** add a short "hubs as the showcase" subsection: per hub, idle chatter pools, 1–2 `converse` pairs,
  memories of your deeds.
- **R87** note: hubs are sanctuaries (NPCs ignore damage).
- §2.1 point 5 and A6.3: the Lamp Bands are cosmetic coloured bands at Act 6 lamp-posts; no climb segment is
  removed.
- §7 Hush: keep; Act 1 larva squeaks at breakable walls and secrets (not bells); Act 4 perch 12 s / 40 s
  cooldown (B20); Act 6 carries you 60 cells once per room in the Falling Flood.
- §8 Narrator: lore plaques 60 → **24**; it also reads the Rekindle remark (B8) and the first trap kill (B6).
- §10 cutscenes: **6** — `cs_opening`, `cs_relight` (one template, per-Lamp lines, used 5 times), `cs_rain_stops`,
  `cs_end_a`, `cs_end_b`, `cs_end_c`. Act arrivals become Narrator title cards (1–3 lines over a still);
  `cs_voss_door` becomes a hub moment; the rim montage is a talk sequence at `a6_n05`.
- NPC locations move to new node ids: Pim `a1_n06`, Nell `a2_n01` (hunt `a4_n06`), Wenna dock `a2_n01`, Voss
  `a3_n02`, Unna `a3_n05`, Mothwife `a4_n01` (shelf at `a3_n05`), Marl `a5_n02`, Pim's letter `a5_n06`, Merrit
  `a6_n01`, Corvin `a6_n04`.
- §12 Lingo: new intents ≤ **12**; lexicon trimmed to what the 14 NPCs, 30 monsters and 6 bosses use.
- §13 data files → one line linking 10 §5.0. §14 build order → link to REVIEW §d.

**Park** (to `## Parked (v2)`): §4 Silent Bells (R69); NPC entries for Pask, Hask, Dobb, Rennet, Clink, Pickering
(the place keeps his name), Cantor Ebb, Ada Fennick, Ser Kell, Mag Oarly, Jory Wickett, Lune, Osk Tamberlane,
Hallow Dunmere, and their beats (R7); flags `ebb_forgiven`, `ada_mother`, `jory_shared`; Ending D and B2;
act-arrival cutscene scripts; 36 lore plaques; the Lamp Bands as a climb mechanic; Rootwarden lines.

**Add:** the hint-line table (R76); the boss lines table (R22); the voice-role mapping (R23); a two-line note on
`knows_keeper_rule` (Pim's letter at `a5_n06` or Merrit at `a6_n01`).

---

## 02 — Controls and UI

**Change**
- **R18** §2–§3 final bindings: `cast` mouse left / RT; `pole` mouse right / West; `dodge` `Q` / East; `jump`
  Space / South; `interact` `E` / North; `class_ability` **`R`** / tap LB (hold LB stays the tool wheel);
  `inspect` **hold `Tab` in play** / hold View; `grapple` `F` / RB; `build_mode` `G` / tool-wheel wedge;
  `wick_builder` `B`; `wick_1..4` `1`–`4`; wheel = next/prev wick; belt `Z X C V`; `quick_heal` `H`; `hood` `Y`;
  `gravity_lantern` `T`; `character` `P`; `skills` `K`; `journal` `J` (pad: a tab of the map screen);
  `ledger` `L`; `map` `M` / View tap. Build-mode context: `1`–`8` pick parts, wheel / LB·RB rotate **45°**,
  `cast` places, `pole` cancels. Add a line: `data/bindings.json` is generated from these tables and
  `js/core/input.js` is re-pointed at it in M5 (the built defaults swap cast/pole and use other screen keys).
- **R16** delete `overcharge_mod` on `R`; overcharge = hold `cast`, unlocks at `a2_n06`. Accessibility option
  "Overcharge needs a key" = hold `Shift` + `cast` / LT.
- **R19** build mode runs at full speed; remove the "Build-mode time scale" row from §10.1; add accessibility
  setting "Slow time while building" (35%, default off).
- **R15** §10: three difficulties `wicklit` / `lamplighter` / `lampless` + Iron Wick toggle; add a row "Mother
  Tallow's third phase: no / no / yes"; note the Act 1 grace (05 §2.3) applies on top. Drowned paragraph → Parked.
- **R35** unlock column: `wick_builder` and `wick_2` at `a1_n03`; `build_mode` at `a1_n06`; `class_ability` at
  the Act 1 relight; `grapple` Act 2 start; `skills` screen opens at Act 2 (Act 1 shows banked points); overcharge
  `a2_n06`; `wick_3` Act 3; `hood` Act 4; `wick_4` and `gravity_lantern` Act 5.
- **R17** builder: the mastered wick has a gold border; "move mastery" is a lamp-post menu action.
- **R25, R38, R44** §15: Odile names wicks from her shop screen any time; readouts show **two** burn-in bars
  (flame, shape); changed-meaning notes only for split, bounce, echo, volatile.
- **R26** delete "Haggle (H)"; Crane's panel shows his opinion of you as a mood face.
- **R30** class select (§9): five classes; locked cards show progress for Chimneysweep and Moth Oracle only. Add a
  lamp-post menu entry **"Answer the call"** that appears at the next act hub after an unlock.
- **R31** §23.2 quirk extras for the five shops only; Crane's frame gains Parts and Temper tabs; the Mothwife's
  frame has a Pearls shelf when opened in the Drowned Market.
- **R32** §14 paper doll: 5 slots (`lantern`, `weapon`, `coat`, `boots`, `trinket`); the oil flask is a belt item
  with 2 charges; hood is only an action.
- **R64** §8: 3 slots + 1 backup each; Ledger history 50 rooms.
- **R74, R75** no menu timers; breath pauses in menus; Ferry health payments show the 20% cap and "refunded at the
  next Great Lamp".
- **R76, B15** Journal: "People you could still help" page; "Wick Book" page (named wicks, wick codes to copy).
- **R78** §11.1 HUD anchored to edges (`left/top/right/bottom` + offset); tests at 427×240, 512×288, 640×360.
- **R88** §15: 4-step skippable guided overlay the first time the builder opens.
- **R92** §27: desktop + gamepad only; a phone card; menus still pass a 390 px layout test.
- **B14** §12 minimap: the flood clock (rising line on the edge + seconds) during flood nodes.
- **B6** §17 Ledger: a source row "The Hollow" for trap and world kills; combos as sources.
- Small items: §19 lists "Physics detail" and "Brightness floor"; "Lamp shrine" / "rest point" → lamp-post;
  pause menu gains "Rekindle this room" (greyed during a fight); level-up popup says skill points are banked in
  Act 1.
- §5.1 `bindings.json` shape → link 10; §28 tests keep `bindings.test.js` (it also checks that no other doc page
  prints a key table).

**Park:** Drowned difficulty; save-card NG+ button; jukebox; class-select hood × coat × lantern combinations
beyond palette swaps; tool-wheel wedges and screens for parked content (Silent Bells tracker, Bell Tithe, sets).

**Add:** "Answer the call"; Rekindle in the pause menu; flood clock; Wick Book; the accessibility options above.

---

## 03 — Spells

**Change**
- **R16, R17** §9: input is hold `cast` (no `R`); unlock `a2_n06`; safe line 1.40 (+0.10 from `ll` board node if
  04 keeps it; the steady and "mastery step" bonuses are gone); §9.4 mastery = one wick, no gutter, 2.0 s hold,
  moved at any lamp-post.
- **R20** §4 is the one status table. Canon list: `burn`, `chill`, `frozen`, `numbed`, `thawing`, `shocked`,
  `corrode`, `radiant`, `soaked` (absorbs `wet`), `drained`, `dazzled` (new: Gleam hit on an Unlit, flee to dark
  2 s), `dimmed` (player only), `staggered`, `knocked_out` (the last two defined here, numbers from 04's poise
  rules). 03's numbers win over 05's.
- **R21** §14.1: allow `weak2` (−100) and `heal`; percent everywhere; bosses immune to ≤ 2 flames.
- **R27** §15.2 → one paragraph: "09's strand table says where; every canon strand is guaranteed by the end of the
  act it arrives in (00 §6.2)."
- **R28** add the **dry Tide** rule: a Guild-braided Tide wick before the Act 3 lesson pushes, soaks and knocks
  back using existing water, cannot create water cells.
- **R35** §15.1 slots table rewritten from 00 §6.2 (slot 2 at `a1_n03`, charm slot 1 at `a2_n06`, slot 3 + charm
  slot 2 Act 3, knot slot Act 4, slot 4 Act 5, charm slot 3 + mastery Act 6; no overcharge in Act 1).
- **R37** §5.1 new numbers: ring mult 1.30, oil 10; arc mult 1.10, oil 8; beam 0.30 per tick, 20 oil/s; wave mult
  1.25; tether: one tick per enemy per 0.5 s, 1 oil/s upkeep, default life 12 s. §17: add the **utility score**
  column and an uptime model for tether/beam.
- **R38** §10 burn-in: two tracks per the shared table; Strand Dust seasons one track.
- **R44** §6–§7: 8 charms (`split`, `bounce`, `heavy`, `swift`, `linger`, `seek`, `echo`, `volatile`); the
  charm × shape table keeps bans plus changed meanings for split, bounce, echo, volatile only. §8 knots:
  `on_hit`, `on_kill`; depth 1 only. §13 combos: the 8 kept ones. Every combo product must be a built material, a
  grid flag or a zone: `blessed_water` becomes a 20 s healing **field** over the water (not a material);
  `mud_trap` turns `mud` to `dirt` with Frozen enemies inside; `glassblow` uses `molten_glass` → `glass`.
- **R60** §12.1 material reference = the 36 built materials; map old names (slag → rust, gravel → rubble, soot →
  ash, frost → ice skin, lampstone → `PINNED` cells: no flame affects them, void/flesh/poison/black water gone).
- **R61** §20 the compiled program is canon (10 lists the files).
- **R79, R80** §17.2 sim gains the physics set (pool, oil slick, wood wall, 160×90, real cell code); turret shots
  never trigger knots.
- **R25** §16.2 naming → link 08's dish-name rule; delete the burn-in-5 gate.
- **B4** Shade gutter "lantern out 3 s" now uses the last-drop relight rule (06/07).
- §18 example builds: keep 10 that use only ship parts.
- §19 JSON → keep value tables, move shapes to 10.

**Park:** charms `pierce`, `vast`, `siphon`, `steady`; knots `on_timer`, `on_land`; knot depth 2 (`mo_c7`,
`knot_twicetied`); §15.4 relic strands incl. cursed; combos 6–16, 19 (void rift, thermal crack, scald, toxic smoke,
conductor, brittle, static frost, black water, sunfire, undertow, floodspark, grease fire); 14 example builds.

**Add:** dry Tide rule; `dazzled`; utility score; the combo-product rule.

---

## 04 — Classes and progression

**Change**
- **R30** five classes (00 §7); §11 Ferrywitch, §12 Bellringer, §13 Drowned Knight → Parked. Add the **class
  switch** rule: at the next act hub lamp-post ("Answer the call"): same level; attributes reset to the new
  class's 25-point spread plus (level − 1) × 3 unspent; skill points refunded; strands and wicks kept; the new
  class's two starting wicks granted; gear kept (off-class weapon −20%).
- **Boards (R7, R35):** 12 nodes per class: three branches of four (tier 1, tier 2, tier 3, capstone). Tier 1–2
  nodes up to 3 ranks (1 and 2 points per rank), tier 3 one rank (3 points), capstone 4 points and needs 5 points
  in its branch; one capstone at a time. Pick each class's 12 from its current 24 (keep the three capstones).
  Board opens in Act 2; skill points bank from level 2. The Tinker's board includes **Hijack** (B7: pole-hit a
  trap to take its trigger for 20 s, fired with `class_ability`).
- **R28** §6.2 Sluicewarden: Rime Wave / Tide Arc (dry until Act 3, rule in 03). Every class also owns `ember` +
  `bolt`. Class abilities unlock at the Act 1 relight.
- **R29** §16.5: delete the 2 s Widow rule and its test; the snuff never counts (05 exemption); hooding is not
  "out". Add the alternative unlock: bronze in `trial_hooded_crossing`.
- **R52** §16.6: 2,000 m = 16,000 cells; alternative: bronze in `trial_rope_gauntlet`.
- **R55, R56, R57** 04 owns melee frame data, `subduable`, pogo 24; class movement traits live here (07 §2.16 is
  deleted); everyone wall-jumps, Chimneysweep adds wall-run.
- **R54** §2 shared body: movement rows link to 07 / `movement.json` (coyote 0.10 s, buffer 0.12 s, fall rule
  160 / 5% per 20 / cap 60%).
- **R36** §2 and §5: oil regen `3.0 + 0.1 × Draught` except 0 in the dark (shared table); `darkBurn` per shared
  table; melee +1.5 oil per hit unchanged.
- **R83, R84, R85** one table in §2: enemies do not block; contact damage only from `contact` attacks;
  i-frames 600 ms after a hit, hurt state 0.2 s at 30% control, wall stagger above 160 cells/s knockback;
  hit-stop 2 ticks heavy/crit, 4 ticks boss poise break, 0 on DoT.
- **R35** dodge (roll, 180 ms i-frames) from the start; heavy + plunge/pogo from `a1_n06`; Act 1 level-ups give
  attribute points only.
- **R15** §19: ids `wicklit` / `lamplighter` / `lampless`, table in 02.
- **R75** §18: Ferry max-health debt capped 20%, refunded at each Great Lamp; prices in 08.
- **B6** §17.2: trap/world kills +50% XP.
- **B21** perfect dodge (last 100 ms before a hit): rain freeze 0.2 s + rim flash; no stat bonus.
- §5 derived stats: remove hood-slot sources; `lightRadius` = lantern item × (1 + light%) (06 applies oil %).
- Might's "carry" = tonic capacity and plank capacity (02 §29.1 confirmed).
- §20 builds: five classes. §21 JSON → link 10 (values stay here).

**Park:** Ferrywitch, Bellringer, Drowned Knight (sections, challenges, builds); the 12 cut nodes per class;
24-node board layout; NG+ level cap rule.

**Add:** class switch rule; the one hurt/contact/hit-stop table; trial alternatives for both challenges; Hijack.

---

## 05 — Bestiary and bosses

**Change**
- **R7** roster = 00 §10's 30 ids; spawn tables per act re-weighted to them. Knell: novice, hookman (Act 2+),
  lampbreaker, maulbearer (Act 5+). Unlit: creeper, hound, stalker, wickthief.
- **R7** minibosses: keep §18.2 Sewer-King (add: the grate drop is taught as a trap kill), §18.3 renamed **The
  Drowned Lockmaster** (`mb_lockmaster`), §18.4 Lamp-Eater Matriarch. Miniboss drops: relic (08) + pennies; keys
  only if 09's edges need them.
- **R42** §19 Tallow: campaign P1 + P2, 1,500 HP; no Tallow Embrace grab, no Last Pour; wax wave telegraph
  1,800 ms; §19.7 Phase 3 labelled "Lampless and Boss Rush only".
- **R41** §22.7 Widow P3: no healing from beam/ring/rune; takes +25% from bolt and lob. §24 Ossery: Rain Mantle
  40%, dropped for 5 s by any Ember/Rime/Shade counter-hit; wick-steal replaced by "copies your selected flame's
  colour for his next attack". §23 Bellfather: wide view + vertical follow, each band's state on screen ≥ 700 ms
  before it acts.
- **R1, R2** §24: P1–P3 in arena `a6_storm_eye` (node `a6_n06`); §24.8 becomes the hand-off to `cs_rain_stops`
  (01) and the Falling Flood chain (09), no in-arena cinematic; §24.9 P4 happens at `a6_n09` The Dry Eye (same
  arena, dry, platform crumbling as written); delete the Plea and the death branch: at 10% the fight freezes into
  01 §11.2's choice. Rename "the Warden's Loom".
- **R2** §16.1 Knell surrender: sparing or knocking out counts toward `knell_spared` (01); no `mercy` counter.
- **R20** §5: only AI reactions to statuses; numbers link to 03. `wet` → `soaked`.
- **R21** resist tables in percent with `weak2`/`heal` allowed (HEAL stays for Unlit shade and Tallow ember, etc.).
- **R22** §19.11–24.14 "Lines": replace text with line ids from 01's boss lines table; voices link 01.
- **R15** §2.4 → link 02's table; keep only boss notes (Tallow P3 on `lampless`). `drowned` → Parked.
- **R43** §2.5 Waves/Endless scaling: Floodgate area level = player level + floor(wave / 5).
- **R46** §15 Unlit and §14 Moth Oracle references use tiers: Unlit see the player at full range only when the
  player's `lightTier` is `dark`, else within 24 cells; take `lightBurn` in `lit`, dissolve after 3 s in
  `bright`; path cost ×8 through `lit`. Rats avoid `lit` once the Gutter Lamp is relit.
- **R51, B5, B12** new §6.2: traps hurt monsters; **lure rule** (within 120 cells, path to a thrown light or loud
  noise for 4 s); **burning panic** (burning enemies run, spread 1 burn stack/s to enemies they touch).
- **R72, R89** transitions switch to wide view by a cut; add a `camzone` column to each boss: Tallow lock, Gnaw
  lock, Sluicemaw wide, Widow lock, Bellfather wide + vertical follow, Ossery wide.
- **R73** Fatberg Engulf, Tallow Embrace (parked anyway), Widow Cocoon: end in 1.5 s; dodge, Ember or pole hit
  frees early; no mashing.
- **R83, R86** §6: soft separation between enemies; §7: enemies placed at room load, only hatches and ambushes
  spawn later with a 500 ms sound; Unlit and `mod_relentless` follow through exits per 06's transition rule.
- **B1** §2.3: Act 1 grace (telegraphs ×1.25, 1 melee token).
- Boss attack budget: ≤ 7 attacks per boss (Tallow 5 in the campaign, +2 in P3), Ossery ≤ 9. Every boss keeps ≥ 1
  void zone. Remove every "Drowned only" row.
- §17 elite modifiers: keep the 8 in 00 §10.
- §18.6 Rootwarden's "lever route" line goes with the Rootwarden.
- Music beds (§25/§26): "each boss has a pulse layer in the score (10)"; sfx ids stay.
- §27 data format → link 10; values stay.

**Park:** the 21 cut monsters (00 list in REVIEW §c), 6 elite modifiers, Wickwright, Carillon, Rootwarden,
Dunmere's fight, Tollkeeper's recall bell, Knell Cantor, all "Drowned only" attacks, Tallow's grab and Last Pour
(kept as data for later), the `mercy` counter.

**Add:** lure rule, burning panic, camzone column, boss attack budget line.

---

## 06 — Physics and rendering

**Change**
- **R11** §20: write the measured numbers (headless, software GPU: 1024×544, 56k water + oil/sand/fire/rain →
  1.4–1.8 ms sim/tick, 0.5 ms render CPU, 20–150 chunks awake); the p95 budget from 00 §13; **single thread**
  stated as a constraint; the 60,000 awake-liquid cap. §8.7 and §21: the Falling Flood is authored to the cap.
- **New §8.9 Height-field floods**: a level per room (or per column band) with ≤ 8 rows of real water cells at the
  surface inside the sim window; below it the body is drawn by the water shader and counts as water for entities
  (swim, breath, soak) via the level. Used by Floodgate, the Long Descent floodline, the Sluicemaw reservoir,
  the Spillway and the Falling Flood. Rise/fall speed in rows per second; `release(region)` for Act 6.
- **R12 New §8.10 Current zones**: `current` thing (rect, vector cells/s, strength 0–1, optional wire). Pushes
  entities (player 60%, Sluicewarden immune), floats and loose cells (liquid/powder cells in the zone prefer the
  vector's side move). Cell water is cosmetic for flow; gameplay flow is zones.
- **R13 New §10.7 Gravity bands**: bands move entities, fragments, particles and rain; cells inside a flipped band
  are **held** (skipped by the passes, woken on flip back); bands snap to 8-cell rows.
- **R45, R46** §14.7 rewrite: CPU light grid at 1/8 resolution, same light list, falloff and opaque test as the
  shader, updated every 4 ticks; tiers and the two readings (shared table); floor 0.08; the GPU map keeps drawing;
  a test-only async readback checks ≥ 95% tile agreement.
- **R50 New §19.5 Room transitions**: fade out 0.25 s, load, fade in 0.25 s; followers (Unlit, `relentless`)
  arrive at the entry after 1.5 s with a sound cue; a room that starts mid-flood loads at its height-field level;
  the compiler places liquids level and powders supported, and `room-check` fails a room that needs > 30 ticks to
  go quiet. Delete the 120-tick settle.
- **R9 New §25 Art formats**: the art plan of 00 §4 in full (sprite ASCII format, palette keys, frame counts,
  part rigs in `rigs.json`, per-part telegraph glow, gear overlays, portraits, Tallow's wax body).
- **R33** §17 Canvas2D: flat colours, no lights, no reflections, test/debug only; the "needs WebGL2" card.
- **R58** §14.2 lantern radius = the item's value (08) × oil-% factor in Act 4; hood 18.
- **R59** §11.2 rain density by act 60 / 70 / 90 / 110 / 130 / 160; 0 after `cs_rain_stops`.
- **R60** §5.2: the 36 built materials are the list; add the alias table (REVIEW R60) and the rule "new ids
  append from 36". `lampstone` = `PINNED` + brass rim (drawn in the overlay pass so it reads in the dark).
- **R72** §19.4: boss transitions cut to wide view; camzones live in 05.
- **R81** §15 intro: the three water tricks (surface ripples, pour/jet particles, height-field floods) and one
  showcase room per act.
- **B3** §14.6 relight sweep (3 s ambient-ramp wave down the district, puddle pulse). **B4** last drop: when
  the lantern goes out its light collapses over 0.4 s. **B8** Rekindle shimmer (cells stream back over 0.6 s,
  visual only). **B21** rain-streak freeze 0.2 s on a perfect dodge.
- §23 build order → link REVIEW §d; §24 → Applied in v2.

**Park:** Canvas2D parity; an up-falling cell pass; Worker/`postMessage` ideas; offline settled-cell caches;
250k-cell Falling Flood.

**Add:** §8.9, §8.10, §10.7, §19.5, §25.

---

## 07 — Traversal, interactables, traps, building, puzzles

**Change**
- **R5** §6: rewrite in 10's syntax (`wires: [{from, to, do, when}]`); gates become `logic` things with kinds
  `timer`, `latch`, `toggle`, `counter`, `sequence`, `compare`, `any_of`. 07's type names are canon (10 adopts
  them). Timed door 4 s.
- **R6** §2.1: powders are solid (as built), loose top layers slow ×0.7, step-up 2 / 3 / 4.
- **R10, B8, B9** new §9.5 "Recovering a room": `PINNED` cells + brass rim; the Rekindle post (diegetic Guild
  lantern; free; prefab state kept; killed enemies stay dead; dropped items go to `lootSafe`); the pause-menu
  entry; the `room-check` single-flame rule; P1-1 First Step shows Ember failing on brass-rimmed wood.
- **R12, R13** §2.14 currents → zones (06 §8.10); §2.15 gravity bands → entity-only, cells held (06 §10.7).
- **R18** delete the key references in §3.1 and §9.1 (link 02).
- **R19** §9.1 build mode: full speed, 4×4 grid, 45°, part sizes as written (plank 24×2, 2 scrap); slow-time is
  an accessibility option (02).
- **R3** §9.1 persistence: built parts persist as a part list (position, rotation, remaining cells); a burned
  plank does not persist (cells reset on re-entry).
- **R27** P1-2's solution uses bolt **and lob** (lob granted in the lesson); P1-6 Spark lift moves to Act 2.
- **R48** §3.4 player hook = wrap list (the old `rope.simple`, now default); verlet for level ropes and tethers.
- **R49** §11: puzzle tests are solution scripts in verbs; replays only for determinism.
- **R51, B5, B13** §8 traps hit anything; add the `trap` room tag (2–3 per act from Act 2) and a `trap` row in
  §10.7's index; the Lockhouse lesson (`a2_n03`) teaches a crusher kill; oil barrels: pole-pierce the leak and
  `interact` to refuel 20 oil, or ignite it.
- **R52–R57** 8 cells/m; fall rule from `movement.json`; 07 owns movement numbers; melee → 04 (keep tool uses);
  delete §2.16; wall-jump for everyone.
- **R60** parts use built materials: `plank` for plank/brace/crate/ladder/float, `rope`, `metal`; the sandbag is a
  prefab holding `sand` cells (burning its frame spills them); a fuse is a `rope` run with an end probe.
- **R73** snare net parked; no mashing anywhere.
- **R80** turret shots never trigger knots.
- **R87** hubs are `sanctuary` zones: no building, spells change no cells.
- Small: interact range **12**; ledge-grab is automatic; slide/crawl available from the start, never required in
  Act 1.
- **Ship lists:** interactables (18): `lever`, `button`, `target`, `plate`, `valve`, `sluice_gate`, `timed_door`,
  `door`, `portcullis`, `light_door`, `spark_coil`, `lift`, `bell`, `breakable_wall`, `gravity_lantern`,
  `oil_barrel`, `lamp_post`, `lamp_socket` (+ `crate` as a physics object; zones `current`, `gravity_band`,
  `sanctuary`, `nobuild`). Traps (10): `trap_spikes`, `trap_icicle`, `trap_pendulum`, `trap_crusher`,
  `trap_darts`, `trap_flamejet`, `trap_ratpipe`, `trap_sparkpuddle`, `trap_waxdrip`, `trap_tollrubble`. Parts
  (8): `bp_plank`, `bp_brace`, `bp_crate` (Act 1), `bp_ladder`, `bp_rope_peg` (Act 2), `bp_sandbag`, `bp_float`
  (Act 3), `bp_lantern_post` (Act 4); Tinker: `bp_turret_1`, `bp_spikes`.
- **Puzzles:** 20, 3–4 per act, re-homed to the new node ids (§09 below), each with a solution script; P4-5 uses
  `on_hit` instead of `on_timer`; P6-5's "overcharged Spark charges" cut.

**Park:** the other 15 interactables, 12 traps and 9 parts (REVIEW §c), 19 puzzles and every puzzle in a parked
node, Silent Bell interactions (R69), dynamo and flow-reading machines, pulley/counterweight building.

**Add:** §9.5 recovering a room; the trap-room tag; oil-barrel refuel; the ship lists above.

---

## 08 — Items and shops

**Change**
- **R32** §3 slots: `lantern`, `weapon`, `coat`, `boots`, `trinket` (one each). §4 rarities: `common`, `fine`,
  `rare`, `relic`; item level scales affix values (no tiers). §5 bases: 30 (lanterns 6, weapons 10 = 2 per ship
  class, coats 5, boots 5, trinkets 4). §6 affixes: 12, on loot from Act 2 (Act 1 = plain bases). §7 relics: 8 —
  `relic_tallow_heart`, `relic_choir_bone`, `relic_maw_tooth`, `relic_widow_veil`, `relic_bell_clapper`,
  `relic_mb_act3` (Floodgate Seal, from the Drowned Lockmaster), `relic_mb_act4` (Lamp-Eater's Lung), `relic_first_lamp`
  (Beneath the Crown). The Sewer-King drops pennies and a rare chest. Tempering only (+1…+5) at Crane's.
- **R36** §3/§9: the oil flask is the Guild flask (belt, 2 × 40, refills at lamp-posts only); `lamp_oil` stack 10;
  oil blobs 10% (standard) / 25% (heavy, elite); lantern dark burn values 2.0–3.0 base; §19 target "oil spend
  share 20–30% in Act 4".
- **R31** §16: five shops (00 §14). Scrapwright's stock and tempering move into Crane's Pawn; the Drowned Market
  (`a3_n05`) is the Mothwife's pearl shelf, kept by Unna, priced in pearls.
- **R24** keepers are `npc_*` ids only; delete traits, voices and catchphrases from 08.
- **R25** §16.1 naming: keep the dish-name rule (deterministic); comment via 01; free, any visit; drop the
  "+10% burn-in on superb" bonus.
- **R26** §16.2: price = base × a factor from Lingo `opinion()` (keep the formula, delete the 7-row mood table
  and 3-step haggle); memory type `sold_item`.
- **R70, R74, R75** one Drowned Market; no menu timers (breath pauses); Ferry debt cap 20%, refund per Lamp.
- **R71** Scroll of Rebraiding cut.
- **Consumables (12):** 3 tonics, `lamp_oil`, 3 bombs (ember, rime, spark), 1 cleanse, 4 meals (Soup Barge only)
  + the mystery bowl.
- §12 keys and quest items: `great_wick_act1..6`, `hollis_brother_lantern` (quest), and only the keys 09's edges
  need. §13 currencies: `pennies`, `pearls`, `marks`; marks buy the 10 Guild Hall unlocks. §14 loot: ≤ 20 tables
  (per-act tiers + chests).
- §20 JSON → link 10; §21 tests trimmed to ship content.

**Park:** hood and second trinket slots, the flask slot, sets (§8), affix tiers, blessings, reforge/recast/add-affix,
relic rerolls, 10 of 18 uniques, gadgets (§18.3), scrolls, 10 dishes, the Bell Tithe (§16.7, with R39's fix
noted), Scrapwright as a shop (§16.6), §17 roaming and secret merchants.

**Add:** the 12-consumable list; Crane's parts + temper tab; the Drowned Market shelf rules.

---

## 09 — Campaign map and modes

**Change — new act maps.** Replace §6.1–6.6 node tables with these (old ids in brackets; `|` = branch; keep each
old node's contents where it survives; everything not listed goes to Parked). Node types in use: `hub`,
`lesson`, `fight`, `puzzle`, `event`, `elite`, `flood`, `lamppost`, `boss`, `secret` (types `shop`, `treasure`,
`trial` retire; trial doors sit inside nodes).

| Act | Nodes (new id — name — type [old]) | Edges |
|---|---|---|
| 1 | n01 The Guild Hall hub [01] · n02 The First Step lesson [02] · n03 Candlemarket lesson (Rime, lob, slot 2) [03] · n04 Chandlers' Lane fight [04] \| n05 The Slate Roofs fight [09] · n06 The Drip Gallery lesson + lamp-post (plank kit, Pim, Hush) [08 + 07] · n07 The Melting Stair flood [14] · n08 The Tallow Chapel boss (room 1 = antechamber lamp-post, Seld's choice) [12 + 16] · n09 Beneath the Crown secret (grapple revisit, `relic_first_lamp`) [18] | 01→02→03→{04,05}→06→07→08; 01▒09 (grapple) |
| 2 | n01 The Dripmarket hub [01] · n02 Hookwright's Forge lesson (grapple, tether) [02] · n03 Pickering's Lockhouse lesson (levers, doors, Spark, trap kill) [03] · n04 The Long Chain fight (rope run; Rope Gauntlet door) [04] \| n05 The Brickgut puzzle (Bile; Gutter Cistern) [05 + 10] · n06 The Charmwife's Niche lesson + lamp-post (charm slot 1, split, overcharge) [11] · n07 The Crank Room elite (Sewer-King) [12] · n08 The Gutter Cathedral boss [16] · n09 Rat-Pipe Warren secret (`hollis_brother_lantern`) [08] | 01→02→03→{04,05}→06→07→08; 05┊09 |
| 3 | n01 The First Cistern lesson (swim) [01] · n02 The Pumpworks hub (sluices lesson room, Tide, slot 3, charm slot 2) [02] · n03 Cistern Row fight (Pacifist Sluice door) [03] \| n04 The Long Channel fight (currents) [05] · n05 The Drowned Market event (Unna, pearl shelf, valve choice) [07 + 13] · n06 The Three-Lock House elite (Drowned Lockmaster, linger) [12] · n07 The Spillway flood [15] · n08 The Great Reservoir boss [18] | 01→02→{03,04}→05→06→07→08; drain choice opens 05→08 |
| 4 | n01 The Last Derrick hub (lesson room: oil & darkness, hood, Gleam; Mothwife) [01] · n02 The Knot House lesson (on_hit, on_kill) [02] · n03 The Oil Pits puzzle [03, renamed] \| n04 Lampless Lane fight (Hooded Crossing door) [08] · n05 The Hanging Houses fight + lamp-post (Shade) [09] · n06 Stilt Town Hunt event (`nell_alive`) [10] · n07 The Wick Loft elite (Matriarch) [13] · n08 The Moth Nave boss (antechamber = Nave Steps) [16 + 15] | 01→02→{03,04}→05→07→08; 05→06→07 (side) |
| 5 | n01 The Nine Valves puzzle [01] · n02 The Tithe Hall hub (Marl, slot 4) [02] · n03 The Bellwright's Foundry lesson (gravity, bells, echo) [03] · n04 The Upside Chapel fight [05] \| n05 The Ring Galleries fight (Knell) [07] · n06 The Long Drop flood (bottom lamp-post: Pim's letter) [14 + 11] · n07 The Bellwell Bottom boss [15] | 01→02→03→{04,05}→06→07 |
| 6 | n01 Understar Well hub (Merrit) [01 + 02] · n02 The Empty Socket lesson (mastery, charm slot 3, wind) [03] · n03 The First Coil fight [04] \| n04 Corvin's Hollow event [07] · n05 The Last Wall lamppost [14] · n06 The Storm's Eye boss P1–P3 [15] · n07 The Falling Flood flood, 3 rooms, forced [16] · n08 The Dry Root fight, 2 rooms (new) · n09 The Dry Eye boss P4 + choice [17] | 01→02→{03,04}→05→06→07→08→09 (06 on forced) |

- **R1, R40** Act 6 as above; checkpoint: after `a6_n06` is won once, deaths in n07–n09 restart at the top of n07.
- **R7, R8, R67, R68** §3.3: delete the corrupted duplicate table; new room counts ≈ 2 per node, ~85 per campaign
  route; act first-time length **25–40 min**. §4: hand-authored rooms for hubs, lessons, puzzles, events, arenas,
  set pieces, trials (~55); **room kits** (`fight_small`, `fight_tall`, `shaft`, `bridge_gap`, `flooded_hall`,
  `corridor_run`) fill fight nodes (B10). `actgraph.test.js` minimum drops to 10 rooms per route per act.
- **R27** new §6.0 table: **where every strand and mechanic drops** (per 00 §6.2 and the nodes above; Bile also
  sold by Odile from Act 2; Gleam sold from Act 2; beam sold Act 3 / Sluicemaw reward; bounce/heavy/swift sold Act
  2; seek Act 3; volatile Act 5 shop/Bellfather reward). This table is the source 01, 03 and 08 link to.
- **R3** §4.3 / §5.4 / §8.2: room persistence = prefab state only (00 §13); "terrain you changed in finished rooms"
  row deleted.
- **R10** §8: Rekindle posts and the pause-menu entry; free.
- **R15** §8.2 penny loss 0% / 25% / 50%.
- **R30** class switch at the next act hub (link 04).
- **R34** §9 NG+ → Parked. §14 trials: 5 — `trial_first_flame` (door `a1_n03`), `trial_no_oil` (`a1_n01`),
  `trial_rope_gauntlet` (`a2_n04`, Chimneysweep), `trial_pacifist_sluice` (`a3_n03`), `trial_hooded_crossing`
  (`a4_n04`, Moth Oracle); all open after Act 1, each door needs its act's mechanic. §15 Guild Hall: 10 —
  `gh_satchel_row`, `gh_flask` (+1 flask charge), `gh_oil_1`, `gh_oil_2`, `gh_old_habits` (each burn-in track
  starts at 2), `gh_endless_start_wick`, `gh_floodgate_scrap`, `gh_trials_door_1`, `gh_boss_practice`,
  `gh_cos_lanterns`. §16 achievements: 20.
- **R42** §13 Boss Rush uses Tallow's three phases; Ossery = P1–P3 + a short P4 in one arena.
- **R43** §10 Floodgate: 15 waves, one arena (The Watch Cistern), height-field water, roster from acts reached,
  area level per the shared table, character = a campaign snapshot or a Guild kit at the highest level reached
  (min 5).
- **R90** "Lamp shrine" / "rest point" → lamp-post.
- **R91** §11.4: the floodline kills only by breath rules.
- **B16** §12 Daily is a Long Descent flag; result screen prints the share line (seed, class, wick code, score).
- §7 difficulty curve: area levels unchanged; rooms-per-route column updated; Act 1 grace noted (05).
- §17 data files → link 10; §19 build order → link REVIEW §d.

**Park:** every v1 node not in the table above (Act 1: 05, 06, 07's chimney room, 10, 11, 13, 15, 16's own node,
17; Act 2: 06, 07, 09, 13, 14, 15, 17; Act 3: 04, 06, 08, 09, 10, 11, 14, 16, 17; Act 4: 04, 05, 06, 07, 11, 12,
14; Act 5: 04, 06, 08, 09, 10, 11's own node, 12, 13, 16; Act 6: 02's own node, 05, 06, 08, 09, 10, 11, 12, 13,
18), NG+, 10 trials, 16 Guild Hall unlocks, 24 achievements, the Endless "Dry" variant, Floodgate themes per act.

**Add:** the new act tables, the strand/mechanic source table, the room-kit paragraph.

---

## 10 — Tech, data, room authoring

**Change**
- **R4** §5.0 is the **one manifest**. Files (owner of values in brackets):
  `materials.json` [06, built] · `legend.json` [10, built] · `themes.json` [06, built] · `movement.json` [07,
  built; add a `rope` block] · `bindings.json`, `difficulty.json`, `strings.json` [02] · `flames.json`,
  `shapes.json`, `charms.json`, `knots.json`, `statuses.json`, `reactions.json`, `combos.json` [03] ·
  `classes.json` (incl. movesets and abilities), `boards.json`, `progression.json`, `challenges.json` [04] ·
  `enemies.json`, `elite-mods.json`, `spawn-tables.json`, `bosses.json` [05] · `prefabs.json` (interactables,
  traps, build parts) [07] · `items.json`, `affixes.json`, `loot.json`, `shops.json` [08] · `acts/act1.json` …
  `act6.json`, `kits.json`, `modes.json` (waves, endless, daily, bossrush), `trials.json`, `guildhall.json`,
  `achievements.json` [09] · `npcs.json`, `story.json`, `districts.json`, `lore.json`,
  `grammar-lanternfall.json`, `events-lanternfall.json`, `../../lingo/data/packs/lanternfall.json` [01] ·
  `sprites.json`, `rigs.json` [06 formats, content pages' art] · `sfx-map.json`, `score.json`, `balance.json`
  [10 shape; knobs by owners]. Retired names: `skills.json`, `waves.json`, `acts.json`, `economy.json`,
  `rope.json`, `interactables.json`, `traps.json`, `build-parts.json`, `movesets.json`, `abilities.json`,
  `silent-bells.json`. One canonical example per file, copied from the owner page. Resist = percent; rarity
  `fine`; no `charm_ring`.
- **R5** §6.5–6.6: wiring = `wires: [{from, to, do, when}]` + `logic` things of the 7 kinds; thing types use 07's
  names (`sluice_gate`, `plate`, `grapple_point`, `trap_*`); add `current`, `gravity_band`, `rekindle`,
  `sanctuary` things/zones.
- **R8, R10, R49, R50, B10** §6.9–6.11: `room-check` errors on unreachable exits (bot with `movement.json` and the
  act's verbs), on > 30 settle ticks, and on puzzles whose solution script one flame can break; solution scripts
  in `puzzle.solution` as verbs; **room kits** in `js/world/kits.js` (used by the game for the Long Descent and by
  `tools/room-new.mjs`), parameters in `kits.json`. Compile pipeline: no 120-tick settle.
- **R66** fix both examples (no spawn in the lesson; `gutter_rat`; `npc_voss`); the examples test runs
  `room-check`.
- **R3, R47, R64** §7: `localStorage` via `shared/store.js`, budgets per the shared table, 1 backup per slot, a
  max-save size test; room state record = `{ prefabs: {id: state}, killed: [ids], built: [parts] }`; no cell
  diffs. Meter history 50 rooms. IndexedDB only above 1 MB (Parked).
- **R11** §1 principles: single thread; the 60k awake-liquid cap; §9.4 perf spec uses 00 §13's budget.
- **R14** §10: `js/audio/score.js` + `data/score.json` on the sfx engine's context; `music` and `voice` buses in
  Lanternfall's wrapper; no jukebox.
- **R18** §3.1: `input.js` reads `data/bindings.json` (M5 fixes the built defaults).
- **R23** §10.2: the voice bridge assumes the 7 added roles; the change to `shared/voices.js` is add-only and
  must keep Emberveil's and Farhold's tests green.
- **R33** §9.2: Canvas2D is the test/debug view only.
- **R61, R62** §3.5 lists 03's compiled-program files; §3.7 lists 05's AI files only.
- **R77** §10.1: bark pre-render per room, cache per act.
- **B17** §9: `tools/reach-check.mjs` (every module reachable from `main.js`, every data file loaded, every id
  referenced) runs in `npm run test:unit`.
- Small: Tide sounds use `spell.water.*` added through the Lanternfall sfx bridge, else `spell.nature.*`.
- §13 "Milestone 1 checklist" → replaced by a link to REVIEW §d.

**Park:** IndexedDB wrapper, Worker/`postMessage`, Canvas2D parity specs, offline settle caches, NG+ save fields.

**Add:** the manifest, room kits, `reach-check`, the room state record, score module.
