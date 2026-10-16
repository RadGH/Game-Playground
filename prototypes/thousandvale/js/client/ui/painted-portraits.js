// Graphics pass 2026-10-16 (G-PROPS) — PAINTED portraits in the unit / target frames (the owner's reference: a painted 2D
// head in the frame). Two halves:
//
//   * PAINTED ART for whatever is not a player: a monster by its id (Vharlen's own beasts), else by its body type
//     (wolf, spider, golem…), a humanoid enemy by its family (brigand, cultist, cursed knight, goblin, orc, undead, giant,
//     slagborn), and a HUMAN townsperson by their role (guard, merchant, smith, innkeeper…; a role with no picture of its
//     own borrows its nearest trade). Pictures are Codex-painted, 192 px webp in assets/portraits/ (tools/portraits.sh);
//     the list of what exists is assets/portraits/index.json, so a missing picture simply falls back to the live / 2D one.
//     An elf or dwarf NPC keeps their own face (the role art is human), and PLAYERS always show their own look.
//   * a PAINTED-LOOK FILTER for the live 3D portrait (you, other players): a Kuwahara filter — each pixel takes the mean
//     of the calmest of four small windows around it, which flattens shading into brush-like patches while keeping
//     edges — plus a warm lift. Summed-area tables keep it O(pixels): ~1 ms for a 90 px frame.
//
//   artKey(actor, look, ids) -> id | null           pure: which picture an actor gets (ids = Set of what exists)
//   paintedUrl(actor) -> url | null                 the page's resolver (loads the index + the monster looks once)
//   paintFilter(rgba, w, h, r = 2)                  pure: filters an RGBA byte array in place


/** NPC role -> picture (a role missing here has no painted art and keeps the live / 2D face). */
export const ROLE_ART = Object.freeze({
  guard: 'guard', watchman: 'guard', captain: 'guard', gate_guard: 'guard', scout: 'guard',
  merchant: 'merchant', trader: 'merchant', provisioner: 'merchant', broker: 'merchant', jeweller: 'merchant', tailor: 'merchant', barber: 'merchant', vendor: 'merchant',
  smith: 'smith', armourer: 'smith', bowyer: 'smith', prospector: 'smith', glass_blower: 'smith',
  innkeeper: 'innkeeper', steam_cook: 'innkeeper', cook: 'innkeeper',
  farmer: 'farmer', miller: 'farmer', beekeeper: 'farmer', orchard_keeper: 'farmer', scarecrow_maker: 'farmer',
  elder: 'elder', hermit: 'elder', unbinder: 'elder', pilgrim: 'elder', pilgrim_resting: 'elder',
  healer: 'healer', herbalist: 'healer', apothecary: 'healer', forager: 'healer',
  trainer: 'trainer', hunter: 'trainer', hunter_lone: 'trainer',
  harbourmaster: 'harbourmaster',
  angler: 'angler', fisher: 'angler',
  carter: 'carter', stablehand: 'carter', surveyor: 'carter',
  shepherd: 'shepherd',
  woodcutter: 'woodcutter', logger: 'woodcutter', charcoal_burner: 'woodcutter', skinner: 'woodcutter',
  sexton: 'sexton', gravedigger: 'sexton',
});
/** Creature body types that share a picture. */
const BODY_ART = { dire_wolf: 'wolf', hound: 'hound', ram: 'deer', stag: 'deer' };
const WARBAND = new Set(['goblin', 'orc', 'undead', 'giant']);

/**
 * Which picture an actor gets. actor = { kind, pet, creature: { type }, name, role, look }; look = the monster's look
 * row (looks.js loadMonsterLooks()[creature.type]) or null; ids = Set of picture ids that exist.
 */
export function artKey(actor, look, ids) {
  if (!actor || !ids?.size) return null;
  if (actor.kind === 'player') return null;                                   // players show THEIR look
  if (actor.kind === 'monster' || actor.pet) {
    const id = actor.creature?.type;
    if (id && ids.has(id)) return id;                                         // a monster with its own picture (Vharlen)
    const body = look?.creature?.type || (look?.avatar ? null : actor.creature?.type);
    if (body) { const k = BODY_ART[body] || body; if (ids.has(k)) return k; }
    if (look?.avatar || actor.humanoid) {
      const race = look?.avatar?.body?.race;
      if (race && WARBAND.has(race) && ids.has(race)) return race;
      const s = `${id || ''} ${actor.name || ''}`.toLowerCase();
      for (const [re, k] of [[/slag/, 'slagborn'], [/brigand|bandit|outlaw|highway|cutthroat|thief|raider/, 'brigand'], [/cult|zealot|acolyte|fanatic/, 'cultist'], [/knight|marshal|warden|blade/, 'knight']]) if (re.test(s) && ids.has(k)) return k;
    }
    return null;
  }
  if (actor.kind === 'npc') {
    const race = actor.look?.race;
    if (race && race !== 'human') return null;                                // the role art is human: an elf keeps their face
    const k = ROLE_ART[actor.role];
    return k && ids.has(k) ? k : null;
  }
  return null;
}

