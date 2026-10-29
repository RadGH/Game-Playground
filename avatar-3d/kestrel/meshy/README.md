# Kestrel attempt: Meshy (AI service)

Made 2026-10-27 with the Meshy API (`tools/meshy.mjs`, key `RGS_MESHY_API_KEY` in `~/claude/secrets/.env`, never
printed). Every job is listed with its credits in `spend.json`: **468 credits** for all of it (632 of the month's 1,100
left; Meshy's monthly credits reset). Raw downloads (FBX, 2K textures, thumbnails) are in `runs/`, git-ignored.

## Three settings, both bodies

| Attempt | Meshy job | Input pictures | Settings | Credits per body |
|---|---|---|---|---|
| `meshy-multi` | Multi-Image to 3D | `ref/<body>-crop-{front,left,back,right}.png` (the matched set) | `meshy-7.1`, 2K PBR textures, remesh to 12,000 triangles, A-pose, image enhancement off | 30 |
| `meshy-single` | Image to 3D | `ref/<body>-front.png` | same | 30 |
| `meshy-lowpoly` | Image to 3D, `smart-topology` | `ref/<body>-front.png` | `meshy-t2.5`, 10,000 target, PBR | 15 |

Then, for all six: **auto-rig** (5 credits, `height_meters` 1.78 / 1.68, a 24-bone skeleton: hips, three spine bones,
neck, head, shoulders, arms, forearms, hands, thighs, shins, feet, toes; **no fingers, no face**) and **16 library
animations** in two merged requests (48 credits):

| Kestrel clip | Meshy library action |
|---|---|
| idle / ready | 0 Idle / 89 Combat Idle |
| walk / run / sprint | 30 Casual Walk / 14 Run 2 / 16 Run Fast |
| attack / cast / guard / hit | 219 Right-hand Sword Slash / 129 Mage Spell Cast / 138 Block1 / 178 Hit Reaction |
| wave / talk / interact | 28 Big Wave Hello / 313 Talk with Hands Open / 284 Collect Object |
| jump / dead / crouch / aim | 466 Regular Jump / 189 Dying Backwards / 258 Crouch look-around (bow) / 224 Archery Shot |

## Packed for phones

`tools/pack-glb.py` puts the rigged body and the 16 clips (renamed to the contract's names, matched to the body's bones
by name) into one file and shrinks the three textures (colour, normal, metal/rough) from 2048 to 1024 JPEG:
`models/<setting>-<body>.glb`, 1.8–2.6 MB each (the raw rigged file was 7–9 MB without the clips).

`js/glb-attempt.js` runs any such file to the same contract as the hand-coded attempts: the Chibi 2 actor, clips made
in place (the hip's travel is removed so a game owns movement), bones aliased to Chibi 2's names, grip points added in
the palms, scaled to the look's height with the feet on the ground. Old games: `?chars=kestrel-meshy` in Emberveil 2.

## What it cannot do (yet)

* **No expressions, blinks or gaze**: the rig has no face. `setExpression` is accepted and does nothing.
* **Not modular**: hair, underwear and skin are one baked texture on one mesh. The outfit box does nothing, and
  recolouring skin or hair would need a texture edit per colour. Making it modular means generating each garment and
  hair style separately against this body and fitting them (the Chibi 4 kit approach).
* **No fingers**: hands are rigid, so fists, grips and pointing are not possible without re-rigging.
* **One detail level** and three 1K textures per character (about 12 MB of GPU memory each). A crowd needs a far version.
* `aim` is a full archery shot and `crouch` a crouching look-around, the nearest the library has to the mockup poses.
