// Play-test 12 (stream W-anim): which clip a swimming or sitting body plays, with the hysteresis that keeps it from
// restarting. Pure — no three.js, no DOM — so tests/W/anim-rest.test.js can drive it frame by frame.
//
//   #88 "swimming is backwards (backstrokes)" — the shared `swim` clip lies face-up and travels feet first. A person in
//        the water now plays `swimCrawl` (face down, front crawl) when moving and `swimTread` (upright, treading water)
//        when still (avatar-3d/js/chibi2-motion-rest.js).
//   #88 "near the quay the swimming animation keeps restarting rapidly" — the swim FLAG flickered: the predictor's
//        reconcile (js/client/predict.js) rebuilt your state from the server's snapshot without `swim`, so for the frames
//        between a snapshot that acked every step and the next local step you were "not swimming", the body went to
//        idle and the next frame `setAnim('swim')` reset the stroke to its first frame. Fixed at the source (predict.js)
//        AND here: the body only stops swimming after the flag has been off for SWIM_OFF_MS, and the stroke only
//        switches between crawl and tread with a gap between the two speed thresholds.
//   #76 "the sitting animation loops and the character keeps sitting down again" — the shared `sitGround` clip eases
//        down over the first 35% of a 3.4 s LOOP. It now plays once (SIT_DOWN_MS) and hands over to `sitHold`.


export const SWIM_OFF_MS = 350;        // the swim flag must stay off this long before the body climbs out of the stroke
export const CRAWL_ON = 0.6, CRAWL_OFF = 0.25;   // m/s: start the crawl above CRAWL_ON, go back to treading below CRAWL_OFF
/** How long `sitGround` takes to get the body down; the same number as avatar-3d/js/chibi2-motion-rest.js SIT_DOWN_MS
 *  (kept here so this file stays free of three.js; tests/W/anim-rest.test.js checks the two agree). */
export const SIT_DOWN_MS = 1150;

/** The swim flag the body acts on: on at once, off only after SWIM_OFF_MS of `raw` being false. Keeps state on `a`. */
export function latchSwim(a, raw, now) {
  if (raw) { a.swimOffAt = null; a.swimLatched = true; return true; }
  if (!a.swimLatched) return false;
  if (a.swimOffAt == null) a.swimOffAt = now;
  if (now - a.swimOffAt >= SWIM_OFF_MS) { a.swimLatched = false; a.swimOffAt = null; return false; }
  return true;
}

/** Crawl or tread for a swimmer moving at `speed`, with hysteresis (state on `a`). */
export function swimClip(a, speed) {
  if (a.crawling) { if (speed < CRAWL_OFF) a.crawling = false; }
  else if (speed > CRAWL_ON) a.crawling = true;
  return a.crawling ? 'swimCrawl' : 'swimTread';
}

/**
 * The clip to play for `want` (the clip actors.js chose), turning the looping ones into what they should look like:
 * `swim` -> crawl / tread; `sitGround` -> `sitGround` for SIT_DOWN_MS from when the body sat, then `sitHold`.
 * A body that stops sitting forgets when it sat (the next sit goes down again).
 */
export function restClip(a, want, now, speed = 0) {
  if (want === 'sitGround') {
    if (a.satAt == null) a.satAt = now;
    return now - a.satAt < SIT_DOWN_MS ? 'sitGround' : 'sitHold';
  }
  a.satAt = null;
  if (want === 'swim') return swimClip(a, speed);
  a.crawling = false;
  return want;
}
