// Análise de imagem: troca de cena, movimento, tremor, exposição, nitidez, cor e onde está o assunto.
import { makeSeeker } from './media.js';
import { clamp, percentile, movingAvg } from './util.js';

const SW = 64, SH = 36; // amostra pequena: rápido e suficiente para estatística

function stats(ctx, prevGray) {
  const d = ctx.getImageData(0, 0, SW, SH).data;
  const n = SW * SH;
  const gray = new Float32Array(n);
  const hist = new Float32Array(24);
  let sum = 0, sum2 = 0, sat = 0, skin = 0, skx = 0, sky = 0, sr = 0, sg = 0, sb = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = d[p] / 255, g = d[p + 1] / 255, b = d[p + 2] / 255;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    gray[i] = y; sum += y; sum2 += y * y; sr += r; sg += g; sb += b;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat += mx > 0 ? (mx - mn) / mx : 0;
    hist[Math.min(7, r * 8 | 0)]++; hist[8 + Math.min(7, g * 8 | 0)]++; hist[16 + Math.min(7, b * 8 | 0)]++;
    // tom de pele (regra RGB clássica, funciona para várias tonalidades em luz normal)
    const R = d[p], G = d[p + 1], B = d[p + 2];
    if (R > 95 && G > 40 && B > 20 && R > G && R > B && (R - Math.min(G, B)) > 15 && Math.abs(R - G) > 15) {
      skin++; skx += i % SW; sky += (i / SW) | 0;
    }
  }
  for (let k = 0; k < 24; k++) hist[k] /= n;
  const mean = sum / n, std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  // nitidez: variância do laplaciano
  let lap = 0, lapN = 0;
  const edge = new Float32Array(n);
  for (let y = 1; y < SH - 1; y++) for (let x = 1; x < SW - 1; x++) {
    const i = y * SW + x;
    const L = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - SW] - gray[i + SW];
    lap += L * L; lapN++; edge[i] = Math.abs(L);
  }
  // tremor/movimento de câmera: melhor deslocamento global contra o quadro anterior
  let shift = { dx: 0, dy: 0 }, motion = 0, shiftOk = false;
  const diff = new Float32Array(n);
  if (prevGray) {
    let best = Infinity, zero = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -4; dx <= 4; dx++) {
      let s = 0, c = 0;
      for (let y = 4; y < SH - 4; y += 2) for (let x = 5; x < SW - 5; x += 2) { s += Math.abs(gray[y * SW + x] - prevGray[(y + dy) * SW + x + dx]); c++; }
      s /= c; if (dx === 0 && dy === 0) zero = s;
      if (s < best - 1e-6 || (Math.abs(s - best) < 1e-6 && dx === 0 && dy === 0)) { best = s; shift = { dx, dy }; }
    }
    // deslocamento só vale se o quadro todo mudou e alinhar resolve boa parte (câmera mexeu, não um objeto)
    shiftOk = zero > 0.015 && best < zero * 0.6;
    if (!shiftOk) shift = { dx: 0, dy: 0 };
    let m = 0;
    for (let i = 0; i < n; i++) { const v = Math.abs(gray[i] - prevGray[i]); diff[i] = v; m += v; }
    motion = m / n;
  }
  // pele: maior mancha COMPACTA (rosto). Faixas finas (madeira, tijolo) são descartadas.
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const R = d[i * 4], G = d[i * 4 + 1], B = d[i * 4 + 2];
    const cr = 128 + 0.5 * R - 0.4187 * G - 0.0813 * B, cb = 128 - 0.1687 * R - 0.3313 * G + 0.5 * B;
    mask[i] = (R > 95 && G > 40 && B > 20 && R > G && R > B && (R - Math.min(G, B)) > 15 && Math.abs(R - G) > 15 && cr > 135 && cr < 175 && cb > 80 && cb < 130) ? 1 : 0;
  }
  const lab = new Int32Array(n).fill(-1); let face = null, faceSize = 0;
  for (let i0 = 0; i0 < n; i0++) {
    if (!mask[i0] || lab[i0] >= 0) continue;
    const st = [i0]; lab[i0] = i0; let cnt = 0, minx = SW, maxx = 0, miny = SH, maxy = 0, sx = 0, sy = 0;
    while (st.length) {
      const i = st.pop(), x = i % SW, y = (i / SW) | 0; cnt++; sx += x; sy += y;
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      for (const j of [i - 1, i + 1, i - SW, i + SW]) if (j >= 0 && j < n && mask[j] && lab[j] < 0 && Math.abs((j % SW) - x) <= 1) { lab[j] = i0; st.push(j); }
    }
    const bw = maxx - minx + 1, bh = maxy - miny + 1, fill = cnt / (bw * bh), asp = bh / bw;
    if (cnt >= 6 && fill > 0.45 && asp > 0.6 && asp < 2.6 && cnt > faceSize) { faceSize = cnt; face = { x: (sx / cnt + 0.5) / SW, y: (sy / cnt + 0.5) / SH, w: bw / SW, h: bh / SH }; }
  }
  // centro de interesse geral: movimento e bordas
  let wx = 0, wy = 0, ws = 0;
  for (let i = 0; i < n; i++) {
    const x = i % SW, y = (i / SW) | 0;
    const w = 4 * diff[i] + 1.5 * edge[i] + 0.02;
    wx += w * x; wy += w * y; ws += w;
  }
  return {
    gray, hist, mean, std, sat: sat / n, rgb: [sr / n, sg / n, sb / n], sharp: lap / Math.max(1, lapN), motion, shift,
    skin: face ? faceSize / n : 0, skinX: face ? face.x : null, skinY: face ? face.y : null, face,
    cx: (wx / ws + 0.5) / SW, cy: (wy / ws + 0.5) / SH,
  };
}

