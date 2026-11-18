// Renderizador: toca o plano de verdade (vídeos + WebGL + textos) no relógio do áudio,
// para a prévia e para a exportação em MP4.
import { Compositor, coverCrop, fitRect } from './gl.js';
import { renderMix } from './audio-mix.js';
import { clamp, sleep } from './util.js';
import { Mp4Muxer } from './mp4mux.js';
import { Overlays, ensureFonts } from './captions.js';

const RAMP = u => 0.7 * u + 0.3 * Math.sin(2 * Math.PI * u) / (2 * Math.PI);
const RAMP_V = u => 1 - 0.6 * Math.pow(Math.sin(Math.PI * u), 2);

// Achata o plano em trechos visuais (a cobertura de b-roll vira um trecho próprio).
export function visualSegments(plan) {
  const segs = [];
  for (const c of plan.clips) {
    const base = { clipId: c.id, kind: c.kind, zoom: c.zoom || [1, 1], clipStart: c.start, clipDur: c.dur, focus: c.focus || [], face: !!c.face, lum: c.lum, fit: c.fit || plan.fit || false, still: !!c.still };
    const covers = (c.covers || []).filter(x => x.len > 0.02).sort((a, b) => a.offset - b.offset);
    if (plan.layout === 'split' && covers.length && c.speed === 1 && !c.noVideo) {
      // tela dividida: quem fala fica embaixo o corte inteiro; as imagens trocam em cima
      segs.push({ ...base, id: c.id + 'b', srcId: c.srcId, start: c.start, dur: c.dur, in: c.in, speed: 1, trans: { type: 'cut', dur: 0 }, panel: 'bottom', zoom: [1.04, 1.04] });
      let t = 0;
      covers.forEach((cv, i) => {
        const len = Math.min(cv.len, c.dur - cv.offset);
        const s0 = { ...base, id: c.id + 'c' + i, srcId: cv.srcId, start: c.start + cv.offset, dur: len, in: cv.in, speed: 1, trans: { type: 'cut', dur: 0 }, kind: 'cover', focus: cv.focus || [], face: !!cv.face, lum: cv.lum, zoom: cv.still ? (i % 2 ? [1.14, 1.02] : [1.02, 1.14]) : [1.0, 1.06], clipStart: c.start + cv.offset, clipDur: len, still: !!cv.still, panel: 'top' };
        // sem buraco em cima: a imagem anterior segura até a próxima
        const prevTop = [...segs].reverse().find(x => x.panel === 'top' && x.clipId === c.id);
        if (cv.offset > t + 0.02 && prevTop) prevTop.dur += cv.offset - t; else if (cv.offset > t + 0.02) { s0.start = c.start + t; s0.dur += cv.offset - t; }
        segs.push(s0); t = cv.offset + len;
      });
      const lastTop = [...segs].reverse().find(x => x.panel === 'top' && x.clipId === c.id);
      if (lastTop && t < c.dur - 0.02) lastTop.dur += c.dur - t;
      continue;
    }
    if (covers.length && c.speed === 1) {
      const mainHasVideo = !c.noVideo;
      let t = 0; let k = 0;
      const pushMain = (from, to, first) => { if (to - from > 0.02) segs.push({ ...base, id: c.id + 'm' + (k++), srcId: c.srcId, start: c.start + from, dur: to - from, in: c.in + from, speed: 1, trans: first ? c.trans : { type: 'cut', dur: 0 } }); };
      covers.forEach((cv, i) => {
        if (cv.offset > t + 0.02) { if (mainHasVideo) pushMain(t, cv.offset, t === 0); else if (segs.length) segs[segs.length - 1].dur += cv.offset - t; }
        const len = Math.min(cv.len, c.dur - cv.offset);
        const first = cv.offset < 0.02;
        // fotos ganham movimento lento alternado (Ken Burns); vídeo de apoio, um empurrão leve
        const kb = cv.still ? (i % 2 ? [1.14, 1.02] : [1.02, 1.14]) : [1.0, 1.06];
        segs.push({ ...base, id: c.id + 'c' + i, srcId: cv.srcId, start: c.start + cv.offset, dur: len, in: cv.in, speed: 1, trans: first ? c.trans : (mainHasVideo ? { type: 'cut', dur: 0 } : (cv.trans || { type: 'cut', dur: 0 })), kind: 'cover', focus: cv.focus || [], face: !!cv.face, lum: cv.lum, zoom: kb, clipStart: c.start + cv.offset, clipDur: len, still: !!cv.still, card: plan.layout === 'card' && !!cv.card });
        t = cv.offset + len;
      });
      if (t < c.dur - 0.02) { if (mainHasVideo) pushMain(t, c.dur, false); else segs[segs.length - 1].dur += c.dur - t; }
    } else {
      segs.push({ ...base, id: c.id, srcId: c.srcId, start: c.start, dur: c.dur, in: c.in, speed: c.speed, srcDur: c.out - c.in, trans: c.trans || { type: 'cut', dur: 0 } });
    }
  }
  // janela ativa de cada trecho (inclui metade das transições)
  // ordem no tempo (a tela dividida intercala os dois painéis)
  segs.sort((a, b) => a.start - b.start || (a.panel === 'bottom' ? -1 : 1));
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i], nx = segs.slice(i + 1).find(x => (x.panel === 'bottom') === (s.panel === 'bottom'));
    const tIn = s.trans && s.trans.dur ? s.trans.dur / 2 : 0;
    const tOut = nx && nx.trans && nx.trans.dur ? nx.trans.dur / 2 : 0;
    s.a0 = s.start - tIn; s.a1 = s.start + s.dur + tOut;
  }
  return segs;
}

