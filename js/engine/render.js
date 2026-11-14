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
        segs.push({ ...base, id: c.id + 'c' + i, srcId: cv.srcId, start: c.start + cv.offset, dur: len, in: cv.in, speed: 1, trans: first ? c.trans : (mainHasVideo ? { type: 'cut', dur: 0 } : (cv.trans || { type: 'cut', dur: 0 })), kind: 'cover', focus: cv.focus || [], face: !!cv.face, lum: cv.lum, zoom: kb, clipStart: c.start + cv.offset, clipDur: len, still: !!cv.still });
        t = cv.offset + len;
      });
      if (t < c.dur - 0.02) { if (mainHasVideo) pushMain(t, c.dur, false); else segs[segs.length - 1].dur += c.dur - t; }
    } else {
      segs.push({ ...base, id: c.id, srcId: c.srcId, start: c.start, dur: c.dur, in: c.in, speed: c.speed, srcDur: c.out - c.in, trans: c.trans || { type: 'cut', dur: 0 } });
    }
  }
  // janela ativa de cada trecho (inclui metade das transições)
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i], nx = segs[i + 1];
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

export const RECORD_TYPES = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.4d002a,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/mp4', 'video/webm;codecs=h264,opus', 'video/webm;codecs=vp9,opus', 'video/webm'];
export function pickRecordType() { return RECORD_TYPES.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || ''; }

export class Renderer {
  constructor({ plan, getSrc, canvas, scale = 1, overlays = null }) {
    this.plan = plan; this.getSrc = getSrc; this.out = canvas; this.scale = scale; this.overlays = overlays || new Overlays(plan);
    this.overlays.subjectAt = () => this._subj || null;
    const W = Math.round(plan.fmt.w * scale / 2) * 2, H = Math.round(plan.fmt.h * scale / 2) * 2;
    this.W = W; this.H = H;
    canvas.width = W; canvas.height = H;
    this.glCanvas = document.createElement('canvas'); this.glCanvas.width = W; this.glCanvas.height = H;
    this.comp = new Compositor(this.glCanvas);
    this.ctx = canvas.getContext('2d');
    this.segs = visualSegments(plan);
    this.pools = new Map(); this.assign = new Map();
    this.stats = { frames: 0, frozen: 0, resyncs: 0, lateMs: 0 };
    this.playing = false; this.t = 0;
    this.lastGood = new Map();
  }

  async prepare(onProgress = () => {}) {
    await ensureFonts(this.overlays.fontsUsed ? this.overlays.fontsUsed() : []);
    // vídeos: 3 elementos por fonte (corte atual, próximo e transição)
    const ids = [...new Set(this.segs.map(s => s.srcId))];
    for (const id of ids) {
      const src = this.getSrc(id);
      if (src.kind === 'image') { this.pools.set(id, [{ el: src.img, seg: null, still: true }, { el: src.img, seg: null, still: true }, { el: src.img, seg: null, still: true }]); continue; }
      const els = [];
      const need = Math.min(4, 1 + this.segs.filter(s => s.srcId === id).length);
      for (let i = 0; i < Math.max(2, Math.min(3, need)); i++) {
        const v = document.createElement('video');
        v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous'; v.src = src.url;
        v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
        els.push({ el: v, seg: null });
      }
      this.pools.set(id, els);
    }
    await Promise.all([...this.pools.values()].flat().filter(x => !x.still).map(x => new Promise(res => { if (x.el.readyState >= 2) return res(); x.el.addEventListener('loadeddata', res, { once: true }); x.el.addEventListener('error', res, { once: true }); setTimeout(res, 15000); })));
    onProgress(0.3, 'Mixando o som');
    const mix = await renderMix(this.plan, this.getSrc, { onProgress: p => onProgress(0.3 + p * 0.6, 'Mixando o som') });
    this.mix = mix;
    onProgress(1, 'Pronto');
    return mix;
  }

  dispose() {
    this.stop();
    for (const arr of this.pools.values()) for (const x of arr) { if (x.still) continue; x.el.pause(); x.el.removeAttribute('src'); x.el.load(); }
    this.pools.clear();
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

  layerFor(seg, t) {
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
      crop: coverCrop(sw, sh, this.W, this.H, seg.fit ? 1 : z, f, seg.face),
      fit: seg.fit, fitRect: seg.fit ? fitRect(sw, sh, this.W, this.H, z) : null,
      exp, f,
    };
  }

