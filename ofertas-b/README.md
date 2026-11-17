# bfa-ofertas-b (página B, /bfa-b)

Versão B da página de ofertas da Black Friday Apocalíptica, para comparar com a
A (`../ofertas`, publicada em `/bfa`). **Mesma funcionalidade e mesmo
conteúdo**; muda a direção visual ("cartaz apocalíptico": Anton condensada,
Instrument Serif itálica, preto com brasa) e o movimento (GSAP + ScrollTrigger
locais). Rascunho: **não publicado**, sem app no Coolify.

## Prévia

```powershell
$env:Path = "C:\Users\PICHAU\AppData\Roaming\fnm\node-versions\v22.22.1\installation;$env:Path"
cd ofertas-b
npm run gerar       # site/ a partir de ../ofertas/dados/ofertas.json
npm run preview     # http://localhost:4175/bfa-b?previa=1
npm run verificar   # testes no Chrome + capturas em verificacao/
```

Mesmos parâmetros da A, sem nada visível: `?previa=1` desliga o Pixel; com ele,
`&agora=2026-11-17T23:59:50-03:00` simula o horário e `&esgotar=caixa-pandora`
esgota uma oferta.

## O que vem da A (nada é copiado à mão)

- **Dados:** `../ofertas/dados/ofertas.json` (preços, fases, vagas, textos,
  depoimentos). Em produção a B lê `/bfa/ofertas.json` ao vivo e, se faltar, o
  `site/ofertas.json` gerado aqui. Vagas ao vivo de `/bfa-crm/api/vagas`.
- **Comportamento:** `src/app.js` = `../ofertas/src/app.js` adaptado por
  `npm run sincronizar` (chave de pedido própria `bfa-b-pedido-v1`, mídia em
  `/bfa-b/assets`, JSON com reserva). Rodar de novo sempre que o app.js da A
  mudar; se uma troca falhar, o script diz qual.
- **Player dos vídeos:** `../ofertas/src/player.js` e `player.css`, lidos
  direto pelo `gerar.mjs`.
- **Mídia:** vídeos, capas, prints, águia e Newsreader vêm de
  `../ofertas/site/assets/` e são copiados para `site/assets/` no `gerar`.

## O que é só da B

```text
src/estilo.css      visual (inline no HTML)
src/movimento.js    movimento; não toca no pedido; não roda com "reduzir movimento"
fontes/             Anton e Instrument Serif (OFL)
vendor/             gsap.min.js e ScrollTrigger.min.js 3.15 (carregados depois da página)
scripts/preview.mjs prévia na porta 4175, com /bfa/ofertas.json e /bfa-crm/api/vagas imitados
nginx.conf, Dockerfile  espelho dos da A para /bfa-b (não usados ainda)
```

Seções do acervo `codegridpro/sections` usadas como base (adaptadas, não
copiadas): 349 e 248 (palavras subindo da máscara), 095 (dígitos do "80%" se
separando), 002 (céu da abertura com o mouse), 058 e 035 (faixas que trocam de
sentido com a rolagem), 159 (anel da Bússola girando), 102 e 186 (janela que
abre na mentoria), 038 e 321 (palavras acendendo), 339 e 066 (entrada e luz dos
cards), 282 (colunas do mural em velocidades diferentes).

## Publicar (só quando Gustavo pedir)

Seria outro app no Coolify (base directory `/ofertas-b`, Dockerfile, porta 80,
domínio `https://yuridosanjos.com.br/bfa-b`). O Traefik dá prioridade à regra
mais longa, então `/bfa-b` não cai no app da A. Push não publica sozinho.
