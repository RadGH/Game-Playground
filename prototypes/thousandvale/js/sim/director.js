// The realm EVENT DIRECTOR (stream A, PLAN §5.2; rules from stream E's data/quests/events.json `director`), part of
// the gateway. Pure.
// One big event at a time (a world boss, a town under attack, a warband siege, a drake flyover): announced
// realm-wide `announceMs` ahead (10 min) with reminders (5 and 1 min), sized to the players who are online and in
// its band, with FREE waystone travel to it while it runs (the province processes do the travel: `travel
// {to:'event'}`). Picking (events.json): of the events whose `minOnline` is met and whose cooldown is over, a
// FIXED-schedule one due within the announce window wins; otherwise one is drawn by `weight` among those with at
// least `minInBand` characters within `inBandLevels` of its level. Between events: `gapMinutes` (40–80).
//
//   const d = createDirector({ now, wallNow, events, online, broadcast, procOf, sendTo, rules?, demo?, ... })
//   d.step() ; d.onState(m) ; d.status() ; d.force(id, {announce}) ; d.addEvents(list)
//
// events = [{ id, name, kind, province, x, z, r, level, band?, encounter|boss, waves?, monster?, arenas?, durationMs,
//            schedule:{type:'fixed', everyHours, atMinute} | {type:'weighted', cooldownMinutes}, minOnline, minInBand,
//            weight, announce:[soon, reminder, start], reward }]
// Messages to clients (gateway socket): realm {kind:'eventSoon'|'eventStart'|'eventEnd', ev, at?, won?, text?}
// Bus to province processes: event {op:'live', ev} (all processes: travel target) / {op:'start', ev}
// (the hosting one: run it) / {op:'stop', uid}.
// `demo` (tests, `--event-first`): every event is eligible (no head counts, no cooldowns).
// M3: a fixed-schedule event may ALSO run ON DEMAND (`schedule.onDemand: {minInBand, quietMinutes}`, or E's prose
// "on demand when >= 12 characters in band are online and none ran in the last 90 minutes"); when it last ran is
// kept in world_state (`persist`), so a restart neither forgets a cooldown nor replays a boss; an event with `roamTo`
// (the world boss breaking out, E's `roam`) sometimes marches on another arena, and the announcement says where.

export const DIRECTOR = Object.freeze({ gapMinutes: [40, 80], announceMs: 10 * 60000, reminders: [5, 1], durationMs: 20 * 60000, firstMs: 2 * 60000, inBandLevels: 3, retryMs: 60000,
  startOn: 'schedule', countdownSeconds: 15, nearGapMinutes: 3 });
// Play-test 3 R3 (E's events.json director.startOn = 'near'): "events should activate when a player goes nearby, not
// wait in real time" — fewer than 5 people play at a time. With startOn 'near' the director never picks a weighted event
// on its own: a province process reports who stands at an event (`near(id, levels)`) and, if nothing is running, the
// event is off cooldown, nearGapMinutes have passed since the last one and someone there is in band (and at least the
// event's `startOn.minLevel`), it is announced with a countdownSeconds countdown (`eventSoon {at, inMs}`, a real time)
// and starts. A FIXED-schedule event (the world boss) is still announced announceMinutes ahead with its real start time;
// walking up to it starts it early only when its on-demand rule allows (quiet long enough, enough in band).

/** Boss health and adds for `n` enrolled players (events.json `director.size`). */
export function eventScale(n, size = {}) {
  const per = size.healthPerPlayer ?? 0.12, addPer = size.addWavePerPlayers ?? 6, cap = size.capPlayers ?? 60;
  const players = Math.max(size.minPlayers ?? 1, Math.min(cap, n | 0));
  return { players, hp: 1 + per * (players - 1), adds: Math.floor(players / addPer) };
}

/** The next wall time (ms) a fixed schedule fires: every `everyHours` hours at minute `atMinute`, from midnight UTC. */
export function nextFixed(schedule, wallMs) {
  const every = Math.max(1, schedule.everyHours || 3) * 3600000, at = (schedule.atMinute || 0) * 60000;
  const day = Math.floor(wallMs / 86400000) * 86400000;
  let t = day + at;
  while (t < wallMs) t += every;
  return t;
}

/** E's prose rule ("on demand when >= 12 characters in band are online and none ran in the last 90 minutes") or a
 *  structured `schedule.onDemand` -> { minInBand, quietMs } | null. */
export function onDemandOf(schedule) {
  if (!schedule) return null;
  if (schedule.onDemand) return { minInBand: schedule.onDemand.minInBand ?? 12, quietMs: (schedule.onDemand.quietMinutes ?? 90) * 60000 };
  const m = /on demand when\s*>?=?\s*(\d+)[^.]*?last\s+(\d+)\s*minutes/i.exec(String(schedule.also || ''));
  return m ? { minInBand: +m[1], quietMs: +m[2] * 60000 } : null;
}

