# The economy, measured

Made by `node tools/sim-economy.mjs`. The tool runs the real rules: real spawns and rank rolls for a kill's gold, real drops sold at the real sell price, the server's own quest / event / chest / fare functions, the shop's own price call, and `engine.fishing` cast by cast. What it ASSUMES about how a person spends an hour is the `ASSUME` table at the top of the tool. Every number on this page is pasted from the tool's output (`docs/economy/y31-before.txt`, `y31-after.txt`).

## Two kinds of hour — read this first

- An **ideal hour** is what the tool's activity rows count: 4 quests and 32 kills, or 85 kills, back to back, with no walking to find the quest giver, no bag sorting, no dying. It is the right unit for comparing one activity with another (is fishing worth doing next to questing?). It is NOT what a player earns in an hour.
- A **real hour** is `ASSUME.real`: a person gets through **38%** of an ideal questing hour, and spends **16%** of play gathering or fishing (which earns 85% of what questing would, and no combat experience). Those two numbers are fitted to the one measured point we have — the owner's own character had **3,445 gold in total at level 9** after a few hours (feedback report #36). The tool's own count at level 9 is within 1% of that, reached after about four hours.

Until round 10 this page quoted ideal hours as if they were income ("2,435 gold per hour of questing at level 5"). They were several times too high as a statement of what a player has to spend, and every price was set against them. That is what the owner ran into: "the gold costs are too high now, gear is unaffordable".

**One income table.** `data/rules/prices.json` `income.lifetime` = `[level, gold earned in total on reaching it]`. It is written by `node tools/sim-economy.mjs --write-income` from the tool's real-play count, with row 9 pinned to 3,445; the tool refuses to write if its own count is more than 15% from that point. The Unbinder's price (stream C) and every "minutes of play to afford" figure below read that one table. Run `--write-income` after any change that moves what a kill, a quest or a sold drop pays.

## Owner feedback 10 (Y31), 2026-10-13 — prices re-fitted to real income

The targets: an **uncommon** piece about every **20-30 minutes** of real play, a **rare** about every **1.5-2 hours**, potions trivial, sell-back less stingy if income allows. `data/provinces/economy.json` `targets` holds them (`uncommonMinutes`, `rareMinutes`, `potionMinutesMax`, `sellBack`, `soldShareMax`, `mountHours`, `ownerPoint`) and `tests/E/playtest7-economy.test.js` pins them at levels 1, 5, 9, 15, 20 and 30.

