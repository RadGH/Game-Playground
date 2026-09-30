# Priest — class design (`priest`)

> *"The lamp and the dark are one hand. I choose which way it's turned."*

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Follows the class template in [page 00 §5](../00-OVERVIEW.md).
Canon facts used (page 00 §6): primary role **Healer**, hybrid role **Damage**, build **caster**, **light** armour,
resource **Mana**, mechanic **Light/Shadow balance — a slider; heals push light, harm pushes shadow**, spell slots
**1 / 4 / 10 / 18 / 28 / 40**, calling quests **6 / 20 / 40**, talent tiers **12 / 22 / 32 / 45**, cap **60**.
Owner of this file: every `priest_*` spell, talent, set, legendary, unique and soul.
Healing, death and revive rules: [page 05](../05-COMBAT.md) (there is **no limit on in-combat revives**, 00 §12.1 W21).

## How to read the numbers on this page

| Term | Meaning |
|---|---|
| **SP** | spell power; heals and damage both scale from it (page 05). The number is final |
| **Mana** | the priest's resource. Pool = **100% base Mana** (≈2,400 at level 60, page 07). **Regenerates 1.1% of max per second in combat, 3% out of combat.** Costs are % of base maximum Mana. **Builders:** none (Mana only refills; talents *Borrowed Flame* and the Lampkeeper set add a little). **Spenders:** every spell (2%–12%) |
| **Balance** | the priest's slider, −100 (Shadow) … 0 … +100 (Light) |
| **HoT** | "heal over time": healing paid in ticks every 1 s |
| GCD | 1.0 s, can be hasted to 0.75 s |
| **Targeting** | page 02 / 00 §12.1 W8. **Needs target** = will not cast without a valid hard target. **Auto-target** = with no valid target it picks the valid enemy closest to your aim point. **Ground**. **Self**. **Ally** = a party member or yourself — `F1` targets you, `F2`–`F5` party members, or click their frame. A heal never guesses: every heal here is **Ally** or **Needs target** |
| **Tags** | page 05 §Tags owns the list. Light halves carry `tag_holy`, shadow halves `tag_shadow`; a spell with both faces carries the tag of the face it used for that cast |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A temple priest who keeps both the lamp and the dark. Mending pulls them toward Light; harming pulls them toward Shadow. Every spell changes shape with where the slider sits, so the priest plays a balancing act — or leans hard into one side on purpose. |
| Primary role | **Healer** |
| Hybrid role | **Damage** — anchored in **Dusk**, where every spell harms first and heals through the harm (§5) |
| Build | caster |
| Armour | light (white-trim robe, hood, slippers, chained tome) |
| Weapons | mace or scepter (one hand) + focus (Psalter / Reliquary `(reuse: farhold/js/foci.js)`), or staff |
| Primary attribute | INT (CON second) |
| Resource | **Mana** + the **Balance** slider |
| Companion | none (Farhold gave the priest a spirit bear; Wildmarch drops it — beasts belong to the druid and ranger). |
| Starting kit | Acolyte's Scepter, Psalter (off hand), light robe, hood, 1 spell (`priest_wickflame`) + the utility spell **Call Back** (§6) |

**Playstyle in three sentences.** Heal and ward allies; that slides you toward Light. Harm enemies with the same
spells turned on them; that slides you toward Shadow. In **Dawn** or **Dusk** (the two ends) every spell turns
into a stronger version of that side — keep the slider where the fight needs it.

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

- Dawn versions of heals keep pushing Light; Dusk versions of heals push **Shadow** — so a priest can heal while staying in Dusk. That is on purpose: Dusk is "healing by hurting".

### 2.2 The gauge (HUD)

- A **horizontal slider** 240 px wide directly above the spell bar: gold on the right, violet on the left, grey in the middle,
  with tick marks at ±50. A lamp-shaped marker shows B; it leaves a 1 s ghost trail so you see which way you are moving.
- The band name ("DAWN" / "DUSK") appears over the slider when you enter it, with a chime (Dawn: a bell; Dusk: a low gong).
- **Anchor** (Calling 40) shows a padlock over the marker and a 15 s ring.
- Party frames (page 03) show a small gold/violet dot next to the priest's name so other healers can read the band.

### 2.3 Calling quests (page 14 owns the quest text)

