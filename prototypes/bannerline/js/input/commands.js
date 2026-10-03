// Seat controller: one local player's DeviceFrame -> sim commands (docs/interfaces.md §3) plus
// view-only intents (camera pan/zoom/centre, panels). One per local seat; split screen = two.
//
// Commands built during a frame are queued and handed to the clock, which puts them into the next
// sim.step() (offline input delay 1 tick). UI buttons call `issue(cmd)` so mouse clicks on the HUD
// and key presses go through the same queue.

const EDGE = 14;                     // edge-pan margin, px
const SKILL_SLOTS = { skillQ: 'Q', skillW: 'W', skillE: 'E', skillD: 'D', skillR: 'R' };
const SENDS = ['send1', 'send2', 'send3', 'send4'];

export function createSeat({ player, viewport, camera, actors, getState, onUi = () => {} }) {
  const queue = [];
  let targeting = null;              // null | 'amove'
  let hover = null;                  // actor under the cursor
  let ground = null;                 // ground point under the cursor
  let lastStick = { dir: -1, speed: 0 };

  function issue(cmd) { queue.push({ p: player, ...cmd }); }

  function heroEnt(state) {
    const pl = state.players[player];
    return pl ? state.ents.find((e) => e.id === pl.heroEnt) : null;
  }

  return {
    player, viewport,
    get targeting() { return targeting; },
    get hover() { return hover; },
    get ground() { return ground; },
    issue,
    /** Take everything queued for the next tick. */
    take() { return queue.splice(0, queue.length); },
    cancelTargeting() { targeting = null; },
    beginTargeting(kind) { targeting = kind; },

    /**
     * Per-frame. Returns view intents { pan:{x,y}, drag, zoom, centre }.
     * The mouse acts only inside this seat's viewport (PLAN §10).
     */
    update(frame, dt) {
      const out = { pan: { x: 0, y: 0 }, drag: null, zoom: 0, centre: false };
      if (!frame) return out;
      const state = getState();
      const me = state?.players?.[player];
      const rect = viewport.rect;
      const p = frame.pointer;
      const lx = p.x - rect.x, ly = p.y - rect.y;
      const inside = p.inside && lx >= 0 && ly >= 0 && lx < rect.w && ly < rect.h;

      if (frame.device === 'kbm') {
        ground = inside ? camera.groundAt(lx, ly, rect) : null;
        hover = ground ? actors.pick(ground.x, ground.z, 1.4) : null;
        actors.hover(hover ? hover.id : -1);
        // Camera: edge pan, arrows, middle drag, wheel zoom, Space centre.
        if (inside && document.hasFocus?.() !== false) {
          if (lx < EDGE) out.pan.x = -1; else if (lx > rect.w - EDGE) out.pan.x = 1;
          if (ly < EDGE) out.pan.y = 1; else if (ly > rect.h - EDGE) out.pan.y = -1;
        }
        if (frame.held.has('panLeft')) out.pan.x = -1;
        if (frame.held.has('panRight')) out.pan.x = 1;
        if (frame.held.has('panUp')) out.pan.y = 1;
        if (frame.held.has('panDown')) out.pan.y = -1;
        if (frame.held.has('panDrag')) out.drag = frame.drag;
        if (frame.pressed.has('zoomIn')) out.zoom -= 1;
        if (frame.pressed.has('zoomOut')) out.zoom += 1;
      }
      if (frame.pressed.has('centre')) out.centre = true;
      if (!me || state.result) return out;

      const hero = heroEnt(state);
      const enemyUnder = hover && hover.ent.team !== me.team ? hover : null;

      // Escape cancels targeting before it means "pause".
      if (frame.pressed.has('leave') && targeting) { targeting = null; frame.pressed.delete('pause'); }
      if (frame.pressed.has('attackMove')) targeting = 'amove';
      if (frame.pressed.has('stop')) { issue({ type: 'stop' }); targeting = null; }

      if (frame.pressed.has('select') && inside) {
        if (targeting === 'amove' && ground) {
          if (enemyUnder) issue({ type: 'attack', target: enemyUnder.id });
          else issue({ type: 'amove', x: ground.x, z: ground.z });
          onUi({ type: 'marker', x: ground.x, z: ground.z, kind: 'amove' });
          targeting = null;
        } else {
          actors.select(hover ? hover.id : (hero ? hero.id : -1));
          onUi({ type: 'select', id: hover ? hover.id : (hero ? hero.id : -1) });
        }
      }
      if (frame.pressed.has('move') && ground) {
        targeting = null;
        if (enemyUnder) { issue({ type: 'attack', target: enemyUnder.id }); onUi({ type: 'marker', x: enemyUnder.x, z: enemyUnder.z, kind: 'attack' }); }
        else { issue({ type: 'move', x: ground.x, z: ground.z }); onUi({ type: 'marker', x: ground.x, z: ground.z, kind: 'move' }); }
      }

      // Skills: quick-cast at the cursor (or the hovered enemy). Ctrl+key learns a rank.
      const ctrl = frame.device === 'kbm' && (frame.held.has('learnMod') || isCtrl());
      for (const [action, slot] of Object.entries(SKILL_SLOTS)) {
        if (!frame.pressed.has(action)) continue;
        if (ctrl) { issue({ type: 'learn', slot }); continue; }
        const aim = enemyUnder ? { x: enemyUnder.x, z: enemyUnder.z } : ground;
        const cmd = { type: 'cast', slot };
        if (aim) { cmd.x = aim.x; cmd.z = aim.z; }
        if (enemyUnder) cmd.target = enemyUnder.id;
        issue(cmd);
      }

      // Deck sends: Z X C V; Shift + key toggles auto-send for that slot.
      const shift = frame.held.has('autoMod') || frame.held.has('deckMod');
      SENDS.forEach((action, i) => {
        if (!frame.pressed.has(action)) return;
        if (shift) issue({ type: 'auto', index: i, on: !me.auto[i] });
        else issue({ type: 'send', unit: me.deck[i] });
      });
      if (frame.pressed.has('belt1') || frame.pressed.has('belt2')) issue({ type: 'drink' });
      if (frame.pressed.has('muster')) issue({ type: 'muster' });
      if (frame.pressed.has('upgrade')) issue({ type: 'upgrade' });
      for (const a of ['shop', 'character', 'scoreboard', 'pause']) if (frame.pressed.has(a)) onUi({ type: a });

      // Gamepad stick movement (M2): quantise to 16 dirs x 3 speeds, send only on change.
      if (frame.stickL) {
        const { x, y } = frame.stickL;
        const m = Math.hypot(x, y);
        const speed = m < 0.25 ? 0 : m < 0.55 ? 1 : m < 0.85 ? 2 : 3;
        // Stick +y is screen-down = world +z, so the world direction is (x, y): d = atan2(x, y).
        const dir = speed ? Math.round((Math.atan2(x, y) / (Math.PI * 2)) * 16 + 16) % 16 : 0;
        if ((speed && dir !== lastStick.dir) || speed !== lastStick.speed) {
          issue({ type: 'moveDir', dir, speed });
          lastStick = { dir, speed };
        }
      }
      return out;
    },
  };
}

// Ctrl is not in the bindings table (it is a modifier for learn); read it straight off the event state.
let ctrlDown = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => { if (e.key === 'Control') ctrlDown = true; });
  window.addEventListener('keyup', (e) => { if (e.key === 'Control') ctrlDown = false; });
  window.addEventListener('blur', () => { ctrlDown = false; });
}
function isCtrl() { return ctrlDown; }
