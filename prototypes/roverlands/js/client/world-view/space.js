// Space backdrop for the black-sky worlds (the Moon, Lantern Station): stars all round, the home planet with a lit and a
// dark side and a thin blue rim of air, and a hard white sun disc. Three draw calls. Everything sits in one group that
// follows the camera and is scaled to just inside its far plane, so it is always "at infinity" whatever the camera.
//
//   const sp = createSpaceBackdrop(THREE, world.space, { stars: 2400 });
//   scene.add(sp.group);  per frame: sp.update(camera);   sp.sunDir (THREE.Vector3)   sp.dispose()
//
// world.space = { sunDir: [x,y,z], planet: { dir: [x,y,z], size (radius over distance), colour } } (moongen.js /
// stationgen.js). Used by world-view/index.js (the Moon), world-view/station.js and simple-view.js.

export function createSpaceBackdrop(THREE, space = {}, { stars = 2400 } = {}) {
  const group = new THREE.Group();
  group.name = 'space';
  const sunDir = new THREE.Vector3(...(space.sunDir || [0.6, 0.5, 0.6])).normalize();

  // --- stars: a fixed seeded sphere of points, a few bright ones and many faint ------------------------------------
  let s = 9173;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pos = new Float32Array(stars * 3), col = new Float32Array(stars * 3);
  for (let i = 0; i < stars; i++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos[i * 3] = Math.cos(th) * r; pos[i * 3 + 1] = u; pos[i * 3 + 2] = Math.sin(th) * r;
    const b = 0.25 + Math.pow(rnd(), 4) * 1.6, warm = rnd();
    col[i * 3] = b * (warm > 0.8 ? 1.0 : 0.86); col[i * 3 + 1] = b * 0.92; col[i * 3 + 2] = b * (warm < 0.25 ? 1.0 : 0.88);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const starMat = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false });
  const starPts = new THREE.Points(sg, starMat);
  starPts.renderOrder = -20; starPts.frustumCulled = false;
  group.add(starPts);

  // --- the planet: a lit sphere (day / night from the sun direction) and an air rim ----------------------------------
  const P = space.planet || { dir: [0, 0.3, -1], size: 0.06 };
  const pDir = new THREE.Vector3(...P.dir).normalize();
  const tex = planetTexture(THREE, P.colour || '#4f8fd0', P.size > 0.3 ? 2 : 1);   // a planet that fills the view gets a sharper map
  const planetMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uSun: { value: sunDir } },
    transparent: true, depthWrite: false, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec2 vUv; varying vec3 vView;
      void main() {
        vUv = uv; vN = normalize( mat3( modelMatrix ) * normal );
        vec4 wp = modelMatrix * vec4( position, 1.0 );
        vView = normalize( cameraPosition - wp.xyz );
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform vec3 uSun;
      varying vec3 vN; varying vec2 vUv; varying vec3 vView;
      void main() {
        vec3 c = texture2D( map, vUv ).rgb;
        float d = dot( normalize( vN ), normalize( uSun ) );
        float day = smoothstep( -0.08, 0.25, d );
        vec3 night = c * 0.02 + vec3( 0.9, 0.7, 0.35 ) * step( 0.82, c.r ) * 0.0;
        vec3 col = mix( night, c * ( 0.25 + 1.15 * max( d, 0.0 ) ), day );
        float rim = pow( 1.0 - max( dot( normalize( vN ), vView ), 0.0 ), 3.0 );
        col += vec3( 0.35, 0.6, 1.0 ) * rim * ( 0.15 + 0.85 * day );
        gl_FragColor = vec4( col, 1.0 );
      }`,
  });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), planetMat);
  planet.renderOrder = -18; planet.frustumCulled = false;
  const air = new THREE.Mesh(new THREE.SphereGeometry(1.035, 48, 24), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunDir } }, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vView;
      void main() { vN = normalize( mat3( modelMatrix ) * normal ); vec4 wp = modelMatrix * vec4( position, 1.0 ); vView = normalize( cameraPosition - wp.xyz ); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSun; varying vec3 vN; varying vec3 vView;
      void main() {
        float f = pow( 1.0 - abs( dot( normalize( vN ), vView ) ), 4.0 );
        float day = smoothstep( -0.3, 0.3, dot( normalize( vN ), normalize( uSun ) ) );
        gl_FragColor = vec4( vec3( 0.3, 0.55, 1.0 ) * f * day * 1.6, 1.0 );
      }`,
  }));
  air.renderOrder = -17; air.frustumCulled = false;
  const pg = new THREE.Group();
  pg.add(planet, air);
  pg.position.copy(pDir).multiplyScalar(0.8);
  pg.scale.setScalar(0.8 * P.size);
  pg.rotation.set(...(P.tilt || [0.35, 1.1, 0.2]));   // which face of it you see (the station looks down on the tropics, not a pole)
  group.add(pg);

  // --- the sun: a white disc with a soft glow (sprite) ----------------------------------------------------------------
  const sunTex = discTexture(THREE);
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, color: 0xffffff, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  sun.position.copy(sunDir).multiplyScalar(0.8);
  sun.scale.setScalar(0.11);
  sun.renderOrder = -16; sun.frustumCulled = false;
  group.add(sun);

  return {
    group, sunDir, planetDir: pDir, planet: pg,
    update(camera) {
      group.position.copy(camera.position);
      group.scale.setScalar(camera.far * 0.9);
    },
    dispose() {
      sg.dispose(); starMat.dispose(); planet.geometry.dispose(); planetMat.dispose(); air.geometry.dispose(); air.material.dispose();
      tex.dispose(); sunTex.dispose(); sun.material.dispose();
    },
  };
}

