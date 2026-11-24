// Spell Kit textures: loads textures/manifest.json, packs every particle sprite and flipbook into ONE atlas (so all
// particles draw in two calls), and keeps rune circles, decals and bands as their own textures.
//
// Every picture is white on black: brightness is both the glow and the see-through amount, and the kit tints it.

const ATLAS = 2048, CELL = 256, CELLS = ATLAS / CELL;   // 8 x 8 = 64 cells

function loadImage(url) {
  return new Promise((ok, fail) => {
    const im = new Image(); im.decoding = 'async'; im.crossOrigin = 'anonymous';
    im.onload = () => ok(im); im.onerror = () => fail(new Error('spellkit: missing texture ' + url)); im.src = url;
  });
}

/**
 * @param THREE three.js namespace
 * @param base  URL of the textures folder (ending in /)
 * @returns { atlas, cells, cellsPerRow, sprite(id) → { cell, frames }, map(id) → THREE.Texture, manifest, dispose() }
 */
export async function loadSpellTextures(THREE, base) {
  const manifest = await fetch(new URL('manifest.json', base)).then(r => r.json());
  const T = manifest.textures;
  const ids = Object.keys(T);
  const imgs = {};
  await Promise.all(ids.map(async id => { imgs[id] = await loadImage(new URL(T[id].file, base).href); }));

  // ---- the particle atlas (flipbooks first so their frames stay together)
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = ATLAS;
  const g = canvas.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, ATLAS, ATLAS);
  const sprites = {};
  let next = 0;
  const pad = 4;
  const put = (img, sx, sy, sw, sh) => {
    if (next >= CELLS * CELLS) throw new Error('spellkit: particle atlas is full');
    const cx = (next % CELLS) * CELL, cy = Math.floor(next / CELLS) * CELL;
    g.drawImage(img, sx, sy, sw, sh, cx + pad, cy + pad, CELL - pad * 2, CELL - pad * 2);
    return next++;
  };
  for (const id of ids.filter(i => T[i].kind === 'flipbook')) {
    const t = T[id], fw = t.w / t.cols, fh = t.h / t.rows;
    const first = next;
    for (let f = 0; f < t.frames; f++) put(imgs[id], (f % t.cols) * fw, Math.floor(f / t.cols) * fh, fw, fh);
    sprites[id] = { cell: first, frames: t.frames };
  }
  for (const id of ids.filter(i => T[i].kind === 'particle')) sprites[id] = { cell: put(imgs[id], 0, 0, T[id].w, T[id].h), frames: 1 };
  // rune circles also usable as particles (halo discs, floating sigils)
  for (const id of ids.filter(i => T[i].kind === 'rune')) sprites[id] = { cell: put(imgs[id], 0, 0, T[id].w, T[id].h), frames: 1 };

  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.NoColorSpace;
  atlas.generateMipmaps = true; atlas.minFilter = THREE.LinearMipmapLinearFilter; atlas.magFilter = THREE.LinearFilter;
  atlas.anisotropy = 1;

  // ---- big textures
  const maps = {};
  for (const id of ids.filter(i => T[i].kind !== 'flipbook')) {   // particles too: a shockwave ring is also a decal
    const tex = new THREE.Texture(imgs[id]);
    tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
    if (T[id].kind === 'band') { tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; }
    else tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    maps[id] = tex;
  }
  const missing = new Set();
  return {
    atlas, cellsPerRow: CELLS, manifest,
    sprite(id) {
      const s = sprites[id];
      if (!s && !missing.has(id)) { missing.add(id); console.warn('spellkit: no particle sprite ' + id); }
      return s || sprites.dot_soft;
    },
    hasSprite: id => !!sprites[id],
    map(id) {
      const m = maps[id];
      if (!m && !missing.has(id)) { missing.add(id); console.warn('spellkit: no texture ' + id); }
      return m || maps.glow_holy;
    },
    ids: () => ({ sprites: Object.keys(sprites), maps: Object.keys(maps) }),
    dispose() { atlas.dispose(); for (const m of Object.values(maps)) m.dispose(); },
  };
}
