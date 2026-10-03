// Gamepad layouts (PLAN §9.4).
//
// Chrome usually reports `mapping: "standard"`; Firefox on Linux often reports `""` and raw
// indices that depend on the driver. Each layout maps raw button / axis indices to the names the
// bindings use: A B X Y LB RB LT RT View Menu L3 R3 DUp DDown DLeft DRight Guide, and the axes
// LX LY RX RY (+ triggers / hat axes on raw layouts).
//
// Per-device-type overrides from a remap screen are merged on top by gamepad.js (later milestone).

export const STANDARD = {
  name: 'standard',
  buttons: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', 'DUp', 'DDown', 'DLeft', 'DRight', 'Guide'],
  axes: { LX: 0, LY: 1, RX: 2, RY: 3 },
};

// Xbox 360 / One / 8BitDo (X-input mode) under the Linux xpad driver, as Firefox reports them:
// triggers are axes 2 and 5 (-1 released, +1 pulled), the d-pad is a hat on axes 6/7.
export const XINPUT_LINUX = {
  name: 'xinput-linux',
  buttons: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'View', 'Menu', 'Guide', 'L3', 'R3'],
  axes: { LX: 0, LY: 1, RX: 3, RY: 4 },
  triggerAxes: { LT: 2, RT: 5 },
  hat: { x: 6, y: 7 },
};

// DualShock 4 / DualSense under hid-sony / hid-playstation (Firefox, empty mapping).
export const SONY_LINUX = {
  name: 'sony-linux',
  buttons: ['A', 'B', 'Y', 'X', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'Guide', 'L3', 'R3'],
  axes: { LX: 0, LY: 1, RX: 3, RY: 4 },
  triggerAxes: { LT: 2, RT: 5 },
  hat: { x: 6, y: 7 },
};

/** Pick the layout for a Gamepad object. */
export function layoutFor(pad) {
  if (pad.mapping === 'standard') return STANDARD;
  const id = (pad.id || '').toLowerCase();
  if (/054c|sony|playstation|dualshock|dualsense|wireless controller/.test(id)) return SONY_LINUX;
  return XINPUT_LINUX;     // Xbox, 8BitDo, most generic X-input pads
}

/** A friendly label for the lobby ("Xbox controller", "PlayStation controller"...). */
export function padLabel(pad) {
  const id = (pad.id || '').toLowerCase();
  if (/054c|sony|playstation|dualshock|dualsense|wireless controller/.test(id)) return 'PlayStation controller';
  if (/045e|xbox|x-box|xinput/.test(id)) return 'Xbox controller';
  if (/2dc8|8bitdo/.test(id)) return '8BitDo controller';
  return 'Controller';
}
