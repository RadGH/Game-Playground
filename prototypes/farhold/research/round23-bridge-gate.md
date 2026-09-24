# Round 23, items 4 and 5 — the bridge and the gate at Fenkeep

Both reports come from one town: **Fenkeep**, a size-4 halfling city on seed 47, Sheithyadmia V
(the start world for that seed), Super tiny planet (scale 0.1). The bridge is on the highway that
runs straight through the middle of town; the gate is the town's west gate. Screenshots are in
`research/round23-bridge-gate/` (`before-*.png` from the previous commit, `after-*.png` from this
one, same camera spots).

## Item 4 — "the bridge has no physics, characters clip through it, the ends aren't flush"

### What was actually wrong

The bridge was **two things built from different numbers**, and each one was fine on its own:

* **What you saw** was one flat box, laid at the road's height in the *middle* of the crossing and
  stretched to 80 m.
* **What you stood on** was a chain of short flat pads, each at the road's height *where that pad
  was*. The road slopes down off this bridge towards the east bank.

Measured at the reported spot: the drawn top was 29.93 m all the way along, and the pads under it
fell to 29.41 m at the east end. So the player walked half a metre *inside* the planks — that is the
clipping. Where the box stopped, it hung 0.86 m above the road it was meant to land on, and the
road carried on underneath it — that is "not flush".

The "characters" part was a separate, bigger fault: **nothing but the player ever stood on a
bridge.** Enemies (`js/actors.js`), companions (`js/pets.js`) and townsfolk (`js/town.js`) all set
their height from the bare terrain, which under a bridge is the *river bed*. Their "don't walk into
water" rules also read the water under the deck. So your cat followed you over the bridge by walking
along the bottom of the river, or refused the "water" and snapped back to your side every frame.

There was one more thing the measuring turned up across the whole world: **a third of all bridge
ends stopped in mid-air over the river** (14 of 40 on seed 47). Those are roads that *end* in the
water — at a town node or a junction standing in a river — so the bridge, which stops where its
road stops, had nothing to land on.

### What changed

* **`js/bridge-plan.js` (new)** — one plan per bridge: a list of heights sampled every 2 m along
  the deck. The drawn deck (planks, rails, stone piers) is built from those samples, and the
  things you stand on are sloped pads between the same samples. The drawn top and the collider are
  the same straight line between the same two points, so they cannot disagree anywhere.
  * The deck follows the road it carries up and down, instead of staying flat.
  * **Each end comes down to the ground** just past the footprint (to 2 cm), or meets the next
    bridge's deck where two roads cross the river together.
  * **An end that meets nothing gets a landing**: the deck carries straight on and ramps down to the
    first bank it can reach at a walkable slope (up to 40 m). What's left afterwards is a handful of
    roads that end at the sea or in the middle of a wide river with no bank in reach (1 of 40 ends
    on seed 47, 0 of 20 on seed 7, 4 of 60 on seed 4477).
  * Where two bridges overlap, a rail of one is no longer drawn across the other's deck.
* **`js/ground.js` (new)** — one "where do my feet go" function for every walker:
  `groundAt(terrain, x, z, feet)` is the terrain *or* a bridge deck under you, and
  `wetAt(...)` is "is this water you'd be standing in, rather than over on a bridge". A body only
  steps up on to a deck from about its own height, so something swimming *under* a bridge is not
  lifted on to it. Enemies, companions, townsfolk and the player's teleport all use it now.
* **`js/collide.js`** — a deck pad can now slope (`addDeck(..., slope)`), so the chain is a ramp,
  not a staircase.
* **`js/features.js`** — draws every nearby bridge as one mesh (`bridgeMesh`) from the plans, and
  files the same plans' pads for the player. The old instanced bridge box is gone.

Measured after: across every bridge on three worlds, the drawn deck and the thing you stand on agree
to under 2 cm; the worst end step is under 10 cm.

## Item 5 — "the gate doesn't connect to the walls, you can walk through the wall; grey gate in a
green town; the doors look closed; put a guard at each entrance"

### What was actually wrong

Three separate faults made the hole beside the gate:

1. **The gatehouse and the gap cut for it were decided by two different rules.** The gatehouse was
   stretched over a fixed arc, and the wall pieces removed for it were chosen by a different test,
   so the gate's ends and the wall's ends were never the same point.
