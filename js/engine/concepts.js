// Entendimento por conceitos combináveis (PT, EN e misturado).
// Em vez de uma frase para cada resultado, a frase é quebrada em orações e cada oração vira
// ALVO (o que mexer) + DIREÇÃO (mais/menos, rápido/lento...) + INTENSIDADE (um pouco, muito) + TRECHO (começo, final, de X a Y).
// Isso gera ações do registro (actions.js). Combinações de conceitos cobrem milhares de jeitos de pedir a mesma coisa.
import { findRanges, findPoint } from './nlu.js';

// ---------- intensidade ----------
const STRONG = /\b(muito|bem|bastante|super|mega|hiper|extremamente|totalmente|demais|bem mais|much|very|really|super|extremely|way|a lot)\b/;
const WEAK = /\b(um pouco|um pouquinho|pouquinho|levemente|ligeiramente|leve|sutil|sutilmente|meio|a little|a bit|slightly|bit|kinda|somewhat|subtle)\b/;
export function intensityOf(s) { return STRONG.test(s) ? 1.6 : WEAK.test(s) ? 0.5 : 1; }

// ---------- trechos ----------
export function scopeOf(cl, ctx = {}, prevScope = null) {
  const num = cl.match(/\b(?:nos|os|nas|as|first|primeiros?|primeiras?)\s*(?:primeiros?|primeiras?|first)?\s*(\d+(?:[.,]\d+)?)\s*(s|seg|segundos?|seconds?|secs?)\b/);
  if (num && /\b(primeir|first)/.test(cl)) { const v = +num[1].replace(',', '.'); return { from: 0, to: v, label: `primeiros ${v} s` }; }
  const last = cl.match(/\b(?:ultimos?|ultimas?|last|finais)\s*(\d+(?:[.,]\d+)?)\s*(s|seg|segundos?|seconds?|secs?)\b/);
  if (last) { const v = +last[1].replace(',', '.'); return { from: -v, to: 0, label: `últimos ${v} s` }; }
  const rg = /\b(cortes|tomadas|takes|shots|cenas|planos) (de|of) \d/.test(cl) ? [] : findRanges(cl);
  if (rg.length) return { from: rg[0].from, to: rg[0].to };
  if (/\b(o resto|resto do video|the rest|rest of (it|the video)|depois disso|no resto)\b/.test(cl) && prevScope && typeof prevScope.to === 'number' && prevScope.to > 0) return { from: prevScope.to, to: 'end', label: 'resto do vídeo' };
  if (/\b(no comeco|do comeco|o comeco|no inicio|do inicio|o inicio|na abertura|a abertura|comecinho|beginning|the start|opening|intro|introducao)\b/.test(cl)) return { from: 0, to: 4, label: 'começo' };
  if (/\b(no final|do final|o final|no fim|do fim|o fim|finalzinho|ending|the end|encerramento|outro)\b/.test(cl)) return { from: -5, to: 0, label: 'final' };
  if (/\b(no meio|do meio|o meio|na metade|middle)\b/.test(cl)) return { from: 'mid', to: 'mid', label: 'meio' };
  if (/\b(aqui|agora|nesse ponto|neste ponto|here|right here)\b/.test(cl) && ctx.t != null) return { from: Math.max(0, ctx.t - 0.2), to: ctx.t + 2, label: 'aqui', point: ctx.t };
  if (/\b(momento (mais )?(importante|forte|marcante|principal|alto)|melhor momento|climax|best moment|important moment|key moment|highlight|pico)\b/.test(cl) && ctx.plan) {
    const hi = highlightOf(ctx.plan); if (hi) return { from: hi.from, to: hi.to, label: 'momento mais forte' };
  }
  const pt = findPoint(cl); if (pt != null && /\b(em|no|aos|at|a partir)\b/.test(cl)) return { from: pt, to: pt + 2, point: pt };
  return null;
}
// momento mais forte: o corte com mais energia de som/movimento (sinais reais da análise)
export function highlightOf(plan) {
  let best = null, bs = -1;
  for (const c of plan.clips || []) { const sc = (c.score != null ? c.score : 0) + (c.energy || 0) + (c.motion || 0) * 0.5; if (sc > bs && c.dur > 0.4) { bs = sc; best = c; } }
  if (!best) { const c = (plan.clips || [])[Math.floor((plan.clips || []).length * 0.6)]; best = c; }
  return best ? { from: best.start, to: best.start + Math.min(best.dur, 3) } : null;
}

