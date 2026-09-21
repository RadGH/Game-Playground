// Farhold — the Town Hall: what a settlement is, who is in it, and who will come away with you.
//
//   "The towns big enough to support a population should support a Town Hall which you can interact
//    with to see an overview of the town, resources, population and assignments, total population,
//    and this is also where we can put some new quests or other systems."
//
// A hall already stood in every settlement of size 3 or more — `BUILDING_INFO.hall` in
// js/town-plan.js, `{ cap: 200, solid: [6, 8], from: 3, role: 'elder' }` — and it was scenery with
// an old man standing near it. `interactTarget` in js/main.js had no branch for a BUILDING at all;
// the only thing you could walk up to in a town was the notice board.
//
// It is also the answer to "recruit NPCs from town (random npcs, not like shops)". Recruiting was
// buried inside an ordinary conversation with whoever you happened to be talking to, which meant
// the way to grow your holding was to walk round a market clicking on people. A hall is where you
// would go to hire somebody, so that is where it is.
//
//   const hall = createTownHall({ read, onRecruit, onDecline, log });
//   hall.open(town);          // `E` at the hall
//
// Its own file and its own stylesheet, for the reason js/civics-ui.js is its own file: js/hud.js is
// three and a half thousand lines and carries nine screens already.

const CSS_HREF = 'civics.css';

function el(tag, attrs = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of [].concat(kids)) if (kid) node.appendChild(kid);
  return node;
}

function row(label, right, note = null) {
  const kids = [el('b', { text: label })];
  if (note) kids.push(el('span', { class: 'civ-note', text: note }));
  if (right != null) kids.push(el('span', { class: 'civ-right', text: String(right) }));
  return el('div', { class: 'civ-row' }, kids);
}

const pane = (title, kids) => el('div', { class: 'civ-pane' }, [el('h3', { text: title }), ...[].concat(kids)]);
const empty = text => el('div', { class: 'civ-empty', text });

export const HALL_TABS = [
  { key: 'town', name: 'The town' },
  { key: 'people', name: 'Your people' },
  { key: 'hire', name: 'Take somebody on' },
  { key: 'work', name: 'Work' },
];

/**
 * `read(town)` hands back everything the screen draws, so this file knows nothing about colonies,
 * factions or quests:
 *
 *   {
 *     town:   { name, kind, size, faction, factionName, standing, headcount, roles: [{name, n}] },
 *     goods:  [{ name, n }],                     // what the settlement trades in
 *     pop:    { used, cap, spare, houses, started, line },
 *     people: [{ id, name, line, station, housed }],
 *     offers: [{ id, name, job, price, skillWord, text, ok, why }],
 *     jobs:   [{ id, title, text, reward }],     // the board, so a hall is somewhere to find work
 *     work:   [{ id, name, state, fraction, credit }],
 *   }
 */
