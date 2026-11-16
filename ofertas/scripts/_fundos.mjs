// Compara fundos da mentoria: node scripts/_fundos.mjs b-geometria c-luz ...
import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "chrome" });
for (const op of process.argv.slice(2)) {
  for (const [w, h] of [[1496, 792], [390, 844]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto("http://localhost:4174/bfa?previa=1&agora=2026-11-16T10:00:00-03:00");
    await p.addStyleTag({ content: `.faixa-mentoria.lux{background:#08080A url(/bfa/assets/lux/fundo-${op}.webp) center/cover no-repeat!important}` });
    await p.waitForTimeout(1200);
    await p.evaluate(() => { const el = document.querySelector("#mentoria"); scrollTo(0, el.getBoundingClientRect().top + scrollY - 100); });
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `verificacao/capturas/fundo-${op}-${w}.png` });
    await p.close();
  }
}
await b.close();
console.log("ok");
