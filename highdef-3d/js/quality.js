// Quality presets.
//
// One object per preset holding every number that costs frames. Nothing else in the experiment
// hard-codes a view distance or a shadow map size — it all comes from here, so switching preset
// actually switches everything rather than most things.

export const PRESETS = {
  low: {
    label: 'Low',
    pixelRatio: 1.0,
    msaa: 0,
    shadowMapSize: 1024,
    cascades: 2,
    shadowDistance: 110,
    bloom: true, bloomStrength: 0.30,
    godRays: false,
    ssao: false,
    dof: false,
    smaa: false,
    terrainViewDistance: 460,
    terrainChunk: 64,
    grass: false,
    grassDistance: 0,
    grassDensity: 0,
    treeDistance: 260,
    treeDensity: 0.45,
    propDensity: 0.35,
    detailDistance: 45,
    stars: 700,
    anisotropy: 4,
    textureSize: 512,
  },
  medium: {
    label: 'Medium',
    pixelRatio: 1.0,
    msaa: 4,
    shadowMapSize: 2048,
    cascades: 3,
    shadowDistance: 180,
    bloom: true, bloomStrength: 0.36,
    godRays: true,
    ssao: false,
    dof: false,
    smaa: true,
    terrainViewDistance: 620,
    terrainChunk: 64,
    grass: true,
    grassDistance: 58,
    grassDensity: 0.55,
    treeDistance: 420,
    treeDensity: 0.75,
    propDensity: 0.7,
    detailDistance: 70,
    stars: 1400,
    anisotropy: 8,
    textureSize: 512,
  },
  high: {
    label: 'High',
    pixelRatio: 1.0,
    msaa: 4,
    shadowMapSize: 2048,
    cascades: 4,
    shadowDistance: 260,
    bloom: true, bloomStrength: 0.42,
    godRays: true,
    ssao: true,
    dof: false,
    smaa: true,
    terrainViewDistance: 780,
    terrainChunk: 64,
    grass: true,
    grassDistance: 82,
    grassDensity: 1.0,
    treeDistance: 560,
    treeDensity: 1.0,
    propDensity: 1.0,
    detailDistance: 95,
    stars: 1800,
    anisotropy: 16,
    textureSize: 1024,
  },
  ultra: {
    label: 'Ultra',
    pixelRatio: 1.35,
    msaa: 8,
    shadowMapSize: 4096,
    cascades: 4,
    shadowDistance: 340,
    bloom: true, bloomStrength: 0.46,
    godRays: true,
    ssao: true,
    dof: true,
    smaa: true,
    terrainViewDistance: 1100,
    terrainChunk: 64,
    grass: true,
    grassDistance: 110,
    grassDensity: 1.5,
    treeDistance: 760,
    treeDensity: 1.25,
    propDensity: 1.3,
    detailDistance: 130,
    stars: 2600,
    anisotropy: 16,
    textureSize: 1024,
  },
};

/**
 * Guess a starting preset from what the machine looks like. Deliberately conservative: it is much
 * nicer to open on Medium and be told you can turn it up than to open on Ultra at nine frames a
 * second and conclude the whole thing is broken.
 */
export function detectPreset() {
  const dpr = (typeof devicePixelRatio === 'number') ? devicePixelRatio : 1;
  const mem = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 4;
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  const mobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  if (mobile) return 'low';
  if (mem >= 8 && cores >= 12) return 'high';
  if (mem >= 8 && cores >= 8) return 'high';
  if (cores >= 4) return 'medium';
  void dpr;
  return 'low';
}

/** Merge a preset with any per-knob overrides the HUD has set. */
export function resolveQuality(name, overrides = {}) {
  const base = PRESETS[name] || PRESETS.medium;
  return { name, ...base, ...overrides };
}
