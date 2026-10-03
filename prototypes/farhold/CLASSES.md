# Farhold — the custom class, followers and mercenaries (round 17)

The user's item, verbatim:

> I've been thinking it would be really cool to build a custom class in this game. We could use a
> point-buy system similar to \[a colony sim's character-setup mod]. We can extract all the existing
> classes into a spell tier list and allow choosing spells. You would pick only your starting spell,
> and would get to choose another spell at every significant level (same as current skill unlocks).
> We should also let you choose a default loadout such as wands with a specific element, dual swords,
> daggers, bow, etc; effectively all combinations except for dual 2h (which require a perk). You
> should be able to unlearn a skill at any time. You should also be able to pick a companion or, for
> the solo players, start with a bonus crate that gives you 3 magic or better items plus some
> starting gold. We should also add a Followers tab to the menu where you can manage your follower
> slots. Everyone should start with three follower slots with an additional one unlocking at level 20
> and 30. We can update 'The Kept Company' branch of the Perks menu instead of making your summoning
> skill summon more, to instead increase your companion limit. Companions should also be hireable at
> town, which we sort of have right now but is only for a single person. Update that to be a
> mercenary person who sells mercenaries to the player and add a variety of types with their own
> spells. All companions should adjust to the player level automatically, and some companions should
> equip better weapons or learn new skills at higher levels. Spells that summon creatures should only
> summon one per type unless the spell itself has a different limit, however, these spells should
> also update with 'The Kept Company' increasing their limit (while still obeying your total follower
> limit). If you have 5 follower slots and hire 4 mercenaries, you can only summon one wolf.

---

## How a player reaches all of it

| What | Where |
|---|---|
| Build a custom class | Title → **New game** → the class dropdown, **first entry: "Custom — build your own class"** → the card on the right becomes the build summary with an **Open the builder** button |
| Loadout, element, spells, companion-or-crate, base look | the builder's four tabs (Loadout / Spells / Opening / Look) |
| Unlearn a spell before you start | the **Unlearn** button on every filled slot, Spells tab |
| Unlearn a spell mid-run | **F** → the **Spells** tab. Same screen, same button |
| Your company, the slot ladder, dismiss | **F** → **Company** |
| Hire a mercenary | **F** → **Hire**, standing in any settlement. (With handoff patch 11, also by talking to the Mercenary Broker who stands in one.) |
| Hire the one a road captain is selling | walk up to a mercenary captain on the road and press **E**, as before — they now sell one of ten types rather than always a sellsword |

`F` is a new binding and it obeys the same guards `K` does: not while the sheet, the map, a
conversation or build mode is up.

---

## 1. The spell tier list

**It is derived at runtime, not generated into a file, and that is deliberate.** `data/classes.json`
and `data/skills.json` already say which class gets which skill and at what level; both are already
loaded before `js/classbuild.js` is called. A committed `spells.json` would be a third statement of
the same fact — correct on the day it was generated and silently wrong the first time somebody adds
a skill to a class, with nothing failing, because a tier list that is missing a spell just quietly
does not offer it. That is this project's signature fault, written as a build step.

```js
import { spellCatalogue } from './classbuild.js';
const cat = spellCatalogue({ classData, skillData, data: classbuildData });
```

```js
cat.unlockAt              // [1, 3, 7, 12, 18, 24] — data/skills.json's own ladder
cat.tiers[i]              // { level, name, blurb, spells: [...] }
cat.spells                // every skill, sorted by tier then name
cat.byId.get('meteor')    // one row:
// {
//   id, name, desc, shape, element, cooldown, mp,
//   summon: 'bone_thrall' | null,   // the pet a summoning skill calls
//   count: 1,                       // the spell's OWN limit, if it has one
//   tier: 24,                       // the earliest level ANY class hands it out at
//   tierIndex: 5,
//   classes: ['Mage', 'Warlock', …],// who else uses it, for the option's second line
//   tags: ['ranged', 'magic'],
// }
```

**A spell's tier is the earliest rung any class grants it on.** A warrior gets Power Strike in slot
0 and a rogue gets it in slot 4; the honest answer to "when could a character have this" is the
first of those. As it falls out of the current data: 11 spells at tier 1, 15 at 3, 9 at 7, 2 at 12,
none at 18, 3 at 24.

The six rung NAMES are in `data/classbuild.json`'s `tiers`, and their `level`s are **checked against
`skills.json`'s `unlockAt` at load and throw if they disagree** — two ladders that disagree would
mean the builder offering a spell at level 12 that the skill bar does not unlock until 18, with
nothing anywhere complaining and the player simply having a dead key.

## 2. The point-buy

Six picks, one per rung. A slot may take any spell whose **tier is at or below the level that slot
unlocks at**, and nothing twice. That is the whole rule.

```js
const build = createBuild(classbuildData);
pickRefusal(build, 0, 'meteor', cat);   // "Meteor is a level 24 spell and this slot opens at level 1."
pickSpell(build, 0, 'power_strike', cat);
unlearnSpell(build, 0);                 // { ok: true, refunded: 'power_strike' } — free, at any time
slotsOf(build, cat);                    // six rows, each with everything it could take right now
buildRefusal(build, cat, classbuildData);  // the one thing still missing, or null
```

Unlearning costs nothing, has no cooldown and no penalty — the point of a build screen is that you
can try something. It is also the only way a slot is emptied: nothing anywhere writes
`build.spells[i] = null` directly.

## 3. The build object — which is also the save

```json
{
  "schema": 1,
  "name": "Roadwarden",
  "loadout": "longbow",
  "element": null,
  "look": "ranger",
  "spells": ["aimed_shot", "poison_dart", "multi_shot", "mend", "pinning_shot", "rain_of_arrows"],
  "opening": { "kind": "crate", "companion": null },
  "granted": true,
  "custom": true
}
```

It rides on `player.build` and `js/save.js` carries it in the player block. `js/newgame.js`
re-installs the class from it on **every** load path before the save is handed back — without that a
custom character would reload as whatever `classData.classes[0]` is, with the wrong skill bar and
nothing saying so.

## 4. How a custom class reaches the rest of the game: it becomes a class

`installCustomClass({ classData, skillData, classLooks, data, build })` writes a synthetic entry
into the three data objects `main.js` has already loaded:

* `classData.classes` gains a class whose `id` is `"custom"` — `starter`, `startingArmour`,
  `weapons`, `armorTier`, `shield`, `skills`, `look`, `pet`, and a `build` field carrying the build;
* `skillData.classes.custom` gains the six chosen ids **in slot order**;
* `classLooks.classes.custom` gains a body, borrowed from whichever class the Look tab named.

Everything downstream then works unchanged: `classData.classes.find(c => c.id === classId)` finds
it, `createSkillBar` reads `data.classes[player.classId]`, `classDef.pet` summons the companion,
`classDef.starter`/`startingArmour` equip the loadout. There is no "if the class is custom" branch
anywhere in the game, which was the point — the alternative was a dozen of them in files this round
does not own.

Safe to run more than once: a second call replaces the first, which is what the builder does on
every edit and what a load does when it re-installs a saved build.

## 5. Loadouts

`data/classbuild.json` → `loadouts`. Eighteen of them, covering every sensible pair of hands:

```json
{
  "id": "blade_board", "name": "Blade and Board",
  "main": "longsword",          // a weaponBase key out of the shared items.json
  "off": "sword",               // …a second WEAPON, for a dual loadout
  "offArmour": "shield",        // …or an off-hand ARMOUR base: a shield, a focus, a quiver
  "armour": "heavy",            // which row of `armour` below is equipped
  "element": true,              // this one brands its caster, so it gets an element picker
  "needsPerk": "doubled_grasp", // a perk-forest KEYSTONE id
  "weapons": ["sword", "longsword", "hammer"],
  "blurb": "…"
}
```

**The dual two-hander gate.** `Two Two-Handers` carries `needsPerk: "doubled_grasp"` — the melee
keystone, renamed in round 13 from the name it shipped with. A saved perk is the **node** id
(`melee:7:0`), not the keystone id, so `loadoutRefusal` never compares ids by hand: it asks for the
flag the keystone grants (`doubleGrip`, which `rpg.equip` and `weapons.offhandRefusal` both already
read) and, failing that, walks the forest for the node carrying the keystone. Either answer is the
same answer.

The gate is enforced **twice over**, on purpose. The builder greys the row with the sentence saying
why; and `applyOpeningKit` puts the second weapon on through `rpg.equip`, which asks
`offhandRefusal`, which asks the keystone. So there is no route by which two two-handers reaches a
character who has not taken it.

**Elements.** A loadout with `element: true` brands its starter: `applyOpeningKit` writes
`weapon.brand`, clears `castElement` and re-runs `attuneWeapon`, which is exactly how the crafting
bench forces an element. The six choices are `rpg.js`'s own `CAST_ELEMENTS`.

## 6. The opening kit

`data/classbuild.json` → `opening`. One choice: somebody comes with you, or a sealed chest.

* **A companion** becomes `classDef.pet`, the same field every preset class with a companion has
  always carried, so `js/main.js` summons it on the first morning with no new code at all.
* **The crate** is three items rolled through `rpg.rollDrop` — the same path every chest, drop and
  crafted item comes down — with `chance: 1` so it never rolls a blank and `floor: "magic"` so
  "three magic or better" is a promise. `lift: 0.28` is a rarity boost on top, so about a quarter of
  the time one of the three comes out rare or better. Plus `gold`.

`applyOpeningKit` sets `build.granted` and is safe to call twice: the kit is paid once.

## 7. Follower slots

`data/mercenaries.json` → `slots`:

```json
{ "base": 3, "at": { "20": 1, "30": 1 }, "perkStat": "followerSlots", "hardCap": 12 }
```

So **3 at level 1, 4 at 20, 5 at 30**, plus whatever the perk forest has granted.

Everything that walks with you takes one of these slots, whatever it is:

| kind | what it is | dismissable |
|---|---|---|
| `companion` | came with your class, or with the build you made | no — they came with you |
| `mercenary` | paid for, out of a broker's board or a road captain | yes |
| `summon` | called up by a spell | yes |

## 8. "The Kept Company" — a limit now, not a count

Round 16 had the green arm granting `petSlots`, which `js/skills.js` added to `petCount` — how many
bodies **one cast** put down. So casting Raise Thrall three times gave you nine thralls, because
nothing anywhere counted what was already standing there. That is the thing the user asked to stop.

The arm grants **`followerSlots`** now, and it does two things with it:

* raises the **total** number of things that may walk with you (`slotsForLevel`);
* raises the **per-type cap** on a summon (`perTypeCapFor`).

`The Pack`, the keystone at the end of the same arm, grants two of each. A summoning spell's
`petCount` is its own `count` again and nothing adds to it; `petCap` is the new number on the plan.

The old `petSlots` key is still granted by the `cond_companionExtra` item affix (`js/effects.js`,
not this round's file), so **`followerBonus()` adds the two keys together** — an affix nobody reads
is the exact fault this round is about. When effects.js is renamed to match, that quietly becomes
one key and nothing else changes.

## 9. The summon cap, and the sentence the test is named after

```js
admit({ defId, origin, alive, limit, perTypeCap })   // → { ok, why }
```

Two checks, in order:

1. the **total** limit, which applies to everything;
2. the **per-type** cap, which applies **only to summons** — hiring four Blades for Hire is four
   separate contracts and paying for each one is its own limit.

Per-type cap = `max(1, the spell's own count)` + the Kept Company's grant.

**The gate is installed on `js/pets.js` itself** (`pets.setGate`), not at the call sites. Three
completely separate things summon — a skill in `main.js`, a hire in `followers.js`, the class
companion at the start of a run — and a limit checked at three call sites is a limit with three
chances to be missed. `pets.summon` is the one door, so the question is asked at the door.

> *"If you have 5 follower slots and hire 4 mercenaries, you can only summon one wolf."*

Four contracts fill four of the five; the fifth admits exactly one wolf; a second wolf is refused
with *"You have 5 of 5 follower slots filled."* `tests/round17-class.test.js` §7.2 is that sentence,
and §7.3 drives it through the real `createFollowers` and a stand-in for `pets`.

The gate is also why a cast that cannot fit everything it asked for **puts down what it can and
stops**, rather than refusing the whole thing. `pets.summon` leaves the reason on the returned array
as `made.refused`.

## 10. The mercenary data format

`data/mercenaries.json` → `mercenaries`. Ten types, four roles, each a whole body:

```json
{
  "id": "longshot", "name": "Longshot", "role": "archer",
  "blurb": "Sits behind you, says nothing, and empties a quiver into whatever you are looking at.",
  "price": 260, "minLevel": 2, "minTownSize": 2,
  "hp": 220, "dmg": [18, 28], "armor": 12,
  "speed": 5.0, "reach": 2.2, "attackEvery": 1.3,
  "ranged": { "range": 26, "element": "physical" },
  "onHit": ["bleed"],
  "abilities": [
    { "id": "pinning_bolt", "name": "Pinning Bolt", "element": "physical",
      "cooldown": 10, "mult": 1.7, "range": 26, "status": "web",
      "radius": 0, "statusMult": 1, "heal": 0, "healsPets": false, "minLevel": 1,
      "desc": "Puts a shaft through a leg and leaves it there." }
  ],
  "upgrades": [
    { "atLevel": 12, "note": "restrings to a war bow", "dmgMult": 1.2, "rangeAdd": 6 },
    { "atLevel": 24, "note": "learns to loose three at once", "ability": "fan_of_shafts" }
  ],
  "look": { "avatar": { … the shared character schema … } },
  "brings": { "id": "grove_wolf", "count": 1 }
}
```

**Abilities.** Three shapes and no more, because three is what the ten types need: a single target
(`mult` + optional `status`), a radius around the target (`radius`), and a heal on the owner
(`heal`, a fraction of their maximum; `healsPets` spreads 60% of it to the rest of the company).
Damage goes through `rpg.strike` exactly like a swing does, so an affix that says *"your companions
deal 40% more damage"* lifts a spell as well as a bite. One spell a frame, however many are ready.
Named abilities shared between types live in the file's own `abilities` table and are referenced by
`upgrades[].ability`.

**Upgrades.** Read in `pets.js` `retune` — the one place that already knows a follower's level has
moved — rather than at a level-up event, because that way an upgrade fires for a mercenary hired at
level 4 and looked at again at 22, which a level-up event would have missed entirely. `learned`
makes each one happen once. Multipliers are applied to the **base** numbers, never compounded on the
current ones. `held`/`offhand`/`top` genuinely rebuild the body (`refit`), because an avatar is
baked into a merged skinned mesh and there is no swapping a sword on one.

**The board.** `boardFor()` is deterministic from the settlement id and the restock window, so
walking out and back in does not reshuffle the names — and it restocks every `scaling.restockDays`,
which is the only reason to come back. `minLevel` keeps a 900-gold caster off a level-2 village's
board; `minTownSize` says how big a place has to be to support one. A price climbs with the level of
the person buying (`scaling.pricePerLevel`).

**Contracts** live on `player.followers.contracts` and a save carries them. A save carries the
contracts and **not** the bodies, because the bodies are meshes and the world is rebuilt from its
seed — `followers.tick()` summons anybody under contract with no body back beside you once a run is
up, which is what makes a load put your company back.

## 11. Level scaling

`scaleFollower({ def, level, perLevel, power, health, grown })` — in `js/followers.js` rather than
`js/pets.js`, because `js/pets.js` imports Three.js and a node test cannot open it, and this is
exactly the arithmetic worth having a test over.

`perLevel` is `balance.json`'s `pets.perLevel` (1.17), the same compounding step class companions
have always used. `power` and `health` are `rpg.fx.product(owner, 'petPower' / 'petHealth')`, so
every companion affix and legendary power applies to a bought mercenary too. Re-costed every frame
`pets.update` runs, off the **owner's** level — which is what "all companions adjust to the player
level automatically" means, and what stops a sentry summoned at level 1 still swinging for 1 at 20.

---

## Files

| File | |
|---|---|
| `data/classbuild.json` | loadouts, elements, armour tiers, opening kit, tier names, base looks |
| `data/mercenaries.json` | slot ladder, per-type rule, scaling, ten types, shared ability table |
| `js/classbuild.js` | pure — tier list, point-buy, loadout gate, install, opening kit |
| `js/classbuild-ui.js` | the builder screen. Also the in-game respec, with `embedded: true` |
| `classbuild.css` | its stylesheet, injected by the module |
| `js/followers.js` | pure — slots, the gate, contracts, the board, `scaleFollower` |
| `js/followers-ui.js` | the Followers screen: Company / Hire / Spells |
| `followers.css` | its stylesheet, injected by the module |
| `js/pets.js` | `register`, `setGate`, `remove`, `origin`, abilities, upgrades, `refit` |
| `js/skills.js` | `petCount` / `petCap`, and `relearn()` so a respec reaches the keys |
| `js/perks.js` | The Kept Company grants `followerSlots` |
| `js/hire.js` | `roadHireOffer` — the road captain sells one of the ten |
| `js/newgame.js` | the Custom entry, the builder, and re-installing a saved build on load |
| `tests/round17-class.test.js` | 25 tests |
| `research/round17-class-handoff.md` | the `main.js` / `save.js` / `rpg.js` / `effects.js` patches |

---

# Round 20 — one spell at creation, the rest as you level, and the Unbinder

> "Let's change the character creator so that you only pick the first level spell. When you reach
> levels 3/7/12/18/24 (+ also change 7 to 6) unlock the next spell and have a 'spell available' slot
> in the inventory screen so you can open the dialog to choose the next spell. Add an NPC at town who
> is able to reset individual or all spells, perks, and talents, and remove the ability to do it
> directly from the inventory. These should cost a small amount of gold we can tweak later."

## The ladder moved, in both files that state it

`1 / 3 / 6 / 12 / 18 / 24` — `data/skills.json`'s `unlockAt` and `data/classbuild.json`'s `tiers`.
Those two are asserted equal at load (`spellCatalogue` throws if they drift), so changing one and
not the other is a loud failure rather than a dead key. The three code fallbacks for a caller that
hands in no data at all moved with them.

## A pick is gated by your level, and that is the whole change

One rule, in one function:

```js
pickRefusal(build, slot, skillId, cat, { level })   // level < cat.unlockAt[slot] → refused
```

The title screen builds a **level-1** character, so five of the six slots refuse themselves and the
creator asks for one spell without knowing anything about creation. The in-game chooser passes
`player.level` and the same function opens exactly the slots that have come due. `buildRefusal` now
asks only for the opening spell.

The default is `level = 1`, not `Infinity`, on purpose: a caller that forgets to pass a level gets
the conservative answer, never a free run at all six.

`installCustomClass` no longer fills an empty pick with the cheapest spell of its tier. That
fallback was harmless when the builder refused to start with an empty slot; now that five of them
are empty for every new character, it would have meant the game silently choosing four spells on
the player's behalf. A null id builds a real, explainable empty slot in `createSkillBar`
(`empty` / `pending` on the slot, a refusal that names the way out, no mana spent on a dead key).

## Where you choose: the "spell available" slot

`pendingPicks(build, cat, level)` — slots whose level has come with nothing in them — is the single
number behind all of it:

* the level-up line ("Level 6! 1 perk point, 1 spell to choose — press I.")
* the Skills tab's rail badge, alongside the unspent talents
* a green **Spell available** card on the sheet's bar strip, and a green slot on the HUD bar
* clicking it opens the chooser

**The chooser is `classbuild-ui.js`'s own Spells tab with a level on it**, not a new screen. A
bespoke in-game dialog would have been a second rendering of the same pick rules, correct on the
day it was written. `getLevel` is the only difference between the title screen and the sheet;
`inGame` drops the "Not finished" gate, which cannot apply to a character already out in the world.

## The Unbinder

A town role (`js/town.js`), size 2 and up, glyph `↺`. The one door for all three undos, priced in
`data/balance.json`'s `retrain` block, with the rules in the pure `js/retrain.js`:

| | one | all |
|---|---|---|
| spell | 120 + 20/level | 500 + 60/level |
| perk | 80 + 12/level | 400 + 45/level |
| talent | 60 + 8/level | 250 + 30/level |

**The Unbinder is rostered with the merchant and the elder, not at the end of the list.** `rosterFor`
fills a settlement up to a headcount by walking `ROLES` in declaration order and stops the moment it
is full — counted out, a role declared last would have existed in size 4 and 5 settlements only, and
a player who could not find one would reasonably conclude the feature was not in the game. `want`
goes up by one so nobody is pushed out to make room. `tests/round20-unbinder.spec.js` checks 40
settlement ids at each of the five sizes rather than checking the reasoning.

## What was removed, and the two back doors that came with it

Three free buttons are gone from the character sheet: the per-node perk give-back, the wholesale
"take it all back", and the builder's per-slot Unlearn. Clicking a talent you already have no longer
clears it.

Removing the buttons is not enough on its own, because two of the underlying operations were *also*
reachable by other means:

* **A filled spell slot could simply be overwritten.** `pickRefusal` now refuses a slot that already
  holds something and names the Unbinder.
* **A spent talent tier could be re-picked for free**, which was deliberate and right while the sheet
  also cleared one for free — click the other node and the first was gone, no gold, no walk.
  `pickTalent` now refuses a tier that is already spent. Picking into an *empty* tier is still free
  and instant: that is the decision, and charging for a decision nobody has made yet only stops
  people making it.

## Three pre-existing bugs this round turned up

* **The custom class could not start a game at all.** `applyOpeningKit` was passed
  `log: (t, k) => hud.log(t, k)` and `hud` is a `const` declared ~700 lines further down `begin()`,
  so the first line it logged killed the boot with *"Cannot access 'hud' before initialization"*.
  The default opening is the crate and the crate logs — so **every** custom character made the
  ordinary way, through the title screen, has failed to start since R17. This is the fourth TDZ
  crash in the project and `node --check` cannot see any of them. The lines are buffered now and
  flushed once the HUD exists. Found by writing a browser test that makes a character the way a
  player does; the existing specs all reached the builder and never pressed Start.
* **Picked talents were never saved.** `player.skillTalents` was on no save list, so every talent a
  character had taken was wiped by a reload, silently — `picksFor` read an undefined object and the
  screen simply drew every tier as unspent. Exactly the fault the perk forest had in R18, in the
  same list, found the same way (`grep -rn skillTalents js/`).
* **The Unbinder's refused rows said why only in a `title` attribute** — after a second of hovering
  a button you cannot press, and never at all on a touch screen. Moved onto the row.

## The review pass, and the one thing the first cut got wrong

Three findings, all real:

* **The creator's one decision was irreversible.** The overwrite rule fired from the moment the pick
  was made, and the Unlearn button had just been removed, and `drawSpells` only drew the spell list
  beside a *pending* slot — so clicking your opening spell on the title screen made the list vanish
  with no control anywhere that could change it, and the only remedy was 120 gold at an NPC in a town
  the character had not reached yet. **`build.granted` is what separates the two cases** and it was
  already on the build: set once by `applyOpeningKit` as the character walks out of the gate. Before
  that a build is a DRAFT and changing your mind is free, which is the whole point of a builder;
  after it, the Unbinder. `slotsOf` gained `editable` so the screen and the refusal ask one rule.
* **The "Spell available" card passed its slot index and `main.js` dropped it**, so a level-18
  character who had never filled their level-3 slot clicked the sixth card and got the second one's
  list. `show('spells', { slot })` now opens where the click pointed.
* **A talent card in an already-spent tier looked exactly like one you could take** — full opacity, a
  hover border, and "take" in the corner — and did nothing, with the reason in a tooltip that never
  arrives on a touch screen. Dimmed, and the corner says "tier spent". That is the same failure the
  Unbinder's own rows had been fixed for an hour earlier, on a different screen.

## Files

| File | |
|---|---|
| `js/retrain.js` | **new, pure** — prices, the six undos, and the whole counter as one `retrainMenu` |
| `data/balance.json` | the `retrain` block: every price, tunable without touching code |
| `js/classbuild.js` | the level gate, `pendingPicks`, `slotsOf({ level })`, no more fallback picks |
| `js/classbuild-ui.js` | level-gated slots, no Unlearn, and `inGame` — the same screen as the chooser |
| `js/skills.js` | an empty slot is a real slot: `empty` / `pending`, and a key that spends nothing |
| `js/skilltalents.js` | a spent tier is not re-spent for free |
| `js/town.js` | the `unbinder` role, its badge, and `rosterFor` exposed for the spec |
| `js/talkui.js` | the counter: three shelves, a price on every row, the reason on every refusal |
| `js/hud.js` | the "spell available" card, the badge, and the three removals |
| `js/save.js` | `skillTalents` — see above |
| `tests/round20-spells.test.js` | 25 node tests: the ladder, the gate, the empty slot, all six undos |
| `tests/round20-unbinder.spec.js` | 3 browser tests: the role is rostered, the counter charges, the chooser opens |

---

# Round 28 — every class has its own six skills (2026-10-02)

Before this round 47 skills were shared across 30 classes (`execute` on 10, `power_strike` on 9, `meteor` on 9). Now each of the 180 class skills belongs to exactly one class, and every skill carries its own four talent tiers (two bespoke nodes each, plus an optional shared library node) written as data on its row in `data/skills.json`. The spec is `research/round28-skills-plan.md`; the how-to for adding a class is `research/round28-content-guide.md`; the engine is `js/skillmech.js` (vocabulary: each key names its reader and writes its own card sentence) and `js/skillrun.js` (placed objects, walls, links, corpses, forms).

- **Forms.** One toggle system covers the druid's three shapes (Briarback, Fenrunner, Sporecap — each swaps the body for a creature and turns the druid's other skills into new ones), the Fighter's stances, the Dragon Knight's tempers and the Bard's songs.
- **Signature.** Each class's one-line signature (what its six skills share) is `signature` in `data/classes.json`, shown on the title screen's class list, class card and the builder's spell groups.
- **Old saves.** Talent picks on nodes that no longer exist are dropped and the player is told once (a banner on the Skills tab until dismissed). Talents were always free, so nothing is owed.
- **Custom classes** draw from all 180 skills, grouped by the class they come from.
- Content was written in five parallel batches through `tools/merge-r28-batch.mjs` (one lock, staging files in `data/r28-batches/`), so no batch could overwrite another's rows.

## Warrior — Frontline Tank · STR · signature: stronger in a crowd
1. **Cleave** — 143% around you, +12% per extra enemy hit (cap 48%).
2. **Breaching Shove** — frontal arc that knocks back.
3. **War Cry** — Might (+30% damage), taunts within 10 m; each taunted enemy adds 5% (cap 25%).
4. **Iron Gyre** — five spins at 5.5 m with a bleed.
5. **Iron Resolve** — 6% less damage per nearby enemy (cap 36%); every 4th hit taken releases a shockwave.
6. **Groundbreaker** — an 18 m line, 1.2 s stun, leaves a damaging patch.

## Batch: Frontline



### Fighter — Disciplined Duelist · STR · signature: stances and counters · tags: `riposted`, `duel` ("Called Out")
1. **Precise Strike** (`power_strike`) — 190% melee, ignores 40% armour; a crit Marks the target.
2. **Riposte** — 1.2 s window: the next melee hit is negated and answered for 250% + 0.8 s stun; unused, half the cooldown comes back.
3. **Duelist's Stance** — cycles Open (+20% dmg, +15% speed, −15% armour) / Closed (+50% armour, −10% dmg). Talents ride the switch (onEnter / onExit / follower buff).
4. **Lunge** — dash that stops at the first body for +50%; Open: 11 m range, Closed: 0.6 s stun.
5. **Sweeping Guard** — 180° sweep that tags Riposted, then a 1.5 s frontal guard (60% less); each hit taken makes the next sweep +10% (cap 50%).
6. **Master's Flurry** — 6 strikes on the lowest-health enemy, then a 160% finisher that knocks 4 m; Open: 8 strikes, Closed: 30% less damage taken during it.

### Paladin — Holy Warrior · STR · signature: heal by hitting, protect with your own health · tag: `seared`
1. **Sanctified Blade** — holy melee, +50% vs undead/fiends, each hit heals 1.5%.
2. **Blessed Earth** (`consecrate`) — ring of holy damage + a 6 s zone that strikes 6 enemies a second and heals you and followers 2% a pulse.
3. **Oath Hammer** — thrown hammer that comes back (80% on the return), marks Seared, heals 1% per hit.
4. **Martyr's Vow** — pay 15% health: you and every follower get a 25% barrier for 8 s.
5. **Shining Repulse** (`shining_rebuke`) — 5 m holy blast, knock 5 m + 1 s stun, +50% vs undead/fiends.
6. **Daybreak Descent** — leap to the follower nearest your aim; 220% landing, knock 3 m, followers heal 15%, a small blessed zone where you land.

### Knight — Sworn Tank · STR · shield · signature: takes hits FOR others · tags: —
1. **Rim Strike** (`shield_bash`) — 1 s stun and a 3 s taunt on each target.
2. **Sworn Guard** (`guard_stance`) — 8 s: 50% less from the front, −20% speed; the nearest follower is linked and you take 40% of its damage.
3. **Sworn Ward** — 12 s link: any hit on the follower above 20% of its health is taken by you instead. (One link at a time: Guard and Ward replace each other.)
4. **Challenge** — 10 m ring, taunts everything 4 s and pulls ranged enemies 4 m in.
5. **Rampart** — a 6 m wall 5 m ahead for 8 s that blocks movement and ranged hits and taunts what is near it.
6. **Unbroken Banner** — 12 s: you and followers cannot drop below 1 health, allies in 10 m take 20% less, everything in 10 m attacks you; when it ends everyone heals 20%.

### Runesmith — Rune-Forged Bulwark · STR · signature: runes · tag: `rent` · counter: `rune`
1. **Rune Hammer** — arcane melee, adds a Rune (3 runes detonate for 150% and knock 2 m).
2. **Rend Plate** (`sunder`) — marks Rent: targets take 15% more from every source for 8 s.
3. **Runeskin** (`stoneskin`) — 6 s: 40% less damage, melee attackers take 15% back.
4. **Forge Flame** — 12 s: attacks deal +40% as fire and burn; every 4th attack bursts 3 m.
5. **Warding Glyph** — a 12 s zone at your feet: allies take 25% less and gain a 2%/s barrier (cap 15%).
6. **The Great Anvil** — falls 1 s later for 350% + 2 s stun and stays 10 s; every Rune Hammer hit near it rings it for 120% and adds runes.

### Dragon Knight — Draconic Warrior · STR · signature: Wyrm Temper · tags: —
1. **Scale Rend** — melee whose element/status follows the temper (burn / chill / shock).
2. **Wyrm's Breath** (`flamethrower`) — 10 ticks over 2.2 s; Frost Breath stuns 0.3 s a tick, Storm Breath copies Shocked to 2 neighbours.
3. **Wyrmfall** — leap 14 m, 200% landing in the temper's element, knock 3 m.
4. **Wyrm Temper** — cycles Fire (+15% dmg) / Frost (+25% armour) / Storm (+15% speed); leaving one bursts 4 m for 60%.
5. **Dragonscale** — 25% barrier for 8 s, melee attackers take 40% back.
6. **Wyrm Ascendant** — 10 s: attacks deal +15% in the temper's element, apply its status and splash 3 m.

## Batch: Skirmish


For the lead to fold into CLASSES.md "Round 28". Source rows: `data/r28-batches/b2.json`.

**Flair vs Poise.** Both are 5-point resources on the HUD, and they are built and spent in opposite
ways on purpose. **Flair** (Swashbuckler) rewards *rotating*: Flourish gains 1, or 2 if the skill
before it was a different one; Daring Leap, Mocking Parry and every enemy Matador's Turn hits add
more; Grandeur spends *all* of it in one burst (at 5 it becomes a 360° 6 m certain critical hit),
and Pinning Thrust sips 1 for +50%. **Poise** (Monk) rewards *patience and taking hits*: Open
Palm, Wind Step and Mountain Fist add it steadily, and Inner Stillness turns every melee hit it
halves into another point; Ninefold Staff spends all of it for widening rings. Nothing that gains
Flair cares about variety on the Monk, and nothing on the Swashbuckler is paid for being hit.

### Rogue — Burst Assassin · tag `grave`
Signature: set up, then cash in. `grave` (Grave Marked, 10 s): +25% damage from you, and 30% of
everything it took during the mark lands again when it ends.
- **Gutting Strike** (`eviscerate`) — 110% cut that bleeds; +80% on a stunned target, +30% from behind.
- **Poison Dart** (`poison_dart`) — dart that stacks poison to 3.
- **Sucker Punch** (`sucker_punch`) — short-reach jab that stuns 1.6 s; +50% from behind.
- **Grave Mark** (`grave_mark`) — 30 m shadow bolt that puts on Grave Marked.
- **Slip Away** (`slip_away`) — a 4 s decoy draws the fight; your next skill counts as from behind.
- **Knife Storm** (`knife_storm`) — 8 knives over ~3 s, each at a random enemy within 7 m (marked ones preferred).

### Shadow Dancer — Stealth Duelist · signature: afterimages
- **Shade Cut** (`shade_cut`) — a cut, and an afterimage where you stood repeats it at 50%.
- **Umbral Step** (`shadowstep`) — dash to land behind the target; an afterimage at the start strikes too.
- **Shroud** (`smoke`) — an 8 m cloud that moves with you: allies inside take 35% less, enemies inside deal 20% less.
- **Cutting Waltz** (`cutting_waltz`) — 5 strikes on enemies within 8 m, then an afterimage repeats it at 40%.
- **Assassinate** (`execute`) — big shadow cut, ×2 below 30% health, a kill resets it.
- **Host of Shades** (`host_of_shades`) — 3 shades for 10 s (no follower slots) that copy every skill you cast at 40%.

### Swashbuckler — Flashy Duelist · resource Flair · tag `turned_about`
`turned_about` (Turned About, 3 s): every hit on it counts as from behind.
- **Flourish** (`flourish`) — showy cut; +1 Flair, +2 if your last skill was different.
- **Daring Leap** (`daring_leap`) — leap to land behind the target; your next skill counts as from behind; +1 Flair.
- **Mocking Parry** (`mocking_parry`) — the next melee hit inside 1.5 s is negated and its attacker taunted; +2 Flair. Never hits back (that is the Fighter's).
- **Pinning Thrust** (`pinning_thrust`) — 6 m thrust that roots 2 s; spends 1 Flair for +50% if you have it.
- **Matador's Turn** (`matadors_turn`) — ring that puts on Turned About and Weakened; +1 Flair per enemy hit.
- **Grandeur** (`grandeur`) — spends all Flair, +75% a point; at 5 it is a 360° 6 m certain critical hit.

### Monk — Martial Artist · resource Poise · tag `downed`
`downed` (Downed, 3 s): takes 20% more from you.
- **Open Palm** (`open_palm`) — palm that knocks 2 m; +1 Poise.
- **Wind Step** (`wind_step`) — dash to the target; your next skill within 3 s is a certain critical hit; +1 Poise.
- **Sweeping Heel** (`sweeping_heel`) — 3.5 m sweep that stuns 1.2 s and puts on Downed.
- **Inner Stillness** (`inner_stillness`) — 3 s channel that heals 6% a second; melee hits taken are halved and each adds 1 Poise.
- **Mountain Fist** (`mountain_fist`) — 10 m line punch that stuns 1.5 s; +2 Poise.
- **Ninefold Staff** (`ninefold_staff`) — three widening rings (3.5 / 4.7 / 5.9 m); spends all Poise, +33% a point.

### Scavenger — Resource Specialist · signature: luck
- **Lucky Strike** (`lucky_strike`) — each hit rolls one of seven statuses.
- **Junk Toss** (`junk_toss`) — throws a rock (stun), a bottle (fire pool) or a pot (poison pool); the HUD shows the next.
- **Scrounge** (`scrounge`) — heal 8% and 15 s of +15% move speed with 2 mana back per hit taken.
- **Caltrop Scatter** (`caltrop_scatter`) — the scatter lands and hobbles, and leaves a trap that bleeds the next thing through.
- **Rag-and-Pitch Bomb** (`pitch_bomb`) — lands 1 s later as a random element and leaves a pool of it.
- **Big Score** (`big_score`) — rolls 20% to 500% of its damage; a kill pays 25 gold.

### Witch Hunter — Anti-Magic Skirmisher · tag `guilty`
`guilty` (Guilty, 10 s): takes 25% more from every source (you and your followers).
- **Silvered Pin** (`pinning_shot`) — two bolts that root 2 s and strip 6 s; +50% vs undead.
- **Silver Edge** (`silver_edge`) — +60% vs casters and archers, +50% vs undead; removes one harmful status from you.
- **Null Circle** (`null_circle`) — a 12 m circle for 8 s that silences enemies and stops enemy ranged hits on anyone inside.
- **Writ of Guilt** (`writ_of_guilt`) — puts on Guilty and orders your followers onto it.
- **Iron Net** (`iron_net`) — everything within 4 m of the impact is rooted and silenced 3 s.
- **Rite of Purging** (`purging_rite`) — a 12 m holy ring that strips every enemy and cleanses you and every follower.

## Batch: Hunters and commanders


Every pet-command class is in this batch, so each one's followers play a different game:
the Ranger's cat is a **strike partner on the Quarry**, the Demon Hunter's hound is **brought back and
sent in** while Grudge builds from being hit, the Tinker's sentry is a **gadget you put down**
(temporary turrets), the Tactician has **no pet at all and commands whoever follows** (mercenaries
included), the Necromancer's dead are **disposable ammunition** (corpses become thralls or bursts),
and the Warlock's imp is **paid for in health** and carries Gnawed.

### Ranger — signature: the hunt · tag `quarry` (takes 20% more from every source, 12 s)
- **Long Draw** (`aimed_shot`) — 42 m shot, ignores 50% armour, +4% per metre past 20 m (cap +60%).
- **Hunter's Snare** (`hunters_snare`) — lands for damage and leaves a trap (arms 1 s, 30 s, max 2) that roots and marks Quarry.
- **Broadhead Fan** (`multi_shot`) — 5 arrows; an arrow that hits a Quarry target splits into 2.
- **Call the Quarry** (`quarry_call`) — marks Quarry and orders every follower to pounce on it.
- **Tracker's Leap** (`trackers_leap`) — dash back 9 m striking where you stood; next skill within 3 s +50%.
- **Arrow Storm** (`rain_of_arrows`) — 8 scattered volleys over 4 s; +50% against Quarry targets.

### Demon Hunter — signature: Grudge (max 5) · tag `brand` (takes 15% more from you, 8 s)
- **Brand Bolt** (`hex_bolt`) — +50% vs fiends/aberrations, Brands; while it is on your bar, every hit you TAKE gives 1 Grudge.
- **Tumbling Shot** (`tumbling_shot`) — roll back 7 m kicking what is near (knock 2 m); +1 Grudge.
- **Chain Hook** (`chain_hook`) — beam that drags bodies 12 m to your feet and stuns 0.8 s; +1 Grudge per body.
- **Unleash the Hound** (`unleash_hound`) — every follower pounces your target, the fallen are revived at 50%; +2 Grudge.
- **Settle the Grudge** (`grudge_bolt`) — spends all Grudge, +35% per point; at 5 it pierces everything and stuns 1 s.
- **Night Hunt** (`night_hunt`) — +3 Grudge, 6 s off Settle the Grudge, 12 s of attacks that Brand, +15% move.

### Tinker — signature: gadgets · tag `stuck` (takes 10% more from every source, 4 s)
- **Clockwork Bolt** (`clockwork_bolt`) — sticks (Stuck), its spring fires again 1.2 s later for 40%, the class companion attacks the same target.
- **Flask Grenade** (`flask_grenade`) — cycles Fire (burning pool) → Frost (chill) → Acid (Marked).
- **Deploy Sentry** (`deploy_sentry`) — a temporary Field Turret for 20 s that takes no follower slot (talents: flame/arc turrets, twin turrets, repair turret, a mine that bursts, mimicking turrets).
- **Pocket Watch** (`pocket_watch`) — heal 25% and a 6 s ward against the next hit above 15%.
- **Grapple Line** (`grapple_line`) — reel yourself to whatever the line hits (enemy or follower), stunning 0.5 s.
- **Spring Battery** (`spring_battery`) — 10 s: you and every follower +40% attack speed and free skills; 3 s slow after.

### Tactician — signature: orders (no pet; commands any follower) · tag `flanked` (takes 15% more from every source, 4 s)
- **Exploit the Gap** (`exploit_gap`) — +40% against an enemy attacking someone else; marks Flanked.
- **Rally** (`rally`) — Rallied on you and every follower; orders them back to you.
- **Lead the Charge** (`charge`) — dash with every follower within 15 m; your next skill and their next attack +30%.
- **Reposition** (`reposition`) — swap places with the aimed follower (20% barrier) or non-boss enemy (Weakened 2 s).
- **Seize the Initiative** (`seize_initiative`) — 30 s off every follower ability; your cooldowns run 2x for 3 s.
- **Battle Plan** (`battle_plan`) — a 16 m zone that follows you 10 s: enemies Marked (+25% taken, 30% slower), allies Hastened, a strike every 2 s; followers focus your target.

### Necromancer — signature: corpses (every death leaves one for 20 s)
- **Marrow Lance** (`marrow_lance`) — piercing bone bolt; a kill leaves a corpse worth 2.
- **Raise Thrall** (`raise_thrall`) — a thrall with +50% health, risen at a corpse within 12 m if there is one.
- **Corpse Pyre** (`corpse_pyre`) — strikes the aim and stands up to 5 nearby corpses that burst 0.8 s later for 100% in 4 m.
- **Grave Draught** (`drain`) — draining beam; heals you from the damage and every follower 12%.
- **Plague Cloud** (`toxic_cloud`) — 8 pulses of Poison AND Bleeding; a kill inside leaves a 2 m cloud.
- **March of the Buried** (`buried_march`) — 1 temporary thrall plus 1 per corpse within 20 m (up to 8), 18 s, no slots.

### Warlock — signature: health as fuel, corruption that spreads · status `gnawed`
- **Gnawing Dark** (`gnawing_dark`) — Gnawed (8 s, jumps to the nearest enemy when its host dies).
- **Bind a Fiend** (`bind_imp`) — costs 10% health; the imp's bolts leave Gnawed.
- **Hex of Ruin** (`curse`) — 5 m splash: Cursed (+25% taken) and Weakened 15%.
- **Soul Pact** (`soul_pact`) — costs 20% health, no mana: your statuses tick twice as fast for 10 s.
- **Void Rift** (`void_rift`) — 4 pulses pulling 2.5 m; copies every damage-over-time from a target to 3 neighbours.
- **Abyss Gate** (`abyss_gate`) — costs 10% health: tears open for a big hit, then a gate fires at random enemies within 20 m for 10 s, applying Gnawed.

## Batch: Elemental and arcane


Six casters, six different verbs. The way to tell them apart at a glance: the **Mage** builds a
counter and spends it, the **Pyromancer** builds stacking burns and cashes them, the **Stormcaller**
spreads Shocked and makes bolts jump, the **Sorcerer** rolls dice, the **Chronomancer** bends
cooldowns and holds enemies still, the **Enchanter** never hurts what it can put to sleep or turn.

### Mage — signature: frost then shatter · counter: Frostbite (max 5; at 5 the target is Frozen 2 s)
- **Frost Shard** (L1) — cheap ice bolt, +1 Frostbite a hit.
- **Rime Burst** (L3, `frost_nova`) — ring round you, +3 Frostbite and a 2 m knock.
- **Rime Spear** (L6, `ice_lance`) — beam that spends Frostbite: +20% a stack (to +100%) and clears it.
- **Spellrush** (L12) — your next 3 skills deal +60% and cost no mana.
- **Whiteout** (L18, `blizzard`) — 6 pulses, each adds Frostbite, so standing in it the whole time freezes.
- **Stillfrost** (L24) — 1.5 s fuse, pays +20% per Frostbite already on a target, then freezes everything it hit.

### Pyromancer — signature: burn stacks · Burning stacks to 5 on its own skills (other classes still refresh)
- **Firebolt** (L1) — bolt that adds a Burning stack.
- **Burning Line** (L3, `fire_wall`) — a 10 m line of fire laid across your aim; +2 stacks and a 5 s fire strip.
- **Cinder Stride** (L6, `ember_stride`) — +20% move, a burning trail and a fire pool where you set off.
- **Stoke the Familiar** (L12) — the familiar gets +50% damage and −25% damage taken, burns what it bites, and comes back if fallen.
- **Flashover** (L18) — every burning enemy in 6 m pays 60% of its remaining Burning at once and keeps 1 stack.
- **Fallstone** (L24, `meteor`) — the big stone, +3 Burning stacks on everything under it.

### Stormcaller — signature: conductors (Shocked bodies take +30%) · tags: —
- **Forked Bolt** (L1, `chain_bolt`) — one bolt that bounces to 4 more targets for 80% each, shocking them.
- **Thunder Ring** (L3, `thunderclap`) — a clap round you, then a 7 m ring that follows you for 6 s and stuns and shocks whatever crosses it.
- **Storm Beam** (L6) — the long shocking beam (the channel is the T1 talent Held Storm).
- **Storm Orbs** (L12) — 3 orbs zap the nearest enemy for 12 s; you drop a 3 m shocking patch as you call them.
- **Bolt Step** (L18) — a 12 m dash that shocks what it passes; untargetable for 0.8 s.
- **Eye of the Tempest** (L24) — 12 strikes over 6 s at random enemies inside 9 m.

### Sorcerer — signature: wild magic · tags: —
- **Wild Bolt** (L1) — a random element every cast, with that element's status; the bar shows the next roll.
- **Arcane Burst** (L3) — +20% for every different status on the target, to +100%; curses.
- **Mana Rend** (L6) — free beam, +8 mana per enemy, +60% to casters and to champions, silences 2 s.
- **Overchannel** (L12) — 8 s of +60% damage; every cast costs 3% health.
- **Transmute** (L18) — a non-boss becomes a harmless little creature for 5 s.
- **Sixfold Ruin** (L24) — six strikes on the spot you aim, one per element, each leaving its own status.

### Chronomancer — signature: time · status: Lagging (stacking slow, 10% a stack, to 4)
- **Second Hand** (L1) — quick bolt, +1 Lagging, every hit takes 0.2 s off your other cooldowns.
- **Quicken** (L3) — Hastens you and every follower and takes 2 s off your other cooldowns.
- **Entropy Field** (L6) — 8 pulses that pile on Lagging and hit harder the more statuses a target carries.
- **Rewind** (L12) — back to where you were 4 s ago, health only upward; 3 s off your other cooldowns.
- **Stasis Lock** (L18) — a non-boss is held still 4 s; damage done to it meanwhile lands ×1.5 when it thaws.
- **Stop the Clock** (L24) — every non-boss within 25 m held 4 s (×1.25 bank) while your cooldowns run 4× as fast.

### Enchanter — signature: sleep and charm (owns `sleep` and `turned`) · status: Lethargic (slow zone)
- **Arcane Jolt** (L1) — small bolt, ×2.5 against a sleeper (and wakes it).
- **Drowse** (L3) — everything in 5 m sleeps 6 s.
- **Beguile** (L6) — a non-boss fights for you and follows you for 10 s, then is Weakened.
- **Lethargy** (L12) — an 8 s zone that slows 50%.
- **Phantasm** (L18) — a decoy of you draws every enemy near it; whatever strikes it falls asleep 2 s.
- **Grand Enthrallment** (L24, `enthrall`) — every non-boss within 12 m fights its own side for 6 s.

Legacy ids kept (renamed): `frost_nova` Rime Burst, `ice_lance` Rime Spear, `blizzard` Whiteout,
`fire_wall` Burning Line, `ember_stride` Cinder Stride, `meteor` Fallstone, `chain_bolt` Forked Bolt,
`thunderclap` Thunder Ring. `flamethrower`, `curse`, `bind_imp` left these classes for their plan owners.

## Batch: Healers and support


For the lead to fold into CLASSES.md "Round 28". Numbers are base (before `effectiveMult`); every card
line is generated from data/skills.json.

### Cleric — Primary Healer · signature: heals that overflow into protection; raising the fallen · tag `lit`
`lit` (3 s): takes 10% more damage from you; Falling Light deals +50% to a Lit target.
1. **Mend** (self) — heal 35%, every follower heals 20%, overheal becomes a barrier up to 10%.
2. **Sunlance** (beam, holy, m 1.5, cd 6) — each enemy struck heals you and followers 2% and is Lit.
3. **Sanctuary** (ground zone, cd 24) — 6 s, 10 m across: allies inside heal 3% a second, enemies are pushed out 2 m a second.
4. **Guardian Light** (temporary wisp, cd 30) — no follower slot, 20 s, heals the most-hurt ally 6% every 2 s or strikes for 40%.
5. **Raise the Fallen** (self, cd 40) — revives every fallen follower at 50%, heals the rest 30%, Rallies you all.
6. **Falling Light** (`judgement`, ground, m 2.4, cd 14, 0.7 s delay) — +50% on a Lit target; allies under it heal 10%.

### Priest — Holy/Shadow Caster · signature: pre-paid revives and revenge · tag `killer`
`killer` (8 s): takes 20% more damage from you.
1. **Shadow Lance** (bolt, shadow, m 1.9, cd 5) — 25% of the damage heals the most-hurt ally.
2. **Prayer of Dawn** (around, holy, m 1.1, r 10, cd 12) — one ring: heals you 20% and every follower 20%, hits every enemy.
3. **Mark the Killer** (bolt, shadow, m 1.2, cd 8) — tags Killer.
4. **Vigil** (self, cd 45) — 12 s: the first killing blow on you or any follower leaves them at 1 health and bursts 6 m for 150%.
5. **Dread Hymn** (around, shadow, m 1.1, r 8, cd 18) — fears non-bosses 3 s; followers +20% damage for 4 s.
6. **Twinlight** (around, shadow, 6 pulses x m 0.8, r 14, cd 40) — each hit heals the most-hurt ally 25% of the damage; a 6 s ring around you heals allies 3% a second.

### Oracle — Predictive Protector · signature: foresight · tag `omen`
`omen` (6 s): a name the Oracle's other skills read (Prophecy +100%, talents spread / consume it); Omen Bolt pairs it with Weakened 25% for 3 s.
1. **Omen Bolt** (bolt, arcane, m 1.2, cd 3) — tags Omen, weakens 25% for 3 s.
2. **Foresight** (self, cd 16) — you and followers: a 15 s ward that negates the first hit worth more than 10% of maximum health.
3. **Prophecy** (ground, arcane, m 1.5, r 6, 2.5 s delay, cd 14) — a ring that follows the aimed enemy and slows 30%; +100% to Omened targets.
4. **Thread of Fate** (self, cd 18) — links the nearest follower (you take 50% of its damage) and Mends you both.
5. **Turn Aside** (around, arcane, m 1.1, r 6, cd 12) — knocks 3 m and interrupts the attack being wound up.
6. **The Last Prophecy** (self, cd 60) — 8 s: enemies within 20 m are Weakened 25%, followers +40% damage; ends in a 12 m 300% blast.

### Shaman — Spirit Caster · signature: posts · tags: —
1. **Spirit Bolt** (bolt, lightning, m 1.2, cd 3) — bounces to 2 more at 70%; every hit heals you and followers 2%.
2. **Mending Post** (ground post, cd 18) — 12 s, 30% of your health, heals allies within 8 m 2% a second; 2 at once.
3. **Storm Post** (ground post, cd 16) — 10 s, strikes 2 enemies within 10 m every 1 s for 25%.
4. **Call a Spirit** (`call_spirit`, summon spirit bear, cd 40) — the bear pounces your target; with the bear up it is a howl that hastens and taunts.
5. **Warding Spirits** (self, cd 24) — you and followers: 3 ward charges, each negates a hit of up to 8% of maximum health.
6. **The Great Post** (ground post, cd 50) — 15 s: strikes 3 enemies for 40% and heals allies 2% every 1.5 s; each Spirit Bolt hit near it rings it for 60%.

### Bard — Support Maestro · signature: songs (one at a time, Finale on switching away) · tags: —
1. **Discord Note** (bolt, arcane, m 1.3, cd 3) — ricochets once; Valour: you +25% attack speed 2 s / Ruin: Marked 3 s / Mending: allies heal 2% a hit.
2. **Ballad of Valour** (song) — allies within 10 m +25% attack speed, +10% move. Finale: followers +40% damage 4 s.
3. **Song of Ruin** (song) — enemies within 10 m take 12% more and deal 10% less. Finale: 150% shadow in 10 m + Weakened 5 s.
4. **Air of Mending** (song) — allies within 10 m heal 1.5% a second. Finale: 15% heal + cleanse 1.
5. **Quickstep Jig** (dash, m 1.6, cd 10) — no song: weakens what it passes; in a song it leaves a 3 s copy of that song's zone.
6. **Grand Finale** (around, arcane, m 3.2, r 12, cd 30) — +25% per follower alive, up to +50%.
Song talents work through what a card can say: the singer's stats, the followers' buff, and a cast on entering or leaving the song.

### Druid — Shapeshifting Healer · signature: shapes · tags: —
Shapes (engine pass): Briarback (thorn boar tank), Fenrunner (venom lizard), Sporecap (timed fungus).
1. **Thornlash** (bolt, nature, m 1.4, cd 3) — roots 0.6 s, heals the nearest follower 3%. Bramble Gore / Venom Lunge / Spore Lob.
2. **Greensap** (`renew`, self) — Mending on you and followers. Thornswell / Shed Skin / Mycel Web.
3. **Briarback Shape**, 5. **Fenrunner Shape**, 6. **Sporecap Shape** — as built in the engine pass.
4. **Call the Pack** (`call_wolf`) — a grove wolf; with the pack up, a howl. Den Guard / Running Pack / Puffball Brood.
Talents on the three shaped skills: the top-level part works in the druid's own body (and for a custom class with no shapes); `forms` riders give each shaped version its own twist (Thorn Fan, Wild Lash, Overgrowth, Wild Sap, Wild Pack).
