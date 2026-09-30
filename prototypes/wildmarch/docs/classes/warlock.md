# Warlock (`warlock`)

> *"Everything costs something. I simply read the price out loud."*

**Page owner:** `06-CLASSES.md` + this file. **Status:** v0.2 draft — 2026-09-30 (round 2 applied). Canon: [page 00](../00-OVERVIEW.md) §6 row 10.
Formulas, threat and tags: [page 05](../05-COMBAT.md). Boss vocabulary: [page 11](../11-BOSS-MECHANICS.md). Demons: [page 10](../10-BESTIARY.md).

### Units used on this page

| Term | Meaning |
|---|---|
| **% spell damage** | share of (weapon damage × (1 + spell power)), applied once (reuse: `prototypes/farhold/js/rpg.js` `strike`) |
| **DoT** | "damage over time": a status that deals damage every second for its duration |
| **Mana** | page 06 §4.1: a pool of **1,000** + 2 per INT + gear. Costs are **flat** ("35 mana"). In-combat regen 1% of max a second |
| **Health cost** | a share of **maximum** health unless it says "current" |
| **Tithe** | the warlock's second resource: 0–5 pips, **bought with your own health** (§2.1) |
| **Guardian state** | a tank state that multiplies all threat by **×4** (page 05 §13.2). The warlock's is **Iron Covenant** (§5) |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A scholar who signed something they should not have. Their Blight spreads from body to body; when they need more power they pay for it in their own blood; and the demons they beat, they keep |
| Primary role | **Damage** (damage over time that spreads) |
| Hybrid role | **Tank** — **Iron Covenant**: blood pacts that turn health paid into armour and wards (§5) |
| Build | caster |
| Armour | cloth |
| Weapons | **staff** or **wand** + a **focus** off hand (Grimoire or Effigy, reuse: `prototypes/farhold/js/foci.js`) |
| Resource | **Mana** + **Tithes** (paid in health) |
| Companion | **no summoned pet.** A demon the warlock has **beaten and bound** (§2.3) — permanent, revived by an out-of-combat ritual |
| Playstyle | Blight everything and let it jump from the dead to the living. Pay health for Tithes when you want power now, collect them free when Blighted enemies die, and spend them on one huge beam that cashes in every curse at once. Beside you walks whatever demon you last broke to your will |

**Hook carried from Emberveil** (reuse: `prototypes/emberveil/data/classes.json` `warlock`): *the curse
spreads on enemy death; Soul Pact doubles all DoT at the cost of own HP; recasting detonates the rest of the
DoT.* Here: **Blight** (spreads on death), **Blood Pact** (pay health, DoTs tick double) and **Harrowing**
(cashes in every DoT at once).

---

## 2. Class mechanic — Tithes and Bind Demon (new)

### 2.1 Tithes

1. **0–5 Tithes.** Kept for **20 s** after combat, then one drains away every 5 s. Lost on death.
2. **Pay Tithe** — class key **`G`** ([page 02](../02-CONTROLS.md) `classKey2`): pay **8% of max health** for **+1
   Tithe**. Instant, off the GCD, 1 s cooldown. Refuses below 15% health ("Not enough blood left to pay").
3. **Free Tithes:** **+1** when an enemy **dies carrying your Blight** (max one per second), and **+1** each time a
   Blighted **boss** loses another 10% of its health.
4. **Spent by:** `warlock_brimstone` (1, automatic if held), `warlock_blood_pact` (3, instead of health),
   `warlock_void_gate` (1, to open it to the party), `warlock_harrowing` (all).
5. **Blood Price** (calling 2): when you lack the mana for a spell, it is cast anyway and costs **1.5% of max
   health per 10 mana missing**. It refuses below 10% health.

### 2.2 Gauge UI

| Element | Where | What it shows |
|---|---|---|
| **Tithe row** | above the mana bar | 5 blood-red drop icons that fill; a paid Tithe drips from your health bar into the row, a free one flies from the dying enemy (spellfx `projectile` `shadow` ribbon, 0.4 s) |
| **Price preview** | health bar | holding `G` or hovering a spell that would cost health shows the price as a flashing slice |
| **Blight tracker** | target frame and nameplates | a small rot glyph with the remaining seconds on every enemy you have Blighted |
| **Bound demon** | page 03 pet/companion gauge | the demon's portrait, health, special cooldown, and a skull if it has fallen ("Rite of Recall needed") |
| **Iron Covenant** | Tithe row | the drops turn to iron-grey plates while the tank state is on; the armour and reduction the held Tithes give ("+30% armour, −9%") |
| **Crowned** (calling 3) | Tithe row | a thin gold crown frame |

### 2.3 Bind Demon

`warlock_bind_demon` is a class ability (no slot) that unlocks at **calling 1** (level 6). It is how a warlock
gets a companion: **you beat a demon, then you bind it**.

