# Wildmarch — design bible (docs only)

**Status:** documentation only, 2026-09-29. **No game code yet** — the owner approves the docs first.

An online third-person action RPG that reuses Farhold's systems (Chibi 2, items, skills, perks,
levelling, inventory, voices) on one continent where every feature is earned by level or quest.

## What is here

| Path | What |
|---|---|
| `index.html` | the brainstorm home page + Markdown viewer for every doc (open it on the dev/stable server) |
| `docs/00-OVERVIEW.md` | **canon** — names, ids, level bands, classes, rules. Read first |
| `docs/NN-*.md` | one page per topic (controls, UI, settings, combat, items, bosses, dungeons, raids, tech…) |
| `docs/classes/<id>.md` | one page per class: mechanic, six spells, talents, sets, legendaries |
| `docs/QUESTIONS.md` | open decisions waiting on the owner |
| `docs/_BRIEF.md` | the brief every doc-writing agent followed (Claude-facing) |
| `docs/index.json` | the page list — **generated**, run `node tools/build-docs-index.mjs` after adding a doc |
| `data/canon.json` | what the home page draws (mirrors 00-OVERVIEW) |
| `js/md.js` | dependency-free Markdown renderer (headings+anchors, tables, lists, code, quotes) |
| `js/app.js` | router (`#/doc/<id>~<heading>`, `#/search/<words>`), sidebar, table of contents, search |
| `tests/site.spec.js` | Playwright: home, doc render, search, phone width |

## Viewing

`http://<LAN-IP>:8400/prototypes/wildmarch/` (stable) or `:8401` (dev). Press `/` to search every page.
