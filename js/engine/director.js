// O DIRETOR: transforma um pedido em português ou inglês numa especificação de edição estruturada.
// Não é um modelo de IA. São regras escritas à mão que entendem os pedidos mais comuns,
// dizem o que entenderam e avisam quando algo ficou de fora.
import { PRESETS, LOOKS, blendPresets } from './styles.js';
import { PLATFORMS } from './platforms.js';
import { deepClone, clamp } from './util.js';

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
  s = s.replace(/\b(\d+) minutos? e meio\b/g, (_, n) => `${+n * 60 + 30} segundos`);
  s = s.replace(/\b(zero|um|uma|one|dois|duas|two|tres|three|quatro|four|cinco|five|seis|six|sete|seven|oito|eight|nove|nine|dez|ten|quinze|fifteen|vinte|twenty|trinta|thirty|quarenta|forty|cinquenta|fifty|sessenta|sixty|noventa|ninety)\b(?=\s*(-|\s)\s*([a-z]+\s+)?(h|hora|horas|hour|hours|min|minutos?|minutes?|s|seg|segundos?|sec|seconds?|versoes|versions|versao|version|impactos?|impacts?|aberturas|openings|alternative|whooshes?|cortes|cuts|transic|transit|explosoes|explosions|booms?|risers?)\b)/g, (m, w) => NUMW[w] != null ? String(NUMW[w]) : m);
  return s.replace(/\s+/g, ' ').trim();
}

const UNIT = '(h|hrs?|horas?|hours?|min|mins|minutos?|minutes?|s|seg|segs|segundos?|sec|secs|seconds?)';
const toSec = (n, u) => /^h/.test(u) ? n * 3600 : /^min/.test(u) ? n * 60 : n;

// ---------- vocabulário ----------
const STYLE_WORDS = [
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
];
const LANG = { portugues: 'pt', portuguese: 'pt', ingles: 'en', english: 'en', espanhol: 'es', spanish: 'es', frances: 'fr', french: 'fr' };

const CUT_CTX = /\b(cortes?|cuts?|shots?|tomadas?|planos?|takes?|cenas?|clipes?|trechos?|por corte|per cut|each cut|cada corte|shot length|duracao (media|de cada))\b/;
const VIDEO_CTX = /\b(video|videos|versao|versoes|version|versions|reel|reels|tiktok|shorts?|clip|resumo|highlight|highlights|trailer|teaser|filme|edit|edicao|duracao|duration|long|longo|corte final|final cut|transform|transforma|turn|make|faz|faca|fazer|em|into|de|a|an)\b/;

function ctxAround(s, idx, len, before = 42, after = 34) {
  return { pre: s.slice(Math.max(0, idx - before), idx), post: s.slice(idx + len, idx + len + after) };
}
const has = (s, re) => re.test(s);

