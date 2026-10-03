# Round 28 — batch 5 (Healers & support): CLASSES.md lines

For the lead to fold into CLASSES.md "Round 28". Numbers are base (before `effectiveMult`); every card
line is generated from data/skills.json.

## Cleric — Primary Healer · signature: heals that overflow into protection; raising the fallen · tag `lit`
`lit` (3 s): takes 10% more damage from you; Falling Light deals +50% to a Lit target.
1. **Mend** (self) — heal 35%, every follower heals 20%, overheal becomes a barrier up to 10%.
2. **Sunlance** (beam, holy, m 1.5, cd 6) — each enemy struck heals you and followers 2% and is Lit.
3. **Sanctuary** (ground zone, cd 24) — 6 s, 10 m across: allies inside heal 3% a second, enemies are pushed out 2 m a second.
4. **Guardian Light** (temporary wisp, cd 30) — no follower slot, 20 s, heals the most-hurt ally 6% every 2 s or strikes for 40%.
5. **Raise the Fallen** (self, cd 40) — revives every fallen follower at 50%, heals the rest 30%, Rallies you all.
6. **Falling Light** (`judgement`, ground, m 2.4, cd 14, 0.7 s delay) — +50% on a Lit target; allies under it heal 10%.

## Priest — Holy/Shadow Caster · signature: pre-paid revives and revenge · tag `killer`
`killer` (8 s): takes 20% more damage from you.
1. **Shadow Lance** (bolt, shadow, m 1.9, cd 5) — 25% of the damage heals the most-hurt ally.
2. **Prayer of Dawn** (around, holy, m 1.1, r 10, cd 12) — one ring: heals you 20% and every follower 20%, hits every enemy.
3. **Mark the Killer** (bolt, shadow, m 1.2, cd 8) — tags Killer.
4. **Vigil** (self, cd 45) — 12 s: the first killing blow on you or any follower leaves them at 1 health and bursts 6 m for 150%.
5. **Dread Hymn** (around, shadow, m 1.1, r 8, cd 18) — fears non-bosses 3 s; followers +20% damage for 4 s.
6. **Twinlight** (around, shadow, 6 pulses x m 0.8, r 14, cd 40) — each hit heals the most-hurt ally 25% of the damage; a 6 s ring around you heals allies 3% a second.

## Oracle — Predictive Protector · signature: foresight · tag `omen`
`omen` (6 s): a name the Oracle's other skills read (Prophecy +100%, talents spread / consume it); Omen Bolt pairs it with Weakened 25% for 3 s.
1. **Omen Bolt** (bolt, arcane, m 1.2, cd 3) — tags Omen, weakens 25% for 3 s.
2. **Foresight** (self, cd 16) — you and followers: a 15 s ward that negates the first hit worth more than 10% of maximum health.
3. **Prophecy** (ground, arcane, m 1.5, r 6, 2.5 s delay, cd 14) — a ring that follows the aimed enemy and slows 30%; +100% to Omened targets.
4. **Thread of Fate** (self, cd 18) — links the nearest follower (you take 50% of its damage) and Mends you both.
5. **Turn Aside** (around, arcane, m 1.1, r 6, cd 12) — knocks 3 m and interrupts the attack being wound up.
6. **The Last Prophecy** (self, cd 60) — 8 s: enemies within 20 m are Weakened 25%, followers +40% damage; ends in a 12 m 300% blast.

## Shaman — Spirit Caster · signature: posts · tags: —
1. **Spirit Bolt** (bolt, lightning, m 1.2, cd 3) — bounces to 2 more at 70%; every hit heals you and followers 2%.
2. **Mending Post** (ground post, cd 18) — 12 s, 30% of your health, heals allies within 8 m 2% a second; 2 at once.
3. **Storm Post** (ground post, cd 16) — 10 s, strikes 2 enemies within 10 m every 1 s for 25%.
4. **Call a Spirit** (`call_spirit`, summon spirit bear, cd 40) — the bear pounces your target; with the bear up it is a howl that hastens and taunts.
5. **Warding Spirits** (self, cd 24) — you and followers: 3 ward charges, each negates a hit of up to 8% of maximum health.
6. **The Great Post** (ground post, cd 50) — 15 s: strikes 3 enemies for 40% and heals allies 2% every 1.5 s; each Spirit Bolt hit near it rings it for 60%.

## Bard — Support Maestro · signature: songs (one at a time, Finale on switching away) · tags: —
1. **Discord Note** (bolt, arcane, m 1.3, cd 3) — ricochets once; Valour: you +25% attack speed 2 s / Ruin: Marked 3 s / Mending: allies heal 2% a hit.
2. **Ballad of Valour** (song) — allies within 10 m +25% attack speed, +10% move. Finale: followers +40% damage 4 s.
3. **Song of Ruin** (song) — enemies within 10 m take 12% more and deal 10% less. Finale: 150% shadow in 10 m + Weakened 5 s.
4. **Air of Mending** (song) — allies within 10 m heal 1.5% a second. Finale: 15% heal + cleanse 1.
5. **Quickstep Jig** (dash, m 1.6, cd 10) — no song: weakens what it passes; in a song it leaves a 3 s copy of that song's zone.
6. **Grand Finale** (around, arcane, m 3.2, r 12, cd 30) — +25% per follower alive, up to +50%.
Song talents work through what a card can say: the singer's stats, the followers' buff, and a cast on entering or leaving the song.

## Druid — Shapeshifting Healer · signature: shapes · tags: —
Shapes (engine pass): Briarback (thorn boar tank), Fenrunner (venom lizard), Sporecap (timed fungus).
1. **Thornlash** (bolt, nature, m 1.4, cd 3) — roots 0.6 s, heals the nearest follower 3%. Bramble Gore / Venom Lunge / Spore Lob.
2. **Greensap** (`renew`, self) — Mending on you and followers. Thornswell / Shed Skin / Mycel Web.
3. **Briarback Shape**, 5. **Fenrunner Shape**, 6. **Sporecap Shape** — as built in the engine pass.
4. **Call the Pack** (`call_wolf`) — a grove wolf; with the pack up, a howl. Den Guard / Running Pack / Puffball Brood.
Talents on the three shaped skills: the top-level part works in the druid's own body (and for a custom class with no shapes); `forms` riders give each shaped version its own twist (Thorn Fan, Wild Lash, Overgrowth, Wild Sap, Wild Pack).
