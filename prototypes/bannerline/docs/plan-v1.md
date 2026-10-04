# Bannerline — Plan v1 (to be roasted)

Status: draft v1, 2026-10-03. Design only — no game code yet. Next step is `docs/roast.md`, then the
refined `docs/PLAN.md` that the build follows.

Read first: `docs/research.md` (how the genre this is modelled on works, with sources). Third-party
names appear only in the `docs/` folder; nothing in this plan's player-facing names may use them
(playground convention 9 — no WC3/WoW terms, no "ember"/"veil").

---

## 0. One-paragraph pitch

Each team guards a **Keep** flying a stack of **banners** at the bottom of its own walled field. You
do two things at once: **fight** with your hero to stop whatever comes down your field, and **muster**
— spend gold to send units into the *enemy's* field. Every unit you send raises your **income**, paid
every 10 seconds, so each purchase is both an attack and an investment. A unit that reaches the
enemy Keep tears down banners. Last team with banners standing wins. Heroes are four of Farhold's
classes (Warrior, Ranger, Pyromancer, Druid), with a real equipment screen, item rarities, affixes
and sets. Play 1v1, 2v2 or 3v3, two players on one screen, online by room code, against AI at three
difficulties, or through a short campaign.

---

## 1. Core loop and timings

| Clock | Value | Why |
|---|---|---|
| Sim tick | **20 Hz (50 ms)**, fixed | Lockstep needs a fixed step; 20 Hz is plenty for RTS movement and cheap for 6 players' inputs |
| Income tick ("Pay") | every **10 s** (200 ticks) | The genre's own heartbeat (research §4); a tier-1 send pays itself back in ~5 pays; a visible countdown ring |
| Tide (neutral wave) | every **40 s**, level = wave number | Both fields get the same Tide at the same time; it keeps an idle hero busy and feeds XP/drops |
| Tier unlocks | T1 0:00, T2 2:00, T3 5:00, T4 9:00, T5 14:00, T6 (champion) 20:00 | Stops a rush of top-tier units at minute 1; makes the match have chapters |
| Hero respawn | `5 + 1 × level` s, cap 25 s | Shorter than the 30 s of the old maps (research §12.6): a dead hero means free leaks, and the Keep Bells (§3.1) cover the gap |
| Rising Tide (anti-stall) | from **25:00**, every 5 min: leak damage ×1.5, Tide level +3 | Guarantees an end; target match length 18–28 min |
| Hard cap | 40:00 → team with more banners wins; tie → more total income wins | A clock-out ending the scoreboard can explain |

**Moment-to-moment:** hero kills what walks down its field (bounty gold + XP + drop chance) → spends
gold on sends (pressure + income) or items/upgrades (defence) → every 10 s gets paid → repeat. The
tension is the classic one: **every coin spent on income is a coin not spent defending**, and the
enemy can see your income on the scoreboard.

**Starting state:** 150 gold, income 20, hero level 1, a starter weapon for the hero's class and two
small potions.

---

## 2. Map(s)

### 2.1 Layout (all modes)

Each team owns one **field**: a walled, roughly vertical valley, physically separate from the other
team's field (heroes never meet in v1 — see §2.4). Units walk top → bottom.

```
 Team A field                     Team B field
 ┌──────────────┐                 ┌──────────────┐
 │ G1  G2  G3   │ <- entry gates  │ G1  G2  G3   │   one gate per ENEMY player
 │  \  |  /     │                 │  \  |  /     │
 │   road  ~~   │  (bends, a ford,│   road       │
 │   |   [shrine]  two choke      │   |          │
 │   |          │  points)        │   |          │
 │  [ARMORY]    │                 │  [ARMORY]    │   shop + muster post, near the Keep
 │   KEEP ▲▲▲   │  banners        │   KEEP ▲▲▲   │
 └──────────────┘                 └──────────────┘
```

- **Why one shared field per team, not one lane per player:** most of the old maps gave each player
  their own lane, which turns 3v3 into three parallel 1v1s where a quiet lane leaves a player idle and
  a weak player drains shared lives alone (research §2, §8). A shared field makes co-op real —
  teammates fight side by side — and suits online co-op vs AI. The cost: a strong player can carry.
  Roast question 11.
- **Gates:** one per enemy player. A send enters through the gate of the player who bought it, so in
  3v3 you can see *who* is pressuring you. Gates merge into one road after ~25% of the field.
- **Field size:** 1v1 48 × 140 m; 2v2 64 × 150 m; 3v3 80 × 160 m (road width scales; more defenders
  need more room, and more gates need more top edge).
- **Features per field (mirrored between teams):** two choke points, one ford (slows 25%), a
  **shrine** (captureable heal-over-time spot, 90 s cooldown), the **Armory** (shop + muster post +
  respawn point), the Keep with its banners and a weak Keep bolt (deals 2% of a unit's max HP a
  second — flavour and a last-ditch help, never a defence on its own).
- **Tides** spawn at all gates at once.
- Both fields sit side by side in one world, 40 m apart, so the view, the minimap and spectators can
  show both with one scene.

### 2.2 Banners (the life total)

| Mode | Banners per team |
|---|---|
| 1v1 | 30 |
| 2v2 | 45 |
| 3v3 | 60 |

A unit reaching the Keep removes `banners` equal to its **leak value** (tier 1 → 1 … champion → 8;
`siege` trait ×2) and is gone. The banners are physical flags on the Keep walls that drop as they
are lost — the name of the game.

### 2.3 Maps for v1

- `vale` — the default (layout above), all three modes.
- `fordway` — a river runs the length of the field; two bridges; ranged units shine.
- `switchback` — a long zig-zag road; leaks are slower, better for new players and campaign mission 1.

Maps are JSON (`data/maps.json`): field size, road polyline per gate, chokes, ford polygons, shrine,
Armory and Keep positions, decoration seed. The renderer builds terrain from it; the sim reads only
the walk graph.

### 2.4 Hero vs hero (parked, not in v1)

The genre's purest form never lets heroes meet. A "Clash" variant (a duel ring that opens every
10 min) is listed as a roast question, not built.

---

## 3. Economy

### 3.1 Rules

- One currency: **gold**. (A second resource was considered and dropped: it doubles the UI on a
  gamepad and in split screen for little decision depth.)
- **Income** starts at 20 and is paid every 10 s. The sim stores gold in tenths (Int32) so fractional income like +2.4 is exact; the UI shows whole gold. Each send adds the unit's `income` to the sender's
  income permanently. Income is private per player, shown on the scoreboard (Tab / Select).
- **Bounty:** killing a sent unit pays its `bounty` (≈ 20% of cost) to the hero who landed the
  killing blow, plus 10% of cost split among other heroes on that team within 15 m. Tide kills pay a
  flat bounty by Tide level.
- **Muster upgrades** (per player, per race): five ranks of +8% HP and damage for all units you send,
  and two ranks of "Quartermaster" (+5% income from future sends).
- **Income tax (published, on the scoreboard):** income above 150 per pay is taxed in steps —
  150–300: 10%, 300–500: 20%, 500+: 30%. The send panel shows "+6.2 income (+5.6 after tax)". Castle-
  Fight-style and visible, so it reads as a rule, not rubber-banding (research §11–12).
