# Thousandvale — changelog

Append-only, newest at the bottom, prefixed with the stream letter.

## 2026-10-04 — streams B, H, G (M0)
- **B** `js/rules/terrain-read.js` ★: pure terrain reader (height/normal/slope/water/biome/walkable, heightGrid/waterGrid, `gridIndices` with the same triangle split the reader uses — drawn = measured). File format `terrain.bin` v1 (magic/version/input hash, refused if wrong).
- **B** `tools/bake-test-zone.mjs` + `data/zones/test/terrain.bin` (6 MB): one 2×2 km zone at 2 m from World Forge seed 1000 — grassland/forest/marsh, 3 rivers, a village + 2 hamlets + a ford, spawn by the village. `tools/terrain-viewer.html`. `docs/world.md`. 10 node tests in `tests/B/`.
- **H** `ops/`: `start-dev.sh` + systemd user unit `thousandvale-dev.service` (8491) + `install-dev-unit.sh`; `postgres-setup.{sh,sql}` (role `thousandvale`, db `thousandvale_dev`, localhost; env in `~/.config/thousandvale/dev.env`); `SECURITY.md` checklist from PLAN §11. Thousandvale section in `tools/README-servers.md`; entries in `~/claude/docs/projects.md` + `playground.md`.
- **G** `tools/bot-client.mjs` (real WebSocket bots over `js/net/client.js`: login, wander, chase + swing at wolves, stats), `tests/load/server-harness.mjs`, `tests/load/bots20.test.js` (20 bots, tick p99 < 5 ms), `tests/load/reconnect.test.js` (kill -9 + restart + reconnect), `tests/e2e/two-players.spec.js` (2 contexts: see each other move, hit a wolf together).
