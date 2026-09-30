# Tactician (`tactician`)

> Class file for [page 06](../06-CLASSES.md). Canon: [page 00](../00-OVERVIEW.md) §6 row 19.
> Status: v0.1 draft, 2026-09-29. Nothing is built.

**How to read the numbers on this page** (the formulas themselves belong to [page 05](../05-COMBAT.md)):

- **WD** = weapon damage: one swing of the equipped main-hand weapon, before armour. "150% WD" is one and a half swings.
- **Focus**: a pool of **100** that refills **10 a second**, in or out of combat (canon §6: small pool, fast regen).
- **GCD** (global cooldown, the short lock after any spell so two spells cannot fire on the same frame): **1.0 s**, lowered by haste to a floor of 0.75 s. Page 05 owns it.
- "Group" = the 5-player party. "Raid group" = the 5 players a raid member is sorted into on the raid frame (page 15).
- Every area pays full damage in its middle and less at the rim, exactly as Farhold does (reuse: `prototypes/farhold/js/actors.js` `strikeArea`). The radius printed is the radius that is hit at all.
- A melee shape reaches its printed distance **or** as far as the weapon swings, whichever is longer (reuse: Farhold's `describeSkill` rule in `js/skills.js`).

---

## 1. Identity

| | |
|---|---|
| Fantasy | A field commander who wins by making everyone else better: a coat, a tricorn, a sword, a map, and a voice that carries over a battle. |
| Role | **Support** (fills a Damage slot in the group finder, canon §4). No second role. |
| Armour | Medium |
| Weapons | Main hand: **sword**, **sceptre** (reuse: `js/weapons.js` `sword`, `scepter` patterns). Off hand: **shield**, or a **field map** (new off-hand focus, see §9 and the canon change requests). |
| Primary attribute | INT (reuse: Farhold `data/classes.json` `primaryAttr`) — it scales Order and Plan strength (§2.4). |
| Resource | **Focus** + the class gauge **Initiative** (0–5 pips). |
| Companion | A **Signal Runner** (new follower, `fol_signal_runner`) from the level-6 calling quest — a light skirmisher with a horn who carries orders. It takes a follower slot like any hired mercenary. |

**Playstyle in three sentences.** The tactician hits hard enough to hold its own, but its real damage is the
damage it makes other people do: it exposes targets, flanks them, and points the whole group (players and
followers) at the right thing. It builds **Initiative** by fighting well and spends it on **Orders** that
buff an ally or steer every follower on the field. At 20 it picks a **Battle Plan** for the fight, and at 40
it can **execute** that plan for a burst that the whole group feels.

---

## 2. Class mechanic — Orders, Initiative and Battle Plans

### 2.1 Initiative (the gauge)

| Rule | Value |
|---|---|
| Pips | 3 at level 1 · **4** after `q_calling_tactician_1` (level 6) · **5** after `q_calling_tactician_2` (level 20) |
| Gain in combat | +1 every **6 s**; +1 when **Probing Cut** or **Outflank** hits; +1 when a unit you gave an order to lands a killing blow (max 1 per second) |
| Out of combat | Decays to **1** pip, one pip every 4 s, starting 10 s after combat ends |
| Spent by | Orders (1–3 pips each), **Decisive Hour** (all pips) |

**Gauge UI** (new HUD element, `hud_class_gauge` — add to page 03): five brass pips in a short arc
above the skill bar. A filled pip is gold, an empty one is dark bronze, and the pip that is filling shows a
clockwise sweep over its 6 s. When the gauge is full it pulses once and a drum tap plays (sfx id
`ui_tactician_full`, new). The chosen Battle Plan (from level 20) sits as a small pennant to the left of
the arc; hovering it shows the plan's card.

### 2.2 Orders — the alternate bar

Hold the **Command key** — **`G`**, the second class key held as a layer ([page 02](../02-CONTROLS.md) §5.16) — and the six spell slots
**turn over** to show Orders (the icons flip like cards, 0.12 s). Press 1–5 to give that order, release
`G` to get the spells back. Orders are on the **GCD** but have no cooldown of their own; pips are the limit.

**Who receives an order** (the same rule for every order):

1. The **ally under the crosshair** (a player or a follower, 35 m, line of sight), else
2. **All your own followers** (every body in your follower book, reuse: `js/followers.js`), else nothing.
3. With **Shift** held as well: every follower *and* every group member within 30 m. This costs **+1 pip**.

**Orders never move a player.** A player who is ordered gets the buff only, plus a short banner at the top
of their screen with the order's name and your character's name ("Forward! — Marcus"). Movement parts of an
order apply to followers only. This is a hard rule: nobody loses control of their character to another player.

| Key | id | Order | Pips | Effect on a player / follower (numbers are at level 1 and grow with INT, §2.4) | Extra, followers only |
|---|---|---|---|---|---|
| 1 | `tactician_order_forward` | **Forward!** | 1 | +20% move speed and the next hit within 6 s deals +40% damage | Followers run to your crosshair point, then attack the nearest enemy |
| 2 | `tactician_order_hold` | **Hold Fast** | 1 | Takes 20% less damage and cannot be knocked back or pulled for 6 s | Followers stop, face out and guard the spot (reuse: Farhold `ORDERS.guard`, `js/command.js`) |
| 3 | `tactician_order_mark` | **On My Mark** | 1 | Aim at an **enemy** instead: it is **Designated** (new status) for 10 s — it takes +8% damage from your group and a red chalk arrow floats over it for everyone | Every follower switches to it at once and ignores other threats |
| 4 | `tactician_order_fall_back` | **Fall Back** | 1 | +50% move speed for 3 s and the target's threat on every enemy drops by 50% | Followers disengage and run to you, or to your **Muster Point** if one is down |
| 5 | `tactician_order_all_in` | **All In** *(from level 40, calling 3)* | 3 | Players: their next spell within 5 s costs no resource | Followers use their strongest ability now; follower ability cooldowns reset |

Orders are **(new)**. The follower half is built on Farhold's Command Rod (reuse: `js/command.js` —
`ORDERS` work/haul/guard/move, the two-click "pick, then say where" pattern), rebuilt for combat: the
Command key replaces the rod, and the targets are follower bodies and party members instead of colonists.

