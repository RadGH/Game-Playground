// Farhold — the Research screen: four ages, what each node opens, and what to go and do for the
// next point.
//
// ITS OWN FILE AND ITS OWN STYLESHEET, the way js/civics-ui.js is. js/hud.js is three and a half
// thousand lines and already carries nine screens; it hands a mounted screen a box and calls
// `draw()`, and everything else about this one lives here.
//
//   import { createResearchScreen } from './research-ui.js';
//   const screen = createResearchScreen({ research, log: hud.log });
//   screen.mount(document.getElementById('sheet-body-research'));
//   hud.mount('research', screen);            // the tab appears the moment this runs
//
// It can also stand on its own as an overlay — `createResearchScreen({ standalone: true })` — which
// is how the build panel opens it, because the question "why can I not build this" is asked in the
// build panel and the answer is here.
//
// THE ONE RULE OF THE LAYOUT: every node is visible from the first minute, including the ones you
// cannot touch for ten hours. A tech tree that hides its far end is a tech tree that cannot be
// planned against, and the point of four ages is that the player can see where the fourth one is.
// What a node you cannot buy shows is the SENTENCE saying what is missing — "Steelwork and Ground
// Glass first", "4 more research points" — never a grey box with nothing in it.

import { el } from '../../../shared/ui.js';

const CSS_HREF = 'research.css';

/**
 * `research` is a js/research.js instance (usually `sharedResearch()`). `log` is optional; without
 * it the screen is silent, which is what a node test wants.
 */
