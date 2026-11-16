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
// centraliza o alvo antes do toque: a barra fixa de baixo cobre o rodapé da tela
async function clicar(p, sel, opcoes) {
  await p.locator(sel).first().evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
  await p.waitForTimeout(250);
  try { await p.click(sel, { timeout: 3000, ...opcoes }); }
  catch { await p.click(sel, { ...opcoes, force: true }); }
}
async function abrir({ w = 390, h = 844, query = "previa=1&agora=2026-11-16T10:00:00-03:00", relogio = null, semDataServidor = false, ua = null, js = true, rotaJson = null, movimento = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 700, userAgent: ua || undefined, javaScriptEnabled: js, locale: "pt-BR", timezoneId: "America/Sao_Paulo", reducedMotion: movimento ? "no-preference" : "reduce" });
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
  await clicar(p, "#o-bussola [data-add]");
  ok("1 item: barra aparece com quantidade e total", (await p.textContent("#barra-qtd")) === "1 item no pedido" && (await p.textContent("#barra-total")) === "R$ 797");
  await clicar(p, "#abrir-pedido");
  ok("folha do pedido abre", await p.isVisible("#pedido"));
  ok("folha avisa que o pagamento é depois", /ainda não paga nada/i.test(await p.textContent(".nota")));
  await clicar(p, "#enviar");
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
  await clicar(p, "#o-bussola [data-add]");
  await clicar(p, "#o-raio-x [data-add]");
  await clicar(p, "#o-raio-x [data-mais]");
  await clicar(p, "#o-horaria [data-add]");
  ok("3 itens (4 unidades): total 797 + 2×47 + 97 = R$ 988", (await p.textContent("#barra-total")) === "R$ 988" && (await p.textContent("#barra-qtd")) === "4 itens no pedido");
  await clicar(p, "#abrir-pedido");
  ok("folha lista 3 linhas", (await p.locator("#pedido-lista .linha").count()) === 3);
  await clicar(p, '[data-linha="horaria"] [data-l-remover]');
  ok("remover Horária atualiza total para R$ 891", (await p.textContent("#pedido-total")) === "R$ 891");
  ok("card da Horária volta a mostrar Adicionar", !(await p.getAttribute("#o-horaria", "class")).includes("no-pedido"));
  await clicar(p, '[data-linha="raio-x"] [data-l-menos]');
  await clicar(p, '[data-linha="raio-x"] [data-l-mais]');
  ok("menos/mais na folha mantém total R$ 891", (await p.textContent("#pedido-total")) === "R$ 891");
  await p.screenshot({ path: `${SAIDA}pedido-390.png` });
  await clicar(p, "#enviar");
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

// ------------------------------------------------------ esvaziar pedido --
{
  const { p, ctx } = await abrir();
  await clicar(p, "#o-raio-x [data-add]");
  await clicar(p, "#o-horaria [data-add]");
  await clicar(p, "#esvaziar");
  await p.waitForTimeout(500);
  ok("esvaziar: pedido zera e a barra some", !(await p.evaluate(() => document.getElementById("barra").classList.contains("ativa"))));
  ok("esvaziar: oferece desfazer", await p.isVisible("#desfazer"));
  await clicar(p, "#desfazer-btn");
  await p.waitForTimeout(400);
  ok("desfazer: pedido volta com o total", (await p.textContent("#barra-total")) === "R$ 144");
  await ctx.close();
}

// ---------------------------------------------------------- limites e esgotado --
{
  const { p, ctx } = await abrir({ query: "previa=1&agora=2026-11-16T10:00:00-03:00&esgotar=caixa-pandora" });
  ok("esgotado: botão desabilitado com texto Esgotado", (await p.isDisabled("#o-caixa-pandora [data-add]")) && (await p.textContent("#o-caixa-pandora [data-add]")) === "Esgotado");
  ok("esgotado: vagas mostram Esgotado", (await p.textContent("#o-caixa-pandora [data-vagas]")).includes("Esgotado"));
  ok("esgotado: carimbo com X sobre o card", await p.isVisible("#o-caixa-pandora .esgotado-selo b"));
  await clicar(p, "#o-sinastria [data-add]");
  await clicar(p, "#o-sinastria [data-mais]");
  await clicar(p, "#o-sinastria [data-mais]");
  ok("quantidade limitada às vagas (Sinastria 3)", (await p.isDisabled("#o-sinastria [data-mais]")) && (await p.textContent("#o-sinastria [data-qtd]")).startsWith("3"));
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
  ok("depois de remover, envia só o disponível", wa.length === 1 && !textoWa(wa[0]).includes("Pandora") && textoWa(wa[0]).includes("Total: R$ 797"));
  await ctx.close();
}

