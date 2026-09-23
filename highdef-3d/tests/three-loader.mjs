// A module resolver that points the bare `three` specifier at the copy vendored in this repo, so
// the node tests can load the model kits without a bundler or a package install.
//
// Register it from a test with:
//   import { register } from 'node:module';
//   register('./three-loader.mjs', import.meta.url);
// …before the first dynamic import of anything that imports three.

import { pathToFileURL } from 'node:url';
import { resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const VENDOR = resolvePath(HERE, '..', '..', 'vendor', 'three');

export function resolve(specifier, context, next) {
  if (specifier === 'three') {
    return { url: pathToFileURL(resolvePath(VENDOR, 'three.module.js')).href, shortCircuit: true };
  }
  if (specifier.startsWith('three/addons/')) {
    const rest = specifier.slice('three/addons/'.length);
    return { url: pathToFileURL(resolvePath(VENDOR, 'addons', rest)).href, shortCircuit: true };
  }
  return next(specifier, context);
}