| Level | Quest id | Summary | Grants |
|---|---|---|---|
| 1 | — | — | The slider with its always-on multipliers; Call Back out of combat. |
| 6 | `q_calling_priest_1` | Hearthvale: tend the Brightwater temple's two lamps (one lit, one shuttered) through a fever outbreak and the barrow-ghost that feeds on the lamplight. Heal 10 villagers, then banish the ghost by fighting it at −50 or lower. | **Bands** (Dawn / Dusk) and every spell's alternate versions; the gauge's band marks. |
| 20 | `q_calling_priest_2` | Sunscar: carry a dead Sandsworn guide back to the oasis for burial, keeping her caravan alive through two ambushes; a dialog opportunity with the thing that killed her (forgive / condemn / bargain) sets your slider for the final fight. | **Call Back in combat** (§6) and **Equinox**: crossing from Dawn to Dusk (or back) within 6 s makes your next spell cast **both** its Dawn and its Dusk version. |
| 40 | `q_calling_priest_3` | Drowned Coast: relight the Saltdeep lighthouse while the Drowned choir tries to put it out; hold the slider inside a narrow window that moves every 20 s (a scripted "balance" trial). | **Anchor** (class key **`Q`**, page 02 §5.16): lock the slider where it is for 15 s, 60 s cooldown, off the GCD; bands widen to ±40; in-combat Call Back revives at 50% health. |

(Quest ids renamed to canon form: `q_priest_calling_lamp` / `_toll` / `_eclipse` → `q_calling_priest_1` / `_2` / `_3`.
The old Calling 40 "mass Call Back" is removed — no mass resurrection in v2, 00 §12.1 W35; it is in `WISHLIST.md`.)

---

## 3. The six spells

### 3.1 At a glance (base versions)

| Slot | Lvl | id | Name | Cost | CD | Cast | Targeting | Range / shape | Tags | Main number | Push |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `priest_wickflame` | Wickflame | 2% Mana | — | 1.5 s | Needs target (ally **or** enemy) | 40 m | ally: `tag_holy` `tag_heal` `tag_spell` · enemy: `tag_shadow` `tag_spell` `tag_ranged` `tag_projectile` | heal 170% SP / 130% SP shadow | +8 / −8 |
| 2 | 4 | `priest_candle_ward` | Candle Ward | 3% Mana | 6 s | instant | Ally | 40 m | `tag_holy` `tag_shield` `tag_spell` `tag_duration` | absorbs 190% SP, 12 s | +6 |
| 3 | 10 | `priest_choir_of_lamps` | Choir of Lamps | 5% Mana | 8 s | 2 s | Ally | 40 m + 10 m around | `tag_holy` `tag_heal` `tag_spell` `tag_area` | 5 allies × 120% SP | +12 |
| 4 | 18 | `priest_penumbra` | Penumbra | 4% Mana | 12 s | instant | Ground | 30 m, 6 m circle, 8 s | `tag_holy` `tag_shadow` `tag_heal` `tag_spell` `tag_area` `tag_duration` | enemies 25% SP/s, allies 1.2% max health/s | ±1 per tick |
| 5 | 28 | `priest_hold_the_flame` | Hold the Flame | 4% Mana | 60 s | instant, off GCD | Ally | 40 m | `tag_holy` `tag_heal` `tag_spell` `tag_duration` | heal 300% SP + Deathward | +20 |
| 6 | 40 | `priest_eclipse_hymn` | Eclipse Hymn | 12% Mana | 120 s | 4 s channel | Self | 25 m around you | `tag_holy` `tag_shadow` `tag_heal` `tag_spell` `tag_area` `tag_channel` | 8 pulses × 60% SP each way | → 0 |

Healer checklist: **single** (Wickflame), **shield** (Candle Ward), **group** (Choir of Lamps, Penumbra),
**emergency** (Hold the Flame), **group cooldown** (Eclipse Hymn), **revive** (Call Back, §6).

### 3.2 Details (base)

**`priest_wickflame` — Wickflame** (slot 1, level 1) `(new)`
- 2% Mana · no cooldown · 1.5 s cast · 40 m · **Needs target** — it **picks its face by the target**:
  - on an **ally** (or yourself, `F1`): heal **170% SP**. Push **+8**. Tags `tag_holy` `tag_heal` `tag_spell`.
  - on an **enemy**: *Gloam*, **130% SP shadow** damage. Push **−8**. Tags `tag_shadow` `tag_spell` `tag_ranged` `tag_projectile`.