// ---------- alvos e direções ----------
const T = {
  cuts: /\b(cortes?|corta|ritmo|edicao|montagem|pacing|cuts?|edit(ing)?|cortezinhos)\b/,
  speed: /\b(velocidade|acelera\w*|desacelera\w*|playback|speed|camera lenta|slow ?mo(tion)?|time ?lapse|\d(\.\d)?x)\b/,
  music: /\b(musica|musicas|trilha|som de fundo|music|song|soundtrack|beat|instrumental)\b/,
  voice: /\b(voz|fala|minha voz|dialogo|narracao|voice|vocal|speech|dialogue)\b/,
  caption: /\b(legenda|legendas|caption|captions|subtitles?)\b/,
  transition: /\b(transic\w*|transitions?)\b/,
  zoom: /\b(zoom|zooms|aproxima\w*|close)\b/,
  movement: /\b(movimento|dinamismo|energia visual|movement|motion|dynamic)\b/,
  color: /\b(cor|cores|colorido|color|colors|colour|grading|imagem|foto(grafia)?)\b/,
  sound: /\b(som|audio|sound|mixagem|mix)\b/,
  sfx: /\b(efeitos? sonoros?|sound effects?|sfx|barulhinhos?)\b/,
  style: /\b(estilo|style|edicao|vibe|pegada|jeito)\b/,
  video: /\b(video|videos|clip|clipe|reel|reels|tiktok|short)\b/,
};
const FASTER = /\b(mais rapid[oa]s?|rapid[oa]s?|faster|quicker|fast|acelera\w*|dinamic[oa]s?|agil|frenetic[oa]|quick)\b/;
const SLOWER = /\b(mais lent[oa]s?|lent[oa]s?|devagar|slower|slow|calm[oa]s?|tranquil[oa]|desacelera\w*|respira\w*|com mais calma)\b/;
const LOUDER = /\b(mais alt[oa]|alt[oa]|aumenta\w*|sobe|suba|louder|turn up|raise|mais forte|boost)\b/;
const QUIETER = /\b(mais baix[oa]|baix[oa]|abaixa\w*|diminui\w*|desce|lower|quieter|turn down|reduce|mais fraca)\b/;
const MORE = /\b(mais|more|extra|aumenta\w*|mais forte)\b/;
const LESS = /\b(menos|less|fewer|tira um pouco|diminui\w*|reduz\w*)\b/;
const NEG = /\b(sem|tira|tire|remove|remova|nada de|without|chega de|para de|para com|no more|get rid of|turn off|desliga)\b/;

