// Prévia local da página B, sem Docker. Reproduz as rotas do nginx.conf.
//   node scripts/preview.mjs   ->  http://localhost:4175/bfa-b?previa=1
// Em produção a B lê o JSON ao vivo da A (/bfa/ofertas.json, mesmo domínio) e as
// vagas vendidas no CRM (/bfa-crm/api/vagas). Aqui os dois são imitados com o
// site/ofertas.json gerado (cópia de ../ofertas/dados/ofertas.json).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const SITE = resolve(fileURLToPath(new URL("../site/", import.meta.url)));
const PORT = Number(process.env.PORT) || 4175;
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8" };
// /bfa também: o site gerado com BFA_BASE=/bfa (o que vai para o ar) abre em http://localhost:4175/bfa
const PAGINA = new Set(["/bfa-b", "/bfa-b/", "/bfa-b/index.html", "/bfa", "/bfa/", "/bfa/index.html"]);
const JSONS = new Set(["/bfa-b/ofertas.json", "/bfa/ofertas.json"]);

function arquivoDe(c) {
  if (PAGINA.has(c)) return { arquivo: "index.html", cache: "no-cache" };
  if (JSONS.has(c)) return { arquivo: "ofertas.json", cache: "no-store" };
  const pre = c.startsWith("/bfa-b/") ? "/bfa-b/" : c.startsWith("/bfa/") ? "/bfa/" : null;
  if (!pre) return null;
  const alvo = normalize(join(SITE, c.slice(pre.length)));
  if (!alvo.startsWith(SITE + sep)) return null;
  return { arquivo: alvo.slice(SITE.length + 1), cache: "max-age=600" };
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const c = decodeURIComponent(url.pathname);
  if (c === "/healthz") { res.writeHead(200); return res.end("ok\n"); }
  if (c === "/" || c === "/index.html") { res.writeHead(302, { Location: "/bfa-b?previa=1" }); return res.end(); }
  // imita o CRM: vendidos = iniciais − vagas do ofertas.json, então a página mostra as mesmas vagas
  // imita o CRM (/bfa-crm/api/precos): nada salvo, valem os preços do ofertas.json
  if (c === "/bfa-crm/api/precos") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ precos: {}, atualizado: null }));
  }
  if (c === "/bfa-crm/api/vagas") {
    try {
      const D = JSON.parse(await readFile(join(SITE, "ofertas.json"), "utf8"));
      const vendidos = Object.fromEntries(D.itens.filter((i) => i.vagasIniciais != null && i.vagas != null).map((i) => [i.id, i.vagasIniciais - i.vagas]));
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({ vendidos, em: new Date().toISOString() }));
    } catch { res.writeHead(500); return res.end(); }
  }
  const alvo = arquivoDe(c);
  if (alvo) {
    try {
      let corpo = await readFile(join(SITE, alvo.arquivo));
      const tipo = TIPOS[extname(alvo.arquivo)] || "application/octet-stream";
      const extras = {};
      if (/text|javascript|json|svg/.test(tipo) && /gzip/.test(req.headers["accept-encoding"] || "")) {
        corpo = gzipSync(corpo, { level: 6 }); extras["Content-Encoding"] = "gzip"; extras["Vary"] = "Accept-Encoding";
      }
      // vídeo: responde a Range com 206, como o nginx (sem isso o Chrome não avança o vídeo)
      const faixa = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
      if (faixa && !extras["Content-Encoding"]) {
        const total = corpo.length;
        const ini = faixa[1] === "" ? total - Number(faixa[2]) : Number(faixa[1]);
        const fim = faixa[1] !== "" && faixa[2] !== "" ? Math.min(Number(faixa[2]), total - 1) : total - 1;
        if (ini >= total || ini < 0 || ini > fim) { res.writeHead(416, { "Content-Range": `bytes */${total}` }); return res.end(); }
        res.writeHead(206, { "Content-Type": tipo, "Content-Range": `bytes ${ini}-${fim}/${total}`, "Content-Length": fim - ini + 1, "Accept-Ranges": "bytes", "Cache-Control": alvo.cache });
        return res.end(req.method === "HEAD" ? undefined : corpo.subarray(ini, fim + 1));
      }
      if (!extras["Content-Encoding"]) extras["Accept-Ranges"] = "bytes";
      res.writeHead(200, { ...extras, "Content-Type": tipo, "Cache-Control": alvo.cache, "X-Content-Type-Options": "nosniff" });
      return res.end(req.method === "HEAD" ? undefined : corpo);
    } catch { /* 404 */ }
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("404\n");
}).listen(PORT, () => console.log(`/bfa-b em http://localhost:${PORT}/bfa-b?previa=1`));
