# Class-file pass brief (Claude-facing)

Read `_PASS.md`, `00-OVERVIEW.md` §4 and §10, and page 02 §5.16 "Class keys at a glance" first.

For each class file you are assigned, make these edits (edit, never rewrite):

1. **Keys** — use page 02's scheme: class key `Q`, second class key `G`, form/stance/borrowed bar `Shift+1–4`,
   spells `1–6`. Apply the row for your class from the table below exactly, and make every other key
   mention in the file agree with page 02 §5.16.
2. **Calling quest ids** — `q_calling_<class>_1`, `_2`, `_3` (levels 6/20/40). Replace any other pattern.
3. **Drop sources** — where a drop source names a boss by position ("final boss of d10…", "r04_ember_court
   boss 8", "world boss of frostmantle"), replace it with the real boss id and name from
   `12-DUNGEONS.md` §19.2 (dungeon bosses) or `13-RAIDS-WORLD-BOSSES.md` (raid bosses in order, world
   bosses §8). Keep the instance id beside it, e.g. `b_ashmother_veyra` (d14 end boss).
4. **Canon change requests / questions** in the file that 00 §10 or `QUESTIONS.md` answers → mark
   **Resolved (00 §10)** or **See QUESTIONS.md <id>** in place.
5. **Apply these owner-question recommendations** (the docs are written as if recommendations are accepted):
   - C3: pets, summons and mines never count toward soak pips. Tinker's "Soak Plate" and knight's
     "Bearer of Two" (or any similar talent) become "you take 50% less damage from soaks" instead.
   - C5: cleric's automatic Mass Resurrection works on Normal and Heroic only, not Mythic.
   - C10: swashbuckler's tier-4 boss-taunt talent is replaced by a non-taunt defensive/utility choice.
   - C12: druid's Stag rider (Herdbearer) works out of combat only.
   - C13: sorcerer's joke Chaos Table results do not roll inside raids.
   - C14: monk's hand wraps are a real weapon type `wraps`.
   - C15: tinker's main attribute is DEX.
   - C17: the sorcerer's gauge is renamed from "Surge" to **Flux** (Mage and Dragon Knight keep theirs).
6. Unlock levels mentioned in the file must match page 07 (dodge 5, mount 10, etc.).

Report per file: what changed, anything unresolved.

## Key changes by class (from the page 02 pass)

| Class file | Change |
|---|---|
| chronomancer | Recall R → Q; Cast from the Past "hold Z + spell key" → hold G + 1–6 |
| cleric | Raise R → Q tap; Outpouring Shift+R → G; Mass Resurrection Ctrl+R → hold Q for 0.6 s |
| dragon_knight | Z → Q; Shift+Z aspect ring → Shift+1/2/3 (Emberscale/Rimescale/Thunderscale) |
| druid | Z tap/hold → Q tap/hold |
| enchanter | charm Z → Q; borrowed bar Alt+1–3 → Shift+1–3; stance Alt+4 → Shift+4; Hold Here Alt+5 → G. With two charms (40+): the Shift bar drives the most recent charm; tap G twice to swap which charm it drives |
| fighter | stances Z/X/C → Shift+1/2/3; Q cycles stance; Threefold = hold a stance key 1 s |
| knight | Vow R → Q; second Vow Shift+R → G; banners Z+1–3 → Shift+1–3 |
| oracle | Share the Vision Z → Q; "hold Alt to keep the Omen" → hold G |
| paladin | oath wheel V → Q; oaths also on Shift+1/2/3 |
| priest | Anchor Z → Q |
| pyromancer | Vent Z → Q; Feed the Familiar Shift+Z → G |
| ranger | command wheel F and Alt+1..3 → Q tap Hunt, hold Q ring, G Stalk |
| rogue | Slip Away Shift+Q → G |
| shadow_dancer | Veilswap Z → Q |
| shaman | Totemic Recall R → Q; totems Z+1–4 → Shift+1–4 (press twice = at your feet); Z+Shift+slot → G ring |
| sorcerer | Nudge Z → Q |
| stormcaller | rod Z → Q (hold = preview) |
| tactician | Command key Z → hold G + 1–5 (+Shift = whole group); Q = Battle Plan picker |
| tinker | Overclock Z → Q (the Walker bar stays on 1–4) |
| witch_hunter | Witchsight R → Q; Silvered Shots Z+1 → G |
| monk | Ways on Shift+1/2 (right-click menu on the gauge stays as an alternative) |
| bard, mage, necromancer, warlock, demon_hunter, scavenger, warrior, swashbuckler, runesmith | no key change listed — still check every key mention against page 02 §5.16 |
