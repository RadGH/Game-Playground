// Farhold — the Production tab of the Holding, and the pill that says something needs you. Round 28.
//
//   "Improve building system and automation … update interfaces."
//
// js/production.js does the thinking (what the base makes, what is stuck and why, what to do about
// it); this file only draws it. It draws INTO the Holding screen (js/civics-ui.js), with that
// screen's own row/pane helpers and civics.css, so it looks like the five tabs beside it and needs
// no stylesheet of its own beyond the few `prod-*` rules at the bottom of civics.css.
//
//   import { productionPanes, createProductionPill } from './production-ui.js';
//   productionPanes({ production, h, actions });   // -> [pane, pane, …] for the Holding's grid
//   const pill = createProductionPill({ mount: document.body, onOpen });
//   pill.update(production.summary());             // once a second
//
// `actions` are callbacks into the game — this file never touches a module that changes state:
//   setKeep(machineId, index, n)   toggle(machineId)   reroute(drillId)
//   setLink(linkId, { only, keep })

const fmt = n => {
  if (!Number.isFinite(n)) return '∞';
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};
const mins = s => (s == null ? '' : s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${fmt(s / 3600)} h`);

/** What one machine's state is called on its badge. One word, and the same word the station screen uses. */
const BADGE = {
  running: 'running', stocked: 'stocked', idle: 'idle', starved: 'starved', blocked: 'blocked',
  unworked: 'unworked', unpowered: 'no power', shed: 'shed', off: 'off',
};

/**
 * The panes, in the order a player reads them: what needs me, what does the base make, then the
 * parts — machines, drills, power, storage, routes.
 */
export function productionPanes({ production, h, actions = {} }) {
  const { el, pane, row, empty, bar, setBar } = h;
  if (!production) return [pane('Production', empty('Nothing to report.'))];

  const badge = (state, ok) => el('span', { class: `prod-badge prod-badge--${ok ? 'ok' : state === 'unworked' || state === 'idle' ? 'warn' : 'bad'}`, text: BADGE[state] || state });
  const button = (text, onclick, title = null) => el('button', { class: 'prod-btn', text, title, onclick });

  // ---------------------------------------------------------------- what needs you
  const alerts = production.alerts();
  const alertPane = pane(`Needs you${alerts.length ? ` (${alerts.length})` : ''}`, alerts.length
    ? alerts.slice(0, 8).map(a => {
      const line = el('div', { class: `civ-row prod-alert prod-alert--${a.level}` }, [
        el('b', { text: a.text }),
        a.age >= 60 ? el('span', { class: 'civ-right', text: mins(a.age) }) : null,
      ]);
      if (a.fix) line.append(el('div', { class: 'civ-sub', text: a.fix }));
      return line;
    })
    : empty('Nothing. Every machine is running, stocked or switched off on purpose.'));

  // ---------------------------------------------------------------- what the base makes
  const flows = production.flows();
  const flowPane = pane('What the base makes, a minute', flows.length
    ? [
      el('div', { class: 'civ-row prod-head' }, [
        el('b', { text: 'Material' }),
        el('span', { class: 'civ-right', text: 'in · out · on hand' }),
      ]),
      ...flows.slice(0, 14).map(f => {
        const net = f.ratedIn - f.ratedOut;
        const note = [
          f.made > 0 || f.used > 0 ? `measured ${fmt(f.made)} made, ${fmt(f.used)} used` : null,
          f.runsOutIn != null ? `runs out in ${mins(f.runsOutIn)}` : null,
        ].filter(Boolean).join(' · ');
        return row(f.name,
          `${fmt(f.ratedIn)} · ${fmt(f.ratedOut)} · ${fmt(f.stock)}`,
          note || (net > 0 ? 'piling up' : net < 0 ? 'being eaten faster than it comes in' : null),
          f.runsOutIn != null ? 'civ-bad' : '');
      }),
    ]
    : empty('Nothing moving yet. A machine with a job and something to eat shows up here.'));

  // ---------------------------------------------------------------- machines
  const machines = production.machines();
  const machinePane = pane('Machines', machines.length
    ? machines.map(m => {
      const line = el('div', { class: 'civ-row prod-machine' }, [
        el('b', { text: m.name }),
        badge(m.state, m.ok),
        el('span', { class: 'civ-note', text: m.recipe || 'nothing queued' }),
      ]);
      const tools = el('div', { class: 'prod-tools' });
      if (m.keep > 0) {
        tools.append(
          el('span', { class: 'civ-note', text: `keep ${m.keep} in stock` }),
          button('−10', () => actions.setKeep?.(m.id, 0, Math.max(0, m.keep - 10)), 'Lower the line by ten'),
          button('+10', () => actions.setKeep?.(m.id, 0, m.keep + 10), 'Raise the line by ten'),
        );
      }
      tools.append(button(m.enabled ? 'Switch off' : 'Switch on', () => actions.toggle?.(m.id)));
      line.append(tools);
      if (m.rated) line.append(el('div', { class: 'civ-sub', text: m.rated }));
      if (!m.ok) {
        line.append(el('div', { class: 'civ-sub prod-why', text: m.text }));
        for (const c of m.chain || []) line.append(el('div', { class: 'civ-sub prod-chain', text: `↳ ${c}` }));
        if (m.fix && !(m.chain || []).includes(m.fix)) line.append(el('div', { class: 'civ-sub prod-fix', text: m.fix }));
      }
      return line;
    })
    : empty('No machines yet. A furnace is the first one most people build.'));

  // ---------------------------------------------------------------- drills
  const drills = production.drills();
  const drillPane = pane('Drills', drills.length
    ? drills.map(d => {
      const line = el('div', { class: 'civ-row prod-drill' }, [
        el('b', { text: `${d.name} · ${d.resourceName}` }),
        badge(d.limit === 'digging' ? 'running' : d.limit, d.ok),
        el('span', { class: 'civ-right', text: `${fmt(d.digPerMinute)}/min dug · ${d.route ? `${fmt(d.route.perMinute)}/min carried` : 'no route'} · ${d.stock} piled` }),
      ]);
      if (d.fix) line.append(el('div', { class: 'civ-sub prod-fix', text: d.fix }));
      if (d.limit === 'no route' || d.limit === 'hauling') {
        line.append(el('div', { class: 'prod-tools' }, [button('Re-route', () => actions.reroute?.(d.id), 'Find the store that takes the most from this drill')]));
      }
      return line;
    })
    : empty('No drills. A Small Drill on a seam needs no power at all.'));

  // ---------------------------------------------------------------- power
  const nets = production.power();
  const powerPane = pane('Power', nets.length
    ? nets.map((n, i) => {
      const b = bar(!n.ok);
      const line = el('div', { class: 'civ-row' }, [
        el('b', { text: `Grid ${i + 1}` }), b,
        el('span', { class: `civ-right ${n.ok ? '' : 'civ-bad'}`, text: n.text }),
      ]);
      setBar(b, n.gen > 0 ? Math.min(1, n.use / n.gen) : 1);
      return line;
    })
    : empty('No generator yet. Most of the first machines burn their own fuel and need none.'));

  // ---------------------------------------------------------------- storage
  const pools = production.storage();
  const storePane = pane('Storage', pools.length
    ? pools.map(p => {
      const b = bar(p.fraction >= 0.9);
      const line = el('div', { class: 'civ-row' }, [
        el('b', { text: p.name }), b,
        el('span', { class: 'civ-right', text: `${Math.round(p.load)} / ${Math.round(p.cap)}` }),
      ]);
      setBar(b, p.fraction);
      if (p.top.length) line.append(el('div', { class: 'civ-sub', text: p.top.map(t => `${fmt(t.n)} ${t.name.toLowerCase()}`).join(' · ') }));
      for (const r of p.refusing || []) line.append(el('div', { class: 'civ-sub civ-bad', text: `Turning away ${r.name.toLowerCase()}: ${r.why}.` }));
      if (p.join) line.append(el('div', { class: 'civ-sub prod-fix', text: `Near ${p.join.toName}: ${p.join.text}` }));
      return line;
    })
    : empty('No stores. A Storage Box is logs and fibre.'));

  // ---------------------------------------------------------------- supply routes
  const links = production.links();
  const routePane = pane('Supply routes', links.length
    ? links.map(l => {
      const line = el('div', { class: 'civ-row prod-route' }, [
        el('b', { text: `${l.fromName} → ${l.toName}` }),
        el('span', { class: 'civ-right', text: `loads of ${l.batch}${l.onRoad.length ? ` · ${l.onRoad.length} on the road` : ''}` }),
      ]);
      /**
       * BOTH FLOORS, SIDE BY SIDE. The route leaves its own `keep` behind of everything it carries,
       * and it also leaves whatever line a keep-in-stock machine at the sending end is holding —
       * the higher of the two. Shown together so "why is the route not taking the ingots" has its
       * answer on the same line.
       */
      const floors = el('div', { class: 'prod-tools' }, [
        el('span', { class: 'civ-note', text: `leaves ${l.keep} of each behind` }),
        button('−10', () => actions.setLink?.(l.id, { keep: Math.max(0, l.keep - 10) })),
        button('+10', () => actions.setLink?.(l.id, { keep: l.keep + 10 })),
      ]);
      line.append(floors);
      for (const x of l.held || []) {
        line.append(el('div', { class: 'civ-sub', text: `${x.name}: a machine there keeps ${x.line} in stock, so the route leaves ${Math.max(x.line, l.keep)}.` }));
      }
      // what it carries: every material at the sending end, each a toggle; none ticked = everything
      const chips = el('div', { class: 'prod-chips' });
      const only = l.only ? new Set(l.only) : null;
      for (const m of l.materials || []) {
        const on = !only || only.has(m.res);
        chips.append(el('button', {
          class: `prod-chip${on ? ' on' : ''}`, text: m.name,
          title: on ? 'Carried. Click to keep it here.' : 'Kept here. Click to carry it.',
          onclick: () => {
            const all = (l.materials || []).map(x => x.res);
            const next = new Set(only || all);
            if (on) next.delete(m.res); else next.add(m.res);
            actions.setLink?.(l.id, { only: next.size === all.length ? null : [...next] });
          },
        }));
      }
      if ((l.materials || []).length) {
        line.append(el('div', { class: 'civ-sub', text: only ? 'Carries only the lit ones:' : 'Carries everything. Click one to keep it here:' }));
        line.append(chips);
      }
      return line;
    })
    : empty('No supply routes. On the map (M), Supply, draw one from a mine to home.'));

  return [alertPane, flowPane, machinePane, drillPane, powerPane, storePane, routePane];
}

/**
 * THE PILL. "2 things at your base need you — K". Hidden when nothing does; a click opens the tab.
 * It lives on the page rather than in js/hud.js for the same reason the hold readout does
 * (js/civics-ui.js): it has to be readable while you are walking about.
 */
export function createProductionPill({ mount = document.body, onOpen = null } = {}) {
  const node = document.createElement('button');
  node.className = 'prod-pill';
  node.id = 'prod-pill';
  node.hidden = true;
  node.title = 'Open the Production tab of the Holding';
  node.addEventListener('click', () => onOpen?.());
  mount.appendChild(node);
  let last = '';
  return {
    update(summary) {
      const text = summary?.alerts ? `${summary.text} — K` : '';
      if (text === last) return;
      last = text;
      node.textContent = text;
      node.hidden = !text;
      node.classList.toggle('prod-pill--bad', (summary?.bad || 0) > 0);
    },
    get node() { return node; },
  };
}
