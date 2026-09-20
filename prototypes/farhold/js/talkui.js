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
 * D4: FOUR SHELVES, NOT THREE.
 *
 * js/gear.js sorts everything that is not a weapon or a piece of armour onto one "other" pile, and
 * this morning's pass gave that pile headings — Mounts, Lights, Quivers, Trinkets. One tab holding
 * four unrelated kinds of thing is still one tab: "add a Gear tab between Armour and Other, holding
 * quivers and trinkets; Other keeps mounts and lights and gains boats and ships."
 *
 * So the split happens HERE rather than in gear.js — the shop is the only place that cares, and
 * `categoryOf()` is also what a sold-back item is filed under, which must not change under it.
 * A thing you RIDE or CARRY FOR LIGHT is Other; everything else off that pile is Gear.
 */
const isTransportOrLight = i => i.slot === 'mount' || i.slot === 'light';

/** The racks inside each of the two split tabs. The last rack in a list claims whatever is left. */
const RACKS = {
  gear: [
    { key: 'quiver', name: 'Quivers', note: 'Off hand, for a bow. They add damage, not armour.', is: i => i.subtype === 'quiver' },
    { key: 'rest', name: 'Trinkets and oddments', note: 'Rings and neck chains. Small numbers, and they stack.', is: () => true },
  ],
  other: [
    { key: 'mount', name: 'Mounts', note: 'Press H to get on. Faster over open ground.', is: i => i.slot === 'mount' },
    { key: 'light', name: 'Lights', note: 'Press F. You will want one before the first night.', is: i => i.slot === 'light' },
  ],
};

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
  /**
   * Which panel is showing. 'talk' is the ordinary conversation; 'offer' is a single yes-or-no
   * proposition — hiring somebody, today — that has to be read before it is answered.
   */
  let mode = 'talk';
  let offerState = null;
  /** Which shelf of the shop is showing. Kept between renders so a buy does not reset it. */
  let shopTab = 'weapon';
  /** Which bag items are ticked for which gather job. Kept between renders so a tick sticks. */
  const handOver = new Map();
  let context = null;

  function render() {
    if (mode === 'offer') return renderOffer();
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

    /**
     * ---- somebody who will walk with you.
     *
     * The same offer, inside an ordinary conversation, for a hireable person who also trades or
     * hands out work. `context.hireOffer` is `js/town.js` `hireOffer()`; nothing is spent until the
     * button is pressed, which is the entire point of 4.18.
     */
    if (context.hireOffer) {
      kids.push(...offerNodes(context.hireOffer,
        o => { handlers.hire?.(o); render(); },
        o => { handlers.declineHire?.(o); render(); },
      ));
    }

    /**
     * ---- somebody who will come and WORK for you.
     *
     * A different thing from the hire above, and worth keeping apart: a mercenary walks with you
     * and fights; a recruit goes to your holding and never leaves it. §6.5 — "build your own city
     * and acquire NPCs… recruiting from other towns." `js/colony.js` has had `recruitOffer` and a
     * refilling `townPool` since the colony landed and there was no way to reach either.
     */
    if (context.recruitOffer) {
      kids.push(...offerNodes(context.recruitOffer,
        o => { handlers.recruit?.(o); render(); },
        o => { handlers.declineRecruit?.(o); render(); },
      ));
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
      /**
       * E3 put the boats and ships behind a fold at the bottom of every tab, where a level-1 village
       * store was offering a 5200g hauler above the stock you could actually buy. They belong on the
       * Other shelf with the mounts — they are the same kind of purchase, bought once and kept.
       */
      const vehicles = (context.vehicles || []).filter(v => !context.ownsVehicle?.(v.slot, v.key));
      const spare = shelves.other || [];
      const stock = {
        weapon: shelves.weapon || [],
        armor: shelves.armor || [],
        gear: spare.filter(i => !isTransportOrLight(i)),
        other: spare.filter(isTransportOrLight),
        buyback: shelves.buyback || [],
      };
      const counts = {
        weapon: stock.weapon.length, armor: stock.armor.length,
        gear: stock.gear.length, other: stock.other.length + vehicles.length,
        buyback: stock.buyback.length,
      };
      const tabs = [
        ['weapon', 'Weapons'], ['armor', 'Armour'], ['gear', 'Gear'], ['other', 'Other'],
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
        /**
         * MELEE OR RANGED, AND HOW MANY HANDS — on the row, not only on the hover card.
         *
         * "I got a weapon called 'truthseeker' that shoots a projectile. How am I supposed to know
         * that without testing it?" A shelf of six weapons at the same price is unreadable if the
         * only way to find out which of them shoots is to buy one. `rangeClass`, `gripWord` and
         * `elementName` are written onto every weapon by `describeWeapon` (js/weapons.js), so the
         * row and the card can never disagree.
         */
        if (item.type === 'weapon') {
          if (item.rangeClass) bits.push(item.rangeClass);
          bits.push((item.gripWord || (item.twoHanded ? 'Two-handed' : 'One-handed')).toLowerCase());
          if (item.elementName) bits.push(item.elementName.toLowerCase());
        } else if (item.twoHanded) bits.push('two-handed');
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

      const shelf = stock[shopTab] || [];

      /** One heading over a group of rows, with the line that says what the group is for. */
      const rackHead = (name, note) => el('div', { class: 'trade-rack' },
        el('h4', { text: name }),
        ...(note ? [el('span', { class: 'trade-rack-note', text: note })] : []),
      );

      /**
       * A boat or a ship is a HULL, not a piece of loot.
       *
       * D4: "Boats and ships have no rarity — base quality only." They never rolled one — they are
       * `js/gear.js` VEHICLES entries, not items — and nothing here gives them a rarity colour, so
       * the rack says so out loud rather than leaving the player to wonder which of them is the rare
       * one. Bought once and owned for the run; you pick between them on the character sheet.
       */
      const vehicleRows = () => {
        if (!vehicles.length) return [];
        const out = [rackHead('Boats and ships', 'Base quality only — no rarities. Bought once and yours for good.')];
        for (const v of vehicles) {
          out.push(el('div', { class: 'trade-row' },
            el('div', { class: 'trade-what' },
              el('span', { text: v.name }),
              el('span', { class: 'trade-spec', text: v.lore }),
            ),
            el('span', { class: 'coin', text: `${v.price}g` }),
            el('button', {
              class: 'talk-btn', text: 'Buy',
              disabled: v.price > (context.gold ?? 0),
              title: v.price > (context.gold ?? 0) ? `That is ${v.price} gold and you have ${context.gold ?? 0}.` : '',
              onclick: () => { handlers.buyVehicle?.(v); render(); },
            }),
          ));
        }
        return out;
      };

      /**
       * The Gear and Other tabs, in racks; every other tab as a plain list.
       *
       * Sorting happens once, in order, so an item lands in the first rack that claims it and the
       * last rack claims everything left. An empty rack is not drawn — a village store with no
       * quivers should not show an empty heading called Quivers.
       */
      function shelfRows(items) {
        const racks = RACKS[shopTab];
        if (!racks) return items.map(item => row(item));
        const left = [...items];
        const out = [];
        for (const rack of racks) {
          const mine = left.filter(rack.is);
          if (!mine.length) continue;
          for (const item of mine) left.splice(left.indexOf(item), 1);
          out.push(rackHead(rack.name, rack.note));
          out.push(...mine.map(item => row(item)));
        }
        // anything no rack claimed still has to be buyable
        out.push(...left.map(item => row(item)));
        if (shopTab === 'other') out.push(...vehicleRows());
        return out;
      }

      const empty = shopTab === 'buyback' ? 'You have not sold me anything.' : 'Nothing of that sort today.';
      const theirs = el('div', { class: 'trade-col' },
        el('div', { class: 'shop-tabs' }, ...tabs.map(([key, label]) => el('button', {
          class: 'chip' + (key === shopTab ? ' on' : ''),
          text: `${label}${counts[key] ? ` (${counts[key]})` : ''}`,
          onclick: () => { shopTab = key; render(); },
        }))),
        ...(counts[shopTab]
          ? shelfRows(shelf)
          : [el('p', { class: 'muted small', text: empty })]),
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
      // the boats and ships used to be a fold under all of this (E3). They are on the Other shelf
      // now, with the mounts — same kind of purchase, same place to look for it.
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

  /**
   * AN OFFER YOU CAN READ BEFORE YOU ANSWER IT.
   *
   *   "I found a mercenary in town who joined me but it should have opened a dialog where they
   *    offered to join me and I was able to accept/deny. I had no idea it would just straight up
   *    hire them… the dialog just needs improved so you can see something about the person before
   *    recruiting them."
   *
   * Pressing E on a mercenary captain used to take the gold and summon the sellsword in the same
   * frame — the first you knew of the price was the number missing from your purse. This draws the
   * whole thing first: who they are, what they cost against what you are carrying, what they bring
   * to a fight, and two buttons. `js/town.js` `hireOffer()` builds the object; nothing is decided
   * here.
   *
   * Everything uses classes style.css already has (talk-quest, trade-row, coin, talk-btn), so the
   * panel needs no new stylesheet to look like the rest of the game.
   */
  /**
   * The body of an offer: their words, what you get, the price against your purse, two buttons.
   *
   * Shared by the standalone panel (the mercenary captain you meet on the road) and by the block
   * inside an ordinary conversation (somebody in a town who will walk with you), so the two can
   * never end up describing the same bargain differently.
   */
  function offerNodes(o, onAccept, onDecline) {
    const kids = [];
    // their own words first, so it reads as somebody speaking rather than a receipt
    for (const line of o.lines || []) kids.push(el('p', { class: 'talk-say', text: line }));
    if (o.blurb) kids.push(el('p', { class: 'muted small', text: o.blurb }));

    const card = el('div', { class: 'talk-quest' },
      el('div', { class: 'q-title', text: o.title || 'What you would be taking on' }),
    );
    for (const [label, value] of o.rows || []) {
      card.append(el('div', { class: 'trade-row' },
        el('div', { class: 'trade-what' },
          el('span', { text: label }),
          el('span', { class: 'trade-spec', text: String(value) }),
        ),
      ));
    }
    if (o.terms) card.append(el('div', { class: 'muted small', text: o.terms }));
    kids.push(card);

    // the price, and the purse next to it — the two numbers the decision is actually made on
    kids.push(el('div', { class: 'talk-gold muted small', text: `${o.price} gold. You have ${o.gold}.` }));
    if (o.refusal) kids.push(el('div', { class: 'talk-standing small', text: o.refusal }));

    kids.push(el('div', { class: 'hand-tools' },
      el('button', {
        class: 'talk-btn primary', text: o.acceptText || 'Agree',
        // E1's rule: a button you cannot use should say so before you press it, not after
        disabled: !!o.refusal,
        title: o.refusal || '',
        onclick: () => onAccept(o),
      }),
      el('button', { class: 'talk-btn', text: o.declineText || 'No', onclick: () => onDecline(o) }),
    ));
    return kids;
  }

  function renderOffer() {
    const o = offerState?.offer;
    if (!o) return;
    head.replaceChildren(
      el('h2', { text: o.name }),
      ...(o.subtitle ? [el('span', { class: 'talk-role muted', text: o.subtitle })] : []),
      el('button', { class: 'talk-close', text: '×', onclick: () => close() }),
    );
    body.replaceChildren(...offerNodes(o,
      () => { const h = offerState?.handlers; close(); h?.accept?.(o); },
      () => { const h = offerState?.handlers; close(); h?.decline?.(o); },
    ));
  }

  function show(npc, ctx) {
    mode = 'talk';
    offerState = null;
    current = npc;
    context = ctx;
    open = true;
    root.classList.remove('hidden');
    document.exitPointerLock?.();
    render();
  }

  /**
   * Put a single yes-or-no proposition on screen.
   *
   *   panel.showOffer(folk.hireOffer(w, { level, gold, pet }), {
   *     accept: offer => { … take the gold, summon the companion … },
   *     decline: offer => hud.log(`${offer.name} shrugs and goes back to the fire.`),
   *     dismiss: () => {},                     // walked away without answering
   *   });
   *
   * Closing the panel any other way (Esc, the ×) counts as walking away, NOT as a refusal, so the
   * person is still there to talk to.
   */
  function showOffer(offer, handlers2 = {}) {
    if (!offer) return false;
    mode = 'offer';
    offerState = { offer, handlers: handlers2 };
    current = null;
    open = true;
    root.classList.remove('hidden');
    document.exitPointerLock?.();
    renderOffer();
    return true;
  }

  function close() {
    const walked = mode === 'offer' ? offerState : null;
    open = false;
    current = null;
    mode = 'talk';
    offerState = null;
    root.classList.add('hidden');
    walked?.handlers?.dismiss?.(walked.offer);
  }

  return {
    root,
    get isOpen() { return open; },
    get npc() { return current; },
    show, showOffer, close, render,
    /** Which panel is up: 'talk' or 'offer'. The input layer checks this before swallowing Esc. */
    get mode() { return mode; },
    /** Refresh from a new context object (after a buy, a level, a turn-in). */
    update(ctx) { context = ctx; if (open) render(); },
  };
}
