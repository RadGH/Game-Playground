# Round 28 — content guide: how to convert one class

For the five content agents. The spec is `research/round28-skills-plan.md` (§3 numbers, §6
amendments, §9 balance); this file is the **how**: the fields, the JSON, the commands, and what went
wrong while the engine agent converted the **Warrior**, which is the worked example — read its six
rows in `data/skills.json` before you write your first one.

You edit **data only**: `data/skills.json` (your classes' skill rows, their `talents`, `forms`, the
class's status/tag rows, `classes.<id>`) and `data/classes.json` (`skills` for your classes).
Never `js/`. If a row needs a mechanic that is not in the vocabulary below, write the request to the
lead — never invent a key (the audit fails on it anyway).

---

## 1. The checklist for one class

1. Write the six rows (§3 of the plan has base numbers; the brainstorm has the talent sketches;
   apply §6). Legacy ids keep their id; give them the plan's new `name`.
2. Replace the row wholesale — do not leave old fields behind (`desc` is regenerated; an old
   `status` you no longer want must be removed or set `null`).
3. Write `talents` on every row: tiers `"1"`–`"4"`, each `{ "lib": <id|null>, "nodes": [a, b] }`.
4. Add the class's tag / counter rows to `statuses` (e.g. `quarry`, `grudge` is a resource — not a row).
5. Set `classes.<id>` in `data/skills.json` **and** `skills` in `data/classes.json` — identical.
6. Run, from `/home/radgh/claude/playground`:
   ```
   node prototypes/farhold/tools/describe-skills.mjs          # regenerates every row's `desc`
   node --test prototypes/farhold/tests/round28-skills.test.js prototypes/farhold/tests/round28-balance.test.js
   node --test prototypes/farhold/tests/*.test.js              # the whole suite before you hand back
   ```
   `round28-skills.test.js` prints `# R28 converted classes: N/30 — …`. A class counts as converted
   the moment all six of its rows carry `talents`; from then on every per-class rule is enforced on
   it (one owner per skill among converted classes, 4×2 bespoke nodes, lib tier, G3 charges, banned
   names, stand-alone cast, the §9.1 balance band, wording).
7. Read your cards: `node -e` the snippet in §6 below and read every generated line aloud. If a line
   says "No change", repeats the base skill, or names a default you did not set, the node is wrong.
8. 60-second cast-through in the browser on DEV (8401): `?class=<id>` then in the console
   `f=farhold; f.rpg.gainXp(f.player,400000); f.cast(i)` for each slot. `farhold.mech` shows
   placed objects, walls, corpses, the link and the active forms.
9. Write your `CLASSES.md` "Round 28" lines to `research/r28-batches/<batch>-classes.md`; the lead folds them in (CLASSES.md is not edited by content agents).

Merging (five agents at once): **never write `data/skills.json` or `data/classes.json` yourself**, and never
run `describe-skills.mjs` on its own — each is a whole-file rewrite and would silently erase another batch's
work. Author your rows in `data/r28-batches/<batch>.json` (`{ "skills": {id: row}, "statuses": {id: row},
"classes": {classId: [six ids]} }`, every key optional), then run
`node prototypes/farhold/tools/merge-r28-batch.mjs <batch>`. It takes a lock, copies your rows in (whole-row
replace), writes `classes.<id>` to BOTH files, and regenerates every `desc` inside the same lock. Safe to
run as often as you like. Your staging file is the source of truth: if a merged row looks wrong, fix the
staging file and merge again.

---

## 2. A skill row

```json
"breaching_shove": {
 "name": "Breaching Shove", "shape": "melee", "element": "physical",
 "mult": 1.1, "reach": 3, "arc": 1.4, "cooldown": 7, "mp": 6,
 "knock": { "push": 4, "stagger": 0.6 },
 "talents": { "1": { "lib": "wide", "nodes": [ … ] }, "2": …, "3": …, "4": … }
}
```

* `shape` ∈ `melee around bolt beam ground dash self summon` (pinned). Placed things (posts, traps,
  zones, walls) are `ground` (or `self`/`around` when centred on you) with a `place`/`wall` block.
* Plan fields js/skills.js already reads: `mult cooldown mp reach arc radius range splash width
  projectiles spread pierce chains chainFalloff homing status statusMult statusSeconds heal
  repeats repeatEvery delay pull breath weather pet count pets trail orbs`.
* `mult` is BASE — the game applies `effectiveMult` (unlock level × cooldown). Budget against §9.
* A melee skill's `reach`/`arc` are a **floor**: the weapon's own swing wins if wider (R26). A
  form override is the beast's and keeps its own numbers.
* `repeats` may be a number or `{ "count", "every", "grow", "scatter", "alternate": [subA, subB],
  "target": "lowest", "alwaysTag": "<tag>" }`.
* `heal` may be a share (`0.35`) or `{ "share", "pets" }`.
* Statuses: `status` (one, the skill's main one) and `statuses` (extra, a list of ids or
  `{ "id", "seconds", <field overrides>, "chance", "minCrowd" }`). `{ "id": "weaken", "dealLess": 0.25,
  "seconds": 4 }` is how you give `weaken` its own numbers (G6). Bosses never take sleep / fear /
  root / turned / stasis / transform — the engine turns them into a 60% slow; champions and rares
  get half the duration. You do not write that rule.

### The vocabulary (js/skillmech.js `VOCAB` — the card text is generated from it)

| group | keys |
|---|---|
| moving bodies | `knock {push, stagger, interrupt, carry:{mult,stagger}}` · `pullIn {metres, to: self\|impact\|line, only:'ranged'}` · `dash {to: aim\|target\|behind\|back\|swap\|ally\|hit, range, leap, land:{radius,mult,knock,heal,status,place}, hitMult, allyBarrier, enemyStatus, dashWith}` · `line {length, width, every, across}` |
| projectiles | `ricochet {bounces, range, keep}` · `split {shards, range, keep, when: hit\|kill\|tag:<id>}` · `returns {keep}` |
| landing / kills | `onKill {burst, spread, reset, refund, heal, mana, gold, corpse, tag, pool, haste}` · `onHit {heal, healShare, healAllies, healPet, mana, gold, status, statusChance, resource, taunt}` · `onCrit {repeat, knock, status, reset}` · `place {…}` (§2.1) · `pool {seconds, radius, element, status, slow, power, healAllies, at:'ahead', along:'beam'}` · `burst {radius, mult, element, statuses, knock, heal}` (a ring on cast) · `again {delay, mult}` (the whole cast again) · `afterimage {at: start\|end, delay, mult, count}` |
| set-ups | `tag {id, seconds}` (the row in `statuses` carries `fromYou/takeMore/fromParty/store`) · `consumes {tag\|status, mult, perStack, cap, remove}` (`status` may be `stagger`) · `stack {status, max, add}` · `detonate {types, share, keep}` · `spreadStatus {types, radius, max}` · `store {share}` · `bonusIf [{when, mult}]` · `pen` · `statuses` |
| your state | `charges {max}` · `recast {window, then:<sub-row>, say}` · `resource {id, gain, gainIfNew, gainPer, spend, perPoint:{mult}, atMax:<mod>, max, optional}` · `form` / `forms` (§3) · `elementFrom: temper\|song\|cycle` · `elementCycle` · `elementPool` · `statusPool` · `variance [min,max]` · `hpCost` · `resetOn {when: kill\|crit\|consume\|crowd:N}` · `cutCooldown {skill:<id>\|self\|others\|followers, seconds, per: hit\|cast\|kill, orSelf, half}` · `empowerNext {count, mult, free, crit, behind, repeat, repeatMult, pets, seconds}` · `imbue {seconds, element, status, mult, splash, every:{n, burst:{radius,mult}}}` · `channel {seconds, every, moveK, grow}` · `selfBuff {…}` · `counter {…}` · `ward {charges, threshold, cap, seconds, pets}` |
| followers | `taunt {radius\|target, seconds, by: self\|pet, only:'ranged', perTaunt, perTauntCap, barrierPer}` · `command {order: focus\|pounce\|guard\|return, seconds, petOnly, biteStatus}` · `summon {def, name, count, lifetime, temporary, decoy:{hpShare, taunt, onStruck}, burstOnExpire, at: aim\|self\|corpses, heal:{share,every,strike}, mimic:{mult}, hpMult, biteStatus}` · `barrier {share, seconds, pets, of:'paid'}` · `healPets` · `overflowBarrier` · `revive {share}` · `cleanse {count, types, pets}` · `link {to: follower\|enemy, share, threshold, seconds, range, healEach}` · `howl {status, seconds, damage, taunt}` · `dashWith` · `rewind {seconds, health}` |
| second pass | `turned {seconds, follow, weakenAfter}` · `stasis {seconds, bank}` · `transform {seconds}` · `wall {length, ring, radius, seconds, hp, blocksMove, blocksRanged, taunt, distance}` · `mimic {mult}` |

`bonusIf.when`: `execute:<hp>` · `family:<a,b>` · `behind` · `crowd:<per>:<cap>` ·
`distance:<from>:<per>:<cap>` · `stationary:<s>` · `caster` · `rank:champion` · `status:<id>` ·
`variety:<per>:<cap>` · `aimNotYou` · `followers:<per>:<cap>`.

`selfBuff` fields (all optional): `name seconds resist damage armorPct maxHpPct movePct hastePct
thorns reflect frontalResist ccImmune resistPerFoe:{per,cap,radius,lowHp} deathPrevent
deathPreventOnce:{burst} cdRate dotRate evade untargetable perCastHp noMana manaOnHurt
every:{hits,radius,mult,taunt} storeShare storeRadius onEnd:<sub-row> pets petsOnly petsShare`.

`counter` fields: `window hits negate(0-1) frontal ranged answer:{mult,knock} tauntAttacker
gain:{resource,n} heal ccImmune onUnused:{refund}`.

### 2.1 `place`

`{ kind: pulse|zone|trap, seconds, radius, every, follow: self|target|null, max, hp, strike:{mult,
element, status, targets, nearest, all, distinct, splash, knock}, heal, buff, debuff, knockOut,
pull, arm, triggerRadius, edge, edgeMult, edgeKnock, edgeStatus, blocksRanged, taunt, ringOn:{skill,
radius, mult}, barrierTick, barrierCap, deathPrevent, onExpire:{radius, mult, heal}, tag }`.
`buff`/`debuff` are a status id or `{ id, …overrides }` refreshed every pulse. Caps: 24 placed, 30
traps (oldest removed); `max` caps one skill's own.

---

## 3. Forms (shapes, stances, tempers, songs)

One mechanism. A form skill carries a `form` block; any other skill that changes per form carries a
`forms` map keyed by **form id**. See `briarback_shape`, `duelist_stance`, `wyrm_temper`,
`ballad_of_valour` in the data.

```json
"form": { "id": "briarback", "name": "Briarback", "group": "shape", "toggle": true,
  "body": { "creature": "boar", "scale": 1.3, "colors": { … } },
  "stats": { "armorPct": 0.6, "maxHpPct": 0.3, "thorns": 0.15 },
  "basic": { "shape": "melee", "reach": 2.8, "arc": 2.8, "mult": 1.0, "element": "nature" },
  "onEnter": { "shape": "self", "taunt": { "radius": 6, "seconds": 3 } } }
```

* `group`: `shape` | `stance` | `temper` | `song` — one form per group at a time.
* `toggle: true` (press again to leave, free) or `seconds: 15` (timed; locks the group's toggles).
* `cycle: true` + `options: [ {id, name, stats, element, status, onExit}, … ]` — one key steps
  through them (stances, tempers). `elementFrom: "temper"` on another skill reads the option's
  `element`/`status`.
* `stats`: `armorPct maxHpPct movePct hastePct damage resist thorns healingPct immune:[ids]
  ccImmune stillResist:{after,resist} manaPerSecond` (shares, not points).
* `basic`: the basic attack while in the form — `{shape: melee|bolt, reach, arc, range, splash, mult,
  hits, element, status, statuses, behindStatus, knock, heal, healAllies, every:{n, stack}}`.
* `onEnter` / `onExit` / `finale` (songs): a **sub-row** cast through the normal path — any
  vocabulary works inside (`burst`, `taunt`, `dash`, `pool`, `place`, `selfBuff`…). Give it a `shape`.
* `aura` (songs): `{radius, buff, debuff, heal}` — a zone that follows you while the song plays.
* Also: `petBuff {name, resist, damage, healPerSecond, biteStatus}`, `threatDrop {beyond}`,
  `onKillHaste`, `firstCrit`.
* A per-form override replaces fields shallowly and clears the old shape's own fields when it sets a
  new `shape`. **Set the base row's extras you do not want to `null`** in the override (Thornlash's
  overrides set `"statuses": null, "onHit": null` so the root and the wolf-heal do not ride along).
* The cooldown slot is shared between a skill's versions; `effectiveMult` uses the host slot's
  level and the override's own `cooldown`.
* Form talents use dotted `set` paths: `{ "set": { "form.stats.armorPct": 1.0 } }`,
  `"form.onExit.burst.radius"`, `"form.basic.knock"`, `"form.petBuff"`. Use `lib: null` on forms.

---

## 4. Talent nodes

```json
{ "id": "battle_rhythm", "name": "Battle Rhythm", "fx": "charge", "requires": "warcry",
  "mod": { "cutCooldown": { "skill": "warcry", "seconds": 1, "per": "hit", "orSelf": 0.5 } } }
```

* `id` snake_case, unique in the row, never a library id. `name` ≤ 3 words, original, no banned
  word (the test lists them; CLAUDE.md convention 9 + plan G7), and no `ember`/`veil`.
* **No `desc`.** The line is generated (`describeNode`) and the test fails on a hand-written one.
* `mod`: vocabulary keys at the top level (MERGED onto the row's own value — objects shallow-merge,
  so `{ "knock": { "push": 0 } }` keeps the row's stagger) + `set` / `add` / `mul` (dotted paths ok:
  `"repeats.count"`, `"selfBuff.every.taunt"`) + `forms` (per-form riders) + `when`.
* `fx`: one of `knock pull leap swap trap post zone wall link ward counter afterimage stack detonate
  tag summon form charge` (or a library fx id). It picks the visual in js/skillrun.js `TALENT_FX`.
* `requires`: a skill the node works with. The node must still DO something without it (G5) — the
  Warrior's pattern is `cutCooldown … "orSelf": 0.5` (cut its own cooldown instead).
* `lib`: a `TALENT_LIBRARY` id **of the same tier** (T1 `fan pierce heavy seeking wide quick`, T2
  `burst chain linger deepen shatter drain`, T3 `cauterise echo bulwark hunger overload brand`, T4
  `cascade unmaking wellspring crescendo conflagration aegis`), or `null`. Old saves keep a library
  pick exactly when you chose that id as the tier's `lib` — pick the one that fits the shape.

---

## 5. Pitfalls found converting the Warrior

1. **A partial vocabulary object is a MERGE, not a replacement.** `selfBuff: { reflect: 0.2 }` adds
   reflect to Iron Resolve's guard (good). But `selfBuff.every: {…}` at the top level would replace
   the whole `every` object — use a dotted `set` for a nested field (`"selfBuff.every.taunt": 3`).
2. **`status` and `stack` on the same id fight.** A refreshing `status: bleed` overwrites a stacking
   bleed. Grinding sets `"set": { "status": null }` before adding `stack`.
3. **A pool with `power: 0` is a slow patch, not "0% damage".** Leave `power` out (defaults 0.3) or
   set `0` deliberately; the card says which.
4. **Self skills with no `mult`** describe themselves only through their vocabulary — make sure
   `selfBuff`/`taunt`/`burst` is on the row or the card is empty (the test catches it).
5. **`taunt.perTaunt`** works on the skill's own `status` (War Cry's Might): the status must exist
   on the row.
