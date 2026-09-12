# Blueprint Library

A store of **blueprints**: characters, NPCs, items and parties as JSON, shared by every experiment and prototype on this origin. A game **stamps** a copy; whatever happens in the game (levels, wounds, loot) never touches the library. Open: `http://<LAN-IP>:8400/library/`.

- Defaults: `data/defaults.json` (8 characters from the demos + a starter party). Your entries: browser localStorage (`playground:library:v1`). Same-id user entries shadow defaults.
- API (`js/library.js`): `Library.open(base)`, `list(kind, {tags})`, `get`, `put`, `remove`, `stamp(id)` (deep copy with `libraryId`), `putCharacter(gameChar)` (strips hp/level/inventory…), `export()`, `import(json)`, `syncToClaude()`, `Library.sendToClaude(name, obj)`, `pullFromServer()`.
- Kinds: `character` (shared character JSON + race/pronouns/entry), `npc` (same shape, met in a game — also Emberveil's pets, kennel companions and named hires as `companion_<id>`), `enemy` (the Emberveil bestiary: `enemy_<id>`, one per enemy and boss), `item` (rolled item JSON from the Item Vault), `party` (`{ members: [ids] }`).
- `enemy` and `npc` entries can carry `creature` instead of `avatar` — a procedural 3D body (`avatar-3d/js/creature-types.js`) for anything that is not a person. Cards show the 2D portrait when there is an avatar and the creature type when there is not. They are built by `tools/build-emberveil-enemies.mjs`; `stamp(id)` gives a game its own copy as usual.
- Helper (`js/make.js`): `makeCharacter({ race, gender, name, traits, ... }, deps)` builds a complete blueprint (avatar from race rules, voice preset by gender, speech from traits, Name Forge name and pronunciation) so any page can add a character in one call.

## Getting your browser work back to Claude
Two ways, both on the Library page (and the same buttons exist in the Character Sheet and Party Quest):
1. **Sync to Claude**: POSTs the library to the dev server (`tools/serve.py`), which writes `library/synced/library.json` and a timestamped copy in `library/synced/inbox/`. Then tell Claude "read library/synced/library.json". Any page can also send arbitrary JSON with `Library.sendToClaude('name', obj)` → `library/synced/inbox/name-<time>.json` (saved games, feedback, screenshots as data URLs…).
2. **Export JSON** and drop the file into the chat.
`library/synced/` is git-ignored (it is your data, not the repo's).