### 2.3 Battle Plans (from the level-20 calling quest)

A **Battle Plan** is a party aura the tactician chooses with the **Battle Plan picker** on **`Q`**, the class key
([page 02](../02-CONTROLS.md) §5.16). One plan at a time. Changing plan: free out of
combat; in combat it has a **20 s** lockout. The plan pennant on the gauge shows which. The aura reaches
**20 m** and affects the group (5) or, in a raid, up to **10 allies** (your raid group first, then nearest).

| id | Plan | Aura | How it changes your Orders |
|---|---|---|---|
| `tactician_plan_vanguard` | **Vanguard** | +6% damage | **Forward!** also grants +10% critical chance for its 6 s |
| `tactician_plan_stonewall` | **Stonewall** | 6% less damage taken | **Hold Fast** also grants a barrier of 8% of max health for 6 s |
| `tactician_plan_envelopment` | **Envelopment** | +10% damage against enemies hit from the side or behind (more than 90° from where they face) | **On My Mark** also Snares the target: 40% slower for 3 s |

**Stacking:** two tacticians running the **same** plan: only one aura counts (the stronger). Two
tacticians on **different** plans: both count. Plan auras are "group buffs" under page 05's group-buff
cap (proposed +30% total damage from group buffs, see canon change requests).

### 2.4 How Order strength grows

Every percentage in the Orders table and the plan table is multiplied by `1 + INT / 400` (so 100 INT =
×1.25). Durations do not grow. This keeps orders relevant at 60 without new spells.

### 2.5 The three calling quests (canon: levels 6, 20, 40)