export function srcTime(seg, t) {
  if (seg.speed === 'freeze') return seg.in;
  const u = (t - seg.start) / seg.dur;
  if (seg.speed === 'ramp') {
    const total = seg.srcDur || seg.dur * 0.7;
    if (u < 0) return seg.in + u * seg.dur;            // antes: velocidade 1
    if (u > 1) return seg.in + total + (u - 1) * seg.dur;
    return seg.in + seg.dur * RAMP(u) * (total / (seg.dur * 0.7));
  }
  return seg.in + (t - seg.start) * seg.speed;
}
const rateAt = (seg, t) => seg.speed === 'ramp' ? RAMP_V(clamp((t - seg.start) / seg.dur, 0, 1)) : seg.speed === 'freeze' ? 0 : seg.speed;

function focusAt(seg, sT) {
  const p = seg.focus; if (!p || !p.length) return { x: 0.5, y: 0.45 };
  if (sT <= p[0].t) return p[0];
  for (let i = 1; i < p.length; i++) if (p[i].t >= sT) { const a = p[i - 1], b = p[i], u = (sT - a.t) / Math.max(1e-6, b.t - a.t); return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }; }
  return p[p.length - 1];
}

function waitFrame(v, ms) {
  return new Promise(res => {
    const evs = ['seeked', 'loadeddata', 'canplay', 'error'];
    const done = () => { clearTimeout(to); clearInterval(iv); evs.forEach(e => v.removeEventListener(e, check)); res(); };
    const check = () => { if (!v.seeking && v.readyState >= 2) done(); };
    evs.forEach(e => v.addEventListener(e, check));
    const iv = setInterval(check, 30); const to = setTimeout(done, ms);
    check();
  });
}
function makeVideoEl(url) {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous'; v.src = url;
  v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
  return v;
}
// Conjunto de elementos de vídeo reaproveitados entre edições: criar e carregar vídeos de novo a cada mudança
// é lento e, no iPhone, gasta memória até o navegador travar.
export class VideoPool {
  constructor() { this.free = new Map(); }
  borrow(id, url, n) {
    const list = this.free.get(id) || []; const out = [];
    while (out.length < n && list.length) { const v = list.pop(); if (v.src === url || v.currentSrc === url) out.push(v); else { v.removeAttribute('src'); v.load(); } }
    while (out.length < n) out.push(makeVideoEl(url));
    this.free.set(id, list); return out;
  }
  giveBack(id, vids) { const list = this.free.get(id) || []; for (const v of vids) { v.pause(); list.push(v); } while (list.length > 4) { const v = list.shift(); v.removeAttribute('src'); v.load(); } this.free.set(id, list); }
  forget(id) { for (const v of this.free.get(id) || []) { v.removeAttribute('src'); v.load(); } this.free.delete(id); }
  clear() { for (const id of [...this.free.keys()]) this.forget(id); }
}
// Chave do que muda o som: se for igual, a mixagem anterior serve.
export function audioKey(plan) { return JSON.stringify([Math.round(plan.duration * 1000), plan.audio]); }
export class MixCache {
  // guarda poucas mixagens e limita a memória (uns 120 MB): som de vídeo longo é pesado
  constructor(n = 3, maxBytes = 120e6) { this.n = n; this.maxBytes = maxBytes; this.m = new Map(); }
  get(k) { const v = this.m.get(k); if (v) { this.m.delete(k); this.m.set(k, v); } return v; }
  bytes() { let b = 0; for (const v of this.m.values()) b += v.buffer ? v.buffer.length * v.buffer.numberOfChannels * 4 : 0; return b; }
  set(k, v) { this.m.set(k, v); while (this.m.size > 1 && (this.m.size > this.n || this.bytes() > this.maxBytes)) this.m.delete(this.m.keys().next().value); }
  clear() { this.m.clear(); }
}

