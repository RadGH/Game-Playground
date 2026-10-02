# Round 28 — skill rework brainstorm (DRAFT — see round28-skills-plan.md for what wins)

The owner's ask, verbatim:

> "Add distinct abilities for all classes instead of sharing them sometimes. Add more bespoke talents
> to individual abilities rather than generic area / damage percentages that change the skill in
> meaningful ways."
>
> "Also for the druid add shapeshifting abilities that transform their other skills. Avoid WoW
> references."

This is the raw brainstorm. `round28-skills-plan.md` is the roast of it and the final word: where
the two disagree, **the plan wins**. Content agents read this file for the per-skill talent sketches
and apply the plan's amendment list (plan §6) on top.

## 0. What is true today (measured, 2026-10-02)

* `data/skills.json` — 47 skills, 15 statuses, 30 classes x 6 ids, `unlockAt` 1/3/6/12/18/24.
  Sharing: `execute` 10 classes, `power_strike` 9, `meteor` 9, `rally` 7, `curse` 7, `quicken` 7,
  `guard_stance` 7, `aimed_shot` 6… Every class shares at least four of its six with someone.
* Shapes (8, pinned by `tests/skills.test.js`): melee, around, bolt, beam, ground, dash, self,
  summon. Plan fields already read by `js/main.js castSkill` (line ~1532): `repeats/repeatEvery`,
  `breath`, `weather`, `delay`, `pull`, `trail`, `orbs`, `projectiles/spread`, `homing`, `pierce`,
  `chains/chainFalloff`, `splash`, `heal/healFrac`, `status/statusMult`, `pets`, `ground` pools,
  `barrier` (talent), `pet/count`.
* Talents (`js/skilltalents.js`): 24 generic library nodes offered by SHAPE through `OFFERS`;
  tiers at 3/8/18/28; one pick per tier; picking into an empty tier is free, emptying one is the
  Unbinder's job (`js/retrain.js`). Every mod key must be in `IMPLEMENTED_MODS` with a real reader
  (`tests/skills.test.js` "R18 — no talent is inert", `tests/round21-balance.test.js`).
  `talentsOn` resolves a picked id through `TALENT_LIBRARY[id]` ONLY — there is no per-skill node.
* Hit-time rules ride `player.castRules` (`castRulesFrom`) into `js/rpg.js strike` (line ~1564).
* Unique-item powers already implement, purely and tested, in `js/uniques.js`:
  `resolveAttack` (chain, **ricochet**, **split**, pull, patch, slam, shockwave, echo),
  `afterKill` (**burst**, **shards**, **spread**, spreadRot, selfStatus), `afterDamaged` (nova),
  `tickAuras` (pulse auras, `nearestOnly`, `always`). main.js's `uniqueEnv` (line ~1264) is the
  adapter. **Most of the new vocabulary is these, driven from a skill plan instead of an item.**
* `js/actors.js land()` already does **knockback** (`strike.push`, rank-resisted by `pushFor`) and
  **stagger = a real stun** (`strike.stagger`, `staggerFor` diminishing returns 1/0.6/0.3/0 inside
  6 s; a staggered enemy cannot walk OR swing). Skills never pass a `strike` shape, so no skill has
  ever knocked anything back.
* `js/actors.js aimOf/taunt` (R22): threat is "seconds on a pet id"; there is no way to point an
  enemy at the PLAYER on purpose (the player is the default, so a tank taunt today = clear threat).
* Pets (`js/pets.js`): follow/engage/return, `castAbility` (single, radius, pure heal), `summon`
  through the follower gate (`js/followers.js`). No lifetime, no orders, no decoy.
* `avatar-3d/js/spellfx.js` pieces: `projectile`, `impact`, `aoe`, `cast`, `heal`, `revive`,
  `breath`, `orbitOrb`, `pillar`, `vortex`, `storm`, `footfall`, `status(target,type,on)`,
  `pulseStatus`. Status auras: burn poison bleed freeze stun sleep confused dazed blind slow marked
  barrier regen sunder curse silence disarm root rally haste enchant block deflect. Elements:
  fire ice shadow holy nature arcane lightning physical poison bleed true. main.js also has
  `fx.swipe`, `ringPoints`, `dropPool` (ground pools), `startOrbs`, the mount `horse` actor.
* Enemy families (`data/enemies.json families`): beast undead construct fiend elemental aberration
  dragonkin humanoid. (Use `fiend`, never "demon", in data.)
* Mercenaries (`data/mercenaries.json`) have their OWN `abilities` book and never reference
  `skills.json` ids. Followers read `skills.json` only for a summon's `count` (`spellCountFor`).
* Custom class (`js/classbuild.js spellCatalogue`): a spell's tier = the earliest slot ANY class
  grants it on; a skill on no class falls to tier 24.

## 1. Rules I designed to

1. **Every one of the 180 class slots is a different skill id.** Each of the 47 legacy ids is used
   exactly once (all 47 found a home, so no save loses a skill id and nothing is orphaned).
2. A skill must **stand alone**. Cross-skill interplay (A primes, B consumes) lives mostly in
   TALENTS, so a custom class that takes one half is never holding a dead button.
3. A class's six are **different verbs**, not six damage numbers: an opener, a control tool, a
   defensive or support tool, a signature-mechanic piece, a mid-fight swing skill, a capstone.
4. A talent changes a **rule**: shape, what happens on impact, a new interaction, a resource,
   a minion behaviour, a form. A bare "+X% damage / +Y% area" is not a bespoke node — the generic
   library (`heavy`, `wide`, `overload`, `crescendo`) already covers that and stays available as the
   ONE optional library pick per tier.
5. No WoW/Blizzard or Diablo names (convention 9 + "Avoid WoW references"). No `ember`/`veil` in new
   names. Banned list checked on every name below. Original resource names: **Grit** is not used;
   the resources are **Flair** (swashbuckler), **Poise** (monk), **Grudge** (demon hunter).
6. Numbers are the BASE row (`mult` before `effectiveMult`). `effectiveMult = mult x cooldownPower
   (1 + 0.08 per second past 4) x unlockPower (1.0 at L1 -> 2.0 at L24)`.

## 2. Draft mechanics vocabulary (the plan trims and prioritises this)

Keys appear in `[brackets]` in the class designs. Full semantics, readers and wording are in the
plan §2; this is the working list.

| key | one line |
|---|---|
| `knock {push, stagger}` | knockback metres + stun seconds, through `actors.land` |
| `pullIn {metres, to}` | drag hit bodies toward self / impact point / a line |
| `dash.to` / `leap` / `land` | dash to aim, to target, behind target, backward, swap; leap = no path damage, a landing burst |
| `ricochet {bounces, range, keep}` | bolt bounces body to body (uniques' ricochet) |
| `returns {keep}` | bolt flies out and back, hitting on both legs |
| `split {shards, range, keep}` | bolt breaks into shards on impact (uniques' split) |
| `onKill {...}` | burst / spread / refund / reset / heal / corpse / loot / mana when THIS skill kills |
| `place {kind,...}` | a placed object: totem (pulses damage), ward (zone buff/heal), trap (armed, proximity), banner (aura), beacon (lure) |
| `channel {seconds, every, moveK}` | hold the key; repeats while held |
| `charges {max, recharge}` | several uses, recharging one at a time |
| `resource` / `spend` | a class counter (Flair/Poise/Grudge) built and spent by skills |
| `primes {tag}` / `consumes {tag, mult, add}` | combo: A marks, B pays off and removes the mark |
| `form` / `forms` / `group` | a persistent self state that overrides other skills (druid), exclusive groups (stances, songs) |
| `hpCost` | costs a share of max health |
| `resetOn` / `cutCooldown` | cooldown reset on kill/crit/consume; cut another skill's cooldown |
| `command {order}` | orders to followers: focus, guard, pounce, frenzy, sacrifice, return |
| `taunt {radius, seconds}` | enemies attack YOU (or a decoy) for N s |
| `barrier {share, seconds, pets}` | a skill-level barrier on you (and followers) |
| summon `lifetime` / `temporary` / `decoy` / `burstOnExpire` | temporary summons outside the follower count |
| `aura {...}` | a pulsing area that follows you or sits on a point (generalised orbs/trail) |
| `execute {below, mult}` | bonus against low-health targets |
| `behind` | bonus when struck from the target's back |
| `detonate {types, share}` | pop a DoT: pay its remaining damage now |
| `spread {types, radius}` | copy statuses from the struck body to neighbours |
| status kind `disable` | sleep / stasis: cannot act; `breakOnDamage` for sleep |
| status fields `reflect`, `ccImmune`, `resistPerFoe`, `onHurt` | new self-buff behaviours |
| `rewind {seconds}` | restore your health and position from N s ago |
| `elementPool` / `statusPool` | random element / status per cast or per hit |
| `variance [min,max]` | random multiplier per cast |
| `familyBonus {families, mult}` | bonus vs undead / fiend / etc. |
| `empowerNext {count, mult, free}` | the next N skill casts are stronger / free |
| `imbue {seconds, element, status, splash, heal, extra}` | your BASIC attack changes for N s |
| `line {length}` | a ground skill laid as a line of strikes/pools |
| `crowd {per, cap}` | +X% per extra enemy hit |
| `onHitSelf {...}` | the caster gains something per hit / per cast |
| `grow` / `as` | radius grows per repeat; a talent swaps the shape |
| `corpses` / `consumeCorpses` | kills leave corpses for 20 s that skills spend |
| `store` | a status that banks damage and releases it on expiry |

---

## 3. The thirty classes

Notation per skill: **slot · `id` · Name** — shape / element · base numbers · *fantasy* ·
**Hook** (why it plays differently from its siblings) · four talent tiers, two bespoke nodes each
(`a` / `b`) plus the optional library id (`lib`). `(legacy)` = an existing id kept.

---

### 3.1 Warrior — Frontline Tank · STR · sword, hammer, sword2h, axe2h
Signature: **the more enemies around you, the better you get** (`crowd`, `resistPerFoe`, `taunt`).

**1 · `cleave` · Cleave** (legacy) — around / physical · mult 1.15, cd 7, mp 6, r 4.5 ·
*one wide swing that answers a crowd* · **Hook:** +12% per enemy hit past the first, cap +48% [crowd].
- T1 a) Reaping Arc — becomes a 220° frontal arc 5.5 m that knocks 1.5 m [as melee, knock] / b) Hooked Edge — hit bodies are dragged 2 m toward you [pullIn self] · lib `wide`
- T2 a) Opened Veins — if 3+ are hit, all of them Bleed [status if crowd≥3] / b) Grim Return — heals 2% max health per enemy hit [onHitSelf heal] · lib `shatter`
- T3 a) Battle Rhythm — each enemy hit cuts War Cry's cooldown 1 s [cutCooldown warcry] / b) Backswing — a second Cleave 0.4 s later at 50% [repeats 2 keep 0.5] · lib `hunger`
- T4 a) Field of Blades — hitting 5+ resets Cleave [resetOn crowd 5] / b) Iron Tide — two rings, 4.5 m then 7 m [repeats 2, grow 2.5] · lib `crescendo`

