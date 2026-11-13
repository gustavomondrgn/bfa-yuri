// =============================================================================
//  Medição de velocidade de /bfa-grupo em celular com rede lenta.
//
//    node scripts/medir-velocidade.mjs --base http://localhost:4173 --rotulo local-depois
//    node scripts/medir-velocidade.mjs --base https://yuridosanjos.com.br --rotulo producao-antes
//
//  Cada rodada abre um navegador limpo (sem cache, sem conexão reaproveitada),
//  com tela de celular, CPU 4× mais lenta e o perfil de rede indicado.
//  O fbevents.js real da Meta é baixado (com a rede limitada), mas os eventos
//  para facebook.com/tr são interceptados e respondidos aqui: nada chega ao
//  Pixel nem às campanhas. Mede quando o botão aparece e quando o PageView
//  sairia do navegador.
//  Resultado em verificacao/velocidade-<rotulo>.json.
// =============================================================================
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 ? process.argv[i + 1] : padrao;
};
const BASE = arg("base", "http://localhost:4173").replace(/\/$/, "");
const ROTULO = arg("rotulo", "medicao");
const RODADAS = Number(arg("rodadas", "7"));
const ENDERECO =
  `${BASE}/bfa-grupo?utm_source=instagram&utm_medium=paid_social` +
  `&utm_campaign=bfa_2026_captacao&utm_content=medicao`;
const SAIDA = fileURLToPath(new URL("../verificacao/", import.meta.url));

// perfis de rede (latência por requisição, banda em bytes/s)
const PERFIS = [
  { nome: "sem limite", rede: null },
  { nome: "4G lento", rede: { latency: 150, downloadThroughput: (1.6e6 / 8) * 0.9, uploadThroughput: (750e3 / 8) * 0.9 } },
  { nome: "3G", rede: { latency: 400, downloadThroughput: (400e3 / 8) * 0.9, uploadThroughput: (400e3 / 8) * 0.9 } },
];
const CPU = 4;

const mediana = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return Math.round(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2);
};

const navegador = await chromium.launch({ channel: "chrome" });
const resultado = { base: BASE, rotulo: ROTULO, data: new Date().toISOString(), cpu: CPU, perfis: [] };

for (const perfil of PERFIS) {
  const rodadas = [];
  for (let i = 0; i < RODADAS; i++) {
    const ctx = await navegador.newContext({
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
      viewport: { width: 390, height: 664 },
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; SM-A146M; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 Instagram 352.0.0.40.97 Android",
    });
    let pageViewEm = null;
    // configuração do Pixel carregada = momento em que o PageView sai. Fora do
    // domínio liberado no Pixel (ex.: localhost) a Meta não envia o evento,
    // então no preview local este é o marco comparável.
    let pixelProntoEm = null;
    ctx.on("requestfinished", (r) => {
      if (pixelProntoEm === null && /connect\.facebook\.net\/signals\/config\//.test(r.url())) pixelProntoEm = Date.now();
    });
    await ctx.route(/^https:\/\/[a-z.]*facebook\.com\//, (rota) => {
      const url = rota.request().url();
      const corpo = rota.request().postData() || "";
      if (/facebook\.com\/tr\b/.test(url)) {
        if (pageViewEm === null && (/[?&]ev=PageView\b/.test(url) || /name="ev"\r?\n\r?\nPageView/.test(corpo) || /(^|&)ev=PageView\b/.test(corpo))) {
          pageViewEm = Date.now();
        }
        return rota.fulfill({ status: 200, contentType: "image/gif", body: "" });
      }
      return rota.abort();
    });

    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
    if (perfil.rede) {
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, ...perfil.rede });
    }

    await p.goto(ENDERECO, { waitUntil: "load", timeout: 60000 });
    const limite = Date.now() + 20000;
    while (pageViewEm === null && Date.now() < limite) {
      if (pixelProntoEm !== null && Date.now() - pixelProntoEm > 1500) break; // fora do domínio liberado
      await p.waitForTimeout(50);
    }

    const m = await p.evaluate(
      () =>
        new Promise((ok) => {
          let lcp = null;
          new PerformanceObserver((l) => {
            const e = l.getEntries();
            lcp = e[e.length - 1].startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
          setTimeout(() => {
            const n = performance.getEntriesByType("navigation")[0];
            const fcp = performance.getEntriesByName("first-contentful-paint")[0];
            ok({
              origem: performance.timeOrigin,
              primeiroByte: n.responseStart,
              htmlCompleto: n.responseEnd,
              botaoVisivel: fcp ? fcp.startTime : null,
              maiorPintura: lcp,
              domPronto: n.domContentLoadedEventEnd,
              carregada: n.loadEventEnd,
              bytes: n.transferSize,
            });
          }, 100);
        }),
    );
    rodadas.push({
      ...m,
      pixelPronto: pixelProntoEm ? pixelProntoEm - m.origem : null,
      pageView: pageViewEm ? pageViewEm - m.origem : null,
    });
    await ctx.close();
  }

  const resumo = {};
  for (const k of ["primeiroByte", "htmlCompleto", "botaoVisivel", "maiorPintura", "domPronto", "carregada", "pixelPronto", "pageView"]) {
    resumo[k] = mediana(rodadas.map((r) => r[k]));
  }
  resultado.perfis.push({ perfil: perfil.nome, rodadas, mediana: resumo });
  console.log(
    `${ROTULO} | ${perfil.nome.padEnd(10)} | 1º byte ${resumo.primeiroByte} | botão visível ${resumo.botaoVisivel}` +
      ` | Pixel pronto ${resumo.pixelPronto ?? "—"} | PageView ${resumo.pageView ?? "—"} | carregada ${resumo.carregada}  (ms, medianas de ${RODADAS})`,
  );
}

await navegador.close();
await mkdir(SAIDA, { recursive: true });
await writeFile(`${SAIDA}velocidade-${ROTULO}.json`, JSON.stringify(resultado, null, 2));