export const RECORD_TYPES = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.4d002a,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/mp4', 'video/webm;codecs=h264,opus', 'video/webm;codecs=vp9,opus', 'video/webm'];
export function pickRecordType() { return RECORD_TYPES.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || ''; }

export class Renderer {
  // Dois modos:
  //  - prévia (compositor + overlayCanvas): o WebGL desenha direto na tela e os textos numa camada por cima.
  //    Nada é copiado da placa de vídeo para a memória a cada quadro, e o contexto WebGL é reaproveitado entre edições.
  //  - exportação (sem compositor): cria o próprio WebGL fora da tela e junta tudo num canvas 2D para gravar.
  constructor({ plan, getSrc, canvas, scale = 1, overlays = null, compositor = null, overlayCanvas = null, videoPool = null, mixCache = null }) {
    this.plan = plan; this.getSrc = getSrc; this.out = canvas; this.scale = scale; this.overlays = overlays || new Overlays(plan);
    this.overlays.subjectAt = () => this._subj || null;
    const W = Math.round(plan.fmt.w * scale / 2) * 2, H = Math.round(plan.fmt.h * scale / 2) * 2;
    this.W = W; this.H = H;
    this.live = !!compositor;
    if (this.live) {
      this.comp = compositor; this.glCanvas = compositor.canvas;
      if (this.glCanvas.width !== W || this.glCanvas.height !== H) { this.glCanvas.width = W; this.glCanvas.height = H; }
      this.ovCanvas = overlayCanvas; overlayCanvas.width = W; overlayCanvas.height = H;
      this.ctx = overlayCanvas.getContext('2d');
    } else {
      canvas.width = W; canvas.height = H;
      this.glCanvas = document.createElement('canvas'); this.glCanvas.width = W; this.glCanvas.height = H;
      this.comp = new Compositor(this.glCanvas); this.ownComp = true;
      this.ctx = canvas.getContext('2d');
    }
    this.videoPool = videoPool; this.mixCache = mixCache;
    this.segs = visualSegments(plan);
    this.pools = new Map(); this.assign = new Map();
    this.stats = { frames: 0, frozen: 0, resyncs: 0, lateMs: 0 };
    this.playing = false; this.t = 0;
    this.lastGood = new Map();
  }

  async prepare(onProgress = () => {}) {
    await ensureFonts(this.overlays.fontsUsed ? this.overlays.fontsUsed() : []);
    // vídeos: 2 a 3 elementos por fonte (corte atual, próximo e transição); na prévia vêm de um conjunto reaproveitado
    const ids = [...new Set(this.segs.map(s => s.srcId))];
    for (const id of ids) {
      const src = this.getSrc(id);
      if (src.kind === 'image') { this.pools.set(id, [{ el: src.img, seg: null, still: true }, { el: src.img, seg: null, still: true }, { el: src.img, seg: null, still: true }]); continue; }
      const need = Math.max(2, Math.min(3, 1 + this.segs.filter(s => s.srcId === id).length));
      const els = this.videoPool ? this.videoPool.borrow(id, src.url, need) : Array.from({ length: need }, () => makeVideoEl(src.url));
      this.pools.set(id, els.map(el => ({ el, seg: null })));
    }
    await Promise.all([...this.pools.values()].flat().filter(x => !x.still).map(x => new Promise(res => { if (x.el.readyState >= 2) return res(); x.el.addEventListener('loadeddata', res, { once: true }); x.el.addEventListener('error', res, { once: true }); setTimeout(res, 15000); })));
    onProgress(0.3, 'Mixando o som');
    // o som só é refeito quando algo do áudio mudou (legenda, cor ou texto não refazem a mixagem)
    const key = audioKey(this.plan);
    let mix = this.mixCache && this.mixCache.get(key);
    if (!mix) {
      mix = await renderMix(this.plan, this.getSrc, { onProgress: p => onProgress(0.3 + p * 0.6, 'Mixando o som') });
      if (this.mixCache) this.mixCache.set(key, mix);
    }
    this.mix = mix;
    onProgress(1, 'Pronto');
    return mix;
  }

