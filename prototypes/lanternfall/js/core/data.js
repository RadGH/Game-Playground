// Loads and indexes every data file (docs/10 §5.0). Works in the browser (fetch relative to this module)
// and in Node (readFile), so tools and tests share it.
import { buildMaterials } from '../world/materials.js';

export const DATA_FILES = ['materials', 'legend', 'themes'];
const OPTIONAL = ['flames', 'shapes', 'charms', 'knots', 'statuses', 'classes', 'skills', 'progression', 'enemies', 'bosses', 'items', 'affixes', 'loot', 'shops', 'acts', 'npcs', 'trials', 'waves', 'prefabs', 'sprites', 'strings', 'sfx-map'];

export function dataUrl(file) { return new URL(`../../data/${file}.json`, import.meta.url); }
export function roomUrl(rel) { return new URL(`../../rooms/${rel}`, import.meta.url); }

async function readJson(url) {
  if (typeof window === 'undefined') { const { readFile } = await import('node:fs/promises'); return JSON.parse(await readFile(url, 'utf8')); }
  const r = await fetch(url); if (!r.ok) throw new Error(`${url} ${r.status}`); return r.json();
}

export async function loadData() {
  const data = { errors: [] };
  const manifest = await readJson(dataUrl('manifest'));
  await Promise.all(manifest.files.map(async f => {
    try { data[f.replace('-', '_')] = await readJson(dataUrl(f)); }
    catch (e) { if (DATA_FILES.includes(f)) data.errors.push(`${f}: ${e.message}`); }
  }));
  data.mats = buildMaterials(data.materials);
  // index list files by id
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && Array.isArray(v.list) && k !== 'materials') { v.byId = {}; for (const e of v.list) v.byId[e.id] = e; }
  }
  return data;
}

export async function loadRoom(data, id) {
  const index = data.roomIndex || (data.roomIndex = await readJson(roomUrl('index.json')));
  const entry = index.rooms[id] || (index.examples?.[id] ? { file: index.examples[id] } : null); if (!entry) throw new Error(`unknown room ${id}`);
  return readJson(roomUrl(entry.file));
}
export { readJson };
