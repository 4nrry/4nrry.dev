# Topo do perfil do X (@4nrry)

Material do topo do perfil: bio, banner e as peças que compõem os banners.
Pasta de design — **não é servida pelo site**: o `wrangler.jsonc` publica
apenas `./dist`.

## A bio

```
AI and product, for people building on their own
founder of Ocean Words, co-founder of LOTVS
building in public from 🇧🇷, sharing what I learn
```

141 caracteres, de 160. Inglês na bio e português no feed, com a bandeira
amarrando os dois — o mesmo arranjo que a [@kaulabs](https://x.com/kaulabs)
usa, que foi a referência pedida.

Três decisões que o texto carrega:

- **Sem o emprego.** Numa amostra de 20 bios reais de builders, quem nomeia
  empregador é quem ganha crédito com ele (`Tech Lead @ theScore`,
  `co-creator Django`); quem é o próprio produto não nomeia (dieegosf,
  heliocosta, csallen, arvidkahl, binhara). Para a vaga remota, esse trabalho
  é do LinkedIn.
- **Sem "solo dev".** Deixou de ser verdade em 24/11/2026, quando entrou mais
  uma pessoa na Smart Compost. O currículo e o LinkedIn ainda dizem
  `sole engineer of a production IoT platform` e precisam da mesma correção —
  a forma honesta é o passado: *"built and ran the platform alone until the
  team grew"*.
- **Sem @handle.** `@oceanwords`, `@lotvs` e `@smartcompost` já pertencem a
  contas de terceiros sem relação com os projetos. `@oceanwordsbr` e
  `@lotvsapp` estavam livres em 24/11/2026.

## Os banners

Oito variações, todas **1500 × 500**, PNG sRGB, sem texto.

| Arquivo | O que muda |
|---|---|
| `01-plano.png` | base: de cima, casas de 100 px, rubro dominante, 3 peças |
| `02-rasa.png` | só o ângulo: perspectiva rasa |
| `03-isometrica.png` | só o ângulo: isométrica |
| `04-rente.png` | só o ângulo: câmera na altura da peça |
| `05-sombra.png` | ilusão checker-shadow de Adelson |
| `06-cafe.png` | ilusão café wall |
| `07-ambar.png` | só a cor: âmbar dominante |
| `08-posicao.png` | só a densidade: meio de jogo, 8 peças |

`05-sombra-prova.png` é a prova da ilusão, não um banner: liga por uma barra
de cor sólida as duas casas que parecem diferentes.

### Restrições que todo banner respeita

- **380 × 200 px chapados no canto inferior esquerdo**, onde a foto de perfil
  entra. Conferido pixel a pixel: `#0e0b0a` puro, sem exceção.
- O essencial cabe no **corte central de 1100 px** que o X aplica em tela
  estreita.
- Nada que envelheça: sem número, data, métrica ou caminho de arquivo.

### A ilusão de Adelson (05)

As duas casas têm **exatamente o mesmo RGB**, `#6A231C` (106, 35, 28): a
escura sob a luz e a clara dentro da sombra da torre. Verificado de forma
independente no PNG gravado — 80.279 pixels dessa cor exata, em blocos
separados dentro e fora da sombra. O gerador recusa gravar se os dois valores
divergirem.

A ideia conversa com a regra zero do `agent-plugins`: afirmação sem medição é
marketing. O limite é que, sem legenda, ninguém percebe que é ilusão.

## A paleta

| | |
|---|---|
| papel | `#0e0b0a` |
| rubro | `#d42e28` |
| âmbar | `#f6a838` |
| fio de cabelo | `#781e1a` |

**Substituição deliberada:** o pedido era a identidade do estúdio
[Hydraulis](https://hydraulis-site.hydraulis.workers.dev/), mas o Hydraulis é
azul-marinho com água-marinha (`#0c141d`, `#10304f`, `#6fd3e0`, Archivo +
Spline Sans Mono) e não tem vermelho nem laranja. Daqui veio só o
**tratamento** — chapa de gravura em meio-tom, fio de cabelo nas réguas, ar de
prancha científica do século XIX. A cor é a que o Anrry escolheu.

## Como isto foi feito

**As peças** (`pecas/`, WebP sem perda, geradas a 1024 × 1024) saíram do
**Grok Imagine**, pela assinatura, através do `media-agent`:

```bash
cd ~/.claude/plugins/cache/4nrry/media-agent/*/skills/image-generation
./scripts/grok-image.sh "<prompt>" saida.png
```

O prompt base, variando só a peça e a cor:

> A single chess knight piece seen from the side, standing on a flat near-black
> surface, drawn as an antique scientific engraving plate: the entire image is
> screened into visible halftone dots like a 19th century printed illustration.
> The piece is deep ruby red with warm amber highlights along its carved edges.
> Flat even lighting, square format, the piece centred with wide empty dark
> space around it, plain background, no lettering.

Custo: 8 imagens de quota, nenhuma refeita.

**Os tabuleiros** são desenhados em código, não gerados: `src/NN-nome.py` com
os parâmetros em `src/NN-nome.json`. Geometria exata, zero quota, e dá para
mudar cor, ângulo e densidade sem gerar imagem nova.

## Pendências

- **Termos de uso comercial do Grok Imagine não foram conferidos.** O perfil é
  vitrine de serviço, então é uso comercial. Ler antes de subir.
- Nenhum banner foi testado com a foto real no avatar, nem contra o recorte e
  a compressão que o X aplica no upload.
- O contraste entre casa clara e escura fica entre 2,16 e 2,42 a 500 px de
  largura — bem mais discreto que o verde-e-creme da referência. É escolha,
  não defeito; dá para abrir sem gerar nada.
