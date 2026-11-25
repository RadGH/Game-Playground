# Pixel Splats

**Status:** demo, 2026-11-24. **Play:** LAN dev http://192.168.1.34:8401/avatar-3d/pixelsplat/ (stable 8400 after publish).

Owner's request (2026-11-24): "Can you access [a Reddit post on r/TopologyAI] and create a demo similar to that one? I want
to see how it works." The post — *Not Baked, Not a Filter: Gaussian Splats That Catch Live Highlights*, about a weekend
experiment by Tommaso Checchi (ex-Minecraft, now making Robotopia) — shows a knight made of **60,000 square splats**
trained on the G-buffer of a normal 3D knight, so each splat carries **material data** instead of a finished colour.
The light is worked out live (highlights move over the helmet, shield and sword as it turns), and pixel rules are built
into training (grid alignment, holes, overlaps), so it keeps crisp pixel-art edges while rotating. Its trade-off:
everything is static, because turning one part breaks the grid.

## What this demo does

| Mode | How |
|---|---|
| **Live-lit splats** | `js/sample.js` spreads N splats over the model's surface by area; each reads the colour under it, the smooth surface normal, and a metal / rough guess. The vertex shader lights each splat (one GGX-style lighting function), turns away the ones facing away, then moves the splat's centre to the middle of its cell on a **fixed screen pixel grid** and draws exactly that cell (`gl_PointSize` = pixel size). Depth keeps the nearest splat per cell. |
| **Baked splats** | The same splats, lit once with the light fixed to the model: the shine turns with the knight (the "common route" the post compares against). |
| **Pixel filter** | The normal mesh drawn into a small target and blown up with hard pixels (the other common route). |
| **Smooth model** | The normal mesh at full size. |

All four use the same lighting function, so only the method differs. Controls: model, pixel size (3-12 px), splat
count (15k-120k), lamp position, turn the knight, move the lamp, small palette (7 steps a channel). Drag to turn.
Address options: `?mode=live|baked|filter|smooth&model=silver-knight&pix=6&count=60000&yaw=0.5&light=0.8&spin=0&orbit=0&poster=1`.

## Differences from the original (on purpose)

- **Sampled, not trained.** The original fits splats by gradient descent with losses for grid alignment, holes, overlaps
  and overhangs. We sample them straight off the surface (same data per splat, no training): holes can appear at small
  pixel sizes with few splats (raise the count), and two splats can fight for one cell (depth picks the nearer).
- **Material is guessed from colour.** The fal models carry only a colour texture, so `materialFromColour` calls light
  greys steel, gold hues gold and the rest cloth / leather. A model with metal / roughness maps would read them directly.
- **Square points, not Gaussians.** A splat here is a hard square the size of one grid cell — the shape the post ends up
  with after its pixel rules.

## Files

`index.html`, `pixelsplat.css`, `js/main.js` (page, four modes, shaders), `js/sample.js` (bake a model into one static
mesh; sample splats; material guess — no DOM), `tests/sample.test.mjs` (node), `tests/shots.mjs` (pictures of every mode,
desktop + phone → `shots/`). Models: `avatar-3d/fal/models/final/*.glb` (paid fal art, already in the repo).
