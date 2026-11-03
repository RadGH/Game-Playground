# Chibi 2.6 adoption notes — proposal only

No game files have been edited. Keep this as the review plan for a separate owner-approved adoption task.

## 1. Thousandvale

All Thousandvale humanoids already route through `prototypes/thousandvale/js/client/chibi-version.js` → `createTvBody`, so a central opt-in would cover players, NPCs, portraits, warm-up builds and the shop mannequin. Preserve the current `?chibi=2` escape hatch and 2.5 default. Proposed change in `chibi-version.js`:

```js
export function chibiVersion(search = '') {
  if (/(?:^|[?&])chibi=2(?:&|$)/.test(String(search || ''))) return 2;
  return /(?:^|[?&])chibi=2\.6(?:&|$)/.test(String(search || '')) ? 2.6 : 2.5;
}
export const tvChibiOpts = (opts = {}, v = CHIBI_V) =>
  v >= 2.6 ? { ...opts, v25: true, v26: true } : v >= 2.5 ? { ...opts, v25: true } : { ...opts };
```

`createTvBody` already forwards the option to both `prepareChibi2` and `createChibi2Character`; Avatar 3D now preserves `v26` in preparation. Keep the existing sliced warm-up and run `tests/D/chibi25-tv.test.js`, crowd timing, mount fit and portrait coverage before enabling the query in a game review.

## 2. Tumblefair

`prototypes/tumblefair/js/client/avatars.js` already imports `createTvBody` from Thousandvale's central wrapper. Its actor build at line 71 and the two Kestrel fallback builds at lines 330 and 340 pass their animation lists through that wrapper. **No Tumblefair source line needs to change** for a query-driven experiment; opening Tumblefair with `?chibi=2.6` would use the shared switch after Thousandvale's wrapper change. The player portrait still calls Tumblefair's `svgPortrait` path, which is the shared 2D renderer; the 3D `svgPortrait` helper in this branch is available to replace that only if the owner wants a 2.6-specific portrait review.

To pin Tumblefair independently instead of inheriting the shared query, the optional call-site change is:

```js
let body = await createTvBody(avatarOf(m.look, m.costume), {
  anims: ANIMS,
  ...(new URLSearchParams(location.search).get('chibi') === '2.6' ? { v25: true, v26: true } : {}),
});
```

Use the same option at its Kestrel fallback calls only after deciding whether Kestrel remains higher priority. The current `createTvBody` returns Kestrel immediately when that mode is active, so `v26` is not applied there.

## Risks and required rollout checks

- **Graphics and body choices:** the shared factory now accepts `graphics: 'low'` to build 2.6 without its procedural maps (high is the default), and `body.form` / `body.chestSize` carry the feminine Flat/Round choice in avatar JSON. A game can pass its existing quality preference through the same factory options; no game is wired to the new setting here. Current maps cover two shared material buckets rather than separate authored cloth, leather, wood and metal sets.
- **Crowd cost:** 2.6 has two merged meshes and passes the triangle ceiling, but 30-character mid-range phone timing has not been measured. Warm-up with 2.6 clip lists, measure first-build stalls and steady 60 fps before enabling it broadly.
- **Clearance:** `data/chibi26-clipping.json` reports 601 body-solid pair events across the four-look proxy sweep and skirt hits in ten clips. These proxies need art review; outfits should not be treated as clear.
- **Mount/vehicle fit:** `seatRider` works with the new actor and the metric wagon API runs, but the fit scene does not establish real seat/wheel comfort for every mount or vehicle. Recheck Thousandvale mounts at full scale before rollout.
- **Expressions and portraits:** 2.6 retains 2.5 blinking and gaze. There is no new expression/jaw/lip-shape API. Tumblefair's existing SVG portraits remain 2D-renderer portraits.
- **Visual asset policy:** keep saved avatar JSON unchanged; choose 2.6 in the body builder option. Do not rewrite saves or change the default until the owner approves the rollout.
- **Kestrel:** Thousandvale and Tumblefair can route through a Kestrel branch that returns before the Chibi factory. Decide explicitly whether `?chibi=2.6` is subordinate to Kestrel or whether those characters need a separate port.
