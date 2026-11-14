// Registro de ações de edição.
// Cada ação é uma operação real sobre a especificação da edição (spec), que o montador (planner) e o
// renderizador transformam em vídeo e som. Nenhuma ação é só um botão: todas mudam o resultado.
// Desfazer: toda execução gera uma versão nova; desfazer volta à versão anterior (nada é destrutivo).
import { resolveStyle } from './director.js';
import { LOOKS, PRESETS } from './styles.js';
import { PLATFORMS } from './platforms.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
const tc = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function setO(spec, path, v) { const ks = path.split('.'); let o = spec.over || (spec.over = {}); for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]] || (o[ks[i]] = {}); o[ks[ks.length - 1]] = v; }
function getE(spec) { return resolveStyle(spec); }
function adj(spec, k, v) { const a = { ...((spec.over && spec.over.adjust) || {}) }; a[k] = v; setO(spec, 'adjust', a); return a; }
function adjGet(spec, k, d) { const a = (spec.over && spec.over.adjust) || {}; return a[k] != null ? a[k] : d; }
const scopeTxt = sc => !sc ? '' : sc.label ? ` (${sc.label})` : ` (${tc(sc.from)}–${sc.to === 'end' ? 'fim' : tc(sc.to)})`;
// trecho: cria/atualiza uma seção da edição com o tratamento pedido
function section(spec, sc, patch) {
  spec.sections = spec.sections || [];
  let sec = spec.sections.find(x => x.from === sc.from && x.to === sc.to);
  if (!sec) { sec = { from: sc.from, to: sc.to }; spec.sections.push(sec); }
  Object.assign(sec, patch);
  if (patch.adjust) sec.adjust = { ...(sec.adjust || {}), ...patch.adjust };
  return sec;
}

export const TRANSITIONS = { cut: 'corte seco', dissolve: 'fusão', dip: 'mergulho no preto', flash: 'flash', whip: 'chicote', zoom: 'zoom', glitch: 'glitch', blur: 'desfoque', spin: 'giro', burn: 'queima de filme', slide: 'empurrar', mask: 'máscara redonda' };
export const MOODS = { epic: 'épica', dramatic: 'dramática', emotional: 'emocionante', upbeat: 'animada', electronic: 'eletrônica', atmospheric: 'calma', reflective: 'reflexiva' };

const P = (type, def, min, max, extra = {}) => ({ type, def, min, max, ...extra });

