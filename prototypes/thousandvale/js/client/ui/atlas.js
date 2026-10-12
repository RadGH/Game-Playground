// The atlas: the one place the map, the minimap, the journal and the quest tracker get their facts from
// (play-test P3/P13/P17/P27). It owns
//   * the map model + pictures (map-load.js), loaded in the background after you enter the world;
//   * the fog of the map: 128 m cells you have been near, saved per character (localStorage, wrapped);
//     a dungeon has its own fog per instance (2 m tiles, kept for the session);
//   * your quests with WHERE each current step happens (map-data.js locateQuest) and which one you track;
//   * live events (the realm event and your zone's event) with their arena;
//   * your pins (right-click the map), saved per character;
//   * party members you can see (partyFrames ids -> actors).
// DOM-free; the views ask `markers()` and subscribe to `onChange`.

import { soonText, eventStateText } from './pt2-core.js';
import { createMapSource } from './map-load.js';
import { createFog, collectMarkers, locateQuest, zoneKeyAt, ZONE_M, whereText, titleCase } from './map-data.js';
import { unrleTiles } from '../../sim/dungeon.js';
import { HIDDEN } from './hidden-events.js';
import { staleEvents } from './pt10-core.js';          // W13: events the player hid from the HUD

const store = {
  get(k, d = null) { try { const v = localStorage.getItem('tv.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tv.' + k, JSON.stringify(v)); } catch { /* private window */ } },
};
export const REVEAL_M = 260;          // how far you "see" for the map as you walk (outdoors)
export const REVEAL_DUNGEON_M = 9;

