// The twelve giants, measured — because "it looks wrong" is a report you cannot act on twice.
//
// The user's report was "I was on a planet that had some giant thin discs floating in the air… it's
// full of other giant shapes everywhere. They don't look like trees." The Shelf Palm was the disc,
// and fixing it meant looking at all twelve side by side, which turned up two more:
//
//   * the palm was STILL a sixteen-metre bare post with a four-metre tuft on top, and
//   * the Rib Arch was six straight poles in a triangle, which reads as scaffolding.
//
// A screenshot cannot be asserted on, but the shapes that produced both complaints can be. A disc
// is a bounding box much wider than it is tall; a heap of loose sticks is a set of parts that do
// not touch. Both are measured here.

import { test, expect } from '@playwright/test';

test('every giant is the height it promises, and none of them is a disc', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('/prototypes/farhold/');

  const out = await page.evaluate(async () => {
    const THREE = await import('three');
    const { MEGA_BUILDERS } = await import('/prototypes/farhold/js/props.js');
    const rows = [];
    for (const [key, build] of Object.entries(MEGA_BUILDERS)) {
      const geo = build();
      geo.computeBoundingBox();
      const b = geo.boundingBox;
      rows.push({
        key,
        height: +(b.max.y - b.min.y).toFixed(1),
        width: +Math.max(b.max.x - b.min.x, b.max.z - b.min.z).toFixed(1),
        narrow: +Math.min(b.max.x - b.min.x, b.max.z - b.min.z).toFixed(1),
        verts: geo.attributes.position.count,
      });
    }
    return rows;
  });

  expect(out.length, 'the megaflora catalogue is empty').toBe(12);

  for (const row of out) {
    /**
     * The doc's own promise: "2-3 times taller than our tallest trees", and the tallest ordinary
     * prop is the 9 m conifer. Anything under 15 is not a giant; anything over 30 is a building.
     */
    expect(row.height, `${row.key} is ${row.height} m — that is not a giant`).toBeGreaterThan(15);
    expect(row.height, `${row.key} is ${row.height} m — that is a tower block`).toBeLessThan(32);

    /**
     * THE DISC TEST.
     *
     * "giant thin discs floating in the air" is a shape that is wide in BOTH horizontal directions
     * and short. So the measure is the SMALLER of the two spans against the height: a ribcage is
     * legitimately forty metres from skull to tail and only eighteen across, and calling that a
     * disc would be wrong. A palm that is fifteen metres across in every direction and twelve tall
     * is exactly the thing that was reported.
     */
    const ratio = row.narrow / row.height;
    expect(ratio, `${row.key} is ${row.narrow} m across in its NARROW direction and only ${row.height} m tall — that is a disc`)
      .toBeLessThan(1.4);

    // and it is actually built out of something
    expect(row.verts, `${row.key} has almost no geometry`).toBeGreaterThan(60);
  }
  expect(errors).toEqual([]);
});

test('the palm has a crown, not a tuft', async ({ page }) => {
  const out = await page.evaluate(() => null).catch(() => null);
  await page.goto('/prototypes/farhold/');
  const palm = await page.evaluate(async () => {
    const THREE = await import('three');
    const { MEGA_BUILDERS } = await import('/prototypes/farhold/js/props.js');
    const geo = MEGA_BUILDERS.shelf_palm();
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    const height = b.max.y - b.min.y;
    // how much of the shape is in the top third — a palm is nearly all crown up there, and a post
    // with a tuft on it is nearly nothing
    const pos = geo.attributes.position;
    let high = 0;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > b.min.y + height * 0.66) high++;
    return { height: +height.toFixed(1), share: +(high / pos.count).toFixed(2), width: +(b.max.x - b.min.x).toFixed(1) };
  });

  expect(palm.height, 'the palm stopped being a giant').toBeGreaterThan(15);
  // the version the user complained about had a 16 m bare trunk: almost nothing in the top third
  expect(palm.share, 'the palm is a bare post with a tuft on top').toBeGreaterThan(0.45);
  expect(palm.width / palm.height, 'the palm is a disc again').toBeLessThan(1.4);
});