### Before (prices as committed before this change, measured against the same income)
```
REAL PLAY — BEFORE (data as committed in git) — a real hour gets through 38% of an ideal questing hour, 16% of play is gathering or fishing (ASSUME.real)
the income is data/rules/prices.json income.lifetime; the sim's own count of gold in total at level 9 is 3423 (the owner's character: 3,445), reached after 4.09 hours
                                 level 1   level 5   level 9  level 15  level 20  level 30
minutes to gain the level             33        28        26        25        24        16
hours played to get here             0.0       2.3       4.1       6.6       8.7      12.4
gold earned in total                   0      1075      3445      9420     16420     33665
  the sim's own count                  0      1069      3423      9375     16349     33545
GOLD PER REAL HOUR                   271       925      1822      3003      3806      5746
  all questing                       276       939      1860      3063      3886      5870
  all killing                        161       838      1567      3105      3934      6582
  all events                         245       875      1525      2658      3442      5277
  all dungeon                        767      1509      2065      4383      4232      8267
  all fishing                        256       645      1291      2164      3371      3875
  all mining                         228       748       772      2029      3043      5231
  all logging                        241       683       876      1789      3081      4946
  all foraging                       238       812       806      2398      3554      5689
  sold loot, share of income          8%       18%       20%       29%       29%       33%
PRICE                            level 1   level 5   level 9  level 15  level 20  level 30
uncommon piece                       506      2080      3512      6137      8278     12493
rare piece                          2207      9344     16014     27398     36507     54575
legendary piece (worth)             8207     30476     56691     87235    117366    184891
  an uncommon sells for         6 (1.2%) 24 (1.2%) 42 (1.2%) 73 (1.2%) 99 (1.2%)149 (1.2%)
  a rare sells for             26 (1.2%)112 (1.2%)192 (1.2%)328 (1.2%)438 (1.2%)654 (1.2%)
healing potion                        30        30        30        30        30        30
best mount you may ride              750      4200      4200     33000     33000     33000
waystone, 2 km                        21        21        21        21        21        21
Unbinder, all talents back            25       160       515      1415      2465      5050
PLAY TO AFFORD IT                level 1   level 5   level 9  level 15  level 20  level 30
uncommon piece                   112 min   135 min   116 min   123 min   131 min   131 min
rare piece                         8.1 h    10.1 h     8.8 h     9.1 h     9.6 h     9.5 h
legendary piece                   30.3 h    32.9 h    31.1 h    29.1 h    30.8 h    32.2 h
healing potion                   6.6 min   1.9 min   1.0 min   0.6 min   0.5 min   0.3 min
greater healing potion            24 min   7.0 min   3.6 min   2.2 min   1.7 min   1.1 min
best mount you may ride          166 min     4.5 h   138 min    11.0 h     8.7 h     5.7 h
waystone, 2 km                   4.6 min   1.4 min   0.7 min   0.4 min   0.3 min   0.2 min
waystone, 8 km                    14 min   4.2 min   2.1 min   1.3 min   1.0 min   0.7 min
ash rod                            5.0 h    88 min    45 min    27 min    21 min    14 min
```

### After
```
REAL PLAY — working tree — a real hour gets through 38% of an ideal questing hour, 16% of play is gathering or fishing (ASSUME.real)
the income is data/rules/prices.json income.lifetime; the sim's own count of gold in total at level 9 is 3412 (the owner's character: 3,445), reached after 4.09 hours
                                 level 1   level 5   level 9  level 15  level 20  level 30
minutes to gain the level             33        28        26        25        24        16
hours played to get here             0.0       2.3       4.1       6.6       8.7      12.4
gold earned in total                   0      1075      3445      9420     16420     33665
  the sim's own count                  0      1066      3412      9332     16263     33343
GOLD PER REAL HOUR                   271       925      1822      3003      3806      5746
  all questing                       276       935      1851      3044      3864      5831
  all killing                        161       829      1544      3062      3883      6489
  all events                         244       868      1511      2631      3410      5226
  all dungeon                        762      1500      2055      4342      4203      8172
  all fishing                        255       644      1286      2156      3361      3863
  all mining                         228       748       772      2029      3043      5231
  all logging                        241       683       876      1789      3081      4946
  all foraging                       238       812       806      2398      3554      5689
  sold loot, share of income          8%       17%       19%       28%       29%       33%
PRICE                            level 1   level 5   level 9  level 15  level 20  level 30
uncommon piece                        99       411       694      1214      1637      2472
rare piece                           420      1794      3078      5270      7023     10502
legendary piece (worth)             1607      6016     11203     17249     23212     36576
  an uncommon sells for         5 (5.1%) 24 (5.8%) 41 (5.9%) 72 (5.9%) 98 (6.0%)148 (6.0%)
  a rare sells for             25 (6.0%)107 (6.0%)185 (6.0%)315 (6.0%)421 (6.0%)630 (6.0%)
healing potion                        10        10        10        10        10        10
best mount you may ride              400      1800      1800      9000      9000      9000
waystone, 2 km                        13        13        13        13        13        13
Unbinder, all talents back            25       160       515      1415      2465      5050
PLAY TO AFFORD IT                level 1   level 5   level 9  level 15  level 20  level 30
uncommon piece                    22 min    27 min    23 min    24 min    26 min    26 min
rare piece                        93 min   116 min   101 min   105 min   111 min   110 min
legendary piece                    5.9 h     6.5 h     6.1 h     5.7 h     6.1 h     6.4 h
healing potion                   2.2 min   0.6 min   0.3 min   0.2 min   0.2 min   0.1 min
greater healing potion           8.0 min   2.3 min   1.2 min   0.7 min   0.6 min   0.4 min
best mount you may ride           89 min   117 min    59 min   180 min   142 min    94 min
waystone, 2 km                   2.9 min   0.8 min   0.4 min   0.3 min   0.2 min   0.1 min
waystone, 8 km                   9.5 min   2.8 min   1.4 min   0.9 min   0.7 min   0.4 min
ash rod                          100 min    29 min    15 min   9.0 min   7.1 min   4.7 min
```

