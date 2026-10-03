# Round 28 — batch b4 (Elemental & arcane): CLASSES.md lines

Six casters, six different verbs. The way to tell them apart at a glance: the **Mage** builds a
counter and spends it, the **Pyromancer** builds stacking burns and cashes them, the **Stormcaller**
spreads Shocked and makes bolts jump, the **Sorcerer** rolls dice, the **Chronomancer** bends
cooldowns and holds enemies still, the **Enchanter** never hurts what it can put to sleep or turn.

## Mage — signature: frost then shatter · counter: Frostbite (max 5; at 5 the target is Frozen 2 s)
- **Frost Shard** (L1) — cheap ice bolt, +1 Frostbite a hit.
- **Rime Burst** (L3, `frost_nova`) — ring round you, +3 Frostbite and a 2 m knock.
- **Rime Spear** (L6, `ice_lance`) — beam that spends Frostbite: +20% a stack (to +100%) and clears it.
- **Spellrush** (L12) — your next 3 skills deal +60% and cost no mana.
- **Whiteout** (L18, `blizzard`) — 6 pulses, each adds Frostbite, so standing in it the whole time freezes.
- **Stillfrost** (L24) — 1.5 s fuse, pays +20% per Frostbite already on a target, then freezes everything it hit.

## Pyromancer — signature: burn stacks · Burning stacks to 5 on its own skills (other classes still refresh)
- **Firebolt** (L1) — bolt that adds a Burning stack.
- **Burning Line** (L3, `fire_wall`) — a 10 m line of fire laid across your aim; +2 stacks and a 5 s fire strip.
- **Cinder Stride** (L6, `ember_stride`) — +20% move, a burning trail and a fire pool where you set off.
- **Stoke the Familiar** (L12) — the familiar gets +50% damage and −25% damage taken, burns what it bites, and comes back if fallen.
- **Flashover** (L18) — every burning enemy in 6 m pays 60% of its remaining Burning at once and keeps 1 stack.
- **Fallstone** (L24, `meteor`) — the big stone, +3 Burning stacks on everything under it.

## Stormcaller — signature: conductors (Shocked bodies take +30%) · tags: —
- **Forked Bolt** (L1, `chain_bolt`) — one bolt that bounces to 4 more targets for 80% each, shocking them.
- **Thunder Ring** (L3, `thunderclap`) — a clap round you, then a 7 m ring that follows you for 6 s and stuns and shocks whatever crosses it.
- **Storm Beam** (L6) — the long shocking beam (the channel is the T1 talent Held Storm).
- **Storm Orbs** (L12) — 3 orbs zap the nearest enemy for 12 s; you drop a 3 m shocking patch as you call them.
- **Bolt Step** (L18) — a 12 m dash that shocks what it passes; untargetable for 0.8 s.
- **Eye of the Tempest** (L24) — 12 strikes over 6 s at random enemies inside 9 m.

## Sorcerer — signature: wild magic · tags: —
- **Wild Bolt** (L1) — a random element every cast, with that element's status; the bar shows the next roll.
- **Arcane Burst** (L3) — +20% for every different status on the target, to +100%; curses.
- **Mana Rend** (L6) — free beam, +8 mana per enemy, +60% to casters and to champions, silences 2 s.
- **Overchannel** (L12) — 8 s of +60% damage; every cast costs 3% health.
- **Transmute** (L18) — a non-boss becomes a harmless little creature for 5 s.
- **Sixfold Ruin** (L24) — six strikes on the spot you aim, one per element, each leaving its own status.

## Chronomancer — signature: time · status: Lagging (stacking slow, 10% a stack, to 4)
- **Second Hand** (L1) — quick bolt, +1 Lagging, every hit takes 0.2 s off your other cooldowns.
- **Quicken** (L3) — Hastens you and every follower and takes 2 s off your other cooldowns.
- **Entropy Field** (L6) — 8 pulses that pile on Lagging and hit harder the more statuses a target carries.
- **Rewind** (L12) — back to where you were 4 s ago, health only upward; 3 s off your other cooldowns.
- **Stasis Lock** (L18) — a non-boss is held still 4 s; damage done to it meanwhile lands ×1.5 when it thaws.
- **Stop the Clock** (L24) — every non-boss within 25 m held 4 s (×1.25 bank) while your cooldowns run 4× as fast.

## Enchanter — signature: sleep and charm (owns `sleep` and `turned`) · status: Lethargic (slow zone)
- **Arcane Jolt** (L1) — small bolt, ×2.5 against a sleeper (and wakes it).
- **Drowse** (L3) — everything in 5 m sleeps 6 s.
- **Beguile** (L6) — a non-boss fights for you and follows you for 10 s, then is Weakened.
- **Lethargy** (L12) — an 8 s zone that slows 50%.
- **Phantasm** (L18) — a decoy of you draws every enemy near it; whatever strikes it falls asleep 2 s.
- **Grand Enthrallment** (L24, `enthrall`) — every non-boss within 12 m fights its own side for 6 s.

Legacy ids kept (renamed): `frost_nova` Rime Burst, `ice_lance` Rime Spear, `blizzard` Whiteout,
`fire_wall` Burning Line, `ember_stride` Cinder Stride, `meteor` Fallstone, `chain_bolt` Forked Bolt,
`thunderclap` Thunder Ring. `flamethrower`, `curse`, `bind_imp` left these classes for their plan owners.
