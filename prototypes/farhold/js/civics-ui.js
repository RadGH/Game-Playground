// Farhold — the Holding screen, and the card that tells you what happened while you were away.
//
// ITS OWN FILE, AND THAT IS THE POINT. js/hud.js is 3 100 lines and carries nine other screens; a
// sixth tab bolted into it would be the tenth thing that has to be right for the character sheet to
// open. This draws into a <div> of its own, loads civics.css itself, and asks js/main.js for
// exactly two things: somewhere to append, and a `read()` that hands back js/civics.js's report.
//
//   import { createCivicsScreen } from './civics-ui.js';
//   const holding = createCivicsScreen({ civics, colony, works, player, log: hud.log });
//   holding.toggle();            // `K`
//   holding.showAway(report);    // after a landing or a load
//
// No inline styles anywhere — every rule is in civics.css, per the house rule. The stylesheet is
// injected by this module rather than linked from index.html so that adding a whole screen to the
// game touches neither the page nor style.css.

const CSS_HREF = 'civics.css';

/** One element, with children. Small enough that a helper library would be the heavier option. */
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

const bar = (warm = false) => el('span', { class: `civ-bar${warm ? ' civ-bar--warm' : ''}` }, [el('i', {})]);

/**
 * A bar's width is the one thing that genuinely cannot live in a stylesheet — it is the datum the
 * bar exists to show. Everything about how the bar LOOKS is still civics.css's business.
 */
function setBar(node, fraction) {
  const fill = node.querySelector('i');
  if (fill) fill.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
}

function row(label, right, note = null, cls = '') {
  const kids = [el('b', { text: label })];
  if (note) kids.push(el('span', { class: 'civ-note', text: note }));
  if (right != null) kids.push(el('span', { class: `civ-right ${cls}`.trim(), text: String(right) }));
  return el('div', { class: 'civ-row' }, kids);
}

function pane(title, kids) {
  return el('div', { class: 'civ-pane' }, [el('h3', { text: title }), ...[].concat(kids)]);
}

const empty = text => el('div', { class: 'civ-empty', text });
const pct = n => `${Math.round((n || 0) * 100)}%`;

export const CIVICS_TABS = [
  { key: 'people', name: 'People' },
  { key: 'houses', name: 'Houses' },
  { key: 'work', name: 'Work' },
  { key: 'traders', name: 'Traders' },
  { key: 'trade', name: 'Trade' },
  /**
   * R14 — THE MUSTER.
   *
   *   "Allow the town center to initiate wave defense minigames that reward loot or resources for
   *    victory, or just nothing if defeated besides death penalty if the player dies. No need to
   *    penalize for a minigame."
   *
   * Its own tab rather than a row on the notice board, because the notice board is where the
   * world's work is and this is yours. Four ranks, always all four, each greyed with the SENTENCE
   * saying why — a greyed row with no reason is the one answer a player cannot act on.
   */
  { key: 'muster', name: 'Muster' },
];

