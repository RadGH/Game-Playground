# Chibi 2.6 adoption and deployment record

Owner authorized rollout on 2026-11-03, overriding the earlier “proposal only” and “no game edits” notes below. Production sequence: Thousandvale and Tumblefair first, then the remaining games. Detailed measurements, checks and screenshots are in [CHIBI26.md](CHIBI26.md#game-adoption-and-production-rollout-2026-11-03).

## 1. Thousandvale

All Thousandvale humanoids route through `prototypes/thousandvale/js/client/chibi-version.js` → `createTvBody`. The shared switch now defaults to 2.6, with `?chibi=2.5` and `?chibi=2` comparison modes. `tvChibiOpts` sends both `v25` and `v26` to the body factory.

`createTvBody` forwards the selected options to both `prepareChibi2` and `createChibi2Character`, preserving sliced warm-up. The Thousandvale release passed 1,837 unit tests.

## 2. Tumblefair

`prototypes/tumblefair/js/client/avatars.js` imports `createTvBody`, so its actors inherit the shared 2.6 default without a separate call-site change. Tumblefair is live on build `9e9d7de2`. Its player portraits still use the shared 2D SVG portrait path. Kestrel mode remains separate.

## Other game builders

Roverlands and Knockabout also use `createTvBody`; both are live on build `82ab1895`. Farhold, Emberveil 2, Bannerline and Oddhaven call the 3D factory directly; those builders now pass `v25: true, v26: true`. Oddhaven's sliced preparation and portrait paths were updated alongside its actors. Farhold, Emberveil 2 and Oddhaven are in the live playground snapshot `08a982c5`. Bannerline is included in the snapshot but is not listed as a public game in `games.json`.

## Risks and required rollout checks

- **Graphics and body choices:** the shared factory now accepts `graphics: 'low'` to build 2.6 without its procedural maps (high is the default), and `body.form` / `body.chestSize` carry the feminine Flat/Round choice in avatar JSON. A game can pass its existing quality preference through the same factory options; no game is wired to the new setting here. Current maps cover two shared material buckets rather than separate authored cloth, leather, wood and metal sets.
- **Crowd cost:** 2.6 has two merged meshes and passes the triangle ceiling, but 30-character mid-range phone timing has not been measured. Warm-up with 2.6 clip lists, measure first-build stalls and steady 60 fps before enabling it broadly.
- **Clearance:** `data/chibi26-clipping.json` reports 601 body-solid pair events across the four-look proxy sweep and skirt hits in ten clips. These proxies need art review; outfits should not be treated as clear.
- **Mount/vehicle fit:** `seatRider` works with the new actor and the metric wagon API runs, but the fit scene does not establish real seat/wheel comfort for every mount or vehicle. Recheck Thousandvale mounts at full scale before rollout.
- **Expressions and portraits:** 2.6 retains 2.5 blinking and gaze. There is no new expression/jaw/lip-shape API. Tumblefair's existing SVG portraits remain 2D-renderer portraits.
- **Visual asset policy:** saved avatar JSON remains unchanged; version selection is in the body builder.
- **Kestrel:** Thousandvale and Tumblefair can route through a Kestrel branch that returns before the Chibi factory. Decide explicitly whether `?chibi=2.6` is subordinate to Kestrel or whether those characters need a separate port.
