// Chibi 3 face: morph targets (blend shapes), expressions and lip shapes.
//
// A morph target is a second position for every vertex; the GPU blends toward it by a weight. Chibi 3
// generates its morphs from the face's own landmarks (mouth corners, brows, cheeks, lids) as smooth
// displacement fields, so every race and every face dial gets correct morphs for free — nobody
// sculpts them. The jaw and the upper lids are BONES (jaw rotates open, lids rotate shut); everything
// else is a morph.
//
// Expressions and visemes are just recipes of morph weights + jaw + lid angles (EXPRESSIONS, VISEMES).

export const MORPHS = ['smile', 'frown', 'browUp', 'browDown', 'browSad', 'sneer', 'pucker', 'wide', 'press', 'squint', 'puff'];

/** Expression recipes: morph weights, plus `jaw` (0..1 open) and `lids` (-1 wide .. 1 shut). */
export const EXPRESSIONS = {
  neutral: {},
  happy: { smile: 1, squint: 0.45, browUp: 0.15, jaw: 0.06 },
  grin: { smile: 1, wide: 0.5, squint: 0.6, jaw: 0.18 },
  angry: { browDown: 1, sneer: 0.45, press: 0.5, wide: 0.15, lids: 0.18 },
  rage: { browDown: 1, sneer: 0.9, wide: 0.6, jaw: 0.55, lids: -0.15 },
  sad: { browSad: 1, frown: 0.85, lids: 0.25, press: 0.2 },
  surprised: { browUp: 1, pucker: 0.25, jaw: 0.4, lids: -0.45 },
  afraid: { browSad: 0.7, browUp: 0.6, wide: 0.55, jaw: 0.2, lids: -0.35 },
  disgust: { sneer: 1, browDown: 0.4, frown: 0.35, squint: 0.4 },
  smug: { smile: 0.45, browUp: 0.25, lids: 0.3 },
  pain: { browSad: 0.6, browDown: 0.5, wide: 0.7, squint: 0.8, jaw: 0.25, lids: 0.45 },
  focused: { browDown: 0.35, press: 0.35, lids: 0.15 },
  sleepy: { lids: 0.7, browUp: 0.1 },
};

/** Lip shapes for talking. Letters are grouped the usual way animators group them. */
export const VISEMES = {
  rest: { jaw: 0.02 },
  A: { jaw: 0.55, wide: 0.15 },          // a, h
  E: { jaw: 0.25, wide: 0.6, smile: 0.2 },   // e
  I: { jaw: 0.15, wide: 0.5 },           // i, y
  O: { jaw: 0.38, pucker: 0.7 },         // o
  U: { jaw: 0.14, pucker: 1 },           // u, w, q
  M: { press: 1, jaw: 0 },               // m, b, p
  F: { press: 0.45, jaw: 0.06, frown: 0.15 },   // f, v
  L: { jaw: 0.3, wide: 0.2 },            // l, n, t, d, th
  S: { jaw: 0.08, wide: 0.45, smile: 0.1 },     // s, z, c, k, g, r, j
};
const LETTER = { a: 'A', h: 'A', e: 'E', i: 'I', y: 'I', o: 'O', u: 'U', w: 'U', q: 'U', m: 'M', b: 'M', p: 'M', f: 'F', v: 'F', l: 'L', n: 'L', t: 'L', d: 'L', s: 'S', z: 'S', c: 'S', k: 'S', g: 'S', r: 'S', j: 'S', x: 'S' };

/** Turn text into a timed list of visemes: [{ t (seconds), v }]. Roughly 13 letters a second. */
export function visemeTrack(text, rate = 13) {
  const out = []; let t = 0;
  for (const ch of String(text).toLowerCase()) {
    if (/\s/.test(ch)) { out.push({ t, v: 'rest' }); t += 1.4 / rate; continue; }
    if (/[.,!?;:]/.test(ch)) { out.push({ t, v: 'rest' }); t += 3 / rate; continue; }
    const v = LETTER[ch]; if (!v) continue;
    if (out.length && out[out.length - 1].v === v) { t += 0.6 / rate; continue; }
    out.push({ t, v }); t += 1 / rate;
  }
  out.push({ t, v: 'rest' });
  return out;
}

