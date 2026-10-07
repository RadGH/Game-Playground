# The economy, measured (owner feedback 7, V2)

Made by `node tools/sim-economy.mjs` (`--before` = the data as committed in git before this round). The tool runs the real rules: real spawns and rank rolls for a kill's gold, real drops sold at the real sell price, the server's own quest / event / chest / fare functions, the shop's own price call, and `engine.fishing` cast by cast with pool depletion and the walk between pools. What it ASSUMES about how a person spends an hour is the `ASSUME` table at the top of the tool.

The rules the numbers serve are in `data/provinces/economy.json` `targets`; `tests/E/playtest7-economy.test.js` pins those ratios, never a gold amount.

## Before
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

## After
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

## Who owns which knob
- `data/rules/prices.json` (stream C's formulas; numbers tuned by E with the tool): a kill's gold, an item's list price, the sell-back factor.
- `data/rules/fishing.json` `value`: what turns a species' relative price into gold.
- `data/provinces/economy.json` (E): the purse unit (= one kill's gold) and quest multiplier, event / chest / treasure / road-chest gold, fares, mounts, the targets.
- `data/provinces/shops.json` (E): every fixed price (potions, food, rods, bait, the stable's shelf).
- `data/provinces/angling.json` (E): species and legend prices, the sunken-crate chance.

Try a knob without editing a file: `node tools/sim-economy.mjs --set=prices.gear.sellFactor=0.02 --set=fishing.value.mult=1.1`.
