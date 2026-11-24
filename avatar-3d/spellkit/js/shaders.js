// Spell Kit shaders. Five programs in all, whatever the number of effects: particles, ground (decals +
// indicators), shell, ribbon, glow mesh. Every pooled object gets its own material instance of one of these, so
// they share the compiled program (three.js keys programs by source) and changing a uniform never recompiles.
//
// Every texture is white on black: `lum` (the red channel) is both the brightness and the see-through amount. The
// colour is a two-stop ramp: dim parts take the edge colour, bright parts the core colour (painted fire = white-yellow
// core, red edge).

const RAMP = /* glsl */`
vec4 ramp(float lum, vec3 core, vec3 edge, float alpha) {
  vec3 c = mix(edge, core, smoothstep(0.12, 0.95, lum));
  return vec4(c, lum * alpha);
}`;

export const PARTICLE_VS = /* glsl */`
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec4 iSize;   // size, rotation, stretch, atlas cell
attribute vec4 iCol;    // core rgb, alpha
attribute vec3 iEdge;   // edge rgb
uniform float uCells;
varying vec2 vUv;
varying vec4 vCol;
varying vec3 vEdge;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  vec2 c = position.xy;
  float size = iSize.x;
  vec2 off;
  if (iSize.z > 0.0) {                       // streak: long along the screen direction of travel
    vec3 vv = (viewMatrix * vec4(iVel, 0.0)).xyz;
    float l = length(vv.xy);
    vec2 d = l > 1e-4 ? vv.xy / l : vec2(1.0, 0.0);
    vec2 n = vec2(-d.y, d.x);
    float len = size * (1.0 + iSize.z * l);
    off = d * c.x * len + n * c.y * size;
  } else {
    float cs = cos(iSize.y), sn = sin(iSize.y);
    off = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * size;
  }
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
  float cx = mod(iSize.w, uCells), cy = floor(iSize.w / uCells);
  vUv = vec2((cx + uv.x) / uCells, 1.0 - (cy + 1.0 - uv.y) / uCells);
  vCol = iCol; vEdge = iEdge;
}`;