  dispose() {
    this.stop();
    for (const [id, arr] of this.pools) {
      const vids = arr.filter(x => !x.still).map(x => x.el);
      if (this.videoPool) this.videoPool.giveBack(id, vids);
      else for (const v of vids) { v.pause(); v.removeAttribute('src'); v.load(); }
    }
    this.pools.clear(); this.assign.clear();
    if (this.ownComp) { this.comp.dispose(); this.comp = null; }
  }

  // ----- agenda de vídeos -----
  elFor(seg, t, prepare) {
    let a = this.assign.get(seg.id);
    if (a) return a;
    const pool = this.pools.get(seg.srcId);
    a = pool.find(x => !x.seg) || pool.find(x => x.seg && x.seg.a1 < t - 0.05);
    if (!a) return null;
    if (a.seg) this.assign.delete(a.seg.id);
    a.seg = seg; this.assign.set(seg.id, a);
    if (a.still) return a;
    a.el.pause();
    const target = srcTime(seg, Math.max(t, seg.a0));
    a.el.currentTime = Math.max(0, target);
    a.prepared = true; a.playingSeg = false;
    return a;
  }
  release(seg) { const a = this.assign.get(seg.id); if (a) { if (!a.still) a.el.pause(); a.seg = null; a.playingSeg = false; this.assign.delete(seg.id); } }

  schedule(t, live) {
    const active = [], soon = [];
    for (const s of this.segs) {
      if (t >= s.a0 && t < s.a1) active.push(s);
      else if (s.a0 > t && s.a0 - t < 1.5) soon.push(s);
    }
    for (const s of [...this.assign.values()].map(a => a.seg)) if (s && (t >= s.a1 + 0.05 || t < s.a0 - 2)) this.release(s);
    for (const s of active) {
      const a = this.elFor(s, t);
      if (!a || a.still) continue;
      const want = srcTime(s, t);
      if (live && s.speed === 'freeze') { if (!a.el.paused) a.el.pause(); if (Math.abs(a.el.currentTime - want) > 0.05 && !a.el.seeking) a.el.currentTime = want; continue; }
      if (live) {
        const r = clamp(rateAt(s, t), 0.25, 2);
        if (Math.abs(a.el.playbackRate - r) > 0.01) a.el.playbackRate = r;
        if (a.el.paused && !a.el.seeking) a.el.play().catch(() => {});
        const drift = a.el.currentTime - want;
        const tol = s.speed === 'ramp' ? 0.25 : 0.16;
        if (Math.abs(drift) > tol && !a.el.seeking) { a.el.currentTime = want; this.stats.resyncs++; }
      }
    }
    for (const s of soon) this.elFor(s, t);
    return active;
  }

  layerFor(seg, t, PW = this.W, PH = this.H) {
    const a = this.assign.get(seg.id); if (!a) return null;
    const src = this.getSrc(seg.srcId);
    const sT = srcTime(seg, t);
    const u = clamp((t - seg.clipStart) / Math.max(0.01, seg.clipDur), 0, 1);
    const z = (seg.zoom[0] + (seg.zoom[1] - seg.zoom[0]) * (u * u * (3 - 2 * u))) * this.fxZoom(t);
    const f = focusAt(seg, sT);
    const lum = seg.lum;
    const exp = lum == null ? 0 : lum < 0.28 ? clamp(Math.log2(0.36 / Math.max(lum, 0.03)) * 0.55, 0, 0.9) : lum > 0.78 ? clamp(Math.log2(0.6 / lum) * 0.6, -0.7, 0) : 0;
    const ready = a.still ? true : a.el.readyState >= 2 && !a.el.seeking;
    const sw = src.width || a.el.videoWidth, sh = src.height || a.el.videoHeight;
    return {
      el: ready ? a.el : null, ready,
      crop: coverCrop(sw, sh, PW, PH, seg.fit ? 1 : z, f, seg.face),
      fit: seg.fit, fitRect: seg.fit ? fitRect(sw, sh, PW, PH, z) : null, sw, sh,
      exp, f,
    };
  }

