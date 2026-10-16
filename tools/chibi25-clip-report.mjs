// Chibi 2.5 clipping report: every hair x every headwear (hair poking through the hat), every hair (brows covered by
// the fringe), every beard (sinking into the chest) — for v2 and v2.5 side by side.
//   node --import ./avatar-3d/tests/three-register.mjs tools/chibi25-clip-report.mjs [--json out.json] [--hats a,b] [--hairs a,b]
import { writeFileSync } from 'node:fs';
const THREE = await import('three');
const { createChibi2Character } = await import('../avatar-3d/js/chibi2.js');
const { coverMap, poke, tagged, hiddenFromFront } = await import('../avatar-3d/js/chibi25-clip.js');
const { PARTS } = await import('../avatar-2d/js/parts/index.js');
const { CHIBI25_OPTIONS } = await import('../avatar-3d/js/chibi25-options.js');

export const BASE = { body: { skin: '#e7b891', headSize: 0.5 }, eyes: { id: 'round', color: '#3f7f86' }, brows: { id: 'straight' }, top: { id: 'tunic', color: '#4a6a8a' }, held: { id: 'none' }, offhand: { id: 'none' }, cape: { id: 'none' }, decor: { id: 'none' }, accessory: { id: 'none' } };
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };

export async function measure(look) {
  const trace = [];
  const a = await createChibi2Character(look, { trace });
  const head = a.parts.head; head.updateWorldMatrix(true, false);
  const H = a.parts.eyeR.position.y / 0.25;
  const centre = new THREE.Vector3(0, 0.3 * H, 0).applyMatrix4(head.matrixWorld);
  a.dispose();
  return { trace, centre, H };
}
export async function hairHat(hair, hat, v) {
  const look = { ...BASE, hair: { id: hair, color: '#6b4a2a' }, hat: { id: hat, color: '#5a4a7a' }, body: { ...BASE.body, ...(v === 2.5 ? { v: 2.5 } : {}) } };
  const { trace, centre, H } = await measure(look);
  const hats = tagged(trace, 'hat'), hairs = tagged(trace, 'hair');
  if (!hats.length || !hairs.length) return null;
  return poke(hairs, coverMap(hats, centre, { far: true }), centre, { tol: 0.012 * H });   // the OUTERMOST outward-facing hat surface: hair beyond it is outside the hat
}
export async function browsUnderHair(hair, v) {
  const look = { ...BASE, hair: { id: hair, color: '#6b4a2a' }, hat: { id: 'none' }, body: { ...BASE.body, ...(v === 2.5 ? { v: 2.5 } : {}) } };
  const { trace, centre, H } = await measure(look);
  const hairs = tagged(trace, 'hair'), brows = trace.filter(p => p.tag === 'face:brows' || (v !== 2.5 && p.tag === 'face'));
  if (!hairs.length || !brows.length) return null;
  // the brow's own front: vertices in front of the face surface; a brow is HIDDEN where hair lies in front of it
  const front = brows.map(p => ({ ...p, positions: p.positions })).filter(p => p.tag === 'face:brows');
  return front.length ? hiddenFromFront(front, hairs, { tol: 0.003 * H }) : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const hats = arg('--hats')?.split(',') || Object.keys(PARTS.hat).filter(h => h !== 'none');
  const hairs = arg('--hairs')?.split(',') || CHIBI25_OPTIONS.face.hair.ids.filter(h => h !== 'bald');
  const out = { hairHat: {}, brows: {} };
  let worst = [];
  for (const hat of hats) for (const hair of hairs) {
    const r25 = await hairHat(hair, hat, 2.5);
    const r2 = PARTS.hair[hair] && CHIBI25_OPTIONS.face.hair.original.includes(hair) ? await hairHat(hair, hat, 2) : null;
    out.hairHat[hat + '|' + hair] = { v2: r2?.share ?? null, v25: r25?.share ?? null, n25: r25?.poking ?? 0 };
    if (r25 && r25.covered >= 30) worst.push([hat + '|' + hair, r25.share, r25.poking, r2?.share]);
  }
  for (const hair of hairs) out.brows[hair] = { v2: CHIBI25_OPTIONS.face.hair.original.includes(hair) ? (await browsUnderHair(hair, 2))?.share ?? null : null, v25: (await browsUnderHair(hair, 2.5))?.share ?? null };
  worst.sort((a, b) => b[1] - a[1]);
  const mean = k => { const v = Object.values(out.hairHat).map(r => r[k]).filter(x => x != null); return v.reduce((a, b) => a + b, 0) / v.length; };
  console.log(`hair x hat combos: ${worst.length}; mean poke share v2 ${(mean('v2') * 100).toFixed(2)}%  v2.5 ${(mean('v25') * 100).toFixed(2)}%`);
  console.log('worst v2.5:', worst.slice(0, 15).map(([k, s, n, s2]) => `${k} ${(s * 100).toFixed(1)}% (${n}) [v2 ${s2 == null ? '-' : (s2 * 100).toFixed(1) + '%'}]`).join('\n  '));
  console.log('brows hidden by hair (share):', Object.entries(out.brows).map(([k, r]) => `${k} v2 ${r.v2 == null ? '-' : (r.v2 * 100).toFixed(0)}% / v2.5 ${(r.v25 * 100).toFixed(0)}%`).join(', '));
  if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(out, null, 1));
}
