// O PLANO DE EDIÇÃO: decide o que entra, em que ordem, quanto dura, onde corta,
// que transição, que efeito, que som. Tudo vira uma linha do tempo editável (nada é "assado" no vídeo).
import { resolveStyle, fmtN, fmtDur } from './director.js';
import { makeFormat } from './platforms.js';
import { bestMusicWindow, HOP_S } from './analyze-audio.js';
import { smoothPath } from './analyze-video.js';
import { clamp, mulberry32, uid, mergeIntervals, totalLen, invertIntervals } from './util.js';
import { markEmphasis as markEmph } from './captions.js';
import { findFillers } from './transcribe.js';

const avgOver = (arr, a, b) => { const i0 = Math.max(0, Math.floor(a / HOP_S)), i1 = Math.min(arr.length, Math.ceil(b / HOP_S)); let s = 0; for (let i = i0; i < i1; i++) s += arr[i]; return i1 > i0 ? s / (i1 - i0) : 0; };
const shotAt = (va, t) => va ? va.shots.find(s => t >= s.start - 1e-3 && t < s.end) || va.shots[va.shots.length - 1] : null;

// ---------- 1. Material: o que existe de bom em cada fonte ----------
export function materialUnits(item, E, transcript = null, ops = []) {
  const r = materialUnitsRaw(item, E, transcript);
  // trechos que a pessoa mandou tirar ou manter
  const mine = o => o.srcId === '*' || o.srcId === item.src.id;
  const excl = ops.filter(o => o.op === 'excludeSrc' && mine(o));
  const keep = ops.filter(o => o.op === 'keepOnly' && mine(o));
  if (!excl.length && !keep.length) return r;
  let units = r.units;
  const cutOut = (list, a, b) => list.flatMap(u => b <= u.start || a >= u.end ? [u] : [{ ...u, end: a, dur: a - u.start }, { ...u, id: uid('u'), start: b, dur: u.end - b, cutAfter: u.cutAfter }].filter(x => x.end - x.start > 0.2));
  for (const x of excl) units = cutOut(units, x.from, x.to).map(u => (u.end <= x.from + 0.01 && u.end >= x.from - 0.3) ? { ...u, cutAfter: true } : u);
  if (keep.length) units = units.flatMap(u => keep.map(k => ({ ...u, start: Math.max(u.start, k.from), end: Math.min(u.end, k.to) })).filter(x => x.end - x.start > 0.2).map(x => ({ ...x, dur: x.end - x.start })));
  units.forEach(u => { u.events = (u.events || []).filter(e => e.t >= u.start && e.t < u.end); });
  return { ...r, units };
}

function materialUnitsRaw(item, E, transcript = null) {
  const { src, audio, video } = item;
  const out = [];
  const isDialogue = src.role !== 'music' && audio && audio.hasSound && audio.speechRatio > 0.22 && audio.speech.length >= 1;
  if (src.kind === 'image' && video) {
    // foto: rende uma "tomada" virtual; o movimento vem do zoom lento (efeito Ken Burns)
    const V = clamp(E.pacing.avgShot * 2.4, 3, 9), sh = video.shots[0];
    out.push({ id: uid('u'), srcId: src.id, kind: 'broll', start: 0, end: V, dur: V, energy: 0.3, quality: sh.quality, interest: sh.interest, shot: sh, events: [], still: true });
    return { isDialogue: false, units: out };
  }
  if (isDialogue) {
    const pad = E.silence.pad, minLen = E.silence.remove ? E.silence.minLen : Infinity;
    // frases = fala separada por pausas ≥ 0,25 s
    let phrases = mergeIntervals(audio.speech.map(r => ({ start: r.start, end: r.end })), 0.25);
    // "ahn", "é...", palavra repetida: sai da fala (precisa de transcrição)
    const tr = transcript && transcript[src.id];
    item._fillers = 0;
    if (E.fillers && tr && tr.words && tr.words.length) {
      const bad = findFillers(tr.words).map(b => ({ start: b.start - 0.03, end: b.end + 0.03 }));
      if (bad.length) {
        const cut = [];
        for (const p of phrases) { let parts = [p]; for (const b of bad) parts = parts.flatMap(x => b.end <= x.start || b.start >= x.end ? [x] : [{ start: x.start, end: b.start }, { start: b.end, end: x.end }]); cut.push(...parts.filter(x => x.end - x.start > 0.12)); }
        phrases = cut; item._fillers = bad.length;
      }
    }
    for (let i = 0; i < phrases.length; i++) {
      const p = phrases[i], next = phrases[i + 1];
      const gapAfter = next ? next.start - p.end : src.duration - p.end;
      const forcedCut = next && item._fillers && next.start - p.end < 0.4 && next.start - p.end > 0.02;
      const start = Math.max(0, p.start - pad), end = Math.min(src.duration, p.end + Math.min(pad, gapAfter / 2));
      const sh = shotAt(video, (start + end) / 2);
      out.push({
        id: uid('u'), srcId: src.id, kind: 'dialogue', start, end, dur: end - start,
        energy: avgOver(audio.energy, p.start, p.end), gapAfter, cutAfter: gapAfter >= minLen || !!forcedCut,
        quality: sh ? sh.quality : 1, interest: sh ? sh.interest : 0.5, shot: sh,
        events: audio.events.filter(e => e.t >= start && e.t < end),
      });
    }
  } else if (video) {
    for (const sh of video.shots) {
      if (sh.flags.includes('preto') || sh.dur < 0.25) continue;
      out.push({
        id: uid('u'), srcId: src.id, kind: 'broll', start: sh.start, end: sh.end, dur: sh.dur,
        energy: audio ? avgOver(audio.energy, sh.start, sh.end) : 0.3, quality: sh.quality, interest: sh.interest, shot: sh,
        events: audio ? audio.events.filter(e => e.t >= sh.start && e.t < sh.end) : [],
      });
    }
  }
  return { isDialogue, units: out };
}

// Melhor janela de duração L dentro de uma tomada (pico de movimento ou evento de som).
function bestWindow(unit, L, samples) {
  const a = unit.start + 0.08, b = unit.end - 0.08;
  if (b - a <= L) return { in: Math.max(unit.start, a), out: Math.min(unit.end, Math.max(a + L, b)) };
  let bestT = (a + b - L) / 2, bestS = -1;
  const ev = unit.events || [];
  for (let t = a; t + L <= b; t += Math.max(0.1, L / 6)) {
    let s = 0, n = 0;
    for (const x of samples) if (x.t >= t && x.t < t + L) { s += x.motion * 10 + x.sat * 0.5; n++; }
    s = n ? s / n : 0;
    for (const e of ev) if (e.t >= t + L * 0.2 && e.t <= t + L * 0.75) s += 2 * e.strength; // evento perto do meio
    if (s > bestS) { bestS = s; bestT = t; }
  }
  return { in: bestT, out: bestT + L };
}

