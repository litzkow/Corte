// Mixagem final: fala + som ambiente + música (com ducking) + efeitos, normalizada para as redes (-14 LUFS, pico -1 dB).
import { decodeAudio } from './media.js';
import { makeSfx, SFX_ANCHOR } from './sfx.js';
import { dbToGain, gainToDb, clamp } from './util.js';
import { analyzeInBackground } from './pipeline.js';

const SR = 48000;
const hiCache = new Map();

export async function sourceAudio48k(src) {
  if (hiCache.has(src.id)) return hiCache.get(src.id);
  // fonte longa: 24 kHz basta e economiza metade da memória (o mix reamostra sozinho)
  const p = decodeAudio(src, src.duration > 600 ? 24000 : SR, 2);
  hiCache.set(src.id, p);
  const b = await p;
  if (!b) hiCache.set(src.id, Promise.resolve(null));
  return b;
}
export function dropAudioCache(id) { if (id) hiCache.delete(id); else hiCache.clear(); }

function scheduleFade(g, start, dur, fadeIn, fadeOut, level = 1) {
  const fi = Math.min(fadeIn, dur / 2), fo = Math.min(fadeOut, dur / 2);
  g.gain.setValueAtTime(0, Math.max(0, start));
  g.gain.linearRampToValueAtTime(level, start + fi);
  g.gain.setValueAtTime(level, Math.max(start + fi, start + dur - fo));
  g.gain.linearRampToValueAtTime(0, start + dur);
}

export async function renderMix(plan, getSrc, { onProgress } = {}) {
  const total = Math.max(0.1, plan.duration);
  const ctx = new OfflineAudioContext(2, Math.ceil(total * SR) + SR / 10, SR);
  const bus = ctx.createGain(); bus.connect(ctx.destination);
  const a = plan.audio;
  const fx = a.fx || {};
  // saída geral com balanço estéreo
  let master = bus;
  if (fx.pan) { const pn = ctx.createStereoPanner(); pn.pan.value = clamp(fx.pan, -1, 1); pn.connect(bus); master = pn; }
  // --- som dos cortes: barramento de fala → limpeza da voz → saída (pode ser silenciado nos palavrões) ---
  const speech = ctx.createGain();
  speech.connect(voiceChain(ctx, fx, master));
  for (const m of a.mutes || []) { const s0 = Math.max(0, m.start - 0.01); speech.gain.setValueAtTime(1, s0); speech.gain.linearRampToValueAtTime(0, s0 + 0.01); speech.gain.setValueAtTime(0, m.end); speech.gain.linearRampToValueAtTime(1, m.end + 0.01); }
  // redução de ruído: a fala é renderizada separada, limpa em segundo plano e volta para a mixagem
  let speechDest = speech, vctx = null;
  if (fx.denoise > 0 && a.tracks.length) { vctx = new OfflineAudioContext(2, Math.ceil(total * SR) + SR / 10, SR); speechDest = vctx.destination; }
  const tctx = vctx || ctx;
  for (const tr of a.tracks) {
    const src = getSrc(tr.srcId); if (!src) continue;
    const buf = await sourceAudio48k(src); if (!buf) continue;
    const n = tctx.createBufferSource(); n.buffer = buf;
    const g = tctx.createGain();
    const dur = (tr.out - tr.in);
    scheduleFade(g, tr.start, dur, tr.fadeIn || 0.012, tr.fadeOut || 0.012, dbToGain(tr.gainDb));
    n.connect(g); g.connect(speechDest);
    n.start(tr.start, Math.max(0, tr.in), dur);
  }
  if (vctx) {
    const stem = await vctx.startRendering();
    for (let c = 0; c < stem.numberOfChannels; c++) { const clean = await analyzeInBackground('denoise', stem.getChannelData(c).slice(), SR, fx.denoise); stem.getChannelData(c).set(clean); }
    const n = ctx.createBufferSource(); n.buffer = stem; n.connect(speech); n.start(0);
  }
  // --- música ---
  if (a.music) {
    const m = a.music, src = getSrc(m.srcId);
    const buf = src ? await sourceAudio48k(src) : null;
    if (buf) {
      const n = ctx.createBufferSource(); n.buffer = buf;
      const lvl = ctx.createGain(), fade = ctx.createGain();
      const L = dbToGain(m.levelDb), D = dbToGain(m.levelDb + (m.duckDb || 0));
      lvl.gain.setValueAtTime(L, 0);
      // ducking: desce 120 ms antes da fala, volta 400 ms depois
      let last = 0;
      for (const d of m.duck) {
        const s0 = Math.max(last, d.start - 0.15), s1 = Math.max(s0 + 0.01, d.start);
        const e0 = Math.max(s1, d.end), e1 = e0 + 0.4;
        lvl.gain.setValueAtTime(L, s0); lvl.gain.linearRampToValueAtTime(D, s1);
        lvl.gain.setValueAtTime(D, e0); lvl.gain.linearRampToValueAtTime(L, e1);
        last = e1;
      }
      if (m.swellAtEnd && m.dur > 8) {
        const s0 = Math.max(last, m.start + m.dur * 0.72), s1 = m.start + m.dur - m.fadeOut;
        if (s1 > s0 + 0.5) { lvl.gain.setValueAtTime(L, s0); lvl.gain.linearRampToValueAtTime(L * dbToGain(3), s1); }
      }
      const avail = Math.max(0.1, buf.duration - m.in);
      const play = Math.min(m.dur, avail);
      scheduleFade(fade, m.start, play, m.fadeIn, Math.min(m.fadeOut, play / 3));
      n.connect(lvl); lvl.connect(fade); fade.connect(eqChain(ctx, fx.musicEq, master));
      n.start(m.start, m.in, play);
    }
  }
  // --- efeitos ---
  a.sfx.forEach((s, i) => {
    const b = makeSfx(ctx, s.kind, i % 3);
    const n = ctx.createBufferSource(); n.buffer = b;
    const g = ctx.createGain(); g.gain.value = dbToGain(s.gainDb);
    n.connect(g); g.connect(master);
    const st = s.t - (SFX_ANCHOR[s.kind] || 0);
    if (st >= 0) n.start(st); else n.start(0, -st);
    if (s.dur) n.stop(Math.max(0, st) + s.dur);
  });
  onProgress && onProgress(0.3);
  const out = await ctx.startRendering();
  onProgress && onProgress(0.7);
  const stats = finalizeLoudness(out, a.normalizeLufs || -14, -1);
  onProgress && onProgress(1);
  return { buffer: out, stats };
}

