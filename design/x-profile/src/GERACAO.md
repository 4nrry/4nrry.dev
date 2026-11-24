# Banners de perfil do X, @4nrry, rodada 3 (1500 x 500)

Direção escolhida pelo usuário: **tabuleiro de xadrez com peças geradas por modelo de imagem**, no tratamento do estúdio Hydraulis, em **rubro e âmbar**, **sem texto nenhum**. Oito variações. Cada uma tem o fonte (`NN-nome.py` + `NN-nome.json` com as medidas), o PNG final, `-safe.png` (retângulo da foto desenhado em rosa), `-crop.png` (corte central de 1100 px) e `-500.png` (redução para 500 px). `contato.png` empilha as oito em 1500 px; `contato-500.png`, as reduções.

## Como foi feito

- **Peças: geradas.** Oito imagens do Grok Imagine, todas com o prompt do teste (`pecas/prompts.json`), mudando só a peça e a cor: rubro (cavalo, torre, bispo, peão, dama) e âmbar (cavalo, torre, peão). `pecas/rubro-cavalo.png` é o `teste-cavalo.png` copiado, não uma geração nova. O script usado está em `pecas/gerar.sh`.
- **Recorte:** limiar de "vermelhidão" e de luminosidade sobre o fundo quase liso, fechamento morfológico, preenchimento de buracos, maior componente. A torre e o peão âmbar têm fundo com piso iluminado e sombra projetada; para eles o recorte corta o piso abaixo do aro da base e fica só com a parte simétrica em torno do eixo. Os recortes (RGBA, cores originais) estão em `pecas/recortes/`.
- **Retícula comum:** a retícula nativa das peças (passo de 3,9 px a 1024) viraria moiré ao reduzir para 400 px de altura. Então cada peça é "descreenada" (média normalizada pela máscara) e **reimpressa com a mesma retícula do tabuleiro**, em duas chapas como numa gravura a duas tintas: rubro a 45 graus, âmbar a 15 graus, passo de 5 px, sobre o papel escuro. Peças âmbar e rubro e as casas do tabuleiro saem da mesma impressão, e a cor das peças âmbar (que o modelo entregou meio oliva) fica na tinta âmbar da paleta. O tabuleiro e a perspectiva são código (`engine.py`): a retícula de ponto redondo é analítica e anti-serrilhada.
- **Gravura:** cada peça tem um anel de papel limpo em volta da silhueta (o que as gravuras deixam) e uma poça de contato escura sob a base, em vez de glow ou sombra suave.
- **Casas perto da foto:** nenhuma casa é cortada. As que tocam o retângulo da foto somem inteiras; as vizinhas descem em degraus de tamanho de ponto (50%, 75%, 100% do tom).
- **Ilusões (05 e 06): campo chapado de propósito.** Elas dependem de valores exatos (duas casas com o mesmo RGB; uma argamassa de valor intermediário), e uma retícula de meio-tom tiraria a igualdade pixel a pixel. Só as peças ficam em meio-tom, como peças impressas pousadas num tabuleiro pintado.

## Paleta

Papel `#0e0b0a` (chapado, também é o canto da foto); tinta rubro `#d42e28`; tinta âmbar `#f6a838`; fio de cabelo `#781e1a`. **Substituição deliberada, já acordada:** o Hydraulis real é azul-marinho com água-marinha e Archivo + Spline Sans Mono. Daqui só vem o **tratamento** (chapa de gravura em meio-tom, fio de cabelo nas réguas e marcas de registro, ar de prancha científica), não a cor. Não há texto, então nenhuma fonte entrou nos banners; as fontes de `fonts/` só servem à legenda do contato.

## As oito variações

Linha de base: **01**. A cada variação de 02 a 04 e 07 e 08, muda uma dimensão em relação a ela. A escala da casa não ficou como variação isolada (são oito, não nove): 05 e 06 usam casas pequenas por necessidade da ilusão, e 01 a 04 usam 100 px.

