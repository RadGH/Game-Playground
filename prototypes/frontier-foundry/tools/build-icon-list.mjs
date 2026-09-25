// Rewrites js/ui/icon-list.js from whatever is in assets/data/icons/foundry/.
// Run it after adding or renaming icon art:  node prototypes/frontier-foundry/tools/build-icon-list.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '../../../assets/data/icons/foundry');
const out = path.join(here, '../js/ui/icon-list.js');
const names = fs.readdirSync(dir).filter(f => f.endsWith('.svg')).map(f => f.replace('.svg', '')).sort();
fs.writeFileSync(out, `// Generated from assets/data/icons/foundry/ - regenerate with tools/build-icon-list.mjs.
// Having the list in code means the interface never asks the server for an icon that is not there,
// so a missing piece of art falls back to its category glyph instead of logging a 404.
export const ICON_FILES = new Set(${JSON.stringify(names)});
`);
console.log(`icon-list.js: ${names.length} icons`);