/**
 * Add the morph attributes to a merged character geometry (positions in bind space).
 * Displacements are in head units, converted to metres.
 */
export function faceMorphs(geometry, R, body) {
  const pos = geometry.attributes.position, n = pos.count, hs = R.hs, headY = R.headY, hz = R.byName.head.pos[2];
  const F = body.F, mw = F.mouthWidth;
  const my = (body.mouth.y - headY) / hs, mz = (body.mouth.z - hz) / hs;
  const ex = Math.abs(R.byName.eyeL.pos[0]) / hs, ey = (R.byName.eyeL.pos[1] - headY) / hs;
  const g = (dx, dy, dz, r) => Math.exp(-(dx * dx + dy * dy + dz * dz) / (r * r));
  const targets = Object.fromEntries(MORPHS.map(m => [m, new Float32Array(n * 3)]));
  const corner = 0.088 * mw;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i) / hs, y = (pos.getY(i) - headY) / hs, z = (pos.getZ(i) - hz) / hs;
    if (y < -0.3 || y > 0.75 || z < -0.05) continue;
    const s = x >= 0 ? 1 : -1, ax = Math.abs(x);
    const set = (m, dx, dy, dz) => { const t = targets[m]; t[i * 3] += dx * hs; t[i * 3 + 1] += dy * hs; t[i * 3 + 2] += dz * hs; };
    const atCorner = g(ax - corner, y - my, z - (mz - 0.01), 0.075);
    const nearMouth = g(x * 0.8, y - my, z - mz, 0.085);
    const upperLip = y > my ? 1 : 0;
    // smile: corners up, out and back; the cheeks ride up and narrow the eyes from below
    set('smile', s * 0.014 * atCorner, 0.02 * atCorner + 0.009 * g(ax - 0.15, y - 0.19, z - 0.2, 0.08), -0.01 * atCorner + 0.004 * g(ax - 0.15, y - 0.19, z - 0.2, 0.08));
    set('frown', s * 0.003 * atCorner, -0.018 * atCorner + 0.006 * g(x, y + 0.09, z - 0.23, 0.06), 0.005 * g(x, y + 0.09, z - 0.23, 0.06));
    // brows: the whole brow up; inner ends down and together; inner ends up (worry)
    const brow = g(0, y - 0.44, 0, 0.07) * (z > 0.12 ? 1 : 0) * Math.max(0, 1 - (ax / 0.3) ** 4);
    set('browUp', 0, 0.024 * brow, 0.002 * brow);
    const inner = g(ax - 0.07, y - 0.44, z - 0.29, 0.075) * (z > 0.12 ? 1 : 0);
    set('browDown', -s * 0.007 * inner, -0.017 * inner, 0.005 * inner);
    set('browSad', 0, 0.018 * inner - 0.004 * g(ax - 0.22, y - 0.43, 0, 0.05) * (z > 0.12 ? 1 : 0), 0);
    // sneer: the upper lip and the nose wings pull up
    const wing = g(ax - 0.05, y - 0.13, z - 0.3, 0.05);
    set('sneer', 0, 0.012 * wing, 0.002 * wing);
    // pucker: lips forward and gathered toward the middle
    set('pucker', -x * 0.4 * nearMouth, (my - y) * 0.2 * nearMouth, 0.03 * nearMouth);
    set('wide', s * 0.016 * atCorner, 0.001 * atCorner, -0.006 * atCorner);
    // press: lips together and thinned
    const lip = g(x * 0.7, y - my, z - mz, 0.05);
    set('press', 0, (upperLip ? -0.007 : 0.008) * lip, -0.003 * lip);
    // squint: the lower lid rises
    set('squint', 0, 0.008 * g(ax - ex, y - (ey - 0.05), z - 0.29, 0.04), 0);
    set('puff', s * 0.02 * g(ax - 0.13, y - 0.1, z - 0.2, 0.07), 0, 0.006 * g(ax - 0.13, y - 0.1, z - 0.2, 0.07));
  }
  geometry.morphAttributes.position = MORPHS.map(m => { const a = new geometry.attributes.position.constructor(targets[m], 3); a.name = m; return a; });
  geometry.morphTargetsRelative = true;
}
