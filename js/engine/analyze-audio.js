// Análise de áudio: silêncios, fala, energia, eventos fortes, batidas e andamento (BPM).
import { percentile, movingAvg, clamp } from './util.js';

export const HOP_S = 0.01; // 100 quadros de análise por segundo
// IMPORTANTE: a taxa de amostragem precisa ser múltipla de 100 (16000, 24000, 48000), senão o tempo deriva.
const checkSr = sr => { if (sr % 100) throw new Error('taxa de amostragem precisa ser múltipla de 100: ' + sr); };

function fftInPlace(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

// Volume em dB a cada 10 ms (janela de 30 ms).
export function rmsEnvelope(x, sr) {
  checkSr(sr);
  const hop = Math.round(sr * HOP_S), win = Math.round(sr * 0.03);
  const n = Math.max(1, Math.floor((x.length - 1) / hop) + 1);
  const db = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    const c = f * hop, a = Math.max(0, c - (win >> 1)), b = Math.min(x.length, c + (win >> 1));
    let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i];
    db[f] = 10 * Math.log10(s / Math.max(1, b - a) + 1e-12);
  }
  return db;
}

// Força de ataque (fluxo espectral) a cada 10 ms. Base para batidas e impactos.
export function onsetEnvelope(x, sr, lowEmphasis = false) {
  checkSr(sr);
  const hop = Math.round(sr * HOP_S), N = sr >= 32000 ? 2048 : (sr >= 20000 ? 1024 : 512);
  const n = Math.max(1, Math.floor((x.length - 1) / hop) + 1);
  const env = new Float32Array(n);
  const re = new Float32Array(N), im = new Float32Array(N), prev = new Float32Array(N / 2);
  const w = new Float32Array(N); for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  // peso por frequência: bumbo e caixa (graves/médios) marcam o tempo; chimbal no contratempo não
  const bw = new Float32Array(N / 2); for (let k = 0; k < N / 2; k++) { const hz = k * sr / N; bw[k] = 1 / (1 + Math.pow(hz / 250, 1.5)); }
  for (let f = 0; f < n; f++) {
    const c = f * hop - N / 2;
    for (let i = 0; i < N; i++) { const j = c + i; re[i] = (j >= 0 && j < x.length ? x[j] : 0) * w[i]; im[i] = 0; }
    fftInPlace(re, im);
    let flux = 0;
    for (let k = 1; k < N / 2; k++) {
      const m = Math.log1p(100 * Math.hypot(re[k], im[k]));
      const d = m - prev[k]; prev[k] = m;
      if (d > 0) flux += lowEmphasis ? d * bw[k] : d;
    }
    env[f] = f < 3 ? 0 : flux;
  }
  // tira a tendência lenta e normaliza
  const base = movingAvg(env, 50);
  for (let i = 0; i < n; i++) env[i] = Math.max(0, env[i] - base[i]);
  const mx = Math.max(1e-9, percentile(env, 0.995));
  for (let i = 0; i < n; i++) env[i] = Math.min(1, env[i] / mx);
  return env;
}

function runs(mask, minLen) {
  const out = []; let s = -1;
  for (let i = 0; i <= mask.length; i++) {
    const on = i < mask.length && mask[i];
    if (on && s < 0) s = i;
    if (!on && s >= 0) { if (i - s >= minLen) out.push({ start: s * HOP_S, end: i * HOP_S }); s = -1; }
  }
  return out;
}

