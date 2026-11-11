# Rogueloot items — how the whole thing works

Plain-language guide to the item data in `data/` for the owner and for whoever builds M6 (items), M8 (loot) and
M17 (crafting). Every number quoted here is in the JSON; if the two ever disagree, the JSON wins and this page is
out of date.

Files:

| File | What it holds |
|---|---|
| `data/item-bases.json` | 169 base items (93 droppable in Act 1), the damage/armour ladders, weapon kinds, who may use what |
| `data/affixes.json` | 24 prefixes + 29 suffixes, each with up to 8 tiers (423 tier rows), the tier-pick rule, affix counts per rarity |
| `data/rarity.json` | drop chances by area level and monster kind, item level rules, gear score, gold, chests, the expected-per-hour targets the bot sim checks |
| `data/currency.json` | 12 crafting shards + dust, their grades, drop weights, salvage yields, vendor rules, the anti-"set for life" rules |
| `data/uniques.json` | 27 uniques (25 for Act 1 Normal, 2 for Veteran) |
| `data/legendaries.json` | 22 legendary powers, 5 per Path + 2 for anyone |

## 1. The one-paragraph version

Every item is a **base** (a Footman Sword, a Hide Jerkin) with an **item level** stamped on it by the zone it dropped
in. A **rarity** roll decides whether it is white, magic (1-2 affixes), rare (3-6), unique (fixed) or legendary (a rare
plus one power that changes a skill). Affixes come in **tiers**; the strong tiers need a high item level, so the
best rolls only exist on items from hard zones. Crafting **shards** reroll or add affixes, but a shard has a **grade**
set by where it came from, and it can never roll above its grade or above the item's own level. Your **gear score**
is the weighted average item level of what you wear. Drops are stingy, D2-style: you will see about one rare an hour
at level 1 and three an hour at level 20.

## 2. Anatomy of an item

```
Warden Blade                      <- base name (rare: "Gorebrand Warden Blade", a generated two-word name)
Sword   one-handed   1x3 cells    <- kind, hands, grid shape in the 10x4 bag
18-30 damage, 1.2 attacks/sec     <- from the base + quality + affixes
Item level 20   Requires level 16, 43 Strength, sword proficiency
Honed (+5 physical damage)        <- prefix, tier 3
Brutal (+31% physical damage)     <- prefix, tier 3
of Strength (+6)                  <- suffix, tier 3
of Cinders (+9% fire resist)      <- suffix, tier 2
```

Fields a programmer needs, all in `item-bases.json`:

- **slot** — head, chest, hands, belt, feet, neck, ring, weapon, offhand. Two rings, and a second weapon+offhand pair
  for the swap (ruling 28).
- **kind** — sword / dagger / axe / mace / sceptre / greatsword / greataxe / maul / spear / polearm / bow / crossbow /
  staff / wand, and for armour the slot word, plus shield / focus / quiver / belt / ring / neck. Affixes and legendary
  powers are keyed by kind.
- **grid** — `{w, h}` cells. Ring 1×1, belt 2×1, dagger 1×2, sword 1×3, axe 2×3, polearm/spear/staff 1×4,
  two-handed sword/axe/maul 2×4, bow/crossbow 2×3, armour 2×2 (head, hands, feet) or 2×3 (chest), shield 2×2-2×3,
  focus 1×2, quiver 1×3. Nothing is taller than 4 so everything fits the bag.
- **proficiency** — an armour weight (cloth, leather, mail, plate) or a weapon class. The `proficiency` table in the
  same file says what each Path may use (section 4).
- **levelReq** and **req** — character level and minimum attributes. The attribute asked for is the weapon's primary
  (Strength for swords, axes, maces, polearms; Agility for daggers, bows, crossbows; Intellect for wands, staves;
  Spirit for sceptres), at `8 + 2.5 × level`. Characters start at 12 in every attribute and get 5 a level, so three
  points a level into your main attribute keeps every weapon of your level usable; two a level does not, and that is
  the point of the choice.
- **dropLevel** — the lowest item level that can roll this base. **tier** — plain (1-20), fine (21-40), masterwork
  (41-60): the same shapes with bigger numbers, like D2's normal / exceptional / elite.
