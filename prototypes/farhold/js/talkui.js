// Farhold — talking to somebody: the panel that opens on E.
//
// One panel does greeting, trade and work, because a village merchant is not worth three screens.
// It owns no game state; `main.js` passes handlers in and the panel calls them.

const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...kids.filter(Boolean));
  return node;
};

const rarity = item => item?.setId ? 'rarity-set' : item?.isUnique ? 'rarity-unique' : 'rarity-' + (item?.rarity || 'normal');

/**
 * handlers: { buy(item), sell(item), accept(quest), turnIn(quest), describe(item), price(item),
 *             sellPrice(item) }
 */
export function createTalkPanel(handlers = {}) {
  const body = el('div', { class: 'talk-body' });
  const head = el('div', { class: 'talk-head' });
  const root = el('section', { class: 'talk hidden', id: 'talk' },
    head,
    body,
    el('div', { class: 'talk-foot muted small', text: 'E or Esc to step away' }),
  );
  document.body.append(root);

  let open = false;
  let current = null;
  let context = null;

  function render() {
    if (!current) return;
    const npc = current;
    head.replaceChildren(
      el('h2', { text: npc.name }),
      el('span', { class: 'talk-role muted', text: `${npc.roleName} · ${npc.node.name}` }),
      el('button', { class: 'talk-close', text: '×', onclick: () => close() }),
    );

    const kids = [el('p', { class: 'talk-say', text: npc.greeting })];

    // ---- work
    if (npc.givesQuests) {
      const ready = context.readyToTurnIn(npc.id);
      if (ready.length) {
        for (const q of ready) {
          kids.push(el('div', { class: 'talk-quest done' },
            el('div', { class: 'q-title', text: q.title }),
            el('div', { class: 'muted small', text: `Finished — ${q.reward.gold} gold, ${q.reward.xp} xp` }),
            el('button', { class: 'talk-btn primary', text: 'Hand it in', onclick: () => { handlers.turnIn?.(q); render(); } }),
          ));
        }
      }
      const offer = context.offer;
      if (offer && !context.hasQuest(offer.id)) {
        kids.push(el('div', { class: 'talk-quest' },
          el('div', { class: 'q-title', text: offer.title }),
          el('div', { class: 'small', text: offer.text }),
          el('div', { class: 'muted small', text: `Pays ${offer.reward.gold} gold and ${offer.reward.xp} xp` }),
          el('button', { class: 'talk-btn primary', text: 'Take the job', onclick: () => { handlers.accept?.(offer); render(); } }),
        ));
      } else if (!ready.length && context.hasQuest(offer?.id)) {
        kids.push(el('p', { class: 'muted small', text: 'You already have my work. Come back when it is done.' }));
      } else if (!offer) {
        kids.push(el('p', { class: 'muted small', text: 'Nothing needs doing just now.' }));
      }
    }

    // ---- trade
    if (npc.trades) {
      const stock = context.stock || [];
      const theirs = el('div', { class: 'trade-col' },
        el('h3', { text: 'For sale' }),
        ...(stock.length ? stock.map(item => el('div', { class: 'trade-row', title: handlers.describe?.(item) || '' },
          el('span', { class: rarity(item), text: item.name }),
          el('span', { class: 'coin', text: `${handlers.price?.(item) ?? 0}g` }),
          el('button', { class: 'talk-btn', text: 'Buy', onclick: () => { handlers.buy?.(item); render(); } }),
        )) : [el('p', { class: 'muted small', text: 'Bought out.' })]),
      );
      const bag = context.bag || [];
      const mine = el('div', { class: 'trade-col' },
        el('h3', { text: 'Your bag' }),
        ...(bag.length ? bag.slice(0, 14).map(item => el('div', { class: 'trade-row', title: handlers.describe?.(item) || '' },
          el('span', { class: rarity(item), text: item.name }),
          el('span', { class: 'coin', text: `${handlers.sellPrice?.(item) ?? 0}g` }),
          el('button', { class: 'talk-btn', text: 'Sell', onclick: () => { handlers.sell?.(item); render(); } }),
        )) : [el('p', { class: 'muted small', text: 'Nothing to sell.' })]),
      );
      kids.push(el('div', { class: 'talk-gold muted small', text: `You have ${context.gold} gold.` }));
      kids.push(el('div', { class: 'trade' }, theirs, mine));
    }

    // ---- what you are already carrying
    const active = context.active || [];
    if (active.length) {
      kids.push(el('h3', { text: 'Your jobs' }));
      for (const q of active) {
        kids.push(el('div', { class: 'talk-quest small' + (q.done ? ' done' : '') },
          el('span', { class: 'q-title', text: q.title }),
          el('span', { class: 'muted', text: ` — ${context.progressText(q)}` }),
        ));
      }
    }

    body.replaceChildren(...kids);
  }

  function show(npc, ctx) {
    current = npc;
    context = ctx;
    open = true;
    root.classList.remove('hidden');
    document.exitPointerLock?.();
    render();
  }

  function close() {
    open = false;
    current = null;
    root.classList.add('hidden');
  }

  return {
    root,
    get isOpen() { return open; },
    get npc() { return current; },
    show, close, render,
    /** Refresh from a new context object (after a buy, a level, a turn-in). */
    update(ctx) { context = ctx; if (open) render(); },
  };
}