// ---------- 2. Ritmo: tamanhos de tomada ao longo do vídeo ----------
function pacingAt(t, T, spec, E, energy) {
  let mult = 1;
  for (const sec of spec.sections || []) {
    const from = sec.from === 'mid' ? T * 0.35 : sec.from < 0 ? T + sec.from : sec.from;
    const to = sec.to === 'mid' ? T * 0.65 : sec.to <= 0 && sec.from < 0 ? T : sec.to;
    if (t >= from && t < to) mult *= sec.pace === 'slow' ? 1.6 : sec.pace === 'fast' ? 0.6 : 1;
  }
  if (spec.hookSeconds && t < spec.hookSeconds) mult *= 0.75;
  if (E.pacing.dynamic !== false && energy != null) mult *= E.pacing.emotionAware ? (1.45 - 0.9 * energy) : (1.2 - 0.4 * energy);
  return mult;
}

function nextShotLen(rng, t, T, spec, E, energy) {
  const p = E.pacing;
  const base = p.avgShot * pacingAt(t, T, spec, E, energy);
  // distribuição log-normal ao redor da média: varia sem ficar mecânico
  const sigma = 0.15 + 0.5 * clamp(p.variation, 0, 1);
  const z = Math.sqrt(-2 * Math.log(rng() + 1e-9)) * Math.cos(2 * Math.PI * rng());
  let L = base * Math.exp(sigma * z - sigma * sigma / 2);
  // de vez em quando uma "tomada heroica" mais longa no meio da correria
  if (p.avgShot < 1.6 && rng() < 0.08) L = Math.min(p.maxShot, base * 2.4);
  const lo = p.window ? p.window[0] * 0.75 : p.minShot, hi = p.window ? p.window[1] * 1.35 : p.maxShot;
  return clamp(L, Math.min(lo, base), Math.max(hi, base));
}