// ----------------------------------------------- virada com a página aberta --
{
  const { p, ctx, erros, wa } = await abrir({ query: "previa=1", relogio: "2026-11-16T23:59:30-03:00", semDataServidor: true });
  await clicar(p, "#o-bussola [data-add]");
  await clicar(p, "#abrir-pedido");
  ok("antes da virada: total R$ 797", (await p.textContent("#pedido-total")) === "R$ 797");
  await p.clock.runFor(35000);
  await p.waitForTimeout(300);
  const aviso = await p.textContent("#pedido-mudou");
  ok("virada com pedido aberto: aviso de mudança aparece", await p.isVisible("#pedido-mudou"), aviso);
  ok("total antigo riscado e novo total (17/11 = R$ 977)", (await p.innerHTML("#pedido-total")).includes("<s>R$ 797</s>R$ 977"), await p.innerHTML("#pedido-total"));
  ok("botão pede confirmação com preço atual", (await p.textContent("#enviar-texto")) === "Enviar com o preço atual");
  await p.screenshot({ path: `${SAIDA}virada-pedido-390.png` });
  ok("faixa de virada aparece na página", !(await p.isHidden("#aviso")) && (await p.textContent("#aviso-texto")).includes("17/11"));
  await clicar(p, "#enviar");
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
  await clicar(p, "#o-bussola [data-add]");
  await p.clock.runFor(15000);
  await p.waitForTimeout(300);
  ok("sem preço da fase seguinte: card mostra 'em breve' e trava adicionar", (await p.textContent("#o-bussola [data-por]")).includes("em breve") && (await p.isDisabled("#o-raio-x [data-add]")));
  await clicar(p, "#abrir-pedido");
  ok("sem preço da fase seguinte: envio bloqueado", await p.isDisabled("#enviar"));
  ok("nenhum wa.me aberto", wa.length === 0);
  await ctx.close();
}

// ----------------------------------------------------- portão e relógio --
{
  const { p, ctx } = await abrir({ query: "", relogio: "2026-11-16T07:30:00-03:00", semDataServidor: true });
  ok("antes das 8h: ofertas visíveis com preço de abertura", (await p.isVisible("main")) && (await p.textContent("#o-bussola [data-por]")).includes("797"));
  ok("um contador só (o do topo); a abertura não tem outro", (await p.locator("#contagem").count()) === 0 && /\d+h|\d+min/.test(await p.textContent("#relogio-tempo")), await p.textContent("#relogio-tempo"));
  await ctx.close();
}
{
  // celular com relógio 4h atrasado; servidor diz 10h: vale a hora do servidor
  const { p, ctx } = await abrir({
    query: "", relogio: "2026-11-16T22:00:00-03:00",
    rotaJson: (d) => d,
  });
  await p.unroute("**/bfa/ofertas.json*");
  await p.route("**/bfa/ofertas.json*", async (route) => {
    const resp = await route.fetch();
    const headers = { ...resp.headers(), date: new Date("2026-11-17T13:00:00Z").toUTCString() };
    delete headers["content-encoding"]; delete headers["content-length"];
    await route.fulfill({ status: 200, headers, body: await resp.text() });
  });
  await p.reload();
  await p.waitForTimeout(800);
  await p.clock.runFor(1500);
  await p.waitForTimeout(200);
  ok("relógio do celular errado: usa a hora do servidor (preço de 17/11)", (await p.textContent("#o-bussola [data-por]")).includes("977"), await p.textContent("#o-bussola [data-por]"));
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
  ok("cursos: só os dois pacotes, mesmo com o parâmetro antigo", (await p.locator("#cursos .oferta--pacote").count()) === 2 && (await p.isVisible("#o-pacote-astrologia")) && (await p.isVisible("#o-pacote-religiao")) && (await p.locator("#o-pacote-tudo").count()) === 0);
  await ctx.close();
  const b = await abrir();
  ok("cursos: Por que Astrologia Funciona? só dentro do Pacote Astrologia", (await b.p.locator("#o-curso-fundamentos").count()) === 0 && (await b.p.textContent("#o-pacote-astrologia .recibo")).includes("Por que Astrologia Funciona?"));
  ok("chamada mostra até 80% (fixo) e nenhum \"até 78\" na página", (await b.p.textContent("#max-off")) === "80" && !/até 78/i.test(await b.p.content()));
  await b.ctx.close();
}

