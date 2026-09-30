# WILDMARCH — Design Bible, page 14: quests and events

> *"Nobody will thank you, but somebody will pay you."* — a notice-board job, Farhold (reused)

**Status:** v0.1 draft — 2026-09-29. Documentation only; nothing is built.
**Owns:** every quest id, quest kinds, the quest flow and its rules, the main story chain level 1–60,
the class calling quest framework and ids, feature-unlock quests, attunement quests, side quests,
dailies and weeklies, the job generator's Wildmarch rules, rumours, bounties, dynamic open-world
events (`ev_*` ids), seasonal events, and quest sharing in groups.
**Reads from:** canon [page 00](00-OVERVIEW.md) (levels, calling quests 6/20/40, spell ladder
1/4/10/18/28/40, talent tiers 12/22/32/45, regions, dungeons, raids), [page 01](01-WORLD-LORE.md)
(towns, NPCs, factions, landmarks, story beats), [page 07](07-PROGRESSION.md) (XP table and the
feature ladder — page 07 owns the ladder and its quest ids and levels (00 §10); this page writes the
unlock quests' content to match it),
[page 11](11-BOSS-MECHANICS.md) (telegraph words used in event phases), [page 12](12-DUNGEONS.md) and
[page 13](13-RAIDS-WORLD-BOSSES.md) (dungeon, raid and world boss content), [page 15](15-SOCIAL-ONLINE.md)
(parties, group finder), [page 03](03-UI-SCREENS.md) (screens), [page 02](02-CONTROLS.md) (keys),
[page 04](04-SETTINGS.md) (options).

---

## Contents

1. [What Farhold already has](#1-what-farhold-already-has) (and what changes)
2. [Quest kinds](#2-quest-kinds)
3. [Objectives, the quest record and the rules](#3-objectives-the-quest-record-and-the-rules)
4. [Rewards: XP, coin, items, choices](#4-rewards-xp-coin-items-choices)
5. [The quest UI flow](#5-the-quest-ui-flow) — pickup, tracker, markers, turn-in, reward choice
6. [The main story: *The Lamp Goes North*](#6-the-main-story-the-lamp-goes-north) — every quest, 1–60
7. [Feature-unlock quests](#7-feature-unlock-quests)
8. [Class calling quests (6 / 20 / 40)](#8-class-calling-quests-6--20--40)
9. [Dungeon and raid attunements](#9-dungeon-and-raid-attunements)
10. [Side quests by region](#10-side-quests-by-region)
11. [Repeatable work: boards, the job generator, rumours, bounties](#11-repeatable-work-boards-the-job-generator-rumours-bounties)
12. [Dailies and weeklies](#12-dailies-and-weeklies)
13. [Dynamic open-world events](#13-dynamic-open-world-events) — participation, scaling, 25 events
14. [Incidents](#14-incidents)
15. [Seasonal events](#15-seasonal-events)
16. [Quests in groups](#16-quests-in-groups)
17. [Data files and tests](#17-data-files-and-tests)
18. [Canon change requests and questions](#18-canon-change-requests-and-questions)

---

## 1. What Farhold already has

Farhold's quest system is built for one player on a random planet. Everything below exists and is
tested; Wildmarch keeps the engine and changes the content and the online rules.

| Farhold piece | What it does in Farhold | Wildmarch |
|---|---|---|
| `js/quests.js` `QuestLog`, `makeQuest` | Four counting shapes — `hunt`, `visit`, `gather`, `clear` — plus started kinds (`raid`, `fall`) and the `onboard` line; progress through events (`onKill`, …); `readyToTurnIn(giverId)` | **Reuse** the log and event-driven progress. Add hand-written quests (story, side, calling, unlock, attunement) loaded from JSON, and six more counting shapes (§3). `onboard` is replaced by the Prologue. |
| `js/jobgen.js` + `data/job-frames.json` | 25 frames with typed slots bound only to things that exist now; `local`/`adjacent`/`rumour` scopes with metre and hop budgets; prefers the nearest binding | **Reuse** as the **board job** system (§11). Scope = sub-zone/region instead of a Farhold zone. |
| `js/questrewards.js` | One payer for every turn-in; reward kinds `coin`, `crate`, `materials`, `choice`, `pick3`; kind picked from the shape of the job unless data says | **Reuse** unchanged as the payer; Wildmarch adds `class_pick` (§4) and drops `materials` from building-shaped jobs (no base building). |
| `js/markers.js` `MarkerBook` | One book for quests, story, pins, saved places; tracked vs untracked; minimap rim arrows with distance | **Reuse**; the world/planet key becomes a single continent key; adds event and bounty looks (§5.4). |
| `js/rumours.js` | 14 kinds of one-line fact about another zone; the only thing that talks about somewhere else | **Reuse** (§11.3). |
| `js/wanderers.js` + `data/wanderers.json` | 14 kinds of person on the road, each wants/gives one thing | **Reuse**; wanderers are real bodies (Farhold R22 gave them bodies). |
| `js/encounters.js` + `data/events.json` | Road events: `rescue`, `chase`, `defend`, `trap`, `find`, each with dressing, a captive, a timer | **Reuse** as the small **road events** (§13.9) and as phase types inside the big dynamic events. |
| `js/incidents.js` + `data/incidents.json` | 12 timed zone states (raid coming, hunger, restless dead…) | **Reuse** (§14), per sub-zone, shared by every player. |
| `data/campaign.json` | Farhold's spine: 8 counters ("walk 20 km") | **Replaced** by the written main story (§6). |
| `data/onboarding.json` | 5-step hand-holding line to smelt iron | **Replaced** by the Prologue (§6, P.1–P.6) and the unlock quests (§7). |
| Emberveil `class-quests.json`, `side-quests.json`, `road-quests.json` | Personal hero quests, board bounties, strangers on the road | **Idea reuse** for calling quests (§8), bounties (§11.4) and road offers. |

**The big change is "online".** Farhold's world is private, so its quests can move the world (a zone
changes hands, a camp is taken for good). In a shared world that cannot happen per player. Rule:

- **Personal state** (your quest log, your story chapter, what you have seen) is **phased**: two players
  standing in Brightwater may see different NPCs in the drill yard if one has finished the Prologue.
  Phasing (showing each player a different version of a small area based on their progress) is
  limited to **named story spots**, listed per quest in §6 with a `(phase)` mark. Nowhere else.
- **World state** (a camp cleared, a zone's grip, an incident, an event's outcome) is **shared** and
  **timed** — it resets on a clock so everyone gets a turn. §13 and §14 give every timer.

---

## 2. Quest kinds

Every quest id starts with `q_` (brief rule 7). The second part names the kind.

| Kind | Id pattern | Offered by | How many | Repeat | Soloable | Marker | Reuse |
|---|---|---|---|---|---|---|---|
| **Story** | `q_ms_<snake>` | fixed NPCs, in order | 116 (§6) | once per character | **yes, all of it** (dungeon steps: with followers on Normal; the two raid finales have a story-instance alternative) | gold `◆` | new content on `QuestLog` |
| **Side** | `q_<region>_<snake>` | fixed NPCs in towns and camps | 84 (§10), 7 per region | once per character | yes, except those marked **[Group N]** | yellow `!` | new content |
| **Calling** | `q_calling_<class>_<1\|2\|3>` | courier (1), class trainer (2, 3) | 90 (§8) | once per character | yes, always (the trial is a solo instance) | purple `!` | idea: Emberveil `class-quests.json` |
| **Unlock** | page 07's ladder ids (`q_<region>_<snake>`, e.g. `q_hv_fall_and_rise`; the flying chain `q_sky_1`…`q_sky_5`); unlocks page 07 took from this page keep `q_unlock_<feature>` | the NPC who runs the feature | 32 (§7) | once per character | yes | green `!` | new |
| **Attunement** | `q_att_<raid>_<snake>` | raid lore NPCs | 5 chains (§9) | once per character | steps outside the raid: yes | gold `!` | new |
| **Board job** | `q_job_<frame>` + instance hash | notice boards, wanderers | 4–6 per board, rolling | yes | yes | yellow `!` (board) | **reuse** `js/jobgen.js` |
| **Rumour lead** | none — a lead is not a quest | innkeepers, minstrels, wanderers | — | — | — | grey `?` on the map when you reach the region | **reuse** `js/rumours.js` |
| **Bounty** | `q_bounty_<rare>` | Wanted posters at hubs | 3 per hub per day | daily | most; elites **[Group 3]** | red `☠` | idea: Emberveil `side-quests.json` |
| **Escort** | a goal kind, used by story/side/job | — | — | — | yes | — | **reuse** `escort` goal + Farhold `js/caravans.js` |
| **Gathering** | a goal kind | — | — | — | yes | — | **reuse** `gather` |
| **Puzzle** | a goal kind (`solve`) | landmarks, side quests | — | — | yes | — | **reuse** `standing_stones` etc. |
| **Group** | side or daily flagged `group: 3` or `group: 5` | — | 11 in §10 (one per region) + group bounties | — | with followers filling slots | `!` with a small shield | new |
| **Daily** | `q_daily_<snake>` | hub quartermasters, Spire Accord | 3 per hub + 4 at Veilspire (§12) | once per day | yes | blue `!` | new |
| **Weekly** | `q_weekly_<snake>` | Highcourt Muster board | 6 (§12) | once per week | some need groups | blue `!` with a ring | new |
| **Event** | `ev_<snake>` — an event is **not** a quest | the world | 25 (§13) | on a timer | yes, scaled | orange `✦` | **reuse** `js/encounters.js` beats |
| **Seasonal** | `q_season_<event>_<snake>` | festival NPCs | 6 festivals (§15) | per festival | yes | pink `!` | new |

---

## 3. Objectives, the quest record and the rules

### 3.1 Objective kinds

Farhold's log counts four shapes; jobgen already maps richer goals onto them (`LOG_KIND`). Wildmarch
adds six shapes the story needs. All progress arrives through events (reuse: `QuestLog.onKill` style).

| Goal kind | Counts as (Farhold log shape) | Completes when | Event that advances it | Reuse |
|---|---|---|---|---|
| `kill` | hunt | named target (by id) dies | `onKill({ defId, uid })` | reuse |
| `hunt` | hunt | N of a monster id or family die | `onKill` | reuse |
| `gather` | gather | N quest items in the bag (dropped by monsters or picked from nodes) | `onLoot` | reuse (`submitGather`) |
| `clear` / `clearSites` | clear | a site's last hostile body falls | `onSiteCleared` | reuse |
| `visit` / `visitAll` | visit | the player enters a radius (default 12 m) | `onEnter` | reuse |
| `deliver` | visit | the item is handed to the target NPC | `onTalk` | reuse |
| `escort` | visit | the escorted body reaches the end alive | `onEscortArrive` | reuse (`caravans.js`) |
| `pay` | visit | coin handed over at the place | `onPay` | reuse |
| `solve` | visit | a landmark puzzle reaches its solved state | `onSolve` | reuse |
| `talk` *(new)* | visit | a named NPC is spoken to (dialog reaches a marked line) | `onTalk` | new |
| `use` *(new)* | visit | N world objects are used (`E`, a 1.5 s channel by default) | `onUse` | new |
| `defend` *(new)* | clear | a timer runs out with the defended thing above 0 health | `onTimer` | reuse beat: `events.json` `defend` |
| `channel` *(new)* | visit | the player stands in a zone for N seconds without leaving (damage does not break it; leaving resets it) | `onTimer` | new |
| `dungeon` *(new)* | clear | the named dungeon's final boss dies with the player in the group, any difficulty | `onBossKill` | new |
| `event` *(new)* | clear | the player earns at least Bronze in the named event (§13.2) | `onEventEnd` | new |
| `choose` *(new)* | visit | the player picks one dialog option; the option is saved on the quest | `onTalk` | new |

### 3.2 The quest record (JSON)

```json
{
  "id": "q_ms_the_hollow_barrow",
  "kind": "story",
  "chapter": 1, "order": 7,
  "title": "The Hollow Barrow",
  "level": 6, "minLevel": 5,
  "giver": "npc_odile_marsh", "turnIn": "npc_odile_marsh",
  "region": "hearthvale", "subzone": "sz_barrow_downs",
  "requires": { "quests": ["q_ms_lamp_oil_and_courage"], "level": 5 },
  "text": "Something in the big barrow is calling the dead up. Go in and put a stop to it. Take people if you can find them. Take hired swords if you can't.",
  "objectives": [
    { "id": "o1", "goal": "dungeon", "target": "d01_hollow_barrow", "count": 1,
      "hud": "Clear the Hollow Barrow", "area": null }
  ],
  "reward": { "tier": "story_finale", "kind": "class_pick", "rarity": "rare", "extras": { "title": null } },
  "share": true, "group": 0, "phase": null,
  "onDone": { "unlocks": [], "worldState": null, "memory": { "npc_odile_marsh": 0.7 } }
}
```

- `tier` names a row in §4's reward table; the payer (reuse: `grantReward`) turns it into coin and XP
  for the quest's `level`.
- `hud` is the tracker line and must follow Farhold's `WORDING.md` (a number and a place).
- `area` is `{ region, x, z, r }` in metres for "somewhere in here" objectives; `null` for a pin.
- `memory` writes a Lingo memory of that importance for the named NPC (reuse: `lingo/js/memory.js`),
  so the NPC mentions it for 7 real days.

### 3.3 Rules every quest obeys

1. **No quest sends you somewhere you cannot survive at its level.** No objective may sit in a sub-zone
   whose band **minimum is more than 2 above** the quest's level, except story "travel to the next
   region" steps (which are marked `visit` only and follow a road). Lower sub-zones are fine.
   (Farhold's R14 lesson — a "local" job 40 km away in a level-30 band — is a test here.)
2. **No objective binds to something that might not exist.** Hand-written quests name fixed ids; board
   jobs go through jobgen, which refuses an unbindable frame (reuse rule).
3. **Quest items are personal.** A drop for a `gather` objective drops for **every** eligible player
   who tagged the body (§16). A quest item is soulbound (cannot be traded), weighs nothing, lives in a
   separate **quest bag** of 40 slots and disappears when the quest is turned in or abandoned.
4. **Kill credit is shared** by everyone who damaged or healed within 40 m of a body in the 10 s before
   it died (no "tagging" race; page 15 owns loot rules).
5. **Log size:** 30 active quests (story, calling and attunement quests do not count against the 30).
6. **Abandon:** any quest except story quests may be abandoned; a board job costs −3 standing with the
   poster (reuse: Farhold deed `job_abandoned`). A story quest can be *reset* (restarts its steps).
7. **Grey quests stay:** a quest 6+ levels below you is still offered but shown grey (§5.2).
8. **No timer fails a story quest.** Timed steps (defend, escort) simply restart on failure.

---

## 4. Rewards: XP, coin, items, choices

**Page 07 owns the XP table and page 08 owns coin, so these are proposals expressed as shares.**

### 4.1 XP

Quest XP = **XP needed to go from the quest's level to the next** × the tier's share. A quest pays by
its own level, not yours (Farhold R22's `eventXp` idea: priced by the place, not by you).

| Tier | Share of a level | Used by |
|---|---|---|
| `story` | 12% | ordinary story steps |
| `story_finale` | 30% | a chapter's dungeon or instance step |
| `side` | 7% | side quests |
| `side_chain_end` | 15% | last quest of a side chain |
| `calling` | 25% per quest (the three calling quests) | §8 |
| `unlock` | 5% | §7 |
| `job` | 4% | board jobs (reuse jobgen's gold/xp ranges scaled to this) |
| `bounty` | 8% (elite bounty 15%) | §11.4 |
| `daily` | 5% below 60; at 60 converts to coin ×2 | §12 |
| `event_bronze` / `_silver` / `_gold` | 4% / 7% / 10% | §13 |

**Out-levelled quests** pay less: for every level you are **more than 2 above** the quest, −20% XP, down
to a floor of 10% (a quest 6+ levels below you pays 10%). Farhold R22 `killXpFor` uses the same shape
for kills.

**Budget check** *(for page 07)*: story + side + calling + unlock quests alone are meant to give
**about 55%** of the XP from 1 to 60; kills, jobs, events and dungeons the rest. §6's table lets page 07
add it up.

### 4.2 Coin

Canon (00 §10; page 08 owns the unit): **100 copper = 1 silver, 100 silver = 1 gold**. Quest coin =
`20 × level^1.5` copper × a tier factor (story 1.0, story_finale 2.5, side 0.8, calling 2.0, unlock
0.5, job 0.5, bounty 1.2, daily 1.0, event 0.5/0.8/1.2). Examples for a `story` quest: level 1 = 20c,
level 10 = 6s 32c, level 30 = 32s 86c, level 60 = 92s 95c. The §6 table prints the coin for each
quest using this rule, rounded.

### 4.3 Item rewards

Reuse `js/questrewards.js` `REWARD_KINDS` and add one:

| Kind | What the player sees | Wildmarch rule |
|---|---|---|
| `coin` | coin + XP only | reuse |
| `crate` | a loot popup with one item (reuse: shared `rewards.js` popup) | rarity floor per tier: story Uncommon, story_finale Rare |
| `materials` | a bag of crafting materials (salvage dust, essences — page 08) | only for gathering/crafting quests |
| `choice` | the giver asks: coin ×1.5, a crate, or materials | reuse; 20% of side quests (reuse `CHOICE_CHANCE`) |
| `pick3` | three Rare-or-better items, take one | reuse; used by elite bounties and group quests |
| **`class_pick`** *(new)* | three items rolled **for your class**: one weapon your class can use, one armour piece of your class's armour type, one jewellery/off-hand; take one | every `story_finale`, every calling quest (as the final reward), every side chain end |

Item level of a reward = the quest's level (page 08 turns level into item level).

**Unlock rewards** (a feature, a title, a map reveal, a waystone lit, a reputation jump) are `extras`
on the reward (reuse: `EXTRA_KEYS` — `perk`, `opens`, `reveals`, `brand`; Wildmarch adds `unlock`,
`title`, `rep`, `mount`, `item`).

---

## 5. The quest UI flow

**Page 03 owns every screen and its layout; page 02 owns keys; page 04 owns settings.** This section
is the *flow*: what happens in what order. Screen ids and settings keys are proposals for those
pages (§18).

### 5.1 Finding work

- **Over NPC heads** (world, 3D glyph, visible to 60 m, fades to 30% opacity at 40–60 m):

| Glyph | Colour | Meaning |
|---|---|---|
| `◆` | gold `#ff9f4a` | story quest available (reuse: Farhold `campaign` look) |
| `!` | yellow `#ffd24a` | side quest or board job available (reuse: Farhold `quest` look) |
| `!` | grey `#9a9a9a` | available but 6+ levels below you |
| `!` | blue `#6fb8ff` | daily / weekly / repeatable |
| `!` | purple `#c08aff` | calling quest |
| `!` | green `#8fe0a0` | unlock quest |
| `!` + shield | yellow | group quest |
| `?` | yellow | ready to turn in here |
| `?` | grey | you have a quest for this NPC, not finished |
| `☠` | red `#ff5a4a` | Wanted poster with a bounty you do not have |
| `…` | white | this NPC has something to say (a rumour, a memory) but no quest |

- **Notice boards** (`NB` in page 01) show a `!` when a job you have not seen is on them.
- **On the map and minimap:** available quests within 150 m show their glyph; further ones are hidden
  unless `set.interface.show_distant_quest_givers` is on (default off).

### 5.2 Level colours (quest titles, tracker, log)

| Colour | Quest level vs yours | XP |
|---|---|---|
| grey | 6+ below | 10% |
| green | 3–5 below | 40–80% |
| yellow | 2 below to 2 above | 100% |
| orange | 3–4 above | 100%, harder |
| red | 5+ above | 100%, "you will probably die" — the accept button says **Accept anyway** |

### 5.3 Pickup — `scr_quest_offer`

1. Press **Interact** (default `E`, page 02) on a giver → the **dialog panel** opens (the Lingo/talk
   screen, reuse: Farhold `js/talkui.js`), the NPC speaks the quest text (voice + subtitle, text
   types out at `set.interface.quest_text_speed`: instant / fast 90 chars/s / normal 45 chars/s).
2. The offer shows: **title** (level colour), **level**, **kind** chip (Story / Side / Calling / Job / …),
   **text**, **objectives** (the `hud` lines), **rewards** (XP, coin, item kind and rarity floor — the
   actual items for `class_pick` are rolled and shown **now**, so you can see them before accepting),
   **group size** if any, **shareable** yes/no.
3. Buttons: **Accept** · **Decline** (the NPC keeps offering) · for story: no Decline, only **Later**.
4. On accept: toast "Quest accepted: *title*", a short sound (page 17), the quest goes to the log,
   and is **auto-tracked** if `set.interface.auto_track_new` (default on) and fewer than
   `set.interface.quest_tracker_max` (default 8, range 3–12) are tracked.

### 5.4 Tracking — `hud_quest_tracker` and markers

- **Tracker** (HUD, right edge under the minimap, page 03): one block per tracked quest — title
  (level colour), then each objective as `hud` text with a count `Kill barrow wights 3/8` or a tick
  when done. Story quests sit on top, then calling, then others in the order tracked. Clicking a
  block opens the map on it; right-click untracks. A progress change flashes the line for 1 s.
- **Markers** reuse Farhold's `MarkerBook` (one book, tracked vs untracked; world map + minimap +
  compass). Marker looks (reuse `MARKER_LOOKS`, Wildmarch additions marked new):

| Marker kind | Icon | Colour | Shown |
|---|---|---|---|
| `campaign` (story objective) | `◆` | `#ff9f4a` | map, minimap, compass |
| `quest` | `!` | `#ffd24a` | map, minimap, compass |
| `quest_area` *(new)* | translucent circle | `#ffd24a` at 20% | map + minimap: the area where kills/gathers count, no pin |
| `turn_in` *(new)* | `?` | `#ffd24a` | map, minimap, compass |
| `event` *(new)* | `✦` | `#ff8a40` | map, minimap, compass, plus a banner (§13.3) |
| `bounty` *(new)* | `☠` | `#ff5a4a` | map (last seen area circle, 80 m) |
| `lead` *(new, rumour)* | `?` | `#9a9a9a` | map only |
| `pin`, `saved`, `waypoint` | reuse | reuse | reuse |

- **Out of minimap range** a tracked marker is an arrow on the minimap rim with the distance (reuse:
  `markers.bearing()`, `distanceText()`).
- **In the world**: tracked objective pins show as a floating glyph with the distance under it
  (`set.interface.world_markers`: on / tracked only (default) / off).
- **Objective glow**: a quest object you can use (a sigil, a crate, a lamp post) has a soft yellow
  outline when within 20 m and its quest is active (`set.interface.quest_object_glow`, default on).

### 5.5 The quest log — `scr_journal` → **Quests** tab

Reuse Farhold's journal (the full-screen character sheet's Journal tab). Layout: list left, detail right.

- **List groups** (collapsible): Story · Calling · Attunement · Unlock · Side (by region) · Jobs ·
  Bounties · Daily · Weekly · Seasonal · **Completed** (story and calling history, with the date).
- **Filters:** a search box; a dropdown **Show**: All / Tracked / In this region / Can turn in / Group.
- **Detail:** title, level, giver (with a **Show on map** button), text, objectives with counts,
  rewards, **Track** toggle, **Share** (§16), **Abandon** (with a confirm: "Abandon *title*? Board jobs
  cost 3 standing with *faction*"), for story **Reset step**.
- **Turn in from the journal:** allowed for **board jobs and bounties only** (reuse: Farhold R16
  `questrewards` turn-in from the journal); story, side and calling quests are turned in to a person.

### 5.6 Turn-in — `scr_quest_turnin` and `scr_quest_reward_choice`

1. When every objective is done: toast "*title* — ready to turn in", the turn-in `?` appears, and the
   tracker line reads **Return to *NPC* in *town***.
2. Interact with the turn-in NPC → a short spoken completion line → the **reward panel**:
   XP, coin, and the item block:
   - `crate`: the loot popup (reuse: shared rewards popup, hover shows the item card, reuse
     `hud.itemCard`).
   - `choice`: three buttons — **Coin** (×1.5), **A crate**, **Materials** (reuse `CHOICE_OPTIONS`).
   - `pick3` / `class_pick`: three item cards side by side, each with a **compare** strip against what
     you wear in that slot (reuse: Farhold item card deltas). Click one → **Take** (confirm).
3. Extras are announced after the item: an **unlock card** for features (canon §10 rule 5: card, sound,
   Unlocks-screen entry), a title card, a reputation line.
4. Bag full: items go to the **mailbox** with a note, never lost.
5. The NPC's next line may offer the next quest in the chain immediately (story quests chain without
   a second click: "Accept next" is the default button).

### 5.7 Settings this flow needs (proposals for page 04)

| Key | Control | Values | Default |
|---|---|---|---|
| `set.interface.quest_tracker_max` | slider | 3–12 | 8 |
| `set.interface.auto_track_new` | toggle | on/off | on |
| `set.interface.quest_text_speed` | dropdown | instant / fast / normal | fast |
| `set.interface.world_markers` | dropdown | on / tracked only / off | tracked only |
| `set.interface.quest_object_glow` | toggle | on/off | on |
| `set.interface.show_distant_quest_givers` | toggle | on/off | off |
| `set.interface.show_quest_areas` | toggle | on/off | on |
| `set.interface.show_low_level_quests` | toggle | on/off | on |
| `set.interface.event_banners` | dropdown | all / nearby (300 m) / off | nearby |
| `set.audio.quest_voice` | toggle | on/off (NPC voices on quest text) | on |
| `set.gameplay.auto_accept_shared` | toggle | on/off (accept quests a party member shares) | off |

---

## 6. The main story: *The Lamp Goes North*

Twelve chapters and a prologue (beats on page 01 §5). **116 quests.** Every row is one quest. Columns:
`#` chapter.order · `id` · **Giver** (npc id) · **Where** (town or sub-zone) · **Objective** (goal kind
in brackets) · **Reward** (coin by §4.2 rule for the tier; items; extras) · **Lvl**.
`(phase)` = the quest changes what that player sees at that spot (§1). Every chapter's quests unlock
in order; the next chapter needs the last quest of the previous one **and** the level shown.

**Solo rule for dungeon steps:** a `dungeon` objective counts on **any difficulty**, including Normal
with followers (canon pillar 6). The two raid finales (11.10, 12.5) also accept a **story instance**
(§6.13).

### Prologue — *Torch and Stick* (Hearthvale, 1–3)

| # | id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|---|
| P.1 | `q_ms_the_muster` | The Muster | `npc_odile_marsh` | Brightwater drill yard | Sign the muster roll at the Hearthstone [use] and speak to the Captain [talk]. Hearth-bind is set to Brightwater. | 20c · Warden's torch (`it_warden_torch`) · the starter weapon is already in hand | 1 |
| P.2 | `q_ms_first_blood` | Rats in the Granary | `npc_odile_marsh` | Brightwater Fields | Kill 6 field rats in the granary yard [hunt]. Teaches the basic attack and spell 1. | 20c · Common gloves | 1 |
| P.3 | `q_ms_scarecrow_watch` | Scarecrow Watch | `npc_bram_fenwick` | Brightwater Fields | Light 3 scarecrow braziers with your torch [use] and kill the 4 crows that come for the fire [hunt] | 57c · Uncommon belt | 2 |
| P.4 | `q_ms_the_lantern_scholar` | The Lantern Scholar | `npc_bram_fenwick` | south road | Meet Iris Vael's cart 400 m down the south road and escort it to the gate [escort] (2 Hedge Knives ambush at 60%) | 57c · `class_pick` Uncommon | 2 |
| P.5 | `q_ms_measure_the_downs` | Measuring Lamps | `npc_iris_vael` | `sz_brightwater_fields`, east edge by the downs | Set 3 Lantern House measuring lamps on their posts [use] | 57c · 1 minor health potion ×5 | 2 |
| P.6 | `q_ms_harrow_watch` | Harrow Watch | `npc_iris_vael` | `town_harrow_watch` | Report to Garrick Holt [talk], then hold the stockade 90 s against barrow stragglers [defend] (phase: Garrick's post) | 1s 4c · Harrow Watch waystone lit | 3 |

### Chapter 1 — *The Barrow Wakes* (Hearthvale, 3–7)

| # | id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|---|
| 1.1 | `q_ms_what_the_goblins_dug` | What the Goblins Dug | `npc_garrick_holt` | `sz_barrow_downs` | Kill 8 Sootwick diggers at the opened barrows [hunt] | 1s 4c | 3 |
| 1.2 | `q_ms_stolen_grave_goods` | Stolen Grave Goods | `npc_garrick_holt` | Sootwick camp, `sz_southwood` | Recover 5 sacks of grave goods from the camp [gather] | 1s 60c · `choice` | 4 |
| 1.3 | `q_ms_scab_nettlejaw` | Scab Nettlejaw | `npc_garrick_holt` | Sootwick camp | Kill the camp's boss, Scab Nettlejaw (champion goblin hexer) [kill] | 1s 60c · Uncommon weapon (`crate`) | 4 |
| 1.4 | `q_ms_the_sigil` | The Burned Sigil | `npc_iris_vael` | `sz_barrow_downs` | Take rubbings of 3 burned sigils on barrow doors [use]; barrow wights guard two of them | 2s 24c | 5 |
| 1.5 | `q_ms_sister_wrens_counsel` | Sister Wren's Counsel | `npc_iris_vael` | Brightwater chapel | Show the rubbings to Sister Wren [talk] — she names the mark of the Kindled | 2s 24c · `extras.reveals`: the Kindled entry in the lore book | 5 |
| 1.6 | `q_ms_lamp_oil_and_courage` | Lamp Oil and Courage | `npc_odile_marsh` | Millbrook, Oakhollow | Collect 5 flasks of lamp oil from Tansy Miller [deliver] and ask 3 villagers to stand watch [talk ×3] | 2s 24c · Uncommon cloak | 5 |
| 1.7 | `q_ms_the_hollow_barrow` | The Hollow Barrow | `npc_odile_marsh` | `d01_hollow_barrow` | Clear the Hollow Barrow [dungeon] | 7s 35c · `class_pick` **Rare** | 6 |
| 1.8 | `q_ms_a_letter_in_no_hand` | A Letter in No Hand | `npc_odile_marsh` | Brightwater | Bring the Hollow Thane's sealed letter (`b_hollow_thane`, page 12) to the Captain [deliver]. She sends you east, to the Fen, and on to Highcourt. | 2s 94c · title *Warden of the Vale* | 6 |

*The level-6 calling quest (`q_calling_<class>_1`) arrives by courier at level 6 whatever chapter you are
in (§8).*

### Chapter 2 — *Lights in the Fen* (Mossfen, 6–11)

| # | id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|---|
| 2.1 | `q_ms_the_fen_causeway` | The Fen Causeway | `npc_odile_marsh` | Fen Causeway | Walk the causeway to Reedhollow [visit] and relight its 2 dead lamps on the way [use] | 2s 94c | 6 |
| 2.2 | `q_ms_mother_ilse` | The Fen-Speaker | `npc_iris_vael` | `town_reedhollow` | Speak with Mother Ilse [talk] | 3s 70c | 7 |
| 2.3 | `q_ms_missing_cutters` | The Missing Cutters | `npc_mother_ilse` | `sz_peat_cuts` | Find 4 missing peat cutters [visitAll]; walk the 2 living ones home [escort] | 3s 70c · `choice` | 7 |
| 2.4 | `q_ms_the_false_lights` | The False Lights | `npc_mother_ilse` | `sz_lantern_marsh` | After dark, follow a will-o-light to the drowning pool [visit] and kill 6 Mire Sisters [hunt] | 4s 53c | 8 |
| 2.5 | `q_ms_to_feed_the_lamp` | To Feed the Lamp | `npc_iris_vael` | `sz_lantern_marsh` | Read the Mire Sisters' 3 prayer-slates [use] — they pray to "the lamp in the north" | 4s 53c | 8 |
| 2.6 | `q_ms_gammer_tull` | Old Gammer Tull | `npc_mother_ilse` | `lm_hagsbog_ring` | Kill Old Gammer Tull at the Hag Ring [kill] (she speaks first; a `choose` line lets you insult or question her — questioning reveals the Drowned are coming overland) | 5s 40c · `crate` Uncommon | 9 |
| 2.7 | `q_ms_tobins_father` | The Miller's Key | `npc_tobin_brack` | `sz_drowned_mill_reach` | Recover the mill key from 3 drowned dead [gather 1 from any of 3 named bodies] | 5s 40c · 2s | 9 |
| 2.8 | `q_ms_the_first_drowned` | The First of the Drowned | `npc_brother_aldo` | `sz_drowned_mill_reach` | Kill a Drowned anchor-knight [kill] and bring its salt-crusted badge [gather] | 6s 32c | 10 |
| 2.9 | `q_ms_the_drowned_mill` | The Drowned Mill | `npc_mother_ilse` | `d02_drowned_mill` | Clear the Drowned Mill [dungeon] | 15s 81c · `class_pick` Rare | 10 |
| 2.10 | `q_ms_road_to_the_crown` | Road to the Crown | `npc_iris_vael` | `town_stillwater_landing` | Take the punt to Highcourt's Low Wharf [visit] (needs `q_unlock_boats`, offered on the landing) | 6s 32c | 10 |

### Chapter 3 — *The Crown Assembly* (Highcourt, 10–12)

| # | id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|---|
| 3.1 | `q_ms_the_south_gate` | The City on the Hill | `npc_iris_vael` | `town_highcourt` | Enter Highcourt [visit] and light its waystone [visit] | 6s 32c | 10 |
| 3.2 | `q_ms_letters_of_introduction` | Letters of Introduction | `npc_iris_vael` | Highcourt | Deliver 4 letters: Archivist Pell (Lantern Row), Captain Aldous Fenn (Warden's Yard), Registrar Hart (Guild Row), the Lord Protector's steward (Crown Ward) [deliver ×4] — a guided tour; each NPC names a service you will unlock later (§7; the bank, mail and market come at 11 from `q_hc_keys_to_the_city`) | 6s 32c | 10 |
| 3.3 | `q_ms_the_catacomb_door` | The Door Below | `npc_archivist_pell` | `hc_undercroft` | Walk the Undercroft with Hesper to the Barrowking's sealed door [visit] (phase: the door's seals glow for you after 1.7) | 7s 30c | 11 |
| 3.4 | `q_ms_the_assembly` | The Assembly Sits | `npc_lord_protector_edmund_vale` | Assembly Hall | Attend the session [talk] — a scene: the four seats argue; the Ember King's projection makes his first offer (phase: the hall) | 7s 30c | 11 |
| 3.5 | `q_ms_the_kings_leavings` | What the King Left Behind | `npc_lord_protector_edmund_vale` | Assembly Hall | Hold the hall 120 s against 3 waves of ember wraiths the projection left [defend] | 7s 30c · `class_pick` Rare | 11 |
| 3.6 | `q_ms_north_to_the_pass` | The Assembly's Warrant | `npc_lord_protector_edmund_vale` | North Gate | Carry the warrant through the Kettle Pass to Anvilgate [deliver] | 8s 31c | 12 |

### Chapter 4 — *Deepforge* (Greyridge, 12–18)

| # | id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|---|
| 4.1 | `q_ms_the_kettle_pass` | The Kettle Pass | `npc_lord_protector_edmund_vale` | `town_kettle_pass` | Kill 10 Sootwick raiders round the waystation [hunt]; light its waystone [visit] | 8s 31c | 12 |
| 4.2 | `q_ms_thane_ironbraid` | The Thane | (auto on arrival) | `town_anvilgate` | Present the warrant to Thane Hilda Ironbraid [deliver] | 8s 31c | 12 |
| 4.3 | `q_ms_steel_sold_north` | Steel Sold North | `npc_hilda_ironbraid` | `town_cutstone` | Search 3 Cutstone warehouses for the buyer's marks [use ×3] | 9s 37c | 13 |
| 4.4 | `q_ms_the_kindled_buyer` | The Kindled Buyer | `npc_hilda_ironbraid` | `sz_cutstone_quarries` | Ambush the buyer's escort: kill 5 guards [hunt] and the buyer, Ashen Tomas (Kindled champion) [kill] | 9s 37c · `crate` Uncommon | 13 |
| 4.5 | `q_ms_the_broken_seam` | The Broken Seam | `npc_gruna_delver` | `sz_deepdelve_slopes` | Go down the Old Seam shaft to where the mine broke into a barrow-road [visit] | 10s 48c · 4s | 14 |
| 4.6 | `q_ms_the_deepworn_speak` | The Deepworn Speak | `npc_gruna_delver` | `sz_deepdelve_slopes` | Talk to Kell Ironjaw [talk] — the Deepworn are neutral for this quest; attacking him fails the step (it restarts after 10 min) | 10s 48c · `rep` Deepworn +15 | 14 |
| 4.7 | `q_ms_deepdelve` | Deepdelve | `npc_hilda_ironbraid` | `d03_deepdelve` | Clear Deepdelve Mines [dungeon] | 29s 5c · `class_pick` Rare | 15 |
| 4.8 | `q_ms_the_cairnwifes_warning` | The Cairnwife's Warning | `npc_moira_cairnwife` | `sz_highcairn_moors` | Kill 12 Unburied on the moors [hunt] and take their marching orders from a banner-bearer [gather] | 11s 62c | 15 |
| 4.9 | `q_ms_garricks_road` | Garrick's Road | `npc_garrick_holt` | `sz_highcairn_moors` | Escort Garrick through the Unburied lines to the Bellows road [escort] | 12s 80c · `choice` | 16 |
| 4.10 | `q_ms_silence_at_bellows` | Silence at Bellows | `npc_bodric_ashlock` | `sz_bellows_heights` | Light 3 signal braziers on the keep's outer wall while its turrets fire on you [use ×3] (turret shots are **danger zones**, 1.5 s warning) | 12s 80c | 16 |
| 4.11 | `q_ms_bellows_keep` | Bellows Keep | `npc_hilda_ironbraid` | `d04_bellows_keep` | Clear Bellows Keep [dungeon] | 35s 5c · `class_pick` Rare · title *Friend of the Forge* | 17 |
| 4.12 | `q_ms_the_glass_account` | The Glass Account | `npc_iris_vael` | `town_anvilgate` | Iris reads the keep's ledger: the King wants the Sandsworn account of the Tearing [talk]. Go west on the Sunroad. | 14s 2c | 17 |

### Chapter 5 — *Glass and Breath* (Sunscar, 17–24)

| # | id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|---|
| 5.1 | `q_ms_the_sunroad` | The Sunroad | `npc_iris_vael` | Sunroad | Reach Oasis of Tamar [visit]; at the halfway rock survive a Dust Reaver ambush (`m_folk_dust_reaver`, page 10) for 60 s [defend] | 14s 2c | 17 |
| 5.2 | `q_ms_guest_right` | Guest-Right | `npc_idris_kaan` | `town_oasis_of_tamar` | Drink at the Stepped Well [use] and give the Sandspeaker a gift: any Uncommon or better item [deliver] | 15s 27c · `rep` Sandsworn +10 | 18 |
| 5.3 | `q_ms_the_emptied_tomb` | Three Jars Home | `npc_idris_kaan` | Highcourt Lantern Row → `lm_breath_museum_site` | Talk Archivist Pell into releasing 3 breath-jars [talk; `choose`: argue, pay 5s, or trade a Rare item] and set them back in the Emptied Tomb [use ×3] | 15s 27c · `rep` Sandsworn +12 | 18 |
| 5.4 | `q_ms_redmesa_scouts` | Scouts on the Mesa | `npc_idris_kaan` | `sz_redmesa` | Kill 10 Ashtusk scouts [hunt] and their scout-captain [kill]; take the map she carries [gather] | 16s 56c | 19 |
| 5.5 | `q_ms_nahirs_trial` | The Tomb-Warden's Trial | `npc_nahir_tombwarden` | `sz_glass_flats` | Carry a lit lamp across the Glass Flats at noon (1.1 km) without letting it go out [escort-like: the lamp has 100 "flame" that drops 1/s in sun, refilled at 4 shade stones] | 17s 89c | 20 |
| 5.6 | `q_ms_the_glass_tombs` | The Glass Tombs | `npc_nahir_tombwarden` | `d05_glass_tombs` | Clear the Glass Tombs [dungeon] | 48s 12c · `class_pick` Rare | 21 |
| 5.7 | `q_ms_breath_of_kings` | The Breath of Kings | `npc_iris_vael` | Tamar | Bring the king's breath-jar to the reading [deliver]; watch the reading [talk] (phase: the well court) | 19s 25c | 21 |
| 5.8 | `q_ms_the_sallow_court` | The Sallow Court | `npc_idris_kaan` | `sz_hushed_valley` | Kill the 3 Sallow Court high priests on the Vault road [kill ×3] | 20s 64c · `crate` Uncommon | 22 |
| 5.9 | `q_ms_vault_of_the_sandsworn` | The Account | `npc_idris_kaan` | `d06_sandsworn_vault` | Clear the Vault of the Sandsworn [dungeon] | 55s 15c · `class_pick` Rare | 23 |
| 5.10 | `q_ms_the_key` | The Key | `npc_iris_vael` | Tamar | Hear the Account [talk; scene]: the Everflame is a key. Carry word to the Moonwell Circle. | 23s 52c · title *Keeper of the Account* | 24 |

### Chapter 6 — *The Dimming* (Whisperwood, 22–30)

| # | id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|---|
| 6.1 | `q_ms_the_moonroad` | Under the Silver Trees | `npc_iris_vael` | Moonroad | Reach Silverbough [visit] | 20s 64c | 22 |
| 6.2 | `q_ms_circle_keeper` | The Circle-Keeper | `npc_aelith_moonward` | `town_silverbough` | Speak with Aelith Moonward [talk] | 22s 6c | 23 |
| 6.3 | `q_ms_mad_packs` | The Mad Packs | `npc_sorrel_ashwood` | `sz_silverbough_eaves` | Kill 12 Thornmane runners [hunt]; cut 6 madness-thorns from their hides [gather] | 23s 52c | 24 |
| 6.4 | `q_ms_the_westmoon` | Water for the Westmoon | `npc_aelith_moonward` | `lm_eastmoon_well` → `lm_westmoon_well` | Carry 3 vials of moonwater across the glades [deliver]; each vial breaks if you are hit by a **danger zone** (the Thornmane howlers' cone) — broken vials refill at the Eastmoon | 25s | 25 |
| 6.5 | `q_ms_the_echo` | The Echo | (auto) | `lm_eastmoon_well` | Ysolde's Echo speaks for the first time [talk; scene] (phase: the well) | 25s · 5s | 25 |
| 6.6 | `q_ms_thornheart_hollow` | Thornheart | `npc_aelith_moonward` | `d07_thornheart` | Clear Thornheart Hollow [dungeon] | 66s 29c · `class_pick` Rare | 26 |
| 6.7 | `q_ms_greyfangs_bargain` | Greyfang's Bargain | `npc_greyfang` | `sz_fey_crossing` | `choose`: **cure** her pack (gather 8 moonpetals and use them at 4 dens) or **end** it (kill 8 packmates). Both complete. Cure: Moonwell Circle +15, Greyfang's den becomes a friendly camp. End: Thornmane grip −0.3 in the Fey Crossing for 1 real day. | 28s 6c | 27 |
| 6.8 | `q_ms_the_unwoven_cell` | The Siphons | `npc_sorrel_ashwood` | `sz_hollow_roots` | Kill 3 Unwoven drain-priests [kill ×3] and break 3 siphon stones [use ×3, each a 3 s channel while adds spawn] | 29s 63c | 28 |
| 6.9 | `q_ms_ruins_of_the_moonwell` | The Dark Well | `npc_aelith_moonward` | `d08_moonwell_ruins` | Clear the Ruins of the Moonwell [dungeon] | 78s 8c · `class_pick` Rare | 29 |
| 6.10 | `q_ms_the_dimming_ends` | The Westmoon Relit | `npc_aelith_moonward` | `lm_westmoon_well` | Relight the Westmoon [use; scene]: the King was drawing on the wells. The Circle joins the Assembly. (phase: the well glows for you) | 32s 86c · title *Moonsworn* | 30 |

### Interlude — *The Barrowking* (Highcourt, 30)

Optional for the story, required for raid `r01_barrowking`: the attunement chain `q_att_r01_*` (§9).
The story continues without it. Its first step is offered to every level-30 character by Hesper
(`npc_warden_of_bones`) as a gold `!`.

### Chapter 7 — *Ashfall* (Cinder Steppe, 28–36)

| # | id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|---|
| 7.1 | `q_ms_to_fort_ashfall` | The Northern Wall | `npc_lord_protector_edmund_vale` | Kingsroad | Reach Fort Ashfall [visit] | 29s 63c | 28 |
| 7.2 | `q_ms_commander_tarn` | On the Wall | `npc_rhosyn_tarn` | `town_fort_ashfall` | Report [talk]; man the wall 90 s against an Ashtusk probe [defend] | 31s 23c | 29 |
| 7.3 | `q_ms_the_beacon_chain` | The Beacon Chain | `npc_rhosyn_tarn` | `lm_steppe_beacon_chain` | Light all 5 beacons within 10 min [use ×5, timed; on a mount this is 4 min of riding] | 32s 86c | 30 |
| 7.4 | `q_ms_tallgrass_burning` | Tallgrass Burning | `npc_olwen_herdmother` | `sz_blackgrass` | Drive 12 cattle to the fort [escort: a herd, each head has health; 8+ must arrive] | 34s 52c · `rep` Greenhand +10 | 31 |
| 7.5 | `q_ms_the_defector` | The Prisoner in the Pit | `npc_kestrel` | `sz_warmasters_ground` | Free the orc prisoner in the pits [clear the 6 guards; use the cage] — it is Ghara (phase: Ghara's Camp opens for you) | 34s 52c · `rep` Ashtusk: Hunted → Known **for Ghara's Camp only** | 31 |
| 7.6 | `q_ms_gharas_truth` | Ghara's Truth | `npc_ghara` | `town_ghara_camp` | Hear her [talk]; kill 3 Ashtusk war-chiefs wearing the Legion's brand [kill ×3] | 36s 20c · `crate` Uncommon | 32 |
| 7.7 | `q_ms_the_warmasters_pit` | The Warmaster's Pit | `npc_ghara` | `d09_warmasters_pit` | Clear the Warmaster's Pit [dungeon] | 94s 79c · `class_pick` Rare | 33 |
| 7.8 | `q_ms_the_kings_second_offer` | The King Over the Wall | (auto) | Fort Ashfall | The King's projection above the fort makes his second offer [talk; `choose` 1 of 3 answers — saved; quoted back in r04] | 39s 65c | 34 |
| 7.9 | `q_ms_siege_of_ashfall` | The Siege of Fort Ashfall | `npc_rhosyn_tarn` | story instance `si_siege_of_ashfall` | Survive the siege: phase 1 hold the wall (180 s), phase 2 hold the breach (kill 30), phase 3 kill Overchief Torvak (`b_ashtusk_overchief`, page 10) [dungeon-like instance, 1–5 players, followers allowed] | 1g 3s 53c · `class_pick` **Epic** | 35 |
| 7.10 | `q_ms_roads_north` | Two Roads North | `npc_rhosyn_tarn` | Fort Ashfall | Take the Rimeroad to Rimehold [deliver a letter to Hallveig] | 43s 20c | 36 |

### Chapter 8 — *Rime* (Frostmantle, 34–42)

| # | id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|---|
| 8.1 | `q_ms_the_rimeroad` | The Rimeroad | `npc_rhosyn_tarn` | Rimeroad | Reach Rimehold [visit]; an Ashtusk war party raiding the southern passes crosses the road — kill 8 or ride past [visit only is required] | 41s 41c | 35 |
| 8.2 | `q_ms_hallveigs_fire` | The Long Fire | `npc_hallveig_rime` | `town_rimehold` | Sit at the Long Fire [use] and tell your story [talk; the dialog quotes your earlier `choose` answers] | 43s 20c | 36 |
| 8.3 | `q_ms_the_western_road` | Sledges on the Ice | `npc_hallveig_rime` | `sz_whitecairn_tundra` | Destroy 4 Legion supply sledges [use ×4, each guarded by 3] | 43s 20c | 36 |
| 8.4 | `q_ms_the_giants_come_down` | Hold the Stair | `npc_dagny_stairwarden` | `lm_giants_stair` | Hold the Giants' Stair 180 s against Stonehide raiders [defend]; boulders are **danger zones** (2 s warning, one-shot below 40% health) | 45s 1c | 37 |
| 8.5 | `q_ms_ulmars_word` | Ulmar's Word | `npc_dagny_stairwarden` | `sz_stonehide_peaks` | Parley with Ulmar the giant [talk; neutral for this quest] — something woke under the Throne Ice | 46s 85c | 38 |
| 8.6 | `q_ms_rimefang` | Rimefang | `npc_hallveig_rime` | `d10_rimefang_caverns` | Clear Rimefang Caverns [dungeon] | 1g 17s 12c · `class_pick` Rare | 38 |
| 8.7 | `q_ms_the_peak_king` | The Peak-King | `npc_hallveig_rime` | Hroth's hold | Kill Hroth, the Stonehide Peak-King (`b_stonehide_peakking`, page 10) [kill] **[Group 3]** — followers count | 48s 71c · `pick3` | 39 |
| 8.8 | `q_ms_saga_of_the_throne` | The Saga of the Throne | `npc_lorekeeper_ymma` | Rimehold | Hear the saga of the Glacier Throne [talk] — opens `q_att_r02_*` (§9) | 50s 60c | 40 |
| 8.9 | `q_ms_the_saltroad` | The Saltroad | `npc_hallveig_rime` | Rimehold | The west road holds; the Legion turns east. Go to Saltmarch [deliver a letter to Ottavia Brine] | 50s 60c | 40 |

*The level-40 calling quest (`q_calling_<class>_3`) and spell slot 6 arrive here.*

### Chapter 9 — *The Drowned Bell* (Drowned Coast, 40–48)

| # | id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|---|
| 9.1 | `q_ms_harbourmistress` | The Harbourmistress | `npc_ottavia_brine` | `town_saltmarch` | Present yourself at the harbour hall [talk] | 50s 60c | 40 |
| 9.2 | `q_ms_bells_under_water` | Bells Under the Water | `npc_ottavia_brine` | `sz_saltmarch_cliffs` | At night, kill 10 Drowned climbing the cliffs [hunt] and take 5 bell-clappers [gather] | 52s 51c | 41 |
| 9.3 | `q_ms_relight_lampwick` | The Lampwick Light | `npc_amos_keeper` | `lm_lampwick_light` | Carry 3 oil casks up the lighthouse stair [deliver ×3; carrying a cask slows you 30% and you cannot attack] while the Drowned climb after you | 54s 44c | 42 |
| 9.4 | `q_ms_what_the_choir_sings` | What the Choir Sings | `npc_amos_keeper` | `sz_wreckers_shore` | Stand at 3 listening posts for 30 s each [channel ×3] | 56s 39c | 43 |
| 9.5 | `q_ms_mara_dives` | The Hymnal | `npc_mara_diver` | `lm_cathedral_spire` | Dive to the spire's bell-loft and recover the old hymnal [visit + gather; breath bar 45 s, 3 air pockets] | 56s 39c | 43 |
| 9.6 | `q_ms_saltdeep` | Saltdeep | `npc_ottavia_brine` | `d11_saltdeep_cathedral` | Clear Saltdeep Cathedral [dungeon] | 1g 45s 93c · `class_pick` Rare | 44 |
| 9.7 | `q_ms_they_dig_north` | They Dig North | `npc_brother_aldo` | `sz_brinehollow_flats` | At low tide, collapse 3 Drowned tunnels [use ×3, only possible in the 10-min low tide] | 60s 37c | 45 |
| 9.8 | `q_ms_the_verse_count` | The Verse Count | `npc_iris_vael` | Saltmarch | Iris counts the verses: two remain [talk] — opens `q_att_r03_*` | 62s 40c | 46 |
| 9.9 | `q_ms_to_the_riftmarch` | Where the Ground Lets Go | `npc_iris_vael` | Saltmarch | Reach Waystone Camp [visit] | 62s 40c | 46 |

### Chapter 10 — *Unmade* (Riftmarch, 46–54)

| # | id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|---|
| 10.1 | `q_ms_waystone_camp` | The Riftwarden | `npc_iris_vael` | `town_waystone_camp` | Meet Riftwarden Cassia Dorne [talk] | 62s 40c | 46 |
| 10.2 | `q_ms_underneath` | Underneath | `npc_cassia_dorne` | `lm_weave_window` | Touch the Weave Window [use; a 40 s vision of the Veil from the Unmade side] | 64s 44c | 47 |
| 10.3 | `q_ms_rift_jumping` | Rift-Jumping | `npc_benedek_artificer` | `sz_floating_isles` | Reach the high island by 5 rift-jump pads [visitAll] | 66s 51c | 48 |
| 10.4 | `q_ms_the_half_made` | The Half-Made | `npc_cassia_dorne` | `sz_shardfall` | Kill 12 half-made [hunt]; take 6 unmade cores [gather] | 68s 60c | 49 |
| 10.5 | `q_ms_the_quiet_orchard` | Stopped Clocks | `npc_little_wynn` | `town_quiet_orchard` | Find 4 stopped clocks round the orchard [visitAll] — the last one shows the Workshop taking people | 70s 71c | 50 |
| 10.6 | `q_ms_iris_taken` | The Camp Burns | (auto) | Waystone Camp | Defend the camp 120 s [defend]; Master Ferrant takes Iris (scripted; phase: Iris is gone from the camp for you until 11.8) | 70s 71c | 50 |
| 10.7 | `q_ms_the_unmade_workshop` | The Unmade Workshop | `npc_cassia_dorne` | `d12_unmade_workshop` | Clear the Unmade Workshop [dungeon] | 1g 82s 11c · `class_pick` Rare | 51 |
| 10.8 | `q_ms_ferrants_ledger` | Ferrant's Ledger | `npc_cassia_dorne` | Waystone Camp | Read Ferrant's ledger [use] — Iris was sent to the Ashen Reliquary | 75s | 52 |
| 10.9 | `q_ms_the_last_road` | The Last Road | `npc_cassia_dorne` | Kingsroad north | Reach Last Light [visit] | 75s | 52 |

### Chapter 11 — *Last Light* (Emberthrone, 52–60)

| # | id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|---|
| 11.1 | `q_ms_last_light` | Last Light | `npc_cassia_dorne` | `town_last_light` | Report to Marshal Ansel Crane [talk] | 75s · 15s | 52 |
| 11.2 | `q_ms_brother_caddoc` | The Kindling Rite | `npc_marshal_ansel_crane` | Last Light | Hear Brother Caddoc: the Order, the rite, Ysa Varn [talk; scene] | 77s 17c | 53 |
| 11.3 | `q_ms_kiln_hollow` | Retake Kiln Hollow | `npc_marshal_ansel_crane` | `town_kiln_hollow` | Kill 15 Legion [hunt] and raise the Crown banner [use] (phase: Kiln Hollow becomes a camp for you) | 79s 36c · Kiln Hollow waystone | 54 |
| 11.4 | `q_ms_the_gate_road` | Engines on the Gate Road | `npc_marshal_ansel_crane` | `sz_cindergate_approach` | Sabotage 4 siege engines [use ×4, 3 s channel each] | 81s 58c | 55 |
| 11.5 | `q_ms_cindergate` | Cindergate | `npc_marshal_ansel_crane` | `d13_cindergate` | Clear Cindergate Bastion [dungeon] | 2g 9s 53c · `class_pick` Rare | 56 |
| 11.6 | `q_ms_slag_and_glass` | King's-Glass | `npc_emberwright_sallis` | `sz_obsidian_fields` | Gather 8 shards of king's-glass [gather from glass-knights and 4 nodes] | 86s 7c · `class_pick` **Epic** armour only | 57 |
| 11.7 | `q_ms_ysas_room` | Ysa's Room | `npc_brother_caddoc` | `sz_reliquary_caldera` | Find Ysa Varn's room in the old temple [visit; vision] | 88s 34c | 58 |
| 11.8 | `q_ms_the_ashen_reliquary` | The Ashen Reliquary | `npc_marshal_ansel_crane` | `d14_ashen_reliquary` | Clear the Ashen Reliquary and free Iris [dungeon] (phase: Iris returns) | 2g 26s 59c · `class_pick` **Epic** | 59 |
| 11.9 | `q_ms_the_last_offer` | The Last Offer | `npc_iris_vael` | `sz_ember_court_steps` | The King's last offer [talk; `choose`] — you cannot accept; your answer is saved for r04's dialog opportunity | 92s 95c | 60 |
| 11.10 | `q_ms_the_ember_king` | The Ember King | `npc_marshal_ansel_crane` | `r04_ember_court` **or** `si_kings_last_word` | Defeat Kaedros, the Ember King [event-like: kill `b_ember_king_kaedros` (page 13 §6.13) in r04 at any difficulty, **or** in the story instance] | 2g 32s 38c · `class_pick` Epic · `it_ember_heart` (quest item) · title *Kingsbane* | 60 |

### Chapter 12 — *The Spire* (Veilspire, 60)

| # | id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|---|
| 12.1 | `q_ms_the_heart_carried` | The Heart Carried | `npc_iris_vael` | Last Light → Saltmarch | Carry the Ember Heart to Saltmarch [deliver to Hale Marrow]. While carried: a soft red glow; waystones and portals work; no other effect. | 92s 95c | 60 |
| 12.2 | `q_ms_across_the_veil_sea` | Across the Veil Sea | `npc_hale_marrow` | the Lamp's Wake | Cross to Veilspire; repel 3 waves of Riftborn boarders [defend] | 92s 95c · unlocks the ship route + Spire Landing waystone | 60 |
| 12.3 | `q_ms_the_landing` | Hold the Landing | `npc_cassia_dorne` | `sz_shattered_strand` | Kill 20 Riftborn on the Strand [hunt] | 92s 95c · `rep` Spire Accord +20 | 60 |
| 12.4 | `q_ms_the_broken_pin` | The Broken Pin | `npc_ysoldes_echo` | `lm_the_broken_pin` | Climb to the empty brazier [visit; scene]: the Veil is already breached | 92s 95c | 60 |
| 12.5 | `q_ms_veilspire` | The Unwoven | `npc_ysoldes_echo` | `r05_veilspire` **or** `si_the_lamps_climb` | Defeat the Unwoven [kill `b_unwoven` (page 13 §7.15) in r05 at any difficulty, **or** in the story instance] | 2g 32s 38c · `class_pick` Epic · title *of the Spire* | 60 |
| 12.6 | `q_ms_the_last_lamp` | The Last Lamp | `npc_ysoldes_echo` | the Spire | `choose`: **Relight the Lamp** or **Take the Lamp's place** (page 01 §4) | 92s 95c · title *the Lampbearer's Heir* or *the Held Flame* · Spire flame colour (client) | 60 |
| 12.7 | `q_ms_home` | Home | `npc_iris_vael` | Brightwater | Return to the Hearthstone [visit]; Odile, Garrick, Bram and Pip are there (phase: a small feast in the square) | 92s 95c · cosmetic *Lamp of Brightwater* (a back-slot lantern) | 60 |

### 6.13 Story instances

A **story instance** is a private copy of a place for 1–5 players, built from the dungeon engine
(reuse: Farhold `js/dungeon.js`, `createDungeon({ shape, holds })`), with followers allowed and the
boss's mechanics **reduced** (page 11 vocabulary; page 13 owns the full fights).

| id | Used by | Players | What it is | vs the full version |
|---|---|---|---|---|
| `si_siege_of_ashfall` | 7.9 | 1–5 | Fort Ashfall's wall, breach and keep | no full version; this is the only siege of the fort in the story (the open-world event `ev_siege_of_fort_ashfall` is separate, §13) |
| `si_kings_last_word` | 11.10 | 1–5 | The Ember Court's throne room only | Kaedros, the Ember King (`b_ember_king_kaedros`) with 2 of r04's phases, 40% of Normal health for 5 players, no enrage; the dialog opportunity is kept |
| `si_the_lamps_climb` | 12.5 | 1–5 | The Spire's crown only | The Unwoven (`b_unwoven`) with 2 phases, no raid-only mechanics (no soaks needing more than 2 players) |

Story instances give **no raid loot** — only the story reward. The raid is where the raid gear is.

---

## 7. Feature-unlock quests

Canon pillar 1: every verb is earned. Some features unlock **by level alone** (the spell slots at
1/4/10/18/28/40 and talent tiers at 12/22/32/45 — canon); the rest unlock through a **short quest**
from the person who runs that feature, so the unlock is explained by a person, once. **Page 07 owns
the ladder** — which feature, which level, the quest id and the giver (00 §10). This table follows
page 07's ladder row for row; this page owns only the quest content (title, objective). Givers use
page 01's NPC id where page 01 already has the same person (same job, same town) under another id;
those are listed for page 07 in §18. Every unlock quest is offered with a green `!` the moment its
level is reached, **wherever you are**: the NPC's courier (a letter) or the NPC themself if you are in
their town.

| Lvl | id | Title | Giver | Where | Objective | Unlocks |
|---|---|---|---|---|---|---|
| 2 | `q_unlock_perks` *(explanation only)* | A Point to Spend | `npc_sister_wren` | Brightwater chapel | Open the perk forest and spend your first point [use: the perk screen's first node] | Nothing new: the perk forest opens **by level** at 2 (page 07). This quest explains it (reuse: Farhold `js/perks.js`) |
| 2 | `q_hv_the_long_field` | The Long Field | `npc_hv_runner_tamsin` | Brightwater | Carry Tamsin's letter to the far orchard before the bell rings: a 60-second route [deliver, timed] | **Sprint** |
| 3 | `q_hv_the_herbwifes_basket` | The Herbwife's Basket | `npc_hv_herbwife_orla` | Brightwater orchards (`sz_old_orchards`) | Gather 5 herbs [gather]; she brews your first 2 health potions | **Potion belt**, 2 slots |
| 4 | *(level only)* | — | — | — | — | Spell slot 2 (card only, no quest) |
| 5 | `q_hv_fall_and_rise` | Feet First | `npc_hesk` | Brightwater drill yard | Dodge 5 of Hesk's swings [channel-like: 5 successful dodges through a **danger zone** telegraph, 1.5 s warning], then dodge through 3 thrown pots | **Dodge roll** (page 05 owns its numbers) |
| 6 | `q_calling_<class>_1` | (§8) | `npc_ollin_courier` | (§8) | (§8) | **Calling I** — the class mechanic |
| 6 | `q_hv_the_barrow_bell` | Five Torches | `npc_odile_marsh` | Brightwater | Open the group finder and queue for, or walk into, the Hollow Barrow with a group or followers [visit d01 entrance] | **Group finder** (page 15) and the **dungeon journal** (page 12) |
| 7 | `q_hv_a_bed_by_the_fire` | A Bed by the Fire | `npc_hv_innkeeper_bram` | the Lamp and Ladder, Brightwater | Take a room [talk] and set your Homeward Stone at the inn [use] | **Homeward Stone** (`it_homeward_stone`, page 01 §10.2) and the first 8-slot bag |
| 8 | `q_mf_coin_for_a_blade` | Hired Hands | `npc_mf_broker_wendel` | Reedhollow | Hire your first follower (free, one zone's length) [use: the broker screen] and win one fight beside them | Followers, slot 1 (reuse: Farhold `js/followers.js`) |
| 9 | `q_mf_what_the_fen_gives_back` | Scrap and Spark | `npc_mf_scrapwright_hesk` | Reedhollow | Salvage 3 items [use] and forge 1 base item from the materials at the bench [use] | Salvage + the forge (reuse: Farhold `js/craft.js`) |
| 9 | `q_unlock_boats` | Mind the Punt | `npc_corwin_reed` | `town_stillwater_landing` | Ride the punt [visit]; row a raft 100 m [use] | Boats (page 01 §10.6) |
| 10 | *(level only)* | — | — | — | — | Spell slot 3; duels (page 07) |
| 10 | `q_hc_saddle_and_bridle` | Trouble in the Stable | `npc_oswin_stablemaster` | `hc_stable_gate` | Catch the runaway horse *Trouble* in the crownlands [chase beat, reuse `events.json` `chase`: 120 s, escape at 60 m] and ride it back [visit] | **Riding I** (+60%, 8.6 m/s) and *Trouble*, a Trail Horse (`it_mount_trail_horse`), as your first mount |
| 10 | `q_hc_hold_the_line` | Hold the Line | `npc_hc_shieldmaster_varr` | `hc_wardens_yard` barracks | Pull 3 sparring partners off a recruit and hold them for 20 s [defend] — offered only to the eight tank-capable classes | **Challenge** |
| 11 | `q_hc_keys_to_the_city` | Keys to the City | `npc_hc_herald_aldous` | Highcourt South Gate → `hc_coinhall` | Three stops: deposit 1 item with Ottoline Crane [use]; send 1 letter at the Mailhouse [use]; post 1 listing at the Exchange with Fitch Marrow [use] | **Bank**, **mail** and **market** (the auction house) |
| 12 | `q_unlock_talents` *(explanation only)* | The Second Thought | your class trainer | `hc_hall_of_callings` | Pick your first talent [use] | Talent tier 1 is open by level; this quest is the explanation and pays a free respec token |
| 12 | `q_hc_the_waywardens_oath` | Lit Stones | `npc_hc_waywarden_liss` | Highcourt's waystone (South Gate square) | Travel by waystone from Highcourt to Brightwater, then to Reedhollow [use ×2] | **Waystone travel** (page 01 §10.2) |
| 12 | `q_unlock_portals` | Doors in the Court | `npc_ysra_portalwarden` | `hc_portal_court` | Use a portal to a hub you have lit and come back [visit ×2] | Highcourt portals |
| 12 | *(level only)* | — | `npc_the_unbinder` | `hc_hall_of_callings` | — | The Unbinder (retraining) |
| 15 | `q_hc_a_name_on_the_rolls` | Signatures | `npc_melisande_hart` | `hc_guild_row` | Read the charter [talk] (founding a guild: 4 other signatures and 10 gold, page 15) | **Guild charter** (founding; anyone may join a guild from level 1) |
| 16 | `q_gr_the_second_hammer` | The Second Hammer | `npc_bodric_ashlock` | the First Forge, Anvilgate | Temper 1 affix and promote 1 item at the bench [use ×2] | **The upgrade bench**: temper, promote |
| 20 | `q_calling_<class>_2` | (§8) | your trainer | (§8) | (§8) | **Calling II** |
| 20 | `q_ss_the_sand_runners` | The Sand Runners | `npc_zelde_marrach` | `town_dunehold` (page 07: Oasis of Tamar) | Race a caravan's outriders across the dunes [visit, timed] | **Riding II** (+100%, 10.8 m/s) and a Dune Strider (`it_mount_dune_strider`) |
| 20 | `q_hc_the_proving_yard` | The Ring | `npc_brakka_arena` | `hc_wardens_yard` | Win 1 practice match against followers | **Battlegrounds and war mode** (page 15). Duels open by level at 10 and rated arenas by level at 60 (page 07) |
| 25 | `q_unlock_skyways` | Kite Lines | `npc_tamsin_roost` | Stable Gate tower | Fly your first route Highcourt → Anvilgate [visit] | Skyways (fixed routes; not flying — that is Riding IV at 60) |
| 25 | `q_ww_the_moonwell_mirror` | The Moonwell Mirror | `npc_ww_glamourist_eluned` | `town_silverbough` | Change one equipped item's look to an appearance you have collected [use] | **The wardrobe** |
| 30 | `q_hc_two_minds_one_will` | Two Minds, One Will | `npc_the_unbinder` | `hc_hall_of_callings` | Save a second build and switch to it [use ×2] | **Dual spec** |
| 30 | `q_hc_the_barrowkings_seal` | (§9) | `npc_warden_of_bones` | `hc_undercroft` | (§9, r01 chain) | Raid: Crypt of the Barrowking |
| 34 | `q_cs_brands_in_the_ash` | Brands in the Ash | `npc_cs_runewright_gorsa` | `town_fort_ashfall` | Inscribe, reweave, recast or brand 1 item [use] | **The upgrade bench, second voice** |
| 40 | `q_calling_<class>_3` | (§8) | your trainer | (§8) | (§8) | **Calling III** |
| 40 | `q_dc_the_tide_steed` | The Tide Steed | `npc_dc_tidewright_morwen` | `town_saltmarch` → a sea cave | Tame a Tide Steed in the cave [use; a 90 s ride to calm it] | **Riding III** (mounts swim and leap) and the Tide Steed (`it_mount_tide_steed`) |
| 42 | `q_fm_frost_under_the_throne` | (§9) | `npc_hallveig_rime` | `town_rimehold` | (§9, r02 chain) | Raid: The Glacier Throne |
| 50 | `q_dc_the_choir_calls` | (§9) | `npc_amos_keeper` | `town_saltmarch` | (§9, r03 chain) | Raid: The Sunken Choir |
| 60 | `q_el_the_heroic_road` | Harder Doors | `npc_marshal_ansel_crane` | `town_last_light` | Complete any 3 dungeons on Normal at level 60 [dungeon ×3] | Heroic dungeons |
| 60 | `q_el_the_keystone_vow` | The Turning Key | `npc_el_keywarden_orrin` | `town_last_light` | Offered after one Heroic dungeon: complete any 1 Heroic dungeon [dungeon] | Mythic+ and your first keystone (page 12) |
| 60 | `q_el_the_ember_court_gates` | (§9) | `npc_marshal_ansel_crane` | `town_last_light` | (§9, r04) | Raid: The Ember Court |
| 60 | `q_vs_beyond_the_veil` | (§9) | `npc_vs_veilwarden_isaure` | `town_spire_landing` | (§9, r05 chain) | Veilspire Isle and raid: Veilspire |
| 60 | `q_unlock_spire_accord` | The Accord | `npc_quartermaster_wend` | `town_spire_landing` | Needs 12.2. Do your first Spire Accord daily [§12] | Veilspire dailies and the Accord vendor |
| 60 | `q_sky_1` … `q_sky_5` | The Sky (chain) | `npc_el_skywright_aveline` | `town_last_light` | 1 *The First Feather*: a storm feather from 3 different world bosses · 2 *The Ember Court's Wings*: defeat the Ember Court's winged boss (`b_vaelkyr_emberwing`, page 13) · 3 *Proof in the Dark*: a Mythic+ key of 10+ in time · 4 *Standing*: Kindred with any two region factions · 5 *The Stormwing*: ride a wild Stormwing until it accepts you (page 07) | **Riding IV — flying** (+150% flying, 13.5 m/s). Before this, winged mounts run and glide |

Level-only unlocks (no quest, only an unlock card; page 07): the perk forest (2), spell slots 2–6
(4, 10, 18, 28, 40), player trade (5), bag slots (7, 14, 24, 36), duels (10), talent tiers 1–4 (12,
22, 32, 45), the Unbinder (12), follower slots 2, 3 and 4 (15, 25, 35), the potion belt's 4 slots
(16), and at 60 Renown, rated arenas and daily/weekly quests. This page also proposes the Homeward
Stone's cooldown dropping to 15 min at level 30 — **not on page 07's ladder** (§18).

---

## 8. Class calling quests (6 / 20 / 40)

Canon: each class has three calling quests at **6, 20 and 40**, and each **grants or upgrades the class
mechanic**. The **class files** (`classes/<id>.md`, template step 2) own *what* the mechanic gains.
This page owns the **ids, titles, givers, places and shape**; a class file may rename a title (the id
stays).

### 8.1 Shape of every calling

| | Calling 1 | Calling 2 | Calling 3 |
|---|---|---|---|
| Id | `q_calling_<class>_1` | `q_calling_<class>_2` | `q_calling_<class>_3` |
| Level | 6 | 20 | 40 |
| Offered by | `npc_ollin_courier` delivers a letter from your trainer, wherever you are (a courier walks up to you on the road, or it waits in the mailbox) | your trainer in `hc_hall_of_callings` (a letter if you are elsewhere) | your trainer |
| Steps | 3: read the letter → a class task in Hearthvale or Mossfen → a trial at `lm_calling_stones` | 5: talk → 2 class tasks in Greyridge, Sunscar or Whisperwood's Eaves → a **calling trial** instance → return | 6: talk → 3 class tasks in Frostmantle, the Drowned Coast or the Cinder Steppe → a calling trial with a **trial boss** → return |
| Trial | a 2-minute solo scenario at the stones: a mechanic tutorial with a pass mark | `ct_<class>_2`: solo instance, 4–6 min, three rooms that each test the mechanic | `ct_<class>_3`: solo instance, 6–8 min, ends in a boss built to test the mechanic at its new strength |
| Group | solo only (followers are dismissed in trials) | solo | solo; one task per class is flagged **[Group 3]** for a small bonus (not required) |
| Reward | the mechanic's first grant/upgrade + a class cosmetic (tabard) + `class_pick` Uncommon | upgrade 2 + a class weapon look + `class_pick` Rare | upgrade 3 + the class's title + `class_pick` Epic |
| Failing a trial | restart at once, no cost | same | same |

### 8.2 All ninety

The **Grants** column is the brief from canon §6's signature mechanic; the class files expand it.
Places are the class task's main location (sub-zone ids from page 01).

| Class | `_1` (6) title · place | `_2` (20) title · place | `_3` (40) title · place | Grants (1 → 2 → 3) |
|---|---|---|---|---|
| warrior | The Shield Wall · `town_harrow_watch` | Outnumbered · `sz_kettle_pass` | The Last to Fall · `sz_stonehide_peaks` | block charges from Shield Bash → Unbreakable when outnumbered → Unbreakable spreads to nearby allies |
| fighter | Three Ways to Stand · Brightwater drill yard | The Precise Cut · `sz_redmesa` | Master of Stances · `sz_rimehold_valley` | Offense/Defense stances → Precision stance → stance-dance (swap without cooldown on a combo) |
| paladin | The First Oath · `lm_ysoldes_well` | Oath of the Road · `sz_highcairn_moors` | The Oathkeeper's Vigil · `sz_sunken_quarter` | first oath → second oath choice → sworn aura carries two oaths |
| ranger | The Cat in the Orchard · `sz_old_orchards` | Marked Prey · `sz_dune_sea` | The Long Hunt · `sz_whitecairn_tundra` | the hunting cat → marks → the cat hunts marked prey on its own |
| rogue | Out of the Light · `sz_southwood` | Five Points of the Knife · `sz_cutstone_quarries` | The Unseen Hand · `sz_wreckers_shore` | stealth + openers → combo points to 5 → finishers restealth |
| cleric | The Overflowing Cup · Brightwater chapel | Devotion's Shield · `sz_tamar_oasis` | Raise Them All · `sz_saltmarch_cliffs` | Devotion banking → overheal becomes a shield → mass resurrection |
| bard | The First Verse · `town_millbrook` | A Song for the Road · `town_dunehold` | The Grand Finale · `town_rimehold` | one song → verses build → finale |
| mage | Charge and Release · `lm_calling_stones` | The Arcane Ledger · `sz_glass_flats` | The Fourth Charge · `sz_throne_ice` | 2 Arcane Charges → 3 → 4 charges and a big spender |
| necromancer | What the Barrows Gave · `sz_barrow_downs` | A Thrall of One's Own · `sz_highcairn_moors` | The Corpse-Lord's Due · `sz_sunken_quarter` | corpses → thralls → detonate/command many |
| warlock | The Pact · `sz_lantern_marsh` | Shards of Another's Soul · `sz_hushed_valley` | Paid in Full · `sz_wreckers_shore` | the pact → soul shards → DoTs spread on shard spend |
| demon_hunter | The Brand of Vengeance · `sz_barrow_downs` | What Burns Within · `sz_glass_flats` | The Demon Form · `sz_sunken_quarter` | Vengeance gauge → fuel from fallen allies → Demon Form |
| scavenger | Junk Is a Weapon · Sootwick camp | The Pack Grows · `sz_cutstone_quarries` | Scrapking · `sz_wreckers_shore` | collect scrap → throw it → build with it |
| swashbuckler | A Little Flair · `town_brightwater` (the quay) | Grandeur · `town_oasis_of_tamar` | The Crowd Roars · `town_saltmarch` | Flair stacks → Grandeur release → Grandeur resets on kill |
| dragon_knight | The First Aspect · `sz_southwood` | Three Breaths · `sz_bellows_heights` | Wings of the Drake · `sz_rimefang_glacier` | fire aspect → ice/storm aspects → **Dragon Form** (canon: at 40) |
| pyromancer | Holding Heat · Brightwater forge | The Overheat · `sz_glass_flats` | The Venting Furnace · `sz_charred_barrows` | Heat gauge → overheat empowerment → controlled vent |
| stormcaller | Static in the Hair · `lm_harrow_beacon` | The Totem on the Hill · `sz_highcairn_moors` | Eye of the Storm · `sz_saltmarch_cliffs` | Static charges → storm totems → chains between totems |
| druid | The Bear and the Cat · `sz_southwood` | The Owl's Sight · `sz_silverbough_eaves` | The Stag King · `sz_whitecairn_tundra` | Bear + Cat forms → Owl form → Stag form |
| oracle | The Seen Blow · `lm_calling_stones` | A Shield Before the Strike · `sz_redmesa` | The Far Sight · `sz_saltmarch_cliffs` | see telegraphs 0.5 s early → pre-shields → foresight on the whole group |
| tactician | Orders · Brightwater drill yard | The Battle Plan · `sz_kettle_pass` | The General's Table · `sz_rimehold_valley` | commands followers → battle plans → commands players |
| chronomancer | The Five-Second Ghost · `lm_old_mill_wheel` | Rewind · `sz_glass_flats` | The Echo of Everything · `sz_rimefang_glacier` | 5 s ghost → rewind → echo spells |
| monk | Chi from Stillness · `town_oakhollow` | The Flowing Combo · `sz_tamar_oasis` | The Hundred Steps · `lm_giants_stair` | Chi → flow combos → hundred-step finisher |
| shaman | Earth and Fire · `sz_wend_banks` | Water and Air · `sz_tamar_oasis` | The Spirit Council · `sz_rimehold_valley` | 2 totem slots → all 4 → spirits speak through totems |
| witch_hunter | Silver · `sz_lantern_marsh` | The Verdict · `sz_hushed_valley` | The Final Purge · `sz_wreckers_shore` | silver marks → Verdict → purge spreads to marked |
| knight | The Banner · `town_harrow_watch` | The Vow of Protection · `sz_bellows_heights` | The Standard Unbroken · `sz_stonehide_peaks` | the banner → Vow of Protection → banner rallies the fallen |
| sorcerer | The Wild Roll · `lm_sunken_shrine` | Surge · `sz_dune_sea` | The Chaos Table · `sz_throne_ice` | random element → surges → the chaos table |
| runesmith | The First Rune · Brightwater forge | Runes Beneath · `sz_deepdelve_slopes` | The Great Detonation · `sz_rimefang_glacier` | weapon rune → ground runes → chained detonation |
| shadow_dancer | Two Shadows · `sz_southwood` | The Swap · `sz_redmesa` | The Dance of Many · `sz_whitecairn_tundra` | a shadow clone → swap → several shadows |
| tinker | Scrap and Sentry · Brightwater forge | Overclock · `sz_cutstone_quarries` | The Masterwork · `sz_whitecairn_tundra` | sentry → overclock → a masterwork gadget |
| priest | Light and Shadow · Brightwater chapel | Tipping the Scale · `sz_hushed_valley` | The Balanced Soul · `sz_sunken_quarter` | the Light/Shadow slider → full swing bonuses → both ends at once for 8 s |
| enchanter | A Friendly Word · `town_ninewillow` | Sleep · `sz_silverbough_eaves` | The Crown of Will · `sz_sunken_quarter` | charm a weak enemy → sleep/control → dominate a champion |

Every place above obeys rule 3.3.1: calling 1 stays in sub-zones starting at level 8 or lower,
calling 2 at 22 or lower, calling 3 at 42 or lower (a node test checks it, §17).

---

## 9. Dungeon and raid attunements

**Dungeons (5 players)** have no attunement quests. Entry rules (page 12 owns): Normal opens at the
dungeon's band minimum − 1 from the group finder, or walking in; Heroic needs level 60 and
`q_el_the_heroic_road`; Mythic+ needs `q_el_the_keystone_vow` and a keystone (page 07's ladder).

**Raids** each have a short attunement chain — a **reason** to be at the door, and a check that you
have seen the region's story. Attunement is per character, forever. Group finder raid queues check it.
The **last step of each chain is page 07's raid-unlock quest** (same id, same level); the steps before it
are this page's.

| Raid | Chain | Steps (id · giver · objective) | Level |
|---|---|---|---|
| `r01_barrowking` | **The Seven Seals** | 1 `q_att_r01_bones_speak` · `npc_warden_of_bones` · hear what stirs under the city [talk] → 2 `q_att_r01_three_keys` · Hesper · take a seal-key from the last boss of d01, d03 and d04 (any difficulty) [gather ×3] → 3 `q_att_r01_the_cairn_door` · `npc_moira_cairnwife` · wake the back door at `lm_highcairn_stones` [use] → 4 `q_hc_the_barrowkings_seal` (page 07's unlock) · Hesper · open the Undercroft door with the three keys [use] | 30 |
| `r02_glacier_throne` | **The Saga's End** | 1 `q_att_r02_the_saga` · `npc_lorekeeper_ymma` · (auto from 8.8) → 2 `q_att_r02_frost_sigils` · Ymma · 3 frost-sigils from d10's bosses [gather ×3] → 3 `q_att_r02_the_ruin_falls` · Ymma · Bronze or better in one Standing Ruin world boss fight [event] → 4 `q_fm_frost_under_the_throne` (page 07's unlock) · Hallveig · carve the door-rune on the Throne Ice [use] | 42 |
| `r03_sunken_choir` | **Two Verses** | 1 `q_att_r03_the_count` · `npc_iris_vael` (auto from 9.8) → 2 `q_att_r03_the_hymnal_page` · Amos · the torn hymnal page from d11's last boss [gather] → 3 `q_att_r03_silence_the_buoys` · Mara · silence all 5 bell buoys within 5 min [use ×5, timed] **[Group 3]** → 4 `q_dc_the_choir_calls` (page 07's unlock) · Amos · dive to the Choir Deeps door [visit] | 50 |
| `r04_ember_court` | **The Causeway** | 1 = main story 11.8 done → 2 `q_el_the_ember_court_gates` (page 07's unlock) · `npc_marshal_ansel_crane` · hold the causeway 180 s so the resistance can plant a gate-charge [defend] | 60 |
| `r05_veilspire` | **The Lamp's Climb** | 1 = main story 12.4 done → 2 `q_att_r05_accord` · `npc_quartermaster_wend` · reach **Trusted** with the Spire Accord → 3 `q_vs_beyond_the_veil` (page 07's unlock) · `npc_vs_veilwarden_isaure` (with Ysolde's Echo) · three embers: one from `r04_ember_court` (any difficulty, the raid only) and two from Veilspire dailies [gather ×3] | 60 |

Note for page 13: r05's attunement asks for the **raid** kill of the Ember King (`b_ember_king_kaedros`, not the story
instance), so the 20-player raid is entered by players who have raided together before.

---

## 10. Side quests by region

Seven per region (84 in all), each a hand-written quest with a fixed giver. **[Group N]** = built for
N players (followers fill slots; soloing is possible but slow). Reward column: tier from §4.1 and the
item kind from §4.3; `rep` = standing (a Farhold deed-sized amount: +6 for an ordinary side quest,
+10 for a chain end). `World state` = the quest changes the shared world for everyone for a stated
real time (the change and its timer are listed).

### 10.1 Hearthvale (1–6) — `q_hv_*`

| id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|
| `q_hv_pie_thief` | The Pie Thief | `npc_pip_underbough` | `sz_old_orchards` | Follow the crumbs to a fox den [visit]; get 3 pies back from the foxes [gather] | side · coin · a pie (heals 100% out of combat, 1 use) | 2 |
| `q_hv_courier_satchel` | The Courier's Satchel | `npc_ollin_courier` | `sz_wend_banks` | Find Ollin's satchel on the river bed [swim, gather]; river crabs guard it | side · `choice` | 3 |
| `q_hv_the_old_wheel` | The Old Wheel | `npc_tansy_miller` | `lm_old_mill_wheel` | Bring 6 fallen timbers from the Southwood [gather] and set 3 planks in the race [use ×3] | side · coin · **world state:** the east-road shortcut opens for everyone for 24 real hours | 3 |
| `q_hv_hedge_knives` | The Hedge Knives (1 of 2) | `npc_bram_fenwick` | `sz_wend_banks` | Kill 8 Hedge Knives on the east road [hunt] | side · coin | 4 |
| `q_hv_hollis_crane` | Hollis Crane (2 of 2) | `npc_bram_fenwick` | `lm_southwood_gibbet` → `sz_southwood` | Read the gibbet's notice [use], then kill Hollis Crane [kill] | side_chain_end · `class_pick` Uncommon · `rep` Vale Wardens +10 | 5 |
| `q_hv_wrens_herbs` | Bloodroot for the Chapel | `npc_sister_wren` | `sz_southwood` | Gather 8 bloodroot [gather from nodes, personal] | side · `materials` + 5 minor health potions | 4 |
| `q_hv_bramblecoat` | Bramblecoat **[Group 3]** | `npc_pip_underbough` | `sz_old_orchards` | Kill Bramblecoat, the thorn-grown boar (rare elite) [kill] | side_chain_end · `pick3` | 5 |

### 10.2 Mossfen (5–12) — `q_mf_*`

| id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|
| `q_mf_leech_cure` | Bladders for the Healer | `npc_neve_hollis` | `sz_reedhollow_shallows` | Gather 10 leech bladders from leech swarms [gather] | side · `materials` | 6 |
| `q_mf_the_bog_bodies` | Rites for the Bog | `npc_brother_aldo` | `sz_peat_cuts` | Dig up 3 bog bodies [use] and speak the rite over each [channel 5 s ×3]; one sits up | side · coin · `rep` Quiet Wake +6 | 8 |
| `q_mf_smugglers_run` | A Crate Nobody Opened | `npc_saskia_venn` | Peatmoor → `town_stillwater_landing` | Carry a sealed crate to Corwin Reed [deliver]. Two Fenfolk wardens on the causeway ask to look inside — `choose`: lie, bribe (1s), or hand it over (quest fails, Fenfolk +6) | side · coin ×2 · `rep` Cutwater +10 | 8 |
| `q_mf_ninewillow_lights` | Light the Posts | `npc_neve_hollis` | `lm_lamp_posts` | At dusk, light all 12 lamp posts [use ×12] within 4 real minutes | side · coin · **world state:** no false lights in the Lantern Marsh for 1 real hour | 9 |
| `q_mf_peat_barge` | The Peat Barge | `npc_corwin_reed` | `lm_peat_wreck` | Dive and raise 4 crates [use ×4]; `choose`: give them to the Cutwater or to the Fenfolk | side · `choice` · `rep` +10 to the chosen one | 9 |
| `q_mf_the_hag_ring` | The Hag Ring | `npc_iris_vael` | `lm_hagsbog_ring` | Turn the six stones so every carving faces the moon [solve; the moon's position in the sky is the clue] | side · coin · +1 perk point (the landmark's once-per-character gift) | 10 |
| `q_mf_the_reedmother` | The Reedmother **[Group 3]** | `npc_mother_ilse` | `sz_hagsbog` | Kill the Reedmother (rare elite) [kill] | side_chain_end · `pick3` | 11 |

### 10.3 Highcourt (10–14) — `q_hc_*`

| id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|
| `q_hc_letters_astray` | Letters Astray | `npc_posy_quill` | all districts | Deliver 6 misrouted letters across the city [deliver ×6] — a second tour, off the main streets | side · coin | 10 |
| `q_hc_the_empty_seat` | Books About the Lampbearer | `npc_archivist_pell` | across the city | Find 5 books about Ysolde in 5 districts [visitAll + use] | side_chain_end · title *Lamp-Reader* | 10 |
| `q_hc_crownland_wolves` | Wolves at the Wall | `npc_captain_aldous_fenn` | crownlands | Kill 10 crownland wolves [hunt] | side · coin | 10 |
| `q_hc_the_lost_ledger` | The Lost Ledger | `npc_ottoline_crane` | Coinhall → Low Wharf | Catch the clerk who ran with a vault ledger [chase beat: 120 s, escape at 60 m, reuse `events.json` `chase`] | side · coin ×2 | 11 |
| `q_hc_undercroft_rats` | Rats Under the Rise | `npc_warden_of_bones` | `hc_undercroft` | Kill 12 catacomb rats and the rat-king [hunt + kill] | side · `crate` | 11 |
| `q_hc_barge_pirates` | The River Toll | `npc_jory_barge` | Slowwater, the barge | Defend the barge 90 s from river thieves [defend] | side · coin · `rep` Crown +6 | 12 |
| `q_hc_arena_novice` | Three Bouts | `npc_brakka_arena` | `hc_wardens_yard` | Win 3 practice bouts against NPC fighters [kill ×3, non-lethal] (needs `q_hc_the_proving_yard` at 20 — **exception:** this is the arena's pre-unlock taster and uses the practice ring only) | side · coin · cosmetic arena wraps | 12 |

### 10.4 Greyridge (10–18) — `q_gr_*`

| id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|
| `q_gr_toll_or_ford` | Pay or Wade | `npc_count_ambrose_penn` | `lm_stonebridge_toll` | `choose`: pay the toll 3 times [pay ×3] (Stone Count +10) **or** clear the high ford of 8 rock lizards [hunt] (Deepforge +6, Stone Count −3) | side · coin | 12 |
| `q_gr_runaway_rams` | Runaway Rams | `npc_jessup_cole` | `sz_kettle_pass` | Herd 6 ridge rams into the quarry pen [escort: rams run from you; walk behind them] | side · coin | 12 |
| `q_gr_rune_sentinels` | Rogue Sentinels | `npc_jessup_cole` | `sz_cutstone_quarries` | Destroy 4 rogue rune sentinels [kill ×4] and shut their 4 pylons [use ×4] | side · `crate` | 13 |
| `q_gr_the_old_seam` | Dig It Out | `npc_gruna_delver` | `lm_old_rail_collapse` | Clear the collapse over 3 visits, one dig a real day [use ×3, a 20 s channel with a rockfall **danger zone**] (reuse: Farhold `dig_it_out` frame) | side_chain_end · opens the Old Seam instance for you | 14 |
| `q_gr_the_nine_cairns` | The Nine Cairns | `npc_moira_cairnwife` | `lm_highcairn_stones` | Relight the cairns in the order the Cairnwife's rhyme gives [solve] | side · +1 perk point (once) | 15 |
| `q_gr_gravel_tusk` | Gravel-Tusk **[Group 3]** | `npc_hilda_ironbraid` | `sz_deepdelve_slopes` | Kill Gravel-Tusk (rare elite) [kill] | side_chain_end · `pick3` | 15 |
| `q_gr_branding` | A Brand of Your Own | `npc_bodric_ashlock` | `sz_bellows_heights` | Bring 3 fire essences from Bellows salamanders [gather] | side · `extras.brand` (one free weapon brand, reuse: Farhold branding) | 17 |

### 10.5 Sunscar (16–24) — `q_ss_*`

| id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|
| `q_ss_shade_for_cutters` | Water for the Salt-Cutters | `npc_orsa_glassblower` | `town_saltwell` | At midday, deliver 6 water skins to cutters on the pans [deliver ×6] — Heatstroke applies | side · coin | 17 |
| `q_ss_dunehold_caravan` | The Dunehold Caravan | `npc_zelde_marrach` | Tamar → Dunehold | Escort the caravan [escort; a Dust Reaver ambush at 60% of the route] (reuse: `caravans.js`) | side · coin ×1.5 · `rep` Sandsworn +6 | 18 |
| `q_ss_glass_charms` | Glass for Charms | `npc_orsa_glassblower` | `sz_glass_flats` | Gather 10 clear glass shards from glass constructs [gather] | side · a cosmetic glass charm (hip) | 19 |
| `q_ss_the_crown_factor` | The Crown's Dig | `npc_captain_dray_holloway` | `sz_redmesa` | `choose`: guard the Crown's dig 120 s [defend] (Crown +10, Sandsworn −5) **or** spoil it: break 3 winches [use ×3] (Sandsworn +10, Crown −3) | side_chain_end · `class_pick` Uncommon | 19 |
| `q_ss_scorpion_queen` | The Stone Queen **[Group 3]** | `npc_nahir_tombwarden` | `sz_redmesa` canyons | Kill the Stone Scorpion Queen (rare elite) [kill] | side_chain_end · `pick3` | 20 |
| `q_ss_buried_gate` | The Buried Gate | `npc_idris_kaan` | `lm_buried_gate` | During an `ev_sandstorm_ruins` event, enter the Buried Gate and bring back the gatekeeper's seal [event + gather] | side · `crate` Rare floor | 22 |
| `q_ss_the_sallow_herald` | The Herald's Bell | `npc_nahir_tombwarden` | `sz_hushed_valley` | Kill the Sallow Herald [kill] and take its tongue-bell [gather] — the Sallow Court's warning bell | side · coin · lore | 23 |

### 10.6 Whisperwood (22–30) — `q_ww_*`

| id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|
| `q_ww_hartsrest_dispute` | The Marked Grove | `npc_hobb_greenhand` | `town_hartsrest` | `choose`: fell 6 marked trees [use ×6] (Greenhand +10, Circle −3) **or** refuse and plant 6 saplings Hobb can cut in ten years [use ×6] (Circle +10, Greenhand −3) | side · coin | 23 |
| `q_ww_mend_the_rootstair` | Mend the Rootstair | `npc_aelith_moonward` | `lm_rootstair` | Carry 6 living-root cuttings up from Mossfen [deliver] and bind them [use] | side · coin · **world state:** a faster Rootstair path for everyone for 24 real hours | 24 |
| `q_ww_spirit_stag` | The White Hart | `npc_sorrel_ashwood` | `lm_hunting_blind_harts` | Call the spirit stag [use] and defeat it without killing it (reduce to 10%) [kill-like: `defeat`] | side · a cosmetic antler charm | 25 |
| `q_ww_rotbloom_pods` | Seed-Pods | `npc_aelith_moonward` | `sz_thornheart` edge | Burn 10 Rotbloom seed-pods [use ×10]; burning one spawns 2 thornlings | side · coin | 25 |
| `q_ww_echo_notes` | What the Echo Said | `npc_iris_vael` | 3 moonwells | Listen at 3 moonwells for 30 s each [channel ×3] | side · lore · coin | 27 |
| `q_ww_the_walking_circle` | The Walking Circle | `npc_iris_vael` | `lm_walking_circle` | Find the circle (one of 5 spots, moves every real hour) [visit] and solve it [solve] | side · +1 perk point (once) | 26 |
| `q_ww_brood_nest` | The Nest Under the Crossing **[Group 5]** | `npc_sorrel_ashwood` | `sz_fey_crossing` | Clear the brood nest [clear] and kill its matriarch (elite; **not** the world boss) [kill] | side_chain_end · `pick3` | 28 |

### 10.7 Cinder Steppe (28–36) — `q_cs_*`

| id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|
| `q_cs_quartermasters_list` | The Quartermaster's List | `npc_bex_quartermaster` | `sz_ashfall_marches` | Gather 10 hyena hides [gather] and 6 bars of ash-iron from war-camp racks [use ×6] | side · `materials` | 29 |
| `q_cs_tallgrass_moves` | Moving Day | `npc_olwen_herdmother` | `town_tallgrass` | Escort the tent-town's wagons to their next spot [escort] | side · coin · `rep` Greenhand +6 | 30 |
| `q_cs_grass_fires` | Burning Grass | `npc_olwen_herdmother` | `sz_blackgrass` | Put out 8 grass fires with water-sacks [use ×8, each fire spreads by 2 m every 5 s] | side · coin | 31 |
| `q_cs_the_trophy_field` | The Trophy Field | `npc_ghara` | `lm_trophy_field` | Pull down 5 trophy poles [use ×5]; carry the bones to Ghara's Camp [deliver] | side · `rep` Ashtusk (Ghara's Camp) +10 | 32 |
| `q_cs_kestrels_maps` | Map the Camps | `npc_kestrel` | `sz_ashtusk_holds` | Scout 4 war camps [visitAll; entering a camp's 20 m ring spotted = the camp aggroes; unseen = bonus coin ×1.5] | side · coin | 33 |
| `q_cs_carrion_perches` | Perches | `npc_rhosyn_tarn` | `sz_charred_barrows` | Kill 12 carrion birds [hunt] and burn 3 perches [use ×3] | side · `crate` | 34 |
| `q_cs_overchiefs_camp` | Break the War Camp **[Group 5]** | `npc_ghara` | Ashtusk war camp | Take the Ashtusk war camp: kill Torvak the Overchief and every guard (reuse: Farhold R27 M10 war camps — a camp is taken when its last guard falls) [clearSites] | side_chain_end · `pick3` · Ashtusk warband grip −0.3 for 1 real day | 35 |

### 10.8 Frostmantle (34–42) — `q_fm_*`

| id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|
| `q_fm_firewood` | Firewood in a Blizzard | `npc_aske_trapper` | `sz_whitecairn_tundra` | During a blizzard, gather 12 dead-wood [gather] and deliver to Whitecairn [deliver] (Frostbite applies; offered only in blizzard weather) | side · coin ×1.5 | 35 |
| `q_fm_aske_hunts` | The Old Bull | `npc_aske_trapper` | `sz_whitecairn_tundra` | Kill the mammoth-kin bull *Old Frostback* (named) [kill] | side · `crate` | 36 |
| `q_fm_the_longship` | The Ice-Bound Longship | `npc_lorekeeper_ymma` | `lm_frozen_wreck` | Chip the longship free [use ×5] and recover its saga-stone [gather] | side · lore · coin | 37 |
| `q_fm_giants_ramp` | A Ramp for the Stair | `npc_dagny_stairwarden` | `lm_giants_stair` | Carry 5 stone blocks to the side ramp [deliver ×5; carrying slows 30%] | side · coin · **world state:** the ramp opens for 24 real hours | 38 |
| `q_fm_aurora_stones` | The Aurora Stones | `npc_lorekeeper_ymma` | `lm_aurora_stones` | At night, stand at the stones in the order the aurora lights them [solve] | side · +1 perk point (once) | 39 |
| `q_fm_ulmars_young` | Ulmar's Young | `npc_ulmar_peakspeaker` | `sz_stonehide_peaks` | Escort 3 young giants out of a war-hold [escort; hostile giants attack at 2 points] | side_chain_end · `class_pick` Rare · `rep` Frost Wardens +6 | 40 |
| `q_fm_rime_drake` | The Rime Matriarch **[Group 3]** | `npc_hallveig_rime` | `sz_throne_ice` edge | Kill the rime drake matriarch (rare elite) [kill] | side_chain_end · `pick3` | 41 |

### 10.9 The Drowned Coast (40–48) — `q_dc_*`

| id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|
| `q_dc_nets_full_of_hands` | Nets Full of Hands | `npc_mara_diver` | Gullrock | Cut 8 fishing nets tangled with Drowned [use ×8; a Drowned hand grabs you: 2 s root] | side · coin | 41 |
| `q_dc_wreckers_graves` | Rebury the Wreckers | `npc_brother_aldo` | `lm_wreckers_cairns` | Rebury 6 disturbed dead [use ×6] | side · `rep` Quiet Wake +6 | 42 |
| `q_dc_false_lantern` | The False Lantern | `npc_ottavia_brine` | `sz_wreckers_shore` | Kill 10 Unwoven wreckers [hunt] and smash their false lantern [use] | side · `crate` | 43 |
| `q_dc_wreck_rights` | Wreck-Rights | `npc_mara_diver` | `sz_wreckers_shore` | `choose` a crew (Saltbound or Cutwater), then reach 4 wrecks before the rival crew's divers [visitAll, timed 6 min] | side · coin · `rep` +10 to the crew you picked | 44 |
| `q_dc_tide_tables` | Low Water | `npc_amos_keeper` | `sz_brinehollow_flats` | During one low tide, open 6 cache chests on the flats [use ×6] | side · `crate` Rare floor | 45 |
| `q_dc_ser_ballast` | Ser Ballast **[Group 3]** | `npc_brother_aldo` | `sz_sunken_quarter` | Kill Ser Ballast, commander of the anchor-knights (rare elite) [kill] | side_chain_end · `pick3` | 45 |
| `q_dc_ship_for_the_spire` | A Ship for the Spire | `npc_hale_marrow` | Saltmarch | Gather 8 ship timbers from wrecks [gather] and 3 Veil-glass lenses from tide-horrors [gather] | side_chain_end · `class_pick` Rare · cosmetic: the Lamp's Wake flies your chosen banner when you sail | 46 |

### 10.10 The Riftmarch (46–54) — `q_rm_*`

| id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|
| `q_rm_chain_the_island` | Chain the Island | `npc_benedek_artificer` | `town_anchor_hill` | Reattach 4 anchor chains [use ×4, a 4 s channel each while riftlings attack] | side · coin | 47 |
| `q_rm_weave_window` | The Weave Window | `npc_cassia_dorne` | `lm_weave_window` | Trace the pattern the Veil shows you on 6 floor-glyphs [solve] | side · +1 perk point (once) | 48 |
| `q_rm_survey_the_isles` | Chart the Isles | Shardfall Post board (`fac_longsight`) | `sz_floating_isles` | Plant survey pins on 6 islands [visitAll] | side · coin · `rep` Longsight +10 | 49 |
| `q_rm_wynns_mother` | Wake Her Up | `npc_little_wynn` | `town_quiet_orchard` | Bring 3 things from before 396 AS: a halfling pie-tin, a Warden's whistle, a moonwell stone [gather from 3 regions — all obtainable at level 49 by waystone] | side_chain_end · `class_pick` Rare · a lore scene (her mother moves one step) | 50 |
| `q_rm_shard_harvest` | Rift-Crystals | `npc_benedek_artificer` | `sz_shardfall` | Gather 10 rift-crystals [gather from nodes; each pick spawns a shard construct 20% of the time] | side · `materials` | 51 |
| `q_rm_the_upfall` | Ride the Upfall | `npc_benedek_artificer` | `lm_upfall` | Ride the Upfall [visit] and plant 3 beacons on the high islands [use ×3] | side · coin | 52 |
| `q_rm_unwoven_choir` | The Unwoven Ritual **[Group 5]** | `npc_cassia_dorne` | `sz_unwritten_fields` | Break the ritual: kill 3 priests [kill ×3] then the ritual's elite [kill] before the 5-min ritual bar fills (it fills 1% every 3 s) | side_chain_end · `pick3` | 53 |

### 10.11 The Emberthrone (52–60) — `q_et_*`

| id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|
| `q_et_supply_run` | Ash for Bread | `npc_marshal_ansel_crane` | Cinderwatch → Last Light | Escort a supply team [escort; 2 Legion ambushes] | side · coin | 53 |
| `q_et_hound_hearts` | Magma-Hound Hearts | `npc_emberwright_sallis` | `sz_last_light_ridge` | Gather 6 magma-hound hearts [gather] | side · `materials` | 55 |
| `q_et_the_deserter` | A Kindled Deserter | `npc_brother_caddoc` | `sz_obsidian_fields` | Find the deserter [visit] and walk him to Last Light [escort; he is on fire and slowly burning out: reach Last Light in 5 min] | side · coin · lore | 56 |
| `q_et_soot_wing` | Soot-Wing **[Group 3]** | `npc_marshal_ansel_crane` | caldera roost | Kill Soot-Wing, the drake matriarch (rare elite) [kill] | side_chain_end · `pick3` | 57 |
| `q_et_the_last_beacon` | The Last Beacon | `npc_marshal_ansel_crane` | `lm_ash_beacon` | Light the beacon [use] and hold it 120 s [defend] until the strike team arrives | side · `crate` | 58 |
| `q_et_letters_of_ysa` | Ysa's Letters | `npc_brother_caddoc` | `sz_reliquary_caldera` | Find 5 of Ysa Varn's letters in the temple ruins [visitAll + gather] | side_chain_end · `class_pick` Epic · lore used in r04's dialog opportunity (page 13) | 59 |
| `q_et_glass_duel` | The Glass Champion | `npc_marshal_ansel_crane` | `sz_obsidian_fields` | Defeat Lord Castellan Brandt's champion (`b_castellan_brandt` is r04's, page 13) in a solo duel ring [kill, solo only, followers dismissed] | side · a cosmetic black-glass pauldron | 60 |

### 10.12 Veilspire Isle (60) — `q_vs_*`

| id | Title | Giver | Where | Objective | Reward | Lvl |
|---|---|---|---|---|---|---|
| `q_vs_ysoldes_steps` | Ysolde's Steps | `npc_ysoldes_echo` | `lm_ysoldes_steps` | Walk the pilgrim path and light 7 lamps [use ×7] | side · title *Pilgrim* | 60 |
| `q_vs_the_veil_wall` | Visions at the Wall | `npc_iris_vael` | `lm_the_veil_wall` | Touch the wall once for each story chapter (12 visions) [use ×12] | side · lore · coin | 60 |
| `q_vs_borrowed_shapes` | Borrowed Shapes | `npc_cassia_dorne` | `sz_veilwood` | Kill 12 things wearing the shapes of Wildmarch beasts [hunt] | side · coin | 60 |
| `q_vs_hales_crew` | Hale's Crew | `npc_hale_marrow` | `sz_shattered_strand` | Rescue 4 crew held by Riftborn [rescue beat ×4, reuse `events.json` `rescue`] | side · `crate` | 60 |
| `q_vs_the_last_cell` | The Last Unwoven | `npc_cassia_dorne` | `sz_veilwood` | Find and end the Unwoven's last cell: 4 cultists and their leader [kill] | side · coin | 60 |
| `q_vs_iris_notes` | Iris's Notebook | `npc_iris_vael` | the island | Gather 6 scattered Veil notes [gather] | side_chain_end · `class_pick` Epic | 60 |
| `q_vs_hold_the_foot` | Hold the Foot **[Group 5]** | `npc_quartermaster_wend` | `sz_spire_foot` | Take and hold the foot-camp 240 s against a Riftborn tide with an elite at 120 s [defend + kill] | side_chain_end · `pick3` · `rep` Spire Accord +10 | 60 |

---

## 11. Repeatable work: boards, the job generator, rumours, bounties

### 11.1 Notice boards

Every town marked `NB` on page 01 has a notice board (reuse: Farhold `noticeboard` building,
`BUILDING_INFO`). A board holds **4–6 jobs** generated by jobgen (§11.2).

| Rule | Farhold | Wildmarch |
|---|---|---|
| Refresh | once a game day | **every real hour, on the hour** (a job you have taken stays yours) |
| Whose jobs | the one player's | **per player**: each player's board is rolled from the shared world's live objects with a seed of `(playerId, boardId, hour)`, so two friends see different boards but can share jobs (§16) |
| Level | around the zone level | jobs roll at the **board's sub-zone band**; a board never offers a job whose band minimum is more than 2 above your level |
| Cost to abandon | −3 standing with the poster | same |
| Cap | — | 10 board jobs in your log at once |
| Turn-in | from the journal | same (jobs only) |

### 11.2 The job generator

Reuse `prototypes/farhold/js/jobgen.js` with `data/job-frames.json`. The rule that matters is kept
word for word: **a frame is only offered if every slot binds to something that exists right now**.
Wildmarch changes:

- **Scope.** `local` = the board's sub-zone plus the sub-zones of the same region that touch it;
  `adjacent` = one region over (text says so); `rumour` = never a job. `SCOPE_METRES` becomes
  `local 1500`, `adjacent 4000` (a region is 3–8 km, not a Farhold zone).
- **Candidates** come from the shared world: live champions and rares, camps (strongholds), caravans,
  patrols, landmarks, incidents, towns (reuse `candidatesFrom`).
- **Shared targets.** Many players can hold a job bound to the same champion; kill credit is shared
  (§3.3 rule 4). A bound thing that dies is **re-bound** to a fresh one of the same kind nearby for
  anyone still holding the job (or the job completes if it was theirs to kill).

| Frame (reuse id) | Wildmarch status | Note |
|---|---|---|
| `thin_the_pack` | keep | hunt 6 of a local beast |
| `walk_it_over` | keep | deliver to a town in the region |
| `bring_back` | keep | gather from a local beast |
| `look_in_on` | keep | visit a site |
| `beast_moved_in` | keep | kill a champion at a site |
| `overdue_caravan` | keep | find a caravan wreck |
| `the_escort` | keep | escort a caravan (reuse `caravans.js`) |
| `thin_their_patrols` | keep | kill a warband patrol's leader |
| `patrol_gone_quiet` | keep | find a missing patrol |
| `the_grudge` | **change** | Farhold's nemesis follows one player; online a grudge is **personal** (the champion that killed you is phased so only you and your party see it) |
| `pay_the_toll` | keep | Stone Count bridges only |
| `feed_the_hold` | keep | needs a `hunger` incident |
| `standing_stone` | keep | only landmarks you have not solved |
| `someones_boy` | keep | binds to an instance mouth (reuse `data/instances.json` mouths) |
| `the_relic` | keep | Lantern House hand-in |
| `push_them_out` | **change** | grip changes are shared and timed (§14): clearing 3 sites drops grip for 1 real day for everyone |
| `the_claim` | keep | a rival's new camp |
| `light_the_beacon` | keep | needs a `raid_coming` incident |
| `dig_it_out` | keep | collapsed mine landmarks |
| `the_wake` | keep | needs `restless_dead` |
| `map_the_edge` | keep | Longsight pays per landmark |
| `the_apprentice` | **change** | the Emberwright becomes the Deepforge forgemaster (`fac_deepforge_clans`) |
| `the_neighbour` | keep | the adjacent-region frame |
| `break_the_camp` | keep | warband camps |
| `bring_down_warlord` | keep | warband warlords (group-sized; offered only if you are in a party of 3+ or have 2+ followers) |

### 11.3 Rumours and leads

Reuse `prototypes/farhold/js/rumours.js`: a rumour is **one sentence about another region, built from
a live fact**, and it never pins anything. Farhold's 14 kinds are kept: `named`, `pushing_in`,
`incident`, `unclaimed`, `caravan`, `dungeon`, `shop`, `bounty`, `grudge`, `wreck`, `bloom`,
`warband_holds`, `warlord_seen`, `fair`.

- **Who says them:** innkeepers (one per visit), minstrels at night, wanderers (reuse
  `wanderers.js` minstrel/courier/refugee kinds), and the `…` NPCs in §5.1.
- **Where they go:** the Journal's **Rumours** list (region, the sentence, when heard, who said it).
- **Leads** *(new)*: when you enter the region a rumour is about, its subject appears on your map as a
  grey `?` **lead** marker (only the sub-zone circle, 150 m, not a pin). Walking into the circle
  either starts the matching job (if a frame binds) or shows the thing (a fair, a wreck).
- **Map reveal:** a rumour about an unexplored sub-zone reveals its **name** on your map (reuse: Farhold
  "known means walked into or named in a rumour").

### 11.4 Bounties

Each hub's **Wanted board** (next to the notice board) posts **3 bounties a day** (reset 06:00 server
time) drawn from its region's **rare elite list** (page 10 owns the rares; page 01 names some).
A bounty target is a rare that is **always up** for bounty holders at a posted last-seen area (80 m
circle). Anyone can kill a rare; bounty holders get the bounty reward on top of its normal loot.

| Bounty grade | Target | Players | Reward |
|---|---|---|---|
| Wanted | a rare at the region's middle level | 1 | `bounty` tier coin + XP, `crate` Uncommon floor |
| Dangerous | a rare at the region's top level | 1–2 | ×1.5, `crate` Rare floor |
| Elite **[Group 3]** | a rare elite (Bramblecoat, the Reedmother, Gravel-Tusk, …) | 3 | `pick3` Rare-or-better, +10 standing with the hub's holder |

A player may hold **3 bounties** at a time. Bounty escalation (reuse incident `bounty_escalation`): a
bounty rare that survives 3 fights with players triples its bounty and gains one champion modifier.

### 11.5 Wanderers and road offers

Reuse `prototypes/farhold/js/wanderers.js` (14 kinds: pedlar, courier, hedge-witch, bounty poster,
refugee, surveyor, hermit, mercenary captain, toll-keeper, minstrel, poacher, relic hunter, tax
collector, wounded patroller) with bodies (reuse: Farhold R22 `folk.spawnOne`). A wanderer offers at
most one job (a board frame bound to themself) and is **per player** (phased: each player meets their
own; a party shares the party leader's).

---

## 12. Dailies and weeklies

**Reset:** dailies at **06:00 server time**; weeklies on **Wednesday 07:00 server time** (canon 00 §4).
Page 16 owns the server clock. Currency: dailies and weeklies at 60 pay **Veil Sigils**
(`cur_veil_sigil`, 00 §10; page 08 owns currencies), spent at every hub's reputation vendor and the
Spire Accord vendor.

### 12.1 Region dailies (level 10+)

Every hub's quartermaster (the reputation vendor, `RV`) offers **3 dailies a day** from a pool of 8 for
that region's holder. They are hand-written, bound to fixed spots, level-scaled to your level within
the region's band (a level-60 player doing Hearthvale dailies does them at level 8 with the rewards of
level 8 — **level sync**, a temporary lowering of your level to fit the content, proposal for page 07).

| Region | Daily pool (ids `q_daily_<region>_<n>`, 8 each) — the first three shown as examples | Reward |
|---|---|---|
| Hearthvale | `_1` Scarecrows at dusk (light 5 braziers, kill the crows) · `_2` Barrow watch (seal 3 opened barrows) · `_3` Sootwick thieves (recover 6 sacks) | `daily` coin + XP, `rep` +6 Vale Wardens |
| Mossfen | `_1` Posts at dusk · `_2` Leeches off the causeway · `_3` A Drowned in the reeds | `rep` Fenfolk |
| Highcourt | `_1` Undercroft rats · `_2` Barge guard · `_3` Letters for the Mailhouse | `rep` Crown |
| Greyridge | `_1` Rogue sentinels · `_2` Rams on the pass · `_3` Unburied at the cairns | `rep` Deepforge |
| Sunscar | `_1` Water for the cutters · `_2` Jackals at the well · `_3` Tomb robbers | `rep` Sandsworn |
| Whisperwood | `_1` Moonwater run · `_2` Seed-pods · `_3` Mad pack | `rep` Moonwell Circle |
| Cinder Steppe | `_1` Wall duty (defend 90 s) · `_2` Grass fires · `_3` Beacon riders | `rep` Crown |
| Frostmantle | `_1` Sledges · `_2` Firewood · `_3` Stair watch | `rep` Frost Wardens |
| Drowned Coast | `_1` Cliff climbers · `_2` Nets · `_3` Bell buoys | `rep` Saltbound |
| Riftmarch | `_1` Chain an island · `_2` Riftlings at the camp · `_3` Crystal harvest | `rep` Riftwatch |
| Emberthrone | `_1` Supply run · `_2` Engines on the road · `_3` Hound hearts | `rep` Crown / Lantern House |

### 12.2 Veilspire dailies (60)

The **Spire Accord** quartermaster offers **4 of 12** a day (`q_daily_vs_<n>`): hold the Landing
(defend), strand sweep (hunt 15), borrowed shapes (hunt 10 mimics), mend the Veil (channel at 3 thin
spots), the pilgrim (light Ysolde's 7 lamps), echo fragments (gather 5), rescue the lost (rescue ×2),
break a rift (close 1 rift anchor), the Unwoven cache (clear), a Veilwood elite **[Group 3]**, the
Spire watch (visit 3 lookouts), the shipment (escort). Each pays `daily` coin, 10 Veil Sigils and
Spire Accord +6; two of them are always one "easy" (≤ 3 min) and one group-friendly.

### 12.3 Weeklies (Highcourt Muster board, `hc_wardens_yard`)

| id | Title | Objective | Reward |
|---|---|---|---|
| `q_weekly_world_bosses` | The Big Game | Earn Bronze+ against 3 different world bosses | 60 Veil Sigils · `crate` Epic floor |
| `q_weekly_dungeons` | Five Doors | Complete 5 dungeons on Heroic or Mythic+ | 60 Veil Sigils · `class_pick` Epic |
| `q_weekly_mythic` | The Timed Door | Complete 1 Mythic+ dungeon in time at key level 5+ | 40 Veil Sigils · a cache (page 12 owns keystone rewards) |
| `q_weekly_events` | Where It's Needed | Earn Gold in 10 dynamic events (any region, any level with level sync) | 50 Veil Sigils |
| `q_weekly_muster` | The Muster | Finish 20 board jobs | 40 Veil Sigils · 1 free respec token |
| `q_weekly_raid` | The Long Night | Kill 3 raid bosses (any raid, any difficulty) | 60 Veil Sigils |

Weeklies unlock at level 60 except `q_weekly_events` and `q_weekly_muster`, which open at 20 and pay
coin + XP below 60.

---

## 13. Dynamic open-world events

A **dynamic event** (`ev_<snake>`) is something that happens in the shared world, on a timer or a
trigger, that **every player nearby can join without a quest, a party or a sign-up**. It has phases,
scales to the number of players, and pays each player by how much they helped. Page 11's telegraph
vocabulary is used for every attack in them; world bosses are page 13's and are only referenced here.
(Reuse: Farhold `js/encounters.js` beats `rescue`/`chase`/`defend`/`trap`/`find` as the phase types;
Farhold `js/incidents.js` for triggers; `js/meteors.js` for Starfall.)

### 13.1 How an event runs

1. **Pre-warning** (except surprise events): a **banner** 60 s before — centre-top, orange, the
   event's name and a one-line reason ("*Sootwick raiders are coming for the Oakhollow carts*"), a horn
   sound, an `✦` on map and minimap for everyone in the region, and an **event tracker** block above
   the quest tracker (name, phase, phase goal with a bar or count, time left, your contribution tier).
2. **Phases** run in order. A phase has a goal (kill N, hold T seconds, escort X to Y, close N
   anchors, kill the boss), a timer, and a fail state. A failed phase either ends the event
   (**Failure**) or moves to a *fail branch* phase (listed per event).
3. **End:** Success or Failure banner; rewards are handed out **at the end** to every participant
   still in the region (a chest per player, personal loot, at the event's centre and in the mail if
   you left the event area but not the region).
4. **Cooldown:** each event has a per-location cooldown after it ends (listed), so events rotate.

### 13.2 Participation credit

Every player within the event's **area** (a circle, radius listed per event) earns **contribution
points** (CP). No tagging, no party needed.

| Action | CP |
|---|---|
| Damage dealt to event enemies | 1 CP per 1% of the event's total enemy health you dealt (all phases), max 40 |
| Healing / shielding other players or event NPCs | 1 CP per 1% of the event's total player health pool healed, max 40 |
| Holding an elite's attention (tank time) | 1 CP per 10 s with an elite or boss targeting you, max 20 |
| Objective actions (a `use` on an event object, carrying, channeling) | 5 CP each, max 30 |
| Reviving a player | 5 CP each, max 20 |
| Presence (in the area, alive, in combat) | 1 CP per 30 s, max 10 |
| Escorted NPC survives with you nearby | 10 CP at the end |

| Tier | Needs | Reward (all personal) |
|---|---|---|
| **Bronze** | 10 CP | `event_bronze` XP + coin, 1 event chest (Common–Uncommon) |
| **Silver** | 30 CP | `event_silver` XP + coin, 1 chest (Uncommon floor), event currency ×2 |
| **Gold** | 60 CP **or** top 25% of CP in the event | `event_gold` XP + coin, 1 chest (Rare floor), event currency ×3, a 10% chance of the event's cosmetic |
| Failure | — | Tiers still pay at **50%** (you tried) |

**Healers and tanks earn Gold** through the healing and tank-time rows; a player who only stood there
earns Bronze at most (presence is capped at 10). Anti-idle: a player with no input for 60 s earns no
presence CP.

### 13.3 Scaling

Every 10 s the event counts **participants** `n` (players in the area who earned CP in the last 60 s,
minimum 1). Proposal numbers (page 11 owns the vocabulary, page 05 the maths):

| What scales | Rule |
|---|---|
| Ordinary enemy count per wave | `base × (1 + 0.35 × (n − 1))`, capped at `base × 8` |
| Elite / boss health | `base × (1 + 0.6 × (n − 1))` up to 20 players; above 20, **no more health** — instead 1 extra add group per 5 players |
| Soak circles | pips = `min(5, ceil(n / 4))` |
| Timers | fixed (never shorter for more people) |
| Objective counts (anchors, rams, fires) | `base + floor((n − 1) / 5)`, capped at `base × 2` |
| Level | the event has a level band; players above it are **level-synced** down to band top + 2 (proposal for page 07) so high levels cannot trivialise low events; below the band minimum − 3, players cannot join (a banner says why) |
| Solo | every event is winnable by one player at the band's middle level with 2 followers, on paper; a test runs each event with `n = 1` against the sim bot |

**Downscaling mid-event:** if `n` falls, enemies already alive keep their health; new spawns use the
new `n`. Elite health scales **down** by the same rule but never below its current damage taken + 10%.

### 13.4 The events

**Summary** — 25 events. `Trigger`: *timer* = on a fixed schedule with jitter; *world* = a world-state
condition (incident, grip, weather, moon); *story* = only after some players have reached a chapter
(it is world state, so it runs for everyone once the server's first player has). `Area` in metres.

| # | id | Name | Region / sub-zone | Lvl | Trigger | Every | Length | Area |
|---|---|---|---|---|---|---|---|---|
| 1 | `ev_sootwick_harvest_raid` | The Harvest Raid | Hearthvale, `sz_old_orchards` | 3–5 | timer | 60 min ±10 | 8 min | 120 |
| 2 | `ev_barrow_night` | Barrow Night | Hearthvale, `sz_barrow_downs` | 5–6 | world: night, and every 3rd night | 3 h | the night (15 min) | 200 |
| 3 | `ev_false_lights` | The False Lights | Mossfen, `sz_lantern_marsh` | 8–10 | world: night | 2 h | 10 min | 150 |
| 4 | `ev_fen_fever` | Fen Fever | Mossfen, `town_reedhollow` | 6–9 | world: `quarantine` incident | incident | 12 min | 100 |
| 5 | `ev_kettle_pass_convoy` | The Pass Convoy | Greyridge, `sz_kettle_pass` | 11–14 | timer | 90 min | 10 min (moving) | 60 round the wagons |
| 6 | `ev_sentinel_awakening` | The Sentinels Wake | Greyridge, `sz_cutstone_quarries` | 13–16 | timer | 2 h | 9 min | 150 |
| 7 | `ev_sandstorm_ruins` | What the Sand Gave Back | Sunscar, `sz_dune_sea` | 20–24 | world: sandstorm | per storm, max 1 per 2 h | 15 min | 180 |
| 8 | `ev_dunehold_caravan` | The Great Caravan | Sunscar, Tamar → Dunehold | 17–22 | timer | 2 h | 12 min (moving) | 70 round the caravan |
| 9 | `ev_moonwell_overflow` | The Overflow | Whisperwood, `sz_moonwell_glades` | 24–28 | world: full moon | every full moon (8 h) | 15 min | 160 |
| 10 | `ev_thornmane_great_hunt` | The Great Hunt | Whisperwood `sz_silverbough_eaves` / Steppe `sz_ashfall_marches` (alternates) | 24–32 | world: full moon + Thornmane grip > 0.5 | every full moon | 12 min | 200 |
| 11 | `ev_siege_of_fort_ashfall` | The Siege of Fort Ashfall | Cinder Steppe, `town_fort_ashfall` | 30–36 | timer (story: after the first player finishes 7.9) | 4 h ±20 min | 25 min | 250 |
| 12 | `ev_ashtusk_march` | The Warband March | Cinder Steppe, `sz_warmasters_ground` → `town_tallgrass` | 29–34 | world: Ashtusk grip > 0.6 | 3 h | 15 min (moving) | 120 round the column |
| 13 | `ev_giants_descent` | The Giants Come Down | Frostmantle, `town_whitecairn` | 37–41 | timer | 3 h | 15 min | 200 |
| 14 | `ev_avalanche` | Avalanche | Frostmantle, `sz_rimehold_valley` | 34–38 | world: snow or blizzard | 2 h | 6 min | 120 |
| 15 | `ev_drowned_tide` | The Drowned Tide | Drowned Coast, `town_saltmarch` lower harbour | 42–47 | world: the high-tide peak at night | 3 h | 15 min | 200 |
| 16 | `ev_low_tide_scramble` | Low Tide | Drowned Coast, `sz_brinehollow_flats` | 44–47 | world: every low tide (hourly) | 60 min | 10 min | 300 |
| 17 | `ev_island_fall` | The Falling Island | Riftmarch, `sz_floating_isles` | 49–53 | timer | 2 h | 12 min | 180 |
| 18 | `ev_legion_bombardment` | The Bombardment | Emberthrone, `town_last_light` | 53–58 | timer | 2 h | 15 min | 250 |
| 19 | `ev_kindled_procession` | The Procession | Emberthrone, `sz_obsidian_fields` → causeway | 57–60 | timer | 3 h | 12 min (moving) | 80 round the litter |
| 20 | `ev_veil_breach` | The Breach Widens | Veilspire, `sz_spire_landing` | 60 | timer | 2 h | 20 min | 300 |
| 21 | `ev_rift_opening` | A Rift Opens | any sub-zone with Veil pressure ≥ 0.3 (Cinder Steppe and north) | band of the sub-zone | world: every Veilstorm rolls one (50%) | per storm | 10 min | 150 |
| 22 | `ev_starfall` | Starfall | any region from Mossfen north, open ground | band of the sub-zone | timer (reuse: Farhold `js/meteors.js`) | 90 min per region, jitter 30 | 30 s warning + 12 min | 150 |
| 23 | `ev_refugee_column` | The Refugee Column | the Kingsroad, Kettle Pass → Highcourt or Fort Ashfall → Kettle Pass | 12–16 or 30–34 | world: `raid_coming` incident on the road's region | incident | 10 min (moving) | 80 round the column |
| 24 | `ev_fair_day` | Fair Day | any hub (not Last Light or Spire Landing) | any | world: holder grip > 0.7 (reuse incident `fair`) | 1 per region per real day | 60 min | the town |
| 25 | `ev_world_boss_call` | *(wrapper)* World boss muster | the 8 world boss sites (page 01 §8) | boss level | timer (page 13 owns spawn times) | per page 13 | pre-phase 5 min + the fight | 300 |

### 13.5 Event details

Each block lists phases (goal · timer · fail), scaling notes and rewards. "Base" counts are for one
player; §13.3 scales them.

**1 · `ev_sootwick_harvest_raid` — The Harvest Raid** (3–5)
- Pre: 60 s banner "*Sootwick raiders are coming for the Oakhollow carts*".
- P1 **Guard the carts** · 3 fruit carts (1,200 health each at level 4) · 120 s · waves of 4 Sootwick
  cutpurses every 20 s · fail if all 3 carts are destroyed → Failure.
- P2 **Catch the thieves** · 3 runners carrying sacks flee toward the Southwood (reuse `chase` beat,
  escape at 70 m) · 90 s · a runner that escapes costs one reward chest grade.
- P3 **The camp boss** · Scab's cousin *Gristle Nettlejaw* (champion hexer) at the orchard edge, casts
  a **targeted** yellow circle hex every 8 s (1.5 s warning) · 180 s.
- Rewards: tiers; event currency *Harvest tokens* (spent at Pip Underbough for pies and a cosmetic
  apron). Cooldown 60 min.

**2 · `ev_barrow_night` — Barrow Night** (5–6, every third night)
- P1 **Light the Harrow Beacon** · carry 3 bundles of dry wood from Harrow Watch to `lm_harrow_beacon`
  [objective ×3] while barrow rats swarm · 150 s.
- P2 **Hold the Watch** · 3 waves (8, 10, 12 base) of barrow dead against the stockade gate (gate
  4,000 health) · 240 s · fail branch → P2b *Retake the gate* (kill 15) · 120 s.
- P3 **Seal the barrows** · 3 open barrows, each a 5 s channel while a wight guards it · 180 s.
- P4 **The Wight-Lord** · a barrow wight-lord (elite, 2 phases): a **danger zone** grave-cone every 10 s
  (1.5 s), at 50% it raises 4 thralls; **void zone** of grave-cold lingers 10 s where the thralls rise.
- Rewards: tiers; cosmetic *barrow-lamp* at Gold (10%). Cooldown: the next third night.

**3 · `ev_false_lights` — The False Lights** (8–10, night)
- P1 **Light the posts** · 12 lamp posts (`lm_lamp_posts`), objective count scales · 240 s · each lit
  post spawns 1 Mire Sister.
- P2 **The coven** · 3 Mire Sister elders in a triangle, each shielded until the other two are below
  50% (a **tether** white line shows who shields whom) · 300 s.
- P3 *(only if P1+P2 finish in under 6 min)* **The Reedmother wakes** · the rare elite appears; soak
  **orange** circles (2 pips base) every 20 s.
- Rewards; Fenfolk +6 at Silver+. Cooldown 2 h.

**4 · `ev_fen_fever` — Fen Fever** (6–9; during a `quarantine` incident at Reedhollow)
- P1 **Bog-myrtle** · gather 20 (scales) from the shallows · 300 s.
- P2 **House calls** · escort Brother Aldo to 5 houses; at each, protect him 20 s from leech swarms
  that crawl out of the water.
- P3 **The source** · kill a bloated bog-body (elite) whose death spawns 3 **void zones** (fever pools,
  damage every 0.5 s, 30 s).
- Success ends the incident early. Failure: the quarantine runs its full time.

**5 · `ev_kettle_pass_convoy` — The Pass Convoy** (11–14)
- A Crown convoy of 3 wagons climbs the pass (reuse `caravans.js`, 2.4 m/s).
- P1 **The sappers** · Sootwick sappers plant 4 charges on the road ahead [objective: defuse ×4, 3 s
  channel] · 120 s · a missed charge = a **danger zone** blast that damages the wagons.
- P2 **Rockslide** · boulders roll down in lanes (**moving wave**, 2 s warning); the wagons stop until 5
  boulders are broken.
- P3 **The toll** · the Stone Count's men block the top: a **choice** anyone can take at the toll
  chair — pay 50c (convoy passes, Stone Count +2 for the payer) or fight 6 toll-guards.
- Success: wagons arrive; Failure: a wagon is wrecked (becomes a lootable wreck, reuse Farhold wreck).

**6 · `ev_sentinel_awakening` — The Sentinels Wake** (13–16)
- P1 **Pylons** · destroy 4 rune pylons (each shielded while its sentinel lives) · 240 s.
- P2 **The colossus** · a rune colossus (elite): a **cross** of rune beams (2 s), a **checkerboard** of
  quarry tiles lighting up (safe tiles blue, 2 s), 90 s enrage.
- Rewards; Deepforge +6.

**7 · `ev_sandstorm_ruins` — What the Sand Gave Back** (20–24, during a sandstorm)
- The storm uncovers a buried ruin for 15 min.
- P1 **Dig out** · 6 sand-choked doors [use ×6, 4 s channel] while sand wyrms surface (a **danger
  zone** ring shows where one will burst, 1.5 s).
- P2 **The guardians** · 2 jar-guardians (elite) with a shared health bar.
- P3 **The Buried Gate** stays open until the storm ends (instance, reuse `sealed_strongroom`).
- Rewards; `q_ss_buried_gate` completes here.

**8 · `ev_dunehold_caravan` — The Great Caravan** (17–22)
- A 5-wagon Sandsworn caravan crosses to Dunehold. P1 Ember Fennec pack ambush (kill 12; `m_sand_ember_fennec`, page 10) · P2 a wagon wheel
  breaks: hold 90 s while the drivers fix it · P3 sand wyrm under the road (elite).
- Success: the caravan's traders open a **market** at Dunehold for 30 min (cheaper reagents, a
  gambler).

**9 · `ev_moonwell_overflow` — The Overflow** (24–28, full moon)
- P1 **Catch the water** · moonwater spills as glowing pools (**green** beneficial zones: +20% healing
  done while inside); fill 10 vials (scales) before each pool sours (turns **purple** void, 20 s later).
- P2 **The spilled fey** · fey wisps swarm; 3 wisp-knights.
- P3 **The Wisp Queen** · elite; spreads **targeted** moon-marks on 2 players (spread out).
- Rewards; Moonwell Circle +6; cosmetic *moonwater flask* (Gold 10%).

**10 · `ev_thornmane_great_hunt` — The Great Hunt** (24–32, full moon)
- The packs hunt a herd (Whisperwood: the spirit stags; Steppe: Tallgrass cattle).
- P1 **Protect the herd** · 12 animals, 8 must survive · 180 s.
- P2 **Break the packs** · kill 3 packlords before the howl (a room-wide fear every 60 s unless a
  packlord is interrupted — **gold-bordered cast bar**).
- P3 **The Greatfang** · the Thornmane warlord (reuse: Farhold `thornmane_greatfang`) appears if P2 took
  under 3 min.

**11 · `ev_siege_of_fort_ashfall` — The Siege of Fort Ashfall** (30–36, the flagship event)
- Pre: 5 min — horns; the fort's NPCs call for defenders; the banner every 60 s.
- P1 **The rams** · 4 siege rams roll toward the gate (base 4, scales to 8) · 240 s · each ram has
  18,000 health at level 33 base · a ram that reaches the gate deals 10% gate damage every 5 s.
- P2 **The walls** · Ashtusk ladders at 6 points; hold the wall 180 s; ladder crews spawn every 15 s;
  push a ladder down [use, 2 s] to stop a point for 45 s.
- P3 **The breach** *(always happens: the Legion's fire-binders blow a hole)* · hold the breach 180 s;
  **danger zone** fire-bombs, a **soak** at the breach every 30 s (3 pips base, §13.3 rule).
- P4 **Sortie** · ride out and kill the Ashtusk war-chief and the Legion fire-binder captain at the
  siege camp (2 elites, 360 s).
- **Failure branch:** if the gate falls in P1–P3, P3 becomes *The Bailey* — the Legion takes the outer
  bailey; the fort's vendors move to the keep and the fort's waystone is **closed for 60 min** (the
  Ashfall Watch waystone stays open). The next siege starts from *Retake the Bailey* instead of P1.
- Rewards: tiers; *Ashfall medals* (event currency) for a Crown quartermaster cosmetic set; Crown +10 at
  Gold. Cooldown 4 h.

**12 · `ev_ashtusk_march` — The Warband March** (29–34)
- A column of Ashtusk marches to Tallgrass. Intercept at 3 points on its route: P1 the ford (kill 15),
  P2 the burned bridge (a **tether** between two shamans empowers the column; break it by pulling them
  apart 20 m), P3 the war-chief at the camp edge. Each intercept you win slows the column 90 s; if
  the column reaches Tallgrass, P4 *Defend Tallgrass* 180 s.
- Success lowers Ashtusk grip by 0.1 for 1 real day (shared).

**13 · `ev_giants_descent` — The Giants Come Down** (37–41)
- P1 **Boulders** · a **moving wave** of rolling stones down the valley (2 s warning); 90 s.
- P2 **Shield-giants** at the Whitecairn fence: 3 elites; the **Frost Wardens' ballista** [use] deals
  15% of a giant's health per bolt (reload 20 s).
- P3 **The chieftain** · a Stonehide chieftain: a **donut** stomp (safe hole under him, 2 s), a **cone**
  throw (1.5 s), a one-shot **danger zone** leap (3.0 s warning).

**14 · `ev_avalanche` — Avalanche** (34–38, snow)
- A slope lets go (30 s rumble warning). Dig out 8 buried trappers (scales) [use 5 s each] in 5 min;
  frost wolves come for the survivors. Each rescued trapper = 10 CP. Pure rescue, no boss.

**15 · `ev_drowned_tide` — The Drowned Tide** (42–47, night high tide)
- P1 **The bells** · ring the 3 harbour bells [use] to call the militia (each is guarded).
- P2 **Hold the quay** · 3 waves of Drowned out of the water; a **moving wave** of seawater (2 s) pushes
  players back 8 m.
- P3 **The anchor-knight captain** · elite; drops anchors that become **void zones** for 20 s.
- Failure: the lower harbour is Drowned-held for 30 min (its vendors close).

**16 · `ev_low_tide_scramble` — Low Tide** (44–47, hourly)
- For the 10 low-tide minutes: 12 caches on the flats (personal loot, each player may open 6), tide-crabs,
  and — every third low tide — the **world boss** the Sallow King (`b_sallow_king`, page 13 §8.5.6) rises on the causeway (handed to `ev_world_boss_call`).
- At 60 s left: a **danger zone** tide line sweeps in from the sea (8 s warning); anyone caught takes 30%
  health and is pushed ashore.

**17 · `ev_island_fall` — The Falling Island** (49–53)
- An island's anchors fail; it sinks 1 m every 6 s.
- P1 **Evacuate** · escort 6 Riftwatch surveyors (scales) off via rift-jump pads.
- P2 **Re-anchor or let it fall** · players at 3 anchors [use, 6 s channel] — if all 3 anchor in 240 s,
  the island holds (Success+, extra chest); if not, it falls and P3 starts on the ground.
- P3 **The anchor-eater** · an elite Riftborn that eats chains: a **tether** to the nearest anchor —
  keep it pulled 25 m away or it heals 2%/s.

**18 · `ev_legion_bombardment` — The Bombardment** (53–58)
- P1 **Take cover** · fire-shot **danger zones** land across Last Light (1.5 s warning), a new volley every
  6 s · 60 s — a pre-phase that tells you where the batteries are.
- P2 **The batteries** · 3 Legion batteries on the ridge; destroy each [use a charge, 3 s channel]
  guarded by glass-knights.
- P3 **Drop-troops** · Legion wyrm-riders drop 3 squads into the camp; protect the forge and the
  infirmary (2 objects, 20,000 health each).
- Failure: Last Light's vendors are closed 30 min; its waystone stays open.

**19 · `ev_kindled_procession` — The Procession** (57–60)
- A Kindled priest procession carries a litter of fuel to the caldera causeway. Stop it before it
  reaches the causeway (6 min walk). Kill the 4 litter-bearers (each shielded by a priest's **tether**;
  break by killing or silencing the priest — interrupt its **gold-bordered** channel), then the
  Kindled cantor (elite).
- Success: the Emberthrone's Ember Legion grip −0.1 for 1 real day; the Red Star over the caldera
  dims visibly for everyone in the region for 1 hour.

**20 · `ev_veil_breach` — The Breach Widens** (60)
- P1 **Anchor the camp** · 3 Veil anchors [channel 8 s] while Riftborn pour in.
- P2 **The tide** · 4 waves; wave 3 carries an elite; a **room-wide** pulse every 45 s unless players
  stand in the 3 **blue safe zones** by the anchors.
- P3 **The Unwoven's shade** · a fragment of r05's final boss (`b_unwoven`) (a taste, page 13 owns the real fight):
  2 mechanics borrowed from earlier world bosses, chosen at random each time.
- Rewards: Spire Accord +10 at Gold; 20 Veil Sigils at Gold.

**21 · `ev_rift_opening` — A Rift Opens** (Veil pressure ≥ 0.3, during a Veilstorm)
- A rift tears in a random open spot of the sub-zone. P1 close 3 rift anchors [channel 5 s each] while
  Riftborn spill; P2 the rift lord (elite; its level = the sub-zone's top) — a **checkerboard** of Veil
  tiles; P3 the rift collapses: 10 s to leave a **red** implosion zone.
- Rewards: *riftshards* (a crafting material, page 08).

**22 · `ev_starfall` — Starfall** (reuse: Farhold `js/meteors.js`)
- 30 s warning: a fall marker drops on the map where the star will land (reuse `MARKER_LOOKS.fall`).
- P1 **Impact** · a **danger zone** 20 m circle fills from the edge in over 30 s; stand clear.
- P2 **The star's guardians** · 4 star-born elementals (base).
- P3 **Mine the star** · the crater holds star-metal nodes; every participant can mine 3 (personal).
  Every fourth Starfall in a region brings a *Starborn* champion instead of 4 elementals.
- Rewards: star-metal (crafting), tiers.

**23 · `ev_refugee_column` — The Refugee Column** (12–16 / 30–34)
- Walk a column of 10 refugees 1.2 km down the Kingsroad (2.2 m/s); 3 ambushes; each refugee alive at the
  end adds 3 CP to everyone who finished. Success ends the region's `raid_coming` incident early.

**24 · `ev_fair_day` — Fair Day** (any; no combat)
- A market square fills with stalls (reuse: Farhold incident `fair`, gambler, minstrel). Four
  mini-games, each paying *fair tickets*: archery butts (hit 10 targets in 30 s), the pie table (eat
  on a rhythm prompt), the greased pig (chase beat, 60 s), the wrestling ring (non-lethal duel vs NPCs).
  Tickets buy cosmetics, dyes and toys at the fair stall. No tiers; everyone who plays one game gets
  Bronze.

**25 · `ev_world_boss_call` — World boss muster** *(wrapper; the fight is page 13's)*
- 5 min before a world boss spawns: banner to the whole **continent** (not only the region), a map
  marker at the site, and a **pre-phase** local to each boss (e.g. Greyridge: protect 3 dwarf
  engineers trying to shut Grief-in-Iron down — if all 3 live, the boss starts at 90% health).
- Participation and tiers use §13.2; the boss's own loot is page 13's.

### 13.6 Road events (small, per player)

Farhold's 22 road events (`data/events.json`: *the cage on the road*, *the laden runner*, *the stranded
cart*, *the open offer*, *the drowned boat*, …) are kept as **small personal events** — seen only by
the player (and party) who triggers them, rolled while walking roads (reuse: `js/encounters.js`,
every ~26 s of travel a roll; Wildmarch: every ~90 s, max 1 per 5 min per player). They pay a bag or
chest per the file. Wildmarch adds a region filter so a *drowned boat* never rolls in the Sunscar.

---

## 14. Incidents

Reuse `prototypes/farhold/js/incidents.js` + `data/incidents.json`: a timed state on a sub-zone that
changes spawns, prices, NPC talk and which jobs and events can fire. **Online: incidents are shared
world state.** Farhold durations are game hours; Wildmarch converts them (1 game hour = 2.5 real
minutes) and then rounds up so an incident is long enough for people to notice.

| Incident (reuse kind) | Starts when (Wildmarch) | Lasts (real) | Effect | Opens |
|---|---|---|---|---|
| `raid_coming` | a warband's grip in the region > 0.6 | 2 h | spawns ×1.4 near roads | `light_the_beacon` job, `ev_refugee_column` |
| `hunger` | a caravan event fails in the region | 4 h | shop prices ×1.5 in the hub, fewer townsfolk | `feed_the_hold` job |
| `restless_dead` | any player digs a cairn field | 3 h | night undead spawns across the sub-zone | `the_wake` job |
| `grudge` | a named champion kills a player | until the champion dies | the champion hunts **that player** (phased, §11.2) | `the_grudge` job |
| `feud` | two factions' grips within 0.1 | 5 h | their patrols fight on sight | — |
| `bloom` | 12% per real day, wet or wood sub-zones | 2 h | gathering nodes ×3, a rare herb | — |
| `collapse` | 8% per real day, mountain sub-zones | until dug out | seals an instance mouth | `dig_it_out` job |
| `ash_fall` | Cinder Steppe / Emberthrone ashfall weather | 1 h | +10% fire damage taken, sight 60 m | — |
| `fair` | holder grip > 0.7 | 1 h | the fair | `ev_fair_day` |
| `quarantine` | 5% per real day in Mossfen / Drowned Coast hubs | 3 h | the hub's shops trade over a wall (a window at the gate) | `ev_fen_fever` |
| `bounty_escalation` | a bounty rare survives 3 fights | until dead | bounty ×3, +1 modifier | — |
| `road_out` | a storm, or the broken-road landmark's repair lapses | until repaired (any player) | the direct route closes; the detour has +1 ambush | repair side quests (e.g. `q_hv_the_old_wheel`) |

---

## 15. Seasonal events

Seasonal events follow the **real-world calendar** (server time), not the in-game year (page 01 §3).
They are **cosmetic-first**: rewards are cosmetics, toys, titles, dyes and one seasonal mount per
year; never power (no stats beyond a festival-only buff). Each has a festival NPC in Highcourt and one
in a themed hub, a quest line of 5–7 quests (`q_season_<event>_<snake>`), 2 dailies, a seasonal event
boss (page 13 owns the boss fight; a level-scaled 5-player boss summoned once a day per character from
the group finder), and a token currency.

| Festival | id | Dates | Where | Theme and what you do | Seasonal boss (name only) | Token |
|---|---|---|---|---|---|---|
| **Bloomtide** | `fest_bloomtide` | Mar 20 – Apr 3 | Hearthvale, Whisperwood | Spring planting: plant a flower in every hub (a collection), the `bloom` incident runs everywhere, egg-hunt style *seed caches* hidden in every region's starting sub-zone | *The Rootwaker* (an old tree that woke up cross), in `sz_moonwell_glades` | petals |
| **The Lantern Fair** | `fest_lantern_fair` | Jun 18 – Jul 2 | Highcourt, the Wend | Midsummer: lantern boats raced down the Wend (a boat race quest), fireworks, a Fair Day in every hub each day, the Lampbearer's March re-enactment (walk Ysolde's road Brightwater → Highcourt with a lamp) | none (a festival without a boss) | lantern wicks |
| **Starfall Nights** | `fest_starfall` | Aug 10 – 17 | every region | `ev_starfall` ×4 frequency, star-metal cosmetic crafting, a telescope collection at the Lantern House | *The Fallen Star* (a Starborn giant), in a random crater each day | star-metal |
| **The Long Wake** | `fest_long_wake` | Oct 20 – Nov 3 | Hearthvale Barrow Downs, Highcourt Undercroft | Remembering the dead: the Quiet Wake's candle rows, `ev_barrow_night` every night, costume charms that turn you into a barrow wight for 10 min, apple-bobbing at Oakhollow | *The Unlit Warden* (a Warden who died on the downs and still walks the rounds), in `sz_barrow_downs` | candle stubs |
| **Night of the Lamp** | `fest_night_of_the_lamp` | Dec 18 – Jan 2 | Brightwater, every hub | Ysolde's night: candles in every window, gift-giving (send a wrapped gift to a friend by mail), snow in Hearthvale, carollers (Lingo songs), the Hearthstone lit gold | *Old Rimejaw* (a frost-giant who steals lamps), in `sz_brightwater_fields` (level-scaled) | lamp oil |
| **Sealing Day** | `fest_sealing_day` | the game's launch anniversary, 7 days | Veilspire, Highcourt | The anniversary of the Sealing: a year-in-review lore scene, a free "yearly" cosmetic, the Veil's light turns gold for the week | none | — |

Seasonal quest-line example — **Night of the Lamp**:
`q_season_lamp_the_first_candle` (light the Hearthstone candle) → `q_season_lamp_windows` (put a candle
in 10 windows in Brightwater) → `q_season_lamp_a_gift_for_pip` (deliver a gift to Pip Underbough) →
`q_season_lamp_rimejaws_trail` (follow stolen lamps to Rimejaw's cave) → `q_season_lamp_old_rimejaw`
(defeat the boss from the finder) → `q_season_lamp_light_the_way` (walk a lamp from Brightwater to the
Highcourt South Gate). Dailies: `q_season_lamp_daily_carols` (sing with 5 townsfolk; emote), 
`q_season_lamp_daily_lost_lamps` (find 5 lamps Rimejaw dropped).

---

## 16. Quests in groups

Page 15 owns parties, the group finder and loot rules. These are the quest rules inside a party
(max 5).

| Rule | Detail |
|---|---|
| **Sharing** | Journal → quest → **Share** sends the quest to every party member within 100 m. Each receiver sees the offer panel (§5.3) unless `set.gameplay.auto_accept_shared` is on. A member who cannot take it (level, prerequisites, already done, log full) gets a line in chat saying which. Story, side, calling (step 2+ only, see below), job, bounty and daily quests are shareable; unlock and attunement quests are **not** (each person must be taught once). |
| **Calling quests** | The class task steps of callings 2 and 3 are shareable **to members of the same class**; others may help (kills count for the owner) but get no calling credit. Calling trials are solo. |
| **Kill credit** | Every party member within **60 m** of a kill when it dies gets the kill objective, whether or not they hit it (party-wide tag), plus the shared-credit rule of §3.3 rule 4 for non-party players. |
| **Quest items** | Drop personally for every eligible member (§3.3 rule 3). |
| **Use objects** | Personal (each member must use it) **unless** the object is marked `groupUse` (big levers, doors, beacons): one use credits every member within 30 m. Story objects are `groupUse` by default. |
| **Escort / defend** | Shared: one escort NPC for the party (the leader's copy); success credits all members within 80 m at the end. |
| **Talk / scenes** | Personal; a party member may **join** another's scene as a watcher (the scene plays on both screens; the watcher gets credit only if they have the quest at that step). |
| **`choose` steps** | Personal; each member chooses for themself. When a choice changes a **shared** outcome (e.g. the toll in `ev_kettle_pass_convoy`), the first choice made wins. |
| **Phasing in a party** | A party sees the **leader's** phase in phased spots; members who are behind the leader's story see an "*You are seeing your party leader's version of this place*" note. |
| **Level differences** | A quest's objectives count for anyone with it. XP follows §4.1 per member (the out-levelled rule applies each to their own level). Optional **mentor mode** (page 15): a higher-level member levels down to the lowest member + 2 and earns full event/quest XP-to-coin conversion. |
| **Party progress** | The party frame shows each member's progress on the leader's tracked quest (e.g. "3/8") so nobody has to ask. |
| **Dungeons** | Entering a dungeon **auto-shares** every quest of that dungeon from any member who has it, to all members who can take it. |
| **Turn-in** | Personal, at the NPC or the journal (jobs/bounties). |
| **Followers** | Followers never take quests; their kills count as the owner's. |

---

## 17. Data files and tests

New Wildmarch data (page 16 owns file names; these are proposals) — all JSON, one record per quest in
the §3.2 shape:

| File | Holds | Rows |
|---|---|---|
| `data/quests/story.json` | §6 | 116 |
| `data/quests/side.json` | §10 | 84 |
| `data/quests/calling.json` | §8 | 90 (+ the 60 trial instance specs `ct_<class>_2/3` owned by the class files) |
| `data/quests/unlock.json` | §7 | 32 (the five raid unlocks are the last steps of §9's chains and live in `attune.json`) |
| `data/quests/attune.json` | §9 | 15 quests (steps that are story quests are not repeated) |
| `data/quests/daily.json` | §12 | 88 region dailies + 12 Veilspire + 6 weeklies |
| `data/quests/seasonal.json` | §15 | ~40 |
| `data/events.json` *(Wildmarch's own)* | §13 — `ev_*` with `phases[]`, `area`, `level`, `trigger`, `cooldown`, `scaling` | 25 |
| `data/story-instances.json` | §6.13 | 3 |
| reuse: `data/job-frames.json`, `data/incidents.json`, `data/wanderers.json`, Farhold `data/events.json` (road events) | §11, §14, §13.6 | as is |

Event record shape:

```json
{
  "id": "ev_siege_of_fort_ashfall",
  "name": "The Siege of Fort Ashfall",
  "region": "cinder_steppe", "at": "town_fort_ashfall", "area": 250,
  "level": [30, 36], "trigger": { "timer": { "every": 14400, "jitter": 1200 },
                                   "story": "q_ms_siege_of_ashfall" },
  "prewarn": 300, "cooldown": 14400,
  "phases": [
    { "id": "rams", "goal": { "kind": "kill", "tag": "siege_ram", "count": 4, "scale": "objective" },
      "seconds": 240, "fail": "bailey" },
    { "id": "walls", "goal": { "kind": "defend", "seconds": 180 }, "fail": "bailey" },
    { "id": "breach", "goal": { "kind": "defend", "seconds": 180 }, "fail": "bailey" },
    { "id": "sortie", "goal": { "kind": "kill", "ids": ["ashtusk_warchief", "legion_firebinder_captain"] },
      "seconds": 360, "fail": "end" },
    { "id": "bailey", "branch": true, "effects": { "closeWaystone": "town_fort_ashfall", "minutes": 60 } }
  ],
  "rewards": { "currency": "ashfall_medal", "rep": { "fac_crown_assembly": 10 }, "cosmetic": "set_ashfall_parade" }
}
```

**Tests** (node, pure logic — reuse Farhold's style of one table-driven test per row):

1. Every quest id is unique, starts with `q_`, and matches its kind's pattern (§2).
2. Every `giver`/`turnIn` is an `npc_` id listed on page 01; every `region`/`subzone`/`town_`/`lm_`
   id exists on page 01's tables (the test reads the data files that page 01's tables become).
3. **Rule 3.3.1:** no objective's sub-zone band minimum is more than 2 above the quest level (the test
   that catches the pyromancer mistake in §8).
4. The story chain is a single line: every `q_ms_*` except P.1 requires exactly the previous one; the
   levels never go down by more than 2 between consecutive quests.
5. Every class has exactly three calling quests at 6, 20 and 40.
6. Every dungeon id in canon §8 is the target of exactly one story `dungeon` objective **or** named in
   a side/attunement quest (d01–d14 all are).
7. Every event phase's goal kind is one the event runner knows; every event's `level` sits inside its
   region's band; every event can be won at `n = 1` by the sim bot with 2 followers (Farhold's
   `tools/sim-*` pattern).
8. XP budget: the sum of story + side + calling + unlock quest XP, by §4.1 shares against page 07's
   table, is between 50% and 60% of the XP from 1 to 60.
9. **Wording:** every `hud` line contains a number or a proper place name, and no quest text contains
   `!` (page 01 §12 rule 2; reuse Farhold `tests/wording.test.js` style).
10. Every reward `extras.unlock` names a feature on page 07's ladder, and every feature on the ladder
    that is not level-only has exactly one unlock quest in §7 / §9, **with page 07's id, level and giver**.

---

## 18. Canon change requests and questions

### Canon change requests (for page 00 or the owning page; not applied here)

1. ~~**Page 07 (feature ladder)** — adopt §7's unlock levels: perks 2, dodge roll **3**, followers 5,
   group finder 5, waystones 7, crafting 8, boats 9, bank 10, guild 10, talents/auction/portals 12,
   **mount 15**, arena 20, skyways 25, mount tier 2 35, Heroic/Mythic+/Spire Accord 60.~~
   **Resolved (00 §10):** page 07's ladder wins; §7 and §9 now use its levels and quest ids. Left for
   page 07 (this pass): (a) boats 9, portals 12 and skyways 25 keep this page's `q_unlock_*` quests —
   page 07 has paragraphs for them but its ladder table should list them; (b) `q_unlock_perks` (2),
   `q_unlock_talents` (12) and `q_unlock_spire_accord` (60) are kept here as quests — the first two
   only explain a level unlock, the third opens the Accord vendor and dailies; (c) the Homeward
   Stone's cooldown drop to 15 min at 30 is not on the ladder; (d) giver ids where page 01 already
   had the person: dodge `npc_hesk` (07: `npc_hv_drillmaster_corran`), group finder `npc_odile_marsh`
   (07: `npc_hv_warden_captain_isolde`), Riding I `npc_oswin_stablemaster` at `hc_stable_gate` (07:
   `npc_hc_stablemaster_oda`, Royal Stables), Unbinder / dual spec `npc_the_unbinder` (07:
   `npc_hc_unbinder_mott`), guild `npc_melisande_hart` at `hc_guild_row` (07: `npc_hc_registrar_pell`,
   Hall of Records), upgrade bench `npc_bodric_ashlock` (07: `npc_gr_forgemaster_brunhild`), Riding II
   `npc_zelde_marrach` at Dunehold (07: `npc_ss_caravan_master_idris`, Tamar), PvP `npc_brakka_arena`
   at `hc_wardens_yard` (07: `npc_hc_yardmaster_kell`, Proving Yard), r01 `npc_warden_of_bones` (07:
   `npc_hc_high_warden_ottilie`), r02 `npc_hallveig_rime` (07: `npc_fm_frost_warden_hakon`), r03
   `npc_amos_keeper` (07: `npc_dc_choirkeeper_selwyn`, which clashes with page 01's enemy
   `npc_cantor_selwyn`), Heroic and r04 `npc_marshal_ansel_crane` (07: `npc_el_marshal_ysolde`);
   (e) the Homeward Stone quest's inn is page 01's *Lamp and Ladder* (07 says *Plough and Kettle*);
   (f) Calling I comes by courier `npc_ollin_courier` from the Hall of Callings in **Highcourt** (07
   says a trainer in a Brightwater Hall of Callings, which page 01 does not have).
2. **Page 07 (XP)** — adopt §4.1's quest XP shares and the out-levelled rule, and **level sync** for
   events and region dailies (§12.1, §13.3).
3. **Page 08 (economy)** — ~~coin units 100 copper = 1 silver = 1/100 gold (§4.2); the currency
   **Wardens' Seals** (§12);~~ **Resolved (00 §10):** 100 copper = 1 silver, 100 silver = 1 gold, and
   Wardens' Seals are **Veil Sigils** `cur_veil_sigil`. Still open: event currencies (harvest tokens,
   Ashfall medals, riftshards, star-metal) and seasonal tokens (§15) — 00 §10 names only `cur_festival`.
4. **Page 03 (screens)** — `scr_quest_offer`, `scr_quest_turnin`, `scr_quest_reward_choice`,
   `hud_quest_tracker`, `hud_event_tracker`, the Journal's Quests and Rumours tabs.
5. **Page 04 (settings)** — the eleven keys in §5.7.
6. **Page 13 (raids)** — (open after the reconciliation pass) page 13's attunements
   (`q_attune_barrowking` via `npc_sexton_alder`, `q_attune_glacier_throne`, `q_attune_sunken_choir`,
   `q_attune_ember_court` via `npc_ashwarden_tamsin`, `q_attune_veilspire` via `npc_veilfactor_ilo`) are
   different chains with different steps from §9 here; one of the two must be picked. The story's
   boss ids now follow page 13 (`b_ember_king_kaedros`, `b_unwoven`, world boss `b_sallow_king` on the
   Drowned Coast). Also open: page 13 §8.6's seasonal world bosses (Harvest Effigy, Longnight Stag,
   Bloomtyrant, Sunwake Serpent, Veilstorm Herald — open-world, on Harvestide/Longnight/Firstbloom/
   Highsun) do not match §15's festivals and 5-player finder bosses (Rootwaker, Fallen Star, Unlit
   Warden, Old Rimejaw); and page 13 §8.7 asks this page to list weekly `q_world_boss_<region>` quests.
   Also: the r04 and r05 story instances `si_kings_last_word` and `si_the_lamps_climb`
   (reduced versions for the solo story finish), and r05 attunement needing the r04 **raid** kill.
7. **Brief id list** — add `ev_` (events), `si_` (story instances), `ct_` (calling trials), `fest_`
   (festivals) to the id conventions.
8. **Page 15 (social)** — the party quest rules in §16, notably party-wide kill credit at 60 m and
   "phasing follows the party leader".

### Questions for the owner

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q14-01 | Can the main story be finished **solo**? | yes, with story instances for the two raid finales (this page) · no, the ending needs the raid | **Yes** — canon pillar 6 says the open world is soloable; story instances keep the raid loot in the raid |
| Q14-02 | How much **phasing** (per-player versions of a place)? | none · only named story spots (this page) · heavy (whole towns change) | **Only named story spots** — phasing is expensive to build and confusing online |
| Q14-03 | Do quest choices (`choose`) change the **shared** world? | never · only through timed world state (this page) · permanently | **Only timed** — a shared world cannot be permanently changed by one player |
| Q14-04 | Board refresh — hourly per-player (this page) or daily shared? | hourly per player · daily per player · shared board | **Hourly per player** — nobody finds an empty board |
| Q14-05 | Level sync for events and low-level dailies? | yes (this page) · no, let high levels trivialise | **Yes** — otherwise level-60s farm starter events |
| Q14-06 | Seasonal events on the real calendar? | real calendar (this page) · in-game seasons | **Real calendar** — players plan around real dates |
| Q14-07 | Should the level-6 calling letter interrupt the story? | a courier walks up to you (this page) · wait until the next town | **Courier** — the calling is the class's first big moment; it should arrive at 6 on the dot |