export function createAtlas({ net, me, room, actors, objects, worldUi }) {
  const src = createMapSource();
  const S = {
    model: null, world: null, fog: null, char: null, fogDirty: false, fogSavedAt: 0,
    quests: [], tracked: store.get('track', null), trackSet: new Set(store.get('trackSet', null) || []), trackInit: store.get('trackSet', null) != null, events: new Map(), pins: [], party: [],
    dungeon: null, dFog: new Map(), detail: new Map(), at: 0, version: 0,
  };
  const listeners = new Set();
  const changed = () => { S.version++; for (const f of listeners) f(); };

  // ---- loading ----
  async function load() {
    try { S.model = await src.model(); } catch { return; }
    if (!S.fog) S.fog = createFog({ w: S.model.worldW, h: S.model.worldH, cell: 128 });
    loadFogFor(S.char);
    relocateQuests();
    changed();
    src.worldImage().then(w => { S.world = w; changed(); });
  }
  src.onZoneImage(() => changed());
  function loadFogFor(char) {
    if (!S.fog || char == null) return;
    S.fog.clear();
    S.fog.load(store.get('fog.' + char, null));
    S.pins = store.get('pins.' + char, []) || [];
  }
  function saveFog(force = false) {
    if (!S.fog || S.char == null || !S.fogDirty) return;
    const now = Date.now();
    if (!force && now - S.fogSavedAt < 8000) return;
    S.fogSavedAt = now; S.fogDirty = false;
    store.set('fog.' + S.char, S.fog.save());
  }
  addEventListener('pagehide', () => saveFog(true));

  // ---- quests ----
  function goalOf(q) {
    if (q.ready) return 'Ready to hand in';
    const st = q.steps?.[q.step];
    if (!st) return q.text || '';
    return `${st.text || 'Next step'}${st.of > 1 ? ` — ${st.n || 0}/${st.of}` : ''}`;
  }
  function relocateQuests() {
    const p = me();
    for (const q of S.quests) {
      q.loc = S.model ? locateQuest(q, S.model, p) : null;
      q.goal = goalOf(q);
      const def = S.model?.quests.get(q.id);
      q.giverName = q.giverName || (S.model?.npcs.get(q.giver)?.name) || null;
      q.where = q.steps?.[q.step]?.where || def?.steps?.[q.step]?.where || null;
      q.zoneName = q.zoneName || S.model?.zones.get(q.zone)?.name || (q.zone ? titleCase(q.zone) : '');
    }
  }
  function onQuests(m) {
    const before = new Set(S.quests.map(q => q.id));
    S.quests = (m.active || []).map(q => ({ ...q }));
    relocateQuests();
    // a freshly accepted quest becomes the tracked one; a finished tracked quest hands tracking to the next
    const fresh = S.quests.filter(q => !before.has(q.id));
    // S2: a quest you take is tracked (shown on the HUD); untracking hides it until you track it again
    if (!S.trackInit) { for (const q of S.quests) S.trackSet.add(q.id); S.trackInit = true; }
    else if (before.size) for (const q of fresh) S.trackSet.add(q.id);
    for (const id of [...S.trackSet]) if (!S.quests.some(q => q.id === id)) S.trackSet.delete(id);
    store.set('trackSet', [...S.trackSet]);
    if (fresh.length && before.size) setTracked(fresh[0].id, false);
    if (!S.quests.some(q => q.id === S.tracked && S.trackSet.has(q.id))) setTracked(S.quests.find(q => S.trackSet.has(q.id))?.id || null, false);
    changed();
  }
  function setTracked(id, notify = true) { S.tracked = id; if (id) { S.trackSet.add(id); store.set('trackSet', [...S.trackSet]); } store.set('track', id); if (notify) changed(); }
  /** S2: stop showing a quest on the HUD (its map marker and arrow go too); the next tracked one leads. */
  function untrack(id) { S.trackSet.delete(id); store.set('trackSet', [...S.trackSet]); if (S.tracked === id) { S.tracked = S.quests.find(q => S.trackSet.has(q.id))?.id || null; store.set('track', S.tracked); } changed(); }

  // ---- events ----
  function eventFromArena(ev) {
    if (Number.isFinite(ev.x)) return ev;
    const a = S.model?.pois.find(p => p.kind === 'event' && (p.arena === ev.site || p.arena === ev.id));
    return a ? { ...ev, x: a.x, z: a.z, r: a.r } : ev;
  }
  function onRealm(m) {
    const ev = m.ev || {};
    if (m.kind === 'eventStart') S.events.set('realm', { ...eventFromArena(ev), uid: ev.uid || 'realm', sub: `${ev.kind === 'worldboss' ? 'World boss' : 'Realm event'} — waystone travel there is free`, free: true });
    else if (m.kind === 'eventSoon') S.events.set('realm', { ...eventFromArena(ev), uid: ev.uid || 'realm', sub: soonText(m.at), soon: true, at: m.at });
    else if (m.kind === 'eventEnd') S.events.delete('realm');
    changed();
  }
  function onZoneEvent(m) {
    const ev = m.ev || {};
    // R3 (§19): the zone's events with their state — ready / soon (countdown) / live / cooldown (ready again at)
    if (m.kind === 'states') { applyStates(m.list); return; }
    if (m.kind === 'end' && Number.isFinite(m.next)) { const k = 'zone:' + (ev.uid || ev.id); const e = { ...(S.events.get(k) || eventFromArena(ev)), state: 'cooldown', at: m.next, soon: false, timed: true }; e.sub = eventStateText(e) + ' — zone event'; S.events.set(k, e); changed(); return; }
    if (m.kind === 'end') S.events.delete('zone:' + (ev.uid || ev.id));
    else S.events.set('zone:' + (ev.uid || ev.id), { ...eventFromArena(ev), sub: m.kind === 'soon' ? `${soonText(m.at)} — zone event` : `Zone event${ev.waves ? ` · wave ${ev.wave}/${ev.waves}` : ''}`, soon: m.kind === 'soon', at: m.kind === 'soon' ? m.at : undefined });
    changed();
  }

  function applyStates(list) {
    for (const x of list || []) {
      const k = 'zone:' + (x.uid || x.id);
      const e = { ...(S.events.get(k) || {}), ...eventFromArena(x), state: x.state, at: x.at, soon: x.state === 'soon', timed: x.state === 'soon' || x.state === 'cooldown' };
      e.sub = eventStateText(e) + ' — zone event';
      S.events.set(k, e);
    }
    changed();
  }

  // ---- dungeon ----
  function setDungeon(d, roomId) {
    if (!d) { S.dungeon = null; changed(); return; }
    const cell = d.cell || 2;
    const floors = d.floors.map(f => ({ ...f, tilesFlat: Array.isArray(f.tiles) ? unrleTiles(f.tiles, f.w * f.h) : f.tiles }));
    let maxX = 0, maxZ = 0;
    for (const f of floors) { maxX = Math.max(maxX, f.origin.x + f.w * cell); maxZ = Math.max(maxZ, f.origin.z + f.h * cell); }
    if (!S.dFog.has(roomId)) S.dFog.set(roomId, createFog({ w: maxX + cell, h: maxZ + cell, cell }));
    S.dungeon = { id: roomId, name: d.name || 'Dungeon', family: d.family, level: d.level, cell, floors, fog: S.dFog.get(roomId) };
    changed();
  }
  function floorAt(x, z) {
    const d = S.dungeon; if (!d) return null;
    for (const f of d.floors) if (x >= f.origin.x && z >= f.origin.z && x < f.origin.x + f.w * d.cell && z < f.origin.z + f.h * d.cell) return f;
    return d.floors[0] || null;
  }

  // ---- server places ----
  S.placesSrv = new Map();
  function learnPlace(p) {
    if (!p || !Number.isFinite(p.x)) return;
    S.placesSrv.set(p.key, p);
    if ((p.discovered || p.kind === 'town') && S.fog && S.fog.reveal(p.x, p.z, Math.max(40, (p.r || 20) + 20))) S.fogDirty = true;
  }
  // ---- party ----
  function onPartyFrames(list) { S.party = list || []; }

  // ---- the tick: reveal what you can see ----
  function tick(dt) {
    S.at -= dt;
    if (S.at > 0) return;
    S.at = 0.4;
    // R3: a waiting event's line counts down in seconds (the map card, the minimap, the tracker read `sub`)
    for (const e of S.events.values()) if (e.soon || e.timed) { const t = (e.state ? eventStateText(e) : soonText(e.at)) + (e.sub && e.sub.includes('zone event') ? ' — zone event' : ''); if (t !== e.sub) { e.sub = t; changed(); } }
    const p = me(); if (!p) return;
    if (S.dungeon) {
      const n = S.dungeon.fog.reveal(p.x, p.z, REVEAL_DUNGEON_M);
      if (n) changed();
    } else if (S.fog) {
      const n = S.fog.reveal(p.x, p.z, REVEAL_M);
      if (n) { S.fogDirty = true; changed(); }
      saveFog();
      // quests: "nearest camp" depends on where you are; refresh the places every few seconds
      if ((S.reloc = (S.reloc || 0) + 1) % 12 === 0) relocateQuests();
    }
  }

  // ---- what to draw ----
  function partyMarkers() {
    const out = [];
    const mine = net()?.joined?.you?.char;
    const myRoom = net()?.joined?.room?.id;
    const seenChar = new Set();
    for (const r of S.party) {
      if (r.char === mine || !r.online || seenChar.has(r.char)) continue;      // (Y37: never yourself, never twice)
      seenChar.add(r.char);
      const a = r.id != null ? actors?.get(r.id) : null;
      const name = a?.name || (net()?.party?.members || []).find(m => m.char === r.char)?.name || 'Party member';
      const tracked = !!api.trackedChar?.(r.char);      // play-test 10 (Y36): a tracked member gets the distance on the minimap's rim
      if (a) out.push({ char: r.char, name, x: a.pos.x, z: a.pos.z, sub: r.dead ? 'Fallen' : 'Party member', tracked });
      else if (r.room === myRoom && Number.isFinite(r.x)) out.push({ char: r.char, name, x: r.x, z: r.z, sub: r.dead ? 'Fallen' : 'Party member', tracked });
    }
    return out;
  }
  function markers({ withMe = true } = {}) {
    const p = me();
    const j = net()?.joined;
    const known = new Set(worldUi?.knownWaystones?.() || j?.you?.waystones || []);
    if (S.dungeon) {
      const list = [];
      for (const o of objects?.items?.values?.() || []) {
        if (!['stairs', 'exit', 'chest', 'portal', 'gate', 'lever'].includes(o.type)) continue;
        if (!S.dungeon.fog.seen(o.x, o.z)) continue;
        list.push({ id: 'o:' + o.id, kind: 'object', x: o.x, z: o.z, name: o.name || titleCase(o.type), sub: { stairs: 'Stairs', exit: 'The way out', chest: o.opened ? 'Emptied' : 'Reward chest', gate: 'Gate', lever: 'Lever', portal: 'Door' }[o.type] || '', color: { stairs: '#e8d8a0', exit: '#8fe08a', chest: o.opened ? '#7a6a50' : '#ffcf3a', gate: '#a0a0a0', lever: '#c8a060', portal: '#8fd0ff' }[o.type], priority: 3, size: 6 });
      }
      for (const a of actors?.actors?.values?.() || []) {
        if (!a.hostile || a.dead || a.id === p?.id) continue;
        if (api.sightOwnsMonsters) continue;                      // play-test 6 U14: ui/pt5.js draws what is in the line of sight
        if (!S.dungeon.fog.seen(a.pos.x, a.pos.z)) continue;
        if (p && Math.hypot(a.pos.x - p.x, a.pos.z - p.z) > 40) continue;
        list.push({ id: 'mob:' + a.id, kind: 'monster', x: a.pos.x, z: a.pos.z, name: a.name, sub: `Level ${a.level}${a.rank ? ' ' + a.rank : ''}`, boss: a.rank === 'boss', priority: 2, size: a.rank === 'boss' ? 8 : 5 });
      }
      for (const m of partyMarkers()) list.push({ id: 'pm:' + m.char, kind: 'party', ...m, priority: 4, size: 6 });
      for (const x of api.extraMarkers?.() || []) list.push(x);
      if (withMe && p) list.push({ id: 'me', kind: 'me', x: p.x, z: p.z, yaw: p.yaw, name: 'You', priority: 10, size: 8 });
      return list;
    }
    const list = collectMarkers({ model: S.model, room: room(), known, fog: S.fog, quests: S.quests.filter(q => S.trackSet.has(q.id)), tracked: S.tracked, events: [...S.events.values()].filter(e => Number.isFinite(e.x)), party: partyMarkers(), pins: S.pins, me: withMe ? p : null, level: p?.level || 1 });
    for (const sp of S.placesSrv.values()) {
      if (!sp.discovered || !['vignette', 'hook'].includes(sp.kind)) continue;
      list.push({ id: 'sp:' + sp.key, kind: 'landmark', x: sp.x, z: sp.z, name: sp.name || 'A place of note', sub: sp.kind === 'hook' ? 'Something worth a closer look' : 'Point of interest', priority: 1, size: 5 });
    }
    for (const x of api.extraMarkers?.() || []) list.push(x);      // play-test 4: loot on corpses, announced mini bosses, quest areas (ui/pt2.js)
    // W13: an event the player hid stays on the big map (greyed, so it can be brought back) and leaves the minimap
    if (HIDDEN.size) for (const m of list) if (m.kind === 'liveevent') { const e = [...S.events.values()].find(x => 'ev:' + (x.uid || x.id || x.name) === m.id); if (e && HIDDEN.has(e)) { m.hiddenEv = true; m.dim = true; m.act = null; m.sub = `${m.sub ? m.sub + ' · ' : ''}hidden from your screen`; } }
    const meM = list.find(m => m.kind === 'me'); if (meM && p) meM.yaw = p.yaw;
    return list;
  }

  // ---- pins ----
  function addPin(x, z, name = 'Your pin') {
    const id = Date.now().toString(36);
    S.pins.push({ id, x, z, name });
    if (S.pins.length > 12) S.pins.shift();
    if (S.char != null) store.set('pins.' + S.char, S.pins);
    changed();
    return id;
  }
  function removePin(id) { S.pins = S.pins.filter(p => p.id !== id); if (S.char != null) store.set('pins.' + S.char, S.pins); changed(); }

  function wire(n) {
    n.on('joined', j => {
      const ch = j.you?.char ?? null;
      if (ch !== S.char) { saveFog(true); S.char = ch; loadFogFor(ch); }
      if (j.room?.dungeon) setDungeon(j.room.dungeon, j.room.id); else if (S.dungeon) setDungeon(null);
      // server-side discovery, when stream A sends it (cells in 128 m units, or zone keys)
      if (Array.isArray(j.you?.explored) && S.fog) { if (S.fog.merge(j.you.explored)) S.fogDirty = true; }
      if (!S.model) load(); else changed();
    });
    n.on('quests', onQuests);
    n.on('realm', onRealm);
    // play-test 10 (Y11): drop pins / list rows for events the server no longer lists; never offer travel to a dead one
    n.on('eventSync', m => { const gone = staleEvents([...S.events].map(([key, e]) => ({ key, uid: e.uid, id: e.id, realm: key === 'realm', state: e.state || (e.soon ? 'soon' : 'live'), at: e.at })), m); for (const k of gone) S.events.delete(k); if (gone.length) changed(); });
    n.on('travelR', r => { if (r && r.ok === false && (r.gone || r.why === 'noEvent') && S.events.has('realm') && !S.events.get('realm').soon) { S.events.delete('realm'); changed(); } });
    n.on('zoneEvent', onZoneEvent);
    n.on('zone', z => { if (Array.isArray(z.events)) applyStates(z.events); });   // R3: the zone's events + states on arrival
    n.on('partyFrames', onPartyFrames);
    n.on('explored', m => { if (S.fog && S.fog.merge(m.cells || [])) { S.fogDirty = true; changed(); } });
    // protocol §17.3: the server's own discovery — places you found light up the map round them, live events get a pin
    n.on('mapData', m => { S.server = m; for (const p of m.places || []) learnPlace(p); for (const e of m.events || []) if (Number.isFinite(e.x)) S.events.set(e.realm ? 'realm' : 'zone:' + (e.uid || e.id), { ...e, sub: e.realm ? 'Realm event — waystone travel there is free' : 'Zone event', free: !!e.realm, ...(e.state ? { state: e.state, at: e.at, soon: e.state === 'soon', timed: e.state === 'soon' || e.state === 'cooldown' } : {}) }); for (const e of S.events.values()) if (e.state && !e.free) e.sub = eventStateText(e) + ' — zone event'; changed(); });
    n.on('discover', m => { for (const p of m.places || []) learnPlace(p); changed(); });
    n.on('joined', () => { try { net()?.map?.(); } catch { /* old server */ } });
    HIDDEN.onChange(changed);
  }

  const api = {
    wire, tick, markers, addPin, removePin, setTracked, untrack, isTracked: id => S.trackSet.has(id), floorAt, src, load, setDungeon,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get model() { return S.model; }, get world() { return S.world; }, get fog() { return S.fog; }, get dungeon() { return S.dungeon; },
    get quests() { return S.quests; }, get tracked() { return S.tracked; }, get trackedQuest() { return S.quests.find(q => q.id === S.tracked) || null; },
    get events() { return [...S.events.values()]; }, get places() { return [...S.placesSrv.values()]; }, get pins() { return S.pins; }, get version() { return S.version; },
    zoneDetail(key) { if (!S.detail.has(key)) { S.detail.set(key, []); src.zoneDetail(key).then(l => { S.detail.set(key, l); changed(); }); } return S.detail.get(key); },
    detailNear(x, z) { const m = new Map(); const k = zoneKeyAt(x, z); m.set(k, this.zoneDetail(k)); return m; },
    whereText: (to, r) => whereText(me(), to, r),
    zoneAt: (x, z) => S.model?.zones.get(zoneKeyAt(x, z)) || null,
    ZONE_M,
    /** test hook: reveal a circle */
    reveal(x, z, r) { if (S.fog) { S.fog.reveal(x, z, r); S.fogDirty = true; changed(); } },
    extraMarkers: null, sightOwnsMonsters: false,
  };
  return api;
}
