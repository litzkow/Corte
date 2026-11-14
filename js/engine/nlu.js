// Camada de entendimento: corrige digitação, junta sinônimos e gírias (PT/EN) num vocabulário único,
// acha referências de tempo e sugere pedidos parecidos quando não entende.

import { KNOWN } from './vocab.js';

// ---------- 1. Sinônimos e gírias → forma canônica (o resto do diretor só conhece a forma canônica) ----------
// Ordem importa: frases longas primeiro.
const SYN = [
  // ---- pedidos que antes confundiam com outra coisa (vêm primeiro) ----
  [/\b(deixa |deixe |fica |com )?(mais vivo|mais viva|com mais vida|mais vida|cores? vivas?)\b/g, ' ajuste saturar '],
  [/\b(musica|trilha|music)\b([^,;.]{0,25}?)\bmais (calma|calmo|tranquila|suave|leve|relaxante|chill)\b/g, ' $1$2 calma '],
  [/\b(musica|trilha|music)\b([^,;.]{0,25}?)\bmais (animada|alegre|feliz|agitada|pra cima)\b/g, ' $1$2 animada '],
  [/\b(a |the )?(musica|music|trilha)\s+(entra|comeca|vem|chega|aparece|ta entrando|esta entrando)\s+(muito |bem |meio |um pouco )?(alta|alto|forte|estourada|estourado)\b/g, ' musica mais baixa '],
  [/\b(abaixa|abaixe|diminui|diminua|baixa|reduz|reduza|lower|turn down)\s+(um pouco |um pouquinho |bastante |mais |bem )?(o |a )?((som|volume|audio|altura) d[ae]\s+)?(a |the )?(musica|music|trilha)\b/g, ' musica mais baixa '],
  [/\b(aumenta|aumente|sobe|suba|turn up|raise)\s+(um pouco |um pouquinho |bastante |mais |bem )?(o |a )?((som|volume|audio|altura) d[ae]\s+)?(a |the )?(musica|music|trilha)\b/g, ' musica mais alta '],
  [/\b(aumenta|aumente|sobe|suba|turn up|raise|realca|realce|levanta)\s+(um pouco |um pouquinho |bastante |mais |bem )?(o |a )?((som|volume|audio) d[ae]\s+)?(a |o |the |my |minha |meu |sua |seu )?(voz|fala|dialogo|voice|speech|narracao|vozes)\b/g, ' voz mais alta '],
  [/\b(a |minha |sua |the |my )?(voz|fala|narracao|voice)\s+(ta|esta|tá|ficou|is)\s+(muito |bem |meio |um pouco |too )?(baixa|baixinha|fraca|quiet|low|abafada)\b/g, ' voz mais alta '],
  [/\b(tira|tire|remove|remova|sem|chega de|para com|nao quero|no)\s+(os |o |esses |esse |todos os |the |more )?(zooms?|zoomzinhos?|zoom in|punch ?ins?)\b/g, ' sem zoom '],
  [/\b(aumenta|aumente|sobe|suba|mais|increase|more)\s+(o |um pouco o |um pouco de |the )?(contraste|contrast)\b/g, ' ajuste contraste mais '],
  [/\b(diminui|diminua|abaixa|tira|reduz|menos|decrease|less)\s+(o |um pouco o |the )?(contraste|contrast)\b/g, ' ajuste contraste menos '],
  [/\b(aumenta|aumente|sobe|suba|mais|increase|more)\s+(o |um pouco o |the )?(brilho|exposicao|luz|brightness|exposure)\b/g, ' ajuste clarear '],
  [/\b(diminui|diminua|abaixa|reduz|menos|decrease|less)\s+(o |um pouco o |the )?(brilho|exposicao|brightness|exposure)\b/g, ' ajuste escurecer '],
  [/\b(aumenta|aumente|sobe|mais|increase|more)\s+(a |um pouco a |the )?(saturacao|saturation)\b/g, ' ajuste saturar '],
  [/\b(diminui|diminua|abaixa|reduz|menos|tira|decrease|less)\s+(a |um pouco a |the )?(saturacao|saturation)\b/g, ' ajuste dessaturar '],
  [/\b(o |esse |este )?(video |corte |reels |edicao )?(ta|esta|tá|ficou|is|its)\s+(muito |bem |meio |um pouco |mt |too |a bit )?(longo|comprido|extenso|cansativo|long|too long)( demais)?\b/g, ' mais curto '],
  [/\b(o |esse |este )?(video |corte |reels |edicao )?(ta|esta|tá|ficou|is|its)\s+(muito |bem |meio |um pouco |mt |too |a bit )?(curto|curtinho|short)( demais)?\b/g, ' mais longo '],
  [/\b(no maximo|no max|maximo de|max|ate|at most|up to|menos de)\s+(\d+(?:[.,]\d+)?)\s*(s|seg|segundos?|seconds?|min|minutos?|minutes?)\b/g, ' $2 $3 '],
  [/\b(a |as )?(legenda|legendas|letra|letras)\s+(ta|esta|tá|ficou|estao|tao|is|are)\s+(muito |bem |meio |um pouco |mt |too |a bit )?(grande|grandes|enorme|enormes|gigante|gigantes|big|huge)( demais)?\b/g, ' legenda menor '],
  [/\b(a |as )?(legenda|legendas|letra|letras)\s+(ta|esta|tá|ficou|estao|tao|is|are)\s+(muito |bem |meio |um pouco |mt |too |a bit )?(pequena|pequenas|pequenininha|miuda|small|tiny)( demais)?\b/g, ' legenda maior '],
  [/\b(diminui|diminua|reduz|reduza|abaixa|encolhe|shrink)\s+(um pouco |mais )?(o tamanho d)?(a |as )?(legenda|legendas|letra|letras)\b/g, ' legenda menor '],
  [/\b(aumenta|aumente|amplia|cresce)\s+(um pouco |mais )?(o tamanho d)?(a |as )?(legenda|legendas|letra|letras)\b/g, ' legenda maior '],
  [/\b(da uma melhorada( geral)?|melhora (tudo|o video|isso|geral|a edicao)|deixa (mais )?(top|melhor|caprichado|perfeito)|capricha( mais)?|deixa (ele |o video )?(bom|bonito)|melhoria geral|improve (it|everything)|make it (better|pro|professional)|polish( it)?)\b/g, ' melhorar geral '],
  [/\b(ajusta|ajuste|arruma|arrume|conserta|melhora|melhore|equaliza|balanceia|mixa|limpa)\s+(o |a )?(som|audio|mixagem|volume|volumes|sound|mix)\b|\bfix the (audio|sound)\b/g, ' arrumar som '],
  [/\b(nao gostei|nao curti|nao ficou bom|nao ficou legal|ficou (ruim|feio|estranho|esquisito|horrivel|zoado|meh)|ta (estranho|esquisito|ruim|feio|horrivel|zoado)|esta (estranho|esquisito|ruim|feio)|odiei|horrivel|i (dont|don't) like it|not good|looks (bad|weird|off))\b(?!\s*(a |o |as |os )?(cor|cores|filtro|musica|legenda|letra|transic|som|audio|colou?r))/g, ' nao gostei refazer '],
  [/(?<!(musica|trilha|music) )\b(comeca|comece|comecar|inicia|inicie|abre|abra)\s+(direto|ja|logo|o video)?\s*(no|na|em|a partir d[oea]|pelo|pela|do|da|at)\s+(?=\d)/g, ' abre com o trecho de '],
  [/\b(refrao|refrão|drop|chorus|parte mais forte da musica|climax da musica|parte boa da musica|melhor parte da musica)\b/g, ' musica no refrao '],
  [/\b(sem musica|tira a musica|nao (coloca|quero) musica)\s+(no|nos|na)\s+(comeco|inicio|abertura|primeiros?\s+(\d+\s*)?(s|seg|segundos?))\b|\b(a )?musica (so )?(entra|comeca)\s+(depois|mais tarde|so depois|no meio|aos|em|no segundo)\b/g, ' musica entra depois '],
  [/\b(palavroes?|palavrao|palavras? feias?|xingamentos?|xingos?|swear ?words?|curse ?words?|profanity|bipa|bipar|bip|beep|censura|censurar|censor)\b/g, ' bipar palavroes '],
  [/\b(segue|siga|seguir|acompanha|acompanhar|follow)\s+(o |a |meu |minha |the |my )?(rosto|cara|pessoa|face|person|cabeca|me)\b|\b(enquadra|enquadre|centraliza|centralize|centraliza|deixa)\s+(melhor|o rosto|a pessoa|meu rosto|o rosto no centro|a cara)\b|\b(rosto|cara|pessoa) no centro\b|\b(mais )?(perto|proximo|fechado) (do|no) rosto\b|\bclose no rosto\b|\bcenter (the |my )?face\b/g, ' enquadrar rosto '],
  [/\b(zoom (lento|devagar|suave|lentinho|bem devagar)|empurrao lento|aproximacao lenta|zoom in lento|slow (zoom|push)|ken burns|camera (aproximando|se aproximando) devagar)\b/g, ' zoom lento '],
  // ritmo
  [/\b(deixa|deixe|fica|faz|faca|torna|make it|keep it)?\s*(mais|more)\s+(agil|dinamico|dinamica|frenetico|frenetica|acelerado|acelerada|energetico|energetica|ritmado|ritmada|elettrico|eletrico|nervoso|intenso no ritmo|pegada|corrido|corrida|vivo|viva)\b/g, ' mais rapido '],
  [/\b(da uma (acelerada|agilizada|apressada|enxugada)|uma acelerada|enxuga|enxugar|mais enxuto)\b/g, ' mais rapido '],
  [/\b(mais (energia|forca|impacto|pegada|vida) (no|logo no) (comeco|inicio)|(o )?(comeco|inicio|abertura) (ta |esta |ficou )?(muito |meio |bem )?(fraco|fraca|chato|chata|parado|parada|devagar|lento|lenta|sem graca|morno|morna)|weak (start|opening|intro)|boring (start|intro)|momento mais forte|melhor momento no comeco)\b/g, ' gancho '],
  [/\b(acelera(r)?( o ritmo| os cortes| a edicao| tudo)?|agiliza(r)?|dinamiza(r)?|mais ritmo|mais pegada|mais energia no ritmo|corta mais|mais cortes|picota mais|picotar mais|cortes curtinhos|cortes curtos|ritmo mais rapido|ritmo acelerado|snappier|snappy|tighter|punchier|quicker|speed it up|faster pace|more cuts|cut faster)\b/g, ' mais rapido '],
  [/\b(desacelera(r)?|mais calmo|mais calma|mais tranquilo|mais tranquila|mais suave no ritmo|menos cortes|cortes mais longos|cortes longos|deixa respirar|da uma respirada|ritmo mais lento|slow it down|slower pace|calmer|less cuts|fewer cuts|more relaxed|mais devagarinho|mais lentinho)\b/g, ' mais lento '],
  [/\b(ta|esta|tá|ficou|is|its|it's)\s+(muito\s+|mt\s+|bem\s+|too\s+)?(rapido|acelerado|corrido|frenetico|fast|rushed|hectic)\b/g, ' mais lento '],
  [/\b(ta|esta|ficou|is|its)\s+(muito\s+|mt\s+|bem\s+|too\s+)?(lento|parado|arrastado|chato|devagar|slow|boring|draggy)\b/g, ' mais rapido '],
  // legenda
  [/\b(legendinha|legendinhas|subtitulo|subtitulos|letreiro da fala|texto da fala|escrita da fala|closed captions?|cc|subs|subtitles?|captions?)\b/g, ' legenda '],
  [/\b(texto|textos|escrita|escritas|letras|letra)\s+(que aparece|aparecendo|na tela|no video|on screen)\b/g, ' legenda '],
  // música
  [/\b(trilha sonora|som de fundo|musica de fundo|musiquinha|fundo musical|background music|bgm|soundtrack|the song|the track|o som de fundo|a batida|o beat)\b/g, ' musica '],
  [/\b(nao (da|consigo|consegue) (pra |para )?(ouvir|entender) (a |o )?(voz|fala|que (eu|ele|ela) (fala|diz)))|(cant|can't|cannot) hear (the |my )?(voice|speech|talking)/g, ' musica mais baixa e voz mais alta '],
  [/\b(a |the )?(musica|music)\s+(ta |esta |tá |is |fica )?(abafando|cobrindo|atrapalhando|engolindo|matando|drowning|covering|over ?powering)\s+(a |o |minha |meu |my |the )?(voz|fala|voice|speech|dialogo)\b/g, ' musica mais baixa '],
  [/\b(a |the )?(musica|music)\s+(ta |esta |tá |is |ficou |its )?(muito\s+|mt\s+|bem\s+|too\s+|so\s+)?(alta|forte|loud|alto|altona)( demais)?\b/g, ' musica mais baixa '],
  [/\b(a |the )?(musica|music)\s+(ta|esta|tá|is|ficou)\s+(muito\s+|mt\s+|bem\s+|too\s+)?(baixa|fraca|quiet|low|baixo)\b/g, ' musica mais alta '],
  [/\b(abaixa|abaixe|diminui|diminua|baixa|reduz|lower|turn down)\s+(o volume d[ae]\s+)?(a |the )?(musica|music)\b/g, ' musica mais baixa '],
  [/\b(aumenta|aumente|sobe|suba|turn up|raise)\s+(o volume d[ae]\s+)?(a |the )?(musica|music)\b/g, ' musica mais alta '],
  [/\b(aumenta|aumente|sobe|suba|turn up|raise|realca|realce)\s+(o volume d[ae]\s+)?(a |o |the |my )?(voz|fala|dialogo|voice|speech|narracao)\b/g, ' voz mais alta '],
  [/\b(abaixa|abaixe|diminui|baixa|lower)\s+(o volume d[ae]\s+)?(a |o |the )?(voz|fala|voice|narracao)\b/g, ' voz mais baixa '],
  [/\b(tira|tire|remove|remova|sem|corta|mute|muta|silencia|zera)\s+(o |a |the )?(som|audio|barulho|volume)\s+(original|do video|dos videos|de fundo do video|ambiente|da camera)\b|\bmute (the )?(original|video) (audio|sound)\b|\bsem som original\b/g, ' sem som original '],
  // efeitos sonoros
  [/\befeitos? (de |do |da )?(impacto|impactos|pancada|pancadas|explosao|explosoes|whoosh|som|sonoro)\b/g, ' efeitos sonoros de impacto '],
  [/\b(sem efeitos?( nenhum| visuais| visual)?|nenhum efeito|zero efeitos?|no effects|without effects)\b/g, ' menos efeitos menos transicoes '],
  [/\b(transic\w*|transitions?)\s+(ta |tao |estao |esta |are |is )?(muito |bem |too )?(exagerad\w*|demais|over the top|too much|cafona|cafonas|bregas?)\b|\b(menos transic\w*|fewer transitions|less transitions)\b/g, ' menos transicoes '],
  [/\b(nao quero|nao coloca|nao coloque|nao precisa de|sem nenhuma|without|no)\s+(as |a |the |any )?(transic\w*|transitions?)\b/g, ' sem transicao '],
  [/\b(efeitinhos?( sonoros)?|barulhinhos?|sons? de efeito|sfx|sound fx|swoosh|whooshes|vushs?)\b/g, ' efeitos sonoros '],
  // cor
  [/\b(ta|esta|tá|ficou|is|its)\s+(muito |mt |bem |meio |um pouco |too |a bit )?(escuro|escura|dark)( demais)?\b/g, ' ajuste clarear '],
  [/\b(ta|esta|tá|ficou|is|its)\s+(muito |mt |bem |meio |too )?(claro|clara|estourad[oa]|bright)( demais)?\b/g, ' ajuste escurecer '],
  [/\b(mais claro|mais clara|mais iluminado|mais iluminada|clareia|clarear|clareie|mais luz|brighter|brighten|more light|ta escuro|esta escuro|ficou escuro|too dark)\b/g, ' ajuste clarear '],
  [/\b(mais escuro|mais escura|escurece|escurecer|escureca|menos luz|darker|darken|ta claro demais|muito claro|ficou estourado|too bright)\b/g, ' ajuste escurecer '],
  [/\b(ta|esta|ficou|is|its)\s+(muito |mt |bem |meio |too )?(saturad[oa]|colorid[oa] demais|oversaturated)( demais)?\b/g, ' ajuste dessaturar '],
  [/\b(ta|esta|ficou)\s+(muito |meio |bem )?(sem cor|apagad[oa]|lavad[oa]|sem vida|cinza|palid[oa])\b|\b(da|de) (uma )?vida\b|\bmake it pop\b|\bpop more\b|\bmais vibe\b|\bda um up\b/g, ' ajuste saturar ajuste contraste mais '],
  [/\b(mais warm|more warmth|warmer colou?rs)\b/g, ' ajuste esquentar '],
  [/\b(mais saturado|mais saturada|mais cor|cores mais vivas|mais colorido|mais colorida|cores fortes|more saturated|more colou?r|more vibrant|vibrante)\b/g, ' ajuste saturar '],
  [/\b(menos saturado|menos saturada|menos cor|cores lavadas|dessatura|desaturate|less saturated|less colou?r|muted colou?rs|cores apagadas)\b/g, ' ajuste dessaturar '],
  [/\b(mais quente|mais quentinho|mais alaranjado|tom quente|warmer|more warm|golden hour)\b/g, ' ajuste esquentar '],
  [/\b(mais frio|mais fria|mais azulado|tom frio|cooler|colder|more blue)\b/g, ' ajuste esfriar '],
  [/\b(mais contraste|mais contrastado|more contrast|punchy colou?rs)\b/g, ' ajuste contraste mais '],
  [/\b(menos contraste|less contrast|mais lavado|flat)\b/g, ' ajuste contraste menos '],
  [/\b(preto e branco|black and white|p&b|pb|monocromatico|monochrome|sem cor nenhuma|cinza)\b/g, ' preto e branco '],
  // enquadramento
  [/\b(show|keep|see)\s+(the )?(whole|entire|full)\s+(video|image|frame|picture)\b/g, ' enquadrar inteiro '],
  [/\b(mostra|mostrar|mostre|deixa|show|keep)\s+(o |a |the )?(video|imagem|quadro|tela|image|frame)\s+(inteiro|inteira|todo|toda|completo|completa|whole|entire|full)\b|\b(sem cortar (as )?(laterais|lados|bordas|nada)|nao (corta|corte|cortar) (as |os )?(laterais|lados|bordas)|fundo desfocado|blur(red)? background|com borrado atras|fit to frame|letterbox vertical)\b/g, ' enquadrar inteiro '],
  [/\b((meu |o |a )?(rosto|cabeca|cara|corpo) (aparece |ta |esta |fica |ficou )?(cortad[oa]|pela metade)|mostra tudo|aparecer tudo|cabe tudo|fit the whole)\b/g, ' enquadrar inteiro '],
  [/\b(preenche|preencher|preencha|tela cheia|fill the (screen|frame)|crop to fill|cortar as laterais|corta as laterais|zoom para preencher)\b/g, ' enquadrar preencher '],
  [/\b(espelhad[oa]|espelha|espelhar|espelhe|inverte (a imagem|o lado|horizontal)|mirror|flip( it| the video)? horizontal(ly)?|inverter lados)\b/g, ' espelhar '],
  // títulos
  [/\b(titulo|titulos|texto|frase|chamada|manchete|headline|hook text|caption on top)\s+(no topo|em cima|la em cima|na parte de cima|no alto|at the top|on top)\b|\b(manchete|headline)\b/g, ' manchete '],
  [/\b(barra de progresso|barrinha de progresso|progress bar|barra que vai enchendo|linha de progresso)\b/g, ' barra de progresso '],
  [/\b(zoom|pulo|pulso|tranco|bump|pulse)\s+(na|nas|no|on the|with the|in the)\s+(batida|batidas|beat|beats|ritmo)\b|\b(pulsar|pulsando|pulsa) (com|na|no) (a )?(musica|batida|beat)\b|\bbeat (zoom|pulse|bump)s?\b/g, ' pulso na batida '],
  [/\b(zoom|aproxima|zoomzinho|punch in)\s+(nas|em|on)\s+(palavras?|partes?|frases?)\s+(importantes?|fortes?|chave|key|important)\b/g, ' zoom nas palavras fortes '],
  [/\b(gaguej\w*|tropec\w*|enrolei|me enrolei|errei a fala)\b/g, ' muletas '],
  [/\b(e{2,}h*|a+h{2,}|ah+n+|h+u+m+|u+h+m*|e+h+|ahns?|ehs?|hum+|uhm*|é\.\.\.|muletas?|vicios? de linguagem|filler words?|ums? and ahs?|gaguejadas?|gagueira|tropecos?|erros de fala)\b/g, ' muletas '],
  // gancho
  [/\b(gancho|hook|isca|abertura forte|comeco forte|inicio forte|prender (a )?atencao|segurar (a )?pessoa|reter|retencao|que prenda|chamar atencao)\b/g, ' gancho '],
  // formatos
  [/\b(stories|story|status do whats(app)?)\b/g, ' reels '],
  [/\b(tik tok|tiktok|tk)\b/g, ' tiktok '],
  [/\b(yt shorts|shorts do youtube|youtube shorts|short do youtube)\b/g, ' shorts '],
  [/\b(yt|youtube normal|video do youtube|video longo|horizontal|deitado|na horizontal)\b/g, ' youtube '],
  [/\b(vertical|em pe|de pe|na vertical|9 por 16|9x16)\b/g, ' vertical '],
  // geral
  [/\b(nao precisa de|dispensa|dispensar)\s+(a |o )?(musica|music)\b/g, ' sem musica '],
  [/\b(nao quero|nao coloca|nao coloque|nao bota|nao bote|tira|tire|remove|remova|apaga|apague|exclui|exclua|elimina|elimine|sem|get rid of|dont want|don't want|no more)\s+(a |o |os |as |the |any )?(musica|music)\b/g, ' sem musica '],
  [/\b(nao quero|nao coloca|tira|tire|remove|remova|apaga|sem|get rid of|no)\s+(a |as |the |any )?(legenda|legendas)\b/g, ' sem legenda '],
  [/\b(bota|bote|coloca|coloque|poe|ponha|insere|insira|adiciona|adicione|mete|joga|add|put|include|throw in)\b/g, ' adiciona '],
];

// ---------- 2. Assuntos/gêneros → estilo (amplia muito o que ele entende) ----------
export const TOPIC_STYLE = [
  [/\b(terror|horror|assustador|medo|suspense|scary|creepy|sombrio)\b/, { mix: 'trailer', look: 'moody', mood: 'dramatic', say: 'Clima de suspense/terror' }],
  [/\b(comedia|engracado|engracada|humor|meme|zoeira|funny|comedy|hilario)\b/, { mix: 'energetic', look: 'bright', mood: 'upbeat', say: 'Clima de humor' }],
  [/\b(romantico|romantica|romance|apaixonad|love story|casal|namorad)\b/, { mix: 'emotional', look: 'warmfilm', mood: 'emotional', say: 'Clima romântico' }],
  [/\b(nostalgic\w*|nostalgia|saudade|lembrancas|memorias|throwback|old school|anos 90|anos 2000)\b/, { mix: 'emotional', look: 'vintage', mood: 'emotional', say: 'Clima nostálgico' }],
  [/\b(motivacional|motivacao|inspirador|inspiracional|motivational|inspiring|superacao)\b/, { mix: 'trailer', look: 'epic', mood: 'epic', say: 'Vídeo motivacional' }],
  [/\b(academia|treino|fitness|musculacao|crossfit|workout|gym|corrida|maratona)\b/, { mix: 'sports', look: 'action', mood: 'electronic', say: 'Vídeo de treino' }],
  [/\b(receita|culinaria|comida|cozinha|food|recipe|cooking|restaurante|prato)\b/, { mix: 'commercial', look: 'warmfilm', mood: 'upbeat', say: 'Vídeo de comida' }],
  [/\b(produto|unboxing|review|resenha|loja|venda|anuncio de produto|ecommerce|e-commerce)\b/, { mix: 'commercial', look: 'commercial', mood: 'upbeat', say: 'Vídeo de produto' }],
  [/\b(imovel|imobiliaria|casa a venda|apartamento|real estate|tour pela casa|house tour)\b/, { mix: 'cinematic', look: 'bright', mood: 'atmospheric', say: 'Tour de imóvel' }],
  [/\b(tutorial|passo a passo|how to|como fazer|aula|explicando|explicacao|educativo|didatico)\b/, { mix: 'interview', look: 'natural', mood: 'reflective', say: 'Vídeo explicativo' }],
  [/\b(noticia|jornal|reportagem|news|jornalistico)\b/, { mix: 'documentary', look: 'natural', mood: 'reflective', say: 'Formato de notícia' }],
  [/\b(historia antiga|imperio|imperios|guerra|guerras|batalha|batalhas|mitologia|grecia|grega|grego|roma|romano|romana|lenda|lendas|historia do mundo|ancient|battle|myth\w*|egito|viking\w*|cruzada\w*|faraos?)\b/, { mix: 'trailer', look: 'epic', mood: 'epic', say: 'História épica' }],
  [/\b(aniversario|festa|balada|show ao vivo|show de musica|evento|birthday|party)\b/, { mix: 'musicvideo', look: 'commercial', mood: 'upbeat', say: 'Vídeo de festa/evento' }],
  [/\b(natureza|paisagem|trilha|praia|montanha|nature|landscape|drone)\b/, { mix: 'travel', look: 'warmfilm', mood: 'atmospheric', say: 'Natureza e paisagem' }],
  [/\b(crianca|criancas|bebe|kids|infantil|familia|family)\b/, { mix: 'vlog', look: 'bright', mood: 'upbeat', say: 'Vídeo de família' }],
  [/\b(carro|carros|moto|motos|automotivo|car|cars|racing|corrida de carro)\b/, { mix: 'sports', look: 'action', mood: 'electronic', say: 'Vídeo automotivo' }],
  [/\b(moda|look do dia|ootd|fashion|desfile|maquiagem|makeup|beleza)\b/, { mix: 'luxury', look: 'commercial', mood: 'upbeat', say: 'Moda e beleza' }],
  [/\b(antes e depois|before and after|transformacao|glow up)\b/, { mix: 'social', look: 'commercial', mood: 'upbeat', say: 'Antes e depois' }],
  [/\b(netflix|serie|documentario da netflix|true crime)\b/, { mix: 'documentary', look: 'moody', mood: 'dramatic', say: 'Documentário estilo série' }],
  [/\b(dark|canal dark|curiosidades|misterio|misterios|mystery)\b/, { mix: 'documentary', look: 'moody', mood: 'dramatic', say: 'Formato canal dark/curiosidades' }],
];

// ---------- 3. Correção de digitação (palavras que o diretor precisa reconhecer) ----------
const VOCAB = ('rapido lento devagar legenda legendas musica musicas silencio silencios pausa pausas corte cortes transicao transicoes '
  + 'acao cinematografico cinematografica documentario emocionante emocional epico epica dramatico dramatica efeitos sonoros impacto impactos '
  + 'camera lenta zoom tremor granulado vinheta cor cores quente frio claro escuro saturado contraste preto branco '
  + 'tiktok reels instagram shorts youtube vertical horizontal quadrado segundos segundo minutos minuto metade inicio comeco final fim meio '
  + 'abertura gancho titulo manchete texto circulo arco onda selo espiral fita palavra palavras destaque karaoke versoes versao '
  + 'estilo podcast entrevista viagem casamento esportivo comercial luxo vlog gaming minimalista corporativo videoclipe trailer '
  + 'remove tira apaga adiciona coloca mantem deixa aumenta diminui abaixa sobe intensa intenso mais menos muito pouco sem com '
  + 'narracao voz fala original volume batida ritmo progresso espelhar inteiro desfocado congela congelar divide dividir '
  + 'referencia parecido igual exportar qualidade fotos foto imagens imagem trecho parte momento').split(' ');
const VSET = new Set(VOCAB);

function dl(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}
// palavras comuns que NÃO devem ser "corrigidas"
const KEEP = new Set('que para pra com sem mais menos isso esse essa este esta muito pouco bem mal tudo nada todo toda fazer faz faca deixa deixe quero queria gostei gostaria agora depois antes entao tambem the and with more less make video videos pode poder fica ficou esta voce meu minha seu sua dele dela nos eles elas uma um uns umas dos das nos nas aos pelo pela onde quando como porque mas porem'.split(' '));
// Corrige só palavra DESCONHECIDA, e só para uma palavra conhecida bem parecida (mesma inicial; com 2 letras de diferença, mesmo começo).
const TARGETS = [...new Set([...VOCAB, ...KNOWN])].filter(w => w.length >= 4);
export function fixTypos(s) {
  const fixed = [];
  const out = s.replace(/[a-z]{4,}/g, w => {
    if (VSET.has(w) || KEEP.has(w) || KNOWN.has(w)) return w;
    // plural e formas derivadas de palavra conhecida ficam como estão
    if ((w.endsWith('s') && (KNOWN.has(w.slice(0, -1)) || VSET.has(w.slice(0, -1)))) || (w.endsWith('es') && KNOWN.has(w.slice(0, -2)))) return w;
    for (let k = w.length - 1; k >= 5; k--) if (KNOWN.has(w.slice(0, k)) && k >= w.length - 3) return w;
    if (w.length < 5 && !/^(muic|legd|musc|vdeo|rapd)/.test(w)) return w;
    const max = w.length >= 8 ? 2 : 1;
    let best = null, bd = max + 1;
    for (const v of TARGETS) {
      if (Math.abs(v.length - w.length) > max || v[0] !== w[0]) continue;
      const d = dl(w, v, max);
      if (d === 2 && v.slice(0, 3) !== w.slice(0, 3)) continue;
      if (d < bd || (d === bd && VSET.has(v) && !VSET.has(best))) { bd = d; best = v; }
    }
    if (best && bd <= max) { fixed.push([w, best]); return best; }
    return w;
  });
  return { text: out, fixed };
}

export function canon(sNorm) {
  let s = ' ' + sNorm + ' ';
  const { text, fixed } = fixTypos(s);
  s = text;
  for (const [re, rep] of SYN) s = s.replace(re, rep);
  return { text: s.replace(/\s+/g, ' ').trim(), fixed };
}

// ---------- 4. Tempo: "aos 30 s", "em 1:20", "de 0:10 a 0:15", "do 10 ao 20", "no começo/meio/fim" ----------
const tc = x => { const m = String(x).match(/(\d+):(\d{1,2}(?:\.\d+)?)/); return m ? +m[1] * 60 + +m[2] : parseFloat(x); };
export function findRanges(s) {
  const out = [];
  const T = '(\\d{1,2}:\\d{2}(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)\\s*(?:s|seg|segundos?|sec|seconds?)?';
  const re = new RegExp(`\\b(?:de|do|dos|entre|from|between)?\\s*${T}\\s*(?:a|ao|aos|ate|e|to|-|and)\\s*${T}`, 'g');
  let m;
  while ((m = re.exec(s))) { const a = tc(m[1]), b = tc(m[2]); if (b > a && (m[1].includes(':') || m[2].includes(':') || /\b(trecho|parte|pedaco|segundo|segment|part|from|de|do|entre)\b/.test(s.slice(Math.max(0, m.index - 25), m.index + 5)))) out.push({ from: a, to: b, idx: m.index, len: m[0].length }); }
  return out;
}
export function findPoint(s) {
  const m = s.match(/\b(?:em|no|na|aos|as|at|aos?)\s*(\d{1,2}:\d{2}(?:\.\d+)?)/) || s.match(/\b(\d{1,2}:\d{2}(?:\.\d+)?)/) || s.match(/\b(?:aos|em|at)\s+(\d+(?:\.\d+)?)\s*(?:s|seg|segundos?|seconds?)\b/);
  return m ? tc(m[1]) : null;
}

// ---------- 5. Sugestões quando não entende ----------
export const EXAMPLES = [
  'corta mais rápido', 'deixa mais lento', 'música mais intensa', 'música mais baixa', 'sem música', 'tira o som original',
  'legenda palavra por palavra', 'legenda estilo karaokê', 'sem legenda', 'legenda em cima', 'legenda maior',
  'versão de 30 segundos para o TikTok', 'versão para YouTube', 'reels de 15 segundos', 'faz 3 versões diferentes',
  'tira os silêncios', 'tira os ahn e repetições', 'gancho forte nos primeiros 3 segundos', 'final emocionante',
  'cor de cinema', 'mais claro', 'mais saturado', 'preto e branco', 'mais quente', 'mostra o vídeo inteiro com fundo desfocado',
  'efeitos sonoros nos impactos', '3 impactos', 'câmera lenta nos melhores momentos', 'transições suaves', 'só cortes secos',
  'texto em círculo "SIGA PARA MAIS"', 'manchete "3 erros que você comete"', 'barra de progresso', 'zoom na batida',
  'zoom nas palavras fortes', 'tira o trecho de 0:10 a 0:15', 'abre com o trecho de 1:20', 'congela em 0:12',
  'estilo documentário', 'estilo ação', 'estilo cinematográfico', 'vídeo de terror', 'vídeo de comida', 'edita igual ao vídeo de referência',
  'salva esse estilo como meu estilo', 'exportar em 4K',
];
export const toks = x => new Set(x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length > 2));
export function suggest(s, n = 3) {
  const a = toks(s);
  return EXAMPLES.map(e => { const b = toks(e); let inter = 0; for (const w of a) if (b.has(w) || [...b].some(x => x.startsWith(w.slice(0, 5)) && w.length >= 5)) inter++; return { e, sc: inter / Math.sqrt(b.size + 1) }; })
    .filter(x => x.sc > 0).sort((x, y) => y.sc - x.sc).slice(0, n).map(x => x.e);
}
