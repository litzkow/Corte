// node tests/corpus.test.mjs — banco de frases que o diretor TEM que entender (do simples ao complexo)
import { interpret as legacy, resolveStyle, newSpec } from '../js/engine/director.js';
import { interpret as brain } from '../js/engine/brain.js';
// por padrão testa o cérebro novo (conceitos + regras clássicas); CLASSICO=1 testa só as regras clássicas
const interpret = process.env.CLASSICO ? legacy : brain;

let pass = 0, fail = 0; const fails = [];
const base = interpret('reels estilo podcast').spec;
// plano falso para pedidos que apontam para um momento da prévia
const plan = { duration: 40, clips: [
  { srcId: 'A', start: 0, dur: 10, in: 5, out: 15, speed: 1 },
  { srcId: 'A', start: 10, dur: 10, in: 30, out: 40, speed: 1 },
  { srcId: 'B', start: 20, dur: 20, in: 0, out: 20, speed: 1 },
] };
function T(cmd, check, { prev = null, ctx = {} } = {}) {
  let r, ok = false;
  try { r = interpret(cmd, prev, ctx); const e = resolveStyle(r.spec); ok = !!check(r.spec, e, r); } catch (x) { ok = false; r = r || { said: ['ERRO ' + x.message] }; }
  if (ok) pass++; else { fail++; fails.push(`✗ ${cmd}\n    → ${(r.said || []).join(' | ')} ${(r.ask || []).join(' ')}`); }
}
const P = { prev: base, ctx: { plan } };
const has = (r, re) => r.said.some(x => re.test(x));
const fmt = (s, p) => s.outputs.some(o => o.platform === p);
const mixHas = (s, id) => s.mix.some(m => m.id === id);
const notUnderstood = r => r.ask.some(x => x.startsWith('Não entendi'));

// ===== 1. Simples, português =====
T('corta mais rápido', (s, e) => e.pacing.avgShot < resolveStyle(base).pacing.avgShot, P);
T('mais rápido', (s, e) => e.pacing.avgShot < resolveStyle(base).pacing.avgShot, P);
T('acelera', (s, e) => e.pacing.avgShot < resolveStyle(base).pacing.avgShot, P);
T('dá uma acelerada', (s, e) => e.pacing.avgShot < resolveStyle(base).pacing.avgShot, P);
T('ta muito lento', (s, e) => e.pacing.avgShot < resolveStyle(base).pacing.avgShot, P);
T('tá parado demais', (s, e) => e.pacing.avgShot < resolveStyle(base).pacing.avgShot, P);
T('mais dinâmico', (s, e) => e.pacing.avgShot < resolveStyle(base).pacing.avgShot, P);
T('mais lento', (s, e) => e.pacing.avgShot > resolveStyle(base).pacing.avgShot, P);
T('deixa mais calmo', (s, e) => e.pacing.avgShot > resolveStyle(base).pacing.avgShot, P);
T('tá muito acelerado', (s, e) => e.pacing.avgShot > resolveStyle(base).pacing.avgShot, P);
T('menos cortes', (s, e) => e.pacing.avgShot > resolveStyle(base).pacing.avgShot, P);
T('tira os silêncios', (s, e) => e.silence.remove);
T('remove as pausas', (s, e) => e.silence.remove);
T('corta o tempo morto', (s, e) => e.silence.remove);
T('sem música', s => s.music.none);
T('tira a música', s => s.music.none);
T('não quero música', s => s.music.none);
T('sem legenda', s => s.captions.enabled === false);
T('tira as legendas', s => s.captions.enabled === false);
T('coloca legenda', s => s.captions.enabled);
T('bota legenda', s => s.captions.enabled);
T('legenda palavra por palavra', s => s.captions.style === 'hormozi');
T('legenda karaokê', s => s.captions.style === 'karaoke');
T('legenda neon', s => s.captions.style === 'neon');
T('música mais baixa', s => s.audio.musicDb < 0, P);
T('abaixa a música', s => s.audio.musicDb < 0, P);
T('a música tá muito alta', s => s.audio.musicDb < 0, P);
T('a música tá baixa', s => s.audio.musicDb > 0, P);
T('aumenta a música', s => s.audio.musicDb > 0, P);
T('não dá pra ouvir a voz', s => s.audio.musicDb < 0 && s.audio.originalDb > 0, P);
T('aumenta a voz', s => s.audio.originalDb > 0, P);
T('tira o som original', s => s.audio.muteOriginal, P);
T('sem o som do vídeo', s => s.audio.muteOriginal, P);
T('música mais intensa', s => s.music.intensity > 0, P);
T('música épica', s => s.music.mood === 'epic');
T('música animada', s => s.music.mood === 'upbeat');
T('mais claro', (s, e) => e.adjust.exposure > 0, P);
T('tá escuro', (s, e) => e.adjust.exposure > 0, P);
T('mais escuro', (s, e) => e.adjust.exposure < 0, P);
T('cores mais vivas', (s, e) => e.adjust.saturation > 1, P);
T('mais saturado', (s, e) => e.adjust.saturation > 1, P);
T('menos cor', (s, e) => e.adjust.saturation < 1, P);
T('mais quente', (s, e) => e.adjust.temp > 0, P);
T('mais frio', (s, e) => e.adjust.temp < 0, P);
T('mais contraste', (s, e) => e.adjust.contrast > 1, P);
T('preto e branco', (s, e) => e.color.look === 'bw');
T('cor de cinema', (s, e) => e.color.look === 'hollywood' || mixHas(s, 'cinematic'));
T('estilo vintage', (s, e) => e.color.look === 'vintage');
T('espelha o vídeo', (s, e) => e.mirror === true, P);
T('mostra o vídeo inteiro', (s, e) => e.fit === true, P);
T('não corta as laterais', (s, e) => e.fit === true, P);
T('com fundo desfocado', (s, e) => e.fit === true, P);
T('barra de progresso', (s, e) => e.progressBar === true, P);
T('zoom na batida', (s, e) => e.beatPulse > 0, P);
T('pulsando com a música', (s, e) => e.beatPulse > 0, P);
T('zoom nas palavras importantes', (s, e) => e.emphasisZoom === true, P);
T('tira os ahn', (s, e) => e.fillers === true, P);
T('remove os vícios de linguagem', (s, e) => e.fillers === true, P);
T('tira as repetições', (s, e) => e.fillers === true, P);
T('efeitos sonoros', (s, e) => e.sfx.density >= 0.5);
T('mais efeitos sonoros', (s, e) => e.sfx.density > resolveStyle(base).sfx.density, P);
T('menos efeitos sonoros', (s, e) => e.sfx.density < resolveStyle(base).sfx.density, P);
T('sem efeitos sonoros', (s, e) => e.sfx.density <= 0.05, P);
T('transições suaves', (s, e) => (e.transitions.mix.dissolve || 0) > 0.2);
T('só cortes secos', (s, e) => e.transitions.mix.cut === 1);
T('sem transição', (s, e) => e.transitions.mix.cut === 1);
T('câmera lenta', (s, e) => e.effects.slowmo >= 0.15);
T('slow motion', (s, e) => e.effects.slowmo >= 0.15);
T('faixas pretas de cinema', (s, e) => e.effects.letterbox === true);
T('desfaz', (s, e, r) => r.undo === true, P);
T('volta como estava', (s, e, r) => r.undo === true, P);
T('outra versão', (s, e, r) => r.reroll === true, P);
T('exporta', (s, e, r) => r.exportNow === true, P);

