# Farhold — ambient world events, redesigned

*Design document. Nothing here is implemented yet. Written 2026-09-20.*

> **On line numbers.** Every `file:line` below is against the working tree of 2026-09-20.
> `js/main.js` is 6300+ lines and was being edited by another agent while this was written, so its
> numbers drift by a dozen either way — grep the quoted code, not the number. Everything in the
> smaller modules is stable.

The ask, in the user's words:

> "There are events that happen very frequently in the chat like 'something out there has your
> measure and …'. They happen too often, and they aren't represented on the minimap or in game very
> well. Can you have a redesign agent plan out how to make these events more impactful, clearly
> visible, and less generic?"

> "Add a 'Nearby Activities' area below the minimap when walking around, similar to World of
> Warcraft's quest log. It should show what nearby activities are available including the ones that
> pop up in chat or have a location nearby. These should also appear in the journal with a button to
> view location. In the world, there should be a large animated pointer above the location or object
> to help the player find it, and a radial arrow pointing to it when its off-screen."

Two faults are being reported and they have **different causes**. Keeping them apart is the whole of
this document:

* **Too frequent** — a rate problem, and under it four outright bugs that re-fire lines that were
  only ever meant to fire once. Fixing the bugs cuts the volume more than any tuning knob does.
* **Too generic** — a content problem. A line that names nothing has nothing to look at, so it can
  never be anything but chatter, however rarely it fires. This is the half that also makes the
  events invisible: **a line with no place cannot be put on a map**, and roughly a third of them
  genuinely have no place.

---

## 0. The line the user quoted, found

```
data/incidents.json:31   "blurb": "something out there has your measure and has told its friends",
```

It belongs to the `grudge` incident (`data/incidents.json:28-34`). Here is its whole life:

| where | what happens |
|---|---|
| `data/incidents.json:30` | `"starts": { "playerBeaten": true }` |
| `js/main.js:4484-4488` | `enterTerritory` calls `trouble.consider(zone, { …, playerBeaten: !!campaign.nemesis })` |
| `js/incidents.js:88-92` | `playerBeaten` is a **forced** start: `chance` is 1, no roll |
| `js/territory.js:416-421` | `addIncident` refuses a duplicate **of the same kind in the same zone** |
| `data/incidents.json:28` | `"hours": null` — it never expires; only finishing the `the_grudge` job clears it |
| `js/main.js:4510` | `for (const row of trouble.describe(zone.id)) hud.log(\`${zone.name}: ${row.blurb}.\`, 'bad');` |
| `js/main.js:5906` | `if (here && here.id !== boardZone) enterTerritory(here);` — **every frame the zone id changes** |

So: the moment the player dies once and gets a nemesis, `grudge` is forced onto **every zone they
walk into, forever**, and its blurb is re-logged on **every** `enterTerritory`. It never expires, so
the line is printed again on every single re-entry for the rest of the run.

There are four separate reasons `enterTerritory` re-fires for ground the player never left:

