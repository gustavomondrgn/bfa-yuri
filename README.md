# bfa-grupo

Página ponte da **Black Friday Apocalíptica** de Yuri dos Anjos, para
**<https://yuridosanjos.com.br/bfa-grupo>**.

Uma única seção e um único botão, **ENTRAR NO GRUPO**, que é um link comum
para o convite do grupo do WhatsApp. A página não tem formulário, login,
coleta de dados ou menu. O botão funciona mesmo sem JavaScript e sem o Pixel,
e com o Pixel bloqueado.

`/bfa` (ofertas de 16/11) **não** faz parte deste app.

## Stack

HTML e JavaScript puros servidos por **nginx** num container Docker, no mesmo
arranjo do `/guias` (ISCAS GRATIS): Coolify na Hetzner, Traefik roteando por
`PathPrefix(/bfa-grupo)`, domínio atrás do Cloudflare. Não usa build de
front-end nem webfont, e o CSS vai inline: a página chega numa única
resposta.

```text
site/index.html              página inteira: CSS, botão e medição (Pixel) inline
site/assets/favicon.svg      ícone
site/assets/og-bfa-grupo.png prévia do link (WhatsApp, Instagram), 1200×630
nginx.conf                   rotas, headers e cache
Dockerfile                   nginx:1.27-alpine, roda `nginx -t` no build
scripts/preview.mjs          preview local sem Docker
scripts/verificar.mjs        verificação automática no Chrome
scripts/og-image.html        molde da imagem de prévia (npm run og)
```

Peso sem Pixel: cerca de 5 KB comprimidos no HTML + favicon. O Pixel da Meta
baixa mais ~200 KB comprimidos (fbevents.js + configuração) depois que o botão
já apareceu.

## Preview e verificação locais

Requer Node (via fnm) e o Google Chrome instalado.

```powershell
$env:Path = "C:\Users\PICHAU\AppData\Roaming\fnm\node-versions\v22.22.1\installation;$env:Path"
npm install            # só na primeira vez (playwright-core e axe-core)
npm run preview        # http://localhost:4173/bfa-grupo
npm run verificar      # 56 verificações; capturas em verificacao/
npm run velocidade -- --base http://localhost:4173 --rotulo teste   # rede lenta
```

`npm run verificar` não entra no grupo nem envia nada à Meta: o convite é
interceptado com uma resposta simulada e todo pedido a domínios da Meta é
bloqueado. O teste "com Pixel" injeta um ID fictício só na memória do teste
para inspecionar a fila do `fbq`. O ID nunca é gravado no site.

Itens verificados: rotas, headers, copy exata, um único link com o href
completo do convite, telas 360, 390 e 430 px (inclusive com a altura reduzida
pelo navegador do Instagram), zoom de 200%, fonte ampliada em 130% e 200%,
ausência de vazamento lateral e de sobreposição, alvo de toque, foco por
teclado, axe-core (WCAG 2.2 A/AA), página sem JavaScript, abertura do
convite real do WhatsApp (sem entrar no grupo), Pixel bloqueado, PageView único, clique duplo contado uma vez e
as UTMs filtradas.

## Notas da página

O `site/index.html` vai para o celular sem comentários: cada byte conta no 3G
(em 12/11, 2 KB de comentários atrasavam o botão em ~60 ms). O que estaria
neles fica aqui.

- **CSS inline, sem webfont nem imagem:** a página chega numa única resposta.
- **Medição inline no fim do `<body>`:** o botão pinta primeiro, sem disputar
  banda, e o `fbevents.js` começa a baixar assim que o HTML termina. As
  campanhas otimizam "visualizações da página de destino", que dependem do
  `PageView`. O `preconnect` para `www.facebook.com` adianta a conexão que
  recebe os eventos.
- **Botão:** link comum para o convite (abre sem JavaScript e sem Pixel).
  Verde do WhatsApp `#25D366` com texto `#0B141A` (contraste 8,9:1), 60 px de
  altura. O texto é "Entrar no grupo" no HTML e vira caixa alta pelo CSS,
  para o leitor de tela não soletrar. Sem animação: cor, ícone e tamanho já
  bastam.
- **`Apoca&shy;líptica`:** ponto de quebra invisível; com zoom alto, quebra em
  "Apoca-líptica" em vez de vazar da tela.
- **`grid-template-columns: minmax(0, 1fr)`:** impede que uma palavra longa
  em fonte ampliada alargue a coluna.

## Meta Pixel

**12/11/2026:** a medição saiu do `app.js` e foi para um script inline no fim
do HTML. O botão pinta primeiro e o `fbevents.js` começa a baixar assim que o
HTML termina, sem esperar outra requisição. Os eventos e as regras abaixo não
mudaram. O clique é registrado por um único listener no documento; no
navegador do Instagram, o próprio `fbevents.js` instala um listener seu, que
não gera evento extra.

**Instalado em 10/11/2026:** Pixel **"Pixel Yuri dos Anjos"**, ID
`549360853227105` (proprietário Yuri dos Anjos, compartilhado com a conta de
anúncios CA DAEDALOS `508603157734428`, que **não** é ID de Pixel). O outro
Pixel da conta, `1243483549840950`, não é usado aqui.

O ID fica em `site/index.html`:

```html
<meta name="meta-pixel-id" content="549360853227105">
```

