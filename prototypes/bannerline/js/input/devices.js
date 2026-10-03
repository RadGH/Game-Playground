// Device registry + seats.
//
// A DEVICE produces a DeviceFrame every frame (see keyboard.js). A SEAT is a local player slot
// (sim player id) that owns exactly one device. M1 has one seat (the keyboard). M2 adds:
//   - gamepads polled every frame (they are invisible until a button is pressed),
//   - the lobby's ready-up flow: `onJoin(fn)` fires when an UNCLAIMED device presses its `join`
//     action, and the lobby calls `claim(deviceId, slot)`; press again = ready; `leave` = unready
//     then leave.
// Nothing here knows about the sim; js/input/commands.js does the translating.

import { createKeyboardDevice } from './keyboard.js';

export function createDeviceManager({ root }) {
  const devices = new Map();          // id -> device
  const seats = new Map();            // seat slot (sim player id) -> { slot, deviceId }
  const joinListeners = new Set();
  const frames = new Map();           // id -> last DeviceFrame

  const kbm = createKeyboardDevice({ root });
  devices.set(kbm.id, kbm);

  /** Gamepad hook for M2: js/input/gamepad.js registers its devices here. */
  function addDevice(dev) { devices.set(dev.id, dev); }
  function removeDevice(id) {
    const dev = devices.get(id); if (!dev) return;
    devices.delete(id);
    dev.destroy?.();
  }

  function claim(deviceId, slot) {
    for (const [s, seat] of seats) if (seat.deviceId === deviceId) seats.delete(s);
    seats.set(slot, { slot, deviceId });
  }
  function release(slot) { seats.delete(slot); }
  function seatOf(deviceId) { for (const seat of seats.values()) if (seat.deviceId === deviceId) return seat; return null; }

  /** Poll every device once per frame. Returns Map<deviceId, DeviceFrame>. */
  function poll() {
    frames.clear();
    for (const dev of devices.values()) {
      const f = dev.poll();
      frames.set(dev.id, f);
      if (f.pressed.has('join') && !seatOf(dev.id)) for (const fn of joinListeners) fn(dev, f);
    }
    return frames;
  }

  return {
    devices, seats, kbm,
    addDevice, removeDevice, claim, release, seatOf, poll,
    frameFor(slot) { const seat = seats.get(slot); return seat ? frames.get(seat.deviceId) : null; },
    deviceFor(slot) { const seat = seats.get(slot); return seat ? devices.get(seat.deviceId) : null; },
    onJoin(fn) { joinListeners.add(fn); return () => joinListeners.delete(fn); },
    destroy() { for (const d of devices.values()) d.destroy?.(); devices.clear(); },
  };
}
