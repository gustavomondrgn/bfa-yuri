// =============================================================================
//  CRM da Black Friday Apocalíptica: pedidos, pagamento e entrega.
//  Roda em https://yuridosanjos.com.br/bfa-crm (Coolify, prefixo removido pelo Traefik).
//  Dados no Postgres (Neon); nada de cliente fica no repositório.
//  Variáveis: DATABASE_URL, CRM_USUARIO, CRM_SENHA, CRM_SEGREDO, CRM_CHAVE_API, PORT.
// =============================================================================
import http from "node:http";
import crypto from "node:crypto";
import pg from "pg";
import { readFileSync } from "node:fs";

const { DATABASE_URL, CRM_USUARIO = "", CRM_SENHA = "", CRM_SEGREDO = "", CRM_CHAVE_API = "" } = process.env;
const PORT = Number(process.env.PORT) || 3000;
if (!DATABASE_URL || !CRM_USUARIO || !CRM_SENHA || !CRM_SEGREDO) { console.error("faltam variáveis de ambiente"); process.exit(1); }

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4, ssl: { rejectUnauthorized: true } });
await pool.query(`CREATE TABLE IF NOT EXISTS pedidos (
  codigo text PRIMARY KEY, status text NOT NULL DEFAULT 'aguardando', criado timestamptz NOT NULL DEFAULT now(),
  atualizado timestamptz NOT NULL DEFAULT now(), nome text NOT NULL DEFAULT '', tel text NOT NULL DEFAULT '',
  fase text NOT NULL DEFAULT '', itens jsonb NOT NULL DEFAULT '[]'::jsonb, total integer NOT NULL DEFAULT 0,
  link text NOT NULL DEFAULT '', pago_em timestamptz, entregue_em timestamptz, obs text NOT NULL DEFAULT '')`);

await pool.query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS recibo text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS metodo text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS pago_valor integer`);
// líquido real informado à mão (ex.: link do app da InfinitePay com 12x sem juros, taxa fora da tabela do CRM)
await pool.query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS liquido_real numeric(12,2)`);

const STATUS = ["aguardando", "pago", "producao", "entregue", "cancelado"];
const PAGOS = ["pago", "producao", "entregue"];
// interface do CRM (ui/): lida uma vez ao subir e embutida na página (sem cache de CDN no meio)
const ler = (f) => readFileSync(new URL("./ui/" + f, import.meta.url), "utf8");
const UI = { css: ler("app.css"), js: ler("app.js"), precos: ler("precos.js"), ico: ler("favicon.svg").trim() };
const DIAS = 30;
const HANDLE = process.env.INFINITEPAY_HANDLE || "yuri-alan-vmj";
const WEBHOOK_K = process.env.CRM_WEBHOOK_K || "";

// ------------------------------------------------- pagamento (InfinitePay) --
// O aviso da InfinitePay (webhook) e a volta do cliente (redirect) não são assinados:
// todo "pago" é conferido no /payment_check antes de mudar o pedido.
async function conferirPagamento({ order_nsu, transaction_nsu, slug }) {
  if (!order_nsu || !transaction_nsu || !slug) return { paid: false, motivo: "faltam dados" };
  const r = await fetch("https://api.checkout.infinitepay.io/payment_check", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle: HANDLE, order_nsu, transaction_nsu, slug }),
  });
  const j = await r.json().catch(() => ({}));
  return { paid: j && j.success === true && j.paid === true, ...j };
}
// ------------------------------------------------- vagas vendidas (público) --
// A página /bfa calcula vagas = vagasIniciais − unidades pagas. Só contagens por oferta, sem cliente.
// Congelar: { "bussola": 3 } faz a página contar 3 pagas para a Bússola, qualquer que seja o real
// (decisão de Gustavo em 16/11: não negar pedido nem aumentar o total anunciado). {} descongela.
await pool.query(`CREATE TABLE IF NOT EXISTS ajustes (chave text PRIMARY KEY, valor jsonb NOT NULL, atualizado timestamptz NOT NULL DEFAULT now())`);
async function congelado() {
  const r = await pool.query("SELECT valor FROM ajustes WHERE chave = 'congelar'");
  return r.rows[0]?.valor || {};
}
let cacheVagas = { em: 0, dados: null };
async function vendidosReais() {
  const r = await pool.query(
    `SELECT i->>'id' AS id, SUM(GREATEST(1, COALESCE((i->>'qtd')::int, 1)))::int AS n
       FROM pedidos, jsonb_array_elements(itens) i
      WHERE status IN ('pago','producao','entregue') AND COALESCE(i->>'id','') <> '' GROUP BY 1`);
  return Object.fromEntries(r.rows.map((x) => [x.id, x.n]));
}
async function vendidos() {
  if (cacheVagas.dados && Date.now() - cacheVagas.em < 15000) return cacheVagas.dados;
  const mostrado = { ...(await vendidosReais()) };
  for (const [id, n] of Object.entries(await congelado())) mostrado[id] = Math.max(0, Number(n) || 0);
  const dados = { vendidos: mostrado, em: new Date().toISOString() };
  cacheVagas = { em: Date.now(), dados };
  return dados;
}
const zerarVagas = () => { cacheVagas.em = 0; };

