// Playing a chapter: the street in its own band under the HUD rows (view in the .wr-stage box), the session (local, or
// the online one handed over by js/ui/online.js) ticked every frame with each player's device, the HUD, touch
// controls, sound, and every fight event folded into the save (loot to that player's bag, gold, experience, levels).
// Esc / Start / ☰ pause (online: the menu opens but the fight goes on). Won → results; lost → retry from the last
// fight or back to the map.
import { createLocalSession } from '../game.js';
import { applyEvents, chapterCleared } from '../save.js';
import { placeShort, esc } from './text.js';
import { readersFor, COLORS } from './party.js';
import { createHud } from './hud.js';
import { createTouchControls } from '../input/touch.js';
import { sellPrice } from './peddler.js';
import { icon } from './icons.js';
import { anySheet, openSheet } from './kit.js';
import { soundEvents } from '../audio.js';
import { releaseHold } from '../sim/brawl.js';
import { openBossScene } from './bossscene.js';
import { hintScheme } from './party.js';

/** Online: the party is the room's heroes — this device's keep their saved hero, the rest are drawn from the room. */
function onlineParty(session, mine) {
  return session.G.heroes.map((h, i) => (session.localPids.includes(h.pid)
    ? { pid: h.pid, device: 'solo', heroId: mine, color: COLORS[i % 4] }
    : { pid: h.pid, device: 'remote', remote: true, color: COLORS[i % 4], bot: { name: h.name, cls: h.cls, level: h.level, gear: h.gear || {}, look: h.look || {}, spells: h.spells || [] } }));
}

