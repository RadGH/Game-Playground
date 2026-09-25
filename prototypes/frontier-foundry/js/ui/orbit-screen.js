// Orbit: the planet in 3D with whatever you have put up there, the rocket, and the next world.
//
// The 3D is the shared space-models kit (assets/js/space-models.js) with the universe's own planet
// texture painted from the same worldgen world the surface map is cut out of - so the blue patch you
// see from orbit really is the sea you cannot build on.

import { $, el, fill, num, clamp, countdown } from './dom.js';
import { icon, rawIcon } from './icons.js';
import { openDialog, closeDialog } from './hud.js';
import { createSpaceScene, createPlanet, createSatellite, createRocket, createProbe, createStation, createSpaceBackdrop } from '../../../../assets/js/space-models.js';
import { planetTexture } from '../../../../universe/js/texture.js';

/** Our ten archetypes mapped back onto the universe's, so its texture painter knows what to draw. */
const TO_UNIVERSE = {
  temperate: 'living', arid: 'desert', frozen: 'ice', volcanic: 'lava', toxic: 'toxic',
  verdant: 'jungle', barren: 'barren', shattered: 'crystal', oceanic: 'ocean', gas_shrouded: 'gasGiant',
};

export class OrbitScreen {
  constructor({ game, sound, onLand, onMessage }) {
    this.game = game;
    this.sound = sound;
    this.onLand = onLand;
    this.onMessage = onMessage || (() => {});
    this.scene = null;
    this.target = null;
    this.built = false;
  }

  setGame(game) { this.game = game; this.built = false; this.target = null; this._clearScene(); }

  _clearScene() {
    if (this.planetObj) { this.scene?.scene.remove(this.planetObj.group); this.planetObj.dispose?.(); this.planetObj = null; }
    for (const s of this.sats || []) { this.scene?.scene.remove(s.pivot); s.obj.dispose?.(); }
    this.sats = [];
  }

  render() {
    this._ensureScene();
    this._status();
    this._rocket();
    this._destinations();
  }

  /** Build the 3D once, then keep it and just add and remove what is in orbit. */
  _ensureScene() {
    const host = $('orbit-stage');
    if (!this.scene) {
      try {
        this.scene = createSpaceScene(host, { distance: 3.6, ambient: 0.3 });
        this.scene.addTicker((dt, t) => this._tick(dt, t));
        const back = createSpaceBackdrop({ radius: 300 });
        this.scene.scene.add(back.group || back);
      } catch (err) {
        this.scene = null;
        host.innerHTML = '<p class="tiny warn" style="padding:20px">This browser cannot open a 3D view, so orbit is text only. Everything on the right still works.</p>';
        return;
      }
    }
    if (!this.built) this._buildPlanet();
    this._syncOrbiters();
  }

  _buildPlanet() {
    const g = this.game;
    this._clearScene();
    const arch = TO_UNIVERSE[g.planet.archetype] || 'barren';
    const fake = {
      archetype: arch, seed: g.planet.seed ?? 1, radius: 1,
      atmosphere: { density: g.planet.archetype === 'barren' ? 0.02 : 0.7, color: atmoColour(g.planet.archetype), type: 'thin' },
      life: g.planet.archetype === 'temperate' || g.planet.archetype === 'verdant' ? 0.6 : 0,
      habitability: 0.5, moons: [], rings: null,
    };
    let texture = null;
    try { texture = planetTexture(fake, g.world, { size: 1024, lights: false }); } catch { texture = null; }
    try {
      this.planetObj = createPlanet(fake, { radius: 1, texture: texture || undefined, moons: false, detail: 48 });
      this.scene.scene.add(this.planetObj.group);
      this.scene.setSpin?.(0.05);
    } catch { this.planetObj = null; }
    this.built = true;
    $('orbit-caption').textContent = `${g.planet.name} — ${g.planet.archetype}, gravity ${g.planet.gravity}g, a day is ${Math.round(g.planet.dayLength / 60)} minutes. Drag to turn it.`;
  }

  /** One little model per satellite, plus the rocket on the pad when it is stacked. */
  _syncOrbiters() {
    if (!this.scene) return;
    const g = this.game;
    const want = g.space.satellites;
    this.sats ||= [];
    while (this.sats.length < want) {
      const obj = createSatellite();
      const pivot = new this.scene.THREE.Group();
      obj.group.position.set(1.55 + this.sats.length * 0.16, 0, 0);
      obj.group.scale.setScalar(0.4);
      pivot.rotation.z = (this.sats.length * 0.7) % 1.4 - 0.7;
      pivot.add(obj.group);
      this.scene.scene.add(pivot);
      this.sats.push({ obj, pivot, speed: 0.28 + this.sats.length * 0.05 });
    }
    while (this.sats.length > want) { const s = this.sats.pop(); this.scene.scene.remove(s.pivot); s.obj.dispose?.(); }

    const ready = g.space.rocketReady;
    if (ready && !this.rocketObj) {
      this.rocketObj = createRocket();
      this.rocketObj.group.scale.setScalar(0.32);
      this.rocketObj.group.position.set(0, 1.35, 0);
      this.scene.scene.add(this.rocketObj.group);
    } else if (!ready && this.rocketObj && !this.launching) {
      this.scene.scene.remove(this.rocketObj.group); this.rocketObj.dispose?.(); this.rocketObj = null;
    }

    if (g.space.station && !this.stationObj) {
      try {
        this.stationObj = createStation();
        this.stationObj.group.scale.setScalar(0.22);
        this.stationObj.group.position.set(-1.7, 0.5, 0.4);
        this.scene.scene.add(this.stationObj.group);
      } catch { this.stationObj = null; }
    }
  }