// -------------------------------------------------- preços por dia (público) --
// Tela "Preços" (/bfa-crm/precos, com login): Gustavo muda o preço de cada oferta em cada dia e salva.
// A página /bfa lê /api/precos (sem login; só números, nada de cliente) e põe por cima do
// ofertas.json, sem deploy. Formato: { "bussola": { "d16": 797, "d17": 977, ... }, ... } em reais.
// Cada versão anterior fica em 'precos-historico' (últimas 40) para desfazer um erro.
const CATALOGO = process.env.CATALOGO_URL || "/bfa/ofertas.json";
let cachePrecos = { em: 0, dados: null };
async function precos() {
  if (cachePrecos.dados && Date.now() - cachePrecos.em < 10000) return cachePrecos.dados;
  const r = await pool.query("SELECT valor, atualizado FROM ajustes WHERE chave = 'precos'");
  const dados = { precos: r.rows[0]?.valor || {}, atualizado: r.rows[0]?.atualizado || null };
  cachePrecos = { em: Date.now(), dados };
  return dados;
}
function limparPrecos(c) {
  const fonte = c && typeof c === "object" && c.precos && typeof c.precos === "object" ? c.precos : c;
  const limpo = {}, erros = [];
  for (const [id, dias] of Object.entries(fonte && typeof fonte === "object" ? fonte : {})) {
    if (!/^[a-z0-9-]{1,40}$/.test(id) || !dias || typeof dias !== "object") { erros.push(id); continue; }
    for (const [f, v] of Object.entries(dias)) {
      const n = Number(v);
      if (!/^d\d{2}$/.test(f) || !Number.isInteger(n) || n < 1 || n > 1e6) { erros.push(`${id}.${f}`); continue; }
      (limpo[id] ||= {})[f] = n;
    }
  }
  return { limpo, erros };
}
async function salvarPrecos(novo) {
  const antes = (await pool.query("SELECT valor, atualizado FROM ajustes WHERE chave = 'precos'")).rows[0];
  if (antes) {
    const h = (await pool.query("SELECT valor FROM ajustes WHERE chave = 'precos-historico'")).rows[0]?.valor || [];
    const lista = [{ em: antes.atualizado, precos: antes.valor }, ...(Array.isArray(h) ? h : [])].slice(0, 40);
    await pool.query("INSERT INTO ajustes (chave, valor) VALUES ('precos-historico', $1) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado = now()", [JSON.stringify(lista)]);
  }
  await pool.query("INSERT INTO ajustes (chave, valor) VALUES ('precos', $1) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado = now()", [JSON.stringify(novo)]);
  const mudou = [];
  for (const [id, dias] of Object.entries(novo)) for (const [f, v] of Object.entries(dias)) if (antes?.valor?.[id]?.[f] !== v) mudou.push(`${id}.${f}=${v}`);
  console.log(`[precos] salvo · ${mudou.length} mudança(s)${mudou.length ? ": " + mudou.slice(0, 40).join(" ") : ""}`);
  cachePrecos.em = 0;
  return precos();
}

async function registrarPagamento(dados, origem) {
  const codigo = String(dados.order_nsu || "").toUpperCase();
  const c = await conferirPagamento(dados);
  console.log(`[pagamento] ${origem} ${codigo} paid=${c.paid} ${c.capture_method || ""} ${c.paid_amount || ""}`);
  if (!c.paid) return { ok: false, codigo };
  const metodo = [c.capture_method === "pix" ? "Pix" : c.capture_method === "credit_card" ? "Cartão" : c.capture_method || "", c.installments > 1 ? `${c.installments}x` : ""].filter(Boolean).join(" ");
  await pool.query(
    `UPDATE pedidos SET status = CASE WHEN status IN ('aguardando','cancelado') THEN 'pago' ELSE status END,
       pago_em = COALESCE(pago_em, now()), recibo = COALESCE(NULLIF($2,''), recibo), metodo = $3,
       pago_valor = $4, atualizado = now() WHERE codigo = $1`,
    [codigo, String(dados.receipt_url || ""), metodo, Math.round(Number(c.paid_amount || c.amount || 0) / 100)],
  );
  zerarVagas();
  return { ok: true, codigo };
}

