// Class select and new game options (docs/02 §9, §10). Five classes from data/classes.json in canon order; the
// two unlockable ones stay selectable to read about, show their challenge + trial alternative + live progress
// from ctx.profile (02 §9.1), and play their preview greyed. The preview is the Wick builder's test chamber
// casting the class's starting wicks at a dummy. New game options: difficulty (the one table, 02 §10.1, shown as
// a tooltip card per choice), Iron Wick, lesson hints, subtitles, skip intro, room seed.
import { el, btn, toast, fmt, hp, pct, cap, ATTRS, ATTR_NAMES, confirmBox } from './menukit.js';
import { TestChamber } from './chamber.js';

const GLYPH = { lamplighter: '🏮', sluicewarden: '⚓', tinker: '🔧', chimneysweep: '🧹', moth_oracle: '🦋' };
const PLAYS = {
  lamplighter: 'Keep your distance, braid big wicks, and use the pole when crowded. Every pole hit feeds the lantern.',
  sluicewarden: 'Stand your ground behind the shield and make the water work for you. Slow, hard to move, hard to kill.',
  tinker: 'Build first, fight second: runes, planks and a turret do the work while you stay out of reach.',
  chimneysweep: 'Never touch the ground for long. Double jump, wall-run and a rope in every hand.',
  moth_oracle: 'Hunt in the dark. Mark your prey, strike from where they cannot see, and crit hard.',
};
/** The one difficulty table (02 §10.1). Rules code reads data/difficulty.json; this is the player-facing copy. */
export const DIFFICULTY = [
  { id: 'wicklit', name: 'Wick-lit', blurb: 'for the story. Forgiving fights, longer warnings.' },
  { id: 'lamplighter', name: 'Lamplighter', blurb: 'the intended game.' },
  { id: 'lampless', name: 'Lampless', blurb: 'harder hits, thinner oil, harsher deaths.' },
];
export const DIFF_ROWS = [
  ['Enemy health', 0.7, 1, 1.35, 'x'], ['Enemy damage', 0.6, 1, 1.3, 'x'], ['Enemy speed', 0.9, 1, 1.08, 'x'], ['Boss health', 0.75, 1, 1.25, 'x'],
  ["Mother Tallow's third phase", 'no', 'no', 'yes'], ['Telegraph wind-up', 1.3, 1, 0.9, 'x'], ['Attack tokens (melee / ranged)', '1 / 2', '2 / 3', '3 / 4'],
  ['Elite chance', 0, 0.08, 0.18, 'pct'], ['Bosses enrage', 'no', 'yes', 'yes'], ['Void zone damage', 0.5, 1, 1.3, 'x'], ['Wick oil cost', 0.85, 1, 1.1, 'x'],
  ['Oil regen', 1.3, 1, 0.85, 'x'], ['Tonic healing', 1.25, 1, 0.85, 'x'], ['Gutter chance', 0.5, 1, 1.25, 'x'], ['Breath underwater', 1.5, 1, 0.8, 'x'],
  ['XP gained', 1, 1, 1.1, 'x'], ['Pennies dropped', 1, 1, 1.15, 'x'], ['Pennies lost on death', 0, 0.25, 0.5, 'pct'], ['Guild marks', 0.8, 1, 1.3, 'x'], ['Aim assist (gamepad)', 2, 1, 1, 'n'],
];
const cell = (v, u) => typeof v !== 'number' ? v : u === 'pct' ? pct(v) : u === 'x' ? '×' + fmt(v) : fmt(v);
export function difficultyCard(id) {
  const k = DIFFICULTY.findIndex(d => d.id === id); if (k < 0) return null;
  return el('div', { class: 'lf-card' }, el('div', { class: 'card-name', text: DIFFICULTY[k].name }),
    el('table', { class: 'lf-table' }, el('tbody', {}, DIFF_ROWS.map(r => el('tr', {}, el('td', { text: r[0] }), el('td', { class: 'n', text: cell(r[1 + k], r[4]) }))))));
}

