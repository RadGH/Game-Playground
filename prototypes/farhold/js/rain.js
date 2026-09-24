// Farhold round 23 — rain that looks like rain, snow that drifts, and things blowing in the wind.
//
//   const precip = createPrecipitation(scene, gfx);        // gfx from js/gfx.js
//   precip.update(dt, { camera, weather: blended, wind, terrain, colour, flash, indoors, biome });
//
// Everything here is drawn on the graphics card. The old rain (js/weather.js, still used when the
// Graphics setting is Off) moved two thousand line segments on the processor every frame; this moves
// nothing — each drop's place is a function of time in the vertex shader — so it can draw several
// times as many for less.
//
//   STREAKS   thin quads stretched along the drop's real velocity, which is the fall PLUS the wind
//             from js/wind.js, so the rain leans the same way the trees do. They live in a box that
//             is fixed to the world and tiled round the camera (not glued to it), so walking
//             through rain moves you past the drops instead of dragging them along.
//   SPLASHES  little rings where drops land, on the real ground height under them, and wider,
//             slower ripples where they land on water.
//   SHEETS    a curtain round the camera 120 m out: grey veils of rain drifting past in the
//             distance, which is most of what makes heavy rain read as heavy from a distance.
//   SNOW      soft round flakes, falling slowly, fluttering, and blown sideways far more than rain.
//   DEBRIS    when the wind gets up: leaves in green country, dust over dry ground, spindrift on snow,
//             ash on the burnt lands — tumbling along the ground downwind.
//
// Every one of them reads the SAME wind object, through js/wind.js's small pure functions.

import * as THREE from 'three';
import { rainVelocity, snowDrift, debrisVelocity } from './wind.js';
import { BIOMES } from '../../../worldgen/js/biomes.js';

const BOX = 36;          // metres across the tile of rain round the camera
const HIGH = 24;         // metres tall
const posMod = (a, n) => ((a % n) + n) % n;

function seeds(count, dims = 4, salt = 1) {
  const out = new Float32Array(count * dims);
  let s = (salt * 2654435761) >>> 0;
  for (let i = 0; i < out.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; out[i] = s / 4294967296; }
  return out;
}

// ---------------------------------------------------------------- rain streaks

