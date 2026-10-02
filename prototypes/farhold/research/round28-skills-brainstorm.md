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

---

### 3.13 Swashbuckler — Flashy Duelist · DEX · sword, dagger
Signature: **Flair** (resource, max 5) — built by *variety*: a skill gains extra Flair when the skill cast before it was a DIFFERENT one, and by crits; Grandeur spends it all [resource flair]. The swashbuckler is rewarded for rotating, never for spamming.

**1 · `flourish` · Flourish** — melee / physical · mult 1.4, cd 3, mp 3, reach 3, arc 1.6 · *a showy cut* · **Hook:** +1 Flair, +2 if the previous skill you cast was a different one [resource, sequence].
- T1 a) Twirl — becomes a 360° cut at 3.2 m; +1 Flair per 2 enemies hit [as around] / b) Lunging Flourish — a 5 m dash into the cut [dash target] · lib `quick`
- T2 a) Showboat — at 3+ Flair the cut knocks 2 m [knock when resource≥3] / b) Ribbon Cuts — one Bleed stack per Flair held [stack status] · lib `shatter`
- T3 a) Twice for the Crowd — a crit repeats the cut at once at 60% [onCrit repeat] / b) Disarming Flick — the target deals 25% less for 3 s [status weaken] · lib `cauterise`
- T4 a) Perfect Rhythm — 5 different skills in a row: the next Flourish is free and fills Flair [sequence] / b) Taunting Flourish — taunts the target 3 s and you take 15% less from it [taunt] · lib `crescendo`

**2 · `daring_leap` · Daring Leap** — dash / physical · mult 1.2, cd 9, mp 6, leap 10 m, land r 2.5 · *off the table, onto them* · **Hook:** a leap that lands BEHIND the aimed enemy; your hits count as from behind for 2 s [leap, dash behind]; +1 Flair.
- T1 a) Rope Swing — 16 m leap / b) Vault Back — after landing, spring 5 m back off the target [dash back] · lib `quick`
- T2 a) Boot to the Face — the landing stuns the target 1 s [knock stagger] / b) Showstopper — landing within 3 m of 3+ enemies gains 2 Flair [crowd] · lib `burst`
- T3 a) Twin Leap — 2 charges [charges] / b) Cape Toss — the landing drops your cape: everything under it is Blinded 3 s [pool status] · lib `bulwark`
- T4 a) Untouchable — 1.5 s after landing you evade every attack [selfStatus evade] / b) Chandelier Drop — 1 s after landing, a 6 m ring of falling debris for 150% [delay around] · lib `crescendo`

**3 · `mocking_parry` · Mocking Parry** — self / physical · cd 10, mp 4, window 1.5 s · *laugh at their swing* · **Hook:** the next melee hit inside 1.5 s is evaded completely, the attacker is taunted 3 s, and you gain 2 Flair [counter window, taunt]. Unlike the fighter's Riposte it does not hit back — it is a resource tool and a taunt.
- T1 a) Long Laugh — 2.5 s window that catches up to 3 hits / b) Flick Back — each evaded hit is answered with a 60% flick · lib `quick`
- T2 a) Insult — the taunted enemy deals 20% less [status weaken] / b) Crowd Pleaser — each evade gives followers +20% damage for 4 s [pets status] · lib `deepen`
- T3 a) Showing Off — an evade resets Daring Leap [resetOn → other skill] / b) Arrow Dance — the window also evades ranged hits [counter ranged] · lib `bulwark`
- T4 a) Centre Stage — taunts everything within 8 m; +1 Flair per evade [taunt radius] / b) Never Touched — if the window passes with nothing hitting you, your next Grandeur costs only 3 Flair [condition] · lib `aegis`

**4 · `pinning_thrust` · Pinning Thrust** — beam / physical · mult 1.6, cd 8, mp 6, range 6, width 1 · *nail their boot to the deck* · **Hook:** roots the first body 2 s; if you hold Flair it spends 1 for +50% and a 3 s root [spend optional].
- T1 a) Long Thrust — 10 m / b) Twin Thrust — two thrusts 0.25 s apart, the second +40% on a rooted body [repeats, consumes root] · lib `pierce`
- T2 a) Pinned Pair — pierces and roots up to 3 bodies / b) Disarm — the target cannot attack 2 s [disable] · lib `shatter`
- T3 a) Vault Over — after the thrust you vault 4 m over the pinned body to its back [dash behind] / b) Spill — a pinned body that dies drops 15 gold and 1 Flair [onKill loot] · lib `brand`
- T4 a) Pinwheel — rooted enemies take +30% from Flourish [primes] / b) Run Through — +20% per Flair held without spending any · lib `crescendo`

**5 · `matadors_turn` · Matador's Turn** — around / physical · mult 1.3, cd 12, mp 10, r 4 · *step aside and let them stumble* · **Hook:** enemies within 4 m are spun round — every hit on them counts as from behind for 3 s [status exposedBack] — and Dazed; +1 Flair per enemy (max 3).
- T1 a) Wide Cape — 6 m / b) Bull Run — enemies that were running at you are thrown 4 m past you [knock through] · lib `wide`
- T2 a) Tangled Cape — slowed 50% 3 s / b) Red Rag — enemies hit attack each other for 3 s [confuse] · lib `shatter`
- T3 a) Exit Stage — dash 5 m out after the turn [dash back] / b) Costly Flourish — spends 2 Flair to stun everything 1.5 s instead [spend] · lib `hunger`
- T4 a) Second Pass — repeats 1 s later [repeats] / b) Crowd Favourite — a kill within 3 s refunds the cooldown [onKill reset] · lib `aegis`

**6 · `grandeur` · Grandeur** — melee / physical · mult 1.0 + 0.9 per Flair, cd 20, mp 12, reach 4, arc 2 · *the legendary strike* · **Hook:** spends all Flair; at 5 it is a guaranteed crit and becomes a 360° 6 m cut [spend flair].
- T1 a) Curtain Call — at 5 Flair it is a 10 m dash through everything instead [as dash when resource=5] / b) Measured — spends 3, keeps 2 · lib `heavy`
- T2 a) Applause — heals 3% per Flair spent / b) Bleeding Bow — one Bleed stack per Flair spent · lib `shatter`
- T3 a) Bow Out — a kill refunds 2 Flair [onKill resource] / b) Spotlight — followers +5% damage per Flair spent for 8 s [pets status] · lib `hunger`
- T4 a) Legend — Flair holds up to 7 [resource max] / b) Final Bow — after Grandeur you are untargetable 1 s and gain 1 Flair a second for 3 s · lib `crescendo`

---

### 3.14 Dragon Knight — Draconic Warrior · STR · sword2h, axe2h
Signature: **Aspect** — an exclusive toggle (fire / ice / lightning) that sets the ELEMENT of every Dragon Knight skill [form group aspect, elementFrom aspect]; **Draconic Fury** turns every attack into an area attack.

**1 · `scale_rend` · Scale Rend** — melee / aspect · mult 1.6, cd 5, mp 5, reach 3.4, arc 1.8 · *a two-hand cut with the dragon on the edge* · **Hook:** element follows the Aspect and applies its status (burn / chill / shock) [elementFrom].
- T1 a) Tail Sweep — 360° 4 m, knock 1.5 m [as around, knock] / b) Rending Overhead — 0.9 rad arc, ignores 40% armour [pen] · lib `wide`
- T2 a) Aspect Riders — fire: a burning death spreads its burn 3 m; ice: 3 chills freeze 1.5 s; lightning: shock jumps 1 enemy [per-aspect when] / b) Scale Break — sunder 15, stacks 3 · lib `shatter`
- T3 a) Dragonblood — each hit heals 2% / b) Wingbeat — a crit launches the target (stun 1.2 s) [onCrit knock] · lib `cauterise`
- T4 a) Aspect Weave — the element cycles fire → ice → lightning each cast, +20% on a target already carrying another aspect's status [elementCycle] / b) Furnace Edge — during Draconic Fury it is an 8 m cone [when form] · lib `crescendo`

**2 · `flamethrower` · Wyrm's Breath** (legacy, renamed) — melee breath / aspect · mult 0.4 x10, reach 7, arc 0.9, cd 10, mp 18 · *the dragon in the knight breathes* · **Hook:** element follows Aspect: fire burns, ice chills (3 ticks freeze 1 s), lightning arcs to one body beside each target [elementFrom].
- T1 a) Long Breath — 11 m, 0.6 rad / b) Wide Breath — 5 m, 1.6 rad · lib `wide`
- T2 a) Scorched Earth — a pool of the aspect along the breath 4 s [line pool] / b) Gale Breath — each tick pushes 0.3 m [knock per repeat] · lib `linger`
- T3 a) Walking Breath — move at 60% while breathing / b) Inhale — the first 0.6 s pulls enemies 2 m in [pullIn] · lib `overload`
- T4 a) Dragon's Roar — ends with a 6 m roar that stuns 1 s / b) Deep Lungs — becomes a channel: breathe while held, 3 mana a tick [channel] · lib `conflagration`

**3 · `wyrmfall` · Wyrmfall** — dash / aspect · mult 2.0, cd 14, mp 14, leap 14 m, land r 5 · *wings for one second* · **Hook:** a leap that lands in a burst of the current Aspect and throws everything 3 m outward [leap, knock].
- T1 a) Long Wings — 22 m / b) Low Glide — a flat glide that breathes on everything under the path [trail] · lib `quick`
- T2 a) Crater — the landing leaves a 4 s aspect pool [pool] / b) Pinning Landing — the body under you is stunned 2 s · lib `burst`
- T3 a) Return Flight — press again within 3 s to leap back to where you started [recast return] / b) Shockfront — the landing sends a 10 m wave forward [as beam] · lib `bulwark`
- T4 a) Dragon Dive — twice the height, +100% landing / b) Twin Wings — 2 charges · lib `crescendo`

**4 · `aspect_shift` · Draconic Aspect** — self / toggle · cd 2, mp 0 · *choose the breath* · **Hook:** cycles Fire (+15% damage) → Ice (+25% armour) → Lightning (+15% attack speed) [form group aspect, no body]; switching releases a 4 m pulse of the OLD aspect for 60%.
- T1 a) Quick Shift — switching grants 2 s Hastened / b) Lingering Aspect — the old aspect's status stays on your weapon 4 s (two elements) · lib —
- T2 a) Scales Bite Back — fire burns, ice chills, lightning shocks anything that hits you in melee [onHurt status] / b) Deep Aspect — each aspect's bonus x1.6 · lib —
- T3 a) Triple Pulse — the switch pulse is 7 m and 120% / b) Scaled Hide — switching gives a 12% barrier · lib —
- T4 a) Chromatic — a fourth aspect: Shadow (+6% life steal) [extra form] / b) Ancient Blood — the switch pulse applies all three statuses · lib —

**5 · `dragonscale` · Dragonscale** — self / aspect · cd 22, mp 12, 8 s · *harden into scales* · **Hook:** a barrier worth 25% max health; while it holds, melee attackers take 40% aspect damage [barrier, reflect element].
- T1 a) Thick Scales — 35%, 6 s / b) Shed Scales — when it breaks, scales burst 5 m for 150% [burstOnExpire] · lib `quick`
- T2 a) Hoard Heat — every 3% max health absorbed cuts Draconic Fury's cooldown 1 s [cutCooldown other] / b) Scale Shards — every 3rd hit absorbed throws a shard back [onHurt bolt] · lib `deepen`
- T3 a) Regrowth — the barrier regrows 2% a second if you are not hit for 2 s / b) Covering Wing — followers within 6 m get half of it [pets barrier] · lib `bulwark`
- T4 a) Impervious — immune to stun and knockback while it holds [ccImmune] / b) Wrath of the Scale — when it breaks, a free Wyrmfall onto the attacker [cast other] · lib `aegis`

**6 · `draconic_fury` · Draconic Fury** — self / aspect · cd 40, mp 30, 10 s · *the class hook: every attack becomes an area* · **Hook:** for 10 s melee arcs become 360° and +2 m, bolts splash 3 m, and every hit applies the Aspect's status [imbue area].
- T1 a) Short Fury — 6 s, +40% / b) Long Fury — 14 s · lib —
- T2 a) Wings Out — +40% move and ground pools/slows do not touch you / b) Fury Feeds — each hit adds 0.2 s (max +5 s) · lib `deepen`
- T3 a) Roaring Start — the cast roars: 10 m stun 1.5 s / b) Breath Swings — basic swings release a 5 m breath for 50% · lib `hunger`
- T4 a) Elder Dragon — all three aspects at once / b) Fury's End — ends in a 10 m aspect blast for 400% · lib `crescendo`