// ===== 2. Formatos e durações =====
T('para o tiktok', s => fmt(s, 'tiktok'));
T('pro tiktok', s => fmt(s, 'tiktok'));
T('reels', s => fmt(s, 'reels'));
T('para os stories', s => fmt(s, 'reels'));
T('shorts do youtube', s => fmt(s, 'shorts'));
T('vídeo pro youtube', s => fmt(s, 'youtube'));
T('na horizontal', s => fmt(s, 'youtube'));
T('vertical', s => fmt(s, 'reels'));
T('quadrado', s => fmt(s, 'square'));
T('30 segundos', s => s.target && s.target.seconds === 30);
T('um minuto', s => s.target && s.target.seconds === 60);
T('vídeo de 2 minutos', s => s.target && s.target.seconds === 120);
T('minuto e meio', s => s.target && s.target.seconds === 90);
T('reels de 15s', s => fmt(s, 'reels') && s.outputs[0].duration === 15);
T('tiktok de 45 segundos', s => fmt(s, 'tiktok') && s.outputs[0].duration === 45);
T('um de 15 pro tiktok e um de 60 pro reels', s => s.outputs.length === 2);
T('mais curto', s => s.target.seconds < 40, P);
T('encurta o vídeo', s => s.target.seconds < 40, P);
T('mais longo', s => s.target.seconds > 40, P);
T('corta os últimos 5 segundos', s => s.target.seconds === 35, P);
T('exporta em 4k', s => s.export.resolution === '4k');
T('60 fps', s => s.export.fps === 60);

// ===== 3. Estilos e assuntos =====
T('estilo ação', s => mixHas(s, 'action'));
T('cinematográfico', s => mixHas(s, 'cinematic'));
T('documentário', s => mixHas(s, 'documentary'));
T('estilo mrbeast', s => mixHas(s, 'energetic'));
T('vídeo de viagem', s => mixHas(s, 'travel'));
T('casamento', s => mixHas(s, 'wedding'));
T('podcast', s => mixHas(s, 'podcast'));
T('vlog', s => mixHas(s, 'vlog'));
T('videoclipe', s => mixHas(s, 'musicvideo'));
T('vídeo de terror', (s, e) => e.color.look === 'moody');
T('vídeo engraçado', s => mixHas(s, 'energetic'));
T('vídeo de comida', s => mixHas(s, 'commercial'));
T('vídeo de academia', s => mixHas(s, 'sports'));
T('vídeo motivacional', s => mixHas(s, 'trailer'));
T('história do império romano', s => mixHas(s, 'trailer'));
T('vídeo de mitologia grega', s => mixHas(s, 'trailer'));
T('canal dark de curiosidades', s => mixHas(s, 'documentary'));
T('tour do apartamento', s => mixHas(s, 'cinematic'));
T('unboxing do produto', s => mixHas(s, 'commercial'));
T('vídeo romântico do casal', s => mixHas(s, 'emotional'));
T('nostálgico', (s, e) => e.color.look === 'vintage');
T('mais cinematográfico', s => mixHas(s, 'cinematic') && mixHas(s, 'podcast'), P);
T('mais cara de documentário', s => mixHas(s, 'documentary'), P);
T('mais profissional', s => mixHas(s, 'commercial'), P);
T('70% cinematográfico e 30% ação', s => s.mix.length === 2);
T('estilo documentário com um pouco de ação', s => s.mix.find(m => m.id === 'action').w < 0.5);

