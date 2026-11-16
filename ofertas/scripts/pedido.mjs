// =============================================================================
//  Pedidos da /bfa: link de checkout InfinitePay + controle de vendas e vagas.
//
//    node scripts/pedido.mjs novo --nome "Maria" --tel 5562999999999 --itens bussola,raio-x:2 [--quando 2026-11-16T23:58]
//    node scripts/pedido.mjs pago BFA-7K2Q        -> marca pago e baixa as vagas em dados/ofertas.json
//    node scripts/pedido.mjs cancelar BFA-7K2Q    -> cancela (não mexe nas vagas)
//    node scripts/pedido.mjs lista                -> pedidos e vagas restantes
//
//  O preço é o da fase do horário em que a pessoa chamou no WhatsApp (--quando;
//  padrão: agora). O controle de pedidos tem nome e telefone de clientes, então
//  fica FORA do repositório público, em CRM_DIR (padrão abaixo).
//  Depois de "pago": rodar `npm run gerar`, commit, push e redeploy para a
//  página mostrar as vagas novas.
// =============================================================================
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const RAIZ = fileURLToPath(new URL("../", import.meta.url));
const DADOS = join(RAIZ, "dados", "ofertas.json");
const CRM_DIR = process.env.CRM_DIR || "C:/Users/PICHAU/Documents/ChatGPT/YURI ASTROLOGIA/BLACK-FRIDAY-2026/crm-bfa";
const CRM = join(CRM_DIR, "pedidos.json");
const CSV = join(CRM_DIR, "pedidos.csv");

const [cmd, ...resto] = process.argv.slice(2);
const args = {};
for (let k = 0; k < resto.length; k++) {
  if (resto[k].startsWith("--")) { args[resto[k].slice(2)] = resto[k + 1]; k++; }
  else (args._ ||= []).push(resto[k]);
}

const D = JSON.parse(await readFile(DADOS, "utf8"));
await mkdir(CRM_DIR, { recursive: true });
const crm = existsSync(CRM) ? JSON.parse(await readFile(CRM, "utf8")) : { pedidos: [] };
const brl = (n) => "R$ " + n.toLocaleString("pt-BR");

