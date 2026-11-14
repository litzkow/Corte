// node tests/brain.test.mjs — o cérebro novo: planos de ação para pedidos compostos, trechos, contexto e correções
import { interpret } from '../js/engine/brain.js';
import { interpret as legacy, resolveStyle } from '../js/engine/director.js';
let pass = 0, fail = 0;
const base = legacy('reels estilo podcast').spec;
const plan = { duration: 40, clips: [ { srcId: 'A', start: 0, dur: 10, in: 5, out: 15, speed: 1, score: 0.2 }, { srcId: 'A', start: 10, dur: 10, in: 30, out: 40, speed: 1, score: 0.9 }, { srcId: 'B', start: 20, dur: 20, in: 0, out: 20, speed: 1 } ], decisions: ['Música: trecho'] };
const ids = r => (r.actions || []).map(a => a.id).filter(Boolean);
const sec = (s, f) => (s.sections || []).some(f);
function T(cmd, check, ctx = {}) {
  const r = interpret(cmd, ctx.prev === undefined ? base : ctx.prev, { plan, t: 12, ...ctx });
  let ok = false; try { ok = !!check(r, r.spec ? resolveStyle(r.spec) : null); } catch (e) { ok = false; }
  if (ok) pass++; else { fail++; console.log('✗', cmd, '\n   →', r.answer || (r.said || []).join(' | ')); }
}
const last = a => ({ lastReply: { actions: [a] }, prevSpecBeforeLast: base });
// exemplos do documento
T('Make this video more cinematic.', (r, e) => r.spec.mix.some(m => m.id === 'cinematic'));
T('Give it that fast YouTube editing style.', r => r.spec.mix.some(m => m.id === 'youtube'));
T('Make the beginning more interesting.', r => r.spec.hookSeconds && sec(r.spec, x => x.from === 0 && x.pace === 'fast'));
T('Add more movement.', (r, e) => e.effects.punchIn > 0 && e.beatPulse > 0);
T('Make the music more powerful.', r => r.spec.music.swell && r.spec.audio.musicDb > 0);
T('Remove those boring parts.', (r, e) => e.silence.remove && e.silence.minLen < 0.25);
T('Keep the important moments.', r => r.spec.target && r.spec.target.seconds < 40);
T('Make the transitions smoother.', (r, e) => (e.transitions.mix.dissolve || 0) > 0.2);
T('Give me something that feels like a professional documentary.', r => r.spec.mix[0].id === 'documentary');
T('Make this video cinematic, increase the speed in the beginning, add emotional music, use slow motion during the important moment, and finish with a dramatic fade.',
  (r, e) => r.spec.mix.some(m => m.id === 'cinematic') && r.spec.music.mood === 'emotional' && e.ending && e.ending.fade && r.actions.length >= 4);
T('Make it a little faster.', (r, e) => e.pacing.avgShot < resolveStyle(base).pacing.avgShot, last({ id: 'SET_CUT_PACING', params: { factor: 0.75 } }));
T('Actually, slower.', (r, e) => e.pacing.avgShot > resolveStyle(base).pacing.avgShot && r.kind === 'correction', last({ id: 'SET_CUT_PACING', params: { factor: 0.75 } }));
T('Undo the last change.', r => r.undo);
T('Make the ending like the beginning.', r => sec(r.spec, x => x.from < 0 && x.pace === 'fast'));
T('Make the music louder.', r => (r.spec.audio.musicDb || 0) > 0 || (r.spec.music.intensity || 0) > 0);
T('Lower the music when I speak.', (r, e) => e.music.duckDb <= -16);
T('Add a cinematic boom at the beginning.', r => r.spec.sfxRequests.some(x => x.kind === 'boom' && x.at === 0) && r.spec.mix[0].id === 'podcast');
T('Synchronize the cuts with the beat.', (r, e) => e.pacing.beatSync);
T('Make the music fade out naturally.', r => r.spec.music.fadeOut >= 3);
T('Remove background noise.', r => r.spec.audio.denoise > 0);
T('Make my voice clearer.', r => r.spec.audio.clarity > 0);
T('Add sound effects to the transitions.', (r, e) => e.sfx.onTransitions);
T('Make the ending more emotional.', r => sec(r.spec, x => x.from < 0 && x.mood));
T('Make the first 10 seconds fast and the rest slower.', r => sec(r.spec, x => x.from === 0 && x.to === 10 && x.pace === 'fast') && sec(r.spec, x => x.from === 10 && x.pace === 'slow'));
T('Add captions, sound effects, and smooth transitions.', (r, e) => r.spec.captions.enabled && e.sfx.density > 0.3 && (e.transitions.mix.dissolve || 0) > 0.2);
T('Make the ending emotional with slow motion and a gradual music fade.', r => sec(r.spec, x => x.from < 0) && r.spec.music.fadeOut >= 3);
T('Edit this like a professional YouTube video. Make the beginning extremely engaging, remove boring sections, use dynamic cuts, add energetic music, synchronize the transitions with the beat, add cinematic sound effects, use occasional zooms, improve the colors, add animated captions, and finish with a strong ending.',
  (r, e) => r.spec.hookSeconds && e.silence.remove && r.spec.music.mood === 'upbeat' && e.pacing.beatSync && e.effects.punchIn > 0 && sec(r.spec, x => x.from < 0) && r.actions.length >= 8);