// Fala e silêncio. Devolve todos os trechos quietos ≥ 150 ms; quem decide o que cortar é o plano.
export function analyzeSpeech(x, sr) {
  const db = rmsEnvelope(x, sr);
  const floor = percentile(db, 0.08), loud = percentile(db, 0.95);
  const range = loud - floor;
  const hasSound = loud > -55 && range > 6;
  // limiar: acima do ruído de fundo, com histerese para não picotar entre sílabas
  const thrOn = Math.max(floor + Math.max(9, 0.32 * range), -52);
  const thrOff = thrOn - 4;
  const speech = new Uint8Array(db.length);
  let on = false;
  for (let i = 0; i < db.length; i++) {
    if (!on && db[i] > thrOn) on = true; else if (on && db[i] < thrOff) on = false;
    speech[i] = on ? 1 : 0;
  }
  // tapa buracos minúsculos (< 80 ms) dentro da fala
  for (let i = 0; i < speech.length;) {
    if (speech[i]) { i++; continue; }
    let j = i; while (j < speech.length && !speech[j]) j++;
    if (i > 0 && j < speech.length && j - i < 8) for (let k = i; k < j; k++) speech[k] = 1;
    i = j;
  }
  const quiet = speech.map(v => 1 - v);
  const silences = hasSound ? runs(quiet, 15) : [];
  const speechRuns = hasSound ? runs(speech, 5) : [];
  // energia 0..1 suavizada (meio segundo)
  const e = new Float32Array(db.length);
  for (let i = 0; i < db.length; i++) e[i] = clamp((db[i] - floor) / Math.max(range, 1), 0, 1);
  const energy = movingAvg(e, 50);
  const onset = onsetEnvelope(x, sr);
  // evento forte = volume salta bem acima do que vinha antes (pancada, estouro, grito, risada)
  const ev = new Float32Array(db.length);
  let acc = 0; const W = 40;
  for (let i = 0; i < db.length; i++) {
    const prevAvg = i > 0 ? acc / Math.min(i, W) : db[0];
    const jump = db[i] - prevAvg;
    const loudEnough = clamp((db[i] - floor) / Math.max(range, 1), 0, 1);
    ev[i] = clamp((jump - 7) / 14, 0, 1) * (0.4 + 0.6 * loudEnough) * (0.6 + 0.4 * (onset[i] || 0));
    acc += db[i]; if (i >= W) acc -= db[i - W];
  }
  const events = pickPeaks(ev, 0.3, 25).map(i => ({ t: i * HOP_S, strength: +ev[i].toFixed(3) }));
  const totalSpeech = speechRuns.reduce((s, r) => s + r.end - r.start, 0);
  return {
    hop: HOP_S, duration: x.length / sr, floorDb: floor, loudDb: loud, thrDb: thrOn, hasSound,
    speechRatio: totalSpeech / Math.max(1e-6, x.length / sr),
    silences, speech: speechRuns, energy, db, events,
  };
}

function pickPeaks(env, thr, minDist) {
  const out = [];
  for (let i = 1; i < env.length - 1; i++) {
    if (env[i] >= thr && env[i] >= env[i - 1] && env[i] > env[i + 1]) {
      if (out.length && i - out[out.length - 1] < minDist) {
        if (env[i] > env[out[out.length - 1]]) out[out.length - 1] = i;
      } else out.push(i);
    }
  }
  return out;
}

