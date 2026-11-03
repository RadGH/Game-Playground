// The data bundle: what createSim needs from data/*.json. Pass it in; the sim itself never touches the network or disk.

export const DATA_FILES = ['balance', 'actions', 'buildings', 'jobs', 'people', 'premades', 'wiring', 'stir', 'stories', 'social', 'law', 'monsters'];

/** Fetch the bundle (Worker, page). `base` = URL of the data folder, ending in a slash. */
export async function fetchData(base) {
  const out = {};
  await Promise.all(DATA_FILES.map(async f => { out[f] = await (await fetch(new URL(`${f}.json`, base))).json(); }));
  return out;
}

/** Deep copy with some values replaced: { economy: { billsBase: 7 } }. Used by tests and by world settings. */
export function withKnobs(data, knobs) {
  const merge = (a, b) => {
    const o = { ...a };
    for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k] || {}, v) : v;
    return o;
  };
  return { ...data, balance: merge(data.balance, knobs) };
}
