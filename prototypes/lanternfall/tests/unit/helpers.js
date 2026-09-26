import { readFileSync } from 'node:fs';
import { buildMaterials } from '../../js/world/materials.js';
const here = new URL('../../', import.meta.url);
export const loadJson = rel => JSON.parse(readFileSync(new URL(rel, here), 'utf8'));
export const mats = () => buildMaterials(loadJson('data/materials.json'));
