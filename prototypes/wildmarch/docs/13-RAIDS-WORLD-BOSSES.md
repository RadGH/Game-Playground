# WILDMARCH — Design Bible, page 13: Raids and World Bosses

> *"Ten of you went down the stair. Count again at the bottom."*

**Status:** v0.1 draft for review — 2026-09-29. **Nothing is built.** Claude-facing design page.

**This page owns:** every raid (`r01`–`r05`) — its rules, attunement, layout, trash, bosses, secret boss,
dialog, hard modes and loot tables — and every **world boss** (the eight regional ones and the seasonal
ones), their spawn rules, scaling and loot.

**This page reads (and must agree with):** [page 00](00-OVERVIEW.md) (canon: ids, sizes, levels),
[page 05](05-COMBAT.md) (damage maths, threat, battle resurrection), [page 07](07-PROGRESSION.md) (the
feature-unlock ladder that opens raids at 30), [page 08](08-ITEMS.md) (item levels, token rules),
[page 09](09-SETS-LEGENDARIES.md) (it indexes the raid sets, legendaries and uniques named here),
[page 10](10-BESTIARY.md) (monster families), [page 11](11-BOSS-MECHANICS.md) (the telegraph vocabulary,
minimum warning times, cast bars, boss dialog banners), [page 14](14-QUESTS-EVENTS.md) (it lists the
attunement quests named here), [page 15](15-SOCIAL-ONLINE.md) (group finder, raid groups, lockout
sharing, loot trading), [page 03](03-UI-SCREENS.md) / [page 02](02-CONTROLS.md) / [page 04](04-SETTINGS.md)
(every screen, key and setting this page introduces is listed in §2.15 so those pages can add it).

**Where the numbers come from.** Page 05 owns the real damage and health maths and did not exist when this
page was written. So §1.2 fixes a **reference character** per raid (health and damage per second) and every
number on this page is written against it. If page 05 changes the reference, scale every number on this
page by the same ratio — the fights are designed in *proportions* (a Danger zone hit = 80% of a non-tank's
health), and the proportion is the thing to keep.

---

## Contents

1. [How to read this page](#1-how-to-read-this-page)
2. [Raid rules](#2-raid-rules)
3. [r01 — Crypt of the Barrowking](#3-r01--crypt-of-the-barrowking)
4. [r02 — The Glacier Throne](#4-r02--the-glacier-throne)
5. [r03 — The Sunken Choir](#5-r03--the-sunken-choir)
6. [r04 — The Ember Court](#6-r04--the-ember-court)
7. [r05 — Veilspire](#7-r05--veilspire)
8. [World bosses](#8-world-bosses)
9. [Loot index](#9-loot-index)
10. [Id index](#10-id-index)
11. [Reuse map](#11-reuse-map)
12. [Notes for other pages](#12-notes-for-other-pages)

---

## 1. How to read this page

### 1.1 The ability table

Every boss ability is one row with these columns:

| Column | Means |
|---|---|
| **Ability** | the name the player sees on the cast bar, and its id in `code` (`<bossid>_<snake>`, e.g. `b_ossuary_warden_bone_slam`) |
| **Kind** | the page 11 word: **Danger zone**, **Void zone**, **Soak**, **Safe zone**, **Targeted**, **Beneficial**, **Tether**, **Tank swap**, **Adds**, **Interrupt**, **Dispel**, **Room-wide**, **Knockback**, **Line of sight**, **Kite** |
| **Shape / colour** | circle, donut, cone, line/beam, cross, moving wave, checkerboard, room-wide; with its radius, length, width or angle in metres/degrees, and the page 11 colour (RED, PURPLE-black, ORANGE, BLUE, YELLOW, GREEN, WHITE) |
| **Warning** | seconds from the telegraph appearing to the hit. Normal first, Mythic second where they differ (`2.0 / 1.5`). Never below page 11's minimums: **1.5 s Normal, 1.2 s Mythic, 3.0 s for anything that kills outright** |
| **Damage** | Normal numbers against the reference character in §1.2. `(80%)` after a number is the share of a non-tank's health; `(T 60%)` is the share of a tank's. **Lethal** means it kills any character regardless of health or shields |
| **Counterplay** | what the raid does about it, in the brief's vocabulary |

**Cast bars:** "gold" in the Kind column means the cast bar has a gold border and the cast can be
**interrupted** (a stun, silence, knockback or a class interrupt stops it). Everything else is grey and
cannot be interrupted. Page 11 owns how the bar looks.

**Every 0.5 s:** Void zones tick every 0.5 s (page 11). A number written "400 / tick" is per half-second.

### 1.2 Reference characters (proposal — page 05 owns the final maths)

Raid-ready means: at the raid's level, in gear from the tier before it (dungeons at that band, or the
previous raid).

| Raid | Level | Non-tank health | Tank health | Damage per second, one damage player | Healing per second, one healer |
|---|---|---|---|---|---|
| r01 | 30 | 1,500 | 2,600 | 220 | 180 |
| r02 | 42 | 2,200 | 3,800 | 380 | 300 |
| r03 Normal | 50 | 2,800 | 4,800 | 520 | 420 |
| r03 Mythic | 50→60 raid gear | 3,200 | 5,500 | 600 | 480 |
| r04 Normal | 60 | 3,600 | 6,200 | 760 | 600 |
| r04 Mythic | 60 | 4,100 | 7,100 | 870 | 690 |
| r05 Normal | 60 | 4,000 | 7,000 | 900 | 720 |
| r05 Mythic | 60 | 4,600 | 8,000 | 1,035 | 830 |

### 1.3 How boss health is set

`health = (damage per second of one damage player) × (damage-player equivalents) × (target kill time in seconds)`

- **Damage-player equivalents:** 6.5 in a 10-player raid (six damage players plus what the tanks, healers
  and supports add), 13.5 in a 20-player raid.
- **Target kill time:** first boss of a raid ~4:00, the final boss ~8:00–11:00, the secret boss ~7:00–10:00.
- **Mythic** multiplies Normal health by **2.85** for r03 and r04 (10 → 20 players, better gear, longer
  fights) and by **1.38** for r05 (already 20 players on Normal).
- **Flex** (§2.1) scales health below the full size.

Every boss table lists `Health N / M` (Normal / Mythic). The damage numbers are Normal; **Mythic damage is
×1.35** unless a row says otherwise.

### 1.4 Ids

| Thing | Pattern | Example |
|---|---|---|
| Raid | `r0N_<snake>` (canon) | `r01_barrowking` |
| Boss | `b_<snake>` | `b_ossuary_warden` |
| Boss ability | `<bossid>_<snake>` | `b_ossuary_warden_marrow_pool` |
| Boss line | `bl_<bossid>_<snake>` | `bl_b_ossuary_warden_pull` |
| Dialog opportunity | `dlg_<bossid>_<snake>` | `dlg_b_barrowking_hrodric_crown` |
| Trash monster | `m_<family>_<snake>` | `m_undead_barrow_spearman` |
| Hard mode | `hm_<bossid>` | `hm_b_ossuary_warden` |
| Feat (achievement) | `ft_<raid>_<snake>` | `ft_r01_ring_the_count` |
| Raid set | `set_<snake>` | `set_ninefold_oath` |
| Raid legendary / unique | `leg_<snake>` / `uq_<snake>` | `leg_crown_of_the_ninth`, `uq_sextons_lantern` |
| Other raid items (tokens, mounts, cosmetics) | `it_<snake>` | `it_token_r01_head` |
| Currency | `cur_<snake>` (page 08 §17) | `cur_oathstone` |
| Attunement quest | `q_<snake>` | `q_attune_barrowking` |
| NPC | `npc_<snake>` | `npc_sexton_alder` |
| World marker | `wm_<snake>` | `wm_sun` |
| Screen | `scr_<snake>` | `scr_raid_frames` |
| Setting | `set.<tab>.<key>` | `set.raid.frame_layout` |

Monster **families** used on this page are Farhold's eight (`data/enemies.json` `families`): `undead`,
`beast`, `construct`, `elemental`, `aberration`, `humanoid`, `dragonkin`, `fiend`. Giants and orcs of the
warbands are `humanoid` (their Farhold family). Page 10 owns the family list; if it adds `giant` or `veil`,
rename the ids here (see §12). **Partly resolved (00 §10 — page 10 owns warbands):** page 10 §3 adds
`giant`, `orc`, `goblin`, `beastkin`, `ember`, `veil`, `demon` and others, so the warband ids on this page now
use page 10's families (`m_giant_stonehide_*`, `m_ember_*`). The remaining `m_humanoid_*` ids for non-warband
trash are left for the family pass.

**Bodies.** Every monster and boss names its body, which is either:
- a **Chibi 2 humanoid**: `chibi2:<race>/<outfit>` — race from `avatar-3d/js/chibi2-races.js` (human, elf,
  dwarf, orc, giant, goblin, halfling, undead, beast), outfit from `avatar-3d/data/class-outfits.json`
  (one of its 24 classes) plus hat/held overrides; or
- an **avatar-3d creature**: `creature:<type> ×<size>` — type from `avatar-3d/js/creature-types.js` (wolf,
  dire_wolf, boar, bear, rat, horse, pony, courser, elk, deer, drake, dragon, spider, bat, snake, hound,
  cat, frog, owl, moth, worm, golem, titan, imp, elemental, wisp, shard, wraith, horror, hyena, saber_cat,
  crocodile, turtle, griffin, phoenix, beetle, centipede, slime, mushroom, turret, mimic), with colours.

Hats come from `avatar-3d/js/chibi2-hats.js`. One hat used on this page does not exist yet: **`hood`** (a cloth hood
or veil — new part; register it in `avatar-2d/js/parts/chibi2-parts.js` too, per the Chibi 2 rule). Held weapons use
the `fh_` ids in `avatar-3d/js/chibi2-weapon-ids.js`; the one missing (`fh_whip`) is marked where it is used.

Effects name `avatar-3d/js/spellfx.js` calls: an **element** (fire, ice, shadow, holy, nature, arcane,
lightning, physical, poison, bleed, true) and a **call** (`projectile`, `impact`, `aoe`, `cast`, `breath`,
`pillar`, `vortex`, `storm`, `beam`, `ring`) or a **status aura** from `STATUS_FX` (burn, poison, bleed,
freeze, stun, sleep, confused, dazed, blind, slow, marked, barrier, regen, sunder, curse, silence, disarm,
root, rally, haste, enchant, block, deflect). `(reuse: avatar-3d/js/spellfx.js)` applies to every one of
them and is not repeated.

---

## 2. Raid rules

### 2.1 Sizes, difficulties and flex

Canon (page 00 §4, §9): raids are **10 players (Normal)** or **20 players (Mythic)**; difficulties are
**Normal** and **Mythic**. Page 00 §9 sizes each raid individually, so this page applies it like this:

| Raid | Level | Normal | Mythic | Notes |
|---|---|---|---|---|
| `r01_barrowking` | 30 | 10 (flex 8–10) | — | teaching raid; no Mythic (canon size 10). Hard modes give the challenge |
| `r02_glacier_throne` | 42 | 10 (flex 8–10) | — | no Mythic (canon size 10). Hard modes |
| `r03_sunken_choir` | 50 | 10 (flex 8–10) | 20 (fixed) at level 50, loot scales to 60 | first raid with Mythic |
| `r04_ember_court` | 60 | 10 (flex 8–10) | 20 (fixed) | |
| `r05_veilspire` | 60 | 20 (flex 15–20) | 20 (fixed) | canon size 20 on both |

**Flex** (new): a Normal raid may start with fewer than its full size. For every missing player:

| Raid size | Boss health | Raid-wide damage | Soak pips | Adds per wave |
|---|---|---|---|---|
| 10 (flex 8–10) | −9% per missing player | −5% per missing player | `ceil(N × players / 10)` | −1 add per 2 missing (rounded down) |
| 20 (flex 15–20) | −4.5% per missing player | −2.5% per missing player | `ceil(N × players / 20)` | −1 add per 3 missing |

Flex is locked at the pull: a boss scales to the number of players **alive and inside the arena** when combat
starts. A player who joins mid-fight does not change it. Mythic is never flexed.

**Level floors.** You must be at least the raid's level to enter Normal (level 60 to enter any Mythic).
Above the level you keep your full power; the raid does not scale down to you. Page 07 may add a
"raid level sync" option later (§12).

### 2.2 Lockouts

- **Weekly reset:** every **Wednesday at 07:00 server time** (canon 00 §4; page 15 owns server time). Every raid
  lockout clears at once.
- **What is locked:** loot, not entry. Each character has, per raid and per difficulty, one lockout that
  records **which bosses that character has looted** this week. You can re-enter and help a friend; a boss
  you already looted drops nothing *for you* (personal loot) or counts you out of the loot list (loot master).
- **Saved instance:** a raid group keeps its instance (dead bosses stay dead, cleared trash stays cleared)
  for the week as long as the **group leader** holds that lockout. Anyone in the group can re-enter while at
  least one member is inside or within 7 days of the last kill.
- **Merging:** a player whose lockout has *fewer* kills than the group's instance may join; the join
  prompt lists which bosses they would miss ("Joining will skip 2 bosses you have not looted: …").
- **Secret bosses** have their own lockout line; the unlock condition must be met again every week.
- **World bosses:** personal loot once per day per boss, plus one weekly bonus chest (§8.4).
- **Screen:** `scr_raid_lockouts` (a tab of the Group screen) lists raid, difficulty, bosses looted (✓/✗),
  reset countdown, and a **Extend lockout** toggle (keep this week's instance next week, for progression
  guilds; you get no new loot from bosses already dead).

### 2.3 Roles and composition

Roles are canon: **Tank, Healer, Damage, Support** (Support counts as a Damage slot).

| Size | Tanks | Healers | Damage + Support | Group finder fill (Normal only) |
|---|---|---|---|---|
| 10 | 2 | 2–3 | 5–6 | 2 T / 2 H / 6 D |
| 20 | 2–3 | 4–5 | 12–14 | 2 T / 4 H / 14 D |

- **Why two tanks, always:** every raid boss has at least one **Tank swap** mechanic (§3.6 onward). A
  single-tank raid is not blocked, but the boss tables assume two.
- **Subgroups:** a 10-player raid is 2 subgroups of 5; a 20-player raid is 4 subgroups of 5. Subgroups matter
  for party-wide spells (page 06 class files) and for **rotating soaks** (`Group 1 soaks the first orb…`).
- **Buff coverage:** no raid mechanic requires a specific class. A mechanic that asks for an **interrupt**,
  **dispel**, **knockback** or **slow** is always answerable by at least 10 of the 30 classes (page 06 keeps
  the matrix) and by the shared potions/consumables (page 08: *Warding Draught* dispels one harmful magic
  effect on yourself; *Tripwire Charge* is an item interrupt with a 60 s shared cooldown).
- **Followers:** followers (hired or class companions) may fill slots in **Normal r01 and r02 only**, at
  80% of a player's damage/healing, and they do mechanics at a fixed skill (they soak, spread and move out
  of Danger zones; they do not interrupt). They never fill Mythic or r05.
- **Group finder:** Normal raids are in the group finder (page 15) with personal loot forced. Mythic is
  premade only (guilds, friends, the raid-listing board).

### 2.4 Raid frames — `scr_raid_frames` (new)

Raid frames replace the party frames when the group has more than 5 players (or always, per settings).

| Element | What it shows |
|---|---|
| Frame grid | one box per player, grouped by subgroup: 2 columns × 5 (10-player) or 4 × 5 (20-player). Box size 110 × 38 px at 100% UI scale |
| Health | bar in class colour (setting: role colour, or green); absorbs as a white overlay past the bar; incoming heals as a lighter segment |
| Resource | thin 3 px bar under health (healers only by default; setting: all) |
| Role icon | shield (Tank), cross (Healer), blade (Damage), banner (Support), top-left |
| Debuffs | up to 3 icons bottom-right: **boss debuffs first**, then dispellable ones (a coloured corner per dispel type: magic blue, curse purple, poison green, disease brown, bleed red) |
| Mechanic badges | the page 11 colour badge on the frame when a player is the target of a mechanic: YELLOW dot = Targeted, WHITE link = Tether, ORANGE ring = assigned Soak, RED border flash = standing in a Danger zone |
| Range | the frame fades to 40% when out of 40 m (setting) |
| Dead / released / offline | grey with a skull / "Released" / "Offline" |
| Ready check | ✓ / ✗ / ? over the frame for 30 s |
| Raid marker | the target-marker icon (§2.5) if the player is marked |
| Threat | a red frame edge on a non-tank that holds boss threat |
| Click | left-click targets; right-click opens the player menu; **mouseover casting** as page 02 defines |

Layouts (`set.raid.frame_layout`): **Grouped** (default), **By role** (tanks, healers, damage), **Compact**
(no names, 60 × 28 px), **Healer wide** (160 × 44 px, 5 debuffs). Frames can be dragged (unlock in the frame
menu), scaled 60–150%, and **sorted** by group, role, name or class.

### 2.5 Raid leader tools — `scr_raid_leader` (new)

The **raid leader** (the group leader of a raid) can hand out **Raid assist** to any member. Assists can use
every tool below except changing loot rules and kicking.

| Tool | Who | What it does | Limits |
|---|---|---|---|
| **World markers** | leader, assists | place one of 8 ground markers at the cursor (§2.5.1). Visible to the raid, drawn on the minimap and the raid frames' mini arena map | 8 markers, one of each; right-click clears one; "Clear all" button |
| **Target markers** | leader, assists (anyone in 5-player parties) | put one of 8 icons over a unit's head. Same 8 symbols as world markers | one unit per symbol |
| **Ready check** | leader, assists | a 30 s popup on every screen: *Ready* / *Not ready*. Results shown on frames and summarised in chat: "Ready check: 18/20 ready (Brin: not ready, Oso: no answer)" | 30 s cooldown |
| **Role check** | leader | every member confirms their role for the group finder and the loot filter | 30 s |
| **Pull timer** | leader, assists | a centre-screen countdown (5–15 s, default 10) with a tick sound on the last 5; "Pull!" at 0. Cancelled by the same button | 3 s cooldown |
| **Raid warning** | leader, assists | a line of text shown centre-screen to everyone for 5 s in orange, with a horn sound | 1 per 3 s |
| **Subgroups** | leader, assists | drag players between groups on the Raid tab of the Group screen | out of combat only |
| **Loot rules** | leader | *Personal loot* (default) or *Loot master* (§2.10); the loot quality threshold for loot master (Rare / Epic / Unique+) | out of combat; locked once a boss in the instance is dead unless all members agree |
| **Difficulty** | leader | Normal / Mythic; flex size shown | only before the first boss kill of the lockout, or between bosses with the whole raid outside combat |
| **Hard mode switch** | leader | shows which hard-mode triggers are armed for the next boss (§2.11) — a reminder, not the trigger | — |
| **Dialog vote** | leader | *Leader chooses* (default) / *Raid votes* (majority within 10 s; ties go to the leader) for dialog opportunities (§2.13) | per boss |
| **Mass summon** | leader | casts a 10 s summon to the raid entrance for anyone in the same region; needs 3 players at the entrance "stone" | out of combat, 5 min cooldown |
| **Break timer** | leader | a 5/10/15 min countdown in the corner of every screen | — |
| **Kick** | leader | removes a player; they are ported out after 60 s | out of combat |

#### 2.5.1 The eight markers

Same symbols for world markers (on the ground) and target markers (over a head). Colours are chosen so none
of them is a page 11 telegraph colour — a marker must never be mistaken for a mechanic.

| id | Symbol | Colour | Default key (page 02 §5.4: world marker = Shift+Num N, target marker = Num N) |
|---|---|---|---|
| `wm_sun` | eight-rayed sun | gold `#e8b830` | Shift+Num 1 / Num 1 |
| `wm_moon` | crescent | pale silver `#cfd6e0` | Shift+Num 2 / Num 2 |
| `wm_star` | four-point star | cyan `#40d0e0` | Shift+Num 3 / Num 3 |
| `wm_flame` | flame | pink-magenta `#e050b0` | Shift+Num 4 / Num 4 |
| `wm_leaf` | leaf | teal `#2fc4b2` | Shift+Num 5 / Num 5 |
| `wm_anvil` | anvil | brown `#a07040` | Shift+Num 6 / Num 6 |
| `wm_bell` | bell | lilac `#b098e0` | Shift+Num 7 / Num 7 |
| `wm_crown` | crown | white with a gold rim `#fff4d0` | Shift+Num 8 / Num 8 |

A world marker is a 1.2 m flat disc with its symbol, a 0.2 m light column and a label; it never blocks
movement and never glows in the colours of page 11.

#### 2.5.2 The encounter guide — `scr_raid_journal` (new)

A book tab (Journal → Raids) with one page per raid and per boss: lore paragraph, the body model spinning,
**every ability** with its icon, kind, shape and a 1-line plain-language counterplay, the phase health
notches, the enrage time, hard-mode trigger (once found — hard-mode triggers are hidden until a player in
your guild or party has triggered it, then written in), and the loot table with drop chances. Secret bosses
show as a locked silhouette with one hint line until killed once by anyone on the server.

### 2.6 Arena rules

- **Arena lock:** when a boss is pulled, a barrier (the raid's material: bone grate, ice wall, coral, cinder
  portcullis, Veil membrane) closes every door of the arena. Players outside cannot enter until the fight ends.
- **Combat resurrection:** during a boss fight the raid may revive a dead player in combat **1 time in
  10-player, 2 times in 20-player**, +1 per 5 minutes of the fight. Classes with a revive and the
  *Emberheart Draught* consumable (page 08) draw on the same shared count. Out of combat, revives are free.
- **Released players** (who clicked *Release*) appear at the last checkpoint (§2.7) and cannot re-enter a
  locked arena until the fight ends.
- **Leashing:** a boss that leaves its arena bounds (pulled out) resets at once to full health.
- **Soft reset:** if every player in the arena is dead, or no living player is inside the arena for 5 s, the
  boss resets: full health, adds vanish, void zones clear, doors open after 5 s.
- **Consumables** work normally; potions share a 60 s cooldown in boss fights (page 08).
- **Boss fights disable** mounts, stealth-reset (vanishing to drop combat), follower summons after the pull
  and hearthing.

### 2.7 Wipes and recovery

A **wipe** is every player dead in a boss fight.

1. The boss soft-resets (§2.6). Doors open 5 s later.
2. Dead players get the **Release** button at once (it is always there, but in a wipe there is no one to
   revive them). Releasing puts you at the **nearest raid checkpoint** alive with 50% health and resource.
3. **Checkpoints:** every raid has one at the entrance and one after each boss (a raid-themed stone — a grave
   candle, a warm brazier, a bell, an ember shrine, a Veil lamp). A checkpoint is lit when the boss before it
   dies and stays lit for the lockout.
4. **Trash** does not respawn after a wipe, except where a raid section says so (§3.5 etc.: e.g. the
   Barrowking's Ossuary re-rises 4 skeletons every 10 min while its boss lives).
5. **Repair:** every checkpoint after boss 2 has a repair anvil (a spirit smith NPC, `npc_spirit_smith`), and
   the raid entrance has a vendor for consumables. Durability loss on death: 10% (page 08 owns durability).
6. **Resolve** (Normal only, new): each wipe on the same boss in the same lockout gives the raid
   **Resolve** — +4% health, damage and healing — stacking up to **5** (+20%). Resolve clears when the boss
   dies or at the weekly reset. Hard-mode feats and "first kill" server announcements are not awarded with
   Resolve above 2 stacks. Mythic has no Resolve.
7. **Wipe counter:** the raid frame header shows "Attempt 7" for the current boss; the encounter guide keeps
   the guild's best attempt (lowest health reached) per boss.

### 2.8 Enrage timers

Every raid boss has a **hard enrage**: a clock that starts at the pull. At the enrage time:

- the boss gains **+500% damage and +50% attack speed**, and
- casts **its enrage ability** (named per boss) every 10 s — always Room-wide, always lethal within 30 s.

The enrage time is printed in the boss table and on the boss frame (a small clock that turns red in the last
60 s). A few bosses also have **soft enrage** (they grow stronger over time on purpose, e.g. stacks per phase);
each is listed where it happens. Enrage timers are the same on Normal and Mythic unless the table says
otherwise. Hard modes may shorten the timer.

### 2.9 Attunement

The raid door is a **feature unlock** on the ladder (page 07 §Feature ladder): **Raids** unlock at **level 30**
with the quest `q_attune_barrowking`. Every raid after it needs its own attunement quest. Attunement is
**per account** once any character finishes it (the door remembers your family name); every character still
has to reach the raid's level.

| Raid | Attunement quest | Level to take | Needs (summary — full steps in each raid's section) |
|---|---|---|---|
| r01 | `q_attune_barrowking` "The Key Under Highcourt" | 30 | clear `d08_moonwell_ruins` (Normal); kill the Unburied Gravemarshal warlord; open the Catacomb Gate |
| r02 | `q_attune_glacier_throne` "Word from Rimehold" | 42 | r01 final boss killed once; clear `d10_rimefang_caverns`; carry the Hearthcoal up the Frostmantle |
| r03 | `q_attune_sunken_choir` "The Bell That Rings Underwater" | 50 | r02 final boss once; clear `d11_saltdeep_cathedral`; ring the three shore bells at low tide |
| r04 | `q_attune_ember_court` "A Petition in Ash" | 60 | r03 final boss once (any difficulty); clear `d13_cindergate` and `d14_ashen_reliquary`; earn a Court Writ from the Ember Legion's deserters |
| r05 | `q_attune_veilspire` "The Door With No Wall" | 60 | r04 final boss once; the main story's last chapter (page 14); assemble the Veil Key from four raid relics |

- **Mythic** needs no extra attunement; the Mythic door opens for a raid leader who has killed that raid's
  final boss on Normal.
- **Group finder** Normal raids check attunement for every member; a premade raid lets an un-attuned player
  in if at least half the raid is attuned (*"Carried through the door"*) — they get the attunement on the
  first boss kill. This keeps a guild from being blocked by one new member.
- Attunement quest ids are listed on page 14.

### 2.10 Loot

#### 2.10.1 Personal loot and loot master

| Rule | How it works |
|---|---|
| **Personal loot** (default, forced in the group finder) | each boss rolls **for each eligible player** separately. A 10-player boss gives on average **2.5 items** to the raid (25% per player), a 20-player boss **5** (25%). Items are for your class and current role. What you get is shown only to you and in the raid's loot log. **Trading:** an item you win can be traded to anyone in the raid for 2 hours if its item level is not higher than one you already own in that slot |
| **Loot master** (premade only) | the boss drops a **fixed number of items** into a shared chest: Normal 10-player **3**, Mythic 20-player **6**, r05 Normal **5**, r05 Mythic **6**; +1 on a hard-mode kill. The loot master (the leader or a chosen member) hands each item out from `scr_loot_master`: the item, a list of eligible players with their current item in that slot, and optional **Need / Greed / Pass** rolls |
| **Raid tokens** | set pieces drop as **tokens** (`it_token_<raid>_<slot>`), usable by any class. Hand one to the raid's quartermaster to get the piece in your armour weight |
| **Currency** | every boss kill gives each player **Oathstones** (`cur_oathstone`, stacks, account-bound): Normal 1 per boss, Mythic 2, secret boss 3, world boss weekly chest 1. Spent at quartermasters (§2.10.3) |
| **Bad luck protection** | each boss kill that gives you no item raises your personal chance at the next boss in the same raid by +10% (resets on an item) |
| **Once per week** | boss loot is once per lockout. Trash in raids drops ordinary loot plus a 1% chance of any raid-exclusive unique from that raid's list |

#### 2.10.2 Item levels (proposal — page 08 owns item level)

| Source | Item level |
|---|---|
| r01 Normal | 34 (hard mode 38) |
| r02 Normal | 46 (hard mode 50) |
| r03 Normal / Mythic | 54 / 64 (hard mode +4) |
| r04 Normal / Mythic | 66 / 74 (hard mode +4) |
| r05 Normal / Mythic | 74 / 82 (hard mode +4) |
| Secret bosses | the raid's value + 6 |
| World bosses | their region band top + 4; at level 60, 62 (tier 1 world bosses) to 70 (Emberthrone) |

#### 2.10.3 Quartermasters

Each raid has a quartermaster in its region's hub (NPC ids proposed here; page 01 owns NPCs):

| Raid | Quartermaster | Where | Sells for Oathstones |
|---|---|---|---|
| r01 | `npc_sexton_alder` | Highcourt, Catacomb Gate | the set piece of any token you hand in; set pieces outright (head/chest/legs 12, hands/feet 9, necklace 8); one raid unique per week (15) |
| r02 | `npc_quartermaster_hrefna` | Rimehold | same shape; prices +2 |
| r03 | `npc_bellwright_osk` | Saltmarch | same; Mythic token hand-ins need a Mythic token |
| r04 | `npc_ashwarden_tamsin` | Last Light | same |
| r05 | `npc_veilfactor_ilo` | the Spire Landing | same; plus the **Veil upgrade**: 20 Oathstones raise one r05 Normal item to Mythic item level (once per week) |

Quartermasters also sell raid cosmetics (tabards, banners) and the raid's **consumable pack** (flasks, food)
for gold.

### 2.11 Hard modes and feats

- **Every raid boss has a hard mode** (`hm_<bossid>`). A hard mode is **armed by doing something in the
  world** — lighting a candle, leaving an object alone, answering a dialog a certain way, killing adds in a
  certain order — never by a menu. The encounter guide lists the trigger once someone in your guild has found
  it (§2.5.2). Hard mode is available on Normal and Mythic.
- **What changes:** the boss gets one new or harsher mechanic (listed per boss), **+20% health**, and its
  enrage is 30 s sooner unless stated.
- **What it pays:** **+1 item** (personal loot: +15% chance per player; loot master: +1 item), item level +4,
  a feat, and a chance at the boss's **hard-mode-only drop** (a cosmetic, a unique or a mount — listed).
- **Feats** (`ft_<raid>_<snake>`, new): account achievements. Each raid has feats for: each hard mode, the
  secret boss, "no deaths" per boss, a speed clear (all bosses in N minutes), and one playful feat per raid.
  Finishing **every** hard mode in a raid gives that raid's title (e.g. *"of the Ninefold"*). Page 07 owns
  titles and renown; the feat list is here.

### 2.12 Secret bosses

- Every raid has **one secret boss** (canon: "+ 1 secret").
- A secret boss **does not exist in the instance** until its unlock condition is met in that lockout. The
  condition is always something a curious raid could find by looking: a thing in the trash, an odd answer in a
  dialog, a mechanic done "wrong" on purpose.
- When the condition is met: a banner (*"Something in the crypt has noticed you."*), the checkpoint light turns
  the secret boss's colour, and a new door or stair opens. The door stays open for the lockout.
- The secret boss is always **harder than the raid's final boss on the same difficulty** (10–15% more
  health, the raid's hardest mechanic density) and drops one guaranteed raid-exclusive legendary to one
  player, a mount at 2% per player (personal loot), and a title the first time.
- First kill per server is announced to the whole server.

### 2.13 Dialog opportunities

Every raid has at least one (most have several). Rules for all of them (page 11 owns the look):

1. The boss **stops**: invulnerable, no casts, void zones stop ticking, adds freeze. A centre-screen banner and
   the boss's voice give the line.
2. A **reply wheel** of 2–4 options appears for the raid leader (or everyone, if *Raid votes* — §2.5). A
   **12 s** timer runs. No answer = the first option is **"Say nothing"**, which is always the default and
   always the normal fight.
3. The chosen reply is spoken by the **leader's character** (their voice and Lingo speech, reuse:
   `shared/voices.js`, `lingo/`) and shown to the raid.
4. A reply can: skip a phase, change a phase, give or deny a buff, arm a hard mode, open a secret boss, or
   start a short parley that ends the fight peacefully with different loot. Each one is written into that
   boss's section.
5. A dialog opportunity happens **once per pull**. On a retry the boss says a shorter line (*"You again."*).

### 2.14 Scaling tables (summary)

| | r01 | r02 | r03 N | r03 M | r04 N | r04 M | r05 N | r05 M |
|---|---|---|---|---|---|---|---|---|
| Players | 10 | 10 | 10 | 20 | 10 | 20 | 20 | 20 |
| Boss health range | 345k–685k | 595k–1.34M | 810k–1.83M | 2.31M–5.2M | 1.19M–2.97M | 3.38M–8.45M | 2.92M–8.02M | 4.03M–11.07M |
| Mechanic density (distinct mechanics live at once, max) | 2 | 3 | 3 | 4 | 4 | 5 | 5 | 6 |
| Minimum warning | 2.0 s | 1.8 s | 1.5 s | 1.2 s | 1.5 s | 1.2 s | 1.5 s | 1.2 s |
| Enrage range | 7–10 min | 7–11 min | 7–12 min | same | 7–12 min | same | 8–14 min | same |

r01 uses **2.0 s** warnings on everything (above the 1.5 s floor) because it is the teaching raid.

### 2.15 Screens, keys and settings added by this page

For pages 03, 02 and 04 to list:

| Kind | id | What |
|---|---|---|
| Screen | `scr_raid_frames` | raid frames (§2.4) |
| Screen | `scr_raid_leader` | leader tools panel (§2.5) |
| Screen | `scr_raid_lockouts` | lockouts tab (§2.2) |
| Screen | `scr_raid_journal` | encounter guide (§2.5.2) |
| Screen | `scr_loot_master` | loot master hand-out window (§2.10) |
| Screen | `scr_dialog_choice` | the reply wheel (§2.13) |
| Screen | `scr_world_boss_tracker` | world boss timers and map pins (§8.2) |
| HUD | boss frames | up to 5 boss frames right of centre, with phase notches, cast bar, enrage clock |
| HUD | pull timer / raid warning / break timer | centre-screen text (§2.5) |
| Key (page 02) | Shift+Num 1 … Shift+Num 8 | place world marker 1–8 at the reticle |
| Key (page 02) | Num 1 … Num 8 | put target marker 1–8 on your target (Alt+1–4 are boss-dialog replies, canon 00 §10) |
| Key (page 02) | Shift+Num 0 | clear all world markers |
| Key (proposal) | Shift+R | open the raid leader panel |
| Key (page 02) | none — `/ready` | ready check |
| Key (page 02) | none — `/pull 10` | pull timer (default length) |
| Key (canon 00 §10) | Alt+1 … Alt+4 while the reply wheel is open | pick a dialog reply |
| Setting | `set.raid.frame_layout` | Grouped / By role / Compact / Healer wide (default Grouped) |
| Setting | `set.raid.frame_scale` | 60–150% (default 100) |
| Setting | `set.raid.frame_color` | Class / Role / Green (default Class) |
| Setting | `set.raid.show_resource` | Healers only / All / None (default Healers only) |
| Setting | `set.raid.range_fade` | on / off (default on) |
| Setting | `set.raid.use_for_party` | use raid frames in 5-player groups (default off) |
| Setting | `set.raid.pull_timer_length` | 5–15 s (default 10) |
| Setting | `set.raid.marker_labels` | show world marker labels (default on) |
| Setting | `set.raid.dialog_vote` | Leader chooses / Raid votes (default Leader chooses) |
| Setting | `set.raid.boss_banner` | show boss-line banners: All / Warnings only / Off (default All) |
| Setting | `set.raid.world_boss_alerts` | world boss 15-min warnings: Region / All / Off (default Region) |
| Setting | `set.raid.loot_popup` | show others' personal loot in a popup (default off; the log always shows it) |

---

## 3. r01 — Crypt of the Barrowking

### 3.1 At a glance

| Field | Value |
|---|---|
| id | `r01_barrowking` |
| Name | Crypt of the Barrowking |
| Level | 30 (item level 34, hard mode 38) |
| Size | 10 (flex 8–10). Normal only |
| Entrance | Highcourt, the Catacomb Gate under the Chapel of Ash (the capital, page 01); the crypt runs north under the Greyridge Highlands |
| Bosses | 5 + 1 secret: Ossuary Warden → Sister Candlemourn → the Gravewardens → the Rotmaw → the Barrowking → *(secret)* the Ninth Heir |
| Checkpoints | grave candles (pale gold flame) |
| Raid set | **`set_ninefold_oath`** — *The Ninefold Oath* |
| Expected clear | 2–3 hours first week; 70–90 minutes on farm |
| Teaches | one new mechanic per boss, then all of them together (below) |

**Teaching order.** The first raid is where a new raider learns the page 11 vocabulary. Every boss adds
roughly one new idea and repeats the ones before it:

| Boss | New ideas | Repeated |
|---|---|---|
| 1 Ossuary Warden | Danger zone (cone), Void zone, Tank swap, add wave | — |
| 2 Sister Candlemourn | Interrupt (gold cast bar), Dispel, Targeted spread, Beneficial zone | Void zone, adds |
| 3 The Gravewardens | Two bosses, Tether (bosses and players), Soak, kill-together | Danger zone, Tank swap |
| 4 The Rotmaw | Moving wave with a gap, Kite (fixate adds), rescue a swallowed player | Danger zone, Void zone, Tank swap |
| 5 The Barrowking | three phases, a dialog opportunity, all of the above at once (density 2) | everything |
| Secret: the Ninth Heir | checkerboard, "cannot be healed" rings, healer-assigned Beneficial zones | everything |

### 3.2 Lore

Before Highcourt had walls there was a hill, and in the hill a king who had himself buried with his eight
heirs and his whole war-band so that none of them would ever serve another crown. Highcourt was built on top
of the barrow on purpose — the first Crown Assembly wanted the old king to hear every coronation. The dead
king has heard nine of them. The tenth is this year, and the catacomb sextons say the bones under the Chapel of
Ash have started to line up in ranks. The Unburied Legion (the undead warband, page 10) has been marching out of
the Greyridge for a decade; this is where they are mustered from.

The **Ninth Heir** is the child the king had struck from the list of his heirs. Her name was chiselled off
every stone. She was buried below the others, alone and unnamed, and she is the reason the Unburied do not stay
buried.

### 3.3 Attunement — `q_attune_barrowking` "The Key Under Highcourt"

Given by `npc_sexton_alder` at the Catacomb Gate to any level-30 character (the Raids unlock card on page 07
points here).

| Step | Objective | Where | Notes |
|---|---|---|---|
| 1 | Speak with Sexton Alder | Highcourt, Catacomb Gate | he explains the gate needs a barrow key, a warlord's seal and a sexton's word |
| 2 | Recover the **Barrow Key** (`it_barrow_key`) | `d08_moonwell_ruins` final boss (Normal or higher) | quest drop, 100%, every party member on the quest |
| 3 | Take the **Gravemarshal's Seal** (`it_gravemarshal_seal`) | kill the Unburied Gravemarshal warlord at any Unburied war camp (reuse: Farhold R27 M10 warlords, `data/warbands.json`) | the Greyridge barrow camps or the Sunscar tomb-edge camps (the Unburied hold 12–24, page 10 §9.3); a group of 3–5 or followers |
| 4 | Read the three **sexton's ledgers** | three catacomb shrines in Highcourt's Low Quarter | a short walk that teaches the Journal → Raids page |
| 5 | Open the Catacomb Gate | Highcourt | a 20 s cinematic: the gate grinds, the ranks of bones inside turn their heads |
| Reward | Raid unlock card (page 07), 12 Oathstones, `it_sextons_tabard` (cosmetic) | | account-wide attunement |

### 3.4 Layout

```
                      HIGHCOURT — Chapel of Ash
                               │  Catacomb Gate (entrance, checkpoint 0, vendor)
                               ▼
                    ┌──────────────────────┐
                    │  THE LONG STAIR      │  4 trash packs down a 60 m stair,
                    │  (spearmen, archers) │  archers on landings (line of sight)
                    └──────────┬───────────┘
                               ▼
      ┌────────────────────────────────────────────────┐
      │ THE OSSUARY (boss 1)  40 m circle, bone walls   │  skull swarms crawl from the walls
      │          [W] Ossuary Warden                      │
      └──────────────────────┬─────────────────────────┘
                             │ checkpoint 1
              ┌──────────────▼──────────────┐
              │ HALL OF MOURNERS (trash x5) │  weeping widows fear, acolytes heal
              └──────────────┬──────────────┘
      ┌──────────────────────▼──────────────────────┐
      │ THE CANDLE NAVE (boss 2)  50 x 30 m          │
      │  (c)       (c)   [S] altar   (c)       (c)   │  (c) = the four great candles
      └──────────────────────┬──────────────────────┘
                             │ checkpoint 2 (repair)
         ┌───────────────────┴───────────────────┐
   ┌─────▼─────┐                           ┌─────▼─────┐
   │ EAST VAULT │  optional side vault     │ WEST VAULT │  optional side vault
   │ (name-stone│  with 2 elite packs      │ (name-stone│  with 2 elite packs
   │  4,5)      │                          │  6,7)      │
   └─────┬─────┘                           └─────┬─────┘
         └───────────────────┬───────────────────┘
      ┌──────────────────────▼──────────────────────┐
      │ THE TWIN VAULTS (boss 3)  60 x 30 m          │
      │  [Hask]  ·  ·  pillar row  ·  ·  [Hollin]    │  keep them 10 m apart
      └──────────────────────┬──────────────────────┘
                             │ checkpoint 3
      ┌──────────────────────▼──────────────────────┐
      │ THE ROT PIT (boss 4)  round pit, 44 m        │
      │   ramps down on 4 sides; rot grubs in walls  │
      └──────────────────────┬──────────────────────┘
                             │ checkpoint 4 (repair)
              ┌──────────────▼──────────────┐
              │ THE BARROW ROAD (trash x6)  │  knights in pairs, the Barrow Herald
              └──────────────┬──────────────┘
      ┌──────────────────────▼──────────────────────┐
      │ THRONE OF NINE (boss 5)  56 m hall           │
      │  8 heir-tombs down the sides   [K] throne    │
      │  (the ninth tomb has no name)  │             │
      └────────────────────────────────┼─────────────┘
                                       │ (secret: opens behind the throne)
                           ┌───────────▼───────────┐
                           │ THE UNNAMED TOMB       │  secret boss arena, 36 m
                           │   [?] the Ninth Heir   │  floor of 6 x 6 name-slabs
                           └───────────────────────┘
```

**The nine name-stones** (secret unlock, §3.11): stone 1 on the Long Stair (behind the second landing's
archers), 2 and 3 in the Ossuary's wall niches (visible only after boss 1 dies), 4–5 in the East Vault, 6–7
in the West Vault, 8 on the Barrow Road under the Herald's banner. Stone 9 is in the Throne of Nine: a blank
stone at the ninth heir-tomb. Reading a stone is a 2 s interact; the raid shares the count (shown on the raid
frame header as a small "Names 5/8").

### 3.5 Trash

Trash health is at the reference level (§1.2); "Elite" packs are marked. Families: undead, construct, beast,
aberration.

| id | Name | Body | Where | Health | Abilities |
|---|---|---|---|---|---|
| `m_undead_barrow_spearman` | Barrow Spearman | `chibi2:undead/fighter`, spear (`fh_spear`), `chain_coif` | Long Stair, Barrow Road | 24,000 | **Brace** — 3 m frontal line jab, 380; **Shield Rank** — adjacent spearmen take 20% less damage (spread them) |
| `m_undead_barrow_shieldbearer` | Barrow Shieldbearer | `chibi2:undead/warrior`, round shield | Long Stair | 32,000 | **Shield Wall** — blocks 75% from the front; **Bash** — 2 s stun on the tank, 1 per 15 s |
| `m_undead_bone_archer` | Bone Archer | `chibi2:undead/ranger`, bow | Long Stair landings | 16,000 | **Volley** — Targeted 4 m YELLOW circle on a random player, 2.0 s, 500; stands on a landing — pull it round a corner (line of sight) |
| `m_undead_grave_acolyte` | Grave Acolyte | `chibi2:undead/cleric`, candle censer | Hall of Mourners | 18,000 | **Mend Bones** (gold, 2.5 s) — heals an ally 15%; **interrupt** it |
| `m_undead_weeping_widow` | Weeping Widow | `chibi2:undead/priest`, veil (`circlet`) | Hall of Mourners | 22,000 | **Keen** (gold, 2.0 s) — Fear (confused aura) all within 10 m for 3 s; interrupt or step out |
| `m_undead_mourner` | Candle Mourner | `chibi2:undead/cleric`, a lit candle held | Hall of Mourners; Candlemourn's adds | 9,000 | walks slowly (2.4 m/s) to its mistress; **Offering** — heals her 5% on arrival; slowable, rootable |
| `m_undead_ossuary_skull_swarm` | Skull Swarm | `creature:rat ×0.6`, bone-white, `skull` sprites orbiting | Ossuary; Warden's adds | 3,500 | fixates a random player at 3.4 m/s; **Rattle Burst** — 400 in 3 m on contact |
| `m_construct_ossuary_bonewalker` | Ossuary Bonewalker | `creature:golem ×1.4`, bone colours | Ossuary approach (Elite) | 60,000 | **Grind** — tank hits 420 + stacking 5% damage taken (10 s); **Scatter** — 6 m circle Danger zone, 2.0 s, 700, at 50% health |
| `m_beast_crypt_rat` | Crypt Rat | `creature:rat ×0.9` | everywhere, packs of 6 | 2,400 | **Gnaw** — 1 bleed stack (40/s, 6 s); harmless alone, dangerous if ignored |
| `m_beast_carrion_bat` | Carrion Bat | `creature:bat ×1.2`, grey | Rot Pit approach | 6,000 | **Swoop** — 8 m line, 300; flies over pits |
| `m_aberration_grave_grub` | Grave Grub | `creature:worm ×0.5`, pale | Rot Pit approach | 5,000 | **Burst** on death — 3 m Void zone for 10 s, 60 / tick; kill them away from the group |
| `m_aberration_rot_lurker` | Rot Lurker | `creature:horror ×1.1`, sickly green-brown | Rot Pit approach (Elite) | 55,000 | **Rot Breath** — 50° cone 10 m, 2.0 s, 600 + poison 60/s; **Pull** — tethers the farthest player and drags them 8 m in |
| `m_undead_barrow_knight` | Barrow Knight | `chibi2:undead/knight`, `plate_helm`, sword + shield | Barrow Road (pairs, Elite) | 70,000 | **Pinning Strike** — tank 700 + Sunder (–20% armour 12 s); **Oath of Pairs** — if the other knight of its pair is within 8 m it is immune to crowd control; split them |
| `m_undead_barrow_herald` | The Barrow Herald | `chibi2:undead/tactician`, horn, banner (`warbanner`) | Barrow Road end (mini-boss, optional for hard mode) | 120,000 | **Muster Horn** (gold, 3.0 s) — calls 4 spearmen; **Banner of Nine** — a 12 m Beneficial-for-*enemies* aura (+20% damage). Killing him disarms the Barrowking hard mode (§3.10) |
| `m_undead_catacomb_sexton` | Hollow Sexton | `creature:wraith ×1.3`, lantern-yellow eyes | patrols the Hall of Mourners and the Barrow Road | 45,000 | **Lantern Sweep** — 12 m cone that Marks players (marked aura) for 10 s; marked players take 25% more from the next trash pull |
| `m_undead_barrow_hound` | Barrow Hound | `creature:hound ×1.3`, bone-and-hide | Barrow Road, with knights | 14,000 | **Harry** — leaps at a healer, 400 + slow 30% 4 s |

**Respawns:** the Ossuary's walls re-rise 4 Skull Swarms every 10 min while the Warden lives. Nothing else
respawns in the lockout.

### 3.6 Boss 1 — The Ossuary Warden

| Field | Value |
|---|---|
| id | `b_ossuary_warden` |
| Body | `creature:golem ×3.2`, colours body `#d8ccb0`, belly `#a89c80`, accent `#4a4030`, eyes `#e8c860`; `core` glows pale gold; a ribcage of real bones around the core |
| Health | **345,000** |
| Enrage | 7:00 — *Ossuary Collapse*: the walls fall in, Room-wide 3,000 every 10 s |
| Arena | the Ossuary, 40 m circle, bone walls with 8 niches (the adds come out of them) |
| Phases | P1 100–40% *The Count*; P2 40–0% *Unbound* |
| Voice | deep, grinding (formant, `voiceFor({ role: 'boss', gender: 'none', seed: 1101 })`) |

**Phase 1 — The Count (100–40%)**

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Crushing Grip** `b_ossuary_warden_crushing_grip` | Tank swap | melee, current tank | — | 520 per hit every 2 s (T 20%) + 1 **Crushed** stack: +15% damage taken, 20 s | the other tank taunts at **3 stacks** |
| **Bone Slam** `b_ossuary_warden_bone_slam` | Danger zone | cone 90°, 12 m, RED, fills from the edge in | 2.0 s | 1,400 (93%) + knockback 6 m | stand behind or beside him; the tank faces him away from the raid |
| **Marrow Pool** `b_ossuary_warden_marrow_pool` | Void zone | circle 4 m, PURPLE-black, under 1 random ranged player; grows 0.1 m/s to 7 m | 2.0 s to place | 150 / tick (300/s) + slow 20% | the targeted player walks to the arena edge before it lands; lasts 45 s |
| **Rattle of Bones** `b_ossuary_warden_rattle` | Adds | 4 `m_undead_ossuary_skull_swarm` from the niches | line + 3 s walk-out | 400 each on contact | area damage kills them; a fixated player kites them through the tank's cleave |

Pattern: Bone Slam every 16 s; Marrow Pool every 20 s; Rattle of Bones every 45 s (first at 0:30).

**Phase 2 — Unbound (40–0%).** He tears his ribcage open; the core is exposed and he takes **+10% damage**.
Keeps Crushing Grip, Bone Slam and Marrow Pool, and adds:

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Bone Storm** `b_ossuary_warden_bone_storm` | Moving wave | a ring of bone 1.2 m tall rolling outward from him at 6 m/s to the wall; one 60° **gap** marked with a BLUE arc | 2.0 s (the ring rises around him) | 900 (60%) + 2 s knockdown | run to the BLUE gap and stand in it as the ring passes; every 14 s |
| **Last Count** `b_ossuary_warden_last_count` | Room-wide | whole arena | cast 3.0 s at 10% health, grey bar | 600 to everyone | heal up before 10%; he dies 20 s later unless killed first |

**Lines** (voice + bubble + banner; the underlined ones are warnings):

| id | When | Line |
|---|---|---|
| `bl_b_ossuary_warden_pull` | pull | "The dead are counted. You are not." |
| `bl_b_ossuary_warden_slam` | 2.0 s before Bone Slam (first 3 times) | "**Kneel.**" |
| `bl_b_ossuary_warden_pool` | Marrow Pool | "Drink, then." |
| `bl_b_ossuary_warden_adds` | Rattle of Bones | "**Up, little ones. Up.**" |
| `bl_b_ossuary_warden_p2` | 40% | "I am more bones than you have ever seen." |
| `bl_b_ossuary_warden_storm` | before Bone Storm | "**Round and round the ossuary.**" |
| `bl_b_ossuary_warden_death` | death | "Counted… at last." |

**Hard mode — `hm_b_ossuary_warden` "Ring the Count."** Armed by ringing the cracked **Counting Bell** in the
Ossuary doorway (interact, 1 s) before the pull. The bell tolls once per Bone Slam for the whole fight.
- Marrow Pools never expire, and **every Bone Slam leaves a 4 m Marrow Pool at the tip of its cone**.
- Bone Storm starts in phase 1 (from 70%).
- Drop: `it_bone_bell_tabard` (cosmetic) at 25%. Feat `ft_r01_ring_the_count`.

**Loot:** see §3.12.

### 3.7 Boss 2 — Sister Candlemourn

| Field | Value |
|---|---|
| id | `b_sister_candlemourn` |
| Body | `chibi2:undead/priest`, hat `circlet` (a crown of dripping candles), held censer (`staff` recoloured `#c8b070`), cape `#e8e0c8`; `scale 1.8`; candle flames at her shoulders (`burn` aura, pale) |
| Health | **385,000** |
| Enrage | 7:30 — *Final Vigil*: every candle goes out; Room-wide 2,500 every 8 s |
| Arena | the Candle Nave, 50 × 30 m, an altar at the north end, four great candles (5 m tall) at the corners of a 30 × 16 m rectangle |
| Phases | P1 100–50% *The Service*; P2 50–0% *The Vigil* |

**Phase 1 — The Service**

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Censer Blow** `b_sister_candlemourn_censer` | Tank | melee | — | 450 every 1.8 s (T 17%) + **Singed** stack (8% healing taken reduction, 15 s) | swap at 4 stacks (soft; only healing gets harder) |
| **Dirge of Rest** `b_sister_candlemourn_dirge` | **Interrupt (gold)** | cast 3.0 s | 3.0 s cast | if it completes: 3 random players **Sleep** 8 s (sleep aura); a hit wakes them | interrupt every one; she casts it every 20 s. Assign 2 interrupters in rotation |
| **Grave Chill** `b_sister_candlemourn_chill` | Dispel | magic debuff on 2 players (blue corner on the frame) | instant | 120/s for 12 s, slow 30% | **dispel it**, but dispelling drops a **2 m Void zone** (20 s, 100 / tick) at the player's feet — the player steps away from the group first, then says "ready" |
| **Wax Tears** `b_sister_candlemourn_tears` | Targeted | circle 5 m YELLOW on 2 players, with their name | 2.0 s | 600 to the target, 900 to anyone else inside | spread: the two targets move apart and away from the group |
| **Call the Mourners** `b_sister_candlemourn_mourners` | Adds | 2 `m_undead_mourner` from the side alcoves, walking to her at 2.4 m/s | the alcove glows 3 s | none; each heals her **5%** if it reaches her | kill, slow or root them; ranged damage switches target |

**Phase 2 — The Vigil (50–0%).** She lights the four great candles and the nave goes dark (ambient light 0.15).
Keeps everything from phase 1 (Call the Mourners every 50 s instead of 40 s), and adds:

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Grave Cold** `b_sister_candlemourn_grave_cold` | Room-wide (outside light) | everywhere outside a candle's GREEN circle | — | 60/s, +10% per 5 s outside light (stacks, falls off 1 stack/s inside light) | stay in candle light |
| **Candlelight** `b_sister_candlemourn_candlelight` | Beneficial | GREEN circle 6 m around each lit candle | — | inside: no Grave Cold, +10% healing received | fight near a lit candle; move together to the next one |
| **Hush** `b_sister_candlemourn_hush` | — | she snuffs one lit candle (a WHITE line from her to it for 3 s) | 3.0 s | the candle's GREEN circle shrinks to nothing over 3 s | when you see the WHITE line, move the raid to another lit candle; one candle every 30 s. Any fire spell or a torch (page 05) relights a snuffed candle in 4 s of channel — so the fight never runs out of light if the raid relights |

**Dialog opportunity — `dlg_b_sister_candlemourn_vigil`** (at 20% health, once per pull). She kneels at the
altar: *"No one mourns them any more. Not one of you knows a single name down here. Will you keep the vigil
with me?"*

| Reply | Result |
|---|---|
| 1. *Say nothing.* (default) | the fight goes on |
| 2. *"We will keep it."* | she stops attacking for 10 s and **lights every candle**; the rest of the fight has no Hush. She drops 1 item less (loot master) / −10% per-player chance (personal) |
| 3. *"The dead don't need you."* | she takes +20% damage and casts Dirge of Rest every 12 s for the rest of the fight |
| 4. (only with **Names 3/8** or more read) *"We know three of their names."* | she gives the raid **Mourner's Blessing** (+5% healing, 1 hour, survives death). The name count is also spoken aloud — a hint to the secret |

**Lines**

| id | When | Line |
|---|---|---|
| `bl_b_sister_candlemourn_pull` | pull | "Hush. There is a service on." |
| `bl_b_sister_candlemourn_dirge` | Dirge of Rest starts | "**Sleep now. Sleep.**" |
| `bl_b_sister_candlemourn_mourners` | Call the Mourners | "**My sisters, come and sit.**" |
| `bl_b_sister_candlemourn_p2` | 50% | "Light the vigil. Let the cold come in." |
| `bl_b_sister_candlemourn_hush` | Hush | "**Hush, little light.**" |
| `bl_b_sister_candlemourn_death` | death | "Who will light them now…" |

**Hard mode — `hm_b_sister_candlemourn` "Dark Vigil."** Armed by **snuffing the two small votive candles**
at the nave door before the pull (interact each 1 s).
- Only **three** great candles in phase 2; Hush every 20 s; relighting takes 8 s.
- Grave Chill hits 3 players.
- Drop: `uq_votive_of_the_last_sister` (§3.12) at 20%. Feat `ft_r01_dark_vigil`.

### 3.8 Boss 3 — The Gravewardens, Hask and Hollin

| Field | Value |
|---|---|
| id | `b_gravewardens` (encounter), `b_gravewarden_hask`, `b_gravewarden_hollin` |
| Bodies | Hask: `chibi2:undead/warrior`, `great_helm`, tower shield (`fh_tower_shield`) and mace, `scale 1.9`, cape `#3e5a3a`. Hollin: `chibi2:undead/knight`, `rune_helm`, lance (`fh_halberd`), `scale 1.9`, cape `#5a3a3a` |
| Health | **215,000 each** (430,000 total) |
| Enrage | 8:00 — *Last Watch*: both bosses cast Oath of the Vault on the raid, Room-wide 2,800 every 10 s |
| Arena | the Twin Vaults: 60 × 30 m, a row of 6 pillars down the middle (line of sight), a vault door at each end |
| Rule | **Kill them together.** When one dies the other gets **Grief** (+50% damage) and, if still alive **15 s** later, **raises its brother at 30% health**. Balance damage; kill both within 15 s |

| Ability | Boss | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|---|
| **Oathbound** `b_gravewardens_oathbound` | both | Tether (bosses) | WHITE line between the two bosses while they are within **10 m** | — | while tethered both take **90% less damage** and heal 1%/s | the two tanks hold them at least 10 m apart (mark two spots with `wm_sun` and `wm_moon`) |
| **Shieldwall** `b_gravewarden_hask_shieldwall` | Hask | Positioning | a 120° frontal arc | — | Hask takes 75% less damage from the front | damage players hit him from behind |
| **Iron Oath** `b_gravewarden_hask_iron_oath` | Hask | **Soak** | ORANGE circle 4 m, **3 pips**, on a spot 8 m from Hask | 3.0 s | 3,000 split among soakers (1,000 each with 3); fewer than 3 inside = Room-wide 1,200 to all | three players (not the tanks) stand in it; assign by group |
| **Vault Bash** `b_gravewarden_hask_bash` | Hask | Tank swap | melee | — | 600 + **Dented** (−10% armour, 30 s, stacks) | swap Hask's tank with Hollin's tank at 4 stacks (the tanks trade bosses; walk them past each other at more than 10 m) |
| **Grave Lance** `b_gravewarden_hollin_lance` | Hollin | Danger zone | line 30 m × 3 m, RED, aimed at the **farthest** player | 2.0 s | 1,300 (87%) + bleed 80/s 6 s | the farthest player steps sideways; do not stand in a line behind them |
| **Chains of the Vault** `b_gravewarden_hollin_chains` | Hollin | Tether (players) | WHITE line between 2 random non-tank players | 8 s to break | if not broken: both **stunned** 4 s and 800 | the two move **15 m apart**; the pillars do not block a tether |
| **Lance Charge** `b_gravewarden_hollin_charge` | Hollin | Danger zone | line from Hollin to his tank's position +10 m, 4 m wide, RED | 2.0 s | 900 + knockback | only the tank should be in the line; the tank sidesteps and takes it on a cooldown |

**At 50% (each):** that brother **takes up the other's weapon** for 20 s (banner: "Hask takes up the lance!"):
Hask casts Grave Lance and Hollin casts Iron Oath once each. Then they return to their own.

**Lines**

| id | When | Line |
|---|---|---|
| `bl_b_gravewardens_pull` | pull | Hask: "Who goes there?" Hollin: "No one. No one goes there." |
| `bl_b_gravewarden_hask_soak` | Iron Oath | Hask: "**Three to hold the gate!**" |
| `bl_b_gravewarden_hollin_chains` | Chains | Hollin: "**Stay together. Forever.**" |
| `bl_b_gravewardens_close` | the two come within 12 m | "**Brother — to me!**" (a warning: the tether is about to form) |
| `bl_b_gravewardens_grief` | one dies | the other: "Get up. Get UP." |
| `bl_b_gravewardens_death` | both dead | (both, together) "The watch… is over." |

**Hard mode — `hm_b_gravewardens` "Stand Together."** Armed by placing the two fallen vault banners (in the
East and West Vaults) back on their stands in the Twin Vaults before the pull (carry each, 1 s interact; a
carried banner slows you 20%).
- Oathbound range becomes **15 m**; the arena pillars move 5 m closer to the middle.
- The brothers must die within **8 s** of each other.
- Chains of the Vault links 3 players (a triangle; all three must be 15 m from both others).
- Drop: `it_gravewarden_pair_banners` (house decoration or a back-cosmetic) at 25%. Feat `ft_r01_stand_together`.

### 3.9 Boss 4 — The Rotmaw

| Field | Value |
|---|---|
| id | `b_rotmaw` |
| Body | `creature:worm ×4.2`, body `#6a5a3a`, belly `#a89a60`, accent `#2a2418`, eyes `#c8e040`; `maw` and `plates` on; poison aura on its back |
| Health | **470,000** |
| Enrage | 8:30 — *Everything Rots*: the whole pit floor becomes a Void zone, 300 / tick |
| Arena | the Rot Pit, a round pit 44 m across, 4 ramps down; the floor is soft earth where it burrows |
| Phases | P1 100–30% *Feeding*; P2 30–0% *Starving* |

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Rot Spew** `b_rotmaw_spew` | Tank swap | cone 60°, 20 m, from its maw at the tank | 1.5 s (cone shows, tank only) | 700 + **Rot** stack (poison 50/s per stack, 30 s) | swap at 4 Rot stacks; everyone else stays out of the cone |
| **Burrow** `b_rotmaw_burrow` | Danger zone | circle 6 m, RED, under one random player, following them for 1.5 s then fixed | 2.5 s | 1,600 (107%) + thrown up 3 m | the target runs out after it stops following; others stay clear. Every 50 s. While burrowed (6 s) it is untargetable |
| **Rot Tide** `b_rotmaw_tide` | Moving wave | a band 4 m wide, full pit width, rolling across at 5 m/s from a random side; **two 5 m BLUE gaps** | 2.0 s (the band rises on the pit wall) | 1,100 + 3 Rot stacks | run to a BLUE gap and let the wave pass through you |
| **Swallow** `b_rotmaw_swallow` | Rescue | a non-tank player within 10 m of the maw is grabbed | 2.0 s (maw glows green, the target's frame shows a YELLOW dot) | 300/s while inside | the raid deals **25,000** to the glowing **Gullet** (a weak spot on its neck, a separate target frame) within 10 s to free them; else the player dies. The target can move 10 m away during the warning |
| **Rot Grubs** `b_rotmaw_grubs` | Adds, Kite | 6 `m_aberration_grave_grub` crawl from the walls, each **fixates** one player at 3.0 m/s | walls bulge 3 s | 250 per bite + slow | kite them away from the group and kill them away from the group (each leaves a 3 m Void zone on death) |

**Phase 2 — Starving (30–0%):** Rot Tide every 20 s (was 40 s), Burrow targets **2** players, Swallow every
30 s, grubs stop. The pit floor starts rotting from the walls inward (a Void zone ring growing 0.5 m every 10 s).

**Lines** (it has no words; it makes sounds, and the **Narrator** speaks — reuse: Emberveil `js/talk.js`
`narrate`):

| id | When | Line |
|---|---|---|
| `bl_b_rotmaw_pull` | pull | *Narrator:* "The pit floor heaves." |
| `bl_b_rotmaw_burrow` | Burrow | *Narrator:* "**The ground goes soft under {target}.**" |
| `bl_b_rotmaw_tide` | Rot Tide | *Narrator:* "**A wave of rot climbs the {side} wall.**" |
| `bl_b_rotmaw_swallow` | Swallow | *Narrator:* "**It opens wide.**" |
| `bl_b_rotmaw_death` | death | *Narrator:* "It sinks, and does not come up." |

**Hard mode — `hm_b_rotmaw` "Feed It."** Armed by throwing the **Sexton's Bell** (found on the Hollow Sexton
patrol's body, `it_sextons_bell`) into the pit before the pull.
- Swallow grabs **2** players at once (two Gullets, 25,000 each).
- Rot Tide has **one** gap.
- Drop: `it_mount_rotmaw_hatchling` (a small worm mount, `creature:worm ×1.2`) at 3% per player. Feat
  `ft_r01_feed_it`.

### 3.10 Boss 5 — The Barrowking, Hrodric Ninefold

| Field | Value |
|---|---|
| id | `b_barrowking_hrodric` |
| Body | `chibi2:undead/knight`, hat `crown` (iron, `#8a8070`, gold rim), held `fh_greatsword` `#9ab0c8`, cape `#3a2a4a`, `rune_halo` decor in pale gold; `scale 2.2` |
| Health | **685,000** |
| Enrage | 10:00 — *The Last Muster*: every heir-tomb opens; Room-wide 3,500 every 8 s |
| Arena | Throne of Nine, 56 × 40 m; the throne on a dais at the north end; 8 named heir-tombs along the sides (4 each side) and a ninth, unnamed, behind the throne |
| Phases | P1 100–70% *Court of Bones*; P2 70–40% *The Ninefold Muster*; P3 40–0% *The Weight of the Crown* |

**Phase 1 — Court of Bones (100–70%)**

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Kingsblade** `b_barrowking_hrodric_kingsblade` | Tank swap | melee | — | 650 every 2 s (T 25%) + **Kingsmark** (+12% damage taken, 25 s) | swap at 3 stacks |
| **Ninefold Cleave** `b_barrowking_hrodric_cleave` | Danger zone | cone 120°, 10 m, RED | 2.0 s | 1,500 (100%) | behind him |
| **Grave Decree** `b_barrowking_hrodric_decree` | Targeted | circle 6 m YELLOW on 3 players | 2.0 s | 800 to target, 800 more for each other decree circle overlapping | spread; world markers `wm_star`, `wm_flame`, `wm_leaf` are the usual spread spots |
| **Barrow Frost** `b_barrowking_hrodric_frost` | Void zone | circle 5 m PURPLE-black on the spot of one Grave Decree target, 30 s | when the decree lands | 120 / tick | decree targets spread to the edges so the frost does not take the middle |

**Phase 2 — The Ninefold Muster (70–40%).** He returns to the throne and becomes **untargetable**. His eight
named heirs rise from their tombs in **three waves** (3, 3, 2) as `m_undead_barrow_heir` adds (below). Each heir
that dies **removes 3.75%** of the king's health (8 heirs = 30%, which is exactly the phase). If all eight die
within 3:00 he comes down early. At 3:00 any heir still standing is absorbed and he comes down with its share
of health intact.

| Add | Body | Health | Abilities |
|---|---|---|---|
| `m_undead_barrow_heir` Barrow Heir (×8, each has a name on its plate: Aldwin, Berthe, Coll, Dunmar, Eska, Faro, Gildas, Hune) | `chibi2:undead/<varies>` — 4 knights, 2 rangers, 2 priests, `plate_helm` / `circlet`, `scale 1.4` | 30,000 | knights: **Heir's Oath** — while within 8 m of another heir, both are immune to taunt (pull them apart); rangers: **Crown Shot** — Targeted 4 m, 2.0 s, 700; priests: **Blessing of the Line** (gold, 2.5 s) — heals every heir 10%, interrupt |

During P2 the king still casts **Grave Decree** from the throne every 25 s.

**Phase 3 — The Weight of the Crown (40–0%).** He takes the crown off and holds it up; it becomes the fight.

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| Kingsblade, Ninefold Cleave | as P1 | | | +10% | |
| **Weight of the Crown** `b_barrowking_hrodric_weight` | Room-wide, soft enrage | whole arena, pulse every 8 s | — | 200 per pulse, **+10% per pulse** (stacking **Weight**) | the Crown soak (next row) clears Weight for the soakers |
| **Take Up the Crown** `b_barrowking_hrodric_crown` | **Soak** | ORANGE circle 5 m, **5 pips**, where the crown falls (a random spot ≥ 12 m from him) | 3.0 s | 4,000 split (800 each with 5); fewer than 5 = Room-wide 1,500 and he gains 10% damage | 5 players soak (rotate halves of the raid: group 1, then group 2); soakers **lose all Weight stacks**. Every 30 s |
| **Heirs' Banners** `b_barrowking_hrodric_banners` | Void zone | circle 4 m PURPLE-black under each of the 8 heir-tombs of heirs killed in P2, fading in one by one every 20 s | 2.0 s each | 150 / tick | the free floor shrinks slowly; move the fight to the middle |
| **Last Command** `b_barrowking_hrodric_last_command` | Room-wide | at 10% | cast 4.0 s, grey | every Void zone pulses once for 600 | heal up; stand clear of banners |

**Dialog opportunity — `dlg_b_barrowking_hrodric_crown`** (at 40%, the P2→P3 turn). He stands, holding the
crown: *"Nine coronations I have heard over my head. Who comes into my barrow wearing the colours of the
living? Name yourselves — or name my heirs."*

| Reply | Result |
|---|---|
| 1. *Say nothing.* (default) | P3 as written |
| 2. *"We come for the Crown of Highcourt."* | he laughs; P3 Weight pulses start at 300 instead of 200 and **+1 item** drops (loot master) / +10% per player (personal). Arms nothing else |
| 3. *"Your heirs are dust."* | he skips the first Take Up the Crown (the first soak happens at 30 s + 30 s) but gains Haste (+15% attack speed) for the phase |
| 4. (only with **Names 8/8**) *"Aldwin, Berthe, Coll, Dunmar, Eska, Faro, Gildas, Hune. — And the ninth?"* | he stops for 6 s longer: *"No one says her name. I made sure no one could."* The fight continues as reply 1. **This is the first half of the secret unlock (§3.11).** |

**Lines**

| id | When | Line |
|---|---|---|
| `bl_b_barrowking_hrodric_pull` | pull | "Kneel, or be counted with the rest." |
| `bl_b_barrowking_hrodric_decree` | Grave Decree | "**By my decree — apart!**" (the word "apart" is the hint to spread) |
| `bl_b_barrowking_hrodric_p2` | 70% | "Up, my heirs. Up, all eight." |
| `bl_b_barrowking_hrodric_heir_dies` | an heir dies | "{heir}… again." |
| `bl_b_barrowking_hrodric_crown` | Take Up the Crown | "**Who will carry it? WHO?**" |
| `bl_b_barrowking_hrodric_last` | 10% | "**Then all of it falls with me.**" |
| `bl_b_barrowking_hrodric_death` | death | "The tenth coronation… I will not hear it." |

**Hard mode — `hm_b_barrowking_hrodric` "The Herald's Horn."** Armed by **not killing** the Barrow Herald on the
Barrow Road (he stands aside and follows the raid into the hall). He joins at 70%:
- The Muster is **three waves of 4** (12 heirs; the 4 extras are unnamed Barrow Knights, and each heir's share
  of the phase becomes 2.5%).
- The Herald keeps blowing **Muster Horn** (gold, 3.0 s) — an uninterrupted horn brings 2 more knights.
- P3 Take Up the Crown needs **6 pips**.
- Drop: `it_mount_barrow_charger` (an undead horse: `creature:courser`, bone barding, pale-gold eyes) at 4% per
  player. Feat `ft_r01_heralds_horn`.

### 3.11 Secret boss — The Ninth Heir

**Unlock (all in one lockout):**
1. Read **all eight** named name-stones (§3.4) — raid header shows *Names 8/8*.
2. At the Barrowking's dialog pick reply 4 ("— And the ninth?").
3. Kill the Barrowking.
4. Read the **blank ninth stone** at the unnamed tomb behind the throne. The raid leader is asked to **name
   her** (free text, 1–20 letters, filtered). Any name works; the name is kept for the lockout and she uses it
   for herself in every line ("I was {name}."). The tomb opens.

| Field | Value |
|---|---|
| id | `b_ninth_heir` |
| Body | `creature:wraith ×3.6`, body `#e8dcb0`, belly `#fff4d0`, accent `#6a5a30`, eyes `#fff8e0`; `tatters 12`; a broken crown floats over the hood (`crown`, gold); holy-shadow flicker (`curse` aura at her feet, `holy_mote` sprites in her tatters) |
| Health | **770,000** |
| Enrage | 9:00 — *Unwritten*: Room-wide 4,000 every 6 s |
| Arena | The Unnamed Tomb, 36 m square; the floor is a **6 × 6 grid of name-slabs** (6 m each) |
| Phases | P1 100–60% *Struck Off*; P2 60–25% *The Blank Stone*; P3 25–0% *Remembered* |

| Ability | Phase | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|---|
| **Chisel** `b_ninth_heir_chisel` | all | Tank swap | melee | — | 600 + **Chiselled** (−5% max health, 30 s, stacks) | swap at 3 |
| **Struck from the List** `b_ninth_heir_struck` | all | Checkerboard (Danger zone) | half the name-slabs in a checkerboard light RED | 2.0 s | 1,500 (100%) | stand on an unlit slab; the pattern flips every 12 s (the RED slabs become safe and the safe ones RED on the next cast) |
| **Unnamed** `b_ninth_heir_unnamed` | all | "Cannot be healed" | 2 players lose their name on the raid frames and **cannot be healed** for 6 s; a GREEN ring 3 m appears around each | 1.5 s | 150/s for 6 s | another player **stands in the GREEN ring** — while someone is inside, the Unnamed player can be healed and takes no damage (assign "name-keepers") |
| **Grief of Eight** `b_ninth_heir_grief` | P2 | Adds | 8 small `m_undead_heir_shade` (wisp ×1, 6,000 health) drift toward her from the corners; each that reaches her gives her +5% damage (stacks) | 3 s | — | kill them with area damage; they are slow (2 m/s) |
| **The Blank Stone** `b_ninth_heir_blank_stone` | P2 | **Soak** | ORANGE 5 m, **4 pips**, on a slab that is not RED | 3.0 s | 3,600 split | 4 soak; soakers become **Remembered** for 20 s (immune to Unnamed) — pick soakers who are about to be Unnamed |
| **Erasure** `b_ninth_heir_erasure` | P2, P3 | Moving wave | a wall of pale light 36 m wide sweeping from one side of the tomb to the other at 4 m/s, with one BLUE 6 m gap that **moves** 1 m/s along it | 2.0 s | 1,400 + Unnamed 4 s | follow the gap |
| **Remembered** `b_ninth_heir_remembered` | P3 | Beneficial / Room-wide | Room-wide 400 every 4 s; every GREEN ring left by Unnamed stays 30 s as a Beneficial zone that halves it | — | 400 / 4 s | stack in the old GREEN rings; the healer team keeps the raid in them while dodging Struck from the List |

**Lines** (voice: a young woman, echoing; `{name}` is the name the raid gave her)

| id | When | Line |
|---|---|---|
| `bl_b_ninth_heir_pull` | pull | "Somebody said my name. …Somebody said *a* name." |
| `bl_b_ninth_heir_struck` | Struck from the List | "**Off the list. Off. Off.**" |
| `bl_b_ninth_heir_unnamed` | Unnamed | "**Now you know what it is like.**" |
| `bl_b_ninth_heir_p3` | 25% | "I was {name}. Say it again." |
| `bl_b_ninth_heir_death` | death | "{name}. …That is a good name. I will keep it." |

**Hard mode — `hm_b_ninth_heir` "Nameless."** Armed by **leaving the name blank** at step 4 (the dialog allows
"Leave it blank"). She calls herself "No One".
- Unnamed hits 3 players; Remembered rings last 15 s.
- Struck from the List flips every 9 s.
- Drop: title *"Who Said Her Name"* is replaced by *"No One's Mourner"*; `it_crown_of_no_one` (a head cosmetic,
  the broken crown) at 30%. Feat `ft_r01_nameless`.

**Loot:** guaranteed `leg_crown_of_the_ninth` to one player; `it_mount_heirs_palfrey` (a pale-gold spectral
pony, `creature:pony`, glow) 2% per player; title *"Who Said Her Name"* (first kill per character).

### 3.12 r01 loot

**Raid set — `set_ninefold_oath` "The Ninefold Oath"** (for page 09's index). Six pieces, each made in the
wearer's armour weight (cloth, light, medium, heavy) when the token is handed in. The bonus you get follows
your **current role** (page 00 §6) — switching role switches the bonus.

| Piece | id (per weight: `…_cloth`, `…_light`, `…_medium`, `…_heavy`) | Token | Token drops from |
|---|---|---|---|
| Head | `it_ninefold_crownhelm` | `it_token_r01_head` | the Barrowking |
| Chest | `it_ninefold_hauberk` | `it_token_r01_chest` | the Gravewardens, the Barrowking |
| Legs | `it_ninefold_greaves` | `it_token_r01_legs` | Sister Candlemourn, the Rotmaw |
| Hands | `it_ninefold_grips` | `it_token_r01_hands` | the Ossuary Warden, the Gravewardens |
| Feet | `it_ninefold_sabatons` | `it_token_r01_feet` | the Ossuary Warden, the Rotmaw |
| Necklace | `it_ninefold_torc` | `it_token_r01_neck` | Sister Candlemourn |

| Role | 2 pieces | 4 pieces | 6 pieces |
|---|---|---|---|
| Tank | when a boss puts a stacking debuff on you (a Tank-swap stack), gain a shield of **6%** of your max health | your taunt makes the taunted enemy deal **15% less** damage to you for 6 s | **Oathkeeper:** once per 90 s a hit that would kill you leaves you at 1 health and immune to damage for 2 s |
| Healer | your heals on allies standing in a Void zone heal **+15%** | removing a harmful effect (dispel) also heals the target for **8%** of their max health | every 30 s your next single-target heal also heals the 4 most injured allies within 20 m for **40%** of its amount |
| Damage | **+6%** damage to non-boss enemies | an interrupt gives you **+10%** damage for 8 s | **Ninth Oath:** every 9th hit deals **+90%** of its damage again as true damage |
| Support | buffs you give allies last **20%** longer | when you stand in a Soak with other players, every soaker gets **+10%** damage for 10 s | once per 60 s, spending your class mechanic (page 06) gives the raid **+5%** damage for 9 s |

**Raid legendaries** (`leg_`, power in numbers; page 09 indexes them):

| id | Name | Slot | Source | Power |
|---|---|---|---|---|
| `leg_crown_of_the_ninth` | Crown of the Ninth | head (any weight) | the Ninth Heir (guaranteed, one player) | **Struck from the List:** once per 60 s, the first ally within 30 m who would die is instead healed for 30% of their max health, dropped from every enemy's threat list and made immune to damage for 3 s |
| `leg_kingsblade_of_hrodric` | Kingsblade of Hrodric | two-handed sword | the Barrowking (4%) | every **9th** hit cleaves 120°, 8 m for **300%** weapon damage and raises an heir-shade that fights beside you for 9 s at 30% of your weapon damage |
| `leg_marrow_reliquary` | The Marrow Reliquary | off-hand focus (Reliquary; reuse Farhold R25 `js/foci.js`) | the Ossuary Warden (3%) | an enemy that dies while carrying one of your damage-over-time effects leaves a 3 m pool that deals **20%** of your spell power to enemies every 0.5 s for 6 s |

**Raid uniques** (`uq_`):

| id | Name | Slot | Source | Power |
|---|---|---|---|---|
| `uq_votive_of_the_last_sister` | Votive of the Last Sister | necklace | Candlemourn hard mode (20%) | standing still for 2 s lights a 6 m circle around you: allies inside receive **+10%** healing |
| `uq_sextons_lantern` | The Sexton's Lantern | light | quartermaster (15 Oathstones) or any r01 trash (1%) | light radius **+40%**; undead inside your light take **+8%** damage |
| `uq_gravewarden_oathband` | Gravewarden Oathband | ring | the Gravewardens (8%) | if another player wearing an Oathband is within 10 m, you both take **8%** less damage |
| `uq_gullet_of_the_rotmaw` | Gullet of the Rotmaw | ring | the Rotmaw (8%) | your poison effects stack **1** more time; poisoned enemies deal 3% less damage per stack |
| `uq_ossuary_bonewraps` | Ossuary Bonewraps | hands | the Ossuary Warden (8%) | melee hits have a 10% chance to apply **Crushed** (+5% damage taken from you, up to 3 stacks, 10 s) |

**Drop table** (personal loot: each player rolls 25% for an item; if they win, the item is picked from the boss's
list below, weighted to their role; tokens and Epic base items make up the rest):

| Boss | Tokens | Epic items (`it_`) | Uniques / legendaries | Hard mode / other |
|---|---|---|---|---|
| Ossuary Warden | hands, feet | `it_ossuary_greathammer` (2H mace), `it_marrowguard_legplates` (heavy legs), `it_bonecount_ring` (ring), `it_ossuary_wand` (wand) | `uq_ossuary_bonewraps`, `leg_marrow_reliquary` | `it_bone_bell_tabard` |
| Sister Candlemourn | legs, neck | `it_candlemourn_censer` (mace, healer), `it_waxtear_robe` (cloth chest), `it_mourners_veil` (light head), `it_vigil_orb` (off-hand orb) | — | `uq_votive_of_the_last_sister` |
| The Gravewardens | chest, hands | `it_haskwall` (tower shield), `it_hollins_lance` (polearm), `it_vault_warden_helm` (heavy head), `it_twin_vault_bow` (bow) | `uq_gravewarden_oathband` | `it_gravewarden_pair_banners` |
| The Rotmaw | legs, feet | `it_rotgut_daggers` (dagger), `it_pitcrawler_boots` (light feet), `it_gullet_staff` (staff, poison), `it_rotmaw_scale_jerkin` (medium chest) | `uq_gullet_of_the_rotmaw` | `it_mount_rotmaw_hatchling` |
| The Barrowking | head, chest | `it_barrow_throne_greataxe` (2H axe), `it_kingsguard_mantle` (heavy chest), `it_crown_of_iron_teeth` (medium head), `it_decree_scepter` (wand) | `leg_kingsblade_of_hrodric` | `it_mount_barrow_charger` |
| The Ninth Heir | any token (1 guaranteed extra) | `it_unnamed_shroud` (cloth chest), `it_blank_stone_signet` (ring) | `leg_crown_of_the_ninth` (guaranteed) | `it_mount_heirs_palfrey`, `it_crown_of_no_one` |

(**No belts:** Farhold has **no belt slot** — `js/rpg.js` `SLOTS` is weapon, offhand,
head, chest, legs, hands, feet, ring ×2, necklace, mount, light, tool. Page 08 decides whether Wildmarch adds
belts; until then every raid item uses Farhold's slots.)

**Feats of r01:** `ft_r01_ring_the_count`, `ft_r01_dark_vigil`, `ft_r01_stand_together`, `ft_r01_feed_it`,
`ft_r01_heralds_horn`, `ft_r01_nameless` (hard modes); `ft_r01_who_said_her_name` (secret boss);
`ft_r01_deathless_<boss>` ×6 (no deaths); `ft_r01_speed` (all five in 45 minutes from the first pull);
`ft_r01_all_names` (read every name-stone in one lockout); **playful:** `ft_r01_kept_vigil` (reply 2 to
Candlemourn and still kill her with every candle lit). All hard modes → title *"of the Ninefold"*.

---

## 4. r02 — The Glacier Throne

### 4.1 At a glance

| Field | Value |
|---|---|
| id | `r02_glacier_throne` |
| Level | 42 (item level 46, hard mode 50) · 10 players (flex 8–10) · Normal only |
| Entrance | Frostmantle, above Rimehold: the Glacier Gate at the head of the Rimeglass Pass |
| Bosses | 6 + 1 secret: Rimefang Matriarch → Borga the Hailwright → the Whiteout → Skathra the Wind-Mother → the Council of Cold → Queen Ysmere → *(secret)* Vorm, the Sleeper Under the Glacier |
| Checkpoints | warm braziers (orange flame) |
| Raid set | **`set_rimebound_court`** — *The Rimebound Court* |
| New layers over r01 | a **raid-wide Cold gauge** to manage; **line of sight** (hide behind ice); **arena edges** that kill (knockback); **kill order** (council); **carrying an object** through the whole raid (the Hearthcoal); **body-blocking** a beam |

**The Cold gauge (raid-wide mechanic, new).** Inside the Glacier Throne every player has **Cold** 0–100, shown
as a blue sliver under their raid frame and a frost rim on their own screen edge.

| Source | Cold |
|---|---|
| standing anywhere not warm | +2 per second |
| boss abilities marked *+Cold* | as listed |
| standing in a **Warmth** zone (GREEN, braziers and some abilities) | −10 per second |
| Hearthcoal carrier (§4.9) aura, 6 m | −4 per second |
| fire spells you cast | −1 per cast |
| at **100** | **Frozen**: stunned 5 s (freeze aura) and 20% max health damage, then Cold resets to 40 |

Cold does not rise during the 60 s after a boss dies, or out of combat within 20 m of a checkpoint.

### 4.2 Lore

The Frost Wardens of Rimehold keep a watch on the glacier because of what their grandmothers saw: a woman
walking up the ice in a crown, and the Stonehide giants (page 10 warbands) walking behind her. **Queen Ysmere**
was a giant-queen of the old peaks who made the glacier her throne room and has held it for three hundred years.
The Wardens think she is holding the peaks. She is holding something **under** them — the **Sleeper**, an old
titan of the mountain whose waking would be the end of winter, and of Rimehold with it, as the ice melts in one
season and the valley floods.

### 4.3 Attunement — `q_attune_glacier_throne` "Word from Rimehold"

| Step | Objective | Where |
|---|---|---|
| 1 | Carry Sexton Alder's letter to `npc_warden_captain_ingrid` | Rimehold (needs `r01` final boss killed once) |
| 2 | Clear `d10_rimefang_caverns` (Normal+) and take the **Rimefang Key** from its final boss | Frostmantle |
| 3 | Kill the **Stonehide Peak-King** warlord (reuse: Farhold `data/warbands.json` `stonehide_peakking`) and take his **Frost Seal** | any Stonehide war camp, Frostmantle |
| 4 | **The Hearthcoal:** light a coal at Rimehold's great hearth and carry it up the Rimeglass Pass (a 6-minute walk, 3 camps of Stonehide on the way). The coal is an item in your off hand that dims over 90 s and is relit at any brazier; if it goes out, walk back to the last lit brazier | Frostmantle |
| 5 | Set the Hearthcoal in the Glacier Gate's brazier | the gate opens |
| Reward | 12 Oathstones; `it_hearthcoal` (a permanent quest item: you can carry it into the raid, §4.9) | |

### 4.4 Layout

```
                     RIMEHOLD ─── Rimeglass Pass (attunement walk)
                                        │
                              ┌─────────▼─────────┐
                              │ GLACIER GATE (cp0) │ vendor, brazier
                              └─────────┬─────────┘
                ┌───────────────────────▼───────────────────────┐
                │ THE WOLF RUN — long ice gully, 120 m, braziers │ wolves, bears
                │   ...[B1] Rimefang Matriarch at the far den     │
                └───────────────────────┬───────────────────────┘
                                        │ cp1
           ┌────────────────────────────▼────────────────────────────┐
           │ THE HAILFORGE (B2) — giant smithy cut in the glacier     │
           │   [anvil]      [anvil]   [Borga]   [anvil]   quench pool  │
           └────────────────────────────┬────────────────────────────┘
                                        │ cp2 (repair)
           ┌────────────────────────────▼────────────────────────────┐
           │ THE WHITE CROSSING (B3) — a crevasse field in a blizzard  │
           │   4 beacon posts; ice bridges; drifts                     │
           └────────────────────────────┬────────────────────────────┘
                                        │ cp3 — climb (wind ropes)
           ┌────────────────────────────▼────────────────────────────┐
           │ THE EYRIE (B4) — open peak top, 46 m, edges on N and E   │
           │   wind-breaks (4 standing stones) · nest ledge up high   │
           └────────────────────────────┬────────────────────────────┘
                                        │ cp4 (repair)
           ┌────────────────────────────▼────────────────────────────┐
           │ HALL OF THE COUNCIL (B5) — three daises in a triangle     │
           └────────────────────────────┬────────────────────────────┘
           ┌────────────────────────────▼────────────────────────────┐
           │ THE GLACIER THRONE (B6) — 60 m round hall of clear ice    │
           │   throne on the north wall; the floor is a lake frozen    │
           │   over; something enormous is visible through it           │
           └────────────────────────────┬────────────────────────────┘
                                        ▼ (secret: the floor gives way)
                              ┌───────────────────┐
                              │ THE DEEP ICE       │ secret arena, 50 m, flooding
                              └───────────────────┘
```

### 4.5 Trash

| id | Name | Body | Where | Health | Abilities |
|---|---|---|---|---|---|
| `m_beast_rimefang_wolf` | Rimefang Wolf | `creature:dire_wolf ×1.4`, white/grey, eyes `#9ad8ff` | Wolf Run (packs of 4); Matriarch adds | 38,000 | **Hamstring** — slow 40% 6 s; **Pack Rush** — when one is below 30% the others gain +30% speed; afraid of fire: **+50% damage taken** inside Warmth zones |
| `m_beast_glacier_bear` | Glacier Bear | `creature:bear ×2.2`, `#e8eef2` | Wolf Run (Elite) | 140,000 | **Maul** — tank 1,100 + bleed; **Rear and Crash** — 8 m circle Danger zone, 2.0 s, 1,500 +Cold 15 |
| `m_giant_stonehide_icebreaker` | Stonehide Icebreaker | `chibi2:giant/warrior`, `great_helm`, maul (reuse: `stonehide_smasher` look) | Hailforge approach, Council Hall | 120,000 | **Break Ice** — 12 m line Danger zone, 2.0 s, 1,400 (knocks prone); **Stubborn** — immune to knockback |
| `m_giant_stonehide_hurler` | Stonehide Hurler | `chibi2:giant/ranger` (reuse: `stonehide_hurler`) | Hailforge, Eyrie climb | 70,000 | **Boulder** — Targeted 5 m YELLOW, 2.0 s, 1,100; line of sight breaks its aim |
| `m_giant_stonehide_frostsayer` | Stonehide Frostsayer | `chibi2:giant/shaman` (reuse: `stonehide_frostsayer`) | Council Hall approach | 80,000 | **Rime Mend** (gold, 2.5 s) — heals an ally 20%; **Cold Snap** — +Cold 25 to all within 15 m |
| `m_giant_stonehide_stalker` | Stonehide Stalker | `chibi2:giant/rogue` (reuse: `stonehide_stalker`) | Wolf Run (stealthed, 2 patrols) | 60,000 | **Ambush** — from stealth on a healer, 1,500; **Vanish** at 40% (reappears on a random caster in 4 s) |
| `m_fiend_hail_imp` | Hail Imp | `creature:imp ×1.1`, ice colours `#9ad8ff`/`#e8f8ff` | Hailforge (swarms of 6); Borga's adds | 9,000 | **Hailstone** — 300 +Cold 5; on death drops a **Cold Core** (§4.7) |
| `m_elemental_rime_shard` | Rime Shard | `creature:shard ×1.6`, `#a8d8ff` | Hailforge, White Crossing | 50,000 | **Refract** — reflects 20% of spell damage back at the caster; **Splinter** at death — 6 shards Targeted 3 m, 250 each |
| `m_elemental_snow_wisp` | Snow Wisp | `creature:wisp ×1.2`, white | White Crossing (in the blizzard) | 12,000 | invisible beyond 15 m; **Chill Touch** — +Cold 10 |
| `m_aberration_crevasse_crawler` | Crevasse Crawler | `creature:centipede ×2.2`, pale blue | White Crossing (from crevasses) | 65,000 | **Coil Pull** — Tether WHITE to a player; pulls them toward a crevasse 2 m/s for 4 s; break by getting 12 m from the crawler or killing it |
| `m_beast_frost_owl` | Frost Owl | `creature:owl ×1.8`, white | Eyrie climb | 22,000 | **Stoop** — 10 m line, 700; flies (ranged only) |
| `m_beast_eyrie_fledgling` | Eyrie Fledgling | `creature:griffin ×1.2`, white-blue | Eyrie ledges; Skathra's adds | 30,000 | **Wing Buffet** — knockback 5 m (watch the edge) |
| `m_construct_ice_sentinel` | Ice Sentinel | `creature:golem ×2.0`, clear ice `#c8e8ff`, eyes `#40a0ff` | Council Hall doors (Elite pair) | 160,000 | **Frost Pulse** — 10 m Room-wide-around-it, +Cold 20 every 10 s; **Glacial Shell** — 50% less damage until someone deals 20,000 fire damage to it |
| `m_undead_frozen_soldier` | Frozen Soldier | `chibi2:undead/fighter`, frost-rimed | the Throne approach (rise from the ice) | 25,000 | **Shatter** on death — 4 m ice shards Danger zone, 1.8 s, 600 |
| `m_humanoid_throne_guard` | Throne Guard | `chibi2:giant/knight`, `plate_helm` ice-blue, halberd | the Throne approach (Elite, 4) | 150,000 | **Guard Rank** — the four share damage (split 25% each) while within 10 m; **Pike Sweep** — 180° 8 m, 1,300 |

### 4.6 Boss 1 — Rimefang Matriarch

| Field | Value |
|---|---|
| id | `b_rimefang_matriarch` · body `creature:dire_wolf ×3.6`, body `#e8eef2`, belly `#c8d0d8`, accent `#6a7888`, eyes `#40c0ff`; frost breath (`ice` element) |
| Health | **595,000** (her four wolves: 38,000 each, separate) · Enrage 7:00 — *The Whole Pack*: 8 wolves every 10 s |
| Arena | the Den, 40 m, three braziers (Warmth, GREEN 6 m) in a triangle |

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Rending Maul** `b_rimefang_matriarch_maul` | Tank swap | melee | — | 900 (T 24%) + **Rent** bleed stack 90/s | swap at 3 |
| **Frost Breath** `b_rimefang_matriarch_breath` | Danger zone | cone 70°, 16 m, RED | 2.0 s | 1,600 (73%) +Cold 30 | behind her; the tank turns her away |
| **Pack Howl** `b_rimefang_matriarch_howl` | Adds, Kite | 2 `m_beast_rimefang_wolf` from the den mouth, each fixates a random player | 3 s (howl) | wolves as trash | kite your wolf **into a brazier's Warmth**: wolves inside take +50% damage |
| **Leap** `b_rimefang_matriarch_leap` | Targeted | circle 6 m YELLOW on the farthest player | 2.0 s | 1,300 to all inside + slow | the target moves away from others; she stays where she lands for 3 s (turn her back) |
| **Hunger of the Pack** `b_rimefang_matriarch_hunger` | Soft enrage | each wolf alive gives her +8% damage | — | — | kill wolves quickly |

At **35%** she howls every 25 s instead of 45 s.

Lines (Narrator, she does not speak): pull *"The den is full of eyes."*; howl *"**She throws back her head.**"*;
leap *"**She crouches, watching {target}.**"*

**Hard mode — `hm_b_rimefang_matriarch` "Cold Den."** Armed by putting out the three den braziers before the pull
(interact 2 s each; you will be cold). No Warmth zones; wolves have no fire weakness; instead wolves killed within
4 m of each other **both** drop a 6 m Warmth zone for 15 s. Drop `it_mount_rimefang_pup` (a white `creature:wolf`
mount) 4%. Feat `ft_r02_cold_den`.

### 4.7 Boss 2 — Borga the Hailwright

| Field | Value |
|---|---|
| id | `b_borga_hailwright` · body `chibi2:giant/runesmith`, `rune_helm` `#a8c0d8`, held `fh_maul` ice-blue, apron (`decor`), `scale 1.6` |
| Health | **665,000** · Enrage 8:00 — *Everything Quenched*: Room-wide +Cold 50 every 5 s |
| Arena | the Hailforge, 50 × 36 m; three anvils; a **quench pool** at the east end |

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Anvil Strike** `b_borga_hailwright_anvil` | Tank swap, Knockback | melee | — | 1,200 (T 32%) + knockback 8 m + **Tempered** (−10% max health, 30 s) | swap at 2; the tank keeps his back to a wall |
| **Forge Shards** `b_borga_hailwright_shards` | Targeted | circle 5 m YELLOW on 3 players | 2.0 s | 1,000 to all inside | spread; **each landing leaves a 3 m pillar of ice** that lasts 40 s (cover for Quench) |
| **Quench** `b_borga_hailwright_quench` | **Line of sight**, Room-wide | a wave of steam from the quench pool; the pool glows for 4 s | 4.0 s | 1,800 (82%) +Cold 40 to anyone the pool can "see" | hide behind an ice pillar from Forge Shards (the pillar's shadow is drawn on the floor during the cast) |
| **Hail Bellows** `b_borga_hailwright_bellows` | Adds | 6 `m_fiend_hail_imp` from the bellows | 3 s | as trash | kill them; each drops a **Cold Core** |
| **Cold Cores** `b_borga_hailwright_cores` | Carry | a glowing core on the floor, 20 s | — | carrying one: +Cold 5/s | carry a core to an **anvil** (interact) — each core on an anvil gives the raid **Warm Iron** (Warmth 6 m around that anvil for 30 s). Left alone, a core rolls to Borga and heals her 3% |
| **Frostforged Blade** `b_borga_hailwright_blade` | Danger zone | at 50%: she forges an ice blade; every 20 s a **cross** 40 m × 4 m, RED, centred on her | 2.5 s | 1,700 | stand in a diagonal |

Lines: pull *"Mind the sparks. They are cold ones."*; Quench *"**Into the water — all of it!**"*; Forge Shards
*"**Hold still, I am measuring you.**"*; 50% *"A blade. For the Queen."*; death *"Tell her… it was a good edge."*

**Hard mode — `hm_b_borga_hailwright` "Quench the Anvils."** Armed by dropping a Cold Core into the quench pool
before the pull (a core sits on the forge floor at the entrance). Anvils give no Warmth; ice pillars last 20 s;
Quench every 30 s. Drop `uq_hailwrights_tongs` 20%. Feat `ft_r02_quench_the_anvils`.

### 4.8 Boss 3 — The Whiteout

| Field | Value |
|---|---|
| id | `b_whiteout` · body `creature:elemental ×3.8`, body `#e8f4ff`, belly `#ffffff`, accent `#6a8aa8`, eyes `#40a0ff`; `storm` (ice) always running around it at radius 5 |
| Health | **740,000** · Enrage 8:30 — *White Silence*: vision 3 m, Room-wide 2,500 every 8 s |
| Arena | the White Crossing, 60 × 44 m of ice broken by 3 crevasses (falling = death), joined by 5 ice bridges 4 m wide; 4 **beacon posts** at the corners |
| Rule | **Blizzard:** you cannot see farther than **15 m** (fog). The Whiteout is invisible and takes **50% less damage** unless **2 or more beacons are lit** |

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Light the Beacon** (player action) | Beneficial | channel 4 s at a beacon post; a lit beacon is a GREEN 8 m Warmth zone and pushes the fog back to 40 m in its half | — | — | send two players to light two beacons at the start; the Whiteout snuffs one every 30 s (below) |
| **Snuff** `b_whiteout_snuff` | — | a WHITE line from the boss to one lit beacon | 3.0 s | the beacon goes out | relight another; the healer nearest does it |
| **Avalanche** `b_whiteout_avalanche` | Moving wave | a wall of snow rolling across the whole arena from N to S or E to W at 6 m/s; one 6 m BLUE gap, on a bridge | 2.5 s (rumble, the wall appears at the edge) | 1,800 + knockback 6 m (**into a crevasse = death**) | get to the BLUE gap; never stand with a crevasse behind you |
| **Drift** `b_whiteout_drift` | Void zone | circle 5 m, PURPLE-black snowdrift, under 3 players | 1.8 s | 120 / tick, slow 50%, 60 s | drop drifts away from bridges |
| **Frost Grip** `b_whiteout_grip` | Tank swap | melee | — | 800 + **Numb** (−8% attack speed, stacks) | swap at 4 |
| **Snowblind** `b_whiteout_snowblind` | Targeted | circle 4 m YELLOW on 2 players; they are **Blinded** (blind aura) for 6 s: their screen goes white except for GREEN and YELLOW shapes | 2.0 s | 600 | a blinded player walks to a lit beacon (its GREEN glow is always visible) |

At **40%** the Whiteout splits into **two** (each keeps the shared health) on opposite sides of the central crevasse;
each is visible only within 15 m of the side it is on. The raid splits (group 1 / group 2) and each group needs
one beacon lit on its side.

Lines (a wind with words in it): pull *"White. White. All of it white."*; Avalanche *"**The mountain lets go.**"*;
Snuff *"**Little fire, little fire…**"*; 40% *"Two of me. None of you."*

**Hard mode — `hm_b_whiteout` "No Fire on the Ice."** Armed if the raid enters the Crossing **without** carrying the
Hearthcoal (the carrier leaves it at checkpoint 2). Beacons need **two** players channelling together; Snuff every
20 s. Drop `it_whiteout_cloak` (a back cosmetic of blowing snow) 25%. Feat `ft_r02_no_fire`.

### 4.9 The Hearthcoal (carried through the raid)

The attunement's `it_hearthcoal` can be **carried by one player** (off hand; they cannot use an off-hand item).
While lit it is a 6 m aura that lowers Cold by 4/s for everyone near it. It **dims over 180 s** and is relit at any
brazier or checkpoint (2 s). If the carrier dies it drops (anyone can pick it up in 20 s, else it returns to the
last checkpoint, unlit). Keeping it **lit from the gate to the throne** in one lockout is half of the secret (§4.12).

### 4.10 Boss 4 — Skathra, the Wind-Mother

| Field | Value |
|---|---|
| id | `b_skathra_windmother` · body `creature:griffin ×4.0`, body `#dfe8f0`, belly `#ffffff`, accent `#5a7a9a`, eyes `#63b9d6`; `haste` aura in the air phase |
| Health | **740,000** · Enrage 8:30 — *Last Wind*: Gale from all sides at once |
| Arena | the Eyrie, a 46 m peak top; **no wall on the north and east** (falling = death); 4 standing stones (wind-breaks, 3 m wide); a **nest ledge** 8 m up on the west cliff, reached by updraft |
| Phases | P1 100–70% *Ground*; P2 70–40% *Sky* (she flies); P3 40–0% *Storm* (both) |

| Ability | Phase | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|---|
| **Talons** `b_skathra_talons` | P1, P3 | Tank swap | melee | — | 950 + **Torn** (−10% healing received, stacks) | swap at 3 |
| **Gale** `b_skathra_gale` | all | Knockback, Line of sight | the whole arena from one side (arrows streak across the floor from that side) | 2.0 s | 400 + push 15 m **toward the edge** | stand **downwind of a standing stone** (its wind shadow is drawn as a pale wedge) |
| **Talon Dive** `b_skathra_dive` | P2, P3 | Danger zone | line 40 m × 6 m, RED, from where she is in the sky to the far edge | 2.0 s | 1,800 + knock-up | step out of the line |
| **Feather Storm** `b_skathra_feathers` | P2 | Void zone | 6 circles 4 m PURPLE-black (feather drifts) | 1.8 s | 150 / tick, 40 s | move out; they drift 0.5 m/s downwind |
| **Clutch** `b_skathra_clutch` | P2 | Adds | 3 eggs on the nest ledge hatch in **30 s** into `m_beast_eyrie_fledgling` | 30 s | — | send 2 players up the **updraft** (GREEN column at the west cliff; stand in it 2 s to be lifted to the ledge) to break the eggs (60,000 health each) |
| **Stormcall** `b_skathra_stormcall` | P2 | **Interrupt (gold)** | cast 6.0 s while hovering beside the nest ledge | 6.0 s | if completed: Room-wide 2,400 and Gale twice | only someone on the nest ledge can reach her to interrupt (the egg team) |
| **Windshear** `b_skathra_windshear` | P3 | Tether | WHITE line between two players; the wind pulls them **together** at 3 m/s | 1.8 s | when they touch: 1,500 each + knockback both | keep apart by walking away from each other for 6 s |

Lines: pull *"Mind the edge, little walkers."*; Gale *"**Blow, then!**"*; Clutch *"**My children will be hungry.**"*;
Stormcall *"**Storm, come to me!**"*; death *"Fly… fly for me."*

**Hard mode — `hm_b_skathra_windmother` "Topple the Stones."** Armed by knocking down one standing stone (a
2,000-damage object that only takes damage out of combat). Only 3 wind-breaks; Gale every 15 s in P3. Drop
`it_mount_windmother_fledgling` (a white `creature:griffin` winged mount: runs and glides before Riding IV, flies after (page 07, level 60)) 2%.
Feat `ft_r02_topple`.

### 4.11 Boss 5 — The Council of Cold

| Field | Value |
|---|---|
| id | `b_council_of_cold` (encounter): `b_frostsayer_ulka` (`chibi2:giant/shaman`, `bone_headdress`, staff), `b_frostsayer_torv` (`chibi2:giant/oracle`, hood, orb), `b_frostsayer_ymma` (`chibi2:giant/sorcerer`, `circlet`, wand); `scale 1.5` each |
| Health | **272,000 each** (815,000) · Enrage 9:00 — *Unanimous*: all three cast their ultimate at once |
| Arena | Hall of the Council: 3 daises in a triangle 24 m apart; each council member stays on their dais |
| Rule | **Last Word:** when a member dies the other two **gain its ultimate** (below) at +20% damage. The kill order is the fight. Each member has one interruptible cast |

| Ability | Member | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|---|
| **Frostbolt Volley** `b_frostsayer_ulka_volley` | Ulka | **Interrupt (gold)** | cast 2.5 s: bolts at 5 players | 2.5 s | 900 each +Cold 15 | interrupt |
| **Rime Prison** (ultimate) `b_frostsayer_ulka_prison` | Ulka | Rescue | a player is encased in ice (a 30,000-health block) | 1.8 s | 200/s inside, +Cold 10/s | break the block quickly (area damage near him) |
| **Totem of Hail** `b_frostsayer_ulka_totem` | Ulka | Adds | an ice totem (40,000) that pulses +Cold 15 in 15 m every 5 s | — | — | kill |
| **Glacial Beam** (ultimate) `b_frostsayer_torv_beam` | Torv | **Body-block beam** | a beam from Torv to a healer, drawn WHITE for 3 s then fires for 6 s | 3.0 s | to the healer: 700/s; to anyone **standing in the beam between**: 350/s (half) | a tank or a player with a defensive steps into the beam line |
| **Foresight** `b_frostsayer_torv_foresight` | Torv | **Interrupt (gold)** | cast 3.0 s | 3.0 s | gives the council 50% less damage taken for 10 s | interrupt |
| **Winter's Circle** (ultimate) `b_frostsayer_ymma_circle` | Ymma | Danger zone (donut) | donut: RED from 6 m to 30 m around Ymma, safe hole inside 6 m | 2.5 s | 2,000 (91%) | run **in** to Ymma's dais |
| **Wild Frost** `b_frostsayer_ymma_wild` | Ymma | **Interrupt (gold)** | cast 2.0 s | 2.0 s | rolls one of: Frost Nova (8 m circle 1,000), Ice Lance (line 1,400), Chill (+Cold 30 raid) | interrupt |
| **Council's Scorn** `b_council_scorn` | all | Tank | each member lashes whoever holds it (a 14 m frost whip, they never leave their daises) | — | 700 per hit | **two tanks**: one holds Ulka and Torv (both daises are in reach from the midpoint between them), the other holds Ymma. No swap stack — this is the fight where tanks learn to hold two targets |

Recommended kill order: **Torv → Ulka → Ymma** (so the Glacial Beam is the one the others inherit). Any order
works; the others are harder.

Dialog-free fight; lines: pull (all three) *"The council sits."*; a member dies *"{name} has spoken. We have
heard."*; Winter's Circle *"**Come close, little ones. Closer.**"* (the hint to go in).

**Hard mode — `hm_b_council_of_cold` "One Voice."** Armed by striking the council gong at the hall door. The three
must die **within 10 s of each other**; Last Word happens anyway at each death. Drop `uq_councils_three_rings`
(a ring) 15%. Feat `ft_r02_one_voice`.

### 4.12 Boss 6 — Queen Ysmere of the Glacier Throne

| Field | Value |
|---|---|
| id | `b_queen_ysmere` · body `chibi2:giant/knight`, hat `crown` in ice `#c8e8ff`, held `fh_greatsword` ice `#a8d8ff`, cape `#e8f4ff`, `rune_halo` `#9ad8ff`; `scale 1.9`. In P3 she merges into her throne: `creature:titan ×3.2`, body clear ice `#c8e8ff`, core `#40a0ff` |
| Health | **1,335,000** · Enrage 11:00 — *The Long Winter*: every player gains Cold 25/s |
| Arena | the Glacier Throne, a 60 m round hall; the floor is a frozen lake; the Sleeper's shape is visible under it |
| Phases | P1 100–65% *Court*; P2 65–35% *Breakup*; P3 35–0% *The Throne Rises* |

**P1 — Court**

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Queen's Edge** `b_queen_ysmere_edge` | Tank swap | melee | — | 1,100 (T 29%) + **Frostbitten** (+Cold 10 per stack each 3 s) | swap at 3 |
| **Royal Frost** `b_queen_ysmere_royal_frost` | Danger zone | cone 180° 14 m in front, RED | 2.0 s | 1,800 | behind her |
| **Ice Court** `b_queen_ysmere_court` | Adds | 2 `m_humanoid_throne_guard` join every 50 s | 3 s | as trash | the off-tank picks them up; kill before the next pair |
| **Frozen Sentence** `b_queen_ysmere_sentence` | Targeted | circle 6 m YELLOW on 2 players; on landing it leaves an **ice block** (line-of-sight blocker, 30 s) | 2.0 s | 1,000 | spread; the blocks matter in P2 |

**P2 — Breakup (65–35%).** She stamps: the lake floor breaks into **floes** (seven 12 m ice platforms) drifting
on black water (Void zone, 400 / tick, +Cold 20/s). Floes drift 0.5 m/s and bump together every ~15 s.

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Checkered Ice** `b_queen_ysmere_checkered` | Checkerboard | each floe's surface lights in a 3 × 3 checkerboard, RED squares | 1.8 s | 1,600 | stand on unlit squares; flips each cast (every 12 s) |
| **Sinking Floe** `b_queen_ysmere_sink` | — | one floe (with a WHITE outline) sinks in 6 s | 6.0 s | into the water | jump to a neighbouring floe when two bump |
| **Blizzard Line** `b_queen_ysmere_line` | **Line of sight** | Room-wide ice storm from her throne | 4.0 s | 1,800 +Cold 30 | hide behind a **Frozen Sentence ice block** (P1's blocks carry over; she casts more Sentences in P2) |
| Queen's Edge | Tank swap | | | +10% | |

**P3 — The Throne Rises (35–0%).** She sits and the throne and the Queen become one titan; the floes freeze back
together.

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Glacier Fist** `b_queen_ysmere_fist` | Tank swap | melee, 6 m splash | — | 1,500 (T 39%) + knockback | swap at 2; the tanks stack together |
| **Heart of Winter** `b_queen_ysmere_heart` | **Soak** | ORANGE 5 m, **4 pips**, twice at once in opposite halves | 3.0 s | 3,600 each split +Cold 20 | group 1 takes one, group 2 the other; soakers are **Chilled to the Heart** (cannot soak again for 40 s) |
| **Crown of Rime** `b_queen_ysmere_crown` | Room-wide | whole hall | 2.0 s | 900 | heal |
| **Crack of Doom** `b_queen_ysmere_crack` | Danger zone | 3 lines 60 m × 5 m across the hall, RED | **3.0 s** (it kills) | **Lethal** | step between the lines; every 40 s |

**Dialog opportunity — `dlg_b_queen_ysmere_fire`** (at 35%, before she sits). *"Three hundred winters I have sat
here, holding the cold shut. You want the throne? Tell me what you would do with it."*

| Reply | Result |
|---|---|
| 1. *Say nothing.* | P3 |
| 2. *"Tear it down."* | P3 health +10% and she enrages 60 s sooner; +1 item |
| 3. *"Give it to the Frost Wardens."* | Rimehold reputation +250 for every player; P3 as written |
| 4. (only if the **Hearthcoal is lit and carried in this pull**) *"We brought you fire."* | she looks at the coal a long time: *"Then you do not know what I have been keeping asleep."* P3 as written; **after she dies the lake floor gives way** — the secret (§4.13) |

Lines: pull *"Kneel on the ice. It is warmer than you think."*; Breakup *"**The lake is tired of holding you.**"*;
Blizzard Line *"**Find a wall, if you can.**"*; Crack *"**Stand where the ice is whole!**"*; death *"Keep it…
asleep…"*

**Hard mode — `hm_b_queen_ysmere` "Winter Court."** Armed by kneeling (the `/kneel` emote, page 02) before the throne
with the whole raid before the pull. She keeps her Throne Guards: 4 guards stand through the whole fight and
share her damage (25% of every hit on her is passed to the guards — kill guards and they come back after 60 s).
Drop `it_mount_glacier_stag` (an ice `creature:elk`) 3%. Feat `ft_r02_winter_court`.

### 4.13 Secret boss — Vorm, the Sleeper Under the Glacier

**Unlock:** carry the Hearthcoal **lit** from the Glacier Gate to the throne in one lockout (it may be relit at
braziers; it must never go out *and be returned to a checkpoint*), pick reply 4 at the Queen, kill her.

| Field | Value |
|---|---|
| id | `b_vorm_sleeper` · body `creature:titan ×5.0`, body `#6a6a60` stone, belly `#8a8474`, accent `#2a2620`, eyes `#ff9a40`; ice sheets sliding off it; steam (`burn` aura) from the core |
| Health | **1,495,000** · Enrage 10:00 — *Spring*: the chamber floods to the ceiling |
| Arena | the Deep Ice, 50 m bowl under the lake. **The water rises**: 0.5 m every 60 s; water is a Void zone that slows 30% and ticks 150 |
| Twist | **Cold runs backwards.** In this arena your gauge is **Heat** (same bar, turns orange): +2/s everywhere, −10/s inside **Cold zones** (BLUE safe zones he leaves when ice falls from him). At 100: **Scalded** (5 s stun, 20% health) |

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Stonefist** `b_vorm_stonefist` | Tank swap | melee | — | 1,600 (T 42%) + **Cracked** stack | swap at 2 |
| **Waking Tremor** `b_vorm_tremor` | Room-wide | whole arena | 2.0 s | 1,000 + knock-down 1 s | heal |
| **Ice Falls** `b_vorm_icefall` | Danger zone → Safe zone | 4 circles 5 m RED where ice sheets drop from the ceiling | 2.0 s | 1,800 | step out; the landed ice becomes a **BLUE Cold zone** for 20 s (Heat −10/s) |
| **Meltwater Surge** `b_vorm_surge` | Moving wave | a wave 4 m high from his feet outward, 8 m/s; hide behind a fallen ice sheet (they block it) | 2.5 s | 2,000 + knockback | stand behind an ice sheet (line of sight) |
| **Old Anger** `b_vorm_anger` | Soak | ORANGE 6 m, **5 pips** | 3.0 s | 5,000 split | 5 soak; each soaker gains +40 Heat — soak from a Cold zone |
| **Spring Thaw** `b_vorm_thaw` | Soft enrage | the water rises (above) | — | — | the fight must end before the water reaches the ledges (~9 min) |

Lines (a voice like rockfall, slow): pull *"…Warm. Someone… brought… fire."*; Surge *"**The ice… goes… to water.**"*;
50% *"Three hundred… years… of dreaming… of spring."*; death *"…Then… let it be… winter… a while longer."*

**Hard mode — `hm_b_vorm_sleeper` "Early Spring."** Armed by letting the Hearthcoal **touch the water** at the start
(drop it). The water starts 1 m higher and rises 0.75 m per minute. Drop `it_vorm_heartstone` (a housing/back
cosmetic, a glowing stone heart) 30%. Feat `ft_r02_early_spring`.

**Loot:** guaranteed `leg_heart_of_the_sleeper`; `it_mount_stoneback_tortoise` (`creature:turtle ×2.2` stone and
moss) 2% per player; title *"Who Woke the Mountain"*.

### 4.14 r02 loot

**Raid set — `set_rimebound_court` "The Rimebound Court"** — tokens `it_token_r02_<slot>`; pieces
`it_rimebound_crown`, `it_rimebound_mantle` (chest), `it_rimebound_legwraps`, `it_rimebound_gauntlets`,
`it_rimebound_boots`, `it_rimebound_pendant`, each in 4 weights.

| Role | 2 pieces | 4 pieces | 6 pieces |
|---|---|---|---|
| Tank | **+10%** armour while below 50% health | every 3rd hit you take while a boss debuff is on you is reduced by **30%** | **Glacier Heart:** once per 120 s, falling below 25% health encases you in ice for 3 s (immune to damage, cannot act), then heals 20% |
| Healer | heals on a target with a stacking boss debuff are **+10%** per stack (max +30%) | your area heals also remove 20 **Cold/Heat**-style gauge points and 1 stack of a slowing effect | **Hearth:** every 45 s, your next heal leaves a 6 m GREEN zone for 8 s that heals **3%** max health per second |
| Damage | **+8%** damage to enemies that are slowed or frozen | your critical hits have 15% chance to **freeze** a non-boss enemy for 2 s | **Shatter:** hitting a frozen or stunned enemy deals **+40%** damage and ends the freeze |
| Support | **+10%** movement speed for allies within 10 m of you | when you give a buff, the target also takes **5%** less damage for 6 s | once per 60 s, allies within 15 m become immune to knockback for 6 s |

| id | Name | Slot | Source | Power |
|---|---|---|---|---|
| `leg_heart_of_the_sleeper` | Heart of the Sleeper | necklace | Vorm (guaranteed) | every 30 s, the next hit you take is absorbed in full and releases a 6 m tremor dealing **250%** of the absorbed damage to enemies |
| `leg_ysmeres_long_winter` | Ysmere's Long Winter | two-handed sword | Queen Ysmere (4%) | your attacks build **Winter** (1 per hit, max 20); at 20, your next attack freezes enemies in a 10 m cone for 3 s (bosses: slowed 50%) and deals **500%** weapon damage |
| `leg_windmothers_last_feather` | Windmother's Last Feather | off-hand (any) / quiver for bows | Skathra (3%) | the dodge roll (page 05) becomes a 10 m wind dash that knocks back enemies you pass through 4 m and gives you **+30%** attack speed for 3 s (cooldown of the dodge +2 s) |
| `uq_hailwrights_tongs` | Hailwright's Tongs | hands | Borga hard mode (20%) | your fire damage lowers your own Cold by 2 per hit (only in cold places); **+6%** fire damage |
| `uq_councils_three_rings` | The Council's Three Rings | ring | Council hard mode (15%) | on interrupt, gain one of three at random for 10 s: **+15%** haste, **+15%** damage, **10%** damage reduction |
| `uq_rimefang_collar` | Rimefang Collar | necklace | Matriarch (8%) | your pet or companion (page 06) gains **+20%** attack speed and freezes on its 10th hit (2 s) |
| `uq_whiteout_lantern` | Lantern of the White Crossing | light | Whiteout (8%) | your light cuts fog and blizzards: you see **+25 m** in weather; allies within your light take **5%** less cold damage |
| `uq_glacier_throne_signet` | Signet of the Glacier Throne | ring | Queen (8%) or quartermaster (15 Oathstones) | **+8%** damage and healing while above 80% health |

| Boss | Tokens | Epic items (`it_`) | Uniques / legendaries | Hard mode / other |
|---|---|---|---|---|
| Rimefang Matriarch | hands, feet | `it_matriarch_fang_knife` (dagger), `it_wolfrun_hood` (light head), `it_den_mother_bow` (bow) | `uq_rimefang_collar` | `it_mount_rimefang_pup` |
| Borga the Hailwright | legs, hands | `it_hailwright_hammer` (1H hammer), `it_forge_apron_plate` (heavy chest), `it_quench_orb` (orb) | — | `uq_hailwrights_tongs` |
| The Whiteout | feet, neck | `it_blizzard_staff` (staff, ice), `it_driftwalker_boots` (medium feet), `it_snowblind_veil` (cloth head) | `uq_whiteout_lantern` | `it_whiteout_cloak` |
| Skathra | chest, legs | `it_eyrie_spear` (polearm), `it_windmother_jerkin` (light chest), `it_updraft_wand` (wand) | `leg_windmothers_last_feather` | `it_mount_windmother_fledgling` |
| Council of Cold | neck, head | `it_torvs_seeing_orb` (orb), `it_ulkas_totem_mace` (mace), `it_ymmas_wild_wand` (wand) | — | `uq_councils_three_rings` |
| Queen Ysmere | head, chest | `it_icebound_greatsword` (2H sword), `it_throne_guard_halberd` (polearm), `it_queens_court_robe` (cloth chest), `it_frozen_sentence_shield` (shield) | `leg_ysmeres_long_winter`, `uq_glacier_throne_signet` | `it_mount_glacier_stag` |
| Vorm | any token | `it_stoneback_greataxe` (2H axe), `it_meltwater_robes` (cloth chest) | `leg_heart_of_the_sleeper` | `it_mount_stoneback_tortoise`, `it_vorm_heartstone` |

**Feats of r02:** the six hard-mode feats plus `ft_r02_early_spring`; `ft_r02_who_woke_the_mountain` (secret);
`ft_r02_deathless_<boss>` ×7; `ft_r02_speed` (60 minutes); `ft_r02_never_frozen` (no player reaches 100 Cold in a
whole clear); **playful:** `ft_r02_snowball` (hit Queen Ysmere with a thrown snowball — an item from the Wolf Run —
during the dialog). All hard modes → title *"of the Rimebound Court"*.

---

## 5. r03 — The Sunken Choir

### 5.1 At a glance

| Field | Value |
|---|---|
| id | `r03_sunken_choir` |
| Level | 50 · **Normal 10** (flex 8–10, item level 54) · **Mythic 20** (item level 64) |
| Entrance | the Drowned Coast, south of Saltmarch: the Bellwalk causeway, walkable **only at low tide** (the Drowned Coast's tide clock, page 01; 20 real minutes of every 60). At high tide the raid entrance is reached by the Saltmarch ferry (`npc_ferryman_gull`) |
| Bosses | 7 + 1 secret: the Saltbound Colossus → Mother Brinecoil → the Drowned Cantor → Captain Ilse Grimwater → the Pearl Twins → Abbess Marenne → the Choirmaster → *(secret)* the Unsung |
| Checkpoints | bells hung on driftwood (ring when lit) |
| Raid set | **`set_drowned_choir`** — *Vestments of the Drowned Choir* |
| New layers over r02 | **tide** (the arena's water level changes on a clock); **song lanes** (read a sequence and pick the safe lane); **mind control** (raid members turned hostile); **breath** (fights under water); **using objects** (cannons); **polarity** (two colours that must not touch) |
| Mythic | every boss gains one mechanic (listed as *Mythic:*), damage ×1.35, health ×2.85, 20 players |

**Tide (raid mechanic).** Arenas marked *Tidal* have a **90 s tide**: 45 s low, 45 s high, with a 6 s warning
("The tide turns." + a rising hiss). At high tide, the low floor (shown darker) is **shallow water**: slows 25%
and adds +1 stack of **Brine** every 2 s (5% less healing received per stack, max 6, clears 2 per second on dry
ground).

**Breath (raid mechanic).** Under water (fully submerged — some fights take the raid under), each player has a
**Breath** bar (20 s). At 0, drowning deals 10% max health per second. **Bubble columns** (GREEN) refill 25% per
second.

**Accessibility (applies to every song mechanic):** every note is a **symbol + colour + pitch**: Anchor ▲ (low,
teal), Shell ● (mid-low, white), Wave ≈ (mid, blue), Gull ✦ (mid-high, silver), Bell ■ (high, gold). Nothing
depends on hearing alone or on colour alone.

### 5.2 Lore

The Cathedral of the Deep Choir stood on the headland until the sea took the headland. The choir kept singing as
the water rose — the Saltmarch fishermen say they could hear it under the waves for a year, and then it stopped,
and then the dead started walking up the beaches. **The Drowned** (page 01's faction of the coast) are what the
choir became: the **Choirmaster** was never a person; it is a thing from the deep water that the choir sang to
sleep for four hundred years, and when the singing drowned, it woke up and learned the song. The **Unsung** is
the one note the choir never sang: the note that would have put it back to sleep.

### 5.3 Attunement — `q_attune_sunken_choir` "The Bell That Rings Underwater"

| Step | Objective | Where |
|---|---|---|
| 1 | Speak with `npc_bellwright_osk` (needs `r02` final boss killed once) | Saltmarch |
| 2 | Clear `d11_saltdeep_cathedral` (Normal+), take the **Choirbook** from its final boss | Drowned Coast |
| 3 | At **low tide**, ring the three shore bells (north beach, the wreck, the lighthouse) — each is guarded by a Drowned choir (elite pack of 5) | Drowned Coast |
| 4 | Read the Choirbook at the Bellwalk: the causeway rises | the raid door opens (at any tide from now on, for you) |
| Reward | 14 Oathstones; `it_choirbook_page` (the raid's note chart — shows the five note symbols on your HUD in r03) | |

### 5.4 Layout

```
  SALTMARCH ── Bellwalk causeway (low tide) ──┐
                                               ▼
                        ┌──────────────────────────────────┐
                        │ THE BELL PORCH (cp0) — vendor     │
                        └───────────────┬──────────────────┘
          ┌─────────────────────────────▼─────────────────────────────┐
          │ THE CORAL NAVE (B1, Tidal) — 60 × 36 m, coral grows        │
          │   [Colossus] in the apse; side aisles with choristers      │
          └─────────────────────────────┬─────────────────────────────┘
                                        │ cp1 (silent bell 1 in the font)
          ┌─────────────────────────────▼─────────────────────────────┐
          │ THE FLOODED CLOISTER (B2, Tidal) — a square walk round a   │
          │  sunken garth, 50 m; Brinecoil moves through the water    │
          └─────────────────────────────┬─────────────────────────────┘
                                        │ cp2 (repair) (silent bell 2)
          ┌─────────────────────────────▼─────────────────────────────┐
          │ THE CHOIR STALLS (B3) — 5 lanes of stalls, a bell in each  │
          └───────────────┬───────────────────────────┬───────────────┘
                          │ cp3 (silent bell 3)        │
          ┌───────────────▼─────────────┐   ┌─────────▼──────────────┐
          │ THE WRECK OF THE WIDOW'S DUE│   │ THE PEARL VAULT (B5)    │
          │ (B4) — a ship deck lodged   │   │ — round, mirrored floor │
          │ in the south transept       │   │   (silent bell 5)       │
          │ (silent bell 4)             │   └─────────┬──────────────┘
          └───────────────┬─────────────┘             │
                          └─────────────┬─────────────┘  (B4 and B5 in either order)
          ┌─────────────────────────────▼─────────────────────────────┐
          │ THE BAPTISTERY (B6) — a great font; the floor slopes in     │
          │   (silent bell 6)                                           │
          └─────────────────────────────┬─────────────────────────────┘
                                        │ cp6 (repair) — the stair goes down, under water
          ┌─────────────────────────────▼─────────────────────────────┐
          │ THE SUNKEN QUIRE (B7) — 70 m, half-flooded; bubble columns  │
          │   the Choirmaster fills the east end  (silent bell 7)       │
          └─────────────────────────────┬─────────────────────────────┘
                                        ▼ (secret: the quire floor opens)
                              ┌────────────────────┐
                              │ THE STILL WATER     │ secret, 40 m, perfectly silent
                              └────────────────────┘
```

**The seven silent bells** (secret unlock, §5.13): one hidden in each boss area, each a small bronze bell with no
clapper. Interact (2 s) and it sounds one note — the bell's symbol is added to the raid header ("Notes: ▲ ≈ ■ …").
Bells can only be rung **after** that area's boss is dead.

### 5.5 Trash

| id | Name | Body | Where | Health N / M | Abilities |
|---|---|---|---|---|---|
| `m_undead_drowned_chorister` | Drowned Chorister | `chibi2:undead/priest`, choir robe `#3a5a6a`, `circlet` of kelp | Coral Nave aisles, Choir Stalls | 60k / 170k | **Hymn of Brine** (gold, 2.5 s) — +3 Brine to all within 15 m; **Chorus** — 3+ choristers within 10 m cast in unison (one interrupt stops all three) |
| `m_undead_saltbound_deacon` | Saltbound Deacon | `chibi2:undead/cleric`, censer of seawater | Coral Nave, Baptistery | 90k / 255k | **Salt Ward** — shield on an ally absorbing 20k/57k; **Purge** it (dispel magic) |
| `m_construct_coral_sentinel` | Coral Sentinel | `creature:golem ×2.2`, coral `#d8806a`/`#f0c0a0` | Coral Nave (Elite) | 220k / 630k | **Coral Spike** — 10 m line, 2,000; **Encrust** — roots the tank 3 s |
| `m_beast_brine_eel` | Brine Eel | `creature:snake ×1.6`, `#2a4a5a` belly `#8ac0c0`, `lightning` sparks | Flooded Cloister (in water), Brinecoil adds | 45k / 130k | **Shock** — chains to 3 players in water, 600 each; only attacks players in water |
| `m_beast_reef_crawler` | Reef Crawler | `creature:beetle ×1.8`, coral shell `#c86a50` | Cloister, Wreck | 70k / 200k | **Pincer** — 1,200 + disarm 2 s; **Shell** — 70% less damage from the front |
| `m_aberration_bell_jelly` | Bell Jelly | `creature:slime ×1.6`, translucent `#a0d0ff`, `glow` | Choir Stalls ceiling (drift down) | 30k / 85k | **Sting** — tether to one player, 150/s, 8 s; break by 12 m; on death splits into 2 small jellies (8k) |
| `m_aberration_deep_lurker` | Deep Lurker | `creature:horror ×1.6`, `#1a2a3a`, eyes `#80e0ff` | Quire approach (under water, Elite) | 260k / 740k | **Drag Down** — pulls a player 10 m into deep water; **Ink** — 10 m Void zone, blinds 4 s |
| `m_undead_drowned_sailor` | Drowned Sailor | `chibi2:undead/fighter`, cutlass, `bandana` | the Wreck | 50k / 140k | **Hook** — pulls the farthest player to it |
| `m_undead_boarding_cutthroat` | Boarding Cutthroat | `chibi2:undead/rogue`, `tricorn`, two daggers | the Wreck; Captain's adds | 55k / 155k | **Backstab** from behind 1,600; **Smoke Pot** — 6 m Void zone that blinds |
| `m_undead_powder_monkey` | Powder Monkey | `chibi2:goblin/tinker`, undead skin, powder keg on its back | the Wreck; Captain's adds | 15k / 40k | runs at a player and **explodes** after 6 s: 6 m circle Danger zone, 1.8 s, 2,200; kill it or kite it out |
| `m_beast_wreck_gull` | Wreck Gull | `creature:owl ×1.0`, white-grey, `beak` | the Wreck rigging | 12k / 35k | **Dive** — 8 m line, 500; steals a buff |
| `m_humanoid_tidebound_cultist` | Tidebound Cultist | `chibi2:human/warlock`, sea-green robe, `hood` | Pearl Vault, Baptistery (living worshippers of the Drowned) | 65k / 185k | **Offer Breath** (gold, 3.0 s) — sacrifices itself to heal the nearest Drowned 25%; interrupt or kill |
| `m_aberration_pearl_mite` | Pearl Mite | `creature:shard ×0.7`, white or black | Pearl Vault | 8k / 22k | white or black **polarity** (§5.10); a mite of your opposite colour that touches you explodes for 800 |
| `m_undead_choir_warden` | Choir Warden | `chibi2:undead/knight`, `plate_helm` with a bell crest, halberd | Baptistery doors, Quire stair (Elite, pairs) | 300k / 855k | **Knell** — 12 m Room-wide-around-it 1,000 every 12 s; **Oath of Silence** — silences casters within 6 m for 3 s |
| `m_elemental_brine_elemental` | Brine Elemental | `creature:elemental ×2.2`, water `#3a8ac0`/`#c0f0ff` | Baptistery, Quire | 150k / 430k | **Undertow** — 8 m circle that pulls players in 3 m/s for 3 s; **Salt Spray** — cone 45°, +3 Brine |
| `m_aberration_quire_tentacle` | Quire Tentacle | `creature:worm ×2.0`, `#2a1f42` suckered | Quire approach (stationary, from grates) | 120k / 340k | **Slam** — 10 m line, 1,800; cannot move; kill or avoid |

### 5.6 Boss 1 — The Saltbound Colossus

| Field | Value |
|---|---|
| id | `b_saltbound_colossus` · body `creature:golem ×4.2`, coral `#d8806a`, belly `#f0c0a0`, accent `#5a2a20`, eyes `#80e0ff`; barnacle `plates` |
| Health | **810,000 / 2,310,000** · Enrage 7:30 — *Reef Complete*: coral fills the nave |
| Arena | the Coral Nave, *Tidal*, 60 × 36 m |

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Barnacle Fist** `b_saltbound_colossus_fist` | Tank swap | melee | — | 1,400 (T 29%) + **Encrusted** (−8% move speed, stacks) | swap at 3 |
| **Tidal Slam** `b_saltbound_colossus_slam` | Danger zone | circle 10 m around him, RED | 2.0 s | 2,200 (79%) | out; tanks use a defensive |
| **Coral Growth** `b_saltbound_colossus_coral` | Void zone → wall | 3 circles 4 m PURPLE-black under ranged players; after 20 s each hardens into a **coral wall** (blocks movement and line of sight) | 1.5 s | 200 / tick while soft | drop them at the edges so the walls do not cut the room; walls can be broken (80k/230k) |
| **Salt Surge** `b_saltbound_colossus_surge` | Soak | ORANGE 5 m, 3 pips (Mythic 5) | 3.0 s | 4,500 split + 4 Brine | soak on **dry** ground at high tide, or the Brine stacks double |
| **Grinding Tide** `b_saltbound_colossus_grinding` | Room-wide at high tide | the low floor | tide warning 6 s | 300/s to anyone in the water | stand on the raised aisles at high tide |

**Mythic:** coral walls **grow** 1 m every 10 s toward the nearest player. Lines: pull *"…"* (he does not speak;
the nave groans); Slam: the Narrator *"**He lifts both fists.**"*.

**Hard mode — `hm_b_saltbound_colossus` "Let It Grow."** Armed by **not** breaking the three coral clusters at the
nave door before the pull (they are normally in the way). Starts with 3 walls in the room; walls cannot be broken.
Drop `it_coral_crown` (head cosmetic) 25%. Feat `ft_r03_let_it_grow`.

### 5.7 Boss 2 — Mother Brinecoil

| Field | Value |
|---|---|
| id | `b_mother_brinecoil` · body `creature:snake ×7.0` (sea serpent), body `#2a4a5a`, belly `#8ac0c0`, accent `#10202a`, eyes `#e0ff60`; fins as `spikes` |
| Health | **915,000 / 2,610,000** · Enrage 8:00 — *Drowning Coil*: she fills the cloister, 1,500/s |
| Arena | the Flooded Cloister, *Tidal*: a 50 m square walkway 6 m wide around a sunken garth (deep water, 40 m square) |

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Fanged Strike** `b_mother_brinecoil_fang` | Tank swap | melee from the water's edge | — | 1,500 (T 31%) + **Venom** 200/s stacking | swap at 3 |
| **Coil Sweep** `b_mother_brinecoil_sweep` | Moving wave | her body sweeps along one whole side of the walkway, 8 m/s; one 6 m BLUE gap where she lifts her coil | 2.0 s | 2,400 + knocked into the water | stand at the gap; switch sides of the square between sweeps |
| **Constrict** `b_mother_brinecoil_constrict` | Tether | WHITE lines from her to 2 players; the lines **tighten** (pull 2 m/s toward the water) | 6 s | if pulled in: 800/s and held under water (Breath) until freed (damage her coil, 60k) | the tethered players walk **away** and a healer keeps them up; at 20 m the tether snaps |
| **Brood** `b_mother_brinecoil_brood` | Adds | 4 `m_beast_brine_eel` from the garth | 3 s | as trash | fight them from the walkway; eels only shock players in water |
| **Submerge** `b_mother_brinecoil_submerge` | Danger zone | she dives; 3 lines 30 m × 5 m RED across the walkway where she will burst out | 2.5 s | 2,600 | step out of the lines |
| **Venom Spit** `b_mother_brinecoil_spit` | Targeted | circle 5 m YELLOW on 3 players; on landing a 5 m Void zone of venom (30 s) | 1.8 s | 900 + 150 / tick | spread along the walkway, away from the corners |

**Mythic:** at high tide the walkway itself floods (all of it is shallow water) and Brood eels can attack everyone.
Lines (hiss, subtitled): pull *"Warm little morsels on my cloister."*; Coil Sweep *"**Round and round the garden.**"*;
Constrict *"**Hold still, hold still…**"*; death *"My brood… will remember…"*

**Hard mode — `hm_b_mother_brinecoil` "Eggs in the Garth."** Armed by killing her unhatched clutch (3 egg sacs in the
garth, reached by swimming) before the pull. She is enraged from the start: Coil Sweep has **no** gap for the
first sweep of every minute — the raid must be in the water (breath!) as she passes. Drop `uq_brinecoil_fang` 15%.
Feat `ft_r03_eggs_in_the_garth`.

### 5.8 Boss 3 — The Drowned Cantor

| Field | Value |
|---|---|
| id | `b_drowned_cantor` · body `chibi2:undead/enchanter`, a tall choir-master's hat (`top_hat` recoloured `#2a3a4a`), held baton (`wand` `#c8b070`), cape `#3a5a6a`; `scale 1.8`; notes (`enchant` aura) circling him |
| Health | **1,015,000 / 2,895,000** · Enrage 8:30 — *Coda*: every lane is RED |
| Arena | the Choir Stalls, 50 × 30 m: **5 lanes** running north–south (6 m wide each), divided by stalls (waist-high, you step over them in 0.5 s). Each lane has a bell: ▲ ● ≈ ✦ ■ from west to east |

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Phrase** `b_drowned_cantor_phrase` | Song lanes (Safe zone) | he sings **3 notes** (Mythic 4); each shows over his head as symbol + colour for 1 s. After the phrase, **the lane of the LAST note** turns BLUE (safe) and every other lane RED | phrase 3 s + 2.0 s | 2,600 (93%) to anyone in a RED lane | be in the lane of the last note. Every 25 s |
| **Counterpoint** `b_drowned_cantor_counterpoint` | Song lanes | from 60%: the safe lane is the **first** note of the phrase if he conducts with his **left** hand (a gold baton glow on the left), the last if his right | as Phrase | as Phrase | watch the hand |
| **Discord** `b_drowned_cantor_discord` | **Interrupt (gold)** | cast 3.0 s | 3.0 s | if completed: 5 players **Confused** 5 s (confused aura: controls reversed) | interrupt |
| **Harmony** `b_drowned_cantor_harmony` | Soak | 2 ORANGE circles 4 m, **2 pips** each, in two different lanes | 3.0 s | 3,000 split each | pairs soak; the lanes of the soaks are called out by bell ringing |
| **Baton** `b_drowned_cantor_baton` | Tank swap | melee | — | 1,300 + **Off-key** (+10% damage taken from Phrase, stacks) | swap at 3 |
| **Rest** (a bar's rest) `b_drowned_cantor_rest` | Beneficial | at every 20% he stops for 5 s; the whole room is GREEN (heal 5% max health per second) | — | — | heal up and reposition |

Lines: pull *"From the top. And — "*; Phrase *"**Listen!**"*; Discord *"**No, no, NO — wrong!**"*; Counterpoint
*"Now the other hand."*; death *"…and the rest… is silence."*

**Hard mode — `hm_b_drowned_cantor` "Encore."** Armed by ringing all five lane bells in order (▲ ● ≈ ✦ ■) before the
pull. Phrases are 5 notes, Rest never happens, and Discord is uninterruptible once per minute (grey bar). Drop
`it_cantors_baton_toy` (a toy that makes nearby players' characters sing a note) 30%. Feat `ft_r03_encore`.

### 5.9 Boss 4 — Captain Ilse Grimwater and the Last Crew

| Field | Value |
|---|---|
| id | `b_captain_grimwater` · body `chibi2:undead/rogue`, `tricorn` `#2a2a3a`, held cutlass (`fh_sabre`) and a pistol in the off hand, long coat `#5a2a2a`; `scale 1.6` |
| Health | **1,015,000 / 2,895,000** (her ship's mast: 200k / 570k, separate) · Enrage 9:00 — *All Hands*: 12 boarders every 10 s |
| Arena | the deck of the *Widow's Due*, 44 × 16 m, jammed in the south transept at a 5° tilt; her **ghost ship** hangs beside it in the water, broadside on. Four deck cannons on the port rail |
| Phases | P1 100–60% *Boarding*; P2 60–25% *Broadside*; P3 25–0% *Last Stand* |

| Ability | Phase | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|---|
| **Cutlass Flurry** `b_captain_grimwater_flurry` | all | Tank swap | melee | — | 3 hits × 600 + **Cut** bleed | swap at 3 |
| **Pistol Shot** `b_captain_grimwater_pistol` | all | Targeted | line 30 m × 2 m YELLOW to the lowest-health player | 1.8 s | 1,800 | the target sidesteps; a tank can body-block |
| **Boarders!** `b_captain_grimwater_boarders` | P1 | Adds | 4 `m_undead_boarding_cutthroat` + 2 `m_undead_powder_monkey` swing aboard | 3 s | as trash | off-tank picks up; kill monkeys first |
| **Broadside** `b_captain_grimwater_broadside` | P2 | Danger zone | 6 lines across the deck (4 m wide, the full 16 m width) from the ghost ship's gun ports | 2.5 s | 3,000 (107%) | stand between the lines |
| **Man the Guns** (player action) | P2 | Object | fire a deck cannon (interact 2 s) at the ghost ship's mast: 40k per shot, 10 s reload | — | — | 4 players on cannons; **felling the mast** ends Broadside and drops the mast across the deck (a new wall) |
| **Anchor Drop** `b_captain_grimwater_anchor` | P2, P3 | Danger zone | circle 7 m RED where the ghost ship's anchor falls | 2.0 s | 2,800 + leaves a **chain Tether** from the anchor to the nearest player: WHITE, 10 m leash for 15 s | stay clear; the chained player stays near the anchor |
| **Keelhaul** `b_captain_grimwater_keelhaul` | P3 | Rescue | a rope (WHITE tether) drags a player toward the rail at 2 m/s | 5 s to reach the rail | over the rail: under the ship, Breath, 600/s | cut the rope — any melee attack on the rope (it has 20k) |
| **Last Stand** `b_captain_grimwater_last_stand` | P3 | Soft enrage | +5% damage every 20 s | — | — | finish her |

**Dialog opportunity — `dlg_b_captain_grimwater_parley`** (at 60%, before Broadside). She lowers her cutlass:
*"Parley. You've the look of folk who want something from the Choir. So do I — I want my crew out of that song.
What's it worth to you?"*

| Reply | Result |
|---|---|
| 1. *Say nothing.* | P2 as written |
| 2. *"Your ship."* (you will take it) | she laughs; Broadside every 20 s, but felling the mast also kills 25% of her health |
| 3. *"Our word. We'll silence the Choir."* | **Parley:** she and her crew **stop fighting**. The encounter ends as a win with **−1 item** (loot master) / −10% chance (personal), but she gives the raid **Grimwater's Chart** (`it_grimwaters_chart`): in P2 of the Choirmaster fight her ghost ship fires on the Choirmaster once (8% of its health). If the raid parleys and then does *not* kill the Choirmaster this lockout, next week she is hostile and opens with Broadside |
| 4. *"Gold."* (the raid leader must hold 500 gold) | she takes it and fights anyway: *"And I'll take the rest off your bodies."* She drops +1 item (the gold comes back as her loot) |

Lines: pull *"All hands! We've visitors!"*; Broadside *"**Run out the guns!**"*; Anchor *"**Let go the anchor!**"*;
Keelhaul *"**Under the keel with 'em!**"*; death *"Tell the crew… we made port."*

**Mythic:** the deck **tilts** a further 5° every 30 s toward the rail (players slide 0.5 m/s unless moving).

**Hard mode — `hm_b_captain_grimwater` "No Quarter."** Armed by firing a deck cannon at her before the pull (the
cannons are loaded). No dialog opportunity; the mast has double health. Drop `it_mount_widows_due_skiff` (a small
ghost boat — boats are page 05/08's; if Wildmarch keeps Farhold's boats, `(reuse: js/boat.js)`) 3%. Feat
`ft_r03_no_quarter`.

### 5.10 Boss 5 — The Pearl Twins, Pearl and Nacre

| Field | Value |
|---|---|
| id | `b_pearl_twins` (encounter): `b_twin_pearl` (`creature:shard ×3.2`, body `#f4f0e8`, glow white) and `b_twin_nacre` (`creature:shard ×3.2`, body `#1a1a24`, accent `#8a60c0`, glow violet) |
| Health | **557,500 each** (1,115,000) / **1,590,000 each** (3,180,000). They must die within 10 s of each other or the survivor heals the other to 30% |
| Enrage | 8:30 — *Perfect Luster*: every player gets both polarities (explodes) |
| Arena | the Pearl Vault, a 40 m round room with a **mirrored floor**: the west half white marble, the east half black |
| Rule | **Polarity.** At the pull every player is given **White** or **Black** (a ring of that colour at their feet and on their raid frame). Damage you deal to the twin **of your own colour** heals it; to the **opposite** twin it deals +30% |

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Luster** `b_pearl_twins_luster` | Soak (by colour) | 2 ORANGE circles 5 m, one with a white rim, one with a black rim, **4 pips** each (Mythic 6) | 3.0 s | 4,000 split; a soaker of the **wrong** colour makes it explode for 4,000 on everyone inside | soak the circle whose rim matches your colour |
| **Invert** `b_pearl_twins_invert` | Tether (polarity swap) | WHITE line between 2 players of opposite colours | 5 s | at the end they **swap colours** | the two tethered players tell the raid; nothing else to do — but plan soaks around it |
| **Touch** `b_pearl_twins_touch` | Spread by colour | from 60%: players of opposite colours within **3 m** of each other take 800/s | — | 800/s | whites on the white floor, blacks on the black floor |
| **Pearl Mites** `b_pearl_twins_mites` | Adds | 8 `m_aberration_pearl_mite` (4 white, 4 black) drift toward the nearest player | 3 s | 800 if they touch the opposite colour | kill them; a mite of **your** colour is harmless to you |
| **Nacre Lash** `b_twin_nacre_lash` / **Pearl Flash** `b_twin_pearl_flash` | Tank swap | each twin stacks its own colour on its tank: 5 stacks of White while holding Pearl = +50% damage from Pearl | — | 1,400 per hit | the tanks **swap twins** at 4 stacks (and their polarity swaps with them) |
| **Mirror** `b_pearl_twins_mirror` | Room-wide | at 50%: the floor flips (white half becomes black) | 3.0 s | 1,200 | everyone crosses to their colour's new side |

Lines (two voices at once): pull *"Two of us. Two of you. Everyone is two."*; Mirror *"**Turn it over. Turn it
over!**"*; Invert *"**You, and you — swap.**"*; death *"…one…"*

**Mythic:** Invert tethers 2 pairs; Mirror every 25%. **Hard mode — `hm_b_pearl_twins` "One Colour."** Armed by
touching both the white and black pearl altars at the vault door within 1 s of each other. Half the raid has no
polarity at the start (grey) and is given one only by Invert. Drop `it_pearl_nacre_earrings` (face cosmetic)
25%. Feat `ft_r03_one_colour`.

### 5.11 Boss 6 — Abbess Marenne of the Deep Choir

| Field | Value |
|---|---|
| id | `b_abbess_marenne` · body `chibi2:undead/cleric`, a wimple (`hood` `#e8e8f0`), held staff with a bell (`staff` `#c8b070`), robe `#3a5a6a`/`#e8e0c8`; `scale 1.8`; `barrier` aura when shielded |
| Health | **1,215,000 / 3,465,000** · Enrage 9:30 — *Mass Baptism*: every player under water |
| Arena | the Baptistery, 44 m round, the floor slopes 2 m down toward a great **font** (8 m, deep water) in the middle |

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Salt in the Wound** `b_abbess_marenne_salt` | Tank swap | melee | — | 1,400 + **Salted** (heals on you −15%, stacks) | swap at 3 |
| **Drowned Hymn** `b_abbess_marenne_hymn` | **Mind control** | 2 players (Mythic 4) glow sea-green; after the warning they are **Charmed** 12 s: hostile to the raid, their abilities at 30% power, their raid frames turn green with an eye icon | 2.0 s (a hymn line; the targets' frames pulse) | their attacks | **crowd-control them** (stun, sleep, root; page 05 caps each at 2 s on charmed players) or **dispel** the charm after breaking its 15k shield. Do not kill them — damage to a charmed player is reduced 80% but not zero |
| **Baptism** `b_abbess_marenne_baptism` | Rescue | a player is lifted and dropped into the font, held under (Breath 20 s) | 2.0 s | drowning after Breath | 2 players interact with the font's edge (2 s channel together) to pull them out |
| **Tide Bell** `b_abbess_marenne_bell` | Soak | ORANGE 6 m, **4 pips** at the font's edge | 3.0 s | 5,000 split | soak; not with a charmed player inside (they count as a pip but take no damage and the soakers take their share) |
| **Absolution** `b_abbess_marenne_absolution` | **Interrupt (gold)** | cast 4.0 s, heals her 8% | 4.0 s | — | interrupt |
| **Rising Water** `b_abbess_marenne_rising` | Void zone | every 60 s the font's water rises 1 m up the slope (the low ring becomes a Void zone: 250 / tick) | 3 s | as listed | fight on the high ground; the arena shrinks |
| **Sanctuary** `b_abbess_marenne_sanctuary` | Beneficial | at 30%: 3 GREEN circles 4 m at the high edge — inside, you cannot be Charmed | — | — | the raid rotates through them |

Lines: pull *"Come, children. Come down to the water."*; Hymn *"**Sing with us, {target}. Sing.**"*; Baptism
*"**Be made clean.**"*; Absolution *"Forgive me, Deep. Forgive me."*; death *"The water… was so… quiet."*

**Mythic:** Charmed players keep **full** power for their first 3 s. **Hard mode — `hm_b_abbess_marenne` "Drink from
the Font."** Armed by a player drinking from the font before the pull (they are Charmed at the pull, for 20 s).
Sanctuary never comes. Drop `uq_abbess_bell_staff` at 15% (8% without hard mode). Feat `ft_r03_drink_from_the_font`.

### 5.12 Boss 7 — The Choirmaster, Who Sings the Sea

| Field | Value |
|---|---|
| id | `b_choirmaster` · body `creature:horror ×7.0`, body `#1a2a3a`, belly `#3a6a7a`, accent `#0a1420`, eyes `#80e0ff` (9 eyes); 6 tentacles, each a **separate target** in P1; `storm` (ice/water) around it in P2 |
| Health | **1,825,000 / 5,200,000** (tentacles 90k / 255k each, not counted) · Enrage 11:00 — *The Whole Sea Sings* |
| Arena | the Sunken Quire, 70 × 40 m, half-flooded: a **dry stall-floor** at the west half, deep water the east half, the Choirmaster rising from the east end |
| Phases | P1 100–70% *Anthem*; P2 70–40% *The Deep Verse* (under water); P3 40–0% *Last Refrain* |

**P1 — Anthem.** Six tentacles rise at fixed spots (T1–T6). Each has one ability; the body sings.

| Ability | Source | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|---|
| **Crushing Coil** `b_choirmaster_coil` | T1, T2 | Tank swap | melee on the tank | — | 1,800 (T 38%) + **Crushed Chest** (−10% Breath, stacks) | swap at 3; T1 and T2 are tanked |
| **Lash** `b_choirmaster_lash` | T3, T4 | Danger zone | line 25 m × 4 m RED | 2.0 s | 2,600 | sidestep |
| **Grasp** `b_choirmaster_grasp` | T5 | Rescue | grabs a player, drags them into the water | 2.0 s | Breath | kill T5 or deal 30k to its grip |
| **Ink Cloud** `b_choirmaster_ink` | T6 | Void zone | circle 8 m PURPLE-black ink, blinds inside | 1.8 s | 250 / tick | stay out |
| **Anthem** `b_choirmaster_anthem` | body | Song lanes | the Cantor's lanes return on the stall floor (5 lanes); a 3-note phrase, safe lane = last note | 3 s + 2.0 s | 3,000 | the r03 boss 3 lesson |

Killing a tentacle removes its ability; it regrows in 60 s. The body takes damage only from players standing on
the stall floor.

**P2 — The Deep Verse (70–40%).** The quire floods; **everyone is under water** (Breath 20 s). Six **bubble
columns** (GREEN) refill Breath. The Choirmaster is surrounded by a shell of sound (**Chorus Shield**: 99% less
damage) that drops only while the raid holds **4 of the 6 bubble columns** with at least one player each (the
columns are also where you breathe).

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Deep Note** `b_choirmaster_deep_note` | Room-wide | whole quire | 3.0 s | 2,000 + Breath −25% | be topped up |
| **Current** `b_choirmaster_current` | Moving wave | a current flowing through the water, 4 m/s, carrying players 10 m | 2.0 s | 0 (displacement) | swim against it; lose a column if carried off |
| **Drowned Choir** `b_choirmaster_drowned_choir` | Adds | 4 `m_undead_drowned_chorister` swim to a bubble column and **pop** it (it returns in 30 s) | 3 s | as trash | kill them before they reach a column |
| **Lure** `b_choirmaster_lure` | Mind control | 1 player (Mythic 2) swims toward the maw at 3 m/s for 8 s | 1.5 s | if they reach it: eaten (dies) | stun/root them, or dispel |

**P3 — Last Refrain (40–0%).** The water falls back; the dry floor returns. All six tentacles regrow. Every P1
ability plus:

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Refrain** `b_choirmaster_refrain` | Song lanes + Soak | a 4-note phrase: the safe lane is the last note, **and** the first note's lane holds a Soak (ORANGE, 3 pips; Mythic 6) | 3 s + 2.0 s | 3,200 / soak 5,000 split | most of the raid in the safe lane, 3 players (6) soak the first note's lane — the soakers use a defensive |
| **Swell** `b_choirmaster_swell` | Room-wide, soft enrage | every 30 s | 2.0 s | 1,000, +20% each cast | end it |
| **Undersong** `b_choirmaster_undersong` | Mind control | 2 players (Mythic 4) Charmed 10 s (as the Abbess) | 2.0 s | — | crowd control |

**Dialog opportunity — `dlg_b_choirmaster_sing`** (at 40%, as the water falls). The nine eyes open at once:
*"Four hundred years they sang me to sleep. Then they stopped. Sing for me, little ones. Sing, or be the song."*

| Reply | Result |
|---|---|
| 1. *Say nothing.* | P3 |
| 2. *"We don't sing for you."* | P3 Swell starts at 1,300 |
| 3. (if Grimwater parleyed) *"Captain — now!"* | her ghost ship fires: 8% of its health; skip the first Undersong |
| 4. (with **Notes 7/7**) *"Sing the seven notes."* The raid leader enters the seven symbols on a note wheel. The right order is **not** the order the bells were rung: it is the order of the seven notes carved round the Quire's rim (one symbol above each bubble column, read clockwise from the door), which a raid only notices once it is looking for it | if right: *"…that is not my song. That is —"* The quire goes silent, the fight continues as P3, and on its death the floor opens: the secret (§5.13). If wrong: the raid takes 3,000 and P3 as written |

Lines: pull *"Sing."*; Anthem *"**Listen. Listen.**"*; P2 *"**Come down. It is quiet down here.**"*; Lure *"**{target}.
Come.**"*; death *"…it is so… quiet…"*

**Hard mode — `hm_b_choirmaster` "Full Choir."** Armed by leaving the two Choir Wardens on the Quire stair alive (they
join the fight, P1). Tentacles regrow in 30 s; P2 needs **5** columns held. Drop `it_mount_choir_leviathan` (a
swimming mount: `creature:snake ×3`, eyes glowing — water mount per page 05/07) 2%. Feat `ft_r03_full_choir`.

### 5.13 Secret boss — The Unsung

**Unlock:** ring all **seven silent bells** (§5.4) in one lockout; at the Choirmaster's dialog pick reply 4 and give
the notes in the Choirmaster's own order; kill the Choirmaster.

| Field | Value |
|---|---|
| id | `b_the_unsung` · body `creature:wisp ×5.0`, body `#ffffff`, belly `#e8fbff`, accent `#a0c0ff`; **no sound at all** |
| Health | **2,045,000 / 5,825,000** · Enrage 10:00 — *The Note*: a single tone; everyone dies |
| Arena | the Still Water: 40 m round, a floor of perfectly still water (you walk on it) that **shows reflections** |
| Rule | **Silence.** No sounds play in this arena (music, sfx and voices off; page 11's sound cues are replaced by a pulse of the screen edge). Every warning is visual only |

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Echo** `b_the_unsung_echo` | Danger zone (memory) | every player's position **8 s ago** lights as a RED circle 3 m (the reflection shows your old self standing there) | 2.0 s | 2,400 each | keep moving: never stand where you were 8 s ago. Every 15 s (Mythic 10 s) |
| **Unsaid** `b_the_unsung_unsaid` | Interrupt — reversed | a cast bar with a **gold border** that must **not** be interrupted; interrupting it silences the raid for 6 s | 4.0 s | if allowed to finish: nothing (it heals her 2%) | hold interrupts. Teaches reading the bar, not reflex |
| **Stillness** `b_the_unsung_stillness` | Room-wide / movement | for 4 s any player who **moves** takes 400 per 0.5 s | 2.0 s (the water freezes over) | 800/s while moving | stop. Combined with Echo, you move **before** Stillness |
| **Reflection** `b_the_unsung_reflection` | Adds | from 60%: 4 reflections of **raid members** (their class models, 120k / 340k each) step out of the water and use that class's first spell (page 06) at 50% power | 3 s | per class | kill them; each is a copy of a player: that player takes 20% of the damage their reflection takes |
| **Harmony** `b_the_unsung_harmony` | Soak | ORANGE 6 m, **all players** needed (every living player) | 4.0 s | 10,000 split; missing players = Room-wide lethal | everyone stacks; this happens at 50% and 20% |
| **Held Note** `b_the_unsung_held_note` | Tether | WHITE lines from her to 3 players; they must stay **within 8 m** of her for 8 s | 1.8 s | leaving: 2,000 | the three go to her and stay; the tank keeps her still |

Lines: none — she has no voice. Her lines appear only as **text** on the banner, silent: pull *"…"*; 50% *"(she
holds out her hand to the whole raid)"*; death *"(the note is sung. Far above, the Choirmaster's body sinks.)"*

**Hard mode — `hm_b_the_unsung` "A Cappella."** Armed by ringing the **eighth bell** at the Still Water's edge (it is hidden under the water) before the pull: Echo remembers **two**
positions (8 s and 16 s ago). Drop `it_unsung_voice` (a voice cosmetic: your character's barks are replaced by a
single pure tone) 30%. Feat `ft_r03_a_cappella`.

**Loot:** guaranteed `leg_the_unsung_note`; `it_mount_still_water_heron` (a pale `creature:owl ×2.2` long-legged,
white) 2% per player; title *"Who Sang the Last Note"*.

### 5.14 r03 loot

**Raid set — `set_drowned_choir` "Vestments of the Drowned Choir"** — tokens `it_token_r03_<slot>` (Mythic tokens
`it_token_r03m_<slot>`); pieces `it_drowned_choir_cowl`, `…_vestment` (chest), `…_leggings`, `…_gloves`,
`…_sandals`, `…_bell_pendant`; four weights.

| Role | 2 pieces | 4 pieces | 6 pieces |
|---|---|---|---|
| Tank | taking damage while below 60% health restores **1%** of your max health per second for 5 s (60 s cooldown) | your taunt also **silences** the target for 1.5 s (non-bosses) | **Undertow:** every 20 s, your next hit pulls all enemies within 10 m 4 m toward you and your threat on them doubles for 6 s |
| Healer | heals **+10%** on targets standing in water or under water | your heals remove **1 Brine-style** healing-reduction stack from the target | **Chorus:** when three of your heals land within 3 s, the next heal is **copied** to the two lowest allies at 60% |
| Damage | **+5%** damage per different enemy you have hit in the last 6 s (max +15%) | critical hits refund **3%** of your resource | **Refrain:** every 30 s, your next spell or skill is repeated 1 s later at **60%** power at the same spot |
| Support | allies within 12 m of you hold their breath **50% longer** and move **10%** faster in water | your buffs also cleanse **1** control effect (stun, sleep, charm) when given | once per 90 s, you and 4 nearest allies are immune to mind control for 10 s |

| id | Name | Slot | Source | Power |
|---|---|---|---|---|
| `leg_the_unsung_note` | The Unsung Note | ring | the Unsung (guaranteed) | every 12 s, your next spell is **silent**: no cast time, no resource cost, and enemies hit are silenced for 2 s (bosses: their next interruptible cast takes 30% longer) |
| `leg_choirmasters_ninth_eye` | The Choirmaster's Ninth Eye | head | Choirmaster (4%) | you see enemy telegraphs **0.5 s sooner** than the rest of the raid (they draw a faint outline before they appear) and deal **+10%** damage for 4 s after dodging one |
| `leg_grimwaters_last_broadside` | Grimwater's Last Broadside | off hand (pistol) / any | Captain Grimwater (4%) | every 25 s, your next basic attack fires a broadside: 6 lines 20 m × 3 m for **200%** weapon damage each, across your facing |
| `uq_brinecoil_fang` | Brinecoil Fang | dagger | Brinecoil hard mode (15%) | your poison damage **+12%**; poisoned enemies in water take double poison damage |
| `uq_abbess_bell_staff` | The Abbess's Bell-Staff | staff (healer) | Abbess (8%) / hard mode (15%) | your area heals ring a bell: allies healed are **immune to charm** for 3 s |
| `uq_pearl_and_nacre` | Pearl and Nacre | ring pair (two items, set of 2) | Pearl Twins (8%) | wearing both: your damage alternates white/black; each alternation gives **+2%** damage (max +10%, 6 s) |
| `uq_cantors_tuning_fork` | The Cantor's Tuning Fork | off-hand focus | Cantor (8%) | interrupting a cast gives you **+20%** cast speed for 5 s |
| `uq_saltbound_knuckles` | Saltbound Knuckles | hands | Colossus (8%) | melee hits encrust: the target moves **5%** slower per stack (5 stacks) |

| Boss | Tokens | Epic items (`it_`) | Uniques / legendaries | Hard mode / other |
|---|---|---|---|---|
| Saltbound Colossus | hands, feet | `it_coralhide_breastplate` (heavy chest), `it_reefbreaker_maul` (2H mace), `it_salt_crusted_orb` (orb) | `uq_saltbound_knuckles` | `it_coral_crown` |
| Mother Brinecoil | legs, feet | `it_seaserpent_spine_bow` (bow), `it_brineskin_leggings` (light legs), `it_eel_lightning_wand` (wand) | — | `uq_brinecoil_fang` |
| Drowned Cantor | neck, hands | `it_choir_stall_greatstaff` (staff), `it_cantors_gloves` (cloth hands), `it_conductors_rapier` (rapier) | `uq_cantors_tuning_fork` | `it_cantors_baton_toy` |
| Captain Grimwater | chest, legs | `it_widows_due_cutlass` (sword), `it_grimwater_longcoat` (light chest), `it_powder_keg_shield` (shield) | `leg_grimwaters_last_broadside` | `it_mount_widows_due_skiff`, `it_grimwaters_chart` (parley) |
| Pearl Twins | head, neck | `it_mirrored_greatsword` (2H sword), `it_nacre_circlet` (cloth head), `it_pearlhide_helm` (medium head) | `uq_pearl_and_nacre` | `it_pearl_nacre_earrings` |
| Abbess Marenne | chest, head | `it_baptismal_vestments` (cloth chest), `it_font_warden_halberd` (polearm), `it_wimple_of_the_deep` (light head) | `uq_abbess_bell_staff` | — |
| The Choirmaster | head, chest, legs | `it_ninefold_gaze_staff` (staff), `it_tentacle_lash_whip` (1H flail, if page 08 keeps flails — else mace), `it_quire_plate` (heavy chest), `it_deep_verse_orb` (orb) | `leg_choirmasters_ninth_eye` | `it_mount_choir_leviathan` |
| The Unsung | any token | `it_stillwater_robes` (cloth chest), `it_echo_blades` (dual daggers) | `leg_the_unsung_note` | `it_mount_still_water_heron`, `it_unsung_voice` |

**Feats of r03:** eight hard-mode feats; `ft_r03_who_sang_the_last_note`; `ft_r03_deathless_<boss>` ×8;
`ft_r03_speed` (75 minutes); `ft_r03_parley` (win the Choirmaster fight with Grimwater's ship); **playful:**
`ft_r03_perfect_pitch` (a whole Cantor fight with no player ever in a RED lane). All hard modes → title
*"of the Drowned Choir"*. Mythic kills of the Choirmaster → title *"Deep Singer"*.

---

## 6. r04 — The Ember Court

### 6.1 At a glance

| Field | Value |
|---|---|
| id | `r04_ember_court` |
| Level | 60 · **Normal 10** (flex 8–10, item level 66) · **Mythic 20** (item level 74) |
| Entrance | the Emberthrone, north of Last Light: the Cinder Stair up the side of the caldera to the palace gate |
| Bosses | 8 + 1 secret: Cinderjaw → Kennelmaster Varro with Scorch and Soot → the Three Petitioners → Forge-Queen Hesta → Lord Castellan Brandt → Vaelkyr the Emberwing Consort → the Ashen Herald → Kaedros the Ember King → *(secret)* Prince Aurel, the Heir in the Kiln |
| Checkpoints | ember shrines (a coal in a black iron bowl) |
| Raid set | **`set_emberlord_regalia`** — *The Emberlord Regalia* |
| New layers over r03 | **choices that carry forward** (Court Favour across bosses); **an allied boss** (the Petitioner you side with fights for you); **duels** (one player alone in a ring); **objects that turn a fight** (harpoon ballistae); **rebirth** (a boss that must be killed twice); **boss body change** (the King becomes a titan); a **timed walk** (a boss you must keep from reaching a door) |
| Mythic | one extra mechanic per boss (*Mythic:*), damage ×1.35, health ×2.85, 20 players |

**Court Favour (raid mechanic, new).** The Ember Court is three noble houses who hate the King and each other:
**Ash** (the widowed queen's house — grief, shields), **Iron** (the chancellor's house — order, constructs) and
**Flame** (the priesthood — fire, cleansing). Choices during the raid give Favour to one house (the raid header shows
three small banners with numbers). Whichever house has the **most Favour when the King is pulled** sends help in
the King fight (§6.13). Ties go to Ash.

| Choice | Where | Favour |
|---|---|---|
| Free the kennel pups or leave them caged | after Kennelmaster Varro | free: Ash +1 · leave: Iron +1 |
| Which Petitioner you side with | the Three Petitioners (the big one) | the chosen house +3 |
| Spare Hesta's apprentice | Forge-Queen Hesta, dialog | spare: Iron +1 · refuse: Flame +1 |
| Accept Brandt's duel honourably (one player enters the ring) or refuse (the raid rushes the ring) | Castellan Brandt | honourable: Iron +1 · rush: Flame +1 |
| Return the Consort's egg or smash it | after Vaelkyr | return: Ash +1 · smash: Flame +1 |

### 6.2 Lore

Kaedros was the last king of the old Wildmarch before the Crown Assembly. When the Assembly voted him out, he
walked into the Emberthrone's caldera with his court and did not come back — until the Ember Legion came down the
mountain with his banner, and the land north of Frostmantle started to burn. He did not survive the caldera: he
**bought** his way out of it. The price was his son. **Prince Aurel** was sealed in the royal kiln at the heart of
the palace so that his father's crown would never cool. The widowed queen, **Sabeth**, has sat at court ever since
as a petitioner — asking every year, politely, for her son back.

### 6.3 Attunement — `q_attune_ember_court` "A Petition in Ash"

| Step | Objective | Where |
|---|---|---|
| 1 | Report to `npc_ashwarden_tamsin` (needs `r03` final boss killed once, any difficulty) | Last Light |
| 2 | Clear `d13_cindergate` and `d14_ashen_reliquary` (Normal+) | Emberthrone |
| 3 | Find the Legion's **deserters** hiding in three lava-tube caves and get their testimony (each cave is a small solo/party instance with a mini-boss) | Emberthrone |
| 4 | Take the testimonies to the court's outer clerk (disguised: you wear a Legion tabard, `it_legion_tabard`, and must not be seen by patrols without it — a light stealth walk) | the Cinder Stair |
| 5 | Receive a **Court Writ** (`it_court_writ`) | the palace gate opens for you |
| Reward | 16 Oathstones; the Court Favour banners unlock on your raid header | |

### 6.4 Layout

```
  LAST LIGHT ─ Cinder Stair (switchbacks up the caldera wall) ─┐
                                                               ▼
                  ┌──────────────────────────────────────────────┐
                  │ THE PALACE GATE (cp0) — vendor                │
                  │  [B1] Cinderjaw walks the GATE ROAD, 90 m,   │
                  │   toward the inner gate  ────────────► ▓▓    │
                  └───────────────────────┬──────────────────────┘
                                          │ cp1
     ┌──────────────────┐   ┌─────────────▼─────────────┐
     │ THE KENNELS (B2) │◄──┤ THE OUTER WARD (trash)     │
     │ pit 40 m, cages  │   └─────────────┬─────────────┘
     └────────┬─────────┘                 │
              └───────────────┬───────────┘
                              │ cp2 (repair)
              ┌───────────────▼──────────────────────────────┐
              │ THE PETITION HALL (B3) — long hall, 3 daises  │
              │   Ash (W)       Iron (middle)       Flame (E) │
              └───────┬───────────────┬──────────────┬───────┘
         ┌────────────▼───┐   ┌───────▼───────┐   ┌──▼──────────────┐
         │ THE ROYAL FORGE│   │ THE TILTYARD  │   │ THE EYRIE CRATER│
         │ (B4) lava       │   │ (B5) duel ring│   │ (B6) open to sky│
         │ channels        │   │ banners       │   │ ballistae ×4    │
         └────────────┬───┘   └───────┬───────┘   └──┬──────────────┘
                      └───────────────┼──────────────┘  (B4, B5, B6 in any order)
                                      │ cp — the Ash Gallery
              ┌───────────────────────▼──────────────────────┐
              │ THE ASH GALLERY (B7) — a pyre-lined gallery   │
              └───────────────────────┬──────────────────────┘
                                      │ cp7 (repair)
              ┌───────────────────────▼──────────────────────┐
              │ THE EMBER THRONE (B8) — 70 m round throne hall│
              │  floor of cinder tiles; lava moat round it    │
              └───────────────────────┬──────────────────────┘
                                      ▼ (secret: behind the throne, the Kiln)
                              ┌──────────────────┐
                              │ THE ROYAL KILN    │ secret, 36 m, a dome
                              └──────────────────┘
```

### 6.5 Trash

| id | Name | Body | Where | Health N / M | Abilities |
|---|---|---|---|---|---|
| `m_ember_legionnaire` | Ember Legionnaire | `chibi2:human/fighter` in black-and-ember plate, `war_helm`, sword + shield | everywhere, packs of 3–4 | 90k / 255k | **Shield Line** — legionnaires side by side take 30% less damage; **Brand Strike** — tank 1,600 + burn |
| `m_ember_pyrecaller` | Legion Pyrecaller | `chibi2:orc/pyromancer`, ember robes | packs | 70k / 200k | **Pyre** (gold, 2.5 s) — 8 m circle fire, 2,400; **Ignite Ally** — a legionnaire's weapon burns (+30% damage) — **dispel** (magic) |
| `m_ember_crossbow` | Legion Arbalest | `chibi2:human/ranger`, crossbow | walls, balconies | 60k / 170k | **Bolt Line** — 30 m × 2 m line, 1,800; line of sight |
| `m_humanoid_court_courtier` | Poisoner Courtier | `chibi2:elf/rogue`, silk court coat, `top_hat` | Petition Hall, Ash Gallery | 55k / 155k | **Gift** — a poison (curse) on a healer, 400/s 10 s; **Vanish** at 50% |
| `m_humanoid_court_guard` | Court Guard | `chibi2:human/knight`, `great_helm` gilded, halberd | Petition Hall doors, throne approach (Elite) | 320k / 910k | **Halberd Sweep** — 180° 8 m, 2,600; **Hold the Door** — immune to knockback, taunts the nearest non-tank if its tank is > 10 m away |
| `m_construct_forged_legionnaire` | Forged Legionnaire | `creature:golem ×1.8`, black iron `#2a2a2e`, eyes `#ff8a20` | Royal Forge | 160k / 455k | **Forge Heat** — 6 m aura, 200/s; **Quench Weakness** — takes +50% from ice / water abilities |
| `m_construct_obsidian_sentinel` | Obsidian Sentinel | `creature:golem ×2.6`, obsidian, lava seams | Palace Gate, throne approach (Elite) | 420k / 1.2M | **Obsidian Shards** — Targeted 5 m ×3, 2,000; **Reflect** — 30% of spell damage back while its shield glows |
| `m_elemental_cinder_elemental` | Cinder Elemental | `creature:elemental ×2.4`, fire | Outer Ward, Ash Gallery | 140k / 400k | **Flare** — 10 m circle Danger zone at 30%, 2,800; leaves a Void zone |
| `m_elemental_living_cinder` | Living Cinder | `creature:wisp ×1.0`, orange | Ash Gallery (swarms of 8) | 12k / 34k | **Kindle** — explodes on a player, 700; many |
| `m_fiend_ember_imp` | Ember Imp | `creature:imp ×1.2`, red | Outer Ward, Kennels | 30k / 85k | **Firebolt** 900; **Blink** behind casters |
| `m_beast_ash_hound` | Ash Hound | `creature:hound ×1.8`, charcoal `#2a2420` with ember eyes | Kennels, Outer Ward | 75k / 215k | **Fixate** on a random player 8 s; **Scorched Bite** — burn |
| `m_beast_magma_salamander` | Magma Salamander | `creature:crocodile ×2.0`, `#3a1a10` with lava `#ff6a20` seams | Royal Forge channels | 180k / 510k | **Lava Wallow** — becomes untargetable in lava for 4 s; **Spit** — 6 m Void zone |
| `m_dragonkin_fire_whelp` | Fire Whelp | `creature:drake ×1.2`, red-gold | Eyrie Crater; Vaelkyr's adds | 45k / 130k | **Whelp Breath** — 30° cone 8 m, 1,200; flies |
| `m_dragonkin_emberwing_drake` | Emberwing Drake | `creature:drake ×2.6`, `wings` on | Eyrie approach (Elite) | 380k / 1.08M | **Wing Gust** knockback 8 m; **Cinder Breath** — 60° 14 m, 3,000 |

### 6.6 Boss 1 — Cinderjaw, the Gate That Walks

| Field | Value |
|---|---|
| id | `b_cinderjaw` · body `creature:titan ×4.8`, body `#1e1a1a` obsidian, belly `#3a2a20`, accent `#ff6a20` lava seams, eyes `#ffb040`; a portcullis grille for a jaw |
| Health | **1,185,000 / 3,375,000** · Enrage — **the inner gate**: he walks the 90 m Gate Road at 0.25 m/s toward it (about 6:00). If he reaches it, *Gate Shut*: lethal to all |
| Rule | **Stagger to stop him:** every interrupt, stun or knockback on him (from a list of 30-class abilities, page 06) **pushes him back 1.5 m** (bosses are normally immune; he is not, he is a door). Damage alone does not stop him |

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Twin Hammers** `b_cinderjaw_twin_hammers` | Tank (two tanks at once) | he strikes **both** tanks in one swing; they must be **≥ 8 m apart** or both take the other's hit too | — | 2,600 each (T 42%) | tanks stand at his two fists, 8+ m apart (`wm_sun` / `wm_moon` on the road) |
| **Portcullis** `b_cinderjaw_portcullis` | Danger zone | a line 30 m × 4 m across the road, RED, then a **burning grille wall** stands there 20 s (blocks movement) | 2.0 s | 3,000 (83%) | do not be under it; do not get cut off behind it |
| **Magma Vent** `b_cinderjaw_vent` | Void zone | 4 circles 5 m under random players, then permanent while he lives | 1.5 s | 350 / tick | drop them **behind** him (he walks away from them) |
| **Gatehouse Heat** `b_cinderjaw_heat` | Soak | ORANGE 6 m, 4 pips (Mythic 8), directly in front of him | 3.0 s | 8,000 split; missed = Room-wide 3,000 and **he steps forward 5 m** | soak in front of him |
| **Grind Forward** `b_cinderjaw_grind` | — | at 50% and 25% he speeds up to 0.4 m/s for 20 s | 2 s | — | save staggers for these |

Mythic: **Molten Jaw** — every 30 s his jaw opens and a 60° cone 20 m burns in front (RED, 2.0 s, 4,000); the soak
is right in front of him, so soakers must time it. Lines (the Narrator; he is a gate): pull *"The gate unhooks
itself from the wall and steps forward."*; Grind *"**It leans into the road.**"*; death *"It falls across the road,
and becomes a bridge."*

**Hard mode — `hm_b_cinderjaw` "Let It Walk."** Armed by opening the inner gate before the pull (the lever at the far
end): the road is **60 m** instead of 90 m. Drop `it_cinderjaw_portcullis_shield` (a transmog shield skin) 25%. Feat
`ft_r04_let_it_walk`.

### 6.7 Boss 2 — Kennelmaster Varro, with Scorch and Soot

| Field | Value |
|---|---|
| id | `b_kennelmaster_varro` (with `b_hound_scorch`, `b_hound_soot`) · Varro `chibi2:orc/tactician`, a whip (new held part `fh_whip` — add it to `avatar-3d/js/chibi2-weapon-ids.js`; until then `fh_sabre`), `bone_headdress`, leather apron, `scale 1.6`; Scorch `creature:hound ×3.2` flame-orange (`burn` aura); Soot `creature:hound ×3.2` black with smoke (`blind` sprites) |
| Health | Varro **600,000 / 1,710,000**; each hound **367,500 / 1,047,500** (total 1,335k / 3,805k) · Enrage 8:30 — *Loose the Kennels*: all cages open |
| Arena | the Kennels: a sunken pit 40 m round, 10 cages on the rim |
| Rule | **Pack:** if Scorch and Soot are within 10 m of each other they gain **Pack Frenzy** (+50% damage, stacks each 5 s). **Varro** buffs whichever hound he is nearest (*Good Dog*, +20% damage). When Varro dies both hounds go berserk (+30% speed) — kill order: hounds first, Varro last, or Varro between the two hounds |

| Ability | Source | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|---|
| **Maul** | Scorch, Soot | Tank | melee | — | 2,000 each | one tank per hound; keep them apart |
| **Fire Trail** `b_hound_scorch_trail` | Scorch | Void zone | Scorch leaves a 2 m burning trail wherever it runs, 20 s | — | 300 / tick | the Scorch tank walks it in a tight circle at one edge |
| **Smoke** `b_hound_soot_smoke` | Soot | Void zone (blind) | 8 m smoke cloud around Soot every 30 s, 12 s | 1.5 s | 150 / tick + Blind | ranged step out; the tank moves Soot out of it |
| **Brand** `b_kennelmaster_varro_brand` | Varro | Targeted, Kite | a player is **Branded** (marked aura): both hounds fixate them for 8 s, ignoring the tanks | 2.0 s | 2,000 per bite | the branded player kites both hounds **apart** (run between them, not away from both) and uses a movement ability; tanks retake at the end |
| **Whip Crack** `b_kennelmaster_varro_whip` | Varro | **Interrupt (gold)** | cast 2.0 s: both hounds leap to him (merging the pack) | 2.0 s | — | interrupt |
| **Kennel Doors** `b_kennelmaster_varro_doors` | Varro | Adds | 2 cages open: 2 `m_beast_ash_hound` each | 3 s | as trash | area damage |
| **Crack of the Lash** `b_kennelmaster_varro_lash` | Varro | Danger zone | line 20 m × 3 m from him | 1.5 s | 2,400 | sidestep |

After Varro dies, the raid can **free the pups** (interact with the 10 cages: *Ash +1*) or leave them (*Iron +1*).
Mythic: **Twin Brand** — two players branded, one per hound. Lines: pull *"Hungry, my darlings? So hungry."*; Brand
*"**Fetch, darlings — THAT one!**"*; Whip *"**Heel!**"* (the hint to interrupt); death *"Run… run, darlings…"*

**Hard mode — `hm_b_kennelmaster_varro` "Muzzles Off."** Armed by stealing the hounds' muzzles from the tack wall
(interact) before the pull. Pack range 15 m; Brand every 20 s. Drop `it_mount_ash_hound` (`creature:hound ×2.2`
mount, ember eyes) 4%. Feat `ft_r04_muzzles_off`.

### 6.8 Boss 3 — The Three Petitioners

| Field | Value |
|---|---|
| id | `b_three_petitioners` (encounter): `b_petitioner_sabeth` "Queen Sabeth of the House of Ash" (`chibi2:elf/warlock`, grey mourning gown, black veil `hood`, held `orb`), `b_petitioner_dorrin` "Chancellor Dorrin of the House of Iron" (`chibi2:dwarf/knight`, `great_helm` gilded, hammer + tower shield), `b_petitioner_oruk` "Flame-Priest Oruk of the House of Flame" (`chibi2:orc/pyromancer`, `bone_headdress`, staff); `scale 1.7` each |
| Health | **740,000 / 2,110,000 each hostile** (two hostile = 1,480k / 4,220k) · Enrage 8:00 — *Contempt of Court* |
| Arena | the Petition Hall, 80 × 24 m, three daises (west, middle, east) |

**Dialog opportunity — `dlg_b_three_petitioners_choose`** (at the pull — this is how the fight starts). The three
turn to the raid: Sabeth *"You have come to petition the King. So have we. Stand with me and I will see you
heard."* Dorrin *"The court needs order. Stand with Iron."* Oruk *"The fire cleans. Stand with Flame."*

| Reply | Result |
|---|---|
| 1. *Say nothing.* | **all three** fight the raid (total health 2,220k / 6,330k), no Favour — the hardest version |
| 2. *"We stand with Ash."* | Sabeth fights **with** the raid (an allied NPC, shields a random player for 20% max health every 15 s); Dorrin and Oruk fight. Ash +3 |
| 3. *"We stand with Iron."* | Dorrin tanks one hostile for the raid (holds it 20 s at a time, then it returns to a raid tank); Sabeth and Oruk fight. Iron +3 |
| 4. *"We stand with Flame."* | Oruk burns adds and removes one Void zone every 10 s; Sabeth and Dorrin fight. Flame +3 |

The allied petitioner **can die** (it has 500k health and the hostiles target it 20% of the time). If it dies, its
house loses the 3 Favour.

| Ability | Petitioner | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|---|
| **Widow's Shroud** `b_petitioner_sabeth_shroud` | Sabeth | Void zone | circle 6 m PURPLE-black of grey ash, follows the targeted player for 6 s | 1.5 s | 400 / tick | the target runs a line away from the group |
| **Grief** `b_petitioner_sabeth_grief` | Sabeth | **Interrupt (gold)** | cast 3.0 s | 3.0 s | Sleep on 3 players 6 s | interrupt |
| **Veiled** `b_petitioner_sabeth_veiled` | Sabeth | Dispel | a 40k absorb on another petitioner | — | — | purge it (magic dispel) |
| **Iron Decree** `b_petitioner_dorrin_decree` | Dorrin | Soak | ORANGE 5 m, 3 pips (Mythic 6) | 3.0 s | 7,000 split | soak |
| **Shield Bash** `b_petitioner_dorrin_bash` | Dorrin | Tank swap | melee | — | 2,200 + **Dazed** | swap at 2 |
| **Order of Arrest** `b_petitioner_dorrin_arrest` | Dorrin | Tether | WHITE chain from Dorrin to a player; they cannot move more than 12 m from him for 10 s | 1.8 s | — | fine unless combined with Oruk's Purge (below) — the tethered player's position may force them into it; call it |
| **Purging Fire** `b_petitioner_oruk_purge` | Oruk | Danger zone | cross 40 m × 5 m centred on Oruk, RED | 2.0 s | 3,200 | step into a diagonal |
| **Ember Rite** `b_petitioner_oruk_rite` | Oruk | Adds | 3 `m_elemental_living_cinder` per cast | 2 s | as trash | area damage |
| **Cleanse** `b_petitioner_oruk_cleanse` | Oruk | Room-wide | every 45 s, removes all buffs from the raid (not debuffs) | 2.0 s | 1,000 | re-buff after |

**Kill rule:** hostile petitioners must die within 20 s of each other (the last one standing gains +10% per
10 s after the first dies). Lines: each on a teammate's death — Sabeth *"Another widow's weed."*, Dorrin *"Order is
kept."*, Oruk *"Ash to ash."* Death of the last hostile: *"Take your petition to the King, then. He burns them
unread."*

**Hard mode — `hm_b_three_petitioners` "No Side."** Armed by picking reply 1 (say nothing): all three hostile is the
hard mode (no separate trigger). Drop `uq_petition_of_the_three_houses` 15%. Feat `ft_r04_no_side`.

### 6.9 Boss 4 — Forge-Queen Hesta

| Field | Value |
|---|---|
| id | `b_forgequeen_hesta` · body `chibi2:dwarf/runesmith`, `rune_helm` black iron, held `fh_hammer` with a glowing rune, leather apron, `rune_halo` in ember; `scale 2.0` |
| Health | **1,480,000 / 4,220,000** · Enrage 9:00 — *Pour*: every channel floods |
| Arena | the Royal Forge, 54 × 40 m; the floor is cut by **six lava channels** (3 m wide) running east–west; iron bridges cross them at fixed points |

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Hammerfall** `b_forgequeen_hesta_hammerfall` | Tank swap | melee + 4 m splash | — | 2,400 + **Forge-Marked** (+10% fire damage taken) | swap at 3 |
| **Open the Sluices** `b_forgequeen_hesta_sluices` | Danger zone (lines) | 2–3 channels overflow: each becomes a RED band 10 m wide (the channel + 3.5 m each side) for 8 s | 2.0 s | 3,400 + 600 / tick while inside | stand between overflowing channels; the pattern changes every 20 s |
| **Rune of Fire** `b_forgequeen_hesta_rune_fire` | Targeted | a fire rune (icon: flame) on 3 players: circle 6 m YELLOW | 2.0 s | 2,500 to all inside | spread |
| **Rune of Iron** `b_forgequeen_hesta_rune_iron` | Soak | an iron rune (icon: anvil) on 1 player: ORANGE 5 m, **4 pips** around them | 3.0 s | 8,000 split | stack on the iron rune player |
| **Rune of Binding** `b_forgequeen_hesta_rune_binding` | Tether | a chain rune (icon: link) on 2 players: WHITE tether that must stay **between 6 m and 16 m** long for 8 s | 1.8 s | too short or too long: 2,000 each per second | hold the distance; the tether turns red at the limits |
| **Forged Legion** `b_forgequeen_hesta_legion` | Adds | 2 `m_construct_forged_legionnaire` from the moulds | 3 s | as trash | kill them **in an overflowing channel's band** (they take +100% there, and they are immune to damage over time) |
| **Anneal** `b_forgequeen_hesta_anneal` | Room-wide | at 60% and 30% | 3.0 s | 2,000 + all runes on the raid detonate at once | the raid must be in position for all three rune types at once (spreads, the soak stack and the tether pair) |

The runes appear **one icon per target** over their heads and on the raid frame; Mythic adds **Rune of Ash**
(icon: skull): the target must stand in an overflowing channel's band for 1 s to clear it, or it explodes for
6,000 on the raid.

**Dialog opportunity — `dlg_b_forgequeen_hesta_apprentice`** (at 30%). A young dwarf runs out of the moulds and
throws himself in front of her: *"Please — she makes their swords because he has her clan in the Kiln! Please!"*
Hesta: *"Get back, Tobbin!"*

| Reply | Result |
|---|---|
| 1. *Say nothing.* | the apprentice is knocked aside; the fight goes on |
| 2. *"Step aside, boy. We'll free your clan."* | Hesta stops for 8 s: *"…Then do it fast."* She fights on at −20% damage for the rest. Iron +1. She drops the **Kiln Key Fragment** (`it_kiln_key_fragment`) — one of the two halves of the secret key (§6.14) |
| 3. *"Your clan chose the King."* | Hesta gains +20% damage; Flame +1 |

Lines: pull *"Out of my forge!"*; Sluices *"**Let it run!**"*; runes *"**Hold still. I'm writing on you.**"*; Anneal
*"**Now — all of it holds, or all of it breaks!**"*; death *"Tobbin… the clan…"*

**Hard mode — `hm_b_forgequeen_hesta` "Every Rune."** Armed by lighting all six forge braziers before the pull.
Every rune type lands at once each cycle. Drop `it_hestas_rune_hammer_skin` 25%. Feat `ft_r04_every_rune`.

### 6.10 Boss 5 — Lord Castellan Aurel Brandt

| Field | Value |
|---|---|
| id | `b_castellan_brandt` · body `chibi2:human/knight`, `great_helm` with a flame crest, `fh_greatsword` ember, cape `#8a1a10`, `scale 1.9` |
| Health | **1,630,000 / 4,645,000** · Enrage 9:00 — *Champion's Fury* |
| Arena | the Tiltyard, 60 × 40 m sand yard with a **duel ring** (12 m, marked by stakes) in the middle and 4 banner poles |

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Champion's Cut** `b_castellan_brandt_cut` | Tank swap | melee | — | 2,800 (T 45%) + **Humbled** (−10% damage dealt, stacks) | swap at 2 |
| **Trial by Combat** `b_castellan_brandt_trial` | **Duel** | every 60 s: he names a non-tank player (banner: *"{target}, I challenge you!"*). The two are pulled into the ring; a BLUE barrier encloses it for **15 s**; nobody else can enter | 3.0 s | inside: his normal attacks at 40% | the challenger survives 15 s **and** deals at least 3% of his health — he takes +200% damage from the challenger. Fail either: the raid is **Shamed** (−15% damage, 30 s) |
| **Rush the Ring** (player choice) | — | during a duel, 3 players may hit the barrier (100k) to break it | — | — | breaking it ends the duel early — no Shame — but **Flame +1** and he gains **Dishonoured** (+20% damage, permanent) |
| **Banners of the Legion** `b_castellan_brandt_banners` | Adds / Void zone | 2 banner-bearers plant banners (a 10 m aura on each banner: Legion adds +30% damage; standing in it: 300 / tick for players) | 3 s | — | kill the bearers (80k); banners stay until destroyed (60k) |
| **Charge** `b_castellan_brandt_charge` | Danger zone | line 40 m × 5 m to the farthest player | 2.0 s | 3,600 | sidestep |
| **Rally** `b_castellan_brandt_rally` | **Interrupt (gold)** | cast 3.0 s: heals him 5% per standing banner | 3.0 s | — | interrupt |

**Mythic:** the duel partner is chosen by **lowest item level**. Honourable duels all fight: *Iron +1* (once).
Lines: pull *"The King's peace. I am it."*; Trial *"**{target}! Face me, alone!**"*; Charge *"**Clear the yard!**"*;
death *"A fair fight… I thank you for that."*

**Hard mode — `hm_b_castellan_brandt` "Three Challenges."** Armed by striking his shield on the Tiltyard gate. Duels
every 40 s, 20 s long. Drop `uq_brandts_champion_plume` (a helm plume unique) 15%. Feat `ft_r04_three_challenges`.
**If Ash is allied** (the Petitioners reply 2) and Sabeth still lives: Brandt carries **the Prince's Signet**
(`it_prince_aurel_signet`) — the second half of the secret (§6.14); it drops on his death.

### 6.11 Boss 6 — Vaelkyr, the Emberwing Consort

| Field | Value |
|---|---|
| id | `b_vaelkyr_emberwing` · body `creature:dragon ×6.5`, body `#8a2a1a`, belly `#f0b060`, accent `#2a0a08`, eyes `#ffd040`; `burn` aura on the wings |
| Health | **1,780,000 / 5,075,000** · Enrage 10:00 — *Sky Burns* |
| Arena | the Eyrie Crater, 70 m, open to the sky; 6 broken pillars (cover); 4 **harpoon ballistae** on the rim |
| Phases | P1 100–70% *Ground*; P2 70–40% *Air*; P3 40–0% *Grounded* (wing torn, both sets of abilities) |

| Ability | Phase | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|---|
| **Rend** `b_vaelkyr_rend` | P1, P3 | Tank swap | melee | — | 3,000 + **Seared** burn stack | swap at 3 |
| **Tail Lash** `b_vaelkyr_tail` | P1, P3 | Danger zone | cone 90° 18 m **behind** her | 1.8 s | 3,200 + knockback | never stand behind her (the other rule of dragons: never in front either) |
| **Cinder Breath** `b_vaelkyr_breath` | P1, P3 | Danger zone | cone 60° 30 m in front | 2.0 s | 4,000 | tanks turn her to the wall; everyone at her sides |
| **Deep Breath** `b_vaelkyr_deep_breath` | P2 | Danger zone (lethal) | she flies across the crater breathing: a band 20 m wide from one rim to the other, RED | **3.0 s** | **Lethal** | get out of the band — the band's edges are drawn from the start of the warning |
| **Fireball Rain** `b_vaelkyr_fireballs` | P2 | Targeted + Void zone | circle 5 m YELLOW on 5 players; each landing leaves a fire patch Void zone (40 s) | 1.8 s | 2,200 + 400 / tick | spread and drop patches at the rim |
| **Whelps** `b_vaelkyr_whelps` | P2 | Adds | 6 `m_dragonkin_fire_whelp` | 3 s | as trash | area damage |
| **Harpoon** (player action) | P2 | Object | a ballista (interact 3 s to fire) hits her for 2% of her health; **two hits within 10 s** pull her down for 8 s (*Grounded*, +50% damage taken) | — | — | 4 players on ballistae; she burns one ballista every 30 s (repair: 5 s) |
| **Crater Collapse** `b_vaelkyr_collapse` | P3 | Line of sight | Room-wide wing-beat of fire | 3.0 s | 3,600 | stand behind a broken pillar |

After she dies, her **egg** lies in the nest: return it to the nest (*Ash +1*) or smash it (*Flame +1*; smashing
drops a cosmetic `it_emberwing_eggshell_helm` 100%). Mythic: **Flame Walls** in P3 — 2 walls of fire sweep the crater
(moving waves with a BLUE gap). Lines: pull *"My King sleeps poorly. You will not wake him."*; Deep Breath *"**Nothing
under my wings survives!**"*; grounded *"**Chains — on ME?**"*; death *"Kaedros… I… burned for you."*

**Hard mode — `hm_b_vaelkyr_emberwing` "No Harpoons."** Armed by cutting the ballistae ropes before the pull. She comes
down only by damage: at 55% and 45%. Drop `it_mount_emberwing_whelp` (a young `creature:dragon ×1.4` winged mount: runs and glides before Riding IV, flies after (page 07, level 60))
2%. Feat `ft_r04_no_harpoons`.

### 6.12 Boss 7 — The Ashen Herald

| Field | Value |
|---|---|
| id | `b_ashen_herald` · body `creature:phoenix ×5.0`, body `#6a6a6a` ash-grey, belly `#ff9a40`, accent `#2a2a2a`, eyes `#ffe060`; flames only at the wingtips until it is reborn |
| Health | **1,780,000 / 5,075,000** (first life 1,100k / 3,135k; egg 180k / 510k; second life 500k / 1,430k) · Enrage 9:30 — *Everything to Ash* |
| Arena | the Ash Gallery, 80 × 20 m, lined with 12 pyres |
| Rule | **Rebirth:** at 0% of its first life it becomes an **Ash Egg** (a target in the middle of the gallery). Destroy the egg within **30 s** → it is reborn **weakened** (second life as listed). Fail → it is reborn at **50%** of its first life, and the egg cycle repeats |

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Ash Talon** `b_ashen_herald_talon` | Tank swap | melee | — | 2,600 + **Ashen** (−5% max health per stack) | swap at 3 |
| **Pyre Light** `b_ashen_herald_pyre` | Danger zone | every 30 s the herald lights 2 pyres; each lit pyre fires a 6 m RED circle around itself every 10 s | 2.0 s | 3,000 | the gallery shrinks as pyres light; the only way to put one out is **Ash Fall** (next row) |
| **Ash Fall** `b_ashen_herald_ash` | Void zone → Beneficial | grey ash circles 4 m fall on 4 players; standing on ash is a Void zone (200 / tick) **but** a player standing on ash beside a lit pyre smothers it in 5 s | 1.5 s | 200 / tick | 2 players sacrifice some health to smother the pyres |
| **Cinder Storm** `b_ashen_herald_storm` | Room-wide | the gallery fills with sparks | 2.5 s | 2,000 + 500 / 5 s for 10 s | heal |
| **Egg Pulse** `b_ashen_herald_egg` | Room-wide (egg phase) | the egg pulses every 5 s | — | 1,500, +20% each pulse | kill the egg in 30 s (a damage check) |
| **Reborn Flame** `b_ashen_herald_reborn` | Soft enrage (second life) | its flames grow: +8% damage every 10 s | — | — | finish it |

Mythic: in the egg phase, 6 `m_elemental_living_cinder` spawn around the egg and each **heals** it 3% on reaching it.
Lines (it only screams; the Narrator): *"The pyres lean toward it."*; egg *"**The ash knits itself together.**"*; death
*"It does not come back. The gallery goes dark."*

**Hard mode — `hm_b_ashen_herald` "Three Lives."** Armed by lighting all 12 pyres before the pull. It must be killed
three times (two eggs). Drop `it_mount_ashen_phoenix` (`creature:phoenix ×2`, grey with ember wings; winged mount: runs and glides before Riding IV, flies after (page 07, level 60)) 1%. Feat
`ft_r04_three_lives`.

### 6.13 Boss 8 — Kaedros, the Ember King

| Field | Value |
|---|---|
| id | `b_ember_king_kaedros` · body P1–P2 `chibi2:human/pyromancer`, hat `crown` gold `#e8b830` with ember gems, held `fh_greatsword` burning, cape `#8a1a10`/`#e8b830`, `rune_halo` ember; `scale 2.4`. P3: he sits and the throne closes over him → `creature:titan ×5.5`, body `#2a1a14`, belly `#ff6a20`, accent `#0a0604`, eyes `#fff0a0`, `core` blazing |
| Health | **2,965,000 / 8,450,000** · Enrage 12:00 — *The Last Light Goes Out*: Room-wide lethal every 5 s |
| Arena | the Ember Throne, a 70 m round hall; a lava moat round the edge (a fall is death); the floor is **cinder tiles** (5 m hexes) |
| Phases | P1 100–70% *The Court Assembled*; P2 70–40% *The Burning Hall*; P3 40–10% *The King Unmade*; P4 10–0% *Last Light* |

**Favour help** (§6.1): Ash — Queen Sabeth shields the whole raid for 25% max health **once per phase** (she calls
it: *"Down, all of you — behind my veil!"*); Iron — Chancellor Dorrin's two iron golems tank the King's adds in P2;
Flame — Oruk's fire makes Cinder Tiles harmless for 20 s once per phase.

**P1 — The Court Assembled**

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Kingsfire Blade** `b_ember_king_blade` | Tank swap | melee, 5 m splash | — | 3,400 (T 55%) + **Crownburn** (fire damage taken +15%) | swap at 2 |
| **Royal Decree** `b_ember_king_decree` | Targeted | circle 8 m YELLOW on 2 players; on landing a tile turns to **lava** (Void zone 500 / tick) for the rest of the fight | 2.0 s | 3,000 | spread **to the edge** of the hall so the lava does not take the middle |
| **Court of Flame** `b_ember_king_court` | Adds | 4 `m_humanoid_court_guard` rise from the floor | 3 s | as trash | off-tank collects them |
| **Crown Heat** `b_ember_king_crown_heat` | Room-wide | every 20 s | 2.0 s | 1,800 | heal |

**P2 — The Burning Hall (70–40%)**

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Cinder Tiles** `b_ember_king_tiles` | Checkerboard | half the hex tiles (a honeycomb checkerboard) glow RED | 1.8 s | 3,800 | stand on unlit tiles; flips every 10 s |
| **Legion Muster** `b_ember_king_muster` | Adds | 2 `m_ember_pyrecaller` + 4 `m_ember_legionnaire` | 3 s | as trash | interrupt the pyrecallers |
| **Tax of Ash** `b_ember_king_tax` | Soak | 2 ORANGE circles 6 m, **4 pips** each (Mythic 8) | 3.0 s | 10,000 split each; missed = Room-wide 4,000 + he heals 3% | two teams soak |
| **Firebrand** `b_ember_king_firebrand` | Tether | WHITE line between him and the farthest player: 800/s to them while it lasts; if they are **within 10 m** of another player it jumps to that player at full damage | 1.8 s | 800/s, 10 s | the target stays alone; healers keep them up |

**P3 — The King Unmade (40–10%).** The throne closes over him; he becomes the titan.

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Throne Fist** `b_ember_king_fist` | Tank swap | melee, 8 m splash | — | 4,000 (T 65%) + knockback 6 m (toward the moat if you are careless) | swap at 2; the tank's back to the middle |
| **Molten Crown** `b_ember_king_molten_crown` | Danger zone (donut) | RED from 10 m to 35 m around him; safe inside 10 m | 2.5 s | 5,000 | in close |
| **Eruption** `b_ember_king_eruption` | Danger zone (lethal) | 6 circles 8 m RED | **3.0 s** | **Lethal** | out |
| **Pull of the Kiln** `b_ember_king_kiln_pull` | Knockback (inward) | the whole raid is pulled 2 m/s toward him for 4 s | 2.0 s | — | walk out; Molten Crown comes after the pull every other time — watch the order |
| **Ember Wake** `b_ember_king_wake` | Moving wave | rings of fire rolling out from him, one BLUE 8 m gap each | 2.0 s | 3,600 | through the gap |

**P4 — Last Light (10–0%).** His crown burns white. Every 6 s **Light of Last Light** (Room-wide 2,500, +15% per
cast). Every lava tile turns back to cinder (safe). The raid has ~40 s to finish him.

**Dialog opportunity — `dlg_b_ember_king_kneel`** (at 40%, before the throne closes). *"The Assembly voted me out
of my own kingdom. I voted myself back in. Kneel, and Last Light keeps its lamps another year."*

| Reply | Result |
|---|---|
| 1. *Say nothing.* | P3 |
| 2. *"We kneel."* (the whole raid must /kneel within 10 s) | he laughs and **does not** close the throne for 20 s — a free 20 s of P2 damage, but he takes 10% less damage for the rest of the fight |
| 3. *"Last Light keeps its own lamps."* | P3 as written; +1 item |
| 4. (the raid carries the **Prince's Signet** and the **Kiln Key Fragment**) *"Your son sends his regards."* | he stops: *"…Aurel?"* For 6 s he is **stunned** (the raid gets free damage) and his P4 Light starts 20% lower. On his death the throne cracks and the Kiln opens: the secret (§6.14) |

Lines: pull *"The court is in session. You are the accused."*; Decree *"**By my word, this ground burns!**"*; Tax
*"**Pay the tax of ash!**"*; P3 *"**Throne — take me up!**"*; Eruption *"**The mountain answers its king!**"*; P4
*"Last Light? There is only one light. MINE."*; death *"Aurel… it was… for the crown…"*

**Hard mode — `hm_b_ember_king_kaedros` "Unfavoured."** Armed by keeping every house's Favour **at 0** through the raid
(say nothing / refuse every choice, and fight all three Petitioners). No house help. Drop `it_mount_ember_throne_titan`
(a small walking throne on titan legs — a joke mount, `creature:titan ×1.0` with a chair) 2%. Feat `ft_r04_unfavoured`.

### 6.14 Secret boss — Prince Aurel, the Heir in the Kiln

**Unlock:** side with **Ash** at the Petitioners and keep Sabeth alive through that fight; get the **Kiln Key
Fragment** from Hesta (dialog reply 2); get the **Prince's Signet** from Castellan Brandt (drops only while Ash is
allied); pick reply 4 at the King; kill the King.

| Field | Value |
|---|---|
| id | `b_heir_in_the_kiln` · body `chibi2:human/paladin`, `scale 2.0`, skin replaced by **clear glass** with fire inside (`burn` aura + `glow`), `circlet` of cooled slag, no weapon — he fights with his hands and the kiln |
| Health | **3,320,000 / 9,465,000** · Enrage 10:00 — *Fired*: the kiln door shuts, lethal |
| Arena | the Royal Kiln: a 36 m dome; 6 **vents** in the floor; the walls glow |
| Twist | **Queen Sabeth** follows the raid in. She does not fight; she **kneels at the door** and must not die (8,000,000 health on Mythic, 3,000,000 on Normal; the prince's attacks sometimes aim at her). If she dies the fight **fails** |

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Glass Hands** `b_heir_in_the_kiln_hands` | Tank swap | melee | — | 3,200 + **Shards** bleed | swap at 3 |
| **Vent** `b_heir_in_the_kiln_vent` | Danger zone | 3 of the 6 vents: circle 7 m RED | 2.0 s | 4,000 | out |
| **Molten Glass** `b_heir_in_the_kiln_glass` | Void zone | circle 5 m PURPLE-black under 3 players, cools after 30 s into a **glass wall** (blocks, line of sight) | 1.5 s | 450 / tick | drop them in a ring, not across the door |
| **Anneal** `b_heir_in_the_kiln_anneal` | Soak → window | ORANGE 6 m, **5 pips** (Mythic 10), on him | 3.0 s | 12,000 split | on a full soak his glass is **Brittle** for 10 s: +100% damage taken. Missed = Room-wide 5,000 |
| **Cry for Mother** `b_heir_in_the_kiln_cry` | Body-block | a line of fire from him to Sabeth, drawn WHITE for 3 s | 3.0 s | 20% of Sabeth's health, or 3,000 to each player standing in the line (split) | 3+ players stand in the line |
| **Kiln Heat** `b_heir_in_the_kiln_heat` | Room-wide, soft enrage | every 10 s | — | 1,000, +5% each | — |
| **Shatter** `b_heir_in_the_kiln_shatter` | Targeted | at 50% and 20%: 5 players get YELLOW 6 m circles; glass walls within them shatter into shards (Danger zone 4 m around each wall, 2.0 s, 3,000) | 2.0 s | 2,500 + walls | the targets move away from glass walls |

**Dialog opportunity — `dlg_b_heir_in_the_kiln_mother`** (at 10%). Sabeth stands: *"Aurel. Aurel, it's me. You can
stop."* The prince: *"Mother? It's so hot, Mother."* Reply:

| Reply | Result |
|---|---|
| 1. *Say nothing.* | the fight ends normally at 0% |
| 2. *"Let her through."* (the raid stops all damage for 10 s) | Sabeth walks to him and the fight ends **as a win at 10%**: he cools and crumbles. Title *"Who Opened the Kiln"* plus Ash reputation +1,000. Full loot |
| 3. *"Stand back, Your Majesty."* | fight to 0%; +1 item; Sabeth weeps (no reputation) |

Lines: pull *"Is it morning? Father said it would be morning soon."*; Anneal *"**Make it stop being so hot!**"*; Cry
*"**MOTHER!**"*; death (reply 1/3) *"…cool…"*

**Hard mode — `hm_b_heir_in_the_kiln` "Sealed."** Armed by closing the kiln door behind the raid (a lever). Sabeth
stays outside: no Cry for Mother, but the dialog never comes and the enrage is 8:00. Drop `it_glass_prince_crown`
(head cosmetic) 30%. Feat `ft_r04_sealed`.

**Loot:** guaranteed `leg_kiln_heart`; `it_mount_glass_charger` (a glass-and-fire `creature:courser`) 2% per player;
title *"Who Opened the Kiln"*.

### 6.15 r04 loot

**Raid set — `set_emberlord_regalia` "The Emberlord Regalia"** — tokens `it_token_r04_<slot>` / `it_token_r04m_<slot>`;
pieces `it_emberlord_crown`, `…_robes` (chest), `…_legguards`, `…_gauntlets`, `…_treads`, `…_chain` (necklace).

| Role | 2 pieces | 4 pieces | 6 pieces |
|---|---|---|---|
| Tank | **+12%** armour and fire resistance | when a Tank-swap stack falls off you, heal **5%** of max health per stack | **Throne Guard:** taunting a boss gives the raid 5% damage reduction for 8 s (30 s cooldown) |
| Healer | overhealing is stored as a shield on the target, up to **10%** of their max health | every 5th heal is instant and free | **Last Light:** once per 90 s, when an ally within 30 m falls below 15% health, heal them for **40%** at once |
| Damage | **+8%** damage to enemies above 80% health | killing an add refunds **15%** of your longest cooldown | **Crownfire:** every 20 s your next hit brands the target: it takes **+10%** damage from the whole raid for 6 s |
| Support | allies within 15 m deal **+3%** damage | your buffs also grant a shield of **5%** max health | **Favour:** once per 60 s, pick an ally: they gain +15% damage or healing (their role) for 10 s |

| id | Name | Slot | Source | Power |
|---|---|---|---|---|
| `leg_kiln_heart` | The Kiln Heart | off-hand focus / shield | Prince Aurel (guaranteed) | you have **Anneal**: every 15 s, your next heal or damage spell is doubled and turns the target to glass for 2 s (enemies: +30% damage taken; allies: immune to damage) |
| `leg_crown_of_kaedros` | Crown of Kaedros | head | the Ember King (3%) | fire damage you deal leaves a burning tile (4 m) under the target for 6 s: **30%** of the hit per second to enemies on it |
| `leg_emberwing_pinion` | Emberwing Pinion | two-handed staff or bow | Vaelkyr (4%) | every 3rd cast sends a **Deep Breath** line 25 m × 4 m for **350%** weapon/spell damage |
| `uq_petition_of_the_three_houses` | Petition of the Three Houses | necklace | Petitioners hard mode (15%) | on entering combat, you receive one of Ash (a 10% shield), Iron (+10% armour) or Flame (+8% damage) at random for the fight |
| `uq_brandts_champion_plume` | Brandt's Champion Plume | head (heavy) | Brandt hard mode (15%) | when you are the only ally within 12 m of an enemy, you deal **+15%** damage to it |
| `uq_varros_leash` | Varro's Leash | hands | Varro (8%) | your pet or summons move and attack **15%** faster and fixate your target for 4 s after you hit it |
| `uq_cinderjaw_grille` | The Cinderjaw Grille | shield | Cinderjaw (8%) | blocking a hit pushes the attacker back **1.5 m** (bosses: 0.5 m, 5 s cooldown) |
| `uq_hestas_apprentice_hammer` | Tobbin's Hammer | one-handed hammer | Hesta (8%, or 25% if the apprentice was spared) | every 4th hit inscribes a rune on the target: the 5th hit detonates it for **150%** weapon damage in 4 m |
| `uq_ashen_herald_feather` | Feather of the Ashen Herald | necklace | Ashen Herald (8%) | once per 5 min, dying revives you at 20% health after 3 s (does not use the raid's combat revives) |

| Boss | Tokens | Epic items (`it_`) | Uniques / legendaries | Hard mode / other |
|---|---|---|---|---|
| Cinderjaw | hands, feet | `it_obsidian_gate_maul` (2H mace), `it_portcullis_greaves` (heavy legs), `it_lava_seam_wand` (wand) | `uq_cinderjaw_grille` | `it_cinderjaw_portcullis_shield` |
| Kennelmaster Varro | legs, hands | `it_kennel_whip` (1H), `it_houndmaster_jerkin` (medium chest), `it_scorch_collar` (necklace) | `uq_varros_leash` | `it_mount_ash_hound` |
| Three Petitioners | chest, neck | `it_sabeths_veil` (cloth head), `it_dorrins_seal_shield` (shield), `it_oruks_rite_staff` (staff) | — | `uq_petition_of_the_three_houses` |
| Forge-Queen Hesta | hands, head | `it_royal_forge_hammer` (2H hammer), `it_rune_etched_gauntlets` (heavy hands), `it_sluice_boots` (light feet) | `uq_hestas_apprentice_hammer` | `it_hestas_rune_hammer_skin`, `it_kiln_key_fragment` (dialog) |
| Castellan Brandt | chest, legs | `it_champions_greatsword` (2H sword), `it_tiltyard_lance` (polearm), `it_legion_banner_hauberk` (heavy chest) | — | `uq_brandts_champion_plume`, `it_prince_aurel_signet` (Ash only) |
| Vaelkyr | feet, head | `it_dragonbone_bow` (bow), `it_emberwing_scale_mail` (medium chest), `it_whelp_tooth_daggers` (daggers) | `leg_emberwing_pinion` | `it_mount_emberwing_whelp`, `it_emberwing_eggshell_helm` (smash) |
| Ashen Herald | legs, neck | `it_ash_feather_staff` (staff), `it_pyre_keepers_robe` (cloth chest), `it_cinder_orb` (orb) | `uq_ashen_herald_feather` | `it_mount_ashen_phoenix` |
| The Ember King | head, chest, feet | `it_kingsfire_greatsword` (2H sword), `it_ember_throne_plate` (heavy chest), `it_royal_decree_wand` (wand), `it_crown_heat_ring` (ring) | `leg_crown_of_kaedros` | `it_mount_ember_throne_titan` |
| Prince Aurel | any token | `it_glass_prince_gloves` (cloth hands), `it_kiln_door_shield` (shield) | `leg_kiln_heart` | `it_mount_glass_charger`, `it_glass_prince_crown` |

**Feats of r04:** nine hard-mode feats; `ft_r04_who_opened_the_kiln`; `ft_r04_deathless_<boss>` ×9; `ft_r04_speed`
(90 minutes); `ft_r04_every_house` (lead a King kill with each house's help, over three lockouts); **playful:**
`ft_r04_good_dog` (free the pups and have one follow you to the King — it sits by the throne). All hard modes →
title *"of the Ember Court"*. Mythic King → title *"Kingsbane"*.

---

## 7. r05 — Veilspire

### 7.1 At a glance

| Field | Value |
|---|---|
| id | `r05_veilspire` |
| Level | 60 · **Normal 20** (flex 15–20, item level 74) · **Mythic 20** (item level 82). The hardest content in the game |
| Entrance | Veilspire Isle, above the Spire Landing: the spire's broken root, where the Veil shows through the stone like water through ice |
| Bosses | 10 + 1 secret: the Threshold → Grey and Greyer → the Horologe → the Mirror Court → Anvarr the Hollow Titan → the Curator → the Many-Mouthed → Nhal the Starless → Saelith the Veilwarden → the Unwoven → *(secret)* the Marchheart |
| Checkpoints | Veil lamps (a lamp burning with no flame) |
| Raid set | **`set_veilwoven`** — *The Veilwoven Raiment* |
| Wings | released as three wings is a v2 option (§12): **Spire Root** (1–3), **Spire Halls** (4–7), **Spire Crown** (8–10 + secret) |
| New layers over r04 | **two realms at once** (the Waking and the Veil, the raid split between them); **the raid's own classes turned against it** (Mirror Court); **time** (rewinds and replays); **exam fights** that bring back mechanics from every earlier raid (the Curator); **lying voices** (the Many-Mouthed — the ground never lies, the boss sometimes does); **4 subgroups with different jobs**; mechanic density up to 6 on Mythic |

**The Veil (raid mechanic, new).** Every arena in Veilspire exists twice: the **Waking** (normal colours) and the
**Veil** (the same room drained to grey-blue, everything outlined in white). **Veil Rifts** (standing tears of white
light, 3 m) are in fixed spots; walking into one moves you to the other realm in 1 s.

| Rule | In the Waking | In the Veil |
|---|---|---|
| What you see | the Waking; Veil players are faint ghosts | the Veil; Waking players are faint ghosts; **hidden telegraphs** (marked *Veil-only* on this page) are visible |
| Damage from the other realm | none | none |
| Health drain | none | **Veil Drain**: 1% of max health per second, cannot be healed by Waking players |
| Time limit | — | **60 s**, then you are thrown out with **Veil Sickness** (cannot enter for 30 s; 20% max health damage) |
| Boss health | shared between realms unless a boss says otherwise | shared |
| Healing across | no | no — each realm needs its own healer |

The raid frame shows each player's realm (a small white eye icon for Veil players).

### 7.2 Lore

The Veil is the thin place between the Wildmarch and whatever is under it. Veilspire was built by the elves of the
Moonwell Circle (page 01) as a nail through the Veil to hold it shut, with **Saelith** as its warden. Something on
the other side — **the Unwoven** — has been pulling the threads of the world out through the nail for a hundred
years: that is what tore the Riftmarch, what woke the Choirmaster, what the Ember King bargained with. Every raid
before this one was fighting its edges. Behind all of it is the **Marchheart** — the land itself, asleep, dreaming
the Wildmarch; the Unwoven is eating the dream. Page 01 owns the main story; this page owns the fights.

### 7.3 Attunement — `q_attune_veilspire` "The Door With No Wall"

| Step | Objective | Where |
|---|---|---|
| 1 | Finish the main story's last chapter up to *"The Spire Landing"* (page 14) | Veilspire Isle |
| 2 | Bring `npc_veilfactor_ilo` the four **raid relics**: the **Ninefold Seal** (`it_ninefold_seal`, the Barrowking), the **Throne Shard** (`it_throne_shard`, Queen Ysmere), the **Choirbook Clasp** (`it_choirbook_clasp`, the Choirmaster), the **Crown Ember** (`it_crown_ember`, the Ember King). Each is a 100% quest drop from that final boss on any difficulty | earlier raids |
| 3 | The four relics are set in the **Veil Key** (`it_veil_key`) at the Spire Landing forge | the Spire Landing |
| 4 | Walk the Veil once alone: a solo scenario teaching Veil Rifts, Veil Drain and the 60 s limit (5 minutes) | Veilspire Isle |
| 5 | Open the root door | |
| Reward | 20 Oathstones; `it_veil_lens` (a HUD overlay: Veil-only telegraphs show faintly even in the Waking **for you**, at 30% opacity — the one advantage the attuned get) | |

### 7.4 Layout

```
                      THE SPIRE LANDING ── the root door
                                   │
     ════════════════ SPIRE ROOT (wing 1) ═══════════════
          ┌────────────────────────▼────────────────────────┐
          │ THE THRESHOLD (B1) — a round hall, 50 m, 4 rifts│
          └────────────────────────┬────────────────────────┘
                                   │ cp1
          ┌────────────────────────▼────────────────────────┐
          │ THE KENNEL OF MIST (B2) — two realms, one hunt   │
          └────────────────────────┬────────────────────────┘
                                   │ cp2 (repair)
          ┌────────────────────────▼────────────────────────┐
          │ THE CLOCK ROOM (B3) — a 12-segment clock face    │
          └────────────────────────┬────────────────────────┘
     ════════════════ SPIRE HALLS (wing 2) ═══════════════
          ┌────────────────────────▼────────────────────────┐
          │ THE MIRROR COURT (B4) — five mirrors, 60 m       │
          └────────────────────────┬────────────────────────┘
          ┌────────────────────────▼────────────────────────┐
          │ THE HOLLOW (B5) — Anvarr fills the hall; his     │
          │  open chest is a rift to the Heart chamber       │
          └────────────────────────┬────────────────────────┘
                                   │ cp5 (repair)
          ┌────────────────────────▼────────────────────────┐
          │ THE GALLERY OF THE FALLEN (B6) — four alcoves:   │
          │  bone, ice, water, fire                           │
          └────────────────────────┬────────────────────────┘
          ┌────────────────────────▼────────────────────────┐
          │ THE THROAT (B7) — a round pit of mouths           │
          └────────────────────────┬────────────────────────┘
     ════════════════ SPIRE CROWN (wing 3) ═══════════════
                                   │ cp7 (repair)
          ┌────────────────────────▼────────────────────────┐
          │ THE STARLESS OBSERVATORY (B8) — open to a black  │
          │  sky with the wrong stars; 70 m                   │
          └────────────────────────┬────────────────────────┘
          ┌────────────────────────▼────────────────────────┐
          │ THE WARDEN'S NAIL (B9) — the top of the spire     │
          └────────────────────────┬────────────────────────┘
                                   │ cp9
          ┌────────────────────────▼────────────────────────┐
          │ THE LOOM BEYOND (B10) — inside the Veil; floating │
          │  stone platforms over nothing                      │
          └────────────────────────┬────────────────────────┘
                                   ▼ (secret: the dream opens)
                        ┌───────────────────────┐
                        │ THE DREAMING MARCH     │ secret: the whole continent
                        │                        │ in miniature, 120 m
                        └───────────────────────┘
```

### 7.5 Trash

| id | Name | Body | Where | Health N / M | Abilities |
|---|---|---|---|---|---|
| `m_aberration_veil_shade` | Veil Shade | `creature:wraith ×1.6`, grey-blue, white outline | everywhere; exists in **both** realms (one body each, shared health) | 180k / 250k | **Grasp** — 1,800 + pulls toward the nearest rift; only damageable in the realm where its eyes glow |
| `m_aberration_veil_stalker` | Veil Stalker | `creature:saber_cat ×2.0`, translucent white | Spire Root | 260k / 360k | **Pounce from the Veil** — attacks from the Veil into the Waking (Veil-only telegraph: a white paw print 2.0 s before) 3,200 |
| `m_construct_threshold_warden` | Threshold Warden | `creature:golem ×2.6`, pale stone with white seams | the Threshold approach (Elite) | 700k / 970k | **Seal** — a 12 m donut Danger zone, 2.0 s, 4,000; **Anchor** — invulnerable unless someone in the Veil strikes its Veil twin |
| `m_construct_clockwork_sentry` | Clockwork Sentry | `creature:turret ×2.0`, brass `#c8a040` | Clock Room approach | 240k / 330k | **Tick** — a line 30 m × 2 m that sweeps 90° over 3 s (moving Danger zone), 2,600 |
| `m_construct_escapement` | Escapement | `creature:golem ×1.6`, brass gears | Clock Room approach | 200k / 280k | **Rewind** (gold, 3.0 s) — puts every enemy within 20 m back to its health of 5 s ago; interrupt |
| `m_humanoid_veil_sentinel` | Veil Sentinel | `chibi2:elf/knight`, silver `plate_helm`, glaive (`fh_halberd`), white cape | the Mirror Court, the Warden's Nail (Elite) | 800k / 1.1M | **Moonwell Sweep** — 180° 10 m, 4,200; **Warden's Oath** — 50% less damage while another sentinel is alive within 15 m |
| `m_humanoid_veil_oracle` | Veil Seer | `chibi2:elf/oracle`, hood, orb | the Warden's Nail | 320k / 440k | **Foretell** (gold, 2.5 s) — the next pack pull is **Marked**: everyone takes +30% for 20 s; interrupt |
| `m_undead_memory_of_the_fallen` | Memory of the Fallen | `chibi2:<race>/<class>` of a **random earlier raid boss**, drained to grey | the Gallery approach | 300k / 415k | uses one signature ability of the boss it remembers (e.g. a Barrowking memory casts Grave Decree) |
| `m_beast_moth_of_memory` | Memory Moth | `creature:moth ×1.4`, white wings with eyes | Gallery, Observatory | 60k / 85k | **Forget** — removes your most recent buff; swarms of 6 |
| `m_aberration_the_mouth` | Mouth | `creature:worm ×2.4`, open maw, `#3a1f42` | the Throat (from the walls) | 350k / 485k | **Bite** — a 5 m circle Danger zone at its head, 2.0 s, 5,000; **Whisper** — a lying line (§7.12) |
| `m_dragonkin_starless_whelp` | Starless Whelp | `creature:drake ×1.6`, black with star-point `glow` | the Observatory | 220k / 305k | **Void Breath** — 40° cone 12 m, 2,800 + curse |
| `m_elemental_rift_shard` | Rift Shard | `creature:shard ×2.0`, white-violet | everywhere in Spire Crown | 280k / 385k | **Rift** — opens a 3 m Veil Rift where it dies (for 20 s); **Splinter** — 5 Targeted 3 m, 1,200 |
| `m_aberration_loom_spider` | Loom Spider | `creature:spider ×2.4`, white with grey legs | the Loom approach | 400k / 555k | **Thread** — WHITE tether that pulls the player off the edge of a platform at 2 m/s; break at 15 m |
| `m_fiend_rift_imp` | Rift Imp | `creature:imp ×1.2`, grey-violet | everywhere, in swarms | 40k / 55k | **Blink Through** — hops between realms; **Spark** 900 |
| `m_elemental_unwoven_thread` | Loose Thread | `creature:wisp ×1.4`, white thread-trails | the Loom approach | 90k / 125k | **Unravel** — on death, a random player's biggest buff is removed |

### 7.6 Boss 1 — The Threshold

| Field | Value |
|---|---|
| id | `b_threshold` · body `creature:shard ×6.5`, body `#e8e8f8`, belly `#ffffff`, accent `#6a60a0`, eyes `#ffffff`; a slowly turning door-shaped crystal; `enchant` aura |
| Health | **2,915,000 / 4,025,000** · Enrage 8:00 — *Door Closed* (everyone trapped in whichever realm, lethal) |
| Arena | round hall 50 m, 4 Veil Rifts at the compass points |
| Rule | **Two faces:** in the Waking it is a door, in the Veil a doorkeeper. It is **invulnerable in both realms unless at least 4 players (Mythic 5) are in the Veil** |

| Ability | Realm | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|---|
| **Lintel Strike** `b_threshold_lintel` | Waking | Tank swap | melee | — | 4,200 (T 60%) + **Doorstruck** | swap at 2 |
| **Warden Strike** `b_threshold_warden` | Veil | Tank | melee | — | 3,000 | a third tank or a tough off-role goes into the Veil with the Veil team |
| **Slam Shut** `b_threshold_slam` | Waking | Danger zone | cross 50 m × 8 m, RED | 2.0 s | 5,000 | diagonals |
| **Keyhole** `b_threshold_keyhole` | Veil (*Veil-only*) | Danger zone | circle 8 m RED in the Veil — **and the same spot** becomes a Void zone in the Waking 5 s later (PURPLE-black, 40 s, 500 / tick) | 2.0 s | 4,000 | Veil players drop it at the wall; Waking players see the Void appear and avoid it |
| **Rotation** `b_threshold_rotation` | both | — | every 60 s the Veil team must rotate: Veil Sickness means they cannot go back in for 30 s | — | — | two Veil teams (group 3 and group 4) alternate |
| **Doorway** `b_threshold_doorway` | Waking | Soak | ORANGE 6 m, **5 pips**, on a rift | 3.0 s | 15,000 split | soak — and **everyone who soaked is moved into the Veil** (plan it as the rotation) |
| **Draft** `b_threshold_draft` | both | Room-wide | whole hall, both realms | 2.5 s | 2,400 | heal (each realm its own healers) |

Mythic: **Lock** — at 50% two of the four rifts close for the rest of the fight. Lines (a voice from both sides at
once): pull *"You have a key. Keys are for leaving."*; Slam Shut *"**Shut.**"*; Doorway *"**Step through.**"*; death
*"Open. …Open."*

**Hard mode — `hm_b_threshold` "Knock."** Armed by using `/knock` (an emote) at the Threshold before the pull. Needs
6 in the Veil (Mythic 7); Keyhole fires twice. Drop `it_threshold_key_toy` (opens a 10 s rift anywhere, cosmetic)
25%. Feat `ft_r05_knock`.

### 7.7 Boss 2 — Grey and Greyer, the Veilhounds

| Field | Value |
|---|---|
| id | `b_grey_and_greyer`: `b_veilhound_grey` (`creature:dire_wolf ×4.4`, grey `#8a8a9a`) and `b_veilhound_greyer` (the same, `#4a4a5a`, white outline); Greyer lives in the Veil, Grey in the Waking |
| Health | **1,640,000 / 2,262,500 each** · must die within 10 s of each other · Enrage 8:30 — *The Hunt Ends* |
| Rule | Every **40 s** they **swap realms** (a howl, 3 s warning). A hound can only be hurt from its own realm, so the raid follows — half the raid in each realm, swapping with them |

| Ability | Hound | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|---|
| **Maul** | both | Tank swap | melee | — | 4,000 + **Scent** stack | the tank follows its hound through the rift; swap at 3 with the other realm's tank on the next realm swap |
| **Hunt** `b_grey_and_greyer_hunt` | both | Kite | each hound fixates a player **in the other realm** for 8 s and crosses to them | 2.0 s | 6,000 per bite | the hunted player crosses realms to escape it — they chase between realms at 90% your speed |
| **Mist Lunge** `b_veilhound_grey_lunge` | Grey | Danger zone | line 30 m × 5 m | 2.0 s | 4,800 | sidestep |
| **Grey Howl** `b_veilhound_greyer_howl` | Greyer | Room-wide (Veil) | the Veil | 2.0 s | 2,000, and Veil Drain doubles for 10 s | the Veil team shortens its stay |
| **Paired Scent** `b_grey_and_greyer_scent` | both | Tether (cross-realm) | WHITE line between a player in each realm; they must stand **on the same spot** (within 3 m, across realms) for 6 s | 1.8 s | apart: 1,500 / s each | the two find each other's ghost and stand together |
| **Pack Bond** `b_grey_and_greyer_bond` | both | — | if both hounds are within 10 m (in positions, across realms) they heal 2%/s | — | — | tanks hold them apart in position, too |

Mythic: a third, invisible hound (**Greyest**, `b_veilhound_greyest`, 1.5M) appears at 30% in whichever realm has
fewer players. Lines (the Narrator): pull *"Two shapes in the mist, and they are the same shape."*; swap *"**They
howl, and change sides.**"*; death *"The mist goes quiet on both sides."*

**Hard mode — `hm_b_grey_and_greyer` "Off the Leash."** Armed by breaking the silver chain at the kennel mouth. Swaps
every 25 s. Drop `it_mount_veilhound` (a translucent grey `creature:dire_wolf` mount that trails mist) 3%. Feat
`ft_r05_off_the_leash`.

### 7.8 Boss 3 — The Horologe

| Field | Value |
|---|---|
| id | `b_horologe` · body `creature:golem ×5.5` brass and glass, `#c8a040` / `#e8e0c0`, eyes `#40d0ff`; a clock face in its chest; gears turning |
| Health | **3,645,000 / 5,030,000** · Enrage 9:00 — *Midnight*: the hand stops on every segment |
| Arena | the Clock Room: a round floor 48 m painted as a **clock face of 12 segments**; the Horologe in the middle; the **hour hand** (a beam) sweeps the floor |

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Pendulum** `b_horologe_pendulum` | Tank swap | melee, swings between the two tanks: each swing hits the **other** tank (two tanks within 12 m of it on opposite sides) | — | 4,800 per swing, every 3 s | two tanks on opposite sides; a missing tank means the swing hits the raid behind |
| **Hour Hand** `b_horologe_hour_hand` | Moving wave | a beam from the centre to the edge sweeping clockwise at one segment per 5 s | always on | 6,000 (lethal to non-tanks) — shown **always** RED | stay ahead of it; everyone moves one segment every 5 s |
| **Strike the Hour** `b_horologe_strike` | Danger zone (count) | it chimes N times (1–12); segment N lights RED | chimes 3 s + 2.0 s | 5,500 | count the chimes and leave segment N; the number also shows over its head |
| **Rewind** `b_horologe_rewind` | Time | every player is put back where they stood **5 s ago** (a faint afterimage marks the spot 2 s before) | 2.0 s | — | stand somewhere safe 5 s before a rewind — it happens at 25 s past every minute of the fight (the clock shows it) |
| **Tick / Tock** `b_horologe_ticktock` | Checkerboard | odd segments RED on *tick*, even on *tock*, every 3 s for 12 s | 1.5 s each | 3,000 | step one segment every 3 s |
| **Escapements** `b_horologe_escapements` | Adds / Interrupt | 3 `m_construct_escapement` | 3 s | as trash | interrupt their Rewind (it heals the Horologe) |
| **Stopped Time** `b_horologe_stopped` | Soak | at 50%: time stops for everyone **not** in the ORANGE 8 m circle (10 pips, Mythic 12) for 6 s; stopped players take 40% of their max health when time resumes | 3.0 s | — | half the raid soaks; the other half pops defensives |

Mythic: the hour hand sweeps **anticlockwise** after 50%. Lines: pull *"You are early."*; Strike *"**The hour is…**"*
then the chimes; Rewind *"**Again.**"*; death *"…you are… late."*

**Hard mode — `hm_b_horologe` "Wind It Up."** Armed by winding the great key at the door (interact 5 s). The hand
sweeps at one segment per 4 s. Drop `uq_horologe_pocketwatch` 15%. Feat `ft_r05_wind_it_up`.

### 7.9 Boss 4 — The Mirror Court

| Field | Value |
|---|---|
| id | `b_mirror_court` · five **Reflections** step out of five mirrors: each is a copy of **one class in your raid** (chosen at the pull: the five most common classes in the raid; ties broken by item level). Bodies: that class's Chibi 2 outfit on a glass-grey body (`chibi2:<race of the player>/<class>`), white outline, `scale 1.6`. Ids: `b_mirror_reflection_<class>` |
| Health | **729,000 / 1,006,000 each** (5 = 3,645k / 5,030k) · Enrage 9:00 — *Perfect Copy* |
| Rule | Each Reflection casts that class's **six spells** (page 06 class file) at boss scale. Kill order is the raid's to decide. When a Reflection dies, the **other four gain its class mechanic** (page 06) for the rest of the fight |

The exact abilities depend on the raid — so the fight is **five boss kits built from the class files**. The
framework (for the builder):

| Rule | Value |
|---|---|
| Spell damage | a Reflection's spell deals 250% of the class's number for that spell at level 60 (page 06), against the reference health |
| Shapes | every Reflection spell draws a page 11 telegraph with its real shape (a mage's bolt draws a YELLOW line to its target 1.5 s ahead), even if the player's version is instant |
| Heals | a healer Reflection heals the other Reflections at 150% — kill or interrupt it |
| Tank Reflection | taunts players; forces the raid tanks to taunt back |
| Class mechanic | a Reflection uses its class's mechanic as a **boss ability** (e.g. a druid Reflection's shapeshift becomes a phase; a necromancer's corpses become adds) |
| Every Reflection | also has **Shatter** (Danger zone, circle 6 m RED around it on death, 2.0 s, 4,000) and **Mimicry** (it copies the last spell a player of its class cast, 3 s later, aimed at that player) |

Plus the **Court** itself:

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Silvered** `b_mirror_court_silvered` | Room-wide | every 45 s | 2.0 s | 2,500 | heal |
| **Behind the Glass** `b_mirror_court_glass` | Veil | one Reflection steps into the Veil for 20 s and is invulnerable in the Waking | — | — | 3 players follow it through a rift |
| **Your Own Face** `b_mirror_court_face` | Targeted | the players whose classes were copied are YELLOW-marked: their Reflection deals +50% to them | 1.5 s | — | those players stay away from their Reflection |

Lines (in the voice of the class's own barks, page 06 §8, pitched down): pull *"We have been watching you
practise."*; a Reflection dies *"That one was always the weakest."*; death *"…Is that what we look like?"*

**Hard mode — `hm_b_mirror_court` "Full Court."** Armed by breaking the sixth, cracked mirror in the hall: a sixth
Reflection — **your raid leader's class**. Drop `it_mirror_court_transmog_token` (copy any class set's look you have
seen in the fight) 20%. Feat `ft_r05_full_court`.

### 7.10 Boss 5 — Anvarr, the Hollow Titan

| Field | Value |
|---|---|
| id | `b_anvarr_hollow_titan` · body `creature:titan ×7.5`, body `#5a5a64`, belly `#2a2a34`, accent `#e8e8ff`, eyes `#ffffff`; a hole through his chest where the heart should be, the edges glowing white (a Veil Rift) |
| Health | Anvarr **2,500,000 / 3,450,000**; his **Heart** (in the Veil, inside him) **1,510,000 / 2,085,000** · Enrage 10:00 — *Hollowed*: the heart stops, lethal |
| Arena | the Hollow, 60 × 50 m; his chest rift is 6 m up — reached from a ramp of rubble on the east side |
| Rule | Only the **Heart team** (group 3 + group 4, or any 8–10 players) inside the Veil can damage the Heart; the **Outside team** damages Anvarr. **Anvarr takes 90% less damage while the Heart is above 50%** |

| Ability | Where | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|---|
| **Earthshaker** `b_anvarr_earthshaker` | outside | Tank swap | melee + 10 m splash | — | 5,500 (T 79%) + **Crushed** | swap at 2 |
| **Rubble Rain** `b_anvarr_rubble` | outside | Targeted + blocker | 6 circles 5 m YELLOW; each lands as a **boulder** (line-of-sight blocker, 60 s) | 2.0 s | 3,600 | spread; the boulders are cover for Hollow Roar |
| **Hollow Roar** `b_anvarr_roar` | outside | Line of sight | Room-wide from his chest | 3.5 s | 6,000 | behind a boulder |
| **Heartbeat** `b_anvarr_heartbeat` | inside | Room-wide (Veil) | every 8 s, +10% each beat | — | 1,500 base | the Heart team kills the Heart fast; they rotate out on Veil Sickness |
| **Arteries** `b_anvarr_arteries` | inside | Tether | WHITE lines from the Heart to 3 players; each pulls them in; a player touching the Heart is **absorbed** (dies unless healed 30k in 5 s) | 1.8 s | — | walk out; the healer of the Heart team watches |
| **Clot** `b_anvarr_clot` | inside | Void zone | 4 m clots of grey, 60 s | 1.5 s | 600 / tick | drop them at the edges of the Heart chamber (it is only 24 m) |
| **Emptiness** `b_anvarr_emptiness` | both | Soak (cross-realm) | an ORANGE 6 m circle in **both** realms at the same spot, 5 pips each | 3.0 s | 20,000 split per realm | both teams soak the same spot on their side |

Mythic: at 30% (of the Heart) the Heart team is thrown out and the Outside team must go in (they swap jobs).
Lines (a rumble with a voice in it): pull *"Something stole my heart. Something is still here."*; Roar *"**HOLLOW!**"*;
death *"…it beats… again…"*

**Hard mode — `hm_b_anvarr_hollow_titan` "Stone Heart."** Armed by throwing a stone into the chest rift before the
pull. The Heart team is capped at **6** players. Drop `it_anvarr_heart_toy` (a beating stone heart, housing/back)
25%. Feat `ft_r05_stone_heart`.

### 7.11 Boss 6 — The Curator, in the Gallery of the Fallen

| Field | Value |
|---|---|
| id | `b_curator` · body `creature:wraith ×4.0`, body `#d8d0c0` like old paper, belly `#fff8e8`, accent `#5a4a3a`, eyes `#e8b830`; a ledger floating beside it |
| Health | **4,010,000 / 5,535,000** · Enrage 10:00 — *Closing Time* |
| Arena | the Gallery of the Fallen, 80 × 30 m with **four alcoves** (bone, ice, water, fire) each holding a statue of an earlier raid's final boss |
| Rule | **The exam.** Every 25% the Curator **wakes one statue** and the fight becomes that boss's signature phase, in the Veil's grey, at r05 numbers. The order is rolled each week |

| Exhibit (woken at 100/75/50/25% in the week's order) | What returns | r05 numbers |
|---|---|---|
| **The Barrowking** (bone alcove, `chibi2:undead/knight` statue) | Take Up the Crown (Soak **10 pips**, 20 s rotation) + Weight of the Crown stacks + Grave Decree ×5 | Soak 30,000 split; Weight 400, +10%/pulse |
| **Queen Ysmere** (ice alcove) | Breakup: the gallery floor becomes 8 floes over black water + Checkered Ice + Sinking Floe | 4,800 per RED square |
| **The Choirmaster** (water alcove) | Anthem song lanes (4-note phrases, *Counterpoint* hand rule) + Lure | 5,500 in a RED lane |
| **The Ember King** (fire alcove) | Cinder Tiles honeycomb + Tax of Ash (2 × 8 pips) + Firebrand | 5,000 tile; 20,000 per soak |

The Curator's own kit runs the whole time:

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Catalogue** `b_curator_catalogue` | Tank swap | melee | — | 4,000 + **Catalogued** (+10% damage from exhibits) | swap at 3 |
| **Do Not Touch** `b_curator_do_not_touch` | Tether | WHITE lines from 4 players to the woken statue; within 10 m of it, 2,000 / s | 1.8 s | — | tethered players stay away from the statue |
| **Restoration** `b_curator_restoration` | **Interrupt (gold)** | cast 4.0 s: restores a woken statue's phase from the start | 4.0 s | — | interrupt |
| **Memory Moths** `b_curator_moths` | Adds | 6 `m_beast_moth_of_memory` | 3 s | as trash | area damage (they remove buffs) |

Lines: pull *"Welcome. Please do not touch the exhibits. They bite."*; exhibit *"**And here — {boss}. You may
remember them.**"*; death *"The gallery… is closed."*

**Hard mode — `hm_b_curator` "Private Viewing."** Armed by reading the Curator's ledger at the door. **Two** statues
wake at 50% at once. Drop `it_gallery_statue_of_you` (a housing statue of your character in its pose on the kill)
100% to one player. Feat `ft_r05_private_viewing`.

### 7.12 Boss 7 — The Many-Mouthed

| Field | Value |
|---|---|
| id | `b_many_mouthed` · body `creature:horror ×8.0`, body `#2a1f42`, belly `#5a3f7a`, accent `#120c22`, eyes `#ffe86a` (12 eyes, 9 visible), `tentacles 8`; mouths all over it |
| Health | **4,375,000 / 6,035,000** · Enrage 10:00 — *Swallowed Whole* |
| Arena | the Throat: a round pit 56 m, mouths in the walls (`m_aberration_the_mouth` rise from 8 grates) |
| Rule | **The voices lie.** It speaks through many mouths, and **one in three of its warning lines is a lie** (says "left" when the telegraph is on the right). **The ground telegraph never lies.** On Normal a lying banner carries a small ✕ in its corner; on Mythic it carries nothing |

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Chew** `b_many_mouthed_chew` | Tank swap | melee | — | 5,000 + **Digested** (−5% max health per stack, until death of the boss) | swap at 2 |
| **Left Mouth, Right Mouth** `b_many_mouthed_leftright` | Danger zone | half the pit (left or right of its facing), RED | 2.0 s | 7,000 | go where the **ground** says; the voice ("*The left will eat!*") may lie |
| **Swallow** `b_many_mouthed_swallow` | Rescue (Veil) | 3 players are swallowed into the **Stomach** (a Veil-realm room, 20 m); inside: acid Void zones and a **Gullet Knot** (500k / 690k) they must destroy in 25 s to be spat out | 2.0 s | acid 500 / tick | the swallowed three kill the knot; a healer goes in through a rift to keep them alive |
| **Mouths** `b_many_mouthed_mouths` | Adds | 2 `m_aberration_the_mouth` from grates | 3 s | as trash | kill; their **Whisper** is always a lie |
| **Babble** `b_many_mouthed_babble` | **Interrupt (gold)** | cast 3.0 s, five mouths at once — **five cast bars**; only one is real (the one whose mouth glows gold) | 3.0 s | Room-wide 5,000 if the real one finishes | interrupt the gold mouth, not the loudest |
| **Hunger** `b_many_mouthed_hunger` | Soak | ORANGE 8 m, **8 pips** (Mythic 10) at its main maw | 3.0 s | 24,000 split | soak — the maw is where it lies about Left/Right most |

Lines (examples; `lie` means it is sometimes false): pull *"Hello. Hello. Hello. We are so glad you came."*;
Left/Right *"**The LEFT will eat!**"* (lie ⅓); Babble *"**Listen to me — no, ME —**"*; death *"…we… we… we…"*

**Hard mode — `hm_b_many_mouthed` "Only Lies."** Armed by feeding it a raid member's food item at the pit's edge.
**Every** warning line lies. Drop `it_many_mouthed_mask` (a face cosmetic full of teeth) 25%. Feat `ft_r05_only_lies`.

### 7.13 Boss 8 — Nhal the Starless

| Field | Value |
|---|---|
| id | `b_nhal_starless` · body `creature:dragon ×8.0`, body `#0a0a14`, belly `#2a2a4a`, accent `#e8e8ff` star points (`glow`), eyes `#ffffff`; its wings are a star field |
| Health | **4,740,000 / 6,540,000** · Enrage 11:00 — *The Last Star* |
| Arena | the Starless Observatory, 70 m open to a black sky with the wrong stars; 5 **star lenses** (brass telescopes) at the edge |
| Phases | P1 100–65% *Ground*; P2 65–35% *Night* (it flies; the room goes dark; only stars give light); P3 35–0% *Collapse* |

| Ability | Phase | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|---|
| **Night Claw** `b_nhal_claw` | P1, P3 | Tank swap | melee | — | 5,800 + **Starless** (healing received −10%) | swap at 2 |
| **Void Breath** `b_nhal_breath` | P1, P3 | Danger zone | cone 60° 35 m | 2.0 s | 8,000 | sides |
| **Tail of Night** `b_nhal_tail` | P1, P3 | Danger zone | cone 90° 20 m behind | 1.8 s | 6,000 | never behind |
| **Gravity Well** `b_nhal_well` | all | Void zone (pulling) | circle 8 m PURPLE-black that **pulls** players within 20 m toward its centre at 2 m/s, 30 s | 1.5 s | 900 / tick in the centre | walk against the pull; place wells at the edge |
| **Falling Star** `b_nhal_star` | P2 | Targeted + Beneficial | 5 players get YELLOW 6 m circles; each lands as a **fallen star**: a GREEN 5 m light zone for 30 s (the only light in P2) | 2.0 s | 4,000 | spread, then use the stars as light |
| **Darkness** `b_nhal_darkness` | P2 | Room-wide outside light | outside any GREEN star light | — | 800/s | stand in star light |
| **Constellation** `b_nhal_constellation` | P2 | Pattern (Veil-only) | the Veil shows 5 stars joined by lines; the **same pattern** must be made in the Waking by 5 players standing at the 5 star lenses and aiming them (interact) at the matching points in 20 s | — | fail: Room-wide 10,000 | a Veil team reads it and calls it out; the lens team aims |
| **Supernova** `b_nhal_supernova` | P3 | Danger zone (lethal) | circle 30 m around a random fallen star | **3.0 s** | **Lethal** | leave it; the star light is gone |
| **Event Horizon** `b_nhal_horizon` | P3 | Soak | ORANGE 8 m inside a Gravity Well, **10 pips** | 3.0 s | 30,000 split | soak it where the well will pull you anyway |

Lines: pull *"I ate the stars over this island. You did not notice."*; Night *"**Dark. All dark.**"*; Constellation
*"**Can you read the sky? Read it.**"*; Supernova *"**Burn out!**"*; death *"There… a star…"*

**Hard mode — `hm_b_nhal_starless` "Eyes Shut."** Armed by covering all five lenses with their caps. Constellation
must be solved with **4** lenses. Drop `it_mount_starless_drake` (a black `creature:dragon ×1.6` winged mount: runs and glides before Riding IV, flies after (page 07, level 60); a
star-field wing) 1%. Feat `ft_r05_eyes_shut`.

### 7.14 Boss 9 — Saelith, the Veilwarden

| Field | Value |
|---|---|
| id | `b_saelith_veilwarden` · body `chibi2:elf/oracle`, silver `circlet` with a white stone, held staff with a thread-spindle head, robe `#e8e8f8`/`#6a60a0`, `rune_halo` white; `scale 2.0` |
| Health | **5,105,000 / 7,045,000** · Enrage 10:00 — *Wardenfall*: the Veil opens (lethal) |
| Arena | the Warden's Nail, the top of the spire: 44 m round, the Veil pressing up through the floor (half the floor is a permanent rift) |
| Rule | **She is not the enemy, and she has to be sure.** She fights to test the raid; at 20% the fight ends in a dialog |

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Warden's Staff** `b_saelith_staff` | Tank swap | melee | — | 4,800 + **Tested** | swap at 3 |
| **Weave** `b_saelith_weave` | Tether (web) | WHITE lines between **every** pair of players within 8 m of each other; any line that crosses a Danger zone when it fires deals its damage to both | 2.0 s | 3,000 per crossing | spread into a pattern where no two lines cross a zone |
| **Unweave** `b_saelith_unweave` | Danger zone | 4 lines 44 m × 4 m RED, rotating 45° over 4 s (a moving cross) | 2.0 s | 6,000 | walk with the rotation in a gap |
| **The Question** `b_saelith_question` | Soak by role | ORANGE circles, one per role: Tank (2 pips), Healer (4), Damage (6), Support (2) — marked with the role icon | 3.0 s | 25,000 split, each | each role soaks its own circle; wrong role = double damage |
| **Warden's Sight** `b_saelith_sight` | Veil | she shows a mechanic in the Veil **5 s** before it happens in the Waking | — | — | a Veil scout calls it |
| **Hold the Nail** `b_saelith_hold` | Room-wide | every 45 s | 2.0 s | 3,000 | heal |

**Dialog opportunity — `dlg_b_saelith_veilwarden_answer`** (at 20%; the fight stops). *"I held this door a hundred
years. It is not enough. Tell me why I should let you through, and not simply close it on us all."*

| Reply | Result |
|---|---|
| 1. *Say nothing.* | she fights to 0% and dies; the Unwoven fight has **no** Warden help |
| 2. *"Because we are going to close it from the other side."* | she lowers her staff: the fight ends as a **win** (full loot). She **joins** the Unwoven fight (§7.15: once per phase she shields the Veil team from Veil Drain for 20 s) |
| 3. *"Because you can't stop us."* | she fights on to 0% at +20% damage; +1 item |
| 4. (every player in the raid carries a **Hearthvale Ember**, §7.16) *"We carry the first fire of the March."* | she kneels: *"Then the land is still dreaming. Wake it."* Win at 20% as reply 2, she joins as reply 2, **and** the secret's first half is done |

Lines: pull *"Turn back. This is the only warning I give."*; Weave *"**Every thread connects.**"*; Question
*"**Answer, each of you, in your own way.**"*; death (reply 1/3) *"Close… the door…"*

**Hard mode — `hm_b_saelith_veilwarden` "Unanswered."** Armed by stepping onto the Veil-half of the floor before the
pull (you are in the Veil at the pull). No dialog: she fights to 0%; Warden's Sight is gone. Drop `uq_saelith_spindle`
15% (35% on hard mode). Feat `ft_r05_unanswered`.

### 7.15 Boss 10 — The Unwoven

| Field | Value |
|---|---|
| id | `b_unwoven` · body: in P1 `creature:horror ×9.0` made of **unravelled threads** (body `#f0f0ff`, belly `#6a60a0`, accent `#0a0814`, eyes `#ffffff`); in P3 it loses its shape and becomes a storm of threads (`creature:wraith ×10`, `tatters 16`); in P4 only its **loom** remains (a structure, not a body) |
| Health | **8,020,000 / 11,070,000** · Enrage 14:00 — *Unmade*: the platforms fall |
| Arena | the Loom Beyond, inside the Veil (the whole fight is "in the Veil", so there is **no Veil Drain** here — instead the **Waking** is the dangerous side: a rift here leads *back* to a Waking copy for 20 s at a time) |
| Phases | P1 100–75% *The Knot*; P2 75–50% *Two Sides*; P3 50–20% *Unravelling*; P4 20–0% *The Thread* |

**P1 — The Knot (100–75%)** — on a single 60 m platform.

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Unmaking Touch** `b_unwoven_touch` | Tank swap | melee | — | 6,000 (T 86%) + **Unravelled** (max health −5%, 60 s, stacks) | swap at 2 |
| **Loose Ends** `b_unwoven_ends` | Tether | 6 WHITE threads from it to 6 players, pulling at 2 m/s | 1.8 s | touching it: absorbed (killed) | walk away for 8 s; the threads snap |
| **Knot** `b_unwoven_knot` | Soak | 4 ORANGE circles 5 m at the platform's corners, **5 pips** each (Mythic 5 each at 20 players = everyone) | 3.0 s | 15,000 split each | four subgroups, one corner each (`wm_sun`, `wm_moon`, `wm_star`, `wm_flame`) |
| **Fray** `b_unwoven_fray` | Void zone | 6 circles 5 m, 60 s | 1.5 s | 700 / tick | drop at the edge |
| **Unwind** `b_unwoven_unwind` | Room-wide | every 30 s | 2.0 s | 3,500 | heal |

**P2 — Two Sides (75–50%).** It splits: **the Weft** (in the Veil platform) and **the Warp** (in the Waking copy)
share health. The raid splits 10/10 by subgroup (1+2 / 3+4). Each side has its tank pair and healers.

| Ability | Side | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|---|
| **Weft Cross** `b_unwoven_weft_cross` | Veil | Danger zone | cross 60 m × 6 m | 2.0 s | 7,000 | diagonals |
| **Warp Rings** `b_unwoven_warp_rings` | Waking | Moving wave | rings from the Warp, one BLUE gap | 2.0 s | 6,000 | the gap |
| **Across** `b_unwoven_across` | both | Mirror | every Danger zone on one side appears on the **other** side 3 s later at the same spot | +3 s | as the source | each side calls its zones to the other (raid chat/voice) |
| **Rejoin** `b_unwoven_rejoin` | both | — | if the two halves' health differs by more than 5%, the stronger heals to match | — | — | balance damage |

**Saelith's help** (if she joined, §7.14): once in P2 and once in P3, she stops Veil Drain for the Waking side for 20 s
(*"Hold, children. I have the door."*).

**P3 — Unravelling (50–20%).** The platform breaks into **9 floating stones** (12 m each) over nothing. It becomes a
storm of threads that moves between stones.

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Pull a Thread** `b_unwoven_pull` | — | a stone (WHITE outline) unravels and falls in 6 s | 6.0 s | a fall = death | jump to a neighbouring stone (jump gaps are 3 m; a gap closes to 1.5 m when a thread bridge forms — below) |
| **Thread Bridge** `b_unwoven_bridge` | Beneficial | GREEN threads join two stones for 10 s (walkable) | — | — | cross on them |
| **Checker of Stones** `b_unwoven_checker` | Checkerboard | 4 or 5 of the 9 stones light RED (a 3 × 3 checkerboard) | 1.8 s | 8,000 | be on an unlit stone |
| **Tangle** `b_unwoven_tangle` | Tether | WHITE lines between 4 pairs of players; each pair must be on **different** stones | 1.8 s | same stone: 4,000 each / s | split pairs across stones |
| **Everything Frays** `b_unwoven_everything` | Soft enrage | +5% damage every 20 s | — | — | push |

**P4 — The Thread (20–0%).** The storm pulls into the **Loom** (a structure in the centre stone). Every player is given
one **Thread** (a WHITE tether from them to the loom).

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Weave the World Back** (players) | — | the Loom takes damage only from players whose Thread is **tight** (standing 15–20 m from it — the tether glows gold when tight) | — | — | stand in the ring 15–20 m from the loom |
| **Snarl** `b_unwoven_snarl` | Danger zone | 3 cones 40° from the loom, rotating | 2.0 s | 8,000 | move around the ring as they rotate — keeping the thread tight |
| **Cut** `b_unwoven_cut` | Targeted | 3 players' threads are **cut**: they must touch the loom (walk in) within 6 s to re-tie, crossing the snarl cones | 2.0 s | cut and not re-tied: they fall out of the world (death) | the cut players go in on a gap and come back out |
| **Last Unwinding** `b_unwoven_last` | Room-wide | every 10 s | 1.5 s | 3,000, +20% each | the final burn |

**Dialog opportunity — `dlg_b_unwoven_first_fire`** (at 20%, before the Thread; always offered). The threads form a
face: *"You are made of me. Everything is made of me, one strand wide. Let go, and rest."*

| Reply | Result |
|---|---|
| 1. *Say nothing.* | P4 |
| 2. *"No."* | P4; the raid gets **Resolve of the March** (+10% damage, P4 only) — the game's one free buff for saying no to the end of the world |
| 3. (the secret's first half done at Saelith, and every player carries a Hearthvale Ember) *"The March is dreaming. We are the dream, and we are waking up."* | the Loom **burns** from the embers: P4 skips its first Cut; on the Unwoven's death the whole Veil lights up — the secret (§7.16) |

Lines: pull *"Ah. The last knots."*; Loose Ends *"**Come apart. It doesn't hurt.**"*; P2 *"Two of me. Two of you. Twice
the unmaking."*; P3 *"**The floor is only a story you told yourselves.**"*; Cut *"**Snip.**"*; death *"…woven… again…"*

**Mythic:** P2 **Across** mirrors at 2 s; P3 has 8 stones; P4 Cut hits 5 players.

**Hard mode — `hm_b_unwoven` "Nothing Held."** Armed by entering the Loom Beyond **without** Saelith (reply 1 or 3,
or kill her). No Warden help, and the P2 split is **12/8** (the Veil side gets fewer). Drop `it_unwoven_thread_cloak`
(a back cosmetic of drifting white threads) 30%. Feat `ft_r05_nothing_held`.

### 7.16 Secret boss — The Marchheart, the Wildmarch Dreaming

**Unlock:**
1. **Every player** in the raid carries a **Hearthvale Ember** (`it_hearthvale_ember`, account-bound): the prize of
   `q_the_last_ember` "The Last Ember" (page 14; proposed here): starting at Brightwater's hearth in Hearthvale, carry a
   lit ember to the **shrine of each of the ten regions** (one shrine per region, each guarded by that region's
   world boss's minions or reachable only after that world boss is killed once — §8), and back to Veilspire. It is
   the game's longest quest and echoes the pitch: *everyone starts with a torch*.
2. At Saelith, pick reply 4 (§7.14).
3. At the Unwoven, pick reply 3 (§7.15) and kill it.

The Veil lights up; a door made of every region's colours opens onto the **Dreaming March**.

| Field | Value |
|---|---|
| id | `b_marchheart` · body `creature:titan ×10`, a giant made of the continent: legs of Hearthvale green `#5ab04a`, a body of Greyridge stone `#6e6a63` and Sunscar sand `#d8b070`, arms of Whisperwood bark `#4a3524` and Frostmantle ice `#c8e8ff`, a head of Emberthrone ember `#ff6a20` with Riftmarch stones orbiting it (`shards`); eyes `#fff4d0` |
| Health | **9,000,000 / 12,400,000** · Enrage 14:00 — *The Dream Ends* |
| Arena | the Dreaming March: a 120 m round arena that **is the continent in miniature**: south edge green valley, north edge volcano, each region a wedge of ground |
| Rule | **It is not evil — it is waking up, and it does not know you are there.** Its attacks are the land's: every phase moves the fight to one region's wedge and uses that region's **world boss** mechanic (§8) at raid scale |

| Phase (health) | Region wedge | Borrowed mechanic (see §8) | Plus |
|---|---|---|---|
| 100–90% | Hearthvale / Mossfen | **Harvest Ring** (Harvest Effigy): a donut + a soak | **Waking Stir** (Room-wide 3,000 every 20 s) |
| 90–80% | Greyridge | **Ironmuster** (Grief-in-Iron): cross lines + armour-plate stacks | Tank swap **Mountain's Weight** (6,500 + stacks, swap at 2) |
| 80–70% | Sunscar | **Glass Storm** (the Glass Wyrm): burrow lines + glass Void zones | |
| 70–60% | Whisperwood | **Brood Web** (the Hungering Brood): tether webs + egg adds | |
| 60–50% | Cinder Steppe | **Carrion Circles** (the Carrion Crown): dive lines + circling shadows | |
| 50–40% | Frostmantle | **Standing Ruin** (the Standing Ruin): stone-fall blockers + line-of-sight roar | |
| 40–30% | Drowned Coast | **Sallow Tide** (the Sallow King): rising water + curses to dispel | |
| 30–20% | Riftmarch | **Unmoored** (the Unmoored): floating platforms + gravity flips | |
| 20–10% | Emberthrone | **Slag Rain** (Slagborn): lava Void zones + ember soaks | |
| 10–0% | **all of it** | **The March Wakes**: every region's ground at once — the raid must stand on the wedge of the region named in the banner every 8 s (a Safe zone BLUE that moves round the continent) | Room-wide 2,000 every 5 s, +10% each |

**Dialog opportunity — `dlg_b_marchheart_waking`** (at 10%). The giant stops and looks down, for the first time
seeing people: *"…Small ones. Were you in my dream? Was it a good dream?"*

| Reply | Result |
|---|---|
| 1. *Say nothing.* | the last 10% as written; it lies down on its own at 0% — *"Then I will dream a little longer."* |
| 2. *"It was a good dream."* | it smiles; the last 10% is skipped and the fight ends as a win. Title *"Dreamkeeper"* |
| 3. *"It was a hard one. We stayed anyway."* | as reply 2, and **every player** gets `it_marchheart_seed` (a housing plant that grows a tiny copy of the region you last levelled in) |

Lines (the deepest voice in the game, slow, warm): pull *"…Mm. Something is warm in my hand."*; each region change
*"**Now it is {region}. I remember {region}.**"*; The March Wakes *"**Everywhere at once — oh, it's so big.**"*; end
*"Sleep well, small ones. I'll keep dreaming you."*

**Hard mode — `hm_b_marchheart` "Every Road."** Armed if **every player** in the raid has killed **every world boss**
(§8) at least once (the game checks feats). Each region phase keeps its mechanic running into the next phase (two at
once from 90% on). Drop `it_mount_marchheart_colossus` (a small walking land-giant mount, `creature:titan ×1.4` in
the continent's colours) 1% per player, and title *"Walker of Every Road"*. Feat `ft_r05_every_road`.

**Loot:** guaranteed `leg_first_torch` to every player **once per account** (the only guaranteed-for-all legendary in
the game), then `leg_dream_of_the_march` to one player per kill; `it_mount_marchheart_colossus` 2% per player on
Normal; title *"Dreamkeeper"*.

### 7.17 r05 loot

**Raid set — `set_veilwoven` "The Veilwoven Raiment"** — tokens `it_token_r05_<slot>` / `it_token_r05m_<slot>`; pieces
`it_veilwoven_circlet`, `…_robe` (chest), `…_leggings`, `…_gloves`, `…_boots`, `…_spindle` (necklace).

| Role | 2 pieces | 4 pieces | 6 pieces |
|---|---|---|---|
| Tank | **+6%** max health; taunts have **+5 m** range | when you swap in on a boss (taunt it from another tank), the other tank's stacks clear **twice as fast** | **Two Realms:** once per 90 s, when you would die, you slip into the Veil for 4 s (untargetable, healing to full at 25%/s) and step back out |
| Healer | heals **+8%**; heals on players in the other realm (the Veil or the Waking) are possible at **50%** | every 20 s your next heal is also cast by an echo of you 3 s later at the same target | **Loom:** your heals tie a thread to the target: for 10 s, **15%** of damage they take is shared to you |
| Damage | **+5%** damage; **+10%** to enemies in the other realm while you are in the Veil | your first ability after crossing a rift deals **+40%** | **Unravel:** every 15 hits pull a thread from the target: it takes **+3%** damage from you per thread (max 10 threads, 20 s) |
| Support | allies within 15 m cross rifts in **0.5 s** instead of 1 s and take **50%** less Veil Drain | your buffs also grant **+5%** haste | **Warden's Sight:** once per 60 s, reveal every Veil-only telegraph to the whole raid for 10 s |

| id | Name | Slot | Source | Power |
|---|---|---|---|---|
| `leg_first_torch` | The First Torch | light (the light slot) | the Marchheart (guaranteed once per account) | a torch that never goes out: light radius **+60%**; your character's **every** ability is **+2%** stronger per region of the Wildmarch you have fully explored (max +20%); the torch's flame takes the colour of the region you stand in |
| `leg_dream_of_the_march` | Dream of the March | any weapon type (chosen from your class's list on loot) | the Marchheart | every 30 s you gain a region's blessing in order: Hearthvale (heal 10%), Mossfen (poison), Greyridge (armour +20%), Sunscar (haste +15%), Whisperwood (regen), Cinder Steppe (+15% damage), Frostmantle (freeze on hit), Drowned Coast (life steal 5%), Riftmarch (blink on dodge), Emberthrone (+30% crit damage) — each lasts 30 s |
| `leg_unwoven_spindle` | The Unwoven Spindle | off-hand focus / shield | the Unwoven (3%) | every 10 s, your next hit ties the target to up to 3 nearby enemies with threads for 6 s: **40%** of damage dealt to any of them is dealt to all |
| `leg_starless_scale` | Starless Scale | chest (any weight) | Nhal (3%) | while below 50% health you are **Starless**: enemy telegraphs aimed at you are 0.3 s slower to land (never below page 11's minimums for others) and you take **15%** less damage |
| `leg_horologe_mainspring` | The Horologe's Mainspring | ring | the Horologe (3%) | once per 60 s, press your dodge twice quickly to **rewind** yourself to where you were 4 s ago, with the health you had |
| `uq_saelith_spindle` | Saelith's Spindle | staff | Saelith (15% / hard mode 35%) | your area spells draw WHITE threads between allies inside them: allies linked share **10%** of damage taken, evenly |
| `uq_horologe_pocketwatch` | The Horologe's Pocketwatch | necklace | Horologe hard mode (15%) | your cooldowns tick **5%** faster; every 12th second is a "tick": your next ability that second is **+20%** |
| `uq_grey_collar` | The Grey Collar | necklace | Grey and Greyer (8%) | your pet or summon can cross realms with you and deals **+15%** damage |
| `uq_threshold_keystone` | Threshold Keystone | ring | the Threshold (8%) | crossing a rift, or using a dodge roll, gives **+8%** damage for 4 s |
| `uq_mirror_of_the_court` | Mirror of the Court | off-hand (any) | the Mirror Court (8%) | once per 45 s, your next spell is cast a second time by a mirror of you at **40%** |
| `uq_anvarr_heartstone` | Anvarr's Heartstone | chest (heavy) | Anvarr (8%) | every 8 s a heartbeat heals you **2%** of max health; at 5 beats without taking damage, the next hit on you is halved |
| `uq_curators_ledger` | The Curator's Ledger | off-hand focus | the Curator (8%) | every boss you kill with it equipped adds a line: **+0.5%** damage against that boss's family, max +5% per family |
| `uq_mouth_that_speaks_true` | The Mouth That Speaks True | head | the Many-Mouthed (8%) | boss warning lines that lie are marked for you (✕) on Mythic too |

| Boss | Tokens | Epic items (`it_`) | Uniques / legendaries | Hard mode / other |
|---|---|---|---|---|
| The Threshold | hands, feet | `it_lintel_greatshield` (shield), `it_doorkeepers_wand` (wand), `it_rift_step_boots` (light feet) | `uq_threshold_keystone` | `it_threshold_key_toy` |
| Grey and Greyer | legs, feet | `it_mistfang_glaive` (polearm), `it_greyhide_jerkin` (medium chest), `it_scent_ring` (ring) | `uq_grey_collar` | `it_mount_veilhound` |
| The Horologe | hands, neck | `it_escapement_greataxe` (2H axe), `it_brass_gear_gauntlets` (heavy hands), `it_chronometer_orb` (orb) | `leg_horologe_mainspring` | `uq_horologe_pocketwatch` |
| The Mirror Court | head, chest | `it_silvered_rapier` (rapier), `it_glass_court_robe` (cloth chest), `it_reflecting_bow` (bow) | `uq_mirror_of_the_court` | `it_mirror_court_transmog_token` |
| Anvarr | chest, legs | `it_hollow_titan_maul` (2H mace), `it_heartchamber_legplates` (heavy legs), `it_rubble_sling_wand` (wand) | `uq_anvarr_heartstone` | `it_anvarr_heart_toy` |
| The Curator | head, hands | `it_gallery_warden_staff` (staff), `it_catalogue_gloves` (cloth hands), `it_exhibit_blade` (sword) | `uq_curators_ledger` | `it_gallery_statue_of_you` |
| The Many-Mouthed | legs, neck | `it_toothed_daggers` (daggers), `it_throat_lining_robe` (cloth chest), `it_babble_orb` (orb) | `uq_mouth_that_speaks_true` | `it_many_mouthed_mask` |
| Nhal the Starless | feet, head | `it_starless_greatsword` (2H sword), `it_constellation_staff` (staff), `it_night_scale_boots` (medium feet) | `leg_starless_scale` | `it_mount_starless_drake` |
| Saelith | chest, neck | `it_wardens_glaive` (polearm), `it_nail_keepers_robe` (cloth chest), `it_moonwell_circlet` (light head) | `uq_saelith_spindle` | — |
| The Unwoven | any two tokens | `it_loom_breaker_axe` (2H axe), `it_thread_of_the_world` (ring), `it_unmade_plate` (heavy chest), `it_weft_and_warp_bow` (bow) | `leg_unwoven_spindle` | `it_unwoven_thread_cloak` |
| The Marchheart | any two tokens | `it_continent_shard_staff` (staff), `it_every_road_boots` (feet, any weight) | `leg_first_torch`, `leg_dream_of_the_march` | `it_mount_marchheart_colossus`, `it_marchheart_seed` |

**Feats of r05:** ten hard-mode feats + `ft_r05_every_road`; `ft_r05_dreamkeeper` (secret); `ft_r05_deathless_<boss>`
×11; `ft_r05_speed` (2 hours); `ft_r05_warden_spared` (Saelith joins the Unwoven fight); **playful:**
`ft_r05_mirror_mirror` (win the Mirror Court with a raid of 20 different classes). All hard modes → title *"of the
Veilwoven"*. Mythic Unwoven → title *"Who Held the Thread"*.

---

## 8. World bosses

### 8.1 What a world boss is

Farhold's `data/worldbosses.json` defines a world boss as three things at once, and Wildmarch keeps all three
(reuse: `prototypes/farhold/data/worldbosses.json` `_doc`): it is **over-levelled** for the ground it stands on,
it is **two to three times the size** of anything else there (`scale` 1.9–3.0 on top of the body size), and it
**keeps calling minions** for as long as it lives (`minions: { first, add, every, max, radius, weaken }`). Farhold
also gives each a tier (1–4), a map pin, a chest and phases in the `{ at, modifier, say }` shape
(reuse: `js/actors.js` `applyModifier`, the modifier names in `data/enemies.json` `modifiers`).

**What changes in Wildmarch** (new):

| | Farhold | Wildmarch |
|---|---|---|
| Where | rolled onto map slots per seed (landmark, pass, dungeon, crossing) | **one fixed site per region** from region 3 up (hand-placed, page 01 names the landmark), plus seasonal ones |
| When | always standing | on a **timer** (§8.2), announced |
| Who | the one player | **open tagging** for any number of players (§8.3) |
| Size of fight | scaled to one level | **scaled to the number of players** (§8.3) |
| Mechanics | stat modifiers per phase, minion waves | minion waves **plus** page 11 telegraphs (3–6 abilities each), phases, one dialog line per phase |
| Loot | a chest in the arena, one kill | a personal chest **once per day** per boss, a weekly bonus (§8.4) |

Tier-1 Farhold world bosses (Bramblecoat, the Reedmother, Gravel-Tusk) are too small for this page; they are good
**rare elites** for Hearthvale and Mossfen (page 10's call — §12).

### 8.2 Spawn rules and timers

- **Schedule:** each regional world boss spawns **every 2 hours** of real time, the eight regions staggered by
  15 minutes (Greyridge at :00 of even hours, Sunscar :15, Whisperwood :30, Cinder Steppe :45, Frostmantle at
  :00 of odd hours, Drowned Coast :15, Riftmarch :30, Emberthrone :45). Somewhere on the continent a world boss is
  always 15 minutes or less away.
- **Announcement:** 15 minutes before a spawn, a pin with a countdown appears on that **region's** map and on the
  world map; a line goes to the region's chat channel (*"The ground at Bellows Scar is shaking. (15:00)"*) and — per
  `set.raid.world_boss_alerts` — a toast to everyone in the region (or everywhere). At 1 minute: a horn sound for
  everyone within 400 m.
- **Window:** it stays **30 minutes**. If it is not killed in that time it leaves (*"…and goes back into the
  mountain."*) and the next spawn is on schedule.
- **Reset:** if no eligible player is within **100 m** for **60 s**, it heals 10% per second back to full and its
  minions despawn. It does not leave its arena (80 m radius leash).
- **Tracker:** `scr_world_boss_tracker` (a Journal tab): every world boss, its region, its next spawn time (local
  clock), whether you have looted it today and this week, and a *Guide me* button that sets a map marker.
- **Seasonal bosses** (§8.6) follow their event's calendar instead.

### 8.3 Open tagging, levels and scaling

- **Open tagging:** no party is needed. Any player who, within the arena, deals damage to the boss or its minions,
  heals or shields someone fighting it, or takes damage from it — **1% of the boss's health in total, or 45 s in
  combat inside the arena** — is **credited**: they get the kill, the chest and the quest credit. Parties and raids
  are credited per member the same way.
- **Open group (optional):** entering the arena offers *Join the open group for {boss}* (a temporary public raid of
  up to 60 with raid frames, markers and leader tools; the first 3 players to join get assist). `set.raid.join_open_groups`
  = Ask / Always / Never.
- **Level:** a regional world boss is **the region's top level + 3** (Emberthrone's is level 60 with +20% health and
  damage, an "elite 60"). A player **above** the boss's level is **synced down** to boss level while inside the arena
  (stats only — spells, talents and perks stay); loot rolls at the player's **real** level. A player **below** it
  fights at their own level (it is hard, which is the point).
- **Health scaling:** `health = base × (0.6 + 0.08 × N)` where N = credited players in the arena, recomputed every
  10 s. It can rise at any time but **falls at most 10% per 10 s** (so leaving to make it weaker does not work).
  N is capped at 60 (×5.4 base).
- **Mechanic scaling:** Soak pips = `ceil(N / 5)`, Targeted players = `ceil(N / 8)`, minion waves × `ceil(N / 10)`,
  capped at the Farhold `max` × 3.
- **Warnings:** world bosses use **2.0 s** on everything and **3.0 s** on lethal attacks (crowds are messy).
- **Deaths:** a dead player may be revived by anyone (no combat revive limit in the open world) or release to the
  nearest graveyard (page 05) and run back.

### 8.4 World boss loot

| Reward | Once per | What |
|---|---|---|
| **Personal chest** | day per boss per character | 1 item from the boss's table: Rare floor, 30% Epic, **2%** the boss's unique, **0.5%** a world-boss legendary; gold; region reputation +150 |
| **Weekly bonus** | week per boss per account | +1 Oathstone and a **warded chest** (Farhold chest kind `warded`, reuse: `data/balance.json` `chests.kinds`) with a guaranteed Epic |
| **Mount** | per kill | the boss's mount at **0.5%** per credited player |
| **Title** | first kill of all eight | *"Worldbreaker"* (page 07 titles) |
| **Ember shrine** | first kill of each | lights that region's shrine for `q_the_last_ember` (§7.16) |

Loot scales to the player's **real** level (a level-60 at the Greyridge boss gets level-60 item levels, at the
world-boss rate of §2.10.2).

### 8.5 The eight regional world bosses

Numbers: **base health** is for 5 players (N = 5); multiply by `0.6 + 0.08 × N` for more. Damage against a
reference character **at the boss's level**.

#### 8.5.1 Grief-in-Iron — Greyridge Highlands

| Field | Value |
|---|---|
| id | `b_grief_in_iron` (reuse: Farhold `grief_in_iron`, tier 2) |
| Site | the Bellows Scar, a pass above Anvilgate · level **21** · Farhold `over` +3, `scale` 2.4 |
| Body | `creature:golem ×2.9` at scale 2.4 (≈7 m), body `#5e5a54`, belly `#7e7a72`, accent `#2e2b28`, eyes `#ff8a20`; `barrier` and `sunder` auras (reuse) |
| Base health | **180,000** · leaves after 30 min |
| Phases | 60% *Ironclad* ("Grief-in-Iron shuts its plates and stops caring what you are holding.") — takes 30% less damage from the front; 30% *Vicious* — +25% attack speed (reuse: Farhold `phases`) |
| Minions | construct and dwarf-mine families: first 5–7, +2–3 every 18 s, max 10, weaken 0.8 — `m_construct_mine_sentry` (golem ×1.2) and `m_humanoid_deepforge_deserter` (`chibi2:dwarf/fighter`) |

| Ability | Kind | Shape / colour | Warning | Damage (vs level-21 non-tank ≈ 900 health) | Counterplay |
|---|---|---|---|---|---|
| **Ironmuster** `b_grief_in_iron_muster` | Danger zone | cross, 2 lines 50 m × 5 m, RED | 2.0 s | 700 | diagonals |
| **Plate Shed** `b_grief_in_iron_plates` | Void zone | 4 iron plates fall (circles 4 m, PURPLE-black, 45 s) | 2.0 s | 60 / tick | step out; plates become cover |
| **Grinding Grip** `b_grief_in_iron_grip` | Tank | melee | — | 400 + Sunder | swap between players who can take it |
| **Pass Holder** `b_grief_in_iron_hold` | Soak | ORANGE 6 m, `ceil(N/5)` pips | 3.0 s | 2,000 × N/5 split | enough people stand in it |

Loot: `uq_griefplate_gauntlets` (hands, heavy: blocking gives a 5% armour stack, max 5), `it_mount_mine_crawler`
(`creature:beetle ×1.6`, iron), Greyridge reputation.

#### 8.5.2 The Glass Wyrm — Sunscar Barrens

| Field | Value |
|---|---|
| id | `b_glass_wyrm` (new) |
| Site | the Shattered Pan, a salt flat south of the Glass Tombs · level **27** · scale 2.6 |
| Body | `creature:worm ×3.4` at scale 2.6 (≈9 m long out of the ground), body `#d8b070` sand with **glass plates** `#c8f0ff` (`plates` on), eyes `#ffe060` |
| Base health | **300,000** |
| Phases | 60% *Scorched* (sand turns to glass under it); 25% *Frenzied* |
| Minions | `m_beast_sand_skitter` (`creature:beetle ×1.0`), `m_aberration_glass_grub` (`creature:worm ×0.6`) first 6, +3 / 16 s, max 12 |

| Ability | Kind | Shape / colour | Warning | Damage (vs ≈1,100) | Counterplay |
|---|---|---|---|---|---|
| **Glass Storm** `b_glass_wyrm_storm` | Void zone | 6 circles 5 m of glass shards, 40 s | 2.0 s | 80 / tick | leave |
| **Burrow Line** `b_glass_wyrm_burrow` | Danger zone | it dives and a line 40 m × 6 m RED marks where it will breach | 2.5 s | 900 + knock-up | step out |
| **Sun-Glare** `b_glass_wyrm_glare` | Line of sight | Room-wide flash off its glass plates | 3.0 s | 700 + Blind 4 s | turn your back (face away) or stand behind a mesa rock |
| **Tail Sweep** `b_glass_wyrm_tail` | Danger zone | cone 120° 14 m behind the head | 2.0 s | 800 | not behind |

Loot: `uq_glasswyrm_scale_ring` (ring: 5% of damage taken is reflected as glass shards), `it_mount_sand_strider`
(`creature:elk`, desert colours).

#### 8.5.3 The Hungering Brood — Whisperwood

| Field | Value |
|---|---|
| id | `b_hungering_brood` (reuse: Farhold `the_hungering_brood`, tier 2) |
| Site | the Silkfall, a hollow of dead moonwell trees · level **33** · scale 2.2 |
| Body | `creature:spider ×3.0` at scale 2.2, body `#2a2a30`, accent `#8a2020`, eyes `#e02020`; `poison` and `root` auras (reuse) |
| Base health | **450,000** |
| Phases | 45% *Venomous* (reuse) — every bite poisons |
| Minions | `m_beast_brood_spiderling` (`creature:spider ×0.8`) first 8, +4 / 12 s, max 16 |

| Ability | Kind | Shape / colour | Warning | Damage (vs ≈1,400) | Counterplay |
|---|---|---|---|---|---|
| **Brood Web** `b_hungering_brood_web` | Tether | WHITE web strands between `ceil(N/8)` pairs of players; rooted while linked | 2.0 s | 100 / s | a third player cuts the strand (it has 3% of a player's health) |
| **Egg Sacs** `b_hungering_brood_eggs` | Adds | 4 sacs hatch in 15 s | 15 s | spiderlings | break them first |
| **Venom Spray** `b_hungering_brood_spray` | Danger zone | cone 60° 16 m | 2.0 s | 900 + poison | sides |
| **Drop from the Canopy** `b_hungering_brood_drop` | Targeted | circle 6 m YELLOW | 2.0 s | 800 | spread |

Loot: `uq_brood_silk_wraps` (light hands: your roots last 1 s longer), `it_mount_silkfall_spider` (a white
`creature:spider` mount, if page 07 allows spider mounts).

#### 8.5.4 The Carrion Crown — Cinder Steppe

| Field | Value |
|---|---|
| id | `b_carrion_crown` (reuse: Farhold `the_carrion_crown`, tier 4) |
| Site | the Bone Mesa, above an old Ashtusk battlefield · level **39** · scale 3.0 |
| Body | `creature:griffin ×3.0` at scale 3.0, carrion colours `#4a3a2a` / `#8a7a5a`, eyes `#ff4020`; `bleed`, `haste`, `marked` auras (reuse) |
| Base health | **650,000** |
| Phases | 60% *Fleet*; 30% *Frenzied* (reuse) |
| Minions | `m_beast_carrion_vulture` (`creature:owl ×1.4`, bald, grey) and Ashtusk raiders (reuse: warband `ashtusk_raider`) first 6, +3 / 15 s, max 12 |

| Ability | Kind | Shape / colour | Warning | Damage (vs ≈1,800) | Counterplay |
|---|---|---|---|---|---|
| **Carrion Circles** `b_carrion_crown_circles` | Void zone (moving) | 3 shadows 6 m circle on the ground (it circles overhead), PURPLE-black, moving 4 m/s | 2.0 s | 150 / tick | stay out of the shadows |
| **Dive** `b_carrion_crown_dive` | Danger zone | line 50 m × 6 m | 2.0 s | 1,300 + bleed | sidestep |
| **Pick the Weak** `b_carrion_crown_pick` | Targeted | circle 5 m YELLOW on the **lowest-health** players | 2.0 s | 1,000 | heal them up; spread |
| **Crown of Bones** `b_carrion_crown_crown` | Soak | ORANGE 8 m `ceil(N/5)` pips | 3.0 s | 3,500 × N/5 split | soak |

Loot: `uq_carrion_crown_talons` (medium hands: +10% damage to enemies below 30%), `it_mount_carrion_griffin`
(`creature:griffin`, ragged; winged mount: runs and glides before Riding IV, flies after (page 07, level 60)).

#### 8.5.5 The Standing Ruin — Frostmantle

| Field | Value |
|---|---|
| id | `b_standing_ruin` (reuse: Farhold `the_standing_ruin`, tier 4) |
| Site | the Broken Circle, a ring of fallen standing stones below Rimehold · level **45** · scale 3.0 |
| Body | `creature:titan ×3.0` at scale 3.0 (≈11 m), frost-rimed stone `#6a7078`, eyes `#9ad8ff`; `barrier`, `sunder`, `rally` (reuse) |
| Base health | **900,000** |
| Phases | reuse Farhold: *Ironclad*, *Unyielding*, *Vicious* at 70/40/20% |
| Minions | Stonehide warband (reuse: `stonehide_smasher`, `stonehide_hurler`) first 5, +2 / 20 s, max 10 |

| Ability | Kind | Shape / colour | Warning | Damage (vs ≈2,000) | Counterplay |
|---|---|---|---|---|---|
| **Standing Stones** `b_standing_ruin_stones` | Danger zone → blocker | 5 circles 5 m RED; a stone stands there 60 s | 2.0 s | 1,500 | out; the stones are cover |
| **Ruinous Roar** `b_standing_ruin_roar` | Line of sight | Room-wide | 3.5 s | 1,600 + knockback | behind a standing stone |
| **Frost Stomp** `b_standing_ruin_stomp` | Danger zone | circle 14 m around it | 2.0 s | 1,200 + slow | out |
| **Hold the Circle** `b_standing_ruin_hold` | Soak | 2 × ORANGE 6 m, `ceil(N/10)` pips each | 3.0 s | split | soak |

Loot: `uq_ruinstone_helm` (heavy head: standing still 2 s gives 15%
damage reduction until you move), `it_mount_frost_ram` (`creature:deer`, curled horns, white).

#### 8.5.6 The Sallow King — The Drowned Coast

| Field | Value |
|---|---|
| id | `b_sallow_king` (reuse: Farhold `the_sallow_king`, tier 3) |
| Site | the Drowned Barrow, a tidal causeway north of Saltmarch · level **51** · scale 2.6 |
| Body | `creature:wraith ×3.2` at scale 2.6, `#6a7a6a`, eyes `#c8ff80`; `curse` and `marked` auras (reuse) |
| Base health | **1,200,000** |
| Phases | reuse: *Graveborn* 60%, *Leeching* 30% |
| Minions | `m_undead_drowned_sailor`, `m_undead_drowned_chorister` (r03 trash, weaker) first 6, +3 / 16 s, max 12 |

| Ability | Kind | Shape / colour | Warning | Damage (vs ≈2,600) | Counterplay |
|---|---|---|---|---|---|
| **Sallow Tide** `b_sallow_king_tide` | Void zone (rising) | the causeway floods from the edges every 60 s; water ticks 150 and slows | 6 s | 150 / tick | keep to the causeway's crown |
| **Sallow Curse** `b_sallow_king_curse` | Dispel | a curse on `ceil(N/8)` players: 200/s; spreads to anyone within 4 m when dispelled | — | 200/s | move apart, then remove the curse |
| **Grasping Dead** `b_sallow_king_grasp` | Tether | WHITE hands grab players' feet, rooting 4 s | 1.5 s | — | break with a movement ability |
| **King's Lament** `b_sallow_king_lament` | Room-wide | every 45 s | 2.0 s | 1,400 | heal |

Loot: `uq_sallow_crown` (head: your curses last 20% longer and heal you 1% of damage dealt), `it_mount_drowned_horse`
(`creature:courser`, kelp and bones).

#### 8.5.7 The Unmoored — The Riftmarch

| Field | Value |
|---|---|
| id | `b_unmoored` (new) |
| Site | the Anchorless Field, floating stones above a torn valley · level **57** · scale 2.8 |
| Body | `creature:horror ×3.4` at scale 2.8, body `#4a3f7a` with orbiting stones (a ring of `shard` bodies ×0.6 circling it), eyes `#e0c0ff`; `enchant` aura |
| Base health | **1,600,000** |
| Phases | 60% *Warded*; 30% *Wizened* (reuse modifier names) |
| Minions | `m_elemental_rift_shard` (r05 trash, weakened 0.6) and `m_fiend_rift_imp`, first 6, +3 / 14 s, max 14 |

| Ability | Kind | Shape / colour | Warning | Damage (vs ≈3,200) | Counterplay |
|---|---|---|---|---|---|
| **Gravity Flip** `b_unmoored_flip` | Room-wide / Safe zone | gravity lets go: everyone floats 4 s except inside BLUE anchor circles (`3 × ceil(N/10)` of them, 4 m each) | 3.0 s | floating players take 1,800 on landing | be in an anchor circle |
| **Drifting Stones** `b_unmoored_stones` | Moving wave | 4 stones cross the field at 5 m/s along drawn lines | 2.0 s | 2,000 | dodge |
| **Rift Pull** `b_unmoored_pull` | Void zone (pulling) | circle 6 m that pulls within 15 m | 2.0 s | 300 / tick | walk out against it |
| **Split** `b_unmoored_split` | Adds | at 50%: two copies (15% health each) that must die within 15 s | 3 s | — | split damage |

Loot: `uq_unmoored_anchor` (off-hand: immune to knockback and pull effects 3 s after taking one, 20 s cooldown),
`it_mount_floating_stone` (a floating slab you ride — a hover mount).

#### 8.5.8 Slagborn — The Emberthrone

| Field | Value |
|---|---|
| id | `b_slagborn` (reuse: Farhold `slagborn`, tier 3 → raised to the top tier here) |
| Site | the Slag Sea, a cooling lava plain under the palace · level **60 elite** · scale 3.0 |
| Body | `creature:elemental ×3.2` at scale 3.0, body `#ff6a20`, belly `#ffd070`, accent `#7a1a00`; `burn` and `enchant` (reuse) |
| Base health | **2,000,000** (+20% elite) |
| Phases | reuse: *Fiery* 60%, *Frenzied* 30% |
| Minions | Ember Legion (r04 trash, weakened 0.6) and `m_elemental_cinder_elemental`, first 6, +3 / 15 s, max 14 |

| Ability | Kind | Shape / colour | Warning | Damage (vs ≈3,600) | Counterplay |
|---|---|---|---|---|---|
| **Slag Rain** `b_slagborn_rain` | Void zone | 8 circles 5 m of lava, 60 s | 2.0 s | 400 / tick | out |
| **Ember Soak** `b_slagborn_soak` | Soak | ORANGE 7 m, `ceil(N/5)` pips | 3.0 s | 5,000 × N/5 split | soak |
| **Crust Break** `b_slagborn_crust` | Danger zone (lethal) | a 20 m circle of the plain cracks open | **3.0 s** | **Lethal** | out |
| **Molten Core** `b_slagborn_core` | Room-wide | every 40 s, +10% each | 2.0 s | 1,800 | heal |

Loot: `uq_slagborn_core` (necklace: fire damage you take is 10% lower and 10% of it is added to your next fire hit),
`it_mount_magma_salamander` (`creature:crocodile`, lava seams).

### 8.6 Seasonal and event world bosses (new)

Seasonal bosses appear during their event (page 14 owns the calendar) at a fixed site, spawn **every hour** of the
event, and are **level-synced to the event**: every participant is scaled to the **median level** of the credited
players (up or down), so a level-8 and a level-60 fight it together and both get loot at their real level.

| id | Name | Event (season) | Site | Body | Base health (at level 60 sync) |
|---|---|---|---|---|---|
| `b_harvest_effigy` | The Harvest Effigy | *Harvestide* (autumn, 2 weeks) | Brightwater's fields, Hearthvale | `creature:golem ×3.0` of straw and pumpkins: body `#c8a040`, belly `#e86a20`, accent `#5a3a1a`, eyes `#ffb020` (candle eyes) | 1,400,000 |
| `b_longnight_stag` | The Longnight Stag | *Longnight* (midwinter, 2 weeks) | the frozen lake at Rimehold, Frostmantle | `creature:elk ×3.4`, white with a lantern hung in each antler (`glow`), eyes `#9ad8ff` | 1,400,000 |
| `b_bloomtyrant` | The Bloomtyrant | *Firstbloom* (spring, 2 weeks) | the moonwell meadow, Whisperwood | `creature:mushroom ×4.0`, cap `#a64b62` with flowers, `slime` spores | 1,400,000 |
| `b_sunwake_serpent` | The Sunwake Serpent | *Highsun* (summer, 2 weeks) | the sandbar at Saltmarch, Drowned Coast | `creature:snake ×8.0`, gold and blue `#e8b830` / `#3a8ac0`, `haste` | 1,400,000 |
| `b_veilstorm_herald` | The Veilstorm Herald | *Veilstorm* (random 3-day event after r05 release; a Veil tear opens in a random region) | a random region's centre | `creature:wraith ×4.0` of white threads (a small cousin of the Unwoven) | 1,800,000 |

**The Harvest Effigy** — `b_harvest_effigy`

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Harvest Ring** `b_harvest_effigy_ring` | Danger zone (donut) | RED from 6 m to 24 m; safe inside | 2.0 s | 50% of a non-tank's health | run in |
| **Scythe Sweep** `b_harvest_effigy_scythe` | Danger zone | cone 180° 14 m | 2.0 s | 40% | behind |
| **Scarecrows** `b_harvest_effigy_scarecrows` | Adds | `m_construct_scarecrow` (golem ×1.2, straw) × `ceil(N/5)` | 3 s | — | kill; burn them for double damage |
| **Bring in the Sheaves** `b_harvest_effigy_sheaves` | Soak | ORANGE 6 m, `ceil(N/5)` pips | 3.0 s | split | soak — each soaker gets a pumpkin (a thrown item, 5% boss health) |

Loot: `it_pumpkin_lantern` (light slot, cosmetic look), `it_harvest_scythe_skin`, `it_mount_haywain_pony`
(`creature:pony` in harvest ribbons) 1%, `uq_effigys_candle_eyes` (head: +5% damage while in the dark).

**The Longnight Stag** — `b_longnight_stag`

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Lantern Light** `b_longnight_stag_lanterns` | Beneficial | 4 GREEN 6 m lantern-lights drop from its antlers; outside them, **Longnight** cold 3% health/s | — | — | stay in the lights |
| **Antler Charge** `b_longnight_stag_charge` | Danger zone | line 40 m × 6 m | 2.0 s | 45% | sidestep |
| **Ice Cracks** `b_longnight_stag_cracks` | Checkerboard | the frozen lake in a 6 m checkerboard, RED squares | 2.0 s | 50% + slow | unlit squares |
| **Snowfall Hush** `b_longnight_stag_hush` | Interrupt (gold) | cast 4.0 s: puts out 2 lanterns | 4.0 s | — | interrupt |

Loot: `it_longnight_lantern_antlers` (head cosmetic), `it_mount_longnight_stag` (`creature:elk` with lanterns) 1%,
`uq_stags_lantern` (light: allies in your light take 5% less cold damage).

**The Bloomtyrant** — `b_bloomtyrant`

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Spore Cloud** `b_bloomtyrant_spores` | Void zone | 8 circles 5 m of spores, 30 s; each becomes a `m_aberration_sporeling` if nobody stands in it for 1 s (a soak-to-deny) | 2.0 s | 5% / tick | stand in one briefly to pop it, then leave |
| **Root Snare** `b_bloomtyrant_roots` | Tether | WHITE roots between the boss and `ceil(N/8)` players; they are pulled 2 m/s | 2.0 s | — | walk out |
| **Bloom** `b_bloomtyrant_bloom` | Room-wide | every 45 s | 2.0 s | 30% | heal |
| **Pollen Burst** `b_bloomtyrant_pollen` | Targeted | YELLOW 5 m | 2.0 s | 35% + confused 2 s | spread |

Loot: `it_flower_crown_bloom` (head cosmetic), `it_mount_bloom_toad` (`creature:frog ×2.4`, mossy, flowers) 1%,
`uq_tyrants_seed` (necklace: your heals leave a 3 m flower that heals 1% per second for 5 s).

**The Sunwake Serpent** — `b_sunwake_serpent`

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Sunwake** `b_sunwake_serpent_wake` | Moving wave | a wave rolls up the sandbar, one BLUE gap | 2.0 s | 45% + knockback | the gap |
| **Glare** `b_sunwake_serpent_glare` | Line of sight | Room-wide from its golden scales | 3.0 s | 40% + blind | behind the beach rocks or its own coils |
| **Coil Ring** `b_sunwake_serpent_coil` | Danger zone (donut) | RED outside 10 m | 2.0 s | 50% | in close |
| **Tide Pools** `b_sunwake_serpent_pools` | Beneficial | 3 GREEN pools: +20% damage for 10 s | — | — | take turns |

Loot: `it_sunwake_parasol` (a held-item toy), `it_mount_sunwake_serpent` (a swimming serpent mount) 1%,
`uq_sunwake_scale` (ring: +8% movement speed; +20% in water).

**The Veilstorm Herald** — `b_veilstorm_herald`

A preview of r05 for everyone: it teaches the Veil (§7.1) at open-world scale. Players can cross into a local Veil
through 4 rifts around it; it is **invulnerable unless at least `ceil(N/5)` players are in the Veil**; Veil-only
telegraphs; the 60 s Veil limit. Abilities: **Loose Threads** (Tether, pulls toward it), **Unravel Line**
(Danger zone line 40 m), **Fray** (Void zones), **Knot** (Soak `ceil(N/5)`). Loot: `it_veilstorm_thread_cape`
(cosmetic), `uq_veilstorm_lens` (head: Veil-only telegraphs show faintly for you in the open world), and Oathstones ×1
per day.

### 8.7 World boss quests and feats

- Each regional world boss has a **weekly** quest from its region's hub (`q_world_boss_<region>` — e.g.
  `q_world_boss_greyridge` "Iron in the Pass"): kill it once; reward: Oathstone ×1, reputation, 1 region currency.
  Page 14 lists them.
- Feats: `ft_wb_<bossid>` per boss, `ft_wb_worldbreaker` (all eight), `ft_wb_seasons` (all four seasonal),
  `ft_wb_small_army` (be credited on a kill with fewer than 5 players), `ft_wb_big_army` (be in a kill with 60).

---

## 9. Loot index

For [page 09](09-SETS-LEGENDARIES.md) to index and [page 08](08-ITEMS.md) to price. Every item here has a source on this
page (canon rule 4: no orphan loot).

### 9.1 Raid sets

| id | Name | Raid | Pieces (6) | Token ids | Bonus shape |
|---|---|---|---|---|---|
| `set_ninefold_oath` | The Ninefold Oath | r01 | `it_ninefold_crownhelm`, `…_hauberk`, `…_greaves`, `…_grips`, `…_sabatons`, `…_torc` | `it_token_r01_<head\|chest\|legs\|hands\|feet\|neck>` | 2/4/6 per role (§3.12) |
| `set_rimebound_court` | The Rimebound Court | r02 | `it_rimebound_crown`, `…_mantle`, `…_legwraps`, `…_gauntlets`, `…_boots`, `…_pendant` | `it_token_r02_<slot>` | §4.14 |
| `set_drowned_choir` | Vestments of the Drowned Choir | r03 | `it_drowned_choir_cowl`, `…_vestment`, `…_leggings`, `…_gloves`, `…_sandals`, `…_bell_pendant` | `it_token_r03_<slot>`, Mythic `it_token_r03m_<slot>` | §5.14 |
| `set_emberlord_regalia` | The Emberlord Regalia | r04 | `it_emberlord_crown`, `…_robes`, `…_legguards`, `…_gauntlets`, `…_treads`, `…_chain` | `it_token_r04_<slot>`, `it_token_r04m_<slot>` | §6.15 |
| `set_veilwoven` | The Veilwoven Raiment | r05 | `it_veilwoven_circlet`, `…_robe`, `…_leggings`, `…_gloves`, `…_boots`, `…_spindle` | `it_token_r05_<slot>`, `it_token_r05m_<slot>` | §7.17 |

Each piece id takes a weight suffix: `_cloth`, `_light`, `_medium`, `_heavy` (e.g. `it_ninefold_hauberk_heavy`). A
raid set is **generic** (any class) with a **role-following** bonus; class sets stay on the class pages.

### 9.2 Raid and world-boss legendaries

| id | Source | Chance |
|---|---|---|
| `leg_crown_of_the_ninth` | r01 secret, the Ninth Heir | guaranteed (one player) |
| `leg_kingsblade_of_hrodric` | r01 the Barrowking | 4% |
| `leg_marrow_reliquary` | r01 the Ossuary Warden | 3% |
| `leg_heart_of_the_sleeper` | r02 secret, Vorm | guaranteed |
| `leg_ysmeres_long_winter` | r02 Queen Ysmere | 4% |
| `leg_windmothers_last_feather` | r02 Skathra | 3% |
| `leg_the_unsung_note` | r03 secret, the Unsung | guaranteed |
| `leg_choirmasters_ninth_eye` | r03 the Choirmaster | 4% |
| `leg_grimwaters_last_broadside` | r03 Captain Grimwater | 4% |
| `leg_kiln_heart` | r04 secret, Prince Aurel | guaranteed |
| `leg_crown_of_kaedros` | r04 the Ember King | 3% |
| `leg_emberwing_pinion` | r04 Vaelkyr | 4% |
| `leg_first_torch` | r05 secret, the Marchheart | guaranteed to every player, once per account |
| `leg_dream_of_the_march` | r05 secret, the Marchheart | guaranteed (one player) |
| `leg_unwoven_spindle` | r05 the Unwoven | 3% |
| `leg_starless_scale` | r05 Nhal | 3% |
| `leg_horologe_mainspring` | r05 the Horologe | 3% |

(World bosses drop "a world-boss legendary" at 0.5% from their region's page 09 list — no world-boss-exclusive
legendary is defined here; page 09 may add one per region.)

### 9.3 Raid and world-boss uniques

r01: `uq_votive_of_the_last_sister`, `uq_sextons_lantern`, `uq_gravewarden_oathband`, `uq_gullet_of_the_rotmaw`,
`uq_ossuary_bonewraps`.
r02: `uq_hailwrights_tongs`, `uq_councils_three_rings`, `uq_rimefang_collar`, `uq_whiteout_lantern`,
`uq_glacier_throne_signet`.
r03: `uq_brinecoil_fang`, `uq_abbess_bell_staff`, `uq_pearl_and_nacre`, `uq_cantors_tuning_fork`,
`uq_saltbound_knuckles`.
r04: `uq_petition_of_the_three_houses`, `uq_brandts_champion_plume`, `uq_varros_leash`, `uq_cinderjaw_grille`,
`uq_hestas_apprentice_hammer`, `uq_ashen_herald_feather`.
r05: `uq_saelith_spindle`, `uq_horologe_pocketwatch`, `uq_grey_collar`, `uq_threshold_keystone`,
`uq_mirror_of_the_court`, `uq_anvarr_heartstone`, `uq_curators_ledger`, `uq_mouth_that_speaks_true`.
World bosses: `uq_griefplate_gauntlets`, `uq_glasswyrm_scale_ring`, `uq_brood_silk_wraps`, `uq_carrion_crown_talons`,
`uq_ruinstone_helm`, `uq_sallow_crown`, `uq_unmoored_anchor`, `uq_slagborn_core`.
Seasonal: `uq_effigys_candle_eyes`, `uq_stags_lantern`, `uq_tyrants_seed`, `uq_sunwake_scale`, `uq_veilstorm_lens`.

### 9.4 Mounts

r01 `it_mount_rotmaw_hatchling`, `it_mount_barrow_charger`, `it_mount_heirs_palfrey` · r02 `it_mount_rimefang_pup`,
`it_mount_windmother_fledgling`, `it_mount_glacier_stag`, `it_mount_stoneback_tortoise` · r03
`it_mount_widows_due_skiff`, `it_mount_choir_leviathan`, `it_mount_still_water_heron` · r04 `it_mount_ash_hound`,
`it_mount_emberwing_whelp`, `it_mount_ashen_phoenix`, `it_mount_ember_throne_titan`, `it_mount_glass_charger` · r05
`it_mount_veilhound`, `it_mount_starless_drake`, `it_mount_marchheart_colossus` · world bosses `it_mount_mine_crawler`,
`it_mount_sand_strider`, `it_mount_silkfall_spider`, `it_mount_carrion_griffin`, `it_mount_frost_ram`,
`it_mount_drowned_horse`, `it_mount_floating_stone`, `it_mount_magma_salamander` · seasonal `it_mount_haywain_pony`,
`it_mount_longnight_stag`, `it_mount_bloom_toad`, `it_mount_sunwake_serpent`.

### 9.5 Currency, keys and quest items

`cur_oathstone` (raid currency, §2.10) · attunement: `it_barrow_key`, `it_gravemarshal_seal`, `it_sextons_tabard`,
`it_hearthcoal`, `it_choirbook_page`, `it_legion_tabard`, `it_court_writ`, `it_ninefold_seal`, `it_throne_shard`,
`it_choirbook_clasp`, `it_crown_ember`, `it_veil_key`, `it_veil_lens` · in-raid: `it_sextons_bell`,
`it_grimwaters_chart`, `it_kiln_key_fragment`, `it_prince_aurel_signet` · the long quest: `it_hearthvale_ember`.

---

## 10. Id index

### 10.1 Bosses

| Raid | # | id | Name | Body |
|---|---|---|---|---|
| r01 | 1 | `b_ossuary_warden` | The Ossuary Warden | creature golem |
| r01 | 2 | `b_sister_candlemourn` | Sister Candlemourn | Chibi 2 undead / priest |
| r01 | 3 | `b_gravewardens` (`b_gravewarden_hask`, `b_gravewarden_hollin`) | The Gravewardens, Hask and Hollin | Chibi 2 undead / warrior, knight |
| r01 | 4 | `b_rotmaw` | The Rotmaw | creature worm |
| r01 | 5 | `b_barrowking_hrodric` | The Barrowking, Hrodric Ninefold | Chibi 2 undead / knight |
| r01 | S | `b_ninth_heir` | The Ninth Heir | creature wraith |
| r02 | 1 | `b_rimefang_matriarch` | Rimefang Matriarch | creature dire_wolf |
| r02 | 2 | `b_borga_hailwright` | Borga the Hailwright | Chibi 2 giant / runesmith |
| r02 | 3 | `b_whiteout` | The Whiteout | creature elemental |
| r02 | 4 | `b_skathra_windmother` | Skathra, the Wind-Mother | creature griffin |
| r02 | 5 | `b_council_of_cold` (`b_frostsayer_ulka`, `b_frostsayer_torv`, `b_frostsayer_ymma`) | The Council of Cold | Chibi 2 giant / shaman, oracle, sorcerer |
| r02 | 6 | `b_queen_ysmere` | Queen Ysmere of the Glacier Throne | Chibi 2 giant / knight → creature titan |
| r02 | S | `b_vorm_sleeper` | Vorm, the Sleeper Under the Glacier | creature titan |
| r03 | 1 | `b_saltbound_colossus` | The Saltbound Colossus | creature golem |
| r03 | 2 | `b_mother_brinecoil` | Mother Brinecoil | creature snake |
| r03 | 3 | `b_drowned_cantor` | The Drowned Cantor | Chibi 2 undead / enchanter |
| r03 | 4 | `b_captain_grimwater` | Captain Ilse Grimwater and the Last Crew | Chibi 2 undead / rogue |
| r03 | 5 | `b_pearl_twins` (`b_twin_pearl`, `b_twin_nacre`) | The Pearl Twins | creature shard ×2 |
| r03 | 6 | `b_abbess_marenne` | Abbess Marenne of the Deep Choir | Chibi 2 undead / cleric |
| r03 | 7 | `b_choirmaster` | The Choirmaster, Who Sings the Sea | creature horror |
| r03 | S | `b_the_unsung` | The Unsung | creature wisp |
| r04 | 1 | `b_cinderjaw` | Cinderjaw, the Gate That Walks | creature titan |
| r04 | 2 | `b_kennelmaster_varro` (+ `b_hound_scorch`, `b_hound_soot`) | Kennelmaster Varro, with Scorch and Soot | Chibi 2 orc / tactician + creature hound ×2 |
| r04 | 3 | `b_three_petitioners` (`b_petitioner_sabeth`, `b_petitioner_dorrin`, `b_petitioner_oruk`) | The Three Petitioners | Chibi 2 elf / warlock, dwarf / knight, orc / pyromancer |
| r04 | 4 | `b_forgequeen_hesta` | Forge-Queen Hesta | Chibi 2 dwarf / runesmith |
| r04 | 5 | `b_castellan_brandt` | Lord Castellan Aurel Brandt | Chibi 2 human / knight |
| r04 | 6 | `b_vaelkyr_emberwing` | Vaelkyr, the Emberwing Consort | creature dragon |
| r04 | 7 | `b_ashen_herald` | The Ashen Herald | creature phoenix |
| r04 | 8 | `b_ember_king_kaedros` | Kaedros, the Ember King | Chibi 2 human / pyromancer → creature titan |
| r04 | S | `b_heir_in_the_kiln` | Prince Aurel, the Heir in the Kiln | Chibi 2 human / paladin (glass) |
| r05 | 1 | `b_threshold` | The Threshold | creature shard |
| r05 | 2 | `b_grey_and_greyer` (`b_veilhound_grey`, `b_veilhound_greyer`, Mythic `b_veilhound_greyest`) | Grey and Greyer, the Veilhounds | creature dire_wolf ×2 |
| r05 | 3 | `b_horologe` | The Horologe | creature golem |
| r05 | 4 | `b_mirror_court` (`b_mirror_reflection_<class>`) | The Mirror Court | Chibi 2 copies of the raid's classes |
| r05 | 5 | `b_anvarr_hollow_titan` | Anvarr, the Hollow Titan | creature titan |
| r05 | 6 | `b_curator` | The Curator | creature wraith |
| r05 | 7 | `b_many_mouthed` | The Many-Mouthed | creature horror |
| r05 | 8 | `b_nhal_starless` | Nhal the Starless | creature dragon |
| r05 | 9 | `b_saelith_veilwarden` | Saelith, the Veilwarden | Chibi 2 elf / oracle |
| r05 | 10 | `b_unwoven` | The Unwoven | creature horror → wraith |
| r05 | S | `b_marchheart` | The Marchheart, the Wildmarch Dreaming | creature titan |
| World | 3 | `b_grief_in_iron` | Grief-in-Iron (Greyridge) | creature golem |
| World | 4 | `b_glass_wyrm` | The Glass Wyrm (Sunscar) | creature worm |
| World | 5 | `b_hungering_brood` | The Hungering Brood (Whisperwood) | creature spider |
| World | 6 | `b_carrion_crown` | The Carrion Crown (Cinder Steppe) | creature griffin |
| World | 7 | `b_standing_ruin` | The Standing Ruin (Frostmantle) | creature titan |
| World | 8 | `b_sallow_king` | The Sallow King (Drowned Coast) | creature wraith |
| World | 9 | `b_unmoored` | The Unmoored (Riftmarch) | creature horror |
| World | 10 | `b_slagborn` | Slagborn (Emberthrone) | creature elemental |
| Seasonal | — | `b_harvest_effigy`, `b_longnight_stag`, `b_bloomtyrant`, `b_sunwake_serpent`, `b_veilstorm_herald` | Harvest Effigy, Longnight Stag, Bloomtyrant, Sunwake Serpent, Veilstorm Herald | golem, elk, mushroom, snake, wraith |

Ability ids follow `<bossid>_<snake>` and are listed in each boss's table. Boss lines follow `bl_<bossid>_<snake>`
(written out in full for r01; later raids give the lines inline and the builder assigns `bl_` ids in the same
pattern).

### 10.2 Monsters (86)

`m_aberration_bell_jelly`, `m_aberration_crevasse_crawler`, `m_aberration_deep_lurker`, `m_aberration_glass_grub`,
`m_aberration_grave_grub`, `m_aberration_loom_spider`, `m_aberration_pearl_mite`, `m_aberration_quire_tentacle`,
`m_aberration_rot_lurker`, `m_aberration_sporeling`, `m_aberration_the_mouth`, `m_aberration_veil_shade`,
`m_aberration_veil_stalker`, `m_beast_ash_hound`, `m_beast_brine_eel`, `m_beast_brood_spiderling`,
`m_beast_carrion_bat`, `m_beast_carrion_vulture`, `m_beast_crypt_rat`, `m_beast_eyrie_fledgling`, `m_beast_frost_owl`,
`m_beast_glacier_bear`, `m_beast_magma_salamander`, `m_beast_moth_of_memory`, `m_beast_reef_crawler`,
`m_beast_rimefang_wolf`, `m_beast_sand_skitter`, `m_beast_wreck_gull`, `m_construct_clockwork_sentry`,
`m_construct_coral_sentinel`, `m_construct_escapement`, `m_construct_forged_legionnaire`, `m_construct_ice_sentinel`,
`m_construct_mine_sentry`, `m_construct_obsidian_sentinel`, `m_construct_ossuary_bonewalker`, `m_construct_scarecrow`,
`m_construct_threshold_warden`, `m_dragonkin_emberwing_drake`, `m_dragonkin_fire_whelp`, `m_dragonkin_starless_whelp`,
`m_elemental_brine_elemental`, `m_elemental_cinder_elemental`, `m_elemental_living_cinder`, `m_elemental_rift_shard`,
`m_elemental_rime_shard`, `m_elemental_snow_wisp`, `m_elemental_unwoven_thread`, `m_fiend_ember_imp`,
`m_fiend_hail_imp`, `m_fiend_rift_imp`, `m_humanoid_court_courtier`, `m_humanoid_court_guard`,
`m_humanoid_deepforge_deserter`, `m_ember_crossbow`, `m_ember_legionnaire`,
`m_ember_pyrecaller`, `m_giant_stonehide_frostsayer`, `m_giant_stonehide_hurler`,
`m_giant_stonehide_icebreaker`, `m_giant_stonehide_stalker`, `m_humanoid_throne_guard`,
`m_humanoid_tidebound_cultist`, `m_humanoid_veil_oracle`, `m_humanoid_veil_sentinel`, `m_undead_barrow_heir`,
`m_undead_barrow_herald`, `m_undead_barrow_hound`, `m_undead_barrow_knight`, `m_undead_barrow_shieldbearer`,
`m_undead_barrow_spearman`, `m_undead_boarding_cutthroat`, `m_undead_bone_archer`, `m_undead_catacomb_sexton`,
`m_undead_choir_warden`, `m_undead_drowned_chorister`, `m_undead_drowned_sailor`, `m_undead_frozen_soldier`,
`m_undead_grave_acolyte`, `m_undead_heir_shade`, `m_undead_memory_of_the_fallen`, `m_undead_mourner`,
`m_undead_ossuary_skull_swarm`, `m_undead_powder_monkey`, `m_undead_saltbound_deacon`, `m_undead_weeping_widow`.

### 10.3 Everything else

- **Raids:** `r01_barrowking`, `r02_glacier_throne`, `r03_sunken_choir`, `r04_ember_court`, `r05_veilspire` (canon).
- **Quests:** `q_attune_barrowking`, `q_attune_glacier_throne`, `q_attune_sunken_choir`, `q_attune_ember_court`,
  `q_attune_veilspire`, `q_the_last_ember`, `q_world_boss_<region>` ×8 (greyridge, sunscar, whisperwood,
  cinder_steppe, frostmantle, drowned_coast, riftmarch, emberthrone).
- **NPCs:** `npc_sexton_alder`, `npc_quartermaster_hrefna`, `npc_warden_captain_ingrid`, `npc_bellwright_osk`,
  `npc_ferryman_gull`, `npc_ashwarden_tamsin`, `npc_veilfactor_ilo`, `npc_spirit_smith`. Boss-adjacent named
  characters who are not bosses: Tobbin (Hesta's apprentice), Queen Sabeth when allied — page 01 may give them `npc_` ids.
- **Dialog opportunities (12):** `dlg_b_sister_candlemourn_vigil`, `dlg_b_barrowking_hrodric_crown`,
  `dlg_b_queen_ysmere_fire`, `dlg_b_captain_grimwater_parley`, `dlg_b_choirmaster_sing`,
  `dlg_b_three_petitioners_choose`, `dlg_b_forgequeen_hesta_apprentice`, `dlg_b_ember_king_kneel`,
  `dlg_b_heir_in_the_kiln_mother`, `dlg_b_saelith_veilwarden_answer`, `dlg_b_unwoven_first_fire`,
  `dlg_b_marchheart_waking`.
- **Hard modes (41):** `hm_<bossid>` for every raid boss and secret boss above.
- **Feats:** listed at the end of each raid's loot section and §8.7.
- **World markers:** `wm_sun`, `wm_moon`, `wm_star`, `wm_flame`, `wm_leaf`, `wm_anvil`, `wm_bell`, `wm_crown`.
- **Screens:** `scr_raid_frames`, `scr_raid_leader`, `scr_raid_lockouts`, `scr_raid_journal`, `scr_loot_master`,
  `scr_dialog_choice`, `scr_world_boss_tracker`.

---

## 11. Reuse map

| What | Reused from | How |
|---|---|---|
| World boss shape (tier, over-level, scale, minion waves, phases, chest, pin) | `prototypes/farhold/data/worldbosses.json` (reuse) | the schema carries over; `minions` and `phases` keep their fields; Wildmarch adds `schedule`, `site`, `abilities[]`, `scaling` |
| Six world bosses by name and body | the same file: `grief_in_iron`, `the_hungering_brood`, `the_sallow_king`, `slagborn`, `the_standing_ruin`, `the_carrion_crown` (reuse) | ids become `b_<snake>`; tiers are replaced by region |
| Phase modifiers (`ironclad`, `vicious`, `frenzied`, `fleet`, `venomous`, `leeching`, `graveborn`, `warded`, `wizened`, `fiery`, `unyielding`…) | `prototypes/farhold/data/enemies.json` `modifiers`, applied by `js/actors.js` `applyModifier` (reuse) | world-boss phases and every raid boss's stat shifts |
| Warlords, war camps, leaders that buff their escort, standard-bearers, rout | `prototypes/farhold/js/warbands.js` + `data/warbands.json` (R27 M10) (reuse) | attunement steps kill the Gravemarshal and the Peak-King; Stonehide members are r02 trash; the leader aura (`leaderModifier`, `leaderAura`) is how Varro's *Good Dog* and the Barrow Herald's banner work |
| Door check for big bodies | `fitsRoom(def, room)` in `js/warbands.js` (reuse) | every raid corridor must pass it for its trash and bosses (raid rooms are built to 8–12 m ceilings) |
| Room-and-corridor interiors, looks (`barrow`, `crypt`, `cinderworks`, `vault`, `rime`, `flooded`, `hoard`…) | `prototypes/farhold/js/dungeon.js`, `js/dungeon-plan.js` (reuse) | raid interiors are **hand-laid** (fixed layouts, not seeded) but reuse the builder's merged geometry, walls, sconces and looks: r01 `barrow`/`crypt`, r02 `rime`, r03 `flooded`, r04 `cinderworks`/`hoard`, r05 `vault` |
| Instance mouths, `holds`, `gives`, discovery | `prototypes/farhold/data/instances.json` (reuse) | the raid entrances are instance mouths with `discovery: "quest"` (the attunement) |
| One-time strongholds payout (`sites.take`) | Farhold R27 M1 (reuse) | the lockout ledger works the same way: a kill is filed once per lockout |
| Bodies | `avatar-3d/js/creature-types.js` (41 types), Chibi 2 races + `data/class-outfits.json`, `chibi2-hats.js` `CLASS_HATS` (reuse) | every body on this page names one; creature `size` × Farhold world-boss `scale` |
| Effects | `avatar-3d/js/spellfx.js` `ELEMENTS`, `STATUS_FX`, `breath`, `pillar`, `vortex`, `storm`, `aoe`, `ring`, `beam` (reuse) | every ability's look; telegraph decals are page 11's (new) |
| Boss voices and lines | `shared/voices.js` `voiceFor({ role, gender, seed })`, Lingo `boss_opener` / `boss_phase` pools, Emberveil `js/talk.js` `narrate` (reuse) | bosses that do not speak use the Narrator |
| Chests | `data/balance.json` `chests.kinds` (`iron`, `gilded`, `warded`) (reuse) | world-boss weekly chest |
| Foci | `prototypes/farhold/js/foci.js` (R25 Reliquary, Orb, Grimoire, Effigy) (reuse) | `leg_marrow_reliquary` and other off-hand focus drops |
| Ideas (not names) | `prototypes/lanternfall/docs/05-BESTIARY-BOSSES.md` | a boss that eats light → Candlemourn's candles and Nhal's star light; a boss that melts into terrain → the Colossus's coral walls and Vorm's ice sheets; the flood cycle → r03 tide; per-boss enrage and phase transitions |
| **Not** reused | `prototypes/farhold/data/raids.json` | that file is Farhold's **base-defence** raids (waves against your colony), unrelated to group raids — do not import it |

---

## 12. Notes for other pages

### 12.1 Canon change requests (for page 00)

1. **r01 and r02 have no Mythic.** Canon gives them size 10 while also saying Mythic is 20 players. This page reads
   that as "Normal only" and puts the challenge in hard modes. Alternative: give them a level-60 Mythic 20 as a
   catch-up raid. Owner's call.
2. **Flex sizes.** Canon says 10 or 20. This page adds **flex 8–10** for 10-player Normal and **15–20** for r05
   Normal, fixed 20 on Mythic. Needs a canon line. **Resolved (00 §4):** canon now reads raid 10 (Normal, flex
   8–10) or 20 (Mythic; r05 Normal is 15–20 flex).
3. **r05 Normal is 20 players.** Canon §9 says r05 is 20 (not 10/20) — this page keeps that, and flags that it means
   the group finder needs a 20-player Normal queue. **Resolved (00 §4):** r05 Normal is 15–20 flex.
4. **A weekly reset day** (Wednesday 07:00 server time, proposed) should be canon. **Resolved (00 §4):** Wednesday 07:00 server time is canon.
5. **Oathstones** (`cur_oathstone`) as the one raid currency — canon or page 08. **Resolved (00 §10):** `cur_oathstone` "Oathstones" is the raid + world-boss currency; page 08 §17 owns its caps.
6. **World boss count:** "one per region from 3 upward" = 8 (regions 3–10). Veilspire Isle (region 11) has none;
   the Veilstorm Herald event covers it. Confirm.

### 12.2 For page 03 / 02 / 04

All screens, proposed keys and settings are in §2.15. New emotes used as triggers: `/kneel` (Queen Ysmere hard mode,
Ember King dialog), `/knock` (the Threshold hard mode) — page 02/03 should list them in the emote list.

### 12.3 For page 05

- The **reference character** table (§1.2) must be replaced by page 05's real numbers; scale this page by the ratio.
- Combat revives in raids: 1 (10) / 2 (20) + 1 per 5 min; shared with revive consumables.
- Crowd control on **charmed players** (r03) capped at 2 s per effect.
- Damage from a player to a charmed ally: 80% reduced.
- Boss immunity to knockback has **one exception** (Cinderjaw is a door).

### 12.4 For page 06 (class files)

- The Mirror Court (§7.9) builds a boss from **any** class's six spells and mechanic: every class file should state
  its spells' shapes and numbers precisely enough to scale by 250%.
- Every raid mechanic asks for one of: interrupt, dispel (magic / curse / poison), crowd control, knockback, movement
  ability, defensive, taunt. Page 06 should keep a coverage matrix so each is available to at least 10 classes.

### 12.5 For page 07

- Raids unlock at **30** (the ladder); Mythic unlocks per raid by killing its Normal final boss.
- Titles from this page: *of the Ninefold*, *Who Said Her Name*, *No One's Mourner*, *of the Rimebound Court*, *Who
  Woke the Mountain*, *of the Drowned Choir*, *Deep Singer*, *Who Sang the Last Note*, *of the Ember Court*,
  *Kingsbane*, *Who Opened the Kiln*, *of the Veilwoven*, *Who Held the Thread*, *Dreamkeeper*, *Walker of Every
  Road*, *Worldbreaker*.
- Flying mounts are named here (griffin, whelp, phoenix, drake) — page 07 decides whether flying exists at all. **Resolved (00 §10):** flying is in at 60 through `q_sky_1..5` (Riding IV); before that these winged mounts run and glide (page 08 §20.1).

### 12.6 For page 08

- Item levels in §2.10.2 are proposals. **No belt, cloak or shoulder slots** are used here (Farhold's `SLOTS`); if
  page 08 adds them, raid sets can grow to 8 pieces. **Resolved (00 §4):** page 08 §2 has 15 slots including `shoulders`, `back` and
  `waist`; whether raid sets grow to 8 pieces is page 09's call.
- Page 08 should decide whether flails and pistols exist (used by `it_tentacle_lash_whip` and
  `leg_grimwaters_last_broadside`; fall back to mace and off-hand focus if not).

### 12.7 For page 10

- Families used: Farhold's eight. Giants/orcs are `humanoid`. If page 10 adds `giant`, `veil` or `drowned` families,
  rename the `m_` ids here. **Partly resolved:** page 10 §3 has `giant`, `veil`, `drowned`, `ember` and others;
  the warband ids here were renamed (`m_giant_stonehide_*`, `m_ember_*`); the other `m_humanoid_*` /
  Farhold-family ids are still to move.
- Farhold's tier-1 world bosses (Bramblecoat, the Reedmother, Gravel-Tusk) are proposed as **rare elites** for
  Hearthvale and Mossfen.

### 12.8 For page 11

- New mechanic words used on this page that page 11 should define: **Mind control / Charmed**, **Body-block beam**,
  **Rescue** (free a swallowed/encased player), **Song lanes**, **Polarity**, **Duel ring**, **Cross-realm** (the Veil),
  **Lying voice** (the Many-Mouthed), **Reversed interrupt** (the Unsung: do *not* interrupt a gold bar) and the
  gauges **Cold / Heat**, **Breath**, **Brine**, **Court Favour**.
- The Unsung arena **turns off all sound** — page 11 must make sure every warning has a visual form (it already
  should).

### 12.9 For page 14

- Attunement quests (§2.9, §3.3, §4.3, §5.3, §6.3, §7.3), `q_the_last_ember` (§7.16), `q_world_boss_<region>` (§8.7),
  and the four seasonal events (Harvestide, Longnight, Firstbloom, Highsun) plus the Veilstorm event.

### 12.10 For page 15

- Raid groups up to 20 (open world-boss groups up to 60), subgroups of 5, raid assist, loot master, the 2-hour
  personal-loot trade window, lockout merging and extension.
