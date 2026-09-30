# Warlock (`warlock`)

> *"Everything costs something. I simply read the price out loud."*

**Page owner:** `06-CLASSES.md` + this file. **Status:** v0.1 draft, 2026-09-29. Canon: [page 00](../00-OVERVIEW.md) §6 row 10.
Formulas: [page 05](../05-COMBAT.md). Boss vocabulary: [page 11](../11-BOSS-MECHANICS.md).

### Units used on this page

| Term | Meaning |
|---|---|
| **% spell damage** | share of (weapon damage × (1 + spell power)), applied once (reuse: `prototypes/farhold/js/rpg.js` `strike`) |
| **DoT** | "damage over time": a status that deals damage every second for its duration |
| **Mana cost** | share of maximum mana. **Health cost** is a share of maximum health unless it says "current" |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A scholar who signed something they should not have. Their curses spread from body to body, and when they need more power they pay for it in their own blood |
| Role | **Damage** (damage over time, spreading) |
| Armour | cloth |
| Weapons | **staff** or **wand** + a **focus** off hand (Grimoire or Effigy, reuse: `prototypes/farhold/js/foci.js`) |
| Resource | **Mana** + **Soul Shards** (0–5) + **health** (the pact) |
| Companion | a **bound imp** (from calling 1) |
| Playstyle | Brand everything, let the brand jump from the dead to the living, and collect a shard each time something dies to it. Spend shards on one huge beam that cashes in every curse at once. When the fight needs more, pay health for twice the curse speed — and keep a gate behind you to step back through when the floor turns purple |

**Hook carried from Emberveil** (reuse: `prototypes/emberveil/data/classes.json` `warlock`): *Corruption
spreads on enemy death; Soul Pact doubles all DoT at the cost of own HP; recasting Corruption detonates the
rest of the DoT.* Here: **Hex Brand** (spreads on death), **Soul Pact** (pay health, DoTs tick double) and
**Harrowing** (cashes in every DoT instantly).

---

## 2. Class mechanic — Soul Shards and the Pact (new)

### 2.1 Soul Shards