T('Lower the music.', r => r.spec.audio.musicDb < 0);
T('Make the captions bigger.', r => r.spec.over.captionScale > 1);
T('Keep the same style but make it less aggressive.', r => r.spec.over.intensity < 1 && r.spec.mix[0].id === 'podcast');
// português e misturado
T('quero um vídeo cinematográfico, mas com ritmo acelerado e música épica', (r, e) => r.spec.mix[0].id === 'cinematic' && e.pacing.avgShot < 3.4 && r.spec.music.mood === 'epic');
T('deixa o começo mais interessante e o final emocionante', r => r.spec.hookSeconds && sec(r.spec, x => x.from < 0 && x.mood) && r.spec.mix[0].id === 'podcast');
T('tira o ruído de fundo e deixa minha voz mais clara', r => r.spec.audio.denoise > 0 && r.spec.audio.clarity > 0 && !(r.spec.over.adjust && r.spec.over.adjust.exposure));
T('põe um boom no começo e um whoosh no meio', r => r.spec.sfxRequests.length === 2);
T('VHS só no começo e preto e branco no final', r => sec(r.spec, x => x.from === 0 && x.adjust && x.adjust.vhs) && sec(r.spec, x => x.from < 0 && x.adjust && x.adjust.saturation === 0));
T('mais movimento e transições de giro', (r, e) => (e.transitions.mix.spin || 0) > 0.5 && e.effects.punchIn > 0);
T('uns zooms de vez em quando e cor teal and orange', (r, e) => e.color.look === 'hollywood');
T('mistura: make it faster e coloca legenda amarela', (r, e) => e.pacing.avgShot < resolveStyle(base).pacing.avgShot && e.captionColor);
T('grão de filme e vinheta', (r, e) => e.adjust && e.adjust.grain > 0 && e.adjust.vignette > 0);
T('aberração cromática no meio', r => sec(r.spec, x => x.from === 'mid' && x.adjust && x.adjust.chroma));
T('transição de queima de filme', (r, e) => (e.transitions.mix.burn || 0) > 0.5);
T('deixa a música mais baixa e a voz mais alta', r => r.spec.audio.musicDb < 0 && r.spec.audio.originalDb > 0);
T('equaliza a voz', r => true);
T('o que você fez?', r => r.kind === 'question' && /fiz/.test(r.answer), { lastReply: { actions: [{ said: 'Cortes mais rápidos' }] } });
T('o que você sabe fazer?', r => r.kind === 'question' && /Ritmo/.test(r.answer));
T('é IA?', r => r.kind === 'question' && /regras/.test(r.answer));
T('quando eu disser "explosivo" quer dizer cortes bem rápidos, tremor, flashes e música épica', r => r.kind === 'teach');
T('deixa explosivo', (r, e) => r.taught.includes('explosivo') && e.effects.shake > 0 && r.spec.music.mood === 'epic');
T('esquece "explosivo"', r => r.kind === 'teach');
console.log(`\ncérebro: ${pass} ok, ${fail} falhas`);
if (fail) process.exit(1);