| Level | Quest id (page 14 owns the text) | Given by | What you do | What it grants |
|---|---|---|---|---|
| 6 | `q_calling_tactician_1` "The First Command" | `npc_marshal_ostwald`, Brightwater barracks | Lead 3 hired militia (temporary followers) through the Hearthvale bandit camp; order **Hold Fast** at the ford, **On My Mark** on the bandit chief | **Orders bar** (orders 1–4), Initiative max 4, the **Signal Runner** companion |
| 20 | `q_calling_tactician_2` "The War Table" | Marshal Ostwald, Highcourt war room | Win a staged skirmish on the Highcourt training field three times, once with each plan | **Battle Plans** (all three), Initiative max 5, **+1 follower slot** for the tactician only |
| 40 | `q_calling_tactician_3` "Grand Strategy" | Marshal Ostwald, Rimehold | Hold the Rimehold wall against three waves using only followers and Orders (you may not deal more than 25% of the damage) | **All In** (order 5) and **Execute the Plan** (below) |

**Execute the Plan** (calling 3 rule): if you spend **5 pips within 10 s**, your Battle Plan's aura is
**doubled for 8 s** (Vanguard +12%, and so on). A gold ring pulses outward from you and every ally in the
aura hears one drum hit. Internal cooldown **60 s**.

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Range | Shape | Main effect |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `tactician_probing_cut` | Probing Cut | 20 Focus | 5 s | instant | melee 3.2 m | 70° arc | 150% WD, Exposed, +1 pip |
| 2 | 4 | `tactician_muster_point` | Muster Point | 30 Focus | 24 s | instant | 30 m | ground circle 6 m | Allies inside: 10% less damage, heal 1.5%/s, 10 s |
| 3 | 10 | `tactician_outflank` | Outflank | 35 Focus | 14 s | instant dash | 10 m | dash to flank | 180% WD, Outflanked 8 s, +1 pip |
| 4 | 18 | `tactician_redeploy` | Redeploy | 25 Focus | 30 s | instant | 30 m | ally | Swap places, ally Braced 3 s |
| 5 | 28 | `tactician_double_time` | Double-Time Drill | 40 Focus | 60 s | instant | self | 20 m aura | +10% attack/cast speed, cooldowns 15% faster, 12 s |
| 6 | 40 | `tactician_decisive_hour` | Decisive Hour | all pips (min 3) | 180 s | 1.0 s cast | self | 30 m | +15% damage and healing, 8 s + 2 s per extra pip |

### 3.2 The spells in full

**`tactician_probing_cut` — Probing Cut** · slot 1 · level 1
- **Cost** 20 Focus · **Cooldown** 5 s · **Cast** instant · **Range** melee, 3.2 m · **Shape** 70° arc in front.
- **Effect** 150% WD to everything in the arc. The first enemy hit is **Exposed** (new status) for 6 s: the
  next hit it takes from **anyone other than you** deals +25% and removes Exposed. (The name stays: 00 §10 keeps
  **Exposed** for the tactician; the shadow dancer's debuff is **Unveiled**, the witch hunter's **Silver-Branded** — **Resolved (00 §10)**.)
- Grants **+1 Initiative** if it hits anything.
- **Looks like**: a quick diagonal slash (spellfx `physical` impact) and a gold chalk **X** decal on the
  Exposed target's chest (spellfx status `marked` sprite, recoloured gold `#d8b040`).
- **Sound**: a blade scrape and a short quill scratch.

**`tactician_muster_point` — Muster Point** · slot 2 · level 4
- **Cost** 30 Focus · **Cooldown** 24 s · **Cast** instant · **Range** 30 m · **Shape** ground circle, 6 m radius, lasts **10 s**.
- **Effect** allies standing inside take **10% less damage** and heal **1.5% of their max health a second**.
  Only one Muster Point per tactician. It is the destination for **Fall Back** (followers run to it).
- **Looks like**: a planted map pin with a small pennant; a thin gold ring on the ground (spellfx `ring`,
  holy colour) that ticks down clockwise.
- **Sound**: two rising horn notes; a soft pennant flap loop while it stands.