- Look: ally — a small flame blooms in their chest and rises (spellfx `holy` impact, `holy_mote`); enemy — a violet candle-flame that burns downward (spellfx `shadow` ribbon bolt). Sound: the soft "fwup" of a wick / a snuffing hiss.

**`priest_candle_ward` — Candle Ward** (slot 2, level 4) `(new)`
- 3% Mana · 6 s · instant · **Ally**, 40 m.
- Tags: `tag_holy` `tag_shield` `tag_spell` `tag_duration`.
- Barrier absorbing **190% SP** for 12 s. One Candle Ward per ally (recast refreshes and replaces). Push **+6**.
- Look: a ring of five candles circling the ally (STATUS_FX `barrier` with holy_mote sprites). Sound: a bell tap.

**`priest_choir_of_lamps` — Choir of Lamps** (slot 3, level 10) `(new)`
- 5% Mana · 8 s · 2 s cast · **Ally**, 40 m · heals the target and up to 4 more allies within 10 m of them (lowest health first) for **120% SP** each. Push **+12**.
- Tags: `tag_holy` `tag_heal` `tag_spell` `tag_area`.
- Look: lamps rise over each healed ally and hum a chord (spellfx `holy` rune shape over heads). Sound: a short choir chord (formant voices, three pitches).

**`priest_penumbra` — Penumbra** (slot 4, level 18) `(new)`
- 4% Mana · 12 s · instant · **Ground**, up to 30 m · 6 m circle, 8 s.
- Tags: `tag_holy` `tag_shadow` `tag_heal` `tag_spell` `tag_area` `tag_duration`.
- Every 1 s: enemies inside take **25% SP shadow**; allies inside heal **1.2% of max health**. Each enemy tick pushes −1, each ally tick +1 (the pool balances itself).
- Look: half the circle gold, half violet, slowly turning (spellfx ground disc in both palettes). Sound: a low hum with a bell tone every tick.

**`priest_hold_the_flame` — Hold the Flame** (slot 5, level 28) `(new)` — the emergency heal
- 4% Mana · 60 s · instant, off the GCD · **Ally**, 40 m.
- Tags: `tag_holy` `tag_heal` `tag_spell` `tag_duration`.
- Heal **300% SP**. If the ally is below 25% health, also **Deathward** for 6 s: the next hit that would kill them leaves them at 1 health and heals 20% of max health. Push **+20**.
- Look: a white-gold vertical glyph through the ally (spellfx `holy` rune, large). Sound: a single struck bell, long ring.

**`priest_eclipse_hymn` — Eclipse Hymn** (slot 6, level 40) `(new)` — the group cooldown
- 12% Mana · 120 s · 4 s channel (you can turn, not move) · **Self** · 25 m around you.
- Tags: `tag_holy` `tag_shadow` `tag_heal` `tag_spell` `tag_area` `tag_channel`.
- 8 pulses (every 0.5 s): heal the **5 lowest-health allies** for **60% SP** **and** deal **60% SP shadow** to 5 enemies (most health first).
- At the end: Balance snaps to **0** and you gain **Twilight** for 8 s — both sides' bonuses at full (+25% healing **and** +25% damage), and every spell comes out as the version that fits its target: a spell cast on an **ally** is its Dawn version, on an **enemy** its Dusk version; Penumbra and the Hymn come out as both halves at once. No key change is needed.
- Look: a disc overhead, gold on one side, violet on the other, turning a full circle through the channel; beams fall from both halves. Sound: a wordless hymn, rising.

### 3.3 Rotation / how it plays