**2 · `breaching_shove` · Breaching Shove** — melee / physical · mult 1.1, cd 7, mp 6, reach 3, arc 1.4 · *a shoulder that moves a line* · **Hook:** knock 4 m + stun 0.6 s; a body slammed into a wall or cliff takes the wall slam [knock].
- T1 a) Bowling Line — a shoved body strikes what it passes for 60% [knock carry] / b) Anchor Chain — pulls 3 m instead of pushing [pullIn self] · lib `wide`
- T2 a) Rattled — shoved enemies are Dazed: deal 25% less for 4 s [status dazed] / b) Off Balance — shoved enemies are Off Balance; Iron Gyre deals +40% to them [primes off_balance] · lib `shatter`
- T3 a) Tremor Line — a 6 m crack behind the shoved body, slowing 60% for 3 s [line pool] / b) Brace — gain Guarded 2 s per enemy shoved (max 3 stacks) [onHitSelf status] · lib `bulwark`
- T4 a) Avalanche — push 8 m, stun 1.2 s, wall slam x2 [knock] / b) Challenge Shove — shoved enemies are taunted 5 s [taunt onHit] · lib `unmaking`

**3 · `warcry` · War Cry** (legacy) — self / physical · Might +30% 12 s, cd 22, mp 10 · *a roar that pulls the fight onto you* · **Hook:** taunts everything within 10 m for 3 s [taunt]; +5% Might per enemy taunted, cap +25% [crowd].
- T1 a) Deafening Cry — enemies within 8 m are Weakened 6 s / b) Rallying Cry — followers get Might too [pets] · lib `quick`
- T2 a) Challenger — taunt lasts 6 s and taunted enemies deal you 20% less / b) Battle Trance — while Might lasts every hit taken returns 2 mana [onHurt mana] · lib `deepen`
- T3 a) Second Roar — a second cry 4 s later re-taunts and refreshes Might [delay repeat] / b) Roar of Iron — barrier 3% max health per enemy within 10 m [barrier crowd] · lib `echo`
- T4 a) Warlord's Call — while Might lasts every cooldown runs 25% faster [status cdRate] / b) Unshaken — while Might lasts you cannot be knocked back, stunned or slowed [ccImmune] · lib `crescendo`

**4 · `whirlwind` · Iron Gyre** (legacy, renamed) — around / physical · mult 0.8 x5 spins, cd 12, mp 14, r 5.5, bleed · *spin through them* · **Hook:** you walk at 70% while spinning; each spin drags 0.5 m inward [pullIn].
- T1 a) Widening Gyre — +0.6 m radius per spin [grow] / b) Tight Gyre — 3 spins at 170%, last spin knocks 3 m [repeats, knock] · lib `quick`
- T2 a) Shrapnel — each spin flings a blade at the nearest enemy outside the ring, 40% [onRepeat bolt] / b) Grinding — each spin adds a Bleed stack, max 5 [stack status] · lib `drain`
- T3 a) Momentum — each enemy hit adds 0.2 s of spinning, max +2 s [channel extend] / b) Eye of Iron — 30% less damage taken while spinning [selfStatus during] · lib `hunger`
- T4 a) Cyclone Wake — leaves a vortex where you stop that spins 3 s more [place totem] / b) Endless Gyre — becomes a channel: spin while held, 4 mana a spin [channel] · lib `crescendo`

**5 · `iron_resolve` · Iron Resolve** — self / physical · cd 30, mp 10, 10 s · *the warrior gets harder to kill the worse it looks* · **Hook:** take 6% less damage per enemy within 6 m (max 36%); every 4th hit taken releases a 4 m shockwave for 80% [resistPerFoe, onHurt].
- T1 a) Deep Roots — immune to knockback, lasts 13 s [ccImmune] / b) Bloodied — below 35% health the reduction doubles · lib `quick`
- T2 a) Retort — the shockwave also taunts 3 s / b) Spiked Mail — reflect 20% of melee damage taken [reflect] · lib `deepen`
- T3 a) Shared Burden — followers within 8 m get half your reduction [pets] / b) Grit Bank — 30% of damage taken is stored and released as a 6 m blast when Resolve ends [store] · lib `bulwark`
- T4 a) Unkillable — once a cast, a killing blow leaves you at 1 health and ends Resolve with a 300% blast / b) Iron Crowd — everything within 6 m at the start is taunted for the whole duration · lib `aegis`

**6 · `groundbreaker` · Groundbreaker** — beam / physical · mult 2.6, cd 20, mp 22, range 18, width 2.4 · *the hammer splits the earth* · **Hook:** stun 1.2 s along the line [knock]; +50% to anything already stunned [consumes staggered]; leaves an 18 m fissure that slows 60% for 5 s [line pool].
- T1 a) Twin Faults — two fissures in a 30° V [projectiles 2] / b) Long Fault — 28 m [range] · lib `heavy`
- T2 a) Magma Seam — the fissure burns instead of slowing [pool element fire] / b) Aftershock — the line erupts again 2 s later for 60% [delay repeat] · lib `shatter`
- T3 a) Cratering — a kill in the fissure bursts 3 m for 50% [onKill burst] / b) Fault Pull — before it erupts, enemies within 4 m are dragged onto the line [pullIn line] · lib `brand`
- T4 a) Open Wound — the fissure lasts 10 s and pulses for 30% a second [pool] / b) Tectonic — each enemy hit cuts Iron Resolve's cooldown 3 s [cutCooldown] · lib `cascade`

---

### 3.2 Fighter — Disciplined Duelist · STR · sword, hammer, sword2h
Signature: **stances and counters** — one exclusive stance toggle (`form` without a body, `group: stance`), a counter window, precision (armour pen).

**1 · `power_strike` · Precise Strike** (legacy, renamed) — melee / physical · mult 1.9, cd 4 · *the clean hit* · **Hook:** ignores 40% of armour [pen]; crits leave the target Exposed (takes 15% more for 4 s).
- T1 a) Measured Cut — every 3rd Precise Strike is a guaranteed crit [counter] / b) Thrust Line — becomes a 5 m thrust line through 2 bodies [as line] · lib `quick`
- T2 a) Disarming — the target deals 30% less for 3 s [status weaken short] / b) Exploit Opening — +60% against an enemy you just Riposted [consumes riposted] · lib `shatter`
- T3 a) Patient Blade — +20% for each second since your last skill, max +80% [build-up] / b) Flowing Form — a kill refunds the whole cooldown [onKill reset] · lib `cauterise`
- T4 a) Perfect Form — in Open Stance a crit with it resets Lunge / in Closed Stance it grants a 10% barrier [stance-dependent] / b) Through the Guard — ignores ALL armour and block · lib `unmaking`

**2 · `riposte` · Riposte** — self / physical · cd 8, mp 4, window 1.2 s · *stand ready, answer the blow* · **Hook:** for 1.2 s the next melee hit on you is negated and answered with a 250% strike that stuns 0.8 s [status counter]. Unused: refunds half the cooldown.
- T1 a) Long Guard — window 2 s, answers up to 2 hits / b) Sidestep — instead of a strike, you step 3 m to the attacker's back and the answer counts as behind [dash behind] · lib `quick`
- T2 a) Riposted — the attacker is marked Riposted for 5 s (Precise Strike combo) [primes] / b) Turn the Blade — the negated hit's damage is reflected at 100% [reflect] · lib `deepen`
- T3 a) Arrow Catcher — the window also negates a projectile and sends it back / b) Rhythm — a successful answer cuts every other cooldown by 2 s [cutCooldown others] · lib `bulwark`
- T4 a) Unbroken Guard — the window re-arms after each answer for the full 1.2 s, up to 3 answers / b) Disarm — the answered enemy cannot attack for 3 s [disable no-break] · lib `aegis`

**3 · `duelist_stance` · Duelist's Stance** — self / physical · toggle, cd 1.5, mp 0 · *two ways to hold a sword* · **Hook:** switches between **Open Stance** (+20% damage, +15% attack speed, -15% armour) and **Closed Stance** (+50% armour, +15% block, -10% damage) [form group stance, no body]. Precise Strike, Lunge and Sweeping Guard read the stance (their talents say how).
- T1 a) Quick Switch — switching grants 1 s of Hastened [onCast status] / b) Settled — after 6 s in one stance, its bonus is +50% stronger · lib —
- T2 a) Reading Stance — Closed Stance: blocked hits count as Riposte triggers / b) Pressing Stance — Open Stance: each hit you land in a row adds +3% damage, max +15% · lib —
- T3 a) Dancer's Switch — switching stances strikes everything within 3 m for 80% [around on cast] / b) Mind of Iron — in Closed Stance taunt anything that hits a follower [taunt] · lib —
- T4 a) Middle Guard — a third stance unlocks: half of both bonuses and none of the costs / b) Masterstroke — switching resets Riposte · lib —

