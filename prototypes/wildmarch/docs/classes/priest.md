# Priest — class 29

> *"The lamp and the dark are one hand. I choose which way it's turned."*

**Role:** Healer · **Can also:** Damage · **Armour:** light · **Resource:** Mana + the **Balance** slider · **Primary attribute:** INT (CON second)
Owner of this file: every `priest_*` spell, talent, set, legendary and unique. Template: [page 00 §5](../00-OVERVIEW.md).
Healing, battle-revive limits and death rules: [page 05](../05-COMBAT.md).

### Numbers used on this page

| Term | Meaning |
|---|---|
| **SP** | spell power; heals and damage both scale from it (page 05) |
| Mana cost | % of base maximum Mana |
| **Balance** | the Priest's slider, −100 (Shadow) … 0 … +100 (Light) |
| HoT | "heal over time": healing paid in ticks every 1 s |
| Battle revive | bringing a dead player back **during** combat; page 05 limits these per group |
| GCD | 1.0 s, can be hasted to 0.75 s |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A temple priest who keeps both the lamp and the dark. Mending pulls them toward Light; harming pulls them toward Shadow. Every spell changes shape with where the slider sits, so the Priest plays a balancing act — or leans hard into one side on purpose. |
| Role | Healer (main). Damage spec by living in the Shadow half. |
| Armour | light (white trim robe, hood, slippers, chained tome) |
| Weapons | mace, scepter (one hand) + focus (Psalter / Reliquary, `(reuse: farhold/js/foci.js)`), or staff. |
| Resource | Mana |
| Companion | none. (Farhold gave the priest a spirit bear; Wildmarch drops it — beasts belong to druid/shaman.) |
| Playstyle | 1) Heal and ward allies; that slides you toward Light. 2) Harm enemies with the same spells turned on them; that slides you toward Shadow. 3) In **Dawn** or **Dusk** (the two ends) every spell changes into a stronger version of that side — keep the slider where the fight needs it. |

Starting kit: Acolyte's Scepter, Psalter (off hand), light robe, hood, 1 spell (`priest_wickflame`) + the class ability **Call Back** (resurrect, out of combat).

---

## 2. Class mechanic — Light/Shadow Balance

### 2.1 The slider

- Balance runs **−100 … +100**, starting at 0. Each spell lists how far it pushes (e.g. **+8** = toward Light).
- Out of combat it drifts back to 0 at 10 per second.
- **Always on (level 1):** healing done is multiplied by `1 + 0.25 × (B/100)` when B > 0, damage done by `1 + 0.25 × (−B/100)` when B < 0.
  The other side pays: at +100, damage −15%; at −100, healing −15% (linear from 0).
- **Bands** (Calling 6):

| Band | Range | What happens |
|---|---|---|
| **Dawn** | +50 … +100 | Every spell turns into its **Dawn version** (§4). The slot icons turn gold. |
| **Grey** | −49 … +49 | Base versions. |
| **Dusk** | −50 … −100 | Every spell turns into its **Dusk version** (§4). The slot icons turn violet. |

- Dawn versions of heals keep pushing Light; Dusk versions of heals push **Shadow** — so a Priest can heal while staying in Dusk. That is on purpose: Dusk is "healing by hurting".

### 2.2 The gauge (HUD)

- A **horizontal slider** 240 px wide directly above the spell bar: gold on the right, violet on the left, grey in the middle,
  with tick marks at ±50. A lamp-shaped marker shows B; the marker leaves a 1 s ghost trail so you see which way you are moving.
- The band name ("DAWN" / "DUSK") appears over the slider when you enter it, with a chime (Dawn: bell; Dusk: low gong).
- Anchor (Calling 40) shows a padlock over the marker and a 15 s ring.
- Party frames (page 03) show a small gold/violet dot next to the Priest's name so other healers can read the band.

### 2.3 Call Back — the resurrect (class ability, not a slot spell)

| id | `priest_call_back` |
|---|---|
| Out of combat (level 1) | 3 s cast, 40 m, a dead ally stands up at 50% health and 30% Mana. No cooldown. |
| In combat (Calling 20) | 2.5 s cast, 30 m, revive at 35% health; counts as a **battle revive** (page 05 group limit); the revived ally is immune to damage for 2 s. |
| Mass (Calling 40, out of combat) | 8 s channel, every dead ally within 30 m stands up at 50%. 10 min cooldown. |
| Look / sound | A column of light and shadow twisted together over the body (spellfx `holy` + `shadow` helix); a sung note that rises. |

