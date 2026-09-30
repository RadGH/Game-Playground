# Tinker — class design (`tinker`)

> *"Hold this. No — the other end. The end that isn't ticking."*

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Follows the class template in [page 00 §5](../00-OVERVIEW.md).
Canon facts used (page 00 §6): primary role **Damage**, hybrid role **Healer**, build **ranged** (gun, crossbow),
**medium** armour, resource **Tempo**, mechanic **Devices + sentry — deployables, overclock, scrap; repair drones
heal**, spell slots **1 / 4 / 10 / 18 / 28 / 40**, calling quests **6 / 20 / 40**, talent tiers **12 / 22 / 32 / 45**, cap **60**.
Owner of this file: every `tinker_*` spell, device, talent, set, legendary, unique and soul.

> **Name note — "Devices", not "Gadgets".** Canon §6 (round 2) calls the tinker's deployables **Devices**. On this page
> and in the game's text they are always Devices, so they can never be confused with the **Gadget** socketables
> (`gdg_`) that the Engineering profession makes ([page 19](../19-PROFESSIONS.md), page 08 sockets). A Device is a
> thing the tinker throws on the ground in a fight; a Gadget is a crafted item you put in a gear socket.
> (Settled in round 2: `_SWEEP_R2.md` §2.)

## How to read the numbers on this page

| Term | Meaning |
|---|---|
| **% WD** | percent of your gun's or crossbow's damage roll (page 05). Devices use **your** weapon damage at the moment they are placed (they do not update if you swap weapons). Heals in the Medic Kit are also % WD. The number is final |
| **Tempo** | the tinker's resource: a **small pool that refills fast**. Pool **100**, **refills 25 per second** (a full bar every 4 s). It does not drain out of combat. **Builders:** the refill; each Scrap picked up +5 Tempo (before Calling 6 Scrap does nothing else). **Spenders:** Rivet Shot 30, Springtrap Mine 45, Aether Battery 45, Cog Sentry 50, Patchwork Drone 55, Iron Walker 80 |
| **Device** | anything you place in the world: sentry, mines, battery, drone, walker. Devices are bodies with health (page 05) that enemies **can** attack |
| **Device cap** | how many Devices you may have out at once (a throw of mines counts as one Device) |
| **Scrap** | 0–10 pieces, the tinker's second resource (§2) |
| GCD | 1.0 s |
| **Targeting** | page 02 / 00 §12.1 W8. **Needs target** = will not cast without a valid hard target. **Auto-target** = with no valid target it picks the valid enemy closest to your aim point in range. **Ground** = placed at your aim point. **Self**. **Ally** = a party member or yourself (`F1`–`F5` or their frames) |
| **Tags** | page 05 §Tags owns the list. A Device's damage carries the Device's own tags (a Cog Sentry shot is `tag_physical` `tag_ranged` `tag_projectile` `tag_minion`), so "+% Minion damage" raises everything a Device does |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A clockwork engineer from the Greyridge workshops who fights with a crossbow or a pistol in one hand and a bag of ticking inventions in the other. The fight is a workbench: lay out Devices, keep them fed, overclock them at the right moment, collect the pieces. |
| Primary role | **Damage** (ranged, zone control) |
| Hybrid role | **Healer** — the **Medic Kit**: repair drones, mender sentries and patch mines heal the party (§5) |
| Build | ranged (gun, crossbow) |
| Armour | medium (smith apron, goggles, pocket-watch, gear pack) |
| Weapons | crossbow or hand crossbow, **pistol or long gun** (page 08 weapon bases), + optional dagger off hand `(reuse: farhold/js/weapons.js crossbow pattern; bow draw rule; a gun uses the crossbow pattern with a louder report)` |
| Primary attribute | DEX (INT second — See QUESTIONS.md C15) |
| Resource | **Tempo** + **Scrap** |
| Companion | none. The **Cog Sentry** is a spell (slot 2), not a pet; Devices take no party slot and never count toward soaks. |
| Starting kit | Brass Hand Crossbow, medium apron-coat, light boots, goggles (cosmetic), 1 spell (`tinker_rivet_shot`) |

**Playstyle in three sentences.** Place Devices before the fight reaches them. Shoot Rivet Shots while the
Devices work. When a Device runs out it drops Scrap; spend Scrap to Overclock another Device, which ends in a blast.

---

## 2. Class mechanic — Devices, Scrap and Overclock

### 2.1 Rules

