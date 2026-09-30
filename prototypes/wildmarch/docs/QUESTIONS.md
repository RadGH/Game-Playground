# Open questions for the owner

Every page's writer raised questions. They are collected here, merged where several writers asked the same
thing, and ordered by **how much they change the build**. Each has a recommendation, so you can answer
"yes to all recommendations" and mark exceptions only.

The docs are written **as if every recommendation were accepted**. Answering differently means editing the
pages named in the row.

**How to answer:** reply with the question number and your choice (e.g. "A3: no, B2: option b"). Anything you
skip stays on the recommendation.

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
