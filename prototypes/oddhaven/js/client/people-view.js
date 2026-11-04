// People on screen (PLAN §2 "People, detail levels"). The sim sends the near people; this draws the 10 nearest what the
// camera is centred on as real Chibi 2.5 bodies, the next 60 as stand-ins, and nobody else. People indoors are drawn only when
// their building is open (indoors.js walks them to their chair). Walkers follow the pavement (js/world/pavement.js); a driver
// sits in their car.
//
// A body is built by one queue, one at a time, in slices (`prepareChibi2`), never inside a frame: until theirs is ready a
// person is a stand-in, so nothing waits and the frame never hitches.
import { createChibi2Character, prepareChibi2 } from '../../../../avatar-3d/js/chibi2.js';
import { pathAt, parkAt } from '../world/pavement.js';
import { moodIndex } from './mood.js';
import { createStandIns } from './standin.js';
import { createMoodMarks, SIGN } from './mood-marks.js';
import { hashText } from './looks.js';
import { LIFE_ANIMS } from './life-clips.js';
import { indoorScale, DOOR_CLEAR } from '../sim/interior.js';

const FIRE_CLIPS = { spray: 'lifeHose', force: 'lifeChop', hose: 'lifeLift', hook: 'lifeLift', lift: 'lifeLift', haul: 'lifeCarry', go: 'walk', wait: 'idle', run: 'walk' };
const AT_JOB = new Set(['fire_work', 'police_work', 'fight_work', 'questioned', 'flee']);
export const ANIMS = ['idle', 'walk', 'talk', 'wave', 'sit', 'drink', 'laugh', 'shrug', 'nod', 'crossArms', ...LIFE_ANIMS];
const CLIPS = { chat: 'talk', phone_friend: 'talk', coffee: 'drink', browse_shops: 'idle', work: 'idle', meet_wait: 'idle' };
const STROLL_METRES_PER_TICK = 0.45;
const KEEP_LOOKS = 24;     // templates a phone keeps ready: ten bodies, what they just took off and a few more
const FIT_RATE = 0.9, DUCK = 0.42;    // body scale a second at the door; how far forward someone tall bends going through
const SKY_MAX = 30, SKY_FROM = 150, FULL = 10, STAND = 60, WALK_CLIP_SPEED = 2.3, BODY_SCALE = 1.35;   // Chibi bodies are built a metre and a bit tall: next to a car and a door that reads as a toddler
const CLOSED = new Set(['sedan', 'semi_truck']);                 // nobody can see in: a body would be wasted on the driver