### 2.4 Calling quests

| Level | Quest id | Summary | Grants |
|---|---|---|---|
| 1 | — | — | Slider with its always-on multipliers; Call Back out of combat. |
| 6 | `q_priest_calling_lamp` | Hearthvale: tend the Brightwater temple's two lamps (one lit, one shuttered) through a night of sick villagers and a barrow-ghost that feeds on light. Heal 10 villagers, then banish the ghost by fighting it at −50 or lower. | **Bands** (Dawn / Dusk) and every spell's alternate versions; the gauge's band marks. |
| 20 | `q_priest_calling_toll` | Sunscar: carry a dead Sandsworn guide back to the oasis for burial, keeping her caravan alive through two ambushes; a dialog opportunity with the thing that killed her (forgive / condemn / bargain) sets your slider for the final fight. | **Call Back in combat** and **Equinox**: crossing from Dawn to Dusk (or back) within 6 s makes your next spell cast **both** its Dawn and its Dusk version. |
| 40 | `q_priest_calling_eclipse` | Drowned Coast: relight the Saltdeep lighthouse while the Drowned choir tries to put it out; hold the slider inside a narrow window that moves every 20 s (a scripted "balance" trial). | **Anchor** (class key `Z`, proposed — page 02 owns keys): lock the slider where it is for 15 s, 60 s cooldown; bands widen to ±40; **mass Call Back**. |

---

## 3. The six spells

### 3.1 At a glance (base versions)

| Slot | id | Name | Lvl | Cost | CD | Cast | Range | Shape | Main number | Push |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `priest_wickflame` | Wickflame | 1 | 2% Mana | — | 1.5 s | 40 m | ally **or** enemy | heal 170% SP / 130% SP shadow | +8 / −8 |
| 2 | `priest_candle_ward` | Candle Ward | 4 | 3% Mana | 6 s | instant | 40 m | ally | absorbs 190% SP, 12 s | +6 |
| 3 | `priest_choir_of_lamps` | Choir of Lamps | 10 | 5% Mana | 8 s | 2 s | 40 m | ally + 10 m around | 5 allies × 120% SP | +12 |
| 4 | `priest_penumbra` | Penumbra | 18 | 4% Mana | 12 s | instant | 30 m | ground, 6 m, 8 s | enemies 25% SP/s, allies 1.2% max HP/s | ±1 per tick |
| 5 | `priest_hold_the_flame` | Hold the Flame | 28 | 4% Mana | 60 s | instant, off GCD | 40 m | ally | heal 300% SP + Deathward | +20 |
| 6 | `priest_eclipse_hymn` | Eclipse Hymn | 40 | 12% Mana | 120 s | 4 s channel | 25 m | 5 allies + 5 enemies | 8 pulses × 60% SP each way | → 0 |

Healer checklist: **single** (Wickflame), **shield** (Candle Ward), **group** (Choir of Lamps, Penumbra), **emergency** (Hold the Flame), **raid cooldown** (Eclipse Hymn), **resurrect** (Call Back).

### 3.2 Details (base)

**`priest_wickflame` — Wickflame** (slot 1, level 1) `(new)`
- 2% Mana · no cooldown · 1.5 s cast · 40 m · **picks its face by target:**
  - on an **ally** (or yourself): heal **170% SP**. Push **+8**.
  - on an **enemy**: *Gloam*, **130% SP shadow** damage. Push **−8**.
- Look: ally — a small flame blooms in their chest and rises (spellfx `holy` impact, `holy_mote`); enemy — a violet candle-flame that burns downward (spellfx `shadow` ribbon bolt). Sound: soft "fwup" of a wick / a snuffing hiss.

**`priest_candle_ward` — Candle Ward** (slot 2, level 4) `(new)`
- 3% Mana · 6 s · instant · 40 m · ally.
- Barrier absorbing **190% SP** for 12 s. One Candle Ward per ally (recast refreshes and replaces). Push **+6**.
- Look: a ring of five candles orbiting the ally (STATUS_FX `barrier` with holy_mote sprites). Sound: a bell tap.

