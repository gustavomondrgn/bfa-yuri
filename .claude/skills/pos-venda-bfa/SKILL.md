---
name: pos-venda-bfa
description: Pós-venda da Black Friday Apocalíptica. Use quando o Yuri perguntar o que falta entregar, quem recebeu agenda, formulário ou produto, pedir "pós-venda", "quem falta", "o que tenho que mandar", ou avisar que mandou algo ("mandei a agenda pro Wil", "a Paulla preencheu o formulário", "entreguei o áudio do Trajano").
---

# Pós-venda da BFA

O Yuri cuida do que vem depois do pagamento. O objetivo é um só: **ninguém fica sem receber o que comprou.**

Tudo mora em `pos-venda/` (raiz do repositório):

| Arquivo | O que é | Vai para o git? |
|---|---|---|
| `entregas.json` | como se entrega cada produto: canal, link, o que pedir ao cliente, prazo, etapas | sim (sem dado de cliente) |
| `painel.py` | puxa os pedidos do CRM, cruza com o acompanhamento e gera o painel | sim |
| `dados/acompanhamento.yaml` | em que etapa está cada item de cada pedido | **nunca** (dado de cliente; repo público) |
| `dados/pedidos.json`, `dados/PAINEL.html` | cópia dos pedidos e o painel gerado | **nunca** |

## Ao ativar: o andamento, sem ele pedir

1. Rode `python pos-venda/painel.py`. Ele precisa de acesso ao CRM por variável de ambiente: `BFA_CRM_USUARIO` e
   `BFA_CRM_SENHA` (ou `CRM_CHAVE`). Se não estiverem definidas, **peça a senha ao Yuri e passe só no comando**
   (`BFA_CRM_USUARIO=... BFA_CRM_SENHA=... python pos-venda/painel.py`); **nunca grave a senha em arquivo.**
   Sem acesso, `--offline` usa a última cópia.
2. O resumo também traz as **oportunidades** (`dados/oportunidades.yaml`: leads que ainda não compraram, cuidados
   pelo `/closer-bfa`). Avise os toques vencidos (⏰).
3. Dê ao Yuri, nesta ordem: **mandar agora** · **cobrar retorno** (enviado há 2+ dias sem resposta) · **em produção
   com prazo** (destaque o atrasado) · **consultas marcadas** · **tudo entregue, falta marcar no CRM**.
4. Para "mandar agora", entregue a **mensagem pronta de cada pedido** (uma por pedido, cobrindo todos os itens). O
   painel HTML (`pos-venda/dados/PAINEL.html`) tem o botão que abre o WhatsApp com ela.

## Quando o Yuri cola o print de uma compra

É o uso principal: os links estão espalhados no computador e no Telegram, e o Yuri quer pegá-los **aqui**.
Leia o código `BFA-XXXX` no print e rode:

```
python pos-venda/painel.py mensagem BFA-XXXX
```

Devolva a mensagem pronta para copiar, com os links certos de cada item. Se o CRM ainda mostrar "aguardando" e o
print tiver o comprovante, avise para marcar "pago" no CRM. **Não marque como enviado** até ele confirmar que mandou
("mandei", "foi"); confirmado, use o `marcar` abaixo.

## Quando o Yuri avisa que algo andou

Anote **na hora**, sem perguntar se pode, e regenere:

```
python pos-venda/painel.py marcar BFA-XXXX <produto> <etapa> [--nota "..."] [--data AAAA-MM-DD] [--para "25/11 15h"]
```

- `<produto>` é o id do `entregas.json` (`bussola`, `raio-x`, `potencial-riqueza`, `temperamento`, `formula-felicidade`,
  `horaria`, `natal-escrita`, `a-cura`, `sinastria`, `revolucao-solar`, `caixa-pandora`, `consulta-natal`,
  `compre-tempo`, `mentoria`, `pacote-astrologia`, `pacote-religiao`).
- `<etapa>` é uma das etapas daquele produto no `entregas.json`. "Mandei a mensagem de boas-vindas" com formulário e
  agenda no mesmo pedido = marcar **cada item** na sua primeira etapa.
- Se ele disser só o nome do cliente, ache o código no painel. Dois pedidos do mesmo nome → pergunte qual.
- Data diferente de hoje ("mandei ontem") → `--data`.
- **Entregue tudo de um pedido** → lembre o Yuri de clicar **Marcar entregue** no CRM (o painel lista esses pedidos).
  O script só **lê** o CRM; quem marca lá é ele.

## Regras

- **Bússola da BFA é só escrita** (Yuri e Gustavo, 16/11/2026): formulário da Bússola e entrega em 14 dias, sem agenda.
- **Cursos:** o acesso é liberado no **e-mail** da pessoa. Peça o e-mail ao cliente; quando chegar, marque
  `email_recebido` e **avise o Yuri com o nome e o e-mail**, que ele libera na plataforma.
- **Prazos** contam do dia em que os dados chegam (formulário preenchido ou dados recebidos): 7 dias (Potencial,
  Raio-X), 14 dias (Bússola, A Cura, Natal Escrita), 24 a 48 h (Temperamento, Fórmula da Felicidade, Horária).
- Mensagem ao cliente sai na voz do Yuri, DM falada: sem travessão, "nós" e nunca "a gente", sem exclamação decorativa
  (regras em `.claude/skills/closer-bfa/conhecimento/00_persona-e-voz.md`).
- **Não misture com o CRM do Closer** (`D:\Projetos Claude\Closer\`). O pós-venda da BFA vive só aqui.
- Upsell depois da entrega segue a Estação 5 do `closer-bfa/conhecimento/06_roteiro-de-atendimento.md`, e só quando o
  Yuri pedir.

## Links

Todos no `entregas.json` (agenda, formulários de Potencial, Raio-X, A Cura, Sinastria e Bússola). Link novo ou
trocado: edite lá, e todas as mensagens passam a usá-lo.
