# Open questions for the owner

Every page's writer raised questions. They are collected here, merged where several writers asked the same
thing, and ordered by **how much they change the build**. Each has a recommendation, so you can answer
"yes to all recommendations" and mark exceptions only.

The docs are written **as if every recommendation were accepted**. Answering differently means editing the
pages named in the row.

**How to answer:** reply with the question number and your choice (e.g. "A3: no, B2: option b"). Anything you
skip stays on the recommendation.

> **Round 2 (2026-09-30).** The owner's answers to the WoW audit settled or changed these rows — they are
> **resolved by [page 00 §12](00-OVERVIEW.md#12-round-2-rulings-2026-09-30)** and kept below only for the record:
> **A8** (the story finales are 5-player dungeons d15/d16, so yes, solo-able with followers) · **B1** (ladder
> changed: no raids; Travel Methods, professions, Depth) · **B5** (flying = a Kingsfire story chain, no
> dungeon/reputation gates) · **B8** (Renown removed) · **C1**, **C12** (druid forms now transform the six spells;
> forms are Bear/Wolf/Heron) · **C4** (pets: tame/bind/control only) · **C5** (mass resurrection removed) · **C10**
> (the swashbuckler is now a hybrid tank) · **C13**, **C16**, **E5**, **F12**, **F13** (no raids) · **C17** (Flux) ·
> **D1** (Tab targeting) · **D7** (Normal/Challenge) · **E1**, **F15** (personal loot, and items are not bound, so
> no trade window is needed) · **E2** (four socket kinds) · **E3** (magic find: page 08) · **E4** (gathering is in:
> Harvesting) · **E7** (Mythic+ replaced by Depth) · **F2**, **F3** (the Fire King; the ending is in d16) · **F5**
> (no dailies) · **F18** (duels only) · **G1–G3** (fixed in Farhold round 28). New questions from round 2 are in
> section H at the end.

---

## A. The big ones — these shape the whole game

| # | Question | Options | Recommendation | Pages |
|---|---|---|---|---|
| A1 | **Name.** "Wildmarch" is a working title. Keep it? | keep · suggest another | keep for now; rename is a find-and-replace until code exists | all |
| A2 | **Online first or offline first?** | (a) build the single-player game with a fake local server, add real networking later · (b) networked from day one | **(a)** — a playable Hearthvale + first dungeon offline, then networking | 16, 18 |
| A3 | **Server stack.** | Node + WebSockets on a VPS · Cloudflare Durable Objects · Supabase for accounts either way | **Node.js + WebSockets on a rented Linux server, Supabase for accounts/characters, Cloudflare in front** — the Farhold rules modules have no page or Three.js code, so the server, the offline game and a test bot run the same files | 16 |
| A4 | **Desktop only?** Phones get a "play on a computer" card; gamepad is optional. | desktop only · desktop + gamepad · also phones | **desktop + gamepad later**, no phone play | 02, 03, 04 |
| A5 | **The custom class** from Farhold (build your own class from a tier list) is left out. | leave out · bring back | **leave out** — 30 bespoke kits are the point | 00, 06 |
| A6 | **The continent: hand-made or generated?** | hand-made · fixed World Forge seed · fixed seed plus a hand-edit file | **fixed seed plus hand edits** (~16 × 24 km) | 01, 16 |
| A7 | **Time to level 60.** | ~60 h · ~103 h · ~150 h | **~103 h** (page 07's curve) | 07 |
| A8 | **Can the main story be finished solo?** The two raid finales get solo/5-player story versions. | yes · no, story needs raids | **yes** | 13, 14 |
| A9 | **Music.** The playground has no music system. | none (ambience only) · generated music · licensed/commissioned | **ambience only for v2**, a music slider reserved | 04, 17 |
| A10 | **Voice chat.** | none (text, pings, spoken quick-chat) · push-to-talk | **none**, key reserved | 02, 15 |

## B. Progression and unlocks

| # | Question | Recommendation | Pages |
|---|---|---|---|
| B1 | The unlock ladder (page 07): sprint 2, dodge 5, mount 10, fast travel 12, raid 30, flying at 60 — right pace? | yes | 07 |
| B2 | Five levels with no dodge roll (no weaker sidestep before it)? | yes — Hearthvale's telegraphs are slow | 07, 11 |
| B3 | Should a dodge roll ever be **required** on Normal difficulty? | no — Normal is always beatable by walking | 11, 12 |
| B4 | A spell that unlocks after a talent tier gets its missed tiers all at once (spell 6 at 40 opens three tiers). | yes (now canon) | 07 |
| B5 | Flying mounts: in at 60 behind a hard chain (Mythic+ 10 and two reputations). Too hard? | keep the chain, drop the Mythic+ requirement to Heroic clears | 07, 08 |
| B6 | Farhold gave bonus perk points from bosses/landmarks. Canon fixes 59. Bring a few back? | no — keep builds comparable | 07 |
| B7 | Should roles give a small passive (+10% health for tanks, +10% healing for healers)? | yes | 06 |
| B8 | Renown after 60 gives up to +5% damage / +10% health. Keep or cosmetic only? | cosmetic plus convenience only — power creep hurts old raids | 07 |
| B9 | Followers from level 8 by quest (Farhold: 3 slots at level 1). May they fill the tank or healer slot on Normal? | yes to both | 07, 11, 15 |
| B10 | Heirloom set: +30% XP at six pieces. Too much? | lower to +20% | 09 |
| B11 | Death cost: durability and walking time only, no gold? Keep durability at all? | keep durability (small gold sink), no gold loss | 05, 08 |

## C. Classes

| # | Question | Recommendation | Pages |
|---|---|---|---|
| C1 | Druid forms: Bear + Stag at 6, Cat at 20, Owl at 40 — a ranged druid arrives late. | keep | druid |
| C2 | Mage is arcane only (fire → Pyromancer, lightning → Stormcaller). | keep | mage |
| C3 | Pets never count toward soak circles — including the necromancer's Bone Brute, the tinker's Soak Plate mine and the knight's "counts as two" talent. | no pet/mine counts; the knight talent becomes −50% soak damage instead | 11, classes |
| C4 | Dropped Farhold pets: priest's spirit bear, enchanter's imp, demon hunter's dire companion. | agree | classes |
| C5 | Cleric's automatic Mass Resurrection on Mythic raid bosses (once per attempt, setting to turn off)? | allow on Normal/Heroic only | cleric, 13 |
| C6 | Rogue's Deathwarrant: +10%/point from the rogue, +3%/point from others (not the original +50% all). | keep | rogue |
| C7 | Paladin: Keeping (tank) + Mercy (healer) oaths at 1, Dawnfire (damage) at 20. | keep | paladin |
| C8 | Cleric armour: light (canon) vs medium (Farhold). | light | cleric |
| C9 | Pyromancer's Overheat burns 2% max health/s before level 40. | keep | pyromancer |
| C10 | Swashbuckler tier-4 talent that briefly taunts bosses (1.5 s) to cover a tank swap. | cut — keep damage classes pure | swashbuckler |
| C11 | Oracle at 40 strikes through one wrong boss-dialog reply. | keep — it is the class's fantasy | oracle, 11 |
| C12 | Stag form lets one party member ride on the druid. | keep, out of combat only | druid |
| C13 | Sorcerer's Chaos Table has two joke results (confetti, a random hat). In raids? | open world and dungeons only | sorcerer |
| C14 | Monk hand wraps: a real two-handed weapon type, or fists scaled by gloves? | a real weapon type (`wraps`) | monk, 08 |
| C15 | Tinker main attribute INT (Farhold) → DEX. | DEX | tinker, 07 |
| C16 | Mythic raids weaken time/redirect tools (chronomancer Recall 20% cap). Apply to all such tools? | yes, one rule on page 11 | 11 |
| C17 | "Surge" is used by Mage, Dragon Knight and Sorcerer. One word per idea? | rename Sorcerer's gauge to "Flux" | classes |

## D. Combat and bosses

| # | Question | Recommendation | Pages |
|---|---|---|---|
| D1 | Aim model default: Hybrid (reticle + soft target + Tab lock). Cut the pure Action mode to save test time? | keep Hybrid default, keep Classic, cut Action | 02, 05 |
| D2 | Should boss dialog choices be disabled in the open world (no votes among strangers)? | yes | 11 |
| D3 | "Followers never cause a wipe" (they always handle mechanics well enough)? | yes | 11 |
| D4 | Falling off a ledge on Normal: 30% health and back to the edge instead of death? | yes | 11 |
| D5 | Bosses immune to stun/root; control fills a break bar instead. | yes (now canon) | 05, 11 |
| D6 | No hard enrage on Normal dungeons? | yes | 11, 12 |
| D7 | Tank swaps in 5-player dungeons only on Heroic/Mythic+ (Normal uses a room object)? | yes | 12 |
| D8 | Arcane ignores half of every resistance? | yes | 05 |
| D9 | Heavy armour slows you 5%? | no | 05 |
| D10 | Built-in boss ability timers on by default? | yes | 04, 11 |
| D11 | A tutorial pause the first time a danger zone appears (Hearthvale only)? | no pause (nothing pauses, and slow motion is impossible in a shared world); instead the first few danger zones in Hearthvale warn twice as long and show a one-time hint card | 03, 11 |

## E. Items and loot

| # | Question | Recommendation | Pages |
|---|---|---|---|
| E1 | Personal loot everywhere (no need/greed rolls), with a 2-hour trade window. | yes | 08, 03 |
| E2 | Gems and sockets as an optional layer? | yes, from level 30 | 08 |
| E3 | Magic find only works on open-world kills and chests (no gear swap before bosses)? | yes | 08 |
| E4 | No gathering — all crafting materials come from salvage, as in Farhold. | yes | 08 |
| E5 | Old raids r01–r03: add a level-60 difficulty so their sets stay useful? | yes, as "Timeworn" Mythic versions later, not in v2 launch | 08, 13 |
| E6 | Legendary drop rate 1 in 40 per Normal dungeon run while levelling. | lower to 1 in 80 | 12 |
| E7 | Mythic+ scaling ×1.10 → ×6.45 (keys 2–25), loot stops rising at key 10. | keep | 12 |
| E8 | Transmog (the wardrobe) and an account-wide bank? | yes to both | 03, 08 |

## F. World, quests and online

| # | Question | Recommendation | Pages |
|---|---|---|---|
| F1 | All four races start in Brightwater? | yes | 01 |
| F2 | The ending choice on Veilspire changes cosmetics only (one shared world)? | yes | 01 |
| F3 | Keep the Ember King's motive (a dead daughter) and reuse Emberveil's Iris and Garrick? | yes | 01 |
| F4 | Per-player phasing only at named story spots; quest choices change the shared world only on timers. | yes | 14, 15 |
| F5 | Level sync (temporarily lowering a high-level player) for events and low-level dailies? | yes | 14 |
| F6 | Festivals on the real calendar? | yes | 14 |
| F7 | Hardcore realms (one life) and a test realm? | test realm yes, hardcore later | 03, 15 |
| F8 | Gender choice at creation (sets starting look and voice; all looks available to all)? | yes | 03 |
| F9 | Housing? | not in v2 | 15 |
| F10 | Class-only dialog replies in dungeons (e.g. rogue options in d03)? | a few, never required | 12 |
| F11 | d14: kneeling to the Herald ends the dungeon early with a "Kneeler" title. | keep | 12 |
| F12 | The Veilspire secret boss needs every raider to carry an ember from all ten regions ("Last Ember"). Too demanding? | make it per-raid-leader, not per-member | 13 |
| F13 | The Mirror Court (r05) builds bosses from the raid's own classes. | keep — the class pages give exact numbers | 13 |
| F14 | Metres or feet in tooltips? | metres | 04 |
| F15 | Need/Greed/Pass wording, if rolls are ever used; should a party leader be able to switch rolls on in Normal dungeons? | personal loot only | 03, 15 |
| F16 | Regions join through gates with a short loading pause, or seamlessly? | gates with a short pause (simpler server, cleaner instancing) | 01, 16 |
| F17 | Sign-in: email only, or also Google/Discord? | email + Discord | 15 |
| F18 | PvP scope: duels, battlegrounds, open-world flag, arenas — all? Legendary powers in rated arenas? | all four; legendary powers off in rated arenas | 05, 15 |
| F19 | Character renames: paid, or free every 90 days? | free every 90 days | 15 |
| F20 | Mail between strangers arrives after 1 hour (stops a stolen account being emptied at once)? | yes | 15 |
| F21 | Server regions at launch and a domain name? | North America first; domain your call | 15, 16 |
| F22 | Can an offline character move to an online realm? | no — offline characters are for testing and solo play | 16 |
| F23 | When does Wildmarch move to its own git repository? | at the start of networking (roadmap M9) | 18 |
| F24 | Icons: Font Awesome Pro in the shipped game, or SVG icons only? | SVG icons (your preference for games) | 17 |
| F25 | A dyslexia-friendly font option? | yes | 04 |
| F26 | Frostmantle's aurora sky layer — worth the art time? | yes, late (roadmap M17) | 17 |

## G. Things found in Farhold while researching

These are **bugs in the existing Farhold game**, found by the items writer. Nothing was changed.

| # | Bug | Where |
|---|---|---|
| G1 | `of Resonance` gives +300–800% spell power for 6 s: its tuning is a flat 3–8 but the handler adds it straight to `spellPower`, which became a fraction in round 18 | `prototypes/farhold/js/effects.js`, `js/affixes.js` |
| G2 | `of Second Wind` saves you at **full** health every 60 s: it rolls a fixed 1 filed as a fraction and the handler sets `survive = maxHp × 1` | same |
| G3 | `of Laceration` bleeds 1.8–3.6 damage in total at any level, so it does nothing past level 5 | same |
| G4 | `avatar-3d/data/class-outfits.json` has no rows for Swashbuckler, Shadow Dancer or Witch Hunter; Tinker has only a top and Shaman only a hat | shared art |

Want these fixed in Farhold now? **Recommendation:** yes, as a small separate round — they are shared-data or
Farhold-only fixes and do not touch Wildmarch.

---

## H. New questions from round 2 (2026-09-30)

Raised by the agents that applied round 2. As before, each has a recommendation and the docs are written as if
it were accepted. Answer only the ones you disagree with.

### The ones that matter most

| # | Question | Recommendation | Pages |
|---|---|---|---|
| H1 | **Hybrid switch.** Classes switch to their hybrid role with a **Role focus** switch in the spellbook (out of combat, saved per Loadout). Some also tie it to what they already have — the fighter needs a shield to queue as tank, the paladin's oath sets the role. OK? And should it unlock at level 6 (with the Dungeon Finder)? | yes, at 6 | 00 §6, 06, classes |
| H2 | **Challenge-mode Dungeon Finder** prefers primary tanks/healers when it can, but never refuses a hybrid. Or treat hybrids exactly the same? | prefer primaries, never refuse | 06, 15 |
| H3 | **Depth numbering.** Low dungeons climb 3 levels per depth before reaching 60, so d01 goes to Depth 48 while d14–d16 top out at 30. Or number depths from level 60 only (and call the climbing part something else)? | keep one number | 12 |
| H4 | **Followers in Depth** only below level 60 (and to Deep 5), none in Challenge. | yes | 12, 15 |
| H5 | **Harvest nodes are personal**: everyone sees the same node and each player harvests their own copy (no stealing, no camping). | yes | 19 |
| H6 | **Waystones don't teleport.** They are places you discover, Recall Stone binds and teleport targets. Instant travel is a priced scroll or a class spell. A free waystone menu would make the Travel Methods pointless. | yes | 07, 20 |
| H7 | **Starting towns**: Brightwater and a second one, Oakhollow, both in Hearthvale (you mentioned choosing a starting location). | yes | 01 |
| H8 | **Souls**: 3 active souls per character at most; removing a jewel or soul is safe (costs gold), removing a gadget destroys it. | yes | 08, 19 |

### Classes

| # | Question | Recommendation | Pages |
|---|---|---|---|
| H9 | Druid forms arrive Heron 6, Bear 20, Wolf 40 — so no druid tanking before 20. Move Bear earlier? | keep | druid |
| H10 | Pyromancer has **no mana at all** (Heat is its Momentum) and is weak for the first 6–8 s of a pull by design. | keep | pyromancer |
| H11 | Shaman's Great Storm revives one fallen ally (~every 90 s) — its battle revive. | keep | shaman |
| H12 | The ranger's `soul_shared_breath` lets the tamed beast revive **in** combat once per 120 s (bends the out-of-combat rule). | keep, it's a rare soul | ranger |
| H13 | The warlock soul that lets two bound demons out at once at 70% power each. | keep | warlock |
| H14 | Bard Tempo refills faster on the beat (±0.15 s window, a beat-cue setting, a soul that widens it). OK online? | keep | bard |
| H15 | Tactician: crossbow **or** thrown spear, or crossbow only? | both | tactician |
| H16 | Chronomancer Retrace at 12 (with the other travel spells), range 30 m. | keep | chronomancer, 20 |
| H17 | Cleric: **Keeping Vigil** (a warded ally survives a killing hit once per 60 s) replaces mass resurrection at 40. | keep | cleric |
| H18 | Paladin's full-Sanctity revive has no cooldown beyond the ~50 s refill. | add a 3 min cooldown | paladin |
| H19 | Tamed-pet stable: 4 spare pets (the ranger file says 3/5/7 by calling). | follow the ranger file (3/5/7) | 06, ranger |
| H20 | Enemy view-cone overlay: on for rogues by default, an option for everyone. | yes | 04, rogue |
| H21 | Tinker's combat deployables are called **Devices** (Engineering makes **Gadgets**). | yes | tinker, 19 |
| H22 | Enchanter's illusion tank (Many Faces) is strong against one big hitter, weak against packs. | keep that shape | enchanter |

### Items, loot and professions

| # | Question | Recommendation | Pages |
|---|---|---|---|
| H23 | Keep durability (a small gold sink)? | yes | 08 |
| H24 | Frozen monsters map to the **Ancient** special rarity ("ice keeps a thing old"). | yes | 10 |
| H25 | Champion packs: each member ×2.0 health (a single Farhold champion was ×2.6). | yes | 10 |
| H26 | Gilded "runner" monsters that flee and drop gold, open world only. | yes | 10 |
| H27 | Cooking as an eighth profession? | no | 19 |
| H28 | Prismatic gems at the top of Jewelcrafting? | later | 19 |
| H29 | A tadpole caught fishing that grows into a frog mount? | yes, a fun collection | 19, 08 |
| H30 | Sworn faction quartermasters sell gear made at your level — does that compete with dungeon gear? | keep, one tier below dungeon best | 07, 08 |
| H31 | Content 3+ levels below you pays half reputation standing. | yes | 07 |
| H32 | Tag bonuses add into one uncapped pool. | yes | 05 |

### Travel, world and online

| # | Question | Recommendation | Pages |
|---|---|---|---|
| H33 | "Longshank" for the giant strider, "the Deepway" for the dwarven rail line? | yes | 20 |
| H34 | Step off a land Travel Method between stations, or only at stations? | anywhere (hold Space), you lose the protection | 20 |
| H35 | Do routes cross region borders? | yes | 20 |
| H36 | Riding past a dungeon on a Travel Method does **not** discover it (you must walk up or teleport there). | yes | 20, 12 |
| H37 | Wagons open at level 12, not 5. | 12 | 07, 20 |
| H38 | First Pale Sea crossing free? | yes, once | 20 |
| H39 | The Finder refuses a premade party unless **every** member has discovered the dungeon. | yes | 14, 15 |
| H40 | Dynamic events scale only up to 5 players. | yes | 14 |
| H41 | Keep three new late faction chapters (so every faction has a town at 52+), and the friendly orcs as a Crown Assembly chapter? | yes | 01 |
| H42 | World bosses: the loose **Warcall** channel is enough (no temporary open group with frames). | yes | 13, 15 |
| H43 | World bosses: two "Ascendant" bosses a week raised to 60; seasonal bosses one chest per event; shared legendary pool (no per-boss legendary). | yes | 13 |
| H44 | Group duels (up to 5 v 5)? Hardcore realms? | no; later | 15 |

### Interface and targeting

| # | Question | Recommendation | Pages |
|---|---|---|---|
| H45 | An Auto-target spell sets your target to what it picked. | yes | 02, 04 |
| H46 | A dead enemy stays targeted until you change it. | yes | 02 |
| H47 | Recall Stone on `Home`; professions on `L`; utility spells on a `Shift+Q` ring. | yes | 02 |
| H48 | Heals with no friendly target refuse ("No friendly target"); self-cast fallback is **off** by default — or on for levels 1–9 only? | off, with a hint card at level 1 | 02, 04 |
| H49 | Item card compare on `Shift` (short card) rather than always shown. | Shift | 03, 04 |
| H50 | Item portrait on Low graphics: a still picture. | still picture | 17 |

### Dungeons

| # | Question | Recommendation | Pages |
|---|---|---|---|
| H51 | Allow one 4–5 pip "everyone in" soak per boss fight (most soaks are 1–3)? | yes, one per fight | 11, 12 |
| H52 | d16: Saelith can die if you pick "Because you can't stop us." | keep | 12 |
| H53 | `set_barrowwarden` names two different sets (page 09 §3.33 #1). Rename the page-12 one? | yes, rename page 12's | 09, 12 |
| H54 | `set_reliquary_ash`'s 6-piece bonus lets you survive a one-shot, against page 09's rule that sets never bypass a mechanic. | swap it for a large barrier | 09, 12 |
| H55 | Page 12 replaced 8 generic dungeon sets with its own. Retire the 8 old ones? | retire them (listed on page 09 §3.32) | 09 |
| H56 | Page 09's rule "a boss lists at most one generic legendary" is broken by many "any Challenge boss" sources. Loosen it to "at most one per boss, not counting world-pool drops"? | loosen | 09 |