**`priest_choir_of_lamps` — Choir of Lamps** (slot 3, level 10) `(new)`
- 5% Mana · 8 s · 2 s cast · 40 m to the target ally · heals the target and up to 4 more allies within 10 m of them (lowest health first) for **120% SP** each. Push **+12**.
- Look: lamps rise over each healed ally and hum a chord (spellfx `holy` rune shape over heads). Sound: a short choir chord (formant voices, three pitches).

**`priest_penumbra` — Penumbra** (slot 4, level 18) `(new)`
- 4% Mana · 12 s · instant · ground up to 30 m · 6 m circle, 8 s.
- Every 1 s: enemies inside take **25% SP shadow**; allies inside heal **1.2% of max health**. Each enemy tick pushes −1, each ally tick +1 (the pool balances itself).
- Look: half the circle gold, half violet, slowly rotating (spellfx ground disc in both palettes). Sound: a low hum with a bell tone every tick.

**`priest_hold_the_flame` — Hold the Flame** (slot 5, level 28) `(new)` — emergency heal
- 4% Mana · 60 s · instant, off the GCD · 40 m · ally.
- Heal **300% SP**. If the ally is below 25% health, also **Deathward** for 6 s: the next hit that would kill them leaves them at 1 health and heals 20% of max health. Push **+20**.
- Look: a white-gold vertical sigil through the ally (spellfx `holy` rune, large). Sound: a single struck bell, long ring.

**`priest_eclipse_hymn` — Eclipse Hymn** (slot 6, level 40) `(new)` — raid cooldown
- 12% Mana · 120 s · 4 s channel (you can turn, not move) · 25 m around you.
- 8 pulses (every 0.5 s): heal the 5 lowest-health allies for **60% SP** **and** deal **60% SP shadow** to 5 enemies (most health first).
- At the end: Balance snaps to **0** and you gain **Twilight** for 8 s — both sides' bonuses at full (+25% healing **and** +25% damage) and Dawn and Dusk versions are both available (each slot shows two halves; left click = Dusk, right click / modifier = Dawn — page 02).
- Look: a disc overhead, gold on one side, violet on the other, turning a full circle through the channel; beams fall from both halves. Sound: a hymn (Lingo-free wordless choir), rising.

---

## 4. Alternate spells — Dawn and Dusk versions (Calling 6)

| Base | Dawn version (B ≥ +50) | Dusk version (B ≤ −50) |
|---|---|---|
| **Wickflame** | `priest_sunwick` **Sunwick** — ally: **instant**, 140% SP + 60% SP HoT over 6 s, push +8. Enemy face unchanged. | `priest_nightgloam` **Nightgloam** — enemy: **instant**, 110% SP + *Rot* 90% SP over 6 s, and heals the lowest-health ally within 30 m of **you** for 40% of the damage. Push −8. Ally face: 1.5 s, heals 150% SP but pushes **−6**. |
| **Candle Ward** | `priest_sunward` **Sunward** — absorbs 230% SP; when it breaks it heals the ally 60% SP. | `priest_umbral_ward` **Umbral Ward** — absorbs 170% SP; 40% of what it absorbs is dealt back to the attacker as shadow. Push **−6**. |
| **Choir of Lamps** | `priest_dawnchorus` **Dawnchorus** — **instant**, 140% SP to 5 allies. | `priest_requiem` **Requiem** — 8 m shadow burst around the target ally, 90% SP to every enemy; the total damage is split as healing among the 5 lowest allies in 10 m. Push −10. |
| **Penumbra** | `priest_sunwell` **Sunwell** — no damage; allies heal 2.5%/s and take 10% less damage. Push +1/tick. | `priest_umbral_pool` **Umbral Pool** — enemies 45% SP/s and 20% slow; allies inside heal for 10% of all damage they deal (leech). Push −1/tick. |
| **Hold the Flame** | `priest_sunrise_rite` **Sunrise Rite** — heal 400% SP, Deathward always (any health). | `priest_tolling_rite` **Tolling Rite** — heal 200% SP + Deathward always; if Deathward triggers, the killing blow is dealt back to its source ×2 as shadow. Push −20. |
| **Eclipse Hymn** | `priest_hymn_of_noon` — pulses heal 90% SP, damage 30%. | `priest_hymn_of_midnight` — pulses damage 90% SP, heal 30%. |

---

## 5. Talents (tiers at 12 / 22 / 32 / 45)

