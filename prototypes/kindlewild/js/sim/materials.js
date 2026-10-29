// Material table: turns data/materials.json into flat typed arrays the rules read in their inner
// loops. PURE (the caller passes the parsed JSON in). Moving a number in the JSON moves the
// behaviour — nothing here hard-codes a material except the few ids the rules name (`M.id.water`).

export function hexRgb(h) {
  const v = parseInt(String(h).slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function compileMaterials(json) {
  const list = json.list;
  const n = list.length;
  if (n > 255) throw new Error('materials: too many rows for a byte');
  const id = {};
  list.forEach((m, i) => {
    if (id[m.id] !== undefined) throw new Error('materials: duplicate id ' + m.id);
    id[m.id] = i;
  });
  if (id.empty !== 0) throw new Error('materials: "empty" must be row 0');
  const ref = (name, row) => {
    if (name === undefined || name === null) return 255;
    if (id[name] === undefined) throw new Error(`materials: ${row.id} refers to unknown material ${name}`);
    return id[name];
  };
  const T = {
    ground: new Uint8Array(n),      // 1 = a floor material
    r: new Uint8Array(n), g: new Uint8Array(n), b: new Uint8Array(n), vary: new Uint8Array(n),
    walk: new Uint8Array(n),        // % speed, 0 = blocked
    hard: new Uint8Array(n),
    solid: new Uint8Array(n),       // blocks liquids and walkers
    flyOver: new Uint8Array(n),     // low things: drawn under creatures, liquids may not enter but flyers ignore
    ignite: new Uint8Array(n),      // temp at which it catches (0 = never)
    fuel: new Uint8Array(n),
    burnsTo: new Uint8Array(n).fill(255),
    burnGround: new Uint8Array(n).fill(255),
    smoke: new Uint8Array(n),
    explode: new Float32Array(n),
    melt: new Uint8Array(n),        // temp at which it melts (0 = never)
    meltTo: new Uint8Array(n).fill(255),
    meltGround: new Uint8Array(n).fill(255),
    freeze: new Uint8Array(n),      // temp at or below which it freezes (0 = never)
    freezeTo: new Uint8Array(n).fill(255),
    boil: new Uint8Array(n),
    hot: new Uint8Array(n),         // always at least this hot
    coolTo: new Uint8Array(n).fill(255),
    coolGround: new Uint8Array(n).fill(255),
    coolTicks: new Uint16Array(n),
    lifeTicks: new Uint16Array(n),
    liquid: new Uint8Array(n),
    flow: new Float32Array(n),
    minFlow: new Uint8Array(n),
    sourceRate: new Float32Array(n),
    sourceAmt: new Uint8Array(n),
    douses: new Uint8Array(n),
    wets: new Uint8Array(n),
    conducts: new Uint8Array(n),
    emit: new Uint8Array(n),
    er: new Float32Array(n), eg: new Float32Array(n), eb: new Float32Array(n),
    hurts: new Uint8Array(n),
    heals: new Uint8Array(n),
    deadly: new Uint8Array(n),
    swim: new Uint8Array(n),
    food: new Uint8Array(n),
    tree: new Uint8Array(n),
    crop: new Uint8Array(n),
    built: new Uint8Array(n),
    roof: new Uint8Array(n),
    shiny: new Uint8Array(n),
    arcane: new Float32Array(n),
    source: new Uint8Array(n).fill(255),
    growsTo: new Uint8Array(n).fill(255),
    slowGrow: new Uint8Array(n),
    wetTo: new Uint8Array(n).fill(255),
    dryTo: new Uint8Array(n).fill(255),
    blastTo: new Uint8Array(n).fill(255),
    pattern: new Uint8Array(n),     // 0 plain, 1 rows, 2 bricks
    flag: {},                       // sparse booleans by name: flag.spreads[m]
  };
  const sparse = ['spreads', 'sprouts', 'spores', 'chill', 'devours', 'corrodes', 'sticky', 'flame', 'slippery',
    'cold', 'confetti', 'dust', 'shatter', 'heatBoost', 'regrow', 'fertile', 'road', 'flowers', 'fireworks'];
  for (const s of sparse) T.flag[s] = new Uint8Array(n);
  list.forEach((m, i) => {
    T.ground[i] = m.layer === 'ground' ? 1 : 0;
    const [r, g, b] = hexRgb(m.color || '#000000');
    T.r[i] = r; T.g[i] = g; T.b[i] = b;
    T.vary[i] = m.var ?? 10;
    T.walk[i] = m.walk ?? (m.layer === 'ground' || i === 0 ? 100 : 0);
    T.hard[i] = m.hard ?? 0;
    T.solid[i] = m.solid ? 1 : 0;
    T.flyOver[i] = m.flyOver ? 1 : 0;
    if (m.ignite) {
      T.ignite[i] = m.ignite;
      T.fuel[i] = Math.min(255, m.fuel ?? 20);
      T.burnsTo[i] = ref(m.burnsTo ?? (m.layer === 'ground' ? 'scorched' : 'empty'), m);
      T.smoke[i] = m.smoke ?? 1;
    }
    T.burnGround[i] = ref(m.burnGround, m);
    T.explode[i] = m.explode ?? 0;
    if (m.melt) { T.melt[i] = m.melt; T.meltTo[i] = ref(m.meltTo, m); }
    T.meltGround[i] = ref(m.meltGround, m);
    if (m.freeze) { T.freeze[i] = m.freeze; T.freezeTo[i] = ref(m.freezeTo, m); }
    T.boil[i] = m.boil ?? 0;
    T.hot[i] = m.hot ?? 0;
    T.coolTo[i] = ref(m.coolTo, m);
    T.coolGround[i] = ref(m.coolGround, m);
    T.coolTicks[i] = m.coolTicks ?? 0;
    T.lifeTicks[i] = m.lifeTicks ?? 0;
    T.liquid[i] = m.liquid ? 1 : 0;
    T.flow[i] = m.flow ?? 0;
    T.minFlow[i] = m.minFlow ?? 1;
    T.sourceRate[i] = m.sourceRate ?? 0.6;
    T.sourceAmt[i] = m.sourceAmt ?? 4;
    T.douses[i] = m.douses ? 1 : 0;
    T.wets[i] = m.wets ? 1 : 0;
    T.conducts[i] = m.conducts ? 1 : 0;
    if (m.emit) {
      T.emit[i] = 1;
      const [er, eg, eb] = hexRgb(m.emit);
      const s = (m.emitStr ?? 1) / 255;
      T.er[i] = er * s; T.eg[i] = eg * s; T.eb[i] = eb * s;
    }
    T.hurts[i] = m.hurts ?? 0;
    T.heals[i] = m.heals ?? 0;
    T.deadly[i] = m.deadly ? 1 : 0;
    T.swim[i] = m.swim ? 1 : 0;
    T.food[i] = m.food ?? 0;
    T.tree[i] = m.tree ? 1 : 0;
    T.crop[i] = m.crop ? 1 : 0;
    T.built[i] = m.built ? 1 : 0;
    T.roof[i] = m.roof ? 1 : 0;
    T.shiny[i] = m.shiny ? 1 : 0;
    T.arcane[i] = m.arcane ?? 0;
    T.source[i] = ref(m.source, m);
    T.growsTo[i] = ref(m.growsTo, m);
    T.slowGrow[i] = m.slowGrow ? 1 : 0;
    T.wetTo[i] = ref(m.wetTo, m);
    T.dryTo[i] = ref(m.dryTo, m);
    T.blastTo[i] = ref(m.blastTo, m);
    T.pattern[i] = m.rows ? 1 : m.bricks ? 2 : 0;
    for (const s of sparse) if (m[s]) T.flag[s][i] = 1;
  });
  // liquids and solids block liquids; low cells (grass tufts, flame) do not block a liquid, it replaces them
  T.blocksLiquid = new Uint8Array(n);
  // (`floats: true` marks a low cell a liquid laps round instead of washing away — bones in a bog)
  for (let i = 1; i < n; i++) T.blocksLiquid[i] = T.solid[i] || T.tree[i] || T.built[i] || list[i].floats ? 1 : 0;
  return { list, id, count: n, ambient: json.ambient, fireTemp: json.fireTemp, fire: json.fire || { heatBase: 2, heatPerFuel: 0.035, wind: 0.55, burnRate: 0.7 }, ...T };
}