// ---------- intérprete ----------
export function interpret(text, prev) {
  const spec = deepClone(prev || newSpec());
  const s = norm(text);
  const said = [];      // o que entendi (pt-BR)
  const warn = [];      // avisos e limitações
  const ask = [];       // dúvidas para o usuário
  const changed = new Set();
  const over = spec.over;
  const set = (path, val) => { const ks = path.split('.'); let o = over; ks.slice(0, -1).forEach(k => { o[k] = o[k] || {}; o = o[k]; }); o[ks[ks.length - 1]] = val; changed.add(path); };
  const eff = () => resolveStyle(spec);
  const isFollowUp = !!prev;

  // ------ desfazer/recomeçar não é aqui (a interface trata), mas reconhecemos ------
  if (/^(desfaz|desfazer|volta|undo|reverte)/.test(s)) return { spec: prev || spec, said: ['Desfazer'], warn, ask, undo: true };

  // ------ estilos com porcentagem: "70% documentario e 30% acao" ------
  // trechos que falam de UMA parte (final, momentos, cor, transição) não mudam o estilo geral
  const sStyle = s
    .replace(/\b(color grading|grading|cor|colou?r|look|transic\w*|transitions?|trilha|musicas?|music|songs?|legendas?|captions?|subtitles?)\s+(\w+\s+)?(cinematograf\w*|cinematic|epic\w*|dramatic\w*|emocion\w*|emotional|profission\w*)/g, ' ')
    .replace(/\b(cinematic|cinematograf\w*|epic\w*|dramatic\w*)\s+(transitions?|transic\w*|colou?r|grading|look|music|musica|soundtrack|trilha|impacts?)\b/g, ' ')
    .replace(/\b(final|ending|fim|end|ultimos?\s+\d+\s+\w+|last\s+\d+\s+\w+|final\s+\d+\s+\w+)\s+(\w+\s+){0,2}(mais\s+)?(emocion\w*|emotional|epic\w*|marcante|bonit\w*)/g, ' ')
    .replace(/\b(momentos?|moments?|partes?|cenas?)\s+(\w+\s+)?(emocion\w*|emotional|exciting|agitad\w*|tens\w*)/g, ' ')
    .replace(/\b(emocion\w*|emotional|exciting)\s+(momentos?|moments?|partes?|parts?|cenas?|scenes?)/g, ' ')
    .replace(/\bhighlight reels?\b/g, ' ');
  const pctStyles = [];
  const pctRe = /(\d{1,3})\s*%\s*(?:de\s+|of\s+)?([a-z\s-]{3,40})/g; let m;
  while ((m = pctRe.exec(sStyle))) {
    const chunk = m[2].split(/\b(e|and|com|with|\+)\b/)[0];
    const ids = STYLE_WORDS.filter(([, re]) => re.test(chunk)).map(([id]) => id);
    ids.forEach(id => pctStyles.push({ id, w: +m[1] / 100 / ids.length }));
  }
  let styleHits = [];
  if (pctStyles.length) styleHits = pctStyles;
  else {
    for (const [id, re] of STYLE_WORDS) if (re.test(sStyle)) styleHits.push({ id, w: 1 });
    // "cinematico e emocional" = os dois; "acao" + "trailer" = trailer pesa mais
    if (styleHits.some(h => h.id === 'trailer') && styleHits.some(h => h.id === 'action')) styleHits = styleHits.map(h => h.id === 'action' ? { ...h, w: 0.5 } : h);
    // "social" genérico perde para estilos específicos
    if (styleHits.length > 1) styleHits = styleHits.filter(h => h.id !== 'social' || styleHits.length === 1);
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
      const after = pre.slice(-30) + ' ' + post.slice(0, 60) + ' ' + s.slice(d.idx + d.len, d.idx + d.len + 70);
      if (/\b(lent|devagar|slow|calm|desaceler)/.test(after)) { spec.sections.push({ from: 0, to: d.v, pace: 'slow' }); said.push(`Primeiros ${fmtN(d.v)} s mais lentos`); }
      else if (/\b(rapid|fast|dinamic|dynamic|acelerad|intens|frenetic)/.test(after)) { spec.sections.push({ from: 0, to: d.v, pace: 'fast' }); spec.hookSeconds = d.v; said.push(`Primeiros ${fmtN(d.v)} s bem dinâmicos, com gancho`); }
      else { spec.hookSeconds = d.v; said.push(`Gancho forte nos primeiros ${fmtN(d.v)} s`); }
      continue;
    }
    // últimos / final N segundos
    if (/\b(ultimos?|last|finais|final|end|ending|fim)\b/.test(pre.slice(-22)) && d.v <= 60) {
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
      const d = durForPlatform.get(p.idx);
      const key = p.id + '|' + (d ? d.v : '');
      if (seen.has(key)) continue; seen.add(key);
      outs.push({ platform: p.id, duration: d ? d.v : null, exact: d ? d.exact : false });
    }
    // mesma plataforma sem duração repetida some
    spec.outputs = outs; changed.add('outputs');
    said.push('Formato: ' + outs.map(o => PLATFORMS[o.platform].label + (o.duration ? ` (${fmtDur(o.duration)})` : '')).join(', '));
    if (outs.length === 1 && outs[0].duration && !spec.target) spec.target = { seconds: outs[0].duration, exact: outs[0].exact };
  }
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
  const vm = s.match(/(\d+)\s+(\w+\s+)?(versoes|versions|interpretac\w*|variac\w*|variations|opcoes|options)\b/);
  if (vm) { spec.versions = clamp(+vm[1], 1, 4); spec.versionsKind = 'styles'; said.push(`${spec.versions} versões diferentes para comparar`); }

  // ------ música ------
  if (/\b(sem musica|no music|without music|tira a musica|remove the music|sem trilha)\b/.test(s)) { spec.music.none = true; said.push('Sem música'); }
  else {
    for (const [id, re] of MOOD_WORDS) {
      const r = new RegExp(`\\b(musica|music|trilha|soundtrack|song|track)s?\\b.{0,20}(?:${re.source})|(?:${re.source})\\w*\\s+(\\w+\\s+)?(musica|music|trilha|soundtrack|songs?|tracks?)\\b`);
      if (r.test(s)) { spec.music.mood = id; spec.music.none = false; said.push(`Trilha ${moodPt(id)}`); break; }
    }
    const pm = s.match(/(aumenta|aumentar|increase|sobe|subir|raise|boost|diminui|diminuir|decrease|baixa|abaixa|lower|reduce|reduz)\w*\s+(?:a\s+|the\s+)?(?:intensidade da |music intensity|musica|music|volume da musica|trilha)\D{0,25}(\d+)\s*%/);
    if (pm) { const sign = /diminu|decrease|baix|lower|reduc|reduz/.test(pm[1]) ? -1 : 1; spec.music.intensity = clamp(spec.music.intensity + sign * (+pm[2]) / 100, -1, 1); said.push(`Música ${sign > 0 ? '+' : '−'}${pm[2]}% de intensidade`); }
    else if (/\b(musica|music|trilha)\b.{0,25}\b(mais intens|more intense|mais alta|louder|mais forte|stronger|mais pesad)/.test(s) || /\b(mais|more)\s+(dramatic|intens|epic)\w*\s+(musica|music)/.test(s) || /\badd more dramatic music\b/.test(s)) { spec.music.intensity = clamp(spec.music.intensity + 0.25, -1, 1); if (!spec.music.mood && /dramatic/.test(s)) spec.music.mood = 'dramatic'; said.push('Música mais intensa (+25%)'); }
    else if (/\b(musica|music|trilha)\b.{0,25}\b(mais baixa|quieter|mais suave|softer|menos|lower)/.test(s)) { spec.music.intensity = clamp(spec.music.intensity - 0.25, -1, 1); said.push('Música mais baixa (−25%)'); }
    if (/\b(musica|music|audio|som|trilha)\b.{0,30}\b(do|deste|desse|from (this|the|that)|of (this|the))\b.{0,12}\b(video|clip|arquivo)/.test(s)) { spec.music.fromVideo = true; said.push('Usar a música tirada de um vídeo seu'); }
  }
  if (/\b(audio original|original\s+(\w+\s+)?audio|som original|fala original|dialogo|dialogue|conversa)\b/.test(s) && /\b(mant|keep|preserv|100|deixa)\b/.test(s)) { spec.audio.keepDialogue = true; set('music.duckDb', -16); said.push('Fala original preservada a 100%, música abaixa quando alguém fala'); }

  // ------ efeitos sonoros ------
  const sfxMap = [['impact', /impact|impacto|pancada|hit|batida forte/], ['whoosh', /whoosh|swoosh|vento|passagem/], ['riser', /riser|subida|tensao subindo/], ['boom', /boom|explos/], ['pop', /\bpop\b|estalo/], ['ding', /ding|sininho/]];
  const cm = s.match(/(\d+)\s+(\w+\s+)?(impactos?|impacts?|whooshes|whoosh|risers?|explosoes|explosions|booms?|hits?)\b/);
  if (cm) { const kind = sfxMap.find(([, re]) => re.test(cm[3]))[0]; spec.sfxRequests.push({ kind, count: +cm[1] }); said.push(`${cm[1]} efeitos de ${sfxPt(kind)}`); }
  if (/\b(efeitos sonoros|sound effects|sfx|sound design|efeito sonoro)\b/.test(s)) {
    if (/\b(sem|no|tira|remove|menos|fewer|less)\b.{0,15}\b(efeitos sonoros|sound effects|sfx)/.test(s)) { set('sfx.density', 0.05); said.push('Quase sem efeitos sonoros'); }
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
  if (/\b(sem transic|no transitions?|so cortes secos|only hard cuts|hard cuts only)\b/.test(s)) { set('transitions.mix', { cut: 1 }); said.push('Só cortes secos, sem transições'); }
  else if (/\btransi/.test(s) && !/\b(remove|remova|tira|apaga|delete)\b.{0,20}\btransi/.test(s)) {
    if (/\b(suave|smooth|elegant|sutil|subtle|cinemat|profission|professional)/.test(s)) { set('transitions.mix', { cut: 0.55, dissolve: 0.3, dip: 0.15 }); set('transitions.dur', 0.5); said.push('Transições suaves e profissionais'); }
    else if (/\b(impact|rapid|fast|whip|chicote|dinamic|dynamic|energ)/.test(s)) { set('transitions.mix', { cut: 0.5, whip: 0.25, flash: 0.15, zoom: 0.1 }); set('transitions.dur', 0.2); said.push('Transições rápidas de impacto'); }
    else if (!changed.has('transitions.every')) { const mx = { ...cur.transitions.mix }; mx.cut = Math.max(0.4, (mx.cut || 1) - 0.25); set('transitions.mix', mx); said.push('Mais transições'); }
  }
  // remover transição num instante
  const rt = s.match(/\b(remove|remova|tira|tire|apaga|delete)\b.{0,25}\btransi\w*\b.{0,12}?(\d{1,2}:\d{2}(?:\.\d+)?|\d+(?:\.\d+)?\s*s)/);
  if (rt) { const t = parseTc(rt[2]); spec.ops.push({ op: 'removeTransition', t }); said.push(`Remover a transição em ${fmtTc(t)}`); }

  // ------ efeitos visuais ------
  const sm = s.match(/(\d+)\s*%\s*(de\s+)?(camera lenta|slow ?motion|slow-mo|slowmo)/);
  if (sm) { set('effects.slowmo', clamp(+sm[1] / 100, 0, 0.8)); said.push(`${sm[1]}% em câmera lenta`); }
  else if (/\b(sem camera lenta|no slow ?motion)\b/.test(s)) { set('effects.slowmo', 0); said.push('Sem câmera lenta'); }
  else if (/\b(camera lenta|slow ?motion|slow-mo|slowmo)\b/.test(s)) { set('effects.slowmo', Math.max(0.15, cur.effects.slowmo)); said.push('Câmera lenta nos melhores momentos'); }
  if (/\b(speed ?ramp|rampa de velocidade|acelera e desacelera|velocidade variavel)\b/.test(s)) { set('effects.speedRamp', true); said.push('Speed ramps'); }
  if (/\b(zoom|punch[- ]?in|aproxima)\b/.test(s) && !/\b(sem|no)\s+zoom/.test(s)) { set('effects.punchIn', Math.max(0.6, cur.effects.punchIn)); said.push('Zoom de ênfase (punch-in)'); }
  if (/\b(sem|no)\s+zoom/.test(s)) { set('effects.punchIn', 0); said.push('Sem zoom'); }
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
  if (/\b(maiuscul|caixa alta|uppercase|all caps|caps lock)\b/.test(s)) spec.captions.uppercase = true;

  // ------ textos com forma e títulos ------
  const quoted = [...String(text).matchAll(/["“”']([^"“”']{1,80})["“”']/g)].map(x => x[1]);
  const shapeMap = [['circle', /\b(circul|circle|redond|round|em volta|around)/], ['arc', /\b(arco|arc|curv|curved)/], ['wave', /\b(onda|wave|ondulad|wavy)/], ['badge', /\b(selo|badge|sticker|adesivo|carimbo|stamp)/], ['spiral', /\b(espiral|spiral)/]];
  for (const [shape, re] of shapeMap) {
    if (re.test(s) && /\b(texto|text|escrita|escrito|frase|palavra|letreiro|titulo|title|legenda)/.test(s)) {
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

  // ------ conflitos ------
  const e2 = resolveStyle(spec);
  if (e2.pacing.avgShot < 1.2 && spec.mix.some(x => ['documentary', 'interview', 'wedding', 'minimal'].includes(x.id)) && changed.has('pacing.avgShot'))
    warn.push(`Corte médio de ${fmtN(e2.pacing.avgShot)} s é bem rápido para ${blendPresets(spec.mix).label}. Vou respeitar o número, mas preservo as frases inteiras quando alguém fala.`);
  if (e2.pacing.minShot > e2.pacing.maxShot) { ask.push(`O mínimo por tomada (${fmtN(e2.pacing.minShot)} s) ficou maior que o máximo (${fmtN(e2.pacing.maxShot)} s). Qual vale?`); }
  if (spec.target && spec.outputs.some(o => PLATFORMS[o.platform] && spec.target.seconds > PLATFORMS[o.platform].maxDur))
    warn.push(`${fmtDur(spec.target.seconds)} passa do limite de ${spec.outputs.map(o => PLATFORMS[o.platform].label).join('/')}.`);
  if (spec.hookSeconds && spec.target && spec.hookSeconds > spec.target.seconds * 0.5) warn.push('O gancho ficou maior que metade do vídeo; vou limitar a 1/4 da duração.');

  if (!said.length && !ask.length && !spec.ops.length) ask.push('Não entendi esse pedido. Tente algo como: "corta mais rápido", "música mais intensa", "legenda palavra por palavra", "versão de 30 segundos para TikTok".');
  spec.history = [...(prev && prev.history || []), text].slice(-50);
  return { spec, said, warn, ask, followUp: isFollowUp };
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
const sfxPt = k => ({ impact: 'impacto', whoosh: 'whoosh', riser: 'subida (riser)', boom: 'explosão', pop: 'pop', ding: 'ding' })[k] || k;
const shapePt = k => ({ circle: 'círculo', arc: 'arco', wave: 'onda', badge: 'selo', spiral: 'espiral' })[k] || k;
const langPt = k => ({ pt: 'português', en: 'inglês', es: 'espanhol', fr: 'francês' })[k] || k;
