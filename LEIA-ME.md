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

## O que funciona (testado)
- Análise: silêncios e pausas, fala, batidas e BPM da música, trocas de cena, movimento, tremor,
  exposição, nitidez, rosto (para reenquadrar).
- Diretor: entende pedidos em português e inglês, com gíria e erro de digitação, e sempre mostra o que entendeu.
  Banco de 315 frases testadas, do simples ao complexo. Exemplos:
  - momentos: "câmera lenta no final e um freeze no comecinho", "congela aqui por 2 segundos",
    "acelera de 0:10 a 0:15", "tira esse pedaço", "tira os primeiros 3 segundos", "começa direto no 0:12";
  - legenda: "a legenda tá muito grande", "letra mais grossa", "caixa alta", "legenda só nas palavras importantes";
  - som: "a música entra muito alta", "aumenta minha voz", "põe a música no refrão", "sem música no começo",
    "tira os palavrões" (bipe + legenda mascarada);
  - imagem: "mais nitidez", "aumenta o contraste", "deixa mais claro e mais vivo", "segue meu rosto", "zoom lento";
  - geral: "dá uma melhorada geral", "não gostei" (outra montagem), "faz um de 15 e um de 60 segundos",
    "transição de zoom", "barra de progresso embaixo", "gostei, exporta".
- 18 estilos de edição, 11 looks de cor, 17 estilos de legenda, 16 fontes, 8 textos com forma.
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
