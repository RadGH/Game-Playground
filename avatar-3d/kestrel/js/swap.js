// The one switch an old game uses to draw people with Kestrel instead of Chibi 2. The factory it returns takes the
// same arguments as `createChibi2Character(look, opts)` and returns the same actor (CONTRACT.md §2), so a game hands it
// wherever it hands Chibi 2's today:
//
//   import { kestrelFactory, kestrelFromUrl } from '../avatar-3d/kestrel/js/swap.js';
//   const make = await kestrelFactory({ attempt: 'opus', height: 1.45 });   // 1.45 m ≈ Chibi 2, so cameras/bars still fit
//   const actor = await make(hero.avatar, { anims });
//
//   // or opt in from the page address: ?chars=kestrel (default attempt) / ?chars=kestrel-fable / ?chars=kestrel-meshy
//   const make = await kestrelFromUrl();   // null when the address does not ask for it
//
// Old looks have no `body.form`; it is taken from `formOf(look)` if given, then `look.gender`, then guessed from the
// hair (long styles read as 'fem'). The look itself is never changed (it is copied).

export const KESTREL_ATTEMPTS = {
  opus: 'opus/js/kestrel.js',
  opus2: 'opus2/js/kestrel.js',        // ?chars=kestrel-opus2: the Opus body refined against the Meshy model
  kit: 'kit/js/kestrel.js',            // the game version (opus2 + every Thousandvale part); ?chars=kestrel-kit
  fable: 'fable/js/kestrel.js',
  // AI-service attempts: rigged GLBs run by js/glb-attempt.js (?chars=kestrel-meshy for the 4-picture one)
  meshy: { module: 'js/glb-attempt.js', files: { male: 'meshy/models/multi-male.glb', female: 'meshy/models/multi-female.glb' } },
  'meshy-single': { module: 'js/glb-attempt.js', files: { male: 'meshy/models/single-male.glb', female: 'meshy/models/single-female.glb' } },
  'meshy-lowpoly': { module: 'js/glb-attempt.js', files: { male: 'meshy/models/lowpoly-male.glb', female: 'meshy/models/lowpoly-female.glb' } },
};
export const DEFAULT_ATTEMPT = 'opus';

const LONG_HAIR = /pony|tail|long|braid|bun|bob|wavy|curly_bob|half_up|ribbon|crown|rolled|twin|pixie/;

/** 'masc' | 'fem' for a look (pure, exported for tests). */
export function formFor(look, formOf) {
  const f = formOf?.(look) || look?.body?.form || look?.gender;
  if (f) return /^f/i.test(String(f)) ? 'fem' : 'masc';
  return LONG_HAIR.test(String(look?.hair?.id || '')) ? 'fem' : 'masc';
}

/** Load an attempt and return a createChibi2Character-shaped factory. */
export async function kestrelFactory({ attempt = DEFAULT_ATTEMPT, height = null, formOf = null } = {}) {
  const entry = KESTREL_ATTEMPTS[attempt] || KESTREL_ATTEMPTS[DEFAULT_ATTEMPT];
  const { module: path, files } = typeof entry === 'string' ? { module: entry } : entry;
  const mod = await import(new URL('../' + path, import.meta.url).href);
  const factory = async (look, opts = {}) => {
    const a = structuredClone(look || {});
    a.body = { ...(a.body || {}), form: formFor(look, formOf) };
    return mod.createKestrelCharacter(a, { ...opts, ...(files ? { files } : {}), ...(height && opts.height == null ? { height } : {}) });
  };
  factory.prepare = (look, opts = {}) => mod.prepareKestrel?.(look, { ...opts, ...(files ? { files } : {}) });
  factory.info = mod.KESTREL_INFO;
  return factory;
}

/** `?chars=kestrel` or `?chars=kestrel-<attempt>` in `search` → a factory; anything else → null. */
export async function kestrelFromUrl(search = (typeof location !== 'undefined' ? location.search : ''), opts = {}) {
  const m = /[?&]chars=kestrel(?:-([a-z0-9-]+))?(?:&|$)/.exec(String(search || ''));
  if (!m) return null;
  return kestrelFactory({ ...opts, attempt: m[1] || DEFAULT_ATTEMPT });
}
