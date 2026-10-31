// Small staged scenes (PLAN M6, the brief's "social interactions"): a date, a row, a proposal plays as a short sketch. The sim has really brought the two people to one spot; this frames
// them low and close, side on, so both stand on a phone in portrait, gives them a line each in turn with their own voices and a clip to act with, and puts the words in big type along the
// bottom. Nothing pauses. Touch, keys and controller: the bar is two real buttons; tap, E, Enter or A for the next line, Esc or B to leave.
//   const stage = createStage({ ... });  stage.play({ scene, a, b, place });  stage.camera(dt);  stage.pad(s);  stage.end();  stage.state()
import { hashText } from './looks.js';

const BEAT = 3.6, FIRST = 0.9, END = 2.6;

export function createStage({ camera, town, people, god, talk, voice, voiceOn, profileFor, bubbles, el, parent, buildings, setHud, onBegin = () => {}, onEnd = () => {}, words = () => null }) {
  const name = el('b', { class: 'od-sname' }), text = el('p', { class: 'od-sline' });
  const next = el('button', { type: 'button', class: 'od-sbtn go', text: 'Next', on: { click: () => self.skip() } }), leave = el('button', { type: 'button', class: 'od-sbtn', text: 'Leave', on: { click: () => self.end() } });
  const bar = el('div', { class: 'od-scenebar', hidden: '', role: 'status' }, name, text, el('div', { class: 'od-sbtns' }, next, leave));
  const top = el('div', { class: 'od-lbox top', hidden: '' }), bot = el('div', { class: 'od-lbox bot', hidden: '' });
  parent.append(top, bot, bar);
  let now = null;
  const stage = new Map(), cam = { x: 0, y: 0, z: 0, ready: false }, look = { x: 0, y: 0, z: 0 };
  const first = id => town.roster.people[id].name.split(' ')[0];
  function line(i) {
    const S = now.S, [role, step, clip] = S.beats[i], id = role === 'a' ? now.a : now.b, other = role === 'a' ? now.b : now.a, r = town.roster.people;
    const out = talk()?.say({ ...r[id], id }, `od_scene_${now.scene}_${step}`, { listener: { ...r[other], id: other }, words: words() }) ?? null;
    stage.set(id, { anim: clip, face: other }); stage.set(other, { anim: 'idle', face: id });
    name.textContent = first(id);
    text.textContent = out?.text ?? '…';
    now.spoken += out ? 1 : 0; now.quiet += out ? 0 : 1;
    if (out) { bubbles.show(id, out.text, BEAT, 'od-stagebub'); if (voiceOn()) voice.speak(profileFor({ ...r[id], id }), out.text, { engine: r[id].voice?.engine ?? 'formant', priority: 3, speaker: id }); }
    now.left = BEAT;
  }
  const self = {
    stage,
    get on() { return !!now; },
    /** e = { scene, a, b, place } */
    play(e) {
      if (now) self.end();
      const S = town.roster.scenes[e.scene]; if (!S) return false;
      now = { ...e, S, i: -1, left: FIRST, spoken: 0, quiet: 0, done: false };
      cam.ready = false;
      bar.hidden = top.hidden = bot.hidden = false;
      name.textContent = S.label; text.textContent = `${first(e.a)} and ${first(e.b)}`;
      setHud(false); onBegin(e);
      const pl = town.roster.places[e.place];
      if (pl) god.goTo(pl.x, pl.z, 18);
      return true;
    },
    /** The sim's word on how it went: the last thing on screen. */
    result(t) { if (!now) return; name.textContent = now.S.label; text.textContent = t; now.done = true; now.i = 1e9; now.left = END; },
    skip() { if (!now) return; if (now.done && now.i >= 1e9) { self.end(); return; } now.left = 0; },
    end() {
      if (!now) return;
      const was = now; now = null; stage.clear(); bubbles.clear(); bar.hidden = top.hidden = bot.hidden = true; setHud(true); onEnd(was);
    },
    frame(dt) {
      if (!now) return;
      now.left -= dt;
      if (now.left > 0) return;
      now.i++;
      if (now.i < now.S.beats.length) line(now.i); else if (now.done || now.i > now.S.beats.length + 1) self.end(); else now.left = 2.4;      // the sim has a moment to say how it went
    },
    /** After god.update: low, close and side on. Both faces on a phone in portrait. */
    camera(dt) {
      if (!now) return;
      const A = people.spots.get(now.a), B = people.spots.get(now.b);
      if (!A || !B || A.hidden || B.hidden) return;
      const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2, y = Math.max(A.y, B.y), gap = Math.hypot(A.x - B.x, A.z - B.z), pl = town.roster.places[now.place], b = pl && buildings.get(pl.building);
      let dx = b ? Math.sin(b.yaw) : (B.z - A.z) / (gap || 1), dz = b ? Math.cos(b.yaw) : -(B.x - A.x) / (gap || 1);
      const turn = ((hashText(`${now.a}/${now.b}`) % 5) - 2) * 0.09, c = Math.cos(turn), s = Math.sin(turn), rx = dx * c - dz * s, rz = dx * s + dz * c; dx = rx; dz = rz;
      const half = Math.tan(camera.fov * Math.PI / 360) * camera.aspect, d = Math.max(4.4, (gap + 2) / (2 * half));
      const tx = mx + dx * d, tz = mz + dz * d, ty = y + 2.2, k = cam.ready ? Math.min(1, dt * 3) : 1;
      cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.z += (tz - cam.z) * k; look.x = mx; look.y = y + 1.35; look.z = mz; cam.ready = true;
      camera.up.set(0, 1, 0); camera.position.set(cam.x, cam.y, cam.z); camera.lookAt(look.x, look.y, look.z); camera.updateMatrixWorld();
    },
    pad(s) { if (!now) return; if (s.jump && !self.wasA) self.skip(); if (s.boost && !self.wasB) self.end(); self.wasA = s.jump; self.wasB = s.boost; },
    state: () => (now ? { scene: now.scene, i: now.i, a: now.a, b: now.b, text: text.textContent, spoken: now.spoken, quiet: now.quiet, done: now.done, cam: cam.ready } : null),
  };
  addEventListener('keydown', e => { if (!now || /INPUT|TEXTAREA/.test(e.target?.tagName || '')) return; if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); self.skip(); } else if (e.code === 'Escape') { e.stopPropagation(); self.end(); } }, true);
  return self;
}
