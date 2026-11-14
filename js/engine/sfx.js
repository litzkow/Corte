// Efeitos sonoros sintetizados por código. Não vêm de banco de sons: não têm dono, não têm licença a respeitar.
import { mulberry32 } from './util.js';

const SR = 48000;
const cache = new Map();

function buf(ctx, secs) { return ctx.createBuffer(2, Math.ceil(secs * SR), SR); }
function noise(rng) { return rng() * 2 - 1; }

// filtro passa-banda simples (biquad) aplicado em JS para gerar offline sem contexto
function biquadBP(x, f, q, sr = SR) {
  const w = 2 * Math.PI * f / sr, al = Math.sin(w) / (2 * q), b0 = al, b2 = -al, a0 = 1 + al, a1 = -2 * Math.cos(w), a2 = 1 - al;
  return { b0: b0 / a0, b1: 0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

const GEN = {
  // whoosh: ruído com filtro que varre de grave para agudo e volta, com pan
  whoosh(ctx, rng) {
    const d = 0.55, b = buf(ctx, d), L = b.getChannelData(0), R = b.getChannelData(1);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < L.length; i++) {
      const u = i / L.length;
      const f = 300 + 3800 * Math.sin(Math.PI * Math.pow(u, 0.8));
      const c = biquadBP(null, f, 1.2);
      const x = noise(rng);
      const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      const env = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 2);
      const pan = u;
      L[i] = y * env * (1 - pan * 0.7) * 1.4; R[i] = y * env * (0.3 + pan * 0.7) * 1.4;
    }
    return b;
  },
  // impacto cinematográfico: sub grave descendo + estalo + cauda
  impact(ctx, rng) {
    const d = 1.6, b = buf(ctx, d), L = b.getChannelData(0), R = b.getChannelData(1);
    let ph = 0, lp = 0;
    for (let i = 0; i < L.length; i++) {
      const t = i / SR;
      const f = 38 + 110 * Math.exp(-t / 0.05);
      ph += 2 * Math.PI * f / SR;
      const sub = Math.sin(ph) * Math.exp(-t / 0.45);
      const n = noise(rng); lp += (n - lp) * 0.08;
      const crack = n * Math.exp(-t / 0.012) * 0.6 + lp * Math.exp(-t / 0.18) * 0.9;
      const v = Math.tanh(1.6 * (sub * 0.95 + crack));
      L[i] = v * 0.9; R[i] = v * 0.9;
    }
    return b;
  },
  // hit: mais curto e seco que o impacto
  hit(ctx, rng) {
    const d = 0.5, b = buf(ctx, d), L = b.getChannelData(0), R = b.getChannelData(1);
    let ph = 0;
    for (let i = 0; i < L.length; i++) {
      const t = i / SR; const f = 70 + 200 * Math.exp(-t / 0.02); ph += 2 * Math.PI * f / SR;
      const v = Math.tanh(2 * (Math.sin(ph) * Math.exp(-t / 0.12) + noise(rng) * Math.exp(-t / 0.008) * 0.7));
      L[i] = v * 0.8; R[i] = v * 0.8;
    }
    return b;
  },
  // boom: explosão grave e longa
  boom(ctx, rng) {
    const d = 2.6, b = buf(ctx, d), L = b.getChannelData(0), R = b.getChannelData(1);
    let lp = 0, lp2 = 0, ph = 0;
    for (let i = 0; i < L.length; i++) {
      const t = i / SR; const n = noise(rng);
      lp += (n - lp) * 0.02; lp2 += (lp - lp2) * 0.05;
      ph += 2 * Math.PI * (32 + 40 * Math.exp(-t / 0.3)) / SR;
      const v = Math.tanh(3 * (lp2 * 6 * Math.exp(-t / 0.9) + Math.sin(ph) * 0.7 * Math.exp(-t / 0.7)));
      L[i] = v * 0.85; R[i] = v * 0.85 * (0.9 + 0.1 * Math.sin(t * 7));
    }
    return b;
  },
  // riser: tensão subindo por 1,6 s (ruído + tom que sobe), termina no corte
  riser(ctx, rng) {
    const d = 1.7, b = buf(ctx, d), L = b.getChannelData(0), R = b.getChannelData(1);
    let ph1 = 0, ph2 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < L.length; i++) {
      const u = i / L.length;
      const f = 180 * Math.pow(2, u * 2.4);
      ph1 += 2 * Math.PI * f / SR; ph2 += 2 * Math.PI * f * 1.007 / SR;
      const c = biquadBP(null, 500 + 6000 * u * u, 0.9);
      const x = noise(rng);
      const y = c.b0 * x + c.b2 * x2 - c.a1 * y1 - c.a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y;
      const env = Math.pow(u, 1.8) * (u > 0.97 ? (1 - u) / 0.03 : 1);
      const v = (0.35 * (Math.sin(ph1) + Math.sin(ph2)) + 0.8 * y) * env;
      L[i] = v * (0.9 + 0.1 * Math.sin(u * 40)); R[i] = v * (0.9 - 0.1 * Math.sin(u * 40));
    }
    return b;
  },
  // pop: bolha curta para legenda/ênfase
  pop(ctx) {
    const d = 0.12, b = buf(ctx, d), L = b.getChannelData(0), R = b.getChannelData(1);
    let ph = 0;
    for (let i = 0; i < L.length; i++) { const t = i / SR; ph += 2 * Math.PI * (900 - 3500 * t) / SR; const v = Math.sin(ph) * Math.exp(-t / 0.025) * 0.6; L[i] = v; R[i] = v; }
    return b;
  },
  click(ctx, rng) {
    const d = 0.05, b = buf(ctx, d), L = b.getChannelData(0), R = b.getChannelData(1);
    for (let i = 0; i < L.length; i++) { const t = i / SR; const v = (noise(rng) * 0.5 + Math.sin(2 * Math.PI * 2400 * t)) * Math.exp(-t / 0.004) * 0.5; L[i] = v; R[i] = v; }
    return b;
  },
  ding(ctx) {
    const d = 1.0, b = buf(ctx, d), L = b.getChannelData(0), R = b.getChannelData(1);
    for (let i = 0; i < L.length; i++) { const t = i / SR; const v = (Math.sin(2 * Math.PI * 1318 * t) + 0.5 * Math.sin(2 * Math.PI * 2637 * t) + 0.25 * Math.sin(2 * Math.PI * 3951 * t)) * Math.exp(-t / 0.25) * 0.3; L[i] = v; R[i] = v; }
    return b;
  },
  beep(ctx) {
    const d = 1.5, b = buf(ctx, d), L = b.getChannelData(0), R = b.getChannelData(1);
    for (let i = 0; i < L.length; i++) { const t = i / SR; const v = Math.sin(2 * Math.PI * 1000 * t) * 0.32 * Math.min(1, t / 0.005); L[i] = v; R[i] = v; }
    return b;
  },
  // swish: whoosh curto e agudo
  swish(ctx, rng) {
    const d = 0.25, b = buf(ctx, d), L = b.getChannelData(0), R = b.getChannelData(1);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < L.length; i++) { const u = i / L.length; const c = biquadBP(null, 2500 + 4000 * u, 1.5); const x = noise(rng); const y = c.b0 * x + c.b2 * x2 - c.a1 * y1 - c.a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; const env = Math.sin(Math.PI * u) ** 2; L[i] = y * env * (1.2 - u * 0.6); R[i] = y * env * (0.6 + u * 0.6); }
    return b;
  },
  // obturador de câmera: dois cliques secos com ruído curto
  camera(ctx, rng) {
    const d = 0.22, b = buf(ctx, d), L = b.getChannelData(0), R = b.getChannelData(1);
    for (let i = 0; i < L.length; i++) { const t = i / SR; const e1 = Math.exp(-t * 180) * (t < 0.05 ? 1 : 0), t2 = t - 0.11, e2 = t2 > 0 ? Math.exp(-t2 * 140) : 0; const v = noise(rng) * (e1 * 0.9 + e2 * 0.7) + Math.sin(2 * Math.PI * 1800 * t) * (e1 + e2) * 0.2; L[i] = v; R[i] = v; }
    return b;
  },
  // notificação: duas notas curtas subindo
  notify(ctx) {
    const d = 0.42, b = buf(ctx, d), L = b.getChannelData(0), R = b.getChannelData(1);
    for (let i = 0; i < L.length; i++) { const t = i / SR; const n2 = t > 0.13; const f = n2 ? 1318.5 : 987.8; const tt = n2 ? t - 0.13 : t; const env = Math.exp(-tt * 14) * Math.min(1, tt / 0.004); const v = (Math.sin(2 * Math.PI * f * tt) + 0.3 * Math.sin(4 * Math.PI * f * tt)) * env * 0.35; L[i] = v; R[i] = v; }
    return b;
  },
  // drop: queda de tom grave (sub) com impacto
  drop(ctx, rng) {
    const d = 1.1, b = buf(ctx, d), L = b.getChannelData(0), R = b.getChannelData(1); let ph = 0;
    for (let i = 0; i < L.length; i++) { const t = i / SR; const f = 120 * Math.exp(-t * 3) + 35; ph += 2 * Math.PI * f / SR; const env = Math.exp(-t * 2.5) * Math.min(1, t / 0.005); const v = Math.sin(ph) * env * 0.9 + noise(rng) * Math.exp(-t * 40) * 0.3; L[i] = v; R[i] = v; }
    return b;
  },
  // tensão: drone grave com batimento lento (suspense)
  tension(ctx, rng) {
    const d = 3, b = buf(ctx, d), L = b.getChannelData(0), R = b.getChannelData(1);
    for (let i = 0; i < L.length; i++) { const t = i / SR, u = t / d; const env = Math.sin(Math.PI * u) ** 1.5; const v = (Math.sin(2 * Math.PI * 55 * t) + 0.6 * Math.sin(2 * Math.PI * 58.3 * t) + 0.25 * Math.sin(2 * Math.PI * 110.5 * t)) * env * 0.28 + noise(rng) * env * 0.02; L[i] = v; R[i] = v * 0.95; }
    return b;
  },
  glitch(ctx, rng) {
    const d = 0.35, b = buf(ctx, d), L = b.getChannelData(0), R = b.getChannelData(1);
    let hold = 0, val = 0;
    for (let i = 0; i < L.length; i++) { if (hold-- <= 0) { hold = 40 + rng() * 600; val = noise(rng) * (rng() < 0.3 ? 0 : 0.6); } const t = i / SR; const v = val * Math.exp(-t / 0.25) + 0.2 * Math.sign(Math.sin(2 * Math.PI * 180 * t)) * (rng() < 0.5 ? 1 : 0) * Math.exp(-t / 0.1); L[i] = v; R[i] = -v; }
    return b;
  },
};

export const SFX_KINDS = Object.keys(GEN);

// Onde o "ponto" do som cai (o riser termina no corte, o whoosh tem o meio no corte).
export const SFX_ANCHOR = { whoosh: 0.32, riser: 1.62, impact: 0, hit: 0, boom: 0, pop: 0, click: 0, ding: 0, glitch: 0, beep: 0, swish: 0.12, camera: 0, notify: 0, drop: 0, tension: 2.4 };

export function makeSfx(ctx, kind, variant = 0) {
  const key = kind + ':' + variant;
  if (cache.has(key)) return cache.get(key);
  const g = GEN[kind] || GEN.whoosh;
  const b = g(ctx, mulberry32(1234 + variant * 97 + kind.length));
  cache.set(key, b);
  return b;
}
