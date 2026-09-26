// GLSL ES 3.00 programs for the WebGL2 pipeline (docs/06 §16). Coordinates: every view-sized target has
// p.y = 0 at the BOTTOM of the screen; world y grows downward, so world = cam0 + (p.x, TH-1-p.y).
// Cell data is read with texelFetch at integer world coordinates.

export const FULL_VS = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

const COMMON = `
precision highp float; precision highp int;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float hash1(float x){ return fract(sin(x*127.1)*43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
`;

// --- scene: albedo + emission (MRT) -------------------------------------------------------------
export const SCENE_FS = `#version 300 es
${COMMON}
uniform highp usampler2D cells;   // R mat, G shade, B flags, A glow
uniform highp usampler2D bgTex;   // R background material
uniform sampler2D palette;        // 8 x 64 ramps
uniform sampler2D matInfo;        // 64 x 1: r alpha, g transmit, b emissive power, a ramp length/8
uniform vec2 cam0; uniform vec2 target; uniform vec2 roomSize; uniform float time;
uniform vec3 skyTop; uniform vec3 skyBot; uniform vec3 silCol; uniform float wind; uniform float rainAlpha;
uniform vec2 camF;               // camera float position (for parallax)
layout(location=0) out vec4 albedo; layout(location=1) out vec4 emis;
vec3 ramp(uint m, uint s){ float len = texelFetch(matInfo, ivec2(int(m),0),0).a*8.0; float st = mod(float(s & 7u), max(1.0,len));
  return texelFetch(palette, ivec2(int(st), int(m)), 0).rgb; }
float skyline(float x, float seed, float scale, float hmin, float hmax){ float cx = floor(x/scale); float h = mix(hmin,hmax,hash1(cx*1.7+seed));
  float w = hash1(cx*3.1+seed); if(w<0.25) h*=0.4; float spire = step(0.85,hash1(cx*5.3+seed)) * step(abs(fract(x/scale)-0.5),0.12)*scale*1.2; return h+spire; }
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy); ivec2 w = ivec2(cam0) + ivec2(p.x, int(target.y)-1-p.y);
  vec3 col = vec3(0); vec3 em = vec3(0); float marker = 0.0;
  bool inside = w.x>=0 && w.y>=0 && float(w.x)<roomSize.x && float(w.y)<roomSize.y;
  uvec4 c = inside ? texelFetch(cells, w, 0) : uvec4(1u, 0u, 0u, 0u);
  uint m = c.r;
  vec4 info = texelFetch(matInfo, ivec2(int(m),0), 0);
  // background: wall or sky with parallax city
  vec3 back;
  uint bgm = inside ? texelFetch(bgTex, w, 0).r : 1u;
  if (bgm != 0u) { float bn = vnoise(vec2(w)*0.11)*0.7 + vnoise(vec2(w)*0.37)*0.3; back = ramp(bgm, uint(bn*5.0)) * (0.42 + 0.16*bn); // mortar lines on brick walls
    if (bgm == 3u) { float by = mod(float(w.y), 4.0); float bx = mod(float(w.x) + (mod(floor(float(w.y)/4.0),2.0)*4.0), 8.0); if (by < 0.9 || bx < 0.9) back *= 0.7; }
  } else {
    float sy = float(w.y)/max(1.0,roomSize.y); back = mix(skyTop, skyBot, clamp(sy,0.0,1.0));
    // three parallax layers of distant city/chasm silhouette
    for (int L=0; L<3; L++){ float f = L==0?0.15:(L==1?0.35:0.6); float fl=float(L);
      float x = float(p.x) + camF.x*f + fl*1000.0; float baseY = target.y*(0.25+fl*0.18) + (camF.y*f*0.3);
      float h = skyline(x, fl*17.0, 10.0+fl*6.0, 20.0+fl*10.0, 70.0+fl*30.0);
      float yUp = float(p.y) + camF.y*0.0; if (float(p.y) < baseY + h - target.y*0.2) { back = mix(back, silCol*(0.35+fl*0.25), 0.85);
        // lit windows
        float wx = floor(x/3.0), wy = floor(float(p.y)/4.0); if (hash(vec2(wx,wy)+fl) > 0.985 && mod(x,3.0)<1.5) em += vec3(1.0,0.7,0.35)*0.25*(1.0-fl*0.3); } }
    // far rain streaks
    if (rainAlpha > 0.0) { for (int R=0; R<2; R++){ float sp = R==0?380.0:260.0; float a = R==0?1.0:0.6;
      vec2 q = vec2(float(p.x) + (float(p.y))*wind*0.25 + float(R)*37.0, float(p.y) + time*sp);
      vec2 cell = floor(q/vec2(3.0,40.0)); float h1 = hash(cell+float(R)*9.0); float yin = fract(q.y/40.0);
      if (h1 > 0.93 && mod(q.x,3.0)<1.0 && yin < 0.08) back += vec3(0.55,0.62,0.75)*0.12*a*rainAlpha; } }
    marker = 0.1; // sky
  }
  if (m == 0u) { col = back; }
  else {
    vec3 a = ramp(m, c.g);
    float grain = (float(c.g >> 3u)/31.0 - 0.5)*0.08; a *= 1.0 + grain;
    if (m == 3u) { float by = mod(float(w.y), 4.0); float bx = mod(float(w.x) + (mod(floor(float(w.y)/4.0),2.0)*4.0), 8.0); if (by < 0.9 || bx < 0.9) a *= 0.72; }
    if (m == 7u) { if (mod(float(w.x), 12.0) < 0.9) a *= 0.8; }
    float alpha = info.r;
    col = mix(back, a, alpha);
    // emission: emissive materials, heat glow, burning, shock
    float ep = info.b; if (ep > 0.0) em += a * ep * 2.0;
    if (m == 32u || m == 33u) em += a * (0.8 + 0.4*hash(vec2(w)+time));
    float glow = float(c.a)/255.0; if (glow > 0.0) em += mix(vec3(1.0,0.23,0.04), vec3(1.0,0.82,0.44), glow)*glow*1.6;
    if ((c.b & 1u) != 0u) em += vec3(1.0,0.45,0.1)*(0.5+0.5*hash(vec2(w)+floor(time*12.0)));  // burning
    if ((c.b & 4u) != 0u) em += vec3(1.0,0.95,0.5)*(0.3+0.7*step(0.7,hash(vec2(w)+floor(time*30.0))));  // shock
    if (m >= 22u && m <= 28u) marker = 0.5; else marker = (alpha < 0.99) ? 0.3 : 1.0;
  }
  albedo = vec4(col, marker); emis = vec4(em, 1.0);
}`;

