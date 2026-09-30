# Tactician (`tactician`)

> Class file for [page 06](../06-CLASSES.md). Canon: [page 00](../00-OVERVIEW.md) §6 row 19.
> Status: v0.2 draft — 2026-09-30 (round 2 applied). Nothing is built.

**How to read the numbers on this page** (the formulas themselves belong to [page 05](../05-COMBAT.md)):

- **WD** = weapon damage: one shot of the equipped crossbow, or one throw of the equipped spear, before armour. "150% WD" is one and a half shots.
- **Tempo** ([page 06](../06-CLASSES.md) §Resources owns it): a pool of **100** that starts full and refills **25 a second**, in or out of combat (a full bar in 4 s), × (1 + haste). Tactician spells cost 25–60. A spell on every global cooldown that costs more than about 25 on average runs you dry.
- **GCD** (global cooldown, the short lock after any spell so two spells cannot fire on the same frame): **1.0 s**, lowered by haste to a floor of 0.75 s. Page 05 owns it.
- "Group" = the party of up to 5 players and followers.
- Every area pays full damage in its middle and less at the rim, exactly as Farhold does (reuse: `prototypes/farhold/js/actors.js` `strikeArea`). The radius printed is the radius that is hit at all.
- **Targeting kinds** (00 §12.1 W8): **Needs target** will not cast without a valid target; **Auto-target** uses your target, or if you have none picks the valid enemy nearest your aim point within range; **Ground** is placed at the aim point; **Self** is centred on you; **Ally** uses your target if it is friendly (`F1` = yourself, `F2`–`F5` = party members, or click a follower), otherwise yourself.

---

## 1. Identity

| | |
|---|---|
| Fantasy | A field commander who wins by making everyone else better: a coat, a tricorn, a crossbow or a spear, a map, and a voice that carries over a battle. |
| Primary role | **Support** (fills a Damage slot in the Dungeon Finder, canon §4). |
| Hybrid role | **Tank** — holds the field around a planted **Field Standard**, with shield-wall orders (§5). |
| Build | **Ranged**: a **crossbow** (two-handed, 30 m), or a **spear** with a shield — the spear stabs at 4.5 m reach for basic attacks, and every tactician spell *throws* it (25 m; it returns to the hand 0.6 s later). |
| Armour | Medium |
| Weapons | Main hand: **crossbow** or **spear** (reuse: Farhold `js/weapons.js` `crossbow`, `spear` patterns). Off hand with a spear: **shield** or a **field map** (an off-hand focus: armour that never swings, reuse: Farhold `js/foci.js`). A crossbow takes both hands; its off hand is a **quiver** (page 08). |
| Primary attribute | INT (reuse: Farhold `data/classes.json` `primaryAttr`) — it scales Order and Plan strength (§2.4). DEX scales weapon damage as for every ranged weapon. |
| Resource | **Tempo** + the class gauge **Initiative** (0–5 pips). |
| Companion | A **Signal Runner** (follower, `fol_signal_runner`) from the level-6 calling quest — a light skirmisher with a horn who carries orders. It takes a follower slot like any hired mercenary. |

**Playstyle in three sentences.** The tactician shoots hard enough to hold its own, but its real damage is
the damage it makes other people do: it exposes targets, flanks them, and points the whole group (players and
followers) at the right thing. It builds **Initiative** by fighting well and spends it on **Orders** that
buff an ally or steer every follower on the field. At 20 it picks a **Battle Plan** for the fight, at 40 it
can **execute** that plan for a burst the whole group feels, and in Tank focus it plants a **Field Standard**
and holds the enemy's attention around it.

---

## 2. Class mechanic — Orders, Initiative and Battle Plans

### 2.1 Initiative (the gauge)

| Rule | Value |
|---|---|
| Pips | 3 at level 1 · **4** after `q_calling_tactician_1` (level 6) · **5** after `q_calling_tactician_2` (level 20) |
| Gain in combat | +1 every **6 s**; +1 when **Probing Bolt** or **Outflank** hits; +1 when a unit you gave an order to lands a killing blow (max 1 per second) |
| Out of combat | Decays to **1** pip, one pip every 4 s, starting 10 s after combat ends |
| Spent by | Orders (1–3 pips each), **Decisive Hour** (all pips) |

**Gauge UI** (HUD element `hud_class_gauge`, page 03): five brass pips in a short arc above the skill bar.
A filled pip is gold, an empty one is dark bronze, and the pip that is filling shows a clockwise sweep over
its 6 s. When the gauge is full it pulses once and a drum tap plays (sfx id `ui_tactician_full`, new). The
chosen Battle Plan (from level 20) sits as a small pennant to the left of the arc; hovering it shows the
plan's card. In Tank focus a small standard icon sits on the right of the arc and glows while you stand
within 12 m of your Field Standard (§5).

### 2.2 Orders — the alternate bar

Hold the **second class key** — **`G`**, held as a layer ([page 02](../02-CONTROLS.md), class keys) — and
the six spell slots **turn over** to show Orders (the icons flip like cards, 0.12 s). Press 1–5 to give that
order, release `G` to get the spells back. Orders are on the **GCD** but have no cooldown of their own; pips
are the limit.

**Who receives an order** (the same rule for every order except On My Mark):

1. Your **current target, if it is friendly** — a player (`F1` yourself, `F2`–`F5` a party member, or their
   frame) or a follower (click its body or frame). 35 m, line of sight.
2. Otherwise (no target, or your target is an enemy): **all your own followers** (every body in your
   follower book, reuse: `js/followers.js`).
