// Achievements and trophies (feedback #106, 2026-10-21): "Add achievements. Some achievements should give you a reward,
// sent to you by mail, either gold or a random item … an achievement for submitting a bug or a suggestion … another for
// 'Feedback Implemented' … Trophies … whenever you help kill a world boss or other mega event … a special trophy for
// realm first achievements."
//
//   const A = createAchievements({ data, now, mail, tell, claimFirst, log })
//   A.track(o, tally, n = 1)          count one thing done (kill, quest, fish …) and grant what that earns
//   A.set(o, tally, value)            a tally that is a level, not a count (your level; zones entered; reports done)
//   A.trophy(o, kind, vars)           a trophy for a world boss / a siege (counted: "×3")
//   A.firstWon(o, id)                 the gateway says this character IS the realm's first: the realm-first trophy
//   A.view(o)                         -> { t: 'achList', list, trophies, points } for the window
//   A.has(o, id) / A.trophyOf(o, id)  for a chat link (only what you hold can be linked)
//
// State lives on the character (`char.ach`, js/sim/save-fields.js): { n: { tally: count }, done: { id: wall ms },
// trophies: [{ id, name, desc, n, at }] }. Pure apart from the callbacks: `mail({ to, subject, body, gold?, gift? })`,
// `tell(o, msg)` (to that player's socket), `claimFirst(o, achievement)` (asks the gateway, which alone can say who was
// first across processes — js/sim/gateway.js `realmFirst`), `dirty(o)` (the character needs saving).

const CAP_TROPHIES = 200;
const fill = (s, v) => String(s || '').replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ''));
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);

export function createAchievements({ data, now = () => Date.now(), mail = null, tell = () => {}, claimFirst = null, dirty = () => {}, log = () => {} } = {}) {
  const LIST = (data?.achievements || []).filter(a => a && a.id && a.track && a.n > 0);
  const BY_ID = new Map(LIST.map(a => [a.id, a]));
  const BY_TRACK = new Map();
  for (const a of LIST) { if (!BY_TRACK.has(a.track)) BY_TRACK.set(a.track, []); BY_TRACK.get(a.track).push(a); }
  const TROPHY = data?.trophies || {};

  const stateOf = o => {
    const ch = o.char;
    if (!ch.ach || typeof ch.ach !== 'object') ch.ach = { n: {}, done: {}, trophies: [] };
    ch.ach.n ||= {}; ch.ach.done ||= {}; ch.ach.trophies ||= [];
    return ch.ach;
  };
  const rewardText = r => !r ? '' : r.gold ? `${r.gold} gold` : r.gift ? `a gift box (${r.gift.minRarity || 'rare'} or better)` : '';

  /** Grant every achievement on `tally` that its count now reaches. `quiet` = no reward (it was paid another way). */
  function check(o, tally, { quiet = false } = {}) {
    const S = stateOf(o), have = S.n[tally] || 0, got = [];
    for (const a of BY_TRACK.get(tally) || []) {
      if (S.done[a.id] || have < a.n) continue;
      S.done[a.id] = now();
      got.push(a);
      const r = quiet ? null : a.reward;
      if (r && mail) {
        Promise.resolve(mail({ to: o.char.id, subject: `Achievement: ${a.name}`, from: 'The Vale',
          body: `Well done! You earned "${a.name}" — ${a.desc}\n\nYour reward is in this letter.`,
          gold: r.gold || 0, gift: r.gift ? { minRarity: r.gift.minRarity || 'rare', level: o.char.level || 1, name: `${a.name} Gift` } : null }))
          .catch(err => log('achievement mail failed', a.id, err && err.message));
      }
      tell(o, { t: 'ach', id: a.id, name: a.name, desc: a.desc, cat: a.cat, reward: r ? rewardText(r) : '', at: S.done[a.id] });
      if (a.first && claimFirst) claimFirst(o, a);
    }
    if (got.length) dirty(o);
    return got;
  }
  function track(o, tally, n = 1, opts) {
    if (!o?.char || !(n > 0)) return [];
    const S = stateOf(o);
    S.n[tally] = (S.n[tally] || 0) + n;
    dirty(o);
    return check(o, tally, opts);
  }
  function set(o, tally, value, opts) {
    if (!o?.char || !Number.isFinite(value)) return [];
    const S = stateOf(o);
    if ((S.n[tally] || 0) >= value) return [];
    S.n[tally] = value;
    dirty(o);
    return check(o, tally, opts);
  }
  /** A trophy: one per kind + name, its count rising each time. -> the trophy row */
  function trophy(o, kind, vars = {}) {
    if (!o?.char) return null;
    const T = TROPHY[kind] || { name: vars.name || kind, desc: vars.desc || '' };
    const name = fill(T.name, vars).trim(), desc = fill(T.desc, vars).trim();
    const id = `${kind}:${slug(vars.key || name)}`;
    const S = stateOf(o);
    let row = S.trophies.find(t => t.id === id);
    if (row) row.n = (row.n || 1) + 1;
    else { row = { id, kind, name, desc, n: 1, at: now() }; S.trophies.push(row); if (S.trophies.length > CAP_TROPHIES) S.trophies.shift(); }
    dirty(o);
    tell(o, { t: 'trophy', id, kind, name, desc, n: row.n, at: row.at });
    return row;
  }
  /** The gateway's answer to claimFirst: this character was first. */
  function firstWon(o, id) {
    const a = BY_ID.get(id);
    if (!a) return null;
    return trophy(o, 'realmFirst', { key: id, what: a.firstTrophy ? a.firstTrophy.replace(/^First to /i, '').trim() || a.name : a.name, what2: a.desc.replace(/\.$/, '').replace(/^(\w)/, c => c.toLowerCase()), name: a.firstTrophy });
  }

  function view(o) {
    const S = stateOf(o);
    const list = LIST.map(a => ({ id: a.id, cat: a.cat || 'Other', name: a.name, desc: a.desc, n: Math.min(a.n, S.n[a.track] || 0), of: a.n, done: S.done[a.id] || 0, reward: rewardText(a.reward), first: !!a.first }));
    const points = list.filter(r => r.done).length;
    return { t: 'achList', list, trophies: S.trophies.slice().sort((x, y) => (y.at || 0) - (x.at || 0)), points, of: list.length };
  }
  const has = (o, id) => !!(o?.char?.ach?.done?.[id]);
  const trophyOf = (o, id) => (o?.char?.ach?.trophies || []).find(t => t.id === id) || null;
  const def = id => BY_ID.get(id) || null;

  return { track, set, trophy, firstWon, view, has, trophyOf, def, list: LIST, stateOf };
}
