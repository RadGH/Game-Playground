# Round 28 — skill rework PLAN (final; this file wins over the brainstorm)

Owner's ask:

> "Add distinct abilities for all classes instead of sharing them sometimes. Add more bespoke talents
> to individual abilities rather than generic area / damage percentages that change the skill in
> meaningful ways." — "Also for the druid add shapeshifting abilities that transform their other
> skills. Avoid WoW references."

Inputs: `research/round28-skills-brainstorm.md` (raw designs for all 180 slots, 4 talent tiers each).
This plan is the **roast of that brainstorm and the final word**. Where they disagree, this plan
wins. An engine agent and five content agents work ONLY from this file plus the brainstorm's
per-skill talent sketches (with §6's amendments applied on top).

How to read it:

| § | What | Who needs it |
|---|---|---|
| 1 | The roast — what was wrong with the brainstorm and the ruling on each | everyone |
| 2 | Final mechanics vocabulary, P1 / P2 / P3, with readers, wording and fx | engine (all), content (keys) |
| 3 | Final 30 x 6 table | content |
| 4 | Druid forms spec | engine + batch 5 |
| 5 | Talent data format and the skilltalents.js changes | engine + content |
| 6 | Amendment list: global talent rules + per-skill fixes | content |
| 7 | Save migration | engine |
| 8 | Custom class pool, followers, mercenaries | engine |
| 9 | Balance guidance | content |
| 10 | Five content batches, order, acceptance | lead + content |
| 11 | Tests to add / change | engine |
| 12 | Risks and what is parked | lead |

Measured facts this plan relies on (checked 2026-10-02):

* `data/skills.json`: 47 skills, 15 statuses, `classes` = 30 x 6, `unlockAt` [1,3,6,12,18,24].
* `data/classes.json` ALSO carries a `skills` list per class and **10 of the 30 disagree** with
  `skills.json` `classes` (cleric, necromancer, warlock, dragon_knight, pyromancer, stormcaller,
  druid, chronomancer, sorcerer, priest). `js/newgame.js:538` (the class preview on the title screen)
  reads the classes.json copy, so the preview is already showing the wrong six for a third of the
  classes. `createSkillBar` reads skills.json. This round makes them one list (§11).
* Class pets spawn from `classDef.pet` (`js/main.js:2850`), NOT from a summon skill. Moving
  `call_wolf` / `call_spirit` / `deploy_sentry` to later slots does not strand anybody's pet.
* `player.skillTalents[skillId][tier] = nodeId` (`js/skilltalents.js` `pickTalent`), saved by
  `js/save.js:199`, emptied only by `js/retrain.js` (Unbinder). Picking into an empty tier is free.
* `TALENT_LIBRARY` has 24 nodes (6 per tier). `OFFERS` hands them out by shape. `talentsOn`
  resolves ids through the library ONLY.
* `effectiveMult = mult x cooldownPower (1 + 0.08 per second past 4) x unlockPower (1.0 at L1 -> 2.0 at L24)`;
  `STATUS_POWER_SHARE = 0.35`; `tests/round21-balance.test.js` caps a skill's DoT at 1.0 x its own
  impact (Poison Dart 1.5) and caps the DoT skills' average per-cooldown-second at 1.15 x the best
  direct skill.
* `js/actors.js`: `land()` (~1365) already reads `strike.push` / `strike.stagger` (stagger = a real
  stun with diminishing returns); `aimOf` (716) + `taunt(enemy, pet, s)` (756) exist but only point
  at PETS; enemies have a `flee` state with `fleeFor` (~939); `applyModifier` / `removeModifier`
  (~1197 / 1232); ranged enemies fire on `swingTimer` inside `e.ranged.range` (~1040).
* `avatar-3d/js/spellfx.js` methods: `projectile, impact, aoe, cast, heal, revive, breath,
  orbitOrb, pillar, vortex, storm, footfall, status(target,type,on), clearStatus, pulseStatus`.
  Status auras: burn poison bleed freeze stun sleep confused dazed blind slow marked barrier regen
  sunder curse silence disarm root rally haste enchant block deflect. main.js adds `fx.swipe`,
  `ringPoints`, `dropPool` (5152), `startOrbs` (5105).
* Creature bodies available for druid forms (avatar-3d `creature-types.js`): `boar`, `crocodile`,
  `mushroom` (all present).

---

## 1. The roast

The brainstorm is complete (180 rows, 180 unique ids, all 47 legacy ids used exactly once, four
tiers x two bespoke nodes on every skill). It is also too big, too dial-heavy in places, and it
quietly leans on a dozen engine features that would each be a round of work. Findings, harshest
first, each with the ruling.

**R1. "Twin X — 2 charges" appears 41 times; "Long X" 61 times; "Wide X" 33 times.** That is the
generic library wearing a bespoke name — exactly what the owner said he did not want. A node whose
only change is a duration, a radius, a count or a cooldown is a *dial*, not a rule.
**Ruling:** at most ONE dial node per skill, and it must carry a trade (8 m but 3 s; 22 s but half
the heal). A pure upgrade dial is deleted. At most one `charges` node per skill and three per class,
and only on tier 3 or 4. See §6 G2/G3.

**R2. Status soup.** The brainstorm uses Dazed, Blinded, Disarming, Insult, Shame, Rattled and
Weakened — seven names for "deals X% less damage". Plus Exposed / Gutted / Brittle / Hoarfrost for
"takes X% more". A player cannot hold that many words. **Ruling:** one `weaken` (deals less), one
`marked` (takes more), a new `disarm` (deals NO damage, can still move), a new `root` (cannot move),
`stagger` for every stun, a new `sleep`, `fear` (uses the existing flee state), and one `turned`
for every charm/confuse. Each class's own *tag* (Quarry, Omen, Brand…) is a tag, not a status —
it carries a number only if its row says so. See §2 group F and §6 G6.

**R3. Engine features that are each a round of work.** The brainstorm assumed: bodies slammed into
walls and cliffs, "fated" enemies a bolt chases after they leave a circle, hold-to-charge wind-ups
that scale while held, reflected projectiles flying back, pickup objects on the ground, enemies that
"do not alert their pack", swapping every enemy with another ("Grand Shuffle"), rewinding an ENEMY,
"every follower linked to every other", stealing a champion's aura, sleepers that drift. **Ruling:**
all CUT (P3, §2.3). Each node that used one is listed in §6 with its replacement. What survives is
about 40 P1 entries (keys plus the new status rows, §2.1 groups A-G) and 8 P2 keys (§2.2), every
one of which has a named reader.

**R4. Overlapping skills across classes.**
* Mage *Absolute Zero* (stasis the field, bank damage) and Chronomancer *Stop the Clock* (stasis the
  field, bank damage) were the same skill. **Mage's is rebuilt as `stillfrost`**: it maxes Frostbite
  (Frozen = stagger) and shatters — no stasis. Stasis belongs to the Chronomancer.
* Paladin *Dawnbreaker* and Dragon Knight *Wyrmfall* were both "leap, burst on landing" on a STR
  class. **Paladin's is rebuilt as `daybreak_descent`**: a leap onto an ALLY or point that heals and
  sanctifies; the damage is incidental. Wyrmfall keeps the offensive leap.
* Bard *Lullaby* and Enchanter *Drowse* were both area sleep. The brainstorm already gave sleep to
  the Enchanter; **the Bard's slot 4 becomes a third song, `air_of_mending`** (§3.7).
* Enchanter *Beguile* and *Befuddle* were both "enemies fight each other" once confuse and charm
  are one mechanic. **Befuddle is replaced by `lethargy`** (attack-speed and move slow zone).
* Rune Hammer T1b "Thrown Hammer — returns" duplicated the Paladin's *Oath Hammer* base. Replaced.
* Monk *Inner Stillness* answered melee hits — the Fighter's *Riposte* again. It now **absorbs**
  hits into Poise instead.
* Marks: Ranger Quarry, Rogue Grave Mark, Witch Hunter Condemn, Priest Mark the Killer, Oracle
  Omen, Tactician Flanked, DH Brand, Fighter Duel — eight "this one takes more" marks. They stay
  (marking is the genre's verb) but **each has a different payload** and only ONE of them is a flat
  "+25% from the whole party" (the Witch Hunter's Writ). The table in §3 states each payload.

**R5. Base hooks that silently depended on expensive mechanics.** Grave Mark (store), Witch Hunter
(strip, silence), Knight (intercept), Oracle (link), Song of Ruin (suppress) all needed a P2 feature
just to do their base job. **Ruling:** `store`, `strip`, `silence`, `link` and `blocksRanged` are
cheap once defined narrowly (§2) and are promoted to P1. Song of Ruin's suppress moved to a talent.
Enchanter (turned), Chronomancer (stasis, rewind), Knight Rampart (wall) and Shadow Dancer Host
(mimic) still need P2 — that drives the batch order in §10.

**R6. Numbers above the band.** Shade Cut (0.75 per cooldown second), Clockwork Bolt (0.63), Master's
Flurry (0.38 on a 22 s skill = 1.86/s after `effectiveMult`), Abyss Gate (0.30 on a 40 s skill),
Settle the Grudge at average Grudge (0.45), Overchannel's "double damage for 8 s", Oath Hammer with
return (0.38). The brainstorm wrote base numbers as if `effectiveMult` did not exist. **Ruling:**
§3 carries corrected base numbers; §9 is the band every content agent budgets against.

**R7. Banned or WoW-flavoured names.** The brainstorm's own scan missed: *Cataclysm* (a WoW
expansion), *Draconic Aspect* / "Aspect" (the WoW dragon Aspects), *Draconic Fury* (Fury is banned
as a resource word — renamed for safety), *Dance of Blades* (WoW "Blade Dance"), *Condemn* (WoW
warrior), *Arcane Surge* (WoW mage), *Hallowed Ground*, *Final Verdict*, *Rebuke*, *Purge the
Wicked*, *Cold Blood*, *Rallying Cry*, *Retribution*, *Ironbark*, *Rebirth*, *Flare*, *Frost Armour*,
*Ambush*, *Shiv*, *Vengeance*/*Vengeful*, *Sigil*, *Infernal*, *Halo*, *Beacon*, *Overload* (and it
collides with our own library node), *Kill Order*, *Feral*, plus "death coil" in a fantasy line and
five "X-free name:" drafting leftovers. And the druid: a lean **cat** form with bleeds from behind
is WoW's Cat Form with the serial numbers filed off, and a rooted healing **tree** is WoW's Tree of
Life. **Ruling:** full rename list in §6 G7; the druid's shapes are a thorn-backed **boar**
(Briarback), a lean venomous **marsh lizard** (Fenrunner) and a walking **fungus** (Sporecap) — §4.
"Long Breath" also collides with an existing perk name (js/perks.js:348) and is renamed.

**R8. Wrong library tiers.** `corpse_pyre` T3 lib `drain` (a tier-2 node), `curse` T1 lib `burst`
and `iron_net` T1 lib `burst` (tier-2 nodes). A lib id must be a node of THAT tier. Fixed in §6.

**R9. Unreadable at a glance.** Fated circles, linked damage split across three bodies, Grand
Shuffle, a stance that changes four skills' riders, a bolt whose next element is random, a
resource that rewards variety. **Ruling:** the ones kept get HUD support the engine must build
(§2 group H: resource pips, form/stance/song/temper badge, next-roll icon, charge count, recast
ring). Fated and Shuffle are cut. Every rule a talent adds must be expressible in one generated
sentence with numbers (WORDING.md rules 1-4); if `describeMod` cannot phrase it, the node is wrong.

**R10. Cross-class tags leaking.** Cleric's *Verdict* consumed "Lit / Seared" — Seared was the
Paladin's tag. **Ruling:** a tag is owned by one class; a skill only consumes its own class's tags.
Cleric's Sunlance now applies `lit` itself.

**R11. The custom-class pool question.** Every legacy id found a home, so there is no "leftover"
pool. The custom class now picks from all 180 (each skill's tier = its one slot level). That only
works if rule 2 of the brainstorm ("every skill stands alone") is enforced: §8 makes it a test.

**R12. What the brainstorm got right and must not be lost.** Every class has six different verbs;
resources are original (Flair / Poise / Grudge); combos live in talents; most of the new vocabulary
is uniques.js's already-tested `resolveAttack` / `afterKill` driven from a skill plan instead of an
item. Keep all of that.

---

## 2. Final mechanics vocabulary

Every key below is a field on a skill row (base) or inside a talent node's `mod` (§5). Each one has
exactly one reader. **Registry:** a new pure module **`js/skillmech.js`** holds `VOCAB`, a table of
`{ key: { phase, reader, describe(value, ctx) } }`. `phase` is one of `plan` (folded by
`createSkillBar`/`talentPlan` and read when the cast is drawn and aimed), `hit` (rides
`player.castRules` into `rpg.strike`), `kill` (main.js `onEnemyKilled` via `uniqueEnv.afterKill`),
`self` (a status on the player read in the damage-taken path), `enemy` (read in actors.js),
`pet` (read in js/pets.js), `bar` (read in createSkillBar). The audit test (§11) fails when a key
in the data is missing from `VOCAB`, when a VOCAB key has no `describe`, or when the named reader
file never mentions the key.

The pure state that several readers share (resources, tags, corpses, placed objects, charges,
recast windows, form state, rewind buffer) also lives in `js/skillmech.js`, with no DOM and no
Three.js, so node tests drive it directly. main.js only adapts.

Priority: **P1** — the engine agent ships these before any content batch is merged. **P2** — ships
in the engine's second pass; only batches noted in §10 depend on them. **P3** — cut; content must not
use them.

Wording column: the template `describe()` must produce (WORDING.md: quantities, seconds with `s`,
"damage" named, no bare "it", DoT as total over duration). `{x}` are the row's numbers.

### 2.1 P1 — required (groups A-H)

**A. Moving bodies**

| key | fields | semantics | reader | wording | fx |
|---|---|---|---|---|---|
| `knock` | `{ push, stagger, away: 'caster'\|'impact', interrupt }` | Each body hit is pushed `push` m (rank-resisted by actors `pushFor`) and staggered `stagger` s (DR via `staggerFor`). `interrupt: true` also resets the enemy's `swingTimer` to full (it loses the attack it was winding up). | `rpg.strike` passes `{push, stagger}` in the strike shape to `actors.land` (~1365); main.js `castSkill` builds it from `plan.knock` for every kind | "Knocks targets back {push} m and stuns them for {stagger}s" / "…and interrupts their attack" | `impact` + `status(target,'stun')` |
| `pullIn` | `{ metres, to: 'self'\|'impact'\|'line' }` | Bodies hit are dragged up to `metres` toward the target point (a negative push in `land`, capped so nothing passes through the point). | `actors.land` (`strike.pull`) — reuse uniques' `pull` path in `uniqueEnv` | "Pulls targets {metres} m toward you" | `vortex` small, ms 300 |
| `dash` (extended) | `{ to: 'aim'\|'target'\|'behind'\|'back'\|'swap'\|'ally'\|'hit', range, leap, land: { radius, mult } }` | `target`: stop at the first body on the line. `behind`: land 1.5 m past the target, facing it. `back`: move opposite your aim. `swap`: exchange places with the aimed follower or non-boss enemy. `ally`: land beside the follower nearest the aim. `hit`: a hook — fly the line, move to whatever it hits (enemy, follower) or to the end. `leap: true` = no damage along the path; `land` = a burst at the end. | main.js `castSkill` `plan.kind === 'dash'` (~1681) | "Leaps up to {range} m behind the target" / "Swaps places with the target" / "…deals {land.mult}% weapon damage in {land.radius} m on landing" | `footfall` trail, `aoe` on land |
| `line` | `{ length, width, every }` | A ground skill laid as a line from the caster toward the aim (or across the aim, `across: true`): one strike or pool segment per `every` m. | main.js `castSkill` `ground` branch; `dropPool` per segment | "Along a {length} m line" | `ringPoints` along the line |

**B. Projectiles**

| key | fields | semantics | reader | wording | fx |
|---|---|---|---|---|---|
| `ricochet` | `{ bounces, range, keep }` | After a hit the bolt jumps to the nearest un-hit body within `range` at `keep` x damage. Uniques' `resolveAttack` ricochet. | main.js `fireBolt` (1400) via `uniqueEnv` | "Bounces to {bounces} more targets within {range} m for {keep}% damage each" | `projectile` hop |
| `split` | `{ shards, range, keep, when: 'hit'\|'kill'\|'tag:<id>' }` | On impact (or only on a kill / on a tagged target) the bolt breaks into `shards` aimed at the nearest bodies within `range`. Uniques' `split`. | `fireBolt` via `uniqueEnv` | "Splits into {shards} shards on impact, each dealing {keep}% damage" | `projectile` x shards |
| `returns` | `{ keep }` | The bolt flies to max range (or first hit if `pierce` is 0) and flies back to the caster, hitting again on the way at `keep`. | `fireBolt` — a second flight with `from`/`to` swapped | "Returns to you, hitting again for {keep}% damage" | `projectile` reversed |

**C. When something dies, when something lands**

| key | fields | semantics | reader | wording | fx |
|---|---|---|---|---|---|
| `onKill` | `{ burst:{radius,mult}, spread:{types,radius}, reset, refund, heal, mana, gold, corpse:{worth}, tag:{id,seconds} }` | When THIS skill lands the killing blow. `reset` = cooldown to 0; `refund` = a share of the cooldown; `spread` = copy the dead body's listed statuses to bodies within `radius`; `tag` = put this class's tag on the nearest enemy. | main.js `onEnemyKilled` checks `killer.castRules.skill` and runs `uniqueEnv.afterKill` with the plan's `onKill` | "A kill with this skill resets its cooldown" / "…bursts for {mult}% in {radius} m" | `impact` burst, `aoe` |
| `onHit` | `{ heal, healAllies, mana, gold, status, statusChance }` | Per body hit: heal the caster (share of max hp), the most-hurt ally, restore mana, etc. | `rpg.strike` via castRules (phase `hit`) | "Each enemy hit restores {heal}% of your maximum health" | `heal` small |
| `onCrit` | `{ repeat, knock, status, reset }` | Only on a critical hit. | `rpg.strike` via castRules | "A critical hit with this skill…" | — |
| `place` | `{ kind: 'pulse'\|'zone'\|'trap', seconds, radius, every, follow: 'self'\|'aim'\|'target'\|null, max, hp, strike:{mult,element,status,targets,nearest}, heal, buff, debuff, pull, knockOut, arm, triggerRadius, edge, blocksRanged, ringOn:{skill,radius} }` | ONE primitive for totems, wards, traps, banners, lures and rings. `pulse`: every `every` s strike `targets` enemies (nearest or random) and/or heal allies within `radius`. `zone`: bodies inside get `buff`/`debuff` statuses refreshed each second; `knockOut` pushes enemies outward each second; `pull` drags them inward; `edge: true` fires only on bodies whose inside/outside state flips (Thunder Ring); `blocksRanged`: an enemy ranged hit whose TARGET is inside is negated. `trap`: arms after `arm` s, fires once on the first enemy within `triggerRadius`, then is gone. `hp` = it can be struck and broken (enemies may aim at it, §2 `taunt by`). `max` = how many of this skill may stand at once (oldest removed). `ringOn`: extra pulse whenever the named skill hits within `radius` of it (Great Anvil). | `skillmech.js` holds the list; main.js frame loop calls `tickPlaced(dt)`; actors.js ranged hit asks `skillmech.blocksRanged(target)` | "Places a post for {seconds}s that strikes the nearest enemy within {radius} m every {every}s for {mult}% damage" / "…a trap that arms after {arm}s" | `pillar` small for posts, `ringPoints` for zones, `decal` for traps |
| `pool` (extended `ground`) | `{ seconds, radius, element, status, slow, power }` | The existing `dropPool` with a status and a slow. | `dropPool` (5152) / `tickPools` | "Leaves a {radius} m pool for {seconds}s that deals {total} {element} damage over {seconds}s" | existing pool fx |
| `repeats` (extended) | `{ count, every, grow, scatter, alternate: [a,b] }` | Existing repeats plus: `grow` = radius +x m per repeat; `scatter` = each repeat lands at a random point inside the radius (prefers enemies); `alternate` = repeats alternate between two sub-plans (Twinlight). | main.js `castSkill` repeats loop | "Strikes {count} times over {seconds}s at random points inside {radius} m" | per-repeat existing fx |
| `afterimage` | `{ delay, mult, at: 'start'\|'end', count }` | A shadow copy of THIS cast fires again from where you stood (`start`) or stand (`end`) after `delay` s, at `mult`. Cheap: the same plan re-run with a different origin and multiplier. | main.js `castSkill` — `castSkill(i, { echo: true, origin, mult })` | "An afterimage repeats this strike {delay}s later for {mult}% damage" | dark `cast` at origin, translucent body flash |

**D. Pay-offs and set-ups**

| key | fields | semantics | reader | wording | fx |
|---|---|---|---|---|---|
| `tag` / `primes` | `{ id, seconds, takeMore, fromParty, onEnd }` | Put this class's TAG on bodies hit. A tag is a row in `skills.json` `statuses` with `kind: 'tag'` and `owner: <classId>`; it carries a number only if declared (`takeMore` = from everyone, `fromYou` = from the caster only, `fromParty` = from followers). `onEnd: { bank: share }` = see `store`. | `rpg.strike` (castRules) applies; `skills.applyStatus` holds it | "Marks targets with Quarry for {seconds}s: they take {fromYou}% more damage from you" | `status(target,'marked')` tinted per tag |
| `consumes` | `{ tag\|status, mult, add, remove, perStack }` | Bonus against a body carrying the tag/status; `remove: true` takes it off; `perStack` multiplies by stacks. Statuses `stagger`, `sleep`, `root`, `frozen` are valid here. | `rpg.strike` via castRules (reads `defender.statuses`, `defender.stagger`) | "Deals {mult}% more damage to Quarry targets" | `impact` crit-style |
| `stack` | `{ status, max }` | This skill's status stacks up to `max` instead of refreshing (each stack an independent copy with its own timer). Default statuses still refresh — the pinned test "a second burn refreshes" stays true. Frostbite and Runes are stack-only counters (`kind: 'counter'`, `onMax: {status|detonate}`). | `skills.applyStatus` (328) takes `{ stack: max }` | "Stacks up to {max} times" | `pulseStatus` per stack |
| `detonate` | `{ types, share, keep }` | Pay `share` of the remaining damage of the listed DoTs on the body now; leave `keep` stacks. | `rpg.strike` via castRules; `skills.tickStatuses` exposes remaining | "Deals {share}% of the remaining Burning damage at once" | `impact` element burst |
| `spreadStatus` | `{ types, radius, max }` | Copy the listed statuses from the struck body to up to `max` bodies within `radius`. | `rpg.strike` via castRules | "Copies Burning to up to {max} enemies within {radius} m" | `arc` between bodies |
| `store` | `{ share, release: 'end'\|'recast' }` | A tag that BANKS a share of all damage the tagged body takes while it lasts, and deals the bank as true damage when the tag ends (or on recast). Also used on the caster (Pain Bank: damage you TAKE is banked and released around you). | `rpg.strike` adds to `tag.bank`; `skills.tickStatuses` releases on expiry | "When the mark ends, the target takes {share}% of the damage it took during the mark" | `impact` element `true` |
| `bonusIf` | list of `{ when, mult }`, `when` ∈ `execute:<hp>`, `family:<a,b>`, `behind`, `crowd:<per>:<cap>`, `distance:<from>:<per>:<cap>`, `stationary:<s>`, `caster`, `rank:champion` | Conditional damage. `behind` uses the enemy's facing (actor group yaw) vs the strike direction (> 100° off its front). `caster` = enemy with a warband role `caster` or a non-physical `ranged`. | `rpg.strike` via castRules | "Deals {mult}% more damage to targets below {hp}% health" | crit `impact` |
| `pen` | number 0-1 | Ignore this share of armour for this skill's hits. | `rpg.strike` already takes `pen` | "Ignores {pen}% of the target's armour" | — |

**E. Your own state, your cooldowns, your resources**

| key | fields | semantics | reader | wording | fx |
|---|---|---|---|---|---|
| `charges` | `{ max }` | The skill holds up to `max` uses; the cooldown recharges one at a time. | `createSkillBar` (`slot.charges`, `slot.chargeT`) | "Holds {max} charges" | HUD count |
| `recast` | `{ window, then: <sub-plan> }` | After casting, for `window` s the same key runs `then` instead of checking the cooldown (detonate the post, swap with the decoy, snap the thread, fly back). | `createSkillBar` `use()`; the sub-plan goes through the normal `castSkill` path | "Press again within {window}s to…" | HUD ring on the slot |
| `resource` | `{ id: 'flair'\|'poise'\|'grudge', gain, gainIfNew, gainPer:'hit'\|'cast'\|'hurt'\|'kill', spend: 'all'\|n, perPoint: { mult } }` | Class counters, max 5 (7 with a talent), held on the player, decay 1 point per 8 s out of combat, NOT saved. `gainIfNew` = extra when the previous skill cast was a different id (Flair). `spend` consumes on cast; `perPoint` scales the cast by points spent. | `skillmech.js` `resourceOf(player,id)`; `createSkillBar` spends; `rpg.strike` gains on hit | "Gains 1 Flair, 2 if your previous skill was a different one" / "Spends all Grudge: +{perPoint}% damage per point" | HUD pips |
| `form` | §4 | Persistent self state with an exclusive `group` (`shape`, `stance`, `temper`, `song`), optional body swap, stat block, basic-attack override, and per-skill overrides through each skill row's `forms` map. | `skillmech.js` `formOf(player)`; `createSkillBar.use` merges `skill.forms[formId]`; player basic attack reads `form.basic` | "While in Briarback shape: +60% armour…" | body swap, `status(player,'enchant')` |
| `elementFrom` | `'temper'\|'song'\|'cycle'` | The cast's element (and its status) comes from the current temper / song, or cycles per cast (`elementCycle: [..]`). Data keeps a real `element` as the fallback, so tests that check a skill's element still pass. | `createSkillBar.use` | "Element follows your Wyrm Temper" | element-tinted fx |
| `elementPool` / `statusPool` / `variance` | `[ids]`, `[ids]`, `[min,max]` | Random element/status per cast; random multiplier. The bar exposes `next` so the HUD can show the next roll; the roll is made when the PREVIOUS cast resolves. | `createSkillBar.use` | "Deals a random element: fire, ice…" / "Deals between {min}% and {max}% weapon damage" | HUD next-roll icon |
| `hpCost` | share 0-1 | Costs this share of max health (never below 1 health). With `perCast: true` inside a status: every cast while it lasts costs it. | `createSkillBar.use` | "Costs {hpCost}% of your maximum health" | red `cast` |
| `resetOn` / `cutCooldown` | `{ when: 'kill'\|'crit'\|'consume'\|'crowd:n' }`; `{ skill: id\|'others'\|'followers', seconds, per: 'hit'\|'cast'\|'kill' }` | Reset this skill; cut another skill's (or every other skill's, or every follower ability's) cooldown. | `createSkillBar` (`slots[i].cooldown`); pets.js ability timers for `followers` | "Each enemy hit takes 1s off War Cry's cooldown" | — |
| `empowerNext` | `{ count, mult, free, crit, behind, seconds }` | The next `count` skill casts within `seconds` get the rider. | `createSkillBar.use` consumes; castRules carries `crit`/`behind` | "Your next 3 skills deal 60% more damage and cost no mana" | `status(player,'enchant')` |
| `imbue` | `{ seconds, element, status, splash, mult, every: { n, burst } }` | Your BASIC attack changes for `seconds`. | main.js basic swing / shot path (reads `player.imbue`) | "For {seconds}s your attacks deal {mult}% more damage as fire and apply Burning" | `status(player,'enchant')` |
| `channel` | `{ seconds, every, moveK }` | Runs for up to `seconds`, ticking every `every` s. Moving cancels it unless `moveK` (move-speed factor) is set; pressing the key again ends it early. NO hold-to-charge (P3). | main.js frame loop `tickChannel`; `castSkill` starts it | "Channels for up to {seconds}s, striking every {every}s" | sustained `beam`/`breath` |

**F. Statuses (data rows in `skills.json` `statuses`, read by `skills.applyStatus` / `tickStatuses`,
actors.js and the damage-taken path)**

| status | fields | semantics | reader |
|---|---|---|---|
| `root` (new) | `seconds` | Cannot move; can attack in reach. Bosses: slowed 60% instead. | actors.js movement step |
| `disarm` (new) | `seconds` | Deals no damage; can move. Bosses: deal 50% less. | `rpg.strike` attacker side |
| `sleep` (new, `kind:'disable'`) | `seconds`, `breakOnDamage: true` | Cannot act; the first damage ends it (unless a skill says `hitsToWake: 2`). Never on bosses (slow instead). Champions: half duration. | actors.js update skips the enemy; `rpg.strike` wakes |
| `fear` (new) | `seconds` | Uses actors' existing `flee` state + `fleeFor`, fleeing from the caster (or toward a point `fleeTo`). Never on bosses. | actors.js (~939) |
| `silence` (new) | `seconds` | A ranged enemy cannot fire (it closes to melee); a warband caster/leader cannot use its buff action. | actors.js ranged branch (~1040) and the leader action |
| `strip` (new) | `seconds` | While stripped, the enemy's modifier-granted damage and armour factors are cancelled: actors.js records `e.modDmg` / `e.modArmor` (the products of its modifiers' `dmg` / `armor`) at `add()`; `rpg.strike` divides by them while stripped; modifier status auras are hidden. No modifier is removed, so nothing has to be put back exactly. | actors.js `add`; `rpg.strike` |
| `turned` (P2) | — | see 2.2 | — |
| `ward` (self) | `{ charges, threshold, cap }` | Negates a hit completely: `threshold` = only hits worth more than this share of max health (Foresight); `cap` = only hits up to this share (Warding Spirits); one charge per negated hit. On you, a follower, or a post. | player damage-taken path in main.js; pets.js `hurt` |
| `counter` (self) | `{ window, hits, negate, answer: {mult, knock}, gain: {resource,n}, tauntAttacker }` | For `window` s, the next `hits` MELEE hits on you are reduced by `negate` (1 = fully) and each one triggers `answer` (a strike at the attacker), resource gain, a taunt. Ends unused → `onUnused: { refund }`. | player damage-taken path |
| self-status fields | `reflect` (share of melee damage returned), `ccImmune` (no stagger/knock/slow/root), `resistPerFoe {per, cap, radius}`, `deathPrevent` (cannot drop below 1 health), `cdRate` (cooldowns tick x), `dotRate` (statuses YOU apply tick x), `evade` (chance to negate an incoming hit), `untargetable` (enemies' `aimOf` skips you; ≤1.5 s), `frontal` (the resist applies only to hits from the front 180°) | read where named | `rpg.strike` defender side for damage; `createSkillBar` tick for `cdRate`; `tickStatuses` for `dotRate`; actors `aimOf` for `untargetable` |
| `marked` / `weaken` / `haste` / `chill` / `web` / `shock` / `curse` | existing | Dazed / Blinded / Insult / Shame / Rattled → `weaken` with its own numbers; Exposed / Gutted / Brittle → `marked`; Hastened → `haste` | existing |
| `frostbite`, `rune`, `gnawed` | `kind: 'counter'` / DoT | Mage counter (max 5, `onMax: freeze 2 s` = stagger), Runesmith counter (max 3, `onMax: detonate 150%, knock 2`), Warlock DoT that jumps on death (`onDeath: { jump: 8 }`) | `applyStatus` / `tickStatuses`; death hook in `onEnemyKilled` |

**G. Followers, summons, threat**

| key | fields | semantics | reader | wording |
|---|---|---|---|---|
| `taunt` | `{ radius\|target, seconds, by: 'self'\|'decoy'\|'post'\|'pet' }` | Enemies attack the named body for `seconds`. Needs one change in actors.js: `taunt(enemy, who, s)` accepts the PLAYER (`who = 'player'`) and placed objects, not only pets; `aimOf` honours `e.tauntBy` until `e.tauntUntil`. | actors.js `aimOf` (716) / `taunt` (756) | "Taunts enemies within {radius} m for {seconds}s" |
| `command` | `{ order: 'focus'\|'pounce'\|'guard'\|'return', seconds }` | Orders to EVERY follower (pets, temporary summons and mercenaries; `petOnly: true` limits it to the class pet): focus the aimed/tagged target, pounce (leap to it, next hit +50%), guard (stay within 4 m of you and taunt what hits you), return. | js/pets.js `order(pet, order, target)` — new; the existing follow/engage/return states take it | "Orders your followers to attack the target for {seconds}s" |
| `summon` (extended) | `{ def, count, lifetime, temporary, decoy: {hpShare}, burstOnExpire: {radius, mult}, at: 'aim'\|'self'\|'corpses' }` | `temporary: true` = does NOT take a follower slot and is NOT counted by `followers.js spellCountFor` / `admit`; expires after `lifetime`. `decoy` = does not move or attack, has `hpShare` x your max health, taunts on spawn. | js/pets.js `summon`; followers.js skips `temporary` | "Summons a decoy with {hpShare}% of your maximum health for {lifetime}s" |
| `barrier` (extended) | `{ share, seconds, pets, of: 'self'\|'paid' }` | The existing cast barrier, now also on followers (`pets: true`). `of: 'paid'` = worth the health the skill cost. | main.js `castSkill` (existing) + pets.js barrier field | "Grants a barrier worth {share}% of your maximum health for {seconds}s" |
| `heal` / `revive` / `cleanse` | `{ share, pets, overflowBarrier }`, `{ share, pets }`, `{ self, pets, types, count }` | Heal (existing) can include followers and turn overheal into a barrier; revive brings fallen followers back at `share`; cleanse removes `count` harmful statuses of `types`. | main.js `castSkill` self branch; pets.js `revive` | "Revives every fallen follower at {share}% health" |
| `link` | `{ to: 'follower'\|'enemy', share, seconds, threshold, range }` | A follower linked to you: of every hit on it, `share` is taken by YOU instead (Sworn Guard, Thread of Fate); `threshold` = only the part of a hit above that share of the follower's health (Sworn Ward). An enemy linked: `share` of damage YOU take is dealt to it. Snaps beyond `range`. ONE pair per link, no webs. | js/pets.js damage path (`hurt`) and the player's damage-taken path | "Takes {share}% of the damage dealt to the linked follower" |

**H. HUD (engine scope, not data)**

Resource pips under the bar (Flair / Poise / Grudge, coloured, max shown); a badge for the current
form/stance/temper/song with the group's options; the next-roll icon on a slot with a pool or a
cycle; a charge count; a draining ring on a slot inside a recast window; a timer pip on placed
objects (`ringPoints` + a small number). All through the existing `hud.skills(skills.state())`
path — `state()` must carry `charges`, `recastLeft`, `next`, `form`, `resource`.

### 2.2 P2 — second engine pass (8 keys)

| key | fields | semantics | reader | used by |
|---|---|---|---|---|
| `turned` | `{ seconds, follow, weakenAfter }` | A non-boss enemy fights its OWN side: `aimOf` returns the nearest other enemy; its hits go through `rpg.strike(e, other)`; other enemies aim at it while it hits them; the player's area hits still hurt it. `follow: true` = it follows you like a temporary follower (Beguile). Champions half duration. Merges the brainstorm's charm AND confuse. | actors.js `aimOf` + the swing branch | Enchanter (beguile, enthrall), talents: Red Rag, Unhinged, Wrong Shape |
| `wall` | `{ length, seconds, hp, blocksMove, blocksRanged, ring }` | A placed segment (or ring) enemies' movement cannot cross (actors.js step tests the segment like the existing `slide`) and that negates enemy ranged hits whose line crosses it. Can be struck down if `hp`. | actors.js movement + ranged branch | Knight Rampart; talents: Firebreak, Caged, Glacier Line, Kill Box, Sanctuary Shelter |
| `stasis` | `{ seconds, bank }` | A non-boss enemy is frozen in place and cannot be hurt; damage dealt to it is banked and lands at once x`bank` when it ends. Bosses: slowed 60%. | actors.js update skip + `rpg.strike` bank | Chronomancer stasis_lock, stop_the_clock |
| `rewind` | `{ seconds }` | `skillmech.js` keeps a 6 s ring buffer of the player's x, z, health, mana at 10 Hz; casting restores the sample from `seconds` ago (health only upward unless a talent says otherwise). | main.js frame loop records; `castSkill` self branch restores | Chronomancer rewind |
| `mimic` | `{ mult }` on a temporary summon | The summon re-casts every skill you cast, from where it stands, at `mult` (castSkill with origin + mult, like `afterimage`). | main.js `castSkill` end hook | Shadow Dancer host_of_shades; talents: Afterimage (quicken), Echo Form, Dance Partner |
| `knock.carry` | `{ mult, stagger }` | A knocked body that passes through another enemy deals `mult` to it and staggers both. | actors.js push tick (~867) | Warrior shove, Monk palm, Fighter Skewer |
| `dashWith` | `{ followers: true }` | Every follower within 15 m moves to a ring around your landing point (a short teleport with a dust `footfall`). | js/pets.js | Tactician Lead the Charge, Rally; Druid Running Pack |
| `transform` (visual) | `{ creature: 'frog' }` on a disable status | A disabled enemy is drawn as a small creature (avatar-3d `frog`) or, failing that, shrunk to 40% with a tint. Gameplay = `disarm` + slow 50% + breaks on damage after 1 s. | actors.js status visual | Sorcerer transmute |

(`transform` is a visual on top of existing statuses; it is listed here only for scheduling.)

### 2.3 P3 — cut. Content must not use these.

| cut | why | what replaces it in the nodes that used it |
|---|---|---|
| wall slam (knocked into terrain) | needs a collision query per pushed body per frame against terrain/cliffs | `knock.carry` (P2) or a plain longer stagger |
| "does not alert its pack" | there is no pack-alert system to hook | delete the clause |
| fated circle (a bolt follows whoever left) | one-off homing on a timer | Prophecy now FOLLOWS the aimed enemy (`place.follow: 'target'`) |
| hold-to-charge that scales while held | needs key-up plumbing through settings.js | fixed wind-up (`delay`) or `channel` |
| reflected / returned enemy projectiles | enemy ranged hits are instant, there is no projectile to send back | `blocksRanged` (negate) |
| ground pickups (draughts, gold piles) | needs pickup objects + UI | instant reward (`onKill.heal/mana/gold`) |
| Grand Shuffle, Rewind Them, The Weave, Usurp, Sleepwalk, Holy Bounds "cannot willingly leave" | each a one-off with its own code path | §6 lists the replacement per node |
| enemy "confuse" (attacks anything at random) | merged into `turned` | `turned` |
| "followers act twice" | no follower turn system in real time | `haste` + `cutCooldown followers` |

### 2.4 Phrasing and fx rules for the engine

* `describeSkill` (js/skills.js:244) and `describeMod` (js/skilltalents.js:80) both call
  `VOCAB[key].describe(value, ctx)` for every vocabulary key on the row/node, in the order the keys
  appear in the table above, joined as sentences. No hand-written `desc` on new rows: the
  generated text IS the description (R11 rule, tests/wording.test.js).
* Every tag/status mentioned in generated text uses its data `name` ("Quarry", "Frostbite").
* A node's `fx` is one of: the existing library fx ids (`fan lance heavy seek wide quick burst chain
  ground deepen shatter drain cauterise echo bulwark hunger overload brand`) or one of the new ids
  the engine adds to the talent fx switch: `knock pull leap swap trap post zone wall link ward
  counter afterimage stack detonate tag summon form charge`. Each maps to one spellfx call in a
  single table in main.js (`TALENT_FX`) — never a new effect per node.

---

## 3. Final 30 x 6 table

Columns: **slot** (unlock 1/3/6/12/18/24) · **id** (`(L)` = legacy id, kept so saves stay valid) ·
**name** · **shape / element** · **base numbers** (`m` mult, `cd` cooldown s, `mp` mana, `r` radius,
`rng` range, `rch` reach — BEFORE `effectiveMult`) · **hook** (the one rule that makes it play unlike its
siblings) · **keys** (§2). Talent tiers come from the brainstorm section of the same id with §6
applied. Where a number here differs from the brainstorm, THIS number wins (R6).

Every class lists its **signature** (the class verb) and its **tags** (owned by that class only).

### 3.1 Warrior — Frontline Tank · STR · signature: stronger in a crowd · tags: —

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `cleave` (L) | Cleave | around / physical | m 1.15, cd 7, mp 6, r 4.5 | +12% per enemy hit past the first, cap +48% | bonusIf crowd |
| 2 | `breaching_shove` | Breaching Shove | melee / physical | m 1.1, cd 7, mp 6, rch 3, arc 1.4 | Knock 4 m + stagger 0.6 s. (P2 adds `knock.carry` 60% — talent T1a) | knock |
| 3 | `warcry` (L) | War Cry | self / physical | Might 12 s, cd 22, mp 10 | Taunts within 10 m for 3 s; +5% Might per enemy taunted, cap +25%. Keeps `status: might` (pinned by tests/skills.test.js) | taunt, bonusIf crowd |
| 4 | `whirlwind` (L) | Iron Gyre | around / physical | m 0.8 x5, cd 12, mp 14, r 5.5, bleed | Walk at 70% while spinning; each spin pulls 0.5 m inward | repeats, pullIn |
| 5 | `iron_resolve` | Iron Resolve | self / physical | cd 30, mp 10, 10 s | 6% less damage per enemy within 6 m (cap 36%); every 4th hit taken releases a 4 m shockwave for 80% | self resistPerFoe, onHurt pulse |
| 6 | `groundbreaker` | Groundbreaker | beam / physical | m 2.6, cd 20, mp 22, rng 18, width 2.4 | Stagger 1.2 s; +50% to staggered targets; leaves an 18 m fissure that slows 60% for 5 s | knock, consumes stagger, line+pool |

### 3.2 Fighter — Disciplined Duelist · STR · signature: stances and counters · tags: `riposted`, `duel`

Stance group `stance` (no body): **Open** (+20% damage, +15% attack speed, −15% armour) /
**Closed** (+50% armour, −10% damage). Lunge and Master's Flurry carry `forms: { open, closed }`
overrides (§4.6 — the same mechanism as the druid).

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `power_strike` (L) | Precise Strike | melee / physical | m 1.9, cd 4, mp 0, rch 3.4, arc 1.6 (unchanged: tests/round26 pins them) | Ignores 40% armour; a crit marks the target (`marked` 4 s). Library T1 = `wide` (pinned) | pen, onCrit status |
| 2 | `riposte` | Riposte | self / physical | cd 8, mp 4, window 1.2 s | Next melee hit is negated and answered for 250% + stagger 0.8 s; unused → half the cooldown back | counter |
| 3 | `duelist_stance` | Duelist's Stance | self toggle | cd 1.5, mp 0 | Open ↔ Closed (above) | form group stance |
| 4 | `lunge` | Lunge | dash / physical | m 1.8, cd 9, mp 8, rng 8 | Stops at the FIRST body for +50%. Open: +3 m range. Closed: stagger 0.6 s | dash to target, forms |
| 5 | `sweeping_guard` | Sweeping Guard | melee / physical | m 1.2, cd 12, mp 10, rch 3.6, arc 3.1 | A 1.5 s guard (60% less damage from the front) then the sweep; +10% per hit taken during the guard, cap +50% | counter (negate 0.6, frontal), delay |
| 6 | `masters_flurry` | Master's Flurry | melee / physical | m 0.4 x6 + finisher 1.6, cd 22, mp 20, rch 3.4, arc 1.2 | Each strike picks the lowest-health enemy in the arc; the finisher knocks 4 m. Open: +2 strikes. Closed: each strike grants 1 s of 30% less damage | repeats (target lowest), knock, forms |

### 3.3 Paladin — Holy Warrior · STR · signature: heal by hitting, protect with your own health · tags: `seared`

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `sanctified_blade` | Sanctified Blade | melee / holy | m 1.6, cd 5, mp 4, rch 3.2, arc 1.4 | +50% vs undead and fiend; each hit heals you 1.5% max health | bonusIf family, onHit heal |
| 2 | `consecrate` (L) | Blessed Earth | around → place zone / holy | m 0.9 then 6 pulses x 0.25, cd 16, mp 20, r 6.5 | A 6 s zone where you cast it: pulses every 1 s; you and followers inside heal 2% a pulse | place zone, heal pets |
| 3 | `oath_hammer` | Oath Hammer | bolt / holy | m 1.2, cd 8, mp 10, rng 26, splash 1.8 | Returns to you, hitting again at 80%; each enemy hit on the return heals you 2% | returns, onHit heal |
| 4 | `martyrs_vow` | Martyr's Vow | self / holy | cd 20, mp 0, hpCost 15% | You and every follower get a barrier worth 25% of YOUR max health for 8 s | hpCost, barrier pets |
| 5 | `shining_rebuke` | Shining Repulse | around / holy | m 1.5, cd 14, mp 16, r 5 | Knock 5 m + stagger 1 s; undead/fiend knocked twice as far and weakened 4 s | knock, bonusIf family |
| 6 | `daybreak_descent` | Daybreak Descent | dash (leap) / holy | m 2.2, cd 24, mp 28, leap 16 m, land r 6 | Leaps to the follower nearest your aim (or the aim point): allies within 6 m heal 15%, enemies are knocked 3 m, and a Blessed Earth zone (4 s) is left where you land | dash ally + leap + land, heal pets, place |

### 3.4 Ranger — Precision Ranged · DEX · pet: hunting cat · signature: the hunt · tags: `quarry`

`quarry`: takes 20% more from you and your followers, 12 s.

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `aimed_shot` (L) | Long Draw | bolt / physical | m 1.9, cd 5, mp 4, rng 42 | Ignores 50% armour; +4% per metre past 20 m, cap +60% | pen, bonusIf distance |
| 2 | `hunters_snare` | Hunter's Snare | ground → trap / nature | m 1.2, cd 10, mp 8, rng 20, r 2.5 | A trap (arms 1 s, lasts 30 s, max 2): roots 3 s and tags Quarry | place trap, status root, tag |
| 3 | `multi_shot` (L) | Broadhead Fan | bolt / physical | 5 x m 0.8, cd 8, mp 10, spread 0.2 | An arrow that hits a Quarry target splits into 2 | projectiles, split when tag |
| 4 | `quarry_call` | Call the Quarry | bolt / physical | m 0.6, cd 14, mp 10, rng 40 | Tags Quarry and orders the pet to pounce on it; the pet's next bite staggers 1 s | tag, command pounce |
| 5 | `trackers_leap` | Tracker's Leap | dash back (leap) / physical | m 1.0 at the start point, cd 12, mp 8, 9 m | Leap backward; your next shot within 3 s +50% | dash back + leap, empowerNext |
| 6 | `rain_of_arrows` (L) | Arrow Storm | ground / physical | 8 x m 0.25, cd 14, mp 16, r 6.5 | 8 volleys over 4 s at random points; a Quarry target inside is hit by every volley | repeats scatter, consumes tag (no remove) |

### 3.5 Rogue — Burst Assassin · DEX · signature: set up, then cash in · tags: `grave`

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `eviscerate` (L) | Gutting Strike | melee / physical | m 1.8, cd 7, mp 8, bleed | +100% vs a staggered target (not removed); from behind the bleed lasts twice as long | consumes stagger, bonusIf behind |
| 2 | `poison_dart` (L) | Poison Dart | bolt / poison | m 1.1, cd 5, mp 6, statusMult 1.2 | Poison stacks to 3 | stack |
| 3 | `sucker_punch` | Sucker Punch | melee / physical | m 0.8, cd 10, mp 6, rch 2.6, arc 1.0 | Stagger 1.6 s (2.4 s from behind) | knock stagger, bonusIf behind |
| 4 | `grave_mark` | Grave Mark | bolt / shadow | m 0.4, cd 20, mp 12, rng 30 | Tag `grave` 10 s: +25% damage from you; when it ends the target takes 30% of the damage it took during the mark | tag + store |
| 5 | `slip_away` | Slip Away | self / shadow | cd 22, mp 10 | Drops your threat onto a decoy (36% of your health, 4 s, taunts); your next hit within 6 s counts as from behind | summon decoy, taunt by decoy, empowerNext behind |
| 6 | `knife_storm` | Knife Storm | around / physical | 8 x m 0.45, cd 22, mp 22, r 7 | Each pulse throws one knife at a DIFFERENT enemy within 7 m, staggered or Grave-marked first | place pulse follow self, strike nearest distinct |

### 3.6 Cleric — Primary Healer · INT · signature: heals that overflow into protection; raising the fallen · tags: `lit`

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `mend` (L) | Mend | self / holy | heal 35%, cd 14, mp 18 | Also heals every follower 20% of THEIR health; overhealing on you becomes a barrier up to 10% | heal pets overflowBarrier |
| 2 | `sunlance` | Sunlance | beam / holy | m 1.5, cd 6, mp 10, rng 24, width 1.4 | Every enemy struck heals you and followers 2% and is tagged Lit (3 s) | onHit healAllies, tag |
| 3 | `sanctuary` | Sanctuary | ground → place zone / holy | cd 24, mp 26, rng 20, r 5, 6 s | Enemies inside are knocked out 2 m every second; you and followers inside heal 3% a second | place zone knockOut, heal |
| 4 | `guardian_light` | Guardian Light | summon (temporary) / holy | cd 30, mp 24, 20 s | A wisp (no slot) that heals the most-hurt of you/followers 6% every 2 s, else strikes the nearest enemy for 40% | summon temporary |
| 5 | `raise_the_fallen` | Raise the Fallen | self / holy | cd 40, mp 30 | Revives every fallen follower at 50%; followers still standing heal 30% and are Rallied 8 s | revive, heal pets, status rally |
| 6 | `judgement` (L) | Falling Light | ground / holy | m 2.4, cd 14, mp 22, r 3.5, delay 0.7 | On a Lit target a second column falls on the nearest other enemy; followers inside heal 10% | consumes tag → extra cast, heal pets |

### 3.7 Bard — Support Maestro · INT · signature: songs · tags: —

Song group `song` (aura 10 m, follows you, one at a time, switch cd 2). Switching AWAY from a song
plays its **Finale** once. Discord Note and Quickstep Jig carry `forms` overrides keyed by song id.

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `discord_note` | Discord Note | bolt / arcane | m 1.3, cd 3, mp 5, rng 30, splash 1.6 | Ricochets once. Valour: you gain `haste` 2 s. Ruin: target `marked` 3 s. Mending: the nearest ally heals 3% | ricochet, forms (song) |
| 2 | `ballad_of_valour` | Ballad of Valour | self song / holy | switch cd 2, mp 8 | You + followers: +25% attack speed, +10% move. Finale: followers +40% damage 4 s | form group song, place zone follow |
| 3 | `song_of_ruin` | Song of Ruin | self song / shadow | switch cd 2, mp 8 | Enemies inside take 12% more and deal 10% less. Finale: 150% shadow in 10 m + `weaken` 5 s | form group song, zone debuff |
| 4 | `air_of_mending` | Air of Mending (NEW — replaces Lullaby) | self song / holy | switch cd 2, mp 8 | Allies inside heal 1.5% max health a second. Finale: 15% heal to allies in 10 m and cleanse 1 harmful status each | form group song, zone heal, cleanse |
| 5 | `quickstep_jig` | Quickstep Jig | dash / physical | m 1.0, cd 10, mp 8, rng 10, splash 2 | Leaves a 3 s copy of the current song's zone where you started; with no song, enemies passed are weakened 3 s | dash, place zone, forms (song) |
| 6 | `grand_finale` | Grand Finale | around / arcane | m 3.2, cd 30, mp 30, r 12 | Plays the Finale of every song you own, then 320% arcane in 12 m; +25% per follower alive, cap +50% | bonusIf crowd(pets) |

Air of Mending talents (new — the brainstorm has none):
T1 a) **Close Harmony** — radius 5 m, heal 3% a second (dial, traded) / b) **Carrying Tune** — the
heal also lands on followers up to 20 m away at half · lib — ·
T2 a) **Soothing Finale** — the Finale also grants a 10% barrier / b) **Clear Voice** — the aura
cleanses 1 harmful status from each ally every 4 s · lib — ·
T3 a) **Restful Verse** — allies inside who were not hit for 3 s heal double / b) **Second Voice** —
while Air of Mending plays, Discord Note's ricochet heals the ally it passes nearest 3% · lib — ·
T4 a) **Last Refrain** — an ally inside who would die is left at 1 health instead, once per ally
per 60 s / b) **Swelling Air** — +0.2% a second per 2 s the song has played, cap +1.5% · lib —.

### 3.8 Mage — AoE Glass Cannon · INT · signature: frost then shatter · tags: — · counter: `frostbite`

`frostbite` (counter, max 5): at 5 the target is **Frozen** (stagger 2 s, its own DR) and the stacks clear.

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `frost_shard` | Frost Shard | bolt / ice | m 1.1, cd 2.5, mp 5, rng 34, splash 1.4 | +1 Frostbite | stack counter |
| 2 | `frost_nova` (L) | Rime Burst | around / ice | m 1.2, cd 9, mp 14, r 6 | +3 Frostbite and knock 2 m | stack, knock |
| 3 | `ice_lance` (L) | Rime Spear | beam / ice | m 1.5, cd 7, mp 12, rng 26 | Consumes Frostbite: +20% per stack (cap +100%); +50% on a Frozen target | consumes perStack |
| 4 | `spellrush` | Spellrush | self / arcane | cd 30, mp 20 | Your next 3 skills deal +60% and cost no mana; then mana regeneration stops for 4 s | empowerNext |
| 5 | `blizzard` (L) | Whiteout | ground / ice | 6 x m 0.35, cd 14, mp 24, r 5.5 (element ice, pinned) | Every pulse adds 1 Frostbite — staying inside the whole time Freezes | repeats, stack |
| 6 | `stillfrost` | Stillfrost | ground / ice | m 3.0, cd 30, mp 34, rng 30, r 7, delay 1.5 | On cast every enemy inside goes to max Frostbite (Frozen); 1.5 s later it shatters for 300% + 20% per Frostbite stack it consumed | stack, delay, consumes perStack |

### 3.9 Necromancer — Army Builder · INT · pet: 2 bone thralls + bone archer · signature: corpses · tags: —

Corpses: EVERY enemy death leaves a corpse marker for 20 s (`skillmech.corpses`, drawn as a bone
pile decal). Only necromancer skills spend them.

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `marrow_lance` | Marrow Lance | bolt / shadow | m 1.2, cd 3, mp 6, rng 34, pierce 2 | A kill with it leaves a corpse worth 2 | pierce, onKill corpse worth 2 |
| 2 | `raise_thrall` (L) | Raise Thrall | summon / shadow | cd 26, mp 20 | Consumes a corpse within 12 m: the thrall rises THERE at once with +50% health | summon at corpses |
| 3 | `corpse_pyre` | Corpse Pyre | ground / shadow | m 1.0 per corpse (cap 5), cd 10, mp 14, rng 26, r 10 | Every corpse within 10 m of the aim explodes for 100% in 4 m; with none, a thrall gives 10% of its health to explode | consumeCorpses, burst |
| 4 | `drain` (L) | Grave Draught | beam / shadow | 6 x m 0.3, cd 9, mp 12, heal 12% | Channel 3 s; heals your thralls as much as you | channel, heal pets |
| 5 | `toxic_cloud` (L) | Plague Cloud | ground / poison | 8 x m 0.25, cd 14, mp 20, r 5 | Poison AND bleed; enemies dying inside leave corpses that also emit a 2 m cloud for 3 s | repeats, statuses x2, onKill pool |
| 6 | `buried_march` | March of the Buried | summon (temporary) / shadow | cd 60, mp 40, 18 s | One temporary thrall per corpse within 20 m (max 8) plus 2 from the ground; no follower slots | summon temporary at corpses |

### 3.10 Warlock — Chaos Dealer · INT · pet: bound imp + familiar · signature: health as fuel, corruption that spreads · status: `gnawed`

`gnawed`: shadow DoT 8 s; when its host dies it jumps to the nearest enemy within 8 m with its remaining time.

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `gnawing_dark` | Gnawing Dark | bolt / shadow | m 0.9, cd 3, mp 6, statusMult 1.0 | Applies Gnawed | status gnawed |
| 2 | `bind_imp` (L) | Bind a Fiend | summon / shadow | cd 32, mp 22, hpCost 10% | The imp's bolts apply Gnawed | hpCost, pet status |
| 3 | `curse` (L) | Hex of Ruin | bolt / shadow | m 0.8, cd 12, mp 14, splash 5, curse | Cursed enemies also take +25% from damage-over-time | status field dotTakeMore |
| 4 | `soul_pact` | Soul Pact | self / shadow | cd 30, hpCost 20%, 10 s | Statuses you apply tick twice as fast; kills give back 5% health | self dotRate, onKill heal |
| 5 | `void_rift` (L) | Void Rift | ground / shadow | 4 x m 0.45, pull 2.5, cd 16, mp 24 | Every damage-over-time on a pulled body is copied to every other pulled body | repeats, pullIn, spreadStatus |
| 6 | `abyss_gate` | Abyss Gate | ground → place pulse / shadow | 13 x m 0.3 (every 0.75 s), cd 40, mp 34, hpCost 10%, 10 s | A gate that hurls a bolt at a random enemy within 20 m each pulse, applying Gnawed or Burning | place pulse random, statusPool, hpCost |

### 3.11 Demon Hunter — Specialist Killer · DEX · pet: dire companion · signature: Grudge · tags: `brand`

`grudge` (resource, max 5). `brand` tag 8 s: a branded enemy that hits you or your hound gives 1 Grudge.

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `hex_bolt` | Brand Bolt | bolt / shadow | m 1.5, cd 3.5, mp 4, rng 40 | +50% vs fiend and aberration; tags Brand | bonusIf family, tag |
| 2 | `tumbling_shot` | Tumbling Shot | dash back / physical | 3 x m 0.5, cd 8, mp 6, 7 m | Roll back 7 m and loose 3 bolts at your aim mid-roll; +1 Grudge if an enemy was within 3 m | dash back, projectiles, resource gain |
| 3 | `chain_hook` | Chain Hook | beam / physical | m 1.0, cd 10, mp 8, rng 18, width 1.2 | Pulls the first body to your feet and staggers it 0.8 s; a fiend gives 1 Grudge | pullIn self, knock |
| 4 | `unleash_hound` | Unleash the Hound | self / physical | cd 18, mp 10 | The hound pounces your aim (knock 2 m), is Hastened 8 s, each bite gives 1 Grudge; a fallen hound returns at 50% | command pounce, revive, resource gain (pet) |
| 5 | `grudge_bolt` | Settle the Grudge | bolt / shadow | m 0.6 + 0.35 per Grudge, cd 6, mp 8, rng 40 | Spends all Grudge; at 5 it pierces everything and staggers 1 s | resource spend perPoint |
| 6 | `night_hunt` | Night Hunt | self / shadow | cd 45, mp 30, 12 s | +1 Grudge every 2 s; Settle the Grudge has no cooldown; fiends you strike are feared 2 s | resource gain over time, cutCooldown, onHit status fear (family) |

### 3.12 Scavenger — Resource Specialist · DEX · signature: luck · tags: —

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `lucky_strike` | Lucky Strike | melee / physical | m 1.5, cd 4, mp 3 | Applies one random status: burn, poison, bleed, chill, shock, weaken, web | statusPool |
| 2 | `junk_toss` | Junk Toss | bolt / physical | m 1.4, cd 6, mp 6, rng 26 | A random object each cast (HUD shows the next): rock (stagger 0.6 s), bottle (3 s fire pool), pot (3 s poison pool), nail bag (split 3), pan (knock 3 m) | elementPool of riders |
| 3 | `scrounge` | Scrounge | self / physical | cd 20, mp 6, 15 s | Each kill has a 35% chance to pay out at once: 10% health, 15 mana or 20 gold (P3: no pickups) | self status onKill roll |
| 4 | `caltrop_scatter` | Caltrop Scatter | ground → traps / physical | cd 12, mp 8, rng 16, r 4 | 6 traps over 4 m (arm 0.5 s, 20 s): each fires once for 80% + bleed + slow 50% 3 s | place trap x6 |
| 5 | `pitch_bomb` | Rag-and-Pitch Bomb | ground / fire | m 1.6, cd 14, mp 12, rng 22, r 4, delay 1 | Explodes as a random element (fire, poison, lightning, ice) and leaves a 4 s pool of it | delay, elementPool, pool |
| 6 | `big_score` | Big Score | melee / physical | variance 0.2-5.0 (mean 2.6), cd 22, mp 16 | A roll above 4 is a guaranteed crit and pays 50-150 gold | variance, onHit gold |

### 3.13 Swashbuckler — Flashy Duelist · DEX · signature: Flair (rewards variety) · tags: `turned_about`

`flair` (resource, max 5): skills gain 1, and 1 more when the previous skill cast was a different one.

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `flourish` | Flourish | melee / physical | m 1.2, cd 3, mp 3, rch 3, arc 1.6 | +1 Flair (+2 if the previous skill differs) | resource gainIfNew |
| 2 | `daring_leap` | Daring Leap | dash (leap) / physical | m 1.2, cd 9, mp 6, 10 m, land r 2.5 | Lands behind the aimed enemy; your hits count as from behind for 2 s; +1 Flair | dash behind + leap, empowerNext behind |
| 3 | `mocking_parry` | Mocking Parry | self / physical | cd 10, mp 4, window 1.5 s | The next melee hit is evaded completely; the attacker is taunted 3 s; +2 Flair. Never hits back (that is the Fighter's) | counter (negate 1, tauntAttacker, gain) |
| 4 | `pinning_thrust` | Pinning Thrust | beam / physical | m 1.6, cd 8, mp 6, rng 6, width 1 | Roots the first body 2 s; if you hold Flair it spends 1 for +50% and a 3 s root | status root, resource spend 1 optional |
| 5 | `matadors_turn` | Matador's Turn | around / physical | m 1.3, cd 12, mp 10, r 4 | Enemies within 4 m are tagged Turned About (hits on them count as from behind, 3 s) and weakened 3 s; +1 Flair per enemy, cap 3 | tag, status weaken, resource |
| 6 | `grandeur` | Grandeur | melee / physical | m 0.8 + 0.6 per Flair, cd 20, mp 12, rch 4, arc 2 | Spends all Flair; at 5 it is a guaranteed crit and a 360° 6 m cut | resource spend all, perPoint |

### 3.14 Dragon Knight — Draconic Warrior · STR · signature: Wyrm Temper · tags: —

Temper group `temper` (no body): **Fire Temper** (+15% damage, burn) / **Frost Temper** (+25%
armour, chill) / **Storm Temper** (+15% attack speed, shock). Every DK skill marked `elementFrom:
temper` takes the element and status of the current temper; data keeps `element: fire` as the
fallback (tests/round25 pins `flamethrower` = fire).

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `scale_rend` | Scale Rend | melee / temper | m 1.6, cd 5, mp 5, rch 3.4, arc 1.8 | Element and status follow the temper | elementFrom |
| 2 | `flamethrower` (L) | Wyrm's Breath | melee breath / temper | 10 x m 0.3 over 2.2 s, rch 7, arc 0.9, cd 10, mp 18 | Fire burns; Frost chills (3 ticks on one body = stagger 1 s); Storm arcs to one body beside each target | elementFrom, repeats |
| 3 | `wyrmfall` | Wyrmfall | dash (leap) / temper | m 2.0, cd 14, mp 14, 14 m, land r 5 | Lands in a burst of the temper and throws everything 3 m outward | leap + land, knock |
| 4 | `wyrm_temper` | Wyrm Temper | self toggle | cd 2, mp 0 | Cycles Fire → Frost → Storm; switching releases a 4 m pulse of the OLD temper for 60% | form group temper, onExit pulse |
| 5 | `dragonscale` | Dragonscale | self / temper | cd 22, mp 12, 8 s | Barrier 25% max health; while it holds, melee attackers take 40% of the hit back as temper damage | barrier, self reflect |
| 6 | `wyrm_ascendant` | Wyrm Ascendant | self / temper | cd 40, mp 30, 10 s | For 10 s melee arcs become 360° and +2 m, bolts splash 3 m, every hit applies the temper's status | imbue (area) |

### 3.15 Pyromancer — Fire Specialist · INT · pet: fire familiar · signature: burn stacks · tags: —

Pyromancer skills apply Burning with `stack: 5` (each stack its own burn). Other classes' burns still refresh.

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `firebolt` (L) | Firebolt | bolt / fire | m 1.6, cd 4, mp 8, rng 36, splash 2.6, burn | Burning stacks to 5 | stack |
| 2 | `fire_wall` (L) | Burning Line | ground / fire | m 1.8 over 5 s, cd 13, mp 18, rng 30 | A 10 m line of fire laid ACROSS your aim for 5 s; each crossing adds 2 Burning stacks | line across + pool, stack |
| 3 | `ember_stride` (L) | Cinder Stride | self / fire | trail m 0.25, cd 20, mp 16, 8 s (element fire, pinned) | +20% move; a fire trail behind you adds a Burning stack to anything standing in it | trail, stack |
| 4 | `stoke_familiar` | Stoke the Familiar | self / fire | cd 20, mp 14, 10 s | The familiar grows for 10 s: its bolts become 3 m blasts that add Burning stacks; a fallen familiar returns at once | pet status, revive |
| 5 | `flashover` | Flashover | ground / fire | m 0.6 per stack, cd 12, mp 16, rng 30, r 6 | Every burning enemy within 6 m of the aim takes 60% of its remaining Burning damage per stack at once and keeps 1 stack | detonate |
| 6 | `meteor` (L) | Fallstone | ground / fire | m 3.4, cd 22, mp 30, rng 36, r 8, burn | One big stone on the aim AND a 40% stone on each other group of 2+ enemies within 30 m | extra casts on clusters |

### 3.16 Stormcaller — Chain Lightning Mage · INT · pet: storm familiar · signature: conductors · tags: — ("Chain Lightning" is never a name)

A **shocked** body is a conductor: jumps prefer it and reach 12 m between conductors instead of 8.

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `chain_bolt` (L) | Forked Bolt | bolt / lightning | m 1.1, cd 4, mp 8, rng 40, chains 4, falloff 0.8 | One bolt that jumps 4 times, preferring shocked bodies | chains (prefer shocked) |
| 2 | `thunderclap` (L) | Thunder Ring | around → place ring / lightning | m 1.0 per crossing, cd 12, mp 18, r 7, 6 s | A ring 7 m round you; an enemy crossing it either way is staggered 0.6 s and shocked | place zone edge |
| 3 | `storm_beam` (L) | Storm Beam | beam channel / lightning | 4 ticks, m 2.2 total, +25% per tick held, cd 11, mp 20, rng 30, width 2.4 | Each tick arcs to one shocked body beside the beam | channel, chains 1 |
| 4 | `storm_orbs` (L) | Storm Orbs | self / lightning | orbs 3 x m 0.15 per strike, cd 24, mp 22, 12 s (pinned R25) | Casting Forked Bolt while orbs circle launches one orb along it for 150% (spending it) | orbs, requires chain_bolt (bonus only) |
| 5 | `bolt_step` | Bolt Step | dash / lightning | m 1.3, cd 10, mp 10, rng 12 | Untargetable during the dash; everything passed is shocked | dash, self untargetable |
| 6 | `tempest_eye` | Eye of the Tempest | ground / lightning | 12 x m 0.4 (every 0.5 s), cd 30, mp 34, rng 30, r 9 | A strike on a random enemy inside each pulse, conductors twice; each kill inside widens it 1 m | repeats scatter, grow onKill |

### 3.17 Druid — Shapeshifting Healer · INT · pet: 2 grove wolves · signature: shapes · tags: — (spec in §4)

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `thornlash` | Thornlash | bolt / nature | m 1.4, cd 3, mp 5, rng 30 | Roots 0.8 s (once per target per 6 s); heals the nearest wolf 3%. Has 3 shape overrides (§4) | status root, onHit heal pet, forms |
| 2 | `renew` (L) | Greensap | self / nature | regen, cd 16, mp 14 | The regen also lands on both wolves and stacks to 3 on each body. 3 overrides | stack heal, forms |
| 3 | `briarback_shape` | Briarback Shape | self toggle / nature | cd 1.5, mp 8 to shift in | The thorn boar — tank shape (§4) | form group shape |
| 4 | `call_wolf` (L) | Call the Pack | summon / nature | cd 26, mp 18 | With both wolves up it is a howl: wolves Hastened 6 s and +30% damage. 3 overrides | summon, forms |
| 5 | `fenrunner_shape` | Fenrunner Shape | self toggle / nature | cd 1.5, mp 8 to shift in | The marsh lizard — fast poison melee (§4) | form group shape |
| 6 | `sporecap_shape` | Sporecap Shape (replaces Rootbound) | self timed / nature | cd 50, mp 30, 15 s | The walking fungus — healer/rot capstone (§4) | form group shape, timed |

### 3.18 Oracle — Predictive Protector · INT · pet: fire familiar · signature: foresight · tags: `omen`

`omen` 6 s: the target's next attack deals 30% less.

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `omen_bolt` | Omen Bolt | bolt / arcane | m 1.2, cd 3, mp 5, rng 32 | Tags Omen | tag |
| 2 | `foresight` | Foresight | self / arcane | cd 16, mp 14, 15 s | You and followers get a ward that negates the first single hit worth more than 10% of max health — completely. Small hits pass | ward threshold, pets |
| 3 | `prophecy` | Prophecy | ground / arcane | m 1.6, cd 14, mp 16, rng 30, r 6, delay 2.5 | The circle locks onto the aimed enemy and FOLLOWS it for 2.5 s, then lands; Omened targets inside take double | place follow target, delay, consumes tag |
| 4 | `fate_thread` | Thread of Fate | beam / arcane | cd 18, mp 12, rng 24, 8 s | Link a follower (you take 50% of the damage it takes; you both heal 1% a second) or an enemy (it takes 30% of the damage you take) | link |
| 5 | `turn_aside` | Turn Aside | around / arcane | m 1.0, cd 12, mp 12, r 6 | Enemies within 6 m are pushed 3 m and lose the attack they were winding up | knock interrupt |
| 6 | `last_prophecy` | The Last Prophecy | self / arcane | cd 60, mp 36, 8 s | For 8 s every enemy within 20 m is Omened continuously and your followers crit Omened targets; it ends with the familiar striking 12 m for 300% | place zone follow self (tag), pets crit, delay burst |

### 3.19 Tactician — Turn-Order Manipulator · INT · signature: orders · tags: `flanked`

`flanked` 4 s: followers deal 20% more to it.

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `exploit_gap` | Exploit the Gap | melee / physical | m 1.5, cd 4, mp 4, rch 3, arc 1.4 | +40% against an enemy that is aiming at a follower; tags Flanked | bonusIf (aim≠you), tag |
| 2 | `rally` (L) | Rally | self / holy | rally, cd 30, mp 18 | Followers within 15 m are pulled into formation round you before the rally lands (P2 `dashWith`; before P2: the rally alone) | status rally pets, dashWith |
| 3 | `charge` (L) | Lead the Charge | dash / physical | m 1.7, cd 10, mp 10, rng 12, splash 2.4, weaken | Followers' next attack +50%; with P2 they dash with you | dash, empowerNext pets, dashWith |
| 4 | `reposition` | Reposition | dash swap / arcane | cd 10, mp 6, rng 20 | Swap places with the aimed follower (it gains a 20% barrier) or non-boss enemy (weakened 2 s) | dash swap |
| 5 | `seize_initiative` | Seize the Initiative | self / physical | cd 30, mp 20 | Every follower ability cooldown resets; your other cooldowns are halved | cutCooldown followers + others |
| 6 | `battle_plan` | Battle Plan | ground → place zone / physical | cd 40, mp 30, rng 30, r 10, 10 s | Enemies inside take 25% more and are slowed 30%; followers inside are Hastened; every 2 s you and every follower strike the most-hurt enemy inside for 80% | place zone + pulse, command focus |

### 3.20 Chronomancer — Time Mage · INT · signature: time · tags: —

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `second_hand` | Second Hand | bolt / arcane | m 1.1, cd 2.5, mp 4, rng 32 | Slows 10% (stacks 4); takes 0.25 s off your OTHER cooldowns per hit | stack slow, cutCooldown others per hit |
| 2 | `quicken` (L) | Quicken | self / lightning | haste, cd 26, mp 16 | Hastens you and every follower within 10 m and takes 2 s off every running cooldown (yours and theirs) | status haste pets, cutCooldown |
| 3 | `entropy_field` | Entropy Field | ground / arcane | 8 x m 0.3, cd 14, mp 18, rng 30, r 5.5 | Enemies inside are slowed 40% and every status on them ticks twice as fast | place zone dotRate, repeats |
| 4 | `rewind` | Rewind | self / arcane | cd 30, mp 16 | Your health (upward only) and position return to where they were 4 s ago; cooldowns spent in those 4 s come back half | rewind (P2) |
| 5 | `stasis_lock` | Stasis Lock | bolt / arcane | cd 16, mp 14, rng 28, 4 s | A non-boss target is suspended; damage dealt to it is banked and lands x1.5 when it thaws. Bosses: slowed 60% 3 s | stasis (P2) |
| 6 | `stop_the_clock` | Stop the Clock | around / arcane | cd 60, mp 40, r 25, 4 s | Every non-boss enemy within 25 m is suspended 4 s (banked x1.25); bosses slowed 80%; your cooldowns run 4x faster during it | stasis area (P2), self cdRate |

### 3.21 Monk — Martial Artist · DEX · signature: Poise · tags: `downed`

`poise` (resource, max 5). `downed` 3 s: takes 30% more from your basic attacks.

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `open_palm` | Open Palm | melee / physical | m 1.2, cd 3, mp 2, rch 2.8, arc 1.4 | Knock 2 m; +1 Poise | knock, resource gain |
| 2 | `wind_step` | Wind Step | dash / physical | m 1.3, cd 7, mp 5, rng 10 | Dash to the target; your next attack within 2 s is a guaranteed crit; +1 Poise | dash target, empowerNext crit |
| 3 | `sweeping_heel` | Sweeping Heel | around / physical | m 1.1, cd 10, mp 6, r 3.5 | Staggers everything 1.2 s and tags Downed | knock stagger, tag |
| 4 | `inner_stillness` | Inner Stillness | self channel / physical | cd 22, mp 0, 3 s | Heal 6% a second, +1 Poise a second; melee hits taken during it are halved and each adds +1 Poise (it ABSORBS, it does not answer) | channel, counter (negate 0.5, gain) |
| 5 | `mountain_fist` | Mountain Fist | beam / physical | m 3.0, cd 12, mp 10, rng 10, width 1.6, wind-up 0.8 s (cannot move) | Staggers 1.5 s; +2 Poise. (No hold-to-scale — P3) | delay, knock, resource |
| 6 | `ninefold_staff` | Ninefold Staff | melee / physical | m 0.6 x (3 + Poise), cd 22, mp 16 | Spends all Poise; the strikes cycle shape — sweep (360° 3.5 m), thrust (6 m line), slam (2.5 m ring) | resource spend, repeats with shape cycle |

### 3.22 Shaman — Spirit Caster · INT · pet: spirit bear · signature: posts · tags: —

Posts are `place pulse` objects with health (enemies may strike them).

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `spirit_bolt` | Spirit Bolt | bolt / lightning | m 1.2, cd 3, mp 5, rng 32, chains 2 | Each jump also heals the nearest ally 3% | chains, onHit healAllies |
| 2 | `mending_post` | Mending Post | ground → post / nature | cd 18, mp 16, rng 12, 12 s | A post with 30% of your health that heals every ally within 8 m 2% a second | place pulse heal hp |
| 3 | `storm_post` | Storm Post | ground → post / lightning | 10 x m 0.25, cd 16, mp 18, rng 16, 10 s | A post that strikes the nearest enemy within 10 m every second, jumping once | place pulse strike, chains 1 |
| 4 | `call_spirit` (L) | Call a Spirit | summon / holy | cd 40, mp 26 | With the bear already up: it charges your aim and taunts 4 s | summon, command pounce, taunt by pet |
| 5 | `warding_spirits` | Warding Spirits | self / holy | cd 24, mp 18 | You, the bear and every follower get 3 ward charges: each negates one hit of up to 8% max health | ward charges cap, pets |
| 6 | `great_post` | The Great Post | ground → post / holy | cd 50, mp 36, rng 16, 15 s | Your other posts within 20 m pulse twice as often; it throws a Spirit Bolt (m 0.4) at 3 enemies every 1.5 s and heals 3% every 2 s within 12 m | place pulse, boosts places |

### 3.23 Witch Hunter — Anti-Magic Skirmisher · DEX · signature: silver — silence, strip, cleanse · tags: `guilty`

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `pinning_shot` (L) | Silvered Pin | bolt / physical | 2 x m 1.0, cd 6, mp 8, rng 38 | Roots 2 s; +50% vs undead; each hit strips the target 6 s | status root, bonusIf family, status strip |
| 2 | `silver_edge` | Silver Edge | melee / physical | m 1.5, cd 4, mp 3, rch 3, arc 1.4 | Strikes twice against a caster; +50% vs undead; each hit cleanses one harmful status from you | bonusIf caster (repeat), cleanse self |
| 3 | `null_circle` | Null Circle | ground → zone / holy | cd 18, mp 14, rng 16, r 6, 8 s | Enemies inside are silenced; enemy ranged hits on allies inside are negated | place zone debuff silence, blocksRanged |
| 4 | `writ_of_guilt` | Writ of Guilt | bolt / holy | m 0.6, cd 14, mp 10, rng 40, 10 s | Tags Guilty: +25% from you AND every follower; undead slowed 40%; your followers focus it | tag (fromParty), command focus |
| 5 | `iron_net` | Iron Net | bolt / physical | cd 12, mp 8, rng 20, r 4 | Everything within 4 m of the impact is rooted 3 s and silenced 3 s | splash statuses |
| 6 | `purging_rite` | Rite of Purging | around / holy | m 2.6, cd 30, mp 26, r 12 | Strips every enemy within 12 m for 8 s, +25% damage per modifier each one had; cleanses every ally | status strip, bonusIf per modifier, cleanse pets |

### 3.24 Knight — Sworn Tank · STR · shield · signature: takes hits FOR others · tags: —

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `shield_bash` (L) | Rim Strike | melee / physical | m 1.3, cd 6, mp 6, rch 2.8, arc 2.2 | Staggers 1 s and taunts 3 s | knock, taunt |
| 2 | `guard_stance` (L) | Sworn Guard | self / holy | guard, cd 18, mp 8, 8 s | 50% less damage from the front; the nearest follower within 8 m takes 40% less — you take that share | self frontal resist, link follower |
| 3 | `sworn_ward` | Sworn Ward | self / holy | cd 18, mp 8, 12 s | The follower nearest your aim is Sworn: any hit on it above 20% of its health is taken by you instead; each such hit gives you +5% damage (cap 5) | link threshold |
| 4 | `challenge` | Challenge | around / physical | cd 12, mp 6, r 10 | Taunts everything within 10 m for 4 s and drags RANGED enemies 4 m toward you | taunt, pullIn (ranged only) |
| 5 | `rampart` | Rampart | ground → wall / physical | cd 20, mp 12, rng 8, length 6, 8 s | A 6 m shield-wall across your aim: enemy movement and ranged hits stop at it; enemies that strike it are taunted to it | wall (P2) |
| 6 | `unbroken_banner` | Unbroken Banner | ground → zone / holy | cd 60, mp 30, r 10, 12 s | Allies within 10 m cannot drop below 1 health and get +20% armour; when it ends everyone standing heals 20%; you taunt everything inside for its length | place zone (deathPrevent, armour), taunt |

### 3.25 Sorcerer — Chaos Caster · INT · pet: storm familiar · signature: wild magic · tags: —

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `wild_bolt` | Wild Bolt | bolt / random | m 1.3, cd 3, mp 5, rng 34 | Rolls fire, ice, lightning, shadow, poison or arcane, with that element's status (HUD shows the next); 3 different in a row make the 4th carry every status | elementPool, sequence |
| 2 | `arcane_burst` (L) | Arcane Burst | ground / arcane | m 1.8, cd 10, mp 18, rng 34, r 5, curse | +20% per DIFFERENT status on each target hit, cap +100% | bonusIf status variety |
| 3 | `mana_rend` | Mana Rend | beam / arcane | m 1.6, cd 10, mp 0, rng 22 | Costs nothing; +8 mana per enemy hit; casters and champions take +60% and are silenced 2 s | onHit mana, bonusIf caster/champion, status silence |
| 4 | `overchannel` | Overchannel | self / arcane | cd 30, mp 0, 8 s | Your skills deal +60% and every cast costs 3% health | empower status, hpCost perCast |
| 5 | `transmute` | Transmute | bolt / arcane | cd 18, mp 14, rng 26, 5 s | A non-boss target becomes a frog (disarmed, slowed 50%, breaks on damage after 1 s); bosses slowed 50% 3 s; when it ends a random-element blast for 150% | status disarm + transform (P2 visual) |
| 6 | `sixfold_ruin` | Sixfold Ruin | ground / random | 6 x m 0.7, cd 34, mp 38, rng 30, r 9 | Six strikes, one per element, at random points inside; a body struck by all six takes +300% on the last | repeats scatter, elementCycle, bonusIf variety |

### 3.26 Runesmith — Rune-Forged Bulwark · STR · signature: runes · tags: `rent` · counter: `rune`

`rune` (counter, max 3): the 3rd detonates for 150% and knocks 2 m.

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `rune_hammer` | Rune Hammer | melee / arcane | m 1.6, cd 5, mp 5, rch 3.2, arc 1.4 | Each hit inscribes a rune | stack counter |
| 2 | `sunder` (L) | Rend Plate | melee / physical | m 1.6, cd 9, mp 8, weaken | Strips 25 armour 8 s and tags Rent: a rune detonation on a Rent target is doubled | sunder, tag |
| 3 | `stoneskin` (L) | Runeskin | self / physical | stoneskin, cd 24, mp 14, 6 s | 40% less damage, and every attacker that hits you is inscribed with a rune | self resist, onHurt stack |
| 4 | `forge_flame` | Forge Flame | self / fire | cd 24, mp 12, 12 s | Your basic attacks and skills deal +40% as fire and burn; every 4th swing slams a 3 m fire burst | imbue |
| 5 | `warding_glyph` | Warding Glyph | ground → zone / holy | cd 20, mp 16, rng 14, r 6, 12 s | Allies inside take 25% less and gain a 2% barrier a second (cap 15%) | place zone buff, barrier tick |
| 6 | `great_anvil` | The Great Anvil | ground → post / arcane | m 3.5, cd 45, mp 30, rng 20, r 8, delay 1 | The anvil falls (350%, stagger 2 s) and STAYS 10 s; any Rune Hammer hit within 8 m of it rings it: an 8 m shockwave for 120% that inscribes a rune on everything | delay, place pulse ringOn rune_hammer |

### 3.27 Shadow Dancer — Stealth Duelist · DEX · signature: afterimages · tags: —

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `shade_cut` | Shade Cut | melee / shadow | m 0.9, cd 3, mp 3, rch 2.8, arc 1.6 | An afterimage where you stood repeats the cut 0.5 s later at 50% | afterimage start |
| 2 | `shadowstep` (L) | Umbral Step | dash / shadow | m 2.1, cd 9, mp 10, rng 14, splash 2 | Ends behind the target; an afterimage at the start throws a dagger at it for 40% | dash behind, afterimage |
| 3 | `smoke` (L) | Shroud | ground → zone / shadow | cd 20, mp 12, r 6, 6 s | A cloud at your feet: you and followers inside evade 50% of attacks; enemies inside are weakened; leaving keeps the evasion 2 s | place zone (self evade, debuff weaken) |
| 4 | `cutting_waltz` | Cutting Waltz | melee / shadow | 5 x m 0.6, cd 14, mp 14, rng 8 | You step between up to 5 enemies within 8 m (one dash each); each step leaves an afterimage that repeats the hit at 50% | dash multi, afterimage |
| 5 | `execute` (L) | Assassinate | melee / shadow | m 3.2, cd 14, mp 12, rch 3, arc 1.2 | Below 30% health: x2 and a kill resets it; from behind or from an afterimage it ignores armour | bonusIf execute, onKill reset, pen when behind |
| 6 | `host_of_shades` | Host of Shades | summon (temporary) / shadow | cd 50, mp 34, 10 s | Three shades (no slots) that copy every skill you cast at 40% from where they stand (P2 `mimic`; before P2 they are temporary followers that strike) | summon temporary, mimic |

### 3.28 Tinker — Clockwork Mechanist · INT · pet: clockwork sentry · signature: gadgets · tags: `stuck`

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `clockwork_bolt` | Clockwork Bolt | bolt / physical | m 0.9, cd 3, mp 4, rng 38 | Sticks (tag Stuck 1.5 s) and bursts when it ends for 45% in 2.5 m; the sentry fires one shot at the same target | tag onEnd burst, command focus (single) |
| 2 | `flask_grenade` | Flask Grenade | ground / cycle | m 1.5, cd 7, mp 8, rng 24, r 3.5 | Cycles Fire (3 s burn pool) → Frost (chill) → Acid (poison element, sunder 15); the HUD shows the next flask | elementCycle with riders |
| 3 | `deploy_sentry` (L) | Deploy Sentry | summon / physical | cd 30, mp 20 | Placed at your aim; with one out, it MOVES there and overdrives 6 s (Hastened) | summon at aim, pet status |
| 4 | `pocket_watch` | Pocket Watch | self / arcane | cd 22, mp 14 | Heals 25% now; the next hit worth more than 15% within 6 s triggers a further 15% heal | heal, ward-like trigger (onHurt) |
| 5 | `grapple_line` | Grapple Line | dash hook / physical | m 1.4, cd 10, mp 6, rng 18 | Reels you to whatever the hook hits — an enemy (stagger 0.5 s), a follower or the sentry — or to the end of the line | dash to hit |
| 6 | `spring_battery` | Spring Battery | self / lightning | cd 40, mp 30, 10 s | You, the sentry and every follower: +50% attack speed; your skills cost no mana; afterwards everyone is slowed 20% for 3 s | status pets, cost override, onEnd status |

### 3.29 Priest — Holy/Shadow Caster · INT · pet: spirit bear · signature: pre-paid revives and revenge · tags: `killer`

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `shadow_lance` (L) | Shadow Lance | bolt / shadow | m 1.9, cd 5, mp 10, rng 38, splash 2 | 25% of the damage it deals heals the most-hurt ally | onHit healAllies (share of damage) |
| 2 | `dawn_prayer` | Prayer of Dawn | around / holy | m 0.8, heal 20%, cd 12, mp 16, r 10 | ONE ring that heals every ally 20% and hits every enemy for 80% | heal pets + damage |
| 3 | `mark_the_killer` | Mark the Killer | bolt / shadow | m 0.6, cd 16, mp 10, rng 34, 12 s | Tags Killer: +20% from shadow damage; whenever a follower falls, its killer is tagged for free | tag, follower-death hook |
| 4 | `vigil` | Vigil | self / holy | cd 45, mp 24, 30 s | On the follower nearest your aim: if it falls within 30 s it rises at once at 40% and its killer is tagged | revive trigger |
| 5 | `dread_hymn` | Dread Hymn | around / shadow | cd 18, mp 14, r 8 | Non-boss enemies within 8 m are feared 3 s; followers deal +20% to fleeing enemies | status fear, bonusIf (pets) |
| 6 | `twinlight` | Twinlight | around / holy+shadow | 6 pulses (1 s), cd 40, mp 36, r 14 | Pulses alternate: holy (heals allies 6%) and shadow (80% to enemies, heals you 25% of it) | repeats alternate |

### 3.30 Enchanter — Mind-Magic Controller · INT · pet: bound imp · signature: sleep and charm · tags: —

The Enchanter OWNS sleep and `turned`.

| slot | id | name | shape / el | base | hook | keys |
|---|---|---|---|---|---|---|
| 1 | `arcane_jolt` | Arcane Jolt | bolt / arcane | m 1.1, cd 2.5, mp 4, rng 34 | Against a sleeping or turned target: x2.5, and it wakes weakened 3 s | consumes sleep/turned |
| 2 | `drowse` | Drowse | ground / arcane | cd 14, mp 14, rng 30, r 5 | Everything inside sleeps 6 s (breaks on damage) | status sleep |
| 3 | `beguile` | Beguile | bolt / arcane | cd 24, mp 18, rng 26, 10 s | A non-boss enemy fights for you for 10 s, following you, then is weakened | turned follow (P2) |
| 4 | `lethargy` | Lethargy (NEW — replaces Befuddle) | ground → zone / arcane | cd 16, mp 14, rng 26, r 6, 8 s | Enemies inside are slowed 50% and attack 40% slower; a sleeper inside does not wake from the first hit | place zone debuff (slow, attackSlow), sleep hitsToWake 2 |
| 5 | `phantasm` | Phantasm | summon (decoy) / arcane | cd 22, mp 14, 8 s | A phantom of you that taunts everything within 8 m; anything that strikes it falls asleep 2 s | summon decoy, taunt by decoy, onHurt status sleep |
| 6 | `enthrall` | Grand Enthrallment | around / arcane | cd 60, mp 40, r 12, 6 s | Every non-boss enemy within 12 m is turned 6 s; bosses slowed 50% and take +30%; when it ends every one is weakened | turned area (P2) |

Lethargy talents (new): T1 a) **Heavy Air** — slow 70% but 4 m (traded dial) / b) **Drifting
Lethargy** — the zone follows the aimed enemy · lib `wide` · T2 a) **Dull Edges** — enemies inside
also deal 20% less (`weaken`) / b) **Dream Tax** — +1 mana a second per enemy inside · lib `deepen`
· T3 a) **Lull** — an enemy that spends 4 s inside falls asleep 3 s / b) **Imp's Fog** — the imp
fights inside it and is Hastened · lib `hunger` · T4 a) **Deep Lethargy** — sleepers inside need 3
hits to wake / b) **Waking Shock** — a sleeper woken inside takes 150% arcane · lib `aegis`.

**Tally:** 180 slots, 180 ids (47 legacy + 133 new), no id on two classes, every class 6 different
verbs. Shapes stay within the 8 pinned shapes (melee around bolt beam ground dash self summon);
placed objects, traps, zones and walls are `ground` (or `self` / `around` for things centred on you)
with a `place` block.

---

## 4. Druid forms spec (and the shared form / stance / temper / song engine)

### 4.1 The three shapes (all original; no bear, cat, tree, bird, stag or seal)

| shape | body (avatar-3d creature) | role | how it is entered |
|---|---|---|---|
| **Briarback** | `boar`, scaled 1.3, bark-brown tint, thorn spines (the creature's `spikes` option or `fx: 'barrier'` aura) | tank | toggle, slot 3 (`briarback_shape`), cd 1.5, 8 mana to shift in |
| **Fenrunner** | `crocodile`, scaled lean (x0.8 width, x1.1 length), mottled green; a venomous marsh lizard | fast melee, poison | toggle, slot 5 (`fenrunner_shape`), cd 1.5, 8 mana |
| **Sporecap** | `mushroom` (float plan), scaled 1.6, pale cap with spore puffs (`pulseStatus 'regen'` + poison motes) | healer / rot, timed capstone | timed 15 s, slot 6 (`sporecap_shape`), cd 50, 30 mana |

Rules:
* One shape at a time (group `shape`). Casting the shape you are in returns you to your own body
  (free, no cooldown). Casting another shape swaps directly (pays its mana, shares the 1.5 s cd).
* Sporecap is timed: 15 s, then you return to your own body. Recasting it early ends it (no refund).
  While Sporecap runs, the two toggles cannot be cast.
* Mounting, entering deep water, starting a gather (E on a node/tree) or entering build mode ends
  any shape. A shape cannot be cast while mounted or swimming. Loading a save starts in your own
  body (form state is never saved).
* While shaped: weapon and gear meshes are hidden (stats still count), the basic attack is the
  shape's `basic` block (below), the actor plays the creature's idle/walk/run/attack/dead clips.
  The **other three druid skills (Thornlash, Greensap, Call the Pack) cast their shape override**;
  the shape skills themselves have no overrides.

| | Briarback | Fenrunner | Sporecap |
|---|---|---|---|
| stats | +60% armour, +30% max health, thorns: melee attackers take 15% of the hit back | +35% move, +25% attack speed, −30% armour | move 60%, +40% healing done, immune to poison |
| basic attack | 2.8 m, 160° claw-and-tusk sweep, m 1.0, nature | two quick bites, 2.2 m, 2 x m 0.55, nature; a bite from behind adds poison | lobbed spore puff, 14 m, m 0.7, 1.5 m splash, poison; an ally inside the splash heals 2% |
| on entering | taunts everything within 6 m for 3 s | enemies further than 10 m lose track of you for 4 s (threat dropped) | a 6 m spore burst: allies heal 10%, enemies poisoned |
| on leaving | — | — | a 8 m spore burst for 150% poison and 15% heal to allies |

### 4.2 The per-shape overrides of the other skills

Each is a `forms` entry on the skill row (§4.5). Numbers are BASE (the override is budgeted with
`effectiveMult` at the HOST skill's slot: Thornlash L1, Greensap L3, Call the Pack L12).

| skill | Briarback | Fenrunner | Sporecap |
|---|---|---|---|
| **Thornlash** (bolt, m 1.4, cd 3) | **Bramble Gore** — melee, m 1.8, rch 3, arc 1.6, cd 4: knock 2 m, taunts the target 3 s | **Venom Lunge** — dash to target 8 m, m 1.6, cd 4: poison (stack 2) | **Spore Lob** — ground, rng 24, r 3, cd 4: a 4 s poison cloud (m 0.2 x4) that heals allies inside 1.5% a second |
| **Greensap** (self regen, cd 16) | **Thornswell** — barrier 20% for 6 s and +20% thorns while it holds | **Shed Skin** — instant 15% heal, removes poison and bleed, Hastened 4 s | **Mycel Web** — every ally within 12 m heals 20% over 6 s (regen stacks as normal) |
| **Call the Pack** (summon / howl, cd 26) | **Den Guard** — wolves taunt everything within 4 m of you for 4 s and take 30% less | **Running Pack** — you and the wolves dash at the aimed enemy together (P2 `dashWith`; before P2 the wolves pounce it); each bite poisons | **Puffball Brood** — 3 temporary puffballs (decoys, 10% of your health, 8 s) that taunt; struck or expiring, each bursts for 80% poison and heals allies within 3 m 5% |

Wording: the slot shows the override's name and icon while shaped; the card shows the current
version first, then the others in a small "In other shapes" list generated from the same data.

### 4.3 Shape talents (four tiers, bespoke only — no library pick, like stances and songs)

**Briarback Shape** — T1 a) **Oakhide** — +100% armour instead of +60%, −10% move / b) **Charging
Shift** — shifting in charges 8 m toward your aim (dash aim) · T2 a) **Splinter Hide** — thorns 30% /
b) **Tusks** — the basic sweep knocks 1 m · T3 a) **Den Mother** — wolves get +30% armour while you
are Briarback / b) **Set Hooves** — after standing still 1 s, 20% less damage · T4 a) **Bramble
Burst** — shifting OUT explodes 6 m for 200% / b) **Unyielding** — `ccImmune` while in the shape.

**Fenrunner Shape** — T1 a) **Long Stride** — +50% move (traded: −40% armour) / b) **Pounce Shift** —
shifting in leaps 10 m onto your aim (leap) · T2 a) **Venom Glands** — every 3rd bite adds 2 poison
stacks / b) **Sap-Fed** — bites heal you 1% · T3 a) **Pack Runner** — the wolves get your move bonus /
b) **Marsh Murk** — shifting in drops a 6 m mud pool that slows 50% for 3 s · T4 a) **Apex** — a kill
in the shape grants Hastened 3 s, stacking to 3 / b) **From the Reeds** — the first bite after
shifting in is a guaranteed crit.

**Sporecap Shape** — T1 a) **Creeping Cap** — move 80% (traded: duration 11 s) / b) **Deep
Mycelium** — 22 s, move 40% · T2 a) **Thick Spores** — the basic puff's splash 2.5 m / b) **Rot
Bloom** — enemies poisoned by you take 10% more from your wolves · T3 a) **Grove Wolves** — wolves
within 10 m heal 2% a second and deal +30% / b) **Spore Mana** — +3 mana a second while shaped ·
T4 a) **Final Bloom** — the leaving burst is 15 m and 300% / b) **Fairy Ring** — leaving plants a
ring of mushrooms that keeps healing allies inside 2% a second for 10 s (place zone).

### 4.4 Talents on the three overridden skills

They use the brainstorm's sketches for `thornlash`, `renew`, `call_wolf` with §6 applied. A node
may carry a per-shape sub-mod (`mod.forms.briarback = {...}`) and the describer prints one line per
shape the node changes. Every node must say what it does in the druid's OWN body too (a custom
class may take Thornlash without any shape). T4 a) **Wild Lash** (per-shape riders) is the model.
Replace `call_wolf` T4 b) *Wild Pack* "Fenrunner wolves are Hastened" — keep, and add "Sporecap
wolves poison". Replace `call_wolf` T2 b) *Feral Bite* → **Wild Bite**.

### 4.5 Data shape (one mechanism for druid shapes, fighter stances, DK tempers, bard songs)

On the form skill:

```json
"briarback_shape": {
  "name": "Briarback Shape", "shape": "self", "element": "nature", "cooldown": 1.5, "mp": 8,
  "form": {
    "id": "briarback", "group": "shape", "toggle": true,
    "body": { "creature": "boar", "scale": 1.3, "tint": "#6b4f2a" },
    "stats": { "armorPct": 60, "maxHpPct": 30, "thorns": 0.15 },
    "basic": { "shape": "melee", "reach": 2.8, "arc": 2.8, "mult": 1.0, "element": "nature" },
    "onEnter": { "taunt": { "radius": 6, "seconds": 3 } },
    "onExit": null
  },
  "talents": { "1": { "lib": null, "nodes": [ ... ] }, "2": { ... }, "3": { ... }, "4": { ... } }
}
```

Timed: `"seconds": 15` instead of `"toggle": true`. Stances / tempers / songs: the same block with
no `body` and no `basic` (`group` = `stance` / `temper` / `song`); a song adds `"aura": { "radius":
10, "buff": ..., "debuff": ..., "heal": ... }` (a `place zone` that follows you) and `"finale":
{ ...sub-plan }` played by `onExit`. `"cycle": true` on a temper means pressing the one skill steps
to the next temper in `"cycleOrder"` rather than toggling.

On any skill that changes per form:

```json
"thornlash": {
  "name": "Thornlash", "shape": "bolt", "element": "nature", "mult": 1.4, "cooldown": 3, "mp": 5,
  "range": 30, "status": "root", "...": "...",
  "forms": {
    "briarback": { "name": "Bramble Gore", "shape": "melee", "mult": 1.8, "reach": 3, "arc": 1.6, "cooldown": 4,
                   "knock": { "push": 2 }, "taunt": { "target": true, "seconds": 3 } },
    "fenrunner": { "name": "Venom Lunge", "shape": "dash", "dash": { "to": "target", "range": 8 },
                   "mult": 1.6, "cooldown": 4, "status": "poison", "stack": { "status": "poison", "max": 2 } },
    "sporecap":  { "name": "Spore Lob", "shape": "ground", "range": 24, "radius": 3, "cooldown": 4,
                   "pool": { "seconds": 4, "radius": 3, "status": "poison", "power": 0.2, "healAllies": 0.015 } }
  }
}
```

Semantics: `createSkillBar.use` resolves `row = { ...row, ...row.forms[formOf(player)?.id] }`
(shallow; an override that sets `shape` replaces the shape-specific fields it names and clears the
base row's fields that do not apply to the new shape — the engine keeps a per-shape field list).
The resolved row then goes through `talentPlan` as usual. The cooldown slot is SHARED between a
skill's versions (casting Bramble Gore puts Thornlash on cooldown). `effectiveMult` uses the host
slot's `unlockAt` and the override's `cooldown`.

### 4.6 Engine pieces (all P1)

* `js/skillmech.js`: `formOf(player)`, `enterForm(player, formRow)`, `leaveForm(player, why)`,
  `tickForms(player, dt)` (timed expiry), `resolveForm(row, player)`.
* `js/skills.js` `createSkillBar.use`: resolve the form override first; form skills call
  `enterForm`/`leaveForm` instead of the normal cast path.
* `js/player.js` / main.js basic attack: read `player.form.basic` before the weapon pattern
  (js/weapons.js). While shaped, weapon patterns, wand behaviours and staff charge are bypassed.
* Body: main.js swaps the player actor's visible group for a creature built by
  `avatar-3d/js/creatures.js` (cache one per shape per session; build on first shift, not at load).
  Use the creature's own clips. If the build fails, keep the humanoid and tint it (never throw).
* Stats: a status `form:<id>` on the player whose fields are the `stats` block (read through the
  existing `buffsOf`/`incomingFrom` path; add `armorPct`, `maxHpPct`, `thorns`).
* HUD: the shape badge (§2 H) shows the three shapes, the current one lit, Sporecap's timer.
* Save: not saved (§7).

---

## 5. Talent data format and the skilltalents.js changes

### 5.1 The JSON on each skill row in `data/skills.json`

```json
"cleave": {
  "...base fields...": "...",
  "talents": {
    "1": {
      "lib": "wide",
      "nodes": [
        { "id": "reaping_arc", "name": "Reaping Arc", "fx": "knock",
          "mod": { "set": { "shape": "melee", "arc": 3.84, "reach": 5.5 }, "add": { }, "mul": { },
                   "knock": { "push": 1.5 } } },
        { "id": "hooked_edge", "name": "Hooked Edge", "fx": "pull",
          "mod": { "pullIn": { "metres": 2, "to": "self" } } }
      ]
    },
    "2": { "lib": "shatter", "nodes": [ ... ] },
    "3": { "lib": "hunger",  "nodes": [ { "id": "battle_rhythm", "name": "Battle Rhythm", "fx": "charge",
                                          "requires": "warcry",
                                          "mod": { "cutCooldown": { "skill": "warcry", "seconds": 1, "per": "hit" } } }, ... ] },
    "4": { "lib": "crescendo", "nodes": [ ... ] }
  }
}
```

Rules for a node:
* `id`: snake_case, unique **within the skill**, and never equal to any `TALENT_LIBRARY` id
  (picks are stored as bare ids next to library ids — a collision would be ambiguous).
* `name`: original, sentence case, ≤ 3 words, passes the banned-name test (§11).
* `mod`: any mix of
  * **vocabulary keys** (§2) at the top level — merged onto the plan: objects shallow-merge key by
    key, scalars replace;
  * `set` — fields replaced on the plan (`shape`, `arc`, `reach`, `radius`, `range`, `element`,
    `status`, `seconds`, `cooldown`…);
  * `add` — numbers added (`repeats.count`, `pierce`, `chains`, `projectiles`, `charges.max`,
    `seconds`, `radius`…);
  * `mul` — numbers multiplied (`mult`, `cooldown`, `radius`, `heal`, `statusMult`…);
  * `forms` — `{ formId: <mod> }`, applied only while in that form (druid, stances, tempers, songs);
  * `when` — a condition on the whole node: `{ form: id }`, `{ resourceAtLeast: [id, n] }`,
    `{ tag: id }` (rare; prefer the condition living inside the key, e.g. `split.when`).
  * the legacy flat library keys (`projectiles`, `mult`, `radiusPct`…) remain valid for library
    nodes only; bespoke nodes use `set`/`add`/`mul`.
* `requires`: another skill id the node interacts with. If that skill is not on the character's
  bar, the node is still pickable but drawn dimmed with "Needs War Cry" and its cross-skill part
  does nothing (the rest of the node must still do something — G5).
* `fx`: one id from §2.4.
* `lib`: one `TALENT_LIBRARY` id **of the same tier**, or `null` (forms, stances, tempers, songs,
  and any self skill where no library node means anything).

### 5.2 skilltalents.js changes (engine)

* `treeFor(skillId, shape, row)` — new third argument, the skill row (resolved for the current
  form). If `row.talents` exists: each tier's `nodes` = the row's bespoke nodes (with a generated
  `desc`) plus `TALENT_LIBRARY[row.talents[t].lib]` if set. If not (a row without talents — none
  should remain after this round, but the custom/test paths and old fixtures may build one) fall
  back to `OFFERS` by shape, exactly as today. Every caller (`skills.state()`, the sheet, retrain's
  menu, `pickTalent`) passes the row.
* `talentsOn(player, skillId, row)` resolves an id against the row's bespoke nodes first, then the
  library. `talentPlan` folds library nodes as today and bespoke nodes through
  `skillmech.applyMod(plan, mod, ctx)`.
* `castRulesFrom` carries every `hit`/`kill`-phase vocabulary key (registry-driven, not a hand list).
* `IMPLEMENTED_MODS` stays for the library; bespoke keys are audited against `VOCAB` (§11).
  `inertTalents()` walks every node of every skill row and reports any key missing from `VOCAB` or
  listed in `skillmech.PENDING` (the P2 keys until they land).
* `describeMod` handles `set/add/mul/forms/when` and the vocabulary keys through `VOCAB.describe`.
  A node's text is generated; there is no `desc` field in the data.
* `OFFERS` stays (fallback and custom/test safety). `OFFERED_TALENTS` additionally collects every
  `lib` named in skills.json.

### 5.3 Where content agents write

Only `data/skills.json`: the skill rows (base fields + `talents` + `forms`), the new `statuses`
rows (tags, counters, the new statuses), `classes` (the six per class) — and `data/classes.json`
`skills` must be identical to it (§11). Content agents do NOT edit js/ files; anything their rows
need that is not in `VOCAB` goes back to the lead as a request, never invented.

---

## 6. Amendment list

### 6.1 Global rules for every talent node (content agents enforce; tests check what they can)

* **G1 Shape of a tier.** Exactly 2 bespoke nodes + the `lib` of that tier (or `null` on forms,
  stances, tempers, songs and pure self buffs). Tier library ids: T1 `fan pierce heavy seeking wide
  quick` · T2 `burst chain linger deepen shatter drain` · T3 `cauterise echo bulwark hunger overload
  brand` · T4 `cascade unmaking wellspring crescendo conflagration aegis`. Pick the lib that makes
  sense for the base shape (a `self` skill never gets `fan`).
* **G2 Dials.** A node whose only change is a duration, radius, range, count or cooldown is a dial.
  At most ONE dial per skill (across all 8 bespoke nodes), and it must trade something ("8 m, 3 s";
  "22 s, half the heal"). Pure upgrade dials ("Long X — 16 s") are deleted and replaced by a rule.
* **G3 Charges.** At most one `charges` node per skill, at most three per class, only on T3/T4.
* **G4 Damage bonuses.** A "+X% damage" node must have a condition the player plays toward (a tag,
  N stacks, from behind, below N% health, a form). Unconditional damage is the library's job.
* **G5 Cross-skill nodes** carry `requires`, and must still do something without the other skill.
* **G6 Status vocabulary.** Dazed / Blinded / Insult / Shame / Rattled / Despair / Sapping /
  Withering → `weaken` with its own numbers. Exposed / Gutted / Brittle / Hoarfrost / Ill Omen →
  `marked` (or the class's own tag if it has one). Stun / launch / knock down → `knock.stagger`.
  Disarm (cannot attack) → `disarm`. Fear / flee → `fear`. Charm / confuse / "attack each other" →
  `turned` (P2, Enchanter-owned; other classes get it only as a T3/T4 talent, max 1 per class).
  Sleep → `sleep` (Enchanter base only; other classes only as talents, max 1 per class).
  Hastened → `haste`. Root → `root`. Silence → `silence`. Strip / unravel / purge buffs → `strip`.
* **G7 Names** (ban list from CLAUDE.md conv. 9 + WoW echoes). Renamed skills are already in §3.
  Talent renames: Cold Blood → **Cool Nerve**; Rallying Cry → **Rousing Cry**; Heartseeker → **Next
  Quarry**; Pack Tactics → **Whole Pack**; Feral Bite → **Wild Bite**; Ironbark Hide → **Oakhide**;
  Rebirth → **Rewaking**; Avenging Oath → **Answering Oath**; Retribution → **Repayment**; Final
  Verdict → **Last Sentence**; Purge the Wicked → **Rout the Wicked**; Beacon → **Muster**; Halo of
  Morning → **Morning Ring**; Ambush (Umbral Step) → **Unseen Edge**; Shiv Throw → **Knife Throw**;
  Epidemic Dart → **Spreading Dart**; Kill Order → **Hunt Order**; Flare → **Signal Arrow**; Frost
  Armour → **Rime Coat**; Permafrost → **Hardfrost**; Infernal Pact → **Fiend's Bargain**; Vengeance
  Never Sleeps → **Debt Collected**; Vengeful Tumble → **Spiteful Tumble**; Sigil Burst → **Brand
  Burst**; Grit Bank → **Pain Bank**; Overload (Storm Beam T3b) → **Full Discharge**; Fan of Darts →
  **Dart Spray**; Called Shot (Tactician T2b) → **Marked Opening** (the Ranger keeps Called Shot);
  Distraction → **Look Away**; Long Breath (bard) → **Steady Breath**; Endless Night (Umbral Step
  T4b) → **Next Shadow**; Fury Feeds / Short Fury / Long Fury / Fury's End → **Rising Wyrm / Brief
  Ascent / Long Ascent / Wyrm's End**; Draconic Fury references in other nodes → Wyrm Ascendant;
  "Aspect" → "Temper" everywhere (Aspect Riders → **Temper Riders**, Aspect Weave → **Temper Weave**,
  Lingering Aspect → **Lingering Temper**, Deep Aspect → **Deep Temper**, Chromatic → **Shadow
  Temper**). Delete every "X-free name:" prefix and the words "death coil". Avoid repeating a talent
  name inside one class (Opened Veins / Open Veins, the two Nightmares, the two Lightning Rods).
* **G8 Cut mechanics** (§2.3): every node using one is replaced (list in 6.2).
* **G9 Untargetable** ≤ 1.5 s, at most one node per class plus the class's base skills.
* **G10 Numbers** obey §9; a node that raises expected damage more than 25% pays for it (a cost,
  a condition, a longer cooldown).
* **G11 Every node changes what the player DOES or SEES** — a new shape, a new on-impact
  behaviour, a new interaction, a resource/form interplay, a minion behaviour — the owner's ask.

### 6.2 Per-skill fixes (beyond renames)

| skill | fix |
|---|---|
| `power_strike` | T1 lib MUST be `wide` (tests/round26-skills.test.js:157 picks it). Keep m 1.9 / cd 4 / mp 0 / rch 3.4 / arc 1.6. T4 a) "Perfect Form" uses `forms: { open, closed }`. |
| `firebolt` | T1 lib `fan`. tests/round20-spells.test.js 4.9 picks firebolt T1 `pierce` — update that test to pick firebolt's T1 bespoke node (§11), do not add pierce back. |
| `corpse_pyre` | T3 lib `drain` → `hunger`. T3 b) Gruesome → `fear` 2 s (not "Dazed"). |
| `curse` | T1 lib `burst` → `wide`. |
| `iron_net` | T1 lib `burst` → `seeking`. |
| `rune_hammer` | T1 b) Thrown Hammer (returns) → **Rune Toss**: an 18 m bolt that inscribes 2 runes, no return. |
| `shade_cut` | T3 a) Lingering Shade (taunt) → **Lingering Shade**: the afterimage stays 3 s and repeats your NEXT Shade Cut too. |
| `inner_stillness` | base changed (absorbs). T1 b) Moving Meditation stays; T4 b) Perfect Balance stays; any "answered" text → "absorbed into Poise". |
| `frost_nova`…`stillfrost` | Stillfrost talents: T1 keep; T2 b) Long Cold → **Deep Cold**: Frozen lasts 3 s, the shatter −20% (traded); T3 a) Cold Fusion `requires: spellrush`; T4 b) Ice Age stays. |
| `daybreak_descent` | Re-sketch on the brainstorm's Dawnbreaker tiers: T1 a) Long Fall (24 m, traded: cd +6) / b) **Guarded Fall** (you take 50% less damage for 2 s after landing; Twin Descent moves to T4 because charges are T3/T4 only, and Second Dawn is dropped); T2 a) Pillar / b) **Muster** (followers teleport to you on landing); T3 a) Lift → stagger 1.8 s / b) Dawnfire → burn; T4 a) Twin Descent / b) **Morning Ring** (heal 25% to you and followers on landing, the base heal becomes 0). |
| `prophecy` | Base changed (follows the target). T1 a) Swift Fate / b) Grand Fate; T2 a) Binding Fate (root 1 s on cast) / b) Fated Wounds (curse); T3 a) Twice Foretold / b) Foreseen Opening (`consumes omen`, base already doubles — make it "removes the Omen and staggers 1 s"); T4 a) Inevitable / b) Fate's Pull. |
| `song_of_ruin` | Base no longer suppresses. T4 b) Unmaking Hymn → **Silencing Hymn**: enemies inside are `strip`ped while inside. |
| `discord_note` | riders keyed to Valour / Ruin / Mending; T3 b) Tempo applies to all three songs. |
| `sanctuary` | T3 b) Shelter → `blocksRanged: true` on the zone (P1). |
| `riposte` | T3 a) Arrow Catcher → the window also negates ONE ranged hit (no reflect). |
| `sweeping_guard` | T3 b) Recoil (throw projectiles back) → **Braced** — hits during the guard cannot knock you back or stagger you. T4 b) Unmoving → `channel` up to 4 s (press again to sweep). |
| `fire_wall` | T2 a) Firebreak → `wall` (P2) — mark the node P2. |
| `thunderclap` | T2 b) Caged → `wall ring` (P2). |
| `ice_lance` | T4 a) Glacier Line → `wall` (P2). |
| `battle_plan` | T2 a) Kill Box → `wall ring` (P2). T3 b) Contingency (swap when low) stays (dash swap is P1). |
| `null_circle` | T2 b) Binding Circle → `wall ring` (P2). |
| `matadors_turn` | T2 b) Red Rag → `turned` 2 s (P2; this is the Swashbuckler's one turned node). |
| `dread_hymn` | T4 b) Unhinged → `turned` 3 s (P2; the Priest's one). |
| `transmute` | T2 b) Wrong Shape → `turned` (P2; the Sorcerer's one). |
| `beguile` | T4 a) Kept — a charmed non-elite under 30% stays as a FOLLOWER (takes a slot through `followers.admit`; refused when full). |
| `phantasm` | T3 b) Echoing Mind → the phantom casts Arcane Jolt (`requires: arcane_jolt`). |
| `rewind` | T4 a) Rewind Them → **Shared Rewind**: the nearest follower rewinds too. |
| `reposition` | T4 a) Grand Shuffle → **Double Swap**: 2 charges (counts toward G3). T2 a/b keep. |
| `fate_thread` | T4 a) The Weave → **Long Weave**: the thread reaches 36 m and refreshes on recast. |
| `mana_rend` | T4 a) Usurp → **Drink Deep**: a kill with it refills 20% mana. |
| `drowse` | Base "does not alert its pack" deleted. T2 b) Sleepwalk → **Dream Leash**: sleepers are pulled 2 m toward the centre when it lands. |
| `scrounge` | Every "pickup" → instant reward. T3 a) Stocked → "the first payout happens as you cast". T4 b) Never Wasted → a payout you do not need (full health/mana) becomes 15 gold. |
| `hunters_snare`, `caltrop_scatter` | trap `max` stays ≤ 2 / ≤ 18 (FPS: one trap is one decal + one proximity check). |
| `breaching_shove`, `open_palm` | Wall-slam text → `knock.carry` (P2). Base works without it. |
| `night_hunt` | "Feared" fiends → `fear` 2 s; T4 b) Endless Night → **Long Night**. |
| `grand_finale` | T4 a) Opus — "every song at double strength 10 s" → **Opus**: the song you are playing when you cast is doubled for 10 s. |
| `host_of_shades` | Until P2 the shades are temporary followers; `mimic` nodes are P2. |
| `seize_initiative` | T3 b) Act Twice → `empowerNext { count: 1, repeat: 2 }` (your next skill fires twice at 60%). |
| `ballad_of_valour` | T4 b) Doubled Time → **Double Time**: once a minute a follower is Hastened at double strength for 5 s. |
| every node | apply G2 (one traded dial max), G3 (charges cap), G6 (status names), G7 (names). |

---

## 7. Save migration

What a save holds today that this round touches: `player.skillTalents` (`{ skillId: { tier: nodeId } }`),
`classId`, and for a custom character `classDef.skills` (six ids, R17/R20). Skill bars, cooldowns,
mana are not affected by ids changing because the bar is rebuilt from the class at load.

Rules (engine implements in `js/save.js` load + a pure `migrateTalents()` in `js/skilltalents.js`):

1. **Version stamp.** `snapshot()` writes `talentsVersion: 2`. A load with no stamp (or < 2) runs the
   migration once, then the stamp is written on the next save. Running it twice changes nothing.
2. **Talents on a skill the character no longer has** (a preset class whose six changed) are
   dropped. Same rule R20 already applies when the Unbinder takes a spell off ("a spell's talents
   go out with it, free").
3. **Talents on a skill the character still has**: keep a pick only if the id is a node of that
   tier in the NEW tree (bespoke ids or the tier's `lib`). Otherwise drop it. Old library picks
   therefore survive exactly when the content agent chose that library id as the tier's `lib`.
4. **Refund**: nothing is owed — picking into an empty tier has always been free; only the Unbinder
   costs gold. The player is told once, in the log and as a toast: "Skill talents were reworked:
   N picks were returned. Choose again on the Skills tab — it is free." (WORDING rule 6/7: a
   sentence with a number.) Nothing is charged and no gold is paid back.
5. **Custom class.** All 47 legacy ids still exist, so a saved build's six stay valid. Some legacy
   ids changed tier (below). A saved pick whose spell is now a HIGHER tier than its slot is kept
   (grandfathered): `pickRefusal` is asked only when picking, never at load. Only new picks see the
   new tiers. Tier moves: cleave 3→1, sunder 1→3, charge 3→6, execute 24→18, pinning_shot 6→1,
   poison_dart 1→3, thunderclap 12→3, arcane_burst 1→3, warcry 3→6, stoneskin 3→6, rally 6→3,
   consecrate 6→3, call_wolf 3→12, call_spirit 3→12, deploy_sentry 3→6, flamethrower 6→3,
   ember_stride 18→6, toxic_cloud 12→18, judgement 18→24.
6. **Runtime-only state is never saved**: form/stance/temper/song (load in your own body, no song,
   Open stance, Fire temper), resources (Flair/Poise/Grudge start at 0), charges (full), recast
   windows, placed objects, corpses, tags, rewind buffer. Nothing in `snapshot()` changes for them.
7. **Pets**: class pets come from `classDef.pet` and are unaffected. Temporary summons are not saved
   (they expire anyway); `followers` (R17) saves only real followers.
8. **Test**: a fixture save with old picks (`{ firebolt: {1:'fan', 2:'burst'}, execute: {1:'wide'} }`
   on a warrior) loads, keeps what the new trees still offer, drops the rest, logs once, and loads
   again with no further change.

---

## 8. Custom class pool, followers and mercenaries

### 8.1 Custom class (`js/classbuild.js`, `data/classbuild.json`, CLASSES.md)

* `spellCatalogue` already derives every spell's tier from "the earliest slot any class grants it
  on". With every skill on exactly one class, **the pool becomes all 180**, tier = its one slot level
  (30 spells per tier). No code change needed for the tier rule.
* **Every skill must stand alone** (brainstorm rule 2 made binding). A custom character can take
  Grandeur without Flourish, Flashover without Firebolt, a druid shape without the druid's
  overridden skills. So, for content agents:
  * a resource spender must be useful at 0 points (its base `mult` alone is a fair hit), and every
    skill that GAINS a class resource still gains it for any character (any character can hold Flair);
  * a `consumes` hook is a bonus on top of a hit that is already fair;
  * a pet-dependent hook falls back to "your followers" (any follower, mercenary or temporary
    summon) and does nothing harmful when there are none — and the card says so ("No follower:
    no effect");
  * a form/stance/temper/song works alone (its stats and basic attack) — overrides are a bonus.
  A test checks the mechanical part (§11: each skill's base plan deals or heals something, or
  applies a status, with an empty party and no other skill on the bar).
* **UI**: 30 spells per tier is too many for one list. The builder's Spells tab groups each tier
  by **class of origin** (collapsible, with the class's signature in one line) and keeps the
  existing element filter. `spellCatalogue` adds `origin: classId` to each spell (from the one
  class that grants it). No new pick rules.
* Talents on a custom class: identical (they live on the skill row, not the class).
* Pets: a custom character has no class pet (unless its opening kit gives a companion, R17).
  `call_wolf` / `raise_thrall` / `bind_imp` / `call_spirit` / `deploy_sentry` summon their pet as
  today through the follower gate.

### 8.2 Followers (`js/followers.js`, `js/pets.js`)

* `followers.js` reads skills.json only for `spellCountFor` (a summon's `count`, keyed by `pet`).
  New rule: rows with `summon.temporary: true` are SKIPPED by `spellCountFor` and by `admit` —
  temporary summons never take a slot and never block a hire. Rows that summon a permanent pet keep
  `shape: 'summon'` + `pet` + `count` exactly as now.
* New pet defs the engine adds to the pets data (temporary only, no shop, no follower UI):
  `holy_wisp` (Guardian Light), `phantom_decoy` (Phantasm, Slip Away — a copy of the player's look,
  does not move or attack), `shade` (Host of Shades — player look, translucent), `buried_thrall`
  (March of the Buried — `bone_thrall` stats x0.6), `spirit_warrior` (Great Post T4a), `puffball`
  (druid Sporecap — `mushroom` creature small, decoy), plus temporary copies of existing defs
  (`bound_imp`, `dire_companion`, `clockwork_sentry`, `grove_wolf`, `spirit_bear`) with
  `temporary: true`. Temporary summons go through `scaleFollower` (R22: never more than 75% of
  the top of your own swing).
* `command` orders reach EVERY follower within 30 m (pets, temporary summons, mercenaries) unless the
  row says `petOnly`. Mercenaries obey focus/guard/return; `pounce` on a mercenary = it walks to the
  target and its next attack is +50%.
* `link`, `barrier pets`, `revive`, `heal pets`, `cleanse pets` all apply to mercenaries too —
  a hired blade is a follower.

### 8.3 Mercenaries (`data/mercenaries.json`)

Their `abilities` book never references skills.json ids — **no data change**. The only effect of
this round on them is 8.2 (they receive orders, links, heals and barriers like any follower).
Seize the Initiative's "follower ability cooldowns reset" resets mercenary ability timers too.

---

## 9. Balance guidance

All numbers in data are BASE; `effectiveMult(skill, unlockAt) = mult x cooldownPower x unlockPower`
is applied by the game (R25). Budget against these bands, then let `effectiveMult` reward the wait.

### 9.1 Damage band — expected single-target base mult per second of cooldown

`expected = mult x repeats-that-hit-one-target x projectiles-that-hit-one-target x (1 + conditional bonus x 0.5) + DoT share`,
divided by `cooldown`. (Conditional bonuses count at 50% uptime; a resource spender at **3** points;
`variance` at its mean; a `consumes` at 50%.)

| cooldown | single-target band | area (r ≥ 4 m or ≥ 3 bodies typical) | control / support-first skill |
|---|---|---|---|
| ≤ 5 s | 0.30 – 0.47 | 0.25 – 0.38 | ≤ 0.25 |
| 6 – 10 s | 0.15 – 0.30 | 0.12 – 0.22 | ≤ 0.12 |
| 11 – 16 s | 0.11 – 0.22 | 0.09 – 0.16 | ≤ 0.09 |
| ≥ 17 s | 0.08 – 0.18 | 0.06 – 0.14 | ≤ 0.07 |

The top of the band is Precise Strike's 0.475 (1.9 / 4) — nothing may beat the game's simplest
skill at its own job. After `effectiveMult` a 22 s slot-6 skill at 0.15 lands at ~0.73 per
cooldown second — that is R25's "a long wait buys a big hit", deliberate.

### 9.2 Damage over time (R21b — enforced by tests/round21-balance.test.js)

* A status's damage = `mult x STATUS_POWER_SHARE (0.35) x statusMult x perSecond x seconds`.
* Per skill, the DoT may not exceed the skill's own impact (`dot / impact ≤ 1.0`; Poison Dart 1.5).
* **Stacks**: a stacking status counts at `max x 0.5` stacks for the cap. So a 5-stack Firebolt burn
  counts 2.5 burns: keep `statusMult` ≤ 0.6 on stacking pyromancer skills (Firebolt's burn at
  1.6 x 0.35 x 0.6 x 0.3 x 5 = 0.50 per stack x 2.5 = 1.26 — under the 1.0-of-impact cap (0.79)
  but it drags the DoT-skill average up; use `statusMult 0.45`: 0.95 total, 0.59 of impact).
  The test's `damageOf` must learn `stack.max` (§11).
* Two statuses on one skill (Plague Cloud) count both.
* Detonate is impact, not DoT, but it is paid out of the DoT: count `share x remaining` as part of
  the DoT skill's total, not as free damage on the detonator.
* The DoT-skill average per cooldown second stays ≤ 1.15 x the best direct skill.

### 9.3 Healing and protection

* Self-healing sustained over a rotation: ≤ 4% of max health per second for a healer class
  (Cleric, Druid, Shaman, Priest), ≤ 2.5% for everyone else. Mend (35% / 14 s = 2.5%) is the anchor.
* Heals to followers are not capped by this (they are the healer's job), but a single cast heals
  at most 50% of a body's health unless it is a revive.
* Barriers: a barrier is worth its share of max health; ≤ 35% from one cast (the library's Aegis).
* Damage reduction from one source ≤ 50% (Runeskin 40%, Sworn Guard 50% frontal); stacked
  reductions multiply, never add; `deathPrevent` effects ≤ 12 s and ≥ 45 s cooldown.
* Wards (Foresight, Warding Spirits): a negated hit is worth `threshold` or `cap` of max health;
  budget them as barriers of that size per charge.

### 9.4 Control

* Hard control (stagger, sleep, stasis, fear, turned, root on a melee enemy, disarm) on a non-boss
  from ONE class's full rotation: ≤ 25% uptime on one target. Bosses: never sleep/stasis/fear/turned
  (a slow instead), stagger keeps its diminishing returns. Champions and rares: half duration.
* Area hard control ≥ 14 s cooldown.

### 9.5 Resources

* Flair / Poise / Grudge: 5 max (7 with the one talent each class may have that raises it), decay
  1 point per 8 s out of combat, start at 0, not saved.
* A spender budgets at 3 points (9.1). Its 0-point floor is a fair weak hit (§8.1).
* Gain rate: a class's builders should reach 5 in about 4-5 casts in a rotation, never in 1-2.

### 9.6 Costs, charges, summons, mana

* `hpCost`: worth at most +20% over a mana-costed equivalent; a skill never kills its caster.
* `charges` keep the per-charge cooldown; a 2-charge node is a burst talent, so G3 caps it.
* Temporary summons: through `scaleFollower`; total temporary-summon damage over the summon's
  life budgets as an area skill with the summon's cooldown (Host of Shades at 40% copies counts as
  1.2 extra casts of your average skill per cast during its 10 s — keep it on a 50 s cooldown).
* Mana: keep the current curve — `mp ≈ 2 + 0.9 x cooldown` for damage skills, ±30%. A skill that
  refunds mana (Mana Rend, Dream Tax) must not run positive over a 10 s rotation by more than its
  own cost.

### 9.7 How to check

`tools/sim-skills.mjs` does not exist yet; the engine agent adds a tiny pure checker
(`tests/round28-balance.test.js`) that computes 9.1's `expected` for every row (and every form
override) and fails a row outside its band by more than 10%, listing them. Content agents run it
before handing back a batch.

---

## 10. Content batches

Five content agents, six classes each, grouped so ONE agent owns each set of easily-confused
classes (the tanks are in one batch so they stay different; the elemental casters in another).
Each batch is about the same work: 36 skill rows, 288 bespoke talent nodes, tag/status rows.

| batch | classes | depends on (beyond P1) | notes |
|---|---|---|---|
| **B1 Frontline** | warrior, fighter, paladin, knight, runesmith, dragon_knight | P2 `wall` (Knight Rampart), `knock.carry` (talents) | stances (fighter) + tempers (DK) use the §4.5 form block — build them after the engine's form work |
| **B2 Skirmish** | rogue, shadow_dancer, swashbuckler, monk, scavenger, witch_hunter | P2 `mimic` (Host of Shades), `turned` (one Matador talent) | three resources/tags-heavy classes; Flair and Poise both here so they stay different |
| **B3 Hunters & commanders** | ranger, demon_hunter, tinker, tactician, necromancer, warlock | P2 `dashWith` (Tactician) | every pet-command class in one place; Grudge here |
| **B4 Elemental & arcane** | mage, pyromancer, stormcaller, sorcerer, chronomancer, enchanter | P2 `stasis`, `rewind`, `turned`, `transform` | the most P2-heavy batch — start it last or author its P2 rows against the spec and let the audit list them as pending |
| **B5 Healers & support** | cleric, priest, druid, shaman, oracle, bard | forms engine (druid), songs (bard) | druid counts double; the other five are mostly P1 |

Order of work:

1. **Engine P1** (one agent): `js/skillmech.js` + `VOCAB` + readers for §2.1, the form engine (§4.6),
   the talent format (§5.2), the migration (§7), the follower changes (§8.2), HUD pieces (§2 H),
   the tests in §11, and `data/skills.json` statuses rows for the new statuses (`root disarm sleep
   fear silence strip` + counters `frostbite rune` + `gnawed`). Ships with ONE fully converted class
   as the reference implementation: **Warrior** (P1-only, every vocabulary group touched).
2. **Content B1, B2, B3, B5 in parallel** (B1 minus the Warrior row, which is the reference), each
   writing only its classes' rows in `data/skills.json` (one agent at a time merges into the file —
   rows are keyed by id, so merges are mechanical; agents must not reformat other rows).
3. **Engine P2** in parallel with step 2.
4. **Content B4**, then the P2-dependent nodes of the other batches are switched on.
5. Lead runs the full suite, the balance checker and the banned-name test; then `publish-stable.sh`.

Each content agent's deliverable for each of its classes:
* six skill rows with base fields from §3, `talents` (4 tiers, 2 bespoke nodes + `lib`, every node
  with `id name mod fx` and `requires` where it applies), `forms` overrides where §3 says so;
* the class's tag / counter / resource rows;
* `classes.<id>` in skills.json AND `skills` in classes.json, identical;
* a short note per class in `CLASSES.md` "Round 28" (signature, tag, the six in one line each).

Acceptance per batch: `npm run test:unit` green (the audits in §11 included), the balance checker
in 9.7 lists nothing for its classes, every generated card renders with no `undefined`, `NaN`, `{`
or "it" as a bare subject, and a 60-second manual cast-through of each class at level 30 in the
browser on the DEV server (8401) shows each skill doing what its card says.

---

## 11. Tests to add / change

**Add** (node, `tests/round28-skills.test.js` unless noted):
1. Every class has 6 ids; every skill id is on exactly one class; all 47 legacy ids are still rows.
2. `data/classes.json` `skills` equals `skills.json` `classes` for every class (fixes the
   newgame.js preview showing the wrong six for 10 classes).
3. Every row has 4 talent tiers; each tier has exactly 2 bespoke nodes; `lib` is null or a library
   node of THAT tier; bespoke ids are unique within the row and never a library id.
4. Every vocabulary key used in any row, override or node is in `skillmech.VOCAB`, has a
   `describe`, and its named reader file contains the key (the R18 pattern, registry-driven).
   P2 keys are allowed only while listed in `skillmech.PENDING` with a reader file named.
5. Every generated skill and node description: no `undefined`, `NaN`, `{`, `[object`; every number
   carries a unit or `%`; durations end in `s` (WORDING rules 1-3).
6. Banned names: every skill name, override name, node name, tag/status name is checked against the
   list in CLAUDE.md convention 9 + `prototypes/wildmarch/docs/00-OVERVIEW.md` §12.5 + the WoW
   echoes in §6 G7 + the substrings `ember` / `veil` in NEW names (legacy ids `ember_stride` etc. are
   ids, not names, and are exempt).
7. Stand-alone: for every row, a level-30 character holding ONLY that skill, with no followers,
   casting it at a dummy produces damage, healing, a barrier, a status or a summon (no dead button).
8. Forms: entering Briarback swaps Thornlash's plan to Bramble Gore; leaving restores it; Sporecap
   expires at 15 s; mounting ends a shape; a save taken while shaped loads unshaped.
9. Migration (§7 rule 8).
10. Followers: a temporary summon does not take a slot and does not block a hire; `command focus`
    makes a mercenary attack the target.
11. Balance (`tests/round28-balance.test.js`, §9.7) and the R21b DoT tests with stacks counted.
12. HUD state: `skills.state()` carries `charges`, `recastLeft`, `next`, `form`, `resource` for the
    rows that use them.

**Change** (these pin things this round changes on purpose — assert the rule, not the old value):
* `tests/round20-spells.test.js` 4.9 picks firebolt T1 `'pierce'` → pick firebolt's T1 bespoke
  node by reading the tree (`treeFor('firebolt', 'bolt', row).tiers[0].nodes[0].id`).
  The 2.1/2.5/3.x tests use `power_strike` (still tier 1) and `meteor` (still tier 24) — unchanged.
* `tests/round21-balance.test.js` `damageOf` learns `stack.max` (x 0.5) and the second status.
* `tests/skills.test.js` "R18 — no talent is inert" — extend to bespoke nodes via the registry.
  "a second burn refreshes rather than stacking" — unchanged (stacking is opt-in per skill).
  "Mend heals… War Cry buffs" — unchanged (both keep their status/heal).
* `tests/round25-skills.test.js` — `flamethrower` element stays `fire` in data; the description test
  `/10 times over 2\.2s/` stays true (10 repeats over 2.2 s kept). If the card wording for
  `elementFrom` adds a sentence, the regex still matches.
* `tests/round26-skills.test.js` — power_strike numbers unchanged; its T1 lib is `wide`.
* `tests/round17-class.test.js` 1.1/1.2 — the catalogue now covers 180 spells; the earliest-tier
  rule is unchanged, so the tests stand; add an `origin` field check.
* Anything matching `classes.<id>` arrays literally (none found today besides `custom`).

---

## 12. Risks and parked items

* **Scope.** 133 new skills x 8 nodes = ~1,440 hand-authored talent nodes plus 47 reworked rows.
  The batch split keeps each agent at ~290 nodes. If a batch runs out of time, the fallback for a
  skill is its base row + `OFFERS`-by-shape library tree (the engine keeps the fallback), and the
  gap is listed in RPG.md "Round 28 — not done" — never silent.
* **Frame cost.** Placed objects, traps and corpses are the new per-frame lists. Caps: 24 placed
  objects, 30 traps, 40 corpses, oldest removed first; one proximity pass per frame over the enemy
  field's spatial buckets (`actors.js` already buckets for separation, ~1138).
* **Readability.** The HUD pieces in §2 H are not optional; without them Flair, Grudge, the next
  roll and the current temper are invisible rules.
* **Shared files.** `avatar-3d/js/creatures.js` is shared with Emberveil; the druid only READS it
  (build a creature, play its clips). No edits there. `items.json` is not touched.
* **Parked (wishlist, mention when the round turns to polish):** hold-to-charge skills, wall slam,
  reflected projectiles, ground pickups, enemy "alert the pack" behaviour, Grand Shuffle, enemy
  rewind, follower webs — all §2.3. A fourth druid shape (a flying one) is parked: flight is a
  mount/vehicle system question, not a skill.

---

## 13. Engine status (engine pass, 2026-10-02) — what is built, what is not

**Built.** Every P1 key in §2.1 and all eight P2 keys in §2.2 (`turned`, `wall`, `stasis`,
`rewind`, `mimic`, `knock.carry`, `dashWith`, `transform`) have a reader; `skillmech.PENDING` is
empty. Pure rules: `js/skillmech.js` (VOCAB registry, applyMod, forms, resources, placed objects,
traps, walls, corpses, hit and hit-taken rules). Runtime: `js/skillrun.js` (dashes, lines, repeats
riders, afterimages, placed posts/zones/traps, walls, links, counters, wards, summons that take no
slot, forms and their creature bodies, basic-attack overrides, channels, rewind, TALENT_FX), wired
into `js/main.js` at fixed call sites. Bar: `js/skills.js` (form overrides, charges, recast,
resources, empowerNext, hpCost, pools/cycles/variance with `next`, cutCooldown/resetOn, cdRate,
`planFor` sub-plans, per-form cards). Talents: `js/skilltalents.js` (per-row bespoke trees, generated
node text, `migrateTalents`, the inert audit over bespoke nodes). Strike: `js/rpg.js` (`rules` per
strike, hitFactor/afterHit/onHurt, imbue, disarm/strip/stasis/transform, form stats on the sheet).
Field: `js/actors.js` (taunt to the player/a post/a turned enemy, untargetable, root, sleep, fear,
silence, stasis payout, turned, walls, interrupt, crowd count, knock.carry). Followers: `js/pets.js`
(temporary/decoy summons, orders, revive, barrier, cleanse, bringAlong), `js/followers.js` (temporary
summons take no slot). HUD: resource pips, form badge, charges, next roll, recast ring, channel
(`skillbar.css`). Save: `talentsVersion: 2` + one-time migration with a single log/toast line.
Data: the Warrior (reference class, 6 rows + 48 nodes), the three druid shapes (with §4.3 talents)
and the druid's three overridden skills (base + `forms`, talents left to batch 5), and form rows
with no class yet for the Fighter stance, the Dragon Knight temper and the three Bard songs
(batches 1 and 5 add their talents and put them on the class). Status rows: root, disarm, sleep,
fear, silence, strip, frostbite, rune, gnawed, turned, stasis, transmuted, off_balance.
`data/classes.json` `skills` now equals `skills.json` `classes` for all 30 (11 differed).
Content agents: read `research/round28-content-guide.md`.

**Keys the engine added beyond §2** (each in VOCAB with a reader and a generated sentence):
`burst` (a ring on cast with statuses/heal), `again` (the cast repeats after a delay), `howl`
(Call the Pack with the pack already up), `onHit.taunt`, `cutCooldown.orSelf` (the G5 fallback when
the `requires` skill is absent), `counter.grow`, `selfBuff` fields `frontalResist manaOnHurt
deathPreventOnce petsShare petsOnly resistPerFoe.lowHp`, form `petBuff threatDrop onKillHaste
firstCrit stats.stillResist stats.manaPerSecond`, `pool.at/along`, `statuses[].minCrowd`.

**Behaviour that changed outside the vocabulary (bugs the round surfaced):**
* A player buff's `haste`/`move` (Quicken, Hastened) now reaches the sheet — js/rpg.js `derive`
  read no status at all, so Quicken never sped anybody up.
* A follower's own statuses (Rally, a howl, Den Mother) and its target's (Shocked, Marked) now count
  on its bite — `rpg.strike` applied `outgoingFrom/incomingFrom` to the player's strikes only.
* A status with infinite duration (a form) no longer prints "Infinitys" on the status chip.

**Fix round after the five content batches (engine, 2026-10-02):** shaped summons ask the shaped
row; a row with no `mult` deals NO damage (`noDamage`, through every strike path, and the card says
"Lands on a spot…") so Rampart and Warding Glyph are `ground` again; each dash strikes a body once
(`field.strikeSegment`); tags carry `fromYou`/`fromParty` (read on EVERY strike by `tagFactor`),
`dealLess`, `takeMoreDot`, `fromBehind`, `detonateMult` (Rent), `burstOnExpire`, `gainOnHurt`, and a
`store` that actually pays out; `command.gain`, `corpseBurst`, `clusters`, `allyStatus`, `sequence`,
`dash.targets`, `selfBuff.onKill`, `selfBuff.stacksOnAttacker`, `empowerNext.manaPause`,
`transform.burstOnExpire`, `attackSlow`, `sleeperHits`, `dotRate` (body and caster), chains prefer
Shocked targets, beams with a `delay`, follower stasis, `dashWith` on non-dash skills, summons rise
at their own corpses, cycling-form talents (`form.<optionId>.stats…`, shared `form.stats`), and a
self skill never puts a harmful status on its caster. Card generator: ordinals, wards, recast,
empower agreement, decoy counts and `onStruck`, summon fields, `atMax`, dash/land/swap riders,
placed-object riders, edge crossings, alternates, sub-strike shapes, a talent's duration change,
orb/trail numbers, "Strikes N times at one spot" for scatter/lowest repeats. The audit now cuts the
VOCAB table and describe helpers out of js/skillmech.js before looking for a reader, and checks a
list of selfBuff/status/form fields the same way — `dotRate` was the case it missed.

Dummy damage (batch 3): not a strike bug. `stone_sentinel` at level 50 has 8,775 armour, so every
hit is floored to 1–9; and a 40 s slot-6 skill's placed pulses inherit its ×7.8 `effectiveMult`, so
13 pulses add up to a lot — inside the §9.1 band once the balance test counts placed pulses (it now does).

**Built in the last pass:** a status reference's `lockout` (Thornlash roots once per target every
6 s, said on the card), a shrinking time-left arc on every placed post, zone and trap, `afterimage`
`at: 'end'` firing from where you stand when it fires, and a tinted humanoid when a shape's creature
cannot be built (an unknown creature type counts as a failed build).

**Staying as they are, and why:**
1. Silence cannot cancel a warband leader's buff: that buff is a passive aura (js/actors.js
   `linkEscort`), not an action a leader takes, so there is nothing to interrupt — silence still stops
   every ranged enemy and caster from firing.
2. Shade copies (`mimic`) repeat the strike, not every rider: re-running posts, summons and buffs
   from three shades would triple a cast's whole budget and its object counts (§12 frame cost).
3. Iron Gyre stays above the §9.1 band: 0.8 × 5 spins is R25's tuning, which the player already
   plays with and an existing test pins; the balance test lists it in `PINNED` rather than skipping it.
4. `runeMult` is retired in favour of the tag field `detonateMult` (Rent carries `detonateMult: 2`).
