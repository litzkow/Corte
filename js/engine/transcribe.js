// Transcrição. Dois caminhos grátis:
// 1) Whisper rodando no próprio aparelho (transformers.js). Baixa o modelo uma vez (~75 MB) e fica no cache.
//    NÃO TESTADO no ambiente de construção (sem internet). Se falhar, o erro aparece claro na tela.
// 2) Roteiro colado: você cola o texto e eu sincronizo com a fala detectada. Testado.
import { decodeAudio, mixToMono } from './media.js';

const syl = w => Math.max(1, (w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[aeiouy]+/g) || []).length);

// Sincroniza um roteiro com os trechos de fala detectados. speech = [{start,end}] da análise de áudio.
export function alignScript(text, speech) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length || !speech.length) return [];
  const runs = speech.filter(r => r.end - r.start > 0.12);
  const totalT = runs.reduce((s, r) => s + r.end - r.start, 0);
  const wsyl = words.map(w => syl(w) + (/[.!?]$/.test(w) ? 1.2 : /[,;:]$/.test(w) ? 0.5 : 0));
  const totalS = wsyl.reduce((a, b) => a + b, 0);
  // reparte palavras entre os trechos de fala conforme a duração de cada trecho
  const out = [];
  let wi = 0, accS = 0;
  for (let ri = 0; ri < runs.length && wi < words.length; ri++) {
    const r = runs[ri];
    const shareS = (r.end - r.start) / totalT * totalS;
    const target = accS + shareS;
    const chunk = [];
    while (wi < words.length && (accS + wsyl[wi] / 2 <= target || ri === runs.length - 1)) { chunk.push(wi); accS += wsyl[wi]; wi++; }
    // pontuação forte no fim do trecho é natural: se faltou só uma palavra pequena, tudo bem
    const cs = chunk.reduce((s, i) => s + wsyl[i], 0) || 1;
    let t = r.start;
    for (const i of chunk) { const d = (r.end - r.start) * wsyl[i] / cs; out.push({ w: words[i], t0: t, t1: t + d * 0.92 }); t += d; }
  }
  return out;
}

// Whisper no aparelho.
// iPhone/iPad e aparelhos com pouca memória: modelo pequeno (tiny) e sem WebGPU. O modelo maior pela placa de
// vídeo estoura a memória do Safari no iPhone e a página recarrega sozinha ("volta para o início").
const IOS = typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)));
export const LIGHT_DEVICE = IOS || (typeof navigator !== 'undefined' && navigator.deviceMemory && navigator.deviceMemory <= 4);
const DEFAULT_MODEL = LIGHT_DEVICE ? 'onnx-community/whisper-tiny' : 'onnx-community/whisper-base';
let pipe = null, loading = null;
async function getPipe(model, onProgress) {
  if (pipe) return pipe;
  if (!loading) loading = (async () => {
    onProgress({ stage: 'modelo', p: 0, label: 'Baixando o modelo de transcrição (só na primeira vez)' });
    const mod = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2');
    mod.env.allowLocalModels = false;
    const device = navigator.gpu && !LIGHT_DEVICE ? 'webgpu' : 'wasm';
    return await mod.pipeline('automatic-speech-recognition', model, {
      device, dtype: device === 'webgpu' ? 'fp32' : 'q8',
      progress_callback: e => { if (e.status === 'progress' && e.total) onProgress({ stage: 'modelo', p: e.loaded / e.total, label: 'Baixando o modelo de transcrição' }); },
    });
  })();
  try { pipe = await loading; return pipe; } catch (e) { loading = null; throw e; }
}
// Pedido falado curto (gravado pelo microfone): devolve só o texto.
export async function whisperText(blob, seconds, { language = null, model = DEFAULT_MODEL, onProgress = () => {} } = {}) {
  const p = await getPipe(model, onProgress);
  onProgress({ stage: 'transcrevendo', p: 0, label: 'Entendendo o que você falou' });
  const bytes = await blob.arrayBuffer();
  const ctx = new OfflineAudioContext(1, Math.ceil((seconds + 2) * 16000), 16000);
  const ab = await ctx.decodeAudioData(bytes);
  const res = await p(mixToMono(ab), { chunk_length_s: 30, stride_length_s: 5, ...(language ? { language, task: 'transcribe' } : {}) });
  return String(res.text || '').trim();
}
export async function whisperTranscribe(src, { language = null, model = DEFAULT_MODEL, onProgress = () => {} } = {}) {
  pipe = await getPipe(model, onProgress);
  onProgress({ stage: 'transcrevendo', p: 0, label: `Transcrevendo "${src.name}"` });
  const ab = await decodeAudio(src, 16000, 1);
  if (!ab) return { words: [], text: '' };
  const audio = mixToMono(ab);
  const res = await pipe(audio, { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5, ...(language ? { language, task: 'transcribe' } : {}) });
  const words = (res.chunks || []).map(c => ({ w: String(c.text).trim(), t0: c.timestamp[0], t1: c.timestamp[1] ?? c.timestamp[0] + 0.3 })).filter(w => w.w);
  onProgress({ stage: 'transcrevendo', p: 1, label: 'Transcrição pronta' });
  return { words, text: res.text || words.map(w => w.w).join(' ') };
}

// Palavras de muleta e repetições (para "tirar erros e repetições" quando há transcrição).
const FILLERS = new Set(['ahn', 'ah', 'eh', 'é...', 'hum', 'hmm', 'uh', 'um', 'uhm', 'tipo', 'né', 'like', 'you know', 'basicamente', 'entao', 'então']);
export function findFillers(words) {
  const bad = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i].w.toLowerCase().replace(/[^\p{L}]/gu, '');
    if (['ahn', 'ah', 'eh', 'hum', 'hmm', 'uh', 'um', 'uhm', 'er', 'erm'].includes(w)) bad.push({ start: words[i].t0, end: words[i].t1, why: 'muleta' });
    // repetição imediata: "eu eu", "the the"
    if (i > 0 && w && w === words[i - 1].w.toLowerCase().replace(/[^\p{L}]/gu, '') && w.length > 1) bad.push({ start: words[i - 1].t0, end: words[i - 1].t1, why: 'repetição' });
  }
  return bad;
}
export { FILLERS };
