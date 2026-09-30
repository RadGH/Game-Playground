# Ranger — class design (`ranger`)

> *"She sees it first. I hit it first. It never sees either of us."*

**Status:** v0.1 draft, 2026-09-29. Follows the class template in [page 00 §5](../00-OVERVIEW.md).
Canon facts used (page 00): role **Damage**, **light** armour, resource **Focus**, mechanic **Hunting cat +
marks — commands the cat, marked prey**, spell slots **1 / 4 / 10 / 18 / 28 / 40**, calling quests **6 / 20 / 40**,
talent tiers **12 / 22 / 32 / 45**, cap **60**.

## How to read the numbers on this page

- **% WD** = percent of one full-power weapon hit (for a bow: a fully drawn shot; page 05 owns the formula).
  A ranger **spell** always fires at full draw — spells do not use the hold-to-draw of basic attacks
  (reuse: `prototypes/farhold/js/weapons.js` `RANGED`, `inputOf`). Numbers are **final**; Farhold's
  `effectiveMult` is already folded in.
- **Focus**: pool **100**, regenerates fast (page 05 owns the base rate; this page assumes **12 a second**).
- **Cat damage** = the hunting cat's own attack (§2.3), not the ranger's weapon.
- Statuses (root, snare, bleed, stun, blind, silence, haste) are page 05's.

---

## 1. Identity

| Field | Value |
|---|---|
| Fantasy | A tracker and her hunting cat. The quarry is chosen, marked and run down together. |
| Role | **Damage** (ranged, single target and packs) |
| Armour | light |
| Weapons | bow, shortbow, longbow, crossbow, javelin (reuse: `WEAPON_PATTERNS` / `RANGED` rows of the same names). Quiver in the off hand (reuse: `quiverGoesWith`) |
| Primary attribute | DEX (secondary CON) |
| Resource | **Focus** + **Hunt** stacks on the Quarry |
| Companion | **Hunting cat** from the level 6 calling (reuse: Farhold `data/enemies.json` `hunting_cat`, `js/pets.js`) |
| Starting kit | shortbow, light chest, light boots, ring (reuse: Emberveil `ranger.startingEquipment`) |

**Playstyle in three sentences.** The ranger picks **one enemy as the Quarry** with an arrow, and every hit
on it — hers or the cat's — adds a **Hunt stack**. Stacks are spent by the big moves (the cat's pounce, the
sky volley), so the class loops *mark → stack → cash in*. Between those, it controls space with hidden
**snares** and a backward leap, which makes it the best kiter in the game.

**Original hook:** "Aimed Shot ignores armor. Rain of Arrows blankets the entire enemy field for 3 rounds."
— kept as Quarry Arrow (ignores half the armour, all with a talent) and Skyfall Volley.

---

## 2. Class mechanic — the Quarry and the hunting cat (new; the cat is reuse)

### 2.1 Quarry and Hunt stacks (level 1)

| Rule | Value |
|---|---|
| Applying | **Quarry Arrow** (and a trap, if nothing is marked) makes its target your **Quarry**. One Quarry at a time (two from calling 20). A new Quarry Arrow on another enemy **moves** the mark and its stacks drop to 0. |
| Duration | 20 s, refreshed by any hit from you or the cat. |
| Bonus | The Quarry takes **+10% damage** from you and your cat. |
| Hunt stacks | +1 per hit from you or the cat on the Quarry (Quarry Arrow gives +2). Max **10** (15 from calling 40). Stacks last as long as the mark. |
| Spenders | Pounce Order (up to 5 stacks, +20% each), Skyfall Volley (all stacks, +5% each). |
| Visible to others | Yes — party members see a green crosshair over your Quarry (so healers and tanks know what is being hunted). |

### 2.2 Calling quests (page 14 owns the text)

| Level | Quest id | Where | Grants |
|---|---|---|---|
| 6 | `q_ranger_calling_06` "The Cat in the Orchard" | Hearthvale's orchards — track something killing the Brightwater flocks; it is a young hunting cat, and it chooses you | **The hunting cat** and the **cat commands** (§2.3) |
| 20 | `q_ranger_calling_20` "Two Trails" | Sunscar mesas — hunt a pair of glass-backed stalkers that always move together | **Second Quarry** (two marks at once, stacks tracked per mark) and **Pincer**: when you and the cat hit the same Quarry within 1 s, a bonus hit of **60% WD** (once per 3 s) |
| 40 | `q_ranger_calling_40` "The Apex" | Frostmantle glacier — follow a white great-cat for three nights | **Apex Bond**: max stacks **15**; when a Quarry dies its mark jumps to the nearest enemy within 15 m with **half** its stacks; the cat revives itself once per fight 5 s after dying |