// ---------------------------------------------------------------- sessão --
const assinar = (v) => crypto.createHmac("sha256", CRM_SEGREDO).update(v).digest("base64url");
const igual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function sessaoValida(req) {
  const m = /(?:^|;\s*)crm=([^;]+)/.exec(req.headers.cookie || "");
  if (!m) return false;
  const [exp, sig] = decodeURIComponent(m[1]).split(".");
  return Number(exp) > Date.now() && igual(sig, assinar(exp));
}
const chaveValida = (req) => CRM_CHAVE_API && igual(req.headers["x-chave"] || "", CRM_CHAVE_API);
const tentativas = new Map();
function bloqueado(ip) {
  const agora = Date.now(), lista = (tentativas.get(ip) || []).filter((t) => agora - t < 10 * 60e3);
  tentativas.set(ip, lista);
  return lista.length >= 8;
}

// ------------------------------------------------------------- utilidades --
const prefixo = (req) => (req.headers["x-forwarded-prefix"] || "").replace(/\/$/, "");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function corpo(req, limite = 200e3) {
  return new Promise((ok, erro) => {
    let s = ""; req.on("data", (d) => { s += d; if (s.length > limite) { erro(new Error("grande")); req.destroy(); } });
    req.on("end", () => ok(s)); req.on("error", erro);
  });
}
function json(res, cod, dados) { res.writeHead(cod, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(dados)); }
const SEG = { "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
function html(res, cod, s, extra = {}) { res.writeHead(cod, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...SEG, ...extra }); res.end(s); }
const soDigitos = (t) => String(t || "").replace(/\D/g, "");
function codigoNovo() {
  const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return "BFA-" + Array.from({ length: 4 }, () => a[crypto.randomInt(a.length)]).join("");
}
function linha(r) {
  return { codigo: r.codigo, status: r.status, criado: r.criado, atualizado: r.atualizado, nome: r.nome, tel: r.tel, fase: r.fase, itens: r.itens, total: r.total, link: r.link, pagoEm: r.pago_em, entregueEm: r.entregue_em, obs: r.obs, recibo: r.recibo || "", metodo: r.metodo || "", pagoValor: r.pago_valor, liquido: r.liquido_real == null ? null : Number(r.liquido_real) };
}