| Rule | Value |
|---|---|
| What can be bound | a monster with the page 10 tag **Demon**. **Not** bosses, world bosses, named story demons, or anything tagged `command` |
| Rank | calling 1: normal monsters · calling 2: also **champions** and **rares** · calling 3: also **elites** and **greater-rarity** demons (Giant, Flaming…) |
| Level | up to your level + 2 |
| You must have beaten it | you dealt at least **10%** of its health. When it would die, if your Bind Demon is ready it **kneels Broken for 8 s** instead (untargetable by allies, cannot act). If nobody binds it in the 8 s, it dies normally |
| Binding | cast **Bind Demon** on it: **Needs target**, **3 s channel**, 60 mana, 60 s cooldown. Taking a single hit over 20% of max health breaks the channel (the demon then dies normally) |
| Loot and XP | the demon still pays its loot and experience as if killed |
| Pact Book | bound demons are kept in the **Pact Book** (a Spellbook tab, `scr_sheet_spells` → "Pact Book"; page 03 to add): **1 / 2 / 3 pages** at callings 1 / 2 / 3. Binding with a full book asks which page to overwrite |
| Out at once | **one** bound demon. Swap with the utility `warlock_call_bound` (§6), out of combat |
| Permanent | it stays until you **release** it from the Pact Book (out of combat, with a confirm) |
| Falls in a fight | it stays down until you perform the **Rite of Recall** (§6) out of combat. It does **not** get up on its own |
| Party | takes **no party slot**; obeys the pet rules of 00 §10 (danger zone 0.6 s, void zone 0.5 s, no soaks, 25% from room-wide hits) |