// equalizador de 3 bandas (graves 120 Hz, médios 1 kHz, agudos 8 kHz)
function eqChain(ctx, eq, out) {
  if (!eq || (!eq.low && !eq.mid && !eq.high)) return out;
  const lo = ctx.createBiquadFilter(); lo.type = 'lowshelf'; lo.frequency.value = 120; lo.gain.value = eq.low || 0;
  const mi = ctx.createBiquadFilter(); mi.type = 'peaking'; mi.frequency.value = 1000; mi.Q.value = 0.9; mi.gain.value = eq.mid || 0;
  const hi = ctx.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 8000; hi.gain.value = eq.high || 0;
  lo.connect(mi); mi.connect(hi); hi.connect(out); return lo;
}
// voz: corte de graves que embolam, presença, equalização pedida e compressão
function voiceChain(ctx, fx, out) {
  let head = out;
  const cl = fx.clarity || 0, comp = Math.max(fx.comp || 0, cl * 0.8);
  if (comp > 0) {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = -18 - 12 * comp; c.ratio.value = 2 + 4 * comp; c.knee.value = 8; c.attack.value = 0.006; c.release.value = 0.18;
    const makeup = ctx.createGain(); makeup.gain.value = dbToGain(3 + 6 * comp); c.connect(makeup); makeup.connect(head); head = c;
  }
  head = eqChain(ctx, fx.voiceEq, head);
  if (cl > 0) {
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70 + 40 * cl; hp.Q.value = 0.7;
    const mud = ctx.createBiquadFilter(); mud.type = 'peaking'; mud.frequency.value = 250; mud.Q.value = 1; mud.gain.value = -3 * cl;
    const pres = ctx.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 3200; pres.Q.value = 0.9; pres.gain.value = 4 * cl;
    const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 9000; air.gain.value = 2 * cl;
    hp.connect(mud); mud.connect(pres); pres.connect(air); air.connect(head); head = hp;
  }
  return head;
}