- **Solo:** sit in Dusk. Gloamrot (instant) + Umbral Pool + Umbral Ward on yourself; Requiem heals you from the damage. Hold the Flame (Tolling Rite) for emergencies.
- **Dungeon healer:** Candle Ward on the tank on cooldown, Wickflame as the filler; the slider climbs to Dawn → instant Sunwicks and Dawnchorus. When the tank is steady, throw Gloams to dip back to Grey and stretch Mana.
- **Boss healer:** the **Equinox** trick (Calling 20): before a big damage event, dip to Dusk with Gloams, then swing to Dawn — the next Choir comes out as both Dawnchorus and Requiem at once. Eclipse Hymn is the group cooldown for the heaviest phase. Anchor (Calling 40) keeps Dawn through a phase where you must throw Gloams to kill adds.
- **Mana:** healing flat out (Wickflame every GCD, Ward and Choir on cooldown) costs ≈3.0% per second against 1.1% regeneration: about **50 s** of flat-out healing from full. Gloams in Grey stretch it: every second spent on Gloam is a second not spent on a 2% heal.

### 3.4 Boss mechanics

| Mechanic | Priest answer |
|---|---|
| Tank buster | Candle Ward just before; Hold the Flame's Deathward if it goes wrong. |
| Room-wide damage | Choir of Lamps, Eclipse Hymn, the Sanctuary Chord talent. |
| Soaks | Candle Ward on each soaker (2 charges with Candle Pair). |
| Void zones | Void-Eater (Penumbra t3b) shrinks them; Clean Water cleanses the ticks. |
| Movement phases | Instant Dawn versions are the reason to be in Dawn when the boss moves. Walking Flame, Processional. |
| Deaths | Call Back in combat (Calling 20, §6), Not Yet Gone (Hold the Flame t3a), Called Home (Eclipse Hymn t3b). No group limit on revives. |
| A boss that punishes healing (a mechanic page 11 may use) | Dusk versions heal through damage — no direct heal cast needed. |
| Shadow-immune boss | Gloam, Requiem and Umbral Pool deal 0 to it (the boss tooltip warns). Stay in Dawn and heal; kill adds with Gloam to steer the slider. |

---

## 4. Alternate spells — Dawn and Dusk versions (Calling 6)

Each version keeps its base spell's targeting unless it says otherwise. Dawn versions carry `tag_holy`, Dusk
versions `tag_shadow`, plus the base spell's shape tags.

| Base | Dawn version (B ≥ +50) | Dusk version (B ≤ −50) |
|---|---|---|
| **Wickflame** | `priest_sunwick` **Sunwick** — ally: **instant**, 140% SP + 60% SP HoT over 6 s (adds `tag_duration`), push +8. Enemy face unchanged. | `priest_gloamrot` **Gloamrot** — enemy: **instant**, 110% SP + *Rot* 90% SP over 6 s (adds `tag_duration` `tag_curse`), and heals the lowest-health ally within 30 m of **you** for 40% of the damage (adds `tag_heal`). Push −8. Ally face: 1.5 s, heals 150% SP but pushes **−6**. |
| **Candle Ward** | `priest_sunward` **Sunward** — absorbs 230% SP; when it breaks it heals the ally 60% SP. | `priest_umbral_ward` **Umbral Ward** — absorbs 170% SP; 40% of what it absorbs is dealt back to the attacker as shadow. Push **−6**. |
| **Choir of Lamps** | `priest_dawnchorus` **Dawnchorus** — **instant**, 140% SP to 5 allies. | `priest_requiem` **Requiem** — an 8 m shadow burst around the target ally, 90% SP to every enemy; the total damage is split as healing among the 5 lowest allies within 10 m. Push −10. |
| **Penumbra** | `priest_sunwell` **Sunwell** — no damage; allies heal 2.5%/s and take 10% less damage. Push +1/tick. | `priest_umbral_pool` **Umbral Pool** — enemies 45% SP/s and 20% slow; allies inside heal for 10% of all damage they deal (leech). Push −1/tick. |
| **Hold the Flame** | `priest_sunrise_rite` **Sunrise Rite** — heal 400% SP, Deathward always (any health). | `priest_tolling_rite` **Tolling Rite** — heal 200% SP + Deathward always; if Deathward triggers, the killing blow is dealt back to its source ×2 as shadow. Push −20. |
| **Eclipse Hymn** | `priest_hymn_of_dawn` **Hymn of Dawn** — pulses heal 90% SP, damage 30%. | `priest_hymn_of_dusk` **Hymn of Dusk** — pulses damage 90% SP, heal 30%. |

(Renamed: `priest_nightgloam` Nightgloam → `priest_gloamrot` **Gloamrot**; `priest_hymn_of_noon` → `priest_hymn_of_dawn`
**Hymn of Dawn** and `priest_hymn_of_midnight` → `priest_hymn_of_dusk` **Hymn of Dusk**, so each matches its band and no name
suggests a night cycle.)

