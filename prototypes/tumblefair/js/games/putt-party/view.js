// PUTT PARTY, as drawn: a bright fairground lawn with a cream-and-red railed mini-golf course on it — pink mushroom
// bumpers, a little red-roofed windmill whose blue and yellow paddles sweep the only gap, a green hump with white
// stripes — ringed by candy-striped poles with balloons tied on. Everything shared (balls, clubs, aim line, power
// meter, scorecard) is js/games/golf-view.js.
import { createPuttView } from '../golf-view.js';

export function createView(ctx) {
  const { THREE, group } = ctx;
  // candy-striped poles with a balloon each, round the outside of the course
  const spots = [];
  for (let i = 0; i < 9; i++) spots.push([-10 + i * 2.5, 6.3], [-10 + i * 2.5, -6.0]);
  spots.push([-10.6, 0], [10.6, 0]);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const poleMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), balMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 });
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 8), poleMat, spots.length);
  const balloons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 14, 10).scale(1, 1.2, 1), balMat, spots.length);
  const BAL = ['#ff5a7a', '#3d8bff', '#ffd23f', '#3ecf5a', '#f04fd8', '#ff9a3a'];
  spots.forEach(([x, z], i) => {
    m4.compose(v.set(x, 0.8, z), q.identity(), sc.set(1, 1, 1)); poles.setMatrixAt(i, m4); poles.setColorAt(i, col.set(i % 2 ? '#e8434f' : '#fff3e0'));
    m4.compose(v.set(x, 2.1, z), q.identity(), sc.setScalar(1)); balloons.setMatrixAt(i, m4); balloons.setColorAt(i, col.set(BAL[i % BAL.length]));
  });
  poles.castShadow = balloons.castShadow = true; group.add(poles, balloons);
  const view = createPuttView(ctx, {
    theme: { field: '#7cd36a', felt: '#2fa24a', rail: '#fff3e0', railTop: '#e8434f', bumper: '#ff5a7a', bumperTop: '#fff3e0', ramp: '#9ad86b', tee: '#1f7a35', flag: '#ffd23f' },
    onFrame: (dt, t) => {
      spots.forEach(([x, z], i) => { m4.compose(v.set(x + Math.sin(t * 1.3 + i) * 0.06, 2.1 + Math.sin(t * 1.7 + i * 0.9) * 0.08, z), q.identity(), sc.setScalar(1)); balloons.setMatrixAt(i, m4); });
      balloons.instanceMatrix.needsUpdate = true;
    },
  });
  const dispose = view.dispose;
  view.dispose = () => { dispose(); poleMat.dispose(); balMat.dispose(); };
  return view;
}