// ---------- conceitos de alto nível (pedidos "de diretor") ----------
// cada um vira um conjunto de ações; servem para frases como "deixa o começo mais interessante"
const HIGH = [
  { re: /\b(mais interessante|more interesting|more engaging|mais envolvente|engaging|mais atraente|prender (a )?atencao|segura (a )?atencao|que prenda|hook|gancho)\b/, scopeDefault: { from: 0, to: 4, label: 'começo' },
    build: (k, sc) => [{ id: 'HOOK_OPENING', params: { seconds: sc && typeof sc.to === 'number' && sc.from === 0 ? sc.to : 3 } }, { id: 'SET_CUT_PACING', params: { factor: 0.7 }, scope: sc || { from: 0, to: 4, label: 'começo' } }, { id: 'ADD_SFX', params: { kind: 'whoosh', at: 0.05 } }] },
  { re: /\b(mais movimento|add more movement|more movement|mais dinamismo|mais vida na imagem|imagem mais viva|movimenta mais|more motion)\b/,
    build: k => [{ id: 'PUNCH_ZOOM', params: { amount: 0.6 * k } }, { id: 'SLOW_PUSH', params: { amount: 0.8 * k } }, { id: 'BEAT_PULSE', params: { amount: 0.5 * k } }] },
  { re: /\b(partes chatas|parte chata|trechos chatos|boring( parts)?|tempo morto|enrolacao|encheca[oa] de linguica|dead ?(air|space)|lerdeza)\b/,
    build: () => [{ id: 'REMOVE_SILENCE', params: { on: true, aggressive: true } }, { id: 'KEEP_HIGHLIGHTS', params: { share: 0.75 } }], needVerbNeg: true },
  { owns: false, re: /\b(momentos importantes|melhores momentos|best (moments|parts)|important (moments|parts)|so o que importa|highlights)\b/, onlyKeep: true,
    build: () => [{ id: 'KEEP_HIGHLIGHTS', params: { share: 0.6 } }] },
  { owns: false, re: /\b(musica mais (forte|poderosa|potente|impactante|presente|epica)|more powerful music|music more powerful|musica com mais (forca|presenca|impacto)|powerful music)\b/,
    build: k => [{ id: 'MUSIC_POWER', params: { amount: k } }] },
  { owns: false, re: /\b(menos agressiv\w*|mais suave|mais leve|mais sutil|less aggressive|tone it down|mais discreto|menos exagerad\w*|menos intens\w*|less intense|calmer)\b/, needStyleOrAlone: true,
    build: k => [{ id: 'INTENSITY', params: { factor: k > 1 ? 0.5 : k < 1 ? 0.85 : 0.65 } }] },
  { owns: false, re: /\b(mais agressiv\w*|mais intens\w*|mais explosiv\w*|more aggressive|more intense|turn it up|mais impacto|mais pesado|mais exagerado|mais hype)\b/,
    build: k => [{ id: 'INTENSITY', params: { factor: k > 1 ? 1.6 : 1.35 } }] },
  { re: /\b(ruido|chiado|barulho de fundo|background noise|noise|hiss|zumbido|vento)\b/, needVerbNeg: true,
    build: k => [{ id: 'NOISE_REDUCTION', params: { amount: Math.min(1, 0.7 * k) } }] },
  { re: /\b(voz mais clara|voz (mais )?limpa|clearer voice|voice clearer|voz mais nitida|melhora (a|minha) voz|voz abafada|voice clarity|enhance (my )?voice|dialogue enhancement)\b/,
    build: k => [{ id: 'VOICE_CLARITY', params: { amount: Math.min(1, 0.7 * k) } }] },
  { re: /\b(abaixa (a )?musica quando (eu )?fal\w*|lower the music when (i|someone) (speak|talk)s?|ducking|musica abaixa(ndo)? na fala|musica (por )?baixo da (minha )?voz)\b/,
    build: k => [{ id: 'DUCKING', params: { db: -16 * Math.max(1, k) } }] },
  { re: /\b(fade out|fade-out|gradual (music )?fade|music fade|fade gradual|sumir aos poucos|some aos poucos|terminar suave|termina suave|saida suave|fade naturally|desaparecer devagar|sumindo devagar)\b/,
    build: k => [{ id: 'MUSIC_FADE', params: { fadeIn: 0.5, fadeOut: 3 * k } }] },
  { re: /\b(fade (dramatico|dramatic)|dramatic fade|escurecer no fim|escurece no final|fade to black|fade pro preto)\b/,
    build: () => [{ id: 'ENDING_FADE', params: { seconds: 2 } }, { id: 'STRONG_ENDING', params: { mood: 'dramatic', seconds: 5 } }] },
  { re: /\b(efeitos? sonoros? nas transic\w*|sound effects? (on|to) (the )?transitions?|som nas transic\w*|whoosh nas transic\w*)\b/,
    build: () => [{ id: 'TRANSITION_SFX', params: { on: true } }] },
  { re: /\b(transic\w* mais suaves?|smoother transitions?|transitions? smoother|transic\w* suaves?|smooth transitions?|transic\w* mais leves?)\b/,
    build: k => [{ id: 'SMOOTHER_TRANSITIONS', params: { amount: k } }] },
  { re: /\b(transic\w* (mais )?(rapidas|fortes|impactantes|agressivas)|snappier transitions?|punchy transitions?)\b/,
    build: k => [{ id: 'SNAPPIER_TRANSITIONS', params: { amount: k } }] },
  { owns: false, re: /\b(zooms? de vez em quando|occasional zooms?|alguns zooms|uns zooms|zoom as vezes|zooms? ocasiona\w*)\b/,
    build: () => [{ id: 'PUNCH_ZOOM', params: { amount: 0.35 } }] },
  { owns: false, re: /\b(melhora (as )?cores|improve (the )?colou?rs?|cores melhores|arruma (a|as) cor(es)?|corrige (a|as) cor(es)?|colou?r correction|correcao de cor)\b/,
    build: () => [{ id: 'CONTRAST', params: { factor: 1.08 } }, { id: 'SATURATION', params: { factor: 1.12 } }, { id: 'SHADOWS_HIGHLIGHTS', params: { shadows: 0.15, highlights: -0.15 } }] },
  { owns: false, re: /\b(legendas? animadas?|animated captions?|dynamic captions?|legenda dinamica)\b/,
    build: () => [{ id: 'CAPTION_STYLE', params: { style: 'dinamico' } }] },
  { re: /\b(final (forte|marcante|impactante|poderoso)|strong ending|finish strong|termina(r)? forte|ending (strong|powerful)|fechar com chave de ouro)\b/,
    build: () => [{ id: 'STRONG_ENDING', params: { mood: 'epic', seconds: 5 } }, { id: 'ADD_SFX', params: { kind: 'boom', at: -1 } }] },
  { owns: false, re: /\b(jump ?cuts?|corte seco na fala|cortes secos na fala)\b/,
    build: () => [{ id: 'REMOVE_SILENCE', params: { on: true, aggressive: true } }, { id: 'PUNCH_ZOOM', params: { amount: 0.55 } }] },
  { owns: false, re: /\b(smash ?cuts?)\b/, build: () => [{ id: 'SET_TRANSITION_STYLE', params: { type: 'cut' } }, { id: 'SFX_DENSITY', params: { amount: 0.6 } }] },
  { re: /\b(camera na mao|handheld|camera tremida leve|balanco de camera)\b/, build: k => [{ id: 'HANDHELD', params: { amount: 0.5 * k } }] },
  { owns: false, re: /\b(ken burns|zoom lento|slow (zoom|push)|dolly|empurrao lento|aproxima(cao|ndo) devagar)\b/, build: k => [{ id: 'SLOW_PUSH', params: { amount: k } }] },
  { owns: false, re: /\b(rampa de velocidade|speed ramps?|ramp de velocidade)\b/, build: () => [{ id: 'SPEED_RAMP', params: { on: true } }] },
  { owns: false, re: /\b(musica que combin\w*|music that (fits|matches)|matching music|musica (adequada|certa|ideal)|escolhe (uma|a) musica|add music|poe (uma )?musica|coloca (uma )?musica|bota (uma )?musica)\b/,
    build: () => [{ id: 'MUSIC_AUTO', params: {} }] },
  { owns: false, re: /\b(compress\w*|volume (mais )?constante|nivela(r)? (o )?volume)\b/, build: k => [{ id: 'COMPRESSION', params: { amount: Math.min(1, 0.6 * k) } }] },
  { re: /\b(cartela final|end card|tela final|siga para mais no final)\b/, build: () => [{ id: 'END_CARD', params: {} }] },
  { re: /\b(do mesmo jeito|igual|like|same as|como)\b.{0,20}\b(comeco|inicio|beginning|start)\b/, onlyIf: /\b(final|fim|ending|end)\b.{0,30}\b(igual|como|like|same)\b|\b(igual|like|same)\b.{0,30}\b(comeco|beginning)\b/,
    build: () => [{ id: 'COPY_SECTION', params: { fromKey: 'start', toKey: 'end' } }] },
];

