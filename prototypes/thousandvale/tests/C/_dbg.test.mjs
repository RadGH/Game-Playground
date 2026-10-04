import { test, mock } from 'node:test';
import { pair, frame, diff, basic } from './parity-kit.mjs';
test('dbg', async () => {
  mock.timers.enable({ apis: ['setTimeout'], now: 0 });
  const s = await pair({ classId: process.env.CLS || 'druid', seed: 4 });
  const logs = { F: [], T: [] };
  const wrap = (rpg, tag, who) => { const o = rpg.strike.bind(rpg); rpg.strike = (a, d, r, opts = {}) => { const res = o(a, d, r, opts); logs[tag].push(`${who()} ${a.name?.slice(0,6)}>${(d.name||'').slice(0,6)} m${(opts.multiplier??1).toFixed(3)} el ${opts.element ?? 'physical'} sk ${opts.skill} = ${res.amount}${res.crit?'c':''}`); return res; }; };
  let fr = 'setup';
  wrap(s.F.rpg, 'F', () => fr); wrap(s.room.engine.rpg, 'T', () => fr);
  const upto = +(process.env.SLOT || 0);
  for (let slot = 0; slot <= upto; slot++) {
    s.fp.mp = s.fp.maxMp; s.tp.mp = s.tp.maxMp;
    fr = `basic${slot}`; basic(s, slot);
    fr = `cast${slot}`; s.fs.cast(slot, { x: 0, z: 5 }); s.room.run(() => s.room.combat.cast(s.tp, slot, { aim: { x: 0, z: 5 } }));
    for (let k = 0; k < 50; k++) { fr = `s${slot}f${k}`; frame(s); if (process.env.TRACE && slot >= 4) { const f=s.fmobs[0], t=s.tmobs[0]; console.log('T', fr, f.state, (f.statuses?.fear?.remaining??-1).toFixed(2), f.facing.toFixed(2), f.x.toFixed(3), f.z.toFixed(3), '|', t.state, (t.statuses?.fear?.remaining??-1).toFixed(2), t.facing.toFixed(2), t.x.toFixed(3), t.z.toFixed(3)); } const d = diff(s); if (d) { console.log('DIFF', fr, d, JSON.stringify(s.fmobs.map(m=>[+m.x.toFixed(3),+m.z.toFixed(3),!!m.push])), JSON.stringify(s.tmobs.map(m=>[+m.x.toFixed(3),+m.z.toFixed(3),!!m.push])), s.control.x, s.control.z, s.tp.x, s.tp.z); console.log('P', Object.keys(s.fp.statuses||{}), Object.keys(s.tp.statuses||{}), JSON.stringify(s.fmobs.map(m=>[m.tauntFor,m.tauntBy?.x,m.tauntBy?.z,m.threatOn])), JSON.stringify(s.tmobs.map(m=>[m.tauntFor,m.tauntBy,m.targetId]))); for (const [n,L] of [['F',s.fmobs],['T',s.tmobs]]) console.log(n, JSON.stringify(L.map(m=>[m.state, m.facing?.toFixed(3), m.speed, Object.entries(m.statuses||{}).map(([k,v])=>k+':'+(v.remaining??0).toFixed(2)+':'+(v.slow||0))]))); slot = 99; break; } }
    s.control.teleport(0, 0); s.tp.x = 0; s.tp.z = 0;
  }
  const n = Math.max(logs.F.length, logs.T.length);
  for (let i = 0; i < n; i++) if (logs.F[i] !== logs.T[i]) { for (let j = Math.max(0, i - 2); j < Math.min(n, i + 6); j++) console.log(j, 'F:', logs.F[j], '\n   T:', logs.T[j]); break; }
  mock.timers.reset();
});
