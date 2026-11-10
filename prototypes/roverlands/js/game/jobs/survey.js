// The Survey job's referee (Expansion 1 M10, docs/EXPANSION-1.md "Jobs" — the job referee contract; "Survey kits").
// PURE: no DOM / three.js / Rapier / sockets. js/net/jobs-core.js makes one per County room and hands it `api`.
//
// The play: buy a kit at a Supply store (kept forever). From the phone's Items app SPAWN its crate beside you (a real
// prop: carry it, load it into a vehicle, sling it under the helicopter; it can fall out and be picked up again). At a
// spot that suits the kit (js/game/survey.js judgeSpot over the place's grid) hold E: `begin`, then `setup` once the
// hold is long enough -> the crate becomes a set-up kit that stays in the world, saved in the player's profile
// (profile.sites), seen by everyone in the place. Drive back to the Survey Office: `report` pays every set-up kit not
// paid yet (once each) to the kit's owner, whoever helped set it up and everyone at the office with them, and checks the
// level goals. `pack` folds a kit back into its crate (rule 2: a kit is never lost).
//
// Wire (client -> room, `{ t:'job', id:'survey', step, … }`):
//   spawn  { kit, p? }     a crate of an owned kit beside me (p = where, within 12 m of me; else the room picks)
//   begin  { to }          I started holding E at crate `to`        setup { to }   … and held it long enough
//   pack   { n }           fold my set-up kit n back into a crate   report         I am at the Survey Office
//   sync                   send me the kits, crates and my goal again
// Room -> client (`{ t:'job', id:'survey', k, … }`):
//   k:'sites'  { list: [{ key, owner, kit, p, yaw, q, paid }] }   every set-up kit in the place (to everyone)
//   k:'crates' { list: [{ id, kit, owner }] }                     which props are kit crates (to everyone)
//   k:'spawned' { ent, kit }                                      to the spawner: the crate's entity
//   k:'setup'  { kit, q, grade, key }                             to the one who set it up
//   k:'report' { gold, n, level }                                 to the reporter
//   k:'prog'   { level, text }                                    the next level's goal (the phone's Jobs app)
// Refusals are `deny what:'job'` toasts saying why in plain words (the spot rule that failed, "walk up to it", …).
//
// kitBench(api, opts) is the whole machine with the County bits passed in, so the Moon (M12) runs the same kits with
// its own place, grid and office: kitBench(api, { place: 'moon', grid, office, levels: false, onReport }).
import { KITS, CRATE } from '../survey-kits.js';
import { placeView, judgeSpot, spotPay, surveyRules, setupMs, levelMeets, levelText, kitById } from '../survey.js';

export const NEAR_CRATE = 4;           // metres: how close you stand to a crate to set it up
export const NEAR_SITE = 7;            // ... to pack a set-up kit
export const OFFICE_R = 45;            // metres from the Survey Office that count as "at the office"
export const SPAWN_R = 12;             // a spawned crate goes down this close to you (or nearer)
export const ON_GROUND = 1.4;          // the page: a crate's middle at most this far over the ground stands on it (not in a truck bed)
const ON_GROUND_ROOM = 2.4;            // the room checks against its coarse 8 m grid, so it allows more

export function surveyReferee(api) {
  const grid = api.sites?.surveyGrid, office = grid?.office || (api.sites?.places || []).find(p => p.kind === 'survey_office');
  if (!grid || !office) return null;
  return kitBench(api, { place: api.job.place || 'county', grid, office });
}

