// The job kit (PLAN §2, roast "job kit of 8 verbs"): the pieces a physical job is built from. Pure, no three, no DOM, so a node test
// and a Playwright bot read the same rules as the page. M4 uses three verbs:
//   swing   walk up to something, a needle sweeps, press near the middle (timing + quality)
//   carry   pick a thing up, it slows you and sits on your shoulder, put it down in the right place (CARRY_PACE)
//   lever   a moving part comes past, pull when it lines up (the same timing, with a miss)
// A job is those verbs + a target list: promptFor() below is forestry and sawmilling; a later job adds a row, not a game.

export const CARRY_PACE = 0.72;
export const SWING_CLIP_SECONDS = 0.55;

/** The needle: 0..1 and back, `seconds` from a free-running clock. Sweeps once there and back in `period`. */
export function needle(seconds, period) { const u = (seconds / period) % 1; return u < 0.5 ? u * 2 : 2 - u * 2; }
/** How good a press was: 1 dead centre, 0 at either end. */
export const quality = pos => Math.max(0, 1 - Math.abs(pos - 0.5) * 2);

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const treeSpot = (T, i) => [T.trees[i].x, T.trees[i].z];

function nearestTree(site, T, me, test) {
  let best = -1, d = Infinity;
  site.trees.forEach((tr, i) => { if (!test(tr)) return; const e = dist(me, treeSpot(T, i)); if (e < d) { d = e; best = i; } });
  return { i: best, d };
}

function logger({ me, carry, site, T, k }) {
  const reach = k.reachMeters;
  if (carry === 'log') {
    if (dist(me, T.landing) <= 4.5) return { label: 'PUT DOWN', cmd: { verb: 'drop' }, target: T.landing, hint: 'Stack it on the landing' };
    return { target: T.landing, hint: 'Carry the log to the landing' };
  }
  if (site.cart.st === 0 && site.landing > 0 && dist(me, T.lever) <= reach) return { label: 'SEND CART', cmd: { verb: 'pull', cart: true }, target: T.lever, hint: `${site.landing} logs on the landing. Send them to the mill` };
  const log = nearestTree(site, T, me, tr => tr[0] === 1 && tr[2] > 0);
  if (log.i >= 0 && log.d <= reach) return { label: 'PICK UP', cmd: { verb: 'pick', tree: log.i }, target: treeSpot(T, log.i), hint: 'Lift a log onto your shoulder' };
  if (site.cart.st === 0 && site.landing >= k.cartCapacity) return { target: T.lever, hint: 'The landing is full. Pull the cart lever' };
  if (log.i >= 0) return { target: treeSpot(T, log.i), hint: 'Logs on the ground: go and get one' };
  const tree = nearestTree(site, T, me, tr => tr[0] === 0);
  if (tree.i < 0) return { target: T.landing, hint: 'No trees left standing. Give them time' };
  if (tree.d <= reach) return { label: 'SWING', timed: 'swing', cmd: { verb: 'swing', tree: tree.i }, target: treeSpot(T, tree.i), hint: `Press in the middle. ${Math.ceil(k.cutsPerTree - site.trees[tree.i][1])} good cuts to go` };
  return { target: treeSpot(T, tree.i), hint: 'Walk up to the marked tree' };
}

function sawyer({ me, carry, site, T, k, who }) {
  const reach = k.reachMeters, n = k.planksPerLog;
  if (carry === 'bundle') {
    if (dist(me, T.rack) <= 4.5) return { label: 'STACK', cmd: { verb: 'drop' }, target: T.rack, hint: 'Stack the boards on the rack' };
    return { target: T.rack, hint: 'Carry the boards to the rack' };
  }
  const mine = site.benches.findIndex(b => b[3] === who), free = site.benches.findIndex(b => !b[0]);
  if (carry === 'log') {
    const i = mine >= 0 && !site.benches[mine][0] ? mine : free;
    if (i < 0) return { target: T.deck, hint: 'Every bench has a log on it. Wait for one' };
    if (dist(me, T.benches[i].infeed) <= reach) return { label: 'FEED', cmd: { verb: 'drop', bench: i }, target: T.benches[i].infeed, hint: 'Lay it on the bench' };
    return { target: T.benches[i].infeed, hint: 'Carry the log to the saw bench' };
  }
  for (let i = 0; i < T.benches.length; i++) if (site.benches[i][0] && dist(me, T.benches[i].lever) <= reach) return { label: 'PULL', timed: 'lever', cmd: { verb: 'pull', bench: i }, target: T.benches[i].lever, hint: `Pull when the log lines up with the blade. ${n - site.benches[i][1]} cuts left` };
  for (let i = 0; i < T.benches.length; i++) if (site.benches[i][2] >= n && dist(me, T.benches[i].out) <= reach) return { label: 'PICK UP', cmd: { verb: 'pick', bench: i }, target: T.benches[i].out, hint: 'Lift the bundle of boards' };
  if (site.deck > 0 && dist(me, T.deck) <= 5) return { label: 'PICK UP', cmd: { verb: 'pick' }, target: T.deck, hint: 'Take a log off the deck' };
  const sawing = site.benches.findIndex(b => b[0]);
  if (sawing >= 0) return { target: T.benches[sawing].lever, hint: 'There is a log on the bench. Go to the lever' };
  const ready = site.benches.findIndex(b => b[2] >= n);
  if (ready >= 0) return { target: T.benches[ready].out, hint: 'Boards are ready at the end of the bench' };
  if (site.deck > 0) return { target: T.deck, hint: 'Fetch a log from the deck' };
  return { target: T.deck, hint: 'Nothing on the deck yet. The cart is on its way' };
}

