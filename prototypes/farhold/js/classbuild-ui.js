// Farhold R17 — the class builder, as a screen.
//
// Its own file and its own stylesheet, mounted into a <div> it makes itself, for the reason
// js/civics-ui.js gives in its own header: the title screen's markup is index.html and its styling
// is style.css, and adding a whole builder to either of those would be a change to two files that
// six other screens already depend on. This touches neither.
//
//   import { createClassBuilder } from './classbuild-ui.js';
//   const builder = createClassBuilder({ classData, skillData, classLooks, data, onChange });
//   builder.card(box);            // draw the summary into the class card on the character step
//   builder.open();               // the full screen
//   builder.build;                // the live build object
//
// FOUR TABS, and each one is one of the user's four asks:
//   Loadout   — "a default loadout such as wands with a specific element, dual swords, daggers, bow"
//   Spells    — "extract all the existing classes into a spell tier list and allow choosing spells"
//   Opening   — "pick a companion or… start with a bonus crate"
//   Look      — whose face you start from, before the appearance editor
//
// The Spells tab is also the IN-GAME respec: `embedded: true` drops the full-screen positioning and
// the close button, and `onChange` is where js/followers-ui.js re-installs the class and rebuilds
// the skill bar. "You should be able to unlearn a skill at any time" is the same screen twice.

import {
  spellCatalogue, createBuild, pickSpell, pickRefusal, slotsOf, loadoutOf,
  loadoutRefusal, buildRefusal, describeBuild, pendingPicks, PICK_COUNT,
} from './classbuild.js';

const CSS_HREF = 'classbuild.css';

/** One element, with children. The same helper civics-ui.js uses, and for the same reason. */
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

function pane(title, kids) {
  return el('div', { class: 'cb-pane' }, [el('h3', { text: title }), ...[].concat(kids)]);
}

const empty = text => el('div', { class: 'cb-empty', text });

/**
 * One choosable row. `why` is the sentence that says why it is greyed — a greyed row with no reason
 * is the one answer a player cannot act on, which is the rule the whole project runs on.
 */
function option({ name, right = null, sub = null, on = false, why = null, onclick = null }) {
  const kids = [el('b', { text: name })];
  if (right != null) kids.push(el('span', { class: 'cb-right', text: String(right) }));
  if (sub) kids.push(el('span', { class: 'cb-sub', text: sub }));
  if (why) kids.push(el('span', { class: 'cb-why', text: why }));
  return el('button', {
    class: `cb-opt${on ? ' on' : ''}`, type: 'button',
    disabled: !!why, onclick: why ? null : onclick,
  }, kids);
}

export const CLASSBUILD_TABS = [
  { key: 'loadout', name: 'Loadout' },
  { key: 'spells', name: 'Spells' },
  { key: 'opening', name: 'Opening' },
  // R18 — the body picker is gone, so this tab is only the class's own name now
  { key: 'look', name: 'Name' },
];

