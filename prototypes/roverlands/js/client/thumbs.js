// Small pictures of vehicles for the phone's Garage and the Dealer (Expansion 1 M4): each one is the real model
// (js/client/models/<id>.js), drawn once from three-quarters front into an offscreen target of the game's own renderer
// and kept as a data: URL for the rest of the visit. One picture at a time, between frames, so opening the Dealer never
// stalls the game. A vehicle whose model cannot be built gets null (the phone draws a colour card instead).
//
//   const thumbs = createThumbs({ THREE, renderer, defs });   thumbs.get(id) -> Promise<dataURL | null>
import { buildModel } from './models/index.js';

const SIZE = 192;

export function createThumbs({ THREE, renderer, defs }) {
  const defOf = Object.fromEntries((defs || []).map(d => [d.id, d]));
  const done = new Map(), queue = [];
  let busy = false, target = null, scene = null, camera = null;
  function setup() {
    if (scene) return;
    target = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4 });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#e6f0ff', '#5b4a35', 2.0));
    const sun = new THREE.DirectionalLight('#fff3dc', 2.4); sun.position.set(4, 7, 5); scene.add(sun);
    camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
  }
  async function draw(id) {
    const def = defOf[id]; if (!def) return null;
    setup();
    let model;
    try { model = await buildModel(THREE, def, { enhance: m => m }); } catch { return null; }
    const g = model.group; scene.add(g);
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const r = Math.max(s.x, s.y, s.z) * 0.62 + 0.1, d = r / Math.tan((camera.fov * Math.PI / 180) / 2);
    // three-quarters from the front left (vehicles face +z), a little above
    camera.position.set(c.x + d * 0.62, c.y + d * 0.38, c.z + d * 0.68); camera.lookAt(c);
    const prevTarget = renderer.getRenderTarget(), prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(target); renderer.setClearColor('#000000', 0); renderer.clear();
    renderer.render(scene, camera);
    const px = new Uint8Array(SIZE * SIZE * 4);
    renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, px);
    renderer.setRenderTarget(prevTarget); renderer.setClearColor(prevClear, prevAlpha);
    scene.remove(g);
    g.traverse(o => { o.geometry?.dispose?.(); });
    // the target's rows are bottom-up
    const cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) img.data.set(px.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  }
  async function pump() {
    if (busy) return; busy = true;
    while (queue.length) {
      const { id, res } = queue.shift();
      let url = null; try { url = await draw(id); } catch (e) { console.warn('[roverlands] thumb', id, e?.message || e); }
      res(url);
      await new Promise(r => setTimeout(r, 16));
    }
    busy = false;
  }
  return {
    get(id) {
      if (!done.has(id)) done.set(id, new Promise(res => { queue.push({ id, res }); pump(); }));
      return done.get(id);
    },
  };
}
