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

---

# Wave 2 (M22) — Knight, Assassin, Frostbinder, Stormcaller, Oracle, Swashbuckler

Design by Fable, 2026-11-10. The data is `data/skills-specs-2.json` (listed in `data/skills-specs-index.json`);
the six `starter` arrays in `data/specs.json` are filled. 178 nodes: 28 for the Knight, 30 for each of the other
five, three trees each, every tree with a node at every gate 10/11/12/14/16/18/20, 101 actives, 46 passives, 31
synergies. No hybrids in this wave, so nothing carries `altCost`; the Swashbuckler is a pure Rogue in the roster.

Same standard as wave 1: a filler at 10 in each of the two trees the spec is about (both granted at the pick), an
interrupt of its own off the global cooldown, a defensive, an area answer, a signature, and a capstone at 20 on a
20–90 s cooldown; fillers at 1.1–1.3× a swing or ~1.4× a Path bolt, big hits 2.5–4× on 8–25 s. The engine fixes
from wave 1 are in (armour buffs on heroes count against monster hits; damageDown / weaken lower a monster's
damage), so the Knight's armour and every "hits softer" debuff below is live, not a placeholder.

**Three things that run on the engine as it stands and are worth knowing about:**

- **Flair is real without a counter.** Every Swashbuckler skill ends with a `buff damage 4% 8 s`. The engine files
  a buff under `<skill id>:damage`, so three different skills give three buffs (+12%) and the same skill twice only
  refreshes its own — that is a "reward variety" counter with no new code, and Grandeur reads it the way every
  weapon hit reads `fxPct(p, 'damage')`. Checked: Flourish → Feint → Pinning Thrust → Flourish leaves +12%.
