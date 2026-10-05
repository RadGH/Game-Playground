# Names and text pools (stream E)

- `torbor.json` — Torbor Downs name lists.
- `traces.json` — signs of other players (PLAN §5.4): `grave` (fades after 60 min: title + lines, `elite`/`fall`/`drown`
  variants), `campfire`, `banner` (`dungeon`/`fort`/`event`/`worldboss`), `deeds` (the zone feed on the map, singular/plural
  per counter), `footprints` (no text: a worn-path threshold). Placeholders: `{name} {level} {class} {killer} {party} {ago}
  {place} {count} {zone} {what}`. Pick a line by a seeded hash of the trace id so every client shows the same text.
  Checked by tests/E/placement.test.js (placeholders) and tests/E/content.test.js (banned names).