export const ACTIONS = {
  // ---------------- RITMO ----------------
  SET_CUT_PACING: { name: 'Ritmo dos cortes', cat: 'ritmo', desc: 'Muda o tempo médio de cada tomada (multiplicador: <1 mais rápido, >1 mais lento).', scoped: true,
    params: { factor: P('number', 0.75, 0.25, 4) },
    apply(spec, p, sc) {
      if (sc) { section(spec, sc, { pace: p.factor < 1 ? 'fast' : 'slow' }); if (sc.from === 0 && p.factor < 1 && typeof sc.to === 'number') spec.hookSeconds = Math.max(spec.hookSeconds || 0, Math.min(sc.to, 6)); return `Cortes ${p.factor < 1 ? 'mais rápidos' : 'mais lentos'}${scopeTxt(sc)}`; }
      const cur = getE(spec).pacing.avgShot; const v = clamp(cur * p.factor, 0.35, 12); setO(spec, 'pacing.avgShot', +v.toFixed(2));
      return `Cortes ${p.factor < 1 ? 'mais rápidos' : 'mais lentos'}: média ${fmt(cur)} → ${fmt(v)} s`;
    } },
  SET_CUT_VARIATION: { name: 'Variação do ritmo', cat: 'ritmo', desc: 'Tomadas de tamanhos parecidos (0) ou bem variados (1).', params: { amount: P('number', 0.8, 0, 1) },
    apply(spec, p) { setO(spec, 'pacing.variation', p.amount); return p.amount > 0.5 ? 'Ritmo mais variado (tomadas curtas e longas)' : 'Ritmo mais regular'; } },
  SYNC_CUTS_TO_BEATS: { name: 'Cortes na batida', cat: 'ritmo', desc: 'Encaixa os cortes nas batidas da música.', params: { on: P('bool', true) },
    apply(spec, p) { setO(spec, 'pacing.beatSync', p.on); return p.on ? 'Cortes sincronizados com a batida' : 'Cortes livres da batida'; } },
  REMOVE_SILENCE: { name: 'Tirar silêncios', cat: 'ritmo', desc: 'Remove pausas e tempo morto da fala.', params: { on: P('bool', true), aggressive: P('bool', false) },
    apply(spec, p) { setO(spec, 'silence.remove', p.on); if (p.on && p.aggressive) { setO(spec, 'silence.minLen', 0.18); setO(spec, 'silence.pad', 0.03); } return p.on ? (p.aggressive ? 'Sem nenhum tempo morto (cortes secos, estilo jump cut)' : 'Tirar silêncios e pausas') : 'Manter as pausas'; } },
  REMOVE_FILLERS: { name: 'Tirar muletas', cat: 'ritmo', desc: 'Tira "ahn", "tipo", "né" (precisa da transcrição).', params: { on: P('bool', true) },
    apply(spec, p) { setO(spec, 'fillers', p.on); return p.on ? 'Tirar muletas de fala (ahn, tipo, né)' : 'Manter muletas'; } },
  SET_DURATION: { name: 'Duração', cat: 'ritmo', desc: 'Duração final do vídeo.', params: { seconds: P('number', 30, 3, 3600) },
    apply(spec, p) { spec.target = { seconds: p.seconds }; spec.outputs = spec.outputs.map(o => ({ ...o, duration: p.seconds })); return `Duração final de cerca de ${fmt(p.seconds)} s`; } },
  SCALE_DURATION: { name: 'Mais curto / mais longo', cat: 'ritmo', desc: 'Encurta ou alonga em relação ao atual.', params: { factor: P('number', 0.75, 0.2, 3) },
    apply(spec, p, sc, ctx) { const cur = (ctx && ctx.plan && ctx.plan.duration) || (spec.target && spec.target.seconds) || 30; const v = Math.max(3, Math.round(cur * p.factor)); spec.target = { seconds: v }; spec.outputs = spec.outputs.map(o => ({ ...o, duration: v })); return `Vídeo ${p.factor < 1 ? 'mais curto' : 'mais longo'}: ${fmt(cur)} → ${fmt(v)} s`; } },
  KEEP_HIGHLIGHTS: { name: 'Só os melhores momentos', cat: 'ritmo', desc: 'Mantém os trechos de mais energia e fala, tirando o resto.', params: { share: P('number', 0.6, 0.2, 1) },
    apply(spec, p, sc, ctx) { setO(spec, 'pacing.dynamic', true); setO(spec, 'silence.remove', true); const cur = (ctx && ctx.plan && ctx.plan.duration) || 60; spec.target = { seconds: Math.max(6, Math.round(cur * p.share)) }; spec.outputs = spec.outputs.map(o => ({ ...o, duration: spec.target.seconds })); return `Só os melhores momentos (≈${fmt(spec.target.seconds)} s), escolhidos pela energia do som, movimento e fala`; } },
  HOOK_OPENING: { name: 'Começo que prende', cat: 'estrutura', desc: 'Abre com o trecho mais forte e corta rápido nos primeiros segundos.', params: { seconds: P('number', 3, 1, 10) },
    apply(spec, p) { spec.hookSeconds = p.seconds; return `Começo que prende: gancho com o melhor trecho e ${fmt(p.seconds)} s de cortes rápidos`; } },
  STRONG_ENDING: { name: 'Final marcante', cat: 'estrutura', desc: 'Últimos segundos mais lentos, música crescendo e saindo no fim.', params: { mood: P('enum', 'emotional', null, null, { options: Object.keys(MOODS) }), seconds: P('number', 5, 2, 20) },
    apply(spec, p) { spec.sections = (spec.sections || []).filter(s => !(s.from < 0 && s.mood)); spec.sections.push({ from: -p.seconds, to: 0, pace: 'slow', mood: p.mood }); return `Final ${MOODS[p.mood] || 'marcante'} nos últimos ${fmt(p.seconds)} s (mais lento, música crescendo e saindo)`; } },
  ENDING_FADE: { name: 'Escurecer no fim', cat: 'estrutura', desc: 'Termina com a imagem e o som sumindo.', params: { seconds: P('number', 1.5, 0.3, 6) },
    apply(spec, p) { setO(spec, 'ending.fade', true); setO(spec, 'ending.fadeSec', p.seconds); spec.music.fadeOut = Math.max(spec.music.fadeOut || 0, p.seconds + 1); return `Final escurecendo em ${fmt(p.seconds)} s, com a música sumindo junto`; } },
  COPY_SECTION: { name: 'Copiar tratamento de um trecho', cat: 'estrutura', desc: 'Faz um trecho igual a outro (ex.: final igual ao começo).', params: { fromKey: P('enum', 'start', null, null, { options: ['start', 'end'] }), toKey: P('enum', 'end', null, null, { options: ['start', 'end'] }) },
    apply(spec, p) {
      const isStart = s => s.from === 0, isEnd = s => s.from < 0 || s.to === 'end';
      const src = (spec.sections || []).find(p.fromKey === 'start' ? isStart : isEnd);
      // sem trecho marcado: o começo do estilo atual tem gancho e cortes rápidos; o final, ritmo calmo
      const E = getE(spec);
      const base = src ? { ...src } : p.fromKey === 'start' ? { pace: 'fast' } : { pace: 'slow' }; delete base.from; delete base.to;
      const len = src ? (src.from < 0 ? -src.from : (src.to - src.from)) : (spec.hookSeconds || (E.hook && E.hook.seconds) || 4);
      const target = p.toKey === 'end' ? { from: -len, to: 0 } : { from: 0, to: len };
      spec.sections = (spec.sections || []).filter(s => !(p.toKey === 'end' ? isEnd(s) : isStart(s)));
      spec.sections.push({ ...target, ...base });
      return `${p.toKey === 'end' ? 'Final' : 'Começo'} com o mesmo tratamento do ${p.fromKey === 'start' ? 'começo' : 'final'} (${fmt(len)} s)`;
    } },
  // ---------------- TRANSIÇÕES ----------------
  SET_TRANSITION_STYLE: { name: 'Tipo de transição', cat: 'transicao', desc: 'Usa um tipo de transição entre as cenas.', params: { type: P('enum', 'dissolve', null, null, { options: Object.keys(TRANSITIONS) }), share: P('number', 0.6, 0.05, 1), dur: P('number', 0.4, 0.08, 2) },
    apply(spec, p) { if (p.type === 'cut') { setO(spec, 'transitions.mix', { cut: 1 }); return 'Só cortes secos, sem transição'; } setO(spec, 'transitions.mix', { cut: +(1 - p.share).toFixed(2), [p.type]: p.share }); setO(spec, 'transitions.dur', p.dur); return `Transições de ${TRANSITIONS[p.type]} (${Math.round(p.share * 100)}% dos cortes, ${fmt(p.dur)} s)`; } },
  SMOOTHER_TRANSITIONS: { name: 'Transições mais suaves', cat: 'transicao', desc: 'Troca transições bruscas por fusões e deixa mais longas.', params: { amount: P('number', 1, 0.2, 2) },
    apply(spec, p) { const E = getE(spec); const d = clamp((E.transitions.dur || 0.3) * (1 + 0.5 * p.amount), 0.3, 1.5); setO(spec, 'transitions.mix', { cut: 0.45, dissolve: 0.45, blur: 0.1 }); setO(spec, 'transitions.dur', +d.toFixed(2)); return `Transições mais suaves (fusão e desfoque, ${fmt(d)} s)`; } },
  SNAPPIER_TRANSITIONS: { name: 'Transições mais rápidas/fortes', cat: 'transicao', desc: 'Transições curtas e de impacto (chicote, zoom, flash).', params: { amount: P('number', 1, 0.2, 2) },
    apply(spec, p) { setO(spec, 'transitions.mix', { cut: 0.55, whip: 0.2, zoom: 0.15, flash: 0.1 }); setO(spec, 'transitions.dur', 0.18); return 'Transições rápidas e de impacto (chicote, zoom e flash)'; } },
  TRANSITION_DURATION: { name: 'Duração das transições', cat: 'transicao', desc: 'Deixa as transições mais longas ou curtas.', params: { factor: P('number', 1.5, 0.3, 4) },
    apply(spec, p) { const d = clamp((getE(spec).transitions.dur || 0.3) * p.factor, 0.08, 2); setO(spec, 'transitions.dur', +d.toFixed(2)); return `Transições ${p.factor > 1 ? 'mais longas' : 'mais curtas'} (${fmt(d)} s)`; } },
  TRANSITION_SFX: { name: 'Som nas transições', cat: 'audio', desc: 'Whoosh e impacto nas transições.', params: { on: P('bool', true) },
    apply(spec, p) { setO(spec, 'sfx.onTransitions', p.on); setO(spec, 'sfx.density', p.on ? Math.max(getE(spec).sfx.density || 0, 0.5) : 0); return p.on ? 'Efeitos sonoros nas transições (whoosh, impacto)' : 'Sem som nas transições'; } },
  // ---------------- CÂMERA E MOVIMENTO ----------------
  PUNCH_ZOOM: { name: 'Zoom de ênfase', cat: 'camera', desc: 'Aproxima de repente nas frases e palavras fortes.', params: { amount: P('number', 0.7, 0, 1.5) },
    apply(spec, p) { setO(spec, 'effects.punchIn', p.amount); setO(spec, 'noZoom', false); return p.amount ? `Zoom de ênfase (${p.amount > 0.8 ? 'forte' : p.amount < 0.4 ? 'leve' : 'médio'})` : 'Sem zoom de ênfase'; } },
  SLOW_PUSH: { name: 'Zoom lento', cat: 'camera', desc: 'Aproxima devagar e continuamente (dolly / Ken Burns).', scoped: true, params: { amount: P('number', 1, 0.2, 2) },
    apply(spec, p, sc) { if (sc) { section(spec, sc, { push: p.amount }); return 'Zoom lento' + scopeTxt(sc); } setO(spec, 'slowPush', p.amount); setO(spec, 'noZoom', false); return 'Zoom lento e contínuo em cada tomada'; } },
  NO_ZOOM: { name: 'Sem zoom', cat: 'camera', desc: 'Tira todo zoom e pulso.', params: {},
    apply(spec) { setO(spec, 'effects.punchIn', 0); setO(spec, 'noZoom', true); setO(spec, 'slowPush', 0); setO(spec, 'beatPulse', 0); return 'Sem zoom nenhum'; } },
  BEAT_PULSE: { name: 'Pulso na batida', cat: 'camera', desc: 'Zoom curtinho a cada batida da música.', params: { amount: P('number', 0.7, 0, 1.5) },
    apply(spec, p) { setO(spec, 'beatPulse', p.amount); return p.amount ? 'Zoom pulsando nas batidas da música' : 'Sem pulso na batida'; } },
  CAMERA_SHAKE: { name: 'Tremor de câmera', cat: 'camera', desc: 'Tremor nos impactos (ou num trecho).', scoped: true, params: { amount: P('number', 0.6, 0, 1.5) },
    apply(spec, p, sc) { if (sc) { section(spec, sc, { shake: p.amount }); return 'Tremor de câmera' + scopeTxt(sc); } setO(spec, 'effects.shake', p.amount); return p.amount ? 'Tremor de câmera nos impactos' : 'Sem tremor'; } },
  HANDHELD: { name: 'Câmera na mão', cat: 'camera', desc: 'Simula câmera na mão: balanço leve e contínuo.', params: { amount: P('number', 0.5, 0.1, 1) },
    apply(spec, p) { setO(spec, 'handheld', p.amount); return 'Simulação de câmera na mão (balanço leve)'; } },
  FACE_FRAMING: { name: 'Enquadrar o rosto', cat: 'camera', desc: 'Enquadramento mais fechado seguindo a pessoa (detecção de rosto por cor de pele).', params: { tight: P('number', 1.12, 0.85, 1.5) },
    apply(spec, p) { const v = clamp(((spec.over && spec.over.faceZoom) || 1) * p.tight, 0.85, 1.5); setO(spec, 'faceZoom', +v.toFixed(2)); setO(spec, 'fit', false); return p.tight >= 1 ? 'Enquadramento mais fechado no rosto, seguindo a pessoa' : 'Enquadramento mais aberto'; } },
  FIT_FRAME: { name: 'Vídeo inteiro com fundo desfocado', cat: 'camera', desc: 'Mostra o quadro inteiro sem cortar, com fundo borrado.', params: { on: P('bool', true) },
    apply(spec, p) { setO(spec, 'fit', p.on); return p.on ? 'Vídeo inteiro aparecendo, com fundo desfocado' : 'Vídeo preenchendo a tela'; } },
  MIRROR: { name: 'Espelhar', cat: 'camera', desc: 'Inverte a imagem na horizontal.', params: { on: P('bool', true) }, apply(spec, p) { setO(spec, 'mirror', p.on); return p.on ? 'Imagem espelhada' : 'Imagem normal'; } },
  // ---------------- VELOCIDADE ----------------
  PLAYBACK_SPEED: { name: 'Velocidade do vídeo', cat: 'velocidade', desc: 'Acelera ou deixa em câmera lenta (num trecho ou no vídeo todo).', scoped: true, params: { speed: P('number', 0.5, 0.25, 4) },
    apply(spec, p, sc) { const s2 = sc || { from: 0, to: 'end', label: 'vídeo todo' }; section(spec, s2, { speed: p.speed }); return `${p.speed < 1 ? (p.speed <= 0.35 ? 'Super câmera lenta' : 'Câmera lenta') : `Acelerado ${fmt(p.speed)}x`}${scopeTxt(s2)}`; } },
  SLOWMO_HIGHLIGHTS: { name: 'Câmera lenta nos melhores momentos', cat: 'velocidade', desc: 'Câmera lenta nas tomadas de mais movimento.', params: { amount: P('number', 0.6, 0.1, 1) },
    apply(spec, p) { setO(spec, 'effects.slowmo', p.amount); return 'Câmera lenta nos momentos de mais movimento'; } },
  SPEED_RAMP: { name: 'Rampa de velocidade', cat: 'velocidade', desc: 'Acelera e desacelera em volta dos momentos fortes.', params: { on: P('bool', true) },
    apply(spec, p) { setO(spec, 'effects.speedRamp', p.on); return p.on ? 'Rampas de velocidade nos momentos fortes' : 'Sem rampas de velocidade'; } },
  // ---------------- TEXTO ----------------
  CAPTION_STYLE: { name: 'Estilo da legenda', cat: 'texto', desc: 'Liga a legenda com um estilo.', params: { style: P('string', 'dinamico') },
    apply(spec, p) { spec.captions.enabled = true; spec.captions.style = p.style; return `Legenda no estilo ${p.style}`; } },
  CAPTIONS_OFF: { name: 'Sem legenda', cat: 'texto', desc: 'Desliga a legenda.', params: {}, apply(spec) { spec.captions.enabled = false; return 'Sem legenda'; } },
  CAPTION_SIZE: { name: 'Tamanho da legenda', cat: 'texto', desc: 'Legenda maior ou menor.', params: { factor: P('number', 1.2, 0.4, 2.5) },
    apply(spec, p) { const v = clamp(((spec.over && spec.over.captionScale) || 1) * p.factor, 0.5, 2.2); setO(spec, 'captionScale', +v.toFixed(2)); return `Legenda ${p.factor > 1 ? 'maior' : 'menor'} (${Math.round(v * 100)}%)`; } },
  CAPTION_POSITION: { name: 'Posição da legenda', cat: 'texto', desc: 'Sobe ou desce a legenda (0 = topo, 1 = base).', params: { y: P('number', 0.5, 0.15, 0.85) },
    apply(spec, p) { setO(spec, 'captionY', p.y); return `Legenda ${p.y < 0.4 ? 'em cima' : p.y > 0.62 ? 'embaixo' : 'no meio'}`; } },
  CAPTION_COLOR: { name: 'Cor do destaque da legenda', cat: 'texto', desc: 'Cor da palavra em destaque.', params: { color: P('string', '#FFE81F') }, apply(spec, p) { setO(spec, 'captionColor', p.color); return `Destaque da legenda em ${p.color}`; } },
  OPENING_TITLE: { name: 'Título', cat: 'texto', desc: 'Título animado.', params: { text: P('string', '') }, apply(spec, p) { if (!p.text) return null; spec.title = p.text; return `Título "${p.text}"`; } },
  END_CARD: { name: 'Cartela final', cat: 'texto', desc: 'Texto nos últimos segundos (ex.: siga para mais).', params: { text: P('string', 'Siga para mais') },
    apply(spec, p) { spec.texts = (spec.texts || []).filter(t => !t.endCard); spec.texts.push({ shape: 'block', style: 'caixa', text: p.text, all: false, endCard: true }); return `Cartela final: "${p.text}"`; } },
  LOWER_THIRD: { name: 'Nome na tela', cat: 'texto', desc: 'Nome e cargo na parte de baixo (lower third).', params: { text: P('string', '') },
    apply(spec, p) { if (!p.text) return null; spec.texts = (spec.texts || []).filter(t => t.style !== 'terco'); spec.texts.push({ shape: 'block', style: 'terco', text: p.text, all: false, dur: 4 }); return `Nome na tela: "${p.text}"`; } },
  PROGRESS_BAR: { name: 'Barra de progresso', cat: 'texto', desc: 'Barra que enche até o fim.', params: { on: P('bool', true) }, apply(spec, p) { setO(spec, 'progressBar', p.on); return p.on ? 'Barra de progresso' : 'Sem barra de progresso'; } },
  // ---------------- EFEITOS ----------------
  FX: { name: 'Efeito visual', cat: 'efeito', desc: 'Grão, VHS, glitch, aberração cromática, distorção de lente, brilho, vinheta, desfoque, nitidez.', scoped: true,
    params: { kind: P('enum', 'grain', null, null, { options: ['grain', 'vhs', 'glitch', 'chroma', 'lens', 'bloom', 'vignette', 'blur', 'sharpen', 'leak', 'letterbox'] }), amount: P('number', 0.6, 0, 1.5) },
    apply(spec, p, sc) {
      const NAMES = { grain: 'grão de filme', vhs: 'VHS', glitch: 'glitch', chroma: 'aberração cromática', lens: 'distorção de lente', bloom: 'brilho (bloom)', vignette: 'vinheta', blur: 'desfoque', sharpen: 'nitidez', leak: 'vazamento de luz', letterbox: 'faixas de cinema' };
      if (p.kind === 'leak') { setO(spec, 'effects.lightLeak', p.amount); return p.amount ? 'Vazamentos de luz' : 'Sem vazamentos de luz'; }
      if (p.kind === 'letterbox') { setO(spec, 'effects.letterbox', !!p.amount); return p.amount ? 'Faixas de cinema' : 'Sem faixas de cinema'; }
      const v = p.kind === 'blur' ? clamp(p.amount * 0.6, 0, 1) : p.amount;
      if (sc) { section(spec, sc, { adjust: { [p.kind]: v } }); return `${NAMES[p.kind][0].toUpperCase() + NAMES[p.kind].slice(1)}${scopeTxt(sc)}`; }
      adj(spec, p.kind, v); return p.amount ? NAMES[p.kind][0].toUpperCase() + NAMES[p.kind].slice(1) : 'Sem ' + NAMES[p.kind];
    } },
  FLASH_ON_BEATS: { name: 'Flash na batida', cat: 'efeito', desc: 'Clarões nas batidas fortes.', scoped: true, params: { amount: P('number', 0.6, 0, 1) },
    apply(spec, p, sc) { section(spec, sc || { from: 0, to: 'end' }, { flash: p.amount }); return 'Flashes nas batidas fortes' + scopeTxt(sc); } },
  // ---------------- COR ----------------
  COLOR_LOOK: { name: 'Look de cor', cat: 'cor', desc: 'Aplica um look (cinematográfico, quente, frio, teal & orange, vintage...).', scoped: true, params: { look: P('enum', 'cinematic', null, null, { options: Object.keys(LOOKS) }), intensity: P('number', 0.85, 0, 1) },
    apply(spec, p, sc) { if (sc) { section(spec, sc, { look: p.look }); return `Cor ${LOOKS[p.look].label || p.look}${scopeTxt(sc)}`; } setO(spec, 'color.look', p.look); setO(spec, 'color.intensity', p.intensity); return `Cor: ${LOOKS[p.look].label || p.look}`; } },
  EXPOSURE: { name: 'Exposição', cat: 'cor', desc: 'Mais claro ou mais escuro (em stops).', scoped: true, params: { delta: P('number', 0.3, -2, 2) },
    apply(spec, p, sc) { if (sc) { section(spec, sc, { adjust: { exposure: p.delta } }); return `${p.delta > 0 ? 'Mais claro' : 'Mais escuro'}${scopeTxt(sc)}`; } const v = clamp(adjGet(spec, 'exposure', 0) + p.delta, -2, 2); adj(spec, 'exposure', +v.toFixed(2)); return p.delta > 0 ? 'Imagem mais clara' : 'Imagem mais escura'; } },
  CONTRAST: { name: 'Contraste', cat: 'cor', desc: 'Mais ou menos contraste.', params: { factor: P('number', 1.15, 0.5, 2) }, apply(spec, p) { const v = clamp(adjGet(spec, 'contrast', 1) * p.factor, 0.5, 2); adj(spec, 'contrast', +v.toFixed(2)); return p.factor > 1 ? 'Mais contraste' : 'Menos contraste'; } },
  SATURATION: { name: 'Saturação', cat: 'cor', desc: 'Cores mais vivas ou mais lavadas (0 = preto e branco).', scoped: true, params: { factor: P('number', 1.2, 0, 2) },
    apply(spec, p, sc) { if (sc) { section(spec, sc, { adjust: { saturation: p.factor } }); return `${p.factor === 0 ? 'Preto e branco' : p.factor > 1 ? 'Cores mais vivas' : 'Cores mais lavadas'}${scopeTxt(sc)}`; } const v = p.factor === 0 ? 0 : clamp(adjGet(spec, 'saturation', 1) * p.factor, 0, 2); adj(spec, 'saturation', +v.toFixed(2)); return p.factor === 0 ? 'Preto e branco' : p.factor > 1 ? 'Cores mais vivas' : 'Cores mais lavadas'; } },
  TEMPERATURE: { name: 'Temperatura de cor', cat: 'cor', desc: 'Mais quente (laranja) ou mais fria (azul).', params: { delta: P('number', 0.12, -0.5, 0.5) }, apply(spec, p) { const v = clamp(adjGet(spec, 'temp', 0) + p.delta, -0.5, 0.5); adj(spec, 'temp', +v.toFixed(2)); return p.delta > 0 ? 'Cor mais quente' : 'Cor mais fria'; } },
  SHADOWS_HIGHLIGHTS: { name: 'Sombras e realces', cat: 'cor', desc: 'Levanta sombras ou segura realces.', params: { shadows: P('number', 0.3, -1, 1), highlights: P('number', 0, -1, 1) },
    apply(spec, p) { if (p.shadows) adj(spec, 'shadows', p.shadows); if (p.highlights) adj(spec, 'highlights', p.highlights); return [p.shadows > 0 && 'Sombras mais abertas', p.shadows < 0 && 'Sombras mais fechadas', p.highlights < 0 && 'Realces recuperados', p.highlights > 0 && 'Realces mais claros'].filter(Boolean).join(', '); } },
  // ---------------- MÚSICA ----------------
  MUSIC_MOOD: { name: 'Clima da música', cat: 'musica', desc: 'Escolhe da sua biblioteca a música com o clima pedido.', params: { mood: P('enum', 'upbeat', null, null, { options: Object.keys(MOODS) }) },
    apply(spec, p) { spec.music.mood = p.mood; spec.music.none = false; spec.music.pick = 'auto'; return `Música ${MOODS[p.mood]} (da sua biblioteca)`; } },
  MUSIC_AUTO: { name: 'Música que combina', cat: 'musica', desc: 'Escolhe da sua biblioteca a música que combina com o estilo, a duração e o ritmo.', params: {},
    apply(spec) { spec.music.none = false; spec.music.pick = 'auto'; return 'Música escolhida para combinar com o vídeo (clima do estilo, duração e ritmo)'; } },
  NO_MUSIC: { name: 'Sem música', cat: 'musica', desc: 'Tira a música.', params: {}, apply(spec) { spec.music.none = true; return 'Sem música'; } },
  MUSIC_VOLUME: { name: 'Volume da música', cat: 'musica', desc: 'Sobe ou desce a música (dB).', scoped: true, params: { db: P('number', -4, -24, 12) },
    apply(spec, p, sc) { spec.audio = spec.audio || {}; spec.audio.musicDb = clamp((spec.audio.musicDb || 0) + p.db, -24, 12); return `Música ${p.db > 0 ? 'mais alta' : 'mais baixa'} (${p.db > 0 ? '+' : ''}${fmt(p.db)} dB)`; } },
  MUSIC_POWER: { name: 'Música mais forte', cat: 'musica', desc: 'Música mais presente e com mais energia (volume, menos abaixamento, crescendo no fim).', params: { amount: P('number', 1, 0.3, 2) },
    apply(spec, p) { spec.audio = spec.audio || {}; spec.audio.musicDb = clamp((spec.audio.musicDb || 0) + 3 * p.amount, -24, 12); spec.music.intensity = clamp((spec.music.intensity || 0) + 0.3 * p.amount, 0, 1); spec.music.swell = true; return 'Música mais forte: mais alta, mais presente e crescendo no final'; } },
  DUCKING: { name: 'Abaixar música na fala', cat: 'musica', desc: 'Quanto a música abaixa quando alguém fala (dB).', params: { db: P('number', -16, -30, 0) },
    apply(spec, p) { setO(spec, 'music.duckDb', p.db); return p.db < -2 ? `Música abaixa ${fmt(-p.db)} dB quando você fala` : 'Música sem abaixar na fala'; } },
  MUSIC_FADE: { name: 'Fade da música', cat: 'musica', desc: 'Entrada e saída suaves da música.', params: { fadeIn: P('number', 1, 0, 10), fadeOut: P('number', 3, 0, 15) },
    apply(spec, p) { spec.music.fadeIn = p.fadeIn; spec.music.fadeOut = p.fadeOut; return `Música entrando em ${fmt(p.fadeIn)} s e saindo naturalmente em ${fmt(p.fadeOut)} s`; } },
  MUSIC_PEAK: { name: 'Música no refrão', cat: 'musica', desc: 'Começa a música na parte mais forte (refrão/drop).', params: {}, apply(spec) { spec.music.peak = true; spec.music.start = null; return 'Música começando no refrão / drop'; } },
  MUSIC_ENTER: { name: 'Entrada da música', cat: 'musica', desc: 'A música entra só depois de alguns segundos.', params: { at: P('number', 3, 0, 120) }, apply(spec, p) { spec.music.enterAt = p.at; spec.music.none = false; return `Música entrando aos ${fmt(p.at)} s`; } },
  MUSIC_PREVIOUS: { name: 'Música anterior', cat: 'musica', desc: 'Volta a usar a música da versão anterior.', params: {}, apply(spec, p, sc, ctx) { const prev = ctx && ctx.prevMusicId; if (!prev) return null; spec.music.srcId = prev; spec.music.pick = 'fixed'; spec.music.none = false; return 'Voltei para a música anterior'; } },
  // ---------------- ÁUDIO ----------------
  VOICE_VOLUME: { name: 'Volume da voz', cat: 'audio', desc: 'Sobe ou desce a voz (dB).', params: { db: P('number', 3, -24, 12) }, apply(spec, p) { spec.audio = spec.audio || {}; spec.audio.originalDb = clamp((spec.audio.originalDb || 0) + p.db, -24, 12); return `Voz ${p.db > 0 ? 'mais alta' : 'mais baixa'} (${p.db > 0 ? '+' : ''}${fmt(p.db)} dB)`; } },
  NOISE_REDUCTION: { name: 'Redução de ruído', cat: 'audio', desc: 'Tira chiado e barulho de fundo da voz (subtração espectral do perfil de ruído medido nos trechos sem fala).', params: { amount: P('number', 0.7, 0, 1) },
    apply(spec, p) { spec.audio = spec.audio || {}; spec.audio.denoise = p.amount; return p.amount ? `Redução de ruído de fundo (${p.amount > 0.8 ? 'forte' : p.amount < 0.4 ? 'leve' : 'média'})` : 'Sem redução de ruído'; } },
  VOICE_CLARITY: { name: 'Voz mais clara', cat: 'audio', desc: 'Corta graves que embolam, realça a presença (3 kHz) e comprime a voz.', params: { amount: P('number', 0.7, 0, 1) },
    apply(spec, p) { spec.audio = spec.audio || {}; spec.audio.clarity = p.amount; return p.amount ? 'Voz mais clara (filtro de graves, presença e compressão)' : 'Voz sem tratamento'; } },
  COMPRESSION: { name: 'Compressão', cat: 'audio', desc: 'Volume mais constante (compressor).', params: { amount: P('number', 0.6, 0, 1) }, apply(spec, p) { spec.audio = spec.audio || {}; spec.audio.comp = p.amount; return p.amount ? 'Compressão: volume mais constante' : 'Sem compressão extra'; } },
  EQ: { name: 'Equalização', cat: 'audio', desc: 'Graves, médios e agudos (dB) na voz ou na música.', params: { target: P('enum', 'music', null, null, { options: ['music', 'voice'] }), low: P('number', 0, -12, 12), mid: P('number', 0, -12, 12), high: P('number', 0, -12, 12) },
    apply(spec, p) { spec.audio = spec.audio || {}; const k = p.target === 'voice' ? 'voiceEq' : 'musicEq'; const cur = spec.audio[k] || { low: 0, mid: 0, high: 0 }; spec.audio[k] = { low: clamp(cur.low + p.low, -12, 12), mid: clamp(cur.mid + p.mid, -12, 12), high: clamp(cur.high + p.high, -12, 12) }; const parts = [p.low && `graves ${p.low > 0 ? '+' : ''}${p.low} dB`, p.mid && `médios ${p.mid > 0 ? '+' : ''}${p.mid} dB`, p.high && `agudos ${p.high > 0 ? '+' : ''}${p.high} dB`].filter(Boolean); return `Equalização da ${p.target === 'voice' ? 'voz' : 'música'}: ${parts.join(', ')}`; } },
  STEREO_BALANCE: { name: 'Balanço estéreo', cat: 'audio', desc: 'Puxa o som para a esquerda ou direita (-1 a 1).', params: { pan: P('number', 0, -1, 1) }, apply(spec, p) { spec.audio = spec.audio || {}; spec.audio.pan = p.pan; return p.pan ? `Som puxado para a ${p.pan < 0 ? 'esquerda' : 'direita'}` : 'Som centralizado'; } },
  MUTE_ORIGINAL: { name: 'Tirar o som original', cat: 'audio', desc: 'Deixa só a música.', params: { on: P('bool', true) }, apply(spec, p) { spec.audio = spec.audio || {}; spec.audio.muteOriginal = p.on; return p.on ? 'Sem o som original (só música)' : 'Com o som original'; } },
  SFX_DENSITY: { name: 'Efeitos sonoros', cat: 'audio', desc: 'Quantidade de efeitos sonoros automáticos.', params: { amount: P('number', 0.5, 0, 1) }, apply(spec, p) { setO(spec, 'sfx.density', p.amount); return p.amount ? `Efeitos sonoros (${p.amount > 0.6 ? 'muitos' : p.amount < 0.3 ? 'poucos' : 'na medida'})` : 'Sem efeitos sonoros'; } },
  ADD_SFX: { name: 'Efeito sonoro num ponto', cat: 'audio', desc: 'Põe um efeito sonoro (boom, whoosh, riser...) num momento.', params: { kind: P('enum', 'boom', null, null, { options: ['boom', 'whoosh', 'riser', 'impact', 'pop', 'click', 'ding', 'glitch', 'swish', 'camera', 'notify', 'drop', 'tension'] }), at: P('number', 0, -3600, 3600) },
    apply(spec, p) { spec.sfxRequests = spec.sfxRequests || []; spec.sfxRequests.push({ kind: p.kind, at: p.at, count: 1 }); return `Efeito sonoro "${p.kind}" ${p.at === -0.5 ? 'no meio' : p.at < 0 ? 'no final' : 'em ' + tc(p.at)}`; } },
  BLEEP: { name: 'Bipar palavrões', cat: 'audio', desc: 'Bipe por cima dos palavrões e legenda mascarada.', params: { on: P('bool', true) }, apply(spec, p) { setO(spec, 'bleep', p.on); return p.on ? 'Bipar palavrões' : 'Sem bipe'; } },
  // ---------------- CORTES ESPECÍFICOS (linha do tempo) ----------------
  CLIP_TRIM: { name: 'Encurtar/alongar um corte', cat: 'ritmo', desc: 'Muda a duração de um corte específico.', params: { srcId: P('string', ''), in: P('number', 0, 0, 1e6), dur: P('number', 2, 0.05, 600), factor: P('number', 0.6, 0.2, 3), label: P('string', '') },
    apply(spec, p) { if (!p.srcId) return null; spec.ops.push({ op: 'trim', srcId: p.srcId, in: p.in, delta: +(p.dur * (p.factor - 1)).toFixed(2) }); return `${p.label || 'Corte'} ${p.factor < 1 ? 'mais curto' : 'mais longo'} (${fmt(p.dur)} → ${fmt(p.dur * p.factor)} s)`; } },
  CLIP_DELETE: { name: 'Tirar um corte', cat: 'ritmo', desc: 'Remove um corte específico.', params: { srcId: P('string', ''), in: P('number', 0, 0, 1e6), label: P('string', '') },
    apply(spec, p) { if (!p.srcId) return null; spec.ops.push({ op: 'deleteClip', srcId: p.srcId, in: p.in }); return `Tirei ${p.label || 'o corte'}`; } },
  CLIP_SPEED: { name: 'Velocidade de um corte', cat: 'velocidade', desc: 'Acelera ou desacelera um corte específico.', params: { srcId: P('string', ''), in: P('number', 0, 0, 1e6), speed: P('number', 0.5, 0.25, 4), label: P('string', '') },
    apply(spec, p) { if (!p.srcId) return null; spec.ops.push({ op: 'setSpeed', srcId: p.srcId, in: p.in, speed: p.speed }); return `${p.label || 'Corte'} ${p.speed < 1 ? 'em câmera lenta' : `acelerado ${fmt(p.speed)}x`}`; } },
  ZOOM_AT: { name: 'Zoom num ponto', cat: 'camera', desc: 'Aproxima de repente num momento (ex.: "zoom aqui").', params: { srcId: P('string', ''), at: P('number', 0, 0, 1e6), amount: P('number', 0.15, 0.05, 0.5), label: P('string', '') },
    apply(spec, p) { if (!p.srcId) return null; spec.ops.push({ op: 'zoomAt', srcId: p.srcId, at: p.at, amount: p.amount }); return `Zoom ${p.label || 'nesse ponto'}`; } },
  REMOVE_TRANSITION_AT: { name: 'Tirar uma transição', cat: 'transicao', desc: 'Troca a transição mais perto do ponto por corte seco.', params: { t: P('number', 0, 0, 1e6) },
    apply(spec, p) { spec.ops.push({ op: 'removeTransition', t: p.t }); return `Transição em ${tc(p.t)} virou corte seco`; } },
  // ---------------- ESTILO E FORMATO ----------------
  SET_PROFILE: { name: 'Perfil de edição', cat: 'estilo', desc: 'Aplica um perfil (combinação de ritmo, cor, transições, música, efeitos e texto).', params: { id: P('enum', 'cinematic', null, null, { options: Object.keys(PRESETS) }), weight: P('number', 1, 0.1, 1) },
    apply(spec, p) { if (p.weight >= 1) spec.mix = [{ id: p.id, w: 1 }]; else { spec.mix = [...(spec.mix || []).filter(x => x.id !== p.id).map(x => ({ ...x, w: x.w * (1 - p.weight) })), { id: p.id, w: p.weight }]; } return `Perfil: ${PRESETS[p.id].label}${p.weight < 1 ? ` (${Math.round(p.weight * 100)}%)` : ''}`; } },
  INTENSITY: { name: 'Intensidade do estilo', cat: 'estilo', desc: 'Mantém o estilo e deixa mais ou menos agressivo.', params: { factor: P('number', 0.65, 0.2, 2) },
    apply(spec, p) { const v = clamp(((spec.over && spec.over.intensity) || 1) * p.factor, 0.2, 2); setO(spec, 'intensity', +v.toFixed(2)); return `Mesmo estilo, ${p.factor < 1 ? 'menos agressivo' : 'mais intenso'} (${Math.round(v * 100)}%)`; } },
  SET_FORMAT: { name: 'Formato', cat: 'estilo', desc: 'Plataforma e proporção (Reels, TikTok, Shorts, YouTube, Stories...).', params: { platform: P('enum', 'reels', null, null, { options: Object.keys(PLATFORMS) }) },
    apply(spec, p) { spec.outputs = spec.outputs.map((o, i) => i === 0 ? { ...o, platform: p.platform } : o); return `Formato: ${PLATFORMS[p.platform].label}`; } },
  VERSIONS: { name: 'Várias versões', cat: 'estilo', desc: 'Gera versões diferentes para comparar.', params: { n: P('number', 3, 2, 4) }, apply(spec, p) { spec.versions = p.n; return `${p.n} versões diferentes`; } },
};

