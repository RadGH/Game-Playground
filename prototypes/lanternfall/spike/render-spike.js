// SPIKE: WebGL2 renderer: CPU writes view RGBA (colour + class in alpha), GPU does light (half res,
// raymarched occlusion), reflections on liquid, then integer upscale.
const VS = `#version 300 es
in vec2 p; out vec2 uv; void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0,1); }`;
const LIGHT_FS = `#version 300 es
precision highp float; in vec2 uv; out vec4 o;
uniform sampler2D scene; uniform vec2 view; uniform int nl; uniform vec4 L[32]; uniform vec3 C[32];
void main(){ vec2 px = uv*view; vec3 acc = vec3(0);
 for(int k=0;k<32;k++){ if(k>=nl) break; vec2 lp=L[k].xy; float r=L[k].z; vec2 d=px-lp; float dist=length(d); if(dist>r) continue;
  float occ=1.0; for(int s=1;s<20;s++){ vec2 q = lp + d*(float(s)/20.0); float a = texture(scene, q/view).a; if(a>0.3 && a<0.6) occ -= 0.12; }
  occ=max(occ,0.0); float f = 1.0 - dist/r; acc += C[k]*L[k].w*f*f*occ; }
 o = vec4(acc,1); }`;
const COMP_FS = `#version 300 es
precision highp float; in vec2 uv; out vec4 o;
uniform sampler2D scene; uniform sampler2D light; uniform vec2 view; uniform float time; uniform vec3 amb;
vec3 lit(vec2 u){ vec4 c = texture(scene,u); vec3 l = texture(light,u).rgb; return c.rgb*(amb + l) + c.rgb*step(0.9,c.a)*1.5; }
void main(){ vec2 px = uv*view; vec4 c = texture(scene, uv); vec3 col = lit(uv);
 // liquid (alpha ~0.75): find the surface above and mirror
 if(c.a>0.6 && c.a<0.9){ float sy=-1.0; for(int s=1;s<64;s++){ vec2 q=px+vec2(0,float(s)); if(q.y>=view.y) break; float a=texture(scene,q/view).a; if(a<0.6||a>0.9){ sy=q.y; break; } }
  if(sy>0.0){ float depth = sy-px.y; float rip = sin(px.x*0.35 + time*3.0 + depth*0.6)*1.2; vec2 r = vec2(px.x + rip, sy + depth + 0.5);
   if(r.y<view.y){ vec3 rc = lit(r/view); float fres = clamp(1.0 - depth/40.0, 0.0, 1.0)*0.65; col = mix(col, rc, fres); } } }
 o = vec4(col,1); }`;
const BLIT_FS = `#version 300 es
precision highp float; in vec2 uv; out vec4 o; uniform sampler2D src; void main(){ o = texture(src, uv); }`;
function prog(gl, fs) { const p = gl.createProgram(); for (const [t, s] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); gl.attachShader(p, sh); } gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }
function tex(gl, w, h, filter) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
function fbo(gl, t) { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return f; }
export class GLRender {
  constructor(canvas, vw, vh) {
    const gl = this.gl = canvas.getContext('webgl2', { antialias: false }); this.vw = vw; this.vh = vh;
    this.pix = new Uint8Array(vw * vh * 4);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.pL = prog(gl, LIGHT_FS); this.pC = prog(gl, COMP_FS); this.pB = prog(gl, BLIT_FS);
    this.tScene = tex(gl, vw, vh, gl.NEAREST); this.tLight = tex(gl, vw >> 1, vh >> 1, gl.LINEAR); this.fLight = fbo(gl, this.tLight);
    this.tOut = tex(gl, vw, vh, gl.NEAREST); this.fOut = fbo(gl, this.tOut);
    for (const p of [this.pL, this.pC, this.pB]) { const a = gl.getAttribLocation(p, 'p'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0); }
  }
  u(p, n) { return this.gl.getUniformLocation(p, n); }
  draw(lights, time, sw, sh) {
    const gl = this.gl, vw = this.vw, vh = this.vh;
    gl.bindTexture(gl.TEXTURE_2D, this.tScene); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, vw, vh, gl.RGBA, gl.UNSIGNED_BYTE, this.pix);
    // light pass
    gl.useProgram(this.pL); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fLight); gl.viewport(0, 0, vw >> 1, vh >> 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tScene); gl.uniform1i(this.u(this.pL, 'scene'), 0);
    gl.uniform2f(this.u(this.pL, 'view'), vw, vh); gl.uniform1i(this.u(this.pL, 'nl'), lights.length);
    const Lf = new Float32Array(128), Cf = new Float32Array(96); lights.forEach((l, k) => { Lf.set([l.x, l.y, l.r, l.i], k * 4); Cf.set(l.c, k * 3); });
    gl.uniform4fv(this.u(this.pL, 'L'), Lf); gl.uniform3fv(this.u(this.pL, 'C'), Cf);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // composite
    gl.useProgram(this.pC); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fOut); gl.viewport(0, 0, vw, vh);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tScene); gl.uniform1i(this.u(this.pC, 'scene'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tLight); gl.uniform1i(this.u(this.pC, 'light'), 1);
    gl.uniform2f(this.u(this.pC, 'view'), vw, vh); gl.uniform1f(this.u(this.pC, 'time'), time); gl.uniform3f(this.u(this.pC, 'amb'), 0.28, 0.32, 0.4);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // blit
    gl.useProgram(this.pB); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, sw, sh);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tOut); gl.uniform1i(this.u(this.pB, 'src'), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
