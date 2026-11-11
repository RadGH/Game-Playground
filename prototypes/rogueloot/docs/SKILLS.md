# Rogueloot — the four Paths (levels 3–10)

Design by Fable, 2026-11-10. The data is `data/skills-paths.json`; the engine vocabulary it is written in is
the M9 one (nothing outside it, the `wishlist` at the bottom of the file lists eight engine additions with
the exact rule for each). This page is the plain-language version: what each Path feels like, what you press,
where every node sits, and which legendary power touches which skill.

Rulings this leans on: Path at 3 and Spec at 10 (2, 29); 1.5 s global cooldown, cast bars, auto-attack and a
resource per Path (3); D2-style trees of 8–10 nodes with ranks 1–10, Spec skills replacing Path skills (10); six
skill buttons in an arc on the phone (21); potions do the regen, not the character (23); armour/resists/block/dodge
and the level-gap hit chance (41); light threat with taunts and no required trinity (42); the six monster roles
(45); bosses with interruptible big casts (46).

## The shape every Path shares

Each tree has 10–11 nodes across level gates 3 to 10, and each Path gets the same five tools in its own
colour, so a player who has played one Path can read the others:

| Tool | Fighter | Rogue | Mage | Healer |
|---|---|---|---|---|
| Bread and butter | Deep Gash | Notch → Back Cut / Long Draw | Cinder Bolt | Mend / Sunlash |
| Area | Wide Swing | Knife Fan | Frost Ring, Thunderhead | Radiance, Noon Flare |
| Interrupt / control | Hard Stop | Hush Knife | Stifle | Rebuke |
| Defensive | Dig In | Slip Step | Ward, Shift | Shelter, Clear Water |
| Signature | Breaker Blow (the rage dump) | Notch (the mark everyone hits harder through) | cast / instant / channel while kiting | Sunlash pays for the heals; Sanctify's light |

Every interrupt is **off the global cooldown**, so you never have to choose between stopping the shaman's heal
and doing your rotation; it costs a little resource and has its own 10–20 s cooldown instead. Every dash is off
the global cooldown too.

**Two starters free at level 3.** The Path pick grants the two level-3 nodes at rank 1, so the first fight after
the choice already plays like the Path. The player then has ~2 points in hand (levels 2 and 3) plus any quest
points, and will reach level 10 with ~12–13 points for 10–11 nodes with ten ranks each — you cannot max
anything, which is the D2 feeling: a rank-6 Deep Gash with a rank-1 Wide Swing is a different Fighter from the
reverse.

**After level 10** the Spec's three trees replace these as the main kit (ruling 10). That is why every tree is
written so that its cheap utilities stay worth a button at level 20: an off-cooldown interrupt (Hard Stop, Hush
Knife, Stifle, Rebuke), a dash (Headlong, Slip Step, Shift), a shield (Ward, Shelter, Dig In), a party buff
(Rallying Roar), a mark (Notch), a cleanse (Clear Water). The big damage nodes are what the Spec outgrows.

## Balance in one table

The target (docs/BESTIARY.md baseline) is **12 + 6L damage per global cooldown** for a level-L hero with on-level
gear in a good rotation: 30 at level 3, 42 at level 5, 72 at level 10. A one-hand weapon does `4 + 1.5L + 0.02L²`
damage a second; a sword swings 1.2 a second, so one sword swing is 10 at level 5 and 17.5 at level 10, and
auto-attacks alone are ~31 per global at level 10. Numbers below are rank 1, level 10, before attribute
multipliers (a caster with 35 points in Intellect has ×1.42 spell power; a Fighter with the same in Strength has
×1.42 melee power — they cancel out of the comparison).

