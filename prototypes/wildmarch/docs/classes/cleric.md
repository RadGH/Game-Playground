# Cleric — class design (`cleric`)

> *"Nothing I pour out is wasted. What you don't need, I keep for when you will."*

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Follows the class template in
[page 00 §5](../00-OVERVIEW.md). Canon facts used (page 00 §6): primary role **Healer**, hybrid role **Support**,
build **caster**, **light** armour, resource **Mana**, mechanic **Devotion — overhealing banks into shields**,
spell slots **1 / 4 / 10 / 18 / 28 / 40**, calling quests **6 / 20 / 40**, talent tiers **12 / 22 / 32 / 45**, cap **60**.

## How to read the numbers on this page

- **% SP** = percent of spell power (page 05 owns it). **% WD** is used only for basic attacks. Numbers are
  **final**: Farhold's `effectiveMult` is folded in and never applied again.
- **Mana** costs are **% of base mana** (page 05/07 set the pool from INT and the regeneration). What the
  cleric does to its own mana is in §1.1.
- **Overheal** = the part of a heal above the target's max health (it would otherwise be lost).
- **Targeting** (page 00 §12.1 W8, page 02): **Ally** needs a friendly hard target — yourself (`F1` or your
  own frame) or a party member (`F2`–`F5` or their frame); **Auto-target** casts on your hard enemy target,
  or with none, the valid enemy nearest your aim point in range; **Self** is centred on you; **Ground** is placed
  at the aim point. If an Ally spell is pressed with no friendly target (or an *enemy* targeted) it refuses with "No friendly
  target"; the page 04 setting `set.gameplay.self_cast_fallback` (**off by default**, 00 §4) makes it cast on yourself instead.
- **Tags** are page 05 §Tags ids.
- "Dispellable" debuffs are the ones page 05 / page 11 mark as removable (poison, curse, disease, magic).
- Statuses (blind, fear, burn, root, untargetable, barrier) are page 05's.

---

## 1. Identity

| Field | Value |
|---|---|
| Fantasy | The temple's field healer. Every prayer spills over, and the overflow is caught and kept. |
| Primary role | **Healer** (the main healer of the thirty) |
| Hybrid role | **Support** — wards that go up *before* the hit, a holy Brand that makes a target take more damage, and Devotion poured out as a damage blessing instead of a heal (§5) |
| Build | **caster** |
| Armour | light |
| Weapons | staff, sceptre, wand; shield or focus in the off hand with a one-handed weapon (reuse: Farhold `classes.json` `cleric` weapons + `shield: true`; foci from `js/foci.js`) |
| Primary attribute | INT (secondary CON) |
| Resource | **Mana** + the **Devotion** gauge |
| Companion | none |
| Starting kit | sceptre, shield, light chest, light hood (Farhold starts the cleric in medium; canon says **light**, so the kit is light) |

**Playstyle in three sentences.** The cleric heals big and does not apologise for overhealing, because every
point of **overheal** fills **Devotion** and (from the level 6 calling) turns into a **ward** on the ally it
spilled over. Devotion is spent on the things only a cleric can do: raising a fallen ally mid-fight, pouring
the whole gauge out as a group heal (or, when nobody needs healing, as a damage blessing), and from level 40
**Keeping Vigil**, which catches an ally on the edge of death. Its hardest calls are when to *hold* Devotion for
a Raise and when to pour it out to stop one being needed.

### 1.1 Mana — what the cleric spends and gets back

| Item | Mana |
|---|---|
| Spells | Kindled Prayer 4% · Wreath of Dawn 9% · Scourging Light 3% · Sanctuary Seal 5% · Lifeline 2% a second · Dawn's Absolution 15% |
| Regeneration | page 05's base (in combat and out) |
| Scourging Light | refunds **1%** mana each time its heal lands on an ally below 50% health |
| Devotion actions | cost Devotion, never mana |
| Talent refunds | Answered Prayer (Kindled Prayer crits refund their cost), Everflame (every 4th Kindled Prayer free) |

A cleric healing a Normal dungeon at a steady pace runs about **4 minutes** from full to empty; one who chains
Wreath of Dawn every 4 s runs dry in about **70 s**. Mana, not cooldowns, is what limits the cleric.