### Wickflame
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `priest_wickflame_t1a` | Twin Wick | Wickflame on an ally also heals the nearest other injured ally within 10 m for 50%. |
| 12 | `priest_wickflame_t1b` | Walking Flame | Castable while moving at 60% speed (cast 1.8 s). |
| 22 | `priest_wickflame_t2a` | Flicker | Gloam bounces to 1 more enemy within 8 m for 60%. |
| 22 | `priest_wickflame_t2b` | Warm Hands | Wickflame's heal leaves a 3 s HoT of 30% SP. |
| 32 | `priest_wickflame_t3a` | Tipping Wick | Wickflame pushes ±14 instead of ±8. |
| 32 | `priest_wickflame_t3b` | Steady Wick | Wickflame pushes 0 (use it without leaving your band). |
| 45 | `priest_wickflame_t4a` | Pillar Flame | Every 4th Wickflame is a pillar: heals all allies in a 3 m circle around the target for 100%. |
| 45 | `priest_wickflame_t4b` | Borrowed Flame | Gloam kills restore 3% Mana and cast a free Wickflame on the lowest ally. |

### Candle Ward
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `priest_candle_ward_t1a` | Candle Pair | 2 charges. |
| 12 | `priest_candle_ward_t1b` | Tall Candle | Absorbs 260% SP but cooldown 12 s. |
| 22 | `priest_candle_ward_t2a` | Wax Seal | While it holds, the ally cannot be knocked back. |
| 22 | `priest_candle_ward_t2b` | Snuff | When it breaks, it silences the attacker 2 s (non-boss). |
| 32 | `priest_candle_ward_t3a` | Guttering | When the ward expires unbroken, its remaining value heals the ally. |
| 32 | `priest_candle_ward_t3b` | Candle Chain | Casting on a warded ally moves the old ward to the next lowest ally within 20 m. |
| 45 | `priest_candle_ward_t4a` | Vigil | Warded allies' first death in 60 s is prevented (1 health, the ward is used up). |
| 45 | `priest_candle_ward_t4b` | Candlestorm | Breaking the ward scatters 5 candles that fly to 5 allies for 40% SP absorbs each. |

