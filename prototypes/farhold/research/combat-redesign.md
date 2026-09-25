# Farhold — combat redesign: weapons, physics, animation and effects

Design document. Nothing in it has been implemented. Written 2026-09-20 against the working tree at
commit `fef8544`.

The brief, in the user's words:

> "Critique the current combat system and provide suggestions to make all weapon types more unique,
> interesting, and have satisfying physics. Hammers should smash, swords should slash, and polearms
> should add some range. Add more animation and effects to all sort of attacks and spells. Revamp all
> melee weapons to have better and more satisfying visuals. Ensure the character holds weapons and
> shields properly. Melee weapons are currently terrible compared to ranged and wands, and staves are
> lacking their magical appeal, find a way to improve all of these and create a detailed plan
> including new graphics for everything and then implement that plan."

**The short answer.** Melee is behind, and the arithmetic says by **1.6× to 2.0× on damage per second
and by 15× on reach**, before you count the seven and a half seconds out of every ten that a melee
character spends walking toward something that is already shooting at them. But the number is not the
real problem. The real problem is that a melee swing in Farhold today is *one flat white ring drawn
on the grass*, resolved on the same frame the button goes down, with no wind-up, no impact, no
recoil, no sound of steel on plate, and no clip except a single overhead chop that plays whether you
are stabbing with a rapier or loosing an arrow. There is nothing to feel. Ranged feels better because
`spellfx.js` is doing real work for it and doing nothing at all for melee.

Everything below is built on the existing pattern system in `js/weapons.js` — a weapon is a
sequence of strike shapes — and on the effects engine in `../../avatar-3d/js/spellfx.js` that is
already loaded, already textured with 35 sprites, and already knows how to draw a physical impact
that nothing ever asks it for.

---

## Contents