| | Per enemy | Per 1.5 s global | Notes |
|---|---|---|---|
| Fighter: autos + Deep Gash (one target) | 31 + 12 + 99 bleed over 9 s | ~65 | Breaker Blow every 4th global at 52 lifts the average to ~72 |
| Fighter: Wide Swing vs 4 | 15.75 each | 63 + autos | 90% of one swing per enemy = 56% of single-target per enemy |
| Rogue (dagger): autos + Notch + Back Cut | 31 + 12 + 29 (×1.12 through Notch) | ~70 | poison on the brute adds 9/s |
| Rogue (bow): Long Draw | 67 per 1.5 s cast | ~67 (+10% Notch) | the 1.5 s cast stops autos, same as a Mage |
| Mage: Cinder Bolt | 70 per 2.0 s cast | 52, 73 with Quick Hands at rank 5 | Storm Lance 41 instant on the move |
| Mage: Thunderhead vs 4 | 26 a second ×3 | 52 per enemy per global | ~70% of a Cinder Bolt per enemy, the AoE ceiling |
| Mage: Frost Ring vs 4 | 30 each + half speed 5 s | 120 total | more a kiting tool than damage |
| Healer: Sunlash | 53 per 1.5 s | 53, refunds 5 mana | a Healer alone kills ~25% slower than a Mage |
| Healer: Mend | 60 per 2.0 s | 45 a global, 30 a second | a same-level pack of 4 does ~22 a second to a mail tank |
| Healer: Radiance vs 4 allies | 45 each | 180 total every 10 s | |
| Healer: Sanctify | 12.5 a second for 8 s | 100 per ally standing in it | |

Costs are set so a Path runs flat out for ~30 seconds and then runs lean (ruling 23): a Fighter banks ~13 rage a
global in a pack fight and spends 15–20 a global with a 40 every third or fourth; a Rogue has 100 + 300 energy
across 30 s against ~390 of a full rotation; a Mage with ~300 mana and 3.5 regen has ~400 across 30 s against
~20 casts at 14–32. The passives `Long Grudge`, `Deep Study` and `Quiet Prayer` are the "I want to go longer"
picks, and they cost ranks that would otherwise be damage.

Per-swing skills favour slow weapons (a maul swing is 2.3× a dagger swing, so a ×3.0 Breaker Blow on a maul
is 93 against 39 on a dagger). That is the vanilla-WoW rule and it reads well — the big weapon hits big — but the
bot sim will put mauls on top; the `wishlist` has the one-line `normalise` fix if the owner does not want it.

---

## Fighter — Iron Line

**Fantasy.** The wall that hits back. You start a fight with an empty bar, Headlong into it, and every blow you
land (+4) or take (+3) puts rage in your blood. Spend it on wide swings; when it is near full, put it all into one
breaking blow. You can tank — Hard Stop taunts, Rallying Roar makes the pack hit softer, Dig In holds you up — but
a party of four Fighters works too (ruling 42: no trinity). Mail now, plate at ten.

**Resource.** Rage 0–100, +4 per weapon hit dealt, +3 per hit taken, decays 1 a second out of combat. Headlong
front-loads 15. In a 4-monster fight a sword Fighter makes ~9 a second.

### Nodes

| Lvl | Node | Kind | Needs | What it does |
|---|---|---|---|---|
| 3 | **Headlong** (`fighter_charge`) ★ | active, off-GCD, cd 14 | — | Rush the target from 20 m, hit it for 50% weapon (+10%/rank), gain 15 rage (+3/rank). 5 ranks. |
| 3 | **Deep Gash** (`fighter_rend`) ★ | active, 15 rage | — | 70% weapon (+5%/rank) and a physical bleed of 2 + 0.9×L a second for 9 s (+0.3/+0.08 per rank). Your filler on anything that lives more than 5 s. |
| 4 | **Wide Swing** (`fighter_cleave`) | active, 20 rage | Deep Gash | 90° cone, 4 m: 90% weapon (+6%/rank) to each enemy. The pack answer. |
| 5 | **Hard Stop** (`fighter_shield_slam`) | active, off-GCD, 10 rage, cd 10 | Headlong | 80% weapon (+10%/rank), interrupts (3 s lock, +0.25/rank) and taunts. A shield boss or a pommel — no shield required. 5 ranks. |
| 5 | **Scar Tissue** (`fighter_scar_tissue`) | passive | — | armourPct +4%, +2%/rank (22% at 10). |
| 6 | **Rallying Roar** (`fighter_war_cry`) | active, free, cd 25 | Hard Stop | Party +8% damage (+2/rank) for 10 s; enemies within 8 m hit 10% softer (+2/rank) for 6 s. 5 ranks. |
| 7 | **Breaker Blow** (`fighter_breaker_blow`) | active, 40 rage, cd 8 | Wide Swing | 300% weapon (+15%/rank) and −15% armour (+1/rank) on the target for 8 s. The signature. |
| 8 | **Long Grudge** (`fighter_long_grudge`) | passive | Deep Gash | rageGen +10%, +5%/rank. |
| 9 | **Follow Through** (`fighter_follow_through`) | synergy | Wide Swing | Wide Swing +6% damage per rank. |
| 10 | **Dig In** (`fighter_dig_in`) | active, off-GCD, free, cd 30 | Scar Tissue | +40% armour (+5/rank) and a shield of 12 + 3×L for 8 s, and 20 rage. 5 ranks. |

