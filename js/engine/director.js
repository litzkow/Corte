// O DIRETOR: transforma um pedido em português ou inglês numa especificação de edição estruturada.
// Não é um modelo de IA. São regras escritas à mão que entendem os pedidos mais comuns,
// dizem o que entenderam e avisam quando algo ficou de fora.
import { PRESETS, LOOKS, blendPresets } from './styles.js';
import { PLATFORMS } from './platforms.js';
import { deepClone, clamp } from './util.js';
import { canon, TOPIC_STYLE, findRanges, findPoint, suggest } from './nlu.js';
import { TEXT_STYLES } from './captions.js';

export function newSpec() {
  return {
    v: 1,
    mix: [{ id: 'social', w: 1 }],
    over: {},                 // parâmetros explícitos por cima do estilo
    outputs: [{ platform: 'reels', duration: null }],
    target: null,             // { seconds, exact }
    sections: [],             // [{ from, to, pace: 'fast'|'slow', mood }]  (negativos = contando do fim)
    hookSeconds: null,
    chronological: true,
    versions: 1,
    export: { resolution: '1080p', fps: 30 },
    captions: { enabled: true, style: null, highlight: true, uppercase: null, translate: null, bilingual: false },
    music: { use: 'auto', srcId: null, intensity: 0, mood: null, none: false },
    audio: { keepDialogue: true },
    sfxRequests: [],          // [{ kind, count }]
    texts: [],                // textos com forma pedidos
    title: null,
    ops: [],                  // operações de linha do tempo (remover transição em t etc.)
  };
}

// ---------- normalização ----------
const NUMW = { zero: 0, um: 1, uma: 1, one: 1, a: null, dois: 2, duas: 2, two: 2, tres: 3, three: 3, quatro: 4, four: 4, cinco: 5, five: 5, seis: 6, six: 6, sete: 7, seven: 7, oito: 8, eight: 8, nove: 9, nine: 9, dez: 10, ten: 10, quinze: 15, fifteen: 15, vinte: 20, twenty: 20, trinta: 30, thirty: 30, quarenta: 40, forty: 40, cinquenta: 50, fifty: 50, sessenta: 60, sixty: 60, noventa: 90, ninety: 90 };
export function norm(text) {
  let s = String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[“”«»]/g, '"').replace(/[’‘]/g, "'");
  s = s.replace(/(\d),(\d)/g, '$1.$2');
  s = s.replace(/\bum minuto e meio\b|\bone and a half minutes?\b|\ba minute and a half\b/g, '90 segundos');
  s = s.replace(/\bmeio minuto\b|\bhalf a minute\b/g, '30 segundos');
  s = s.replace(/\bminuto e meio\b/g, '90 segundos').replace(/\bmeio segundo\b|\bhalf a second\b/g, '0.5 segundo');
  s = s.replace(/\b(\d+) minutos? e meio\b/g, (_, n) => `${+n * 60 + 30} segundos`);
  s = s.replace(/\b(zero|um|uma|one|dois|duas|two|tres|three|quatro|four|cinco|five|seis|six|sete|seven|oito|eight|nove|nine|dez|ten|quinze|fifteen|vinte|twenty|trinta|thirty|quarenta|forty|cinquenta|fifty|sessenta|sixty|noventa|ninety)\b(?=\s*(-|\s)\s*([a-z]+\s+)?(h|hora|horas|hour|hours|min|minutos?|minutes?|s|seg|segundos?|sec|seconds?|versoes|versions|versao|version|impactos?|impacts?|aberturas|openings|alternative|whooshes?|cortes|cuts|transic|transit|explosoes|explosions|booms?|risers?)\b)/g, (m, w) => NUMW[w] != null ? String(NUMW[w]) : m);
  return s.replace(/\s+/g, ' ').trim();
}

const UNIT = '(h|hrs?|horas?|hours?|min|mins|minutos?|minutes?|s|seg|segs|segundos?|sec|secs|seconds?)';
const toSec = (n, u) => /^h/.test(u) ? n * 3600 : /^min/.test(u) ? n * 60 : n;