const histDist = (a, b) => { let s = 0; for (let k = 0; k < 24; k++) s += Math.abs(a[k] - b[k]); return s / 6; }; // 0..1

// Foto: uma "tomada" parada. Mesmas medidas do vídeo, tiradas uma vez.
export async function analyzeImage(src) {
  const cv = document.createElement('canvas'); cv.width = SW; cv.height = SH;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  // recorte "cover" do centro, como o vídeo
  ctx.drawImage(src.img, 0, 0, SW, SH);
  const s = stats(ctx, null);
  const tw = 160, th = Math.round(160 * (src.height || 9) / (src.width || 16));
  const tc = document.createElement('canvas'); tc.width = tw; tc.height = th; tc.getContext('2d').drawImage(src.img, 0, 0, tw, th);
  const flags = [];
  if (s.mean < 0.16) flags.push('escuro'); if (s.mean > 0.9) flags.push('estourado');
  const sharpOk = s.sharp > 0.0004; if (!sharpOk) flags.push('desfocado');
  const q = Math.max(0, 1 - (flags.includes('escuro') ? 0.3 : 0) - (flags.includes('estourado') ? 0.3 : 0) - (sharpOk ? 0 : 0.2));
  const x = s.face ? s.skinX : s.cx, y = s.face ? s.skinY : s.cy;
  const shot = { i: 0, start: 0, end: src.duration, dur: src.duration, mean: s.mean, std: s.std, sat: s.sat, sharp: s.sharp, motion: 0, shake: 0, pan: 0, skin: s.skin, flags, quality: q,
    interest: Math.min(1, 0.35 + 0.3 * Math.min(1, s.sat * 1.6) + 0.2 * Math.min(1, s.std * 4) + (s.face ? 0.2 : 0)),
    path: [{ t: 0, x, y, face: !!s.face }, { t: src.duration, x, y, face: !!s.face }], thumb: tc.toDataURL('image/jpeg', 0.6), dominant: [0, 0, 0], still: true };
  return { step: src.duration, duration: src.duration, cuts: [], shots: [shot], samples: [{ t: 0, mean: s.mean, motion: 0, sat: s.sat, cx: s.cx, cy: s.cy, skin: s.skin }], still: true };
}

