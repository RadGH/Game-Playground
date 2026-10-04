// Stream E — counter-sending: how well one unit does against a field's defence, and why.
//
//   unitCounter(data, u, D, opts) -> { mult, taken, dealt, reasons: [{ key, w, text }] }
//     mult > 1: this unit survives / hurts the defence better than an average unit of its tier would.
//     `taken`  = share of damage it takes from the defenders (type table, magic resist does not help it,
//                ward vs skill-heavy heroes, packs vs area or single-target heroes, stealth vs ranged ...)
//     `dealt`  = share of its damage that lands on the defending heroes (type table vs their armour class,
//                magic resist against fire / nature)
//     opts.only: 'table' -> just the damage table vs the heroes (the Veteran's view)
//     opts.lane: weight the hero standing in that lane more (team games: whoever actually defends it)
//
//   counterEvent(ctx, sender, target, uid, n, reason) -> emits `counter` (interfaces.md request): the
//     view shows "<sender> sends <unit> — <reason>" to the defending player.
//
// Reasons are short, player-facing, and say what the defender can do about it implicitly.

const DMG_WORD = { blade: 'blades', pierce: 'arrows', fire: 'fire', nature: 'nature magic' };
const DMG_ADJ = { blade: 'Blades hit', pierce: 'Arrows hit', fire: 'Fire hits', nature: 'Nature magic hits' };
const ARMOUR_WORD = { light: 'light', heavy: 'heavy', spectral: 'spectral', hide: 'hide', fortified: 'fortified' };

const pct = (data, d, a) => {
  const row = data.damage.pct[d];
  return row && row[a] != null ? row[a] / 100 : 1;
};

/** Weight of each defending hero for a send down `lane` (heroes standing in the lane count double). */
function heroWeights(D, lane) {
  const w = D.heroes.map(h => {
    let k = h.dps;
    if (lane != null && h.lane >= 0 && h.lane !== lane) k *= 0.5;
    if (!h.alive) k *= h.respawnIn > 200 ? 0.4 : 0.8;   // a long respawn: it cannot counter this wave
    return k;
  });
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  return w.map(k => k / sum);
}