export function playScreen(app, opts = {}) {
  const { data, T } = app;
  const chapters = data.chapters.chapters;
  let party = opts.party || app.party || [];
  let session = opts.session || null;
  if (session) {
    // online: this device's players keep their saved hero; everyone else is drawn from the room (nothing saved for them)
    party = onlineParty(session, opts.heroId || app.save.lastHero);
  }
  const chIndex = Math.max(0, chapters.findIndex(c => c.id === (opts.chapter || session?.G?.ch?.id))), ch = chapters[chIndex];
  const heroOfPid = pid => { const s = party.find(x => x.pid === pid); return s && !s.bot ? app.hero(s.heroId) : null; };
  if (!session) {
    const heroes = party.map(s => {
      const h = s.bot || app.hero(s.heroId);
      return { pid: s.pid, name: h.name, cls: h.cls, level: h.level, xp: h.xp, gear: h.gear, spells: h.spells, look: app.heroLook(h), ctrl: s.bot ? 'bot' : 'player' };
    });
    session = createLocalSession({ data, T, chapter: ch.id, heroes, section: opts.section || 0, seed: (Math.random() * 1e9) >>> 0 });
  }
  app.session = session;
  app.view.setLocalPids(session.localPids);   // xp / gold labels over this device's own heroes only (render 7794c9bf)
  const G = session.G;
  const start = { levels: Object.fromEntries(party.map(s => [s.pid, (s.bot || app.hero(s.heroId))?.level || 1])), best: Object.fromEntries(party.map(s => [s.pid, s.bot ? null : app.hero(s.heroId)?.best?.[ch.id] || null])), section: G.secI };
  const found = {};                 // pid → items found this run

  // a touch player, or one player on a touch screen
  const touchSlot = party.find(s => s.device === 'touch') || (party.length && party.filter(s => !s.bot).length === 1 && matchMedia('(pointer: coarse)').matches ? party.find(s => s.device === 'solo' && !s.bot) || null : null);
  app.ui.innerHTML = `<section class="wr-play${touchSlot ? ' wr-touch-on' : ''}${party.filter(s => !s.bot).length > 2 ? ' wr-play-many' : ''}">
    <div class="wr-hud-top"><div class="wr-panels"></div><button type="button" class="wr-icon-btn wr-pause-btn" data-act="pause" aria-label="Menu">${icon('menu')}</button></div>
    <div class="wr-stage" aria-label="${ch.name}"><div class="wr-stage-top"><div class="wr-hud-info"></div></div>
      <div class="wr-stage-cover" role="status"><div class="wr-spinner"></div><p><small>${esc(placeShort(data, ch.id))}</small><b>${esc(ch.name)}</b></p></div></div>
    <div class="wr-touch-band"></div>
  </section>`;
  const root = app.ui.firstElementChild, stage = root.querySelector('.wr-stage');
  app.viewBox(stage);
  const ro = new ResizeObserver(() => app.viewBox(stage)); ro.observe(stage); ro.observe(root.querySelector('.wr-hud-top'));
  app.view.scenic(false);
  // the street is built behind a cover and shown only when it is ready (#104: a flash of the last chapter showed
  // first); the fight does not run while it is covered
  const cover = root.querySelector('.wr-stage-cover');
  let ready = false, shownFrames = 0;
  (async () => {
    try { await app.view.setChapter(ch.id); } catch (e) { console.warn(e); }
    for (let i = 0; i < 600 && app.view.loading; i++) await new Promise(r => setTimeout(r, 30));   // a build already under way (the map started it)
    ready = true;
  })();
  app.audio.ambience(ch.id);

  // online: this device's player always has controls, even while waiting to walk in mid-chapter (session.waiting)
  const readers = readersFor(app.input, session.online ? session.localPids.map(pid => ({ pid, device: 'solo' })) : party.filter(s => !s.remote));
  let touch = null;
  if (touchSlot) {
    const r = readers[touchSlot.pid];
    const tr = r.touch || (r.kind === 'touch' ? r : null);
    if (tr) touch = createTouchControls(root.querySelector('.wr-touch-band'), tr);
  }
  const hud = createHud(app, session, party, root);
  app.hud = hud;
  let menu = null, endT = 0, ended = null, saveClock = 0;

  const pan = x => Math.max(-1, Math.min(1, (x - G.camX) / (T.viewWidth / 2)));
  function pause() {
    if (menu || ended) return;
    if (!session.online) session.pause();
    menu = app.openMenu({ onClose: () => { menu = null; if (!session.online && !ended && !app.staleAsked) session.resume(); } });
  }
  root.querySelector('[data-act="pause"]').addEventListener('click', pause);

  // the story scene before an Act II/III boss: the fight holds (G.hold) until it is read. Locally the reader releases it;
  // online the host's device does (server/room.js `release`), guests read along and the scene closes as the boss walks in
  let bscene = null;
  function bossScene(e) {
    if (bscene?.open) return;
    const me = party.find(s => !s.bot && !s.remote), leadHero = me && G.heroes.find(h => h.pid === me.pid);
    const host = !session.online || session.isHost?.();
    bscene = openBossScene(app, { host: stage, sceneId: e.scene, lead: leadHero ? { name: leadHero.name, look: leadHero.look } : null, canSkip: host,
      scheme: me ? hintScheme(me, app.input.last) : 'kb',
      onDone: () => { if (!session.online) releaseHold(session.G); else if (host) session.release?.(); } });
    app.bossScene = bscene;
  }
  app.testBossScene = id => bossScene({ scene: id || ch.bossScene });   // tests + the screen walk

  let heroCount = G.heroes.length;
  app.loop = dt => {
    if (session.closed) { try { app.view.update(G, 1, dt); } catch { /* fine */ } return; }   // the server ended play: online.js takes the screen
    if (session.online && G.heroes.length !== heroCount) {
      // someone walked in mid-chapter (maybe us): rebuild the party so their panel shows and their loot is saved
      heroCount = G.heroes.length; party = onlineParty(session, opts.heroId || app.save.lastHero); app.party = party; hud.rebuild(party);
    }
    const inputs = {};
    const busy = anySheet();
    for (const [pid, r] of Object.entries(readers)) {
      const inp = r.read();
      if (bscene?.open && !busy) {
        // the scene takes the buttons: Attack / Jump read on, Esc / Start skips (the host's choice online)
        if (inp.attack || inp.jump) bscene.next(); else if (inp.pause) bscene.skip();
        inputs[pid] = { mx: 0, mz: 0 }; continue;
      }
      if (inp.pause && !busy) pause();
      inputs[pid] = busy ? { mx: 0, mz: 0 } : inp;
    }
    if (busy && !session.online && !session.paused) session.pause();
    app.lastInputs = inputs;           // game-eye + tests: what each player's devices said this frame
    if (!ready || shownFrames < 2) {
      // still building: the view draws the new street under the cover for two frames (camera placed, shaders warm)
      // before it lifts; online the room goes on regardless (its session keeps its own clock)
      if (ready) { try { app.view.update(G, 1, dt); } catch (e) { console.error(e); } if (++shownFrames >= 2) { cover.classList.add('wr-cover-off'); setTimeout(() => { cover.hidden = true; }, 400); } }
      if (!session.online) { hud.update(0); return; }
    }
    const { events, alpha } = session.tick(dt * (app.speed || 1), inputs);   // app.speed: tests run the clock faster
    try { app.view.update(G, alpha, dt); if (events.length) app.view.handle(events); } catch (e) { console.error(e); }
    if (events.length) {
      app.recent = (app.recent || []).concat(events.map(e => ({ ...e, item: undefined, at: G.t }))).slice(-300);   // for game-eye + tests
      soundEvents(G, events, pan);
      const notes = applyEvents(app.save, data, heroOfPid, events, { salvage: it => sellPrice(data.items, it) });
      for (const e of events) if (e.type === 'loot' && heroOfPid(e.pid)) (found[e.pid] ||= []).push(e.item);
      hud.handle(events); for (const nt of notes) hud.note(nt);
      for (const e of events) {
        if (e.type === 'bossScene') bossScene(e);
        else if ((e.type === 'boss' || e.type === 'fight') && bscene?.open && session.online && !session.isHost?.()) bscene.close();   // the host let the boss in
      }
      for (const e of events) {
        // online: online.js shows the closing scene / results / the host's retry and writes the story progress itself
        if (e.type === 'chapterClear' && !ended && !session.online) { ended = 'won'; endT = performance.now() + 2200; }
        if (e.type === 'chapterLost' && !ended && !session.online) { ended = 'lost'; endT = performance.now() + 1600; start.lostAt = e.section; }
      }
    }
    hud.update(dt);
    if (touch) touch.sync(G, G.heroes.find(h => h.pid === touchSlot.pid));
    if (!session.paused) for (const s of party) { const h = heroOfPid(s.pid); if (h) h.playTime += dt; }
    saveClock += dt; if (saveClock > 10) { saveClock = 0; app.saveNow(); }
    if (ended && ended !== 'done' && performance.now() >= endT) {   // real time: a slow frame rate never stretches the pause
    const how = ended; ended = 'done'; finish(how); }
  };

  function finish(how) {
    app.loop = () => { try { app.view.update(G, 1, 1 / 60); } catch { /* fine */ } };
    if (how === 'won') {
      const roads = {};          // pid → { finale, was } : an ending found, and the road a hero was put on (co-op)
      for (const s of party) {
        const h = heroOfPid(s.pid); if (!h) continue;
        const was = { ...(h.story?.choices || {}) };
        roads[s.pid] = { ...chapterCleared(data, h, ch.id, G.stats.time), was, now: { ...h.story.choices } };
      }
      app.saveNow();
      const result = {
        chapter: ch.id, chIndex, time: G.stats.time, kills: G.stats.kills, online: !!session.online,
        rows: party.map(s => {
          const h = s.bot || app.hero(s.heroId), e = G.heroes.find(x => x.pid === s.pid);
          return { pid: s.pid, bot: !!s.bot, heroId: s.heroId, name: h.name, cls: h.cls, color: s.color, damage: G.stats.damage[s.pid] || 0, kills: e?.kills || 0,
            xp: e?.xpGained || 0, gold: e?.gold || 0, from: start.levels[s.pid], to: s.bot ? e?.level : h.level, items: found[s.pid] || [], lives: e?.lives ?? 0, look: s.bot && !s.remote ? app.heroLook(s.bot) : null, best: start.best[s.pid] || null,
            finale: roads[s.pid]?.finale || null, roadChanged: !!roads[s.pid] && roads[s.pid].was.act1 !== roads[s.pid].now.act1 && !!roads[s.pid].was.act1 };
        }),
      };
      app.go('results', { result, leadId: opts.leadId || party.find(s => !s.bot)?.heroId, party });
      return;
    }
    app.saveNow();
    lost();
  }
  function lost() {
    const sec = start.lostAt ?? G.secI;
    let picked = false;
    const sh = openSheet({ title: 'The road beat you this time', cls: 'wr-lost', closeLabel: 'Back to the map', body: `
      <p class="wr-lost-lead">Everyone is out of lives. Whatever you found and every level you gained are kept.</p>
      <div class="wr-lost-acts">
        <button type="button" class="wr-btn wr-big wr-primary" data-act="retry">${icon('swap')}<span><b>Try the last fight again</b><small>Fight ${sec + 1} of ${ch.sections.length}, full lives</small></span></button>
        <button type="button" class="wr-btn wr-big" data-act="map">${icon('map')}<span><b>Chapter map</b><small>Change your gear, then come back</small></span></button>
      </div>`,
      onClose: () => { if (!picked && app.screen === 'play') app.go('map', { heroId: opts.leadId || party.find(s => !s.bot)?.heroId }); } });
    sh.body.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      picked = true;
      if (b.dataset.act === 'retry') app.go('play', { ...opts, session: null, section: sec, party });
      else app.go('map', { heroId: opts.leadId || party.find(s => !s.bot)?.heroId });
    });
  }
  app.leaveChapter = () => { session.leave(); app.saveNow(); if (session.online) { app.go('title'); return; } app.go('map', { heroId: opts.leadId || party.find(s => !s.bot)?.heroId }); };

  return () => {
    ro.disconnect(); hud.destroy(); touch?.destroy();
    for (const r of Object.values(readers)) r.release();
    try { session.leave(); } catch { /* fine */ }
    bscene?.close(); app.bossScene = null; app.testBossScene = null;
    app.session = null; app.leaveChapter = null; app.hud = null;
    app.saveNow();
    app.audio.ambience(null);
  };
}