### 2.3 The hunting cat (calling 6)

- Body: Farhold's `hunting_cat` (creature type `cat`, size 2.6, dark coat, green eyes). Players may recolour it
  from five coats in the appearance screen (page 03).
- Numbers (level-scaled by Farhold's follower rule, reuse: `js/followers.js` `scaleFollower`, which never lets
  a companion hit for more than 75% of the top of the owner's swing): health **55% of the ranger's max
  health**, bite every **1.1 s** for **35% WD**, speed **5.6 m/s** (the fastest companion; reaches casters).
- Takes **70% less damage from area attacks** (boss ground effects, cleaves) so it does not melt in raids.
- Does **not** take a party slot and never counts as a soak pip or a player for boss mechanics.
- Dies → respawns by itself after **60 s**, or at once with **Call Back** (§4).
- **Commands** (off the global cooldown, no cost; a small command wheel on key `F` by default, or direct
  keys `Alt+1..3`, page 02):
  - **Hunt** — attack my target (or my Quarry if I have no target). Default.
  - **Heel** — return and guard me: the cat attacks anything that melees you and **taunts** it for 2 s
    (once every 8 s).
  - **Stalk** — the cat turns nearly invisible (enemies ignore it) and moves to your target; its next
    bite is an **ambush**: 250% of its bite and 1 s stun (boss: interrupt). Breaks after the ambush or 15 s.

### 2.4 Gauge and HUD (new; page 03 `hud_quarry`, `hud_pet`)

- **Hunt row**: ten small arrowhead pips right of the Focus bar (fifteen after Apex Bond); two rows after
  calling 20, each tinted like its mark (green / teal).
- On the Quarry: spellfx `STATUS_FX.marked` (`target` sprite, recoloured green) over its head and its stack
  number on its nameplate.
- **Cat frame** under the player frame: portrait, health bar, current command icon (paw / shield / eye),
  a respawn clock when dead.
- Tooltip on the Hunt row: "7 Hunt stacks on the Emberhide Boar. Pounce Order spends up to 5 for +20% each."

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Focus | Cooldown | Cast | Shape | Headline |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `ranger_quarry_arrow` | Quarry Arrow | 15 | 4 s | instant | arrow, 46 m | 150% WD, ignores 50% armour, marks, +2 stacks |
| 2 | 4 | `ranger_hunters_snare` | Hunter's Snare | 20 | 12 s, 2 charges | instant | trap thrown to 25 m, 1.5 m trigger | root 3 s + 80% WD |
| 3 | 10 | `ranger_pounce_order` | Pounce Order | 15 | 10 s | instant | cat leaps 15 m | 200% of the cat's bite +20%/stack, stun 1 s |
| 4 | 18 | `ranger_barbed_fan` | Barbed Fan | 30 | 9 s | instant | 7 arrows, 50° cone, 30 m | 55% WD each, pierce 1, bleed |
| 5 | 28 | `ranger_bounding_retreat` | Bounding Retreat | 10 | 16 s | instant | leap back 12 m | caltrops 4 m 6 s, next arrow +50% |
| 6 | 40 | `ranger_skyfall_volley` | Skyfall Volley | 40 | 45 s | 1.0 s cast | 9 m circle, 40 m, 6 s | 12 × 40% WD, ×2 on the Quarry |

### 3.2 Spell details

**1. `ranger_quarry_arrow` — Quarry Arrow** (level 1)
- **15 Focus**, cooldown **4 s**, instant, single arrow, range **46 m** (longbow 54 m, crossbow 50 m, javelin 28 m —
  the weapon's own `RANGED.range`). **150% WD**, ignores **50% of armour**.
- Makes the target your **Quarry** (§2.1) and gives **+2 Hunt stacks**.
- Looks: Chibi 2 `shoot`; spellfx `projectile` shape `arrow`, element `physical`, with a green `streak` trail;
  the `target` sprite snaps onto the enemy.
- Sound: `spell.physical.launch` (bow twang), `spell.physical.impact`, `status.marked.apply`.

**2. `ranger_hunters_snare` — Hunter's Snare** (level 4)
- **20 Focus**, cooldown **12 s**, **2 charges**, instant throw to a ground point within **25 m**. Arms after **1 s**.
- A hidden trap with a **1.5 m trigger radius**; lasts **60 s**; up to **3** out at once (the oldest is removed).
- On trigger: **root 3 s** and **80% WD** to the enemy that stepped on it; if you have no Quarry, it becomes
  your Quarry. Enemies cannot see traps; allies see a faint outline.
- Looks: Chibi 2 `throw`; a small wire-and-stake prop (new model, ~200 triangles), `root_vine` sprites and
  `STATUS_FX.root` on trigger.
- Sound: `rope.creak` on placing, `status.root.apply` on trigger.

**3. `ranger_pounce_order` — Pounce Order** (level 10)
- **15 Focus**, cooldown **10 s**, instant. The cat **leaps up to 15 m** onto your target (your Quarry if you
  have no target) and hits for **200% of its bite**, **+20% per Hunt stack spent** (spends up to 5).
- **Stun 1 s** (boss: **interrupts** a gold-bordered cast).
- If the cat is dead the button becomes **Call Back** (§4).
- Looks: the cat's `attack` clip with a long leap arc; spellfx `impact` `physical` + `shadow_claw` sprites.
- Sound: a cat snarl (creature voice, reuse `sfx` `death.beast` family pitched up as a snarl), `melee.crit`.

**4. `ranger_barbed_fan` — Barbed Fan** (level 18)
- **30 Focus**, cooldown **9 s**, instant. **7 arrows** in a **50° cone**, range **30 m**.
- **55% WD** each; each arrow **passes through 1 enemy**; each applies **bleed** (page 05, 6 s; one bleed per
  enemy). Each arrow that hits the Quarry adds **1 Hunt stack**.
- Looks: Chibi 2 `shoot` (fast); spellfx `projectile` ×7 with `spread`, `bleed` drops on hit.
- Sound: a rattle of `spell.physical.launch` ×3 layered, `status.bleed.apply`.

**5. `ranger_bounding_retreat` — Bounding Retreat** (level 28) — **the movement tool**
- **10 Focus**, cooldown **16 s**, instant. Leap **12 m backward** (0.5 s in the air). While airborne you are
  **not affected by ground effects** (void zones, danger zones, puddles) but can still be hit by attacks in
  the air or by projectiles.
- Drops **caltrops** in a **4 m circle** where you started: **6 s**, **snare 50%**, **20% WD a second**.
- Your next arrow within **4 s** deals **+50%**.
- Looks: Chibi 2 `jump` played in reverse direction with a flip; `puff` dust at take-off; small spike
  decals (`thorn` sprite, steel colour) for the caltrops.
- Sound: `travel.step` + a cloth whoosh, `status.slow.apply` when an enemy steps in.

**6. `ranger_skyfall_volley` — Skyfall Volley** (level 40)
- **40 Focus**, cooldown **45 s**, **1.0 s cast** (the ranger fires straight up). A **9 m circle** anywhere
  within **40 m**, lasting **6 s**.
- Arrows fall every **0.5 s**: **40% WD** to every enemy inside per tick (12 ticks = **480%**). Ticks on the
  **Quarry** deal **×2** and add **1 Hunt stack** each.
- On cast it **spends all Hunt stacks**: **+5% damage per stack** for the whole volley.
- Looks: Chibi 2 `shoot` angled up; spellfx `aoe` with arrow `projectile`s falling from 12 m, `ring` marking
  the circle's edge (green, so allies know it is friendly — not a boss telegraph colour).
- Sound: a sky-wide whistle building for 1 s, then `spell.physical.impact` scattered through the 6 s.

### 3.3 Rotation / how it plays

- **Solo:** Quarry Arrow the dangerous one, cat on **Hunt**; Hunter's Snare between you and the pack; Barbed Fan when
  they bunch; Pounce Order at 5 stacks (stun); Bounding Retreat when something reaches you, then an
  empowered Quarry Arrow. Skyfall on the elite with 10 stacks.
- **Dungeon:** mark the pack's caster (tanks see it and pick up the rest). Cat on **Heel** if you are drawing
  aggro, otherwise **Hunt**. Hunter's Snare on the patrol route before the pull. Barbed Fan on the pack, Quarry
  kept on the priority target, Pounce Order as the group's second interrupt.
- **Raid:** the Quarry stays on the boss for the whole fight; stacks are banked for Skyfall in the burn
  phase or for Pounce interrupts on a schedule. Second Quarry (20+) goes on a priority add. Cat on **Stalk**
  before the pull for an opening ambush. Bounding Retreat is kept for the mechanic, not for damage.

### 3.4 Boss mechanics

| Mechanic (page 11) | Ranger |
|---|---|
| Void / danger zones | **Bounding Retreat** ignores ground effects while airborne (0.5 s) — the class's main dodge; plus the dodge roll. |
| Soak (orange) | A ranger counts as one soaker; the **cat does not count**. Light armour: soak only with a healer ready. |
| Targeted (yellow, spread) | 46 m range makes spreading easy; keep fighting from the edge. |
| Interrupts | Pounce Order (10 s) interrupts gold-bordered casts; the cat's Stalk ambush does too. |
| Adds | Hunter's Snare roots them; Barbed Fan hits a line of them; tier-2 **Lure** pulls them onto traps. |
| Kiting | The best kiter: snare caltrops, roots, 46 m range. Assign rangers to kite slow adds. |
| Cleaves on the cat | The cat takes 70% less area damage; put it on **Heel** to take it out of a frontal cone. |
| Line of sight | Arrows need line of sight; Skyfall Volley does not (it falls from above). |

---

## 4. Alternate spells

| When | Slot 3 becomes | What it does |
|---|---|---|
| The cat is **dead** | **`ranger_call_back` "Call Back"** | 3 s cast, no Focus: the cat returns at **50% health**. Shares Pounce Order's 10 s cooldown. Interrupted by damage over 10% of your max health. |
| Before the level 6 calling (slot 3 is still locked, so no swap) | — | — |

The cat's three commands are not spells (they have no cost and no cooldown) but sit on the command wheel.

---

## 5. Talents

Id = spell id + `_t<tier><letter>`. A tier opens at its level or when the spell unlocks, whichever is later.

### Quarry Arrow
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Splitting Quarry** — on impact, 3 shards fly on 5 m behind the target for 40% WD each. | **Long Draw** — hold up to 1.2 s: range 70 m and up to +100% WD at full hold. | **Twin Arrow** — two arrows 0.2 s apart, 85% WD each, +1 stack each. |
| 2 (22) | **Hunter's Brand** — the Quarry takes +10% from **everyone**, not only you and the cat. | **Tracking** — the Quarry shows through walls and stealth; the arrow turns up to 4 m to follow it. | **Heartseeker** — ignores **all** armour; crits on the Quarry deal +50% crit damage. |
| 3 (32) | **Dead Eye** — the 3rd Quarry Arrow in a row on the same target is a guaranteed crit and gives +3 stacks. | **Drive the Prey** — knocks the Quarry back 3 m and slows it 30% for 4 s. | **Sic 'Em** — the cat leaps onto the Quarry at once (a free Pounce at 50%, no stacks spent). |
| 4 (45) | **Ricochet Quarry** — the arrow bounces to the next enemy and makes it a second Quarry (even before calling 20). | **Kill Shot** — on a Quarry under 20% health: 400% WD; a kill resets the cooldown. | — |

### Hunter's Snare
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Bear Jaw** — root 5 s and bleed. | **Flash Wire** — a 5 m flash that **blinds** 4 s instead of rooting. | **Live Wire** — arms the moment it lands. |
| 2 (22) | **Snare Line** — a sprung snare also roots every other enemy within 4 m for half as long. | **Smoke Pot** — a 5 m smoke cloud: enemies inside lose their target and drop 50% threat on you for 3 s. | **Lure** — the trap makes a noise: enemies within 12 m walk to it. |
| 3 (32) | **Cat's Cradle** — the cat pounces free on anything that sets off a trap. | **Blasting Cap** — 200% WD in a 4 m circle. | **Tar Pit** — leaves 6 m of tar for 8 s (snare 60%). |
| 4 (45) | **Warren** — 5 traps out at once, 3 charges. | **Big Game** — works on bosses: 2 s hobble (snare 50%) and +5 Hunt stacks. | — |

### Pounce Order
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Raking Pounce** — 3 rakes of 90% of the bite plus bleed, no stun. | **Switch** — you and the cat swap places (a 15 m movement tool). | **Guard Pounce** — the cat leaps on whatever is hitting *you* and taunts it 3 s. |
| 2 (22) | **Throat** — **silences** 3 s (boss: interrupt + that spell locked 4 s). | **Two Leaps** — 2 charges. | **Pack Howl** — you and the cat gain haste (+20%) for 6 s. |
| 3 (32) | **Feast** — spending 5 stacks heals the cat 30% and you 10%. | **Pin Down** — rooted 2 s and takes +20% from you while pinned. | **Into the Grass** — the cat enters Stalk for free after the pounce. |
| 4 (45) | **Apex Pounce** — with 10+ stacks it hits everything in a 5 m circle. | **Bond of Claws** — for 8 s your arrows also strike the cat's target for 30% as a claw echo. | — |

### Barbed Fan
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Wide Fan** — 11 arrows in 90°. | **Tight Fan** — 5 arrows in 15°, 80% WD each (all can hit one target). | **Ring of Barbs** — a 360° ring of 12 arrows, 40% WD each. |
| 2 (22) | **Pinning Barbs** — each arrow slows 10%, stacking. | **Seeking Barbs** — arrows curve toward your Quarry. | **Venom Barbs** — poison instead of bleed; it spreads to one enemy within 5 m when the target dies. |
| 3 (32) | **Reclaimed Arrows** — each enemy hit refunds 2 Focus. | **Glancing Barbs** — each arrow bounces once. | **Step and Loose** — you hop back 4 m as you fire. |
| 4 (45) | **Hail** — a second fan fires 0.5 s later. | **Thicket** — arrows stay in the ground as a 6 s barbed field (10% WD a second). | — |

### Bounding Retreat
| Tier | a | b | c |
|---|---|---|---|
| 1 (12)\* | **Any Way** — leap in the direction you are moving. | **Two Bounds** — 2 charges. | **Cat's Bound** — the cat jumps too, lands in front of you and taunts for 2 s. |
| 2 (22)\* | **Net** — on take-off, a net roots the nearest enemy 3 s. | **Vanishing Leap** — drop 50% threat and be unseen for 2 s. | **Stunning Caltrops** — the first enemy on them is stunned 1 s. |
| 3 (32) | **Aerial Shot** — while airborne, Quarry Arrow has no cooldown. | **Long Bound** — 18 m. | **Clean Landing** — landing heals 8% max health. |
| 4 (45) | **Untouchable** — immune to all damage during the leap and 0.3 s after landing. | **Hunter's Reset** — refills your snare charges. | — |

\* unlocks at 28: tiers 1–2 open together.

### Skyfall Volley
| Tier | a | b | c |
|---|---|---|---|
| 1 (12)\* | **Rolling Sky** — the circle drifts 2 m a second toward the Quarry. | **Narrow Sky** — 4 m circle, ticks ×2.5. | **Sudden Sky** — no cast time; lasts 3 s with ticks twice as often. |
| 2 (22)\* | **Burning Sky** — the arrows burn. | **Pinning Rain** — enemies inside are snared 40%. | **Arrow Grove** — when it ends, the arrows stand as cover: allies inside take 15% less from ranged attacks for 6 s. |
| 3 (32)\* | **Hunting Weather** — the cat attacks 30% faster inside it. | **Storm of Barbs** — each tick has a 10% chance to drop a barbed arrow on a random enemy within 15 m. | **Hunter's Moon** — each kill inside refunds 5 s of cooldown. |
| 4 (45) | **Last Arrow** — the final tick is one great arrow on the Quarry for 300% WD. | **Two Skies** — two 6 m circles. | — |

\* unlocks at 40: tiers 1–3 open together.

---

## 6. Class sets

### `set_ranger_wildstalker` — The Wildstalker's Garb (dungeon set, item level 60)
Heroic: head `d07_thornheart` boss 2, chest `d08_moonwell_ruins` boss 2, legs `d10_rimefang_caverns` boss 3,
hands `d09_warmasters_pit` final boss, feet `d05_glass_tombs` boss 3, quiver (`it_wildstalker_quiver`)
`d12_unmade_workshop` final boss.
| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Quarry Arrow gives **+3** stacks. | Quarry Arrow |
| 4 | Every trap that goes off gives the cat a free **Stalk** ambush on the next thing it bites. | Hunter's Snare, cat |
| 6 | Pounce Order spends **up to 10** stacks at +20% each. | Pounce Order |

### `set_ranger_apex_hunt` — Trappings of the Apex Hunt (raid set)
`r02_glacier_throne` bosses 1–6 (one piece each), Normal; Mythic-quality versions from `r05_veilspire`
bosses 1, 2, 4, 6, 8, 9.
| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Barbed Fan fires **two** arrows at the Quarry among its seven, each +1 stack. | Barbed Fan |
| 4 | Bounding Retreat's empowered arrow (+50%) applies to your next **two** arrows and both give +2 stacks. | Bounding Retreat |
| 6 | Skyfall Volley **keeps** half the stacks it spends; the cat fights inside it at double bite speed. | Skyfall Volley, cat |

---

## 7. Class legendaries and uniques

### Legendaries
| id | Name | Slot / base | Power | Drop source |
|---|---|---|---|---|
| `leg_the_long_patience` | The Long Patience | longbow | **Patience** — every 2 s without firing, your next Quarry Arrow gains +25% (max +150%, 12 s). | `r02_glacier_throne` final boss (boss 6) |
| `leg_greatcats_collar` | The Great-Cat's Collar | necklace | **Two of Her** — a second, spectral hunting cat follows you at 50% bite; Pounce Order sends both. | the world boss of `whisperwood` (page 13) |
| `leg_wirewalkers_boots` | Wirewalker's Boots | light feet | **Walk the Wire** — you can see and step onto your own traps: doing so launches a free 12 m Bounding Retreat in the direction you face (no cooldown). | `d12_unmade_workshop` final boss, Heroic / Mythic+ |
| `leg_skyfall_string` | Skyfall String | bow | **Falling Star** — Skyfall Volley follows the Quarry and the Quarry cannot leave it. | `r05_veilspire` boss 9 |

### Uniques
| id | Name | Slot | Power | Drop source |
|---|---|---|---|---|
| `uq_brightwater_snare_kit` | Brightwater Snare Kit | light hands | Hunter's Snare has 3 charges and lasts 120 s. | `d02_drowned_mill` boss 2 |
| `uq_marking_quiver` | Marking Quiver | quiver (off hand) | The first arrow you fire after a Quarry dies marks the nearest enemy with 3 stacks. | `d06_sandsworn_vault` boss 2 |
| `uq_whisker_charm` | Whisker Charm | ring | The cat has 30% more health and Heel taunts every 5 s instead of 8 s. | `d03_deepdelve` final boss |

---

## 8. Voice and barks

- Timbre: `shared/voices.js` role `ranger` (pitch 0.50, breath 0.25 — quiet, a little breathy).
- Lingo tag `class:ranger`; the cat has no words (it growls, purrs and snarls — creature sounds).

| Moment | Lines |
|---|---|
| Quarry Arrow (new mark) | "That one." · "You're mine." |
| Hunter's Snare | "Watch your step." |
| Pounce Order | "Take it!" · "Go, girl!" / "Go, boy!" (per cat gender, set on the appearance screen) |
| Barbed Fan | "Scatter." |
| Bounding Retreat | "Too close." · "Back!" |
| Skyfall Volley | "Look up." |
| Critical hit | "Clean kill." |
| Cat dies | "No— come back!" |
| Low health | "I'm hit, I'm hit!" |
| Quarry dies | "Next trail." |

---

## 9. Reuse notes

| Borrowed | From | Used for |
|---|---|---|
| `hunting_cat` body, stats, `PET_FOR` entry | `prototypes/farhold/data/enemies.json`, `js/pets.js` | the cat (AI states follow/engage/return kept; Heel/Stalk are new states) |
| Level scaling + 75% cap | `prototypes/farhold/js/followers.js` `scaleFollower` | cat damage |
| Bow draw / range per weapon | `prototypes/farhold/js/weapons.js` `RANGED`, `WEAPON_TRAITS.pierceBodies` | basic attacks; spell range |
| Timbre `ranger` | `shared/voices.js` | voice |
| Look (leather, travel cloak, herb satchel, bow) | `avatar-3d/data/class-outfits.json` `classes.ranger` | default outfit |
| Clips `shoot`, `throw`, `jump`; creature `attack` | `avatar-3d/js/chibi2-motion.js`, `avatar-3d/js/creatures.js` | spells, cat |
| Visual ideas of Farhold `aimed_shot`, `multi_shot`, `pinning_shot`, `rain_of_arrows` | `prototypes/farhold/data/skills.json` | effects only — ids/names/numbers new |
| `STATUS_FX.marked`, `.root`, `.bleed` | `avatar-3d/js/spellfx.js` | Quarry, traps, fan |
| Emberveil `smoke_trap` idea | `prototypes/emberveil/data/skills.json` | Smoke Pot talent |
| Sound ids | `sfx/data/catalog.json` | as listed |
| Talent engine | `prototypes/farhold/js/skilltalents.js`; new mod keys `stacks`, `pet`, `trap` | talent cards |
