# Farhold — how the game words things

Round 21. This file is the standard every player-facing string in Farhold is held to.
It exists because the game had drifted into coy, prose-y descriptions that told the player
how something *felt* instead of what it *did*:

> "Sets what it hits alight"  — sets it alight with *what*? for how long? how much?
> "Keeps working after it lands" — *what* keeps working?
> "Leaves the target taking more of everything" — how much more? for how long?
> "4.4% of damage comes back as health" — this is life steal. Say life steal.

A player reading an item tooltip is doing arithmetic, not literature. They are deciding whether
this sword is better than that sword. Every word that does not help them decide is in the way.

## The rules

**1. Name the effect with the word the genre already uses.**
The player has played action RPGs. Use their vocabulary, not a fresh invention.

| Don't | Do |
|---|---|
| "4.4% of damage comes back as health" | "4.4% Life Steal" |
| "cancels this much of the target's dodge" | *(deleted — see Accuracy, below)* |
| "Sets what it hits alight" | "Adds 12 Burning damage over 4s" |
| "Leaves the target taking more of everything" | "Target takes 10% more damage for 10s" |

**2. Every effect states magnitude and duration, in numbers.**
"more", "a little", "briefly", "for a while", "greatly" are all banned. If the number is rolled
per item, print the rolled number. If it is a duration, print it in seconds with `s`.
A damage-over-time states the **total** and the **duration**: "12 Burning damage over 4s", never
"1.5 damage per second" — nobody reads a per-second figure as meaningful.

**3. Say DAMAGE when you mean damage.**
The most common failure was a description that never said what quantity it was talking about.
Burning, bleeding, poison, frost — each is an amount of *damage*. Say so.

**4. Never use a bare "it".**
Name the subject every time, even when it reads as repetitive. Tooltips are read in fragments,
out of order, next to other tooltips.

> "Promote it at the bench to give it something"
> -> "Promote this weapon at the Upgrade bench to add an affix."

**5. No instructions the player already has.**
Drop "Hold the attack button to keep attacking" and friends. The control is on the controls screen.
A weapon's tooltip is for that weapon's numbers.

**6. A label is a label, not a sentence.**
Character creation said "chosen when you get there — level 3" under a heading that already said
"pick the spell you start with". That is a **"Level 3 spell slot"**. Two words and a number.

**7. Sentence case, no full stop on a stat line.**
Stat lines (`+12 Strength`, `4.4% Life Steal`) take no full stop. Full sentences take one.

**8. Flavour text is allowed, but it is a separate line and it is never the description.**
If an item has lore, it goes in its own italic line below the stats. It never replaces a number.

## Accuracy is gone

Accuracy and enemy dodge are **removed from Farhold entirely**. Nobody builds accuracy; it is a
stat whose only job is to give back the damage the game quietly took away, and the tooltip that
tried to explain it ("+7.8% accuracy — it cancels this much of the target's dodge") is the clearest
possible evidence that it was never worth the words. Attacks connect. Damage is decided by damage.

Because `items.json` is **shared with Emberveil**, the accuracy affix is not deleted from the shared
file — Emberveil has a test that every affix in it resolves. Farhold neutralises it at load
(it rolls nothing, displays nothing, and does nothing), the same way Farhold already injects
affixes that only it understands.

## Life steal

Life steal heals the attacker for a share of damage **dealt by a weapon swing or a fired shot that
does physical damage**. It does not work on spells, and it does not work on wands or staves, because
a caster healing off their own spell damage makes every other sustain stat pointless.

## Applying this

`tests/wording.test.js` is the enforcement. It walks every player-facing string the game can print
and fails on:
- a banned vague word ("more of everything", "a while", "somewhat", "greatly", "a bit")
- an effect description with no digit in it
- the word "it" as the subject of a description sentence
- any surviving mention of accuracy or dodge in Farhold's own data

A string that genuinely has no number (a flavour line, a place name) is listed in the test's
own allow-list, so adding one is a deliberate act rather than an oversight.
