// =============================================================================
//  Gera site/index.html a partir de dados/ofertas.json (fonte única).
//    node scripts/gerar.mjs
//  O HTML já sai com os preços da primeira fase, para aparecer sem JavaScript.
//  O app.js recalcula preços e vagas pela fase vigente e pelo ofertas.json ao vivo.
// =============================================================================
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const raiz = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const D = JSON.parse(await readFile(raiz("dados/ofertas.json"), "utf8"));
const css = await readFile(raiz("src/estilo.css"), "utf8");
const js = await readFile(raiz("src/app.js"), "utf8");

const vJs = createHash("sha1").update(js).digest("hex").slice(0, 8);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const brl = (n) => n.toLocaleString("pt-BR");
const off = (ref, v) => Math.round((1 - v / ref) * 100);
const F0 = D.fases[0];
const itens = Object.fromEntries(D.itens.map((i) => [i.id, i]));
const C = 2 * Math.PI * 7;

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
  if (!i.prova || !D.provas[i.prova]) return "";
  const p = D.provas[i.prova];
  return `<blockquote class="citacao" data-prova="${esc(i.prova)}"${p.ativo ? "" : " hidden"}><p>“${esc(p.citacao)}”</p><footer>${esc(p.autor)}, ${esc(p.contexto)}</footer></blockquote>`;
}

