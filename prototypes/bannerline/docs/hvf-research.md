# Hunters vs Farmers — research (Claude-facing)

Status: research for owner items R2.12–R2.19, 2026-10-03. This page names third-party games and
maps on purpose (playground convention 9 allows it in Claude-facing docs only). Player-facing text in
the mode must use the original names chosen in `docs/hvf-PLAN.md`.

**How much is sourced.** The old custom maps were documented mostly inside the map (an F9 quest
log) and in forum threads, many of them gone. The web search found map listings, two forum reviews
and one blog review that give real detail (cited below). Where this page relies on my own memory of
how these maps generally played, the line is marked *(recollection)* and should be read as "very
likely, not verified".

---

## 1. The family of maps

Three related Warcraft III custom-map families share the "hide and build vs hunt" idea:

| Family | Hiders | Seekers | Core verb for the hiders | Who wins on the clock |
|---|---|---|---|---|
| **Sheep Tag** (many versions: Sheep Tag Pro, Perfect Sheep Tag, Sheep Tag Mod; a 2016 standalone *Sheep Tag 2* on Steam) | Sheep (≈6–8 players) | Wolves (≈2–3) | Drop farms as **walls** to seal corridors, leave sheep-sized gaps wolves can't fit through | Sheep, if any survive the timer (≈25 min) |
| **Farmer(s) vs Hunter(s)** (Warpetzz123's original, "R!", "!O5", "S2", "2020", "LEGACY MINI", an "AI" version by Iansdoor) | Farmers (≈5–7) | Hunters (2–3) | **Hide in the forest, build animal farms for income**, then build a base and an army | Farmers must kill all hunters before ≈40 min, or hunters (who must survive) win |
| **Sheep vs Wolves** variants | Sheep | Wolves | Both sides build farms and fight | Symmetric-ish |

The owner's spec ("farmers produce sheep that wander, hunters strong early and fall off, farmers
build attack units mid-game to hunt the hunters") is the **Farmer vs Hunter** family with Sheep
Tag's best ideas (walls with gaps, rescue of fallen teammates) folded in.

---

## 2. Farmer vs Hunter in detail

### 2.1 Setup and objective
- Typical 5 farmers vs 2 hunters ("R!" recommends 5v2); listings also show 6v2 and 7v3, 7–10 players.
  Map 128×128 (original) or 160×160 (later versions) WC3 cells, Lordaeron Summer (forest) tileset.
- Objective (Warpetzz123 listing): *"FARMERS hide first then kill all HUNTERS within 40 mins;
  HUNTERS kill farmers then must survive the whole 40 mins."* The "Good Mode" variant says farmers
  must kill all hunters before the timer ends.
- Farmers get a **head start** to run and hide before hunters are released *(recollection: hunters
  wait in a pen for roughly a minute).*

### 2.2 Farmer economy
- Farmers begin with peons/a farmer unit and build **animal farms — chickens, sheep, pigs** (later
  versions add cows and rabbits) that **spawn animals which generate gold passively**: "each animal
  produces roughly 1 gold every 7.5 seconds" ("R!" review). Upgraded farms give upgraded livestock.
- The famous mechanic is **livestock management**: animals wander out of the base and give away its
  position. Players fence them in and use **rally points** to direct new animals. "R!" players praised
  livestock management as the most fun part. A unit cap (300 for 3 players) stops lag.
- The beginner's question in one thread is exactly the cookie-clicker question: *"when to go for
  pigs, when for chicken, how many can I have?"* — the choice of producer is the early game.
- Gold is slow: farmers complained that "25–30 minutes to build armies" is too long.

### 2.3 Farmer defence and base
- Walls: tree walls (wood upgrades that look like forest and so **stay hidden**), magic walls
  (wood → stone → metal, with net and cloud abilities), stone and iron walls (blog review of v3.6d,
  "R!" review). Towers: arrow, flame arrow, boulder, bombard. Players called both walls and towers
  "weak" unless upgraded.
- A research centre's first "war mastery" upgrade let farmers **teleport between their own
  buildings** — the blog author's favourite mechanic.
- Farmer escape tools: *Panic* (speed burst) and *Sneak* (brief invisibility).

### 2.4 Farmer offence (the revenge)
- Late game the farmers buy **Golems** (one main golem per player, upgraded with HP/damage/attack
  speed and spells; "!O5" lets a golem evolve, e.g. Flesh → Rock) and **mercenaries** to go and kill
  the hunters. Early golems are "waaaay weak" vs hunters; late ones are formidable.

### 2.5 Hunters
- Hunters are heroes that level by killing, summon wolves ("Feral Spirit"-style) and buy from a shop
  (free items from a druid shop in one version): healing potions, a wind-walk potion, **wards**
  ("their most important skill" — used to see the map and to stop farmers basing), **explosive traps**
  placed on paths and at base doors, invisible **assassins** to infiltrate bases, a 500 g map-reveal
  potion, an attack-speed/lifesteal potion and a temporary invulnerability potion. A "Far Sight"-style
  spell reveals bases.
- Hunter income grows with kills: "the more farmers hunters kill, the better their income for the late
  game". They also build towers/units to stop farmers basing, and hire mercenaries.

### 2.6 What was fun / what was frustrating (player feedback)
- **Fun:** livestock management; randomisation; terrain variety; "all strategies have their pros and
  cons"; teleport-between-buildings; the hide-and-seek tension.
- **Frustrating:** hunters camping the healing fountain and farming mercenaries for XP; farmers too
  weak early and too slow to reach an army; weak towers/walls; games too long (40–45 min); hunters
  walking or summoning through trees/cliffs in buggy versions (fixed in v3.6d); missing in-game
  explanation (a reviewer asked for a quest menu).

---

## 3. Sheep Tag in detail (ideas worth stealing)

- 3 wolves vs the rest as sheep; sheep survive ≈25 min (Sheep Tag description) to win.
- Sheep are **small, fast and defenceless**; "their only weapons are farms and micro". Farms are
  dropped in real time to seal corridors; sheep leave **gaps only a sheep fits through** because
  wolves are too big. "Building on yourself" pushes your own sheep away from a wolf.
- Farm types (Sheep Tag 2): free-to-start straw/stick/stone farms that upgrade; tiny/wide/hard farms
  (plug a one-cell gap or seal a lane in one click); mud farms that slow wolves; sentry farms with wide
  vision that also reveal invisible units; aura farms; **savings farms that are fragile gold
  generators — "pure greed and pure risk"**.
- Wolves tear farms down, summon pack wolves, call strikes on defences, phase through walls and lay
  snares; "every hunt is a puzzle".
- A caught sheep becomes a **spirit** that teammates can rescue (Sheep Tag 2), or appears in the map
  centre where a teammate frees it (Sheep Tag Mod 3.7). This keeps caught players in the game.

---

## 4. What this means for our mode (design takeaways)

1. **The tell is the animals.** Income comes from animals that wander; more income = more tells. The
   farmer's skill is herding. This is the mode's heart (R2.16) — never remove wandering to "fix" it.
2. **The choice of producer is the early game** (hen vs sheep vs pig): cheap and quiet vs efficient
   and loud. A "greed" producer that is fragile (savings farm) is a known-good idea.
3. **Hidden spots + walls with a farmer-sized gap** (Sheep Tag) give the hider a skill expression
   that is not "click faster", and make tree walls matter: a hunter has to chop or walk round.
4. **Hunters need vision tools** (wards, a reveal, traps on paths) or the hunt is boring; the farmers
   need a way to **remove** those tools (R2.17), but they can't attack — so removal must be a
   non-attack action (pull up a ward).
5. **The flip**: hunters strong early, farmers' army late. In the originals the flip took 25–30 min
   and felt slow; **our clock should be shorter** (20–30 min) and the flip should start earlier (owner
   says "by mid-game"), with a visible measure of who is winning.
6. **Keep caught players playing**: rescue / respawn rules, not elimination-and-wait.
7. **Explain the game in-game** (a reviewer's complaint): onboarding hints are part of done.
8. Bugs that let hunters ignore terrain ruined games — collision with trees/cliffs must be exact and
   tested.
9. The fountain-camping and mercenary-farming complaints say: **don't let hunters farm neutral XP**;
   hunter growth comes only from the hunt.

---

## Sources

- Sheep Tag 2 on Steam — https://store.steampowered.com/app/537680/Sheep_Tag_2/
- Sheep Tag Mod 3.7, Hive Workshop — https://www.hiveworkshop.com/threads/sheep-tag-mod-3-7.80885/
- Archangel's Sheep Tag RoC, Hive Workshop — https://www.hiveworkshop.com/threads/archangels-sheep-tag-roc.158968/
- Perfect Sheep Tag TFT — https://maps.w3reforged.com/maps/categories/tag-tiggy-tick/perfect-sheep-tag-tft
- Sheep Tag Pro 6.6 — https://wc3maps.com/map/2375/Sheep_Tag_Pro_6.6
- Farmers vs Hunters by Warpetzz123 — https://maps.w3reforged.com/maps/categories/hero-defense-and-survival/Farmers%20vs%20Hunters%20by%20Warpetzz123
- Farmers vs Hunters – Good Mode — https://maps.w3reforged.com/maps/categories/hero-defense-and-survival/Farmers%20vs%20Hunters%20-%20Good%20Mode
- Farmer vs Hunter 2020 v2.2, Epic War — https://www.epicwar.com/maps/303578/
- Farmer vs Hunter S2! Final, Epic War — https://www.epicwar.com/maps/289915/
- Farmer vs. Hunter R! ver. 3.7, Hive Workshop — https://www.hiveworkshop.com/threads/farmer-vs-hunter-r-ver-3-7.217186/
- Farmer vs Hunter !O5 – 3.5, Hive Workshop — https://www.hiveworkshop.com/threads/farmer-vs-hunter-o5-3-5.241625/
- Farmer vs Hunter AI v4.79c, Hive Workshop (403 when fetched) — https://www.hiveworkshop.com/threads/farmer-vs-hunter-ai-v4-79c.334329/
- "Warcraft 3: Farmer vs Hunter v3.6d review and tips" (blog) — http://myworkworld.blogspot.com/2009/02/warcraft-3-farmer-vs-hunter-v36d-review.html
- Crazy Farmer vs Hunter thread, ENT Gaming — https://entgaming.net/forum/viewtopic.php?t=50566
- Sheep Tag 2.5 / v8.2, Epic War — https://www.epicwar.com/maps/239686/ , https://www.epicwar.com/maps/277132/