export function unitCounter(data, u, D, opts = {}) {
  const reasons = [];
  const W = heroWeights(D, opts.lane);
  const heroDps = D.heroes.reduce((s, h, i) => s + h.dps * W[i] * D.heroes.length, 0) || 1;
  const total = heroDps + D.turretDps + D.petDps;
  const hs = heroDps / total, ts = D.turretDps / total, ps = D.petDps / total;

  // damage this unit takes: type table per hero damage mix, turrets and pets by their type
  let taken = 0, mainType = null, mainShare = 0;
  const typeShare = {};
  D.heroes.forEach((h, i) => { for (const t of Object.keys(h.mix)) typeShare[t] = (typeShare[t] || 0) + h.mix[t] * W[i]; });
  for (const t of Object.keys(typeShare)) { taken += typeShare[t] * pct(data, t, u.armour) * hs; if (typeShare[t] > mainShare) { mainShare = typeShare[t]; mainType = t; } }
  if (ts) taken += ts * pct(data, D.turretType || 'pierce', u.armour);
  if (ps) taken += ps * pct(data, 'nature', u.armour);
  if (!(taken > 0)) taken = 1;

  // damage it deals to the heroes
  let dealt = 0;
  D.heroes.forEach((h, i) => {
    let k = pct(data, u.dmg, h.armourClass);
    if (u.dmg === 'fire' || u.dmg === 'nature') k *= 1 - Math.min(0.75, h.mr / 100);
    dealt += k * W[i];
  });

  if (mainType && pct(data, mainType, u.armour) < 1 && mainShare > 0.5) reasons.push({ key: 'resists', w: (1 - pct(data, mainType, u.armour)) * 2, text: `${ARMOUR_WORD[u.armour]} armour turns your ${DMG_WORD[mainType]}` });
  const top = D.heroes.reduce((b, h, i) => (W[i] > (b ? b.w : -1) ? { h, w: W[i] } : b), null);
  if (top && pct(data, u.dmg, top.h.armourClass) > 1) {
    const mr = (u.dmg === 'fire' || u.dmg === 'nature') ? top.h.mr : 0;
    if (mr < 15) reasons.push({ key: 'strong', w: (pct(data, u.dmg, top.h.armourClass) - 1) * 2, text: `${DMG_ADJ[u.dmg]} your ${ARMOUR_WORD[top.h.armourClass]} armour hard` });
  }
  // the Keep: a body that dies to one or two of its splash shots never reaches the banners (everyone
  // who has played a match knows this, so the Veteran's table read includes it)
  if (D.keep) {
    const shot = D.keep.shot * pct(data, D.keep.dmgType, u.armour);
    const survive = Math.min(1, u.hp / (shot * 3));
    taken /= 0.55 + 0.45 * survive;
  }
  if (opts.only === 'table') return finish(taken, dealt, reasons);

  // what the hero kits do to a crowd
  const avg = k => D.heroes.reduce((s, h, i) => s + h[k] * W[i], 0);
  const skill = avg('skillShare'), aoe = avg('aoe'), cc = avg('cc');
  const ranged = D.heroes.reduce((s, h, i) => s + (h.ranged ? W[i] : 0), 0);
  const has = t => u.traits.indexOf(t) >= 0;
  if (has('ward')) { taken *= 1 - 0.3 * skill * hs; if (skill >= 0.45) reasons.push({ key: 'ward', w: 0.3 * skill, text: 'warded against your spells' }); }
  if (has('hardened')) taken *= 0.9;
  if (u.bodies > 1) {
    // several small bodies: area heroes sweep them, single-target heroes and turrets waste shots
    const f = 1 + 0.35 * (aoe - 0.8) * hs - 0.12 * ts;
    taken *= f;
    if (f < 0.93) reasons.push({ key: 'swarm', w: 1 - f, text: 'too many bodies for single shots' });
  } else if (u.tier >= 3 && aoe >= 1.1) {
    taken *= 0.92;
    reasons.push({ key: 'bulk', w: 0.08, text: 'too tough for your area spells' });
  }
  // hidden bodies dodge aimed shots and turrets, not area spells (an area still hits what it cannot see)
  if (has('stealth') && ranged + ts > 0.5) { const k = 0.22 * (1 - skill * 0.6); taken *= 1 - k; if (k > 0.12) reasons.push({ key: 'stealth', w: k, text: 'slips past ranged defenders unseen' }); }
  if (has('unstoppable') && cc >= 0.5) { taken *= 1 - 0.12 * cc; reasons.push({ key: 'unstoppable', w: 0.12 * cc, text: 'shrugs off your stuns and shoves' }); }
  if (has('flying') && ts > 0.25) { taken *= 0.92; }
  if (has('heal') && aoe < 0.9) taken *= 0.94;
  if (has('volatile') && ranged < 0.5) dealt *= 1.15;
  if ((has('shred') || has('bleed')) && avg('armor') >= 8) { dealt *= 1.12; reasons.push({ key: 'shred', w: 0.12, text: 'tears through your armour' }); }
  if (has('feast') && D.pets > 0) dealt *= 1.1;
  return finish(taken, dealt, reasons);
}

function finish(taken, dealt, reasons) {
  // surviving the defence matters most (that is what leaks); hurting the hero second
  const mult = (1 / taken) * (0.75 + 0.25 * dealt);
  let order = reasons;
  for (let i = 1; i < order.length; i++) for (let j = i; j > 0 && order[j].w > order[j - 1].w; j--) { const t = order[j]; order[j] = order[j - 1]; order[j - 1] = t; }
  return { mult, taken, dealt, reasons: order };
}

/** Emit the counter-send notice (B shows it as a toast to `target`). */
export function counterEvent(ctx, sender, target, uid, n, reason) {
  const u = ctx.data.derived.units[uid];
  ctx.emit('counter', { player: sender.id, target, unit: uid, name: u ? u.name : uid, count: n, reason: reason.text, key: reason.key });
}
