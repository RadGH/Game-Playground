// House Kit — Kenney's flat palette, repainted (moved here from Oathwild's town-draw.js, 2026-11-26). The houses no
// longer use it (they are laid on the Codex texture atlas, js/build.js); Oathwild's bridge newels and lantern posts
// still do (render/bridge-draw.js imports these through town-draw.js), so it is kept exactly as it was.
//
// Every Kenney piece samples one small palette picture. Its top quarter is empty, so we paint our own swatches there
// (plasters, roof colours, stones) and move texture coordinates onto the swatch wanted.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ROOT = new URL('../../', import.meta.url);                 // the playground folder
const KIT = { town: 'assets/kenney/fantasy-town/', survival: 'assets/kenney/survival/' };
const loader = new GLTFLoader();

// column → colour; row 0 (v 0..0.25 in glTF texture space, the picture's top quarter)
export const SWATCH = {
  plaster: ['#e9dcbf', '#dcbd84', '#e8d2c4', '#cfcac0'],   // cream, ochre, rose-white, grey wash
  roof: ['#9c4f39', '#6b7584', '#71503a', '#b39457'],      // terracotta, slate, shingle, straw thatch
  stone: 8, stoneDark: 9, timberDark: 10, timber: 11, soil: 12, leaf: 13, cloth: 14, water: 15,
};
const EXTRA = { 8: '#9b9285', 9: '#6e675e', 10: '#7a5638', 11: '#936c47', 12: '#5e4631', 13: '#5d7c39', 14: '#9b3b33', 15: '#5f93b4' };
export function kenneyPalette(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const cw = img.width / 16, rh = img.height / 4;
  const cols = [...SWATCH.plaster, ...SWATCH.roof]; for (const [k, v] of Object.entries(EXTRA)) cols[+k] = v;
  cols.forEach((hex, i) => {
    if (!hex) return;
    const base = new THREE.Color(hex);
    const g = x.createLinearGradient(0, 0, 0, rh);
    g.addColorStop(0, '#' + base.clone().offsetHSL(0, -0.02, 0.07).getHexString());
    g.addColorStop(1, '#' + base.clone().offsetHSL(0, 0.03, -0.09).getHexString());
    x.fillStyle = g; x.fillRect(i * cw, 0, cw / 2, rh);
    const g2 = x.createLinearGradient(0, 0, 0, rh);
    g2.addColorStop(0, '#' + base.clone().offsetHSL(0.006, -0.03, 0.03).getHexString());
    g2.addColorStop(1, '#' + base.clone().offsetHSL(0.006, 0.02, -0.13).getHexString());
    x.fillStyle = g2; x.fillRect(i * cw + cw / 2, 0, cw / 2, rh);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}

const pieceCache = new Map();
/** A Kenney piece merged into one geometry (position, normal, uv on the kit palette). */
export async function kenneyPiece(kit, id) {
  const key = kit + id;
  if (!pieceCache.has(key)) pieceCache.set(key, loader.loadAsync(new URL(KIT[kit] + id + '.glb', ROOT).href).then(g => {
    g.scene.updateMatrixWorld(true);
    const parts = [];
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      let geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (geo.index) geo = geo.toNonIndexed();
      if (!mats[0]?.map) return;
      for (const n of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(n)) geo.deleteAttribute(n);
      parts.push(geo);
    });
    if (!parts.length) return null;
    const m = parts.length > 1 ? mergeGeometries(parts) : parts[0];
    m.userData.texture = null;
    return m;
  }).catch(() => null));
  return pieceCache.get(key);
}
export async function kenneyPaletteImage(kit) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = new URL(KIT[kit] + 'Textures/colormap.png', ROOT).href; });
}