3. With **Shift** held as well: every follower *and* every group member within 30 m. This costs **+1 pip**.

**Orders never move a player.** A player who is ordered gets the buff only, plus a short banner at the top
of their screen with the order's name and your character's name ("Forward! — Marcus"). Movement parts of an
order apply to followers only. This is a hard rule: nobody loses control of their character to another player.

| Key | id | Order | Pips | Targeting · Tags | Effect on a player / follower (level-1 numbers, grow with INT, §2.4) | Extra, followers only |
|---|---|---|---|---|---|---|
| 1 | `tactician_order_forward` | **Forward!** | 1 | Ally · `tag_spell`, `tag_duration` | +20% move speed and the next hit within 6 s deals +40% damage | Followers run to your aim point, then attack the nearest enemy |
| 2 | `tactician_order_hold` | **Hold Fast** | 1 | Ally · `tag_spell`, `tag_duration`, `tag_shield` | Takes 20% less damage and cannot be knocked back or pulled for 6 s. In Tank focus this order becomes **Shield Wall** (§5.3) | Followers stop, face out and guard the spot (reuse: Farhold `ORDERS.guard`, `js/command.js`) |
| 3 | `tactician_order_mark` | **On My Mark** | 1 | Auto-target (an **enemy**) · `tag_spell`, `tag_duration`, `tag_curse` | The enemy is **Designated** (new status) for 10 s — it takes +8% damage from your group and a red chalk arrow floats over it for everyone | Every follower switches to it at once and ignores other threats |
| 4 | `tactician_order_fall_back` | **Fall Back** | 1 | Ally · `tag_spell`, `tag_movement` | +50% move speed for 3 s and the receiver's threat on every enemy drops by 50% | Followers disengage and run to you, or to your **Muster Point** / **Field Standard** if one is down |
| 5 | `tactician_order_all_in` | **All In** *(from level 40, calling 3)* | 3 | Ally · `tag_spell` | The receiver's next spell within 5 s costs no resource | Followers use their strongest ability now; follower ability cooldowns reset |

Orders are **(new)**. The follower half is built on Farhold's Command Rod (reuse: `js/command.js` —
`ORDERS` work/haul/guard/move, the two-click "pick, then say where" pattern), rebuilt for combat: the
second class key replaces the rod, and the targets are follower bodies and party members instead of colonists.

### 2.3 Battle Plans (from the level-20 calling quest)

A **Battle Plan** is a group aura the tactician chooses with the **Battle Plan picker** on **`Q`**, the class
key ([page 02](../02-CONTROLS.md)). One plan at a time. Changing plan: free out of combat; in combat it has a
**20 s** lockout. The plan pennant on the gauge shows which. The aura reaches **20 m** and affects every group
member and follower inside it (at most the 5 of the party, plus followers). Plans are tagged `tag_aura`.

| id | Plan | Aura (buff family, page 06) | How it changes your Orders |
|---|---|---|---|
| `tactician_plan_vanguard` | **Vanguard** | +6% damage (`group_damage`) | **Forward!** also grants +10% critical chance for its 6 s |
| `tactician_plan_stonewall` | **Stonewall** | 6% less damage taken (`group_defence`) | **Hold Fast** / **Shield Wall** also grants a barrier of 8% of max health for 6 s |
| `tactician_plan_envelopment` | **Envelopment** | +10% damage against enemies hit from the side or behind (more than 90° from where they face) (`group_damage`) | **On My Mark** also Snares the target: 40% slower for 3 s |

**Stacking:** two tacticians running the **same** plan: only one aura counts (the stronger). Two
tacticians on **different** plans: both count, subject to page 06's buff families (Vanguard and
Envelopment are both `group_damage`, so only the stronger of those two applies) and page 05's +30% cap on
group damage buffs.

### 2.4 How Order strength grows

Every percentage in the Orders table and the plan table is multiplied by `1 + INT / 400` (so 100 INT =
×1.25). Durations do not grow. This keeps orders relevant at 60 without new spells.

### 2.5 The three calling quests (canon: levels 6, 20, 40)

| Level | Quest id (page 14 owns the text) | Given by | What you do | What it grants |
|---|---|---|---|---|
| 6 | `q_calling_tactician_1` "The First Command" | `npc_marshal_ostwald`, Brightwater barracks | Lead 3 hired militia (temporary followers) through the Hearthvale bandit camp; order **Hold Fast** at the ford, **On My Mark** on the bandit chief | **Orders bar** (orders 1–4), Initiative max 4, the **Signal Runner** companion, and the **Field Standard** for Tank focus (§5) |
| 20 | `q_calling_tactician_2` "The War Table" | Marshal Ostwald, Highcourt war room | Win a staged skirmish on the Highcourt training field three times, once with each plan | **Battle Plans** (all three), Initiative max 5, **+1 follower slot** for the tactician only |
| 40 | `q_calling_tactician_3` "Grand Strategy" | Marshal Ostwald, Rimehold | Hold the Rimehold wall against three waves using only followers and Orders (you may not deal more than 25% of the damage) | **All In** (order 5) and **Execute the Plan** (below) |

