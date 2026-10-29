# Kestrel — the contract every attempt follows

**Kestrel** is the codename for the next character system: realistic proportions (~7 heads tall), more detail than
Chibi 2.5, still low-poly enough for phones, modular (body + hair + garments as separate pieces put together at
runtime), and a drop-in for games that use Chibi 2 today. The owner's design is `ref/source/owner-mockup.png`; the
Codex pictures every attempt is judged against are in `ref/` (see `ref/README.md`).

Several **attempts** build the same thing in different ways (hand-coded by Opus, hand-coded by Fable, later
Tripo / Meshy / Rodin / Hunyuan3D output put through the same runtime). Each lives in its own folder
`avatar-3d/kestrel/<attempt>/` and the shared review page (`avatar-3d/kestrel/index.html`) loads any of them through
this one contract. **An attempt only ever writes inside its own folder.**

## 1. The module

`avatar-3d/kestrel/<attempt>/js/kestrel.js`, an ES module, no build step, importing Three.js as `'three'` (the page's
import map points at `vendor/three/`). Exports:

```js
export const KESTREL_ANIMS;                                    // every clip name it builds (see §3)
export async function createKestrelCharacter(look, opts = {}); // → actor (§2)
export async function prepareKestrel(look, opts = {});         // bake/cache ahead of time (may just build + cache); resolves when ready
export function kestrelCacheStats();                           // { templates, references }
export const KESTREL_INFO = { attempt: '<id>', by: '<model or service>', version: '<semver>' };
```

Opts: `anims` (array, default KESTREL_ANIMS), `lod` (0 | 1 | 'auto', default 0), `trace` (optional array, as Chibi 2).

## 2. The actor — the same shape as `createChibi2Character`

So a game swaps the factory and nothing else. Everything `avatar-3d/js/chibi2.js` returns, with the same meaning:

| member | meaning |
|---|---|
| `group` | THREE.Group the game positions; `group.userData.character = true`, `group.userData.fxHeight` = height in metres |
| `anim` (getter) | current clip name |
| `parts` (getter) | bones by name. MUST include Chibi 2's names: `root hips chest head armL armR elbowL elbowR handL handR gripL gripR legL legR kneeL kneeR footL footR` (aliases to the attempt's own bones are fine). Grip bones sit in the palm; a held thing parented/skinned to a grip goes where a hand holds it. More bones (spine, neck, fingers, toes, jaw, face) are welcome |
| `skeleton` | the actor's own THREE.Skeleton |
| `metrics()` | `{ totalHeight, height }` in metres |
| `stats()` | `{ meshes, bones, triangles, drawCalls, textures, buildMs }` (the first three as Chibi 2; the rest new) |
| `setAnim(name, fade = 0.12, restart = false)` | one-shots (attack, cast, hit, jump, wave, interact) return to idle; `dead` holds; unknown name → idle; a one-shot already playing is not restarted unless `restart` |
| `setRate(k)`, `rate` | clip speed, clamped 0.15..3.5 |
| `setTwist(yaw, side, fwd)`, `twist` | upper body turned/leaned on the hips on top of the clip |
| `update(dt)` | advance (dt clamped to 0.1) |
| `setAvatar(look)` | rebuild for a new look, keep the caller's group transform |
| `setHandsFree(v)`, `handsFree` | hide what is in the hands |
| `lookAt(point, { head })`, `setGaze(x, y)`, `blink()`, `setBlink(k)`, `eyes` | as Chibi 2.5: blinks on their own every 2–5.5 s, pupils stay in the eye white |
| `hold` | `null` is fine (no held items in test 1) |
| `dispose()` | free this actor; the template is reference-counted |

New in Kestrel:

| member | meaning |
|---|---|
| `setExpression(name, weight = 1, fade = 0.2)` | `neutral happy sad angry surprised confused` (the mockup's six), blended, on top of any clip; `expression` getter |
| `setLod(n)` | 0 = full detail, 1 = far version (optional but scored) |

Facing **+z**, feet on **y = 0**, real scale in metres (~1.78 m male, ~1.68 female at `body.height` 0.5).
`opts.height` (metres) scales the whole character to that height, so a game tuned for Chibi 2's ~1.4 m can ask for it.

## 3. Clips

At least Chibi 2's twelve — `idle ready walk run attack cast hit guard wave talk jump dead` — plus the mockup's
`sprint crouch aim interact`. Walk/run/sprint are in place (a game owns movement). `attack` is a one-handed melee
swing, `aim` holds a bow draw. Hands-free clips are fine for test 1 (nothing is held).

## 4. The look it reads

The shared avatar JSON (`shared/character-schema.md`), the same object a game already passes to Chibi 2:

* `body.form`: `'masc'` | `'fem'` (new field; default `'masc'`). `body.height`, `body.width` (0..1, default 0.5)
  nudge build. `body.skin` colour.
* `hair.id` + `hair.color`: at least the two mockup styles (`spiky` = the man's short messy cut, `high_ponytail` =
  the woman's) plus `bald`, `short`, `long`; every other Chibi 2 id maps to the nearest one it has (never throws).
* `eyes.color`, `brows.color` (default: dark hair shade), `mouth.color`.
* Garments, the **modular** part: underwear is always on (the mockup's charcoal set). Test 1 must also ship ONE simple
  outfit to prove the slots work: `top.id: 'shirt'`, `bottom.id: 'pants'`, `shoes.id: 'boots'`, each recoloured by
  its `.color`; any other id → the nearest it has, or nothing. Body skin under a garment is not drawn (no poke-through
  in any clip). Unknown fields are ignored, never an error.

## 5. Budgets (phones)

* **Full detail (LOD 0): ≤ 12,000 triangles** for body + hair + underwear; the outfit adds ≤ 3,000.
* **≤ 2 draw calls** per character (1 is better), ≤ 70 bones, one texture atlas ≤ 1024×1024 if textures are used
  (canvas-painted in code is fine; downloaded images are not, for the hand-coded attempts).
* New look ≤ 150 ms to build on the VM; the same look again is a cache hit. No per-frame geometry rebuilds, no
  material or light toggles after build (they recompile shaders — see memory "three.js shader-recompile stutter").
* Far version (LOD 1) ≤ 4,000 triangles, if built.
* It must also build under node with no DOM (`node --import ./avatar-3d/tests/three-register.mjs`), so the contract
  test can count triangles: if you paint textures on a canvas, skip that (plain colours) when `document` is undefined.

## 6. What each attempt also hands in

* `<attempt>/README.md` — how it is built, what worked, what did not, its own honest score against the references.
* `<attempt>/index.html` — its own small preview page (both bodies, every clip, every expression, outfit on/off).
* `<attempt>/shots/` — screenshots at the reference angles (front, left, back, right, 3/4, face close-up) for both
  bodies, taken with Playwright against the DEV server (port 8401), so the review page can put them beside the Codex
  pictures.
* Its numbers in `<attempt>/stats.json`: `{ male: { triangles, drawCalls, bones, buildMs }, female: {…}, outfit: {…} }`.

The node contract test (`avatar-3d/kestrel/tests/contract.test.js`) builds each attempt listed in
`data/attempts.json` headlessly and checks §1–§5. An attempt is listed there by the lead, not by itself.
