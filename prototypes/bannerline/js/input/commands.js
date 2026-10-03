// Seat controller: one local player's DeviceFrame -> sim commands (docs/interfaces.md §3) plus
// view-only intents (camera pan/zoom/centre, panels). One per local seat; split screen = two.
//
// Commands built during a frame are queued and handed to the clock, which puts them into the next
// sim.step() (offline input delay 1 tick). UI buttons call `issue(cmd)` so mouse clicks on the HUD
// and key presses go through the same queue. A seat only ever issues commands for its own player.
//
// Keyboard + mouse: right-click move/attack, A attack-move, S stop, Q W E D R cast at the cursor,
//   Ctrl+key learn, 1-6 use an item, B Barracks, O Outfitter, U Drill Yard, P Sanctum, F next field,
//   Space back to the hero, Tab scoreboard, Esc pause.
// Gamepad (PLAN §9.1): left stick moves (moveDir, 16 dirs x 3 speeds, sent on change), right stick
//   aims (centred = auto-target the nearest enemy), A attacks the nearest enemy (or opens the building
//   you stand at), X Y B RB RT cast, LT + skill learns, d-pad down Barracks / up Drill Yard /
//   left-right use items, View Outfitter, LB Sanctum, Menu pause, R3 next field, L3 hero.
//
// `capture`: a panel owns the menu keys this frame. For a pad that means everything but the stick's
// movement and the building / pause buttons; for the keyboard it means the arrows, Esc and the
// skill letters (the Barracks uses Q W E R / A S D F / Z X C V as its hire grid).

const EDGE = 14;                     // edge-pan margin, px
const SKILL_SLOTS = { skillQ: 'Q', skillW: 'W', skillE: 'E', skillD: 'D', skillR: 'R' };
const BUILDINGS = { barracks: 'barracks', outfitter: 'shop', drillyard: 'drillyard', sanctum: 'sanctum' };
const ITEMS = ['item1', 'item2', 'item3', 'item4', 'item5', 'item6'];
const PAD_AUTO_RANGE = 16;           // auto-target radius for a pad player, metres