**Execute the Plan** (calling 3 rule): if you spend **5 pips within 10 s**, your Battle Plan's aura is
**doubled for 8 s** (Vanguard +12%, and so on). A gold ring pulses outward from you and every ally in the
aura hears one drum hit. Internal cooldown **60 s**.

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Targeting | Range | Shape | Tags | Main effect |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `tactician_probing_bolt` | Probing Bolt | 30 Tempo | 5 s | instant | Auto-target | 30 m (spear 25 m) | target | `tag_attack` `tag_physical` `tag_ranged` `tag_projectile` | 150% WD, Exposed, +1 pip |
| 2 | 4 | `tactician_muster_point` | Muster Point | 40 Tempo | 24 s | instant | Ground | 30 m | ground circle 6 m | `tag_spell` `tag_area` `tag_duration` `tag_heal` | Allies inside: 10% less damage, heal 1.5%/s, 10 s |
| 3 | 10 | `tactician_outflank` | Outflank | 45 Tempo | 14 s | instant sidestep + shot | Auto-target | 30 m | target | `tag_attack` `tag_physical` `tag_ranged` `tag_projectile` `tag_movement` | 180% WD, Outflanked 8 s, +1 pip |
| 4 | 18 | `tactician_redeploy` | Redeploy | 30 Tempo | 30 s | instant | Needs target (ally) | 30 m | ally | `tag_spell` `tag_movement` | Swap places, ally Braced 3 s |
| 5 | 28 | `tactician_double_time` | Double-Time Drill | 60 Tempo | 60 s | instant | Self | self | 20 m aura | `tag_spell` `tag_aura` `tag_duration` | +10% attack/cast speed, cooldowns 15% faster, 12 s |
| 6 | 40 | `tactician_decisive_hour` | Decisive Hour | all pips (min 3) + 40 Tempo | 180 s | 1.0 s cast | Self | self, 30 m | every ally in 30 m | `tag_spell` `tag_aura` `tag_duration` | +15% damage and healing, 8 s + 2 s per extra pip |

### 3.2 The spells in full

**`tactician_probing_bolt` — Probing Bolt** · slot 1 · level 1 *(was Probing Cut, a melee arc)*
- **Cost** 30 Tempo · **Cooldown** 5 s · **Cast** instant · **Range** 30 m (a thrown spear: 25 m) · **Shape** one target.
- **Targeting** Auto-target · **Tags** `tag_attack`, `tag_physical`, `tag_ranged`, `tag_projectile`.
- **Effect** 150% WD. The target is **Exposed** (status) for 6 s: the next hit it takes from **anyone other
  than you** deals +25% and removes Exposed. (00 §10 keeps **Exposed** for the tactician.)
- Grants **+1 Initiative** if it hits.
- In Tank focus it also generates **×3 threat** (§5).
- **Looks like**: a bolt with a gold ribbon tail (spellfx `physical` projectile, shape `arrow`) and a gold
  chalk **X** decal on the Exposed target's chest (spellfx status `marked` sprite, recoloured gold `#d8b040`).
  A thrown spear spins once and flies back to the hand.
- **Sound**: a crossbow thunk and a short quill scratch.

**`tactician_muster_point` — Muster Point** · slot 2 · level 4
- **Cost** 40 Tempo · **Cooldown** 24 s · **Cast** instant · **Range** 30 m · **Shape** ground circle, 6 m radius, lasts **10 s**.
- **Targeting** Ground · **Tags** `tag_spell`, `tag_area`, `tag_duration`, `tag_heal`.
- **Effect** allies standing inside take **10% less damage** and heal **1.5% of their max health a second**.
  Only one Muster Point per tactician. It is the destination for **Fall Back** (followers run to it).
- In Tank focus it plants the **Field Standard** instead (§5.2).
- **Looks like**: a planted map pin with a small pennant; a thin gold ring on the ground (spellfx `ring`,
  holy colour) that ticks down clockwise.
- **Sound**: two rising horn notes; a soft pennant flap loop while it stands.

**`tactician_outflank` — Outflank** · slot 3 · level 10 *(was a melee dash; now a sidestep and a shot)*
- **Cost** 45 Tempo · **Cooldown** 14 s · **Cast** instant · **Range** 30 m to an enemy · **Shape** you sidestep up to **8 m** along a curve round the target (keeping your distance to it) until you are at its side (90° from where it faces), then shoot.
- **Targeting** Auto-target · **Tags** `tag_attack`, `tag_physical`, `tag_ranged`, `tag_projectile`, `tag_movement`.
- **Effect** 180% WD to the target. It is **Outflanked** (new status) for 8 s: hits on it from the side or
  behind deal **+20%**, and it cannot turn faster than 90° a second (non-boss enemies only; bosses ignore the
  turn limit and keep the +20%).
- If you have a follower, your **nearest follower** runs to the opposite side of the target.
- Grants **+1 Initiative** if it hits.
- **Looks like**: a curved gold streak along your sidestep (spellfx `physical`, shape `arrow` bent along the
  arc), two chevrons on the ground either side of the target, then the bolt.
- **Sound**: boots on gravel, a coat snap, the crossbow thunk.

**`tactician_redeploy` — Redeploy** · slot 4 · level 18
- **Cost** 30 Tempo · **Cooldown** 30 s · **Cast** instant · **Range** 30 m, line of sight · **Shape** one ally (player or follower).
- **Targeting** Needs target (a friendly target: `F2`–`F5`, a party frame, or a follower) · **Tags** `tag_spell`, `tag_movement`.
- **Effect** you and the ally **swap places**. The ally is **Braced** (new status) for 3 s: 30% less damage
  taken, cannot be knocked back. Your threat is not moved.