★ = granted free at the Path pick.

**Tree layout.** Two roots at 3. The left line is the damage line — Deep Gash → Wide Swing → Breaker Blow, with
Follow Through hanging off Wide Swing and Long Grudge off Deep Gash. The right line is the control line —
Headlong → Hard Stop → Rallying Roar. Scar Tissue stands alone at 5 and is the gate to Dig In at 10. A damage
Fighter at 10 has spent most ranks in Deep Gash / Wide Swing / Breaker Blow; a tank Fighter has Scar Tissue high,
Rallying Roar, Dig In and a rank-1 Breaker Blow for the armour crack.

**Rotation at level 5** (Headlong, Deep Gash, Wide Swing, Hard Stop; ~2–4 points spent): Headlong in (15 rage).
Deep Gash the brute. Auto-attack until 20 rage, Wide Swing when three stand in the cone, otherwise Deep Gash
again when the bleed is about to drop. Hard Stop the caster the moment its cast bar appears — it is off the
global, so nothing is lost.

**Rotation at level 10** (add Rallying Roar, Breaker Blow, Dig In): Headlong → Rallying Roar on the pull (free,
and the pack is now cowed) → Deep Gash the brute → Wide Swing twice → by now the bar is at 40–50: Breaker Blow →
Wide Swing / Deep Gash to taste → Breaker Blow again at 40. Hard Stop every cast you see. Dig In when the
shaman's pack has you under half. Against a leader at 25% (it is about to run for help): Headlong is off
cooldown by then — catch it, Hard Stop, Breaker Blow.

**On the phone** (6 buttons): Deep Gash, Wide Swing, Breaker Blow, Hard Stop, Headlong, Rallying Roar. Dig In
replaces Rallying Roar for the player who tanks. The big attack button is the auto-attack; Headlong and Hard Stop
are off-GCD so the arc never feels locked.

**Legendaries:** Oxhide Grip → Wide Swing (cone becomes a full circle at 85%); Ramhorn → Hard Stop (adds 3 m
knockback + 1 s stun, +2 s cooldown — the base skill deliberately has no stun, so the legendary is the whole
difference); Standard of the Wall → Rallying Roar (allies also get +20% armour); Chaser's Greaves → Headlong
(2 charges, a kill refunds one); Grudge Edge → Deep Gash (bleed lasts twice as long and jumps on death).

---

## Rogue — Knifework

**Fantasy.** Set it up, then finish it. Notch a target so that everyone's blows go deeper for 8 seconds, then
cut it from behind — or stand back with a bow and draw to the ear. Energy comes back on its own at 10 a second
whatever you do; the skill is in spending it well and in being behind the thing you are cutting. Two lines live
in one tree: a **knife** rogue (Back Cut, Poison Coat, Deeper Cut) and a **bow** rogue (Long Draw, Fletcher's
Eye); both use Notch, Slip Step, Hush Knife and Knife Fan, and the bow rogue is the one Path that solos the
archer-on-a-perch problem by standing on its own perch.

**Resource.** Energy 100, +10 a second (15 a global). The 100 bar is the opening burst; Light Feet and Slip Step
are what keep you alive while it refills.