// ===== 4. Erros de digitação =====
T('legeda palavra por palavra', s => s.captions.style === 'hormozi');
T('tira os silencio', (s, e) => e.silence.remove);
T('sem musca', s => s.music.none);
T('cinematografico', s => mixHas(s, 'cinematic'));
T('cinematogrfico', s => mixHas(s, 'cinematic'));
T('documentaro', s => mixHas(s, 'documentary'));
T('mais rapdo', (s, e) => e.pacing.avgShot < resolveStyle(base).pacing.avgShot, P);
T('trazição suave', (s, e) => (e.transitions.mix.dissolve || 0) > 0.2);
T('tiktk de 30 segundos', s => fmt(s, 'tiktok'));
T('legenda karaoke', s => s.captions.style === 'karaoke');
T('musica epica', s => s.music.mood === 'epic');
T('emosionante', s => mixHas(s, 'emotional'));

// ===== 5. Inglês =====
T('make it faster', (s, e) => e.pacing.avgShot < resolveStyle(base).pacing.avgShot, P);
T('snappier', (s, e) => e.pacing.avgShot < resolveStyle(base).pacing.avgShot, P);
T('slow it down', (s, e) => e.pacing.avgShot > resolveStyle(base).pacing.avgShot, P);
T('no music', s => s.music.none);
T('remove the music', s => s.music.none);
T('add subtitles', s => s.captions.enabled);
T('music too loud', s => s.audio.musicDb < 0, P);
T('brighter', (s, e) => e.adjust.exposure > 0, P);
T('more saturated', (s, e) => e.adjust.saturation > 1, P);
T('black and white', (s, e) => e.color.look === 'bw');
T('mirror it', (s, e) => e.mirror === true, P);
T('show the whole video', (s, e) => e.fit === true, P);
T('add a progress bar', (s, e) => e.progressBar === true, P);
T('remove filler words', (s, e) => e.fillers === true, P);
T('beat zoom', (s, e) => e.beatPulse > 0, P);
T('make it more cinematic', s => mixHas(s, 'cinematic'), P);
T('vertical for tiktok', s => fmt(s, 'tiktok'));
T('turn it into a 30 second reel', s => s.target.seconds === 30);

// ===== 6. Momentos do vídeo =====
T('tira o trecho de 0:12 a 0:18', s => s.ops.some(o => o.op === 'excludeSrc' && o.srcId === 'A'), P);
T('remove a parte do 25 ao 30', s => s.ops.some(o => o.op === 'excludeSrc' && o.srcId === 'B'), P);
T('corta de 0:05 até 0:08', s => s.ops.some(o => o.op === 'excludeSrc' && Math.abs(o.from - 10) < 0.01 && Math.abs(o.to - 13) < 0.01), P);
T('abre com o trecho de 0:25', s => s.ops.some(o => o.op === 'hookAt' && o.srcId === 'B' && Math.abs(o.t - 5) < 0.01), P);
T('começa com o momento de 0:12', s => s.ops.some(o => o.op === 'hookAt' && o.srcId === 'A'), P);
T('congela em 0:15', s => s.ops.some(o => o.op === 'freeze' && o.srcId === 'A' && Math.abs(o.at - 35) < 0.01), P);
T('congela a imagem em 0:30 por 2 segundos', s => s.ops.some(o => o.op === 'freeze' && o.dur === 2), P);
T('câmera lenta em 0:22', s => s.ops.some(o => o.op === 'setSpeed' && o.srcId === 'B' && o.speed === 0.5), P);
T('divide em 0:05', s => s.ops.some(o => o.op === 'split'), P);
T('remove a transição em 0:20', s => s.ops.some(o => o.op === 'removeTransition' && o.t === 20), P);
T('usa só os primeiros 2 minutos', s => s.ops.some(o => o.op === 'keepOnly' && o.to === 120));

// ===== 7. Textos =====
T('texto em círculo "SIGA PARA MAIS"', s => s.texts[0].shape === 'circle' && s.texts[0].text === 'SIGA PARA MAIS');
T('selo girando escrito "NOVO"', s => s.texts[0].shape === 'badge');
T('texto em arco "VERÃO 2026"', s => s.texts[0].shape === 'arc');
T('frase em onda "uau"', s => s.texts[0].shape === 'wave');
T('manchete "3 erros que você comete"', s => s.headline && s.headline.text === '3 erros que você comete');
T('título no topo "Como ganhar tempo"', s => s.headline && s.headline.text === 'Como ganhar tempo' && !s.title);
T('coloca um texto em cima "Parte 2" o vídeo todo', s => s.headline && s.headline.all);
T('legenda em cima', (s, e) => e.captionY < 0.3, P);
T('legenda no meio', (s, e) => e.captionY === 0.5, P);
T('legenda maior', (s, e) => e.captionScale > 1, P);
T('legenda menor', (s, e) => e.captionScale < 1, P);
T('legenda amarela', (s, e) => e.captionColor === '#FFE81F', P);
T('legenda com a fonte bebas', (s, e) => e.captionFont === 'bebas', P);
T('título "FIM"', s => s.title === 'FIM');

