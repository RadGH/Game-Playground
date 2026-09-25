// Loads every JSON data file. Works in the browser (fetch) and in Node (fs) so the simulation
// can run headless in tests and balance sims.

export const DATA_FILES = [
  'materials', 'buildings', 'units', 'enemies', 'research', 'waves', 'campaign', 'maps',
  'ai-templates', 'sprites', 'sfx',
];

export async function loadData(baseUrl = null) {
  const data = {};
  const isNode = typeof window === 'undefined';
  if (isNode) {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const dir = baseUrl || path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..', 'data');
    for (const name of DATA_FILES) {
      const file = path.join(dir, `${name}.json`);
      if (fs.existsSync(file)) data[name] = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } else {
    const base = baseUrl || new URL('../data/', import.meta.url).href;
    await Promise.all(DATA_FILES.map(async (name) => {
      const res = await fetch(`${base}${name}.json`, { cache: 'no-cache' });
      if (res.ok) data[name] = await res.json();
    }));
  }
  return data;
}
