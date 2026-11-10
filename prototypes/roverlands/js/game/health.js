// Health on foot (Expansion 1 M9, docs/EXPANSION-1.md "Health"). PURE: no DOM, no three.js, no Rapier.
//
// Rule 6 of the expansion — forgiving: a bad landing costs a few seconds, never gold or progress.
//   landing slower than 9 m/s           nothing
//   faster                              (v - 9) * 8 hit points
//   faster than 22 m/s                  knocked down for 3 s as well
//   hit points reach 0                  knocked out: you get up where you are after 4 s with full health
//
//   const h = createHealth();
//   h.land(v)  -> { dmg, knock, out } | null       a landing (v = the speed INTO the ground, m/s)
//   h.tick(dt) -> 'up' | null                        'up' the frame you stand again
//   h.hp, h.state ('ok' | 'down' | 'out'), h.down (true while you cannot move), h.wait (seconds until you can)
//   h.shown                                         true while the HUD should draw the bar (hurt, or hurt lately)
//   h.hurt(dmg) -> { dmg, out } | null              anything else that hurts (M8: a raider's shot in the Rustwild)
//   h.reset()                                       full health, standing

export const HP_MAX = 100;
export const FALL = Object.freeze({ safe: 9, perMs: 8, knock: 22, downSecs: 3, outSecs: 4, showSecs: 6 });

/** Damage for landing at `v` m/s: { dmg, knock }. */
export function fallDamage(v) {
  const s = Math.abs(Number(v) || 0);
  if (s <= FALL.safe) return { dmg: 0, knock: false };
  return { dmg: Math.round((s - FALL.safe) * FALL.perMs), knock: s > FALL.knock };
}

export function createHealth() {
  const h = {
    hp: HP_MAX, state: 'ok', wait: 0, hurtAt: -1e9, clock: 0,
    get down() { return h.state !== 'ok'; },
    get shown() { return h.hp < HP_MAX || h.state !== 'ok' || h.clock - h.hurtAt < FALL.showSecs; },
    land(v) {
      if (h.state === 'out') return null;           // already out cold: the ground cannot do more
      const { dmg, knock } = fallDamage(v);
      if (!dmg) return null;
      h.hp = Math.max(0, h.hp - dmg); h.hurtAt = h.clock;
      if (h.hp <= 0) { h.state = 'out'; h.wait = FALL.outSecs; return { dmg, knock: true, out: true }; }
      if (knock) { h.state = 'down'; h.wait = Math.max(h.wait, FALL.downSecs); }
      return { dmg, knock, out: false };
    },
    hurt(dmg) {
      const d = Math.max(0, Math.round(Number(dmg) || 0));
      if (h.state === 'out' || !d) return null;
      h.hp = Math.max(0, h.hp - d); h.hurtAt = h.clock;
      if (h.hp <= 0) { h.state = 'out'; h.wait = FALL.outSecs; return { dmg: d, out: true }; }
      return { dmg: d, out: false };
    },
    tick(dt) {
      h.clock += dt;
      if (h.state === 'ok') return null;
      h.wait -= dt;
      if (h.wait > 0) return null;
      if (h.state === 'out') h.hp = HP_MAX;          // forgiving: up again with full health
      h.state = 'ok'; h.wait = 0;
      return 'up';
    },
    reset() { h.hp = HP_MAX; h.state = 'ok'; h.wait = 0; },
  };
  return h;
}