- **"Take a friend's hits" is a taunt circle at the friend's feet.** `area at: target` with a taunt inside, on an
  ally-target skill, reaches the foes round the ALLY (wave 1's Daybreak Descent proved it). Sworn Guard, Intercept,
  Bodyguard and Unbreakable Vow all put a ward on the friend and pull whatever is on them onto the Knight.
- **Short-lived minions make an orb and a decoy.** Storm Orbs are three `caster` minions (type storm, 15 s) that
  shoot whatever you fight (12 bolts in the first 6 s in the sim); the Assassin's Decoy is a `tank` minion with a
  3 s taunt that lives 8 s. Both count toward the eight-minion cap and are the only summons in this wave.

One engine fact shaped every skill: **a skill carries at most one dot** (the fx id is `<skill id>:dot`, so a second
dot in the same skill overwrites the first). Where a design wanted "poison and bleed" they are two skills (Venom
Strike + Blood and Bile) and stack across skills. And `buff` stats the engine reads are damage, crit, castSpeed,
armour, healTaken and threat — dodge and moveSpeed buffs are read nowhere, so every "parry" and "step" here is a
ward, and the dodge/moveSpeed read is on the wishlist with the one-line rule.

## Numbers in one table

Rank 1, level 20, before attribute multipliers; baseline 132 per global, a sword swing 35, autos ~63 a global.

| | Per enemy | Per global | Notes |
|---|---|---|---|
| Knight: autos + Shield Blow | 63 + 42 | ~105 | a tank's filler at triple threat; Rim Strike 52 + 1.5 s stun every 12 s |
| Knight: Sworn Guard | ward 94 + 20% armour on the friend | — | and the pack round them is on you; Shared Shield 70 on everyone every 20 s |
| Assassin: autos + Venom Strike + its poison | 63 + 38.5 + 27 | ~128 | Gutting Strike 84 every 6 s, ×1.2 through Grave Mark → ~150 |
| Assassin: Knife Storm vs 4 | 42 each | 168 + autos | Thousand Cuts 31.5 × 3 ticks each + bleed, every 25 s |
| Frostbinder: Frost Shard | 141 per 1.8 s + 30% slow | ~117 | Rime Burst 99 instant on the move; Rime Spear 242 per 2 s cast (×1.5 on the slowed when `cond` lands) |
| Frostbinder: Whiteout vs 4 | 48 × 3 ticks each + 40% slow | 96 per enemy per global | Blizzard 110 + 20/s, half speed on a 7 m circle |
| Stormcaller: Forked Bolt | 130 + 44 to each within 4 m | ~130–174 | Thunder Ring 88 to everything within 5 m, instant, every 8 s |
| Stormcaller: Storm Orbs | ~10 a shot × 3 orbs every 1.8 s | ~25/s for 15 s | a third of a pet, for 15 s, every 20 s |
| Oracle: Fate Bolt | 120 per 1.5 s, refunds 6 | ~120 | the Sunlance rule: a solo Oracle still clears |
| Oracle: Foresight | ward 114, instant, every 6 s | 95/s of absorb | Kind Omen 112 + 22/s × 8 + a 34 ward per 1.5 s |
| Swashbuckler: autos + Flourish with 3 flairs | 63 + 42, ×1.12 | ~118 | Grandeur 105 + 35 to everything within 5 m, every 20 s |

---

## Knight — Fighter → the Knight

**Fantasy.** The purest tank. You do not out-damage anything; you decide who gets hit. Three trees:

- **Sworn Guard** (linked protection): Sworn Guard (10, a ward + 20% armour on a friend and everything within 5 m
  of them turns on you — the opener on whoever the pack will pick), Steel Vow (11), Intercept (12, a 20 m leap to
  a friend with a ward and a taunt, off-GCD), Vigil Plate (12), Shared Shield (14, a ward on everyone within
  10 m), Steadfast Vow (14, synergy), Bodyguard (16, heal + ward + heals land harder on them + the taunt), Oath of
  Iron (18, life on hit), **Unbreakable Vow** (20: heal, a great ward, +20% heals, the taunt, and 30 temper).
- **Challenge** (taunts and the rim): Challenge (10, a 10 m area taunt + hit 12% softer + 10 temper, off-GCD),
  Loud Steel (11, threat), Shield Blow (12, 120% + taunt at triple threat — the filler, no shield needed), Rim
  Strike (14, 150% + a 1.5 s stun + taunt), Bellow (14, the interrupt from 12 m with a silence and a taunt,
  off-GCD), Heavy Hand (16, synergy), Unbowed (16), Sweeping Challenge (18, a 120° arc: hit, taunt, −10% armour),
  **Iron Summons** (20: everything within 10 m dragged 3 m in, 220%, 1.5 s stun, taunted).
- **Banner** (the party's standing): Raise the Banner (10, a ground circle: +20% armour and mending for 12 s to
  whoever stands in it), Banner Bearer (11), Stand Together (12, a ward on everyone within 10 m + heals land 20%
  harder on the party), Heavy Standard (12), Hold Fast (14, +50% armour + ward + 20 temper, off-GCD — the Dig In),
  Wide Banner (14, synergy), Guardian Banner (16, a second ground circle: heal + cleanse + armour), Steel Cadence
  (18), Long Standing (18, synergy), **Unbroken Banner** (20: heal, ward, cleanse, +40% armour, +20% heals on
  everyone within 12 m, and 30 temper).

**Rotation at 15** (Sworn Guard, Shield Blow, Rim Strike, Challenge, Intercept, Bellow): Sworn Guard on the Mage
before the pull (whatever reaches them comes to you) → Headlong (Path) → Challenge (free of the global, they are all
on you) → Shield Blow, Shield Blow → Rim Strike the brute → Bellow the shaman from 12 m. Intercept to whoever the
skirmisher picked anyway.

**Rotation at 20** (add Shared Shield, Hold Fast, Sweeping Challenge, Iron Summons / Unbroken Banner by tree):
Raise the Banner where the party will stand → Sworn Guard the healer → pull → Iron Summons when the second pack
arrives (everything within 10 m is in one spot, stunned, on you) → Sweeping Challenge → Shield Blow. Hold Fast
under the shaman's pack; Unbroken Banner when two friends are under half.

**Phone (6):** Shield Blow, Rim Strike, Challenge, Sworn Guard, Intercept, Bellow. Off-GCD Challenge and Bellow at
the ends of the arc; a banner Knight swaps Rim Strike for Stand Together.

---

## Assassin — Rogue → the Rogue

**Fantasy.** Set it up, then cash in. Poisons and bleeds first, a stun, a mark that pays twice, a cut that ends it.
Three trees:

- **Venoms**: Venom Strike (10, 110% + an 8 s poison — the filler), Quick Poisons (11), Blackroot Dart (12, a 20 m
  dart with a 10 s poison — for the thing on the perch), Lingering (12, synergy), Fester (14, a flat poison hit
  that becomes "per dot" when `perDot` lands), Steady Hand (14), Blood and Bile (16, 140% + a 6 s bleed — the
  second dot, from a second skill), Spreading Rot (16, poison on everything within 5 m of the target), Virulence
  (18, synergy), **Plague Knife** (20: 250% to the target, a poison hit and a 10 s plague on everything within 6 m).
- **The Set-up**: Grave Mark (10, 80% + a 20% mark for 8 s — longer and deeper than Notch), Cold Eye (11), Gutting
  Strike (12, 240% — the cash-in), Sap (12, a 2 s stun, off-GCD), The Opening (14, synergy), Throat Cut (14, the
  interrupt + silence, off-GCD), Exposed (16, −20% armour), Deadly Patience (16), Second Mark (18, synergy),
  **Execution** (20: 400%, with the `cond: lowHp` execute rule written on it).
- **Slip Away**: Vanish Step (10, 8 m back + a ward + crit, off-GCD), Soft Boots (11), Decoy (12, a straw-and-cloak
  minion that shouts the pack onto itself for 8 s), Smoke Pouch (12, a 4 m cloud: half speed and 20% softer),
  Hush (14, a 3 s silence from 20 m, off-GCD), Thicker Smoke (14, synergy), Knife Storm (16, 120% to everything
  within 6 m — the pack answer), Shadow Sense (18, dodge), Storm Edge (18, synergy), **Thousand Cuts** (20: a 3 s
  spin of knives, 90% a second to everything within 6 m, all of it bleeding).

**Rotation at 15** (Venom Strike, Gutting Strike, Grave Mark, Sap, Throat Cut, Vanish Step): Grave Mark the brute
→ Venom Strike (poison up) → Gutting Strike → Gutting Strike at 6 s → Venom Strike while the energy comes back →
Grave Mark again at 8 s. Sap the skirmisher that turned on you, Throat Cut the shaman's heal, Vanish Step when the
lynx has a hand on you. ~400 energy over 30 s; the bar is dry on the second Gutting Strike.

**Rotation at 20** (add Blood and Bile, Exposed, Knife Storm, Execution / Plague Knife): Decoy on the pull (the pack
goes for the straw man) → Spreading Rot on the brute (everything near it is poisoned) → Knife Storm → Grave Mark →
Exposed → Gutting Strike → Blood and Bile. Execution on the champion under a third; Plague Knife when the second
pack arrives on the first.

**Phone (6):** Venom Strike, Gutting Strike, Grave Mark, Knife Storm, Sap, Throat Cut. Vanish Step takes Sap's slot
for the player who runs more than they stun (both off-GCD).

---

## Frostbinder — Mage → the Mage

**Fantasy.** Frost then shatter. Everything you touch is slower afterwards, and the big spells are for the things
you already slowed. Three trees:

- **Rime** (shards, bursts, the shatter): Frost Shard (10, a 1.8 s bolt with a 30% slow — the filler), Cold Study
  (11), Rime Burst (12, instant, cast on the move, a 40% slow), Deep Cold (12), Rime Spear (14, 2 s, the big
  single hit, written with `cond: slowed ×1.5`), Sharper Shards (14, synergy), Shatter (16, everything within 5 m of
  the target + a 1 s stagger), Brittle (16), Keen Spear (18, synergy), **Stillfrost** (20: freeze the target 2 s and
  break it for 34 + 16L).
- **Whiteout** (ground that slows and holds): Whiteout (10, a 3 s blizzard on a 5 m circle, 40% slow), Banked Cold
  (11), Ice Wall (12, an 8 m line in front of you that roots — a wall until `wall` lands), Frostbitten (12),
  Blizzard (14, a 7 m circle: hit, 6 s cold, half speed), Wider White (14, synergy), Glacier (16, a 4 m root
  circle), Lasting Cold (18, synergy), Snowblind (18, the control tool: 20% softer and 30% slower on a 6 m circle),
  **Endless Winter** (20: 4 s of winter on an 8 m circle at 40% speed).
- **Stillness** (Spellrush, wards, the freeze, the escape): Ice Ward (10, a ward whose cold slows everything within
  4 m), Winter Skin (11), Spellrush (12, +60% cast speed for 6 s and 20 mana — three fast casts, free, off-GCD),
  Cold Focus (12), Freeze (14, one target solid for 3 s from 25 m), Frost Step (14, 8 m back leaving the ground you
  stood on frozen, off-GCD), Stifling Cold (16, the interrupt + a half-speed slow, off-GCD), Thicker Ice (16,
  synergy), Deep Well (18), **Absolute Zero** (20: a ward, everything within 8 m frozen 2.5 s and bitten, 50 mana;
  off-GCD — the "everything stops but me" button).

**Rotation at 15** (Frost Shard, Rime Burst, Rime Spear, Whiteout, Ice Wall, Stifling Cold): Whiteout on the spot
the pack will cross → Ice Wall across the row as they come through it (the whole line roots) → Frost Shard the
brute → Rime Burst while walking away from the skirmisher → Rime Spear the slowed brute → Frost Ring (Path) when
it closes anyway. Stifling Cold the caster from 25 m.

**Rotation at 20** (add Blizzard, Shatter, Freeze, Spellrush, Stillfrost / Endless Winter): Blizzard → Spellrush →
three Frost Shards in the time of two → Shatter once the pack is bunched and slowed → Freeze the champion → Rime
Spear it → Stillfrost it. Endless Winter on the second pack; Absolute Zero when the first reaches you.

**Phone (6):** Frost Shard, Rime Burst, Rime Spear, Whiteout, Spellrush, Stifling Cold. Ground spells land on the
mouse on desktop and on the target's feet on the phone (the Thunderhead rule).

---

## Stormcaller — Mage → the Stormcaller

**Fantasy.** Shocked targets take more from everything; bolts fork between enemies; orbs circle you; you leave
trouble as a line of lightning. Three trees:

- **Forked** (bolts that chain, the shock mark, the beam): Forked Bolt (10, a 1.5 s bolt that forks into everything
  within 4 m of the target — a pack spell at a bolt's price; `chain` is the wishlist's better form), Charged Mind
  (11), Shock Mark (12, a 15% mark for 8 s), Static (12), Arc Lash (14, instant on the move, the target hits 10%
  softer), Wider Fork (14, synergy), Storm Beam (16, a 3 s beam on one target with a slow), Conductor (16, synergy),
  Overcharge (18), **Chain Tempest** (20: a bolt that jumps the whole pack within 6 m with a stagger).
- **Thunder** (rings, orbs, the tempest): Thunder Ring (10, everything within 5 m hit and staggered half a second —
  the thing to press when they reach you), Long Breath (11), Storm Orbs (12, three storm casters circle you for
  15 s), Thunderhide (12), Thunderclap (14, a 5 m circle with a 1 s stun, lands where you point), Wider Ring (14,
  synergy), Rolling Thunder (16, 3 s on a 6 m circle), Louder Clap (16, synergy), Deep Sky (18), **Eye of the
  Tempest** (20: 4 s of storm on an 8 m circle, 40% slow and a mark).
- **Bolt Step** (mobility, wards of wind, the stunning strike): Bolt Step (10, become the lightning along a 10 m
  line and arrive at the end of it, off-GCD), Light Feet (11), Wind Ward (12, a ward and +15% cast speed while it
  holds), Stormhardy (12), Crackle (14, the interrupt + silence from 25 m, off-GCD), Thunder Fist (14, the stunning
  strike from 8 m), Gale (16, a 5 m circle: half speed and 15% softer), Sure Footing (16, synergy), Hotter Step (18,
  synergy), **Lightning Form** (20: +25% damage, +40% cast speed, a ward, 50 mana, and a stunning burst round you;
  off-GCD).

**Rotation at 15** (Forked Bolt, Shock Mark, Arc Lash, Thunder Ring, Thunderclap, Crackle): Storm Orbs out on the
pull. Thunderclap where the pack will be in two seconds → Shock Mark the brute → Forked Bolt into the middle of the
pack (it forks into all of them) → Arc Lash while walking → Thunder Ring the moment the skirmisher reaches you →
Forked Bolt. Crackle the caster from 25 m.

**Rotation at 20** (add Storm Beam, Rolling Thunder, Thunder Fist, Chain Tempest / Eye of the Tempest): Eye of the
Tempest on the Fighter's spot → Shock Mark → Chain Tempest (it jumps everything standing in the Eye) → Forked Bolt
×2 → Storm Beam the champion → Thunder Fist what reaches you. Lightning Form on the boss; Bolt Step out through
the pack rather than away from it.

**Phone (6):** Forked Bolt, Shock Mark, Thunder Ring, Thunderclap, Bolt Step, Crackle.

---

## Oracle — Healer → the Oracle

**Fantasy.** Sees it coming. The Cleric heals what happened; the Oracle wards what is about to. Three trees:

- **Foresight** (wards before the hit): Foresight (10, an instant ward on one friend every 6 s — the filler),
  Clear Sight (11), Shared Vision (12, a ward on everyone within 10 m), Calm Mind (12), Second Sight (14, synergy),
  Warding Glyph (14, a ground circle that wards and mends whoever stands in it — lands where you point), Thread of
  Fate (16, a big ward + heal + heals land 15% harder on one friend — "takes their damage" when `link` lands), Far
  Sight (16), Lasting Sight (18, synergy), **Seen and Spared** (20: a great ward, +30% armour and a cleanse on
  everyone within 12 m).
- **Omens** (heals that arrive early, cleansing, the revive): Kind Omen (10, heal + 8 s of mending + the overflow
  as a ward), Quick Omen (11), Good Omen (12, an instant mending — cast it before the hit, not after), Steady Hands
  (12), Clear the Fog (14, cleanse + heal, off-GCD), Long Omen (14, synergy), Circle of Omens (16, an instant party
  heal with mending), Read the Bones (16, the revive, 3 s, not mid-fight), Unshaken (18), **Fate Rewritten** (20:
  heal, ward, mending, cleanse, +20% heals on one friend).
- **Prophecy** (bolts of fate, marks, a slow on what is coming): Fate Bolt (10, a 1.5 s shadow bolt that refunds 6
  mana — attacking pays for the wards), Far Seeing (11), Prophecy (12, a 5 m circle where you say the blast falls:
  hit + a 12% mark), Portent (12, the interrupt + silence from 25 m, off-GCD), Sure Doom (14, synergy), What Is
  Coming (14, a 6 m circle: 40% slower and 15% softer), Doom Spoken (16, a 2 s hit that makes the target hit
  softer), Keen Eye (16), Omen of Ruin (18, a 5 m circle of shadow with a withering), **The Last Page** (20: 30 +
  14L shadow, a 1.5 s stun, and a heal round you).

**Rotation at 15, party** (Foresight, Kind Omen, Good Omen, Shared Vision, Clear the Fog, Portent): Shared Vision
before the pull (four wards). Good Omen on the Fighter as Headlong lands. Fate Bolt, Fate Bolt while nobody is
hurt. Foresight on whoever the skirmisher turned toward — before it reaches them. Kind Omen the tank. Portent the
shaman's heal; Clear the Fog the Mage out of the net.

**Rotation at 20, solo** (Fate Bolt, Prophecy, Doom Spoken, Omen of Ruin, The Last Page, Foresight): Prophecy on
the spot the pack reaches → Fate Bolt the brute (marked, so +12%) → What Is Coming when they close → Doom Spoken
the champion → Omen of Ruin → The Last Page the boss. Foresight yourself every 6 s; Shelter (Path) for the
skirmisher that healing threat sends your way.

**Phone (6):** Foresight, Kind Omen, Good Omen, Shared Vision, Clear the Fog, Portent. Solo: Fate Bolt, Prophecy,
Doom Spoken, Omen of Ruin, Foresight, Portent. Ally wards default to the most hurt friend in range when an enemy is
targeted (the Field Mend rule).

---

## Swashbuckler — Rogue → the Swashbuckler

**Fantasy.** Flair rewards variety. Every skill adds its own +4% damage for 8 s and they stack, so the player who
cycles five skills hits 20% harder than the one who mashes one; Grandeur spends the show. Three trees:

- **Flourish** (the thrusts and the sweep): Flourish (10, 120% — the filler), Quick Wrist (11), Pinning Thrust (12,
  180% + a 2 s root), Keen Point (12), Deeper Thrust (14, synergy), Double Thrust (14, two hits of 100%), Sweep (16, a
  120° arc — the pack answer), Showmanship (16, energy), Wider Sweep (18, synergy), **Grand Sweep** (20: 240% to
  everything within 6 m with a stagger, +10% damage after).
- **Panache** (leaps, parries, the turn, the escape): Daring Leap (10, a 12 m leap onto the target, off-GCD),
  Light Boots (11), Mocking Parry (12, a riposte, everything within 6 m comes for you, and you catch the next hits
  on a ward — the Swashbuckler can hold a pack for a few seconds), Nimble (12), Matador's Turn (14, the target
  passes you at half speed and you are 3 m clear), Sure Parry (14, synergy), Cutting Remark (16, a thrown knife and
  a word: the interrupt from 15 m, off-GCD), Bold Front (16), The Exit (18, 10 m back with a ward, off-GCD), **En
  Garde** (20: ward, +50% armour, +15% damage, the pack on you slowed, 40 energy; off-GCD).
