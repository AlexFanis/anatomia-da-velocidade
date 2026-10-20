# Anatomia da Velocidade

Site 3D imersivo sobre um carro de Fórmula 1, contado pela rolagem. Uma única cena contínua: a câmera "pilota" em volta do carro e cada seção revela um aspecto dele.

**[Ver o site no ar →](https://alexfanis.github.io/anatomia-da-velocidade/)**

## As seis seções

1. **Abertura** — loader com um F1 em traço que se desenha conforme o carregamento e dispara; a cena surge por uma máscara de ruído.
2. **Aerodinâmica** — linhas de fluxo de ar contornando o carro e rótulos técnicos presos às peças.
3. **Peça por peça** — vista explodida em cinco conjuntos, cada um num eixo reto.
4. **Pneus e freios** — close na roda girando, disco de freio em brasa e faíscas sob o assoalho.
5. **Velocidade** — o carro fica parado e o mundo passa: pista, túnel de luzes, motion blur e velocímetro até 340 km/h.
6. **Largada** — as cinco luzes acendem e se apagam, revelando o final.

Também tem: arrastar para girar o carro, troca de pintura ao vivo, cursor magnético, distorção de calor no mouse e som real de F1 que acompanha a rolagem.

## Stack

- [Three.js](https://threejs.org) + [postprocessing](https://github.com/pmndrs/postprocessing) (bloom, blur radial, aberração cromática, granulado)
- [GSAP](https://gsap.com) + ScrollTrigger e [Lenis](https://lenis.darkroom.engineering) para a rolagem
- [Howler.js](https://howlerjs.com) para o áudio
- [Vite](https://vite.dev)
- Modelo otimizado com [glTF Transform](https://gltf-transform.dev) (16 MB → 4,5 MB, meshopt + WebP)

Desempenho: 60 fps no desktop, com sombras recalculadas só quando o carro se mexe e resolução adaptativa.

## Rodar localmente

```sh
npm install
npm run dev
```

Para publicar no GitHub Pages: `npm run publicar`.

## Créditos

- Projeto de estudo, sem fins comerciais. Modelo 3D de fã do RB16B; as marcas e logos pertencem aos seus donos.
- Sons: gravações em domínio público (CC0) do Freesound — [Ears68](https://freesound.org/people/Ears68/sounds/181187/) (Red Bull Renault V8, 2012; GP da Austrália 2012) e [wandererscapes](https://freesound.org/people/wandererscapes/sounds/410894/) (Monza 2014).
- Fontes: Archivo e Martian Mono (SIL Open Font License).
