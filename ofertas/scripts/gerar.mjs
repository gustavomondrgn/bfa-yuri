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

function precoHtml(i, classe = "") {
  const v = i.precos[F0.id];
  const de = i.curso
    ? `${esc(i.referenciaTexto || "Separados, somam")} <s>R$&nbsp;${brl(i.referencia)}</s>`
    : `De <s>R$&nbsp;${brl(i.referencia)}</s> por`;
  return `<div class="preco ${classe}" data-preco>
<span class="preco__de" data-de>${de}</span>
<strong class="preco__por" data-por><small>R$</small>${brl(v)}</strong>
<span class="preco__off" data-off>−${off(i.referencia, v)}%</span>
</div>`;
}

const C = 2 * Math.PI * 7;
function vagasHtml(i) {
  if (i.vagas == null) {
    return `<p class="vagas" data-vagas data-estado="livre"><svg viewBox="0 0 18 18" aria-hidden="true"><circle class="v-fundo" cx="9" cy="9" r="7"/><circle class="v-arco" cx="9" cy="9" r="7" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="0"/></svg><span>Sem limite de vagas</span></p>`;
  }
  const frac = i.vagas / i.vagasIniciais;
  return `<p class="vagas" data-vagas data-estado="ok"><svg viewBox="0 0 18 18" aria-hidden="true"><circle class="v-fundo" cx="9" cy="9" r="7"/><circle class="v-arco" cx="9" cy="9" r="7" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - frac)).toFixed(2)}"/></svg><span><b>${i.vagas}</b> vagas nesta Black Friday</span></p>`;
}

function depoisDe(i) {
  const base = ["Você envia o pedido pelo WhatsApp, com os itens e o total já escritos.", "O atendimento confere a vaga e manda o link de pagamento."];
  if (i.curso) return [...base, "O acesso aos cursos, pela Kiwify, é liberado depois do fim da Black Friday, a partir de 20/11."];
  if (i.id === "mentoria") return [...base, "Depois do pagamento, vocês combinam o início dos encontros."];
  if (/Vídeo/.test(i.formato)) return [...base, "Depois do pagamento, vocês combinam o dia da consulta e você conta o que quer priorizar."];
  return [...base, "Depois do pagamento, o atendimento pede seus dados de nascimento e o que você quer ver na leitura."];
}

function cursosHtml(i) {
  const grupos = i.cursosDe ? i.cursosDe.map((id) => itens[id]) : [i];
  return grupos
    .map((g) => {
      const titulo = i.cursosDe ? `<p class="cursos__grupo mono">${esc(g.nome.replace("Pacote ", ""))} · ${g.cursos.length} cursos</p>` : "";
      const lis = g.cursos.map(([n, v, t]) => `<li><b>${esc(n)}</b><em>R$&nbsp;${brl(v)}</em><span>${esc(t)}</span></li>`).join("");
      return `${titulo}<ul class="cursos">${lis}</ul>`;
    })
    .join("") + `<p class="cursos__soma"><span>Somando os preços separados</span><b>R$&nbsp;${brl(i.referencia)}</b></p>`;
}

function provaHtml(i) {
  if (!i.prova || !D.provas[i.prova]) return "";
  const p = D.provas[i.prova];
  return `<blockquote class="citacao" data-prova="${esc(i.prova)}" hidden><p>“${esc(p.citacao)}”</p><footer>${esc(p.autor)}, ${esc(p.contexto)}</footer></blockquote>`;
}

function cardHtml(i) {
  const cen = i.cenario ? ` data-so-cenario="${i.cenario}"` : "";
  const recebe = i.recebe ? `<div><h4 class="mono">O que você recebe</h4><ul class="recebe">${i.recebe.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>` : "";
  const cursos = i.curso ? `<div><h4 class="mono">Cursos do pacote</h4>${cursosHtml(i)}</div>` : "";
  return `<article class="oferta" id="o-${i.id}" data-id="${i.id}"${cen} aria-labelledby="t-${i.id}">
${i.selo ? `<span class="selo">${esc(i.selo)}</span>` : ""}
<div class="oferta__etiqueta mono"><span class="fmt">${esc(i.formato)}</span><span>${esc(i.detalhe)}</span></div>
<div class="oferta__corpo">
<h3 id="t-${i.id}">${esc(i.nome)}${i.subnome ? `<small>${esc(i.subnome)}</small>` : ""}</h3>
<p class="oferta__para">${esc(i.paraQuem)}</p>
${precoHtml(i)}
${vagasHtml(i)}
<div class="acoes">
<button type="button" class="btn btn-add" data-add>Adicionar ao pedido</button>
<div class="qtd" role="group" aria-label="Quantidade de ${esc(i.nome)}">
<button type="button" data-menos aria-label="Tirar um ${esc(i.nome)}">−</button>
<output data-qtd>1<span>no pedido</span></output>
<button type="button" data-mais aria-label="Mais um ${esc(i.nome)}">+</button>
</div>
</div>
</div>
<details class="mais">
<summary>Saiba mais<span class="sr"> sobre ${esc(i.nome)}</span></summary>
<div class="mais__corpo">
${i.descricao.map((p) => `<p>${esc(p)}</p>`).join("\n")}
${provaHtml(i)}
${recebe}
${cursos}
<div><h4 class="mono">Depois do pedido</h4><ol class="depois">${depoisDe(i).map((p) => `<li>${esc(p)}</li>`).join("")}</ol></div>
</div>
</details>
</article>`;
}

