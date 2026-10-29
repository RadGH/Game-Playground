# Kestrel / fable — working checklist (done 2026-10-28; README.md is the write-up)

Attempt folder only. No commits (the lead commits). One headless browser at a time.

## Build
- [x] js/geometry.js — superellipse loft, sculpt bumps, mirror, Builder (merge to 1 draw call, skin weights)
- [x] js/rig.js — bones (Chibi 2 names + spine/neck/jaw/fingers/toes/face/ponytail), proportions per form
- [x] js/body.js — torso, arms, legs, hands, feet, neck
- [x] js/head.js — sculpted skull, eyes (+lids, lashes), brows, nose, mouth (+jaw, teeth), ears, EXPRESSIONS
- [x] js/hair.js — spiky, high_ponytail, bald, short, long (+ id mapping)
- [x] js/garments.js — underwear (always), shirt, pants, boots; body hidden under them
- [x] js/motion.js — 16 clips, follow-through
- [x] js/face.js — blink/gaze/lookAt + expression blending
- [x] js/kestrel.js — API, template cache, actor, LOD, skin paint
- [x] index.html + kestrel.css + js/app.js — preview page (both bodies, clips, expressions, outfit, sheet modes)
- [x] tools/shot.mjs (+ tools/shots.json, tools/stats.mjs) — Playwright shots, stats.json
- [x] tests/kestrel.test.js — node build, budgets, actor shape (green); ../tests/contract.test.js green for fable
- [x] stats.json, README.md

## Look-compare-fix rounds: nine (listed in README.md)

## Hand-in
- [x] shots/ (12 views + expressions + poses for both bodies, outfit, LOD 1)
- [ ] final message: built, numbers, self-score, next