  _tick(dt, t) {
    for (const s of this.sats || []) { s.pivot.rotation.y += s.speed * dt; s.obj.update?.(dt, t); }
    this.rocketObj?.update?.(dt, t);
    this.stationObj?.update?.(dt, t);
    this.planetObj?.update?.(dt, t);
    if (this.launching) {
      this.launching.t += dt;
      const k = this.launching.t;
      if (this.rocketObj) {
        this.rocketObj.group.position.y = 1.35 + k * k * 1.6;
        this.rocketObj.group.position.x = Math.sin(k * 0.6) * k * 0.3;
        this.rocketObj.group.scale.setScalar(Math.max(0.04, 0.32 - k * 0.05));
      }
      if (k > 2.6) { const done = this.launching.done; this.launching = null; done?.(); }
    }
  }

  // ------------------------------------------------------------------ the right-hand column
  _status() {
    const g = this.game;
    const st = g.stationStatus();
    const rows = [
      ['Satellites up', g.space.satellites, 'A satellite reveals the whole local map and every patch on it, and starts the orbital packs.'],
      ['Probes in flight', g.space.probes.length, 'A probe reports what another world is made of, 15 minutes after it leaves.'],
      ['Worlds surveyed', g.space.surveyed.length, ''],
      ['Station modules', `${st.modules} / 6`, 'Six modules and an orbital lift make the station. The station plus three beacons wins the run.'],
      ['Beacons lit', `${g.space.beacons.length} / ${g.beaconsToWin}`, 'A finished Frontier Beacon claims a planet.'],
    ];
    const box = el('div');
    for (const [k, v, tip] of rows) box.append(el('div.stat-row', tip ? { tip } : null, el('span', { text: k }), el('b', { text: String(v) })));

    const actions = el('div.sp-actions');
    const satCheck = canDo(g, 'satellite');
    actions.append(el('button.small' + (satCheck.ok ? '.primary' : ''), {
      text: 'Launch satellite', disabled: !satCheck.ok, tip: satCheck.ok ? 'Reveals the whole map at once.' : satCheck.reason,
      onClick: () => { const o = g.launchSatellite(); if (o.ok) { this.sound?.launch(); this.built = false; } else this.onMessage(o.reason, true); this.render(); },
    }));
    if (st.hasLift) actions.append(el('button.small', {
      text: 'Lift a station module',
      onClick: () => { const o = g.liftStationModule(); this.onMessage(o.ok ? 'Module away.' : o.reason, !o.ok); this.render(); },
    }));
    box.append(actions);
    fill($('orbit-status'), box);
  }

  _rocket() {
    const g = this.game;
    const st = g.rocketStatus();
    const box = el('div');
    box.append(el('div.stat-row', null, el('span', { text: 'Sections' }), el('b', { class: st.parts >= st.needed ? 'good' : '', text: `${Math.floor(st.parts)} / ${st.needed}` })));
    box.append(el('div.stat-row', null, el('span', { text: 'Rocket fuel' }), el('b', { class: st.fuel >= 40 ? 'good' : '', text: `${Math.floor(st.fuel)} / 40` })));
    box.append(el('div.stat-row', null, el('span', { text: 'Oxidizer' }), el('b', { class: st.oxidizer >= 30 ? 'good' : '', text: `${Math.floor(st.oxidizer)} / 30` })));
    box.append(el('div.stat-row', null, el('span', { text: 'Launch pad' }), el('b', { text: st.hasPad ? 'built' : 'none' })));
    const archive = g.structures.some(s => s.state === 'done' && s.def.carryResearch);
    box.append(el('p.tiny' + (archive ? '.good' : '.warn'), {
      text: archive
        ? 'An archive is standing, so every research node comes with you.'
        : 'No archive. Leaving now means starting the next world with the landing kit only — that is the real cost of the rocket.',
    }));
    const actions = el('div.sp-actions');
    if (!st.ready) {
      actions.append(el('button.small.primary', {
        text: 'Assemble', disabled: !(st.hasPad && st.parts >= st.needed && st.fuel >= 40 && st.oxidizer >= 30),
        tip: 'Stack the sections on the pad. After this it can leave whenever you say.',
        onClick: () => { const o = g.assembleRocket(); this.onMessage(o.ok ? 'The rocket is stacked.' : o.reason, !o.ok); this.render(); },
      }));
    } else {
      actions.append(el('button.small.primary', { text: 'Load the hold and go', onClick: () => this.openLaunch() }));
    }
    box.append(actions);
    fill($('rocket-status'), box);
  }

