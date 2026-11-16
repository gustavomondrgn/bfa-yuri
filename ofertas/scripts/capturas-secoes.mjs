// Capturas por seção no celular (390 px): node scripts/capturas-secoes.mjs [rotulo]
import { chromium } from "playwright-core";
const r = process.argv[2] || "s";
const BASE = process.env.BASE || "http://localhost:4174";
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await p.goto(`${BASE}/bfa?previa=1&agora=2026-11-16T10:00:00-03:00&esgotar=caixa-pandora`);
await p.evaluate(() => document.querySelector(".painel-previa")?.remove());
await p.waitForTimeout(1600);
await p.screenshot({ path: `verificacao/capturas/${r}-dobra.png` });
for (const sel of ["#prever", "#o-caixa-pandora", "#mentoria", "#cursos", "#o-curso-fundamentos"]) {
  await p.evaluate((s) => { const el = document.querySelector(s); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 110); }, sel);
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `verificacao/capturas/${r}-${sel.replace(/[^a-z]/g, "")}.png` });
}
await p.click("#o-bussola [data-add]");
await p.click("#o-raio-x [data-add]");
await p.waitForTimeout(600);
await p.screenshot({ path: `verificacao/capturas/${r}-barra.png` });
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(400);
await p.click("#d-bussola [data-video]");
await p.waitForTimeout(800);
await p.screenshot({ path: `verificacao/capturas/${r}-video.png` });
await b.close();
console.log("ok");
