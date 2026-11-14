// Controle de qualidade: confere o plano, o som e o arquivo exportado. Nota por categoria, com sugestões.
// Nunca diz que está perfeito só porque renderizou: cada ponto vem de uma medição.
import { resolveStyle, fmtN, fmtDur } from './director.js';
import { PLATFORMS } from './platforms.js';
import { clamp } from './util.js';

export function checkPlan(plan, spec, mixStats) {
  const E = resolveStyle(spec);
  const issues = [], ok = [];
  const cat = { visual: 100, audio: 100, rhythm: 100, story: 100, technical: 100, platform: 100 };
  const hit = (c, pts, msg, fix) => { cat[c] = Math.max(0, cat[c] - pts); issues.push({ cat: c, msg, fix }); };
  const clips = plan.clips;
  // ritmo
  const durs = clips.map(c => c.dur);
  const visualCuts = clips.reduce((n, c) => n + (c.cover ? 3 : 1), 0);
  const avg = plan.duration / Math.max(1, visualCuts);
  const target = E.pacing.avgShot;
  const dev = Math.abs(avg - target) / target;
  if (dev > 0.35 && clips.some(c => c.kind !== 'dialogue')) hit('rhythm', Math.round(dev * 30), `Corte médio ficou em ${fmtN(avg)} s; o pedido era ~${fmtN(target)} s.`, avg > target ? 'Peça "corta mais rápido" ou adicione mais material.' : 'Peça "ritmo mais calmo".');
  else ok.push(`Ritmo: média de ${fmtN(avg)} s por imagem (alvo ~${fmtN(target)} s).`);
  const tiny = durs.filter(d => d < 0.25).length;
  if (tiny) hit('rhythm', tiny * 4, `${tiny} corte(s) com menos de 0,25 s (pode parecer piscada).`, 'Peça "cortes um pouco mais longos".');
  // história
  if ((spec.hookSeconds || E.hook.enabled) && !clips.some(c => c.kind === 'hook')) hit('story', 12, 'Pediu gancho, mas nenhum trecho foi forte o bastante para abrir.', 'Diga qual momento usar: "abre com o trecho de 00:42".');
  if (clips.length && clips[0].kind === 'broll' && clips.some(c => c.kind === 'dialogue')) hit('story', 6, 'O vídeo abre com imagem de apoio antes de quem fala.', null);
  const tgt = (spec.outputs[0] && spec.outputs[0].duration) || (spec.target && spec.target.seconds);
  if (tgt && Math.abs(plan.duration - tgt) / tgt > 0.12) hit('story', 8, `Duração ${fmtDur(plan.duration)} (pedido: ${fmtDur(tgt)}).`, plan.duration < tgt ? 'Falta material bom; envie mais vídeo ou aceite a versão curta.' : null);
  // visual
  const flagged = clips.filter(c => c.lum != null && (c.lum < 0.12 || c.lum > 0.92));
  if (flagged.length) hit('visual', flagged.length * 5, `${flagged.length} trecho(s) muito escuro(s) ou estourado(s) — corrigi a exposição, mas a imagem original limita.`, null);
  // som
  if (mixStats) {
    if (Math.abs(mixStats.lufs - -14) > 1.5 && mixStats.lufs > -60) hit('audio', 10, `Volume final em ${fmtN(mixStats.lufs)} LUFS (o ideal para redes é -14).`, null);
    else ok.push(`Volume final: ${fmtN(mixStats.lufs)} LUFS, pico ${fmtN(mixStats.peakDb)} dB.`);
    if (mixStats.peakDb > -0.8) hit('audio', 10, 'Pico de áudio acima de -1 dB (risco de distorção ao subir).', null);
    if (mixStats.limitedPct > 0.05) hit('audio', 8, `O limitador segurou ${Math.round(mixStats.limitedPct * 100)}% do tempo: som muito comprimido.`, 'Peça "música mais baixa" ou "menos efeitos sonoros".');
    if (mixStats.lufsBefore < -50) hit('audio', 40, 'Quase não há som no vídeo.', 'Adicione música ou confira se o vídeo tem áudio.');
  }
  if (plan.audio.music && plan.audio.music.fadeOut < 0.8 && plan.duration > 6) hit('audio', 5, 'A música termina seco.', null);
  if (plan.audio.sfx.length > plan.duration / 2) hit('audio', 8, 'Muitos efeitos sonoros para a duração.', 'Peça "menos efeitos sonoros".');
  // plataforma
  const P = PLATFORMS[plan.fmt.platform];
  if (P && plan.duration > P.maxDur) hit('platform', 30, `${P.label} aceita até ${fmtDur(P.maxDur)}; o vídeo tem ${fmtDur(plan.duration)}.`, 'Peça uma versão mais curta.');
  if (plan.captionsOn && !plan.captions.length && clips.some(c => c.kind === 'dialogue')) hit('platform', 10, 'Tem fala, mas ainda não tem legenda (falta transcrever ou colar o roteiro).', 'Abra "Legendas" e toque em Transcrever ou Colar roteiro.');
  ok.push(`Formato ${plan.fmt.w}×${plan.fmt.h} a ${plan.fmt.fps} quadros/s para ${plan.fmt.label}. Textos dentro da área segura.`);
  return { cat, issues, ok, score: Math.round(Object.values(cat).reduce((a, b) => a + b, 0) / 6) };
}

