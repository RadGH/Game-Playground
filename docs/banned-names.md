# Banned names

Moved here from the Wildmarch design bible (`prototypes/wildmarch/docs/00-OVERVIEW.md` §12.5) when Wildmarch was
removed on 2026-10-21. It applies to every game in the playground (CLAUDE.md convention 9).

These must not appear in player-facing text or data (they are WoW's or another Blizzard game's own terms, or
the owner vetoed them). A page may mention one only inside a *(reference)* note.

Heroic (as a difficulty), Mythic, Mythic+, keystone, War Mode, Horde, Alliance, Hearthstone, Delve, Delver,
Renown, Rested, Honored, Revered, Exalted, Fury (resource), Focus (resource), Rage, combo points, Barkskin, Totemic Recall,
soul shards, Corruption (the warlock spell), Arcane Charge, Lay on Hands, Consecration,
Mass Resurrection, Healing Wave, Mirror Image, Leap of Faith, Hellfire, Starfall, soulbound,
flight path, skyway, attunement, Chi, and the words **ember** and **veil** in any new name.

Never use **muster** in any game (owner, 2026-10-03).

## Ability names (owner 2026-11-26, Oathwild)

"Rename everything, loosen our IP protection for skill names and allow common terminology like shield bash. No made
up names like Rim strike or Iron Gyre - the words rim and gyre are now banned and serve as bad examples of naming
conventions. All abilities should be named simply, not flashy, with no complex or archaic words. … Ban the word
'shove'."

- **Common game words are allowed for abilities**: Shield Bash, Cleave, Whirlwind, Fireball, Frost Nova, Blink,
  Ambush, Backstab, Swipe, Maul, Rake, Counterspell, Last Stand, Stealth, Garrote, Cheap Shot — generic words any
  action game uses (moved off the list above on 2026-11-26). Coined proper names from one game stay banned (the list).
- **Banned words in any name: rim, gyre, shove.** Bad examples on record: *Rim Strike*, *Iron Gyre*, *Breaching Shove*.
- **Plain, short, common**: at most three words, words a player already knows; no made-up, poetic or archaic words
  (thee, wyrm, rime, aether, eldritch, -eth…). Say what it does: *Ground Slam*, not *Groundbreaker's Lament*.
- Oathwild checks this in `prototypes/oathwild/tests/rules/trees.test.mjs` and `names.test.mjs`.

`prototypes/farhold/tests/round28-skills.test.js` carries the longer list the skill names are checked against.