**Original hook (the `prototypes/emberveil/` cleric):** "Mass Resurrection can auto-trigger on wipe. Sanctuary
makes an ally temporarily untargetable." — Sanctuary Seal is kept. Mass resurrection is **removed** in v2
(round 2, W35) and parked in `WISHLIST.md`; its level-40 slot in the Devotion kit is now **Keeping Vigil** (§2.3).

---

## 2. Class mechanic — Devotion (new)

### 2.1 The gauge (level 1)

| Rule | Value |
|---|---|
| Range | **0–100** |
| Filling | **+1 Devotion per 1% of the target's max health overhealed** (a 3,000 overheal on a 10,000-health tank = +30). Also +1 per 2% of an enemy's max health dealt by Scourging Light. |
| Out of combat | drains **2 a second** |
| Survives death | no — a dead cleric's gauge goes to 0 |
| Shared | no — each cleric has their own |

### 2.2 What Devotion buys

| Use | Unlock | Key | Cost | Effect |
|---|---|---|---|---|
| **Devotion Ward** (passive) | calling 1 (level 6) | — | free | **50% of every overheal** becomes a barrier on that ally, max **15% of their max health**, 10 s. (The overheal still fills the gauge.) |
| **Raise** | calling 1 (level 6) | **`Q`** (class key) | **50 Devotion** in combat, free out of combat | Ally (a dead party member: target their frame or `F2`–`F5`, or aim at the body), 30 m. 3 s cast; revives one dead ally at **30% health** and 20% mana. Damage does not interrupt it; a stun does. **No limit on how many times per fight** (round 2, W21) — the only limit is Devotion. |
| **Outpouring** | calling 2 (level 20) | **`G`** (second class key) | **all** Devotion (min 30) | Self, instant: every ally within **30 m** heals **1% of max health per 2 Devotion** spent (100 = 50%). 30 s cooldown. If **every** ally within 30 m is at 90% health or more, it becomes **Blessing of Zeal** instead (§5). |
| **Keeping Vigil** (passive) | calling 3 (level 40) | — | **25 Devotion**, spent automatically | §2.3 |

### 2.3 Keeping Vigil (calling 3, level 40)

When a party member within **40 m** takes a hit that would kill them **while they carry a Devotion Ward**, and
you hold **25+ Devotion**:

- the hit leaves them at **1 health** instead, the ward breaks, and **25 Devotion** is spent;
- they get **1.5 s** of taking **no damage** (a gold shimmer; enough to step out of what hit them);
- the same ally can be caught **once per 60 s** (a grey feather on their party frame shows the lockout).