**How strong a bound demon is.** It levels with you. Its power is **60% of a same-level normal monster of its
kind**: health **45% of your max health** (brutes 70%), and each attack deals about **35% spell damage** (the
kind's row below). It keeps **one special** from its bestiary row, used on the `Q` ring (§2.4). A bound
**champion or rare** keeps **one** of its monster-rarity affixes at **50%** strength; a bound **greater-rarity**
demon keeps its greater rarity at 50% (a Flaming hound's fire aura, halved). Its damage counts as yours for
Tithes (a kill by it with your Blight on the target pays a Tithe).

**The roster.** Demons live mainly in Kingsfire and the Riftmarch, but the Threadcutter cult's casters call
lesser ones across the whole continent, so a warlock finds something to bind in every band.

| Kind | Bestiary id (page 10) | Where / band | Role | Attack | Special (on the `Q` ring) |
|---|---|---|---|---|---|
| **Bog Imp** | `m_demon_bog_imp` *(new — page 10 to add)* | Mossfen, 6–12; the calling 1 quest's target | caster, 25 m | 40% spell damage (fire) every 2.0 s | **Snuff** — interrupts the target's gold-bordered cast, 20 s |
| **Bound Fiend** | `m_demon_bound_fiend` *(new — page 10 to add)* | appears beside Threadcutter casters anywhere, 10–50 | melee | 35% every 1.6 s | **Gore** — 120% and Bleeding, 12 s |
| **Glass Imp** | `m_demon_glass_imp` *(new — page 10 to add; the `sand` family's imp body)* | Sunscar, 16–24 | caster, 25 m | 40% (fire) every 2.0 s | **Glare** — Blinded 3 s on a non-boss, 25 s |
| **Ash Hound** | `m_demon_ash_hound` *(new — page 10 to add)* | Cinder Steppe, 28–36 | melee, fast | 30% every 1.2 s | **Pounce** — leaps 15 m to your target, Dazed 2 s, 15 s |
| **Phase Hound** | `m_rift_phase_hound` (tagged Demon, page 10) | Riftmarch, 46–51 | melee, teleports | 30% every 1.2 s | **Phase** — teleports behind its target, next bite +100%, 12 s |
| **Rift Horror** | `m_rift_rift_horror` (tagged Demon, page 10) | Riftmarch, 46–52 | brute | 30% every 2.2 s, 3 m cleave | **Loom** — taunts non-boss enemies within 8 m for 4 s, 20 s |
| **Cinder Imp** | `m_kingsfire_cinder_imp` | Kingsfire, 52–56 | caster swarm | 35% (fire) every 1.8 s | **Snuff** (as the Bog Imp) |
| **Brimstone Hound** | `m_demon_brimstone_hound` | Kingsfire, 52–57 | melee | 35% every 1.2 s | **Burning Bite** — 150% + Burning, 12 s |
| **Ashmaw Fiend** | `m_demon_ashmaw` | Kingsfire, 56–60 | brute, 70% of your health | 30% every 2.2 s, 3 m cleave | **Loom** (as the Rift Horror) — the tank's demon |
| **Cinder Wraith** | `m_demon_cinder_wraith` | Kingsfire, 55–60 | debuffer, 20 m | 30% (shadow) every 2.0 s | **Dread** — the target deals −20% damage for 8 s, 20 s |

### 2.4 Demon commands

Keys: **tap `Q`** (`classKey`) = **Attack** (your target); **hold `Q` 0.25 s** = the command ring. No `Ctrl` keys.

| Command | Effect |
|---|---|
| **Attack** (tap / ring) | the demon attacks your target |
| **Heel / Stay** (ring, toggle) | follow you, or hold its current spot |
| **Special** (ring) | uses the demon's special now (its own cooldown) |
| **Stance** (ring, cycles) | Aggressive · Defensive (default) · Passive |

### 2.5 Calling quests (page 14 owns content)

| Level | Quest id | Name | What it grants |
|---|---|---|---|
| 6 | `q_calling_warlock_1` | **The Small Print** — a Mossfen hermit's contract names a bog imp that has been stealing from the stilt villages; beat it and bind it in the peat | **Tithes** (`G`), **Bind Demon**, the **Pact Book** (1 page), the pet bar, the **Rite of Recall** and **Iron Covenant** on `Shift+1` |
| 20 | `q_calling_warlock_2` | **Paid in Full** — pay three debts in blood at three shrines across Sunscar | **Blood Price**; Pact Book **2 pages**; champions and rares can be bound |
| 40 | `q_calling_warlock_3` | **The Covenant of Ash** — renegotiate the pact with its author inside a Riftmarch tear | **Crowned**: killing an enemy with a DoT while at **5 Tithes** crowns you for **10 s** — every DoT you apply also lands on the nearest un-Blighted enemy within 10 m. Pact Book **3 pages**; elites and greater-rarity demons can be bound |

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Targeting | Range | Shape | Tags | Main effect |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `warlock_blight` | Blight | 35 mana | — | instant | Auto-target | 35 m | target | `tag_spell` `tag_shadow` `tag_ranged` `tag_duration` `tag_curse` | 20% + 150% over 12 s; spreads on death |
| 2 | 4 | `warlock_soul_leech` | Soul Leech | 60 mana | 6 s | channel 3 s | Needs target | 25 m | beam | `tag_spell` `tag_shadow` `tag_ranged` `tag_channel` `tag_heal` | 6 × 40%, heals you 50% of damage |
| 3 | 10 | `warlock_brimstone` | Brimstone | 90 mana (+1 Tithe auto) | 10 s | 1.5 s | Ground | 35 m | circle 6 m | `tag_spell` `tag_fire` `tag_shadow` `tag_area` `tag_duration` | 160%, Brimburn; +50% and Blights all with a Tithe |
| 4 | 18 | `warlock_blood_pact` | Blood Pact | 20% **current** health (or 3 Tithes) | 60 s | instant | Self | self | self | `tag_spell` `tag_shadow` `tag_duration` | DoTs tick ×2 and +30% for 12 s |
| 5 | 28 | `warlock_void_gate` | Void Gate | 70 mana (+1 Tithe for the party) | 30 s | instant | Self | 60 m return | gate | `tag_spell` `tag_shadow` `tag_movement` `tag_duration` | plant a gate, press again to return |
| 6 | 40 | `warlock_harrowing` | Harrowing | 150 mana + all Tithes | 30 s | 1.5 s | Auto-target | 30 m | beam 3 m wide | `tag_spell` `tag_shadow` `tag_ranged` `tag_area` | 120% +100% per Tithe; detonates your DoTs |

### 3.2 Spell details

#### `warlock_blight` — Blight (slot 1, level 1)

| Field | Value |
|---|---|
| Cost / cooldown | 35 mana · none (GCD) |
| Cast | instant, usable while moving |
| Targeting | **Auto-target** — your target, or the enemy nearest the aim point within 35 m |
| Range / shape | one enemy |
| Tags | `tag_spell` `tag_shadow` `tag_ranged` `tag_duration` `tag_curse` |
| Effect | **20% spell damage** (shadow) on hit, then **150% over 12 s** (12.5% a second) |
| Spread | when the target **dies**, Blight jumps to **2 enemies within 10 m** at full duration |
| Refresh | recasting on a Blighted target refreshes it and keeps up to 3.6 s of what was left (30%) |
| Statuses | `blight` (class status; a Curse for dispels, page 05 §10.2) — a grey-green rot glyph over the head |
| Visuals | spellfx `projectile` element `shadow` shape `ribbon` recoloured grey-green `#7a8a4a`; spread: a ribbon leaps from the body to each new target |
| Sound | a dry hiss `warlock.blight` + `status.curse.apply` |

#### `warlock_soul_leech` — Soul Leech (slot 2, level 4)

| Field | Value |
|---|---|
| Cost / cooldown | 60 mana · 6 s |
| Cast | **channel 3.0 s**, 6 ticks; can move at 40% |
| Targeting | **Needs target** (enemy); talent *Transfusion* allows an **Ally** |
| Range / shape | a beam to one enemy in 25 m; breaks past 30 m or out of sight |
| Tags | `tag_spell` `tag_shadow` `tag_ranged` `tag_channel` `tag_heal` |
| Effect | **40% spell damage** (shadow) per tick; **heals the warlock for 50%** of damage dealt (100% in Iron Covenant) |
| Mechanic | counts as your DoT while channelling (a kill pays a Tithe) |
| Visuals | spellfx `arc` lines in violet from target to hands (width 0.06, jitter 0.2), red motes (`drop` sprites) drifting back |
| Sound | a thin draining whine `warlock.leech` (loop) |

#### `warlock_brimstone` — Brimstone (slot 3, level 10)

| Field | Value |
|---|---|
| Cost / cooldown | 90 mana · 10 s; **spends 1 Tithe automatically** if you hold one |
| Cast | 1.5 s |
| Targeting | **Ground**, up to 35 m |
| Range / shape | circle **6 m** |
| Tags | `tag_spell` `tag_fire` `tag_shadow` `tag_area` `tag_duration` |
| Effect | **160% spell damage** as **brimstone**: half fire, half shadow (each half checks its own resistance) |
| Statuses | **Brimburn** 6 s (15% a second; counts as your DoT) |
| With a Tithe | **+50% damage** and **every enemy hit gets Blight** |
| Visuals | spellfx `aoe` element `fire` recoloured `#8a3ac0` / accent `#ff7a1a` (violet flames with orange cores); ground `decal` scorch 10 s; a smell-of-sulphur yellow haze `_puff` |
| Sound | `spell.fire.impact` + a grinding rumble `warlock.brimstone` |

#### `warlock_blood_pact` — Blood Pact (slot 4, level 18)

| Field | Value |
|---|---|
| Cost / cooldown | **20% of current health** (or **3 Tithes** if you hold 3+) · 60 s |
| Cast | instant |
| Targeting | **Self** |
| Range / shape | self |
| Tags | `tag_spell` `tag_shadow` `tag_duration` |
| Effect | for **12 s** every DoT you own **ticks twice as fast** and deals **+30%**; a critical DoT tick **spreads Blight** to one enemy within 8 m |
| Statuses | self-status `pact` (spellfx `enchant` aura recoloured blood red) |
| Visuals | spellfx `pillar` element `shadow` radius 1.2 on self, blood-red `drop` sprites falling upward |
| Sound | a heartbeat that doubles in speed `warlock.pact` for the 12 s |

#### `warlock_void_gate` — Void Gate (slot 5, level 28)

| Field | Value |
|---|---|
| Cost / cooldown | 70 mana · 30 s (starts when the gate is used or expires) |
| Cast | instant, twice: **first press plants the gate** at your feet (lasts **20 s**); **second press returns** you to it from up to **60 m** and removes one slow or root |
| Targeting | **Self** |
| Tags | `tag_spell` `tag_shadow` `tag_movement` `tag_duration` |
| Party gate | if you hold a Tithe when planting, it spends **1 Tithe** and opens the gate to the party: every party member gets a HUD prompt **"Take the gate"** (Interact) for the 20 s and is pulled back to it the same way (one use each) |
| Visuals | a 1.5 m black-violet ring standing upright (spellfx `vortex` element `shadow` radius 1.2, vertical, 20 s); the return is a `beam` flash at both ends |
| Sound | `ambience.void` short loop at the gate; return `warlock.gate` whoosh |

#### `warlock_harrowing` — Harrowing (slot 6, level 40)

| Field | Value |
|---|---|
| Cost / cooldown | 150 mana + **all Tithes** (needs at least 1) · 30 s |
| Cast | 1.5 s |
| Targeting | **Auto-target** — aimed at your target, or the enemy nearest the aim point |
| Range / shape | beam **30 m long, 3 m wide** |
| Tags | `tag_spell` `tag_shadow` `tag_ranged` `tag_area` |
| Effect | **120% spell damage + 100% per Tithe** (5 Tithes: 620%) to everything on the line. Every DoT you have on each target hit is **detonated**: its remaining damage lands **at once**, then **Blight is re-applied fresh** |
| Visuals | screaming souls: spellfx `breath` element `shadow` length 30 arc 0.1 with `wisp` and `shadow_claw` sprites; each detonation an `impact` shadow at 1.4 scale |
| Sound | a rising wail `warlock.harrow` + `spell.shadow.impact` per detonation |

### 3.3 How it plays

* **Solo:** Blight the pack's first target; the bound demon engages. Leech whoever reaches you (it heals you).
  Kill the Blighted one first — Blight jumps. Brimstone with a Tithe Blights a whole pack at once. Watch for
  a kneeling demon: bind it if it is better than the one you have.
* **Normal dungeon (Damage):** pull: Brimstone (with a Tithe) the pack → Blood Pact → they melt, Tithes pour in.
  Bosses: keep Blight up, Leech between moves, Harrowing at 5 Tithes; pay Tithes with `G` when the healer has
  room. Plant a Void Gate at the safe spot **before** a known void-zone phase.
* **Challenge and Depth:** most damage lands as DoTs, then Harrowing cashes out. On add waves Blight spreads and
  pays Tithes. A party gate (1 Tithe) moves the whole group back across a room in one press. Tell your healer when
  you pay Tithes — a warlock at 40% health on purpose looks like an emergency.

### 3.4 Boss mechanics

| Mechanic | Warlock answer |
|---|---|
| **Soak** | the warlock can soak; Soul Leech heals while standing still. Avoid soaking right after paying Tithes |
| **Void / danger zones** | **Void Gate** — plant, walk into the mechanic's space, press to return 60 m; the party gate moves up to 4 allies too |
| **Immunity** | talent `warlock_void_gate_t4a` *Between*: **1.0 s untargetable** during the return |
| **Interrupt** | a bound imp's **Snuff** (Bog Imp, Cinder Imp), or talent `warlock_blight_t2c` *Choking Blight* |
| **Adds** | Blight spread; Brimstone Blights packs; a Loom demon taunts adds |
| **Healing checks** | Tithes and Blood Price lower the warlock's health on purpose; Soul Leech heals 50% of its damage |

---

## 4. Alternate spells — Iron Covenant versions

While **Iron Covenant** is on (§5), three spells change. Same keys; the icons gain an iron-grey corner.

| Slot | Normal | In Iron Covenant | Targeting | Tags | Effect |
|---|---|---|---|---|---|
| 1 | Blight | **Grudge Blight** (`warlock_grudge_blight`) | Auto-target | `tag_spell` `tag_shadow` `tag_ranged` `tag_duration` `tag_curse` | as Blight, but the enemy is **Taunted** for 2 s on the first hit (not a real taunt on bosses) and each tick makes **double threat**; spreads as normal (so a whole pack ends up on you) |
| 4 | Blood Pact | **Blood Bulwark** (`warlock_blood_bulwark`) | Self | `tag_spell` `tag_shadow` `tag_shield` `tag_duration` | pay **20% of current health**: gain a **shield of 60% of max health** for 8 s and **+1 Tithe**. Cooldown 60 s. The warlock's big defensive cooldown |
| 5 | Void Gate | **Gate of Grudges** (`warlock_gate_of_grudges`) | Self | `tag_spell` `tag_shadow` `tag_movement` `tag_area` | as Void Gate; returning **taunts every enemy within 8 m of where you arrive** for 3 s (bosses included — a real taunt, page 05 §13.4). No party gate in this version |

---

## 5. The hybrid role — Tank

**Role focus.** The warlock uses the canon **Role focus** switch (00 §6: in the spellbook, out of combat only,
saved per Loadout; available from calling 1, level 6). Setting it to **Hybrid** queues the warlock as **Tank** in
the Dungeon Finder. In the fight the tank state itself is the **Iron Covenant** toggle (§5.1), which carries
the armour, the wards and the three spell changes (§4).

The warlock tanks by **paying**. Every Tithe it buys with health becomes armour while held and a ward the moment
it is bought, and it drinks health back out of whatever it is fighting. It needs a healer who expects its health
bar to move a lot: the danger is not one big hit (the wards catch those) but a long fight where the warlock
cannot afford to pay.

### 5.1 Iron Covenant (the Guardian state)

| Field | Value |
|---|---|
| id / key | `warlock_iron_covenant` · `Shift+1` (form key); unlocks at calling 1 (level 6) |
| Switching | toggle; 1.0 s, off the GCD; at most once every 5 s |
| Threat | **×4** on everything (page 05 §13.2) |
| The price | while on, you **pay 1% of max health a second** (the covenant's upkeep; cannot drop you below 20%) |
| Health and armour | **+20% max health**; cloth armour **×2** |
| **Tithes become armour** | each Tithe **held** gives **+10% armour** and **3% damage reduction** (5 Tithes: +50% armour, 15%) |
| **Blood Ward** | every Tithe **paid** with `G` gives a shield of **150% of the health paid** for 10 s (8% paid → 12% shield). Free Tithes give no ward |
| Soul Leech | heals **100%** of its damage (was 50%) |
| Damage | −25% damage dealt (threat is multiplied after) |
| Spells | three change (§4) |
| Dungeon Finder | a warlock with calling 1 may queue as **Tank** |

**The loop, in numbers.** Pay a Tithe (−8%), get a 12% ward: net +4% effective health and +10% armour while the
Tithe is held. Five paid Tithes cost 40% health and give 60% of wards plus 15% reduction and +50% armour — and a
Harrowing to spend them on. A tank warlock usually holds 3–5 Tithes and spends them only on Harrowing between
big hits.

### 5.2 Holding threat

| Tool | What it does |
|---|---|
| **Provoke** (the shared taunt, level 10, page 07) | single-target taunt |
| **Grudge Blight** | spreads threat over a pack as Blight jumps |
| **Brimstone** | 6 m area damage + Blight on everything with a Tithe |
| **Gate of Grudges** | area taunt on arrival (level 28) |
| A **Loom** demon (Rift Horror, Ashmaw Fiend) | taunts non-boss enemies within 8 m (holds adds off the healer) |

### 5.3 Talents that turn spells into tank versions

Marked **[tank]** in §7:
`warlock_blight_t2c` *Choking Blight* (interrupt) · `warlock_soul_leech_t4a` *Brimming* (overheal → shield) ·
`warlock_blood_pact_t4b` *Final Clause* (cheat death) · `warlock_void_gate_t3a` *Gate Hunger* (an area-threat zone) ·
`warlock_brimstone_t2a` *Pit of Brimstone* (a burning floor that holds packs).

### 5.4 Gear

CON (health — every Tithe costs a share of it, so more health means bigger wards), armour, "+% shield strength",
the tank set `set_warlock_gatekeeper` (§8) and the legendary `leg_the_debt_collar`.

### 5.5 How well it tanks

| Content | Warlock tank vs a primary tank |
|---|---|
| Open world, solo with a Loom demon | ≈ **100%** |
| Normal dungeons | ≈ **90%**; strong on packs (Blight spread) |
| Depth 1–10 | ≈ **85%** |
| Depth 11+ and Challenge | ≈ **70%** — long fights drain the warlock faster than it can buy wards, and a tank swap while the Tithe row is empty is dangerous |

---

## 6. Utility spells

| id | Name | Cost | Cast | Cooldown | Rules |
|---|---|---|---|---|---|
| `warlock_rite_of_recall` | **Rite of Recall** | 80 mana | 6 s channel, out of combat only | none | brings a **fallen bound demon** back at **100%** health beside you. A chalk circle and four candles on the ground (spellfx `decal`, `glyph_c`); any damage cancels it. This is the **only** way a fallen bound demon returns (it never gets up on its own) |
| `warlock_call_bound` | **Call the Bound** | none | 3 s, out of combat only | none | sends the current demon back into the Pact Book and calls another page's demon out. A fallen demon cannot be called — recall it first |
| `warlock_release_bound` | **Release** | none | instant (confirm dialog), out of combat, from the Pact Book tab | none | frees a bound demon for good; the page becomes empty |

Tags: all three `tag_spell` `tag_shadow` `tag_minion`. Targeting: **Self**. Travel: scrolls and the Recall Stone ([page 20](../20-TRAVEL.md)).

---

## 7. Talents

Tiers open at **12 / 22 / 32 / 45** (earlier tiers open on learning a later spell). **[tank]** marks a choice
written for Iron Covenant.

### `warlock_blight`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `warlock_blight_t1a` | Twin Blight | Blights **2 targets** at once (the target and the nearest enemy in 10 m) |
| 1 | `warlock_blight_t1b` | Deep Blight | lasts **18 s**, same damage a second (225% total) |
| 2 | `warlock_blight_t2a` | Contagion | spreads to **3** on death, 12 m |
| 2 | `warlock_blight_t2b` | Wasting Blight | Blighted enemies **move 20% slower** |
| 2 | `warlock_blight_t2c` | Choking Blight **[tank]** | the first hit **interrupts** a gold-bordered cast (15 s internal cooldown) |
| 3 | `warlock_blight_t3a` | Harvest Mark | when a Blighted enemy dies, **+1 extra Tithe** 25% of the time |
| 3 | `warlock_blight_t3b` | Blight Echo | when Blight expires naturally it **deals 60%** at once |
| 4 | `warlock_blight_t4a` | Pandemic Script | Blight **spreads every 6 s** to one un-Blighted enemy in 6 m even while the target lives |
| 4 | `warlock_blight_t4b` | Debt Collected | Blighted enemies **give 5% of their max health as healing** to you when they die |

### `warlock_soul_leech`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `warlock_soul_leech_t1a` | Split Leech | beams to **2 targets**, 25% per tick each |
| 1 | `warlock_soul_leech_t1b` | Heart Leech | **4 ticks in 2 s**, 55% each |
| 2 | `warlock_soul_leech_t2a` | Transfusion | aim at an **ally** (targeting **Ally**): the beam **gives** them your health (4% of your max health a tick) — a heal paid in blood; every 2 ticks paid this way count as a paid Tithe (+1 Tithe) |
| 2 | `warlock_soul_leech_t2b` | Siphon Mind | also drains **20 mana** a tick from the target to you |
| 3 | `warlock_soul_leech_t3a` | Last Drop | if the target dies during the channel, **the channel jumps** to the nearest enemy in 10 m |
| 3 | `warlock_soul_leech_t3b` | Blight Feeder | each tick on a Blighted target **adds 1 s** to its Blight |
| 4 | `warlock_soul_leech_t4a` | Brimming **[tank]** | healing over full health becomes a **shield** (max 20% max health) |
| 4 | `warlock_soul_leech_t4b` | Soul Tap | a **completed** channel gives +1 Tithe (not only on a kill) |

### `warlock_brimstone`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `warlock_brimstone_t1a` | Brimstone Rain | **three 4 m circles** in a line away from you, 100% each |
| 1 | `warlock_brimstone_t1b` | Frugal Fire | **never spends a Tithe**; always Blights on hit, costs 30 more mana |
| 2 | `warlock_brimstone_t2a` | Pit of Brimstone **[tank]** | the ground **burns 6 s** (a void zone for enemies only: 25% a second) |
| 2 | `warlock_brimstone_t2b` | Fear of Fire | non-elites hit **flee for 3 s** (Feared) |
| 3 | `warlock_brimstone_t3a` | Demon's Share | your **bound demon** casts a copy of Brimstone at 50% on its own target |
| 3 | `warlock_brimstone_t3b` | Soulfire | killing blows from Brimburn **return the Tithe** spent |
| 4 | `warlock_brimstone_t4a` | Instant Inferno | Brimstone is **instant** while Blood Pact is up |
| 4 | `warlock_brimstone_t4b` | Twofold Rite | **2 charges** |

### `warlock_blood_pact`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `warlock_blood_pact_t1a` | Blood Only | always pays **health** (never Tithes); cost 15% current health |
| 1 | `warlock_blood_pact_t1b` | Tithe Only | always pays **3 Tithes**; cooldown 45 s |
| 2 | `warlock_blood_pact_t2a` | Shared Pact | your **bound demon and the 2 nearest allies** get +15% damage for the duration |
| 2 | `warlock_blood_pact_t2b` | Terms Extended | lasts **18 s** |
| 3 | `warlock_blood_pact_t3a` | Paid Back | when it ends, you are **healed for 50% of the health paid** |
| 3 | `warlock_blood_pact_t3b` | Blight Frenzy | during the Pact Blight is **instant and costs no mana** |
| 4 | `warlock_blood_pact_t4a` | Debt Collector | enemies that die during the Pact give **2 Tithes** |
| 4 | `warlock_blood_pact_t4b` | Final Clause **[tank]** | if you would die during the Pact (or Blood Bulwark), you **survive at 1 health** and it ends (once every 3 min) |

### `warlock_void_gate`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `warlock_void_gate_t1a` | Twin Gates | plant **two gates**; the second press jumps to the **nearer** one |
| 1 | `warlock_void_gate_t1b` | Long Anchor | gate lasts **40 s**, 90 m reach |
| 2 | `warlock_void_gate_t2a` | Open Door | the party gate costs **no Tithe** |
| 2 | `warlock_void_gate_t2b` | Void Wake | where you left from **bursts** for 150% in 5 m |
| 3 | `warlock_void_gate_t3a` | Gate Hunger **[tank]** | enemies within 4 m of the gate take 20% a second and generate **triple threat** toward you |
| 3 | `warlock_void_gate_t3b` | Throw the Demon | **Heel / Stay** aimed at the gate sends your bound demon through it to the gate (it taunts non-elites there for 3 s) |
| 4 | `warlock_void_gate_t4a` | Between | **1.0 s untargetable** during the return |
| 4 | `warlock_void_gate_t4b` | Recall Blight | returning **re-applies Blight** to every enemy within 10 m of where you left |

### `warlock_harrowing`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `warlock_harrowing_t1a` | Harrowing Ring | a **10 m ring** round you instead of a line |
| 1 | `warlock_harrowing_t1b` | Needle | beam **1 m wide**, **+40%** |
| 2 | `warlock_harrowing_t2a` | Aftertaste | detonated DoTs **re-apply at 50%** instead of only Blight |
| 2 | `warlock_harrowing_t2b` | Tithes Returned | each enemy killed by it **refunds 1 Tithe** (max 3) |
| 3 | `warlock_harrowing_t3a` | Blood Harrow | may be cast with **0 Tithes**: pays 8% max health per missing Tithe (max 5) as it casts |
| 3 | `warlock_harrowing_t3b` | Harrowed Ground | leaves a **30 m void line** for 5 s (enemies only, 30% a second) |
| 4 | `warlock_harrowing_t4a` | Final Accounting | at 5 Tithes the beam **also hits behind you** |
| 4 | `warlock_harrowing_t4b` | The Long Scream | becomes a **2 s channel** sweeping with your aim, same total damage (tags: +`tag_channel`) |

---

## 8. Class sets

### `set_warlock_debtors_raiment` — The Debtor's Raiment (level 36, levelling)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Blight **spreads on death to +1** | `warlock_blight` |
| 4 | Soul Leech **heals 75%** of damage | `warlock_soul_leech` |
| 6 | Pay Tithe costs **6%** of max health instead of 8% | Tithes |

Source: bosses of `d10_rimefang_caverns` (Normal); gloves from the `frostmantle` world boss ([page 13](../13-WORLD-BOSSES.md)).

### `set_warlock_ashen_covenant` — Vestments of the Ashen Covenant (level 60, damage)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Brimstone with a Tithe **leaves a 6 m pit** for 6 s (30% a second) | `warlock_brimstone` |
| 4 | Harrowing at **5 Tithes** resets Blood Pact's cooldown | `warlock_harrowing`, `warlock_blood_pact` |
| 6 | during Blood Pact, one Harrowing costs **no Tithes** (it counts as 5) | `warlock_harrowing` |

Source: bosses of `d15_fire_court` on **Challenge** (one piece per boss, once a week per boss, Monday 06:00).

### `set_warlock_gatekeeper` — The Gatekeeper's Garb (level 60, tank)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Void Gate and Gate of Grudges cooldown **30 → 20 s** | `warlock_void_gate`, `warlock_gate_of_grudges` |
| 4 | taking the gate (you or an ally) gives a **15% max health shield** for 6 s | gates |
| 6 | in Iron Covenant, each Tithe held gives **+5% damage reduction** instead of 3% | Iron Covenant |

Source: the final boss's chest at **Depth 10 or deeper**, any dungeon ([page 12](../12-DUNGEONS.md)).

---

## 9. Class legendaries, uniques and souls

### Legendaries

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `leg_the_first_contract` | **The First Contract** | off hand (Grimoire) | *Binding Terms*: max Tithes **7**; Harrowing's per-Tithe bonus is **+120%** | secret boss of `d16_the_spire` (Challenge), 8% |
| `leg_vesna_duskwells_quill` | **Vesna Duskwell's Quill** | wand | *Signed in Red*: Blood Price costs **1% max health per 10 mana**, and every health-paid cast gives **+1 Tithe** (max 1 per 2 s) | the `riftmarch` world boss ([page 13](../13-WORLD-BOSSES.md)), 4% |
| `leg_crown_of_the_hollow_host` | **Crown of the Hollow Host** | head | *Hollow Host*: Crowned (calling 3) lasts **20 s** and each DoT you apply spreads to **2** | final boss of `d15_fire_court` (Challenge), 6% |
| `leg_kinship_of_debt` | **Kinship of Debt** | amulet | *Shared Blood*: whenever you **pay** a Tithe, your bound demon heals **15%** and its next attack deals **+200%** | final boss of `d09_warmasters_pit` at Depth 10+, 2% |
| `leg_gate_of_the_nine_doors` | **Gate of the Nine Doors** | feet | *Nine Doors*: Void Gate has **no cooldown** while a gate stands; you may keep **3 gates** | the `kingsfire` world boss, 5% |
| `leg_the_debt_collar` | **The Debt Collar** | neck | *Collateral*: in Iron Covenant, Blood Ward is **200%** of the health paid and lasts 15 s | final boss of `d13_cindergate` (Challenge), 6% |

### Uniques

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `uq_marsh_hermits_contract` | **Marsh-Hermit's Contract** | off hand | Bind Demon's channel is **1.5 s** and its cooldown 30 s | `d02_drowned_mill` final boss `b_the_grindwheel`, 10% |
| `uq_blight_iron_of_tamar` | **Blight-Iron of Tamar** | staff | Blight's hit is **+200%** (the first 20% becomes 60%) | `d06_sandsworn_vault` boss 2, 7% |
| `uq_leechbone_ring` | **Leechbone Ring** | ring | Soul Leech **can be cast while moving at full speed** | `d07_thornheart` final boss, 7% |
| `uq_ashen_ledger_page` | **Ashen Ledger Page** | amulet | the first Harrowing after a Void Gate return costs **no Tithes** (it counts as 3) | `cinder_steppe` rare monsters (page 10), 3% |

### Souls

| id | Name | Socket in | Requirement | Power | Source |
|---|---|---|---|---|---|
| `soul_second_signature` | **Soul of the Second Signature** | chest (armour) | **Warlock only** | you may have **two bound demons out at once**, each at **70%** of normal power; both answer the same commands | the secret boss of `d13_cindergate` (Normal or Challenge), 4%; or any Demon at 0.02% (great luck) |
| `soul_creeping_debt` | **Soul of Creeping Debt** | weapon | **Warlock only** | Blight **also spreads when it expires**, to one enemy within 8 m at 50% duration (not onto an enemy that already has it) | quest reward: the Kingsfire story chapter's warlock version (page 14); or Depth 15+ final chest, 1% |

---

## 10. Voice and barks

Voice: **new row `warlock`** proposed for `shared/voices.js` — `pitch 0.44, depth 0.58, tone 0.48,
breath 0.35, rough 0.12, speed 0.46, jitter 0.1` (low, smooth). Lingo tag `class:warlock`. Bound demons only
growl, hiss or chitter (no speech).

| When | Lines |
|---|---|
| Blight | "Marked and owed." · "Sign here." |
| Spread | "Pass it along." |
| Pay Tithe | "Take it." · "Paid in full." |
| Blood Pact | "Take it. I'll take more." · "Blood for speed. A fair trade." |
| Harrowing | "All debts come due." · "Pay up." |
| A demon kneels | "Kneel. We have terms to discuss." |
| Bind complete | "Welcome to the book." |
| Rite of Recall | "Up. Your contract isn't finished." |
| Iron Covenant on | "Hit me. It's all on account." |
| Crit | "Interest." |
| Low health | "The price is getting steep!" · "I can't pay for much more of this!" |
| Gate return | "I was never here." |

---

## 11. Reuse notes

| Borrowed | From | Used for |
|---|---|---|
| Pet AI | `prototypes/farhold/js/pets.js` (follow/engage/return), `js/followers.js` `scaleFollower` | bound demons |
| Demon bodies | `avatar-3d/js/creatures.js` imp, hound, titan, wraith, horror plans + page 10 looks | bound demons keep the look they had, with a violet collar-glyph |
| Look | `avatar-3d/data/class-outfits.json` `warlock` (hood, robe, cape, rune bracers) | default look |
| Visual only | Farhold `curse`, `drain`, `void_rift` | Blight, Leech, Gate |
| Legendary effect engine | `prototypes/farhold/data/uniques.json` `curse_spreads`, `rot_spread`, `blood_price` | the plumbing for spread-on-death and health-cost powers (numbers new) |
| Dropped | Farhold `bind_imp` and the imp pet; Farhold's `ember_familiar` (the Pyromancer keeps it) | no summoned pet (W32) |

---

## 12. Round 2 changes

- **No pet** (W32): the bound imp, its commands, Devour and every imp item are gone. **Bind Demon** replaces it: beat a Demon-tagged enemy, bind it for good, revive it with the **Rite of Recall** out of combat.
- **Soul Shards → Tithes**, bought with health on `G`; the old 0–50 Tithe bank is folded into the pips.
- New hybrid **Tank** role: Iron Covenant (`Shift+1`), three tank spell versions, [tank] talents, a tank set and legendary.
- Mana costs are flat numbers. Raid, Heroic and Mythic+ sources re-homed; souls added.

| Old | New |
|---|---|
| Soul Shards | **Tithes** |
| `warlock_hex_brand` Hex Brand (Emberveil "Corruption") | `warlock_blight` **Blight** (talents `_hex_brand_t*` → `_blight_t*`; Brand Echo → Blight Echo, Soul Sigil → Debt Collected, Brand of Doubt → Choking Blight) |
| `warlock_hellbloom` Hellbloom, "hellfire", Hellburn | `warlock_brimstone` **Brimstone**, **Brimburn** (Hellrain → Brimstone Rain, Pit of Flame → Pit of Brimstone, Kindling Imp → Demon's Share) |
| `warlock_soul_pact` Soul Pact | `warlock_blood_pact` **Blood Pact** (Shard Only → Tithe Only) |
| talent *Throw the Imp* | *Throw the Demon* |
| talent *Souls Returned* | *Tithes Returned* |
| `leg_imp_in_a_bottle` | `leg_kinship_of_debt` |
| `uq_branding_iron_of_tamar` | `uq_blight_iron_of_tamar` |
| the imp's Snuff (`G`) | Pay Tithe (`G`); Snuff is now a bound imp's special |
| `q_warlock_calling_1/2/3` | `q_calling_warlock_1/2/3` |
| sources `r03_sunken_choir`, `r04_ember_court`, `r05_veilspire`, Mythic+ | `kingsfire` world boss, `d15_fire_court` / `d16_the_spire` / `d13_cindergate` Challenge, Depth 10+/15+ |