### What moved, and why
- **Gear** (`prices.json` `gear`): `45 + 144 x level` -> `8.5 + 28.5 x level`, about a fifth. Rare multiplier 11 -> 10.7. Slots, the other rarities and the extras are untouched.
- **Sell-back** (`gear.sellFactor`, and `economy.json` `sell.factor`, which a test keeps equal): 1.2% -> 6%. Five times the share of a price a fifth the size, so **a sold drop pays the same gold it did** and nobody's income moved. The owner's aim was 15-25%. The tool says no (`--set=prices.gear.sellFactor=0.1` / `0.15`): at 10% a character has 3,796 gold at level 9 instead of 3,445, sold loot is 29-45% of an hour's gold from level 9 up and killing out-earns questing by a third at level 30; at 15% it is 4,272 gold, 38-55%, killing out-earns questing by a half and fishing falls to 55% of questing. Loot is found faster than gear is bought, so a merchant paying a fifth of the price turns selling into the main income.
- **Shop goods** (`shops.json` `kinds.*.goods`, then `node tools/content-shops.mjs`): every fixed price to a third, never under 5 gold (one level-1 kill). Round 7 had tripled them to suit the ideal hour. Healing potion 30 -> 10, greater healing 108 -> 36, ash rod 1,350 -> 450, river warden's rod 7,200 -> 2,400, trail rucksack 2,400 -> 800. `data/provinces/angling.json` `tools` / `bait` carry the same rod and bait prices and were moved with them.
- **Mounts** (`economy.json` `mounts` + the stable's shelf): 750 / 4,200 / 16,500 / 33,000 -> 400 / 1,800 / 5,300 / 9,000 — one and a half to three hours of real play at the level each opens, where the last two were eight to eleven.
- **Waystones** (`economy.json` `fare`): `6 + metres / 135` -> `3 + metres / 200`. Still dearer than the ox-cart over the same road.
- **Not moved:** what a kill, a quest, an event or a chest pays; fish and material values; ox-cart fares (7-10 gold to the next town); the Unbinder's shares (15% of lifetime gold for everything, 515 gold at level 9 as before — above level 9 it now follows the tool's table rather than a placeholder, so it is 2,465 at level 20 where it was 2,910).
- **The tool itself:** from level 6 up an hour's quests are sampled from all the province's level 6+ quests. The province has twelve quests of level 8-10 and most are dungeon and story steps, so the old sample made an ideal level-9 questing hour read 9,789 gold, between 2,450 at level 5 and 8,349 at level 15.

### Known gap (not fixed here)
Gathering at level 9 earns 42-47% of questing (rows `all mining / logging / foraging` above): a level-9 character has skill 41 and is still on tier-2 nodes worth the same as at level 5. The professions test checks levels 1, 5, 10 and 20, where the rule (70-100%) holds. It needs a node tier or a material value, which is profession content.

