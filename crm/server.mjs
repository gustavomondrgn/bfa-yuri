// =============================================================================
//  CRM da Black Friday Apocalíptica: pedidos, pagamento e entrega.
//  Roda em https://yuridosanjos.com.br/bfa-crm (Coolify, prefixo removido pelo Traefik).
//  Dados no Postgres (Neon); nada de cliente fica no repositório.
//  Variáveis: DATABASE_URL, CRM_USUARIO, CRM_SENHA, CRM_SEGREDO, CRM_CHAVE_API, PORT.
// =============================================================================
import http from "node:http";
import crypto from "node:crypto";
import pg from "pg";

const { DATABASE_URL, CRM_USUARIO = "", CRM_SENHA = "", CRM_SEGREDO = "", CRM_CHAVE_API = "" } = process.env;
const PORT = Number(process.env.PORT) || 3000;
if (!DATABASE_URL || !CRM_USUARIO || !CRM_SENHA || !CRM_SEGREDO) { console.error("faltam variáveis de ambiente"); process.exit(1); }

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4, ssl: { rejectUnauthorized: true } });
await pool.query(`CREATE TABLE IF NOT EXISTS pedidos (
  codigo text PRIMARY KEY, status text NOT NULL DEFAULT 'aguardando', criado timestamptz NOT NULL DEFAULT now(),
  atualizado timestamptz NOT NULL DEFAULT now(), nome text NOT NULL DEFAULT '', tel text NOT NULL DEFAULT '',
  fase text NOT NULL DEFAULT '', itens jsonb NOT NULL DEFAULT '[]'::jsonb, total integer NOT NULL DEFAULT 0,
  link text NOT NULL DEFAULT '', pago_em timestamptz, entregue_em timestamptz, obs text NOT NULL DEFAULT '')`);

const STATUS = ["aguardando", "pago", "entregue", "cancelado"];
const DIAS = 30;

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
  return { codigo: r.codigo, status: r.status, criado: r.criado, atualizado: r.atualizado, nome: r.nome, tel: r.tel, fase: r.fase, itens: r.itens, total: r.total, link: r.link, pagoEm: r.pago_em, entregueEm: r.entregue_em, obs: r.obs };
}

