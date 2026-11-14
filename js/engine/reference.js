// "Edita igual a este vídeo": mede o vídeo de referência e transforma em parâmetros.
// Copia o jeito (ritmo, cor, energia), nunca o conteúdo.
import { PRESETS } from './styles.js';
import { fmtN } from './director.js';
import { clamp } from './util.js';

export function referenceProfile(item, musicA = null) {
  const v = item.video, a = item.audio;
  if (!v) return null;
  const dur = v.duration;
  const shots = v.shots.filter(s => !s.flags.includes('preto'));
  const avgShot = dur / Math.max(1, shots.length);
  const S = v.samples.filter(s => s.rgb);
  const avg = f => S.reduce((x, s) => x + f(s), 0) / Math.max(1, S.length);
  const luma = avg(s => s.mean), sat = avg(s => s.sat), contrast = avg(s => s.std || 0.2), motion = avg(s => s.motion);
  const warm = avg(s => s.rgb[0] - s.rgb[2]);
  let look = 'natural';
  if (sat < 0.07) look = 'bw';
  else if (luma < 0.3 && contrast > 0.18) look = 'moody';
  else if (warm > 0.1 && sat < 0.45) look = 'warmfilm';
  else if (warm < -0.04) look = 'coolcine';
  else if (luma > 0.58) look = 'bright';
  else if (sat > 0.5 && contrast > 0.22) look = 'action';
  else if (contrast > 0.24) look = 'hollywood';
  else if (sat > 0.42) look = 'commercial';
  const speech = a ? a.speechRatio : 0;
  let style;
  if (speech > 0.45) style = avgShot < 2 ? 'energetic' : avgShot < 4 ? 'vlog' : 'interview';
  else if (avgShot < 0.9) style = motion > 0.03 ? 'sports' : 'action';
  else if (avgShot < 1.6) style = 'social';
  else if (avgShot < 3.2) style = look === 'warmfilm' ? 'travel' : 'cinematic';
  else style = 'documentary';
  const darkCuts = v.shots.filter(s => s.flags.includes('preto') && s.dur < 0.8).length;
  const lines = [
    `Do vídeo de referência "${item.src.name}": ${shots.length} tomadas em ${fmtN(dur)} s, corte médio de ${fmtN(avgShot)} s`,
    `Cor parecida: ${look}; ritmo e energia de "${PRESETS[style].label}"`,
  ];
  if (darkCuts) lines.push(`Usa ${darkCuts} passagem(ns) pelo preto entre cenas`);
  if (speech > 0.45) lines.push('Tem muita fala: mantive a fala inteira e cortes na respiração');
  const over = { pacing: { avgShot: clamp(avgShot, 0.4, 12) }, color: { look } };
  if (darkCuts) over.transitions = { mix: { cut: 0.7, dip: 0.3 }, dur: 0.4 };
  if (shots[0] && shots[0].dur < 2.2) over.hook = { enabled: true, seconds: 2 };
  return { style, over, lines, avgShot, look };
}

export function applyReference(spec, prof) {
  spec.mix = [{ id: prof.style, w: 1 }];
  spec.over = { ...spec.over };
  for (const [k, v] of Object.entries(prof.over)) spec.over[k] = { ...(spec.over[k] || {}), ...v };
  return spec;
}