## The ideal hour, for comparing activities (after)
```
THE ECONOMY — working tree — gold per hour, everything sold
activity          level 1    level 5    level 9   level 15   level 20   level 30
questing              726       2461       4870       8011      10168      15344
killing               423       2182       4063       8057      10219      17076
events                641       2285       3976       6924       8974      13752
dungeon              2005       3947       5409      11425      11061      21505
fishing               672       1694       3385       5674       8844      10165
fishing p10-p90   578-776  1389-2004  3089-3752  5190-6156 7516-10268 8585-11957
legend (once a zone)    not yet    not yet    not yet    not yet 6899g/1.8h 7214g/1.8h
fishing / questing       93%        69%        70%        71%        87%        66%
```
The ratio rules (fishing 65-105% of questing, killing 50-130%, events, dungeons) are pinned on these, in `economy.json` `targets`.

## Who owns which knob
- `data/rules/prices.json`: a kill's gold, an item's list price, the sell-back factor, `income.lifetime` (written by the tool), the Unbinder's shares.
- `data/rules/fishing.json` `value`: what turns a species' relative price into gold.
- `data/provinces/economy.json`: the purse unit (= one kill's gold) and quest multiplier, event / chest / treasure / road-chest gold, waystone and cart fares, mounts, the targets.
- `data/provinces/shops.json` `kinds`: every fixed price (potions, food, rods, bait, the stable's shelf). `roles` is generated from it by `tools/content-shops.mjs`.
- `data/provinces/angling.json`: species and legend prices, the sunken-crate chance, and a second statement of rod and bait prices that a test keeps equal to the shelf.

Try a knob without editing a file: `node tools/sim-economy.mjs --levels=1,5,9,15,20,30 --set=prices.gear.sellFactor=0.1`.

## History (rounds 7 and 8) — hours below are IDEAL hours and the prices are superseded

### Round 7: before
```
THE ECONOMY — BEFORE (data as committed in git) — gold per hour, everything sold
activity          level 1    level 5   level 10   level 20
questing              283       1723       8855      23999
killing               412       3341      17642      53282
events                285       1294       5711      16655
dungeon               851       2037       2975       8016
fishing               380        783       1879       3552
fishing p10-p90   356-405    712-851  1703-2114  3195-3956
fishing / questing      134%        45%        21%        15%
PRICES                level 1    level 5   level 10   level 20      hours of questing to buy (same columns)
plain gear                  8          8         16         40         0.03   0.00   0.00   0.00
uncommon gear              17         16         34         85         0.06   0.01   0.00   0.00
rare gear                  37         37         74        184         0.13   0.02   0.01   0.01
legendary (worth)         287        406        630       1298         1.01   0.24   0.07   0.05
  sells: uncommon           4          4          8         21         0.01   0.00   0.00   0.00
  sells: rare               9          9         18         46         0.03   0.01   0.00   0.00
healing potion              9          9          9          9         0.03   0.01   0.00   0.00
greater healing            20         20         20         20         0.07   0.01   0.00   0.00
travel rations              2          2          2          2         0.01   0.00   0.00   0.00
hearty stew                 6          6          6          6         0.02   0.00   0.00   0.00
best mount                 60        240        900       1600         0.21   0.14   0.10   0.07
unbind a talent            68        100        140        220         0.24   0.06   0.02   0.01
unbind a perk              92        140        200        320         0.33   0.08   0.02   0.01
waystone 2 km               7          7          7          7         0.02   0.00   0.00   0.00
waystone 8 km              22         22         22         22         0.08   0.01   0.00   0.00
hazel rod                   4          4          4          4         0.01   0.00   0.00   0.00
ash rod                    60         60         60         60         0.21   0.03   0.01   0.00
one kill pays          4+0.84 37.64+1.66198.97+8.57615.28+11.57      (coin + sold drops)
FISH  46 species: common 1-5 g (20), uncommon 8-15 g (14), rare 22-30 g (8), epic 70-80 g (4); legends 120-120 g; sunken crate 4.0% of casts
fishing an hour:  L1: 150.8 fish, 7.28 crates, 0 legends, 35.49 pools | L5: 133.98 fish, 6.3 crates, 0 legends, 31.13 pools | L10: 136.17 fish, 6.32 crates, 0 legends, 31.14 pools | L20: 141.09 fish, 6.55 crates, 1 legends, 31.71 pools
```

### Round 7: after
```
THE ECONOMY — working tree — gold per hour, everything sold
activity          level 1    level 5   level 10   level 20
questing              727       2435       5610      10549
killing               424       2084       5230      11080
events                644       2253       4640       9213
dungeon              1942       4663       6509      13914
fishing               671       1731       5609       9072
fishing p10-p90   580-776  1437-2019  5155-6063 7679-10737
legend (once a zone)    not yet    not yet    not yet 6899g/1.8h
fishing / questing       92%        71%       100%        86%
PRICES                level 1    level 5   level 10   level 20      hours of questing to buy (same columns)
plain gear                208        802       1611       3182         0.29   0.33   0.29   0.30
uncommon gear             508       2098       4005       7949         0.70   0.86   0.71   0.75
rare gear                2327       8841      17907      35003         3.20   3.63   3.19   3.32
legendary (worth)        7794      33842      58514     125190        10.72  13.90  10.43  11.87
  sells: uncommon           6         25         48         95         0.01   0.01   0.01   0.01
  sells: rare              27        105        215        420         0.04   0.04   0.04   0.04
healing potion             30         30         30         30         0.04   0.01   0.01   0.00
greater healing           108        108        108        108         0.15   0.04   0.02   0.01
travel rations              9          9          9          9         0.01   0.00   0.00   0.00
hearty stew                27         27         27         27         0.04   0.01   0.00   0.00
best mount                750       4200      16500      33000         1.03   1.72   2.94   3.13
unbind a talent            68        100        140        220         0.09   0.04   0.02   0.02
unbind a perk              92        140        200        320         0.13   0.06   0.04   0.03
waystone 2 km              21         21         21         21         0.03   0.01   0.00   0.00
waystone 8 km              65         65         65         65         0.09   0.03   0.01   0.01
hazel rod                  12         12         12         12         0.02   0.00   0.00   0.00
ash rod                  1350       1350       1350       1350         1.86   0.55   0.24   0.13
one kill pays          4+0.99 15.55+8.9726.17+35.3743.45+86.91      (coin + sold drops)
FISH  62 species: common 1-5 g (24), uncommon 3-28 g (21), rare 28-54 g (10), epic 50-232 g (7); legends 2400-6300 g; sunken crate 4.0% of casts
fishing an hour:  L1: 168.41 fish, 8.24 crates, 0 legends, 39.56 pools | L5: 167.85 fish, 8.09 crates, 0 legends, 38.63 pools | L10: 178.29 fish, 8.03 crates, 0 legends, 40.27 pools | L20: 203.12 fish, 8.77 crates, 0.56 legends, 44.71 pools
```

### Round 7: who owned which knob (superseded by the list above)
- `data/rules/prices.json` (stream C's formulas; numbers tuned by E with the tool): a kill's gold, an item's list price, the sell-back factor.
- `data/rules/fishing.json` `value`: what turns a species' relative price into gold.
- `data/provinces/economy.json` (E): the purse unit (= one kill's gold) and quest multiplier, event / chest / treasure / road-chest gold, fares, mounts, the targets.
- `data/provinces/shops.json` (E): every fixed price (potions, food, rods, bait, the stable's shelf).
- `data/provinces/angling.json` (E): species and legend prices, the sunken-crate chance.

Try a knob without editing a file: `node tools/sim-economy.mjs --set=prices.gear.sellFactor=0.02 --set=fishing.value.mult=1.1`.

### Owner feedback 8 (W4, W19, W22) — stream C, 2026-10-08

**Experience from kills** (`node tests/C/xp-walk.mjs`; the hour is the `ASSUME` table above: 85 kills grinding, 4 quests + 32 kills questing). A monster of level 6 or lower pays x2.25 of Farhold's kill share instead of x1.5, fading back to x1.5 at monster level 14 (`data/rules/progression.json xp.killEarly`). The grey-con rule is unchanged.
```
BEFORE (killMult 1.5)
level  xp-to-next  xp/kill  kills-to-level  minutes(grind)  minutes(quest)  kill-share-of-questing  grind/quest xp
    1          58        4              15              10              15                     57%            151%
    2         153      7.4              21              15              16                     42%            111%
    3         237     10.6              22              16              18                     42%            112%
    4         316     23.2              14              10              13                     52%            137%
    5         393     26.3              15              11              13                     45%            119%
    6         468     26.8              17              12              14                     42%            111%
    7         539     27.2              20              14              11                     30%             81%
    8         610     38.7              16              11              10                     35%             92%
    9         680     46.4              15              10               7                     25%             66%
   10         748     69.2              11               8               6                     31%             82%
   11         815     69.9              12               8               6                     29%             78%
   12         881     78.2              11               8               6                     30%             80%
level 1 -> 10: 155 kills, 109 minutes killing, 117 minutes questing
AFTER (monsters up to level 6 pay x2.25, fading to x1.5 at level 14) (killMult 1.5)
level  xp-to-next  xp/kill  kills-to-level  minutes(grind)  minutes(quest)  kill-share-of-questing  grind/quest xp
    1          58        5              12               8              13                     62%            165%
    2         153     11.1              14              10              13                     52%            138%
    3         237     15.9              15              11              15                     52%            139%
    4         316     34.8               9               6              10                     61%            163%
    5         393     39.4              10               7              10                     55%            146%
    6         468     40.1              12               8              11                     52%            138%
    7         539     39.2              14              10              10                     39%            103%
    8         610     53.2              11               8               9                     42%            112%
    9         680       61              11               8               6                     30%             80%
   10         748     86.6               9               6               6                     36%             95%
   11         815     82.9              10               7               6                     33%             88%
   12         881       88              10               7               6                     33%             86%
level 1 -> 10: 108 kills, 76 minutes killing, 97 minutes questing
```
**Gold after W4 / W19 / W22** (`node tools/sim-economy.mjs`, working tree): backpacks drop (priced by their room: the `back` price x (1 + 0.15 x bag slots)), light items no longer do. `tests/E/playtest7-economy.test.js` 9/9.
```
THE ECONOMY — working tree — gold per hour, everything sold
activity          level 1    level 5   level 10   level 20
questing              727       2450       5867      10468
killing               424       2175       5992      11073
events                644       2292       4837       9232
dungeon              1942       3734       6264      11998
fishing               675       1670       5568       8618
fishing p10-p90   580-790  1401-1952  5166-6018  7302-9931
legend (once a zone)    not yet    not yet    not yet 6899g/1.9h
```
Killing at level 10 moved from 5,230 to about 6,000 gold an hour (a backpack sells for more than the lantern it replaced in the drop table); every ratio the economy test pins still holds.

### Owner feedback 8 — stream E (2026-10-08)

- **Ox-cart fares** — economy.json `cart {base 3, metresPerGold 250, minGold 4}`; the table for every pair of towns is data/provinces/carts.json `fares`. Next town from Torborhold 7-10 gold (about 1% of a level-1 hour of questing), the dearest ride in the province 93 gold. Always under a waystone for the same road.
- **Quests against kills (W4)** — `quest.xpMult` 1.5. `node tools/sim-economy.mjs --curve` prints kills and minutes to each level 1-10 by killing alone and by questing: `curve-before.txt` (before stream C raised kill experience), `curve-kills-only.txt` (C's change alone: questing was slower than killing up to level 6), `curve-after.txt` (now). Rule in economy.json `targets.questXp`.
- **Guards** — `raid-guards.txt` (`node tools/sim-raid.mjs`).
- **Professions** — the simulator prints `tools/sim-professions.mjs` `extraRows()` rows under the main table when that file exists.
