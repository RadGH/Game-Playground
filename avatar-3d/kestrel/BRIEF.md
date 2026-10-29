# Brief for a Kestrel hand-coded attempt (test 1)

You are building ONE attempt of **Kestrel**, the next character system for Radley's browser games, in the folder
`avatar-3d/kestrel/<ATTEMPT>/` of the repo `/home/radgh/claude/playground`. A second model is building another attempt
in a sibling folder at the same time, independently; the owner will compare the two side by side, and later against
AI 3D services (Tripo, Meshy...). Make yours as good as you can.

## The goal, in the owner's words
"see how far you can recreate these models in our chibi 2.5 style. It does not need to support any of the old assets,
but should be able to swap in with relative ease into my old games." Target: phones (low poly), but noticeably more
detailed and realistically proportioned than Chibi 2.5.

"Chibi 2.5 style" here means HOW it is made: procedural Three.js geometry written in code (profiles/lofts/sculpted
meshes, skinned to a code-built rig, clips sampled in code), no downloaded models, no build step. It does NOT mean
big-headed: the target is the owner's mockup — ~7 heads tall, athletic, stylised-realistic game look.

## Read first
1. `avatar-3d/kestrel/CONTRACT.md` — the API, clips, look fields, budgets and deliverables. Non-negotiable.
2. The pictures (LOOK at them with the Read tool): `avatar-3d/kestrel/ref/source/owner-mockup.png` (the owner's sheet:
   bodies, 6 expressions, 9 poses, eye/ear/nose/mouth/hands/feet), `ref/male-turnaround.png`,
   `ref/female-turnaround.png`, `ref/<body>-crop-{front,left,back,right}.png`. Higher-detail single views
   (`ref/<body>-{front,back,left,right,three-quarter,head}.png`) are being generated now and will appear in `ref/`
   within ~20 minutes — look again later.
3. `avatar-3d/kestrel/js/looks.js` — the two test looks + the outfit. Your page and shots use these.
4. How Chibi 2/2.5 is built, for technique and the actor shape: `avatar-3d/CHIBI2.md` (sections "Reuse",
   "Implementation", "Chibi 2.5 contracts"), `avatar-3d/js/chibi2.js` (`createChibi2Character`, ~line 530: copy its
   actor shape), `avatar-3d/js/chibi2-geometry.js` (`profile`, `SkinBuilder`, merging by material), `avatar-3d/js/chibi2-motion.js`
   (sampled clips), `avatar-3d/js/chibi25-eyes.js` (blink/look). You may import read-only from `avatar-3d/js/` but
   copying what you need into your folder is safer (those files change under other work).

## Rules
* Write ONLY inside `avatar-3d/kestrel/<ATTEMPT>/`. Do not edit anything else (not the review page, not CONTRACT.md,
  not shared files). If the contract seems wrong, say so in your README and in your final message.
* Do NOT git commit; the lead commits.
* Bash: use absolute paths, never `cd dir && cmd` compounds. RAM is only 5 GB: run at most ONE headless browser at a
  time, close it when done, never run `npm test` or the full Playwright suite. The dev server is already running:
  `http://localhost:8401/avatar-3d/kestrel/<ATTEMPT>/index.html` (8401 serves the live working tree). For screenshots
  write a small node script in your folder like `tools/chibi25-shot.mjs` (chromium with
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`). Node tests: `node --import
  ./avatar-3d/tests/three-register.mjs --test <file>` from `/home/radgh/claude/playground`.
* No third-party names in anything player-facing.
* Iterate by EYE: screenshot your model at the reference angles, put it beside the reference crop (Read both images),
  list what is off (silhouette, proportions, face, hands, feet, hair, muscles), fix, repeat. At least four rounds.
  The face and the hands are where cheap characters fail; spend time there. Expressions are judged against the
  mockup's six faces.
* Modular is part of the score: body, underwear, hair and the outfit pieces are separate pieces put together per
  look (a garment hides the body under it so nothing pokes through in any clip), then merged to ≤ 2 draw calls.
* Keep it phone-cheap: within the CONTRACT budgets; report your real numbers.

## Hand in (CONTRACT §6)
`<ATTEMPT>/js/kestrel.js` (+ your other modules), `<ATTEMPT>/index.html` (+ css), `<ATTEMPT>/README.md` (how it is
built, decisions, what worked, what did not, honest self-score), `<ATTEMPT>/shots/` (both bodies at front, left,
back, right, 3/4, face; plus one sheet of the 6 expressions and one of the poses), `<ATTEMPT>/stats.json`, and a node
test `<ATTEMPT>/tests/*.test.js` that builds both looks headlessly and checks budgets + the actor shape. Your final
message: what you built, the numbers, the self-score, and what you would do next.