  // zoom extra dos efeitos: pulso na batida e zoom nas palavras fortes
  fxZoom(t) {
    let z = 1;
    for (const sec of this.plan.sectionFx || []) if (sec.push && t >= sec.from && t < sec.to) z *= 1 + sec.push * 0.12 * (t - sec.from) / Math.max(0.5, sec.to - sec.from);
    for (const fx of this.plan.fx) {
      if (t < fx.t || t > fx.t + fx.dur) continue;
      const k = (t - fx.t) / fx.dur;
      if (fx.kind === 'pulse') z *= 1 + fx.amt * 0.06 * Math.pow(1 - k, 2);
      if (fx.kind === 'punch') z *= 1 + fx.amt * (k < 0.15 ? k / 0.15 : 1);
    }
    return z;
  }

  drawAt(t) {
    const plan = this.plan;
    const all = this.segs.filter(s => t >= s.a0 && t < s.a1);
    const bottom = all.find(s => s.panel === 'bottom');
    const active = all.filter(s => s.panel !== 'bottom');
    // tela dividida: imagens no painel de cima (altura split), quem fala embaixo
    const split = !!(bottom && active.length && active.some(s => s.panel === 'top'));
    const topH = split ? Math.round(this.H * (plan.split || 0.62)) : this.H;
    let A = null, B = null, mix = 0, trans = 'cut';
    if (active.length >= 2) {
      const [s0, s1] = active.sort((x, y) => x.start - y.start);
      const d = s1.trans.dur || 0.001;
      mix = clamp((t - (s1.start - d / 2)) / d, 0, 1); trans = s1.trans.type;
      A = this.layerFor(s0, t, this.W, topH); B = this.layerFor(s1, t, this.W, topH);
    } else if (active.length === 1) A = this.layerFor(active[0], t, this.W, topH);
    else if (bottom) A = this.layerFor(bottom, t);
    // card flutuante: a imagem num cartão no meio de um fundo cinza
    const cardSeg = !split && active.length === 1 && active[0].card ? active[0] : null;
    let cardRect = null;
    if (cardSeg && A) {
      const asp = clamp((A.sw || 16) / (A.sh || 9), 0.8, 1.35);
      const cw = Math.round(this.W * 0.86), ch = Math.round(Math.min(this.H * 0.62, cw / asp));
      const cy = Math.round(this.H * 0.47 - ch / 2);
      cardRect = [Math.round((this.W - cw) / 2), cy, cw, ch];   // x, y (de cima), w, h
      A = this.layerFor(cardSeg, t, cw, ch);
    }
    // onde está o assunto na tela (para textos que seguem a pessoa)
    const L0 = mix > 0.5 && B ? B : A;
    if (L0 && L0.f && !L0.fit) { const c = L0.crop; this._subj = { x: clamp((L0.f.x - c[0]) / c[2], 0.15, 0.85), y: clamp((L0.f.y - c[1]) / c[3], 0.2, 0.75) }; }
    // quadro ainda não pronto: segura o último bom (evita piscar preto)
    if (A && !A.ready) { this.stats.frozen++; }
    // tremor e flash dos efeitos
    let shake = [0, 0], flash = 0;
    for (const fx of plan.fx) {
      if (t < fx.t || t > fx.t + fx.dur) continue;
      const k = 1 - (t - fx.t) / fx.dur;
      if (fx.kind === 'shake') { const a = 0.018 * fx.amt * k; shake = [shake[0] + a * Math.sin(t * 97), shake[1] + a * Math.cos(t * 83)]; }
      if (fx.kind === 'flash') flash = Math.max(flash, fx.amt * k * k * 0.85);
      if (fx.kind === 'pulse') flash = Math.max(flash, fx.amt * 0.12 * k * k);
    }
    // câmera na mão: balanço lento e contínuo (somas de senos, sem tranco)
    if (plan.handheld) { const h = 0.006 * plan.handheld; shake = [shake[0] + h * (Math.sin(t * 1.3) + 0.5 * Math.sin(t * 3.1 + 1)), shake[1] + h * (Math.cos(t * 1.1) + 0.5 * Math.sin(t * 2.7 + 2))]; }
    if (trans === 'flash' && B) flash = Math.max(flash, Math.pow(1 - Math.abs(mix - 0.5) * 2, 2) * 0.95);
    // fade de entrada/saída do vídeo
    const T = plan.duration;
    const fadeOut = clamp((T - t) / (plan.endFade || 0.5), 0, 1), fadeIn = plan.noFadeIn ? 1 : clamp(t / 0.25, 0, 1);
    const lb = plan.letterbox && this.W > this.H ? 0.12 : plan.letterbox ? 0 : 0;
    if (A) {
      // trechos com cor/efeito próprios (ex.: "preto e branco só no final", "VHS no começo")
      const sec = (plan.sectionFx || []).find(x => t >= x.from && t < x.to);
      const look = sec && sec.look ? sec.look : plan.look.id;
      const adjust = sec && sec.adjust ? { ...(plan.adjust || {}), ...sec.adjust } : plan.adjust;
      const common = { shake, flash, look, intensity: sec && sec.look ? 0.9 : plan.look.intensity, grainOver: plan.look.grain, letterbox: lb, time: t, skin: 1, adjust, mirror: plan.mirror };
      if (cardRect) {
        const [x, y, w, h] = cardRect, gy = this.H - y - h, off = Math.round(this.W * 0.012);
        this.comp.fill([0, 0, this.W, this.H], [0.44, 0.45, 0.47]);
        this.comp.fill([x + off, gy - off, w, h], [0.27, 0.28, 0.3]);   // sombra
        this.comp.draw({ ...common, A: A.ready ? A : { ...A, el: null }, B: null, mix: 0, trans: 'cut', leak: 0, vp: [x, gy, w, h] });
      } else if (split) {
        const bH = this.H - topH;
        this.comp.draw({ ...common, A: A.ready ? A : { ...A, el: null }, B: B && B.ready ? B : (B ? { ...B, el: null } : null), mix, trans, leak: 0, vp: [0, bH, this.W, topH] });
        const L = this.layerFor(bottom, t, this.W, bH);
        if (L) this.comp.draw({ ...common, flash: 0, A: L.ready ? L : { ...L, el: null }, B: null, mix: 0, trans: 'cut', leak: 0, vp: [0, 0, this.W, bH] });
      } else {
        this.comp.draw({ ...common, A: A.ready ? A : { ...A, el: null }, B: B && B.ready ? B : (B ? { ...B, el: null } : null), mix, trans, leak: plan.lightLeak * (trans !== 'cut' ? 1 - Math.abs(mix - 0.5) * 2 : 0.15) });
      }
    }
    const c = this.ctx;
    c.globalAlpha = 1;
    if (this.live) c.clearRect(0, 0, this.W, this.H);   // prévia: só a camada de textos é redesenhada
    else c.drawImage(this.glCanvas, 0, 0);             // exportação: junta imagem e textos num quadro só
    if (split) { c.fillStyle = '#FFFFFF'; c.fillRect(0, topH - Math.round(this.H * 0.0016), this.W, Math.max(2, Math.round(this.H * 0.0032))); }
    if (fadeOut < 1 || fadeIn < 1) { c.fillStyle = `rgba(0,0,0,${1 - Math.min(fadeOut, fadeIn)})`; c.fillRect(0, 0, this.W, this.H); }
    if (this.overlays) this.overlays.draw(c, t, this.W, this.H);
    this.stats.frames++;
  }

