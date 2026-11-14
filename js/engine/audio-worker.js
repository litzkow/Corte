// Análise de áudio fora da tela principal: o app continua respondendo enquanto o som é estudado.
import { analyzeSpeech, analyzeMusic, denoise } from './analyze-audio.js';
self.onmessage = e => {
  const { id, kind, x, sr } = e.data;
  try {
    const out = kind === 'denoise' ? denoise(x, sr, e.data.amount) : kind === 'music' ? analyzeMusic(x, sr) : analyzeSpeech(x, sr);
    self.postMessage({ id, ok: true, out });
  } catch (err) { self.postMessage({ id, ok: false, error: String(err && err.message || err) }); }
};