Trocar ou esvaziar esse campo exige push e redeploy (ver "Push não publica
sozinho" abaixo). Com o campo vazio, a página não carrega nada da Meta.

`npm run verificar` confere o que o navegador **envia** para a Meta, com o
`fbevents.js` real e os eventos interceptados antes de sair (nada chega ao
Pixel). Que a Meta **recebeu** só se confirma em **Gerenciador de Eventos →
Pixel Yuri dos Anjos → Eventos de teste**.

| Sinal | Quando | Parâmetros |
| --- | --- | --- |
| `PageView` (padrão) | uma vez por visita | as UTMs conhecidas, se houver |
| `WhatsAppGroupClick` (personalizado, via `trackCustom`) | a cada toque no botão; toques repetidos no mesmo segundo contam uma vez | as UTMs conhecidas, se houver |

- **Visita** e **clique para o WhatsApp** não comprovam ingresso no grupo.
  Não registrar `Lead`, cadastro ou compra a partir deles.
- `autoConfig` fica desligado (`fbq('set','autoConfig',false,ID)` antes do
  `init`, conforme a documentação da Meta). Sem isso, o Pixel registraria o
  mesmo toque também como clique automático.
- Só `utm_source`, `utm_medium`, `utm_campaign` e `utm_content` vão nos
  parâmetros, e só com valores simples (letras, números, `_ - .`). Valor com
  espaço, `@` ou outros caracteres é descartado. O Pixel envia o endereço da
  página por conta própria; isso é da ferramenta, não deste código.
- O clique nunca espera o Pixel. O `fbevents.js` atual usa `sendBeacon`, que
  costuma entregar o evento mesmo com a troca de página. Ainda assim, uma
  parte dos cliques pode não chegar (bloqueador, rede fraca, saída antes de o
  script carregar). É o custo de não atrasar o botão.
- Se algum dia a página ganhar um Pixel global (outro script já definindo
  `fbq`), o script da página não inicializa de novo nem repete o PageView; só registra
  o clique.

Depois de colar o ID e publicar, conferir no **Gerenciador de Eventos → Testar
eventos**: abrir a página com o código de teste, tocar no botão e ver os dois
eventos chegarem. Só então considerar a medição ativa.

## Links com UTM (propostos, ainda não publicados)

```text
Story com adesivo
https://yuridosanjos.com.br/bfa-grupo?utm_source=instagram&utm_medium=organic_social&utm_campaign=bf_apocaliptica_2026&utm_content=story_link

DM da automação (resposta "EU QUERO" ao Story)
https://yuridosanjos.com.br/bfa-grupo?utm_source=instagram&utm_medium=dm&utm_campaign=bf_apocaliptica_2026&utm_content=keyword_eu_quero

Anúncios: mesma página, utm_medium=paid_social e utm_content com o nome do criativo
```

## Rotas do container

| Pedido | Resposta |
| --- | --- |
| `/bfa-grupo`, `/bfa-grupo/` | a página, sem redirect (UTMs preservadas), `Cache-Control: no-cache` |
| `/bfa-grupo/assets/*` | arquivos, cache de 10 min (o HTML usa `?v=`) |
| `/`, `/assets/*` | o mesmo, para o caso de o Coolify aplicar `stripprefix` |
| `/healthz` | `ok` (healthcheck interno) |
| qualquer outro | 404 |

O `/guias` quebra se o Coolify recolocar o `stripprefix`. Este app responde
com e sem o corte de prefixo, então não depende disso.

## Publicação (no ar desde 10/11/2026)

- **Repositório:** <https://github.com/gustavomondrgn/bfa-yuri> (público).
- **Coolify** (<https://coolify.kandle.studio>): projeto **Yuri dos Anjos**,
  ambiente `production`, app **`bfa-grupo`** (uuid
  `agrsd6rza28b7cgdgsquoy7n`). Fonte: repositório público, branch `main`,
  Build Pack Dockerfile, porta 80, health check `/healthz`.
- **Domínio:** `https://yuridosanjos.com.br/bfa-grupo`. O Coolify gerou o
  `stripprefix` nos labels; o `nginx.conf` atende com e sem ele, então os
  labels ficaram como foram gerados.
- **Verificação em produção:** 46/46 com
  `$env:BASE = "https://yuridosanjos.com.br"; npm run verificar`.

**Push não publica sozinho.** O app usa o repositório público, sem o GitHub
App `yuri-dos-anjos-github` (que só tem acesso a repositórios selecionados) e
sem webhook. Depois de um push, publicar de um destes jeitos:

- botão **Redeploy** do app `bfa-grupo` no Coolify; ou
- API: `POST https://coolify.kandle.studio/api/v1/deploy` com
  `{"uuid":"agrsd6rza28b7cgdgsquoy7n"}` e o token do Coolify no header
  `Authorization: Bearer`.

O build roda `nginx -t`; um erro no `nginx.conf` derruba o build em vez de ir
para o ar.

O Cloudflare do domínio injeta o próprio Web Analytics (`beacon.min.js`,
assíncrono, cerca de 31 KB). É configuração do domínio inteiro, não deste app.
O HTML não fica em cache no Cloudflare; se algum dia houver regra "Cache
Everything", purgar `/bfa-grupo` depois de cada mudança.

### Cuidado com o futuro `/bfa`

No Traefik, `PathPrefix(/bfa)` também casa com `/bfa-grupo`. Com a prioridade
padrão, vence a regra mais longa, então `/bfa-grupo` continua aqui. Se o app
de ofertas receber prioridade manual, conferir que ele não captura
`/bfa-grupo`.

## Alterar a página

- Texto ou visual: editar `site/index.html`. Não precisa trocar versão; o HTML
  sai com `no-cache`.
- Favicon ou imagem de prévia: trocar o arquivo e subir o `?v=` no
  HTML.
- Imagem de prévia: editar `scripts/og-image.html` e rodar `npm run og`.
- Rodar `npm run verificar` antes de publicar.