| # | Nome | Ângulo | Casa | Domínio de cor | Peças | O que muda |
|---|---|---|---|---|---|---|
| 01 | `plano` | de cima | 100 px | rubro, âmbar pontual (peão) | 3 | base. Grade alinhada à foto: somem 4 x 3 casas inteiras (a fileira de cima entra pela margem de 2 px). Régua de fio de cabelo na borda de cima. Peças em elevação sobre o plano (prancha de planta e elevação). |
| 02 | `rasa` | perspectiva rasa | 100 px na borda próxima | igual | mesmas 3 | só o ângulo: câmera de furo a 4 casas, horizonte baixo. As casas distantes viram tom médio (corte duro em y = 128), em vez de moiré. |
| 03 | `isometrica` | isométrica de jogo | losango 140 x 70 | igual | mesmas 3 | só o ângulo. Sem escala por profundidade. |
| 04 | `rente` | na altura da peça | casas gigantes na frente | igual | mesmas 3 | só o ângulo: câmera a 1 casa. A torre é uma silhueta de mais de 400 px contra o fundo liso; cavalo e peão recuam. |
| 05 | `sombra` | perspectiva alta | 18 x 12, 42 px na borda próxima | rubro (casas), âmbar (peça) | 1 | **ilusão de Adelson**, abaixo. |
| 06 | `cafe` | de frente | 44 px | âmbar e rubro-escuro | 0 | **café wall**, abaixo. Sem peça: o painel é o xadrez; uma peça por cima atrapalharia a ilusão. |
| 07 | `ambar` | de cima | 100 px | **âmbar dominante**, rubro fraco nas casas escuras, rubro pontual (peão) | 3 | só a cor. |
| 08 | `posicao` | de cima | 100 px | rubro, âmbar nas peças da outra cor | **8** | só a densidade: posição de meio de jogo, cinco rubro contra três âmbar. |

### 05, checker-shadow de Adelson

A torre âmbar lança a sombra no tabuleiro. A sombra é a união de discos de seção da peça (a peça é um sólido de revolução), arrastados ao longo da luz, com penumbra que cresce com a altura. A casa clara vale `L = (192, 64, 50)`; a escura vale `D = round(L x 0,55) = (106, 35, 28)`; a sombra leva `L` a `D` por canal, exatamente.

- **A**, casa escura na luz: casa (10, 1) (coluna, fileira), 548 pixels no interior. **B**, casa clara na umbra: casa (8, 4), 351 pixels.
- Relido do PNG gravado, em ambas as casas só existe um RGB: **(106, 35, 28) em A e (106, 35, 28) em B**. O código recusa gravar se não forem idênticos.
- A vizinhança faz o resto: as quatro vizinhas de B estão em média 96% na sombra (escuras e mais escuras que B); as de A estão 97% na luz (claras).
- `05-sombra-prova.png` não é banner: é a mesma imagem com uma barra do RGB (106, 35, 28) ligando A a B.
- A 500 px, o interior de A e o de B continuam em (106, 35, 28), desvio de 0 e 0,35.

### 06, café wall

Painel x 440 a 1232, y 40 a 460, inteiro dentro do corte central e longe da foto. 9 fileiras de 18 casas de 44 px; uma fileira sim, outra não, deslocada 22 px (meia casa); argamassa horizontal de 3 px. Casa clara `(244, 178, 72)`, L* 77,0; escura `(44, 9, 10)`, L* 6,8; argamassa `(136, 88, 39)`, **L* 41,8, no meio das duas (média 41,9)**, com o matiz da média sRGB das casas (uma primeira versão com a argamassa mais vermelha fazia a linha "saltar" como linha colorida e, a olho, matava o efeito). As 8 faixas de argamassa foram relidas do PNG: cada uma tem um único RGB em toda a largura do painel e fica em y exato (84 a 87, 131 a 134, e assim por diante, de 47 em 47 px). As linhas são retas e paralelas, e é essa a parte medida.

## Conferência

Medida por `check.py` sobre o PNG relido do disco (`checks.json`), mais uma conferência independente com `vips`.

| # | 1500 x 500, sRGB | Foto 380 x 200 | Peças no corte 200 a 1300 | Tinta fora do corte | 500 px: casa clara vs escura (WCAG) |
|---|---|---|---|---|---|
| 01 | PNG RGB 8 bits, perfil sRGB | 76000 de 76000 em #0e0b0a | x 553 a 1220, dentro | 22,9% | 2,18 |
| 02 | idem | idem | x 609 a 1246, dentro | 21,8% | 2,18 |
| 03 | idem | idem | x 599 a 1210, dentro | 26,5% | 2,16 |
| 04 | idem | idem | x 526 a 1270, dentro | 15,8% | 2,16 |
| 05 | idem | idem | peça x 583 a 751; A e B dentro | 0,0% | não se aplica (campo chapado; A = B a 500 px) |
| 06 | idem | idem | painel x 440 a 1232, dentro | 0,0% | não se aplica |
| 07 | idem | idem | x 556 a 1220, dentro | 21,8% | 2,42 |
| 08 | idem | idem | x 460 a 1298, dentro | 22,4% | 2,19 |