**`tactician_outflank` — Outflank** · slot 3 · level 10
- **Cost** 35 Focus · **Cooldown** 14 s · **Cast** instant dash · **Range** 10 m to an enemy · **Shape** you curve around the target and stop at its side (90° from where it faces).
- **Effect** 180% WD on arrival to the target and 60% WD to anything within 2 m of your path. The target
  is **Outflanked** (new status) for 8 s: hits on it from the side or behind deal **+20%**, and it cannot turn
  faster than 90° a second (non-boss enemies only; bosses ignore the turn limit, keep the +20%).
- If you have a follower, your **nearest follower** runs to the opposite side of the target.
- Grants **+1 Initiative** if it hits.
- **Looks like**: a curved gold dash trail (spellfx `physical` projectile shape `arrow` bent along the arc),
  two chevrons on the ground either side of the target.
- **Sound**: boots on gravel, a coat snap, then the hit.

**`tactician_redeploy` — Redeploy** · slot 4 · level 18
- **Cost** 25 Focus · **Cooldown** 30 s · **Cast** instant · **Range** 30 m, line of sight · **Shape** one ally (player or follower).
- **Effect** you and the ally **swap places**. The ally is **Braced** (new status) for 3 s: 30% less damage
  taken, cannot be knocked back. Your threat is not moved.
- **Limits (boss rules)**: refused if the ally is **Rooted, Tethered or held by a boss mechanic**, if either
  spot is behind an arena barrier, or if the ally is inside a **Soak** that is resolving in the next 0.5 s
  (the soak's count is taken from positions at 0.5 s before it lands; page 11 owns that timing). A refused
  cast costs nothing and says why in the error line: "Cannot redeploy — Tethered."
- **Looks like**: two short gold streaks crossing (spellfx `projectile` physical, ms 180) and a map-pin
  flash at each end.
- **Sound**: a whistle blast and two whooshes.

**`tactician_double_time` — Double-Time Drill** · slot 5 · level 28
- **Cost** 40 Focus · **Cooldown** 60 s · **Cast** instant · **Range** self · **Shape** 20 m aura around you for **12 s** (the aura moves with you).
- **Effect** allies in the aura gain **Drilled** (new status): **+10% attack and cast speed**, and all their
  cooldowns recover **15% faster**. Followers gain the same.
- **Group**: every member in 20 m. **Raid**: up to **10 allies** (your raid group first, then the nearest).
- **Stacking**: does not stack with another tactician's Double-Time Drill. It **is a haste buff**: with the
  chronomancer's **Borrowed Minutes** and any other haste, the total is capped at page 05's haste cap
  (proposed +30%).
- **Looks like**: a marching-drum rhythm shown as gold pulses rolling out from you every 1 s (spellfx
  `ring`, r1 20, life 0.5); allies carry the `haste` status aura in gold.
- **Sound**: a snare drum cadence, four beats a second, that fades under the music after 2 s.

**`tactician_decisive_hour` — Decisive Hour** · slot 6 · level 40
- **Cost** all Initiative pips (needs at least 3) · **Cooldown** 180 s · **Cast** 1.0 s (you can move at 50%) · **Range** self, 30 m · **Shape** every ally within 30 m.
- **Effect** allies gain **Seized the Hour** (new status) for **8 s + 2 s for each pip over 3** (5 pips = 12 s):
  **+15% damage and healing done**. Followers get **+40% damage** instead and use an ability at once.
  Every hit **you** land during it adds 0.5 s to everyone's duration, to a maximum of +6 s.
- **Group**: all 5. **Raid**: up to **10 allies**, same order as Double-Time Drill. Does not stack with another
  tactician's Decisive Hour (the later cast refreshes the duration only if it is longer).
- **Looks like**: a column of gold light on you (spellfx `pillar`, holy, radius 3) and a map unrolling
  across the ground under the group (a new ground decal, `fx_war_map`, 30 m).
- **Sound**: a long war-horn call over three war-drum hits; allies hear your voice line (§8).

### 3.3 Rotation — how it plays

**Solo (open world, with followers).** Followers are the damage; you are the director. Open with
**Probing Cut** (+1 pip, Exposed) so the first follower hit lands +25%. **On My Mark** the dangerous enemy
in a pack, **Outflank** it (+1 pip, Outflanked, your nearest follower goes round the other side). Keep
**Muster Point** down where you want to fight and **Fall Back** to it if a follower is losing. With 5 pips
and Decisive Hour down, spend pips freely — Execute the Plan (from 40) is worth more than holding pips.

**Dungeon (5 players).** Before the pull: Plan (Vanguard for most packs, Stonewall for a hard pull).
On the pull: **Probing Cut** the tank's target, **Double-Time Drill** at once (it is 60 s and the pull is the
highest-damage moment), **Forward!** on the top damage dealer. During the fight: **On My Mark** the kill
target, **Hold Fast** on the tank ahead of big hits, **Fall Back** on whoever pulled threat. Save
**Redeploy** to rescue someone standing in a Danger zone who cannot get out.

