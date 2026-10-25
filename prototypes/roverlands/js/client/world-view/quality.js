// Quality presets for the Roverlands world view. Every number that costs frames lives here.
//
// 'low' is for phones: one shadow cascade, no grass, no light shafts or bloom, small textures, short draw distances.
// 'medium' is the default on a desktop and is budgeted at ~250 draw calls (shadow passes included).

export const PRESETS = {
  low: {
    label: 'Low', pixelRatio: 1, msaa: 0, smaa: false,
    shadows: true, shadowMapSize: 1024, cascades: 1, shadowDistance: 60,
    bloom: false, bloomStrength: 0.02, godRays: false, stars: 300,
    textureSize: 256, anisotropy: 2,
    terrainViewDistance: 560, terrainLod: [120, 260, 480],
    grass: false, grassDistance: 0, grassDensity: 0,
    treeNear: 45, treeMid: 120, treeDistance: 330, treeShadowLod: 0,
    decorDistance: 30, propDistance: 160,
    trackSegments: 1500, particles: 250,
  },
  medium: {
    label: 'Medium', pixelRatio: 1, msaa: 4, smaa: false,
    shadows: true, shadowMapSize: 2048, cascades: 2, shadowDistance: 140,
    bloom: true, bloomStrength: 0.02, godRays: true, stars: 900,
    textureSize: 512, anisotropy: 8,
    terrainViewDistance: 760, terrainLod: [150, 320, 560],
    grass: true, grassDistance: 46, grassDensity: 0.5,
    treeNear: 75, treeMid: 190, treeDistance: 520, treeShadowLod: 0,
    decorDistance: 55, propDistance: 260,
    trackSegments: 3000, particles: 500,
  },
  high: {
    label: 'High', pixelRatio: 1, msaa: 4, smaa: true,
    shadows: true, shadowMapSize: 2048, cascades: 3, shadowDistance: 220,
    bloom: true, bloomStrength: 0.02, godRays: true, stars: 1600,
    textureSize: 512, anisotropy: 16,
    terrainViewDistance: 1000, terrainLod: [190, 400, 700],
    grass: true, grassDistance: 72, grassDensity: 0.9,
    treeNear: 80, treeMid: 210, treeDistance: 760, treeShadowLod: 1,
    decorDistance: 85, propDistance: 380,
    trackSegments: 4500, particles: 800,
  },
};

export function resolveQuality(name) {
  const key = PRESETS[name] ? name : 'medium';
  return { name: key, ...PRESETS[key] };
}

/** A conservative guess: phones get low, everything else medium. */
export function detectQuality() {
  const mobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  return mobile ? 'low' : 'medium';
}
