// Liga as etapas: validação → análise de som → análise de imagem → música → plano.
import { decodeAudio, mixToMono } from './media.js';
import { analyzeSpeech, analyzeMusic } from './analyze-audio.js';
import { analyzeVideo, analyzeImage } from './analyze-video.js';

// cache por fonte (não reanalisa ao mudar só o pedido)
const cache = new Map();

export async function analyzeSource(src, onStage = () => {}) {
  if (cache.has(src.id)) return cache.get(src.id);
  const item = { src, audio: null, video: null };
  if (src.kind === 'image') { item.video = await analyzeImage(src); cache.set(src.id, item); return item; }
  onStage({ stage: 'audio', src, p: 0, label: `Ouvindo o som de "${src.name}"` });
  const ab = await decodeAudio(src, 16000, 1);
  if (ab) item.audio = analyzeSpeech(mixToMono(ab), 16000);
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
  const m = analyzeMusic(mixToMono(ab), 24000);
  m.srcId = src.id; m.name = src.name;
  cache.set(key, m);
  return m;
}

export function forget(srcId) { cache.delete(srcId); cache.delete(srcId + ':music'); }
