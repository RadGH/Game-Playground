// Third-person camera: orbits the player (or the vehicle they ride) with the mouse / right stick; when you stop
// looking while driving it swings back in behind the direction of travel, like the old jeep shooters. It never goes
// into the ground or through a cliff (a ray from the target to where it wants to be).
//
//   const cam = createCamera(THREE, camera, phys);
//   cam.update(dt, { target: [x,y,z], height, dist, vel: [x,y,z] | null, heading, look: { x, y, active }, exclude })
//   cam.yaw / cam.pitch   (the aim: the gunner's turret and on-foot facing read these)
export function createCamera(THREE, camera, phys) {
  const self = { yaw: 0, pitch: 0.25, distScale: 1, idle: 0 };
  const pos = new THREE.Vector3(), look = new THREE.Vector3(), want = new THREE.Vector3();
  let first = true;
  self.update = (dt, o) => {
    const { target, height = 1.6, dist = 5, vel = null, look: l, follow = false, exclude = null } = o;
    self.yaw -= l.x; self.pitch = Math.max(-0.6, Math.min(1.25, self.pitch + l.y));
    if (l.active) self.idle = 0; else self.idle += dt;
    // swing in behind the vehicle: only when moving and the player has left the camera alone a moment
    if (follow && vel && self.idle > 1.2) {
      const sp = Math.hypot(vel[0], vel[2]);
      if (sp > 3) {
        const behind = Math.atan2(vel[0], vel[2]);
        let d = behind - self.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        self.yaw += d * Math.min(1, dt * 1.6 * Math.min(1, (sp - 3) / 6));
        self.pitch += (0.22 - self.pitch) * Math.min(1, dt * 0.8);
      }
    }
    const D = dist * self.distScale;
    look.set(target[0], target[1] + height, target[2]);
    const cp = Math.cos(self.pitch), sp = Math.sin(self.pitch);
    want.set(look.x - Math.sin(self.yaw) * cp * D, look.y + sp * D, look.z - Math.cos(self.yaw) * cp * D);
    // pull in toward the target if something solid is in the way
    const dx = want.x - look.x, dy = want.y - look.y, dz = want.z - look.z, L = Math.hypot(dx, dy, dz);
    const hit = phys?.raycast([look.x, look.y, look.z], [dx / L, dy / L, dz / L], L, { exclude });
    if (hit && hit.t < L) want.set(look.x + dx / L * (hit.t - 0.3), look.y + dy / L * (hit.t - 0.3), look.z + dz / L * (hit.t - 0.3));
    const gy = phys?.world.heightAt(want.x, want.z) ?? -1e9;
    if (want.y < gy + 0.4) want.y = gy + 0.4;
    if (first) { pos.copy(want); first = false; }
    else pos.lerp(want, Math.min(1, dt * 14));
    camera.position.copy(pos);
    camera.lookAt(look);
  };
  self.snap = () => { first = true; };
  /** World direction the camera aims along (horizontal yaw + pitch), for guns and walking. */
  self.aimDir = () => { const cp = Math.cos(self.pitch); return [Math.sin(self.yaw) * cp, -Math.sin(self.pitch), Math.cos(self.yaw) * cp]; };
  return self;
}
