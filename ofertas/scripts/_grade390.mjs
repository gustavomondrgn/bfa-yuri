import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto("http://localhost:4174/bfa?previa=1&agora=2026-11-16T10:00:00-03:00");
await p.waitForTimeout(1200);
await p.evaluate(() => { const el = document.querySelector("#mentoria"); scrollTo(0, el.getBoundingClientRect().top + scrollY - 100); });
await p.waitForTimeout(1500);
await p.screenshot({ path: "verificacao/capturas/grade-mentoria-390.png" });
await b.close();
