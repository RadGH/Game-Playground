# Names and text pools (stream E)

- `torbor.json` — Torbor Downs name lists.
- `traces.json` — signs of other players (PLAN §5.4): `grave` (fades after 60 min: title + lines, `elite`/`fall`/`drown`
  variants), `campfire`, `banner` (`dungeon`/`fort`/`event`/`worldboss`), `deeds` (the zone feed on the map, singular/plural
  per counter), `footprints` (no text: a worn-path threshold). Placeholders: `{name} {level} {class} {killer} {party} {ago}
  {place} {count} {zone} {what}`. Pick a line by a seeded hash of the trace id so every client shows the same text.
  Checked by tests/E/placement.test.js (placeholders) and tests/E/content.test.js (banned names).
- `chatter.json` — what travellers, folk and town people say (P19): 67 pools — `greet`, `phase.*`, `weather.*`, `recent.*`
  (a rare/elite/boss killed this hour, a dungeon cleared, deaths, busy/quiet, a zone event running/won, a grave),
  `worldboss.*`, `road.*`, `role.<id>` for every traveller/folk role, `archetype.<id>`, `reply`. `{tokens}` are declared in
  `tokens`; a line is used only when every token in it is known; `rules` = weights, no-repeat, bark distance. Checked by
  tests/E/living.test.js.