---

### 3.15 Pyromancer — Fire Specialist · INT · staff, wand, scepter · pet: fire familiar
Signature: **burn stacks** (max 5 on a target; each stack is its own burn) — skills build stacks, spread them, and detonate them [stack, detonate, spread].

**1 · `firebolt` · Firebolt** (legacy) — bolt / fire · mult 1.6, cd 4, mp 8, range 36, splash 2.6, burn · *the pyromancer's breath* · **Hook:** each hit adds a burn STACK (max 5) instead of refreshing one [stack].
- T1 a) Cinder Spray — 3 bolts at 70%, each adds a stack / b) Slow Burner — the bolt flies half speed and leaves a burning trail [trail] · lib `fan`
- T2 a) Flashpoint — on a target at 5 stacks the bolt pays all of them at once [detonate] / b) Wildfire — a burning death hands its stacks to the nearest enemy within 4 m [onKill spread] · lib `chain`
- T3 a) Familiar's Spark — the fire familiar copies every 3rd Firebolt [pet copy] / b) Kindling — +8% per stack already on the target · lib `cauterise`
- T4 a) Sunflare — every 5th bolt is a 6 m 200% blast [counter] / b) Phoenix Bolt — a kill sends the bolt on to a new target at full damage [ricochet onKill] · lib `cascade`

**2 · `fire_wall` · Burning Line** (legacy, renamed from "Ember Field") — ground / fire · mult 1.8 over 5 s, cd 13, mp 18, range 30 · *draw a line they will not like crossing* · **Hook:** a 10 m wall of fire laid ACROSS your aim for 5 s; each crossing adds 2 burn stacks [line pool].
- T1 a) Ring of Fire — a 6 m ring instead [as ring] / b) Long Wall — 18 m · lib `wide`
- T2 a) Firebreak — enemies cannot cross it for 2 s (they stop at it) [blocks] / b) Searing Wall — a crossing adds 4 stacks · lib `linger`
- T3 a) Rolling Wall — the wall moves forward 1.5 m/s [pool moves] / b) Fuel — every death in it adds 1 s · lib `hunger`
- T4 a) Corridor — two parallel walls 6 m apart / b) Familiar's Post — the familiar stands in the wall and throws its bolts from it · lib `conflagration`

**3 · `ember_stride` · Cinder Stride** (legacy id, renamed) — self / fire · mult 0.25 trail, cd 20, mp 16, 8 s · *walk on fire* · **Hook:** +20% move; a fire trail behind you adds a burn stack to anything that stands in it [trail stack].
- T1 a) Sprint — +40% move, 5 s / b) Wide Steps — trail radius 3 m · lib `quick`
- T2 a) Ash Cloud — the trail also Blinds / b) Heat Shield — 15% less damage taken while it runs · lib `deepen`
- T3 a) Flame Dash — begins with an 8 m dash [dash] / b) Kindled Path — standing in your own trail gives 2 mana a second · lib `echo`
- T4 a) Long Road — the trail lasts 20 s / b) Conflagrant Path — when it ends the whole trail erupts at once for 150% [detonate pool] · lib `wellspring`

**4 · `stoke_familiar` · Stoke the Familiar** — self / fire · cd 20, mp 14, 10 s · *feed the little fire until it is a big one* · **Hook:** the familiar grows for 10 s: its bolts become 3 m blasts that add burn stacks; if it has fallen it rekindles at once [command, pets status].
- T1 a) Twin Flames — a second, temporary familiar for 10 s [summon temporary] / b) Bonfire — the familiar plants itself and pulses 5 m every second [place totem] · lib `quick`
- T2 a) Feeding Flame — the familiar heals 5% for each stack it adds / b) Fire Link — 20% of the damage you take goes to the familiar · lib `deepen`
- T3 a) Overheat — when it ends the familiar explodes for 300% and rekindles 5 s later [burstOnExpire] / b) Leaping Flame — the familiar jumps to your aimed enemy [command pounce] · lib `hunger`
- T4 a) Elemental Lord — the familiar is three times the size and cleaves / b) Spark Network — its hits add a stack to every burning enemy within 6 m · lib `crescendo`

**5 · `combust` · Combust** — ground / fire · mult 0.6 per stack, cd 12, mp 16, range 30, r 6 · *the payoff* · **Hook:** every burning enemy within 6 m of the aim point pays 60% of its remaining burn per stack at once, then keeps 1 stack [detonate].
- T1 a) Everywhere — every burning enemy within 20 m of YOU, aim ignored / b) Pinpoint — one target, double · lib `wide`
- T2 a) Chain Combust — each detonation is a 2 m blast that adds a stack to its neighbours / b) Keep Burning — the stacks stay · lib `deepen`
- T3 a) Mana Flame — 2 mana per detonation / b) Blast Wave — each detonation knocks 2 m · lib `hunger`
- T4 a) Supernova — 5+ detonations reset Fallstone [resetOn other] / b) Ashes — kills leave a 4 s fire pool · lib `conflagration`

**6 · `meteor` · Fallstone** (legacy) — ground / fire · mult 3.4, cd 22, mp 30, range 36, r 8, burn · *the class hook: ignite every group at once* · **Hook:** one big stone on the aim point AND a 40% stone on every other cluster of enemies within 30 m [clusters].
- T1 a) Single Stone — no small stones, +60% / b) Stone Rain — 5 equal stones scattered over 10 m · lib `wide`
- T2 a) Molten Crater — a 6 s burning crater / b) Impact — stun 1.5 s · lib `linger`
- T3 a) Second Fall — a second stone 2 s later at 50% [delay repeat] / b) Kindled Sky — every enemy hit goes to 5 burn stacks · lib `hunger`
- T4 a) Skyfall — 3 charges, cooldown x1.5 [charges] / b) Bring It Down — centred on you, no delay, you are not hurt by it · lib `conflagration`

---

### 3.16 Stormcaller — Chain Lightning Mage · INT · staff, wand · pet: storm familiar
Signature: **conductors** — shocked enemies are conductors: jumps prefer them and travel further between them. "Chain Lightning" is NOT used as a name.

**1 · `chain_bolt` · Forked Bolt** (legacy, renamed) — bolt / lightning · mult 1.1, cd 4, mp 8, range 40, chains 4 (falloff 0.8, 8 m; 12 m between conductors) · *one bolt, many bodies* · **Hook:** a single bolt that jumps 4 times, preferring shocked bodies [chains prefer].
- T1 a) Forked — 3 bolts, 2 jumps each (the old row) / b) Long Arcs — 14 m jumps · lib `seeking`
- T2 a) Return Arc — the last jump comes back to the first body / b) Grounding — every jump leaves a 2 m static pool for 2 s [pool] · lib `deepen`
- T3 a) Overcharge — a body hit twice by one bolt is crit / b) Familiar Relay — the familiar counts as a jump point and copies the bolt [pet copy] · lib `echo`
- T4 a) Storm Web — every shocked enemy within 15 m is hit once / b) Endless — a kill adds a jump · lib `cascade`

**2 · `thunderclap` · Thunder Ring** (legacy, renamed) — around → placed ring / lightning · mult 1.0 per crossing, cd 12, mp 18, r 7, 6 s · *the class hook: zone the field* · **Hook:** a ring 7 m round you for 6 s; an enemy crossing the ring in either direction is stunned 0.6 s and shocked [place ring].
- T1 a) Clap — the old instant blast: 7 m, knock 3 m / b) Tight Ring — 4 m, also pulses every second · lib `wide`
- T2 a) Crackling Edge — a crossing deals 120% / b) Caged — enemies inside cannot leave (stop at the ring) [blocks] · lib `linger`
- T3 a) Travelling Ring — follows you / b) Lightning Rods — 4 rods on the ring strike the nearest within 6 m every 1.5 s [place totem] · lib `bulwark`
- T4 a) Double Ring — 4 m and 9 m / b) Collapse — the ring shrinks to its centre over 3 s, dragging enemies with it [pullIn] · lib `conflagration`

**3 · `storm_beam` · Storm Beam** (legacy) — beam / lightning · mult 2.2 over 2 s, cd 11, mp 20, range 30, width 2.4 · *hold the storm on them* · **Hook:** a channel up to 2 s, +25% every 0.5 s held; each tick arcs to one shocked body beside the beam [channel].
- T1 a) Snap — no channel, one instant hit / b) Wide — 4 m · lib `pierce`
- T2 a) Ionise — enemies hit are conductors for 6 s and take +30% from jumps [primes conductor] / b) Push — each tick pushes 1 m · lib `chain`
- T3 a) Sweeping — turn at full speed while channelling / b) Overload — a full channel ends with a 6 m blast at the target · lib `echo`
- T4 a) Prism Storm — 3 beams 15° apart / b) Feedback — 1 mana per enemy per tick · lib `cascade`

**4 · `storm_orbs` · Storm Orbs** (legacy) — self / lightning · mult 0.15 per strike, cd 24, mp 22, 3 orbs, 12 s · *spare lightning, kept in orbit* · **Hook:** casting Forked Bolt while orbs circle launches ONE orb along it for 150% (spending it) [consumes orb].
- T1 a) Five Orbs — smaller (0.1) / b) One Great Orb — x3, strikes every 2.4 s · lib `quick`
- T2 a) Shield Orbs — each orb absorbs one hit, then pops for 100% / b) Charged Air — orbs shock what they pass · lib `deepen`
- T3 a) Familiar's Orbit — the orbs circle the familiar / b) Wide Orbit — a 6 m ring that hits what it passes · lib `echo`
- T4 a) Homecoming — a spent orb returns after 4 s / b) Discharge — press again: every orb fires at the aim · lib `crescendo`

**5 · `bolt_step` · Bolt Step** — dash / lightning · mult 1.3, cd 10, mp 10, range 12 · *become the lightning for a heartbeat* · **Hook:** untargetable during the dash; everything passed is shocked and becomes a conductor [dash].
- T1 a) Return Bolt — press again within 3 s to zip back [recast return] / b) Conductor Hop — the dash jumps through up to 3 shocked enemies in turn · lib `quick`
- T2 a) Static Trail — a 3 s line pool / b) Thunder Arrival — 3 m stun 1 s at the end · lib `burst`
- T3 a) Charged Up — your next skill is +40% [empowerNext] / b) Twin Steps — 2 charges · lib `bulwark`
- T4 a) Familiar Swap — swap places with the storm familiar instead [dash swap pet] / b) Skyward — ends with a lightning column for 200% · lib `crescendo`

**6 · `tempest_eye` · Eye of the Tempest** — ground / lightning · mult 0.5 x12, cd 30, mp 34, range 30, r 9 · *call the storm down* · **Hook:** for 6 s a strike every 0.5 s on a random enemy inside, conductors twice; kills inside widen it 1 m [repeats, scatter, grow].
- T1 a) Follow Me — centred on you / b) Narrow Eye — 5 m, every strike on the centre · lib `wide`
- T2 a) Downpour — slows 30% / b) Hail and Thunder — each strike chills too · lib `deepen`
- T3 a) Conductor's Baton — your Forked Bolts inside it jump +3 / b) Familiar's Eye — the familiar inside casts twice as often · lib `hunger`
- T4 a) Superstorm — 10 s, drifting toward your aim / b) Final Strike — ends with 400% on the most-shocked enemy · lib `conflagration`

---

### 3.17 Druid — Shapeshifting Healer · INT · staff, scepter · pet: 2 grove wolves
Signature: **forms**. Three shapes, all original: **Briarback** (a thorn-backed tusked beast — the tank shape), **Fenrunner** (a lean marsh-cat — the fast melee shape), **Rootbound** (an ancient grove-tree, rooted to the spot — the timed capstone). Two are toggles, one is a timed super-form. Each of the druid's three non-form skills has a per-form override (different name, shape, element and effect) [form, forms]. Spec in the plan §4.

