# Wyrmroad — plan

Side-scrolling 3D beat 'em up with Chibi 2.6 heroes, melee + magic (Thousandvale-style classes), an evolving story with
twists, new weapons and armour along the way, and co-op for 1–4 players on one screen or online.

Owner's ask (2026-11-20): "Build a side scroller beat em up with multiplayer local or online using chibi 2.6 models
with melee and magic like thousand vale with an evolving story and a few twists that you get new weapons and armor
you design everything"

## §0 Owner rulings and Claude's decisions

Owner: "you design everything" — so every choice below is Claude's and is listed on the round card's **Guessed** line.

| Question (genre sheet "choices that shape the pitch") | Decision |
|---|---|
| Players | 1–4: local co-op on one screen (keyboard halves + controllers) AND online co-op (room server, one player per device). Solo has an optional bot partner. |
| Stakes | Three lives per chapter; a lost life puts you back in on the spot after 3 s. In co-op a downed hero can be revived by a partner first. Out of lives → retry from the last fight (never the whole chapter). |
| Growth | Levels (health, mana, new spells at set levels) + gear (weapons and armour, shown on the body) + weapons picked up from the ground for a few swings (genre staple). |
| View | 3D street at a fixed side angle (`follow2d`: side view with a strip of depth to walk up and down). |
| Feel | Heavy-ish arcade: punchy 3-hit combos whose last hit knocks down, throws that bowl over a crowd, lane-align so a swing never misses by a hair. |
| Genre lead | Beat 'em up leads crowds, combos and stop-and-go; the RPG half leads levels and gear; the brawling stays simple. |

**Look (art direction, guessed):**
- **Mood:** a storybook kingdom gone rough — warm lantern light against cold blue dusk.
- **Camera and scale:** perspective camera from the side, slightly high (≈12°), heroes ~1/5 of screen height on desktop.
- **Shapes:** round, chunky Chibi heroes; angular, spiky enemies of the Lantern Order; soft rounded scenery.
- **Values:** heroes and enemies brightest; backdrop layers fade toward the sky colour with distance.
- **Palette:** heroes warm (gold, red, teal accents), threats in sickly lantern-green and black iron, ground earthy
  brown/grey, accent amber. Shadows cool blue, lights warm.
- **Detail:** on characters, weapons and breakable crates; kept out of the far backdrop.
- **Rules:** one flat-shaded toon material family, soft outline on characters only.
- **Signature:** the Wyrm's spine — a stone ridge that runs along the horizon in every chapter and gets closer (and
  starts to move) as the story goes on.

## Story — Act I (6 chapters, 3 twists). Acts II and III: docs/STORY.md

Kingdom of Halvenmark. The old road east, the **Wyrmroad**, runs along the spine of a stone wyrm that fell asleep
before anyone remembers. Each village along it keeps a **bell-stone** in its square.

1. **Millbrook** — the Rook Gang raids your village at dawn and steals its bell-stone. Brother **Aldric** of the
   Lantern Order (the kindly old priest who taught you to fight) sends you after them. Boss: **Grell the Hook**,
   Rook Gang lieutenant. He escapes with the stone, shouting that you "don't know who you're working for".
2. **Thornwood** — you chase the gang into the forest; wolves and gang scouts. The gang's pay chests carry the Lantern
   Order's seal. Boss: **Maud of the Briars**, a hedge witch who fights with thorns and fire and warns you the stones
   are "the only thing holding it down".
3. **Saltmere Docks** — **Twist 1:** the Rook Gang aren't thieves for profit. Grell has been hiding the bell-stones
   from the Order. Order soldiers raid the docks to take them. Boss: **Captain Vessa** of the Lantern Guard. Grell
   joins you (an ally who fights beside you in chapters 4–5 if you are alone).
4. **Greyspire Abbey** — **Twist 2:** Brother Aldric is the **Lamplord**, the head of the Order. He sent you out so
   you would fetch the stones for him. He takes every stone and the Abbey's lantern golem is set on you. Boss:
   **the Lantern Golem**.
5. **The Spine** — the stones are lit; the wyrm wakes and the road itself moves. Fight the Order's zealots along its
   back while the ground shakes. **Twist 3:** the wyrm isn't the danger — it was chained here, and the bell-stones are
   its chains. Aldric wants to bind it to his lantern. Boss: **High Zealot Corwen**.