function miniHtml(id) {
  const i = itens[id];
  if (!i) return "";
  const cen = i.cenario ? ` data-so-cenario="${i.cenario}"` : "";
  return `<li class="mini" data-id="${i.id}"${cen}>
<span class="mini__nome">${esc(i.nome)}${i.subnome ? ` <span class="nobr">· ${esc(i.subnome)}</span>` : ""}</span>
<p class="mini__para">${esc(i.paraQuem)}</p>
${precoHtml(i)}
<a href="#o-${i.id}" data-ir="${i.id}"><span>Ver</span><span class="sr">${esc(i.nome)}</span></a>
</li>`;
}

const COMPARA = {
  prever: {
    titulo: "Três horizontes de tempo",
    itens: [
      ["Revolução Solar", "1 ano, a partir do aniversário · vídeo", 1],
      ["Bússola do Destino", "12 meses, mês a mês · escrito", 12],
      ["Caixa de Pandora", "10 anos, ano a ano · vídeo", 10],
    ],
  },
  voce: {
    titulo: "Natal em vídeo ou por escrito",
    itens: [
      ["Consulta Natal", "Conversa ao vivo de 1 a 2 horas, com gravação"],
      ["Natal Escrita", "Documento de 30 a 50 páginas, para reler"],
    ],
  },
  amor: {
    titulo: "Um mapa ou dois",
    itens: [
      ["Raio-X Amoroso", "O seu mapa · escrito, em 7 dias"],
      ["Sinastria", "Dois mapas comparados · vídeo"],
    ],
  },
  trabalho: {
    titulo: "Três jeitos de olhar o trabalho",
    itens: [
      ["Compre Tempo", "Consulta em vídeo + Datas Propícias de 3 anos"],
      ["Potencial de Riqueza", "Documento com índice de 0 a 100%"],
      ["Fórmula da Felicidade", "Áudio sobre o que traz satisfação"],
    ],
  },
  aprender: {
    titulo: "Estudar sozinho ou com Yuri",
    itens: [
      ["Cursos", "Gravados, no seu ritmo, sem limite de vagas"],
      ["Mentoria", "16 encontros individuais com Yuri, 5 vagas"],
    ],
  },
};
const INTRO = {
  prever: "Escolha pelo tamanho do período que você quer enxergar.",
  voce: "Leituras do seu mapa de nascimento: conversa ao vivo, documento ou áudio.",
  amor: "A sua vida afetiva no seu mapa, ou a relação entre dois mapas.",
  trabalho: "Vocação, satisfação e dinheiro no mapa.",
  pergunta: "Uma pergunta, uma resposta em áudio.",
  aprender: "Cursos gravados para estudar no seu ritmo, ou formação individual com Yuri.",
};

function comparaHtml(id) {
  const c = COMPARA[id];
  if (!c) return "";
  const linhas = c.itens
    .map(([n, t, seg]) => {
      const regua = seg
        ? `<div class="regua" aria-hidden="true"><i style="background:repeating-linear-gradient(90deg,var(--brasa) 0 calc(100% / ${seg} - 2px),transparent calc(100% / ${seg} - 2px) calc(100% / ${seg}))"></i></div>`
        : "";
      return `<div><dt>${esc(n)}</dt>${regua}<dd>${esc(t)}</dd></div>`;
    })
    .join("");
  return `<div class="compara"><p class="compara__titulo mono">${esc(c.titulo)}</p><dl class="compara__linhas" style="--n:${c.itens.length}">${linhas}</dl></div>`;
}

const secoesHtml = D.secoes
  .map((s, n) => {
    const cards = D.itens.filter((i) => i.secao === s.id).map(cardHtml).join("\n");
    return `<section class="secao" id="${s.id}" aria-labelledby="h-${s.id}">
<div class="secao__cab"><span class="secao__num mono">${String(n + 1).padStart(2, "0")} / ${String(D.secoes.length).padStart(2, "0")}</span>
<h2 id="h-${s.id}">${esc(s.nome)}</h2><p class="secao__intro">${esc(INTRO[s.id] || "")}</p></div>
${comparaHtml(s.id)}
<div class="grade">
${cards}
</div>
</section>`;
  })
  .join("\n");

const visiveis = D.itens.filter((i) => !i.cenario || i.cenario === D.cenarioCursos);
const maxOff = Math.max(...visiveis.map((i) => off(i.referencia, i.precos[F0.id])));

