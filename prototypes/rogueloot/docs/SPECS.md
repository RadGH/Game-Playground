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
