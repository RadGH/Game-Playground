// STAGED STORY SCENES (owner #110: "The cinematics would be better if the characters were actually on screen moving
// around and interacting with each other"). A story scene is acted out in the chapter's own 3D street: the heroes walk
// in from the left, the scene's cast waits on its marks to the right, everyone faces whoever is talking, the speaker
// steps toward the one they talk to, gestures, and their mouth moves while the line is written out; the camera glides
// to frame the speaker (and the one they face, when the screen is wide enough) above the speech box. Lines can carry
// stage directions (the format is documented at the top of js/ui/story.js); a line without any still plays well.
//
//   const st = createStage(view, { data, scene, chapter, where: 'start' | 'end', heroes: [{ id, name, cls, look, gear }] });
//   await st.ready;                       // bodies built (the scenic establishing shot shows meanwhile)
//   st.line(i)                            // line i starts: directions + defaults
//   st.reveal(n)                          // n letters of the line are on screen (drives the speaker's mouth)
//   st.safe({ top, bottom })              // CSS px of the canvas covered at the top (place label) and bottom (speech box)
//   st.wide()                             // the choice: everyone in shot
//   st.update(dt)                         // every frame (draws the view)
//   st.dispose()                          // the camera goes back to the game, the stage actors leave
import * as THREE from 'three';
import { CHIBI_ANIMS, HERO_HEIGHT } from './actors.js';
import { glowTex } from './kit.js';
import { CHIBI2_CLIP_SECONDS } from '../../../../avatar-3d/js/chibi2-motion.js';

/** Where a scene stands on each street when the scene says nothing: the chapter's start, or its end (the boss's ground). */
const STAGE_AT = {
  village: { start: 11, end: -14 },     // the start: the square by the empty bell-stone plinth; the end: on the mill bridge
  forest: { start: 24, end: -18 }, docks: { start: 30, end: -20 }, abbey: { start: 26, end: -18 },
  spine: { start: 28, end: -20 }, crown: { start: 22, end: -16 },          // crown's end: below the last chain
  // Acts II/III: the end is where the boss stood; a set piece sits just behind it (the Great Bell, the wick, the mill)
  belltower: { start: 20, end: -13 }, lanternvoid: { start: 18, end: -21 }, ashfall: { start: 18, end: -20 }, crown_burning: { start: 22, end: -16 },
};
const WALK = 1.7, ENTER_FROM = 4.8;
const MOODS = new Set(['neutral', 'happy', 'sad', 'angry', 'surprised', 'afraid']);
/** Gestures a Chibi can make on a line (the clip names), and what a creature does instead. */
const CREATURE_ANIM = a => (/attack|slam|smash|point|cheer|roar/.test(a) ? 'attack' : 'talk');
const ease = (cur, want, k) => cur + (want - cur) * k;
/**
 * GIANTS ON STAGE. Speakers too big to walk on: they stand behind the street, facing it. Ossmara is on stage wherever she
 * can be (not on her own back, nor inside the lantern); the Lantern's voice is its giant green-flame ghost only inside the
 * lantern (elsewhere it is the lantern the hero carries); the Undermaw is its body only on the pit floor (elsewhere a
 * voice in the dark).
 */
export const GIANTS = {
  ossmara: { kind: th => (th === 'highlands' ? 'ossmara_mad' : 'ossmara_wrath'), on: th => !['sky', 'lanternvoid'].includes(th) },
  // the Lantern's voice: its ghost inside the glass, the freed wraith on the break road; elsewhere the lantern on your belt
  voice: { kind: th => (th === 'lanternvoid' ? 'aldric_eternal' : 'lantern_wraith'), on: th => ['lanternvoid', 'crown_burning', 'abbey_wraith'].includes(th) },
  undermaw: { kind: () => 'undermaw', on: th => th === 'maw' },
};
/** Story moments a direction's `fx` can play (see the format in js/ui/story.js). */
export const STAGE_FX = ['bell', 'lanternBreak', 'rise', 'roar', 'fire', 'greenfire', 'dawn', 'flash', 'quake', 'heal', 'crown', 'chains', 'calm'];
/** Camera moves a direction's `cam` can ask for, besides a speaker id. */
export const STAGE_CAMS = ['speaker', 'two', 'wide', 'sky', 'deep', 'low', 'pullback', 'orbit'];

