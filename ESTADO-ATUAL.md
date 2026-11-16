# Black Friday Apocalíptica — estado atual (16/11/2026, manhã)

Repositório **público**: aqui só há código. Senhas, chaves e dados de clientes **não** entram no git
(ficam nos arquivos `.env` locais, no Coolify e no banco Neon). Peça os `.env` ao Gustavo em particular.

## O que está no ar

| Pasta | O que é | Endereço | App no Coolify |
|---|---|---|---|
| raiz (`site/`, `Dockerfile`) | página ponte do grupo | yuridosanjos.com.br/bfa-grupo | `bfa-grupo` |
| `ofertas/` | página de ofertas (carrinho → WhatsApp) | yuridosanjos.com.br/bfa | `bfa-ofertas` |
| `crm/` | CRM dos pedidos + link curto de pagamento | yuridosanjos.com.br/bfa-crm · /pg/<código> | `bfa-crm` |
| `ofertas-b/` | versão B da página (rascunho **pausado**, não publicado) | — | — |

**Push não publica sozinho.** Depois do push, é preciso disparar o redeploy do app no Coolify
(painel ou `POST /api/v1/deploy` com o uuid do app). A página `/bfa` está aprovada: só mexer com pedido do Gustavo.

## Divisão de tarefas

- **Gustavo — pagamento:** recebe o pedido no WhatsApp, gera o link e manda ao cliente:
  `Segue: https://yuridosanjos.com.br/pg/<código>` + `Só mandar o comprovante`.
- **Yuri — depois do pagamento:** entra no CRM, aba **"A entregar"**, fala com o cliente pelo botão de WhatsApp,
  combina agendamento/dados, marca cada item entregue e, no fim, **Marcar entregue**.

## Fluxo de um pedido

1. O cliente monta o pedido em /bfa e manda a mensagem pronta no WhatsApp (tem o código `BFA-XXXX` e o horário).
2. Gerar o link (com `ofertas/.env` carregado):
   ```bash
   cd ofertas
   set -a; . ./.env; set +a
   node scripts/pedido.mjs novo --codigo BFA-XXXX --nome "Nome" --tel 55DDDNUMERO --itens bussola,horaria:3 --quando 2026-11-16T08:38
   ```
   Use o **código e o horário da mensagem do cliente** (o horário define o preço do dia). Os ids das ofertas
   estão em `ofertas/dados/ofertas.json`. Número estrangeiro: com o código do país (ex.: `1774...`).
   O comando cria o link na InfinitePay, registra o pedido no CRM e imprime o link curto `/pg/<código>`.
3. **Pagamento é confirmado sozinho:** o link sai com aviso (webhook) para o CRM e volta do cliente para
   `/bfa-crm/pago`; o CRM confere no `payment_check` da InfinitePay e marca "pago" (com método, valor e comprovante).
   Links criados **antes das 08h40 de 16/11** não têm aviso: marcar à mão.
4. **Vagas da página** só baixam com `node scripts/pedido.mjs pago BFA-XXXX` (atualiza `ofertas/dados/ofertas.json`
   e o CRM) → `npm run gerar` → commit → push → redeploy do `bfa-ofertas`.

Outros comandos: `pedido.mjs lista` · `cancelar BFA-XXXX` · `link BFA-XXXX` · `refazer-links` · `sincronizar`.

## CRM (`crm/`)

- Node 22 + Postgres (Neon, São Paulo). Login único (usuário e senha nas variáveis do Coolify).
- Painel (16/11): líquido que entrou (desconta a taxa do cartão), faturamento, falta entrar, total possível,
  gráficos "pedido × pago" e "receita por oferta", filtro por dia (16–19) e quadro kanban
  aguardando → pago → em produção → entregue (+ cancelados), com arrastar e soltar, gaveta de detalhe, desfazer
  e aviso ao vivo quando alguém paga (atualiza a cada 20 s). Visual em `crm/ui/` (app.css, app.js, favicon.svg).
- Taxa do cartão: até 16/11 09h19 a InfinitePay repassava tudo ao cliente; depois, a conta absorve até 3x
  (1x 4,2% · 2x 6,09% · 3x+ 7,01%). Tabela em `crm/ui/app.js` (TAXA, TROCA_TAXA). Pix sem taxa.
  Pagamento confirmado à mão: escolher a forma na gaveta para o líquido sair certo.
- **Vagas ao vivo (16/11):** a /bfa lê `/bfa-crm/api/vagas` (unidades pagas por oferta, sem dado de cliente) e mostra
  vagas = `vagasIniciais` − pagas; atualiza ao abrir, a cada minuto e antes de enviar o pedido. Venda paga baixa a vaga
  sozinha, sem deploy. Se o CRM não responder, vale o `vagas` do ofertas.json. Mudar o total de vagas = editar
  `vagasIniciais` + deploy.
- O `POST /api/pedidos` (pedido.mjs) nunca volta um status para trás, então `sincronizar` com o controle local
  desatualizado não desfaz pagamentos nem entregas.
- Variáveis: `DATABASE_URL`, `CRM_USUARIO`, `CRM_SENHA`, `CRM_SEGREDO`, `CRM_CHAVE_API`, `CRM_WEBHOOK_K`,
  `INFINITEPAY_HANDLE`. O `ofertas/.env` precisa de `CRM_URL`, `CRM_CHAVE`, `CRM_WEBHOOK_K` e das variáveis do Coolify.

## InfinitePay

- InfiniteTag `yuri-alan-vmj` (conta do CNPJ novo). Não precisa cadastrar produto: o link é criado com os itens.
- A conta precisa ter **chave Pix cadastrada** (CNPJ), senão o Pix do checkout dá erro.

## Página de ofertas (`ofertas/`)

Leia `ofertas/README.md`. Fonte única dos preços, vagas e textos: `ofertas/dados/ofertas.json`.
`npm run gerar` monta o site; `npm run verificar` roda ~120 testes no Chrome (nada é enviado ao WhatsApp).
Preços caem a cada meia-noite até 19/11 (tabela aprovada no JSON).

## Pendências

- Conferir quais dois pedidos de R$ 47 pagaram às 08h18 (checkout) e 08h31 (Pix direto na conta).
- Vagas baixarem sozinhas no pagamento (hoje é manual, pelo `pedido.mjs pago`).
- Vídeo explicativo pronto (fora do repo); versão com "O Fortuna" descartada por direito autoral.