export function createCivicsScreen({
  civics = null, colony = null, works = null,
  getPlayer = () => ({ gold: 0 }), getDay = () => 1,
  log = null, mount = document.body,
  /**
   * R17 — THE HOLDING IS A TAB NOW.
   *
   *   "Pressing K opens a new civilization menu, which I like. However it does not free up the
   *    cursor so I have to press ESC afterwards… I think the combat log could simply be added to
   *    the inventory screen as the 8th tab. In fact, the new civilization menu could probably live
   *    there too."
   *
   * Nothing about this screen changes: it keeps its own markup, its own stylesheet and its own
   * rail. `embedded` only says that something else owns the window — so it drops the fixed
   * full-screen positioning and its own close button, and lets the character sheet's one Esc, one
   * cursor hand-off and one set of number keys cover it. The stand-alone form still works; the
   * `away` card and the hold readout are deliberately NOT embedded, because both have to be
   * readable while you are walking about.
   */
  embedded = false, awayMount = document.body,
  /**
   * R14 — the muster needs two things this module must not know how to do: where you are standing
   * (so a drill is called AT somewhere) and how to put the wave on the ground. Both are callbacks,
   * so js/civics-ui.js stays a screen and nothing else.
   */
  musterAt = () => null, onMuster = null,
} = {}) {
  // the stylesheet, once, and never a second copy if a save is reloaded in place
  if (!document.querySelector(`link[href="${CSS_HREF}"]`)) {
    document.head.appendChild(el('link', { rel: 'stylesheet', href: CSS_HREF }));
  }

  let tab = 'people';
  let open = false;

  const body = el('div', { class: 'civics-body' });
  const railButtons = new Map();
  const rail = el('div', { class: 'civics-rail' },
    CIVICS_TABS.map(t => {
      const b = el('button', { text: t.name, onclick: () => { tab = t.key; draw(); } });
      railButtons.set(t.key, b);
      return b;
    }));
  const subtitle = el('span', { class: 'civics-sub' });
  const head = el('div', { class: 'civics-head' }, [
    el('h2', { text: 'The Holding' }),
    subtitle,
    // embedded, the sheet's own × is the close button; two of them side by side is a question
    embedded ? null : el('button', { class: 'civics-close', text: 'Close  (K)', onclick: () => hide() }),
  ]);
  const root = el('div', { class: `civics${embedded ? ' civics--tab' : ''}`, hidden: true }, [head, rail, body]);
  mount.appendChild(root);

  // the away card and the hold readout live beside it rather than inside it, because both have to
  // be visible while the player is walking about — which is why they mount on the page even when
  // the screen itself is a tab inside the character sheet
  const awayCard = el('div', { class: 'civ-away', hidden: true });
  awayMount.appendChild(awayCard);
  const holdReadout = el('div', { class: 'civ-hold', hidden: true });
  awayMount.appendChild(holdReadout);

  function say(t, k) { if (log) log(t, k); }

  // ------------------------------------------------------------------ the five tabs

  function drawPeople(r) {
    const people = r.people || [];
    if (!people.length) return [pane('Nobody lives here yet', empty('Build a bed, then recruit somebody out of a village or wait for one to walk in.'))];
    const c = r.colony || {};
    return [
      pane('The holding', [
        row('People', people.length, `${c.housed || 0} under a roof`),
        row('Minding a machine', c.tending || 0, 'one worker is one furnace'),
        row('Standing a watch', c.posted || 0),
        row('Traders', c.traders || 0, 'they pay rent, not tax'),
        row('In the purse', `${c.gold || 0} gold`, null, 'civ-gold'),
        row('Rent a day', `+${c.rent || 0}`, 'a trader pays more than two citizens, and costs you a bed', 'civ-gold'),
        row('Wages a day', `−${c.wages || 0}`, null, c.wages ? 'civ-bad' : ''),
      ]),
      pane('Everybody', people.map(p => row(
        p.name,
        `${p.unitsToday ?? 0} units today`,
        p.line.replace(`${p.name} — `, ''),
        p.housed ? '' : 'civ-bad',
      ))),
    ];
  }

  function drawHouses(r) {
    const h = r.housing || {};
    const houses = civics?.housing?.houses?.() || [];
    const utils = civics?.housing?.utilities?.() || [];
    const summary = pane('Beds', [
      row('Beds', h.beds || 0, `${h.taken || 0} taken, ${h.spare || 0} going spare`),
      row('Comfort, on average', pct(h.meanComfort), 'a bedroll in the mud is nothing; a cottage with a well, a hearth and a privy is four-fifths'),
      row('Best free bed', h.best ? `${pct(h.best.comfort)} — ${h.best.house}` : 'none', 'this is the one a trader is offered'),
      row('Utilities working', h.utilities || 0, (h.utilityKinds || []).join(', ') || 'none yet'),
    ]);
    const dark = (h.dark || []).length
      ? pane('Not doing anything', (h.dark || []).map(d => row(d.name, null, d.why, 'civ-bad')))
      : null;
    const list = houses.length
      ? pane('Every house', houses.map(x => {
        const served = civics.housing.servedBy(x.entryId).map(s => s.words).join(', ');
        return row(x.name, `${x.beds} bed${x.beds === 1 ? '' : 's'} · ${pct(x.comfort)}`, served || 'nothing reaches it');
      }))
      : pane('Every house', empty('Nothing here is a house yet. A bunkhouse is timber, planks and cloth.'));
    const you = pane('Utilities', utils.length
      ? utils.map(u => row(u.name, `${Math.round(u.radius)} m`, u.live ? `${u.kind} · +${pct(u.comfort)}` : u.why, u.live ? '' : 'civ-bad'))
      : empty('A well, a hearth and a privy between them are worth nearly half a point of comfort, and the privy is the cheapest point in the game.'));
    return [summary, list, you, dark].filter(Boolean);
  }

  function drawWork(r) {
    const machines = r.machines || [];
    if (!machines.length) return [pane('No machines', empty('Build a furnace. Put ore in reach of it. Bind somebody to it.'))];
    return [
      pane('What is being worked', machines.map(m => {
        const b = bar(true);
        const line = el('div', { class: 'civ-row' }, [
          el('b', { text: m.name }),
          el('span', { class: 'civ-note', text: m.stateText }),
          b,
          el('span', { class: 'civ-right', text: m.needsWorking ? `${Math.round(m.workBank)}s of work paid for` : 'needs nobody' }),
        ]);
        setBar(b, m.workBankMax ? m.workBank / m.workBankMax : 0);
        return line;
      })),
      pane('How this works', [
        row('One work unit', '30 seconds of a machine running', 'a swing of your arm, an hour of a citizen’s shift and an hour of a Tender Arm are the same unit'),
        row('One worker', 'about one furnace', 'a smelter puts in roughly ten units a day, which is three-quarters of a shift'),
        row('At night', 'everything goes cold', 'the answer is a Tender Arm, built out of what your people smelted by day'),
      ]),
    ];
  }

  function drawTraders(r) {
    const rows = r.traders || [];
    const inHouse = rows.filter(t => t.state === 'here');
    const rest = rows.filter(t => t.state !== 'here');
    return [
      pane(`In residence (${inHouse.length} of ${rows.length})`, inHouse.length
        ? inHouse.map(t => row(t.name, `${t.rentPerDay} gold a day`, t.sells))
        : empty('Nobody has set up here yet. Two people and a spare bed is all a Quartermaster asks for.')),
      pane('Would set up here, but…', rest.length
        ? rest.map(t => row(t.name, t.state === 'offered' ? 'waiting on you' : null, t.why || t.blurb, t.state === 'offered' ? 'civ-gold' : ''))
        : empty('Everybody who would come has come.')),
    ];
  }

  /**
   * R14 — FOUR RANKS, ALWAYS ALL FOUR.
   *
   * The Alarm Bell stays exactly what it is: the REAL raid, which pays standing and can cost you a
   * wall. This is the DRILL. Two objects, two meanings, and the panel says which is which every
   * time — because the one thing that would make this feature a trap is a player ringing for a
   * practice fight and losing a granary to it.
   *
   * Losing costs nothing at all beyond whatever dying already costs you. That is the user's own
   * condition, and js/muster.js enforces it in `loseRaid` rather than at the call site — a call
   * site that re-derived the loss from raids.json would bypass the flag and a minigame would
   * quietly start eating walls.
   */
  function drawMuster(r) {
    const spot = musterAt() || null;
    if (!spot) {
      return [pane('Call a muster', empty(
        'Stand at your own holding, or at a town notice board, and the ranks appear here. '
        + 'A muster is a practice fight: you pick the rank, it pays on a win, and losing one costs '
        + 'nothing beyond whatever dying already costs you.'))];
    }
    const rows = civics?.muster?.board?.({
      placeId: spot.placeId, base: spot.base, level: spot.level, at: spot.at,
    }) || [];
    const live = civics?.muster?.quest || null;

    const list = rows.map(t => {
      const line = el('div', { class: 'civ-row' + (t.ready ? '' : ' civ-dim') },
        el('b', { text: t.name }),
        el('span', { class: 'civ-note', text: `${t.waves} waves · level ${t.level} · ${t.gold[0]}–${t.gold[1]} gold` }));
      line.append(el('div', { class: 'civ-sub', text: t.ready ? t.text : t.why }));
      if (t.ready && !live) {
        line.append(el('button', {
          class: 'civ-go', text: 'Call it',
          onclick: () => { onMuster?.(t.key, spot); draw(); },
        }));
      }
      return line;
    });

    return [
      pane(live ? 'On the field now' : `Call a muster at ${spot.placeName || 'here'}`,
        live
          ? [el('div', { class: 'civ-row' }, el('b', { text: live.name || 'A muster' }),
            el('span', { class: 'civ-note', text: `wave ${live.wave || 1} of ${live.count || '?'}` })),
          el('div', { class: 'civ-sub', text: 'Stay near the muster ground or it is called off.' })]
          : list),
      pane('What a muster is', [
        el('div', { class: 'civ-sub', text:
          'A practice fight you ask for. Win it and you are paid in gold and crates; lose it and '
          + 'nothing happens at all — no wall comes down, no materials are taken, nobody leaves, and '
          + 'your standing is untouched. Dying costs what dying always costs and no more.' }),
        el('div', { class: 'civ-sub', text:
          'The Alarm Bell is the other thing: that one is real, it pays standing, and it can cost '
          + 'you a building.' }),
      ]),
    ];
  }

  function drawTrade(r) {
    const hold = r.hold || { text: '0 / 0 kg', fraction: 0 };
    const b = bar();
    const holdPane = pane('The hold', [
      el('div', { class: 'civ-row' }, [el('b', { text: 'Carrying' }), b, el('span', { class: 'civ-right', text: hold.text })]),
      ...(r.holdRows || []).map(x => row(x.name, `${x.n} · ${x.kg} kg`, `${x.each} kg each, worth about ${x.value} gold`)),
      ...((r.holdRows || []).length ? [] : [empty('Nothing in it. A workshop is planks, iron and rope, and fourteen of the twenty-two goods are made on one.')]),
    ]);
    setBar(b, hold.fraction);

    const posts = pane('Trade Posts', (r.tradePosts || []).length
      ? (r.tradePosts || []).map(p => row(p.name, `${Math.round(p.x)}, ${Math.round(p.z)}`, 'a route may start or end here'))
      : empty('A Trade Post holds two tonnes of finished goods and is the only place a route can start or end.'));

    const routes = pane('On the road', (r.routes || []).length
      ? (r.routes || []).map(x => row(
        `${x.carrierName} to ${x.toName}`,
        x.state === 'travelling' ? `${Math.max(0, Math.round(x.left / 60))} min` : x.state,
        `${x.kg} kg · ${x.guards} guard${x.guards === 1 ? '' : 's'} · ${pct(x.risk)} risk · ${x.profit} gold if it gets there`,
        x.state === 'lost' ? 'civ-bad' : x.state === 'arrived' ? 'civ-good' : '',
      ))
      : empty('No carts out. A run pays roughly what a fight does and does it while you are somewhere else.'));

    return [holdPane, posts, routes];
  }

  // ------------------------------------------------------------------ drawing

  function draw() {
    if (!open) return;
    const r = civics?.report?.({ day: getDay(), gold: getPlayer()?.gold || 0 }) || {};
    for (const [key, btn] of railButtons) btn.classList.toggle('on', key === tab);
    const c = r.colony || {};
    subtitle.textContent = `${c.citizens || 0} people · ${r.housing?.beds || 0} beds · ${(r.traders || []).filter(t => t.state === 'here').length} traders · ${c.gold || 0} gold`;
    body.textContent = '';
    const panes = tab === 'people' ? drawPeople(r)
      : tab === 'houses' ? drawHouses(r)
      : tab === 'work' ? drawWork(r)
      : tab === 'traders' ? drawTraders(r)
      : tab === 'trade' ? drawTrade(r)
      : drawMuster(r);
    body.appendChild(el('div', { class: 'civ-grid' }, panes));
  }

  function show(which = null) { if (which) tab = which; open = true; root.hidden = false; draw(); }
  function hide() { open = false; root.hidden = true; }
  function toggle(which = null) { if (open) hide(); else show(which); }

  // ------------------------------------------------------------------ the away card

  /**
   * "While you were away" — a card, NOT a modal that blocks the world.
   *
   * Dismissed with Esc or a click, repeated on demand from the Holding screen, and never shown at
   * all for an absence under a game day. Every line on it is a real diff collected as the window
   * ran rather than a rate multiplied by a time — which is also why it can honestly say *"the
   * furnace has been cold since day six"*.
   */
  function showAway(report) {
    if (!report || !report.lines?.length) return null;
    awayCard.textContent = '';
    awayCard.appendChild(el('h3', { text: 'While you were away' }));
    for (const line of report.lines) awayCard.appendChild(el('p', { text: line }));
    awayCard.appendChild(el('button', {
      class: 'civ-away-close', text: 'Close',
      onclick: () => { awayCard.hidden = true; },
    }));
    awayCard.hidden = false;
    say(report.lines[0], 'level');
    return report;
  }

  /**
   * The one compact readout on the HUD, and only when the hold is not empty.
   *
   * This is the whole of §6.6's HUD change, and it lives here rather than in js/hud.js for exactly
   * the reason the screen does.
   */
  function drawHold() {
    const hold = civics?.hold;
    if (!hold || hold.empty) { holdReadout.hidden = true; return; }
    const b = hold.bar();
    holdReadout.textContent = '';
    const meter = bar();
    holdReadout.appendChild(meter);
    holdReadout.appendChild(el('span', { text: b.text }));
    setBar(meter, b.fraction);
    holdReadout.hidden = false;
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!awayCard.hidden) { awayCard.hidden = true; return; }
      // R17: embedded, the character sheet owns Esc. Hiding ourselves here would leave the sheet
      // open on an empty tab, which is the worse half of both answers.
      if (open && !embedded) hide();
    }
  });

  return {
    show, hide, toggle, draw, showAway, drawHold,
    get open() { return open; },
    get root() { return root; },
    set tab(t) { tab = t; draw(); },
  };
}
