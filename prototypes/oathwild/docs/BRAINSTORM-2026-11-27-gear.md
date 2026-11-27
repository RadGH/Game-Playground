# Brainstorm 2026-11-27 — gear upgrades like Diablo 2 (+ reports #139-145)

Owner (2026-11-27, phone, arena): "I haven't found much gear better than the starting items. I'd like gear to get
significantly better upgrades like d2. Plsplspls" — and report #142: "I found a blue 2h sword. It does only 1 more
damage than my white starting one hand sword. Please balance weapons more like diablo 2 such that better or higher tier
gear is significantly more damage, armor, or other stats. Considering enemy levels are adding 80hp each level one more
damage is not enough". #143: "Found plate boots from lv 1 arena but can't wear them until lv 4. Should be mail this early".

## Why found gear was flat (measured, js/rules + tools/sim-fights.mjs)

1. **A weapon's damage never grew with its item level.** Damage = the base's dice (Emberveil `items.json`) × quality.
   Item level only changed the extra lines (+4 Dexterity, +12 health). A level-3 longsword = a level-1 longsword.
2. **Rarity added no damage or armour.** A blue / yellow / orange item is the same base with a few extra lines.
3. **Quality could make a rare WORSE than a white.** low ×0.7 … elite ×1.4: the owner's "Wise Plate Boots" (rare, low
   quality) had 5 armour — less than the white starting coif.
4. **The hero's own level grew every weapon +8% a level** (attributes.json `meleePerLevel`), so the starting sword kept
   up by itself and nothing found could beat that by much.
5. Plate could drop at level 1 although plate asks for 13 Strength (most heroes reach it around level 4).

## The design (Claude's calls — the owner can overrule any)

| # | What | How it plays |
|---|---|---|
| 1 | **Item level grows the base.** Weapon damage +12% and armour (and a shield's block power) +10% per item level above 1 | A level-6 drop hits ~1.6× a level-1 one; every level of monsters you farm gives better bases |
| 2 | **Tier names** on the base: levels 1-3 plain, 4-6 *Steel* / *Tanned* / *Woven*, 7-9 *Tempered* / *Hardened* / *Silken*, 10+ *Runed* / *Drakehide* / *Spellwoven* (metal / leather / cloth) | You can read an upgrade from the name, like D2's Short Sword → Gladius |
| 3 | **Enhanced damage / armour by rarity** (D2's "+% Enhanced Damage"), rolled per item: Magic +20-40%, Rare +45-75%, Legendary +80-120%, Unique/Set +100-140% | The blue/yellow/orange colour now means real power, shown as its own line on the card |
| 4 | **Quality narrowed** to ×0.9 / 1.0 / 1.1 / 1.2 (was 0.7-1.6) | A rare can never be worse than the same white |
| 5 | **The hero-level weapon growth moves into the item** (`meleePerLevel` 0.08 → 0) | Your starting sword stays a level-1 sword; you must find or buy upgrades — the D2 loop |
| 6 | Magic weapons (wand, staff, orb, tome) grow the same way, so casters' spell power also follows their gear | Casters upgrade too |
| 7 | **Armour kind by item level (#143)**: plate only drops at item level 4+; below that a plate roll comes out as the same piece in mail | Level-1 arena gives mail boots you can wear |
| 8 | The card shows the line "+38% enhanced damage" and the tier in the item-level row; the compare rows (now → then) already show the gain | You see at a glance how big an upgrade is |
| 9 | Balance: the sim bot wears what a player would have (on-level white to level 3, blue from 5) and the monsters are retuned to `combat.json _goal` against that | Whites at your level ≈ today; blues and better are a clear step up |
| 10 | Items already in bags keep their numbers (new drops are simply better) | No save changes |

Not doing (parked, ask later): sockets / runes, crafting recipes, set bonuses rework, +skill levels on gear.

## Reports in the same round

- #139 Take button in the loot window does nothing (Take all works) — fix + test.
- #140 Arena reward chests: 4 drawn, 1 opens — each hero sees only their own; text counts right.
- #141 Spear drawn as the oak staff (gear.js WEAPON.spear = 'staff_oak') — a real spear.
- #144 Skills window's points-left bubble ticks down on learn.
- #145 Arena wall z-fighting — separate the coplanar faces.
