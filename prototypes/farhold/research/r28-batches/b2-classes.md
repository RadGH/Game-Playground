# Round 28 — batch b2 (Skirmish) CLASSES.md lines

For the lead to fold into CLASSES.md "Round 28". Source rows: `data/r28-batches/b2.json`.

**Flair vs Poise.** Both are 5-point resources on the HUD, and they are built and spent in opposite
ways on purpose. **Flair** (Swashbuckler) rewards *rotating*: Flourish gains 1, or 2 if the skill
before it was a different one; Daring Leap, Mocking Parry and every enemy Matador's Turn hits add
more; Grandeur spends *all* of it in one burst (at 5 it becomes a 360° 6 m certain critical hit),
and Pinning Thrust sips 1 for +50%. **Poise** (Monk) rewards *patience and taking hits*: Open
Palm, Wind Step and Mountain Fist add it steadily, and Inner Stillness turns every melee hit it
halves into another point; Ninefold Staff spends all of it for widening rings. Nothing that gains
Flair cares about variety on the Monk, and nothing on the Swashbuckler is paid for being hit.

### Rogue — Burst Assassin · tag `grave`
Signature: set up, then cash in. `grave` (Grave Marked, 10 s): +25% damage from you, and 30% of
everything it took during the mark lands again when it ends.
- **Gutting Strike** (`eviscerate`) — 110% cut that bleeds; +80% on a stunned target, +30% from behind.
- **Poison Dart** (`poison_dart`) — dart that stacks poison to 3.
- **Sucker Punch** (`sucker_punch`) — short-reach jab that stuns 1.6 s; +50% from behind.
- **Grave Mark** (`grave_mark`) — 30 m shadow bolt that puts on Grave Marked.
- **Slip Away** (`slip_away`) — a 4 s decoy draws the fight; your next skill counts as from behind.
- **Knife Storm** (`knife_storm`) — 8 knives over ~3 s, each at a random enemy within 7 m (marked ones preferred).

### Shadow Dancer — Stealth Duelist · signature: afterimages
- **Shade Cut** (`shade_cut`) — a cut, and an afterimage where you stood repeats it at 50%.
- **Umbral Step** (`shadowstep`) — dash to land behind the target; an afterimage at the start strikes too.
- **Shroud** (`smoke`) — an 8 m cloud that moves with you: allies inside take 35% less, enemies inside deal 20% less.
- **Cutting Waltz** (`cutting_waltz`) — 5 strikes on enemies within 8 m, then an afterimage repeats it at 40%.
- **Assassinate** (`execute`) — big shadow cut, ×2 below 30% health, a kill resets it.
- **Host of Shades** (`host_of_shades`) — 3 shades for 10 s (no follower slots) that copy every skill you cast at 40%.

### Swashbuckler — Flashy Duelist · resource Flair · tag `turned_about`
`turned_about` (Turned About, 3 s): every hit on it counts as from behind.
- **Flourish** (`flourish`) — showy cut; +1 Flair, +2 if your last skill was different.
- **Daring Leap** (`daring_leap`) — leap to land behind the target; your next skill counts as from behind; +1 Flair.
- **Mocking Parry** (`mocking_parry`) — the next melee hit inside 1.5 s is negated and its attacker taunted; +2 Flair. Never hits back (that is the Fighter's).
- **Pinning Thrust** (`pinning_thrust`) — 6 m thrust that roots 2 s; spends 1 Flair for +50% if you have it.
- **Matador's Turn** (`matadors_turn`) — ring that puts on Turned About and Weakened; +1 Flair per enemy hit.
- **Grandeur** (`grandeur`) — spends all Flair, +75% a point; at 5 it is a 360° 6 m certain critical hit.

### Monk — Martial Artist · resource Poise · tag `downed`
`downed` (Downed, 3 s): takes 20% more from you.
- **Open Palm** (`open_palm`) — palm that knocks 2 m; +1 Poise.
- **Wind Step** (`wind_step`) — dash to the target; your next skill within 3 s is a certain critical hit; +1 Poise.
- **Sweeping Heel** (`sweeping_heel`) — 3.5 m sweep that stuns 1.2 s and puts on Downed.
- **Inner Stillness** (`inner_stillness`) — 3 s channel that heals 6% a second; melee hits taken are halved and each adds 1 Poise.
- **Mountain Fist** (`mountain_fist`) — 10 m line punch that stuns 1.5 s; +2 Poise.
- **Ninefold Staff** (`ninefold_staff`) — three widening rings (3.5 / 4.7 / 5.9 m); spends all Poise, +33% a point.

### Scavenger — Resource Specialist · signature: luck
- **Lucky Strike** (`lucky_strike`) — each hit rolls one of seven statuses.
- **Junk Toss** (`junk_toss`) — throws a rock (stun), a bottle (fire pool) or a pot (poison pool); the HUD shows the next.
- **Scrounge** (`scrounge`) — heal 8% and 15 s of +15% move speed with 2 mana back per hit taken.
- **Caltrop Scatter** (`caltrop_scatter`) — the scatter lands and hobbles, and leaves a trap that bleeds the next thing through.
- **Rag-and-Pitch Bomb** (`pitch_bomb`) — lands 1 s later as a random element and leaves a pool of it.
- **Big Score** (`big_score`) — rolls 20% to 500% of its damage; a kill pays 25 gold.

### Witch Hunter — Anti-Magic Skirmisher · tag `guilty`
`guilty` (Guilty, 10 s): takes 25% more from every source (you and your followers).
- **Silvered Pin** (`pinning_shot`) — two bolts that root 2 s and strip 6 s; +50% vs undead.
- **Silver Edge** (`silver_edge`) — +60% vs casters and archers, +50% vs undead; removes one harmful status from you.
- **Null Circle** (`null_circle`) — a 12 m circle for 8 s that silences enemies and stops enemy ranged hits on anyone inside.
- **Writ of Guilt** (`writ_of_guilt`) — puts on Guilty and orders your followers onto it.
- **Iron Net** (`iron_net`) — everything within 4 m of the impact is rooted and silenced 3 s.
- **Rite of Purging** (`purging_rite`) — a 12 m holy ring that strips every enemy and cleanses you and every follower.