6. **Every number on the card is generated** — if the sentence reads wrong, the numbers are wrong
   (or the key is), not the text. Run the snippet in §6 and fix the data.
7. **The balance band includes form overrides** (`round28-balance.test.js`). Venom Lunge needed
   `statusMult: 0.35` because its poison stacks count at half their max.
8. **Legacy rows other classes still list** (cleave, warcry, whirlwind were on the fighter, bard,
   monk…) change for those classes too until they are converted — that is expected; the owner rule
   is enforced among converted classes, and globally once all thirty are.
9. **Seed 7 starts in a town**: a knock against a house wall travels nowhere and the town makes
   enemies flee. Assert the push or the status, not the metres, in a spec.
10. **G2/G3/G4**: one traded dial per skill (Avalanche pays +40% cooldown for 8 m), charges only on
    T3/T4 (≤1 a skill, ≤3 a class), every damage bonus has a condition.

## 6. Reading your cards

```
cd prototypes/farhold && node -e "
import('./js/skilltalents.js').then(async m => { const fs = await import('fs');
 const d = JSON.parse(fs.readFileSync('data/skills.json')); m.registerSkillRows(d.skills, d.statuses);
 for (const id of d.classes['CLASS_ID']) { const r = d.skills[id]; console.log('\n' + id + ': ' + r.desc);
  for (const [t, tier] of Object.entries(r.talents || {})) for (const n of tier.nodes) console.log(' T' + t, n.name, '—', n.desc); } })"
```