export function createClassBuilder({
  classData = null, skillData = null, classLooks = null, data = null,
  build = null, getPlayer = () => null, forest = null,
  onChange = () => {}, onClose = () => {},
  mount = document.body, embedded = false, tabs = null,
  /**
   * R20 — HOW FAR THIS CHARACTER HAS GOT, which is the only thing that decides what may be picked.
   *
   * The title screen leaves it alone and gets level 1, so five of the six slots refuse themselves
   * and the creator asks for the opening spell only. In game this reads `player.level` and the
   * same screen becomes the chooser for whatever has come due. One screen, one rule.
   */
  getLevel = null,
  /**
   * In game the footer is a way out, not a gate: the build is already in play and `buildRefusal`
   * has nothing left to refuse. On the title screen it is the thing standing between you and a
   * character with no spell at all.
   */
  inGame = false,
} = {}) {
  const levelNow = () => (getLevel ? (getLevel() || 1) : (getPlayer()?.level || 1));
  if (!document.querySelector(`link[href="${CSS_HREF}"]`)) {
    document.head.appendChild(el('link', { rel: 'stylesheet', href: CSS_HREF }));
  }

  const cat = spellCatalogue({ classData, skillData, data });
  let state = build || createBuild(data);
  const TABS = tabs || CLASSBUILD_TABS;
  let tab = TABS[0].key;
  let open = false;

  const body = el('div', { class: 'cb-body' });
  const railButtons = new Map();
  const rail = el('div', { class: 'cb-rail' }, TABS.map(t => {
    const b = el('button', { type: 'button', text: t.name, onclick: () => { tab = t.key; draw(); } });
    railButtons.set(t.key, b);
    return b;
  }));
  const subtitle = el('span', { class: 'cb-sub' });
  const why = el('span', { class: 'cb-why' });
  const done = el('button', { class: 'cb-done', type: 'button', text: 'Done', onclick: () => { hide(); onClose(state); } });
  const foot = el('div', { class: 'cb-foot' }, [why, done]);
  const root = el('div', { class: `cb${embedded ? ' cb--tab' : ''}`, hidden: true }, [
    el('div', { class: 'cb-head' }, [
      el('h2', { text: 'Build your own' }),
      subtitle,
      embedded ? null : el('button', { class: 'cb-close', type: 'button', text: 'Close  (Esc)', onclick: () => { hide(); onClose(state); } }),
    ]),
    rail,
    body,
    foot,
  ]);
  mount.appendChild(root);

  /** Everything that changes the build goes through here, so nothing can forget to redraw. */
  function changed() {
    onChange(state);
    draw();
  }

  // ------------------------------------------------------------------ the loadout tab

  function drawLoadout() {
    const player = getPlayer();
    const current = loadoutOf(state, data);
    const rows = (data?.loadouts || []).map(l => {
      const refusal = loadoutRefusal(l, { player, forest });
      return option({
        name: l.name,
        right: [l.main, l.off, l.offArmour].filter(Boolean).map(k => k.replace(/_/g, ' ')).join(' + '),
        sub: `${l.blurb} — ${l.armour} armour`,
        on: current?.id === l.id,
        why: refusal,
        onclick: () => {
          state.loadout = l.id;
          // a loadout that does not brand anything has no element to remember
          if (!l.element) state.element = null;
          else if (!state.element) state.element = (data?.elements || [])[0]?.key || 'fire';
          changed();
        },
      });
    });

    const panes = [pane('Both hands', rows)];
    if (current?.element) {
      panes.push(pane('Attuned to', (data?.elements || []).map(e => option({
        name: e.name,
        right: e.key,
        sub: e.blurb,
        on: state.element === e.key,
        onclick: () => { state.element = e.key; changed(); },
      }))));
    }
    panes.push(pane('What comes with it', [
      el('div', { class: 'cb-note', text: `${(data?.armour?.[current?.armour || 'medium'] || []).join(', ').replace(/_/g, ' ')} — the same way a preset class's starting armour is equipped.` }),
      el('div', { class: 'cb-note', text: 'Everybody also starts with a torch, a horse and the crudest tool there is, whatever they built.' }),
    ]));
    return panes;
  }

  // ------------------------------------------------------------------ the spells tab

  /** Which slot the right-hand list is filling. */
  let editing = 0;

  function drawSpells() {
    const level = levelNow();
    const slots = slotsOf(state, cat, { level });
    /**
     * R20 — THE SCREEN OPENS ON THE SLOT YOU ARE OWED.
     *
     * Five of the six are empty now and only one of them is usually pickable, so landing on slot 1
     * every time would mean hunting for the row that is actually live. If `editing` points at a
     * slot that has not come due (or is already filled), it is moved to the first pending one.
     */
    if (!slots[editing]?.pending) {
      const next = slots.find(s => s.pending);
      if (next) editing = next.index;
    }
    const left = slots.map(s => {
      const row = el('div', {
        class: `cb-slot${editing === s.index ? ' on' : ''}${s.pending ? ' pending' : ''}${s.open ? '' : ' shut'}`,
      }, [
        el('span', { class: 'cb-lv', text: s.level > 1 ? `level ${s.level}` : 'from the start' }),
        el('span', {
          class: `cb-pick${s.spell ? ' filled' : ''}`,
          text: s.spell ? s.spell.name
            : s.pending ? `${s.name} — choose one`
              : `${s.name} — opens at level ${s.level}`,
        }),
      ]);
      /**
       * R20 — UNLEARN IS NOT A BUTTON ON THIS SCREEN ANY MORE.
       *
       *   "Add an NPC at town who is able to reset individual or all spells, perks, and talents,
       *    and remove the ability to do it directly from the inventory."
       *
       * It used to sit on every filled slot and cost nothing, which made a spell a setting rather
       * than a choice. An Unbinder in any settlement of two houses or more takes one back out for
       * gold (js/retrain.js). The row says where to go instead of offering a button that is gone.
       */
      row.append(el('span', {
        class: 'cb-note',
        text: s.spell ? 'an Unbinder in town can take this one back out'
          : s.pending ? 'ready to choose' : 'not yet',
      }));
      if (s.pending) row.addEventListener('click', () => { editing = s.index; draw(); });
      return row;
    });

    const slot = slots[editing] || slots[0];
    /**
     * R20 — the greyed-out reason is `pickRefusal`'s own sentence rather than a second copy of the
     * rules written out here. The two used to say the same thing twice, and a third rule (the level
     * gate) would have had to be added in both places to be true in either.
     */
    const spellOption = sp => option({
      name: sp.name,
      right: sp.tier > 1 ? `level ${sp.tier}` : 'from the start',
      sub: `${sp.desc} · ${sp.shape}, ${sp.element}${sp.classes.length ? ` · ${sp.classes.slice(0, 3).join(', ')}${sp.classes.length > 3 ? '…' : ''}` : ''}`,
      on: slot.spellId === sp.id,
      why: pickRefusal(state, slot.index, sp.id, cat, { level }),
      onclick: () => { pickSpell(state, slot.index, sp.id, cat, { level }); changed(); },
    });

    /**
     * R18 — WHAT IS OPEN AT *THIS* LEVEL, FIRST AND COUNTED.
     *
     * Reported as "all levels show the same spells", and they did: this listed `cat.spells` — the
     * whole catalogue, all forty — for every one of the six slots, marking the ones you cannot take
     * yet with a `why` (which `option()` turns into a disabled button). Correct, and unreadable:
     * every slot drew an identical list of forty rows, so picking a different slot looked like it
     * had done nothing. The catalogue itself was right the whole time — 11/15/9/2/0/3 spells at
     * levels 1/3/7/12/18/24 (1/3/6/12/18/24 since R20).
     *
     * Split, so a slot's pane is about that slot: what is open at its level, then what is not yet,
     * under a heading that says so. The later ones are still shown — knowing Meteor is coming is
     * part of choosing — but they are no longer mixed in with what you can actually click.
     */
    const ready = cat.spells.filter(sp => sp.tier <= slot.level);
    const later = cat.spells.filter(sp => sp.tier > slot.level);
    const owed = pendingPicks(state, cat, level);
    const rungs = cat.unlockAt.slice(1).join(', ');

    return [
      pane(`Your six (${state.spells.filter(Boolean).length} of ${PICK_COUNT} learned)`, [
        el('div', {
          class: 'cb-note',
          text: `One spell now, and one more at levels ${rungs}. The rest are chosen from the character sheet when the level comes.`,
        }),
        owed
          ? el('div', { class: 'cb-good', text: `${owed} ${owed === 1 ? 'spell' : 'spells'} to choose.` })
          : el('div', { class: 'cb-note', text: 'Nothing to choose right now.' }),
        el('div', { class: 'cb-slots' }, left),
      ]),
      slot.pending
        ? pane(`${slot.name} — what can go in slot ${slot.index + 1}`, [
          el('div', { class: 'cb-note', text: slot.blurb }),
          el('div', {
            class: 'cb-note',
            text: ready.length
              ? `${ready.length} open ${ready.length === 1 ? 'spell' : 'spells'} at level ${slot.level}.`
              : `Nothing new unlocks at level ${slot.level} — take anything from an earlier tier.`,
          }),
          ...ready.map(spellOption),
          ...(later.length ? [
            el('div', { class: 'cb-note', text: `Not yet — ${later.length} more open at higher levels.` }),
            ...later.map(spellOption),
          ] : []),
        ])
        // nothing is owed, so the right-hand pane is the ladder rather than forty dead rows
        : pane('What is still to come', [
          el('div', { class: 'cb-note', text: 'Every slot you have reached is filled. The next one opens on its own.' }),
          ...slots.filter(s => !s.open).map(s => el('div', { class: 'cb-note', text: `Slot ${s.index + 1} — ${s.name}, at level ${s.level}. ${s.blurb}` })),
        ]),
    ];
  }

  // ------------------------------------------------------------------ the opening tab

  function drawOpening() {
    const crate = data?.opening?.crate || {};
    const companions = data?.opening?.companions || [];
    return [
      pane('One or the other', [
        option({
          name: 'Somebody comes with you',
          sub: 'A companion at your shoulder from the first morning. They scale with you and come back when they fall.',
          on: state.opening?.kind === 'companion',
          onclick: () => {
            state.opening = { kind: 'companion', companion: state.opening?.companion || companions[0]?.id || null };
            changed();
          },
        }),
        option({
          name: crate.name || 'A sealed chest',
          right: `${crate.gold ?? 450} gold`,
          sub: crate.blurb || 'Three things of magic quality or better, and enough coin to buy a fourth.',
          on: state.opening?.kind === 'crate',
          onclick: () => { state.opening = { kind: 'crate', companion: state.opening?.companion || null }; changed(); },
        }),
      ]),
      state.opening?.kind === 'companion'
        ? pane('Who', companions.map(c => option({
          name: c.name,
          right: c.count > 1 ? `×${c.count}` : null,
          sub: c.blurb,
          on: state.opening?.companion === c.id,
          onclick: () => { state.opening = { kind: 'companion', companion: c.id }; changed(); },
        })))
        : pane('What is in it', [
          el('div', { class: 'cb-note', text: `${crate.count ?? 3} items, none worse than ${crate.floor || 'magic'}, rolled through the same loot path as every chest in the game — so about a quarter of the time one of them comes out rare or better.` }),
          el('div', { class: 'cb-note cb-gold', text: `And ${crate.gold ?? 450} gold on top.` }),
        ]),
    ];
  }

  // ------------------------------------------------------------- the name tab (was 'look')

  function drawLook() {
    // (`data.looks` is no longer read here — see the note below on the body picker.)
    const field = el('div', { class: 'cb-field' }, [
      el('label', { text: 'Called', for: 'cb-name' }),
      el('input', {
        id: 'cb-name', type: 'text', value: state.name || '', maxlength: '24',
        placeholder: 'Freelance',
        oninput: e => { state.name = e.target.value; onChange(state); subtitle.textContent = summaryLine(); },
      }),
    ]);
    return [
      pane('Your own name for it', [
        field,
        el('div', { class: 'cb-note', text: 'This is what the character sheet calls your class. Your character\'s own name is on the step behind this one.' }),
      ]),
      /**
       * R18 — THE "START FROM" BODY PICKER IS GONE.
       *
       *   "It also asks which body to start from, but I actually customized my character before
       *    opening that screen - so that option should probably go."
       *
       * Quite right, and it was worse than redundant: the character step BEHIND this one has both
       * "Customize appearance…" and "Use the class look", so a player who had already built a face
       * was being asked to choose a body that their own face then replaced. `build.look` keeps its
       * default (`classbuild.json`'s `custom.baseLook`), which is what anybody who never opened the
       * appearance editor got anyway, and `installCustomClass` reads it exactly as before.
       */
    ];
  }

  // ------------------------------------------------------------------ drawing

  function summaryLine() {
    const d = describeBuild(state, cat, data, { level: levelNow() });
    return `${d.name} · ${d.loadout}${d.element ? ` (${d.element})` : ''} · ${d.picked}/${d.total} spells`
      + (d.pending ? ` · ${d.pending} to choose` : '') + ` · ${d.opening}`;
  }

  function draw() {
    if (!open) return;
    for (const [key, btn] of railButtons) btn.classList.toggle('on', key === tab);
    subtitle.textContent = summaryLine();
    const panes = tab === 'loadout' ? drawLoadout()
      : tab === 'spells' ? drawSpells()
        : tab === 'opening' ? drawOpening()
          : drawLook();
    body.textContent = '';
    body.appendChild(el('div', { class: 'cb-grid' }, panes));
    /**
     * R20 — in game the footer is a way out, not a gate. The build is already being played; there
     * is nothing left for `buildRefusal` to refuse, and a disabled "Not finished" on a character
     * who is out in the world would be a button that can never be pressed.
     */
    if (inGame) {
      const owed = pendingPicks(state, cat, levelNow());
      why.textContent = owed ? `${owed} ${owed === 1 ? 'spell' : 'spells'} still to choose.` : '';
      done.disabled = false;
      done.textContent = 'Close';
      return;
    }
    const refusal = buildRefusal(state, cat, data);
    why.textContent = refusal || '';
    done.disabled = !!refusal;
    done.textContent = refusal ? 'Not finished' : 'Done — use this build';
  }

  function show(which = null) { if (which) tab = which; open = true; root.hidden = false; draw(); }
  function hide() { open = false; root.hidden = true; }

  /**
   * ESC CLOSES IT, and it has to win over the title screen's own Esc.
   *
   * js/newgame.js listens on the capture phase to step back a screen. If this one is up, that would
   * take the whole character step away underneath an open builder — so this listens on capture too
   * and stops the event where it is.
   */
  function onKey(e) {
    if (e.key !== 'Escape' || !open || embedded) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    hide();
    onClose(state);
  }
  window.addEventListener('keydown', onKey, true);

  /**
   * The summary that goes in the class card on the character step, with the way in on it.
   *
   * This is the ONLY hook the title screen needs: js/newgame.js hands it the same `#boot-class-card`
   * it fills for the other thirty classes and this writes the custom one into it. No new element in
   * index.html, no new rule in style.css.
   */
  function card(box) {
    if (!box) return;
    const d = describeBuild(state, cat, data);
    const refusal = buildRefusal(state, cat, data);
    box.textContent = '';
    box.classList.add('cb-card');
    box.append(
      el('h4', { text: d.name }, [el('span', { text: ' Built to order' })]),
      el('p', { class: 'cb-note', text: `${d.loadout}${d.element ? ` · ${d.element}` : ''} · ${d.opening}` }),
      el('ul', {}, d.spells.map(s => el('li', {}, [
        // R20 — an empty slot is not "nothing picked" any more, it is one you have not reached
        el('b', { text: s.name || (s.level > 1 ? 'chosen when you get there' : 'nothing picked') }),
        el('span', { class: 'cb-note', text: s.level > 1 ? ` — level ${s.level}` : ' — from the start' }),
      ]))),
      refusal ? el('p', { class: 'cb-why', text: refusal }) : el('p', { class: 'cb-good', text: 'Ready.' }),
      el('button', { class: 'cb-open', type: 'button', text: refusal ? 'Open the builder' : 'Change it', onclick: () => show() }),
    );
  }

  return {
    show, hide, card, draw,
    get open() { return open; },
    get build() { return state; },
    set build(b) { state = b || createBuild(data); draw(); },
    get catalogue() { return cat; },
    get refusal() { return buildRefusal(state, cat, data); },
    dispose() { window.removeEventListener('keydown', onKey, true); root.remove(); },
  };
}