export function kitBench(api, { place = 'county', grid, office, kits = KITS, levels = true, onReport = null, officeR = OFFICE_R } = {}) {
  const V = placeView(grid);
  if (!V) return null;
  const job = api.job;
  const crates = new Map();              // entId -> { kit, pid, at }
  const begins = new Map();              // pid -> { crate, at, p }
  const helpers = new Map();             // `${ownerKey}:${siteId}` -> Set(pids)  (this session only)
  const told = new Map(), warned = new Map();
  let lastSig = '', lastTick = 0;
  const kitOf = id => kits.find(k => k.id === id) || null;
  const warn = (pid, what, why) => { const k = pid + ':' + what, t = api.now(); if (t - (warned.get(k) || 0) < 2500) return; warned.set(k, t); api.deny(pid, why); };
  const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const sitesOf = P => (P?.profile?.sites || []).filter(s => s.place === place);
  const key = (pid, s) => `${pid}:${s.id}`;

  /** Every set-up kit in this place (everyone connected), as the client draws it. */
  function allSites() {
    const out = [];
    for (const q of api.players()) {
      if (q.spec) continue;
      const P = api.player(q.pid);
      for (const s of sitesOf(P)) out.push({ key: key(q.pid, s), owner: q.pid, id: s.id, kit: s.kit, p: s.p.slice(), yaw: s.yaw, q: s.q, paid: s.paid });
    }
    return out;
  }
  const others = (exceptKey = null) => allSites().filter(s => s.key !== exceptKey).map(s => ({ kit: s.kit, x: s.p[0], z: s.p[2] }));
  const crateList = () => [...crates].map(([id, c]) => ({ id, kit: c.kit, owner: c.pid }));
  function castAll() { const list = allSites(); lastSig = JSON.stringify(list); api.cast({ k: 'sites', list }); api.cast({ k: 'crates', list: crateList() }); }

  function goal(pid) {
    const P = api.player(pid); if (!P?.profile) return null;
    const L = api.nextLevel(pid), row = L ? job.levels.find(l => l.n === L) : null;
    if (!row) return { level: null, text: 'Every survey level done. Set up kits anywhere good for gold.' };
    return { level: L, text: `${row.goal}. ${levelText(row.need, sitesOf(P))}` };
  }
  function sendProg(pid) {
    if (!levels) return;
    const g = goal(pid); if (!g) return;
    const k2 = `${g.level}|${g.text}`;
    if (told.get(pid) === k2) return;
    told.set(pid, k2);
    api.send(pid, { k: 'prog', level: g.level, text: g.text });
  }

  // ------------------------------------------------------------------------------------------------------ steps
  function spawn(pid, msg) {
    const P = api.player(pid); if (!P?.pos) return warn(pid, 'spawn', 'Wait a moment and try again.');
    if (P.place !== place) return warn(pid, 'spawn', 'Survey kits are for the ground — land first.');
    const kit = kitOf(msg.kit); if (!kit) return warn(pid, 'spawn', 'That is not a survey kit.');
    if (!P.profile?.owned?.kits?.includes(kit.id)) return warn(pid, 'spawn', `You do not own a ${kit.name} yet — the Supply stores sell them.`);
    const R = surveyRules(api.upgrades(pid));
    const standing = sitesOf(P).filter(s => s.kit === kit.id).length, waiting = [...crates.values()].filter(c => c.pid === pid && c.kit === kit.id).length;
    if (standing + waiting >= kit.max) return warn(pid, 'spawn', `All your ${kit.name}s are out (${kit.max}) — pack one up first.`);
    if (!api.take('spawn:' + pid, 0.5, 2)) return warn(pid, 'spawn', 'One crate at a time.');
    // one crate out at a time (two with the Second crate slot): the oldest one goes back to the store
    const mine = [...crates].filter(([, c]) => c.pid === pid).sort((a, b) => a[1].at - b[1].at);
    while (mine.length >= R.crates) { const [id] = mine.shift(); crates.delete(id); api.remove(id); }
    let at = Array.isArray(msg.p) && flat(msg.p, P.pos) <= SPAWN_R ? msg.p : [P.pos[0] + 2.5, null, P.pos[2] + 1.5];
    const id = api.spawn({ kind: CRATE.kind, p: [at[0], null, at[2]], yaw: 0, owner: pid });
    if (id == null) return warn(pid, 'spawn', 'There are too many things out already.');
    crates.set(id, { kit: kit.id, pid, at: api.now() });
    api.cast({ k: 'crates', list: crateList() });
    api.send(pid, { k: 'spawned', ent: id, kit: kit.id });
  }
  /** Is pid on foot beside crate `id`? -> { P, c, e } or a refusal sentence. */
  function atCrate(pid, id) {
    const c = crates.get(id); if (!c) return 'That crate is not a survey kit.';
    const P = api.player(pid), e = api.ent(id);
    if (!P?.pos || !e?.pos) return 'Wait a moment and try again.';
    if (P.seat) return 'Get out to set it up.';
    if (flat(P.pos, e.pos) > NEAR_CRATE || Math.abs(P.pos[1] - e.pos[1]) > 3) return 'Walk up to the crate first.';
    if (e.pos[1] != null && e.pos[1] - V.heightAt(e.pos[0], e.pos[2]) > ON_GROUND_ROOM) return 'Put the crate on the ground first.';
    return { P, c, e };
  }
  function begin(pid, msg) {
    const r = atCrate(pid, msg.to); if (typeof r === 'string') return warn(pid, 'begin', r);
    const kit = kitOf(r.c.kit), j = judgeSpot(kit, V, r.e.pos, { others: others(), office });
    if (!j.ok) return warn(pid, 'begin', `Not here: ${j.why}.`);
    begins.set(pid, { crate: msg.to, at: api.now(), p: r.e.pos.slice() });
  }
  function setup(pid, msg) {
    const r = atCrate(pid, msg.to); if (typeof r === 'string') return warn(pid, 'setup', r);
    const b = begins.get(pid);
    if (!b || b.crate !== msg.to) return warn(pid, 'setup', 'Hold E beside the crate to set it up.');
    const kit = kitOf(r.c.kit), need = setupMs(kit, api.upgrades(pid));
    if (api.now() - b.at < need * 0.8) return warn(pid, 'setup', 'Keep holding — it is still unfolding.');
    if (flat(b.p, r.e.pos) > 2) { begins.delete(pid); return warn(pid, 'setup', 'The crate moved — start again.'); }
    const j = judgeSpot(kit, V, r.e.pos, { others: others(), office });
    if (!j.ok) { begins.delete(pid); return warn(pid, 'setup', `Not here: ${j.why}.`); }
    begins.delete(pid);
    // the kit is the crate owner's (they bought it); if they have gone, the one who set it up keeps it
    const ownerPid = api.player(r.c.pid)?.profile ? r.c.pid : pid, O = api.player(ownerPid);
    const list = (O.profile.sites ||= []);
    const sid = list.reduce((a, s) => Math.max(a, s.id), 0) + 1;
    const p = [r.e.pos[0], V.heightAt(r.e.pos[0], r.e.pos[2]), r.e.pos[2]].map(v => Math.round(v * 100) / 100);
    const yaw = Math.round(Math.atan2(r.e.pos[0] - r.P.pos[0], r.e.pos[2] - r.P.pos[2]) * 1000) / 1000 || 0;
    list.push({ id: sid, kit: kit.id, place, p, yaw, q: j.q, paid: false, at: api.now() });
    const h = new Set([pid, ownerPid]);
    for (const q of api.players()) if (!q.spec && q.place === place && q.pos && flat(q.pos, p) <= 30) h.add(q.pid);
    helpers.set(`${ownerPid}:${sid}`, h);
    crates.delete(msg.to); api.remove(msg.to);
    api.saveProfile(ownerPid);
    castAll();
    api.send(pid, { k: 'setup', kit: kit.id, q: j.q, grade: j.grade, key: `${ownerPid}:${sid}` });
    sendProg(ownerPid);
  }
  function pack(pid, msg) {
    const P = api.player(pid); if (!P?.pos) return warn(pid, 'pack', 'Wait a moment and try again.');
    const list = P.profile?.sites || [], i = list.findIndex(s => s.id === msg.n && s.place === place);
    if (i < 0) return warn(pid, 'pack', 'Only the one who set a kit up can pack it.');
    const s = list[i];
    if (P.seat || flat(P.pos, s.p) > NEAR_SITE) return warn(pid, 'pack', 'Walk up to the kit to pack it.');
    list.splice(i, 1);
    helpers.delete(`${pid}:${s.id}`);
    api.saveProfile(pid);
    // it folds back into its crate where it stood (rule 2: never lost) — unless your crate slots are full
    const R = surveyRules(api.upgrades(pid));
    if ([...crates.values()].filter(c => c.pid === pid).length < R.crates) {
      const id = api.spawn({ kind: CRATE.kind, p: [s.p[0], null, s.p[2]], yaw: 0, owner: pid });
      if (id != null) crates.set(id, { kit: s.kit, pid, at: api.now() });
    }
    castAll();
    told.delete(pid); sendProg(pid);
  }
  function report(pid) {
    const P = api.player(pid); if (!P?.pos) return;
    if (P.place !== place || flat(P.pos, [office.x, 0, office.z]) > officeR) return warn(pid, 'report', `Drive to the ${office.name || 'Survey Office'} to report.`);
    if (!api.take('report:' + pid, 0.5, 2)) return;
    const vehicle = P.seat ? P.seat[0] : null, at = [office.x, office.y ?? null, office.z];
    const fresh = sitesOf(P).filter(s => !s.paid);
    let gold = 0;
    for (const s of fresh) {
      const kit = kitOf(s.kit), g = spotPay(kit, s.q, flat(s.p, [office.x, 0, office.z]));
      s.paid = true;                                    // marked BEFORE paying: a second report finds nothing to pay
      const crew = [...(helpers.get(`${pid}:${s.id}`) || [])].filter(q => api.player(q));
      api.payTo({ pids: [pid, ...crew], gold: g, at, vehicle, why: `Survey · ${kit?.name || 'kit'} reported` });
      gold += g;
    }
    if (fresh.length) api.saveProfile(pid);
    let level = null;
    if (levels) {
      const L = api.nextLevel(pid), row = L ? job.levels.find(l => l.n === L) : null;
      if (row && levelMeets(row.need, sitesOf(P))) { const r = api.levelDone(pid, L, { at, vehicle }); if (r?.ok) level = L; }
    }
    onReport?.(pid, fresh);
    if (!fresh.length && !level) return warn(pid, 'report', 'Nothing new to report — set up a kit first.');
    castAll();
    api.send(pid, { k: 'report', gold, n: fresh.length, level });
    told.delete(pid); sendProg(pid);
  }

  return {
    step(pid, msg) {
      switch (msg.step) {
        case 'spawn': return spawn(pid, msg);
        case 'begin': return begin(pid, msg);
        case 'setup': return setup(pid, msg);
        case 'pack': return pack(pid, msg);
        case 'report': return report(pid);
        case 'sync': api.send(pid, { k: 'sites', list: allSites() }); api.send(pid, { k: 'crates', list: crateList() }); told.delete(pid); return sendProg(pid);
      }
    },
    tick() {
      const t = api.now(); if (t - lastTick < 1000) return; lastTick = t;
      // crates that are gone (a reset, the room's own clean-up) are forgotten; someone arriving / leaving changes the kits shown
      let gone = false;
      for (const id of [...crates.keys()]) if (!api.ent(id)) { crates.delete(id); gone = true; }
      const list = allSites(), sig = JSON.stringify(list);
      if (sig !== lastSig || gone) { lastSig = sig; api.cast({ k: 'sites', list }); api.cast({ k: 'crates', list: crateList() }); }
    },
    resync(pid) { api.send(pid, { k: 'sites', list: allSites() }); api.send(pid, { k: 'crates', list: crateList() }); told.delete(pid); sendProg(pid); },
    profileChanged(pid) { told.delete(pid); sendProg(pid); },
    // tests
    crates, view: V, office, judge: (kitId, p) => judgeSpot(kitById(kitId), V, p, { others: others(), office }), sites: allSites, goal,
  };
}
