# Round 28 — batch b3 (Hunters & commanders): CLASSES.md lines

Every pet-command class is in this batch, so each one's followers play a different game:
the Ranger's cat is a **strike partner on the Quarry**, the Demon Hunter's hound is **brought back and
sent in** while Grudge builds from being hit, the Tinker's sentry is a **gadget you put down**
(temporary turrets), the Tactician has **no pet at all and commands whoever follows** (mercenaries
included), the Necromancer's dead are **disposable ammunition** (corpses become thralls or bursts),
and the Warlock's imp is **paid for in health** and carries Gnawed.

### Ranger — signature: the hunt · tag `quarry` (takes 20% more from every source, 12 s)
- **Long Draw** (`aimed_shot`) — 42 m shot, ignores 50% armour, +4% per metre past 20 m (cap +60%).
- **Hunter's Snare** (`hunters_snare`) — lands for damage and leaves a trap (arms 1 s, 30 s, max 2) that roots and marks Quarry.
- **Broadhead Fan** (`multi_shot`) — 5 arrows; an arrow that hits a Quarry target splits into 2.
- **Call the Quarry** (`quarry_call`) — marks Quarry and orders every follower to pounce on it.
- **Tracker's Leap** (`trackers_leap`) — dash back 9 m striking where you stood; next skill within 3 s +50%.
- **Arrow Storm** (`rain_of_arrows`) — 8 scattered volleys over 4 s; +50% against Quarry targets.

### Demon Hunter — signature: Grudge (max 5) · tag `brand` (takes 15% more from you, 8 s)
- **Brand Bolt** (`hex_bolt`) — +50% vs fiends/aberrations, Brands; while it is on your bar, every hit you TAKE gives 1 Grudge.
- **Tumbling Shot** (`tumbling_shot`) — roll back 7 m kicking what is near (knock 2 m); +1 Grudge.
- **Chain Hook** (`chain_hook`) — beam that drags bodies 12 m to your feet and stuns 0.8 s; +1 Grudge per body.
- **Unleash the Hound** (`unleash_hound`) — every follower pounces your target, the fallen are revived at 50%; +2 Grudge.
- **Settle the Grudge** (`grudge_bolt`) — spends all Grudge, +35% per point; at 5 it pierces everything and stuns 1 s.
- **Night Hunt** (`night_hunt`) — +3 Grudge, 6 s off Settle the Grudge, 12 s of attacks that Brand, +15% move.

### Tinker — signature: gadgets · tag `stuck` (takes 10% more from every source, 4 s)
- **Clockwork Bolt** (`clockwork_bolt`) — sticks (Stuck), its spring fires again 1.2 s later for 40%, the class companion attacks the same target.
- **Flask Grenade** (`flask_grenade`) — cycles Fire (burning pool) → Frost (chill) → Acid (Marked).
- **Deploy Sentry** (`deploy_sentry`) — a temporary Field Turret for 20 s that takes no follower slot (talents: flame/arc turrets, twin turrets, repair turret, a mine that bursts, mimicking turrets).
- **Pocket Watch** (`pocket_watch`) — heal 25% and a 6 s ward against the next hit above 15%.
- **Grapple Line** (`grapple_line`) — reel yourself to whatever the line hits (enemy or follower), stunning 0.5 s.
- **Spring Battery** (`spring_battery`) — 10 s: you and every follower +40% attack speed and free skills; 3 s slow after.

### Tactician — signature: orders (no pet; commands any follower) · tag `flanked` (takes 15% more from every source, 4 s)
- **Exploit the Gap** (`exploit_gap`) — +40% against an enemy attacking someone else; marks Flanked.
- **Rally** (`rally`) — Rallied on you and every follower; orders them back to you.
- **Lead the Charge** (`charge`) — dash with every follower within 15 m; your next skill and their next attack +30%.
- **Reposition** (`reposition`) — swap places with the aimed follower (20% barrier) or non-boss enemy (Weakened 2 s).
- **Seize the Initiative** (`seize_initiative`) — 30 s off every follower ability; your cooldowns run 2x for 3 s.
- **Battle Plan** (`battle_plan`) — a 16 m zone that follows you 10 s: enemies Marked (+25% taken, 30% slower), allies Hastened, a strike every 2 s; followers focus your target.

### Necromancer — signature: corpses (every death leaves one for 20 s)
- **Marrow Lance** (`marrow_lance`) — piercing bone bolt; a kill leaves a corpse worth 2.
- **Raise Thrall** (`raise_thrall`) — a thrall with +50% health, risen at a corpse within 12 m if there is one.
- **Corpse Pyre** (`corpse_pyre`) — strikes the aim and stands up to 5 nearby corpses that burst 0.8 s later for 100% in 4 m.
- **Grave Draught** (`drain`) — draining beam; heals you from the damage and every follower 12%.
- **Plague Cloud** (`toxic_cloud`) — 8 pulses of Poison AND Bleeding; a kill inside leaves a 2 m cloud.
- **March of the Buried** (`buried_march`) — 1 temporary thrall plus 1 per corpse within 20 m (up to 8), 18 s, no slots.

### Warlock — signature: health as fuel, corruption that spreads · status `gnawed`
- **Gnawing Dark** (`gnawing_dark`) — Gnawed (8 s, jumps to the nearest enemy when its host dies).
- **Bind a Fiend** (`bind_imp`) — costs 10% health; the imp's bolts leave Gnawed.
- **Hex of Ruin** (`curse`) — 5 m splash: Cursed (+25% taken) and Weakened 15%.
- **Soul Pact** (`soul_pact`) — costs 20% health, no mana: your statuses tick twice as fast for 10 s.
- **Void Rift** (`void_rift`) — 4 pulses pulling 2.5 m; copies every damage-over-time from a target to 3 neighbours.
- **Abyss Gate** (`abyss_gate`) — costs 10% health: tears open for a big hit, then a gate fires at random enemies within 20 m for 10 s, applying Gnawed.
