// Utilidades puras usadas por todo o motor.
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const ease = {
  linear: t => t,
  inOut: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t * t,
  back: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  elastic: t => t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI) / 3) + 1,
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function percentile(arr, p) {
  if (!arr.length) return 0;
  const a = Array.from(arr).sort((x, y) => x - y);
  const i = clamp((a.length - 1) * p, 0, a.length - 1);
  const lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}

export function movingAvg(arr, win) {
  const out = new Float32Array(arr.length);
  const h = Math.max(1, Math.floor(win / 2));
  let s = 0, n = 0;
  for (let i = 0; i < Math.min(h, arr.length); i++) { s += arr[i]; n++; }
  for (let i = 0; i < arr.length; i++) {
    const add = i + h, rem = i - h - 1;
    if (add < arr.length) { s += arr[add]; n++; }
    if (rem >= 0) { s -= arr[rem]; n--; }
    out[i] = s / n;
  }
  return out;
}

export function fmtTime(s, withMs = false) {
  if (!isFinite(s)) return '--:--';
  const neg = s < 0; s = Math.abs(s);
  const m = Math.floor(s / 60), sec = s - m * 60;
  const ss = withMs ? sec.toFixed(1).padStart(4, '0') : String(Math.floor(sec)).padStart(2, '0');
  return (neg ? '-' : '') + String(m).padStart(2, '0') + ':' + ss;
}

export function parseTimecode(str) {
  // "00:32", "1:05", "2:03.5", "32s", "32 segundos"
  const m = String(str).match(/(\d+):(\d{1,2}(?:[.,]\d+)?)/);
  if (m) return +m[1] * 60 + parseFloat(m[2].replace(',', '.'));
  const n = String(str).match(/(\d+(?:[.,]\d+)?)/);
  return n ? parseFloat(n[1].replace(',', '.')) : NaN;
}

export const dbToGain = db => Math.pow(10, db / 20);
export const gainToDb = g => 20 * Math.log10(Math.max(g, 1e-9));

export function uid(prefix = 'id') { return prefix + '_' + Math.random().toString(36).slice(2, 9); }

// Intervalos [{start,end}] — união, interseção e complemento.
export function mergeIntervals(list, gap = 0) {
  const a = list.filter(x => x.end > x.start).map(x => ({ ...x })).sort((x, y) => x.start - y.start);
  const out = [];
  for (const x of a) {
    const last = out[out.length - 1];
    if (last && x.start <= last.end + gap) last.end = Math.max(last.end, x.end);
    else out.push(x);
  }
  return out;
}
export function invertIntervals(list, start, end) {
  const out = []; let t = start;
  for (const x of mergeIntervals(list)) {
    if (x.start > t) out.push({ start: t, end: Math.min(x.start, end) });
    t = Math.max(t, x.end);
  }
  if (t < end) out.push({ start: t, end });
  return out.filter(x => x.end - x.start > 1e-6);
}
export const totalLen = list => list.reduce((s, x) => s + (x.end - x.start), 0);

export function deepClone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
export function deepMerge(base, over) {
  if (over == null) return deepClone(base);
  if (typeof base !== 'object' || base === null || Array.isArray(base) || typeof over !== 'object' || Array.isArray(over)) return deepClone(over);
  const out = deepClone(base);
  for (const k of Object.keys(over)) out[k] = (k in out) ? deepMerge(out[k], over[k]) : deepClone(over[k]);
  return out;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