// --- sprite / particle batch (instanced quads) -------------------------------------------------------
export const BATCH_VS = `#version 300 es
in vec2 a; in vec4 dst; in vec4 src; in vec4 tint; in vec2 extra; // extra.x emissive, extra.y flipX
uniform vec2 cam0; uniform vec2 target; uniform vec2 atlasSize;
out vec2 uv; out vec4 vt; out float ve;
void main(){ vec2 q = a*0.5+0.5; vec2 wp = dst.xy + vec2(q.x, 1.0-q.y)*dst.zw;
  vec2 sp = wp - cam0; gl_Position = vec4(sp.x/target.x*2.0-1.0, 1.0 - sp.y/target.y*2.0, 0.0, 1.0);
  float u = extra.y > 0.5 ? (1.0-q.x) : q.x; uv = (src.xy + vec2(u, 1.0-q.y)*src.zw)/atlasSize; vt = tint; ve = extra.x; }`;
export const BATCH_FS = `#version 300 es
precision highp float; uniform sampler2D atlas; in vec2 uv; in vec4 vt; in float ve;
layout(location=0) out vec4 albedo; layout(location=1) out vec4 emis;
void main(){ vec4 t = texture(atlas, uv); vec4 c = t*vt; if (c.a < 0.01) discard;
  // the atlas alpha channel is 1 for normal pixels; magenta-marked emissive pixels store b=1,a=0.999
  float e = ve + (t.a > 0.995 && t.a < 0.9995 ? 1.0 : 0.0);
  albedo = vec4(c.rgb, 1.0); emis = vec4(c.rgb*e*1.5, 1.0); }`;
// plain alpha blending onto the lit image (overlays that ignore light)
export const OVERLAY_FS = `#version 300 es
precision highp float; uniform sampler2D atlas; in vec2 uv; in vec4 vt; in float ve; out vec4 o;
void main(){ vec4 t = texture(atlas, uv); vec4 c = t*vt; if (c.a < 0.01) discard; o = vec4(c.rgb*(1.0+ve), c.a); }`;

