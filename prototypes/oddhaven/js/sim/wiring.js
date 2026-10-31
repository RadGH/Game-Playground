// Levers, buttons, plates and timers (PLAN §2 "Mechanisms"): a thing fires an event, a wire turns the event into actions. All of
// it is data: the wires come from data/wiring.json by way of planInterior, this file only runs them. Players press with the
// `press` and `plate` commands, sim people press through pressThing, so both go through the same machine.
//
//   s.mech[building] = { 'door:d3': 0, 'light:r2': 1, 'thing:lever-a': 1, ... }   only what differs from the plan's default
//   c.mechRev counts changes, so a snapshot sends the table only when it moved
import { log, say } from './log.js';
import { earn } from './economy.js';
import { isOpen } from './places.js';
import { fireAct } from './fire.js';

/** The value of one target in one building. */
export function mechValue(c, building, target) {
  const row = c.s.mech[building], plan = c.buildingPlans.get(building);
  if (row && row[target] !== undefined) return row[target];
  return plan?.defaults?.[target] ?? 0;
}
function setValue(c, building, target, v) {
  const plan = c.buildingPlans.get(building), base = plan?.defaults?.[target] ?? 0, row = (c.s.mech[building] ||= {});
  if (mechValue(c, building, target) === v) return false;
  if (v === base) { delete row[target]; if (!Object.keys(row).length) delete c.s.mech[building]; } else row[target] = v;
  c.mechRev++;
  return true;
}
/** Set a value from outside the wires: a door broken in. */
export const setMech = (c, building, target, v) => setValue(c, building, target, v);
function runAction(c, building, act, who) {
  if (act.act === 'call' || act.act === 'sprinkle' || act.act === 'extinguish') { fireAct(c, building, act, who); return; }
  if (act.act === 'toggle') setValue(c, building, act.target, mechValue(c, building, act.target) ? 0 : 1);
  else if (act.act === 'set') setValue(c, building, act.target, act.value);
  else if (act.act === 'pay') {
    if (act.once && mechValue(c, building, `once:${act.once}`)) { say(c, 'mech.empty', { building, who: who?.id ?? -1 }); return; }
    if (who) {
      earn(c, c.s.households[who.household], act.amount, 'found');
      if (act.once) setValue(c, building, `once:${act.once}`, 1);
      log(c, 'found', { who: who.id, amount: act.amount, building });
      say(c, 'mech.paid', { building, who: who.id, amount: act.amount });
    }
  }
}
function gates(c, building, plan) {
  for (const g of plan.things) {
    if (g.kind !== 'gate') continue;
    const now = g.all.every(row => { const [target, v] = row.split('='); return mechValue(c, building, target) === Number(v); });
    if (now && !mechValue(c, building, `gate:${g.id}`)) { setValue(c, building, `gate:${g.id}`, 1); fire(c, building, g.id, 'on', null); }
  }
}
/** A thing fires an event. Returns how many wires heard it. */
export function fire(c, building, thing, on, who = null) {
  const plan = c.buildingPlans.get(building);
  if (!plan) return 0;
  let n = 0;
  for (const w of plan.wires) {
    if (w.from !== thing || w.on !== on) continue;
    n++;
    for (const a of w.do) runAction(c, building, a, who);
  }
  if (n) gates(c, building, plan);
  return n;
}
/** A sim person uses a thing on their way past. Same wires as a player. */
export const pressThing = (c, p, building, thing) => { fire(c, building, thing, 'press', p); };

/** Timers: each trading place's shutter follows its hours. Run on the hour, and once on load so an old save starts right. */
export function timers(c, minute) {
  for (const [building, plan] of c.buildingPlans) {
    if (!plan.things.some(t => t.kind === 'timer')) continue;
    const pl = c.places[c.byBuilding.get(building)[0]], open = isOpen(pl, minute), door = `door:${plan.shutter}`;
    if (mechValue(c, building, door) !== (open ? 1 : 0)) fire(c, building, 'shut-timer', open ? 'open' : 'close', null);
  }
}

/** Evening: a person coming into a dark room puts the light on, and turns it off going to bed. Only near the camera: nobody sees the rest. */
export function roomLight(c, p, place, spotRow, on) {
  if (!place.plan || !spotRow || p.lv === 2) return;
  const hour = c.clock.minute(c.s.t) / 60, { darkFrom, darkTo } = c.k.lights, dark = hour >= darkFrom || hour < darkTo;
  if (on && !dark) return;
  const room = spotRow.room, target = `light:${room}`;
  if ((mechValue(c, place.building, target) ? 1 : 0) !== (on ? 1 : 0)) pressThing(c, p, place.building, `sw:${room}`);
}

const near = (c, p, plan, frame, t, reach) => {
  if (!p?.hold) return false;
  const s = Math.sin(frame.yaw), co = Math.cos(frame.yaw), x = frame.cx + t.x * co + t.z * s, z = frame.cz - t.x * s + t.z * co;
  return Math.hypot(p.hold.x - x, p.hold.z - z) <= reach && (p.hold.lv ?? 0) === t.lv;
};

/** Handles the commands; false if it is neither. */
export function mechCommand(c, cmd) {
  if (cmd.kind !== 'press' && cmd.kind !== 'plate') return false;
  const owner = cmd.owner ?? 'solo', plan = c.buildingPlans.get(cmd.building), p = c.s.people[cmd.who], t = plan?.things.find(x => x.id === cmd.thing);
  const no = why => say(c, 'cmd.refused', { cmd: cmd.kind, why, who: cmd.who, owner });
  if (!t) { no('no such thing'); return true; }
  if (!p?.hold || p.hold.owner !== owner) { no('not yours'); return true; }
  if (!near(c, p, plan, c.frames.get(cmd.building), t, c.k.control.pressMeters)) { no('too far away'); return true; }
  if (cmd.kind === 'press') { fire(c, cmd.building, t.id, 'press', p); log(c, 'pressed', { who: p.id, thing: t.label }); say(c, 'mech.press', { building: cmd.building, thing: t.id, who: p.id }); }
  else fire(c, cmd.building, t.id, cmd.on ? 'step' : 'leave', p);
  return true;
}