// -------------------------------------------- ajustes de 16/11 (estrutura) --
{
  const { p, ctx, erros } = await abrir({ w: 1366, h: 768 });
  const html = await p.content();
  ok("nenhum 78% na página", !/78\s*%/.test(html.replace(/font-size:\.78rem/g, "")));
  ok("Pacote Astrologia mostra −80% e soma separada R$ 2.493", (await p.textContent("#o-pacote-astrologia [data-off]")).trim() === "−80%" && (await p.textContent("#o-pacote-astrologia .recibo__soma")).includes("2.493"));
  ok("seções sem numeração (01 / 06)", !/\d{2} \/ \d{2}/.test(await p.textContent("body")));
  ok("sem a seção Como funciona o pedido", (await p.locator(".como").count()) === 0 && !/Como funciona o pedido/.test(await p.textContent("body")));
  ok("abertura sem o segundo contador", (await p.locator(".abertura .contagem").count()) === 0);
  const selos = await p.$$eval(".selo-volta", (els) => els.map((e) => e.textContent.trim()));
  ok("selo da Bússola: Voltou depois de um ano (abertura e card)", selos.length === 2 && selos.every((t) => t === "Voltou depois de um ano"), JSON.stringify(selos));
  ok("mentoria: fundo preto com quadriculado", await p.evaluate(() => { const s = getComputedStyle(document.querySelector(".faixa-mentoria")); return s.backgroundColor === "rgb(0, 0, 0)" && s.backgroundImage.includes("svg"); }));
  ok("faixa vermelha por cima da seção seguinte", await p.evaluate(() => Number(getComputedStyle(document.querySelector(".fita-moldura")).zIndex) >= 10));
  ok("console limpo (estrutura)", !erros.length, erros.join(" | "));
  await ctx.close();
}

// --------------------------------------------- todas as mídias existem --
{
  const urls = new Set();
  for (const d of Object.values(DADOS.depoimentos)) for (const k of ["img", "mini", "mp4", "poster"]) if (d[k]) urls.add(d[k]);
  const ruins = [];
  for (const u of urls) { const r = await fetch(BASE + u, { method: "HEAD" }); if (r.status !== 200) ruins.push(`${r.status} ${u}`); }
  ok(`todas as ${urls.size} mídias de depoimento respondem 200`, !ruins.length, ruins.join(" | "));
  const r = await fetch(`${BASE}/bfa/assets/depoimentos/vicente.mp4?v=3`, { headers: { Range: "bytes=1000-1999" } });
  ok("vídeo responde a Range (206), condição para avançar o vídeo", r.status === 206 && (r.headers.get("content-range") || "").startsWith("bytes 1000-1999/"), `${r.status} ${r.headers.get("content-range")}`);
}

// ------------------------------------------ depoimentos nos cards (prints) --
{
  const { p, ctx, erros } = await abrir({ w: 1366, h: 768 });
  const comPrint = DADOS.itens.filter((i) => i.depoimento && DADOS.depoimentos[i.depoimento]?.tipo === "imagem");
  ok("8 cards com depoimento em print", comPrint.length === 8, comPrint.map((i) => i.id).join(","));
  const falhou = [];
  for (const i of comPrint) {
    const sel = `#o-${i.id} [data-video]`;
    await clicar(p, sel);
    await p.waitForTimeout(350);
    const st = await p.evaluate(() => { const d = document.querySelector("#video"), im = document.querySelector("#video-img"); return { aberto: d.open, foto: d.classList.contains("foto"), src: im.getAttribute("src") || "", carregou: im.complete && im.naturalWidth > 0, leg: document.querySelector("#video-leg").textContent }; });
    if (!st.aberto || !st.foto || !st.src.includes(i.depoimento) || !st.carregou) falhou.push(`${i.id}:${JSON.stringify(st)}`);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(250);
    const depois = await p.evaluate((s) => ({ fechado: !document.querySelector("#video").open, foco: document.activeElement === document.querySelector(s) }), sel);
    if (!depois.fechado || !depois.foco) falhou.push(`${i.id} ao fechar:${JSON.stringify(depois)}`);
  }
  ok("cada print abre por cima, carrega, fecha com Esc e devolve o foco", !falhou.length, falhou.join(" | "));
  // botão fechar com o mouse
  await clicar(p, "#o-revolucao-solar [data-video]");
  await p.waitForTimeout(300);
  await p.click("#fechar-video");
  await p.waitForTimeout(250);
  ok("botão fechar fecha o print", !(await p.evaluate(() => document.querySelector("#video").open)));
  // clique fora fecha
  await clicar(p, "#o-horaria [data-video]");
  await p.waitForTimeout(300);
  await p.mouse.click(5, 5);
  await p.waitForTimeout(250);
  ok("clique fora fecha o print", !(await p.evaluate(() => document.querySelector("#video").open)));
  ok("console limpo (prints)", !erros.length, erros.join(" | "));
  await ctx.close();
}

