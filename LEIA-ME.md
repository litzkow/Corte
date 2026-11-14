# Corte — editor de vídeo com IA (grátis, roda no aparelho)

Você sobe vídeos, pede o que quer (falando ou escrevendo) e o app edita de verdade:
corta silêncios, escolhe os melhores trechos, corta no ritmo da música, reenquadra para vertical
seguindo o rosto, aplica cor, transições, efeitos sonoros, legendas virais e textos com forma,
e exporta um MP4 pronto para TikTok, Reels, Shorts ou YouTube.

Tudo acontece no navegador do aparelho. Os vídeos não vão para servidor nenhum.

## Como abrir
- Celular: Safari (iPhone) ou Chrome (Android) no endereço do app. Dá para "Adicionar à Tela de Início".
- Computador: Chrome atualizado. Vídeos longos (mais de 10 minutos) vão melhor aqui.

## O que funciona (testado)
- Análise: silêncios e pausas, fala, batidas e BPM da música, trocas de cena, movimento, tremor,
  exposição, nitidez, rosto (para reenquadrar).
- Diretor: entende pedidos em português e inglês (estilo, mistura de estilos com %, duração,
  corte médio, faixas "entre 2 e 3 s", gancho nos primeiros N s, final emocionante, várias saídas,
  câmera lenta em %, intensidade da música em %, N impactos, transição a cada N s, remover transição em mm:ss,
  4K, fps, legendas, textos com forma, versões). Sempre mostra o que entendeu.
- 18 estilos de edição, 11 looks de cor, 17 estilos de legenda, 8 textos com forma.
- Som: mixagem a -14 LUFS com pico -1 dB, música abaixa sozinha quando alguém fala, efeitos sonoros
  sintetizados (sem direitos autorais).
- Exportação quadro a quadro (MP4 H.264) onde o navegador tem WebCodecs; senão grava em tempo real.
- Controle de qualidade com nota por categoria e conferência do arquivo exportado.
- Versões, desfazer, linha do tempo editável, estilo salvo ("salva esse estilo como meu estilo"),
  projetos guardados no aparelho.

## O que ainda não faz
- O diretor é um conjunto de regras, não uma IA conversando. Pedidos muito fora do comum podem não ser entendidos (ele avisa).
- Transcrição no aparelho (Whisper) não pôde ser testada no ambiente de construção (sem internet).
- Tradução de legendas, corte automático de repetições/erros de fala, edição por vídeo de referência,
  biblioteca de busca de cenas, lote de 20 vídeos e miniaturas ainda não existem.

## Testes
- `node tests/director.test.mjs` — o diretor (roda também na publicação).
- `tests/*.html` + `tests/*.py` — análise, plano, mixagem e renderização no Chrome sem tela (precisam dos vídeos de teste de `tests/gen_media.py`).
