// Capturas de conferência no desktop: node scripts/_debug.mjs [rotulo]
import { chromium } from "playwright-core";
const r = process.argv[2] || "d";
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
await p.goto("http://localhost:4174/bfa?previa=1&agora=2026-11-16T10:00:00-03:00");
await p.waitForTimeout(1500);
await p.screenshot({ path: `verificacao/capturas/${r}-topo.png`, clip: { x: 0, y: 0, width: 1366, height: 200 } });
await p.evaluate(() => { const el = document.querySelector("#mentoria"); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 90); });
await p.waitForTimeout(1500);
await p.screenshot({ path: `verificacao/capturas/${r}-mentoria-1.png` });
await p.evaluate(() => window.scrollBy(0, 560));
await p.waitForTimeout(1500);
await p.screenshot({ path: `verificacao/capturas/${r}-mentoria-2.png` });
await b.close();
console.log("ok");