function driver({ me, site, T, k, truck }) {
  const at = [T.rack[0] - 2, T.rack[1] + 2];
  if (truck?.inCab && truck.load > 0) {
    if (truck.nearYard) return { label: 'UNLOAD', cmd: { verb: 'unload' }, hint: 'Hand the boards over at the yard' };
    return { hint: 'Drive the boards to a lumber yard' };
  }
  if (truck?.inCab) return { hint: 'Take the truck back to the mill' };
  if (!truck?.load && site.rack >= k.truckLoad && dist(me, at) <= 8) return { label: 'LOAD TRUCK', cmd: { verb: 'load' }, target: at, hint: `${site.rack} boards on the rack` };
  if (truck?.load) return { target: [T.truck.x, T.truck.z], hint: 'Loaded. Get in the truck' };
  if (site.rack >= k.truckLoad) return { target: at, hint: 'The rack is full enough. Go and load up' };
  return { target: at, hint: `Waiting on boards: ${site.rack} of ${k.truckLoad} on the rack` };
}

const CHAINS = { forest: logger, saw: sawyer, haul: driver };

/** The burning room your hose points at: a walk along the aim from where you stand. `at(x, z, lv)` = the room at a point, `heat(id)` = how hot. */
export function aimedRoom({ me, yaw, lv, reach, at, heat }) {
  const sx = Math.sin(yaw), cz = Math.cos(yaw);
  let first = null;
  for (let d = 1; d <= reach; d += 0.75) { const id = at(me[0] + sx * d, me[1] + cz * d, lv); if (id && !first) first = id; if (id && heat(id) > 0) return id; }
  return first;
}

/** A firefighter on a call: the same shape as a chain's prompt. `F` is the sim's fire row, plan and frame are the building's, world(x, z) = a door's world spot. */
export function promptFire({ me, lv, carry, F, doors, k, who, inCab, here, aim, outside }) {
  const C = F.call, dist2 = (a, x, z) => Math.hypot(a[0] - x, a[1] - z), door = doors.street, name = here;
  if (!C) return { hint: `Fire at ${name}. The engine has not been sent yet` };
  if (C.st === 'turnout' || C.st === 'drive') {
    if (inCab) return { target: door, hint: `Drive to ${name}, then stop near it. Everyone will get out of your way` };
    if (C.live === null && C.st === 'turnout') return { target: doors.engine, hint: 'Get to the engine' };
    return { target: door, hint: `The engine has left. Run to ${name}` };
  }
  if (inCab) return { hint: 'Get out and get to work' };
  if (carry === 'person') {
    if (outside && dist2(me, door[0], door[1]) >= 2.2) return { label: 'SET DOWN', cmd: { verb: 'drop' }, target: doors.safe, hint: 'Set them down clear of the building' };
    return { target: doors.safe, hint: 'Carry them out of the door and clear of the building' };
  }
  let near = null;
  for (const v of F.down) if (v.lv === lv && dist2(me, v.x, v.z) <= 2.4) near = v;
  if (near) return { label: 'LIFT', cmd: { verb: 'lift', person: near.id }, target: [near.x, near.z], hint: 'Get them over your shoulder' };
  for (const d of doors.jam) if (d.lv === lv && dist2(me, d.x, d.z) <= 2.8) return { label: 'FORCE', timed: 'swing', cmd: { verb: 'force', door: d.id }, target: [d.x, d.z], hint: `The door is jammed. Press in the middle. ${Math.max(1, Math.ceil(k.forceHits - (d.hits ?? 0)))} good hits to go` };
  const nearHydrant = C.hydrant && dist2(me, C.hydrant[0], C.hydrant[1]) <= 3;
  if (carry === 'hose') {
    if (nearHydrant && !C.hooked) return { label: 'CONNECT', cmd: { verb: 'hook' }, target: C.hydrant, hint: 'Connect the hose to the hydrant' };
    if (!C.hooked && C.tank <= 0) return { target: C.hydrant, hint: 'The tank is dry. Connect to the hydrant' };
    if (aim) return { label: 'SPRAY', hold: true, room: aim, target: null, hint: `Hold the button and steer with the stick.${C.hooked ? '' : ` Tank: ${C.tank} s`}` };
    if (doors.up) return { target: doors.up.at, up: doors.up.lv, hint: `The fire is on ${doors.up.lv ? `floor ${doors.up.lv}` : 'the ground floor'}. Take the lift` };
    return { target: doors.fire ?? door, hint: 'Get the hose on the fire' };
  }
  if (dist2(me, C.spot.x, C.spot.z) <= 6.5 && C.hose !== who) return { label: 'TAKE HOSE', cmd: { verb: 'hose' }, target: [C.spot.x, C.spot.z], hint: `Take the hose off the engine. Tank: ${C.tank} s of water` };
  if (nearHydrant && !C.hooked) return { label: 'CONNECT', cmd: { verb: 'hook' }, target: C.hydrant, hint: 'Connect the engine to the hydrant' };
  if (F.down.length) { const v = F.down[0], jam = doors.jam[0]; return jam ? { target: [jam.x, jam.z], hint: `${F.down.length} inside and the door is jammed. Force it` } : { target: [v.x, v.z], hint: 'Someone is inside. Go and get them' }; }
  if (doors.jam.length) return { target: [doors.jam[0].x, doors.jam[0].z], hint: 'The way in is jammed. Force it' };
  return { target: [C.spot.x, C.spot.z], hint: 'Take the hose off the engine' };
}

/** What a person on shift could do right now: { label?, cmd?, timed?, target?, hint }. `label` means the big button is live. */
export function promptFor({ chain, ...rest }) { const f = CHAINS[chain]; return f && rest.site ? f(rest) : null; }