### Choir of Lamps
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `priest_choir_of_lamps_t1a` | Wide Choir | Radius 16 m, 6 allies. |
| 12 | `priest_choir_of_lamps_t1b` | Held Note | Becomes a 3 s channel healing the group 5 times at 35%. |
| 22 | `priest_choir_of_lamps_t2a` | Lamp Line | Heals allies in a 3 m wide line between you and the target instead. |
| 22 | `priest_choir_of_lamps_t2b` | Harmony | Each healed ally takes 8% less damage for 6 s. |
| 32 | `priest_choir_of_lamps_t3a` | Answering Choir | If 5 allies are healed, cooldown −4 s. |
| 32 | `priest_choir_of_lamps_t3b` | Choir Wardens | Overhealing becomes a barrier (up to 30% SP per ally). |
| 45 | `priest_choir_of_lamps_t4a` | Cathedral | Also drops a 6 m Penumbra at the target (Penumbra's own cooldown untouched). |
| 45 | `priest_choir_of_lamps_t4b` | Last Verse | Heals twice as much on allies below 40%. |

### Penumbra
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `priest_penumbra_t1a` | Walking Shade | The pool follows the ally you last healed. |
| 12 | `priest_penumbra_t1b` | Deep Shade | 9 m, 12 s. |
| 22 | `priest_penumbra_t2a` | Tidepool | Pulls enemies inside 1 m toward the centre each tick. |
| 22 | `priest_penumbra_t2b` | Clean Water | Each ally tick removes one damage-over-time effect (1 per ally per 4 s). |
| 32 | `priest_penumbra_t3a` | Dimming | Enemies inside deal 10% less damage. |
| 32 | `priest_penumbra_t3b` | Void-Eater | Placed on an enemy void zone, the pool shrinks it by 1 m per second. |
| 45 | `priest_penumbra_t4a` | Twin Shades | Two pools, one Dawn and one Dusk, regardless of your band. |
| 45 | `priest_penumbra_t4b` | Night Garden | Enemies that die inside burst into 5% max health heals for allies within 6 m. |

### Hold the Flame
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `priest_hold_the_flame_t1a` | Early Flame | Deathward threshold 40%. |
| 12 | `priest_hold_the_flame_t1b` | Quick Flame | Cooldown 40 s, heal 220% SP. |
| 22 | `priest_hold_the_flame_t2a` | Flame of Rest | The ally is also freed of all movement-impairing effects. |
| 22 | `priest_hold_the_flame_t2b` | Shared Flame | Also heals you for 50% of the amount. |
| 32 | `priest_hold_the_flame_t3a` | Beyond the Veil | Castable on an ally who died in the last 3 s: they stand up at 20% (a battle revive, page 05). |
| 32 | `priest_hold_the_flame_t3b` | Second Candle | Deathward can trigger twice. |
| 45 | `priest_hold_the_flame_t4a` | Flame for All | Hits every ally below 25% within 20 m of the target. |
| 45 | `priest_hold_the_flame_t4b` | Keeper of Hours | Deathward lasts 12 s. |

### Eclipse Hymn
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `priest_eclipse_hymn_t1a` | Processional | You may walk at 50% speed while channelling. |
| 12 | `priest_eclipse_hymn_t1b` | Short Hymn | 2 s channel, 4 pulses at 110%. |
| 22 | `priest_eclipse_hymn_t2a` | Sanctuary Chord | Allies inside 25 m take 20% less damage during the channel. |
| 22 | `priest_eclipse_hymn_t2b` | Totality | The last pulse is triple strength. |
| 32 | `priest_eclipse_hymn_t3a` | Long Twilight | Twilight lasts 14 s. |
| 32 | `priest_eclipse_hymn_t3b` | Called Home | Any ally who died in the last 10 s is revived at 20% at the end (does not count as a battle revive; once per fight). |
| 45 | `priest_eclipse_hymn_t4a` | Eternal Hymn | Cooldown 90 s. |
| 45 | `priest_eclipse_hymn_t4b` | Sun and Moon | Heal targets 10 and damage targets 10 (raid version). |

---

## 6. Rotation / how it plays

- **Solo:** sit in Dusk. Nightgloam (instant) + Umbral Pool + Umbral Ward on yourself; Requiem heals you from the damage. Hold the Flame (Tolling) for emergencies.
- **Dungeon healer:** Candle Ward on the tank on cooldown, Wickflame as the filler; the slider climbs to Dawn → instant Sunwicks and Dawnchorus. When the tank is steady, throw Gloams to dip back to Grey and stretch Mana.
- **Raid healer:** most raid healers sit in Dawn. The Equinox trick (Calling 20): before a big damage event, dip to Dusk with Gloam spam, then swing to Dawn — the next Choir comes out as both Dawnchorus and Requiem at once. Eclipse Hymn is the raid damage-phase cooldown. Anchor (Calling 40) keeps Dawn through a damage phase where you must throw Gloams to kill adds.
- **Damage spec (raid):** Dusk anchored, Nightgloam / Umbral Pool / Requiem; you still bring Tolling Rite and Call Back.

## 7. Boss mechanics

| Mechanic | Priest answer |
|---|---|
| Tank buster | Candle Ward just before; Hold the Flame Deathward if it goes wrong. |
| Room-wide damage | Choir of Lamps, Eclipse Hymn, Sanctuary Chord talent. |
| Soaks | Candle Ward on each soaker (2 charges talent). |
| Void zones | Void-Eater (Penumbra t3b) shrinks them; Clean Water cleanses the ticks. |
| Movement phases | Instant Dawn versions are the reason to be in Dawn when the boss moves. Walking Flame, Processional. |
| Deaths | Call Back (battle revive), Beyond the Veil, Called Home. |
| Boss that punishes healing (a mechanic page 11 may use) | Dusk versions heal through damage — no direct "heal" cast needed. |
| Shadow-immune boss | Gloam, Requiem and Umbral Pool deal 0 to it (the boss tooltip warns). Stay in Dawn and heal; kill adds with Gloam to steer the slider. |

---

## 8. Class sets

### `set_priest_lampkeepers_vestments` — The Lampkeeper's Vestments (levels 19–24)
Drops: `d05_glass_tombs`, `d06_sandsworn_vault` bosses (Normal, 15%); complete on Heroic.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Wickflame's heal is instant every 3rd cast. | `priest_wickflame` |
| 4 | Candle Ward cast on an ally already at full health also heals the lowest ally within 20 m for 100% SP. | `priest_candle_ward` |
| 6 | Entering Dawn gives +10% Mana regeneration for as long as you stay. | Balance |

### `set_priest_regalia_of_the_sunken_choir` — Regalia of the Sunken Choir (level 50)
Drops: `r03_sunken_choir` bosses, token system.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Choir of Lamps heals a 6th ally. | `priest_choir_of_lamps` |
| 4 | Penumbra's Dawn and Dusk halves alternate every 2 s (the pool does both jobs, at 70%). | `priest_penumbra` |
| 6 | Equinox also resets Choir of Lamps' cooldown. | Equinox |

### `set_priest_veil_of_the_twin_lamps` — Veil of the Twin Lamps (level 60)
Drops: `r05_veilspire` bosses, Mythic for the 6th piece.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Hold the Flame' Deathward also leaves a Candle Ward on the ally. | `priest_hold_the_flame` |
| 4 | Twilight after Eclipse Hymn also makes all spells cost 50% Mana. | `priest_eclipse_hymn` |
| 6 | Anchor has 2 charges. | Anchor |

---

## 9. Legendaries and uniques

| id | Name | Slot | Power (numbers) | Drop source |
|---|---|---|---|---|
| `leg_the_first_lamp` | The First Lamp | off hand (Reliquary) | Dawn starts at +30 instead of +50. | `d11_saltdeep_cathedral` Heroic/Mythic+ final boss (4%) |
| `leg_censer_of_two_smokes` | Censer of Two Smokes | mace | While you are in Grey (−49…+49), heals +12% and damage +12%. | `r03_sunken_choir` final boss (Mythic 6%) |
| `leg_bell_of_the_last_hour` | Bell of the Last Hour | neck | Hold the Flame' cooldown resets when Deathward triggers (once per 3 min). | `r02_glacier_throne` boss 4 (8%) |
| `leg_mourners_veil` | Mourner's Veil | head | While in Dusk, Nightgloam's healing hits 3 allies. | Drowned Coast world boss (weekly 6%) |
| `leg_scepter_of_noon_and_midnight` | Scepter of Noon and Midnight | scepter | Twilight lasts until you leave both bands (Grey ends it). | `r05_veilspire` secret boss |
| `uq_wax_saints_hands` | Wax Saint's Hands | hands | Candle Ward absorbs +25%. | `d01_hollow_barrow` final boss (Normal 12%) |
| `uq_tallow_psalter` | Tallow Psalter | off hand (Psalter) | Call Back in combat costs no Mana and its cast is 1.5 s. | `d08_moonwell_ruins` boss 2 |
| `uq_thornlamp_staff` | Thornlamp Staff | staff | Penumbra roots non-boss enemies 1 s on its first tick. | `d07_thornheart` final boss |

---

## 10. Voice and barks

- Timbre: `voiceFor({ role: 'healer', gender, seed })`, calm, slow, soft (tone warm). Dusk lines use the same voice pitched −10% with 0.2 breath. `(reuse: shared/voices.js)`

| Event | Lines |
|---|---|
| Heal | "Be well." · "Hold on to the light." |
| Gloam | "Answer for it." · "Into the dark." |
| Enter Dawn | "The lamp is lit." |
| Enter Dusk | "Shutter the lamp." |
| Call Back | "Not yet. Come back." · "You're not done here." |
| Hold the Flame | "Not today." |
| Crit heal | "Blessed." |
| Low health | "Even the lamp needs tending — help me!" |
| Out of Mana | "The oil's run out." |

---

## 11. Reuse notes

| Wildmarch piece | Borrowed from | Notes |
|---|---|---|
| Wickflame heal / Gloam | Farhold `mend` holy impact; `shadow_lance` bolt | new numbers, two faces |
| Candle Ward | STATUS_FX `barrier` | candle sprites |
| Choir of Lamps | Farhold `renew` "everything following you" group logic | now target-centred |
| Penumbra | Farhold `consecrate` + `void_rift` ground pulse engine | two palettes |
| Hold the Flame / Deathward | the revive rule (Emberveil `hero.revivedBy` + revive memory; Farhold's respawn path in `js/main.js`) | Deathward is new |
| Outfit | `class-outfits.json` `priest` (white trim robe, hood, chained tome) | |
| Emberveil ideas | `priest_mend`, `priest_call_back`, `shadow_bolt`, `shadow_veil` | reborn as Wickflame, Call Back, Gloam, Umbral Pool |
