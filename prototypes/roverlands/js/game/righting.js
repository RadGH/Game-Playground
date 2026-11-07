// Putting a tipped-over vehicle back on its wheels (iPhone report #5, 2026-10-25: "I wrecked and my vehicle doesn't
// flip over"). Pure: the session asks it once a frame for the vehicle its player drives.
//
//   const r = createRighting();
//   r.step({ up, speed, dt, press })  -> { tipped, right }
//     up     how upright the body is: the world-y of its up axis (1 = level, 0 = on its side, -1 = on its roof)
//     speed  m/s; a vehicle still rolling or sliding is left alone so it can finish falling (or land a flip)
//     press  the player asked (FLIP button, or R held long enough)
//   tipped  it is on its side or roof and nearly still: the phone shows the FLIP button
//   right   put it back on its wheels now (by itself after AUTO_AFTER seconds, at once on a press)
export const TIPPED_UP = 0.55, STILL_SPEED = 2, AUTO_AFTER = 3;

export function createRighting({ autoAfter = AUTO_AFTER } = {}) {
  let stuckFor = 0;
  return {
    step({ up, speed, dt, press = false }) {
      const tipped = up < TIPPED_UP && speed < STILL_SPEED;
      if (!tipped) { stuckFor = 0; return { tipped: false, right: false }; }
      stuckFor += dt;
      if (press || stuckFor >= autoAfter) { stuckFor = 0; return { tipped: true, right: true }; }
      return { tipped: true, right: false };
    },
    get stuckFor() { return stuckFor; },
    reset() { stuckFor = 0; },
  };
}
