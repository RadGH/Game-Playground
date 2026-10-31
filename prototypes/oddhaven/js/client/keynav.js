// Menus from the keyboard (PLAN rule 7): up and down, or W and S, move a highlight over the buttons of the top sheet, Enter
// presses, and the digits press the first nine. Esc closes (input.js `menu`). The same highlight the controller uses.
const usable = box => [...box.querySelectorAll('button:not([disabled])')].filter(b => b.getClientRects().length && !b.classList.contains('od-x'));

export function createKeyNav() {
  let cur = null;
  const mark = b => { cur?.classList.remove('pad-focus'); cur = b; if (b) { b.classList.add('pad-focus'); b.scrollIntoView?.({ block: 'nearest' }); } };
  addEventListener('keydown', e => {
    const box = [...document.querySelectorAll('.modal')].pop();
    if (!box || /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || '')) { if (!box) mark(null); return; }
    const list = usable(box); if (!list.length) return;
    const at = list.indexOf(cur), go = d => { e.preventDefault(); mark(at < 0 ? list[0] : list[(at + d + list.length) % list.length]); };
    if (e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'Tab') go(1);
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') go(-1);
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); e.stopPropagation(); (at >= 0 ? list[at] : list[0]).click(); mark(null); }
    else if (/^Digit[1-9]$/.test(e.code) && list[Number(e.code[5]) - 1]) { e.preventDefault(); e.stopPropagation(); list[Number(e.code[5]) - 1].click(); mark(null); }
  }, true);
  return { get current() { return cur; } };
}
