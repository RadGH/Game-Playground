// Spell Kit data rules, with no three.js import so Node tests and tools can use them too.
// validateVisuals(data, { sprites, maps }) → [problem, …] (empty = fine). The kit runs it at load and warns.

export const LAYER_TYPES = ['emitter', 'flipbook', 'decal', 'shell', 'mesh', 'light', 'shake', 'ribbon', 'trail', 'arc', 'sweep'];
// point: drawn at each point of the spell's true shape (kit.spread); area: once at the real radius
export const PHASES = ['windup', 'release', 'travel', 'impact', 'point', 'area', 'linger', 'aura', 'beam', 'sweep'];
export const KINDS = ['missile', 'ground', 'line', 'nova', 'beam', 'cone', 'melee', 'self', 'shift', 'summon', 'aura'];
export const ANCHORS = ['point', 'ground', 'hands', 'hand_l', 'hand_r', 'caster', 'chest', 'head', 'feet', 'target', 'body', 'missile', 'tip'];
export const SHAPES = ['point', 'sphere', 'disc', 'ring', 'line', 'cylinder'];
export const SHELLS = ['cylinder', 'cone', 'funnel', 'dome', 'sphere'];
export const MESHES = ['spike', 'shard', 'core', 'ring', 'pillar', 'arrow'];
export const SCHOOLS = ['fire', 'ice', 'frost', 'holy', 'nature', 'arcane', 'shadow', 'lightning', 'poison', 'physical', 'bleed', 'blood', 'fel', 'dawn', 'moon', 'haste', 'true'];
const SCHOOL_TEX = ['fire', 'frost', 'holy', 'nature', 'arcane', 'shadow', 'lightning', 'poison'];
const COLOR = /^(hot|mid|deep|smoke|accent|white|black|#[0-9a-f]{6})$/i;

/** the layers of a visual's phase (some phases hold { layers }) */
export function phaseLayers(v, phase) {
  const p = v[phase];
  return Array.isArray(p) ? p : (p && Array.isArray(p.layers) ? p.layers : []);
}

export function validateVisuals(data, tex = null) {
  const out = [];
  const vis = data.visuals || {};
  const texOk = (id, kind) => {
    if (!tex) return true;
    const ids = id.includes('{school}') ? SCHOOL_TEX.map(s => id.replace('{school}', s)) : [id];
    return ids.every(i => (kind === 'sprite' ? tex.sprites : tex.maps).includes(i));
  };
  for (const [id, v] of Object.entries(vis)) {
    if (v.ref) { if (!vis[v.ref]) out.push(`${id}: ref ${v.ref} does not exist`); continue; }
    if (!KINDS.includes(v.kind)) out.push(`${id}: kind ${v.kind} is not one of ${KINDS.join(' ')}`);
    if (v.school && !SCHOOLS.includes(v.school)) out.push(`${id}: school ${v.school} has no palette`);
    if (!PHASES.some(p => phaseLayers(v, p).length)) out.push(`${id}: no layers in any phase`);
    for (const ph of PHASES) phaseLayers(v, ph).forEach((L, i) => {
      const at = `${id}.${ph}[${i}]`;
      const type = L.type || 'emitter';
      if (!LAYER_TYPES.includes(type)) out.push(`${at}: unknown layer type ${type}`);
      if (L.at && !ANCHORS.includes(L.at)) out.push(`${at}: unknown anchor ${L.at}`);
      if (L.shape && type === 'emitter' && !SHAPES.includes(L.shape)) out.push(`${at}: unknown emitter shape ${L.shape}`);
      if (L.shape && type === 'shell' && !SHELLS.includes(L.shape)) out.push(`${at}: unknown shell shape ${L.shape}`);
      if (type === 'mesh' && L.kind && !MESHES.includes(L.kind)) out.push(`${at}: unknown mesh ${L.kind}`);
      for (const t of [L.tex, ...(L.texs || [])].filter(Boolean)) {
        const sprite = type === 'emitter' || type === 'flipbook';
        if (!texOk(t, sprite ? 'sprite' : 'map')) out.push(`${at}: no ${sprite ? 'particle sprite' : 'texture'} ${t}`);
      }
      for (const c of [].concat(L.color ?? [], L.edge ?? [])) if (typeof c === 'string' && !COLOR.test(c)) out.push(`${at}: colour ${c} is not a palette name or #rrggbb`);
      for (const k of ['life', 'size', 'speed']) if (Array.isArray(L[k]) && (L[k].length !== 2 || L[k][0] > L[k][1])) out.push(`${at}: ${k} must be [low, high]`);
      if (type === 'emitter' && !L.rate && !L.burst) out.push(`${at}: an emitter needs rate or burst`);
      if (type === 'emitter' && L.rate && !['windup', 'aura', 'linger', 'travel'].includes(ph) && L.duration == null) out.push(`${at}: a steady emitter in a one-off phase needs a duration`);
    });
    if ((v.kind === 'missile') && !v.travel) out.push(`${id}: a missile needs a travel phase`);
    if (v.kind === 'beam' && !v.beam) out.push(`${id}: a beam needs a beam phase`);
    if (v.kind === 'aura' && !phaseLayers(v, 'aura').length) out.push(`${id}: an aura needs aura layers`);
  }
  for (const [sp, m] of Object.entries(data.spells || {})) {
    const vid = typeof m === 'string' ? m : m.visual;
    if (!vis[vid]) out.push(`spell ${sp}: visual ${vid} does not exist`);
    if (typeof m === 'object' && m.school && !SCHOOLS.includes(m.school)) out.push(`spell ${sp}: school ${m.school} has no palette`);
  }
  for (const [k, vid] of Object.entries(data.fallback || {})) if (!vis[typeof vid === 'string' ? vid : vid.visual]) out.push(`fallback ${k}: visual ${vid} does not exist`);
  return out;
}