export function createStage(view, { data, scene, chapter, where = 'start', heroes = [] }) {
  const ch = chapter || data.chapters.chapters[0];
  const stageDef = typeof scene.stage === 'string' ? { theme: scene.stage } : (scene.stage || {});
  const theme = stageDef.theme || ch.theme;
  const chId = stageDef.theme && stageDef.theme !== ch.theme ? 'stage:' + stageDef.theme : ch.id;
  const len = ch.length || 160;
  const spot = STAGE_AT[theme] || { start: 14, end: -16 };
  const at = typeof stageDef.at === 'number' ? stageDef.at : (where === 'end' ? len + spot.end : spot.start);
  const Z0 = stageDef.z ?? 0.3;
  const G = {
    t: 0, camX: at, phase: 'walk', secI: 0, ch: { ...ch, id: chId }, T: null, cinematic: true,
    heroes: [], foes: [], props: [], shots: [], zones: [], quakeT: 0, over: false, outcome: null, events: [],
  };
  // ---------------------------------------------------------------------------------------- who is on stage
  const heroId = k => (k === 'hero' || /^hero\d$/.test(k) ? k : null);
  const who = new Map();          // stage id ('hero', 'hero2', 'aldric', …) → { e, mark, goal, … }
  const HERO_Z = [0.15, 1.05, -0.65, 1.75], CAST_Z = [0.15, -0.75, 0.95, -1.4];
  heroes.slice(0, 4).forEach((h, i) => {
    const id = i ? 'hero' + (i + 1) : 'hero';
    const mark = { x: at - 1.55 - i * 1.0, z: Z0 + HERO_Z[i] - 0.15 };
    const e = ent('st-' + id, { side: 'hero', cls: h.cls, look: h.look || {}, gear: h.gear || {}, x: mark.x - ENTER_FROM - i * 0.8, z: mark.z, dir: 1 });
    G.heroes.push(e);
    who.set(id, actor(id, e, mark, { goal: { ...mark }, hero: true, name: h.name }));
  });
  let castN = 0;
  function speakerSpec(id) {
    const sp = data.story.speakers?.[id], G0 = GIANTS[id];
    if (G0) { if (!G0.on(theme)) return null; const kind = G0.kind(theme), def = data.enemies.bosses[kind]; return def ? { side: 'foe', kind, height: def.height, giant: true, homeZ: -4.2, turn: Math.PI / 2 } : null; }
    if (!sp || sp.voice) return null;
    if (sp.look) return { side: 'npc', lookDirect: sp.look, height: sp.height || HERO_HEIGHT };
    const foeId = sp.boss || sp.foe || id, def = data.enemies.bosses[foeId] || data.enemies.foes[foeId];
    return def ? { side: 'foe', kind: foeId, height: def.height } : null;
  }
  /** Put a cast member on stage: standing on their mark, or walking in from one side (`pre`: built now, enters later). */
  function addCast(id, { enter = null, pre = false } = {}) {
    if (who.has(id)) {
      const a = who.get(id);
      if (a.offstage && !pre) {                     // their entrance: from the side they were waiting on
        a.offstage = false;
        a.e.x = enter === 'left' ? at - ENTER_FROM : at + ENTER_FROM; a.e.px = a.e.x; a.goal = { ...a.mark };
      }
      return a;
    }
    const spec = speakerSpec(id); if (!spec) return null;
    if (spec.giant) {
      // behind the street, a little right of centre, facing it; submerged first if a line has her rise
      const sunk = scene.lines.some(([s2, , d]) => [].concat(d || []).some(x => (x.who || x.move || s2) === id && x.anim === 'rise'));
      const e = ent('st-' + id, { ...spec, x: at + 4.2, z: -6.4, dir: -1, y: sunk ? -6 : 0 });
      G.foes.push(e);
      return who.set(id, actor(id, e, { x: e.x, z: e.z }, { giant: true })).get(id);
    }
    const j = castN++, mark = { x: at + 1.55 + j * 1.25, z: Z0 + CAST_Z[j % 4] - 0.15 };
    const from = enter === 'left' ? at - ENTER_FROM : enter ? at + ENTER_FROM + j * 0.6 : null;
    const e = ent('st-' + id, { ...spec, x: pre ? at + ENTER_FROM + 2 : (from ?? mark.x), z: mark.z, dir: -1 });
    G.foes.push(e);
    return who.set(id, actor(id, e, mark, { goal: !pre && from != null ? { ...mark } : null, offstage: pre })).get(id);
  }
  function ent(eid, o) {
    return { id: eid, state: 'gone', anim: 'idle', y: 0, hp: 1, max: 1, invT: 0, freezeT: 0, burnT: 0, team: 0, turn: 0.62, ...o, px: o.x, py: 0, pz: o.z };
  }
  function actor(id, e, mark, o = {}) { return { id, e, mark, goal: null, then: [], delay: 0, faceTo: null, loop: null, stepped: false, ...o }; }
  for (const id of scene.cast || []) addCast(id);
  // anyone who speaks later (or is directed) but is not in the cast is built now, off stage, and walks in on their
  // first line (see line()) — so nobody waits on a body build mid-scene
  for (const [spk, , dir] of scene.lines) for (const id of [spk, ...[].concat(dir || []).map(d => d.who || d.move)]) if (id && !heroId(id) && !who.has(id) && !GIANTS[id] && speakerSpec(id)) addCast(id, { pre: true });
  // a giant stands behind the street from the start when the scene casts it or a direction names it; otherwise it is a
  // voice (the sky shot, the dark below, the lantern on your belt)
  for (const [, , dir] of scene.lines) for (const d of [].concat(dir || [])) { const id = d.who || d.move; if (GIANTS[id] && !who.has(id)) addCast(id); }

  // ---------------------------------------------------------------------------------------- the camera
  const shot = { pos: new THREE.Vector3(at, 2.2, Z0 + 11), target: new THREE.Vector3(at, 1.2, Z0), want: null, fov: 32, glide: 2.2 };
  const safeArea = { top: 56, bottom: 200 };
  let pending = false, introUntil = 0;
  let focus = null, readyFlag = false, shown = 0, lineText = '', lineI = -1, mouthT = 0;

  /** Frame these actors (bodies from `y0k`×height up) into the clear band between the place label and the speech box. */
  function frame(list, { tight = true, bias = null, pad = 0.45 } = {}) {
    const { w, h } = view.size || { w: 16, h: 9 };
    const A = Math.max(0.3, (w || 16) / (h || 9)), vf = THREE.MathUtils.degToRad(shot.fov), tv = Math.tan(vf / 2);
    const top = Math.min(0.3, safeArea.top / (h || 1)), bot = 1 - Math.min(0.6, safeArea.bottom / (h || 1));
    const band = Math.max(0.3, bot - top), fc = (top + bot) / 2;
    let x0 = Infinity, x1 = -Infinity, y1 = 0, zs = 0, n = 0;
    for (const a of list) { if (!a) continue; const p = a.e; x0 = Math.min(x0, p.x - pad); x1 = Math.max(x1, p.x + pad); y1 = Math.max(y1, (p.height || HERO_HEIGHT) + 0.18); zs += p.z; n++; }
    if (!n) return;
    const y0 = tight === 'mid' ? y1 * 0.1 : tight ? Math.max(0, y1 * 0.36) : -0.05;
    // leaning toward the speaker, but never so far that the one they talk to leaves the frame
    const cx = bias != null ? ease((x0 + x1) / 2, bias, 0.2) : (x0 + x1) / 2, span = 2 * Math.max(cx - x0, x1 - cx);
    const Dv = (y1 - y0) / (band * 2 * tv), Dh = span / (2 * tv * A * 0.86);
    const D = THREE.MathUtils.clamp(Math.max(Dv, Dh), tight ? 3.4 : 5, 22);
    const hh = D * tv, pitch = 0.07, yc = (y0 + y1) / 2;
    const camY = yc + (fc - 0.5) * 2 * hh + D * Math.tan(pitch);
    const z = zs / n;
    shot.want = { pos: [cx - 0.35, camY, z + D], target: [cx, camY - D * Math.tan(pitch), z] };
  }
  function wideShot() { frame([...who.values()].filter(a => !a.left && !a.offstage && !a.giant).map(a => (a.goal ? { ...a, e: { ...a.e, x: a.goal.x, z: a.goal.z } } : a)), { tight: false }); }
  /** The Undermaw speaking from below: low, looking down past everyone into the dark behind the street. */
  function deepShot() {
    const xs = [...who.values()].filter(a => !a.giant).map(a => a.e.x), cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : at;
    shot.want = { pos: [cx - 0.5, 0.55, Z0 + 7.5], target: [cx + 0.5, -2.5, Z0 - 26] };
  }
  function skyShot() {
    // the wyrm speaks: low and wide, looking up past everyone to its spine on the horizon
    const xs = [...who.values()].map(a => a.e.x), cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : at;
    shot.want = { pos: [cx - 1, 0.9, Z0 + 9.5], target: [cx + 2, 4.2, Z0 - 40] };
  }

  // ---------------------------------------------------------------------------------------- directions
  function resolve(k) { return who.get(k) || null; }
  function towardX(a, b, d) { return a.e.x + Math.sign(b.e.x - a.e.x || 1) * d; }
  function placeFor(a, to, z) {
    if (typeof to === 'number') return { x: at + to, z: z != null ? Z0 + z : a.e.z };
    if (to === 'mark') return { ...a.mark };
    if (to === 'off') return { x: a.e.x < at ? at - ENTER_FROM - 2 : at + ENTER_FROM + 2, z: a.e.z, off: true };
    const b = resolve(to);
    if (b && b !== a) { const side = Math.sign(a.e.x - b.e.x) || (a.hero ? -1 : 1); return { x: b.e.x + side * 1.15, z: b.e.z + 0.15 }; }
    return null;
  }
  /** One direction object (see story.js): who, to, z, anim, loop, face, mood, enter, exit, wait. */
  function direct(d, speakerId) {
    const id = d.who || d.move || speakerId;
    let a = resolve(id);
    if ((!a || a.offstage) && !heroId(id) && !GIANTS[id]) a = addCast(id, { enter: d.enter || 'right' });
    if (!a) return;
    a.delay = d.wait || 0;
    if (d.fx) a.fx = (a.fx || []).concat(d.fx);
    if (a.giant) { if (d.anim) a.then.push(d.anim); if (d.mood && MOODS.has(d.mood)) a.mood = d.mood; return; }
    if (d.enter && a.e.state === 'gone' && !a.entered) { a.e.x = d.enter === 'left' ? at - ENTER_FROM : at + ENTER_FROM; a.goal = { ...a.mark }; }
    const p = d.exit ? placeFor(a, 'off') : d.to != null ? placeFor(a, d.to, d.z) : null;
    if (p) { a.goal = p; a.stepped = true; }
    if (d.face) a.faceTo = d.face;
    if (d.loop) a.loop = d.loop === 'none' ? null : d.loop;
    if (d.anim) a.then.push(d.anim);
    if (d.mood && MOODS.has(d.mood)) a.mood = d.mood;
  }
  /** What a line does with no directions: the speaker steps toward who they talk to and gestures; the rest listen. */
  function gestureFor(text, a) {
    const t = text.trim(), first = t.split(/[\s,.!?]/)[0].toLowerCase();
    if (['no', 'stop', 'never', 'enough', 'not'].includes(first)) return 'headShake';
    if (t.endsWith('?')) return a.hero ? 'shrug' : 'talk';
    if (/!$/.test(t) || /\b(look|there|that's|out)\b/i.test(t)) return 'point';
    return 'talk';
  }
  let lastOther = null, reframe = null;
  function line(i) {
    lineI = i;
    const ln = scene.lines[i]; if (!ln) return;
    if (!readyFlag || G.t < introUntil) { lineText = ln[1]; shown = 0; pending = true; return; }   // acted out once everyone is built and has walked on
    const [spk, text, dir] = ln;
    lineText = text; shown = 0;
    const dirs = dir ? (Array.isArray(dir) ? dir : [dir]) : [];
    // a speaker who is not on stage yet walks in (or is only a voice: the wyrm)
    let sa = resolve(spk);
    if ((!sa || sa.offstage) && !heroId(spk) && !GIANTS[spk] && speakerSpec(spk)) sa = addCast(spk, { enter: dirs.find(d => (d.who || spk) === spk)?.enter || 'right' });
    if (sa && !sa.hero && !sa.giant) lastOther = sa;
    const to = sa ? (sa.hero ? (lastOther || [...who.values()].find(a => !a.hero) || null) : resolve('hero')) : null;
    // everyone looks at the speaker; the speaker at who they talk to
    for (const a of who.values()) { if (a.offstage) continue; a.faceTo = a === sa ? (to ? to.id : null) : (sa ? sa.id : 'camera'); if (a !== sa && a.mood && !dirs.some(d => (d.who || spk) === a.id && d.mood)) a.mood = null; }
    if (sa) {
      sa.mood = null;
      const own = dirs.filter(d => (d.who || d.move || spk) === spk);
      if (!sa.giant && !own.some(d => d.to != null || d.exit)) {
        // step toward the listener (once per turn of speaking); back to the mark when someone else had the floor
        if (to && !sa.stepped) { sa.goal = { x: towardX({ e: sa.mark }, to, 0.4), z: sa.mark.z }; sa.stepped = true; }
        for (const a of who.values()) if (a !== sa && a.stepped && !a.goal && !a.loop) { a.goal = { ...a.mark }; a.stepped = false; }
      }
      if (!own.some(d => d.anim)) sa.then.push(gestureFor(text, sa));
      if (!own.some(d => d.mood)) sa.mood = /!$/.test(text.trim()) ? (sa.hero ? 'surprised' : 'angry') : null;
      // a calm line from a friend gets a nod from the hero
      if (to && !sa.hero && to.hero && i % 3 === 2 && !/[!?]$/.test(text.trim())) { to.then.push('nod'); to.delay = Math.max(to.delay, 1.2); }
    }
    for (const d of dirs) direct(d, spk);
    // the camera
    const camDir = dirs.find(d => d.cam)?.cam || null;
    focus = sa;
    reframe = () => {
      shot.drift = camDir === 'orbit' ? 0.35 : 0;
      if (camDir === 'deep' || (!sa && spk === 'undermaw')) deepShot();
      else if (!sa && spk === 'voice' && resolve('hero')) frame([resolve('hero')], { tight: true });     // the lantern on the hero's belt speaks
      else if (!sa || camDir === 'sky') skyShot();
      else if (camDir === 'pullback') { wideShot(); if (shot.want) { const [px, py, pz] = shot.want.pos, [tx, ty, tz] = shot.want.target; shot.want = { pos: [px, py + 3.5, tz + (pz - tz) * 1.8], target: [tx, ty + 1.2, tz] }; shot.glide = 0.6; } }
      else if (camDir === 'low') { const t2 = sa.goal ? { ...sa, e: { ...sa.e, x: sa.goal.x, z: sa.goal.z } } : sa; frame([t2], { tight: 'mid', pad: 0.9 }); if (shot.want) { shot.want.pos[1] = 0.6; shot.want.target[1] = (sa.e.height || HERO_HEIGHT) * 0.7; } }
      else if (sa.giant) { const narrow = (view.size?.w || 16) / (view.size?.h || 9) < 1.05; frame(narrow || !to ? [sa] : [sa, to], { tight: narrow ? 'mid' : false }); }
      else if (camDir === 'wide') wideShot();
      else if (camDir && camDir !== 'speaker' && camDir !== 'two' && resolve(camDir)) frame([resolve(camDir)], { tight: true });
      else {
        const narrow = (view.size?.w || 16) / (view.size?.h || 9) < 1.05;
        // where they will stand, not where they are mid-step: the shot is set once per line
        const at2 = a => (a?.goal ? { ...a, e: { ...a.e, x: a.goal.x, z: a.goal.z } } : a);
        // a narrow phone: the speaker from the shins up with room either side (the one they talk to at the edge)
        if (narrow && camDir !== 'two') frame([at2(sa)], { tight: 'mid', pad: 1.05 });
        else frame([at2(sa), at2(to)], { tight: true, bias: (sa.goal || sa.e).x });
      }
    };
    if (camDir !== 'pullback') shot.glide = 2.2;
    reframe();
    voiceLine = spk === 'voice' && !sa;
  }

  // ---------------------------------------------------------------------------------------- per frame
  const bodyReady = a => { const ac = view.actors?.get(a.e.id); return !!(ac && ac.body && ac.body.kind !== 'stand'); };
  function faceDir(a) {
    const f = a.faceTo;
    if (f === 'camera') { a.e.turn = Math.PI / 2; return; }
    a.e.turn = 0.62;
    if (f === 'left') { a.e.dir = -1; return; } if (f === 'right') { a.e.dir = 1; return; }
    const b = f ? resolve(f) : null;
    if (b && Math.abs(b.e.x - a.e.x) > 0.05) a.e.dir = Math.sign(b.e.x - a.e.x);
  }
  function play(a, anim) {
    const body = view.actors?.get(a.e.id)?.body;
    const name = body?.kind === 'creature' ? CREATURE_ANIM(anim) : (CHIBI_ANIMS.includes(anim) ? anim : 'talk');
    const dur = Math.min(2.6, CHIBI2_CLIP_SECONDS[name] || 1.2);
    G.events.push({ type: 'move', id: a.e.id, anim: name, dur });
    a.busy = dur;
  }

  // ---------------------------------------------------------------------------------------- giants, the lantern, story fx
  const GIANT_MOVES = { rise: { to: 0, dur: 2.8 }, sleep: { to: -2.8, dur: 7 }, fly: { to: 16, dur: 4.5 } };
  function giantStep(a, dt) {
    const e = a.e;
    if (e.state === 'gone') { if (bodyReady(a)) e.state = 'idle'; else return; }
    e.turn = Math.PI / 2;
    if (a.fx?.length) for (const f of a.fx.splice(0)) storyFx(f, a);
    if (a.delay > 0) { a.delay -= dt; return; }
    if (a.move) {
      const M = a.move; M.t += dt; const k = Math.min(1, M.t / M.dur), s2 = k * k * (3 - 2 * k);
      e.y = M.y0 + (M.to - M.y0) * s2;
      if (M.name === 'fly') { e.z = M.z0 - 18 * s2; e.x = M.x0 + 10 * s2; if (k >= 1) { a.left = true; e.state = 'gone'; } }
      if (M.name === 'rise' && Math.random() < 0.5) view.fx?.sparks(e.x + (Math.random() - 0.5) * 5, 0.2, -3.6, '#d8ecff', 2, { speed: 2, up: 7, size: 0.3, life: 1 });
      if (k >= 1) a.move = null;
      return;
    }
    if (a.busy > 0) { a.busy -= dt; return; }
    if (a.then.length) {
      const n = a.then.shift(), G1 = GIANT_MOVES[n];
      if (G1) { a.move = { name: n, t: 0, dur: G1.dur, y0: e.y, to: G1.to, x0: e.x, z0: e.z }; play(a, n === 'fly' ? 'attack' : 'talk'); if (n !== 'sleep') view.shake?.(0.25); return; }
      if (n === 'roar') { play(a, 'attack'); storyFx('roar', a); return; }
      play(a, n);
    }
  }
  // the lantern on the hold road: hung at the lead hero's belt, its green flame breathing — brighter on its own lines
  let lantern = null, voiceLine = false;
  const usesVoice = scene.lines.some(([s2]) => s2 === 'voice') || (scene.cast || []).includes('voice');
  if (usesVoice && !GIANTS.voice.on(theme) && who.has('hero')) {
    const g = new THREE.Group();
    const iron = new THREE.MeshToonMaterial({ color: '#1e2420' }), glass = new THREE.MeshBasicMaterial({ color: '#5aff7a', transparent: true, opacity: 0.85 });
    const frameM = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), glass); g.add(frameM);
    for (const y of [-0.12, 0.12]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.2), iron); c.position.y = y; g.add(c); }
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.1, 4), iron); top.position.y = 0.18; g.add(top);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#5aff7a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); g.add(halo);
    view.scene.add(g);
    lantern = { g, halo, broken: false, mats: [iron, glass, halo.material], geos: [frameM.geometry, top.geometry] };
  }
  const _hp = new THREE.Vector3();
  function lanternStep(dt) {
    const L = lantern, ac = view.actors?.get('st-hero'), hips = ac?.body?.chibi?.parts?.hips;
    L.g.visible = !L.broken && !!hips && ac.group.visible;
    if (!L.g.visible) return;
    hips.getWorldPosition(_hp);
    const yaw = ac.yaw ?? 0, ox = -0.26, oz = 0.1;      // the hero's left hip, a little forward
    L.g.position.set(_hp.x + Math.cos(yaw) * ox + Math.sin(yaw) * oz, _hp.y - 0.2, _hp.z - Math.sin(yaw) * ox + Math.cos(yaw) * oz);
    L.t = (L.t || 0) + dt;
    const talking = voiceLine && shown < lineText.length + 2, pulse = talking ? 1.6 + 0.6 * Math.abs(Math.sin(L.t * 9)) : 0.9 + 0.1 * Math.sin(L.t * 2);
    L.halo.scale.setScalar(0.55 * pulse); L.halo.material.opacity = talking ? 1 : 0.7;
  }
  // the dawn behind the stage (the endings): a warm glow climbing over the far land and staying
  let dawn = null;
  function storyFx(name, a) {
    const fx = view.fx; if (!fx) return;
    const p = a ? { x: a.e.x, y: a.e.y || 0, z: a.e.z } : { x: at, y: 0, z: Z0 };
    switch (name) {
      case 'bell': {
        // three strokes: the bell flashes and rings of sound spread out from it (facing the camera, faint); a street with
        // no bell of its own (every bell in the land ringing) rings far off behind the stage, high up
        const b = view.marks?.bell || [at + 2, 7, -30];
        for (let i = 0; i < 3; i++) fx.after(i * 1.3, () => {
          fx.flash(b[0], b[1], b[2] + 1, '#fff0c0', view.marks?.bell ? 6 : 10, 0.35); view.shake(view.marks?.bell ? 0.22 : 0.08);
          for (let k = 0; k < 3; k++) fx.after(k * 0.15, () => fx.ring(b[0], b[2] + 0.5, 3 + k * 2.5, '#ffd36a', 1.6, { y: b[1], vertical: true, face: 0, opacity: 0.45 }));
          if (view.marks?.bell) fx.sparks(b[0], b[1], b[2] + 1, '#ffe8a0', 16, { speed: 4, up: 3, grav: 1, life: 1.2, size: 0.25 });
        });
        break;
      }
      case 'lanternBreak': {
        const q = lantern?.g.visible ? lantern.g.position : { x: p.x, y: 1, z: p.z };
        fx.flash(q.x, q.y, q.z, '#c8ffd0', 5, 0.4); view.shake(0.3);
        fx.debris('rock', q.x, q.y, q.z, 10, '#7affa0', { speed: 6, up: 5 });
        fx.sparks(q.x, q.y, q.z, '#7aff9a', 30, { speed: 6, up: 4, size: 0.24, life: 0.9 });
        fx.column(q.x, q.z, 0.8, 8, '#5aff7a', 1.2, { grow: true });
        for (let i = 0; i < 12; i++) fx.after(0.2 + i * 0.08, () => fx.sparks(q.x, q.y + i * 0.4, q.z, '#b8ffc8', 2, { speed: 0.5, up: 3, grav: -1, life: 1.4, size: 0.3 }));
        if (lantern) lantern.broken = true;
        break;
      }
      case 'rise': for (let i = 0; i < 6; i++) fx.after(i * 0.35, () => { fx.ring(p.x, -3.2, 4 + i, '#d8ecff', 1, { opacity: 0.7 }); fx.sparks(p.x + (Math.random() - 0.5) * 6, 0.3, -3.4, '#e8f4ff', 10, { speed: 3, up: 8, size: 0.32, life: 1.2 }); }); view.shake(0.2); break;
      case 'roar': view.shake(0.3); fx.ring(p.x, Math.max(p.z, -3), 6, '#e8dcc8', 0.8); fx.ring(p.x, Math.max(p.z, -3), 9, '#e8dcc8', 1.1, { opacity: 0.6 }); break;
      case 'fire': case 'greenfire': view.fx.acts?.handle({ type: 'zoneHit', shape: 'row', x: at, z: Z0 - 0.3, r: 0.8, len: 14, look: name === 'fire' ? 'skyfire_gold' : 'skyfire_green' }, G, view.actors); view.shake(0.3); break;
      case 'dawn': {
        if (!dawn) { dawn = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#ffd8a0', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false })); dawn.scale.setScalar(70); view.scene.add(dawn); dawn.userData.t = 0; }
        dawn.position.set(at + 10, -6, -120);
        break;
      }
      case 'flash': fx.flash(p.x, (p.y || 0) + 1.2, p.z + 0.3, '#ffffff', 5, 0.3); break;
      case 'quake': view.shake(0.35); fx.debris('rock', p.x, 0.3, p.z, 8, '#6a5a4a', { speed: 6, up: 5 }); break;
      case 'heal': for (let i = 0; i < 3; i++) fx.after(i * 0.25, () => fx.ring(p.x, Math.max(p.z, -3), 2 + i * 1.5, '#ffe8a0', 1, { opacity: 0.8 })); fx.column(p.x, Math.max(p.z, -3.4), 1.2, 6, '#fff0c0', 1.2, { grow: true }); break;
      case 'crown': for (let i = 0; i < 3; i++) fx.after(i * 0.3, () => fx.ring(p.x, p.z, 1.5 + i, '#7aff9a', 1, { opacity: 0.9 })); fx.column(p.x, p.z, 0.7, 4, '#5aff7a', 1.4, { grow: true }); break;
      case 'chains': fx.debris('rock', p.x, 2, Math.max(p.z, -3.4), 8, '#4a4e54', { speed: 5, up: 4 }); fx.flash(p.x, 2, Math.max(p.z, -3.4), '#c8d0d8', 3, 0.25); view.shake(0.15); break;
      case 'calm': fx.sparks(p.x, 2, Math.max(p.z, -3.4), '#fff4d0', 24, { speed: 1.5, up: 2, grav: -0.3, life: 1.6, size: 0.25 }); break;
      default: break;
    }
  }
  const MOUTH = { a: 'ah', o: 'o', u: 'o', e: 'ee', i: 'ee', y: 'ee', m: 'm', b: 'b', p: 'm', f: 'f', v: 'v' };
  function update(dt) {
    dt = Math.min(0.1, Math.max(0, dt));
    G.t += dt; G.events = [];
    if (!readyFlag) {
      // bodies still building: keep everyone hidden (no stand-in capsules on a story stage) and hold the wide shot
      // then the opening: a wide shot while the heroes walk on (1.4 s), and the first line is acted out
      if ([...who.values()].every(bodyReady)) { readyFlag = true; introUntil = G.t + 1.4; for (const a of who.values()) if (!a.left && !a.offstage) a.e.state = 'idle'; wideShot(); }
    }
    if (readyFlag && pending && G.t >= introUntil) { pending = false; line(lineI); }
    for (const a of who.values()) {
      const e = a.e; e.px = e.x; e.pz = e.z; e.py = e.y;
      if (!readyFlag || a.left) continue;
      if (a.offstage) continue;
      if (a.giant) { giantStep(a, dt); continue; }
      if (e.state === 'gone') { if (bodyReady(a)) e.state = 'idle'; else continue; }   // someone who joins mid-scene waits off stage until built
      if (a.delay > 0) { a.delay -= dt; continue; }
      if (a.goal) {
        const dx = a.goal.x - e.x, dz = a.goal.z - e.z, d = Math.hypot(dx, dz);
        if (d < 0.04) { e.x = a.goal.x; e.z = a.goal.z; if (a.goal.off) { a.left = true; e.state = 'gone'; } a.goal = null; a.entered = true; e.anim = 'idle'; }
        else { const k = Math.min(1, (WALK * dt) / d); e.x += dx * k; e.z += dz * k; e.anim = 'walk'; e.loop = null; e.turn = 0.35; if (Math.abs(dx) > 0.02) e.dir = Math.sign(dx); continue; }
      }
      faceDir(a);
      e.loop = a.loop;
      if (a.fx?.length) for (const f of a.fx.splice(0)) storyFx(f, a);
      if (a.busy > 0) a.busy -= dt;
      else if (a.then.length) play(a, a.then.shift());
    }
    // the speaker's mouth follows the letters being written; everyone else's face rests (or holds its mood)
    mouthT -= dt;
    for (const a of who.values()) {
      const c = view.actors?.get(a.e.id)?.body?.chibi; if (!c) continue;
      const talking = a === focus && shown < lineText.length + 2 && readyFlag;
      if (talking && mouthT <= 0) {
        const ch2 = (lineText[Math.max(0, shown - 1)] || ' ').toLowerCase();
        c.setMouthShape?.(MOUTH[ch2] || (/[a-z]/.test(ch2) ? 'open' : 'closed'), /[a-z]/.test(ch2) ? 0.85 : 0);
      } else if (!talking) c.setMouthShape?.('closed', 0);
      c.setExpression?.(a.mood || 'neutral', a.mood ? 0.8 : 0);
    }
    if (mouthT <= 0) mouthT = 0.075;
    if (lantern) lanternStep(dt);
    if (dawn) { dawn.userData.t += dt; const k = Math.min(1, dawn.userData.t / 5); dawn.position.y = -6 + 26 * k; dawn.material.opacity = 0.85 * k; }
    // glide the camera to its shot (an orbit keeps drifting round)
    if (shot.want && shot.drift) { shot.orbitT = (shot.orbitT || 0) + dt; shot.want.pos[0] += Math.sin(shot.orbitT * 0.35) * shot.drift * dt * 3; }
    if (shot.want) {
      const k = 1 - Math.exp(-dt * shot.glide);
      shot.pos.lerp(new THREE.Vector3(...shot.want.pos), k); shot.target.lerp(new THREE.Vector3(...shot.want.target), k);
    }
    view.setShot({ pos: shot.pos.toArray(), target: shot.target.toArray(), fov: shot.fov });
    view.update(G, 1, dt);
    if (G.events.length) view.handle(G.events);
  }
  // the opening: everyone wide while the heroes walk on
  wideShot();
  shot.pos.set(...shot.want.pos); shot.target.set(...shot.want.target);
  shot.pos.x -= 2.5;
  return {
    G, at,
    ready: (async () => { await view.setChapter(chId); })(),
    /** Every body is built, the heroes have walked on and the lines are being acted (tests wait for this). */
    get acting() { return readyFlag && !pending && G.t >= introUntil; },
    line, update,
    reveal(n) { shown = n; },
    safe({ top, bottom }) { if (top != null) safeArea.top = top; if (bottom != null) safeArea.bottom = bottom; if (readyFlag) (reframe || wideShot)(); },
    wide() { focus = null; reframe = wideShot; wideShot(); },
    /** Who is on stage, where, facing which way, playing what (tests and the review page read this). */
    cast() { return [...who.values()].filter(a => !a.offstage).map(a => ({ id: a.id, giant: !!a.giant, x: a.e.x, z: a.e.z, dir: a.e.dir, anim: view.actors?.get(a.e.id)?.body?.anim || null, state: a.e.state, built: bodyReady(a) })); },
    dispose() {
      view.setShot(null);
      if (lantern) { view.scene.remove(lantern.g); lantern.mats.forEach(m => m.dispose()); lantern.geos.forEach(g => g.dispose()); }
      if (dawn) { view.scene.remove(dawn); dawn.material.dispose(); }
      G.heroes.length = 0; G.foes.length = 0;
      view.actors?.clear();
    },
  };
}