export const PARTICLE_FS = /* glsl */`
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec4 vCol;
varying vec3 vEdge;
${RAMP}
void main() {
  float lum = texture2D(uAtlas, vUv).r;
  vec4 o = ramp(lum, vCol.rgb, vEdge, vCol.a);
  if (o.a < 0.004) discard;
  gl_FragColor = o;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ground: decals AND targeting indicators. aLocal = metres from the centre in the decal's own frame (x right, y
// forward). uShape: 0 = textured decal, 1 = circle reticle, 2 = cone, 3 = rectangle (line).
export const GROUND_VS = /* glsl */`
attribute vec2 aLocal;
varying vec2 vLocal;
void main() {
  vLocal = aLocal;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;

export const GROUND_FS = /* glsl */`
uniform sampler2D uMap;
uniform sampler2D uRim;
uniform vec3 uCol;
uniform vec3 uEdge;
uniform float uOpacity;
uniform float uRot;
uniform float uScale;      // shown fraction of the full size (grow)
uniform float uHalf;       // half size in metres (decal) / radius or length (indicator)
uniform float uShape;
uniform vec3 uDims;        // indicator: radius|length, angle|width, -
uniform float uTime;
varying vec2 vLocal;
${RAMP}
const float PI = 3.14159265;
void main() {
  if (uShape < 0.5) {
    vec2 p = vLocal / (uHalf * 2.0);
    float cs = cos(uRot), sn = sin(uRot);
    p = vec2(p.x * cs - p.y * sn, p.x * sn + p.y * cs) / max(uScale, 0.001);
    vec2 q = p + 0.5;
    if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) discard;
    float lum = texture2D(uMap, q).r;
    vec4 o = ramp(lum, uCol, uEdge, uOpacity);
    if (o.a < 0.004) discard;
    gl_FragColor = o;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }
  // ---- indicators: d = metres inside the edge, t = 0..1 across the shape (for the outward sweep), u = along rim
  vec2 p = vLocal;
  float d, t, u;
  if (uShape < 1.5) {
    float r = length(p);
    d = uDims.x - r; t = r / uDims.x; u = atan(p.x, p.y) / (2.0 * PI) * floor(uDims.x * 2.2 + 3.0);
  } else if (uShape < 2.5) {
    float r = length(p), a = abs(atan(p.x, p.y));
    d = min(uDims.x - r, (uDims.y * 0.5 - a) * r); t = r / uDims.x; u = (p.x > 0.0 ? r : -r) * 0.45;
    if (a > uDims.y * 0.5 && r > 0.15) d = min(d, -0.01);
  } else {
    d = min(uDims.y * 0.5 - abs(p.x), min(p.y, uDims.x - p.y)); t = p.y / uDims.x; u = p.y * 0.45 + (p.x > 0.0 ? 0.0 : 0.5);
  }
  if (d < -0.02) discard;
  float rimW = 0.22 + uHalf * 0.012;
  float rim = smoothstep(rimW, 0.0, d) * smoothstep(-0.02, 0.02, d);
  float painted = texture2D(uRim, vec2(u - uTime * 0.25, clamp(1.0 - d / rimW, 0.0, 1.0))).r;
  float line = smoothstep(0.05, 0.0, abs(d - 0.02));
  float sweep = smoothstep(0.12, 0.0, abs(fract(t - uTime * 0.6) - 0.5) - 0.38) * step(0.0, d);
  float fill = 0.16 * step(0.0, d) * (0.6 + 0.4 * t);
  float a = clamp(fill + sweep * 0.22 + rim * (0.35 + 0.9 * painted) + line, 0.0, 1.0) * uOpacity;
  vec3 c = mix(uEdge, uCol, clamp(line + painted * rim + 0.25, 0.0, 1.0));
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// shell: cylinder / cone / dome wall with a scrolling painted band; bright at the base, fading upward and toward the
// silhouette's middle (so the wall reads as a see-through sheet of light rather than a solid tube).
export const SHELL_VS = /* glsl */`
varying vec2 vUv;
varying float vFacing;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vec3 v = normalize(cameraPosition - wp.xyz);
  vFacing = abs(dot(n, v));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const SHELL_FS = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uCol;
uniform vec3 uEdge;
uniform float uOpacity;
uniform vec2 uRepeat;
uniform vec2 uScroll;
uniform float uFade;       // how fast it fades upward (power)
varying vec2 vUv;
varying float vFacing;
${RAMP}
void main() {
  float lum = texture2D(uMap, vec2(vUv.x * uRepeat.x + uScroll.x, clamp(vUv.y * uRepeat.y + uScroll.y, 0.0, 1.0))).r;
  float up = pow(clamp(1.0 - vUv.y, 0.0, 1.0), uFade) * smoothstep(0.0, 0.04, vUv.y);
  float rim = mix(1.0, 0.45, vFacing);
  vec4 o = ramp(lum, uCol, uEdge, uOpacity * up * rim);
  o.a += uOpacity * up * 0.06 * (1.0 - vFacing);
  if (o.a < 0.004) discard;
  gl_FragColor = o;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ribbon: trails behind missiles, lightning arcs, weapon sweeps. uv.x = 0 at the head .. 1 at the tail, uv.y across.
export const RIBBON_VS = /* glsl */`
attribute float aFade;
varying vec2 vUv;
varying float vFade;
void main() {
  vUv = uv; vFade = aFade;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;

export const RIBBON_FS = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uCol;
uniform vec3 uEdge;
uniform float uOpacity;
uniform float uTexMix;     // 0 = soft procedural glow across, 1 = the band texture
uniform float uScroll;
varying vec2 vUv;
varying float vFade;
${RAMP}
void main() {
  float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float glow = pow(across, 1.6);
  float tex = texture2D(uMap, vec2(vUv.x * 2.0 + uScroll, vUv.y)).r;
  float lum = mix(glow, tex * (0.35 + 0.65 * across), uTexMix);
  vec4 o = ramp(lum, uCol, uEdge, uOpacity * vFade);
  if (o.a < 0.004) discard;
  gl_FragColor = o;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// glow mesh: missile cores, shards, spikes, rings. Hot centre, coloured rim.
export const GLOW_VS = /* glsl */`
varying float vFacing;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vFacing = abs(dot(n, normalize(cameraPosition - wp.xyz)));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const GLOW_FS = /* glsl */`
uniform vec3 uCol;
uniform vec3 uEdge;
uniform float uOpacity;
varying float vFacing;
void main() {
  float core = pow(vFacing, 1.5);
  vec3 c = mix(uEdge, uCol, core);
  gl_FragColor = vec4(c, uOpacity * (0.35 + 0.65 * core));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