- **Catch-up (published):** a team behind on banners by ≥ 20% gets **Rally**: +10% bounty and +10%
  hero XP per full 20% behind (cap +30%). Shown as a banner icon on the HUD.
- **Keep Bells (team emergency spells):** every team has two shared spells cast from the Keep by any
  teammate, on long shared cooldowns: *Toll of Iron* (stuns every enemy unit in the field 3 s, 150 s
  cooldown) and *Last Muster* (summons 6 Keep Guards at the Keep for 30 s, 240 s cooldown). They
  cover a death or a spike — the genre's shrine spells (research §2).
- **Gate preview:** the defender sees the next 10 s of incoming sends as icons above each gate
  (counterplay window; research §12.5).
- **Requisition:** consumables and shop items can be bought from anywhere; they arrive after a 4 s
  "requisition" (cancelled if you die), so shopping never forces you off the road (research §12.7).
- **No income cap**, but income gained per send falls for **repeat buys inside 30 s** of the same
  unit (−10% per repeat, floor −50%) — this softens pure income-spam builds that never attack.

### 3.2 Payback

`payback seconds = cost / income × 10`. Rule from the source genre (research §3): **cheap units pay back fastest, the champion tier pays back nothing** — T1 ≈ 5 pays (50 s), T2 ≈ 6.5, T3 ≈ 8, T4 ≈ 10, T5 ≈ 13, T6 = 0 income (pure pressure). Cheap spam also feeds the defender XP and bounty, which is the built-in brake. Design intent per race (numbers below are v1 targets; the
balance sim in §17 tunes them):

- **Freeholds** — middling ratios everywhere; best Muster upgrades. The "learn the game" race.
- **Ashtusk** — cheapest units and worst income ratios: strong early pressure, weak economy.
- **Unburied** — poor ratios at T1–T2, the best ratios at T4–T5: a late-game economy race.
- **Thornmane** — packs (one purchase sends 2–3 bodies), best ratios at T2–T3: mid-game spikes.

---

## 4. Races and units

Four races that read differently at a glance (silhouette, colour, movement), reusing Chibi 2 races
and Farhold's warband identities so the art and voices already exist:

| Race (player-facing) | Built from | Look | Play |
|---|---|---|---|
| **The Freeholds** | Chibi 2 human / dwarf / halfling, class outfits | blue-and-steel, tabards, shields | armour, healing, steady |
| **Ashtusk** | Farhold warband `ashtusk` (Chibi 2 orc) + boars | red-black, bone, war paint | cheap, many, hits hard, dies fast |
| **The Unburied** | Farhold warband `unburied` (Chibi 2 undead) + wraiths, bats | pale cyan glow, rags | slow, revives, spectral armour |
| **Thornmane** | Farhold warband `thornmane` (Chibi 2 beastkin) + wolves, hyenas, saber cats | green-brown, fur, antler | fast, packs, bleeds |

(The 10 s pay with these paybacks means early income grows fast; the balance sim in §17 is where
the ratios get tuned. Sootwick goblins and Stonehide giants are the obvious 5th/6th races later.)

### 4.1 Damage and armour types (the counter system)

Damage: **blade**, **pierce**, **arcane**, **siege**. Armour: **light**, **heavy**, **spectral**,
**hide**. Heroes: blade/pierce/arcane by class; their own armour is `hero` (takes 100% from all).

| dmg \ armour | light | heavy | spectral | hide |
|---|---|---|---|---|
| blade  | 125% | 75% | 60% | 100% |
| pierce | 150% | 60% | 75% | 90% |
| arcane | 90% | 125% | 150% | 75% |
| siege  | 75% | 100% | 50% | 125% |

Heroes pick items (§6) that convert some damage to another type, so a Ranger facing Unburied wants
arcane on-hit. The send panel shows each unit's armour against *each enemy hero's* damage type as a
green/amber/red pip, so counter-sending is readable without a wiki.

### 4.2 Unit tables (v1 targets; `data/units.json`)

Columns: tier, cost, +income, payback (s), HP, armour, dmg/s, dmg type, speed (m/s), range, leak,
traits. Hero DPS at level 1 ≈ 25, level 10 ≈ 140, level 20 ≈ 400 — units are sized against that.

**The Freeholds**

| Unit | T | Cost | +Inc | Payback | HP | Armour | DPS | Type | Spd | Rng | Leak | Traits |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Levy | 1 | 12 | 2.4 | 50 | 120 | light | 8 | blade | 3.0 | 1.5 | 1 | — |
| Hill Slinger (halfling) | 1 | 15 | 3 | 50 | 80 | light | 10 | pierce | 3.2 | 9 | 1 | — |
| Shieldwall (dwarf) | 2 | 40 | 6.2 | 65 | 420 | heavy | 12 | blade | 2.4 | 1.5 | 1 | `guard` (−30% pierce taken by allies behind) |
| Crossbow | 2 | 45 | 6.9 | 65 | 220 | light | 26 | pierce | 2.8 | 12 | 1 | — |
| Hedge Priest | 3 | 90 | 11.2 | 80 | 300 | light | 10 | arcane | 2.8 | 10 | 2 | `heal` 18 HP/s to nearby allies |
| Hound Master | 3 | 110 | 13.8 | 80 | 480 + 2×hound 160 | light/hide | 30 | blade | 3.4 | 1.5 | 2 | `pack` |
| Courser Knight | 4 | 220 | 22 | 100 | 1300 | heavy | 55 | blade | 4.6 | 1.8 | 3 | `charge` (first hit ×3) |
| Mortar Crew | 4 | 240 | 24 | 100 | 700 | heavy | 40 | siege | 2.2 | 16 | 3 | `siege` (leak ×2), targets heroes last |
| Iron Golem | 5 | 480 | 36.9 | 130 | 4200 | heavy | 90 | siege | 2.2 | 2 | 4 | `stoneskin` (−50% from first hit each 3 s) |
| Banner Marshal | 6 | 900 | 0 | — | 7000 | heavy | 150 | blade | 2.8 | 2 | 8 | `champion`, aura +20% HP to escort |

**Ashtusk**

