# Game ideas: prerendered-sprite swarm games (owner brainstorm 2026-11-17)

Owner: "I like using the prerendered sprites. I can have a lot of enemies on the ground at once and blow them all up,
very satisfying." Likes progression, unlocks, character development, fighting swarms. Liked all five ideas; #3 is
being built first (with co-op). The rest are saved for later — bring them up when a new game is being picked.

**Shared approach (mixed):** enemies, buildings and effects are baked sprites (City Kit bake tool:
`citykit/js/bake.js`, 8/16 directions × animation frames + a night-glow picture). The player's character stays a live
3D model, because there's only one (or a few in co-op) and gear must show on the model (lessons rule 19: no 2D avatar
system). Enemy art source: the Model Library Meshy mobs (`model-library/`), baked.

Engineering notes: sprites make drawing cheap; the cost moves to game logic (bullets × enemies) → grid buckets from
day one. Memory: directions × frames × enemy types × glow layer → pack into atlases, bake at the game's real size.

## 1. Horde survivor
One hero, enemies from every side, weapons fire on their own while you move. Pick 1 of 3 upgrades at each level-up;
weapons combine into stronger ones. Camp between runs: unlock heroes, permanent upgrades, maps. Short runs, one thumb
on phones. Claude's pick to build first before #3 was chosen; idea: idea #4's raised minions as an unlockable hero.

## 2. Sprite-based isometric action RPG
Classic isometric dungeon RPG with dense packs (dozens per room). Class, talent tree, loot with stats, gear that shows
on the live 3D hero. Overlaps Rogueloot (on hold) almost exactly — likely Rogueloot's revival rather than a new game.

## 3. Mech pilot in a neon city — BEING BUILT as Overdrive Frame (prototypes/overdrive-frame/, 2026-11-17)
Mech fights an invasion through City Kit-style blocks; buildings baked in damaged/rubble versions. The mech is the
character: legs, arms, weapons, reactor. Hangar for salvage + research. Owner additions: co-op, fluid movement and
lots of weapons (inspired by a mech series he plays with a friend), occasional tough bosses, enemies with roles,
destructible environments, LOTS of options. See the game's own docs once it has a folder.

## 4. Necromancer — you are the swarm
Everything you kill can be raised to fight for you: grow from one caster to 200 skeletons vs 200 knights. Spells,
minion types, upgrades for raised minions, over a campaign.

## 5. Squad commander on a campaign map
Lead 3–4 heroes (own levels and gear) across a region map; each battle is a swarm assault on a position. Injuries and
recovery, recruiting, a roster to get attached to. Leans toward the base-defence ground Arcline/Spirehold/Lodestar cover.
