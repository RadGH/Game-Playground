// The Phone (PLAN §1): the one hub. A panel of apps on the same sheet every list in the game uses, so touch, keys and a controller
// all walk it (rule 7). The apps ask the sim once as they open (town.phone) and never poll.
//
//   const phone = createPhone({ game, town, world, shell, el, ... });  phone.open();  phone.dot(unread)
import { letterOf, bookReason, happeningLine } from './phone-text.js';
import { placeName } from './orders.js';

const hhmm = h => `${String(h % 24).padStart(2, '0')}:00`;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SVG = 'http://www.w3.org/2000/svg';

export function createPhone({ town, world, shell, el, whose, hands, goTo, say, onRead, handsMenu = {}, news = () => null, jumpTo = null, showPerson = null, patch = null, watch = null }) {
  let box = null, body = null, data = null, hold = null;
  const tile = (icon, label, run, dot = false) => el('button', { class: 'od-app', type: 'button', on: { click: run } }, el('i', { text: icon }), el('span', { text: label }), dot ? el('b', { class: 'od-dot' }) : null);
  const clear = () => { body.textContent = ''; };
  const head = (title) => { clear(); body.append(el('div', { class: 'od-apphead' }, el('button', { class: 'od-sbtn', type: 'button', text: '‹ Apps', on: { click: home } }), el('h3', { text: title }))); };
  const row = (a, b, cls = '') => el('div', { class: 'od-line ' + cls }, el('span', { text: a }), el('b', { text: b }));
  const R = () => town.roster;
  async function load() { const w = whose(); hold = w; data = await town.phone(w.household, w.who); return data; }

  function home() {
    clear();
    const unread = data.mail.filter(m => !m.read).length, now = town.mirror.now?.length ?? 0;
    body.append(el('p', { class: 'od-phonetop', text: `${data.name} · ${data.money} coins` }));
    const grid = el('div', { class: 'od-apps' });
    grid.append(tile('🏦', 'Bank', bank), tile('🪓', 'Jobs', jobs), tile('✉️', unread ? `Mail (${unread})` : 'Mail', mail, unread > 0), tile('🗺️', 'Map', map), tile('📅', 'Calendar', calendar), tile('📣', now ? `Now (${now})` : 'Now', happening), tile('📰', data.sheets.length ? `Paper (${data.sheets[0].no})` : 'Paper', paper), tile('📖', 'Story', story), tile('🧑‍🤝‍🧑', "Who's Who", whoswho));
    if (hands.on && handsMenu.spells) grid.append(tile('✨', 'Spells', () => { box.close(); handsMenu.spells(); }));
    if (handsMenu.party && hands.on) grid.append(tile('🚶', 'Party', () => { box.close(); handsMenu.party(); }), tile('🚗', 'Call a car', () => { box.close(); handsMenu.car(); }));
    body.append(grid);
  }
  function bank() {
    head('Bank');
    body.append(row('Balance', `${data.money} coins`, 'big'), row(`Next bills, ${dayName(data.nextBills)}`, `${data.bill} coins`));
    body.append(el('h4', { text: 'Latest' }));
    if (!data.book.length) body.append(el('p', { class: 'od-tip', text: 'Nothing has moved yet.' }));
    for (const [day, amount, why] of data.book) body.append(row(`${dayName(day)}: ${bookReason(why)}`, `${amount > 0 ? '+' : ''}${amount}`, amount > 0 ? 'up' : ''));
  }
  const dayName = d => (d === data.today ? 'today' : d === data.today + 1 ? 'tomorrow' : DAYS[((d % 7) + 7) % 7]);
  function jobs() {
    head('Jobs');
    const pick = data.members.find(m => m.id === hold.who) ?? data.members[0];
    for (const m of data.members) {
      const on = m.shift ? `${hhmm(m.shift[0])} to ${hhmm(m.shift[1])}` : '';
      body.append(row(`${m.name.split(' ')[0]}: ${m.title}`, m.rate ? `${m.rate} an hour` : '', m.id === pick?.id ? 'big' : ''));
      if (m.job) body.append(el('p', { class: 'od-tip', text: `${m.onShift ? 'On shift now. ' : ''}${on}. Rank ${m.rank}. ${m.shifts} shifts, ${m.earned} coins earned.` }));
    }
    if (data.timber) body.append(el('h4', { text: 'Wend Timber' }), el('p', { class: 'od-tip', text: `${data.timber.standing} trees standing, ${data.timber.deck} logs on the mill deck, ${data.timber.rack} boards on the rack, ${data.timber.yards} at the lumber yards.` }));
    if (hold.who >= 0) {
      body.append(el('h4', { text: `Openings for ${pick.name.split(' ')[0]}` }));
      const list = data.openings.slice(0, 6);
      if (!list.length) body.append(el('p', { class: 'od-tip', text: 'Nothing going right now.' }));
      for (const o of list) body.append(el('button', { class: 'od-big quiet', type: 'button', text: `${o.title}, ${o.pay} an hour${o.hands ? ' (hands-on)' : ''}`, on: { click: () => { town.cmd({ kind: 'setJob', who: hold.who, job: o.job }); town.roster.people[hold.who].job = o.job; say(`${pick.name.split(' ')[0]} takes the job.`); box.close(); } } }));
    }
  }
  function mail() {
    head('Mail');
    if (!data.mail.length) body.append(el('p', { class: 'od-tip', text: 'Nothing yet. Bills come every three days.' }));
    for (const m of data.mail) {
      const t = letterOf(m, R());
      body.append(el('button', { class: 'od-letter' + (m.read ? '' : ' new'), type: 'button', on: { click: () => letter(m, t) } }, el('b', { text: t.subject }), el('small', { text: `${t.from} · ${dayName(R().clock ? Math.floor((m.t * R().clock.minutesPerTick + 360) / 1440) : 0)}` })));
    }
  }
  function letter(m, t) {
    head(t.subject);
    if (!m.read) { m.read = 1; town.cmd({ kind: 'mailRead', household: data.id, id: m.i }); onRead?.(); }
    body.append(el('p', { class: 'od-tip', text: `From ${t.from}` }), ...t.lines.map(x => el('p', { class: 'od-para', text: x })), el('button', { class: 'od-big quiet', type: 'button', text: 'Back to Mail', on: { click: mail } }));
  }
  function calendar() {
    head('Calendar');
    data.days.forEach((d, i) => {
      const w = data.members.filter(m => m.days[i]).map(m => `${m.name.split(' ')[0]} ${hhmm(m.shift[0])} to ${hhmm(m.shift[1])}`), bills = d % data.every === 0;
      body.append(el('div', { class: 'od-day' + (i ? '' : ' today') }, el('b', { text: `${DAYS[((d % 7) + 7) % 7]}${i ? '' : ', today'}` }), el('span', { text: w.join(', ') || 'Nobody working' }), bills ? el('small', { text: `Bills: ${data.bill} coins` }) : null));
    });
  }
  function happening() {
    head('Happening now');
    const rows = town.mirror.now ?? [];
    if (!rows.length) body.append(el('p', { class: 'od-tip', text: 'A quiet moment.' }));
    for (const r of rows) {
      body.append(el('button', { class: 'od-big quiet', type: 'button', text: happeningLine(r, R(), news()), on: { click: () => { box.close(); if (r.k === 'stage' && watch) watch(r); else if (r.at) goTo(r.at[0], r.at[1]); } } }));
      if (jumpTo && r.jump >= 0 && !hands.on) body.append(el('button', { class: 'od-big', type: 'button', text: `Jump in as ${R().people[r.jump].name.split(' ')[0]}`, on: { click: () => { box.close(); jumpTo(r); } } }));
    }
  }
  /** The household's own story, newest first: what really happened to them. */
  function story() {
    head(`The ${data.name} story`);
    if (!data.story.length) body.append(el('p', { class: 'od-tip', text: 'Nothing yet. Give it a day or two.' }));
    // what has been going on, as one thing each; then the days, for the small stuff
    const long = data.threads.filter(th => th.beats.length >= 2).sort((a, b) => b.beats.at(-1)[0] - a.beats.at(-1)[0]);
    for (const th of long) body.append(el('h4', { text: news().title(th) + (th.open ? ', and it is not over' : '') }), el('p', { class: 'od-para', text: news().tale(th) }));
    if (long.length) body.append(el('h4', { text: 'Day by day' }));
    let day = null;
    for (const row of data.story) { const d = news().dayOf(row.t); if (d !== day) { day = d; body.append(el('h4', { text: `Day ${d + 1}` })); } body.append(el('p', { class: 'od-para', text: news().line(row) })); }
  }
  /** The Odd Sheet: every three days, out of what really happened. */
  function paper(i = 0) {
    head('The Odd Sheet');
    if (!data.sheets.length) { body.append(el('p', { class: 'od-tip', text: 'The first issue comes out on day 4.' })); return; }
    const sh = news().sheet(data.sheets[i]);
    body.append(el('p', { class: 'od-tip', text: `Issue ${sh.no}, day ${sh.day + 1}` }), el('h3', { class: 'od-sheet-lead', text: sh.lead.head }), el('p', { class: 'od-para', text: sh.lead.body }));
    if (sh.lead.follow) body.append(el('p', { class: 'od-tip', text: sh.lead.follow }));
    for (const st of sh.stories) { body.append(el('h4', { text: st.head }), el('p', { class: 'od-para', text: st.body })); if (st.follow) body.append(el('p', { class: 'od-tip', text: st.follow })); }
    if (sh.column.length) { body.append(el('h4', { text: `Over the fence, with ${sh.by}` })); for (const t of sh.column) body.append(el('p', { class: 'od-para', text: t })); body.append(el('p', { class: 'od-tip', text: sh.signoff })); }
    body.append(el('p', { class: 'od-tip', text: sh.tally }));
    if (data.sheets[i + 1]) body.append(el('button', { class: 'od-big quiet', type: 'button', text: 'The issue before', on: { click: () => paper(i + 1) } }));
  }
  /** Who's Who: how your people stand with each other, and the town's drama in red. Tap a name to go and look; a feud of yours has its own way to end. */
  function whoswho() {
    head("Who's Who");
    const W = data.who, name = n => n.split(' ')[0], vs = (a, b) => (name(a) === name(b) ? [a, b] : [name(a), name(b)]), btn = (text, cls, run) => body.append(el('button', { class: `od-big quiet ${cls}`, type: 'button', text, on: { click: run } })), look = id => () => { box.close(); showPerson?.(id); };
    for (const m of W.members) {
      body.append(el('h4', { text: m.name }));
      if (m.partner) btn(`❤️ ${m.partner.k === 'married' ? 'Married to' : m.partner.k === 'engaged' ? 'Engaged to' : 'Seeing'} ${m.partner.name}`, 'od-love', look(m.partner.id));
      if (m.flame) btn(`💌 Something going on with ${m.flame.name}`, 'od-love', look(m.flame.id));
      for (const f of m.feuds) { btn(`⚡ Feud with ${f.name}: ${news().causeWord(f.cause)}`, 'od-drama', look(f.id)); if (patch) btn(`Try to patch it up with ${name(f.name)}`, '', () => { box.close(); patch(m.id, f.id); }); }
      for (const f of m.friends) btn(`🙂 Friends with ${f.name}`, '', look(f.id));
      for (const f of m.sour) btn(`😒 Not getting on with ${f.name}`, '', look(f.id));
      if (!m.partner && !m.flame && !m.feuds.length && !m.friends.length && !m.sour.length) body.append(el('p', { class: 'od-tip', text: 'Nobody in particular yet.' }));
    }
    body.append(el('h4', { text: 'The town' }));
    for (const f of W.feuds) { const [a, b] = vs(f.an, f.bn); btn(`⚡ ${a} against ${b}: ${news().causeWord(f.cause)}`, 'od-drama', look(f.a)); }
    for (const r of W.romances) { const [a, b] = vs(r.an, r.bn); btn(`❤️ ${a} and ${b}`, 'od-love', look(r.a)); }
    for (const r of W.married) { const [a, b] = vs(r.an, r.bn); btn(`💍 ${a} and ${b}, newly married`, 'od-love', look(r.a)); }
    if (!W.feuds.length && !W.romances.length && !W.married.length) body.append(el('p', { class: 'od-tip', text: 'A quiet town, for now.' }));
  }
  function map() {
    head('Map');
    const s = world.size / 2, v = document.createElementNS(SVG, 'svg'), w = 1000 / world.size, P = (x, z) => `${((x + s) * w).toFixed(0)},${((z + s) * w).toFixed(0)}`;
    v.setAttribute('viewBox', '0 0 1000 1000'); v.setAttribute('class', 'od-map'); v.setAttribute('role', 'img'); v.setAttribute('aria-label', 'Map of the county');
    const line = (pts, stroke, width) => { const p = document.createElementNS(SVG, 'polyline'); p.setAttribute('points', pts.map(q => P(q[0], q[1])).join(' ')); p.setAttribute('fill', 'none'); p.setAttribute('stroke', stroke); p.setAttribute('stroke-width', width); v.append(p); };
    const dot = (x, z, fill, r = 12) => { const c = document.createElementNS(SVG, 'circle'); const [a, b] = P(x, z).split(','); c.setAttribute('cx', a); c.setAttribute('cy', b); c.setAttribute('r', r); c.setAttribute('fill', fill); c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', 3); v.append(c); };
    const text = (x, z, t) => { const n = document.createElementNS(SVG, 'text'), [a, b] = P(x, z).split(','); n.setAttribute('x', a); n.setAttribute('y', Number(b) - 22); n.setAttribute('text-anchor', 'middle'); n.setAttribute('font-size', 34); n.setAttribute('fill', '#1c2730'); n.textContent = t; v.append(n); };
    line(world.river.pts.filter((_, i) => i % 6 === 0), '#6aa3c4', 12);
    for (const r of world.roads) line(r.pts.filter((_, i) => i % 8 === 0 || i === r.pts.length - 1), r.cls === 'street' ? '#8f8b84' : '#55585d', r.cls === 'street' ? 3 : 6);
    for (const t of world.towns) { dot(t.x, t.z, '#c8775a', 9); text(t.x, t.z, t.name); }
    const T = world.timber; dot(T.landing[0], T.landing[1], '#3f7c40', 10); text(T.landing[0], T.landing[1], 'Wend Wood');
    const me = hands.on ? hands.pos : null, r = R(), who = hold.who >= 0 ? r.people[hold.who] : null, hm = r.places[who?.home ?? r.households[data.id].home], wk = who?.work >= 0 ? r.places[who.work] : null;
    dot(hm.x, hm.z, '#e8a93c');
    if (wk) dot(wk.x, wk.z, '#3f78b5');
    if (me) dot(me.x, me.z, '#c2493d', 14);
    body.append(v, el('p', { class: 'od-tip', text: hands.on ? 'Yellow is home, blue is work, red is you. Pick a place and you will walk there.' : 'Yellow is home, blue is work. Pick a place to look at it.' }));
    const go = (label, x, z) => body.append(el('button', { class: 'od-big quiet', type: 'button', text: label, on: { click: () => { box.close(); goTo(x, z); } } }));
    go('Home', hm.x, hm.z);
    if (wk) go(`Work: ${placeName(wk)}`, wk.x, wk.z);
    go('Wend Mill', T.deck[0], T.deck[1]); go('Wend Wood', T.landing[0], T.landing[1]);
    for (const t of world.towns) go(t.name, t.x, t.z);
  }

  const self = {
    get box() { return box; },
    async open() {
      if (box && document.body.contains(box)) { box.close(); return; }
      await load();
      body = el('div', { class: 'od-phone' });
      box = shell.modal({ title: 'Phone', body: [body], buttons: [] });
      // the close button goes last in the list, so a controller's first press lands on an app, not on closing the Phone
      const panel = box.querySelector('.od-panel'); panel.classList.add('od-phonepanel'); panel.append(box.querySelector('.od-x'));
      home();
    },
    state: () => ({ open: !!(box && document.body.contains(box)), data }),
    /** Straight to one app: gameEye and the tests. */
    async app(name) { await self.open(); ({ bank, jobs, mail, map, calendar, happening, story, paper, whoswho })[name]?.(); },
  };
  return self;
}