/** A seeded equirect picture of the home planet: deep sea, two big land masses, ice caps, cloud swirls. */
function planetTexture(THREE, sea, k = 1) {
  const W = 512 * k, H = 256 * k;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), e = hash(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v; };
  const fbm = (x, y, o) => { let s = 0, a = 1, n = 0; for (let i = 0; i < o; i++) { s += vn(x, y) * a; n += a; a *= 0.5; x *= 2; y *= 2; } return s / n; };
  const seaC = new THREE.Color(sea);
  for (let y = 0; y < H; y++) {
    const lat = (y / H - 0.5) * Math.PI;
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * Math.PI * 2;
      // sample the noise on the sphere so the seam and poles do not show
      const px = Math.cos(lat) * Math.cos(lon) * 2.2, py = Math.sin(lat) * 2.2, pz = Math.cos(lat) * Math.sin(lon) * 2.2;
      const land = fbm(px + 3.1 + pz * 0.7, py + pz * 0.5, 5);
      const cloud = fbm(px * 2.1 - pz, py * 3.2 + pz * 1.3 + 9, 4);
      let r = seaC.r * 0.7, gg = seaC.g * 0.75, b = seaC.b * 0.95;
      if (land > 0.55) { const t = Math.min(1, (land - 0.55) * 6); const dry = fbm(px * 3, py * 3 + 5, 3); r = 0.22 + 0.4 * dry * t; gg = 0.42 + 0.12 * t - 0.12 * dry; b = 0.18; }
      const ice = Math.abs(lat) > 1.22 ? 1 : 0;
      if (ice) { r = gg = b = 0.92; }
      const c = Math.max(0, (cloud - 0.5) * 2.4);
      r = r + (1 - r) * c; gg = gg + (1 - gg) * c; b = b + (1 - b) * c;
      const o = (y * W + x) * 4;
      d[o] = r * 255; d[o + 1] = gg * 255; d[o + 2] = b * 255; d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function discTexture(THREE) {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.16, 'rgba(255,255,250,1)'); gr.addColorStop(0.22, 'rgba(255,250,235,0.5)');
  gr.addColorStop(0.5, 'rgba(255,245,225,0.12)'); gr.addColorStop(1, 'rgba(255,240,220,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