It does not work on the cleric (the cleric cannot ward-catch themself; see the Sealbearer's Mantle, §9).
Turn it off per character in page 04 (`set.gameplay.cleric_keeping_vigil`, default **on**) for players who
would rather keep the Devotion for Raise.

### 2.4 Calling quests (page 14 owns the text)

| Level | Quest id | Where | Grants |
|---|---|---|---|
| 6 | `q_calling_cleric_1` "The Brimming Cup" | Brightwater's temple, Hearthvale — tend the wounded of a mill fire until nobody is left hurting | **Devotion Ward** and **Raise** |
| 20 | `q_calling_cleric_2` "Water in the Desert" | Oasis of Tamar, Sunscar — carry a dying pilgrim's blessing to the Glass Tombs' shrine | **Outpouring** (and Blessing of Zeal) |
| 40 | `q_calling_cleric_3` "The Last Vigil" | Saltdeep, the Drowned Coast — the Saltmarch temple's crypt, where a drowned congregation must be laid to rest one by one before the tide turns | **Keeping Vigil** |

### 2.5 Gauge and HUD (new; page 03 `hud_devotion`)

- A **chalice** icon left of the mana bar that fills with gold light (0–100). Marks at 25, 30 and 50.
- At **50** the chalice rim glows (Raise is affordable); at **25+** from level 40 a small gold feather sits on
  the rim (Keeping Vigil is armed).
- Devotion Wards show on party frames as a gold bar over the health bar (the barrier amount).
- On party frames, a dead ally shows a gold "can raise" feather when you have 50+.
- When Outpouring would become Blessing of Zeal, the `G` key icon turns from gold to white-gold with a sword glyph.
- Tooltip: "Devotion 64. Raise costs 50. Outpouring spends it all: about 32% of everyone's health."

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Mana | Cooldown | Cast | Target | Shape | Tags | Headline |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `cleric_kindled_prayer` | Kindled Prayer | 4% | — | 1.5 s | Ally | one ally, 30 m | `tag_holy` `tag_spell` `tag_heal` | heal 220% SP, removes 1 dispellable debuff |
| 2 | 4 | `cleric_wreath_of_dawn` | Wreath of Dawn | 9% | 4 s | 2.0 s | Self | 12 m circle on you | `tag_holy` `tag_spell` `tag_heal` `tag_area` | heal 110% SP each |
| 3 | 10 | `cleric_scourging_light` | Scourging Light | 3% | 6 s | 1.2 s | Auto-target | bolt, 30 m | `tag_holy` `tag_spell` `tag_ranged` `tag_projectile` `tag_heal` | 160% SP holy (×2 undead/demon); half heals the lowest ally |
| 4 | 18 | `cleric_sanctuary_seal` | Sanctuary Seal | 5% | 90 s | instant | Ally | one ally, 30 m | `tag_holy` `tag_spell` `tag_duration` | untargetable 4 s, area damage −50% |
| 5 | 28 | `cleric_lifeline` | Lifeline | 2%/s | 12 s | channel ≤6 s | Ally | gold tether to one ally, 25 m | `tag_holy` `tag_spell` `tag_heal` `tag_channel` | 90% SP a second (540% total) |
| 6 | 40 | `cleric_dawns_absolution` | Dawn's Absolution | 15% | 150 s | instant | Self | 20 m circle on you | `tag_holy` `tag_spell` `tag_heal` `tag_area` | heal all 300% SP, cleanse 1, −30% damage 4 s |

### 3.2 Spell details

**1. `cleric_kindled_prayer` — Kindled Prayer** (level 1) — **single-target heal + dispel**
- **4% mana**, no cooldown, **1.5 s cast**, within **30 m**. Heals **220% SP**.
- Targeting: **Ally** — yourself (`F1`) or a party member (`F2`–`F5`, a frame, or a friendly player clicked in
  the world). Will not cast on nothing.
- Tags: `tag_holy`, `tag_spell`, `tag_heal`.
- Removes **one dispellable debuff** from the target (the cleric's dispel).
- Looks: Chibi 2 `castStaff` (staff) / `castPoint`; a small candle-flame `flare` travels to the target, then
  spellfx `heal` (colour warm white).
- Sound: `cast.start` → `heal`.

**2. `cleric_wreath_of_dawn` — Wreath of Dawn** (level 4) — **group heal**
- **9% mana**, cooldown **4 s**, **2.0 s cast**, **12 m circle centred on you**. Heals every ally inside for
  **110% SP** (party members, their pets and followers; in the open world, other players too, up to **8**,
  lowest health % first).
- Targeting: **Self**. (Tier-1 **Thrown Wreath** makes it **Ally**.)
- Tags: `tag_holy`, `tag_spell`, `tag_heal`, `tag_area`.
- Looks: a ring of gold light expanding to 12 m (spellfx `ring`, element `holy`), `holy_mote` rising from each
  healed ally.
- Sound: `spell.holy.launch` + a soft bell (`bell.toll`, high and short).

**3. `cleric_scourging_light` — Scourging Light** (level 10) — **damage that heals**
- **3% mana**, cooldown **6 s**, **1.2 s cast**, bolt, **30 m**. **160% SP holy**, **×2 against undead and demons**
  (enemies tagged Undead or Demon, page 10).
- Targeting: **Auto-target** — your hard enemy target, or the enemy nearest your aim point within 30 m.
- Tags: `tag_holy`, `tag_spell`, `tag_ranged`, `tag_projectile`, `tag_heal`.
- **50% of the damage dealt heals the lowest-health ally within 30 m** (this heal's overheal fills Devotion as
  normal). The hit itself adds Devotion (§2.1). Mana refund: §1.1.
- Looks: spellfx `projectile` element `holy` (shape `rune`), `impact` `holy` with a brief `pillar`; a gold thread
  from the target to the healed ally.
- Sound: `spell.holy.launch`, `spell.holy.impact`, `heal` (quiet).

**4. `cleric_sanctuary_seal` — Sanctuary Seal** (level 18) — **the untargetable emergency**
- **5% mana**, cooldown **90 s**, instant, within **30 m**. Lasts **4 s**.
- Targeting: **Ally** (yourself or a party member).
- Tags: `tag_holy`, `tag_spell`, `tag_duration`.
- The ally is **untargetable**: enemies drop them as a target, single-target attacks and page 11 **Targeted
  (yellow)** mechanics cannot choose them (they pick someone else, or fizzle if nobody else is valid). Ground
  and area effects still hit them for **50% less**. The ally can act normally.
- Looks: a gold-white hexagonal shell (`STATUS_FX.barrier` recoloured + `holy_rune` sprites circling); the
  ally's nameplate shows a seal icon to enemies and allies.
- Sound: `status.barrier.apply` + a chime.

**5. `cleric_lifeline` — Lifeline** (level 28) — **channelled emergency heal**
- **2% mana a second**, cooldown **12 s** (starts when the channel ends), **channel up to 6 s**, a tether to one
  ally within **25 m** (breaks at 35 m or without line of sight for 1 s).
- Targeting: **Ally** (a party member; on yourself it is a plain 6 s heal-over-time with no tether).
- Tags: `tag_holy`, `tag_spell`, `tag_heal`, `tag_channel`.
- Heals **90% SP every second** (540% over 6 s). You can walk at **50% speed** while channelling.
- The tether is **gold**, never white (white is page 11's boss tether).
- Looks: Chibi 2 `channel`; spellfx `arc` (colour gold, low jitter) between the two, `holy_mote` flowing along it.
- Sound: `status.regen.apply`, then a looping warm hum (`status.regen.tick` each second).

**6. `cleric_dawns_absolution` — Dawn's Absolution** (level 40) — **the big group cooldown**
- **15% mana**, cooldown **150 s**, instant, **20 m circle on you**.
- Targeting: **Self**.
- Tags: `tag_holy`, `tag_spell`, `tag_heal`, `tag_area`.
- Every ally inside heals **300% SP**, loses **one dispellable debuff**, and takes **30% less damage for 4 s**.
- Looks: a sunrise — spellfx `pillar` on the cleric (radius 3 m, 700 ms) then a flat gold `ring` to 20 m, each
  ally flashes `revive`-style light.
- Sound: `revive` + `spell.holy.impact`.

### 3.3 Rotation / how it plays

- **Solo:** staff/sceptre basic attacks and **Scourging Light** on cooldown (it heals you as the lowest ally
  when alone). Kindled Prayer between fights. Sanctuary Seal on yourself to reset an enemy that has you cornered
  (it loses you as a target for 4 s). The cleric is a slow soloer by design; a follower tank (page 07) helps.
- **Dungeon, Normal:** Kindled Prayer on the tank, Wreath of Dawn on group damage (over-heal freely — it banks),
  Scourging Light when everyone is topped. Hold **50 Devotion** as a Raise from the moment the boss is pulled.
  Sanctuary Seal on the tank for a tank buster that has no other answer (the boss retargets someone else — plan
  it), or on a player with a yellow Targeted mark. Lifeline for the tank in the last 20%. Dawn's Absolution for
  the room-wide spike.
- **Dungeon, Challenge and deep Depth:** the same, but the Devotion plan matters more: keep **75+** going into
  a known room-wide hit so the wards are already up, Keeping Vigil stays armed (25), and Outpouring is saved for
  the scripted damage phase rather than spent early.

### 3.4 Healing kit summary (single / group / emergency / revive)

| Need | Spell |
|---|---|
| Single | Kindled Prayer (220% SP, 1.5 s), Lifeline (540% over 6 s) |
| Group | Wreath of Dawn (110% SP each, 4 s cooldown), Outpouring (up to 50% of max health on everyone, 20+) |
| Emergency | Sanctuary Seal (untargetable 4 s), Dawn's Absolution (300% SP + 30% less damage), Devotion Wards, Keeping Vigil (40+) |
| Dispel | Kindled Prayer (1 debuff), Dawn's Absolution (1 each) |
| Revive | Raise (50 Devotion, one ally, 6+, no per-fight limit), Rising Dawn talent (Dawn's Absolution) |

### 3.5 Boss mechanics

| Mechanic (page 11) | Cleric |
|---|---|
| Targeted (yellow) | **Sanctuary Seal** on the marked player removes them from the choice — the mechanic retargets. Use it on a player who cannot move. |
| Soak (orange) | Pre-ward soakers by over-healing them (Devotion Wards up to 15%), then Wreath of Dawn as it lands. |
| Tank buster | Sealing the tank moves the boss to someone else — only with a second tank ready. Lifeline + Absolution is the normal answer; Keeping Vigil catches the one that gets through. |
| Room-wide damage | Outpouring and Dawn's Absolution. |
| Void / danger zones | No movement spell in the base kit: casts are 1.2–2 s. Talents give **Walking Prayer** and **Walking Wreath** (cast while moving). Lifeline lets you walk at 50%. |
| Deaths | Raise, as often as Devotion allows. |
| Dispels | Kindled Prayer every cast; Cleansing Flame talent removes all. |
| Undead/demon bosses | Scourging Light ×2; tier-4 **Holy Rebuke** fears their adds. |

---

## 4. Alternate spells

None. The cleric's bar never changes. Its Devotion actions (Raise on `Q`, Outpouring / Blessing of Zeal on
`G`) are class keys, not spell slots.

---

## 5. The hybrid role — Support

**How.** The support cleric stops healing damage *after* it lands and starts making the party hit harder and
get hit less *before* it lands. It queues as **Support** (a Damage slot in the Dungeon Finder, page 00 §4).

**Role focus** (canon 00 §6): the cleric uses the shared **Role focus** switch in the spellbook (out of combat,
saved per Loadout). **Hybrid** queues it as Support and makes Scourging Light fill Devotion from damage instead
of from overheal; everything else below works in either focus (Blessing of Zeal still needs its 90%-health
condition). **Primary** puts it back to Healer.

The pieces:

| Piece | What it does for the group |
|---|---|
| **Blessing of Zeal** (Outpouring when every ally within 30 m is at 90%+ health; §2.2) | spends all Devotion (min 30): every ally within 30 m deals **+1% damage per 5 Devotion spent** (100 = **+20%**) for **10 s**. Same 30 s cooldown as Outpouring. Tags `tag_holy` `tag_aura` `tag_duration`. |
| Scourging Light as the main spell | fills Devotion from damage (+1 per 2% of an enemy's health) instead of from overheal |
| **Brand** (Scourging Light t2b) | the target takes **10% more holy damage** for 8 s; with the set `set_cleric_sunward` 2-piece it becomes 6% more damage **of every tag** |
| **Wreath of Haste** (Wreath t3b) | allies healed attack 15% faster for 6 s — cast on a full-health party purely for the haste |
| Sanctuary Seal on the damage dealer | lets the top damage dealer stand still through a Targeted mechanic |
| **Fleet Dawn** / **Stand Up** (Dawn's Absolution t2c / t3c) | movement and control-breaking for the whole party |

**Loop.** Scourging Light every 6 s (Brand up) → basic attacks → Wreath of Dawn only for Wreath of Haste →
at 100 Devotion, Blessing of Zeal (+20% for 10 s, every ~30–40 s) → Kindled Prayer only when someone drops
under 60%.

**Talent picks:** Quick Scourge or Chain Scourge (t1), Brand (t2b), Sunfire (t3b), Wrath of Dawn (t4a);
Wreath of Haste (Wreath t3b); Fleet Dawn and Stand Up (Absolution).

**Gear:** spell power and crit rather than healing power; `leg_tamars_wellspring` (its pool also feeds Devotion
while you stand in it) and the Sunward set.

**How well it does, in numbers.**

| Content | Target | Why |
|---|---|---|
| Open world, Normal dungeons | the party deals **+10–12%** damage overall (Zeal about a third of the time, Brand, haste) and the cleric's own damage is **~55%** of a Damage class; together that is worth about one full Damage slot | packs die fast, so a full-health party is common and Blessing of Zeal is up often |
| Depth up to about 10 | **+8–10%** | more damage taken means the 90%-health condition for Zeal holds less often |
| Challenge mode | **+4–6%** | Challenge bosses keep the party below 90% health most of the fight (constant room-wide damage), so Outpouring stays a heal and Zeal rarely fires, and a Challenge group needs the cleric's healing more than its buffs. Accepted by design (page 00 §6) |

---

## 6. Utility spells

None that use a slot. **Raise** is free out of combat (§2.2), so the cleric is also the party's out-of-combat
reviver; no separate spell is needed. **Mass resurrection** (raising the whole party at once) is not in v2 — see
`WISHLIST.md`. The cleric travels with scrolls and the Recall Stone (page 20).

---

## 7. Talents

Id = spell id + `_t<tier><letter>`. A tier opens at its level or when the spell unlocks, whichever is later.
A talent that changes targeting or shape changes the spell's tags too (noted where it does).

### Kindled Prayer
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Swift Prayer** — 1.0 s cast, heals 190% SP. | **Kindling** — also leaves a 6 s heal-over-time worth 60% SP. Adds `tag_duration`. | **Twin Candles** — also heals the lowest other ally within 10 m for 60%. |
| 2 (22) | **Walking Prayer** — can be cast while moving. | **Answered Prayer** — a critical heal refunds its mana. | **Devout Prayer** — its overheal fills Devotion twice as fast. |
| 3 (32) | **Stoked Flame** — each cast on the same ally within 6 s heals 15% more (up to 3 times). | **Candle Ward** — the ally gets a barrier of 20% of the heal for 8 s. Adds `tag_shield`. | **Cleansing Flame** — removes **all** dispellable debuffs. |
| 4 (45) | **Everflame** — every 4th cast is instant and free. | **Prayer Chain** — bounces to 2 more allies for 50% and 35%. | — |

### Wreath of Dawn
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Walking Wreath** — can be cast while moving. | **Thrown Wreath** — Ally: centred on an ally within 30 m instead of you. | **Tight Wreath** — 6 m circle, heals ×1.8. |
| 2 (22) | **Lingering Wreath** — leaves a 12 m ring on the ground for 6 s healing 10% SP a second. Adds `tag_duration`. | **Wreath of Thorns** — enemies inside take 60% SP holy. | **Full Cup** — Devotion Wards from this spell are twice as large (max 25% of health). |
| 3 (32) | **Rising Wreath** — heals more the lower the ally (up to +60% at 20% health). | **Wreath of Haste** — allies healed attack 15% faster for 6 s. | **Quickening** — each ally healed cuts Lifeline's cooldown 1 s. |
| 4 (45) | **Twin Wreath** — a second pulse 1.5 s later for 50%. | **Crown of Dawn** — the lowest ally healed gets +60% and takes 20% less damage for 3 s. | — |

### Scourging Light
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Lance of Light** — a 20 m × 1.5 m line that hits everything on it. Adds `tag_area`. | **Chain Scourge** — jumps to 2 more enemies at 70%. | **Quick Scourge** — instant, 110% SP. |
| 2 (22) | **Penance** — heals **every** ally within 10 m of the target for 25% of the damage (instead of one). | **Brand** — the target takes 10% more holy damage for 8 s. Adds `tag_curse`. | **Glare** — blinds 2 s (miss 50%). |
| 3 (32) | **Atonement** — the heal goes to whoever the target is attacking. | **Sunfire** — leaves a holy burn for 6 s. Adds `tag_duration`. | **Illuminate** — reveals hidden enemies within 10 m and interrupts the target (once per 8 s). |
| 4 (45) | **Wrath of Dawn** — at 100 Devotion (not spent) it becomes a 6 m blast for 300% SP that heals the group for 20% of the damage. Adds `tag_area`. | **Holy Rebuke** — undead and demons hit are feared 3 s (boss: fills the break bar instead). | — |

### Sanctuary Seal
| Tier | a | b | c |
|---|---|---|---|
| 1 (12)\* | **Double Seal** — 2 charges. | **Long Seal** — 6 s. | **Sanctuary Circle** — Ground: a 4 m ring: every ally inside is untargetable for 3 s. Adds `tag_area`. |
| 2 (22)\* | **Healing Seal** — the sealed ally heals 5% of max health a second. Adds `tag_heal`. | **Blinding Seal** — enemies that lose their target are blinded 2 s. | **Iron Seal** — area damage on the sealed ally is cut 80%, not 50%. |
| 3 (32) | **Swift Seal** — cooldown 60 s. | **Wandering Seal** — when it ends it jumps to the lowest-health ally for 2 s. | **Retribution** — enemies that swung at the ally in the second before the seal take 100% SP holy. |
| 4 (45) | **Guardian's Seal** — while it holds, single-target hits meant for the ally land on **you** at 50%. | **Seal of Passing** — the sealed ally moves 50% faster and takes no damage from void zones. Adds `tag_movement`. | — |

\* unlocks at 18: tier 1 opens at 18.

### Lifeline
| Tier | a | b | c |
|---|---|---|---|
| 1 (12)\* | **Hauling Line** — on the first tick, pull the ally 10 m toward you (out of a zone). Adds `tag_movement`. | **Twin Line** — two allies at 60% each. | **Short Line** — a 3 s channel that heals twice as much a second. |
| 2 (22)\* | **Line of Grace** — the ally takes 20% less damage while tethered. | **Shared Line** — you take 20% of their damage and receive 20% of each tick. | **Free Line** — you walk at full speed while channelling. |
| 3 (32) | **Snap** — releasing early heals 50% of what was left at once. | **Brimming Line** — overheal from it fills Devotion ×3. | **Cleansing Line** — removes one dispellable debuff every 2 s. |
| 4 (45) | **Unbroken Line** — the ally cannot drop below 1 health while tethered. | **Lifeline Web** — the tether branches to every ally within 2 m of its line for 40%. | — |

\* unlocks at 28: tiers 1–2 open together.

### Dawn's Absolution
| Tier | a | b | c |
|---|---|---|---|
| 1 (12)\* | **Wide Absolution** — 35 m. | **Long Dawn** — the damage reduction lasts 8 s at 20%. | **Quick Absolution** — cooldown 110 s, heals 220% SP. |
| 2 (22)\* | **Rising Dawn** — also revives the most recently fallen ally in range at 20% health. | **Burning Dawn** — enemies within 20 m take 200% SP holy. | **Fleet Dawn** — allies move 30% faster for 5 s. Adds `tag_movement`. |
| 3 (32)\* | **Full Cup** — sets your Devotion to 100. | **Clean Slate** — removes **all** dispellable debuffs. | **Stand Up** — breaks stuns, roots and fears on allies. |
| 4 (45) | **Second Dawn** — echoes 4 s later at 50%. | **Dawn Unbroken** — for the 4 s allies cannot drop below 1 health. | — |

\* unlocks at 40: tiers 1–3 open together.

---

## 8. Class sets

### `set_cleric_vigil` — Vestments of the Long Vigil (dungeon set)
Head `d05_glass_tombs` final boss, chest `d11_saltdeep_cathedral` final boss, legs `d08_moonwell_ruins` final boss,
hands `d13_cindergate` boss 2, feet `d07_thornheart` boss 2, off hand (reliquary focus `it_vigil_reliquary`)
`d14_ashen_reliquary` final boss. On **Normal** a piece drops at the dungeon's level; on **Challenge** at 60.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Devotion Wards can reach **25%** of an ally's max health. | Devotion |
| 4 | Raise costs **35** Devotion and has a 2 s cast. | Raise |
| 6 | Wreath of Dawn's overheal on any ally also refreshes that ally's Devotion Ward to full. | Wreath of Dawn |

### `set_cleric_sunward` — Raiment of the Sunward Choir (endgame set)
Was a raid set (raids are in `WISHLIST.md`); kept with a new source: one piece from each **Challenge-mode**
boss of `d15_fire_court` and `d16_the_spire` (page 12 picks which boss holds which slot), and any piece from
the end chest of any dungeon at **Depth 10 or deeper** (cleric-only roll, 8%). Always item level 60. This is
the **Support** set.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Brand (Scourging Light t2b) raises **all** damage the target takes by 6%, not only holy. Without Brand: Kindled Prayer on an ally with a Devotion Ward heals 20% more. | Scourging Light / Kindled Prayer |
| 4 | Outpouring's cooldown is 20 s and it also casts a free Wreath of Dawn. | Outpouring, Wreath |
| 6 | Dawn's Absolution sets every ally's Devotion Ward to 15% of their health and fills your Devotion by 40. | Dawn's Absolution |

---

## 9. Class legendaries, uniques and souls

Every item below is cleric-only (`classes: ["cleric"]`).

### Legendaries
| id | Name | Slot / base | Power | Drop source |
|---|---|---|---|---|
| `leg_the_brimming_chalice` | The Brimming Chalice | off hand (reliquary) | **Never Empty** — Devotion can reach **150**; above 100, every heal you cast is 25% stronger. | `d16_the_spire` final boss, **Challenge** only |
| `leg_staff_of_the_last_vigil` | Staff of the Last Vigil | staff | **Vigil Unbroken** — Keeping Vigil costs 15 Devotion, reaches 60 m, and its per-ally lockout is 30 s. | `d15_fire_court` final boss, **Challenge** only |
| `leg_sealbearers_mantle` | The Sealbearer's Mantle | light chest | **Twin Sanctuary** — Sanctuary Seal also seals you for the same 4 s and its cooldown is 60 s; Keeping Vigil can catch you (once per 120 s). | `d11_saltdeep_cathedral` final boss on **Challenge**, or its end chest at **Depth 5+** |
| `leg_tamars_wellspring` | Tamar's Wellspring | sceptre | **Wellspring** — Outpouring (or Blessing of Zeal) leaves a 10 m pool for 8 s that heals 2% max health a second and gives 2 Devotion a second while you stand in it. | the world boss of `sunscar` (page 13) |

### Uniques
| id | Name | Slot | Power | Drop source |
|---|---|---|---|---|
| `uq_mill_fire_censer` | Mill-Fire Censer | necklace | Kindled Prayer's first cast on a target below 35% health is instant. | `d02_drowned_mill` boss 2 |
| `uq_gilded_tether` | The Gilded Tether | light hands | Lifeline reaches 35 m and breaks at 45 m. | `d04_bellows_keep` boss 2 |
| `uq_barrow_candle` | Barrow Candle | wand | Scourging Light heals the two lowest allies (50% each) instead of one. | `d01_hollow_barrow` final boss (on **Challenge** it drops the level-60 version) |

### Souls (new)
A soul sits in a **Soul socket** (page 08) and adds a behaviour. Requirement: **class Cleric** (greyed out on
another class).

| id | Name | Socket | Effect | Source |
|---|---|---|---|---|
| `soul_overflowing_font` | The Overflowing Font | weapon | **Kindled Prayer spills.** Overheal from Kindled Prayer above 10% of the target's max health splashes to the lowest-health other ally within 12 m as a heal of the same amount (this splash can itself overheal and fill Devotion). | `d11_saltdeep_cathedral` final boss, 3% Normal / 8% Challenge |
| `soul_sun_at_your_back` | The Sun at Your Back | jewellery (necklace or ring) | **Scourging Light blesses.** Each Scourging Light hit also gives the ally it heals **+8% damage for 6 s** (stacks twice); if that ally is already at full health it gets **+15%** for 6 s instead of the heal. | quest reward from `q_calling_cleric_3` (first completion), or 1-in-400 from any rare monster level 40+ |

---

## 10. Voice and barks

- Timbre: `shared/voices.js` role `cleric` (pitch 0.55, tone 0.70, rough 0 — bright and clear).
- Lingo tag `class:cleric`; lines are calm, even in a crisis.

| Moment | Lines |
|---|---|
| Kindled Prayer | "Be whole." · "There." |
| Wreath of Dawn | "Gather close!" · "Light for everyone." |
| Scourging Light | "Begone." · "Back to the dark." |
| Sanctuary Seal | "They can't see you." · "Sanctuary!" |
| Lifeline | "Hold on to me." |
| Dawn's Absolution | "Morning comes!" |
| Raise | "Not yet. Up." |
| Outpouring | "Take it. All of it." |
| Blessing of Zeal | "Strike true, all of you!" |
| Keeping Vigil catches someone | "I've got you. Step out." |
| Low health | "The healer needs healing!" |
| Out of mana | "My cup is dry!" |

---

## 11. Reuse notes

| Borrowed | From | Used for |
|---|---|---|
| Timbre `cleric` | `shared/voices.js` | voice |
| Look (white hood, trim robe with red, shoulder cape, prayer ribbons, `fh_mace`) | `avatar-3d/data/class-outfits.json` `classes.cleric` | default outfit |
| Reliquary / focus off hands | `prototypes/farhold/js/foci.js` | off hand; the vigil set's reliquary |
| Clips `castStaff`, `castPoint`, `channel`, `pray`, `kneel` | `avatar-3d/js/chibi2-motion.js` | spells, Raise |
| spellfx `heal`, `revive`, `pillar`, `ring`, `arc`, `STATUS_FX.barrier` | `avatar-3d/js/spellfx.js` | every spell |
| Visual ideas of Farhold `mend`, `renew`, `consecrate`, `judgement` | `prototypes/farhold/data/skills.json` | effects only — ids/names/numbers new |
| `heal`, `smite`, `sanctuary` | `prototypes/emberveil/data/skills.json` | design ancestry (Resurrect's "immune until their next action" idea is dropped: revived players get page 05's normal revive grace) |
| Sound ids | `sfx/data/catalog.json` | as listed |
| Talent engine | `prototypes/farhold/js/skilltalents.js`; new mod keys `devotion`, `untargetable`, `tether` | talent cards |