**4 · `lunge` · Lunge** — dash / physical · mult 1.8, cd 9, mp 8, range 8, splash 1.6 · *close the gap through them* · **Hook:** stops at the FIRST body and hits it for +50% (not a ride-through dash) [dash.to target]; Open Stance: +3 m range; Closed Stance: stuns 0.6 s.
- T1 a) Pass Through — carries on through the first body to full range, hitting all [dash] / b) Recover — you step back 3 m after the hit [dash back] · lib `quick`
- T2 a) Pinned — the target is rooted 2 s [status root] / b) Skewer — the first body is carried 3 m with you [knock carry] · lib `shatter`
- T3 a) Double Lunge — 2 charges [charges] / b) Duel — the target is Challenged: only you can damage it fully, it takes +25% from you and -50% from others for 6 s [primes duel] · lib `hunger`
- T4 a) Flicker — a kill resets Lunge [onKill reset] / b) Fleche — +100% if you lunge from 6 m or more · lib `crescendo`

**5 · `sweeping_guard` · Sweeping Guard** — melee / physical · mult 1.3, cd 12, mp 10, reach 3.6, arc 3.1 (180°) · *a wide parry that turns into a cut* · **Hook:** for 2 s before the sweep you block 60% from the front (wind-up you can be hit in); the sweep's damage +10% per hit blocked (max +50%).
- T1 a) Full Circle — 360° / b) Shoulder Check — the sweep knocks 2 m [knock] · lib `wide`
- T2 a) Stored Force — blocked damage is added to the sweep (30% of it) [store] / b) Shield Breaker — strips 20 armour [sunder] · lib `shatter`
- T3 a) Covering — followers behind you take 40% less while you hold [pets aura] / b) Recoil — every blocked projectile is thrown back at its source · lib `bulwark`
- T4 a) Counterstorm — the sweep triggers Riposte's answer on every enemy hit / b) Unmoving — hold as a channel for up to 4 s [channel] · lib `aegis`

**6 · `masters_flurry` · Master's Flurry** — melee / physical · mult 0.9 x7 strikes, cd 22, mp 20, reach 3.4, arc 1.2 · *seven cuts in two seconds* · **Hook:** each strike picks the lowest-health enemy in the arc; the 7th is a 300% finisher that knocks 4 m. Open Stance: 9 strikes; Closed Stance: each strike blocks the next hit on you.
- T1 a) Focused Flurry — all strikes on one target, +40% on the finisher / b) Moving Flurry — walk at 80% during it · lib `quick`
- T2 a) Bleeding Edge — each strike adds a Bleed stack (max 7) [stack] / b) Disarming Flurry — the finisher Disarms 3 s [disable] · lib `drain`
- T3 a) Rising Tempo — each strike is 10% faster than the last / b) Closing Line — the finisher is a 6 m thrust line [as line] · lib `overload`
- T4 a) Endless Discipline — the finisher resets Precise Strike and Lunge / b) Second Flurry — if every strike hit, the flurry repeats once at 50% · lib `crescendo`

---

### 3.3 Paladin — Holy Warrior · STR · sword, scepter
Signature: **holy ground and judgement** — the paladin heals by hitting and turns its own health into protection for others; bonus vs undead/fiend [familyBonus].

**1 · `sanctified_blade` · Sanctified Blade** — melee / holy · mult 1.6, cd 5, mp 4, reach 3.2, arc 1.4 · *a blessed edge* · **Hook:** +50% vs undead and fiend [familyBonus]; each hit heals you 1.5% max health [onHitSelf heal].
- T1 a) Wide Blessing — heals followers too / b) Radiant Edge — a 6 m holy wave leaves the swing [as beam short] · lib `wide`
- T2 a) Searing Mark — the target is Seared: Hallowed Ground deals +50% to it [primes seared] / b) Purge the Wicked — undead/fiend hit are stunned 1 s [knock] · lib `shatter`
- T3 a) Overflowing — overhealing becomes a barrier, max 10% [barrier] / b) Light's Debt — every 3rd cast is free and strikes twice · lib `echo`
- T4 a) Dawnsteel — for 6 s after a kill, basic swings deal +40% holy [imbue] / b) Martyr's Edge — costs 4% health and deals +80% [hpCost] · lib `crescendo`

**2 · `consecrate` · Hallowed Ground** (legacy, renamed) — around / holy · mult 1.4, cd 16, mp 20, r 6.5, heal 15% · *sanctify the ground you stand on* · **Hook:** becomes a lasting zone: 6 s, pulses every 1 s for 25%, heals you and followers inside 2% a pulse [place ward follow:false].
- T1 a) Moving Light — the zone follows you [aura follow] / b) Holy Bounds — enemies cannot willingly leave it for 3 s (rooted at the edge) · lib `wide`
- T2 a) Scorching — pulses 50% harder on undead/fiend / b) Blessed Stone — standing in it you take 20% less · lib `deepen`
- T3 a) Overflow — kills inside heal 5% / b) Re-sanctify — casting again while inside detonates the zone for 200% · lib `bulwark`
- T4 a) Cathedral — radius 10 m, 10 s / b) Twin Ground — 2 charges [charges] · lib `aegis`

**3 · `oath_hammer` · Oath Hammer** — bolt / holy · mult 1.7, cd 8, mp 10, range 26, splash 1.8 · *a thrown hammer that comes home* · **Hook:** returns to you, hitting on both legs [returns 0.8]; each enemy hit on the return heals you 2%.
- T1 a) Ricochet Oath — bounces between 3 enemies instead [ricochet] / b) Heavy Oath — stuns 1 s on the out leg [knock] · lib `seeking`
- T2 a) Judged — hit targets are Seared (Hallowed Ground combo) [primes] / b) Shield of Faith-free name: **Warding Throw** — the hammer grants 8% barrier when caught [barrier] · lib `burst`
- T3 a) Pull of Faith — the returning hammer drags hit enemies 3 m toward you [pullIn self] / b) Hammer Storm — three hammers in a fan [projectiles 3] · lib `brand`
- T4 a) Unending Oath — catching it with 2+ hits resets it / b) Comet Hammer — on the return it lands at your feet in a 5 m blast · lib `cascade`

**4 · `martyrs_vow` · Martyr's Vow** — self / holy · cd 20, mp 0, hpCost 15% · *your blood, their shield* · **Hook:** pay 15% health: you and every follower get a barrier worth 25% of YOUR max health for 8 s [hpCost, barrier pets]; while any barrier holds, damage you take heals followers 30%.
- T1 a) Lesser Vow — costs 8%, gives 15% / b) Greater Vow — costs 25%, gives 40% · lib —
- T2 a) Blood Ward — the health you paid comes back over 8 s if the barrier breaks [regen] / b) Burning Vow — a broken barrier explodes 4 m for 120% holy · lib `deepen`
- T3 a) Sworn — while the barrier holds, Sanctified Blade heals twice as much / b) Taunting Vow — enemies within 8 m are taunted 4 s [taunt] · lib `hunger`
- T4 a) Shared Vow — followers' barriers take damage FOR you while they last / b) Undying Vow — the first killing blow inside 8 s is negated, once a cast · lib `aegis`

**5 · `shining_rebuke` · Shining Rebuke** — around / holy · mult 1.5, cd 14, mp 16, r 5 · *a flash that throws evil back* · **Hook:** knock 5 m + stun 1 s [knock]; undead/fiend are thrown twice as far and Weakened.
- T1 a) Focused Rebuke — 100° cone 9 m [as melee] / b) Blinding — Blinded: deal 40% less for 4 s [status] · lib `wide`
- T2 a) Shards of Light — knocked bodies leave holy patches for 3 s [pool] / b) Turn Away — fleeing undead take +40% from everything [primes] · lib `deepen`
- T3 a) Return to Me — instead of pushing, pulls everything to you [pullIn self] / b) Sanctuary Line — leaves a 10 m holy line enemies cannot cross for 4 s (they stop at it) [line] · lib `brand`
- T4 a) Banishment — undead/fiend below 25% are destroyed outright (not bosses) [execute] / b) Double Rebuke — a second flash 1 s later · lib `aegis`

**6 · `dawnbreaker` · Dawnbreaker** — dash / holy · mult 3.0, cd 24, mp 28, leap 16 m, land radius 6 · *descend like the sunrise* · **Hook:** a leap (no path damage) landing in a 6 m blast, stun 1 s, and a Hallowed Ground zone where you land [leap, land, place] .
- T1 a) Long Fall — 24 m leap / b) Twin Descent — 2 charges [charges] · lib `quick`
- T2 a) Pillar — the landing calls a column of light 1.2 s later for 150% [delay] / b) Beacon — followers teleport to your side on landing · lib `burst`
- T3 a) Lift — enemies in the blast are launched (stunned 1.8 s) / b) Dawnfire — the landing burns everything hit [status burn] · lib `hunger`
- T4 a) Second Dawn — a kill with the landing resets it once / b) Halo of Morning — heal 25% and all followers 25% on landing · lib `aegis`

---

### 3.4 Ranger — Precision Ranged · DEX · bow, crossbow, javelin · pet: hunting cat
Signature: **the hunt** — marks quarry, traps, and gives the cat orders.