// Andamento e batidas. Autocorrelação da força de ataque + alinhamento de fase.
export function analyzeMusic(x, sr) {
  const onsetAll = onsetEnvelope(x, sr);
  const onsetLow = onsetEnvelope(x, sr, true);
  const onset = onsetAll.map((v, i) => 0.35 * v + 0.65 * onsetLow[i]);
  const n = onset.length, fps = 1 / HOP_S;
  const mean = onset.reduce((a, b) => a + b, 0) / n;
  const o = onset.map(v => v - mean);
  const lagMin = Math.floor(fps * 60 / 200), lagMax = Math.ceil(fps * 60 / 60);
  const ac = new Float32Array(lagMax + 2);
  for (let L = lagMin; L <= lagMax + 1; L++) { let s = 0; for (let i = 0; i + L < n; i++) s += o[i] * o[i + L]; ac[L] = s / (n - L); }
  let best = lagMin, bestScore = -Infinity;
  for (let L = lagMin; L <= lagMax; L++) {
    const bpm = 60 * fps / L;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    // reforço com os múltiplos (2L) ajuda a pegar o pulso certo
    const sc = (ac[L] + 0.5 * (2 * L <= lagMax + 1 ? ac[2 * L] || 0 : 0)) * prior;
    if (sc > bestScore) { bestScore = sc; best = L; }
  }
  // refinamento sub-quadro
  const y0 = ac[best - 1] || 0, y1 = ac[best], y2 = ac[best + 1] || 0;
  const den = y0 - 2 * y1 + y2;
  const period = best + (Math.abs(den) > 1e-12 ? 0.5 * (y0 - y2) / den : 0);
  const bpm = 60 * fps / period;
  // fase
  let bestPh = 0, bestPhS = -Infinity;
  for (let ph = 0; ph < period; ph += 0.5) {
    let s = 0;
    for (let t = ph; t < n; t += period) { const i = Math.round(t); s += Math.max(onset[i] || 0, onset[i - 1] || 0, onset[i + 1] || 0); }
    if (s > bestPhS) { bestPhS = s; bestPh = ph; }
  }
  // grade inicial, depois ajuste fino por regressão (corrige deriva de BPM fracionário)
  let P = period, ph = bestPh;
  let beats = [];
  for (let pass = 0; pass < 3; pass++) {
    beats = [];
    const tol = Math.max(2, Math.round(P * 0.12));
    for (let t = ph; t < n; t += P) {
      const c = Math.round(t); let bi = c, bv = -1;
      for (let k = -tol; k <= tol; k++) { const i = c + k; if (i >= 0 && i < n && onset[i] > bv) { bv = onset[i]; bi = i; } }
      // sub-quadro: parábola no pico
      const a = onset[bi - 1] || 0, b = onset[bi], cc = onset[bi + 1] || 0, d = a - 2 * b + cc;
      const frac = Math.abs(d) > 1e-9 ? clamp(0.5 * (a - cc) / d, -0.5, 0.5) : 0;
      beats.push({ i: bi + frac, strength: bv });
    }
    // regressão linear i = ph + k*P usando só batidas fortes
    const strong = beats.map((b, k) => ({ k, i: b.i, s: b.strength })).filter(b => b.s > 0.2);
    if (strong.length < 8) break;
    let sw = 0, sk = 0, si = 0, skk = 0, ski = 0;
    for (const b of strong) { const w = b.s; sw += w; sk += w * b.k; si += w * b.i; skk += w * b.k * b.k; ski += w * b.k * b.i; }
    const den = sw * skk - sk * sk; if (Math.abs(den) < 1e-9) break;
    P = (sw * ski - sk * si) / den; ph = (si - P * sk) / sw;
    while (ph - P >= -0.5) ph -= P; while (ph < -0.5) ph += P;
  }
  // a janela da FFT "enxerga" o ataque um pouco antes; compensa metade de um quarto da janela
  const lead = (sr >= 32000 ? 2048 : (sr >= 20000 ? 1024 : 512)) / sr / 4;
  beats = beats.map(b => ({ t: Math.max(0, b.i * HOP_S + lead), strength: b.strength }));
  const bpmFinal = 60 * fps / P;
  // compasso de 4: qual fase de 4 tem batidas mais fortes = tempo 1
  let bestBar = 0, bestBarS = -1;
  for (let k = 0; k < 4; k++) { let s = 0; for (let i = k; i < beats.length; i += 4) s += beats[i].strength; if (s > bestBarS) { bestBarS = s; bestBar = k; } }
  beats.forEach((b, i) => { b.downbeat = (i - bestBar) % 4 === 0; });
  const db = rmsEnvelope(x, sr);
  const floor = percentile(db, 0.05), loud = percentile(db, 0.98);
  const e = db.map(v => clamp((v - floor) / Math.max(loud - floor, 1), 0, 1));
  const energy = movingAvg(e, 200);
  const confidence = clamp(bestScore / (ac[0] || 1e-9) * 3, 0, 1);
  return { bpm: Math.round(bpmFinal * 10) / 10, period: P * HOP_S, beats, onset, energy, confidence, duration: x.length / sr };
}

// Melhor trecho da música para uma duração: começo num tempo 1, energia crescendo até o fim.
export function bestMusicWindow(music, dur) {
  if (!music || music.duration <= dur + 0.5) return { start: 0, end: Math.min(dur, music ? music.duration : dur) };
  const downs = music.beats.filter(b => b.downbeat).map(b => b.t);
  const cands = downs.length ? downs : [0];
  let best = cands[0], bestS = -Infinity;
  for (const t of cands) {
    if (t + dur > music.duration) break;
    const i0 = Math.floor(t / HOP_S), i1 = Math.floor((t + dur) / HOP_S);
    let s = 0; for (let i = i0; i < i1; i++) s += music.energy[i] || 0;
    const avg = s / Math.max(1, i1 - i0);
    const endE = music.energy[Math.min(i1, music.energy.length - 1)] || 0;
    const startE = music.energy[i0] || 0;
    const score = avg + 0.3 * endE + 0.15 * startE - (t < 0.5 ? 0 : 0.02);
    if (score > bestS) { bestS = score; best = t; }
  }
  return { start: best, end: best + dur };
}