// efeitos visuais por nome
const FX_WORDS = [
  ['vhs', /\b(vhs|fita antiga|videocassete|vintage tape|retro tape|camcorder)\b/], ['glitch', /\b(glitch|falha digital|bug na imagem)\b/],
  ['chroma', /\b(aberracao cromatica|chromatic aberration|rgb split|separacao de cor)\b/], ['lens', /\b(distorcao de lente|lens distortion|olho de peixe|fisheye|barrel)\b/],
  ['bloom', /\b(bloom|glow|brilho (suave|nos claros)|brilhando|halation)\b/], ['grain', /\b(grao|granulado|film grain|grain|textura de filme)\b/],
  ['vignette', /\b(vinheta|vignette|bordas escuras|cantos escuros)\b/], ['blur', /\b(desfoque|desfocad\w*|borrad\w*|blur|blurry)\b/],
  ['sharpen', /\b(nitidez|mais nitid\w*|sharpen|sharper|mais definid\w*)\b/], ['leak', /\b(light leaks?|vazamentos? de luz|luz vazando)\b/],
  ['letterbox', /\b(faixas? (pretas|de cinema)|letterbox|barras de cinema|tarjas pretas)\b/],
];
const LOOK_WORDS = [
  ['hollywood', /\b(teal (and|&|e) orange|tealorange|azul e laranja|hollywood)\b/], ['warmfilm', /\b(quente|warm|aconchegante|golden|dourad\w*|por do sol)\b/],
  ['coolcine', /\b(fri[oa]|cold|cool|azulad\w*|gelad\w*)\b/], ['vintage', /\b(vintage|retro|antig[oa]|anos 70|anos 80|filme antigo|old film)\b/],
  ['moody', /\b(moody|sombri[oa]|escur[oa] e dramatic\w*|melancolic\w*|dark)\b/], ['bright', /\b(clar[oa] e alegre|lifestyle|bright|ensolarad\w*|luminos[oa])\b/],
  ['vibrant', /\b(vibrante|vibrant|cores vivas|vivid|saturad[oa])\b/], ['punchy', /\b(alto contraste|high contrast|contrastad\w*)\b/],
  ['faded', /\b(baixo contraste|low contrast|lavad[oa]|faded|matte|fosc[oa])\b/], ['desat', /\b(dessaturad\w*|desaturated|pouca cor|cores apagadas)\b/],
  ['natural', /\b(natural|cor real|fiel|sem filtro|documental)\b/], ['commercial', /\b(comercial|publicidade|premium|clean look)\b/],
  ['bw', /\b(preto e branco|pretoebranco|p ?& ?b|black (and|&) white|monocromatic\w*|grayscale)\b/], ['epic', /\b(look epico|cor epica|trailer look)\b/],
  ['cinematic', /\b(cinematic\w*|cinematografic\w*|de cinema|filmic|cara de filme)\b/],
];
const PROFILE_WORDS = [
  ['youtube', /\b(youtube profissional|professional youtube|estilo (de |do )?youtube|youtuber profissional|youtube (editing )?style|youtube video|video (de|do) youtube)\b/],
  ['mrbeast', /\b(mr ?beast|mrbeast|frenetic\w*|super rapido|hiper acelerado)\b/],
  ['documentary', /\b(documentari\w*|documentary|docu)\b/], ['trailer', /\b(trailer)\b/], ['cinematic', /\b(cinematic\w*|cinematografic\w*|filme)\b/],
  ['luxury', /\b(luxo|luxury|sofisticad\w*|elegante|premium)\b/], ['sports', /\b(esporte|esportivo|sports?|highlights esportivos)\b/],
  ['podcast', /\b(podcast)\b/], ['interview', /\b(entrevista|interview)\b/], ['vlog', /\b(vlog)\b/], ['action', /\b(acao|action)\b/],
  ['emotional', /\b(emocional|emocionante|emotional storytelling|historia emocionante)\b/], ['motivational', /\b(motivacion\w*|motivational|inspirad\w*|inspirational)\b/],
  ['corporate', /\b(corporativ\w*|empresa|institucional|corporate)\b/], ['product', /\b(anuncio de produto|product (ad|advertisement)|propaganda de produto)\b/],
  ['wedding', /\b(casamento|wedding)\b/], ['event', /\b(evento|event recap|resumo do evento)\b/], ['bts', /\b(bastidores|behind the scenes|bts)\b/],
  ['fashion', /\b(moda|fashion)\b/], ['food', /\b(comida|food|receita|gastronomi\w*)\b/], ['gaming', /\b(gaming|game|gamer|jogo)\b/],
  ['news', /\b(reportagem|noticia|news report|jornalistic\w*)\b/], ['education', /\b(educativ\w*|educacional|educational|aula|tutorial)\b/],
  ['travel', /\b(viagem|travel)\b/], ['musicvideo', /\b(videoclipe|music video|clipe musical)\b/],
];
const MOOD_WORDS = [
  ['epic', /\b(epic[oa]|epic|orquestral|orchestral|grandios[oa])\b/], ['dramatic', /\b(dramatic[oa]|dramatic|suspense|tens[ao]|tense|sombria)\b/],
  ['emotional', /\b(emocion\w*|emotional|triste|sad|tocante|sentimental)\b/], ['upbeat', /\b(animad[oa]|energetic[oa]|energetic|alegre|upbeat|happy|pra cima|feliz|hip ?hop|pop|agitad[oa])\b/],
  ['electronic', /\b(eletronic[oa]|electronic|edm|techno|house|synth)\b/], ['atmospheric', /\b(calm[oa]|relaxante|relaxing|ambient|lofi|lo-fi|tranquil[oa]|chill|suave)\b/],
  ['reflective', /\b(reflexiv[oa]|inspirador\w*|inspirational|acustic[oa]|acoustic|documentari\w*|corporate)\b/],
];
const SFX_WORDS = [['clap', /\b((?:palma|palmas)|(?:aplauso|aplausos)|(?:clap|claps)|bater (?:palma|palmas)|batendo (?:palma|palmas))\b/], ['sinos', /\b((?:sino|sinos) de natal|(?:sininho|sininhos) de natal|jingle (?:bell|bells)|(?:guizo|guizos)|sleigh (?:bell|bells)|som de natal|sinos natalinos)\b/],
  ['rasgo', /\b(som de (papel )?rasgando|papel rasgando|rasgad[oa]|paper (tear|rip)|ripping|rasgo)\b/], ['boom', /\b(boom|bum|explosao|cinematic boom|estrondo)\b/], ['whoosh', /\b(whoosh|vush|swoosh)\b/], ['riser', /\b(riser|subida|tensao subindo)\b/],
  ['impact', /\b(impacto|impact|hit|pancada|batida forte)\b/], ['pop', /\b(pop|ploc)\b/], ['click', /\b(clique|click)\b/], ['ding', /\b(ding|sino|sininho|plim)\b/],
  ['camera', /\b(som de camera|camera shutter|obturador|foto tirada)\b/], ['notify', /\b(notificac\w*|notification|alerta)\b/], ['drop', /\b(drop|queda)\b/],
  ['swish', /\b(swish|fsss)\b/], ['tension', /\b(suspense|tensao|tension|drone)\b/], ['glitch', /\b(som de glitch|glitch sound)\b/]];