// ------------------------------------------------------------------ dados --
async function salvarPedido(p) {
  zerarVagas();
  const codigo = String(p.codigo || codigoNovo()).toUpperCase().slice(0, 20);
  const status = STATUS.includes(p.status) ? p.status : "aguardando";
  const itens = Array.isArray(p.itens) ? p.itens.slice(0, 50).map((i) => ({ id: String(i.id || ""), nome: String(i.nome || "").slice(0, 120), qtd: Math.max(1, Number(i.qtd) || 1), preco: Number(i.preco) || 0, entregue: !!i.entregue })) : [];
  const r = await pool.query(
    `INSERT INTO pedidos (codigo,status,criado,nome,tel,fase,itens,total,link,pago_em,obs)
     VALUES ($1,$2,COALESCE($3::timestamptz, now()),$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (codigo) DO UPDATE SET status=CASE
         WHEN EXCLUDED.status = 'cancelado' THEN 'cancelado'
         WHEN pedidos.status = 'cancelado' AND EXCLUDED.status <> 'pago' THEN 'cancelado'
         WHEN COALESCE(array_position(ARRAY['aguardando','pago','producao','entregue'], EXCLUDED.status), 0)
            >= COALESCE(array_position(ARRAY['aguardando','pago','producao','entregue'], pedidos.status), 0) THEN EXCLUDED.status
         ELSE pedidos.status END, nome=EXCLUDED.nome, tel=EXCLUDED.tel, fase=EXCLUDED.fase,
       itens=CASE WHEN jsonb_array_length(EXCLUDED.itens)>0 THEN EXCLUDED.itens ELSE pedidos.itens END, total=EXCLUDED.total,
       link=COALESCE(NULLIF(EXCLUDED.link,''), pedidos.link), pago_em=COALESCE(EXCLUDED.pago_em, pedidos.pago_em),
       obs=CASE WHEN EXCLUDED.obs<>'' THEN EXCLUDED.obs ELSE pedidos.obs END, atualizado=now()
     RETURNING *`,
    [codigo, status, p.criado || null, String(p.nome || "").slice(0, 120), soDigitos(p.tel).slice(0, 20), String(p.fase || "").slice(0, 60), JSON.stringify(itens), Math.round(Number(p.total) || 0), String(p.link || "").slice(0, 2000), p.pagoEm || (status === "pago" ? new Date().toISOString() : null), String(p.obs || "").slice(0, 4000)],
  );
  return linha(r.rows[0]);
}
async function atualizar(codigo, mud) {
  zerarVagas();
  const atual = (await pool.query("SELECT * FROM pedidos WHERE codigo=$1", [codigo])).rows[0];
  if (!atual) return null;
  const sets = [], vals = [];
  const por = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
  const agora = new Date().toISOString();
  if (mud.status && STATUS.includes(mud.status)) {
    por("status", mud.status);
    if (mud.pagoEm === undefined) {
      if (PAGOS.includes(mud.status) && !atual.pago_em) por("pago_em", agora);
      if (mud.status === "aguardando" && atual.pago_em) por("pago_em", null);
    }
    if (mud.status === "entregue") {
      if (!atual.entregue_em) por("entregue_em", agora);
      if (!Array.isArray(mud.entregues)) por("itens", JSON.stringify(atual.itens.map((i) => ({ ...i, entregue: true }))));
    } else if (atual.entregue_em) por("entregue_em", null);
  }
  if (mud.pagoEm !== undefined) {
    const d = mud.pagoEm ? new Date(mud.pagoEm) : null;
    if (!d || !Number.isNaN(d.getTime())) por("pago_em", d ? d.toISOString() : null);
  }
  if (typeof mud.metodo === "string") por("metodo", mud.metodo.slice(0, 40));
  if (typeof mud.obs === "string") por("obs", mud.obs.slice(0, 4000));
  if (mud.liquido === null || Number.isFinite(Number(mud.liquido)) && mud.liquido !== undefined && mud.liquido !== "") por("liquido_real", mud.liquido === null ? null : Math.round(Number(mud.liquido) * 100) / 100);
  if (typeof mud.nome === "string") por("nome", mud.nome.slice(0, 120));
  if (typeof mud.tel === "string") por("tel", soDigitos(mud.tel).slice(0, 20));
  if (typeof mud.link === "string") por("link", mud.link.slice(0, 2000));
  if (Array.isArray(mud.entregues)) {
    const itens = atual.itens.map((i, k) => ({ ...i, entregue: !!mud.entregues[k] }));
    por("itens", JSON.stringify(itens));
  }
  if (!sets.length) return linha(atual);
  vals.push(codigo);
  const r = await pool.query(`UPDATE pedidos SET ${sets.join(",")}, atualizado=now() WHERE codigo=$${vals.length} RETURNING *`, vals);
  return linha(r.rows[0]);
}

