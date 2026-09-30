# Changelog — changes to canon

Every change to `00-OVERVIEW.md` is logged here with the date and the reason.

## 2026-09-29 — v0.1 first draft

- Canon written: pitch, pillars, page owners, numbers, spell ladder, class template, 30 classes, 11 regions,
  14 dungeons, 5 raids.
- Pages 01–18 and 30 class files drafted in parallel from the canon and a shared brief (`_BRIEF.md`).

## 2026-09-29 — reconciliation pass

The parallel drafts disagreed; §10 of the canon now settles each disagreement and the pages were corrected.

- **Keys:** page 02 owns them. Class key `Q`, second class key `G`, dodge `F`, forms `Shift+1–4`. Class files
  had used `Z`, `R`, `V`, `X`, `C` for class tools; page 03 had dodge `Q`, bags `B`, light `Z`.
- **Unlock levels:** page 07's ladder. Dodge was 3 in pages 02 and 14 and 5 in page 07; the mount was 10, 12
  or 15. Now dodge 5, mount 10.
- **Slots:** 15 (page 08). Page 03 had proposed 16 with trinkets and no light/mount slot.
- **Flying mounts:** in at level 60 (page 07's `q_sky` chain). Page 08 had left them out.
- **Currencies:** page 08 owns; the dungeon page's `cur_delvers_mark` became `cur_delve`, the raid page's
  `it_oathstone` became `cur_oathstone`, page 14's "Wardens' Seals" became Veil Sigils (the name clashed with
  the Vale Wardens' reputation token).
- **Warband levels:** page 10's bands; pages 01 and 14 had their own.
- **Rarity:** new Legendary tier in violet; Farhold's legendary is Wildmarch's Epic.
- **XP:** smooth curve `600 × 1.107^(L−1)` (Farhold's stretched curve made levels 36 and 48 cheaper than the
  level before).
- **New numbers:** global cooldown 1.0 s, 15 slots, 2 legendaries worn, item level to 88, personal loot, weekly
  reset Wednesday 07:00, nothing pauses.
- **New rules:** late-spell talent tiers, pets vs mechanics, boss break bar, Oracle colour, shared cast-pause
  lockout, extra id prefixes.

## 2026-09-30 — round 2: the owner's answers to the WoW audit + new systems

Every audit recommendation accepted except the items the owner answered himself. The full ruling table is
00 §12; the owner's message is summarised there. Headlines:

- **Shape:** an online action RPG with an MMO-style world and a 5-player focus. **No raids** (parked in
  `WISHLIST.md`); raid-style mechanics live in 5-player dungeons. The two story raids became dungeons
  **d15 The Fire Court** and **d16 The Spire**. World bosses stay. PvP is friendly duels only.
- **Difficulty:** Normal and **Challenge**; **Depth** replaces Mythic+ (no timer; raises the dungeon's level to
  60, then gets much harder with better rewards; tiers add enemy types and abilities).
- **Removed:** rested XP, Renown/Legacy, daily and weekly quests, attunement, dungeon/raid/PvP currencies
  (gold only, no copper/silver), binding (all loot tradeable; quest items excepted), the battle-revive limit,
  mass resurrection, item-level tracks and "Veil-touched", flight paths/skyways, the day/night cycle, the
  light slot and the `L` key.
- **Targeting:** Tab targeting; the target frame never changes by itself; spells are Needs target /
  Auto-target / Ground / Self; self-target `F1`.
- **Classes:** resources are **Mana / Momentum / Tempo**; every class has a build (melee/ranged/caster) and most
  have a hybrid role (mage, warlock, swashbuckler, shadow dancer, enchanter and tactician can tank; pyromancer,
  necromancer, tinker and chronomancer can heal). New systems: rogue Blind Spots (melee and ranged), druid forms
  that transform the six spells, a totem-free storm-and-folklore shaman, warlock Bind Demon, ranger Tame Beast,
  necromancer Control Undead, a trap-and-crossbow demon hunter with no gauge or form.
- **Factions:** seven player factions with chapters, present from low level to 60. One player side.
- **New systems:** sockets (Gem / Jewel / Soul / Gadget), tags on skills and items, seven magic-find stats,
  Harvesting (one shared skill) + one crafting profession (new page 19), Travel Methods and teleports (new page
  20), the Recall Stone, quivers as stat-sticks with basic-attack effects, more mount species, a 3D item card
  with rarity frames, five special rarities with bespoke icons, monster rarities (champion packs, rares,
  greater rarities in exclusion groups).
- **Renames:** the Veil → the Mend; Emberthrone → Kingsfire; Veilspire → Spire Isle; Ember King → Fire King;
  Ember Legion → Kingsfire Legion; Ashtusk Horde → Ashtusk Warhost; the Hearthstone → the First Waystone; and
  no new name may use "ember" or "veil". Banned-name list: 00 §12.5.
- **Page 13** is now `13-WORLD-BOSSES.md`. New pages: `19-PROFESSIONS.md`, `20-TRAVEL.md`, `WISHLIST.md`.
- **Farhold:** the three affix bugs found by page 08 (and the target bar showing the wrong enemy) were fixed in
  Farhold round 28.
