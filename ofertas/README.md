# bfa-ofertas

Página de ofertas e pedido da **Black Friday Apocalíptica** de Yuri dos Anjos,
para **<https://yuridosanjos.com.br/bfa>**. Vive na pasta `ofertas/` do
repositório `gustavomondrgn/bfa-yuri`, ao lado da ponte `/bfa-grupo`, mas é
**outro app no Coolify** (`bfa-ofertas`, uuid `8lseinjdafx4eov2ove3xacz`,
base directory `/ofertas`).

A pessoa escolhe as ofertas, monta o pedido (vários itens, quantidade, total)
e envia pelo WhatsApp do atendimento com a mensagem pronta. O atendimento
confere as vagas e manda o link de pagamento (InfinitePay). A página não cobra.

Estado, decisões de produto e pendências: ver
`Documents/ChatGPT/YURI ASTROLOGIA/BLACK-FRIDAY-2026/handoff-pagina-2026-11-16/ESTADO-DA-PAGINA-BFA-2026-11-16.md`.

## Estrutura

```text
dados/ofertas.json     fonte única: fases, preços por fase, vagas, textos, WhatsApp, Pixel,
                       InfiniteTag, depoimentos
src/estilo.css         estilo (inline no HTML gerado)
src/app.js             comportamento (copiado para site/assets/app.js com ?v=hash)
scripts/gerar.mjs      gera site/index.html e site/ofertas.json a partir dos dados
scripts/preview.mjs    servidor local com as rotas do nginx
scripts/verificar.mjs  ~81 verificações no Chrome (wa.me interceptado, nada é enviado)
scripts/pedido.mjs     link de checkout InfinitePay + controle de pedidos e vagas
scripts/capturas*.mjs, scripts/_debug.mjs   capturas de tela para conferência
site/                  o que vai para o container (nginx em /usr/share/nginx/html/bfa)
site/assets/depoimentos/  vídeos e capas (Vicente, Julio Pozzato, Gibran)
site/assets/lux/       águia, fonte Newsreader e fundo de astrolábio (só na mentoria)
nginx.conf, Dockerfile
```

## Fonte única: `dados/ofertas.json`

- **Fases:** abertura 16/11 às 8h; viradas à meia-noite de 17, 18 e 19; fim
  em 19/11 às 23h59. Antes das 8h a página já mostra os preços de abertura
  (não há portão: o link só é divulgado às 8h).
- **Preços de 17 a 19:** aprovados por Gustavo em 16/11 (`regraAprovada`).
  Pacotes de cursos fixos em 497 (Astrologia) e 297 (Religião) até 19/11.
- **Vagas:** `vagas` é o que resta; `vagasIniciais` o total. `esgotado: true`
  ou `vagas: 0` mostram o carimbo de esgotado e travam a oferta. Cursos têm
  `vagas: null` (sem limite).
- **Depoimentos:** `depoimentos` (vídeo, capa, título, duração, vertical) e,
  no item, `depoimento` (um, vira o chip "Ver depoimento") ou `depoimentos`
  (lista, usada na mentoria).

Mudou o JSON → `npm run gerar` → `npm run verificar` → commit → push →
**redeploy**. A página busca `/bfa/ofertas.json` ao abrir, ao voltar para a
aba e antes de enviar o pedido.

## Comportamento

- **Hora:** usa a do servidor (cabeçalho `Date`) quando o relógio do celular
  erra mais de 1 min.
- **Virada com a página aberta:** preços mudam sozinhos, faixa "Os preços
  mudaram", total antigo riscado no pedido e botão "Enviar com o preço atual".
  O WhatsApp nunca abre com preço vencido. Fase sem preço: "em breve" e envio
  travado.
- **Pedido** salvo no aparelho (localStorage); barra fixa com total, lixeira
  (esvaziar com "Desfazer" por 7 s) e "Finalizar pedido".
- **Mensagem:** itens, quantidade, preço unitário, total, condição vigente,
  código `BFA-XXXX` e horário. Vale o preço do dia em que a pessoa chama, com
  pagamento no mesmo dia.
- **Meta Pixel** `549360853227105`: `PageView`, `AddToCart`,
  `InitiateCheckout` (no envio). **Nunca `Purchase`.**
- **Movimento:** revelação suave na rolagem, contagem regressiva, faixa de
  Black Friday, eclipse respirando, marcador do menu; tudo desliga com
  "reduzir movimento". Sem JavaScript, ofertas e preços aparecem.
- **Vídeos de depoimento** abrem num player por cima da página e só baixam
  ao tocar; o botão voltar do celular fecha o player.

## Prévia e verificação

```powershell
$env:Path = "C:\Users\PICHAU\AppData\Roaming\fnm\node-versions\v22.22.1\installation;$env:Path"
npm run gerar       # site/index.html a partir de dados/ofertas.json
npm run preview     # http://localhost:4174/bfa  (igual ao público)
npm run verificar   # capturas e relatório em verificacao/
```

Parâmetros de teste, sem nada visível na página: `?previa=1` desliga o Pixel;
com ele, `&agora=2026-11-16T23:59:40-03:00` simula o horário e
`&esgotar=caixa-pandora` esgota uma oferta.

## Pedidos, InfinitePay e vagas

`scripts/pedido.mjs` gera o link de checkout pela API pública da InfinitePay
(`POST https://api.checkout.infinitepay.io/links`, `handle` = InfiniteTag
`yuri-alan-vmj`, preços em centavos, `order_nsu` = código do pedido) e
registra o pedido no controle **fora do repositório** (nome e telefone):
`C:/Users/PICHAU/Documents/ChatGPT/YURI ASTROLOGIA/BLACK-FRIDAY-2026/crm-bfa/`.

```powershell
node scripts/pedido.mjs novo --nome "Maria" --tel 5562999999999 --itens bussola,raio-x:2 --quando 2026-11-16T23:58
node scripts/pedido.mjs pago BFA-7K2Q      # baixa as vagas em dados/ofertas.json
node scripts/pedido.mjs lista
```

Checkout integrado ligado por Gustavo em 16/11 (etapa de endereço desligada).

## Publicação

- **Coolify:** projeto Yuri dos Anjos, ambiente `production`, app
  `bfa-ofertas`, repositório público `gustavomondrgn/bfa-yuri`, branch `main`,
  base directory `/ofertas`, Dockerfile, porta 80, domínio
  `https://yuridosanjos.com.br/bfa`. **Push não publica sozinho**: Redeploy no
  painel ou `POST /api/v1/deploy` com `{"uuid":"8lseinjdafx4eov2ove3xacz"}`.
- **Raiz do domínio:** o nginx redireciona para `/bfa` os pedidos que chegam
  sem `X-Forwarded-Prefix` (ou seja, que não vieram pela rota `/bfa` com
  stripprefix). Para valer, o app precisa receber também o domínio
  `https://yuridosanjos.com.br`.
- **Coexistência com `/bfa-grupo`:** o Traefik dá prioridade à regra mais
  longa; este nginx não serve `/bfa-grupo`.
- **Cloudflare:** sem regra de cache para `/bfa`. Se criar, excluir
  `/bfa/ofertas.json` e fazer purge a cada mudança.