/** Locked class progress lines (02 §9.1). profile.counters + profile.trials. */
export function challengeLines(cls, profile = {}) {
  const c = profile.counters || {}, t = profile.trials || {};
  const medal = id => t[id] ? `${cap(t[id])} medal` : 'not cleared';
  if (cls.id === 'chimneysweep') return {
    challenge: 'Swing 2,000 m on ropes in one save, or take bronze in the Rope Gauntlet trial.',
    progress: [`Most rope swung in one save: ${hp(c.ch_sweep_best_rope_m || 0)} m / 2,000 m`, `Rope Gauntlet: ${medal('trial_rope_gauntlet')} (door in The Long Chain, Act 2)`],
    id: 'sweep_rope_2000' };
  if (cls.id === 'moth_oracle') return {
    challenge: 'Clear Act 4 without your lantern going out (hooding is not "out"), or take bronze in the Hooded Crossing trial.',
    progress: [c.ch_moth_best_outs == null ? 'Blackwater cleared with lantern lit: not yet.' : `Blackwater cleared with lantern lit: not yet. Best: lantern went out ${hp(c.ch_moth_best_outs)}× in your cleanest clear`, `Hooded Crossing: ${medal('trial_hooded_crossing')} (door in Lampless Lane, Act 4)`],
    id: 'moth_lantern_lit' };
  return null;
}
export function isUnlocked(cls, profile = {}) { return !!(cls.unlock?.default || profile.classes?.[cls.id]); }
const NAME_OK = /^[A-Za-z][A-Za-z '\-]{0,15}$/;
const NAME_A = ['Wr', 'Ils', 'Od', 'Bram', 'Hes', 'Tam', 'Corr', 'Mab', 'Fen', 'Sel', 'Aud', 'Pim', 'Rook', 'Ves', 'Nell', 'Qu'];
const NAME_B = ['en', 'e', 'ile', 'well', 'ter', 'sin', 'a', 'wick', 'ny', 'mer', 'ra', 'ley', 'ett', 'ow', 'is', 'in'];
export function rollName(rng = Math.random) { return NAME_A[(rng() * NAME_A.length) | 0] + NAME_B[(rng() * NAME_B.length) | 0]; }

let CS = null;
export const classSelect = {
  id: 'classselect', title: 'Who goes down?',
  render(root, ctx, args, router) {
    const D = ctx.data, list = D.classes.list, profile = ctx.profile || {};
    const switchMode = args.mode === 'switch';
    const cur = ctx.game?.hero?.class;
    const shown = switchMode ? list.filter(c => isUnlocked(c, profile) && c.id !== cur) : list;
    CS = { pick: args.classId || (switchMode ? shown[0]?.id : 'lamplighter'), name: args.name || 'Wren', palette: args.palette || 0, chamber: null, cast: 0 };
    const canvas = el('canvas', { class: 'lf-chamber', 'aria-label': 'Class preview' });
    const preview = el('div', { class: 'col' });
    const grid = el('div', { class: 'lf-classgrid', role: 'listbox', 'aria-label': 'Classes' });
    const nameIn = el('input', { class: 'lf-input', type: 'text', maxlength: 16, value: CS.name, 'aria-label': 'Name', oninput: e => { CS.name = e.target.value; } });
    const draw = () => {
      grid.replaceChildren(...shown.map(c => {
        const open = isUnlocked(c, profile);
        const b = el('button', { type: 'button', role: 'option', 'aria-selected': String(c.id === CS.pick), class: 'lf-classcard' + (c.id === CS.pick ? ' on' : '') + (open ? '' : ' locked'), onclick: () => { CS.pick = c.id; draw(); }, 'data-k': c.id },
          el('span', { class: 'glyph', text: GLYPH[c.id] || '◆' }), el('span', { text: c.name.toUpperCase() }), open ? null : el('span', { class: 'tiny', text: '🔒 locked' }));
        return b;
      }));
      const c = D.classes.byId[CS.pick]; const open = isUnlocked(c, profile); const ch = challengeLines(c, profile);
      const wicks = c.startWicks.map(w => `${D.flames.byId[w.flame]?.name} ${D.shapes.byId[w.shape]?.name}${w.dry ? ' (dry)' : ''}`).join(' · ');
      preview.replaceChildren(canvas,
        el('h3', { class: 'lf-h', text: `${c.name.toUpperCase()} — ${c.role}` }),
        el('div', { class: 'small' }, el('b', { text: 'Wicks: ' }), wicks),
        el('div', { class: 'small' }, el('b', { text: 'Ability: ' }), cap(String(c.ability).replace('ability_', '').replace(/_/g, ' ')), el('span', { class: 'dim', text: ' (from the Act 1 relight)' })),
        el('div', { class: 'lf-attrbars' }, ATTRS.map(a => [el('span', { text: ATTR_NAMES[a] }), el('span', { class: 'bar', 'aria-label': `${c.attrs[a]}`, text: '▮'.repeat(Math.round(c.attrs[a] / 2)) + '▯'.repeat(Math.max(0, 5 - Math.round(c.attrs[a] / 2))) })]).flat()),
        el('p', { class: 'small', text: `${c.desc} ${PLAYS[c.id] || ''}` }),
        !open && ch ? el('div', { class: 'lf-panel col' }, el('b', { class: 'gold', text: 'How to unlock' }), el('span', { class: 'small', text: ch.challenge }), ...ch.progress.map(t => el('span', { class: 'small dim', text: t })),
          btn(profile.tracked === ch.id ? 'Tracking ✓' : 'Track', () => { profile.tracked = profile.tracked === ch.id ? null : ch.id; ctx.actions.trackChallenge?.(profile.tracked); draw(); }, { cls: 'small' })) : null);
      canvas.classList.toggle('grey', !open);
      if (CS.chamber) { CS.cast = 0; nextWick(); }
      footer.replaceChildren(btn('Back', () => router.back()),
        switchMode ? btn('Answer the call ▸', () => open && confirmSwitch(), { cls: 'primary', disabled: open ? null : 'Locked.' })
          : btn('Choose ▸', () => choose(), { cls: 'primary', disabled: open ? null : 'Locked: see how to unlock it.' }));
      if (switchMode) footer.prepend(el('p', { class: 'small dim grow', text: `Level ${ctx.game?.hero?.level ?? '?'} kept · attribute and skill points refunded into the ${c.name}'s spread · new starting wicks added · gear kept (off-class weapons −20%)` }));
    };
    const nextWick = () => { const c = D.classes.byId[CS.pick]; const w = c.startWicks[CS.cast++ % c.startWicks.length]; CS.chamber.setWick({ id: 'p', ...w, charms: [] }, { level: 1, critChance: 0.05, critMult: 1.5 }); };
    const choose = () => {
      const n = CS.name.trim(); if (!NAME_OK.test(n)) { toast('Names are 1-16 letters, spaces, \' or -.', 'bad'); nameIn.focus(); return; }
      router.open('newgame', { slot: args.slot, classId: CS.pick, name: n, palette: CS.palette });
    };
    const confirmSwitch = async () => { if (await confirmBox(root, { title: 'Answer the call?', text: `Become a ${D.classes.byId[CS.pick].name}. This is 04's class switch rule.`, yes: 'Answer' })) { ctx.actions.switchClass?.(CS.pick); router.closeAll(); } };
    const footer = el('div', { class: 'row end' });
    const look = el('div', { class: 'row small' }, 'Coat', btn('◂', () => { CS.palette = (CS.palette + 7) % 8; lookLbl.textContent = `palette ${CS.palette + 1}/8`; }, { cls: 'small', 'aria-label': 'previous palette' }),
      el('span', { text: `palette ${CS.palette + 1}/8` }), btn('▸', () => { CS.palette = (CS.palette + 1) % 8; lookLbl.textContent = `palette ${CS.palette + 1}/8`; }, { cls: 'small', 'aria-label': 'next palette' }));
    const lookLbl = look.children[2];
    root.append(el('div', { class: 'lf-frame medium' },
      el('div', { class: 'lf-frame-head' }, el('h2', { class: 'lf-title', text: switchMode ? 'Answer the call' : 'Who goes down?' }), el('button', { class: 'lf-close', type: 'button', 'aria-label': 'Back', text: '✕', onclick: () => router.back() })),
      el('div', { class: 'lf-frame-body lf-two' },
        el('div', { class: 'col' }, grid, switchMode ? null : el('label', { class: 'row' }, 'Name', nameIn, btn('🎲', () => { CS.name = rollName(); nameIn.value = CS.name; }, { cls: 'small', 'aria-label': 'Roll a name' })), switchMode ? null : look),
        preview),
      el('div', { class: 'lf-frame-head' }, footer)));
    draw();
    try { CS.chamber = new TestChamber(canvas, D, { dummyHp: 10000, loop: 1.6, onCast: () => {} }); CS.chamber.opts.onCast = () => setTimeout(() => CS?.chamber && nextWick(), 1200); nextWick(); CS.chamber.start(); }
    catch (e) { console.warn('preview chamber', e); }
    requestAnimationFrame(() => grid.querySelector('.on')?.focus());
  },
  destroy() { CS?.chamber?.stop(); CS = null; },
};

let NG = null;
export const newGame = {
  id: 'newgame', title: 'Before you go down',
  render(root, ctx, args, router) {
    const seed = () => { try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch { return (Math.random() * 2 ** 32) >>> 0; } };
    NG = { difficulty: 'lamplighter', ironWick: false, hints: ctx.settings?.text?.lesson_hints ?? true, subtitles: ctx.settings?.text?.subtitles ?? true, skipIntro: false, seed: seed() };
    const radios = DIFFICULTY.map(d => el('label', { class: 'lf-choice', 'data-tip-render': 'difficulty', 'data-tip-difficulty': d.id },
      el('input', { type: 'radio', name: 'lf-diff', value: d.id, checked: d.id === NG.difficulty, onchange: () => { NG.difficulty = d.id; } }), el('span', {}, el('b', { text: d.name }), ' — ' + d.blurb)));
    const chk = (key, label, note) => el('label', { class: 'lf-choice' }, el('input', { type: 'checkbox', checked: NG[key], onchange: e => { NG[key] = e.target.checked; } }), el('span', {}, el('b', { text: label }), note ? el('span', { class: 'dim', text: ' — ' + note }) : null));
    const seedIn = el('input', { class: 'lf-input', type: 'text', inputmode: 'numeric', value: String(NG.seed), 'aria-label': 'Room seed', style: { width: '9em' }, onchange: e => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 0 && v < 2 ** 32) NG.seed = v; else { e.target.value = NG.seed; toast('The seed is a whole number from 0 to 4,294,967,295.', 'bad'); } } });
    root.append(el('div', { class: 'lf-frame small' },
      el('div', { class: 'lf-frame-head' }, el('h2', { class: 'lf-title', text: 'Before you go down' }), el('button', { class: 'lf-close', type: 'button', 'aria-label': 'Back', text: '✕', onclick: () => router.back() })),
      el('div', { class: 'lf-frame-body col' },
        el('h3', { class: 'lf-h', text: 'Difficulty' }), ...radios, el('p', { class: 'dim small', text: 'Hover or focus a choice to see its exact numbers. You can change it at any lamp-post.' }),
        chk('ironWick', 'Iron Wick', 'one life. Death ends this save. (Guild marks are kept.) Cannot be changed later.'),
        chk('hints', 'Lesson hints', 'one-line hints the first time each thing appears'), chk('subtitles', 'Subtitles'), chk('skipIntro', 'Skip intro'),
        el('label', { class: 'row' }, 'Room seed', seedIn, btn('🎲', () => { NG.seed = seed(); seedIn.value = NG.seed; }, { cls: 'small', 'aria-label': 'New seed' }), el('span', { class: 'dim small', text: 'changes the kit-built fight rooms only' }))),
      el('div', { class: 'lf-frame-head' }, el('span', { class: 'grow' }), btn('Back', () => router.back()), btn('Begin the descent ▸', async () => {
        const opts = { slot: args.slot, classId: args.classId, name: args.name, palette: args.palette, ...NG };
        const r = await ctx.actions.newGame?.(opts); if (typeof r === 'string') { toast(r, 'bad'); return; }
        router.closeAll();
      }, { cls: 'primary', 'data-autofocus': '' }))));
  },
  tips() { return { difficulty: node => difficultyCard(node.dataset.tipDifficulty) }; },
  destroy() { NG = null; },
};
export const screens = [classSelect, newGame];
