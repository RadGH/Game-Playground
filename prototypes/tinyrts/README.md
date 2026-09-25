# Tiny RTS

A side-view, physics-driven real-time strategy / defense game in chunky pixels. Mine crystal, paint
walls a cell at a time, light them up with laser turrets, and hold against waves of geometric
void-creatures — or against a rival AI commander building its own fort across the map. Every wall
and hill is made of cells: shots chip them away, overhangs break off and fall (and crush what's
under them), and drills really do hollow out the ground.

Independent project (Radley Sustaire). Sandbox. Vanilla JS modules, no build step, no asset files —
sprites are drawn by code and every sound is synthesized live.

**Play:** `./tools/serve.sh --bg`, then open `http://<LAN-IP>:8460/` (LAN IP:
`hostname -I | awk '{print $1}'`). Quick-start URLs: `?play=siege`, `?play=versus`, `?play=sandbox`
(add `&seed=123&size=large&style=canyons`).

## What's in it

| | |
|---|---|
| **Campaign** | "Signal Line": 8 missions — tutorial, ferrite + artillery, linking beacons across hostile hills, cave defense against Borers, dropping a stone slab on a Nest, holding a bridge against laser-eyed Glares and a Titan, and two missions against the Umbra rival AI. Stars, best times, unlocks. |
| **Free Play — Siege** | The Director AI composes waves by reading your defense (all lasers → Carapaces; thick walls → Gnawers, Borers, Spitters; no anti-air → Wisps, Bombards). 10/20/30/endless waves, 4 difficulties, lanes from one side, both, or underground. |
| **Free Play — Versus** | The Umbra rival AI plays by your rules with your roster: build orders, expansion, army pushes, retreats, siege deployment, Orbital Lance on your wall. Bastion or Swarm style, 4 difficulties. |
| **Physics** | Falling sand for dust/rubble/slag, a support rule for walls (span limits per material), falling clumps with crush damage, buildings that fall when undermined, craters and debris. |
| **Economy** | Crystal, Ferrite, Alloy; power as a live rate with batteries and brown-outs; a link network with line-of-sight through terrain; ammo for kinetic turrets. |
| **Controls** | Full keyboard + mouse RTS controls on a 4×3 command grid (Q W E R / A S D F / Z X C V), control groups, attack-move, patrol, queued orders, F1 cheat sheet. |
| **Audio** | Synthesized SFX with spatial panning, and procedural synthwave music that builds up during waves and boss fights. |
| **Saves** | Suspend & Continue (IndexedDB), campaign progress and settings (localStorage). |

## Docs

- [`DESIGN.md`](DESIGN.md) — the design (v2, after review), every menu, interface and hotkey,
  milestones, and the changes made during the build (§20, §20b) plus the written backlog (§21).
- [`docs/ROAST.md`](docs/ROAST.md) — the critique of design v1 that shaped v2.

## Code map

```
js/core      loop (30 Hz fixed step), rng, events       js/world   cells, terrain, sand, support/clumps, raycast
js/sim       game, commands, buildings, units, weapons,  js/ai      rival.js (Umbra AI, also the balance bot)
             projectiles, hollow, army, construction,    js/render  renderer, terrain layer, sprites, fx, entities
             network, nav (A*), waves, missions, save    js/ui      controller, HUD, command card, menus, hints
js/audio     audio (SFX), music (sequencer)              data/*.json every number in the game
```

The simulation never touches the DOM, so it runs in Node for tests and balance sims.

## Tests and tools

```bash
npm test                          # 55 unit tests (node:test): physics, economy, weapons, AI, campaign, save/load
npx playwright test               # 9 browser tests: menus, a siege match, win/lose, campaign, save/continue, layouts, phone
node tools/sim.js siege 6 normal  # headless balance: a defender bot vs the Director (also versus / campaign / perf)
node tools/play.mjs <dir>         # scripted playtest with screenshots (also scene.mjs, ui.mjs, missions.mjs, stress.mjs)
```

## Balance snapshot (defender bot, 6 seeds, 10 waves)
Easy 5/6 wins · Normal 5/6 · Hard 1/6 · Brutal 1/6. The bot is a rough stand-in for an average
player — it never uses walls cleverly, units, or the Commander. Performance: ~1 ms/tick in the
browser with 300 enemies on a large map, 60 fps at 1080p.
