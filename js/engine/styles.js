// Estilos de edição (presets) e looks de cor. Tudo é parâmetro: dá para misturar e salvar.

// ---------- LOOKS DE COR ----------
// lift = sombras, gamma = meios-tons, gain = altas luzes (rgb). temp: + quente / - frio.
export const LOOKS = {
  natural:    { label: 'Documentário natural', exposure: 0, contrast: 1.04, saturation: 1.02, temp: 0, tint: 0, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], fade: 0, vignette: 0.08, grain: 0 },
  hollywood:  { label: 'Hollywood (teal & orange)', exposure: 0, contrast: 1.16, saturation: 1.05, temp: 0.04, tint: 0, lift: [-0.02, 0.01, 0.045], gamma: [1.0, 0.99, 0.97], gain: [1.06, 1.0, 0.92], fade: 0.02, vignette: 0.22, grain: 0.04 },
  warmfilm:   { label: 'Filme quente', exposure: 0.02, contrast: 1.06, saturation: 0.95, temp: 0.12, tint: 0.02, lift: [0.03, 0.015, 0], gamma: [1.02, 1, 0.96], gain: [1.04, 1.0, 0.9], fade: 0.06, vignette: 0.18, grain: 0.09 },
  coolcine:   { label: 'Cinema frio', exposure: -0.02, contrast: 1.12, saturation: 0.9, temp: -0.12, tint: -0.01, lift: [0, 0.01, 0.04], gamma: [0.98, 1, 1.03], gain: [0.95, 1.0, 1.06], fade: 0.03, vignette: 0.2, grain: 0.04 },
  vintage:    { label: 'Vintage', exposure: 0.03, contrast: 0.9, saturation: 0.72, temp: 0.1, tint: 0.03, lift: [0.07, 0.05, 0.03], gamma: [1.03, 1.0, 0.95], gain: [1.0, 0.97, 0.86], fade: 0.12, vignette: 0.3, grain: 0.16 },
  action:     { label: 'Ação alto contraste', exposure: 0, contrast: 1.28, saturation: 1.12, temp: 0.02, tint: 0, lift: [-0.03, -0.01, 0.02], gamma: [1, 0.98, 0.98], gain: [1.08, 1.02, 0.94], fade: 0, vignette: 0.26, grain: 0.05 },
  commercial: { label: 'Comercial premium', exposure: 0.03, contrast: 1.1, saturation: 1.08, temp: 0.02, tint: 0, lift: [0, 0, 0.01], gamma: [1, 1, 1], gain: [1.03, 1.02, 1.0], fade: 0, vignette: 0.1, grain: 0 },
  moody:      { label: 'Dramático escuro', exposure: -0.06, contrast: 1.22, saturation: 0.78, temp: -0.03, tint: 0.01, lift: [0, 0.01, 0.03], gamma: [0.94, 0.95, 0.98], gain: [0.98, 0.98, 1.0], fade: 0.02, vignette: 0.38, grain: 0.07 },
  bright:     { label: 'Lifestyle claro', exposure: 0.07, contrast: 0.98, saturation: 1.1, temp: 0.04, tint: 0.01, lift: [0.03, 0.03, 0.03], gamma: [1.04, 1.04, 1.03], gain: [1.02, 1.02, 1.0], fade: 0.04, vignette: 0, grain: 0 },
  epic:       { label: 'Épico (trailer)', exposure: -0.02, contrast: 1.25, saturation: 0.92, temp: 0.02, tint: 0, lift: [-0.02, 0.0, 0.04], gamma: [0.98, 0.97, 0.99], gain: [1.07, 1.0, 0.9], fade: 0, vignette: 0.32, grain: 0.06 },
  faded:      { label: 'Filme lavado (baixo contraste)', exposure: 0.04, contrast: 0.85, saturation: 0.85, temp: 0.04, tint: 0, lift: [0.06, 0.06, 0.07], gamma: [1, 1, 1], gain: [0.97, 0.97, 0.97], fade: 0.14, vignette: 0.15, grain: 0.08 },
  desat:      { label: 'Dessaturado', exposure: 0, contrast: 1.08, saturation: 0.55, temp: -0.02, tint: 0, lift: [0.01, 0.01, 0.02], gamma: [1, 1, 1], gain: [1, 1, 1], fade: 0.04, vignette: 0.2, grain: 0.04 },
  vibrant:    { label: 'Vibrante', exposure: 0.05, contrast: 1.12, saturation: 1.35, temp: 0.03, tint: 0, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1.02, 1.02, 1.02], fade: 0, vignette: 0.05, grain: 0 },
  punchy:     { label: 'Alto contraste', exposure: 0, contrast: 1.35, saturation: 1.05, temp: 0, tint: 0, lift: [-0.02, -0.02, -0.02], gamma: [1, 1, 1], gain: [1.03, 1.03, 1.03], fade: 0, vignette: 0.25, grain: 0.02 },
  bw:         { label: 'Preto e branco', exposure: 0, contrast: 1.2, saturation: 0, temp: 0, tint: 0, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], fade: 0.03, vignette: 0.28, grain: 0.1 },
  warmpop:    { label: 'Quente e vivo (reels)', exposure: 0.03, contrast: 1.12, saturation: 1.2, temp: 0.08, tint: 0.01, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1.05, 1.0, 0.93], fade: 0, vignette: 0.08, grain: 0 },
  filme:      { label: 'Filme estético (granulado)', exposure: 0.02, contrast: 0.92, saturation: 0.9, temp: 0.1, tint: 0.01, lift: [0.06, 0.045, 0.03], gamma: [1.02, 1, 0.96], gain: [1.04, 1.0, 0.9], fade: 0.1, vignette: 0.16, grain: 0.15 },
  docfilm:    { label: 'Documentário de cinema', exposure: -0.02, contrast: 1.06, saturation: 0.72, temp: -0.04, tint: 0, lift: [0.03, 0.04, 0.06], gamma: [1, 1, 1.02], gain: [1.0, 0.98, 0.95], fade: 0.06, vignette: 0.32, grain: 0.1 },
  futebol:    { label: 'Futebol saturado', exposure: 0.01, contrast: 1.22, saturation: 1.25, temp: 0.03, tint: -0.01, lift: [-0.02, -0.02, -0.02], gamma: [1, 0.98, 1], gain: [1.03, 1.04, 1.0], fade: 0, vignette: 0.12, grain: 0 },
  none:       { label: 'Sem cor (original)', exposure: 0, contrast: 1, saturation: 1, temp: 0, tint: 0, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], fade: 0, vignette: 0, grain: 0 },
};