**1 · `thornlash` · Thornlash** — bolt / nature · mult 1.4, cd 3, mp 5, range 30 · *a whip of thorns flung like a dart* · **Hook:** roots 0.8 s (once per target per 6 s); heals the nearest wolf 3%.
- Forms: **Briarback → Bramble Gore** (melee 1.8, reach 3, arc 1.6, knock 2 m, taunts 3 s) · **Fenrunner → Rending Pounce** (dash to target 8 m, 1.6, bleed) · **Rootbound → Root Spear** (beam 24 m, roots everything 2 s).
- T1 a) Thorn Fan — 3 lashes (Bramble Gore: 2 swings; Rending Pounce: lands on 2 targets in turn) / b) Barbed — every form version bleeds · lib `seeking`
- T2 a) Snare Vine — root 2 s, no 6 s limit / b) Sap Thief — heals you 3% per hit on a rooted body · lib `deepen`
- T3 a) Pack Signal — the wolves pounce whatever it hits [command pounce] / b) Seedling — a hit plants a seed that blooms into a 3 m heal of 2% a second for 4 s [place ward] · lib `brand`
- T4 a) Wild Lash — each form's version gains its own rule: Gore throws 4 m, Pounce resets on a kill, Root Spear pierces into a second line [when form] / b) Thicket — 2 charges · lib `cascade`

**2 · `renew` · Greensap** (legacy id, renamed — "Renew" is a priest spell elsewhere) — self / nature · regen, cd 16, mp 14 · *sap that closes the wound* · **Hook:** the regen also lands on both wolves, and stacks to 3 on each body (each cast adds a stack, refreshing the rest) [stack heal].
- Forms: **Briarback → Thornswell** (a barrier of 20% + 20% melee reflect, 6 s) · **Fenrunner → Licked Wounds** (instant 15%, removes poison/bleed, 4 s Hastened) · **Rootbound → Groundwell** (an 8 m zone that heals every ally 2% a second).
- T1 a) Quick Sap — cd 8, half the heal / b) Heavy Sap — one stack worth two · lib `quick`
- T2 a) Blooming — when a stack ends it blooms: 6 m, 6% to all allies / b) Cleansing Sap — removes poison and bleed [cleanse] · lib `deepen`
- T3 a) Overgrowth — overhealing becomes a barrier (max 10%) / b) Grafting — each tick also heals the most-hurt ally within 8 m · lib `echo`
- T4 a) Evergreen — stacks to 5 / b) Lifeblood — while you hold 3 stacks, shifting form has no cooldown · lib `wellspring`

**3 · `briarback_shape` · Briarback Shape** — self / nature · toggle, cd 1.5, mp 8 to shift in · *the thorn beast* · **Hook:** +60% armour, +30% max health, the basic attack becomes a 2.8 m 160° claw sweep, melee attackers take 15% back as thorns; shifting in taunts everything within 6 m for 3 s [form].
- T1 a) Ironbark Hide — +100% armour instead, -10% move / b) Charging Shift — shifting in charges 8 m to the aim [dash] · lib —
- T2 a) Splinter Hide — thorns 30% / b) Tusks — the basic sweep knocks 1 m · lib —
- T3 a) Den Mother — wolves +30% armour while you are Briarback / b) Rooted Stance — standing still 1 s: 20% less damage · lib —
- T4 a) Bramble Burst — shifting OUT explodes 6 m for 200% / b) Unyielding — no stun or knockback while in the shape · lib —

**4 · `call_wolf` · Call the Pack** (legacy) — summon / nature · cd 26, mp 18 · *a whistle into the trees* · **Hook:** with both wolves already up, it is a howl instead: wolves Hastened 6 s and +30% damage.
- Forms: **Briarback → Den Guard** (wolves taunt everything within 4 m of you 4 s and take 30% less) · **Fenrunner → Running Pack** (you and the wolves dash at the aimed enemy together; each bite bleeds) · **Rootbound → Grove Sentinels** (two temporary vine-sentries for 15 s that root what they bite).
- T1 a) Fast Call — cd 14 / b) Alpha — one wolf with twice the health · lib `quick`
- T2 a) Thorny Pelts — wolves reflect 15% / b) Feral Bite — wolf bites bleed · lib `deepen`
- T3 a) Pack Bond — 10% of damage you take is moved to the wolves / b) Howl Stun — the howl stuns 1 s within 6 m · lib `hunger`
- T4 a) Third Wolf — a temporary third wolf for 20 s / b) Wild Pack — wolves copy your shape: Briarback wolves taunt, Fenrunner wolves are Hastened · lib `aegis`

**5 · `fenrunner_shape` · Fenrunner Shape** — self / nature · toggle, cd 1.5, mp 8 to shift in · *the marsh-cat* · **Hook:** +35% move, +25% attack speed, -30% armour; the basic attack becomes a two-bite 2.2 m; bites from behind bleed; shifting in hides you 4 s from anything further than 10 m [form, threat drop].
- T1 a) Long Stride — +50% move / b) Pounce Shift — shifting in leaps 10 m onto the aim [leap] · lib —
- T2 a) Open Veins — every 3rd bite adds 2 bleed stacks / b) Sap-Fed — bites heal 1% · lib —
- T3 a) Pack Runner — the wolves get your move bonus / b) Marsh Fog — shifting in drops a 6 m fog that Blinds 3 s · lib —
- T4 a) Apex — a kill in the shape gives a stacking 3 s Hastened / b) Shadow of the Fen — the first bite after shifting in is a crit for x2 · lib —

**6 · `rootbound_shape` · Rootbound** — self / nature · timed form, cd 50, mp 30, 15 s · *the grove itself stands up* · **Hook:** you are rooted in place (cannot move), +100% armour; every 2 s a 10 m pulse heals allies 3% and a vine lashes 3 enemies for 60%; your other skills become their Rootbound versions; it ends by uprooting — 8 m, knock 3 m [form timed].
- T1 a) Walking Grove — you can move at 40% / b) Deep Roots — 22 s · lib —
- T2 a) Strangling Vines — the lashes root 1.5 s / b) Full Bloom — the pulse heals 5% · lib —
- T3 a) Grove Wolves — wolves within 10 m heal 5% a pulse and deal +30% / b) Sap Well — 3 mana a pulse · lib —
- T4 a) The Reckoning — the uprooting is a 15 m thorn storm for 400% / b) Grove Remains — a tree stays behind and keeps pulsing heals 10 s after the shape ends · lib —

---

### 3.18 Oracle — Predictive Protector · INT · staff, scepter · pet: fire familiar
Signature: **foresight** — wards that wait for a big blow, and **Omens**: an Omened enemy's next attack is foretold (it hits 30% softer).

**1 · `omen_bolt` · Omen Bolt** — bolt / arcane · mult 1.4, cd 3, mp 5, range 32 · *a glimpse of their death, thrown* · **Hook:** Omen 6 s: the target's next attack deals 30% less [primes omen].
- T1 a) Twin Omens — 2 bolts / b) Distant Sight — 46 m, pierces · lib `seeking`
- T2 a) Ill Omen — Omened targets take +15% from followers / b) Read the Strike — when an Omened enemy attacks, you gain a 6% barrier [onTrigger barrier] · lib `chain`
- T3 a) Self-Fulfilling — an Omen that expires unused Dazes its target 3 s / b) Familiar Sight — the familiar attacks Omened targets first [command focus] · lib `brand`
- T4 a) Doom Foretold — an Omened death cuts every cooldown 2 s / b) Every Path — the Omen spreads to 2 neighbours · lib `cascade`

**2 · `foresight` · Foresight** — self / arcane · cd 16, mp 14, 15 s · *the shield arrives before the blow* · **Hook:** you and followers get a WARD that negates the first single hit worth more than 10% of max health — completely [ward threshold]. Not a barrier: small hits pass through it.
- T1 a) Twofold Sight — negates 2 such hits / b) Keen Sight — threshold 5% · lib `quick`
- T2 a) Recoil — a negated hit stuns its attacker 1 s / b) Mending Sight — a negation heals 10% · lib `deepen`
- T3 a) Long Sight — 30 s / b) Shared Sight — when one ward triggers, every other warded ally gets a 5% barrier · lib `echo`
- T4 a) Prophet's Ward — the negated damage is thrown back at its attacker / b) Perfect Foresight — a hit that would kill is always negated, whatever its size · lib `aegis`

**3 · `prophecy` · Prophecy** — ground / arcane · mult 1.6, cd 14, mp 16, range 30, r 6, delay 2.5 · *it has already happened* · **Hook:** enemies standing in the circle when it is cast are FATED: if they walk out before it lands, a bolt follows them and hits anyway [delay, fated].
- T1 a) Swift Fate — 1 s delay / b) Grand Fate — 9 m, 4 s delay, +60% · lib `wide`
- T2 a) Binding Fate — the circle roots 1 s when cast / b) Fated Wounds — the landing curses · lib `deepen`
- T3 a) Twice Foretold — it lands twice / b) Foreseen Opening — Omened enemies take double [consumes omen] · lib `hunger`
- T4 a) Inevitable — 3+ enemies hit resets it / b) Fate's Pull — just before it lands, everything inside is pulled 4 m to the centre · lib `conflagration`

**4 · `fate_thread` · Thread of Fate** — beam / arcane · cd 18, mp 12, range 24, 8 s · *tie two lives together* · **Hook:** link to a follower or an enemy: a linked follower's damage taken is split 50/50 with you and you both heal 1% a second; a linked enemy takes 30% of the damage YOU take [link].
- T1 a) Long Thread — 36 m, does not snap with distance / b) Two Threads — one ally and one enemy at once · lib —
- T2 a) Taut Thread — a linked enemy cannot move further than 10 m from you / b) Woven Mend — the link heals 2% a second · lib `deepen`
- T3 a) Cut the Thread — press again: snap it for 200% to an enemy or a 20% heal to an ally [recast] / b) Shared Woe — statuses you apply to anything also land on the linked enemy · lib `hunger`
- T4 a) The Weave — every follower is linked to every other (one shared pool) / b) Severed Fate — a linked enemy's death deals its last hit to its neighbours · lib `aegis`

**5 · `turn_aside` · Turn Aside** — around / arcane · mult 1.0, cd 12, mp 12, r 6 · *you saw it coming, so it misses* · **Hook:** every enemy within 6 m is pushed 3 m and loses the attack it was winding up [knock, interrupt].
- T1 a) Wide — 9 m / b) Turn Inward — pulls to you instead of pushing [pullIn] · lib `wide`
- T2 a) Dazing — Dazed 3 s / b) Stillness — stunned 1 s instead of pushed · lib `shatter`
- T3 a) Warded Burst — allies within 6 m get Foresight's ward [cast other] / b) Omen Sweep — everything hit is Omened · lib `bulwark`
- T4 a) Twice Turned — 2 charges / b) Ward Line — a 6 m line for 4 s that enemy projectiles do not cross [blocks projectiles] · lib `aegis`

**6 · `last_prophecy` · The Last Prophecy** — self / arcane · cd 60, mp 36, 8 s · *the oracle reads the end of the fight* · **Hook:** for 8 s every enemy within 20 m is Omened permanently and your followers crit every hit on an Omened target; it ends with the familiar fulfilling it: 12 m, 300% [aura primes, pets status].
- T1 a) Swift End — 5 s, cd 40 / b) Long Vision — 12 s · lib —
- T2 a) Seer's Calm — mana regeneration x3 during it / b) Blinding Vision — enemies are Blinded 2 s when it starts · lib `deepen`
- T3 a) All Paths — Foresight's ward on every ally when it starts / b) Fated Fall — Prophecy has no delay during it · lib `hunger`
- T4 a) Ending Written — non-boss enemies under 15% at the end die / b) Retold — a kill during it adds 1 s · lib `crescendo`

---

### 3.19 Tactician — Turn-Order Manipulator · INT · sword, scepter
Signature: **orders** — moves followers, resets their abilities ("extra actions"), and reshapes where enemies stand [command, swap, reposition].

**1 · `exploit_gap` · Exploit the Gap** — melee / physical · mult 1.5, cd 4, mp 4, reach 3, arc 1.4 · *strike where the plan said* · **Hook:** +40% against an enemy that is attacking a follower, and it is Flanked for 4 s: followers +20% against it [primes flanked].
- T1 a) Point Out — becomes a 20 m bolt [as bolt] / b) Sweep the Gap — 2.4 rad arc · lib `quick`
- T2 a) Openings — Flanked targets lose 10 armour / b) Called Shot — each follower's next hit on it crits · lib `shatter`
- T3 a) Shift the Line — the target is pushed 2 m toward the nearest follower [knock to point] / b) Tempo — a hit cuts every follower ability cooldown 1 s [cutCooldown pets] · lib `hunger`
- T4 a) Masterplan — if three followers hit the Flanked target, Exploit resets / b) Rout — a kill Dazes everything within 6 m 3 s · lib `crescendo`

