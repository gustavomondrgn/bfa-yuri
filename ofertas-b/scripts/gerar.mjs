// =============================================================================
//  Página B (/bfa-b) · gera site/index.html a partir dos dados da página A.
//    node scripts/gerar.mjs
//  Fonte única: ../ofertas/dados/ofertas.json (preços, fases, vagas, textos e
//  depoimentos são os mesmos da A). Nada de cópia manual do JSON: o site/ofertas.json
//  daqui é só o reserva gerado a cada build.
//  Mídia (vídeos, capas, águia, Newsreader) vem de ../ofertas/site/assets/.
//  O HTML sai com os preços da primeira fase e funciona sem JavaScript.
// =============================================================================
import { readFile, writeFile, mkdir, copyFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const A_DADOS = raiz("../ofertas/dados/ofertas.json");
const A_ASSETS = raiz("../ofertas/site/assets/");
const D = JSON.parse(await readFile(A_DADOS, "utf8"));
// 17/11: a B vira a /bfa. BFA_BASE=/bfa gera com os caminhos e a chave do carrinho da A (a do ar, para
// ninguém perder o carrinho); sem a variável continua /bfa-b (prévia local e testes).
const BASE = /(^|\/)bfa$/.test(process.env.BFA_BASE || "") ? "/bfa" : "/bfa-b"; // (o Git Bash reescreve "/bfa" como caminho)
const naBase = (s) => (BASE === "/bfa-b" ? s : s.split("/bfa-b/").join("/bfa/").split('"bfa-b-pedido-v1"').join('"bfa-pedido-v1"'));
// player dos depoimentos: o mesmo da A, lido direto de ../ofertas/src (não há cópia)
const css = naBase((await readFile(raiz("src/estilo.css"), "utf8")) + "\n" + (await readFile(raiz("../ofertas/src/player.css"), "utf8")));
const js = naBase((await readFile(raiz("../ofertas/src/player.js"), "utf8")) + "\n" + (await readFile(raiz("src/app.js"), "utf8")));
const mov = naBase(await readFile(raiz("src/movimento.js"), "utf8"));

const hash = (s) => createHash("sha1").update(s).digest("hex").slice(0, 8);
const vJs = hash(js), vMov = hash(mov);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const brl = (n) => n.toLocaleString("pt-BR");
const off = (ref, v) => Math.round((1 - v / ref) * 100);
// a A usa /bfa/assets/...; aqui a mesma mídia mora em /bfa-b/assets/...
const midia = (u) => String(u || "").replace(/^\/bfa\//, "/bfa-b/");
const F0 = D.fases[0];
const itens = Object.fromEntries(D.itens.map((i) => [i.id, i]));
const C = 2 * Math.PI * 7;
const maxOff = D.chamadaDesconto ?? 80;

// palavras com máscara (revelação tipográfica: cada palavra sobe de dentro da linha).
// Palavra de até 2 letras vai junto com a seguinte (a última, com a anterior), para
// não sobrar "O" ou "é" sozinho no fim da linha; o espaço é normal, então a máscara
// ainda quebra por dentro se a tela for estreita demais.
const curta = (w) => w.replace(/[^\p{L}\p{N}]/gu, "").length <= 2;
function unidades(texto) {
  const ws = String(texto).split(/\s+/).filter(Boolean), us = [];
  for (let k = 0; k < ws.length; k++) {
    let u = ws[k];
    while (curta(ws[k]) && k + 1 < ws.length) u += " " + ws[++k];
    us.push(u);
  }
  if (us.length > 1 && curta(us[us.length - 1])) { const fim = us.pop(); us[us.length - 1] += " " + fim; }
  return us;
}
function mascaras(texto, base = 0) {
  return unidades(texto).map((w, k) => `<span class="m"><span style="--i:${base + k}">${esc(w)}</span></span>`).join(" ");
}
// palavras soltas para o realce progressivo na rolagem (mentoria)
const luz = (texto) => esc(texto).split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(" ");

// ------------------------------------------------------------- componentes --
function precoHtml(i) {
  const v = i.precos[F0.id];
  const de = i.curso && !i.avulso
    ? `${esc(i.referenciaTexto || "Separados, somam")} <s>R$&nbsp;${brl(i.referencia)}</s>`
    : `De <s>R$&nbsp;${brl(i.referencia)}</s> por`;
  return `<div class="preco" data-preco><span class="preco__de" data-de>${de}</span><strong class="preco__por" data-por><small>R$</small>${brl(v)}</strong><span class="preco__off" data-off>−${off(i.referencia, v)}%</span></div>`;
}

function vagasHtml(i) {
  const livre = i.vagas == null;
  const frac = livre ? 1 : i.vagas / i.vagasIniciais;
  const txt = livre ? "Sem limite de vagas" : `<b>${i.vagas}</b> vagas nesta Black Friday`;
  return `<p class="vagas" data-vagas data-estado="${livre ? "livre" : "ok"}"><svg viewBox="0 0 18 18" aria-hidden="true"><circle class="v-fundo" cx="9" cy="9" r="7"/><circle class="v-arco" cx="9" cy="9" r="7" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - frac)).toFixed(2)}"/></svg><span>${txt}</span></p>`;
}

function acoesHtml(i) {
  return `<div class="acoes">
<button type="button" class="btn btn-add" data-add>Adicionar ao pedido</button>
<div class="qtd" role="group" aria-label="Quantidade de ${esc(i.nome)}">
<button type="button" data-menos aria-label="Tirar um ${esc(i.nome)}">−</button>
<output data-qtd>1<span>no pedido</span></output>
<button type="button" data-mais aria-label="Mais um ${esc(i.nome)}">+</button>
</div>
</div>`;
}

function rodapeHtml(i, comVagas = true) {
  return `<div class="oferta__rodape">${precoHtml(i)}${comVagas ? vagasHtml(i) : ""}${acoesHtml(i)}<span class="esgotado-selo" aria-hidden="true"><b>Esgotado</b></span></div>`;
}

function depoisDe(i) {
  const base = ["Você envia o pedido pelo WhatsApp, com os itens e o total já escritos.", "O atendimento confere a vaga e manda o link de pagamento, que vale para o mesmo dia."];
  if (i.curso) return [...base, "O acesso aos cursos, pela Kiwify, é liberado depois do fim da Black Friday, a partir de 20/11."];
  if (i.id === "mentoria") return [...base, "Depois do pagamento, vocês combinam o início dos encontros."];
  if (/Vídeo/.test(i.formato)) return [...base, "Depois do pagamento, vocês combinam o dia da consulta e você conta o que quer priorizar."];
  return [...base, "Depois do pagamento, o atendimento pede seus dados de nascimento e o que você quer ver na leitura."];
}

function provaHtml(i) {
  if (!i.prova || !D.provas || !D.provas[i.prova]) return "";
  const p = D.provas[i.prova];
  return `<blockquote class="citacao" data-prova="${esc(i.prova)}"${p.ativo ? "" : " hidden"}><p>“${esc(p.citacao)}”</p><footer>${esc(p.autor)}, ${esc(p.contexto)}</footer></blockquote>`;
}

function detalhesHtml(i, extra = "") {
  const recebe = i.recebe ? `<div><h4 class="mono">O que você recebe</h4><ul class="recebe">${i.recebe.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>` : "";
  return `<details class="mais">
<summary>Ver detalhes<span class="sr"> de ${esc(i.nome)}</span></summary>
<div class="mais__corpo">
${(i.descricao || []).map((p) => `<p>${esc(p)}</p>`).join("\n")}
${provaHtml(i)}
${recebe}
${extra}
<div><h4 class="mono">Depois do pedido</h4><ol class="depois">${depoisDe(i).map((p) => `<li>${esc(p)}</li>`).join("")}</ol></div>
</div>
</details>`;
}

function tagsHtml(i) {
  return `<p class="tags"><span class="tag tag--fmt">${esc(i.formato)}</span><span class="tag">${esc(i.detalhe)}</span></p>`;
}

function cardHtml(i) {
  const cen = i.cenario ? ` data-so-cenario="${i.cenario}"` : "";
  return `<article class="oferta${i.selo ? " oferta--selo" : ""}" id="o-${i.id}" data-id="${i.id}"${cen} aria-labelledby="t-${i.id}">
${i.selo ? `<span class="oferta__marca selo-volta">${esc(i.selo)}</span>` : ""}
<div class="oferta__corpo">
${tagsHtml(i)}
<h3 id="t-${i.id}">${esc(i.nome)}${i.subnome ? `<small>${esc(i.subnome)}</small>` : ""}</h3>
<p class="oferta__para">${esc(i.paraQuem)}</p>
${i.depoimento ? depoHtml(i.depoimento, "chip") : ""}
${rodapeHtml(i)}
</div>
${detalhesHtml(i)}
</article>`;
}

// ------------------------------------------------------------------ cursos --
function grupos(i) { return i.cursosDe ? i.cursosDe.map((id) => itens[id]).filter(Boolean) : [i]; }
function reciboHtml(i) {
  const gs = grupos(i);
  const lis = gs.map((g) => `${i.cursosDe ? `<li class="recibo__grupo mono">${esc(g.nome.replace("Pacote ", ""))}</li>` : ""}${(g.cursos || []).map(([n, v]) => `<li><span>${esc(n)}</span><em>R$&nbsp;${brl(v)}</em></li>`).join("")}`).join("");
  return `<ul class="recibo" aria-label="Cursos do ${esc(i.nome)}">${lis}<li class="recibo__soma"><span>Separados</span><s>R$&nbsp;${brl(i.referencia)}</s></li></ul>`;
}
function cursosDescHtml(i) {
  return `<div><h4 class="mono">O que tem em cada curso</h4><ul class="cursos-desc">${grupos(i).flatMap((g) => g.cursos || []).map(([n, , t]) => `<li><b>${esc(n)}</b><span>${esc(t || "")}</span></li>`).join("")}</ul></div>`;
}
function pacoteHtml(i) {
  const cen = i.cenario ? ` data-so-cenario="${i.cenario}"` : "";
  return `<article class="oferta oferta--pacote" id="o-${i.id}" data-id="${i.id}"${cen} aria-labelledby="t-${i.id}">
<div class="oferta__corpo">
<p class="tags"><span class="tag tag--fmt">${esc(i.subnome || "")}</span><span class="tag">Gravados · no seu ritmo</span></p>
<h3 id="t-${i.id}">${esc(i.nome)}</h3>
<p class="oferta__para">${esc(i.paraQuem)}</p>
${reciboHtml(i)}
<div class="oferta__rodape"><div class="preco" data-preco><span class="preco__de" data-de>No pacote, todos por</span><strong class="preco__por" data-por><small>R$</small>${brl(i.precos[F0.id])}</strong><span class="preco__off" data-off>−${off(i.referencia, i.precos[F0.id])}%</span></div>${acoesHtml(i)}</div>
</div>
${detalhesHtml({ ...i, recebe: null }, cursosDescHtml(i))}
</article>`;
}

function anexoHtml(i) {
  return `<article class="oferta oferta--anexo" id="o-${i.id}" data-id="${i.id}" aria-labelledby="t-${i.id}">
<div class="anexo">
<div class="anexo__txt"><p class="mono">Ou comece por um curso só</p><h3 id="t-${i.id}">${esc(i.nome)}</h3><p>${esc(i.detalhe)}</p></div>
<div class="oferta__rodape">${precoHtml(i)}${acoesHtml(i)}</div>
</div>
</article>`;
}

// depoimentos: vídeo (padrão), áudio (vídeo com "audio": true) ou print ("tipo": "imagem")
const ICONE_PRINT = '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
function depoHtml(id, modo) {
  const d = D.depoimentos && D.depoimentos[id];
  if (!d) return "";
  const img = d.tipo === "imagem";
  const dur = d.duracao ? ` <span class="mono">${esc(d.duracao)}</span>` : "";
  if (modo === "chip" && img) return `<a class="depo-chip depo-chip--foto" href="${midia(d.img)}" data-video="${esc(id)}"><span class="depo-chip__mini" aria-hidden="true">${ICONE_PRINT}</span>Ver depoimento <span class="mono">print</span></a>`;
  if (modo === "chip") return `<button type="button" class="depo-chip" data-video="${esc(id)}"><span class="depo-chip__play" aria-hidden="true"></span>Ver depoimento${dur}</button>`;
  const capa = midia(img ? (d.mini || d.img) : d.poster);
  return `<button type="button" class="depo depo--grande" data-video="${esc(id)}"><span class="depo__thumb"><img src="${capa}" alt="" width="848" height="478" loading="lazy" decoding="async">${img ? "" : `<span class="depo__play" aria-hidden="true"></span>`}</span><span class="depo__leg">${esc(d.titulo || "")}${dur}</span></button>`;
}

// mural "O que falam de mim": o mesmo da A (título, texto, mosaico com os prints
// inteiros e "Ver mais depoimentos"; o app.js monta as colunas). Na B, as colunas
// andam em velocidades diferentes na rolagem (movimento.js).
function muralItem(id) {
  const d = D.depoimentos[id];
  const i = esc(id);
  if (d.tipo === "imagem") return `<a class="mural__item" href="${midia(d.img)}" data-video="${i}" style="--prop:${(d.h / d.w).toFixed(4)}"><img src="${midia(d.img)}" srcset="${midia(d.mini)} 560w, ${midia(d.img)} ${d.w}w" sizes="(min-width:1100px) 300px, (min-width:760px) 33vw, 92vw" alt="Print de depoimento sobre ${esc(d.produto)}" width="${d.w}" height="${d.h}" loading="lazy" decoding="async"><span class="mural__rot mono">${esc(d.produto)}</span></a>`;
  if (d.audio) return `<a class="mural__item mural__item--audio" href="${midia(d.mp4)}" data-video="${i}" style="--prop:.42"><span class="mural__onda" aria-hidden="true">${"<i></i>".repeat(22)}</span><span class="mural__ouvir"><span class="depo-chip__play" aria-hidden="true"></span>Ouvir depoimento em áudio <span class="mono">${esc(d.duracao)}</span></span><span class="mural__rot mono">${esc(d.produto)}</span></a>`;
  return `<a class="mural__item mural__item--video" href="${midia(d.mp4)}" data-video="${i}" style="--prop:1.4"><span class="mural__quadro"><img src="${midia(d.poster)}" alt="" width="270" height="480" loading="lazy" decoding="async"><span class="depo__play" aria-hidden="true"></span></span><span class="mural__rot mono">${esc(d.produto)} · vídeo · ${esc(d.duracao)}</span><span class="sr">${esc(d.titulo)}</span></a>`;
}
function muralHtml() {
  const ids = (D.mural || []).filter((id) => D.depoimentos && D.depoimentos[id]);
  if (!ids.length) return "";
  return `<section class="mural" aria-labelledby="h-mural">
<div class="mural__cab"><span class="mural__aspas" aria-hidden="true">“</span><p class="mono sobretitulo">${ids.length} depoimentos</p><h2 id="h-mural">${mascaras("O que falam de mim")}</h2><p class="mural__intro">Sobre os meus serviços e a minha entrega, nas palavras de quem já fez.</p></div>
<div class="mural__corpo" id="mural-corpo"><div class="mural__grade" id="mural-grade">${ids.map(muralItem).join("")}</div></div>
<div class="mural__mais"><button type="button" class="btn mural__btn" id="mural-mais" aria-controls="mural-corpo" aria-expanded="false" hidden>Ver mais depoimentos</button></div>
</section>`;
}

// ---------------------------------------------------------------- seções --
const INTRO = {
  prever: "Do próximo ano à próxima década, ou a resposta para uma pergunta só.",
  voce: "Leituras do seu mapa de nascimento: conversa ao vivo, documento ou áudio.",
  amor: "A sua vida afetiva no seu mapa, ou a relação entre dois mapas.",
  prosperar: "Vocação, satisfação e dinheiro no mapa.",
  cursos: "Dois pacotes gravados, para estudar no seu ritmo, sem limite de vagas.",
};
const HORIZONTE = [["Revolução Solar", "1 ano, do aniversário em diante", 1], ["Bússola do Destino", "12 meses, mês a mês", 12], ["Caixa de Pandora", "10 anos, ano a ano", 10]];
function horizonteHtml() {
  return `<dl class="horizonte" aria-label="Comparação de horizontes">${HORIZONTE.map(([n, t, seg]) => `<div><dt>${esc(n)}</dt><div class="regua" aria-hidden="true">${Array.from({ length: seg }, (_, k) => `<i style="--k:${k}"></i>`).join("")}</div><dd>${esc(t)}</dd></div>`).join("")}</dl>`;
}
// seções sem numeração (decisão da A); a palavra do menu vira o "fantasma" gigante atrás do título
function cabHtml(s, intro) {
  return `<header class="secao__cab">
<span class="secao__fantasma" aria-hidden="true">${esc(s.atalho || s.nome)}</span>
<h2 id="h-${s.id}">${mascaras(s.nome)}</h2>
${intro ? `<p class="secao__intro">${esc(intro)}</p>` : ""}
<i class="secao__regua" aria-hidden="true"></i>
</header>`;
}

function secaoHtml(s) {
  if (s.id === "mentoria") return mentoriaHtml(s);
  if (s.id === "cursos") {
    const pacotes = D.itens.filter((i) => i.secao === "cursos" && !i.anexoDe);
    const bloco = (i) => {
      const anexos = D.itens.filter((a) => a.anexoDe === i.id);
      if (!anexos.length) return pacoteHtml(i);
      return `<div class="pacote-bloco"${i.cenario ? ` data-so-cenario="${i.cenario}"` : ""}>${pacoteHtml(i)}${anexos.map(anexoHtml).join("")}</div>`;
    };
    return `<section class="secao secao--cursos" id="cursos" aria-labelledby="h-cursos">
${cabHtml(s, INTRO.cursos)}
<div class="secao__conteudo">
<div class="grade--cursos">
${pacotes.map(bloco).join("\n")}
</div>
<p class="entrega-cursos">O acesso aos cursos é pela Kiwify e é liberado depois do fim da Black Friday, a partir de 20/11.</p>
</div>
</section>`;
  }
  const lista = D.itens.filter((i) => i.secao === s.id);
  return `<section class="secao" id="${s.id}" aria-labelledby="h-${s.id}">
${cabHtml(s, INTRO[s.id])}
<div class="secao__conteudo">
${s.id === "prever" ? horizonteHtml() : ""}
<div class="grade" data-n="${lista.length}">
${lista.map(cardHtml).join("\n")}
</div>
</div>
</section>`;
}

function mentoriaHtml(s) {
  const i = itens.mentoria;
  if (!i) return "";
  const depos = (i.depoimentos || []).filter((id) => D.depoimentos && D.depoimentos[id]);
  return `<div class="faixa-mentoria lux">
<section class="secao secao--mentoria" id="mentoria" aria-labelledby="h-mentoria">
<div class="mentoria">
<header class="mentoria__cab">
<div class="aguia"><span class="aguia__halo" aria-hidden="true"></span><span class="aguia__img"><img class="mentoria__aguia" src="/bfa-b/assets/lux/aguia.webp?v=1" alt="Brasão da Lux et Directio: uma águia dourada" width="360" height="333" loading="lazy" decoding="async"></span></div>
<p class="secao__num mono">Formação individual</p>
<h2 id="h-mentoria">${mascaras("Mentoria")} <em>${mascaras("Lux et Directio", 1)}</em></h2>
<p class="mentoria__sub">${esc(i.subnome || "")} em 16 encontros, um a um com Yuri.</p>
</header>
<div class="mentoria__texto">
${(i.descricao || []).map((p) => `<p class="palavras">${luz(p)}</p>`).join("\n")}
<ul class="mentoria__lista">${(i.recebe || []).map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
</div>
<article class="oferta oferta--mentoria" id="o-mentoria" data-id="mentoria" aria-labelledby="t-mentoria">
<div class="oferta__corpo">
<p class="tags"><span class="tag tag--fmt">${esc(i.formato)}</span><span class="tag">${esc(i.detalhe)}</span></p>
<h3 id="t-mentoria">${esc(i.paraQuem)}</h3>
${rodapeHtml(i)}
<p class="mentoria__nota">Depois do pagamento, você combina com Yuri o início dos encontros.</p>
</div>
</article>
${depos.length ? `<div class="depos"><p class="mono depos__tit">Quem fez a mentoria</p>${depos.map((id) => depoHtml(id, "grande")).join("")}</div>` : ""}
</div>
</section>
</div>`;
}

const ICONES = {
  prever: '<circle cx="8" cy="8" r="5.5"/><circle cx="13" cy="3.5" r="1.6" fill="currentColor" stroke="none"/>',
  voce: '<circle cx="8" cy="5.5" r="2.8"/><path d="M2.8 14c.8-2.7 2.9-4 5.2-4s4.4 1.3 5.2 4"/>',
  amor: '<circle cx="6" cy="8" r="3.8"/><circle cx="10" cy="8" r="3.8"/>',
  prosperar: '<path d="M2 12.5l4-4 3 2.2 5-6"/><path d="M10.2 4.5H14v3.8"/>',
  mentoria: '<path d="M8 1.5l1.7 4.8 4.8 1.7-4.8 1.7L8 14.5l-1.7-4.8L1.5 8l4.8-1.7z"/>',
  cursos: '<path d="M2 3.5h4.3A1.7 1.7 0 0 1 8 5.2v8.3a1.6 1.6 0 0 0-1.6-1.5H2zM14 3.5H9.7A1.7 1.7 0 0 0 8 5.2v8.3a1.6 1.6 0 0 1 1.6-1.5H14z"/>',
};

// ------------------------------------------------- Bússola em destaque --
const B = itens.bussola;
const dV = D.depoimentos && D.depoimentos.vicente;
// anel da bússola: os 12 meses em volta do rosto do Vicente (aro fino, só os traços;
// 17/11: Gustavo pediu o rosto maior e a roda mais delicada, sem o texto girando)
function dialHtml() {
  if (!B || !dV) return "";
  const ticks = Array.from({ length: 12 }, (_, k) => {
    const a = (k * 30 - 90) * Math.PI / 180, r1 = k === 0 ? 87 : 89.5, r2 = k === 0 ? 99 : 95.5;
    const p = (r) => `${(100 + r * Math.cos(a)).toFixed(2)} ${(100 + r * Math.sin(a)).toFixed(2)}`;
    return `<path d="M${p(r1)}L${p(r2)}"${k === 0 ? ' class="norte"' : ""}/>`;
  }).join("");
  return `<button type="button" class="dial" data-video="vicente">
<span class="dial__disco" aria-hidden="true">
<span class="dial__anel"><svg viewBox="0 0 200 200"><circle class="dial__aro" cx="100" cy="100" r="98.5"/><g class="dial__ticks">${ticks}</g></svg></span>
<span class="dial__rosto"><img src="${midia(dV.poster)}" alt="" width="270" height="480" decoding="async"></span>
<span class="depo__play"></span>
</span>
<span class="dial__txt">${dV.trecho ? `<q>${esc(dV.trecho)}</q>` : ""}<small>${esc((dV.titulo || "Vicente").split(",")[0])} · assistir o depoimento${dV.duracao ? ` <span class="nw">(${esc(dV.duracao)})</span>` : ""}</small></span>
</button>`;
}

const destaqueHtml = B ? `<article class="oferta destaque" id="d-bussola" data-id="bussola" aria-labelledby="t-d-bussola">
<span class="destaque__selo selo-volta">${esc(B.selo || "Voltou depois de um ano")}</span>
<h2 id="t-d-bussola">Bússola <em>do Destino</em></h2>
<p class="destaque__linha">Os seus próximos 12 meses, mês a mês, pela Revolução Lunar. Fechada desde novembro de 2025.</p>
${dialHtml()}
${rodapeHtml(B)}
<a class="ir" href="#o-bussola" data-ir="bussola" data-abrir>Ver detalhes da Bússola</a>
</article>` : "";

const X = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
const fitaGrupo = () => `<span>Black Friday Apocalíptica</span><span>Até ${maxOff}% de desconto</span><span data-validade>Só ${esc(F0.validade)}</span>`;
const fita = (mod) => `<div class="fita fita--${mod}"><div class="fita__trilho">${Array.from({ length: 6 }, fitaGrupo).join("")}</div></div>`;

// abertura animada (17/11): a marca sai do topo e vira a entrada da página.
// Só em CSS (o GSAP chega depois), em toda entrada e todo reload (pedido de Gustavo, 17/11). Toque pula.
// Letras do "Black Friday" entram alternando de cima e de baixo (acervo 328/356).
const letras = (t) => [...t].map((c, k) => c === " " ? '<span class="c c--esp"> </span>' : `<span class="c"><span class="${k % 2 ? "de-baixo" : "de-cima"}" style="--i:${k}">${esc(c)}</span></span>`).join("");
const introHtml = `<div class="intro" aria-hidden="true">
<div class="intro__miolo">
<p class="intro__nome">${mascaras("Yuri dos Anjos")}</p>
<p class="intro__bf">${letras("Black Friday")}</p>
<p class="intro__apo"><span class="m"><span>Apocalíptica</span></span></p>
<div class="intro__pe"><i class="intro__linha"></i><p class="intro__conta mono">Até <b class="intro__n"></b>% de desconto</p></div>
</div>
</div>`;
// 17/11: fundo da abertura = tempestade (céu em redemoinho + raios + cidade, a arte aprovada da campanha),
// escolhida por Gustavo entre três opções; o "80%" gigante saiu.
// Silhueta da cidade da opção 1: gerada aqui, sempre igual (semente fixa), sem imagem.
function cidadeSvg() {
  let sem = 20261117;
  const rnd = () => (sem = (sem * 16807) % 2147483647) / 2147483647;
  const W = 1600, H = 240;
  const camada = (base, alt, larg, chance) => {
    let x = -20, d = "", jan = "";
    while (x < W + 20) {
      const w = Math.round(larg[0] + rnd() * (larg[1] - larg[0]));
      const h = Math.round(alt[0] + Math.pow(rnd(), 1.6) * (alt[1] - alt[0]) + (rnd() < 0.08 ? 46 : 0));
      const y = H - base - h;
      d += `M${x} ${H}V${y}h${w}V${H}Z`;
      // recuo no topo (prédio escalonado) ou antena
      const r = rnd();
      if (r < 0.3 && w > 26) { const rw = Math.round(w * (0.4 + rnd() * 0.3)), rh = Math.round(8 + rnd() * 22); d += `M${x + Math.round((w - rw) / 2)} ${y}v-${rh}h${rw}v${rh}Z`; }
      else if (r < 0.48 && h > 70) d += `M${x + Math.round(w * (0.3 + rnd() * 0.4))} ${y}v-${Math.round(14 + rnd() * 30)}h1.6V${y}Z`;
      for (let jy = y + 9; jy < H - base - 8; jy += 12) for (let jx = x + 5; jx < x + w - 6; jx += 8) if (rnd() < chance) jan += `M${jx} ${jy}h3v4h-3Z`;
      x += w + (rnd() < 0.3 ? Math.round(rnd() * 10) : 0);
    }
    return { d, jan };
  };
  const longe = camada(30, [70, 190], [22, 58], 0.025), fundo = camada(14, [40, 150], [20, 54], 0.035), frente = camada(0, [18, 96], [18, 50], 0.05);
  return `<svg class="cidade" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
<defs><linearGradient id="cid-nevoa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A8E99" stop-opacity="0"/><stop offset=".6" stop-color="#2A8E99" stop-opacity=".2"/><stop offset="1" stop-color="#16585F" stop-opacity=".34"/></linearGradient>
<linearGradient id="cid-bruma" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A8E99" stop-opacity="0"/><stop offset="1" stop-color="#2A8E99" stop-opacity=".22"/></linearGradient>
<linearGradient id="cid-chao" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050404" stop-opacity="0"/><stop offset="1" stop-color="#050404"/></linearGradient></defs>
<rect y="40" width="${W}" height="${H - 40}" fill="url(#cid-nevoa)"/>
<path d="${longe.d}" fill="#112529" opacity=".75"/><path class="cidade__jan" d="${longe.jan}" fill="#FFB36B" opacity=".25"/>
<rect y="120" width="${W}" height="${H - 120}" fill="url(#cid-bruma)"/>
<path d="${fundo.d}" fill="#0A1517"/><path class="cidade__jan" d="${fundo.jan}" fill="#FFB36B" opacity=".35"/>
<rect y="170" width="${W}" height="${H - 170}" fill="url(#cid-bruma)"/>
<path d="${frente.d}" fill="#050404"/><path class="cidade__jan" d="${frente.jan}" fill="#FFC27D" opacity=".45"/>
<rect y="${H - 40}" width="${W}" height="40" fill="url(#cid-chao)"/>
</svg>`;
}

// contador do "até 80%" da abertura (o número vem do ofertas.json)
const cssIntro = `@keyframes conta{from{--n:0}to{--n:${maxOff}}}`;


const html = `<!doctype html>
<html lang="pt-BR" data-cenario="${esc(D.cenarioCursos || "dois")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Ofertas · Black Friday Apocalíptica · Yuri dos Anjos</title>
<meta name="description" content="Consultas, cursos e mentoria de Yuri dos Anjos com até ${maxOff}% de desconto. Monte o pedido e envie pelo WhatsApp.">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#070505">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="Black Friday Apocalíptica · Ofertas">
<meta property="og:description" content="Consultas, cursos e mentoria de Yuri dos Anjos com até ${maxOff}% de desconto.">
<link rel="preload" href="/bfa-b/assets/fontes/anton.woff2?v=1" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/bfa-b/assets/fontes/instrument-serif-italico.woff2?v=1" as="font" type="font/woff2" crossorigin>
<link rel="icon" href="/bfa-b/assets/favicon.svg?v=1" type="image/svg+xml">
<style>${css}
${cssIntro}</style>
<script>(function(d){d.classList.add('js');try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches){d.classList.add('anima');if(!/[?&]intro=0/.test(location.search)){d.classList.add('com-intro');document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('.intro'))d.classList.add('intro-fim')},true);setTimeout(function(){d.classList.add('intro-fim')},4500)}}}catch(e){}})(document.documentElement)</script>
</head>
<body>
${introHtml}
<a class="pular" href="#ofertas">Pular para as ofertas</a>
<header class="topo">
<div class="alerta" id="relogio">
<p><i class="alerta__pulso" aria-hidden="true"></i><span id="relogio-rotulo">Os preços aumentam</span> <b id="relogio-tempo">à meia-noite</b></p>
<canvas class="alerta__fogo" aria-hidden="true"></canvas>
</div>
<nav class="atalhos" aria-label="Categorias de ofertas"><ul>
${D.secoes.map((s) => `<li><a href="#${s.id}" data-atalho="${s.id}"><svg viewBox="0 0 16 16" aria-hidden="true">${ICONES[s.icone] || ""}</svg><span>${esc(s.atalho)}</span></a></li>`).join("\n")}
<li class="atalhos__marca" aria-hidden="true"></li>
</ul></nav>
<i class="topo__progresso" aria-hidden="true"></i>
</header>

<section class="abertura" aria-labelledby="h-abertura">
<div class="abertura__ceu" aria-hidden="true">
<canvas class="ceu-tela"></canvas>
<canvas class="ceu-raios"></canvas>
${cidadeSvg()}
<i class="horizonte-fogo"></i>
</div>
<div class="abertura__dentro">
<div class="abertura__texto">
<p class="sobretitulo mono"><i class="pulso" aria-hidden="true"></i><span id="sobre-fase">${esc(F0.rotulo)}</span></p>
<h1 id="h-abertura">${mascaras("Os", 0)} <em>${mascaras("maiores", 1)}</em> ${mascaras("descontos que eu já dei", 2)}</h1>
<p class="abertura__sub">Até <strong><span id="max-off">${maxOff}</span>% de desconto</strong> em consultas, cursos e mentoria. <span id="validade">Esta condição vale ${esc(F0.validade)}.</span></p>
</div>
${destaqueHtml}
</div>
</section>

<div class="fitas" aria-hidden="true">${fita("a")}${fita("b")}</div>
<div class="aviso" id="aviso" role="status" aria-live="polite" hidden><div class="aviso__caixa"><p id="aviso-texto"></p><button type="button" id="aviso-fechar" aria-label="Fechar aviso">×</button></div></div>
<noscript><div class="aviso"><div class="aviso__caixa"><p>Para montar o pedido, ative o JavaScript ou <a href="https://wa.me/${D.whatsapp}?text=${encodeURIComponent("Olá! Quero fazer um pedido da Black Friday Apocalíptica.")}">fale com o atendimento pelo WhatsApp</a>.</p></div></div></noscript>

<main id="ofertas" tabindex="-1">
${D.secoes.map(secaoHtml).join("\n")}
</main>

${muralHtml()}


<div class="barra" id="barra" aria-hidden="true">
<div class="barra__dentro">
<p class="barra__resumo"><span id="barra-qtd">0 itens no pedido</span><b id="barra-total">R$ 0</b></p>
<button type="button" class="esvaziar" id="esvaziar" aria-label="Esvaziar pedido"><svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M4 6h12M8 6V4.5h4V6M6 6l.8 10h6.4L14 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
<button type="button" class="btn" id="abrir-pedido">Finalizar pedido</button>
</div>
</div>

<div class="desfazer" id="desfazer" role="status" hidden><span>Pedido esvaziado.</span><button type="button" id="desfazer-btn">Desfazer</button></div>

<dialog class="video-dlg" id="video" aria-label="Depoimento em vídeo">
<div class="video-dlg__caixa">
<button type="button" class="fechar video-dlg__fechar" id="fechar-video" aria-label="Fechar">${X}</button>
<div class="video-dlg__midia"><video controls playsinline preload="none"></video><img id="video-img" alt="Print do depoimento" decoding="async"></div>
<p class="video-dlg__leg" id="video-leg"></p>
</div>
</dialog>

<dialog class="pedido" id="pedido" aria-labelledby="h-pedido">
<div class="pedido__folha">
<div class="pedido__cab"><h2 id="h-pedido">Seu pedido</h2><button type="button" class="fechar" id="fechar-pedido" aria-label="Fechar pedido">${X}</button></div>
<div class="pedido__rolagem"><ul class="pedido__lista" id="pedido-lista"></ul><p class="pedido__vazio" id="pedido-vazio" hidden>Seu pedido está vazio. Toque em Adicionar nas ofertas que quiser.</p></div>
<div class="pedido__pe">
<p class="mudou" id="pedido-mudou" role="alert" hidden></p>
<div class="total"><span>Total</span><b id="pedido-total">R$ 0</b></div>
<p class="condicao" id="pedido-condicao"></p>
<p class="nota"><strong>Você ainda não paga nada.</strong> O botão abre o WhatsApp do atendimento com o pedido escrito. A equipe confere as vagas e envia o link de pagamento, que vale para o mesmo dia.</p>
<button type="button" class="btn btn-wa" id="enviar"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z"/></svg><span id="enviar-texto">Enviar pedido pelo WhatsApp</span></button>
<button type="button" class="continuar" id="continuar">Continuar escolhendo</button>
</div>
</div>
</dialog>
<p class="sr" id="anuncio" aria-live="polite"></p>

<script type="application/json" id="dados">${JSON.stringify(D).replace(/</g, "\\u003c")}</script>
<script src="/bfa-b/assets/app.js?v=${vJs}" defer></script>
<script src="/bfa-b/assets/movimento.js?v=${vMov}" data-gsap="/bfa-b/assets/vendor/gsap.min.js?v=3.15.0" data-st="/bfa-b/assets/vendor/ScrollTrigger.min.js?v=3.15.0" defer></script>
</body>
</html>
`;

// ------------------------------------------------------------------ saída --
async function copiarSeMudou(de, para) {
  const a = await stat(de);
  const b = await stat(para).catch(() => null);
  if (b && b.size === a.size && b.mtimeMs >= a.mtimeMs) return 0;
  await mkdir(dirname(para), { recursive: true });
  await copyFile(de, para);
  return 1;
}
async function copiarPasta(de, para, filtro = () => true) {
  let n = 0;
  for (const f of await readdir(de).catch(() => [])) {
    const s = await stat(join(de, f));
    if (s.isDirectory()) n += await copiarPasta(join(de, f), join(para, f), filtro);
    else if (s.isFile() && filtro(f)) n += await copiarSeMudou(join(de, f), join(para, f));
  }
  return n;
}

const SITE = raiz("site/");
await mkdir(join(SITE, "assets"), { recursive: true });
let copiados = 0;
copiados += await copiarPasta(join(A_ASSETS, "depoimentos"), join(SITE, "assets/depoimentos"));
copiados += await copiarPasta(join(A_ASSETS, "lux"), join(SITE, "assets/lux"), (f) => /^(aguia\.webp|newsreader.*\.woff2)$/.test(f));
copiados += await copiarSeMudou(join(A_ASSETS, "favicon.svg"), join(SITE, "assets/favicon.svg"));
copiados += await copiarPasta(raiz("fontes"), join(SITE, "assets/fontes"), (f) => f.endsWith(".woff2"));
copiados += await copiarPasta(raiz("vendor"), join(SITE, "assets/vendor"), (f) => f.endsWith(".js"));
await writeFile(join(SITE, "index.html"), naBase(html));
await writeFile(join(SITE, "assets/app.js"), js);
await writeFile(join(SITE, "assets/movimento.js"), mov);
await copyFile(A_DADOS, join(SITE, "ofertas.json"));
console.log(`[${BASE}] ofertas-b/site/index.html ·${(html.length / 1024).toFixed(1)} KB · app.js v=${vJs} · movimento.js v=${vMov} · ${copiados} arquivo(s) de mídia copiado(s) · até ${maxOff}%`);