export const CATEGORY_LABEL = { ritmo: 'Ritmo e cortes', estrutura: 'Começo e final', transicao: 'Transições', camera: 'Câmera e movimento', velocidade: 'Velocidade', texto: 'Texto e legenda', efeito: 'Efeitos visuais', cor: 'Cor', musica: 'Música', audio: 'Som', estilo: 'Estilo e formato' };

// valida e completa os parâmetros com os padrões e limites da ação
export function normalizeParams(id, params = {}) {
  const a = ACTIONS[id]; if (!a) throw new Error('ação desconhecida: ' + id);
  const out = {};
  for (const [k, d] of Object.entries(a.params)) {
    let v = params[k] != null ? params[k] : d.def;
    if (d.type === 'number') { v = Number(v); if (!isFinite(v)) v = d.def; v = clamp(v, d.min, d.max); }
    if (d.type === 'bool') v = !!v;
    if (d.type === 'enum' && d.options && !d.options.includes(v)) v = d.def;
    out[k] = v;
  }
  return out;
}

// executa um plano de ações em ordem; devolve o que foi feito (texto) e o que não pôde ser feito
export function runActions(spec, plan, ctx = {}) {
  const done = [], skipped = [];
  for (const step of plan) {
    const a = ACTIONS[step.id];
    if (!a) { skipped.push({ step, why: 'ação desconhecida' }); continue; }
    const p = normalizeParams(step.id, step.params);
    const sc = a.scoped ? step.scope || null : null;
    if (step.scope && !a.scoped) { skipped.push({ step, why: `"${a.name}" vale para o vídeo todo, não para um trecho` }); }
    const said = a.apply(spec, p, sc, ctx);
    if (said) done.push({ id: step.id, params: p, scope: sc, said, from: step.from || null });
    else skipped.push({ step, why: 'não se aplica agora' });
  }
  return { done, skipped };
}

// ordem de execução: estrutura e estilo primeiro (eles mudam a base), depois detalhes
const ORDER = ['estilo', 'ritmo', 'estrutura', 'velocidade', 'transicao', 'camera', 'cor', 'efeito', 'musica', 'audio', 'texto'];
export function orderPlan(plan) { return plan.map((s, i) => ({ s, i })).sort((x, y) => (ORDER.indexOf(ACTIONS[x.s.id].cat) - ORDER.indexOf(ACTIONS[y.s.id].cat)) || (x.i - y.i)).map(x => x.s); }
