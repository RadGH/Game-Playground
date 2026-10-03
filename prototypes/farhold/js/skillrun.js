// Farhold — round 28: the skill vocabulary's RUNTIME, the half that draws, moves and strikes.
//
// js/skillmech.js decides (pure, node-tested); this file acts on the live field, the companions,
// the player's body and the effects engine. js/main.js builds one of these and calls it at a
// handful of fixed points — castSkill, fireBolt, the kill, a hit taken, the basic attack, the body
// placement and the frame tick — so the shared 10,000-line file only grows by those call sites.
//
// Every vocabulary key whose `reader` is 'js/skillrun.js' is read here, by name; the audit in
// tests/round28-skills.test.js checks that each one appears in this file.

import {
  world, placeObject, tickPlaced, takeCorpses, addCorpse, resetWorld, leaveShapes, formOf, formIds,
  applyMod, gainResource, controlFor, statusRef, ringsFor, queue, repeatsOf, statusStatsKey, addWall, tickWalls,
} from './skillmech.js';
import { setStatusExpire } from './skills.js';
// the creature catalogue has no Three.js in it, so a shape can be checked before it is built
import { CREATURE_TYPES } from '../../../avatar-3d/js/creature-types.js';

/**
 * env (all lazily read — main.js builds this before the field, the pets and the bar exist):
 *   THREE, scene, spellfx, fx, sound, hud, rpg, skillData, makeActor, setActorAnim
 *   field(), pets(), player(), control(), skills(), terrain(), actor() (the humanoid body)
 *   uniqueEnv, landStatus(type, spec, enemy, power), statusHook, reportHit(e, result)
 *   ringPoints(x,z,r,n), groundTarget(range), aim(), castSkill(plan, opts), running()
 *   playerLook()  the player's avatar look, for a decoy or a shade
 */