export function createPeopleView({ THREE, scene, world, town, looks, paths, cars, carTypes, vdefs, indoors = null, floorOf = null, timber = null, isOpenAt = null, fullMax = FULL, standInMax = STAND }) {
  const group = new THREE.Group(); group.name = 'people'; scene.add(group);
  const stand = createStandIns({ THREE, cap: standInMax }), marks = createMoodMarks({ THREE, cap: fullMax + standInMax + SKY_MAX });
  group.add(stand.mesh, marks.mesh);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.78, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd23c', transparent: true, opacity: 0.95, depthWrite: false }));
  ring.visible = false; ring.renderOrder = 3; group.add(ring);
  const buildings = new Map(world.buildings.map(b => [b.id, b])), blocks = new Map(world.blocks.map(b => [b.id, b]));
  const groundAt = (x, z) => {
    const B = world.bridge;
    if (B) { const dx = x - B.cx, dz = z - B.cz, a = dx * Math.sin(B.yaw) + dz * Math.cos(B.yaw), b = dx * Math.cos(B.yaw) - dz * Math.sin(B.yaw); if (Math.abs(a) < B.len / 2 + 1 && Math.abs(b) < B.halfW + 3) return B.deck; }
    return world.heightAt(x, z) + 0.06;
  };
  /** The pavement loop nearest a place, and how far round it their door is. Worked out once a building. */
  const laps = new Map();
  function strollOf(pl) {
    let lap = laps.get(pl.building);
    if (lap === undefined) {
      let best = null, d = 1e12;
      for (const b of world.blocks) for (let k = 0; k < 24; k++) { const q = parkAt(b, k / 24, 0, {}), e = (q.x - pl.x) ** 2 + (q.z - pl.z) ** 2; if (e < d) { d = e; best = { block: b, phase: k / 24 }; } }
      laps.set(pl.building, lap = best);
    }
    return lap;
  }
  // ---- where somebody is, right now. Returns false if they cannot be seen.
  const carByDriver = new Map(), seen = {};
  function locate(p, r, tick, out) {
    out.walking = false; out.anim = 'idle'; out.car = null; out.seat = 0; out.k = 1; out.inside = false; out.lie = false; out.lv = 0; out.carry = null;
    const trip = p.trip, roster = town.roster;
    if (p.a === 'site_work' && timber && p.at >= 0) return timber.place(p, tick, out);
    if (AT_JOB.has(p.a) && p.at >= 0) {       // on a fire, a call or a rift: between the two ends of what they are doing, like a timber worker
      const k = p.tk;
      if (!k) { if (p.x == null) return false; out.x = p.x; out.z = p.z; out.lv = 0; } else {
        const u = Math.max(0, Math.min(1, (tick - k.st) / Math.max(1, k.en - k.st))), mover = k.x0 !== k.x1 || k.z0 !== k.z1;
        out.x = k.x0 + (k.x1 - k.x0) * u; out.z = k.z0 + (k.z1 - k.z0) * u; out.lv = k.lv ?? 0;
        if (mover) { out.yaw = Math.atan2(k.x1 - k.x0, k.z1 - k.z0); out.walking = true; out.speed = 3.6; }
        out.anim = FIRE_CLIPS[k.k] ?? 'idle'; if (p.cy === 'person' && mover) out.anim = 'lifeCarry';
      }
      out.y = floorOf ? floorOf(out.x, out.z, out.lv) : groundAt(out.x, out.z);
      out.carry = p.cy ?? null;
      if (p.fg?.down) { out.lie = true; out.anim = 'lifeSleep'; out.walking = false; } else if (p.strikeT > tick) out.anim = 'lifeChop';
      return true;
    }
    if (p.a === 'carried' && p.by != null) {     // over someone's shoulder
      const q = spots.get(p.by);
      if (!q || q.hidden) return false;
      out.x = q.x + Math.cos(q.yaw ?? 0) * 0.3; out.z = q.z - Math.sin(q.yaw ?? 0) * 0.3; out.y = q.y + 1.5; out.yaw = (q.yaw ?? 0) + Math.PI / 2; out.lie = true; out.anim = 'lifeSleep'; out.lv = q.lv ?? 0; out.inside = !!q.inside;
      return true;
    }
    if (trip?.mode === 'held') {
      if (self.hands?.spot(p.i, out)) return true;
      // somebody else's: on the room's clock, a moment behind, between two things they really did
      const c = p.hold?.car >= 0 ? cars.byLive.get(p.hold.car) : null;
      if (c) { cars.pose(c, out); out.y += carTypes.get(c.type)?.lift ?? 0; out.car = c; out.seat = p.hold.seat; out.anim = 'sit'; out.walking = false; out.speed = 0; out.lv = 0; out.inside = false; return true; }
      const track = town.bodies.get(p.i), at = track?.read(town.serverNow(), seen) ?? (p.x == null ? null : { x: p.x, z: p.z, h: p.h ?? 0, lv: p.hold?.lv ?? 0, inside: p.hold?.inside ?? -1, speed: 0 });
      if (!at) return false;
      out.x = at.x; out.z = at.z; out.yaw = at.h; out.lv = at.lv; out.inside = at.inside >= 0;
      // indoors, the same rule as anyone: drawn at indoor size, and only while that building is open to you
      if (out.inside && !isOpenAt?.(at.inside, at.lv)) return false;
      out.y = floorOf ? floorOf(out.x, out.z, out.lv) : groundAt(out.x, out.z);
      out.speed = at.speed; out.walking = at.speed > 0.2; out.anim = out.walking ? 'walk' : 'idle';
      return true;
    }
    if (trip?.mode === 'walk') {
      const route = town.mirror.routes.get(trip.route);
      if (!route) return false;
      indoors?.cameBy(p.i, tick);
      if (indoors?.leaving(p, trip, tick, out)) return true;
      // handed back away from any door: this walk starts from exactly where they were left
      const a = trip.ox != null ? { x: trip.ox, z: trip.oz } : roster.places[trip.from], b = roster.places[trip.to];
      const path = paths.of(trip.route, route, a, b), late = p.exitTicks ?? 0;   // the walk to the door came out of the same trip, so the pavement picks it up
      pathAt(path, (tick - trip.start - late) / Math.max(1, trip.end - trip.start - late), out);
      out.walking = true; out.anim = 'walk'; out.speed = path.length / Math.max(1, trip.end - trip.start) * (roster.clock.ticksPerSecond);
      out.y = groundAt(out.x, out.z);
      return true;
    }
    if (trip?.mode === 'drive' || trip?.mode === 'ride') {
      const c = trip.mode === 'ride' ? cars.byTrip.get(trip.id) : carByDriver.get(p.i);
      if (!c) return false;
      cars.pose(c, out);
      out.y += carTypes.get(c.type)?.lift ?? 0;
      out.car = c; out.anim = 'sit'; out.seat = trip.mode === 'ride' ? 1 : 0;
      return true;
    }
    if (p.at == null || p.at < 0) return false;
    const pl = roster.places[p.at];
    if (p.a === 'stroll') {
      // out along the pavement round their own block and back to the door, so they end where they started
      const lap = strollOf(pl);
      if (lap) {
        const u = Math.max(0, Math.min(1, (tick - (p.st ?? tick)) / Math.max(1, (p.un ?? tick + 1) - (p.st ?? tick)))), reachOut = Math.min(0.45, (p.un - p.st) * STROLL_METRES_PER_TICK / 2 / lap.block.len);
        const back = u > 0.5, dir = hashText(String(p.i)) % 2 ? 1 : -1;
        parkAt(lap.block, lap.phase + dir * reachOut * (back ? 2 - 2 * u : 2 * u), ((hashText(String(p.i)) >> 3) % 7 - 3) * 0.2, out);
        if ((dir < 0) !== back) out.yaw += Math.PI;
        out.walking = true; out.anim = 'walk'; out.speed = 1.6; out.y = groundAt(out.x, out.z);
        return true;
      }
    }
    if (p.a === 'park_walk') {
      const block = blocks.get(pl.building);
      if (block) {
        const h = hashText(String(p.i));
        parkAt(block, tick / 1600 + (h % 100) / 100, (h % 7 - 3) * 0.2, out);
        out.walking = true; out.anim = 'walk'; out.speed = 1.4; out.y = groundAt(out.x, out.z);
        return true;
      }
    }
    p.exitTicks = 0;
    if (p.a === 'watch_fire' && indoors?.leaving(p, { from: p.at }, tick, out)) return true;     // out of the door, not out of thin air
    const inside = indoors ? indoors.locate(p, pl, tick, out) : null;
    if (inside !== null) return inside;
    if (p.sp === -1) { out.y = groundAt(out.x, out.z); return true; }     // the line at the door (indoors.js stood them in it)
    // on the step, facing the street; a pair stands face to face
    const b = buildings.get(pl.building), yaw = b ? b.yaw : 0, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const pair = p.w != null && p.w >= 0, key = pair ? Math.min(p.i, p.w) : p.i, h = hashText(`spot${key}`);
    const side0 = b ? -(b.side ?? 1) : 1, along = side0 * ((h % 100) / 100) * Math.min(3.4, (b?.w ?? 6) * 0.3), out2 = 1.4 + ((h >> 8) % 10) * 0.07 + (p.a === 'watch_fire' ? 6 : 0);   // on the door's far side from where the car stands
    const side = pair ? (p.i < p.w ? -0.62 : 0.62) : 0;
    out.x = pl.x + fx * out2 + fz * (along + side); out.z = pl.z + fz * out2 - fx * (along + side);
    out.yaw = pair ? yaw + (p.i < p.w ? Math.PI / 2 : -Math.PI / 2) : yaw;
    out.y = groundAt(out.x, out.z);
    out.anim = pair ? 'talk' : p.a === 'watch_fire' ? 'crossArms' : CLIPS[p.a] || 'idle';
    return true;
  }

  /** The budget test's pile: everyone in a ring round the camera, indoors or not. */
  function where(p, tick, out) {
    if (!self.pile) return locate(p, null, tick, out);
    const a = p.i * 2.399, r = 4 + (p.i % 60) * 0.5;
    out.x = pileAt.x + Math.cos(a) * r; out.z = pileAt.z + Math.sin(a) * r; out.y = groundAt(out.x, out.z); out.yaw = a; out.anim = 'walk'; out.walking = true; out.car = null; out.speed = 1.4;
    return true;
  }
  const pileAt = { x: 0, z: 0 };

  // ---- bodies
  const slots = [];       // { actor, look, wearing, pid, tick }
  let queue = [], busy = false, built = 0, changes = 0, changeMs = 0;
  const wearOf = pid => town.mirror.people.get(pid)?.we ?? town.roster.people[pid]?.wear ?? 'casual';
  /** A body's key: the look, and what is on it. The same key is the same template, built once (`park` keeps what they took off). */
  const keyOf = (person, wear) => `${person.look}|${wear}|${wear === 'work' ? person.job ?? '' : ''}`;
  const ready = avatar => prepareChibi2(avatar, { anims: ANIMS, v25: true, v26: true, slice: () => new Promise(r => setTimeout(r, 0)), budget: 10, keep: KEEP_LOOKS });
  // how tall this body stands, once, so it can be scaled to clear a door indoors
  function measure(s) {
    const g = s.actor.group, was = g.scale.x; g.scale.setScalar(1); g.rotation.set(0, 0, 0); g.position.set(0, 0, 0); g.updateMatrixWorld(true);
    box.setFromObject(g); s.tall = Math.max(0.8, box.max.y - box.min.y); s.wide = box.max.x - box.min.x; g.scale.setScalar(was);
  }
  async function build(pid, roster) {
    const person = roster.people[pid], wear = wearOf(pid), avatar = looks.avatarFor(person, wear);
    await ready(avatar);
    let s = null;
    if (slots.length < fullMax) {
      const actor = await createChibi2Character(avatar, { anims: ANIMS, v25: true, v26: true, park: true });
      group.add(actor.group);
      s = { actor, pid: -1, tick: 0 };
      slots.push(s);
    } else {
      s = slots.find(q => q.pid === -1);
      if (s) await s.actor.setAvatar(avatar);
    }
    if (s) { s.look = keyOf(person, wear); s.pid = pid; s.actor.group.visible = true; built++; measure(s); }
  }
  /**
   * Clothes. The new body is baked first, in slices, in nobody's frame; only then does the one swap happen, and only where nobody is
   * watching them change on the pavement: indoors or out of sight. They wear the old clothes until it is ready.
   */
  async function change(s, roster) {
    const pid = s.pid, person = roster.people[pid], wear = wearOf(pid), avatar = looks.avatarFor(person, wear), key = keyOf(person, wear);
    await ready(avatar);
    s.next = { pid, key, avatar };
  }
  function changeNow(s, q) {
    const n = s.next; if (!n) return;
    if (n.pid !== s.pid) { s.next = null; return; }
    if (q && !q.inside && !q.hidden && !self.hands?.ids?.().includes(s.pid) && (self.seen?.(q) ?? true)) return;
    const t0 = performance.now();
    s.actor.setAvatar(n.avatar); s.look = n.key; s.next = null; measure(s);
    changes++; changeMs = Math.max(changeMs, performance.now() - t0);
  }
  async function pump(roster) {
    if (busy) return;
    if (queue.length) {
      busy = true;
      const pid = queue.shift();
      try { if (wanted.has(pid) && !slots.some(s => s.pid === pid)) await build(pid, roster); } catch (e) { console.warn('[oddhaven] body', e); }
      await new Promise(r => setTimeout(r, 30));     // never two builds in one frame
      busy = false;
      return;
    }
    const s = slots.find(q => q.pid >= 0 && !q.next && q.look !== keyOf(roster.people[q.pid], wearOf(q.pid)));
    if (!s) return;
    busy = true;
    try { await change(s, roster); } catch (e) { console.warn('[oddhaven] clothes', e); }
    await new Promise(r => setTimeout(r, 30));
    busy = false;
  }

  // an axe in the hand while they chop: a child of the hand bone, so the body stays one template (recon "Tools in the hand")
  const axeGeo = (() => { const haft = new THREE.BoxGeometry(0.05, 0.05, 0.85); haft.translate(0, 0, 0.32); const blade = new THREE.BoxGeometry(0.05, 0.26, 0.16); blade.translate(0, 0.1, 0.68); const g = new THREE.BufferGeometry(); const a = haft.toNonIndexed(), b = blade.toNonIndexed(); g.setAttribute('position', new THREE.Float32BufferAttribute([...a.attributes.position.array, ...b.attributes.position.array], 3)); g.computeVertexNormals(); return g; })();
  const axeMat = new THREE.MeshLambertMaterial({ color: '#8a8f94' });
  function toolFor(s, on) {
    if (!on) { if (s.axe) s.axe.visible = false; return; }
    const bone = s.actor.skeleton.bones.find(b => b.name === 'handR'); if (!bone) return;
    if (!s.axe) { s.axe = new THREE.Mesh(axeGeo, axeMat); s.axe.scale.setScalar(1.5); }
    if (s.axe.parent !== bone) bone.add(s.axe);
    s.axe.visible = true;
  }
  const box = new THREE.Box3();
  const stats = { bodies: 0, standIns: 0, outside: 0, visibleRows: 0, indoors: 0 };
  const seenList = [], wanted = new Set(), spots = new Map(), carryList = [];
  let shown = [], standList = [], clock = 1, tSeconds = 0;
  const self = {
    hands: null, group, stats, slots, pile: false, get shown() { return shown; }, spots,
    get bodiesBuilt() { return built; }, selected: -1, household: new Set(), carByDriver,
    /** Bodies that changed clothes since the page opened, and the longest one swap took on the main thread. */
    get wardrobe() { return { changes, changeMs: +changeMs.toFixed(1), keys: slots.filter(s => s.pid >= 0).map(s => [s.pid, s.look]) }; },
    wearOf,
    reset() { indoors?.reset(); for (const s of slots) { s.pid = -1; s.next = null; s.actor.group.visible = false; } queue = []; wanted.clear(); spots.clear(); shown = []; standList = []; carByDriver.clear(); },
    /** Everybody the player could tap: { id, x, y, z } this frame. */
    drawn() { return shown; },
    update(centre, camera, dt, zoom, simSpeed) {
      const roster = town.roster; if (!roster) return;
      const tick = town.tick();
      if (!self.pile) { pileAt.x = centre.x; pileAt.z = centre.z; }
      tSeconds += dt * Math.max(0.2, simSpeed);
      clock += dt;
      if (clock >= 0.25) {
        clock = 0;
        carByDriver.clear();
        for (const c of cars.cars) if (c.driver != null && !c.gone) carByDriver.set(c.driver, c);
        seenList.length = 0;
        let rows = 0;
        const reach = self.pile ? 1e9 : Math.max(70, zoom * 1.9);
        for (const p of town.mirror.people.values()) {
          rows++;
          let q = spots.get(p.i);
          if (!q) spots.set(p.i, q = {});
          if (!where(p, tick, q)) { q.hidden = true; continue; }
          q.hidden = false;
          const d = Math.hypot(q.x - centre.x, q.z - centre.z);
          const ours = self.hands?.on && self.hands.ids().includes(p.i);
          if (d > reach && p.i !== self.selected && !ours) continue;
          // the driver of a closed car is only worth a body if you are looking right at them
          const rank = ours ? -2e6 : p.hold ? d - 5e5 : d + (q.car && CLOSED.has(q.car.type) ? 60 : 0) - (p.i === self.selected ? 1e6 : 0) - (self.household.has(p.i) ? 25 : 0);
          seenList.push([rank, p, q]);
        }
        for (const id of spots.keys()) if (!town.mirror.people.has(id)) spots.delete(id);
        seenList.sort((a, b) => a[0] - b[0]);
        stats.outside = seenList.length; stats.visibleRows = rows;
        const top = seenList.slice(0, fullMax);
        wanted.clear();
        for (const [, p] of top) wanted.add(p.i);
        for (const s of slots) if (s.pid >= 0 && !wanted.has(s.pid)) { s.pid = -1; s.actor.group.visible = false; }
        for (const [, p] of top) {
          if (slots.some(s => s.pid === p.i)) continue;
          // a free body already wearing this look is instant; otherwise queue a build
          const free = slots.find(s => s.pid === -1 && s.look === keyOf(roster.people[p.i], wearOf(p.i)));
          if (free) { free.pid = p.i; free.actor.group.visible = true; } else if (!queue.includes(p.i)) queue.push(p.i);
        }
        queue = queue.filter(i => wanted.has(i)).slice(0, fullMax);
        pump(roster);
        const held = new Set(slots.map(s => s.pid));
        standList = seenList.filter(([, p, q]) => !held.has(p.i) && !(q.car && !self.pile)).slice(0, standInMax).map(e => e[1]);
        stats.bodies = slots.filter(s => s.pid >= 0).length; stats.standIns = standList.length; stats.indoors = seenList.filter(e => e[2].inside).length;
        shown = [...slots.filter(s => s.pid >= 0).map(s => s.pid), ...standList.map(p => p.i)].map(i => spots.get(i) && Object.assign(spots.get(i), { id: i })).filter(Boolean);
      }
      // ---- positions every frame, cheap: at most 70 people
      const mirror = town.mirror;
      let mn = 0, ringAt = null;
      const iconSize = Math.max(0.6, zoom * 0.036), far = zoom > SKY_FROM;
      const pulse = 1 + Math.sin(performance.now() / 300) * 0.08;
      const signOf = p => { const b = p.mw ?? 0, m = moodIndex(p.mood); return b & 16 ? SIGN.MUTE : b & 2 ? SIGN.BOLT : b & 1 ? SIGN.HEART : b & 8 ? SIGN.ZZZ : b & 4 ? SIGN.SNOW : (p.mood ?? 0) > 0.86 ? SIGN.GLOW : m; };
      const mark = (q, p, scaleY) => {
        if (far) return;      // from up high the street has one sign, not seventy
        const sign = signOf(p), icon = self.household.has(p.i) && zoom > 70 ? marks.HOME : sign, loud = icon > marks.HOME || icon >= 3 && icon < marks.HOME;
        // up close you can see their face: only something worth saying, or the person you have picked, still gets a sign
        if (zoom < 34 && icon < 3 && p.i !== self.selected) return;
        marks.set(mn++, q.x, q.y + scaleY, q.z, icon, iconSize * (loud ? 1.3 * pulse : 1));
      };
      for (const s of slots) {
        if (s.pid < 0) continue;
        const p = mirror.people.get(s.pid), q = spots.get(s.pid);
        if (!p || !q) { s.pid = -1; s.actor.group.visible = false; continue; }
        if (!where(p, tick, q)) { s.actor.group.visible = false; q.hidden = true; changeNow(s, q); continue; }
        q.hidden = false;
        changeNow(s, q);
        const g = s.actor.group; g.visible = true;
        // a closed car hides its people: a chibi head is taller than the roof
        if (q.car && CLOSED.has(q.car.type)) { g.visible = false; continue; }
        if (q.car) {
          const def = vdefs.get(q.car.type), seat = def?.seats?.[q.seat || 0]?.p || def?.seats?.[0]?.p || [0.4, 0.3, 0.2], c = Math.cos(q.yaw), sn = Math.sin(q.yaw);
          g.position.set(q.x + seat[0] * c + seat[2] * sn, q.y + seat[1], q.z - seat[0] * sn + seat[2] * c);
          g.rotation.order = 'YXZ'; g.rotation.set(0, q.yaw, 0); g.scale.setScalar(1);
        } else {
          // indoors a body is drawn to clear the doors: the tall races stoop, and the change happens as they cross the step
          const want = q.inside ? indoorScale(s.tall ?? 1.6, s.wide ?? 0) : BODY_SCALE;
          // it happens over a stride or two, not in a frame, and whoever has to fit most ducks under the lintel as they go
          s.fit = s.fit == null ? want : s.fit + Math.sign(want - s.fit) * Math.min(Math.abs(want - s.fit), dt * FIT_RATE);
          g.scale.setScalar(s.fit * (q.k ?? 1));
          s.actor.setTwist(0, 0, Math.abs(want - s.fit) > 0.02 && want < 1 ? DUCK : 0);
          if (q.lie) {
            // on their back with their head to the headboard: the feet are half a body from the middle of the bed
            const len = (s.tall ?? 1.6) * s.fit, hx = Math.sin(q.yaw), hz = Math.cos(q.yaw);
            g.rotation.order = 'YXZ'; g.rotation.set(-Math.PI / 2, q.yaw + Math.PI, 0);
            g.position.set(q.x - hx * len * 0.5, q.y, q.z - hz * len * 0.5);
          } else { g.rotation.order = 'YXZ'; g.rotation.set(0, q.yaw, 0); g.position.set(q.x, q.y, q.z); }
        }
        const staged = self.stage?.get(s.pid);
        if (staged) { const o = spots.get(staged.face); if (o && !o.hidden) { q.yaw = Math.atan2(o.x - q.x, o.z - q.z); g.rotation.set(0, q.yaw, 0); } q.anim = staged.anim; }
        s.actor.setAnim(q.anim);
        toolFor(s, q.anim === 'lifeChop');
        s.actor.setRate?.(q.walking ? Math.min(3.2, Math.max(0.7, (q.speed || 1.4) * simSpeed / WALK_CLIP_SPEED / BODY_SCALE)) : 1);
        const d = camera.position.distanceTo(g.position);
        s.tick += dt;
        if (simSpeed > 0 && (d < 28 || s.tick > 0.1)) { s.actor.update(s.tick); s.tick = 0; }
        if (!q.car && !(self.hands?.on && s.pid === self.hands.me)) mark(q, p, 2.35);
        if (s.pid === self.selected) ringAt = q;
      }
      carryList.length = 0;
      const load = q => { if (q?.carry === 'log') carryList.push({ x: q.x + Math.cos(q.yaw) * 0.42, y: q.y + 2.05, z: q.z - Math.sin(q.yaw) * 0.42, yaw: q.yaw }); };
      for (const s of slots) if (s.pid >= 0) load(spots.get(s.pid));
      let n = 0;
      for (const p of standList) {
        const q = spots.get(p.i);
        if (!q || !where(p, tick, q) || q.car) continue;
        const col = looks.colours(roster.people[p.i], wearOf(p.i));
        load(q);
        stand.set(n++, q, col, (q.inside ? Math.min(1.05, DOOR_CLEAR / 1.6 / col.scale) : BODY_SCALE) * (q.k ?? 1));
        mark(q, p, 2.3 * col.scale);
        if (p.i === self.selected) ringAt = q;
      }
      timber?.carrying(carryList);
      // the view from high up: a block of town as one sign, big enough to read from the top of the sky
      if (far) for (const [x, z, mood, foes, love] of (town.mirror.sky ?? []).slice(0, SKY_MAX)) marks.set(mn++, x, groundAt(x, z) + 14, z, foes >= 2 ? SIGN.BOLT : love >= 2 ? SIGN.HEART : moodIndex(mood), zoom * 0.09 * (foes >= 2 ? pulse : 1));
      stand.commit(n, tSeconds); marks.commit(mn);
      if (ringAt) { ring.visible = true; ring.position.set(ringAt.x, ringAt.y + 0.04, ringAt.z); ring.scale.setScalar(Math.max(1, zoom * 0.018)); } else ring.visible = false;
      if (self.selected >= 0) { const q = spots.get(self.selected); self.selectedSpot = q && !q.hidden ? q : null; } else self.selectedSpot = null;
    },
  };
  return self;
}