  _destinations() {
    const g = this.game;
    const list = g.planets.list().filter(p => p.id !== g.planet.id);
    fill($('destination-list'), list.length ? list.map(p => {
      const known = g.space.surveyed.includes(p.id);
      const inFlight = g.space.probes.some(x => x.planetId === p.id);
      const b = el('button.dest' + (this.target === p.id ? '.on' : ''));
      b.append(el('b', { text: p.name }));
      b.append(el('span.tiny', { text: known ? `${p.archetype} · ${(p.rareElements || []).map(r => g.data.resource[r]?.name || r).join(', ') || 'no rare elements'} · hazards: ${p.hazards.join(', ') || 'none'}` : inFlight ? 'probe on the way' : 'unsurveyed — fire a probe to see what is there' }));
      b.append(el('span.tiny', { text: `tier ${p.tier ?? 1}` }));
      b.addEventListener('click', () => { this.target = p.id; this.sound?.ui('click'); this._destinations(); });
      const probe = el('button.small', {
        text: 'Probe', disabled: known || inFlight,
        onClick: ev => { ev.stopPropagation(); const o = g.launchProbe(p.id); this.onMessage(o.ok ? `Probe away — ${countdown(900)} to arrival.` : o.reason, !o.ok); this.render(); },
      });
      b.append(probe);
      return b;
    }) : el('p.tiny', { text: 'No other worlds in this system.' }));
  }

  // ------------------------------------------------------------------ launching
  openLaunch() {
    const g = this.game;
    if (!this.target) { this.onMessage('Pick a destination first.', true); return; }
    const inv = g.inventory();
    const cargo = {};
    const body = el('div.dlg-body');
    const target = g.planets.get(this.target);
    body.append(el('h3.ruled', { text: 'Load the hold for ' + target.name }));
    body.append(el('p.tiny', { text: 'Whatever is in the hold lands with you. Everything else stays here for good. Crew become the builders on the next world.' }));

    const crewInput = el('input', { type: 'number', value: String(Math.min(6, g.units.filter(u => u.alive).length || 4)), min: '1', max: '12' });
    body.append(el('label.field.inline', null, el('span', { text: 'Crew' }), crewInput));

    const rows = el('div');
    const candidates = Object.entries(inv).filter(([, n]) => n >= 1).sort((a, b) => b[1] - a[1]).slice(0, 26);
    for (const [r, n] of candidates) {
      const def = g.data.resource[r];
      const input = el('input', { type: 'number', value: '0', min: '0', max: String(Math.floor(n)) });
      input.addEventListener('input', () => { cargo[r] = clamp(+input.value || 0, 0, Math.floor(n)); });
      rows.append(el('div.cargo-row', null, icon('res', def, { size: 18 }), el('span', { text: def?.name || r }), input, el('span.tiny', { text: 'of ' + Math.floor(n) })));
    }
    body.append(el('h4.ruled', { text: 'Cargo' }), rows);

    const go = el('button.primary', { text: 'Launch' });
    go.addEventListener('click', () => {
      const out = g.launchRocket({ to: this.target, cargo, crew: clamp(+crewInput.value || 4, 1, 12) });
      if (!out.ok) { this.onMessage(out.reason, true); return; }
      closeDialog();
      this.sound?.launch();
      this.launching = { t: 0, done: () => this.onLand?.(out.transfer) };
      this.onMessage(`Away to ${target.name}.`);
    });
    const dlg = openDialog(body);
    dlg.querySelector('.dlg-actions').prepend(go);
  }
}

function canDo(g, what) {
  if (what === 'satellite') {
    if (!g.structures.some(s => s.state === 'done' && (s.type === 'satellite_launcher' || s.type === 'launch_pad'))) return { ok: false, reason: 'No satellite launcher or launch pad built.' };
    if (g.available('satellite') < 1) return { ok: false, reason: 'No satellite has been assembled yet.' };
    return { ok: true };
  }
  return { ok: true };
}

const atmoColour = arch => ({
  temperate: '#8fc0ff', verdant: '#9fe0b0', arid: '#e8c890', frozen: '#cfe6f5', volcanic: '#ff9a60',
  toxic: '#c8e070', oceanic: '#7fc0e8', barren: '#8090a0', shattered: '#b0a0ff', gas_shrouded: '#c0a878',
}[arch] || '#8fc0ff');
