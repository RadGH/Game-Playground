// Device registry + seats.
//
// A DEVICE produces a DeviceFrame every frame (keyboard.js, gamepad.js). A SEAT is a local player
// slot that owns exactly one device. Nothing here knows about the sim; js/input/commands.js does
// the translating, and the lobby does the claiming:
//   - `onJoin(fn)` fires when an UNCLAIMED device presses its `join` action (Enter/Space, A/Start),
//   - the lobby calls `claim(deviceId, slotKey)`; press again = ready; `leave` = unready, then leave.
//
// Duplicate pads (PLAN §9.3): Steam and some drivers expose one physical pad twice. If two pads
// with the same id press the same buttons in the same frame, the later index is marked
// `duplicate` and ignored from then on (until it disconnects).

import { createKeyboardDevice } from './keyboard.js';
import { pollGamepads, gamepadsAvailable } from './gamepad.js';

export function createDeviceManager({ root }) {
  const devices = new Map();          // id -> device
  const seats = new Map();            // slot key -> { slot, deviceId }
  const joinListeners = new Set();
  const frames = new Map();           // id -> last DeviceFrame

  const kbm = createKeyboardDevice({ root });
  devices.set(kbm.id, kbm);

  function addDevice(dev) { devices.set(dev.id, dev); }
  function removeDevice(id) {
    const dev = devices.get(id); if (!dev || dev === kbm) return;
    devices.delete(id);
    dev.destroy?.();
  }

  function claim(deviceId, slot) {
    for (const [s, seat] of seats) if (seat.deviceId === deviceId) seats.delete(s);
    seats.set(slot, { slot, deviceId });
  }
  function release(slot) { seats.delete(slot); }
  function releaseAll() { seats.clear(); }
  function seatOf(deviceId) { for (const seat of seats.values()) if (seat.deviceId === deviceId) return seat; return null; }

  /** Poll every device once per frame. Returns Map<deviceId, DeviceFrame>. */
  function poll() {
    pollGamepads({ devices, addDevice, removeDevice });
    frames.clear();
    const padPresses = [];
    for (const dev of devices.values()) {
      const f = dev.poll();
      if (dev.duplicate) {
        if (!dev.connected) dev.duplicate = false;
        continue;                     // a ghost of another pad: never produces input
      }
      frames.set(dev.id, f);
      if (dev.type === 'gamepad' && f.rawPressed.length) padPresses.push({ dev, key: dev.padId + '|' + f.rawPressed.slice().sort().join(',') });
    }
    // Same model, same buttons, same frame -> the higher index is a duplicate.
    for (let i = 0; i < padPresses.length; i++) for (let j = 0; j < i; j++) {
      if (padPresses[i].key === padPresses[j].key && !padPresses[j].dev.duplicate) {
        const ghost = padPresses[i].dev.index > padPresses[j].dev.index ? padPresses[i].dev : padPresses[j].dev;
        ghost.duplicate = true;
        frames.delete(ghost.id);
        for (const [s, seat] of seats) if (seat.deviceId === ghost.id) seats.delete(s);
      }
    }
    for (const [id, f] of frames) {
      if (f.pressed.has('join') && !seatOf(id)) for (const fn of joinListeners) fn(devices.get(id), f);
    }
    return frames;
  }

  return {
    devices, seats, kbm, frames,
    addDevice, removeDevice, claim, release, releaseAll, seatOf, poll,
    gamepadsAvailable,
    frameFor(slot) { const seat = seats.get(slot); return seat ? frames.get(seat.deviceId) : null; },
    deviceFor(slot) { const seat = seats.get(slot); return seat ? devices.get(seat.deviceId) : null; },
    get(id) { return devices.get(id); },
    onJoin(fn) { joinListeners.add(fn); return () => joinListeners.delete(fn); },
    destroy() { for (const d of devices.values()) d.destroy?.(); devices.clear(); },
  };
}