// ------------------------------------------------------------------ dados --
async function salvarPedido(p) {
  const codigo = String(p.codigo || codigoNovo()).toUpperCase().slice(0, 20);
  const status = STATUS.includes(p.status) ? p.status : "aguardando";
  const itens = Array.isArray(p.itens) ? p.itens.slice(0, 50).map((i) => ({ id: String(i.id || ""), nome: String(i.nome || "").slice(0, 120), qtd: Math.max(1, Number(i.qtd) || 1), preco: Number(i.preco) || 0, entregue: !!i.entregue })) : [];
  const r = await pool.query(
    `INSERT INTO pedidos (codigo,status,criado,nome,tel,fase,itens,total,link,pago_em,obs)
     VALUES ($1,$2,COALESCE($3::timestamptz, now()),$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (codigo) DO UPDATE SET status=EXCLUDED.status, nome=EXCLUDED.nome, tel=EXCLUDED.tel, fase=EXCLUDED.fase,
       itens=CASE WHEN jsonb_array_length(EXCLUDED.itens)>0 THEN EXCLUDED.itens ELSE pedidos.itens END, total=EXCLUDED.total,
       link=COALESCE(NULLIF(EXCLUDED.link,''), pedidos.link), pago_em=COALESCE(EXCLUDED.pago_em, pedidos.pago_em),
       obs=CASE WHEN EXCLUDED.obs<>'' THEN EXCLUDED.obs ELSE pedidos.obs END, atualizado=now()
     RETURNING *`,
    [codigo, status, p.criado || null, String(p.nome || "").slice(0, 120), soDigitos(p.tel).slice(0, 20), String(p.fase || "").slice(0, 60), JSON.stringify(itens), Math.round(Number(p.total) || 0), String(p.link || "").slice(0, 500), p.pagoEm || (status === "pago" ? new Date().toISOString() : null), String(p.obs || "").slice(0, 4000)],
  );
  return linha(r.rows[0]);
}
async function atualizar(codigo, mud) {
  const atual = (await pool.query("SELECT * FROM pedidos WHERE codigo=$1", [codigo])).rows[0];
  if (!atual) return null;
  const sets = [], vals = [];
  const por = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
  if (mud.status && STATUS.includes(mud.status)) {
    por("status", mud.status);
    if (mud.status === "pago" && !atual.pago_em) por("pago_em", new Date().toISOString());
    if (mud.status === "entregue") por("entregue_em", new Date().toISOString());
    if (mud.status !== "entregue" && atual.entregue_em) por("entregue_em", null);
  }
  if (typeof mud.obs === "string") por("obs", mud.obs.slice(0, 4000));
  if (typeof mud.nome === "string") por("nome", mud.nome.slice(0, 120));
  if (typeof mud.tel === "string") por("tel", soDigitos(mud.tel).slice(0, 20));
  if (typeof mud.link === "string") por("link", mud.link.slice(0, 500));
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
const CSS = `:root{--f:#0E0B09;--c:#17130F;--c2:#201A15;--l:#33291F;--t:#F4EFE7;--t2:#CFC6BA;--t3:#9A8F82;--creme:#F6E3B4;--brasa:#FF8A3D;--verm:#C8140C;--verde:#25D366}
*{box-sizing:border-box}body{margin:0;background:var(--f);color:var(--t);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}button,input,select,textarea{font:inherit;color:inherit}
.marca{font-weight:900;letter-spacing:-.02em}.marca small{display:block;color:var(--brasa);font:600 11px/1.2 ui-monospace,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase}
.btn{appearance:none;border:0;border-radius:10px;min-height:44px;padding:.55rem 1rem;font-weight:800;cursor:pointer;background:var(--creme);color:#17130F;display:inline-flex;align-items:center;justify-content:center;gap:.4rem;text-decoration:none}
.btn--sec{background:var(--c2);color:var(--t);border:1px solid var(--l)}.btn--zap{background:var(--verde);color:#062b14}.btn--perigo{background:transparent;color:#FF8F86;border:1px solid #5a2320}
input,select,textarea{background:var(--c2);border:1px solid var(--l);border-radius:10px;padding:.6rem .75rem;width:100%}
textarea{min-height:64px;resize:vertical}:focus-visible{outline:2px solid var(--creme);outline-offset:2px}`;

function paginaLogin(base, erro = "") {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>CRM · BFA</title><style>${CSS}
main{min-height:100vh;display:grid;place-items:center;padding:1rem}form{width:min(100%,360px);display:grid;gap:.8rem;background:var(--c);border:1px solid var(--l);border-radius:16px;padding:1.4rem}
label{display:grid;gap:.3rem;font-weight:700;font-size:.9rem}.erro{color:#FF8F86;font-weight:700}</style></head><body><main>
<form method="post" action="${base}/entrar"><p class="marca">CRM · Pedidos<small>Black Friday Apocalíptica</small></p>
${erro ? `<p class="erro">${esc(erro)}</p>` : ""}
<label>Usuário<input name="usuario" autocomplete="username" required autofocus></label>
<label>Senha<input name="senha" type="password" autocomplete="current-password" required></label>
<button class="btn" type="submit">Entrar</button></form></main></body></html>`;
}

function paginaApp(base) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>CRM · BFA</title><style>${CSS}
header{position:sticky;top:0;z-index:5;background:rgba(14,11,9,.96);border-bottom:1px solid var(--l);padding:.7rem 1rem}
.topo{max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:.75rem}
.resumo{max-width:1100px;margin:.7rem auto 0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.5rem}
.resumo div{background:var(--c);border:1px solid var(--l);border-radius:12px;padding:.5rem .7rem}.resumo b{display:block;font-size:1.25rem}.resumo span{font-size:.75rem;color:var(--t3)}
.filtros{max-width:1100px;margin:.7rem auto 0;display:flex;gap:.4rem;flex-wrap:wrap;align-items:center}
.filtros button{background:var(--c);border:1px solid var(--l);border-radius:999px;padding:.35rem .8rem;min-height:36px;cursor:pointer;font-weight:700;font-size:.85rem}
.filtros button[aria-pressed=true]{background:var(--creme);color:#17130F;border-color:var(--creme)}.filtros input{flex:1 1 200px;width:auto;min-height:36px;padding:.35rem .8rem}
main{max-width:1100px;margin:0 auto;padding:1rem;display:grid;gap:.8rem;grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}
.ped{background:var(--c);border:1px solid var(--l);border-radius:16px;padding:1rem;display:grid;gap:.6rem;align-content:start}
.ped__cab{display:flex;justify-content:space-between;align-items:center;gap:.5rem}.cod{font:700 .8rem ui-monospace,Consolas,monospace;color:var(--t3)}
.st{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;border-radius:999px;padding:.2rem .6rem}
.st--aguardando{background:#3a2c12;color:#FFD38A}.st--pago{background:#103a22;color:#7CF0A8}.st--entregue{background:#22303a;color:#9CC9FF}.st--cancelado{background:#3a1512;color:#FF8F86}
.nome{font-weight:800;font-size:1.1rem}.tel{color:var(--t2);font-size:.9rem}
ul{margin:0;padding:0;list-style:none;display:grid;gap:.3rem}li{display:flex;gap:.5rem;align-items:center;font-size:.92rem}li input{width:20px;height:20px;flex:none}
.total{display:flex;justify-content:space-between;border-top:1px solid var(--l);padding-top:.5rem;font-weight:800}
.meta{font-size:.78rem;color:var(--t3)}.acoes{display:flex;gap:.4rem;flex-wrap:wrap}.acoes .btn{min-height:40px;padding:.4rem .8rem;font-size:.88rem}
.vazio{grid-column:1/-1;text-align:center;color:var(--t3);padding:3rem 1rem}
dialog{background:var(--c);color:var(--t);border:1px solid var(--l);border-radius:16px;width:min(94vw,440px)}dialog::backdrop{background:rgba(0,0,0,.7)}
dialog form{display:grid;gap:.6rem}dialog label{display:grid;gap:.25rem;font-weight:700;font-size:.88rem}
@media (max-width:560px){.resumo{grid-template-columns:repeat(2,minmax(0,1fr))}main{grid-template-columns:1fr}}</style></head><body>
<header><div class="topo"><p class="marca" style="margin:0">CRM · Pedidos<small>Black Friday Apocalíptica</small></p>
<div style="display:flex;gap:.4rem"><button class="btn btn--sec" id="novo" type="button">+ Pedido</button><form method="post" action="${base}/sair"><button class="btn btn--sec" type="submit">Sair</button></form></div></div>
<div class="resumo"><div><b id="r-ag">0</b><span>aguardando pagamento</span></div><div><b id="r-pg">0</b><span>pagos a entregar</span></div><div><b id="r-en">0</b><span>entregues</span></div><div><b id="r-fat">R$ 0</b><span>faturamento pago</span></div></div>
<div class="filtros" role="group" aria-label="Filtrar pedidos"><button data-f="todos" aria-pressed="true">Todos</button><button data-f="aguardando" aria-pressed="false">Aguardando</button><button data-f="pago" aria-pressed="false">A entregar</button><button data-f="entregue" aria-pressed="false">Entregues</button><button data-f="cancelado" aria-pressed="false">Cancelados</button><input id="busca" type="search" placeholder="Buscar nome, telefone ou código" aria-label="Buscar"></div></header>
<main id="lista" aria-live="polite"></main>
<dialog id="dlg"><form method="dialog" id="form-novo"><p class="marca" style="margin:0">Novo pedido</p>
<label>Nome<input name="nome" required></label><label>WhatsApp (com DDD)<input name="tel" inputmode="tel" required></label>
<label>Itens (um por linha, ex.: 2x Bússola do Destino)<textarea name="itens" required></textarea></label><label>Total (R$)<input name="total" inputmode="numeric" required></label>
<label>Link de pagamento (opcional)<input name="link"></label><label>Status<select name="status"><option value="aguardando">Aguardando pagamento</option><option value="pago">Pago</option></select></label>
<div class="acoes"><button class="btn" value="ok">Salvar</button><button class="btn btn--sec" value="cancelar" formnovalidate>Cancelar</button></div></form></dialog>
<script>
const BASE=${JSON.stringify(base)};let PED=[],FILTRO="todos";
const brl=n=>"R$ "+Number(n||0).toLocaleString("pt-BR");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dt=s=>s?new Date(s).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"";
const ROT={aguardando:"Aguardando pagamento",pago:"Pago · a entregar",entregue:"Entregue",cancelado:"Cancelado"};
async function api(m,u,b){const r=await fetch(BASE+u,{method:m,headers:{"Content-Type":"application/json"},body:b?JSON.stringify(b):undefined});if(r.status===401){location.href=BASE+"/";throw 0}if(!r.ok)throw new Error(await r.text());return r.json()}
async function carregar(){PED=(await api("GET","/api/pedidos")).pedidos;desenhar()}
function zap(p){const t=String(p.tel||"").replace(/\\D/g,"");const n=t.length<=11?"55"+t:t;const msg="Olá, "+(p.nome||"").split(" ")[0]+"! Aqui é do atendimento do Yuri dos Anjos, sobre o seu pedido "+p.codigo+" da Black Friday Apocalíptica.";return "https://wa.me/"+n+"?text="+encodeURIComponent(msg)}
function desenhar(){
 const q=document.getElementById("busca").value.trim().toLowerCase();
 const c={aguardando:0,pago:0,entregue:0};let fat=0;
 PED.forEach(p=>{if(c[p.status]!=null)c[p.status]++;if(p.status==="pago"||p.status==="entregue")fat+=p.total});
 document.getElementById("r-ag").textContent=c.aguardando;document.getElementById("r-pg").textContent=c.pago;document.getElementById("r-en").textContent=c.entregue;document.getElementById("r-fat").textContent=brl(fat);
 const lista=PED.filter(p=>(FILTRO==="todos"||p.status===FILTRO)&&(!q||[p.nome,p.tel,p.codigo].join(" ").toLowerCase().includes(q)));
 const el=document.getElementById("lista");
 if(!lista.length){el.innerHTML='<p class="vazio">Nenhum pedido aqui.</p>';return}
 el.innerHTML=lista.map(p=>'<article class="ped" data-c="'+esc(p.codigo)+'">'+
  '<div class="ped__cab"><span class="cod">'+esc(p.codigo)+' · '+dt(p.criado)+'</span><span class="st st--'+p.status+'">'+ROT[p.status]+'</span></div>'+
  '<div><div class="nome">'+esc(p.nome||"Sem nome")+'</div><div class="tel">'+esc(p.tel)+(p.fase?' · '+esc(p.fase):'')+'</div></div>'+
  (p.tel?'<a class="btn btn--zap" target="_blank" rel="noopener" href="'+zap(p)+'">Abrir WhatsApp</a>':'')+
  '<ul>'+p.itens.map((i,k)=>'<li><input type="checkbox" data-ent="'+k+'" '+(i.entregue?'checked':'')+' aria-label="Entregue: '+esc(i.nome)+'"><span>'+i.qtd+'× '+esc(i.nome)+(i.preco?' · '+brl(i.preco):'')+'</span></li>').join("")+'</ul>'+
  '<div class="total"><span>Total</span><span>'+brl(p.total)+'</span></div>'+
  (p.link?'<div class="acoes"><a class="btn btn--sec" target="_blank" rel="noopener" href="'+esc(p.link)+'">Link de pagamento</a><button class="btn btn--sec" data-copiar="'+esc(p.link)+'">Copiar link</button></div>':'')+
  '<label class="meta">Anotações (pra quem é cada item, datas de nascimento, prazos)<textarea data-obs>'+esc(p.obs)+'</textarea></label>'+
  '<div class="acoes">'+(p.status==="aguardando"?'<button class="btn" data-st="pago">Marcar pago</button>':'')+(p.status==="pago"?'<button class="btn" data-st="entregue">Marcar entregue</button>':'')+(p.status!=="aguardando"&&p.status!=="cancelado"?'<button class="btn btn--sec" data-st="aguardando">Voltar p/ aguardando</button>':'')+(p.status!=="cancelado"?'<button class="btn btn--perigo" data-st="cancelado">Cancelar</button>':'<button class="btn btn--sec" data-st="aguardando">Reabrir</button>')+'</div>'+
  '<p class="meta">'+(p.pagoEm?'Pago em '+dt(p.pagoEm)+'. ':'')+(p.entregueEm?'Entregue em '+dt(p.entregueEm)+'.':'')+'</p></article>').join("");
}
document.addEventListener("click",async e=>{
 const f=e.target.closest("[data-f]");if(f){FILTRO=f.dataset.f;document.querySelectorAll("[data-f]").forEach(b=>b.setAttribute("aria-pressed",b===f));desenhar();return}
 const cp=e.target.closest("[data-copiar]");if(cp){navigator.clipboard.writeText(cp.dataset.copiar);cp.textContent="Copiado";return}
 const st=e.target.closest("[data-st]");if(st){const c=st.closest(".ped").dataset.c;if(st.dataset.st==="cancelado"&&!confirm("Cancelar o pedido "+c+"?"))return;const p=await api("PATCH","/api/pedidos/"+encodeURIComponent(c),{status:st.dataset.st});PED=PED.map(x=>x.codigo===c?p:x);desenhar()}
});
document.addEventListener("change",async e=>{
 if(e.target.matches("[data-ent]")){const art=e.target.closest(".ped"),c=art.dataset.c;const ent=[...art.querySelectorAll("[data-ent]")].map(i=>i.checked);const p=await api("PATCH","/api/pedidos/"+encodeURIComponent(c),{entregues:ent});PED=PED.map(x=>x.codigo===c?p:x)}
 if(e.target.matches("[data-obs]")){const c=e.target.closest(".ped").dataset.c;const p=await api("PATCH","/api/pedidos/"+encodeURIComponent(c),{obs:e.target.value});PED=PED.map(x=>x.codigo===c?p:x)}
});
document.getElementById("busca").addEventListener("input",desenhar);
const dlg=document.getElementById("dlg");document.getElementById("novo").onclick=()=>dlg.showModal();
dlg.addEventListener("close",async()=>{if(dlg.returnValue!=="ok")return;const f=new FormData(document.getElementById("form-novo"));
 const itens=String(f.get("itens")).split("\\n").map(s=>s.trim()).filter(Boolean).map(s=>{const m=/^(\\d+)\\s*[x×]\\s*(.+)$/i.exec(s);return m?{qtd:+m[1],nome:m[2]}:{qtd:1,nome:s}});
 await api("POST","/api/pedidos",{nome:f.get("nome"),tel:f.get("tel"),itens,total:+String(f.get("total")).replace(/\\D/g,""),link:f.get("link"),status:f.get("status")});document.getElementById("form-novo").reset();carregar()});
carregar();setInterval(()=>{if(!document.querySelector("textarea:focus"))carregar()},30000);
</script></body></html>`;
}

// ---------------------------------------------------------------- rotas --
http.createServer(async (req, res) => {
  const base = prefixo(req);
  const url = new URL(req.url, "http://x");
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  try {
    if (url.pathname === "/healthz") return json(res, 200, { ok: true });
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
      const m = /^\/api\/pedidos\/([A-Za-z0-9-]{1,20})$/.exec(url.pathname);
      if (m && req.method === "PATCH") {
        const p = await atualizar(m[1].toUpperCase(), JSON.parse(await corpo(req)));
        return p ? json(res, 200, p) : json(res, 404, { erro: "não achei" });
      }
      return json(res, 404, { erro: "rota" });
    }
    if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { erro: "método" });
    if (url.pathname !== "/" && url.pathname !== "") { res.writeHead(303, { Location: base + "/" }); return res.end(); }
    return html(res, 200, logado ? paginaApp(base) : paginaLogin(base));
  } catch (e) {
    console.error(e);
    return json(res, 500, { erro: "falha" });
  }
}).listen(PORT, () => console.log(`CRM na porta ${PORT}`));