export function createDirector({ now, wallNow = now, log = () => {}, events = null, online, broadcast, procOf, sendTo, procList = null,
  rules = {}, demo = false, everyMs = null, announceMs = null, firstMs = null, rng = Math.random, persist = null }) {
  const R = { ...DIRECTOR, ...rules };
  const ANNOUNCE = announceMs ?? (rules.announceMinutes != null ? rules.announceMinutes * 60000 : R.announceMs);
  const reminders = (rules.reminderMinutes || R.reminders).map(m => m * 60000).filter(m => m < ANNOUNCE);
  const gap = () => (everyMs != null ? everyMs : (R.gapMinutes[0] + rng() * (R.gapMinutes[1] - R.gapMinutes[0])) * 60000);
  const list = (events || []).slice();
  const lastRun = new Map();         // event id -> WALL ms it last started (persisted)
  let loaded = !persist;
  if (persist) Promise.resolve(persist.load()).then(v => { if (v && v.lastRun) for (const [k, t] of Object.entries(v.lastRun)) if (!lastRun.has(k) || lastRun.get(k) < t) lastRun.set(k, t); loaded = true; }, () => { loaded = true; });
  const save = () => { if (persist) Promise.resolve(persist.save({ lastRun: Object.fromEntries(lastRun) })).catch(err => log('director save failed', err && err.message)); };
  let cur = null, next = now() + (firstMs ?? R.firstMs), n = 0, lastEnd = -Infinity;
  const allProcs = () => { if (procList) return procList(); const s = new Set(); for (const e of list) { const p = procOf(e.province); if (p !== undefined) s.add(p); } return s; };
  const inBand = (e, on) => on.filter(p => Math.abs((p.level || 1) - (e.level || 1)) <= R.inBandLevels).length;

  /** Choose the next event: { e, startIn } or null. */
  function choose() {
    const on = online();
    const t = now(), wall = wallNow();
    const hosted = list.filter(e => procOf(e.province) !== undefined);
    if (!hosted.length) return null;
    if (demo) {
      // the event whose band holds the most online players; ties rotate
      let best = null, bestN = -1;
      hosted.forEach((e, i) => { const k = inBand(e, on) * 100 + ((i + n) % hosted.length === 0 ? 1 : 0); if (k > bestN) { bestN = k; best = e; } });
      return best ? { e: best, startIn: ANNOUNCE } : null;
    }
    const cool = e => { const cd = (e.schedule && e.schedule.cooldownMinutes || 0) * 60000; const l = lastRun.get(e.id); return l == null || wall - l >= cd; };
    const ok = hosted.filter(e => on.length >= (e.minOnline ?? 1) && cool(e));
    // a fixed-schedule event due within the announce window wins
    let fixed = null, due = Infinity;
    for (const e of ok) if (e.schedule && e.schedule.type === 'fixed') { const at = nextFixed(e.schedule, wall) - wall; if (at <= ANNOUNCE && at < due) { due = at; fixed = e; } }
    if (fixed) return { e: fixed, startIn: Math.max(0, due) };
    // ...or a fixed one on demand: enough players in its band and it has been quiet long enough
    for (const e of ok) {
      const od = e.schedule && e.schedule.type === 'fixed' && onDemandOf(e.schedule);
      if (!od) continue;
      const l = lastRun.get(e.id);
      if ((l == null || wall - l >= od.quietMs) && inBand(e, on) >= od.minInBand) return { e, startIn: ANNOUNCE, onDemand: true };
    }
    if (R.startOn === 'near') return null;            // R3: weighted events start when someone walks up (near())
    const pool = ok.filter(e => (!e.schedule || e.schedule.type !== 'fixed') && (e.weight ?? 1) > 0 && inBand(e, on) >= (e.minInBand ?? 1));
    const total = pool.reduce((a, e) => a + (e.weight ?? 1), 0);
    if (!total) return null;
    let r = rng() * total;
    for (const e of pool) { r -= e.weight ?? 1; if (r <= 0) return { e, startIn: ANNOUNCE }; }
    return { e: pool[pool.length - 1], startIn: ANNOUNCE };
  }
  function begin(e, startIn, near = false) {
    n++;
    const t = now();
    let ev = { ...e, uid: e.id + ':' + n };
    // the world boss breaks out of its arena now and then (E's `roam`): it marches on a neighbouring zone's arena
    let roamText = null;
    if (e.roamTo && e.roamTo.length && rng() < ((e.roam && e.roam.chance) ?? 0.25)) {
      const to = e.roamTo[Math.floor(rng() * e.roamTo.length)];
      ev = { ...ev, x: to.x, z: to.z, r: Math.max(to.r || 40, 30), zone: to.zone || ev.zone, zoneName: to.zoneName || ev.zoneName, roamed: true };
      roamText = (ev.name || 'The beast') + ' has broken out' + (to.zoneName ? ' and marches on ' + to.zoneName : '') + '!';
    }
    cur = { ev, state: 'soon', startAt: t + startIn, endAt: t + startIn + (e.durationMs || R.durationMs), reminded: new Set() };
    let first = (e.announce || [])[0];
    if (near) first = `${e.name || 'An event'} begins in ${Math.round(startIn / 1000)} seconds!` + (first ? ' ' + first : '');
    broadcast({ t: 'realm', kind: 'eventSoon', ev: view(cur.ev), at: wallNow() + startIn, inMs: Math.round(startIn), text: roamText ? (first ? first + ' ' : '') + roamText : first || undefined });
  }

  return {
    step() {
      const t = now();
      if (!cur) {
        if (t < next || !loaded) return;
        const c = choose();
        // nothing to run yet (no province process has said hello, nobody in band): look again soon
        if (!c) { next = t + (list.some(e => procOf(e.province) !== undefined) ? Math.min(R.retryMs, everyMs ?? R.retryMs) : 5000); return; }
        begin(c.e, c.startIn);
        return;
      }
      if (cur.state === 'soon') {
        for (const m of reminders) if (!cur.reminded.has(m) && t >= cur.startAt - m && t < cur.startAt) {
          cur.reminded.add(m);
          broadcast({ t: 'realm', kind: 'eventSoon', ev: view(cur.ev), at: wallNow() + (cur.startAt - t), text: (cur.ev.announce || [])[1] || undefined });
        }
        if (t < cur.startAt) return;
        const on = online();
        cur.ev.scale = eventScale(inBand(cur.ev, on), R.size);
        cur.state = 'live';
        lastRun.set(cur.ev.id, wallNow()); save();
        sendTo(procOf(cur.ev.province), { k: 'event', op: 'start', ev: cur.ev });
        for (const p of allProcs()) sendTo(p, { k: 'event', op: 'live', ev: cur.ev });
        const ann = cur.ev.announce || [];
        broadcast({ t: 'realm', kind: 'eventStart', ev: view(cur.ev), text: ann.length ? ann[ann.length - 1] : undefined });
        return;
      }
      if (cur.state === 'live' && t >= cur.endAt) end(false, 'time');
    },
    onState(m) {
      if (!cur || m.uid !== cur.ev.uid) return;
      if (m.state === 'won' || m.state === 'lost') end(m.state === 'won', m.state);
      else cur.live = m;
    },
    status() { return cur ? { state: cur.state, ev: view(cur.ev), scale: cur.ev.scale || null, startsIn: Math.max(0, Math.round((cur.startAt - now()) / 1000)), live: cur.live || null } : { state: 'idle', nextIn: Math.max(0, Math.round((next - now()) / 1000)), events: list.length }; },
    /**
     * R3: someone stands at realm event `id` (a province process says so; `levels` = the levels of the players there).
     * Starts it after the countdown when the rules allow; returns true when it did.
     */
    near(id, levels = []) {
      if (cur || !loaded) return false;
      const e = list.find(x => x.id === id);
      if (!e || procOf(e.province) === undefined) return false;
      const t = now(), wall = wallNow();
      if (R.startOn !== 'near' && !(e.schedule && e.schedule.type === 'fixed')) return false;
      if (t < lastEnd + (R.nearGapMinutes ?? 3) * 60000 && lastEnd > -Infinity) return false;
      const minLv = (e.startOn && e.startOn.minLevel) || 1;
      const band = levels.filter(l => l >= minLv && Math.abs(l - (e.level || 1)) <= R.inBandLevels);
      if (!band.length) return false;
      if (online().length < (e.minOnline ?? 1)) return false;
      const fixed = e.schedule && e.schedule.type === 'fixed';
      if (fixed) {
        const od = onDemandOf(e.schedule);
        const l = lastRun.get(e.id);
        if (!od || (l != null && wall - l < od.quietMs) || band.length < Math.min(od.minInBand, 5)) return false;
      } else {
        const cd = (e.schedule && e.schedule.cooldownMinutes || 0) * 60000, l = lastRun.get(e.id);
        if (l != null && wall - l < cd) return false;
        if (band.length < Math.min(e.minInBand ?? 1, 5)) return false;
      }
      begin(e, Math.round((R.countdownSeconds ?? 15) * 1000), true);
      return true;
    },
    /** Tests/admin: start an event now (skips the wait; `announce` = ms of warning). */
    force(id = null, { announce = 0 } = {}) {
      const e = id ? list.find(x => x.id === id) : list[0];
      if (!e) return false;
      if (cur) end(false, 'replaced');
      begin(e, announce);
      return true;
    },
    get current() { return cur; },
    lastRun,
    addEvents(evs) { for (const e of evs) if (!list.some(x => x.id === e.id)) list.push(e); },
    get events() { return list; },
  };

  function end(won, why) {
    const ev = cur.ev;
    for (const p of allProcs()) sendTo(p, { k: 'event', op: 'stop', uid: ev.uid });
    broadcast({ t: 'realm', kind: 'eventEnd', ev: view(ev), won: !!won, why });
    log('event ended', ev.uid, why);
    cur = null; next = now() + gap(); lastEnd = now();
  }
  function view(e) { return { id: e.id, uid: e.uid, name: e.name, province: e.province, x: e.x, z: e.z, r: e.r || 50, level: e.level, kind: e.kind || 'boss', zoneName: e.zoneName || null, roamed: !!e.roamed }; }
}