6. **Crownhollow** — at the wyrm's head, Aldric, swollen with lantern fire, fights you. Beat him and choose to break
   the last chain; the wyrm rises and flies, and the road is just a road. Final boss: **the Lamplord** (two phases).

Story is told in short scenes before/after chapters and mid-chapter **banter lines** (two-line speech boxes at the
top, never over the fight). Each scene is 3–8 lines, skippable, readable by controller.

## Heroes (4 classes, melee + magic)

Every hero: **Attack** (3-hit combo; the 3rd knocks down), **Heavy** (slow, breaks guard, launches), **Jump** +
jump attack, **Dash** (double-tap or Dash key) + dash attack, **Grab** (walk into a dazed enemy) → **Throw**
(bowls over whoever it hits), **Block** (hold; perfect block in the first 0.15 s staggers the attacker), two
**Spells** (mana), and **Breaker** (clears everyone around you, costs 8% health — never kills you).

| Class | Weapon family | Spells (unlock level) |
|---|---|---|
| **Vanguard** — heavy armour, big swings | greatsword / great-axe / maul (two-handed) | Ground Slam (1), Iron Gale (held spin, 4), Iron Skin (8) |
| **Duelist** — fast, light armour | twin blades (one-handed ×2) | Shadow Step (1), Blade Fan (4), Hundred Cuts (8) |
| **Arcanist** — robes, staff | staff (two-handed) | Fire Bolt (1), Frost Ring (4), Meteor (8) |
| **Warden** — mail, mace + shield | mace/sword (one-handed) + shield (off hand) | Holy Light (heal partners, 1), Smite (4), Sanctuary (8) |

Levels 1–20. Each level: +health, +mana, +power. Spells unlock at 1 / 4 / 8 (two slots: pick which two you carry).
Dash and block moves grow by class at levels 3 / 7 / 13 (Arcanist also 9): Vanguard Shoulder Charge, Brace, Landslide
Charge; Duelist Riposte (timed block strikes back), Slipstream, Storm Riposte; Arcanist Rift Step (dash teleports),
Mana Ward, Rift Burst, Glass Ward; Warden Shield Rush, Shield Wall, Bell Rush (classes.json `kit`).

## Gear (the new weapons and armour)

Slots: **weapon**, **off hand** (shield/focus, or a second blade for the Duelist), **head**, **chest**, **legs**,
**feet**, **trinket**. Rarity: Common, Fine, Rare, Storied, Legendary (each a real power step). Every
chapter has its own designed sets (looks + names) dropped by its boss and found in chests; each set is drawn on the
Chibi body with its own colours and parts. Item cards follow game-standards §5b: how it is held on line 1, stats
summed, compare always available.

## Enemies (genre floor ≥ 3 truly different kinds; we have 12 + 6 bosses)

Rook thug (fists), Rook knifer (fast, low health), Rook bruiser (big, grabs you), wolf (low, lunges), Briar elemental
(caster, floats), Order guard (shield: hit from behind or break with Heavy), Order crossbow (keeps distance), lantern
priest (heals others — kill first), zealot (charges, explodes into fire on death), lantern hound, stone-skin golem
(armoured: knockdown-immune until broken), Spine wyrmling. Bosses per chapter (above).

## Rounds

- **Round 1 (this one):** everything above — 6 chapters, 4 classes, 12 enemies + 6 bosses, story + twists, gear
  sets, levels, local co-op, online co-op server, all menus, What's new, credits, reports, tuning panel, tests,
  publish.
- **Round 2 (2026-11-21, owner play-test):** Acts II and III — two choices, four roads, 18 chapters, 19 bosses, four
  endings (docs/STORY.md); staged cinematics with the cast on screen; harder fights that scale with players; knockdown
  kinds; Breaker cooldown; regen only between fights; class dash/block moves; Iron Gale; thrown boss hook; turn
  mid-combo; real two-handed holds; mouse + keys default; co-op bag tabs + Give; 23 live reports fixed.
  Owner rulings this round: "add act 2 and 3 … entirely different paths, different bosses, different cinematics";
  masculine = flat, feminine = round, no chest option; keep the temporary ground weapons as they are (#102).
- **Later (genre sheet "grow it"):** enemy groups whose roles work together beyond lantern priests; bonus stages
  (a cart ride along the Spine); a New Game+ with harder gear; more heroes.
