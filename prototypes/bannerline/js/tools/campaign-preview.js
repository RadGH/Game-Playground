// campaign.html: play a campaign mission on a flat 2D view of your field (no 3D) — a preview for the
// owner and the target of tests/campaign.spec.js until the 3D game reaches the campaign through
// main.js (stream B's hook, docs/requests.md). Same sim, same script, same objective overlay and debrief.
//   ?speed=8 runs the sim 8x; ?reset=1 clears saved progress.

import { loadData } from '../sim/data.js';
import { createSim } from '../sim/sim.js';
import { TICK_MS } from '../sim/sim.js';
import * as Q from '../sim/query.js';
import { loadCampaign, campaignProgress, campaignSession, createCampaignScreen, createCampaignOverlay, showDebrief } from '../ui/campaign.js';
import { installTooltips } from '../../../../shared/tooltip.js';

const params = new URLSearchParams(location.search);
const speed = Number(params.get('speed')) || 1;
const $ = id => document.getElementById(id);
installTooltips?.();
const data = await loadData(name => fetch(`data/${name}`).then(r => r.text()));
const campaign = await loadCampaign();
const progress = campaignProgress();
if (params.get('reset')) progress.clear();

let screen = null, match = null;
const api = { campaign, progress, get match() { return match; }, issue: c => match && match.queue.push(c), ok: true };
window.cmp = api;

function showMap() {
  if (match) { match.stop(); match = null; }
  $('screen-play').hidden = true; $('screen-campaign').hidden = false;
  if (!screen) screen = createCampaignScreen({ screen: $('screen-campaign'), campaign, progress, onPlay: play, onBack: () => { location.href = './'; } });
  else screen.show();
}

function nextOf(m) {
  const c = campaign.index.chapters.find(x => x.id === m.chapter);
  const i = c.missions.indexOf(m.id);
  return i >= 0 && i + 1 < c.missions.length ? campaign.missions[c.missions[i + 1]] : null;
}

