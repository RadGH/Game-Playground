// Farhold R17 — the Followers screen.
//
//   "We should also add a Followers tab to the menu where you can manage your follower slots."
//
// Its own file and its own stylesheet, the way js/civics-ui.js is, and for the same reason: the
// character sheet lives in js/hud.js and index.html, and this round does not own either. It mounts
// into whatever it is given, so it works as a stand-alone screen on a key AND as a tab inside the
// sheet — `embedded: true` drops the fixed positioning and its own close button and lets the
// sheet's Esc and cursor hand-off cover it.
//
//   import { createFollowersScreen } from './followers-ui.js';
//   const company = createFollowersScreen({ followers, pets, getPlayer, hireAt, … });
//   company.toggle();     // `F`
//
// THREE TABS, and each one is a job the user asked for:
//   Company  — the roster, the slot ladder, and a dismiss on everything that can be dismissed
//   Hire     — the mercenary broker's board, in whatever settlement you are standing in
//   Spells   — the in-game respec: unlearn a pick and spend it again, at any time

import { createClassBuilder } from './classbuild-ui.js';
import { installCustomClass } from './classbuild.js';

const CSS_HREF = 'followers.css';

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
  return el('div', { class: 'flw-pane' }, [el('h3', { text: title }), ...[].concat(kids)]);
}
const empty = text => el('div', { class: 'flw-empty', text });

function row(label, right, sub = null, cls = '') {
  const kids = [el('b', { text: label })];
  if (right != null) kids.push(el('span', { class: `flw-right ${cls}`.trim(), text: String(right) }));
  if (sub) kids.push(el('span', { class: 'flw-sub', text: sub }));
  return el('div', { class: 'flw-row' }, kids);
}

export const FOLLOWER_TABS = [
  { key: 'company', name: 'Company' },
  { key: 'hire', name: 'Hire' },
  { key: 'spells', name: 'Spells' },
];

