# Talents (owner 2026-11-13)

> Owner: "make skill unlocks separate from talents. Add a lot of synergies between skills and subclasses." And: "Look
> up talent trees for games like WoW and Diablo 2 and Titan Quest and build something similar."

## Skills vs talents

- **Skills** = every `kind: "active"` row (the buttons on the bar). They **unlock by themselves** at their `reqLevel`
  for your class (Path) and specialization. No points. A skill gets stronger as you level: its rank is
  `min(maxRank, 1 + floor((level - reqLevel) / 2))` (`js/sim/talents.js skillRankAt`). `prereq` on a skill is ignored.
- **Talents** = every `kind: "passive" | "synergy" | "talent"` row. They cost **talent points** (1 a level from level 2,
  plus quest points). Each lives in one **tree**: the class (Path) tree, open from level 2, and the specialization's three
  trees, open from level 10.

## The tree screen (what we took from each game)

- WoW (classic talents): trees side by side as tabs, square icons with `2/5` rank badges, arrows from a talent to the
  one it unlocks, "points spent in this tree" on each tab, a 1-point capstone at the bottom.
- Diablo 2: rows gated by **character level**, synergies drawn as links to the skill they boost.
- Titan Quest: a **level rail** down the side of the tree that fills as you level, each row lighting up as it opens.
- A detail panel shows **this rank and the next rank**, the exact numbers (no prose), requirements in red when unmet.

## Talent row (data/talents-*.json → `talents: { id: row }`, merged into content.skills)

```json
"pyr_tinder_mind": {
  "name": "Tinder Mind", "owner": "pyromancer", "tree": "kindling", "kind": "talent",
  "reqLevel": 12, "col": 1, "maxRank": 3, "prereq": ["pyr_dry_tinder"],
  "mods": [{ "to": { "skill": "mage_firebolt" }, "stat": "damage", "perRank": 6 },
           { "to": { "type": "fire" }, "stat": "cost", "perRank": 3 }],
  "passive": { "stat": "spellPower", "value": 2, "perRank": 2 },
  "when": { "spec": ["pyromancer"] },
  "flavour": "Short line of colour, optional, max ~60 chars. Never restates the numbers."
}
```

- `owner`: the path id (fighter/rogue/mage/healer) or spec id. `tree`: the path's `tree.id` or one of the spec's `trees[].id`.
- `reqLevel` must be one of the **row levels**: class tree `2 4 6 8 11 14 17 20`, spec trees `10 12 14 16 18 20`.
- `col` 0-3; at most one talent per (tree, row, col). `prereq`: talents of the **same tree** in an **earlier row**
  (prefer the same column, so the arrow runs straight down; an adjacent column is fine).
- `maxRank` 1-5 (a capstone in the last row is 1). Values are per rank: rank r gives `perRank * r` for mods, and
  `value + perRank * (r - 1)` for `passive` (the old rule, unchanged).
- `mods[].to` — which skills it changes, any one of:
  `{ "skill": id }`, `{ "skills": [ids] }`, `{ "owner": pathOrSpecId }` (every skill of that class/spec),
  `{ "tree": treeId }` (every skill in that tree), `{ "type": "physical|fire|frost|storm|poison|shadow|heal" }` (heal = skills that heal, ward or shield).
- `mods[].stat` — percent per rank: `damage`, `heal`, `duration`, `radius`, `cost` (cheaper), `cooldown` (shorter),
  `cast` (faster cast), `crit` (added crit chance points on those skills).
- `passive.stat` — the old vocabulary (sheet.js): crit, maxHp, resistAll, moveSpeed, manaRegen, spellPower, dodge,
  castSpeed, meleePower, lifeOnHit, attackSpeed, maxMana, armourPct, healPower, energyRegen, rageGen, rangedPower,
  threat, hpRegen, critDamage, blockChance.
- `when`: `{ "spec": [ids] }` and/or `{ "path": [ids] }` — the talent only works (and can only be learned) for those.
  This is how a **class tree** holds **subclass synergies** ("Pyromancer: fire skills +4% damage") and how a hybrid
  spec's tree holds talents for one of its two Paths.
- Old `kind: "synergy"` rows (`synergy: { skill, stat, pctPerRank }`) still work and count as talents.
- Player text is generated from `mods` + `passive` (so the numbers can never disagree with the data). `flavour` is
  optional colour.

## Synergy targets per tree (the "lots of synergies")

- Every **spec tree**: 10-14 talents; at least 3 boost the spec's skills one by one, at least 3 boost **class (Path)
  skills** (subclass → class synergy), at least 2 boost skills in **another tree of the same spec**, one 1-rank capstone.
- Every **class tree**: 14-18 talents: general class talents + mods on class skills, and at least one `when.spec`
  talent for **each** spec open to that class (class → subclass synergy).
- Hybrid specs: talents for each of their Paths, marked with `when.path`.

Checked by `tests/rules/talents-data.test.js`.
