# Bannerline — shelved and parked work

Everything that is deliberately NOT done, each with a one-line reason and where its notes live.
Bring these up when a round turns to polish or balance. Snapshot at release, 2026-10-04.
Open cross-stream items are also tracked in `docs/requests.md` (unchecked `- [ ]` lines).

## Balance (owner: "forget snowballing, balance later")

| Item | Why parked | Notes |
|---|---|---|
| Income / snowball tests: "income at minute 10 in the model's band", "no runaway income" | Owner said balance later; growth is bounded by the Keep guard and the Rising Tide for now | `tests/economy-bounds.test.js` (skipped, reasons inline); `tools/econ-sim.mjs` (advisory, `--strict` to gate) |
| Race x hero balance — **Freeholds + Pyromancer wins 89%** of pairings | Roster of 48 units and 5 heroes never tuned against each other | `tests/matchups.test.js` (skipped); `node tools/matchups.mjs` |
| Feel pass follow-up | Done once (2026-10-03): matches ~17 min, tiers 3-6 get 33% of send gold, items / Drill Yard / powers win 58 / 66 / 63% for the side using them. Spell items still pay only for the Pyromancer (the Engineer's and Druid's damage is turrets / pets) | `docs/requests.md` "Stream A feel pass"; `node tools/feel-report.mjs 32` |
| AI: the Commander barely buys items | Its build favours sends and the Drill Yard; E improved the Veteran's shopping (deny test 28% -> 47%) but not the Commander's item value | `~/claude/agent/bannerline/E-checklist.md` round 3; `js/sim/ai/shop.js` |
| Hunters vs Farmers balance | Advisory model only: farmers have little to hide in the first two minutes, most downs happen in chases, most 3v1 matches end on the clock, Recruit farmers out-earn Veterans | `docs/requests.md` "(E -> lead) HvF balance notes"; `tools/hvf-econ-sim.mjs` |
| HvF **Commander vs Veteran hunter gap** is ~0 (23 vs 22 downs of 80) | Hunters act alone: a real gap needs hunter teamwork (splitting up, driving a farmer into a partner, ambushes at a farm). Farmhouse-first and grave-camping were added and did not open the gap | `~/claude/agent/bannerline/E-checklist.md` round 3; `docs/hvf-PLAN.md` §10 (the bar: Commander beats Veteran ≥ 60%) |
| HvF AI start-of-match spike | Ticks 1-2 of a 9v3 with nine AI farmers take 36-42 ms (every farmer scores hollows at once); staggering the first think per seat would spread it | `docs/requests.md` "(H -> E) Start-of-match spike" |

## Content

| Item | Why parked | Notes |
|---|---|---|
| Campaign chapters for the Ranger ("The Long Watch"), Pyromancer ("Ashes and Oaths"), Druid ("The Green Pact"), Engineer ("Iron and Gears") | Only the Warrior chapter "The Iron Oath" (5 missions) was built; the others are stubs (`status: planned`) so the map shows them | `data/campaign/index.json`; mission format in `docs/interfaces.md` §13 |
| Future modes: **Tower defense**, **Lanes and towers (MOBA)**, **Heroes and Empires** | Owner R2.20: planned, not scheduled. The mode registry (own map, roles, unequal teams, own data, own pipeline, own commands) was built so they are not blocked | `js/sim/modes/index.js` (PLANNED list, greyed on the mode screen); `docs/hvf-PLAN.md` §19 |
| Hunters vs Farmers sound ids (bleat, cluck, oink, moo, bell, horn, hawk, chop, snare, ward pull) | Need new recipes in `sfx/` (catalog + synth methods), a separate piece of work | `docs/requests.md` "(C -> lead) NOT done: the HvF sound ids"; `docs/hvf-PLAN.md` §14 |

## Hunters vs Farmers — parked from `docs/hvf-PLAN.md`

| Item | Why | Where |
|---|---|---|
| Fog is enforced on the client (full state on every machine) | Lockstep needs the whole state everywhere; accepted for friends' games, a cheater could read it | hvf-PLAN §4, §21 risk 3 |
| Generator taste | Metrics can't tell a fun forest from a dull one; owner play-tests are the check. Forest share runs 45-68% (plan said 35-55%; a 50% map read as a park) | hvf-PLAN §3.4, §21 risk 1; `data/hvf/mapgen.json` `_doc` |
| AI farmers that hide well | Hard; feel tests are the bar and Recruit farmers hiding badly is accepted | hvf-PLAN §21 risk 2 |
| Mode title | Owner chose "Hunters vs Farmers"; "Fold & Fang" is not used anywhere | hvf-PLAN header |

## Online

| Item | Why parked | Notes |
|---|---|---|
| **Cloudflare relay transport** (`js/net/cfrelay.js` is a stub) | PeerJS's public broker works for most home networks; the relay is for strict NATs / corporate networks and needs a Cloudflare account, `wrangler`, a ~100-line Worker with one Durable Object per room, and a TURN key | `docs/online.md` §4; wire protocol in the stub's header |
| No host migration | If the host leaves the match ends ("Host left — match ended"); simpler and rare among friends | `docs/PLAN.md` §11.5 |

## Performance

| Item | Why parked | Notes |
|---|---|---|
| **Real-hardware bench numbers** | The VM renders headless with SwiftShader (software), so frame times here are not the owner's; only draw calls / triangles / animation CPU are comparable. The owner needs to open `bench.html` on his desktop, press "Run all cases" and paste the result into `docs/bench/owner.json` | `docs/PLAN.md` §15.2; `docs/bench/headless-swiftshader.json`; `~/claude/agent/bannerline/C-checklist.md` |

## Small leftovers (code)

| Item | Why | Notes |
|---|---|---|
| `js/sim/shop.js` `aiShopping` / `aiHealSlot` are no longer called | The AI's town decisions moved to `js/sim/ai/shop.js` + `town.js`; safe to delete, left for stream I | `docs/requests.md` "(E -> I)" |
| PLAN.md still describes the removed stock system, the deck, Oil and "Muster" | It is the historical spec; the owner reversals are recorded in `README.md` "For future Claude" and `docs/requests.md` | `docs/PLAN.md` §2-§3 |
| Older unchecked lines in `docs/requests.md` (Muster Hall model, the round-2 UI port notes, stealth draw, C's art hand-offs to B/H) | Most were superseded (the Muster Hall became the Barracks) or done without the box being ticked; check the line's newest reply before acting on one | `docs/requests.md` |
