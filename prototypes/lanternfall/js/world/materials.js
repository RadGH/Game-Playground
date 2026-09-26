// data/materials.json -> flat typed lookup tables indexed by material id (docs/06 §5.3).
// Inner loops read these arrays, never the JSON objects.
import { hexToRgb } from '../core/math.js';

export const CLS = { EMPTY: 0, STATIC: 1, POWDER: 2, LIQUID: 3, GAS: 4, FIRE: 5 };
const CLS_BY_NAME = { empty: 0, static: 1, powder: 2, liquid: 3, gas: 4, fire: 5 };
const SUPPORT = { none: 0, island: 1, span: 2, hang: 3 };
export const RESIST_KINDS = ['blast', 'cut', 'heat', 'acid', 'crush'];

/** Material id constants, filled by buildMaterials (M.WATER etc.). */
export const M = {};

export function buildMaterials(json) {
  const N = 256, list = json.list;
  const t = {
    list, byKey: {}, count: list.length,
    cls: new Uint8Array(N), density: new Float32Array(N), hp: new Uint8Array(N), flam: new Uint8Array(N),
    meltAt: new Int16Array(N).fill(32767), meltTo: new Uint8Array(N), freezeAt: new Int16Array(N).fill(-32768), freezeTo: new Uint8Array(N),
    boilAt: new Int16Array(N).fill(32767), boilTo: new Uint8Array(N), igniteAt: new Int16Array(N).fill(32767),
    burnRate: new Uint8Array(N), transmit: new Float32Array(N), conduct: new Float32Array(N).fill(0.05),
    dispersion: new Uint8Array(N), repose: new Uint8Array(N), lifeMin: new Uint16Array(N), lifeMax: new Uint16Array(N),
    support: new Uint8Array(N), span: new Uint8Array(N), emit: new Float32Array(N * 4), temp0: new Int16Array(N).fill(12),
    brokenTo: new Uint8Array(N), burnsTo: [], hurt: [], slow: new Float32Array(N).fill(1), climbable: new Uint8Array(N),
    alpha: new Float32Array(N).fill(1), absorb: new Float32Array(N), reflect: new Float32Array(N), friction: new Float32Array(N).fill(1),
    resist: RESIST_KINDS.map(() => new Float32Array(N).fill(1)), ramps: [],
  };
  for (const m of list) t.byKey[m.key] = m.id;
  const id = k => (k == null ? 0 : (t.byKey[k] ?? 0));
  for (const m of list) {
    const i = m.id; M[m.key.toUpperCase()] = i;
    t.cls[i] = CLS_BY_NAME[m.cls] ?? 0; t.density[i] = m.density ?? 1; t.hp[i] = m.hp ?? 0; t.flam[i] = m.flam ?? 0;
    if (m.meltAt != null) { t.meltAt[i] = m.meltAt; t.meltTo[i] = id(m.meltTo); }
    if (m.freezeAt != null) { t.freezeAt[i] = m.freezeAt; t.freezeTo[i] = id(m.freezeTo); }
    if (m.boilAt != null) { t.boilAt[i] = m.boilAt; t.boilTo[i] = id(m.boilTo); }
    if (m.igniteAt != null) t.igniteAt[i] = m.igniteAt;
    t.burnRate[i] = m.burnRate ?? 4; t.transmit[i] = m.transmit ?? (m.cls === 'empty' ? 1 : m.cls === 'gas' || m.cls === 'fire' ? 0.9 : 0);
    if (m.conduct != null) t.conduct[i] = m.conduct;
    t.dispersion[i] = m.dispersion ?? 0; t.repose[i] = m.repose ?? 1;
    t.lifeMin[i] = m.lifeMin ?? 0; t.lifeMax[i] = m.lifeMax ?? 0;
    t.support[i] = SUPPORT[m.support ?? 'none']; t.span[i] = m.span ?? 0;
    if (m.emit) { const c = hexToRgb(m.emit.color); t.emit.set([c[0] / 255, c[1] / 255, c[2] / 255, m.emit.power], i * 4); }
    if (m.temp != null) t.temp0[i] = m.temp;
    t.brokenTo[i] = m.brokenTo ? id(m.brokenTo) : i;
    t.burnsTo[i] = (m.burnsTo || []).map(b => ({ to: id(b.to), p: b.p }));
    t.hurt[i] = m.hurt || null; if (m.slow) t.slow[i] = m.slow; t.climbable[i] = m.climbable ? 1 : 0;
    if (m.alpha != null) t.alpha[i] = m.alpha; t.absorb[i] = m.absorb ?? 0.1; t.reflect[i] = m.reflect ?? 0;
    if (m.friction != null) t.friction[i] = m.friction;
    if (m.resist) RESIST_KINDS.forEach((k, j) => { if (m.resist[k] != null) t.resist[j][i] = m.resist[k]; });
    t.ramps[i] = (m.ramp || ['#ff00ff']).map(hexToRgb);
  }
  t.id = id;
  return t;
}
