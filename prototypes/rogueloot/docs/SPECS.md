# Rogueloot — Specializations (level 10 →)

Design by Fable, 2026-11-10. The roster is `data/specs.json`; the wave-1 trees are `data/skills-specs-1.json`
(same schema as `data/skills-paths.json`, read `docs/SKILLS.md` first for the vocabulary and the Path numbers
these build on). This page is the plain-language version: who the specs are, where each Thousandvale class went,
and for the six wave-1 specs what you press at 15 and at 20.

Rulings this leans on: Path at 3, Spec at 10, cap 20 in Act 1, ~32 points by 20 of which ~20 land in the spec
(2, 29); spec skills REPLACE Path skills and each spec has three trees of 8–10 nodes with ranks to 10 (10); the
owner's wave plan — one spec per Path plus Paladin and Spellblade first, then batches of ~5 (30); pet specs get
one strong pet, summoners up to 8 minions, the mercenary on top (35); hybrids bridge two Paths and run on the
resource of the Path they were taken from (2, and the owner's altCost note).

## The roster

31 specs: Thousandvale's 32 minus the **Tactician** (owner: turn-based orders do not fit an action game) and with
the **Star Blade folded into the Spellblade** — the owner named Spellblade as a wave-1 hybrid, the Star Blade is
exactly that fantasy (a sword with a spell on it, a star shield that strikes back, tethers, a comet rush), so the
hybrid carries that class rather than being a 33rd. Every other class carries over; ten are renamed because the
name is another game's class, clashes with a Path name (Thousandvale's "Fighter" and "Rogue" and "Mage" ARE our
Paths), or clashes with a monster role (the bestiary's "shaman").

| Spec | Path(s) | Thousandvale class | Role | Wave |
|---|---|---|---|---|
| **Vanguard** | Fighter | Warrior | melee damage / tank, stronger in a crowd | 1 |
| **Ranger** | Rogue | Ranger | bow + a hound (pet) + snares | 1 |
| **Pyromancer** | Mage | Pyromancer | burns, ground fire, a fire familiar (pet) | 1 |
| **Cleric** | Healer | Cleric | heals that overflow into wards, revive, a smite that heals | 1 |
| **Paladin** | Fighter *or* Healer | Paladin | melee that heals, tank, off-healer | 1 |
| **Spellblade** | Fighter *or* Mage | Star Blade | steel + storm, star shield, tether, comet | 1 |
| Knight | Fighter | Knight | the pure tank: take hits for others | 2 |
| Assassin | Rogue | Rogue | poisons, marks, the cut from behind | 2 |
| Frostbinder | Mage | Mage | frost then shatter | 2 |
| Stormcaller | Mage | Stormcaller | forked bolts, orbs, the tempest | 2 |
| Oracle | Healer | Oracle | wards before the hit | 2 |
| Swashbuckler | Rogue | Swashbuckler | flair rewards variety | 2 |
| Necromancer | Mage | Necromancer | summoner (8 minions) | 3 |
| Warlock | Mage | Warlock | curses that spread, a bound fiend (pet) | 3 |
| Druid | Healer *or* Mage | Druid | three shapes (stances) | 3 |
| Weaponmaster | Fighter | Fighter | stances and ripostes | 3 |
| Reckoner | Rogue | Demon Hunter | hits taken become one settling shot; a hound | 3 |
| Dusk Priest | Healer | Priest | heals by striking, pre-paid saves, mid-fight revive | 3 |
| Bard | Healer *or* Rogue | Bard | songs (stances with party buffs) | 3 |
| Wyrmblood | Fighter | Dragon Knight | a temper (fire/frost/storm) every skill follows | 4 |
| Tinker | Rogue | Tinker | gadgets, a sentry turret (minion) | 4 |
| Chronomancer | Mage | Chronomancer | haste, slows, rewind, stasis | 4 |
| Spirit Speaker | Healer *or* Mage | Shaman | spirit posts (stationary minions) | 4 |
| Hexbreaker | Rogue *or* Healer | Witch Hunter | silver: silence, strip, cleanse; anti-caster | 4 |
| Monk | Fighter *or* Rogue | Monk | palm strikes, poise, the ninefold staff | 4 |
| Runesmith | Fighter | Runesmith | runes struck in, the great anvil | 5 |
| Scavenger | Rogue | Scavenger | every hit a gamble, gold on a kill | 5 |
| Starcaller | Mage | Starcaller | thrown stars, stars from the sky, a 5-point constellation | 5 |
| Sorcerer | Mage | Sorcerer | wild random elements, health for power | 5 |
| Enchanter | Mage | Enchanter | sleep and charm | 5 |
| Shade Dancer | Rogue | Shadow Dancer | afterimages that strike again (minions) | 5 |

Waves: **1** (6) Vanguard, Ranger, Pyromancer, Cleric, Paladin, Spellblade · **2** (6) Knight, Assassin,
Frostbinder, Stormcaller, Oracle, Swashbuckler · **3** (7, the summoner wave) Necromancer, Warlock, Druid,
Weaponmaster, Reckoner, Dusk Priest, Bard · **4** (6) Wyrmblood, Tinker, Chronomancer, Spirit Speaker, Hexbreaker,
Monk · **5** (6) Runesmith, Scavenger, Starcaller, Sorcerer, Enchanter, Shade Dancer.

Why the waves fall this way: wave 2 is the four "second obvious" specs (the tank, the knife, frost, storm) plus
the ward healer and a second Rogue so a four-Rogue party has a choice; wave 3 is everything that needs the
companion brain stretched (minion caps, stationary posts, a shape that swaps the bar); wave 4 is the specs that
each want one small engine addition (a temper stance, a cooldown refund, a silence zone); wave 5 is the ones that
want a counter the engine does not have yet (Starlight, luck, runes, sleep-breaks-on-damage, afterimages).

**Hybrids (7):** Paladin F/H, Spellblade F/M, Druid H/M, Bard H/R, Monk F/R, Hexbreaker R/H, Spirit Speaker H/M.
Three of them bridge two mana Paths (Druid, Spirit Speaker) or Rogue/Healer; the rule is the same for all: the
spec's costs are written in its primary resource and every active carries `altCost` in the other Path's resource,
and the engine uses whichever matches the hero's Path.

## What a spec gets at 10

- **Proficiency added to the Path's** (`armour`/`weapons`/`offhand` in specs.json; `content.js` writes them to
  `items.proficiency[spec]`): every Fighter-reachable spec gets **plate**; the Paladin mail + plate and maces,
  swords, axes, polearms (so a Healer-origin Paladin can wear the plate it found); the Spellblade leather, swords
  and daggers; the Druid and Spirit Speaker leather + mail; the Monk a staff and polearm; the Tinker and Hexbreaker
  a crossbow and mail. Mage specs stay cloth so cloth never becomes pointless.