**1 · `aimed_shot` · Long Draw** (legacy, renamed) — bolt / physical · mult 2.2, cd 5, mp 4, range 42 · *the patient shot* · **Hook:** ignores 50% armour [pen]; +4% damage per metre past 20 m, cap +60% [distance].
- T1 a) Piercing Draw — passes through 3 bodies [pierce] / b) Snap Draw — cd 3, no distance bonus · lib `seeking`
- T2 a) Crippling — target slowed 60% for 3 s / b) Called Shot — against a Quarry target: guaranteed crit [consumes quarry no-remove] · lib `burst`
- T3 a) Deadeye — standing still 1 s before casting: +50% / b) Flushing Shot — the target is knocked 3 m away from you [knock] · lib `brand`
- T4 a) Heartseeker — kills refund the cooldown and mark the nearest enemy as Quarry [onKill reset, primes] / b) Split Arrowhead — on impact splits into 4 shards [split] · lib `unmaking`

**2 · `hunters_snare` · Hunter's Snare** — ground / nature · mult 1.2, cd 10, mp 8, range 20, radius 2.5 · *a trap where they will walk* · **Hook:** a TRAP that arms in 1 s and lasts 30 s (max 2 down): roots 3 s and marks Quarry [place trap, status root, primes quarry].
- T1 a) Thrown Snare — lands armed at once / b) Snare Line — 3 snares in a line 3 m apart · lib `quick`
- T2 a) Barbed — the trap also Bleeds / b) Lure — the trap draws enemies within 10 m toward it [place beacon] · lib `deepen`
- T3 a) Cat's Cue — your cat pounces on whatever triggers it [command pounce] / b) Spring Trap — throws the victim 4 m up and back (stun 1.5 s) [knock] · lib `hunger`
- T4 a) Hunter's Field — max 5 snares, 60 s each / b) Chain Snare — a triggered snare triggers every other snare within 12 m · lib `wellspring`

**3 · `multi_shot` · Broadhead Fan** (legacy, renamed) — bolt / physical · 5 x 0.8, cd 8, mp 10, spread 0.2 · *five arrows* · **Hook:** an arrow that hits a Quarry target splits into 2 more [split on primed].
- T1 a) Wide Fan — 7 arrows, 60° / b) Tight Fan — 3 arrows, all on one line: same body hit 3 times [spread 0] · lib `quick`
- T2 a) Barbed Fan — every arrow Bleeds / b) Ricochet Heads — each arrow bounces once [ricochet 1] · lib `chain`
- T3 a) Backstep Fan — you leap 5 m back as you loose [dash back] / b) Covering Fire — the cat gets Hastened 6 s per arrow that hits [pets status] · lib `echo`
- T4 a) Second Volley — a second fan 0.5 s later / b) Hail of Quarry — every arrow that hits marks Quarry · lib `cascade`

**4 · `quarry_call` · Call the Quarry** — bolt / physical · mult 0.6, cd 14, mp 10, range 40 · *point and say "that one"* · **Hook:** a light arrow that marks Quarry 12 s (takes 20% more from you and the cat) and orders the cat to pounce on it [primes quarry, command focus]; the cat's next bite stuns 1 s.
- T1 a) Flare — reveals and marks everything within 6 m of the hit / b) Long Mark — 20 s · lib —
- T2 a) Blood Scent — the cat heals 5% of its health per bite on the Quarry / b) Kill Order — the cat deals +60% to the Quarry · lib `deepen`
- T3 a) Pass It On — when the Quarry dies, the mark jumps to the nearest enemy [onKill spread] / b) Two Hunters — the cat copies your next Long Draw on the Quarry · lib `hunger`
- T4 a) Pack Tactics — every follower focuses the Quarry / b) Trophy — a Quarry kill restores 20 mana and resets Long Draw · lib `wellspring`

**5 · `trackers_leap` · Tracker's Leap** — dash / physical · mult 1.0, cd 12, mp 8, dash back 9 m, splash 2.5 · *jump out of reach* · **Hook:** leap BACKWARD 9 m, striking where you stood [dash back, leap]; your next shot within 3 s is +50% [empowerNext 1].
- T1 a) Sideways — leap in the direction you are moving / b) Caltrops — leave caltrops where you stood: slow 60% 4 s [pool] · lib `quick`
- T2 a) Snare Drop — leaves a Hunter's Snare [place trap] / b) Flash Powder — enemies within 4 m are Blinded 3 s · lib `burst`
- T3 a) Double Leap — 2 charges [charges] / b) Cat's Swap — the cat takes your old spot and taunts 3 s [taunt pet] · lib `bulwark`
- T4 a) Rain on Them — the empowered shot becomes a Broadhead Fan / b) Vanishing Leap — enemies lose track of you for 2 s (drop threat) · lib `aegis`

**6 · `rain_of_arrows` · Arrow Storm** (legacy, renamed) — ground / physical · mult 1.5, cd 14, mp 16, r 6.5 · *darken the sky* · **Hook:** becomes a 4 s storm, 8 volleys at 30%, each landing at a random point in the circle [repeats, scatter]; Quarry targets in it are hit by every volley.
- T1 a) Narrow Storm — 3.5 m, every volley on the centre / b) Creeping Storm — the circle walks 1 m a volley toward where you aim · lib `wide`
- T2 a) Pinning Rain — each volley slows 20% (stacks) / b) Fire Rain — burning arrows [element fire] · lib `deepen`
- T3 a) Covering Storm — followers inside take 25% less / b) Stragglers — volleys seek enemies within 3 m of the edge [homing] · lib `hunger`
- T4 a) Endless Quiver — a kill inside adds one volley (max +8) / b) Second Storm — 2 charges · lib `conflagration`

---

### 3.5 Rogue — Burst Assassin · DEX · dagger
Signature: **set up, then cash in** — stun / daze primers, backstab bonuses, the Grave Mark. 200% Backstab on stunned targets (the class hook) becomes the `consumes staggered` rule.

**1 · `eviscerate` · Gutting Strike** (legacy, renamed) — melee / physical · mult 2.4, cd 7, mp 8, bleed · *open them up* · **Hook:** +100% against a stunned target [consumes staggered, no remove]; from behind the bleed doubles [behind].
- T1 a) Double Gut — two quick cuts at 60% each, each bleeding / b) Reaching Gut — 4 m lunge into it [dash target 4] · lib `quick`
- T2 a) Hemorrhage-free name: **Open Artery** — the bleed grows with every metre the target walks [status growOnMove] / b) Gutted — the target is Exposed: takes 20% more 5 s [status] · lib `deepen`
- T3 a) Cold Blood — a crit with it refunds its mana and half the cooldown / b) Shiv Throw — becomes a 15 m throw [as bolt] · lib `cauterise`
- T4 a) Bloodletter — Gutting Strike detonates the target's bleeds for 150% of what is left [detonate bleed] / b) Assassin's Mark — kills spread the bleed to everything within 5 m [onKill spread] · lib `unmaking`

**2 · `poison_dart` · Poison Dart** (legacy) — bolt / poison · mult 1.1, cd 5, mp 6, statusMult 1.8 · *the rogue's one DoT* · **Hook:** poison stacks to 3 (each dart adds a stack) [stack].
- T1 a) Fan of Darts — 3 darts [projectiles 3] / b) Blowpipe — silent: a target that is not fighting yet stays unaware (does not chase) for 3 s · lib `seeking`
- T2 a) Numbing — 3 stacks: the target is slowed 50% / b) Toxic Bloom — at 3 stacks the target emits a 3 m poison cloud 4 s [pool] · lib `chain`
- T3 a) Paralytic — 3 stacks: stun 1.5 s [knock stagger] / b) Venom Lash — Gutting Strike consumes poison stacks for +40% each [consumes] · lib `brand`
- T4 a) Epidemic Dart — a poisoned death spreads all stacks 5 m [onKill spread] / b) Six Stacks — max 6 stacks · lib `cascade`

**3 · `sucker_punch` · Sucker Punch** — melee / physical · mult 0.8, cd 10, mp 6, reach 2.6, arc 1.0 · *the dirty opener* · **Hook:** stun 1.6 s [knock stagger]; from behind: 2.4 s.
- T1 a) Ear Clap — also Dazes everything within 3 m [around] / b) Lunge Punch — 6 m dash to the target first [dash target] · lib `quick`
- T2 a) Rattle — the stunned target drops what it carries: loot roll +1 [onHit loot] / b) Opened Guard — the stunned target takes +30% from all sources while stunned · lib `shatter`
- T3 a) Chain Punch — stuns the 2 nearest enemies after the first, 1 s each [chains] / b) Distraction — enemies within 8 m look away (drop threat on you) 3 s · lib `hunger`
- T4 a) Knockout — non-elite targets below 30% health are stunned 5 s / b) Twin Punch — 2 charges · lib `crescendo`

**4 · `grave_mark` · Grave Mark** — bolt / shadow · mult 0.4, cd 20, mp 12, range 30 · *death has an appointment* · **Hook:** the target takes 50% more from YOU for 10 s, and when the mark ends it suffers 30% of all the damage it took during it [primes grave, store detonate].
- T1 a) Two Marks — marks the target and the nearest other enemy / b) Close Mark — instant at melee range, 15 s · lib —
- T2 a) Hunter's Path — you move 30% faster toward a Grave-marked target / b) Bleeding Grave — the stored damage pays out as a 6 s bleed instead (more total: 45%) · lib `deepen`
- T3 a) Settled Account — killing the marked target resets every rogue cooldown below 20 s [onKill reset others] / b) Shadow's Reach — you can Shadow-strike the marked target from 20 m (Sucker Punch and Gutting Strike dash to it) · lib `hunger`
- T4 a) Marked for the Grave-free name: **Last Appointment** — the end burst is 60% and splashes 4 m / b) Endless Debt — the mark refreshes on every crit you land on it · lib `unmaking`

**5 · `slip_away` · Slip Away** — self / shadow · cd 22, mp 10 · *gone* · **Hook:** drops all threat, leaves a decoy dummy that taunts for 4 s (36% of your health) [decoy, taunt], and your next hit within 6 s counts as from behind [empowerNext behind].
- T1 a) Long Slip — 8 s decoy / b) Running Slip — +50% move speed 4 s · lib `quick`
- T2 a) Rigged Decoy — the decoy explodes for 120% when it ends or dies [burstOnExpire] / b) Smoke Decoy — the decoy blinds what strikes it · lib `deepen`
- T3 a) Return Slip — press again within 6 s to swap places with the decoy [dash swap] / b) Ambusher-free name: **From Nowhere** — the empowered hit stuns 1.5 s · lib `hunger`
- T4 a) Two Decoys / b) Ghost — 2 s untargetable after casting · lib `aegis`