// ---------- 3. Plano completo ----------
export function buildPlan({ spec, items, music, outputIndex = 0, seed = 1, transcript = null }) {
  const E = resolveStyle(spec);
  const out = spec.outputs[outputIndex] || spec.outputs[0];
  const fmt = makeFormat(out.platform, { resolution: spec.export.resolution, fps: spec.export.fps });
  const rng = mulberry32(seed * 7919 + outputIndex * 31);
  const decisions = [];
  const warnings = [];
  // material: vídeos, fotos e narração (áudio com fala)
  const footage = items.filter(x => x.src.kind === 'video' || x.src.kind === 'image' || (x.src.kind === 'audio' && x.src.role !== 'music' && x.audio && x.audio.speechRatio > 0.3));
  if (!footage.length) throw new Error('Nenhum vídeo, foto ou narração para editar.');

  const mats = footage.map(it => ({ it, ...materialUnits(it, E, transcript, spec.ops || []) }));
  const nEx = (spec.ops || []).filter(o => o.op === 'excludeSrc').length;
  if (nEx) decisions.push(`Tirei ${nEx} trecho(s) que você pediu.`);
  const nFill = footage.reduce((a, it) => a + (it._fillers || 0), 0);
  if (nFill) decisions.push(`Tirei ${nFill} "ahn", muletas e palavras repetidas da fala.`);
  if (E.fillers && !nFill && !transcript) warnings.push('Para tirar "ahn" e repetições preciso da transcrição (aba Legendas).');
  const dialogueMats = mats.filter(m => m.isDialogue);
  const brollMats = mats.filter(m => !m.isDialogue && m.units.length);
  const voiceOnly = dialogueMats.length > 0 && dialogueMats.every(m => !m.it.video);
  if (voiceOnly && !brollMats.length) throw new Error('Narração sem imagens: mande fotos ou vídeos para cobrir a narração.');
  const samplesOf = id => (items.find(x => x.src.id === id).video || { samples: [] }).samples;

  const totalRaw = footage.reduce((s, x) => s + x.src.duration, 0);
  let T = out.duration || (spec.target && spec.target.seconds) || null;
  const exact = !!((out.duration && out.exact) || (spec.target && spec.target.exact));

  let clips = [];
  let hookUsed = null;

  if (dialogueMats.length) {
    // ===== vídeo guiado por fala =====
    let units = dialogueMats.flatMap(m => m.units);
    const removedSil = [];
    dialogueMats.forEach(m => m.units.forEach((u, i) => { if (u.cutAfter && m.units[i + 1]) removedSil.push(m.units[i + 1].start - u.end); }));
    const keptLen = totalLen(units);
    if (E.silence.remove && removedSil.length) decisions.push(`Tirei ${removedSil.length} pausas longas (${fmtDur(removedSil.reduce((a, b) => a + b, 0))} de tempo morto).`);
    if (T && keptLen > T * 1.06) {
      // escolhe frases pela força, sem quebrar a ordem; primeira e última têm bônus (contexto e fechamento)
      const scored = units.map((u, i) => ({ u, i, s: 0.55 * u.energy + 0.15 * u.interest + 0.15 * u.quality + (i === 0 ? 0.3 : 0) + (i === units.length - 1 ? 0.15 : 0) + Math.min(0.2, u.events.length * 0.07) }));
      scored.sort((a, b) => b.s - a.s);
      const pick = new Set(); let acc = 0;
      for (const x of scored) { if (acc >= T * 0.98) break; if (acc + x.u.dur > T * 1.12 && acc > T * 0.75) continue; pick.add(x.i); acc += x.u.dur; }
      units = units.filter((u, i) => pick.has(i));
      decisions.push(`De ${fmtDur(keptLen)} de fala útil, escolhi as ${units.length} frases mais fortes para chegar a ${fmtDur(T)}, mantendo a ordem.`);
    } else if (T && keptLen < T * 0.8) {
      warnings.push(`Só há ${fmtDur(keptLen)} de fala aproveitável; o vídeo vai ficar mais curto que ${fmtDur(T)}.`);
    }
    // pausa natural (menor que o limite de silêncio) continua no vídeo: as frases ficam coladas
    for (let i = 0; i < units.length - 1; i++) {
      const u = units[i], nx = units[i + 1];
      if (u.srcId === nx.srcId && !u.cutAfter && nx.start - u.end < 2.5) { u.end = nx.start; u.dur = u.end - u.start; nx.joined = true; }
    }
    // gancho: a frase mais forte vai também para a abertura (só se não for já a primeira)
    const hookOp = (spec.ops || []).filter(o => o.op === 'hookAt').pop();
    const hookU = hookOp && dialogueMats.flatMap(m => m.units).find(u => (hookOp.srcId === '*' || u.srcId === hookOp.srcId) && hookOp.t >= u.start - 0.3 && hookOp.t < u.end);
    if (hookU) {
      const a = Math.max(hookU.start, hookOp.t - 0.2), len = Math.min(hookU.end - a, Math.max(spec.hookSeconds || 3, 1.5));
      hookUsed = { ...hookU, id: uid('u'), start: a, end: a + len, dur: len, hook: true };
      decisions.push(`Abri com o momento que você escolheu (${fmtTc(a)}).`);
    } else if (spec.hookSeconds || E.hook.enabled) {
      const H = Math.min(spec.hookSeconds || E.hook.seconds, T ? T / 4 : 6);
      const best = [...units].slice(1).sort((a, b) => (b.energy + b.events.length * 0.1) - (a.energy + a.events.length * 0.1))[0];
      if (best && best.energy > units[0].energy * 1.05) {
        const len = Math.min(best.dur, Math.max(H, 1.2));
        hookUsed = { ...best, id: uid('u'), end: best.start + len, dur: len, hook: true };
        decisions.push(`Abri com um trecho forte de ${fmtTc(best.start)} como gancho (${fmtN(len)} s) antes do começo.`);
      }
    }
    const seq = hookUsed ? [hookUsed, ...units] : units;
    // cada unidade vira um ou mais cortes de imagem (zoom alternado no ritmo pedido)
    let t = 0;
    seq.forEach((u, k) => {
      let a = u.start;
      const segEnd = u.end;
      let zoomState = k % 2;
      while (segEnd - a > 0.05) {
        const energy = avgOver((items.find(x => x.src.id === u.srcId).audio || {}).energy || [], a, a + 1);
        let L = nextShotLen(rng, t, T || keptLen, spec, E, energy);
        // não cria pedaço minúsculo no fim da frase
        if (segEnd - (a + L) < Math.max(0.6, E.pacing.minShot * 0.8)) L = segEnd - a;
        clips.push({ id: uid('c'), srcId: u.srcId, in: a, out: a + L, speed: 1, kind: u.hook ? 'hook' : 'dialogue', unitId: u.id, contiguous: a > u.start || !!u.joined, zoomState, energy, shot: u.shot });
        a += L; t += L; zoomState = 1 - zoomState;
      }
    });
    // cortes de cobertura (b-roll por cima da fala) para variar a imagem
    if (brollMats.length) {
      const allB = brollMats.flatMap(m => m.units);
      const tl = layout(clips);
      const noVideo = id => !items.find(x => x.src.id === id).video;
      if (tl.some(c => noVideo(c.srcId))) {
        // NARRAÇÃO: toda a fala é coberta por imagens, em ordem, no ritmo pedido
        const pool = [...allB].sort((a, b) => srcOrder(items, a.srcId) - srcOrder(items, b.srcId) || a.start - b.start);
        let k = 0, t = 0, cursor = new Map(), reused = false;
        for (const c of tl) {
          if (!noVideo(c.srcId)) continue;
          c.covers = []; c.noVideo = true;
          let off = 0;
          while (off < c.dur - 0.05) {
            let L = nextShotLen(rng, t, T || tl[tl.length - 1].start + tl[tl.length - 1].dur, spec, E, c.energy);
            if (c.dur - (off + L) < 0.6) L = c.dur - off;
            const u = pool[k % pool.length]; if (k >= pool.length) reused = true; k++;
            let a = cursor.get(u.id) || u.start;
            if (a + L > u.end - 0.05) a = u.start; // voltou ao começo da tomada
            const outT = Math.min(u.end, a + L);
            c.covers.push({ srcId: u.srcId, in: a, out: outT, offset: off, len: L, shot: u.shot, still: !!u.still });
            cursor.set(u.id, outT + 0.2);
            off += L; t += L;
          }
        }
        decisions.push(`Narração coberta com ${k} imagens, trocando a cada ~${fmtN(E.pacing.avgShot)} s, na ordem em que você mandou.`);
        if (reused) warnings.push('Faltou imagem para a narração inteira: algumas fotos/tomadas aparecem mais de uma vez. Mande mais imagens para evitar.');
      } else {
        const cands = allB.filter(u => u.quality >= 0.45).sort((a, b) => b.interest - a.interest);
        const every = Math.max(E.pacing.avgShot * 2.5, 3.5);
        let used = 0, lastAt = -1e9;
        for (const c of tl) {
          const acc = c.start;
          // nunca cobre o primeiro corte nem o gancho: quem fala aparece primeiro
          if (!cands.length || c === tl[0] || c.kind === 'hook' || acc < 2.5 || acc - lastAt < every || c.out - c.in < 1.2) continue;
          const u = cands[used % cands.length]; used++;
          const L = Math.min(c.out - c.in - 0.3, clamp(E.pacing.avgShot * 1.3, 1.2, 3.5));
          const w = u.still ? { in: 0 } : bestWindow(u, L, samplesOf(u.srcId));
          c.covers = [{ srcId: u.srcId, in: w.in, out: w.in + L, offset: (c.out - c.in - L) / 2, len: L, shot: u.shot, still: !!u.still }];
          lastAt = acc;
        }
        if (used) decisions.push(`Cobri ${used} trechos de fala com imagens de apoio (o som da fala continua por baixo).`);
      }
    }
  } else {
    // ===== montagem (ação, viagem, clipe): imagem guiada por ritmo e música =====
    const units = brollMats.flatMap(m => m.units);
    const good = units.filter(u => u.quality >= 0.35);
    const bad = units.length - good.length;
    if (bad) decisions.push(`Deixei de fora ${bad} tomada(s) com problema técnico (${[...new Set(units.filter(u => u.quality < 0.35).flatMap(u => u.shot.flags))].join(', ')}).`);
    let pool = good.length ? good : units;
    if (E.avoidShaky) { const steady = pool.filter(u => !(u.shot && u.shot.flags.includes('tremido'))); if (steady.length && totalLen(steady) >= (T || 20) * 0.6) { if (steady.length < pool.length) decisions.push(`Deixei de fora ${pool.length - steady.length} tomada(s) tremida(s).`); pool = steady; } }
    // com material de sobra, tomadas com defeito (escura, estourada, tremida) ficam de fora
    const great = pool.filter(u => u.quality >= 0.65);
    const Tguess = T || 30;
    if (totalLen(great) >= Tguess * 1.5 && great.length >= 2) {
      const left = pool.length - great.length;
      if (left) decisions.push(`Havia material bom de sobra: deixei de fora ${left} tomada(s) com defeito técnico.`);
      pool = great;
    }
    const goodLen = totalLen(pool);
    if (!T) T = clamp(goodLen * 0.6, Math.min(goodLen, 10), 180);
    if (goodLen < T * 0.6) warnings.push(`Há só ${fmtDur(goodLen)} de imagem boa para ${fmtDur(T)}; algumas tomadas vão se repetir ou ficar mais longas.`);
    // Montagem em ordem: cada tomada recebe uma "verba" de tempo proporcional a tamanho × qualidade.
    // Dentro da tomada, janelas sem sobreposição, com pulo entre elas (o corte tem que mostrar algo novo).
    const P = music && E.pacing.beatSync && music.beats.length > 4 ? music.period : null;
    const used = new Map(); // srcId -> [{start,end}]
    const isFree = (srcId, a, b) => !(used.get(srcId) || []).some(x => a < x.end - 0.02 && b > x.start + 0.02);
    const markUsed = (srcId, a, b) => { if (!used.has(srcId)) used.set(srcId, []); used.get(srcId).push({ start: a, end: b }); };
    const scoreOf = u => 0.45 * u.interest + 0.35 * u.quality + Math.min(0.3, u.events.length * 0.12);
    // janela livre de tamanho L com melhor pontuação dentro de [a,b]
    const freeWindow = (u, L, a, b) => {
      const smp = samplesOf(u.srcId); let best = null, bestS = -1;
      for (let t = a; t + L <= b + 1e-6; t += Math.max(0.08, L / 8)) {
        if (!isFree(u.srcId, t, t + L)) continue;
        let sc = 0, n = 0;
        for (const x of smp) if (x.t >= t && x.t < t + L) { sc += x.motion * 10 + x.sat * 0.4; n++; }
        sc = n ? sc / n : 0;
        for (const e of u.events) if (e.t >= t + L * 0.15 && e.t <= t + L * 0.8) sc += 2 * e.strength;
        if (sc > bestS) { bestS = sc; best = t; }
      }
      return best;
    };
    const quant = L => { if (!P) return L; let nb = Math.max(1, Math.round(L / P)); if (nb === 3) nb = rng() < 0.5 ? 2 : 4; else if (nb > 4 && nb < 8) nb = rng() < 0.6 ? 4 : 8; return nb * P; };
    // gancho primeiro (vai para o começo, fora da ordem)
    let t = 0;
    const hookOpM = (spec.ops || []).filter(o => o.op === 'hookAt').pop();
    const chosenU = hookOpM && pool.find(u => (hookOpM.srcId === '*' || u.srcId === hookOpM.srcId) && hookOpM.t >= u.start && hookOpM.t < u.end);
    if (chosenU) {
      const L = Math.min(quant(Math.max(E.pacing.avgShot * 1.2, 1.0)), chosenU.end - hookOpM.t - 0.05, spec.hookSeconds || 3);
      if (L > 0.3) { clips.push({ id: uid('c'), srcId: chosenU.srcId, in: hookOpM.t, out: hookOpM.t + L, speed: 1, kind: 'hook', energy: chosenU.energy, shot: chosenU.shot, beat: !!P, score: 2, interest: chosenU.interest }); markUsed(chosenU.srcId, hookOpM.t - 0.3, hookOpM.t + L + 0.3); t += L; decisions.push(`Abri com o momento que você escolheu (${fmtTc(hookOpM.t)}).`); }
    } else if ((spec.hookSeconds || E.hook.enabled) && pool.length > 2) {
      const bestU = [...pool].sort((a, b) => scoreOf(b) - scoreOf(a))[0];
      const L = Math.min(quant(Math.max(E.pacing.avgShot * 1.2, 1.0)), bestU.dur - 0.1, (spec.hookSeconds || 3));
      const w = freeWindow(bestU, L, bestU.start + 0.05, bestU.end - 0.05);
      if (w != null) {
        clips.push({ id: uid('c'), srcId: bestU.srcId, in: w, out: w + L, speed: 1, kind: 'hook', energy: bestU.energy, shot: bestU.shot, beat: !!P, score: scoreOf(bestU) + 1, interest: bestU.interest });
        markUsed(bestU.srcId, w - 0.3, w + L + 0.3); t += L;
        decisions.push(`Abri com o momento mais forte (${fmtTc(w)} de "${nameOf(items, bestU.srcId)}") como gancho.`);
      }
    }
    const ordered = spec.chronological ? [...pool].sort((a, b) => srcOrder(items, a.srcId) - srcOrder(items, b.srcId) || a.start - b.start) : [...pool].sort(() => rng() - 0.5);
    const weights = ordered.map(u => u.dur * (0.4 + scoreOf(u)));
    const wsum = weights.reduce((a, b) => a + b, 0) || 1;
    let rounds = 0;
    while (t < T - 0.15 && rounds < 4) {
      let progressed = false;
      for (let i = 0; i < ordered.length && t < T - 0.15; i++) {
        const u = ordered[i];
        let budget = (T - (rounds ? 0 : 0)) * weights[i] / wsum * (rounds ? 0.5 : 1);
        let cursor = u.start + 0.05;
        while (budget > 0.25 && t < T - 0.15) {
          let L = quant(nextShotLen(rng, t, T, spec, E, u.energy));
          if (t + L > T) L = T - t;
          L = Math.min(L, u.end - 0.05 - cursor);
          if (P && L >= P * 0.95) L = Math.floor(L / P + 1e-6) * P;
          if (L < Math.max(0.3, E.pacing.minShot * 0.6)) break;
          const w = freeWindow(u, L, cursor, u.end - 0.05);
          if (w == null) break;
          clips.push({ id: uid('c'), srcId: u.srcId, in: w, out: w + L, speed: 1, kind: 'broll', energy: u.energy, shot: u.shot, beat: !!P, score: scoreOf(u), interest: u.interest });
          markUsed(u.srcId, w, w + L);
          // pula um pedaço antes da próxima janela da mesma tomada
          cursor = w + L + Math.max(0.25, L * 0.4);
          t += L; budget -= L; progressed = true;
        }
      }
      if (!progressed) break;
      rounds++;
    }
    if (t < T * 0.9) warnings.push(`O material bom deu ${fmtDur(t)}; ficou mais curto que ${fmtDur(T)} para não repetir imagem.`);
    // ordem final: gancho + resto em ordem de fonte/tempo
    const hookC = clips.filter(c => c.kind === 'hook'), rest = clips.filter(c => c.kind !== 'hook');
    if (spec.chronological) rest.sort((a, b) => srcOrder(items, a.srcId) - srcOrder(items, b.srcId) || a.in - b.in);
    clips = [...hookC, ...rest];
    // tomada mais curta que a fenda: estica a vizinha (sem buraco)
    if (music && E.pacing.beatSync) decisions.push(`Cortei no ritmo da música (${fmtN(music.bpm)} BPM).`);
    decisions.push(`Montagem de ${clips.length} tomadas, média de ${fmtN(totalLen(clips.map(c => ({ start: c.in, end: c.out }))) / clips.length)} s cada.`);
  }

  // ---------- câmera lenta e speed ramps (só imagem sem fala) ----------
  const slowFrac = E.effects.slowmo || 0;
  if (slowFrac > 0) {
    const elig = clips.filter(c => (c.kind === 'broll' || (c.kind === 'hook' && !dialogueMats.length)) && c.out - c.in > 0.35);
    const tot = elig.reduce((s, c) => s + (c.out - c.in), 0);
    let need = tot * slowFrac, n = 0;
    for (const c of [...elig].sort((a, b) => (b.interest || 0) + (b.score || 0) - (a.interest || 0) - (a.score || 0))) {
      if (need <= 0) break;
      c.speed = E.effects.speedRamp && n % 2 === 1 ? 'ramp' : 0.5;
      // mantém a duração na linha do tempo: pega menos material de origem
      const outDur = c.out - c.in;
      c.out = c.in + (c.speed === 'ramp' ? outDur * 0.7 : outDur * 0.5);
      need -= outDur; n++;
    }
    if (n) decisions.push(`Câmera lenta em ${n} momento(s) de mais movimento${E.effects.speedRamp ? ', alguns com speed ramp' : ''}.`);
  }

  // ---------- edições manuais (linha do tempo) ----------
  const sameClip = (c, op) => c.srcId === op.srcId && Math.abs(c.in - op.in) < 0.08;
  for (const op of spec.ops || []) {
    if (op.op === 'deleteClip') clips = clips.filter(c => !sameClip(c, op));
    if (op.op === 'setSpeed') clips.forEach(c => { if (sameClip(c, op) && c.speed !== 'freeze') { const outDur = (c.out - c.in) / (c.speed === 'ramp' ? 0.7 : c.speed); const it = items.find(x => x.src.id === c.srcId); const maxOut = it ? it.src.duration : Infinity; let sp = op.speed === 'ramp' ? 0.7 : op.speed; if (c.in + outDur * sp > maxOut) sp = Math.max(1, (maxOut - c.in) / outDur); c.speed = op.speed === 'ramp' ? 'ramp' : sp; c.out = c.in + outDur * sp; } });
    if (op.op === 'trim') clips.forEach(c => { if (sameClip(c, op)) { c.out = Math.max(c.in + 0.2, c.out + op.delta); } });
    if (op.op === 'split' || op.op === 'freeze') {
      const i = clips.findIndex(c => c.srcId === op.srcId && op.at > c.in + 0.05 && op.at < c.out - 0.05 && c.speed !== 'freeze');
      if (i >= 0) {
        const c = clips[i];
        const a = { ...c, out: op.at }, b = { ...c, id: uid('c'), in: op.at, contiguous: true, covers: null };
        const add = op.op === 'freeze' ? [{ ...c, id: uid('c'), in: op.at, out: op.at, speed: 'freeze', freezeDur: op.dur || 1.5, kind: 'freeze', covers: null }] : [];
        clips.splice(i, 1, a, ...add, b);
        if (op.op === 'freeze') decisions.push(`Congelei a imagem em ${fmtTc(op.at)} por ${fmtN(op.dur || 1.5)} s.`);
      }
    }
  }

  for (const c of clips) if (c.covers) c.covers = c.covers.filter(cv => cv.offset < (c.out - c.in) - 0.1).map(cv => ({ ...cv, len: Math.min(cv.len, (c.out - c.in) - cv.offset) }));

  // ---------- final: mais lento e com respiro ----------
  const tl0 = layout(clips);
  let total = tl0.length ? tl0[tl0.length - 1].start + tl0[tl0.length - 1].dur : 0;
  const endSec = (spec.sections || []).find(s => s.from < 0);
  if (endSec && !dialogueMats.length) {
    const from = total + endSec.from;
    tl0.filter(c => c.start >= from).forEach(c => { if (c.speed === 1 && c.kind === 'broll') { c.speed = 0.6; c.out = c.in + (c.out - c.in) * 0.6; } });
    decisions.push(`Final ${endSec.mood === 'epic' ? 'épico' : 'emocionante'}: últimos ${fmtN(-endSec.from)} s mais lentos, música sobe e some no fim.`);
  }

  // ---------- duração exata: ajusta o último corte ----------
  let tl = layout(clips);
  total = tl.length ? tl[tl.length - 1].start + tl[tl.length - 1].dur : 0;
  if (T && exact && total > T) {
    const last = tl[tl.length - 1]; const cut = total - T;
    if (last.dur - cut > 0.3) { last.out -= cut * spd(last); }
    tl = layout(clips); total = T;
  }

  // ---------- transições ----------
  const mix = E.transitions.mix;
  const tDur = E.transitions.dur;
  const every = (spec.over && spec.over.transitions && spec.over.transitions.every) || null;
  let lastTrans = 0;
  tl.forEach((c, i) => {
    c.trans = { type: 'cut', dur: 0 };
    if (i === 0) return;
    const prev = tl[i - 1];
    const sameTake = c.srcId === prev.srcId && c.contiguous; // continuação da mesma frase: corte seco (jump cut)
    if (sameTake) return;
    let type = pickWeighted(mix, rng);
    if (every) type = c.start - lastTrans >= every ? (mix.dissolve ? 'dissolve' : pickWeighted({ ...mix, cut: 0 }, rng) || 'dissolve') : 'cut';
    if (c.kind === 'dialogue' && prev.kind === 'dialogue' && ['whip', 'flash', 'zoom'].includes(type) && rng() < 0.6) type = 'cut';
    const maxD = Math.min(c.dur, prev.dur) * 0.45;
    const d = type === 'cut' ? 0 : Math.min(type === 'flash' ? 0.12 : type === 'whip' ? 0.22 : tDur, maxD);
    if (d < 0.06) type = 'cut';
    c.trans = { type, dur: type === 'cut' ? 0 : d };
    if (type !== 'cut') lastTrans = c.start;
  });
  // narração: transições entre as imagens seguem o estilo (sem exagero)
  for (const c of tl) if (c.noVideo && c.covers) c.covers.forEach((cv, i) => {
    if (i === 0) return;
    let type = pickWeighted(mix, rng); if (type === 'flash' && rng() < 0.6) type = 'cut';
    const d = type === 'cut' ? 0 : Math.min(type === 'whip' ? 0.22 : tDur, cv.len * 0.45, c.covers[i - 1].len * 0.45);
    cv.trans = d < 0.06 ? { type: 'cut', dur: 0 } : { type, dur: d };
  });
  // transição depois do gancho: sempre marcada (flash ou whip)
  const hookIdx = tl.findIndex(c => c.kind === 'hook');
  if (hookIdx >= 0 && tl[hookIdx + 1] && tl[hookIdx + 1].kind !== 'hook') tl[hookIdx + 1].trans = { type: mix.dissolve > (mix.flash || 0) ? 'dip' : 'flash', dur: mix.dissolve > (mix.flash || 0) ? 0.4 : 0.12 };
  // operações pedidas: remover transição num instante
  for (const op of spec.ops || []) if (op.op === 'setTrans') { const c = tl.find(x => sameClip(x, op)); if (c && tl.indexOf(c) > 0) { c.trans = op.type === 'cut' ? { type: 'cut', dur: 0 } : { type: op.type, dur: Math.min(op.type === 'flash' ? 0.12 : 0.45, c.dur * 0.45, tl[tl.indexOf(c) - 1].dur * 0.45) }; c.lockedCut = op.type === 'cut'; } }
  for (const op of spec.ops || []) if (op.op === 'removeTransition') {
    const c = tl.reduce((b, x) => Math.abs(x.start - op.t) < Math.abs(b.start - op.t) ? x : b, tl[0]);
    if (c && Math.abs(c.start - op.t) < 1.5) { c.trans = { type: 'cut', dur: 0 }; c.lockedCut = true; }
  }

  // ---------- zoom de ênfase / movimento de câmera virtual ----------
  const P = E.effects.punchIn || 0;
  const eSorted = tl.map(c => c.energy || 0).sort((a, b) => a - b);
  const eHigh = eSorted[Math.floor(eSorted.length * 0.8)] || 1;
  tl.forEach((c, i) => {
    const z = 1 + 0.14 * P;
    if (c.kind === 'dialogue' || (c.kind === 'hook' && dialogueMats.length)) {
      c.zoom = c.zoomState ? [z, z + 0.01 * P] : [1, 1 + 0.025 * P];
      if (c.energy >= eHigh && P > 0.3 && tl.length > 4) c.zoom = [z, z + 0.05];
    } else {
      // b-roll: empurrão lento alternando com recuo (Ken Burns) — ênfase maior em ação
      const k = 0.04 + 0.06 * P;
      c.zoom = i % 2 ? [1 + k, 1] : [1, 1 + k];
      if (c.kind === 'hook') c.zoom = [1.08 + 0.1 * P, 1];
    }
  });

  if (E.slowPush) tl.forEach(c => { if (c.speed !== 'freeze') c.zoom = [c.zoom[0], c.zoom[0] + 0.1 * E.slowPush]; });
  if (E.noZoom) tl.forEach(c => { c.zoom = [1, 1]; });
  if (E.faceZoom && E.faceZoom !== 1) tl.forEach(c => { c.zoom = c.zoom.map(z => z * E.faceZoom); });
  for (const c of tl) if (c.speed === 'freeze') { c.zoom = [1, 1.1]; c.trans = { type: 'cut', dur: 0 }; }

  // ---------- reenquadramento: caminho do assunto para cada corte ----------
  const pathOf = (shot, a, b) => smoothPath(((shot && shot.path) || []).filter(p => p.t >= a - 1 && p.t <= b + 1), 5).map(p => ({ t: +p.t.toFixed(3), x: +p.x.toFixed(3), y: +p.y.toFixed(3) }));
  for (const c of tl) {
    const sh = c.shot;
    c.focus = pathOf(sh, c.in, c.out);
    c.face = !!(sh && (sh.path || []).some(p => p.face));
    if (sh) c.lum = sh.mean;
    if (sh && sh.still) c.still = true;
    for (const cv of c.covers || []) {
      cv.focus = pathOf(cv.shot, cv.in, cv.out); cv.lum = cv.shot ? cv.shot.mean : null; cv.face = !!(cv.shot && (cv.shot.path || []).some(p => p.face));
      delete cv.shot;
    }
    delete c.shot;
  }

  // ---------- tremor e flash nos impactos ----------
  const shakeAmt = E.effects.shake || 0, flashAmt = E.effects.flash || 0;
  const fx = [];
  const events = [];
  for (const c of tl) {
    const it = items.find(x => x.src.id === c.srcId);
    const evs = it && it.audio ? it.audio.events : [];
    for (const e of evs) if (e.t >= c.in && e.t < c.out && c.speed === 1) events.push({ t: c.start + (e.t - c.in), strength: e.strength, srcId: c.srcId });
  }
  if (shakeAmt > 0) for (const e of events) if (e.strength > 0.5) fx.push({ kind: 'shake', t: e.t, dur: 0.3, amt: shakeAmt * e.strength });

  // ---------- áudio ----------
  const audioPlan = planAudio({ tl, items, music, spec, E, total, events, rng, dialogue: dialogueMats.length > 0, decisions, fx, flashAmt });

  // ---------- legendas (se houver transcrição) ----------
  let captions = transcript ? mapCaptions(tl, transcript) : [];
  if (E.captionKeywords && captions.length) {
    const STOP = /^(que|para|pra|com|uma|uns|umas|isso|esse|essa|este|esta|aqui|mais|muito|como|quando|porque|entao|tambem|voce|voces|ele|ela|eles|elas|nos|meu|minha|seu|sua|dele|dela|tem|ter|foi|ser|esta|estou|vai|vou|the|and|that|this|with|for|you|your|are|was|have|just|like|what|from|they|them)$/;
    const plain = w => w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    const keep = captions.filter(w => w.emph || /\d/.test(w.w) || (plain(w.w).length >= 5 && !STOP.test(plain(w.w))));
    decisions.push(`Legenda só com ${keep.length} palavras-chave (de ${captions.length}).`);
    captions = keep.map(w => ({ ...w, solo: true }));
  }
  // ---------- palavrões: bipe por cima e legenda mascarada ----------
  if (E.bleep) {
    if (!captions.length) warnings.push('Para bipar palavrões preciso da transcrição (aba Legendas → Transcrever).');
    else {
      audioPlan.mutes = [];
      for (const w of captions) if (isProfane(w.w)) {
        const a = Math.max(0, w.t0 - 0.03), b = Math.min(total, w.t1 + 0.03);
        audioPlan.mutes.push({ start: a, end: b }); audioPlan.sfx.push({ t: a, kind: 'beep', gainDb: -9, dur: b - a });
        w.w = w.w[0] + '*'.repeat(Math.max(2, w.w.length - 1));
      }
      decisions.push(audioPlan.mutes.length ? `Bipei ${audioPlan.mutes.length} palavrão(ões) e escondi na legenda.` : 'Procurei palavrões na fala e não achei nenhum.');
    }
  }

  // ---------- pulso na batida e zoom nas palavras fortes ----------
  const pulse = E.beatPulse || 0;
  if (pulse > 0 && music && audioPlan.music) {
    const off = audioPlan.music.in; let n = 0;
    for (const b of music.beats) {
      const t = b.t - off + (audioPlan.music.start || 0); if (t < 0.2 || t > total - 0.3 || b.t < off) continue;
      if (pulse < 0.6 && !b.downbeat) continue;
      fx.push({ kind: 'pulse', t, dur: 0.22, amt: pulse * (b.downbeat ? 1 : 0.6) }); n++;
    }
    if (n) decisions.push(`Pulso de zoom em ${n} batidas da música.`);
  }
  if (E.emphasisZoom && captions.length) {
    let n = 0, last = -9;
    for (const w of markEmph(captions)) if (w.emph && w.t0 - last > 1.2) { fx.push({ kind: 'punch', t: w.t0, dur: Math.min(0.9, Math.max(0.35, w.t1 - w.t0 + 0.25)), amt: 0.1 }); last = w.t0; n++; }
    if (n) decisions.push(`Zoom rápido em ${n} palavras fortes.`);
  }

  // ---------- textos ----------
  const overlays = [];
  if (spec.headline && spec.headline.text) overlays.push({ id: uid('t'), kind: 'headline', text: spec.headline.text, start: 0, dur: spec.headline.all ? total : Math.min(total, spec.headline.seconds || 4), style: spec.headline.style || 'box' });
  if (E.progressBar) overlays.push({ id: uid('t'), kind: 'progress', start: 0, dur: total, color: E.progressColor || '#FFB547', pos: E.progressPos || 'top' });
  for (const tx of spec.texts || []) {
    if (tx.shape === 'block') {
      // frase em bloco (serifa curvada, contorno branco, papel amassado)
      const st = tx.from != null ? clamp(tx.from, 0, total - 0.5) : 0;
      overlays.push({ id: uid('t'), kind: 'block', style: tx.style || 'contorno', text: tx.text, color: tx.color || null, y: tx.y != null ? tx.y : null, start: st, dur: tx.all === false ? Math.min(total - st, tx.dur || 4) : total - st });
      decisions.push(`Texto na tela (${tx.style || 'contorno'}): "${tx.text}"${tx.all === false ? ' nos primeiros segundos' : ' o vídeo todo'}.`);
      continue;
    }
    const round = tx.shape === 'circle' || tx.shape === 'badge';
    // círculo e selo: no canto de cima (fora do rosto), a não ser que peça em volta da pessoa
    const pos = tx.follow ? { x: 0.5, y: 0.4, size: 1.45 } : round ? { x: 0.74, y: 0.2, size: 0.75 } : tx.shape === 'arc' ? { x: 0.5, y: 0.2, size: 1 } : { x: 0.5, y: 0.3, size: 1 };
    overlays.push({ id: uid('t'), kind: 'shape', shape: tx.shape, text: tx.text, follow: !!tx.follow, color: tx.color || '#FFFFFF', start: round ? Math.min(1, total * 0.1) : 0.3, dur: Math.min(total - 0.5, tx.dur || Math.max(3, total * (round ? 0.6 : 0.35))), ...pos });
  }
  if (spec.title) { const d = Math.min(3, Math.max(1.4, total * 0.3)); overlays.push({ id: uid('t'), kind: 'title', text: spec.title, start: Math.max(0, total - d - 0.2), dur: d, style: /trailer|action|cinematic|sports|epic|gaming/.test(E.id || '') ? 'trailer' : 'clean' }); }

  const plan = {
    id: uid('plan'), createdAt: Date.now(), seed, fmt, duration: total,
    styleLabel: E.label, look: { id: E.color.look, intensity: E.color.intensity, grain: E.color.grain }, letterbox: !!E.effects.letterbox, lightLeak: E.effects.lightLeak || 0,
    fit: !!E.fit, mirror: !!E.mirror, adjust: E.adjust || null,
    clips: tl, fx, audio: audioPlan, captions, captionStyle: (spec.captions && spec.captions.style) || E.captions.style, captionsOn: spec.captions ? spec.captions.enabled !== false : true,
    captionOpts: { highlight: spec.captions ? spec.captions.highlight : true, uppercase: spec.captions ? spec.captions.uppercase : null, scale: (spec.over && spec.over.captionScale) || 1, color: E.captionColor || null, font: E.captionFont || null },
    captionY: spec.over && spec.over.captionY != null ? spec.over.captionY : null,
    overlays, decisions, warnings,
    stats: { clips: tl.length, avgShot: tl.length ? total / countVisualCuts(tl) : 0, raw: totalRaw },
  };
  return plan;
}

