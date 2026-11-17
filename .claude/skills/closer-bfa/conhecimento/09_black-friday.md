# 09 — O que muda na Black Friday Apocalíptica (16 a 19/11/2026)

> **Este arquivo vence os outros onde eles divergem.** Os arquivos 00 a 08 e o `aprendizado.md` são cópias do Closer
> do dia a dia (copiados em 16/11/2026) e falam da tabela normal, da ficha de lead e do CRM do Closer. Na BFA, o
> preço, o pedido e o registro são outros. O que não está aqui segue valendo como lá: voz, leitura do lead, travas,
> quebra de objeção, Voss.

## 1. Quem faz o quê

- **Gustavo faz a venda e o pagamento.** O closer da BFA é **plano de emergência**: entra quando o Yuri precisar
  atender um lead no lugar dele.
- **Yuri faz o pós-venda** (skill `/pos-venda-bfa`).
- **Nada desta skill escreve no CRM do Closer** (`D:\Projetos Claude\Closer\experiencia\`). Nem ficha, nem índice, nem
  painel. O registro da BFA é o **CRM da BFA** (yuridosanjos.com.br/bfa-crm), campo *Anotações* de cada pedido.

## 2. Preço: só a página, só o dia

- **Fonte única:** `ofertas/dados/ofertas.json` deste repositório (a mesma que gera yuridosanjos.com.br/bfa).
  **Nunca** cote pelo `01_produtos-e-ofertas.md` do Closer: aqueles são os preços de tabela, fora da campanha.
- **O preço depende do dia**, pela fase (`d16`, `d17`, `d18`, `d19`), e **vira à meia-noite**. O que define o preço de
  um pedido é **o horário da mensagem do cliente**, não o horário em que ele paga.
- **O desconto diminui a cada dia** (o preço sobe à meia-noite). Diga **"regressivo"**, nunca "progressivo". O dia 16
  é o mais barato; o 19 é o último e o mais caro da campanha, ainda com desconto.
- **Pacotes de cursos** têm preço fixo até 19/11 (497 e 297). **Mentoria** sobe por dia (2.000 → 2.750 → 3.350 → 3.950).
- **Vagas** são as do campo `vagas` de cada item. Ao cotar, confira o arquivo atualizado (`git pull`) ou a página.
  Vaga esgotada não se reabre por conta do closer.
- Antes de citar qualquer número, **abra o `ofertas.json`** e leia o preço da fase do dia. Nunca de memória.
- 🔴 **O CRM sobrepõe o `ofertas.json`** *(descoberto em 17/11/2026)*. A página e o `pedido.mjs` leem os preços de
  `CRM_URL/api/precos` ("preços do CRM: N valor(es) aplicados") e só caem no JSON se o CRM não responder. Em 17/11 o
  JSON dizia R$ 77 no Raio-X, no Potencial, na Fórmula e no Temperamento, e R$ 547 na A Cura. O valor que valia era
  R$ 97 e R$ 497. Três toques saíram com o "hoje está" errado. **Para cotar, leia o CRM**, em `ofertas/`:
  `node --env-file=.env --input-type=module -e 'const j=await (await fetch(process.env.CRM_URL+"/api/precos")).json();console.log(j.precos)'`

## 3. Como o lead chega e como a venda fecha

1. O lead monta o carrinho na página `/bfa` e o botão abre o WhatsApp do Yuri com a **mensagem pronta**: itens, valor e
   um **código `BFA-XXXX`** com o horário.
2. O que o closer faz aqui é o que a página não faz: **tirar a dúvida, ajudar a escolher, quebrar a objeção** (os
   arquivos 06, 07 e 03). O lead que já mandou o carrinho **já decidiu**: não reabra a triagem, confirme e conduza ao
   pagamento. Triagem só para quem chega perguntando "qual serve para mim?".
3. **Gerar o link quando o Yuri mandar o print do pedido** (pacote de acesso do Gustavo, 16/11; o `ofertas/.env` está
   instalado, fora do git). Em `ofertas/`, com `git pull` antes:
   `node --env-file=.env scripts/pedido.mjs novo --codigo BFA-XXXX --nome "Nome do contato" --tel 55DDDNUMERO --itens id,id:2 --quando AAAA-MM-DDTHH:MM`
   - Código e horário **da mensagem do cliente** (o horário define o preço). `--tel` só números, com DDI.
   - **O total impresso tem de bater com o da mensagem.** Se não bater, avise antes de mandar.
   - Responda ao Yuri só com isto, em bloco de código: `Segue: https://yuridosanjos.com.br/pg/XXXX` + `Só mandar o comprovante`.
     **Nada além disso** (Yuri, 16/11/2026): nem dados de nascimento, nem formulário, nem agenda. Isso tudo vai na
     mensagem de pós-venda, depois do pagamento (`/pos-venda-bfa`).
   - O controle local com nome e telefone fica em `C:/bfa-pedidos` (fora do repositório). Nunca `git add` de `.env`
     nem dessa pasta.
4. **O pagamento se confirma sozinho no CRM** e as vagas baixam sozinhas na página. Não mexa em vagas, preço, página
   nem deploy. Pagou por fora (Pix direto na chave, remessa do exterior): marcar pago **no CRM**, nunca com
   `pedido.mjs pago`. Cliente mudou o pedido: criar o novo e cancelar o antigo no CRM. **Não rode `refazer-links` nem
   `sincronizar`** sem pedido do Gustavo.
5. **Forma de pagamento:** Pix ou cartão pelo link; **até 3x sem juros** no cartão (a taxa sai do Yuri), de 4x em diante
   com juros para o cliente. Cartão de fora do Brasil não passa: Pix por app de remessa (Remitly, Paysend) ou alguém da
   família no Brasil paga o link. A "entrada no Pix + resto no cartão" do playbook não está no fluxo da BFA; só com
   decisão do Yuri.
6. **Link de pagamento tem prazo** (06, §4.3.1): ao mandar, diga que é só pedir outro se expirar.

## 4. O que muda no playbook

- **Escada de combo (20/25/30%) não se soma ao preço da BFA.** O carrinho já é a condição. Pedido de desconto em cima
  do preço da página = **exceção, decisão do Yuri** (02, regras travadas).
- **Desconto de dia vencido não volta.** Quem mandou a mensagem às 00h05 do dia 17 paga o preço do 17. Se o Yuri quiser
  segurar o preço de alguém, a decisão é dele e fica anotada no pedido.
- **Curso avulso não existe na campanha.** Só os dois pacotes.
- **Bússola: na BFA ela é só escrita**, como diz a página (40–50 páginas, 14 dias), sem consulta em vídeo nem agenda.
  Decidido pelo Yuri com o Gustavo em 16/11/2026, depois de uma dúvida de manhã sobre o formato.
- **Escassez é real e datada**, então a estimulação contraditória (aprendizado) cabe inteira: dar o prazo (o desconto
  cai à meia-noite) e tirar a pressa na mesma mensagem.
- **Agenda:** a regra continua (02, *Fechamento e agenda*): o closer não promete horário. Pago, o Yuri manda o link.
- **Cliente que já comprou antes** (está nas fichas do Closer) recebe o enquadramento de upgrade (00). Pode consultar a
  ficha dele no Closer **para ler**, nunca para escrever.

## 5. O que o closer NÃO pode prometer na BFA

Curso avulso · desconto de dia que já caiu · vaga além do card · preço diferente da página · combo em cima do carrinho ·
consulta em vídeo ou agenda na Bússola · prazo de entrega diferente do card (`detalhe` no `ofertas.json`) · horário de agenda.

## 6. Depois do sim

Pago o pedido, ele aparece no `/pos-venda-bfa`. O closer não manda formulário nem agenda: isso é do pós-venda.