function play(mission) {
  if (screen) screen.hide();
  $('screen-campaign').hidden = true; $('screen-play').hidden = false; $('debrief').hidden = true;
  const { config } = campaignSession(mission);
  const sim = createSim({ ...config, seed: Number(params.get('seed')) || ((Math.random() * 1e9) >>> 0) }, data);
  const me = mission.player ?? 0;
  const overlay = createCampaignOverlay({ root: $('screen-play') });
  const canvas = $('field'), g = canvas.getContext('2d');
  const queue = [];
  let wantBuy = false;
  let raf = 0, acc = 0, last = performance.now(), done = false;
  const field = sim.map.fields[sim.state.teams[sim.state.players[me].team].field];
  const view = () => {
    const w = canvas.clientWidth, hgt = canvas.clientHeight;
    const s = Math.min(w / (field.x1 - field.x0 + 8), hgt / (field.z1 - field.z0 + 8));
    return { s, ox: w / 2 - field.cx * s, oz: hgt / 2 - ((field.z0 + field.z1) / 2) * s };
  };
  canvas.oncontextmenu = e => e.preventDefault();
  canvas.onmousedown = e => {
    const v = view(), r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left - v.ox) / v.s, z = (e.clientY - r.top - v.oz) / v.s;
    queue.push({ p: me, type: e.button === 2 ? 'move' : 'amove', x, z });
  };
  // the bottom bar: hire buttons (the Barracks), skills, and the town actions the missions teach
  const bar = $('bar');
  function buildBar() {
    const ros = Q.roster(sim.state, sim.data, me);
    bar.innerHTML = `<div class="pv-stat"><span>Gold</span><b id="pv-gold">0</b><span id="pv-inc"></span></div><div class="pv-sep"></div>`
      + ros.map(r => `<button data-send="${r.unit}" data-tip="${r.name}: ${r.cost} gold, +${r.income} income">${'<b>' + r.name + '</b>'}<span>${r.cost} g</span></button>`).join('')
      + `<div class="pv-sep"></div>` + ['Q', 'W', 'E', 'D', 'R'].map(k => `<button data-cast="${k}"><b>${k}</b><span>skill</span></button>`).join('')
      + `<div class="pv-sep"></div><button data-act="outfit"><b>Outfitter</b><span>buy</span></button><button data-act="drill"><b>Drill Yard</b><span>level</span></button><button data-act="power"><b>Sanctum</b><span>power</span></button><button data-act="toll"><b>Toll</b><span>stun</span></button>`;
  }
  buildBar();
  bar.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const hero = sim.state.ents.find(x => x.id === sim.state.players[me].heroEnt);
    if (b.dataset.send) queue.push({ p: me, type: 'send', unit: b.dataset.send });
    else if (b.dataset.cast) {
      const sk = sim.state.players[me].skills.find(s => s.slot === b.dataset.cast);
      if (sk && sk.rank === 0) queue.push({ p: me, type: 'learn', slot: sk.slot });
      else queue.push({ p: me, type: 'cast', slot: b.dataset.cast, x: hero.x, z: hero.z - 4 });
    } else if (b.dataset.act === 'outfit') {
      // walk to the Outfitter; the cheapest item is bought on arrival (frame() checks wantBuy)
      const team = sim.state.players[me].team;
      const shop = Q.buildingsInfo(sim.state, sim.data).find(x => x.role === 'shop' && x.team === team) || field.armory;
      queue.push({ p: me, type: 'move', x: shop.x + 3, z: shop.z }); wantBuy = true;
    } else if (b.dataset.act === 'drill') {
      const r = Q.upgradesInfo(sim.state, sim.data, me).rows.find(x => x.canBuy); if (r) queue.push({ p: me, type: 'upgradeUnit', id: r.id });
    } else if (b.dataset.act === 'power') {
      const r = Q.powersInfo(sim.state, sim.data, me).rows.find(x => x.canBuy && x.kind === 'defensive') || Q.powersInfo(sim.state, sim.data, me).rows.find(x => x.canBuy && x.kind === 'neutral');
      if (r) queue.push({ p: me, type: 'power', id: r.id, x: field.cx, z: 90 });
    } else if (b.dataset.act === 'toll') queue.push({ p: me, type: 'toll' });
  };
  const keyMap = e => { if (e.key === 'b' || e.key === 'B') queue.push({ p: me, type: 'send', unit: Q.roster(sim.state, sim.data, me)[0].unit }); };
  addEventListener('keydown', keyMap);

  function draw() {
    const w = canvas.width = canvas.clientWidth * devicePixelRatio, hh = canvas.height = canvas.clientHeight * devicePixelRatio;
    g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    const v = view();
    g.fillStyle = '#18301f'; g.fillRect(v.ox + field.x0 * v.s, v.oz + field.z0 * v.s, (field.x1 - field.x0) * v.s, (field.z1 - field.z0) * v.s);
    g.fillStyle = 'rgba(70,120,170,.35)'; g.fillRect(v.ox + field.ford.x0 * v.s, v.oz + field.ford.z0 * v.s, (field.ford.x1 - field.ford.x0) * v.s, (field.ford.z1 - field.ford.z0) * v.s);
    for (const bd of Q.buildingsInfo(sim.state, sim.data)) if (bd.field === field.id) { g.fillStyle = '#6b5a3c'; g.fillRect(v.ox + (bd.x - bd.size[0] / 2) * v.s, v.oz + (bd.z - bd.size[1] / 2) * v.s, bd.size[0] * v.s, bd.size[1] * v.s); g.fillStyle = '#d8c79e'; g.font = '11px sans-serif'; g.fillText(bd.name, v.ox + (bd.x - bd.size[0] / 2) * v.s, v.oz + (bd.z - bd.size[1] / 2) * v.s - 3); }
    g.fillStyle = '#55493a'; g.fillRect(v.ox + (field.keep.x - field.keep.w / 2) * v.s, v.oz + (field.keep.z - field.keep.d / 2) * v.s, field.keep.w * v.s, field.keep.d * v.s);
    for (const e of sim.state.ents) {
      if (e.field !== field.id || !e.alive) continue;
      g.fillStyle = e.kind === 'hero' ? '#f2c45a' : e.team === sim.state.players[me].team ? '#5fa8ff' : e.kind === 'tide' ? '#999' : '#e0503e';
      g.beginPath(); g.arc(v.ox + e.x * v.s, v.oz + e.z * v.s, Math.max(2.5, e.r * v.s), 0, 6.283); g.fill();
    }
    void w; void hh;
  }

  function frame(now) {
    const dt = Math.min(250, now - last); last = now;
    acc += dt * speed;
    if (wantBuy) {
      const shop = Q.shopInfo(sim.state, sim.data, me);
      if (shop.atShop) {
        wantBuy = false;
        const items = shop.tabs.flatMap(t => t.items).filter(x => x.canBuy);
        items.sort((x, y) => (x.cost ?? x.price ?? 0) - (y.cost ?? y.price ?? 0));
        if (items[0]) queue.push({ p: me, type: 'buy', id: items[0].id });
      }
    }
    let n = 0;
    while (acc >= TICK_MS && n < 200 && !sim.over) { sim.step(queue.splice(0)); sim.drainEvents(); acc -= TICK_MS; n++; }
    draw();
    overlay.update(sim);
    const p = sim.state.players[me];
    const gold = document.getElementById('pv-gold'); if (gold) { gold.textContent = Math.floor(p.gold); document.getElementById('pv-inc').textContent = `income ${Math.floor(p.income)}`; }
    if (sim.over && !done) {
      done = true;
      const card = $('debrief'); card.hidden = false;
      showDebrief({ card, sim, mission, progress, next: nextOf(mission), onNext: m => play(m), onRetry: m => play(m), onMap: showMap });
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  match = { sim, mission, queue, stop() { cancelAnimationFrame(raf); overlay.destroy(); removeEventListener('keydown', keyMap); } };
}

if (params.get('mission') && campaign.missions[params.get('mission')]) play(campaign.missions[params.get('mission')]);
else showMap();
