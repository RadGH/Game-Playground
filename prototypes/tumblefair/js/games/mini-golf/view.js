// MINI GOLF, as drawn: the hole's own shape in green felt with white-and-red rails, on a sandy plaza, so the outline
// of the letter, the number or the design is the first thing you see (owner: "the shape and path of the course is more
// important than graphics or props"). Island Green sits in a pond. The camera always shows the WHOLE hole — on a phone
// held upright too (Putt Party's close follow-cam is switched off here), so the path is readable at the start and
// between every shot. Balls, clubs, aim line, power meter and the in-hole HUD are the shared js/games/golf-view.js; this
// file swaps its pill, banner and scorecard for ones that know the round ("Hole 2 of 3", the whole card with totals).
import { createPuttView } from '../golf-view.js';
import { esc, floatText } from '../../client/gamehud.js';
import { scoreName } from '../golf-putt.js';

export function createView(ctx) {
  const { THREE, init, players, me } = ctx;
  const H0 = init.holes[0], R = init.round || { at: 0, of: 1, holes: [{ n: H0.n, name: H0.name, par: H0.par }], card: {} };
  const mats = [], geos = [];
  const feltMat = new THREE.MeshStandardMaterial({ color: '#35b04f', roughness: 0.95 });
  const waterMat = new THREE.MeshStandardMaterial({ color: '#3d8bd9', roughness: 0.25, metalness: 0.1 });
  mats.push(feltMat, waterMat);
  const mine = {};                                         // this hole's strokes, as they come in
  // Par Pete (alone only): a see-through ghost ball and his strokes in the pill
  const pete = { m: null, x: 0, z: 0, tx: 0, tz: 0, st: 0, strokes: 0, seen: false };
  const peteMat = new THREE.MeshStandardMaterial({ color: '#b48cff', transparent: true, opacity: 0.6, roughness: 0.4 }); mats.push(peteMat);
  const peteGeo = new THREE.SphereGeometry(0.13, 14, 10); geos.push(peteGeo);

  /** The felt in the hole's shape (an outer outline with its counters cut out); Island Green gets its pond. */
  function decorate(H, g) {
    const flat = g.children[0]; if (flat) flat.visible = false;                  // golf-view's rectangle of felt: the shape is the point here
    const tee = g.children[g.children.length - 1]; if (tee && H.teeYaw != null) { tee.rotation.y = H.teeYaw; tee.scale.x = 0.72; }       // the tee mat lies across the way the hole starts
    for (const A of H.areas || []) {
      const S = new THREE.Shape(A.outer.map(([x, z]) => new THREE.Vector2(x, -z)));
      for (const L of A.holes) S.holes.push(new THREE.Path(L.map(([x, z]) => new THREE.Vector2(x, -z))));
      const geo = new THREE.ShapeGeometry(S).rotateX(-Math.PI / 2); geos.push(geo);
      const m = new THREE.Mesh(geo, feltMat); m.position.y = 0.006; m.receiveShadow = true; g.add(m);
    }
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const A of H.areas || []) for (const [x, z] of A.outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    if (H.water && x0 < x1) {
      const geo = new THREE.PlaneGeometry(x1 - x0 + 2.4, z1 - z0 + 2.4).rotateX(-Math.PI / 2); geos.push(geo);
      const pond = new THREE.Mesh(geo, waterMat); pond.position.set((x0 + x1) / 2, -0.012, (z0 + z1) / 2); g.add(pond);
    }
  }

  // the whole hole is the shot: never let golf-view zoom a tall phone onto the ball (play.js already framed init.arena)
  const view = createPuttView({ ...ctx, camera: () => {} }, {
    aimDot: 0.12,                                           // M4: the aim line was dots too small to see with the whole hole on a phone
    theme: { field: '#d9c89c', felt: '#35b04f', rail: '#ffffff', railTop: '#e8434f', bumper: '#ff5a7a', bumperTop: '#ff8fb0', block: '#8e6b4a', ramp: '#7fd36b', tee: '#1f7a35', flag: '#ffd23f' },
    decorate,
    onState: g => {
      if (g.cpu) {
        const [x, z, st, strokes] = g.cpu; pete.tx = x; pete.tz = z; pete.st = st; pete.strokes = strokes;
        if (!pete.m) { pete.m = new THREE.Mesh(peteGeo, peteMat); pete.m.position.y = 0.13; ctx.group.add(pete.m); pete.tag = ctx.stage.tag(pete.m, { text: 'Par Pete', height: 0.5, cls: 'mg-pete' }); }
        if (!pete.seen) { pete.x = x; pete.z = z; pete.seen = true; }
      }
      const pill = ctx.ui.querySelector('.gp-pill'); if (!pill) return;
      const vs = g.cpu ? ` <i class="mg-vs">Pete ${g.cpu[3]}</i>` : '';
      pill.innerHTML = g.ph === 'end' ? `<b>Hole ${R.at + 1} of ${R.of} done</b>${vs}` : `<b>Hole ${R.at + 1}/${R.of}</b> <span>${esc(H0.name)}</span> <em>Par ${H0.par}</em>${vs} <span class="gp-hl${g.hl <= 10 && g.ph === 'play' ? ' hurry' : ''}">${g.ph === 'play' ? g.hl + 's' : '…'}</span>`;
    },
    onFrame: dt => {
      if (!pete.m) return;
      const k = Math.min(1, (dt || 0.016) * 14); pete.x += (pete.tx - pete.x) * k; pete.z += (pete.tz - pete.z) * k;
      pete.m.position.x = pete.x; pete.m.position.z = pete.z; pete.m.visible = pete.st < 2;
    },
    onEvent: ev => {
      if (ev.e === 'hole') { const b = ctx.ui.querySelector('.gp-banner'); if (b) b.innerHTML = `Hole ${R.at + 1}<small>${esc(H0.name)} · Par ${H0.par}</small>`; }
      if (ev.e === 'in' && mine[ev.pid] == null) mine[ev.pid] = ev.strokes;
      if (ev.e === 'cpuIn' && pete.m) floatText(ctx.stage, pete.x, 0.6, pete.z, ev.pickup ? 'Pete picks up' : `Pete: ${scoreName(ev.strokes, ev.par)}`, 'good');
      if (ev.e === 'holeEnd') Object.assign(mine, ev.cards);
      if (ev.e === 'holeEnd' || ev.e === 'end') drawCard();
    },
  });
  /** The round's scorecard: every hole of the round (nine to a row), this hole filled in as it finishes, totals. */
  const card = ctx.ui.querySelector('.gp-card');
  function drawCard(show = true) {
    if (!card) return;
    const rows = [], holes = R.holes, per = holes.length > 9 ? 9 : holes.length;
    const val = (pid, i) => (i < R.at ? R.card?.[pid]?.[i] : i === R.at ? mine[pid] : null) ?? null;
    const total = pid => holes.reduce((a, _, i) => a + (val(pid, i) ?? 0), 0);
    const parTo = i => holes.slice(0, i + 1).reduce((a, h) => a + h.par, 0);
    for (let s = 0; s < holes.length; s += per) {
      const part = holes.slice(s, s + per), idx = part.map((_, j) => s + j);
      rows.push(`<table><tr><th>Hole</th>${idx.map(i => `<th class="${i === R.at ? 'now' : ''}">${i + 1}<small>${holes[i].glyph ? esc(holes[i].glyph) : '#' + holes[i].n}</small></th>`).join('')}${s + per >= holes.length ? '<th>Total</th>' : ''}</tr>`
        + `<tr class="par"><td>Par</td>${idx.map(i => `<td>${holes[i].par}</td>`).join('')}${s + per >= holes.length ? `<td>${parTo(holes.length - 1)}</td>` : ''}</tr>`
        + players.map(p => `<tr${p.pid === me ? ' class="me"' : ''}><td><i class="gp-dot" data-shape="${p.shape}" style="--seat:${p.color}"></i>${esc(p.name)}</td>${idx.map(i => { const v = val(p.pid, i), par = holes[i].par; return `<td class="${v == null ? '' : v < par ? 'under' : v > par ? 'over' : 'par'}">${v ?? '–'}</td>`; }).join('')}${s + per >= holes.length ? `<td><b>${total(p.pid)}</b></td>` : ''}</tr>`).join('')
        + '</table>');
    }
    card.innerHTML = `<b class="gp-title">${R.at + 1 >= R.of && Object.keys(mine).length ? 'Final card' : 'Scorecard'} · ${esc(H0.name)}</b>${rows.join('')}`;
    card.classList.toggle('show', show);
  }
  drawCard(R.at > 0);                                      // from the second hole on: the card so far, until the putting starts

  const dispose = view.dispose;
  view.dispose = () => { dispose(); pete.tag?.remove(); for (const m of mats) m.dispose(); for (const g of geos) g.dispose(); };
  view.halloween = false;                                   // never dressed for a holiday (owner: no Halloween in Golf mode)
  return view;
}
