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
    // `setAttribute('disabled', false)` still disables — an attribute that is PRESENT is true
    else if (typeof v === 'boolean') { if (v) node.setAttribute(k, ''); }
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
/** Plain words for a slot, for the one-line spec on a shop row. */
const SLOT_WORDS = {
  weapon: 'main hand', offhand: 'off hand', head: 'head', chest: 'chest', legs: 'legs',
  hands: 'hands', feet: 'feet', ring: 'ring', ring2: 'ring', necklace: 'neck',
  mount: 'mount', light: 'light',
};

/**
 * The racks the Other tab is sorted into.
 *
 * "Where shops sell boats and ship, they should also sell torches and mounts." They always did -
 * js/gear.js put them on every shelf - but they landed in an undifferentiated "Other" tab behind
 * Weapons, mixed in with rings and quivers, so nobody found them. Boats and ships get a heading of
 * their own further down; these get the same treatment, which is the whole of the complaint.
 */
const RACKS = [
  { key: 'mount', name: 'Mounts', note: 'Press H to get on. Faster over open ground.', is: i => i.slot === 'mount' },
  { key: 'light', name: 'Lights', note: 'Press F. You will want one before the first night.', is: i => i.slot === 'light' },
  { key: 'quiver', name: 'Quivers', note: 'Off hand, for a bow. They add damage, not armour.', is: i => i.subtype === 'quiver' },
  { key: 'rest', name: 'Trinkets and oddments', note: '', is: () => true },
];

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
  /** Which shelf of the shop is showing. Kept between renders so a buy does not reset it. */
  let shopTab = 'weapon';
  /** Which bag items are ticked for which gather job. Kept between renders so a tick sticks. */
  const handOver = new Map();
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
      }

      /**
       * HANDING OVER THINGS YOU ARE ALREADY CARRYING.
       *
       * "I had a quest to collect 6 daggers. I actually had 6 daggers on me, but I had to go witness
       * them drop… there should also be a dialog that asks me to select the items in question and
       * submit the quest, that way it doesn't accidentally take something the player meant to keep.
       * There should be an 'Add all' button to simplify the process, but would still let you
       * unselect and re-select other items if it gets it wrong."
       *
       * So: every gather job this person gave you lists what in your bag would count, each with a
       * checkbox. Nothing is taken until you press the button, and the count on the button says
       * exactly how many are going.
       */
      for (const q of context.active || []) {
        if (q.done || q.kind !== 'gather' || q.giverId !== npc.id) continue;
        const usable = context.gatherable?.(q) || [];
        if (!usable.length) continue;
        const need = Math.max(0, q.count - (q.progress || 0));
        const chosen = handOver.get(q.id) || (handOver.set(q.id, new Set()), handOver.get(q.id));
        const rows = usable.map(item => {
          const box = el('label', { class: 'hand-row' });
          const tick = document.createElement('input');
          tick.type = 'checkbox';
          tick.checked = chosen.has(item);
          tick.onchange = () => { if (tick.checked) chosen.add(item); else chosen.delete(item); render(); };
          box.append(tick, el('span', { class: rarity(item), text: item.name }));
          handlers.tip?.(box, item);
          return box;
        });
        const picked = usable.filter(i => chosen.has(i)).length;
        kids.push(el('div', { class: 'talk-quest hand-in' },
          el('div', { class: 'q-title', text: q.title }),
          el('div', { class: 'muted small', text: `${need} more. You are carrying ${usable.length} that would do.` }),
          el('div', { class: 'hand-list' }, ...rows),
          el('div', { class: 'hand-tools' },
            el('button', {
              class: 'talk-btn', text: 'Add all',
              onclick: () => { for (const i of usable.slice(0, need)) chosen.add(i); render(); },
            }),
            el('button', {
              class: 'talk-btn', text: 'Clear',
              onclick: () => { chosen.clear(); render(); },
            }),
            el('button', {
              class: 'talk-btn primary', text: picked ? `Hand over ${Math.min(picked, need)}` : 'Pick some first',
              onclick: () => {
                if (!picked) return;
                handlers.submitGather?.(q, usable.filter(i => chosen.has(i)));
                chosen.clear();
                render();
              },
            }),
          ),
        ));
      }

      if (!ready.length && context.hasQuest(offer?.id)) {
        kids.push(el('p', { class: 'muted small', text: 'You already have my work. Come back when it is done.' }));
      } else if (!offer) {
        kids.push(el('p', { class: 'muted small', text: 'Nothing needs doing just now.' }));
      }
    }

    // ---- trade
    if (npc.trades) {
      /**
       * The shop, in three tabs plus what you have sold.
       *
       * "Make it so that shops have a menu more like Diablo 2 where you can filter by categories:
       * armor, weapon, other; and offer a larger selection of random loot in each one" — and
       * "change it so when you sell an item to the shop, the item becomes available from the for
       * sale menu again; until the shop refreshes later."
       *
       * Every row here also carries the SAME hover card as the inventory, through `handlers.tip`:
       * "Update shops to support the same item hover effects as the menu, and also support
       * comparing. All item interfaces should have these tooltips."
       */
      const shelves = context.shelves || { weapon: [], armor: [], other: [], buyback: [] };
      const counts = {
        weapon: shelves.weapon.length, armor: shelves.armor.length,
        other: shelves.other.length, buyback: (shelves.buyback || []).length,
      };
      const tabs = [
        ['weapon', 'Weapons'], ['armor', 'Armour'], ['other', 'Other'],
        ...(counts.buyback ? [['buyback', 'Bought from you']] : []),
      ];
      if (!tabs.some(([k]) => k === shopTab)) shopTab = 'weapon';

      /**
       * The one line a shop row has to carry.
       *
       * E1: "rows read Scepter - 8g - Buy, three identical Scepters in a row, no damage, no slot, no
       * level requirement, no class restriction." The full card is on hover and always was, but a
       * shelf you have to hover item by item is a shelf you cannot scan — and three rows with the
       * same name and the same price are indistinguishable until you do. So the numbers that decide
       * whether a row is worth hovering go ON the row: what it is, what it does, and whether you can
       * use it at all. Everything here is read off the item itself, so nothing new has to be passed
       * in and the sell side gets it for free.
       */
      const specOf = item => {
        const bits = [];
        if (item.slot) bits.push(SLOT_WORDS[item.slot] || item.slot);
        if (item.damage) bits.push(`${item.damage[0]}-${item.damage[1]} damage`);
        else if (item.dps) bits.push(`${Math.round(item.dps)} dps`);
        if (item.armor) bits.push(`${item.armor} armour`);
        if (item.speed) bits.push(`${item.speed} m/s`);            // a mount, or a boat
        if (item.range) bits.push(`lights ${item.range} m`);       // a torch, a lantern, a lamp
        if (item.arrowDamage) bits.push(`+${item.arrowDamage} arrow damage`);
        if (item.twoHanded) bits.push('two-handed');
        const req = item.levelReq ?? 1;
        if (req > 1) bits.push(`level ${req}`);
        return bits.join(' · ');
      };

      const row = (item, { sell = false } = {}) => {
        const price = (sell ? handlers.sellPrice?.(item) : handlers.price?.(item)) ?? 0;
        const tooPoor = !sell && price > (context.gold ?? 0);
        // "no indication whether it beats what you are wearing" — the card says so on hover, and the
        // row says it in one word, so a shelf can be read without touching anything
        const verdict = !sell ? handlers.upgradeMark?.(item) : null;
        const cannot = !sell && handlers.cannotUse?.(item);
        const node = el('div', { class: 'trade-row' + (cannot ? ' trade-row-no' : '') },
          el('div', { class: 'trade-what' },
            el('span', { class: rarity(item), text: (handlers.displayName?.(item)) ?? item.name }),
            el('span', { class: 'trade-spec', text: specOf(item) }),
          ),
          ...(verdict ? [el('span', { class: 'trade-mark ' + verdict.kind, text: verdict.text })] : []),
          el('span', { class: 'coin', text: `${price}g` }),
          el('button', {
            class: 'talk-btn', text: sell ? 'Sell' : 'Buy',
            // E1: the Buy button stayed lit at 0 gold, so the only way to find out you could not
            // afford something was to click it
            disabled: tooPoor,
            title: tooPoor ? `That is ${price} gold and you have ${context.gold ?? 0}.` : '',
            onclick: () => { (sell ? handlers.sell : handlers.buy)?.(item); render(); },
          }),
        );
        // the real card, with the comparison against what you are wearing
        handlers.tip?.(node, item);
        return node;
      };

      const shelf = shopTab === 'buyback' ? (shelves.buyback || []) : (shelves[shopTab] || []);

      /**
       * The Other tab, in racks; every other tab as a plain list.
       *
       * Sorting happens once, in order, so an item lands in the first rack that claims it and the
       * last rack claims everything left. An empty rack is not drawn — a village store with no
       * quivers should not show an empty heading called Quivers.
       */
      function shelfRows(items) {
        if (shopTab !== 'other') return items.map(item => row(item));
        const left = [...items];
        const out = [];
        for (const rack of RACKS) {
          const mine = left.filter(rack.is);
          if (!mine.length) continue;
          for (const item of mine) left.splice(left.indexOf(item), 1);
          out.push(el('div', { class: 'trade-rack' },
            el('h4', { text: rack.name }),
            ...(rack.note ? [el('span', { class: 'trade-rack-note', text: rack.note })] : []),
          ));
          out.push(...mine.map(item => row(item)));
        }
        return out;
      }

      const theirs = el('div', { class: 'trade-col' },
        el('div', { class: 'shop-tabs' }, ...tabs.map(([key, label]) => el('button', {
          class: 'chip' + (key === shopTab ? ' on' : ''),
          text: `${label}${counts[key] ? ` (${counts[key]})` : ''}`,
          onclick: () => { shopTab = key; render(); },
        }))),
        ...(shelf.length
          ? shelfRows(shelf)
          : [el('p', { class: 'muted small', text: shopTab === 'buyback' ? 'You have not sold me anything.' : 'Nothing of that sort today.' })]),
      );

      const bag = context.bag || [];
      const mine = el('div', { class: 'trade-col' },
        el('h3', { text: 'Your bag' }),
        ...(bag.length
          ? bag.map(item => row(item, { sell: true }))
          : [el('p', { class: 'muted small', text: 'Nothing to sell.' })]),
      );
      kids.push(el('div', { class: 'talk-gold muted small', text: `You have ${context.gold} gold.` }));
      // …and why the prices are what they are. Standing was invisible at the one counter where it
      // should be the most obvious thing on screen.
      const note = handlers.standingNote?.();
      if (note) kids.push(el('div', { class: 'talk-standing small', text: note }));
      kids.push(el('div', { class: 'trade' }, theirs, mine));

      // vehicles: unlockables, bought once and owned for the run
      /**
       * E3: a level-1 village store was offering a 5200g interstellar hauler, and that block was over
       * half the panel. It is behind a fold now, so the stock you might actually buy is what you see.
       */
      const vehicles = (context.vehicles || []).filter(v => !context.ownsVehicle?.(v.slot, v.key));
      if (vehicles.length) {
        const fold = el('details', { class: 'trade-fold' });
        fold.append(el('summary', { text: `Boats and ships (${vehicles.length})` }));
        fold.append(el('p', { class: 'muted small', text: 'Bought once and yours for good. Pick between them on the character sheet.' }));
        kids.push(fold);
        for (const v of vehicles) {
          fold.append(el('div', { class: 'trade-row' },
            el('span', { text: v.name }),
            el('span', { class: 'muted small', text: v.lore }),
            el('span', { class: 'coin', text: `${v.price}g` }),
            el('button', {
              class: 'talk-btn', text: 'Buy',
              disabled: v.price > (context.gold ?? 0),
              onclick: () => { handlers.buyVehicle?.(v); render(); },
            }),
          ));
        }
      }
    }

    // ---- the gambler: sealed crates, one item each, a promise and a chance of better
    if (npc.gambles) {
      kids.push(el('div', { class: 'talk-gold muted small', text: `You have ${context.gold} gold.` }));
      // …and why the prices are what they are. Standing was invisible at the one counter where it
      // should be the most obvious thing on screen.
      const note = handlers.standingNote?.();
      if (note) kids.push(el('div', { class: 'talk-standing small', text: note }));
      kids.push(el('h3', { text: 'Sealed crates' }));
      kids.push(el('p', { class: 'muted small', text: 'One thing inside. Never worse than the seal says. Sometimes better.' }));
      for (const tier of context.crates || []) {
        kids.push(el('div', { class: 'trade-row crate-row' },
          el('span', { class: 'rarity-' + tier.floor, text: tier.name }),
          el('span', { class: 'muted small', text: `${tier.floor} or better · ${Math.round(tier.lift * 100)}% chance of better still` }),
          el('span', { class: 'coin', text: `${tier.price}g` }),
          el('button', {
            class: 'talk-btn', text: 'Open it',
            onclick: () => { handlers.gamble?.(tier); render(); },
          }),
        ));
      }
      if (context.lastCrate) {
        kids.push(el('div', { class: 'crate-result' },
          el('span', { class: rarity(context.lastCrate), text: context.lastCrate.name }),
          el('span', { class: 'muted small', text: context.lastCrateLifted ? ' — better than the seal promised.' : '' }),
        ));
      }
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