- **Limits (boss rules)**: refused if the ally is **Rooted, Tethered or held by a boss mechanic**, if either
  spot is behind an arena barrier, or if the ally is inside a **Soak** that is resolving in the next 0.5 s
  (the soak's count is taken from positions 0.5 s before it lands; page 11 owns that timing). A refused
  cast costs nothing and says why in the error line: "Cannot redeploy — Tethered."
- **Looks like**: two short gold streaks crossing (spellfx `projectile` physical, 180 ms) and a map-pin
  flash at each end.
- **Sound**: a whistle blast and two whooshes.

**`tactician_double_time` — Double-Time Drill** · slot 5 · level 28
- **Cost** 60 Tempo · **Cooldown** 60 s · **Cast** instant · **Range** self · **Shape** 20 m aura around you for **12 s** (the aura moves with you).
- **Targeting** Self · **Tags** `tag_spell`, `tag_aura`, `tag_duration`.
- **Effect** allies in the aura gain **Drilled** (new status): **+10% attack and cast speed**, and all their
  cooldowns recover **15% faster**. Followers gain the same.
- **Stacking**: does not stack with another tactician's Double-Time Drill. It **is a haste buff**: with the
  chronomancer's haste and any other haste, the total is capped at page 05's haste cap (+30%).
- **Looks like**: a marching-drum rhythm shown as gold pulses rolling out from you every 1 s (spellfx
  `ring`, r1 20, life 0.5); allies carry the `haste` status aura in gold.
- **Sound**: a snare drum cadence, four beats a second, that fades under the music after 2 s.

**`tactician_decisive_hour` — Decisive Hour** · slot 6 · level 40
- **Cost** all Initiative pips (needs at least 3) and 40 Tempo · **Cooldown** 180 s · **Cast** 1.0 s (you can move at 50%) · **Range** self, 30 m · **Shape** every ally within 30 m.
- **Targeting** Self · **Tags** `tag_spell`, `tag_aura`, `tag_duration`.
- **Effect** allies gain **Seized the Hour** (new status) for **8 s + 2 s for each pip over 3** (5 pips = 12 s):
  **+15% damage and healing done**. Followers get **+40% damage** instead and use an ability at once.
  Every hit **you** land during it adds 0.5 s to everyone's duration, to a maximum of +6 s.
- **Stacking**: does not stack with another tactician's Decisive Hour (the later cast refreshes the duration
  only if it is longer).
- **Looks like**: a column of gold light on you (spellfx `pillar`, holy, radius 3) and a map unrolling
  across the ground under the group (a new ground decal, `fx_war_map`, 30 m).
- **Sound**: a long war-horn call over three war-drum hits; allies hear your voice line (§10).

### 3.3 Rotation — how it plays

**Solo (open world, with followers).** Followers are the damage; you are the director. Open with
**Probing Bolt** (+1 pip, Exposed) so the first follower hit lands +25%. **On My Mark** the dangerous enemy
in a pack, **Outflank** it (+1 pip, Outflanked, your nearest follower goes round the other side). Keep
**Muster Point** down where you want to fight and **Fall Back** to it if a follower is losing. With 5 pips
and Decisive Hour down, spend pips freely — Execute the Plan (from 40) is worth more than holding pips.

**Dungeon, Support focus (5 players).** Before the pull: Plan (Vanguard for most packs, Stonewall for a hard
pull). On the pull: **Probing Bolt** the tank's target, **Double-Time Drill** at once (it is 60 s and the pull
is the highest-damage moment), **Forward!** on the top damage dealer (`F2`–`F5` to target them, then `G`+1).
During the fight: **On My Mark** the kill target, **Hold Fast** on the tank ahead of big hits, **Fall Back** on
whoever pulled threat. Save **Redeploy** to rescue someone standing in a Danger zone who cannot get out. Line
up **Decisive Hour + Double-Time Drill** with a boss's "burn" phase (a phase where the boss takes extra damage).

**Dungeon, Tank focus.** See §5.4.

### 3.4 What the tactician gives a group (5)

| Gives | Group of 5 | Stacks with |
|---|---|---|
| Battle Plan aura | +6% damage **or** 6% less damage taken **or** +10% flank damage — whole group | a different plan from another tactician, within buff families; never the same plan twice |
| Double-Time Drill | +10% haste, cooldowns 15% faster, 12 s every 60 s | nothing of the same name; capped by the haste cap |
| Decisive Hour | +15% damage/healing, 8–12 s every 180 s | other classes' group cooldowns, to the group-buff cap |
| Orders | 1 targeted buff per pip (about one every 6 s) | Designated (+8%) does not stack with another Designated |
| Exposed / Outflanked | +25% on one hit / +20% from sides | with any other debuff |
| Redeploy | one rescue every 30 s | — |

### 3.5 Boss mechanics

| Mechanic (page 11 words) | What the tactician does |
|---|---|
| **Soak** | **Muster Point** on the soak shows everyone where to stand; **Hold Fast** on a soaker cuts their share 20%. The Signal Runner is a follower (it takes a party slot), so it **does** count as a soaker, unlike a class companion (00 §10). |
| **Danger zone** | **Redeploy** pulls a stuck ally out (you take their spot — only use it if you can get out yourself). |
| **Void zone** | **Fall Back** sends followers out of a void zone at once (followers do not path around void zones well on their own). |
| **Targeted** (yellow) | **Redeploy** a targeted player out of the pack when they are rooted by something that is *not* a boss mechanic. |
| **Tank swap** | **Hold Fast** on the incoming tank; **Fall Back** on the outgoing tank drops their threat 50%, which makes the swap cleaner. As the tank yourself, see §5. |
| **Adds** | **On My Mark** keeps every follower on the add the group must kill. In Tank focus, the Field Standard's plant taunts up to 5 adds at once (§5.2). |
| **Interrupts** | The tactician has **no interrupt**. Its answer is **Forward!** on the group's interrupter. |
| **Immunities** | Bosses ignore Outflanked's turn limit, and Exposed is capped at +10% on bosses (page 05 boss rules). |