**6 · `knife_storm` · Knife Storm** — around / physical · mult 0.5 x 8, cd 22, mp 22, r 7 · *a ring of thrown knives, every one aimed* · **Hook:** each of 8 pulses throws a knife at a DIFFERENT enemy within 7 m (seeking), favouring stunned or marked ones [aura nearestOnly multi].
- T1 a) Knife Ring — every pulse hits everything within 4 m instead / b) Long Storm — 12 pulses · lib `quick`
- T2 a) Poisoned Edges — every knife adds a Poison Dart stack / b) Bleeding Edges — every knife bleeds · lib `deepen`
- T3 a) Return Knives — knives come back through their path [returns] / b) Storm Step — every 3rd knife teleports you behind its target [dash behind] · lib `hunger`
- T4 a) Grave Storm — all knives at a Grave-marked target if one exists / b) Endless Knives — a kill adds 2 pulses · lib `cascade`

---

### 3.6 Cleric — Primary Healer · INT · staff, scepter, wand
Signature: **protection and recovery** — heals that overflow into barriers, a sanctuary zone, raising fallen followers.

**1 · `mend` · Mend** (legacy) — self / holy · heal 35%, cd 14, mp 18 · *close the wound* · **Hook:** also heals every follower 20% of THEIR health [healPets]; overhealing on you becomes a barrier up to 10% [barrier].
- T1 a) Quick Mend — 20%, cd 7 / b) Deep Mend — 50%, cd 20 · lib —
- T2 a) Lingering Mend — half the heal arrives over 6 s more [regen] / b) Purifying Mend — removes Curse, Poison, Burn, Bleed from you [cleanse] · lib `deepen`
- T3 a) Shared Mend — each follower healed adds 2% to your own heal / b) Mend Burst — the heal pulses out 6 m, striking enemies for 80% holy · lib `echo`
- T4 a) Triage — below 30% health the heal doubles / b) Second Mend — 2 charges [charges] · lib `wellspring`

**2 · `sunlance` · Sunlance** — beam / holy · mult 1.5, cd 6, mp 10, range 24, width 1.4 · *a cleric that can still hurt you* · **Hook:** every enemy struck heals you and followers 2% [onHit heal pets]; undead and fiend are Seared [familyBonus].
- T1 a) Wide Lance — width 3 m / b) Piercing Light — range 36 m, +20% on the last body hit · lib `pierce`
- T2 a) Blinding Lance — Blinded 3 s / b) Kindled — enemies hit are Lit: Verdict lands on them 0.3 s faster and +30% [primes lit] · lib `drain`
- T3 a) Prism — splits into 3 beams 20° apart [projectiles] / b) Healing Line — passing over a follower heals it 8% · lib `brand`
- T4 a) Searing Day — the lance burns for 3 s along its line [line pool] / b) Holy Echo — a second lance 0.5 s later · lib `crescendo`

**3 · `sanctuary` · Sanctuary** — ground / holy · cd 24, mp 26, range 20, radius 5, 6 s · *a circle nothing evil will enter* · **Hook:** a WARD: enemies inside are pushed out each second and cannot enter; you and followers inside heal 3% a second [place ward, knock out].
- T1 a) Moving Sanctuary — centred on you, follows you, 4 s [aura] / b) Small Mercy — 3 m, cd 14 · lib `wide`
- T2 a) Burning Edge — enemies pushed out are burned / b) Calm — enemies inside when it lands are put to sleep 3 s [disable sleep] · lib `deepen`
- T3 a) Hallowed Rest — followers inside are revived instantly if fallen [revive] / b) Shelter — projectiles cannot enter it · lib `bulwark`
- T4 a) Long Peace — 12 s / b) Twin Sanctuary — 2 charges · lib `aegis`

**4 · `guardian_light` · Guardian Light** — summon / holy · cd 30, mp 24, lifetime 20 s · *a floating lamp that keeps you alive* · **Hook:** a temporary holy wisp (no follower slot) that heals the most-hurt of you/followers 6% every 2 s and strikes the nearest enemy 40% when nobody needs healing [summon temporary, ability heal].
- T1 a) Twin Lights — 2 wisps, 12 s / b) Steady Light — 35 s · lib `quick`
- T2 a) Shielding Light — its heal becomes a barrier on a full-health target / b) Sun-Bearing — its strike Blinds · lib `deepen`
- T3 a) Lantern Death — when it ends, it bursts healing 15% within 8 m / b) Lamp Bearer — it follows your aim and shines a 4 m zone where enemies take 15% more · lib `hunger`
- T4 a) Choir — up to 3 lights at once / b) Last Light — if you would die while it lives, it dies instead and you heal 30% · lib `aegis`

**5 · `raise_the_fallen` · Raise the Fallen** — self / holy · cd 40, mp 30 · *nobody stays down* · **Hook:** every fallen follower comes back at once at 50% health [revive]; followers alive are healed 30% and Rallied 8 s.
- T1 a) Swift Return — cd 25, 30% health / b) Full Return — 100% health, cd 60 · lib —
- T2 a) Wrath of the Raised — revived followers deal +40% for 10 s / b) Warded Return — revived followers get a 20% barrier · lib `deepen`
- T3 a) Your Turn — if no follower is fallen, heals you 40% instead / b) Pulse of Return — revive pulse strikes enemies 6 m for 150% holy · lib `hunger`
- T4 a) Undying Company — followers who fall in the next 10 s rise again at once / b) Martyr's Return — revives also restore your mana 10 each · lib `wellspring`

**6 · `judgement` · Verdict** (legacy, renamed) — ground / holy · mult 2.4, cd 12, mp 22, r 3.5, delay 0.7 · *the column of light* · **Hook:** if it lands on a Lit / Seared target, a second column falls on the nearest other enemy [consumes lit -> extra cast]; heals followers within the circle 10%.
- T1 a) Wide Verdict — 6 m, delay 1.2 / b) Swift Verdict — no delay, 2.5 m · lib `wide`
- T2 a) Weighed — targets below 30% take +100% [execute] / b) Shackled — the column roots 2 s · lib `deepen`
- T3 a) Three Columns — 3 columns in a line toward your aim [line] / b) Sentence Passed — a kill refunds 50% of the cooldown · lib `hunger`
- T4 a) Final Verdict — undead/fiend under 20% are destroyed (not bosses) / b) Standing Light — the column stays 4 s, pulsing 30% [pool] · lib `conflagration`

---

### 3.7 Bard — Support Maestro · INT · dagger, wand
Signature: **songs** — exclusive auras (`group: song`, one plays at a time) that follow you; switching songs plays a **Finale** of the old one (a one-off burst). Plus sound as a weapon.

**1 · `discord_note` · Discord Note** — bolt / arcane · mult 1.3, cd 3, mp 5, range 30, splash 1.6 · *a sour note thrown like a knife* · **Hook:** ricochets once [ricochet 1]; while a song plays it carries that song's rider (Valour: +haste on you; Ruin: strips; Lull: slows).
- T1 a) Chord — 3 notes, 25° fan / b) Sustained Note — passes through 2 bodies · lib `seeking`
- T2 a) Harmonics — each bounce +25% / b) Off Key — hit targets are Dazed 2 s · lib `chain`
- T3 a) Refrain — every 4th note is free and fires twice / b) Tempo — each hit cuts the active song's switch cost to 0 mana for 3 s · lib `echo`
- T4 a) Crescendo-free name: **Swelling Note** — each consecutive cast within 3 s is +15% (max +60%) / b) Cacophony — notes bounce 4 times · lib `cascade`

**2 · `ballad_of_valour` · Ballad of Valour** — self / holy · song, cd 2 switch, mp 8 · *the march that makes them faster* · **Hook:** an aura 10 m: you and followers +25% attack speed, +10% move [aura group song]. **Finale** when switched away: followers deal +40% for 4 s.
- T1 a) Rousing Verse — also +10% damage / b) Marching Verse — +25% move instead of +10% · lib —
- T2 a) Steel Chorus — followers in it take 10% less / b) Second Wind-free: **Long Breath** — 2 mana a second while it plays [onTick mana] · lib —
- T3 a) Encore — Finale also refreshes every follower's ability cooldowns / b) Heroic-free: **Champion's Verse** — the hero (you) gets double the bonus, followers none · lib —
- T4 a) Anthem — 20 m radius and followers' heal 1% a second / b) Doubled Time — once a minute, a follower acts twice as often for 5 s (the hook's "two turns") · lib —

**3 · `song_of_ruin` · Song of Ruin** — self / shadow · song, cd 2 switch, mp 8 · *the dirge that unmakes them* · **Hook:** an aura 10 m: enemies inside take 12% more and their champion/rare auras are SILENCED (modifier effects off) while inside [aura, silence modifiers]. **Finale:** strips every buff on enemies within 10 m and deals 150% shadow.
- T1 a) Low Dirge — also slows 20% / b) Bitter Verse — enemies take 18% more but radius 6 m · lib —
- T2 a) Rot in Tune — enemies in it lose 1% health a second (true damage, not bosses) / b) Broken Rhythm — enemies' attacks are 20% slower · lib —
- T3 a) Elegy — enemies dying in it heal you 3% / b) Sour Finale — Finale also Curses · lib —
- T4 a) Requiem — Finale damage +100% per 10 s the song played (max +300%) / b) Unmaking Hymn — bosses inside lose 10% armour every 2 s (max 40%) · lib —

