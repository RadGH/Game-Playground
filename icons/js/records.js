import { metadata } from '../data/metadata.js';
import { disc } from './draw.js';

/** Each batch supplies an explicit picture and visual description for each real skill. */
export function defineClass(classId, batch, rows) {
  return rows.map(([id, description, art, tags = []]) => {
    const m = metadata[id];
    if (!m || m.classId !== classId) throw new Error(`Unknown ${classId} icon: ${id}`);
    return Object.freeze({ id, ...m, batch, description,
      categories: Object.freeze([...new Set([...m.categories, ...tags])]), body: disc + art });
  });
}
