# Kenney CC0 audio packs

Three of Kenney's free asset packs, vendored here so the `library` method has real recordings to
play. All three are **CC0 1.0 (public domain)**: usable in commercial games, no fee, no credit
required — crediting Kenney is still the decent thing to do.

| Folder | Pack | Files | Source |
|---|---|---|---|
| `rpg/` | RPG Audio | 51 | https://kenney.nl/assets/rpg-audio |
| `impact/` | Impact Sounds | 131 | https://kenney.nl/assets/impact-sounds |
| `interface/` | Interface Sounds | 101 | https://kenney.nl/assets/interface-sounds |

Total ~3.2 MB, all Ogg Vorbis, mono or stereo (the loader downmixes to mono so the mixer's panner
has something sane to work with).

Each folder keeps the `License.txt` that shipped in the zip. The Impact Sounds zip has no licence
file of its own; its page states CC0, and a note to that effect sits in `impact/License.txt`.

## How they were fetched

```bash
curl -sSLO "https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip"
curl -sSLO "https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip"
curl -sSLO "https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip"
unzip -j kenney_rpg-audio.zip       'Audio/*.ogg' -d rpg
unzip -j kenney_impact-sounds.zip   'Audio/*.ogg' -d impact
unzip -j kenney_interface-sounds.zip 'Audio/*.ogg' -d interface
```

Those URLs carry a content hash that Kenney changes when a pack is updated; re-scrape the asset page
if a link 404s.

## What they cover, and what they don't

The packs give us punches, metal, glass, wood, footsteps, coins, belts, doors, and a full set of
interface clicks — about a third of the catalog. They have **nothing** for fire, ice, shadow, holy,
arcane or lightning spells, nothing for status effects, and no ambience beds. Those ids have no
`library` block in `data/catalog.json`, so the `library` method reports "no sample" for them and the
`hybrid` method synthesizes them instead.

The mapping from catalog id to file lives in `LIBRARY` in `sfx/tools/build-catalog.py`. Change it
there and re-run the script; do not hand-edit `data/catalog.json`.