// ===== 8. Pedidos compostos e complexos =====
T('Transforma isso num vídeo de ação de aproximadamente 2 minutos, cortes rápidos de 1,2 segundo, música épica, efeitos sonoros nos impactos e abertura que prenda nos primeiros 3 segundos',
  (s, e) => mixHas(s, 'action') && e.pacing.avgShot === 1.2 && s.target.seconds === 120 && s.music.mood === 'epic' && s.hookSeconds === 3 && e.sfx.onImpacts);
T('faz um reels de 30s estilo podcast, tira os silêncios e os ahn, legenda amarela palavra por palavra e barra de progresso',
  (s, e) => fmt(s, 'reels') && s.outputs[0].duration === 30 && mixHas(s, 'podcast') && e.silence.remove && e.fillers && s.captions.style === 'hormozi' && e.captionColor === '#FFE81F' && e.progressBar);
T('quero 3 versões: uma de 15 segundos pro tiktok, uma de 60 pro reels e uma de 10 minutos pro youtube',
  s => s.outputs.length === 3 && s.outputs.map(o => o.duration).join() === '15,60,600');
T('gostei mas deixa a música mais baixa, a voz mais alta e o final mais emocionante',
  s => s.audio.musicDb < 0 && s.audio.originalDb > 0 && s.sections.some(x => x.from < 0) && mixHas(s, 'podcast'), P);
T('agora tira o trecho de 0:12 a 0:18, abre com o momento de 0:25 e coloca zoom na batida',
  (s, e) => s.ops.some(o => o.op === 'excludeSrc') && s.ops.some(o => o.op === 'hookAt') && e.beatPulse > 0, P);
T('deixa mais cinematográfico, menos saturado, com faixas pretas e transições suaves',
  (s, e) => mixHas(s, 'cinematic') && e.adjust.saturation < 1 && e.effects.letterbox && (e.transitions.mix.dissolve || 0) > 0.2, P);
T('vídeo de mitologia grega pro youtube, 8 minutos, narração com imagens, cor épica, sem legenda',
  (s, e) => fmt(s, 'youtube') && s.target.seconds === 480 && s.captions.enabled === false && mixHas(s, 'trailer'));
T('make a 45 second tiktok, fast cuts around 1 second, epic music and big yellow captions',
  (s, e) => fmt(s, 'tiktok') && s.outputs[0].duration === 45 && e.pacing.avgShot === 1 && s.music.mood === 'epic' && e.captionColor === '#FFE81F' && e.captionScale > 1);
T('primeiros 5 segundos bem rápidos, meio mais lento e últimos 3 segundos épicos',
  s => s.sections.length >= 3);
T('edita igual o vídeo de referência', (s, e, r) => r.useRef === true);
T('deixa no estilo do vídeo que eu mandei de modelo', (s, e, r) => r.useRef === true);
T('mostra o vídeo inteiro com fundo desfocado, espelhado e mais claro', (s, e) => e.fit && e.mirror && e.adjust.exposure > 0, P);
T('tá muito escuro e a música tá alta demais', (s, e) => e.adjust.exposure > 0 && s.audio.musicDb < 0, P);
T('câmera lenta 20% e speed ramp', (s, e) => Math.abs(e.effects.slowmo - 0.2) < 1e-6 && e.effects.speedRamp);
T('remove os silêncios maiores que meio segundo', (s, e) => e.silence.remove && e.silence.minLen === 0.5);
T('remove silence longer than 0.8 seconds', (s, e) => e.silence.minLen === 0.8);