**2 · `rally` · Rally** (legacy) — self / holy · rally, pets, cd 30, mp 18 · *form on me* · **Hook:** every follower within 15 m is pulled into formation round you (a short dash each) before the rally lands [reposition pets].
- T1 a) Hold Ground — no move; +30% armour 8 s / b) Wide Rally — 30 m · lib `quick`
- T2 a) Second Breath — rallied followers heal 15% / b) Spirited — +15% move · lib `deepen`
- T3 a) Formation — followers in formation split damage taken evenly / b) Rally to Me — you get it too · lib `echo`
- T4 a) Standard — leaves a banner for 12 s that keeps the rally on anyone near it [place banner] / b) Undaunted — rallied followers cannot be stunned · lib `wellspring`

**3 · `charge` · Lead the Charge** (legacy, renamed) — dash / physical · mult 1.7, cd 10, mp 10, range 12, splash 2.4, weaken · *everyone, now* · **Hook:** every follower dashes with you to the landing point; their next attack is +50% [dash with pets].
- T1 a) Pincer — followers land on the FAR side of the target / b) Long Charge — 18 m · lib `quick`
- T2 a) Shock Troops — the landing stuns 1 s / b) Breach — knock 3 m · lib `burst`
- T3 a) Second Wave — followers arrive 0.5 s later, each landing a 2 m slam / b) Fall Back — press again: everyone dashes back to where they started [recast return] · lib `bulwark`
- T4 a) Momentum — a kill refunds it / b) Full Assault — your next 2 skills cost nothing [empowerNext free] · lib `crescendo`

**4 · `reposition` · Reposition** — dash / arcane · cd 10, mp 6, range 20 · *the piece moves where you need it* · **Hook:** swap places with a follower or an enemy you aim at; an enemy swapped is Dazed 2 s, a follower swapped gets a 20% barrier [dash swap].
- T1 a) Hurl — throw the enemy 8 m toward your aim instead [knock to point] / b) Long Reach — 35 m · lib `quick`
- T2 a) Double Swap — swap two followers with each other / b) Switch Them — swap two enemies with each other · lib `burst`
- T3 a) Ambush Swap — a swapped enemy takes +30% 4 s / b) Out of Danger — free when it swaps a follower below 30% health · lib `bulwark`
- T4 a) Grand Shuffle — every enemy within 10 m changes places with another and is Dazed / b) Gambit — the swapped enemy is taunted by every follower 4 s · lib `aegis`

**5 · `seize_initiative` · Seize the Initiative** — self / physical · cd 30, mp 20 · *the class hook: an extra turn* · **Hook:** every follower's ability cooldowns reset, and your own remaining cooldowns are halved (not this one) [resetOn pets, cutCooldown].
- T1 a) Quick Turn — cd 22 / b) Deep Turn — also 30 mana · lib —
- T2 a) Haste Order — followers Hastened 6 s / b) Tactical Ward — 15% barrier on everyone · lib `deepen`
- T3 a) Read the Field — enemies within 15 m attack 30% slower 6 s / b) Act Twice — your next skill fires twice · lib `echo`
- T4 a) Initiative Chain — kills in the next 6 s cut this cooldown 4 s / b) Command Presence — followers +25% damage 10 s · lib `crescendo`

**6 · `battle_plan` · Battle Plan** — ground / physical · cd 40, mp 30, range 30, r 10, 10 s · *draw the plan on the ground* · **Hook:** a 10 m zone: enemies inside take +25% and are slowed 30%; followers inside act 30% faster; every 2 s a volley order — you and every follower strike the most-hurt enemy inside for 80% [place ward, command focus].
- T1 a) Tight Plan — 6 m, +40% taken / b) Long Plan — 15 s · lib `wide`
- T2 a) Kill Box — enemies cannot leave [blocks] / b) Supply Line — allies inside heal 2% a second · lib `deepen`
- T3 a) Encirclement — each volley drags enemies 2 m toward the centre / b) Contingency — falling below 30% inside swaps you with a follower · lib `hunger`
- T4 a) Decisive Blow — ends with 200% on every enemy inside / b) Overwhelming — every kill inside adds a volley · lib `conflagration`

---

### 3.20 Chronomancer — Time Mage · INT · staff, wand
Signature: **time** — haste and slow, rewinding yourself, suspending a target, freezing the field [rewind, stasis, cdRate, dotRate].

**1 · `second_hand` · Second Hand** — bolt / arcane · mult 1.2, cd 2.5, mp 4, range 32 · *a sliver of stolen time* · **Hook:** each hit slows the target 10% (stacks 4) and takes 0.25 s off your OTHER cooldowns [stack slow, cutCooldown self].
- T1 a) Tick-Tock — two bolts 0.3 s apart / b) Long Hand — pierces · lib `seeking`
- T2 a) Stopped — at 4 stacks the target is suspended 1 s [stasis] / b) Aftershock — every hit lands again 2 s later at 40% [delay repeat] · lib `chain`
- T3 a) Borrowed Seconds — 0.5 s off instead / b) Wound Back — a miss returns the mana · lib `echo`
- T4 a) Clockwork — every 12th bolt suspends everything within 8 m 1.5 s [counter] / b) Paradox — the damage is dealt again 3 s later at 100% · lib `cascade`

**2 · `quicken` · Quicken** (legacy) — self / lightning · haste, cd 26, mp 16 · *time runs faster for us* · **Hook:** Hastens you and every follower within 10 m and takes 2 s off everyone's running cooldowns [pets, cutCooldown].
- T1 a) Sprint — 4 s at twice the haste / b) Long Hour — 14 s at half · lib `quick`
- T2 a) Slipstream — enemies within 5 m are slowed by as much as you are hastened / b) Shared Hour — the nearest follower out of range gets it too · lib `deepen`
- T3 a) Afterimage — leaves an echo of you that repeats your next skill from where you stood [decoy echo] / b) Temporal Ward — 10% barrier · lib `echo`
- T4 a) Accelerando — stacks 3 times / b) Overclock — while Hastened your skills cost 30% less · lib `crescendo`

**3 · `entropy_field` · Entropy Field** — ground / arcane · mult 0.3 x8, cd 14, mp 18, range 30, r 5.5 · *time runs faster for THEM* · **Hook:** enemies inside are slowed 40% and every status on them ticks twice as fast [dotRate zone] — it makes any DoT better.
- T1 a) Wide — 8 m / b) Pinpoint — 3 m, slow 70% · lib `wide`
- T2 a) Rust — sunder 5 a second / b) Wither — Weakened · lib `deepen`
- T3 a) Moving Hour — drifts to your aim / b) Hourglass — at the end, 300% on anything that stayed the whole time · lib `hunger`
- T4 a) Centuries — 12 s / b) Ages Pass — non-boss enemies under 10% inside crumble · lib `conflagration`

**4 · `rewind` · Rewind** — self / arcane · cd 30, mp 16 · *undo the last four seconds* · **Hook:** your health and position go back to where they were 4 s ago; cooldowns you spent in those 4 s are refunded by half [rewind].
- T1 a) Short Rewind — 2 s, cd 18 / b) Long Rewind — 6 s · lib —
- T2 a) Rewind the Company — followers too / b) Left Behind — a decoy stays where you were and taunts 3 s [decoy] · lib —
- T3 a) Mana Too — mana rewinds as well / b) Undone — statuses you gained in the window are removed [cleanse] · lib —
- T4 a) Rewind Them — the nearest enemy is put back where it stood and loses what it healed / b) Return Ticket — press again within 8 s to go back to the spot you rewound FROM [recast return] · lib —

**5 · `stasis_lock` · Stasis Lock** — bolt / arcane · cd 16, mp 14, range 28, 4 s · *freeze one thing in time* · **Hook:** a non-boss target is suspended: it cannot act or be hurt; damage dealt to it is banked and lands at once x1.5 when it thaws (bosses: slowed 60% 3 s) [stasis, store].
- T1 a) Area Lock — 3 m / b) Quick Lock — 2 s, cd 8 · lib `seeking`
- T2 a) Fragile Moment — the bank pays x2 / b) Ally Lock — aimed at a follower: it is invulnerable 3 s · lib `burst`
- T3 a) Locked Clock — while anything is locked, your cooldowns run 30% faster [cdRate] / b) Shatter — the thaw explodes 4 m · lib `brand`
- T4 a) Two Locks — 2 charges / b) Eternal Moment — 8 s · lib `unmaking`

**6 · `stop_the_clock` · Stop the Clock** — around / arcane · cd 60, mp 40, r 25, 4 s · *everything stops but you* · **Hook:** every non-boss enemy within 25 m is suspended 4 s (bosses slowed 80%); damage on them is banked and paid x1.25; your cooldowns run 4x faster during it [stasis area, store, cdRate].
- T1 a) Long Stop — 6 s / b) Small World — 12 m, cd 40 · lib —
- T2 a) Company Moves — followers act during it / b) Heavy Bank — x1.6 · lib —
- T3 a) Free Rewind — Rewind has no cooldown during it / b) Even Them — bosses are suspended 1 s too · lib —
- T4 a) Final Second — ends with 200% on everything inside / b) Repeat — kills during it refund 5 s of its cooldown · lib —

---

### 3.21 Monk — Martial Artist · DEX · staff
Signature: **Poise** (resource, max 5; "Chi" is banned) — built by palms, steps and stillness, spent by finishers; dash into crit range; self-heal.

**1 · `open_palm` · Open Palm** — melee / physical · mult 1.4, cd 3, mp 2, reach 2.8, arc 1.4 · *strike flat, push the breath out* · **Hook:** knocks 2 m; +1 Poise; a body knocked into a wall or another enemy is staggered 1 s [knock, wall slam].
- T1 a) Double Palm — two palms 0.2 s apart / b) Far Palm — an 8 m wave of air [as beam] · lib `quick`
- T2 a) Pressure Point — every 3rd palm stuns 1 s [counter] / b) Ripple — a knocked body hits what it passes for 60% [knock carry] · lib `shatter`
- T3 a) Breath Return — each palm heals 2% / b) Flowing Poise — a crit gives 2 Poise · lib `cauterise`
- T4 a) Thousand Palms — at 5 Poise the palm strikes 3 times / b) Push the Mountain — knock 6 m · lib `crescendo`

**2 · `wind_step` · Wind Step** — dash / physical · mult 1.3, cd 7, mp 5, range 10 · *into crit range* · **Hook:** dash to the target; your next attack within 2 s is a guaranteed crit; +1 Poise [dash target, empowerNext crit].
- T1 a) Through — pass through and land behind [dash behind] / b) Two Steps — 2 charges · lib `quick`
- T2 a) Flowing — hits everything passed / b) Return Step — spring back 5 m after the hit · lib `burst`
- T3 a) Weightless — untargetable 1 s / b) Poise Step — while you hold Poise it costs 1 Poise and no cooldown [spend] · lib `bulwark`
- T4 a) Gale Path — the path Hastens followers who cross it 4 s [trail] / b) Endless Steps — a kill resets it · lib `crescendo`

**3 · `sweeping_heel` · Sweeping Heel** — around / physical · mult 1.1, cd 10, mp 6, r 3.5 · *take their legs* · **Hook:** everything is knocked down (stun 1.2 s); a downed enemy takes +30% from your staff [stagger, primes downed].
- T1 a) Wide Sweep — 5 m / b) Low Spin — two sweeps · lib `wide`
- T2 a) Cracked Knee — downed enemies are slowed 3 s after / b) Up You Go — launched instead (1.5 s); Wind Step crits on launched bodies deal +50% · lib `shatter`
- T3 a) Poise Sweep — +1 Poise per enemy downed (max 3) / b) Staff Ring — the staff extends: 6 m · lib `hunger`
- T4 a) Earthsplit — the sweep cracks a 6 m ring that slows 4 s [pool ring] / b) Spinning Tail — 4+ enemies downed resets it · lib `aegis`