const TRANS_WORDS = [['fan', /\b(ventilador|fan|helice|pas girando)\b/], ['rasgo', /\b(rasg\w*|papel rasgado|papel de presente|presente|embrulho|wrapping( paper)?|paper (tear|rip)|tear|rip)\b/], ['dissolve', /\b(fusao|dissolv\w*|cross ?dissolve|crossfade|fade)\b/], ['whip', /\b(chicote|whip)\b/], ['zoom', /\b(zoom)\b/], ['blur', /\b(desfoque|blur)\b/],
  ['spin', /\b(giro|girando|spin|rotac\w*)\b/], ['glitch', /\b(glitch)\b/], ['burn', /\b(queima de filme|film burn|burn)\b/], ['flash', /\b(flash|clarao)\b/],
  ['slide', /\b(slide|empurr\w*|deslizar|push)\b/], ['mask', /\b(mascara|mask|circulo|iris)\b/], ['dip', /\b(mergulho|preto|dip to black)\b/], ['cut', /\b(corte seco|hard cut|sem transic\w*)\b/]];

const has = (re, s) => re.test(s);
const findIn = (list, s) => { const f = list.find(([, re]) => re.test(s)); return f ? f[0] : null; };

// separa em orações, sem quebrar o texto entre aspas nem intervalos "de 0:10 a 0:20"
const SCOPE_WORDS = /^(?:(?:o |a |os |as |no |na |nos |nas |do |da |the |in the |at the )?(?:resto|rest|comeco|inicio|final|fim|meio|ending|beginning|start|end|middle|primeir\w*|ultim\w*|first|last)\b|(?:\w+ ){0,5}(?:no|na|nos|nas|in the|at the|os|the) (?:comeco|inicio|final|fim|meio|beginning|end|ending|middle|primeir\w*|ultim\w*|first|last)\b)/;
export function splitClauses(s) {
  // expressões com "e" que não são duas ordens
  s = s.replace(/\bpreto e branco\b/g, 'pretoebranco').replace(/\bblack and white\b/g, 'pretoebranco').replace(/\bteal (and|e|&) orange\b/g, 'tealorange').replace(/\bazul e laranja\b/g, 'tealorange').replace(/\brock (and|e|n) roll\b/g, 'rocknroll');
  const first = splitBasic(s); const out = [];
  for (const cl of first) {
    const parts = cl.split(/\s(?:e|and|mas|but)\s/); let cur = parts[0];
    for (let i = 1; i < parts.length; i++) { if (SCOPE_WORDS.test(parts[i])) { out.push(cur); cur = parts[i]; } else cur += ' e ' + parts[i]; }
    out.push(cur);
  }
  return out.map(x => x.trim()).filter(x => x.length > 1);
}
function splitBasic(s) {
  return s.split(/\s*(?:(?<!\d),|,(?!\d)|;|\s(?:e depois|depois|e tambem|tambem|alem disso|and then|then|plus)\s|\s(?:e|and)\s(?=(?:coloca|poe|bota|adiciona|tira|deixa|faz|faca|usa|use|muda|troca|sincroniza|aumenta|abaixa|diminui|sobe|remove|add|make|use|put|remove|lower|raise|sync|finish|end|termina|terminar|finaliza|acelera|melhora|improve|keep|mantem)\b))\s*/).map(x => x.trim()).filter(x => x.length > 1);
}