// ===== 10. Conversa de verdade (mais difícil) =====
T('ficou bom mas tá muito corrido, deixa respirar um pouco', (s, e) => e.pacing.avgShot > resolveStyle(base).pacing.avgShot, P);
T('acho que precisa de mais energia no começo', s => s.hookSeconds || s.sections.some(x => x.from === 0 && x.pace === 'fast'), P);
T('gostei muito, só troca a legenda pra uma amarela e maior', (s, e) => e.captionColor === '#FFE81F' && e.captionScale > 1, P);
T('a legenda tá cobrindo a cara, sobe ela', (s, e) => e.captionY != null && e.captionY < 0.5, P);
T('a legenda tá em cima demais, desce um pouco', (s, e) => e.captionY > 0.6, P);
T('não gostei da cor, deixa natural', (s, e) => e.color.look === 'natural', P);
T('tá muito saturado', (s, e) => e.adjust.saturation < 1, P);
T('tá sem cor, dá uma vida', (s, e) => e.adjust.saturation > 1, P);
T('a música tá abafando minha voz', s => s.audio.musicDb < 0, P);
T('não quero esses barulhinhos', (s, e) => e.sfx.density <= 0.1, P);
T('tira esses efeitos de som', (s, e) => e.sfx.density <= 0.1, P);
T('põe uns efeitos de impacto', (s, e) => e.sfx.density >= 0.5, P);
T('coloca uma musiquinha animada de fundo', s => s.music.mood === 'upbeat');
T('troca a música por algo mais triste', s => s.music.mood === 'emotional');
T('quero algo mais épico', s => s.music.mood === 'epic' || mixHas(s, 'trailer'), P);
T('deixa com cara de trailer', s => mixHas(s, 'trailer'), P);
T('faz parecer um filme', s => mixHas(s, 'cinematic'));
T('deixa mais profissional e menos amador', s => mixHas(s, 'commercial'), P);
T('deixa mais viral', s => mixHas(s, 'energetic'), P);
T('quero que prenda a atenção logo de cara', s => s.hookSeconds >= 2);
T('o começo tá fraco', s => s.hookSeconds >= 2, P);
T('o final tá seco, deixa mais bonito', s => s.sections.some(x => x.from < 0), P);
T('termina com um final épico', s => s.sections.some(x => x.from < 0 && x.mood === 'epic'));
T('as transições tão exageradas', (s, e) => (e.transitions.mix.cut || 0) >= 0.8, P);
T('menos zoom', (s, e) => e.effects.punchIn < resolveStyle(base).effects.punchIn, P);
T('sem zoom', (s, e) => e.effects.punchIn === 0, P);
T('o vídeo tá tremendo, estabiliza', (s, e, r) => r.said.length > 0 || r.warn.length > 0, P);
T('tá torto, espelha', (s, e) => e.mirror === true, P);
T('aparece meu rosto cortado, mostra tudo', (s, e) => e.fit === true, P);
T('corta aquela parte do 0:20 ao 0:25 que eu errei', s => s.ops.some(o => o.op === 'excludeSrc'), P);
T('eu gaguejei várias vezes, limpa isso', (s, e) => e.fillers === true, P);
T('tira os éééé e ahhhh', (s, e) => e.fillers === true, P);
T('quero mais umas 2 opções', (s, e, r) => r.reroll || s.versions >= 2, P);
T('me mostra 3 jeitos diferentes', s => s.versions === 3);
T('faz 2 versões, uma calma e uma agitada', s => s.versions === 2);
T('pode exportar', (s, e, r) => r.exportNow === true, P);
T('salva em 4k', s => s.export.resolution === '4k', P);
T('baixar o vídeo', (s, e, r) => r.exportNow === true, P);

// ===== 11. Negações =====
T('não coloca legenda', s => s.captions.enabled === false);
T('não quero transição', (s, e) => e.transitions.mix.cut === 1);
T('não precisa de música', s => s.music.none);
T('sem câmera lenta', (s, e) => e.effects.slowmo === 0);
T('sem barra de progresso', (s, e) => e.progressBar === false, P);
T('não espelha', (s, e) => !e.mirror, P);
T('sem efeito nenhum, bem natural', (s, e) => e.effects.punchIn < 0.2 && (e.transitions.mix.cut || 0) >= 0.8, P);
T('não corta minhas pausas', (s, e) => e.silence.remove === false);
T('mantém o silêncio', (s, e) => e.silence.remove === false);

// ===== 12. Inglês e misturado =====
T('make it pop', (s, e, r) => !notUnderstood(r), P);
T('add some sound effects', (s, e) => e.sfx.density >= 0.5);
T('captions in yellow', (s, e) => e.captionColor === '#FFE81F', P);
T('put the captions on top', (s, e) => e.captionY < 0.3, P);
T('remove the part from 0:12 to 0:18', s => s.ops.some(o => o.op === 'excludeSrc'), P);
T('start with the moment at 0:25', s => s.ops.some(o => o.op === 'hookAt'), P);
T('freeze at 0:15', s => s.ops.some(o => o.op === 'freeze'), P);
T('vídeo pro tiktok com vibe cinematic', s => fmt(s, 'tiktok') && mixHas(s, 'cinematic'));
T('deixa mais warm e com grain', (s, e) => e.adjust.temp > 0, P);
T('export in 1080p 30fps', s => s.export.resolution === '1080p' && s.export.fps === 30);

// ===== 13. Longos e completos =====
T('Pega esse vídeo de 20 minutos e transforma num reels de 1 minuto bem dinâmico, com cortes de mais ou menos 1,5 segundos, legenda grande amarela palavra por palavra, música animada, zoom na batida, barra de progresso, manchete "O segredo que ninguém conta" e tira todos os silêncios e ahn',
  (s, e) => fmt(s, 'reels') && s.target.seconds === 60 && e.pacing.avgShot === 1.5 && e.captionColor === '#FFE81F' && e.captionScale > 1 && s.captions.style === 'hormozi' && s.music.mood === 'upbeat' && e.beatPulse > 0 && e.progressBar && s.headline.text === 'O segredo que ninguém conta' && e.silence.remove && e.fillers);