function countVisualCuts(tl) { let n = 0; for (const c of tl) n += c.covers && c.covers.length ? c.covers.length * 2 : 1; return Math.max(1, n); }
const spd = c => c.speed === 'ramp' ? 0.7 : c.speed === 'freeze' ? 1 : c.speed;
function srcOrder(items, id) { return items.findIndex(x => x.src.id === id); }
function nameOf(items, id) { const it = items.find(x => x.src.id === id); return it ? it.src.name : '?'; }
function fmtTc(t) { return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`; }
function pickWeighted(mix, rng) {
  const e = Object.entries(mix).filter(([, w]) => w > 0); const tot = e.reduce((s, [, w]) => s + w, 0);
  let r = rng() * tot; for (const [k, w] of e) { r -= w; if (r <= 0) return k; } return e.length ? e[e.length - 1][0] : 'cut';
}

// Posição de cada corte na linha do tempo. Duração na tela = material / velocidade.
export function layout(clips) {
  let t = 0;
  for (const c of clips) {
    const s = spd(c);
    c.dur = c.speed === 'freeze' ? c.freezeDur : (c.out - c.in) / s;
    c.start = t; t += c.dur;
  }
  return clips;
}

// ---------- 4. Plano de som ----------
function planAudio({ tl, items, music, spec, E, total, events, rng, dialogue, decisions, fx, flashAmt }) {
  const tracks = [];
  // som original de cada corte (fala sempre; ambiente baixo quando há música)
  const hasMusic = !!music && !spec.music.none;
  for (const c of tl) {
    const it = items.find(x => x.src.id === c.srcId);
    if (!it.audio || !it.audio.hasSound) continue;
    const isTalk = c.kind === 'dialogue' || (c.kind === 'hook' && dialogue);
    let gainDb = (isTalk ? 0 : hasMusic ? -16 : -4) + (spec.audio.originalDb || 0);
    if (spec.audio.muteOriginal) gainDb = -60;
    if (c.speed !== 1) gainDb = -60; // som em câmera lenta fica estranho: some, a música assume
    if (gainDb <= -59) continue;
    const xf = c.trans && c.trans.dur ? c.trans.dur / 2 : 0;
    tracks.push({ srcId: c.srcId, in: c.in, out: c.out, start: c.start, gainDb, fadeIn: Math.max(0.012, xf), fadeOut: 0.012, speed: 1 });
  }
  // marca fade-out igual ao fade-in do próximo
  for (let i = 0; i < tracks.length - 1; i++) if (Math.abs(tracks[i].start + (tracks[i].out - tracks[i].in) - tracks[i + 1].start) < 0.02) tracks[i].fadeOut = Math.max(tracks[i].fadeOut, tracks[i + 1].fadeIn);
  // falas na linha do tempo (para abaixar a música)
  const speechOut = [];
  for (const c of tl) {
    const it = items.find(x => x.src.id === c.srcId);
    if (!it.audio || c.speed !== 1) continue;
    for (const r of it.audio.speech) {
      const a = Math.max(r.start, c.in), b = Math.min(r.end, c.out);
      if (b > a && (c.kind === 'dialogue' || c.kind === 'hook' || it.audio.speechRatio > 0.2)) speechOut.push({ start: c.start + a - c.in, end: c.start + b - c.in });
    }
  }
  const duck = mergeIntervals(speechOut, 0.35);
  let musicPlan = null;
  if (hasMusic) {
    const enter = clamp(spec.music.enterAt || 0, 0, Math.max(0, total - 2));
    const mDur = total - enter;
    let win = spec.music.start != null ? { start: Math.max(0, Math.min(spec.music.start, music.duration - 1)), end: Math.min(music.duration, spec.music.start + mDur) } : bestMusicWindow(music, mDur);
    if (spec.music.peak && spec.music.start == null && music.energy && music.energy.length) {
      // começa no refrão / drop: o compasso onde a energia dos próximos 6 s é a maior
      const downs = music.beats.filter(b => b.downbeat).map(b => b.t); const HOP = music.duration / music.energy.length;
      let best = win.start, bs = -1;
      for (const t of downs.length ? downs : [0]) { if (t + Math.min(mDur, 6) > music.duration) break; const i0 = Math.floor(t / HOP), i1 = Math.floor((t + 6) / HOP); let e = 0; for (let i = i0; i < i1; i++) e += music.energy[i] || 0; e /= Math.max(1, i1 - i0); if (e > bs) { bs = e; best = t; } }
      win = { start: best, end: Math.min(music.duration, best + mDur) };
    }
    const intensity = spec.music.intensity || 0;
    let level = E.music.levelDb + intensity * 8;
    if (!dialogue || spec.audio.muteOriginal) level = Math.max(level, -9 + intensity * 4);
    level += spec.audio.musicDb || 0;
    const endSec = (spec.sections || []).find(s => s.from < 0);
    musicPlan = {
      srcId: music.srcId, in: win.start, start: enter, dur: mDur, levelDb: clamp(level, -30, -1),
      duck: duck.map(d => ({ start: d.start, end: d.end })), duckDb: E.music.duckDb, fadeIn: enter > 0 ? 1.2 : win.start > 0.5 ? 0.6 : 0.05,
      fadeOut: Math.min(endSec ? 3.5 : 2, total * 0.2), swellAtEnd: !!endSec, bpm: music.bpm,
    };
    decisions.push(`Música${enter ? ` entrando em ${fmtTc(enter)},` : ':'} trecho de ${fmtTc(win.start)} a ${fmtTc(win.end)} de "${music.name}" (${fmtN(music.bpm)} BPM)${duck.length ? ', abaixando quando alguém fala' : ''}${intensity ? `, intensidade ${intensity > 0 ? '+' : ''}${Math.round(intensity * 100)}%` : ''}.`);
  }
  // efeitos sonoros
  const sfx = [];
  const density = E.sfx.density || 0;
  const kinds = new Set(E.sfx.kinds || []);
  const maxSfx = Math.round(density * 16 * Math.max(0.5, total / 60)) + (spec.sfxRequests || []).reduce((s, r) => s + r.count, 0);
  const gap = k => ({ impact: 0.75, boom: 1.2, riser: 2, hit: 0.5 })[k] || 0.3;
  // t = o instante do "ponto" do som (o fim do riser, o meio do whoosh, a pancada do impacto)
  const add = (t, kind, gainDb = -10) => { if (t < (kind === 'riser' ? 1.0 : 0) || t > total) return; if (sfx.some(x => Math.abs(x.t - t) < Math.max(x.kind === 'riser' || kind === 'riser' ? 0.05 : 0.25, x.kind === kind ? gap(kind) : 0))) return; sfx.push({ t, kind, gainDb }); };
  if (density > 0.02) {
    for (const c of tl) {
      if (!c.trans || c.trans.type === 'cut') continue;
      if (c.trans.type === 'whip' || c.trans.type === 'zoom') add(c.start, 'whoosh', -12);
      if (c.trans.type === 'flash') add(c.start, kinds.has('impact') ? 'impact' : 'hit', -9);
      if (c.trans.type === 'dissolve' && kinds.has('riser') && rng() < 0.25) add(c.start, 'riser', -16);
    }
    if (kinds.has('impact') || (spec.over && spec.over.sfx && spec.over.sfx.onImpacts)) {
      for (const e of [...events].sort((a, b) => b.strength - a.strength).slice(0, Math.ceil(maxSfx / 2))) { add(e.t, 'impact', -8); if (flashAmt > 0.2) fx.push({ kind: 'flash', t: e.t, dur: 0.1, amt: flashAmt }); }
    }
    if (kinds.has('pop')) tl.filter(c => c.kind === 'dialogue' && c.zoomState && rng() < density * 0.5).forEach(c => add(c.start, 'pop', -18));
    // gancho termina num impacto e o riser leva até ele
    const h = tl.findIndex(c => c.kind === 'hook');
    if (h >= 0 && tl[h + 1]) { const at = tl[h + 1].start; if (kinds.has('riser') || kinds.has('impact')) add(at - 0.01, 'riser', -14); add(at, kinds.has('impact') ? 'impact' : 'whoosh', -9); }
  }
  // pedidos explícitos ("3 impactos"): nos momentos mais fortes (eventos, batidas fortes, cortes de ação)
  for (const r of spec.sfxRequests || []) {
    const spots = [...events.map(e => ({ t: e.t, s: e.strength + 1 })), ...tl.filter(c => c.beat || c.kind === 'broll').map(c => ({ t: c.start, s: (c.score || c.energy || 0.3) }))].sort((a, b) => b.s - a.s);
    let n = 0; for (const sp of spots) { if (n >= r.count) break; const before = sfx.length; add(sp.t, r.kind, -8); if (sfx.length > before) { n++; if (r.kind === 'impact' && (E.effects.shake || 0) > 0.1) fx.push({ kind: 'shake', t: sp.t, dur: 0.3, amt: 0.6 }); } }
  }
  sfx.sort((a, b) => a.t - b.t);
  if (spec.audio.sfxDb) sfx.forEach(x => { x.gainDb += spec.audio.sfxDb; });
  while (sfx.length > maxSfx && maxSfx >= 0) { const i = Math.floor(rng() * sfx.length); sfx.splice(i, 1); }
  if (sfx.length) decisions.push(`${sfx.length} efeito(s) sonoro(s): ${[...new Set(sfx.map(s => s.kind))].join(', ')} — gerados por código, livres de direitos.`);
  return { tracks, music: musicPlan, sfx, duck, normalizeLufs: -14 };
}

// Palavrões e xingamentos comuns (PT/EN). A comparação ignora acentos e caixa.
const PROFANE = /^(porra|porr[ao]s?|caralho|caralhos?|krl|crl|merda|merdas?|bosta|bostas?|puta|putas?|puto|putaria|foda|fodas?|foder|fodase|fodido|fodida|fdp|cacete|buceta|boceta|pau no cu|cu|cuzao|arrombad[oa]s?|desgracad[oa]s?|viad[oa]|vsf|vtnc|pqp|piroca|xoxota|otari[oa]s?|fuck|fucking|fucked|fucker|motherfucker|shit|shitty|bitch|bitches|asshole|dick|cunt|bastard|goddamn|pussy)$/;
export function isProfane(w) { return PROFANE.test(String(w).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '')); }

// Legendas: palavras do tempo da fonte para o tempo do vídeo final.
export function mapCaptions(tl, transcript) {
  const words = [];
  for (const c of tl) {
    if (c.speed !== 1) continue;
    const tr = transcript[c.srcId]; if (!tr) continue;
    for (const w of tr.words) {
      const mid = (w.t0 + w.t1) / 2;
      if (mid >= c.in && mid < c.out) words.push({ w: w.w, t0: c.start + Math.max(0, w.t0 - c.in), t1: c.start + Math.min(c.out, w.t1) - c.in, emph: w.emph || false });
    }
  }
  return words;
}
