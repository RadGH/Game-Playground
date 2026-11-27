// Oathwild's tree numbers now live in the Tree Kit (treekit/data/species.json, read by treekit/js/species.js). This file
// keeps the old names for older imports and tests: STORY_TREES[id] is the flat row the builder reads (form, h, rB, rT,
// crownR, …), STORY_LOD the detail levels. Change a tree on treekit/index.html or with treekit/tools/tree-edit.mjs.
import { SPECIES, DATA, rowOf } from '../../../../../treekit/js/species.js';

export const STORY_TREES = new Proxy({}, {
  get: (_, id) => (typeof id === 'string' && SPECIES[id] ? rowOf(SPECIES[id]) : undefined),
  has: (_, id) => Object.prototype.hasOwnProperty.call(SPECIES, id),
  ownKeys: () => Object.keys(SPECIES),
  getOwnPropertyDescriptor: (_, id) => (SPECIES[id] ? { enumerable: true, configurable: true, value: rowOf(SPECIES[id]) } : undefined),
});
export const STORY_LOD = DATA.detail;