- **damage** `{min, max, speed, dps}` for weapons; **armour** for armour; **block** `{chance, amount}` for shields;
  **implicit** for the few bases that carry one (wands, sceptres, staves and foci give spell power; belts give potion
  slots; quivers give attack speed).
- **look** — a short hint for the Chibi 2.6 model.

## 3. The two ladders everything scales from

**Weapon damage.** A one-handed weapon at drop level L does `4 + 1.5L + 0.02L²` damage a second before affixes
(5.5 at level 1, 21 at level 10, 42 at level 20, 112 at level 45). Two-handers get 1.35× that, bows 1.2×, crossbows
and spears 1.25×, wands 0.6× (they also carry spell power). Per-hit damage is dps ÷ speed spread over ±25%. A dagger
swings 1.6 times a second, a sword 1.2, a maul 0.7. **Monster health should be tuned so a same-level normal monster
dies in six to ten weapon hits** — this ladder is the fixed point; monsters move to meet it.

**Armour.** Reduction = `armour / (armour + 10 × attackerLevel + 50)` (ruling 41: armour diminishes against higher
attackers). A full plate set of your own level adds up to 60% reduction against a same-level attacker; mail is 80%
of plate, leather 60%, cloth 45%. The chest carries 35% of the set's armour, head 20%, feet 15%, hands 12%, belt 8%,
shield 10%. A level-10 Breastplate is 79 armour; a level-10 attacker's pool is 150, so the chest alone is 34%.
Tooltips must show the percentage against a same-level attacker, computed from the player's level, or the number
means nothing.

## 4. Who can use what

| Path | Armour | Weapons | Off hand |
|---|---|---|---|
| Wanderer (levels 1-2) | cloth, leather | dagger, sword, mace, bow, wand, staff | shield, focus, quiver |
| Fighter | + mail | dagger, sword, axe, mace, polearm, crossbow | shield, quiver |
| Rogue | cloth, leather | dagger, sword, axe, bow, crossbow, polearm; **dual wields** dagger/sword/axe | quiver, shield |
| Mage | cloth only | wand, staff, dagger | focus |
| Healer | cloth, leather | mace (and sceptres), staff, wand, sword | shield, focus |

At the spec pick (level 10): every Fighter spec adds **plate**; the **Paladin** hybrid adds mail and plate and the
Fighter's weapons; the **Spellblade** hybrid adds leather and swords. Mage stays cloth so that cloth is never a
dead weight class. Plate bases start dropping at item level 10 for the same reason.

## 5. Rarities

| Rarity | Affixes | Drops identified? | Name |
|---|---|---|---|
| normal | none | yes | base name |
| magic | 1-2 (60% one, 40% two) | yes | "Keen Footman Sword of Rime" (affix names) |
| rare | 3-6 (more 5s and 6s at higher item level) | **no** | a generated two-word name + base |
| unique | fixed (uniques.json) | no | its own name |
| legendary | 3-5 affixes + one power | no | "Oxhide Grip Hide Gloves" (power name + base) |

An item holds at most three prefixes and three suffixes and only one affix per **group** (so never two different
flat elemental damages, but +fire% and flat fire together is fine because those are different groups).
Right-click identifies for free (ruling 40). Unidentified items can be traded — a gamble for the buyer.

## 6. Affix tiers and item level

Every affix has up to eight tiers. **Tier numbers go up with power** (tier 1 is the weakest — the opposite of PoE's
numbering, stated here so nobody flips it). The tier ladder is item level 1 / 8 / 15 / 23 / 32 / 42 / 52 / 62:

- tiers 1-3 are all Act 1 Normal can roll (item level reaches ~22-24 with boss bonuses)
- tiers 4-5 are Veteran / Act 2 (item level 23-41)
- tiers 6-7 are Legend / Act 3 (42-61)
- tier 8 only exists on item level 62+, meaning a boss drop at area level 60 in Legend

Which tier an eligible affix rolls: each tier open at that item level has a base weight (100, 80, 62, 48, 36, 26, 17,
10 — the newest tier is never the most likely) multiplied by a fade so that old tiers stop clogging high items: full
weight for 10 levels past the tier's start, then falling to a floor of 0.2. At item level 20 that is 34% tier 1,
36% tier 2, 30% tier 3.