### Nodes

| Lvl | Node | Kind | Needs | What it does |
|---|---|---|---|---|
| 3 | **Notch** (`rogue_notch`) ★ | active, 20 energy | — | 90% weapon (+5%/rank) and the target takes +12% damage (+1/rank) from everyone for 8 s. Range 0 = the weapon's reach, so a bow Notches from 25 m. |
| 3 | **Back Cut** (`rogue_backstab`) ★ | active, 35 energy | — | 220% weapon (+12%/rank) from behind. The wishlist `cond: behind` gates it; until then it works from any side. |
| 4 | **Slip Step** (`rogue_slip_step`) | active, off-GCD, 15 energy, cd 12 | — | Spring 6 m back (+0.5/rank) and +30% dodge (+5/rank) for 3 s. 5 ranks. |
| 5 | **Long Draw** (`rogue_aimed_shot`) | active, 30 energy, 1.5 s cast, 25 m | Notch | 240% weapon (+12%/rank). Bow or crossbow (wishlist `weaponOnly`). |
| 6 | **Poison Coat** (`rogue_poison_coat`) | active, 25 energy | Notch | 60% weapon, then poison 1.6 + 0.75×L a second for 12 s (+0.25/+0.07 per rank). |
| 6 | **Hush Knife** (`rogue_hush_knife`) | active, off-GCD, 10 energy, cd 14, 20 m | Slip Step | 50% weapon (+10%/rank) thrown knife that interrupts (3 s lock, +0.25/rank). Any weapon. 5 ranks. |
| 7 | **Light Feet** (`rogue_light_feet`) | passive | Slip Step | dodge +2 points, +1.5/rank (15.5 at 10). |
| 8 | **Knife Fan** (`rogue_knife_fan`) | active, 35 energy, cd 6 | Poison Coat | 120° cone, 8 m: 70% weapon (+5%/rank) to each enemy. Any weapon. |
| 9 | **Keen Edge** (`rogue_keen_edge`) | passive | Notch | crit +2 points, +1/rank. |
| 10 | **Deeper Cut** (`rogue_deeper_cut`) | synergy | Back Cut | Back Cut +7% damage per rank. |
| 10 | **Fletcher's Eye** (`rogue_fletchers_eye`) | synergy | Long Draw | Long Draw +7% damage per rank. |

**Tree layout.** Notch is the hub: Long Draw, Poison Coat and Keen Edge all hang off it. Back Cut is the
second root and leads only to Deeper Cut. Slip Step is the third root and leads to Hush Knife and Light Feet.
Poison Coat → Knife Fan. The two level-10 synergies are the fork: a knife rogue takes Deeper Cut, a bow rogue
Fletcher's Eye, and nobody has the points for both.