2. **The wall piece next to the gate was quietly thrown away.** Every building refuses to stand on
   a road, and the road arriving at a slant was still kerb one wall piece past the gate — so that
   piece was dropped with no gate to cover it. At the reported gate this left a 4.6 m hole on one
   side and a 2.6 m hole on the other.
3. **The collision didn't match the drawing anyway.** The wall was filed as a row of 3.4 m circles
   and the gate as two 2 m circles eight metres out from its middle — so between the last circle and
   the gate you could walk through what looked like solid wall.

The colour was simpler: the wall and towers are drawn white and tinted with the town's own wall
colour (a green hedge for a halfling town), but the gatehouse was modelled in a fixed grey stone
and given a random grey tint. The "closed" look was the portcullis box across the middle of the
passage.

The same fix also turned up two more holes nobody had reported: a wall stopped a full piece short of
a river bank (so you could walk round its end on dry ground), and a road running *alongside* the
wall (not through it) knocked out the wall pieces it touched — 40 m of open wall at seed 7's
Gukgruzcrown.

### What changed (all in `js/features.js` unless noted)

* **Each wall piece's fate is decided once, up front**: water, bridge, road, or wall. A gate's
  stretch is the pieces its gatehouse needs plus any kerb beside it. The gatehouse goes on the
  straight line between the two wall ends that bound that stretch — the same points the next wall
  pieces end on — and anything the gatehouse doesn't cover is filled with wall on the same line.
* **The gate is sized to the road**, measured along the wall (a road meeting the wall at a slant is
  wider there), and centred where the road actually crosses.
* **Walls run down to the water's edge** instead of stopping a piece short; a road beside the wall
  no longer knocks holes in it.
* **Collision is a straight wall segment on exactly the drawn line** (`js/collide.js`
  `addSegment`: a box with square ends, not a string of circles). A fast step — a gallop on a slow
  frame — can't hop through a thin wall either: the player's controller now says where each step
  started, and a step that crosses a wall is put back on its own side.
* **The gatehouse is tinted with the town's wall colour**, and its towers are slimmer so more of it
  is opening.
* **The doors stand open**: two wooden leaves (their own mesh, `gatedoor`, so they stay wood-coloured)
  hung at the outer end of the passage and swung back against its sides, with collision on each leaf.
* **Two guards at every entrance** (`js/town-plan.js` `sentryPosts`, placed by `js/town.js`): just
  outside the wall, one either side of the road, facing out. They're real guards — they fight
  anything that comes near, then walk back to their post and face out again; they turn to face you
  when you walk up.
* **Wall instance cap** raised from 700 to 1400 (`js/town-plan.js`), because the kerb fillers add
  pieces and a cap that runs out would drop masonry.

## Tests

* `tests/round23-bridge-gate.test.js` (node, 15 tests): reads the drawn bridge back out of the
  mesh's own vertex buffer and compares it with the collider along every bridge on three worlds
  (seeds 47, 7, 4477); both ends of every bridge; walkers on and under a deck; walks the whole wall
  ring of 11 walled towns checking every half-metre of dry wall line is solid except the gate
  openings; the gate passage is clear; gate colour equals the wall colour; two open door leaves per
  gatehouse; two guard posts per entrance; the wall/deck primitives on their own.
* `tests/round23-bridge-gate.spec.js` (browser, at the reported spot): walks the player across the
  bridge with real key presses and checks their feet stay on the drawn deck the whole way; walks
  into the wall beside the gate and is stopped; walks through the gate and gets in; finds the two
  gate guards at their posts.
* Updated on purpose (they pinned the old code rather than a rule): `round16-roads.test.js` "chain
  of decks", `round22-roads.test.js` "same circle", `round3.spec.js` bridge test (reads the plan
  instead of the old instanced box), `town.spec.js` "people near the town" (gate guards stand at the
  wall, not in the square).

## Not done

* **Roads that end in the water.** The few bridge ends still stopping over water (1–4 per world)
  are roads World Forge routed to a town or junction node that sits *in* a river or at the sea.
  Moving those nodes is the same "a town in the river" problem round 17 left open (it touches the
  map, quests, markers and waypoints). The landing covers every one that has a bank within 40 m.
* **Bridge rails and piers have no collision.** Rails are drawn only; walking off the side of a
  bridge drops you in the river, as before. A rail collider would also stop a swimmer under the
  bridge, because the obstacle field has no idea of height for a wall — that needs a "solid only
  between these two heights" collider, which is a bigger change than this round.