  // ----- quadro parado (para miniatura, conferência e linha do tempo) -----
  // Avança o vídeo tocando até o quadro pedido (em vez de buscar): na exportação, quadro seguido de quadro
  // fica muitas vezes mais rápido, porque buscar obriga a decodificar desde o último quadro-chave.
  stepTo(el, want, fps) {
    if (typeof el.requestVideoFrameCallback !== 'function' || el.seeking || el.readyState < 2) return Promise.resolve(false);
    const d = want - el.currentTime;
    if (!(d > 0.002 && d < 0.75)) return Promise.resolve(false);
    return new Promise(res => {
      let done = false;
      const fin = ok => { if (done) return; done = true; clearTimeout(to); try { el.pause(); } catch (e) {} res(ok); };
      const to = setTimeout(() => fin(false), 1500);
      const tick = (now, meta) => { if (done) return; if (meta.mediaTime >= want - 0.6 / fps) fin(true); else el.requestVideoFrameCallback(tick); };
      el.requestVideoFrameCallback(tick);
      el.playbackRate = 1;
      const p = el.play(); if (p && p.catch) p.catch(() => fin(false));
    });
  }
  async frameAt(t, { step = 0 } = {}) {
    t = clamp(t, 0, this.plan.duration - 0.01);
    this.t = t;
    const active = this.segs.filter(s => t >= s.a0 && t < s.a1);
    for (const s of active) {
      const a = this.elFor(s, t);
      if (!a || a.still) continue;
      const want = srcTime(s, t);
      if (step && s.speed !== 'freeze') { const ok = await this.stepTo(a.el, want, step); if (ok && Math.abs(a.el.currentTime - want) < 1.5 / step) { this.stats.steps = (this.stats.steps || 0) + 1; continue; } this.stats.stepMiss = (this.stats.stepMiss || 0) + 1; this._lastMiss = [ok, +(a.el.currentTime - want).toFixed(3)]; }
      a.el.pause();
      if (Math.abs(a.el.currentTime - want) > 0.01) a.el.currentTime = want;
      // espera a busca terminar (vários eventos servem; um vídeo já carregado não dispara "loadeddata" de novo)
      if (a.el.seeking || a.el.readyState < 2) await waitFrame(a.el, 4000);
    }
    this.drawAt(t);
  }