**Rotation at level 5, knife** (Notch, Back Cut, Slip Step, Long Draw unused): walk round the brute while the
tank (or the brute's own slowness, 3.2 m/s to your 4.0) keeps its face off you. Notch → Back Cut → Back Cut →
auto-attack while energy refills → Back Cut. Slip Step away from a skirmisher that turns on you; it will go for
the lowest armour in reach, which is you, so the dodge buff is for exactly that moment.

**Rotation at level 5, bow**: Notch from range → Long Draw → Long Draw → auto-shots → Long Draw. Stand on the
same rocks the archers use (`perch` markers are line-of-sight cover both ways).

**Rotation at level 10, knife**: Notch the brute → Poison Coat it (the poison ticks for 12 s while you turn to
the pack) → Knife Fan across the skirmishers → Back Cut, Back Cut → Notch again at 8 s → Knife Fan when it is
back. Hush Knife the shaman's heal from 20 m without moving. ~390 energy over 30 s; the bar is dry on the last
Back Cut, which is the design.

**Rotation at level 10, bow**: Notch → Long Draw ×2 → Knife Fan at the swarm as it closes (8 m cone) → Slip Step
back 6 m → Long Draw. Hush Knife the caster.

**On the phone**: Notch, Back Cut (or Long Draw), Poison Coat, Knife Fan, Hush Knife, Slip Step. Off-GCD Hush
Knife and Slip Step sit at the two ends of the arc so a thumb finds them without looking.

**Legendaries:** Night Soil → Slip Step (leaves a 3 m smoke cloud for 3 s, enemies in it miss half the time);
Twinning Spine → Back Cut (works from any side at 60%); Brace of Sparrows → Long Draw (two arrows at 65% each);
Hemlock Cord → Poison Coat (see the note under "Legendary mapping": its rule assumes a weapon coat the vocabulary
does not have yet); Juggler's Band → Knife Fan (a killing knife refunds 10 energy, a critting one 3).

---

## Mage — Weatherwork

**Fantasy.** Cast, step, cast. You have three weathers: a slow bolt of fire that is your biggest number, a ring of
frost that slows the pack to half speed so you can walk away from it, and a lance of lightning you throw on the
move. When they reach you anyway there is Shift (8 m through the air) and Ward (a wall of still air that
absorbs about one point of damage per point of mana). Cloth only — the design is that you are never where they
are, and Frost Ring + Shift make that true against brutes (3.2 m/s) while skirmishers (4.6–5.8) are the thing
that gets through. Thunderhead at 7 is the AoE you plant on the spot the Fighter is holding.

**Resource.** Mana from the sheet: no Path bonus, the well is Intellect (5 mana a point) and Spirit (regen).
Costs rise 1 a rank on the damage spells (D2-style), so a maxed Cinder Bolt at 23 mana is a real choice against
Deep Study.

### Nodes

| Lvl | Node | Kind | Needs | What it does |
|---|---|---|---|---|
| 3 | **Cinder Bolt** (`mage_firebolt`) ★ | active, 14 mana (+1/rank), 2.0 s cast, 25 m | — | Fire bolt 10 + 6×L (+0.8/+0.4 per rank). 70 at level 10, 113 at rank 10. |
| 3 | **Frost Ring** (`mage_frost_ring`) ★ | active, 20 mana (+1/rank), cd 8 | — | 6 m circle on you: frost 5 + 2.5×L (+0.5/+0.2) and half speed for 5 s (+0.3 s/rank). |
| 4 | **Shift** (`mage_shift`) | active, off-GCD, 8 mana, cd 15 | — | Dash 8 m (+1/rank) the way you are moving. 3 ranks. |
| 5 | **Storm Lance** (`mage_storm_lance`) | active, 16 mana (+1/rank), instant, cd 6, 25 m | Cinder Bolt | Storm bolt 7 + 3.4×L (+0.6/+0.3), speed 45. The one you cast while walking. |
| 5 | **Stifle** (`mage_stifle`) | active, off-GCD, 10 mana, cd 20, 25 m | — | Interrupt, 4 s lock (+1/rank). 3 ranks. |
| 6 | **Ward** (`mage_ward`) | active, 35 mana (+1/rank), cd 12 | Frost Ring | Shield 25 + 1.0×L (+1.2/+0.1) for 10 s — about 1 absorb per mana at rank 1, 1.3 at rank 10. |
| 7 | **Thunderhead** (`mage_thunderhead`) | active, 32 mana (+1/rank), 3 s channel, cd 14, ground, 25 m | Storm Lance | 5 m circle, storm 4 + 2.2×L (+0.4/+0.15) each second for 3 s. Moving lets it go. |
| 8 | **Deep Study** (`mage_deep_study`) | passive | Ward | manaRegen +0.6 a second, +0.3/rank. |
| 9 | **Hotter Fire** (`mage_hotter_fire`) | synergy | Cinder Bolt | Cinder Bolt +6% per rank. |
| 10 | **Quick Hands** (`mage_quick_hands`) | passive | Storm Lance | castSpeed +3%, +2%/rank (21% at 10). |

**Tree layout.** Cinder Bolt → Storm Lance → Thunderhead / Quick Hands is the damage spine, with Hotter Fire on
the root. Frost Ring → Ward → Deep Study is the survival spine. Shift and Stifle stand alone at 4 and 5 (nobody
should have to buy a node to get the escape and the interrupt). A damage Mage has ranks in Cinder Bolt, Storm
Lance, Thunderhead and Hotter Fire; a party Mage who is always being chased has Frost Ring and Ward high and
Deep Study for the long fights.

**Rotation at level 5** (Cinder Bolt, Frost Ring, Shift, Storm Lance, Stifle): open with Cinder Bolt on the
caster (it dies to two). When the pack arrives, Frost Ring — they are at half speed — walk 6 m, Storm Lance on
the move, stop, Cinder Bolt, Frost Ring is back at 8 s, repeat. Stifle the caster's telegraphed cast from 25 m.
Shift when a skirmisher gets a hand on you.

**Rotation at level 10** (add Ward, Thunderhead, Deep Study): Ward before the pull if the pack has archers.
Thunderhead on the spot the brutes will stand in 1 second (the Fighter's Headlong target), then Cinder Bolt the
caster while the cloud works, Frost Ring when the skirmisher closes, walk, Storm Lance, Cinder Bolt. Ward again
at 12 s. Mana: ~20 casts in 30 s on a 300-mana well with 3.5–4 regen, dry at the end of the second pack without
a potion — which is ruling 23.

**On the phone**: Cinder Bolt, Storm Lance, Frost Ring, Thunderhead, Ward, Stifle. Shift goes on the sixth
slot instead of Stifle for the player who kites more than they interrupt; both are off-GCD. Thunderhead is a
ground target: on the phone the button places it on the current target's feet (ruling 21 has no second stick),
and on desktop a click.

**Legendaries:** Tallow Crown → Cinder Bolt (burning ground where it lands); Frostweft → Frost Ring (also a
15%-max-health frost shell); Forked Lance → Storm Lance (chains to 2 more at 50%); Hourglass Band → Shift (2
charges, a kill refunds one); Deep Well → Ward (2 absorb per mana, but not castable below 30% mana — with the base
at ~1 per mana this is exactly a doubling).

---

## Healer — Daylight

**Fantasy.** The light that bites. You keep people standing with one slow heal, one pulse that heals the whole
party around you, a patch of blessed ground and an instant shield for the friend who pulled three; and you lash
the enemy with sunlight that refunds 5 mana per hit, so attacking is how you afford healing. Noon Flare at 8 means
a Healer can clear a zone alone, ~25% slower than a Mage. Mace and shield or staff; cloth or leather; Rebuke is a
12 m word, so you interrupt from the back line, and the Shieldbearer's Rebuke legendary turns it into a front-line
area taunt for the Healer who wants to stand next to the Fighter.

**Resource.** Mana, as the Mage. Spirit is the Healer's stat (regen and heal power both read it). Sunlash's
refund means a Healer's own damage is almost free; Quiet Prayer is for the 60 s boss.

### Nodes

| Lvl | Node | Kind | Needs | What it does |
|---|---|---|---|---|
| 3 | **Mend** (`healer_mend`) ★ | active, 16 mana (+1/rank), 2.0 s cast, 25 m, ally | — | Heal 12 + 4.8×L (+1.0/+0.4 per rank). Self if nobody is picked. |
| 3 | **Sunlash** (`healer_smite`) ★ | active, 12 mana, 1.5 s cast, 25 m | — | Fire bolt 8 + 4.5×L (+0.7/+0.35), refunds 5 mana on landing. |
| 4 | **Radiance** (`healer_radiance`) | active, 30 mana (+1/rank), instant, cd 10 | Mend | 8 m circle on you: heal every friend 9 + 3.6×L (+0.8/+0.3). |
| 5 | **Rebuke** (`healer_rebuke`) | active, off-GCD, 10 mana, cd 15, 12 m | Sunlash | Fire 4 + 1.5×L and an interrupt (3 s lock, +0.25/rank). 5 ranks. |
| 6 | **Sanctify** (`healer_sanctify`) | active, 30 mana (+1/rank), instant, cd 20, ground, 25 m | Radiance | 5 m circle: friends in it when it lands mend 2.5 + 1.0×L a second for 8 s (+0.25/+0.08). |
| 6 | **Clear Water** (`healer_clear_water`) | active, 12 mana, instant, cd 8, ally | Mend | Cleanse (slow / stun / dot) and heal 5 + 1.5×L (+1/+0.3). 5 ranks. |
| 7 | **Shelter** (`healer_shelter`) | active, 22 mana (+1/rank), instant, cd 10, ally | Radiance | Shield 14 + 5.5×L (+1.2/+0.4) for 8 s. |
| 7 | **Quiet Prayer** (`healer_quiet_prayer`) | passive | Sunlash | manaRegen +0.6 a second, +0.3/rank. |
| 8 | **Noon Flare** (`healer_noon_flare`) | active, 24 mana (+1/rank), 1.5 s cast, cd 8, 25 m | Sunlash | 6 m circle on the target: fire 5 + 2.2×L (+0.5/+0.2) to each enemy. |
| 9 | **Steady Light** (`healer_steady_light`) | synergy | Mend | Mend +6% per rank. |
| 10 | **Bright Faith** (`healer_bright_faith`) | passive | Radiance | healPower +3%, +2%/rank. |

**Tree layout.** Mend → Radiance → Sanctify / Shelter / Bright Faith is the healing spine, with Steady Light
and Clear Water on the Mend root. Sunlash → Rebuke / Quiet Prayer / Noon Flare is the light spine. A party Healer
puts ranks in Mend, Radiance, Shelter and Steady Light and takes Sanctify at 1 for the tank; a solo Healer ranks
Sunlash, Noon Flare and Quiet Prayer and keeps Mend at 2–3.

**Rotation at level 5** (Mend, Sunlash, Radiance, Rebuke): Sunlash, Sunlash while nobody is hurt (each one is
net 7 mana). Mend whoever the skirmisher picked. Radiance when two are under 70%. Rebuke the shaman's heal — it is
off-GCD and 12 m, so you never stop casting to do it. Healing makes threat at half rate (ruling 42), so after a
big Radiance the leftover skirmisher will come for you: that is what the Fighter's Hard Stop taunt is for, and
at 6 what Shelter on yourself is for.

**Rotation at level 10** (add Sanctify, Clear Water, Shelter, Noon Flare): Sanctify on the ground the Fighter
is Headlonging to, before the pull. Shelter the Fighter on the pull. Sunlash ×2. Mend the tank; Radiance when the
Mage got Frost Ring'd into the pack. Clear Water the Rogue off the bog-lurker's slow. Noon Flare the swarm (14
bodies at 0.25 hp die to two). Sunlash whenever the party is above 80%, and the mana you ended the fight with is
mostly Sunlash's refunds. Mend 60 × 1.3 heal power = 78 every 2 s against the ~22 a second a same-level pack
does to a mail tank: a Healer keeps one tank up against one pack with room to spare, and against two packs it is
Radiance + Sanctify + a potion, which is the intended "oh no".

**On the phone**: Mend, Sunlash, Radiance, Shelter, Sanctify, Rebuke. Solo: swap Shelter for Noon Flare. Mend and
Shelter default to the most hurt friend in range when no ally is targeted (the vocabulary says `target: ally`;
the client should pick the lowest-health ally within range when the player has an enemy targeted — the same
rule Field Mend already uses for "self if nobody is picked").

**Legendaries:** Dawnbreak → Sunlash (heals the most injured ally within 12 m for 40% of its damage — the
"smite that heals"); Lichen Robe → Mend (leaves 30% of the heal over 6 s); Beacon Amulet → Radiance (12 m
instead of 8, and a second pulse at 50% two seconds later); Shieldbearer's Rebuke → Rebuke (taunts every enemy
within 8 m and +30% block for 4 s); Sanctum Band → Sanctify (also cleanses one poison or shadow from each ally it
touches — it works per-touch because Sanctify applies to the allies in the circle at the moment it lands).

---

## Wanderer tweaks (same ids, merge over data/skills.json)

- `sure_strike` 145% → **160%** weapon. At level 1 a sword swing is 4.6 and the target is 18 a global; 160% +
  the auto-attack reaches ~16.
- `spark` 7 + 2.6×L → **9 + 3.2×L** storm (12 at level 1, 41 at level 10 — it has to stay a fair ranged poke for a
  Fighter who cannot reach a perch).
- `field_mend` and `shove` unchanged; Shove is written in the new vocabulary as `weapon 0.4 + interrupt lock 2`.
- After the Path pick a Fighter pays the same number in rage and a Rogue twice the number in energy for Wanderer
  skills (`resources.wandererSkillsAfterPath`); Mage and Healer keep the mana costs.

## Legendary mapping

All 20 skill ids in `data/legendaries.json` are used **as they are** — nothing in `skill` fields needs renaming.
What does need a change is the player-facing `text` on nine of them, because nine of the skills got original
names (the id is a code name; "Cleave", "Charge", "Rend", "Backstab", "Aimed Shot", "Shield Slam", "War Cry",
"Firebolt" and "Smite" are other games' skill names):

| Legendary | `skill` id (kept) | Old name in `text` | New name |
|---|---|---|---|
| oxhide_grip | fighter_cleave | Cleave | **Wide Swing** |
| ramhorn | fighter_shield_slam | Shield Slam | **Hard Stop** |
| standard_of_the_wall | fighter_war_cry | War Cry | **Rallying Roar** |
| chasers_greaves | fighter_charge | Charge | **Headlong** |
| grudge_edge | fighter_rend | Rend | **Deep Gash** |
| twinning_spine | rogue_backstab | Backstab | **Back Cut** |
| brace_of_sparrows | rogue_aimed_shot | Aimed Shot | **Long Draw** |
| tallow_crown | mage_firebolt | Firebolt | **Cinder Bolt** |
| dawnbreak | healer_smite | Smite | **Sunlash** |

The other eleven keep their names (Slip Step, Poison Coat, Knife Fan, Frost Ring, Storm Lance, Shift, Ward, Mend,
Radiance, Rebuke, Sanctify — all original enough, and the legendary texts already read right).

**One rule that does not fit the vocabulary yet — Hemlock Cord.** Its rule `skillShareBuff` assumes Poison Coat
is a weapon coat (a self-buff that makes every hit poison), which the effect list cannot express, so Poison Coat
is written as a poisoned strike (a weak hit, then a 12 s poison). Two ways to close it, owner's pick:

1. Add the wishlist `coat` effect to the engine, turn Poison Coat into the 20 s coat, and Hemlock Cord works as
   written (the coat's half-duration copy on allies within 6 m). **Recommended** — the coat is the better skill.
2. Keep the strike and change Hemlock Cord to: text "Poison Coat's poison also spreads to up to 2 enemies within
   4 m of the target, at half duration.", rule `{ type: "skillSpread", range: 4, count: 2, durationMult: 0.5 }`.

Two legendaries need an engine feature that the base skills do not use: **Chaser's Greaves** and **Hourglass
Band** (`skillCharges`) need cooldown charges (wishlist `charges`), and **Twinning Spine** (`skillCondition`)
needs Back Cut's behind-the-target condition (wishlist `cond`) to have anything to relax.

## Wishlist (engine additions, each with its rule in the JSON)

1. `cond: "behind"` — Back Cut's gate (rear 120° arc; dimmed button; "Get behind it").
2. `weaponOnly: "ranged"|"melee"` — Long Draw's gate.
3. `spendAll` + `perResourceSpent` — makes Breaker Blow a true rage dump (×3.0 at 40, ×4.2 at 100).
4. `coat` — a weapon-proc dot; the real Poison Coat, and what Hemlock Cord assumes.
5. `charges: n` — needed by two legendaries, not by the base skills.
6. `who: "self"` on a heal inside an enemy skill — optional, Sunlash self-heal at high rank.
7. `zone` — a ground shape that keeps applying to whoever stands in it; would make Sanctify "stand in the light"
   and Thunderhead a plant-and-go. Both skills work today on the instantaneous `area`.
8. `normalise` on `weapon` — per-GCD instead of per-swing damage, if the bot sim shows mauls too far ahead.
