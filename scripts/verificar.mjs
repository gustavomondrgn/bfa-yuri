// =============================================================================
//  Verificação de /bfa-grupo com o Google Chrome instalado (playwright-core).
//
//    npm run verificar                               -> sobe o preview local e testa
//    BASE=http://localhost:8080 npm run verificar    -> testa outro servidor
//    BASE=https://yuridosanjos.com.br npm run verificar  -> testa produção
//
//  Nenhum teste entra no grupo nem envia evento para a Meta: o convite é
//  interceptado (resposta simulada) e todo pedido a domínios da Meta é
//  bloqueado. O teste "com Pixel" usa um ID fictício injetado só aqui, nunca
//  gravado no site, apenas para inspecionar a fila de chamadas do fbq.
//
//  Capturas e relatório em verificacao/.
// =============================================================================
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../", import.meta.url));
const SAIDA = fileURLToPath(new URL("../verificacao/", import.meta.url));
const AXE = fileURLToPath(new URL("../node_modules/axe-core/axe.min.js", import.meta.url));

const CONVITE = "https://chat.whatsapp.com/FGFkV5MuFd5G1dLnVXPola";
const ID_FICTICIO = "000000000000000";
const UTMS_PROPOSTAS =
  "utm_source=instagram&utm_medium=organic_social&utm_campaign=bf_apocaliptica_2026&utm_content=story_link";
const UTMS_DM =
  "utm_source=instagram&utm_medium=dm&utm_campaign=bf_apocaliptica_2026&utm_content=keyword_eu_quero";
const UA_INSTAGRAM =
  "Mozilla/5.0 (Linux; Android 14; SM-A146M Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 Instagram 352.0.0.40.97 Android";

const COPY = {
  brand: "Yuri dos Anjos",
  title: "Black Friday Apocalíptica",
  highlight: "Ofertas com até 80% de desconto.",
  text: "Dia 16/11, os preços saem primeiro no grupo do WhatsApp. Os maiores descontos ficam no primeiro dia.",
  cta: "ENTRAR NO GRUPO",
  support: "Você será direcionado para o grupo no WhatsApp.",
};

const resultados = [];
function registrar(nome, ok, detalhe = "") {
  resultados.push({ nome, ok, detalhe });
  console.log(`${ok ? "OK  " : "FALHA"}  ${nome}${detalhe ? `  —  ${detalhe}` : ""}`);
}

// ------------------------------------------------------------------ servidor --
let BASE = process.env.BASE?.replace(/\/$/, "");
let servidorLocal = null;

