// Copia o app.js da página A e adapta para a página B (/bfa-b).
// Cada troca precisa acontecer exatamente uma vez; se a A mudar um desses trechos,
// o script para com FALHOU e mostra qual (aí é ajustar a troca aqui).
//   node scripts/sincronizar-app.cjs      ->  ../ofertas/src/app.js  =>  src/app.js
const fs = require("fs");
const path = require("path");
const arq = process.argv[2] || path.join(__dirname, "../src/app.js");
let s = fs.readFileSync(process.argv[2] ? arq : path.join(__dirname, "../../ofertas/src/app.js"), "utf8");
function troca(de, para) {
  const n = s.split(de).length - 1;
  if (n !== 1) { console.error("FALHOU (" + n + "x): " + de.slice(0, 90)); process.exit(1); }
  s = s.replace(de, () => para);
}

troca('var CHAVE = "bfa-pedido-v1";',
  '// página B: pedido salvo à parte (não mistura com o da /bfa no mesmo aparelho)\n  var CHAVE = "bfa-b-pedido-v1";');
troca('var JSON_URL = "/bfa/ofertas.json";',
  '// dados ao vivo da página A (mesmo domínio); se não houver, o reserva gerado com a B\n  var JSON_URLS = ["/bfa/ofertas.json", "/bfa-b/ofertas.json"];\n  // a mídia da A mora em /bfa/assets; aqui, a mesma cópia está em /bfa-b/assets\n  function midia(u) { return String(u || "").replace(/^\\/bfa\\//, "/bfa-b/"); }');

// busca com reserva: tenta a A, depois a cópia da B
troca('return fetch(JSON_URL + "?t=" + Date.now(), { cache: "no-store", signal: ctrl ? ctrl.signal : undefined })\n      .then(function (r) {',
  'var pegar = function (k) {\n      return fetch(JSON_URLS[k] + "?t=" + Date.now(), { cache: "no-store", signal: ctrl ? ctrl.signal : undefined })\n        .then(function (r) { if (!r.ok && k + 1 < JSON_URLS.length) return pegar(k + 1); return r; }, function (e) { if (k + 1 < JSON_URLS.length && !(ctrl && ctrl.signal.aborted)) return pegar(k + 1); throw e; });\n    };\n    return pegar(0)\n      .then(function (r) {');

// chamada "até 80%": também o número gigante decorativo da abertura
troca('if (D.chamadaDesconto) $("#max-off").textContent = D.chamadaDesconto;',
  'if (D.chamadaDesconto) {\n      $("#max-off").textContent = D.chamadaDesconto;\n      var gig = $("[data-gigante]");\n      if (gig && gig.textContent !== D.chamadaDesconto + "%") gig.innerHTML = (D.chamadaDesconto + "%").split("").map(function (c, k) { return \'<span style="--i:\' + k + \'">\' + c + "</span>"; }).join("");\n    }');

// revelação na rolagem: na B quem cuida é o movimento.js (GSAP + ScrollTrigger)
const ini = s.indexOf("  // ------------------------------------------- revelação suave na rolagem --");
const fim = s.indexOf("  // ---------------------------------------------------- vídeo de depoimento --");
if (ini < 0 || fim < 0) { console.error("FALHOU: bloco de revelação"); process.exit(1); }
s = s.slice(0, ini) + "  // revelação na rolagem: na página B, em movimento.js (GSAP + ScrollTrigger, desligado com reduzir movimento)\n\n" + s.slice(fim);

// caminhos da mídia no player
troca('img.src = d.img; img.width = d.w; img.height = d.h;', 'img.src = midia(d.img); if (d.w) img.width = d.w; if (d.h) img.height = d.h;');
troca('vid.poster = d.poster || ""; vid.src = d.mp4;', 'vid.poster = midia(d.poster); vid.src = midia(d.mp4);');

fs.writeFileSync(arq, s);
console.log("src/app.js da B sincronizado com a A e adaptado");
