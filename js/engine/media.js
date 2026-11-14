// Carregar arquivos de mídia, ler metadados e decodificar áudio.
import { uid } from './util.js';

export const LIMITS = {
  // Acima disso o aparelho provavelmente não aguenta decodificar o áudio inteiro na memória.
  maxBytesMobile: 1.0e9,
  maxBytesDesktop: 3.5e9,
};

export const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

export function validateFile(file) {
  const errs = [];
  const okType = /^(video|audio|image)\//.test(file.type) || /\.(mp4|mov|m4v|webm|mkv|mp3|m4a|wav|aac|ogg|flac|jpe?g|png|webp|heic|gif)$/i.test(file.name);
  if (!okType) errs.push(`"${file.name}" não parece ser vídeo, áudio ou foto.`);
  const max = isMobile() ? LIMITS.maxBytesMobile : LIMITS.maxBytesDesktop;
  if (file.size > max) errs.push(`"${file.name}" tem ${(file.size / 1e9).toFixed(1)} GB. Neste aparelho o limite seguro é ${(max / 1e9).toFixed(1)} GB${isMobile() ? '. Vídeos longos funcionam melhor no computador, pelo Chrome' : ''}.`);
  return errs;
}

function waitEvent(el, ok, bad = 'error', timeout = 30000) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => { cleanup(); rej(new Error('tempo esgotado esperando ' + ok)); }, timeout);
    const okf = () => { cleanup(); res(); };
    const badf = () => { cleanup(); rej(new Error(el.error ? `erro de mídia ${el.error.code}` : 'erro de mídia')); };
    function cleanup() { clearTimeout(t); el.removeEventListener(ok, okf); el.removeEventListener(bad, badf); }
    el.addEventListener(ok, okf); el.addEventListener(bad, badf);
  });
}

export const IMAGE_DUR = 600; // foto vira um "vídeo parado" bem longo; o plano usa só o que precisa

export async function loadSource(fileOrUrl, opts = {}) {
  const isFile = typeof fileOrUrl !== 'string';
  const url = isFile ? URL.createObjectURL(fileOrUrl) : fileOrUrl;
  const name = isFile ? fileOrUrl.name : fileOrUrl.split('/').pop();
  const type = isFile ? fileOrUrl.type : '';
  if (/^image\//.test(type) || /\.(jpe?g|png|webp|heic|gif)$/i.test(name)) {
    const img = new Image(); img.decoding = 'async'; img.src = url;
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('não consegui abrir a foto (HEIC só abre no Safari)')); });
    return { id: opts.id || uid('src'), name, url, file: isFile ? fileOrUrl : null, size: isFile ? fileOrUrl.size : 0, kind: 'image', duration: IMAGE_DUR, width: img.naturalWidth, height: img.naturalHeight, role: opts.role || 'footage', img };
  }
  const audioOnly = /^audio\//.test(type) || /\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(name);
  const el = document.createElement(audioOnly ? 'audio' : 'video');
  el.preload = 'metadata'; el.muted = true; el.playsInline = true; el.crossOrigin = 'anonymous';
  el.src = url;
  await waitEvent(el, 'loadedmetadata');
  let duration = el.duration;
  if (!isFinite(duration)) { // alguns webm não informam duração
    el.currentTime = 1e7; await waitEvent(el, 'seeked').catch(() => {}); duration = el.duration; el.currentTime = 0;
  }
  const src = {
    id: opts.id || uid('src'), name, url, file: isFile ? fileOrUrl : null, size: isFile ? fileOrUrl.size : 0,
    kind: audioOnly || !el.videoWidth ? 'audio' : 'video',
    duration, width: el.videoWidth || 0, height: el.videoHeight || 0,
    role: opts.role || (audioOnly ? 'audio' : 'footage'),
  };
  el.removeAttribute('src'); el.load();
  return src;
}

async function getBytes(src) {
  if (src.file) return await src.file.arrayBuffer();
  return await (await fetch(src.url)).arrayBuffer();
}

// Decodifica o áudio para uma taxa e número de canais; devolve AudioBuffer ou null se não houver áudio.
export async function decodeAudio(src, sampleRate = 16000, channels = 1) {
  if (src.kind === 'image') return null;
  const bytes = await getBytes(src);
  const frames = Math.max(1, Math.ceil(src.duration * sampleRate));
  const ctx = new OfflineAudioContext(channels, frames, sampleRate);
  try {
    return await ctx.decodeAudioData(bytes);
  } catch (e) {
    return null; // vídeo sem trilha de áudio
  }
}

export function mixToMono(buf) {
  if (!buf) return null;
  if (buf.numberOfChannels === 1) return buf.getChannelData(0);
  const n = buf.length, out = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i]; }
  for (let i = 0; i < n; i++) out[i] /= buf.numberOfChannels;
  return out;
}

// Elemento de vídeo pronto para tirar quadros por busca.
export async function makeSeeker(src) {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
  v.src = src.url;
  await waitEvent(v, 'loadeddata');
  return {
    el: v,
    async seek(t) {
      const target = Math.max(0, Math.min(src.duration - 0.04, t));
      if (Math.abs(v.currentTime - target) < 1e-3 && v.readyState >= 2) return;
      v.currentTime = target;
      await waitEvent(v, 'seeked', 'error', 15000);
    },
    dispose() { v.removeAttribute('src'); v.load(); },
  };
}