---

## 5. The hybrid role — Damage (Dusk)

The priest uses the canon **Role focus** switch (00 §6; spellbook, out of combat, saved per Loadout). Set to
**Hybrid (Damage)**, it changes only your Dungeon Finder role (Damage); the spells and the slider work the same, and a Damage
priest is simply a priest who lives at the bottom of the slider. It becomes practical at **Calling 6** (bands).

| Piece | How it deals damage |
|---|---|
| The slider | at −100: **+25% damage**, −15% healing. **Anchor** (Calling 40) locks it there for 15 s of every 60 |
| Gloamrot (Wickflame, Dusk) | the instant filler: 110% SP + 90% SP Rot, and it still drips healing onto the group |
| Umbral Pool (Penumbra, Dusk) | the area damage: 45% SP/s for 8 s on a 12 s cooldown |
| Requiem (Choir, Dusk) | the burst on packs: 90% SP to everything in 8 m around a party member |
| Tolling Rite (Hold the Flame, Dusk) | stays a heal — the Damage priest still carries the emergency button and **Call Back** |
| Hymn of Dusk (Eclipse, Dusk) | the cooldown: 8 × 90% SP pulses |
| Talents | Wickflame t2a *Flicker* (bounce), t3a *Tipping Wick* (fall to Dusk fast), t4b *Borrowed Flame* (Mana from kills); Penumbra t1b *Deep Shade*, t4b *Shade Garden*; Eclipse t2b *Totality* |
| Gear | SP and shadow-damage affixes (`tag_shadow`), a Reliquary focus, the soul `soul_mourning_bell` (§9) |

**How good it is.** A Dusk priest deals about **85% of a primary caster's damage** (the slider's +25% and
the Dusk versions against the mage or warlock's full kit) and brings a lot of **incidental healing** — Gloamrot,
Requiem and Umbral Pool together heal about a third as much as a dedicated healer's filler. That is strong in
the **open world, Normal dungeons and Depth up to about 10**. In **Challenge mode** its single-target damage
falls to about 80% of a primary damage class; its value there is the spare revive and the emergency heal.

---

## 6. Utility spells

| id | Name | What it does |
|---|---|---|
| `priest_call_back` | **Call Back** `(new)` | The priest's revive. No slot. Tags `tag_holy` `tag_shadow` `tag_heal`. Targeting: **Needs target** (a dead party member; target them by their frame or `F2`–`F5`). **Out of combat (level 1):** 3 s cast, 40 m, the ally stands up at 50% health and 30% Mana (Tempo / Momentum users stand up with a full Tempo bar or empty Momentum, as normal). No cooldown. **In combat (Calling 20):** 2.5 s cast, 30 m, revive at **35%** health (**50%** from Calling 40); the revived ally cannot take damage for 2 s. 20 s cooldown for the in-combat use. **No group limit on revives** (00 §12.1 W21). Look: a column of light and shadow twisted together over the body (spellfx `holy` + `shadow` helix). Sound: a sung note that rises. |

The priest has no travel spell; it uses scrolls and the Recall Stone ([page 20](../20-TRAVEL.md)).

---

## 7. Talents

One pick per tier. Tiers open at **12 / 22 / 32 / 45** (the later of the tier's level and the spell's slot level).
Ids `<spellid>_t<tier><a|b|c>`. A talent on a base spell also changes its Dawn and Dusk versions.
`(reuse: prototypes/farhold/js/skilltalents.js)`

### Wickflame
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `priest_wickflame_t1a` | Twin Wick | Wickflame on an ally also heals the nearest other injured ally within 10 m for 50%. |
| 12 | `priest_wickflame_t1b` | Walking Flame | Castable while moving at 60% speed (cast 1.8 s). |
| 22 | `priest_wickflame_t2a` | Flicker | Gloam bounces to 1 more enemy within 8 m for 60%. |
| 22 | `priest_wickflame_t2b` | Warm Hands | Wickflame's heal leaves a 3 s HoT of 30% SP. Adds `tag_duration`. |
| 32 | `priest_wickflame_t3a` | Tipping Wick | Wickflame pushes ±14 instead of ±8. |
| 32 | `priest_wickflame_t3b` | Steady Wick | Wickflame pushes 0 (use it without leaving your band). |
| 45 | `priest_wickflame_t4a` | Pillar Flame | Every 4th Wickflame on an ally is a pillar: heals all allies in a 3 m circle around the target for 100%. Adds `tag_area`. |
| 45 | `priest_wickflame_t4b` | Borrowed Flame | Gloam kills restore 3% Mana and cast a free Wickflame on the lowest-health ally. |

