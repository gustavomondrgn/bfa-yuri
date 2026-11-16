# BFA — Black Friday Apocalíptica (16 a 19/11/2026)

Repositório do Gustavo (**público**): página de ofertas, CRM dos pedidos e link de pagamento. Estado do código em
`ESTADO-ATUAL.md`.

**Nada de dado de cliente, senha ou chave entra no git.** O pós-venda guarda os dados em `pos-venda/dados/`, que fica
fora do git (`.git/info/exclude`). A senha do CRM só por variável de ambiente.

## Nesta pasta, o Yuri usa duas skills

- **`/pos-venda-bfa`**: o trabalho dele na campanha. Quem pagou, o que falta mandar (formulário, agenda, áudio, acesso
  ao curso) e o que já foi entregue.
- **`/closer-bfa`**: o Closer adaptado à campanha, para quando o Yuri precisar vender no lugar do Gustavo.

As duas só aparecem com a sessão **aberta nesta pasta** (`CMO\bfa-yuri`).

**Não misture com o Closer do dia a dia** (`D:\Projetos Claude\Closer\`): nada da BFA se registra lá.

## Preço

Fonte única: `ofertas/dados/ofertas.json`. A página `/bfa` está aprovada: só se mexe nela com pedido do Gustavo.
