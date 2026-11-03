// A job in your hands: what the big button does on the site, the needle, the marked target, the hint. The rules are in the sim; this
// only says what you could do, and sends the same step the sim would have run (`work` in js/sim/work.js). promptFor() is pure.
import { promptFor, promptFire, promptLaw, promptFight, aimedRoom, needle, quality } from '../world/job-kit.js';
import { toWorld, toLocal, FLOOR_H } from '../sim/interior.js';
import { placeName } from './orders.js';
import { outsideDoor } from '../sim/interior-nav.js';
import { clockText } from './mood.js';

const hhmm = h => `${String(h % 24).padStart(2, '0')}:00`;
const compass = (dx, dz) => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][((Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) % 8) + 8) % 8];

export function createJobHands({ town, hands, timber, hud, say, sfx, truckAt, clip, plans, buildings, held = () => false, placeWord = id => placeName(town.roster.places[id]), bookSheet = () => {}, lightsOn = () => false, bark = () => {} }) {
  const T = timber.T;
  let prompt = null, seconds = 0, last = null, flash = 0, sprayClock = 0, spraying = false;
  const self = {
    prompt: () => prompt,
    get phase() { return prompt?.timed ? needle(seconds, self.period()) : null; },
    period() { const k = town.roster.work; return prompt?.timed === 'lever' ? k.pullSeconds * 2 : k.swingSeconds * 1.5; },
    label: () => prompt?.label ?? null,
    get seconds() { return seconds; },
    get spraying() { return spraying; },
    /** The rift this body is in, the fight row, and what is nearest. */
    fightOf(id) { const row = town.mirror.people.get(id); if (!row?.fg) return null; const R = town.mirror.rifts?.find(q => q.id === row.fg.r) ?? null; return R ? { R, F: row.fg } : null; },
    /** Second and third buttons. */
    skill() { const f = self.fightOf(hands.me); if (!f || f.F.down) return false; hands.syncNow(); town.cmd({ kind: 'fight', who: hands.me, verb: 'skill' }); clip('wave'); sfx('cast.start'); return true; },
    dodge() { const f = self.fightOf(hands.me); if (!f || f.F.down) return false; hands.syncNow(); town.cmd({ kind: 'fight', who: hands.me, verb: 'dodge' }); hands.dash(); sfx('travel.step'); return true; },
    /** The big button. True if the job took the press. */
    use() {
      if (prompt?.hold) return true;        // held, not pressed: frame() does the rest
      if (prompt?.book) { bookSheet(prompt.call); return true; }
      if (!prompt?.cmd) return false;
      const c = { kind: prompt.fire ? 'fire' : prompt.law ? 'law' : prompt.fight ? 'fight' : 'work', who: hands.me, ...prompt.cmd };
      hands.syncNow();
      if (prompt.timed) { const q = quality(self.phase); c.q = q; last = q; flash = 0.5; hud.jobPress(q >= town.roster.work.okAt); clip(prompt.timed === 'swing' ? 'lifeChop' : 'lifeLever'); if (prompt.fire) sfx('wood.chop'); else if (prompt.law || prompt.fight) sfx('door.grind'); else if (prompt.timed === 'swing') { timber.hit(prompt.cmd.tree); sfx('wood.chop'); } else sfx('lever.pull'); }
      else if (prompt.fight) { clip('lifeChop'); sfx('melee.swing'); } else if (prompt.law) { if (prompt.cmd.verb !== 'lights') clip('lifeLift'); else sfx('ui.click'); }
      else if (prompt.cmd.verb === 'pull') { clip('lifeLever'); sfx('lever.pull'); } else clip('lifeLift');
      town.cmd(c);
      return true;
    },
    event(e) {
      if (e.who !== hands.me || (e.owner !== undefined && e.owner !== town.owner)) return;
      if (e.kind === 'law.done') { hud.note('Call closed', [e.how === 'away' ? 'They got away.' : e.how === 'gone' ? 'Nobody there any more.' : 'Back on the radio.'], 4000); sfx('coin'); return; }
      if (e.kind === 'duty.paid') { hud.note('Shift pay', [`Paid ${e.pay} coins`, ...(e.hands ? ['Hands-on rate: a quarter more for the work you did yourself'] : [])], 7000); sfx('coin'); return; }
      if (e.kind === 'law.answer') { if (e.far) say('Get closer.'); else if (e.verb === 'take' && !e.ok) say(e.why === 'busy' ? 'Finish the one you are on first.' : 'That one has gone.'); else if (e.verb === 'lights') say(e.lights ? 'Lights on.' : 'Lights off.'); return; }
      if (e.kind === 'fight.down') { say('Knocked down. Swap to someone else, or hand back.'); return; }
      if (e.kind === 'fight.over') { if (!e.left) hud.note('It is over', [e.down ? 'You will want the clinic after this.' : 'You came through it.'], 5000); return; }
      if (e.kind === 'fire.done') { if (e.dry) say('The tank is dry. Connect to a hydrant.'); else if (e.done) say('The door gives way.'); else if (e.rescued) say('They are out.'); else if (!e.ok) say('Not from here.'); return; }
      if (e.kind === 'call.done') { hud.note('Fire out', [`Paid ${e.pay} coins for the call`, ...(e.hands ? ['Hands-on rate: a quarter more for the work you did yourself'] : [])], 7000); sfx('coin'); return; }
      if (e.kind === 'work.done') { if (!e.ok && e.verb === 'pull' && !e.miss) say('Not lined up. Wait for it.'); else if (e.miss) say('Missed. Wait till it lines up.'); else if (e.down) say('Timber!'); else if (e.verb === 'unload') say(`${e.planks} boards handed over.`); else if (e.verb === 'load') say('Loaded. Get in the truck.'); }
      else if (e.kind === 'shift.in') say('Clocked in.');
      else if (e.kind === 'shift.out') { hud.note('Shift over', [`Paid ${e.pay} coins`, ...(e.hands ? ['Hands-on rate: a quarter more for the work you did yourself'] : [])], 7000); sfx('coin'); }
    },
    frame(dt) {
      seconds += dt; flash = Math.max(0, flash - dt);
      const r = town.roster, me = hands.on ? r.people[hands.me] : null, chain = me?.job ? r.jobs[me.job]?.chain : null, row = me ? town.mirror.people.get(hands.me) : null;
      if (me && fightFrame(dt, me, row)) return;
      if (me?.job === 'firefighter' && fireFrame(dt, me, row)) return;
      spraying = false;
      if (me && r.jobs[me.job]?.beat && beatFrame(dt, me, row)) return;
      if (!chain || !row) { prompt = null; timber.mark(null); hud.job(null); return; }
      const p = hands.pos, at = [p.x, p.z], site = town.mirror.site, job = r.jobs[me.job], sh = job.shifts[me.shift ?? 0];
      if (!row.sh && chain !== 'haul') {
        prompt = null; timber.mark(null);
        hud.job({ hint: `Shift ${hhmm(sh[0])} to ${hhmm(sh[1])} at ${chain === 'forest' ? 'Wend Wood' : 'Wend Mill'}`, title: job.title });
        return;
      }
      const truck = chain === 'haul' ? truckAt(me) : null;
      prompt = promptFor({ chain, me: at, carry: row.cy ?? null, site, T, k: r.work, who: hands.me, truck });
      if (!row.sh && chain === 'haul' && !truck?.inCab && !truck?.load) prompt = { hint: `Shift ${hhmm(sh[0])} to ${hhmm(sh[1])} at Wend Mill` };
      const tg = prompt?.target;
      timber.mark(tg?.[0] ?? null, tg?.[1]);
      const away = tg && !prompt.label ? Math.hypot(tg[0] - at[0], tg[1] - at[1]) : 0;
      hud.job({ title: job.title, hint: prompt?.hint ?? '', where: away > 12 ? `${Math.round(away)} m ${compass(tg[0] - at[0], tg[1] - at[1])}` : '', needle: prompt?.timed ? self.phase : null, zone: prompt?.timed ? r.work.okAt : 0, clock: clockText });
    },
    state: () => ({ prompt: prompt && { law: !!prompt.law, fight: !!prompt.fight, book: !!prompt.book, label: prompt.label ?? null, hold: !!prompt.hold, up: prompt.up ?? null, timed: prompt.timed ?? null, hint: prompt.hint, target: prompt.target ?? null }, phase: self.phase, last }),
  };
  /** In a fight, whoever you are: the three buttons and what they do right now. */
  function fightFrame(dt, me, row) {
    const f = row?.fg ? self.fightOf(hands.me) : null;
    if (!f) { if (prompt?.fight) { prompt = null; timber.mark(null); hud.job(null); } hud.fight(null); return false; }
    const k = town.roster.riftWork, p = hands.pos, tick = town.mirror.t, F = { ...f.F, who: hands.me }, S = town.roster.monsters.skills[me.job] ?? town.roster.monsters.skills.default;
    prompt = promptFight({ me: [p.x, p.z], F, R: f.R, k, tick }); prompt.fight = true;
    const tps = town.roster.clock.ticksPerSecond, tg = prompt.target;
    timber.mark(tg?.[0] ?? null, tg?.[1], tg ? hands.feet.ground(tg[0], tg[1], 0) : undefined);
    hud.job({ hint: prompt.hint ?? '', title: 'Rift', needle: prompt.timed ? self.phase : null, zone: prompt.timed ? town.roster.work.okAt : 0, where: '' });
    hud.fight({ hp: F.hp, max: F.max, skill: S.name, skillLeft: Math.max(0, (F.s - tick) / tps), dodgeLeft: Math.max(0, (F.d - tick) / tps), down: !!F.down, seal: f.R.st === 'seal' });
    void dt;
    return true;
  }
  /** On the beat: the call you hold, or the rift you should be at, or a quiet radio. */
  function beatFrame(dt, me, row) {
    const r = town.roster, job = r.jobs[me.job], p = hands.pos, at = [p.x, p.z], inCar = !!hands.car, C = (town.mirror.calls ?? []).find(q => q.by === hands.me) ?? null;
    if (job.beat === 'rift' && !C) {
      const R = (town.mirror.rifts ?? []).slice().sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (!R) { prompt = null; timber.mark(null); hud.job({ hint: 'The sky is behaving. Radio is quiet', where: '' }); return true; }
      prompt = { target: [R.x, R.z], hint: R.st === 'signs' ? `Odd sky at ${placeWord(R.place)}. Get there before it opens` : `Rift open at ${placeWord(R.place)}. Radio for the jeep if it is far` };
    } else if (!C) { prompt = null; timber.mark(null); const open = (town.mirror.calls ?? []).filter(q => q.st === 'open').length; hud.job({ hint: open ? `${open} on the radio` : 'Quiet on the radio', where: '' }); return true; } else {
      prompt = promptLaw({ me: at, inCar, C, k: r.lawWork, lights: lightsOn(), place: placeWord(C.place) });
      prompt.law = true; prompt.call = C;
    }
    const tg = prompt.target;
    timber.mark(tg?.[0] ?? null, tg?.[1], tg ? hands.feet.ground(tg[0], tg[1], 0) : undefined);
    const away = tg ? Math.hypot(tg[0] - at[0], tg[1] - at[1]) : 0;
    hud.job({ hint: prompt.hint ?? '', title: job.title, where: away > 12 ? `${Math.round(away)} m ${compass(tg[0] - at[0], tg[1] - at[1])}` : '', needle: prompt.timed ? self.phase : null, zone: prompt.timed ? r.work.okAt : 0 });
    void dt; void row; void me;
    return true;
  }
  /** Which fire this firefighter is on. */
  const onFire = id => town.mirror.fires?.find(F => F.call?.crew.includes(id)) ?? null;
  function fireFrame(dt, me, row) {
    const F = onFire(hands.me);
    if (!F) { spraying = false; if (prompt?.fire) { prompt = null; timber.mark(null); hud.job(null); } return false; }
    const k = town.roster.fireWork, plan = plans(F.b), b = buildings.get(F.b), fr = { cx: b.x, cz: b.z, yaw: b.yaw }, p = hands.pos, at = [p.x, p.z], lv = hands.you.lv ?? 0;
    const w = (x, z) => { const q = toWorld(fr, x, z); return [q.x, q.z]; }, od = outsideDoor(plan), street = w(od.x, od.z), safe = w(od.x, od.z + k.safeMeters + 1);
    const jam = F.jam.map(id => { const d = plan.doors.find(q => q.id === id), q = w(d.x, d.z + (d.a === 'out' ? 0.5 : 0)); return { id, x: q[0], z: q[1], lv: d.lv, hits: F.hits?.[id] ?? 0 }; });
    const heat = id => F.rooms.find(q => q[0] === id)?.[1] ?? 0, roomAt = (x, z, l) => { const q = toLocal(fr, x, z), room = plan.rooms.find(r => r.lv === l && q.x >= r.x0 && q.x <= r.x1 && q.z >= r.z0 && q.z <= r.z1); return room?.id ?? null; };
    const aim = row?.cy === 'hose' ? aimedRoom({ me: at, yaw: hands.you.yaw ?? 0, lv, reach: k.hoseReach, at: roomAt, heat }) : null, hot = F.rooms.find(q => q[1] > 0);
    const here = toLocal(fr, p.x, p.z), gap = r => Math.hypot(here.x - Math.max(r.x0, Math.min(r.x1, here.x)), here.z - Math.max(r.z0, Math.min(r.z1, here.z)));
    // the burning room you can reach, nearest first: the button stays live and the stream swings round to it when the one you were on goes out
    const reachable = row?.cy === 'hose' ? F.rooms.filter(q => q[1] > 0).map(q => plan.rooms.find(r => r.id === q[0])).filter(r => r && r.lv === lv && gap(r) <= k.hoseReach).sort((a, b) => gap(a) - gap(b))[0] : null;
    const hotRoom = reachable ?? (hot ? plan.rooms.find(r => r.id === hot[0]) : null), fireAt = hotRoom ? w((hotRoom.x0 + hotRoom.x1) / 2, (hotRoom.z0 + hotRoom.z1) / 2) : null, onTarget = aim && heat(aim) > 0 ? aim : null;
    const engine = F.call ? [F.call.spot.x, F.call.spot.z] : street, station = town.roster.places[F.call?.station ?? F.place];
    const inCab = !!hands.car && town.roster.people[hands.me].van === hands.car.car;
    prompt = promptFire({ me: at, lv, carry: row?.cy ?? null, F: { ...F, down: F.down.map(([id, room, l, x, z]) => ({ id, room, lv: l, x, z })) }, doors: { street, safe, jam, engine: hands.engineSpot() ?? [station.x, station.z], fire: fireAt, up: hotRoom && hotRoom.lv !== lv && !F.rooms.some(q => q[1] > 0 && plan.rooms.find(r => r.id === q[0])?.lv === lv) && plan.lift ? { lv: hotRoom.lv, at: w(plan.lift.x, plan.lift.z) } : null }, k, who: hands.me, inCab, here: placeWord(F.place), aim: onTarget ?? (reachable ? reachable.id : null), outside: !hands.feet.inside(p.x, p.z) });
    prompt.fire = true; if (prompt.hold) prompt.room = onTarget;
    hands.fireTurn = hot && row?.cy === 'hose' && fireAt ? fireAt : null;
    spraying = !!prompt.hold && held();
    if (spraying) { sprayClock += dt; if (sprayClock >= 0.25) { if (prompt.room) town.cmd({ kind: 'fire', who: hands.me, verb: 'spray', room: prompt.room, secs: sprayClock }); sprayClock = 0; } } else sprayClock = 0;
    const tg = prompt.target;
    timber.mark(tg?.[0] ?? null, tg?.[1], tg ? hands.feet.ground(tg[0], tg[1], lv) : undefined);
    const away = tg && !prompt.label ? Math.hypot(tg[0] - at[0], tg[1] - at[1]) : 0;
    hud.job({ title: 'Firefighter', hint: prompt.hint ?? '', where: away > 12 ? `${Math.round(away)} m ${compass(tg[0] - at[0], tg[1] - at[1])}` : '', needle: prompt.timed ? self.phase : null, zone: prompt.timed ? town.roster.work.okAt : 0 });
    return true;
  }
  void FLOOR_H;
  return self;
}
