import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
await p.goto("http://localhost:4174/bfa?previa=1&agora=2026-11-16T10:00:00-03:00");
await p.waitForTimeout(600);
const info = await p.evaluate(() => { const s = document.querySelector('[data-atalho="amor"] svg'); const r = s.getBoundingClientRect(); return { w: r.width, h: r.height, disp: getComputedStyle(s).display, stroke: getComputedStyle(s.querySelector("circle")).stroke, op: getComputedStyle(s).opacity }; });
console.log(JSON.stringify(info));
await p.locator(".atalhos").screenshot({ path: "verificacao/capturas/menu.png" });
await b.close();
