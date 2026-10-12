// Where the Armory's rows come from: THE GEAR CATALOG — avatar-3d/data/gear-catalog.json, read through
// avatar-3d/js/gear-catalog.js. Nothing in the Armory lists models by hand: a model with a catalog row is on
// the page, and one without is not (avatar-3d/tests/gear-catalog.test.js fails on a model that has no row).
import { loadGearCatalog, lookFor } from '../../avatar-3d/js/gear-catalog.js';
import { prepareRows } from './model.js';

export async function loadRows() {
  const catalog = await loadGearCatalog();
  const rows = prepareRows(catalog.rows || []);
  return { rows, lookFor, catalog, origin: 'catalog', note: `avatar-3d/data/gear-catalog.json — ${rows.length} models, ${rows.filter(r => r.isNew).length} new this round` };
}