// ------------------------------------------ vídeo: abre, avança, fecha --
{
  const { p, ctx, erros } = await abrir({ w: 1366, h: 768 });
  await clicar(p, "#d-bussola [data-video]");
  await p.waitForFunction(() => { const v = document.querySelector("#video video"); return v && v.readyState >= 1 && v.duration > 30; }, null, { timeout: 15000 }).catch(() => {});
  const r = await p.evaluate(async () => {
    const v = document.querySelector("#video video");
    v.muted = true;
    const alvo = v.duration * 0.7;
    await new Promise((res) => { v.addEventListener("seeked", res, { once: true }); v.currentTime = alvo; setTimeout(res, 8000); });
    return { dur: v.duration, t: v.currentTime, alvo, seekFim: v.seekable.length ? v.seekable.end(0) : 0 };
  });
  ok("vídeo do Vicente avança para 70%", Math.abs(r.t - r.alvo) < 1.5 && r.seekFim > r.alvo, JSON.stringify(r));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  const fechado = await p.evaluate(() => { const v = document.querySelector("#video video"); return { aberto: document.querySelector("#video").open, pausado: v.paused, src: v.getAttribute("src") }; });
  ok("fechar vídeo para o som e solta o arquivo", !fechado.aberto && fechado.pausado && !fechado.src, JSON.stringify(fechado));
  // mentoria (horizontal) também abre e avança
  await clicar(p, '.depos [data-video="mentoria-01"]');
  await p.waitForFunction(() => { const v = document.querySelector("#video video"); return v && v.readyState >= 1 && v.duration > 30; }, null, { timeout: 15000 }).catch(() => {});
  const r2 = await p.evaluate(async () => { const v = document.querySelector("#video video"); v.muted = true; await new Promise((res) => { v.addEventListener("seeked", res, { once: true }); v.currentTime = 60; setTimeout(res, 8000); }); return v.currentTime; });
  ok("vídeo da mentoria avança para 1 min", Math.abs(r2 - 60) < 1.5, String(r2));
  await p.keyboard.press("Escape");
  ok("console limpo (vídeos)", !erros.length, erros.join(" | "));
  await ctx.close();
}

// ---------------------------------------------------------------- mural --
{
  const { p, ctx, erros } = await abrir({ w: 1366, h: 768 });
  ok("título do mural: O que falam de mim", (await p.textContent("#h-mural")).trim() === "O que falam de mim");
  const n = await p.locator(".mural__item").count();
  ok(`mural com os ${DADOS.mural.length} depoimentos que sobraram`, n === DADOS.mural.length, String(n));
  const usadosNosCards = new Set(DADOS.itens.map((i) => i.depoimento).filter(Boolean));
  ok("mural não repete o que já está nos cards", !DADOS.mural.some((id) => usadosNosCards.has(id) || ["mentoria-01", "mentoria-02", "vicente"].includes(id)));
  ok("mosaico em 3 colunas no desktop", (await p.locator(".mural__col").count()) === 3);
  ok("primeiros prints aparecem inteiros, sem corte", await p.$$eval(".mural__item img", (ims) => ims.slice(0, 6).every((i) => getComputedStyle(i).objectFit !== "cover" || i.closest(".mural__item--video"))));
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
  ok("sem rodapé", (await p.locator("footer.rodape").count()) === 0);
  ok("console limpo (mural)", !erros.length, erros.join(" | "));
  await ctx.close();
  const b = await abrir({ w: 390, h: 844 });
  ok("mosaico em 1 coluna no celular", (await b.p.locator(".mural__col").count()) === 1);
  await b.ctx.close();
}

