# Brief: fill sound ids with real CC0 recordings

The owner says every sound in our games is "pretty bad". Most are synthesized (sfx/js/methods/synth.js).
We are replacing every id in the shared sound catalog with **real recordings from freesound.org that
are CC0 (public domain)**. You fill ONE slice of ids.

## Tool (already written, use it)
- Search: `python3 /home/radgh/claude/playground/sfx/tools/freesound.py search "fireball whoosh" --max 25 [--maxsecs 6] [--sort downloads|rating|score]`
  prints `id user secs downloads rating title`. It ONLY returns CC0 sounds.
- Fetch: `python3 /home/radgh/claude/playground/sfx/tools/freesound.py fetch <id> /home/radgh/claude/playground/sfx/assets/fs/<file>.ogg [--start S] [--len S] [--fade S] [--gain dB] [--loop]`
  makes a mono 44.1k Ogg (leading silence trimmed unless --start), cut to --len, faded; `--loop`
  cross-fades the tail into the head for seamless loops. It writes `<file>.ogg.json` (the credit) —
  never delete or edit those, the credits page is built from them.
- Inspect a result: `ffmpeg -hide_banner -i X.ogg -af astats=metadata=1,volumedetect -f null - 2>&1 | grep -E "Duration|max_volume|mean_volume|RMS level"`
  and `ffprobe` for duration. You cannot listen, so judge by title, description, tags, downloads,
  rating, duration and the level envelope. To see the envelope over time:
  `ffmpeg -i X.ogg -af "astats=metadata=1:reset=4410,ametadata=print:key=lavfi.astats.Overall.RMS_level" -f null - 2>&1 | grep RMS | head -40`
  (one line per 0.1 s). A sound page with tags/description: `curl -sL -A Mozilla/5.0 https://freesound.org/s/<id>/ | grep -i -A3 'description\|tags'` if you need more.

## Rules
- File names: `sfx/assets/fs/<catalog-id>-<n>.ogg`, n = 1, 2, 3 (e.g. `spell.fire.impact-1.ogg`).
- Variants: 3 for sounds that repeat a lot (impacts, hits, ticks, steps, launches, clicks), 2 for
  medium, 1 for rare stings and for ambience loops. Variants can be different recordings or
  different slices (`--start`) of one longer recording that has several takes in it.
- Lengths: impacts/hits 0.3-1.5 s, launches 0.3-1.2 s, status ticks 0.2-0.7 s (soft!), status apply
  0.3-1.2 s, stings 0.8-3 s, world one-shots 0.3-2.5 s, ambience loops 12-20 s with `--loop --fade 1.5`.
  Use `--len` to cut long recordings. Keep it punchy: the sound should start at once (the tool trims
  leading silence; check the first 0.1 s is not quiet).
- Quality: prefer close, clean, dry, game-ready recordings ("sfx", "foley", "game"), high downloads,
  rating >= 4. Avoid: music, speech/words, people screaming, anything naming another game/film/brand
  (e.g. "Zelda", "Star Wars", "Minecraft"), 8-bit/chiptune, heavy hiss, clipping (max_volume 0 dB is
  fine, a flat-topped wall of 0 dB for many frames is not), long reverb tails on short sounds.
- The setting is medieval fantasy (magic, villages, monsters, dragons). Pick sounds that fit:
  a "spell" should sound magical, not sci-fi laser.
- Loudness does not matter much — the library normalizes every sound — but avoid very quiet takes.
- Do NOT edit sfx/data/catalog.json, sfx/js/*, or anything outside `sfx/assets/fs/` and your own
  mapping file. Do not run Playwright. Do not use `cd dir && ...` in Bash (absolute paths only).
- Keep the total for your slice under ~4 MB.

## Output
Write `sfx/data/recordings/<slice>.json` (slice = A, B or C), shaped:
```json
{ "spell.fire.impact": { "files": ["fs/spell.fire.impact-1.ogg", "fs/spell.fire.impact-2.ogg"], "note": "short why" } }
```
Paths are relative to `sfx/assets/`. EVERY id in your slice's `.tsv` must have an entry. If an id
already has Kenney files (5th column "kenney:N") you may keep them instead by listing the existing
paths (`kenney/impact/...`) — only if they genuinely suit; the owner disliked the overall sound, so
prefer a better recording. A few ids are game-specific: `hvf.*` = a farm/hunt game (bell, horn,
hawk, farmer downed/revived, the hunt changes sides), `lamp.*`/`gutter.burst`/`rekindle`/`oil.pickup`/
`pearl.pickup`/`lantern.out`/`sluice.open`/`grapple.fire` = a lantern-lit drowned-city platformer,
`ward.pull` = pulling a standing stone out of the ground, `night.ambush` = a tense danger sting.
Write the json as you go (after every ~10 ids) so work is not lost if you are interrupted.

When done, report: ids filled, total size, and any id where you are unsure of the pick (and why).