**4 · `inner_stillness` · Inner Stillness** — self / physical · cd 22, mp 0, channel 3 s · *close the eyes, close the wound* · **Hook:** a channel: heal 6% a second and +1 Poise a second; any melee hit taken during it is answered at once for 120% [channel, counter].
- T1 a) Quick Stillness — 1.5 s at double rate / b) Moving Meditation — walk at 50% while channelling · lib —
- T2 a) Clear Mind — removes every harmful status as it starts [cleanse] / b) Iron Body — 40% less damage while channelling · lib `deepen`
- T3 a) Calm Aura — followers within 6 m heal half as much / b) Stored Breath — overhealing is banked as +damage on your next hit · lib `echo`
- T4 a) Empty Hand — at full health it gives 5 Poise at once instead / b) Perfect Balance — 3 s immune to stun and knockback after · lib `wellspring`

**5 · `mountain_fist` · Mountain Fist** — beam / physical · mult 1.2→3.6, cd 12, mp 10, range 4→12, width 1.6, hold up to 1.5 s · *the punch you can see coming* · **Hook:** hold to wind up; range and damage grow while held; a full wind-up stuns 1.5 s and gives 2 Poise [windup].
- T1 a) Quick Fist — full at 0.8 s / b) Earth Fist — a full fist cracks the ground along its line (slow 60% 3 s) [line pool] · lib `pierce`
- T2 a) Shockwave Fist — knocks everything hit 4 m / b) Hollow Fist — a full fist ignores armour · lib `shatter`
- T3 a) Moving Wind-up — full speed while winding up / b) Spent Poise — each Poise you hold skips 0.3 s of wind-up (spent) [spend] · lib `echo`
- T4 a) Mountain Falls — a full fist leaps you to the end of its line [dash] / b) Twin Fists — fires twice · lib `crescendo`

**6 · `ninefold_staff` · Ninefold Staff** — melee / physical · mult 0.8 per strike, 3 + Poise strikes, cd 22, mp 16 · *the whole form, in one breath* · **Hook:** spends all Poise; the strikes CYCLE their shape — a sweep (360° 3.5 m), a thrust (6 m line), an overhead (2.5 m slam ring) — so where enemies stand decides which strike lands on whom [spend poise, shape cycle].
- T1 a) Single Line — every strike a thrust (6 m line) / b) Wide Form — every sweep 5 m · lib `heavy`
- T2 a) Pressure Form — every strike staggers 0.3 s / b) Breath Form — heal 1% per strike · lib `shatter`
- T3 a) Afterflow — 30% less damage taken for 3 s after / b) Echo Form — an afterimage repeats the form at 50% [decoy echo] · lib `hunger`
- T4 a) Endless Form — a kill adds 2 strikes / b) Final Bell — the last strike is an 8 m ring for 300% · lib `crescendo`

---

### 3.22 Shaman — Spirit Caster · INT · staff, scepter · pet: spirit bear
Signature: **posts** (totems — placed objects that pulse) and spirit bolts that heal as they jump. "Ancestral", "Healing Wave", "Totemic Recall", "Spirit Link", "Spirit Walk", "Chain Lightning" are not used.

**1 · `spirit_bolt` · Spirit Bolt** — bolt / lightning · mult 1.2, cd 3, mp 5, range 32, chains 2 · *the spirits pass it on* · **Hook:** each jump also heals the nearest ally 3% — a chain that hurts AND mends [chains, heal per jump].
- T1 a) Spirit Fan — 3 bolts, 1 jump each / b) Long Path — 12 m jumps · lib `seeking`
- T2 a) Post Link — a jump that passes within 3 m of one of your posts gives that post an extra pulse / b) Spirit Mark — the bear goes for whatever the bolt hits [command pounce] · lib `deepen`
- T3 a) Elders' Share — 6% heals per jump, 20% less damage / b) Spirit Rebound — the last jump returns to you: 1 mana per jump · lib `echo`
- T4 a) Spirit Storm — 5 jumps / b) Bear's Answer — the bear copies the bolt's first hit as a 3 m slam [pet copy] · lib `cascade`

**2 · `mending_post` · Mending Post** — ground / nature · cd 18, mp 16, range 12, 12 s · *carve a post; the post heals* · **Hook:** a totem with 30% of your health that heals every ally within 8 m 2% a second; enemies may break it [place totem heal].
- T1 a) Twin Posts — two at once / b) Carried Post — strapped to your back: the aura follows you [aura follow] · lib `quick`
- T2 a) Cleansing Post — removes one poison, bleed or curse every 3 s [cleanse] / b) Rooting Post — enemies within 3 m are rooted 1 s when it lands · lib `deepen`
- T3 a) Bear's Post — the bear heals double near it / b) Grove Pulse — every 4th pulse heals 10% · lib `hunger`
- T4 a) Long Post — 30 s / b) Last Gift — when it ends, a 15% heal burst · lib `wellspring`

**3 · `storm_post` · Storm Post** — ground / lightning · mult 0.5 per strike, cd 16, mp 18, range 16, 10 s · *carve a post; the post bites* · **Hook:** a totem that strikes the nearest enemy within 10 m every second, jumping once [place totem].
- T1 a) Twin Strikes — 2 targets each strike / b) Great Strike — every 2.5 s, x3 · lib `wide`
- T2 a) Shocking — every strike shocks / b) Lightning Rod — your Spirit Bolts that pass it jump +2 · lib `deepen`
- T3 a) Overcharge — press again: the post bursts 6 m for 200% [recast detonate] / b) Taunting Post — enemies within 10 m attack the post for 3 s [taunt decoy] · lib `hunger`
- T4 a) Tempest Post — 3 targets / b) Storm Bond — the bear's claws carry lightning while it is near the post · lib `conflagration`

**4 · `call_spirit` · Call a Spirit** (legacy) — summon / holy · cd 40, mp 26 · *wake the spirit bear* · **Hook:** with the bear already up: it charges your aim and taunts 4 s [command, taunt].
- T1 a) Quick Waking — cd 20 / b) Elder Spirit — twice the health, half speed · lib `quick`
- T2 a) Spirit Claws — bleed / b) Spirit Hide — the bear takes 30% less · lib `deepen`
- T3 a) Bonded Spirits — damage to you and the bear is split evenly / b) Rebirth — a fallen bear returns in 5 s · lib `hunger`
- T4 a) Twin Spirits — a second bear for 15 s [summon temporary] / b) Post Walker — the bear carries your posts' pulses wherever it stands · lib `aegis`

**5 · `warding_spirits` · Warding Spirits** — self / holy · cd 24, mp 18 · *the party is watched over* · **Hook:** you, the bear and every follower get 3 ward CHARGES: each absorbs one hit completely, up to 8% of max health [ward charges]. Many small hits, unlike the Oracle's one big one.
- T1 a) Five Charges / b) Heavy Charges — 2 charges up to 15% · lib `quick`
- T2 a) Thorned Wards — an absorbed hit shocks its attacker / b) Post Wards — your posts get charges too · lib `deepen`
- T3 a) Spent Spirit — each spent charge heals 2% / b) Recall — spent charges return after 10 s · lib `echo`
- T4 a) Ward Burst — at the end, every spent charge bursts on the nearest enemy for 60% / b) Spirit Shield — while any charge holds, no stun · lib `aegis`

**6 · `great_post` · The Great Post** — ground / holy · cd 50, mp 36, range 16, 15 s · *the elders' pole* · **Hook:** a towering totem: every other post within 20 m pulses twice as often, it throws a Spirit Bolt at 3 enemies every 1.5 s, and heals 3% every 2 s in 12 m [place totem, amplify posts].
- T1 a) Short Rite — 8 s, cd 35 / b) Long Rite — 25 s · lib —
- T2 a) Spirit Lightning — its bolts jump twice / b) Mending Ground — heals 5% · lib `deepen`
- T3 a) Bear's Totem — the bear grows (x1.5 health and damage) while near it / b) Pulling Post — enemies within 10 m are dragged 1 m a second toward it · lib `hunger`
- T4 a) Old Ones Rise — 3 spirit warriors step out of it [summon temporary] / b) Final Thunder — ends with 15 m, 400% · lib `conflagration`

---

### 3.23 Witch Hunter — Anti-Magic Skirmisher · DEX · crossbow, sword, dagger
Signature: **silver** — anti-caster: silence, strip buffs and champion modifiers, cleanse allies; +50% vs undead. The Demon Hunter owns fiends, Grudge and a hound; the Witch Hunter owns casters, silence and purges.

**1 · `pinning_shot` · Silvered Pin** (legacy, renamed) — bolt / physical · mult 1.0 x2, cd 9→6, mp 8, range 38, web · *two bolts that nail the hem* · **Hook:** roots 2 s; +50% vs undead; each hit strips ONE buff or champion modifier for 6 s [strip, familyBonus].
- T1 a) Triple Pin / b) Heavy Pin — 1 bolt that pierces 2 and roots each · lib `seeking`
- T2 a) Silence — the target cannot use abilities 3 s [silence] / b) Nailed — knocked 3 m; rooted twice as long against a wall · lib `burst`
- T3 a) Marked for the Party — followers +20% vs it 6 s / b) Purging Pin — strips ALL its modifiers for 6 s · lib `brand`
- T4 a) Crossfire — both bolts converge on the target: +50% / b) Next on the List — a kill reloads it and pins the nearest enemy [onKill reset] · lib `cascade`

**2 · `silver_edge` · Silver Edge** — melee / physical · mult 1.5, cd 4, mp 3, reach 3, arc 1.4 · *steel for the wicked* · **Hook:** strikes twice against an enemy that casts; +50% vs undead; each hit removes one harmful status from YOU [cleanse self].
- T1 a) Circle of Silver — 360° 3.5 m / b) Lunge — a 5 m thrust line · lib `quick`
- T2 a) Hallowed Silver — holy damage instead / b) Ward Breaker — destroys enemy barriers and shields outright · lib `shatter`
- T3 a) Interrupt — cancels the wind-up it lands on and Dazes 2 s [interrupt] / b) Blessed Steel — heals 3% per hit vs undead · lib `hunger`
- T4 a) Witchbane — killing a caster resets it / b) Silver Storm — three quick cuts · lib `crescendo`

**3 · `null_circle` · Null Circle** — ground / holy · cd 18, mp 14, range 16, r 6, 8 s · *a circle of salt and iron* · **Hook:** enemies inside cannot use abilities, and enemy projectiles entering it are destroyed; allies inside cannot gain new harmful statuses [place ward silence, blocks projectiles].
- T1 a) Carried Circle — a 4 m circle that follows you / b) Wide Salt — 9 m, 5 s · lib `wide`
- T2 a) Burning Salt — enemies inside burn (holy) / b) Binding Circle — enemies inside cannot leave [blocks] · lib `deepen`
- T3 a) Purifying Ground — cleanses allies every second / b) Absorbing — each destroyed projectile gives 2 mana · lib `bulwark`
- T4 a) Iron Circle — undead inside are stunned 2 s every 4 s / b) Twin Circles — 2 charges · lib `aegis`

**4 · `condemn` · Condemn** — bolt / holy · mult 0.6, cd 14, mp 10, range 40, 10 s · *the party has its target* · **Hook:** Condemned: you and every follower +25% against it, it cannot be healed or shielded, undead are slowed 40% [primes condemned, command focus].
- T1 a) Two Condemned / b) Long Sentence — 16 s · lib —
- T2 a) Public Trial — every follower attacks it at once [command focus] / b) Passed On — when it dies, the nearest enemy is Condemned [onKill spread] · lib `deepen`
- T3 a) Stripped — strips every buff it holds when it lands [strip] / b) Burning Writ — holy burn · lib `hunger`
- T4 a) Execution — a Condemned non-boss under 20% dies / b) Gallows — once, at 50% health, it is rooted 3 s · lib `unmaking`

**5 · `iron_net` · Iron Net** — bolt / physical · cd 12, mp 8, range 20, r 4 · *the old way to bring one in* · **Hook:** everything in 4 m is rooted 3 s and silenced; struggling (trying to move) adds 1 s to a caster's silence [root, silence].
- T1 a) Weighted Net — 6 m / b) Barbed Net — netted enemies bleed while they struggle · lib `burst`
- T2 a) Silver Mesh — undead in it take 20% a second / b) Drag Net — netted enemies are pulled 3 m toward you [pullIn self] · lib `deepen`
- T3 a) Cast and Run — the net falls at your feet while you dash 6 m back [dash back] / b) Reel In — press again: pull everything netted to you [recast pullIn] · lib `hunger`
- T4 a) Twin Nets — 2 charges / b) Iron Maiden — a netted death bursts into silver shards at 4 enemies [onKill split] · lib `cascade`