- **Foto:** contagem de pixels diferentes de #0e0b0a no retângulo x 0 a 379, y 300 a 499 do PNG final é 0 nas oito; uma única cor no retângulo. Conferido de novo com `vips extract_area`, `extract_band`, `min` e `max`: 14, 11, 10 nas três bandas, em todas. Controle negativo: o mesmo teste no `01-plano-safe.png` dá 80 a 255, 19 a 40, 32 a 90, então a conferência enxerga mudança.
- **Peça nunca perto da foto:** em 01 a 04, 07 e 08 o código recusa gravar se a caixa da peça (com halo) chegar a 10 px do retângulo; todas passaram. Em 05 a peça fica em x 583 a 751 e em 06 não há peça.
- **Corte:** nas seis com peça ou painel, a composição não depende do que sai: todas as peças ficam dentro de x 200 a 1300. O que sai é tabuleiro, que continua. A tinta fora do corte (15 a 27%) é só casa.
- **500 px:** olhei `contato-500.png` e os `-500.png`. Medida: média do RGB dentro de uma casa clara inteira e de uma escura inteira (polígono encolhido a 50%, na redução do `vipsthumbnail`); a razão de contraste vai de 2,16 a 2,42, então as casas continuam distintas, e o desvio de luma dentro da casa clara é de 14 a 17. **A retícula não dissolve em tom a 500 px: vira uma textura fina e regular de ponto, não ruído.** Para saber o que esperar, medi um campo uniforme (tom 0,44): o desvio do cinza a 500 px é 12 com passo 3, **55 com passo 5 (o usado)** e 82 com passo 7,5. Passo 3 dissolve, mas a 1500 px os pontos ficam finos demais para ler como gravura; ficou o passo 5.
- **Sem texto, número, data ou métrica; sem emoji, hashtag ou logo.** Não há texto nos banners.
- **Cores:** todas da paleta acima, mais os tons por mistura de tinta e, em 05 e 06, os tons do campo chapado (`L`, `D`, argamassa) derivados da mesma família.

## Quota

**8 imagens do Grok Imagine no total**: o teste do cavalo (feito antes) e 7 nesta rodada. Nenhuma foi refeita nem descartada. Teto era 12.

## O que não foi verificado

- **O efeito das ilusões em olhos.** O pixel mostra que A = B e que as linhas do café wall são retas e paralelas; se a pessoa vê a diferença, o quanto, só o olho diz. Olhei o café wall a 1500 px e vejo as linhas em cunha alternada, mas é sutil, e a 500 px fica fraco (a argamassa vira uma linha de 1 px). Não usei nenhum modelo perceptual nem testei com gente. Sem texto, nada diz ao espectador que é uma ilusão: **o banner 05 funciona como foto de um tabuleiro com sombra** e a prova (`05-sombra-prova.png`) é para quem pergunta.
- Nenhuma foto real no avatar: o retângulo está limpo, mas não vi o conjunto com o rosto dele. O retângulo (380 x 200) é maior que o círculo da foto, então o canto liso aparece com borda em degrau, por decisão de projeto.
- A interface real do X: o recorte por aparelho e a compressão do upload (que pode criar degraus nos escuros perto de #0e0b0a) não foram testados. A redução a 500 px é do `vipsthumbnail`, não a do X.
- **Uso comercial e rótulo de IA:** não conferi os termos do Grok Imagine para uso comercial. As peças são imagens geradas; as de `pecas/` carregam a proveniência do modelo, e os banners finais foram reimpressos (as peças são recompostas, não copiadas), mas isso não tira a obrigação de declarar o conjunto como feito com IA no upload.
- O recorte das peças foi conferido a olho em `pecas/recortes/`; a torre e o peão âmbar usam a regra de simetria e perderam um pouco do contorno da base original (o aro mais escuro do peão).
- Moiré em 02 e 04 perto do horizonte: tratado com a mistura para tom médio e corte duro, olhado a 100% e a 500 px; não medido.

## Refazer

`python3 NN-nome.py` refaz uma variação (cada uma escreve o PNG e o `.json` ao lado); `python3 check.py` regera `-safe`, `-crop`, `-500` e `checks.json`; `python3 contact.py` regera `contato*.png` (usa o Chrome sem cabeça e `fonts/`). Exige Pillow, numpy, websockets, `vips` e `vipsthumbnail`. A pasta `.tmp/` é descartável. As peças já geradas não precisam do modelo de novo.