**Raid (10/20).** You are one of the few who can move a player (**Redeploy**) and the only class that
shortens *other people's* cooldowns (**Double-Time Drill**). Line up **Decisive Hour + Double-Time Drill** with the boss's
"burn" phase (a phase where the boss takes extra damage). Put **Muster Point** on the raid's stacking spot
before a room-wide hit. Assign your **Hold Fast** orders to the tank taking the tank-swap debuff.

### 3.4 What the tactician gives a group and a raid

| Gives | 5-player group | 20-player raid | Stacks with |
|---|---|---|---|
| Battle Plan aura | +6% damage **or** 6% less damage taken **or** +10% flank damage — whole group | up to 10 allies | a different plan from another tactician; never the same plan twice |
| Double-Time Drill | +10% haste, cooldowns 15% faster, 12 s every 60 s | up to 10 allies | nothing of the same name; capped by the haste cap |
| Decisive Hour | +15% damage/healing, 8–12 s every 180 s | up to 10 allies | other classes' raid cooldowns, to the group-buff cap |
| Orders | 1 targeted buff per pip (≈ one every 6 s) | same | Designated (+8%) does not stack with another Designated |
| Exposed / Outflanked | +25% on one hit / +20% from sides | same | with any other debuff |
| Redeploy | one rescue every 30 s | same | — |

### 3.5 Boss mechanics

| Mechanic (page 11 words) | What the tactician does |
|---|---|
| **Soak** | **Muster Point** on the soak shows everyone where to stand; **Hold Fast** on a soaker cuts their share 20%. |
| **Danger zone** | **Redeploy** pulls a stuck ally out (you take their spot — only use it if you can get out yourself). |
| **Void zone** | **Fall Back** sends followers out of a void zone instantly (followers do not path around void zones on their own well). |
| **Targeted** (yellow) | **Redeploy** a targeted player out of the pack when they are rooted by something that is *not* a boss mechanic. |
| **Tank swap** | **Hold Fast** on the incoming tank; **Fall Back** on the outgoing tank drops their threat 50%, which makes the swap cleaner. |
| **Adds** | **On My Mark** keeps every follower on the add the group must kill. |
| **Interrupts** | The tactician has **no interrupt**. Its answer is **Forward!** on the group's interrupter. |
| **Immunities** | Bosses ignore Outflanked's turn limit and Probing Cut's Exposed is capped at +10% on raid bosses (page 05 boss rules). |

---

## 4. Alternate spells

The **Orders bar** (§2.2) is the tactician's alternate bar: orders 1–4 from level 6, order 5 from level 40.
The **Battle Plans** (§2.3) are a picker, not spells, and live on the gauge pennant.

---

## 5. Talents

Tiers open at levels **12, 22, 32, 45** (canon). A spell whose slot opens later than a tier gets that tier
when the spell unlocks (the level-40 spell opens tiers 1–3 at 40 at once). One pick per tier per spell;
changing a pick costs gold at the Unbinder (reuse: Farhold `js/retrain.js`). Ids follow
`<spellid>_t<tier><a|b|c>`.

