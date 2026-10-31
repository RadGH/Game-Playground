# What the sim needs from a town

The sim reads one plain object. It never imports `js/world`; `world-town.js` turns a built world into this shape, and
`fake-town.js` makes a small one for tests. Any future map (the second city, a generated world) only has to produce this.

```js
town = {
  id: 'first-county',                 // saved in the game; a save will not load on a different id
  nodes: [{ id, x, z, zone? }],       // junctions and road ends. An id may not contain '>'.
  edges: [{ id, a, b,                 // a road between two nodes, two-way unless oneWay: true
            speed?,                   // m/s limit, default 14
            points?: [[x, z], ...],   // the road's shape, a to b; default a straight line
            length?, oneWay? }],
  buildings: [{ id, kind, node, x, z, // kind is a key of data/buildings.json `kinds`; node is the junction it opens onto;
            zone?, units?, name?,     // x, z is the door. units = flats in an apartment block.
            cx?, cz?, yaw?, w?, d?,   // the footprint: middle, which way the front looks, size. Missing = a default for the kind
            floors?, doorX?, garage? }],  // doorX = the door along the front; garage = -1, 0, 1, a side with a garage
}
```

`town.timber` (optional) is the site `js/sim/work.js` works: trees, landing, lever, deck, rack, truck, benches, `camp` and `mill` building ids, `centre`, `radius`. No `timber`, no chain.

Rules, each checked at load with a plain error message:
- every edge names real nodes, every building a real kind and node;
- every building can be reached by road from the first one;
- there are at least as many homes (house + flats) as households.

A building kind says what it holds: slots, opening hours, tags actions can ask for (`food`, `park`), and jobs.
A place is one thing a person can be at: a building, or one flat of a block.

Routes are built by the sim from this graph. A route id is `${fromNode}>${toNode}`, so saves hold only ids.
`sim.routeById(id)` gives `{ id, points: [[x, z]...], cum: [metres at each point], length, seconds, steps }`;
`steps` is the list of `{ edge, fwd, start, len, speed, endNode, junction }`, which is how a client maps a route onto
its own lanes. An obstacle's `pos` is metres from node `a` along the edge.

`world-town.js`: the world's plots are `houses`, `flats`, `shops`, `civic`, `park`. Each `park` block becomes a place too. `buildings.json` `worldKinds` deals each plot a
trade in a fixed order, per town, and writes it on the world's own row as `b.use`, so the page draws what the sim plans. Every building but a park gets a plan from `planInterior`
(interior.js), by way of `buildingPlan` in places.js, the one function everybody asks.
