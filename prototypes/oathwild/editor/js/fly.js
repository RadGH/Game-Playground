// The editor's free camera: WASD (or the arrow keys) to fly, the mouse (right button, or the left one with the Look
// tool) to turn, Q / E down / up, Shift faster, the wheel forward / back. On a phone: drag to turn, the stick to move,
// the two buttons up / down. Never goes under the ground.
//
//   const fly = createFly(camera, canvas, { heightAt, lookWithLeft: () => bool })
//   fly.update(dt)   fly.jump(x, z, { height, yaw, pitch })   fly.pos / fly.yaw / fly.pitch   fly.stick (touch input)
export function createFly(camera, canvas, { heightAt, lookWithLeft = () => true, blocked = () => false }) {
  const keys = new Set();
  const F = {
    pos: { x: -252, y: 40, z: 60 }, yaw: Math.PI, pitch: -0.45, speed: 22,
    stick: { x: 0, y: 0 }, lift: 0, dragging: false, lastDragMoved: 0,
    update(dt) {
      if (blocked()) keys.clear();
      const fast = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4 : 1;
      const v = F.speed * fast * dt * (1 + Math.max(0, F.pos.y - heightAt(F.pos.x, F.pos.z)) / 80);
      let f = 0, s = 0, u = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
      if (keys.has('KeyE') || keys.has('PageUp')) u += 1;
      if (keys.has('KeyQ') || keys.has('PageDown')) u -= 1;
      f += -F.stick.y; s += F.stick.x; u += F.lift;
      // forward = where the camera looks, flattened (flying level feels steadier than flying into the ground)
      const fx = -Math.sin(F.yaw), fz = -Math.cos(F.yaw), rx = Math.cos(F.yaw), rz = -Math.sin(F.yaw);
      F.pos.x += (fx * f + rx * s) * v; F.pos.z += (fz * f + rz * s) * v; F.pos.y += u * v;
      const floor = heightAt(F.pos.x, F.pos.z) + 1.6;
      if (F.pos.y < floor) F.pos.y = floor;
      F.pos.y = Math.min(F.pos.y, 700);
      camera.position.set(F.pos.x, F.pos.y, F.pos.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(F.pitch, F.yaw, 0);
    },
  };
  // camera.rotation.y = yaw looks toward (−sin yaw, −cos yaw): jump() stands `back` metres behind the spot
  F.jump = (x, z, { height = 45, yaw = F.yaw, pitch = -0.6, back = 50 } = {}) => {
    F.yaw = yaw; F.pitch = pitch;
    F.pos.x = x + Math.sin(yaw) * back; F.pos.z = z + Math.cos(yaw) * back;
    F.pos.y = Math.max(heightAt(x, z) + height, heightAt(F.pos.x, F.pos.z) + 3);
  };
  const typing = e => /input|textarea|select/i.test(e.target?.tagName || '') || e.target?.isContentEditable;
  addEventListener('keydown', e => { if (typing(e) || e.ctrlKey || e.metaKey) return; keys.add(e.code); });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  // turning: right drag anywhere; left drag with the Look tool; one finger on a phone (when not on a control)
  let drag = null;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (e.button === 2 || (e.button === 0 && lookWithLeft(e)) || e.pointerType === 'touch' && lookWithLeft(e)) {
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 }; F.dragging = true;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* fine */ }
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    const k = e.pointerType === 'touch' ? 0.006 : 0.0045;
    F.yaw -= dx * k; F.pitch = Math.max(-1.5, Math.min(1.2, F.pitch - dy * k));
  });
  const up = e => { if (drag && e.pointerId === drag.id) { F.lastDragMoved = drag.moved; drag = null; F.dragging = false; } };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const d = -Math.sign(e.deltaY) * (6 + Math.max(0, F.pos.y - heightAt(F.pos.x, F.pos.z)) * 0.15);
    const cp = Math.cos(F.pitch);
    F.pos.x += -Math.sin(F.yaw) * cp * d; F.pos.z += -Math.cos(F.yaw) * cp * d; F.pos.y += Math.sin(F.pitch) * d;
  }, { passive: false });
  return F;
}