// Uma oração → ações. ctx: { plan, t, last (última ação feita) }
export function parseClause(cl, ctx = {}, prevScope = null) {
  const out = []; const k = intensityOf(cl);
  const sc = scopeOf(cl, ctx, prevScope);
  const neg = has(NEG, cl);
  // pedidos de diretor (alto nível)
  for (const h of HIGH) {
    if (!h.re.test(cl)) continue;
    if (h.onlyIf && !h.onlyIf.test(cl)) continue;
    if (h.needVerbNeg && !/\b(tira|tire|remove|remova|corta|corte|elimina|limpa|sem|reduz|reduce|remove|cut|get rid|clean)\b/.test(cl)) continue;
    if (h.onlyKeep && !/\b(mantem|mantenha|deixa so|so os|keep|only)\b/.test(cl)) continue;
    out.push(...h.build(k, sc || h.scopeDefault || null).map(a => ({ ...a, own: h.owns !== false, scope: a.scope !== undefined ? a.scope : (sc && !a.params.at ? sc : undefined) })));
  }
  // velocidade explícita (vídeo acelerado / câmera lenta), num trecho ou geral
  const nx = cl.match(/\b(\d(?:[.,]\d+)?)\s*x\b/);
  if (/\b(camera lenta|slow ?mo(tion)?|super slow)\b/.test(cl) && !neg && sc && !/\d+ ?%/.test(cl)) out.push({ id: 'PLAYBACK_SPEED', params: { speed: /\b(super|bem|muito|extrema)\w*\s*(slow|camera lenta|lent)|super slow/.test(cl) ? 0.3 : 0.5 }, scope: sc || null, needScope: true });
  else if (/\b(acelera\w*|speed up|time ?lapse|fast forward)\b/.test(cl) && sc && !T.cuts.test(cl)) out.push({ id: 'PLAYBACK_SPEED', params: { speed: nx ? +nx[1].replace(',', '.') : (k > 1 ? 3 : 2) }, scope: sc });
  else if (nx && sc) out.push({ id: 'PLAYBACK_SPEED', params: { speed: +nx[1].replace(',', '.') }, scope: sc });
  // ritmo num trecho ("os primeiros 10 segundos rápidos e o resto mais lento")
  if (sc && !out.some(a => a.id === 'PLAYBACK_SPEED' || a.id === 'HOOK_OPENING') && (has(FASTER, cl) || has(SLOWER, cl)) && !T.music.test(cl) && !T.voice.test(cl))
    out.push({ id: 'SET_CUT_PACING', params: { factor: has(FASTER, cl) ? 0.7 : 1.5 }, scope: sc });
  // efeitos visuais e cor (com ou sem trecho)
  const fx = findIn(FX_WORDS, cl);
  if (fx) out.push({ id: 'FX', params: { kind: fx, amount: neg && !/\bsem (o |a )?(fundo|cortar)/.test(cl) ? 0 : Math.min(1.5, 0.6 * k) }, scope: sc || undefined });
  const look = findIn(LOOK_WORDS, cl);
  if (look && (T.color.test(cl) || /\b(look|filtro|filter|tom|tons|grading|lut)\b/.test(cl) || look === 'bw' || look === 'hollywood')) {
    if (look === 'bw') out.push({ id: 'SATURATION', params: { factor: 0 }, scope: sc || undefined });
    else out.push({ id: 'COLOR_LOOK', params: { look: look === 'cinematic' ? 'hollywood' : look }, scope: sc || undefined });
  }
  // música: volume, clima, entrada
  if (T.music.test(cl)) {
    const mood = findIn(MOOD_WORDS, cl);
    if (mood && !/\b(volume)\b/.test(cl)) out.push({ id: 'MUSIC_MOOD', params: { mood } });
    if (/\b(anterior|de antes|previous|que estava|da outra versao)\b/.test(cl)) out.push({ id: 'MUSIC_PREVIOUS', params: {} });
  }
  // efeito sonoro num ponto ("um boom no começo")
  const sfx = findIn(SFX_WORDS, cl);
  const sfxRe = (SFX_WORDS.find(x => x[0] === sfx) || [])[1];
  const single = sfxRe && new RegExp('\\b(um|uma|a|an|one|o)\\s+(\\w+\\s+){0,2}(' + sfxRe.source.replace(/^\\b\(|\)\\b$/g, '') + ')').test(cl);
  // confete ("boom clap"): estoura no momento pedido, com palmas; sem momento, no final
  const confetti = /\b((?:confete|confetes)|confetti|chuva de (papel|papeizinhos|papel picado)|papel picado|boom clap|canhao de confete)\b/.test(cl);
  if (confetti) {
    const at = sc ? (sc.point != null ? sc.point : sc.from === 'mid' ? -0.5 : sc.from < 0 ? -2.8 : sc.from) : -2.8;
    out.push({ id: 'CONFETTI', own: true, params: neg && !/\b(com|with)\b/.test(cl) ? { on: false } : { at, on: true }, scope: null });
  }
  const clNoTime = cl.replace(/\b\d+:\d+\b|\b\d+(\.\d+)?\s*(s|seg\w*|segundos?|seconds?|secs?)\b/g, ' ');   // horário não é quantidade
  if (sfx && !(confetti && sfx === 'clap') && (single || (sc && sc.label)) && !/\b(sem|nos|nas|todos|todas|varios|uns|umas|\d+)\b/.test(clNoTime) && !T.transition.test(cl)) {
    const at = sc ? (sc.point != null ? sc.point : sc.from === 'mid' ? -0.5 : sc.from < 0 ? -1 : sc.from) : 0;
    out.push({ id: 'ADD_SFX', own: true, params: { kind: sfx, at } });
  }
  // transição por nome ("transições de giro")
  if (T.transition.test(cl) && !out.some(a => /TRANSITION/.test(a.id))) {
    const tr = findIn(TRANS_WORDS, cl);
    if (tr && !/\b(suave|smooth)/.test(cl)) out.push({ id: 'SET_TRANSITION_STYLE', own: true, params: { type: tr, share: 0.6, dur: tr === 'dissolve' || tr === 'dip' || tr === 'burn' ? 0.5 : tr === 'rasgo' ? 0.55 : tr === 'fan' ? 0.4 : 0.25 } });
  }
  // perfil inteiro ("como um documentário profissional")
  const prof = findIn(PROFILE_WORDS, cl);
  if (prof && !sc && /\b(como|tipo|estilo|style|like|igual|parece|feel|pegada|vibe|de|um|uma|edita|deixa|make|give)\b/.test(cl) && !T.music.test(cl) && !look) out.push({ id: 'SET_PROFILE', params: { id: prof } });
  // alvo + direção sem trecho (vale para o vídeo todo)
  if (!sc) {
    const up = has(FASTER, cl), dn = has(SLOWER, cl), lo = has(LOUDER, cl), qu = has(QUIETER, cl), mo = has(MORE, cl), le = has(LESS, cl);
    const big = /\b(maior|maiores|bigger|larger|grande)\b/.test(cl), small = /\b(menor|menores|smaller|pequen\w*)\b/.test(cl);
    if (T.cuts.test(cl) && (up || dn) && !T.transition.test(cl)) out.push({ id: 'SET_CUT_PACING', params: { factor: up ? Math.pow(0.78, k) : Math.pow(1.35, k) } });
    if (T.music.test(cl) && (lo || qu) && !/\b(quando|when|enquanto|while)\b/.test(cl)) out.push({ id: 'MUSIC_VOLUME', params: { db: (lo ? 3 : -4) * k } });
    if (T.voice.test(cl) && (lo || qu) && !T.music.test(cl)) out.push({ id: 'VOICE_VOLUME', params: { db: (lo ? 3 : -3) * k } });
    if (T.caption.test(cl) && (big || small)) out.push({ id: 'CAPTION_SIZE', params: { factor: big ? 1 + 0.2 * k : 1 / (1 + 0.2 * k) } });
    if (T.transition.test(cl) && (up || dn) && !/\b(suave|smooth)/.test(cl)) out.push({ id: 'TRANSITION_DURATION', params: { factor: up ? 0.65 : 1.5 } });
    if (T.zoom.test(cl) && !/\b(lento|devagar|slow|lenta)\b/.test(cl) && (mo || le || neg)) out.push(neg && !mo ? { id: 'NO_ZOOM', params: {} } : { id: 'PUNCH_ZOOM', params: { amount: le ? 0.25 : Math.min(1.5, 0.75 * k) } });
    if (T.sfx.test(cl) && (mo || le) && !T.transition.test(cl)) out.push({ id: 'SFX_DENSITY', params: { amount: le ? 0.15 : Math.min(1, 0.55 * k) } });
    if (/\b(tremor|tremid\w*|shake|chacoalh\w*|terremoto)\b/.test(cl)) out.push({ id: 'CAMERA_SHAKE', params: { amount: neg ? 0 : Math.min(1.5, 0.6 * k) } });
    if (/\b(flashes|flash na batida|flashs|piscadas? de luz|strobe)\b/.test(cl) && !T.transition.test(cl)) out.push({ id: 'FLASH_ON_BEATS', params: { amount: Math.min(1, 0.6 * k) } });
    if (/\b(quente|warmer|mais quente|warm)\b/.test(cl) && T.color.test(cl) || /\b(mais quente|warmer)\b/.test(cl)) out.push({ id: 'TEMPERATURE', params: { delta: 0.12 * k } });
    if (/\b(mais fri[oa]|cooler|colder)\b/.test(cl)) out.push({ id: 'TEMPERATURE', params: { delta: -0.12 * k } });
    if (T.color.test(cl) && /\b(mais clar[oa]|brighter|mais luz)\b/.test(cl)) out.push({ id: 'EXPOSURE', params: { delta: 0.25 * k } });
    if (T.color.test(cl) && /\b(mais escur[oa]|darker)\b/.test(cl)) out.push({ id: 'EXPOSURE', params: { delta: -0.25 * k } });
  }
  return { actions: out, scope: sc };
}