export function createTownHall({ read = () => ({}), onRecruit = null, onTakeJob = null, log = () => {} } = {}) {
  if (!document.querySelector(`link[href="${CSS_HREF}"]`)) {
    document.head.append(el('link', { rel: 'stylesheet', href: CSS_HREF }));
  }
  /**
   * Built out of civics.css's own look — a screen with a private copy of somebody else's palette is
   * two screens to keep in step the first time a colour moves. But NOT out of its structural class
   * names: `.civics-head`, `.civics-rail` and `.civics-body` are what the Holding screen's own
   * tests reach for with `document.querySelector`, and two elements wearing them means the first
   * one in the document wins — which is how a hidden Town Hall silently became the thing a test
   * was reading the Holding screen's muster text out of. The three structural names are ours;
   * everything inside (`.civ-pane`, `.civ-row`, `.civ-grid`) is shared on purpose, because those
   * are components rather than landmarks.
   */
  const root = el('div', { class: 'civics hall-screen', id: 'town-hall' });
  root.hidden = true;
  const head = el('div', { class: 'hall-head' });
  const rail = el('nav', { class: 'hall-rail' });
  const body = el('div', { class: 'hall-body' });
  root.append(head, rail, body);
  document.body.append(root);

  let open = false;
  let tab = 'town';
  let town = null;

  function drawRail() {
    rail.replaceChildren(...HALL_TABS.map(t => el('button', {
      class: t.key === tab ? 'on' : null,
      text: t.name,
      onclick: () => { tab = t.key; draw(); },
    })));
  }

  function draw() {
    if (!open) return;
    const r = read(town) || {};
    const T = r.town || {};
    head.replaceChildren(
      el('h2', { text: T.name ? `${T.name} — Town Hall` : 'Town Hall' }),
      el('span', { class: 'hall-sub', text: `${T.kind || 'settlement'}${T.factionName ? ` \u00b7 ${T.factionName}` : ''}` }),
      el('button', { class: 'hall-close', text: 'Close', onclick: () => toggle(false) }),
    );
    drawRail();
    body.replaceChildren(
      tab === 'town' ? drawTown(r)
        : tab === 'people' ? drawPeople(r)
        : tab === 'hire' ? drawHire(r)
        : drawWork(r),
    );
  }

  function drawTown(r) {
    const T = r.town || {};
    const kids = [
      pane('This place', [
        row('People living here', T.headcount ?? '\u2014'),
        row('Size', T.size ?? '\u2014', T.size >= 4 ? 'walled' : 'open'),
        T.factionName ? row('Held by', T.factionName, T.standingWord || null) : null,
      ].filter(Boolean)),
      pane('Who is here', (T.roles || []).length
        ? (T.roles || []).map(x => row(x.name, x.n))
        : empty('Nobody worth listing.')),
      pane('What they trade in', (r.goods || []).length
        ? (r.goods || []).map(g => row(g.name, g.n ?? ''))
        : empty('Whatever comes up the road.')),
    ];
    /**
     * YOUR holding's population, shown in a TOWN hall, because this is where you come to grow it —
     * and a number you can only read from the other side of the world is no use when you are stood
     * in front of the person you want to hire.
     */
    const p = r.pop;
    if (p) {
      kids.push(pane('Your holding', [
        row('Population', p.line, p.started ? `${p.houses} house${p.houses === 1 ? '' : 's'}` : 'build a house first'),
        row('Room to grow', p.started ? String(p.spare) : '\u2014',
          p.started && p.spare <= 0 ? 'every bed is taken' : null),
      ]));
    }
    return el('div', { class: 'civ-grid' }, kids);
  }

  function drawPeople(r) {
    const people = r.people || [];
    return el('div', { class: 'civ-grid' }, [
      pane(`Your people (${people.length})`, people.length
        ? people.map(c => row(c.name, c.station ? 'at a station' : 'free', c.line))
        : empty('Nobody works for you yet. Take somebody on, over on the next tab.')),
      pane('Assignments', people.length
        ? people.map(c => row(c.name, c.job || '\u2014', c.housed ? null : 'no bed'))
        : empty('Nothing to assign.')),
    ]);
  }

  function drawHire(r) {
    const offers = r.offers || [];
    const p = r.pop || {};
    const kids = [];
    if (!offers.length) {
      kids.push(empty(p.started
        ? 'Nobody here is looking for work today. Come back tomorrow.'
        : 'Build a house at your holding and somebody here will consider it.'));
    }
    for (const o of offers) {
      const actions = el('div', { class: 'civ-actions' });
      const b = el('button', {
        text: `Take ${o.name} on \u2014 ${o.price} gold`,
        onclick: () => { onRecruit?.(o); draw(); },
      });
      b.disabled = !o.ok;
      actions.append(b);
      kids.push(row(o.name, o.price ? `${o.price}g` : '', `${o.job}${o.text ? ' \u2014 ' + o.text : ''}`));
      if (!o.ok && o.why) kids.push(el('div', { class: 'civ-row civ-dim' }, [el('span', { class: 'civ-bad', text: o.why })]));
      kids.push(actions);
    }
    return el('div', { class: 'civ-grid' }, [pane('Looking for work', kids)]);
  }

  function drawWork(r) {
    const jobs = r.jobs || [];
    const work = r.work || [];
    return el('div', { class: 'civ-grid' }, [
      pane('Work going on at your holding', work.length
        ? work.map(w => row(w.name, `${Math.round((w.fraction || 0) * 100)}%`, w.credit || w.state))
        : empty('Nothing is being made right now.')),
      pane('Work going begging here', jobs.length
        ? jobs.map(j => {
          const line = row(j.title, j.reward || '', j.text);
          if (onTakeJob) {
            const actions = el('div', { class: 'civ-actions' });
            actions.append(el('button', { text: 'Take it', onclick: () => { onTakeJob(j); draw(); } }));
            line.append(actions);
          }
          return line;
        })
        : empty('The board is empty. Try again after something happens.')),
    ]);
  }

  function toggle(on = !open) {
    open = !!on;
    root.hidden = !open;
    document.body.classList.toggle('popup-open', open);
    if (open) draw();
  }

  return {
    root,
    get isOpen() { return open; },
    open(t) { town = t || null; tab = 'town'; toggle(true); },
    close() { toggle(false); },
    toggle,
    refresh: draw,
  };
}