// ---------- loudness (ITU-R BS.1770) ----------
function kWeight(x) {
  const y = new Float32Array(x.length);
  // estágio 1: shelving
  let b0 = 1.53512485958697, b1 = -2.69169618940638, b2 = 1.19839281085285, a1 = -1.69065929318241, a2 = 0.73248077421585;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  // estágio 2: passa-altas
  b0 = 1; b1 = -2; b2 = 1; a1 = -1.99004745483398; a2 = 0.99007225036621;
  x1 = x2 = y1 = y2 = 0;
  for (let i = 0; i < y.length; i++) { const xv = y[i]; const v = b0 * xv + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = xv; y2 = y1; y1 = v; y[i] = v; }
  return y;
}

export function integratedLoudness(buf) {
  const chs = []; for (let c = 0; c < buf.numberOfChannels; c++) chs.push(kWeight(buf.getChannelData(c)));
  const blk = Math.round(0.4 * buf.sampleRate), hop = Math.round(0.1 * buf.sampleRate);
  const blocks = [];
  for (let s = 0; s + blk <= buf.length; s += hop) {
    let z = 0;
    for (const y of chs) { let m = 0; for (let i = s; i < s + blk; i++) m += y[i] * y[i]; z += m / blk; }
    blocks.push(z);
  }
  if (!blocks.length) return -70;
  const L = z => -0.691 + 10 * Math.log10(z + 1e-12);
  const abs = blocks.filter(z => L(z) > -70);
  if (!abs.length) return -70;
  const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter(z => L(z) > rel);
  return L(gated.reduce((a, b) => a + b, 0) / Math.max(1, gated.length));
}

export function peakDb(buf) {
  let p = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > p) p = v; } }
  return gainToDb(p);
}

// Ajusta o volume ao alvo e segura os picos com um limitador com antecipação de 5 ms.
export function finalizeLoudness(buf, targetLufs = -14, ceilingDb = -1) {
  const before = integratedLoudness(buf);
  const silent = before <= -69;
  const gain = silent ? 1 : dbToGain(clamp(targetLufs - before, -20, 24));
  const ceil = dbToGain(ceilingDb - 0.3);
  const n = buf.length, look = Math.round(0.005 * SR), rel = Math.exp(-1 / (0.08 * SR));
  const chs = []; for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
  // envelope de ganho necessário
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) { let p = 0; for (const d of chs) p = Math.max(p, Math.abs(d[i] * gain)); need[i] = p > ceil ? ceil / p : 1; }
  // mínimo numa janela adiante (antecipação) + soltura suave
  const g = new Float32Array(n); let env = 1;
  const dq = []; // deque de mínimos
  for (let i = n - 1 + look, w = 0; i >= -0; i--) { /* placeholder para manter compat */ break; }
  let minAhead = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = i + look; const v = j < n ? need[j] : 1;
    while (dq.length && dq[dq.length - 1].v >= v) dq.pop();
    dq.push({ i: j, v });
    while (dq[0].i < i) dq.shift();
    minAhead[i] = Math.min(dq[0].v, need[i]);
  }
  for (let i = 0; i < n; i++) { const tgt = minAhead[i]; env = tgt < env ? tgt : tgt + (env - tgt) * rel; g[i] = env; }
  let reduced = 0;
  for (const d of chs) for (let i = 0; i < n; i++) { d[i] = d[i] * gain * g[i]; }
  for (let i = 0; i < n; i++) if (g[i] < 0.98) reduced++;
  return { lufsBefore: before, gainDb: gainToDb(gain), lufs: silent ? before : integratedLoudness(buf), peakDb: peakDb(buf), limitedPct: reduced / n };
}
