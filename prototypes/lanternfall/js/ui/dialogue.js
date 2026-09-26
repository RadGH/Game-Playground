// Dialogue box (docs/02 §23): a speaker's portrait initial, name and line (from Lingo via ctx.talk), with up to
// four replies. args: { speakerId, name, lines: [text], choices: [{ label, fn }] }.
import { el, btn } from './menukit.js';
export const dialogue = {
  id: 'dialogue', title: 'Talk', overlay: true,
  render(root, ctx, args, router) {
    const lines = args.lines?.length ? args.lines : ['…'];
    let k = 0; const text = el('p', { class: 'lf-line', text: lines[0] });
    const next = () => { k++; if (k < lines.length) text.textContent = lines[k]; else { router.back(); args.onDone?.(); } };
    const choices = (args.choices || []).map(c => btn(c.label, () => { router.back(); c.fn?.(); }, { cls: 'small' }));
    root.append(el('div', { class: 'lf-frame small lf-dialogue' },
      el('div', { class: 'row' }, el('div', { class: 'lf-portrait', text: (args.name || '?')[0] }), el('div', { class: 'col grow' }, el('b', { class: 'gold', text: args.name || '' }), text)),
      el('div', { class: 'row end' }, ...choices, btn(choices.length ? 'Leave' : 'Next ▸', next, { cls: 'primary', 'data-autofocus': '' }))));
  },
  onKey(code) { if (code === 'KeyE') { document.querySelector('.lf-dialogue .primary')?.click(); return true; } return false; },
};
export const screens = [dialogue];