  // ----- tocar (prévia) -----
  async play(from = 0, { toSpeakers = true, onTime, onEnd, stream = null } = {}) {
    this.stop();
    const ac = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    this.ac = ac;
    const node = ac.createBufferSource(); node.buffer = this.mix.buffer;
    if (toSpeakers) node.connect(ac.destination);
    let dest = null; if (stream) { dest = ac.createMediaStreamDestination(); node.connect(dest); }
    // prepara os primeiros vídeos antes de soltar o som
    this.schedule(from, false);
    await Promise.all([...this.assign.values()].map(a => !a.still && a.el.seeking ? new Promise(r => { a.el.addEventListener('seeked', r, { once: true }); setTimeout(r, 4000); }) : null));
    await ac.resume();
    const t0 = ac.currentTime + 0.12;
    node.start(t0, from);
    this.node = node; this.playing = true;
    const tick = () => {
      if (!this.playing) return;
      const t = from + Math.max(0, ac.currentTime - t0);
      this.t = t;
      if (t >= this.plan.duration) { this.drawAt(Math.min(t, this.plan.duration - 0.01)); this.playing = false; onEnd && onEnd(); return; }
      this.schedule(t, true);
      this.drawAt(t);
      onTime && onTime(t);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    return dest ? dest.stream : null;
  }

  stop() {
    this.playing = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    try { this.node && this.node.stop(); } catch (e) {}
    if (this.ac) { this.ac.close().catch(() => {}); this.ac = null; }
    for (const a of this.assign.values()) if (!a.still) a.el.pause();
  }

  // ----- exportar MP4 (tempo real) -----
  async export({ onProgress = () => {}, fps, prefer = null, quality = 1, audioBitrate = 192000, signal } = {}) {
    const type = (prefer && RECORD_TYPES.filter(t => t.startsWith(prefer)).find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t))) || pickRecordType();
    if (!type) throw new Error('Este navegador não grava vídeo (MediaRecorder). Use Safari ou Chrome atualizados.');
    const vStream = this.out.captureStream(fps || this.plan.fmt.fps);
    const bitrate = Math.round(Math.min(60e6, Math.max(3e6, this.W * this.H * 5.5 * quality)));
    let rec, chunks = [];
    const done = new Promise((res, rej) => {
      this._resolveExport = res; this._rejectExport = rej;
    });
    const audioStream = await this.play(0, {
      toSpeakers: false, stream: true,
      onTime: t => onProgress(t / this.plan.duration),
      onEnd: async () => { await sleep(250); try { rec.state !== 'inactive' && rec.stop(); } catch (e) { this._rejectExport(e); } },
    });
    const tracks = [...vStream.getVideoTracks(), ...audioStream.getAudioTracks()];
    const ms = new MediaStream(tracks);
    rec = new MediaRecorder(ms, { mimeType: type, videoBitsPerSecond: bitrate, audioBitsPerSecond: audioBitrate });
    if (signal) signal.addEventListener('abort', () => { this.stop(); try { rec.state !== 'inactive' && rec.stop(); } catch (e) {} const er = new Error('cancelado'); er.cancelled = true; this._rejectExport(er); }, { once: true });
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => { vStream.getTracks().forEach(t => t.stop()); this._resolveExport(new Blob(chunks, { type: type.split(';')[0] })); };
    rec.onerror = e => this._rejectExport(e.error || e);
    rec.start(500);
    const blob = await done;
    return { blob, type, bitrate, stats: { ...this.stats } };
  }

  // ----- exportar quadro a quadro (exato: nenhum quadro perdido, não depende da velocidade do aparelho) -----
  static async preciseSupport(W, H, fps) {
    if (!window.VideoEncoder || !window.AudioEncoder || !window.VideoFrame || !window.AudioData) return null;
    const vCands = W * H > 2304 * 1296 ? ['avc1.640034', 'avc1.640033', 'avc1.4d0034'] : ['avc1.640028', 'avc1.64002a', 'avc1.4d0028', 'avc1.42e028'];
    let video = null;
    for (const codec of vCands) {
      const cfg = { codec, width: W, height: H, bitrate: 8e6, framerate: fps, avc: { format: 'avc' } };
      try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) { video = codec; break; } } catch (e) {}
    }
    if (!video) return null;
    let audio = null;
    for (const [codec, name] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
      try { if ((await AudioEncoder.isConfigSupported({ codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 })).supported) { audio = { codec, name }; break; } } catch (e) {}
    }
    if (!audio) return null;
    return { video, audio };
  }

  async exportPrecise({ onProgress = () => {}, signal, fps: fpsOver, quality = 1, audioBitrate = 192000 } = {}) {
    const fps = fpsOver || this.plan.fmt.fps, W = this.W, H = this.H;
    const sup = await Renderer.preciseSupport(W, H, fps);
    if (!sup) throw new Error('sem suporte a WebCodecs');
    const mux = new Mp4Muxer({ width: W, height: H, fps, audio: { codec: sup.audio.name, sampleRate: 48000, channels: 2 } });
    let err = null;
    const bitrate = Math.round(Math.min(80e6, Math.max(3e6, W * H * (fps / 30) * 5.5 * quality)));
    const ve = new VideoEncoder({ output: (c, m) => mux.addVideo(c, m), error: e => { err = e; } });
    ve.configure({ codec: sup.video, width: W, height: H, bitrate, framerate: fps, avc: { format: 'avc' }, latencyMode: 'quality', bitrateMode: 'variable' });
    const N = Math.max(1, Math.round(this.plan.duration * fps));
    const t0 = performance.now();
    // os vídeos precisam estar na página (invisíveis) para o navegador entregar quadros enquanto tocam
    const holder = document.createElement('div');
    Object.assign(holder.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', overflow: 'hidden', opacity: '0.01', pointerEvents: 'none', zIndex: '-1' });
    document.body.appendChild(holder);
    const parked = [];
    for (const list of this.pools.values()) for (const a of list) if (a.el && !a.still && !a.el.parentNode) { holder.appendChild(a.el); parked.push(a.el); }
    try {
    for (let i = 0; i < N; i++) {
      if (signal && signal.aborted) { try { ve.close(); } catch (e) {} const er = new Error('cancelado'); er.cancelled = true; throw er; }
      if (err) throw err;
      const t = i / fps;
      await this.frameAt(t, { step: fps });
      const vf = new VideoFrame(this.out, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      ve.encode(vf, { keyFrame: i % (fps * 2) === 0 });
      vf.close();
      while (ve.encodeQueueSize > 6) await sleep(2);
      if (i % 5 === 0) {
        const el = (performance.now() - t0) / 1000, rate = (i + 1) / el;
        onProgress((i + 1) / N * 0.95, { frame: i + 1, frames: N, etaSec: (N - i - 1) / Math.max(rate, 0.01) });
      }
    }
    } finally { for (const v of parked) { try { v.pause(); } catch (e) {} v.remove(); } holder.remove(); }
    await ve.flush(); ve.close();
    if (err) throw err;
    // som
    const ae = new AudioEncoder({ output: (c, m) => mux.addAudio(c, m), error: e => { err = e; } });
    ae.configure({ codec: sup.audio.codec, sampleRate: 48000, numberOfChannels: 2, bitrate: audioBitrate });
    const buf = this.mix.buffer, L = buf.getChannelData(0), R = buf.getChannelData(1);
    const frames = Math.min(buf.length, Math.round(this.plan.duration * 48000));
    const step = 4800;
    for (let s = 0; s < frames; s += step) {
      const n = Math.min(step, frames - s);
      const data = new Float32Array(n * 2); data.set(L.subarray(s, s + n), 0); data.set(R.subarray(s, s + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(s * 1e6 / 48000), data });
      ae.encode(ad); ad.close();
      if (ae.encodeQueueSize > 20) await sleep(1);
    }
    await ae.flush(); ae.close();
    if (err) throw err;
    onProgress(1, { frame: N, frames: N, etaSec: 0 });
    const blob = mux.finalize();
    return { blob, type: 'video/mp4', codecs: sup.video + ',' + sup.audio.codec, bitrate, stats: { ...this.stats, mode: 'preciso', seconds: (performance.now() - t0) / 1000 } };
  }
}