**Probing Cut** (`tactician_probing_cut`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Feint** — the cut hits nothing; instead the target turns to face you for 1.5 s (non-boss), letting others hit its back | **Two Probes** — hits twice at 80% each; the second hit can Expose a second enemy | **Weak Point** — Exposed also lowers the target's armour 15% for its 6 s |
| 2 (22) | **Lasting Opening** — Exposed is consumed by the next **3** hits, each +12% instead of one at +25% | **Called Opening** — a follower that consumes Exposed gains +1 Initiative for you | — |
| 3 (32) | **Riposte Cut** — if the target attacks you within 2 s, you counter automatically for 120% WD | **Thrown Blade** — becomes a 12 m thrown sceptre/sword strike (bolt) that returns to your hand | **Read the Field** — also reveals the target's next ability as a timeline marker on its cast bar for 6 s |
| 4 (45) | **Crack the Line** — the arc widens to 140° and Exposes every enemy it hits | **Masterful Probe** — resets Outflank's cooldown if it Exposes a Designated target | — |

**Muster Point** (`tactician_muster_point`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Rolling Muster** — the circle follows the ally you cast it on instead of staying on the ground | **Caltrops** — enemies entering the circle are Snared 40% for 2 s | — |
| 2 (22) | **Supply Cache** — allies inside regain 3 of their resource a second (Focus/Fury/2% Mana) instead of healing | **Last Stand** — an ally who drops below 20% health inside it gets a barrier of 15% max health (once per ally per cast) | **Signal Fire** — the circle burns enemies inside for 25% WD a second as fire |
| 3 (32) | **Two Camps** — 2 charges; two points can stand at once | **Rally Horn** — casting it removes one Snare, Slow or Root from every ally within 20 m of the point | — |
| 4 (45) | **Hold the Ground** — allies inside cannot be knocked back or pulled by non-mechanic effects | **Muster Relay** — an ally who steps into one Muster Point can **blink to your other one** once per 10 s (needs Two Camps or the legendary map) | **Fortified Camp** — 15% less damage inside instead of 10%, and the point lasts 16 s |

**Outflank** (`tactician_outflank`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Double Envelopment** — you arrive between **two** enemies and both are Outflanked | **Hamstring Pass** — the dash Snares everything on the path 50% for 3 s | — |
| 2 (22) | **Hammer and Anvil** — if your follower reaches the other side within 2 s, both you and it strike again for 100% WD | **Encircle** — Outflanked also means the target counts as "from behind" for every attack, whatever the angle | **Scout Ahead** — can be cast on a spot (no enemy): a 10 m reposition that leaves a 4 s decoy that enemies attack |
| 3 (32) | **Rolling Flank** — 2 charges | **Breach** — Outflanked targets take their armour's worth of damage as a 60% WD armour-piercing hit when Outflanked ends | — |
| 4 (45) | **Outflank Order** — every follower and group member within 20 m gets a free **Forward!** on arrival (0 pips) | **Cut Off Retreat** — the target cannot leave a 6 m circle around where you struck it for 4 s (non-boss) | — |

**Redeploy** (`tactician_redeploy`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Pull Back** — instead of swapping, the ally is carried to **your side**; you stay put | **Push Forward** — you are carried to the ally's side; the ally stays | — |
| 2 (22) | **Covering Swap** — you are Braced too | **Threat Handoff** — the ally's threat on every enemy is moved to you (a way to rescue a healer who pulled aggro) | **Relief** — the ally is cleansed of one harmful status |
| 3 (32) | **Chain of Command** — 2 charges, 30 s each | **Long Reach** — range 45 m | — |
| 4 (45) | **Field Promotion** — the ally's next spell after the swap costs no resource | **Swap the Enemy** — may target a **non-boss enemy**: swap places with it (pulls an add off a healer) | — |

**Double-Time Drill** (`tactician_double_time`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12 → 28) | **Quick March** — also +15% move speed | **Steady Rhythm** — also 5% less damage taken | — |
| 2 (22 → 28) | **Field Drum** — the aura stays where you cast it (a 20 m circle) instead of moving with you, and lasts 18 s | **Forced Pace** — 6 s long, but +20% haste and cooldowns 30% faster | — |
| 3 (32) | **Reload Drill** — allies' **resource** refills 25% faster during it | **Echoing Drill** — when it ends, it comes back for 4 s at half strength | **Drilled Orders** — each Order you give during it costs no pips (max 3) |
| 4 (45) | **Grand Parade** — raid: affects up to **15** allies instead of 10 | **Drumline** — every ally in the aura gains +1 Initiative-style "beat": their next spell within 12 s is on no GCD | — |

**Decisive Hour** (`tactician_decisive_hour`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12 → 40) | **Commit Everything** — costs all pips **and** all Focus; +3% more for every 20 Focus spent | **Measured Hour** — needs only 1 pip; lasts 6 s flat | — |
| 2 (22 → 40) | **Hour of Steel** — also 15% less damage taken | **Hour of Blades** — critical hits during it add 1 s (instead of your hits adding 0.5 s) | — |
| 3 (32 → 40) | **Orders Carry** — every group member gets a free **Forward!** at the start | **Standard Bearer** — followers gain +80% damage instead of +40% | **Clear the Board** — the cast removes one Snare, Root or Slow from each ally |
| 4 (45) | **Victory Plan** — when it ends, Battle Plan is Executed for 8 s (ignores the 5-pip rule) | **Second Wave** — if a boss or elite dies during it, Decisive Hour's cooldown is cut to 60 s | — |

---

## 6. Class sets

| Set id | Name | Pieces (6) | Where from |
|---|---|---|---|
| `set_tactician_field_marshal` | **Field Marshal's Regalia** | `it_field_marshal_tricorn`, `it_field_marshal_epaulettes`, `it_field_marshal_greatcoat`, `it_field_marshal_gauntlets`, `it_field_marshal_breeches`, `it_field_marshal_boots` | Level 32–45: bosses of `d09_warmasters_pit`, `d10_rimefang_caverns`, `d11_saltdeep_cathedral` (one piece per boss, class-weighted). Heroic/Mythic+ copies at 60. |
| `set_tactician_war_table` | **Regalia of the War Table** | `it_war_table_crown`, `it_war_table_mantle`, `it_war_table_coat`, `it_war_table_grips`, `it_war_table_legguards`, `it_war_table_marchers` | Level 60: `r04_ember_court` (Normal and Mythic), all bosses; the coat only from the final boss, `b_ember_king_kaedros` Kaedros, the Ember King |

**Field Marshal's Regalia**
- **2 pieces** — Probing Cut's Exposed is consumed by up to **2** hits, each +25%.
- **4 pieces** — once every 10 s, an Order costs 1 pip less (minimum 0).
- **6 pieces** — Decisive Hour's cooldown is **120 s**, and each Order given during it refunds its pips.

**Regalia of the War Table**
- **2 pieces** — Double-Time Drill also grants +8% move speed.
- **4 pieces** — Outflank's cooldown resets when a Outflanked target dies.
- **6 pieces** — while Initiative is full, your Battle Plan aura is **+50% stronger** (Vanguard +9%).

---

## 7. Class legendaries and uniques

| id | Name | Slot | Power (named) | Drop source |
|---|---|---|---|---|
| `leg_baton_of_the_last_command` | Baton of the Last Command | main hand, sceptre | **Leads From the Front** — every Order you give also applies to **you** at 50% strength | `b_queen_ysmere` Queen Ysmere of the Glacier Throne (`r02_glacier_throne` end boss, page 13) |
| `leg_ever_unfolding_map` | The Ever-Unfolding Map | off hand, field map | **Two Camps, One Road** — Muster Point has 2 charges; an ally stepping into one point may blink to the other (once per 10 s per ally) | `b_oddrin_the_unmaker` Vell Oddrin, the Unmaker (`d12_unmade_workshop` end boss, page 12) |
| `leg_forced_march_sabatons` | Sabatons of the Forced March | feet | **Forced March** — Outflank leaves a 10 m trail for 4 s: allies on it +30% move speed; Forward! lasts 12 s instead of 6 | `b_carrion_crown` The Carrion Crown (`cinder_steppe` world boss, page 13) |
| `leg_signet_of_seven_armies` | Signet of Seven Armies | ring | **Seven Banners** — +1 follower slot; your followers take 25% less area damage; On My Mark makes each follower's next hit a critical | `b_castellan_brandt` Lord Castellan Aurel Brandt (`r04_ember_court` boss 5, page 13) |
| `uq_quartermasters_coat` | The Quartermaster's Coat | chest | **Stores Opened** — while you stand in your Muster Point you regain 10 Focus a second | `b_razorback_rider_krunn` Round Two: Krunn and Razorback (`d09_warmasters_pit` main boss) |
| `uq_drillmasters_whistle` | Drillmaster's Whistle | neck | **Sharp Blast** — Initiative fills every **5 s** instead of 6 | `b_oruvel_moon_drinker` Oruvel, That Which Drank the Moon (`d08_moonwell_ruins` end boss) |
| `uq_turncoat_spur` | The Turncoat's Spur | feet | **Wrong Side of the Line** — Redeploy may target a non-boss enemy (swap places with it); 45 s cooldown when used that way | `d06_sandsworn_vault`, rare elite in the vault's side hall |

All five follow page 08's legendary/unique model; page 09 lists them in its catalogue.

---

## 8. Voice and barks

**Voice**: reuse `shared/voices.js` `tactician` timbre (pitch 0.42, depth 0.6, tone 0.55, breath 0.15,
rough 0.1, speed 0.5, jitter 0.06) — a steady, clipped mid voice. Lines go through Lingo so traits colour them.

| When | Lines (Lingo picks one, no repeat inside ~20 fights) |
|---|---|
| Order: Forward! | "Forward!" · "Press them!" · "Now — go!" |
| Order: Hold Fast | "Hold the line." · "Stand firm." · "Not one step back." |
| Order: On My Mark | "That one. Mark it." · "All of you — there." · "Focus!" |
| Order: Fall Back | "Fall back to me!" · "Pull out, now." · "Regroup!" |
| Decisive Hour | "This is the hour. Everything we have!" · "Now we win it." |
| Critical hit | "As planned." · "Textbook." |
| Low health (under 25%) | "I need cover!" · "Command is under fire!" |
| Follower dies | "Man down — adjust!" · "We lost one. Close the gap." |
| Plan chosen | "Vanguard. We hit first." · "Stonewall. Let them come." · "Envelopment. Around them." |

---

## 9. Reuse notes

- **Looks**: `avatar-3d/data/class-outfits.json` `tactician` (tricorn, coat, breeches, shoulder cape, scroll
  case, sword + map in the portrait). The map needs a real off-hand item (`it_field_map`, a focus in the
  sense of Farhold's `js/foci.js` — armour, never swings) — see canon change requests.
- **Visual borrowing** (effects only; every spell above is new): Probing Cut borrows `power_strike`'s swing,
  Outflank borrows `charge`'s dash, Muster Point borrows `rally`'s gold `arrow_up` aura, Decisive Hour borrows
  the `pillar` effect that `judgement` uses. All spellfx elements used: `physical`, `holy`.
- **Emberveil's tactician** (`prototypes/emberveil/data/skills.json`: `rally_action`, `feint`, `reposition`,
  `masterstroke`) was a turn-order class. Its ideas survive as: extra action → Orders; Feint → Probing Cut
  tier 1a; Reposition → Redeploy; Masterstroke → Decisive Hour. Names changed so no id is shared.
- **Followers**: Orders drive bodies from `js/pets.js` through the follower book (`js/followers.js`); the
  follower share cap (0.75 of your own top swing) is unchanged, so Orders cannot make a follower out-damage you.
- Farhold's tactician kit (`sunder`, `shield_bash`, `rally`, `warcry`, `charge`, `execute`) is **dropped** —
  those were borrowed skills and canon forbids sharing.