// referência a algo anterior: "isso", "esse efeito", "a mesma coisa", "o anterior"
export function refersBack(s) { return /\b(isso|esse|essa|este|esta|aquilo|aquele|aquela|it|that|this|the same|o mesmo|a mesma|igual|anterior|previous|de novo|again)\b/.test(s); }
// correção: "na verdade", "actually", "não, ..."
export function isCorrection(s) { return /^\s*(na verdade|actually|nao,|nao\s+nao|melhor|alias|quer dizer|i mean|no,|wait|pensando bem|ops|errei)\b/.test(s); }
// pedido de uma coisa SÓ (sem alvo): "um pouco mais rápido", "mais lento", "mais alto"
export function bareModifier(s) {
  const noTarget = !Object.values(T).some(re => re.test(s));
  if (!noTarget) return null;
  if (has(FASTER, s)) return 'faster'; if (has(SLOWER, s)) return 'slower';
  if (has(LOUDER, s)) return 'louder'; if (has(QUIETER, s)) return 'quieter';
  if (/\b(maior|bigger|larger)\b/.test(s)) return 'bigger'; if (/\b(menor|smaller)\b/.test(s)) return 'smaller';
  if (has(MORE, s)) return 'more'; if (has(LESS, s)) return 'less';
  return null;
}
// aplica um modificador sem alvo à última ação feita ("um pouco mais rápido" depois de mexer nos cortes)
export function modifierOnLast(mod, last, k = 1) {
  if (!last) return null;
  const f = (up, dn) => (mod === 'faster' || mod === 'louder' || mod === 'bigger' || mod === 'more') ? up : dn;
  const m = 1 + 0.25 * k;
  switch (last.id) {
    case 'SET_CUT_PACING': return { id: 'SET_CUT_PACING', params: { factor: (mod === 'faster' || mod === 'more') ? 1 / m : m }, scope: last.scope || undefined };
    case 'PLAYBACK_SPEED': return { id: 'PLAYBACK_SPEED', params: { speed: last.params.speed * f(m, 1 / m) }, scope: last.scope || undefined };
    case 'MUSIC_VOLUME': case 'MUSIC_POWER': return { id: 'MUSIC_VOLUME', params: { db: f(3, -3) * k } };
    case 'VOICE_VOLUME': return { id: 'VOICE_VOLUME', params: { db: f(3, -3) * k } };
    case 'CAPTION_SIZE': return { id: 'CAPTION_SIZE', params: { factor: f(m, 1 / m) } };
    case 'PUNCH_ZOOM': return { id: 'PUNCH_ZOOM', params: { amount: last.params.amount * f(m, 1 / m) } };
    case 'SLOW_PUSH': return { id: 'SLOW_PUSH', params: { amount: last.params.amount * f(m, 1 / m) }, scope: last.scope || undefined };
    case 'FX': return { id: 'FX', params: { kind: last.params.kind, amount: last.params.amount * f(m, 1 / m) }, scope: last.scope || undefined };
    case 'INTENSITY': return { id: 'INTENSITY', params: { factor: f(m, 1 / m) } };
    case 'TRANSITION_DURATION': case 'SMOOTHER_TRANSITIONS': case 'SET_TRANSITION_STYLE': return (mod === 'faster' || mod === 'slower') ? { id: 'TRANSITION_DURATION', params: { factor: mod === 'faster' ? 0.7 : 1.4 } } : null;
    case 'EXPOSURE': return { id: 'EXPOSURE', params: { delta: f(0.2, -0.2) * k } };
    case 'SATURATION': return { id: 'SATURATION', params: { factor: f(1.15, 0.85) } };
    case 'CONTRAST': return { id: 'CONTRAST', params: { factor: f(1.1, 0.9) } };
    case 'TEMPERATURE': return { id: 'TEMPERATURE', params: { delta: last.params.delta > 0 ? f(0.08, -0.08) : f(-0.08, 0.08) } };
    case 'CAMERA_SHAKE': return { id: 'CAMERA_SHAKE', params: { amount: last.params.amount * f(m, 1 / m) }, scope: last.scope || undefined };
    case 'SFX_DENSITY': return { id: 'SFX_DENSITY', params: { amount: Math.min(1, last.params.amount * f(m, 1 / m)) } };
    default: return null;
  }
}

