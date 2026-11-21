# Wyrmroad — the whole story (Acts I–III)

Owner, 2026-11-21: "add act 2 and 3 continuing the story. Act 2 should offer some other choices and both act 2 and 3
should change drastically depending on your choices, not just minor alternations like a different enemy appears, but
entirely different paths, different bosses, different cinematics. More story/cinematics, that's fine, that's the whole
point. Go crazy building up to the final boss fight." Also: "what happens with the dragon that was unchained or kept
chained, either becoming friendly or the final boss perhaps depending on other choices."

Every name, place and line below is original (playground rule: no third-party names; see docs/banned-names.md).

## Shape

```
Act I  The Wyrmroad (6 chapters, unchanged)  ── choice at the wyrm's crown ──┐
                                                                              │
     ┌──────────── "Break the chain" (free) ─────────────┐   ┌──── "Take the lantern" (hold) ────┐
Act II  The Undermaw: Brokenreach → The Underway → Bellwater   The Lantern Crown: Kingsway → Rookhaven → The Kiln
     ── choice at Bellwater ──┐                                 ── choice in the Kiln ──┐
     "Ring the bells"  "Chain her over the pit"                 "Keep the lantern"  "Smash the lantern"
         (bond)              (seal)                                  (crown)              (break)
Act III  Wings over         The Wyrm's Wrath                     Crown of Lanterns     Unbound Fire
         Halvenmark         Ashfall → Bell Foundry →             Siege of Halvenhold → The Wild Wyrm →
         Halvenhold → On    The Great Bell Tower                 Millbrook's Last      Wraithlight Abbey →
         the Wyrm's Back →  FINAL: Ossmara the                   the Gate → Inside the    The Burning Crown
         The Undermaw       Unforgiving                          Lantern               FINAL: the Lantern
         FINAL: the                                              FINAL: Aldric         Wraith (Ossmara
         Undermaw (Ossmara                                       Eternal (Ossmara      fights beside you)
         fights beside you)                                      leashed, beside you)
```

24 chapters in all; any one play-through is 12 (6 + 3 + 3). Four endings. 18 new bosses. The wyrm (her name is
**Ossmara**, learned in Act II) is a friend on two paths, a leashed weapon on one, and the final boss on one.

Progress follows the hero's choices (`js/sim/route.js`). A choice is made when its scene is reached in play; replaying
that chapter lets the hero choose again (the road after it changes; chapters done on the other road stay done).

## The cast (new)

- **Ossmara** — the wyrm. Old, vast, slow to speak, speaks in capitals. Not a monster: the land's oldest guardian.
- **The Undermaw** — the thing under the road. A hunger of roots and teeth that Ossmara lay on for an age. It whispers.
- **Queen Isolde** — Halvenmark's queen at Halvenhold. Hard, fair, frightened of lanterns and wyrms alike.
- **Dame Orsolya of the Silver** — the queen's champion; lance and tower shield.
- **Sexton Marrow** — the Order's gravekeeper at Brokenreach, who has listened to the Undermaw for forty years.
- **Mother Sabel** — Kilnkeeper of the Kiln Cathedral, where every lantern of the Order was blown from green glass.
- Returning: **Aldric/the Lamplord** (hollowed on the free road, a voice in the lantern on the hold road), **Grell**,
  **Tamsin**, **Maud**, **Vessa**, **Corwen**.

## Act II — free road: "The Undermaw"

Aldric fell into the dark under the wyrm's head when she rose. Three days later the long trench where she lay starts
breathing cold, and villages along it go quiet.

- **7F Brokenreach** — "Where the wyrm lay". The road ends in a trench; cold blue mist; split bell towers. Hollowborn
  (pale root-folk) climb out of the ground. Boss **Sexton Marrow**: grave spade, blue grave-lantern, raises hollowborn
  from the ground, a root snare (warning circle). Twist: *the wyrm was never the prisoner — she was the lid.*
- **7.5** Pre-boss scene: Marrow at an open grave, talking to the ground.
- **8F The Underway** — "Under the road". Caverns, glowing roots, the ribs of older wyrms. Twist: *the land had many
  wyrms; the Undermaw ate them; Ossmara is the last.* Boss **Aldric, the Hollowed** — your teacher, alive, root-veined,
  a blue lantern. He dies explaining himself: he chained her because he heard the Undermaw too and thought a leash was
  safer than a door.
- **9F Bellwater** — "The drowned bells". A lake village drowned to the roofs; bell towers in a mirror lake; Ossmara
  lies wounded in the shallows with roots on her. Boss **the Undermaw's Hand** — a giant root hand out of the lake
  (slams, sweeps, grabs; its fingers are weak points). **Choice:**
  - **Ring the bells for her** (bond) — the bell-stones' song heals her; she trusts you. *She will fight beside you.*
  - **Chain her over the pit** (seal) — the pit is shut; the bell-stones are her chains again. *She will not forgive it.*

## Act II — hold road: "The Lantern Crown"

You hold the lantern; the wyrm's leash is in your hand. Aldric's body fell, but his voice is in the glass.

- **7H Kingsway** — "The new Lamplord". The royal highway, banners, autumn. The Order's survivors kneel; Grell walks
  away; Queen Isolde names you outlaw. Foes: the Queen's Silver (knights, archers, hounds) and bounty hunters. Boss
  **Dame Orsolya** (lance charge, shield wall, rally). After: *the lantern speaks — Aldric's voice.*
- **8H Rookhaven** — "Grell's last hideout". A stilt village over a marsh. Millbrook has joined the Rooks; Tamsin is
  there. Boss **Grell, the Free Hook** (rematch: thrown hook, chain whirl, calls Rooks; stronger). Grell escapes; the
  lantern says "finish him"; you don't.