export function createSkillRuntime(env) {
  const { THREE } = env;
  const P = () => env.player();
  const C = () => env.control();
  const F = () => env.field();
  const PETS = () => env.pets();
  const statuses = () => env.skillData?.statuses || {};
  const statusSpec = id => statuses()[id] || null;
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const groundY = (x, z) => env.terrain().heightAt(x, z);
  const log = (t, k = '') => env.hud?.log?.(t, k);
  const later = (s, fn) => setTimeout(() => { if (env.running()) fn(); }, Math.max(0, s * 1000));

  // a tag that bursts as it ends (Clockwork Bolt's Stuck): js/skills.js tickStatuses calls this
  setStatusExpire((unit, type, st) => {
    const b = st.burstOnExpire;
    if (!b || unit.removed || !F()) return;
    const pool = ['fire', 'ice', 'lightning', 'shadow', 'poison', 'arcane'];
    const el = b.element === 'random' ? pool[Math.floor(Math.random() * pool.length)] : (b.element || 'physical');
    env.spellfx?.aoe?.({ points: env.ringPoints(unit.x, unit.z, b.radius ?? 2.5), element: el, stagger: 0.02 });
    const hits = F().strikeArea(unit.x, unit.z, b.radius ?? 2.5, P(), { power: b.power ?? 0.5, element: el, falloff: 0.7, proc: true });
    for (const h of hits) env.reportHit(h.enemy, h.result);
  });

  // ─────────────────────────────────────────── temporary pet defs (plan §8.2)

  let registered = false;
  function registerTemps() {
    if (registered || !PETS()?.register) return;
    registered = true;
    const pets = PETS();
    const look = () => ({ avatar: JSON.parse(JSON.stringify(env.playerLook?.()?.avatar || {})) });
    pets.register({ id: 'holy_wisp', name: 'Guardian Light', kind: 'spirit', family: 'elemental', role: 'caster', hp: 30, dmg: [4, 7], armor: 2, speed: 6, reach: 2.4, attackEvery: 1.6, flying: true, ranged: { range: 16, element: 'holy' }, look: { creature: { type: 'wisp', size: 0.8, colors: { body: '#fff2b0', accent: '#ffd36a', eyes: '#ffffff' } } } });
    pets.register({ id: 'phantom_decoy', name: 'Decoy', kind: 'humanoid', family: 'human', role: 'brute', hp: 40, dmg: [1, 1], armor: 4, speed: 0, reach: 1, attackEvery: 99, look: look() });
    pets.register({ id: 'shade', name: 'Shade', kind: 'humanoid', family: 'human', role: 'skirmisher', hp: 40, dmg: [5, 9], armor: 3, speed: 5.4, reach: 2.4, attackEvery: 1.2, look: look() });
    pets.register({ id: 'buried_thrall', name: 'Buried Thrall', kind: 'humanoid', family: 'undead', role: 'skirmisher', hp: 20, dmg: [2, 4], armor: 2, speed: 4.6, reach: 2.4, attackEvery: 1.5, look: { creature: { type: 'wraith', size: 1, colors: { body: '#ded8c4', eyes: '#6ae0ff' } } } });
    pets.register({ id: 'spirit_warrior', name: 'Spirit Warrior', kind: 'spirit', family: 'elemental', role: 'brute', hp: 50, dmg: [6, 10], armor: 6, speed: 5, reach: 2.6, attackEvery: 1.4, look: { creature: { type: 'wraith', size: 1.2, colors: { body: '#9ad4ff', eyes: '#ffffff' } } } });
    pets.register({ id: 'puffball', name: 'Puffball', kind: 'beast', family: 'beast', role: 'brute', hp: 20, dmg: [1, 1], armor: 1, speed: 0, reach: 1, attackEvery: 99, look: { creature: { type: 'mushroom', size: 0.6, colors: { body: '#d8c7a0', belly: '#f2e6c8', accent: '#9b8456', eyes: '#3a2a10' } } } });
  }

  // ─────────────────────────────────────────── helpers

  /** The plan's damage scale over its row's base `mult`, so a sub-strike's base mult reads the same. */
  const scaleOf = plan => (plan.mult || 1) / Math.max(0.01, plan.baseMult || plan.skill?.mult || 1);
  const subPower = (plan, mult) => (mult ?? 1) * scaleOf(plan);

  function knockShape(k) {
    if (!k) return null;
    const push = typeof k === 'number' ? k : k.push || 0;
    return { push, stagger: k.stagger || 0, interrupt: !!k.interrupt, hitstop: 70, shake: push > 2 ? 0.8 : 0.4, key: 'skill' };
  }

  /** Every enemy hit by a strike: pull it in (`pullIn`), ring an anvil (`place.ringOn`). */
  function wrapOnHit(plan, opts, at = null) {
    const inner = opts.onHit;
    const p = plan.pullIn;
    const field = F();
    return (enemy, result) => {
      inner?.(enemy, result);
      plan._hits = (plan._hits || 0) + 1;
      if (p && result?.amount > 0 && enemy.dying == null) {
        if (p.only === 'ranged' && !enemy.ranged) return;
        const to = p.to === 'impact' && at ? at : p.to === 'line' && plan._lineAt ? plan._lineAt(enemy) : { x: C().x, z: C().z };
        env.uniqueEnv.push(enemy, to.x, to.z, -(p.metres || 2));
      }
      // The Great Anvil: a hit by the named skill near a standing anvil rings it
      if (result?.amount > 0 && plan.skill?.id) {
        for (const obj of ringsFor(plan.skill.id, enemy.x, enemy.z)) {
          if (obj._rang && obj._rang > performance.now() - 250) continue;
          obj._rang = performance.now();
          const r = obj.spec.ringOn.radius ?? 8;
          env.spellfx.aoe({ points: env.ringPoints(obj.x, obj.z, r), element: obj.element, stagger: 0.02 });
          field.strikeArea(obj.x, obj.z, r, P(), { power: obj.power * (obj.spec.ringOn.mult ?? 1.2), element: obj.element, falloff: 0.6, proc: true, rules: obj.spec.ringOn.rune ? { skill: 'anvil', stack: { status: 'rune', max: 3 } } : null });
        }
      }
    };
  }

  /** Decorate the strike options castSkill built: carry the rules, the knock, the pull. */
  function decorate(plan, opts) {
    const out = { ...opts, rules: plan.rules || null, knock: knockShape(plan.knock), noDamage: !!plan.noDamage };
    out.onHit = wrapOnHit(plan, opts, plan.at || null);
    return out;
  }

  /** A burst of `mult` (base) within `r` of a point, at the plan's scale. */
  function burst(plan, x, z, r, mult, { element = null, status = null, knock = null, heal = 0 } = {}) {
    const el = element || plan.element;
    env.spellfx.aoe({ points: env.ringPoints(x, z, r), element: el, stagger: 0.02 });
    const hits = F().strikeArea(x, z, r, P(), { power: subPower(plan, mult), element: el, falloff: 0.6, rules: status ? { skill: plan.skill?.id, statuses: [status] } : null, knock: knockShape(knock), proc: true });
    for (const h of hits) env.reportHit(h.enemy, h.result);
    if (heal) healAllies(heal, { x, z, r });
    return hits;
  }

  // ─────────────────────────────────────────── allies: heal, cleanse, barrier

  function allies() {
    const out = [P()];
    for (const p of PETS()?.pets || []) if (p.dying == null && !p.removed) out.push(p);
    return out;
  }
  function allyPos(u) { return u === P() ? { x: C().x, z: C().z } : { x: u.x, z: u.z }; }
  /** Heal every ally (or those inside `r` of a point) `share` of their own maximum health. */
  function healAllies(share, { x = null, z = null, r = Infinity, pets = true } = {}) {
    let total = 0;
    const lift = 1 + (P().derived?.healingPct || 0);
    for (const u of allies()) {
      if (!pets && u !== P()) continue;
      const at = allyPos(u);
      if (x != null && Math.hypot(at.x - x, at.z - z) > r) continue;
      const amount = Math.round((u.maxHp || 0) * share * lift);
      const before = u.hp;
      u.hp = Math.min(u.maxHp, u.hp + amount);
      total += u.hp - before;
    }
    return total;
  }
  function healMostHurt(amount) {
    let worst = null, frac = 1.01;
    for (const u of allies()) { const f = u.hp / Math.max(1, u.maxHp); if (f < frac) { frac = f; worst = u; } }
    if (!worst) return 0;
    const before = worst.hp;
    worst.hp = Math.min(worst.maxHp, worst.hp + amount);
    return worst.hp - before;
  }
  function cleanseUnit(u, count = 1, types = null) {
    if (!u?.statuses) return 0;
    let n = 0;
    for (const [id, st] of Object.entries(u.statuses)) {
      if (n >= count) break;
      if (st.kind === 'buff' || st.kind === 'form' || st.kind === 'tag') continue;
      if (types && !types.includes(id)) continue;
      delete u.statuses[id];
      env.spellfx?.status?.(u === P() ? env.actor()?.group : u.actor?.group, id, false);
      n++;
    }
    return n;
  }

  /** What the hit rules act through (js/skillmech.js setMechEnv). */
  const mechEnv = {
    near: (x, z, r, except) => F()?.near(x, z, r, except) || [],
    allies,
    followers: () => (PETS()?.pets || []).filter(p => p.dying == null && !p.decoy).length,
    healMostHurt,
    healAllies: share => healAllies(share),
    healNearestPet(share) {
      let best = null, bd = Infinity;
      for (const p of PETS()?.pets || []) { if (p.dying != null) continue; const d = Math.hypot(p.x - C().x, p.z - C().z); if (d < bd) { bd = d; best = p; } }
      if (best) best.hp = Math.min(best.maxHp, best.hp + Math.round(best.maxHp * share));
    },
    statusSpec,
    applyStatus: (t, id, spec, power) => env.landStatus(id, spec, t, power),
    statusFx: (u, type, on) => env.spellfx?.status?.(u.actor?.group, type, on),
    strikeArea: (x, z, r, { power = 1, element = 'arcane', knock = null } = {}) => {
      const hits = F().strikeArea(x, z, r, P(), { power, element, falloff: 0.6, proc: true, knock: knockShape(knock) });
      env.spellfx.aoe({ points: env.ringPoints(x, z, r), element, stagger: 0.02 });
      for (const h of hits) env.reportHit(h.enemy, h.result);
      return hits;
    },
    push: (e, x, z, m) => env.uniqueEnv.push(e, x, z, m),
    rng: () => F()?.rng?.() ?? Math.random(),
    taunt: (e, seconds) => F()?.taunt?.(e, 'player', seconds),
  };

  // ─────────────────────────────────────────── placed objects (posts, zones, traps, rings)

  const POST_TINT = { fire: 0xff7a3a, ice: 0x8fd6ff, lightning: 0xffe86a, poison: 0x9ede6a, shadow: 0xc090ff, holy: 0xffe6a8, nature: 0x8ad66a, arcane: 0xb79cf5, physical: 0xd8dcea };
  function drawPlaced(obj) {
    const color = POST_TINT[obj.element] ?? 0xd8dcea;
    const group = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(Math.max(0.1, obj.r - 0.18), obj.r, 40);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: obj.kind === 'trap' ? 0.5 : 0.42, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    if (obj.kind === 'zone' || obj.spec.heal || obj.spec.buff) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(obj.r, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
      disc.rotation.x = -Math.PI / 2;
      group.add(disc);
    }
    if (obj.kind === 'pulse' && !obj.follow) {
      // a post: a short pillar so a player can see what to stand by
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.6, 8), new THREE.MeshBasicMaterial({ color }));
      post.position.y = 0.8;
      group.add(post);
    }
    /**
     * THE TIME LEFT, as a bright arc just outside the ring that shrinks as the object runs down —
     * a fade alone did not say "two seconds left". The arc is a full ring drawn partly (drawRange),
     * so it costs nothing per frame beyond one number.
     */
    if (Number.isFinite(obj.life)) {
      const SEG = 48;
      const arcGeo = new THREE.RingGeometry(obj.r + 0.05, obj.r + 0.32, SEG, 1, Math.PI / 2, Math.PI * 2);
      const arc = new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
      arc.rotation.x = -Math.PI / 2;
      arc.position.y = 0.02;
      group.add(arc);
      obj.timer = { mesh: arc, seg: SEG };
    }
    group.position.set(obj.x, groundY(obj.x, obj.z) + 0.08, obj.z);
    env.scene.add(group);
    obj.mesh = group;
  }
  /** Shrink a placed object's timer arc to the share of its life it has left. */
  function drawTimer(o) {
    if (!o.timer) return;
    const frac = Math.max(0, Math.min(1, o.left / o.life));
    const idx = o.timer.mesh.geometry.index;
    o.timer.mesh.geometry.setDrawRange(0, Math.ceil(frac * o.timer.seg) * 6);
    if (!idx) o.timer.mesh.visible = frac > 0;
  }
  function undraw(obj) {
    if (!obj?.mesh) return;
    env.scene.remove(obj.mesh);
    obj.mesh.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    obj.mesh = null;
  }
  /** Put a `place` block down for this plan at a point (or following something). */
  function place(plan, spec, x, z, follow = null) {
    const obj = placeObject(spec, {
      x, z, owner: plan.skill?.id || 'skill', follow, element: spec.element || plan.element,
      power: subPower(plan, spec.strike?.mult ?? 0.3), ownerHp: P().maxHp || 100, rules: plan.rules,
    });
    for (const old of obj.removed || []) undraw(old);
    obj.plan = plan;
    if (spec.taunt || spec.hp) obj.placed = true;
    drawPlaced(obj);
    if (spec.taunt) for (const e of F().near(x, z, obj.r + 2)) F().taunt(e, obj, spec.seconds ?? 6);
    if (obj.kind === 'pulse' && !follow) env.spellfx.pillar?.({ at: v3(x, groundY(x, z), z), radius: 0.8, element: obj.element, ms: 500 });
    return obj;
  }
  function runPlaced(dt) {
    const acts = tickPlaced(dt, {
      enemies: () => F()?.enemies || [],
      allies: () => allies().map(u => ({ ...allyPos(u), hp: u.hp, maxHp: u.maxHp, unit: u })),
      at: f => (f === 'self' ? { x: C().x, z: C().z } : f && f.dying == null && !f.removed ? { x: f.x, z: f.z } : null),
      rng: () => F()?.rng?.() ?? Math.random(),
    });
    for (const o of world.placed) if (o.mesh) {
      o.mesh.position.set(o.x, groundY(o.x, o.z) + 0.08, o.z);
      const fade = Number.isFinite(o.life) ? Math.max(0.2, o.left / o.life) : 1;
      o.mesh.children[0].material.opacity = (o.kind === 'trap' ? (o.armed > 0 ? 0.2 : 0.55) : 0.42) * fade;
      drawTimer(o);
    }
    for (const act of acts) {
      const o = act.obj, s = o.spec;
      switch (act.kind) {
        case 'strike':
          for (const e of act.targets) {
            env.uniqueEnv.arc?.({ x: o.x, z: o.z, y: groundY(o.x, o.z) + 1.4 }, e, o.element);
            const hits = F().strikeArea(e.x, e.z, s.strike.splash ?? 1.2, P(), { power: o.power, element: s.strike.element || o.element, falloff: 0.8, proc: true, rules: s.strike.status ? { skill: o.owner, statuses: [s.strike.status] } : null, knock: knockShape(s.strike.knock) });
            for (const h of hits) env.reportHit(h.enemy, h.result);
          }
          break;
        case 'heal': {
          const lift = 1 + (P().derived?.healingPct || 0);
          for (const a of act.targets) { const u = a.unit; u.hp = Math.min(u.maxHp, u.hp + Math.round(u.maxHp * s.heal * lift)); }
          break;
        }
        case 'buff':
          for (const a of act.targets) {
            const r = statusRef(s.buff);
            if (r) env.rpgApply(a.unit, r.id, { ...statusSpec(r.id), ...r, seconds: Math.max(1.2, o.every + 0.3) });
            if (s.barrierTick) { const u = a.unit; u.barrier = Math.min(Math.round(u.maxHp * (s.barrierCap ?? 0.15)), (u.barrier || 0) + Math.round(u.maxHp * s.barrierTick)); if (u === P()) P().castBarrierFor = Math.max(P().castBarrierFor || 0, 2); else u.barrierFor = 2; }
            if (s.deathPrevent) env.rpgApply(a.unit, 'unbroken', { name: 'Unbroken', kind: 'buff', element: 'holy', seconds: Math.max(1.2, o.every + 0.3), deathPrevent: true });
          }
          break;
        case 'debuff':
          for (const e of act.targets) {
            const r = statusRef(s.debuff);
            // Lethargy: a sleeper inside needs more hits to wake
            if (r.sleeperHits && e.statuses?.sleep) e.statuses.sleep.hitsToWake = Math.max(e.statuses.sleep.hitsToWake || 1, r.sleeperHits);
            const ctl = controlFor(e, r.id, Math.max(1.2, o.every + 0.3));
            env.landStatus(ctl.id, { ...statusSpec(ctl.id), ...(ctl.id === r.id ? r : {}), seconds: ctl.seconds, ...(ctl.slow ? { slow: ctl.slow } : {}) }, e, 1);
          }
          break;
        case 'knockOut': for (const e of act.targets) env.uniqueEnv.push(e, o.x, o.z, s.knockOut); break;
        case 'pull': for (const e of act.targets) env.uniqueEnv.push(e, o.x, o.z, -s.pull); break;
        case 'edge':
          for (const e of act.targets) {
            const hits = F().strikeArea(e.x, e.z, 0.8, P(), { power: subPower(o.plan, s.edgeMult ?? 1), element: o.element, falloff: 1, proc: true, knock: knockShape(s.edgeKnock || { stagger: 0.6 }), rules: s.edgeStatus ? { skill: o.owner, statuses: [s.edgeStatus] } : null });
            for (const h of hits) env.reportHit(h.enemy, h.result);
            env.spellfx.impact({ at: v3(e.x, e.y + 0.9, e.z), element: o.element });
          }
          break;
        case 'trap': {
          const tr = s.strike || {};
          env.spellfx.impact({ at: v3(o.x, groundY(o.x, o.z) + 0.4, o.z), element: o.element, crit: true });
          const hits = F().strikeArea(o.x, o.z, o.r, P(), { power: subPower(o.plan, tr.mult ?? 1), element: o.element, falloff: 0.7, proc: true, rules: { skill: o.owner, ...(tr.status ? { statuses: [tr.status] } : {}), ...(s.tag ? { tag: s.tag } : {}) }, knock: knockShape(tr.knock) });
          for (const h of hits) env.reportHit(h.enemy, h.result);
          undraw(o);
          break;
        }
        case 'expire':
          if (s.onExpire?.radius) burst(o.plan, o.x, o.z, s.onExpire.radius, s.onExpire.mult ?? 1, { heal: s.onExpire.heal || 0 });
          undraw(o);
          break;
        default: break;
      }
    }
  }
  /** An enemy swung at a taunting post or banner (js/actors.js `onEnemyStrikeObject`). */
  function onObjectStruck(e, obj) {
    if (obj.hp == null) return;
    const dmg = Math.max(1, Math.round(((e.dmg?.[0] || 3) + (e.dmg?.[1] || 6)) / 2));
    obj.hp -= dmg;
    env.spellfx.impact({ at: v3(obj.x, groundY(obj.x, obj.z) + 0.8, obj.z), element: 'physical' });
    if (obj.hp <= 0) { obj.left = 0; log(`${obj.plan?.skill?.name || 'The post'} is broken.`, 'bad'); }
  }

  // ─────────────────────────────────────────── casting: the per-kind halves

  /** The body a skill is aimed at: what is under the crosshair, else the nearest along the aim. */
  function aimedEnemy(a, range) {
    if (a.target && a.target.dying == null) return a.target;
    const field = F();
    for (let t = 3; t <= range; t += 2) {
      const e = field.nearestTo(C().x + a.dx * t, C().z + a.dz * t, 2.2);
      if (e) return e;
    }
    return null;
  }
  function aimedFollower(a, range) {
    let best = null, bd = Infinity;
    for (const p of PETS()?.pets || []) {
      if (p.dying != null || p.decoy) continue;
      const ex = p.x - C().x, ez = p.z - C().z;
      const along = ex * a.dx + ez * a.dz;
      if (along < -2 || Math.hypot(ex, ez) > range) continue;
      const off = Math.abs(ex * a.dz - ez * a.dx);
      const score = off + Math.max(0, -along);
      if (score < bd) { bd = score; best = p; }
    }
    return best;
  }

  /**
   * `dash` (the object form): to the first body, behind a target, backward, swap, beside an ally,
   * or a hook; `leap` strikes nothing on the way; `land` bursts where you come down. Returns true
   * when this handled the dash (a dash with no object keeps js/main.js's plain line).
   */
  function dash(plan, a, opts) {
    const d = plan.dash;
    if (!d || typeof d !== 'object') return false;
    const c = C(), field = F();
    const range = d.range ?? plan.range ?? 10;
    const from = { x: c.x, z: c.z };
    /**
     * `dash.targets`: step between up to N enemies within `range`, nearest first, one strike each
     * (Cutting Waltz). Each step is a short teleport beside the next body.
     */
    if (d.targets) {
      const list = field.near(c.x, c.z, range).filter(e => e.dying == null)
        .sort((p, q) => Math.hypot(p.x - c.x, p.z - c.z) - Math.hypot(q.x - c.x, q.z - c.z)).slice(0, d.targets);
      list.forEach((e, k) => later(k * 0.18, () => {
        if (e.dying != null) return;
        const ox = C().x, oz = C().z;
        const ang = Math.atan2(ox - e.x, oz - e.z);
        C().teleport(e.x + Math.sin(ang) * 1.3, e.z + Math.cos(ang) * 1.3);
        C().yaw = Math.atan2(e.x - C().x, e.z - C().z);
        C().swing = Math.max(C().swing, 0.2);
        env.spellfx.footfall?.({ at: v3(ox, groundY(ox, oz), oz), element: plan.element });
        const res = env.rpg.strike(P(), e, field.rng, { multiplier: plan.mult, element: plan.element, skill: plan.skill?.id, applyStatus: env.statusHook, rules: plan.rules, noDamage: !!plan.noDamage });
        field.land(e, res, { strike: knockShape(plan.knock), fromX: C().x, fromZ: C().z, element: plan.element });
        opts.onHit?.(e, res);
        if (res.dead) field.kill(e);
        if (plan.afterimage && k > 0) echoFrom(plan, env.aim(), { x: ox, z: oz, yaw: ang + Math.PI }, plan.afterimage.mult ?? 0.5);
      }));
      plan._start = from;
      return true;
    }
    let to = null, face = null, struck = null;
    const toward = (x, z, keep) => { const dx = x - from.x, dz = z - from.z, len = Math.hypot(dx, dz) || 1; return { x: x - dx / len * keep, z: z - dz / len * keep }; };
    switch (d.to || 'aim') {
      case 'target': {
        const e = aimedEnemy(a, range);
        if (e) { to = toward(e.x, e.z, 1.3); struck = e; face = e; }
        break;
      }
      case 'behind': {
        const e = aimedEnemy(a, range + 2);
        if (e) {
          const dx = e.x - from.x, dz = e.z - from.z, len = Math.hypot(dx, dz) || 1;
          to = { x: e.x + dx / len * 1.5, z: e.z + dz / len * 1.5 };
          struck = e; face = e;
        }
        break;
      }
      case 'back': to = { x: from.x - a.dx * range, z: from.z - a.dz * range }; break;
      case 'swap': {
        const pet = aimedFollower(a, range);
        const e = aimedEnemy(a, range);
        const other = e && !e.boss ? e : pet;
        if (other) {
          to = { x: other.x, z: other.z };
          const ox = from.x, oz = from.z;
          if (other === pet) {
            other.x = ox; other.z = oz;
            if (d.allyBarrier) { other.barrier = Math.round(other.maxHp * d.allyBarrier); other.barrierFor = 6; }
          } else {
            other.x = ox; other.z = oz;
            if (d.enemyStatus) { const r = statusRef(d.enemyStatus); env.landStatus(r.id, { ...statusSpec(r.id), ...r }, other, 1); }
          }
          env.spellfx.cast({ at: v3(ox, groundY(ox, oz) + 0.4, oz), element: plan.element, ms: 320 });
        }
        break;
      }
      case 'ally': {
        const pet = aimedFollower(a, range);
        if (pet) to = toward(pet.x, pet.z, 1.4);
        break;
      }
      case 'hit': {
        const e = aimedEnemy(a, range);
        const pet = aimedFollower(a, range);
        const eD = e ? Math.hypot(e.x - from.x, e.z - from.z) : Infinity;
        const pD = pet ? Math.hypot(pet.x - from.x, pet.z - from.z) : Infinity;
        if (e && eD <= pD) { to = toward(e.x, e.z, 1.3); struck = e; face = e; } else if (pet) to = toward(pet.x, pet.z, 1.3);
        break;
      }
      default: break;
    }
    if (!to) {
      const spot = env.groundTarget(range);
      const dist = Math.min(range, spot.dist);
      to = { x: from.x + a.dx * dist, z: from.z + a.dz * dist };
    }
    // the path: a leap strikes nothing on the way; a dash strikes along the line it travels
    const len = Math.hypot(to.x - from.x, to.z - from.z);
    const points = [];
    for (let t = 1; t <= len; t += 2) {
      const bx = from.x + (to.x - from.x) * (t / Math.max(1, len)), bz = from.z + (to.z - from.z) * (t / Math.max(1, len));
      points.push(v3(bx, groundY(bx, bz) + (d.leap ? 1.4 : 0.3), bz));
    }
    // every body near the path, once (the one you stop at takes its own hit below)
    if (!d.leap && !d.noPath && len > 0.5) {
      // `opts.onHit` already reports each hit; the body you stop at is struck below, once
      field.strikeSegment(from.x, from.z, to.x, to.z, plan.splash || 2, P(), { ...opts, falloff: 0.8, except: struck && (d.to === 'target' || d.to === 'behind' || d.to === 'hit') ? struck : null });
    }
    if (points.length) env.spellfx.aoe({ points, element: plan.element, stagger: 0.02 });
    if (d.leap) env.spellfx.footfall?.({ at: v3(from.x, groundY(from.x, from.z), from.z), element: plan.element });
    // P2 `dashWith`: every follower within 15 m comes too
    if (plan.dashWith || d.dashWith) PETS()?.bringAlong?.(from, to);
    c.teleport(to.x, to.z);
    if (face) c.yaw = Math.atan2(face.x - to.x, face.z - to.z);
    c.swing = Math.max(c.swing, 0.35);
    // the body you stop at takes the hit (Lunge's +50%, Wind Step, Chain Hook)
    if (struck && struck.dying == null && (d.to === 'target' || d.to === 'behind' || d.to === 'hit')) {
      const res = env.rpg.strike(P(), struck, field.rng, { multiplier: plan.mult * (1 + (d.hitMult || 0)), element: plan.element, skill: plan.skill?.id, applyStatus: env.statusHook, rules: plan.rules, noDamage: !!plan.noDamage });
      field.land(struck, res, { strike: knockShape(plan.knock), fromX: from.x, fromZ: from.z, element: plan.element });
      opts.onHit?.(struck, res);
      if (res.dead) field.kill(struck);
      env.spellfx.impact({ at: v3(struck.x, struck.y + 0.9, struck.z), element: plan.element, crit: res.crit });
    }
    if (d.land) {
      later(d.leap ? 0.18 : 0, () => {
        const hits = burst(plan, to.x, to.z, d.land.radius ?? 3, d.land.mult ?? 1, { knock: d.land.knock || plan.knock, heal: d.land.heal || 0 });
        if (d.land.status) for (const h of hits) { const r = statusRef(d.land.status); env.landStatus(r.id, { ...statusSpec(r.id), ...r }, h.enemy, 1); }
        if (d.land.place) place(plan, d.land.place, to.x, to.z);
      });
    }
    // an afterimage left where you started (Umbral Step) is the `afterimage` key's job
    plan._start = from;
    return true;
  }

  /** `line`: a ground skill laid as a line of strikes (and pool segments) toward / across the aim. */
  function line(plan, spot, opts) {
    const l = plan.line;
    if (!l) return false;
    const c = C();
    const length = l.length ?? 10, every = l.every ?? 2;
    let sx, sz, dx, dz;
    if (l.across) {
      const ax = spot.x - c.x, az = spot.z - c.z, len = Math.hypot(ax, az) || 1;
      dx = -az / len; dz = ax / len;
      sx = spot.x - dx * length / 2; sz = spot.z - dz * length / 2;
    } else {
      const ax = spot.x - c.x, az = spot.z - c.z, len = Math.hypot(ax, az) || 1;
      dx = ax / len; dz = az / len;
      sx = c.x + dx * 1.5; sz = c.z + dz * 1.5;
    }
    plan._lineAt = e => {
      const t = Math.max(0, Math.min(length, (e.x - sx) * dx + (e.z - sz) * dz));
      return { x: sx + dx * t, z: sz + dz * t };
    };
    const segs = [];
    for (let t = 0; t <= length; t += every) segs.push({ x: sx + dx * t, z: sz + dz * t });
    // each body near the line is struck ONCE (`opts.onHit` reports it)
    const strike = () => F().strikeSegment(sx, sz, sx + dx * length, sz + dz * length, (l.width ?? 2) / 2 + 0.4, P(), { falloff: 0.9, ...opts });
    env.spellfx.aoe({ points: segs.map(s => v3(s.x, groundY(s.x, s.z) + 0.15, s.z)), element: plan.element, stagger: 0.02 });
    if (plan.delay) later(plan.delay, strike); else strike();
    if (plan.pool) for (const s of segs) place(plan, { kind: 'zone', ...poolSpec(plan.pool), radius: (l.width ?? 2) / 2 + 0.6 }, s.x, s.z);
    return true;
  }

  /** `pool` as a placed zone (a damage pulse every 0.75 s, a slow and a status on what stands in it). */
  function poolSpec(p) {
    return {
      kind: 'zone', seconds: p.seconds ?? 4, radius: p.radius ?? 3, every: 0.75, element: p.element,
      strike: (p.power ?? 0.3) > 0 ? { mult: p.power ?? 0.3, all: true, splash: 0.6, status: p.status || null } : null,
      ...(p.slow ? { debuff: { id: 'chill', slow: p.slow, name: 'Slowed' } } : {}),
      ...(p.healAllies ? { heal: p.healAllies * 0.75 } : {}),
    };
  }

  /**
   * `repeats` with riders: `grow` (each strike reaches further), `scatter` (random points inside the
   * area, preferring enemies), `target: 'lowest'`, `alternate: [a, b]` (two sub-plans in turn).
   * Returns true when it took the repeats over from main.js.
   */
  function repeats(plan, origin, opts) {
    const r = plan.repeatSpec;
    if (!r || !(r.grow || r.scatter || r.alternate || r.target)) return false;
    const n = Math.max(1, plan.repeats || r.count || 1), every = plan.repeatEvery ?? r.every ?? 0.4;
    const field = F();
    for (let k = 0; k < n; k++) {
      later(k * every, () => {
        if (P().hp <= 0) return;
        const at = plan.kind === 'ground' ? origin : { x: C().x, z: C().z };
        let x = at.x, z = at.z;
        let radius = (plan.radius || 3) + (r.grow || 0) * k;
        if (r.alternate) {
          const sub = r.alternate[k % r.alternate.length];
          const sp = env.skills().planFor(sub, plan.skill, { shape: plan.kind, element: sub.element || plan.element });
          sp.at = at;
          // the sub-strike scales with whatever scaled the cast (a spender's points, an empower)
          const hits = field.strikeArea(x, z, sub.radius ?? radius, P(), { falloff: 0.6, power: subPower(plan, sub.mult ?? plan.baseMult ?? 1), element: sp.element, rules: sp.rules, onHit: opts.onHit, skill: plan.skill?.id, applyStatus: env.statusHook, noDamage: !sub.mult && !plan.mult });
          if (!opts.onHit) for (const h of hits) env.reportHit(h.enemy, h.result);
          if (sub.healAllies) healAllies(sub.healAllies);
          if (sub.healShare) healAllies(0, {}); // the share-of-damage heal rides onHit.healShare
          env.spellfx.aoe({ points: env.ringPoints(x, z, sub.radius ?? radius), element: sp.element, stagger: 0.02 });
          return;
        }
        if (r.scatter || r.target === 'lowest') {
          const inside = field.near(at.x, at.z, plan.radius || 6).filter(e => e.dying == null);
          let pick = null;
          if (r.target === 'lowest') pick = inside.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
          else if (inside.length && field.rng() < 0.7) {
            const tagged = inside.filter(e => Object.values(e.statuses || {}).some(s => s.kind === 'tag'));
            pick = (tagged.length && field.rng() < 0.5 ? tagged : inside)[Math.floor(field.rng() * (tagged.length ? tagged.length : inside.length))] || inside[0];
          }
          if (pick) { x = pick.x; z = pick.z; } else {
            const ang = field.rng() * Math.PI * 2, d = Math.sqrt(field.rng()) * (plan.radius || 6);
            x = at.x + Math.cos(ang) * d; z = at.z + Math.sin(ang) * d;
          }
          radius = r.strikeRadius ?? Math.min(2.4, plan.radius || 2.4);
        }
        env.spellfx.aoe({ points: env.ringPoints(x, z, radius), element: plan.element, stagger: 0.015 });
        env.spellfx.impact({ at: v3(x, groundY(x, z) + 0.6, z), element: plan.element });
        const hits = field.strikeArea(x, z, radius, P(), { falloff: 0.6, ...opts });
        // a tagged target inside is struck by EVERY pulse (Arrow Storm's Quarry)
        if (r.alwaysTag) {
          for (const e of field.near(at.x, at.z, plan.radius || 6)) {
            if (!e.statuses?.[r.alwaysTag] || hits.some(h => h.enemy === e)) continue;
            const res = env.rpg.strike(P(), e, field.rng, { multiplier: plan.mult, element: plan.element, skill: plan.skill?.id, applyStatus: env.statusHook, rules: plan.rules });
            field.land(e, res, { fromX: x, fromZ: z, element: plan.element });
            if (opts.onHit) opts.onHit(e, res); else env.reportHit(e, res);
            if (res.dead) field.kill(e);
          }
        }
        if (plan.kind === 'around') C().swing = Math.max(C().swing, every + 0.05);
      });
    }
    return true;
  }

  /** `afterimage`: the same strike again from where you stood (or stand), a beat later, at a share. */
  function afterimage(plan, a, origin) {
    const ai = plan.afterimage;
    if (!ai || plan.sub) return;
    const count = ai.count ?? 1;
    for (let k = 0; k < count; k++) {
      // 'end' is where you stand when the copy FIRES (after a dash, a leap or a walk), 'start' where you cast
      later((ai.delay ?? 0.5) * (k + 1), () => echoFrom(plan, a, ai.at === 'end' ? { x: C().x, z: C().z, yaw: C().yaw } : origin, ai.mult ?? 0.5));
    }
  }
  /**
   * One copy of a strike from somewhere else at a share: an afterimage, or a shade that mimics you
   * (P2 `mimic`). Melee and rings strike from `o`; a bolt, beam or dash throws at its target.
   */
  function echoFrom(plan, a, o, share) {
    {
      {
        const mult = plan.mult * share;
        env.spellfx.cast({ at: v3(o.x, groundY(o.x, o.z) + 0.6, o.z), element: 'shadow', ms: 260 });
        const opts = { power: mult, element: plan.element, skill: plan.skill?.id, rules: plan.rules ? { ...plan.rules, penBehind: plan.rules.penBehind || (plan.rules.afterimagePen ? 1 : 0) } : null, applyStatus: env.statusHook };
        let hits = [];
        if (plan.kind === 'melee') hits = F().strike({ x: o.x, z: o.z, yaw: o.yaw }, P(), { reach: plan.reach, arc: plan.arc, ...opts });
        else if (plan.kind === 'around') hits = F().strikeArea(o.x, o.z, plan.radius || 4, P(), { falloff: 0.6, ...opts });
        else if (plan.kind === 'ground' && plan.at) hits = F().strikeArea(plan.at.x, plan.at.z, plan.radius || 4, P(), { falloff: 0.6, ...opts });
        else {
          // a bolt, a beam or a dash: a thrown blade from the afterimage at whatever it was aimed at
          const target = plan._struck || aimedEnemy(a, plan.range || 20);
          if (target && target.dying == null) {
            env.uniqueEnv.arc?.({ x: o.x, z: o.z, y: groundY(o.x, o.z) + 1.2 }, target, plan.element);
            hits = F().strikeArea(target.x, target.z, 1.2, P(), { falloff: 1, ...opts });
          }
        }
        for (const h of hits) env.reportHit(h.enemy, h.result);
      }
    }
  }

  /**
   * TALENT_FX (plan §2.4): every talent a cast carries names ONE visual, and this is the one table
   * that turns the name into a spellfx call — so a talented spell LOOKS different without an effect
   * per node. `plan.talentFx` has been filled since round 11 and nothing drew it until now.
   */
  const TALENT_FX = {
    knock: (at, el) => env.spellfx.impact({ at, element: el, crit: true }),
    pull: (at, el) => env.spellfx.vortex?.({ at, radius: 2.5, element: el, ms: 400 }),
    leap: (at, el) => env.spellfx.footfall?.({ at, element: el }),
    swap: (at, el) => env.spellfx.cast({ at, element: 'arcane', ms: 300 }),
    trap: (at, el) => env.spellfx.footfall?.({ at, element: el }),
    post: (at, el) => env.spellfx.pillar?.({ at, radius: 0.8, element: el, ms: 400 }),
    zone: (at, el) => env.spellfx.aoe({ points: env.ringPoints(at.x, at.z, 3), element: el, stagger: 0.02 }),
    wall: (at, el) => env.spellfx.pillar?.({ at, radius: 1.5, element: el, ms: 400 }),
    link: (at) => env.spellfx.cast({ at, element: 'holy', ms: 300 }),
    ward: (at) => env.spellfx.cast({ at, element: 'holy', ms: 320 }),
    counter: (at) => env.spellfx.cast({ at, element: 'physical', ms: 260 }),
    afterimage: (at) => env.spellfx.cast({ at, element: 'shadow', ms: 300 }),
    stack: (at, el) => env.spellfx.impact({ at, element: el }),
    detonate: (at, el) => env.spellfx.impact({ at, element: el, crit: true }),
    tag: (at) => env.spellfx.cast({ at, element: 'arcane', ms: 260 }),
    summon: (at, el) => env.spellfx.cast({ at, element: el, ms: 420 }),
    form: (at, el) => env.spellfx.cast({ at, element: el, ms: 420 }),
    charge: (at) => env.spellfx.cast({ at, element: 'lightning', ms: 240 }),
  };
  function talentFx(plan, spot) {
    const list = plan.talentFx;
    if (!list?.length) return;
    const at = v3(spot.x, groundY(spot.x, spot.z) + 0.6, spot.z);
    for (const id of new Set(list)) (TALENT_FX[id] || ((p, el) => env.spellfx.cast({ at: p, element: el, ms: 240 })))(at, plan.element);
  }

  // ─────────────────────────────────────────── walls (P2)

  /** `wall`: a segment across the aim (or a ring), drawn as a low barrier, that js/actors.js obeys. */
  function raiseWall(plan, spot, a) {
    const w = plan.wall;
    const c = C();
    const at = plan.kind === 'ground' || plan.kind === 'bolt' ? spot : { x: c.x + a.dx * (w.distance ?? 4), z: c.z + a.dz * (w.distance ?? 4) };
    const seconds = w.seconds ?? 8;
    const hp = w.hp ? Math.round((P().maxHp || 100) * w.hp) : null;
    let wall;
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: POST_TINT[plan.element] ?? 0xd8dcea, transparent: true, opacity: 0.55 });
    if (w.ring) {
      const r = w.radius ?? 6;
      wall = addWall({ ring: { x: at.x, z: at.z, r }, left: seconds, hp, blocksMove: w.blocksMove !== false, blocksRanged: !!w.blocksRanged, owner: plan.skill?.id });
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.4, 40, 1, true), mat);
      ring.position.y = 0.7;
      group.add(ring);
      group.position.set(at.x, groundY(at.x, at.z), at.z);
    } else {
      const L = w.length ?? 6;
      const px = -a.dz, pz = a.dx;
      wall = addWall({ x1: at.x - px * L / 2, z1: at.z - pz * L / 2, x2: at.x + px * L / 2, z2: at.z + pz * L / 2, left: seconds, hp, blocksMove: w.blocksMove !== false, blocksRanged: !!w.blocksRanged, owner: plan.skill?.id });
      const box = new THREE.Mesh(new THREE.BoxGeometry(L, 1.4, 0.4), mat);
      box.position.set(0, 0.7, 0);
      group.add(box);
      group.position.set(at.x, groundY(at.x, at.z), at.z);
      group.rotation.y = Math.atan2(px, pz) + Math.PI / 2;
    }
    env.scene.add(group);
    wall.mesh = group;
    // a wall that taunts what strikes it (Rampart) takes their attention
    if (w.taunt) for (const e of F().near(at.x, at.z, (w.length ?? 6) + 2)) F().taunt(e, Object.assign(wall, { placed: true, x: at.x, z: at.z }), w.taunt);
    log(`${plan.skill?.name}: a wall stands for ${seconds}s.`, 'good');
  }

  // ─────────────────────────────────────────── bolts: ricochet, split, returns

  /** After a bolt bursts at `at`: ricochet off the body it hit, split into shards, fly back. */
  function afterBolt(plan, at, hits, opts, hop = 0) {
    if (hop) return;
    const field = F();
    const struck = hits.find(h => h.result?.amount > 0)?.enemy || null;
    if (struck) plan._struck = struck;
    const used = new Set(hits.map(h => h.enemy));
    const jump = (from, keep, n, range) => {
      let cur = from;
      for (let i = 0; i < n; i++) {
        const next = field.nearestTo(cur.x, cur.z, range, null);
        if (!next || used.has(next)) {
          const alt = (field.near(cur.x, cur.z, range) || []).find(e => !used.has(e));
          if (!alt) break;
          cur = hit(cur, alt, keep);
        } else cur = hit(cur, next, keep);
      }
    };
    const hit = (from, e, keep) => {
      used.add(e);
      env.uniqueEnv.arc?.({ x: from.x, z: from.z, y: (from.y ?? groundY(from.x, from.z)) + 1 }, e, plan.element);
      field.strikeArea(e.x, e.z, 1.1, P(), { ...opts, falloff: 1, power: (opts.power ?? plan.mult) * keep });
      return e;
    };
    if (plan.ricochet && struck) jump(struck, plan.ricochet.keep ?? 0.6, plan.ricochet.bounces ?? 1, plan.ricochet.range ?? 8);
    const sp = plan.split;
    if (sp) {
      const when = sp.when || 'hit';
      const ok = when === 'hit' ? !!struck
        : when === 'kill' ? hits.some(h => h.result?.dead)
          : when.startsWith('tag:') ? hits.some(h => h.enemy.statuses?.[when.slice(4)]) : false;
      if (ok) {
        const center = { x: at.x, z: at.z, y: at.y };
        const near = (field.near(at.x, at.z, sp.range ?? 8) || []).filter(e => !used.has(e)).slice(0, sp.shards ?? 2);
        for (const e of near) hit(center, e, sp.keep ?? 0.5);
      }
    }
    if (plan.returns) {
      const keep = typeof plan.returns === 'number' ? plan.returns : plan.returns.keep ?? 0.8;
      const from = v3(at.x, at.y, at.z);
      const to = v3(C().x, C().y + 1.1, C().z);
      const ms = Math.max(120, from.distanceTo(to) / 40 * 1000);
      env.spellfx.projectile({ from, to, element: plan.element, ms }).then(() => {
        // each body on the way back is struck once (`opts.onHit` reports it)
        field.strikeSegment(from.x, from.z, to.x, to.z, 1.4, P(), { ...opts, falloff: 1, power: (opts.power ?? plan.mult) * keep });
      }).catch(() => {});
    }
  }

  // ─────────────────────────────────────────── after a cast: the self-ish keys

  const castX = ctx => ctx.origin?.x ?? C().x;
  const castZ = ctx => ctx.origin?.z ?? C().z;
  function afterCast(plan, ctx = {}) {
    const p = P(), c = C(), field = F(), pets = PETS();
    const a = ctx.a || env.aim();
    const spot = ctx.spot || plan.at || { x: c.x, z: c.z };
    const hitsN = plan._hits || 0;

    // taunt: everything near you (or the target) attacks you / the post / the decoy
    if (plan.taunt) {
      const t = plan.taunt;
      const secs = t.seconds ?? 3;
      const list = t.target ? [aimedEnemy(a, plan.range || 20)].filter(Boolean) : field.near(c.x, c.z, t.radius ?? 8);
      let n = 0;
      const wolves = (pets?.pets || []).filter(x => x.dying == null && !x.decoy);
      for (const e of list) {
        if (t.only === 'ranged' && !e.ranged) continue;
        if (t.by === 'pet') {
          const near = wolves.sort((x, y) => Math.hypot(x.x - e.x, x.z - e.z) - Math.hypot(y.x - e.x, y.z - e.z))[0];
          if (near) field.taunt(e, near, secs);
          else continue;
        } else field.taunt(e, 'player', secs);
        n++;
      }
      if (n) {
        log(`${n} ${n === 1 ? 'enemy turns' : 'enemies turn'} on you for ${secs}s.`, 'good');
        // War Cry: +5% Might per enemy taunted, cap +25% (`tauntBonus`)
        if (t.perTaunt && p.statuses?.[plan.status]) {
          const st = p.statuses[plan.status];
          st.damage = (st.damage || 0) + Math.min(t.perTauntCap ?? 0.25, t.perTaunt * n);
        }
        if (t.barrierPer) { const b = Math.round(p.maxHp * Math.min(0.35, t.barrierPer * n)); p.barrier = Math.max(p.barrier || 0, b); p.castBarrierFor = Math.max(p.castBarrierFor || 0, 6); }
      }
    }
    if (plan.command && pets) {
      const cm = plan.command;
      const target = aimedEnemy(a, plan.range || 40) || field.nearestTo(c.x, c.z, 20);
      const n = pets.order(cm.order || 'focus', target, { seconds: cm.seconds ?? 6, petOnly: !!cm.petOnly, from: { x: c.x, z: c.z } });
      if (!n) log('No follower to give the order to.', '');
      if (cm.biteStatus) for (const pet of pets.pets) if (pet.order) { pet.biteStatus = cm.biteStatus; later(cm.seconds ?? 6, () => { if (pet.biteStatus === cm.biteStatus) pet.biteStatus = null; }); }
      // `command.gain`: while the order lasts, each of their hits gives you a class resource
      if (cm.gain) for (const pet of pets.pets) if (pet.order) { pet.resourceOnHit = cm.gain; later(cm.seconds ?? 6, () => { if (pet.resourceOnHit === cm.gain) pet.resourceOnHit = null; }); }
    }
    if (plan.summon && typeof plan.summon === 'object' && pets) summonFrom(plan, spot, a);
    if (plan.barrier && typeof plan.barrier === 'object') {
      const b = plan.barrier;
      const worth = b.of === 'paid' ? (plan.hpPaid || 0) : Math.round(p.maxHp * (b.share ?? 0.2));
      p.barrier = Math.max(p.barrier || 0, worth);
      p.castBarrierFor = b.seconds ?? 6;
      if (b.pets) pets?.barrierAll?.(worth, b.seconds ?? 6);
      log(`A barrier worth ${worth} holds for ${b.seconds ?? 6}s.`, 'good');
    }
    if (plan.healPets) {
      const share = typeof plan.healPets === 'number' ? plan.healPets : plan.healPets.share;
      for (const pet of pets?.pets || []) if (pet.dying == null) pet.hp = Math.min(pet.maxHp, pet.hp + Math.round(pet.maxHp * share));
    }
    if (plan.overflowBarrier && plan.heal) {
      const over = Math.max(0, (ctx.hpBefore ?? p.hp) + plan.heal - p.maxHp);
      if (over > 0) { p.barrier = Math.max(p.barrier || 0, Math.min(Math.round(p.maxHp * plan.overflowBarrier), over)); p.castBarrierFor = 8; }
    }
    if (plan.revive && pets) {
      const share = typeof plan.revive === 'number' ? plan.revive : plan.revive.share ?? 0.5;
      pets.reviveAll(share, { x: c.x, z: c.z, ...p }).then(back => { if (back.length) log(`${back.length} fallen ${back.length === 1 ? 'follower rises' : 'followers rise'}.`, 'good'); });
    }
    if (plan.cleanse) {
      const cl = plan.cleanse;
      cleanseUnit(p, cl.count ?? 1, cl.types || null);
      if (cl.pets) pets?.cleanseAll?.(cl.count ?? 1);
    }
    if (plan.link) startLink(plan, a);
    if (plan.selfBuff) {
      const b = plan.selfBuff;
      const id = `buff:${plan.skill?.id || 'skill'}`;
      if (!b.petsOnly) env.rpgApply(p, id, { name: b.name || plan.skill?.name || 'Buff', kind: 'buff', element: plan.element, ...b, seconds: b.seconds ?? 8 });
      if (b.pets || b.petsOnly) for (const pet of pets?.pets || []) if (pet.dying == null) env.rpgApply(pet, id, { name: b.name || 'Buff', kind: 'buff', ...b, seconds: b.seconds ?? 8 });
      // Shared Burden: followers near you get a share of the guard
      if (b.petsShare) {
        for (const pet of pets?.pets || []) {
          if (pet.dying == null && Math.hypot(pet.x - c.x, pet.z - c.z) <= 8) {
            const rf = b.resistPerFoe ? { ...b.resistPerFoe, per: (b.resistPerFoe.per ?? 0.06) * b.petsShare, cap: (b.resistPerFoe.cap ?? 0.36) * b.petsShare } : null;
            env.rpgApply(pet, id, { name: b.name || 'Buff', kind: 'buff', seconds: b.seconds ?? 8, resistPerFoe: rf, resist: (b.resist || 0) * b.petsShare });
          }
        }
      }
      if (b.movePct || b.hastePct || b.armorPct || b.maxHpPct) p.mechDirty = true;
      tracked.push({ unit: p, id, onEnd: b.onEnd || null, plan, store: !!b.storeShare, radius: b.storeRadius ?? 6, dirty: !!(b.movePct || b.hastePct || b.armorPct || b.maxHpPct) });
    }
    if (plan.counter) {
      const id = `counter:${plan.skill?.id || 'skill'}`;
      env.rpgApply(p, id, { name: plan.skill?.name || 'Counter', kind: 'buff', element: plan.element, seconds: plan.counter.window ?? 1.5, counter: { ...plan.counter, hitsLeft: plan.counter.hits ?? 1, taken: 0 }, ccImmune: !!plan.counter.ccImmune, skill: plan.skill?.id });
      tracked.push({ unit: p, id, plan, counter: true });
    }
    if (plan.ward) {
      const w = plan.ward;
      const give = u => env.rpgApply(u, `ward:${plan.skill?.id}`, { name: plan.skill?.name || 'Ward', kind: 'buff', element: plan.element, seconds: w.seconds ?? 10, ward: { charges: w.charges ?? 1, threshold: w.threshold ?? null, cap: w.cap ?? null } });
      give(p);
      if (w.pets) for (const pet of pets?.pets || []) if (pet.dying == null) give(pet);
    }
    if (plan.imbue) {
      const im = plan.imbue;
      p.imbue = { ...im, left: im.seconds ?? 10, count: 0, element: im.element || null, statusSpec: im.status ? statusSpec(im.status) : null };
      log(`${plan.skill?.name}: your attacks change for ${im.seconds ?? 10}s.`, 'good');
    }
    if (plan.place && plan.kind !== 'ground' && !plan.dash) {
      const follow = plan.place.follow === 'self' ? 'self' : plan.place.follow === 'target' ? aimedEnemy(a, plan.range || 30) : null;
      const at = plan.place.follow === 'self' || plan.kind === 'self' || plan.kind === 'around' ? { x: c.x, z: c.z } : spot;
      place(plan, plan.place, at.x, at.z, follow);
    } else if (plan.place && plan.kind === 'ground') {
      const follow = plan.place.follow === 'target' ? aimedEnemy(a, plan.range || 30) : null;
      place(plan, plan.place, spot.x, spot.z, follow);
    }
    if (plan.pool && !plan.line) {
      const spec = poolSpec({ element: plan.element, ...plan.pool });
      if (plan.pool.along === 'beam' || (plan.kind === 'beam' && plan.pool.along !== false)) {
        // a fissure: one zone every 3 m along the beam
        for (let t = 2; t <= (plan.range || 18); t += 3) place(plan, { ...spec, radius: plan.pool.radius ?? Math.max(1.2, (plan.width || 2) * 0.6) }, castX(ctx) + a.dx * t, castZ(ctx) + a.dz * t);
      } else {
        const ahead = plan.pool.at === 'ahead' ? { x: c.x + Math.sin(c.yaw) * (plan.reach || 3), z: c.z + Math.cos(c.yaw) * (plan.reach || 3) } : null;
        const at = ahead || (plan.kind === 'ground' ? spot : plan.kind === 'bolt' && plan._struck ? { x: plan._struck.x, z: plan._struck.z } : { x: c.x, z: c.z });
        place(plan, spec, at.x, at.z);
      }
    }
    // `burst`: a ring around you on cast (a shout's weaken, a shape's spore cloud)
    if (plan.burst) {
      const b = plan.burst;
      const r = b.radius ?? 6;
      if (b.mult) burst(plan, c.x, c.z, r, b.mult, { element: b.element || null, knock: b.knock || null, heal: b.heal || 0, status: null });
      else if (b.heal) healAllies(b.heal, { x: c.x, z: c.z, r });
      if (b.statuses) {
        for (const e of field.near(c.x, c.z, r)) {
          for (const ref of [].concat(b.statuses)) {
            const rr = statusRef(ref);
            const ctl = controlFor(e, rr.id, rr.seconds ?? statusSpec(rr.id)?.seconds ?? 4);
            env.landStatus(ctl.id, { ...statusSpec(ctl.id), ...(ctl.id === rr.id ? rr : {}), seconds: ctl.seconds, ...(ctl.slow ? { slow: ctl.slow } : {}) }, e, Math.max(1, (plan.damage || 10) * 0.35));
          }
        }
        if (!b.mult) env.spellfx.aoe({ points: env.ringPoints(c.x, c.z, r), element: b.element || plan.element, stagger: 0.02 });
      }
      if (b.knock && !b.mult) for (const e of field.near(c.x, c.z, r)) env.uniqueEnv.push(e, c.x, c.z, typeof b.knock === 'number' ? b.knock : b.knock.push || 0);
    }
    // `again`: the whole cast goes off a second time, a beat later
    if (plan.again && !plan.sub) {
      const g = plan.again;
      const k = g.mult ?? 1;
      later(g.delay ?? 2, () => env.castSkill({ ...plan, again: null, sub: true, afterimage: null, mult: plan.mult * k, damage: Math.round(plan.damage * k) }, { echo: true }));
    }
    if (plan.empowerNext?.pets) for (const pet of pets?.pets || []) pet.empowered = Math.max(pet.empowered || 0, plan.empowerNext.mult ?? 0.5);
    if (plan.empowerRepeat) {
      const er = plan.empowerRepeat;
      for (let k = 1; k < er.count; k++) later(0.3 * k, () => env.castSkill({ ...plan, empowerRepeat: null, mult: plan.mult * er.mult, damage: Math.round(plan.damage * er.mult), sub: true }, { echo: true }));
    }
    if (plan.rewind) doRewind(plan.rewind);
    // `dashWith` on a skill that does not move you: followers within 15 m form up around you
    if (plan.dashWith && plan.kind !== 'dash') PETS()?.bringAlong?.({ x: c.x, z: c.z }, { x: c.x, z: c.z }, 15);
    if (plan.corpseBurst) corpseBurst(plan, spot);
    if (plan.clusters && plan.kind === 'ground') clusterStrikes(plan, spot);
    // `allyStatus`: a status on your followers (the nearest to your aim, or all of them)
    if (plan.allyStatus) {
      const as = plan.allyStatus;
      const list = as.target === 'all' ? (pets?.pets || []).filter(x => x.dying == null) : [aimedFollower(a, plan.range || 30)].filter(Boolean);
      const r = statusRef(as.status);
      for (const u of list) env.rpgApply(u, r.id, { ...statusSpec(r.id), ...r, seconds: as.seconds ?? r.seconds ?? statusSpec(r.id)?.seconds ?? 4 });
      if (as.self) env.rpgApply(p, r.id, { ...statusSpec(r.id), ...r, seconds: as.seconds ?? 4 });
    }
    if (plan.resetOn && String(plan.resetOn.when || plan.resetOn).startsWith('crowd')) {
      const need = +String(plan.resetOn.when || plan.resetOn).split(':')[1] || 5;
      if (hitsN >= need) queue(p, { reset: plan.skill?.id });
    }
    afterimage(plan, a, ctx.origin || { x: c.x, z: c.z, yaw: c.yaw });
    if (plan.wall) raiseWall(plan, spot, a);
    if (!plan.sub) talentFx(plan, spot);
    // P2 `mimic`: every summoned copy that mimics you repeats this cast from where it stands
    if (!plan.sub && plan.kind !== 'form') {
      for (const pet of pets?.pets || []) {
        if (pet.dying != null || !pet.mimic) continue;
        later(0.15, () => { if (pet.dying == null) echoFrom(plan, a, { x: pet.x, z: pet.z, yaw: pet.facing || c.yaw }, pet.mimic); });
      }
    }
  }

  /** `summon` (the object form): temporary, a decoy, at corpses, with a burst when it ends. */
  function summonFrom(plan, spot, a) {
    const s = plan.summon, pets = PETS(), p = P(), c = C();
    registerTemps();
    const def = s.def || plan.pet || 'shade';
    let count = s.count ?? 1;
    let at = s.at === 'aim' ? spot : { x: c.x, z: c.z };
    let corpses = null;
    if (s.at === 'corpses') {
      const found = takeCorpses(spot.x ?? c.x, spot.z ?? c.z, s.radius ?? 12, s.maxCorpses ?? count);
      if (found.length) at = found[0];
      corpses = found;
      count = s.perCorpse ? Math.min(s.max ?? 8, found.reduce((n, x) => n + x.worth, 0) + (s.plus || 0)) : count;
      if (!found.length && s.needsCorpse) { log('There is no corpse near enough.', ''); return; }
    }
    const look = (def === 'phantom_decoy' || def === 'shade') ? { avatar: JSON.parse(JSON.stringify(env.playerLook?.()?.avatar || {})) } : null;
    pets.summon(def, p, {
      count, at, temporary: s.temporary !== false && !!(s.temporary || s.lifetime || s.decoy), lifetime: s.lifetime || 10,
      decoy: s.decoy || null, burstOnExpire: s.burstOnExpire || null, look, heal: s.heal || null, taunt: s.decoy ? (s.decoy.taunt ?? 4) : (s.taunt || 0),
    }).then(made => {
      for (const [i, u] of made.entries()) {
        // each one rises from its own corpse, not all of them from the first
        const cp = corpses?.[i];
        if (cp) { u.x = cp.x + (i % 2 ? 0.4 : -0.4); u.z = cp.z; u.y = groundY(u.x, u.z); u.actor?.group?.position.set(u.x, u.y, u.z); }
        if (s.hpMult) { u.maxHp = Math.round(u.maxHp * s.hpMult); u.hp = u.maxHp; }
        if (s.biteStatus) u.biteStatus = s.biteStatus;
        if (s.mimic || plan.mimic) u.mimic = (s.mimic || plan.mimic).mult ?? 0.4;
        u.fromPlan = plan;
      }
      if (made.length) log(`${made[0].name}${made.length > 1 ? ` x${made.length}` : ''} ${s.decoy ? 'draws them in' : 'answers'}.`, 'good');
      else if (made.refused) log(made.refused, 'bad');
    });
  }

  /**
   * `clusters` (Fallstone): besides the main strike, one smaller strike for `mult` on each OTHER
   * group of at least `min` enemies within `range` of you — grouped greedily, `radius` across.
   */
  function clusterStrikes(plan, spot) {
    const c = plan.clusters;
    const r = c.radius ?? plan.radius ?? 5;
    const left = F().near(C().x, C().z, c.range ?? 30).filter(e => Math.hypot(e.x - spot.x, e.z - spot.z) > (plan.radius || 5));
    const used = new Set();
    let n = 0;
    for (const e of left) {
      if (used.has(e) || n >= (c.max ?? 4)) continue;
      const group = left.filter(o => !used.has(o) && Math.hypot(o.x - e.x, o.z - e.z) <= r);
      if (group.length < (c.min ?? 2)) continue;
      for (const g of group) used.add(g);
      const x = group.reduce((t, g) => t + g.x, 0) / group.length, z = group.reduce((t, g) => t + g.z, 0) / group.length;
      later(0.25 + n * 0.15, () => {
        env.spellfx.pillar?.({ at: v3(x, groundY(x, z), z), radius: r, element: plan.element, ms: 600 });
        const hits = F().strikeArea(x, z, r, P(), { power: plan.mult * (c.mult ?? 0.4), element: plan.element, falloff: 0.6, rules: plan.rules, skill: plan.skill?.id, applyStatus: env.statusHook });
        for (const h of hits) env.reportHit(h.enemy, h.result);
      });
      n++;
    }
    return n;
  }

  /**
   * `corpseBurst`: every corpse within `radius` of where you aim (up to `max`) explodes where IT
   * lies, for `mult` each within `burst` m. With none, a follower may give `fallback` of its health
   * to explode instead (Corpse Pyre's thrall).
   */
  function corpseBurst(plan, spot) {
    const cb = plan.corpseBurst;
    const found = takeCorpses(spot.x, spot.z, cb.radius ?? 10, cb.max ?? 5);
    for (const [i, cp] of found.entries()) later(i * 0.12, () => burst(plan, cp.x, cp.z, cb.burst ?? 4, (cb.mult ?? 1) * (cp.worth || 1), { element: cb.element || null, status: cb.status || null }));
    if (!found.length && cb.fallback) {
      const pet = (PETS()?.pets || []).filter(x => x.dying == null && !x.decoy && Math.hypot(x.x - spot.x, x.z - spot.z) <= (cb.radius ?? 10))[0];
      if (pet) {
        pet.hp = Math.max(1, pet.hp - Math.round(pet.maxHp * cb.fallback));
        burst(plan, pet.x, pet.z, cb.burst ?? 4, cb.mult ?? 1, { element: cb.element || null });
      } else log('There is no corpse near enough.', '');
    } else if (!found.length) log('There is no corpse near enough.', '');
    return found.length;
  }

  // ─────────────────────────────────────────── links (Sworn Guard, Sworn Ward, Thread of Fate)

  let link = null;
  function startLink(plan, a) {
    const l = plan.link;
    const range = l.range ?? 24;
    let to = null;
    if (l.to === 'enemy') to = aimedEnemy(a, range);
    else to = aimedFollower(a, range) || (PETS()?.pets || []).filter(x => x.dying == null && !x.decoy).sort((x, y) => Math.hypot(x.x - C().x, x.z - C().z) - Math.hypot(y.x - C().x, y.z - C().z))[0] || null;
    if (!to) { log(l.to === 'enemy' ? 'Nothing to link to.' : 'No follower to link to.', ''); return; }
    link = { to, kind: l.to || 'follower', share: l.share ?? 0.4, threshold: l.threshold ?? null, left: l.seconds ?? 8, range, gainPer: l.gainPer || null, healEach: l.healEach || 0 };
    env.spellfx?.status?.(to.actor?.group, 'rally', true);
    log(`${plan.skill?.name}: linked to ${to.name} for ${link.left}s.`, 'good');
  }
  function endLink() {
    if (!link) return;
    env.spellfx?.status?.(link.to.actor?.group, 'rally', false);
    link = null;
  }

  // ─────────────────────────────────────────── hits taken

  /**
   * A hit on the player or a follower has resolved (js/rpg.js strike put `mechEvents` on it):
   * answer a counter, release a shockwave, return a reflect, move a share across a link.
   */
  function onHurt(result, attacker, victim) {
    const p = P(), field = F();
    if (!result) return;
    for (const ev of result.mechEvents || []) {
      switch (ev.kind) {
        case 'counter': {
          const c = ev.spec;
          if (c.answer && attacker && attacker.dying == null) {
            const plan = (c.planRef) || { mult: 1, baseMult: 1, element: 'physical', skill: { id: ev.skill } };
            const res = env.rpg.strike(p, attacker, field.rng, { multiplier: (c.answer.mult ?? 1) * (c.scale ?? 1), element: c.answer.element || 'physical', skill: ev.skill, applyStatus: env.statusHook });
            field.land(attacker, res, { strike: knockShape(c.answer.knock), fromX: C().x, fromZ: C().z, element: 'physical' });
            env.reportHit(attacker, res);
            if (res.dead) field.kill(attacker);
            env.spellfx.impact({ at: v3(attacker.x, attacker.y + 0.9, attacker.z), element: 'physical', crit: true });
            void plan;
          }
          if (c.tauntAttacker && attacker) field.taunt(attacker, 'player', c.tauntAttacker);
          if (c.gain) gainResource(p, c.gain.resource, c.gain.n ?? 1);
          if (c.heal) p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * c.heal));
          log('Countered.', 'good');
          break;
        }
        case 'ward': env.spellfx.impact({ at: v3(victim === p ? C().x : victim.x, (victim === p ? C().y : victim.y) + 1, victim === p ? C().z : victim.z), element: 'holy' }); if (victim === p) log(`A ward takes the hit (${ev.negated}).`, 'good'); break;
        case 'evade': if (victim === p) log('Evaded.', 'good'); break;
        case 'burst': {
          const b = ev.spec;
          const at = victim === p ? { x: C().x, z: C().z } : { x: victim.x, z: victim.z };
          const hits = field.strikeArea(at.x, at.z, b.radius ?? 4, p, { power: (b.mult ?? 0.8) * (b.scale ?? 1), element: b.element || 'physical', falloff: 0.6, proc: true, knock: knockShape(b.knock) });
          for (const h of hits) env.reportHit(h.enemy, h.result);
          env.spellfx.aoe({ points: env.ringPoints(at.x, at.z, b.radius ?? 4), element: b.element || 'physical', stagger: 0.02 });
          if (b.taunt) for (const h of hits) field.taunt(h.enemy, 'player', b.taunt);
          break;
        }
        case 'reflect':
          if (ev.attacker && ev.amount > 0 && ev.attacker.dying == null) {
            ev.attacker.hp = Math.max(0, ev.attacker.hp - ev.amount);
            field.credit?.(ev.attacker, ev.amount);
            if (ev.attacker.hp <= 0) field.kill(ev.attacker);
          }
          break;
        case 'deathPrevented': if (victim === p) log('Something holds you up at 1 health.', 'level'); break;
        default: break;
      }
    }
    // a tag that pays you when the tagged body hits you or a follower (the Demon Hunter's Brand)
    if (result.amount > 0 && attacker?.statuses) {
      for (const st of Object.values(attacker.statuses)) if (st.kind === 'tag' && st.gainOnHurt) gainResource(p, st.gainOnHurt.id, st.gainOnHurt.n ?? 1);
    }
    // a resource that fills when you are hit (`resource.gainPer: 'hurt'`)
    if (victim === p && result.amount > 0) {
      for (const s of env.skills()?.slots || []) if (s.resource?.gainPer === 'hurt') gainResource(p, s.resource.id, s.resource.gain ?? 1);
    }
    // links: a follower's hit is partly yours; your hit is partly the linked enemy's
    if (link && result.amount > 0) {
      if (link.kind !== 'enemy' && victim === link.to) {
        let moved = Math.round(result.amount * link.share);
        if (link.threshold != null) moved = Math.max(0, result.amount - Math.round(victim.maxHp * link.threshold));
        if (moved > 0) {
          victim.hp = Math.min(victim.maxHp, victim.hp + moved);
          p.hp = Math.max(1, p.hp - moved);
          if (link.gainPer) { const st = p.statuses?.[link.gainPer.status]; if (st) st.damage = Math.min(link.gainPer.cap ?? 0.25, (st.damage || 0) + (link.gainPer.per ?? 0.05)); }
        }
      } else if (link.kind === 'enemy' && victim === p && link.to.dying == null) {
        const moved = Math.round(result.amount * link.share);
        link.to.hp = Math.max(0, link.to.hp - moved);
        field.credit?.(link.to, moved);
        if (link.to.hp <= 0) field.kill(link.to);
      }
    }
    // a temporary summon that bursts when it falls as well as when it runs out (Puffball Brood)
    if (victim?.temporary && result.dead && victim.burstOnExpire && !victim.burst) { victim.burst = true; petHooks.onExpire(victim); }
    // a decoy that puts its attacker to sleep (Phantasm)
    if (victim?.decoy && victim.fromPlan?.summon?.decoy?.onStruck && attacker) {
      const r = statusRef(victim.fromPlan.summon.decoy.onStruck);
      const ctl = controlFor(attacker, r.id, r.seconds ?? 2);
      env.landStatus(ctl.id, { ...statusSpec(ctl.id), ...r, seconds: ctl.seconds }, attacker, 1);
    }
  }

  // ─────────────────────────────────────────── kills

  function onKill(e) {
    const p = P();
    // EVERY death leaves a corpse for 20 s (necromancer skills spend them)
    addCorpse(e.x, e.z, 1);
    // Gnawed jumps on when its host dies
    const g = e.statuses?.gnawed;
    if (g && g.remaining > 0) {
      const next = F().nearestTo(e.x, e.z, statusSpec('gnawed')?.onDeath?.jump ?? 8, e);
      if (next) { next.statuses = next.statuses || {}; next.statuses.gnawed = { ...g }; env.spellfx?.status?.(next.actor?.group, 'curse', true); }
    }
    // Fenrunner's Apex: a kill while in the shape Hastens you (stacks a little longer each time)
    const sh = formOf(p, 'shape');
    if (sh?.spec?.onKillHaste && (e.playerDamage || 0) > 0) {
      sh.apex = Math.min(3, (sh.apex || 0) + 1);
      env.rpgApply(p, 'haste', { ...statusSpec('haste'), seconds: sh.spec.onKillHaste * sh.apex });
    }
    // a self buff with its own on-kill rider (`selfBuff.onKill`), whatever made the kill
    if ((e.playerDamage || 0) > 0) {
      for (const st of Object.values(p.statuses || {})) {
        const k = st.onKill;
        if (!k || typeof k !== 'object') continue;
        if (k.heal) p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * k.heal));
        if (k.mana) p.mp = Math.min(p.maxMp, p.mp + Math.round(p.maxMp * k.mana));
        if (k.resource) gainResource(p, k.resource.id, k.resource.n ?? 1);
        if (k.haste) env.rpgApply(p, 'haste', { ...statusSpec('haste'), seconds: k.haste });
        if (k.reset) queue(p, { reset: k.reset });
      }
    }
    const rules = e.killedBy;
    if (!rules) return;
    e.killedBy = null;
    const k = rules.onKill;
    const slot = env.skills()?.slots?.find(s => s.id === rules.skill);
    const plan = { mult: 1, baseMult: 1, element: e.element || 'physical', skill: { id: rules.skill }, rules };
    if (rules.resetOn && String(rules.resetOn.when || rules.resetOn) === 'kill') queue(p, { reset: rules.skill });
    if (!k) return;
    if (k.corpse) addCorpse(e.x, e.z, (k.corpse.worth ?? 2) - 1);
    if (k.burst) burst({ ...plan, mult: rules.scale || 1 }, e.x, e.z, k.burst.radius ?? 3, k.burst.mult ?? 1, { element: k.burst.element || null });
    if (k.spread) {
      for (const other of F().near(e.x, e.z, k.spread.radius ?? 5, e)) {
        for (const t of k.spread.types || []) {
          const st = e.statuses?.[t];
          if (st) { other.statuses = other.statuses || {}; other.statuses[t] = { ...st }; env.spellfx?.status?.(other.actor?.group, t, true); }
        }
      }
    }
    if (k.reset) queue(p, { reset: rules.skill });
    if (k.refund && slot) queue(p, { cut: { skill: rules.skill, seconds: env.skills().cooldownFor(slot) * k.refund } });
    if (k.heal) p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * k.heal));
    if (k.mana) p.mp = Math.min(p.maxMp, p.mp + Math.round(p.maxMp * k.mana));
    if (k.gold) p.gold = (p.gold || 0) + k.gold;
    if (k.tag) {
      const next = F().nearestTo(e.x, e.z, 12, e);
      if (next) { next.statuses = next.statuses || {}; next.statuses[k.tag.id] = { type: k.tag.id, kind: 'tag', name: statusSpec(k.tag.id)?.name || k.tag.id, remaining: k.tag.seconds ?? 6, power: 1, ...(statusSpec(k.tag.id) || {}) }; }
    }
    if (k.pool) place(plan, poolSpec({ element: k.pool.element || 'poison', ...k.pool }), e.x, e.z);
    if (k.haste) env.rpgApply(p, 'haste', { ...statusSpec('haste'), seconds: k.haste });
  }

  // ─────────────────────────────────────────── forms: bodies, basics, entering and leaving

  const bodies = {};
  let shownBody = null, hidActor = false;
  async function bodyFor(form) {
    const b = form.spec?.body;
    if (!b?.creature) return null;
    if (bodies[form.id] !== undefined) return bodies[form.id];
    bodies[form.id] = null;
    // an unknown creature would be quietly drawn as some default beast — call it a failed build
    if (!CREATURE_TYPES[b.creature]) { bodyFailed[form.id] = true; return null; }
    try {
      const actor = await env.makeActor({ creature: { type: b.creature, size: (b.scale ?? 1) * (b.size ?? 1.3), colors: b.colors || (b.tint ? { body: b.tint } : undefined) } });
      actor.group.visible = false;
      env.scene.add(actor.group);
      bodies[form.id] = actor;
    } catch { bodies[form.id] = null; }
    if (!bodies[form.id]) bodyFailed[form.id] = true;
    return bodies[form.id];
  }

  /** Each frame: draw the shape's body in place of the humanoid, if a shape with a body is on. */
  function placeBody(dt) {
    const f = formOf(P(), 'shape');
    const body = f ? bodies[f.id] : null;
    if (f && body === undefined) bodyFor(f);
    const actor = env.actor();
    if (f && body) {
      if (shownBody && shownBody !== body) shownBody.group.visible = false;
      shownBody = body;
      body.group.visible = true;
      body.group.position.set(C().x, C().y, C().z);
      body.group.rotation.y = C().yaw;
      const moving = C().moving > 0.15;
      env.setActorAnim(body, C().swing > 0 ? 'attack' : moving ? (C().running ? 'run' : 'walk') : 'idle');
      body.update?.(dt);
      if (actor && actor.group.visible) { actor.group.visible = false; hidActor = true; }
    } else {
      if (shownBody) { shownBody.group.visible = false; shownBody = null; }
      if (hidActor && actor) { actor.group.visible = true; hidActor = false; }
    }
    // no creature to draw (its build FAILED): the humanoid is tinted the shape's colour instead
    tintActor(actor, f && body === null && bodyFailed[f.id] ? (f.spec?.body?.tint || f.spec?.body?.colors?.body || '#6b8f4a') : null);
  }
  const bodyFailed = {};
  let tinted = null;
  /** Tint (or un-tint) every material on the humanoid, remembering the colours to put back. */
  function tintActor(actor, color) {
    if (!actor?.group || tinted === color) return;
    actor.group.traverse(o => {
      const mats = o.material ? [].concat(o.material) : [];
      for (const mt of mats) {
        if (!mt.color) continue;
        if (mt.userData.r28base === undefined) mt.userData.r28base = mt.color.getHex();
        if (color) mt.color.set(mt.userData.r28base).lerp(new THREE.Color(color), 0.55);
        else mt.color.setHex(mt.userData.r28base);
      }
    });
    tinted = color;
  }

  /** The form's basic attack instead of the weapon's pattern. Returns true when it took the swing. */
  function basicAttack(hand) {
    const f = formOf(P(), 'shape');
    const b = f?.spec?.basic;
    if (!b || hand === 'off') return !!b;
    const c = C(), field = F(), p = P();
    const plan = { mult: b.mult ?? 1, baseMult: b.mult ?? 1, element: b.element || 'nature', skill: { id: `form:${f.id}` } };
    if (b.shape === 'bolt') {
      const spot = env.groundTarget(b.range ?? 14);
      const from = v3(c.x, c.y + 1.2, c.z), to = v3(spot.x, spot.y + 0.3, spot.z);
      env.spellfx.projectile({ from, to, element: plan.element, ms: Math.max(160, from.distanceTo(to) / 22 * 1000) }).then(() => {
        const sts = [...(b.status ? [b.status] : []), ...[].concat(b.statuses || [])];
        const hits = field.strikeArea(spot.x, spot.z, b.splash ?? 1.5, p, { power: b.mult ?? 0.7, element: plan.element, falloff: 0.7, applyStatus: env.statusHook, rules: sts.length ? { skill: plan.skill.id, statuses: sts } : null });
        for (const h of hits) env.reportHit(h.enemy, h.result);
        if (b.healAllies) healAllies(b.healAllies, { x: spot.x, z: spot.z, r: b.splash ?? 1.5 });
        env.spellfx.impact({ at: to, element: plan.element });
      }).catch(() => {});
    } else {
      const hitsN = b.hits ?? 1;
      for (let k = 0; k < hitsN; k++) {
        later(k * 0.16, () => {
          env.fx?.swipe?.({ x: c.x, y: c.y, z: c.z, yaw: c.yaw, reach: b.reach ?? 2.6, arc: b.arc ?? 2.4 });
          const first = !!f.firstCritPending;
          f.firstCritPending = false;
          const rules = { skill: plan.skill.id, ...(first ? { crit: true } : {}), ...(b.statuses ? { statuses: b.statuses } : {}) };
          const hits = field.strike(c, p, { reach: b.reach ?? 2.6, arc: b.arc ?? 2.4, power: b.mult ?? 1, element: plan.element, applyStatus: env.statusHook, knock: knockShape(b.knock), rules });
          if (b.every && hits.some(h => h.result.amount > 0)) {
            f.bites = (f.bites || 0) + 1;
            if (f.bites % (b.every.n ?? 3) === 0 && b.every.stack) {
              const st = b.every.stack;
              for (const h of hits) addStackFx(h.enemy, st);
            }
          }
          for (const h of hits) {
            env.reportHit(h.enemy, h.result);
            // a bite from behind adds its status (Fenrunner's poison)
            if (b.behindStatus && h.result.amount > 0) {
              const away = Math.atan2(c.x - h.enemy.x, c.z - h.enemy.z);
              const delta = Math.abs(((away - (h.enemy.facing || 0) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
              if (delta > 1.75) env.landStatus(b.behindStatus, statusSpec(b.behindStatus), h.enemy, Math.max(1, h.result.amount * 0.4));
            }
            if (b.status && h.result.amount > 0) env.landStatus(b.status, statusSpec(b.status), h.enemy, Math.max(1, h.result.amount * 0.4));
            if (b.heal && h.result.amount > 0) p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * b.heal));
          }
          env.sound?.combat?.(hits.length ? 'hit' : 'swing', {});
        });
      }
    }
    c.swing = Math.max(c.swing, 0.32);
    return true;
  }

  function addStackFx(e, st) {
    const spec = statusSpec(st.status);
    if (!spec || e.dying != null) return;
    for (let k = 0; k < (st.add ?? 1); k++) env.landStatus(st.status, { ...spec, stackMax: st.max ?? 5 }, e, Math.max(1, (P().derived?.damage?.[1] || 8) * 0.35));
  }

  /** A form's `petBuff`: a status on every follower for as long as the form lasts. */
  function petBuffOn(form, on) {
    const pb = form?.spec?.petBuff;
    if (!pb) return;
    for (const pet of PETS()?.pets || []) {
      if (pet.dying != null) continue;
      pet.statuses = pet.statuses || {};
      const key = `formbuff:${form.id}`;
      if (on) {
        pet.statuses[key] = { type: key, name: pb.name || form.name, kind: 'buff', remaining: Infinity, power: 1, perSecond: 0, slow: 0, damage: pb.damage || 0, resist: pb.resist || 0, healPerSecond: pb.healPerSecond || 0 };
        if (pb.biteStatus) pet.biteStatus = pb.biteStatus;
      } else {
        delete pet.statuses[key];
        if (pb.biteStatus && pet.biteStatus === pb.biteStatus) pet.biteStatus = null;
      }
    }
  }

  /** A form skill was pressed: leave the old one (its exit and its finale), enter the new one. */
  function formCast(plan) {
    const res = plan.form;
    const left = res?.left;
    const entered = res?.entered;
    if (left) exitEffects(left, plan);
    if (entered) {
      const spec = entered.spec;
      if (spec.body) bodyFor(entered);
      petBuffOn(entered, true);
      if (spec.aura) {
        const a = spec.aura;
        entered.aura = place(plan, { kind: 'zone', seconds: Infinity, radius: a.radius ?? 10, every: 1, follow: 'self', buff: a.buff || null, debuff: a.debuff || null, heal: a.heal || 0 }, C().x, C().z, 'self');
        entered.aura.left = Infinity; entered.aura.life = Infinity;
      }
      if (spec.onEnter) castSub(spec.onEnter, plan, { shape: spec.onEnter.shape || 'around' });
      if (spec.threatDrop) for (const e of F().enemies) if (e.dying == null && Math.hypot(e.x - C().x, e.z - C().z) > (spec.threatDrop.beyond ?? 10)) { e.state = 'wander'; e.threatFor = 0; }
      env.spellfx.cast({ at: v3(C().x, C().y + 0.4, C().z), element: plan.element, ms: 480 });
      log(`${entered.name}${entered.group === 'shape' ? ' shape' : ''}.`, 'good');
    } else if (left) {
      log(left.group === 'shape' ? 'You return to your own body.' : `${left.name} ends.`, '');
    }
    for (const s of env.skills()?.slots || []) s.views = null;
  }
  function exitEffects(left, plan = null) {
    const spec = left.spec || {};
    petBuffOn(left, false);
    // a song's aura stops; its Finale plays once
    const aura = world.placed.find(o => o === left.aura) || null;
    if (left.aura) { left.aura.left = 0; undraw(left.aura); const i = world.placed.indexOf(left.aura); if (i >= 0) world.placed.splice(i, 1); }
    void aura;
    if (left.why === 'expired' || left.why === 'toggle' || left.why === 'swap') {
      if (spec.onExit) castSub(spec.onExit, plan || { skill: { id: left.skill, unlockAt: slotOf(left.skill)?.unlockAt || 1 }, element: spec.element || 'nature' }, { shape: spec.onExit.shape || 'around' });
      if (spec.finale) castSub(spec.finale, plan || { skill: { id: left.skill, unlockAt: slotOf(left.skill)?.unlockAt || 1 }, element: spec.element || 'arcane' }, { shape: spec.finale.shape || 'around' });
    }
  }
  const slotOf = id => env.skills()?.slots?.find(s => s.id === id) || null;
  /** Cast a sub-plan (a Finale, an onEnter burst, an onExit burst) through the normal cast path. */
  function castSub(sub, parent, { shape = 'around' } = {}) {
    const slot = slotOf(parent?.skill?.id) || parent?.skill || null;
    const plan = env.skills().planFor(sub, slot, { shape, element: sub.element || parent?.element || 'arcane' });
    return env.castSkill(plan, { echo: true });
  }
  /** Mounting, deep water, a gather or build mode ends a shape (quietly — no exit burst). */
  function breakShapes(why) {
    const gone = leaveShapes(P(), why);
    if (gone.length) {
      for (const f of gone) { petBuffOn(f, false); if (f.aura) { undraw(f.aura); const i = world.placed.indexOf(f.aura); if (i >= 0) world.placed.splice(i, 1); } }
      log('You return to your own body.', '');
      for (const s of env.skills()?.slots || []) s.views = null;
    }
    return gone.length;
  }

  // ─────────────────────────────────────────── channel

  function startChannel(plan, slot) {
    const ch = plan.channel;
    const p = P();
    const tick = { ...plan, channel: null, sub: true };
    p.mech = p.mech || { res: {} };
    p.mech.channel = { slot, plan: tick, left: ch.seconds ?? 3, every: ch.every ?? 0.5, next: 0, moveK: ch.moveK || 0, x: C().x, z: C().z, ticks: 0, grow: ch.grow || 0 };
    log(`${plan.skill?.name}: channelling for ${ch.seconds ?? 3}s.`, '');
  }
  function tickChannel(dt) {
    const p = P(), ch = p.mech?.channel;
    if (!ch) return;
    const moved = Math.hypot(C().x - ch.x, C().z - ch.z);
    if (moved > 0.6 && !ch.moveK) { p.mech.channel = null; log('The channel breaks.', ''); return; }
    ch.x = C().x; ch.z = C().z;
    ch.left -= dt; ch.next -= dt;
    if (ch.next <= 0) {
      ch.next = ch.every;
      const k = 1 + (ch.grow || 0) * ch.ticks;
      ch.ticks++;
      env.castSkill({ ...ch.plan, mult: ch.plan.mult * k, damage: Math.round(ch.plan.damage * k) }, { echo: true });
    }
    if (ch.left <= 0) p.mech.channel = null;
  }

  // ─────────────────────────────────────────── P2: rewind (cheap enough to ship with P1)

  const history = [];
  let histT = 0;
  function recordHistory(dt) {
    histT += dt;
    if (histT < 0.1) return;
    histT = 0;
    history.push({ x: C().x, z: C().z, hp: P().hp, mp: P().mp, t: performance.now() / 1000 });
    while (history.length > 60) history.shift();
  }
  function doRewind(r) {
    const secs = typeof r === 'number' ? r : r.seconds ?? 4;
    const now = performance.now() / 1000;
    const then = history.find(h => now - h.t <= secs + 0.05) || history[0];
    if (!then) return;
    C().teleport(then.x, then.z);
    if (r.health !== false) P().hp = Math.max(P().hp, Math.min(P().maxHp, then.hp));
    env.spellfx.cast({ at: v3(then.x, groundY(then.x, then.z) + 0.4, then.z), element: 'arcane', ms: 420 });
    log(`Back ${secs}s.`, 'good');
  }

  // ─────────────────────────────────────────── the frame

  const tracked = [];
  let statsKey = '';
  function tick(dt, { fighting = false } = {}) {
    const p = P(), c = C();
    if (!p || !c) return;
    registerTemps();
    recordHistory(dt);
    // how long you have stood still (Set Hooves, `bonusIf stationary`)
    p.stillFor = c.moving > 0.15 ? 0 : (p.stillFor || 0) + dt;
    for (const st of Object.values(p.statuses || {})) if (st.manaPerSecond) p.mp = Math.min(p.maxMp, p.mp + st.manaPerSecond * dt);
    // a shape cannot be taken in the saddle, in deep water, while gathering or building
    p.shapeBlocked = c.mounted ? 'Not while riding.' : c.swimming ? 'Not in deep water.' : env.gathering?.() ? 'Not while working.' : env.building?.() ? 'Not while building.' : null;
    if (p.shapeBlocked && formOf(p, 'shape')) breakShapes(p.shapeBlocked);
    // a form, a stance, Quicken or a song changed what the sheet should say: rebuild it, once
    const key = statusStatsKey(p);
    if (p.mechDirty || key !== statsKey) { p.mechDirty = false; statsKey = key; env.rpg.refresh(p); }
    runPlaced(dt);
    for (const w of tickWalls(dt)) if (w.mesh) { env.scene.remove(w.mesh); w.mesh.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }
    for (const corpse of world.corpses) corpse.left -= dt;
    world.corpses = world.corpses.filter(x => x.left > 0);
    tickChannel(dt);
    if (p.imbue) { p.imbue.left -= dt; if (p.imbue.left <= 0) p.imbue = null; }
    if (link) {
      link.left -= dt;
      if (link.healEach) { const h = link.healEach * dt; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * h); if (link.to.dying == null) link.to.hp = Math.min(link.to.maxHp, link.to.hp + link.to.maxHp * h); }
      if (link.left <= 0 || link.to.dying != null || link.to.removed || Math.hypot(link.to.x - c.x, link.to.z - c.z) > link.range) endLink();
    }
    // self buffs that do something as they END, and counters that ran out unused
    for (let i = tracked.length - 1; i >= 0; i--) {
      const t = tracked[i];
      const st = t.unit.statuses?.[t.id];
      if (st) { t.last = st; continue; }
      tracked.splice(i, 1);
      if (t.dirty) p.mechDirty = true;
      if (t.counter) {
        const spent = t.last?.counter?.used;
        // `counter.grow`: the hits it took make the skill's NEXT cast hit harder (Sweeping Guard)
        const g = t.plan.counter?.grow;
        if (g && t.last?.counter?.taken) (p.mech.grow || (p.mech.grow = {}))[t.plan.skill?.id] = Math.min(g.cap ?? 0.5, (g.per ?? 0.1) * t.last.counter.taken);
        if (!spent && t.plan.counter?.onUnused?.refund) queue(p, { cut: { skill: t.plan.skill?.id, seconds: (env.skills().cooldownFor(slotOf(t.plan.skill?.id) || { cooldown: 8 }) || 8) * t.plan.counter.onUnused.refund } });
        continue;
      }
      if (t.store && t.last?.stored > 0) {
        // who is in reach, without striking them: the bank is the whole of the damage
        const hits = F().near(c.x, c.z, t.radius).map(e => ({ enemy: e, result: { amount: 0 } }));
        // the bank is raw damage: pay it to each body directly, split
        const each = Math.round(t.last.stored / Math.max(1, hits.length));
        for (const h of hits) { h.enemy.hp = Math.max(0, h.enemy.hp - each); F().credit?.(h.enemy, each); if (h.enemy.hp <= 0) F().kill(h.enemy); env.reportHit(h.enemy, { amount: each, crit: false }); }
        env.spellfx.aoe({ points: env.ringPoints(c.x, c.z, t.radius), element: 'physical', stagger: 0.02 });
      }
      if (t.onEnd) castSub(t.onEnd, t.plan, { shape: t.onEnd.shape || 'around' });
    }
    // what the bar and the strikes asked of the field (js/skills.js and js/rpg.js push these)
    const evs = p.mechEvents;
    if (evs?.length) {
      p.mechEvents = [];
      for (const ev of evs) {
        if (ev.kind === 'formExpired') { exitEffects(ev.form); for (const s of env.skills()?.slots || []) s.views = null; log(`${ev.form.name} ends.`, ''); }
        else if (ev.kind === 'cutFollowers') PETS()?.cutAbilities?.(ev.seconds);
        else if (ev.kind === 'imbueBurst') {
          const b = ev.spec;
          const hits = F().strikeArea(ev.at.x, ev.at.z, b.radius ?? 3, p, { power: b.mult ?? 1, element: ev.element, falloff: 0.6, proc: true });
          for (const h of hits) env.reportHit(h.enemy, h.result);
          env.spellfx.aoe({ points: env.ringPoints(ev.at.x, ev.at.z, b.radius ?? 3), element: ev.element, stagger: 0.02 });
        } else if (ev.kind === 'imbueSplash') {
          const hits = F().strikeArea(ev.at.x, ev.at.z, ev.radius, p, { power: 0.5, element: ev.element, falloff: 0.5, proc: true }).filter(h => h.enemy !== ev.except);
          for (const h of hits) env.reportHit(h.enemy, h.result);
        }
      }
    }
    // temporary summons that heal on a clock and burst when they end are run through pets hooks
    void fighting;
  }

  /** Respawn, a load, a dungeon door: the world lists start empty again. */
  function reset() {
    for (const o of world.placed) undraw(o);
    for (const w of world.walls) if (w.mesh) env.scene.remove(w.mesh);
    resetWorld();
    endLink();
    const p = P();
    if (p?.mech) p.mech.channel = null;
    if (p) p.imbue = null;
  }

  // ─────────────────────────────────────────── the cast hook

  /**
   * Called by castSkill right after the plan is built. Returns true when the runtime handled the
   * whole cast (a form, the end of a channel, the start of one).
   */
  function intercept(plan, slot) {
    if (plan.kind === 'form') { formCast(plan); return true; }
    if (plan.kind === 'channelEnd') { log(`${plan.skill?.name} ends.`, ''); return true; }
    if (plan.channel && !plan.sub) { startChannel(plan, slot); return true; }
    return false;
  }

  /** The pet hooks the frame loop hands js/pets.js update. */
  const petHooks = {
    onPetStrike(p, target, result) {
      if (p.resourceOnHit && result?.amount > 0) gainResource(P(), p.resourceOnHit.resource || p.resourceOnHit.id, p.resourceOnHit.n ?? 1);
    },
    onExpire(p) {
      const b = p.burstOnExpire;
      if (!b) return;
      const plan = p.fromPlan || { mult: 1, baseMult: 1, element: 'poison' };
      burst(plan, p.x, p.z, b.radius ?? 3, b.mult ?? 0.8, { element: b.element || null, heal: b.heal || 0 });
    },
    onHealPulse(p, h) {
      const lift = 1 + (P().derived?.healingPct || 0);
      let worst = null, frac = 1;
      for (const u of allies()) { const f = u.hp / Math.max(1, u.maxHp); if (f < frac - 0.01) { frac = f; worst = u; } }
      if (worst && frac < 0.97) { worst.hp = Math.min(worst.maxHp, worst.hp + Math.round(worst.maxHp * (h.share ?? 0.06) * lift)); env.spellfx.heal?.({ at: v3(allyPos(worst).x, groundY(allyPos(worst).x, allyPos(worst).z) + 1, allyPos(worst).z) }); }
      else if (h.strike) {
        const e = F().nearestTo(p.x, p.z, 16);
        if (e) { env.uniqueEnv.arc?.(p, e, 'holy'); const hits = F().strikeArea(e.x, e.z, 1, P(), { power: h.strike, element: 'holy', falloff: 1, proc: true }); for (const x of hits) env.reportHit(x.enemy, x.result); }
      }
    },
  };

  /** Does `repeats` carry a rider the runtime has to run (grow, scatter, alternate, lowest)? */
  function takesRepeats(plan) {
    const r = plan.repeatSpec;
    return !!(r && (r.grow || r.scatter || r.alternate || r.target));
  }

  /** `howl`: with the pack already up, a summon hastens and lifts the pack instead of calling more. */
  function howl(plan) {
    const h = plan.howl || {};
    let n = 0;
    for (const pet of PETS()?.pets || []) {
      if (pet.dying != null || (h.only !== false && pet.defId !== plan.pet)) continue;
      const r = statusRef(h.status || 'haste');
      env.rpgApply(pet, r.id, { ...statusSpec(r.id), ...r, seconds: h.seconds ?? r.seconds ?? 6, ...(h.damage ? { damage: h.damage } : {}) });
      if (h.taunt) for (const e of F().near(C().x, C().z, h.taunt.radius ?? 4)) F().taunt(e, pet, h.taunt.seconds ?? 4);
      n++;
    }
    env.spellfx.cast({ at: v3(C().x, C().y + 0.4, C().z), element: plan.element, ms: 520 });
    log(n ? `${plan.skill?.name}: the pack answers the howl.` : 'Nothing answers.', n ? 'good' : '');
  }

  return {
    takesRepeats, howl,
    mechEnv, decorate, intercept, dash, line, repeats, afterBolt, afterCast, onHurt, onKill,
    onObjectStruck, basicAttack, placeBody, breakShapes, tick, reset, petHooks, place, knockShape,
    /** For the debug hook and the Playwright specs. */
    debug: () => ({ timers: world.placed.filter(o => o.timer).map(o => ({ drawn: o.timer.mesh.geometry.drawRange.count, full: o.timer.seg * 6 })), tinted, placed: world.placed.length, walls: world.walls.length, corpses: world.corpses.length, link: link ? { to: link.to.name, left: link.left } : null, forms: formIds(P()), bodies: Object.keys(bodies) }),
    applyMod, repeatsOf,
  };
}
