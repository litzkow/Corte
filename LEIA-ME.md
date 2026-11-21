# Corte — editor de vídeo com IA (grátis, roda no aparelho)

Você sobe vídeos, fotos ou uma narração, pede o que quer (falando ou escrevendo) e o app edita de verdade:
corta silêncios, escolhe os melhores trechos, corta no ritmo da música, reenquadra para vertical
seguindo o rosto, aplica cor, transições, efeitos sonoros, legendas virais e textos com forma,
e exporta um MP4 pronto para TikTok, Reels, Shorts ou YouTube.

Tudo acontece no navegador do aparelho. Os vídeos não vão para servidor nenhum.

## Como abrir
- Celular: Safari (iPhone) ou Chrome (Android) no endereço do app. Dá para "Adicionar à Tela de Início".
- Computador: Chrome atualizado. Vídeos longos (mais de 10 minutos) vão melhor aqui.

## A tela
- Início: novo projeto, estilos de IA com prévia animada e seus projetos.
- Editor: prévia, linha do tempo com cortes, transições, legendas, textos, voz, música e efeitos;
  barra "Peça para a IA editar" (texto ou microfone) e ferramentas embaixo:
  IA, Mídia, Estilo, Legendas, Texto, Áudio, Cor, Formato, Versões e Qualidade.
- Tocando num corte da linha do tempo: Dividir, Velocidade, Transição, Congelar, Duração e Excluir.

## Formatos que viralizam (versão 2.7)
Receitas completas tiradas de vídeos que bombaram em nov/2026 (ver `docs/tendencias.md`). Peça pelo nome:
- **Montagem com frase**: `montagem com frase "eu fazendo qualquer coisa menos responder o WhatsApp"`
- **Clipe de letra**: `clipe de letra "lately | I've been | dreaming"` (frases separadas por |)
- **Comentário com memes**, **Tela dividida contando história**, **História cinematográfica**,
  **Conversa com sustos**, **Lance com batida (phonk)**, **Vlog narrado com piada**.
- **Retrospectiva do ano** (versão 2.9): `retrospectiva do ano, 15 segundos` — frase de abertura e um mês por corte.
- **Ultimamente no cartão SD** (versão 2.9): `lately on my sd card` — cartão de memória desenhado e clipes de menos de 1 s.
A legenda é automática: com vídeo que tem fala, o app transcreve sozinho no aparelho (Whisper) e a legenda aparece quando fica pronta.

## Novidades da versão 2.9 (tendências de 21/11/2026)
- Texto na tela: **rótulo por corte** (`texto "Dia 1 | Mês 6 | 1 ano" rótulo por corte`), **horário do vlog**
  (`texto "7:12 | 9:40 | 13:05" com horário em cada corte`), **lista aparecendo** (`texto "contas que eu não negocio: | café | unha feita" em lista`)
  e **cartão SD**.
- Transições: **ventilador** (pás girando na frente) e **papel rasgando** (o "papel de presente" de fim de ano).
- **Confete com palmas** ("boom clap"): `confete no final` ou `confete aos 0:05`; também na folha Texto.
- Sons novos, gerados por código: **palmas**, **sinos de Natal** e **papel rasgando**. A folha Áudio agora tem os
  efeitos sonoros para ouvir e colocar no ponto da prévia.

## O que funciona (testado)
- Análise: silêncios e pausas, fala, batidas e BPM da música, trocas de cena, movimento, tremor,
  exposição, nitidez, rosto (para reenquadrar).
- Diretor: entende pedidos em português e inglês, com gíria e erro de digitação, e sempre mostra o que entendeu.
  Banco de 374 frases testadas, do simples ao complexo. Exemplos:
  - momentos: "câmera lenta no final e um freeze no comecinho", "congela aqui por 2 segundos",
    "acelera de 0:10 a 0:15", "tira esse pedaço", "tira os primeiros 3 segundos", "começa direto no 0:12";
  - legenda: "a legenda tá muito grande", "letra mais grossa", "caixa alta", "legenda só nas palavras importantes";
  - som: "a música entra muito alta", "aumenta minha voz", "põe a música no refrão", "sem música no começo",
    "tira os palavrões" (bipe + legenda mascarada);
  - imagem: "mais nitidez", "aumenta o contraste", "deixa mais claro e mais vivo", "segue meu rosto", "zoom lento";
  - geral: "dá uma melhorada geral", "não gostei" (outra montagem), "faz um de 15 e um de 60 segundos",
    "transição de zoom", "barra de progresso embaixo", "gostei, exporta".
- 29 estilos de edição e 10 formatos virais, 20 looks de cor, 29 estilos de legenda, 20 fontes, 23 estilos de texto na tela, 8 textos com forma e 14 transições.
- 15 estilos de texto na tela em alta (pesquisa de nov/2026): serifa curvada, contorno branco (Edits),
  papel amassado, minimalista dinâmico, caixa do TikTok, pílulas coloridas, amarelo confissão,
  estética calma, conversa de mensagem (falas separadas por |), recorte de revista, marca-texto,
  palavra na batida da música, texto pequeno com zoom, carregando % e digitando.
  Pela folha Texto ou pedindo: texto na tela "27 horas de viagem" estilo papel amassado.
- Som: mixagem a -14 LUFS com pico -1 dB, música abaixa sozinha quando alguém fala, efeitos sonoros
  sintetizados (sem direitos autorais), música tirada de qualquer vídeo seu.
- Exportação quadro a quadro (MP4 H.264) onde o navegador tem WebCodecs; senão grava em tempo real.
- Controle de qualidade com nota por categoria e conferência do arquivo exportado.
- Versões, desfazer/refazer, estilo salvo ("salva esse estilo como meu estilo"), projetos guardados no aparelho.

## O que ainda não faz
- O diretor é um conjunto de regras, não uma IA conversando. Pedidos muito fora do comum podem não ser entendidos (ele avisa e sugere parecidos).
- Transcrição no aparelho (Whisper) não pôde ser testada no ambiente de construção (sem internet).
- Tradução automática de legendas, cor diferente só num trecho, estabilização de verdade e lote de vídeos ainda não existem.

## Testes
- `node tests/director.test.mjs` e `node tests/corpus.test.mjs` — o diretor e o banco de frases (rodam também na publicação).
- `tests/e2e_ui.py` e `tests/e2e_ui2.py` — a interface inteira no Chrome sem tela, como num celular.
- `tests/*.html` + `tests/*.py` — análise, plano, mixagem e renderização (precisam dos vídeos de `tests/gen_media.py`).
- `tests/t_novidades.html` — desenha as transições ventilador e papel rasgando e o confete em vários instantes.