**6 · `purging_rite` · Rite of Purging** — around / holy · mult 2.6, cd 30, mp 26, r 12 · *the whole circle burns clean* · **Hook:** strips every buff and champion/rare modifier from enemies within 12 m for 8 s, +25% damage per effect stripped from each, and cleanses every ally [strip, cleanse].
- T1 a) Focused Rite — 6 m, +80% / b) Wide Rite — 18 m · lib `wide`
- T2 a) Silver Fire — leaves a 6 s holy pool / b) Silence — 4 s silence on everything hit · lib `shatter`
- T3 a) Punish Magic — stripped casters are stunned 2 s / b) Stolen Power — +5% damage per effect stripped, for 10 s · lib `hunger`
- T4 a) Hunter's Due — undead under 25% are destroyed (not bosses) / b) Second Rite — again 1.5 s later at 50% · lib `aegis`

---

### 3.24 Knight — Sworn Tank · STR · sword, hammer · shield
Signature: **the bodyguard** — the Warrior gets stronger in a crowd and the Paladin heals by hitting; the Knight takes hits FOR others: intercepts, a sworn ward on one ally, walls [intercept, link, place wall].

**1 · `shield_bash` · Rim Strike** (legacy, renamed) — melee / physical · mult 1.3, cd 8→6, mp 6, reach 2.8, arc 2.2 · *the edge of the shield* · **Hook:** stuns 1 s and taunts 3 s [knock stagger, taunt].
- T1 a) Wide Bash — 180° / b) Charging Bash — a 6 m dash into it [dash target] · lib `wide`
- T2 a) Ringing Blow — Dazed 4 s / b) Splinter — sunder 15 · lib `shatter`
- T3 a) Bodyguard — the target's next attack on a follower is redirected to you [intercept] / b) Warded Bash — a 8% barrier · lib `cauterise`
- T4 a) Double Bash — 2 charges / b) Bell Ringer — non-elite targets are stunned 2.5 s · lib `crescendo`

**2 · `guard_stance` · Sworn Guard** (legacy id, renamed from "Guard") — self / holy · guard, cd 18, mp 8, 8 s · *raise the shield and stand* · **Hook:** blocks 50% of damage from the front, and the nearest follower within 8 m takes 40% less — you take that share [intercept].
- T1 a) Raised Guard — 70%, walk at 60% / b) Moving Guard — 30%, full speed · lib `quick`
- T2 a) Counter Bash — a blocked melee hit Dazes its attacker / b) Interpose — every follower within 8 m, not just one · lib `deepen`
- T3 a) Iron Will — no knockback while guarding / b) Block Recovery — each blocked hit heals 1% · lib `echo`
- T4 a) Phalanx — followers behind you take 30% less too / b) Guard Toss — when it ends you hurl the shield: bounces 3 times, 15 m [ricochet] · lib `wellspring`

**3 · `sworn_ward` · Sworn Ward** — self / holy · cd 18, mp 8, 12 s · *swear to keep one ally standing* · **Hook:** the follower nearest your aim is Sworn: any hit on it above 20% of its health is taken by you instead; each such hit gives you +5% damage (max 5) [link intercept].
- T1 a) Two Sworn / b) Long Oath — 20 s · lib —
- T2 a) Avenging Oath — when the Sworn is hit, your next swing is +50% / b) Holy Oath — the Sworn heals 2% a second · lib `deepen`
- T3 a) To Your Side — press again: leap to the Sworn (15 m) and taunt 4 s [recast dash to ally] / b) Shared Armour — the Sworn gets half your armour · lib `hunger`
- T4 a) Not Today — while you are above 30%, the Sworn cannot drop below 1 health / b) Oathkeeper — the Sworn's kills heal you 5% · lib `aegis`

**4 · `challenge` · Challenge** — around / physical · cd 12, mp 6, r 10 · *"Face me."* · **Hook:** taunts everything within 10 m 4 s and drags RANGED enemies 4 m toward you — they have to come to you [taunt, pullIn ranged].
- T1 a) Long Challenge — 7 s / b) Single Combat — one target 12 s; it takes +30% from you · lib `wide`
- T2 a) Haul — 8 m drag / b) Shame — taunted enemies are Weakened · lib `deepen`
- T3 a) Bulwark Shout — 3% barrier per enemy taunted / b) Answer — each taunted enemy's first hit on you is fully blocked · lib `bulwark`
- T4 a) Lone Wall — while 5+ are taunted, +30% damage / b) Second Challenge — again 3 s later · lib `aegis`

**5 · `rampart` · Rampart** — ground / physical · cd 20, mp 12, range 8, length 6, 8 s · *a wall of shields, planted* · **Hook:** a 6 m shield-wall across your aim: enemy projectiles and enemy movement stop at it; enemies that strike it are taunted to it [place wall].
- T1 a) Long Rampart — 10 m / b) Ring Rampart — a half-ring 5 m round you · lib `quick`
- T2 a) Spiked — enemies striking it take 40% back / b) Arrow Slits — your followers' shots through it +20% · lib `deepen`
- T3 a) Topple — press again: it falls forward 4 m for 200% and stuns [recast] / b) Rebuild — a broken rampart refunds half the cooldown · lib `bulwark`
- T4 a) Fortress — 3 segments / b) Holy Rampart — allies behind it heal 2% a second · lib `aegis`

**6 · `unbroken_banner` · Unbroken Banner** — self / holy · cd 60, mp 30, r 10, 12 s · *plant the colours; nobody falls* · **Hook:** a banner: you and allies within 10 m cannot drop below 1 health while it stands (+20% armour); when it ends, anyone still standing heals 20%; you taunt everything within 10 m for its length [place banner, deathPrevent, taunt].
- T1 a) Short Stand — 6 s, cd 40 / b) Wide Colours — 15 m · lib —
- T2 a) War Colours — allies +20% damage / b) Gilded — allies heal 2% a second · lib `deepen`
- T3 a) Carried Banner — it follows you / b) Stand Firm — no knockback inside · lib `hunger`
- T4 a) Victory — ends with a 10 m holy blast for 300% / b) Two Banners — 2 charges · lib `aegis`

---

### 3.25 Sorcerer — Chaos Caster · INT · staff, wand · pet: storm familiar
Signature: **wild magic** — random elements, a blood-paid overdrive, punishing casters. ("Arcane Surge" is the Mage's — the sorcerer's is **Overchannel**; "Mana Burn" becomes **Mana Rend**.)

**1 · `wild_bolt` · Wild Bolt** — bolt / random · mult 1.5, cd 3, mp 5, range 34 · *you never know which* · **Hook:** each cast rolls fire / ice / lightning / shadow / poison / arcane, with that element's status; the HUD shows the next roll; 3 different elements in a row make the 4th a Prismatic bolt with every status [elementPool, sequence].
- T1 a) Wild Fan — 3 bolts, 3 rolls / b) Stable Weave — the element cycles in a fixed order instead of rolling [elementCycle] · lib `seeking`
- T2 a) Same Again — the same element twice running is +50% / b) Spilled Element — the bolt leaves a 3 s pool of its element · lib `chain`
- T3 a) Familiar Sparks — lightning rolls are copied by the familiar / b) Arcane Return — arcane rolls refund their mana · lib `cauterise`
- T4 a) Prism — every bolt carries two elements / b) Chaos Split — splits into 3 bolts of 3 rolls on impact [split] · lib `cascade`

**2 · `arcane_burst` · Arcane Burst** (legacy) — ground / arcane · mult 2.3, cd 10, mp 18, range 34, r 5, curse · *unknot whatever is in there* · **Hook:** +20% per DIFFERENT status on each target hit — it rewards Wild Bolt's mess [statusVariety].
- T1 a) Unstable — 50% chance it fires twice, 50% it fires at half / b) Focused — 3 m, +40% · lib `wide`
- T2 a) Unravel — strips one buff / b) Leaking — leaves a 4 s arcane pool · lib `deepen`
- T3 a) Feedback — 2 mana per status counted / b) Imprint — takes the element of your last Wild Bolt · lib `hunger`
- T4 a) Rift Burst — drags everything 3 m in first / b) Afterburst — a kill bursts again from the body at 50% · lib `conflagration`

**3 · `mana_rend` · Mana Rend** — beam / arcane · mult 1.6, cd 10, mp 0, range 22 · *take the power out of them* · **Hook:** costs nothing; restores 8 mana per enemy hit; casters and champions take +60% and are silenced 2 s [mana on hit, silence].
- T1 a) Wide Rend — 3 m / b) Tether — locks onto the first body for 2 s [channel] · lib `pierce`
- T2 a) Overflow — mana past your maximum becomes a barrier / b) Steal Power — steals one buff · lib `drain`
- T3 a) Empty Vessel — +1% per 1% mana you are missing / b) Rebound — jumps to one caster · lib `echo`
- T4 a) Usurp — a champion's aura is yours for 8 s / b) Bottomless — a kill resets it · lib `cascade`

**4 · `overchannel` · Overchannel** — self / arcane · cd 30, mp 0, 8 s · *pour your own life into the spell* · **Hook:** for 8 s your skills deal double, and every cast costs 3% health [hpCost per cast]. A timed overdrive — not the Mage's "next three casts".
- T1 a) Short Burn — 4 s, x2.5 / b) Long Burn — 12 s, x1.6 · lib —
- T2 a) Backlash Shield — health paid comes back as a barrier at the end / b) Volatile — each cast has a 20% chance to throw a free Wild Bolt · lib `deepen`
- T3 a) Familiar Overload — the familiar is doubled too / b) Mana Flood — no mana costs during it · lib `echo`
- T4 a) Chaos Crown — every cast gains a random rider: a fan of 3, a jump, or a 3 m burst / b) Final Burn — ends in an 8 m blast worth five times the health paid · lib `crescendo`

**5 · `transmute` · Transmute** — bolt / arcane · cd 18, mp 14, range 26, 5 s · *what were you, again?* · **Hook:** a non-boss target becomes a harmless toad for 5 s (cannot attack; it breaks on damage after the first second); bosses are slowed 50% 3 s; when it ends it takes a random element blast of 150% [disable transform].
- T1 a) Toad Pond — 3 m / b) Long Spell — 8 s · lib `seeking`
- T2 a) Volatile Toad — a toad that is killed explodes 3 m / b) Wrong Shape — instead of a toad, it fights its own side for 5 s [confuse] · lib `burst`
- T3 a) Unravel — a transmuted enemy loses its buffs / b) Fed Toad — killing one gives 15 mana · lib `brand`
- T4 a) Mass Transmute — 6 m / b) Stay That Way — non-elites under 30% stay toads until hit · lib `unmaking`

**6 · `cataclysm` · Cataclysm** — ground / random · mult 0.7 x6, cd 34, mp 38, range 30, r 9 · *every element at once* · **Hook:** six strikes, one per element, at random points inside 9 m, each with its status; a body struck by all six takes +300% on the last [elementPool all, variety].
- T1 a) Focused — every strike on the centre / b) Spread — 14 m · lib `wide`
- T2 a) Fire Heart — always ends with a 200% fire strike / b) Lingering — each strike leaves a pool of its element · lib `deepen`
- T3 a) Familiar Rain — the familiar adds 3 lightning strikes / b) Overchannelled — during Overchannel, 12 strikes · lib `hunger`
- T4 a) Twelve — 12 strikes at 60% / b) Unmade — struck enemies lose 20% of every resistance 6 s · lib `conflagration`

---

### 3.26 Runesmith — Rune-Forged Bulwark · STR · hammer, axe2h
Signature: **runes** — hits inscribe runes on enemies (stack to 3, then detonate); glyphs placed on the ground; Forge Flame imbues the weapon [stack detonate, place ward, imbue].

**1 · `rune_hammer` · Rune Hammer** — melee / arcane · mult 1.6, cd 5, mp 5, reach 3.2, arc 1.4 · *every blow leaves a mark* · **Hook:** each hit inscribes a rune (max 3); the third rune detonates for 150% and knocks 2 m [stack, detonate at max].
- T1 a) Double Rune — two runes per hit / b) Thrown Hammer — an 18 m bolt that returns [as bolt, returns] · lib `quick`
- T2 a) Binding Rune — a detonation roots 2 s / b) Fire Rune — a detonation burns · lib `shatter`
- T3 a) Runic Echo — a detonation cuts Forge Flame's cooldown 2 s [cutCooldown other] / b) Rune Chain — a detonation inscribes a rune on everything within 4 m [spread] · lib `cauterise`
- T4 a) Master Rune — detonates at 2 runes / b) Great Rune — a 5 m detonation · lib `crescendo`