**B1 — open water is a zone.** `js/zones.js:156-166`: anything not inside a region returns the
`OPEN` sentinel with `id: -1`. Wading into a river, a lake or the sea sets `boardZone = -1`; the
first step back onto land is a fresh `enterTerritory` on the zone you were already standing in. On a
world with rivers this fires several times a minute. It also re-runs `announceZone` ("Open water —
level 1–4"), re-runs `trouble.consider`, re-populates the wanderers, and hears another rumour
(`js/main.js:4503-4507`).

**B2 — dusk and dawn clear the board.** `js/main.js:4624` sets `boardZone = null` on every day/night
phase change, deliberately, so the notice board is rebuilt with whoever is on the road now. That is
right. Re-logging every running incident because of it is not. Twice per in-game day.

**B3 — `describe()` is a status readout used as an announcement.** `js/incidents.js:139-147` returns
*everything currently running*. `js/main.js:4510` prints all of it as news. An incident that started
forty minutes ago is not news.

**B4 — `grudge` starves every other incident.** `js/incidents.js:93-101` loops the eligible list and
**returns on the first one that fires**. `grudge` sits fourth in `data/incidents.json`, ahead of
`feud`, `bloom`, `collapse`, `ash_fall`, `fair_day`, `quarantine`, `bounty_up`, `road_out`. Once the
player has a nemesis, `grudge` is forced, so it is picked first and returns — and none of the eight
interesting ambient incidents can ever start in a zone the player is newly entering. The blandest
line in the file is also the only one the player ever sees. That is not a coincidence; it is the
mechanism.

**B5 — two clocks disagree about an hour.** `js/main.js:5907` runs `tickTerritory(0.5)` every 30
frames, and `js/main.js:4631` passes `seconds / 60` into `holdings.tick(hours)`. At 60 fps that is
**one territory hour per 60 real seconds**. The sky runs at `balance.json` `sky.dayLengthSeconds:
900` — **24 hours per 900 real seconds, i.e. one sky hour per 37.5 real seconds**. So a 24-hour
incident (`ash_fall`, `fair_day`) lasts 24 real minutes, which is 1.6 in-game days by the sun. Fix
by deriving the territory step from `dayLengthSeconds` so "48 hours" means two visible sunrises.

---

## 1. The spam audit

Rates are for a player walking on the surface at 60 fps. "Placed?" means *the code already knows an
x/z for it* — that is what decides whether it can ever become a pin.

| # | Source | Fires from | Rate | Placed? | Verdict |
|---|---|---|---|---|---|
| 1 | **Set-piece encounters** (11 in `data/encounters.json`) | `js/encounters.js:390-393` → `:217` | `everySeconds 26` × `chance 0.55`, shared with #2 — **one line every 47 s** | **Yes** (`x, z` on the record, `js/encounters.js:212`) | **The main offender.** ~76 lines an hour, each a mood sentence with no name, no place and no pin. "A warband is coming up the road" — which road? |
| 2 | **Road events** (11 in `data/events.json`) | `js/encounters.js:282` | same roll as #1 | **Yes** (`ev.x, ev.z`, and `enc.events` already exports them with `left` seconds) | **Good content, invisible.** A rescue with a 90-second clock and a real reward is announced in one line and then never mentioned again. `encounters.events` (`js/encounters.js:425-436`) is a ready-made activity feed **that nothing reads**. |
| 3 | **Event outcome lines** (`win` / `fail`) | `js/encounters.js:316-380` | one per event that resolves or times out | Yes | Keep. These are the pay-off. They currently drown in #1. |
| 4 | **Site announcements** | `js/main.js:5638-5643` ← `js/sites.js:1073-1082` | `due()` at 150 m, re-armed by `relax()` at 420 m | Yes | **Re-fires.** Walk 420 m away from a bandit camp and back and it announces itself again. One line per camp per approach, forever. |
| 5 | **Incident blurbs** | `js/main.js:4510` | every `enterTerritory` — see B1–B3 | **No** (a zone, not a spot) | **Noise.** A zone-wide state read out as an event. This is the quoted line. |
| 6 | **Zone banner + log** | `js/hud.js:462-483` | every border cross; `announcedZone` guards repeats, but `OPEN` breaks the guard | Zone | Keep the banner; it is good. Drop the duplicate log line and stop announcing `OPEN`. |
| 7 | **Rumours** | `js/rumours.js:131-156`, called `js/main.js:4503-4507` and on wanderer talk | one per `enterTerritory` (so, same re-fire as #5) | **No, by design** (`js/rumours.js:10-13`: "a SENTENCE, with no pin") | Correct as designed, **wrong as delivered**. A rumour is a thing you go and read in the Journal, not a line that scrolls past during a fight. |
| 8 | **Caravan events** | `js/main.js:4629-4631` | `caravan-attacked` / `-wrecked` / `-arrived`, driven by `js/caravans.js:91-130` | **Yes** (`event.x, event.z`) | **Under-used.** "The Ninth Load is under attack" with a position and no marker is the single clearest missed activity in the game. |
| 9 | **Meteor** | `js/main.js:3310-3332` | `meteors.everySeconds 300` × `chance 0.6` → one every ~8.3 min; **3 lines** (warn, land, crater seam) | Yes, and it now has a `fall` marker (`js/markers.js` MARKER_LOOKS) | **Already right.** This is the model the rest should copy: warning → 30-second travel time → marker → a thing on the ground. |
| 10 | **Landmarks** | `js/main.js:3147`, `:3230` | on interacting | Yes | Fine, player-triggered. |
| 11 | **Zone changed hands / incident-over** | `js/main.js:4626-4645` | territory tick | Zone | Rare and meaningful. Keep. |
| 12 | **Wanderer / patrol arrivals** | `js/wanderers.js:49-56` via `roadFolk.populate` | silent — no log at all | Yes (`folk.marks()`, `js/main.js:6040`) | **The opposite fault.** 1–4 real people with real offers appear in the zone and the game says nothing. |

### The log is a 12-line window

`js/hud.js:421-429` keeps 12 lines. At source #1's rate alone, ambient chatter rewrites **the entire
visible log every 9½ minutes** — and that window is shared with every hit, heal, level, loot and
quest line. The generic lines are not just annoying; they are actively pushing out the feedback the
player needs.

### Two faults, stated separately

**Frequency.** After B1–B4 are fixed, the true ambient rate is: one encounter/event announce every
47 s, plus whatever the player walks past. That is still about double what it should be for
something that carries no information.

**Genericness.** Counting the strings: of the 11 set-piece announces in `data/encounters.json`, **11
name nothing** — not a creature, not a faction, not a place. Of the 11 in `data/events.json`, **11
name nothing**. The only line in the whole ambient layer that names a real object is the one added
at `js/encounters.js:216`: `— out of ${owner.name}`, and it only appears when a hostile site happens
to be within `OWNED_BY = 380` metres (`js/encounters.js:86`). The data to fix this is all present —
`data/enemies.json` has 46 enemies with names, `data/factions.json` has 12 factions with short
names, `js/town.js:151-174` builds a named roster per settlement, `js/wanderers.js` names every
person on the road — it is simply never reached for.

---

## 2. The rate plan — one purse, spent on the best thing available

### Where it lives

A new pure module, `js/ambient.js` (no DOM, no Three.js, so `node --test` drives it). It owns:

* the purse and its refill
* the no-repeat window
* the tier decision (§3)
* the "what did I already say" ledger

Everything that currently calls `hud.log` with an ambient line calls `ambient.offer(...)` instead,
and `ambient` calls `hud.log` at most as often as the purse allows. **One choke point.** Today there
are seven.

### The purse

```js
// js/ambient.js
export const PURSE = {
  perMinute: 2.0,      // ambient points earned per real minute, walking on the surface
  cap: 4.0,            // …and never bank more than two minutes' worth
  cost: { flavour: 1, activity: 2, zone: 4 },
  quietAfter: { flavour: 20, activity: 8, zone: 0 },  // seconds of silence owed after each
};
```

Reading it plainly: **at most two ambient lines a minute, and never two flavour lines inside 20
seconds.** A tier-C zone event costs four points, so it cannot fire twice in two minutes even if the
world wants it to.

Three things spend nothing and are never throttled, because they are consequences of what the
player did rather than chatter: event `win`/`fail` lines (source #3), meteor lines (#9), and
territory flips (#11). Combat, loot and quest lines never touched the purse in the first place.

The purse **refills faster when nothing is happening** and not at all during a fight:

```js
tick(dt, { fighting, inTown, inDungeon }) {
  if (fighting || inDungeon) return;          // nothing ambient during a fight, ever
  const rate = inTown ? 0.6 : 1;              // a town has its own noise
  this.points = Math.min(PURSE.cap, this.points + rate * PURSE.perMinute * dt / 60);
}
```

`fighting` is already available: `field.engaged` (used at `js/main.js:5652`).

### `offer()` — the one entry point

```js
/**
 * Something wants to speak. Returns the line to print, or null.
 *   ambient.offer({ id, tier, text, at: {x, z}, kind, ttl, reward })
 * `id` is what the no-repeat window remembers. `at` is what makes it a pin.
 */
offer(ev) {
  if (this.points < PURSE.cost[ev.tier]) return null;
  if (this.quietUntil > this.now) return null;
  if (this.said.has(ev.id)) return null;        // see below
  …
}
```

### No repeats, borrowed from Lingo

`lingo/js/lingo.js:247-256` is exactly this problem solved once already:

```js
const strict = ctx.noRepeat === true || this.noRepeat.has(symbol);
const window = strict ? hist.slice(-Math.max(0, Math.min(this.sessionRecentSize, scored.length - 1))) : [];
let pool = scored.filter(x => !window.includes(x.e.id) && …);
if (!pool.length) pool = …;   // never ban the whole pool
```

The rule worth copying verbatim is the last line: **the window is capped at `pool.length - 1`, so it
can never empty the pool.** With 11 encounter announces, a window of 10 means you see all eleven
before you see any of them twice — and the eleventh is still reachable.

Farhold does not use Lingo for the ambient layer (`js/speech.js` is the only Lingo consumer, and it
is for town NPCs), so `ambient.js` gets a 30-line copy of the idea rather than an import:

```js
// js/ambient.js
class SaidBook {
  constructor(size = 24) { this.size = size; this.hist = new Map(); }   // pool key → [id, id, …]
  /** Ids that are off the table for this pool right now. Never all of them. */
  window(pool, n) {
    const h = this.hist.get(pool) || [];
    return new Set(h.slice(-Math.max(0, Math.min(this.size, n - 1))));
  }
  mark(pool, id) { … }
}
```

Three pools: `encounter`, `event`, `incident`. And one hard rule on top, which is the user's actual
complaint: **an exact sentence never appears twice in a run.** `ambient.said` is a plain `Set` of
`${id}:${zoneId}` for tier A and B; a tier-C zone event keys on `${kind}:${zoneId}` so a zone can
run out of things to announce and go quiet, which is correct — a place you have worn out should be
quiet.

### What each source draws

| Source | Tier | Cost | Notes |
|---|---|---|---|
| Set-piece encounter (#1) | **A** flavour normally, **B** when it is a champion/rare or has an `owner` | 1 / 2 | Most warbands are flavour. A rare with an escort is an activity. |
| Road event (#2) | **B** always | 2 | Every one has a clock, a place and a reward. That *is* tier B. |
| Site announcement (#4) | **B**, once per site per run | 2 | And `sites.js` must stop re-arming — see the work plan. |
| Incident (#5) | **C** on the frame it *starts*, silence thereafter | 4 | `trouble.consider` already returns the row that started (`js/incidents.js:98-101`); that return value is the event. `describe()` goes back to being a status readout for the HUD and the Journal, which is what it was written as. |
| Rumour (#7) | **none** — never logged | 0 | Goes to the Journal's "Word going round" pane with an unread count. One quiet line, once, when the pane gains its first entry: *"You heard something worth remembering."* |
| Caravan (#8) | **B** for attacked, **A** for arrived/wrecked | 2 / 1 | Attacked is a thing you can run to. |
| Wanderer (#12) | **B**, silent | 0 | Never logged, but it gets a row in the Nearby panel. Silence plus a row is the right trade. |

### The result

Set pieces alone drop from ~76 lines an hour to a hard ceiling of 120 ambient points an hour spent
across everything, most of it on tier-B activities that are *worth* a line. In practice: **about one
ambient line a minute, and every one of them either names something or points somewhere.**

---

## 3. The impact plan — three tiers

The rule that makes a line into a thing: **a tier-B or tier-C event must carry a place, a clock, a
reward and an ending before it may be announced.** If the generator cannot supply all four, it is
tier A and gets one sentence, or it is skipped. This is the same discipline `js/jobgen.js:9-12`
already enforces on the job board — *"If a slot cannot be filled the frame is skipped in silence.
Nothing is invented, so nothing can send you to an empty field."*

### Tier A — flavour

One line. No pin. No row. Rare.

*What it is for:* texture. The world sounding like it is inhabited.

| | |
|---|---|
| **Chat** | one line, grey (`''` class), naming one real thing: `Moor hounds have been at something up the rise.` |
| **Minimap** | nothing |
| **Map** | nothing |
| **Journal** | nothing |
| **World** | the bodies are there if you walk over; no beacon |
| **Budget** | 1 point, 20 s of silence after |

Set pieces stay tier A unless they are promoted. That is right: a warband is a fight, and Farhold
already spawns fights constantly. What is wrong today is only that it announces every one.

### Tier B — a nearby activity

The new class of thing, and the answer to "more impactful, clearly visible".

*Contract:* a world position, a `ttl` in seconds, a named reward, and a resolution that fires a
`win` or `fail` line. All four, or it is not tier B.

| | |
|---|---|
| **Chat** | one line, cyan (`'level'`), naming the thing and the direction: `A cage on a cart, 240 m north-east. Whatever is in it is still alive.` |
| **Minimap** | a coloured glyph at its position; a rim arrow with a distance when it is off the window — **the existing `drawMinimap` marker path, unchanged** (`js/hud.js:1023-1072`) |
| **Map** | a marker of its own kind, from the existing `MarkerBook` (`js/markers.js`), so it inherits tracking, the space-mode badge and the `elsewhere()` grouping for free |
| **Journal** | a row in the new "Happening near you" pane with a **View location** button |
| **HUD** | a row in the **Nearby Activities** panel under the minimap (§5), with a live countdown |
| **World** | a **beacon** over the spot (§6) — a tall animated marker you can see from 300 m — and a screen-edge arrow when it is behind you |
| **Ending** | the `win`/`fail` line already in `data/events.json`, plus the row leaving the panel with a strikethrough for 3 s |
| **Budget** | 2 points, 8 s of silence after |

What becomes tier B:

* all 11 road events (`data/events.json`) — they already have clocks and rewards
* a set piece carrying `forceRank` (`rare_prowler`, `champion_duel`, `raiding_party`,
  `beast_and_prey`) or an `owner` site
* a caravan under attack
* a hostile site coming into range, once
* every wanderer with a `wants` other than `nothing` — they are a person standing in a field with an
  offer, which is exactly a WoW-style nearby activity
* a meteor in the air (it is already this, minus the panel row)

### Tier C — a zone event

An incident. It changes what the zone *is*, not what is happening in one spot.

| | |
|---|---|
| **Chat** | one line, amber (`'level'`), **only on the frame it starts**, and it says what changed: `Short rations in Grimwater Vale — every shop is charging half again, and the Greenhand are paying for anyone who brings food in.` |
| **Minimap** | nothing new; the zone banner already does this job |
| **Map** | a zone tint + a badge on the region, and one line in the region's hover card |
| **Journal** | a row in "Who holds this ground" with the time left |
| **HUD** | a chip beside the place card (`#hud-place`) for as long as it runs: `⚠ Short rations · 31m` |
| **World** | whatever the incident's effects already do — `js/incidents.js:118-137` merges them and `js/main.js:4592-4601` applies `spawnMult` and `shopMult` |
| **Ending** | the `onExpire.rumour` line, already wired at `js/main.js:4636-4644` |
| **Budget** | 4 points |

The single most valuable change in this whole document is one line in `js/main.js`: replace the loop
at **`js/main.js:4510`** with the return value of `trouble.consider`. `consider` already returns the
row that started, or `null`. Announce the return value; never announce `describe()`.

---

## 4. Less generic — the rewriting rules

### The rules

1. **Every ambient line names at least one thing that exists in the world right now**, drawn from
   one of: a creature from `data/enemies.json` that this biome actually spawns; a faction from
   `data/factions.json`; a settlement, landmark or road node from `world.nodes`; a named person from
   `js/town.js`'s roster or `js/wanderers.js`; a hostile site from `js/sites.js`; a named enemy or
   the nemesis from `js/campaign.js`.
2. **A tier-B line states a direction and a distance**, in the words the game already uses:
   `distanceText()` from `js/markers.js:243-246` ("240 m", "1.3 km") and an 8-point compass from the
   bearing `js/markers.js:206-219` already computes.
3. **No line describes the player's competence, reputation or fate in the abstract.** "Something out
   there has your measure" is the whole failure mode in six words: no subject, no place, no verb the
   player can answer.
4. **A zone-level fact says what it changes**, in a number or a price, not in a mood.
5. **If no real thing can be named, the event is skipped.** `jobgen.js`'s rule, applied to chatter.
6. **A sentence is used once per run.** §2's `said` set.

### Where the names come from — the binding table

`js/ambient.js` gets a `bindings(ctx)` that is the ambient layer's version of
`js/jobgen.js:39-59`'s `fits()`. Every token below resolves off state that already exists:

| token | source |
|---|---|
| `{enemy}` / `{enemies}` | the spec's `prefer` family filtered by `terrain.biomeAt(x,z).key` against `data/enemies.json` `biomes` — the same filter the spawner uses |
| `{faction}` | `holdings.of(zone.id).holder` → `intro.nameFor(key)` (the short name: "the Pact", "the Reach") |
| `{rival}` | `record.contested` |
| `{place}` | nearest `world.nodes` entry within 1200 m, else `terrain.regionAt()` |
| `{site}` | `sites.visible` nearest hostile within `OWNED_BY` — already computed at `js/encounters.js:79-90` |
| `{person}` | `folk.nearest(x, z)` (`js/main.js:2956`) or the wanderer's own `name` |
| `{named}` | `campaign.nemesis.name` |
| `{dir}` | 8-point compass from `markers.bearing` |
| `{dist}` | `distanceText()` |

Anything unbound → the line is not offered. A binding audit test (§10) renders every string with an
empty context and fails on a leftover `{`. Emberveil already has exactly this test
(`prototypes/emberveil/tests/bindings.test.js`); this is the same test for a different file.

### Ten rewrites

Every "after" below is buildable from data that is already loaded.

| # | Before (file:line) | After |
|---|---|---|
| 1 | `data/incidents.json:31` — *"something out there has your measure and has told its friends"* | **`Kirrath, the Cinder Wyrm has been asking after you in Grimwater Vale. Its people are looking too — the bounty board here has your description on it.`** Names the nemesis (`campaign.nemesis.name`), the zone, and says what changed. Fires **once**, on the frame the grudge starts. |
| 2 | `data/incidents.json:21` — *"something got dug and the rest have taken it badly"* | **`The cairns at Hollow Reach have been opened. Barrow Hounds are walking the fields after dark — nothing that lives here comes out at night now.`** Names the landmark that was dug and the undead the incident actually spawns (`effects.nightSpawn: "undead"` → pick from `data/enemies.json` family `undead` in this biome). |
| 3 | `data/incidents.json:16` — *"nothing has come up the road in a week"* | **`The Ninth Load never reached Grimwater Vale. Everything on a shelf here is half again what it was, and the Greenhand are paying for food brought in.`** Names the lost caravan (`caravanLost` already knows which one), the price change (`shopMult: 1.5`) and who is paying (the `feed_the_hold` frame's faction). |
| 4 | `data/incidents.json:41` — *"two of them want the same ground and have stopped talking about it"* | **`The Cut and the Pact are both claiming Salt Reach, and their patrols have stopped walking round each other. Whoever you help will remember it.`** `record.holder` and `record.contested` are both on the record already. |
| 5 | `data/encounters.json` `warband` — *"A warband is coming up the road."* | **`Brigands on the Harrowfen road, out of Stonemarch Keep — eight of them, and one is better armed than the rest.`** `spec.count`, `spec.leaderRank` and `ownerOf()` are all in hand at `js/encounters.js:207-216`; only the road name is new (nearest `world.nodes` road node). |
| 6 | `data/encounters.json` `hunting_pack` — *"Something is hunting out here, and it is not alone."* | **`A pack of Moor Hounds is working the open ground south of here. Five, moving together.`** The creature is already chosen before the line is printed (`spawnBodies` returns `made`); the line is simply printed before the answer is known. Move `onLog` after `spawnBodies`, which it already is at `js/encounters.js:207-217` — the name just is not used. |
| 7 | `data/encounters.json` `rare_prowler` — *"Something out here has a name."* | **`Grennig the Gilded is out here — a Thicket Boar that has been eating well, with four of its own behind it. 180 m east.`** Tier B: rare, so it gets a beacon, a panel row and a marker. The Name Forge name and the `Gilded` modifier (`data/enemies.json` modifiers) are already rolled. |
| 8 | `data/events.json` `the_cage_on_the_road` — *"There is a cage on a cart up ahead, and it is not empty."* | **`A Pact cart with a cage on it, 240 m north-east. Six guards. Whoever is in it has about ninety seconds.`** Faction from `ownerOf`/holder, guard count from `ev.units.length`, the clock from `spec.seconds`, direction and distance from the bearing. **The ninety seconds is the point** — the current line does not say there is a clock at all, so the player has no reason to hurry, which is why a rescue reads as flavour. |
| 9 | `data/events.json` `the_stranded_cart` — *"A cart on its side, a strongbox still lashed to it, and somebody is coming for it."* | **`An overturned cart 310 m west with a strongbox still lashed to it. Road Brigands are working the lashings — about seventy-five seconds before they have it off.`** |
| 10 | `js/main.js:5638-5643` — *"A camp at Stonemarch."* | **`Stonemarch — an Ashen Pact camp, about twelve of them, 150 m south. Clearing it loosens the Pact's hold on this ground.`** Every figure exists: `site.spec.garrison`, the bearing, and `js/territory.js:300` `press()` is what clearing it does. Fires **once per site per run**. |

Three more worth doing at the same time, because they are the same fault:

* `data/encounters.json` `ambush` — *"They were waiting for you."* → **`Veil Spiders drop out of the canopy — they were waiting.`**
* `data/incidents.json:57` — *"everything green has come up at once"* → **`Everything green in Fenmarch has come up at once. Herbs are three for one while it lasts, and there is something growing here that does not usually.`** (`gatherMult: 3`, `rareHerb: true`.)
* `data/incidents.json:71` — *"the sky is the colour of a floor and everyone is indoors"* → **`Ash over Cinderfall. You can see about half as far, fire burns a quarter hotter, and there is nobody on the roads.`** (`visibility: 0.5`, `fireDamage: 1.25`, `folkOut: -0.8`.)

---

## 5. The Nearby Activities panel

### Where it goes

`#hud-right` (`index.html:126-138`) is already a flex column: place card → minimap → scale → where.
The panel is one more child, after `#hud-where`. Nothing else has to move.

```
index.html:137   <div id="hud-where"></div>
index.html:138 + <div id="nearby" class="hud-card hidden">…</div>
```

### Wireframe

```
                                  ┌────────────────────────────┐
                                  │ Fenmarch                   │
                                  │ level 9–12 · Dangerous     │
                                  │ 04:18  ·  Overcast         │
                                  └────────────────────────────┘
                                  ┌────────────────────────────┐
                                  │                            │
                                  │        [ minimap ]         │
                                  │                            │
                                  └────────────────────────────┘
                                          16.6 km across
                                  ┌────────────────────────────┐
                                  │ NEARBY                 ▾ 4 │   ← header: count, collapse caret
                                  ├────────────────────────────┤
                                  │ ⌛ Cage on the cart      ⌖ │   ← icon · name · locate button
                                  │    240 m NE · 1:04 left    │   ← distance · clock (amber <20s)
                                  ├────────────────────────────┤
                                  │ ☠ Grennig the Gilded    ⌖ │
                                  │    180 m E · rare          │
                                  ├────────────────────────────┤
                                  │ ☄ Impact site           ⌖ │
                                  │    1.1 km SW · 0:22 left   │
                                  ├────────────────────────────┤
                                  │ ◈ Courier, wants an escort⌖│
                                  │    90 m N                  │
                                  ├────────────────────────────┤
                                  │ ▣ The Ninth Load        ⌖ │
                                  │    620 m W · under attack  │
                                  └────────────────────────────┘
                                       2 more · press  N
```

Collapsed:

```
                                  ┌────────────────────────────┐
                                  │ NEARBY                 ▸ 4 │
                                  └────────────────────────────┘
```

### The row

| field | source | notes |
|---|---|---|
| icon | one glyph per kind, from a table in `js/nearby.js` | `⌛` timed event · `☠` rare/champion/named · `☄` impact · `◈` person with an offer · `▣` caravan · `⚑` hostile site · `!` quest objective already tracked |
| name | the bound name from §4 | truncated with `text-overflow: ellipsis`, never wrapped |
| distance | `distanceText(b.distance)` + an 8-point compass letter | `js/markers.js:243` — the same wording as the minimap rim arrows, so two places do not disagree |
| clock | `mm:ss` when the row has a `ttl`, else a one-word state (`rare`, `under attack`, `wants an escort`) | turns amber under 20 s, red under 8 s |
| locate | a `⌖` button | tracks it, and calls `locateOnMap()` (§7) |

**Row count: five.** Six rows of two lines each is ~170 px under a 180 px minimap and a place card,
which on a 900 px-tall window is as far as the right column can go without reaching the skill bar.
Anything beyond five is summarised: *"2 more · press N"*. `N` opens the Journal on the new pane.

**Sort order: distance, nearest first** — with exactly one exception, which is worth stating because
it is the difference between a useful panel and an annoying one: **a row with a running clock under
30 seconds sorts to the top regardless of distance.** A rescue you are about to fail is the thing
you need to see, and it is usually not the nearest thing.

Ties broken by `id` so the order is stable and rows do not swap places while the player walks.

### Update, and keeping it cheap

The panel is redrawn **four times a second** (`state.frames % 15`), not every frame. Distances and
clocks move slowly enough that 4 Hz is indistinguishable from 60 Hz, and it is 15× less work.

Farhold has **no `patch()`**. The sibling project's keyed DOM morph is
`prototypes/frontier-foundry/js/ui/dom.js:47-95`, and it is the right *idea*, but importing across
prototypes is wrong — a prototype may break when the experiments change, and cross-importing makes
two prototypes break together. Farhold's own established pattern is a **cached node pool**, used
twice already in the same file:

* `js/hud.js:504-512` (`this._ret`) — reticles, rebuilt only when the count changes
* `js/hud.js:584-596` (`this._skillSlots`) — skill slots, rebuilt only when the shape changes

`js/nearby-ui.js` follows it exactly:

```js
// js/nearby-ui.js — the panel. DOM only; js/nearby.js decides what is in it.
const ROWS = 5;
let pool = null;                       // built once, five rows, never rebuilt

export function drawNearby(list, { onLocate }) {
  const box = $('nearby');
  box.classList.toggle('hidden', !list.length);
  if (!list.length) return;
  if (!pool) pool = buildPool(box, ROWS, onLocate);   // five rows + a header, once
  for (let i = 0; i < ROWS; i++) {
    const row = pool[i], a = list[i];
    row.node.hidden = !a;                              // [hidden] not style.display
    if (!a) continue;
    if (row.key !== a.id) { row.key = a.id; row.icon.textContent = ICONS[a.kind]; row.name.textContent = a.name; }
    row.where.textContent = `${distanceText(a.distance)} ${a.compass}`;
    row.clock.textContent = a.ttl != null ? mmss(a.ttl) : a.state;
    row.clock.className = 'nb-clock' + (a.ttl < 8 ? ' urgent' : a.ttl < 20 ? ' soon' : '');
  }
}
```

Per redraw: **five `textContent` writes on unchanged rows, no allocation, no `replaceChildren`.**
The `row.key !== a.id` guard means the two strings that do not change per frame are not even
touched. The locate handler is bound once at build time and reads `pool[i].key`, so it closes over
nothing that goes stale — which is the exact bug `patch()` exists to avoid.

`js/nearby.js` (pure) owns the list:

```js
/** Everything worth a row, nearest first, clocks first. Called at 4 Hz. */
export function nearbyList({ events, sites, caravans, folk, markers, meteors, at, terrain, limit = 5 })
```

It is pure: it takes arrays and returns an array, so `node --test` can assert the sort order, the
clock promotion and the cap without a browser.

### Collapsing

Click the header, or press `N` twice (first press opens the Journal pane; holding `Shift+N`
collapses). Simpler: the caret is the only control, and the state lives in `settings.js` as
`nearbyOpen: true` alongside `damageNumbers` (`js/settings.js:37`), so it survives a reload. Add one
row to `SETTINGS` (`js/settings.js:154`): `{ key: 'nearbyPanel', label: 'Nearby activities panel',
kind: 'toggle', group: 'Picture' }`.

Hidden entirely when: flying (`#hud-left.flying` already does this for the objective strip,
`style.css:98` — mirror it), in a dungeon, or the list is empty.

---

## 6. The world pointer

### The rim arrow already exists — twice — and neither one is the one being asked for

* **Minimap rim arrow**: `js/hud.js:1042-1072`. A triangle parked on the edge of the minimap circle
  at the marker's true bearing, with `distanceText` tucked inside it and a 26 px collision check so
  two labels do not overlap. **This is finished work and must be reused, not duplicated.** A tier-B
  activity becomes a `MarkerBook` marker, and it inherits all of this for free.
* **Space brackets**: `js/hud.js:490-540`. World-position → screen projection with a cached node
  pool, and it already hides anything behind the camera (`p.z > 1`) or off the edge.

What does **not** exist is a **screen-edge arrow in the third-person view** — the user's "radial
arrow pointing to it when its off-screen". `js/hud.js:629-647` (`hit()`) is the nearest thing: it
projects a world position and gives up when it is off screen. The new code is the *else* branch of
that `if`.

### `js/beacon.js` — the thing over the spot

Three.js, one module, one object pool. Never more than **6 beacons**, which is the tier-B cap.

**Geometry**, per beacon (all built once, cloned from shared geometry/material):

| part | geometry | why |
|---|---|---|
| shaft | `CylinderGeometry(0.18, 0.5, 14, 6, 1, true)` — open-ended, 6 sides | a column of light you can see over a hill. 6 sides because nobody counts them at 200 m |
| chevron | three `ConeGeometry(1.1, 1.6, 4)` stacked, pointing **down** | the "large animated pointer". Four sides, flat-shaded — it reads as a solid arrowhead, not a blob |
| ring | `RingGeometry(1.6, 2.0, 24)` laid flat on the ground, `rotation.x = -π/2` | says *where*, exactly. The shaft says *which way* |

Material: `MeshBasicMaterial({ color, transparent: true, depthWrite: false, fog: false })`. No
lights, no shadows, no additive blending — `avatar-3d/js/spellfx.js` established that rule for this
codebase and it holds here. The colour comes from `MARKER_LOOKS` so a beacon and its minimap glyph
are the same colour, which is how the player learns they are the same thing.

**Animation** (one `update(dt, camera)` for all six, no per-beacon timers):

* the chevron stack bobs on `sin(t * 2.4) * 0.5 m` with each chevron 0.2 rad out of phase — a slow
  downward chase
* the ring pulses `scale = 1 + sin(t * 2.0) * 0.12`
* the whole beacon rotates on Y at 0.6 rad/s so it never reads as a flat billboard
* the shaft's opacity breathes 0.28 → 0.5

**Scaling with distance** — the point being that a beacon must be *the same size on screen* whether
it is 40 m or 400 m away, or it is useless at exactly the range you need it:

```js
const d = camera.position.distanceTo(b.position);
b.scale.setScalar(Math.max(1, Math.min(6, d / 90)));    // 1× under 90 m, 6× past 540 m
b.position.y = groundY + 1.2 * b.scale.x;               // the tip stays clear of the ground
```

Cheap because: 6 objects, 3 meshes each = **18 draw calls at worst**, shared geometry and material,
no per-frame allocation, `update` is a dozen trig calls. Culled at 900 m and hidden when the
activity's row leaves the panel. Off with the same setting as the panel.

### The screen-edge arrow

`js/hud.js` gains `edgeArrows(list, camera)`, sitting beside `reticles()` and built the same way — a
node pool of at most 5 `<div class="edge-arrow">`, created once.

```js
const p = pos.clone().project(camera);
const behind = p.z > 1;
if (!behind && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1) { node.hidden = true; continue; }  // on screen: the beacon does the work
// off screen: put it on the rim of an ellipse inset 52 px from the window edge
const v = behind ? { x: -p.x, y: -p.y } : p;                 // behind the camera flips both axes
const ang = Math.atan2(-v.y, v.x);
const rx = w / 2 - 52, ry = h / 2 - 52;
node.style.left = `${w / 2 + Math.cos(ang) * rx}px`;
node.style.top  = `${h / 2 - Math.sin(ang) * ry}px`;
node.style.transform = `translate(-50%,-50%) rotate(${-ang + Math.PI / 2}rad)`;
```

The `behind` flip is the part that is easy to get wrong and is worth writing down: a point behind
the camera projects to the *opposite* side of the screen, so without the negation the arrow points
exactly backwards whenever the player turns round — which is the one moment it matters. (This is the
same class of mistake as the minimap arrow bug documented at `js/hud.js:1074-1083`.)

The arrow is a CSS triangle plus a distance label, in `nearby.css`:

```css
.edge-arrow { position: fixed; pointer-events: none; z-index: 40; }
.edge-arrow i { display: block; width: 0; height: 0;
  border-left: 9px solid transparent; border-right: 9px solid transparent;
  border-bottom: 15px solid currentColor;
  filter: drop-shadow(0 1px 3px rgba(0,0,0,.9)); }
.edge-arrow span { display: block; margin-top: 2px; font-size: 10px; text-align: center;
  color: #e8dfd2; text-shadow: 0 1px 3px #000; font-variant-numeric: tabular-nums; }
.edge-arrow.urgent i { animation: edge-pulse .7s ease-in-out infinite; }
@keyframes edge-pulse { 50% { opacity: .35; } }
```

Only the **top row** of the panel (the nearest, or the one with the shortest clock) gets an edge
arrow by default; tracked markers always get one. Five arrows on the rim at once is a HUD that is
shouting, which is the fault we are fixing.

---

## 7. Journal integration

A new pane, `col-nearby`, in the journal grid (`index.html:466-520`, CSS `style.css:1729-1738`).
The grid is `grid-template-areas`, so the change is three lines:

```css
grid-template-areas:
  "survey  standing zones"
  "quests  board    zones"
  "nearby  word     zones"        /*  was: "foes  word  zones"  */
  "foes    foes     zones";
grid-template-rows: repeat(4, minmax(0, 1fr));
.col-nearby { grid-area: nearby; }
```

Markup, matching the existing panes exactly:

```html
<section class="pane col-nearby">
  <div class="pane-head">
    <span class="pane-title">Happening near you</span>
    <span class="pane-meta" id="journal-nearby-count"></span>
  </div>
  <div class="pane-body tight"><div id="journal-nearby" class="journal"></div></div>
</section>
```

`renderJournal()` (`js/hud.js:2578`) gains one block, using the `row()` helper already defined at
`:2580`. The only new thing is the button:

```js
const nearby = (j?.nearby || []).map(a => {
  const n = row(a.name, `${distanceText(a.distance)} ${a.compass}${a.ttl != null ? ` · ${mmss(a.ttl)}` : ''}`);
  const b = el('button', 'ghost small', 'View location');
  b.onclick = () => this.onLocate?.(a);
  n.append(b);
  return n;
});
fill('journal-nearby', nearby, 'Nothing is happening within earshot.');
```

`.job-row` already has the three-column grid for this (`style.css:1838`), so a `.nearby-row` class
reusing it costs one CSS line.

The journal list is **not capped at five** — the HUD panel is short because the HUD is short; the
Journal shows everything within 1.5 km, which is the despawn-ish range where an activity stops being
"near you".

### What I need from the map redesign

Another agent is writing `research/map-redesign.md`. I am assuming one entry point:

```js
/**
 * Open the map centred on a world position, with the thing at it selected.
 *   locateOnMap({ x, z }, { name, kind, zoom, pulse, markerId })
 */
map.locateOnMap(worldPos, opts)
```

My requirements of it, in priority order:

1. **It opens the map** if it is closed, and **centres on `worldPos`**, not on the player.
2. **It does not teleport, travel, or change any game state.** "View location" is a look, not a move.
   (`js/map.js` has a "Go here" debug teleport behind `settings.debugTeleport`,
   `js/settings.js:159` — this must not go near it.)
3. `opts.zoom` — a hint in metres-across, so a 240 m activity is not shown at planet scale. Default
   to something like 4 km across.
4. `opts.pulse` — draws a short highlight ring at the position for ~2 s, so the player's eye lands
   on it. If this is not offered I will settle for the map simply centring, but the ring is what
   makes the button feel like it did something.
5. `opts.markerId` — if the activity already has a `MarkerBook` marker (every tier-B one does), the
   map should **select that marker** so its existing card/label appears, rather than drawing a second
   unrelated highlight.
6. It returns a boolean, so the Journal can grey the button out on a world where the position does
   not apply.

If `locateOnMap` ends up named something else, the only coupling is one call in `js/hud.js`'s
journal block and one in `js/nearby-ui.js`'s locate button. Both go through a single `onLocate`
callback handed in from `js/main.js`, so the rename is one line.

---

## 8. Work plan

Ordered. Each step is small enough to do on its own, and the game still runs after every one.

**Anything touching `js/main.js` (6308 lines) or `js/hud.js` (3026 lines) is flagged ⚠ — both are
huge and both are shared with every other system.** All the real logic goes in new files; the two
big ones only ever gain a call.

### Phase 1 — stop the bleeding (no new features, big visible win)

| # | File | Change |
|---|---|---|
| 1 | `js/zones.js:163-167` | Add `atOrLast(x, z)` that returns the last real zone when `at()` gives `OPEN`, and `isOpenWater(zone)`. **B1.** |
| 2 | ⚠ `js/main.js:5904-5906` | Use `atOrLast` for the `enterTerritory` test, and skip `announceZone` for `OPEN`. Two lines. |
| 3 | ⚠ `js/main.js:4624` | Split `boardZone = null` into `rebuildBoard = true` so dusk/dawn refreshes the board **without** re-running the announcements. **B2.** |
| 4 | ⚠ `js/main.js:4484-4510` | Announce the **return value** of `trouble.consider`, delete the `trouble.describe` loop. **B3.** One line in, five out. |
| 5 | `js/incidents.js:93-101` | `consider` collects every eligible spec, sorts forced-before-random but shuffles inside each group, and returns the first that fires. **B4** — `grudge` stops eating every other incident. |
| 6 | ⚠ `js/main.js:5907` + `js/territory.js:353` | Derive the territory hour from `balance.sky.dayLengthSeconds` so an incident's "48 hours" is two visible sunrises. **B5.** |
| 7 | `js/sites.js:1073-1090` | `due()` records `s.announced = true` and `relax()` does not clear it. A camp announces itself once per run. |

### Phase 2 — the purse

| # | File | Change |
|---|---|---|
| 8 | **new** `js/ambient.js` | The purse, the `SaidBook`, `offer()`, `tick()`, the tier table. Pure. ~180 lines. |
| 9 | **new** `tests/ambient.test.js` | node test: the purse never overspends; the no-repeat window never empties the pool; a sentence never repeats in a run. |
| 10 | ⚠ `js/main.js` (7 sites) | Route the seven ambient `hud.log` callers through `ambient.offer`. The call sites are: `:4510` (incident), `:4629-4631` (caravan), `:5638-5643` (site), `:1637-1639` (`onLog` handed to `createEncounters`), `:4503-4507` (rumour → Journal, not log), `:3310/3315` (meteor — exempt, but registered as an activity), `js/hud.js:462-483` (zone banner — keep the banner, drop the log line). |

### Phase 3 — less generic

| # | File | Change |
|---|---|---|
| 11 | `data/encounters.json`, `data/events.json`, `data/incidents.json` | Rewrite all 34 strings with `{tokens}`. Data only — no code in this step. |
| 12 | `js/ambient.js` | `bindings(ctx)` + `bind(text, ctx)`, returning `null` when a token cannot be filled. |
| 13 | ⚠ `js/encounters.js:216-217`, `:282` | Build the line from `made` (the creatures that actually spawned) rather than from `spec.announce` alone. The data is already in scope. |
| 14 | **new** `tests/ambient-bindings.test.js` | Render every string against a full context and against an empty one; fail on a stray `{`. Modelled on `prototypes/emberveil/tests/bindings.test.js`. |

### Phase 4 — the Nearby panel

| # | File | Change |
|---|---|---|
| 15 | **new** `js/nearby.js` | `nearbyList(...)` — pure, sorted, capped, clock-promoted. ~120 lines. |
| 16 | **new** `tests/nearby.test.js` | Sort order, the under-30s promotion, the cap, stable ties. |
| 17 | `index.html:138` | One `<div id="nearby">`. |
| 18 | **new** `nearby.css` + `index.html:11` | Panel, rows, clock states, edge arrows. Standalone stylesheet; `style.css` is untouched except for the journal grid areas. |
| 19 | **new** `js/nearby-ui.js` | `drawNearby(list, { onLocate })` with the five-row cached pool. |
| 20 | ⚠ `js/main.js` (render loop, ~`:6015`) | One call, gated on `state.frames % 15 === 0`. Feeds it `encounters.events`, `sites.visible`, `trade.inZone`, `roadFolk.inZone`, `meteors.marks`, `markers.tracked`. **Every one of those getters already exists.** |
| 21 | `js/settings.js:37, 154` | `nearbyPanel: true` + one `SETTINGS` row. |

### Phase 5 — the pointer

| # | File | Change |
|---|---|---|
| 22 | **new** `js/beacon.js` | Six-object pool, `add/remove/update`. ~150 lines. |
| 23 | ⚠ `js/hud.js` (beside `reticles`, ~`:489`) | `edgeArrows(list, camera)` — node pool of five, the behind-camera flip. ~45 lines. |
| 24 | ⚠ `js/main.js` render loop | `beacons.update(dt, camera)` and `hud.edgeArrows(...)`, both every frame, both no-ops when the list is empty. |
| 25 | **new** `tests/nearby.spec.js` | Playwright: force an event via `window.farhold`, assert the panel row appears, the beacon mesh is in the scene, the edge arrow is positioned, and the locate button calls `locateOnMap`. |

### Phase 6 — the Journal

| # | File | Change |
|---|---|---|
| 26 | `index.html:503` | The `col-nearby` section. |
| 27 | `style.css:1733-1736, 1823-1828` | Grid areas, desktop and the narrow breakpoint. |
| 28 | ⚠ `js/hud.js:2578` `renderJournal()` | One block, ~10 lines, using the existing `row()`/`fill()` helpers. |
| 29 | ⚠ `js/main.js:1176` (the journal provider) | Add `nearby: () => nearbyList(...)` and `onLocate`. |

### Documentation

| # | File | Change |
|---|---|---|
| 30 | `RPG.md` | A "Round 14 — the ambient layer" section, in the house style: what was reported, what it actually was, what changed. |
| 31 | `README.md`, `../../CLAUDE.md` | The farhold row gains `js/ambient.js`, `js/nearby.js`, `js/beacon.js`. |

---

## 9. Two traps worth writing down before anyone starts

**A beacon that outlives its activity is worse than no beacon.** Every tier-B activity must have
exactly one owner that removes it: the road event closes at `js/encounters.js:227` (`closeEvent`), a
caravan resolves in `js/caravans.js`, a site clears in `js/territory.js:clearSite`. `js/nearby.js`
must **derive** its list from those live collections every tick rather than keeping its own array —
if it keeps an array, it will keep a beacon over a cart that was looted ten minutes ago, and that is
the bug this whole redesign is trying to stop.

**The panel and the log must never say the same thing twice.** A tier-B activity gets *one* chat
line at the start and *one* at the end; everything in between is the panel's job. If both are
chattering, the fix has made the fault worse.

---

## 10. How we will know it worked

| claim | test |
|---|---|
| The quoted line fires once, not forever | `tests/ambient.test.js` — walk into the same zone 20× with a nemesis set; assert exactly one `grudge` log |
| Open water does not re-enter a zone | `tests/ambient.test.js` — `atOrLast` across a river crossing |
| `grudge` no longer starves the table | `tests/ambient.test.js` — 200 `consider` calls with a nemesis; assert at least 6 distinct incident kinds started |
| Ambient lines are capped | `tests/ambient.test.js` — 10 simulated minutes; assert ≤ 20 ambient lines |
| No sentence repeats | `tests/ambient.test.js` — a full run's log has no duplicate ambient string |
| Every string binds | `tests/ambient-bindings.test.js` — no stray `{` in 34 strings × a full and an empty context |
| The panel sorts right | `tests/nearby.test.js` |
| It is all on screen | `tests/nearby.spec.js` (Playwright, screenshot to `test-results/`) |

And one number the user can feel: **ambient chat lines per ten minutes of walking, before and
after.** Today it is roughly 16 from set pieces alone plus every re-entry; the target is **under 10,
every one of them naming a real thing, and at least half of them with a row in the panel and a
beacon in the world.**
