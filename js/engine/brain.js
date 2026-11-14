// Cérebro do diretor: transforma um pedido falado/escrito num PLANO DE AÇÕES e executa.
//  1. Tipo do pedido: edição nova, ajuste, correção, pergunta, explicação, ensinar comando.
//  2. Comandos ensinados pela pessoa ("quando eu disser 'explosivo' quer dizer ...").
//  3. Orações com trecho (começo, final, de X a Y, aqui) e conceitos combináveis → ações do registro.
//  4. Regras clássicas do diretor (director.js) para o resto da frase.
//  5. Tudo vira uma lista de ações (o "plano"), executada em ordem e mostrada para a pessoa.
// Não é IA generativa: é um conjunto de regras e conceitos. Isso é dito na tela também.
import { interpret as legacyInterpret, newSpec } from './director.js';
import { canon } from './nlu.js';
import { ACTIONS, runActions, orderPlan, CATEGORY_LABEL } from './actions.js';
import { splitClauses, parseClause, isCorrection, bareModifier, modifierOnLast, intensityOf, refersBack } from './concepts.js';

const deepClone = o => JSON.parse(JSON.stringify(o));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// ---------- comandos ensinados ----------
const LKEY = 'corte.ensinados';
// guarda no aparelho (localStorage); sem ele (testes), guarda na memória
const mem = new Map();
const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return mem.get(k) || null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { mem.set(k, v); } } };
export function loadTaught() { try { return JSON.parse(store.get(LKEY) || '[]'); } catch (e) { return []; } }
function saveTaught(list) { store.set(LKEY, JSON.stringify(list)); }
export function forgetTaught(phrase) { saveTaught(loadTaught().filter(x => x.phrase !== norm(phrase))); }
function teachMatch(text) {
  const t = String(text).trim();
  const m = t.match(/^\s*(?:quando eu (?:disser|falar|pedir|escrever)|when i say|se eu (?:disser|falar))\s*["“']?(.+?)["”']?\s*(?:,\s*)?(?:quer dizer|significa|é|e|eh|faz|faca|means|do|=)\s*[:]?\s*(.+)$/i)
    || t.match(/^\s*(?:aprende|aprenda|ensina|ensinar|learn|teach)\s*(?:que|:)?\s*["“']?(.+?)["”']?\s*(?:quer dizer|significa|é|e|=|means)\s*[:]?\s*(.+)$/i);
  if (!m) return null;
  return { phrase: norm(m[1]).replace(/^["']|["']$/g, ''), meaning: m[2].trim() };
}
function applyTaught(text) {
  let s = ' ' + norm(text) + ' ', used = [];
  for (const t of loadTaught().sort((a, b) => b.phrase.length - a.phrase.length)) {
    const re = new RegExp(`(^|[^a-z0-9])${t.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[^a-z0-9]|$)`, 'g');
    if (re.test(s)) { s = s.replace(re, `$1 ${norm(t.meaning)} `); used.push(t.phrase); }
  }
  return { text: s.trim(), used };
}

// ---------- registro de comandos (painel de diagnóstico) ----------
const LOGKEY = 'corte.registro';
export function loadLog() { try { return JSON.parse(store.get(LOGKEY) || '[]'); } catch (e) { return []; } }
export function logCommand(entry) { const l = loadLog(); l.push({ ...entry, at: Date.now() }); while (l.length > 400) l.shift(); store.set(LOGKEY, JSON.stringify(l)); }

// ---------- perguntas ----------
function answerQuestion(s, ctx) {
  const plan = ctx.plan, last = ctx.lastReply;
  if (/\b(o que (voce|vc) (fez|mudou)|o que mudou|what did you (do|change)|o que foi feito|resumo do que)\b/.test(s)) {
    if (!last || !(last.actions || last.said || []).length) return 'Ainda não fiz nenhuma edição neste projeto.';
    const acts = last.actions && last.actions.length ? last.actions.map((a, i) => `${i + 1}. ${a.said}`) : last.said.map((x, i) => `${i + 1}. ${x}`);
    return 'Na última edição eu fiz:\n' + acts.join('\n');
  }
  if (/\b(o que (voce|vc) (sabe|consegue|pode) fazer|what can you do|comandos|ajuda|help|como (te )?pe[cç]o)\b/.test(s)) {
    const cats = {}; for (const a of Object.values(ACTIONS)) (cats[a.cat] = cats[a.cat] || []).push(a.name);
    return 'Sei fazer (e combinar numa frase só):\n' + Object.entries(cats).map(([c, n]) => `• ${CATEGORY_LABEL[c] || c}: ${n.join(', ')}`).join('\n') + '\n\nExemplo: "deixa cinematográfico, os primeiros 5 segundos rápidos, música épica e câmera lenta no momento mais forte".';
  }
  if (/\b(por que|porque|why)\b/.test(s) && plan) return 'Decisões da edição atual:\n' + (plan.decisions || []).slice(0, 12).map(d => '• ' + d).join('\n');
  if (/\b(quanto tempo|qual a duracao|how long|duracao)\b/.test(s) && plan) return `O vídeo editado tem ${Math.round(plan.duration * 10) / 10} s, com ${plan.clips.length} cortes.`;
  if (/\b(qual (e )?a musica|que musica|which (song|music)|bpm)\b/.test(s) && plan) return plan.audio && plan.audio.music ? `Música: ${(plan.decisions.find(d => d.startsWith('Música')) || '').replace(/\.$/, '')}.` : 'Esta versão está sem música.';
  if (/\b(e ia|e uma ia|usa ia|is (this|it) ai|inteligencia artificial)\b/.test(s)) return 'Não é IA generativa. O app entende os pedidos com um conjunto de regras e conceitos combináveis (ritmo, cor, música, trecho, intensidade) e mede o vídeo de verdade: fala, silêncio, batida, movimento, cortes de cena e rosto. Ele não "entende" o conteúdo das cenas.';
  return null;
}
const QUESTION = /^\s*(o que|oque|por que|porque|qual|quais|quanto|como|quando|onde|what|why|how|which|is it|e ia|voce|vc)\b.*(\?|$)/;

// ---------- diferenças entre especificações (o que mudou) ----------
function diffPaths(a, b, base = '', out = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffPaths(a[k], b[k], base ? base + '.' + k : k, out);
  } else out.push(base);
  return out;
}
// "assunto" de cada mudança: duas mudanças sobre o mesmo assunto não são feitas duas vezes
const OP_CON = { setSpeed: 'speed', freeze: 'freeze', excludeSrc: 'cut', keepOnly: 'cut', deleteClip: 'cut', hookAt: 'hook', split: 'split', scaleClip: 'cut', zoomAt: 'zoom', noTrans: 'transitions' };
const SEC_CON = { pace: 'pacing', speed: 'speed', look: 'color', adjust: 'fx', push: 'zoom', shake: 'shake', flash: 'flash', mood: 'ending' };
function concerns(a, b) {
  const out = new Set();
  for (const p of diffPaths(a, b)) {
    if (p.startsWith('ops')) { const ka = new Set((a.ops || []).map(JSON.stringify)); for (const o of b.ops || []) if (!ka.has(JSON.stringify(o))) out.add(OP_CON[o.op] || 'ops'); continue; }
    if (p.startsWith('sections')) { const ka = new Set((a.sections || []).map(JSON.stringify)); for (const sec of b.sections || []) if (!ka.has(JSON.stringify(sec))) for (const k of Object.keys(sec)) if (SEC_CON[k]) out.add(SEC_CON[k] === 'speed' ? 'speed' : SEC_CON[k] + '@' + sec.from + ':' + sec.to); continue; }
    if (p === 'hookSeconds') { out.add('hook'); continue; }
    const seg = p.split('.');
    if (seg[0] === 'over') {
      const k = seg[1];
      if (k === 'adjust') out.add('fx:' + (seg[2] || '')); else if (k === 'pacing') out.add(seg[2] === 'beatSync' ? 'beatsync' : 'pacing');
      else if (k === 'effects') out.add(seg[2] === 'punchIn' ? 'zoom' : seg[2] === 'shake' ? 'shake' : seg[2] === 'slowmo' ? 'speed' : 'fx:' + seg[2]);
      else if (k === 'color') out.add('color'); else if (k === 'transitions') out.add('transitions'); else if (/^(noZoom|slowPush|faceZoom|beatPulse)$/.test(k)) out.add('zoom:' + k);
      else out.add(k);
    } else if (seg[0] === 'audio') out.add('audio:' + (seg[1] || ''));
    else if (seg[0] === 'music') out.add('music:' + (seg[1] === 'mood' || seg[1] === 'pick' || seg[1] === 'none' ? 'choice' : seg[1]));
    else if (seg[0] === 'target' || (seg[0] === 'outputs' && seg[2] === 'duration')) out.add('duration');
    else out.add(seg[0]);
  }
  return out;
}
// o que cada mudança de caminho significa como ação (para mostrar o plano das regras clássicas também)
const PATH_ACTION = [[/^mix/, 'SET_PROFILE'], [/^over\.pacing\.avgShot|^sections/, 'SET_CUT_PACING'], [/^over\.pacing\.beatSync/, 'SYNC_CUTS_TO_BEATS'], [/^over\.silence/, 'REMOVE_SILENCE'],
  [/^target|^outputs\.\d+\.duration/, 'SET_DURATION'], [/^outputs/, 'SET_FORMAT'], [/^hookSeconds/, 'HOOK_OPENING'], [/^over\.transitions/, 'SET_TRANSITION_STYLE'],
  [/^over\.effects\.punchIn|^over\.noZoom|^over\.slowPush|^over\.faceZoom/, 'PUNCH_ZOOM'], [/^over\.effects\.(slowmo|speedRamp)/, 'SLOWMO_HIGHLIGHTS'], [/^over\.effects\.shake/, 'CAMERA_SHAKE'],
  [/^over\.(color|adjust)/, 'COLOR_LOOK'], [/^captions|^over\.caption/, 'CAPTION_STYLE'], [/^music|^over\.music/, 'MUSIC_MOOD'], [/^audio\.musicDb/, 'MUSIC_VOLUME'], [/^audio/, 'VOICE_VOLUME'],
  [/^over\.sfx|^sfxRequests/, 'SFX_DENSITY'], [/^texts|^headline|^title|^over\.progress/, 'OPENING_TITLE'], [/^ops/, 'PLAYBACK_SPEED'], [/^versions/, 'VERSIONS']];
const actionForPath = p => (PATH_ACTION.find(([re]) => re.test(p)) || [null, null])[1];

// ---------- interpretar ----------
// ctx: { plan, t, prevSpecBeforeLast, lastReply, prevMusicId }
export function interpret(text, prev, ctx = {}) {
  const raw = String(text || '').trim();
  const s0 = norm(raw.replace(/["“”]([^"“”]{1,200})["“”]/g, ' "frase" '));
  // ensinar um comando
  const tm = teachMatch(raw);
  if (tm && tm.phrase && tm.meaning) {
    const list = loadTaught().filter(x => x.phrase !== tm.phrase); list.push({ phrase: tm.phrase, meaning: tm.meaning, at: Date.now() }); saveTaught(list);
    const test = interpret(tm.meaning, prev || newSpec(), { ...ctx, dry: true });
    return { kind: 'teach', spec: null, said: [`Aprendi: quando você disser "${tm.phrase}", eu faço: ${tm.meaning}`], answer: test.said.length ? 'Isso vai virar: ' + test.said.join('; ') : 'Atenção: ainda não sei fazer nada com essa definição. Use palavras de edição (ritmo, cor, música, zoom, transição...).', warn: [], ask: [], actions: [] };
  }
  const forget = raw.match(/^\s*(?:esquece|esqueca|forget)\s+(?:o comando\s+)?["“']?(.+?)["”']?\s*$/i);
  if (forget && loadTaught().some(x => x.phrase === norm(forget[1]))) { forgetTaught(forget[1]); return { kind: 'teach', spec: null, said: [`Esqueci o comando "${norm(forget[1])}".`], warn: [], ask: [], actions: [] }; }
  // pergunta / pedido de explicação
  if (QUESTION.test(s0) && !/\b(deixa|coloca|poe|tira|faz|faca|muda|aumenta|abaixa|make|add|remove|put|set)\b/.test(s0)) {
    const ans = answerQuestion(s0, ctx);
    if (ans) return { kind: 'question', spec: null, said: [], answer: ans, warn: [], ask: [], actions: [] };
  }
  // comandos ensinados
  const taught = applyTaught(raw);
  const textT = taught.used.length ? taught.text : raw;
  const s = norm(String(textT).replace(/["“”]([^"“”]{1,200})["“”]/g, ' "frase" '));
  // correção ("na verdade, mais devagar"): parte da versão de ANTES da última mudança
  const correction = isCorrection(s) && ctx.prevSpecBeforeLast;
  const base = correction ? ctx.prevSpecBeforeLast : prev;
  const cctx = { ...ctx, plan: ctx.plan };
  // 1) orações → ações por conceito
  // adjetivo de efeito sonoro não é pedido de estilo ("boom cinematográfico", "cinematic sound effects")
  const sNoAdj = s.replace(/\b(cinematic|cinematografic\w*|epic\w*|dramatic\w*)\s+(sound effects?|sfx|efeitos? sonoros?|booms?|impacts?|impactos?|whoosh\w*|risers?|hits?)\b/g, '$2').replace(/\b(booms?|impactos?|whoosh\w*|efeitos? sonoros?)\s+(cinematic|cinematografic\w*|epic\w*)\b/g, '$1');
  const clauses = splitClauses(sNoAdj);
  const v2 = []; let lastScope = null; const owned = new Set();
  const lastAct = ctx.lastReply && ctx.lastReply.actions && ctx.lastReply.actions.length ? ctx.lastReply.actions[ctx.lastReply.actions.length - 1] : null;
  clauses.forEach((cl, i) => {
    let r = parseClause(cl, cctx, lastScope);
    if (!r.actions.length) { const c2 = canon(cl).text; if (c2 && c2 !== cl) { const r2 = parseClause(c2, cctx, lastScope); if (r2.actions.length) r = r2; } }
    if (r.scope) lastScope = r.scope;
    // modificador sem alvo ("um pouco mais rápido", "actually, slower") vale para a última coisa mexida
    if (!r.actions.length) {
      const mod = bareModifier(cl.replace(/^(na verdade|actually|nao|melhor|alias|i mean|no|pensando bem)\s*,?\s*/, ''));
      if (mod && (lastAct || correction)) { const a = modifierOnLast(mod, lastAct, intensityOf(cl)); if (a) { r.actions.push(a); owned.add(i); } }
    }
    const moment = /\b(camera lenta|slow ?mo\w*|freeze|congel\w*|acelera\w*|\d+(\.\d+)?x|divide|time ?lapse|corta|tira de|remove de|de \d+:\d+|primeiros \d+ segundos (bem )?(rapid|lent|dinamic)|ultimos \d+ segundos)\b/.test(cl);
    for (const a of r.actions) { v2.push({ ...a, from: cl }); if (!moment && (a.own || a.scope || a.id === 'COPY_SECTION' || a.id === 'MUSIC_PREVIOUS')) owned.add(i); }
  });
  // 2) regras clássicas no resto (orações que os conceitos já resolveram com trecho não vão para lá)
  const quoted = [...raw.matchAll(/["“”]([^"“”]{1,200})["“”]/g)].map(m => `"${m[1]}"`).join(' ');
  const legacyInput = owned.size ? (clauses.filter((_, i) => !owned.has(i)).join(', ') + (quoted ? ' ' + quoted : '')).trim() : (taught.used.length ? textT : raw);
  const L = legacyInput || !prev ? legacyInterpret(legacyInput, base, ctx) : { spec: deepClone(base), said: [], warn: [], ask: [], suggestions: [] };
  if (L.undo || (L.exportNow && !v2.length)) return { ...L, kind: L.undo ? 'undo' : 'edit', actions: [] };
  const spec = L.spec;
  const legacyCon = concerns(base || newSpec(), spec);
  // 3) ações por conceito que as regras clássicas ainda não fizeram
  const plan = orderPlan(v2.filter(a => ACTIONS[a.id]));
  const todo = []; const doneKeys = new Set();
  for (const a of plan) {
    const probe = deepClone(spec); runActions(probe, [a], ctx);
    const cs = concerns(spec, probe);
    if (!cs.size) continue;
    if ([...cs].some(c => legacyCon.has(c))) continue;   // as regras clássicas já cuidaram disso
    const key = a.id + JSON.stringify(a.params) + JSON.stringify(a.scope || null);
    if (doneKeys.has(key)) continue; doneKeys.add(key);
    todo.push(a);
  }
  // resolve tempos relativos (efeito sonoro "no final"/"no meio")
  const res = runActions(spec, todo, ctx);
  // 4) plano final: ações por conceito + mudanças das regras clássicas (como ações)
  const legacyActs = [];
  const seen = new Set(res.done.map(d => d.id));
  L.said.filter(x => !/^Entendi a digita/.test(x)).forEach(x => { legacyActs.push({ id: null, said: x }); });
  const actions = [...legacyActs, ...res.done.map(d => ({ id: d.id, said: d.said, params: d.params, scope: d.scope }))];
  const said = [...new Set([...L.said.filter(x => /^Entendi a digita/.test(x)), ...actions.map(a => a.said)])];
  const warn = [...(L.warn || []), ...res.skipped.filter(x => x.why && !/não se aplica/.test(x.why)).map(x => x.why)];
  if (taught.used.length) said.unshift(`Comando seu: "${taught.used.join('", "')}"`);
  if (correction) said.unshift('Corrigindo a última mudança');
  // ambíguo: "mais rápido" sozinho → cortes mais rápidos, mas oferece a outra leitura
  const suggestions = [...(L.suggestions || [])];
  if (/^\s*(deixa |faz |fica |make it |)(um pouco |bem |muito )?(mais rapido|faster|quicker)\s*$/.test(s) && !lastAct) suggestions.unshift('Na verdade, acelerar o vídeo 2x');
  const ask = actions.length ? [] : (L.ask || []);
  logCommand({ text: raw, ok: actions.length > 0 || !!L.exportNow, n: actions.length, unknown: !actions.length && !L.exportNow });
  return { ...L, kind: correction ? 'correction' : prev ? 'modify' : 'new', spec, said, warn, ask, suggestions, actions, taught: taught.used };
}
