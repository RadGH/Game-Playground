// The play-test-1 interface in one place (stream D-UI), so main.js only has to create it, wire it and tick it:
//   tooltips (P5), the atlas + world map (P3) + minimap (P13) + quest/event markers (P27), the Journal and the HUD
//   quest tracker (P17), the Party menu with friends/guild/mail/Group Finder tabs (P18), and the Skills / Perk
//   windows (P6, js/client/ui/talents.js — loaded when present).
//
//   const ui = createUiSuite({ net, hud, me, room, actors, objects, worldUi, social, chat, panels: { friends, guild, mail, callboard } });
//   Object.assign(PANELS, ui.panels);  ui.wire(net);  ui.tick(dt) each frame in the world.
// window.tvui = test hooks (map state, hover cards, minimap arrows, journal, fog).

import { installGameTips } from './tips.js';
import { createAtlas } from './atlas.js';
import { createWorldMap } from './worldmap.js';
import { createMinimap } from './minimap.js';
import { createJournal } from './journal.js';
import { createPartyHub } from './party-hub.js';

const store = {
  get(k, d = null) { try { const v = localStorage.getItem('tv.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tv.' + k, JSON.stringify(v)); } catch { /* private window */ } },
};

export function createUiSuite({ net, hud, me, room, actors, objects, worldUi, social, chat, panels = {}, inCombat }) {
  installGameTips();
  const atlas = createAtlas({ net, me, room, actors, objects, worldUi });
  const worldMap = createWorldMap({ atlas, net, me, hud, worldUi, inCombat });
  const minimap = createMinimap({ atlas, me, onOpenMap: () => worldMap.panel.toggle(), store });
  minimap.show(false);
  const journal = createJournal({ atlas, net, me, hud, worldMap });
  const hub = createPartyHub({ panels, social, net, hud, chat });

  // P6 (talents + perk forest): its own module; until it is there the keys say so instead of doing nothing
  let talents = null;
  const pending = { toggle: () => hud.toast('Skills and talents are being prepared.', 'info'), open() { this.toggle(); }, close() {}, isOpen: false };
  import('./talents.js').then(m => {
    if (!m.createTalentsUi) return;
    talents = m.createTalentsUi({ net, hud, me });
    if (wired) talents.wire?.(wired);
  }).catch(e => console.warn('[ui] talents window not loaded:', e.message));
  let wired = null;

  const PANELS = {
    party: { toggle: () => hub.toggle('party') },
    map: worldMap.panel,
    journal: journal.panel,
    skills: { toggle: f => (talents?.skills || pending).toggle(f) },
    perks: { toggle: f => (talents?.perks || pending).toggle(f) },
  };

  let inWorld = false;
  const taps = new Map();
  const api = {
    atlas, worldMap, minimap, journal, hub, panels: PANELS,
    get talents() { return talents; },
    wire(n0) {
      // a tap on the connection: the same handlers, also callable by the test hooks (tvui.fake)
      const n = Object.create(n0);
      n.on = (ev, fn) => { (taps.get(ev) || taps.set(ev, []).get(ev)).push(fn); return n0.on(ev, fn); };
      wired = n0;
      atlas.wire(n); journal.wire(n); hub.wire(n);
      talents?.wire?.(n0);
      n.on('joined', () => { minimap.show(true); inWorld = true; });
    },
    tick(dt) {
      if (!inWorld) return;
      atlas.tick(dt);
      minimap.update();
      journal.drawTracker();
    },
  };
  // test hooks (Playwright specs + the console)
  window.tvui = {
    map: () => worldMap.state, mapOpen: (on = true) => { worldMap.panel.toggle(on); return worldMap.panel.isOpen; },
    preset: k => { worldMap.fitPreset(k); worldMap.draw(); return worldMap.state; },
    showAt: (x, z, s) => { worldMap.showAt(x, z, s); worldMap.draw(); return worldMap.state; },
    hoverAt: (x, z) => worldMap.hoverAt(x, z), card: (id, x, z) => worldMap.cardText(id, x, z),
    minimap: () => minimap.state, miniRotate: on => minimap.setRotate(on), miniZoom: z => minimap.setZoom(z),
    atlas: () => ({ loaded: !!atlas.model, world: !!atlas.world, fogCells: atlas.fog?.count() || 0, quests: atlas.quests.map(q => ({ id: q.id, name: q.name, goal: q.goal, loc: q.loc, tracked: q.id === atlas.tracked })), events: atlas.events, pins: atlas.pins.length, dungeon: atlas.dungeon ? { id: atlas.dungeon.id, floors: atlas.dungeon.floors.length } : null }),
    reveal: (x, z, r) => atlas.reveal(x, z, r), track: id => atlas.setTracked(id),
    // play a server message into the interface only (screenshots): tvui.fake('quests', { active: [...], done: [] })
    fake: (ev, msg) => { for (const fn of taps.get(ev) || []) fn(msg); return (taps.get(ev) || []).length; },
    journal: () => journal.state, hub: () => hub.current, openHub: id => hub.show(id),
    talents: () => talents,
    /** A client-only dungeon (the 3D demo + its map): tvui.demoDungeon('crypt_spiral'); null goes back outside. */
    async demoDungeon(family = 'crypt_spiral', seed = 7) {
      await window.tv?.demoDungeon?.(family, seed);
      if (!family) { atlas.setDungeon(null); return null; }
      const [{ planDungeon }, { describeDungeon }] = await Promise.all([import('../../rules/dungeon-tiers.js'), import('../../sim/dungeon.js')]);
      const plan = planDungeon(seed, { family, floors: 2, level: 3 });
      atlas.setDungeon(describeDungeon(plan), 'demo:' + family + ':' + seed);
      // explored: the first floor's rooms (a player who has walked the first floor)
      const d = atlas.dungeon, f = plan.floors[0];
      d.fog.reveal(f.origin.x + f.w * plan.cell / 2, f.origin.z + f.h * plan.cell / 2, Math.hypot(f.w, f.h) * plan.cell / 2 + 4);
      return { floors: d.floors.length };
    },
  };
  return api;
}