**4 · `lullaby` · Lullaby** — ground / arcane · cd 16, mp 16, range 24, r 5 · *every one of them asleep* · **Hook:** sleep 5 s (breaks on damage) on everything in the circle [disable sleep]; the first hit on a sleeper is +100% [consumes sleep].
- T1 a) Wide Lullaby — 8 m, 3 s / b) Deep Lullaby — 8 s, 3 m · lib `wide`
- T2 a) Dream Song — sleepers heal you 1% a second each / b) Restless — sleepers that wake are Dazed 4 s · lib `deepen`
- T3 a) Lull Song — becomes a third SONG: an aura that sleeps one enemy every 2 s / b) Soft Step — sleepers do not wake from YOUR followers' hits · lib `hunger`
- T4 a) Nightmare — when a sleeper wakes it takes 200% shadow / b) Twin Lullaby — 2 charges · lib `aegis`

**5 · `quickstep_jig` · Quickstep Jig** — dash / physical · mult 1.0, cd 10, mp 8, range 10, splash 2 · *dance through the line* · **Hook:** a dash that drops a 3 s Echo of the current song where you started [dash, place aura]; with no song, Dazes everything passed.
- T1 a) Reverse Jig — dash backward / b) Two-Step — 2 charges · lib `quick`
- T2 a) Stomp — the end point knocks 3 m [knock] / b) Swap Partner — swap places with a follower instead [dash swap pet] · lib `burst`
- T3 a) Encore Step — a hit with it refunds the cooldown once / b) Leading Step — followers dash with you · lib `hunger`
- T4 a) Echo Stage — the dropped echo lasts 10 s / b) Blade Dance-free: **Whirling Jig** — spins at the end for 3 hits of 60% · lib `crescendo`

**6 · `grand_finale` · Grand Finale** — around / arcane · mult 3.2, cd 30, mp 30, r 12 · *the last chord* · **Hook:** plays the Finale of EVERY song you own at once and then 320% arcane in 12 m; +25% per follower alive [crowd pets].
- T1 a) Focused Finale — 6 m, +60% / b) Standing Ovation — followers heal 30% · lib `heavy`
- T2 a) Shattering Chord — knocks 6 m [knock] / b) Silence — enemies cannot use abilities 4 s (casters, champions) · lib `shatter`
- T3 a) Encore! — a kill within 1 s refunds half the cooldown / b) Echoing Hall — the chord repeats twice at 40% · lib `echo`
- T4 a) Opus — every song is played at double strength 10 s after / b) Standing Ring — the 12 m ring remains 6 s and pulses 25% · lib `crescendo`

---

### 3.8 Mage — AoE Glass Cannon · INT · staff, wand
Signature: **frost then shatter** — chill builds Frostbite stacks; the mage's big hits pay off on frozen/chilled targets. Arcane for burst windows.

**1 · `frost_shard` · Frost Shard** — bolt / ice · mult 1.3, cd 2.5, mp 5, range 34, splash 1.4 · *the bread and butter* · **Hook:** each hit adds a Frostbite stack (max 5; at 5 the target is Frozen 2 s [stackMax onMax disable]).
- T1 a) Shard Fan — 3 shards / b) Lance Shard — pierces 2 · lib `seeking`
- T2 a) Brittle — Frozen targets take +30% from all / b) Splinter — splits into 3 shards on a Frozen target [split] · lib `chain`
- T3 a) Cold Snap-free: **Icy Recoil** — a kill returns 6 mana / b) Glacial Weight — every 3rd shard stuns 0.5 s · lib `cauterise`
- T4 a) Deep Freeze-free: **Winter's Heart** — Frostbite max 8, Frozen lasts 3 s / b) Shard Hail — 2 charges · lib `cascade`

**2 · `frost_nova` · Rime Burst** (legacy, renamed) — around / ice · mult 1.2, cd 9, mp 14, r 6 · *push them off you, frozen* · **Hook:** adds 3 Frostbite stacks and knocks 2 m [knock].
- T1 a) Frozen Ring — roots 2 s instead of knocking / b) Glacial Step — you also dash 6 m backward [dash back] · lib `wide`
- T2 a) Ice Rink — leaves a 6 s patch that slows 60% [pool] / b) Shatter Ring — Frozen targets in it take 200% [consumes frozen] · lib `linger`
- T3 a) Remote Nova — cast at your aim point, 20 m [as ground] / b) Frost Armour — gain 20% barrier [barrier] · lib `bulwark`
- T4 a) Second Nova — fires again at 6 m around the first ring 1 s later [repeats grow] / b) Permafrost — patch 12 s and adds a stack a second · lib `conflagration`

**3 · `ice_lance` · Rime Spear** (legacy, renamed) — beam / ice · mult 1.9, cd 7, mp 12, range 26 · *the payoff* · **Hook:** +100% and consumes Frostbite: +15% per stack [consumes frostbite per stack].
- T1 a) Long Spear — 40 m / b) Twin Spears — 2 beams 10° apart · lib `pierce`
- T2 a) Shatter Spear — Frozen targets explode 3 m for 80% [onHit burst] / b) Keep the Cold — does not consume stacks; adds 1 · lib `shatter`
- T3 a) Spear Volley — 3 charges, cd 9 [charges] / b) Pinning Spear — the last body is rooted 3 s · lib `brand`
- T4 a) Glacier Line — leaves a wall of ice along the beam 6 s that blocks enemy movement (stops at it) [line] / b) Permanent Edge — a kill resets it [onKill reset] · lib `cascade`

**4 · `arcane_surge` · Arcane Surge** — self / arcane · cd 30, mp 20, 8 s · *pour everything into the next spells* · **Hook:** the next 3 skills deal +60% and cost no mana, then you are Drained (mana regen stops 4 s) [empowerNext].
- T1 a) Long Surge — 5 skills at +40% / b) Short Surge — 1 skill at +200% · lib `quick`
- T2 a) Overflow — each empowered skill restores 4% health / b) Resonance — empowered skills chain to 1 extra target · lib `deepen`
- T3 a) Surge Nova — casting it releases a 6 m arcane blast 150% / b) No Backlash — no Drained period · lib `echo`
- T4 a) Unbound — while Surging, cooldowns run 50% faster / b) Twin Surge — empowered skills fire twice at 60% · lib `crescendo`

**5 · `blizzard` · Whiteout** (legacy, renamed) — ground / ice · mult 0.35 x6, cd 14, mp 24, r 5.5 · *the weather turns* · **Hook:** every pulse adds a Frostbite stack [primes per pulse] — so a full Whiteout Freezes anything that stays.
- T1 a) Wide Whiteout — 8 m, -20% per pulse / b) Long Whiteout — 10 pulses · lib `wide`
- T2 a) Hailstones — each pulse also drops a 150% hailstone on one random enemy / b) Drifts — slows 70% · lib `deepen`
- T3 a) Moving Storm — the storm drifts toward your aim [follow aim] / b) Eye of Winter — you heal 2% a pulse while inside · lib `hunger`
- T4 a) Glacial Age — Frozen targets inside are frozen until it ends / b) Twin Storms — 2 charges · lib `conflagration`

**6 · `absolute_zero` · Absolute Zero** — ground / ice · mult 3.0, cd 30, mp 34, range 30, r 7, delay 1.5 · *stop everything, then break it* · **Hook:** everything in 7 m is Frozen 4 s (stasis, does not break), then shatters for 300% + 40% per Frostbite stack [disable, consumes].
- T1 a) Wide Zero — 10 m / b) Close Zero — centred on you, no delay · lib `wide`
- T2 a) Shrapnel Ice — the shatter throws shards at enemies within 10 m [split] / b) Long Cold — frozen 6 s · lib `shatter`
- T3 a) Cold Fusion — Arcane Surge's next skill is free if cast during the freeze / b) Hoarfrost — frozen targets take 25% more from everything · lib `hunger`
- T4 a) Second Zero — a kill with the shatter resets it once / b) Ice Age — leaves a 10 s Whiteout on the spot · lib `cascade`

---

### 3.9 Necromancer — Army Builder · INT · staff, wand, scepter · pet: 2 bone thralls + bone archer
Signature: **corpses** — kills leave corpses for 20 s; skills raise or burn them.

**1 · `marrow_lance` · Marrow Lance** — bolt / shadow · mult 1.4, cd 3, mp 6, range 34 · *a spike of bone* · **Hook:** pierces 2; a kill leaves a corpse even on things that normally vanish [pierce, onKill corpse].
- T1 a) Bone Fan — 3 lances / b) Long Marrow — pierces everything to 40 m · lib `seeking`
- T2 a) Splinters — on a kill, the lance splits into 4 [split] / b) Rot Tip — poisons · lib `burst`
- T3 a) Ossify — the 3rd body is rooted 2 s / b) Thrall's Share — every hit heals your thralls 3% · lib `brand`
- T4 a) Bone Harvest — kills return 5 mana / b) Lance Rain — 2 charges · lib `cascade`

**2 · `raise_thrall` · Raise Thrall** (legacy) — summon / shadow · cd 26, mp 20 · *one more of them* · **Hook:** if a corpse is within 12 m it is consumed and the thrall rises THERE at once with +50% health; else as now [consumeCorpses].
- T1 a) Mass Raise — consumes up to 3 corpses, each a temporary thrall for 20 s / b) Bone Archer — raises a bone archer instead · lib `quick`
- T2 a) Rotten Thrall — thralls poison on hit / b) Armoured Dead — thralls get 30 armour · lib `deepen`
- T3 a) Thrall Burst — a thrall that falls explodes 4 m for 120% [burstOnExpire] / b) Grave Bond — 10% of damage you take is moved to your thralls · lib `bulwark`
- T4 a) Bone Lord — one thrall is raised as an elite: 3x health, cleaves / b) Undying Ranks — fallen thralls return in 5 s instead of the usual wait · lib `aegis`

