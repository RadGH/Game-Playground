// The short list (PLAN §1 "Direct"): tap a person, tap a thing, pick. What can be asked is worked out from the place's tags
// and opening hours, so a shut shop says so rather than failing later. Pure, so a test can read every list.
//   ordersFor({ who, target, roster, minute, friend? }) -> [{ label, order, off? (why not) }]
const PRETTY = { grocery: 'Grocery', cafe: 'Cafe', diner: 'Diner', bar: 'Pub', gym: 'Gym', boutique: 'Boutique', park: 'Park', office: 'Office block', school: 'School', clinic: 'Clinic', fire_station: 'Fire station', police_station: 'Police station', garage: 'Garage', lumber_yard: 'Lumber yard', sawmill: 'Timber office', forest_camp: 'Wend Wood camp', saw_mill: 'Wend Mill', town_hall: 'Town hall', rift_lodge: 'Rift lodge', house: 'House', apartment: 'Flats' };
export const placeName = pl => (pl ? pl.name || PRETTY[pl.kind] || pl.kind : 'somewhere');
const hhmm = h => `${String(h % 24).padStart(2, '0')}:00`;
export function isOpenAt(pl, minute) {
  if (!pl.hours) return true;
  const [a, b] = pl.hours, from = a * 60, to = b * 60, m = minute % 1440;
  return from <= to ? m >= from && m < to : m >= from || m < to;
}
const HOME_ACTIONS = ['eat_home', 'snack', 'nap', 'shower', 'watch_tv', 'read', 'cantrip'];

/** Stir (PLAN §1): the same scenes the drag offers, so touch, keys and a controller all reach them. */
export const stirRows = (target, roster) => Object.entries(roster.stir || {}).map(([stir, label]) => ({ label, order: { kind: 'stir', person: target.id, stir } }));

const spellRows = (target, roster) => ['warm', 'hush'].filter(s => roster.spells?.[s]).map(s => ({ label: `Spell: ${roster.spells[s].label}`, order: { kind: 'cast', spell: s, person: target.id } }));

export function ordersFor({ who, target, roster, minute }) {
  const acts = roster.actions, out = [], use = (id, place) => ({ label: acts[id].verb, order: place === undefined ? { kind: 'use', action: id } : { kind: 'use', action: id, place } });
  if (target.kind === 'self') {
    out.push({ label: 'Go home', order: { kind: 'home' } });
    if (who.job && who.work !== who.home) out.push({ label: 'Go to work', order: { kind: 'work' } });
    out.push(use('phone_friend'));
    for (const id of ['stroll', 'nap', 'eat_home', 'shower']) out.push(use(id));
    for (const sp of ['tidy', 'warm', 'mend']) if (roster.spells?.[sp]) out.push({ label: `Spell: ${roster.spells[sp].label}`, order: { kind: 'cast', spell: sp } });
    return out;
  }
  if (target.kind === 'person') return [{ label: `Have a chat with ${target.name.split(' ')[0]}`, order: { kind: 'chat', person: target.id } }, ...stirRows(target, roster), ...spellRows(target, roster)];
  const places = target.places, home = places.find(p => p.id === who.home), pl = home || places[0];
  if (home) { out.push({ label: 'Go home', order: { kind: 'home' } }); for (const id of HOME_ACTIONS) if (acts[id]) out.push(use(id)); return out; }
  const open = isOpenAt(pl, minute), why = open ? null : `opens ${hhmm(pl.hours[0])}`;
  if (pl.id === who.work) out.push({ label: 'Go to work', order: { kind: 'work' } });
  out.push({ label: 'Go there', order: { kind: 'go', place: pl.id } });
  for (const [id, a] of Object.entries(acts)) {
    if (!pl.tags?.includes(a.site)) continue;
    const row = use(id, pl.id);
    if (a.cost) row.label += ` (${a.cost} coins)`;
    if (why) row.off = why;
    out.push(row);
  }
  return out;
}
