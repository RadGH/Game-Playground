# Kestrel reference pictures

Made with Codex (`codex exec -s danger-full-access --skip-git-repo-check -i <refs>`, prompt on stdin, one job per
folder) on 2026-10-27 from the owner's mockup `source/owner-mockup.png`. The prompts are kept beside the pictures
(`*-turnaround.prompt.txt`, `*-views.prompt.txt`). Gallery: `ref/index.html`. `manifest.json` lists them.

| Files | What | Use it for |
|---|---|---|
| `male-turnaround.png`, `female-turnaround.png` | 1536x1024, front / left / back / right in one row, A-pose, underwear | one-sheet input; the look every attempt is scored against |
| `<body>-crop-{front,left,back,right}.png` | the four figures cut from the sheet onto 3:4 canvases | **multi-view services**: four pictures that agree exactly |
| `<body>-{front,back,left,right,three-quarter}.png` | 1024x1536 single views, drawn one at a time with the sheet as reference | **single-picture services** (use the front); higher detail |
| `<body>-head.png` | 1536x1024 head close-ups: front, left, back, 3/4 | face and hair detail |
| `rejected/` | a female sheet Codex drew photo-real, against the brief | nothing — kept so nobody regenerates it by mistake |

Fixes made by hand: `male-left.png` and `female-three-quarter.png` are mirrored (Codex drew them facing the wrong
way). All left views face picture-left, right views face picture-right, and both 3/4 views turn toward picture-left.
Views are left/right of the CHARACTER: the left view shows their left side.
`jobs/` (git-ignored) holds Codex's working folders and logs.