function detalhesHtml(i, extra = "") {
  const recebe = i.recebe ? `<div><h4 class="mono">O que você recebe</h4><ul class="recebe">${i.recebe.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>` : "";
  return `<details class="mais">
<summary>Ver detalhes<span class="sr"> de ${esc(i.nome)}</span></summary>
<div class="mais__corpo">
${i.descricao.map((p) => `<p>${esc(p)}</p>`).join("\n")}
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
  return `<article class="oferta" id="o-${i.id}" data-id="${i.id}"${cen} aria-labelledby="t-${i.id}">
${i.selo ? `<span class="oferta__marca">${esc(i.selo)}</span>` : ""}
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
function grupos(i) { return i.cursosDe ? i.cursosDe.map((id) => itens[id]) : [i]; }
function reciboHtml(i) {
  const gs = grupos(i);
  const lis = gs.map((g) => `${i.cursosDe ? `<li class="recibo__grupo mono">${esc(g.nome.replace("Pacote ", ""))}</li>` : ""}${g.cursos.map(([n, v]) => `<li><span>${esc(n)}</span><em>R$&nbsp;${brl(v)}</em></li>`).join("")}`).join("");
  return `<ul class="recibo" aria-label="Cursos do ${esc(i.nome)}">${lis}<li class="recibo__soma"><span>Separados</span><s>R$&nbsp;${brl(i.referencia)}</s></li></ul>`;
}
function cursosDescHtml(i) {
  return `<div><h4 class="mono">O que tem em cada curso</h4><ul class="cursos-desc">${grupos(i).flatMap((g) => g.cursos).map(([n, , t]) => `<li><b>${esc(n)}</b><span>${esc(t)}</span></li>`).join("")}</ul></div>`;
}
function pacoteHtml(i) {
  const cen = i.cenario ? ` data-so-cenario="${i.cenario}"` : "";
  return `<article class="oferta oferta--pacote" id="o-${i.id}" data-id="${i.id}"${cen} aria-labelledby="t-${i.id}">
<div class="oferta__corpo">
<p class="tags"><span class="tag tag--fmt">${esc(i.subnome)}</span><span class="tag">Gravados · no seu ritmo</span></p>
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

function depoHtml(id, modo) {
  const d = D.depoimentos && D.depoimentos[id];
  if (!d) return "";
  if (modo === "chip") return `<button type="button" class="depo-chip" data-video="${id}"><span class="depo-chip__play" aria-hidden="true"></span>Ver depoimento <span class="mono">${esc(d.duracao)}</span></button>`;
  if (modo === "compacto") return `<button type="button" class="depo depo--compacto" data-video="${id}"><span class="depo__thumb${d.vertical ? " depo__thumb--vertical" : ""}"><img src="${d.poster}" alt="" width="${d.vertical ? 270 : 480}" height="${d.vertical ? 480 : 270}" loading="lazy" decoding="async"><span class="depo__play" aria-hidden="true"></span></span><span class="depo__txt">${d.trecho ? `<q>${esc(d.trecho)}</q>` : ""}<small>${esc(d.titulo.split(",")[0])} · assistir o depoimento (${esc(d.duracao)})</small></span></button>`;
  return `<button type="button" class="depo depo--grande" data-video="${id}"><span class="depo__thumb"><img src="${d.poster}" alt="" width="848" height="478" loading="lazy" decoding="async"><span class="depo__play" aria-hidden="true"></span></span><span class="depo__leg">${esc(d.titulo)} <span class="mono">${esc(d.duracao)}</span></span></button>`;
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
  return `<dl class="horizonte" aria-label="Comparação de horizontes">${HORIZONTE.map(([n, t, seg]) => `<div><dt>${esc(n)}</dt><div class="regua" aria-hidden="true"><i style="background:repeating-linear-gradient(90deg,var(--brasa) 0 calc(100% / ${seg} - 2px),transparent calc(100% / ${seg} - 2px) calc(100% / ${seg}))"></i></div><dd>${esc(t)}</dd></div>`).join("")}</dl>`;
}
const total = D.secoes.length;
const num = (id) => String(D.secoes.findIndex((s) => s.id === id) + 1).padStart(2, "0") + " / " + String(total).padStart(2, "0");
function cabHtml(s, intro) {
  return `<div class="secao__cab"><span class="secao__num mono">${num(s.id)}</span><h2 id="h-${s.id}">${esc(s.nome)}</h2>${intro ? `<p class="secao__intro">${esc(intro)}</p>` : ""}</div>`;
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
    return `<section class="secao" id="cursos" aria-labelledby="h-cursos">
${cabHtml(s, INTRO.cursos)}
<div class="grade--cursos">
${pacotes.map(bloco).join("\n")}
</div>
<p class="entrega-cursos">O acesso aos cursos é pela Kiwify e é liberado depois do fim da Black Friday, a partir de 20/11.</p>
</section>`;
  }
  const cards = D.itens.filter((i) => i.secao === s.id).map(cardHtml).join("\n");
  return `<section class="secao" id="${s.id}" aria-labelledby="h-${s.id}">
${cabHtml(s, INTRO[s.id])}
${s.id === "prever" ? horizonteHtml() : ""}
<div class="grade">
${cards}
</div>
</section>`;
}

function mentoriaHtml(s) {
  const i = itens.mentoria;
  const depos = (i.depoimentos || []).filter((id) => D.depoimentos && D.depoimentos[id]);
  return `<div class="faixa-mentoria escuro lux">
<section class="secao" id="mentoria" aria-labelledby="h-mentoria">
<div class="mentoria">
<header class="mentoria__cab">
<img class="mentoria__aguia" src="/bfa/assets/lux/aguia.webp?v=1" alt="Brasão da Lux et Directio: uma águia dourada" width="360" height="314" loading="lazy" decoding="async">
<div><span class="secao__num mono">${num("mentoria")} · Formação individual</span><h2 id="h-mentoria">Mentoria <em>Lux et Directio</em></h2><p class="mentoria__sub">${esc(i.subnome)} em 16 encontros, um a um com Yuri.</p></div>
</header>
<div class="mentoria__texto">
${i.descricao.map((p) => `<p>${esc(p)}</p>`).join("\n")}
<ul class="mentoria__lista">${i.recebe.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
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

const visiveis = D.itens.filter((i) => !i.cenario || i.cenario === D.cenarioCursos);
const maxOff = Math.max(...visiveis.map((i) => off(i.referencia, i.precos[F0.id])));
const ICONES = {
  prever: '<circle cx="8" cy="8" r="5.5"/><circle cx="13" cy="3.5" r="1.6" fill="currentColor" stroke="none"/>',
  voce: '<circle cx="8" cy="5.5" r="2.8"/><path d="M2.8 14c.8-2.7 2.9-4 5.2-4s4.4 1.3 5.2 4"/>',
  amor: '<circle cx="6" cy="8" r="3.8"/><circle cx="10" cy="8" r="3.8"/>',
  prosperar: '<path d="M2 12.5l4-4 3 2.2 5-6"/><path d="M10.2 4.5H14v3.8"/>',
  mentoria: '<path d="M8 1.5l1.7 4.8 4.8 1.7-4.8 1.7L8 14.5l-1.7-4.8L1.5 8l4.8-1.7z"/>',
  cursos: '<path d="M2 3.5h4.3A1.7 1.7 0 0 1 8 5.2v8.3a1.6 1.6 0 0 0-1.6-1.5H2zM14 3.5H9.7A1.7 1.7 0 0 0 8 5.2v8.3a1.6 1.6 0 0 1 1.6-1.5H14z"/>',
};
const B = itens.bussola;
const PV = D.provas.vicente;

const destaqueHtml = `<article class="oferta destaque escuro entra entra-3" id="d-bussola" data-id="bussola" aria-labelledby="t-d-bussola">
<span class="destaque__selo">Voltou</span>
<h2 id="t-d-bussola">Bússola do Destino</h2>
<p class="destaque__linha">Os seus próximos 12 meses, mês a mês, pela Revolução Lunar. Fechada desde novembro de 2025.</p>
${depoHtml("vicente", "compacto")}
${rodapeHtml(B)}
<a class="ir" href="#o-bussola" data-ir="bussola" data-abrir>Ver detalhes da Bússola</a>
</article>`;

const html = `<!doctype html>
<html lang="pt-BR" data-cenario="${D.cenarioCursos}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Ofertas · Black Friday Apocalíptica · Yuri dos Anjos</title>
<meta name="description" content="Consultas, cursos e mentoria de Yuri dos Anjos com até ${maxOff}% de desconto. Monte o pedido e envie pelo WhatsApp.">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#0E0B09">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="Black Friday Apocalíptica · Ofertas">
<meta property="og:description" content="Consultas, cursos e mentoria de Yuri dos Anjos com até ${maxOff}% de desconto.">
<link rel="icon" href="/bfa/assets/favicon.svg?v=1" type="image/svg+xml">
<style>${css}</style>
<script>document.documentElement.classList.add('js')</script>
</head>
<body>
<a class="pular" href="#ofertas">Pular para as ofertas</a>
<header class="topo escuro">
<div class="topo__linha">
<p class="marca">Yuri dos Anjos<span>Black Friday Apocalíptica</span></p>
<div class="relogio" id="relogio">
<div><span id="relogio-rotulo">${esc(F0.rotulo)}, vale</span><b id="relogio-tempo">${esc(F0.validade)}</b></div>
<svg class="anel" viewBox="0 0 30 30" aria-hidden="true"><circle class="anel__fundo" cx="15" cy="15" r="12"/><circle class="anel__brasa" id="anel-brasa" cx="15" cy="15" r="12" stroke-dasharray="75.4" stroke-dashoffset="0"/></svg>
</div>
</div>
<nav class="atalhos" aria-label="Categorias de ofertas"><ul>
${D.secoes.map((s) => `<li><a href="#${s.id}" data-atalho="${s.id}"><svg viewBox="0 0 16 16" aria-hidden="true">${ICONES[s.icone] || ""}</svg><span>${esc(s.atalho)}</span></a></li>`).join("\n")}
<li class="atalhos__marca" aria-hidden="true"></li>
</ul></nav>
</header>

<section class="abertura escuro" aria-labelledby="h-abertura">
<div class="eclipse" aria-hidden="true"></div>
<div class="abertura__dentro">
<div>
<p class="sobretitulo mono entra"><span id="sobre-fase">${esc(F0.rotulo)}</span></p>
<h1 id="h-abertura" class="entra entra-2">Os <em>maiores</em> descontos que eu já dei</h1>
<p class="abertura__sub entra entra-3">Até <strong><span id="max-off">${maxOff}</span>% de desconto</strong> em consultas, cursos e mentoria. <span id="validade">Esta condição vale ${esc(F0.validade)}.</span></p>
<p class="contagem entra entra-4"><span class="mono">Este preço termina em</span><b id="contagem">--:--:--</b></p>
</div>
${destaqueHtml}
</div>
</section>

<div class="fita-moldura" aria-hidden="true"><div class="fita"><div class="fita__trilho">${Array.from({ length: 4 }, () => `<span>Black Friday Apocalíptica</span><span>Até ${maxOff}% de desconto</span><span data-validade>Só ${esc(F0.validade)}</span>`).join("")}</div></div></div>
<div class="aviso" id="aviso" role="status" aria-live="polite" hidden><div class="aviso__caixa"><p id="aviso-texto"></p><button type="button" id="aviso-fechar" aria-label="Fechar aviso">×</button></div></div>
<noscript><div class="aviso"><div class="aviso__caixa"><p>Para montar o pedido, ative o JavaScript ou <a href="https://wa.me/${D.whatsapp}?text=${encodeURIComponent("Olá! Quero fazer um pedido da Black Friday Apocalíptica.")}">fale com o atendimento pelo WhatsApp</a>.</p></div></div></noscript>

<main id="ofertas" tabindex="-1">
${D.secoes.map(secaoHtml).join("\n")}
</main>

<section class="como" aria-labelledby="h-como">
<h2 id="h-como">Como funciona o pedido</h2>
<ol>
<li>Escolha as ofertas e toque em Adicionar. Dá para levar mais de uma.</li>
<li>Toque em Finalizar pedido para conferir itens, quantidades e o total.</li>
<li>Envie pelo WhatsApp. A mensagem já vai escrita, com os itens e os preços.</li>
<li>O atendimento confere as vagas e manda o link de pagamento. A compra se confirma com o pagamento.</li>
<li>O desconto diminui a cada meia-noite até 19/11. Vale o preço do dia em que você envia o pedido, com pagamento no mesmo dia.</li>
<li>Os cursos são entregues pela Kiwify depois do fim da Black Friday, a partir de 20/11.</li>
</ol>
</section>

<footer class="rodape">
<p>Black Friday Apocalíptica · Yuri dos Anjos · 16 a 19 de novembro de 2026.</p>
<p>Pedidos pelo WhatsApp do atendimento. O pagamento acontece depois, pelo link enviado pela equipe.</p>
</footer>

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
<button type="button" class="fechar video-dlg__fechar" id="fechar-video" aria-label="Fechar vídeo">×</button>
<video controls playsinline preload="none"></video>
<p class="video-dlg__leg" id="video-leg"></p>
</div>
</dialog>

<dialog class="pedido" id="pedido" aria-labelledby="h-pedido">
<div class="pedido__folha">
<div class="pedido__cab"><h2 id="h-pedido">Seu pedido</h2><button type="button" class="fechar" id="fechar-pedido" aria-label="Fechar pedido">×</button></div>
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
<script src="/bfa/assets/app.js?v=${vJs}" defer></script>
</body>
</html>
`;

await mkdir(raiz("site/assets"), { recursive: true });
await writeFile(raiz("site/index.html"), html);
await writeFile(raiz("site/assets/app.js"), js);
await copyFile(raiz("dados/ofertas.json"), raiz("site/ofertas.json"));
console.log(`site/index.html gerado · ${(html.length / 1024).toFixed(1)} KB · app.js v=${vJs} · até ${maxOff}%`);
