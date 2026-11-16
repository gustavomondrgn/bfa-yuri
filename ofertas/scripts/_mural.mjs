// Capturas do mural: node scripts/_mural.mjs
import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "chrome" });
for (const [w, h] of [[1366, 768], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const erros = []; p.on("pageerror", (e) => erros.push(e.message)); p.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  await p.goto("http://localhost:4174/bfa?previa=1&agora=2026-11-16T10:00:00-03:00");
  await p.waitForTimeout(1200);
  await p.evaluate(() => { const el = document.querySelector(".mural"); scrollTo(0, el.getBoundingClientRect().top + scrollY - 100); });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `verificacao/capturas/mural-1-${w}.png` });
  await p.evaluate(() => scrollBy(0, innerHeight * 0.9)); await p.waitForTimeout(1200);
  await p.screenshot({ path: `verificacao/capturas/mural-2-${w}.png` });
  await p.evaluate(() => { const el = document.querySelector("#mural-mais"); el.scrollIntoView({ block: "center" }); }); await p.waitForTimeout(1200);
  await p.screenshot({ path: `verificacao/capturas/mural-fim-${w}.png` });
  const info = await p.evaluate(() => ({ cols: document.querySelectorAll(".mural__col").length, recolhido: document.querySelector("#mural-corpo").classList.contains("recolhido"), btn: !document.querySelector("#mural-mais").hidden, sx: document.documentElement.scrollWidth }));
  console.log(w, JSON.stringify(info), "erros", JSON.stringify(erros));
  await p.close();
}
await b.close();