---

## 4. Alternate spells

The **Orders bar** (§2.2) is the tactician's alternate bar: orders 1–4 from level 6, order 5 from level 40.
The **Battle Plans** (§2.3) are a picker, not spells, and live on the gauge pennant. In Tank focus, Muster
Point becomes **Field Standard** and Hold Fast becomes **Shield Wall** (§5).

---

## 5. The hybrid role — Tank (`(new)`)

The tactician tanks by **commanding the ground it stands on**: it plants a standard, orders a shield wall,
and makes itself the thing the enemy wants to kill. It is tuned for the open world, Normal dungeons and
Depth up to about 10; in Challenge mode it is weaker than a primary tank because it has no personal
cooldown bigger than 30% less damage taken and its threat depends on standing near its standard.

### 5.1 What Tank focus turns on

Setting the canon **Role focus** switch (00 §6: in the spellbook, out of combat only, saved per Loadout; page
06 §Role focus; free, 5 s cast) to **Hybrid** queues the tactician as **Tank** in the Dungeon Finder, gives the shared
**Stalwart** passive (+10% max health, +10% armour) and makes these class changes:

| Change | Rule |
|---|---|
| Gear | a **spear + shield** is the tank kit (a crossbow cannot block); a tactician with a crossbow may still tank but has no block chance |
| **Guardian** state (×4 threat, page 05 §Threat) | on while you stand within **12 m** of your own Field Standard; off otherwise. A shield icon on the gauge shows it |
| Probing Bolt | generates **×3 threat** on top of Guardian |
| Muster Point | becomes **Field Standard** (§5.2) |
| Hold Fast | becomes **Shield Wall** (§5.3) |
| Outflank | also **Taunts** the target for 3 s (page 05 §Taunt) |
| Shared taunt | the tactician is one of the tank-capable classes that gets the shared taunt **Provoke** at level 10 (page 07 ladder; page 05 §13.4) |

### 5.2 Field Standard (Muster Point in Tank focus)

- `tactician_field_standard` · **Cost** 40 Tempo · **Cooldown** 24 s · **Cast** instant · **Targeting** Ground ·
  **Range** 30 m · **Shape** a standard with a 6 m circle, lasts **20 s** · **Tags** `tag_spell`, `tag_area`,
  `tag_duration`, `tag_aura`.
- **On plant**: up to **5 non-boss enemies** within 12 m of the standard are **Taunted** toward you for 3 s.
  This is an area taunt on the plant only.
- **Every 2 s** while it stands, it **draws attention**: every enemy within 12 m of the standard gains threat
  on you as if you had dealt it **60% WD** (threat only, no damage).
- **Inside the 6 m circle**: allies take 10% less damage and heal 1.5% of max health a second (as Muster
  Point); **you** take **20%** less instead of 10%.
- The standard is not a body: it cannot be hit, does not block, and does not count for soaks.
- **Looks like**: a tall pole with a square banner in your class colour, driven into the ground with a
  thud (spellfx `physical` ground crack), and a thin gold ring (`ring`, holy colour).
- **Sound**: a heavy stake-strike and a horn blast; the banner snaps in the wind every 2 s pulse.

### 5.3 Shield Wall (Hold Fast in Tank focus)

- `tactician_order_shield_wall` · **1 pip** · **Targeting** Self (the order always lands on you in Tank focus) ·
  **Tags** `tag_spell`, `tag_duration`, `tag_shield`, `tag_aura`.
- **Effect** for **6 s** you take **30% less damage** and cannot be knocked back or pulled; every ally standing
  within **5 m behind you** (your back arc, 120°) takes **15% less damage**. Followers inside the arc also
  lock shields and face where you face.
- Can be given once every **12 s** (a cooldown only in Tank focus, so it cannot be chained on 5 pips).
- **Looks like**: a translucent row of gold shield shapes along your front arc (spellfx `barrier`, recoloured gold).

### 5.4 How a tank tactician plays a pull

1. **Field Standard** where you want the pack to stand (it taunts up to 5 on the plant).
2. **Probing Bolt** the strongest enemy (×3 threat on top of Guardian), **Outflank** the next one (taunts it).
3. **Shield Wall** ahead of a telegraphed hit; the group stands behind you to share its 15%.
4. **Stonewall** is the tank plan (6% less damage for everyone, and Shield Wall adds an 8% barrier).
5. Re-plant the standard every 24 s; if the fight moves, **Fall Back** drags followers after you.

### 5.5 Gear and talents that help the hybrid

- Talents: Muster Point t4a **Hold the Ground**, t4c **Fortified Camp**; Outflank t3c **Draw Their Eye**;
  Redeploy t2b **Threat Handoff**; Decisive Hour t2a **Hour of Steel**.
- Set: **Regalia of the War Table** 4-piece lengthens the Field Standard (§8).
- Soul: `soul_unbroken_standard` (§9.3).

---

## 6. Utility spells

None. The tactician travels by scrolls, the Recall Stone and Travel Methods like everyone else
([page 20](../20-TRAVEL.md)).

---

## 7. Talents