export function createFollowersScreen({
  followers = null, pets = null,
  getPlayer = () => null, getDay = () => 1,
  /** Where the player is STANDING — `control`, not the player. See js/followers.js `getAt`. */
  getAt = () => null,
  /**
   * Where a mercenary could be hired, if anywhere. The settlement you are standing in, or null —
   * and null is a sentence on the tab rather than four dead rows, which is the rule the Holding
   * screen's Muster tab already follows.
   */
  hireAt = () => null,
  log = null, mount = document.body, embedded = false,
  /**
   * The respec needs the same four things the title-screen builder does, plus the live skill bar so
   * a changed pick reaches the keys and not only the screen. Left out, the Spells tab says what it
   * is and offers nothing — which is the honest thing for a preset class.
   */
  classData = null, skillData = null, classLooks = null, classbuildData = null,
  skills = null, forest = null,
} = {}) {
  if (!document.querySelector(`link[href="${CSS_HREF}"]`)) {
    document.head.appendChild(el('link', { rel: 'stylesheet', href: CSS_HREF }));
  }

  let tab = 'company';
  let open = false;

  const body = el('div', { class: 'flw-body' });
  /**
   * The respec's own box, beside the body rather than inside it.
   *
   * `draw()` empties `body` on every redraw, and the class builder owns a root element of its own —
   * mounted inside `body` it would be thrown away the first time you looked at another tab and
   * never come back, which is a screen that works exactly once.
   */
  const respecBox = el('div', { class: 'flw-respec', hidden: true });
  const railButtons = new Map();
  const rail = el('div', { class: 'flw-rail' }, FOLLOWER_TABS.map(t => {
    const b = el('button', { type: 'button', text: t.name, onclick: () => { tab = t.key; draw(); } });
    railButtons.set(t.key, b);
    return b;
  }));
  const subtitle = el('span', { class: 'flw-sub' });
  const root = el('div', { class: `flw${embedded ? ' flw--tab' : ''}`, hidden: true }, [
    el('div', { class: 'flw-head' }, [
      el('h2', { text: 'Your Company' }),
      subtitle,
      embedded ? null : el('button', { class: 'flw-close', type: 'button', text: 'Close  (F)', onclick: () => hide() }),
    ]),
    rail,
    body,
    respecBox,
  ]);
  mount.appendChild(root);

  function say(text, kind = '') { if (log) log(text, kind); }

  // ------------------------------------------------------------------ the company tab

  function drawCompany(r) {
    /** The slot strip: one box a slot, so "three of five" is a picture and not a sentence. */
    const strip = el('div', { class: 'flw-slots' },
      Array.from({ length: Math.max(r.limit, 5) }, (_, i) => el('div', {
        class: `flw-slot${i < r.used ? ' full' : ''}${i >= r.limit ? ' locked' : ''}`,
        text: i < r.used ? '●' : i >= r.limit ? '·' : '○',
        title: i >= r.limit ? 'Not yours yet' : i < r.used ? r.followers[i]?.name : 'Free',
      })));

    const roster = r.followers.length
      ? r.followers.map(f => {
        const line = el('div', { class: 'flw-row' }, [
          el('b', { text: f.name }),
          el('span', { class: 'flw-right', text: `${f.hp} / ${f.maxHp}` }),
          el('span', {
            class: 'flw-sub',
            text: `${f.kind.name} · level ${f.level} · ${f.state}`
              + `${f.ranged ? ' · shoots' : ''}`
              + `${f.abilities.length ? ` · casts ${f.abilities.join(', ')}` : ''}`
              + `${f.carrying ? ` · ${f.carrying}` : ''}`,
          }),
        ]);
        const bar = el('div', { class: 'flw-hp' }, [el('i', {})]);
        bar.firstChild.style.width = `${Math.round(Math.max(0, Math.min(1, f.hp / Math.max(1, f.maxHp))) * 100)}%`;
        line.append(bar);
        line.append(el('div', { class: 'flw-act' }, [
          el('button', {
            type: 'button',
            text: f.canDismiss ? 'Let them go' : 'Came with you',
            disabled: !f.canDismiss,
            title: f.canDismiss ? 'They leave, and the slot is free' : 'A class companion stays with you',
            onclick: () => {
              const out = followers.dismiss(f.uid);
              if (!out.ok) say(out.why, 'bad');
              draw();
            },
          }),
        ]));
        return line;
      })
      : [empty('Nobody walks with you. Summon something, or hire somebody in a town.')];

    return [
      pane(`${r.used} of ${r.limit} slots filled`, [
        strip,
        ...roster,
      ]),
      pane('Where the slots come from', [
        ...r.ladder.map(l => row(l.what, l.n > 0 ? `+${l.n}` : '—', l.note || null, l.have ? 'flw-good' : 'flw-bad')),
        r.nextSlotAt
          ? el('div', { class: 'flw-note', text: `The next one comes at level ${r.nextSlotAt}.` })
          : el('div', { class: 'flw-note', text: 'Every slot the levels give you is yours. The Kept Company is the only place more come from.' }),
        el('div', { class: 'flw-note', text: `A summoning spell may have ${r.perType} of each creature standing at once — the spell's own limit, plus The Kept Company — and every one of them takes one of the slots above.` }),
      ]),
      r.waiting.length
        ? pane('Coming back', r.waiting.map(w => row(w.name, `${w.left}s`, 'fell, and will be back on its own')))
        : null,
    ].filter(Boolean);
  }

  // ------------------------------------------------------------------ the hire tab

  function drawHire(r) {
    const spot = hireAt();
    if (!spot) {
      return [pane('Nobody to hire out here', empty(
        'A mercenary broker keeps a board in every settlement. Walk into one and the names appear '
        + 'here — a bigger place carries more of them, and what is on the board changes every few days.'))];
    }
    const board = followers.board({ town: spot.town, day: spot.day ?? getDay() });
    if (!board.length) {
      return [pane(`${spot.name || 'Here'} — nobody for hire`, empty(
        'Too small a place, or nobody who would go where you are going. Try somewhere larger.'))];
    }
    return [
      pane(`${spot.name || 'The board'} — ${board.length} for hire`, board.map(m => {
        const line = el('div', { class: 'flw-row' }, [
          el('b', { text: m.name }),
          el('span', { class: 'flw-right flw-gold', text: `${m.price} gold` }),
          el('span', { class: 'flw-sub', text: m.blurb }),
          ...m.rows.map(([k, v]) => el('span', { class: 'flw-sub', text: `${k}: ${v}` })),
        ]);
        line.append(el('div', { class: 'flw-act' }, [
          el('button', {
            type: 'button', class: m.refusal ? '' : 'flw-go',
            text: m.refusal ? 'Cannot take them on' : `Take them on — ${m.price} gold`,
            disabled: !!m.refusal,
            onclick: async () => {
              const out = await followers.hire(m.id, { at: getAt() || getPlayer(), town: spot.town });
              if (!out.ok) say(out.why, 'bad');
              draw();
            },
          }),
        ]));
        if (m.refusal) line.append(el('span', { class: 'flw-sub flw-bad', text: m.refusal }));
        return line;
      })),
      pane('What hiring somebody means', [
        el('div', { class: 'flw-note', text: 'Paid once, up front. They take one of your follower slots, they scale with your level for as long as they are with you, and they grow into better kit and new spells at the levels their own row names.' }),
        el('div', { class: 'flw-note', text: 'When one falls they come back on their own after a while, the same as any companion. Letting one go is free and does not get your money back.' }),
        el('div', { class: 'flw-note', text: 'This is not the same as asking somebody to come and live at your holding — that is a citizen, and it happens in a conversation in town.' }),
      ]),
    ];
  }

  // ------------------------------------------------------------------ the spells tab

  /** The respec, built lazily and only for a character who has a build to respend. */
  let respec = null;
  function drawSpells() {
    const player = getPlayer();
    const build = player?.build;
    if (!build?.custom || !classbuildData) {
      const ids = skillData?.classes?.[player?.classId] || [];
      const at = skillData?.unlockAt || [1, 3, 7, 12, 18, 24];
      return [pane('Your six', [
        el('div', { class: 'flw-note', text: `${player?.classLabel || 'This class'} comes with a fixed six. Build your own class on the title screen and every one of them is a choice you can take back.` }),
        ...ids.map((id, i) => row(skillData?.skills?.[id]?.name || id, at[i] > 1 ? `level ${at[i]}` : 'from the start', skillData?.skills?.[id]?.desc || '')),
      ])];
    }
    if (!respec) {
      respec = createClassBuilder({
        classData, skillData, classLooks, data: classbuildData, build,
        getPlayer, forest, embedded: true, mount: respecBox,
        tabs: [{ key: 'spells', name: 'Spells' }],
        /**
         * THE RESPEC HAS TO REACH THE KEYS, NOT ONLY THE SCREEN.
         *
         * `installCustomClass` rewrites `skillData.classes.custom`, and `createSkillBar` read that
         * list once at boot — so without `relearn` the screen would show the new spell and key 3
         * would still fire the old one. That is a change that looks applied and is not, which is
         * the worst kind and the one this round keeps finding.
         */
        onChange: b => {
          installCustomClass({ classData, skillData, classLooks, data: classbuildData, build: b });
          skills?.relearn?.(skillData.classes[classbuildData.custom?.id || 'custom']);
          player.build = b;
        },
      });
      respec.show('spells');
    }
    // the builder owns its own root inside `body`, so this tab draws nothing else
    respec.draw();
    return null;
  }

  // ------------------------------------------------------------------ drawing

  function draw() {
    if (!open) return;
    for (const [key, btn] of railButtons) btn.classList.toggle('on', key === tab);
    const r = followers?.report?.() || { limit: 3, used: 0, free: 3, followers: [], waiting: [], ladder: [], perType: 1 };
    subtitle.textContent = `${r.used} of ${r.limit} slots · level ${r.level || 1}`;
    if (tab === 'spells') {
      const panes = drawSpells();
      body.textContent = '';
      body.hidden = !panes;
      respecBox.hidden = !!panes;
      if (panes) body.appendChild(el('div', { class: 'flw-grid' }, panes));
      return;
    }
    respecBox.hidden = true;
    body.hidden = false;
    body.textContent = '';
    const panes = tab === 'company' ? drawCompany(r) : drawHire(r);
    body.appendChild(el('div', { class: 'flw-grid' }, panes));
  }

  function show(which = null) { if (which) tab = which; open = true; root.hidden = false; draw(); }
  function hide() { open = false; root.hidden = true; }
  function toggle(which = null) { if (open) hide(); else show(which); }

  if (!embedded) {
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && open) hide();
    });
  }

  return {
    show, hide, toggle, draw,
    get open() { return open; },
    get root() { return root; },
    set tab(t) { tab = t; draw(); },
  };
}