1. **0–5 shards**, kept between fights (they do not fade), lost on death.
2. **+1 shard** when an enemy **dies carrying any of your DoTs** (Hex Brand, Hellburn, Soul Leech's channel).
   Max one per 1.0 s.
3. **Bosses:** +1 shard each time a boss carrying your Hex Brand loses **another 10%** of its health.
4. Spent by: `warlock_hellbloom` (1, automatic), `warlock_soul_pact` (3, instead of health), `warlock_void_gate`
   (1, to open it to the party), `warlock_harrowing` (all).

### 2.2 The Pact — Blood Price and Tithe (calling 2)

1. **Blood Price:** when you do not have the mana for a spell, it is cast anyway and costs **1.5% max health
   per 1% mana** missing. You cannot kill yourself this way (it refuses below 10% health, with the Farhold
   refusal line "Not enough blood left to pay").
2. **Tithe (0–50):** every point of health paid (Soul Pact, Blood Price, talents) is banked as Tithe, one point
   per 1% max health. **Harrowing consumes the Tithe**: +2% damage per point (50 Tithe = +100%).
3. Tithe **drains 2 points a second** out of combat.

### 2.3 Gauge UI

| Element | Where | What it shows |
|---|---|---|
| **Shard row** | above the mana bar | 5 violet crystal icons that fill; a new shard flies from the dead enemy to the row (spellfx `projectile` `shadow` ribbon, 0.4 s) |
| **Tithe line** | inside the health bar | a dark red band from the right end showing banked Tithe; a small number at 10/20/30/40/50 |
| **Blood price preview** | health bar | when the next spell would cost health, the price shows as a flashing slice |
| **Brand tracker** | target frame and nameplates | a small brand glyph with the remaining seconds on every enemy you have branded |
| **Crowned** (calling 3) | shard row | the row gets a thin gold crown frame |

### 2.4 The bound imp (companion, calling 1 — reuse: `prototypes/farhold/js/pets.js` `bound_imp`)

| Stat | Value |
|---|---|
| Health | 30% of the warlock's max health; flies at 2 m |
| Attack | **Cinder Spit**: 25 m, **40% spell damage** (fire) every 2.0 s |
| Special | every 4th spit applies **Kindled** (a 4 s burn, 10% spell damage a second) — counts as *your* DoT for shards |
| Death | re-bound after **30 s** automatically, or at once out of combat |
| AI | Farhold's follow / engage / return; hovers 3 m behind the warlock's shoulder |
| Telegraphs | danger zones: leaves after **0.6 s**; void zones: leaves after **0.5 s**; never counts toward soaks; takes 25% from room-wide attacks (same rule as every pet, see [necromancer §2.3](necromancer.md)) |

**Imp commands** ([page 02](../02-CONTROLS.md)): **tap `Q`** (`classKey`) = **Attack**; **hold `Q`** = the command
ring (all four); **`G`** (`classKey2`) = **Snuff** (the interrupt needs its own key). No `Ctrl` keys (browsers
steal Ctrl+digit). The imp's frame sits in page 03's pet/companion gauge.

| Key | Command | Effect |
|---|---|---|
| Q tap / ring | **Attack** | the imp attacks your target |
| ring | **Heel / Stay** (toggle) | follow you, or hold its current spot |
| G / ring | **Snuff** (cooldown 20 s) | the imp spits a clot of ash: **interrupts** the target's gold-bordered cast |
| ring | **Devour** (cooldown 60 s) | you eat the imp: heal **15% max health** and your next Hex Brand **spreads to 2 extra** enemies on cast. The imp returns in 30 s |

### 2.5 Calling quests (ids proposed; page 14 owns content)

| Level | Quest id | Name | What it grants |
|---|---|---|---|
| 6 | `q_warlock_calling_1` | **The Small Print** — a Mossfen hermit's contract with a marsh-imp, which you buy and re-sign | **Soul Shards** and the **bound imp** + pet bar |
| 20 | `q_warlock_calling_2` | **Paid in Full** — pay three debts in blood at three shrines across Sunscar | **Blood Price** and **Tithe** |
| 40 | `q_warlock_calling_3` | **The Covenant of Ash** — renegotiate the pact with its author inside a Riftmarch tear | **Crowned**: killing an enemy with a DoT while at **5 shards** crowns you for **10 s** — every DoT you apply also lands on the nearest un-branded enemy within 10 m |

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Range | Shape | Main effect |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `warlock_hex_brand` | Hex Brand | 3% mana | — | instant | 35 m | target | 20% + 150% over 12 s; spreads on death |
| 2 | 4 | `warlock_soul_leech` | Soul Leech | 4% mana | 6 s | channel 3 s | 25 m | beam (target) | 6 × 40%, heals 50% of damage |
| 3 | 10 | `warlock_hellbloom` | Hellbloom | 6% mana (+1 shard auto) | 10 s | 1.5 s | 35 m | ground circle 6 m | 160%, Hellburn; +50% and brands with a shard |
| 4 | 18 | `warlock_soul_pact` | Soul Pact | 20% **current health** (or 3 shards) | 60 s | instant | self | self | DoTs tick ×2 and +30% for 12 s |
| 5 | 28 | `warlock_void_gate` | Void Gate | 5% mana (+1 shard for party) | 30 s | instant | 60 m return | self / gate | plant a gate, press again to return |
| 6 | 40 | `warlock_harrowing` | Harrowing | 10% mana + all shards | 30 s | 1.5 s | 30 m | beam 3 m wide | 120% +100%/shard; detonates your DoTs |

### 3.2 Spell details

#### `warlock_hex_brand` — Hex Brand (slot 1, level 1)

| Field | Value |
|---|---|
| Cost / cooldown | 3% mana · none (GCD) |
| Cast | instant, usable while moving |
| Range / shape | one enemy in 35 m |
| Effect | **20% spell damage** (shadow) on hit, then **150% over 12 s** (12.5% a second) |
| Spread | when the target **dies**, the brand jumps to **2 enemies within 10 m** at full duration |
| Refresh | recasting on a branded target refreshes it and keeps up to 3.6 s of what was left (30%) |
| Statuses | `curse` (spellfx) shown as a glowing sigil over the head |
| Visuals | spellfx `projectile` element `shadow` shape `ribbon`, then a `decal` glyph floating over the target; spread: a ribbon leaps from the body to each new target |
| Sound | a hiss-and-sizzle brand `warlock.brand` + `status.curse.apply` |

#### `warlock_soul_leech` — Soul Leech (slot 2, level 4)

| Field | Value |
|---|---|
| Cost / cooldown | 4% mana · 6 s |
| Cast | **channel 3.0 s**, 6 ticks; can move at 40% |
| Range / shape | a beam to one enemy in 25 m; breaks past 30 m or out of sight |
| Effect | **40% spell damage** (shadow) per tick; **heals the warlock for 50%** of damage dealt |
| Mechanic | counts as your DoT while channelling (a kill gives a shard) |
| Visuals | spellfx `arc` lines in violet from target to hands (width 0.06, jitter 0.2), red motes (`drop` sprites) drifting back along it |
| Sound | a thin draining whine `warlock.leech` (loop) |

#### `warlock_hellbloom` — Hellbloom (slot 3, level 10)

| Field | Value |
|---|---|
| Cost / cooldown | 6% mana · 10 s; **spends 1 shard automatically** if you have one |
| Cast | 1.5 s |
| Range / shape | ground circle **6 m** at up to 35 m |
| Effect | **160% spell damage** as **hellfire** (fire element, shadow colour; **ignores fire resistance**) |
| Statuses | **Hellburn 6 s** (15% a second, counts as your DoT) |
| With a shard | **+50% damage** and **every enemy hit gets Hex Brand** |
| Visuals | spellfx `aoe` element `fire` recoloured `#8a3ac0` / accent `#ff7a1a` (violet flames with orange cores); ground `decal` scorch 10 s |
| Sound | `spell.fire.impact` + a choir-like howl `warlock.hellbloom` |

#### `warlock_soul_pact` — Soul Pact (slot 4, level 18)

| Field | Value |
|---|---|
| Cost / cooldown | **20% of current health** (or **3 shards** if you hold 3+) · 60 s |
| Cast | instant |
| Range / shape | self |
| Effect | for **12 s** every DoT you own **ticks twice as fast** and deals **+30%**; a critical DoT tick **spreads Hex Brand** to one enemy within 8 m |
| Tithe | health paid is banked as Tithe (calling 2) |
| Statuses | new self-status `pact` (spellfx `enchant` aura recoloured blood red) |
| Visuals | spellfx `pillar` element `shadow` radius 1.2 on self, blood-red `drop` sprites falling up |
| Sound | a heartbeat that doubles in speed `warlock.pact` for the 12 s |

#### `warlock_void_gate` — Void Gate (slot 5, level 28)

| Field | Value |
|---|---|
| Cost / cooldown | 5% mana · 30 s (starts when the gate is used or expires) |
| Cast | instant, twice: **first press plants the gate** at your feet (lasts **20 s**); **second press returns** you to it from up to **60 m**, and removes one slow or root |
| Party gate | if you hold a shard when planting, it spends **1 shard** and opens the gate to the party: every party member gets a HUD prompt **"Take the gate"** (interact key) for the 20 s and is pulled back to it the same way (one use each) |
| Visuals | a 1.5 m black-violet ring standing upright (spellfx `vortex` element `shadow` radius 1.2, vertical, 20 s); the return is a `beam` flash at both ends |
| Sound | `ambience.void` short loop at the gate; return `warlock.gate` whoosh |

#### `warlock_harrowing` — Harrowing (slot 6, level 40)

| Field | Value |
|---|---|
| Cost / cooldown | 10% mana + **all shards** (needs at least 1) · 30 s |
| Cast | 1.5 s |
| Range / shape | beam **30 m long, 3 m wide**, straight ahead |
| Effect | **120% spell damage + 100% per shard** (5 shards: 620%) to everything on the line. Every DoT you have on each target hit is **detonated**: its remaining damage lands **at once**, then **Hex Brand is re-applied fresh** |
| Tithe | consumes all Tithe: **+2% per point** |
| Visuals | screaming souls: spellfx `breath` element `shadow` length 30 arc 0.1 (a straight stream) with `wisp` and `shadow_claw` sprites; each detonation is an `impact` shadow at 1.4 scale |
| Sound | a rising wail `warlock.harrow` + `spell.shadow.impact` per detonation |

### 3.3 Rotation / how it plays

* **Solo:** Brand the pack's first target, the imp spits, Leech whoever reaches you (heals you). Kill the
  branded one first — the brand jumps. Hellbloom with a shard brands a whole pack at once. When the imp
  is dying, Devour it for a heal.
* **Dungeon (5):** pull: Hellbloom (with shard) the pack → Soul Pact → they melt, shards pour in. Bosses:
  keep Brand up, Leech between moves, Harrowing at 5 shards. Plant a Void Gate at the safe spot **before**
  a known void-zone phase and return when the floor fills.
* **Raid:** the warlock's damage is back-loaded: most damage lands as DoTs, then Harrowing cashes out.
  On bosses with add waves, the brand spreads through adds and pays shards. A party gate (1 shard) moves
  your whole group back across the room in one press — raid leaders should know who has one.

### 3.4 Boss mechanics

| Mechanic | Warlock answer |
|---|---|
| **Soak** | the warlock can soak; Soul Leech heals while standing still. Avoid soaking with a paid Pact (health is low) |
| **Void / danger zones** | **Void Gate** — plant, walk into the mechanic's space, press to return 60 m; the party gate moves up to 4 allies too |
| **Immunity** | talent `warlock_void_gate_t4a` *Between*: **1.0 s untargetable** during the return |
| **Interrupt** | imp **Snuff** (20 s) |
| **Adds** | brand spread; Hellbloom brands packs |
| **Healing checks** | Blood Price / Pact make the warlock low on health on purpose — healers should know. Soul Leech heals 50% of its damage |
| **Tether** | nothing special |

---

## 4. Alternate spells

None; the imp's commands live on the pet bar (§2.4).

---

## 5. Talents

Tiers open at **12 / 22 / 32 / 45** (earlier tiers open on learning a later spell).

### `warlock_hex_brand`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `warlock_hex_brand_t1a` | Twin Hex | brands **2 targets** at once (the target and the nearest enemy in 10 m) |
| 1 | `warlock_hex_brand_t1b` | Deep Brand | lasts **18 s**, same total per second (225% total) |
| 2 | `warlock_hex_brand_t2a` | Contagion | spreads to **3** on death, 12 m |
| 2 | `warlock_hex_brand_t2b` | Wasting Brand | branded enemies **move 20% slower** |
| 2 | `warlock_hex_brand_t2c` | Brand of Doubt | branded enemies **deal 8% less damage** to you and your imp |
| 3 | `warlock_hex_brand_t3a` | Harvest Mark | when a branded enemy dies, **+1 extra shard** 25% of the time |
| 3 | `warlock_hex_brand_t3b` | Brand Echo | when the brand expires naturally it **deals 60%** at once |
| 4 | `warlock_hex_brand_t4a` | Pandemic Script | the brand **spreads every 6 s** to one un-branded enemy in 6 m even while the target lives |
| 4 | `warlock_hex_brand_t4b` | Soul Sigil | branded enemies **give 5% of their max health as healing** to you when they die |

### `warlock_soul_leech`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `warlock_soul_leech_t1a` | Split Leech | beams to **2 targets**, 25% per tick each |
| 1 | `warlock_soul_leech_t1b` | Heart Leech | **4 ticks in 2 s**, 55% each |
| 2 | `warlock_soul_leech_t2a` | Transfusion | aim at an **ally**: the beam **gives** them your health (4% max health a tick) — a heal paid in blood (banks Tithe) |
| 2 | `warlock_soul_leech_t2b` | Siphon Mind | also drains **2% mana** a tick |
| 3 | `warlock_soul_leech_t3a` | Last Drop | if the target dies during the channel, **the channel jumps** to the nearest enemy in 10 m |
| 3 | `warlock_soul_leech_t3b` | Brand Feeder | each tick on a branded target **adds 1 s** to its brand |
| 4 | `warlock_soul_leech_t4a` | Overflow | healing over full health becomes a **barrier** (max 20% max health) |
| 4 | `warlock_soul_leech_t4b` | Soul Tap | channel **completes** = +1 shard (not only on a kill) |

### `warlock_hellbloom`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `warlock_hellbloom_t1a` | Hellrain | **three 4 m circles** in a line away from you, 100% each |
| 1 | `warlock_hellbloom_t1b` | Frugal Fire | **never spends a shard**; always brands on hit for 3% more mana |
| 2 | `warlock_hellbloom_t2a` | Pit of Flame | the ground **burns 6 s** (enemy void zone: 25% a second) |
| 2 | `warlock_hellbloom_t2b` | Fear of Fire | non-elites hit **flee for 3 s** (fear) |
| 3 | `warlock_hellbloom_t3a` | Kindling Imp | your imp **copies** Hellbloom at 50% on its target |
| 3 | `warlock_hellbloom_t3b` | Soulfire | killing blows from Hellburn **return the shard** spent |
| 4 | `warlock_hellbloom_t4a` | Instant Inferno | Hellbloom is **instant** while Soul Pact is up |
| 4 | `warlock_hellbloom_t4b` | Twofold Rite | **2 charges** |

### `warlock_soul_pact`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `warlock_soul_pact_t1a` | Blood Only | always pays **health** (never shards); cost 15% current health |
| 1 | `warlock_soul_pact_t1b` | Shard Only | always pays **3 shards**; cooldown 45 s |
| 2 | `warlock_soul_pact_t2a` | Shared Pact | the **imp and 2 nearest allies** get +15% damage for the duration |
| 2 | `warlock_soul_pact_t2b` | Terms Extended | lasts **18 s** |
| 3 | `warlock_soul_pact_t3a` | Paid Back | when it ends, you are **healed for 50% of the health paid** |
| 3 | `warlock_soul_pact_t3b` | Brand Frenzy | during the Pact Hex Brand is **instant and 0 mana** |
| 4 | `warlock_soul_pact_t4a` | Debt Collector | enemies that die during the Pact give **2 shards** |
| 4 | `warlock_soul_pact_t4b` | Final Clause | if you would die during the Pact, you **survive at 1 health** and the Pact ends (once per 3 min) |

### `warlock_void_gate`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `warlock_void_gate_t1a` | Twin Gates | plant **two gates**; the second press jumps to the **nearer** one |
| 1 | `warlock_void_gate_t1b` | Long Anchor | gate lasts **40 s**, 90 m reach |
| 2 | `warlock_void_gate_t2a` | Open Door | the party gate costs **no shard** |
| 2 | `warlock_void_gate_t2b` | Void Wake | where you left from **bursts** for 150% in 5 m |
| 3 | `warlock_void_gate_t3a` | Gate Hunger | enemies within 4 m of the gate take 20% a second |
| 3 | `warlock_void_gate_t3b` | Throw the Imp | the imp can be sent through: the ring's **Heel / Stay** aimed at the gate swaps the imp to it (it taunts non-elites 3 s) |
| 4 | `warlock_void_gate_t4a` | Between | **1.0 s untargetable** during the return |
| 4 | `warlock_void_gate_t4b` | Recall Brands | returning **re-applies Hex Brand** to every enemy within 10 m of where you left |

### `warlock_harrowing`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `warlock_harrowing_t1a` | Harrowing Ring | a **10 m ring** round you instead of a line |
| 1 | `warlock_harrowing_t1b` | Needle | beam **1 m wide**, **+40%** |
| 2 | `warlock_harrowing_t2a` | Aftertaste | detonated DoTs **re-apply at 50%** instead of only the brand |
| 2 | `warlock_harrowing_t2b` | Souls Returned | each enemy killed by it **refunds 1 shard** (max 3) |
| 3 | `warlock_harrowing_t3a` | Blood Harrow | may be cast with **0 shards** by paying 8% max health per missing shard (max 5) |
| 3 | `warlock_harrowing_t3b` | Harrowed Ground | leaves a **30 m void line** for 5 s (enemies only, 30% a second) |
| 4 | `warlock_harrowing_t4a` | Final Accounting | at 5 shards and 50 Tithe the beam **also hits behind you** |
| 4 | `warlock_harrowing_t4b` | The Long Scream | becomes a **2 s channel** sweeping with your aim, same total damage |

---

## 6. Class sets

### `set_warlock_debtors_raiment` — The Debtor's Raiment (level 36, levelling)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Hex Brand **spreads on death to +1** | `warlock_hex_brand` |
| 4 | Soul Leech **heals 75%** of damage | `warlock_soul_leech` |
| 6 | Soul Pact's health cost **also counts double for Tithe** | `warlock_soul_pact` |

Drop: `d10_rimefang_caverns` bosses (Normal/Heroic); gloves from the `frostmantle` world boss.

### `set_warlock_ashen_covenant` — Vestments of the Ashen Covenant (level 60, raid)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Hellbloom with a shard **leaves a 6 m pit** for 6 s (30% a second) | `warlock_hellbloom` |
| 4 | Harrowing at **5 shards** resets Soul Pact's cooldown | `warlock_harrowing`, `warlock_soul_pact` |
| 6 | during Soul Pact, Harrowing costs **no shards** once | `warlock_harrowing` |

Drop: `r04_ember_court` bosses (tokens), Normal/Mythic.

### `set_warlock_gatekeeper` — The Gatekeeper's Garb (level 60, Mythic+)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Void Gate cooldown **30 → 20 s** | `warlock_void_gate` |
| 4 | taking the gate (you or an ally) gives **a 15% max health barrier** for 6 s | `warlock_void_gate` |
| 6 | returning through the gate **refunds 1 shard** | `warlock_void_gate` |

Drop: Mythic+ end chest key 8+.

---

## 7. Class legendaries and uniques

### Legendaries

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `leg_the_first_contract` | **The First Contract** | off hand (Grimoire) | *Binding Terms*: max shards **7**; Harrowing's per-shard bonus is **+120%** | secret boss of `r05_veilspire`, 8% |
| `leg_vesna_duskwells_quill` | **Vesna Duskwell's Quill** | wand | *Signed in Red*: Blood Price costs **1% max health per 1% mana** and Tithe caps at **80** | `riftmarch` world boss, 4% |
| `leg_crown_of_the_hollow_host` | **Crown of the Hollow Host** | head | *Hollow Host*: Crowned (calling 3) lasts **20 s** and each DoT you apply spreads to **2** | final boss of `r04_ember_court` Mythic, 6% |
| `leg_imp_in_a_bottle` | **The Imp in a Bottle** | amulet | *Two Heads*: you have **two imps**; Devour eats one and keeps the other | `d09_warmasters_pit` Mythic+ key 10+ final boss, 2% |
| `leg_gate_of_the_nine_doors` | **Gate of the Nine Doors** | feet | *Nine Doors*: Void Gate has **no cooldown** while a gate stands; you may keep **3 gates** | `r03_sunken_choir` boss 6, 5% |

### Uniques

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `uq_marsh_hermits_contract` | **Marsh-Hermit's Contract** | off hand | the imp's Kindled applies on **every 2nd** spit | `d02_drowned_mill` final boss `b_the_grindwheel`, 10% |
| `uq_branding_iron_of_tamar` | **Branding Iron of Tamar** | staff | Hex Brand's hit is **+200%** (the first 20% becomes 60%) | `d06_sandsworn_vault` boss 2, 7% |
| `uq_leechbone_ring` | **Leechbone Ring** | ring | Soul Leech **can be cast while moving at full speed** | `d07_thornheart` final boss, 7% |
| `uq_ashen_ledger_page` | **Ashen Ledger Page** | amulet | the first Harrowing after a Void Gate return costs **no shards** | `cinder_steppe` rare elites, 3% |

---

## 8. Voice and barks

Voice: **new row `warlock`** proposed for `shared/voices.js` — `pitch 0.44, depth 0.58, tone 0.48,
breath 0.35, rough 0.12, speed 0.46, jitter 0.1` (low, smooth). Lingo tag `class:warlock`. The imp only
chitters (no speech).

| When | Lines |
|---|---|
| Brand | "Marked and owed." · "Sign here." |
| Spread | "Pass it along." |
| Pact | "Take it. I'll take more." · "Blood for speed. A fair trade." |
| Harrowing | "All debts come due." · "Pay up." |
| Crit | "Interest." |
| Low health | "The price is getting steep!" · "I can't pay for much more of this!" |
| Gate return | "I was never here." |

---

## 9. Reuse notes

| Borrowed | From | Used for |
|---|---|---|
| Pet | `prototypes/farhold/js/pets.js` `bound_imp` (42 hp, 7–12 shadow at 24 m in Farhold), AI states | the imp, re-costed as % of owner |
| Look | `avatar-3d/data/class-outfits.json` `warlock` (hood, robe, cape, rune bracers) | default look |
| Visual only | Farhold `curse`, `drain`, `void_rift`, `bind_imp` | Brand, Leech, Gate, imp summon |
| Legendary effect engine | `prototypes/farhold/data/uniques.json` `curse_spreads`, `rot_spread`, `blood_price` | the plumbing for spread-on-death and health-cost powers (numbers new) |
| Dropped | Farhold warlock kit (shadow_lance, bind_imp, curse, drain, void_rift, meteor); Farhold's second pet `ember_familiar` (the Pyromancer keeps it) | — |
