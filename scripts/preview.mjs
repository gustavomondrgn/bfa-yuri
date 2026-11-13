// =============================================================================
//  Preview local de /bfa-grupo, sem Docker e sem dependências.
//
//    node scripts/preview.mjs          ->  http://localhost:4173/bfa-grupo
//    PORT=5000 node scripts/preview.mjs
//
//  Reproduz as rotas do nginx.conf (sem e com stripprefix) servindo a pasta
//  site/ como ela vai para o container. Não substitui o teste no Coolify.
// =============================================================================
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

// SITE_DIR permite servir outra cópia (ex.: a versão anterior, para comparar)
const SITE = resolve(process.env.SITE_DIR || fileURLToPath(new URL("../site/", import.meta.url)));
const PORT = Number(process.env.PORT) || 4173;

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
};

const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const PAGINA = new Set(["/bfa-grupo", "/bfa-grupo/", "/bfa-grupo/index.html", "/", "/index.html"]);

function arquivoDe(caminho) {
  if (PAGINA.has(caminho)) return { arquivo: "index.html", cache: "no-cache" };

  let relativo = null;
  if (caminho.startsWith("/bfa-grupo/")) relativo = caminho.slice("/bfa-grupo/".length);
  else if (caminho.startsWith("/")) relativo = caminho.slice(1);
  if (!relativo) return null;

  const alvo = normalize(join(SITE, relativo));
  if (!alvo.startsWith(SITE + sep)) return null;
  return { arquivo: alvo.slice(SITE.length + 1), cache: "max-age=600" };
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  let caminho;
  try {
    caminho = decodeURIComponent(url.pathname);
  } catch {
    caminho = url.pathname;
  }

  if (caminho === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok\n");
  }

  const alvo = arquivoDe(caminho);
  if (alvo) {
    try {
      let corpo = await readFile(join(SITE, alvo.arquivo));
      const tipo = TIPOS[extname(alvo.arquivo)] || "application/octet-stream";
      const extras = {};
      // comprime texto como o nginx e o Cloudflare fazem em produção
      if (/text|javascript|svg/.test(tipo) && /gzip/.test(req.headers["accept-encoding"] || "")) {
        corpo = gzipSync(corpo, { level: 6 });
        extras["Content-Encoding"] = "gzip";
        extras["Vary"] = "Accept-Encoding";
      }
      res.writeHead(200, { ...HEADERS, ...extras, "Content-Type": tipo, "Cache-Control": alvo.cache });
      return res.end(req.method === "HEAD" ? undefined : corpo);
    } catch {
      /* cai no 404 */
    }
  }

  res.writeHead(404, { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" });
  res.end("404\n");
});

servidor.listen(PORT, () => {
  console.log(`/bfa-grupo em http://localhost:${PORT}/bfa-grupo`);
  console.log(
    `com UTMs: http://localhost:${PORT}/bfa-grupo?utm_source=instagram&utm_medium=organic_social&utm_campaign=bf_apocaliptica_2026&utm_content=story_link`,
  );
});