- **Two starters at rank 1** (`starter`), as the Path pick does: one node from each of the two trees the spec is
  "about" (Vanguard: Crowd Swing + Hold the Line; Ranger: Broadhead + Call the Hound; Pyromancer: Kindle +
  Burning Line; Cleric: Brightmend + Sunlance; Paladin: Sanctified Blade + Mercy's Touch; Spellblade: Starcut +
  Comet Rush). The first fight after the pick already plays like the spec.
- **~20 points** between 10 and 20 for 25–27 nodes with ranks to 10: you cannot max a tree. A Vanguard with
  rank-8 Crowd Swing and a rank-1 Hold the Line is a different Vanguard from the reverse — the D2 feeling, as in
  the Paths.
- **Path skills stay as utilities** (ruling 10): the Path's off-GCD interrupt, dash and shield keep their buttons;
  the Path's big damage node is what the spec outgrows. Every spec below also has its OWN interrupt (so a hybrid
  that came from a Path with a weak one is not short), a defensive, an area answer, a signature and a capstone at 20.

## Numbers in one table

The baseline (docs/SKILLS.md) is **12 + 6L damage per global** for a level-L hero in a good rotation: 102 at
15, 132 at 20. A sword swing is 25.8 at 15 and 35 at 20, and auto-attacks alone are ~46 and ~63 per global.
Spec fillers are set 1.1–1.3× a swing (vs the Paths' 0.7–0.9×) or ~1.4× a Path bolt, big hits 2.5–4× on 8–25 s
cooldowns, capstones at 20 on 20–90 s. Rank 1, level 20, before attribute multipliers:

| | Per enemy | Per global | Notes |
|---|---|---|---|
| Vanguard: autos + Hammer Blow, Finishing Blow every 7th | 63 + 66 | ~135 | Crowd Swing vs 4: 35 each = 140 + autos |
| Vanguard: Iron Gyre vs 4 | 31.5 × 3 ticks each | 189 per global for 2 globals | on a 12 s cooldown, moving cancels |
| Ranger: autos + Broadhead | 63 + 63 | ~126 | Full Draw 105 per 1.5 s cast; the hound adds ~15–25 a second |
| Pyromancer: Kindle + its burn | 162 per 2.0 s + 13.5/s | ~135 | Scorch 88 + 20/s instant between casts |
| Pyromancer: Firestorm vs 4 | 57 × 3 each | 114 per enemy per global | Burning Line 88 + 13.5/s each, instant, 6 s cd |
| Cleric: Sunlance | 120 per 1.5 s, refunds 6 | ~120 | a solo Cleric still kills ~10% slower than a Mage |
| Cleric: Brightmend | 146 heal + 36 ward per 1.5 s | 97/s | a same-level pack does ~40/s to a plate tank at 20 |
| Paladin: autos + Sanctified Blade | 63 + 45.5 | ~110 (+ 36 healed to everyone within 6 m) | Hammer of Light 63 + 44 fire every 6 s |
| Spellblade: autos + Starcut | 63 + 38.5 + 48 storm | ~150 | the storm half goes through resist, not armour |

Pets (the new `summon` effect through `allies.js`): a pet's numbers are the mercenary baseline × its multipliers,
so a rank-1 Hound at level 20 has ~450 health and swings for ~25 every 1.8 s with a 1.5× bite every 6 s — about
a third of its Ranger's damage, which is where a one-pet spec should sit. Ranks add 6–8% a rank to both. The
Savage Hound (tank role) holds a pack with a Howl taunt every 12 s; the Ashen Familiar does the same for the
Pyromancer. Call of the Wild's three wolves at 0.6/0.7 for 20 s are the one place a wave-1 spec touches the
minion cap.

---

## Vanguard — Fighter → the Warrior

**Fantasy.** The front of the line, stronger the more of them there are. Walk into the pack on purpose. Three trees:

- **Thick of It** (crowd damage): Crowd Swing (10, a full circle at 100% a target, your filler), Battle Hunger
  (11, more temper), Iron Gyre (12, a 3 s spin that drags them half a metre in each tick), Heavy Arms (12), Open
  Wounds (14, synergy), Hew (16, a two-handed arc that leaves everything bleeding), Hardened Grip (16), Whirl On
  (18, synergy), **Avalanche** (20: 250% to everything within 6 m and a stun).
- **Iron Will** (the tank): Hold the Line (10, an 8 m area taunt, off-GCD), Thick Plate (11), Iron Resolve (12,
  armour + a ward + 20 temper, off-GCD), Unmoved (14), Bulwark Blow (14, a taunting hit at triple threat), Blood
  Price (16, life on hit), Stand Fast (18, party armour and heals landing harder), **Bastion** (20: a big ward,
  double armour, 40 temper, everything within 10 m turns on you).
- **Breaking Line** (one target and control): Breaching Shove (10, a cone that interrupts and dazes — the spec's
  interrupt), Find the Gap (11), Hammer Blow (12, 190% and −12% armour, the single-target filler), Sunder (14,
  synergy), Run Them Down (14, a 12 m rush that roots — the answer to a leader running for help), Finishing Blow
  (16, 300%), Shockwave (18, a 12 m stunning line), **Groundbreaker** (20: 400% down an 18 m line and a stun).

**Rotation at 15** (Crowd Swing, Iron Gyre, Hammer Blow, Breaching Shove, Hold the Line, Run Them Down): Headlong
in (Path) → Hold the Line (free of the global; they are all on you now) → Iron Gyre while they are bunched → Crowd
Swing, Crowd Swing → Hammer Blow the brute → Shove the caster as its bar appears. Run Them Down the leader at 25%.

**Rotation at 20** (add Hew, Finishing Blow, Groundbreaker / Avalanche by tree): the same pull, then Hew the moment
the Gyre ends (everything bleeds), Groundbreaker when three stand in a row, Finishing Blow whatever is lowest,
Avalanche when the second pack arrives. A tank Vanguard swaps Hew for Iron Resolve and Avalanche for Bastion.

**Phone (6):** Crowd Swing, Hammer Blow, Iron Gyre, Breaching Shove, Hold the Line, Finishing Blow. Off-GCD Hold
the Line and Run Them Down sit at the ends of the arc. A tank: Crowd Swing, Bulwark Blow, Hold the Line, Iron
Resolve, Breaching Shove, Stand Fast.

---

## Ranger — Rogue → the Ranger (and its hound)

**Fantasy.** A bow, a hound and a bag of snares. The bestiary gives archers perches; the Ranger stands on one and
sends the hound down. Three trees:

- **Far Shot** (the bow): Broadhead (10, 180% instant, 25 m, the filler), Steady Hand (11), Full Draw (12, 300%
  after a 1.5 s draw from 30 m), Easy Quiver (12, energy), Piercing Shot (14, 160% down a 20 m line), True Aim
  (14, synergy), Broadhead Fan (16, a 90° fan 10 m deep for the swarm), Deadeye (18), **Arrow Storm** (20: a 3 s
  rain on a 5 m circle 25 m away).
- **The Hunt** (the pet and the quarry): Call the Hound (10, a pet that stays until it falls; ranks make it
  tougher), Quarry (11, +15% from everyone for 10 s from 30 m — longer and further than Notch), Hunter's Eye (12),
  Savage Hound (14, a bigger hound with a taunting Howl — the solo Ranger's tank), Shared Quarry (14, synergy),
  Run Down the Quarry (16, 220% through the mark), Old Tracks (18), **Call of the Wild** (20: three wolves for
  20 s and +10% party damage).
- **Snarework** (control): Hunter's Snare (10, a 3 m root on the ground where the pack will run), Light Step
  (11), Tracker's Leap (12, 10 m back and +20% crit, off-GCD), Hamstring Shot (12, half speed 5 s), Pinning
  Shot (14, the interrupt: a root and a 3 s lock from 25 m, off-GCD), Caltrop Field (16, bleed + slow on the
  ground), Tight Snare (16, synergy), Netting Shot (18, a 3.5 m root around the target), **Killing Ground** (20:
  200%, root, −20% armour on a 6 m circle).

**Rotation at 15** (Broadhead, Full Draw, Quarry, Call the Hound, Hunter's Snare, Pinning Shot): hound out before
the pull. Quarry the brute → Full Draw → Snare on the ground between you and the skirmishers → Broadhead,
Broadhead → Full Draw. The hound bites what bites you; Pinning Shot the shaman's heal. Tracker's Leap (Path Slip
Step is still there too) when the lynx gets a hand on you.

**Rotation at 20** (add Broadhead Fan, Run Down the Quarry, Caltrop Field, Arrow Storm): Savage Hound holds the
pack on its Howl; Caltrops under it; Arrow Storm on the same spot; Quarry → Run Down the Quarry on the brute;
Broadhead Fan when the swarm pours; Full Draw to finish. Call of the Wild on the boss.

**Phone (6):** Broadhead, Full Draw, Quarry, Hunter's Snare, Pinning Shot, Tracker's Leap. Call the Hound /
Savage Hound lives on the bar only until the hound is out (it stays), then the slot is Broadhead Fan.

---

## Pyromancer — Mage → the Pyromancer (and its familiar)

**Fantasy.** Everything burns. Burns are dots; every tree is a different way to lay them and cash them in. Three trees:

- **Kindling** (bolts and the burn): Kindle (10, a 2 s bolt that burns for 6 s — the filler), Dry Tinder (11),
  Scorch (12, an instant snap and a hotter 8 s burn, cast on the move), Quick Match (12), Fan the Flames (14,
  synergy), Flashover (16, everything within 5 m of the target goes up at once), Long Burn (16, synergy), Hot Eye
  (18), **Immolate** (20: a huge hit and a burn of the same again over 10 s).
- **Wildfire** (ground fire): Burning Line (10, a 14 m line, instant, 6 s cd), Banked Coals (11, mana), Fallstone
  (12, a falling rock with a daze — throw it where they are GOING), Firestorm (14, a 3 s channel on a 5 m
  circle), Spreading Fire (14, synergy), Ash Cloud (16, slow + hit softer: the control tool), Wide Fire (18,
  synergy), **Conflagration** (20: a 7 m circle: hit, daze, burn).
- **The Familiar** (the pet and the skin): Stoke the Familiar (10, a caster pet that stays), Warm Skin (11,
  resist all), Cinder Stride (12, an 8 m dash that burns the ground you crossed — off-GCD, and cast BEFORE the
  step so the line is the path you take), Flame Shell (14, a ward), Snuff (16, the interrupt, 25 m, off-GCD), Ashen
  Familiar (16, a tank pet with a Coal Roar taunt — the solo Pyromancer's wall), Afterglow (18, mana), **Pyre
  Heart** (20: heal, ward, 60 mana, +20% damage, a burst round you; off-GCD; the "oh no" button).

**Rotation at 15** (Kindle, Scorch, Burning Line, Fallstone, Firestorm, Snuff): familiar out. Fallstone on the
spot the pack will reach in two seconds → Burning Line as they come down the row → Kindle the brute → Scorch
while walking away from the skirmisher → Frost Ring (Path) when it closes → Firestorm on the Fighter's spot.
Snuff the caster from 25 m.

**Rotation at 20** (add Flashover, Ash Cloud, Immolate / Conflagration): the same open, then Flashover once four
things are burning, Ash Cloud on the swarm (it moves at 60% and hits 20% softer), Immolate the champion,
Conflagration when the second pack arrives. ~22 casts in 30 s on a 400-mana well with 5 regen, dry at the end
of the second pack without a potion or Afterglow — ruling 23.

**Phone (6):** Kindle, Scorch, Burning Line, Fallstone, Flashover, Snuff. Cinder Stride goes on the sixth slot
instead of Snuff for the player who kites more than they interrupt (both off-GCD). Ground spells land on the
current target's feet on the phone, a click on desktop (as Thunderhead).

---

## Cleric — Healer → the Cleric

**Fantasy.** Heals that spill over into wards, safe ground, the fallen raised, and a lance of sunlight that pays
for it. Three trees:

- **Overflow** (one friend): Brightmend (10, a 1.5 s heal whose overflow stays as a 6 s ward — the filler), Deep
  Well (11), Guardian Light (12, an instant touch plus 8 s of mending), Kind Hands (12), Barrier of Faith (14, a
  big instant ward), Overflowing (14, synergy), Swift Word (16, an off-GCD heal + cleanse), Unbroken (18,
  synergy), **Absolution** (20: heal + ward + heals land 20% harder on them).
- **Sanctuary** (ground and the party): Sanctuary (10, heal + mending + a ward on a 5 m circle), Steady Faith
  (11, mana), Circle of Light (12, an instant 10 m party heal), Raise the Fallen (14, the revive, 3 s, not
  mid-fight), Wider Ground (14, synergy), Lasting Light (16, synergy), Hymn of Rest (16, a 3 s channel: heal +
  cleanse every second on everyone within 8 m), Blessed Ground (18, +20% armour and mending on a circle),
  **Daybreak** (20: heal + ward + cleanse on everyone within 12 m, 90 s).
- **Falling Light** (the light that bites): Sunlance (10, 1.5 s, refunds 6 mana — attacking pays for healing),
  Bright Mind (11), Falling Light (12, a 4 m circle of fire on the target and a heal on everyone within 6 m of
  you — the smite that heals), Censure (12, the interrupt from 20 m with a silence, off-GCD), Zeal (14, synergy),
  Judgement (16, a big hit that makes the target hit softer), Sure Light (16), Noonfire (18, a 6 m burning
  circle), **Light Unbearable** (20: a pillar of noon: hit, daze, and a heal round you).

**Rotation at 15, party** (Brightmend, Guardian Light, Barrier of Faith, Sanctuary, Circle of Light, Censure):
Sanctuary on the Fighter's Headlong target before the pull. Barrier on the Fighter. Sunlance, Sunlance while
nobody is hurt. Guardian Light on whoever the skirmisher picked (instant, keep casting). Brightmend the tank;
Circle of Light when two are under 70%. Censure the shaman's heal — it never stops a cast of yours.

**Rotation at 20, solo** (Sunlance, Falling Light, Judgement, Noonfire, Light Unbearable, Flame-Shell-less:
Shelter from the Path): Noonfire the pack as it comes → Falling Light the brute (everything near it burns, you are
healed) → Judgement the champion → Sunlance ×2 → Light Unbearable the boss. Brightmend yourself between pulls.
Healing threat is half rate (ruling 42), so after a big Circle the leftover skirmisher comes for you: Shelter
(Path) and the Fighter's taunt are for that.

**Phone (6):** Brightmend, Guardian Light, Barrier of Faith, Circle of Light, Sanctuary, Censure. Solo: Sunlance,
Falling Light, Judgement, Noonfire, Brightmend, Censure. Ally heals default to the most hurt friend in range when
the player has an enemy targeted (the Field Mend rule).

---

## Paladin — Fighter OR Healer → the Paladin

**Fantasy.** Every swing heals someone. From Fighter it is a tank that heals as a side effect; from Healer it is
a healer who went and got a mace and plate. Three trees:

- **Holy Blade** (melee that heals): Sanctified Blade (10, 130% and a small heal to everyone within 6 m — the
  filler), Devotion (11), Hammer of Light (12, 180% + fire + a daze), Righteous Arm (12), Blessed Edge (14,
  synergy), Radiant Sweep (16, a 100° arc + fire, and the heal), Fervour (16), Judging Hand (18, synergy),
  **Daybreak Strike** (20: 320% + fire, heal + ward on everyone within 8 m).
- **Oath of Mercy** (the friend in trouble): Mercy's Touch (10, an instant heal, because you are in melee),
  Oathkeeper (11), Martyr's Vow (12, a ward on everyone within 10 m), Daybreak Descent (14, a 20 m leap to a
  friend: heal them, and everything within 4 m turns on you — off-GCD), Gentle Hand (14, synergy), Lay Down the
  Burden (16, off-GCD cleanse + heal), Light Within (18, life on hit), Vow Renewed (18, synergy), **Oathbound
  Rise** (20: a 2 s revive at half health inside a ward, mid-fight).
- **Bulwark** (the wall): Call to Account (10, an 8 m area taunt + they hit softer + a small ward on you,
  off-GCD), Faith in Plate (11), Blessed Earth (12, a circle that scorches and slows enemies and mends friends),
  Shield of Faith (14, armour + ward + 15 temper, off-GCD), Retort (14, the interrupt: a taunting hit), Stout
  Heart (16), Shared Aegis (18, party armour + heals land harder), **Unyielding Oath** (20: ward, double armour, a
  self-heal, everything within 10 m turns on you).

**From Fighter (temper):** hits feed the bar, so Sanctified Blade every global is sustainable and Mercy's Touch
(20) is what you spend the spare on; Hammer of Light at 25 lands every 6 s. It plays as a tank whose heals are
free because the swings paid for them.

**From Healer (mana):** the same skills priced ×1.2 in mana (Sanctified Blade 18, Mercy's Touch 24, Martyr's
Vow 36); with a 400-mana well that is ~20 skills in 30 s then lean, like a Mage — so a Healer-origin Paladin
leans on auto-attacks and Mercy's Touch more and Hammer of Light less, and keeps Sunlash's refund from the Path.
Plate and a shield are the point: it is the Healer who can stand next to the Fighter.

**Rotation at 15** (Sanctified Blade, Hammer of Light, Mercy's Touch, Call to Account, Daybreak Descent, Retort):
Headlong (Path) → Call to Account → Sanctified Blade, Sanctified Blade (everyone near you heals) → Hammer of Light
→ Mercy's Touch the Mage → Retort the caster. Daybreak Descent to whoever the lynx picked: you land, heal them,
and the lynx is now on you.

**Rotation at 20** (add Radiant Sweep, Martyr's Vow, Shield of Faith, Daybreak Strike / Oathbound Rise): Martyr's
Vow on the pull (four wards), Radiant Sweep ×2 on the pack, Daybreak Strike the brute, Shield of Faith when the
shaman's pack has you under half, Oathbound Rise the Mage who stood in the Fallstone.

**Phone (6):** Sanctified Blade, Hammer of Light, Mercy's Touch, Call to Account, Daybreak Descent, Retort.

---

## Spellblade — Fighter OR Mage → the Star Blade

**Fantasy.** A sword with a storm along the edge. Every strike is steel AND storm, so whichever the target lacks
(armour or storm resist) you hit through. From Fighter it is a Fighter with reach, a ward and a pull; from Mage it
is a Mage who stopped running. Three trees:

- **Edgework** (the blade carries the spell): Starcut (10, 110% + storm — the filler), Edge and Word (11), Bright
  Arc (12, a 90° sweep of steel + storm), Spark Mind (12), Honed Star (14, synergy), Riven Star (16, 200% + storm
  and −15% armour), Starlit Eye (16), Wider Arc (18, synergy), **Collapsing Star** (20: everything within 6 m is
  dragged 2 m in, hit, and stunned).
- **Starward** (the shield, the threads, the hold): Star Aegis (10, a ward whose flash scorches everything within
  4 m), Mail of Light (11), Star Tether (12, drag the target 10 m to you and slow it — the archer on the perch is
  now at your feet), Binding Stars (14, a 5 m root round you), Steady Star (14, synergy), Null Word (16, the
  interrupt + silence from 15 m, off-GCD), Starskin (18, resist all), Long Hold (18, synergy), **Star Bastion** (20:
  ward, +60% armour, 30 temper, everything within 8 m turns on you slowed and scorched; off-GCD).
- **Comet** (be somewhere else, hitting something): Comet Rush (10, a 15 m streak at the target, off-GCD — the
  spec's Headlong), Light Foot (11), Thrown Star (12, a 20 m storm bolt — the one spell for what you cannot reach),
  Bright Tail (14, synergy), Flicker Cut (14, 160% then three metres back), Comet Fall (16, a 4 m circle on the
  target + a daze), Quickened Edge (16), Second Comet (18, synergy), **Heaven's Edge** (20: carve a 12 m line and
  end up at the far end of it).

**From Fighter (temper):** Comet Rush is free of the global and lands you in the pack; Starcut every global;
Star Tether (15) and Star Aegis (20) are the spare. It is a Fighter whose Wide Swing has lightning in it.

**From Mage (mana):** the same priced ×1.2 (Starcut 18, Bright Arc 30, Star Aegis 24); the Mage keeps Cinder
Bolt, Frost Ring, Ward and Shift from the Path, so a Mage-origin Spellblade opens at range, Comet Rushes in when
the pack is Frost-Ringed, and Thrown Star is the poke while mana comes back. Leather at 10 is the whole reason.

**Rotation at 15** (Starcut, Bright Arc, Star Aegis, Star Tether, Comet Rush, Null Word): Star Tether the archer
off its perch → Comet Rush the pack → Star Aegis (the flash hits all of them) → Bright Arc, Bright Arc → Starcut
the brute → Null Word the caster. Flicker Cut out when the skirmisher turns.

**Rotation at 20** (add Riven Star, Binding Stars, Comet Fall, Collapsing Star / Heaven's Edge): Comet Rush →
Binding Stars (nothing moves for 2.5 s) → Collapsing Star (they are dragged into one spot) → Bright Arc ×2 → Riven
Star the champion → Heaven's Edge through the line to the shaman. Star Bastion on the second pack.

**Phone (6):** Starcut, Bright Arc, Star Tether, Star Aegis, Comet Rush, Null Word. Off-GCD Comet Rush and Null
Word at the ends of the arc.

---

## What the engine must have (and what it has)

Everything in `skills-specs-1.json` runs on the M9 engine plus the two additions made for this round
(`summon`, `altCost`). The `wishlist` in the file lists ten items with an exact rule each; the two that matter are
inherited Path bugs rather than new features:

1. **Armour buffs on heroes are inert.** `buff` stat `armour` is only read by `armourAfter(t)` when a HERO hits a
   foe; a monster's `strike`/shot resolves against the raw player. Dig In (Path), Iron Resolve, Shield of Faith,
   Stand Fast, Shared Aegis, Bastion, Star Bastion and Blessed Ground all carry armour buffs. The wards and taunts
   in those skills still work, so none of them is dead, but the armour half does nothing until
   `abilities.js` resolves against `armourAfter(p)`.
2. **damageDown / weaken on foes is inert.** The debuff writes a `buff:damage` fx on the foe, but foes read
   `dmgFactor` (kinds `dmgUp`/`dmgDown`). Rallying Roar (Path), Hold the Line, Bulwark Blow, Ash Cloud, Judgement
   and Call to Account carry it. One line in `apply()`'s debuff case (write kind `dmgDown`) fixes all of them.

The rest are nice-to-haves with a fallback already written in: `perTargetHit` (the Warrior's "stronger in a
crowd" — Crowd Swing is flat per target today), `perDot` (Flashover "sets off the burning" — flat area today),
thorns on a ward (Star Aegis strikes back — a burst on cast today), `cond: lowHp` (Finishing Blow — flat 300%),
`hpCost` (Martyr's Vow — priced in temper instead), `who: self` on heals (written as a tiny helpful area at self
today, which the engine runs), synergies feeding a pet's `dmgMult`, and a bar swap on a stance (nothing in wave
1 needs it; the Druid, Weaponmaster, Bard and Wyrmblood in waves 3–4 do).

**For the spec pick itself** (M20's `pickSpec`): mirror `pickPath` — level 10, `ch.path` must be in
`specs[id].paths`, grant `starter` at rank 1, set `ch.spec`, and `defaultBar` already prefers spec actives
over Path ones by `reqLevel`. Respec in town resets `skills` to the Path starters and refunds the points.