// ----------------------------------------------------------------- páginas --
// Visual e comportamento ficam em ui/app.css e ui/app.js; aqui só o esqueleto.
const FONTES = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400..700&family=JetBrains+Mono:wght@500;600&display=swap">`;
function cabeca(base, titulo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><meta name="theme-color" content="#0B0908"><title>${titulo}</title><link rel="icon" type="image/svg+xml" href="${base}/favicon.svg">${FONTES}<style>${UI.css}</style></head>`;
}
const MARCA = () => `<div class="marca">${UI.ico.replace("<svg ", '<svg aria-hidden="true" ')}<div><span class="marca__crm">CRM de pedidos</span><span class="marca__bf">Black Friday Apocalíptica</span></div></div>`;

function paginaLogin(base, erro = "") {
  return `${cabeca(base, "Entrar · CRM BFA")}<body class="entrada"><form class="entrada__form" method="post" action="${base}/entrar">${MARCA()}
${erro ? `<p class="entrada__erro" role="alert">${esc(erro)}</p>` : ""}
<label class="campo">Usuário<input name="usuario" autocomplete="username" required autofocus></label>
<label class="campo">Senha<input name="senha" type="password" autocomplete="current-password" required></label>
<button class="btn btn--brasa btn--cheio" type="submit">Entrar</button></form></body></html>`;
}

const DIAS_CAMPANHA = [["d16", "16", "seg"], ["d17", "17", "ter"], ["d18", "18", "qua"], ["d19", "19", "qui"]];
function paginaApp(base) {
  return `${cabeca(base, "CRM BFA")}<body data-base="${esc(base)}">
<header class="topo">${MARCA()}
  <nav class="dias" aria-label="Dia da campanha"><button type="button" data-dia="tudo" aria-pressed="true"><b>Tudo</b><small>—</small></button>${DIAS_CAMPANHA.map(([id, d, s]) => `<button type="button" data-dia="${id}" aria-pressed="false"><b>${d}<span>${s}</span></b><small>—</small></button>`).join("")}</nav>
  <div class="topo__acoes"><span class="vivo" id="vivo" title="Atualiza sozinho a cada 20 segundos"><i></i><span>conectando…</span></span>
    <button class="btn btn--fantasma btn--liga" id="fogos" type="button" aria-pressed="false" title="Fogos de artifício"><span aria-hidden="true">🎆</span><span class="rot">Fogos</span></button>
    <button class="btn btn--fantasma btn--liga" id="musica" type="button" aria-pressed="false" title="Música épica"><span aria-hidden="true">🎵</span><span class="rot">Música</span></button>
    <a class="btn btn--fantasma" href="${base}/precos" title="Preços de cada oferta por dia">Preços</a>
    <button class="btn btn--brasa" id="novo" type="button">+ Pedido</button>
    <form method="post" action="${base}/sair"><button class="btn btn--fantasma" type="submit">Sair</button></form></div>
</header>
<main class="painel">
  <div class="secao-tit ord-din"><h2>Dinheiro</h2></div>
  <section class="dinheiro" aria-label="Dinheiro">
    <article class="cartao heroi" style="--i:0">
      <p class="rotulo"><i class="chave chave--pago"></i>Entrou · líquido</p>
      <p class="heroi__valor" id="k-liq">R$ 0</p>
      <p class="heroi__sub" id="k-liq-sub"></p>
      <div class="heroi__rodape"><div class="seg" id="k-seg" role="img" aria-label=""></div><ul class="leg" id="k-seg-leg"></ul></div>
    </article>
    <article class="cartao kpi" style="--i:1"><p class="rotulo"><i class="chave chave--pago"></i>Faturamento</p><p class="kpi__valor" id="k-fat">R$ 0</p><p class="kpi__sub" id="k-fat-sub"></p></article>
    <article class="cartao kpi" style="--i:2"><p class="rotulo"><i class="chave chave--entrar"></i>Falta entrar</p><p class="kpi__valor" id="k-ent">R$ 0</p><p class="kpi__sub" id="k-ent-sub"></p><button class="kpi__acao" id="ir-aguardando" type="button" hidden>Ver quem falta pagar →</button></article>
    <article class="cartao kpi kpi--pos" style="--i:3"><p class="rotulo"><i class="chave chave--total"></i>Total possível</p><p class="kpi__valor" id="k-pos">R$ 0</p><p class="kpi__sub" id="k-pos-sub"></p></article>
    <article class="cartao faixa-num" style="--i:4"><dl>
      <div><dt>Conversão</dt><dd id="k-conv">0%</dd><small id="k-conv-sub"></small></div>
      <div><dt>A entregar</dt><dd id="k-fazer">0</dd><small id="k-fazer-sub"></small></div>
      <div><dt>Taxa do cartão</dt><dd id="k-taxa">R$ 0</dd><small id="k-taxa-sub"></small></div>
      <div><dt>Cancelados</dt><dd id="k-canc">R$ 0</dd><small id="k-canc-sub"></small></div></dl></article>
  </section>
  <section class="graficos" aria-label="Gráficos">
    <article class="cartao graf" style="--i:5">
      <header class="graf__cab"><h3>Pedido × pago ao longo do tempo</h3><p>Valor dos pedidos, em R$. A faixa azul entre as linhas é o que ainda falta entrar.</p></header>
      <ul class="leg"><li><i class="ln ln--pago"></i>Pago</li><li><i class="faixa"></i>A entrar</li><li><i class="ln ln--entrar"></i>Total pedido</li></ul>
      <div class="graf__area" id="g-tempo"></div>
      <details class="tabela"><summary>Ver em tabela</summary><div id="t-tempo"></div></details>
    </article>
    <article class="cartao graf" style="--i:6">
      <header class="graf__cab"><h3>Receita por oferta</h3><p>Pago e aguardando, por produto.</p></header>
      <ul class="leg"><li><i class="sw sw--pago"></i>Pago</li><li><i class="sw sw--entrar"></i>A entrar</li></ul>
      <ul class="ofertas" id="g-ofertas"></ul>
      <details class="tabela"><summary>Ver em tabela</summary><div id="t-ofertas"></div></details>
    </article>
  </section>
  <div class="secao-tit ord-ped"><h2>Pedidos</h2></div>
  <section class="quadro" aria-label="Pedidos">
    <div class="quadro__barra">
      <label class="busca"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><span class="sr">Buscar</span><input id="busca" type="search" placeholder="Buscar nome, telefone, código ou produto" autocomplete="off"></label>
      <span class="quadro__info" id="n-busca" aria-live="polite"></span>
      <span class="dica-arrastar">Arraste os cartões entre as colunas</span>
      <label class="troca"><input type="checkbox" id="ver-canc">Mostrar cancelados</label>
    </div>
    <div class="colunas" id="colunas"></div>
  </section>
</main>
<dialog class="gaveta" id="gaveta" aria-labelledby="gv-nome"><div id="gaveta-conteudo"></div></dialog>
<dialog class="modal" id="dlg-novo" aria-labelledby="novo-tit"><form id="form-novo">
  <h2 id="novo-tit">Novo pedido</h2>
  <label class="campo">Nome<input name="nome" required autocomplete="off"></label>
  <label class="campo">WhatsApp <small>com DDD; de fora do Brasil, com o código do país</small><input name="tel" inputmode="tel" required autocomplete="off"></label>
  <label class="campo">Itens <small>um por linha, ex.: 2x Consulta Horária</small><textarea name="itens" required></textarea></label>
  <div class="duas"><label class="campo">Total (R$)<input name="total" inputmode="decimal" required></label>
  <label class="campo">Situação<select name="status"><option value="aguardando">Aguardando pagamento</option><option value="pago">Pago</option></select></label></div>
  <label class="campo">Link de pagamento <small>opcional</small><input name="link" autocomplete="off"></label>
  <div class="modal__acoes"><button class="btn btn--fantasma" type="button" id="cancelar-novo">Cancelar</button><button class="btn btn--brasa" type="submit">Salvar pedido</button></div>
</form></dialog>
<div class="avisos" id="avisos"></div>
<script>${UI.js}</script></body></html>`;
}

// tela Preços: o catálogo (nomes, seções, ordem, preço cheio) vem do próprio ofertas.json da página;
// os valores salvos aqui valem por cima dele. Comportamento em ui/precos.js.
function paginaPrecos(base) {
  return `${cabeca(base, "Preços · CRM BFA")}<body class="pg-precos" data-base="${esc(base)}" data-catalogo="${esc(CATALOGO)}">
<header class="topo">${MARCA()}
  <div class="topo__acoes topo__acoes--fim"><a class="btn btn--fantasma" href="${base}/">← Pedidos</a>
    <a class="btn btn--fantasma" href="/bfa" target="_blank" rel="noopener">Ver a página</a>
    <form method="post" action="${base}/sair"><button class="btn btn--fantasma" type="submit">Sair</button></form></div>
</header>
<main class="painel precos">
  <div class="precos__cab"><div><h1>Preços por dia</h1>
    <p>Mude o valor e clique em <b>Salvar preços</b>. A página de ofertas troca sozinha, sem deploy: quem abrir já vê o preço novo, e quem já está nela vê em até 1 minuto. O link de pagamento também sai com o preço novo.</p></div>
    <p class="precos__info" id="pr-info"></p></div>
  <div id="pr-tabela"><p class="precos__carregando">Carregando ofertas…</p></div>
</main>
<div class="precos__barra" id="pr-barra" hidden><span id="pr-n"></span><button class="btn btn--fantasma" type="button" id="pr-desfazer">Desfazer</button><button class="btn btn--brasa" type="button" id="pr-salvar">Salvar preços</button></div>
<dialog class="modal" id="pr-conf" aria-labelledby="pr-conf-tit"><form method="dialog">
  <h2 id="pr-conf-tit">Confirmar preços</h2><ul class="precos__lista" id="pr-lista"></ul>
  <div class="modal__acoes"><button class="btn btn--fantasma" value="nao">Voltar</button><button class="btn btn--brasa" value="sim">Salvar e publicar</button></div>
</form></dialog>
<div class="avisos" id="avisos"></div>
<script>${UI.precos}</script></body></html>`;
}

// ---------------------------------------------------------------- rotas --
http.createServer(async (req, res) => {
  const base = prefixo(req);
  const url = new URL(req.url, "http://x");
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  try {
    if (url.pathname === "/healthz") return json(res, 200, { ok: true });
    if (url.pathname === "/api/vagas" && (req.method === "GET" || req.method === "HEAD")) return json(res, 200, await vendidos());
    if (url.pathname === "/api/precos" && (req.method === "GET" || req.method === "HEAD")) return json(res, 200, await precos());
    if (url.pathname === "/favicon.svg" || url.pathname === "/favicon.ico") { res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400", ...SEG }); return res.end(UI.ico); }
    // link curto de pagamento: yuridosanjos.com.br/pg/42SY -> link da InfinitePay do pedido BFA-42SY
    const curto = base === "/pg" ? /^\/([A-Za-z0-9]{3,8})\/?$/.exec(url.pathname) : /^\/p\/([A-Za-z0-9]{3,8})\/?$/.exec(url.pathname);
    if (curto && (req.method === "GET" || req.method === "HEAD")) {
      if (bloqueado("pg:" + ip)) return html(res, 429, "<p>Espere alguns minutos.</p>");
      const r = await pool.query("SELECT link, status FROM pedidos WHERE codigo=$1", ["BFA-" + curto[1].toUpperCase()]);
      const p = r.rows[0];
      if (p && p.link && p.status !== "cancelado") { res.writeHead(302, { Location: p.link, "Cache-Control": "no-store", ...SEG }); return res.end(); }
      (tentativas.get("pg:" + ip) || tentativas.set("pg:" + ip, []).get("pg:" + ip)).push(Date.now());
      return html(res, 404, '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link de pagamento</title><body style="font-family:system-ui;background:#0E0B09;color:#F4EFE7;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:1rem"><p>Este link de pagamento não existe ou expirou.<br>Fale com o atendimento pelo WhatsApp.</p></body>');
    }
    if (base === "/pg") { res.writeHead(302, { Location: "/bfa" }); return res.end(); }
    // aviso da InfinitePay quando o pagamento muda (só vale com a chave na URL e conferido no payment_check)
    if (url.pathname === "/api/infinitepay" && req.method === "POST") {
      if (!WEBHOOK_K || !igual(url.searchParams.get("k") || "", WEBHOOK_K)) return json(res, 400, { erro: "chave" });
      let d = {};
      try { d = JSON.parse(await corpo(req, 100e3)); } catch { return json(res, 400, { erro: "json" }); }
      const r = await registrarPagamento({ order_nsu: d.order_nsu, transaction_nsu: d.transaction_nsu, slug: d.invoice_slug || d.slug, receipt_url: d.receipt_url }, "webhook");
      return json(res, 200, { ok: true, pago: r.ok });
    }
    // volta do cliente depois de pagar: confere e mostra a confirmação
    if (url.pathname === "/pago" && (req.method === "GET" || req.method === "HEAD")) {
      const q = Object.fromEntries(url.searchParams);
      let r = { ok: false };
      try { r = await registrarPagamento({ order_nsu: q.order_nsu, transaction_nsu: q.transaction_nsu, slug: q.slug, receipt_url: q.receipt_url }, "redirect"); } catch (e) { console.error(e); }
      const msg = r.ok
        ? `<h1 style="font-size:1.6rem;margin:0 0 .6rem">Pagamento confirmado! 🔥</h1><p>Pedido <b>${esc(r.codigo)}</b>. O atendimento do Yuri vai falar com você pelo WhatsApp para os próximos passos.</p>`
        : `<h1 style="font-size:1.4rem;margin:0 0 .6rem">Recebemos o seu retorno</h1><p>Se o pagamento foi concluído, o atendimento confirma pelo WhatsApp.</p>`;
      return html(res, 200, `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Pagamento · Black Friday Apocalíptica</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0E0B09;color:#F4EFE7;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:1.2rem"><main style="max-width:420px"><p style="color:#FF8A3D;font:700 12px ui-monospace,monospace;letter-spacing:.14em">BLACK FRIDAY APOCALÍPTICA</p>${msg}${q.receipt_url && /^https:\/\//.test(q.receipt_url) ? `<p><a href="${esc(q.receipt_url)}" style="color:#F6E3B4">Ver comprovante</a></p>` : ""}</main></body></html>`);
    }
    if (url.pathname === "/entrar" && req.method === "POST") {
      if (bloqueado(ip)) return html(res, 429, paginaLogin(base, "Muitas tentativas. Espere 10 minutos."));
      const f = new URLSearchParams(await corpo(req, 4000));
      if (igual(f.get("usuario") || "", CRM_USUARIO) && igual(f.get("senha") || "", CRM_SENHA)) {
        const exp = String(Date.now() + DIAS * 864e5);
        res.writeHead(303, { Location: base + "/", "Set-Cookie": `crm=${encodeURIComponent(exp + "." + assinar(exp))}; Path=${base || "/"}; HttpOnly; Secure; SameSite=Lax; Max-Age=${DIAS * 86400}`, ...SEG });
        return res.end();
      }
      tentativas.get(ip).push(Date.now());
      return html(res, 401, paginaLogin(base, "Usuário ou senha errados."));
    }
    if (url.pathname === "/sair" && req.method === "POST") {
      res.writeHead(303, { Location: base + "/", "Set-Cookie": `crm=; Path=${base || "/"}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`, ...SEG });
      return res.end();
    }
    const logado = sessaoValida(req);
    if (url.pathname.startsWith("/api/")) {
      if (!logado && !chaveValida(req)) return json(res, 401, { erro: "login" });
      if (url.pathname === "/api/pedidos" && req.method === "GET") {
        const r = await pool.query("SELECT * FROM pedidos ORDER BY criado DESC LIMIT 2000");
        return json(res, 200, { pedidos: r.rows.map(linha) });
      }
      if (url.pathname === "/api/pedidos" && req.method === "POST") {
        const p = JSON.parse(await corpo(req));
        const lista = Array.isArray(p.pedidos) ? p.pedidos : [p];
        const salvos = [];
        for (const x of lista) salvos.push(await salvarPedido(x));
        return json(res, 200, { pedidos: salvos });
      }
      // congelar vagas mostradas na página (só com login ou chave)
      if (url.pathname === "/api/congelar" && req.method === "GET") return json(res, 200, { congelar: await congelado(), reais: await vendidosReais() });
      if (url.pathname === "/api/congelar" && req.method === "PUT") {
        const c = JSON.parse(await corpo(req, 4000));
        const limpo = Object.fromEntries(Object.entries(c && typeof c === "object" ? c : {}).filter(([k, v]) => /^[a-z0-9-]{1,40}$/.test(k) && Number.isFinite(Number(v))).map(([k, v]) => [k, Math.max(0, Math.round(Number(v)))]));
        await pool.query("INSERT INTO ajustes (chave, valor) VALUES ('congelar', $1) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado = now()", [JSON.stringify(limpo)]);
        zerarVagas();
        return json(res, 200, { congelar: limpo });
      }
      // preços por dia (tela Preços): substitui o objeto inteiro; valor errado devolve 400 e nada muda
      if (url.pathname === "/api/precos" && req.method === "PUT") {
        let c;
        try { c = JSON.parse(await corpo(req, 60e3)); } catch { return json(res, 400, { erro: "json" }); }
        const { limpo, erros } = limparPrecos(c);
        if (erros.length) return json(res, 400, { erro: "valores", campos: erros });
        if (!Object.keys(limpo).length) return json(res, 400, { erro: "vazio" });
        return json(res, 200, await salvarPrecos(limpo));
      }
      if (url.pathname === "/api/precos/historico" && req.method === "GET") {
        const h = (await pool.query("SELECT valor FROM ajustes WHERE chave = 'precos-historico'")).rows[0]?.valor || [];
        return json(res, 200, { historico: h });
      }
      const m = /^\/api\/pedidos\/([A-Za-z0-9-]{1,20})$/.exec(url.pathname);
      if (m && req.method === "PATCH") {
        const p = await atualizar(m[1].toUpperCase(), JSON.parse(await corpo(req)));
        return p ? json(res, 200, p) : json(res, 404, { erro: "não achei" });
      }
      return json(res, 404, { erro: "rota" });
    }
    if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { erro: "método" });
    if (url.pathname === "/precos" || url.pathname === "/precos/") return html(res, 200, logado ? paginaPrecos(base) : paginaLogin(base));
    if (url.pathname !== "/" && url.pathname !== "") { res.writeHead(303, { Location: base + "/" }); return res.end(); }
    return html(res, 200, logado ? paginaApp(base) : paginaLogin(base));
  } catch (e) {
    console.error(e);
    return json(res, 500, { erro: "falha" });
  }
}).listen(PORT, () => console.log(`CRM na porta ${PORT}`));