// ---------- PRESETS DE EDIÇÃO ----------
const base = {
  pacing: { avgShot: 3.0, minShot: 0.8, maxShot: 8, variation: 0.35, beatSync: false, dynamic: true },
  hook: { enabled: false, seconds: 3 },
  silence: { remove: true, minLen: 0.7, pad: 0.12 },
  transitions: { mix: { cut: 1 }, dur: 0.3 },
  effects: { punchIn: 0.2, slowmo: 0, speedRamp: false, shake: 0, flash: 0, letterbox: false, lightLeak: 0 },
  color: { look: 'natural', intensity: 0.8 },
  music: { mood: 'neutral', levelDb: -18, duckDb: -12 },
  sfx: { density: 0.2, kinds: ['whoosh'] },
  captions: { style: 'clean' },
  ending: { fade: true },
};

export const FORMAT_IDS = ['montagemfrase', 'letra', 'memes', 'dividida', 'historia', 'susto', 'phonk', 'vlogpiada', 'retro', 'cartaosd'];
export const PRESETS = {
  // ===== FORMATOS VIRAIS (pesquisa de 17/11/2026, vídeos com 300 mil a 5,7 milhões de views) =====
  // Cada formato é uma receita completa: layout, ritmo, frase, legenda, som e cor. Ver docs/tendencias.md.
  montagemfrase: { short: 'Frase fixa, cortes na batida, só música', label: 'Montagem com frase', desc: 'Cortes na batida, close no rosto alternando, uma frase fixa em cima, só música e emenda no começo. O reel de funk e lifestyle.',
    pacing: { avgShot: 1.8, minShot: 1.1, maxShot: 2.8, variation: 0.35, beatSync: true }, hook: { enabled: false },
    transitions: { mix: { cut: 1 }, dur: 0 }, effects: { punchIn: 0.12 }, color: { look: 'warmpop', intensity: 0.9 },
    music: { mood: 'upbeat', levelDb: -6, duckDb: -6 }, sfx: { density: 0, kinds: [] }, captions: { style: 'dinamico' }, ending: { fade: false },
    fmt: { musicOnly: true, altClose: true, loop: true, phrase: 'frase', needsPhrase: true } },
  letra: { short: 'Letra no centro, cor de filme, loop', label: 'Clipe de letra (estético)', desc: 'Frase pequena em serifa no centro, mudando a cada corte, cor de filme com granulado, ritmo das frases da música, loop.',
    pacing: { avgShot: 1.6, minShot: 0.95, maxShot: 3.1, variation: 0.45, beatSync: true }, hook: { enabled: false },
    transitions: { mix: { cut: 1 }, dur: 0 }, effects: { punchIn: 0.05 }, color: { look: 'filme', intensity: 0.95 },
    music: { mood: 'reflective', levelDb: -6, duckDb: -6 }, sfx: { density: 0, kinds: [] }, captions: { style: 'calmo' }, ending: { fade: false },
    fmt: { musicOnly: true, loop: true, phrase: 'letra', perCut: true, needsPhrase: true } },
  memes: { short: 'Corte a cada segundo, memes e legenda amarela', label: 'Comentário com memes', desc: 'Corte a cada segundo, zero pausa, imagem em tela cheia alternando com card no fundo cinza, legenda amarela de contorno grosso.',
    pacing: { avgShot: 1.0, minShot: 0.6, maxShot: 1.6, variation: 0.35, beatSync: false }, hook: { enabled: true, seconds: 2 }, silence: { remove: true, minLen: 0.25, pad: 0.04 },
    transitions: { mix: { cut: 1 }, dur: 0 }, effects: { punchIn: 0.35 }, color: { look: 'vibrant', intensity: 0.85 },
    music: { mood: 'upbeat', levelDb: -16, duckDb: -10 }, sfx: { density: 0.35, kinds: ['pop', 'whoosh'] }, captions: { style: 'meme' },
    fmt: { layout: 'card', fullCover: true, captionY: 0.5 } },
  dividida: { short: 'Imagens em cima, você embaixo', label: 'Tela dividida contando história', desc: 'Imagens em cima trocando a cada 1–2 s, quem narra embaixo, linha branca no meio, legenda amarelo-neon pulando. Futebol e história.',
    pacing: { avgShot: 1.7, minShot: 1.0, maxShot: 2.6, variation: 0.35, beatSync: false }, hook: { enabled: false }, silence: { remove: true, minLen: 0.3, pad: 0.05 },
    transitions: { mix: { cut: 1 }, dur: 0 }, effects: { punchIn: 0.2 }, color: { look: 'punchy', intensity: 0.85 },
    music: { mood: 'epic', levelDb: -15, duckDb: -13 }, sfx: { density: 0.4, kinds: ['whoosh', 'impact'] }, captions: { style: 'neonsplit' }, ending: { fade: false },
    fmt: { layout: 'split', fullCover: true, split: 0.62, captionY: 0.575, hardEnd: true, sfxOnCovers: 'whoosh' } },
  historia: { short: 'Narração, zoom lento, palavra em âmbar', label: 'História cinematográfica', desc: 'Narração com imagens trocando nas palavras fortes, zoom lento em tudo, cor dessaturada com granulado, palavra acendendo em âmbar, boom nas viradas.',
    pacing: { avgShot: 1.3, minShot: 0.8, maxShot: 1.9, variation: 0.35, beatSync: false }, hook: { enabled: false }, silence: { remove: true, minLen: 0.35, pad: 0.06 },
    transitions: { mix: { cut: 1 }, dur: 0 }, effects: { punchIn: 0.1 }, color: { look: 'docfilm', intensity: 0.95 },
    music: { mood: 'epic', levelDb: -18, duckDb: -16 }, sfx: { density: 0.3, kinds: ['boom', 'whoosh'] }, captions: { style: 'ambar' },
    slowPush: 0.5, fmt: { fullCover: true, booms: true, captionY: 0.5 } },
  susto: { short: 'Zoom na piada, clímax com boom', label: 'Conversa com sustos', desc: 'Quem fala no centro, zoom de 115% nas piadas, no clímax 125% com cor fria, tremor e boom. Legenda de uma palavra colorida em fonte de game.',
    pacing: { avgShot: 1.4, minShot: 0.7, maxShot: 2.6, variation: 0.45, beatSync: false }, hook: { enabled: true, seconds: 2.5 }, silence: { remove: true, minLen: 0.3, pad: 0.05 },
    transitions: { mix: { cut: 1 }, dur: 0 }, effects: { punchIn: 0.6, shake: 0.4 }, color: { look: 'vibrant', intensity: 0.75 },
    music: { mood: 'dramatic', levelDb: -20, duckDb: -14 }, sfx: { density: 0.4, kinds: ['boom', 'glitch', 'whoosh'] }, captions: { style: 'pixel' },
    emphasisZoom: true, fmt: { climax: true, captionY: 0.56 } },
  phonk: { short: 'Drop em preto e branco, câmera lenta', label: 'Lance com batida (phonk)', desc: 'Tempo normal até o lance, pisca preto e branco no drop com tremor, replay em câmera lenta, cor saturada. Edit de futebol e esporte.',
    pacing: { avgShot: 1.6, minShot: 0.6, maxShot: 3.5, variation: 0.55, beatSync: true }, hook: { enabled: false },
    transitions: { mix: { cut: 0.85, flash: 0.15 }, dur: 0.12 }, effects: { punchIn: 0.3, slowmo: 0.3, speedRamp: true, shake: 0.5 }, color: { look: 'futebol', intensity: 0.95 },
    music: { mood: 'electronic', levelDb: -10, duckDb: -6 }, sfx: { density: 0.3, kinds: ['impact', 'whoosh'] }, captions: { style: 'impact' },
    fmt: { bwDrop: true, keepOriginal: -4 } },
  vlogpiada: { short: 'Gancho em cima, boom na piada', label: 'Vlog narrado com piada', desc: 'Diálogo cortado a cada segundo, boom e zoom na piada, música só entra quando a história anda, frase-gancho em cima e legenda embaixo.',
    pacing: { avgShot: 1.1, minShot: 0.6, maxShot: 2.2, variation: 0.4, beatSync: false }, hook: { enabled: false }, silence: { remove: true, minLen: 0.3, pad: 0.05 },
    transitions: { mix: { cut: 1 }, dur: 0 }, effects: { punchIn: 0.4 }, color: { look: 'bright', intensity: 0.8 },
    music: { mood: 'upbeat', levelDb: -17, duckDb: -10 }, sfx: { density: 0.25, kinds: ['boom', 'pop'] }, captions: { style: 'vlog' },
    fmt: { punchline: true, musicEnter: 0.3, phrase: 'gancho', phraseSecs: 4 } },
  // ===== pesquisa de 21/11/2026 (later.com, newengen.com, socialbee.com, postdom.com, virlo.ai) =====
  retro: { short: 'Frase de abertura, um mês por corte', label: 'Retrospectiva do ano', desc: 'Abre com a frase "sinto que não fiz nada esse ano" e depois um clipe por mês, de janeiro a dezembro, com o nome do mês grande. Cortes de 1 s na batida, só música.',
    pacing: { avgShot: 1.05, minShot: 0.8, maxShot: 1.5, variation: 0.2, beatSync: true }, hook: { enabled: false },
    transitions: { mix: { cut: 1 }, dur: 0 }, effects: { punchIn: 0.08 }, color: { look: 'warmpop', intensity: 0.8 },
    music: { mood: 'upbeat', levelDb: -6, duckDb: -6 }, sfx: { density: 0, kinds: [] }, captions: { style: 'dinamico' }, ending: { fade: false },
    fmt: { musicOnly: true, months: true, phrase: 'caixa', defaultPhrase: 'sinto que não fiz nada esse ano' } },
  cartaosd: { short: 'Cartão SD e clipes rapidíssimos', label: 'Ultimamente no cartão SD', desc: 'Um cartão de memória desenhado abre o vídeo e depois vem uma sequência rápida de clipes de menos de 1 s, na batida, só música. O "lately on my SD card".',
    pacing: { avgShot: 0.62, minShot: 0.4, maxShot: 0.95, variation: 0.3, beatSync: true }, hook: { enabled: false },
    transitions: { mix: { cut: 1 }, dur: 0 }, effects: { punchIn: 0.05 }, color: { look: 'filme', intensity: 0.85 },
    music: { mood: 'upbeat', levelDb: -6, duckDb: -6 }, sfx: { density: 0, kinds: [] }, captions: { style: 'calmo' }, ending: { fade: false },
    fmt: { musicOnly: true, phrase: 'cartaosd', phraseSecs: 2.2, defaultPhrase: 'ultimamente no meu cartão SD' } },
  action: { label: 'Ação Hollywood', desc: 'Cortes curtos, impacto, som forte, tomadas heroicas mais longas de vez em quando.',
    pacing: { avgShot: 1.0, minShot: 0.4, maxShot: 2.8, variation: 0.55, beatSync: true }, hook: { enabled: true, seconds: 3 },
    transitions: { mix: { cut: 0.6, flash: 0.15, whip: 0.15, zoom: 0.1 }, dur: 0.18 },
    effects: { punchIn: 0.5, slowmo: 0.12, speedRamp: true, shake: 0.4, flash: 0.35 },
    color: { look: 'action', intensity: 0.9 }, music: { mood: 'epic', levelDb: -11, duckDb: -8 }, sfx: { density: 0.7, kinds: ['impact', 'whoosh', 'riser', 'hit'] }, captions: { style: 'impact' } },
  trailer: { label: 'Trailer de cinema', desc: 'Abertura lenta e tensa, aceleração, pico, título no final.',
    pacing: { avgShot: 1.6, minShot: 0.4, maxShot: 4, variation: 0.6, beatSync: true }, hook: { enabled: true, seconds: 3 },
    transitions: { mix: { cut: 0.55, dip: 0.2, flash: 0.15, dissolve: 0.1 }, dur: 0.35 },
    effects: { punchIn: 0.3, slowmo: 0.15, speedRamp: true, shake: 0.2, flash: 0.25, letterbox: true },
    color: { look: 'epic', intensity: 0.9 }, music: { mood: 'epic', levelDb: -10, duckDb: -9 }, sfx: { density: 0.6, kinds: ['impact', 'riser', 'whoosh', 'boom'] }, captions: { style: 'cinema' } },
  cinematic: { label: 'Cinematográfico', desc: 'Tomadas de 2 a 5 s, composição, transições suaves, trilha atmosférica.',
    pacing: { avgShot: 3.4, minShot: 1.6, maxShot: 7, variation: 0.3, beatSync: true }, hook: { enabled: false, seconds: 3 },
    transitions: { mix: { cut: 0.65, dissolve: 0.25, dip: 0.1 }, dur: 0.6 },
    effects: { punchIn: 0.1, slowmo: 0.1, letterbox: true }, color: { look: 'hollywood', intensity: 0.85 },
    music: { mood: 'atmospheric', levelDb: -14, duckDb: -12 }, sfx: { density: 0.15, kinds: ['whoosh', 'riser'] }, captions: { style: 'cinema' } },
  documentary: { label: 'Documentário', desc: 'Duração natural, continuidade, fala preservada, poucos efeitos.',
    pacing: { avgShot: 4.5, minShot: 1.5, maxShot: 12, variation: 0.25, beatSync: false }, silence: { remove: true, minLen: 1.0, pad: 0.18 },
    transitions: { mix: { cut: 0.85, dissolve: 0.15 }, dur: 0.5 }, effects: { punchIn: 0.12 },
    color: { look: 'natural', intensity: 0.8 }, music: { mood: 'reflective', levelDb: -20, duckDb: -14 }, sfx: { density: 0.05, kinds: [] }, captions: { style: 'documentary' } },
  social: { label: 'Rede social acelerada', desc: 'Gancho forte, zero tempo morto, zoom de ênfase, legenda palavra por palavra.',
    pacing: { avgShot: 1.5, minShot: 0.5, maxShot: 3.5, variation: 0.5, beatSync: false }, hook: { enabled: true, seconds: 3 },
    silence: { remove: true, minLen: 0.3, pad: 0.06 },
    transitions: { mix: { cut: 0.8, zoom: 0.1, whip: 0.1 }, dur: 0.2 }, effects: { punchIn: 0.7, flash: 0.1 },
    color: { look: 'commercial', intensity: 0.7 }, music: { mood: 'upbeat', levelDb: -20, duckDb: -14 }, sfx: { density: 0.45, kinds: ['pop', 'whoosh', 'click'] }, captions: { style: 'hormozi' } },
  energetic: { label: 'YouTuber energético', desc: 'Ritmo de retenção, cortes a cada 1-2 s, legendas grandes e coloridas, efeitos de ênfase. Inspirado no gênero, sem copiar ninguém.',
    pacing: { avgShot: 1.3, minShot: 0.45, maxShot: 3, variation: 0.5 }, hook: { enabled: true, seconds: 3 }, silence: { remove: true, minLen: 0.25, pad: 0.05 },
    transitions: { mix: { cut: 0.75, zoom: 0.1, whip: 0.15 }, dur: 0.18 }, effects: { punchIn: 0.85, shake: 0.2, flash: 0.15 },
    color: { look: 'bright', intensity: 0.8 }, music: { mood: 'upbeat', levelDb: -19, duckDb: -13 }, sfx: { density: 0.6, kinds: ['pop', 'whoosh', 'ding', 'click'] }, captions: { style: 'beast' } },
  emotional: { label: 'História emocionante', desc: 'Ritmo que respira, câmera lenta nos picos, trilha crescendo, final que fica.',
    pacing: { avgShot: 3.8, minShot: 1.8, maxShot: 8, variation: 0.3, beatSync: true }, transitions: { mix: { cut: 0.6, dissolve: 0.35, dip: 0.05 }, dur: 0.7 },
    effects: { slowmo: 0.18, punchIn: 0.05 }, color: { look: 'warmfilm', intensity: 0.8 }, music: { mood: 'emotional', levelDb: -15, duckDb: -12 },
    sfx: { density: 0.05, kinds: ['riser'] }, captions: { style: 'elegant' }, ending: { fade: true, slow: true } },
  commercial: { label: 'Comercial premium', desc: 'Limpo, rítmico, cor rica, transições discretas.',
    pacing: { avgShot: 1.8, minShot: 0.7, maxShot: 3.5, variation: 0.3, beatSync: true }, transitions: { mix: { cut: 0.7, zoom: 0.1, dissolve: 0.2 }, dur: 0.3 },
    effects: { punchIn: 0.25, slowmo: 0.08 }, color: { look: 'commercial', intensity: 0.85 }, music: { mood: 'upbeat', levelDb: -13, duckDb: -10 },
    sfx: { density: 0.3, kinds: ['whoosh', 'click'] }, captions: { style: 'minimal' } },
  sports: { label: 'Comercial esportivo', desc: 'Energia, impacto na batida, câmera lenta nos lances.',
    pacing: { avgShot: 0.9, minShot: 0.35, maxShot: 2.5, variation: 0.55, beatSync: true }, hook: { enabled: true, seconds: 2.5 },
    transitions: { mix: { cut: 0.6, flash: 0.2, whip: 0.2 }, dur: 0.15 }, effects: { punchIn: 0.45, slowmo: 0.18, speedRamp: true, shake: 0.35, flash: 0.35 },
    color: { look: 'action', intensity: 0.9 }, music: { mood: 'epic', levelDb: -10, duckDb: -8 }, sfx: { density: 0.75, kinds: ['impact', 'whoosh', 'hit', 'riser'] }, captions: { style: 'impact' } },
  travel: { label: 'Filme de viagem', desc: 'Abertura de paisagem, ritmo na música, ambiente, final bonito.',
    pacing: { avgShot: 2.2, minShot: 0.8, maxShot: 5, variation: 0.4, beatSync: true }, transitions: { mix: { cut: 0.6, whip: 0.15, dissolve: 0.25 }, dur: 0.45 },
    effects: { slowmo: 0.12, speedRamp: true, punchIn: 0.1, lightLeak: 0.3 }, color: { look: 'warmfilm', intensity: 0.75 },
    music: { mood: 'upbeat', levelDb: -12, duckDb: -10 }, sfx: { density: 0.25, kinds: ['whoosh'] }, captions: { style: 'travel' } },
  luxury: { label: 'Luxo', desc: 'Lento, elegante, preto profundo, tipografia fina.',
    pacing: { avgShot: 3.0, minShot: 1.5, maxShot: 6, variation: 0.2, beatSync: true }, transitions: { mix: { cut: 0.5, dissolve: 0.4, dip: 0.1 }, dur: 0.8 },
    effects: { slowmo: 0.25, punchIn: 0.08 }, color: { look: 'moody', intensity: 0.7 }, music: { mood: 'atmospheric', levelDb: -14, duckDb: -12 }, sfx: { density: 0.1, kinds: ['whoosh'] }, captions: { style: 'elegant' } },
  podcast: { label: 'Podcast / corte de conversa', desc: 'Fala intacta, silêncios fora, zoom alternado, legenda grande.',
    pacing: { avgShot: 4, minShot: 1.2, maxShot: 9, variation: 0.3 }, silence: { remove: true, minLen: 0.5, pad: 0.1 },
    effects: { punchIn: 0.6 }, color: { look: 'commercial', intensity: 0.6 }, music: { mood: 'none', levelDb: -26, duckDb: -10 }, sfx: { density: 0.1, kinds: ['pop'] }, captions: { style: 'hormozi' } },
  interview: { label: 'Entrevista', desc: 'Resposta completa, cortes na respiração, cor natural.',
    pacing: { avgShot: 5, minShot: 2, maxShot: 14, variation: 0.25 }, silence: { remove: true, minLen: 0.9, pad: 0.15 },
    effects: { punchIn: 0.3 }, color: { look: 'natural', intensity: 0.7 }, music: { mood: 'reflective', levelDb: -24, duckDb: -12 }, sfx: { density: 0, kinds: [] }, captions: { style: 'documentary' } },
  vlog: { label: 'Vlog', desc: 'Leve, jump cuts, sem tempo morto, cor clara.',
    pacing: { avgShot: 2.0, minShot: 0.6, maxShot: 5, variation: 0.45 }, silence: { remove: true, minLen: 0.4, pad: 0.08 },
    transitions: { mix: { cut: 0.8, whip: 0.1, zoom: 0.1 }, dur: 0.25 }, effects: { punchIn: 0.45 }, color: { look: 'bright', intensity: 0.75 },
    music: { mood: 'upbeat', levelDb: -21, duckDb: -14 }, sfx: { density: 0.35, kinds: ['pop', 'whoosh'] }, captions: { style: 'bubble' } },
  gaming: { label: 'Gaming', desc: 'Rápido, tremor nos impactos, cor saturada, legenda neon.',
    pacing: { avgShot: 1.2, minShot: 0.4, maxShot: 3, variation: 0.55, beatSync: true }, hook: { enabled: true, seconds: 3 },
    transitions: { mix: { cut: 0.6, flash: 0.2, zoom: 0.2 }, dur: 0.15 }, effects: { punchIn: 0.6, shake: 0.45, flash: 0.3 },
    color: { look: 'action', intensity: 0.8 }, music: { mood: 'electronic', levelDb: -13, duckDb: -9 }, sfx: { density: 0.65, kinds: ['impact', 'whoosh', 'glitch'] }, captions: { style: 'neon' } },
  wedding: { label: 'Casamento', desc: 'Delicado, câmera lenta, luz quente, votos preservados.',
    pacing: { avgShot: 3.5, minShot: 1.6, maxShot: 8, variation: 0.25, beatSync: true }, transitions: { mix: { cut: 0.45, dissolve: 0.5, dip: 0.05 }, dur: 0.8 },
    effects: { slowmo: 0.3, lightLeak: 0.25 }, color: { look: 'warmfilm', intensity: 0.7 }, music: { mood: 'emotional', levelDb: -14, duckDb: -14 }, sfx: { density: 0, kinds: [] }, captions: { style: 'elegant' } },
  corporate: { label: 'Corporativo', desc: 'Claro, objetivo, sem exagero.',
    pacing: { avgShot: 3.2, minShot: 1.2, maxShot: 7, variation: 0.2 }, transitions: { mix: { cut: 0.8, dissolve: 0.2 }, dur: 0.4 }, effects: { punchIn: 0.15 },
    color: { look: 'natural', intensity: 0.7 }, music: { mood: 'corporate', levelDb: -22, duckDb: -12 }, sfx: { density: 0.05, kinds: ['whoosh'] }, captions: { style: 'minimal' } },
  minimal: { label: 'Minimalista natural', desc: 'Quase nenhum efeito, cor fiel, ritmo calmo.',
    pacing: { avgShot: 4, minShot: 1.5, maxShot: 10, variation: 0.2 }, transitions: { mix: { cut: 1 }, dur: 0.3 }, effects: { punchIn: 0 },
    color: { look: 'natural', intensity: 0.5 }, music: { mood: 'reflective', levelDb: -22, duckDb: -12 }, sfx: { density: 0, kinds: [] }, captions: { style: 'minimal' } },
  musicvideo: { label: 'Videoclipe', desc: 'Tudo no tempo da música, cortes na batida, cor estilizada.',
    pacing: { avgShot: 1.4, minShot: 0.45, maxShot: 4, variation: 0.5, beatSync: true }, silence: { remove: false },
    transitions: { mix: { cut: 0.6, flash: 0.15, zoom: 0.1, whip: 0.15 }, dur: 0.15 }, effects: { punchIn: 0.4, slowmo: 0.1, shake: 0.25, flash: 0.3, lightLeak: 0.2 },
    color: { look: 'coolcine', intensity: 0.85 }, music: { mood: 'any', levelDb: -6, duckDb: 0 }, sfx: { density: 0, kinds: [] }, captions: { style: 'karaoke' } },
  // perfis compostos dos mesmos módulos (ritmo, transição, cor, música, som, texto)
  youtube: { label: 'YouTube profissional', desc: 'Gancho, sem tempo morto, zoom de vez em quando, cor limpa, legenda dinâmica.',
    pacing: { avgShot: 2.4, minShot: 0.8, maxShot: 6, variation: 0.5 }, hook: { enabled: true, seconds: 4 }, silence: { remove: true, minLen: 0.25 },
    transitions: { mix: { cut: 0.85, zoom: 0.08, whip: 0.07 }, dur: 0.22 }, effects: { punchIn: 0.45 },
    color: { look: 'commercial', intensity: 0.65 }, music: { mood: 'upbeat', levelDb: -22, duckDb: -16 }, sfx: { density: 0.3, kinds: ['whoosh', 'pop', 'click'] }, captions: { style: 'dinamico' } },
  mrbeast: { label: 'Ritmo frenético (estilo MrBeast)', desc: 'Corte a cada segundo, zoom e som em tudo, cores fortes, texto grande.',
    pacing: { avgShot: 0.9, minShot: 0.35, maxShot: 2.2, variation: 0.4 }, hook: { enabled: true, seconds: 3 }, silence: { remove: true, minLen: 0.15, pad: 0.03 },
    transitions: { mix: { cut: 0.75, zoom: 0.1, whip: 0.1, flash: 0.05 }, dur: 0.15 }, effects: { punchIn: 1, shake: 0.3, flash: 0.25 },
    color: { look: 'vibrant', intensity: 0.9 }, music: { mood: 'upbeat', levelDb: -18, duckDb: -14 }, sfx: { density: 0.75, kinds: ['whoosh', 'pop', 'click', 'impact', 'ding'] }, captions: { style: 'hormozi' } },
  fashion: { label: 'Moda', desc: 'Cortes na batida, câmera lenta elegante, cor lavada e sofisticada.',
    pacing: { avgShot: 1.6, minShot: 0.6, maxShot: 4, variation: 0.6, beatSync: true }, silence: { remove: false },
    transitions: { mix: { cut: 0.6, flash: 0.15, dissolve: 0.25 }, dur: 0.25 }, effects: { punchIn: 0.2, slowmo: 0.35, flash: 0.2 },
    color: { look: 'faded', intensity: 0.85 }, music: { mood: 'electronic', levelDb: -8, duckDb: -6 }, sfx: { density: 0.1, kinds: ['whoosh'] }, captions: { style: 'minimal' } },
  food: { label: 'Comercial de comida', desc: 'Close, câmera lenta, cores quentes e vivas, cortes no ritmo.',
    pacing: { avgShot: 1.5, minShot: 0.6, maxShot: 3.5, variation: 0.5, beatSync: true }, silence: { remove: false },
    transitions: { mix: { cut: 0.7, whip: 0.15, zoom: 0.15 }, dur: 0.2 }, effects: { punchIn: 0.5, slowmo: 0.4 },
    color: { look: 'warmfilm', intensity: 0.8 }, music: { mood: 'upbeat', levelDb: -10, duckDb: -10 }, sfx: { density: 0.35, kinds: ['whoosh', 'pop'] }, captions: { style: 'clean' } },
  event: { label: 'Resumo de evento', desc: 'Melhores momentos no ritmo da música, transições rápidas, final marcante.',
    pacing: { avgShot: 1.3, minShot: 0.5, maxShot: 3, variation: 0.5, beatSync: true }, silence: { remove: false },
    transitions: { mix: { cut: 0.65, flash: 0.1, whip: 0.15, zoom: 0.1 }, dur: 0.2 }, effects: { punchIn: 0.4, slowmo: 0.25, flash: 0.2, lightLeak: 0.3 },
    color: { look: 'bright', intensity: 0.8 }, music: { mood: 'upbeat', levelDb: -7, duckDb: -6 }, sfx: { density: 0.2, kinds: ['whoosh'] }, captions: { style: 'clean' } },
  bts: { label: 'Bastidores', desc: 'Câmera na mão, cortes secos, cor natural, som ambiente.',
    pacing: { avgShot: 2, minShot: 0.7, maxShot: 5, variation: 0.7 }, silence: { remove: true },
    transitions: { mix: { cut: 0.9, glitch: 0.1 }, dur: 0.15 }, effects: { punchIn: 0.3, shake: 0.15 },
    color: { look: 'natural', intensity: 0.6, grain: 0.08 }, music: { mood: 'electronic', levelDb: -16, duckDb: -12 }, sfx: { density: 0.15, kinds: ['click'] }, captions: { style: 'minimal' } },
  news: { label: 'Reportagem', desc: 'Ritmo informativo, cor neutra, nome na tela, música discreta.',
    pacing: { avgShot: 3.2, minShot: 1.2, maxShot: 8, variation: 0.3 }, silence: { remove: true },
    transitions: { mix: { cut: 0.85, dissolve: 0.15 }, dur: 0.35 }, effects: { punchIn: 0.1 },
    color: { look: 'natural', intensity: 0.5 }, music: { mood: 'reflective', levelDb: -26, duckDb: -18 }, sfx: { density: 0.05, kinds: ['whoosh'] }, captions: { style: 'clean' } },
  education: { label: 'Educativo', desc: 'Claro e direto: sem tempo morto, zoom nas partes importantes, legenda limpa.',
    pacing: { avgShot: 2.8, minShot: 1, maxShot: 7, variation: 0.4 }, silence: { remove: true, minLen: 0.3 },
    transitions: { mix: { cut: 0.9, dissolve: 0.1 }, dur: 0.3 }, effects: { punchIn: 0.35 },
    color: { look: 'bright', intensity: 0.55 }, music: { mood: 'reflective', levelDb: -26, duckDb: -18 }, sfx: { density: 0.15, kinds: ['pop', 'click'] }, captions: { style: 'clean' } },
  motivational: { label: 'Motivacional', desc: 'Música crescendo, câmera lenta, cor dramática, frases fortes.',
    pacing: { avgShot: 2.2, minShot: 0.8, maxShot: 5, variation: 0.5, emotionAware: true }, silence: { remove: true },
    transitions: { mix: { cut: 0.6, dissolve: 0.25, flash: 0.15 }, dur: 0.35 }, effects: { punchIn: 0.5, slowmo: 0.3, lightLeak: 0.25 },
    color: { look: 'moody', intensity: 0.8 }, music: { mood: 'epic', levelDb: -14, duckDb: -12 }, sfx: { density: 0.25, kinds: ['impact', 'riser', 'whoosh'] }, captions: { style: 'hormozi' } },
  product: { label: 'Anúncio de produto', desc: 'Close no produto, cortes limpos na batida, cor comercial, texto direto.',
    pacing: { avgShot: 1.6, minShot: 0.6, maxShot: 3.5, variation: 0.4, beatSync: true }, silence: { remove: true },
    transitions: { mix: { cut: 0.7, zoom: 0.15, slide: 0.15 }, dur: 0.22 }, effects: { punchIn: 0.5, slowmo: 0.2 },
    color: { look: 'commercial', intensity: 0.8 }, music: { mood: 'upbeat', levelDb: -12, duckDb: -12 }, sfx: { density: 0.3, kinds: ['whoosh', 'pop', 'ding'] }, captions: { style: 'clean' } },
};