// --- light map: occlusion march for shadowed lights + flat lights + blurred emission ----------------
export const LIGHT_FS = `#version 300 es
${COMMON}
uniform highp usampler2D cells; uniform sampler2D matInfo; uniform sampler2D lights; uniform int nLights;
uniform sampler2D emisBlur; uniform vec2 cam0; uniform vec2 target; uniform vec2 lsize; uniform vec2 roomSize;
uniform vec3 ambTop; uniform vec3 ambBot; uniform float margin;
out vec4 o;
float trans(vec2 wpos){ ivec2 w = ivec2(floor(wpos)); if (w.x<0||w.y<0||float(w.x)>=roomSize.x||float(w.y)>=roomSize.y) return 0.0;
  uint m = texelFetch(cells, w, 0).r; return texelFetch(matInfo, ivec2(int(m),0),0).g; }
void main(){
  vec2 p = gl_FragCoord.xy - 0.5; // light texel
  vec2 wpos = cam0 - vec2(margin) + vec2(p.x*2.0+1.0, (lsize.y-1.0-p.y)*2.0+1.0);
  float sy = clamp((wpos.y - cam0.y)/target.y, 0.0, 1.0);
  vec3 acc = mix(ambTop, ambBot, sy);
  for (int k=0; k<128; k++){ if (k>=nLights) break;
    vec4 L = texelFetch(lights, ivec2(k,0), 0); vec4 C = texelFetch(lights, ivec2(k,1), 0); vec4 X = texelFetch(lights, ivec2(k,2), 0);
    vec2 d = wpos - L.xy; float dist = length(d); if (dist > L.z) continue;
    float t = dist/L.z; float fall = (1.0-t*t); fall *= fall;
    if (X.z > 0.0) { // cone
      float cosA = dot(normalize(d+1e-4), X.xy); fall *= smoothstep(cos(X.z), cos(X.z*0.7), cosA); }
    float tr = 1.0;
    if (X.w > 0.5 && dist > 2.0) { // shadowed: march from texel toward light
      float steps = min(32.0, ceil(dist/1.5)); float solidRun = 0.0;
      for (float s=0.0; s<32.0; s+=1.0){ if (s>=steps) break; vec2 q = wpos - d*(s/steps);
        float tt = trans(q); if (tt < 0.05) { solidRun += dist/steps; if (solidRun > 2.5) { tr *= tt; } } else { tr *= mix(1.0, tt, 0.85); }
        if (tr < 0.02) break; } }
    acc += C.rgb * C.a * fall * tr;
  }
  // blurred emission as local glow
  acc += texture(emisBlur, (p+0.5)/lsize).rgb * 0.9;
  o = vec4(acc, 1.0);
}`;

export const DOWN_FS = `#version 300 es
precision highp float; uniform sampler2D src; uniform vec2 srcSize; uniform vec2 dstSize; uniform vec2 offset; uniform float threshold; out vec4 o;
void main(){ vec2 uv = (gl_FragCoord.xy*2.0 + offset) / srcSize; vec2 t = 1.0/srcSize;
  vec3 c = texture(src, uv).rgb*4.0 + texture(src, uv+vec2(t.x,t.y)).rgb + texture(src, uv-vec2(t.x,t.y)).rgb + texture(src, uv+vec2(t.x,-t.y)).rgb + texture(src, uv+vec2(-t.x,t.y)).rgb; c/=8.0;
  if (threshold > 0.0) { float l = max(c.r,max(c.g,c.b)); float k = clamp((l-threshold+0.2)/0.4, 0.0, 1.0); c *= k*k; }
  o = vec4(c,1.0); }`;
export const BLUR_FS = `#version 300 es
precision highp float; uniform sampler2D src; uniform vec2 size; uniform vec2 dir; out vec4 o;
void main(){ vec2 uv = gl_FragCoord.xy/size; vec2 t = dir/size; vec3 c = texture(src,uv).rgb*0.227;
  c += (texture(src,uv+t*1.38).rgb + texture(src,uv-t*1.38).rgb)*0.316; c += (texture(src,uv+t*3.23).rgb + texture(src,uv-t*3.23).rgb)*0.07; o = vec4(c,1.0); }`;
export const UP_FS = `#version 300 es
precision highp float; uniform sampler2D src; uniform sampler2D base; uniform vec2 size; out vec4 o;
void main(){ vec2 uv = gl_FragCoord.xy/size; o = vec4(texture(src,uv).rgb + texture(base,uv).rgb, 1.0); }`;

// --- composite: albedo x light + emission, wet sheen ----------------------------------------------
export const COMPOSITE_FS = `#version 300 es
${COMMON}
uniform sampler2D albedoT; uniform sampler2D emisT; uniform sampler2D lightT; uniform highp usampler2D cells;
uniform vec2 cam0; uniform vec2 target; uniform vec2 lsize; uniform float margin; uniform float floorL; uniform float time; uniform vec2 roomSize; uniform float gain;
out vec4 o;
void main(){ ivec2 p = ivec2(gl_FragCoord.xy); vec4 a = texelFetch(albedoT, p, 0); vec3 e = texelFetch(emisT, p, 0).rgb;
  vec2 lp = (vec2(p) + 0.5 + vec2(margin, margin)) / 2.0; vec3 L = texture(lightT, lp/lsize).rgb * gain;
  vec3 lit = a.rgb * (L + floorL) + e;
  // wet sheen on solids whose flags carry WET, on top faces
  ivec2 w = ivec2(cam0) + ivec2(p.x, int(target.y)-1-p.y);
  if (w.x>=0 && w.y>1 && float(w.x)<roomSize.x && float(w.y)<roomSize.y) { uvec4 c = texelFetch(cells, w, 0);
    if ((c.b & 2u) != 0u && a.a > 0.9) { bool top = false; for (int k=1;k<=3;k++){ if (texelFetch(cells, w-ivec2(0,k),0).r == 0u) top = true; }
      float lum = dot(L, vec3(0.33)); float n = 0.35+0.65*vnoise(vec2(w)*0.3 + time*0.2);
      if (top) lit += L * 0.45 * n; else lit += L*0.12*n;
      if (top && lum > 0.5 && hash(vec2(w) + floor(time*8.0)) > 0.992) lit += L*1.5; } }
  o = vec4(lit, a.a);
}`;

