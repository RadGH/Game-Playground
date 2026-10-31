// Where a stopped vehicle may stand, and how it stays there. Pure, so node tests read it.
/**
 * Nobody at the pedals. In a Roverlands car the brake pedal IS reverse below 1 m/s, so a car "held on the brake" backs away at walking pace for ever. That is what the parked fire truck
 * did, and every summoned car: it left the kerb while you walked to it. So: brake only while really rolling forwards, roll-back is stopped with the gas, and at rest no pedal at all
 * (the body settles and sleeps by itself).
 */
export function restPedals(v) { return v > 1 ? { gas: 0, brake: 0.8 } : v < -1 ? { gas: 0.3, brake: 0 } : { gas: 0, brake: 0 }; }

/** A house garage, in metres (js/sim/interior.js builds the room, js/client/modern-kit.js the door). */
export const GARAGE = { doorW: 2.7, doorH: 2.5, roomW: 3.5, roomD: 4.7 };
const AIR = 0.12;   // each side
/** Does this body go through the door and shut in? dims = { len, width, height }. Anything that does not stands on the drive. */
export const fitsGarage = (d, g = GARAGE) => d.width + AIR * 2 <= g.doorW && d.height + AIR <= g.doorH && d.len + 0.1 <= g.roomD;