const html = `<!doctype html>
<html lang="pt-BR" data-cenario="${D.cenarioCursos}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Ofertas · Black Friday Apocalíptica · Yuri dos Anjos</title>
<meta name="description" content="Consultas, cursos e mentoria de Yuri dos Anjos com até ${maxOff}% de desconto. Monte o pedido e envie pelo WhatsApp.">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#0B0A09">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="Black Friday Apocalíptica · Ofertas">
<meta property="og:description" content="Consultas, cursos e mentoria de Yuri dos Anjos. Monte o pedido e envie pelo WhatsApp.">
<link rel="icon" href="/bfa/assets/favicon.svg?v=1" type="image/svg+xml">
<style>${css}</style>
<script>document.documentElement.classList.add('js')</script>
</head>
<body>
<a class="pular" href="#ofertas">Pular para as ofertas</a>
<header class="topo">
<div class="topo__linha">
<p class="marca" style="margin:0">Yuri dos Anjos<span>Black Friday Apocalíptica</span></p>
<div class="relogio" id="relogio" aria-live="off">
<div><span id="relogio-rotulo">${esc(F0.rotulo)} · vale</span><b id="relogio-tempo">${esc(F0.validade)}</b></div>
<svg class="anel" viewBox="0 0 30 30" aria-hidden="true"><circle class="anel__fundo" cx="15" cy="15" r="12"/><circle class="anel__brasa" id="anel-brasa" cx="15" cy="15" r="12" stroke-dasharray="75.4" stroke-dashoffset="0"/><circle class="anel__lua" cx="15" cy="15" r="7.5"/></svg>
</div>
</div>
<nav class="atalhos" aria-label="Categorias de ofertas"><ul>
${D.secoes.map((s) => `<li><a href="#${s.id}" data-atalho="${s.id}">${esc(s.atalho)}</a></li>`).join("\n")}
</ul></nav>
</header>

<section class="portao" aria-labelledby="h-portao">
<div class="portao__caixa">
<p class="sobretitulo mono">Black Friday Apocalíptica</p>
<h1 id="h-portao" style="font-size:clamp(1.8rem,8vw,3rem);font-weight:900;letter-spacing:-.03em;line-height:1">As ofertas abrem hoje às 8h.</h1>
<p class="portao__hora" id="portao-tempo">--:--:--</p>
<p>A página se atualiza sozinha na hora da abertura. O link continua o mesmo.</p>
</div>
</section>

<section class="abertura" aria-labelledby="h-abertura">
<div class="abertura__ceu" aria-hidden="true"></div>
<div class="eclipse" aria-hidden="true"></div>
<div class="abertura__dentro">
<div class="abertura__grade">
<div>
<p class="sobretitulo mono"><span id="sobre-fase">${esc(F0.rotulo)}</span></p>
<h1 id="h-abertura">Os <em>maiores</em> descontos que eu já dei</h1>
<p class="abertura__sub">Até <strong><span id="max-off">${maxOff}</span>% de desconto</strong> em consultas, cursos e mentoria. <span id="validade">Esta condição vale ${esc(F0.validade)}.</span></p>
<ol class="passos" aria-label="Como pedir">
<li><b>1 Escolha</b>Toque em Adicionar</li>
<li><b>2 Revise</b>Confira o pedido e o total</li>
<li><b>3 Envie</b>Pelo WhatsApp. O pagamento vem depois</li>
</ol>
</div>
<div class="vitrine">
<p class="vitrine__titulo mono"><span>Comece por aqui</span></p>
<ul class="vitrine__fila">
${D.destaques.map(miniHtml).join("\n")}
</ul>
</div>
</div>
</div>
</section>

<div class="aviso" id="aviso" role="status" aria-live="polite" hidden><div class="aviso__caixa"><p style="margin:0" id="aviso-texto"></p><button type="button" id="aviso-fechar" aria-label="Fechar aviso">×</button></div></div>
<noscript><div class="aviso"><div class="aviso__caixa"><p style="margin:0">Para montar o pedido, ative o JavaScript ou <a href="https://wa.me/${D.whatsapp}?text=${encodeURIComponent("Olá! Quero fazer um pedido da Black Friday Apocalíptica.")}">fale com o atendimento pelo WhatsApp</a>.</p></div></div></noscript>

<main id="ofertas" tabindex="-1">
${secoesHtml}
</main>

<section class="como" aria-labelledby="h-como">
<h2 id="h-como">Como funciona o pedido</h2>
<ol>
<li>Escolha as ofertas e toque em Adicionar. Dá para levar mais de uma.</li>
<li>Toque em Revisar pedido para conferir itens, quantidades e o total.</li>
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
<p class="barra__resumo" style="margin:0"><span id="barra-qtd">0 itens no pedido</span><b id="barra-total">R$ 0</b></p>
<button type="button" class="btn" id="abrir-pedido">Revisar pedido</button>
</div>
</div>

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