- **Device cap:** 2 at level 1 → 3 (Calling 6) → 4 (Calling 20) → 5 (Calling 40). A new Device over the cap removes your oldest (it drops its Scrap).
- **Scrap:** when a Device expires, is destroyed or is removed, it drops **1 Scrap** (the Walker drops 3). Scrap flies to you automatically within 20 m (a brass spark). Max 10. Scrap is kept for 30 s after combat, then lost.
- **Overclock** (Calling 6, class key **`Q`** — page 02 §5.16): target one of your Devices within 25 m (the one nearest your aim point, else the newest). Costs **3 Scrap**. The Device works **+60% faster** (fire rate, pulse rate, heal rate) for 6 s, then **overloads**: it bursts for 200% WD in 5 m (enemies only; in the Medic Kit it heals allies in 5 m for 120% WD instead) and is removed (which drops its Scrap again, so an overclock nets −2 Scrap). 1 s cooldown. Tags of the overload: `tag_physical` `tag_area` (Medic Kit: `tag_heal` `tag_area`).
- **Toolbelt** (Calling 20; the Cog Sentry's models already at Calling 6): at any Workbench (towns, camps — page 01) or out of combat anywhere via the Toolbelt panel (`scr_tinker_toolbelt`, page 03), choose one **model** for each of: Cog Sentry, Springtrap Mine, Iron Walker. Changing a model takes 5 s, out of combat.
- **Linkage** (Calling 40): your Devices within 10 m of each other are joined by a brass-blue arc (a visual tether). Each Device gets +8% effect per linked Device (max +32%). **Contraption:** when all five of your Devices are linked at once, every 10 s they fire together — a 6 m shockwave around each Device for 120% WD (Medic Kit: a 6 m heal pulse for 60% WD).

### 2.2 The gauge (HUD)

- **Workbench strip** above the Tempo bar: one **gear icon per Device out** (up to 5), each showing the Device's picture, a ring for lifetime left and a red fill for health lost. Hovering a gear highlights that Device in the world.
- **Scrap counter**: ten small brass nuts to the right of the strip; full nuts are lit. At 3+ the Overclock key icon lights.
- Overclocked Devices show a spinning red cog on their gear icon with the 6 s countdown.
- Linkage (Calling 40): lines between linked gear icons; the Contraption timer shows as a small clock when active.
- A small **red cross** on the strip's left end shows when the Medic Kit is on.

### 2.3 Calling quests (page 14 owns the quest text)

| Level | Quest id | Summary | Grants |
|---|---|---|---|
| 1 | — | — | 2 Devices, Scrap drops (nothing to spend it on yet: each piece gives +5 Tempo). |
| 6 | `q_calling_tinker_1` | Hearthvale: repair Brightwater's broken mill-wheel with parts salvaged from wrecked scarecrow-constructs (kill 8, collect 10 scrap), then defend it with your sentry against an attack by the rest of them. | **Overclock**, the **Scrap counter** and gauge, **3 Devices**, the Cog Sentry's three models, and the **Medic Kit** (the Healer switch, §5). |
| 20 | `q_calling_tinker_2` | Greyridge → Sunscar: a Deepforge tinkerer lends you her blueprints if you field-test three prototypes (a flame sentry at a scorpion nest, a mending sentry escorting a caravan, a frost mine at a pass). | the full **Toolbelt** (mine and walker models) and **4 Devices**. |
| 40 | `q_calling_tinker_3` | Riftmarch: build a rift-anchor from five Devices in the right layout (a placement puzzle on a grid of floating stones) while rift-spawn attack it for 3 minutes. | **Linkage** + **Contraption** and **5 Devices**. |

---

## 3. The six spells

### 3.1 At a glance

| Slot | Lvl | id | Name | Cost | CD | Cast | Targeting | Range / shape | Tags | Main number |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `tinker_rivet_shot` | Rivet Shot | 30 Tempo | — | instant | Auto-target | 36 m bolt, 1 m splash | `tag_physical` `tag_attack` `tag_ranged` `tag_projectile` | 110% WD |
| 2 | 4 | `tinker_cog_sentry` | Cog Sentry | 50 Tempo | 12 s | 0.5 s | Ground | place 15 m; Device, 25 m reach, 20 s | `tag_physical` `tag_ranged` `tag_projectile` `tag_minion` `tag_duration` | 35% WD / 1 s |
| 3 | 10 | `tinker_springtrap_mine` | Springtrap Mine | 45 Tempo | 16 s | instant | Ground | throw 20 m; 3 mines, 4 m blast | `tag_physical` `tag_trap` `tag_area` | 150% WD + root 2 s each |
| 4 | 18 | `tinker_aether_battery` | Aether Battery | 45 Tempo | 45 s | 0.5 s | Ground | place 12 m; Device, 8 m aura, 12 s | `tag_lightning` `tag_aura` `tag_area` `tag_duration` | +15% haste, resource refill |
| 5 | 28 | `tinker_patchwork_drone` | Patchwork Drone | 55 Tempo | 30 s | instant | Ally | 30 m; Device on an ally, 10 s | `tag_heal` `tag_shield` `tag_minion` `tag_duration` | 3% max health / s, 20% barrier save |
| 6 | 40 | `tinker_iron_walker` | Iron Walker | 80 Tempo | 120 s | 1.5 s | Ground | place 10 m; Device (counts as 2), 20 s | `tag_physical` `tag_melee` `tag_ranged` `tag_projectile` `tag_area` `tag_minion` | punches 200%, rockets 6 × 60% |

### 3.2 Details

**`tinker_rivet_shot` — Rivet Shot** (slot 1, level 1) `(new)`
- 30 Tempo · no cooldown · instant · 36 m · bolt, 1 m splash.
- Targeting: **Auto-target** — your hard target, or the enemy nearest your aim point.
- Tags: `tag_physical` `tag_attack` `tag_ranged` `tag_projectile` (Rivet Shot is **not** a basic attack; quiver effects do not apply to it — page 08).
- 110% WD. An enemy hit within 6 m of one of your Devices is **Tagged** for 6 s (page 05 status `Tagged`): your Devices prefer Tagged targets.
- Look: a brass rivet with a blue spark trail (spellfx `physical` arrow + `lightning` spark trail); a gun fires the same rivet with a muzzle puff. Sound: a sharp clank-thwip (gun: a short crack).

**`tinker_cog_sentry` — Cog Sentry** (slot 2, level 4) `(new)` — Device
- 50 Tempo · 12 s · 0.5 s cast · **Ground**, up to 15 m · lasts 20 s · health 25% of yours · max 1 Cog Sentry (talents: 2).
- Tags: `tag_physical` `tag_ranged` `tag_projectile` `tag_minion` `tag_duration`.
- Fires at the nearest (or Tagged) enemy within 25 m every 1.0 s for **35% WD**. Its model comes from the Toolbelt (§4).
- Look: a knee-high brass tripod with a spinning barrel (Farhold `clockwork_sentry` pet model). Sound: ratchet wind-up, rhythmic "chk-chk" shots.

**`tinker_springtrap_mine` — Springtrap Mine** (slot 3, level 10) `(new)` — Device (one for all 3)
- 45 Tempo · 16 s · instant · **Ground**: throws 3 mines in a 30° fan toward your aim point, up to 20 m · arm after 1 s · last 30 s.
- Tags: `tag_physical` `tag_trap` `tag_area`.
- Each triggers when an enemy comes within 1.5 m: **150% WD in 4 m** and **root 2 s** (bosses: no root; +10% damage taken from you for 4 s).
- Look: palm-sized brass discs that snap open like jaws (spellfx `physical` impact + root STATUS_FX swapped for iron jaws). Sound: click-click arming, a spring "sprang" and a bang.

**`tinker_aether_battery` — Aether Battery** (slot 4, level 18) `(new)` — Device, **support**
- 45 Tempo · 45 s · 0.5 s · **Ground**, up to 12 m · 12 s · health 30% of yours.
- Tags: `tag_lightning` `tag_aura` `tag_area` `tag_duration`.
- Allies within 8 m: **+15% attack and cast speed**, and per second they regain 5 Tempo / 5 Momentum / 0.5% of max Mana.
- Your Devices within 8 m work **30% faster**.
- Look: a waist-high glass battery with a blue crackling core (Farhold `tinker` look `chest_glow` colour `#40c8ff`), a blue ground ring (spellfx `lightning` ground disc). Sound: electric hum loop.

**`tinker_patchwork_drone` — Patchwork Drone** (slot 5, level 28) `(new)` — Device, **heal**
- 55 Tempo · 30 s · instant · **Ally** (a party member or yourself) within 30 m · 10 s.
- Tags: `tag_heal` `tag_shield` `tag_minion` `tag_duration`.
- A little propeller drone circles the ally, healing **3% of their max health per second**. If the ally drops below 30% health while the drone is on them, the drone **pops**: barrier 20% of their max health for 6 s, and ends.
- Look: a flying cog with rivet-arms dripping brass patches (holy_mote sprites recoloured brass). Sound: a tiny propeller whine + soft clicks when it heals.

**`tinker_iron_walker` — Iron Walker** (slot 6, level 40) `(new)` — Device (counts as **2** toward the cap)
- 80 Tempo · 120 s · 1.5 s build · **Ground**, up to 10 m · 20 s · health 150% of yours, armour as heavy.
- Tags: `tag_physical` `tag_melee` `tag_ranged` `tag_projectile` `tag_area` `tag_minion`.
- Walks to the nearest/Tagged enemy (3 m/s). Every 2 s: **punch 200% WD** in a 3 m 90° arc. Every 6 s: **rocket volley**, 6 rockets at up to 3 enemies within 20 m, 60% WD each in 4 m.
- **Climb In** (interact key `E` within 3 m): you ride inside for the rest of its time; your spell bar becomes the **Walker bar** (§4). Its health becomes your shield (hits on you hit it first).
- Drops 3 Scrap when it ends.
- Look: a 3 m two-legged brass walker with a boiler back, pistons and a cockpit hatch (Chibi 2 parts scaled + `avatar-3d/js/vehicles.js` wheel/boiler pieces). Sound: heavy pistons, steam hisses, rocket whooshes.

### 3.3 Rotation / how it plays

- **Solo:** Cog Sentry and mines placed where the pull will run → Rivet Shot to pull → enemies walk into the mines → Overclock the sentry as it runs out → pick up the Scrap. Patchwork Drone on yourself is your self-heal.
- **Dungeon (damage):** pre-place mines and sentry at every pull, Battery on the group for the boss, Walker on cooldown. Devices do not move and bosses do — place for the next phase, not this one. Artillery Walker is ideal for "stand still" phases.
- **Tempo:** Rivet Shot every GCD costs 30 a second against 25 refill: about 20 s of non-stop fire before you must skip one. Placing Devices (45–80) is the real Tempo cost, so a tinker lays its Devices first and shoots after.

### 3.4 Boss mechanics

| Mechanic | Tinker answer |
|---|---|
| Room-wide damage | Patchwork Drone barrier; Battery speed to finish phases faster; Medic Kit pulses. |
| Soaks | Devices never count toward soak pips (00 §10). Soak Plate talent: you take 50% less damage from soaks. |
| Boss cleaves Devices | Devices have health; bosses with room-wide attacks hit them too — expect to rebuild (Scrap back). |
| Moving fights | Throwable sentry, Tripod Legs, Backpack Battery. |
| Interrupts | Flash Mine (non-boss); no boss interrupt. |
| Adds | Minefield + Chain Blast where adds spawn. Bulwark Walker holds adds for 20 s. |
| "Do not stand still" void zones | Place Devices outside the zone line — they cannot be moved. |

---

## 4. Alternate spells — the Toolbelt and the Walker bar

### 4.1 Toolbelt models (Cog Sentry models at Calling 6, the rest at Calling 20)

| Device | Model id | Name | What changes | Tags |
|---|---|---|---|---|
| Cog Sentry | `tinker_cog_sentry_bolt` | Bolt Sentry (default) | as §3 | as §3 |
| Cog Sentry | `tinker_cog_sentry_flame` | Flame Sentry | 8 m, 60° cone, 5 ticks/s of 10% WD fire + Burning (30% WD over 3 s). | `tag_fire` `tag_area` `tag_minion` `tag_duration` |
| Cog Sentry | `tinker_cog_sentry_mender` | Mender Sentry | no damage; heals the lowest-health ally within 20 m for 60% WD every 1.5 s. | `tag_heal` `tag_minion` `tag_duration` |
| Springtrap Mine | `tinker_springtrap_mine_jaw` | Jaw Mine (default) | as §3 | as §3 |
| Springtrap Mine | `tinker_springtrap_mine_frost` | Frost Mine | 120% WD ice, freeze 3 s (bosses: 30% slower casts and attacks for 4 s). | `tag_ice` `tag_trap` `tag_area` |
| Springtrap Mine | `tinker_springtrap_mine_flash` | Flash Mine | 80% WD, blinds 4 s, interrupts non-boss casts. | `tag_lightning` `tag_trap` `tag_area` |
| Springtrap Mine | `tinker_springtrap_mine_patch` | Patch Mine | see §5 (Medic Kit) | `tag_heal` `tag_shield` `tag_trap` `tag_area` |
| Iron Walker | `tinker_iron_walker_brawler` | Brawler (default) | as §3 | as §3 |
| Iron Walker | `tinker_iron_walker_bulwark` | Bulwark Walker | taunts enemies within 8 m every 4 s, 300% your health, punches 120%; no rockets. An emergency off-tank. | `tag_physical` `tag_melee` `tag_minion` |
| Iron Walker | `tinker_iron_walker_artillery` | Artillery Walker | stands still, fires a 5 m mortar at 30 m every 2 s for 150% WD; no punches. | `tag_physical` `tag_ranged` `tag_projectile` `tag_area` `tag_minion` |
| Iron Walker | `tinker_iron_walker_mender` | Mender Walker | see §5 (Medic Kit) | `tag_heal` `tag_aura` `tag_area` `tag_minion` |

### 4.2 The Walker bar (while Climbed In)

| Key | id | Name | Numbers | Tags |
|---|---|---|---|---|
| 1 | `tinker_walker_haymaker` | Haymaker | Auto-target, 3 m arc, 260% WD, knockback 4 m (non-boss). No cost, 2 s CD. | `tag_physical` `tag_attack` `tag_melee` `tag_area` |
| 2 | `tinker_walker_rocket_barrage` | Rocket Barrage | Ground, 30 m, 8 rockets in a 6 m area, 70% each. 8 s CD. | `tag_physical` `tag_ranged` `tag_projectile` `tag_area` |
| 3 | `tinker_walker_steam_vent` | Steam Vent | Self, 6 m ring, 150% WD; allies inside are cleansed of one slow. 10 s CD. | `tag_physical` `tag_area` |
| 4 | `tinker_walker_eject` | Eject | Self: leave the Walker; it overloads (as Overclock) 1 s later. | — |

Keys 5–6 are greyed out. Leaving by Eject or by the Walker's timer puts your normal bar back (page 02 §5.16).

---

## 5. The hybrid role — Healer (the Medic Kit)

**Role focus.** The tinker uses the canon **Role focus** switch (00 §6: in the spellbook, out of combat only,
saved per Loadout). Setting it to **Hybrid** turns on the **Medic Kit** — the two are one switch, also shown on
the Toolbelt panel (`scr_tinker_toolbelt`; 5 s, like changing a model; unlocks at Calling 6) — and the Dungeon
Finder then queues the tinker as **Healer**. The Medic
Kit swaps every damage Device for its healing twin and turns Rivet Shot into a two-faced shot. Heals are **% WD**,
so a better gun means better heals.

**While the Medic Kit is on:**

| Piece | What changes |
|---|---|
| Your damage | **−25%** on everything that still deals damage |
| Rivet Shot → **Stitch Rivet** `tinker_stitch_rivet` | **Needs target** (an ally **or** an enemy), 36 m, 30 Tempo, instant. On an **ally** (`F1`–`F5` or their frame): heal **130% WD** and they are **Stitched** for 4 s (the next Device heal on them is +20%). On an **enemy**: 70% WD and it is Tagged. Tags `tag_heal` `tag_ranged` `tag_projectile` (ally) / as Rivet Shot (enemy) |
| Cog Sentry | is always the **Mender Sentry** (60% WD heal on the lowest ally in 20 m every 1.5 s) |
| Springtrap Mine → **Patch Mine** `tinker_springtrap_mine_patch` | Ground, 3 mines, 20 m. An **ally** stepping within 1.5 m pops one: heal **120% WD** + a barrier of 5% max health for 6 s. A mine not used after 10 s rolls to the nearest injured ally within 6 m and pops. Enemies stepping on one are rooted 2 s but take no damage |
| Aether Battery | also heals allies inside **1% of max health per second** (adds `tag_heal`) |
| Patchwork Drone | **2 charges**, heal +30% (3.9% max health per second) |
| Iron Walker → **Mender Walker** `tinker_iron_walker_mender` | stands where placed for 20 s: every 2 s it pulses **3% max health** to every ally within 12 m, and allies within 12 m take **10% less damage**. Climb In gives the Walker bar with Haymaker swapped for **Vent Mist** (Self, 8 m, heal 150% WD to allies, 4 s CD) |
| Overclock | overloads heal (§2.1) instead of hurting |
| Revive | the talent **Jump Leads** (Patchwork Drone t3a) is the tinker's in-combat revive; no group limit (00 §12.1 W21) |

**Talents that help:** Patchwork Drone t1a *Hopping Drone*, t2a *Solder Shield*, t2b *Cleaning Arm*, t3a
*Jump Leads*, t4a *Swarm*; Aether Battery t1a *Backpack Battery* (the heal aura follows you); Rivet Shot t3a
*Spot Weld*. **Gear:** a gun or crossbow with high weapon damage (heals scale with it), the Forgefire Rig set
(§8), the soul `soul_field_surgeon` (§9).

**How good it is.** Against the cleric (the primary healer), a Medic Kit tinker gives about **80% of the
steady healing** over a fight — the Devices heal on their own while the tinker shoots Stitch Rivets — but its
**burst** healing is weak: most of it is placed ahead of time, and a Device on the wrong side of the room heals
nobody. That is ample for the **open world, Normal dungeons and Depth up to about 10**. In **Challenge mode**
back-to-back group-wide hits outrun it; a Challenge party with a tinker healer wants a second source of group
healing (a paladin, bard or druid hybrid).

---

## 6. Utility spells

| id | Name | What it does |
|---|---|---|
| `tinker_field_repair` | **Field Repair** `(new)` | Out of combat only, no slot. 4 s channel (you kneel over an open tool roll). Every party member within 10 m restores **15% durability** on every equipped item (page 05 durability). 10 min cooldown. Costs nothing. Tags: none. Sound: ratchets and a satisfied "tk". |

The tinker has no travel spell; it uses scrolls and the Recall Stone ([page 20](../20-TRAVEL.md)).

---

## 7. Talents

One pick per tier. Tiers open at **12 / 22 / 32 / 45** (the later of the tier's level and the spell's slot level).
Ids `<spellid>_t<tier><a|b|c>`. Talents on a Device also apply to its Medic Kit twin unless they say otherwise.
`(reuse: prototypes/farhold/js/skilltalents.js)`

### Rivet Shot
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `tinker_rivet_shot_t1a` | Rivet Spray | 3 rivets in a 12° fan, 50% each (Stitch Rivet: the side rivets heal the 2 allies nearest the target for 40%). |
| 12 | `tinker_rivet_shot_t1b` | Magnet Rivet | The rivet stays in the target; your Devices' shots on it do +15%. |
| 22 | `tinker_rivet_shot_t2a` | Salvage Tip | Kills with Rivet Shot drop 1 Scrap. |
| 22 | `tinker_rivet_shot_t2b` | Arc Rivet | Chains to 2 enemies within 6 m of your Devices, 60%. Adds `tag_lightning`. |
| 32 | `tinker_rivet_shot_t3a` | Spot Weld | Hitting your own Device (yes, shoot it) repairs it 15% and adds 2 s. |
| 32 | `tinker_rivet_shot_t3b` | Coilgun | Hold to charge 1.2 s: 280% WD, passes through every enemy in the line. |
| 45 | `tinker_rivet_shot_t4a` | Autoloader | Every 4th Rivet Shot is free and fires from every Device too (35%). |
| 45 | `tinker_rivet_shot_t4b` | Tuning Fork | Rivet Shot adds 1 s to every Device within 10 m of the target. |

### Cog Sentry
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `tinker_cog_sentry_t1a` | Twin Sentries | 2 Cog Sentries allowed, each at 70%. |
| 12 | `tinker_cog_sentry_t1b` | Throwable | Instant: you throw it 25 m; it unfolds on landing. |
| 22 | `tinker_cog_sentry_t2a` | Reactive Plating | When hit, fires back at the attacker (35%, once per 1 s). |
| 22 | `tinker_cog_sentry_t2b` | Tripod Legs | The sentry follows you at 4 m (becomes **Self**-placed). |
| 32 | `tinker_cog_sentry_t3a` | Last Round | When it expires, fires a 10-shot burst at its target (Mender: a 10-heal burst on the lowest ally). |
| 32 | `tinker_cog_sentry_t3b` | Salvage Frame | Drops 2 Scrap instead of 1. |
| 45 | `tinker_cog_sentry_t4a` | Sentry Nest | Becomes 3 mini-sentries (each 20%, 12 m reach) that count as separate Linkage nodes but one Device toward the cap. |
| 45 | `tinker_cog_sentry_t4b` | Overclock Governor | Overclocking a sentry does not destroy it (no overload, no Scrap back). |

### Springtrap Mine
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `tinker_springtrap_mine_t1a` | Minefield | 5 mines in a 5 m circle at the aim point. |
| 12 | `tinker_springtrap_mine_t1b` | Sticky Mine | Becomes **Needs target**: one mine thrown at an enemy sticks and bursts after 2 s for 350% in 5 m. |
| 22 | `tinker_springtrap_mine_t2a` | Tripwire | Mines within 8 m of each other are joined by a wire; an enemy crossing a wire triggers both ends. |
| 22 | `tinker_springtrap_mine_t2b` | Chain Blast | A mine bursting triggers every other mine within 6 m. |
| 32 | `tinker_springtrap_mine_t3a` | Bouncing Jack | Mines hop 1.5 m up before bursting: +50% and knock non-bosses down 1 s. |
| 32 | `tinker_springtrap_mine_t3b` | Scrap Jaws | Each mine that triggers drops 1 Scrap. |
| 45 | `tinker_springtrap_mine_t4a` | Seeker Mines | Mines crawl toward the nearest enemy (Patch Mines: injured ally) within 10 m at 2 m/s. |
| 45 | `tinker_springtrap_mine_t4b` | Soak Plate | You take 50% less damage from soaks (orange circles). Mines, like every Device, never count toward soak pips — See QUESTIONS.md C3. |

### Aether Battery
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `tinker_aether_battery_t1a` | Backpack Battery | Becomes **Self**: worn on your back, aura around you (6 m). |
| 12 | `tinker_aether_battery_t1b` | Twin Cells | Two batteries at two points, 5 m auras. |
| 22 | `tinker_aether_battery_t2a` | Surge Line | Casting it also gives allies inside +20% move speed for 4 s. |
| 22 | `tinker_aether_battery_t2b` | Capacitor | Stores 20% of damage dealt by allies inside; when it ends, releases it as a 6 m blast. |
| 32 | `tinker_aether_battery_t3a` | Grounding Rod | Allies inside take 25% less lightning and chain damage. |
| 32 | `tinker_aether_battery_t3b` | Recharge | Scrap within 8 m of it is worth double. |
| 45 | `tinker_aether_battery_t4a` | Overcharge Field | Allies inside also get +10% damage. |
| 45 | `tinker_aether_battery_t4b` | Perpetual Engine | Lasts as long as it is inside a Linkage (Calling 40) with 2+ Devices, up to 30 s. |

### Patchwork Drone
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `tinker_patchwork_drone_t1a` | Hopping Drone | After 5 s it hops to the lowest-health ally within 20 m. |
| 12 | `tinker_patchwork_drone_t1b` | Two Drones | 2 charges (Medic Kit: 3 charges). |
| 22 | `tinker_patchwork_drone_t2a` | Solder Shield | Starts with a barrier of 10% max health on the ally. |
| 22 | `tinker_patchwork_drone_t2b` | Cleaning Arm | Removes one poison or bleed on arrival. |
| 32 | `tinker_patchwork_drone_t3a` | Jump Leads | Can be cast on a **dead** ally: revives them at 20% health after a 4 s channel. That use has a 120 s cooldown of its own; there is no group limit on revives (00 §12.1 W21). |
| 32 | `tinker_patchwork_drone_t3b` | Last Weld | The barrier on pop is 35%. |
| 45 | `tinker_patchwork_drone_t4a` | Swarm | 3 small drones on 3 allies at 50% each. |
| 45 | `tinker_patchwork_drone_t4b` | Attack Drone | On yourself it also fires 40% WD shots every 1 s (not in the Medic Kit). |

### Iron Walker
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `tinker_iron_walker_t1a` | Quick Build | Instant build, but lasts 15 s. |
| 12 | `tinker_iron_walker_t1b` | Heavy Frame | Lasts 30 s and counts as 3 Devices. |
| 22 | `tinker_iron_walker_t2a` | Jump Jets | The Walker can leap 12 m to a target every 8 s (lands for 150% in 4 m; the Mender Walker lands with a 150% WD heal). |
| 22 | `tinker_iron_walker_t2b` | Passenger Seat | An ally can Climb In instead of you (their bar becomes the Walker bar). |
| 32 | `tinker_iron_walker_t3a` | Scrap Furnace | Each Scrap you pick up while it is out adds 1 s. |
| 32 | `tinker_iron_walker_t3b` | Self-Destruct | Its end is an overload at 400% in 8 m (Mender: a 20% max health heal in 8 m). |
| 45 | `tinker_iron_walker_t4a` | Twin Walkers | Two walkers at 60%, each counts 2. |
| 45 | `tinker_iron_walker_t4b` | Colossus | 5 m tall, 300% punches, rockets every 3 s; counts as 5 Devices (so it is your only Device). |

(Renamed: *Bouncing Betty* → **Bouncing Jack** — the old name is a real-world weapon's nickname.)

---

## 8. Class sets

### `set_tinker_workshop_harness` — The Workshop Harness (levels 13–18, dungeon set)
Drops from `d03_shaft_seven` and `d04_bellows_keep` bosses on **Normal** (15%, at the dungeon's level) and
**Challenge** (item level 60); their Depth end chests can drop it too.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Devices last +20%. | all Devices |
| 4 | Cog Sentry's shots (or heals) have a 10% chance to drop 1 Scrap. | `tinker_cog_sentry` |
| 6 | Springtrap Mine throws 4 mines. | `tinker_springtrap_mine` |

### `set_tinker_unmade_blueprints` — The Unmade Blueprints (levels 48–51, dungeon set)
Drops from `d12_unmade_workshop` bosses on **Normal** (15%) and **Challenge** (item level 60).

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Overclock costs 2 Scrap. | Overclock |
| 4 | Every overload also heals allies within 5 m for 60% WD (in the Medic Kit: 180% WD instead of 120%). | Overclock |
| 6 | Iron Walker builds a free Cog Sentry on its shoulder (does not count toward the cap). | `tinker_iron_walker` |

### `set_tinker_forgefire_rig` — The Forgefire Rig (level 60, endgame set)
Item level 60. Drops from **Challenge-mode `d15_fire_court` and `d16_the_spire` bosses** (one piece per boss;
page 12 names which) and from the **end chest of any dungeon at Depth 10 or deeper** (one random piece, 8%).
Engineers can also **craft** the two cheapest pieces (hands, feet) at 280 Engineering skill (page 19).

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Aether Battery lasts 18 s. | `tinker_aether_battery` |
| 4 | Patchwork Drone pops at 40% health instead of 30% and can pop twice. | `tinker_patchwork_drone` |
| 6 | Contraption fires every 6 s and needs only 4 linked Devices. | Linkage |

(Renamed: `set_tinker_emberforge_rig` Emberforge Rig → `set_tinker_forgefire_rig` **The Forgefire Rig**.)

---

## 9. Class legendaries, uniques and souls

### Legendaries
| id | Name | Slot | Power (numbers) | Drop source |
|---|---|---|---|---|
| `leg_perpetual_spring` | The Perpetual Spring | neck | Device cap +1 (max 6). | `b_oddrin_the_unmaker` Vell Oddrin, the Unmaker (`d12_unmade_workshop` end boss) on Challenge, 4%; its Depth end chest 2% |
| `leg_masterwright_goggles` | Masterwright's Goggles | head | Overclocked Devices no longer overload; they return to normal, and Overclock costs 4 Scrap. | a Challenge-mode `d16_the_spire` boss (page 12 names which), 5% |
| `leg_scrapheart_crossbow` | Scrapheart Crossbow | crossbow | Rivet Shot spends 1 Scrap if you have 5+ for 300% WD and 5 m splash (Stitch Rivet on an ally: 300% WD heal). | `b_unmoored` The Unmoored (`riftmarch` world boss, page 13), once a week, 6% |
| `leg_pocketwatch_of_the_first_cog` | Pocketwatch of the First Cog | neck | Every 30 s, the next Device you place is built at double effect (sentry 70%, battery +30%, etc.). | `b_the_finished_thing` The Finished Thing (`d12_unmade_workshop` secret boss) on Challenge, 3% |
| `leg_the_walking_forge` | The Walking Forge | chest | Iron Walker's cooldown drops 5 s per Scrap you spend while it is on cooldown. | `b_fire_king_kaedros` Kaedros, the Fire King (`d15_fire_court` end boss) on Challenge, 5% |

### Uniques
| id | Name | Slot | Power | Drop source |
|---|---|---|---|---|
| `uq_brass_knuckle_crossbow` | Brass-Knuckle Crossbow | hand crossbow | Rivet Shot staggers non-bosses 0.5 s. | `b_hollow_thane` The Hollow Thane (`d01_hollow_barrow` end boss), 12% |
| `uq_clicking_satchel` | The Clicking Satchel | waist | Scrap cap 15. | `b_the_great_bellows` The Great Bellows (`d04_bellows_keep` boss 2) |
| `uq_mothwing_gloves` | Mothwing Gloves | hands | Patchwork Drone moves with its ally at double speed and heals +20%. | `b_wyllow_blighted_heart` Wyllow, the Blighted Heart (`d07_thornheart` end boss) |

### Souls
A soul goes in a **Soul** socket (page 08) and adds a behaviour. Both need the wearer to be a **tinker**.
(Not to be confused with the **Gadget** socketables Engineers craft — a tinker can wear those too.)

| id | Name | Socket | Requirement | Effect | Source |
|---|---|---|---|---|---|
| `soul_spare_parts` | Soul of Spare Parts | weapon | class: tinker | When a Device is destroyed by an enemy (not by expiring), it leaves a **spare-parts pile** for 6 s: picking it up (walk over it) gives 2 Scrap and rebuilds the same Device at 50% of its lifetime for free (once per Device kind per 20 s). | `b_the_unmined` The Unmined (`d03_shaft_seven` secret boss) on Challenge, 3%; end chest at **Depth 10+**, 1% |
| `soul_field_surgeon` | Soul of the Field Surgeon | armour — chest | class: tinker | In the **Medic Kit**, a Stitch Rivet that crits on an ally also sticks a small Patchwork Drone on them for 4 s (3% max health per second; does not use a charge or the cap). Once per 6 s. (`tag_heal` `tag_minion`) | the world boss of `sunscar` (`b_glass_wyrm`, page 13), 2%; end chest at **Depth 15+**, 1% |

---

## 10. Voice and barks

- Timbre: `voiceFor({ role: 'support', gender, seed })`, quick, a mild tic (a clicking tongue "tk" before lines — Lingo verbal tic). `(reuse: shared/voices.js, lingo tics)`

| Event | Lines |
|---|---|
| Place Device | "Tk — set." · "Don't touch that." · "Wind it and walk away." |
| Overclock | "Past the red line!" · "Let's see if it holds." |
| Overload | "…Well, it held for a bit." |
| Walker | "Stand back, she's big." · "Climbing in!" |
| Stitch Rivet (ally) | "Hold still, this'll sting." · "Patched!" |
| Scrap pickup | "Ooh, that's useful." |
| Crit | "Precision engineering." |
| Low health | "My warranty's expiring — heal!" · "Patch me up!" |
| Out of Tempo | "Need a second to recalibrate." |

---

## 11. Reuse notes

| Wildmarch piece | Borrowed from | Notes |
|---|---|---|
| Cog Sentry | Farhold pet `clockwork_sentry` (`js/pets.js`) + `deploy_sentry` summon | now a timed Device |
| Mines | Farhold `pinning_shot` root status visuals; spellfx physical impact | new mesh (brass disc) |
| Battery aura | Farhold `quicken` haste status + spellfx lightning ground disc | now a placed aura |
| Drone | spellfx holy_mote (brass tint) | new mesh |
| Iron Walker | `avatar-3d/js/vehicles.js` parts + Chibi 2 scaled rig | new model; the heaviest art task of the six |
| Guns | `(new)` — Farhold has no gun base; a gun uses the crossbow pattern (page 08 owns the base) | |
| Outfit | `class-outfits.json` `tinker` (only `top` exists) — **complete it** from Farhold `tinker.look` (goggles_up, pocketwatch, gear_pack) | See QUESTIONS.md G4 |
| Talent engine | `prototypes/farhold/js/skilltalents.js` | Wildmarch tier levels |
| Emberveil 2 prototype ideas | `tinker_bolt`, `tinker_grenade`, `tinker_quick_fix`, `tinker_overcharge` | reborn as Rivet Shot, Springtrap Mine, Patchwork Drone, Aether Battery |
