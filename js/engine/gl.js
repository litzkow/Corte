// Compositor em WebGL2: reenquadra, aplica zoom/tremor, transições e a cor (com proteção de pele).
import { LOOKS } from './styles.js';

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;

const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D uA, uB;
uniform vec4 uCropA, uCropB;      // x0,y0,w,h em UV da fonte
uniform float uFitA, uFitB;       // 1 = imagem inteira sobre fundo desfocado
uniform vec4 uFitRectA, uFitRectB;// onde a imagem inteira fica na saída (x0,y0,w,h)
uniform float uHasB, uMix; uniform int uTrans;
uniform vec2 uShake; uniform float uFlash;
uniform float uExpA, uExpB;       // correção automática de exposição por corte (stops)
uniform float uExposure, uContrast, uSat, uTemp, uTint, uFade, uVignette, uGrain, uIntensity, uSkin, uTime;
uniform vec3 uLift, uGamma, uGain;
uniform float uLetterbox, uLeak; uniform vec2 uRes;

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }

vec3 rawSample(sampler2D t, vec4 crop, vec2 q, float lod){
  q = clamp(q, 0.0, 1.0);
  return textureLod(t, crop.xy + q*crop.zw, lod).rgb;
}
vec3 clipSample(sampler2D t, vec4 crop, float fit, vec4 fr, vec2 q){
  if (fit < 0.5) return rawSample(t, crop, q, 0.0);
  // fundo: mesma imagem ampliada e desfocada (mipmap) e escurecida
  vec3 bg = rawSample(t, crop, q, 5.0) * 0.55;
  vec2 f = (q - fr.xy) / fr.zw;
  if (f.x < 0.0 || f.y < 0.0 || f.x > 1.0 || f.y > 1.0) return bg;
  return textureLod(t, f, 0.0).rgb;
}
vec3 sampA(vec2 q){ return clipSample(uA, uCropA, uFitA, uFitRectA, q) * exp2(uExpA); }
vec3 sampB(vec2 q){ return clipSample(uB, uCropB, uFitB, uFitRectB, q) * exp2(uExpB); }

vec3 blurA(vec2 q, vec2 dir){ vec3 s=vec3(0); for(int i=-6;i<=6;i++){ s+=sampA(q+dir*float(i)/6.0); } return s/13.0; }
vec3 blurB(vec2 q, vec2 dir){ vec3 s=vec3(0); for(int i=-6;i<=6;i++){ s+=sampB(q+dir*float(i)/6.0); } return s/13.0; }
vec3 radA(vec2 q, float k){ vec3 s=vec3(0); for(int i=0;i<10;i++){ float z=1.0-k*float(i)/10.0; s+=sampA((q-0.5)*z+0.5);} return s/10.0; }
vec3 radB(vec2 q, float k){ vec3 s=vec3(0); for(int i=0;i<10;i++){ float z=1.0-k*float(i)/10.0; s+=sampB((q-0.5)*z+0.5);} return s/10.0; }

vec3 composite(vec2 q){
  if (uHasB < 0.5) return sampA(q);
  float p = uMix;
  if (uTrans == 1) return mix(sampA(q), sampB(q), smoothstep(0.0,1.0,p));                       // dissolve
  if (uTrans == 2) return p < 0.5 ? sampA(q)*(1.0-p*2.0) : sampB(q)*(p*2.0-1.0);                   // mergulho no preto
  if (uTrans == 3) return p < 0.5 ? sampA(q) : sampB(q);                                           // flash (o branco vem depois)
  if (uTrans == 4) {                                                                               // chicote (whip pan)
    float e = p < 0.5 ? p*2.0 : (1.0-p)*2.0; float k = e*e*0.35;
    if (p < 0.5) return blurA(q + vec2(e*e*0.6, 0.0), vec2(k, 0.0));
    return blurB(q - vec2(e*e*0.6, 0.0), vec2(k, 0.0));
  }
  if (uTrans == 5) {                                                                               // zoom
    float e = p < 0.5 ? p*2.0 : (1.0-p)*2.0;
    if (p < 0.5) return radA((q-0.5)/(1.0+e*0.6)+0.5, e*0.25);
    return radB((q-0.5)/(1.0+e*0.6)+0.5, e*0.25);
  }
  if (uTrans == 6) {                                                                               // glitch
    float e = 1.0 - abs(p-0.5)*2.0;
    float row = floor(q.y*24.0); float off = (hash(vec2(row, floor(uTime*30.0)))-0.5)*0.12*e;
    vec2 qq = q + vec2(off, 0.0);
    vec3 a = p < 0.5 ? sampA(qq) : sampB(qq);
    vec3 r = p < 0.5 ? sampA(qq+vec2(0.012*e,0)) : sampB(qq+vec2(0.012*e,0));
    vec3 b = p < 0.5 ? sampA(qq-vec2(0.012*e,0)) : sampB(qq-vec2(0.012*e,0));
    return vec3(r.r, a.g, b.b);
  }
  return p < 0.5 ? sampA(q) : sampB(q);
}

