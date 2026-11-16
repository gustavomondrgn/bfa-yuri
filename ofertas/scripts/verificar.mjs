// =============================================================================
//  Verificação de /bfa no Google Chrome (playwright-core).
//    npm run verificar                         -> sobe o preview local e testa
//    BASE=https://yuridosanjos.com.br npm run verificar  -> testa produção
//  Nenhum teste abre o WhatsApp de verdade: wa.me é interceptado e a URL,
//  com o texto da mensagem, é conferida aqui.
// =============================================================================
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../", import.meta.url));
const SAIDA = fileURLToPath(new URL("../verificacao/", import.meta.url));
const AXE = fileURLToPath(new URL("../node_modules/axe-core/axe.min.js", import.meta.url));
const DADOS = JSON.parse(await readFile(new URL("../dados/ofertas.json", import.meta.url), "utf8"));
const UA_IG = "Mozilla/5.0 (Linux; Android 14; SM-A146M Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 Instagram 352.0.0.40.97 Android";

const resultados = [];
function ok(nome, cond, detalhe = "") {
  resultados.push({ nome, ok: !!cond, detalhe });
  console.log(`${cond ? "OK   " : "FALHA"}  ${nome}${detalhe ? `  —  ${detalhe}` : ""}`);
}

let BASE = process.env.BASE?.replace(/\/$/, "");
let srv = null;
if (!BASE) {
  const porta = 4198;
  srv = spawn(process.execPath, ["scripts/preview.mjs"], { cwd: RAIZ, env: { ...process.env, PORT: String(porta) }, stdio: "ignore" });
  BASE = `http://localhost:${porta}`;
  for (let i = 0; i < 50; i++) { try { await fetch(`${BASE}/healthz`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
}
await mkdir(SAIDA, { recursive: true });

// ------------------------------------------------------------------- rotas --
{
  const r1 = await fetch(`${BASE}/bfa`, { redirect: "manual" });
  ok("rota /bfa responde 200 sem redirect", r1.status === 200, String(r1.status));
  ok("HTML sem cache", /no-cache|max-age=0/.test(r1.headers.get("cache-control") || ""), r1.headers.get("cache-control"));
  const r2 = await fetch(`${BASE}/bfa/ofertas.json`);
  ok("ofertas.json sem cache (no-store)", r2.status === 200 && /no-store/.test(r2.headers.get("cache-control") || ""), r2.headers.get("cache-control"));
  const j = await r2.json();
  ok("ofertas.json servido = dados/ofertas.json", JSON.stringify(j) === JSON.stringify(DADOS));
  if (!process.env.BASE) {
    const r3 = await fetch(`${BASE}/bfa-grupo`);
    ok("este app não responde /bfa-grupo (fica com o app da ponte)", r3.status === 404, String(r3.status));
  } else {
    const r3 = await fetch(`${BASE}/bfa-grupo`);
    const t3 = await r3.text();
    ok("/bfa-grupo continua servindo a página ponte", r3.status === 200 && /ENTRAR NO GRUPO|Entrar no grupo/i.test(t3), String(r3.status));
  }
}

const browser = await chromium.launch({ channel: "chrome" });
async function abrir({ w = 390, h = 844, query = "previa=1&agora=2026-11-16T10:00:00-03:00", relogio = null, semDataServidor = false, ua = null, js = true, rotaJson = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 700, userAgent: ua || undefined, javaScriptEnabled: js, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  const wa = [];
  await p.route("https://wa.me/**", (route) => { wa.push(route.request().url()); route.fulfill({ status: 200, contentType: "text/html", body: "<p>wa.me interceptado</p>" }); });
  if (semDataServidor || rotaJson) {
    await p.route("**/bfa/ofertas.json*", async (route) => {
      const resp = await route.fetch();
      let corpo = await resp.text();
      if (rotaJson) corpo = JSON.stringify(rotaJson(JSON.parse(corpo)));
      const headers = { ...resp.headers() };
      delete headers.date; delete headers["content-encoding"]; delete headers["content-length"];
      await route.fulfill({ status: 200, headers, body: corpo });
    });
  }
  if (relogio) await p.clock.install({ time: new Date(relogio) });
  await p.goto(`${BASE}/bfa${query ? "?" + query : ""}`);
  await p.waitForTimeout(400);
  return { p, ctx, erros, wa };
}
const textoWa = (url) => new URL(url).searchParams.get("text") || "";
const numeroWa = (url) => new URL(url).pathname.replace("/", "");

// ------------------------------------------------- pedido com um item --
{
  const { p, ctx, erros, wa } = await abrir();
  await p.click("#o-bussola [data-add]");
  ok("1 item: barra aparece com quantidade e total", (await p.textContent("#barra-qtd")) === "1 item no pedido" && (await p.textContent("#barra-total")) === "R$ 797");
  await p.click("#abrir-pedido");
  ok("folha do pedido abre", await p.isVisible("#pedido"));
  ok("folha avisa que o pagamento é depois", /ainda não paga nada/i.test(await p.textContent(".nota")));
  await p.click("#enviar");
  await p.waitForTimeout(800);
  ok("envio abre wa.me", wa.length === 1, wa[0]?.slice(0, 40));
  const t = textoWa(wa[0] || "https://wa.me/x");
  ok("número do atendimento na URL", numeroWa(wa[0] || "https://wa.me/x") === DADOS.whatsapp, numeroWa(wa[0] || "https://wa.me/x"));
  ok("mensagem com item, preço e total", t.includes("• 1× Bússola do Destino — R$ 797") && t.includes("Total: R$ 797"), JSON.stringify(t));
  ok("mensagem com condição e código do pedido", /Condição: Abertura no grupo, válida até 23h59 de 16\/11/.test(t) && /Pedido BFA-[A-Z2-9]{4} · 16\/11 às 10:00/.test(t));
  await writeFile(`${SAIDA}mensagem-1-item.txt`, t);
  ok("sem erros no console (1 item)", !erros.length, erros.join(" | "));
  await ctx.close();
}

// ---------------------------------------------- pedido com três itens --
{
  const { p, ctx, erros, wa } = await abrir();
  await p.click("#o-bussola [data-add]");
  await p.click("#o-raio-x [data-add]");
  await p.click("#o-raio-x [data-mais]");
  await p.click("#o-horaria [data-add]");
  ok("3 itens (4 unidades): total 797 + 2×47 + 97 = R$ 988", (await p.textContent("#barra-total")) === "R$ 988" && (await p.textContent("#barra-qtd")) === "4 itens no pedido");
  await p.click("#abrir-pedido");
  ok("folha lista 3 linhas", (await p.locator("#pedido-lista .linha").count()) === 3);
  await p.click('[data-linha="horaria"] [data-l-remover]');
  ok("remover Horária atualiza total para R$ 891", (await p.textContent("#pedido-total")) === "R$ 891");
  ok("card da Horária volta a mostrar Adicionar", !(await p.getAttribute("#o-horaria", "class")).includes("no-pedido"));
  await p.click('[data-linha="raio-x"] [data-l-menos]');
  await p.click('[data-linha="raio-x"] [data-l-mais]');
  ok("menos/mais na folha mantém total R$ 891", (await p.textContent("#pedido-total")) === "R$ 891");
  await p.screenshot({ path: `${SAIDA}pedido-390.png` });
  await p.click("#enviar");
  await p.waitForTimeout(800);
  const t = textoWa(wa[0] || "https://wa.me/x");
  ok("mensagem com 2 itens e unitário de quantidade 2", t.includes("• 1× Bússola do Destino — R$ 797") && t.includes("• 2× Raio-X Amoroso — R$ 47 cada (R$ 94)") && t.includes("Total: R$ 891") && !t.includes("Horária"), JSON.stringify(t));
  await writeFile(`${SAIDA}mensagem-3-itens.txt`, t);
  // persistência ao voltar do WhatsApp
  await p.goto(`${BASE}/bfa?previa=1&agora=2026-11-16T10:05:00-03:00`);
  await p.waitForTimeout(400);
  ok("pedido continua salvo ao voltar à página", (await p.textContent("#barra-total")) === "R$ 891");
  ok("sem erros no console (3 itens)", !erros.length, erros.join(" | "));
  await ctx.close();
}

// ---------------------------------------------------------- limites e esgotado --
{
  const { p, ctx } = await abrir({ query: "previa=1&agora=2026-11-16T10:00:00-03:00&esgotar=caixa-pandora" });
  ok("esgotado: botão desabilitado com texto Esgotado", (await p.isDisabled("#o-caixa-pandora [data-add]")) && (await p.textContent("#o-caixa-pandora [data-add]")) === "Esgotado");
  ok("esgotado: vagas mostram Esgotado", (await p.textContent("#o-caixa-pandora [data-vagas]")).includes("Esgotado"));
  await p.click("#o-sinastria [data-add]");
  await p.click("#o-sinastria [data-mais]");
  await p.click("#o-sinastria [data-mais]");
  ok("quantidade limitada às vagas (Sinastria 3)", (await p.isDisabled("#o-sinastria [data-mais]")) && (await p.textContent("#o-sinastria [data-qtd]")).startsWith("3"));
  await ctx.close();
}
{
  // vaga acaba no servidor entre adicionar e enviar
  let esgotar = false;
  const { p, ctx, wa } = await abrir({ rotaJson: (d) => { if (esgotar) d.itens.find((i) => i.id === "caixa-pandora").esgotado = true; return d; } });
  await p.waitForTimeout(1500);
  await p.click("#o-caixa-pandora [data-add]");
  await p.click("#o-bussola [data-add]");
  await p.click("#abrir-pedido");
  ok("antes de esgotar no servidor, envio habilitado", !(await p.isDisabled("#enviar")));
  esgotar = true;
  await p.waitForTimeout(21000);
  await p.click("#enviar");
  await p.waitForTimeout(1500);
  ok("vaga esgotada no servidor bloqueia o envio", wa.length === 0, `wa.me aberto ${wa.length}x`);
  ok("linha esgotada sinalizada na folha", (await p.textContent('[data-linha="caixa-pandora"]')).includes("Esgotou"));
  ok("botão de envio desabilitado até remover", await p.isDisabled("#enviar"));
  await p.click('[data-linha="caixa-pandora"] [data-l-remover]');
  await p.click("#enviar");
  await p.waitForTimeout(1000);
  ok("depois de remover, envia só o disponível", wa.length === 1 && !textoWa(wa[0]).includes("Pandora") && textoWa(wa[0]).includes("Total: R$ 797"));
  await ctx.close();
}

// ----------------------------------------------- virada com a página aberta --
{
  const { p, ctx, erros, wa } = await abrir({ query: "previa=1", relogio: "2026-11-16T23:59:30-03:00", semDataServidor: true });
  await p.click("#o-bussola [data-add]");
  await p.click("#abrir-pedido");
  ok("antes da virada: total R$ 797", (await p.textContent("#pedido-total")) === "R$ 797");
  await p.clock.runFor(35000);
  await p.waitForTimeout(300);
  const aviso = await p.textContent("#pedido-mudou");
  ok("virada com pedido aberto: aviso de mudança aparece", await p.isVisible("#pedido-mudou"), aviso);
  ok("total antigo riscado e novo total (17/11 = R$ 977)", (await p.innerHTML("#pedido-total")).includes("<s>R$ 797</s>R$ 977"), await p.innerHTML("#pedido-total"));
  ok("botão pede confirmação com preço atual", (await p.textContent("#enviar-texto")) === "Enviar com o preço atual");
  await p.screenshot({ path: `${SAIDA}virada-pedido-390.png` });
  ok("faixa de virada aparece na página", !(await p.isHidden("#aviso")) && (await p.textContent("#aviso-texto")).includes("17/11"));
  await p.click("#enviar");
  await p.waitForTimeout(500);
  await p.clock.runFor(2000);
  await p.waitForTimeout(500);
  const t = textoWa(wa[0] || "https://wa.me/x");
  ok("mensagem sai com o preço novo e a condição de 17/11", t.includes("R$ 977") && !t.includes("R$ 797") && t.includes("Condição: Dia 17/11, válida até 23h59 de 17/11"), JSON.stringify(t));
  ok("sem erros no console (virada)", !erros.length, erros.join(" | "));
  await ctx.close();
}
{
  // salvaguarda: se uma fase ficar sem preço publicado, nada sai com preço vencido
  const { p, ctx, wa } = await abrir({ query: "previa=1", relogio: "2026-11-16T23:59:50-03:00", semDataServidor: true, rotaJson: (d) => { d.itens.forEach((i) => { i.precos.d17 = null; }); return d; } });
  await p.waitForTimeout(800);
  await p.click("#o-bussola [data-add]");
  await p.clock.runFor(15000);
  await p.waitForTimeout(300);
  ok("sem preço da fase seguinte: card mostra 'em breve' e trava adicionar", (await p.textContent("#o-bussola [data-por]")).includes("em breve") && (await p.isDisabled("#o-raio-x [data-add]")));
  await p.click("#abrir-pedido");
  ok("sem preço da fase seguinte: envio bloqueado", await p.isDisabled("#enviar"));
  ok("nenhum wa.me aberto", wa.length === 0);
  await ctx.close();
}

// ----------------------------------------------------- portão e relógio --
{
  const { p, ctx } = await abrir({ query: "", relogio: "2026-11-16T07:59:50-03:00", semDataServidor: true });
  ok("antes das 8h: portão visível e ofertas escondidas", (await p.isVisible(".portao")) && !(await p.isVisible("main")));
  await p.screenshot({ path: `${SAIDA}portao-390.png` });
  await p.clock.runFor(15000);
  await p.waitForTimeout(300);
  ok("às 8h: página abre sozinha", !(await p.isVisible(".portao")) && (await p.isVisible("main")) && !(await p.isHidden("#aviso")));
  await ctx.close();
}
{
  // celular com relógio 4h atrasado; servidor diz 10h: vale a hora do servidor
  const { p, ctx } = await abrir({
    query: "", relogio: "2026-11-16T06:00:00-03:00",
    rotaJson: (d) => d,
  });
  await p.unroute("**/bfa/ofertas.json*");
  await p.route("**/bfa/ofertas.json*", async (route) => {
    const resp = await route.fetch();
    const headers = { ...resp.headers(), date: new Date("2026-11-16T13:00:00Z").toUTCString() };
    delete headers["content-encoding"]; delete headers["content-length"];
    await route.fulfill({ status: 200, headers, body: await resp.text() });
  });
  await p.reload();
  await p.waitForTimeout(800);
  await p.clock.runFor(1500);
  await p.waitForTimeout(200);
  ok("relógio do celular errado: usa a hora do servidor (abre às 10h reais)", await p.isVisible("main"));
  await ctx.close();
}
{
  const { p, ctx } = await abrir({ query: "", relogio: "2026-11-20T00:00:10-03:00", semDataServidor: true });
  ok("depois de 19/11 23h59: encerrada, sem adicionar", (await p.evaluate(() => document.documentElement.classList.contains("encerrada"))) && (await p.isDisabled("#o-bussola [data-add]")));
  await ctx.close();
}

// --------------------------------------------------------- cenário de cursos --
{
  const { p, ctx } = await abrir({ query: "previa=1&agora=2026-11-16T10:00:00-03:00&cursos=unico" });
  ok("pacote único: card de 17 cursos visível e pacotes separados escondidos", (await p.isVisible("#o-pacote-tudo")) && !(await p.isVisible("#o-pacote-astrologia")));
  ok("pacote único: chamada passa para até 86%", (await p.textContent("#max-off")) === "86");
  await ctx.close();
  const b = await abrir();
  ok("dois pacotes: chamada é até 78%", (await b.p.textContent("#max-off")) === "78");
  await b.ctx.close();
}

// ----------------------------------------------------- larguras e acessibilidade --
for (const [w, h, ua] of [[360, 640], [390, 844], [430, 932], [390, 664, UA_IG], [820, 1180], [1280, 720], [1366, 768], [1920, 1080]]) {
  const { p, ctx, erros } = await abrir({ w, h, ua, query: "agora=2026-11-16T10:00:00-03:00&previa=1" });
  await p.evaluate(() => document.querySelector(".painel-previa")?.remove());
  const vaz = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${w}×${h}${ua ? " (Instagram)" : ""}: sem rolagem lateral`, vaz <= 0, String(vaz));
  const dobra = await p.evaluate(() => {
    const h1 = document.querySelector("#h-abertura").getBoundingClientRect();
    const mini = document.querySelector(".mini").getBoundingClientRect();
    return { h1: h1.bottom < innerHeight, mini: mini.top < innerHeight };
  });
  ok(`${w}×${h}: título e primeira oferta na primeira tela`, dobra.h1 && dobra.mini, JSON.stringify(dobra));
  await p.screenshot({ path: `${SAIDA}dobra-${w}x${h}${ua ? "-ig" : ""}.png` });
  ok(`${w}×${h}: console limpo`, !erros.length, erros.join(" | "));
  await ctx.close();
}
{
  const { p, ctx } = await abrir({ query: "", relogio: "2026-11-16T10:00:00-03:00", semDataServidor: true });
  await p.addScriptTag({ content: await readFile(AXE, "utf8") });
  const r = await p.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] })).violations.map((v) => `${v.id}(${v.nodes.length})`));
  ok("axe WCAG 2.2 A/AA na página", !r.length, r.join(", "));
  await p.click("#o-bussola [data-add]");
  await p.click("#abrir-pedido");
  await p.waitForTimeout(800); // fim da animação de abertura da folha
  const r2 = await p.evaluate(async () => (await window.axe.run(document.querySelector("#pedido"), { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map((v) => `${v.id}(${v.nodes.length})`));
  ok("axe na folha do pedido", !r2.length, r2.join(", "));
  // teclado: Esc fecha e devolve o foco
  await p.keyboard.press("Escape");
  await p.waitForTimeout(200);
  ok("Esc fecha a folha e devolve o foco à barra", !(await p.isVisible("#pedido")) && (await p.evaluate(() => document.activeElement?.id)) === "abrir-pedido");
  // teclado puro: Tab até o primeiro Adicionar e Enter
  await p.evaluate(() => { localStorage.clear(); });
  await p.reload(); await p.waitForTimeout(300);
  let achou = false;
  for (let i = 0; i < 40 && !achou; i++) {
    await p.keyboard.press("Tab");
    achou = await p.evaluate(() => document.activeElement?.hasAttribute?.("data-add"));
  }
  if (achou) await p.keyboard.press("Enter");
  ok("teclado: Tab chega a Adicionar e Enter adiciona", achou && (await p.textContent("#barra-qtd")) === "1 item no pedido");
  await ctx.close();
}
{
  const { p, ctx } = await abrir({ js: false, query: "" });
  const t = await p.textContent("main");
  ok("sem JavaScript: ofertas e preços aparecem", t.includes("Bússola do Destino") && t.includes("797") && t.includes("Mentoria Lux Et Directio"));
  ok("sem JavaScript: link de WhatsApp de contingência", (await p.locator('noscript').count()) > 0);
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/bfa?previa=1&agora=2026-11-16T10:00:00-03:00`);
  const anim = await p.evaluate(() => getComputedStyle(document.querySelector(".pedido__folha")).animationName);
  ok("reduzir movimento: animações desligadas", anim === "none", anim);
  await ctx.close();
}

await browser.close();
if (srv) srv.kill();
const falhas = resultados.filter((r) => !r.ok);
await writeFile(`${SAIDA}relatorio.json`, JSON.stringify({ quando: new Date().toISOString(), base: BASE, total: resultados.length, falhas: falhas.length, resultados }, null, 2));
console.log(`\n${resultados.length - falhas.length}/${resultados.length} verificações OK`);
process.exit(falhas.length ? 1 : 0);
