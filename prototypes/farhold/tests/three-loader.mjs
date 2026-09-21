// A module resolver hook that makes `import 'three'` work under `node --test`.
//
// The browser resolves the bare specifier through the import map in index.html
// (`"three": "../../vendor/three/three.module.js"`); node has no import map, so every module that
// draws anything has been untestable outside a browser and the node tests have read those files as
// TEXT instead (see `exportedKeys` in tests/poi.test.js). That is fine for checking which keys a
// table has and useless for checking that a geometry actually builds.
//
// Three.js itself loads in node perfectly well — it only touches WebGL when you make a renderer,
// and a `BufferGeometry` is arithmetic. So this points the one bare specifier at the file the
// import map already points it at, and nothing else changes.
//
//   import { register } from 'node:module';
//   register('./three-loader.mjs', import.meta.url);
//   const view = await import('../js/ore-view.js');

const THREE = new URL('../../../vendor/three/three.module.js', import.meta.url).href;
const ADDONS = new URL('../../../vendor/three/addons/', import.meta.url).href;

export function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: THREE, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) {
    return { url: ADDONS + specifier.slice('three/addons/'.length), shortCircuit: true };
  }
  return next(specifier, context);
}
