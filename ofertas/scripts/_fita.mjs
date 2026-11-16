import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "chrome" });
for (const [w,h] of [[390,844],[1920,1080]]) {
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto("http://localhost:4174/bfa?previa=1&agora=2026-11-16T10:00:00-03:00");
await p.waitForTimeout(2000);
await p.evaluate(() => { const f = document.querySelector(".fita-moldura"); scrollTo(0, f.getBoundingClientRect().top + scrollY - 200); });
await p.waitForTimeout(800);
await p.screenshot({ path: `verificacao/capturas/fita-${w}.png`, clip: { x: 0, y: 100, width: w, height: 260 } });
const sx = await p.evaluate(() => document.documentElement.scrollWidth);
console.log(w, "scrollWidth", sx);
await p.close();
}
await b.close();