let IDS = null, LOOKS = null, loading = null;
function load() {
  if (loading) return loading;
  loading = Promise.all([
    fetch(new URL('../../../assets/portraits/index.json', import.meta.url)).then(r => (r.ok ? r.json() : { ids: [] })).then(d => new Set(d.ids || [])).catch(() => new Set()),
    import('../looks.js').then(m => m.loadMonsterLooks()).catch(() => ({})),
  ]).then(([ids, looks]) => { IDS = ids; LOOKS = looks; });
  return loading;
}
const HREF = new Map();
/** The picture for an actor, or null (not loaded yet, no picture, or a player). Starts the one-time load. */
export function paintedUrl(actor) {
  if (!actor) return null;
  if (!IDS) { load(); return null; }
  const k = artKey(actor, LOOKS?.[actor.creature?.type] || null, IDS);
  if (!k) return null;
  let h = HREF.get(k); if (!h) { h = new URL(`../../../assets/portraits/${k}.webp`, import.meta.url).href; HREF.set(k, h); }
  return h;
}
export const paintedReady = () => !!IDS;

/**
 * Kuwahara filter in place on RGBA bytes (alpha untouched) + a gentle warm lift. r = window radius in pixels.
 * Each output pixel = the mean colour of whichever of the four (r+1)x(r+1) windows touching it has the lowest variance
 * of brightness. Summed-area tables (sum and sum of squares of brightness, sums of r/g/b) make every window O(1).
 */
export function paintFilter(px, w, h, r = 2) {
  if (w < 4 || h < 4) return px;
  const W = w + 1, n = W * (h + 1);
  const sR = new Float64Array(n), sG = new Float64Array(n), sB = new Float64Array(n), sL = new Float64Array(n), sQ = new Float64Array(n);
  for (let y = 0; y < h; y++) {
    let rr = 0, gg = 0, bb = 0, ll = 0, qq = 0;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, R = px[o], G = px[o + 1], B = px[o + 2], L = R * 0.3 + G * 0.59 + B * 0.11;
      rr += R; gg += G; bb += B; ll += L; qq += L * L;
      const i = (y + 1) * W + x + 1, u = y * W + x + 1;
      sR[i] = sR[u] + rr; sG[i] = sG[u] + gg; sB[i] = sB[u] + bb; sL[i] = sL[u] + ll; sQ[i] = sQ[u] + qq;
    }
  }
  const box = (T, x0, y0, x1, y1) => T[(y1 + 1) * W + x1 + 1] - T[y0 * W + x1 + 1] - T[(y1 + 1) * W + x0] + T[y0 * W + x0];
  const out = new Uint8ClampedArray(px.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = Infinity, bR = 0, bG = 0, bB = 0;
    for (const [ax, ay] of [[-r, -r], [0, -r], [-r, 0], [0, 0]]) {
      const x0 = Math.max(0, x + ax), y0 = Math.max(0, y + ay), x1 = Math.min(w - 1, x + ax + r), y1 = Math.min(h - 1, y + ay + r);
      const cnt = (x1 - x0 + 1) * (y1 - y0 + 1);
      const m = box(sL, x0, y0, x1, y1) / cnt, v = box(sQ, x0, y0, x1, y1) / cnt - m * m;
      if (v < best) { best = v; bR = box(sR, x0, y0, x1, y1) / cnt; bG = box(sG, x0, y0, x1, y1) / cnt; bB = box(sB, x0, y0, x1, y1) / cnt; }
    }
    const o = (y * w + x) * 4;
    out[o] = bR * 1.04 + 4; out[o + 1] = bG * 1.01 + 2; out[o + 2] = bB * 0.95;
  }
  for (let i = 0; i < px.length; i += 4) { px[i] = out[i]; px[i + 1] = out[i + 1]; px[i + 2] = out[i + 2]; }
  return px;
}