Tiers open at levels **12, 22, 32, 45** (canon). A spell whose slot opens later than a tier gets that tier
when the spell unlocks (the level-40 spell opens tiers 1–3 at 40 at once). One pick per tier per spell;
changing a pick costs gold at the Unbinder (reuse: Farhold `js/retrain.js`). Ids follow
`<spellid>_t<tier><a|b|c>`.

**Probing Bolt** (`tactician_probing_bolt`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Feint Shot** — the bolt deals no damage; instead the target turns to face you for 1.5 s (non-boss), letting others hit its back | **Two Probes** — fires twice at 80% each; the second bolt can Expose a second enemy | **Weak Point** — Exposed also lowers the target's armour 15% for its 6 s |
| 2 (22) | **Lasting Opening** — Exposed is consumed by the next **3** hits, each +12% instead of one at +25% | **Called Opening** — a follower that consumes Exposed gains +1 Initiative for you | — |
| 3 (32) | **Pinning Bolt** — the target is also Rooted for 2 s (non-boss) | **Read the Field** — also reveals the target's next ability as a timeline marker on its cast bar for 6 s | — |
| 4 (45) | **Crack the Line** — the bolt pierces: it passes through up to 4 enemies in a 30 m line and Exposes each | **Masterful Probe** — resets Outflank's cooldown if it Exposes a Designated target | — |

**Muster Point** (`tactician_muster_point`; the same talents apply to Field Standard)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Rolling Muster** — the circle follows the ally you cast it on (your friendly target) instead of staying on the ground | **Caltrops** — enemies entering the circle are Snared 40% for 2 s | — |
| 2 (22) | **Supply Cache** — allies inside regain resource instead of healing: 6 Tempo, 5 Momentum or 0.5% of max Mana a second | **Rearguard** — an ally who drops below 20% health inside it gets a barrier of 15% max health (once per ally per cast) | **Signal Fire** — the circle burns enemies inside for 25% WD a second as fire (adds `tag_fire`) |
| 3 (32) | **Two Camps** — 2 charges; two points can stand at once | **Rally Horn** — casting it removes one Snare, Slow or Root from every ally within 20 m of the point | — |
| 4 (45) | **Hold the Ground** — allies inside cannot be knocked back or pulled by non-mechanic effects | **Muster Relay** — an ally who steps into one Muster Point can jump to your other one once per 10 s (needs Two Camps or the legendary map) | **Fortified Camp** — 15% less damage inside instead of 10% (you: 25% in Tank focus), and the point lasts 16 s (the standard 26 s) |

**Outflank** (`tactician_outflank`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Double Envelopment** — the bolt splits on hit and a second bolt Outflanks the nearest other enemy within 8 m | **Hamstring Shot** — the target is also Snared 50% for 3 s | — |
| 2 (22) | **Hammer and Anvil** — if your follower reaches the other side within 2 s, both you and it strike again for 100% WD | **Encircle** — Outflanked also means the target counts as "from behind" for every attack, whatever the angle | **Scout Ahead** — can be cast on a spot (no enemy): an 8 m reposition that leaves a 4 s decoy (a coat on a stick) that enemies attack |
| 3 (32) | **Rolling Flank** — 2 charges | **Breach** — when Outflanked ends, the target takes a 60% WD hit that ignores armour | **Draw Their Eye** — Outflank Taunts the target for 3 s in any role focus, and its hit deals ×3 threat |
| 4 (45) | **Outflank Order** — every follower and group member within 20 m gets a free **Forward!** on arrival (0 pips) | **Cut Off Retreat** — the target cannot leave a 6 m circle around where you shot it for 4 s (non-boss) | — |

**Redeploy** (`tactician_redeploy`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Pull Back** — instead of swapping, the ally is carried to **your side**; you stay put | **Push Forward** — you are carried to the ally's side; the ally stays | — |
| 2 (22) | **Covering Swap** — you are Braced too | **Threat Handoff** — the ally's threat on every enemy is moved to you (a way to rescue a healer who pulled attention) | **Relief** — the ally is cleansed of one harmful status |
| 3 (32) | **Chain of Command** — 2 charges, 30 s each | **Long Reach** — range 45 m | — |
| 4 (45) | **Field Promotion** — the ally's next spell after the swap costs no resource | **Swap the Enemy** — may target a **non-boss enemy**: swap places with it (pulls an add off a healer) | — |

**Double-Time Drill** (`tactician_double_time`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12 → 28) | **Quick March** — also +15% move speed | **Steady Rhythm** — also 5% less damage taken | — |
| 2 (22 → 28) | **Field Drum** — the aura stays where you cast it (a 20 m circle) instead of moving with you, and lasts 18 s | **Forced Pace** — 6 s long, but +20% haste and cooldowns 30% faster | — |
| 3 (32) | **Reload Drill** — allies' **resource** refills 25% faster during it | **Echoing Drill** — when it ends, it comes back for 4 s at half strength | **Drilled Orders** — each Order you give during it costs no pips (max 3) |
| 4 (45) | **Parade Ground** — the aura reaches 30 m, and an ally who leaves it keeps Drilled for 4 s | **Drumline** — every ally in the aura gains a "beat": their next spell within 12 s is off the GCD | — |

**Decisive Hour** (`tactician_decisive_hour`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12 → 40) | **Commit Everything** — costs all pips **and** all Tempo; +3% more for every 20 Tempo spent | **Measured Hour** — needs only 1 pip; lasts 6 s flat | — |
| 2 (22 → 40) | **Hour of Steel** — also 15% less damage taken | **Hour of Blades** — critical hits during it add 1 s (instead of your hits adding 0.5 s) | — |
| 3 (32 → 40) | **Orders Carry** — every group member gets a free **Forward!** at the start | **Standard Bearer** — followers gain +80% damage instead of +40% | **Clear the Board** — the cast removes one Snare, Root or Slow from each ally |
| 4 (45) | **Victory Plan** — when it ends, the Battle Plan is Executed for 8 s (ignores the 5-pip rule) | **Second Wave** — if a boss or elite dies during it, Decisive Hour's cooldown is cut to 60 s | — |

---

## 8. Class sets

| Set id | Name | Pieces (6) | Where from |
|---|---|---|---|
| `set_tactician_field_marshal` | **Field Marshal's Regalia** | `it_field_marshal_tricorn`, `it_field_marshal_epaulettes`, `it_field_marshal_greatcoat`, `it_field_marshal_gauntlets`, `it_field_marshal_breeches`, `it_field_marshal_boots` | Levels 32–45: bosses of `d09_warmasters_pit`, `d10_rimefang_caverns`, `d11_saltdeep_cathedral` on Normal (one piece per boss, class-weighted). Level-60 copies from the same bosses in **Challenge** mode |
| `set_tactician_war_table` | **Regalia of the War Table** | `it_war_table_crown`, `it_war_table_mantle`, `it_war_table_coat`, `it_war_table_grips`, `it_war_table_legguards`, `it_war_table_marchers` | Level 60: **Challenge**-mode bosses of `d13_cindergate`, `d14_ashen_reliquary`, `d15_fire_court`, `d16_the_spire`, and Depth end chests from Depth 10 up. The coat drops only from Kaedros, the Fire King (`b_fire_king_kaedros`, `d15_fire_court` end boss, Challenge) |

**Field Marshal's Regalia**
- **2 pieces** — Probing Bolt's Exposed is consumed by up to **2** hits, each +25%.
- **4 pieces** — once every 10 s, an Order costs 1 pip less (minimum 0).
- **6 pieces** — Decisive Hour's cooldown is **120 s**, and each Order given during it refunds its pips.

**Regalia of the War Table**
- **2 pieces** — Double-Time Drill also grants +8% move speed.
- **4 pieces** — Outflank's cooldown resets when an Outflanked target dies. In Tank focus, the Field Standard also lasts **6 s** longer.
- **6 pieces** — while Initiative is full, your Battle Plan aura is **+50% stronger** (Vanguard +9%).

---

## 9. Class legendaries, uniques and souls

### 9.1 Legendaries and uniques

| id | Name | Slot | Power (named) | Drop source |
|---|---|---|---|---|
| `leg_the_last_command` | The Last Command | main hand, crossbow | **Leads From the Front** — every Order you give also applies to **you** at 50% strength | `b_grief_in_iron`, Grief in Iron (world boss, [page 13](../13-WORLD-BOSSES.md)) |
| `leg_ever_unfolding_map` | The Ever-Unfolding Map | off hand, field map | **Two Camps, One Road** — Muster Point has 2 charges; an ally stepping into one point may jump to the other (once per 10 s per ally) | `b_oddrin_the_unmaker` Vell Oddrin, the Unmaker (`d12_unmade_workshop` end boss, page 12) |
| `leg_forced_march_sabatons` | Sabatons of the Forced March | feet | **Forced March** — Outflank leaves a 10 m trail for 4 s: allies on it +30% move speed; Forward! lasts 12 s instead of 6 | `b_carrion_crown` The Carrion Crown (`cinder_steppe` world boss, page 13) |
| `leg_signet_of_seven_armies` | Signet of Seven Armies | ring | **Seven Banners** — +1 follower slot; your followers take 25% less area damage; On My Mark makes each follower's next hit a critical | `b_castellan_vorhane` Lord Castellan Vorhane (`d13_cindergate` end boss, page 12; Normal and Challenge) |
| `uq_quartermasters_coat` | The Quartermaster's Coat | chest | **Stores Opened** — while you stand in your Muster Point or Field Standard circle you regain 10 Tempo a second | `b_razorback_rider_krunn` Round Two: Krunn and Razorback (`d09_warmasters_pit` main boss) |
| `uq_drillmasters_whistle` | Drillmaster's Whistle | neck | **Sharp Blast** — Initiative fills every **5 s** instead of 6 | `b_oruvel_moon_drinker` Oruvel, That Which Drank the Moon (`d08_moonwell_ruins` end boss) |
| `uq_turncoat_spur` | The Turncoat's Spur | feet | **Wrong Side of the Line** — Redeploy may target a non-boss enemy (swap places with it); 45 s cooldown when used that way | `d06_sandsworn_vault`, rare elite in the vault's side hall |

All follow page 08's legendary/unique model; page 09 lists them in its catalogue.

### 9.2 Souls

Souls sit in a **Soul socket** (page 08 §Sockets); page 09 catalogues them.

| id | Name | Socket in | Requirement | Behaviour | Source |
|---|---|---|---|---|---|
| `soul_standing_orders` | Soul of Standing Orders | weapon (crossbow or spear) | Tactician | **A spell changes**: every Order you give **repeats itself 4 s later at 50% strength** on the same receiver (a followers-only part repeats in full). On My Mark's repeat refreshes Designated instead | `b_warmaster_drogath` (`d09_warmasters_pit`), Challenge mode, 4% chance; any Depth 15+ end chest, 0.5% |
| `soul_unbroken_standard` | Soul of the Unbroken Standard | off hand (shield) | Tactician, in Tank focus | **A new effect**: if you would take a killing blow within 12 m of your Field Standard, the standard breaks instead: you are left at 1 health with a barrier of 20% of max health for 4 s. Once per 120 s | `b_queen_ammarel` (page 12), Challenge mode, 4%; `b_standing_ruin` (world boss), 2% |

### 9.3 Notes

- `soul_unbroken_standard` is the hybrid tank's safety net and is why §5 can promise Depth ~10 without a
  bigger personal cooldown.

---

## 10. Voice and barks

**Voice**: reuse `shared/voices.js` `tactician` timbre (pitch 0.42, depth 0.6, tone 0.55, breath 0.15,
rough 0.1, speed 0.5, jitter 0.06) — a steady, clipped mid voice. Lines go through Lingo so traits colour them.

| When | Lines (Lingo picks one, no repeat inside ~20 fights) |
|---|---|
| Order: Forward! | "Forward!" · "Press them!" · "Now — go!" |
| Order: Hold Fast | "Hold the line." · "Stand firm." · "Not one step back." |
| Order: Shield Wall | "Shields up — behind me!" · "Lock shields!" |
| Order: On My Mark | "That one. Mark it." · "All of you — there." · "All on that one!" |
| Order: Fall Back | "Fall back to me!" · "Pull out, now." · "Regroup!" |
| Field Standard | "Here we stand!" · "To the standard!" |
| Decisive Hour | "This is the hour. Everything we have!" · "Now we win it." |
| Critical hit | "As planned." · "Textbook." |
| Low health (under 25%) | "I need cover!" · "Command is under fire!" |
| Follower dies | "Man down — adjust!" · "We lost one. Close the gap." |
| Plan chosen | "Vanguard. We hit first." · "Stonewall. Let them come." · "Envelopment. Around them." |

---

## 11. Reuse notes

- **Looks**: `avatar-3d/data/class-outfits.json` `tactician` (tricorn, coat, breeches, shoulder cape, scroll
  case). The portrait now holds a crossbow, or a spear and a map. The map is a real off-hand item
  (`it_field_map`, a focus in the sense of Farhold's `js/foci.js` — armour, never swings). The Field Standard
  needs a new held/planted prop (a banner pole; the Chibi 2 gate-banner art from Farhold's town gates is a
  good start, reuse: Farhold round 27 M3 gate banners).
- **Weapons**: crossbow and spear patterns (reuse: Farhold `js/weapons.js`; the polearm's 7.4 m pierce line
  is **not** used — a tactician spear stabs at 4.5 m and its spells throw it).
- **Visual borrowing** (effects only; every spell above is new): Probing Bolt borrows the `arrow` projectile,
  Outflank borrows `charge`'s dash trail, Muster Point borrows `rally`'s gold `arrow_up` aura, Decisive Hour
  borrows the `pillar` effect that `judgement` uses, Shield Wall the `barrier` aura. All spellfx elements used:
  `physical`, `holy`.
- **The earlier tactician** in the Emberveil 2 prototype (`prototypes/emberveil/data/skills.json`:
  `rally_action`, `feint`, `reposition`, `masterstroke`) was a turn-order class. Its ideas survive as: extra
  action → Orders; Feint → Probing Bolt tier 1a; Reposition → Redeploy; Masterstroke → Decisive Hour. Names
  changed so no id is shared.
- **Followers**: Orders drive bodies from `js/pets.js` through the follower book (`js/followers.js`); the
  follower share cap (0.75 of your own top swing) is unchanged, so Orders cannot make a follower out-damage you.
- Farhold's tactician kit (`sunder`, `shield_bash`, `rally`, `warcry`, `charge`, `execute`) is **dropped** —
  those were borrowed skills and canon forbids sharing.

---

## 12. Round 2 changes

*(reference — a Claude-facing change log. Old names, including banned ones, are listed here only so they can be found and removed elsewhere; none of them is used in play.)*

- **Build**: melee sword/sceptre → **ranged** crossbow or thrown spear (00 §6). **Resource**: Focus → **Tempo** (costs rewritten for a 25/s refill).
- **Hybrid role added**: **Tank** — Field Standard, Shield Wall, Guardian near the standard (§5).
- **Renamed**: `tactician_probing_cut` Probing Cut → `tactician_probing_bolt` **Probing Bolt**; Muster Point
  talent "Last Stand" (banned) → **Rearguard**; Probing talents "Feint" → **Feint Shot**, "Thrown Blade" →
  **Pinning Bolt**; Double-Time talent "Grand Parade" (raid-only) → **Parade Ground**;
  `leg_baton_of_the_last_command` → `leg_the_last_command` (now a crossbow).
- **New**: `tactician_field_standard`, `tactician_order_shield_wall`, Outflank t3c **Draw Their Eye**, souls
  `soul_standing_orders` and `soul_unbroken_standard`.
- **Removed**: raid groups, "up to 10 allies", the raid rotation and raid columns; Heroic/Mythic+ set sources.
- **Re-sourced**: War Table set r04 → Challenge d13–d16 + Depth 10+; The Last Command `b_queen_ysmere` (r02) →
  `b_grief_in_iron`; Signet `b_castellan_brandt` (r04, no longer exists) → `b_castellan_vorhane` (`d13_cindergate`); `b_ember_king_kaedros` → `b_fire_king_kaedros`.
- Order receiver rule rewritten for tab targeting (your friendly target, `F1`–`F5`) instead of "the ally under the crosshair".