vec3 grade(vec3 c){
  vec3 orig = c;
  c *= exp2(uExposure);
  c *= vec3(1.0 + uTemp*0.6 + uTint*0.1, 1.0 - uTint*0.35, 1.0 - uTemp*0.6 + uTint*0.1); // balanço de branco
  c = clamp(c, 0.0, 4.0);
  c = pow(max(c*uGain + uLift*(1.0-c), 0.0), 1.0/uGamma);                                 // lift/gamma/gain
  c = (c - 0.5) * uContrast + 0.5;                                                         // contraste
  c = mix(c, c*c*(3.0-2.0*c), clamp((uContrast-1.0)*0.8, 0.0, 0.6));                       // curva em S suave
  float l = dot(c, vec3(0.2126,0.7152,0.0722));
  c = mix(vec3(l), c, uSat);
  c = c*(1.0-uFade) + uFade*0.08 + uFade*0.25*c;                                           // pretos lavados (look de filme)
  // proteção de pele: tons de pele recebem metade da mudança de cor
  float Y = dot(orig, vec3(0.299,0.587,0.114));
  float Cb = 0.5 + (-0.1687*orig.r - 0.3313*orig.g + 0.5*orig.b);
  float Cr = 0.5 + (0.5*orig.r - 0.4187*orig.g - 0.0813*orig.b);
  float skin = smoothstep(0.03,0.0,abs(Cr-0.6)-0.06) * smoothstep(0.03,0.0,abs(Cb-0.42)-0.07) * step(0.2,Y);
  vec3 soft = mix(orig*exp2(uExposure), c, 0.5);
  c = mix(c, soft, skin*uSkin);
  return clamp(mix(orig, c, uIntensity), 0.0, 1.0);
}

