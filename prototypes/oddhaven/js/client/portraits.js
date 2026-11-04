// Faces (M7). A premade's face is a real render of their 3D body, baked once (tools/bake-portraits.mjs writes data/portraits/), so the
// gallery costs a phone nothing. Someone you made, or your own household, gets one rendered here: one at a time, off the frame, on
// the game's own renderer and context, kept in this device's storage by the look so it is never drawn twice.
// Until a face is ready the 2D paper-doll picture stands in. `avatar-3d/js/chibi2.js` builds the body.
import { createChibi2Character, prepareChibi2 } from '../../../../avatar-3d/js/chibi2.js';
import { faceKey } from './design.js';

export { faceKey };

export const FACE_SIZE = 96;
const STORE = 'oddhaven.face.', ANIMS = ['idle'], KEEP = 40;
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } } };

export function createPortraits({ THREE, renderer }) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(24, 1, 0.05, 20);
  scene.add(new THREE.HemisphereLight('#f2f6ff', '#8a8068', 2.1));
  const sun = new THREE.DirectionalLight('#fff4e4', 1.8); sun.position.set(1.2, 2, 3); scene.add(sun);
  let busy = null, made = 0;
  const memo = new Map(), head = new THREE.Vector3();
  const targets = new Map();
  const targetOf = size => { let t = targets.get(size); if (!t) targets.set(size, t = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace, samples: 2 })); return t; };

  /** A picture of someone: `head` for a face, else the whole body (the contact sheets). */
  async function draw(avatar, { size = FACE_SIZE, whole = false } = {}) {
    await prepareChibi2(avatar, { anims: ANIMS, v25: true, v26: true, budget: 8, slice: () => new Promise(r => setTimeout(r, 0)) });
    const actor = await createChibi2Character(avatar, { anims: ANIMS, v25: true, v26: true });
    scene.add(actor.group); actor.update(0.01); actor.group.updateMatrixWorld(true);
    const bone = actor.parts.head; bone.getWorldPosition(head);
    const H = actor.parts.eyeR.position.y / 0.25;          // a head's size, as chibi2 itself measures it
    head.y += 0.3 * H;
    if (whole) { const tall = actor.metrics().height, far = tall * 1.25 / (2 * Math.tan(12 * Math.PI / 180)); head.set(0, tall * 0.52, 0); camera.position.set(far * 0.25, tall * 0.62, far); } else camera.position.set(head.x + 0.05 * H, head.y + 0.03 * H, head.z + 3.2 * H);
    camera.lookAt(head); camera.updateMatrixWorld();
    const target = targetOf(size), pixels = new Uint8Array(size * size * 4);
    const was = renderer.getRenderTarget(), alpha = renderer.getClearAlpha(), col = renderer.getClearColor(new THREE.Color()), tone = renderer.toneMapping;
    renderer.setRenderTarget(target); renderer.setClearColor('#000000', 0); renderer.toneMapping = THREE.NoToneMapping; renderer.clear(); renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    renderer.setRenderTarget(was); renderer.setClearColor(col, alpha); renderer.toneMapping = tone;
    scene.remove(actor.group); actor.dispose();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const x = canvas.getContext('2d'), img = x.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    x.putImageData(img, 0, 0);
    if (whole) return canvas;
    made++;
    return canvas.toDataURL('image/webp', 0.86);
  }
  const self = {
    get made() { return made; },
    /** The whole body on a canvas: tests only. */
    body: (avatar, size) => draw(avatar, { size, whole: true }),
    /** The face if it is known already, else null (and `shot` will get it). */
    known(avatar) { const k = faceKey(avatar); return memo.get(k) ?? ((v => { if (v) memo.set(k, v); return v; })(ls.get(STORE + k))); },
    /** Render a face, one at a time. */
    shot(avatar) {
      const k = faceKey(avatar), have = self.known(avatar);
      if (have) return Promise.resolve(have);
      const job = (busy ?? Promise.resolve()).catch(() => {}).then(async () => {
        const url = await draw(avatar); memo.set(k, url);
        // a device keeps the last few dozen, oldest out first
        const list = JSON.parse(ls.get(STORE + 'list') || '[]'); list.push(k);
        while (list.length > KEEP) { try { localStorage.removeItem(STORE + list.shift()); } catch { /* private window */ } }
        ls.set(STORE + k, url); ls.set(STORE + 'list', JSON.stringify(list));
        return url;
      });
      busy = job;
      return job;
    },
  };
  return self;
}
