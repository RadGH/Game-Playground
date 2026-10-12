// Thousandvale — what a skill does for FRIENDS, read off its row or plan (stream C, M2).
//
// One reading for three readers: the skill bar the client draws (`ally` = aim it at a friend, `group`
// = it reaches the party on its own), the ally-targeting audit (tests/C/ally-audit.test.mjs checks
// every promise here actually lands), and the README table "Ally targeting". The rules that carry the
// effects out are in js/rules/cast-skills.js; keep the two in step (the audit fails if they drift).

/**
 * The friendly effects of a plan, a talented row, or a form sub-spec, as a Set of
 * 'heal' | 'status' | 'barrier' | 'ward' | 'cleanse' | 'link' | 'revive' | 'empower'.
 * `form` = a form spec (its aura counts).
 */
export function allyEffects(p, { form = null } = {}) {
  const out = new Set();
  if (!p && !form) return out;
  p = p || {};
  const kind = p.kind ?? p.shape;
  // play-test 5 T3: an `around` or `ground` skill's own heal is a direct heal too (Prayer of Dawn, Mending Post)
  if ((kind === 'self' || kind === 'around' || kind === 'ground') && p.heal) out.add('heal');
  if (p.healPets) out.add('heal');
  if (p.burst?.heal && !p.burst?.mult && (p.burst.radius ?? 6) >= 5) out.add('heal');
  if (p.healAllies) out.add('heal');
  if (kind === 'self' && p.status && (p.pets || p.status === 'regen')) out.add('status');
  // play-test 5 T2: `petsOnly` ("your followers: …") is the caster's OWN followers and no longer reaches the party
  if (p.selfBuff?.pets) out.add('status');
  if (p.allyStatus && p.allyStatus.target !== 'all') out.add('status');
  if (p.barrier && typeof p.barrier === 'object' && (p.barrier.of !== 'paid' || p.barrier.pets)) out.add('barrier');
  if (p.ward) out.add('ward');
  if (p.cleanse) out.add('cleanse');
  if (p.link && p.link.to !== 'enemy') out.add('link');
  // play-test 5 T4: Farhold's `revive` raises your own followers; a fallen PLAYER needs a revive skill (`tv.revive`)
  if (p.tv?.revive) out.add('revive');
  if (p.empowerNext?.pets) out.add('empower');
  if (p.place?.heal) out.add('heal');
  if (p.place?.buff || p.place?.deathPrevent) out.add('status');
  if (form?.aura?.heal) out.add('heal');
  if (form?.aura?.buff) out.add('status');
  return out;
}

/**
 * Only the effects a form's onEnter / finale has for friends: it is cast with no target
 * (skillrun.js castSub), so a single-target barrier/ward/cleanse/link/mend lands on the caster.
 */
export function groupEffects(p) {
  const out = allyEffects(p);
  if (!p?.barrier?.pets) out.delete('barrier');
  if (!p?.ward?.pets) out.delete('ward');
  if (!p?.cleanse?.pets) out.delete('cleanse');
  out.delete('link');
  if ((p?.kind ?? p?.shape) === 'self' && p?.status === 'regen' && !p?.pets) out.delete('status');
  return out;
}

/**
 * Should the client aim this skill at a friend? True when one of its effects lands on the NAMED ally
 * (cast-skills.js `allyTargetOf`): a heal or mend on a self skill, a barrier/ward without `pets`, a
 * cleanse, a link to a friend, a status for one ally. A skill whose friendly effects all reach the
 * whole party by themselves is `group`, not `ally`.
 */
export function aimsAtAlly(row) {
  if (!row) return false;
  const kind = row.kind ?? row.shape;
  if ((kind === 'self' || kind === 'around' || kind === 'ground') && row.heal) return true;
  if (kind === 'self' && row.status === 'regen' && !row.pets) return true;
  if (row.tv?.revive && !row.tv.revive.mass) return true;
  if (row.barrier && typeof row.barrier === 'object' && !row.barrier.pets) return true;
  if (row.ward && !row.ward.pets) return true;
  if (row.cleanse && !row.cleanse.pets) return true;             // with `pets` it reaches every ally by itself
  if (row.dash && typeof row.dash === 'object' && row.dash.to === 'ally') return true;   // a leap to a friend (Daybreak Descent)
  if (row.link && row.link.to !== 'enemy') return true;
  if (row.allyStatus && row.allyStatus.target !== 'all') return true;
  return false;
}