**2 · `sunder` · Rend Plate** (legacy, renamed) — melee / physical · mult 1.6, cd 9, mp 8, reach 3.2, arc 1.4, weaken · *crack the shell* · **Hook:** strips 25 armour 8 s; a rune detonation on a rent target is doubled [sunder, primes].
- T1 a) Two Blows — strikes twice at 60% / b) Splitting Swing — 180° · lib `wide`
- T2 a) Deep Breach — stacks 3 times / b) Brittle — rent targets are chilled · lib `shatter`
- T3 a) Exposed Steel — followers +20% against rent targets / b) Salvage — each hit gives you a 4% barrier · lib `hunger`
- T4 a) Shatterbreak — a third stack bursts 4 m / b) Rune of Ruin — rent targets under 30% are stunned 2 s · lib `unmaking`

**3 · `stoneskin` · Runeskin** (legacy, renamed) — self / physical · stoneskin, cd 24, mp 14, 6 s · *runes carved into the skin* · **Hook:** 40% less damage, and every attacker that hits you is inscribed with a rune [onHurt stack].
- T1 a) Long Skin — 10 s, 25% / b) Thick Skin — 3 s, 70% · lib `quick`
- T2 a) Thorn Runes — attackers take 20% back / b) Shared Skin — followers within 6 m get half · lib `deepen`
- T3 a) Stone Pulse — ends with a 4 m knock / b) Mountain — no knockback · lib `echo`
- T4 a) Living Stone — heals 2% per hit taken / b) Granite Answer — if 5+ hits land, the cooldown resets · lib `wellspring`

**4 · `forge_flame` · Forge Flame** — self / fire · cd 24, mp 12, 12 s · *the weapon glows* · **Hook:** your basic swings and skills deal +40% as fire and burn; every 4th swing slams a 3 m fire burst [imbue].
- T1 a) Frost Forge — ice and chill instead / b) Storm Forge — lightning that jumps once · lib —
- T2 a) Shared Forge — followers' weapons too / b) Hot Metal — burns stack to 3 · lib `deepen`
- T3 a) Quench — press again to end it early and heal 15% / b) Forge Line — every 4th swing is a 6 m line instead · lib `echo`
- T4 a) Eternal Forge — 30 s / b) Rune-Fire — rune detonations are doubled while it burns · lib `crescendo`

**5 · `warding_glyph` · Warding Glyph** — ground / holy · cd 20, mp 16, range 14, r 6, 12 s · *a circle cut into the ground* · **Hook:** allies inside take 25% less and gain a 2% barrier a second (max 15%) [place ward].
- T1 a) Moving Glyph — centred on you / b) Twin Glyphs — 2 charges · lib `wide`
- T2 a) Repelling Glyph — an enemy entering is knocked 3 m / b) Healing Glyph — 2% heal a second instead · lib `deepen`
- T3 a) Trap Glyph — enemies crossing its edge are inscribed / b) Anchored — no knockback inside · lib `bulwark`
- T4 a) Glyph Collapse — 300% to enemies inside when it ends / b) Long Glyph — 25 s · lib `aegis`

**6 · `great_anvil` · The Great Anvil** — ground / arcane · mult 3.5, cd 45, mp 30, range 20, r 8, delay 1 · *drop the anvil of the old forges* · **Hook:** a runed anvil falls (350%, stun 2 s) and STAYS for 10 s; striking it with Rune Hammer rings it: an 8 m shockwave for 120% that inscribes a rune on everything [place totem, interact].
- T1 a) Fast Fall — no delay / b) Wide Ring — 12 m ring · lib `wide`
- T2 a) Molten Anvil — a fire pool round it / b) Lodestone — enemies within 8 m are dragged 1 m a second toward it · lib `deepen`
- T3 a) Anvil Song — it rings itself every 2 s / b) Anvil Ward — allies within 8 m take 20% less · lib `hunger`
- T4 a) Second Anvil — 2 charges / b) Shatter Anvil — press again: it explodes for 400% · lib `conflagration`

---

### 3.27 Shadow Dancer — Stealth Duelist · DEX · dagger
Signature: **afterimages** — the Rogue sets up and cashes in; the Shadow Dancer leaves shadows of itself that repeat its strikes, and finishes the weak [decoy echo, execute]. ("Smoke Veil" is not used — no "veil".)

**1 · `shade_cut` · Shade Cut** — melee / shadow · mult 1.5, cd 3, mp 3, reach 2.8, arc 1.6 · *the cut, and the cut again* · **Hook:** leaves an afterimage where you stood that repeats the cut 0.5 s later at 50% [decoy echo].
- T1 a) Two Shades — two afterimages / b) Reaching Shade — 5 m reach · lib `quick`
- T2 a) Shadow Bleed — the afterimage's cut bleeds / b) Image Strike — the afterimage's cut always crits · lib `shatter`
- T3 a) Lingering Shade — the afterimage stays 3 s and taunts [decoy taunt] / b) Shade Swap — press again: swap with the afterimage [recast swap] · lib `cauterise`
- T4 a) Dance Partner — afterimages repeat your NEXT skill too / b) Shroud Cut — a kill makes you evade everything for 1 s · lib `crescendo`

**2 · `shadowstep` · Umbral Step** (legacy, renamed) — dash / shadow · mult 2.1, cd 9, mp 10, range 14, splash 2 · *out of their shadow* · **Hook:** ends BEHIND the target; an afterimage at the start throws a dagger at it [dash behind, decoy echo].
- T1 a) Twin Steps — 2 charges / b) Long Step — 22 m · lib `quick`
- T2 a) Shadow Pin — the target is rooted 1.5 s / b) Ambush — the hit is a crit · lib `burst`
- T3 a) Step Back — press again within 3 s to return [recast return] / b) Unseen — untargetable 1 s after · lib `bulwark`
- T4 a) Chain Step — steps through 3 targets in turn / b) Endless Night — a kill resets it · lib `crescendo`

**3 · `smoke` · Shroud** (legacy, renamed; R21 found its old "vanish" text false) — self → ground / shadow · cd 20, mp 12, r 6, 6 s · *a cloud with you in it* · **Hook:** a cloud at your feet: you and followers inside evade 50% of attacks; enemies inside are Blinded; leaving keeps the evasion 2 s [place ward evade].
- T1 a) Thrown Shroud — 20 m / b) Thick Shroud — 4 m, 80% · lib `quick`
- T2 a) Choking — poisons / b) From the Dark — your skills from inside count as from behind · lib `deepen`
- T3 a) Lost Track — enemies inside forget you (threat dropped) / b) Wafting — the cloud follows you · lib `echo`
- T4 a) Twin Clouds — 2 charges / b) Phantom Shroud — afterimages made inside last 3 times as long · lib `wellspring`

**4 · `dance_of_blades` · Dance of Blades** — melee / shadow · mult 0.8 x5, cd 14, mp 14, range 8 · *the class hook: chained strikes* · **Hook:** you step between up to 5 enemies within 8 m (a dash each), each step leaving an afterimage that repeats the hit at 50% [dash multi, decoy echo].
- T1 a) Seven Steps / b) Close Dance — all five on one target · lib `heavy`
- T2 a) Bleeding Steps / b) Blinding Steps — Blinded 2 s · lib `shatter`
- T3 a) Untouched — untargetable for the whole dance / b) Smoke Dance — inside Shroud, +2 steps · lib `hunger`
- T4 a) Endless Dance — a kill adds a step / b) Curtain of Night — ends with a 6 m shadow ring · lib `crescendo`

**5 · `execute` · Assassinate** (legacy, renamed) — melee / shadow · mult 3.2, cd 14, mp 12, reach 3, arc 1.2 · *the class hook: finish the weak* · **Hook:** against a target under 30%: x2 and a kill resets it; from behind or via an afterimage it ignores armour [execute, onKill reset, behind].
- T1 a) Leaping — an 8 m dash into it / b) Thrown — a 20 m throw [as bolt] · lib `quick`
- T2 a) Wider Grave — the threshold is 40% / b) Shadow Venom — poisons · lib `shatter`
- T3 a) Fade — a kill hides you 2 s (threat dropped) / b) Shade Finish — the afterimage repeats it at 100% · lib `hunger`
- T4 a) Next Name — a kill jumps you to the lowest-health enemy within 10 m [onKill dash] / b) No Witnesses — a kill Fears everything within 6 m 3 s · lib `unmaking`

**6 · `host_of_shades` · Host of Shades** — summon / shadow · cd 50, mp 34, 10 s · *three of you* · **Hook:** three temporary shades (no follower slots) that copy every skill you cast at 40%, from where they stand [summon temporary mimic].
- T1 a) Five Shades — 25% each / b) One Shade — 80% · lib `quick`
- T2 a) Bleeding Shades / b) Bursting Shades — when they fade they burst 3 m for 100% [burstOnExpire] · lib `deepen`
- T3 a) Trade Places — press again: swap with a shade [recast swap] / b) Taunting Shades — enemies attack the shades first · lib `hunger`
- T4 a) Long Night — 18 s / b) Shades of Shades — a kill by a shade makes another (max 6) · lib `crescendo`

---

### 3.28 Tinker — Clockwork Mechanist · INT · crossbow, dagger · pet: clockwork sentry
Signature: **gadgets** — delayed charges, cycled flasks, a sentry you place and move, a pocket watch, a battery [delay, cycle, place].

**1 · `clockwork_bolt` · Clockwork Bolt** — bolt / physical · mult 1.3, cd 3, mp 4, range 38 · *a bolt with a spring in it* · **Hook:** sticks in the body and bursts 1.5 s later for 60% in 2.5 m; the sentry fires one at the same target [delay sticky, pet copy].
- T1 a) Repeater — 3 bolts in quick succession / b) Spring-Loaded — pierces 2 · lib `seeking`
- T2 a) Shrapnel — the burst throws 4 shards [split] / b) Magnetic — the burst drags 2 m inward · lib `burst`
- T3 a) Sentry Sync — the sentry attacks whatever carries a stuck bolt / b) Overwound — a crit sticks two · lib `brand`
- T4 a) Chain Detonation — a burst sets off every other stuck bolt within 6 m / b) Recycle — a burst kill gives 4 mana · lib `cascade`

**2 · `flask_grenade` · Flask Grenade** — ground / cycle · mult 1.5, cd 7, mp 8, range 24, r 3.5 · *three flasks, in order* · **Hook:** cycles Fire (burn pool) → Frost (chill) → Acid (sunder 15); the HUD shows the next flask [elementCycle].
- T1 a) Cluster — splits into 3 small flasks / b) Sticky — sticks to the first enemy and goes where it goes · lib `wide`
- T2 a) Stronger Brews — fire pool 4 s, frost freezes 1 s, acid sunders 25 / b) Mixed — every 3rd flask is all three · lib `linger`
- T3 a) Bouncing — bounces once before it bursts / b) Sentry Loader — the sentry lobs a copy · lib `hunger`
- T4 a) Bandolier — 2 charges / b) Big Flask — 6 m · lib `conflagration`

**3 · `deploy_sentry` · Deploy Sentry** (legacy) — summon / physical · cd 30, mp 20 · *wind it up and set it down* · **Hook:** the sentry is placed at your aim, not beside you; with one already out it MOVES there instead and overdrives 6 s (double fire rate) [summon place].
- T1 a) Flame Sentry — fire, burns / b) Arc Sentry — lightning, jumps once · lib `quick`
- T2 a) Plated Sentry — twice the health / b) Repair Arm — heals you 1% a second within 6 m · lib `deepen`
- T3 a) Second Sentry — a temporary second one for 20 s / b) Self-Destruct — press again: it explodes for 300% and half the cooldown returns · lib `hunger`
- T4 a) Rocket Tower — hits 3 targets / b) Crossfire Net — shots jump between your sentries · lib `aegis`

