# Farhold balance — 120 runs of 90 game-minutes (seeds 1–120)

Ran in 13.8s. The bot walks between settlements, fights what it meets, spends
every point it earns and wears anything better. It is a yardstick, not a good player.

## Where a run ends up

| | median | mean |
|---|---:|---:|
| level | 7 | 8.2 |
| kills | 76 | 78 |
| gold | 382 | 462 |
| gear score | 113 | 113 |
| deaths | 1 | 13.95 |
| jobs finished | 0 | 0.3 |
| survey | 42% | 40% |

Runs that never died: **34%**. Runs that died three or more times: **33%**.
Fights won: **12%** of those started.

## Time to level

| level | median minutes | runs that got there |
|---|---:|---:|
| 5 | 20.9 | 91% |
| 10 | 31.3 | 29% |
| 15 | 84.1 | 2% |
| 20 | — | 0% |
| 25 | — | 0% |
| 30 | — | 0% |

## What kills people

- Iron Marshal — 691
- Mire Drake — 340
- Sky Cultist — 200
- Carrion Moth — 146
- Hollow Wraith — 122
- Stone Sentinel — 67
- Road Brigand — 42
- Thicket Boar — 18

## The survey

| objective | finished in |
|---|---:|
| Cover ground | 99% of runs |
| Three worlds | 0% of runs |
| Six settlements | 11% of runs |
| Eight jobs | 0% of runs |
| A hundred kills | 25% of runs |
| Three ruins | 0% of runs |
| Something legendary | 63% of runs |
| Settle the grudge | 48% of runs |

## Coverage

Biomes walked across at least once: **19**.
Never once walked on: tundra, snowyPeaks, volcanic, blighted, veiledHills, hallowed.

Passive nodes taken per run: 1.1. Talents: 1.6.

## Travel

Median ground covered: **21.3 km**. Settlements reached: **1** of 12 on the world.
Runs that landed on a world with nobody on it: **35%** — there, the survey drops the objectives that need people (Campaign.fit).

## What this harness cannot do

Read the zeroes above with these in mind — some of them are the bot, not the game:

- **It never flies.** "Three worlds" needs the ship, and the bot only walks, so that line will
  always read 0%. Interplanetary travel is covered by the browser tests instead.
- **It never goes into a ruin.** A "clear" job sends it to a dungeon marker and it fights
  whatever the biome spawns, so "Three ruins" is a bot limit too.
- **It has no skill.** It stands and trades blows on the real attack clock and runs at 30%
  health. It does not kite, retreat uphill, pick its fights or use terrain, so the win rate is
  a floor, not a typical player.
- **It buys from a rolled shop, not a real merchant**, because merchants live in the browser.
