// Material table: turns data/materials.json into flat typed arrays the cell rules read in their
// inner loops. PURE (no fetch: the caller passes the parsed JSON in).
//
// Every rule that asks "what is this cell?" goes through these arrays, so moving a number in the
// JSON moves the behaviour (the odd-knob tests rely on it).

export const SHADES = ['ground', 'plant', 'tree', 'rock', 'ore', 'crystal', 'shallow', 'deep', 'ice', 'lava',
  'glass', 'rubble', 'mud', 'wall', 'cliff', 'lamp'];

/**
 * Compile the material rows. `ambient` is the planet's ambient temperature byte (defaults to the
 * file's). Returns { list, byId, id: {name: index}, count, ...typed tables, rules }.
 */
export function compileMaterials(json, ambient = json.ambient) {
  const list = json.list;
  const n = list.length;
  if (n > 256) throw new Error('materials: more than 256 rows do not fit in a cell byte');
  const id = {};
  list.forEach((m, i) => {
    if (id[m.id] !== undefined) throw new Error('materials: duplicate id ' + m.id);
    id[m.id] = i;
  });
  const ref = (name, row) => {
    if (name === undefined || name === null) return 255;
    if (id[name] === undefined) throw new Error(`materials: ${row.id} refers to unknown material ${name}`);
    return id[name];
  };
  const fire = json.fire;
  const top = fire.igniteTop;
  const T = {
    walk: new Uint8Array(n),        // 0 = blocked, else % speed
    vehicle: new Uint8Array(n),
    relief: new Uint8Array(n),
    shade: new Uint8Array(n),
    flammable: new Uint8Array(n),
    igniteTicks: new Uint16Array(n),
    gain: new Uint8Array(n),        // temp rise per 4 heat
    igniteAt: new Uint8Array(n),    // temp at which it catches
    fuel: new Uint8Array(n),
    burnsTo: new Uint8Array(n).fill(255),
    smoke: new Uint8Array(n),
    ashSmoke: new Uint8Array(n),
    blast: new Uint8Array(n).fill(255),
    blastRing: new Uint8Array(n).fill(255),
    freeze: new Uint8Array(n).fill(255),
    melt: new Uint8Array(n).fill(255),
    water: new Uint8Array(n),
    conducts: new Uint8Array(n),
    emits: new Uint8Array(n),
    hot: new Uint8Array(n),         // a material that is always this hot (lava)
    regrow: new Uint8Array(n).fill(255),
    regrowTicks: new Uint32Array(n),
    mud: new Uint8Array(n).fill(255),
    dry: new Uint8Array(n).fill(255),
    ore: new Uint8Array(n),         // 1 if an ore cell
    amtLo: new Uint8Array(n),
    amtHi: new Uint8Array(n),
  };
  list.forEach((m, i) => {
    T.walk[i] = m.walk ?? 100;
    T.vehicle[i] = m.vehicle ? 1 : 0;
    T.relief[i] = m.relief ?? 0;
    const s = SHADES.indexOf(m.shade || 'ground');
    if (s < 0) throw new Error('materials: unknown shade ' + m.shade);
    T.shade[i] = s;
    if (m.ignite) {
      if (m.ignite > top - ambient) throw new Error(`materials: ${m.id} ignite ${m.ignite} is longer than the temperature byte can count (${top - ambient})`);
      T.flammable[i] = 1;
      T.igniteTicks[i] = m.ignite;
      const g = Math.max(1, Math.floor((top - ambient) / m.ignite));
      T.gain[i] = g;
      T.igniteAt[i] = ambient + g * m.ignite;
      T.fuel[i] = Math.min(255, m.fuel ?? 30);
      T.burnsTo[i] = ref(m.burnsTo ?? 'scorched', m);
      T.smoke[i] = m.smoke ?? 2;
      T.ashSmoke[i] = m.ashSmoke ?? 0;
    }
    T.blast[i] = ref(m.blast, m);
    T.blastRing[i] = ref(m.blastRing, m);
    T.freeze[i] = ref(m.freeze, m);
    T.melt[i] = ref(m.melt, m);
    T.water[i] = m.water ? 1 : 0;
    T.conducts[i] = m.conducts ? 1 : 0;
    T.emits[i] = m.emit ? 1 : 0;
    T.hot[i] = m.hot ?? 0;
    T.regrow[i] = ref(m.regrow, m);
    T.regrowTicks[i] = m.regrowTicks ?? 0;
    T.mud[i] = ref(m.mud, m);
    T.dry[i] = ref(m.dry, m);
    T.ore[i] = m.ore ? 1 : 0;
    if (m.amt) { T.amtLo[i] = m.amt[0]; T.amtHi[i] = m.amt[1]; }
  });
  return { list, id, count: n, ambient, rules: json, ...T };
}

/** Map a temperature byte to degrees C on the file's curve (for readouts; not used by rules). */
export function tempToC(json, t) {
  const c = json.tempCurve;
  for (let i = 1; i < c.length; i++) {
    if (t <= c[i][0]) {
      const [t0, c0] = c[i - 1], [t1, c1] = c[i];
      return c0 + ((t - t0) * (c1 - c0)) / (t1 - t0);
    }
  }
  return c[c.length - 1][1];
}

/** Parse "#rrggbb" to [r,g,b] 0-255. */
export function hexRgb(h) {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