**4 · `pocket_watch` · Pocket Watch** — self / arcane · cd 22, mp 14 · *wind it back a little* · **Hook:** heals 25% now and sets a tick: the next hit above 15% in 6 s triggers a further 15% heal at once [heal, trigger].
- T1 a) Mainspring — also Hastened 4 s / b) Shared Watch — repairs the sentry 30% · lib `quick`
- T2 a) Gear Shield — the tick is a 15% barrier instead / b) Cleaning Oil — removes harmful statuses [cleanse] · lib `deepen`
- T3 a) Double Winding — 2 charges / b) Ticking Bomb — an unused tick explodes 4 m for 150% · lib `echo`
- T4 a) Perpetual — a used tick re-arms once / b) Overwind — heals 40%, then slowed 2 s · lib `wellspring`

**5 · `grapple_line` · Grapple Line** — dash / physical · mult 1.4, cd 10, mp 6, range 18 · *the hook goes out, you go after it* · **Hook:** a hook that reels YOU to whatever it hits — an enemy (a 1.4 bump and 0.5 s stun), terrain, a follower or the sentry [dash to hit].
- T1 a) Swing Kick — knocks the enemy 3 m on arrival / b) Long Line — 28 m · lib `quick`
- T2 a) Parting Gift — leaves a Clockwork Bolt in what you reeled to / b) Reel Them — a non-elite enemy is pulled to you instead [pullIn] · lib `burst`
- T3 a) Twin Hooks — 2 charges / b) Anchor — reeling to the sentry heals 10% · lib `bulwark`
- T4 a) Zip Line — leaves a line followers can dash along for 6 s / b) Rebound — a kill resets it · lib `crescendo`

**6 · `spring_battery` · Spring Battery** — self / lightning · cd 40, mp 30, 10 s · *overcharge the whole party* · **Hook:** you, the sentry and every follower: +50% attack speed and no mana costs for 10 s; the sentry fires arcs; afterwards everyone is slowed 20% for 3 s [pets status, cost override].
- T1 a) Short Charge — 6 s, no slow after / b) Long Charge — 15 s · lib —
- T2 a) Arc Field — a 6 m lightning pulse every 2 s / b) Capacitor — damage taken during it is released as a blast at the end · lib `deepen`
- T3 a) Supercharged — the sentry fires twice / b) Spare Cell — half the cooldown back if you were not hit · lib `hunger`
- T4 a) Chain Cells — kills add 1 s / b) Burst Cell — ends with a 10 m blast for 400% · lib `crescendo`

---

### 3.29 Priest — Holy/Shadow Caster · INT · iron mace, scepter, staff · pet: spirit bear
Signature: **the reviver who answers** — prayers that heal friends and hurt foes in one cast, a vigil that raises the fallen before they fall, and shadow aimed at whoever did the killing. (Cleric = protect and raise everyone at once; Priest = pre-paid revives and revenge.)

**1 · `shadow_lance` · Shadow Lance** (legacy) — bolt / shadow · mult 1.9, cd 5, mp 10, range 38, splash 2 · *a dark mercy* · **Hook:** 25% of the damage it deals heals the most-hurt ally [onHit healAlly].
- T1 a) Twin Lances / b) Long Lance — pierces 2 · lib `seeking`
- T2 a) Wither — Weakened / b) Grief — +60% against a target marked by Mark the Killer [consumes no-remove] · lib `chain`
- T3 a) Dark Mend — 50% heals / b) Spirit Feed — the bear heals 3% per hit · lib `brand`
- T4 a) Night Without End — a kill refunds it / b) Split Shadows — splits into 3 on impact [split] · lib `cascade`

**2 · `dawn_prayer` · Prayer of Dawn** — around / holy · mult 0.8, heal 20%, cd 12, mp 16, r 10 · *light that knows friend from foe* · **Hook:** ONE ring that heals every ally 20% and hurts every enemy 80% [heal + damage].
- T1 a) Wide Prayer — 16 m / b) Focused Prayer — one ally (aimed): 45% · lib `quick`
- T2 a) Lingering Prayer — the heal comes again over 6 s / b) Searing Prayer — enemies burn (holy) · lib `deepen`
- T3 a) Bear's Blessing — the bear gets +30% damage 8 s / b) Answered — overhealing becomes a barrier · lib `echo`
- T4 a) Twice Said — 2 charges / b) Dawn on the Dead — undead in it are stunned 2 s · lib `wellspring`

**3 · `mark_the_killer` · Mark the Killer** — bolt / shadow · mult 0.6, cd 16, mp 10, range 34, 12 s · *you, I saw that* · **Hook:** Marked: +20% from shadow; and whenever a follower falls, its killer is Marked for free [primes marked, auto on ally death].
- T1 a) Two Marks / b) Long Mark — 20 s · lib —
- T2 a) Haunted — Marked targets are slowed 30% / b) Bear's Grudge — the bear goes for the Marked [command focus] · lib `deepen`
- T3 a) Shadow Debt — damage to a Marked target heals you 5% of it / b) Retribution — a Marked death bursts 6 m for 150% · lib `hunger`
- T4 a) Avenger — while a follower is fallen you deal +40% to Marked targets / b) Dread — a Marked target is Feared 2 s when it drops to 50% · lib `unmaking`

**4 · `vigil` · Vigil** — self / holy · cd 45, mp 24, 30 s · *the prayer said before the fall* · **Hook:** place a Vigil on a follower (or yourself, see T3): if it falls within 30 s it rises at once at 40% and its killer is Marked [revive trigger].
- T1 a) Two Vigils / b) Long Vigil — 60 s · lib —
- T2 a) Rise Angry — +40% damage for 8 s after rising / b) Rise Shining — rising releases a 6 m holy burst · lib `deepen`
- T3 a) Self Vigil — may be placed on you / b) Bear's Vigil — the bear always has one (re-arms every 90 s) · lib `hunger`
- T4 a) Full Rising — rises at 100% / b) Shadow Rising — the risen ally deals shadow and leeches 10% for 10 s · lib `aegis`

**5 · `dread_hymn` · Dread Hymn** — around / shadow · cd 18, mp 14, r 8 · *a song they cannot stand to hear* · **Hook:** non-boss enemies within 8 m are Feared (flee) 3 s; followers deal +20% to fleeing enemies [fear].
- T1 a) Wide Hymn — 12 m / b) Personal Terror — one target (aimed), 6 s · lib `wide`
- T2 a) Haunting — fleeing enemies take 20% a second (shadow) / b) Herded — they flee toward your bear, not away from you · lib `deepen`
- T3 a) Despair — Weakened when the fear ends / b) Steadying Verse — followers heal 10% · lib `bulwark`
- T4 a) Two Verses — 2 charges / b) Unhinged — feared enemies attack each other instead [confuse] · lib `aegis`

**6 · `twinlight` · Twinlight** — around / holy+shadow · cd 40, mp 36, r 14, 6 s · *dawn and dusk at once* · **Hook:** a pulse every second that alternates: holy (heals allies 6%, burns undead) and shadow (hits enemies 80%, heals you 25% of it) [repeats alternating].
- T1 a) Short and Bright — 3 s, pulses twice a second / b) Long Dusk — 10 s · lib —
- T2 a) Bear's Twinlight — the bear is empowered while it lasts / b) Raising Light — the 3rd holy pulse revives one fallen follower · lib `deepen`
- T3 a) Walking Light — follows you / b) Dusk Only — shadow pulses only, x1.6 · lib `hunger`
- T4 a) Balanced — every pulse is both / b) Final Light — ends with 300% · lib `crescendo`

---

### 3.30 Enchanter — Mind-Magic Controller · INT · staff, wand · pet: bound imp
Signature: **sleep and charm** — Drowse opens packs without alerting them; Arcane Jolt wakes a target only when you want it dead. The Enchanter OWNS sleep (see plan §6: the Bard's Lullaby is replaced so sleep is not shared).

**1 · `arcane_jolt` · Arcane Jolt** — bolt / arcane · mult 1.3, cd 2.5, mp 4, range 34 · *wake up* · **Hook:** against a sleeping or charmed target: x2.5, and it wakes Dazed 3 s [consumes sleep].
- T1 a) Twin Jolt / b) Gentle Jolt — does not wake it (x1.5 instead) · lib `seeking`
- T2 a) Mind Spike — Dazed targets take +20% / b) Pass the Dream — the woken target's sleep moves to the nearest awake enemy for 2 s · lib `chain`
- T3 a) Dream Harvest — a jolt on a sleeper returns its mana / b) Imp Prod — the imp attacks what you woke [command pounce] · lib `brand`
- T4 a) Rude Awakening — waking explodes 3 m for 150% / b) Recurring — a kill on a jolted target resets it · lib `cascade`

**2 · `drowse` · Drowse** — ground / arcane · cd 14, mp 14, range 30, r 5 · *every one of them, asleep* · **Hook:** sleep 6 s (breaks on damage); a sleeper does not alert its pack [disable sleep, noAlert].
- T1 a) Wide Drowse — 8 m, 4 s / b) Deep Drowse — 3 m, 10 s · lib `wide`
- T2 a) Dream Leech — 1 mana per sleeper per second / b) Sleepwalk — sleepers drift 1 m a second away from you · lib `deepen`
- T3 a) Heavy Sleep — the first hit does not wake them, the second does / b) Leave Them — followers ignore sleepers · lib `hunger`
- T4 a) Twin Drowse — 2 charges / b) Nightmare — a waking sleeper takes 200% shadow · lib `aegis`

**3 · `beguile` · Beguile** — bolt / arcane · cd 24, mp 18, range 26, 10 s · *now you work for me* · **Hook:** a non-boss enemy fights for you for 10 s (a temporary follower, no slot), then is Dazed [charm].
- T1 a) Long Charm — 16 s / b) Quick Charm — 6 s, cd 14 · lib —
- T2 a) Devoted — the charmed enemy deals +30% / b) Bitter End — when it ends, it takes 200% · lib `deepen`
- T3 a) Two Charmed / b) Imp's Friend — the imp's buffs reach the charmed too · lib `hunger`
- T4 a) Kept — a charmed non-elite under 30% stays for good (takes a follower slot) / b) Sacrifice — press again: the charmed explodes for 300% [recast detonate] · lib `aegis`

**4 · `befuddle` · Befuddle** — around / arcane · cd 16, mp 14, r 6, 4 s · *who are you hitting?* · **Hook:** enemies within 6 m are confused: each attacks the nearest creature, friend or foe [confuse].
- T1 a) Wide Fog — 9 m / b) One Mind — one aimed target, 10 s · lib `wide`
- T2 a) Mutual Harm — confused enemies take +20% from each other / b) Wandering — they walk at random instead of attacking · lib `deepen`
- T3 a) Imp Chaos — the imp's hits confuse 2 s / b) Clarity Theft — 2 mana per confused enemy per second · lib `hunger`
- T4 a) Mass Befuddle — 12 m / b) Long Fog — 8 s · lib `aegis`

**5 · `phantasm` · Phantasm** — summon / arcane · cd 22, mp 14, 8 s · *a double they believe in* · **Hook:** a phantom of you that taunts everything within 8 m; anything that strikes it falls asleep 2 s [decoy, sleep on hit].
- T1 a) Two Phantasms / b) Long Phantasm — 14 s · lib `quick`
- T2 a) Hypnotic — the sleep lasts 4 s / b) Shattering — it bursts 3 m for 120% when it ends [burstOnExpire] · lib `deepen`
- T3 a) Trade Places — press again: swap with it [recast swap] / b) Echoing Mind — it casts Arcane Jolt at what it put to sleep · lib `hunger`
- T4 a) A Crowd of You — 3 phantasms / b) Deep Dream — sleepers it makes do not wake from the first hit · lib `aegis`

**6 · `enthrall` · Grand Enthrallment** — around / arcane · cd 60, mp 40, r 12, 6 s · *the whole pack, yours for a moment* · **Hook:** every non-boss enemy within 12 m is charmed 6 s and turns on the others; bosses are slowed 50% and take +30%; when it ends, every one wakes Dazed [charm area].
- T1 a) Brief Hold — 3 s, cd 40 / b) Long Hold — 10 s · lib —
- T2 a) Puppet Strings — the charmed deal +50% / b) Lights Out — it ends in a 4 s sleep instead of a daze · lib `deepen`
- T3 a) Imp Lord — the imp grows for the duration / b) Tide of Thought — 3 mana per charmed enemy per second · lib `hunger`
- T4 a) One Stays — the strongest non-elite stays charmed 20 s more / b) Final Command — when it ends every charmed enemy explodes for 150% · lib `crescendo`