// --- water: reflections + transmission + ripples + glints ----------------------------------------
export const WATER_FS = `#version 300 es
${COMMON}
uniform sampler2D litT; uniform sampler2D lightT; uniform highp usampler2D cells; uniform sampler2D ripple; uniform sampler2D matInfo;
uniform vec2 cam0; uniform vec2 target; uniform vec2 lsize; uniform float margin; uniform float time; uniform vec2 roomSize;
out vec4 o;
bool isLiquid(ivec2 w){ if (w.x<0||w.y<0||float(w.x)>=roomSize.x||float(w.y)>=roomSize.y) return false; uint m = texelFetch(cells,w,0).r; return m>=22u && m<=28u; }
void main(){ ivec2 p = ivec2(gl_FragCoord.xy); vec4 base = texelFetch(litT, p, 0);
  if (base.a < 0.45 || base.a > 0.55) { o = vec4(base.rgb,1.0); return; }
  ivec2 w = ivec2(cam0) + ivec2(p.x, int(target.y)-1-p.y);
  uint m = texelFetch(cells, w, 0).r; float depth = 0.0; bool found = false;
  for (int s=1; s<=64; s++){ if (!isLiquid(w - ivec2(0,s))) { depth = float(s-1); found = true; break; } }
  if (!found) depth = 64.0;
  float rh = texelFetch(ripple, ivec2(p.x,0), 0).r;
  float reflectivity = m==22u ? 0.55 : (m==23u ? 0.7 : (m==25u ? 0.35 : (m==27u ? 0.2 : 0.0)));
  float refl = reflectivity * (1.0 - smoothstep(0.0, 26.0, depth));
  // mirror about the surface line (in target rows: surface is 'depth' rows above p)
  float surfY = float(p.y) + depth + 1.0;          // target row of the first non-liquid texel above
  float ry = surfY + depth + rh*2.0;                 // mirrored row
  float rx = float(p.x) + rh*3.0 + sin(time*1.3 + depth*0.4)*0.6;
  vec3 col = base.rgb;
  if (ry < target.y - 1.0) { vec3 rc = texture(litT, vec2(rx+0.5, ry+0.5)/target).rgb; float fade = clamp((target.y - ry)/16.0, 0.0, 1.0);
    col = mix(col*exp(-depth*0.02), rc, refl*fade); }
  if (m == 23u) { float hue = fract(float(w.x)*0.02 + time*0.05); col += (0.5+0.5*cos(6.2831*(hue+vec3(0.0,0.33,0.67))))*0.12*(1.0-smoothstep(0.0,6.0,depth)); }
  vec2 lp = (vec2(p) + 0.5 + vec2(margin)) / 2.0; vec3 L = texture(lightT, lp/lsize).rgb;
  if (depth < 1.0) { col += L*0.55; if (dot(L,vec3(0.33))>0.45 && hash(vec2(w.x, floor(time*8.0)))>0.97) col += L*1.4; }
  o = vec4(col, 1.0);
}`;

// --- final: bloom add, tone map, grade, vignette -------------------------------------------------------
export const FINAL_FS = `#version 300 es
precision highp float; uniform sampler2D img; uniform sampler2D bloom; uniform vec2 target; uniform float bloomStrength;
uniform vec3 lift; uniform vec3 gamma; uniform vec3 gain; uniform float vignette; uniform vec2 outSize; uniform vec2 outOffset; uniform float scale;
uniform float flash; uniform vec3 flashCol; out vec4 o;
void main(){ vec2 sp = (gl_FragCoord.xy - outOffset)/scale; ivec2 p = ivec2(floor(sp)); vec3 c = texelFetch(img, p, 0).rgb;
  c += texture(bloom, (vec2(p)+0.5)/target).rgb * bloomStrength;
  float l = max(max(c.r,c.g),c.b); c = c / (1.0 + max(0.0, l-0.8)*0.6);   // soft shoulder
  c = pow(max(c*gain + lift, 0.0), 1.0/gamma);
  vec2 uv = sp/target - 0.5; c *= 1.0 - vignette*dot(uv,uv)*2.0;
  c = mix(c, flashCol, flash);
  o = vec4(c, 1.0); }`;
