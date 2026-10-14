// Small DOM pieces minigame views share, so every game's top bar looks and reads the same.
//   scoreBar(ctx, { unit })      -> { set(scores, left), el }     a chip per player (portrait, seat colour + shape, score) and a clock
//   h(tag, cls, html)            -> element
//   floatText(stage, x, y, z, text, cls)   a number that rises off a point in the 3D scene
export const h = (tag, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function chip(p, extra = '') {
  return `<span class="chip" data-pid="${p.pid}" data-shape="${p.shape}" style="--seat:${p.color};--seat-dark:${p.dark}"><i class="face">${p.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i><b class="nm">${esc(p.name)}</b>${extra}</span>`;
}
export function scoreBar(ctx, { unit = '', clock = true } = {}) {
  const el = h('div', 'scorebar');
  el.innerHTML = ctx.players.map(p => chip(p, '<em class="sc">0</em>')).join('') + (clock ? '<span class="clock"><b>--</b></span>' : '');
  ctx.ui.append(el);
  const sc = new Map(ctx.players.map(p => [p.pid, el.querySelector(`[data-pid="${p.pid}"] .sc`)]));
  const chips = new Map(ctx.players.map(p => [p.pid, el.querySelector(`[data-pid="${p.pid}"]`)]));
  const clk = el.querySelector('.clock b');
  if (ctx.me != null) chips.get(ctx.me)?.classList.add('me');
  return {
    el,
    set(scores, left) {
      if (scores) { const best = Math.max(...Object.values(scores)); for (const [pid, n] of Object.entries(scores)) { const e = sc.get(+pid); if (!e) continue; const s = String(n); if (e.textContent !== s) e.textContent = s; chips.get(+pid).classList.toggle('lead', n === best && best > 0); } }
      if (clk && left != null) { const s = String(left); if (clk.textContent !== s) { clk.textContent = s; clk.parentElement.classList.toggle('hurry', left <= 10); } }
    },
    mark(pid, cls, on = true) { chips.get(pid)?.classList.toggle(cls, on); },
    unit,
  };
}
export function floatText(stage, x, y, z, text, cls = '') {
  const p = stage.toScreen(x, y, z), e = h('div', 'float-text ' + cls); e.textContent = text;
  e.style.left = p.x + 'px'; e.style.top = p.y + 'px';
  document.getElementById('tags').append(e); setTimeout(() => e.remove(), 1100);
}