void main(){
  vec2 q = vec2(uv.x, 1.0-uv.y) + uShake;
  vec3 c = grade(composite(q));
  // vinheta
  vec2 d = (uv-0.5)*vec2(uRes.x/uRes.y, 1.0);
  float vig = smoothstep(0.9, 0.25, length(d)*(0.9+0.4*min(1.0,uRes.y/uRes.x)));
  c *= mix(1.0, vig, uVignette);
  // vazamento de luz (luz quente que passa)
  if (uLeak > 0.0) {
    vec2 lp = vec2(0.15 + 0.7*fract(uTime*0.07), 0.2 + 0.3*sin(uTime*0.4));
    float lk = exp(-length((uv-lp)*vec2(1.0,1.6))*3.0);
    c += vec3(1.0,0.55,0.22) * lk * uLeak * 0.6;
  }
  // grão animado
  if (uGrain > 0.0) { float g = hash(uv*uRes + floor(uTime*24.0)*13.1) - 0.5; c += g * uGrain * 0.22; }
  // flash branco
  c = mix(c, vec3(1.0), clamp(uFlash, 0.0, 1.0));
  // faixas de cinema
  if (uLetterbox > 0.0 && (uv.y < uLetterbox || uv.y > 1.0 - uLetterbox)) c = vec3(0.0);
  o = vec4(clamp(c,0.0,1.0), 1.0);
}`;

export const TRANS_ID = { cut: 0, dissolve: 1, dip: 2, flash: 3, whip: 4, zoom: 5, glitch: 6 };

export class Compositor {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false });
    if (!gl) throw new Error('Este aparelho não tem WebGL2. Atualize o navegador.');
    this.gl = gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    this.pr = pr; gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    const n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(pr, i); this.u[info.name] = gl.getUniformLocation(pr, info.name); }
    this.tex = [this.mkTex(0), this.mkTex(1)];
    gl.uniform1i(this.u.uA, 0); gl.uniform1i(this.u.uB, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }
  mkTex(unit) {
    const gl = this.gl, t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    return t;
  }
  upload(unit, source, mip) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, this.tex[unit]);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); } catch (e) { return false; }
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    if (mip) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    return true;
  }
  // layer = { el, crop:[x,y,w,h], fit, fitRect:[x,y,w,h], exp }
  draw({ A, B, mix = 0, trans = 'cut', shake = [0, 0], flash = 0, look = 'natural', intensity = 0.8, grainOver = null, letterbox = 0, leak = 0, time = 0, skin = 1 }) {
    const gl = this.gl, u = this.u;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (A && A.el) this.upload(0, A.el, !!A.fit);
    const hasB = !!(B && B.el);
    if (hasB) this.upload(1, B.el, !!B.fit);
    const L = LOOKS[look] || LOOKS.natural;
    const v4 = (n, a) => gl.uniform4f(u[n], a[0], a[1], a[2], a[3]);
    v4('uCropA', A ? A.crop : [0, 0, 1, 1]); v4('uCropB', hasB ? B.crop : [0, 0, 1, 1]);
    gl.uniform1f(u.uFitA, A && A.fit ? 1 : 0); gl.uniform1f(u.uFitB, hasB && B.fit ? 1 : 0);
    v4('uFitRectA', A && A.fitRect || [0, 0, 1, 1]); v4('uFitRectB', hasB && B.fitRect || [0, 0, 1, 1]);
    gl.uniform1f(u.uExpA, A ? A.exp || 0 : 0); gl.uniform1f(u.uExpB, hasB ? B.exp || 0 : 0);
    gl.uniform1f(u.uHasB, hasB ? 1 : 0); gl.uniform1f(u.uMix, mix); gl.uniform1i(u.uTrans, TRANS_ID[trans] || 0);
    gl.uniform2f(u.uShake, shake[0], shake[1]); gl.uniform1f(u.uFlash, flash);
    gl.uniform1f(u.uExposure, L.exposure); gl.uniform1f(u.uContrast, L.contrast); gl.uniform1f(u.uSat, L.saturation);
    gl.uniform1f(u.uTemp, L.temp); gl.uniform1f(u.uTint, L.tint); gl.uniform1f(u.uFade, L.fade);
    gl.uniform3f(u.uLift, ...L.lift); gl.uniform3f(u.uGamma, ...L.gamma); gl.uniform3f(u.uGain, ...L.gain);
    gl.uniform1f(u.uVignette, L.vignette * Math.min(1, intensity * 1.2)); gl.uniform1f(u.uGrain, grainOver != null ? grainOver : L.grain);
    gl.uniform1f(u.uIntensity, intensity); gl.uniform1f(u.uSkin, skin); gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uLetterbox, letterbox); gl.uniform1f(u.uLeak, leak); gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

// Recorte (UV da fonte) para preencher a saída seguindo o assunto.
export function coverCrop(srcW, srcH, outW, outH, zoom = 1, focus = { x: 0.5, y: 0.5 }, face = false) {
  const sa = srcW / srcH, ta = outW / outH;
  let w = 1, h = 1;
  if (sa > ta) w = ta / sa; else h = sa / ta;
  w /= zoom; h /= zoom;
  // com rosto: deixa espaço acima da cabeça (rosto um pouco acima do centro)
  const fy = face ? focus.y + h * 0.08 : focus.y;
  const x = Math.min(1 - w, Math.max(0, focus.x - w / 2));
  const y = Math.min(1 - h, Math.max(0, fy - h / 2));
  return [x, y, w, h];
}

// Retângulo onde a imagem inteira cabe (modo "mostrar tudo, fundo desfocado").
export function fitRect(srcW, srcH, outW, outH, zoom = 1) {
  const sa = srcW / srcH, ta = outW / outH;
  let w = 1, h = 1;
  if (sa > ta) h = ta / sa; else w = sa / ta;
  w = Math.min(1, w * zoom); h = Math.min(1, h * zoom);
  return [(1 - w) / 2, (1 - h) / 2, w, h];
}