| Unit | T | Cost | +Inc | Payback | HP | Armour | DPS | Type | Spd | Rng | Leak | Traits |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ashtusk Raider ×2 | 1 | 10 | 1.7 | 59 | 90 each | light | 9 | blade | 3.6 | 1.5 | 1 | `pack` |
| Spearthrower | 1 | 14 | 2.3 | 61 | 90 | light | 12 | pierce | 3.2 | 8 | 1 | — |
| Ashtusk Brute | 2 | 35 | 4.5 | 78 | 520 | hide | 22 | blade | 3.0 | 1.6 | 1 | `enrage` (+50% dmg under 40% HP) |
| Boar Rider | 2 | 42 | 5.4 | 78 | 380 | hide | 24 | blade | 5.0 | 1.6 | 1 | `trample` (pushes past the first blocker) |
| Bonecaller | 3 | 80 | 8.3 | 96 | 280 | light | 18 | arcane | 3.0 | 10 | 2 | `hex` (−20% hero damage for 4 s) |
| War Drummer | 3 | 95 | 9.9 | 96 | 400 | hide | 8 | blade | 3.0 | 1.6 | 2 | aura +25% move/attack speed |
| Tusk Ram | 4 | 200 | 16.7 | 120 | 2200 | heavy | 30 | siege | 2.6 | 2 | 3 | `siege`, ignores heroes, can't be slowed |
| Tuskback (beast) | 5 | 420 | 26.9 | 156 | 4800 | hide | 110 | blade | 3.0 | 2.2 | 4 | `stomp` (AoE stun 1 s every 8 s) |
| Ashtusk Warchief | 6 | 820 | 0 | — | 6500 | hide | 180 | blade | 3.2 | 2 | 8 | `champion`, war cry: escort +30% dmg |
| Firepot Goblin (merc) | 2 | 30 | 3.8 | 79 | 140 | light | 0 | siege | 4.0 | 1 | 1 | explodes at first contact for 150 AoE |

**The Unburied**

| Unit | T | Cost | +Inc | Payback | HP | Armour | DPS | Type | Spd | Rng | Leak | Traits |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Shambler | 1 | 12 | 2 | 60 | 150 | spectral | 6 | blade | 2.2 | 1.5 | 1 | — |
| Bone Archer | 1 | 16 | 2.7 | 59 | 80 | spectral | 11 | pierce | 2.8 | 10 | 1 | — |
| Gravecreeper | 2 | 40 | 5.1 | 78 | 260 | spectral | 18 | blade | 3.0 | 1.5 | 1 | `rise` (returns once at 50% HP) |
| Bat Cloud | 2 | 45 | 5.8 | 78 | 240 | light | 16 | blade | 4.4 | 1.2 | 1 | `flying` (ignores ford, slows, roots) |
| Mournweaver | 3 | 95 | 11.9 | 80 | 320 | spectral | 16 | arcane | 2.8 | 10 | 2 | `raise` (a Shambler every 6 s) |
| Ghoul | 3 | 100 | 12.5 | 80 | 600 | hide | 34 | blade | 3.6 | 1.5 | 2 | `feast` (heals 30% on kill) |
| Wraith | 4 | 210 | 24.7 | 85 | 1100 | spectral | 50 | arcane | 3.4 | 1.8 | 3 | `phase` (immune 1.5 s when first hit by a skill) |
| Bone Colossus | 5 | 460 | 41.6 | 111 | 5200 | heavy | 95 | siege | 2.0 | 2.4 | 4 | `siege` |
| Deathmarshal | 6 | 880 | 0 | — | 6800 | spectral | 150 | arcane | 2.6 | 2 | 8 | `champion`, revives the last escort that died once |
| Crow Murder | 2 | 38 | 4.9 | 78 | 200 | light | 14 | pierce | 4.6 | 6 | 1 | `flying` |

**Thornmane**

| Unit | T | Cost | +Inc | Payback | HP | Armour | DPS | Type | Spd | Rng | Leak | Traits |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Wolf Pair | 1 | 14 | 2.7 | 52 | 100 each | hide | 8 | blade | 4.2 | 1.4 | 1 | `pack` |
| Thornmane Tracker | 1 | 16 | 3 | 53 | 90 | light | 11 | pierce | 3.4 | 10 | 1 | — |
| Hyena Pack ×3 | 2 | 40 | 7.2 | 56 | 140 each | hide | 10 | blade | 4.0 | 1.4 | 1 | `pack`, `bleed` |
| Thornmane Mauler | 2 | 48 | 8.7 | 55 | 560 | hide | 26 | blade | 3.2 | 1.6 | 1 | `bleed` |
| Moonseer | 3 | 90 | 13.2 | 68 | 300 | light | 14 | arcane | 3.0 | 10 | 2 | `mend` (regen aura), `root` on hero 1 s / 10 s |
| Saber Cat | 3 | 105 | 15.4 | 68 | 520 | hide | 42 | blade | 5.2 | 1.6 | 2 | `pounce` (leaps to the backline / hero) |
| Thornback (beast) | 4 | 230 | 21.9 | 105 | 2400 | heavy | 45 | blade | 3.0 | 2 | 3 | `spikes` (reflect 20% melee) |
| Elder Griffin | 5 | 450 | 33 | 136 | 3600 | hide | 100 | pierce | 4.4 | 2.5 | 4 | `flying` |
| Packlord | 6 | 860 | 0 | — | 6200 | hide | 170 | blade | 3.6 | 2 | 8 | `champion`, howls two Wolf Pairs every 10 s |
| Stalker | 2 | 44 | 8 | 55 | 200 | light | 30 | blade | 3.8 | 1.5 | 1 | `stealth` until it attacks or is within 6 m of a hero |

