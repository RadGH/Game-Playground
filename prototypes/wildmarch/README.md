# Wildmarch — design bible (docs only)

**Status:** documentation only, round 2 applied 2026-09-30. **No game code yet** — the owner approves the docs first.

An online action RPG with an MMO-style world and a 5-player focus that reuses Farhold's systems (Chibi 2,
items, skills, perks, levelling, inventory, voices) on one continent, where features unlock as you level or
finish key quests. Round 2 applied the owner's answers to the WoW audit: every ruling is in
`docs/00-OVERVIEW.md` §12 (banned names §12.5); raids are parked in `docs/WISHLIST.md`.

## What is here

| Path | What |
|---|---|
| `index.html` | the brainstorm home page + Markdown viewer for every doc (open it on the dev/stable server) |
| `docs/00-OVERVIEW.md` | **canon** — names, ids, level bands, classes, rules. Read first |
| `docs/NN-*.md` | one page per topic (controls, UI, settings, combat, items, bosses, dungeons, raids, tech…) |
| `docs/classes/<id>.md` | one page per class: mechanic, six spells, talents, sets, legendaries |
| `docs/QUESTIONS.md` | open decisions waiting on the owner (section H = round 2) |
| `docs/19-PROFESSIONS.md`, `docs/20-TRAVEL.md` | new in round 2: Harvesting + crafting professions; Travel Methods, teleports, Recall Stone |
| `docs/WISHLIST.md` | parked ideas, incl. the full round-1 raid designs |
| `docs/WOW-AUDIT.md` | the audit the owner answered (record only; §12 of 00 is the decision) |
| `docs/_PASS_R2.md`, `docs/_SWEEP_R2.md` | Claude-facing briefs for the round-2 agents and the consistency sweep |
| `docs/_BRIEF.md` | the brief every doc-writing agent followed (Claude-facing) |
| `docs/index.json` | the page list — **generated**, run `node tools/build-docs-index.mjs` after adding a doc |
| `data/canon.json` | what the home page draws (mirrors 00-OVERVIEW) |
| `js/md.js` | dependency-free Markdown renderer (headings+anchors, tables, lists, code, quotes) |
| `js/app.js` | router (`#/doc/<id>~<heading>`, `#/search/<words>`), sidebar, table of contents, search |
| `tests/site.spec.js` | Playwright: home, doc render, search, phone width |

## Viewing

`http://<LAN-IP>:8400/prototypes/wildmarch/` (stable) or `:8401` (dev). Press `/` to search every page.
