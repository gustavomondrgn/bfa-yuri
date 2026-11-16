# bfa-ofertas

Página de ofertas e pedido da **Black Friday Apocalíptica** de Yuri dos Anjos,
para **<https://yuridosanjos.com.br/bfa>**. Vive na pasta `ofertas/` do
repositório `gustavomondrgn/bfa-yuri`, ao lado da ponte `/bfa-grupo`, mas é
**outro app no Coolify** (`bfa-ofertas`, base directory `/ofertas`).

A pessoa escolhe as ofertas, monta o pedido (vários itens, quantidade, total)
e envia pelo WhatsApp do atendimento com a mensagem pronta. O atendimento
confere as vagas e manda o link de pagamento (InfinitePay). A página não cobra.

## Fonte única: `dados/ofertas.json`

Tudo sai daqui: fases com horário (fuso de Brasília), preço de cada oferta em
cada fase, vagas, esgotado, textos, número do WhatsApp, Pixel e InfiniteTag.

- **Fases:** abertura 16/11 às 8h; viradas à meia-noite de 17, 18 e 19; fim
  em 19/11 às 23h59. Antes das 8h a página mostra o portão "abrem às 8h".
- **Preços de 17 a 19:** aprovados por Gustavo em 16/11 (campo
  `regraAprovada`). Pacotes de cursos fixos em 497 e 297 até 19/11.
- **Vagas:** `vagas` é o que resta; `vagasIniciais` o total. `esgotado: true`
  ou `vagas: 0` travam a oferta. Cursos têm `vagas: null` (sem limite).
- **Cursos:** dois pacotes (`cenarioCursos: "dois"`). O pacote único fica no
  arquivo só para a prévia (`?previa=1&cursos=unico`).

Mudou o JSON → `npm run gerar` → commit → push → **redeploy** no Coolify.
A página também busca `/bfa/ofertas.json` ao abrir, ao voltar para a aba e
antes de enviar o pedido, então vaga esgotada aparece mesmo para quem já
estava com a página aberta.

## Como a página se comporta

- **Hora:** usa a do servidor (cabeçalho `Date`) quando o relógio do celular
  erra mais de 1 min.
- **Virada com a página aberta:** os preços mudam sozinhos, aparece a faixa
  "Os preços mudaram" e, se o pedido estiver aberto, o total antigo aparece
  riscado e o botão vira "Enviar com o preço atual". O WhatsApp nunca abre
  com preço vencido.
- **Fase sem preço publicado:** a oferta mostra "em breve" e o envio trava
  (salvaguarda; hoje todas as fases têm preço).
- **Pedido salvo no aparelho** (localStorage): quem volta do WhatsApp encontra
  o pedido como deixou.
- **Mensagem do WhatsApp:** itens, quantidade, preço unitário, total, condição
  vigente, código `BFA-XXXX` e horário. O preço que vale é o do dia em que a
  pessoa chama, com pagamento no mesmo dia (exceção interna de Gustavo: quem
  chama perto da meia-noite pode pagar até meio-dia do dia seguinte; não é
  comunicada).
- **Meta Pixel** `549360853227105`: `PageView`, `AddToCart` e
  `InitiateCheckout` (no envio ao WhatsApp). **Nunca `Purchase`**: o pagamento
  acontece fora da página. Desligado na prévia (`?pixel=1` liga).

## Prévia e verificação

```powershell
$env:Path = "C:\Users\PICHAU\AppData\Roaming\fnm\node-versions\v22.22.1\installation;$env:Path"
npm run gerar       # site/index.html a partir de dados/ofertas.json
npm run preview     # http://localhost:4174/bfa?previa=1
npm run verificar   # ~77 verificações; capturas em verificacao/
```

`?previa=1` mostra a página antes das 8h e abre um painel para simular
horário (`&agora=2026-11-16T23:59:40-03:00`), esgotar a Caixa de Pandora
(`&esgotar=caixa-pandora`), ver o portão (`&portao=1`) e o pacote único
(`&cursos=unico`). O verificar intercepta o wa.me e confere o texto da
mensagem; nada é enviado.

## Pedidos, InfinitePay e controle de vagas

`scripts/pedido.mjs` gera o link de checkout pela API pública da InfinitePay
(`POST https://api.checkout.infinitepay.io/links`, `handle` = InfiniteTag,
preços em centavos, `order_nsu` = código do pedido) e registra o pedido no
controle **fora do repositório** (nome e telefone de clientes):
`C:/Users/PICHAU/Documents/ChatGPT/YURI ASTROLOGIA/BLACK-FRIDAY-2026/crm-bfa/`
(`pedidos.json` e `pedidos.csv`).

```powershell
node scripts/pedido.mjs novo --nome "Maria" --tel 5562999999999 --itens bussola,raio-x:2 --quando 2026-11-16T23:58
node scripts/pedido.mjs pago BFA-7K2Q      # baixa as vagas em dados/ofertas.json
node scripts/pedido.mjs lista
```

**Pendente (16/11, 05h):** a InfinitePay respondeu `external_checkout_not_enabled`.
É preciso ligar o checkout externo uma vez em
<https://app.infinitepay.io/external-checkout#configuracoes?enabled=true>.

## Publicação

- **Coolify:** projeto Yuri dos Anjos, ambiente `production`, app
  `bfa-ofertas`, repositório público `gustavomondrgn/bfa-yuri`, branch `main`,
  base directory `/ofertas`, Dockerfile, porta 80, domínio
  `https://yuridosanjos.com.br/bfa`.
- **Push não publica sozinho** (sem webhook): Redeploy no painel ou
  `POST /api/v1/deploy` com o uuid do app.
- **Coexistência com `/bfa-grupo`:** o Traefik dá prioridade à regra mais
  longa, então `PathPrefix(/bfa-grupo)` continua no app da ponte. Este nginx
  não serve `/bfa-grupo` e responde com e sem o `stripprefix` do Coolify.
- **Cloudflare:** não há regra de cache para `/bfa`; HTML e JSON não ficam na
  borda (o padrão do Cloudflare não guarda HTML nem JSON). O `app.js` leva
  `?v=` com o hash do conteúdo. Se um dia criar regra de cache para `/bfa`,
  ela precisa excluir `/bfa/ofertas.json` e exige purge a cada mudança.
