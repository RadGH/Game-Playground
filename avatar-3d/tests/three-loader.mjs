// Node module hooks: resolve the browser import-map names ('three', 'three/addons/...') to the
// vendored copy, so node tests can build Chibi 3 templates. Use: node --import ./avatar-3d/tests/three-register.mjs
import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';
const VENDOR = resolvePath(new URL('.', import.meta.url).pathname, '../../vendor/three/');
export async function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: pathToFileURL(VENDOR + '/three.module.js').href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: pathToFileURL(VENDOR + '/addons/' + specifier.slice('three/addons/'.length)).href, shortCircuit: true };
  return next(specifier, context);
}