**3 · `corpse_pyre` · Corpse Pyre** — ground / shadow · mult 1.6 per corpse, cd 10, mp 14, range 26, r 10 · *their dead are your ammunition* · **Hook:** every corpse within 10 m of the aim point explodes for 160% in 4 m [consumeCorpses burst]; with no corpses it consumes 10% of a thrall's health instead to explode IT (thrall survives).
- T1 a) Chain Pyre — each explosion can make a new corpse that explodes / b) Focused Pyre — corpses fling bone at the aimed enemy instead · lib `wide`
- T2 a) Rot Pyre — explosions poison / b) Cold Pyre — explosions chill · lib `deepen`
- T3 a) Pyre Feast — each corpse heals you 3% / b) Gruesome — enemies hit are Dazed 3 s (fear-like) · lib `drain`
- T4 a) Grand Pyre — radius 16 m / b) Sacrifice — instead of a corpse, a living thrall is sacrificed for 400% · lib `conflagration`

**4 · `drain` · Grave Draught** (legacy, renamed) — beam / shadow · mult 1.5, cd 9, mp 12, heal 12% · *drink from them* · **Hook:** becomes a channel up to 3 s [channel]; heals your thralls as much as you.
- T1 a) Wide Draught — 3 m width / b) Tether — locks to the first body hit and follows it · lib `pierce`
- T2 a) Rot Draught — leaves poison / b) Mana Draught — heals mana instead of health · lib `drain`
- T3 a) Feast — overheal becomes a barrier [barrier] / b) Shared Cup — 50% of the heal goes to whichever thrall is lowest · lib `bulwark`
- T4 a) Unending — kills while channelling extend it 1 s / b) Soul Cup — at the end, raises a temporary thrall from each body killed · lib `wellspring`

**5 · `toxic_cloud` · Plague Cloud** (legacy, renamed) — ground / poison · mult 0.25 x8, cd 14, mp 20, r 5 · *the death coil's cousin* · **Hook:** poison AND bleed together (the class hook) [status x2]; enemies dying in it leave corpses that also emit a 2 m cloud 3 s.
- T1 a) Rolling Cloud — drifts toward your aim / b) Thrall Cloud — the cloud follows one thrall · lib `wide`
- T2 a) Sapping — enemies in it deal 20% less / b) Choking — enemies in it are slowed 40% · lib `deepen`
- T3 a) Contagion — a death spreads both statuses 5 m [onKill spread] / b) Fertile Ground — corpses in it can be raised as thralls by Raise Thrall for free · lib `hunger`
- T4 a) Plague Lord — 16 pulses / b) Twin Clouds — 2 charges · lib `conflagration`

**6 · `buried_march` · March of the Buried** — summon / shadow · cd 60, mp 40, lifetime 18 s · *every corpse stands up* · **Hook:** one temporary thrall per corpse within 20 m (max 8), plus 2 from the ground; they do not take follower slots [temporary, consumeCorpses].
- T1 a) Long March — 30 s / b) Quick March — temporary thralls are Hastened · lib `quick`
- T2 a) Explosive Dead — they burst when the march ends [burstOnExpire] / b) Plague Dead — they poison · lib `deepen`
- T3 a) Captains — every 4th one is a bone archer / b) Bone Wall — they spawn in a line where you aim and taunt 4 s [taunt] · lib `hunger`
- T4 a) Endless March — a kill by a marcher adds a marcher (max 12) / b) Army Commander — all thralls (permanent too) get +40% while it lasts · lib `crescendo`

---

### 3.10 Warlock — Chaos Dealer · INT · staff, wand · pet: bound imp + familiar
Signature: **health as fuel and corruption that spreads** — `hpCost` skills, DoTs that jump on death (`onKill spread`).

**1 · `gnawing_dark` · Gnawing Dark** — bolt / shadow · mult 0.9, cd 3, mp 6, statusMult 1.6 · *it eats from the inside* · **Hook:** a curse-DoT (Gnawed, 8 s) that JUMPS to the nearest enemy within 8 m when its host dies [onKill spread].
- T1 a) Splatter — 3 m splash / b) Long Hunger — 12 s · lib `seeking`
- T2 a) Deepening Dark — each jump +25% / b) Weakening — Gnawed targets deal 15% less · lib `deepen`
- T3 a) Soul Feed — each jump heals you 3% / b) Spread Thin — it jumps to 2 enemies · lib `brand`
- T4 a) Plague of Dark — every tick has a 10% chance to jump without a death / b) Devour — on a kill, the host's remaining DoT is paid out at once [detonate] · lib `cascade`

**2 · `bind_imp` · Bind a Fiend** (legacy) — summon / shadow · cd 32, mp 22 · *call the imp* · **Hook:** costs 10% health, not just mana [hpCost]; the imp's bolts carry Gnawing Dark [pet status].
- T1 a) Fire Imp — the imp burns instead / b) Two Imps — count 2, 50% health each · lib `quick`
- T2 a) Imp Leash — the imp taunts what it hits / b) Sacrificial Imp — press again to detonate the imp for 300% and refund its cooldown · lib `deepen`
- T3 a) Blood Link — the imp heals you 30% of its damage / b) Fiendish Swap — press again to swap places with the imp · lib `hunger`
- T4 a) Greater Fiend — the imp becomes a brute fiend with 3x health and a cleave / b) Infernal Pact — while the imp lives, your skills cost 20% less · lib `aegis`

**3 · `curse` · Hex of Ruin** (legacy, renamed) — bolt / shadow · mult 0.8, cd 12, mp 14, splash 5, curse · *mark them all* · **Hook:** cursed enemies take +25% from DoTs specifically (on top of the curse) [status field dotTakeMore].
- T1 a) Wide Hex — 8 m / b) Hex Swarm — three hexes at three enemies · lib `burst`
- T2 a) Hex of Weakness — also Weakened / b) Hex of Haste — the curse also slows 40% · lib `deepen`
- T3 a) Doomed — when the hex ends, 30% of damage taken during it lands at once [store] / b) Sharing Pain — damage to a hexed target splashes 15% to other hexed targets · lib `brand`
- T4 a) Eternal Hex — kills refresh the hex on all others / b) Ruinous Hex — hexed targets below 20% health die (not bosses) · lib `unmaking`

**4 · `soul_pact` · Soul Pact** — self / shadow · cd 30, hpCost 20%, 10 s · *the class hook: double the DoTs, pay in blood* · **Hook:** your damage-over-time ticks twice as often for 10 s [status dotRate x2]; kills during it give back 5% health.
- T1 a) Cheaper Pact — 10% health, 6 s / b) Deeper Pact — 30%, 15 s · lib —
- T2 a) Blood Price-free: **Tithe** — your skills cost health not mana during it (no mana spent) / b) Fiend Pact — the imp gets the same doubling · lib `deepen`
- T3 a) Breaking Pact — when it ends, every DoT on every enemy is detonated at 50% [detonate] / b) Pact Ward — a barrier worth the health paid [barrier] · lib `hunger`
- T4 a) Endless Pact — each kill adds 1 s / b) Pact of Doom — DoTs on bosses also double in damage · lib `crescendo`

**5 · `void_rift` · Void Rift** (legacy) — ground / shadow · 0.45 x4, pull 2.5, cd 16, mp 24 · *drag them into the hole* · **Hook:** the rift copies every DoT on any body it pulls to every other body it pulls [spread].
- T1 a) Long Rift — 8 pulses / b) Deep Rift — pull 4 m, 3 pulses · lib `wide`
- T2 a) Rift Burn — fire DoT / b) Rift Hunger — each pulse heals you 1% per body · lib `deepen`
- T3 a) Collapse — at the end, a 250% implosion [delay] / b) Rift Gate — you can dash into the rift (press again) [dash to point] · lib `hunger`
- T4 a) Twin Rifts — 2 charges / b) Singularity — pull 6 m and stun everything 1.5 s at the end · lib `conflagration`

**6 · `abyss_gate` · Abyss Gate** — ground / fire · mult 0.6 per bolt, cd 40, mp 34, hpCost 10%, 10 s · *a door that fires at them* · **Hook:** a placed gate (totem) that hurls a chaos bolt every 0.5 s at a random enemy within 20 m, each bolt applying Gnawing Dark or Burn [place totem, statusPool].
- T1 a) Stable Gate — always aims at the nearest / b) Wide Gate — two bolts each pulse at 60% · lib `quick`
- T2 a) Feeding Gate — bodies that die in 20 m extend it 1 s / b) Spilling Gate — bolts splash 3 m · lib `deepen`
- T3 a) Fiend Door — a temporary imp steps out every 3 s (max 3) [summon temporary] / b) Hungry Gate — it drinks 2% of your health a second for +50% · lib `hunger`
- T4 a) Gate Collapse — ends in a 10 m 400% blast / b) Twin Gates — 2 charges · lib `cascade`

---

### 3.11 Demon Hunter — Specialist Killer · DEX · crossbow, dagger · pet: dire companion
Signature: **Grudge** — a resource (max 5) gained when you, or a follower, are struck (and on kills of fiends); spent by finishers. +50% vs fiend [familyBonus].

**1 · `hex_bolt` · Brand Bolt** — bolt / shadow · mult 1.5, cd 3.5, mp 4, range 40 · *a crossbow bolt cut with a sigil* · **Hook:** +50% vs fiend and aberration [familyBonus]; branded targets give 1 Grudge when they hit you or your hound [primes brand].
- T1 a) Twin Bolt — 2 bolts / b) Heavy Brand — 1 bolt, pierces 2 · lib `seeking`
- T2 a) Searing Brand — the brand burns / b) Shackle Brand — slows 40% · lib `burst`
- T3 a) Grudge Bolt — hitting a branded target gains 1 Grudge directly / b) Ricochet Brand — bounces 2 [ricochet] · lib `brand`
- T4 a) Brand of Ruin — branded targets take +20% from your hound / b) Sigil Burst — a branded kill bursts 4 m and brands everything hit [onKill burst + primes] · lib `cascade`