// ----------------------------------------- todos os botões de todas as ofertas --
{
  const { p, ctx, erros, wa } = await abrir({ w: 1366, h: 900 });
  const ids = await p.$$eval("main [data-id]", (els) => els.filter((e) => e.offsetParent !== null).map((e) => e.getAttribute("data-id")));
  const visiveis = [...new Set(ids)];
  for (const id of visiveis) await clicar(p, `#o-${id} [data-add]`);
  const esperado = visiveis.reduce((s, id) => s + DADOS.itens.find((i) => i.id === id).precos.d16, 0);
  const brl = (v) => "R$ " + v.toLocaleString("pt-BR");
  ok(`Adicionar funciona em todas as ${visiveis.length} ofertas`, (await p.textContent("#barra-qtd")) === `${visiveis.length} itens no pedido` && (await p.textContent("#barra-total")) === brl(esperado), `${await p.textContent("#barra-qtd")} · ${await p.textContent("#barra-total")} (esperado ${brl(esperado)})`);
  // + e − em todas
  for (const id of visiveis) { const mais = p.locator(`#o-${id} [data-mais]`); if (await mais.isEnabled()) await clicar(p, `#o-${id} [data-mais]`); }
  for (const id of visiveis) { const menos = p.locator(`#o-${id} [data-menos]`); if (await menos.count()) await clicar(p, `#o-${id} [data-menos]`); }
  ok("+ e − voltam ao mesmo total", (await p.textContent("#barra-total")) === brl(esperado), await p.textContent("#barra-total"));
  // Ver detalhes abre e fecha em todos
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
  ok("folha lista todas as ofertas", (await p.locator("#pedido-lista > li").count()) === visiveis.length, String(await p.locator("#pedido-lista > li").count()));
  await clicar(p, "#enviar");
  await p.waitForTimeout(800);
  const t = textoWa(wa[0] || "https://wa.me/x");
  const nomes = visiveis.map((id) => DADOS.itens.find((i) => i.id === id).nome);
  ok("mensagem do WhatsApp com todas as ofertas e o total", nomes.every((n) => t.includes(n)) && t.includes(`Total: ${brl(esperado)}`), nomes.filter((n) => !t.includes(n)).join(","));
  ok("console limpo (todas as ofertas)", !erros.length, erros.join(" | "));
  await ctx.close();
}

// -------------------------------------------------------------- menu --
{
  const { p, ctx, erros } = await abrir({ w: 390, h: 844, movimento: true });
  const falhas = [];
  for (const s of DADOS.secoes) {
    await p.click(`.atalhos a[data-atalho="${s.id}"]`);
    await p.waitForTimeout(1300);
    const r = await p.evaluate((id) => { const el = document.getElementById(id); const top = el.getBoundingClientRect().top; const cab = document.querySelector(".topo").getBoundingClientRect().bottom; return { top: Math.round(top), cab: Math.round(cab), atual: document.querySelector(`.atalhos a[data-atalho="${id}"]`).getAttribute("aria-current") }; }, s.id);
    if (Math.abs(r.top - r.cab) > 90 || r.atual !== "true") falhas.push(`${s.id}:${JSON.stringify(r)}`);
  }
  ok("menu leva a cada seção e marca a atual", !falhas.length, falhas.join(" | "));
  ok("console limpo (menu)", !erros.length, erros.join(" | "));
  await ctx.close();
}

// ----------------------------------------------------- larguras e acessibilidade --
for (const [w, h, ua] of [[360, 640], [390, 844], [430, 932], [390, 664, UA_IG], [820, 1180], [1280, 720], [1366, 768], [1920, 1080]]) {
  const { p, ctx, erros } = await abrir({ w, h, ua, movimento: true, query: "agora=2026-11-16T10:00:00-03:00&previa=1" });
  await p.evaluate(() => document.querySelector(".painel-previa")?.remove());
  const vaz = await p.evaluate((largura) => Math.max(document.documentElement.scrollWidth, innerWidth) - largura, w);
  ok(`${w}×${h}${ua ? " (Instagram)" : ""}: sem rolagem lateral`, vaz <= 0, String(vaz));
  const dobra = await p.evaluate(() => {
    const h1 = document.querySelector("#h-abertura").getBoundingClientRect();
    const mini = document.querySelector("#d-bussola h2").getBoundingClientRect();
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
  await clicar(p, "#o-bussola [data-add]");
  await clicar(p, "#abrir-pedido");
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
  ok("sem JavaScript: ofertas e preços aparecem", t.includes("Bússola do Destino") && t.includes("797") && t.includes("Lux et Directio"));
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