T('quero um documentário de história de uns 8 minutos pro youtube, ritmo calmo com cortes de 4 a 6 segundos, cor épica, música dramática, legenda discreta embaixo e final emocionante',
  (s, e) => fmt(s, 'youtube') && s.target.seconds === 480 && e.pacing.avgShot === 5 && s.music.mood === 'dramatic' && e.captionScale < 1 && s.sections.some(x => x.from < 0));
T('versão de ação pro tiktok com 30 segundos, primeiros 3 segundos com o momento mais forte, 20% câmera lenta, 3 impactos, tremor nas pancadas e cor de alto contraste',
  (s, e) => fmt(s, 'tiktok') && s.outputs[0].duration === 30 && mixHas(s, 'action') && s.hookSeconds === 3 && Math.abs(e.effects.slowmo - 0.2) < 1e-6 && s.sfxRequests[0].count === 3 && e.effects.shake > 0.4);
T('agora deixa um pouco mais claro, a música 20% mais baixa, tira o trecho de 0:30 a 0:35 e congela em 0:12 por 2 segundos',
  (s, e) => e.adjust.exposure > 0 && s.ops.some(o => o.op === 'excludeSrc') && s.ops.some(o => o.op === 'freeze' && o.dur === 2) && (s.music.intensity < 0 || s.audio.musicDb < 0), P);
T('make a 60 second cinematic travel reel, smooth transitions, warm colors, slow motion on the best moments and no captions',
  (s, e) => fmt(s, 'reels') && s.target.seconds === 60 && mixHas(s, 'travel') && (e.transitions.mix.dissolve || 0) > 0.2 && ((e.adjust && e.adjust.temp > 0) || e.color.look === 'warmfilm') && e.effects.slowmo >= 0.15 && s.captions.enabled === false);

// ===== 14. Momentos, velocidade e pedidos do dia a dia (rodada 3) =====
const PT = { prev: base, ctx: { plan, t: 12 } };
const op = (s, k) => s.ops.filter(o => o.op === k);
T('câmera lenta no final e um freeze no comecinho', s => op(s, 'setSpeed').some(o => o.speed < 1 && o.srcId === 'B') && op(s, 'freeze').length === 1, PT);
T('coloca câmera lenta no final e congela no começo por 2 segundos', s => op(s, 'setSpeed').length === 1 && op(s, 'freeze')[0].dur === 2, PT);
T('congela aqui', s => op(s, 'freeze').length === 1, PT);
T('freeze here for 3 seconds', s => op(s, 'freeze')[0].dur === 3, PT);
T('acelera essa parte de 0:10 a 0:15', s => op(s, 'setSpeed').some(o => o.speed === 2), PT);
T('deixa em 2x do 0:20 ao 0:30', s => op(s, 'setSpeed').some(o => o.speed === 2), PT);
T('time lapse no meio', s => op(s, 'setSpeed').some(o => o.speed > 1), PT);
T('bem devagar de 0:01 a 0:03', s => op(s, 'setSpeed').some(o => o.speed < 0.5), PT);
T('coloca slow motion no meio', s => op(s, 'setSpeed').some(o => o.speed === 0.5), PT);
T('divide aqui', s => op(s, 'split').length === 1, PT);
T('tira esse pedaço', s => op(s, 'deleteClip').length === 1, PT);
T('apaga essa parte', s => op(s, 'deleteClip').length === 1, PT);
T('tira o pedaço do meio', s => op(s, 'deleteClip').length === 1, PT);
T('tira os primeiros 3 segundos', s => op(s, 'excludeSrc').length >= 1, PT);
T('começa direto no 0:12', s => op(s, 'hookAt').length === 1, PT);
T('a legenda tá muito grande', (s, e) => e.captionScale < 1, P);
T('diminui a legenda', (s, e) => e.captionScale < 1, P);
T('aumenta a legenda', (s, e) => e.captionScale > 1, P);
T('as letras estão pequenas demais', (s, e) => e.captionScale > 1, P);
T('letra mais grossa', (s, e) => e.captionFont === 'anton', P);
T('quero letras finas e elegantes', (s, e) => e.captionFont === 'playfair', P);
T('legenda estilo hormozi caixa alta, fonte mais grossa e um pouco maior', (s, e) => s.captions.uppercase === true && e.captionFont === 'anton' && e.captionScale > 1, P);
T('tira a caixa alta', s => s.captions.uppercase === false, P);
T('legenda só nas palavras importantes', (s, e) => e.captionKeywords === true, P);
T('coloca um selo "NOVO"', s => s.texts.some(t => t.shape === 'badge' && t.text === 'NOVO'), P);
T('a música entra muito alta', s => s.audio.musicDb < 0, P);
T('abaixa um pouco o som da música', s => s.audio.musicDb < 0, P);
T('aumenta minha voz', s => s.audio.originalDb > 0, P);
T('minha voz tá baixinha', s => s.audio.originalDb > 0, P);
T('deixa mais claro e mais vivo', (s, e) => e.adjust.exposure > 0 && e.adjust.saturation > 1 && e.pacing.avgShot === resolveStyle(base).pacing.avgShot, P);
T('aumenta o contraste', (s, e) => e.adjust.contrast > 1, P);
T('diminui o brilho', (s, e) => e.adjust.exposure < 0, P);
T('mais nitidez', (s, e) => e.adjust.sharpen > 0, P);
T('tá meio embaçado', (s, e) => e.adjust.sharpen > 0, P);
T('tira os zooms', (s, e) => e.noZoom === true, P);
T('coloca um zoom lento', (s, e) => e.slowPush > 0, P);
T('segue meu rosto', (s, e) => e.faceZoom > 1, P);
T('deixa o rosto no centro', (s, e) => e.faceZoom > 1, P);
T('o vídeo tá muito longo', s => s.target && s.target.seconds < 40, P);
T('deixa com no máximo 45 segundos', s => s.target && s.target.seconds === 45, P);
T('faz um corte de 15 e um de 60 segundos', s => s.outputs.length === 2 && s.outputs[1].duration === 60, P);
T('uma versão de 15 segundos e outra de 60', s => s.outputs.length === 2, P);
T('transição de zoom entre as cenas', (s, e) => (e.transitions.mix.zoom || 0) > 0.5, P);
T('transições de glitch', (s, e) => (e.transitions.mix.glitch || 0) > 0.5, P);
T('barra de progresso embaixo', (s, e) => e.progressBar && e.progressPos === 'bottom', P);
T('dá uma melhorada geral', (s, e) => s.hookSeconds && e.adjust.sharpen > 0, P);
T('ficou bom, só ajusta o som', s => s.audio.originalDb > 0, P);
T('não gostei', (s, e, r) => r.reroll, P);
T('tá estranho', (s, e, r) => r.reroll, P);
T('gostei, exporta', (s, e, r) => r.exportNow, P);
T('ficou top, pode baixar', (s, e, r) => r.exportNow, P);
T('põe a música começando no refrão', s => s.music.peak === true, P);
T('sem música no começo', s => s.music.enterAt === 3 && !s.music.none, P);
T('a música só entra depois de 5 segundos', s => s.music.enterAt === 5, P);
T('troca a música por uma mais calma', (s, e) => s.music.mood === 'atmospheric' && e.pacing.avgShot === resolveStyle(base).pacing.avgShot, P);
T('tira os palavrões', (s, e) => e.bleep === true, P);
T('bipa os xingamentos', (s, e) => e.bleep === true, P);
T('tira o texto em círculo', s => s.texts.length === 0, { prev: interpret('texto em círculo "SIGA"', base).spec, ctx: { plan } });