  // zoom extra dos efeitos: pulso na batida e zoom nas palavras fortes
  fxZoom(t) {
    let z = 1;
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
    const active = this.segs.filter(s => t >= s.a0 && t < s.a1);
    let A = null, B = null, mix = 0, trans = 'cut';
    if (active.length >= 2) {
      const [s0, s1] = active.sort((x, y) => x.start - y.start);
      const d = s1.trans.dur || 0.001;
      mix = clamp((t - (s1.start - d / 2)) / d, 0, 1); trans = s1.trans.type;
      A = this.layerFor(s0, t); B = this.layerFor(s1, t);
    } else if (active.length === 1) A = this.layerFor(active[0], t);
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
    if (trans === 'flash' && B) flash = Math.max(flash, Math.pow(1 - Math.abs(mix - 0.5) * 2, 2) * 0.95);
    // fade de entrada/saída do vídeo
    const T = plan.duration;
    const fadeOut = clamp((T - t) / 0.5, 0, 1), fadeIn = clamp(t / 0.25, 0, 1);
    const lb = plan.letterbox && this.W > this.H ? 0.12 : plan.letterbox ? 0 : 0;
    if (A) {
      this.comp.draw({ A: A.ready ? A : { ...A, el: null }, B: B && B.ready ? B : (B ? { ...B, el: null } : null), mix, trans, shake, flash, look: plan.look.id, intensity: plan.look.intensity, grainOver: plan.look.grain, letterbox: lb, leak: plan.lightLeak * (trans !== 'cut' ? 1 - Math.abs(mix - 0.5) * 2 : 0.15), time: t, skin: 1, adjust: plan.adjust, mirror: plan.mirror });
    }
    const c = this.ctx;
    c.globalAlpha = 1; c.drawImage(this.glCanvas, 0, 0);
    if (fadeOut < 1 || fadeIn < 1) { c.fillStyle = `rgba(0,0,0,${1 - Math.min(fadeOut, fadeIn)})`; c.fillRect(0, 0, this.W, this.H); }
    if (this.overlays) this.overlays.draw(c, t, this.W, this.H);
    this.stats.frames++;
  }

  // ----- quadro parado (para miniatura, conferência e linha do tempo) -----
  async frameAt(t) {
    t = clamp(t, 0, this.plan.duration - 0.01);
    this.t = t;
    const active = this.segs.filter(s => t >= s.a0 && t < s.a1);
    for (const s of active) {
      const a = this.elFor(s, t);
      if (!a || a.still) continue;
      const want = srcTime(s, t);
      a.el.pause();
      if (Math.abs(a.el.currentTime - want) > 0.01) { a.el.currentTime = want; await new Promise(r => { a.el.addEventListener('seeked', r, { once: true }); setTimeout(r, 4000); }); }
      if (a.el.readyState < 2) await new Promise(r => { a.el.addEventListener('loadeddata', r, { once: true }); setTimeout(r, 3000); });
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
  async export({ onProgress = () => {}, fps } = {}) {
    const type = pickRecordType();
    if (!type) throw new Error('Este navegador não grava vídeo (MediaRecorder). Use Safari ou Chrome atualizados.');
    const vStream = this.out.captureStream(fps || this.plan.fmt.fps);
    const bitrate = Math.round(Math.min(40e6, Math.max(5e6, this.W * this.H * 5.5)));
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
    rec = new MediaRecorder(ms, { mimeType: type, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192000 });
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

  async exportPrecise({ onProgress = () => {}, signal } = {}) {
    const fps = this.plan.fmt.fps, W = this.W, H = this.H;
    const sup = await Renderer.preciseSupport(W, H, fps);
    if (!sup) throw new Error('sem suporte a WebCodecs');
    const mux = new Mp4Muxer({ width: W, height: H, fps, audio: { codec: sup.audio.name, sampleRate: 48000, channels: 2 } });
    let err = null;
    const bitrate = Math.round(Math.min(40e6, Math.max(5e6, W * H * (fps / 30) * 5.5)));
    const ve = new VideoEncoder({ output: (c, m) => mux.addVideo(c, m), error: e => { err = e; } });
    ve.configure({ codec: sup.video, width: W, height: H, bitrate, framerate: fps, avc: { format: 'avc' }, latencyMode: 'quality', bitrateMode: 'variable' });
    const N = Math.max(1, Math.round(this.plan.duration * fps));
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      if (signal && signal.aborted) throw new Error('cancelado');
      if (err) throw err;
      const t = i / fps;
      await this.frameAt(t);
      const vf = new VideoFrame(this.out, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      ve.encode(vf, { keyFrame: i % (fps * 2) === 0 });
      vf.close();
      while (ve.encodeQueueSize > 6) await sleep(2);
      if (i % 5 === 0) {
        const el = (performance.now() - t0) / 1000, rate = (i + 1) / el;
        onProgress((i + 1) / N * 0.95, { frame: i + 1, frames: N, etaSec: (N - i - 1) / Math.max(rate, 0.01) });
      }
    }
    await ve.flush(); ve.close();
    if (err) throw err;
    // som
    const ae = new AudioEncoder({ output: (c, m) => mux.addAudio(c, m), error: e => { err = e; } });
    ae.configure({ codec: sup.audio.codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 });
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
