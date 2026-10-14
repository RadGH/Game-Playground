# Thousandvale is on hold (2026-10-13)


> **Public home since 2026-10-14: https://thousandvale.games.radgh.com/** on the RGS droplet (production; its own
> database `thousandvale_stable` on the droplet). To ship a change there: publish stable here
> (`tools/publish-thousandvale.sh` for the LAN server, then the playground's `tools/publish-stable.sh` +
> `tools/publish-pages.sh`), then `cd ~/claude/rads-game-server && tools/deploy.sh update thousandvale`.
> Full map: `~/claude/docs/rgs.md`. The quick tunnel below still points at THIS VM's stable server — a second, separate
> world with its own players' data; the droplet is the one to give out. `ops/vps/` and `docs/HOSTING.md` are the older
> plan and are not what production runs (the droplet's setup lives in the rads-game-server repo).

The owner paused Thousandvale to build another game. This page is the hand-over: where things stand, how to pick
it up again, and everything that was deliberately **parked** rather than built. Nothing on the parked list is
forgotten — bring it up when the game is resumed.

## Where it stands

- One province of twelve is built (Torbor Downs): 16 zones, 18 towns, dungeons, world boss, events, 31 classes
  (Farhold's 30 + Starcaller), 180+ skills, ten professions with mini-games, parties, guilds, mail, trading,
  friends, mounts, phone layout and controller support.
- Ten play-test rounds are closed. Round 10 (Y1–Y39) was audited on 2026-10-13: its 3D-client, professions and
  content streams had never run, so 16 of 39 items were partly or not done; they were finished in the wrap-up
  (see `docs/CHANGELOG.md`, the "2026-10-13 — wrap-up" sections, and the audit table in
  `~/claude/agent/mmo/round-playtest10.md`).
- The live server is the stable unit on port 8490 behind a Cloudflare quick tunnel
  (`data/live-links.json`; `tools/update-live-link.sh` refreshes it). It keeps running while the game is on hold.
  A quick tunnel's address changes if the tunnel process restarts — `docs/HOSTING.md` is the plan for a real host.

## How to resume

1. Read `docs/PLAN.md` (§0 are the rules it never breaks), then this page, then the tail of `docs/CHANGELOG.md`.
2. Read the players' reports on BOTH servers before anything else:
   `node tools/feedback-report.mjs --state new` (dev) and
   `sudo "$(command -v node)" tools/feedback-report.mjs --env stable --state new` (live).
3. Dev server: `systemctl --user restart thousandvale-dev` (port 8491). Publish: commit, then
   `tools/publish-thousandvale.sh` (refuses a commit that does not parse or whose unit tests fail; rolls back
   if the new build does not come up). Add an entry to `data/ops/changelog.json` at each publish.
4. After ANY zone re-bake: `content-professions -> content-towns -> content-givers -> content-hunts`.
   Never run `content-offices.mjs` alone (it renames shopkeepers). Do not run `place-vignettes.mjs` (it no longer
   reproduces the committed placements).
5. Agents: at most three at a time; Playwright only under `flock /tmp/claude-1000/farhold-pw.lock`.

## Parked — not started, or too big for the wrap-up

### New systems players asked for
- **Rarity on gathering nodes** (live report #64): ore, wood and herb nodes can roll magic / rare / legendary like
  fishing pools do; rarity raises skill gained, materials dropped and the chance of bonus items; skinning takes
  its rarity from the monster's rank; rare and better give 4× the materials. Touches node spawning, the
  mini-game reward, the node models (a visible mark) and the economy sim (gathering income). Not started.
- **Professions, the rest of round 8's plan** (`docs/requests.md` "Round 8 contracts — P-core", not built):
  recipes learned one at a time instead of by skill band; tempering an item while it is worn; tier 4–5 nodes.
  The last one is also why gathering at level 9 earns only 42–47% of questing (the rule is 70–100%, met at
  levels 1 / 5 / 10 / 20 where the test looks).
- **The other eleven provinces.** Owner direction (2026-10-07): each new region is completely different — new
  biomes, new assets, new themes, nothing reused from Torbor Downs.

### Gate work nobody has closed
- **A real-iPhone pass in Safari.** The phone layout is on and passes at 393×852 in Chromium's touch emulation;
  the portrait fix (Y33) and the fishing hint (Y34) have never been confirmed on the device.
- **Phone go-over of the round 8–10 windows** (trainer, crafting, tempering, cart, meter, changelog, tracking) and
  the gallery's fixtures / scene counts in `docs/UI.md`.
- **Other games' browser suites after the shared motion change** in round 5 (`avatar-3d/js/chibi2-motion.js`:
  grips, dual-wield clips, and now the emote additions): Farhold, Emberveil and Bannerline were only ever run
  through their node tests. Run their Playwright suites before the next big change to shared avatar code.
- **100-bot load gate on a quiet machine** was last green on 2026-10-08; nothing since has been measured.

### Small things seen and left
- The **Bound Trader** road event says "tied" and draws no rope or post (the Caged Scout got its cage).
- The "Inn sign" and "Notice post" use-objects draw a stone step beside the real sign / post.
- The Caged Scout's cage has no collision — you can walk through the bars.
- **Sell-back is 6%**, not the 15–25% first aimed for: at 10% sold loot is 29–45% of income and killing
  out-earns questing by a third at level 30 (`docs/economy/README.md`). Raising it needs kill loot re-tuned.
- Damage meter: damage-over-time ticks and thorns carry no overkill / absorbed figures; Wheeling Stars reads 0
  in the sheet's measured damage.
- A wall-stopped shot (dungeon line of sight, Y10) draws nothing special where it stops.
- Fishing has no "ready" stage like the trade mini-games (Y19 covered the trades only).
- Farhold bugs found from here and left for the owner (they are Farhold's): a chained bolt can re-hit the same
  enemy; an uncharged Arc Lash does not chain; a holy attune silently changes the element.
- Known model limits: long shields lie sideways at the ready pose; rigid skirts clip at a full stride.

## Open questions for the owner
- Hosting: stay on the VM + quick tunnel while on hold, or move to the VPS plan in `docs/HOSTING.md`?
- The dev database holds the owner's test characters and 41 reports; the live one holds real players'. Neither
  is backed up off this machine.