// ===== 15. Textos na tela em alta (serifa curvada, contorno branco, papel amassado) =====
const blk = (s, st, tx) => s.texts.some(t => t.shape === 'block' && t.style === st && (!tx || t.text === tx));
T('coloca o texto "Dane-se o projeto verão" com serifa', s => blk(s, 'serifa', 'Dane-se o projeto verão'), P);
T('texto na tela "27 horas de viagem" estilo papel amassado', (s, e) => blk(s, 'papel', '27 horas de viagem') && !s.target && !mixHas(s, 'travel'), P);
T('escreve "me dá 10 minutos que eu resolvo" no vídeo', s => blk(s, 'contorno') && !s.target, P);
T('frase "teste" com contorno branco só nos primeiros segundos', s => s.texts.some(t => t.style === 'contorno' && t.all === false), P);
T('texto "oi" estilo edits', s => blk(s, 'contorno', 'oi'), P);
T('put the text "road trip" in paper style', s => blk(s, 'papel', 'road trip'), P);
T('legenda estilo papel amassado', s => s.captions.style === 'papel', P);
T('legenda com serifa', s => s.captions.style === 'serifa', P);
T('legenda contorno branco', s => s.captions.style === 'contorno', P);
T('manchete "O SEGREDO" em papel amassado', s => s.headline.text === 'O SEGREDO' && s.headline.style === 'papel', P);
T('manchete "3 erros em 30 segundos"', s => s.headline.text === '3 erros em 30 segundos' && !s.target, P);
T('muda o texto pra serifa', s => blk(s, 'serifa', 'X'), { prev: interpret('texto na tela "X" papel', base).spec, ctx: { plan } });

