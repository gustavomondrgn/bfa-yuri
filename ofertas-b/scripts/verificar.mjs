// =============================================================================
//  Verificação da página B (/bfa-b) no Google Chrome (playwright-core).
//    node scripts/verificar.mjs        -> gera, sobe uma prévia própria e testa
//  Mesmos testes de funcionamento da A (scripts/verificar.mjs de ../ofertas),
//  com as datas de hoje (17/11) e o que é só da B (movimento, GSAP, reduzir
//  movimento). Nada é enviado: wa.me/api.whatsapp.com e o Pixel são
//  interceptados e o texto da mensagem é conferido aqui.
//  Capturas das dobras principais em verificacao/.
// =============================================================================
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";

const RAIZ = fileURLToPath(new URL("../", import.meta.url));
const SAIDA = fileURLToPath(new URL("../verificacao/", import.meta.url));
const require = createRequire(import.meta.url);
const AXE = require.resolve("axe-core/axe.min.js");
const DADOS = JSON.parse(await readFile(new URL("../../ofertas/dados/ofertas.json", import.meta.url), "utf8"));
const UA_IG = "Mozilla/5.0 (Linux; Android 14; SM-A146M Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 Instagram 352.0.0.40.97 Android";
const HOJE = "2026-11-17T10:00:00-03:00";
const item = (id) => DADOS.itens.find((i) => i.id === id);
const P = (id, f = "d17") => item(id).precos[f];
const brl = (v) => "R$ " + v.toLocaleString("pt-BR");
const num = (v) => v.toLocaleString("pt-BR");
const midia = (u) => String(u || "").replace(/^\/bfa\//, "/bfa-b/");

const resultados = [];
function ok(nome, cond, detalhe = "") {
  resultados.push({ nome, ok: !!cond, detalhe });
  console.log(`${cond ? "OK   " : "FALHA"}  ${nome}${detalhe ? `  —  ${detalhe}` : ""}`);
}

// gera o site e sobe uma prévia própria (porta 4199) para não brigar com a 4175
await new Promise((res, rej) => spawn(process.execPath, ["scripts/gerar.mjs"], { cwd: RAIZ, stdio: "inherit" }).on("exit", (c) => (c ? rej(new Error("gerar falhou")) : res())));
const porta = 4199;
const srv = spawn(process.execPath, ["scripts/preview.mjs"], { cwd: RAIZ, env: { ...process.env, PORT: String(porta) }, stdio: "ignore" });
const BASE = `http://localhost:${porta}`;
for (let i = 0; i < 50; i++) { try { await fetch(`${BASE}/healthz`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
await mkdir(SAIDA, { recursive: true });

// ------------------------------------------------------------------- rotas --
{
  const r1 = await fetch(`${BASE}/bfa-b`, { redirect: "manual" });
  ok("rota /bfa-b responde 200 sem redirect", r1.status === 200, String(r1.status));
  ok("HTML sem cache", /no-cache|max-age=0/.test(r1.headers.get("cache-control") || ""), r1.headers.get("cache-control"));
  const html = await r1.text();
  const r2 = await fetch(`${BASE}/bfa-b/ofertas.json`);
  ok("ofertas.json da B sem cache (no-store)", r2.status === 200 && /no-store/.test(r2.headers.get("cache-control") || ""), r2.headers.get("cache-control"));
  ok("ofertas.json da B = ../ofertas/dados/ofertas.json (fonte única)", JSON.stringify(await r2.json()) === JSON.stringify(DADOS));
  const r3 = await fetch(`${BASE}/bfa-crm/api/vagas`);
  const v = await r3.json();
  ok("prévia imita /bfa-crm/api/vagas (vendidos = iniciais − vagas)", r3.status === 200 && v.vendidos && v.vendidos.bussola === item("bussola").vagasIniciais - item("bussola").vagas, JSON.stringify(v.vendidos));
  const gz = gzipSync(Buffer.from(html)).length;
  const app = await (await fetch(`${BASE}/bfa-b/assets/app.js`)).text();
  const mov = await (await fetch(`${BASE}/bfa-b/assets/movimento.js`)).text();
  ok("HTML leve (gzip < 60 KB)", gz < 60 * 1024, `${(gz / 1024).toFixed(1)} KB gzip`);
  ok("sem bibliotecas de fora: só GSAP e ScrollTrigger locais", !/<script[^>]+src="https?:/.test(html) && /assets\/vendor\/gsap\.min\.js/.test(html) && !/fonts\.googleapis|cdn\./.test(html), "");
  ok("app.js da B traz o player da A e a busca de vagas ao vivo", app.includes("BfaPlayer") && app.includes("/bfa-crm/api/vagas") && app.includes('"bfa-b-pedido-v1"'));
  ok("movimento.js não mexe no pedido", !/localStorage|wa\.me|fbq|pedido\.itens/.test(mov));
}

const browser = await chromium.launch({ channel: "chrome" });
async function clicar(p, sel, opcoes) {
  await p.locator(sel).first().evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
  await p.waitForTimeout(250);
  try { await p.click(sel, { timeout: 3000, ...opcoes }); }
  catch { await p.click(sel, { ...opcoes, force: true }); }
}
async function abrir({ w = 390, h = 844, query = `previa=1&agora=${HOJE}`, relogio = null, semDataServidor = false, ua = null, js = true, rotaJson = null, rotaVagas = null, movimento = false, pixel = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 700, userAgent: ua || undefined, javaScriptEnabled: js, locale: "pt-BR", timezoneId: "America/Sao_Paulo", reducedMotion: movimento ? "no-preference" : "reduce" });
  const p = await ctx.newPage();
  const erros = [], wa = [], face = [];
  p.on("pageerror", (e) => erros.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  const pega = (route) => { wa.push(route.request().url()); route.fulfill({ status: 200, contentType: "text/html", body: "<p>WhatsApp interceptado</p>" }); };
  await p.route("https://wa.me/**", pega);
  await p.route("https://api.whatsapp.com/**", pega);
  await p.route("**/connect.facebook.net/**", (route) => { face.push(route.request().url()); route.fulfill({ status: 200, contentType: "application/javascript", body: "/* pixel interceptado */" }); });
  if (semDataServidor || rotaJson) {
    await p.route("**/ofertas.json*", async (route) => {
      const resp = await route.fetch();
      let corpo = await resp.text();
      if (rotaJson) corpo = JSON.stringify(rotaJson(JSON.parse(corpo)));
      const headers = { ...resp.headers() };
      delete headers.date; delete headers["content-encoding"]; delete headers["content-length"];
      await route.fulfill({ status: 200, headers, body: corpo });
    });
  }
  if (rotaVagas) await p.route("**/bfa-crm/api/vagas*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rotaVagas()) }));
  if (relogio) await p.clock.install({ time: new Date(relogio) });
  await p.goto(`${BASE}/bfa-b${query ? "?" + query : ""}`);
  await p.waitForTimeout(450);
  return { p, ctx, erros, wa, face };
}
const textoWa = (url) => new URL(url).searchParams.get("text") || "";
const numeroWa = (url) => new URL(url).pathname.replace("/", "");

// ------------------------------------------------- pedido com um item --
{
  const { p, ctx, erros, wa } = await abrir();
  await clicar(p, "#o-bussola [data-add]");
  ok("1 item: barra aparece com quantidade e total", (await p.textContent("#barra-qtd")) === "1 item no pedido" && (await p.textContent("#barra-total")) === brl(P("bussola")), await p.textContent("#barra-total"));
  const chaves = await p.evaluate(() => Object.keys(localStorage));
  ok("pedido salvo à parte do da /bfa (chave própria)", chaves.includes("bfa-b-pedido-v1") && !chaves.includes("bfa-pedido-v1"), chaves.join(","));
  await clicar(p, "#abrir-pedido");
  ok("Finalizar pedido abre a folha", await p.isVisible("#pedido"));
  ok("folha avisa que o pagamento é depois", /ainda não paga nada/i.test(await p.textContent(".nota")));
  ok("folha lista o item e o total", (await p.locator("#pedido-lista .linha").count()) === 1 && (await p.textContent("#pedido-total")) === brl(P("bussola")));
  await clicar(p, "#enviar");
  await p.waitForTimeout(900);
  ok("envio abre o WhatsApp (wa.me interceptado)", wa.length === 1, wa[0]?.slice(0, 40));
  const t = textoWa(wa[0] || "https://wa.me/x");
  ok("número do atendimento na URL", numeroWa(wa[0] || "https://wa.me/x") === DADOS.whatsapp, numeroWa(wa[0] || "https://wa.me/x"));
  ok("mensagem com item, preço e total (formato da A)", t.startsWith("Olá! Quero fazer este pedido da Black Friday Apocalíptica:") && t.includes(`• 1× Bússola do Destino — ${brl(P("bussola"))}`) && t.includes(`Total: ${brl(P("bussola"))}`), JSON.stringify(t));
  ok("mensagem com condição de 17/11, código BFA-XXXX e hora", /Condição: Dia 17\/11, válida até 23h59 de 17\/11/.test(t) && /Pedido BFA-[A-Z2-9]{4} · 17\/11 às 10:00/.test(t));
  await writeFile(`${SAIDA}mensagem-1-item.txt`, t);
  ok("sem erros no console (1 item)", !erros.length, erros.join(" | "));
  await ctx.close();
}

// ---------------------------------------------- pedido com três itens --
{
  const { p, ctx, erros, wa } = await abrir();
  await clicar(p, "#o-bussola [data-add]");
  await clicar(p, "#o-raio-x [data-add]");
  await clicar(p, "#o-raio-x [data-mais]");
  await clicar(p, "#o-horaria [data-add]");
  const total = P("bussola") + 2 * P("raio-x") + P("horaria");
  ok(`3 itens (4 unidades): total ${brl(total)}`, (await p.textContent("#barra-total")) === brl(total) && (await p.textContent("#barra-qtd")) === "4 itens no pedido", await p.textContent("#barra-total"));
  await clicar(p, "#abrir-pedido");
  ok("folha lista 3 linhas", (await p.locator("#pedido-lista .linha").count()) === 3);
  await clicar(p, '[data-linha="horaria"] [data-l-remover]');
  const semH = total - P("horaria");
  ok(`remover Horária atualiza total para ${brl(semH)}`, (await p.textContent("#pedido-total")) === brl(semH));
  ok("card da Horária volta a mostrar Adicionar", !(await p.getAttribute("#o-horaria", "class")).includes("no-pedido"));
  await clicar(p, '[data-linha="raio-x"] [data-l-menos]');
  await clicar(p, '[data-linha="raio-x"] [data-l-mais]');
  ok("menos/mais na folha mantém o total", (await p.textContent("#pedido-total")) === brl(semH));
  await clicar(p, "#enviar");
  await p.waitForTimeout(900);
  const t = textoWa(wa[0] || "https://wa.me/x");
  ok("mensagem com 2 itens e unitário da quantidade 2", t.includes(`• 1× Bússola do Destino — ${brl(P("bussola"))}`) && t.includes(`• 2× Raio-X Amoroso — ${brl(P("raio-x"))} cada (${brl(2 * P("raio-x"))})`) && t.includes(`Total: ${brl(semH)}`) && !t.includes("Horária"), JSON.stringify(t));
  await writeFile(`${SAIDA}mensagem-3-itens.txt`, t);
  await p.goto(`${BASE}/bfa-b?previa=1&agora=2026-11-17T10:05:00-03:00`);
  await p.waitForTimeout(400);
  ok("pedido continua salvo ao voltar à página", (await p.textContent("#barra-total")) === brl(semH));
  ok("sem erros no console (3 itens)", !erros.length, erros.join(" | "));
  await ctx.close();
}

// ------------------------------------------------------ esvaziar e desfazer --
{
  const { p, ctx } = await abrir();
  await clicar(p, "#o-raio-x [data-add]");
  await clicar(p, "#o-horaria [data-add]");
  await clicar(p, "#esvaziar");
  await p.waitForTimeout(500);
  ok("esvaziar: pedido zera e a barra some", !(await p.evaluate(() => document.getElementById("barra").classList.contains("ativa"))) && !(await p.getAttribute("#o-raio-x", "class")).includes("no-pedido"));
  ok("esvaziar: oferece desfazer", await p.isVisible("#desfazer"));
  await clicar(p, "#desfazer-btn");
  await p.waitForTimeout(400);
  ok("desfazer: pedido volta com o total", (await p.textContent("#barra-total")) === brl(P("raio-x") + P("horaria")));
  await ctx.close();
}

// ---------------------------------------------------------- limites e esgotado --
{
  const { p, ctx } = await abrir({ query: `previa=1&agora=${HOJE}&esgotar=caixa-pandora` });
  ok("esgotado: botão desabilitado com texto Esgotado", (await p.isDisabled("#o-caixa-pandora [data-add]")) && (await p.textContent("#o-caixa-pandora [data-add]")) === "Esgotado");
  ok("esgotado: vagas mostram Esgotado", (await p.textContent("#o-caixa-pandora [data-vagas]")).includes("Esgotado"));
  ok("esgotado: carimbo com X sobre o card", await p.isVisible("#o-caixa-pandora .esgotado-selo b"));
  await p.locator("#o-caixa-pandora").scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${SAIDA}esgotado-390.png` });
  await clicar(p, "#o-sinastria [data-add]");
  await clicar(p, "#o-sinastria [data-mais]");
  await clicar(p, "#o-sinastria [data-mais]");
  const vs = item("sinastria").vagas;
  ok(`quantidade limitada às vagas (Sinastria ${vs})`, (await p.isDisabled("#o-sinastria [data-mais]")) && (await p.textContent("#o-sinastria [data-qtd]")).startsWith(String(vs)));
  await ctx.close();
}
{
  // vagas ao vivo: o CRM diz que a Bússola vendeu tudo -> esgota sem deploy
  const { p, ctx } = await abrir({ rotaVagas: () => ({ vendidos: { bussola: item("bussola").vagasIniciais, horaria: 20 } }) });
  await p.waitForTimeout(900);
  ok("vagas ao vivo do CRM: Bússola esgota (destaque e card)", (await p.textContent("#o-bussola [data-vagas]")).includes("Esgotado") && (await p.isDisabled("#d-bussola [data-add]")) && (await p.isDisabled("#o-bussola [data-add]")));
  ok("vagas ao vivo do CRM: Horária mostra o que resta", (await p.textContent("#o-horaria [data-vagas]")).includes(`Restam 7 de ${item("horaria").vagasIniciais}`), await p.textContent("#o-horaria [data-vagas]"));
  await ctx.close();
}
{
  // vaga acaba no servidor entre adicionar e enviar
  let esgotar = false;
  const { p, ctx, wa } = await abrir({ rotaJson: (d) => { if (esgotar) d.itens.find((i) => i.id === "caixa-pandora").esgotado = true; return d; } });
  await p.waitForTimeout(1500);
  await clicar(p, "#o-caixa-pandora [data-add]");
  await clicar(p, "#o-bussola [data-add]");
  await clicar(p, "#abrir-pedido");
  ok("antes de esgotar no servidor, envio habilitado", !(await p.isDisabled("#enviar")));
  esgotar = true;
  await p.waitForTimeout(21000);
  await clicar(p, "#enviar");
  await p.waitForTimeout(1500);
  ok("vaga esgotada no servidor bloqueia o envio", wa.length === 0, `wa.me aberto ${wa.length}x`);
  ok("linha esgotada sinalizada na folha", (await p.textContent('[data-linha="caixa-pandora"]')).includes("Esgotou"));
  ok("botão de envio desabilitado até remover", await p.isDisabled("#enviar"));
  await clicar(p, '[data-linha="caixa-pandora"] [data-l-remover]');
  await clicar(p, "#enviar");
  await p.waitForTimeout(1000);
  ok("depois de remover, envia só o disponível", wa.length === 1 && !textoWa(wa[0]).includes("Pandora") && textoWa(wa[0]).includes(`Total: ${brl(P("bussola"))}`));
  await ctx.close();
}

// ----------------------------------------------- virada à meia-noite (17 -> 18) --
{
  const { p, ctx, erros, wa } = await abrir({ query: "previa=1", relogio: "2026-11-17T23:59:50-03:00", semDataServidor: true });
  await clicar(p, "#o-bussola [data-add]");
  await clicar(p, "#abrir-pedido");
  ok(`antes da virada: total ${brl(P("bussola"))}`, (await p.textContent("#pedido-total")) === brl(P("bussola")));
  ok("contagem regressiva no topo marca segundos", /^00m \d\ds$/.test((await p.textContent("#relogio-tempo")).trim()), await p.textContent("#relogio-tempo"));
  await p.clock.runFor(15000);
  await p.waitForTimeout(300);
  ok("virada com pedido aberto: aviso de mudança aparece", await p.isVisible("#pedido-mudou"), await p.textContent("#pedido-mudou"));
  ok(`total antigo riscado e novo total (18/11 = ${brl(P("bussola", "d18"))})`, (await p.innerHTML("#pedido-total")).includes(`<s>${brl(P("bussola"))}</s>${brl(P("bussola", "d18"))}`), await p.innerHTML("#pedido-total"));
  ok("botão pede confirmação com preço atual", (await p.textContent("#enviar-texto")) === "Enviar com o preço atual");
  await p.screenshot({ path: `${SAIDA}virada-pedido-390.png` });
  ok("faixa de virada aparece na página", !(await p.isHidden("#aviso")) && (await p.textContent("#aviso-texto")).includes("18/11"));
  ok("cards da página já com o preço de 18/11", (await p.textContent("#o-raio-x [data-por]")).includes(num(P("raio-x", "d18"))));
  await clicar(p, "#enviar");
  await p.waitForTimeout(500);
  await p.clock.runFor(2000);
  await p.waitForTimeout(500);
  const t = textoWa(wa[0] || "https://wa.me/x");
  ok("mensagem sai com o preço novo e a condição de 18/11", t.includes(brl(P("bussola", "d18"))) && !t.includes(brl(P("bussola"))) && t.includes("Condição: Dia 18/11, válida até 23h59 de 18/11"), JSON.stringify(t));
  ok("sem erros no console (virada)", !erros.length, erros.join(" | "));
  await ctx.close();
}
{
  // a virada também pela URL de teste: ?previa=1&agora=...23:59:50
  const { p, ctx } = await abrir({ query: "previa=1&agora=2026-11-17T23:59:50-03:00" });
  const antes = await p.textContent("#o-bussola [data-por]");
  await p.waitForTimeout(11500);
  const depois = await p.textContent("#o-bussola [data-por]");
  ok("?previa=1&agora=23:59:50: preço vira sozinho à meia-noite", antes.includes(num(P("bussola"))) && depois.includes(num(P("bussola", "d18"))), `${antes} -> ${depois}`);
  ok("?previa=1 não mostra nada de prévia na página", !(await p.locator(".painel-previa, .previa-faixa").count()) && !/prévia/i.test(await p.textContent("body")));
  await ctx.close();
}
{
  // salvaguarda: fase seguinte sem preço publicado -> nada sai com preço vencido
  const { p, ctx, wa } = await abrir({ query: "previa=1", relogio: "2026-11-17T23:59:50-03:00", semDataServidor: true, rotaJson: (d) => { d.itens.forEach((i) => { i.precos.d18 = null; }); return d; } });
  await p.waitForTimeout(800);
  await clicar(p, "#o-bussola [data-add]");
  await p.clock.runFor(15000);
  await p.waitForTimeout(300);
  ok("sem preço da fase seguinte: card mostra 'em breve' e trava adicionar", (await p.textContent("#o-bussola [data-por]")).includes("em breve") && (await p.isDisabled("#o-raio-x [data-add]")));
  await clicar(p, "#abrir-pedido");
  ok("sem preço da fase seguinte: envio bloqueado", await p.isDisabled("#enviar"));
  ok("nenhum wa.me aberto", wa.length === 0);
  await ctx.close();
}
{
  // celular com relógio errado; servidor diz 18/11 10h: vale a hora do servidor
  const { p, ctx } = await abrir({ query: "", relogio: "2026-11-17T03:00:00-03:00", rotaJson: (d) => d });
  await p.unroute("**/ofertas.json*");
  await p.route("**/ofertas.json*", async (route) => {
    const resp = await route.fetch();
    const headers = { ...resp.headers(), date: new Date("2026-11-18T13:00:00Z").toUTCString() };
    delete headers["content-encoding"]; delete headers["content-length"];
    await route.fulfill({ status: 200, headers, body: await resp.text() });
  });
  await p.reload();
  await p.waitForTimeout(800);
  await p.clock.runFor(1500);
  await p.waitForTimeout(200);
  ok("relógio do celular errado: usa a hora do servidor (preço de 18/11)", (await p.textContent("#o-bussola [data-por]")).includes(num(P("bussola", "d18"))), await p.textContent("#o-bussola [data-por]"));
  await ctx.close();
}
{
  const { p, ctx } = await abrir({ query: "", relogio: "2026-11-20T00:00:10-03:00", semDataServidor: true });
  ok("depois de 19/11 23h59: encerrada, sem adicionar", (await p.evaluate(() => document.documentElement.classList.contains("encerrada"))) && (await p.isDisabled("#o-bussola [data-add]")));
  await ctx.close();
}

// -------------------------------------------------------------- Meta Pixel --
{
  const a = await abrir();
  ok("Pixel desligado com ?previa=1 (nem carrega)", !a.face.length && (await a.p.evaluate(() => typeof window.fbq)) === "undefined");
  await a.ctx.close();
  const { p, ctx, wa, face } = await abrir({ query: "", relogio: HOJE, semDataServidor: true });
  // o envio sai da página (wa.me): as chamadas ao fbq são registradas aqui fora
  const chamadas = [];
  await p.exposeFunction("__registraPixel", (a) => { chamadas.push(a); });
  await p.clock.runFor(1000);
  const fila = await p.evaluate(() => (window.fbq && window.fbq.queue ? window.fbq.queue.map((a) => [a[0], a[1]]) : []));
  await p.evaluate(() => { const f = window.fbq; if (!f) return; window.fbq = function () { window.__registraPixel([arguments[0], arguments[1]]); return f.apply(this, arguments); }; });
  await clicar(p, "#o-bussola [data-add]");
  await clicar(p, "#abrir-pedido");
  await clicar(p, "#enviar");
  await p.waitForTimeout(500);
  await p.clock.runFor(3000);
  await p.waitForTimeout(300);
  const ev = [...fila, ...chamadas].filter((a) => a[0] === "track").map((a) => a[1]);
  ok("Pixel com o mesmo ID da A", fila.some((a) => a[0] === "init" && a[1] === DADOS.pixel) && face.length >= 1, JSON.stringify(fila.find((a) => a[0] === "init")));
  ok("Pixel: PageView, AddToCart e InitiateCheckout (no envio)", ev.includes("PageView") && ev.includes("AddToCart") && ev.includes("InitiateCheckout") && wa.length === 1, ev.join(","));
  ok("Pixel: nunca Purchase", !ev.includes("Purchase"));
  await ctx.close();
}

// --------------------------------------------------------- conteúdo e estrutura --
{
  const { p, ctx, erros } = await abrir({ w: 1366, h: 768 });
  const html = await p.content();
  const atalhos = await p.$$eval(".atalhos a span", (s) => s.map((x) => x.textContent.trim()));
  ok("menu: Prever · Quem você é · Amor · Prosperar · Mentoria · Cursos", JSON.stringify(atalhos) === JSON.stringify(["Prever", "Quem você é", "Amor", "Prosperar", "Mentoria", "Cursos"]), atalhos.join(" · "));
  ok("Consulta Horária dentro de Prever", !!(await p.$("#prever #o-horaria")));
  const esperados = DADOS.itens.filter((i) => !i.cenario || i.cenario === DADOS.cenarioCursos).map((i) => i.id);
  const naPagina = await p.$$eval("main .oferta[data-id]", (els) => els.map((e) => e.getAttribute("data-id")));
  ok("todas as ofertas da A e nenhuma a mais (um card por oferta)", JSON.stringify([...naPagina].sort()) === JSON.stringify([...esperados].sort()), `${naPagina.length} cards`);
  ok("um botão por card (Adicionar), nada de comprar direto", await p.$$eval("main .oferta, #d-bussola", (els) => els.every((e) => e.querySelectorAll("[data-add]").length === 1 && !/comprar|pedir só/i.test(e.textContent))));
  ok("cursos: só os dois pacotes", (await p.locator("#cursos .oferta--pacote").count()) === 2 && (await p.locator("#cursos .oferta").count()) === 2 && (await p.locator("#o-pacote-tudo, #o-curso-fundamentos").count()) === 0);
  ok("Por que Astrologia Funciona? só dentro do Pacote Astrologia", (await p.textContent("#o-pacote-astrologia .recibo")).includes("Por que Astrologia Funciona?"));
  ok("Pacote Astrologia mostra −80% e soma separada R$ 2.493", (await p.textContent("#o-pacote-astrologia [data-off]")).trim() === "−80%" && (await p.textContent("#o-pacote-astrologia .recibo__soma")).includes("2.493"));
  ok("chamada até 80% (campo fixo chamadaDesconto) e nenhum 78%", (await p.textContent("#max-off")) === String(DADOS.chamadaDesconto) && !/78\s*%/.test(html) && /Até 80% de desconto/.test(await p.textContent(".fita--a")));
  ok("Bússola em destaque no topo, com o vídeo do Vicente", (await p.$(".abertura #d-bussola [data-video=\"vicente\"]")) !== null && /Todo mês aquilo ali/.test(await p.textContent("#d-bussola")));
  const selos = await p.$$eval(".selo-volta", (els) => els.map((e) => e.textContent.trim()));
  ok("selo da Bússola: Voltou depois de um ano (abertura e card)", selos.length === 2 && selos.every((t) => t === "Voltou depois de um ano"), JSON.stringify(selos));
  ok("mentoria Lux et Directio: águia, Newsreader e fundo preto quadriculado", await p.evaluate(() => { const f = document.querySelector(".faixa-mentoria"), s = getComputedStyle(f); return s.backgroundColor === "rgb(0, 0, 0)" && s.backgroundImage.includes("svg") && !!f.querySelector(".mentoria__aguia") && getComputedStyle(f.querySelector("h2")).fontFamily.includes("Newsreader"); }));
  const depos = await p.$$eval(".depos [data-video]", (els) => els.map((e) => e.getAttribute("data-video")));
  ok("depoimentos da mentoria: Gibran à esquerda, Julio Pozzato à direita", JSON.stringify(depos) === JSON.stringify(["mentoria-02", "mentoria-01"]), depos.join(","));
  const textos = DADOS.itens.filter((i) => esperados.includes(i.id)).flatMap((i) => [i.paraQuem, ...(i.descricao || []), ...(i.recebe || [])]);
  const corpo = await p.evaluate(() => document.body.textContent.replace(/\s+/g, " "));
  const faltam = textos.filter((t) => !corpo.includes(t.replace(/\s+/g, " ")));
  ok("todos os textos das ofertas vêm dos dados (nada faltando)", !faltam.length, faltam.slice(0, 2).join(" | "));
  ok("seções sem numeração e sem 'Como funciona o pedido'", !/\d{2} \/ \d{2}/.test(corpo) && !/Como funciona o pedido/.test(corpo));
  ok("um contador só (o do topo)", (await p.locator("#contagem, .contagem").count()) === 0);
  ok("sem rodapé (como na A)", (await p.locator("footer.rodape").count()) === 0);
  ok("faixas por cima da seção seguinte", await p.evaluate(() => Number(getComputedStyle(document.querySelector(".fitas")).zIndex) >= 10));
  ok("console limpo (estrutura)", !erros.length, erros.join(" | "));
  // Ver detalhes da Bússola: vai ao card e abre os detalhes
  await clicar(p, "#d-bussola [data-ir]");
  await p.waitForTimeout(700);
  ok("“Ver detalhes da Bússola” leva ao card e abre os detalhes", await p.evaluate(() => { const c = document.querySelector("#o-bussola"); return c.querySelector("details").open && Math.abs(c.getBoundingClientRect().top) < 260; }));
  await ctx.close();
}

// --------------------------------------------- todas as mídias existem --
{
  const urls = new Set();
  for (const d of Object.values(DADOS.depoimentos)) for (const k of ["img", "mini", "mp4", "poster"]) if (d[k]) urls.add(midia(d[k]));
  ["/bfa-b/assets/lux/aguia.webp?v=1", "/bfa-b/assets/fontes/anton.woff2?v=1", "/bfa-b/assets/fontes/instrument-serif-italico.woff2?v=1", "/bfa-b/assets/fontes/instrument-serif.woff2?v=1", "/bfa-b/assets/lux/newsreader.woff2", "/bfa-b/assets/vendor/gsap.min.js?v=3.15.0", "/bfa-b/assets/vendor/ScrollTrigger.min.js?v=3.15.0", "/bfa-b/assets/favicon.svg?v=1"].forEach((u) => urls.add(u));
  const ruins = [];
  for (const u of urls) { const r = await fetch(BASE + u, { method: "HEAD" }); if (r.status !== 200) ruins.push(`${r.status} ${u}`); }
  ok(`todas as ${urls.size} mídias, fontes e bibliotecas respondem 200`, !ruins.length, ruins.join(" | "));
  const r = await fetch(`${BASE}${midia(DADOS.depoimentos.vicente.mp4)}`, { headers: { Range: "bytes=1000-1999" } });
  ok("vídeo responde a Range (206), condição para avançar o vídeo", r.status === 206 && (r.headers.get("content-range") || "").startsWith("bytes 1000-1999/"), `${r.status} ${r.headers.get("content-range")}`);
}

// ------------------------------------------ depoimentos nos cards (prints) --
{
  const { p, ctx, erros } = await abrir({ w: 1366, h: 768 });
  const comPrint = DADOS.itens.filter((i) => i.depoimento && DADOS.depoimentos[i.depoimento]?.tipo === "imagem");
  const falhou = [];
  for (const i of comPrint) {
    const sel = `#o-${i.id} [data-video]`;
    await clicar(p, sel);
    await p.waitForTimeout(350);
    const st = await p.evaluate(() => { const d = document.querySelector("#video"), im = document.querySelector("#video-img"); return { aberto: d.open, foto: d.classList.contains("foto"), src: im.getAttribute("src") || "", carregou: im.complete && im.naturalWidth > 0 }; });
    if (!st.aberto || !st.foto || !st.src.includes(i.depoimento) || !st.src.startsWith("/bfa-b/") || !st.carregou) falhou.push(`${i.id}:${JSON.stringify(st)}`);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(250);
    const depois = await p.evaluate((s) => ({ fechado: !document.querySelector("#video").open, foco: document.activeElement === document.querySelector(s) }), sel);
    if (!depois.fechado || !depois.foco) falhou.push(`${i.id} ao fechar:${JSON.stringify(depois)}`);
  }
  ok(`os ${comPrint.length} prints dos cards abrem por cima, carregam, fecham com Esc e devolvem o foco`, comPrint.length > 0 && !falhou.length, falhou.join(" | "));
  await clicar(p, "#o-revolucao-solar [data-video]");
  await p.waitForTimeout(300);
  await p.click("#fechar-video");
  await p.waitForTimeout(250);
  ok("botão fechar fecha o print", !(await p.evaluate(() => document.querySelector("#video").open)));
  await clicar(p, "#o-horaria [data-video]");
  await p.waitForTimeout(300);
  await p.mouse.click(5, 5);
  await p.waitForTimeout(250);
  ok("clique fora fecha o print", !(await p.evaluate(() => document.querySelector("#video").open)));
  ok("console limpo (prints)", !erros.length, erros.join(" | "));
  await ctx.close();
}

// ------------------------------------------ vídeo: player abre, avança, fecha --
{
  const { p, ctx, erros } = await abrir({ w: 1366, h: 768 });
  await clicar(p, "#d-bussola [data-video]");
  await p.waitForFunction(() => { const v = document.querySelector("#video video"); return v && v.readyState >= 1 && v.duration > 30; }, null, { timeout: 15000 }).catch(() => {});
  ok("player da A montado (controles próprios, sem os nativos)", await p.evaluate(() => !!document.querySelector("#video .bplayer__ui") && !document.querySelector("#video video").controls));
  const r = await p.evaluate(async () => {
    const v = document.querySelector("#video video");
    v.muted = true;
    const alvo = v.duration * 0.7;
    await new Promise((res) => { v.addEventListener("seeked", res, { once: true }); v.currentTime = alvo; setTimeout(res, 8000); });
    return { dur: v.duration, t: v.currentTime, alvo, src: v.getAttribute("src") };
  });
  ok("vídeo do Vicente (mostrador da Bússola) abre e avança para 70%", Math.abs(r.t - r.alvo) < 1.5 && r.src.startsWith("/bfa-b/"), JSON.stringify(r));
  await p.screenshot({ path: `${SAIDA}player-1366.png` });
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  const fechado = await p.evaluate(() => { const v = document.querySelector("#video video"); return { aberto: document.querySelector("#video").open, pausado: v.paused, src: v.getAttribute("src") }; });
  ok("Esc fecha o vídeo, para o som e solta o arquivo", !fechado.aberto && fechado.pausado && !fechado.src, JSON.stringify(fechado));
  // botão voltar do celular fecha o player
  await clicar(p, '.depos [data-video="mentoria-01"]');
  await p.waitForFunction(() => { const v = document.querySelector("#video video"); return v && v.readyState >= 1 && v.duration > 30; }, null, { timeout: 15000 }).catch(() => {});
  const r2 = await p.evaluate(async () => { const v = document.querySelector("#video video"); v.muted = true; await new Promise((res) => { v.addEventListener("seeked", res, { once: true }); v.currentTime = 60; setTimeout(res, 8000); }); return v.currentTime; });
  ok("vídeo da mentoria abre e avança para 1 min", Math.abs(r2 - 60) < 1.5, String(r2));
  await p.goBack();
  await p.waitForTimeout(500);
  ok("voltar (histórico) fecha o player e fica na página", !(await p.evaluate(() => document.querySelector("#video").open)) && p.url().includes("/bfa-b"));
  // voltar também fecha a folha do pedido
  await clicar(p, "#o-raio-x [data-add]");
  await clicar(p, "#abrir-pedido");
  await p.goBack();
  await p.waitForTimeout(400);
  ok("voltar fecha a folha do pedido", !(await p.isVisible("#pedido")) && p.url().includes("/bfa-b"));
  ok("console limpo (vídeos)", !erros.length, erros.join(" | "));
  await ctx.close();
}

// ---------------------------------------------------------------- mural --
{
  const { p, ctx, erros } = await abrir({ w: 1366, h: 768 });
  ok("título do mural: O que falam de mim", (await p.textContent("#h-mural")).replace(/\s+/g, " ").trim() === "O que falam de mim");
  const n = await p.locator(".mural__item").count();
  ok(`mural com os ${DADOS.mural.length} depoimentos (os mesmos da A)`, n === DADOS.mural.length, String(n));
  ok("mosaico em 3 colunas no desktop", (await p.locator(".mural__col").count()) === 3);
  await p.locator("#mural-mais").scrollIntoViewIfNeeded();
  ok("mural recolhido com botão Ver mais", (await p.isVisible("#mural-mais")) && (await p.evaluate(() => document.querySelector("#mural-corpo").classList.contains("recolhido"))));
  await p.click("#mural-mais");
  await p.waitForTimeout(200);
  ok("Ver mais abre todos", !(await p.evaluate(() => document.querySelector("#mural-corpo").classList.contains("recolhido"))) && !(await p.isVisible("#mural-mais")));
  const idImg = DADOS.mural.find((id) => DADOS.depoimentos[id].tipo === "imagem");
  await clicar(p, `.mural [data-video="${idImg}"]`);
  await p.waitForTimeout(400);
  const st = await p.evaluate(() => ({ aberto: document.querySelector("#video").open, foto: document.querySelector("#video").classList.contains("foto"), ok: document.querySelector("#video-img").naturalWidth > 0 }));
  ok("print do mural amplia ao clicar", st.aberto && st.foto && st.ok, JSON.stringify(st));
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
  const idVid = DADOS.mural.find((id) => DADOS.depoimentos[id].mp4 && !DADOS.depoimentos[id].audio);
  await clicar(p, `.mural [data-video="${idVid}"]`);
  await p.waitForTimeout(600);
  const sv = await p.evaluate(() => ({ aberto: document.querySelector("#video").open, foto: document.querySelector("#video").classList.contains("foto"), src: document.querySelector("#video video").getAttribute("src") || "" }));
  ok("vídeo do mural abre no player", sv.aberto && !sv.foto && sv.src.includes(idVid), JSON.stringify(sv));
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
  const idAud = DADOS.mural.find((id) => DADOS.depoimentos[id].audio);
  await clicar(p, `.mural [data-video="${idAud}"]`);
  await p.waitForTimeout(600);
  ok("áudio do mural abre no player", await p.evaluate((id) => document.querySelector("#video").open && (document.querySelector("#video video").getAttribute("src") || "").includes(id), idAud));
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
  ok("console limpo (mural)", !erros.length, erros.join(" | "));
  await ctx.close();
  const b = await abrir({ w: 390, h: 844 });
  ok("mosaico em 1 coluna no celular", (await b.p.locator(".mural__col").count()) === 1);
  await b.ctx.close();
}

// ----------------------------------------- todos os botões de todas as ofertas --
{
  const { p, ctx, erros, wa } = await abrir({ w: 1366, h: 900 });
  const visiveis = [...new Set(await p.$$eval("main [data-id]", (els) => els.filter((e) => e.offsetParent !== null).map((e) => e.getAttribute("data-id"))))];
  for (const id of visiveis) await clicar(p, `#o-${id} [data-add]`);
  const esperado = visiveis.reduce((s, id) => s + P(id), 0);
  ok(`Adicionar funciona em todas as ${visiveis.length} ofertas`, (await p.textContent("#barra-qtd")) === `${visiveis.length} itens no pedido` && (await p.textContent("#barra-total")) === brl(esperado), `${await p.textContent("#barra-qtd")} · ${await p.textContent("#barra-total")} (esperado ${brl(esperado)})`);
  // só aperta − onde o + foi aceito (oferta com 1 vaga trava o + e o − tiraria o item do pedido)
  const subiu = [];
  for (const id of visiveis) { if (await p.locator(`#o-${id} [data-mais]`).isEnabled()) { await clicar(p, `#o-${id} [data-mais]`); subiu.push(id); } }
  for (const id of subiu) { if (await p.locator(`#o-${id} [data-menos]`).count()) await clicar(p, `#o-${id} [data-menos]`); }
  ok("+ e − voltam ao mesmo total", (await p.textContent("#barra-total")) === brl(esperado), await p.textContent("#barra-total"));
  let detOk = true;
  for (const id of visiveis) {
    const det = p.locator(`#o-${id} details`);
    if (!(await det.count())) continue;
    await clicar(p, `#o-${id} details > summary`);
    if (!(await det.evaluate((d) => d.open))) detOk = false;
    await clicar(p, `#o-${id} details > summary`);
  }
  ok("Ver detalhes abre e fecha em todos os cards", detOk);
  await clicar(p, "#abrir-pedido");
  await p.waitForTimeout(500);
  ok("folha lista todas as ofertas com o total certo", (await p.locator("#pedido-lista > li").count()) === visiveis.length && (await p.textContent("#pedido-total")) === brl(esperado));
  await clicar(p, "#enviar");
  await p.waitForTimeout(900);
  const t = textoWa(wa[0] || "https://wa.me/x");
  const nomes = visiveis.map((id) => item(id).nome);
  ok("mensagem do WhatsApp com todas as ofertas e o total", nomes.every((n) => t.includes(n)) && t.includes(`Total: ${brl(esperado)}`), nomes.filter((n) => !t.includes(n)).join(","));
  ok("console limpo (todas as ofertas)", !erros.length, erros.join(" | "));
  await ctx.close();
}

// -------------------------------------------------------------- menu --
{
  const { p, ctx, erros } = await abrir({ w: 390, h: 844, movimento: true });
  await p.waitForTimeout(1500);
  const falhas = [];
  for (const s of DADOS.secoes) {
    await p.click(`.atalhos a[data-atalho="${s.id}"]`);
    await p.waitForTimeout(1400);
    const r = await p.evaluate((id) => { const el = document.getElementById(id); const top = el.getBoundingClientRect().top; const cab = document.querySelector(".topo").getBoundingClientRect().bottom; return { top: Math.round(top), cab: Math.round(cab), atual: document.querySelector(`.atalhos a[data-atalho="${id}"]`).getAttribute("aria-current") }; }, s.id);
    if (Math.abs(r.top - r.cab) > 90 || r.atual !== "true") falhas.push(`${s.id}:${JSON.stringify(r)}`);
  }
  ok("menu leva a cada seção e marca a atual (com movimento)", !falhas.length, falhas.join(" | "));
  ok("console limpo (menu)", !erros.length, erros.join(" | "));
  await ctx.close();
}

// ----------------------------------------------------- movimento (GSAP) --
{
  const { p, ctx, erros } = await abrir({ w: 390, h: 664, movimento: true, ua: UA_IG });
  await p.waitForFunction(() => document.documentElement.classList.contains("gsap"), null, { timeout: 8000 }).catch(() => {});
  ok("com movimento: GSAP e ScrollTrigger locais carregam", await p.evaluate(() => !!(window.gsap && window.ScrollTrigger) && document.documentElement.classList.contains("gsap")));
  const antes = await p.evaluate(() => getComputedStyle(document.querySelector(".fita--a .fita__trilho")).transform);
  await p.waitForTimeout(700);
  const depois = await p.evaluate(() => getComputedStyle(document.querySelector(".fita--a .fita__trilho")).transform);
  ok("faixas correndo", antes !== depois, `${antes} -> ${depois}`);
  const escondidos = await p.evaluate(() => [...document.querySelectorAll("main .oferta")].filter((c) => c.getBoundingClientRect().top > innerHeight).length);
  ok("cards abaixo da dobra esperam para entrar", escondidos > 0 && await p.evaluate(() => getComputedStyle(document.querySelector("#o-sinastria")).opacity === "0"));
  // rola a página inteira, medindo rolagem lateral em cada ponto
  let vazou = 0;
  const alt = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < alt; y += 330) {
    await p.evaluate((yy) => window.scrollTo(0, yy), y);
    await p.waitForTimeout(90);
    vazou = Math.max(vazou, await p.evaluate(() => Math.max(document.documentElement.scrollWidth, innerWidth) - innerWidth));
  }
  await p.waitForTimeout(1800);
  ok("rolando a página inteira com movimento: nunca há rolagem lateral (390×664, Instagram)", vazou <= 0, String(vazou));
  const presos = await p.evaluate(() => [...document.querySelectorAll("main .oferta, .depos .depo, .secao__cab h2 .m > span")].filter((e) => { const s = getComputedStyle(e); return Number(s.opacity) < 0.99 || (s.transform !== "none" && !/matrix\(1, 0, 0, 1, 0, 0\)/.test(s.transform)); }).map((e) => e.id || e.className).slice(0, 5));
  ok("depois de rolar, tudo entrou (nada preso escondido)", !presos.length, presos.join(","));
  ok("mentoria: a janela abriu por inteiro", await p.evaluate(() => { const c = getComputedStyle(document.querySelector(".faixa-mentoria")).clipPath; return c === "none" || /inset\(0(px|%)?( 0(px|%)?)*( round 0(px)?)?\)/.test(c) || c.includes("inset(0%"); }), await p.evaluate(() => getComputedStyle(document.querySelector(".faixa-mentoria")).clipPath));
  ok("console limpo (movimento)", !erros.length, erros.join(" | "));
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/bfa-b?previa=1&agora=${HOJE}`);
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => ({
    anima: document.documentElement.classList.contains("anima"),
    gsap: typeof window.gsap,
    folha: getComputedStyle(document.querySelector(".pedido__folha")).animationName,
    fita: getComputedStyle(document.querySelector(".fita__trilho")).animationName,
    destaque: getComputedStyle(document.querySelector(".destaque")).animationName,
    palavra: getComputedStyle(document.querySelector(".abertura h1 .m > span")).animationName,
    cardOpaco: getComputedStyle(document.querySelector("#o-sinastria")).opacity,
  }));
  ok("reduzir movimento: GSAP nem carrega e nenhuma animação roda", !r.anima && r.gsap === "undefined" && r.folha === "none" && r.fita === "none" && r.destaque === "none" && r.palavra === "none" && r.cardOpaco === "1", JSON.stringify(r));
  await ctx.close();
}

// ----------------------------------------------------- larguras e acessibilidade --
for (const [w, h, ua] of [[360, 640], [390, 844], [390, 664, UA_IG], [820, 1180], [1366, 768], [1440, 900], [1920, 1080]]) {
  const { p, ctx, erros } = await abrir({ w, h, ua, movimento: true });
  await p.waitForTimeout(1600);
  const vaz = await p.evaluate((largura) => Math.max(document.documentElement.scrollWidth, innerWidth) - largura, w);
  ok(`${w}×${h}${ua ? " (Instagram)" : ""}: sem rolagem lateral`, vaz <= 0, String(vaz));
  const dobra = await p.evaluate(() => ({ h1: document.querySelector("#h-abertura").getBoundingClientRect().bottom < innerHeight, bussola: document.querySelector("#d-bussola h2").getBoundingClientRect().top < innerHeight - 30 }));
  ok(`${w}×${h}: título e a Bússola na primeira tela`, dobra.h1 && dobra.bussola, JSON.stringify(dobra));
  ok(`${w}×${h}: console limpo`, !erros.length, erros.join(" | "));
  await ctx.close();
}
{
  const { p, ctx } = await abrir({ query: "", relogio: HOJE, semDataServidor: true });
  await p.addScriptTag({ content: await readFile(AXE, "utf8") });
  const r = await p.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] })).violations.map((v) => `${v.id}[${v.impact}](${v.nodes.length})`));
  ok("axe WCAG 2.2 A/AA na página: sem violações", !r.length, r.join(", "));
  await clicar(p, "#o-bussola [data-add]");
  await clicar(p, "#abrir-pedido");
  await p.waitForTimeout(800);
  const r2 = await p.evaluate(async () => (await window.axe.run(document.querySelector("#pedido"), { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map((v) => `${v.id}[${v.impact}](${v.nodes.length})`));
  ok("axe na folha do pedido", !r2.length, r2.join(", "));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(200);
  ok("Esc fecha a folha e devolve o foco à barra", !(await p.isVisible("#pedido")) && (await p.evaluate(() => document.activeElement?.id)) === "abrir-pedido");
  await p.evaluate(() => { localStorage.clear(); });
  await p.reload(); await p.waitForTimeout(300);
  let achou = false;
  for (let i = 0; i < 40 && !achou; i++) { await p.keyboard.press("Tab"); achou = await p.evaluate(() => document.activeElement?.hasAttribute?.("data-add")); }
  if (achou) await p.keyboard.press("Enter");
  ok("teclado: Tab chega a Adicionar e Enter adiciona", achou && (await p.textContent("#barra-qtd")) === "1 item no pedido");
  await ctx.close();
}
{
  const { p, ctx } = await abrir({ js: false, query: "" });
  const t = await p.textContent("main");
  ok("sem JavaScript: ofertas e preços aparecem", t.includes("Bússola do Destino") && t.includes(num(P("bussola", "d16"))) && t.includes("Lux et Directio") && (await p.isVisible("#o-sinastria [data-por]")));
  ok("sem JavaScript: link de WhatsApp de contingência", (await p.locator("noscript").count()) > 0);
  await p.screenshot({ path: `${SAIDA}sem-js-390.png` });
  await ctx.close();
}

// ---------------------------------------------------------------- capturas --
// dobras principais com movimento ligado (depois de as entradas terminarem)
async function captura(w, h, nome, alvo = null, prep = null, ua = null) {
  const { p, ctx } = await abrir({ w, h, movimento: true, ua });
  await p.waitForTimeout(2400);
  if (prep) await prep(p);
  if (alvo) {
    await p.evaluate((s) => { const el = document.querySelector(s); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - (document.querySelector(".topo").offsetHeight + 8)); }, alvo);
    await p.waitForTimeout(2600);
  }
  await p.screenshot({ path: `${SAIDA}${nome}.png` });
  await ctx.close();
}
await captura(1440, 900, "01-abertura-1440");
await captura(1440, 900, "02-prever-1440", "#prever");
await captura(1440, 900, "03-mentoria-1440", ".mentoria__texto");
await captura(1440, 900, "04-cursos-1440", "#cursos .grade--cursos");
await captura(1440, 900, "05-mural-1440", ".mural__cab");
await captura(390, 664, "06-abertura-390-instagram", null, null, UA_IG);
await captura(390, 664, "07-bussola-390", "#d-bussola .dial");
await captura(390, 664, "08-cards-390", "#o-caixa-pandora");
await captura(390, 664, "09-mentoria-390", ".mentoria__cab");
await captura(390, 664, "10-pedido-390", null, async (p) => {
  await clicar(p, "#o-bussola [data-add]"); await clicar(p, "#o-raio-x [data-add]"); await clicar(p, "#o-raio-x [data-mais]");
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${SAIDA}10a-barra-390.png` });
  await clicar(p, "#abrir-pedido"); await p.waitForTimeout(900);
});

await browser.close();
srv.kill();
const falhas = resultados.filter((r) => !r.ok);
await writeFile(`${SAIDA}relatorio.json`, JSON.stringify({ quando: new Date().toISOString(), base: BASE, total: resultados.length, falhas: falhas.length, resultados }, null, 2));
console.log(`\n${resultados.length - falhas.length}/${resultados.length} verificações OK`);
process.exit(falhas.length ? 1 : 0);
