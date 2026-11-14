// Liga as etapas: validação → análise de som → análise de imagem → música → plano.
import { decodeAudio, mixToMono } from './media.js';
import { analyzeSpeech, analyzeMusic } from './analyze-audio.js';
import { analyzeVideo, analyzeImage } from './analyze-video.js';

// cache por fonte (não reanalisa ao mudar só o pedido)
const cache = new Map();

// Trabalhador em segundo plano para a análise de som (FFT, batidas). Se o navegador não tiver, roda aqui mesmo.
let worker = null, wid = 0; const waiting = new Map();
function getWorker() {
  if (worker === false) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./audio-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = e => { const w = waiting.get(e.data.id); if (!w) return; waiting.delete(e.data.id); e.data.ok ? w.res(e.data.out) : w.rej(new Error(e.data.error)); };
    worker.onerror = e => { e.preventDefault && e.preventDefault(); worker = false; for (const w of waiting.values()) w.fallback(); waiting.clear(); };
  } catch (e) { worker = false; return null; }
  return worker;
}
export function analyzeInBackground(kind, x, sr) {
  const fallback = () => (kind === 'music' ? analyzeMusic : analyzeSpeech)(x, sr);
  const w = getWorker();
  if (!w) return Promise.resolve(fallback());
  return new Promise((res, rej) => {
    const id = ++wid;
    waiting.set(id, { res, rej, fallback: () => { try { res(fallback()); } catch (err) { rej(err); } } });
    w.postMessage({ id, kind, x, sr });   // copia o áudio (16 kHz mono: ~4 MB por 4 minutos)
  });
}

export async function analyzeSource(src, onStage = () => {}) {
  if (cache.has(src.id)) return cache.get(src.id);
  const item = { src, audio: null, video: null };
  if (src.kind === 'image') { item.video = await analyzeImage(src); cache.set(src.id, item); return item; }
  onStage({ stage: 'audio', src, p: 0, label: `Ouvindo o som de "${src.name}"` });
  const ab = await decodeAudio(src, 16000, 1);
  if (ab) item.audio = await analyzeInBackground('speech', mixToMono(ab), 16000);
  if (src.kind === 'video') {
    onStage({ stage: 'video', src, p: 0, label: `Assistindo "${src.name}"` });
    item.video = await analyzeVideo(src, { onProgress: p => onStage({ stage: 'video', src, p, label: `Assistindo "${src.name}"` }) });
  }
  cache.set(src.id, item);
  return item;
}

export async function analyzeMusicSource(src, onStage = () => {}) {
  const key = src.id + ':music';
  if (cache.has(key)) return cache.get(key);
  onStage({ stage: 'music', src, p: 0, label: `Achando as batidas de "${src.name}"` });
  const ab = await decodeAudio(src, 24000, 1);
  if (!ab) throw new Error(`"${src.name}" não tem som para usar como música.`);
  const m = await analyzeInBackground('music', mixToMono(ab), 24000);
  m.srcId = src.id; m.name = src.name;
  cache.set(key, m);
  return m;
}

export function forget(srcId) { cache.delete(srcId); cache.delete(srcId + ':music'); }
