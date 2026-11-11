// Getting around (M13): the prompt that appears beside exits, portals, waypoints, NPCs and your recall portal (tap it,
// press Space, or the pad's A), floating name plates over them, the PoE-style world map (M), and your recall portal's
// swirl in town. The sim decides (realm.travel / town acts); this only asks.
import * as THREE from 'three';
import { portalOpen } from '../rules/guide.js';
import { questKey } from '../sim/quests.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const REACH = 4.2;

export function createTravelUI({ view, content, labelRoot, send, getChar, getMe, getArea, onNpc, getDifficulty = () => 'normal' }) {
  const prompt = document.createElement('button'); prompt.className = 'prompt'; prompt.hidden = true; document.body.append(prompt);
  let current = null, plates = [], portalMesh = null, swirls = [];
  const swirlGeo = new THREE.CircleGeometry(1.25, 28), ringGeo = new THREE.TorusGeometry(1.4, 0.2, 6, 28);   // the stone portal_ring is r 1.4 at 1.6 m (js/client/prop-meshes.js)
  const openNow = id => { const ch = getChar(); return portalOpen(content, { ...ch, quests: ch?.[questKey(getDifficulty())] || {} }, id); };
  /** What opens a locked portal: the act step that names its portalAfter zone. */
  const opensAfter = id => { const after = content.acts?.[0]?.nodes?.find(n => n.id === id)?.portalAfter; return after ? (content.zones?.[after]?.name || content.acts[0].nodes.find(n => n.id === after)?.name || after) : null; };
  const zoneName = id => content.zones?.[id]?.name || content.acts?.[0]?.nodes?.find(n => n.id === id)?.name || id;
  prompt.addEventListener('pointerdown', e => { e.preventDefault(); use(); });
  /** Rebuild the plates and the recall swirl for a new area. */
  function enterArea(area) {
    for (const p of plates) p.el.remove(); plates = [];
    if (portalMesh) { view.scene.remove(portalMesh); portalMesh = null; }
    for (const sw of swirls) view.scene.remove(sw.g); swirls = [];
    for (const m of area.markers || []) {
      if (m.kind === 'portal') {
        // the swirl fills the stone ring itself (the marker is where you STAND, a few metres in front of it)
        let ring = null, bd = 6; for (const pr of area.props || area.zone?.props || []) { if (pr.k !== 'portal_ring') continue; const d = Math.hypot(pr.x - m.x, pr.z - m.z); if (d < bd) { bd = d; ring = pr; } }
        const at = ring || m, sc = ring?.s || 1, g = new THREE.Group();
        const disc = new THREE.Mesh(swirlGeo, new THREE.MeshBasicMaterial({ color: '#58b8ff', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
        const glow = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.85 }));
        disc.position.y = glow.position.y = 1.6; g.add(disc, glow); g.scale.setScalar(sc);
        g.position.set(at.x, view.groundY?.(at.x, at.z) || 0, at.z); g.rotation.y = ring ? (ring.yaw || 0) : Math.atan2(-m.x, -m.z);
        view.scene.add(g); swirls.push({ g, m, disc }); m.ringAt = { x: at.x, z: at.z };   // label and guide beam go on the ring
      }
      const text = m.kind === 'exit' || m.kind === 'entrance' ? `To ${zoneName(m.to)}` : m.kind === 'portal' ? `Portal: ${zoneName(m.to)}` : m.kind === 'waypoint' ? 'Waypoint' : null;          // (an NPC's name rides on its body's own tag)
      if (!text) continue;
      const el = document.createElement('div'); el.className = 'plate pl-' + m.kind; el.textContent = text; labelRoot.append(el);
      plates.push({ el, m });
    }
  }
  /** The markers you can use from where you stand (nearest first). */
  function nearby(me, area, ch) {
    const out = [];
    for (const m of area.markers || []) {
      if (!['exit', 'entrance', 'portal', 'waypoint', 'npc', 'stash', 'vendor'].includes(m.kind)) continue;
      const d = Math.hypot(m.x - me.x, m.z - me.z); if (d < REACH) out.push({ m, d });
    }
    if (ch?.recall && area.id === 'brightwater') { const s = recallSpot(area); const d = Math.hypot(s.x - me.x, s.z - me.z); if (d < REACH) out.push({ m: { kind: 'recall', x: s.x, z: s.z }, d }); }
    return out.sort((a, b) => a.d - b.d).map(x => x.m);
  }
  const recallSpot = area => { const m = (area.markers || []).find(x => x.kind === 'waypoint') || area.spawn; return { x: m.x - 3, z: m.z + 3 }; };
  function textFor(m, ch) {
    if (m.kind === 'exit' || m.kind === 'entrance') return `${m.kind === 'entrance' ? 'Enter' : 'Travel to'} ${zoneName(m.to)}`;
    if (m.kind === 'portal') { const open = openNow(m.to), a = opensAfter(m.to); return open ? `Step into the portal: ${zoneName(m.to)}` : `${zoneName(m.to)} — opens once you have been through ${a || 'the way before it'}`; }
    if (m.kind === 'waypoint') return 'Waypoint: open the map';
    if (m.kind === 'recall') return `Your portal back to ${zoneName(ch.recall.area)}`;
    if (m.kind === 'npc' || m.kind === 'stash' || m.kind === 'vendor') return `Talk to ${m.label || m.id}`;
    return '';
  }
  function isOpen(ch, id) {
    const order = content.acts?.[0]?.nodes?.filter(n => n.kind === 'zone').map(n => n.id) || [];
    return id === 'brightwater' || order[0] === id || (ch?.waypoints || []).includes(id) || (ch?.unlocked || []).includes(id);
  }
  function use() {
    const m = current; if (!m) return;
    const ch = getChar();
    if (m.kind === 'exit' || m.kind === 'entrance') send({ do: 'travel', via: 'exit', to: m.to });
    else if (m.kind === 'portal') send({ do: 'travel', via: 'portal', to: m.to });
    else if (m.kind === 'recall') send({ do: 'travel', via: 'recall' });
    else if (m.kind === 'waypoint') openMap(true);
    else onNpc(m.kind === 'npc' ? m.id : m.kind, m);
    void ch;
  }
  const v = new THREE.Vector3();
  function update(dt, now) {
    const me = getMe(), area = getArea(), ch = getChar(); if (!me || !area) { prompt.hidden = true; return; }
    const near = nearby(me, area, ch); current = near[0] || null;
    prompt.hidden = !current; if (current) prompt.textContent = textFor(current, ch) + (matchMedia('(pointer: coarse)').matches ? '' : '  (Space)');
    const W = view.renderer.domElement.clientWidth, H = view.renderer.domElement.clientHeight;
    for (const sw of swirls) { const open = openNow(sw.m.to); sw.g.visible = open; if (open) { sw.disc.rotation.z += dt * 1.5; sw.disc.material.opacity = 0.5 + Math.sin(now / 300) * 0.15; } }
    for (const p of plates) if (p.m.kind === 'portal') { const open = openNow(p.m.to); if (p.open !== open) { p.open = open; p.el.classList.toggle('locked', !open); p.el.classList.toggle('open', open); const a = opensAfter(p.m.to); p.el.textContent = open ? `✦ ${zoneName(p.m.to)}` : `🔒 ${zoneName(p.m.to)}${a ? ` · after ${a}` : ''}`; } }
    for (const p of plates) { const P = p.m.ringAt || p.m, y = (view.groundY?.(P.x, P.z) || 0) + (p.m.kind === 'npc' ? 2.4 : p.m.ringAt ? 3.6 : 2.8); v.set(P.x, y, P.z).project(view.camera); const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H; p.el.hidden = v.z > 1 || sx < -60 || sx > W + 60 || sy < -30 || sy > H + 30; p.el.style.transform = `translate(-50%, -100%) translate(${sx}px, ${sy}px)`; }
    // your recall portal in town
    const want = ch?.recall && area.id === 'brightwater';
    if (want && !portalMesh) { const s = recallSpot(area); portalMesh = new THREE.Group(); const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 8, 24), new THREE.MeshBasicMaterial({ color: '#6ab8ff' })); ring.position.y = 1.4; const disc = new THREE.Mesh(new THREE.CircleGeometry(1.0, 24), new THREE.MeshBasicMaterial({ color: '#3a7aff', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })); disc.position.y = 1.4; portalMesh.add(ring, disc); portalMesh.position.set(s.x, view.groundY?.(s.x, s.z) || 0, s.z); view.scene.add(portalMesh); }
    if (!want && portalMesh) { view.scene.remove(portalMesh); portalMesh = null; }
    if (portalMesh) { portalMesh.rotation.y += dt * 0.8; portalMesh.children[1].material.opacity = 0.45 + Math.sin(now / 250) * 0.15; }
  }
  // ---- the world map (M) ----------------------------------------------------------------------------------------------
  let mapEl = null;
  function openMap(atWaypoint = false) {
    closeMap();
    const act = content.acts?.[0]; if (!act) return;
    const ch = getChar(), area = getArea(), nodes = act.nodes, byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    const lines = []; for (const n of nodes) for (const l of n.links || []) if (byId[l] && n.id < l) lines.push(`<line x1="${n.x}" y1="${n.y}" x2="${byId[l].x}" y2="${byId[l].y}"/>`);
    mapEl = document.createElement('div'); mapEl.className = 'modal map-modal';
    mapEl.innerHTML = `<div class="panel map-panel"><h2>${esc(act.name || 'Act I')}</h2><p class="sub">${atWaypoint ? 'You stand at a waypoint: pick a place you have found to go there.' : 'Waypoints you have found are bright. Walk to a waypoint to travel.'}</p>
      <div class="map"><svg viewBox="0 0 100 100" preserveAspectRatio="none">${lines.join('')}</svg>${nodes.map(n => {
        const found = n.id === 'brightwater' || (ch?.waypoints || []).includes(n.id), open = isOpen(ch, n.id), here = area?.id === n.id, built = !!content.zones?.[n.id];
        return `<button class="mnode k-${n.kind} ${found ? 'found' : ''} ${open ? 'open' : ''} ${here ? 'here' : ''} ${built ? '' : 'unbuilt'}" style="left:${n.x}%;top:${n.y}%" data-id="${n.id}" ${atWaypoint && found && built && !here ? '' : 'disabled'}>
          <b>${esc(n.name)}</b><small>${n.kind === 'town' ? 'Town' : `Levels ${n.levels?.[0]}-${n.levels?.[1]}`}${here ? ' · you are here' : ''}${built ? '' : ' · not built yet'}</small></button>`; }).join('')}</div>
      <div class="btns"><button data-close class="primary">Close</button></div></div>`;
    mapEl.addEventListener('click', e => { const id = e.target.closest('[data-id]')?.dataset.id; if (id && !e.target.closest('[data-id]').disabled) { send({ do: 'travel', via: 'waypoint', to: id }); closeMap(); } else if (e.target === mapEl || e.target.closest('[data-close]')) closeMap(); });
    document.body.append(mapEl);
  }
  function closeMap() { mapEl?.remove(); mapEl = null; }
  /** A usable marker near a ground point (click to walk there and use it). */
  function markerNear(x, z, r) { const a = getArea(); let best = null, bd = r; for (const m of a?.markers || []) { if (!['exit', 'entrance', 'portal', 'waypoint', 'npc', 'stash', 'vendor'].includes(m.kind)) continue; const d = Math.hypot(m.x - x, m.z - z); if (d < bd) { bd = d; best = m; } } return best; }
  return { markerNear, enterArea, update, use, openMap, closeMap, get current() { return current; }, get mapOpen() { return !!mapEl; } };
}
