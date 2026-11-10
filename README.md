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
site/index.html              página + CSS inline (copy, botão, meta do Pixel)
site/app.js                  medição: PageView e WhatsAppGroupClick (opcional)
site/assets/favicon.svg      ícone
site/assets/og-bfa-grupo.png prévia do link (WhatsApp, Instagram), 1200×630
nginx.conf                   rotas, headers e cache
Dockerfile                   nginx:1.27-alpine, roda `nginx -t` no build
scripts/preview.mjs          preview local sem Docker
scripts/verificar.mjs        verificação automática no Chrome
scripts/og-image.html        molde da imagem de prévia (npm run og)
```

Peso sem Pixel: cerca de 11 KB em 3 arquivos (HTML, app.js e favicon).

## Preview e verificação locais

Requer Node (via fnm) e o Google Chrome instalado.

```powershell
$env:Path = "C:\Users\PICHAU\AppData\Roaming\fnm\node-versions\v22.22.1\installation;$env:Path"
npm install            # só na primeira vez (playwright-core e axe-core)
npm run preview        # http://localhost:4173/bfa-grupo
npm run verificar      # 47 verificações; capturas em verificacao/
```

`npm run verificar` não entra no grupo nem envia nada à Meta: o convite é
interceptado com uma resposta simulada e todo pedido a domínios da Meta é
bloqueado. O teste "com Pixel" injeta um ID fictício só na memória do teste
para inspecionar a fila do `fbq`. O ID nunca é gravado no site.

Itens verificados: rotas, headers, copy exata, um único link com o href
completo do convite, telas 360, 390 e 430 px (inclusive com a altura reduzida
pelo navegador do Instagram), zoom de 200%, fonte ampliada em 130% e 200%,
ausência de vazamento lateral e de sobreposição, alvo de toque, foco por
teclado, axe-core (WCAG 2.2 A/AA), página sem JavaScript, `app.js`
indisponível, Pixel bloqueado, PageView único, clique duplo contado uma vez e
as UTMs filtradas.

## Meta Pixel

Nenhum projeto do Yuri tinha Pixel instalado até 10/11/2026. A página está
**preparada, mas desligada**: falta o ID real.

Para ligar, cole o ID (só números) em `site/index.html`:

```html
<meta name="meta-pixel-id" content="">
```

Com o campo vazio, a página não carrega nada da Meta.

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
  `fbq`), o `app.js` não inicializa de novo nem repete o PageView; só registra
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
| `/bfa-grupo/app.js`, `/bfa-grupo/assets/*` | arquivos, cache de 10 min (o HTML usa `?v=`) |
| `/`, `/app.js`, `/assets/*` | o mesmo, para o caso de o Coolify aplicar `stripprefix` |
| `/healthz` | `ok` (healthcheck interno) |
| qualquer outro | 404 |

O `/guias` quebra se o Coolify recolocar o `stripprefix`. Este app responde
com e sem o corte de prefixo, então não depende disso.

## Publicar

Nada disto foi executado. Publicar depende de pedido explícito do Gustavo.

1. Criar o repositório no GitHub (sugestão: `gustavomondrgn/bfa-grupo-yuri`,
   privado), fazer o commit e o push da branch `main`.
2. No Coolify, projeto do Yuri: **New Resource → Private Repository**, usando o
   GitHub App `yuri-dos-anjos-github`. Branch `main`, **Build Pack:
   Dockerfile**, porta exposta **80**.
3. **Domains:** `https://yuridosanjos.com.br/bfa-grupo`.
4. Deploy. O build roda `nginx -t`; um erro no `nginx.conf` derruba o build
   em vez de ir para o ar.
5. Conferir no ar:

   ```powershell
   curl.exe -I https://yuridosanjos.com.br/bfa-grupo
   $env:BASE = "https://yuridosanjos.com.br"; npm run verificar
   ```

   Abrir também no celular, pelo navegador do Instagram (link na DM ou no
   Story de teste), sem precisar entrar no grupo.
6. Cloudflare: o HTML não fica em cache por padrão. Se houver regra "Cache
   Everything" no domínio, purgar `/bfa-grupo` depois de cada mudança.

### Cuidado com o futuro `/bfa`

No Traefik, `PathPrefix(/bfa)` também casa com `/bfa-grupo`. Com a prioridade
padrão, vence a regra mais longa, então `/bfa-grupo` continua aqui. Se o app
de ofertas receber prioridade manual, conferir que ele não captura
`/bfa-grupo`.

## Alterar a página

- Texto ou visual: editar `site/index.html`. Não precisa trocar versão; o HTML
  sai com `no-cache`.
- `app.js`, favicon ou imagem de prévia: trocar o arquivo e subir o `?v=` no
  HTML.
- Imagem de prévia: editar `scripts/og-image.html` e rodar `npm run og`.
- Rodar `npm run verificar` antes de publicar.
