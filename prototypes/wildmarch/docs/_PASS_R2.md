# Round 2 pass brief (Claude-facing)

The owner answered the WoW audit and sent new feedback. **`00-OVERVIEW.md` §12 is the ruling for every
item** and §4 / §6 / §7 / §8 / §9 carry the new canon numbers, class table, region and dungeon ids. Your job
is to make your assigned files match it — and to **design the new systems** your pages own, in the same
exhaustive, numbers-first style as the rest of the bible.

## Rules

1. Read `00-OVERVIEW.md` **in full** (especially §4, §6, §12), then `_BRIEF.md` (house style, ids, telegraph
   vocabulary). Canon wins over your page. If you need canon changed, list it under "Canon change requests"
   in your final report — do not edit 00.
2. **Edit, do not start over** — keep everything that still fits. But where a ruling removes a system
   (raids, PvP beyond duels, Mythic+/keys, dailies/weeklies, rested XP, Renown, dungeon currencies, the light
   slot and night, binding, the battle-revive limit, attunement, flight paths), **remove it from your page**
   (or reduce it to one line pointing at `WISHLIST.md`) — do not leave dead sections behind. Where a ruling
   renames something, rename it everywhere in your files (ids too: `emberthrone` → `kingsfire`,
   `veilspire` → `spire_isle`, `b_ember_king_kaedros` → `b_fire_king_kaedros`, `fac_ember_legion` →
   `fac_kingsfire_legion`, `lm_hearthstone` → `lm_first_waystone`, Heroic → Challenge, Mythic+ → Depth…).
3. **No "ember" or "veil" in any name** (§11 rule 10, §12.5). When you rename an item, spell, place or
   monster that had one, pick a plain, memorable original name and list old → new in your report.
4. **Banned names** (§12.5) must not survive in your files except inside a *(reference)* note. Before you
   finish, run a case-insensitive grep over your files for every banned term plus: `mythic`, `heroic`,
   `keystone`, `raid`, `attune`, `daily`, `dailies`, `weekly`, `rested`, `renown`, `legacy`, `soulbound`,
   `bind on`, `fury`, `focus` (resource sense), `night`, `torch`, `light slot`, `skyway`, `flight path`,
   `delve`, `oathstone`, `sigil`, `glory`, `laurel`, `battleground`, `arena`, `war mode`, `horde`,
   `hearthstone`, `ember`, `veil`, `copper`, `silver` (coin sense), `mass res`. Fix every hit that is not a
   legitimate use (e.g. "raid" in `WISHLIST.md` pointers, "focus" as an off-hand item, "silver" as a metal,
   the Silver-Branded status, "torch" the starting prop the character holds in the tagline is fine only in
   00). Report the leftovers you kept and why.
5. **Five players.** Nothing outside world bosses, towns and trading is designed for more than 5.
6. **Targeting** is Tab targeting (§12.1 W8). Where your pages describe aiming, spells or the target frame,
   use: hard target that never changes on its own; spells are **Needs target**, **Auto-target** (picks the
   valid target nearest your aim point if you have none), **Ground** or **Self**; self-target `F1`, party
   `F2`–`F5`.
7. **Always daylight.** No day/night cycle, no night spawns, no light slot/torches as gear, no `L` key. Dark
   places are film-set dark (§12.3).
8. Plain language; numbers not feelings; no slogan fragments. Mark `(reuse: path)` / `(new)`.
9. Documentation only — **no game code**. Edit only your assigned files. Other agents are editing the other
   pages at the same time; link to them by section name rather than guessing their new numbers.
10. Links: page 13 is now `13-WORLD-BOSSES.md`; new pages `19-PROFESSIONS.md`, `20-TRAVEL.md`,
    `WISHLIST.md`. Update any link to `13-RAIDS-WORLD-BOSSES.md` in your files.
11. At the top of each page, set the status line to `v0.2 draft — 2026-09-30 (round 2 applied)`.
12. **Final report** (keep it under ~60 lines): per file, what you changed (bullets), old → new names you
    picked, grep leftovers you kept deliberately, canon change requests, and new open questions for the owner.