1. [The critique, with numbers](#1-the-critique-with-numbers)
2. [Weapon identity — what each family should feel like](#2-weapon-identity)
3. [Satisfying physics](#3-satisfying-physics)
4. [Animation and effects plan](#4-animation-and-effects-plan)
5. [New graphics for melee weapons](#5-new-graphics-for-melee-weapons)
6. [Holding weapons and shields properly](#6-holding-weapons-and-shields-properly)
7. [Staves and their magical appeal](#7-staves-and-their-magical-appeal)
8. [Balance pass — before and after](#8-balance-pass)
9. [Work plan in phases](#9-work-plan-in-phases)
10. [Shared-with-Emberveil register](#10-shared-with-emberveil-register)

---

## 1. The critique, with numbers

### 1.1 How one attack works today, in order

| # | Where | What happens |
|---|---|---|
| 1 | `js/player.js:386` | `canSwing = !frozen && !mounted && !swimming`. Nothing else gates a swing. |
| 2 | `js/player.js:387-397` | Button held and `attackCooldown <= 0` → `out.attacked = true`, `attackCooldown = mainEvery`, `self.swing = 0.35` (a cosmetic timer), `mainStep++`. |
| 3 | `js/player.js:398-404` | The off hand repeats it on its own clock, in the same frame. |
| 4 | `js/main.js:5767-5768` | `if (step.attacked) swingWith('main', step.step)`. |
| 5 | `js/main.js:5479` | `swingWith` picks the strike shape with `withArea(strikeAt(weapon, stepIndex), areaPct)`. |
| 6 | `js/main.js:5617` | `fx.swipe(...)` — a flat white ring sector on the ground. |
| 7 | `js/main.js:5618` | `field.strike(...)` — damage resolved immediately. |
| 8 | `js/actors.js:688-706` | Every enemy inside `reach` and `arc/2` takes `rpg.strike`. Sets `e.hitFlash = 0.18`. |
| 9 | `js/rpg.js:977-1180` | Dodge → crit → roll → affixes → armour → block → barrier → health. |
| 10 | `js/main.js:5629-5636` | A splash `strikeArea` behind the arc for anything the arc missed. |

There is no wind-up, no active window, no recovery, no commitment and no cancel. **The whole attack
is one frame.** `control.swing = 0.35` exists only so `main.js:5374` can pick the `attack` clip.

### 1.2 The damage formula, and why it flattens every weapon

`js/rpg.js:588-599`:

```js
const attr  = cat === 'magic' ? d.int : cat === 'heavy' ? d.str : d.dex;
const wd    = weapon?.dmg || (b.unarmed ?? [2, 4]);
const scale = 1 + attr * (b.damagePerAttr ?? 0.03);     // 0.03 per point
const skill = 1 + (lvl - 1) * (b.damagePerLevel ?? 0.1);
d.damage = [
  (wd[0] + d.damageFlat) * scale * talentDmg * skill,
  (wd[1] + d.damageFlat) * scale * talentDmg * skill,
];
```

`damageFlat` is **added to the weapon's dice before everything multiplies**. At level 20 with a
modest +12 flat damage from gear, a greatsword's 15–29 becomes 27–41 and a dagger's 3–7 becomes
15–19. A 4.4× difference in raw weapon damage collapses to 1.9×. Meanwhile the dagger swings 3.4
times a second and the greatsword 0.88. **Heavy weapons pay the whole speed penalty and receive
almost none of the damage advantage they were designed around.**

### 1.3 Damage per second by family — measured, level 20, identical gear

Computed by running the real `profileOf` / `strikeAt` from `js/weapons.js` against the real
`../emberveil/data/items.json` bases and the real `derive` arithmetic. Fixed inputs: level 20,
30 points in the weapon's own attribute, +12 `damageFlat` on every build, +8 `arrowDamage` from a
quiver (ranged only — see 1.4), +30% `spellPower` from three magic-only `potency` rolls (casters
only — see 1.4). No crit, no affix multipliers, single target.

`rate` is swings (or shots, or bolts) per second. `dps` is the sustained figure standing next to the
target. `10s` is the same fight run properly: something notices you at 30 m (`aggroRange` is 30 on a
typical enemy) and closes at 3.6 m/s — the median `speed` in `data/enemies.json` — so a melee
character gets **2.5 of the ten seconds** and a bow gets all ten.

| weapon | cat | hands | base dice | avg hit | rate/s | reach | what a hit is | **dps** | **10 s** |
|---|---|---|---|---|---|---|---|---|---|
| javelin | light | 1 | 9–18 | 185 | 2.29 | **46.0** | arrow + 2.6 m AoE | **422** | **4224** |
| crossbow | light | 2 | 12–22 | 204 | 1.91 | 46.0 | arrow + 2.6 m AoE | 389 | 3888 |
| bow | light | 2 | 8–16 | 176 | 1.91 | 46.0 | arrow + 2.6 m AoE | 336 | 3362 |
| shortbow | light | 2 | 6–12 | 160 | 1.91 | 46.0 | arrow + 2.6 m AoE | 305 | 3047 |
| wand | magic | 1 | 4–10 | 105 | 2.22 | 34.0 | bolt + 2.2 m AoE | 302 | 3024 |
| quarterstaff | magic | 2 | 7–14 | 124 | 2.18 | 9.0 | **free spell, ~5 m** | 352 | 1465 |
| staff | magic | 2 | 8–20 | 143 | 1.67 | 9.0 | free spell, ~5 m | 310 | 1293 |
| dagger + dagger | light | 1 | 3–7 | 94 | 3.38 | 1.9 | arc | 513 | 1283 |
| longsword + **dagger** | heavy | 1 | 8–16 | 132 | 1.61 | 3.0 | arc | 490 | 1224 |
| warhammer + **dagger** | heavy | 1 | 10–18 | 143 | 1.13 | 2.6 | arc | 462 | 1156 |
| dagger | light | 1 | 3–7 | 94 | 3.38 | 1.9 | arc | 317 | 792 |
| rapier | light | 1 | 5–11 | 110 | 2.46 | 3.3 | arc | 271 | 700 |
| scimitar (obsidian) | light | 1 | 12–22 | 160 | 1.72 | 2.7 | arc | 276 | 689 |
| scepter | magic | 1 | 5–12 | 113 | 1.83 | **2.2** | arc (a branded club) | 269 | 673 |
| spear | light | 1 | 8–15 | 129 | 1.64 | 3.9 | arc | 213 | 585 |
| longsword | heavy | 1 | 8–16 | 132 | 1.61 | 3.0 | arc | 212 | 531 |
| two-handed axe | heavy | 2 | 16–30 | 193 | 1.02 | 3.6 | arc | 197 | 526 |
| sword | heavy | 1 | 6–14 | 121 | 1.72 | 2.7 | arc | 209 | 523 |
| iron mace | heavy | 1 | 9–17 | 138 | 1.40 | 2.4 | arc | 193 | 483 |
| two-handed sword | heavy | 2 | 14–28 | 182 | 0.98 | 3.8 | arc | 177 | 483 |
| halberd | heavy | 2 | 13–24 | 168 | 0.97 | 4.6 | arc | 163 | 480 |
| greatsword | heavy | 2 | 15–29 | 187 | 0.88 | 4.1 | arc | 165 | 462 |
| battleaxe | heavy | 1 | 9–17 | 138 | 1.19 | 2.8 | arc | 164 | 410 |
| warhammer | heavy | 1 | 10–18 | 143 | 1.13 | 2.6 | arc | 162 | 405 |
| hammer | heavy | 1 | 8–16 | 132 | 1.15 | 2.5 | arc | 152 | 381 |

**Verdict: the user is right, and the gap is bigger than "terrible" suggests.**

* A **greatsword** — the heaviest weapon in the game, 15–29 base, both hands, no shield — does
  **165 dps**. A **bow** does **336**. That is **2.04×**, at **11× the range**.
* Across ten real seconds of a real fight, the greatsword does **462** and the bow **3362**:
  **7.3×**.
* The **best melee in the game is a pair of daggers** at 513 dps — a weapon whose entire design
  brief was "narrow attack range but make up for it in speed" — and every two-handed weapon is at
  the very bottom of the table.
* A **wand** — one hand, off hand free for a shield, 34 m, 2.2 m splash on every bolt, free, no
  ammunition, no cooldown — beats every two-handed melee weapon in the game by 1.5× to 1.9×.

### 1.4 Where the gap actually comes from — nine mechanisms, all citable

**(1) `TWO_HANDED_SCALE.damage` is dead data.** `js/weapons.js:102` declares
`{ reach: 1.18, arc: 1.25, damage: 1.25, every: 1.2 }`. `profileOf` (`js/weapons.js:121-130`) returns
`reach`, `arc` and `every` and **never `damage`**. A grep across the whole playground finds
`TWO_HANDED_SCALE` used on exactly three lines — 124, 125, 126 — and `damage` on none of them.
Two-handers pay the 1.2× slower clock and never collect the 1.25× damage.

**(2) …and the scale fires on the wrong weapons anyway.** The guard is
`two && !WEAPON_PATTERNS[key]`. `greatsword`, `sword2h`, `axe2h` and `halberd` are all *in*
`WEAPON_PATTERNS` (`js/weapons.js:88-91`), so none of them ever sees the scale. The only two-handed
weapons not in that table are `bow`, `shortbow` and `crossbow` — so **the one effect
`TWO_HANDED_SCALE` has ever had in this game is to make bows 20% slower**, which is the opposite of
what it was for.

**(3) A ranged shot ignores the pattern's damage share; a melee swing pays it.** The bow branch
(`js/main.js:5566-5614`) never reads `shape.damage`. Damage is resolved in `onArrowLand`
(`js/main.js:754`) as `field.strikeArea(arrow.x, arrow.z, splash, player, { element })` — and
`strikeArea`'s `power` defaults to `1` (`js/actors.js:713`). Every arrow is a full hit. A melee
`jab` is 0.65 of one.

**(4) Every arrow is a 2.6 m area attack, for free.** Same line: `splash` is
`balance.player.arrowSplash` = **2.6**, at `falloff` 0.45. A melee swing's splash is
`meleeSplash (1) × shape.splash` = 0.3 m to 1.8 m (`js/main.js:5629`) at `falloff` 0.3, **and it
excludes everything the arc already hit**. The bow's area is larger, cheaper and unconditional.

**(5) A bow's fire rate is an accident.** `bow` is not in `WEAPON_PATTERNS` and `bow` is not in
`CATEGORY_PATTERNS`, so `profileOf` falls through to `CATEGORY_PATTERNS[item.weaponCategory]` —
`light` — which is `{ pattern: ['slash','thrust'], every: 0.46 }` (`js/weapons.js:97`). **A bow's
rate of fire is the light-melee swing clock.** Nobody designed it. It works out at 1.91 shots a
second with no draw, no nock, no reload and no aim time.

**(6) Ranged has an eleventh gear slot and melee does not.** `js/rpg.js:580`:
`if (unit.equipment?.weapon?.ranged && d.arrowDamage) d.damageFlat += d.arrowDamage;`. The quiver's
whole output folds into flat damage, and only while a bow is held. There is no melee equivalent —
the off-hand slot's alternative is a shield, whose `blockChance`/`blockPower` contribute nothing to
damage.

**(7) Casters get a multiplier melee can never have.** `js/rpg.js:1018`:
`if (element !== 'physical' && a?.spellPower) amount *= 1 + a.spellPower;`. `spellPower` comes from
the `potency` prefix, which is `magicOnly: true` in `items.json` and rolls 0.05–0.15. Stacked over
several slots that is a flat +30–60% on **every** hit a wand or staff lands, multiplying after
everything else. A steel sword's element is `physical`; it is excluded by the condition.

**(8) The off-hand weapon lends only its clock — never its damage.** `rpg.strike` reads
`a.damage` (`js/rpg.js:970`), which `derive` computes from `unit.equipment.weapon` alone
(`js/rpg.js:588-589`). The off hand's contribution is `OFFHAND_DAMAGE = 0.62` of the **main hand's**
numbers (`js/weapons.js:498`, `js/main.js:5483`). So the mathematically correct off-hand weapon is
**always the fastest weapon in the game regardless of its damage** — a dagger. Longsword + dagger is
490 dps against dual longsword's 344. That is not a build, it is an exploit, and the table above
shows it beating every honest melee option.

**(9) A melee character spends most of the fight not in melee.** Nothing in the code is wrong here;
it is simply the shape of the problem, and nothing compensates for it. Closing 27 m at 3.6 m/s is
7.5 seconds. `FarShot` (`js/perks.js:164`, applied at `js/rpg.js:1037-1040`) *adds* up to +50% for
shooting at range. There is no melee keystone that pays you for being in reach.

### 1.5 Bugs found while measuring

| # | Where | What |
|---|---|---|
| A | `js/main.js:5516` | `spellfx.aoe({ at, element, radius, scale })`. `aoe`'s signature is `{ points = [], element, crit, stagger }` (`spellfx.js:578`). With no `points` the `forEach` runs zero times. **Every staff nova in the game draws nothing at all.** Every other call site passes `points` correctly (`main.js:973, 997, 1018, 1039, 1080`) — this is the one that does not. `ringPoints()` already exists next to it. |
| B | `js/main.js:5514` | `spellfx.cast({ at, element, scale })`. `cast` takes `{ at, element, ms }` (`spellfx.js:749`); `scale` is silently dropped. |
| C | `js/main.js:5621` | `if (element !== 'physical')` gates the impact effect. `spellfx.impact({ element: 'physical' })` already builds crossed `slash.svg` planes + a spark burst + a dust puff (`spellfx.js:565-568`). **An ordinary steel sword hit draws no impact effect whatsoever**, because of this one condition. |
| D | `js/rpg.js:291-300` | `HELD_BY_SUBTYPE` maps `greatsword`, `sword2h`, `battleaxe` and `axe2h` all to `'greataxe'`. The `greatsword` blade model exists (`chibi2-gear.js:190`) and nothing routes to it. **A greatsword renders as an axe.** |
| E | `js/rpg.js:297` | `wand: 'flame'`. There is no wand model anywhere. A wand is a cone of fire floating 0.15 in front of the palm (`chibi2-gear.js:167-173`). |
| F | `js/rpg.js:295-296` | `halberd`, `spear` and `javelin` all map to `'quarterstaff'` — a bare pole with no head. |
| G | `data/classes.json` | `quarterstaff` is `weaponCategory: "magic", twoHanded: true` in the shared `items.json`, so `isStaff()` (`weapons.js:635`) returns true for it. Its pattern is four strikes over 1.65 s, so **it casts a free area spell every 0.41 seconds — the highest sustained area damage in the game — and it is the starting weapon of the monk, bard, druid, shaman and scavenger.** |
| H | `js/main.js:5374` | `setActorAnim(actor, 'attack')` for every attack there is. Shooting a bow, casting from a staff, stabbing with a rapier and cleaving with an axe all play the same overhead chop. `cast` and `guard` clips exist in `chibi2-motion.js:3` and Farhold never plays either. |
| I | `js/main.js:1507` `onEnemyKilled` | A kill draws nothing. The only `spellfx` call in the whole function is at line 1542, behind the `post.breath` legendary. |
| J | `js/skills.js:26` `applyStatus` | Applies a status and never calls `spellfx.status()`. 23 auras exist; Farhold wires them only to enemy *modifiers* (`actors.js:327`). A burning enemy does not look like it is burning. |
| K | `sfx/data/catalog.json` | `melee.block` exists and `js/sound.js:107-115` never plays it. |
| L | `js/combat-fx.js` | `createCombatFx` never touches `assets/data/fx/` at all. The 35 sprites are unreachable from any melee code path. |

---

## 2. Weapon identity

The pattern system already carries the right idea; it is under-used. Today a shape carries
`reach, arc, damage, wind, splash` (`js/weapons.js:48-55`). The redesign adds **physics fields to
the shape** and **traits to the family**, and nothing else has to change structurally.

### 2.1 Two new shapes, and physics on all of them

Replacing `js/weapons.js:48-55`. `push` is metres of knockback, `stagger` seconds the target cannot
act, `hitstop` milliseconds the world freezes, `shake` the screen-shake amplitude coefficient, `pen`
the share of armour ignored, `step` metres the attacker moves forward.

| key | glyph | reach | arc | damage | wind | splash | push | stagger | hitstop | shake | pen | step |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `jab` | `·` | 0.78 | 0.55 | 0.65 | 0.50 | 0.3 | 0.15 | 0 | 35 | 0.10 | 0 | 0 |
| `slash` | `⟋` | 1.00 | 1.00 | 1.00 | 1.00 | 1.0 | 0.35 | 0 | 55 | 0.20 | 0 | 0 |
| `thrust` | `⟶` | 1.55 | 0.35 | 1.20 | 0.90 | 0.4 | 0.55 | 0 | 55 | 0.18 | 0.25 | 0.3 |
| `sweep` | `◡` | 1.10 | 2.10 | 0.95 | 1.15 | 1.7 | 0.60 | 0.18 | 70 | 0.30 | 0 | 0 |
| `cleave` | `⤬` | 1.25 | 1.55 | 1.35 | 1.30 | 1.8 | 0.75 | 0.15 | 85 | 0.35 | 0 | 0 |
| `overhead` | `⟱` | 1.15 | 0.85 | 1.75 | 1.55 | 1.3 | 1.10 | 0.35 | 110 | 0.55 | 0.10 | 0 |
| **`arc`** (new) | `◟` | 1.10 | 2.30 | 1.45 | 1.25 | 1.6 | 0.70 | 0.20 | 80 | 0.35 | 0 | 0.6 |
| **`slam`** (new) | `▼` | 1.00 | 1.20 | 2.25 | 1.85 | 2.6 | 2.20 | 0.65 | 150 | 0.90 | 0.20 | 0 |
| **`lunge`** (new) | `⇢` | 1.80 | 0.30 | 1.35 | 1.05 | 0.3 | 0.40 | 0 | 60 | 0.22 | 0.40 | 1.4 |

`arc` is the sword finisher — a wide fluid sweep that hits everything in front of you and carries you
half a metre into it. `slam` is the hammer finisher — the smash. `lunge` is the point-weapon
finisher — you cover ground and go through armour.

### 2.2 Family traits

A new `WEAPON_TRAITS` table in `js/weapons.js`, keyed the same way `WEAPON_PATTERNS` is (base key,
then subtype, then `_suffix`, then category), returning a small bag the swing code reads.

| trait | means |
|---|---|
| `damage` | flat multiplier on the whole family (this is where the resurrected 1.20 two-hander bonus lives) |
| `armourBreak` | share of the target's current armour stripped per hit, as a `sunder` status |
| `bleed` | stacks of `bleed` applied on a connecting `cleave` |
| `backstab` | multiplier for a hit landed in the target's rear 100° |
| `pierceLine` | a `thrust` becomes a line to full reach rather than a cone |
| `brace` | extra damage on a `thrust` against something that closed on you this second |
| `flow` | after two connecting strikes, the third costs 0.35× its clock |
| `guard` | block chance granted while the weapon is held |
| `pierceBodies` | how many bodies a shot passes through |

### 2.3 The families, one by one

Enumerated from `../emberveil/data/items.json` `weaponBases` — 57 bases across 18 subtypes. Grouped
into 13 melee families, 3 ranged and 4 caster.

---

#### Hammer and maul — **it smashes**
*Bases: `hammer`, `warhammer`, `drakehammer`, `warhorn_maul`, `axle_club`, `dawnwarden_hammer`,
`covenant_hammer`, `lantern_mace`*

**Feel:** you commit, you are slow, and when it lands the thing you hit stops existing as a threat
for half a second. A hammer should be the answer to *"that one is armoured and I cannot hurt it"* and
to *"that one is about to hit me"*.

**Mechanics:**

* Pattern `overhead, sweep, slam` (hammer) / `overhead, overhead, slam` (warhammer). The `slam`
  finisher is the smash: **2.25× damage, 2.2 m of knockback, 0.65 s stagger, a 2.6 m ground
  shockwave, 150 ms of hit-stop and the heaviest screen shake in the game.**
* **Armour break** (`armourBreak: 0.07`): every hammer hit strips 7% of the target's current armour
  as a `sunder` status lasting 8 s, floored at 45% of the original. Against a 60-armour enemy that
  is the difference between taking 62.5% of your damage and 74% — and it helps the whole party,
  which is what a hammer is *for*. The `sunder` aura already exists in `spellfx.js:88`
  (`crack.svg` glyphs pinned to the torso).
* A staggered enemy's `swingTimer` is held, so a smash genuinely buys time.
* `guard: 0` — a hammer does not parry.

**Numbers:** `hammer` every 0.66 (was 0.82), `warhammer` every 0.76 (was 0.94), `mace` every 0.62
(was 0.74). Reach unchanged. These bring hammers from the bottom of the DPS table to within 4% of a
one-handed sword *before* counting the armour break or the stagger.

---

#### Sword, one-handed — **it slashes**
*Bases: `sword`, `longsword`, `forager_blade`, `hunters_edge`, `dragonfang_sword`*

**Feel:** fluid. Nothing about a sword should ever feel like waiting. It is the weapon you take when
you want a shield on the other arm and a fight that flows.

**Mechanics:**

* Pattern `slash, slash, arc` (sword) / `slash, slash, overhead` (longsword). The `arc` finisher is a
  2.3-radian sweep that carries you 0.6 m forward and hits **everything** in front of you — the
  "hits more than one thing" the brief asks for, using the existing `field.strike` arc test which
  already damages every enemy inside the cone (`js/actors.js:690-702`).
* **Momentum:** each consecutive connecting strike is +8% damage and −6% wind, up to +16%/−12% on
  the third. Resets on a miss or on the 1.1 s combo timer (`b.comboResetSeconds`, `js/player.js:407`).
  This is one accumulator on the controller next to `mainStep`.
* Alternating clips: `slash` then `slashBack` then `arc`, so the combo *reads* as a combo.

---

#### Greatsword — **the sweep**
*Bases: `sword2h`, `greatsword`, `voidsteel_greatsword`, `bloodledger_blade`, `grudgebrand`,
`dragonfang_greatsword`*

Pattern `sweep, overhead, arc`. `damage: 1.20` family trait (the resurrected two-hander bonus).
The `overhead` leaves a `crack.svg` decal and a 0.35 s stagger on everything in a 2.4 m circle. Reach
4.2 m — the second-longest melee reach in the game. Every strike is an area strike; a greatsword
should be the answer to a pack.

---

#### Axe, one-handed, and greataxe — **it bites**
*Bases: `battleaxe`, `axe2h`, `breakers_pick`*

Pattern `cleave, slash, cleave` (one-hand) / `cleave, cleave, slam` (two-hand). Family trait
`bleed: 1` — every connecting `cleave` applies a stack of `bleed`, up to 3, each ticking at 10% of
the hit for 6 s. `bleed` is already in `data/skills.json` statuses and already has an aura
(`drop.svg` running down the body, `spellfx.js:74`). An axe is the melee damage-over-time weapon:
low front-loaded damage, high total, and it *keeps working while you back off*.

---

#### Polearm and halberd — **it adds range**
*Bases: `halberd`*

**Feel:** you fight from outside the thing's reach. This is the family the user named and it is
currently the third-worst weapon in the game.

**Mechanics:**

* Pattern `thrust, sweep, overhead`. Weapon reach **4.8 m** (was 4.6).
* `pierceLine: true` — a polearm's `thrust` is not a cone. It is a **0.9 m wide line out to full
  reach (4.8 × 1.55 = 7.4 m)** that hits every body along it. That out-ranges every enemy in
  `data/enemies.json` — the largest `reach` in the file is 4.6 — by 2.8 m. That is the whole promise,
  and it is checkable in a test.
* `brace: 0.35` — a thrust against something that moved toward you in the last second does +35%.
  Standing your ground with a polearm is rewarded.
* The `sweep` takes the legs: 0.35 s stagger and **no knockback**, so you do not push the target out
  of your own reach.

---

#### Spear — **range, with a shield**
*Bases: `spear`*

The one-handed polearm. Reach 4.0 m, pattern `thrust, thrust, sweep`, `pierceLine` on the thrust but
only 2 bodies, and the off hand stays free for a shield. This is the sword-and-board answer to a
charging beast, and it is the weapon that makes `spear` different from `sword` for the first time.

---

#### Rapier — **the point**
*Bases: `rapier`*

Pattern `thrust, thrust, lunge`. `pen: 0.25` on the thrust and `0.40` on the lunge — a rapier goes
*through* armour rather than around it. The `lunge` carries you 1.4 m forward, which is the gap
closer melee does not have. `guard: 0.10`.

---

#### Sabre and scimitar — **the flow**
*Bases: `obsidian_scimitar`, `rimecut_sabre`*

Pattern `slash, slash, arc`, `flow: true` — if the first two both connected, the third costs 0.35×
its clock. A sabre rewards hitting; a sabre punishes whiffing.

---

#### Dagger — **the back**
*Bases: `dagger`, `tithe_dagger`, `houndmasters_lash`, `dragonfang_dagger`*

Pattern unchanged: `jab, jab, slash`, every 0.34, reach 2.0. Family `damage: 0.80` — a dagger is not
supposed to be the highest sustained damage in the game. In exchange, `backstab: 2.2` — a hit landed
in the target's rear 100° does 2.2× and applies `bleed`. The enemy's facing is already tracked
(`e.facing`, `js/actors.js:505`), so this is one `atan2` and one comparison. Reach 1.9 → 2.0 so a
dagger user is not fighting the collision radius.

---

#### Quarterstaff — **reclassify it first**
*Bases: `quarterstaff`*

`items.json` calls it `weaponCategory: "magic"`, which is why `isStaff()` treats it as a spell
launcher. **That file is shared with Emberveil and must not be edited** (`RPG.md`, and there is a
test that every affix in it resolves). So `attuneWeapon` (`js/rpg.js:95`) writes
`weaponCategory = 'light'` onto the *item* for base key `quarterstaff`, the same way it already
writes `ranged`, `castElement` and all the `describeWeapon` fields onto the item.

Then it is a real quarterstaff: pattern `jab, sweep, jab, sweep`, reach 3.5, every 0.48, and
`guard: 0.12` — a staff parries, which is the monk's defence. Its damage becomes physical, so it
loses the `spellPower` multiplier it should never have had.

---

#### Bow — **draw it**
*Bases: `bow`, `shortbow`, `wyrmscale_bow`, `starfall_bow`, `roadwarden_bow`, `starwake_bow`*

The single change that fixes ranged without gutting it: **a bow has a draw.** Hold to draw, release
to loose.

| hold | power | what it looks like |
|---|---|---|
| 0.00–0.35 s | refuses (you have not nocked) | the nock animation plays |
| 0.35 s | 0.55× | string a third back, no reticle tighten |
| 0.95 s | **1.60×** | full draw, string at the cheek, the reticle closes to its tightest |
| beyond 1.6 s | starts to shake; power decays 3%/s | the arms tremble |

Releasing at full draw costs 1.05 s and pays 1.60×, so a patient archer's sustained damage is
**0.95 shots/s × 1.60 = 1.52** shares/s against today's flat 1.91. Splash drops from **2.6 m to
0.9 m** — an arrow hits what you aimed at, and the quiver's `arrowBurst` affix goes back to being the
thing that makes it an area shot. Range stays 46 m. `pierceBodies: 1`.

The reticle tightening is the feedback: `js/hud.js` already owns the crosshair.

---

#### Crossbow — **one heavy bolt**
*Bases: `crossbow`, `stormpin_crossbow`*

No draw scaling. One bolt at **1.80×**, then a **1.25 s reload** with a real `reload` clip and the
`melee.block`-style mechanical sound. `pen: 0.25`, `pierceBodies: 2`, range 50 m. A crossbow is the
sniper: nothing survives the first bolt and you are defenceless for a second and a quarter. Note the
crossbow model *already* draws its string cocked (`chibi2-gear.js:96-99`), so the reload has
somewhere to go visually.

---

#### Javelin — **count them**
*Bases: `javelin`, `pathfinder_javelin`, `watchfire_glaive`*

Currently the best weapon in the game (422 dps) because it is a one-handed bow with no cost. It gets
**ammunition**: 6 in hand, thrown at 1.15×, one every 0.75 s, range 28 m, and each one sticks in the
ground where it lands and can be walked over to pick up. Out of javelins you are holding nothing, so
you swap to your melee — which is exactly what a javelin thrower should do. `props.js` already keeps
a harvest ledger with world-position entries; a thrown-javelin list is the same shape.

---

#### Wand — **point and click**
*Bases: `wand`, `dragontooth_wand`, `ember_focus`, `emberbrand_wand`*

Keep everything that makes a wand a wand — the six `WAND_BEHAVIOURS` (`js/weapons.js:594-601`), the
per-item element, the free bolt, the off hand staying open. Two changes:

* splash **2.2 → 1.3 m** (it is a bolt, not a grenade — `burst` and `heavy` behaviours keep their
  larger splash, which is the point of rolling them);
* bolt speed **48 → 34** for the `heavy` behaviour only, so "one slow bolt that lands hard" is
  actually visible in flight.

A wand's identity is *reliability*. It always works, it never runs out, it is never the biggest
number. That is a good weapon to be.

---

#### Scepter, orb, tome — **the off-hand focus**
*Bases: `scepter`, `gravebound_scepter`, `orb`, `tome`*

A scepter is currently a **branded melee club with 2.2 m of reach**, and it is the starting weapon of
the paladin, cleric, priest, tactician and oracle. It stays melee — that is correct for a war-priest —
but it gets a real mace pattern (`overhead, slash`, reach 2.5) and a trait no other weapon has:
`spellPower` from a scepter applies to its *swings*, because its element is not physical. That is
already true in `rpg.js:1018`; it just needs saying on the card.

`orb` and `tome` are off-hand only. They stay as they are.

---

## 3. Satisfying physics

"Satisfying" is six separate things. Five of them do not exist in Farhold at all — greps for
`shake`, `hitstop`, `hitStop`, `freeze`, `timeScale`, `knockback`, `recoil` and `impulse` across
`prototypes/farhold/js/`, `shared/` and `avatar-3d/js/` return nothing but unrelated comments.

### 3.1 Hit-stop — **global**

On a connecting hit, the world's `dt` is scaled to **0.05** for `hitstop` milliseconds, then ramped
back to 1.0 over **40 ms** with a cubic ease. Durations come from the strike shape (§2.1): 35 ms for
a jab, 55 for a slash, 110 for an overhead, 150 for a slam.

* **×1.6 on a critical**, **×2.2 on a killing blow**, capped at 260 ms.
* Only one hit-stop is live at a time; a new one replaces the old one only if it is longer.
* **The camera and the mouse are exempt.** Scale the `dt` handed to `control.update`,
  `field.update`, `fx.update`, `spellfx.update` and `props.update` — *not* the look sampler in
  `js/player.js:40-50`. A hit-stop that fights your aim is nausea, not weight.
* Off by default in Settings for anyone who dislikes it, next to `damageNumbers`
  (`js/settings.js:37`).

Implementation: one `timeScale` value on the frame loop in `js/main.js`, and one
`fx.freeze(ms)` helper. Roughly 25 lines.

### 3.2 Screen shake — **global, scaled per family**

Camera **position** offset only, never rotation — rotating the camera moves the crosshair and breaks
the shot you were lining up.

* Amplitude `A = strike.shake × 0.035 m`, ×1.5 on a crit, **hard cap 0.12 m**.
* Decay: linear to zero over **180 ms**, noise at **38 Hz** (two out-of-phase sine pairs, not
  `Math.random()` — random reads as static).
* **Direction**: biased 70% along the attacker→target vector, flattened to the ground plane, 30%
  isotropic. A smash pushes the camera the way the hammer went.
* A slam is 0.9 × 0.035 = 0.032 m; a jab is 0.10 × 0.035 = 0.0035 m and you will not consciously
  notice it, which is correct.
* Same Settings toggle family as hit-stop.

### 3.3 Knockback — **per family, per strike shape**

`e.push = { dx, dz, metres, t }` written by `field.strike`, consumed in the enemy movement block at
`js/actors.js:536-549` **before** the chase/wander branch, so it goes through the existing
`clampToWorld` / `unstick` / `underwater` guards for free.

* Travel time **0.18 s**, ease-out cubic. Distance is `strike.push` from the table in §2.1: 0.15 m
  for a jab, 1.10 m for an overhead, **2.20 m for a slam**.
* Rank resistance: `champion` ×0.70, `rare` ×0.50, `boss` ×0.25, `hover` bodies ×1.25 (they have
  nothing to brace against).
* A body that cannot move (wall, water) absorbs the push and **takes 15% extra damage instead** —
  "slammed into a wall" is free and it makes terrain matter.

### 3.4 Stagger — **per strike shape**

`e.stagger` seconds. While it is above zero:

* `speed = 0` in the movement block;
* `e.swingTimer` is held rather than decremented (`js/actors.js:556`), so the stagger genuinely
  removes attacks and not just movement;
* the actor plays the `hit` clip (it exists, `chibi2-motion.js:3`, 0.45 s) and, above 0.4 s, gets the
  `stun` aura — `star_daze.svg` circling the head (`spellfx.js:78`, already built);
* diminishing returns: the second stagger on the same body inside 6 s is 60% as long, the third 30%,
  the fourth 0. Without this a maul build permanently locks a boss.

### 3.5 Weight in the wind-up — **per family**

This is the largest change to how combat feels and it does **not** change any damage number.

Today a swing is one frame (`js/player.js:387-397`). Split it into three:

```
press ──[ windMs ]──> damage lands ──[ recoverMs ]──> next swing allowed
```

* `windMs = familyWind × strike.wind`
* `recoverMs = 0.45 × windMs`
* `familyWind`: dagger **70 ms**, rapier 95, sabre 105, sword 120, spear 140, mace 180, axe 200,
  hammer **260**, halberd 300, greatsword **330**, greataxe 340.
* **`windMs + recoverMs` is subtracted from the existing `every`, not added to it.** A greatsword's
  `overhead` is `330 × 1.55 = 512 ms` of wind and `230 ms` of recovery — 742 ms of a 1457 ms cycle.
  The rate of fire, and therefore every number in §1.3, is unchanged.
* **During wind-up you turn at 35% speed and move at 55%.** That is the commitment.
* **Recovery is cancellable** into a dodge/step but not into another swing. There is no dodge in
  Farhold yet; until there is, recovery is simply a window where the next swing is queued rather than
  dropped — press early and it fires the instant recovery ends. Input buffering is 180 ms.
* **The off hand can only swing during the main hand's recovery.** Two hands can no longer land on
  the same frame, which is what makes dual wielding an *interleave* instead of a doubling. This
  alone takes dual daggers from 3.38 swings/s to about 2.9.

### 3.6 A hit that moves the thing you hit — **global**

Beyond knockback, every connecting hit gets a **visual recoil**: the target's `actor.group.position`
is offset **0.08 m** along the hit direction and eased back over **120 ms**. It costs nothing, it is
independent of the physics, and it is the difference between "a number appeared" and "I hit
something". `e.hitFlash = 0.18` already exists (`js/actors.js:700`) and does the colour half of this.

### 3.7 The per-family physics table

| family | familyWind | hit-stop range | shake range | knockback range | stagger |
|---|---|---|---|---|---|
| dagger | 70 ms | 35–55 ms | 0.004–0.007 m | 0.15–0.35 m | none |
| rapier | 95 ms | 55–60 ms | 0.006–0.008 m | 0.40–0.55 m | none |
| sabre | 105 ms | 55–80 ms | 0.007–0.012 m | 0.35–0.70 m | 0.20 s on the finisher |
| sword 1h | 120 ms | 55–80 ms | 0.007–0.012 m | 0.35–0.70 m | 0.20 s on the finisher |
| spear | 140 ms | 55–70 ms | 0.006–0.011 m | 0.55–0.60 m | 0.35 s on the sweep |
| mace | 180 ms | 55–110 ms | 0.007–0.019 m | 0.35–1.10 m | 0.35 s |
| axe 1h | 200 ms | 55–85 ms | 0.007–0.012 m | 0.35–0.75 m | 0.15 s |
| **hammer/maul** | **260 ms** | **55–150 ms** | **0.007–0.032 m** | **0.60–2.20 m** | **0.65 s** |
| halberd | 300 ms | 55–110 ms | 0.006–0.019 m | 0.55–1.10 m | 0.35 s |
| greatsword | 330 ms | 70–110 ms | 0.011–0.019 m | 0.60–1.10 m | 0.35 s |
| greataxe | 340 ms | 85–150 ms | 0.012–0.032 m | 0.75–2.20 m | 0.65 s |
| bow | draw, not wind | 55 ms | 0.006 m | 0.30 m | none |
| crossbow | 180 ms recoil | 85 ms | 0.014 m | 0.90 m | none |
| wand | 90 ms | 55 ms | 0.006 m | 0.25 m | none |
| staff | charge | 110 ms | 0.019 m | 0.80 m | 0.25 s |

---

## 4. Animation and effects plan

### 4.1 Clips that exist today

`avatar-3d/js/chibi2-motion.js:3` —
`idle, ready, walk, run, attack, cast, hit, guard, wave, talk, jump, dead`, plus
`swim, swimBack, swimSide` opt-in (`:11`). One-shots: `attack, cast, hit, jump, dead` (`:13`).
Durations at `:14`. Every track is a bone quaternion plus `hips.position` and `root.position`.

Farhold plays **nine** of them (`js/main.js:5366-5375`): the three swim strokes, `ready`, `attack`,
`jump`, `run`, `walk`, `idle`. **`cast` and `guard` are never played.** Enemies get even fewer
(`js/actors.js:42-51`).

### 4.2 Clips to add — all in `chibi2-motion.js`, **SHARED WITH EMBERVEIL**

Additive only: no existing clip is edited, and `CHIBI2_ANIMS` gains entries rather than losing any.
Emberveil reads the array and will simply have more clips available than it asks for.

| new clip | s | what it does |
|---|---|---|
| `slash` | 0.50 | right-to-left horizontal cut. Hips lead (`hips.y` −0.55), chest follows +0.62, `armR` sweeps from `[−0.3, 0.9, 0.5]` to `[−0.2, −1.0, 0.1]`. Left arm counterweights. |
| `slashBack` | 0.50 | the mirror, left-to-right, so a combo alternates instead of repeating |
| `thrust` | 0.42 | hips drive forward, `root.z` +0.10, `armR` extends to `[−1.35, 0, 0.05]`, `elbowR` straightens to −0.05 |
| `overhead` | 0.85 | today's `attack`, kept exactly as it is and aliased so nothing breaks |
| `sweep` | 0.92 | both hands on the haft: chest yaw −0.9 → +1.0, hips 0.6× that, both arms locked together |
| `jab` | 0.26 | short elbow-only extension, no hips |
| `arcCut` | 0.62 | the sword finisher: a full body turn, `root.position.z` +0.18 (the 0.6 m step), chest 1.3 rad |
| `slam` | 1.05 | the smash: both arms overhead (`armR/L.x` −2.5) for 0.42 s, then down through in 0.14 s, hips drop `hips.y` −0.12, a 0.25 s settle |
| `lunge` | 0.55 | fencing lunge: `root.z` +0.30, front knee bends 1.1, rear leg straightens |
| `shoot` | 0.60 | bow: `armL` out straight, `armR` draws to the cheek over `drawMs`, holds, snaps forward 0.08 s |
| `reload` | 1.00 | crossbow: butt to the hip, foot in the stirrup, both arms haul |
| `castPoint` | 0.35 | wand: one arm out, wrist flick |
| `castStaff` | 0.70 | staff: both hands on the haft, butt planted, body leans in |
| `channel` | loop 1.6 | staff hold: butt planted, shoulders rising with the charge |
| `guardHit` | 0.32 | the shield takes a blow: `elbowL` compresses, chest recoils 0.22 |

That is 15 new clips; `guard` (already present) becomes the shield-raised idle, which is what it was
written for (`chibi2-motion.js:30-38`).

### 4.3 Choosing a clip — in Farhold, not in the shared module

Replace `js/main.js:5374`'s blanket `setActorAnim(actor, 'attack')` with a lookup on the strike shape
and the weapon family:

| shape | one-handed | two-handed | ranged/caster |
|---|---|---|---|
| `jab` | `jab` | `jab` | — |
| `slash` | `slash` / `slashBack` alternating | `sweep` | — |
| `thrust` | `thrust` | `thrust` | — |
| `sweep` | `slash` | `sweep` | — |
| `cleave` | `slash` | `sweep` | — |
| `overhead` | `overhead` | `overhead` | — |
| `arc` | `arcCut` | `arcCut` | — |
| `slam` | `slam` | `slam` | — |
| `lunge` | `lunge` | `lunge` | — |
| — | — | — | bow `shoot`, crossbow `shoot`+`reload`, wand `castPoint`, staff `castStaff`/`channel` |

`actor.setRate()` already exists and is used for the walk stride (`js/main.js:5330+`); use it to
stretch or squash the clip to the strike's actual `windMs`, so a hasted character's animation speeds
up with them.

### 4.4 Effects — spend `spellfx.js`, do not build a second engine

The whole list, with the exact sprite or geometry each one uses.

**(a) Melee impact — one line, biggest single win.** Delete the `if (element !== 'physical')` guard
at `js/main.js:5621`. `spellfx.impact({ at, element: 'physical', crit })` (`spellfx.js:565-568`)
already draws **two crossed `slash.svg` planes (three on a crit), a `spark.svg` burst, and a
`smoke.svg` dust puff**. Today a steel sword draws none of it.

**(b) Weapon trail.** `spellfx.js:127` has a private `Trail` class used only by projectiles. Expose
it as `SpellFx.trail({ follow, element, life = 0.28, width, sprite })` — **SHARED, additive**. Farhold
drives it from a point `0.85 × reach` along the swing arc, sampled 6 times across `windMs`. Sprites
by brand:

| brand | trail sprites |
|---|---|
| none (steel) | `slash.svg`, tinted by the weapon's rarity colour |
| fire | `flame.svg` + `ember.svg` |
| ice | `snowflake.svg` + `ice_shard.svg` |
| lightning | `spark.svg` + `bolt.svg` |
| poison | `leaf.svg` + `thorn.svg` |
| shadow | `wisp.svg` + `shadow_claw.svg` |
| holy | `holy_mote.svg` + `feather.svg` |
| arcane | `arcane_shard.svg` |

**(c) The arc ribbon replaces the ground ring.** `js/combat-fx.js:20-45` builds a flat
`RingGeometry` sector lying on the grass. Build the same sector **in the swing plane** instead —
horizontal for `slash`/`sweep`/`cleave`/`arc`, vertical for `overhead`/`slam`, a narrow 0.25 m band
for `thrust`/`lunge`/`jab` — textured with `slash.svg`, additive, fading over 0.22 s. Keep the ground
version behind Settings → Debug, because it genuinely *is* the hit box and that is worth being able
to see.

**(d) Sparks on armour.** When `result.blocked > 0`, or the target's armour exceeds 40 and the hit
rolled in the bottom third of its range, draw `spellfx.impact({ element: 'true' })` — white
`spark.svg` + `glow.svg`, no dust — and play `melee.block`, which is in the catalogue and has never
been played (`js/sound.js:107-115`).

**(e) Dust at the feet.** `smoke.svg` via the existing `_puff` builder, on a `slam` landing, a
`lunge` and an `arcCut` step. Radius 1.1 m, life 0.5 s.

**(f) Armour break.** `crack.svg` decal on the torso plus the existing `sunder` aura
(`spellfx.js:88`) via `spellfx.status(e.actor.group, 'sunder', true)`.

**(g) Stagger.** `spellfx.status(e.actor.group, 'stun', true)` — `star_daze.svg` circling the head,
already built (`spellfx.js:78`), cleared when the timer runs out.

**(h) Statuses get their auras at last.** `js/skills.js:26` `applyStatus` mutates `target.statuses`
and draws nothing. Hook the aura on at the call sites Farhold owns (`landStatus`, `js/main.js:788`)
so burning enemies burn (`flame.svg` + `ember.svg`), poisoned ones bubble, bleeding ones drip,
chilled ones get the `freeze` shell. All 23 auras exist. Also call the unused
`spellfx.pulseStatus(target, type)` (`spellfx.js:858`) on each whole-second DoT tick — a 1.7× pop —
so a burn *reads* as ticking.

**(i) Deaths.** `onEnemyKilled` (`js/main.js:1507`) draws nothing. Add
`spellfx.impact({ at, element, crit: true })` plus a `drop.svg` burst for a physical kill and the
killing blow's element for anything branded, and a 220 ms hit-stop.

**(j) Fix the staff nova.** `js/main.js:5516` — pass `points: ringPoints(x, z, radius)` (the helper
is already in the file and used at lines 973/1018) instead of `{ at, radius }`.

**(k) Ground effects.** `dropPool` (`js/main.js:2822`) hand-rolls a `CircleGeometry` disc with a
comment saying it exists "because spellfx has no ground effect". Add
`SpellFx.ground({ at, radius, element, seconds, sprite })` — **SHARED, additive** — built from the
existing `_discFlash` plus a slow-rotating `arcane_rune.svg`/`holy_rune.svg`/`frost_ring.svg` plane.
It is needed by the staff's `ground` spells (`Creeping Blight`, `Creeping Dark`) which currently fall
through to the bolt branch.

**(l) Switch to batched sprites.** `avatar-3d/js/spellfx-batched.js` already exists, is a drop-in
subclass, and Farhold does not use it. Trails will multiply the sprite count by 5–8×; swap
`new SpellFx(...)` at `js/main.js:770` for `new BatchedSpellFx(...)`. Emberveil already does this.

**(m) Sounds.** The catalogue has 118 ids. Melee has four (`melee.swing/hit/crit/miss`) plus the
unused `melee.block`. Add family variation by layering what exists: a `slam` plays
`melee.crit` + `spell.physical.impact` together at a 40 ms offset; a thrust plays `melee.hit` alone;
a bow at full draw plays `spell.physical.launch` pitched up. No new assets needed.

---

## 5. New graphics for melee weapons

### 5.1 How a held weapon is drawn today

**It is baked into the body mesh.** `avatar-3d/js/chibi2-geometry.js:75-99` (`SkinBuilder.add`)
applies the local transform, sets `skinIndex[0]` to the bone with `skinWeight[0] = 1`, bakes the
geometry into bind-pose world space, and `finish()` (`:100-113`) merges *everything* into two meshes
(`cloth`, `metal`). **A weapon has no `Object3D` of its own.** Changing a weapon means `setAvatar()`
→ a full template rebuild (`chibi2.js:534-575`).

The geometry lives in `avatar-3d/js/chibi2-gear.js` — `buildHeld` (`:52`), `buildOffhand` (`:194`) —
dispatched from `buildGear` (`:530-538`), which `chibi2.js:301-302` calls.

Farhold picks which model by subtype at `js/rpg.js:291-300`, and the look object carries **only
`{ id, color }`** — no size, no material, no quality. Rarity shows as one of three colours
(`js/rpg.js:306`): legendary `#ffb040`, rare `#e8d020`, everything else `#b9c2cc`.

Current melee models, for reference — sword `chibi2-gear.js:56-62`, greataxe `:101-107`, hammer/
warhammer `:108-114`, mace `:115-120`, daggers `:121`, rapier `:122-127`, saber `:128-132`, cleaver
`:133-138`, staves `:63-88`.

### 5.2 What is wrong with them

1. **Silhouettes do not read.** A sword is a flat 4-sided tapered profile with a curved bar for a
   guard. At the distance you actually fight from, a longsword, a greatsword and a rapier are three
   grey sticks.
2. **The greatsword is an axe** (`js/rpg.js:292` maps it to `'greataxe'`).
3. **A spear, a halberd and a javelin are all a bare pole** (`js/rpg.js:295`).
4. **There is no wand** (`js/rpg.js:297` → `'flame'`).
5. **Quality and rarity are a tint.** A legendary maul and a common maul are the same object in two
   colours.
6. **No edge.** Every blade is a single colour. A weapon reads as a weapon because light catches the
   bevel, and there is no bevel anywhere.

### 5.3 The plan — a new module, `avatar-3d/js/chibi2-weapons.js`

New file so `chibi2-gear.js` changes by one dispatch line and Emberveil's existing looks are
untouched. Same procedural style, same `SkinBuilder` buckets, no external assets, no extra draw
calls.

**Units.** Bone space is body-relative; a Chibi 2 adult stands about 1.35 units, so 1 unit reads as
about 1.25 m on a human. Lengths below are in units with the human equivalent in brackets.

**Shared parts vocabulary** (each one function, reused by every family):

| part | geometry | notes |
|---|---|---|
| `grip(len, r0, r1, wrap)` | `profile()` tapered cylinder + 5 leather bands | the bands are what makes it read as a *grip* |
| `pommel(kind, size)` | `scent`/`disc`/`wheel`/`fishtail` from a low sphere or a squashed cylinder | family-specific |
| `guard(span, sweep, thick)` | `taperedCurve` with a forward `sweep` in radians | today's guard has no sweep and no thickness |
| `blade(len, w, kind)` | 8-vertex `profile`: **spine, fuller, bevel, edge** in three tones | the one change that makes blades read |
| `edgeStripe(len, w)` | a 0.004-thick lighter strip along each edge | fake specular; costs 2 triangles a side |
| `haft(len, r, material)` | cylinder + 2 iron ferrules + a wrap band | |
| `langets(len)` | two 0.006 strips down the haft from the head | the detail that says "this head will not fly off" |
| `headMount(collar)` | torus where the head meets the haft | |
| `gem(size, colour)` | icosahedron | rarity |

**The families.**

| family | parts | blade/head | haft/grip | human equivalent |
|---|---|---|---|---|
| **dagger** | grip, small disc pommel, 0.10 straight guard, fullered blade | 0.26 × 0.030 | 0.10 | 33 cm blade |
| **sword** | grip, wheel pommel 0.030, 0.22 guard with 0.20 rad forward sweep, fullered blade + edge stripes | **0.58** × 0.050 | 0.13 | 72 cm arming sword |
| **longsword** | as sword, scent-stopper pommel, 0.24 guard | **0.66** × 0.048 | 0.17 hand-and-a-half | 82 cm |
| **greatsword** | grip 0.26, fishtail pommel 0.042, 0.30 guard with **side lugs at 0.18**, ricasso 0.12 | **0.92** × 0.062 | 0.26 | 115 cm zweihänder |
| **sabre** | `taperedCurve` belly offset 0.14, **single-edge asymmetric profile**, knuckle bow (quarter torus) | 0.56 curved | 0.12 | 70 cm |
| **rapier** | 0.012 diamond section, swept hilt: quarter torus + 2 side rings + knuckle bow | **0.74** × 0.012 | 0.14 | 92 cm |
| **axe 1h** | haft + langets + collar, **bearded single head** with a beard hook and a back spike | head 0.19 tall × 0.13 deep × 0.024 | 0.52 | |
| **greataxe** | haft + langets, **twin heads** 0.26, top spike 0.10, butt cap | 0.26 tall | 0.95 | |
| **mace** | haft + collar, **6 extruded flanges** (not the current spiked dodecahedron) | 0.13 tall × 0.10 across | 0.44 | |
| **hammer** | haft + langets, chamfered box head with a **square face plate** and a back spike 0.09 | 0.15 × 0.16 × 0.13 | 0.62 | |
| **maul/warhammer** | as hammer, longer **back beak 0.14**, larger head | 0.19 × 0.20 × 0.15 | 0.98 | |
| **spear** | shaft + 2 ferrules, **leaf head with a mid-rib**, 2 side wings, buttspike 0.07 | head 0.24 | 1.45 | 2.0 m |
| **halberd** | shaft + langets, **axe blade 0.22 + top spike 0.26 + rear fluke 0.13** | | 1.60 | 2.2 m |
| **quarterstaff** | shaft, **iron ferrules 0.08 at each end**, centre wrap | — | 1.55 | 1.9 m |
| **wand** (new) | tapered rod, collar, **focus gem 0.028 at the tip**, the flame moved to the tip | 0.30 | — | 38 cm |

**How quality and rarity show** — replacing the current three-colour tint:

| level | metal tone | detail | gem | aura |
|---|---|---|---|---|
| common | `#9aa3ad` dull steel | no fuller, plain guard | none | none |
| magic | `#b9c2cc` steel + `#d8dcea` edge stripes | fuller | 0.018 on the pommel | none |
| rare | `#e8d020` gilt furniture, steel blade | fuller + 2 langets + etched collar | 0.024 pommel + 0.018 collar | none |
| legendary | `#ffb040` ember-gold | all of the above + a pierced guard | 0.030, emissive | `spellfx.status(body, 'enchant', true)` — 3 `arcane_shard.svg` orbiting inside a tilted hoop, **already built** (`spellfx.js:92`) |

A **branded** weapon (fire/ice/storm/…) tints the fuller and the gem to the element colour from
`CAST_ELEMENTS` (`js/rpg.js:71-77`) and adds its trail sprite (§4.4b) permanently at 25% opacity.

**Farhold's mapping table gets fixed at the same time** — `js/rpg.js:291-300`:

```
greatsword  → 'greatsword'   (not 'greataxe')
sword2h     → 'greatsword'
axe2h       → 'greataxe'
battleaxe   → 'axe'          (new: the one-handed bearded axe)
spear       → 'spear'        (new)
halberd     → 'halberd'      (new)
javelin     → 'javelin'      (new: a light spear, 1.1)
quarterstaff→ 'quarterstaff' (new: ferruled pole, not 'staff_crook')
wand        → 'wand'         (new)
scepter     → 'scepter'      (new: a short flanged mace with a gem head)
```

---

## 6. Holding weapons and shields properly

### 6.1 The bone space, so the numbers below mean something

`chibi2-gear.js:8-9`, verbatim:

```
//   hand*  +y runs toward the elbow, +z is forward, palm centre at y -0.035; grips sit at z 0.055.
//   elbow* forearm runs from y 0 to -0.205T, sleeve radius ~0.075.
```

So in `handR` space: **−y is out past the fingertips, +y is up the forearm toward the elbow.**

### 6.2 What is wrong

**(1) Every haft weapon has its head on the wrong side of the fist.** A sword gets it right — the
blade runs from y −0.14 down to **−0.52**, out past the fingers. But:

| weapon | line | head is at | should be |
|---|---|---|---|
| greataxe | `chibi2-gear.js:103` | **y +0.44** (up the forearm, past the elbow) | past the fingertips |
| hammer | `:110` | **y +0.40** | past the fingertips |
| warhammer | `:113` | **y +0.46** | past the fingertips |
| mace | `:117` | **y +0.42** | past the fingertips |

The `attack` clip (`chibi2-motion.js:50-58`) swings `armR` about its x axis, pivoting at the
shoulder. With the head on the elbow side of the fist, **the head travels the opposite way to the
fist**: as the character chops down, the mace head goes up and back. You are hitting the enemy with
the butt of the haft. This is the single most likely cause of "the character does not hold weapons
properly".

**(2) A two-hander is held in one hand.** `buildHeld` only ever touches `handL` for `daggers`
(`:121`) and `lightning` (`:174`). The greataxe, the warhammer and the quarterstaff are 100%
`handR`, and no clip poses the left arm toward the haft — `ready`/`guard` just park `armL[0]` at
−0.6 as a generic stance (`chibi2-motion.js:30-38`).

**(3) A shield is gripped in the fist.** `chibi2-gear.js:196` binds it to `L = 'handL'` and every
shield piece rides that bone at weight 1 (`chibi2-geometry.js:85-88`). A heater shield is **strapped
to the forearm** with an enarmes; only a buckler is centre-gripped.

**(4) A bow is in the wrong hand and never draws.** `chibi2-gear.js:89-93` puts the bow in `handR`,
with the string as a straight 0.004-radius tube from nock to nock that never moves. You draw a bow
with the bow in the *left* hand. And `main.js:5374` plays the overhead chop when you shoot.

**(5) A wand is a fire in the palm** (`chibi2-gear.js:167-173`).

**(6) A staff is gripped dead centre** — shaft y −0.52 → +0.54 (`:64`), which is a quarterstaff grip,
not a caster's. A wizard's staff is held about a third down from the top.

### 6.3 The corrections, family by family

| family | bone | position / rotation | why |
|---|---|---|---|
| dagger | `handR` (+ `handL` when paired) | blade −0.10 → **−0.36**, grip −0.10 → +0.05, guard at −0.09 | unchanged in principle, just longer |
| sword 1h | `handR` | grip −0.13 → +0.06, guard −0.13, blade −0.15 → **−0.73**, pommel +0.07 | pommel comes out of the forearm (today it sits at +0.055 *inside* it) |
| longsword | `handR` | as above, blade to **−0.81**, grip to +0.10 | |
| greatsword / 2h sword | `handR` + **left-hand pose** | grip −0.20 → +0.14, guard −0.22, blade −0.24 → **−1.16**, ricasso −0.24 → −0.36 | the blade points OUT, which it currently does not (the greataxe model it uses points in) |
| greataxe | `handR` + **left-hand pose** | haft **−1.05 → +0.22**, head at **−0.78**, butt cap +0.22 | head past the fingertips, butt short and out of the way |
| axe 1h | `handR` | haft −0.60 → +0.10, head at **−0.46** | |
| mace | `handR` | haft −0.50 → +0.08, flanged head at **−0.44** | |
| hammer | `handR` | haft −0.66 → +0.10, head at **−0.56** | |
| maul/warhammer | `handR` + **left-hand pose** | haft **−1.02 → +0.20**, head at **−0.82** | |
| spear | `handR` (+ left pose) | shaft **−1.05 → +0.55**, head at −1.10, buttspike +0.58 | held a third from the butt, point forward |
| halberd | `handR` + **left pose** | shaft **−1.10 → +0.62**, head cluster at −1.14 | |
| quarterstaff | `handR` + **left pose** | shaft −0.78 → +0.78 (centred — correct for this one), ferrules at both ends | |
| staff (caster) | `handR` | shaft **−0.95 → +0.45**, topper at **+0.55** | gripped a third from the top, so the topper is above the shoulder and the butt can reach the ground |
| wand | `handR` | rod −0.30 → +0.02, gem at −0.32, **rotation `[−0.35, 0, 0]`** so it points slightly forward rather than straight down | |
| **bow** | **`handL`** | **as a live `Group`, not baked skin** — see below | |
| crossbow | `handR` + left pose on the fore-end | keep the current +z layout (`:94-100`), it is the one thing already right; add the left hand under the tiller | |
| **shield** (heater, kite, tower) | **`elbowL`** | position `[0, −0.10, 0.075]`, rotation `[0, 0, 0.18]`, face plate at z 0.13 | strapped to the forearm, cocked slightly outward. The forearm runs y 0 → −0.205T, so y −0.10 is its middle |
| **buckler** | `handL` (unchanged) | `[0, 0.02, 0.10]` | a buckler *is* centre-gripped |

### 6.4 The two-hander left-hand pose

The weapon is baked into the skinned mesh on `handR`, so geometry cannot place the left fist. It has
to be a **pose**. Add a `grip` field to the avatar (`'oneHand' | 'twoHand' | 'polearm' | 'bow' |
'staff'`) that `chibi2-motion.js` reads and, for `twoHand`/`polearm`/`staff`, overrides
`armL`/`elbowL`/`handL` toward a fixed target in every clip.

Starting values, to be calibrated on the tuner page (place a marker, read `handL`'s world position,
adjust by eye — do not trust these until they have been looked at):

```
twoHand: armL = [-1.05,  0.42, -0.30],  elbowL = [-1.30, 0, 0]
polearm: armL = [-0.80,  0.55, -0.22],  elbowL = [-1.05, 0, 0]
staff:   armL = [-0.62,  0.38, -0.18],  elbowL = [-0.85, 0, 0]
bow:     armL = [-1.48,  0.10,  0.06],  elbowL = [-0.08, 0, 0]   (bow arm straight)
```

**SHARED WITH EMBERVEIL.** Emberveil's Chibi 2 characters would get the same pose for their
two-handers, which is an improvement there too, but it is a visible change to an existing prototype
and should be screenshotted before and after.

### 6.5 The bow — the one exception to baked geometry

A drawn bow needs a string whose mid-point moves, and baked skin cannot do that. Add to
`chibi2.js` a `socket(boneName)` method returning a live `Object3D` parented to that bone, and build
the bow into `socket('handL')` as a real group: two limbs, a riser, and a 3-point string polyline
whose middle vertex is driven by `drawFraction` 0 → 0.28 units. The arrow is a second small group on
the string, hidden until the draw starts.

* At rest: `drawFraction = 0`, string straight, no arrow, bow canted 20° (`rotation.z = 0.35`).
* Drawing: `drawFraction` follows the hold timer; the right hand's `shoot` clip is stretched with
  `actor.setRate()` to match.
* Release: `drawFraction` snaps to 0 over 60 ms, a `spark.svg` puff at the riser, arrow spawns from
  `fx.shoot`.

**SHARED WITH EMBERVEIL** — `socket()` is additive and Emberveil does not have to use it.

---

## 7. Staves and their magical appeal

### 7.1 What a staff is today

`isStaff()` (`js/weapons.js:635-639`) is "magic category and two-handed". Its attack branch is
`js/main.js:5503-5541`. Every "swing" casts a shaped spell from `STAFF_SPELLS`
(`js/weapons.js:548-585`) — a cone, a nova, a wave or a lob — **free, instantly, with no cast time,
no mana and no choice**, on the weapon's own pattern clock. A `staff` fires 1.67 spells a second; a
`quarterstaff` fires **2.18**.

And the nova draws nothing at all, because of the `aoe` bug (§1.5 A).

So a staff is simultaneously the most powerful weapon in the game and the least interesting: you hold
the button and area damage comes out. There is nothing magical about it.

### 7.2 What a staff should be

**A wand is a pistol. A staff is a siege engine.** A wand always works, never runs out, and is never
the biggest number. A staff asks you to stop, commit, and spend something — and what comes out is
enormous.

**(1) A staff has no auto-attack. It charges.**

Hold the attack button. The topper lights: a `glow.svg` core that grows, three `arcane_shard.svg`
(or the element's own sprite) orbiting faster as it fills, and a rune disc drawn on the ground at
your feet — `arcane_rune.svg` / `holy_rune.svg` / `frost_ring.svg` by element — expanding with the
charge. The `channel` clip plants the butt of the staff and raises your shoulders.

| held | power | radius | what you see |
|---|---|---|---|
| < 0.35 s | refuses | — | the topper flickers and goes out |
| 0.35 s | 0.60× | 0.7× | one shard orbiting, rune disc a thin outline |
| 1.40 s | **1.00×** | 1.0× | three shards, rune disc full, the topper is bright |
| 2.60 s | **1.60×** | **2.0×** | the rune disc cracks the ground, `ember`/`snowflake`/`spark` motes stream upward, the screen edges tint the element's colour |

Release fires the element's shaped spell at that power and radius. You move at **60%** while
channelling. A hit above 25% of your health **breaks the channel** and refunds the mana — which is
what makes a caster want a front line.

**(2) Every staff carries two spells, not one.**

`STAFF_SPELLS` already gives each element three or four shapes. Split them: **tap** fires the shaped
spell as it is today (free, 0.60×, weak); **hold** fires the charged version, and for three of the
four shapes the charged version is a different *kind* of thing:

| shape | tap | hold |
|---|---|---|
| `cone` | a short cone | **a sustained jet** — ticks 5×/s for as long as you hold, 4 mana/s, the cone lengthening from 6 m to 13 m |
| `nova` | a small ring | **a growing dome** that pushes everything out 2.4 m when it pops |
| `wave` | a line | **a wall that stays 3 s** and burns anything crossing it — this is what `SpellFx.ground()` (§4.4k) is for |
| `lob` | an arc shot | **a mortar you aim** — a targeting ring on the ground you move with the mouse, then it drops |

**(3) Mana is what makes it a decision.** A tap is free. Channelling costs **4 mana a second**. The
sustained jet costs 4/s while held. `maxMp` is `24 + 4/level + 2×int` (`data/balance.json` and
`js/rpg.js:487, 582`) — at level 20 with 30 int that is 164 mana, about 40 seconds of continuous
channelling, which is plenty in a fight and not infinite across one. `mpRegen` and `manaSteal` get a
job for the first time.

**(4) The topper says what it is.** Today `staff → 'staff_orb'` for every staff in the game
(`js/rpg.js:297`). Pick by element instead, from the five toppers that already exist
(`chibi2-gear.js:66-87`):

| element | topper | tint |
|---|---|---|
| fire | `staff_crystal` | ember, with a `flame.svg` at the tip |
| ice | `staff_crystal` | pale blue, frost |
| lightning | `staff_totem` | the ring throws `spark.svg` |
| poison | `staff_crook` | vine and leaves, already built |
| shadow | `staff_skull` | already built, and perfect for it |
| holy | `staff_orb` | gold, `holy_mote.svg` |
| arcane | `staff_orb` | violet, `arcane_shard.svg` orbiting |

**(5) A staff parries.** `guard: 0.10` — 10% block chance while held, and **a successful block does
not break a channel**. That is the reason to take a staff over a wand-and-shield.

**(6) And fix the nova.** §1.5 A.

### 7.3 Wand versus staff, in one line each

> **Wand** — point it and a bolt comes out. It never fails, it never runs dry, and the thing that
> makes one wand different from another is what the bolt *does* when it arrives.
>
> **Staff** — plant it, hold, and let it build. What comes out is much bigger than a bolt, and it
> costs you a moment standing still and a drink of your mana.

---

## 8. Balance pass

### 8.1 The one formula change

`js/rpg.js:596-599`. Today the weapon's dice and flat damage are added *before* the level multiplier,
which dilutes the weapon (§1.2). Change it so **the weapon's own dice scale with level and flat
damage does not**:

```js
// before
d.damage = [ (wd[0] + d.damageFlat) * scale * talentDmg * skill, … ];
// after
d.damage = [ (wd[0] * skill + d.damageFlat) * scale * talentDmg, … ];
```

with `damagePerLevel` **0.10 → 0.11** in `data/balance.json` to keep the overall level curve where
the simulator already tuned it. At level 20 this takes the greatsword-to-dagger ratio of average hit
from **1.99× to 2.91×** — the difference a player can see on the item card is finally the difference
they feel in the fight.

### 8.2 Constants to change, and where

| file | key | before | after | why |
|---|---|---|---|---|
| `js/rpg.js:596` | damage formula | `(wd + flat) * skill` | `(wd * skill + flat)` | §8.1 |
| `data/balance.json` `player` | `damagePerLevel` | 0.10 | **0.11** | compensate |
| `data/balance.json` `player` | `arrowSplash` | 2.6 | **0.9** | an arrow hits what you aimed at |
| `data/balance.json` `player` | `arrowRange` | 46 | 46 | unchanged |
| `data/balance.json` `player` (new) | `bowDrawMin` / `bowDrawFull` | — | **0.35 / 0.95** | the draw |
| `data/balance.json` `player` (new) | `bowPowerMin` / `bowPowerFull` | — | **0.55 / 1.60** | |
| `data/balance.json` `player` (new) | `crossbowReload` / `crossbowPower` | — | **1.25 / 1.80** | |
| `data/balance.json` `player` (new) | `javelinCarried` | — | **6** | |
| `data/balance.json` `player` (new) | `staffChargeMin/Full/Max` | — | **0.35 / 1.40 / 2.60** | |
| `data/balance.json` `player` (new) | `staffChannelMana` | — | **4** per second | |
| `js/weapons.js:102` | `TWO_HANDED_SCALE` | dead `damage: 1.25` | **delete it**; the 1.20 lives in `WEAPON_TRAITS` and applies to real two-handers | §1.4 (1)(2) |
| `js/weapons.js:498` | `OFFHAND_DAMAGE` | 0.62 | **0.60** | and the off hand now uses *its own* dice |
| `js/rpg.js` `derive` | — | — | add `d.offDamage`, computed from `equipment.offhand` exactly as `d.damage` is from `equipment.weapon` | kills the off-hand-dagger exploit (§1.4 (8)) |
| `js/main.js:5621` | impact gate | `if (element !== 'physical')` | **unconditional** | §1.5 C |
| `js/main.js:5516` | `spellfx.aoe` | `{ at, radius }` | `{ points: ringPoints(x, z, radius) }` | §1.5 A |
| `js/rpg.js:95` `attuneWeapon` | — | — | write `weaponCategory = 'light'` onto a `quarterstaff` item | §1.5 G. **On the item, never in `items.json`.** |

Every per-weapon `every`, `reach`, pattern and trait number is in §2, and all of them live in
`js/weapons.js` — pure data, no DOM, no Three.js, which is why the node tests can drive them.

### 8.3 Before and after — same arithmetic, same inputs

Level 20, 30 in the weapon's attribute, +12 flat, +8 quiver on ranged, +30% spellPower on casters,
single target, sustained, standing next to it.

| weapon | before dps | after dps | change | what changed |
|---|---|---|---|---|
| **javelin** | 422 | **180** | −57% | 6 carried, must be retrieved; range 46 → 28 |
| **crossbow** | 389 | **198** | −49% | 1.25 s reload; splash 2.6 → 0.9 |
| **bow** | 336 | **165** | −51% | draw; splash 2.6 → 0.9 |
| **shortbow** | 305 | **141** | −54% | as bow |
| **wand** | 302 | **185** | −39% | splash 2.2 → 1.3 |
| **staff** | 310 | **156** | −50% | charge + mana; but 2× radius at full charge and a sustained form |
| **quarterstaff** | 352 | **171** | −51% | reclassified to a real melee staff |
| dagger + dagger | 513 | **226** | −56% | family 0.80, own off-hand dice, interleaved hands |
| longsword + dagger | 490 | **244** | −50% | the exploit is gone; this is now an honest pairing |
| **greatsword** | 165 | **204** | **+24%** | 1.20 two-hander trait, `arc` finisher, faster clock |
| **two-handed axe** | 197 | **229** | **+16%** | `slam` finisher |
| **two-handed sword** | 177 | **192** | **+8%** | |
| **halberd** | 163 | **174** | **+7%** | plus 7.4 m thrust line and `brace` |
| **warhammer** | 162 | **160** | −1% | plus 0.65 s stagger, 2.2 m knockback and 7%/hit armour break |
| **hammer** | 152 | **154** | +1% | as warhammer |
| **iron mace** | 193 | **172** | −11% | |
| **battleaxe** | 164 | **164** | 0% | plus 3 stacks of bleed |
| longsword | 212 | **159** | −25% | |
| sword | 209 | **155** | −26% | |
| rapier | 271 | **184** | −32% | plus 40% armour pierce on the lunge |
| spear | 213 | **165** | −23% | plus a 6.2 m thrust line and the shield stays on |
| sabre (obsidian) | 276 | **250** | −9% | a later-act base; plus the free third strike |

**The shape of the result.** The spread across every option modelled goes from **3.38×**
(152–513) to **2.38×** (141–335). More importantly the *order* changes. Today the top eight entries
are **six ranged weapons and two off-hand-dagger exploits**, and every two-handed melee weapon sits
in the bottom seven. After, the top is melee: a late-act sabre pairing at 335, a sabre alone at 250,
a longsword-and-dagger at 244, a two-handed axe at 229 — and the best ranged option in the game, the
crossbow, is seventh at 198. Melee finally out-damages ranged when it is standing next to the thing,
which is the trade it is supposed to be making.

The remaining outlier is dual wielding at 335 — 1.6× a two-hander. That is deliberate but it is at
the top of the band, not beyond it, and it is paid for: no shield, no reach, and §3.5's rule that
the off hand can only swing inside the main hand's recovery. If play shows it is still too strong,
the lever is `OFFHAND_DAMAGE` (`js/weapons.js:498`), one number, and `tests/dps.test.js` will catch
the day it drifts.

Comparing the six **starter-tier** weapons like for like: longsword 159, sword 155, hammer 154,
bow 165, wand 185, staff 156. **Within about 20% of each other**, each with a completely different
way of getting there.

### 8.4 What is deliberately not being changed

* `arrowDamage` folding into `damageFlat` for ranged only (`js/rpg.js:580`) stays. With the draw in
  place the quiver is a reasonable reward for a slot melee spends on a shield.
* `spellPower` staying magic-only stays. It is the caster's version of the two-hander trait, and a
  branded melee weapon can reach it too.
* `FarShot` (`js/perks.js:164`) stays as it is. The bow's draw already costs it enough.

---

## 9. Work plan in phases

Six phases. Each ships on its own, each is testable, and **no phase depends on a later one**.
Phase 1 changes no balance number at all — it is pure feel — so it can go in and be played before
anything else moves.

### Phase 1 — Feel, with no balance change

**Touches:** `js/combat-fx.js` (rewrite), `js/main.js` (~60 lines at 5374, 5479–5640, 1507, 770),
`js/actors.js` (~30 lines in the movement block and `strike`/`strikeArea`), `js/player.js`
(~40 lines in the swing clock), `js/weapons.js` (physics fields on `STRIKES`), `js/settings.js`
(two toggles).

1. Physics fields on `STRIKES` (§2.1) — data only, no new shapes yet.
2. Hit-stop, screen shake, knockback, stagger, visual recoil (§3.1–3.4, §3.6).
3. Wind-up / active / recovery split, with the total cycle time held constant (§3.5).
4. Remove the `element !== 'physical'` gate on melee impact (`main.js:5621`).
5. Fix `spellfx.aoe` at `main.js:5516`.
6. Swap `SpellFx` → `BatchedSpellFx` at `main.js:770`.
7. Settings: `hitStop`, `screenShake`, both on by default.

**Tests**
* `tests/combat-feel.test.js` (node) — for every strike shape, `hitstop`, `push`, `stagger` and
  `shake` are present, finite, and inside their documented range. A `slam` pushes further than a
  `jab`. Diminishing returns: four staggers on one body sum to less than 3× the first.
* `tests/combat-feel.test.js` — **the cycle-time invariant**: for every base in `weaponBases`,
  `windMs + recoverMs <= every × 1000` and the sum of `every` over a full pattern is within 1 ms of
  what it is today. This is the test that proves phase 1 changed nothing numeric.
* `tests/combat-fx.spec.js` (Playwright) — load, spawn an enemy via `window.farhold`, swing, assert
  `spellfx.stats().live` rose and that `fx.stats()` shows an arc ribbon; assert the camera position
  moved and returned within 250 ms; assert the enemy's x/z moved away from the player after an
  overhead and did not after a jab.

### Phase 2 — Weapon identity

**Touches:** `js/weapons.js` (new shapes, new patterns, `WEAPON_TRAITS`), `js/main.js` `swingWith`
(trait dispatch), `js/rpg.js` `strike` (backstab, `pen`, armour break), `js/rpg.js` `attuneWeapon`
(quarterstaff reclass).

1. `arc`, `slam`, `lunge` shapes; the new patterns from §2.3.
2. `WEAPON_TRAITS` and the eight traits.
3. Backstab, `pierceLine`, `brace`, `flow`, `bleed`, `armourBreak`, `guard`.
4. Quarterstaff reclassified on the item.

**Tests**
* `tests/weapons.test.js` (extend) — one row per family asserting its pattern, reach, `every` and
  traits; that every two-handed melee base gets `damage: 1.20`; that `TWO_HANDED_SCALE` is gone.
* `tests/weapons.test.js` — **the polearm promise**: a halberd's thrust reach exceeds the largest
  `reach` in `data/enemies.json` by at least 2 m. This is the test that "polearms add range" is
  true and stays true.
* `tests/rpg.test.js` (extend) — a rear hit with a dagger is 2.2× a front hit; a hammer hit lowers
  the target's effective armour and never below 45% of base; a thrust with `pen: 0.4` beats a slash
  against a 100-armour target and loses against a 0-armour one.
* `tests/weapon-facts.test.js` (extend) — every base's card still states melee/ranged, hands and
  element after the changes.

### Phase 3 — Balance

**Touches:** `js/rpg.js:596` (formula) and `derive` (`offDamage`), `data/balance.json`.

**Tests**
* `tests/rpg.test.js` — the formula, at levels 1, 10, 20, 35, 50: a greatsword's average hit is
  between 2.6× and 3.2× a dagger's at every level.
* `tests/weapons.test.js` — the off hand uses its own dice: swapping a longsword off-hand for a
  dagger off-hand **lowers** total damage per second.
* **`tests/dps.test.js` (new)** — the §8.3 table as a test. For each base, compute damage per second
  from the real modules and assert it sits inside a band. The whole spread must stay under 2.6×, and
  the top of the table must be a two-handed melee weapon. This is the regression guard for every
  future weapon change.
* `npm run sim:farhold` — re-run and compare the funnel in `research/sim-report.md`.

### Phase 4 — Animation

**Touches:** `avatar-3d/js/chibi2-motion.js` (**SHARED**, 15 new clips, additive),
`avatar-3d/js/chibi2.js` (**SHARED**, the `grip` pose field and `socket()`),
`js/main.js:5374` (clip choice), `js/actors.js:42-51` (beast clip mapping for the new names).

**Tests**
* `avatar-3d/tests/chibi2.test.js` or a new `avatar-3d/tests/motion.test.js` (node) — every name in
  `CHIBI2_ANIMS` builds a clip; every clip has a duration above zero; `ONE_SHOTS` membership is
  right; **no existing clip's track count or duration changed** (a snapshot assertion, so Emberveil
  cannot regress).
* `prototypes/farhold/tests/anim.spec.js` (Playwright) — equip a dagger, a hammer, a bow, a wand and
  a staff in turn; for each, swing and assert `actor.currentClip` is the expected name.
* Screenshot both prototypes' character screens before and after into `test-results/`.

### Phase 5 — Graphics and grip

**Touches:** `avatar-3d/js/chibi2-weapons.js` (**new file**), `avatar-3d/js/chibi2-gear.js`
(**SHARED**, one dispatch line plus the shield moving from `handL` to `elbowL`),
`avatar-2d/js/parts/gear.js` (matching 2D pieces for the new ids), `js/rpg.js:291-300` (the mapping).

1. The parts vocabulary and the 15 weapon builders (§5.3).
2. The grip corrections (§6.3) — heads past the fingertips, shield on the forearm.
3. The two-hander left-hand pose, calibrated on `avatar-3d/kit.html`-style tuner.
4. The bow as a live socket group with a moving string.
5. Quality and rarity detail levels.

**Tests**
* `avatar-3d/tests/gear.test.js` (node) — every id in `HELD_BY_SUBTYPE` and `OFFHAND_BY_SUBTYPE`
  resolves to a builder; **no held id maps to a model of a different family** (a table assertion —
  this is the test that catches `greatsword → greataxe` coming back).
* `avatar-3d/tests/gear.test.js` — **the grip rule as an assertion**: for every haft weapon, the
  head's y is negative (past the fingertips) and the butt's y is positive.
* `prototypes/farhold/tests/gear.spec.js` (Playwright) — equip one weapon of every family and one of
  every rarity, screenshot each, assert the merged mesh triangle count stays under budget.

### Phase 6 — Staves and ranged

**Touches:** `js/weapons.js` (`STAFF_SPELLS` tap/hold split), `js/main.js` `swingWith` (the bow draw,
the crossbow reload, the javelin count, the staff charge), `js/player.js` (the hold timer),
`js/hud.js` (**3,000 lines** — the charge meter, the draw reticle, the javelin count: three small
additions, each its own function, no existing function edited),
`avatar-3d/js/spellfx.js` (**SHARED** — `trail()` and `ground()`, both additive).

**Tests**
* `tests/weapons.test.js` — every element has a tap and a hold form; the hold form's radius at max
  charge is 2× the tap's; the mana cost is 0 for a tap.
* `tests/skills.test.js` (extend) — channelling drains 4 mana a second and stops at zero; a hit over
  25% of maximum health breaks the channel and refunds.
* `tests/round14.spec.js` (Playwright) — hold to draw a bow: releasing at 0.2 s does not fire;
  releasing at 1.0 s does more damage than releasing at 0.4 s; the crossbow cannot fire during its
  reload; a thrown javelin appears on the ground and can be picked up; the javelin count reaches
  zero and the character swaps.

### 9.1 Big-file warnings

| file | lines | what phases touch it | how to keep it safe |
|---|---|---|---|
| `js/main.js` | 6,425 | 1, 2, 3, 4, 6 | Every change is inside `swingWith` (5479–5640), the clip choice (5374), `onEnemyKilled` (1507) or the frame loop. **Put hit-stop, shake and knockback in `js/combat-fx.js`, not in main.js** — main.js should gain one `fx.impact(...)` call per site, not thirty lines of easing. |
| `js/hud.js` | 3,026 | 6 only | Three new methods (`chargeMeter`, `drawReticle`, `ammoCount`). Do not edit an existing one. |
| `js/weapons.js` | 645 | 1, 2, 6 | Pure data and arithmetic — this is the right place for almost all of it. |
| `js/rpg.js` | 1,333 | 2, 3, 5 | `derive` and `strike` are the two functions; both are already long and well commented. |
| `js/actors.js` | 847 | 1, 4 | The enemy movement block at 486–560 and `strike`/`strikeArea` at 688–735. |

---

## 10. Shared-with-Emberveil register

Every file below is read by `prototypes/emberveil/` as well. Each change here must be **additive**,
must not alter an existing exported shape, and must be screenshotted in Emberveil before and after.

| file | change | risk | mitigation |
|---|---|---|---|
| `avatar-3d/js/chibi2-motion.js` | **15 new clips**, `CHIBI2_ANIMS` grows | low — Emberveil asks for clips by name and will simply never ask for the new ones | snapshot test that no existing clip's duration or track count changed |
| `avatar-3d/js/chibi2.js` | new `grip` avatar field; new `socket(bone)` method | low — both default to today's behaviour when absent | `grip` defaults to `'oneHand'`, which poses nothing |
| `avatar-3d/js/chibi2-gear.js` | one dispatch line into `chibi2-weapons.js`; **the shield moves from `handL` to `elbowL`** | **medium** — the shield move is visible in Emberveil | screenshot Emberveil's party stage before/after; the move is an improvement in both games, but it is a real visual change and the user should see it |
| `avatar-3d/js/chibi2-weapons.js` | **new file** | none | |
| `avatar-3d/js/spellfx.js` | `trail()` and `ground()` exported; nothing existing changed | low | both are new methods on the class |
| `avatar-2d/js/parts/gear.js` | ~10 new `held` pieces to match the new 3D ids | low | additive entries only |
| `prototypes/emberveil/data/items.json` | **NOT EDITED** — every Farhold-only fact is written onto the item in `attuneWeapon` (`js/rpg.js:95`), which is how `ranged`, `castElement`, `offHandOk` and all of `describeWeapon` already work | — | the quarterstaff reclassification in particular must go on the item, never in the file; Emberveil has a test that every affix in that file resolves |
| `prototypes/emberveil/js/loot.js` | **NOT EDITED** — the `Loot.price()` trap from round 10 still stands | — | Farhold's `rpg.price()` keeps overriding it locally |

---

## Appendix A — the measurement scripts

Both tables in §1.3 and §8.3 were produced by importing the real `js/weapons.js` and the real
`../emberveil/data/items.json` and reproducing `rpg.derive`'s arithmetic exactly. When phase 3 lands,
that script becomes `tests/dps.test.js` (§9, phase 3), so the table is a test rather than a document.

Inputs held constant across every row: level 20; 30 points in the weapon's own attribute
(`str` for heavy, `dex` for light, `int` for magic — `js/rpg.js:588`); `damageFlat` 12;
`arrowDamage` 8 on ranged; `spellPower` 0.30 on casters; no crit; no conditional affixes; one target.

The "10 s" column assumes a single enemy noticing you at `aggroRange` 30 and closing at the median
`speed` of 3.6 m/s from `data/enemies.json`, giving a melee character 2.5 usable seconds.

## Appendix B — every claim in §1, and how to re-check it

| claim | check |
|---|---|
| `TWO_HANDED_SCALE.damage` is dead | `grep -rn "TWO_HANDED_SCALE" --include=*.js .` → four lines, `damage` on none but the declaration |
| an arrow is a free 2.6 m area hit at full power | `js/main.js:754` + `js/actors.js:713` (`power = 1` default) |
| a bow's fire rate is the light-melee clock | `js/weapons.js:97` + `profileOf`'s fall-through at `:119` |
| melee impact is gated off | `js/main.js:5621` |
| staff novas draw nothing | `js/main.js:5516` against `spellfx.js:578` |
| a greatsword renders as an axe | `js/rpg.js:292` |
| there is no wand model | `js/rpg.js:297` → `chibi2-gear.js:167-173` |
| haft weapons have the head on the elbow side | `chibi2-gear.js:103, 110, 113, 117` against the bone-space comment at `:8` |
| a shield is gripped in the fist | `chibi2-gear.js:196, 231-236` |
| a bow never draws | `chibi2-gear.js:91-92` |
| no hit-stop, shake or knockback exists | `grep -rniE "shake|hitstop|timeScale|knockback|recoil" prototypes/farhold/js/ avatar-3d/js/ shared/` → comments only |
| every attack plays the same clip | `js/main.js:5374` |
| a kill draws nothing | `js/main.js:1507-1560` |
| statuses have no auras | `js/skills.js:26-42` — no `spellfx` reference in the file |