function createStreaks(count) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0], 3));
  geo.setIndex([0, 1, 2, 2, 1, 3]);
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds(count, 4, 7), 4));
  geo.instanceCount = count;
  const uniforms = {
    uCamMod: { value: new THREE.Vector3() }, uFallOff: { value: 0 }, uWindOff: { value: new THREE.Vector2() },
    uVel: { value: new THREE.Vector3(0, -30, 0) }, uLen: { value: 0.9 }, uWidth: { value: 0.016 },
    uAmount: { value: 0 }, uColor: { value: new THREE.Color(0xa8c4dd) }, uGround: { value: -1e4 },
    uCamPos: { value: new THREE.Vector3() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec4 aSeed;
      uniform vec3 uCamMod, uVel;
      uniform float uFallOff, uLen, uWidth, uGround;
      uniform vec2 uWindOff;
      varying float vA;
      varying float vX;
      void main() {
        // where this drop is, relative to the camera, in a tile that is fixed to the world
        vec3 p;
        p.xz = mod( aSeed.xz * ${BOX.toFixed(1)} + uWindOff - uCamMod.xz + ${(BOX / 2).toFixed(1)}, ${BOX.toFixed(1)} ) - ${(BOX / 2).toFixed(1)};
        p.y = mod( aSeed.y * ${HIGH.toFixed(1)} - uFallOff - uCamMod.y + ${(HIGH * 0.35).toFixed(2)}, ${HIGH.toFixed(1)} ) - ${(HIGH * 0.35).toFixed(2)};
        vec3 V = normalize( uVel );
        float len = uLen * ( 0.6 + aSeed.w * 0.8 );
        vec3 toCam = normalize( - p + vec3( 0.0001 ) );
        vec3 side = normalize( cross( V, toCam ) + vec3( 1e-5 ) );
        vec3 wp = p - V * position.y * len + side * position.x * uWidth * ( 1.0 + length( p ) * 0.02 );
        float horiz = length( p.xz );
        // fade at the edge of the tile, right against your face, and under the ground
        vA = ( 1.0 - smoothstep( ${(BOX * 0.32).toFixed(1)}, ${(BOX * 0.5).toFixed(1)}, horiz ) )
           * smoothstep( 1.2, 4.0, length( p ) )
           * step( uGround - 0.3, p.y )
           * ( 0.55 + aSeed.w * 0.45 );
        vX = position.x;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( wp, 1.0 );
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <logdepthbuf_pars_fragment>
      uniform float uAmount;
      uniform vec3 uColor;
      varying float vA;
      varying float vX;
      void main() {
        float edge = 1.0 - abs( vX ) * 2.0;
        #include <logdepthbuf_fragment>
        gl_FragColor = vec4( uColor, uAmount * vA * edge * 0.62 );
      }`,
    // the quad is turned to face the camera round the drop's own axis, so which way its winding
    // faces depends on where the drop is — draw both sides or half the rain culls itself away
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = 'farhold-rain-gpu';
  mesh.renderOrder = 8;
  return { mesh, uniforms, fall: 0, wind: [0, 0] };
}

// ---------------------------------------------------------------- splashes and ripples

function createSplashes(count) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, -1, 0, 1, 1, 0, 1], 3));
  geo.setIndex([0, 2, 1, 1, 2, 3]);
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  const aLife = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);   // start, duration, size
  aPos.setUsage(THREE.DynamicDrawUsage); aLife.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aPos', aPos);
  geo.setAttribute('aLife', aLife);
  geo.instanceCount = count;
  for (let i = 0; i < count; i++) aLife.setXYZ(i, -99, 0.1, 0);
  const uniforms = { uTime: { value: 0 }, uAmount: { value: 0 }, uColor: { value: new THREE.Color(0xd8e6f2) }, uOrigin: { value: new THREE.Vector3() } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec3 aPos;
      attribute vec3 aLife;
      uniform float uTime;
      varying vec2 vUv;
      varying float vAge;
      void main() {
        float age = ( uTime - aLife.x ) / aLife.y;
        vAge = age;
        float r = aLife.z * ( 0.25 + age * 0.9 );
        vec3 p = aPos + vec3( position.x * r, 0.03, position.z * r );
        vUv = position.xz;
        gl_Position = ( age < 0.0 || age > 1.0 ) ? vec4( 2.0, 2.0, 2.0, 1.0 ) : projectionMatrix * modelViewMatrix * vec4( p, 1.0 );
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <logdepthbuf_pars_fragment>
      uniform float uAmount;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vAge;
      void main() {
        float r = length( vUv );
        float ring = smoothstep( 0.62, 0.84, r ) * ( 1.0 - smoothstep( 0.84, 1.0, r ) );
        float drop = ( 1.0 - smoothstep( 0.0, 0.25, r ) ) * ( 1.0 - smoothstep( 0.0, 0.25, vAge ) );
        float a = ( ring + drop ) * ( 1.0 - vAge ) * uAmount * 0.55;
        if ( a < 0.004 ) discard;
        #include <logdepthbuf_fragment>
        gl_FragColor = vec4( uColor, a );
      }`,
    transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = 'farhold-splashes';
  mesh.renderOrder = 7;
  return { mesh, uniforms, aPos, aLife, next: 0, owed: 0, count };
}

// ---------------------------------------------------------------- the distant sheets

function createSheets() {
  const R = 120, H = 170;
  const geo = new THREE.CylinderGeometry(R, R, H, 48, 1, true);
  geo.translate(0, H * 0.35, 0);
  const uniforms = {
    uTime: { value: 0 }, uAmount: { value: 0 }, uColor: { value: new THREE.Color(0x8090a0) },
    uLean: { value: new THREE.Vector2() }, uGround: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <logdepthbuf_pars_fragment>
      uniform float uTime, uAmount, uGround;
      uniform vec2 uLean;
      uniform vec3 uColor;
      varying vec3 vLocal;
      float h1( float n ) { return fract( sin( n ) * 43758.5453 ); }
      float n1( float x ) { float i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f ); return mix( h1( i ), h1( i + 1.0 ), f ); }
      void main() {
        float ang = atan( vLocal.z, vLocal.x );
        // the rain leans downwind: a curtain is slanted by how the wind lines up with this side
        float lean = dot( normalize( vLocal.xz ), uLean );
        float u = ang * 60.0 + vLocal.y * lean * 0.08;
        // curtains: slow, wide variation round the circle, drifting with time
        float curtain = n1( ang * 3.0 + uTime * 0.05 ) * 0.6 + n1( ang * 7.0 - uTime * 0.09 ) * 0.4;
        curtain = smoothstep( 0.35, 0.85, curtain );
        // streaks: fine vertical texture falling fast
        float streak = n1( u ) * 0.6 + n1( u * 2.3 + 17.0 ) * 0.4;
        streak *= 0.6 + 0.4 * n1( vLocal.y * 0.08 + uTime * 3.0 + floor( u ) * 3.1 );
        float h = vLocal.y;
        float vfade = smoothstep( -40.0, 10.0, h ) * ( 1.0 - smoothstep( 60.0, 110.0, h ) );
        float a = uAmount * curtain * ( 0.55 + 0.45 * streak ) * vfade * 0.5;
        #include <logdepthbuf_fragment>
        gl_FragColor = vec4( uColor, a );
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = 'farhold-rain-sheets';
  mesh.renderOrder = 6;
  return { mesh, uniforms };
}

// ---------------------------------------------------------------- points: snow and blown debris

const SPRITE_SHADER = /* glsl */`
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec4 aSeed;
  uniform vec3 uCamMod;
  uniform vec2 uDrift;
  uniform float uFallOff, uTime, uPx, uSize, uBoxW, uBoxH, uLayer, uGround, uFlutter;
  varying float vA;
  varying float vSeed;
  varying float vSpin;
  void main() {
    vec3 p;
    p.xz = mod( aSeed.xz * uBoxW + uDrift - uCamMod.xz + uBoxW * 0.5, uBoxW ) - uBoxW * 0.5;
    float ph = aSeed.w * 6.2831;
    if ( uLayer > 0.0 ) {
      // debris: a shallow layer just over the ground, bobbing and hopping as it blows
      p.y = uGround + 0.15 + mod( aSeed.y * uLayer + uFallOff * 0.2, uLayer ) + abs( sin( uTime * 2.3 + ph ) ) * 0.5;
    } else {
      p.y = mod( aSeed.y * uBoxH - uFallOff - uCamMod.y + uBoxH * 0.35, uBoxH ) - uBoxH * 0.35;
    }
    p.x += sin( uTime * 1.3 + ph ) * uFlutter;
    p.z += cos( uTime * 1.1 + ph * 1.7 ) * uFlutter;
    vec4 mv = modelViewMatrix * vec4( p, 1.0 );
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
    float size = uSize * ( 0.6 + aSeed.w * 0.8 );
    gl_PointSize = clamp( size * uPx / max( - mv.z, 0.1 ), 0.0, 64.0 );
    vA = ( 1.0 - smoothstep( uBoxW * 0.32, uBoxW * 0.5, length( p.xz ) ) ) * smoothstep( 0.3, 1.2, length( p ) )
       * step( uGround - 0.2, p.y );
    vSeed = aSeed.w;
    vSpin = uTime * ( 1.5 + aSeed.x * 4.0 ) + ph;
  }`;

function createPoints(count, { name, salt, leafy = false }) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds(count, 4, salt), 4));
  const uniforms = {
    uCamMod: { value: new THREE.Vector3() }, uDrift: { value: new THREE.Vector2() }, uFallOff: { value: 0 },
    uTime: { value: 0 }, uPx: { value: 600 }, uSize: { value: 0.09 }, uBoxW: { value: 30 }, uBoxH: { value: 20 },
    uLayer: { value: 0 }, uGround: { value: -1e4 }, uFlutter: { value: 0.3 },
    uAmount: { value: 0 }, uColor: { value: new THREE.Color(0xffffff) }, uColor2: { value: new THREE.Color(0xffffff) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    defines: leafy ? { LEAFY: '' } : {},
    vertexShader: SPRITE_SHADER,
    fragmentShader: /* glsl */`
      #include <logdepthbuf_pars_fragment>
      uniform float uAmount;
      uniform vec3 uColor, uColor2;
      varying float vA;
      varying float vSeed;
      varying float vSpin;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        #ifdef LEAFY
          // a leaf: an ellipse turned by its own spin, flattened as it tumbles
          float s = sin( vSpin ), k = cos( vSpin );
          vec2 r = vec2( c.x * k - c.y * s, c.x * s + c.y * k );
          r.y /= 0.35 + 0.65 * abs( cos( vSpin * 0.7 ) );
          float d = length( r * vec2( 1.0, 2.2 ) );
          float a = 1.0 - smoothstep( 0.36, 0.5, d );
          vec3 col = mix( uColor, uColor2, vSeed );
        #else
          float d = length( c );
          float a = 1.0 - smoothstep( 0.15, 0.5, d );
          vec3 col = uColor;
        #endif
        a *= vA * uAmount;
        if ( a < 0.01 ) discard;
        #include <logdepthbuf_fragment>
        gl_FragColor = vec4( col, a );
      }`,
    transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.name = name;
  pts.renderOrder = 8;
  return { mesh: pts, uniforms, fall: 0, drift: [0, 0] };
}

/** What the wind blows along the ground here: `{ kind, a, b, amount }`, or null. */
export function debrisFor(biomeKey) {
  const b = BIOMES.find(x => x.key === biomeKey);
  const tags = b?.tags || [];
  if (!b || tags.includes('water')) return null;
  if (tags.includes('cold') && !tags.includes('forest')) return { kind: 'spindrift', a: '#f4f8ff', b: '#dce8f4', amount: 1 };
  if (biomeKey === 'volcanic' || biomeKey === 'ashPlain') return { kind: 'ash', a: '#6a6260', b: '#3a3432', amount: 1 };
  if (tags.includes('dry') || biomeKey === 'beach') return { kind: 'dust', a: '#c8a878', b: '#a88a60', amount: 1 };
  if (tags.includes('forest') || tags.includes('fertile') || tags.includes('open')) return { kind: 'leaves', a: '#6a8a3a', b: '#c0802a', amount: 1 };
  return { kind: 'dust', a: '#a09478', b: '#807058', amount: 0.6 };
}

export function createPrecipitation(scene, gfx) {
  const streaks = gfx.rainDrops > 0 ? createStreaks(gfx.rainDrops) : null;
  const splashes = gfx.splashes > 0 ? createSplashes(gfx.splashes) : null;
  const sheets = gfx.rainSheets ? createSheets() : null;
  const snow = gfx.snowFlakes > 0 ? createPoints(gfx.snowFlakes, { name: 'farhold-snow-gpu', salt: 11 }) : null;
  const debris = gfx.debris > 0 ? createPoints(gfx.debris, { name: 'farhold-debris', salt: 23, leafy: true }) : null;
  for (const m of [streaks, splashes, sheets, snow, debris]) if (m) { m.mesh.visible = false; scene.add(m.mesh); }
  let time = 0;
  const state = { rain: 0, snow: 0, debris: 0, debrisKind: null, splashes: 0 };
  const tmpC = new THREE.Color();
  const tmpV = new THREE.Vector3();
  const white = new THREE.Color(0xffffff);

  function update(dt, ctx = {}) {
    const { camera, weather: w = {}, wind, terrain, colour, flash = 0, indoors = false } = ctx;
    time += dt;
    if (!camera || !wind) return state;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const ground = terrain ? terrain.heightAt(cx, cz) : -1e4;
    const rainAmt = indoors ? 0 : Math.max(0, Math.min(1, w.rain ?? 0));
    const snowAmt = indoors ? 0 : Math.max(0, Math.min(1, w.snow ?? 0));
    state.rain = rainAmt; state.snow = snowAmt;
    const lit = tmpC.copy(colour || tmpC.set(0xa8c4dd)).lerp(new THREE.Color(0xeef4ff), flash * 0.8);

    // --- rain
    if (streaks) {
      const on = rainAmt > 0.01;
      streaks.mesh.visible = on;
      if (on) {
        const v = rainVelocity(wind, 22 + rainAmt * 12);
        streaks.fall = posMod(streaks.fall - v.y * dt, HIGH * 1000);
        streaks.wind[0] = posMod(streaks.wind[0] + v.x * dt, BOX);
        streaks.wind[1] = posMod(streaks.wind[1] + v.z * dt, BOX);
        const U = streaks.uniforms;
        U.uVel.value.set(v.x, v.y, v.z);
        U.uFallOff.value = posMod(streaks.fall, HIGH);
        U.uWindOff.value.set(streaks.wind[0], streaks.wind[1]);
        U.uCamMod.value.set(posMod(cx, BOX), posMod(cy, HIGH), posMod(cz, BOX));
        U.uAmount.value = 0.35 + rainAmt * 0.65;
        U.uLen.value = 0.45 + rainAmt * 0.45;
        U.uGround.value = ground - cy;
        // a drop catches the light: a little brighter than the sky behind it
        U.uColor.value.copy(lit).lerp(white, 0.35);
        streaks.mesh.position.set(cx, cy, cz);
        // draw only as many drops as the rain is heavy — a drizzle is a drizzle
        streaks.mesh.geometry.instanceCount = Math.round(gfx.rainDrops * (0.2 + rainAmt * 0.8));
      }
    }

    // --- splashes: spawned on the processor (tens a frame), animated on the card
    if (splashes) {
      const on = rainAmt > 0.05 && terrain;
      splashes.mesh.visible = !!on;
      splashes.uniforms.uTime.value = time;
      if (on) {
        splashes.uniforms.uAmount.value = rainAmt;
        splashes.uniforms.uColor.value.copy(lit).lerp(new THREE.Color(0xffffff), 0.4);
        splashes.owed += dt * splashes.count * 2.2 * rainAmt;
        // positions are stored relative to an anchor near the camera (small numbers, so no
        // precision loss 30 km from the origin); the anchor is moved every 20 m
        if (!splashes.anchor) splashes.anchor = [cx, cy, cz];
        rebase(splashes, cx, cy, cz);
        const [ax, ay, az] = splashes.anchor;
        // bias them in front of the camera, where they are seen
        const dir = camera.getWorldDirection(tmpV);
        let n = 0;
        while (splashes.owed >= 1 && n < 40) {
          splashes.owed -= 1; n++;
          const r = 1.5 + Math.random() * 13;
          const a = Math.random() * Math.PI * 2;
          const x = cx + dir.x * r * 0.7 + Math.cos(a) * r * 0.6;
          const z = cz + dir.z * r * 0.7 + Math.sin(a) * r * 0.6;
          const water = terrain.waterAt?.(x, z);
          const onWater = water && water.depth > 0.05;
          const y = onWater ? water.surface : terrain.heightAt(x, z);
          const i = splashes.next;
          splashes.next = (splashes.next + 1) % splashes.count;
          splashes.aPos.setXYZ(i, x - ax, y - ay, z - az);
          splashes.aLife.setXYZ(i, time, onWater ? 0.9 : 0.35, onWater ? 0.55 + Math.random() * 0.4 : 0.12 + Math.random() * 0.1);
        }
        splashes.owed = Math.min(splashes.owed, 8);
        splashes.aPos.needsUpdate = true;
        splashes.aLife.needsUpdate = true;
        splashes.mesh.position.set(splashes.anchor[0], splashes.anchor[1], splashes.anchor[2]);
      }
    }

    // --- distant sheets
    if (sheets) {
      const on = rainAmt > 0.2;
      sheets.mesh.visible = on;
      if (on) {
        sheets.uniforms.uTime.value = time;
        sheets.uniforms.uAmount.value = Math.min(1, (rainAmt - 0.2) * 1.5);
        // a veil of rain reads as a darker grey against the haze behind it
        sheets.uniforms.uColor.value.copy(ctx.fogColour || lit).lerp(lit, 0.3).multiplyScalar(0.72);
        const v = rainVelocity(wind, 30);
        sheets.uniforms.uLean.value.set(v.x / 30, v.z / 30);
        sheets.mesh.position.set(cx, ground, cz);
      }
    }

    // --- snow
    if (snow) {
      const on = snowAmt > 0.01;
      snow.mesh.visible = on;
      if (on) {
        const d = snowDrift(wind);
        const U = snow.uniforms;
        snow.fall = posMod(snow.fall + (1.0 + snowAmt * 1.6) * dt, 20000);
        snow.drift[0] = posMod(snow.drift[0] + d.x * dt, 30);
        snow.drift[1] = posMod(snow.drift[1] + d.z * dt, 30);
        U.uBoxW.value = 30; U.uBoxH.value = 20; U.uLayer.value = 0;
        U.uFallOff.value = posMod(snow.fall, 20);
        U.uDrift.value.set(snow.drift[0], snow.drift[1]);
        U.uCamMod.value.set(posMod(cx, 30), posMod(cy, 20), posMod(cz, 30));
        U.uTime.value = time % 6283.18;
        U.uSize.value = 0.07 + snowAmt * 0.04;
        U.uFlutter.value = 0.35;
        U.uAmount.value = 0.5 + snowAmt * 0.5;
        U.uGround.value = ground - cy;
        U.uPx.value = pxScale(camera, ctx.viewHeight);
        U.uColor.value.set(0xffffff).lerp(lit, 0.25);
        snow.mesh.position.set(cx, cy, cz);
        snow.mesh.geometry.setDrawRange(0, Math.round(gfx.snowFlakes * (0.25 + snowAmt * 0.75)));
      }
    }

    // --- things blowing along the ground
    if (debris) {
      const kind = indoors ? null : debrisFor(ctx.biome);
      const wantWind = Math.max(0, Math.min(1, (wind.strength - 0.28) / 0.5));
      const amt = kind ? Math.min(1, wantWind * kind.amount + (w.dust ?? 0) * 0.5) * (1 - rainAmt * 0.6) : 0;
      state.debris = amt; state.debrisKind = kind?.kind || null;
      const on = amt > 0.02;
      debris.mesh.visible = on;
      if (on) {
        const v = debrisVelocity(wind);
        const U = debris.uniforms;
        debris.fall = posMod(debris.fall + dt, 1000);
        debris.drift[0] = posMod(debris.drift[0] + v.x * dt, 40);
        debris.drift[1] = posMod(debris.drift[1] + v.z * dt, 40);
        U.uBoxW.value = 40; U.uLayer.value = 2.2;
        U.uFallOff.value = debris.fall;
        U.uDrift.value.set(debris.drift[0], debris.drift[1]);
        U.uCamMod.value.set(posMod(cx, 40), 0, posMod(cz, 40));
        U.uTime.value = time % 6283.18;
        U.uSize.value = kind.kind === 'leaves' ? 0.14 : kind.kind === 'dust' ? 0.2 : 0.1;
        U.uFlutter.value = 0.25;
        U.uAmount.value = amt;
        U.uGround.value = ground - cy;
        U.uPx.value = pxScale(camera, ctx.viewHeight);
        U.uColor.value.set(kind.a).multiplyScalar(ctx.daylight ?? 1);
        U.uColor2.value.set(kind.b).multiplyScalar(ctx.daylight ?? 1);
        debris.mesh.position.set(cx, cy, cz);
        debris.mesh.geometry.setDrawRange(0, Math.round(gfx.debris * amt));
      }
    }
    state.splashes = splashes ? splashes.count : 0;
    return state;
  }

  /** Keep spawned splashes where they landed as the camera anchor moves. */
  function rebase(s, cx, cy, cz) {
    const [ax, ay, az] = s.anchor;
    const dx = ax - cx, dy = ay - cy, dz = az - cz;
    if (dx * dx + dy * dy + dz * dz < 400) return;
    // shift every stored position so they are relative to the new anchor
    for (let i = 0; i < s.count; i++) {
      s.aPos.setXYZ(i, s.aPos.getX(i) + dx, s.aPos.getY(i) + dy, s.aPos.getZ(i) + dz);
    }
    s.anchor = [cx, cy, cz];
    s.aPos.needsUpdate = true;
  }

  return {
    state, streaks, splashes, sheets, snow, debris,
    update,
    setVisible(on) { if (!on) for (const m of [streaks, splashes, sheets, snow, debris]) if (m) m.mesh.visible = false; },
    dispose() {
      for (const m of [streaks, splashes, sheets, snow, debris]) {
        if (!m) continue;
        scene.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.material.dispose();
      }
    },
  };
}

/** Pixels per metre at one metre away, so a point sprite is sized like a real flake. */
function pxScale(camera, viewHeight = 720) {
  const fov = (camera.fov || 62) * Math.PI / 180;
  return viewHeight / (2 * Math.tan(fov / 2));
}
