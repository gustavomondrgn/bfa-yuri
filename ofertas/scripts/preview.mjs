// Preview local de /bfa, sem Docker. Reproduz as rotas do nginx.conf.
//   node scripts/preview.mjs   ->  http://localhost:4174/bfa?previa=1
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const SITE = resolve(fileURLToPath(new URL("../site/", import.meta.url)));
const PORT = Number(process.env.PORT) || 4174;
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4" };
const PAGINA = new Set(["/bfa", "/bfa/", "/bfa/index.html", "/", "/index.html"]);

function arquivoDe(c) {
  if (PAGINA.has(c)) return { arquivo: "index.html", cache: "no-cache" };
  if (c === "/bfa/ofertas.json" || c === "/ofertas.json") return { arquivo: "ofertas.json", cache: "no-store" };
  let rel = null;
  if (c.startsWith("/bfa/")) rel = c.slice(5);
  else if (c.startsWith("/") && !c.startsWith("/bfa-grupo")) rel = c.slice(1);
  if (!rel) return null;
  const alvo = normalize(join(SITE, rel));
  if (!alvo.startsWith(SITE + sep)) return null;
  return { arquivo: alvo.slice(SITE.length + 1), cache: "max-age=600" };
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const c = decodeURIComponent(url.pathname);
  if (c === "/healthz") { res.writeHead(200); return res.end("ok\n"); }
  const alvo = arquivoDe(c);
  if (alvo) {
    try {
      let corpo = await readFile(join(SITE, alvo.arquivo));
      const tipo = TIPOS[extname(alvo.arquivo)] || "application/octet-stream";
      const extras = {};
      if (/text|javascript|json|svg/.test(tipo) && /gzip/.test(req.headers["accept-encoding"] || "")) {
        corpo = gzipSync(corpo, { level: 6 }); extras["Content-Encoding"] = "gzip"; extras["Vary"] = "Accept-Encoding";
      }
      res.writeHead(200, { ...extras, "Content-Type": tipo, "Cache-Control": alvo.cache, "X-Content-Type-Options": "nosniff" });
      return res.end(req.method === "HEAD" ? undefined : corpo);
    } catch { /* 404 */ }
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("404\n");
}).listen(PORT, () => console.log(`/bfa em http://localhost:${PORT}/bfa?previa=1`));
