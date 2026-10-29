// GLSL for the Tactical Scope's cell pass and its emitter pass (PLAN M1 renderer).
//
// The cell texture is the world itself: one R32UI texel per cell, the same 32 bits the sim holds
// (PLAN §3.1). The material table is a small RGBA8 texture: rows 0-2 colour variants, row 3
// (relief, shade code, emit strength, flammable), row 4 emit colour. Relief is NEVER stored — it is
// derived here from the material and a position hash (PLAN §3.1 "Relief is not stored").
//
// Shade codes follow js/world/materials.js SHADES.

export const COMMON = `
precision highp float;
precision highp int;
precision highp usampler2D;
uniform usampler2D uCells;
uniform sampler2D uMat;
uniform vec2 uWorld;
uniform float uTime;

const float SH_GROUND = 0.0, SH_PLANT = 1.0, SH_TREE = 2.0, SH_ROCK = 3.0, SH_ORE = 4.0, SH_CRYSTAL = 5.0,
  SH_SHALLOW = 6.0, SH_DEEP = 7.0, SH_ICE = 8.0, SH_LAVA = 9.0, SH_GLASS = 10.0, SH_RUBBLE = 11.0, SH_MUD = 12.0,
  SH_WALL = 13.0, SH_CLIFF = 14.0, SH_LAMP = 15.0;
const uint F_BURN = 1u, F_OWNED = 2u, F_SCORCH = 4u, F_ROAD = 8u, F_BRIDGE = 16u, F_RAIL = 32u, F_EDGE = 64u, F_WET = 128u;

uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float h21(ivec2 p, uint salt) {
  return float(pcg(uint(p.x) * 1973u + uint(p.y) * 9277u + salt * 26699u)) / 4294967295.0;
}
float vnoise(vec2 x, uint salt) {
  vec2 i = floor(x), f = fract(x);
  vec2 u = f * f * (3.0 - 2.0 * f);
  ivec2 ii = ivec2(i);
  float a = h21(ii, salt), b = h21(ii + ivec2(1, 0), salt), c = h21(ii + ivec2(0, 1), salt), d = h21(ii + ivec2(1, 1), salt);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
uint cellAt(ivec2 p) {
  p = clamp(p, ivec2(0), ivec2(uWorld) - 1);
  return texelFetch(uCells, p, 0).r;
}
vec4 matRow(uint m, int row) { return texelFetch(uMat, ivec2(int(m), row), 0); }
float shadeOf(uint m) { return floor(matRow(m, 3).g * 255.0 + 0.5); }

// fire colour for a burning cell (HDR)
vec3 flame(ivec2 p, float fuel) {
  // flicker: each cell has its own phase, so a burning field shimmers rather than glowing flat
  float ph = h21(p, 3u) * 6.2831;
  float sp = 9.0 + 7.0 * h21(p, 4u);
  float f = 0.5 + 0.5 * sin(uTime * sp + ph);
  float g = h21(p, uint(uTime * 11.0) + 11u);
  float tongue = vnoise(vec2(p) * 0.35 + vec2(0.0, uTime * 3.0), 12u);
  float k = clamp(f * 0.55 + tongue * 0.65 - 0.15, 0.0, 1.0);
  vec3 c = mix(vec3(0.75, 0.12, 0.02), vec3(1.0, 0.55, 0.1), smoothstep(0.15, 0.6, k));
  c = mix(c, vec3(1.0, 0.86, 0.45), smoothstep(0.7, 1.0, k));
  c = mix(c, vec3(1.0, 0.96, 0.8), step(0.93, g) * 0.8);
  float life = clamp(fuel / 30.0, 0.3, 1.0);
  return c * (0.55 + 1.9 * k) * life;
}
// glow of hot ground (embers, hot rubble): temp byte 0-255
vec3 heatGlow(float t) {
  float k = smoothstep(130.0, 245.0, t);
  return mix(vec3(0.6, 0.06, 0.01), vec3(1.0, 0.55, 0.18), k * k) * k * 2.4;
}
vec3 lavaColor(vec2 w, ivec2 p, out float crust) {
  float n1 = vnoise(w * 0.07 + vec2(uTime * 0.035, uTime * 0.02), 91u);
  float n2 = vnoise(w * 0.21 - vec2(uTime * 0.05, -uTime * 0.04), 92u);
  float n3 = vnoise(w * 0.6 + vec2(0.0, uTime * 0.2), 93u);
  float v = n1 * 0.6 + n2 * 0.32 + n3 * 0.08;
  // mostly dark crust; molten rivers glow in the cracks between plates, hottest in the middle
  float heat = 1.0 - smoothstep(0.34, 0.5, v);
  crust = 1.0 - heat;
  vec3 molten = mix(vec3(0.6, 0.07, 0.01), vec3(1.0, 0.45, 0.08), heat) * (0.55 + 1.15 * heat * heat);
  vec3 rock = vec3(0.11, 0.045, 0.035) * (0.8 + 0.4 * n3);
  return mix(rock, molten, smoothstep(0.02, 0.4, heat));
}
// Light a cell gives off (HDR, linear-ish). Used by the emitter pass and by the cell pass.
vec3 cellEmit(uint c, ivec2 p, vec2 w) {
  uint m = c & 255u;
  uint fl = c >> 24u;
  float t = float((c >> 8u) & 255u);
  vec4 r3 = matRow(m, 3);
  float sh = floor(r3.g * 255.0 + 0.5);
  vec3 e = vec3(0.0);
  if ((fl & F_BURN) != 0u) e += flame(p, float((c >> 16u) & 255u));
  else if (sh == SH_LAVA) { float cr; e += lavaColor(w, p, cr) * (1.0 - cr * 0.85); }
  else if (r3.b > 0.0) {
    float tw = sh == SH_CRYSTAL ? 0.6 + 0.4 * sin(uTime * 2.0 + h21(p, 5u) * 6.28) : 1.0;
    vec4 r4 = matRow(m, 4);
    e += r4.rgb * r3.b * 2.2 * tw * r4.a * 31.875;
  }
  if ((fl & F_BURN) == 0u && sh != SH_LAVA && t > 130.0) e += heatGlow(t);
  return e;
}
`;