**2 · `tumbling_shot` · Tumbling Shot** — dash / physical · mult 1.2, cd 8, mp 6, dash back 7 m · *roll away, shoot back* · **Hook:** roll backward 7 m and loose 3 bolts at your aim in the middle of the roll [dash back + projectiles 3]; gains 1 Grudge if something was within 3 m when you rolled.
- T1 a) Forward Tumble — roll toward the aim instead / b) Double Tumble — 2 charges · lib `quick`
- T2 a) Caltrop Roll — leave slowing caltrops [pool] / b) Hound's Cover — the hound taunts what was near you [command guard] · lib `burst`
- T3 a) Fan of Bolts — 5 bolts / b) Explosive Bolts — bolts burst 2 m · lib `hunger`
- T4 a) Shadow Roll — 1 s untargetable in the roll / b) Vengeful Tumble — +25% per Grudge held (does not spend) · lib `crescendo`

**3 · `chain_hook` · Chain Hook** — beam / physical · mult 1.0, cd 10, mp 8, range 18, width 1.2 · *drag it here* · **Hook:** pulls the first body hit to your feet [pullIn self] and stuns it 0.8 s; a fiend pulled gives 1 Grudge.
- T1 a) Long Chain — 26 m / b) Reverse Hook — pulls YOU to it instead [dash to target] · lib `pierce`
- T2 a) Barbed Chain — bleeds / b) Hound's Catch — the hound is ordered to bite the pulled body at once [command pounce] · lib `shatter`
- T3 a) Double Hook — pulls the first 2 bodies / b) Chain Slam — the pulled body is slammed down: 3 m blast 120% · lib `brand`
- T4 a) Anchor — the hooked body is rooted 3 s at your feet / b) Hook Reset — a kill within 3 s resets it · lib `crescendo`

**4 · `unleash_hound` · Unleash the Hound** — self / physical · cd 18, mp 10 · *off the leash* · **Hook:** the dire companion is Hastened 8 s, pounces on your aimed target (knock 2 m) and its bites give you 1 Grudge each [command pounce, pets status]. If the hound is fallen, it returns at once at 50%.
- T1 a) Savage — the pounce stuns 1.5 s / b) Pack of One — a second, temporary hound for 10 s [summon temporary] · lib `quick`
- T2 a) Rending — bites bleed / b) Guardian — the hound taunts 4 s on landing · lib `deepen`
- T3 a) Blood Bond — the hound's damage heals you 10% / b) Hunt Together — you dash to the hound's target with it [dash target] · lib `hunger`
- T4 a) Alpha — the hound grows: +100% health 15 s / b) Endless Hunt — each hound kill adds 2 s · lib `aegis`

**5 · `grudge_bolt` · Settle the Grudge** — bolt / shadow · mult 0.9 + 0.6 per Grudge, cd 6, mp 8, range 40 · *every wrong, returned* · **Hook:** spends ALL Grudge: +60% per point and, at 5, it pierces everything and stuns 1 s [spend grudge].
- T1 a) Scatter — splits into 1 bolt per Grudge / b) Close Quarters — becomes a 6 m cone at melee [as melee] · lib —
- T2 a) Branded Payment — at 3+ it brands everything it hits / b) Keep a Little — leaves 1 Grudge · lib `burst`
- T3 a) Bloodletting — heals 4% per point spent / b) Hound's Share — the hound gets +10% damage per point for 6 s · lib `brand`
- T4 a) Full Debt — at 5, it fires twice / b) Vengeance Never Sleeps — a kill with it refunds 2 Grudge · lib `crescendo`

**6 · `night_hunt` · Night Hunt** — self / shadow · cd 45, mp 30, 12 s · *the hunter becomes the threat* · **Hook:** for 12 s you gain 1 Grudge every 2 s, Settle the Grudge has no cooldown, and fiends you strike are Feared (flee 2 s) [status, cooldown override].
- T1 a) Short Hunt — 6 s, cd 25 / b) Long Hunt — 18 s · lib —
- T2 a) Shadow Skin — 20% less damage taken during it / b) Hunter's Speed — +30% move · lib `deepen`
- T3 a) Pack Hunt — the hound shares it: Hastened, +40% / b) Night Brand — every bolt brands · lib `hunger`
- T4 a) Executioner — Settle the Grudge executes fiends below 30% [execute] / b) Endless Night — a fiend kill adds 2 s · lib `crescendo`

---

### 3.12 Scavenger — Resource Specialist · DEX · dagger, sword, hammer, javelin
Signature: **luck** — random status/element pools, variance, and loot off kills. High floor of utility, high ceiling of chaos.

**1 · `lucky_strike` · Lucky Strike** — melee / physical · mult 1.5, cd 4, mp 3 · *hit and see what happens* · **Hook:** applies one RANDOM status from [burn, poison, bleed, chill, shock, weaken, web] [statusPool].
- T1 a) Loaded Dice — roll twice, keep the one the target does not have / b) Lucky Throw — becomes a 20 m javelin throw [as bolt] · lib `quick`
- T2 a) Double Luck — 2 statuses / b) Jackpot — 10% chance the status is 3x as long · lib `deepen`
- T3 a) Pocket It — a kill drops 5-15 extra gold [onKill loot gold] / b) Streak — each different status on a target adds +10% to Lucky Strike · lib `hunger`
- T4 a) All In — applies every status in the pool, cd 10 / b) Lucky Break — a crit resets it · lib `crescendo`

**2 · `junk_toss` · Junk Toss** — bolt / physical · mult 1.4, cd 6, mp 6, range 26 · *throw whatever is in the bag* · **Hook:** a random thrown object each cast [elementPool]: rock (stun 0.6), bottle (fire pool 3 s), pot (poison cloud), nail bag (3 shards), iron pan (knock 3 m) — the HUD shows the next one in the slot.
- T1 a) Sorted Bag — you can see AND hold the next one (press while held: skip for 1 mana) / b) Heavy Junk — +50%, 20 m · lib `seeking`
- T2 a) Bigger Bag — 2 objects at once / b) Bouncing Junk — bounces once [ricochet] · lib `burst`
- T3 a) Salvage — hits restore 1 mana / b) Booby Trap — the object lies on the ground as a trap if it misses [place trap] · lib `brand`
- T4 a) Bag of Holding-free: **Bottomless Sack** — 2 charges / b) Lucky Find — 5% of tosses throw a gold coin bag: 300% + gold · lib `cascade`

**3 · `scrounge` · Scrounge** — self / physical · cd 20, mp 6, 15 s · *the scavenger's instinct* · **Hook:** for 15 s, each kill has a 35% chance to drop a pickup at the body (a health draught 10%, a mana draught 15, or 20 gold) [onKill loot pickup].
- T1 a) Keen Eye — 50% chance / b) Long Scrounge — 30 s · lib —
- T2 a) Sharing — pickups also heal followers / b) Gear Find — 3% chance per kill of an extra item roll · lib `deepen`
- T3 a) Stocked — the first pickup is dropped at your feet as you cast / b) Pack Rat — while Scrounge runs, Junk Toss costs no mana · lib `hunger`
- T4 a) Fortune — magic find +25% while it runs / b) Never Wasted — a pickup you do not need is auto-converted to 15 gold · lib `wellspring`

**4 · `caltrop_scatter` · Caltrop Scatter** — ground / physical · cd 12, mp 8, range 16, r 4 · *the ground is now a problem* · **Hook:** scatters 6 small traps over 4 m (each triggers once: 80% + bleed + slow 50% 3 s) [place trap x6].
- T1 a) Wide Scatter — 10 traps over 7 m / b) Tight Scatter — 4 traps, all on the aimed point, 160% · lib `quick`
- T2 a) Rusty — poison too / b) Sticky — root 1.5 s · lib `deepen`
- T3 a) Behind Me — scatter at your feet while you dash 4 m back / b) Bait — traps lure enemies within 6 m [beacon] · lib `hunger`
- T4 a) Field of Iron — traps last 60 s, max 18 / b) Chain Reaction — a triggered trap triggers its neighbours · lib `wellspring`

**5 · `smoke_bomb` · Rag-and-Pitch Bomb** — ground / fire · mult 1.6, cd 14, mp 12, range 22, r 4 · *a lit bundle of junk* · **Hook:** lands, then explodes 1 s later; the explosion rolls a random element from [fire, poison, lightning, ice] and leaves a 4 s pool of it [delay, elementPool, pool].
- T1 a) Cluster — splits into 3 small bombs / b) Big Bang — 7 m, knock 3 m · lib `wide`
- T2 a) Smoky — enemies inside are Blinded 3 s / b) Sticky Pitch — slowed 60% · lib `linger`
- T3 a) Fuse Control — press again to blow it early / b) Scrap Shrapnel — shards at 4 enemies outside the circle [split] · lib `hunger`
- T4 a) Second Bomb — 2 charges / b) Lucky Blast — 20% chance the blast is all four elements at once · lib `conflagration`

**6 · `big_score` · Big Score** — melee / physical · cd 22, mp 16, variance 0.2x to 6x · *the class hook: crit huge or whiff* · **Hook:** mult rolls between 0.2 and 6.0 (average 2.6) [variance]; a roll above 4 is a guaranteed crit and drops 50-150 gold.
- T1 a) Safe Bet — 1.5 to 3.5 / b) Long Odds — 0 to 10 · lib —
- T2 a) Weighted — each Lucky Strike status on the target raises the floor by 0.4 / b) Double or Nothing — a whiff (<1) refunds the cooldown · lib —
- T3 a) Payout — the roll is also paid as gold x2 on a kill / b) Insurance — a whiff heals you 15% · lib `hunger`
- T4 a) House Edge — roll twice, keep the better / b) Jackpot Strike — a roll above 5 also hits everything within 6 m · lib `crescendo`
