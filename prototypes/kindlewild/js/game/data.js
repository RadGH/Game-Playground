// Fetch every data file (the browser twin of tests/load.mjs).
const FILES = ['materials', 'reactions', 'creatures', 'spells', 'biomes', 'buildings', 'grimoire', 'discoveries', 'levels', 'icons'];
export async function loadData() {
  const base = new URL('../../data/', import.meta.url);
  const parts = await Promise.all(FILES.map(async (f) => {
    const r = await fetch(new URL(f + '.json', base), { cache: 'no-cache' });
    if (!r.ok) throw new Error('Could not load ' + f);
    return [f, await r.json()];
  }));
  const out = Object.fromEntries(parts);
  // the acts each have their own file
  out.levels = { ...out.levels, acts: await Promise.all(out.levels.acts.map(async (id) => (await fetch(new URL('acts/' + id + '.json', base), { cache: 'no-cache' })).json())) };
  return out;
}
