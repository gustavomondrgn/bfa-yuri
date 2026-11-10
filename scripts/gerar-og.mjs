// Gera site/assets/og-bfa-grupo.png (1200×630) a partir de scripts/og-image.html,
// usando o Google Chrome instalado na máquina.  ->  npm run og
import { chromium } from "playwright-core";
import { fileURLToPath, pathToFileURL } from "node:url";

const molde = fileURLToPath(new URL("./og-image.html", import.meta.url));
const saida = fileURLToPath(new URL("../site/assets/og-bfa-grupo.png", import.meta.url));

const navegador = await chromium.launch({ channel: "chrome" });
const pagina = await navegador.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await pagina.goto(pathToFileURL(molde).href);
await pagina.screenshot({ path: saida, type: "png" });
await navegador.close();

console.log(`og:image gerada em ${saida}`);
