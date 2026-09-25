# Shared character JSON (schema 1)

One document describes a character for all experiments. **Every section is optional and independent**: a game can keep only `avatar`, only `voice`, or only `speech`. Each experiment reads/writes its own section and ignores the rest, so you can paste a whole character or a single section into any tool.

```json
{
  "schema": 1,
  "id": "wizard_01",
  "name": "Thalen",
  "avatar": { "...": "see avatar-2d/README.md — same shape for avatar-3d" },
  "voice":  { "...": "see voice-lab/README.md" },
  "speech": { "...": "see lingo/README.md" },
  "creature": { "...": "optional, non-humanoids only — see avatar-3d/README.md (Creatures)" }
}
```

`creature` is for animals and monsters (wolf, boar, bear, rat, horse, deer, bat, spider, snake, drake, dragon): `{ type, size, colors: { body, belly, accent, eyes }, features: { fangs, tusks, horns, antlers, wings, spikes, mane, whiskers, claws, hooves }, seed }`. When a document has `creature`, 3D scenes build it with `createCreature()` (`avatar-3d/js/creatures.js`) instead of the humanoid body, and `avatar` may be absent. Creatures normally have no `speech` (they should not talk) but may have a `voice` for growls.

Rules:
- `schema` is an integer; bump it when a section's shape changes incompatibly and add a migration note in that experiment's README.
- Sections must be plain JSON (no functions, no references), so a character can be saved in localStorage, exported, and pasted into a prompt for Claude ("here's the wizard, add it to the game").
- Colors are `#rrggbb`. Numeric knobs are documented with their range in the owning README; most are 0–1 or -1..1 so games can map them to their own scales.
- Part ids reference catalogs shipped with the experiment (`avatar-2d/js/parts/`, `voice-lab/data/presets.json`, `lingo/data/`). Unknown ids should fall back to defaults, not crash.

See `shared/character.example.json` for a full example. Things that are *not* per-character sections but live alongside characters in a game: memories (`lingo/js/memory.js`, one bank per character, serializable), relationships (`lingo/js/relations.js`, one graph per world), scenes (`lingo/js/context.js`), the lexicon (names/items from `namegen/` and `items/` exported as entries). `GAME-GUIDE.md` shows how they fit.
