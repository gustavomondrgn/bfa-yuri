// Capturas rápidas da prévia: node scripts/capturas.mjs [rotulo]
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
const BASE = process.env.BASE || "http://localhost:4174";
const OUT = new URL("../verificacao/capturas/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
await mkdir(OUT, { recursive: true });
const r = process.argv[2] || "v";
const b = await chromium.launch({ channel: "chrome" });
const telas = [["390", 390, 844, true], ["360", 360, 640, true], ["1280", 1280, 720, false], ["1366", 1366, 768, false]];
for (const [n, w, h, mob] of telas) {
  const p = await b.newPage({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1 });
  const erros = [];
  p.on("pageerror", (e) => erros.push(e.message));
  p.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  await p.goto(`${BASE}/bfa?previa=1&agora=2026-11-16T10:00:00-03:00`);
  await p.waitForTimeout(600);
  await p.evaluate(() => { const x = document.querySelector(".painel-previa"); if (x) x.setAttribute("data-recolhido", "1"); });
  await p.screenshot({ path: `${OUT}${r}-${n}-dobra.png` });
  if (n === "390") {
    await p.screenshot({ path: `${OUT}${r}-${n}-inteira.png`, fullPage: true });
    await p.click("#o-bussola [data-add]");
    await p.click("#o-raio-x [data-add]");
    await p.click("#o-raio-x [data-mais]");
    await p.locator("#o-bussola").scrollIntoViewIfNeeded();
    await p.click("#o-bussola summary");
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}${r}-${n}-card.png` });
    await p.click("#abrir-pedido");
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}${r}-${n}-pedido.png` });
  }
  const largura = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  console.log(n, "vazamento lateral:", largura, "erros:", erros.join(" | ") || "nenhum");
  await p.close();
}
await b.close();