function fase(t) {
  for (const f of D.fases) if (t >= Date.parse(f.inicio) && t < Date.parse(f.fim)) return f;
  if (t < Date.parse(D.fases[0].inicio)) return D.fases[0];
  return null;
}
function vendidos(id) {
  return crm.pedidos.filter((p) => p.status === "pago").reduce((s, p) => s + (p.itens.find((i) => i.id === id)?.qtd || 0), 0);
}
async function salvar() {
  await writeFile(CRM, JSON.stringify(crm, null, 2));
  const linhas = [["codigo", "status", "criado", "nome", "telefone", "fase", "itens", "total", "link", "pago_em"].join(";")];
  for (const p of crm.pedidos) {
    linhas.push([p.codigo, p.status, p.criado, p.nome, p.tel, p.fase, p.itens.map((i) => `${i.qtd}x ${i.nome}`).join(" + "), p.total, p.link || "", p.pagoEm || ""]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"));
  }
  await writeFile(CSV, "\ufeff" + linhas.join("\n"));
}
// manda o pedido para o CRM on-line (yuridosanjos.com.br/bfa-crm); CRM_URL e CRM_CHAVE vêm de ofertas/.env
async function enviarCrm(p) {
  const url = process.env.CRM_URL, chave = process.env.CRM_CHAVE;
  if (!url || !chave) return console.log("  (CRM: sem CRM_URL/CRM_CHAVE; carregue ofertas/.env)");
  try {
    const r = await fetch(url + "/api/pedidos", { method: "POST", headers: { "Content-Type": "application/json", "x-chave": chave }, body: JSON.stringify({ codigo: p.codigo, status: p.status, criado: p.chamouEm || p.criado, nome: p.nome, tel: p.tel, fase: p.fase, itens: p.itens, total: p.total, link: p.link || "", pagoEm: p.pagoEm }) });
    console.log(r.ok ? `  CRM: ${p.codigo} atualizado` : `  CRM: falhou (${r.status})`);
  } catch (e) { console.log("  CRM: fora do ar (" + e.message + ")"); }
}
const linkCurto = (p) => "https://yuridosanjos.com.br/pg/" + p.codigo.replace(/^BFA-/, "");

// cria o link na InfinitePay com aviso de pagamento (webhook) e volta do cliente para o CRM,
// que confere no payment_check e marca "pago" sozinho
async function criarLink(p) {
  const corpo = {
    handle: D.infinitepay,
    order_nsu: p.codigo,
    items: p.itens.map((i) => ({ quantity: i.qtd, price: i.preco * 100, description: `${i.nome} · Black Friday Apocalíptica` })),
  };
  if (process.env.CRM_URL && process.env.CRM_WEBHOOK_K) {
    corpo.webhook_url = `${process.env.CRM_URL}/api/infinitepay?k=${encodeURIComponent(process.env.CRM_WEBHOOK_K)}`;
    corpo.redirect_url = `${process.env.CRM_URL}/pago`;
  }
  // telefone só se for do Brasil: número estrangeiro preenchido quebra o checkout da InfinitePay
  const telBr = String(p.tel || "").replace(/\D/g, "");
  if (p.nome || p.tel) corpo.customer = { name: p.nome, ...(/^55\d{10,11}$/.test(telBr) ? { phone_number: "+" + telBr } : {}) };
  const r = await fetch("https://api.checkout.infinitepay.io/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const txt = await r.text();
  let json = null; try { json = JSON.parse(txt); } catch {}
  const acharUrl = (o) => { if (!o || typeof o !== "object") return null; for (const v of Object.values(o)) { if (typeof v === "string" && /^https:\/\//.test(v)) return v; const n = acharUrl(v); if (n) return n; } return null; };
  const link = acharUrl(json);
  if (!r.ok || !link) { console.error(`InfinitePay respondeu ${r.status}:`, txt.slice(0, 500)); process.exitCode = 1; return false; }
  p.link = link; p.respostaInfinitePay = json; p.comAviso = !!corpo.webhook_url;
  return true;
}

function codigo() {
  const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s; do { s = "BFA-" + Array.from({ length: 4 }, () => a[Math.floor(Math.random() * a.length)]).join(""); } while (crm.pedidos.some((p) => p.codigo === s));
  return s;
}

if (cmd === "novo") {
  if (!args.nome || !args.itens) throw new Error('uso: novo --nome "Nome" --tel 55DDDNUMERO --itens id,id:2');
  const quando = args.quando ? Date.parse(args.quando.length <= 16 ? args.quando + ":00-03:00" : args.quando) : Date.now();
  const f = fase(quando);
  if (!f) throw new Error("Horário fora da campanha.");
  const itens = args.itens.split(",").map((x) => {
    const [id, q] = x.trim().split(":");
    const i = D.itens.find((o) => o.id === id);
    if (!i) throw new Error(`Oferta desconhecida: ${id}. Use: ${D.itens.map((o) => o.id).join(", ")}`);
    const preco = i.precos[f.id];
    if (preco == null) throw new Error(`${i.nome} sem preço em ${f.rotulo}.`);
    const qtd = Number(q || 1);
    if (i.vagas != null && i.vagas - 0 < qtd) throw new Error(`${i.nome}: só restam ${i.vagas} vagas na página.`);
    return { id, nome: i.nome + (i.subnome ? ` (${i.subnome})` : ""), qtd, preco };
  });
  const total = itens.reduce((s, i) => s + i.preco * i.qtd, 0);
  const p = { codigo: args.codigo || codigo(), status: "aguardando", criado: new Date().toISOString(), chamouEm: new Date(quando).toISOString(), nome: args.nome, tel: args.tel || "", fase: f.id, itens, total };
  await criarLink(p);
  crm.pedidos.push(p);
  await salvar();
  console.log(`\n${p.codigo} · ${p.nome} · ${f.rotulo}`);
  for (const i of itens) console.log(`  ${i.qtd}× ${i.nome} — ${brl(i.preco)}${i.qtd > 1 ? ` cada (${brl(i.preco * i.qtd)})` : ""}`);
  console.log(`  Total: ${brl(total)}\n  Link curto: ${linkCurto(p)}\n  Link InfinitePay: ${p.link || "(falhou)"}\n`);
  await enviarCrm(p);
} else if (cmd === "pago" || cmd === "cancelar") {
  const p = crm.pedidos.find((x) => x.codigo === args._?.[0]);
  if (!p) throw new Error("Pedido não encontrado.");
  if (cmd === "pago") {
    if (p.status === "pago") throw new Error("Já está pago.");
    p.status = "pago"; p.pagoEm = new Date().toISOString();
    for (const i of p.itens) {
      const o = D.itens.find((x) => x.id === i.id);
      if (o && o.vagas != null) { o.vagas = Math.max(0, o.vagas - i.qtd); if (o.vagas === 0) o.esgotado = true; }
    }
    D.atualizado = new Date().toISOString();
    await writeFile(DADOS, JSON.stringify(D, null, 2) + "\n");
    console.log(`${p.codigo} pago. Vagas atualizadas em dados/ofertas.json — falta gerar, commit, push e redeploy.`);
  } else { p.status = "cancelado"; console.log(`${p.codigo} cancelado.`); }
  await salvar();
  await enviarCrm(p);
} else if (cmd === "refazer-links") {
  // troca o link da InfinitePay por um com aviso de pagamento; o link curto (/pg) continua o mesmo
  for (const p of crm.pedidos.filter((x) => x.status === "aguardando" && (!args._?.length || args._.includes(x.codigo)))) {
    if (await criarLink(p)) { console.log(`${p.codigo} · link novo com aviso`); await enviarCrm(p); }
  }
  await salvar();
} else if (cmd === "sincronizar") {
  for (const p of crm.pedidos) await enviarCrm(p);
} else if (cmd === "link") {
  const p = crm.pedidos.find((x) => x.codigo === args._?.[0]);
  console.log(p ? linkCurto(p) : "Pedido não encontrado.");
} else if (cmd === "lista") {
  for (const p of crm.pedidos) console.log(`${p.codigo}  ${p.status.padEnd(10)} ${p.nome.padEnd(22)} ${brl(p.total).padStart(10)}  ${p.itens.map((i) => `${i.qtd}× ${i.nome}`).join(" + ")}`);
  console.log("\nVagas na página:");
  for (const o of D.itens) if (o.vagas != null) console.log(`  ${o.nome.padEnd(28)} ${o.vagas}/${o.vagasIniciais}${o.esgotado ? " ESGOTADO" : ""} (pagos no controle: ${vendidos(o.id)})`);
} else {
  console.log("Comandos: novo | pago CODIGO | cancelar CODIGO | lista");
}
