// Asset library loader.
//
// One place to keep the art that more than one game needs: scenery backdrops (full-bleed SVG scenes
// drawn to sit behind 3D characters), map/node icons, and fx sprites (64x64 particles a 3D effects
// layer draws as billboards). Files live in ../data/, indexed by ../data/manifest.json, so a game
// never hard-codes SVG markup again.
//
//   import { Assets } from '../../assets/js/assets.js';
//   const assets = await Assets.open('../../assets/');
//   container.replaceChildren(await assets.sceneryElement('village', { night: false }));
//   const flame = await assets.fxTexture('flame', THREE);   // a THREE.CanvasTexture for a particle
//
// Everything is cached after the first fetch and nothing here throws: a missing id (or a file that
// has not been drawn yet) falls back to a plain gradient scene so a game keeps running.

/** Everything inside the root <svg> of an svg document, as a string. Works without a DOM. */
export function svgInner(text) {
  if (typeof text !== 'string') return '';
  const open = text.indexOf('<svg');
  if (open < 0) return text.trim();
  const gt = text.indexOf('>', open);
  if (gt < 0) return '';
  const close = text.lastIndexOf('</svg>');
  return text.slice(gt + 1, close < 0 ? undefined : close).trim();
}

/** Attributes of the root <svg> as a plain object ({} if there is no root tag). */
export function svgRootAttrs(text) {
  if (typeof text !== 'string') return {};
  const m = text.match(/<svg\b([^>]*)>/i);
  if (!m) return {};
  const attrs = {};
  for (const a of m[1].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"|([\w:-]+)\s*=\s*'([^']*)'/g)) {
    attrs[a[1] || a[3]] = a[2] !== undefined ? a[2] : a[4];
  }
  return attrs;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Dark wash laid over a day scene to make it a night scene. */
export const NIGHT_OVERLAY = '<rect width="100%" height="100%" fill="#060a18" opacity=".62"/>';
/** Used when an id is unknown or its file is missing: a plain sky-to-ground gradient. */
export function fallbackScene(id = 'scene') {
  const gid = 'fb_' + String(id).replace(/[^a-z0-9_-]/gi, '') + '_' + Math.random().toString(36).slice(2, 7);
  return `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#4a5a72"/><stop offset=".62" stop-color="#2d3a4a"/><stop offset=".62" stop-color="#2b3326"/><stop offset="1" stop-color="#1c2119"/>` +
    `</linearGradient></defs><rect width="100%" height="100%" fill="url(#${gid})"/>`;
}

/** Drawn when a particle sprite file is missing: a soft white diamond that still reads as a spark. */
export function fallbackSprite(ctx, size = 128) {
  const c = size / 2, r = size * 0.46;
  const g = ctx.createRadialGradient(c, c, 0, c, c, r);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  ctx.translate(c, c); ctx.rotate(Math.PI / 4); ctx.translate(-c, -c);
  ctx.fillStyle = g; ctx.fillRect(size * 0.06, size * 0.06, size * 0.88, size * 0.88);
  ctx.restore();
  ctx.beginPath(); ctx.moveTo(c, size * 0.04); ctx.lineTo(size * 0.82, c); ctx.lineTo(c, size * 0.96); ctx.lineTo(size * 0.18, c); ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
}

export class Assets {
  /** @param {string} base URL of the assets/ folder (with or without a trailing slash). */
  constructor(base = './', manifest = {}) {
    this.base = base.endsWith('/') ? base : base + '/';
    this.manifest = manifest;
    this.scenerySpecs = manifest.scenery || {};
    this.iconSpecs = manifest.icons || {};
    this.propSpecs = manifest.props || {};
    this.fxSpecs = manifest.fx || {};
    this._files = new Map();   // file path -> Promise<string|null>
    this._scenes = new Map();  // id -> Promise<{ id, inner, attrs, missing }>
    this._icons = new Map();   // type -> Promise<string>
    this._fxCanvas = new Map();  // id|size -> Promise<HTMLCanvasElement>
    this._fxTexture = new Map(); // id|size -> THREE.CanvasTexture
  }

  /** Fetch the manifest and return a ready loader. Never throws: a failed fetch gives an empty library. */
  static async open(base = './') {
    const b = base.endsWith('/') ? base : base + '/';
    let manifest = {};
    try {
      const res = await fetch(b + 'data/manifest.json');
      if (res.ok) manifest = await res.json();
    } catch { /* offline or file:// — fall back to an empty library */ }
    return new Assets(b, manifest);
  }

  /** Raw text of a file under data/, cached. null if it could not be read. */
  async file(path) {
    if (!this._files.has(path)) {
      this._files.set(path, (async () => {
        try {
          const res = await fetch(this.base + 'data/' + path);
          return res.ok ? await res.text() : null;
        } catch { return null; }
      })());
    }
    return this._files.get(path);
  }

  /** Ids of every scene in the manifest. */
  sceneryIds() { return Object.keys(this.scenerySpecs); }
  /** Node types of every icon in the manifest. */
  iconTypes() { return Object.keys(this.iconSpecs); }
  /** Manifest entry for a scene (tags, file, night). */
  sceneryInfo(id) { return this.scenerySpecs[id] || null; }
  /** True when the scene is already drawn as night, so no dark overlay is needed. */
  isNightScene(id) { return !!this.scenerySpecs[id]?.night; }

  /** The manifest section for a kind: 'scenery' (default), 'icons', 'props' or 'fx'. */
  _specs(kind = 'scenery') { return kind === 'icons' ? this.iconSpecs : kind === 'props' ? this.propSpecs : kind === 'fx' ? this.fxSpecs : this.scenerySpecs; }

  /** Scene ids carrying a tag, e.g. listByTag('forest'). */
  listByTag(tag, kind = 'scenery') {
    const specs = this._specs(kind);
    return Object.entries(specs).filter(([, s]) => (s.tags || []).includes(tag)).map(([id]) => id);
  }
  /** Every tag used by the scenery (or icons/props), sorted. */
  tags(kind = 'scenery') {
    const specs = this._specs(kind);
    return [...new Set(Object.values(specs).flatMap(s => s.tags || []))].sort();
  }

  /**
   * One scene: { id, source, inner, attrs, missing }. `inner` is the markup inside the root <svg>,
   * `attrs` the root attributes of the file. A missing id (or file) uses `fallback` if that
   * scene exists, otherwise a plain gradient — this never throws.
   */
  async scenery(id, { fallback = null } = {}) {
    const key = id + '|' + (fallback || '');
    if (!this._scenes.has(key)) this._scenes.set(key, this._loadScene(id, fallback));
    return this._scenes.get(key);
  }

  async _loadScene(id, fallback) {
    const spec = this.scenerySpecs[id];
    const text = spec ? await this.file(spec.file) : null;
    if (text) return { id, source: id, inner: svgInner(text), attrs: svgRootAttrs(text), missing: false };
    if (fallback && fallback !== id && this.scenerySpecs[fallback]) {
      const alt = await this._loadScene(fallback, null);
      return { ...alt, id, missing: alt.missing };
    }
    return { id, source: null, inner: fallbackScene(id), attrs: {}, missing: true };
  }

  /**
   * An <svg> element ready to drop into a container: full size, non-uniform stretch,
   * plus the dark overlay when `night` is asked for and the art is not already a night scene.
   */
  async sceneryElement(id, { night = false, fallback = null } = {}) {
    const scene = await this.scenery(id, { fallback });
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', scene.attrs.viewBox || '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', scene.attrs.preserveAspectRatio || 'none');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.dataset.scene = id;
    if (scene.missing) svg.dataset.missing = '1';
    const dark = night && !this.isNightScene(scene.source);
    svg.innerHTML = scene.inner + (dark ? NIGHT_OVERLAY : '');
    return svg;
  }

  /** Markup inside an icon file (drawn in a -4 -4 8 8 box). '' when unknown or unreadable. */
  async icon(type) {
    if (!this._icons.has(type)) {
      this._icons.set(type, (async () => {
        const spec = this.iconSpecs[type];
        if (!spec) return '';
        const text = await this.file(spec.file);
        return text ? svgInner(text) : '';
      })());
    }
    return this._icons.get(type);
  }

  /** Every icon at once: { combat: '<path …>', … }. Handy at boot. */
  async icons() {
    const types = this.iconTypes();
    const markup = await Promise.all(types.map(t => this.icon(t)));
    return Object.fromEntries(types.map((t, i) => [t, markup[i]]));
  }

  /** An <svg> element for an icon, sized in pixels. */
  async iconElement(type, { size = 16 } = {}) {
    const inner = await this.icon(type);
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '-4 -4 8 8');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.dataset.icon = type;
    svg.innerHTML = inner;
    return svg;
  }
  // ---- particle sprites (fx/) ----------------------------------------------
  // 64×64 transparent SVGs a 3D effects layer draws as billboards. They are rasterized once to a
  // canvas of `size` px and cached; a missing file falls back to a soft diamond so nothing goes blank.

  /** Ids of every particle sprite in the manifest. */
  fxIds() { return Object.keys(this.fxSpecs); }
  /** Manifest entry for a particle sprite ({ file, tags }), or null. */
  fxInfo(id) { return this.fxSpecs[id] || null; }

  /**
   * A particle sprite rasterized onto a square canvas, cached per id+size.
   * Never throws and never returns null: an unknown id or an unreadable file gives the fallback diamond.
   */
  async fxCanvas(id, { size = 128 } = {}) {
    const key = id + '|' + size;
    if (!this._fxCanvas.has(key)) this._fxCanvas.set(key, this._rasterFx(id, size));
    return this._fxCanvas.get(key);
  }

  async _rasterFx(id, size) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const spec = this.fxSpecs[id];
    const text = spec ? await this.file(spec.file) : null;
    if (text) {
      const ok = await new Promise(res => {
        const img = new Image();
        img.onload = () => { try { ctx.drawImage(img, 0, 0, size, size); res(true); } catch { res(false); } };
        img.onerror = () => res(false);
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
      });
      if (ok) return canvas;
    }
    fallbackSprite(ctx, size);
    canvas.dataset.missing = '1';
    return canvas;
  }

  /**
   * A THREE.CanvasTexture of a particle sprite, cached per id+size. Three.js is passed in so this
   * module stays free of a 3D dependency: `await assets.fxTexture('flame', THREE)`.
   */
  async fxTexture(id, THREE, { size = 128 } = {}) {
    const key = id + '|' + size;
    if (this._fxTexture.has(key)) return this._fxTexture.get(key);
    const canvas = await this.fxCanvas(id, { size });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true; tex.name = 'fx:' + id;
    this._fxTexture.set(key, tex);
    return tex;
  }

  /** Every particle sprite as { id: THREE.CanvasTexture }, ready to hand to an effects layer. */
  async fxTextures(THREE, { size = 128, ids = null } = {}) {
    const list = ids || this.fxIds();
    const texes = await Promise.all(list.map(id => this.fxTexture(id, THREE, { size })));
    return Object.fromEntries(list.map((id, i) => [id, texes[i]]));
  }
}

export default Assets;