Each race has exactly **10 units**: 2× T1, 3× T2, 2× T3, 1–2× T4, 1× T5, 1× T6 champion. Traits are
a closed vocabulary in `data/traits.json`, each with a handler in `js/sim/traits.js` and a test that
fails if any trait in the data has no handler (Farhold's lesson: dead data looks like a feature).

### 4.3 Race upgrades (`data/races.json`)

Each race: Muster I–V (+8% HP/dmg), Quartermaster I–II, plus two race tech upgrades:
- Freeholds: *Drilled Ranks* (Shieldwall `guard` radius +50%), *Field Chapels* (Hedge Priest heal +50%).
- Ashtusk: *Bloodpaint* (all `enrage` thresholds 60%), *Bigger Rams* (Tusk Ram leak 4).
- Unburied: *Deep Graves* (`rise` returns at 75%), *Cold Choir* (Mournweaver raises every 4 s).
- Thornmane: *Long Hunt* (+10% speed all), *Blood Scent* (`bleed` stacks twice).

---

## 5. Heroes

### 5.1 Common rules

- **Level 1–20** in a match. XP from kills in your own field, shared among your team's heroes within
  20 m (classic shared-kill XP). XP curve in `data/heroes.json` (`xpTable`), tuned so a hero reaches
  ~10 at 12:00 and 20 at ~28:00.
- **Skills:** 4 basic (3 ranks each) + 1 ultimate (unlocks at 6, ranks at 6/12/18). One skill point
  per level. Druid has a 6th slot (shape toggle) — see below.
- **Talents-lite:** at levels **5, 10, 15** pick one of two talents. Each talent is lifted from that
  skill's Farhold talent tiers (`skills.json` → `talents."1"/"2"/"3".nodes`), so the choice changes
  how a skill is *cast*, not just a number.
- **Attributes:** none to spend; per-level growth fixed per class. Items do the build-crafting.
- **Scale:** Farhold ranges are tuned for a 3rd-person open world. Bannerline divides ranges by ~2
  (a 42 m Long Draw becomes 20 m) and keeps radii, so AoE stays readable from a top-down camera.
  `tools/build-hero-skills.mjs` does this conversion so the source of truth stays Farhold's data.
- **Damage:** Farhold's "N% weapon damage" model is kept: the weapon (an item) sets the base, skills
  multiply it. All multipliers are stored as integer per-mille in the sim (`mult: 1150`).

### 5.2 The four heroes (ability → Farhold source id)

**Warrior — "the wall"** (melee, blade, highest HP)

| Key | Skill | Source | Bannerline version |
|---|---|---|---|
| Q | Cleave | `cleave` | strike all within 4.5 m, +12%/extra target |
| W | Breaching Shove | `breaching_shove` | 80° arc, knock back 4 m + 0.6 s stun — the "stop the ram" button |
| E | War Cry | `warcry` | Might buff + **taunt** within 10 m: lane units attack you instead of walking on |
| D | Iron Resolve | `iron_resolve` | −6% damage per nearby foe, shockwave every 4th hit |
| R (ult) | Iron Gyre | `whirlwind` | 5 spins, bleed, pull-in |
| talent alt | Groundbreaker | `groundbreaker` | level-10 talent can replace War Cry with the 18 m line stun |

**Ranger — "the reach"** (ranged, pierce, kites)

| Key | Skill | Source |
|---|---|---|
| Q | Long Draw | `aimed_shot` (armour pierce, bonus vs distant) |
| W | Hunter's Snare | `hunters_snare` (traps on the road — strong in a lane game) |
| E | Broadhead Fan | `multi_shot` |
| D | Tracker's Leap | `trackers_leap` (backward dash, empowers next skill) |
| R | Arrow Storm | `rain_of_arrows` |
| passive | Quarry | from `quarry_call`: every 4th basic attack marks (+20% damage taken, 6 s) |

**Pyromancer — "the wave clear"** (ranged, arcane-fire, squishy)

| Key | Skill | Source |
|---|---|---|
| Q | Firebolt | `firebolt` (Burning stacks) |
| W | Burning Line | `fire_wall` (laid across the road — the iconic lane-war skill) |
| E | Flashover | `flashover` (detonate Burning) |
| D | Cinder Stride | `ember_stride` (renamed source id only; player name already original) |
| R | Fallstone | `meteor` |

**Druid — "the shape-shifter"** (hybrid, arcane-nature; sustain + summons)

| Key | Skill | Source |
|---|---|---|
| Q | Thornlash | `thornlash` (form-dependent: Bramble Gore in Briarback) |
| W | Greensap | `renew` (heal-over-time; form variants) |
| E | Call the Pack | `call_wolf` (Grove Wolf companion) |
| D | Shape: Briarback / Fenrunner | `briarback_shape` + `fenrunner_shape` share one toggle key that cycles human → Briarback → Fenrunner |
| R | Sporecap Shape | `sporecap_shape` |

Druid forms use existing creature bodies (`boar`, `crocodile`, `mushroom` from Farhold's data) —
the view swaps the actor; the sim swaps a stat block and a skill table.

### 5.3 Hero base stats (level 1 / per level)

| Hero | HP | +HP/lv | Mana | +MP | Armour | Move | Attack | Weapon start |
|---|---|---|---|---|---|---|---|---|
| Warrior | 620 | 70 | 120 | 8 | 6 | 5.2 | melee 2.2 m, 1.0/s | Longsword |
| Ranger | 470 | 48 | 150 | 10 | 3 | 5.4 | bow 14 m, 1.1/s | Hunting Bow |
| Pyromancer | 420 | 40 | 220 | 16 | 2 | 5.0 | bolt 12 m, 0.9/s | Ash Staff |
| Druid | 520 | 55 | 180 | 12 | 4 | 5.2 | thorn bolt 11 m, 1.0/s | Oak Staff |

---

## 6. Inventory and equipment (the real one)

### 6.1 Slots

Equipment (10): **weapon, off-hand, head, chest, hands, legs, feet, neck, ring ×2**, plus a
**charm** slot (Bannerline-only, one per hero, carries a set or unique power). Two-handers occupy the
off-hand. Bag: **20 slots**. Belt: **4 quick slots** (potions, scrolls, bombs) bound to 1–4 / d-pad.

### 6.2 Items

- **Reuse:** weapon and armour bases, affixes, uniques and sets come from the shared
  `prototypes/emberveil/data/items.json` (the file Farhold reads) through Farhold's
  `js/affixes.js` (`tuneAffixData`, `rollAffixValue(def, ilvl, rng)`, `affixAllowed`, `capValue`) —
  always called with the **sim's seeded rng**, never the `Math.random` default. A Bannerline
  allow-list (`data/items-bl.json`) picks the ~60 bases that fit the four heroes, the ~35 affix stats
  that mean something here (no forage/travel/vehicle stats), and adds lane-specific affixes
  (`bountyPct`, `vsSiege`, `vsChampion`, `tideXp`, `keepRepair` — "restore 1 banner per 3 min").
- **Rarities:** normal, magic (2 affixes), rare (3), legendary (5) + unique + set, colours from
  `items.json` `rarityColors`.
- **Item level** = Tide level / match minute band (ilvl 1–30), feeding `tierFor(ilvl)`.
- **Sets (new, Bannerline):** one 4-piece set per hero (e.g. Warrior "Keepwarden's Plate": 2 = War
  Cry taunt radius +4 m, 4 = Iron Gyre spins +2) and two generic 3-piece sets. Data in
  `data/items-bl.json` `sets`, built from `items.json` set conventions.
- **Uniques:** 8 per hero type drawn from Farhold's 184 uniques where the power works in a lane
  (`js/uniques.js` powers that don't read Farhold world state); others filtered out by a tag.
- **Numbers in the sim are integers.** An affix roll is rounded once at creation (`roundFor`), then
  stored as an int (per-mille for fractions).

### 6.3 Getting items

1. **Armory shop** (at your Keep): bases by tier (normal/magic only), potions, scrolls (town portal
   back to the Armory, 4 s channel), rerolls ("Reforge": re-roll one affix for gold), sell at 35%.
   Stock refreshes every 3 min, per player (seeded).
2. **Drops:** Tide creeps and **sent units** drop items into the killer's personal loot
   (`drop chance` by tier; T5/T6 guarantee magic+). Loot appears as a beacon of its rarity colour;
   walking over it / pressing pick-up puts it in the bag. Bag full → it stays on the ground 60 s.
3. **Champion kills** (a T6) open a 3-card pick (`shared/rewards.js` `spec.choose`).

### 6.4 Screens

- **Character panel** (I / pad View button): paper-doll with the hero's live 3D figure, stats sheet
  (damage by type, resistances, crit, attack speed, life steal, cooldown reduction), set bonuses.
- **Bag** with sort and compare-on-hover (`shared/tooltip.js` `data-tip-render`, deltas against the
  equipped item), drag-and-drop with the mouse, grid cursor with the pad.
- In split screen each player's panel opens over **their own viewport only** and pauses nothing.

---

## 7. AI (three difficulties)

The AI is part of the simulation (runs identically on every peer, reads only sim state, draws from
its own rng stream, acts with a reaction delay in ticks). Difficulties differ in **decisions**,
not in stat bonuses.

| Area | Recruit (easy) | Veteran (normal) | Warlord (hard) |
|---|---|---|---|
| Reaction | 1.6 s | 0.8 s | 0.35 s |
| Send logic | buys random affordable T1–T2 every ~20 s | keeps a 60/40 income/pressure split; sends in batches when it has ≥ 1 pay of gold | models the defender: estimates their hero DPS + items vs a wave's EHP and buys the cheapest wave that **leaks**; times sends to land with a Tide or while the enemy hero is dead/shopping |
| Economy | never saves; never upgrades | Muster upgrade every ~4 min | income-vs-pressure switch by banner lead and payback horizon (stops eco when time-to-end < payback) |
| Counters | none | picks units whose armour beats the enemy hero's damage type 50% of the time | always counter-picks; also adds `flying`/`stealth` when the enemy has no answer |
| Hero micro | attacks nearest; skills at random off cooldown; never retreats | targets lowest HP; AoE when ≥ 3 in radius; retreats at 30% HP; uses shrine | focus order (healers, siege, champions); skill combos (Snare→Arrow Storm, Firebolt stacks→Flashover, Shove a Ram back into a Burning Line); kites with ranged heroes; potions; portal home |
| Shopping | potions only, every ~5 min | buys the best-scoring item it can afford (`scoreWeights`) | plans a build per hero toward its set; reforges; sells duds |
| Talents | random | fixed per hero | chosen by enemy race |

Validation: `tools/sim-bannerline.mjs` runs headless AI-vs-AI tournaments; the test bar is
Warlord beats Veteran ≥ 70% and Veteran beats Recruit ≥ 80% over 50 seeds per race pair.

---

## 8. Input and devices

### 8.1 Devices

- **Keyboard + mouse** (one device). RTS-style: right-click move/attack, Q/W/E/D/R skills cast at
  cursor (quick-cast with a toggle for click-to-confirm), 1–4 belt, A-move, S stop, H hold,
  F1 select hero, Space centre camera, B shop, I character, M muster panel, Tab scoreboard.
  Muster hotkeys: Z X C V / Shift+Z… or click the command card.
- **Gamepad** (each pad = one device, standard mapping via the Gamepad API):
  left stick moves the hero directly; right stick aims (an aim reticle; skills fire toward it, or at
  the auto-target when the stick is centred); A attack-move / interact, X Y B RB = skills, RT ult,
  LB held = **muster radial** (8 units + Muster upgrade on the d-pad), d-pad = belt, View = bag,
  Menu = pause/scoreboard. Camera: follows the hero; click the right stick to free-look.
- Both devices produce the **same commands** (§10.2). A stick move becomes a `moveDir` command
  quantised to 16 directions × 3 speeds, sent only when it changes — cheap for lockstep.
- Rebinding table (`data/bindings.json`), saved per device type in localStorage.

### 8.2 Ready-up claims a device

In the lobby, the slot list shows "Press **Enter** or **Space** (keyboard) / **A** or **Start**
(controller) to join". The press **assigns that device to the first open local slot** and shows its
icon on the slot. Pressing again = ready. B / Esc = unready, again = leave the slot. A third local
device sees "Two players per screen." Disconnected pads pause only that player's input and flash the
slot.

### 8.3 Split screen

- Two local humans → **side-by-side vertical split** (fields run vertically, so tall narrow views
  fit). One `WebGLRenderer`, two cameras, scissor + viewport per half, one scene (both fields are in
  the one world).
- Each half has its own compact control bar, minimap, toasts and open panels; the scoreboard is
  shared (top centre).
- Mouse belongs to the keyboard player; its cursor is clamped to that half.
- Local players can be on the **same team** (co-op, both views on one field) or **opposing teams**.

---

## 9. Online

### 9.1 Model: deterministic lockstep

- Every peer runs the whole simulation. Only **commands** cross the network.
- **Tick** 20 Hz; commands for tick `T` are issued at `T − D` (input delay). `D` starts at 3 ticks
  (150 ms) and adapts 2–8 from measured round-trip time (changes only at agreed ticks).
- A tick runs only when every human slot's command packet for that tick has arrived (an empty packet
  is the heartbeat). AI slots need no packets — every peer computes them.
- **Topology:** star through the host (room creator) over PeerJS data channels (reliable, ordered).
  The host re-broadcasts each peer's packets. 6 players max, so the host's fan-out is small.
- **Determinism rules (enforced by a test that scans `js/sim/**`):** no `Math.random`, `Date`,
  `performance.now`; no `Math.sin/cos/tan/atan2/exp/log/pow/hypot/cbrt` (their last bits differ
  between JS engines) — the sim uses its own `trig.js` lookup table, an integer `isqrt`, and
  fixed-point positions (millimetres in `Int32`). +, −, ×, ÷ on integers and `Math.imul`, `Math.floor`,
  `Math.sqrt` are allowed (sqrt is exactly rounded by spec). Seeded rng (`sfc32`) with separate
  streams for combat, loot, AI and shop so adding a loot roll can't shift combat.
  Iteration only over arrays in id order, never over object keys built at different times.
- **Desync check:** every 20 ticks each peer hashes the state (FNV-1a over a canonical field list);
  hashes ride on command packets; a mismatch freezes the game with "Out of step at tick N" and saves
  both state dumps + the command log (`?desyncdump=1` downloads it) for a node test to diff.
- **Pause** by any human (3 per player per match), unpause by the same player or after 60 s.
- **Disconnect:** the host announces "slot X → Veteran AI from tick T" (T in the future), every peer
  switches at T. Rejoin mid-match is v2 (needs a state snapshot + catch-up).
- **Hidden information:** lockstep means every client knows everything. Accepted for a prototype
  (friends' games); a relay-authoritative server is the v2 answer if it matters.

### 9.2 One lobby, three kinds of seat

A slot is one of: **Open**, **Local** (this machine; 0–2 per machine), **Remote** (a peer's local
player), **AI** (Recruit/Veteran/Warlord), **Closed**. So a single lobby can hold, e.g., in 3v3:
team A = two split-screen players on the host machine + one remote friend, team B = three Warlord
AIs (**co-op vs AI**), or 2 humans per side across three machines (PvP), or any mix. Each machine
sends one command packet per tick containing both of its local players' commands.

### 9.3 Transport layer (swappable)

```
js/net/transport.js   interface + factory: createTransport(kind, opts)
  host(): Promise<{ code }>          join(code): Promise<void>
  send(to | '*', msg)                onMessage(fn(from, msg))
  onPeer(fn(event, peerId))          rtt(peerId)            close()
js/net/peerjs.js      PeerJS implementation (vendored peerjs.min.js under vendor/peerjs, MIT)
js/net/loopback.js    in-page bus with injectable latency / jitter / drop (node tests)
js/net/channel.js     BroadcastChannel between tabs on one machine (Playwright two-page test, no internet)
js/net/lockstep.js    the protocol above, transport-agnostic
```

Room codes: 5 letters from an unambiguous alphabet (no I/O/0/1), mapped to a PeerJS id
`bannerline-<code>` on the public broker.

### 9.4 Upgrade path off the free public broker

What is true today (checked 2026-10-03 — sources at the end of this section):

- **The public PeerJS broker** (`0.peerjs.com`) is free, has no service guarantee, rate-limits, is
  reported flaky (connections that need several attempts), and **provides no TURN relay**. Fine for a
  prototype; not something to promise strangers.
- **TURN:** WebRTC connects peers directly using public STUN; when both sides are behind strict NATs
  (symmetric NAT, some mobile carriers, many corporate/VPN networks) the direct path fails and only a
  TURN relay gets data through. Commonly quoted at around one connection in ten to one in five.
  **Cloudflare Realtime TURN** has a free tier of 1,000 GB/month, then $0.05/GB. Lockstep traffic
  is tiny (≈ 3–6 KB/s per player), so the free tier is effectively unlimited for this game.

| Option | What it can do for Bannerline | Catch |
|---|---|---|
| **Vercel** | WebSockets on Vercel Functions entered **public beta on 2026-06-22**. Good for short-lived signalling (exchange offers, then hang up). | Connection cap is **300 s on Hobby**, up to 800 s on Pro, 1,800 s in an extended beta (Pro/Enterprise) — shorter than a match, so it cannot be the relay. Sockets on different instances can't see each other: rooms need an outside store (Redis). No TURN of its own. Most moving parts of the three. |
| **Cloudflare Workers + Durable Objects** | A Worker routes `/room/ABCDE` to one **Durable Object per room**; the DO holds every player's WebSocket for the whole match. It can be **just signalling** (swap WebRTC offers, then players talk directly) or a **full relay** (the DO forwards lockstep packets — works through any NAT, no WebRTC needed at all). Runs at the edge near the players. **Hibernation API**: no duration charge while sockets are idle. Same account can mint short-lived **Cloudflare Realtime TURN** credentials. | Free plan: 100,000 requests/day; incoming WebSocket messages bill at 20:1. As a full relay, a 25-min 3v3 at 10 packets/s/player ≈ 90k messages ≈ 4.5k billed requests → ~20 matches/day free, the $5 paid plan covers far more. As signalling only, effectively free. |
| **Cloudways** | Runs a Node process (`peerjs-server` or a `ws` relay) on a server you already pay for; Cloudways' managed Node hosting is in private preview (GA from $21/month), or a Node app proxied through Apache on an existing server. | It's a **server to keep alive**: one region (latency for far players), process restarts, OS/Node updates, WebSocket proxy config. PHP-oriented stack. Nothing edge-distributed. TURN would be another service (coturn) to run. |

**Recommendation: Cloudflare Workers + Durable Objects, plus Cloudflare Realtime TURN.**
Reasons: (1) a Durable Object is exactly "one room with everyone's socket in it", so rooms need no
extra store; (2) it holds sockets for the full match, which Vercel can't on the free tier; (3) it
gives a **relay fallback that needs no WebRTC**, which is the single most reliable way to get two
strangers connected — lockstep packets are tiny, so relaying all of them is cheap; (4) no server to
maintain, unlike Cloudways; (5) TURN, signalling and relay live in one account, and the owner
already uses Cloudflare.
Plan: `js/net/cfrelay.js` implementing the same interface (WebSocket to the DO); connection order
**direct WebRTC (with TURN) → DO relay**; the PeerJS transport stays as the zero-setup option.
Worker code lives in `prototypes/bannerline/server/cloudflare/` (not deployed in v1).

Sources: Vercel KB "Do Vercel Functions support WebSocket connections?"
(https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections);
Cloudflare Durable Objects pricing (https://developers.cloudflare.com/durable-objects/platform/pricing)
and WebSocket hibernation docs (https://developers.cloudflare.com/durable-objects/);
Cloudflare Realtime TURN/SFU pricing (https://developers.cloudflare.com/realtime/sfu/pricing,
https://www.cloudflare.com/products/turn-sfu/); PeerJS public server issues
(https://github.com/peers/peerjs-server/issues/461); Cloudways managed Node.js
(https://www.cloudways.com/blog/cloudways-managed-node-js-hosting-is-here/).

---

## 10. Simulation architecture

### 10.1 State (sim-only, no DOM/Three.js)

```
state = { tick, seed, rng: {combat, loot, ai, shop}, mode, mapId,
          teams: [{ id, banners, fieldId, players: [slot ids] }],
          players: [{ slot, team, kind: 'human'|'ai', ai: {difficulty, mem}, race, heroId,
                      gold, income, muster: {...}, sends: {...}, stats: {...} }],
          heroes:  [{ id, owner, cls, x, z (mm Int32), hp, mp, lvl, xp, skills, talents,
                      equip, bag, belt, buffs, cooldowns, state }],
          units:   [{ id, type, owner, field, x, z, hp, buffs, target, path idx, ... }],
          projectiles, pools, loot, events (this tick only, for the view and sound) }
```

### 10.2 Commands

`{ slot, t, kind, ...args }` with kinds: `move`, `moveDir`, `attack`, `attackMove`, `stop`,
`hold`, `cast {skill, x, z | target}`, `learn {skill}`, `talent {tier, pick}`, `send {unit}`,
`muster {upgrade}`, `buy {item}`, `sell {bagIdx}`, `equip/unequip/swap`, `use {beltIdx}`,
`pickup {lootId}`, `reforge`, `portal`, `ping {x, z}`, `pause/resume`. Validation happens inside the
sim (an illegal command is a no-op on every peer), so a buggy client can't desync others.

### 10.3 Systems order per tick

commands → AI → economy (pay, unlocks, rising tide) → spawns (sends, tides) → movement (flow-field
per field + simple separation) → targeting → combat (attacks, projectiles, skills, traits, statuses)
→ deaths/bounty/XP/loot → banners → win check → hash (every 20 ticks).

Pathing is cheap because a field is a fixed road graph: a precomputed **flow field** per field
(distance-to-Keep on a 1 m grid) + steering + separation; units leave the road only to chase a hero.

### 10.4 View interpolation

The view renders `prev → current` state with `alpha` (render at 60 fps over a 20 Hz sim). The sim
emits `events` (hit, crit, cast, death, leak, pay, drop) that drive spell FX, sound and floating
numbers. The view never writes to the sim.

---

## 11. Lobby flow and match loop

1. **Title** → Play Local · Host Online · Join (code) · Campaign · Settings.
2. **Lobby:** mode (1v1/2v2/3v3), map, slot list per team: Open / Local (device icon) / Remote
   (name, ping) / AI (+difficulty) / Closed. Each human picks **race + hero** with their own device;
   AI slots can be set to Random. Host-only: mode, map, slot kinds, start. Everyone: ready.
3. **Start** when all humans are ready → 3-2-1 → host sends `{seed, roster, mapId, rules}`; every
   peer builds the same initial state.
4. **Match.**
5. **Results:** win/lose, banners left, per player: income curve (sparkline), sends by unit,
   gold spent, kills, damage, deaths, MVP lines, the damage meter (`meters/`, already a drop-in) —
   then **Back to lobby** with the same slots, devices and peers kept; races/heroes stay picked.
   Online: everyone returns together; a peer that left frees its slot.

---

## 12. Campaign — "The Long Muster"

- **Structure:** a campaign is a list of **chapters**; a chapter belongs to a hero; v1 ships a
  4-mission **Prologue** playable with any of the four heroes (dialogue lines swap per hero via
  Lingo). Adding a hero later = adding `data/campaign/<hero>.json` with its 3–5 missions; the
  campaign map shows chapters as banners on a road.
- **Mission file:** map, player race/hero (fixed or free), enemy slots (AI difficulty + a **script**:
  timed sends, forced Tides, a boss), modifiers (no income from sends, double Tides…), objectives
  (keep ≥ N banners, survive N Tides, kill the champion, win), dialogue triggers, rewards (an item to
  a persistent **campaign stash** that carries between missions, an unlock).
- **Prologue missions:**
  1. *First Banner* (`switchback`, vs Recruit, tutorial prompts: move, kill, pay tick, send, buy).
  2. *Hold the Ford* (`fordway`, no enemy hero — survive 12 scripted Tides with 15 banners).
  3. *Two Gates* (2v2 with an AI ally vs two Veterans; teaches team bounty and gates).
  4. *The Warchief Comes* (vs Warlord; at 15:00 the enemy sends an Ashtusk Warchief with an escort;
     kill it to win).
- Campaign is single-player or local co-op (second split-screen player takes the AI ally's slot in
  mission 3). Progress saved in localStorage (`shared/store.js`, namespace `bannerline`).

---

## 13. New creature models

Each goes into `avatar-3d/js/creature-types.js` (with a gallery row in `creatures.html`), gets a
designed look in `avatar-3d/data/creature-variants.json`, and is filed in the library
(`library/data/defaults.json`, kind `enemy`, ids `bl_<id>`) so Farhold can pick them up later.
Body plans are the existing ones; new features get added to the plan builders in `creatures.js`.

| Creature | Plan | New work | Used by |
|---|---|---|---|
| `tuskback` (woolly war beast) | quad | `tusks`, `trunk`, `howdah` features | Ashtusk T5 |
| `thornback` (horned armoured beast) | quad | `horn` feature (nose), heavier `plates` | Thornmane T4 |
| `ghoul` (hunched runner) | biped | `hunch` posture, long arms, claws | Unburied T3 |
| `colossus` (bone giant) | biped | `ribs`/`bone` surface variant of `titan` | Unburied T5 |
| `crow` | bat | feathered wing variant, beak | Unburied Crow Murder (a flock = 5 instances) |
| `elder_griffin` | quad | variant of `griffin` (bigger, wing span) | Thornmane T5 |
| `tusk_ram` | vehicle (`avatar-3d/js/vehicles.js`) | new `ram` vehicle plan: roofed frame, log head | Ashtusk T4 |
| `mortar_cart` | vehicle | new `mortar` plan: wheeled tube | Freeholds T4 |
| `iron_golem` | biped | variant of `golem` (riveted plates colours) | Freeholds T5 |

Humanoid units (Levy, Raider, Shambler, Tracker, …) are **Chibi 2** looks built with
`class-outfits.js` + the warband `defs` in `prototypes/farhold/data/warbands.json`; the Courser
Knight and Boar Rider are a Chibi 2 rider on a creature mount (Farhold's mount seat code).

---

## 14. Icons and the 3D portrait

### 14.1 Icon generator (`js/view/icons.js`)

- One offscreen `WebGLRenderer` (128 × 128 render target, transparent, MSAA), one studio scene
  (key + rim light). `iconFor(spec)` builds the model (Chibi 2 / creature / weapon part from
  `chibi2-weapons.js` / armour part on a stand), frames it from `metrics()` (head-and-shoulders for
  units, three-quarter for items), renders, `readPixels` → canvas → PNG data URL.
- **Skill icons:** a 2D composite — element-tinted frame + the `assets/data/fx/*.svg` sprite for the
  skill's element/shape + a silhouette of the hero's pose (rendered once).
- **Cache:** IndexedDB keyed by `hash(spec) + ICON_VERSION`; memory LRU on top; generation is queued
  and spread over frames (≤ 4 ms/frame) so the lobby never stutters; placeholders until ready.
- Also exposed as a tool page `prototypes/bannerline/icons.html` (gallery + "download all as PNG").
  Written so other games can import it (a candidate to move to `shared/` or `avatar-3d/` later).

### 14.2 Bottom control bar with live portrait

```
┌────────┬─────────────────────┬─────────────────────┬──────────────┐
│ 3D     │ name, level, HP/MP, │ command card 4×3:   │ belt 1–4 +   │
│portrait│ dmg / armour / spd, │ skills, sends,      │ mini bag /   │
│ (live) │ buffs row, XP bar   │ muster (paged)      │ minimap      │
└────────┴─────────────────────┴─────────────────────┴──────────────┘
```

- The portrait is a **scissored viewport of the main renderer** into a tiny separate scene holding a
  clone of the selected unit (same template, so no extra build cost), playing idle, switching to
  `talk` when a voice line plays and to `hit` when it takes damage. No second WebGL context.
- Selection: your hero by default; click any unit/creep (or cycle with the pad's R3) to inspect it.
- Unit "click" voice barks via Lingo + `shared/voices.js` (formant engine, cheap).

---

## 15. HUD and camera

- **Top bar:** gold, income, pay-tick ring, Tide timer + level, both teams' banners, match clock.
- **Alerts:** "Leak! −3 banners", "Champion entering through Gate 2", income milestones.
- **Floating numbers** with `shared/format.js` (`hp` whole numbers — no "25.0200001").
- **Minimap:** both fields, units as dots, gates highlighted while a send is entering.
- **Camera:** perspective, pitch ~56°, FOV 38°, follows the hero with a soft lead toward the mouse /
  right stick; free-pan by screen edge or middle-drag; zoom 3 steps; clamped to your field (and to
  the enemy field in spectate). One camera per viewport.

---

## 16. Performance budget

| Item | Budget |
|---|---|
| Live units per field | 120 hard cap (sends beyond it wait at the gate in a queue) |
| Full 3D actors per viewport | 40 nearest (Chibi 2: 2 draw calls, ≤ 8.5k tris each) |
| Beyond that | **impostors**: each unit type pre-rendered by the icon generator to an atlas (8 directions × walk 6 + attack 4 + death 4 frames), drawn as one `InstancedMesh` per atlas |
| Draw calls per viewport | ≤ 300 (≤ 600 total in split screen) |
| Triangles per viewport | ≤ 600k |
| Spell FX | `BatchedSpellFx` (instanced sprites) |
| Sim cost | ≤ 2 ms per tick at 6 players × 120 units (node benchmark test) |
| Frame | 60 fps target on the owner's desktop, 30 fps floor with split screen on integrated GPU; dynamic resolution scale 0.6–1.0 |

---

## 17. File layout

```
prototypes/bannerline/
  index.html, icons.html, README.md
  css/{style,lobby,hud,controlbar,inventory}.css
  js/main.js                      boot, screens
  js/sim/                         PURE, deterministic, node-testable
    rng.js fixed.js trig.js hash.js state.js commands.js sim.js
    map.js flow.js movement.js combat.js traits.js statuses.js
    heroes.js skills.js talents.js economy.js tides.js
    items.js loot.js shop.js
    ai/{index,recruit,veteran,warlord,estimate,build}.js
    campaign.js replay.js
  js/net/{transport,peerjs,loopback,channel,cfrelay,lockstep,lobbysync}.js
  js/input/{devices,keyboard,gamepad,bindings,commands}.js
  js/view/{renderer,viewports,camera,terrain,actors,impostors,fx,icons,portrait,minimap,numbers}.js
  js/ui/{title,lobby,hud,controlbar,muster,inventory,shop,scoreboard,results,campaign}.js
  data/{maps,races,units,traits,heroes,talents-bl,items-bl,shop,tides,ai,balance,bindings}.json
  data/campaign/{prologue}.json
  tools/{build-hero-skills,sim-bannerline,desync-diff}.mjs
  server/cloudflare/              (not deployed in v1)
  tests/*.test.js  tests/*.spec.js
  docs/{research,plan-v1,roast,PLAN,interfaces}.md
vendor/peerjs/                    vendored, MIT, listed in vendor/README.md
```

---

## 18. Test strategy

**Node (`node --test`)**
- `determinism.test.js`: two sims, same seed + same command log → identical hash at every tick for
  20 simulated minutes, all modes, 6 AI slots; and the same run split across two worker threads.
- `replay.test.js`: record a match → replay → identical end state; a recorded log from the
  Playwright online test replays identically in node.
- `sim-purity.test.js`: scans `js/sim/**` for banned APIs (§9.1).
- `economy.test.js`: payback table per unit matches `data/units.json`; pay ticks on time; repeat-send
  falloff; rising tide.
- `counters.test.js`, `traits.test.js` (every trait in data has a handler, each moves the number it
  claims — "move the knob to an odd value and ask the module"), `skills.test.js` (every hero skill
  resolves; talents change the cast), `items.test.js` (every allowed affix resolves, no NaN, ints
  only in state), `ai.test.js` (difficulty win-rate bars over seeds, run in CI-light mode with fewer
  seeds), `lockstep.test.js` (loopback transport with latency 0–300 ms, jitter, reordering: hashes
  equal; a disconnected slot switches to AI at the announced tick), `campaign.test.js` (each mission
  file validates; scripted AI wins mission 1 objective).

**Playwright (against dev port 8401)**
- Lobby with keyboard: join with Enter, pick race/hero, ready, start vs AI, play 30 s (sim speed ×8
  debug flag), surrender, results, back to lobby with slots kept.
- **Mocked gamepad**: `addInitScript` replaces `navigator.getGamepads` with a scripted pad; press A
  to join slot 2 → slot shows the pad icon; stick moves the hero.
- **Split screen**: two viewports rendered, both non-blank, two control bars, panels open per half.
- **Online two-page loopback**: two pages with the BroadcastChannel transport; host makes a room,
  guest joins by code, 1v1 humans + 2v2 with AI, both pages report the same hash at tick 1200;
  guest closes → host sees the AI takeover. A separate opt-in spec does the same over real PeerJS.
- Icons: generator returns non-empty PNGs; portrait viewport non-blank; draw-call probe under budget.

---

## 19. Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | Interfaces | `docs/interfaces.md`: state shape, command schema, event schema, data schemas |
| M1 | Sim core | headless 1v1 with placeholder units: lanes, flow field, sends, income, Tides, banners, win; determinism + purity tests green |
| M2 | Races & units | 40 units, traits, counters, upgrades; balance sim runs |
| M3 | Heroes | 4 heroes, skills, levels, talents, respawn |
| M4 | Items | equipment/bag/belt, shop, drops, affixes, sets, uniques |
| M5 | AI | three difficulties pass the win-rate bars |
| M6 | View | fields, actors (Chibi 2 + creatures), impostors, camera, FX, sound |
| M7 | HUD | top bar, control bar + live portrait, icons, minimap, panels |
| M8 | Input + split screen | devices, ready-up, two viewports |
| M9 | Lobby loop | title → lobby → match → results → lobby |
| M10 | Online | transports, lockstep, desync check, disconnect → AI; co-op vs AI |
| M11 | Campaign | prologue 4 missions + stash |
| M12 | Creatures | 9 new models in avatar-3d + library |
| M13 | Ship | tests, docs (README, CLAUDE.md row, index card, docs/playground.md), review, publish |

## 20. Parallel workstreams (file ownership)

M0 is written first by the lead; then these run in parallel, each owning its files outright:

| Stream | Owns | Depends on |
|---|---|---|
| **A Sim core** | `js/sim/{rng,fixed,trig,hash,state,commands,sim,map,flow,movement,combat,statuses,economy,tides,replay}.js`, `data/{maps,tides,balance}.json` | M0 |
| **B Content** | `data/{races,units,traits,heroes,talents-bl}.json`, `js/sim/{traits,heroes,skills,talents}.js`, `tools/{build-hero-skills,sim-bannerline}.mjs` | A's combat API |
| **C Items** | `js/sim/{items,loot,shop}.js`, `data/{items-bl,shop}.json`, `js/ui/{inventory,shop}.js`, `css/inventory.css` | A, M0 |
| **D AI** | `js/sim/ai/*`, `data/ai.json` | A, B, C APIs |
| **E View** | `js/view/*` (except icons/portrait), `css/style.css` | M0 events |
| **F Icons & portrait** | `js/view/{icons,portrait}.js`, `icons.html` | E renderer |
| **G UI & input** | `index.html`, `js/main.js`, `js/ui/*` (except inventory/shop), `js/input/*`, `css/{lobby,hud,controlbar}.css`, `data/bindings.json` | M0 |
| **H Net** | `js/net/*`, `vendor/peerjs/`, `server/cloudflare/` | A (tick/commands/hash) |
| **I Creatures** | `avatar-3d/js/{creature-types,creatures,vehicles}.js` additions, `avatar-3d/data/creature-variants.json`, `library/data/defaults.json`, avatar-3d tests | none — can start now |
| **J Campaign** | `js/sim/campaign.js`, `data/campaign/*`, `js/ui/campaign.js` | A, D, G |

Tests live with their owner (`tests/<area>.test.js`). Shared files (`index.html`, `main.js`) belong
to G; others send G a one-line hook request rather than editing them.

---

## 21. Open questions for the roast

1. Separate fields with no hero-vs-hero — does it feel like a game *between* players, or two solo
   games? (Clash variant? hero sends as a T6 option?)
2. Is 10 s pay + 40 s Tides the right rhythm, and is minute-gated tier unlocking too rigid?
3. Is a 40-unit roster + 4 heroes + full items too much content for the first playable?
4. Impostors vs full 3D for every unit — art quality vs budget.
5. Can a gamepad player muster fast enough while fighting (radial while held)?
6. Lockstep with a host relay — does one slow peer stall six players? (adaptive delay, kick vote)
7. Real inventory in a 20-minute match: depth vs time spent in menus (does the game pause for
   nobody? should shopping be remote?)
8. Snowball: a leaking team loses banners AND the leaker gains income. What's the comeback lever?
9. AFK/leaver: AI takeover is the answer; is Veteran the right replacement?
10. Campaign value: 4 missions with scripted AI — enough to teach and to be fun?
11. Shared team field vs one lane per player (the old maps' layout) — which makes better team games?