// ---------- vocabulário ----------
const STYLE_WORDS = [
  // formatos virais (receitas completas): ganham dos estilos genéricos quando aparecem
  ['montagemfrase', /\bmontagem com frase\b|\bfrase fixa\b|\b(reels?|montagem|edit) (de|com) funk\b|\bestilo funk\b/],
  ['letra', /\bclipe de letra\b|\blyrics? (video|edit)\b|\bletra (pequena|no meio|no centro)\b|\bfrase por corte\b|\bestetica com letra\b/],
  ['memes', /\b(comentario|video|edit|estilo) (com|de) memes?\b|\bcom memes\b|\bmeme edit\b/],
  ['dividida', /\btela dividida\b|\bsplit ?screen\b|\bdividid[oa] (em|no) (dois|duas|meio)\b/],
  ['historia', /\bhistoria (cinematografica|narrada)\b|\bstorytelling\b|\bnarrativa cinematografica\b/],
  ['susto', /\b(conversa|video|stream|live) com sustos?\b|\bestilo (stream|streamer)\b|\bclipe de (stream|live)\b/],
  ['phonk', /\bphonk\b|\blance com batida\b|\b(edit|edicao) de (futebol|lance|esporte)\b|\bvelocity edit\b/],
  ['vlogpiada', /\bvlog (narrado|com piada|de humor|engracado)\b/],
  ['retro', /\bretrospectiva( do (meu )?ano)?\b|\byear in review\b|\b(resumo|recap) do (meu )?ano\b|\bnao fiz nada (esse|este|nesse|neste) ano\b|\bhaven'?t done much\b|\bmes a mes\b|\bum mes (por|em cada) corte\b|\bmeses do ano\b/],
  ['cartaosd', /\bcartao (sd|de memoria)\b|\bsd ?card\b|\blately on my\b|\bultimamente no (meu )?cartao\b/],
  ['trailer', /\btrailer\b|\bteaser\b/],
  ['action', /\bacao\b|\baction\b|\bhollywood\b|\bexplosiv|\badrenalina\b|\bblockbuster\b/],
  ['cinematic', /\bcinematografic|\bcinematic\b|\bcinema\b|\bfilme\b(?! de viagem)|\bfilmic\b|\bvisualmente bonit|\bvisually beautiful\b/],
  ['documentary', /\bdocumentari|\bdocumentary\b|\bdoc\b/],
  ['energetic', /\bmr\.? ?beast\b|\byoutuber\b|\bretencao\b|\bretention\b|\benergetic|\benergetico\b/],
  ['social', /\bredes? sociais?\b|\bsocial media\b|\bviral\b|\btiktok style\b|\bacelerad|\bfast[- ]paced\b|\bdinamic|\bdynamic\b/],
  ['emotional', /\bemocion|\bemotional\b|\bemotiv|\bcomovente\b|\btouching\b|\bsentimental\b/],
  ['commercial', /\bcomercial\b(?! esportiv)|\bcommercial\b(?! sport)|\bpropaganda\b|\bpublicidade\b|\bad\b|\banuncio\b|\bpremium\b/],
  ['sports', /\besport|\bsports?\b|\bfutebol\b|\bsoccer\b|\bgol\b|\bhighlights? esportiv/],
  ['travel', /\bviagem\b|\btravel\b|\bturismo\b|\bferias\b|\bvacation\b|\btrip\b/],
  ['luxury', /\bluxo\b|\bluxury\b|\bsofisticad|\belegante\b|\belegant\b/],
  ['podcast', /\bpodcast\b|\bconversa\b|\bbate[- ]papo\b|\btalk\b/],
  ['interview', /\bentrevista\b|\binterview\b|\bdepoimento\b|\btestimonial\b/],
  ['vlog', /\bvlog\b|\bdia a dia\b|\bday in the life\b/],
  ['gaming', /\bgam(e|ing)\b|\bgameplay\b|\bjogo\b|\bgamer\b/],
  ['wedding', /\bcasamento\b|\bwedding\b|\bnoiva\b|\bbride\b/],
  ['corporate', /\bcorporativ|\bcorporate\b|\binstitucional\b|\bempresa\b/],
  ['minimal', /\bminimalist|\bminimal\b|\bmenos efeitos\b|\bfewer effects\b|\bsem exagero\b|\bnatural e premium\b|\blook natural\b|\bnatural\b(?= and premium| e premium)/],
  ['musicvideo', /\bvideoclipe\b|\bclipe musical\b|\bmusic video\b|\bclipe\b/],
];
const LOOK_WORDS = [
  ['hollywood', /\bteal\b|\bhollywood\b|\blaranja e azul\b|\borange and teal\b/],
  ['warmfilm', /\bquente\b|\bwarm\b|\bdourad|\bgolden\b|\bfilm look\b|\bfilme quente\b/],
  ['coolcine', /\bfrio\b|\bfria\b|\bcool\b|\bazulad|\bbluish\b/],
  ['vintage', /\bvintage\b|\bretro\b|\banos 80\b|\b80s\b|\bvhs\b|\bantigo\b/],
  ['bw', /\bpreto e branco\b|\bblack and white\b|\bp&b\b|\bb&w\b|\bmonocrom/],
  ['moody', /\bmoody\b|\bsombri|\bescuro e dramatic|\bdark and dramatic|\bdramatic look\b/],
  ['bright', /\bclaro e alegre\b|\bbright\b|\bluminos|\balegre\b|\blifestyle\b/],
  ['epic', /\bepic[oa]? ?(color|cor)\b|\bcor epica\b/],
  ['natural', /\bcor natural\b|\bnatural colou?r\b|\bcores? naturais\b|\bsem filtro\b|\bno filter\b/],
  ['commercial', /\bcor de comercial\b|\bcommercial look\b|\bcores? vivas\b|\bvibrant\b|\bvibrante/],
];
const MOOD_WORDS = [
  ['epic', /\bepic|\bheroic|\bheroica\b|\bpoderos|\bpowerful\b|\borquestra/],
  ['dramatic', /\bdramatic|\btens[ao]\b|\btense\b|\bsuspense\b|\bdark\b/],
  ['emotional', /\bemocion|\bemotional\b|\btriste\b|\bsad\b|\bpiano\b|\bsensivel\b/],
  ['upbeat', /\banimad|\bupbeat\b|\bfeliz\b|\bhappy\b|\bpop\b|\bfun\b|\bdivertid/],
  ['electronic', /\beletronic|\belectronic\b|\bedm\b|\btrap\b|\bphonk\b/],
  ['atmospheric', /\batmosfer|\bambient|\bcalm|\bchill\b|\blo-?fi\b/],
];
const PLATFORM_WORDS = [
  ['tiktok', /\btik ?tok\b/], ['reels', /\breels?\b|\binstagram\b(?! feed)|\binsta\b/], ['shorts', /\bshorts?\b/],
  ['feed', /\bfeed\b|\b4:5\b|\b4x5\b/], ['square', /\bquadrad|\bsquare\b|\b1:1\b/], ['facebook', /\bfacebook\b|\bfb\b/],
  ['presentation', /\bapresentac|\bpresentation\b|\bpowerpoint\b/], ['youtube', /\byou ?tube\b|\b16:9\b|\bhorizontal\b|\blandscape\b|\bpaisagem\b/],
];
const CAPTION_STYLE_WORDS = [
  ['hormozi', /\bhormozi\b|\bpalavra por palavra\b|\bword by word\b|\bpalavra a palavra\b/],
  ['karaoke', /\bkaraok/], ['beast', /\bbeast\b|\bcolorid[ao]s? e grand|\bbig colou?rful\b/],
  ['neon', /\bneon\b|\bbrilhant/], ['cinema', /\blegendas? de cinema\b|\bcinema subtitles?\b/],
  ['minimal', /\blegendas? (simples|discretas|limpas)\b|\b(simple|clean|subtle) (captions|subtitles)\b/],
  ['bubble', /\bbalao\b|\bbubble\b/], ['typewriter', /\bmaquina de escrever\b|\btypewriter\b/],
  ['impact', /\blegendas? (fortes|de impacto|grandes)\b|\b(big|bold) (captions|subtitles)\b/],
  ['papel', /\bpapel\b|\bpaper\b|\bcolagem\b|\brecortad/], ['serifa', /\bserif/], ['contorno', /\bcontorno branco\b|\bborda branca\b|\bwhite outline\b|\bedits\b/],
  ['dinamico', /\bminimalista dinamic|\bdynamic minimal|\bnova meta\b|\bsem amarelo\b/], ['pilulas', /\bpilula|\bpills?\b/], ['duascores', /\bduas cores\b|\b(cores?|cor) alternad|\balternando (as )?cores\b/], ['calmo', /\bcalm[oa]\b|\bminuscul|\bquiet\b|\baesthetic\b/],
];
const LANG = { portugues: 'pt', portuguese: 'pt', ingles: 'en', english: 'en', espanhol: 'es', spanish: 'es', frances: 'fr', french: 'fr' };

const CUT_CTX = /\b(cortes?|cuts?|shots?|tomadas?|planos?|takes?|cenas?|clipes?|trechos?|por corte|per cut|each cut|cada corte|shot length|duracao (media|de cada))\b/;
const VIDEO_CTX = /\b(video|videos|versao|versoes|version|versions|reel|reels|tiktok|shorts?|clip|resumo|highlight|highlights|trailer|teaser|filme|edit|edicao|duracao|duration|long|longo|corte final|final cut|transform|transforma|turn|make|faz|faca|fazer|em|into|de|a|an)\b/;

function ctxAround(s, idx, len, before = 42, after = 34) {
  return { pre: s.slice(Math.max(0, idx - before), idx), post: s.slice(idx + len, idx + len + after) };
}
const has = (s, re) => re.test(s);

// ---------- intérprete ----------
export function interpret(text, prev, ctx = {}) {
  const ctxPlan = ctx.plan || null;
  const spec = deepClone(prev || newSpec());
  spec.ops = spec.ops || []; spec.audio = spec.audio || { keepDialogue: true };
  // o que está entre aspas é o texto da pessoa: não vira comando ("27 horas de viagem" não é duração)
  const sRaw = norm(String(text).replace(/["“”]([^"“”]{1,200})["“”]/g, ' "frase" '));
  const { text: s, fixed: typos } = canon(sRaw);
  const said = [];      // o que entendi (pt-BR)
  const warn = [];      // avisos e limitações
  const ask = [];       // dúvidas para o usuário
  const changed = new Set();
  const over = spec.over;
  const set = (path, val) => { const ks = path.split('.'); let o = over; ks.slice(0, -1).forEach(k => { o[k] = o[k] || {}; o = o[k]; }); o[ks[ks.length - 1]] = val; changed.add(path); };
  const eff = () => resolveStyle(spec);
  const isFollowUp = !!prev;

  // ------ desfazer/recomeçar não é aqui (a interface trata), mas reconhecemos ------
  if (/^(desfaz|desfazer|volta|undo|reverte)|\b(volta (como|do jeito que) estava|versao anterior|undo that|go back|desfaz isso|desfaz o ultimo)\b/.test(s)) return { spec: prev || spec, said: ['Desfazer'], warn, ask, undo: true };

  // ------ estilos com porcentagem: "70% documentario e 30% acao" ------
  // trechos que falam de UMA parte (final, momentos, cor, transição) não mudam o estilo geral
  const sStyle = s
    .replace(/\b(color grading|grading|cor|colou?r|look|transic\w*|transitions?|trilha|musicas?|music|songs?|legendas?|captions?|subtitles?)\s+(\w+\s+)?(cinematograf\w*|cinematic|epic\w*|dramatic\w*|emocion\w*|emotional|profission\w*)/g, ' ')
    .replace(/\b(cinematic|cinematograf\w*|epic\w*|dramatic\w*)\s+(transitions?|transic\w*|colou?r|grading|look|music|musica|soundtrack|trilha|impacts?)\b/g, ' ')
    .replace(/\b(final|ending|fim|end|ultimos?\s+\d+\s+\w+|last\s+\d+\s+\w+|final\s+\d+\s+\w+)\s+(\w+\s+){0,2}(mais\s+)?(emocion\w*|emotional|epic\w*|marcante|bonit\w*)/g, ' ')
    .replace(/\b(momentos?|moments?|partes?|cenas?)\s+(\w+\s+)?(emocion\w*|emotional|exciting|agitad\w*|tens\w*)/g, ' ')
    .replace(/\b(emocion\w*|emotional|exciting)\s+(momentos?|moments?|partes?|parts?|cenas?|scenes?)/g, ' ')
    .replace(/\bhighlight reels?\b/g, ' ');
  const sStyle2 = prev ? sStyle.replace(/\b(mais|more)\s+(cara de |estilo |jeito de |pegada de |vibe de |clima de |like a? ?)?[a-z]+/g, ' ') : sStyle;
  const pctStyles = [];
  const pctRe = /(\d{1,3})\s*%\s*(?:de\s+|of\s+)?([a-z\s-]{3,40})/g; let m;
  while ((m = pctRe.exec(sStyle2))) {
    const chunk = m[2].split(/\b(e|and|com|with|\+)\b/)[0];
    const ids = STYLE_WORDS.filter(([, re]) => re.test(chunk)).map(([id]) => id);
    ids.forEach(id => pctStyles.push({ id, w: +m[1] / 100 / ids.length }));
  }
  let styleHits = [];
  if (pctStyles.length) styleHits = pctStyles;
  else {
    for (const [id, re] of STYLE_WORDS) if (re.test(sStyle2)) styleHits.push({ id, w: 1 });
    // "cinematico e emocional" = os dois; "acao" + "trailer" = trailer pesa mais
    if (styleHits.some(h => h.id === 'trailer') && styleHits.some(h => h.id === 'action')) styleHits = styleHits.map(h => h.id === 'action' ? { ...h, w: 0.5 } : h);
    // "social" genérico perde para estilos específicos
    if (styleHits.length > 1) styleHits = styleHits.filter(h => h.id !== 'social' || styleHits.length === 1);
    // formato viral é receita completa: não mistura com estilo genérico
    const fh = styleHits.find(h => PRESETS[h.id] && PRESETS[h.id].fmt);
    if (fh) styleHits = [{ id: fh.id, w: 1 }];
    // "estilo doc com um pouco de acao"
    styleHits = styleHits.map(h => new RegExp(`\\bum pouco de\\s+\\w*\\s*${h.id === 'action' ? 'acao' : h.id}|a (bit|little) of\\s+\\w*\\s*${h.id}`).test(sStyle) ? { ...h, w: 0.3 } : h);
  }
  // musica "epica" sozinha não é estilo épico; "comercial esportivo" vira esporte
  if (styleHits.length) {
    spec.mix = styleHits; changed.add('mix');
    said.push('Estilo: ' + blendPresets(spec.mix).label);
  }

  // ------ plataformas e várias saídas: "15s TikTok, 60s Reel e 10 min YouTube" ------
  const plats = [];
  const sPlat = s.replace(/\bhighlight reels?\b/g, m => ' '.repeat(m.length));
  for (const [id, re] of PLATFORM_WORDS) { const r = new RegExp(re.source, 'g'); let mm; while ((mm = r.exec(sPlat))) plats.push({ id, idx: mm.index, len: mm[0].length }); }
  // youtube + shorts = shorts
  const filteredPlats = plats.filter(p => !(p.id === 'youtube' && plats.some(q => q.id === 'shorts' && Math.abs(q.idx - p.idx) < 12)));
  // "vertical" sem plataforma = reels
  if (!filteredPlats.length && /\bvertical\b|\b9:16\b|\bstories\b/.test(s)) filteredPlats.push({ id: 'reels', idx: s.search(/vertical|9:16|stories/), len: 8 });

  // ------ durações ------
  const durRe = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:-|\\s)?${UNIT}\\b`, 'g');
  const mentions = [];
  while ((m = durRe.exec(s))) mentions.push({ v: toSec(+m[1], m[2]), unit: m[2], idx: m.index, len: m[0].length, raw: m[0] });
  // faixas "entre 2 e 3 segundos", "between 2 and 3 seconds", "2 a 3 s", "2-3 seconds"
  const ranges = [];
  const rangeRe = new RegExp(`(?:entre|between)?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:e|and|a|to|-)\\s*(\\d+(?:\\.\\d+)?)\\s*${UNIT}\\b`, 'g');
  while ((m = rangeRe.exec(s))) ranges.push({ a: toSec(+m[1], m[3]), b: toSec(+m[2], m[3]), idx: m.index, len: m[0].length });
  const inRange = idx => ranges.some(r => idx >= r.idx && idx < r.idx + r.len);
  const approx = /\b(aproximad|cerca de|mais ou menos|uns|umas|about|around|roughly|approximately|approx|~)/;
  const exactRe = /\b(exatamente|exactly|no maximo|at most|ate|up to|precisamente|precisely|no minimo|at least)\b/;
  const usedIdx = new Set();

  for (const r of ranges) {
    const { pre, post } = ctxAround(s, r.idx, r.len);
    if (CUT_CTX.test(pre + ' ' + post) || /\b(media|average|avg|duracao|length)\b/.test(pre)) {
      const avg = (r.a + r.b) / 2;
      set('pacing.avgShot', avg); set('pacing.minShot', Math.min(r.a, r.b) * 0.6); set('pacing.maxShot', Math.max(r.a, r.b) * 1.6);
      set('pacing.window', [Math.min(r.a, r.b), Math.max(r.a, r.b)]);
      said.push(`Corte médio entre ${fmtN(r.a)} e ${fmtN(r.b)} s`);
    } else {
      spec.target = { seconds: (r.a + r.b) / 2, exact: false, range: [r.a, r.b] };
      said.push(`Duração final entre ${fmtDur(r.a)} e ${fmtDur(r.b)}`);
    }
  }

  const durForPlatform = new Map();
  for (const d of mentions) {
    if (inRange(d.idx)) continue;
    const { pre, post } = ctxAround(s, d.idx, d.len);
    const ctx = pre + ' ' + post;
    const isApprox = approx.test(pre.slice(-30));
    const isExact = exactRe.test(pre.slice(-25));
    // duração do material bruto ("40-minute recording", "45 minutos de gravação") não é o alvo
    if (/^\s*(of\s+)?(de\s+)?(recording|footage|gravac\w*|material|bruto|raw|filmagem|live|aula|reuniao|meeting|stream|podcast)\b/.test(post) || /\b(this|esse|essa|este|esta|isso|my|meu|minha)\s*$/.test(pre) && /^\s*(recording|footage|video|of)/.test(post)) { spec.sourceHint = d.v; usedIdx.add(d.idx); continue; }
    // limiar de silêncio
    if (/\b(silenc|silence|pausas?|pauses?|respiros?|dead air)/.test(ctx) && /\b(maior|maiores|mais de|acima|longer|longos?|longas?|over|than|que|>)\b/.test(ctx) && d.v <= 10) {
      set('silence.remove', true); set('silence.minLen', d.v); usedIdx.add(d.idx);
      said.push(`Tirar silêncios com mais de ${fmtN(d.v)} s`); continue;
    }
    // transição a cada N segundos
    if (/\b(a cada|every|cada)\s*$/.test(pre.trim() + ' ') || (/\b(a cada|every)\b/.test(pre.slice(-12)) && /transi/.test(ctx))) {
      if (/transi/.test(ctx)) { set('transitions.every', d.v); said.push(`Transição a cada ${fmtN(d.v)} s`); usedIdx.add(d.idx); continue; }
    }
    // primeiros N segundos
    if (/\b(primeiros?|first|inicio|opening|abertura|comeco|beginning|iniciais)\b/.test(pre.slice(-26)) && d.v <= 30) {
      usedIdx.add(d.idx);
      if (/\b(tira|tire|remove|remova|corta|corte|apaga|apague|exclui|elimina|pula|pule|skip|cut|drop)\b/.test(pre.slice(-34))) {
        const plan0 = ctxPlan; if (plan0) for (const x of rangeToSrc(plan0, 0, d.v)) spec.ops.push({ op: 'excludeSrc', ...x });
        else spec.ops.push({ op: 'keepOnly', srcId: '*', from: d.v, to: 1e9 });
        said.push(`Tirar os primeiros ${fmtN(d.v)} s`); continue;
      }
      const clause = s.slice(d.idx + d.len).split(/[,;.]|\be\b(?= (a|o|as|os|um|uma|\d))/)[0];
      const after = pre.slice(-30).split(/[,;.]/).pop() + ' ' + clause.slice(0, 70);
      if (/\b(gancho|momento mais forte|melhor momento|impacto|prend)/.test(after)) { spec.hookSeconds = d.v; said.push(`Gancho forte nos primeiros ${fmtN(d.v)} s`); }
      else if (/\b(lent|devagar|slow|calm|desaceler)/.test(after)) { spec.sections.push({ from: 0, to: d.v, pace: 'slow' }); said.push(`Primeiros ${fmtN(d.v)} s mais lentos`); }
      else if (/\b(rapid|fast|dinamic|dynamic|acelerad|intens|frenetic)/.test(after)) { spec.sections.push({ from: 0, to: d.v, pace: 'fast' }); spec.hookSeconds = d.v; said.push(`Primeiros ${fmtN(d.v)} s bem dinâmicos, com gancho`); }
      else { spec.hookSeconds = d.v; said.push(`Gancho forte nos primeiros ${fmtN(d.v)} s`); }
      continue;
    }
    // últimos / final N segundos
    if (/\b(ultimos?|last|finais|final|end|ending|fim)\b/.test(pre.slice(-22)) && d.v <= 60 && !/\b(corta|corte|tira|tire|remove|remova|apaga|exclui)\b/.test(pre.slice(-30)) && !/\b(por|for)\s*$/.test(pre.trim() + ' ' ) && !/\b(congela\w*|freeze|frize)\b/.test(pre.slice(-40))) {
      usedIdx.add(d.idx);
      const after = post + ' ' + s.slice(d.idx + d.len, d.idx + d.len + 60);
      const mood = /\bemocion|emotional|emotiv/.test(after) ? 'emotional' : /\bepic/.test(after) ? 'epic' : /\b(lent|slow)/.test(after) ? 'slow' : /\b(rapid|fast|intens)/.test(after) ? 'fast' : 'emotional';
      spec.sections.push({ from: -d.v, to: 0, pace: mood === 'fast' ? 'fast' : 'slow', mood });
      said.push(`Últimos ${fmtN(d.v)} s: ${moodPt(mood)}`); continue;
    }
    // duração por corte
    if (CUT_CTX.test(ctx) && d.v <= 12 && !/\b(video|versao|version|reel|tiktok|short)\b/.test(post.slice(0, 14))) {
      usedIdx.add(d.idx);
      set('pacing.avgShot', d.v); set('pacing.exact', isExact);
      said.push(`Corte médio de ${fmtN(d.v)} s${isExact ? ' (exato)' : ' (aproximado)'}`); continue;
    }
    // duração final (com ou sem plataforma)
    if (d.v >= 3 && (VIDEO_CTX.test(ctx) || /^min|^h/.test(d.unit) || filteredPlats.length)) {
      usedIdx.add(d.idx);
      // plataforma mais próxima depois (ou antes) desta duração
      let best = null, bestDist = 1e9;
      for (const p of filteredPlats) { const dist = p.idx >= d.idx ? p.idx - d.idx : (d.idx - p.idx) * 1.5; if (dist < bestDist && dist < 40) { bestDist = dist; best = p; } }
      if (best && !durForPlatform.has(best.idx)) durForPlatform.set(best.idx, { v: d.v, exact: isExact });
      else if (!spec.target || changed.has('target') === false) { spec.target = { seconds: d.v, exact: isExact }; changed.add('target'); }
      continue;
    }
  }
  if (filteredPlats.length) {
    const seen = new Set(); const outs = [];
    for (const p of filteredPlats.sort((a, b) => a.idx - b.idx)) {
      let d = durForPlatform.get(p.idx);
      if (!d) { const bm = s.slice(Math.max(0, p.idx - 18), p.idx).match(/\b(\d{1,3})\s+(pro|para|pra|no|na|for|on)?\s*(o |a |the )?$/); if (bm && +bm[1] >= 5 && +bm[1] <= 600) d = { v: +bm[1], exact: false }; }
      const key = p.id + '|' + (d ? d.v : '');
      if (seen.has(key)) continue; seen.add(key);
      outs.push({ platform: p.id, duration: d ? d.v : null, exact: d ? d.exact : false });
    }
    // mesma plataforma sem duração repetida some
    spec.outputs = outs; changed.add('outputs');
    if (outs.length > 1 && spec.versions === outs.length) spec.versions = 1; // "3 versões: TikTok, Reels e YouTube" = 3 formatos
    said.push('Formato: ' + outs.map(o => PLATFORMS[o.platform].label + (o.duration ? ` (${fmtDur(o.duration)})` : '')).join(', '));
    if (outs.length === 1 && outs[0].duration && !spec.target) spec.target = { seconds: outs[0].duration, exact: outs[0].exact };
  }
  // "vlog, 15 segundos" / "retrospectiva do ano, 15 segundos": tirando o estilo pedido, só sobra a duração
  const sNoStyle = styleHits.reduce((acc, h) => { const w = STYLE_WORDS.find(x => x[0] === h.id); return w ? acc.replace(new RegExp(w[1].source, 'g'), ' ') : acc; }, s).replace(/[,.;:!]/g, ' ');
  if (!spec.target && !filteredPlats.length && mentions.length === 1 && !usedIdx.has(mentions[0].idx) && mentions[0].v >= 5 && sNoStyle.replace(mentions[0].raw, '').replace(/\b(um|uma|de|com|so|apenas|quero|faz|faca|em|ter|tenha|video|o|a|deixa|deixe|fica|ficar|pra|para|total|no|tamanho|duracao|corta|corte|reduz|reduza|ele|isso|estilo|style|formato|edita|edit)\b/g, '').trim().length < 4) { spec.target = { seconds: mentions[0].v, exact: false }; changed.add('target'); }
  if (changed.has('target') && spec.target) said.push(`Duração final ${spec.target.exact ? 'exata de ' : 'de cerca de '}${fmtDur(spec.target.seconds)}`);

  // "transforma 40 minutos em 60 segundos": a primeira duração é o material, a segunda o alvo
  const fromTo = s.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIT}\\s*(?:de\\s+\\w+\\s+|of\\s+\\w+\\s+|\\w+\\s+){0,4}(?:em|into|in|para|to)\\s+(?:um|uma|a|an)?\\s*(?:[a-z]+\\s+){0,2}?(?:video\\s+de\\s+)?(\\d+(?:\\.\\d+)?)\\s*(?:-|\\s)?${UNIT}`));
  if (fromTo) {
    const tgt = toSec(+fromTo[3], fromTo[4]);
    spec.target = { seconds: tgt, exact: false };
    const i = said.findIndex(x => x.startsWith('Duração final')); if (i >= 0) said.splice(i, 1);
    said.push(`Duração final de cerca de ${fmtDur(tgt)}`);
  }

  // ------ ritmo por palavras ------
  const cur = eff();
  const scopedPace = spec.sections.length > 0 || /\b(during|durante|nos momentos|in the)\b.{0,20}\b(emocion|emotional|exciting|agitad)/.test(s);
  if (!scopedPace && /\b(mais rapid|faster|acelera|mais dinamic|more dynamic|cortes mais curtos|shorter cuts|speed (it )?up|mais agil)/.test(s) && !changed.has('pacing.avgShot')) {
    const v = clamp(cur.pacing.avgShot * 0.72, 0.3, 20); set('pacing.avgShot', v); set('pacing.minShot', cur.pacing.minShot * 0.75); set('pacing.maxShot', cur.pacing.maxShot * 0.75);
    said.push(`Cortes mais rápidos: média ${fmtN(cur.pacing.avgShot)} → ${fmtN(v)} s`);
  } else if (!scopedPace && /\b(mais lent|slower|mais devagar|desacelera|slow (it )?down|mais calm|respira mais|cortes mais longos|longer (cuts|shots))/.test(s) && !changed.has('pacing.avgShot')) {
    const v = clamp(cur.pacing.avgShot * 1.35, 0.3, 20); set('pacing.avgShot', v); set('pacing.minShot', cur.pacing.minShot * 1.3); set('pacing.maxShot', cur.pacing.maxShot * 1.3);
    said.push(`Ritmo mais calmo: média ${fmtN(cur.pacing.avgShot)} → ${fmtN(v)} s`);
  } else if (!changed.has('pacing.avgShot') && !styleHits.length) {
    if (/\b(muitos cortes|lots of cuts|many cuts|cortes rapidos|fast cuts|frenetic|frenetico)\b/.test(s)) { set('pacing.avgShot', 1.0); said.push('Muitos cortes: média ~1 s'); }
    else if (/\b(poucos cortes|few cuts|cortes longos|long takes)\b/.test(s)) { set('pacing.avgShot', 5); said.push('Poucos cortes: média ~5 s'); }
  }
  if (/\b(meio|middle|parte do meio|middle section)\b.{0,30}\b(lent|slow|calm|devagar)/.test(s)) { spec.sections.push({ from: 'mid', to: 'mid', pace: 'slow' }); said.push('Parte do meio mais lenta'); }
  if (/\b(lent|slow|devagar)\w*\b.{0,40}\b(momentos? emocion|emotional moments?)/.test(s) || /\b(lent|slow)\w*\s+(during|durante|nos)\b.{0,12}emo/.test(s)) { set('pacing.emotionAware', true); said.push('Mais lento nos momentos emocionantes, mais rápido nos agitados'); }
  if (/\b(no ritmo|na batida|on the beat|beat|batida|sincroniz)\b/.test(s) && !/sem batida|no beat/.test(s)) { set('pacing.beatSync', true); said.push('Cortes sincronizados com a batida'); }

  // ------ silêncios, repetições, erros ------
  if (/\b(silenc|pausas?|pauses?|dead air|respiros?|tempo morto|awkward)/.test(s) && /\b(tira|tirar|remove|remova|corta|cortar|elimina|sem|cut|get rid|delete)\b/.test(s) && !changed.has('silence.minLen')) {
    set('silence.remove', true); said.push('Tirar silêncios e pausas desnecessárias');
  }
  if (/\b(mantem|manter|keep|nao corta|nao tire|don'?t cut|leave)\b.{0,25}\b(silenc|pausas|pauses)/.test(s)) { set('silence.remove', false); said.push('Manter as pausas'); }
  if (/\b(repetic|repetit|erros?\b|mistakes?|gaguej|stutter|repeti)/.test(s)) warn.push('Repetições e erros de fala só dá para achar com a transcrição. Ative a transcrição para eu marcar esses trechos; sem ela, tiro só os silêncios.');

  // ------ gancho ------
  if (spec.hookSeconds == null && /\b(gancho|hook|prend|engaj|engaging|grab attention|chama atencao|abertura forte|strong open|comeco forte)/.test(s)) { spec.hookSeconds = 3; said.push('Gancho forte na abertura (3 s)'); }
  if (/\b(aberturas? alternativas?|alternative openings?|opcoes de abertura)\b/.test(s)) { const n = +(s.match(/(\d+)\s*(aberturas|alternative|opcoes)/) || [0, 3])[1]; spec.versions = Math.max(spec.versions, n); spec.versionsKind = 'openings'; said.push(`${n} aberturas diferentes para comparar`); }

  // ------ versões ------
  const vm = s.match(/(\d+)\s+(\w+\s+)?(versoes|versions|interpretac\w*|variac\w*|variations|opcoes|options|jeitos|formas|edicoes|alternativas|takes|ideias)\b/);
  if (vm) { spec.versions = clamp(+vm[1], 1, 4); spec.versionsKind = 'styles'; said.push(`${spec.versions} versões diferentes para comparar`); }

  // ------ música ------
  if (/\b(sem musica|no music|without music|tira a musica|remove the music|sem trilha)\b/.test(s)) { spec.music.none = true; said.push('Sem música'); }
  else {
    for (const [id, re] of MOOD_WORDS) {
      const r = new RegExp(`\\b(musica|music|trilha|soundtrack|song|track)s?\\b.{0,20}(?:${re.source})|(?:${re.source})\\w*\\s+(\\w+\\s+)?(musica|music|trilha|soundtrack|songs?|tracks?)\\b`);
      if (r.test(s)) { spec.music.mood = id; spec.music.none = false; said.push(`Trilha ${moodPt(id)}`); break; }
    }
    const pm2 = s.match(/\b(musica|music)\s+(\d+)\s*%\s*(mais\s+|more\s+)?(baixa|alta|quieter|louder|intensa|forte)/);
    if (pm2) { const sign = /baixa|quieter/.test(pm2[4]) ? -1 : 1; spec.music.intensity = clamp(spec.music.intensity + sign * (+pm2[2]) / 100, -1, 1); said.push(`Música ${sign > 0 ? '+' : '−'}${pm2[2]}%`); }
    const pm = pm2 ? null : s.match(/(aumenta|aumentar|increase|sobe|subir|raise|boost|diminui|diminuir|decrease|baixa|abaixa|lower|reduce|reduz)\w*\s+(?:a\s+|the\s+)?(?:intensidade da |music intensity|musica|music|volume da musica|trilha)\D{0,25}(\d+)\s*%/);
    if (pm) { const sign = /diminu|decrease|baix|lower|reduc|reduz/.test(pm[1]) ? -1 : 1; spec.music.intensity = clamp(spec.music.intensity + sign * (+pm[2]) / 100, -1, 1); said.push(`Música ${sign > 0 ? '+' : '−'}${pm[2]}% de intensidade`); }
    else if (!/musica mais (baixa|alta)/.test(s) && /\b(musica|music|trilha)\b.{0,25}\b(mais intens|more intense|louder|mais forte|stronger|mais pesad)/.test(s) || /\b(mais|more)\s+(dramatic|intens|epic)\w*\s+(musica|music)/.test(s) || /\badd more dramatic music\b/.test(s)) { spec.music.intensity = clamp(spec.music.intensity + 0.25, -1, 1); if (!spec.music.mood && /dramatic/.test(s)) spec.music.mood = 'dramatic'; said.push('Música mais intensa (+25%)'); }
    else if (!/musica mais (baixa|alta)/.test(s) && /\b(musica|music|trilha)\b.{0,25}\b(quieter|mais suave|softer|menos intens|lower)/.test(s)) { spec.music.intensity = clamp(spec.music.intensity - 0.25, -1, 1); said.push('Música menos intensa (−25%)'); }
    if (/\b(musica|music|audio|som|trilha)\b.{0,30}\b(do|deste|desse|from (this|the|that)|of (this|the))\b.{0,12}\b(video|clip|arquivo)/.test(s)) { spec.music.fromVideo = true; said.push('Usar a música tirada de um vídeo seu'); }
  }
  if (/\b(audio original|original\s+(\w+\s+)?audio|som original|fala original|dialogo|dialogue|conversa)\b/.test(s) && /\b(mant|keep|preserv|100|deixa)\b/.test(s)) { spec.audio.keepDialogue = true; set('music.duckDb', -16); said.push('Fala original preservada a 100%, música abaixa quando alguém fala'); }

  // ------ efeitos sonoros ------
  const sfxMap = [['impact', /impact|impacto|pancada|hit|batida forte/], ['whoosh', /whoosh|swoosh|vento|passagem/], ['riser', /riser|subida|tensao subindo/], ['boom', /boom|explos/], ['pop', /\bpop\b|estalo/], ['ding', /ding|sininho/], ['clap', /(?:palma|palmas)|(?:clap|claps)|(?:aplauso|aplausos)/], ['sinos', /(?:sino|sinos)|jingle/]];
  const cm = s.match(/(\d+)\s+(\w+\s+)?(impactos?|impacts?|whooshes|whoosh|risers?|explosoes|explosions|booms?|hits?|palmas|(?:clap|claps))\b/);
  if (cm) { const kind = sfxMap.find(([, re]) => re.test(cm[3]))[0]; spec.sfxRequests.push({ kind, count: +cm[1] }); said.push(`${cm[1]} efeitos de ${sfxPt(kind)}`); }
  if (/\b(efeitos sonoros|sound effects|sfx|sound design|efeito sonoro)\b/.test(s)) {
    if (/\b(sem|no|tira|remove|menos|fewer|less|nao quero|nao coloca|without)\b.{0,15}\b(efeitos sonoros|sound effects|sfx)/.test(s)) { set('sfx.density', 0.05); said.push('Quase sem efeitos sonoros'); }
    else { set('sfx.density', Math.max(0.55, cur.sfx.density)); if (/\bimpact|impacto/.test(s)) set('sfx.onImpacts', true); said.push('Efeitos sonoros' + (/\bimpact|impacto/.test(s) ? ' nos momentos de impacto' : '')); }
  }

  // ------ cor ------
  if (/\b(sem cor|sem color|no grade|no grading|cor original|original colou?rs?)\b/.test(s)) { set('color.look', 'none'); said.push('Cor original, sem tratamento'); }
  else {
    for (const [id, re] of LOOK_WORDS) if (re.test(s)) { set('color.look', id); said.push('Cor: ' + LOOKS[id].label); break; }
    if (!changed.has('color.look') && /\b(color grading|grading|correcao de cor|colou?r grade|tratamento de cor)\b/.test(s)) {
      const lk = /cinemat|cinema|hollywood/.test(s) ? 'hollywood' : /epic/.test(s) ? 'epic' : cur.color.look;
      set('color.look', lk); said.push('Cor: ' + LOOKS[lk].label);
    }
  }

  // ------ transições ------
  if (/\b(sem transic|no transitions?|so cortes secos|only hard cuts|hard cuts only|sem efeito de transic|tira as transic|remove (as |the )?transi\w* (todas|all))/.test(s) && !/\b(remove|tira)\b.{0,20}\btransi\w*\b.{0,12}\d/.test(s)) { set('transitions.mix', { cut: 1 }); said.push('Só cortes secos, sem transições'); }
  else if (/\btransi/.test(s) && !/\b(remove|remova|tira|apaga|delete)\b.{0,20}\btransi/.test(s)) {
    if (/\b(suave|smooth|elegant|sutil|subtle|cinemat|profission|professional)/.test(s)) { set('transitions.mix', { cut: 0.55, dissolve: 0.3, dip: 0.15 }); set('transitions.dur', 0.5); said.push('Transições suaves e profissionais'); }
    else if (/\b(impact|rapid|fast|whip|chicote|dinamic|dynamic|energ)/.test(s)) { set('transitions.mix', { cut: 0.5, whip: 0.25, flash: 0.15, zoom: 0.1 }); set('transitions.dur', 0.2); said.push('Transições rápidas de impacto'); }
    else if (!changed.has('transitions.every')) { const mx = { ...cur.transitions.mix }; mx.cut = Math.max(0.4, (mx.cut || 1) - 0.25); set('transitions.mix', mx); said.push('Mais transições'); }
  }
  // remover transição num instante
  const rt = s.match(/\b(remove|remova|tira|tire|apaga|delete)\b.{0,25}\btransi\w*\b.{0,12}?(\d{1,2}:\d{2}(?:\.\d+)?|\d+(?:\.\d+)?\s*s)/);
  if (rt) { const t = parseTc(rt[2]); spec.ops.push({ op: 'removeTransition', t }); said.push(`Remover a transição em ${fmtTc(t)}`); }

  // ------ efeitos visuais ------
  const sm = s.match(/(\d+)\s*%\s*(de\s+)?(camera lenta|slow ?motion|slow-mo|slowmo)/) || (s.match(/(?:camera lenta|slow ?motion|slow-mo|slowmo)\s*(?:de\s+|em\s+)?(\d+)\s*%/) || null);
  if (sm) { set('effects.slowmo', clamp(+sm[1] / 100, 0, 0.8)); said.push(`${sm[1]}% em câmera lenta`); }
  else if (/\b(sem camera lenta|no slow ?motion)\b/.test(s)) { set('effects.slowmo', 0); said.push('Sem câmera lenta'); }
  else if (/\b(camera lenta|slow ?motion|slow-mo|slowmo)\b/.test(s) && !/\b(camera lenta|slow ?motion|slowmo)\b[^,;]{0,25}\b(no|na|em|aos|at|de|do|da|nesse|nessa|aqui|logo)\b\s*(\d|final|fim|finalzinho|comec|inicio|meio|metade|ultim|primeir|ponto|parte|momento|trecho|corte|aqui)/.test(s) && !/\b(no|na|em)\s+(final|fim|finalzinho|comec\w*|inicio|meio)\b[^,;]{0,25}\b(camera lenta|slow ?motion|slowmo)\b/.test(s)) { set('effects.slowmo', Math.max(0.15, cur.effects.slowmo)); said.push('Câmera lenta nos melhores momentos'); }
  if (/\b(speed ?ramp|rampa de velocidade|acelera e desacelera|velocidade variavel)\b/.test(s)) { set('effects.speedRamp', true); said.push('Speed ramps'); }
  if (/\b(menos|less|pouco)\s+zoom\b/.test(s)) { set('effects.punchIn', (cur.effects.punchIn || 0) * 0.4); said.push('Menos zoom'); }
  else if (/\b(zoom|punch[- ]?in|aproxima)\b/.test(s) && !/\b(sem|no|nao)\s+(quero\s+)?zoom/.test(s) && !/zoom nas palavras|pulso na batida|zoom lento|transicao de zoom|transicoes de zoom/.test(s)) { set('effects.punchIn', Math.max(0.6, cur.effects.punchIn)); said.push('Zoom de ênfase (punch-in)'); }
  if (/\b(sem|no|nao quero)\s+zoom/.test(s)) { set('effects.punchIn', 0); set('noZoom', true); set('slowPush', 0); set('emphasisZoom', false); set('beatPulse', 0); said.push('Sem zoom nenhum (nem empurrão, nem pulso)'); }
  if (/\b(tremor|camera shake|shake|treme)\b/.test(s) && !/\bestabiliz|stabiliz/.test(s)) { set('effects.shake', Math.max(0.45, cur.effects.shake)); said.push('Tremor de câmera nos impactos'); }
  if (/\b(granulad|film grain|grain|granulacao)\b/.test(s)) { set('color.grain', 0.12); said.push('Granulado de filme'); }
  if (/\b(faixas pretas|barras pretas|letterbox|cinemascope|widescreen bars|black bars)\b/.test(s)) { set('effects.letterbox', !/\bsem\b|\bno\b/.test(s)); said.push(over.effects.letterbox ? 'Faixas pretas de cinema' : 'Sem faixas pretas'); }
  if (/\b(light leaks?|vazamento de luz|luz vazando)\b/.test(s)) { set('effects.lightLeak', 0.35); said.push('Vazamentos de luz'); }
  if (/\b(menos efeitos|fewer effects|less effects|menos exagero|mais natural|more natural|mais limpo|cleaner|look natural)\b/.test(s)) {
    for (const k of ['punchIn', 'shake', 'flash', 'lightLeak']) set('effects.' + k, (cur.effects[k] || 0) * 0.4);
    set('sfx.density', cur.sfx.density * 0.5); set('transitions.mix', { cut: 0.85, dissolve: 0.15 }); said.push('Menos efeitos, mais natural');
  }
  if (/\b(mais efeitos|more effects|mais impacto|more impact)\b/.test(s)) { for (const k of ['punchIn', 'shake', 'flash']) set('effects.' + k, clamp((cur.effects[k] || 0.2) * 1.5, 0, 1)); set('sfx.density', clamp(cur.sfx.density * 1.4, 0, 1)); said.push('Mais efeitos e impacto'); }

  // ------ legendas ------
  if (/\b(sem legenda|no captions?|no subtitles?|tira a legenda|remove (the )?captions?)\b/.test(s)) { spec.captions.enabled = false; said.push('Sem legendas'); }
  else if (/\b(legend|captions?|subtitles?|subtitul)/.test(s)) {
    spec.captions.enabled = true;
    for (const [id, re] of CAPTION_STYLE_WORDS) if (re.test(s)) { spec.captions.style = id; break; }
    const tl = s.match(/\b(traduz\w*|translat\w*|em|in|para|to)\s+(?:tudo\s+|everything\s+)?(?:para\s+|to\s+|into\s+|em\s+)?(portugues|portuguese|ingles|english|espanhol|spanish|frances|french)\b/);
    const tl2 = s.match(/\b(portugues|portuguese|ingles|english|espanhol|spanish|frances|french)\s+(legendas?|subtitles?|captions?)\b|\b(legendas?|subtitles?|captions?)\s+(em|in)\s+(portugues|portuguese|ingles|english|espanhol|spanish|frances|french)\b/);
    if (tl && /(legend|caption|subtit|traduz|translat)/.test(s)) { spec.captions.translate = LANG[tl[2]]; }
    else if (tl2) spec.captions.translate = LANG[tl2[1] || tl2[5]];
    if (/\bbilingu/.test(s)) spec.captions.bilingual = true;
    said.push('Legendas' + (spec.captions.style ? ` no estilo ${spec.captions.style}` : '') + (spec.captions.translate ? `, em ${langPt(spec.captions.translate)}` : '') + (spec.captions.bilingual ? ' (bilíngue)' : ''));
    if (spec.captions.translate) warn.push('Tradução de legendas: a versão grátis ainda não traduz sozinha. Por enquanto você cola a tradução ou o roteiro traduzido e eu sincronizo.');
  }
  if (/\b(destac|highlight|enfatiz|emphasi)\w*\b.{0,30}\b(palavras?|words?)/.test(s)) { spec.captions.highlight = true; said.push('Destacar palavras importantes'); }
  if (/\b(sem caixa alta|minuscul\w*|lowercase|sem maiuscul\w*|tira (a )?caixa alta)\b/.test(s)) { spec.captions.uppercase = false; said.push('Legenda sem caixa alta'); }
  else if (/\b(maiuscul\w*|caixa alta|uppercase|all caps|caps lock|tudo em maiusculo)\b/.test(s)) { spec.captions.uppercase = true; said.push('Legenda em caixa alta'); }

  // ------ textos com forma e títulos ------
  const quoted = [...String(text).matchAll(/["“”']([^"“”']{1,80})["“”']/g)].map(x => x[1]);
  const shapeMap = [['circle', /\b(circul\w*|circle|redond\w*|girando em volta|em volta d[oa] (rosto|cabeca|pessoa)|around (the |my )?(face|head))/], ['arc', /\b(arco|arc|curv|curved)/], ['wave', /\b(onda|wave|ondulad|wavy)/], ['badge', /\b(selo|badge|sticker|adesivo|carimbo|stamp)/], ['spiral', /\b(espiral|spiral)/]];
  // aspas duplas primeiro (assim "I've" não quebra a frase); aspas simples só se não houver duplas
  const dq = [...String(text).matchAll(/["“”]([^"“”]{1,240})["“”]/g)].map(x => x[1]);
  const quotedTxt = dq.length ? dq : [...String(text).matchAll(/["“”']([^"“”']{1,80})["“”']/g)].map(x => x[1]);
  // --- texto na tela em bloco: serifa curvada, contorno branco, papel amassado ---
  const BLOCK_WORDS = [
    ['cartaosd', /\b(cartao (sd|de memoria)|sd ?card|lately on my)\b/],
    ['horario', /\b((?:horario|horarios)|(?:timestamp|timestamps)|hora (em|no|de) cada (corte|clipe|cena)|carimbo de hora|relogio|hora do dia)\b/],
    ['lista', /\b(lista|listinha|(?:item|itens) (um|uma) (por|de cada) (vez|um|uma)|um item por corte|text list|the bills|inegociave\w*|non ?negotiable)\b/],
    ['rotulo', /\b((?:rotulo|rotulos)|(?:etiqueta|etiquetas)|(?:label|labels)|um (nome|ano|dia) (por|em cada) corte|then and now|antes e depois com (os )?anos|dia 1|day 1)\b/],
    ['mensagem', /\b(imessage|mensage[mn]s?|conversa (de|no|do) (whats\w*|zap|iphone|celular)|baloes?( de mensagem)?|chat|whatsapp|zap|print de conversa)\b/],
    ['revista', /\b(recortes? de (revista|jornal)|revista|jornal|ransom|letras recortadas|carta de sequestro|colagem de letras)\b/],
    ['marcatexto', /\b(marca[ -]?textos?|highlighter|marcador amarelo|grifad\w*|grifo)\b/],
    ['carregando', /\b(carregando|loading|porcentagem|percentual|de 0 a 100)\b/],
    ['digitando', /\b(digitando|sendo digitad\w*|letra por letra|typing)\b/],
    ['batida', /\b(na batida|no ritmo da musica|uma palavra (de cada vez|por vez)|(texto|frase) palavra por palavra)\b/],
    ['zoom', /\b(texto pequeno|letra pequena|(texto|frase) "frase" pequen[oa]|small text|(texto|frase) (com|dando|que da) zoom|zoom no texto)\b/],
    ['pilulas', /\b(pilulas?|pills?|chips?|fundo colorido (em|nas|por|atras de) (cada )?palavras?)\b/],
    ['caixa', /\b(caixa branca|fundo branco|texto (nativo )?do (tiktok|instagram)|com fundo|fundo atras|caixinha)\b/],
    ['confissao', /\b(confissao|desabafo|pensamento sincero|(texto|frase|letra) amarel[oa]( grande)?|amarelo grande)\b/],
    ['calmo', /\b(calm[oa]|quiet|minuscul\w*|aesthetic|estetic\w*|delicad[oa])\b/],
    ['minimal', /\b(minimalista|dynamic minimal\w*|nova meta)\b/],
    ['papel', /\b(papel( amassado)?|amassad\w*|recortad\w*|recorte de papel|colagem|paper|crumpled|sticker de papel)\b/],
    ['serifa', /\b(serif\w*|editorial|letra de revista|letra fina e chique)\b/],
    ['contorno', /\b(contorno branco|borda branca|white outline|(do |estilo |tipo )(o )?edits|outline branco|sticker branco|contorno preto e branco)\b/],
  ];
  const textWord = quotedTxt.length || /\b(texto|textos|frase|escrita|escrito|letra|letras|escreve|escrever|escreva|text|write)\b/.test(s);
  const shapeAsked = shapeMap.some(([, re]) => re.test(s));
  const bw = textWord && !shapeAsked ? BLOCK_WORDS.find(([, re]) => re.test(s)) : null;
  const blockAsk = /\b(texto|frase|escrita|escreve|escrever|escreva|letreiro|text|write)\b.{0,30}\b(na tela|no video|no meio|em cima do video|on screen|por cima)\b|\b(texto na tela|frase na tela|texto no meio)\b/.test(s);
  const isCaption = /\blegenda\b/.test(s) && !/\b(texto|frase)\b/.test(s);
  // formato com frase (montagem com frase, clipe de letra, vlog com gancho): o texto entre aspas é a frase dele
  const mainFmt = spec.mix && spec.mix[0] && PRESETS[spec.mix[0].id] && PRESETS[spec.mix[0].id].fmt;
  const fmtPhraseAsk = quotedTxt.length && !shapeAsked && !isCaption && ((mainFmt && mainFmt.phrase) || /\b(frase|texto|escrito|escrita|letra)\b/.test(s));
  if ((bw || (blockAsk && !shapeAsked) || fmtPhraseAsk) && !isCaption && !/\bmanchete\b/.test(s)) {
    const style = bw ? bw[0] : 'contorno';
    const shownStyle = !bw && mainFmt && mainFmt.phrase ? mainFmt.phrase : style;
    const label = (TEXT_STYLES[shownStyle] ? TEXT_STYLES[shownStyle].label : shownStyle).toLowerCase();
    const all = !/\b(primeiros (\d+ )?segundos|so no comeco|so no inicio|no comecinho|first seconds)\b/.test(s);
    const undoSaid = (re, fn) => { const i = said.findIndex(x => re.test(x)); if (i >= 0) { said.splice(i, 1); fn && fn(); } };
    if (style === 'mensagem') undoSaid(/^Estilo: /, () => { spec.mix = deepClone(prev ? prev.mix : spec.mix); });
    if (style === 'batida' && !/\b(corte|cortes|edicao|montagem)\b/.test(s)) undoSaid(/^Cortes sincronizados/, () => { if (over.pacing) { if (prev && prev.over && prev.over.pacing && prev.over.pacing.beatSync != null) over.pacing.beatSync = prev.over.pacing.beatSync; else delete over.pacing.beatSync; } });
    if (style === 'caixa' && /\bdo (tiktok|instagram)\b/.test(s)) undoSaid(/^Formato: /, () => { spec.outputs = deepClone(prev ? prev.outputs : spec.outputs); });
    if (quotedTxt.length) { spec.texts.push({ shape: 'block', style, text: quotedTxt[0], all, ...(bw ? {} : { auto: true }) }); said.push(`Texto na tela em ${label}: "${quotedTxt[0]}"${all ? '' : ' (primeiros segundos)'}`); }
    else {
      const blk = spec.texts.filter(t => t.shape === 'block');
      if (blk.length && bw) { blk.forEach(t => { t.style = style; }); said.push(`Texto na tela agora em ${label}`); }
      else if (spec.headline && bw) { spec.headline.style = style; said.push(`Manchete em ${label}`); }
      else ask.push(`Qual frase vai na tela em ${label}? Escreva entre aspas, por exemplo: texto na tela "27 horas de viagem" em ${label}.`);
    }
  }
  if (/\bmanchete\b/.test(s) && bw) { if (spec.headline) { spec.headline.style = bw[0]; } spec._headlineStyle = bw[0]; }
  if (/\b(tira|tire|remove|remova|sem|apaga|apague|exclui|delete|no)\b.{0,20}\b(texto|textos|selo|adesivo|sticker|badge|escrita|carimbo|letreiro)\b/.test(s) && !quotedTxt.length) {
    if (spec.texts.length) { spec.texts = []; said.push('Textos tirados da tela'); } else if (/\btitulo\b/.test(s) && spec.title) { spec.title = null; said.push('Sem título'); } else said.push('Sem textos extras');
  } else if (!((bw || (blockAsk && !shapeAsked)) && !isCaption && !/\bmanchete\b/.test(s))) for (const [shape, re] of shapeMap) {
    if (re.test(s) && (/\b(texto|text|escrita|escrito|frase|palavra|letreiro|titulo|title|legenda)/.test(s) || (quotedTxt.length && /\b(coloca|poe|bota|adiciona|insere|add|put|um|uma)\b/.test(s)))) {
      const txt = quoted[0] || (spec.title || '');
      const follow = /\b(em volta d[oa] (rosto|cabeca|pessoa)|around (the |my |his |her )?(face|head|person)|seguindo a pessoa|follow)/.test(s);
      spec.texts.push({ shape, text: txt || 'SEU TEXTO AQUI', at: 'auto', follow });
      said.push(`Texto em ${shapePt(shape)}${txt ? `: "${txt}"` : ''}`);
      if (!txt) ask.push('Qual frase vai no texto com forma? Escreva entre aspas, por exemplo: texto em círculo "SIGA PARA MAIS".');
      break;
    }
  }
  const tm = String(text).match(/\b(t[ií]tulo|title)\b[^"“”]{0,12}["“”]([^"“”]{1,80})["“”]/i);
  if (tm) { spec.title = tm[2]; said.push(`Título: "${tm[2]}"`); }

  // ------ final ------
  if (!spec.sections.some(x => x.from < 0) && /\b(final|ending|fim|terminar|encerramento)\b.{0,30}\b(emocion|emotional|emotiv|marcante|bonit|beautiful|epic)/.test(s)) {
    const mood = /\bepic/.test(s) ? 'epic' : 'emotional';
    spec.sections.push({ from: -6, to: 0, pace: 'slow', mood }); said.push(`Final ${moodPt(mood)}`);
  }

  // ------ ordem ------
  if (/\b(reorganiz|rearrang|fora de ordem|out of order|nao precisa seguir a ordem|creative order)\b/.test(s)) { spec.chronological = false; said.push('Pode reorganizar a ordem das cenas'); }
  if (/\b(ordem cronologica|chronolog|na ordem|in order)\b/.test(s) && !/\bfora\b|\bout of\b/.test(s)) { spec.chronological = true; said.push('Manter a ordem original'); }

  // ------ exportação ------
  if (/\b4k\b|\b2160p?\b|\buhd\b/.test(s)) { spec.export.resolution = '4k'; said.push('Exportar em 4K'); }
  else if (/\b1080p?\b|\bfull ?hd\b/.test(s)) { spec.export.resolution = '1080p'; said.push('Exportar em 1080p'); }
  else if (/\b720p?\b/.test(s)) { spec.export.resolution = '720p'; said.push('Exportar em 720p'); }
  const fm = s.match(/(\d{2})\s*(fps|quadros)/); if (fm) { spec.export.fps = clamp(+fm[1], 24, 60); said.push(`${spec.export.fps} quadros por segundo`); }

  extraRules({ s, text, spec, prev, ctx, said, warn, ask, set, changed, styleHits, eff });
  if (typos.length) said.push('Entendi a digitação: ' + typos.slice(0, 4).map(([a, b]) => `"${a}" como "${b}"`).join(', '));

  // ------ conflitos ------
  const e2 = resolveStyle(spec);
  if (e2.pacing.avgShot < 1.2 && spec.mix.some(x => ['documentary', 'interview', 'wedding', 'minimal'].includes(x.id)) && changed.has('pacing.avgShot'))
    warn.push(`Corte médio de ${fmtN(e2.pacing.avgShot)} s é bem rápido para ${blendPresets(spec.mix).label}. Vou respeitar o número, mas preservo as frases inteiras quando alguém fala.`);
  if (e2.pacing.minShot > e2.pacing.maxShot) { ask.push(`O mínimo por tomada (${fmtN(e2.pacing.minShot)} s) ficou maior que o máximo (${fmtN(e2.pacing.maxShot)} s). Qual vale?`); }
  if (spec.target && spec.outputs.some(o => PLATFORMS[o.platform] && spec.target.seconds > PLATFORMS[o.platform].maxDur))
    warn.push(`${fmtDur(spec.target.seconds)} passa do limite de ${spec.outputs.map(o => PLATFORMS[o.platform].label).join('/')}.`);
  if (spec.hookSeconds && spec.target && spec.hookSeconds > spec.target.seconds * 0.5) warn.push('O gancho ficou maior que metade do vídeo; vou limitar a 1/4 da duração.');

  const real = said.filter(x => !x.startsWith('Entendi a digitação'));
  let suggestions = [];
  if (!real.length && !ask.length && spec.ops.length === (prev && prev.ops ? prev.ops.length : 0) && !spec._export && !spec._reroll) {
    suggestions = suggest(text);
    ask.push(`Não entendi "${String(text).trim().slice(0, 80)}".` + (suggestions.length ? ' Você quis dizer algo assim?' : ' Tente com outras palavras, por exemplo "corta mais rápido" ou "legenda palavra por palavra".'));
  }
  spec.history = [...(prev && prev.history || []), text].slice(-50);
  delete spec._headlineStyle;
  const exportNow = !!spec._export, reroll = !!spec._reroll, useRef = !!spec._useRef;
  delete spec._export; delete spec._reroll; delete spec._useRef;
  return { spec, said, warn, ask, followUp: isFollowUp, suggestions, exportNow, reroll, useRef };
}

// ---------- momentos: cada oração ("câmera lenta no final e congela no começo") tem o seu ponto ----------
const FREEZE_RE = /\b(congela|congelar|congele|congelado|congelada|freeze|frize|pausa a imagem|para a imagem|imagem parada|parar a imagem)\b/;
const SLOW_RE = /\b(camera lenta|slow ?motion|slowmo|slow|devagarinho|em camera lenta)\b/;
const FAST_RE = /\b(acelera|acelerar|acelere|acelerado|acelerada|mais rapido esse|time ?lapse|timelapse|2x|speed ?up|fast forward)\b/;
const SPLIT_RE = /\b(divide|dividir|divida|corta aqui|split|quebra (o corte|aqui)|separa (aqui|o corte))\b/;
export function relPoint(cl, plan, ctx) {
  const D = plan ? plan.duration : null;
  const abs = findPoint(cl); if (abs != null) return abs;
  const m = cl.match(/\b(?:aos|em|no|at)\s+(\d+(?:[.,]\d+)?)\s*(?:s|seg|segundos?|seconds?)\b/); if (m) return +m[1].replace(',', '.');
  if (/\b(aqui|agora|nesse ponto|neste ponto|onde (esta|ta) (a linha|o cursor|parado)|here|right here)\b/.test(cl) && ctx && ctx.t != null) return ctx.t;
  if (!D) return null;
  if (/\b(comecinho|logo no comeco|no comeco|o comeco|no inicio|o inicio|na abertura|primeiro segundo|primeiros segundos|beginning|at the start|start)\b/.test(cl)) return Math.min(0.4, D * 0.05);
  if (/\b(finalzinho|no final|no fim|o final|ultimo segundo|ultimos segundos|at the end|ending|ultimo corte)\b/.test(cl)) return Math.max(0, D - 1.2);
  if (/\b(no meio|do meio|na metade|metade do video|middle|halfway)\b/.test(cl)) return D / 2;
  return null;
}
function clipsIn(plan, a, b) { return plan ? plan.clips.filter(c => c.start < b - 0.05 && c.start + c.dur > a + 0.05 && c.speed !== 'freeze') : []; }
function momentRules({ s, spec, prev, plan, ctx, said, ranges }) {
  const clauses = s.split(/\s*(?:[,;]|\s(?:e|and|depois|tambem|alem disso|mais um|mais uma|then)\s)\s*/).filter(x => x.trim());
  const doneSpeed = new Set();
  for (const cl of clauses) {
    const rg = findRanges(cl);
    const pt = relPoint(cl, plan, ctx);
    if (FREEZE_RE.test(cl) && pt != null && !rg.length) {
      const d = cl.match(/\bpor\s+(\d+(?:[.,]\d+)?)\s*(s|seg|segundos?)\b|\bfor\s+(\d+(?:\.\d+)?)\s*s/) || [];
      const dur = +((d[1] || d[3] || '1.5').replace(',', '.'));
      const m = outToSrc(plan, pt) || { srcId: '*', t: pt };
      spec.ops.push({ op: 'freeze', srcId: m.cover ? m.cover.srcId : m.srcId, at: m.cover ? m.cover.in + (pt - m.clip.start - m.cover.offset) : m.t, dur: clamp(dur, 0.3, 6) });
      said.push(`Congelar a imagem em ${fmtTc2(pt)} por ${fmtN(clamp(dur, 0.3, 6))} s`);
    }
    let slow = SLOW_RE.test(cl) && !/\b(sem|tira|no)\s+(camera lenta|slow)/.test(cl);
    const slowWord = /\b(mais lento|devagar|bem lento|lentinho)\b/.test(cl) && (rg.length || findPoint(cl) != null) && !/\b(corte|cortes|ritmo|edicao|montagem)\b/.test(cl);
    const fastWord = /\bmais rapido\b/.test(cl) && !/\b(corte|cortes|ritmo|edicao|montagem)\b/.test(cl) && (rg.length || findPoint(cl) != null);
    const fast = FAST_RE.test(cl) || fastWord; if (slowWord) { slow = true; const i = said.findIndex(x => x.startsWith('Cortes mais lentos') || x.startsWith('Ritmo mais calmo')); if (i >= 0) { said.splice(i, 1); spec.over.pacing = deepClone((prev && prev.over && prev.over.pacing) || {}); } }
    if (fastWord) { const i = said.findIndex(x => x.startsWith('Cortes mais rápidos')); if (i >= 0) { said.splice(i, 1); spec.over.pacing = deepClone((prev && prev.over && prev.over.pacing) || {}); if (!Object.keys(spec.over.pacing).length) delete spec.over.pacing; } }
    if ((slow || fast) && plan && (rg.length || pt != null)) {
      const sp = slow ? (/\b(bem|muito|super|extrema)\w*\s+(lenta|lento|devagar)|\b25 ?%/.test(cl) ? 0.35 : 0.5) : (/\b(3x|muito|bem|super)\b/.test(cl) ? 3 : 2);
      const list = rg.length ? rg.flatMap(r => clipsIn(plan, r.from, r.to)) : plan.clips.filter(c => c.speed !== 'freeze' && pt >= c.start - 0.001 && pt < c.start + c.dur).slice(0, 1);
      let n = 0;
      for (const c of list) { const k = c.srcId + ':' + c.in.toFixed(2); if (doneSpeed.has(k)) continue; doneSpeed.add(k); spec.ops.push({ op: 'setSpeed', srcId: c.srcId, in: c.in, speed: sp }); n++; }
      if (n && fast && FAST_RE.test(cl) && /\bacelerad/.test(cl)) { const i = said.findIndex(x => x.startsWith('Estilo: ')); if (i >= 0 && !/\b(viral|tiktok|dinamic|redes? sociais?|estilo)\b/.test(s)) { said.splice(i, 1); spec.mix = deepClone(prev ? prev.mix : spec.mix); } const j = said.findIndex(x => x.startsWith('Cortes mais rápidos')); if (j >= 0) { said.splice(j, 1); spec.over.pacing = deepClone((prev && prev.over && prev.over.pacing) || {}); } }
      if (n) said.push(`${slow ? 'Câmera lenta' : 'Acelerar ' + sp + 'x'} ${rg.length ? `de ${fmtTc2(rg[0].from)} a ${fmtTc2(rg[0].to)}` : `em ${fmtTc2(pt)}`}`);
    }
    if (SPLIT_RE.test(cl) && pt != null) {
      const m = outToSrc(plan, pt);
      if (m) { spec.ops.push({ op: 'split', srcId: m.srcId, at: m.t }); said.push(`Dividir o corte em ${fmtTc2(pt)}`); }
    }
  }
}

// Parâmetros efetivos = estilo misturado + sobrescritas explícitas.
export function resolveStyle(spec) {
  const b = blendPresets(spec.mix);
  const o = spec.over || {};
  const out = deepClone(b);
  for (const sec of Object.keys(o)) {
    if (typeof o[sec] === 'object' && !Array.isArray(o[sec]) && out[sec]) out[sec] = { ...out[sec], ...deepClone(o[sec]) };
    else out[sec] = deepClone(o[sec]);
  }
  // pedidos de cor/grão
  if (o.color && o.color.grain != null) out.color.grain = o.color.grain;
  if (spec.captions && spec.captions.style) out.captions.style = spec.captions.style;
  // intensidade geral ("mesmo estilo, mas menos agressivo"): escala o que chama atenção sem trocar o estilo
  if (o.intensity != null && o.intensity !== 1) {
    const k = Math.max(0.2, Math.min(2, o.intensity));
    const ef = out.effects || (out.effects = {});
    for (const f of ['punchIn', 'shake', 'flash', 'lightLeak']) if (ef[f] != null) ef[f] = Math.min(1.5, ef[f] * k);
    if (out.sfx) out.sfx.density = Math.min(1, (out.sfx.density || 0) * k);
    if (out.transitions && out.transitions.mix) { const m = { ...out.transitions.mix }; for (const t of Object.keys(m)) if (t !== 'cut') m[t] *= k; out.transitions.mix = m; }
    if (out.pacing) out.pacing.avgShot = out.pacing.avgShot / Math.pow(k, 0.5);
    if (out.beatPulse) out.beatPulse *= k;
  }
  return out;
}

// ---------- formatação pt-BR ----------
export const fmtN = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
export function fmtDur(s) {
  if (s < 60) return `${fmtN(s)} s`;
  const m = Math.floor(s / 60), r = Math.round(s - m * 60);
  if (s >= 3600) { const h = Math.floor(s / 3600), mm = Math.round((s - h * 3600) / 60); return `${h} h${mm ? ' ' + mm + ' min' : ''}`; }
  return r ? `${m} min ${r} s` : `${m} min`;
}
const parseTc = x => { const m = x.match(/(\d+):(\d+(?:\.\d+)?)/); return m ? +m[1] * 60 + +m[2] : parseFloat(x); };
const fmtTc = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const moodPt = m => ({ epic: 'épica', dramatic: 'dramática', emotional: 'emocionante', upbeat: 'animada', electronic: 'eletrônica', atmospheric: 'atmosférica', slow: 'mais lento', fast: 'mais rápido', reflective: 'reflexiva' })[m] || m;
const sfxPt = k => ({ impact: 'impacto', whoosh: 'whoosh', riser: 'subida (riser)', boom: 'explosão', pop: 'pop', ding: 'ding', clap: 'palmas', sinos: 'sinos de Natal' })[k] || k;
const shapePt = k => ({ circle: 'círculo', arc: 'arco', wave: 'onda', badge: 'selo', spiral: 'espiral' })[k] || k;
const langPt = k => ({ pt: 'português', en: 'inglês', es: 'espanhol', fr: 'francês' })[k] || k;


// ======================= REGRAS NOVAS (banco ampliado) =======================
// Tempo na tela (prévia) → tempo no arquivo original, usando o plano atual.
function outToSrc(plan, t) {
  if (!plan) return null;
  const c = plan.clips.find(c => t >= c.start - 1e-3 && t < c.start + c.dur) || plan.clips[plan.clips.length - 1];
  if (!c) return null;
  const cv = (c.covers || []).find(x => t >= c.start + x.offset && t < c.start + x.offset + x.len);
  const sp = typeof c.speed === 'number' ? c.speed : 1;
  return { srcId: c.srcId, t: c.in + (t - c.start) * (c.speed === 'freeze' ? 0 : sp), clip: c, cover: cv || null };
}
function rangeToSrc(plan, a, b) {
  if (!plan) return [{ srcId: '*', from: a, to: b }];
  const out = [];
  for (const c of plan.clips) {
    const s0 = Math.max(a, c.start), s1 = Math.min(b, c.start + c.dur);
    if (s1 - s0 < 0.04 || c.speed === 'freeze') continue;
    const sp = typeof c.speed === 'number' ? c.speed : 0.7;
    out.push({ srcId: c.srcId, from: c.in + (s0 - c.start) * sp, to: c.in + (s1 - c.start) * sp });
  }
  return out;
}
const fmtTc2 = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function extraRules({ s, text, spec, prev, ctx, said, warn, ask, set, changed, styleHits, eff }) {
  const cur = eff();
  const over = spec.over;
  const plan = ctx.plan || null;
  const quoted = [...String(text).matchAll(/["“”']([^"“”']{1,90})["“”']/g)].map(x => x[1]);
  const neg = re => new RegExp(`\\b(sem|tira|tire|remove|remova|nao|no|without|desliga)\\b.{0,14}${re}`).test(s);

  // --- assunto/gênero vira estilo (quando nenhum estilo foi dito) ---
  if (!styleHits.length) {
    for (const [re, t] of TOPIC_STYLE) if (re.test(s)) {
      spec.mix = [{ id: t.mix, w: 1 }]; set('color.look', t.look); if (!spec.music.mood) spec.music.mood = t.mood;
      said.push(`${t.say}: estilo ${PRESETS[t.mix].label}, cor ${LOOKS[t.look].label.toLowerCase()}`); break;
    }
  }
  // --- "mais cinematográfico", "mais cara de documentário" (mistura com o atual) ---
  if (prev) {
    const m = s.match(/\b(mais|more)\s+(cara de |estilo |jeito de |pegada de |vibe de |clima de |like a? ?)?(cinematografic\w*|cinema|cinematic|documentari\w*|documentary|emocion\w*|emotional|acao|action|epic\w*|comercial|commercial|viral|tiktok|youtuber|luxo\w*|luxury|elegante|natural|minimalista|vintage|retro|profission\w*|professional|premium)\b/);
    if (m) {
      const w = m[3];
      const id = /cinem/.test(w) ? 'cinematic' : /doc/.test(w) ? 'documentary' : /emoc|emot/.test(w) ? 'emotional' : /acao|action/.test(w) ? 'action' : /epic/.test(w) ? 'trailer' : /comerc|commerc|profiss|profess|premium/.test(w) ? 'commercial' : /viral|tiktok|youtuber/.test(w) ? 'energetic' : /lux|eleg/.test(w) ? 'luxury' : /natur|minim/.test(w) ? 'minimal' : null;
      if (id && !styleHits.some(h => h.id === id)) {
        const mix = (prev.mix || []).map(x => ({ ...x, w: x.w * 0.65 }));
        const ex = mix.find(x => x.id === id); if (ex) ex.w += 0.35; else mix.push({ id, w: 0.35 });
        spec.mix = mix; said.push(`Mais ${PRESETS[id].label.toLowerCase()} (misturei 35% no estilo atual)`);
        if (/vintage|retro/.test(w)) set('color.look', 'vintage');
      }
    }
  }
  // --- luz e cor finas ---
  const adj = { ...(over.adjust || {}) }; let adjSaid = [];
  const times = /\b(bem|muito|mt|much|a lot|bastante)\b/.test(s) ? 2 : /\b(um pouco|pouquinho|levemente|slightly|a bit|leve)\b/.test(s) ? 0.5 : 1;
  if (/ajuste clarear/.test(s)) { adj.exposure = (adj.exposure || 0) + 0.22 * times; adjSaid.push('mais claro'); }
  if (/ajuste escurecer/.test(s)) { adj.exposure = (adj.exposure || 0) - 0.22 * times; adjSaid.push('mais escuro'); }
  if (/ajuste saturar/.test(s)) { adj.saturation = (adj.saturation || 1) * (1 + 0.22 * times); adjSaid.push('cores mais vivas'); }
  if (/ajuste dessaturar/.test(s)) { adj.saturation = (adj.saturation || 1) * (1 - 0.2 * times); adjSaid.push('cores mais suaves'); }
  if (/ajuste esquentar/.test(s)) { adj.temp = (adj.temp || 0) + 0.07 * times; adjSaid.push('mais quente'); }
  if (/ajuste esfriar/.test(s)) { adj.temp = (adj.temp || 0) - 0.07 * times; adjSaid.push('mais frio'); }
  if (/ajuste contraste mais/.test(s)) { adj.contrast = (adj.contrast || 1) * (1 + 0.12 * times); adjSaid.push('mais contraste'); }
  if (/ajuste contraste menos/.test(s)) { adj.contrast = (adj.contrast || 1) * (1 - 0.1 * times); adjSaid.push('menos contraste'); }
  if (/\b(vinheta|vignette|bordas escuras)\b/.test(s)) { adj.vignette = neg('(vinheta|vignette|bordas escuras)') ? 0 : 0.35; adjSaid.push(adj.vignette ? 'vinheta' : 'sem vinheta'); }
  if (/\b(granulad|grain|granulacao)\w*/.test(s) && neg('(granulad|grain)')) { adj.grain = 0; adjSaid.push('sem granulado'); }
  if (/\b(cor original|sem filtro|tira o filtro|remove the filter|no filter|cores? naturais?|deixa natural|mais natural|cor natural|natural colou?rs?)\b/.test(s) || (/\b(nao gostei|nao curti|feia|estranha|errada)\b.{0,12}\b(cor|cores|filtro|colou?r)\b/.test(s))) { set('color.look', 'natural'); delete adj.saturation; delete adj.temp; adjSaid.push('cor natural'); }
  if (/\bmenos transicoes\b/.test(s)) { set('transitions.mix', { cut: 0.85, dissolve: 0.15 }); said.push('Menos transições, mais cortes secos'); }
  if (/\bmenos efeitos\b/.test(s)) { set('effects.punchIn', Math.min(cur.effects.punchIn, 0.15)); set('effects.shake', 0); set('effects.flash', 0); }
  if (adjSaid.length) { set('adjust', adj); said.push('Imagem: ' + adjSaid.join(', ')); }
  // --- tremido: ainda não estabiliza; evita as tomadas tremidas ---
  if (/\b(tremend\w*|tremid\w*|treme|tremer|balanc\w*|shaky|shaking|estabiliz\w*|stabiliz\w*)\b/.test(s) && !/\btremor\b/.test(s)) {
    set('avoidShaky', true); said.push('Evitar as tomadas tremidas');
    warn.push('Ainda não estabilizo a imagem. Deixei de fora os trechos tremidos sempre que há outro material para usar.');
  }
  // --- enquadramento ---
  if (/enquadrar inteiro/.test(s)) { set('fit', true); said.push('Mostrar o vídeo inteiro, com fundo desfocado (sem cortar as laterais)'); }
  if (/enquadrar preencher/.test(s)) { set('fit', false); said.push('Preencher a tela (corta as laterais seguindo a pessoa)'); }
  if (/\bespelhar\b/.test(s)) { set('mirror', !neg('espelhar') && !(prev && prev.over && prev.over.mirror)); said.push(over.mirror ? 'Imagem espelhada' : 'Imagem sem espelhar'); }
  // --- manchete, barra, pulso, ênfase, muletas ---
  if (/\bmanchete\b/.test(s)) {
    if (neg('manchete')) { spec.headline = null; said.push('Sem manchete'); }
    else {
      const txt = quoted.find(q => !spec.texts.some(t => t.text === q)) || (spec.headline && spec.headline.text);
      if (txt) { spec.headline = { text: txt, all: /\b(video (todo|inteiro)|o tempo todo|sempre|whole video|all the time)\b/.test(s), style: spec._headlineStyle || (/\b(sem caixa|grande|bold|contorno)\b/.test(s) ? 'bold' : 'box') }; if (spec.title === txt) spec.title = null; said.push(`Manchete no topo: "${txt}"${spec.headline.all ? ' (o vídeo todo)' : ' (primeiros segundos)'}`); }
      else ask.push('Qual frase vai na manchete? Escreva entre aspas, por exemplo: manchete "3 erros que você comete".');
    }
  }
  if (/barra de progresso/.test(s)) { const off = neg('barra de progresso'); set('progressBar', !off); said.push(off ? 'Sem barra de progresso' : 'Barra de progresso no topo'); }
  if (/pulso na batida/.test(s)) { const off = neg('pulso'); const k = off ? 0 : /\b(forte|forte|strong|bem|muito)\b/.test(s) ? 1 : /\b(leve|sutil|subtle|pouco)\b/.test(s) ? 0.4 : 0.7; set('beatPulse', k); set('pacing.beatSync', true); said.push(off ? 'Sem pulso na batida' : 'Zoom pulsando na batida da música'); }
  if (/zoom nas palavras fortes/.test(s)) { set('emphasisZoom', !neg('zoom')); said.push('Zoom rápido nas palavras fortes (usa a legenda)'); }
  if (/\bmuletas\b/.test(s) && /\b(tira|tire|remove|remova|sem|corta|limpa|elimina|without|cut)\b|^\s*muletas/.test(s)) { set('fillers', true); said.push('Tirar "ahn", muletas e palavras repetidas (usa a transcrição)'); }
  if (/\b(repetic|repetid|repete|repeated)\w*/.test(s) && /\b(tira|remove|sem|corta|cut)\b/.test(s)) { set('fillers', true); if (!said.some(x => x.startsWith('Tirar "ahn"'))) said.push('Tirar palavras repetidas (usa a transcrição)'); }
  // --- volumes ---
  const au = spec.audio;
  if (/sem som original/.test(s)) { au.muteOriginal = true; said.push('Som original dos vídeos desligado (fica só música e efeitos)'); }
  if (/\b(volta|liga|com|mantem|keep|restore)\s+(o )?(som|audio) original\b/.test(s)) { au.muteOriginal = false; said.push('Som original ligado'); }
  if (/voz mais alta/.test(s)) { au.originalDb = Math.min(12, (au.originalDb || 0) + 4); au.musicDb = Math.max(-20, (au.musicDb || 0) - 3); said.push('Voz mais alta, música um pouco mais baixa'); }
  if (/voz mais baixa/.test(s)) { au.originalDb = Math.max(-20, (au.originalDb || 0) - 4); said.push('Voz mais baixa'); }
  if (/musica mais baixa/.test(s)) { au.musicDb = Math.max(-24, (au.musicDb || 0) - 5 * (times === 2 ? 1.6 : times)); said.push('Música mais baixa'); }
  if (/musica mais alta/.test(s)) { au.musicDb = Math.min(12, (au.musicDb || 0) + 4 * (times === 2 ? 1.6 : times)); said.push('Música mais alta'); }
  if (/\befeitos sonoros\b.{0,15}\b(mais baixos?|baixinhos?|quieter)\b/.test(s)) { au.sfxDb = (au.sfxDb || 0) - 5; said.push('Efeitos sonoros mais baixos'); }
  if (/\befeitos sonoros\b.{0,15}\b(mais altos?|louder)\b/.test(s)) { au.sfxDb = (au.sfxDb || 0) + 4; said.push('Efeitos sonoros mais altos'); }
  if (/\b(mais|more)\s+efeitos sonoros\b/.test(s)) { set('sfx.density', clamp(cur.sfx.density * 1.6 + 0.15, 0, 1)); said.push('Mais efeitos sonoros'); }
  if (/\b(menos|less|fewer)\s+efeitos sonoros\b/.test(s)) { set('sfx.density', cur.sfx.density * 0.45); said.push('Menos efeitos sonoros'); }
  // --- legenda: posição, tamanho, cor, fonte ---
  if (/\blegenda\b/.test(s)) {
    const cy = over.captionY != null ? over.captionY : 0.62;
    if (/\b(sobe|subir|suba|mais pra cima|mais para cima|move (it )?up|higher|levanta)\b/.test(s)) { set('captionY', clamp(cy - 0.2, 0.18, 0.85)); said.push('Legenda mais para cima'); }
    else if (/\b(desce|descer|desca|mais pra baixo|mais para baixo|move (it )?down|lower)\b/.test(s) || /\b(em cima|alta|no alto) demais\b/.test(s)) { set('captionY', clamp(cy + 0.14, 0.18, 0.85)); said.push('Legenda mais para baixo'); }
    else if (/\b(cobrindo|tampando|em cima d[oa]|covering) (a |o |minha |meu |the )?(cara|rosto|boca|face)\b/.test(s)) { set('captionY', 0.8); said.push('Legenda para baixo, longe do rosto'); }
    else if (/\b(em cima|no topo|na parte de cima|la em cima|top|acima)\b/.test(s)) { set('captionY', 0.24); said.push('Legenda em cima'); }
    else if (/\b(no meio|centro|centralizad|middle|center)\b/.test(s)) { set('captionY', 0.5); said.push('Legenda no meio'); }
    else if (/\b(embaixo|em baixo|na parte de baixo|bottom|mais pra baixo|mais para baixo)\b/.test(s)) { set('captionY', 0.78); said.push('Legenda embaixo'); }
    if (/\b(maior|maiores|grande|grandes|gigante|bigger|larger|big|huge|enorme)\b/.test(s)) { set('captionScale', clamp((over.captionScale || 1) * 1.25, 0.5, 2)); said.push('Legenda maior'); }
    if (/\b(menor|menores|pequena|pequenas|smaller|discreta)\b/.test(s)) { set('captionScale', clamp((over.captionScale || 1) * 0.8, 0.5, 2)); said.push('Legenda menor'); }
    const cm = s.match(/\b(amarel\w*|yellow|verde|green|vermelh\w*|red|azul|blue|rosa|pink|branc\w*|white|laranja|orange|roxo|purple)\b/);
    if (cm && new RegExp(`\\b(sem|tira|tire|nada de|no)\\s+(o |a |cor )?${cm[1]}`).test(s)) cm.length = 0;
    if (cm && cm[1]) { const col = { amarel: '#FFE81F', yellow: '#FFE81F', verde: '#3DFF6E', green: '#3DFF6E', vermelh: '#FF3B3B', red: '#FF3B3B', azul: '#4DD9FF', blue: '#4DD9FF', rosa: '#FF2BD6', pink: '#FF2BD6', branc: '#FFFFFF', white: '#FFFFFF', laranja: '#FF8A1F', orange: '#FF8A1F', roxo: '#9B5CFF', purple: '#9B5CFF' }[Object.keys({ amarel: 1, yellow: 1, verde: 1, green: 1, vermelh: 1, red: 1, azul: 1, blue: 1, rosa: 1, pink: 1, branc: 1, white: 1, laranja: 1, orange: 1, roxo: 1, purple: 1 }).find(k => cm[1].startsWith(k))]; set('captionColor', col); said.push('Destaque da legenda em ' + cm[1]); }
    const fm = s.match(/\b(montserrat|anton|bebas|bangers|luckiest|archivo|oswald|poppins|playfair|caveat|marker|rubik|space mono|lilita|inter|lora)\b/);
    if (!fm && /\b(letra|fonte|font)\b/.test(s) || /\b(mais )?(grossa|grosso|negrito|bold|pesada|forte|gordinha)\b.{0,12}\b(legenda|letra|fonte)\b|\b(legenda|letra|fonte)\b.{0,25}\b(grossa|grosso|negrito|bold|pesada|gordinha)\b/.test(s)) {
      const fw = /\b(grossa|grosso|negrito|bold|pesada|gordinha|impacto|forte)\b/.test(s) ? 'anton' : /\b(fina|fininha|leve|delicada|elegante|thin|light)\b/.test(s) ? 'playfair' : /\b(maquina de escrever|typewriter|mono)\b/.test(s) ? 'spacemono' : /\b(escrita a mao|manuscrita|cursiva|handwritten|caneta)\b/.test(s) ? 'caveat' : /\b(divertida|engracada|cartoon|desenho|quadrinho|comic)\b/.test(s) ? 'bangers' : /\b(estreita|alta e fina|condensada|condensed)\b/.test(s) ? 'bebas' : /\b(redonda|arredondada|fofa|rounded)\b/.test(s) ? 'lilita' : /\b(marcador|pincel|grafite|marker)\b/.test(s) ? 'marker' : null;
      if (fw) { set('captionFont', fw); said.push('Fonte da legenda: ' + fw); }
    }
    if (fm) { set('captionFont', { 'space mono': 'spacemono', rubik: 'rubikmono', luckiest: 'luckiest', marker: 'marker' }[fm[1]] || fm[1]); said.push('Fonte da legenda: ' + fm[1]); }
  }
  // --- referência ---
  if (/\b(igual|parecid\w*|no estilo d[oa]|tipo o|tipo a|like|same as|similar to|copiando|copia o estilo|baseado n[oa]|inspirado n[oa])\b.{0,30}\b(referencia|reference|esse video|esse outro|aquele video|video que (eu )?(mandei|subi)|video modelo|modelo)\b/.test(s)) {
    spec._useRef = true; said.push('Copiar o jeito do vídeo de referência (ritmo, cor e energia)');
  }
  // --- outra opção / exportar ---
  if (/\b(outra (opcao|versao|tentativa)|tenta de novo|tenta outra|de novo diferente|surpreende|shuffle|another (version|option|take)|try again|refaz|refazer)\b/.test(s)) { spec._reroll = true; said.push('Outra montagem com as mesmas regras'); }
  if (/^\s*((gostei|curti|ficou (bom|otimo|perfeito|top|show)|perfeito|show|top|massa|ta (bom|otimo|perfeito)|ok|beleza|amei)\W*\s*)?(pode |ja pode |agora |entao |ok |beleza |show |so )?(exporta|exportar|exporte|baixa|baixar|salva o video|salvar o video|export|download|finaliza|finalizar|gera o video|gerar o video)\b/.test(s)) { spec._export = true; said.push('Exportar o vídeo'); }
  // --- duração relativa ---
  if (prev && plan && /\b(mais curto|mais curta|encurta|diminui o video|menor|shorter|cut it down|resume mais)\b/.test(s) && !/legenda/.test(s) && !changed.has('target')) { const n = Math.round(plan.duration * 0.72); spec.target = { seconds: n, exact: false }; spec.outputs = spec.outputs.map(o => ({ ...o, duration: n })); said.push(`Mais curto: ${fmtDur(plan.duration)} → ~${fmtDur(n)}`); }
  if (prev && plan && /\b(mais longo|mais longa|aumenta o video|maior duracao|longer|extend it)\b/.test(s) && !changed.has('target')) { const n = Math.round(plan.duration * 1.35); spec.target = { seconds: n, exact: false }; spec.outputs = spec.outputs.map(o => ({ ...o, duration: n })); said.push(`Mais longo: ~${fmtDur(n)} (se houver material)`); }
  // --- trechos e momentos ---
  const ranges = findRanges(s);
  const pt = findPoint(s);
  if (ranges.length && /\b(tira|tire|remove|remova|corta|corte|apaga|apague|exclui|exclua|sem|elimina|cut|delete|drop)\b/.test(s)) {
    for (const r of ranges) { for (const x of rangeToSrc(plan, r.from, r.to)) spec.ops.push({ op: 'excludeSrc', ...x }); said.push(`Tirar o trecho de ${fmtTc2(r.from)} a ${fmtTc2(r.to)}`); }
  } else if (ranges.length && /\b(so|somente|apenas|only|usa so|use only)\b/.test(s)) {
    for (const r of ranges) { spec.ops.push({ op: 'keepOnly', srcId: '*', from: r.from, to: r.to }); said.push(`Usar só o trecho de ${fmtTc2(r.from)} a ${fmtTc2(r.to)} do material`); }
  }
  const firstN = s.match(/\b(so|somente|apenas|only)\b.{0,15}\b(primeiros?|first)\s+(\d+(?:\.\d+)?)\s*(min\w*|s|seg\w*|sec\w*)/);
  if (firstN) { const v = +firstN[3] * (/^min/.test(firstN[4]) ? 60 : 1); spec.ops.push({ op: 'keepOnly', srcId: '*', from: 0, to: v }); said.push(`Usar só os primeiros ${fmtDur(v)} do material`); }
  if (pt != null && /\b(abre|abrir|abra|comeca|comecar|comece|inicia|iniciar|open|start)\w*\s+(o video\s+)?(com|with|pelo|pela)\b/.test(s)) {
    const m = outToSrc(plan, pt) || { srcId: '*', t: pt };
    spec.ops.push({ op: 'hookAt', srcId: m.cover ? m.cover.srcId : m.srcId, t: m.cover ? m.cover.in + (pt - m.clip.start - m.cover.offset) : m.t }); spec.hookSeconds = spec.hookSeconds || 3;
    said.push(`Abrir com o momento de ${fmtTc2(pt)}`);
  }
  // --- melhorar geral: pacote de acabamento ---
  if (/\bmelhorar geral\b/.test(s)) {
    if (spec.hookSeconds == null) spec.hookSeconds = 3;
    set('silence.remove', true); set('sfx.density', Math.max(cur.sfx.density, 0.35)); set('sfx.onImpacts', true);
    const a2 = { ...(over.adjust || {}) }; a2.contrast = Math.max(a2.contrast || 1, 1.08); a2.saturation = Math.max(a2.saturation || 1, 1.08); a2.sharpen = Math.max(a2.sharpen || 0, 0.35); set('adjust', a2);
    if (!cur.transitions.mix.dissolve && !cur.transitions.mix.whip) set('transitions.mix', { cut: 0.75, dissolve: 0.15, zoom: 0.1 });
    said.push('Acabamento geral: gancho de 3 s, sem tempo morto, imagem mais nítida e viva, efeitos sonoros leves e transições discretas');
  }
  // --- som: equilibrar voz e música ---
  if (/\barrumar som\b/.test(s)) {
    au.originalDb = Math.max(au.originalDb || 0, 2); au.musicDb = Math.min(au.musicDb || 0, -2); set('music.duckDb', -14);
    said.push('Som equilibrado: voz na frente, música abaixando mais quando alguém fala, volume final no padrão das redes (-14 LUFS)');
  }
  // --- não gostou, sem dizer do quê ---
  if (/\bnao gostei refazer\b/.test(s)) {
    spec._reroll = true; if (!said.some(x => x.startsWith('Outra montagem'))) said.push('Outra montagem, com outras escolhas de tomadas e ritmo');
    warn.push('Se disser o que incomodou (ritmo, cor, música, legenda ou um trecho), eu mudo exatamente isso.');
  }
  // --- música: refrão / entrada tardia ---
  if (/\bmusica no refrao\b/.test(s)) { spec.music.peak = true; spec.music.start = null; said.push('Música começando na parte mais forte (refrão/drop)'); }
  if (/\bmusica entra depois\b/.test(s)) {
    const n = s.match(/(\d+(?:[.,]\d+)?)\s*(s|seg|segundos?)\b/) || s.match(/\b\d{1,2}:(\d{2})\b/);
    spec.music.enterAt = n ? +String(n[1]).replace(',', '.') : (spec.hookSeconds || 3); spec.music.none = false;
    said.push(`Música entrando só aos ${fmtN(spec.music.enterAt)} s`);
  }
  // --- palavrões ---
  if (/\bbipar palavroes\b/.test(s)) { const off = /\b(sem bip|nao (bipa|censura)|tira o bip)\b/.test(s); set('bleep', !off); said.push(off ? 'Sem bipe' : 'Bipar palavrões e esconder na legenda (usa a transcrição)'); }
  // --- enquadramento no rosto e zoom lento ---
  if (/\benquadrar rosto\b/.test(s)) { set('faceZoom', clamp((over.faceZoom || 1) * 1.12, 1, 1.5)); set('fit', false); said.push('Enquadramento mais fechado no rosto, seguindo a pessoa'); }
  if (/\b(mais aberto|mais longe|abre mais o enquadramento|afasta|zoom out|wider)\b/.test(s) && !/\bzoom lento\b/.test(s)) { set('faceZoom', clamp((over.faceZoom || 1) / 1.12, 0.85, 1.5)); said.push('Enquadramento mais aberto'); }
  if (/\bzoom lento\b/.test(s)) { set('slowPush', 1); set('noZoom', false); said.push('Zoom lento e contínuo (aproximando devagar em cada tomada)'); }
  // --- nitidez ---
  if (/\b(nitidez|nitido|nitida|sharp\w*|mais definid\w*|definicao|embacad\w*|borrad[oa] demais|ta borrad[oa]|desfocad[oa] demais)\b/.test(s)) {
    const a3 = { ...(over.adjust || {}) }; const off = neg('(nitidez|sharp)');
    a3.sharpen = off ? 0 : clamp((a3.sharpen || 0) + 0.5 * times, 0, 1.5); set('adjust', a3); said.push(off ? 'Sem nitidez extra' : 'Imagem mais nítida');
  }
  // --- barra de progresso embaixo ---
  if (/barra de progresso/.test(s) && /\b(embaixo|em baixo|na parte de baixo|bottom|rodape)\b/.test(s)) { set('progressPos', 'bottom'); set('progressBar', true); const i = said.indexOf('Barra de progresso no topo'); if (i >= 0) said[i] = 'Barra de progresso embaixo'; }
  // --- excluir o pedaço sob a linha do tempo / no meio ---
  if (plan && /\b(tira|tire|remove|remova|apaga|apague|exclui|exclua|deleta|corta fora|joga fora)\b.{0,25}\b(pedaco|parte|corte|trecho|cena|clipe|take|tomada|isso)\b/.test(s) && !ranges.length && !/\b(silencio|pausa|ahn|muleta|texto|legenda|musica|som)\b/.test(s)) {
    let pt2 = relPoint(s, plan, ctx); if (pt2 == null && ctx.t != null && /\b(esse|este|essa|esta|isso|this|that)\b/.test(s)) pt2 = ctx.t;
    if (pt2 != null) { const c = plan.clips.find(x => pt2 >= x.start - 0.001 && pt2 < x.start + x.dur); if (c) { spec.ops.push({ op: 'deleteClip', srcId: c.srcId, in: c.in }); said.push(`Excluir o corte de ${fmtTc2(c.start)} a ${fmtTc2(c.start + c.dur)}`); } }
    else ask.push('Qual pedaço? Arraste a linha do tempo até ele e diga "tira esse pedaço", ou diga o tempo: "tira de 0:10 a 0:15".');
  }
  // --- fonte da legenda sem a palavra "legenda" ---
  if (!/\blegenda\b/.test(s) && /\b(letra|letras|fonte|font)\b/.test(s)) {
    const fw = /\b(grossa|grosso|negrito|bold|pesada|gordinha|impacto|forte)\b/.test(s) ? 'anton' : /\b(fina|finas|fininha|leve|delicada|elegante|elegantes|thin|light|serifa)\b/.test(s) ? 'playfair' : /\b(maquina de escrever|typewriter|mono)\b/.test(s) ? 'spacemono' : /\b(escrita a mao|manuscrita|cursiva|handwritten|caneta)\b/.test(s) ? 'caveat' : /\b(divertida|engracada|cartoon|desenho|quadrinho|comic)\b/.test(s) ? 'bangers' : /\b(estreita|condensada|condensed|alta)\b/.test(s) ? 'bebas' : /\b(redonda|arredondada|fofa|rounded)\b/.test(s) ? 'lilita' : /\b(marcador|pincel|grafite|marker)\b/.test(s) ? 'marker' : null;
    if (fw) { set('captionFont', fw); said.push('Fonte da legenda: ' + fw); }
    if (/\b(maior|maiores|grande|grandes)\b/.test(s)) { set('captionScale', clamp((over.captionScale || 1) * 1.2, 0.5, 2)); said.push('Letra maior'); }
    if (/\b(menor|menores|pequena|pequenas)\b/.test(s)) { set('captionScale', clamp((over.captionScale || 1) * 0.82, 0.5, 2)); said.push('Letra menor'); }
  }
  // --- várias durações de uma vez: "um de 15 e um de 60 segundos" ---
  const md = s.match(/\b(\d+(?:\.\d+)?)\s*(s|seg|segundos?|min|minutos?)?\s*(?:,|e|and)\s*(?:(?:um|uma|outra|outro|another|one)\s+)?(?:(?:versao|corte|video)\s+)?(?:de\s+|of\s+)?(\d+(?:\.\d+)?)\s*(s|seg|segundos?|seconds?|min|minutos?|minutes?)?\b(?:\s*(?:,|e|and)\s*(?:(?:um|uma|outra|outro)\s+)?(?:de\s+)?(\d+(?:\.\d+)?)\s*(s|seg|segundos?|min|minutos?)?)?/);
  if (md && (md[2] || md[4]) && !ranges.length && /\b(versao|versoes|corte|cortes|video|videos|reels|tiktok|shorts|um de|uma de|outra|outro|formatos?|edic\w*|cut|cuts|version)\b/.test(s)) {
    const unitOf = u => /^min/.test(u || '') ? 60 : 1;
    const lastU = md[4] || md[2];
    const ds = [[md[1], md[2] || lastU], [md[3], md[4]], md[5] ? [md[5], md[6] || lastU] : null].filter(Boolean).map(([v, u]) => Math.round(+v * unitOf(u)));
    const uniq = [...new Set(ds)].filter(x => x >= 3 && x <= 3600);
    if (uniq.length >= 2) {
      const plat = (spec.outputs[0] && spec.outputs[0].platform) || 'reels';
      spec.outputs = uniq.map(d => ({ platform: plat, duration: d, exact: false })); spec.target = null; changed.add('outputs');
      for (let i = said.length - 1; i >= 0; i--) if (/^(Duração final|Formato:)/.test(said[i])) said.splice(i, 1);
      said.push(`${uniq.length} cortes: ${uniq.map(fmtDur).join(' e ')} (${PLATFORMS[plat].label})`);
    }
  }
  // --- tipo de transição pelo nome ---
  const tn = s.match(/\btransic\w*\s+(?:de |com |em |tipo |estilo )?(zoom|chicote|whip|glitch|flash|clarao|fade|dissolve|dissolvencia|suave|mergulho|preto|fusao|corte seco|ventilador|papel rasgando|papel rasgado|papel de presente|rasgando|rasgo)\b|\b(zoom|chicote|whip|glitch|flash|fade|dissolve|fusao|ventilador|fan|rasgo|paper tear|paper rip)\s+(?:nas |de |como |entre as )?transic/);
  if (tn) {
    const k = tn[1] || tn[2];
    const id = { zoom: 'zoom', chicote: 'whip', whip: 'whip', glitch: 'glitch', flash: 'flash', clarao: 'flash', fade: 'dissolve', dissolve: 'dissolve', dissolvencia: 'dissolve', suave: 'dissolve', fusao: 'dissolve', mergulho: 'dip', preto: 'dip', 'corte seco': 'cut', ventilador: 'fan', fan: 'fan', 'papel rasgando': 'rasgo', 'papel rasgado': 'rasgo', 'papel de presente': 'rasgo', rasgando: 'rasgo', rasgo: 'rasgo', 'paper tear': 'rasgo', 'paper rip': 'rasgo' }[k];
    if (id && id !== 'cut') {
      set('transitions.mix', { cut: 0.4, [id]: 0.6 }); set('transitions.dur', id === 'dissolve' || id === 'dip' ? 0.5 : id === 'rasgo' ? 0.55 : id === 'fan' ? 0.4 : 0.25);
      for (let i = said.length - 1; i >= 0; i--) if (/^(Transições|Mais transições|Zoom de ênfase)/.test(said[i])) said.splice(i, 1);
      said.push(`Transições de ${{ zoom: 'zoom', whip: 'chicote (whip pan)', glitch: 'glitch', flash: 'flash', dissolve: 'fusão suave', dip: 'mergulho no preto', fan: 'ventilador (pás girando na frente)', rasgo: 'papel rasgando' }[id]}`);
    }
  }
  // --- legenda só nas palavras importantes ---
  if (/\blegenda\b/.test(s) && /\b(so|somente|apenas|only)\b.{0,20}\b(palavras?|words?)\s+(importantes?|chave|fortes?|principais|key|important)\b/.test(s)) { set('captionKeywords', true); said.push('Legenda só nas palavras-chave, uma por vez'); }
  if (/\blegenda\b/.test(s) && /\b(todas as palavras|tudo que (eu )?falo|completa|inteira|every word|all words)\b/.test(s)) { set('captionKeywords', false); said.push('Legenda com todas as palavras'); }
  if (/\blegenda\b.{0,25}\b(minimalista|calm[oa]|minuscul)/.test(s) && ['dinamico', 'calmo'].includes(spec.captions.style)) { const i = said.findIndex(x => x.startsWith('Estilo: ')); if (i >= 0) { said.splice(i, 1); spec.mix = deepClone(prev ? prev.mix : spec.mix); } }
  momentRules({ s, spec, prev, plan, ctx, said, ranges });
  if (/\b(corta|tira|remove)\s+(o |os )?(ultimos?|final|last)\s+(\d+(?:\.\d+)?)\s*(s|seg\w*|sec\w*)/.test(s) && plan) {
    const n = +s.match(/(\d+(?:\.\d+)?)\s*(s|seg|sec)/)[1]; const tgt = Math.max(3, plan.duration - n);
    spec.target = { seconds: tgt, exact: true }; spec.outputs = spec.outputs.map(o => ({ ...o, duration: tgt, exact: true })); said.push(`Cortar ${fmtN(n)} s do final (fica ${fmtDur(tgt)})`);
  }
}
