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
  spellCatalogue, createBuild, pickSpell, unlearnSpell, slotsOf, loadoutOf,
  loadoutRefusal, buildRefusal, describeBuild, PICK_COUNT,
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
  { key: 'look', name: 'Look' },
];

export function createClassBuilder({
  classData = null, skillData = null, classLooks = null, data = null,
  build = null, getPlayer = () => null, forest = null,
  onChange = () => {}, onClose = () => {},
  mount = document.body, embedded = false, tabs = null,
} = {}) {
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
    const slots = slotsOf(state, cat);
    const left = slots.map(s => {
      const row = el('div', { class: `cb-slot${editing === s.index ? ' on' : ''}` }, [
        el('span', { class: 'cb-lv', text: s.level > 1 ? `level ${s.level}` : 'from the start' }),
        el('span', {
          class: `cb-pick${s.spell ? ' filled' : ''}`,
          text: s.spell ? s.spell.name : `${s.name} — nothing picked`,
        }),
      ]);
      /**
       * UNLEARN, AND IT IS ALWAYS THERE.
       *
       * "You should be able to unlearn a skill at any time." So the button is on every filled slot
       * on both the title screen and the in-game respec, it costs nothing, and the pick comes
       * straight back to be spent again.
       */
      row.append(s.spell
        ? el('button', {
          type: 'button', text: 'Unlearn', title: `Take ${s.spell.name} back out of this slot`,
          onclick: e => { e.stopPropagation(); unlearnSpell(state, s.index); editing = s.index; changed(); },
        })
        : el('span', { class: 'cb-note', text: 'empty' }));
      row.addEventListener('click', () => { editing = s.index; draw(); });
      return row;
    });

    const slot = slots[editing] || slots[0];
    const list = cat.spells.map(sp => {
      const tooLate = sp.tier > slot.level;
      const elsewhere = state.spells.findIndex((id, i) => id === sp.id && i !== slot.index);
      return option({
        name: sp.name,
        right: sp.tier > 1 ? `tier ${sp.tier}` : 'opening',
        sub: `${sp.desc} · ${sp.shape}, ${sp.element}${sp.classes.length ? ` · ${sp.classes.slice(0, 3).join(', ')}${sp.classes.length > 3 ? '…' : ''}` : ''}`,
        on: slot.spellId === sp.id,
        why: tooLate
          ? `A level ${sp.tier} spell. This slot opens at level ${slot.level}.`
          : elsewhere >= 0 ? `Already in slot ${elsewhere + 1}.` : null,
        onclick: () => { pickSpell(state, slot.index, sp.id, cat); changed(); },
      });
    });

    return [
      pane(`Your six (${state.spells.filter(Boolean).length} of ${PICK_COUNT} picked)`, [
        el('div', { class: 'cb-note', text: 'One spell at the start and one more at every level a class unlocks a skill at — the same ladder every preset class uses. Click a slot, then pick.' }),
        el('div', { class: 'cb-slots' }, left),
      ]),
      pane(`${slot.name} — what can go in slot ${slot.index + 1}`, [
        el('div', { class: 'cb-note', text: slot.blurb }),
        ...list,
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

  // ------------------------------------------------------------------ the look tab

  function drawLook() {
    const looks = data?.looks || [];
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
      pane('Start from', [
        el('div', { class: 'cb-note', text: 'Whose body you begin with. Customize on the character step replaces the whole face afterwards — this is only the starting point.' }),
        ...looks.map(id => option({
          name: classData?.classes?.find(c => c.id === id)?.name || id,
          sub: classLooks?.classes?.[id]?.name || '',
          on: state.look === id,
          onclick: () => { state.look = id; changed(); },
        })),
      ]),
    ];
  }

  // ------------------------------------------------------------------ drawing

  function summaryLine() {
    const d = describeBuild(state, cat, data);
    return `${d.name} · ${d.loadout}${d.element ? ` (${d.element})` : ''} · ${d.picked}/${d.total} spells · ${d.opening}`;
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
        el('b', { text: s.name || 'nothing picked' }),
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