export function createSeat({ player, device = 'kbm', viewport, camera, actors, getState, getData = () => null, onUi = () => {} }) {
  const queue = [];
  let targeting = null;              // null | 'amove'
  let hover = null;                  // actor under the cursor
  let ground = null;                 // ground point under the cursor / pad aim point
  let lastStick = { dir: -1, speed: 0 };
  let disconnectedSent = false;
  let stickFrozen = false;           // a power is being aimed with the left stick

  function issue(cmd) { queue.push({ ...cmd, p: player }); }

  function heroEnt(state) {
    const pl = state.players[player];
    return pl ? state.ents.find((e) => e.id === pl.heroEnt) : null;
  }

  function nearestEnemy(state, hero, range) {
    if (!hero) return null;
    let best = null, bd = range * range;
    for (const e of state.ents) {
      if (e.alive === false || e.field !== hero.field || e.team === hero.team) continue;
      const d = (e.x - hero.x) ** 2 + (e.z - hero.z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function skillRange(slot, state) {
    const data = getData();
    const me = state.players[player];
    const id = me?.skills?.find((s) => s.slot === slot)?.id;
    const sk = id && data?.heroes?.skills?.[id];
    if (!sk) return 6;
    return sk.range || sk.reach || (sk.shape === 'ground' ? 8 : sk.radius || 6);
  }

  function stopStick() {
    if (lastStick.speed) { issue({ type: 'moveDir', dir: 0, speed: 0 }); lastStick = { dir: -1, speed: 0 }; }
  }

  function updatePad(frame, dt, state, me, out, capture) {
    const hero = heroEnt(state);
    // Movement: quantise to 16 dirs x 3 speeds, send only on change. Frozen while aiming a power.
    if (stickFrozen) stopStick();
    else {
      const { x, y } = frame.stickL;
      const m = Math.hypot(x, y);
      const speed = m < 0.05 ? 0 : m < 0.45 ? 1 : m < 0.8 ? 2 : 3;
      // Stick +y is screen-down = world +z, so the world direction is (x, y): d = atan2(x, y).
      const dir = speed ? Math.round((Math.atan2(x, y) / (Math.PI * 2)) * 16 + 16) % 16 : 0;
      if ((speed && dir !== lastStick.dir) || speed !== lastStick.speed) {
        issue({ type: 'moveDir', dir, speed });
        lastStick = { dir, speed };
      }
    }
    // Aim: right stick direction, or the nearest enemy when centred.
    const r = frame.stickR;
    const aimMag = Math.hypot(r.x, r.y);
    let aimTarget = null;
    if (hero) {
      if (aimMag > 0.3) ground = { x: hero.x + (r.x / aimMag) * 7, z: hero.z + (r.y / aimMag) * 7, dir: { x: r.x / aimMag, z: r.y / aimMag } };
      else {
        aimTarget = nearestEnemy(state, hero, PAD_AUTO_RANGE);
        ground = aimTarget ? { x: aimTarget.x, z: aimTarget.z } : null;
      }
    }
    for (const [action, kind] of Object.entries(BUILDINGS)) if (frame.pressed.has(action)) onUi({ type: 'building', kind });
    if (frame.pressed.has('pause')) onUi({ type: 'pause' });
    if (frame.pressed.has('nextField')) onUi({ type: 'nextField' });
    if (capture) return;

    if (frame.pressed.has('attack') && hero) {
      const t = nearestEnemy(state, hero, PAD_AUTO_RANGE);
      if (t) issue({ type: 'attack', target: t.id });
      else onUi({ type: 'interact' });             // A by a building opens it
    }
    const learn = frame.held.has('learnMod');
    for (const [action, slot] of Object.entries(SKILL_SLOTS)) {
      if (!frame.pressed.has(action)) continue;
      if (learn) { issue({ type: 'learn', slot }); continue; }
      const cmd = { type: 'cast', slot };
      if (aimMag > 0.3 && hero) {
        const rng = skillRange(slot, state);
        cmd.x = hero.x + ground.dir.x * rng; cmd.z = hero.z + ground.dir.z * rng;
      } else if (aimTarget) { cmd.x = aimTarget.x; cmd.z = aimTarget.z; cmd.target = aimTarget.id; }
      issue(cmd);
    }
    if (frame.pressed.has('useFirst') || frame.pressed.has('useSecond')) onUi({ type: 'useNth', n: frame.pressed.has('useFirst') ? 0 : 1 });
  }

  function updateKbm(frame, dt, state, me, out, inside, capture) {
    const hero = heroEnt(state);
    const enemyUnder = hover && hover.ent.team !== me.team ? hover : null;
    if (frame.pressed.has('leave') && targeting) { targeting = null; frame.pressed.delete('pause'); }

    if (frame.pressed.has('select') && inside && !(ground && onUi({ type: 'clickGround', x: ground.x, z: ground.z }) === true)) {
      if (targeting === 'amove' && ground) {
        if (enemyUnder) issue({ type: 'attack', target: enemyUnder.id });
        else issue({ type: 'amove', x: ground.x, z: ground.z });
        onUi({ type: 'marker', x: ground.x, z: ground.z, kind: 'amove' });
        targeting = null;
      } else {
        const id = hover ? hover.id : (hero ? hero.id : -1);
        actors.select(id);
        onUi({ type: 'select', id });
      }
    }
    if (frame.pressed.has('move') && ground && onUi({ type: 'rightClick', x: ground.x, z: ground.z }) !== true) {
      targeting = null;
      if (enemyUnder) { issue({ type: 'attack', target: enemyUnder.id }); onUi({ type: 'marker', x: enemyUnder.x, z: enemyUnder.z, kind: 'attack' }); }
      else { issue({ type: 'move', x: ground.x, z: ground.z }); onUi({ type: 'marker', x: ground.x, z: ground.z, kind: 'move' }); }
    }
    for (const [action, kind] of Object.entries(BUILDINGS)) if (frame.pressed.has(action)) onUi({ type: 'building', kind });
    if (frame.pressed.has('scoreboard')) onUi({ type: 'scoreboard' });
    if (frame.pressed.has('pause') && !capture) onUi({ type: 'pause' });
    if (capture) return;            // the open panel owns the letter keys and the arrows

    if (frame.pressed.has('attackMove')) targeting = 'amove';
    if (frame.pressed.has('stop')) { issue({ type: 'stop' }); targeting = null; }
    // Skills: quick-cast at the cursor (or the hovered enemy). Ctrl+key learns a rank.
    const learn = frame.held.has('learnMod');
    for (const [action, slot] of Object.entries(SKILL_SLOTS)) {
      if (!frame.pressed.has(action)) continue;
      if (learn) { issue({ type: 'learn', slot }); continue; }
      const aim = enemyUnder ? { x: enemyUnder.x, z: enemyUnder.z } : ground;
      const cmd = { type: 'cast', slot };
      if (aim) { cmd.x = aim.x; cmd.z = aim.z; }
      if (enemyUnder) cmd.target = enemyUnder.id;
      issue(cmd);
    }
    ITEMS.forEach((action, i) => { if (frame.pressed.has(action)) issue({ type: 'use', slot: i }); });
    if (frame.pressed.has('nextField')) onUi({ type: 'nextField' });
  }

  return {
    player, viewport, device,
    get targeting() { return targeting; },
    get hover() { return hover; },
    get ground() { return ground; },
    get isPad() { return device !== 'kbm'; },
    issue,
    /** Take everything queued for the next tick. */
    take() { return queue.splice(0, queue.length); },
    cancelTargeting() { targeting = null; },
    beginTargeting(kind) { targeting = kind; },
    /** Freeze the left stick's movement (a power is being aimed with it). */
    set stickFrozen(v) { stickFrozen = !!v; },
    get stickFrozen() { return stickFrozen; },

    /**
     * Per-frame. Returns view intents { pan:{x,y}, drag, zoom, centre }.
     * The mouse acts only inside this seat's viewport (PLAN §10).
     */
    update(frame, dt, { capture = false, connected = true } = {}) {
      const out = { pan: { x: 0, y: 0 }, drag: null, zoom: 0, centre: false };
      const state = getState();
      const me = state?.players?.[player];
      // A pad that disconnects mid-match sends one idle command so the hero stops walking.
      if (!connected || !frame) {
        if (!disconnectedSent) stopStick();
        disconnectedSent = true;
        return out;
      }
      disconnectedSent = false;
      if (frame.pressed.has('centre') && !capture) out.centre = true;

      if (frame.device === 'kbm') {
        const rect = viewport.rect;
        const p = frame.pointer;
        const lx = p.x - rect.x, ly = p.y - rect.y;
        const inside = p.inside && lx >= 0 && ly >= 0 && lx < rect.w && ly < rect.h;
        ground = inside ? camera.groundAt(lx, ly, rect) : null;
        hover = ground ? actors.pick(ground.x, ground.z, 1.4) : null;
        actors.hover(hover ? hover.id : -1);
        if (inside && document.hasFocus?.() !== false) {
          if (lx < EDGE) out.pan.x = -1; else if (lx > rect.w - EDGE) out.pan.x = 1;
          if (ly < EDGE) out.pan.y = 1; else if (ly > rect.h - EDGE) out.pan.y = -1;
        }
        if (!capture) {
          if (frame.held.has('panLeft')) out.pan.x = -1;
          if (frame.held.has('panRight')) out.pan.x = 1;
          if (frame.held.has('panUp')) out.pan.y = 1;
          if (frame.held.has('panDown')) out.pan.y = -1;
        }
        if (frame.held.has('panDrag')) out.drag = frame.drag;
        if (inside && frame.pressed.has('zoomIn')) out.zoom -= 1;
        if (inside && frame.pressed.has('zoomOut')) out.zoom += 1;
        if (!me || state.result) return out;
        updateKbm(frame, dt, state, me, out, inside, capture);
      } else {
        if (!me || state.result) return out;
        updatePad(frame, dt, state, me, out, capture);
      }
      return out;
    },
  };
}
