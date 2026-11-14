import { interpret, resolveStyle } from '../js/engine/director.js';
const cmds = [
 "Transforma isso num vídeo de ação de aproximadamente 2 minutos. Quero cortes rápidos, média de 1,2 segundo, músicas épicas, efeitos sonoros nos momentos de impacto, color grading cinematográfico, transições profissionais e uma abertura que prenda a atenção nos primeiros 3 segundos.",
 "Edit this like an intense Hollywood action trailer.",
 "Make this video feel like a professional YouTube documentary.",
 "Give it the style of a fast-paced MrBeast-style video without copying anyone's exact creative work.",
 "Use lots of cuts, averaging 1.5 seconds per shot.",
 "Keep the average shot length between 2 and 3 seconds.",
 "Make the first 5 seconds extremely engaging.",
 "Remove every unnecessary pause, repetition, mistake, and awkward silence.",
 "Turn this 40-minute recording into a compelling 60-second video.",
 "Create a 15-second TikTok, a 60-second Reel, and a 10-minute YouTube version.",
 "Use fewer effects and make it look natural and premium.",
 "Give me 70% cinematic documentary and 30% action trailer.",
 "Remove silence longer than 1.5 seconds.",
 "Use 15% slow motion.",
 "Increase music intensity by 20%.",
 "Add three dramatic impacts.",
 "Use a cinematic transition every 10 seconds.",
 "Remove the transition at 00:32.",
 "Export in 4K at 30 FPS.",
 "Make this 45 minutes of footage into a 90-second highlight reel.",
 "Faz um reels de 30 segundos com legenda palavra por palavra e texto em círculo \"SIGA PARA MAIS\"",
 "Actually, slow down the first 10 seconds.",
 "Make the final 5 seconds emotional.",
 "Gostei, mas deixa a música mais intensa e o final mais emocionante.",
 "corta mais rápido",
 "Show me three different versions.",
 "Keep the original English audio but add Portuguese subtitles.",
 "usa a música deste vídeo",
 "quero um vídeo de viagem cinematográfico de 1 minuto e meio para o youtube shorts",
 "Make the pacing slower during emotional moments and faster during exciting moments.",
];
let prev = null;
for (const c of cmds) {
  const r = interpret(c, null);
  console.log('\n> ' + c); r.said.forEach(x => console.log('   ✓ ' + x)); r.warn.forEach(x => console.log('   ! ' + x)); r.ask.forEach(x => console.log('   ? ' + x));
  const e = resolveStyle(r.spec); console.log('   = avg', e.pacing.avgShot.toFixed(2), 'tgt', r.spec.target && r.spec.target.seconds, 'outs', JSON.stringify(r.spec.outputs), 'look', e.color.look, 'sec', JSON.stringify(r.spec.sections), 'hook', r.spec.hookSeconds);
}
