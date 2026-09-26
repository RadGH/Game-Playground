// Status effects on actors (docs/03 §4). Pure. statuses live on actor.statuses[id] = { stacks, t, source, dps, ... }
import { dealDamage, heal } from './damage.js';

export function applyStatus(game, target, id, { source, hitDamage = 0, stacks = 1, via, viaName } = {}) {
  if (!target || target.dead) return;
  const def = game.data.statuses.byId[id]; if (!def) return;
  const S = target.statuses || (target.statuses = {});
  const resist = target.statusResist?.[id] ?? 0; if (resist >= 1) return;
  if (id === 'burn' && S.soaked) { delete S.burn; game.bus?.emit('combo', { id: 'scald', target }); return; }
  if (id === 'chill' && S.thawing) return;
  let dur = def.duration * (1 - resist) * (target.steadfast ? 0.5 : 1);
  const s = S[id] || (S[id] = { stacks: 0, t: 0, source, acc: 0, tickT: 0, dps: 0 });
  s.source = source; s.via = via; s.viaName = viaName;
  if (def.maxStacks) s.stacks = Math.min(def.maxStacks, s.stacks + stacks); else s.stacks = 1;
  s.t = Math.max(s.t, dur);
  if (id === 'burn') s.dps = Math.max(s.dps, hitDamage * def.perStackPct);
  if (id === 'corrode') s.dps = Math.max(s.dps, hitDamage * def.dotPct);
  // chill -> freeze
  if (id === 'chill' && s.stacks >= (S.soaked ? 3 : def.freezeAt)) {
    delete S.chill;
    if (target.kind === 'boss') S.numbed = { stacks: 1, t: 2 };
    else { S.frozen = { stacks: 1, t: target.elite ? 1.0 : game.data.statuses.byId.frozen.duration }; game.bus?.emit('frozen', { target }); }
  }
  game.meter?.record({ t: game.tick / 60, source: source?.id || 'world', sourceName: source?.name || '', target: target.id, targetName: target.name, kind: 'status', amount: 0, status: id, duration: dur, dtype: 'physical', via: via || 'status', viaName: viaName || def.name });
  game.bus?.emit('status.apply', { target, id, stacks: s.stacks });
}

export function stepStatuses(game, a, dt) {
  const S = a.statuses; if (!S) return;
  for (const [id, s] of Object.entries(S)) {
    s.t -= dt;
    if (id === 'burn' || id === 'corrode') {
      s.tickT += dt; const every = id === 'burn' ? 0.5 : 1.0;
      if (s.tickT >= every) { s.tickT -= every; const dmg = s.dps * s.stacks * every + (s.acc || 0); const whole = Math.floor(dmg * 10) / 10; s.acc = dmg - whole; if (whole > 0) dealDamage(game, { source: s.source, target: a, amount: whole, flame: id === 'burn' ? 'ember' : 'bile', via: `dot:${id}`, viaName: id === 'burn' ? 'Burning' : 'Corrosion', dot: true, noStatusAmp: true }); }
    }
    if (s.t <= 0) { delete S[id]; if (id === 'frozen') S.thawing = { stacks: 1, t: 4 }; game.bus?.emit('status.expire', { target: a, id }); }
  }
}
/** Movement/attack speed multiplier from statuses. */
export function speedMult(a) { const S = a.statuses; if (!S) return 1; if (S.frozen) return 0; let m = 1; if (S.chill) m *= 1 - 0.1 * S.chill.stacks; if (S.numbed) m *= 0.5; return m; }
export function canAct(a) { return !(a.statuses?.frozen || a.statuses?.stunned); }
