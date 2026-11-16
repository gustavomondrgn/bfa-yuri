// Mede o respiro do bloco de texto da abertura: node scripts/_medir-abertura.mjs [capturar]
import { chromium } from "playwright-core";
const cap = process.argv[2] === "capturar";
const b = await chromium.launch({ channel: "chrome" });
for (const [w, h] of [[1496, 792], [1366, 768], [1280, 720], [1920, 1080], [1000, 800], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto("http://localhost:4174/bfa?previa=1&agora=2026-11-16T10:00:00-03:00");
  await p.waitForTimeout(2200);
  const m = await p.evaluate(() => {
    document.querySelector(".fita-moldura").style.pointerEvents = "auto";
    const topo = document.querySelector(".topo").getBoundingClientRect().bottom;
    const bloco = document.querySelector(".abertura__dentro > div");
    const sob = bloco.querySelector(".sobretitulo").getBoundingClientRect();
    const cont = bloco.querySelector(".contagem").getBoundingClientRect();
    const x = Math.round((sob.left + cont.right) / 2);
    // primeira linha vermelha da faixa descendo na coluna x
    let fitaY = null;
    for (let y = Math.round(cont.bottom); y < cont.bottom + 400; y++) {
      const el = document.elementFromPoint(x, y);
      if (el && el.closest(".fita")) { fitaY = y; break; }
    }
    // a faixa cobre o que vem depois? testa o ponto mais baixo da faixa na ponta esquerda
    const f = document.querySelector(".fita").getBoundingClientRect();
    const ponta = document.elementFromPoint(4, Math.round(f.bottom) - 3);
    return { topo: Math.round(topo), blocoTopo: Math.round(sob.top), blocoBase: Math.round(cont.bottom), fitaY, acima: Math.round(sob.top - topo), abaixo: fitaY && Math.round(fitaY - cont.bottom), pontaEsquerdaEhFita: !!(ponta && ponta.closest(".fita")) };
  });
  console.log(w + "x" + h, JSON.stringify(m));
  if (cap) await p.screenshot({ path: `verificacao/capturas/abertura-${w}x${h}.png` });
  await p.close();
}
await b.close();