- **Grandeur** (variety pays): Feint (10, 90% and −12% armour), Crowd Pleaser (11), Cape Flick (12, 80% and the
  target hits 15% softer), Bravado (12, life on hit), Thrown Dagger (14, 120% from 12 m with a slow), Longer Show
  (14, synergy: Flourish's flair lasts longer), Encore (16, 160% and 15 energy back), Steady Nerve (16), Standing
  Ovation (18, synergy), **Grandeur** (20: 300% to the target and 100% to everything within 5 m with a stagger —
  every flair you carry adds to it).

**Rotation at 15** (Flourish, Pinning Thrust, Feint, Cape Flick, Daring Leap, Mocking Parry): Daring Leap onto the
brute (flair 1) → Feint (2) → Pinning Thrust (3) → Cape Flick (4) → Flourish at +16% (5) → Pinning Thrust again
as it comes off cooldown. Mocking Parry when the skirmishers turn on the Mage: they come to you and the ward takes
the first of it. Cutting Remark the shaman from 15 m. Never the same skill twice in a row — that is the whole class.

**Rotation at 20** (add Sweep, Thrown Dagger, Encore, Matador's Turn, Grandeur / Grand Sweep): Thrown Dagger the
archer → Daring Leap → Feint → Sweep → Cape Flick → Encore (15 energy back) → Matador's Turn out of the brute's
swing → Grandeur at +28%. En Garde when the second pack lands on you; Grand Sweep when they are all inside 6 m.

**Phone (6):** Flourish, Pinning Thrust, Feint, Sweep, Daring Leap, Mocking Parry. The arc is the point: six
different buttons is six flairs.

---

## What the engine must have for wave 2 (and what it has)

Everything in `skills-specs-2.json` runs today; the file's `wishlist` lists twelve items with an exact rule each.
None is a bug this time — the two inherited Path bugs from wave 1 are fixed. The ones worth doing first:

1. **`link`** (Sworn Guard, Bodyguard, Unbreakable Vow, Thread of Fate): a share of the friend's damage paid by the
   caster. Today a ward + taunt circle at the friend (Knight) or ward + heal (Oracle) — both read right.
2. **`flair`** on Grandeur: +15% per distinct skill in the last 8 s, max 5. Today the per-skill +4% buffs do the same
   job at a flat rate.
3. **`chain`** on Forked Bolt / Chain Tempest: a bolt that jumps. Today a 4 m / 6 m circle at the target.
4. **`cond: slowed`** on Rime Spear (the shatter ×1.5), **`cond: lowHp`** on Execution, **`cond: behind`** on
   Gutting Strike, **`perDot`** on Fester — all flat today and sized to be fine flat.
5. **`wall`** on Ice Wall (a line that blocks; a 2 s root today), **`stay`** on the Decoy (it follows the Assassin
   today, taunting as it goes).
6. **dodge / moveSpeed buffs on heroes are read nowhere** — not used in this wave (every parry is a ward), but the
   Path's Slip Step carries a dodge buff that does nothing; one `fxPct(p, 'dodge')` in the hero's resolveHit call.
7. A synergy cannot feed a summon (Storm Orbs, Decoy have none); `who: self` on a heal is still the helpful circle.

---

# Wave 3 (M24) — Necromancer, Warlock, Druid, Weaponmaster, Reckoner, Dusk Priest, Bard

Design by Fable, 2026-11-11. The data is `data/skills-specs-3.json` (listed in `data/skills-specs-index.json`);
the seven `starter` arrays in `data/specs.json` are filled. 216 nodes: 210 tree nodes (30 a spec, three trees of
10, every tree with a node at every gate 10/11/12/14/16/18/20) plus six hidden stance-only actives; 130 actives,
48 passives, 38 synergies. Two hybrids: the **Bard** (Healer OR Rogue) carries `altCost` in energy on every active,
as the Paladin and Spellblade do; the **Druid** (Healer OR Mage) does not, because both of its Paths pay mana and
`costOf` would pick the same number either way.

Same standard as waves 1–2: a filler at 10 in each of the two trees the spec is about (both granted at the pick), an
interrupt of its own off the global cooldown, a defensive, an area answer, a signature, and a capstone at 20 on a
20–90 s cooldown; fillers at 1.1–1.3× a swing or ~1.4× a Path bolt, big hits 2.5–4× on 8–25 s.

**What is new in this wave is the stance that swaps the bar.** The Druid's three shapes, the Weaponmaster's two
stances (and its capstone, a 15 s third stance) and the Bard's three songs are `stance` effects with `bar: [six
ids]`. While one holds, the six action slots become that list (the HUD reads `sb` from the snapshot); the same
stance pressed again leaves it; a skill on the bar counts as known at rank 1 (its learned rank if higher) **once
the hero has reached its level** — `rankOf` gates the bar by `reqLevel`, so a level-10 Druid in Sporecap cannot use
the level-20 Great Bloom just because the shape lists it. Every bar leads with its own stance (the way out). Six
skills exist only on a bar (`hidden: true`, no `tree`, `maxRank` 1, owner and level like the rest): the Briarback's
Maul, the Fenrunner's Rip, and the Weaponmaster's Open/Closed Flurry and Open/Closed Lunge — which is how "lunge and
flurry change with your stance" is done: the neutral Lunge and Flurry sit in the Mastery tree, and each stance's bar
carries its own version instead. A synergy node can still feed a hidden skill (Sharper Fangs → Rip). Stance `stats`
the engine reads are damage, crit, castSpeed, healTaken, threat, armour, dodge and moveSpeed, and `stats.perRank`
ranks them through `atRank` (checked: Briarback rank 5 = +46% armour, +80% threat).

**Other engine features this wave leans on, all live:** `link` (Shared Vigil: a third of a friend's hits land on the
priest — checked, 159 moved in six seconds), `cond: { targetHpBelow }` executes on five finishers, `perDot` on the
Necromancer's lances and the Warlock's Agony, `perTargetHit` crowds, `zone` ground that heals **companions** too
(Grave Mending, Spore Cloud, Circle of Dawn — the helpful zone pool is players + allies, so a thrall standing in it
mends; checked), `heal who: self` drains, `shield.thorns` on every "it stabs back" ward, `spendAll` +
`perResourceSpent` (Settle the Grudge), `weaponOnly: ranged` on the crossbow shots, `summon` pets and minions with
synergy damage feeding them, and moveSpeed / dodge buffs now that they are read.

## Numbers in one table

Rank 1, level 20, before attribute multipliers; baseline 132 per global, a sword swing 35, autos ~63 a global.

| | Per enemy | Per global | Notes |
|---|---|---|---|
| Necromancer: 8 thralls | ~7 a bite each (0.45 of a companion) | ~30/s standing | Bone Colossus 1.6× hp / 1.1× dmg pet on top; Grave Mending 18/s to every body in 6 m |
| Necromancer: Marrow Lance | 120 per 1.5 s, +20% per curse | ~120–192 | Marrowburst 310, +30% per curse, ×1.5 under 35%, every 25 s |
| Warlock: Gnaw + Blight ticking | 24/s + 20/s + 33 on cast | ~44/s + filler | Agony 154 +35% per curse (×2.4 with both); Soul Drain 53/s for 3 s and heals 44/s |
| Warlock: Bound Fiend | 0.95 of a companion, rakes ×1.5 every 6 s | — | Void Hound 1.5/1.1 tank, Fiend Lord 1.8/1.4 with a fire breath |
| Druid: Rip (wolf) | 40 + 18/s bleed | ~63 + 40 + 18/s | Savage Bite 77 (×1.5 under 35%) every 8 s; Fenrunner +25% speed, +10 crit |
| Druid: Thornlash (thorned) | 42 + 46 ward that stabs | taunts every press | Bristle 116 ward +20% armour; Ancient Bark 190 ward, +40% armour, taunt 8 m |
| Druid: Greensap | 112 + 18/s × 6 per 1.5 s | ~150/1.5 s | Spore Cloud 18/s to everyone in 5 m for 8 s; Great Bloom 180 + 27/s on 12 m |
| Weaponmaster: Quick Cut (open) | 44 × 1.12 | ~112 | Open Flurry 3 × 30 every 6 s; Blade Dance 38 each in 5 m; Perfect Edge +25%/+20% crit |
| Weaponmaster: Riposte (closed) | 38 × 0.9 + 68 ward that hits back 44 | ~95 | Iron Counter 77 + stun; Unbroken Guard 190 ward, +40% armour, taunt |
| Reckoner: Brand Bolt + mark | 38, +12% to everything after | ~105 | Judgement Bolt 105 (×1.5 under 35%) + 132 fire in 4 m, every 20 s |
| Reckoner: Settle the Grudge at 100 energy | 70 × (1 + 1.4) = 168 | — | Grudge Cut 42 + 27 self-heal; the hound 0.9 of a companion with an interrupting bite |
| Dusk Priest: Shadow Lance | 109 per 1.5 s + 31 to every friend in 10 m | ~109 | Twinlight 88 + 49 to everyone in 10 m every 6 s; Eventide 288 + 135 heal |
| Dusk Priest: Vigil | ward 114 + 13.5/s × 10, instant, every 6 s | ~100/s of absorb | Shared Vigil: a third of their hits on you; Night Vigil 230 wards on everyone in 12 m |
| Bard: Discord Note | 88, −8% damage on it | ~88 | Ruin Finale 154 to everything in 8 m (+40% crowd) + stun + mark; Song of Ruin −8% on the pack |
| Bard: Mending Verse | 101 + 13.5/s × 6 per 1.5 s | ~120/1.5 s | Soothing Note 46/s × 8 instant; Mending Finale 180 + 27/s + 90 ward on 12 m |

---

## Necromancer — Mage → the Necromancer

**Fantasy.** Every kill is a body to use. Thralls to the eight cap, one colossus on top, bone and curses for your own
hands, and the pyre for whatever is left. Three trees:

- **Thralls**: Raise Thrall (10, two melee thralls that stay, 1.5 s cast, 4 s cooldown — the filler and the opener),
  Dead Calm (11), Bone Warden (12, a tank thrall that rattles the pack onto itself every 6 s), Sharper Bones (12,
  synergy), Grave Mending (14, a 6 m ground circle that heals thralls AND friends 18/s for 8 s), Command the Dead
  (14, −18% armour on the target, off-GCD; the thralls go for whatever you fight), Plague Thrall (16, a thrall that
  bursts poison over a crowd), Grave Hardy (16), Fouler Rot (18, synergy), **Bone Colossus** (20: a pet — not a
  thrall — 1.6× health, 1.1× damage, taunts, crushes, hardens; one at a time).
- **Marrow**: Marrow Lance (10, 120 shadow in 1.5 s, +20% per curse up to +60% — the spell filler), Cold Marrow (11),
  Wither (12, 22/s for 10 s + hits 10% softer), Grave Draught (12, 88 and heal yourself 67), Deeper Marrow (14,
  synergy), Bone Spur (14, the interrupt, off-GCD), Bone Storm (16, 99 to everything in 5 m + a curse on each,
  +40% crowd), Lingering Curse (16, synergy), Siphon (18, 66 and 12 mana back), **Marrowburst** (20: 310, +30% per
  curse to +120%, ×1.5 under 35%, 1.5 s stun).
- **The Pyre**: Corpse Pyre (10, a 4 m ground fire 33/s for 6 s at the pointer), Ash Heart (11), Ember Bones (12,
  110 fire over 5 m + a burn), Quick Rites (12), Unquiet Return (14, the grave-touched revive: back at 40% in a ward
  hitting 15% harder), Hotter Pyre (14, synergy), Pyre Wall (16, a 10 m line of fire + 40% slow), Cinder Shroud
  (16, a 116 ward that burns what hits you), Wider Pyre (18, synergy), **March of the Buried** (20: four of the
  buried for 20 s and 110 fire + slow to everything in 8 m).

**Rotation at 15** (Raise Thrall ×4 → 8 thralls, Bone Warden, Wither, Marrow Lance, Grave Draught, Corpse Pyre):
Raise Thrall before the pull until there are eight → Warden → Corpse Pyre where they will stand → Wither the brute →
Marrow Lance, Marrow Lance → Grave Draught when you are hit → Grave Mending if the thralls are dropping.

**Rotation at 20** (add Plague Thrall, Bone Colossus / Marrowburst / March of the Buried by tree): Colossus up →
Wither + Bone Storm on the pack → Marrow Lance until Marrowburst is worth it (two curses on the target, under 35%).

**Phone (6):** Raise Thrall, Marrow Lance, Wither, Grave Draught, Corpse Pyre, Bone Warden.

---

## Warlock — Mage → the Warlock

**Fantasy.** Curses that pay off the longer they run, a fiend that does the standing in front, and a rift that puts
the pack where you want it. Three trees:

- **Gnawing Dark**: Gnawing Curse (10, 24/s for 12 s + 33, instant — the filler), Dark Study (11), Blight (12, a
  second curse, poison, hits 10% softer), Long Night (12, synergy), Soul Drain (14, 3 s channel: 53/s, heals you,
  4 mana a tick), Patient Dark (14), Spreading Rot (16, 66 + a curse to everything in 6 m — the spread), Deeper
  Gnaw (16, synergy), Agony (18, 154 +35% per curse to +140%), **Soul Pact** (20: +25% damage, +20% cast speed,
  40 mana, and every curse within 8 m flares; free, 60 s — the health cost is on the wishlist).
- **The Fiend**: Bind the Fiend (10, a melee pet that stays, rakes and howls), Fiend's Hide (11), Fouler Fiend (12,
  synergy), Fiend Fire (12, 99 fire + a burn, instant), Sacrifice (14, a 147 ward that burns what hits you + 20
  mana, off-GCD), Fiend's Hunger (14), Void Hound (16, a tank pet in its place), Imps (16, two fire casters for
  20 s), Voidhide (18, synergy), **Fiend Lord** (20: 1.8× health, 1.4× damage, fire breath, taunt, and +15% damage
  for you while it stands).
- **The Rift**: Rift Bolt (10, 120 shadow in 1.5 s), Void Touched (11), Void Rift (12, 6 m at the pointer: pulled 5 m
  to you, 66, slowed), Rift Step (12, a 10 m step with a ward, off-GCD), Wider Rift (14, synergy), Hush (14, the
  interrupt), Collapse (16, 132 to everything in 5 m + 1 s stun, +40% crowd), Rift Sight (16), Deeper Collapse (18,
  synergy), **Blood Burst** (20: 332 + 110 over 6 m + stun + a curse on all of it).

**Rotation at 15** (Bind the Fiend, Gnawing Curse, Blight, Soul Drain, Void Rift, Fiend Fire): Fiend up → Void Rift
on the pack → Gnaw and Blight on everything → Spreading Rot once the brute carries both → Soul Drain when hurt → Fiend
Fire to fill.

**Phone (6):** Gnawing Curse, Blight, Fiend Fire, Soul Drain, Void Rift, Bind the Fiend.

---

## Druid — Healer OR Mage → the Druid

**Fantasy.** Three shapes, and the six slots change with you. Briarback holds the line, Fenrunner tears things
apart, Sporecap heals and lobs spores. Greensap and Lunge work in any shape; Green Return wants your own. The two
fighting shapes hit with your weapon (so a Druid who wants to bite stacks Strength and wears mail); Sporecap heals
with Spirit. Three trees, one a shape:

- **Briarback** (bar: Briarback, Maul, Thornlash, Bristle, Root Stomp, Ancient Bark): the shape (10: +30% armour,
  far more attention, −10% damage and speed), Thick Hide (11), Thornlash (12, 120% + taunt + a small stabbing ward —
  the filler), Bristle (12, a 116 ward that stabs back + 20% armour), Bark Roar (14, a 10 m taunt, hits 10% softer,
  off-GCD), Deeper Thorns (14, synergy), Root Stomp (16, 110% + a 2 s hold on everything in 5 m), Old Growth (16),
  Thornhide (18, synergy), **Ancient Bark** (20: 190 ward, +40% armour, a self-heal, taunt + slow on 8 m).
- **Fenrunner** (bar: Fenrunner, Rip, Hamstring, Savage Bite, Howl, Wild Hunt): the shape (10: +25% speed, +10%
  crit, +10 dodge), Light Paws (11), Lunge (12, 10 m + 80%, any shape), Hamstring (12, 100% + 40% slow), Savage
  Bite (14, 220%, ×1.5 under 35%), Sharper Fangs (14, synergy → Rip), Howl (16, party +10% damage, pack −10%),
  Keen Nose (16), Blood Scent (18, synergy), **Wild Hunt** (20: 160% + a bleed to everything in 6 m, +40% crowd).
- **Sporecap** (bar: Sporecap, Greensap, Spore Cloud, Bloom, Sporeburst, Great Bloom): the shape (10: +15% cast
  speed, +10% armour), Greensap (10, 112 + 18/s × 6 in 1.5 s — any shape), Deep Roots (11), Spore Cloud (12, 5 m
  ground that heals everyone in it 18/s for 8 s, companions too), Mossheart (12), Bloom (14, 78 + cleanse on
  everyone in 8 m), Richer Sap (14, synergy), Sporeburst (16, 88 poison over 5 m + slow + a choke), Green Return
  (18, the revive), **Great Bloom** (20: 180 + 27/s + cleanse + heals land 15% harder on everyone in 12 m).

**Rotation at 15 as a wolf** (Fenrunner, then the bar): Lunge in → Fenrunner → Rip, Rip → Hamstring the runner →
Savage Bite anything under 35% → Fenrunner again to drop out, Greensap whoever is hurt, back in.

**Rotation at 20 as a mushroom** (Sporecap, then the bar): Spore Cloud where the party stands → Sporeburst the pack →
Greensap the tank → Bloom when the poison lands → Great Bloom when two are under half.

**Phone (6, out of shape):** Fenrunner, Briarback, Sporecap, Greensap, Lunge, Green Return — the shapes fill the
rest.

---

## Weaponmaster — Fighter → the Fighter

**Fantasy.** An open stance and a closed one, and a bar that changes with them. Lunge and Flurry are in the Mastery
tree for standing easy; in a stance the bar carries that stance's own Lunge and Flurry instead. Three trees:

- **Open Stance** (bar: Open Stance, Open Flurry, Open Lunge, Quick Cut, Blade Dance, Perfect Edge): the stance (10:
  +12% damage, +6% crit, −15% armour), Quick Hands (11), Quick Cut (12, 125% — the filler), Keen Edge (12), Pierce
  (14, 180% + −15% armour, neutral), Sharper Cut (14, synergy), Blade Dance (16, 110% to everything in 5 m, +40%
  crowd), Measured Breath (16), Faster Dance (18, synergy), **Perfect Edge** (20: +25% damage, +20% crit, 40 temper,
  a 200% stunning sweep).
- **Closed Stance** (bar: Closed Stance, Closed Flurry, Closed Lunge, Riposte, Iron Counter, Unbroken Guard): the
  stance (10: +30% armour, +6 dodge, more attention, −10% damage), Steady Feet (11), Riposte (12, 110% + a ward that
  hits back — the filler), Patience (12), Sweeping Guard (14, 100% in a 120° arc, −15% damage on them, a ward;
  neutral), Sure Riposte (14, synergy), Iron Counter (16, 220% + 1 s stun + a ward), Shield Arm (16), Harder Counter
  (18, synergy), **Unbroken Guard** (20: 190 ward that hits back hard, +40% armour, taunt + slow on 8 m, 30 temper).
- **Mastery**: Lunge (10, 8 m + 100%), Footwork (11), Flurry (12, 3 × 70%), Disarming Cut (12, the interrupt,
  off-GCD), Faster Hands (14, synergy), Weapon Bond (14), Finishing Overhead (16, 260%, ×1.5 under 35%), Second
  Wind (16), Deeper Overhead (18, synergy), **Master of Stances** (20: both at once for 15 s — +15% damage, +8% crit,
  +25% armour, +6 dodge — on a bar of the open flurry, the closed lunge, Quick Cut, Iron Counter and the Overhead).

The hidden pairs: Open Flurry 3 × 85%; Closed Flurry 3 × 60% behind a 68 ward; Open Lunge 150% and −10% armour;
Closed Lunge 90% with a stun and a taunt.

**Rotation at 15** (Open Stance, then the bar): Open Lunge in → Quick Cut, Quick Cut → Open Flurry → Blade Dance
when three are on you. Swap to Closed when the brute turns up: Closed Lunge (stun, taunt) → Riposte → Iron Counter.

**Phone (6, standing easy):** Open Stance, Closed Stance, Lunge, Flurry, Pierce, Disarming Cut.

---

## Reckoner — Rogue → the Demon Hunter

**Fantasy.** Every hit you take is a debt. Brand them, hook them in, tumble clear, set the hound on them, and settle
it all in one blow. Crossbow or blades; the hound interrupts for you. Three trees:

- **The Brand**: Brand Bolt (10, 110% + takes 12% more for 8 s — the filler at range), Hunter's Eye (11), Searing
  Brand (12, 22/s fire for 8 s + 44, instant from 20 m), Long Brand (12, synergy), Double Shot (14, 2 × 90%, needs a
  bow or crossbow), Steady Aim (14), Brand Burst (16, 110 fire over 5 m + slow, +40% crowd), Hotter Brand (16,
  synergy), Pinning Shot (18, 120% + a 2 s hold, ranged), **Judgement Bolt** (20: 300%, ×1.5 under 35%, + 132 fire
  over 4 m).
- **The Hook**: Chain Hook (10, dragged 8 m to you + 80% + slow, from 15 m), Quick Feet (11), Tumbling Shot (12,
  100% then 6 m back behind a ward, off-GCD), Unleash the Hound (12, a pet that bites, interrupts and harries), Hard
  Bite (14, synergy), Snare (14, a 4 m hold at the pointer), Hook and Drag (16, everything in 6 m at the pointer
  dragged to you + slowed), Thick Skin (16), Fury Hound (18, a bigger hound: interrupting bite, a lunge through a
  crowd, a bay), **Night Hunt** (20: +20% damage, +15% crit, +30% speed, 40 energy, two night hounds for 15 s).
- **The Reckoning**: Grudge Cut (10, 120% + a 27 self-heal — the filler up close), Long Memory (11), Take It (12, a
  94 ward that cuts back + 10 energy, off-GCD), Debt Collector (12), Payback (14, 160% + hits 10% softer), Heavier
  Debt (14, synergy), Reckoner's Word (16, the interrupt + a brand, from 15 m, off-GCD), Hard to Kill (16), Grim
  Resolve (18, +30% armour, a heal, a cleanse), **Settle the Grudge** (20: spends every point of energy — 200%
  +2% a point past the cost, ×1.5 under 35%; 3.4× at a full bar).

**Rotation at 15** (Unleash the Hound, Brand Bolt, Searing Brand, Chain Hook, Grudge Cut, Take It): Hound out →
Chain Hook the archer to you → Brand Bolt → Searing Brand → Grudge Cut, Grudge Cut → Take It when the pack turns →
Tumbling Shot clear.

**Phone (6):** Brand Bolt, Grudge Cut, Searing Brand, Chain Hook, Take It, Tumbling Shot.

---

## Dusk Priest — Healer → the Priest

**Fantasy.** Heals by striking: every lance of dusk puts light on your friends, a vigil is paid before the blow, and
the dawn comes for the fallen. Three trees:

- **Twinlight**: Shadow Lance (10, 109 shadow in 1.5 s + 31 to every friend in 10 m — the filler; a solo priest
  clears with it), Dusk Study (11), Twinlight (12, 88 + 49 to everyone in 10 m, instant), Gloaming (12, synergy),
  Dusk Wave (14, 77 in a 90° cone, −10% damage on them, 44 to friends in 8 m), Evenfall (14), Shadow Word (16,
  24/s for 10 s + friends in 10 m mend 11/s), Kindled Shade (16, synergy), Night and Day (18), **Eventide** (20:
  288 + 1.5 s stun, 135 + 27/s to everyone in 12 m).
- **Vigil**: Vigil (10, a 114 ward + 13.5/s for 10 s, instant — the filler), Long Watch (11), Shared Vigil (12,
  `link`: a third of the friend's hits fall on you for 10 s, + a ward), Steady Candle (12), Keep Watch (14, synergy),
  Lamplight (14, a 68 ward on everyone in 10 m), Second Dawn (16, the revive: 40% in a ward, 2 s), Dusk Ward (16,
  cleanse + 78 + heals land 15% harder), Unsleeping (18), **Night Vigil** (20: 230 wards + 27/s + cleanse on
  everyone in 12 m, +20% armour on the party).
- **Dawn**: Dawn Prayer (10, 112 + a small ward in 1.5 s), Morning Calm (11), Mark the Killer (12, 55 + takes 15%
  more for 8 s), Quiet Hands (12), Circle of Dawn (14, 6 m ground at the pointer, 20/s to everyone in it, companions
  too), Brighter Prayer (14, synergy), Hush (16, the interrupt), Wider Circle (16, synergy), Daybreak (18, 89 +
  cleanse on everyone in 10 m), **First Light** (20: 178 + 36/s on everyone in 12 m, and 132 shadow + stun on
  everything in 8 m).

**Rotation at 15** (Vigil, Shadow Lance, Twinlight, Mark the Killer, Shared Vigil, Hush): Vigil on the tank → Mark
the Killer on the brute → Shadow Lance, Shadow Lance (every one heals the party a little) → Twinlight on cooldown →
Shared Vigil when the tank is the one in trouble → Dawn Prayer only when the lances are not enough.

**Phone (6):** Shadow Lance, Twinlight, Vigil, Dawn Prayer, Mark the Killer, Hush.

---

## Bard — Healer OR Rogue → the Bard

**Fantasy.** One song at a time, and the six slots are that song's verses. Valour speeds and strengthens, Ruin curses,
Mending heals everyone near you; each has a finale at 20 on its own bar. Discord Note and Mending Verse work in any
song. From Healer on mana, from Rogue on energy (every active carries both prices). Three trees, one a song:

- **Valour** (bar: Song of Valour, Bold Strike, Marching Verse, War Chorus, Valour Finale, Discord Note): the song
  (10: party +8% damage for 20 s as it opens; you +10% damage, +10% speed while it holds), Quick Tongue (11), Bold
  Strike (12, 120% + 10% crit — the filler), Strong Voice (12), Marching Verse (14, party +25% speed, +10% crit),
  Louder Valour (14, synergy), War Chorus (16, party +15% damage + a ward on everyone in 8 m), Brave Heart (16),
  Sharper Strike (18, synergy), **Valour Finale** (20: a heal, party +25% damage, +20% cast speed, a stunning chord).
- **Ruin** (bar: Song of Ruin, Discord Note, Cursed Verse, Dirge, Ruin Finale, Bold Strike): the song (10: the pack
  within 8 m hits 8% softer as it opens; you +8% crit, +10% cast speed), Discord Note (10, 88 storm + hits 8% softer,
  instant — the filler in any song), Cruel Wit (11), Cursed Verse (12, 22/s shadow for 10 s + hits 10% softer),
  Dirge (14, 77 over 6 m at the pointer + slow), Longer Curse (14, synergy), Jarring Note (16, the interrupt),
  Sharper Note (16, synergy), Cold Reception (18), **Ruin Finale** (20: 154 to everything in 8 m, +40% crowd, stun,
  takes 10% more).
- **Mending** (bar: Song of Mending, Mending Verse, Soothing Note, Lullaby, Chorus of Life, Mending Finale): the song
  (10: everyone in 10 m mends 13.5/s for 10 s as it opens; heals land 10% harder on you), Mending Verse (10, 101 +
  13.5/s × 6 in 1.5 s — any song), Gentle Voice (11), Soothing Note (12, 46/s for 8 s, instant), Lullaby (14, a 2 s
  stun), Kinder Verse (14, synergy), Chorus of Life (16, 89 + cleanse on everyone in 10 m), Steady Breath (16),
  Lasting Chorus (18, synergy), **Mending Finale** (20: 180 + 27/s + a 90 ward + cleanse on everyone in 12 m).

**Rotation at 15** (Song of Valour before the pull, then the bar): Marching Verse → Bold Strike, Bold Strike →
Discord Note the caster → War Chorus when the second pack comes. Stop the song and start Mending when two are hurt:
Mending Verse the tank, Soothing Note the rest, Lullaby the brute.

**Phone (6, between songs):** Song of Valour, Song of Ruin, Song of Mending, Discord Note, Mending Verse, Lullaby.

---

## What the engine must have for wave 3 (and what it has)

Everything in `skills-specs-3.json` runs today; `tests/sim/paths.test.js` fires every active of the seven, and a new
test puts each stance up with NOTHING else learned, fires every skill on its bar, checks the bar is refused before
the stance and after it ends, and checks a level-12 hero in the stance cannot use a bar skill that needs 20. One
engine line changed for that: `rankOf` gates a stance-bar skill by its `reqLevel`. The file's `wishlist` has eleven
items with a rule each. Worth doing first:

1. **The skill-engine revive never fires** (every revive in waves 1–3: Raise the Fallen, Oathbound Rise, Read the
   Bones, Unquiet Return, Green Return, Second Dawn). `run()` stamps `p.lastFight = w.time` before applying effects,
   and `revive` asks `w.time - p.lastFight > 5`. Checked: Second Dawn casts `ok` and the friend stays dead. Rule: read
   `lastFight` into the context before the stamp, or drop the gate for revives that carry a cast.
2. **`healFrom`** as a plain effect key (the legendary rule already exists): Shadow Lance, Twinlight, Dusk Wave,
   Eventide want "the most hurt friend by 40% of the hit"; today each heals everyone in 8–12 m a fixed amount.
3. **`cheatDeath`** on Vigil / Night Vigil (the pre-paid save); a ward + mend today.
4. **A health cost** (Soul Pact, Blood Burst, Sacrifice); free or mana today.
5. **`grudge`** (hits taken as a counter) on Settle the Grudge / Payback; spendAll + 2% per energy today.
6. **`spread`** (copy every dot on the target to the pack) on Spreading Rot / Bone Storm; one curse spreads today.
7. **Buffs that reach minions**: a party buff is read by no ally (Howl's +10% is party-only; Grave Mending is a zone
   because zones DO heal allies). A corpse count for the Necromancer, `wall` for Pyre Wall, and a dimmed stance-bar
   slot for a skill below the hero's level are the rest.

---

# Wave 4 (M26) — Wyrmblood, Tinker, Chronomancer, Spirit Speaker, Hexbreaker, Monk

Design by Fable, 2026-11-11. The data is `data/skills-specs-4.json` (listed in `data/skills-specs-index.json`);
the six `starter` arrays in `data/specs.json` are filled. 181 nodes: 180 tree nodes (30 a spec, three trees of 10,
every tree with a node at every gate 10/11/12/14/16/18/20) plus one hidden stance-only active; 95 actives, 52
passives, 34 synergies. Three hybrids: the **Hexbreaker** (Rogue OR Healer) carries `altCost` in mana and the
**Monk** (Fighter OR Rogue) `altCost` in temper on every active; the **Spirit Speaker** (Healer OR Mage) does not,
because both of its Paths pay mana (as the Druid).

Same standard as waves 1–3: a filler at 10 in each of the two trees the spec is about (both granted at the pick),
an interrupt of its own off the global cooldown, a defensive, an area answer, a signature, and a capstone at 20 on
a 20–90 s cooldown.

**What this wave leans on, all live:**

- **Tempers are stances that swap the bar** (wave 3's engine). Fire Temper and Frost Temper each set the element
  and put that temper's breath, rend and big hit on the six slots; Wyrmfall is on every bar; Wyrm Ascendant is a
  15 s third temper (storm) with its own bar and one hidden Storm Breath. The Monk's Inner Stillness is a stance
  with stats and no bar.
- **Stationary minions.** `stay: true` on a ground-target summon drops the thing at the pointer and it stays there:
  the Tinker's Sentry, Flame Sentry, Bait Sentry, Twin Sentries and Siege Engine (a pet, so the sentries stay) and
  the Spirit Speaker's Striking Post and Great Post. Checked: a sentry shoots from where it was put while its
  Tinker walks 20 m off (it drifts a few metres when a pack walks through it — separation steering, not following).
  The healing posts are `zone`s, which already reach companions.
- **Bolts that jump.** Spirit Bolt carries `chain: { jumps: 2, range: 6, falloff: 0.7 }` (checked: 156 → 109 →
  76 on three brutes in a line), A Thousand Spirits five jumps at 0.8.
- **`cond: { slowed }`** on Frost Rend, Winter Heart, Unravel and Heat Death — the Chronomancer and the frost
  Wyrmblood pay off their own slows.
- **Poise is the flair trick.** Every Monk strike ends with `buff damage 3% 8 s` under its own skill id, so
  different strikes stack and the same one refreshes (checked: Open Palm → Sweeping Heel → Twin Palms → Open Palm
  = +9%), and Ninefold Staff reads the sum the way every weapon hit does.

## Numbers in one table

Rank 1, level 20, before attribute multipliers; baseline 132 per global, a sword swing 35, autos ~63 a global.

| | Per enemy | Per global | Notes |
|---|---|---|---|
| Wyrmblood: Fire Rend (fire temper) | 49 × 1.1 + 20/s burn | ~117 + 20/s | Fire Breath 88 + 15.5/s in a cone every 6 s; Pyre Heart 154 + 31/s on 6 m, +20% damage |
| Wyrmblood: Frost Rend (frost temper) | 45 + 55 frost (×1.5 on the slowed = 83) | ~110 | Glacier Slam 70 + hold + 88 over 4 m; Winter Heart 132 (×1.5) + hold on 8 m + 185 ward |
| Wyrmblood: Dragonscale | ward 116 that throws 33 storm back, +15% armour | — | Wyrmfall 42 to everything in 4 m where you land, every 15 s |
| Tinker: Clockwork Bolt | 35 + 44 storm | ~79 | Overwound Bolt 2 × 42 + 66 every 10 s; Clockwork Barrage 3 × (28 + 55 + 66 over 3 m) |
| Tinker: Sentry | 0.55 of a companion, a shot a swing, 30 s | ~12/s each | Twin Sentries two at once; Siege Engine 1.5× hp / 1.3× dmg with a fire shell |
| Tinker: Flask Grenade | 99 fire + 15.5/s × 5 on 4 m | — | Frost Flask 77 + 40% slow; Smoke Canister −50% speed, −20% damage on 4 m |
| Chronomancer: Quick Bolt | 109 per 1 s cast | ~109 (×1.25 under Quicken) | Double Time 2 × 88 instant every 8 s; Borrowed Time +50% cast speed for 10 s |
| Chronomancer: Decay + Unravel | 22/s × 10 then 132 (×1.5 slowed = 198) | — | Entropy Field −40% speed + 22/s on 6 m for 8 s; Heat Death 176 (×1.5) on 8 m |
| Chronomancer: Stasis Lock | 2 s stun then +25% taken for 6 s | — | Stop the Clock: 2.5 s stun + 110 on everything in 10 m, 40 mana back |
| Spirit Speaker: Spirit Bolt | 120, then 84, then 59 on the jumps; 27 to every friend in 10 m | ~120–263 | A Thousand Spirits 242 jumping five times + 112 and 22.5/s to everyone in 12 m |
| Spirit Speaker: Mending Post | 15.8/s to everyone within 6 m of it for 15 s | — | Striking Post 0.6 of a companion for 20 s; Great Post both, 25 s, bursts storm over 4 m |
| Spirit Speaker: Spirit Mend | 112 + 18/s × 6 per 1.5 s | ~150/1.5 s | Call Back the Spirit: back at FULL health, 3 s, every 2 min |
| Hexbreaker: Silver Edge | 42 + 33 silver | ~75 | Silver Bolt 45 + 44 + 1.5 s silence every 6 s; Silver Judgement 105 (×1.5 under 35%) + 132 + 2 s silence |
| Hexbreaker: Null Circle | nothing in 6 m casts for 8 s, 10.5/s | — | Iron Net hold + silence 2 s on 4 m; Dead Silence 3 s silence + stun on 8 m + 140 ward |
| Monk: Open Palm, three strikes of poise | 42 × 1.09 | ~109 | Mountain Fist 84 + 1.5 s stun every 12 s; Ninefold Staff 77 each in 6 m (+50% crowd) × poise |
| Monk: Iron Body (stillness) | ward 116 that hits back 33, +20% armour | — | Inner Stillness +20% armour, +10 dodge held; Still Mountain 190 ward, +40% armour, taunt |

---

## Wyrmblood — Fighter → the Dragon Knight

**Fantasy.** Pick a temper and everything follows it. Fire burns and hits harder; frost slows, holds and armours;
the scales throw back what hits you; and at 20 a third temper, storm, for fifteen seconds. Three trees, two of
them tempers:

- **Fire Temper** (bar: Fire Temper, Fire Breath, Fire Rend, Wyrmfall, Cinder Rush, Pyre Heart): the temper (10:
  +10% damage, +5% crit), Hot Blood (11), Fire Breath (12, 88 fire + a burn in a 90° cone), Hotter Breath (12,
  synergy), Fire Rend (14, 140% + 20/s burn — the filler), Wyrm Eye (14), Cinder Rush (16, 10 m rush landing 88
  fire over 4 m), Long Burn (16, synergy), Furnace (18), **Pyre Heart** (20: 154 + 31/s on everything in 6 m, +40%
  crowd, +20% damage for 10 s).
- **Frost Temper** (bar: Frost Temper, Frost Breath, Frost Rend, Wyrmfall, Glacier Slam, Winter Heart): the temper
  (10: +15% armour, +5 dodge), Cold Scales (11), Frost Breath (12, 77 frost + 40% slow in a cone), Wider Breath
  (12, synergy), Frost Rend (14, 130% + slow + 55 frost ×1.5 on the slowed — the filler), Thick Scales (14),
  Glacier Slam (16, 200% + 2 s hold + ice over 4 m), Deeper Frost (16, synergy), Winter Hide (18), **Winter
  Heart** (20: 132 frost ×1.5 on the slowed + a 2 s hold on everything in 8 m, and a 185 ward).
- **Scales**: Dragonscale (10, a 116 ward that throws storm back, +15% armour — any temper), Wyrm Heart (11),
  Wyrmfall (12, a 12 m leap: 120% + stun over 4 m — on every bar), Jaw Snap (12, the interrupt, off-GCD), Harder
  Scales (14, synergy), Wyrm Hunger (14), Tail Sweep (16, 100% through 150° and 3 m of knockback), Quick Tail
  (16), Heavier Fall (18, synergy), **Wyrm Ascendant** (20: the storm temper for 15 s — +15% damage, +8% crit,
  +20% armour, 15% faster — on a bar of Storm Breath (hidden), both rends, Wyrmfall and Tail Sweep, opening with
  132 storm + a stun on 8 m).

**Rotation at 15** (Fire Temper, then the bar): Wyrmfall in → Fire Breath across the pack → Fire Rend, Fire Rend →
Cinder Rush to the archer. Swap to Frost for the brute: Frost Breath → Frost Rend (the frost half pays ×1.5 on what
the breath slowed) → Glacier Slam. Dragonscale from either bar before the pull is not possible — it is on the
neutral bar, so raise it and THEN pick a temper.

**Phone (6, no temper):** Fire Temper, Frost Temper, Dragonscale, Wyrmfall, Jaw Snap, Tail Sweep.

---

## Tinker — Rogue → the Tinker

**Fantasy.** Gadgets. Bolts that go off twice, two flasks, sentries that stand where you drop them, a line to reel
yourself in on, a watch that patches you up, and a battery for the party. Three trees:

- **Clockwork**: Clockwork Bolt (10, 100% + 44 storm a moment later — the filler), Steady Hand (11), Flask Grenade
  (12, 99 fire + burn on 4 m at the pointer), Tighter Spring (12, synergy), Frost Flask (14, 77 frost + 40% slow),
  Keen Sight (14), Scattershot (16, 90% to everything in a 60° cone, ranged), Bigger Flask (16, synergy),
  Overwound Bolt (18, 2 × 120% + 66 storm), **Clockwork Barrage** (20: 3 s channel of bolt + charge + a flask over
  3 m each second).
- **Sentries**: Deploy Sentry (10, a crossbow on legs where you point, 30 s — the opener), Spare Parts (11), Oil
  Can (12, synergy → every Sentry), Flame Sentry (12, a burner that gouts over 3 m), Bait Sentry (14, a drum that
  turns everything in 6 m on it for 10 s), Brass Ribs (14), Twin Sentries (16), Hotter Burner (16, synergy),
  Insulation (18), **Siege Engine** (20: 1.5× hp / 1.3× dmg pet where you point, 30 s, with a fire shell — the
  sentries stay because it is the pet slot).
- **Contraptions**: Grapple Line (10, reel 12 m to the target + 70%), Spring Heels (11), Pocket Watch (12, 90 +
  18/s × 8 on yourself, instant), Light Frame (12), Spring Battery (14, party +20% cast and move speed), Better
  Watch (14, synergy), Smoke Canister (16, −50% speed −20% damage on 4 m), Jammer (16, the interrupt from 20 m),
  Fast Crank (18), **Overclock** (20: +20% damage, +15% crit, +25% cast speed, 40 energy, a 140 ward).

**Rotation at 15** (Deploy Sentry, Clockwork Bolt, Flask Grenade, Frost Flask, Bait Sentry, Pocket Watch): Sentry
where the fight will be → Bait Sentry in front of it → Frost Flask on the pack → Flask Grenade on top → Clockwork
Bolt, Clockwork Bolt → Pocket Watch when something gets through.

**Phone (6):** Clockwork Bolt, Flask Grenade, Deploy Sentry, Bait Sentry, Pocket Watch, Grapple Line.

---

## Chronomancer — Mage → the Chronomancer

**Fantasy.** Bends the clock: faster for you and the party, slower for them, a step back when it goes wrong, and a
stopped clock when it all needs to land at once. Three trees:

- **Quicken**: Quick Bolt (10, 109 storm in a 1 s cast — the filler), Fast Hands (11), Quicken (12, +25% cast
  speed +20% move speed for 10 s), Sharper Tick (12, synergy), Second Hand (14, the same for the party at 15%),
  Studied Clock (14), Double Time (16, 2 × 88 instant), Long Hours (16), Longer Quicken (18, synergy), **Borrowed
  Time** (20: +50% cast speed, +20% damage, 50 mana, a ward).
- **Entropy**: Decay (10, 22/s for 10 s + 20% slow, instant — the other filler), Deep Well (11), Entropy Field (12,
  6 m at the pointer: −40% speed + 22/s for 8 s), Cold Eye (12), Unravel (14, 132 ×1.5 on the slowed), Wider
  Field (14, synergy), Time Rot (16, 88 + slow + decay on 5 m), Faster Decay (16, synergy), Weathered (18),
  **Heat Death** (20: 176 ×1.5 on the slowed on 8 m, −60% speed, −20% damage).
- **Stasis**: Stasis Lock (10, 2 s stun then +25% taken for 6 s), Patient Heart (11), Rewind (12, 112 back + ward
  + cleanse + 6 m back), Hiccup (12, the interrupt), Further Back (14, synergy), Slipped Second (14), Time Lock
  (16, a 2 s hold on 5 m at the pointer), Echo (16, 110 now + 50/s × 4), Quick Step (18), **Stop the Clock** (20:
  2.5 s stun + 110 on everything in 10 m, 40 mana back, +30% cast speed).

**Rotation at 15** (Quick Bolt, Decay, Entropy Field, Unravel, Stasis Lock, Rewind): Entropy Field on the pack →
Decay on the brute → Quicken → Quick Bolt, Quick Bolt → Unravel while the field holds them (×1.5) → Stasis Lock the
caster → Rewind when they reach you.

**Phone (6):** Quick Bolt, Decay, Entropy Field, Unravel, Stasis Lock, Rewind.

---

## Spirit Speaker — Healer OR Mage → the Shaman

**Fantasy.** Plant spirit posts: one heals everyone near it, one strikes, the Great Post does both. Bolts that jump
from foe to foe and put a little light on your friends as they leave. From Healer or Mage, mana either way. Three
trees:

- **Posts**: Mending Post (10, 6 m at the pointer, 15.8/s to everyone in it for 15 s, companions too — the
  opener), Spirit Well (11), Striking Post (12, a caster minion that stands where it is put, 20 s), Old Songs
  (12), Angrier Post (14, synergy), Rooting Post (14, −40% speed + 22/s on 5 m for 6 s), Cleansing Post (16,
  heals and cleanses everyone in 6 m every 2 s), Deeper Roots (16, synergy), Wide Spirit (18), **The Great Post**
  (20: a striking post that also bursts storm over 4 m AND a heal zone 8 m across, 25 s).
- **Spirit Bolts**: Spirit Bolt (10, 120 storm jumping twice + 27 to every friend in 10 m — the filler), Loud
  Spirit (11), Spirit Lash (12, 88 + heals you 44, instant), Sharper Bolt (12, synergy), Ancestor's Word (14, the
  interrupt), Keen Spirit (14), Spirit Storm (16, 99 on 5 m + slow, friends in 10 m healed), Quick Words (16),
  Kinder Bolt (18, synergy on the light), **A Thousand Spirits** (20: 242 jumping five times + 112 and 22.5/s to
  everyone in 12 m).
- **The Calling**: Warding Spirits (10, a 68 ward on everyone in 10 m), Stout Heart (11), Spirit Mend (12, 112 +
  18/s × 6), Spirit Skin (12), Stronger Wards (14, synergy), Spirit Walk (14, 8 m with a ward, off-GCD),
  Cleansing Spirit (16, cleanse + 78 + heals land harder), Call Back the Spirit (16, the revive — at FULL health,
  3 s, 2 min), Longer Mend (18, synergy), **Ancestral Tide** (20: 178 + 36/s + 90 ward + cleanse on everyone in
  12 m).

**Rotation at 15** (Mending Post, Striking Post, Spirit Bolt, Spirit Lash, Spirit Mend, Ancestor's Word): Mending
Post where the party will stand → Striking Post beside it → Spirit Bolt, Spirit Bolt (every one heals a little) →
Spirit Lash when you are hit → Spirit Mend the tank → Ancestor's Word the shaman.

**Phone (6):** Spirit Bolt, Spirit Mend, Mending Post, Striking Post, Spirit Lash, Warding Spirits.

---

## Hexbreaker — Rogue OR Healer → the Witch Hunter

**Fantasy.** Silver strips magic. Pins that root, nets that silence, a circle no spell crosses, and a writ that
sends the whole party after one target. Blade or crossbow; from Rogue on energy, from Healer on mana. The extra
damage to the unholy is on the wishlist (`cond: family`); the silver burn is flat today. Three trees:

- **Silver**: Silver Edge (10, 120% + 33 silver — the filler), True Eye (11), Silvered Pin (12, 100% + 2 s hold),
  Keener Silver (12, synergy), Silver Bolt (14, 130% + 1.5 s silence + 44), Strong Arm (14), Quicksilver (16, 2 ×
  80% + 10% crit), Longer Pin (16, synergy), Quick Hands (18), **Silver Judgement** (20: 300% ×1.5 under 35% +
  2 s silence + 132).
- **The Null**: Hush Bolt (10, the interrupt + 1.5 s silence from 15 m, off-GCD), Warded Skin (11), Iron Net (12,
  hold + silence 2 s on 4 m at the pointer), Light Step (12), Null Circle (14, nothing in 6 m casts for 8 s), Wider
  Circle (14, synergy), Silver Dart (16, 120% from 15 m, −15% damage), Iron Will (16), Tighter Net (18, synergy),
  **Dead Silence** (20: 3 s silence + stun + 110 on everything in 8 m, a 140 ward).
- **The Writ**: Writ of Guilt (10, +20% taken for 10 s), Long Road (11), Cleansing Rite (12, cleanse + 78 on a
  friend from 20 m), Blood Price (12), Longer Writ (14, synergy), Silver Ward (14, a 94 ward that cuts back, +15%
  armour), Hunter's Call (16, +10% taken on the target and +10% damage for the party), Mail and Faith (16), Kinder
  Rite (18, synergy), **Rite of Purging** (20: 132 silver on every foe in 8 m + 2 s silence − 20% damage, and
  every friend there healed and cleansed).

**Rotation at 15** (Silver Edge, Silvered Pin, Hush Bolt, Iron Net, Null Circle, Writ of Guilt): Null Circle on the
casters before the pull → Writ of Guilt on the brute → Silvered Pin the runner → Silver Edge, Silver Edge → Hush
Bolt anything that starts a cast outside the circle → Iron Net when the second pack arrives.

**Phone (6):** Silver Edge, Silvered Pin, Hush Bolt, Iron Net, Writ of Guilt, Cleansing Rite.

---

## Monk — Fighter OR Rogue → the Monk

**Fantasy.** Every palm strike, step and sweep builds poise, and the staff spends it in a widening spin. From Rogue
on energy, from Fighter on temper. Three trees:

- **Open Palm**: Open Palm (10, 120% + poise — the filler), Quick Hands (11), Wind Step (12, 8 m to the target and
  every hit a critical for 3 s), Firmer Palm (12, synergy), Twin Palms (14, 2 × 80%), Clear Eye (14), Flying Knee
  (16, 160% + 1 s stun), Light Feet (16), Second Palm (18, synergy), **Hundred Palms** (20: 5 × 60% + 10% damage
  for 10 s).
- **Stillness**: Inner Stillness (10, a stance: +20% armour, +10 dodge, −5% damage; no bar), Rooted (11), Still
  Breath (12, 90 back + cleanse, instant), Iron Skin (12), Iron Body (14, a 116 ward that hits back, +20% armour),
  Harder Body (14, synergy), Calm Centre (16, the interrupt), Deep Lungs (16), Slow Pulse (18), **Still Mountain**
  (20: 190 ward that hits back hard, +40% armour, a heal, taunt + slow on 6 m).
- **Ninefold**: Sweeping Heel (10, 100% through 120° + slow), Hard Shin (11), Staff Line (12, 110% down an 8 m
  line + a short stun), Steady Mind (12), Mountain Fist (14, 240% + 1.5 s stun), Wider Heel (14, synergy), Leg
  Sweep (16, 90% + 1.5 s hold on 4 m), Heavier Fist (16, synergy), Longer Line (18, synergy), **Ninefold Staff**
  (20: 220% to everything in 6 m, +50% crowd, stun — every strike of poise counts on each hit).

Poise: every strike in Open Palm and Ninefold ends with +3% damage for 8 s under its own name, so Open Palm →
Sweeping Heel → Twin Palms is +9% and a fourth Open Palm only refreshes the first. Variety is the rotation.

**Rotation at 15** (Open Palm, Wind Step, Sweeping Heel, Staff Line, Mountain Fist, Twin Palms): Wind Step in (sure
crits for 3 s) → Mountain Fist → Sweeping Heel → Staff Line → Twin Palms → Open Palm, with four strikes of poise on
by the fifth global. Inner Stillness up for the brute.

**Phone (6):** Open Palm, Twin Palms, Sweeping Heel, Mountain Fist, Wind Step, Inner Stillness.

---

## What the engine must have for wave 4 (and what it has)

Everything in `skills-specs-4.json` runs today; `tests/sim/paths.test.js` fires every active of the six, and the
stance-bar test now also covers the Wyrmblood's three tempers. The file's `wishlist` has nine items with a rule
each. Worth doing first:

1. **`cdRefund`** (Quicken, Second Hand, Borrowed Time): the Chronomancer hastens casts today, not cooldowns.
2. **`rewind`** (a 6 s ring of position + health per hero) and **`stasis`** (bank the damage, land it when the hold
   ends) — Rewind is heal + ward + cleanse + 6 m back today, Stasis Lock a stun + a mark.
3. **`cond: family`** (silver ×1.3 against the Restless and casters) on the Hexbreaker's silver; flat today.
4. **`nextHitCrit`** on Wind Step (one sure critical, not three seconds of them); **`flair`** for poise.
5. **`healFrom`** again (Spirit Bolt, Spirit Storm, A Thousand Spirits), as waves 3's Dusk Priest.
6. A **stationary minion gets shoved** by separation steering when a pack walks through it (4 m in the check); a
   `stay` minion should hold its spot or step back to it, and a bait sentry should shout at its drum's radius, not
   its reach.