for (const k of Object.keys(PRESETS)) {
  const p = PRESETS[k];
  PRESETS[k] = {
    id: k, label: p.label, desc: p.desc,
    pacing: { ...base.pacing, ...p.pacing }, hook: { ...base.hook, ...p.hook }, silence: { ...base.silence, ...p.silence },
    transitions: { mix: p.transitions ? p.transitions.mix : base.transitions.mix, dur: p.transitions ? p.transitions.dur : base.transitions.dur },
    effects: { ...base.effects, ...p.effects }, color: { ...base.color, ...p.color }, music: { ...base.music, ...p.music },
    sfx: { ...base.sfx, ...p.sfx }, captions: { ...base.captions, ...p.captions }, ending: { ...base.ending, ...p.ending },
  };
  // campos extras do preset (formato, zoom lento, zoom nas palavras...) seguem junto
  for (const [kk, v] of Object.entries(p)) if (!(kk in PRESETS[k]) && !(kk in base)) PRESETS[k][kk] = v;
}

// Mistura ponderada de presets ("70% documentário, 30% ação").
export function blendPresets(mix) {
  const items = mix.filter(m => PRESETS[m.id] && m.w > 0);
  if (!items.length) return JSON.parse(JSON.stringify(PRESETS.social));
  const tot = items.reduce((s, m) => s + m.w, 0);
  const W = items.map(m => ({ p: PRESETS[m.id], w: m.w / tot })).sort((a, b) => b.w - a.w);
  const main = W[0].p;
  const num = (get) => W.reduce((s, x) => s + get(x.p) * x.w, 0);
  const out = JSON.parse(JSON.stringify(main));
  for (const k of ['avgShot', 'minShot', 'maxShot', 'variation']) out.pacing[k] = num(p => p.pacing[k]);
  out.pacing.beatSync = num(p => p.pacing.beatSync ? 1 : 0) >= 0.5;
  out.hook.enabled = num(p => p.hook.enabled ? 1 : 0) >= 0.3;
  out.silence.minLen = num(p => p.silence.minLen); out.silence.pad = num(p => p.silence.pad);
  out.silence.remove = num(p => p.silence.remove ? 1 : 0) >= 0.5;
  for (const k of ['punchIn', 'slowmo', 'shake', 'flash', 'lightLeak']) out.effects[k] = num(p => p.effects[k] || 0);
  out.effects.speedRamp = num(p => p.effects.speedRamp ? 1 : 0) >= 0.3;
  out.effects.letterbox = num(p => p.effects.letterbox ? 1 : 0) >= 0.5;
  const mixT = {};
  W.forEach(x => { for (const [t, v] of Object.entries(x.p.transitions.mix)) mixT[t] = (mixT[t] || 0) + v * x.w; });
  out.transitions.mix = mixT; out.transitions.dur = num(p => p.transitions.dur);
  out.music.levelDb = num(p => p.music.levelDb); out.music.duckDb = num(p => p.music.duckDb);
  out.sfx.density = num(p => p.sfx.density);
  out.sfx.kinds = [...new Set(W.flatMap(x => x.p.sfx.kinds))];
  out.color.intensity = num(p => p.color.intensity);
  // a cor vem de quem pesa mais, mas se a mistura for perto de 50/50 o diretor pode trocar
  out.id = W.map(x => `${Math.round(x.w * 100)}% ${x.p.id}`).join(' + ');
  out.label = W.map(x => `${Math.round(x.w * 100)}% ${x.p.label}`).join(' + ');
  return out;
}