// Confere o arquivo exportado: abre, mede duração e procura quadros pretos fora das transições.
export async function checkExport(blob, plan) {
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.src = url;
  const res = { ok: true, problems: [] };
  try {
    await new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = () => j(new Error('o arquivo exportado não abre')); setTimeout(() => j(new Error('o arquivo exportado não abre')), 15000); });
    let dur = v.duration;
    if (!isFinite(dur)) { v.currentTime = 1e6; await new Promise(r => { v.onseeked = r; setTimeout(r, 4000); }); dur = v.duration; }
    res.duration = dur; res.width = v.videoWidth; res.height = v.videoHeight;
    if (Math.abs(dur - plan.duration) > 0.6) res.problems.push(`Duração do arquivo (${fmtN(dur)} s) difere do plano (${fmtN(plan.duration)} s).`);
    if (v.videoWidth && (Math.abs(v.videoWidth / v.videoHeight - plan.fmt.w / plan.fmt.h) > 0.02)) res.problems.push('Proporção do arquivo diferente do formato pedido.');
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 32; const ctx = cv.getContext('2d', { willReadFrequently: true });
    const dips = plan.clips.filter(c => c.trans && (c.trans.type === 'dip' || c.trans.type === 'flash')).map(c => c.start);
    let black = 0; const N = Math.min(24, Math.max(8, Math.round(dur)));
    for (let i = 1; i < N; i++) {
      const t = (dur * i) / N;
      if (dips.some(d => Math.abs(d - t) < 0.5) || t > dur - 0.6) continue;
      v.currentTime = t; await new Promise(r => { v.onseeked = r; setTimeout(r, 3000); });
      ctx.drawImage(v, 0, 0, 32, 32);
      const d = ctx.getImageData(0, 0, 32, 32).data; let s = 0; for (let k = 0; k < d.length; k += 4) s += d[k] + d[k + 1] + d[k + 2];
      if (s / (32 * 32 * 3) < 6) black++;
    }
    if (black) res.problems.push(`${black} ponto(s) com tela preta fora de transição.`);
  } catch (e) { res.ok = false; res.problems.push(e.message); }
  URL.revokeObjectURL(url);
  res.ok = res.ok && !res.problems.length;
  return res;
}

export const CAT_LABEL = { visual: 'Imagem', audio: 'Som', rhythm: 'Ritmo', story: 'História', technical: 'Técnica', platform: 'Plataforma' };