// ===== 16. Mais estilos em alta (pesquisa de nov/2026) =====
const P2 = { prev: base, ctx: { plan } };
T('texto "onde você tá? | chegando" em conversa de mensagem', (s, e) => blk(s, 'mensagem') && mixHas(s, 'podcast'), P2);
T('frase "o plano deu certo" recorte de revista', s => blk(s, 'revista'), P2);
T('texto "leia isso" com marca-texto', s => blk(s, 'marcatexto'), P2);
T('texto "take that chance" palavra por palavra na batida', (s, e) => blk(s, 'batida') && !e.pacing.beatSync, P2);
T('texto "arrumando pro jantar" carregando porcentagem', s => blk(s, 'carregando'), P2);
T('texto "ninguém acreditou" digitando', s => blk(s, 'digitando'), P2);
T('texto pequeno "presta atenção"', s => blk(s, 'zoom'), P2);
T('texto "isso mudou tudo" em pílulas', s => blk(s, 'pilulas'), P2);
T('texto "POV: aprendi" com fundo branco do tiktok', s => blk(s, 'caixa') && fmt(s, 'reels'), P2);
T('frase "eu só queria" amarelo confissão', s => blk(s, 'confissao'), P2);
T('texto "devagar também é chegar" estilo calmo', s => blk(s, 'calmo'), P2);
T('texto "ninguém te conta isso" minimalista', s => blk(s, 'minimal'), P2);
T('deixa mais calmo', (s, e) => !s.texts.length && e.pacing.avgShot > resolveStyle(base).pacing.avgShot, P2);
T('legenda com pílulas', s => s.captions.style === 'pilulas', P2);
T('legenda duas cores alternando', s => s.captions.style === 'duascores', P2);
T('legenda minimalista dinâmica sem amarelo', (s, e) => s.captions.style === 'dinamico' && !e.captionColor && mixHas(s, 'podcast'), P2);
T('legenda calma minúscula', s => s.captions.style === 'calmo', P2);
T('legenda palavra por palavra e texto em círculo "SIGA"', s => s.captions.style === 'hormozi' && s.texts.some(t => t.shape === 'circle'), P2);

// ===== 17. Tendências de 21/11/2026 =====
const P3 = { prev: base, ctx: { plan } };
const trans = (e, id) => (e.transitions.mix[id] || 0) > 0.3;
const conf = (s, at) => (s.confetti || []).some(c => at == null || c.at === at) && (s.sfxRequests || []).some(r => r.kind === 'clap');
const sfxK = (s, k) => (s.sfxRequests || []).some(r => r.kind === k);
// rótulo por corte, horário, lista, cartão SD
T('texto "Dia 1 | Mês 6 | 1 ano" rótulo por corte', s => blk(s, 'rotulo', 'Dia 1 | Mês 6 | 1 ano'), P3);
T('coloca os rótulos "2016 | 2026" em cada corte', s => blk(s, 'rotulo'), P3);
T('label text "day 1 | day 30" on each cut', s => blk(s, 'rotulo'), P3);
T('texto com horário "7:12 | 9:40 | 13:05" em cada corte', s => blk(s, 'horario', '7:12 | 9:40 | 13:05') && !s.target, P3);
T('vlog timestamps text "6:30 | 8:00 | 12:15"', s => blk(s, 'horario'), P3);
T('texto em lista "contas que não negocio: | café | unha feita"', s => blk(s, 'lista'), P3);
T('frase "cheat code da vida: | dormir cedo | beber água" lista aparecendo', s => blk(s, 'lista'), P3);
T('texto "ultimamente no meu cartão SD" com cartão sd', s => blk(s, 'cartaosd') || (mixHas(s, 'cartaosd') && s.texts.length), P3);
// formatos
T('retrospectiva do ano', s => mixHas(s, 'retro'), P3);
T('faz uma retrospectiva "sinto que não fiz nada esse ano"', s => mixHas(s, 'retro') && s.texts.some(t => t.text === 'sinto que não fiz nada esse ano'), P3);
T('year in review com um mês por corte', s => mixHas(s, 'retro'), P3);
T('edita no estilo lately on my sd card', s => mixHas(s, 'cartaosd'), P3);
T('ultimamente no meu cartão sd', s => mixHas(s, 'cartaosd'), P3);
// transições
T('transição de ventilador', (s, e) => trans(e, 'fan'), P3);
T('fan transition', (s, e) => trans(e, 'fan'), P3);
T('transição de papel rasgando', (s, e) => trans(e, 'rasgo'), P3);
T('transições rasgando papel de presente', (s, e) => trans(e, 'rasgo'), P3);
T('paper tear transitions', (s, e) => trans(e, 'rasgo'), P3);
// confete e sons
T('confete no final', s => conf(s, -2.8), P3);
T('chuva de confete aos 0:05', s => conf(s, 5), P3);
T('boom clap com confete no meio', s => conf(s, -0.5), P3);
T('add confetti at the end', s => conf(s), P3);
T('tira o confete', s => !(s.confetti || []).length, { prev: interpret('confete no final', base, { plan }).spec, ctx: { plan } });
T('palmas no final', s => sfxK(s, 'clap'), P3);
T('sinos de natal no começo', s => sfxK(s, 'sinos'), P3);
T('um som de papel rasgando no 0:03', s => sfxK(s, 'rasgo'), P3);
T('confete no final e transição de ventilador', (s, e) => conf(s) && trans(e, 'fan'), P3);
// o que já existia continua igual
T('sininho no final', s => sfxK(s, 'ding') && !sfxK(s, 'sinos'), P3);
T('texto "presta atenção" pequeno', s => blk(s, 'zoom'), P3);

// ===== 9. Não deve inventar =====
T('oi', (s, e, r) => notUnderstood(r));
T('qual é a capital da França', (s, e, r) => notUnderstood(r));
T('asdfgh', (s, e, r) => notUnderstood(r) && r.suggestions !== undefined);

console.log(fails.join('\n'));
console.log(`\nbanco de frases: ${pass} entendidas, ${fail} falharam (de ${pass + fail})`);
process.exit(fail ? 1 : 0);
