// SECRET ARCHITECT on a screen: a blueprint-paper look (blue grid, white chalk). The Architect's phone shows the secret
// blueprint, the pin/cross tools (tap a cell of the blueprint to drop one), the canned lines and every builder's grid
// live with its match. A builder's phone shows the Architect's messages, a big 6 x 6 grid of tappable cells with the
// pins and crosses on it, and Clear / Done. The TV shows the Architect, the messages and the marks; the reveal lays the
// blueprint next to every build, each cell marked as right (solid), missing (dashed) or extra (striped).
import { chip, esc } from '../../client/gamehud.js';

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, G = init.grid, N = G * G;
  const byPid = new Map(players.map(p => [p.pid, p]));
  const name = pid => byPid.get(pid)?.name || '?';
  const face = p => `<i class="sa-face" style="--seat:${p?.color || '#999'}">${p?.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i>`;
  const cells = (cls, tap) => Array.from({ length: N }, (_, i) => tap ? `<button class="sa-c" data-c="${i}" aria-label="row ${Math.floor(i / G) + 1} column ${i % G + 1}"></button>` : `<i class="sa-c" data-c="${i}"></i>`).join('');
  ui.innerHTML = `
    <div class="sa-top"><span class="sa-title">Secret Architect</span><span class="clock"><b>--</b></span></div>
    <div class="sa-chips">${players.map(p => chip(p, '<em class="sc">0</em><strong class="sa-tag"></strong>')).join('')}</div>
    <p class="sa-role"></p>
    <ol class="sa-do"></ol>
    <section class="sa-feed" aria-live="polite"></section>
    <section class="sa-arch">
      <p class="sa-cap">Only you can see this picture. Tap a square on it to drop your <b class="sa-tooln">pin</b>.</p>
      <div class="sa-grid sa-bp" data-g="arch">${cells('', true)}</div>
      <div class="sa-tools"><button class="sa-tool on" data-k="p"><i class="sa-pin" aria-hidden="true"></i>Pin <small></small></button><button class="sa-tool" data-k="x"><i class="sa-x" aria-hidden="true">✕</i>Cross <small></small></button></div>
      <div class="sa-say-h">Messages <small class="sa-left"></small></div>
      <button class="sa-name big-btn" data-say="name"></button>
      <div class="sa-lines">${Object.entries(init.lines).map(([k, t]) => `<button class="sa-line" data-say="${k}">${esc(t)}</button>`).join('')}</div>
      <div class="sa-bl-h">Your builders</div>
      <div class="sa-builders"></div>
    </section>
    <section class="sa-build">
      <p class="sa-legend"><span><i class="sa-c pin"></i> block goes here</span><span><i class="sa-c x"></i> leave empty</span></p>
      <div class="sa-grid sa-mine" data-g="mine">${cells('', true)}</div>
      <div class="sa-btns"><button class="sa-clear big-btn">Clear</button><button class="sa-done big-btn">Done</button><button class="sa-peek big-btn">Peek again</button></div>
    </section>
    <section class="sa-tv"><div class="sa-grid sa-board">${cells('', false)}</div><div class="sa-counts"></div></section>
    <section class="sa-show"><div class="sa-res"></div></section>
    <p class="sa-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'peek';
  if (me != null) ui.querySelector(`.sa-chips [data-pid="${me}"]`)?.classList.add('me');
  let g0 = null, role = null, tool = 'p', mine = '0'.repeat(N), done = false, priv = {}, round = -1, phase = '';

  const paintMarks = (el, marks) => { el.querySelectorAll('.sa-c').forEach(c => c.classList.remove('pin', 'x')); for (const [c, k] of marks || []) el.querySelector(`[data-c="${c}"]`)?.classList.add(k === 'p' ? 'pin' : 'x'); };
  const paintBits = (el, bits, cls = 'on') => el.querySelectorAll('.sa-c').forEach((c, i) => c.classList.toggle(cls, !!bits && bits[i] === '1'));
  const mini = (bits, tgt) => `<div class="sa-grid sa-mini">${Array.from({ length: N }, (_, i) => { const b = bits[i] === '1', t = tgt && tgt[i] === '1'; return `<i class="sa-c ${tgt ? (b && t ? 'hit' : t ? 'miss' : b ? 'extra' : '') : b ? 'on' : ''}"></i>`; }).join('')}</div>`;

  function paintArch() {
    const el = $('.sa-bp'); paintBits(el, priv.target, 'bp'); paintMarks(el, g0?.marks);
    const marks = g0?.marks || [], pins = marks.filter(m => m[1] === 'p').length, xs = marks.filter(m => m[1] === 'x').length;
    const [tp, tx] = ui.querySelectorAll('.sa-tool');
    tp.querySelector('small').textContent = `${init.pins - pins} left`; tx.querySelector('small').textContent = `${init.crosses - xs} left`;
    tp.classList.toggle('on', tool === 'p'); tx.classList.toggle('on', tool === 'x');
    $('.sa-tooln').textContent = tool === 'p' ? 'pin' : 'cross';
    const used = g0?.msgs.length || 0;
    $('.sa-left').textContent = `${init.msgs - used} of ${init.msgs} left`;
    const nb = $('.sa-name'); nb.textContent = `Say "It's ${priv.name || '…'}!"`; nb.disabled = !!priv.named || used >= init.msgs;
    ui.querySelectorAll('.sa-line').forEach(b => { b.disabled = used >= init.msgs; });
    $('.sa-builders').innerHTML = Object.entries(priv.grids || {}).map(([p, bits]) => `<div class="sa-bl">${chip(byPid.get(+p) || { pid: p, name: '?', color: '#999' })}${mini(bits)}<b class="sa-pct">${priv.match?.[p] ?? 0}% match</b></div>`).join('');
  }
  function paintBuild() {
    const el = $('.sa-mine'); paintBits(el, mine); paintBits(el, priv.target, 'bp'); paintMarks(el, g0?.marks);
    el.classList.toggle('peeking', !!priv.target);
    const d = $('.sa-done'); d.textContent = done ? 'Done! (tap to undo)' : 'Done'; d.classList.toggle('on', done);
    const pk = $('.sa-peek'); pk.hidden = !init.solo; pk.disabled = !priv.repeek || phase !== 'build'; pk.textContent = priv.repeek ? 'Peek again (1)' : 'No peeks left';
  }
  function paintFeed() {
    const list = g0?.msgs || [], a = byPid.get(g0?.arch);
    $('.sa-feed').innerHTML = init.solo ? '' : list.length
      ? list.map((t, i) => `<div class="sa-msg${i === list.length - 1 ? ' last' : ''}">${face(a)}<span>${esc(t)}</span></div>`).join('')
      : `<p class="sa-quiet">${a ? `${esc(a.name)} hasn't said anything yet…` : ''}</p>`;
  }
  ui.addEventListener('click', e => {
    if (watching) return;
    const b = e.target.closest('button'); if (!b) return;
    if (role === 'arch' && (phase === 'build' || phase === 'peek')) {
      if (b.classList.contains('sa-tool')) { tool = b.dataset.k; ctx.sfx('tap'); paintArch(); }
      else if (b.dataset.say) { ctx.send('say', b.dataset.say); ctx.sfx('pick'); }
      else if (b.closest('.sa-bp') && b.dataset.c != null) { ctx.send('mark', { c: +b.dataset.c, k: tool }); ctx.sfx('tap'); }
      return;
    }
    if (role === 'build' && phase === 'build') {
      if (b.closest('.sa-mine') && b.dataset.c != null) { const c = +b.dataset.c; mine = mine.slice(0, c) + (mine[c] === '1' ? '0' : '1') + mine.slice(c + 1); done = false; ctx.send('tap', c); ctx.sfx('tap'); paintBuild(); }
      else if (b.classList.contains('sa-clear')) { mine = '0'.repeat(N); done = false; ctx.send('clear'); ctx.sfx('tap'); paintBuild(); }
      else if (b.classList.contains('sa-done')) { done = !done; ctx.send('done', done); ctx.sfx(done ? 'good' : 'tap'); paintBuild(); }
      else if (b.classList.contains('sa-peek')) { ctx.send('peek'); ctx.sfx('pick'); }
    }
  });
  // round 10 (report #20, "confusing"): one headline saying who you are this round, then the one or two things to do
  // RIGHT NOW as numbered steps, different for every role and phase
  function roleText(g) {
    const a = name(g.arch);
    if (g.phase === 'show') return `It was ${g.shown.name}!`;
    if (init.solo) return g.phase === 'peek' ? 'Remember this picture!' : 'Now build it from memory!';
    if (watching) return `${a} is the Architect this round`;
    if (role === 'arch') return g.phase === 'peek' ? 'You are the ARCHITECT this round' : 'Help them copy your picture';
    return g.phase === 'peek' ? `${a} is the Architect. You are a BUILDER` : `Copy ${a}'s secret picture`;
  }
  function steps(g) {
    const a = name(g.arch);
    if (g.phase === 'show') return [];
    if (init.solo) return g.phase === 'peek' ? ['Look at which squares are filled. It disappears in a moment.'] : ['Tap squares to fill the ones you remember.', 'Stuck? "Peek again" shows it once more.'];
    if (watching) return ['Only the Architect sees the picture. The builders copy it from pins, crosses and hints.'];
    if (role === 'arch') return g.phase === 'peek'
      ? ['Look at your secret picture. Only you can see it.', 'In a moment the builders start copying it. You cannot draw it for them.']
      : ['Pick Pin or Cross, then tap your picture: it appears on their grids.', 'Send hints below. Their copies are at the bottom.'];
    return g.phase === 'peek'
      ? [`${a} is looking at a secret picture made of blocks.`, 'Get ready to copy it on your grid.']
      : ['Tap squares to fill them. Red pins = fill that square, ✕ = leave it empty.', `Read ${a}'s hints, then press Done.`];
  }
  function note(g) {
    if (g.phase === 'show') return init.solo ? `Your match: ${g.shown.match[me] ?? 0}%. ${init.need}% average passes.` : `Builders score their match; ${name(g.shown.arch)} scores half the average. Team average so far: ${g.team}% (${init.need}% wins).`;
    if (role === 'arch') return 'The closer their copies, the more points for everyone (you get half their average).';
    if (watching) return 'Ties go to whoever used fewer messages as Architect.';
    return 'Tap a filled square again to empty it. Extra blocks lower your match.';
  }
  function paintShow(s) {
    const order = Object.keys(s.grids);
    $('.sa-res').innerHTML = `<div class="sa-rc sa-tgt"><b>The blueprint</b>${mini(s.target)}<span>${esc(s.name)}</span></div>` + order.map(p => `<div class="sa-rc${+p === me ? ' me' : ''}">${chip(byPid.get(+p) || { pid: p, name: '?', color: '#999' })}${mini(s.grids[p], s.target)}<span class="sa-pct">${s.match[p]}% match (+${s.match[p]})</span></div>`).join('')
      + (s.arch != null ? `<div class="sa-rc sa-ar">${chip(byPid.get(s.arch))}<span>Architect +${s.archGot}</span></div>` : '')
      + '<p class="sa-key"><i class="sa-c hit"></i> right <i class="sa-c miss"></i> missing <i class="sa-c extra"></i> extra</p>';
  }
  return {
    priv(d) {
      priv = d || {}; if (priv.role) role = priv.role;
      if (role === 'build' && priv.grid != null) { mine = priv.grid; done = !!priv.done; }
      ui.dataset.role = role || '';
      if (role === 'arch') paintArch(); else if (role === 'build') paintBuild();
    },
    state(g) {
      g0 = g;
      if (g.round !== round) { round = g.round; tool = 'p'; done = false; }
      if (g.phase !== phase) { if (g.phase === 'show') ctx.sfx(me != null && (g.shown.match[me] ?? 50) >= init.need ? 'good' : 'pick'); if (g.phase === 'build') ctx.sfx('tap'); }
      phase = g.phase; ui.dataset.phase = g.phase;
      if (!init.solo && g.arch != null) role = g.arch === me ? 'arch' : me != null ? 'build' : null;
      if (init.solo && me != null) role = 'build';
      ui.dataset.role = role || '';
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'build' && g.left <= 5);
      $('.sa-title').textContent = `Round ${g.round + 1} of ${init.rounds}`;
      $('.sa-role').textContent = roleText(g);
      { const list = steps(g), html = list.map(t => `<li>${esc(t)}</li>`).join(''), el = $('.sa-do'); if (el.dataset.k !== html) { el.dataset.k = html; el.innerHTML = html; el.classList.toggle('one', list.length === 1); } }
      for (const p of players) {
        const el = ui.querySelector(`.sa-chips [data-pid="${p.pid}"]`); if (!el) continue;
        el.querySelector('.sc').textContent = g.scores[p.pid];
        el.querySelector('.sa-tag').textContent = p.pid === g.arch ? 'Architect' : g.phase === 'build' ? `${g.blocks?.[p.pid] ?? 0} blocks${(g.done || []).includes(p.pid) ? ' ✔' : ''}` : '';
        el.classList.toggle('arch', p.pid === g.arch);
      }
      paintFeed();
      paintMarks($('.sa-board'), g.marks);
      if (role === 'arch') paintArch(); else if (role === 'build') paintBuild();
      if (g.phase === 'show') paintShow(g.shown);
      $('.sa-note').textContent = note(g);
    },
    dispose() {},
  };
}