**Item level is not character level.** A level-20 player farming a level-8 zone gets item level 8 drops with
tier-1 and tier-2 affixes. And a finished item's level requirement rises with its best affix: `max(base level,
ceil(0.8 × the ilvlMin of its best tier))`. A tier-3 roll (ilvl 15) on a level-1 ring makes it a level-12 ring. So a
level-6 character handed a tier-4 item by a friend cannot wear it until 19.

## 7. Gear score

`round( Σ slotWeight × (itemLevel + rarityBonus) / Σ slotWeight )` over the ten worn slots (weapon 2.0, off hand
1.0, chest 1.5, head 1.0, hands and feet 0.75, neck 0.75, belt 0.5, rings 0.5 each; a two-hander fills both weapon
weights). Rarity bonus: magic +1, rare +3, unique +4, legendary +5. An empty slot counts as zero but keeps its weight,
so a missing off hand hurts. A zone's recommended gear score is its level minus 2.

## 8. Drops

Personal loot: every player rolls their own. Per kill: first *whether* an item drops (normal monsters 16% at level 1
rising to 24% at 20; champions, rares and bosses always), then *how many* (nearly always one), then for each item a
**rarity** from the weight table interpolated at the area level, times the monster kind's multiplier (champion ×2 on
rare/unique/legendary, rare monster ×3 and nothing below magic, boss ×5 and one guaranteed rare, act boss ×6 with
two). Item level = area level + 0 / 1 / 2 / 3 / 4 for normal / champion / rare / boss / act boss, capped at 65.

Then separately — never competing with items — gold (35-45% of kills, `(2 + 1.2 × level) × 0.6-1.4`), potions,
and a currency shard (5% at level 1 to 13% at 60; champions ×3, bosses ×10).

Magic find from gear multiplies the rare/unique/legendary weights by `1 + (mf/100) / (1 + mf/250)`: 50% is ×1.42,
100% is ×1.71, 200% is ×2.11. It never changes how many items drop.

Each extra player in the area adds +3 points to everyone's item chance and +15% gold, on top of everyone rolling
their own (ruling 5).

The `expected` block in rarity.json is what these weights produce for a solo hour (150 kills, 6 champions, 2 rare
monsters, half a boss, 3 chests) and is the band the bot sim must stay inside (±30%):

| Area level | Items/h | Rares/h | Hours per unique | Hours per legendary |
|---|---|---|---|---|
| 1 | 44 | 0.9 | 7 | 24 |
| 5 | 47 | 1.2 | 4 | 12 |
| 10 | 50 | 1.8 | 2.4 | 6 |
| 15 | 54 | 2.5 | 1.7 | 4 |
| 20 | 57 | 3.4 | 1.2 | 2.7 |
| 40 (Veteran) | 62 | 6.6 | 0.7 | 1.4 |
| 60 (Legend) | 67 | 11.5 | 0.4 | 0.9 |

Over a 10-hour Act 1 at half an hour a level that is about 18-22 rares, 4 uniques and 2 legendaries. Scarce, never
zero (ruling 38).

## 9. Currency and crafting

No gathering. Twelve shards, each doing one thing, PoE-style:

| Shard | Does | From area level | Sold? |
|---|---|---|---|
| Glimmer | normal → magic | 1 | yes |
| Tangle | reroll a magic item's affixes | 2 | yes |
| Bloom | add the second affix to a one-affix magic item | 3 | yes |
| Crown | magic → rare, keeps affixes, adds one | 5 | no |
| Blank | strip back to normal (never a unique or legendary) | 4 | yes |
| Polish | reroll the numbers inside the current tiers (works on uniques and legendaries) | 6 | no |
| Churn | reroll a rare's affixes — the bread and butter | 8 | no |
| Graft | add an affix to a rare with fewer than six | 12 | no |
| Pare | remove one random affix | 14 | no |
| Wager | normal → random rarity: magic 70 / rare 25 / unique 4.5 / legendary 0.5 | 7 | no |
| Whet | +5% quality (damage or armour), max 20%, survives everything | 5 | yes |
| Anchor | lock one chosen affix through the next Tangle or Churn | 18 | no |

Plus **Shard Dust**, the small change: 20 make a Glimmer.

**Grades are the gate.** Every shard has a grade — Rough (item level 1-14), Cut (15-29), Keen (30-44), Flawless
(45-65). A drop's grade follows the *area* level; a salvaged shard's grade follows the *item* level of what you
broke. When a shard rolls affixes it rolls at `min(item level, grade cap)`. So a Rough Churn on an item level 40
rare rolls as if it were item level 14 — tiers 1-2 only — and a Keen shard on an item level 12 rare still only
reaches tier 2, because the item's own level is the other ceiling. Grades convert up 5:1 for a gold fee, one grade at
a time, and down 1:3 free.

Why you cannot be set for life at level 10 (all in `currency.json antiSetForLife`): the item level never rises
(there is deliberately no shard for it); the shard grade is a second ceiling; the level requirement rises with the
best tier; the vendor sells only the five shaping shards, grade 1, ten a day; Anchor never drops below area 18 and is
never sold; uniques and legendaries can only be Polished.

**Salvage** breaks an item for dust plus 0-3 shards drawn from a per-rarity list at the item's grade — a rare gives
Tangle/Bloom/Crown/Churn/Polish, a unique or legendary gives Churn/Graft/Polish and always a Polish, and nothing ever
gives Anchor. Every 5% quality on the broken item adds a dust.

The crafter in town shows the roll level and the reachable tiers **before** you confirm, and logs every shard
action (item before and after) so a bug report can show what happened.

## 10. Uniques and legendaries

**Uniques** (27) sit on a base and keep its grid, damage and armour (`baseMult` can scale it); their stats roll
once inside a range at drop and only a Polish can reroll them; about half carry a `rule` no affix gives (Foxfire Bow
converts 30% of its physical damage to fire; Sunder Pick stacks an armour shred; Shepherd's Crook splashes heals).
Levels run 2 to 19 for Act 1 Normal, with Kingsmoot (24) and Cinder Idol (28) waiting for Veteran. Pick weights
favour the low ones so that the early game's rare unique is a Toll Ring, not a Stormcrow Band.

**Legendaries** (22) are the loot chase (ruling 18): a random base rolled like a rare, plus one power. Each power
changes *how* a Path skill works — Cleave becomes a full circle, Charge gets two charges that refill on a kill,
Firebolt leaves burning ground, Smite heals the most injured ally, Rebuke taunts an area. Five per Path, two for
anyone (auto-attack leech; a belt whose potions sometimes are not used up). The `rule` object on each is the
programmer's contract (`type` names the hook, the other fields are its numbers). The skill ids
(`fighter_cleave`, `mage_firebolt`, …) are the only coupling to M9: if M9 names a skill differently, change the id in
`legendaries.json`, nothing else. A power for a skill you do not have does nothing and says so in grey.

## 11. Worked examples

### What a level-6 player finds in an hour (area level 6, solo)

About 47 equipment items: ~38 white, ~8 magic, 1 rare (1.3 expected — some hours none, some two), a one-in-four
chance of a unique, a one-in-twelve chance of a legendary. The rare and the unique drop unidentified. Around 700 gold
(150 kills at 37% × ~9 gold, plus champions ×3 and a chest or two), about 20 potions, and 9-11 Rough shards —
mostly Glimmer, Tangle and Blank, probably a Whet, maybe a Crown. Salvaging the magic items you do not want gives
another 2-4 Rough shards and a pile of dust. The whites sell for 5-15 gold each; a Rough Glimmer costs 60 from the
vendor, so selling eight whites buys one.

The rare: say a River Sabre (item level 6, tiers 1 and 2 only — tier 2 opened at 8, so tier 1 everywhere): 10-16
damage at 1.2/sec becomes, with Honed +2, Brutal +12%, of Agility +2, of Rime +5%: 13-20, about 20 dps against the
white's 15.5. A clear upgrade, not a different game. That is the stingy feel: whites are the floor, a magic item is
a small step, a rare is a good day.

### A crafted rare at item level 12 against a dropped rare at item level 20

You are level 14, holding an item level 12 River Sabre (10-16, 15.5 dps) and a stack of Rough Churn Shards from
salvaging. Item level 12 opens tiers 1-2; Rough caps the roll at 14, which changes nothing here. The best a Churn
can possibly give: Honed tier 2 (+4), Brutal tier 2 (+25%), of Strength tier 2 (+4): `(10+4)…(16+4) × 1.25 =
17-25`, **25 dps**, level requirement 7. Realistically after ten Churns you have something like 22 dps.

Then you walk into a level-20 zone. A *white* Warden Blade dropped there is 18-30 at 1.2 — **29 dps** — and
already beats the perfect craft. A rare Warden Blade with tier-3 Honed (+7) and Brutal (+38%): `(18+7)…(30+7) ×
1.38 = 34-51`, **51 dps**, twice the crafted sabre. Now use the Rough Churns on *it*: the roll is capped at 14, so
it can only reach tier 2 again — `(18+4)…(30+4) × 1.25`, 42 dps. To roll tier 3 you need a **Cut** Churn, which only
drops from area 13 up or salvages out of an item level 15+ rare. The crafting you did at 12 was worth doing (it got
you through 12-19) and worth nothing after.

### Gear score

A level-10 Fighter in mostly item level 8-10 whites with a rare breastplate (ilvl 10 + 3) and a magic mace (ilvl 9
+ 1), no off hand: weights sum to 9.25; the empty off hand contributes 0 → gear score ≈ 9. Picking up any round
shield takes it to ~10. The level-10 zone recommends 8, the level-13 zone 11.

## 12. Things a programmer must know

1. **Units.** `units: "flat"` is a plain number. `units: "pct"` is whole percentage points: 12 means 12%. There
   are no fractions anywhere in these files. Convert in ONE function. A previous game shipped two readers that
   disagreed about 0.02 vs 2 and printed "+1993%".
2. **Tier numbers count up.** Tier 1 is the weakest. `ilvlMin` is item level, never character level.
3. **Damage order on a hit:** `(base + physDamageFlat [×1.5 on two-handers] + attackPower/14) × (1 + physPct/100)`,
   then each elemental flat × its element %, then crit (base 150% + critDamage), then the target's armour or resist.
4. **Only one affix per group** on an item; prefixes and suffixes max three each.
5. **Smart roll** for personal loot: affixes useless to the player's Path get weight 0.25, not zero. Off-proficiency
   bases are 20% of drops so there is always something to trade.
6. **Level requirement** of a finished item = `max(base.levelReq, ceil(0.8 × best affix tier's ilvlMin))`. Recompute
   after every shard.
7. **Shard roll level** = `min(item.ilvl, grade.rollCap)`. Show it on the crafter screen before the confirm.
8. **Validation on join/trade (ruling 8)** has everything it needs here: a base id must exist, an affix id must
   exist and allow the item's kind, each affix value must sit inside a tier whose `ilvlMin ≤ item.ilvl`, no two
   affixes share a group, counts fit the rarity, `ilvl ≤ 65`, unique stats inside their ranges, legendary power's
   kinds include the item's kind and `ilvlMin ≤ ilvl`, quality ≤ 20.
9. **Gold** values and the gambler's rarity table are in `rarity.json gold`. Identify is free. Sell is 20%.
10. **The bot sim (M12)** must report rares / uniques / legendaries / shards per hour against `rarity.json expected`
    (±30%) and the gear score of its character against the zone level.

## 13. Decisions taken that the owner may want to overrule

- Mage is cloth-only; Spellblade (hybrid) gets leather at 10.
- Rogue is the only dual-wielder (daggers, swords, axes).
- Rare monsters do not guarantee a rare item (that alone doubled the rare rate); bosses guarantee one, the act boss
  two, and the act boss's first kill has a 50% unique chance.
- Potion belt slots are 2 / 3 / 4 / 4 / 5 by belt (the phone has one potion button; slots are how many are queued).
- Quality (Whet) tops out at 20% and survives every other shard.
- There is no "raise item level" shard on purpose.
