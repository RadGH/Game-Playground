# Brief for every doc writer (Claude-facing, not a player doc)

You are writing part of the design bible for **Wildmarch**, a new online third-person action RPG in
`~/claude/playground/prototypes/wildmarch/`. It is a sibling of Farhold (`prototypes/farhold/`) that
reuses Farhold's Chibi 2 characters, items/affixes/uniques, skills engine, perk forest, per-spell talents,
levelling, inventory, voices (`shared/voices.js`), Lingo speech, sfx and combat feel — but drops space,
base building, industry, colonies and terraforming. **Documentation only: write NO game code.**

## Rules
1. **Read `docs/00-OVERVIEW.md` first. It is canon.** Use its ids, names, level bands, class list, spell
   ladder (1/4/10/18/28/40), calling quests (6/20/40), talent tiers (12/22/32/45), cap 60, roles, group
   sizes, region/dungeon/raid ids verbatim. Do not edit 00. If you need canon changed, list it under
   "Canon change requests" in your final report.
2. **Research Farhold first** for anything that already exists (files named in your task). Document the
   existing feature as it works in Farhold, then say what changes in Wildmarch. Mark `(reuse: path)` or `(new)`.
3. **Be exhaustive.** The owner wants EVERYTHING described: every page, hotkey, settings option, dropdown
   value, spell number. More detail = a better v2. Tables are good. Numbers, not feelings
   ("140% weapon damage in a 6 m cone", not "heavy damage").
4. **No third-party IP in player-facing names** (no WoW/Diablo names for spells, items, places, monsters).
   You may mention other games only in notes marked *(reference)*.
5. **Plain language.** The owner is a senior web dev who dislikes jargon. Define a technical term inline.
6. Write ONLY the files assigned to you. Markdown, GitHub style: `#` title, `##` sections, tables,
   bullet lists, fenced code for JSON shapes. Link other pages as `[page 05](05-COMBAT.md)` (relative).
7. Id conventions: spells `<class>_<snake>`; talents `<spellid>_t<tier><a|b|c>`; items `it_<snake>`;
   class sets `set_<class>_<snake>`; generic sets `set_<snake>`; legendaries `leg_<snake>`;
   uniques `uq_<snake>`; monsters `m_<family>_<snake>`; bosses `b_<snake>`; quests `q_<snake>`;
   NPCs `npc_<snake>`; screens `scr_<snake>`; settings `set.<tab>.<key>` — careful, settings keys use a dot.

## Boss / telegraph vocabulary (page 11 owns it; everyone uses these words)
- **Danger zone** (RED ground fill that grows from the edge in): leave before it fills. Hits once.
- **Void zone** (PURPLE-black swirl, persists): damages every 0.5 s while you stand in it; usually grows or lingers 10–60 s.
- **Soak** (ORANGE circle with N pips): needs N players inside or it hits the whole group.
- **Safe zone** (BLUE ring): be inside it when the cast finishes.
- **Targeted** (YELLOW circle following one player, name shown): spread away from others.
- **Beneficial** (GREEN): stand in for a buff/heal.
- **Tether** (WHITE line between two bodies): break by distance, or keep, per mechanic.
- Shapes: circle, donut (safe hole in the middle), cone, line/beam, cross, moving wave, checkerboard, room-wide.
- **Cast bar** over the boss frame: grey = cannot interrupt, gold border = interruptible.
- **Warning time** minimums: 1.5 s Normal, 1.2 s Heroic/Mythic, 3.0 s for anything that one-shots.
- **Boss dialog**: bosses speak (voice + bubble + a centre-screen banner) and a line often IS the warning
  ("The tide answers me!" = wave coming in 3 s). Some bosses offer **dialog opportunities**: a pause where
  a player can pick a reply (parley, bargain, taunt, answer a riddle) that changes the fight, skips a phase,
  or unlocks a secret boss.
- Enrage timer, phases by health %, adds, interrupts, dispels, tank swaps, kiting, line of sight.