if (!BASE) {
  const porta = 4199;
  servidorLocal = spawn(process.execPath, ["scripts/preview.mjs"], {
    cwd: RAIZ,
    env: { ...process.env, PORT: String(porta) },
    stdio: "ignore",
  });
  BASE = `http://localhost:${porta}`;
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/healthz`);
      if (r.ok) break;
    } catch {
      /* ainda subindo */
    }
    await new Promise((ok) => setTimeout(ok, 100));
  }
}

const PAGINA = `${BASE}/bfa-grupo`;
const ehProducao = BASE.startsWith("https://");
await mkdir(SAIDA, { recursive: true });

// ------------------------------------------------------------- 1. rotas HTTP --
async function http(caminho, esperado, tipo) {
  const r = await fetch(`${BASE}${caminho}`, { redirect: "manual" });
  const ct = r.headers.get("content-type") || "";
  const ok = r.status === esperado && (!tipo || ct.includes(tipo));
  registrar(`HTTP ${caminho}`, ok, `${r.status} ${ct}`.trim());
  return r;
}

const principal = await http("/bfa-grupo", 200, "text/html");
await http("/bfa-grupo/", 200, "text/html");
await http(`/bfa-grupo?${UTMS_PROPOSTAS}`, 200, "text/html");
await http("/bfa-grupo/app.js?v=1", 200, "javascript");
await http("/bfa-grupo/assets/favicon.svg?v=1", 200, "image/svg+xml");
await http("/bfa-grupo/assets/og-bfa-grupo.png?v=1", 200, "image/png");
if (!ehProducao) await http("/healthz", 200);

{
  const h = principal.headers;
  const faltando = ["x-content-type-options", "x-frame-options", "referrer-policy"].filter((k) => !h.get(k));
  registrar("headers de segurança na página", faltando.length === 0, faltando.length ? `faltam ${faltando}` : "");
  registrar("HTML sem cache longo", /no-cache|max-age=0/.test(h.get("cache-control") || ""), h.get("cache-control") || "");
}

const html = await (await fetch(PAGINA)).text();
const idNoSite = (html.match(/<meta name="meta-pixel-id" content="([^"]*)"/) || [])[1] ?? null;
registrar("meta-pixel-id presente no HTML", idNoSite !== null, idNoSite ? `ID configurado (${idNoSite.length} dígitos)` : "vazio — Pixel desligado");
registrar("tamanho do HTML", html.length < 12000, `${(Buffer.byteLength(html) / 1024).toFixed(1)} KB sem compressão`);

// ----------------------------------------------------------------- navegador --
const navegador = await chromium.launch({ channel: "chrome" });

async function contexto(opcoes = {}) {
  const ctx = await navegador.newContext({
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    userAgent: UA_INSTAGRAM,
    locale: "pt-BR",
    ...opcoes,
  });
  const pedidosMeta = [];
  await ctx.route(/facebook\.(net|com)|fbcdn|meta\.com/, (rota) => {
    pedidosMeta.push(rota.request().url());
    return rota.abort();
  });
  await ctx.route("https://chat.whatsapp.com/**", (rota) =>
    rota.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>convite (simulado)</title>" }),
  );
  return { ctx, pedidosMeta };
}

async function caixas(pagina) {
  return pagina.evaluate(() => {
    const sel = { brand: ".brand", title: ".title", highlight: ".highlight", text: ".text", cta: ".cta", support: ".support" };
    const out = {};
    for (const [k, s] of Object.entries(sel)) {
      const r = document.querySelector(s).getBoundingClientRect();
      out[k] = { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    }
    out.viewport = { w: innerWidth, h: innerHeight };
    out.scrollW = document.documentElement.scrollWidth;
    // o body usa overflow-x: clip, então scrollWidth não denuncia vazamento:
    // mede a borda direita real de cada caixa e do texto dentro dela
    let direita = 0;
    for (const s of Object.values(sel)) {
      const el = document.querySelector(s);
      const faixa = document.createRange();
      faixa.selectNodeContents(el);
      direita = Math.max(direita, el.getBoundingClientRect().right, faixa.getBoundingClientRect().right);
    }
    out.direita = direita;
    return out;
  });
}

function vazamento(c) {
  return c.direita > c.viewport.w ? `conteúdo vaza à direita (${Math.round(c.direita)} > ${c.viewport.w})` : "";
}

function semSobreposicao(c) {
  const ordem = ["brand", "title", "highlight", "text", "cta", "support"];
  for (let i = 1; i < ordem.length; i++) {
    if (c[ordem[i]].top < c[ordem[i - 1]].bottom - 0.5) return `${ordem[i - 1]} encosta em ${ordem[i]}`;
  }
  return "";
}

// ------------------------------------------------- 2. conteúdo e um único CTA --
{
  const { ctx } = await contexto({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(PAGINA);
  const lido = await p.evaluate(() => ({
    brand: document.querySelector(".brand").innerText.trim(),
    // o &shy; do título é só ponto de quebra; não conta como texto
    title: document.querySelector("h1").innerText.replace(/­/g, "").trim(),
    highlight: document.querySelector(".highlight").innerText.trim(),
    text: document.querySelector(".text").innerText.trim(),
    cta: document.querySelector(".cta").innerText.trim(),
    support: document.querySelector(".support").innerText.trim(),
    links: [...document.querySelectorAll("a[href]")].map((a) => a.href),
    formularios: document.querySelectorAll("form, input, select, textarea, iframe, video, img").length,
    nav: document.querySelectorAll("nav, header nav, menu").length,
    focaveis: [...document.querySelectorAll("a[href], button, [tabindex]")].length,
  }));
  for (const k of Object.keys(COPY)) registrar(`copy: ${k}`, lido[k] === COPY[k], lido[k] === COPY[k] ? "" : `lido: "${lido[k]}"`);
  registrar("um único link na página", lido.links.length === 1, lido.links.join(", "));
  registrar("href do botão = convite completo", lido.links[0] === CONVITE, lido.links[0]);
  registrar("sem formulário, mídia, iframe ou menu", lido.formularios === 0 && lido.nav === 0);
  await ctx.close();
}

// ---------------------------------------- 3. larguras 360/390/430 e alturas --
const telas = [
  { nome: "360x640", width: 360, height: 640 },
  { nome: "360x560-instagram", width: 360, height: 560 },
  { nome: "390x844", width: 390, height: 844 },
  { nome: "390x664-instagram", width: 390, height: 664 },
  { nome: "430x932", width: 430, height: 932 },
  { nome: "430x752-instagram", width: 430, height: 752 },
];
const medidas = {};

for (const t of telas) {
  const { ctx } = await contexto({ viewport: { width: t.width, height: t.height } });
  const p = await ctx.newPage();
  await p.goto(`${PAGINA}?${UTMS_PROPOSTAS}`);
  const c = await caixas(p);
  medidas[t.nome] = c;
  const problemas = [];
  if (c.scrollW > c.viewport.w) problemas.push(`rolagem horizontal (${c.scrollW}px)`);
  if (vazamento(c)) problemas.push(vazamento(c));
  if (c.cta.bottom > c.viewport.h) problemas.push(`botão abaixo da dobra (${Math.round(c.cta.bottom)} > ${c.viewport.h})`);
  if (c.cta.height < 44 || c.cta.width < 44) problemas.push(`alvo pequeno ${c.cta.width}x${c.cta.height}`);
  const sobre = semSobreposicao(c);
  if (sobre) problemas.push(sobre);
  registrar(
    `tela ${t.nome}`,
    problemas.length === 0,
    problemas.join("; ") || `botão ${Math.round(c.cta.width)}×${Math.round(c.cta.height)} em y=${Math.round(c.cta.top)}–${Math.round(c.cta.bottom)}`,
  );
  await p.screenshot({ path: `${SAIDA}tela-${t.nome}.png` });
  await ctx.close();
}

// ------------------------------------------------ 4. zoom e fontes ampliadas --
const ampliacoes = [
  { nome: "zoom-200-390", viewport: { width: 195, height: 422 }, escala: null, exigeDobra: false },
  { nome: "fonte-130-360x640", viewport: { width: 360, height: 640 }, escala: "130%", exigeDobra: true },
  { nome: "fonte-200-360x640", viewport: { width: 360, height: 640 }, escala: "200%", exigeDobra: false },
];
for (const a of ampliacoes) {
  const { ctx } = await contexto({ viewport: a.viewport });
  const p = await ctx.newPage();
  await p.goto(PAGINA);
  if (a.escala) await p.addStyleTag({ content: `html{font-size:${a.escala} !important}` });
  const c = await caixas(p);
  const problemas = [];
  if (c.scrollW > c.viewport.w) problemas.push(`rolagem horizontal (${c.scrollW}px)`);
  if (vazamento(c)) problemas.push(vazamento(c));
  const sobre = semSobreposicao(c);
  if (sobre) problemas.push(sobre);
  const naDobra = c.cta.bottom <= c.viewport.h;
  if (a.exigeDobra && !naDobra) problemas.push("botão abaixo da dobra");
  registrar(
    `ampliação ${a.nome}`,
    problemas.length === 0,
    problemas.join("; ") || (naDobra ? "botão visível sem rolar" : `botão alcançável com rolagem (y=${Math.round(c.cta.top)})`),
  );
  await p.screenshot({ path: `${SAIDA}ampliacao-${a.nome}.png`, fullPage: true });
  await ctx.close();
}

// ------------------------------------------------ 5. sem JavaScript nenhum --
{
  const { ctx, pedidosMeta } = await contexto({ viewport: { width: 360, height: 640 }, javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto(PAGINA);
  await p.tap(".cta");
  await p.waitForURL(CONVITE, { timeout: 5000 }).catch(() => {});
  registrar("sem JavaScript: botão abre o convite", p.url() === CONVITE, p.url());
  registrar("sem JavaScript: nenhum pedido à Meta", pedidosMeta.length === 0);
  await ctx.close();
}

// ------------------------------------------------ 6. app.js indisponível --
{
  const { ctx } = await contexto({ viewport: { width: 360, height: 640 } });
  await ctx.route("**/bfa-grupo/app.js*", (r) => r.abort());
  const p = await ctx.newPage();
  await p.goto(PAGINA);
  await p.tap(".cta");
  await p.waitForURL(CONVITE, { timeout: 5000 }).catch(() => {});
  registrar("app.js falhou: botão abre o convite", p.url() === CONVITE, p.url());
  await ctx.close();
}

// ------------------------------------------ 7. Pixel como está no site --
{
  const { ctx, pedidosMeta } = await contexto({ viewport: { width: 360, height: 640 } });
  const p = await ctx.newPage();
  await p.goto(`${PAGINA}?${UTMS_PROPOSTAS}`);
  await p.waitForTimeout(400);
  const fila = await p.evaluate(() => (window.fbq ? (window.fbq.queue || []).map((a) => [...a]) : null));
  if (!idNoSite) {
    registrar("sem ID: nada da Meta é carregado", pedidosMeta.length === 0 && fila === null, pedidosMeta.join(", "));
  } else {
    registrar("com ID: fbevents.js solicitado (bloqueado no teste)", pedidosMeta.some((u) => u.includes("fbevents.js")));
    registrar("com ID: PageView na fila", !!fila && fila.some((a) => a[0] === "track" && a[1] === "PageView"));
  }
  const t0 = Date.now();
  await p.tap(".cta");
  await p.waitForURL(CONVITE, { timeout: 5000 }).catch(() => {});
  registrar("Pixel bloqueado: botão abre o convite", p.url() === CONVITE, `${Date.now() - t0} ms até a navegação`);
  await ctx.close();
}

// --------------------- 8. Pixel configurado (ID fictício, rede da Meta bloqueada) --
{
  const { ctx, pedidosMeta } = await contexto({ viewport: { width: 360, height: 640 } });
  await ctx.route(/\/bfa-grupo\/?(\?.*)?$/, async (rota) => {
    const resp = await rota.fetch();
    const corpo = (await resp.text()).replace(
      /<meta name="meta-pixel-id" content="[^"]*">/,
      `<meta name="meta-pixel-id" content="${ID_FICTICIO}">`,
    );
    return rota.fulfill({ response: resp, body: corpo });
  });
  const p = await ctx.newPage();
  const sujas =
    `${UTMS_PROPOSTAS}&utm_term=nao_deve_ir&fbclid=abc&email=teste%40exemplo.com` +
    `&utm_medium=x`; // duplicado: URLSearchParams.get pega o primeiro
  await p.goto(`${PAGINA}?${sujas}`);
  await p.waitForTimeout(300);
  const fila0 = await p.evaluate(() => window.fbq.queue.map((a) => JSON.parse(JSON.stringify([...a]))));
  const esperadoUtm = {
    utm_source: "instagram",
    utm_medium: "organic_social",
    utm_campaign: "bf_apocaliptica_2026",
    utm_content: "story_link",
  };
  const ordem = fila0.map((a) => `${a[0]}:${a[1]}`).join(" > ");
  registrar(
    "Pixel: autoConfig desligado antes do init",
    fila0[0]?.[0] === "set" && fila0[0]?.[1] === "autoConfig" && fila0[0]?.[2] === false && fila0[1]?.[0] === "init",
    ordem,
  );
  const pv = fila0.filter((a) => a[0] === "track" && a[1] === "PageView");
  registrar("Pixel: um PageView por visita", pv.length === 1);
  registrar("Pixel: PageView só com as 4 UTMs", JSON.stringify(pv[0]?.[2]) === JSON.stringify(esperadoUtm), JSON.stringify(pv[0]?.[2]));
  registrar("Pixel: nenhum Lead/compra", !fila0.some((a) => /Lead|Purchase|CompleteRegistration|Subscribe/.test(String(a[1]))));

  // cliques sem sair da página (só para contar eventos; o handler não depende disso)
  await p.evaluate(() => document.addEventListener("click", (e) => e.preventDefault(), true));
  const contar = () =>
    p.evaluate(() => window.fbq.queue.filter((a) => a[0] === "trackCustom" && a[1] === "WhatsAppGroupClick").length);

  await p.evaluate(() => {
    const b = document.querySelector(".cta");
    b.click();
    b.click();
  });
  registrar("clique duplo no mesmo instante = 1 evento", (await contar()) === 1, `${await contar()} evento(s)`);

  await p.waitForTimeout(1100);
  await p.focus(".cta");
  await p.keyboard.press("Enter");
  registrar("nova ação (teclado) = novo evento", (await contar()) === 2, `${await contar()} evento(s)`);

  const clique = await p.evaluate(() => window.fbq.queue.find((a) => a[0] === "trackCustom"));
  registrar(
    "WhatsAppGroupClick só com as 4 UTMs",
    JSON.stringify(clique?.[2]) === JSON.stringify(esperadoUtm),
    JSON.stringify(clique?.[2]),
  );
  registrar("nenhum evento chegou à Meta (rede bloqueada)", pedidosMeta.every((u) => u.includes("fbevents.js")), `${pedidosMeta.length} pedido(s) bloqueado(s)`);

  // navegação real com o Pixel configurado e bloqueado, vindo da DM da automação
  const p2 = await ctx.newPage();
  await p2.goto(`${PAGINA}?${UTMS_DM}`);
  await p2.waitForTimeout(200);
  const pvDm = await p2.evaluate(() => {
    const a = window.fbq.queue.find((x) => x[0] === "track" && x[1] === "PageView");
    return a ? JSON.parse(JSON.stringify(a[2])) : null;
  });
  registrar(
    "UTMs da DM (keyword_eu_quero) chegam ao PageView",
    pvDm?.utm_medium === "dm" && pvDm?.utm_content === "keyword_eu_quero",
    JSON.stringify(pvDm),
  );
  const t0 = Date.now();
  await p2.tap(".cta");
  await p2.waitForURL(CONVITE, { timeout: 5000 }).catch(() => {});
  registrar("Pixel configurado e bloqueado: botão abre o convite", p2.url() === CONVITE, `${Date.now() - t0} ms`);
  await ctx.close();
}

// ---------------------------------------------- 9. teclado e foco visível --
{
  const { ctx } = await contexto({ viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: false, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(PAGINA);
  await p.keyboard.press("Tab");
  const foco = await p.evaluate(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    return { cta: el.matches(".cta"), estilo: cs.outlineStyle, largura: cs.outlineWidth, cor: cs.outlineColor };
  });
  registrar("Tab leva direto ao botão, com foco visível", foco.cta && foco.estilo === "solid" && parseFloat(foco.largura) >= 2, `${foco.estilo} ${foco.largura} ${foco.cor}`);
  await p.screenshot({ path: `${SAIDA}foco-teclado-390.png` });
  await ctx.close();
}

// ------------------------------------------------------ 10. axe (WCAG A/AA) --
{
  const { ctx } = await contexto({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(PAGINA);
  await p.addScriptTag({ content: await readFile(AXE, "utf8") });
  const r = await p.evaluate(() =>
    window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } }),
  );
  const v = r.violations.map((x) => `${x.id} (${x.nodes.length})`);
  registrar("axe-core WCAG 2.2 A/AA + boas práticas", v.length === 0, v.join(", ") || `${r.passes.length} regras aprovadas`);
  await ctx.close();
}

// ------------------------------------------------------- 11. peso da página --
{
  const { ctx } = await contexto({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const tamanhos = [];
  p.on("response", async (resp) => {
    try {
      const corpo = await resp.body();
      tamanhos.push({ url: resp.url(), bytes: corpo.length });
    } catch {
      /* redirecionamentos não têm corpo */
    }
  });
  await p.goto(PAGINA, { waitUntil: "load" });
  await p.waitForTimeout(300);
  // o Cloudflare do domínio injeta o próprio analytics (beacon assíncrono);
  // não é deste app, então fica fora do orçamento e só é informado
  const doCloudflare = (u) => /cloudflareinsights\.com|\/cdn-cgi\//.test(u);
  const proprios = tamanhos.filter((t) => !doCloudflare(t.url));
  const injetados = tamanhos.filter((t) => doCloudflare(t.url));
  const total = proprios.reduce((s, t) => s + t.bytes, 0);
  const extra = injetados.reduce((s, t) => s + t.bytes, 0);
  registrar(
    "peso total sem Pixel",
    total < 40 * 1024,
    `${(total / 1024).toFixed(1)} KB em ${proprios.length} arquivo(s): ${proprios.map((t) => t.url.replace(BASE, "")).join(", ")}` +
      (injetados.length ? ` (+ ${(extra / 1024).toFixed(1)} KB do Cloudflare Web Analytics, assíncrono)` : ""),
  );
  await ctx.close();
}

await navegador.close();
if (servidorLocal) servidorLocal.kill();

const falhas = resultados.filter((r) => !r.ok);
await writeFile(`${SAIDA}relatorio.json`, JSON.stringify({ base: BASE, data: new Date().toISOString(), resultados, medidas }, null, 2));
console.log(`\n${resultados.length - falhas.length}/${resultados.length} verificações OK. Capturas em verificacao/.`);
process.exit(falhas.length ? 1 : 0);