### Candle Ward
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `priest_candle_ward_t1a` | Candle Pair | 2 charges. |
| 12 | `priest_candle_ward_t1b` | Tall Candle | Absorbs 260% SP but cooldown 12 s. |
| 22 | `priest_candle_ward_t2a` | Wax Seal | While it holds, the ally cannot be knocked back. |
| 22 | `priest_candle_ward_t2b` | Snuff | When it breaks, it silences the attacker 2 s (non-boss). |
| 32 | `priest_candle_ward_t3a` | Guttering | When the ward expires unbroken, its remaining value heals the ally. |
| 32 | `priest_candle_ward_t3b` | Candle Chain | Casting on a warded ally moves the old ward to the next lowest ally within 20 m. |
| 45 | `priest_candle_ward_t4a` | Vigil | A warded ally's first death in 60 s is prevented (1 health; the ward is used up). |
| 45 | `priest_candle_ward_t4b` | Candlestorm | Breaking the ward scatters 5 candles that fly to 5 allies for 40% SP absorbs each. |

### Choir of Lamps
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `priest_choir_of_lamps_t1a` | Wide Choir | Radius 16 m. (Every ally in a party of five is already covered; outside a party it reaches 6 nearby players.) |
| 12 | `priest_choir_of_lamps_t1b` | Held Note | Becomes a 3 s channel healing the group 5 times at 35%. Adds `tag_channel`. |
| 22 | `priest_choir_of_lamps_t2a` | Lamp Line | Heals allies in a 3 m wide line between you and the target instead. |
| 22 | `priest_choir_of_lamps_t2b` | Harmony | Each healed ally takes 8% less damage for 6 s. |
| 32 | `priest_choir_of_lamps_t3a` | Answering Choir | If 5 allies are healed, cooldown −4 s. |
| 32 | `priest_choir_of_lamps_t3b` | Choir Wardens | Overhealing becomes a barrier (up to 30% SP per ally). Adds `tag_shield`. |
| 45 | `priest_choir_of_lamps_t4a` | Cathedral | Also drops a 6 m Penumbra at the target (Penumbra's own cooldown untouched). |
| 45 | `priest_choir_of_lamps_t4b` | Last Verse | Heals twice as much on allies below 40%. |

### Penumbra
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `priest_penumbra_t1a` | Walking Shade | The pool follows the ally you last healed. |
| 12 | `priest_penumbra_t1b` | Deep Shade | 9 m, 12 s. |
| 22 | `priest_penumbra_t2a` | Tidepool | Pulls non-boss enemies inside 1 m toward the centre each tick. |
| 22 | `priest_penumbra_t2b` | Clean Water | Each ally tick removes one damage-over-time effect (1 per ally per 4 s). |
| 32 | `priest_penumbra_t3a` | Dimming | Enemies inside deal 10% less damage. |
| 32 | `priest_penumbra_t3b` | Void-Eater | Placed on an enemy void zone, the pool shrinks it by 1 m per second. |
| 45 | `priest_penumbra_t4a` | Twin Shades | Two pools, one Dawn and one Dusk, whatever your band. |
| 45 | `priest_penumbra_t4b` | Shade Garden | Enemies that die inside burst into 5% max health heals for allies within 6 m. |

(Renamed: *Night Garden* → **Shade Garden**.)

### Hold the Flame
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `priest_hold_the_flame_t1a` | Early Flame | Deathward threshold 40%. |
| 12 | `priest_hold_the_flame_t1b` | Quick Flame | Cooldown 40 s, heal 220% SP. |
| 22 | `priest_hold_the_flame_t2a` | Flame of Rest | The ally is also freed of all movement-impairing effects. |
| 22 | `priest_hold_the_flame_t2b` | Shared Flame | Also heals you for 50% of the amount. |
| 32 | `priest_hold_the_flame_t3a` | Not Yet Gone | Castable on an ally who died in the last 3 s: they stand up at 20% (a revive; no group limit). |
| 32 | `priest_hold_the_flame_t3b` | Second Candle | Deathward can trigger twice. |
| 45 | `priest_hold_the_flame_t4a` | Flame for All | Hits every ally below 25% within 20 m of the target. Adds `tag_area`. |
| 45 | `priest_hold_the_flame_t4b` | Keeper of Hours | Deathward lasts 12 s. |

(Renamed: *Beyond the Veil* → **Not Yet Gone**.)

### Eclipse Hymn
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `priest_eclipse_hymn_t1a` | Processional | You may walk at 50% speed while channelling. |
| 12 | `priest_eclipse_hymn_t1b` | Short Hymn | 2 s channel, 4 pulses at 110%. |
| 22 | `priest_eclipse_hymn_t2a` | Sanctuary Chord | Allies within 25 m take 20% less damage during the channel. |
| 22 | `priest_eclipse_hymn_t2b` | Totality | The last pulse is triple strength. |
| 32 | `priest_eclipse_hymn_t3a` | Long Twilight | Twilight lasts 14 s. |
| 32 | `priest_eclipse_hymn_t3b` | Called Home | Any ally who died in the last 10 s is revived at 20% at the end (once per fight). |
| 45 | `priest_eclipse_hymn_t4a` | Eternal Hymn | Cooldown 90 s. |
| 45 | `priest_eclipse_hymn_t4b` | Sun and Shade | Every pulse also removes one harmful effect from the lowest-health ally it heals. |

(*Sun and Moon*, which raised the targets to 10 for a 10-player group, is replaced by **Sun and Shade** — a five-player talent.)

---

## 8. Class sets

### `set_priest_lampkeepers_vestments` — The Lampkeeper's Vestments (levels 19–24, dungeon set)
Drops from `d05_glass_tombs` and `d06_sandsworn_vault` bosses on **Normal** (15%, at the dungeon's level) and
**Challenge** (item level 60); their Depth end chests can drop it too.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Wickflame's heal is instant every 3rd cast. | `priest_wickflame` |
| 4 | Candle Ward cast on an ally already at full health also heals the lowest ally within 20 m for 100% SP. | `priest_candle_ward` |
| 6 | Entering Dawn gives +10% Mana regeneration for as long as you stay. | Balance |

### `set_priest_regalia_of_the_salt_choir` — Regalia of the Salt Choir (levels 42–45, dungeon set)
Drops from `d11_saltdeep_cathedral` bosses on **Normal** (15%) and **Challenge** (item level 60), and from the world
boss of `drowned_coast` (`b_sallow_king`, page 13; one random piece, 10%). *(Was "Regalia of the Sunken Choir" from
raid r03; raids are in `WISHLIST.md`.)*

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Choir of Lamps' heal +15% on its main target. | `priest_choir_of_lamps` |
| 4 | Penumbra's Dawn and Dusk halves alternate every 2 s (the pool does both jobs, at 70%). | `priest_penumbra` |
| 6 | Equinox also resets Choir of Lamps' cooldown. | Equinox |

### `set_priest_mantle_of_the_twin_lamps` — Mantle of the Twin Lamps (level 60, endgame set)
Item level 60. Drops from **Challenge-mode `d15_fire_court` and `d16_the_spire` bosses** (one piece per boss;
page 12 names which) and from the **end chest of any dungeon at Depth 10 or deeper** (one random piece, 8%).

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Hold the Flame's Deathward also leaves a Candle Ward on the ally. | `priest_hold_the_flame` |
| 4 | Twilight after Eclipse Hymn also makes all spells cost 50% Mana. | `priest_eclipse_hymn` |
| 6 | Anchor has 2 charges. | Anchor |

(Renamed: `set_priest_regalia_of_the_sunken_choir` → `set_priest_regalia_of_the_salt_choir`; `set_priest_veil_of_the_twin_lamps`
Veil of the Twin Lamps → `set_priest_mantle_of_the_twin_lamps` **Mantle of the Twin Lamps**. The Salt Choir's 2-piece
used to add a 6th Choir target — a party has only five.)

---

## 9. Class legendaries, uniques and souls

### Legendaries
| id | Name | Slot | Power (numbers) | Drop source |
|---|---|---|---|---|
| `leg_the_first_lamp` | The First Lamp | off hand (Reliquary) | Dawn starts at +30 instead of +50. | `b_bishop_aldwine` Bishop Aldwine, the Drowned (`d11_saltdeep_cathedral` end boss) on Challenge, 4%; its Depth end chest 2% |
| `leg_censer_of_two_smokes` | Censer of Two Smokes | mace | While you are in Grey (−49 … +49), healing +12% and damage +12%. | end chest of any dungeon at **Depth 15+**, 1.5% |
| `leg_bell_of_the_last_hour` | Bell of the Last Hour | neck | Hold the Flame's cooldown resets when Deathward triggers (once per 3 min). | `b_old_mother_rime` Old Mother Rime (`d10_rimefang_caverns` secret boss) on Challenge, 3% |
| `leg_mourners_shroud` | Mourner's Shroud | head | While in Dusk, Gloamrot's healing hits 3 allies. | `b_sallow_king` The Sallow King (`drowned_coast` world boss, page 13), once a week, 6% |
| `leg_scepter_of_noon_and_gloam` | Scepter of Noon and Gloam | scepter | Twilight lasts until you leave both bands (reaching Grey ends it). | `b_marchheart` The Marchheart (`d16_the_spire` secret boss; page 12 owns the fight) |

(Renamed: `leg_mourners_veil` Mourner's Veil → `leg_mourners_shroud` **Mourner's Shroud**; `leg_scepter_of_noon_and_midnight`
→ `leg_scepter_of_noon_and_gloam` **Scepter of Noon and Gloam**.)

### Uniques
| id | Name | Slot | Power | Drop source |
|---|---|---|---|---|
| `uq_wax_saints_hands` | Wax Saint's Hands | hands | Candle Ward absorbs +25%. | `b_hollow_thane` The Hollow Thane (`d01_hollow_barrow` end boss), 12% |
| `uq_tallow_psalter` | Tallow Psalter | off hand (Psalter) | Call Back in combat costs no Mana and its cast is 1.5 s. | `d08_moonwell_ruins` boss 2 |
| `uq_thornlamp_staff` | Thornlamp Staff | staff | Penumbra roots non-boss enemies 1 s on its first tick. | `b_wyllow_blighted_heart` (`d07_thornheart` end boss) |

### Souls
A soul goes in a **Soul** socket (page 08) and adds a behaviour. Both need the wearer to be a **priest**.

| id | Name | Socket | Requirement | Effect | Source |
|---|---|---|---|---|---|
| `soul_lamplighter` | Soul of the Lamplighter | jewellery (neck or ring) | class: priest | Each time the slider **crosses 0** (either way), the lowest-health ally within 40 m is lit: a heal of 80% SP and 6 s of +10% healing received (`tag_holy` `tag_heal` `tag_duration`). Once per 4 s. | `b_first_sleeper` The First Sleeper (`d01_hollow_barrow` secret boss) on Challenge, 3%; the world boss of `frostmantle` (`b_standing_ruin`), 2% |
| `soul_mourning_bell` | Soul of the Mourning Bell | weapon | class: priest | In **Dusk**, every 5th Gloamrot rings a bell: 150% SP shadow to the target and every enemy within 6 m of it, and each enemy hit carries Rot (90% SP over 6 s) (`tag_shadow` `tag_spell` `tag_area` `tag_duration`). | end chest at **Depth 15+**, 1%; `b_ashmother_veyra` (`d14_ashen_reliquary` secret boss) on Challenge, 3% |

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
| Penumbra | Farhold `void_rift` ground pulse engine | two palettes |
| Call Back / Deathward | the revive rule (Emberveil 2 prototype `hero.revivedBy` + revive memory; Farhold's respawn path in `js/main.js`) | Deathward is new |
| Outfit | `class-outfits.json` `priest` (white-trim robe, hood, chained tome) | |
| Talent engine | `prototypes/farhold/js/skilltalents.js` | Wildmarch tier levels |
| Emberveil 2 prototype ideas | `priest_mend`, `priest_call_back`, `shadow_bolt`, `shadow_veil` | reborn as Wickflame, Call Back, Gloam, Umbral Pool |
