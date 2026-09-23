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