export const CELL_FS = `#version 300 es
${COMMON}
uniform sampler2D uGas;
uniform sampler2D uLight;
uniform sampler2D uFog;
uniform vec2 uOrigin;
uniform float uCpp;
uniform vec2 uRes;
uniform vec4 uLightRect;
uniform float uLightScale;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uAmb;
uniform vec3 uSky;
uniform float uNight;
uniform int uFogOn;
uniform vec2 uWind;
uniform float uFlash;
uniform sampler2D uRoad;   // road distance field (js/render/roads.js): distance to the nearest laid road, 1/40 cell
uniform float uRoadW;      // road half-width in cells (= the sim's stamp radius)
uniform float uRoadLv;     // global Road level (§0.5: one subtle look change on every road)
uniform int uFilter;       // 0 SIGHT, 1 ORE, 2 FLOW, 3 THREAT
uniform sampler2D uWall;   // M4 wall field (js/render/vectors.js): R distance to a standing wall's line (1/40 cell), G 0 none / 255 gate / 1+200×hp
uniform float uWallW;      // wall half-width in cells (= the sim's stamp radius)
uniform float uWallLv;     // global Wall level (§0.5: one subtle look change on every wall: the trim paint)
uniform vec3 uWallTrim;
out vec4 outColor;

float roadDist(vec2 w) { return texture(uRoad, w / uWorld).r * 6.375; }
float wallDist(vec2 w) { return texture(uWall, w / uWorld).r * 6.375; }
// Is this cell part of a standing wall (or gate)? The field only holds standing sections; the cell must be wall too.
bool wallCellAt(uint c, ivec2 p, float sh, out float info) {
  vec4 t = texelFetch(uWall, p, 0);
  info = t.g * 255.0;
  if (info < 0.5 || t.r * 6.375 > uWallW + 0.05) return false; // only cells inside a standing wall's band (not a roof beside it)
  return sh == SH_WALL || (info > 250.0 && sh == SH_GROUND);
}

// The wall look (M4): a smooth band from the distance field, drawn only on the cells the sim really holds as wall —
// stone or timber courses running along the line, a lit ridge on top, the global level's trim paint on both edges,
// darker and cracked as a section loses hit points; a gate is planks in a frame. Ground beside it gets a contact shadow.
vec3 wallLook(vec3 col, uint c, ivec2 p, vec2 w, float sh) {
  float info;
  bool on = wallCellAt(c, p, sh, info);
  float d = wallDist(w);
  if (!on) {
    if (d < uWallW + 1.6 && d > uWallW - 0.4 && sh != SH_WALL) col *= 1.0 - 0.32 * (1.0 - smoothstep(uWallW, uWallW + 1.5, d));
    return col;
  }
  bool gate = info > 250.0;
  float hp = clamp((info - 1.0) / 200.0, 0.0, 1.0);
  float aa = max(0.22, uCpp * 0.9);
  float cov = 1.0 - smoothstep(uWallW - aa, uWallW + aa * 0.4, d);
  vec3 wc = col;
  // along the wall: the field's gradient points across it, so the tangent gives a coordinate along the line
  vec2 gr = vec2(wallDist(w + vec2(0.35, 0.0)) - wallDist(w - vec2(0.35, 0.0)), wallDist(w + vec2(0.0, 0.35)) - wallDist(w - vec2(0.0, 0.35)));
  vec2 tang = normalize(vec2(-gr.y, gr.x) + vec2(1e-4, 0.0));
  float u = dot(w, tang);
  float trim = smoothstep(uWallW - 0.62, uWallW - 0.36, d) * (1.0 - smoothstep(uWallW - 0.3, uWallW - 0.04, d));
  if (gate) {
    // planks running across the opening, in a dark iron frame
    float pl = step(0.18, fract(u * 1.3));
    wc = mix(vec3(0.2, 0.13, 0.07), vec3(0.46, 0.32, 0.18), pl) * (0.9 + 0.2 * h21(ivec2(int(floor(u * 1.3)), 3), 74u));
    wc = mix(wc, vec3(0.13, 0.13, 0.14), trim);
  } else if (uWallLv < 1.5) {
    // Wall I: a timber palisade — upright stakes along the line, each its own shade, dark gaps, pointed heads on top
    float k = floor(u * 1.25), f = fract(u * 1.25);
    float stake = smoothstep(0.0, 0.14, f) * smoothstep(1.0, 0.86, f);
    float shadeK = 0.78 + 0.36 * h21(ivec2(int(k), 9), 73u);
    wc = vec3(0.42, 0.29, 0.16) * shadeK;
    wc = mix(wc * 0.35, wc, stake);
    wc *= 1.0 + 0.25 * (1.0 - smoothstep(0.0, 0.5, d)) * stake;       // the sharpened heads catch the light
    wc = mix(wc, wc * 0.6, smoothstep(uWallW - 0.5, uWallW, d));       // lashed base in shadow
  } else {
    // Wall II+: dressed blocks — courses by distance, staggered joints along the line
    float row = floor(d * 1.4);
    float f = fract(u * 0.8 + row * 0.5);
    float joint = smoothstep(0.0, 0.08, f) * smoothstep(1.0, 0.92, f) * smoothstep(0.0, 0.12, fract(d * 1.4));
    wc *= 0.82 + 0.22 * h21(ivec2(int(floor(u * 0.8 + row * 0.5)), int(row)), 75u);
    wc = mix(wc * 0.55, wc, joint);
    wc *= 1.0 + 0.12 * (1.0 - smoothstep(0.0, 0.7, d));
  }
  if (!gate) {
    float cr = vnoise(w * 0.9, 71u) * 0.7 + h21(p, 72u) * 0.3;
    wc *= mix(0.6, 1.0, hp);
    wc = mix(wc, wc * 0.35, step(0.9 - (1.0 - hp) * 0.4, cr) * (1.0 - hp));
  }
  if (uWallLv > 1.5) wc = mix(wc, uWallTrim, trim * 0.8);
  return mix(col * 0.42, wc, cov);
}

// The road look: a smooth band from the distance field, only on cells the sim really treats as road or bridge
// (never on a cliff, a roof, or water no bridge spans) — so what is drawn as road is what is walked as road.
vec3 roadLook(vec3 col, uint c, ivec2 p, vec2 w, float sh) {
  uint fl = c >> 24u;
  float d = roadDist(w);
  bool water = sh == SH_SHALLOW || sh == SH_DEEP || sh == SH_LAVA;
  if (d > uRoadW + 1.2) {
    // road flags painted without a drawn road (the bench's paint tool): the old per-cell look
    if ((fl & F_ROAD) != 0u) col = mix(col, vec3(0.56, 0.48, 0.36) * (0.92 + 0.12 * h21(p, 2u)), 0.88);
    if ((fl & F_BRIDGE) != 0u) { float plank = step(0.18, fract(w.x * 0.5 + w.y * 0.5)); col = mix(vec3(0.28, 0.19, 0.11), vec3(0.52, 0.37, 0.22), plank); }
    return col;
  }
  if ((fl & F_EDGE) != 0u || sh == SH_WALL || sh == SH_CLIFF || sh == SH_LAMP) return col;
  float aa = max(0.28, uCpp * 0.9);
  float cov = 1.0 - smoothstep(uRoadW - aa, uRoadW + aa, d);
  if (water && (fl & F_BRIDGE) == 0u) {
    // the deck's shadow on the water beside it
    return col * (1.0 - 0.35 * (1.0 - smoothstep(uRoadW, uRoadW + 1.4, d)));
  }
  if (cov <= 0.001) return col;
  float hv = h21(p, 61u);
  vec3 road;
  if (water) {
    vec2 gr = vec2(roadDist(w + vec2(0.4, 0.0)) - roadDist(w - vec2(0.4, 0.0)), roadDist(w + vec2(0.0, 0.4)) - roadDist(w - vec2(0.0, 0.4)));
    vec2 along = normalize(vec2(-gr.y, gr.x) + vec2(1e-4, 0.0));
    float u = dot(w, along) * 1.6;
    float seam = fract(u);
    float pick = h21(ivec2(int(floor(u)), 7), 63u);
    road = vec3(0.50, 0.35, 0.21) * (0.8 + 0.35 * pick) * (0.75 + 0.25 * smoothstep(0.0, 0.12, seam) * smoothstep(1.0, 0.88, seam));
    float rail = smoothstep(uRoadW - 0.75, uRoadW - 0.35, d);
    road = mix(road, vec3(0.2, 0.13, 0.08), rail * 0.85);
  } else {
    float grain = vnoise(w * 0.9, 62u) * 0.5 + hv * 0.5;
    road = vec3(0.57, 0.49, 0.36) * (0.86 + 0.18 * grain);
    road *= 1.0 - 0.16 * smoothstep(0.34, 0.0, abs(d - 0.95));            // two wheel ruts
    road = mix(road, road * 0.76, smoothstep(uRoadW - 0.95, uRoadW - 0.15, d)); // soft verge
    // the global Road level shows as a pale edge stone on every road at once
    if (uRoadLv > 1.5) road = mix(road, vec3(0.78, 0.74, 0.64), smoothstep(uRoadW - 0.5, uRoadW - 0.2, d) * (1.0 - smoothstep(uRoadW - 0.2, uRoadW, d)) * 0.7);
  }
  return mix(col, road, cov);
}

float reliefOf(uint c, ivec2 p) {
  uint m = c & 255u;
  uint fl = c >> 24u;
  if ((fl & (F_ROAD | F_BRIDGE)) != 0u) return 0.04;
  vec4 r3 = matRow(m, 3);
  float sh = floor(r3.g * 255.0 + 0.5);
  float base = r3.r;
  if ((fl & F_EDGE) != 0u) base = 0.92;
  float j = sh == SH_TREE ? 0.42 : (sh == SH_ROCK || sh == SH_ORE || sh == SH_RUBBLE || sh == SH_CRYSTAL || sh == SH_CLIFF) ? 0.22 : sh == SH_PLANT ? 0.12 : 0.05;
  // trees: big soft canopies (a low-frequency bump) plus leaf noise
  if (sh == SH_TREE) base += (vnoise(vec2(p) * 0.33, 7u) - 0.5) * 0.5;
  return clamp(base + (h21(p, 1u) - 0.5) * j, 0.0, 1.0);
}

vec3 lightAt(vec2 w) {
  vec2 uv = (w - uLightRect.xy) / uLightRect.zw;
  vec3 l = texture(uLight, uv).rgb * uLightScale;
  // soft saturation: a huge fire lights the ground brightly but never blows it out to white
  return l / (1.0 + dot(l, vec3(0.333)) * 0.45);
}

vec3 baseColor(uint c, ivec2 p, vec2 w, out float sh, out float emitBoost) {
  uint m = c & 255u;
  uint fl = c >> 24u;
  vec4 r3 = matRow(m, 3);
  sh = floor(r3.g * 255.0 + 0.5);
  emitBoost = 0.0;
  float hv = h21(p, 2u);
  int vi = hv < 0.45 ? 0 : hv < 0.8 ? 1 : 2;
  vec3 col = matRow(m, vi).rgb;
  // big soft patches so a field is never one flat colour
  float big = vnoise(w * 0.018, 3u) * 0.6 + vnoise(w * 0.06, 4u) * 0.4;
  col *= 0.86 + 0.28 * big;
  col *= 0.94 + 0.12 * h21(p, 9u);
  float t = float((c >> 8u) & 255u);
  if ((fl & F_SCORCH) != 0u && sh != SH_RUBBLE) col *= 0.62;
  if ((fl & F_WET) != 0u && sh != SH_SHALLOW && sh != SH_DEEP) col *= 0.72;
  if ((fl & F_EDGE) != 0u) col = mix(vec3(0.15, 0.16, 0.2), vec3(0.23, 0.24, 0.3), hv); // cold slate: a cliff reads as a drop, never as rock
  if (t < 44.0 && sh != SH_ICE && sh != SH_SHALLOW && sh != SH_DEEP) {
    // rime: patchy frost that shrinks back as the ground warms
    float cold = clamp((44.0 - t) / 40.0, 0.0, 1.0);
    float spots = vnoise(w * 0.45, 41u) * 0.7 + h21(p, 42u) * 0.3;
    col = mix(col, vec3(0.82, 0.9, 0.98), smoothstep(1.0 - cold * 0.55, 1.08 - cold * 0.5, spots) * 0.8);
    col = mix(col, col * vec3(0.85, 0.95, 1.1), cold * 0.5);
  }
  if (sh == SH_ICE) {
    // cracked ice over dark water: crack lines from two noise fields crossing
    float a = vnoise(w * 0.22, 43u), b = vnoise(w * 0.22 + 17.0, 44u);
    float crack = smoothstep(0.03, 0.0, abs(a - b));
    col = mix(col, col * vec3(0.55, 0.7, 0.85), 0.35 * vnoise(w * 0.07, 45u));
    col = mix(col, vec3(0.42, 0.58, 0.7), crack * 0.6);
  }
  return wallLook(roadLook(col, c, p, w, sh), c, p, w, sh);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 w = uOrigin + px * uCpp;
  if (w.x < 0.0 || w.y < 0.0 || w.x >= uWorld.x || w.y >= uWorld.y) { outColor = vec4(0.015, 0.02, 0.02, 1.0); return; }
  ivec2 p = ivec2(floor(w));
  uint c = cellAt(p);
  uint fl = c >> 24u;
  float sh, eb;
  vec3 col = baseColor(c, p, w, sh, eb);
  vec3 lit;
  vec3 L = lightAt(w + 0.5);
  if (uCpp > 1.6) {
    // zoomed far out: average a few cells, flat lighting (chart-like, no shimmer of single cells)
    vec3 acc = col; vec3 em = cellEmit(c, p, w);
    for (int k = 1; k < 4; k++) {
      ivec2 q = ivec2(floor(w + vec2(float(k & 1), float(k >> 1)) * uCpp * 0.5));
      uint cq = cellAt(q); float s2, e2;
      acc += baseColor(cq, q, vec2(q), s2, e2);
      em += cellEmit(cq, q, vec2(q));
    }
    col = acc * 0.25;
    lit = col * (uAmb + uSunCol * max(uSunDir.z, 0.0) * 0.8 + L) + em * 0.25;
  } else {
    // relief normal from the four neighbours (visual only: no rule reads relief)
    float r0 = reliefOf(c, p);
    float rE = reliefOf(cellAt(p + ivec2(1, 0)), p + ivec2(1, 0));
    float rW = reliefOf(cellAt(p - ivec2(1, 0)), p - ivec2(1, 0));
    float rS = reliefOf(cellAt(p + ivec2(0, 1)), p + ivec2(0, 1));
    float rN = reliefOf(cellAt(p - ivec2(0, 1)), p - ivec2(0, 1));
    vec3 n = normalize(vec3((rW - rE) * 2.4, (rN - rS) * 2.4, 1.0));
    // a wall is a smooth raised band: its normal comes from the wall field, not from the stair-stepped cells
    float wInfo;
    if (wallCellAt(c, p, sh, wInfo)) {
      float d0 = wallDist(w);
      vec2 gr = vec2(wallDist(w + vec2(0.35, 0.0)) - wallDist(w - vec2(0.35, 0.0)), wallDist(w + vec2(0.0, 0.35)) - wallDist(w - vec2(0.0, 0.35)));
      float sl = smoothstep(uWallW * 0.3, uWallW, d0) * (wInfo > 250.0 ? 0.6 : 2.2);
      n = normalize(vec3(gr * sl * 1.4, 1.0));
    }
    // short soft shadow: is the ground toward the sun higher than the line to it?
    float shadow = 1.0, occl = 0.0;
    if (uSunDir.z > 0.02) {
      vec2 sd = normalize(uSunDir.xy + 1e-5);
      float tanE = uSunDir.z / max(0.05, length(uSunDir.xy));
      for (int k = 1; k <= 4; k++) {
        float dist = float(k) * 1.5;
        ivec2 q = p + ivec2(round(sd * dist));
        uint cq = cellAt(q);
        float rq = reliefOf(cq, q);
        // a cliff is far taller than its relief byte says: it throws a long shadow onto the low ground
        float tall = ((cq >> 24u) & F_EDGE) != 0u ? 7.5 : 3.0;
        float above = rq * tall - r0 * 3.0 - dist * tanE;
        shadow = min(shadow, 1.0 - clamp(above * 1.6, 0.0, 0.62));
        // under a cliff the sky is blocked too: the low ground beside it sits in a deep band of shade
        if (tall > 4.0) occl = max(occl, clamp(above * 0.22, 0.0, 0.5));
      }
    }
    float lam = max(dot(n, uSunDir), 0.0);
    // ambient occlusion: lower than its neighbours → darker
    float ao = 1.0 - clamp(((rE + rW + rS + rN) * 0.25 - r0) * 1.4, 0.0, 0.35);
    // emitter light: brighter on the side of a raised pixel that faces the light (light gradient)
    float gx = dot(lightAt(w + vec2(1.6, 0.5)) - lightAt(w + vec2(-0.6, 0.5)), vec3(0.33));
    float gy = dot(lightAt(w + vec2(0.5, 1.6)) - lightAt(w + vec2(0.5, -0.6)), vec3(0.33));
    vec2 gd = vec2(gx, gy);
    float gl = length(gd);
    float facing = gl > 1e-4 ? dot(n.xy, gd / gl) : 0.0;
    float tall = 0.75 + 0.6 * r0;
    vec3 emitLight = L * tall * (0.8 + 1.9 * facing * min(1.0, length(n.xy) * 2.5));
    vec3 light = (uAmb * ao + uSunCol * lam * shadow) * (1.0 - occl) + max(emitLight, vec3(0.0));
    // water (a bridge deck over it is lit like ground)
    bool deck = (fl & F_BRIDGE) != 0u && roadDist(w) < uRoadW + 0.3;
    if (!deck && (sh == SH_SHALLOW || sh == SH_DEEP)) {
      // slow swell + fine ripples; glints are thin bands, not foam
      float swell = vnoise(w * 0.05 + vec2(uTime * 0.06, uTime * 0.03), 21u);
      float rip = vnoise(vec2(w.x * 0.35 + uTime * 0.5, w.y * 0.9 - uTime * 0.2), 22u);
      float rip2 = vnoise(vec2(w.x * 0.8 - uTime * 0.3, w.y * 0.4 + uTime * 0.6), 23u);
      float band = abs(rip - rip2);
      float glint = smoothstep(0.035, 0.0, band) * smoothstep(0.35, 0.75, swell);
      col *= 0.9 + 0.18 * swell;
      vec3 refl = lightAt(w + vec2(0.5, 3.5 + 2.0 * rip)) * (sh == SH_DEEP ? 1.5 : 1.0);
      light = uAmb + uSunCol * (0.55 + 0.45 * uSunDir.z) + L * 0.6;
      // glints brighten the water's own colour (deep stays navy, shallow stays teal), plus a touch of sun
      lit = col * light * (1.0 + 0.85 * glint) + uSky * 0.04 * swell + refl * (0.45 + 0.6 * glint) + uSunCol * 0.06 * glint;
    } else if (sh == SH_ICE) {
      lit = col * (uAmb + uSunCol * (0.5 + 0.5 * lam) + L * 0.9) + uSunCol * pow(max(dot(reflect(-uSunDir, n), vec3(0, 0, 1)), 0.0), 8.0) * 0.25;
    } else {
      lit = col * light;
    }
    if ((fl & F_WET) != 0u) lit += uSky * 0.04 + L * 0.12;
    lit += cellEmit(c, p, w);
  }
  // gas over everything
  vec2 guv = w / uWorld;
  float gd = texture(uGas, guv).r;
  if (gd > 0.003) {
    uint kind = uint(texelFetch(uGas, ivec2(w * 0.25), 0).g * 255.0 + 0.5);
    vec3 gc = kind == 2u ? vec3(0.86, 0.9, 0.93) : kind == 3u ? vec3(0.5, 0.46, 0.41) : vec3(0.3, 0.29, 0.28);
    vec2 drift = uWind * uTime * 1.6;
    float wisp = vnoise(w * 0.07 - drift, 31u) * 0.55 + vnoise(w * 0.19 - drift * 1.7, 32u) * 0.3 + vnoise(w * 0.5 - drift * 2.4, 33u) * 0.15;
    wisp = smoothstep(0.2, 0.85, wisp) * 1.7;
    float a = 1.0 - exp(-gd * (kind == 2u ? 2.6 : 2.4) * wisp);
    vec3 glit = gc * (uAmb * 1.1 + uSunCol * max(uSunDir.z, 0.0) * 0.9 + L * 1.4);
    lit = mix(lit, glit, clamp(a, 0.0, 0.96));
  }
  // filters (the Filter selector): ORE lifts ore out of a dimmed grey world; FLOW greys the world under the
  // logistics layer the overlay draws (roads stay bright); THREAT dims it for M4's contours
  if (uFilter != 0) {
    float l = dot(lit, vec3(0.3, 0.59, 0.11));
    vec3 grey = vec3(l) * vec3(0.62, 0.7, 0.66);
    uint m0 = c & 255u;
    float shm = shadeOf(m0);
    if (uFilter == 1) {
      bool ore = shm == SH_ORE || shm == SH_CRYSTAL;
      lit = ore ? lit * 1.35 + matRow(m0, 0).rgb * 0.35 : grey * 0.62;
    } else if (uFilter == 2) {
      float rd = roadDist(w);
      float rc = 1.0 - smoothstep(uRoadW - 0.4, uRoadW + 0.4, rd);
      lit = mix(grey * 0.62, vec3(1.0, 0.78, 0.42) * (0.55 + 0.45 * l), rc * 0.85);
    } else {
      lit = grey * 0.55;
    }
  }
  if (uFogOn == 1) {
    float f = texture(uFog, guv).r * 255.0;
    if (f < 0.5) {
      float s = h21(ivec2(px), uint(uTime * 30.0));
      lit = vec3(0.05 + 0.08 * s);
    } else if (f < 1.5) {
      float l = dot(lit, vec3(0.3, 0.59, 0.11));
      lit = vec3(l) * vec3(0.55, 0.62, 0.58) * 0.6;
    }
  }
  lit += vec3(uFlash);
  outColor = vec4(lit, 1.0);
}
`;