export async function analyzeVideo(src, opts = {}) {
  const seeker = await makeSeeker(src);
  try { return await analyzeVideoWith(seeker, src, opts); }
  finally { seeker.dispose(); }   // solta o vídeo mesmo se a análise for cancelada no meio
}
async function analyzeVideoWith(seeker, src, { onProgress, step } = {}) {
  const cv = document.createElement('canvas'); cv.width = SW; cv.height = SH;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const thumbCv = document.createElement('canvas');
  const tw = 160, th = Math.round(160 * (src.height || 9) / (src.width || 16));
  thumbCv.width = tw; thumbCv.height = th;
  const tctx = thumbCv.getContext('2d');
  const dur = src.duration;
  const dt = step || clamp(dur / 900, 0.1, 1.0);
  const samples = [];
  let prev = null;
  const grab = async t => { await seeker.seek(t); ctx.drawImage(seeker.el, 0, 0, SW, SH); };
  for (let t = 0; t < dur - 0.02; t += dt) {
    await grab(t);
    const s = stats(ctx, prev ? prev.gray : null);
    s.t = seeker.el.currentTime;
    samples.push(s); prev = s;
    onProgress && onProgress(Math.min(1, t / dur));
  }
  // --- trocas de cena ---
  const d = samples.map((s, i) => i ? histDist(samples[i - 1].hist, s.hist) * 0.7 + Math.min(1, s.motion * 3) * 0.3 : 0);
  const base = movingAvg(d, 9);
  const cutIdx = [];
  for (let i = 1; i < samples.length; i++) {
    const isPeak = d[i] >= (d[i - 1] || 0) && d[i] >= (d[i + 1] || 0);
    const big = d[i] > Math.max(0.18, 2.5 * base[i]) || histDist(samples[i - 1].hist, samples[i].hist) > 0.33;
    const blackToX = (samples[i - 1].mean < 0.05) !== (samples[i].mean < 0.05);
    if ((isPeak && big) || blackToX) { if (!cutIdx.length || i - cutIdx[cutIdx.length - 1] > 1) cutIdx.push(i); }
  }
  // refina cada corte ao quadro (busca binária entre as duas amostras)
  const fps = 30, cuts = [];
  for (const i of cutIdx) {
    let a = samples[i - 1].t, b = samples[i].t;
    const ha = samples[i - 1].hist, hb = samples[i].hist;
    while (b - a > 1.2 / fps) {
      const m = (a + b) / 2; await grab(m);
      const sm = stats(ctx, null);
      if (histDist(sm.hist, ha) < histDist(sm.hist, hb)) a = m; else b = m;
    }
    cuts.push(b);
  }
  // --- tomadas (shots) ---
  const bounds = [0, ...cuts, dur];
  const sharpMed = percentile(samples.map(s => s.sharp), 0.5) || 1e-6;
  const shots = [];
  for (let k = 0; k < bounds.length - 1; k++) {
    const st = bounds[k], en = bounds[k + 1];
    const ss = samples.filter(s => s.t >= st - 1e-3 && s.t < en - 1e-3);
    if (!ss.length || en - st < 0.05) continue;
    const avg = f => ss.reduce((a, s) => a + f(s), 0) / ss.length;
    const mean = avg(s => s.mean), std = avg(s => s.std), sat = avg(s => s.sat), sharp = avg(s => s.sharp);
    const motion = avg((s, i) => s.motion);
    // tremor = variação brusca do deslocamento global entre amostras seguidas
    let jit = 0; for (let i = 2; i < ss.length; i++) { jit += Math.hypot(ss[i].shift.dx - ss[i - 1].shift.dx, ss[i].shift.dy - ss[i - 1].shift.dy); }
    const shake = ss.length > 2 ? clamp(jit / (ss.length - 2) / 3, 0, 1) : 0;
    const pan = ss.length > 1 ? avg(s => Math.hypot(s.shift.dx, s.shift.dy)) : 0;
    const skin = avg(s => s.skin);
    const flags = [];
    if (mean < 0.04 && std < 0.03) flags.push('preto');
    else if (mean < 0.16) flags.push('escuro');
    if (mean > 0.9) flags.push('estourado'); else if (mean > 0.8) flags.push('claro');
    if (sharp < sharpMed * 0.35 && !flags.includes('preto')) flags.push('desfocado');
    if (shake > 0.35) flags.push('tremido');
    if (std < 0.03 && !flags.includes('preto')) flags.push('chapado');
    // qualidade técnica 0..1
    let q = 1;
    q -= flags.includes('preto') ? 1 : 0;
    q -= flags.includes('escuro') ? 0.35 : 0; q -= flags.includes('estourado') ? 0.35 : flags.includes('claro') ? 0.1 : 0;
    q -= flags.includes('desfocado') ? 0.25 : 0; q -= flags.includes('tremido') ? 0.3 : 0; q -= flags.includes('chapado') ? 0.2 : 0;
    q = clamp(q, 0, 1);
    // interesse visual 0..1: movimento, cor, contraste, gente
    const interest = clamp(0.35 * Math.min(1, motion * 12) + 0.2 * Math.min(1, sat * 1.6) + 0.15 * Math.min(1, std * 4) + 0.3 * Math.min(1, skin * 8), 0, 1);
    // caminho do assunto (para reenquadrar): prioriza pele, depois centro de interesse
    const path = ss.map(s => ({ t: s.t, x: s.face ? s.skinX : s.cx, y: s.face ? s.skinY : s.cy, face: !!s.face }));
    // miniatura no meio da tomada
    await seeker.seek((st + en) / 2);
    tctx.drawImage(seeker.el, 0, 0, tw, th);
    shots.push({
      i: shots.length, start: st, end: en, dur: en - st,
      mean, std, sat, sharp, motion, shake, pan, skin, flags, quality: q, interest, path,
      thumb: thumbCv.toDataURL('image/jpeg', 0.6),
      dominant: dominantColor(ss),
    });
  }
  onProgress && onProgress(1);
  return {
    step: dt, duration: dur, cuts, shots,
    samples: samples.map(s => ({ t: s.t, mean: s.mean, std: s.std, motion: s.motion, sat: s.sat, rgb: s.rgb, cx: s.cx, cy: s.cy, skin: s.skin, skinX: s.skinX, skinY: s.skinY })),
  };
}

function dominantColor(ss) {
  const h = new Float32Array(24); ss.forEach(s => { for (let k = 0; k < 24; k++) h[k] += s.hist[k]; });
  const pick = off => { let bi = 0; for (let k = 1; k < 8; k++) if (h[off + k] > h[off + bi]) bi = k; return bi * 32 + 16; };
  return [pick(0), pick(8), pick(16)];
}

// Onde o assunto está num instante (0..1), suavizado. Usado no reenquadramento.
export function subjectAt(shot, t) {
  const p = shot.path; if (!p || !p.length) return { x: 0.5, y: 0.5 };
  if (t <= p[0].t) return p[0];
  for (let i = 1; i < p.length; i++) if (p[i].t >= t) { const a = p[i - 1], b = p[i], u = (t - a.t) / Math.max(1e-6, b.t - a.t); return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }; }
  return p[p.length - 1];
}

// Suaviza o caminho do assunto para a câmera virtual não tremer.
export function smoothPath(path, win = 7) {
  if (!path.length) return path;
  const xs = movingAvg(Float32Array.from(path.map(p => p.x)), win), ys = movingAvg(Float32Array.from(path.map(p => p.y)), win);
  return path.map((p, i) => ({ t: p.t, x: xs[i], y: ys[i] }));
}
