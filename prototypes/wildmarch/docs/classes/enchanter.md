# Enchanter — class design (`enchanter`)

> *"You don't want to hurt them. You want to sit down. There — isn't that better?"*

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Follows the class template in [page 00 §5](../00-OVERVIEW.md).
Canon facts used (page 00 §6): primary role **Support**, hybrid role **Tank**, build **caster**, **light** armour,
resource **Mana**, mechanic **Charm — dominates an enemy for a time; illusions distract and hold attention**, spell
slots **1 / 4 / 10 / 18 / 28 / 40**, calling quests **6 / 20 / 40**, talent tiers **12 / 22 / 32 / 45**, cap **60**.
Owner of this file: every `enchanter_*` spell, talent, set, legendary, unique and soul, and the **Charm** rules.
Status rules (sleep, stun, diminishing returns) are owned by [page 05](../05-COMBAT.md); monster ranks and families
by [page 10](../10-BESTIARY.md).

## How to read the numbers on this page

| Term | Meaning |
|---|---|
| **SP** | spell power (page 05). The number is final |
| **Mana** | the enchanter's resource. Pool = **100% base Mana** (≈2,400 at level 60, page 07). **Regenerates 1.2% of max per second in combat, 3% out of combat.** Costs are % of base maximum Mana. **Builders:** none (the Dream Harvest talent adds a little). **Spenders:** every spell and Charm (1.5%–10%) |
| **Sleep** | the target stands still and does nothing until the time runs out **or it takes any damage** (damage over time too) |
| **Charm** | the enemy fights for you for a time (§2). A charmed enemy is a **controlled body** (00 §6): temporary, no party slot, never counts toward soaks |
| **Will** | 0–100, how long a charm holds; drains every second |
| **Double** | an illusory copy of the enchanter, used only by the Tank build **Many Faces** (§5) |
| DR | diminishing returns: the same control effect on the same target within 18 s lasts 50%, then 25%, then it is immune for 18 s (page 05) |
| GCD | 1.0 s, can be hasted to 0.75 s |
| **Targeting** | page 02 / 00 §12.1 W8. **Needs target** = will not cast without a valid hard target. **Auto-target** = with no valid target it picks the valid enemy closest to your aim point in range. **Ground**. **Self**. **Ally** = a party member or yourself (`F1`–`F5` or their frames) |
| **Tags** | page 05 §Tags owns the list. The enchanter's "psychic" damage is `tag_arcane`; its control effects carry `tag_curse` |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A mind-mage who wins fights before they start. Enemies fall asleep, turn on each other, or walk over and fight for the enchanter. The enchanter picks which fights happen and when. |
| Primary role | **Support** (counts as a Damage slot in the Dungeon Finder, 00 §4): crowd control, haste, a borrowed monster |
| Hybrid role | **Tank** — **Many Faces**: a crowd of illusory Doubles that draw the blows, taunts made of suggestion, and a hall of mirrors for the worst moment (§5). An unexpected crossbreed on purpose |
| Build | caster |
| Armour | light (high-collar robe, circlet, shoulder cape, rune bracers) |
| Weapons | staff, or wand + focus (Effigy / Seer's Orb, `(reuse: farhold/js/foci.js)`) |
| Primary attribute | INT (CON second) |
| Resource | **Mana** + **Will** (the charm's hold) |
| Companion | whatever it has charmed (§2). No permanent pet and **nothing summoned** — Farhold's `bound_imp` is dropped; the charm replaces it. |
| Starting kit | Novice's Staff, light robe, light boots, circlet (cosmetic), 1 spell (`enchanter_needling_whisper`) |

**Playstyle in three sentences.** Put the dangerous enemies to sleep before the pull. Charm the best of the rest
and fight with its abilities on your **borrowed bar**. Haste your allies, and lock the whole pack with Crown of
Strings when it goes wrong.

---

## 2. Class mechanic — Charm

### 2.1 The Charm ability

| | |
|---|---|
| id | `enchanter_charm` (class ability, not a slot spell; class key **`Q`** — page 02 §5.16. Press `Q` again with a charm to **Release**) |
| Unlocked | Calling 6 |
| Cast | 2.0 s, 25 m, line of sight, 4% Mana, 10 s cooldown after a charm ends |
| Targeting | **Needs target** — a charm is always on the enemy you chose |
| Tags | `tag_arcane` `tag_spell` `tag_curse` `tag_duration` |
| Effect | The target becomes your **charmed** ally until Will reaches 0. Its threat list is wiped; its old friends now attack it. |
| Cap | 1 charmed enemy (2 at Calling 40) |
| Look | Violet strings drop from above onto the target's wrists and head (spellfx `arcane` ribbon + STATUS_FX `enchant` ring); its eyes glow violet; a violet ring under its feet for as long as it is yours. |
| Sound | a music-box phrase (three notes) on success; a snapped-string twang when it breaks |

### 2.2 What can and cannot be charmed

| Enemy (rank per page 10) | Charmable? | Will drain per second | Hold at full Will | Notes |
|---|---|---|---|---|
| Normal (open world, dungeon trash) | yes, from Calling 6, if its level ≤ yours + 2 | 1.1 | ~90 s | |
| **Champion pack** member (blue name, shared affix) | yes, from **Calling 20** | 2.2 | ~45 s | keeps its champion affix; an aura now helps *your* party |
| **Rare** (yellow name) and its minions' leader | yes, from **Calling 40** | 3.3 | ~30 s | once per rare per 10 min; its loot still drops when it dies later |
| Any monster with a **greater rarity** (Giant, Flaming, Electrified… page 10) | **never** | — | — | too strong a will — "It is too much for one mind." |
| Warband leader / standard-bearer | no | — | — | leaders are "command" units (page 10) |
| Sub-boss, dungeon boss, secret boss, world boss, event boss | **never** | — | — | Hush and Seed of Discord have boss versions instead (§3) |
| Families tagged `mindless` (constructs, oozes, elementals, animated objects — page 10 owns the tag) | **never** | — | — | the cast fails with "It has no mind to bend." |
| Enemies with the champion affix **Iron-Willed** | never | — | — | page 10 |
| Other players, players' pets and followers | **never** (duels included) | — | — | |
| Trash in a **Depth** run | yes | **+10% drain per Depth tier** (every 5 depths, page 12) | — | keeps deep runs fair |

**Will:** starts at 100. Drains per second by rank (table). When the charmed creature **loses health**, Will drops by half the percentage lost (loses 20% of its health → −10 Will). Bright Glamour on it: +20 Will (once per 12 s).
**At 25 Will** its portrait flashes red and a string-creak plays; **at 0** the strings snap: it is **Dazed** 2 s (stands still) and then fights you again with threat on the enchanter.
**Release** (`Q` while you have a charm): with Will ≥ 30 the creature falls **asleep for 10 s** (so you can walk away); below 30 it just snaps. Calling 40: Release becomes **Snap** (§2.4).
**Balance rule:** a charmed creature deals **70%** of its normal damage and takes normal damage. It does not level with you. It cannot enter a dungeon boss room once the boss is pulled — it waits at the door (the boss room's wall, page 11). It **never counts toward soak pips** (00 §10).

### 2.3 The borrowed bar

When you charm something, a **second bar** slides up above your spell bar (`scr_hud_borrowed_bar`, page 03).
Keys follow page 02 §5.16:

| Part | Key | What it shows / does |
|---|---|---|
| Portrait | — | the creature's face in a violet frame; a **Will ring** around it draining clockwise, number in the middle |
| Ability slots | **`Shift+1` / `Shift+2` / `Shift+3`** | the first three abilities from its page-10 ability list, with their own cooldowns; they cost you nothing. Blank if it has fewer |
| Stance | **`Shift+4`** | toggle **Attack my target** (default) / **Guard me** (attacks whatever attacks you) |
| Hold here | **`G`** (second class key) | it walks to your aim point and stays |
| Health bar | — | under the portrait |

Example borrowed bars (page 10 owns the real kits):

| Charmed | Shift+1 | Shift+2 | Shift+3 |
|---|---|---|---|
| a marsh stalker (normal, Mossfen) | Lunge | Rending Bite (bleed) | — |
| an orc war-drummer (normal, Cinder Steppe) | Drum Strike | War Rhythm (+10% haste to your party) | Stomp |
| a frost champion with the **Vampiric** affix | its kit | its kit | its kit + its aura now heals *your* party |

Other players see the charmed creature's nameplate in green with "(charmed by *name*)" and the Will number (Calling 20).

### 2.4 Calling quests (page 14 owns the quest text)

| Level | Quest id | Summary | Grants |
|---|---|---|---|
| 1 | — | — | Spells only. No charm. |
| 6 | `q_calling_enchanter_1` | Hearthvale: a puppet-maker in Brightwater has lost her marionettes to a pack of fen-dogs; "borrow" one fen-dog (a scripted charm) and use it to lead you to their den, then fight beside it. | **Charm** (normal enemies), the **borrowed bar**, the Will gauge, and **Many Faces** (the Tank switch, §5). |
| 20 | `q_calling_enchanter_2` | Whisperwood: a moonwell dryad offers a bargain — win three "courtesies" at a fey court (a dialog opportunity: flatter, riddle or command), then charm the court's champion to fight its own queen's guard. | **Champion-pack members** can be charmed; allies see Will on the nameplate; borrowed abilities hit harder (70% → 84% damage); Many Faces holds **3** Doubles (was 2). |
| 40 | `q_calling_enchanter_3` | Riftmarch: the floating stones hold a sleeping Rift-Warden; keep it asleep (Hush every 20 s) while charming five rift beasts in a row to carry its crown out. | **Rares** can be charmed; **2 charms** at once; **Snap**: releasing a charm deals `Will × 4% SP` arcane damage in 6 m around it (100 Will = 400% SP; `tag_arcane` `tag_spell` `tag_area`) and Dazes enemies there 2 s. |

(Quest ids renamed to canon form: `q_enchanter_calling_strings` / `_court` / `_crown` → `q_calling_enchanter_1` / `_2` / `_3`.)

---

## 3. The six spells

### 3.1 At a glance

| Slot | Lvl | id | Name | Cost | CD | Cast | Targeting | Range / shape | Tags | Main number |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `enchanter_needling_whisper` | Needling Whisper | 1.5% Mana | — | 1.2 s | Auto-target | 34 m bolt | `tag_arcane` `tag_spell` `tag_ranged` `tag_projectile` `tag_curse` | 110% SP + Unsettled |
| 2 | 4 | `enchanter_hush` | Hush | 3% Mana | 6 s (bosses 20 s) | 1.5 s | Needs target | 30 m, single target | `tag_arcane` `tag_spell` `tag_curse` `tag_duration` | Sleep 20 s / boss: interrupt + silence 2 s |
| 3 | 10 | `enchanter_bright_glamour` | Bright Glamour | 4% Mana | 12 s | instant | Ally | 40 m (max 2 allies) | `tag_arcane` `tag_spell` `tag_duration` | +20% attack/cast speed, +10% move, 12 s |
| 4 | 18 | `enchanter_somnolent_tide` | Somnolent Tide | 8% Mana | 40 s | 1.5 s | Ground | 30 m, 7 m drifting mist, 6 s | `tag_arcane` `tag_spell` `tag_area` `tag_curse` `tag_duration` | mass Sleep 12 s |
| 5 | 28 | `enchanter_seed_of_discord` | Seed of Discord | 6% Mana | 25 s | 1.0 s | Needs target | 30 m, single target | `tag_arcane` `tag_spell` `tag_curse` `tag_duration` | Maddened 8 s / boss: +10% damage taken 6 s |
| 6 | 40 | `enchanter_crown_of_strings` | Crown of Strings | 10% Mana | 120 s | instant | Self | 12 m circle | `tag_arcane` `tag_spell` `tag_area` `tag_curse` `tag_duration` | Enthralled 6 s, +15% ally damage 10 s |

### 3.2 Details

**`enchanter_needling_whisper` — Needling Whisper** (slot 1, level 1) `(new)`
- 1.5% Mana · no cooldown · 1.2 s cast · 34 m · bolt (1 m splash).
- Targeting: **Auto-target** (it will never pick a sleeping enemy on its own — a stray whisper would wake it).
- Tags: `tag_arcane` `tag_spell` `tag_ranged` `tag_projectile` `tag_curse`.
- **110% SP** arcane damage and **Unsettled** 6 s: the target deals 5% less damage per stack (max 3 stacks = 15%).
- Look: a thin violet thread whips out and flicks the target's head (spellfx `arcane` helix, very thin); a small "?" (STATUS_FX `confused` sprite) blinks on hit. Sound: a whispered syllable (formant voice, breath 0.8) + a thread whip.

**`enchanter_hush` — Hush** (slot 2, level 4) `(new)`
- 3% Mana · 6 s · 1.5 s cast · 30 m · **Needs target**.
- Tags: `tag_arcane` `tag_spell` `tag_curse` `tag_duration`.
- **Non-boss:** Asleep for **20 s** (champion-pack members 8 s, rares 4 s; duels 4 s). Any damage wakes it. DR applies.
- **Boss / immune target:** instead **interrupts** the current cast (works on gold-bordered cast bars) and **silences** 2 s. This use has a **20 s** cooldown (the button shows a boss icon when your target is a boss) and shares the 90 s boss-cast-pause lockout rule of page 11 where it applies.
- Look: violet motes settle on the target's head, "zzz" (STATUS_FX `sleep`); on a boss, a finger-to-lips glyph over its head (STATUS_FX `silence`). Sound: a two-note lullaby hum.

**`enchanter_bright_glamour` — Bright Glamour** (slot 3, level 10) `(new)` — support
- 4% Mana · 12 s · instant · 40 m · **Ally** (a party member, yourself, or your charmed creature). **Max 2 glamoured allies**; a 3rd removes the oldest.
- Tags: `tag_arcane` `tag_spell` `tag_duration`.
- For 12 s: **+20% attack and cast speed**, +10% move speed. On a charmed creature also **+20 Will** (once per 12 s).
- Look: a shimmer of violet-gold sparkles circling the ally (STATUS_FX `haste` recoloured violet + `enchant`). Sound: a harp glissando.

**`enchanter_somnolent_tide` — Somnolent Tide** (slot 4, level 18) `(new)`
- 8% Mana · 40 s · 1.5 s cast · **Ground**, up to 30 m · a 7 m violet mist that **drifts 1 m/s** in the direction you face while casting, for 6 s.
- Tags: `tag_arcane` `tag_spell` `tag_area` `tag_curse` `tag_duration`.
- Non-boss enemies that stay inside for **1.5 s in a row** fall **Asleep for 12 s** (champion-pack members 5 s; rares are immune; DR applies).
- Bosses inside: their cast bars fill 10% slower while inside.
- The mist does **not** pull: sleeping enemies do not call their friends (the one thing sleep does that damage does not).
- Look: a low rolling violet fog with slow sparkles (spellfx `arcane` ground disc + smoke). Sound: a soft chorus "ahh" and wind.

**`enchanter_seed_of_discord` — Seed of Discord** (slot 5, level 28) `(new)`
- 6% Mana · 25 s · 1.0 s cast · 30 m · **Needs target**.
- Tags: `tag_arcane` `tag_spell` `tag_curse` `tag_duration`.
- **Non-boss:** **Maddened** 8 s (champion-pack members 4 s, rares 3 s): its threat list is wiped, it attacks the nearest other enemy, and enemies it hits fight back at it. Damage does not break it.
- **Boss:** **Distracted** 6 s — takes 10% more damage from your party, and its next targeted (yellow) mechanic within the 6 s picks from the players farthest from the boss (so melee are spared).
- Look: a tiny violet seed that sprouts thorny strings around the target's head; red eyes. Sound: a detuned string plucked twice.

**`enchanter_crown_of_strings` — Crown of Strings** (slot 6, level 40) `(new)` — the emergency button
- 10% Mana · 120 s · instant · **Self** · 12 m circle around you.
- Tags: `tag_arcane` `tag_spell` `tag_area` `tag_curse` `tag_duration`.
- **Non-boss enemies:** **Enthralled** 6 s — they stand and do nothing, and damage does **not** break it (this is the "the pull went wrong" button). Does not count for DR.
- **Bosses:** 30% slower movement and attacks, and +15% damage taken for 8 s.
- **Allies inside:** +15% damage for 10 s. **Your charmed creature(s):** Will set to 100.
- Look: a huge circle of violet strings falls from a crown of light above you and ties every enemy; they hang like marionettes (a Chibi 2 "puppet" idle pose). Sound: a music box winding, then a single held note.

### 3.3 Rotation / how it plays

- **Solo:** Charm the strongest normal in a pack, Hush the second, fight the rest with your charmed creature and Needling Whisper. Glamour yourself or the creature. Release it to sleep before Will runs out, charm a fresh one.
- **Dungeon:** before every pull, Hush the caster or healer of the pack (sleeping enemies do not join). Charm a champion-pack member when you have Calling 20 — its affix now works for you. Glamour the tank and the top damage player. Somnolent Tide on adds; Crown when the tank loses control.
- **Boss fights:** the enchanter is the party's interrupt-and-control specialist: the boss version of Hush is a 20 s interrupt, Seed of Discord steers a boss's targeted mechanic, and Unwind a Mind frees allies from boss mind control. Charms work only on trash and adds (never across the boss door).
- **Mana:** a support enchanter spends about 1.5% per second (Whisper filler, Glamour on cooldown, Hush) against 1.2% regeneration — close to even. A Tide and a Crown in the same pull cost 18%; that is the budget to watch.

### 3.4 Boss mechanics

| Mechanic | Enchanter answer |
|---|---|
| Gold-bordered (interruptible) casts | Hush (boss version) every 20 s, every 14 s with Boss Lullaby. |
| Adds | Somnolent Tide, Crown; charm the add that heals the boss (if charmable). |
| Soaks | a charmed creature **never** counts toward a soak (00 §10); the enchanter soaks like anyone else. |
| Boss mind control / charm on a player | Unwind a Mind (Hush t2a). |
| Targeted (yellow) circles | Seed of Discord's boss version moves the next one to far-away players. |
| Boss immune to control | every spell has a boss version: interrupt, Distracted, slow + damage taken. The enchanter never has a dead button on a boss. |
| Charm across the boss door | the charmed creature waits outside (§2.2) — charms are for trash and add waves. |
| Enrage timers | Glamour on the top two damage dealers, Crown for the +15%. |

---

## 4. Alternate spells

| Trigger | Replaces | Becomes | Numbers |
|---|---|---|---|
| You have a charmed creature | Needling Whisper | **Puppet's Cue** `enchanter_puppets_cue` | Auto-target, instant, 90% SP to your target **and** your charmed creature uses its `Shift+1` ability at once (ignores its cooldown once per 10 s). Tags as Needling Whisper |
| Target is asleep (Hush / Tide) | Hush | **Deepen Dream** `enchanter_deepen_dream` | Needs target; the sleeping target's sleep resets to full and it will not wake from the **first** hit (the next hit wakes it); 3% Mana, 6 s. Tags `tag_arcane` `tag_spell` `tag_curse` `tag_duration` |
| **Many Faces** on | several | the Many Faces versions | §5 |
| The borrowed bar | — | the creature's own abilities (§2.3) | on `Shift+1`–`4` |

---

## 5. The hybrid role — Tank (Many Faces)

**Many Faces** is the enchanter's name for the shared **Role focus** switch (canon 00 §6) set to **Hybrid**: it
is in the spellbook (`K`), **out of combat only** (3 s to swap, no key needed), saved per Loadout, and it unlocks
at Calling 6. Hybrid queues the enchanter as **Tank** and turns on the Doubles and the Many Faces versions of its
spells (below); Primary queues it as Support. Many Faces is an **illusion tank**: the enchanter
stands in a small crowd of copies of itself, and enemies keep hitting the wrong one. It does not wear heavy armour
and it does not block — it makes enemies **miss the real body** and **want** to hit it.

**Doubles.** While Many Faces is on, the enchanter keeps up to **2 Doubles** (3 from Calling 20): illusory copies that
stand within 2 m of it, moving and casting as it does. You enter combat with 1. **A new Double appears every 2 s**
(every 1.5 s with the Gossamer set, §8). They are not bodies (enemies cannot choose to attack them), not pets, and
never count toward soaks.

**Redirection.** When an enemy attack **lands** on the enchanter and a Double exists, there is a **25% chance per
Double** (max **75%** with 3) that the blow strikes a Double instead. The Double shatters and takes the hit — the
whole hit if it is no more than **20% of your max health**; a bigger hit is cut by 20% of your max health and the
rest reaches you. **Never redirected:** tank busters, area attacks and every telegraphed mechanic (page 11), and
damage over time. A shattered Double puts one stack of **Unsettled** on the attacker.

**While Many Faces is on:**

| Piece | What changes |
|---|---|
| Damage and threat | your damage **−25%**; all threat you make **×3** |
| Base mitigation | **−10% damage taken** |
| Needling Whisper | makes **×5** threat; Unsettled stacks to **5** (−25% damage from that enemy) — the filler that is also the mitigation |
| Hush → **Beckon** | Needs target. Non-boss: **taunt 4 s** and 3 Unsettled stacks (no sleep — a tank does not put its own target to sleep). Boss: **taunt 3 s**, 8 s cooldown for that use — the single-target taunt. The boss interrupt stays, on its own 20 s cooldown. Tags `tag_arcane` `tag_spell` `tag_curse` `tag_duration` |
| Somnolent Tide → **Crowd of Faces** | Ground: the mist is full of Doubles. Every non-boss enemy that enters is **taunted for 4 s** (the area taunt) and **misses 30%** of its attacks while inside. No sleep |
| Bright Glamour | on yourself, also creates a Double at once |
| Seed of Discord | unchanged — a Maddened enemy hitting its friends is pressure off the tank |
| Crown of Strings → **Hall of Mirrors** | Self, 120 s: for **8 s** you refill to 3 Doubles, a new one appears **every 0.5 s**, and redirection is **100%** (the 20%-of-max-health cap still applies per hit). Non-boss enemies within 12 m are **taunted for 8 s** instead of Enthralled; bosses are slowed 30% as before. The big defensive |
| Charm | a charmed creature on **Guard me** is a real body that pulls adds off the healer — the Many Faces off-tank |

**Talents that help:** Needling Whisper t2a *Nagging Doubt* (misses), t4a *Echo Chamber*; Bright Glamour t2a
*Double Take*; Hush t1b *Quick Hush* (Beckon becomes instant); Somnolent Tide t1a *Still Water* (a bigger Crowd of Faces); Crown of Strings t4a *Regent*
(Hall of Mirrors every 90 s). **Gear:** CON and health affixes, a Seer's Orb, the Gossamer Vestments set (§8), the
soul `soul_hall_of_faces` (§9).

**How good it is.** Many Faces is at its best against **one big hitter**: a boss that swings every 1.5 s meets a
fresh Double most of the time, so about **60% of its melee blows** strike a Double — better than plate for steady
boss melee. It is at its worst against **many small hitters**: four enemies hitting together run the Doubles out
in a second, and then the enchanter is a cloth-wearer with −10% and Unsettled stacks. And it has **no answer to a
tank buster** except Hall of Mirrors (which only caps the hit at 20% of max health per Double). That is fine in the
**open world, Normal dungeons and Depth up to about 10**, with a Charm on Guard me holding the adds. In **Challenge
mode**, tank busters every 20–30 s outrun a 120 s Hall of Mirrors: a Challenge party with a Many Faces tank needs
an external defensive from the healer or a support.

---

## 6. Utility spells

None. The enchanter has no travel or ritual spells; it uses scrolls and the Recall Stone ([page 20](../20-TRAVEL.md)).
(Charm is the class ability, §2 — it is used in combat.)

---

## 7. Talents

One pick per tier. Tiers open at **12 / 22 / 32 / 45** (the later of the tier's level and the spell's slot level).
Ids `<spellid>_t<tier><a|b|c>`. A talent also changes the spell's Many Faces version where it makes sense.
`(reuse: prototypes/farhold/js/skilltalents.js)`

### Needling Whisper
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `enchanter_needling_whisper_t1a` | Twin Thread | Two threads at two targets, 70% each. |
| 12 | `enchanter_needling_whisper_t1b` | Soft Voice | Castable while moving at 60% speed; does not wake sleeping targets (and deals 0 to them). |
| 22 | `enchanter_needling_whisper_t2a` | Nagging Doubt | At 3 stacks of Unsettled the target also misses 15% of attacks. |
| 22 | `enchanter_needling_whisper_t2b` | Mind Burn | Against a caster, burns 5% of its mana; interrupts non-boss casts. |
| 32 | `enchanter_needling_whisper_t3a` | Thread to the Puppet | Each hit adds +3 Will to your charm. |
| 32 | `enchanter_needling_whisper_t3b` | Whisper Chain | Jumps to 2 more enemies within 8 m at 50%. |
| 45 | `enchanter_needling_whisper_t4a` | Echo Chamber | Unsettled stacks to 6 (30%; Many Faces: 8 stacks, 40%). |
| 45 | `enchanter_needling_whisper_t4b` | Last Word | Enemies below 20% health take triple damage from it and are Dazed 1 s. |

### Hush
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `enchanter_hush_t1a` | Hush Pair | Sleeps the target and 1 more enemy within 5 m. |
| 12 | `enchanter_hush_t1b` | Quick Hush | Instant; 12 s cooldown. |
| 22 | `enchanter_hush_t2a` | Unwind a Mind | Can be cast on an **ally** (Ally targeting): breaks any charm, fear or mind control on them (boss mechanics included) — 30 s cooldown for that use. |
| 22 | `enchanter_hush_t2b` | Heavy Lids | Sleeping targets take 30% more from the first hit that wakes them. |
| 32 | `enchanter_hush_t3a` | Lingering Dream | When the target wakes, it is slowed 40% for 4 s. |
| 32 | `enchanter_hush_t3b` | Boss Lullaby | The boss version's cooldown is 14 s. |
| 45 | `enchanter_hush_t4a` | Bad Dream | When the sleep ends by itself, the target takes 300% SP arcane. |
| 45 | `enchanter_hush_t4b` | Sleepwalker | The sleeping target walks slowly (1 m/s) to a point you choose within 15 m (pull it out of a pack). |

### Bright Glamour
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `enchanter_bright_glamour_t1a` | Glamour of Three | Max 3 allies. |
| 12 | `enchanter_bright_glamour_t1b` | Group Glamour | Hits every ally within 10 m of the target at 50% strength (no max). Adds `tag_area`. |
| 22 | `enchanter_bright_glamour_t2a` | Double Take | The glamoured ally leaves a copy of themselves that draws the next non-boss attack aimed at them (1 per cast). On yourself in Many Faces: 2 Doubles at once. |
| 22 | `enchanter_bright_glamour_t2b` | Clear Mind | Also removes one magic slow or silence. |
| 32 | `enchanter_bright_glamour_t3a` | Rising Glamour | The buff grows +2% every second (to +44% at 12 s). |
| 32 | `enchanter_bright_glamour_t3b` | Spellweaver's Gift | The ally's spells cost 20% less during it. |
| 45 | `enchanter_bright_glamour_t4a` | Enduring Glamour | 20 s duration, 12 s cooldown (two can overlap per ally). |
| 45 | `enchanter_bright_glamour_t4b` | Puppet's Poise | On a charmed creature: it takes 30% less damage and its Will does not drain for 6 s. |

(Renamed: Bright Glamour t2a → **Double Take** — its old name is on the banned list, 00 §12.5. Hush t4a → **Bad Dream**.)

### Somnolent Tide
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `enchanter_somnolent_tide_t1a` | Still Water | The mist does not drift; 9 m; 8 s. |
| 12 | `enchanter_somnolent_tide_t1b` | Riptide | Drifts at 3 m/s in a line 18 m long. |
| 22 | `enchanter_somnolent_tide_t2a` | Quick Doze | Falls asleep after 0.8 s inside. |
| 22 | `enchanter_somnolent_tide_t2b` | Drowned Dreams | Sleeping enemies inside take 20% SP arcane every 2 s — **without waking** (the one damage that doesn't). |
| 32 | `enchanter_somnolent_tide_t3a` | Dreamcatcher | Enemy projectiles that fly through the mist are destroyed (not boss). |
| 32 | `enchanter_somnolent_tide_t3b` | Sleepy Champion | Champion-pack members sleep 10 s. |
| 45 | `enchanter_somnolent_tide_t4a` | Long Tide | The mist lasts 12 s. |
| 45 | `enchanter_somnolent_tide_t4b` | Dream Harvest | Every enemy that falls asleep gives you 1% Mana and your charm +5 Will (Crowd of Faces: every enemy taunted gives 1% Mana). |

### Seed of Discord
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `enchanter_seed_of_discord_t1a` | Spreading Seed | When the Maddened enemy kills something, the seed jumps to the nearest enemy (4 s). |
| 12 | `enchanter_seed_of_discord_t1b` | Two Seeds | 2 charges. |
| 22 | `enchanter_seed_of_discord_t2a` | Bitter Fruit | The Maddened enemy deals +50% damage to its friends. |
| 22 | `enchanter_seed_of_discord_t2b` | Scattering | Instead of fighting, all non-boss enemies within 8 m of the target flee in fear for 4 s. Adds `tag_area`. |
| 32 | `enchanter_seed_of_discord_t3a` | Grudge | Enemies it damaged attack it for 4 s after it ends. |
| 32 | `enchanter_seed_of_discord_t3b` | Boss Doubt | The boss version also makes the boss's cast bar 15% slower for 6 s. |
| 45 | `enchanter_seed_of_discord_t4a` | Civil War | Maddens 3 enemies within 10 m at once; each attacks one of the others. |
| 45 | `enchanter_seed_of_discord_t4b` | Seed to Charm | When Maddened ends on a charmable enemy, it is charmed for free at 50 Will. |

### Crown of Strings
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `enchanter_crown_of_strings_t1a` | Thrown Crown | Becomes **Ground**-targeted up to 30 m. |
| 12 | `enchanter_crown_of_strings_t1b` | Tight Strings | 8 m, but a 9 s Enthrall (Hall of Mirrors: 10 s). |
| 22 | `enchanter_crown_of_strings_t2a` | Marionette Dance | Enthralled enemies walk to the centre of the circle (bunching them for area damage). |
| 22 | `enchanter_crown_of_strings_t2b` | Sheltering Crown | Allies inside also get a barrier of 15% max health. Adds `tag_shield`. |
| 32 | `enchanter_crown_of_strings_t3a` | Puppet Court | Every Enthralled normal enemy counts as charmed for the 6 s: it attacks your target at 50%. |
| 32 | `enchanter_crown_of_strings_t3b` | Cut Strings | When Enthrall ends, 150% SP arcane to each. |
| 45 | `enchanter_crown_of_strings_t4a` | Regent | Cooldown 90 s. |
| 45 | `enchanter_crown_of_strings_t4b` | The Long Performance | Enthrall lasts until the first enemy is damaged **by a player** + 2 s, max 15 s. |

---

## 8. Class sets

### `set_enchanter_dreamweavers_raiment` — Dreamweaver's Raiment (levels 25–30, dungeon set)
Drops from `d07_thornheart` and `d08_moonwell_ruins` bosses on **Normal** (15%, at the dungeon's level) and
**Challenge** (item level 60); their Depth end chests can drop it too.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Hush lasts 30 s on normal enemies. | `enchanter_hush` |
| 4 | Somnolent Tide's mist is 9 m wide. | `enchanter_somnolent_tide` |
| 6 | Enemies that wake from your sleep are Unsettled at 3 stacks. | Needling Whisper / sleeps |

### `set_enchanter_marionettists_finery` — The Marionettist's Finery (level 60, endgame set)
Item level 60. Drops from **Challenge-mode `d15_fire_court` and `d16_the_spire` bosses** (one piece per boss;
page 12 names which) and from the **end chest of any dungeon at Depth 10 or deeper** (one random piece, 8%).
*(Was a raid set; raids are in `WISHLIST.md`.)*

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Will drains 25% slower. | Charm |
| 4 | Your charmed creature's borrowed abilities have 30% shorter cooldowns. | borrowed bar |
| 6 | Crown of Strings charms one Enthralled normal enemy for free (the lowest-health one) when it ends. | `enchanter_crown_of_strings`, Charm |

### `set_enchanter_gossamer_vestments` — Gossamer Vestments (level 60, Many Faces set)
Item level 60. Drops from the world bosses of `cinder_steppe`, `frostmantle` and `drowned_coast` (page 13; one
random piece, 8%) and from the **end chest of any dungeon at Depth 5 or deeper** (one random piece, 4%).
*(Replaces the old key-system set; Depth replaced keys.)*

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Bright Glamour's speed bonus is +25%; in Many Faces a new Double appears every 1.5 s. | `enchanter_bright_glamour`, Doubles |
| 4 | Seed of Discord's cooldown drops by 5 s every time Hush interrupts or Beckon taunts a boss. | `enchanter_seed_of_discord`, `enchanter_hush` |
| 6 | Hall of Mirrors lasts 12 s; Crown of Strings (Support) Enthralls for 8 s. | `enchanter_crown_of_strings` |

(Renamed: `set_enchanter_veilsilk_vestments` Veilsilk Vestments → `set_enchanter_gossamer_vestments` **Gossamer Vestments**.)

---

## 9. Class legendaries, uniques and souls

### Legendaries
| id | Name | Slot | Power (numbers) | Drop source |
|---|---|---|---|---|
| `leg_puppeteers_crossbar` | The Puppeteer's Crossbar | off hand (Effigy) | 2 charms from Calling 20 (3 at Calling 40). | `b_ysa_varn_kindled` Ysa Varn, the Kindled Child (`d15_fire_court` secret boss) on Challenge, 4% |
| `leg_music_box_of_the_drowned_queen` | Music Box of the Drowned Queen | neck | Hush hits 3 targets within 6 m of the first (Beckon: taunts 3). | `b_choir_of_brine` The Choir of Brine (`d11_saltdeep_cathedral` boss 2) on Challenge, 4% |
| `leg_circlet_of_quiet_hours` | Circlet of Quiet Hours | head | Sleeping enemies do not wake from **area** damage (only single-target hits wake them). | `b_oruvel_moon_drinker` (`d08_moonwell_ruins` end boss) on Challenge, 4%; its Depth end chest 2% |
| `leg_stringcutter_staff` | Stringcutter Staff | staff | Snap (the Calling 40 release) needs no Calling and deals `Will × 6% SP`. | `b_unmoored` The Unmoored (`riftmarch` world boss, page 13), once a week, 6% |
| `leg_borrowed_crown` | The Borrowed Crown | head | Charmed champion-pack members keep **all** their affixes at 100% and their aura is doubled in size. | a Challenge-mode `d16_the_spire` boss (page 12 names which), 5% |

### Uniques
| id | Name | Slot | Power | Drop source |
|---|---|---|---|---|
| `uq_lullaby_wand` | Lullaby Wand | wand | Needling Whisper puts non-bosses at 3 Unsettled stacks to sleep for 4 s. | `b_the_grindwheel` (`d02_drowned_mill` end boss), 12% |
| `uq_fen_dog_collar` | Fen-Dog Collar | waist | Charmed beasts (page 10 `beast` family) drain Will 40% slower. | `b_old_croak` (`d02_drowned_mill` boss 1) |
| `uq_courtiers_gloves` | Courtier's Gloves | hands | Bright Glamour also grants +8% crit chance. | `d06_sandsworn_vault` end boss |

### Souls
A soul goes in a **Soul** socket (page 08) and adds a behaviour. Both need the wearer to be an **enchanter**.

| id | Name | Socket | Requirement | Effect | Source |
|---|---|---|---|---|---|
| `soul_hall_of_faces` | Soul of the Hall of Faces | armour — chest | class: enchanter | In **Many Faces**, a Double that shatters on a hit leaves a **Fading Face** for 3 s where it stood: the next non-boss enemy to attack you while one exists hits the Face instead (no cap on the hit) and is Dazed 1 s. In Support, a sleep you cast that ends by itself creates one Face beside your healer. | `b_the_sporefather` The Sporefather (`d07_thornheart` boss 1) on Challenge, 3%; end chest at **Depth 10+**, 1% |
| `soul_puppet_master` | Soul of the Puppet Master | weapon | class: enchanter | When a charm ends for **any** reason, the creature's last borrowed ability you used is kept on your borrowed bar for 20 s (usable once, at 70% damage), and your next Charm casts in 1.0 s. | `b_the_tithe_below` (`d02_drowned_mill` secret boss) on Challenge, 3%; the world boss of `whisperwood` (`b_hungering_brood`), 2% |

---

## 10. Voice and barks

- Timbre: `voiceFor({ role: 'support', gender, seed })`, soft, sing-song (intonation 1.4), slow word gap; sleep lines are hummed (the formant engine's vowel-only mode). `(reuse: shared/voices.js)`

| Event | Lines |
|---|---|
| Hush | "Shh." · "Rest now." · "Sleep, little thing." |
| Charm | "You're with me now." · "Come, walk with me." |
| Charm about to break (25 Will) | "Its mind is slipping!" · "It's waking up!" |
| Charm breaks | "Oh. Oh no. Run." |
| Seed of Discord | "Isn't *he* the one you hate?" |
| Crown of Strings | "Everyone. Be. Still." |
| Beckon (Many Faces) | "Which one of me are you looking for?" · "Over here. No — here." |
| Hall of Mirrors | "So many of me. Pick one." |
| Crit | "Lovely." |
| Low health | "Someone hold them — I can't!" |
| Out of Mana | "My head's empty." |

---

## 11. Reuse notes

| Wildmarch piece | Borrowed from | Notes |
|---|---|---|
| Charm strings | spellfx `arcane` ribbon + STATUS_FX `enchant` | new string mesh |
| Sleep / silence / confused | STATUS_FX `sleep`, `silence`, `confused` (`avatar-3d/js/spellfx.js`) | as is |
| Charmed creature AI | Farhold pet/companion code (`js/pets.js` follow/attack, `js/followers.js`) running a **monster's** kit | enemy flips side; threat table wiped (page 05) |
| Borrowed bar | Farhold skill bar UI (`js/skills.js` `createSkillBar`) second instance | new frame |
| Doubles | Chibi 2 actor cloned with a translucent violet-silver material (`avatar-3d/js/chibi2.js`), the same technique as the shadow dancer's Shadows | the redirect roll is `(new)` |
| Somnolent Tide | Farhold `toxic_cloud` ground pulse engine | drifts |
| Crown pose | Chibi 2 idle clip with arms raised (new "puppet" pose in `chibi2-motion.js`) | small art task |
| Outfit | `class-outfits.json` `enchanter` (circlet, high-collar robe, shoulder cape) | |
| Talent engine | `prototypes/farhold/js/skilltalents.js` | Wildmarch tier levels |
| Emberveil 2 prototype ideas | `lullaby`, `mind_charm`, `mass_drowse`, `arcane_jolt` | reborn as Hush, Charm, Somnolent Tide, the Bad Dream talent |