// Emitter pass: one texel per `div` x `div` cells over the light rect; averages the cells' emission.
export const EMIT_FS = `#version 300 es
${COMMON}
uniform vec4 uLightRect;
uniform vec2 uLightRes;
uniform float uInvScale;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uLightRes;
  vec2 cellsPer = uLightRect.zw / uLightRes;
  vec2 w0 = uLightRect.xy + (gl_FragCoord.xy - 0.5) * cellsPer;
  vec3 e = vec3(0.0);
  float n = 0.0;
  int k = int(clamp(ceil(cellsPer.x), 1.0, 3.0));
  for (int y = 0; y < 3; y++) for (int x = 0; x < 3; x++) {
    if (x >= k || y >= k) continue;
    vec2 w = w0 + (vec2(float(x), float(y)) + 0.5) * cellsPer / float(k);
    if (w.x < 0.0 || w.y < 0.0 || w.x >= uWorld.x || w.y >= uWorld.y) { n += 1.0; continue; }
    ivec2 p = ivec2(floor(w));
    e += cellEmit(cellAt(p), p, w);
    n += 1.0;
  }
  outColor = vec4(e / n * uInvScale, 1.0);
}
`;

// Point emitters (hot debris, blast flashes, lightning) splatted into the light buffer, and debris
// drawn into the scene. a: [x, y, size, kind] in world cells; b: [r, g, b, intensity].
export const POINT_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
uniform vec2 uOrigin;   // world top-left of the target
uniform vec2 uSpan;     // world size of the target
uniform float uPxPerCell;
uniform float uFlip;    // -1: target shows world top at the top (scene); 1: world top in row 0 (light buffer)
out vec4 vB;
out float vKind;
void main() {
  vec2 ndc = (aA.xy - uOrigin) / uSpan * 2.0 - 1.0;
  ndc.y *= -uFlip;
  gl_Position = vec4(ndc, 0.0, 1.0);
  gl_PointSize = max(1.0, aA.z * uPxPerCell);
  vB = aB;
  vKind = aA.w;
}`;
export const POINT_FS = `#version 300 es
precision highp float;
in vec4 vB;
in float vKind;
uniform float uScale;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (vKind > 0.5) {
    // soft disc (light splat)
    if (r2 > 1.0) discard;
    float f = (1.0 - r2);
    outColor = vec4(vB.rgb * vB.a * f * f * uScale, 1.0);
  } else {
    // hard pixel (debris body / shadow) with alpha
    outColor = vec4(vB.rgb * uScale, vB.a);
  }
}`;