export function createResearchScreen({ research = null, log = null, standalone = false, mount = null } = {}) {
  if (typeof document !== 'undefined' && !document.querySelector(`link[href="${CSS_HREF}"]`)) {
    document.head.appendChild(el('link', { rel: 'stylesheet', href: CSS_HREF }));
  }

  const head = el('div', { class: 'res-head' });
  const body = el('div', { class: 'res-body' });
  const root = el('div', { class: 'research' + (standalone ? ' research--overlay' : ''), id: standalone ? 'research-overlay' : null });
  root.append(head, body);
  if (standalone) root.hidden = true;

  let open = !standalone;

  function say(t, k) { log?.(t, k); }

  // ------------------------------------------------------------------ the head

  function drawHead() {
    head.replaceChildren();
    const s = research?.summary?.() || { points: 0, taken: 0, total: 0, ready: 0 };
    head.append(el('h2', { text: 'Research' }));
    head.append(el('span', { class: 'res-points', text: `${s.points} point${s.points === 1 ? '' : 's'} to spend` }));
    head.append(el('span', { class: 'res-sub small muted', text: `${s.taken} of ${s.total} researched${s.ready ? ` · ${s.ready} ready now` : ''}` }));
    if (standalone) {
      head.append(el('button', { class: 'res-close', text: 'Close  (Esc)', onclick: () => api.hide() }));
    }
  }

  // ------------------------------------------------------------------ where points come from

  /**
   * THE LEDGER, AND WHY IT IS ON THIS SCREEN RATHER THAN IN THE DOCS.
   *
   * "I think our research system can unlock research points by completing quests or exploring or
   * defeating bosses." A player who reads "4 points" and nothing else has no idea which of the
   * three to go and do. The three lines below are always shown, whether or not you have earned any
   * of that kind, because the list is the instruction.
   */
  function drawEarning() {
    const rows = research?.ledgerRows?.() || [];
    const byReason = new Map(rows.map(r => [r.reason, r]));
    const names = research?.data?.reasons || {};
    const worth = research?.data?.points || {};
    const pane = el('section', { class: 'res-pane res-earn' });
    pane.append(el('h3', { text: 'Where points come from' }));
    pane.append(el('p', { class: 'small muted', text: 'Nothing here is bought with materials or with gold. A point is something you did.' }));
    for (const reason of Object.keys(names)) {
      if (reason === 'default') continue;
      const got = byReason.get(reason);
      pane.append(el('div', { class: 'res-earn-row' },
        el('b', { text: names[reason] }),
        el('span', { class: 'small muted', text: `${worth[reason] ?? 1} point${(worth[reason] ?? 1) === 1 ? '' : 's'} each` }),
        el('span', { class: 'res-earn-n', text: String(got?.count || 0) })));
    }
    return pane;
  }

  // ------------------------------------------------------------------ the ages

  function drawNode(node) {
    const card = el('div', {
      class: 'res-node'
        + (node.taken ? ' res-node--done' : '')
        + (!node.taken && node.ok ? ' res-node--ready' : '')
        + (node.blocked ? ' res-node--blocked' : ''),
    });
    card.append(el('div', { class: 'res-node-head' },
      el('b', { text: node.name }),
      el('span', { class: 'res-cost', text: node.taken ? 'researched' : `${node.cost} pt${node.cost === 1 ? '' : 's'}` })));
    if (node.blurb) card.append(el('p', { class: 'res-blurb small', text: node.blurb }));
    if (node.needNames?.length) {
      card.append(el('p', { class: 'small muted', text: `After ${node.needNames.join(' and ')}.` }));
    }
    card.append(el('p', { class: 'res-opens small', text: `Opens: ${node.opens.join(', ')}` }));
    if (node.why) card.append(el('p', { class: 'res-why small muted', text: node.why }));

    if (node.taken) {
      card.append(el('span', { class: 'res-verdict res-verdict--done', text: 'Done' }));
    } else {
      const b = el('button', {
        class: 'res-buy',
        text: `Research ${node.name}`,
        onclick: () => {
          const out = research.buy(node.id);
          if (!out.ok) say(out.why, 'warn');
          draw();
        },
      });
      b.disabled = !node.ok;
      card.append(b);
      // the sentence, always — a greyed-out button with nothing beside it is the one answer a
      // player cannot act on, which is the house rule the Holding screen already follows
      if (!node.ok) card.append(el('span', { class: 'res-verdict', text: node.why }));
    }
    return card;
  }

  function drawAges() {
    const out = [];
    for (const age of research?.board?.() || []) {
      const pane = el('section', { class: 'res-pane res-age' });
      pane.append(el('div', { class: 'res-age-head' },
        el('i', { class: 'res-tone', style: `background:${age.tone || '#888'}` }),
        el('h3', { text: age.name })));
      if (age.blurb) pane.append(el('p', { class: 'small muted', text: age.blurb }));
      if (!age.nodes.length) {
        /**
         * Age 1 has no nodes, and saying so out loud is the whole reassurance this screen owes a
         * new player: you are not behind, there is nothing here to buy, go and build something.
         */
        pane.append(el('p', { class: 'res-free small', text: 'Nothing to research. Everything in this age is yours from the moment you land.' }));
      } else {
        const grid = el('div', { class: 'res-grid' });
        for (const node of age.nodes) grid.append(drawNode(node));
        pane.append(grid);
      }
      out.push(pane);
    }
    return out;
  }

  function draw() {
    if (!open || !research) return;
    drawHead();
    body.replaceChildren();
    const grid = el('div', { class: 'res-columns' });
    for (const pane of drawAges()) grid.append(pane);
    grid.append(drawEarning());
    body.append(grid);
  }

  const api = {
    get root() { return root; },
    /** js/hud.js's contract: hand it a box, it puts itself in. */
    mount(parent) {
      (parent || document.body)?.appendChild(root);
      draw();
      return api;
    },
    show() { open = true; root.hidden = false; draw(); return api; },
    hide() { open = false; if (standalone) root.hidden = true; return api; },
    toggle() { return (open && standalone) ? api.hide() : api.show(); },
    get open() { return open; },
    draw,
    refresh: draw,
    /**
     * R17 — how many nodes could be bought this instant, for the character sheet's rail badge.
     *
     * An unspent point is invisible unless you happen to open the screen it belongs to, which is
     * the reason `railBadges()` exists at all (round 14 added it for perk and talent points).
     */
    ready() { return research?.summary?.()?.ready || 0; },
    dispose() { root.remove(); },
  };

  if (standalone && typeof document !== 'undefined') {
    document.addEventListener('keydown', e => {
      if (open && e.key === 'Escape') { api.hide(); e.stopPropagation(); }
    }, true);
  }

  if (mount) api.mount(mount);
  return api;
}