// tamanho do vocabulário de verdade (combinações que o analisador entende), para o painel de diagnóstico
export function vocabularyStats() {
  const count = re => { const src = re.source; const alts = src.split('|').length; return alts; };
  const lists = { alto_nivel: HIGH.map(h => h.re), efeitos: FX_WORDS.map(x => x[1]), looks: LOOK_WORDS.map(x => x[1]), perfis: PROFILE_WORDS.map(x => x[1]), climas: MOOD_WORDS.map(x => x[1]), sons: SFX_WORDS.map(x => x[1]), transicoes: TRANS_WORDS.map(x => x[1]), alvos: Object.values(T) };
  const per = {}; let terms = 0;
  for (const [k, arr] of Object.entries(lists)) { const n = arr.reduce((a, re) => a + count(re), 0); per[k] = n; terms += n; }
  const dirs = [FASTER, SLOWER, LOUDER, QUIETER, MORE, LESS].reduce((a, re) => a + count(re), 0);
  const scopes = 9, intens = count(STRONG) + count(WEAK) + 1;
  // combinações: (alvos × direções × intensidades × trechos) + conceitos de alto nível × intensidades × trechos
  const combos = per.alvos * dirs * intens * scopes + (per.alto_nivel + per.efeitos + per.looks) * intens * scopes + per.perfis * per.climas;
  return { termos: terms, direcoes: dirs, trechos: scopes, intensidades: intens, combinacoes: combos, por_grupo: per };
}