- **9H The Kiln** — "Where lanterns are made". A cathedral built round a green-glass furnace; Ossmara chained above it.
  Boss **Mother Sabel** (molten glass, beams, glass shards). **Choice:**
  - **Keep the lantern** (crown) — rule the road; the wyrm obeys. *Your friends will not forgive it.*
  - **Smash the lantern** (break) — free the wyrm, and whatever is inside the glass.

## Act III — four roads

**Free + bond: "Wings over Halvenmark"** (Ossmara breathes fire on your foes from the sky in every fight)
- 10 **Halvenhold** — the capital at night, the Undermaw's hollowborn pouring up through the streets. Boss **Queen Isolde,
  Hollow-ridden** (you free her by beating her).
- 11 **On the Wyrm's Back** — a fight on Ossmara's back above the clouds; wingspawn drop aboard. Boss **Gloomwing**.
- 12 **The Undermaw** — the pit's floor: a ring of roots and teeth around a beating heart. **FINAL: the Undermaw**
  (roots → the eye → the heart; Ossmara dives in for phase 3). Ending **"The Wyrm's Friend"**.

**Free + seal: "The Wyrm's Wrath"** (Ossmara is the enemy)
- 10 **Ashfall** — burning fields; her brood burns the villages. Boss **the Brood Mother**.
- 11 **The Bell Foundry** — casting the Great Bell, the only song she might remember. Boss **the Bronze Warden**.
- 12 **The Great Bell Tower** — storm, the tower's top, Ossmara circling. **FINAL: Ossmara the Unforgiving** (claws,
  breath lines, wing gusts, dives). Ending **"The Last Song"**: you ring the bell; she remembers it, and lies down to
  sleep for good, becoming a new range of hills.

**Hold + crown: "Crown of Lanterns"** (Ossmara, leashed, breathes green fire for you — a grim help)
- 10 **The Siege of Halvenhold** — you march on the capital. Boss **Queen Isolde** (silver armour, the real queen).
- 11 **Millbrook Bars the Gate** — home, at night, barricaded against you. Boss **Grell and Tamsin** together.
- 12 **Inside the Lantern** — the lantern burns your hand; you fight inside the glass. **FINAL: Aldric Eternal**.
  Ending **"The Lantern Crown"**: you win the lantern for yourself. You rule. The wyrm waits.

**Hold + break: "Unbound Fire"**
- 10 **The Wild Wyrm** — highlands, burning heather; Ossmara half-mad from the leash. Boss **Ossmara, Maddened** — the
  fight ends when she calms (not killed). After: she remembers who broke the lantern.
- 11 **Wraithlight Abbey** — Greyspire at night, ghost-green: Aldric's freed spirit raises the dead Order. Boss
  **Vessa, Wraith-bound**.
- 12 **The Burning Crown** — Crownhollow again, on fire. **FINAL: the Lantern Wraith** (Ossmara joins in phase 2).
  Ending **"Unbound"**: the wraith burns out; Aldric's last words are kind; Ossmara flies; Grell comes back.

## New enemies (Acts II–III)

| id | name | body | job |
|---|---|---|---|
| hollowborn | Hollowborn | chibi (pale, root-veined) | rises out of the ground; slow grab-and-bite brawler |
| rootcaster | Root Caller | chibi (hooded, pale) | caster: root snares under your feet (warning circle) |
| drowned | Drowned Ringer | chibi (sodden, bell) | slow, tough, bell swing knocks down; heavy |
| knight | Silver Knight | chibi (silver plate, halberd) | shield front + halberd sweep (guard brain) |
| archer | Royal Archer | chibi (silver + blue) | keeps distance, arrow volleys |
| hunter | Bounty Hunter | chibi (leather, net) | skirmisher; throws a net (slows) |
| glassmonk | Kiln Monk | chibi (green-glass robe) | throws glass that shatters into a small burning zone |
| wingspawn | Wingspawn | creature (bat/wisp, dark) | flies in, swoops, floats |
| drake | Brood Drake | creature (big wyrmling) | charges, fire spit; heavy |
| wisp | Lantern Wisp | creature (wisp, green) | floats, explodes near you after a wind-up |
| wraith | Order Wraith | chibi (ghostly green, translucent) | guard brain, passes through crates, fades in |

## New bosses

marrow · aldric_hollow · maw_hand · orsolya · grell_free · sabel · isolde_hollow · gloomwing · undermaw (FINAL) ·
brood_mother · bronze_warden · ossmara_wrath (FINAL) · isolde · grell_last + tamsin_last (pair) · aldric_eternal (FINAL)
· ossmara_mad · vessa_wraith · lantern_wraith (FINAL).

Big bodies (render): Ossmara (wyrm head, neck and claws at the play area's back edge — she is too big to stand on the
road), the Undermaw (ring of roots + heart), the Undermaw's Hand (giant root hand from the lake), Gloomwing (big winged
root-bat), the Brood Mother (big wyrmling), the Bronze Warden (bronze golem), Aldric Eternal / the Lantern Wraith (giant
green flame ghost, half body). The rest are Chibi looks.

## Sky ally (bond, crown, break-from-ch11)

A chapter may carry `sky: { who: 'ossmara', fire: 'gold'|'green', every: s }`: Ossmara passes overhead and breathes a
line of fire across the street on the foes — a warning line first (rule 39: allies' fire never hurts heroes, but foes
get the same warning look so it reads).

## Pre-boss scenes

Every Act II/III chapter has a short scene before its boss fight (`bossScene`), staged in the street, so the story
runs through the chapter and not only between them.
