# O Closer hoje: como funciona (para o Gustavo)

> Escrito em 22/11/2026, a pedido do Yuri, para o Gustavo montar o repositório novo (Closer + gerador de link na
> InfinitePay + CRM on-line). Descreve o sistema; **não traz dado de cliente**.

## 1. Onde está

**O Closer não está no GitHub.** Ele mora só na máquina do Yuri, em `D:\Projetos Claude\Closer\`, e o git da pasta
`D:\Projetos Claude` o ignora de propósito, porque as fichas de lead têm nome, conversa e valores.

| Peça | Caminho |
|---|---|
| A base de conhecimento e o CRM | `D:\Projetos Claude\Closer\` |
| A skill que ativa tudo (`/closer`) | `D:\Projetos Claude\.claude\skills\closer\SKILL.md` |
| A campanha vigente, que o `/closer` lê antes de tudo | `D:\Projetos Claude\CMO\CAMPANHA-VIGENTE.md` |
| A cópia de 16/11 usada na BFA | `CMO\bfa-yuri\.claude\skills\closer-bfa\` (já divergiu do original) |

**Não existe servidor nem banco.** É Claude Code lendo e escrevendo arquivos `.md` e um script Python que gera o
painel em HTML.

## 2. As duas metades

### 2.1 O conhecimento (o "cérebro"), em Markdown

| Arquivo | O que é |
|---|---|
| `00_persona-e-voz.md` | quem o closer é, o formato de resposta (4 blocos), a voz do Yuri, as regras travadas. Manda sobre os outros |
| `01_produtos-e-ofertas.md` | preços vigentes, fichas de produto, upsell, parcelamento. Fonte única de preço |
| `02_playbook.md` | táticas, objeções, cadência de follow-up |
| `03_frameworks-voss.md` | técnica de negociação (Chris Voss) |
| `04_banco-de-casos.md` | arquétipos de dor, para reconhecimento |
| `06_roteiro-de-atendimento.md` | do primeiro "oi" ao Pix: triagem, prescrição, oferta, fechamento, upsell pós-consulta |
| `07_escadinha-do-privado.md` | a conversa antes do catálogo |
| `08_leitura-do-lead.md` | ler o lado do lead e a prévia da notificação |
| `experiencia/aprendizado.md` | lições consolidadas dos casos; lido em toda sessão |

O Yuri muda esses arquivos conversando ("isso vira regra", "o preço mudou"), e o Claude edita. **Eles precisam
continuar sendo texto que o Claude lê e edita**: é isso que faz o Closer aprender.

### 2.2 O CRM, em arquivos

- **A fonte é a ficha.** Um `.md` por lead em `experiencia/casos/` (76 hoje). O cabeçalho YAML tem a lista
  `oportunidades:`, uma por produto ofertado. Gabarito com todos os campos: `experiencia/casos/_MODELO.md`.
- **Campos da oportunidade:** `produto`, `tipo` (venda | upsell), `valor`, `etapa` (a_ofertar → triagem →
  oferta_enviada → negociando → fechou | perdido | arquivado), `entrou`, `ultimo_movimento`, `acao` (mandar |
  conferir | entregar | aguardar | nenhuma), `acao_em`, `excecao`, `tentativas`, `sensivel_dinheiro`, `situacao`,
  `proxima_acao` e, ao decidir, `encerrou_em`, `recebido`, `motivo`, `licao`, `pasta_entrega`.
- **Fora do cabeçalho**, o corpo da ficha tem o contexto, o **"sugerido × enviado"** (o que o Closer sugeriu e o que
  o Yuri mandou de fato) e a lição.
- **A régua automática:** lead parado 2 dias sem resposta → o painel pede um toque; 3 toques sem compra → Retirada
  Elegante. Com `sensivel_dinheiro`, sem toque automático.
- **Pós-venda dos laudos:** `experiencia/pos-venda.yaml`, uma entrada por pasta de entrega (`potencial/NNN-nome`,
  `raiox/NNN-nome`), com `enviado_em`, `retorno_em`, `retorno`, `upsell_em`, `upsell`, `encerrado`, `nota`.
- **O painel:** `painel/gerar_painel.py` lê as fichas e o `pos-venda.yaml` e escreve `CRM.html` (desenho em
  `painel/modelo.html`) e `experiencia/indice.md`. **Os dois são gerados, nunca editados à mão.** Abas: **Hoje** ·
  **Pipeline** · **Relatório** (semana, mês, ano, por origem) · **Caixinhas** · **Fechados**.
- **O que o painel lê de fora, só para leitura:** a base de leads das caixinhas (`Roteiros\caixinhas\leads`) e as
  pastas de entrega do Potencial e do Raio-X (só nome, número e data dos arquivos, para saber se o texto e o PDF
  estão prontos; nascimento, e-mail e telefone não entram).

## 3. Como o Yuri usa, no dia a dia

1. Abre uma sessão do Claude Code e digita `/closer`. O Closer lê a persona, a leitura do lead, o playbook, o
   aprendizado e a campanha vigente, e **abre dizendo o que está pendente hoje** (a aba Hoje).
2. Cola o print ou o histórico de um lead. Recebe os 4 blocos: 🔍 Diagnóstico · ⚠️ Trava · 💬 a mensagem pronta,
   na voz dele · 🎯 Por que funciona.
3. **Copia a mensagem e manda à mão**, pelo WhatsApp ou pelo Instagram.
4. Volta e conta: *"mandei"*, *"ela respondeu que…"*, *"pagou"*, *"sumiu"*. O Claude atualiza a ficha e roda o
   gerador.
5. **O link de pagamento é feito à mão na InfinitePay**, fora do sistema. O Closer só fica sabendo que alguém pagou
   quando o Yuri conta.
6. Pós-venda: *"mandei o PDF do fulano"*, *"ofertei o upsell para…"* vão para o `pos-venda.yaml`; o upsell vira
   oportunidade na ficha.
7. De tempos em tempos: *"registra esse caso"* (ficha nova) e *"consolida a experiência"* (as lições sobem para o
   `aprendizado.md`).

## 4. Onde dói hoje

- **O link de pagamento é manual**, e o "pagou" depende do Yuri lembrar de contar. Na BFA você já resolveu as duas
  coisas (link pela API e baixa pelo webhook).
- **O painel é um HTML local:** não abre no celular e só se atualiza quando o script roda.
- **O estado do lead depende de relato.** Se o Yuri não conta que mandou, a ficha fica velha.
- **Já existem duas cópias do Closer** (a do dia a dia e a da BFA) e dois CRMs (as fichas e o banco da BFA).

## 5. O que entra agora: o upsell do Potencial

O caso que motivou tudo isso. O script está em `CMO\upsell-low-ticket\script-upsell-potencial.md`. A produção do
Potencial passa a gerar, depois do PDF, uma ficha `upsell.md` na pasta de cada cliente (handoff em
`entregas\diagnostico_project\HANDOFF-ficha-de-upsell.md`, já no seu repositório do Potencial). O fluxo que o
sistema novo precisa cobrir:

**PDF entregue → feedback → conversa (script) → oferta com prazo de 24h e dias de agenda → link → pago →
agendamento.**

## 6. O que o sistema novo não pode perder

1. **O Claude precisa ler e escrever o CRM.** Hoje o `/closer` abre a ficha do lead antes de sugerir e grava o que
   aconteceu depois. Se o CRM for para um banco on-line, o Claude precisa de acesso por API (ler a ficha, gravar o
   movimento), senão o Closer perde a memória.
2. **O "sugerido × enviado"** e as lições: são o corpus de voz do Yuri e o que faz o Closer aprender.
3. **O conhecimento continua em texto editável.**
4. **Dado de cliente só em repositório privado.** O `bfa-yuri` é público.

## 7. Uma decisão do Yuri que mexe nisso

Em 22/11 ele pediu para **trabalhar o Closer direto da pasta `CMO\`**, em vez de deixá-lo isolado em `Closer\`, para
juntar os projetos. Vale combinar onde fica a parte local (o conhecimento e a skill) junto com o repositório novo.
