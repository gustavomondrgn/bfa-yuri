// Telas do vídeo explicativo: capturas 390×844 @3x da página com a posição dos botões tocados.
// node scripts/_telas-video.mjs <pasta-de-saida>
import { chromium } from "playwright-core";
import { writeFile, mkdir } from "node:fs/promises";

const OUT = process.argv[2];
await mkdir(OUT, { recursive: true });
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "pt-BR", timezoneId: "America/Sao_Paulo", reducedMotion: "reduce" });
const p = await ctx.newPage();
await p.goto("http://localhost:4174/bfa?previa=1&agora=2026-11-16T10:00:00-03:00");
await p.waitForTimeout(1500);
await p.evaluate(() => { document.querySelector(".painel-previa")?.remove(); localStorage.clear(); });
const caixa = async (sel) => { const r = await p.locator(sel).first().boundingBox(); return r && { x: r.x, y: r.y, w: r.width, h: r.height }; };
const info = {};
async function foto(nome, alvos = {}) {
  await p.evaluate(() => document.querySelector(".painel-previa")?.remove());
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/${nome}.png` });
  info[nome] = {};
  for (const [k, s] of Object.entries(alvos)) info[nome][k] = await caixa(s);
}
async function rolar(sel, topo = 150) {
  await p.evaluate(([s, t]) => { const el = document.querySelector(s); scrollTo(0, el.getBoundingClientRect().top + scrollY - t); }, [sel, topo]);
  await p.waitForTimeout(700);
}

await foto("01-hero", { oitenta: ".abertura__sub strong", selo: "#d-bussola .destaque__selo" });
await rolar("#o-bussola", 140);
await foto("02-bussola", { add: "#o-bussola [data-add]", card: "#o-bussola" });
await p.click("#o-bussola [data-add]");
await p.waitForTimeout(600);
await foto("03-bussola-1", { mais: "#o-bussola [data-mais]", qtd: "#o-bussola [data-qtd]", barra: "#barra" });
await p.click("#o-bussola [data-mais]");
await p.waitForTimeout(600);
await foto("04-bussola-2", { qtd: "#o-bussola [data-qtd]", barra: "#barra", total: "#barra-total" });
await rolar("#o-revolucao-solar", 140);
await foto("05-rs", { add: "#o-revolucao-solar [data-add]", card: "#o-revolucao-solar" });
await p.click("#o-revolucao-solar [data-add]");
await p.waitForTimeout(600);
await foto("06-rs-1", { finalizar: "#abrir-pedido", barra: "#barra", total: "#barra-total" });
await p.click("#abrir-pedido");
await p.waitForTimeout(900);
await foto("07-pedido", { enviar: "#enviar", lista: "#pedido-lista", total: "#pedido .pedido__pe" });
info.mensagem = await p.evaluate(() => window.__bfa.mensagem());
info.barraTotal = await p.textContent("#barra-total");
await p.keyboard.press("Escape");
await p.evaluate(() => scrollTo(0, 0));
await p.waitForTimeout(600);
await writeFile(`${OUT}/telas.json`, JSON.stringify(info, null, 1));
console.log(JSON.stringify(info, null, 1).slice(0, 1500));
await b.close();
