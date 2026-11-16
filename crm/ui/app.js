"use strict";
// CRM · Black Friday Apocalíptica — painel de dinheiro, gráficos e quadro (kanban) dos pedidos.
// Os dados vêm de /api/pedidos (mesma origem, cookie de login). Nada de cliente fica no código.
(() => {
  const BASE = document.body.dataset.base || "";
  const TZ = "America/Sao_Paulo";
  const H = 36e5;
  const OFF = 3 * H; // Brasília = UTC−3 (sem horário de verão)

  // Dias da campanha: o preço muda à meia-noite (dados/ofertas.json da /bfa).
  const FASES = [
    { id: "d16", dia: "16", sem: "seg", ini: Date.parse("2026-11-16T08:00:00-03:00"), fim: Date.parse("2026-11-17T00:00:00-03:00") },
    { id: "d17", dia: "17", sem: "ter", ini: Date.parse("2026-11-17T00:00:00-03:00"), fim: Date.parse("2026-11-18T00:00:00-03:00") },
    { id: "d18", dia: "18", sem: "qua", ini: Date.parse("2026-11-18T00:00:00-03:00"), fim: Date.parse("2026-11-19T00:00:00-03:00") },
    { id: "d19", dia: "19", sem: "qui", ini: Date.parse("2026-11-19T00:00:00-03:00"), fim: Date.parse("2026-11-20T00:00:00-03:00") },
  ];

  // Taxa do cartão que fica com o Yuri. Até 16/11 09h19 a InfinitePay repassava todas as taxas ao
  // cliente (líquido = valor do pedido). Depois, a conta absorve até 3x; de 4x em diante o cliente paga
  // o excedente e o Yuri fica com a taxa de 3x. Tabela lida na própria InfinitePay (payment_values) em 16/11.
  const TROCA_TAXA = Date.parse("2026-11-16T09:19:00-03:00");
  const TAXA = { 1: 4.2, 2: 6.09, 3: 7.01 };

  const ETAPAS = [
    { id: "aguardando", nome: "Aguardando pagamento", curto: "Aguardando", vazio: "Ninguém devendo." },
    { id: "pago", nome: "Pago", curto: "Pago", vazio: "Nenhum pago esperando começar." },
    { id: "producao", nome: "Em produção", curto: "Em produção", vazio: "Arraste para cá o que o Yuri começou." },
    { id: "entregue", nome: "Entregue", curto: "Entregue", vazio: "Nenhuma entrega ainda." },
  ];
  const CANC = { id: "cancelado", nome: "Cancelados", curto: "Cancelado", vazio: "Nenhum cancelado." };
  const PAGOS = new Set(["pago", "producao", "entregue"]);

  // ------------------------------------------------------------------ utilidades
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n, c) => (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: c ? 2 : 0, maximumFractionDigits: c ? 2 : 0 });
  const centavos = (n) => Math.round((Number(n) || 0) * 100) % 100 !== 0;
  const brl = (n) => "R$ " + (centavos(n) ? fmt(n, true) : fmt(Math.round(n)));
  const brl0 = (n) => "R$ " + fmt(Math.round(n));
  const curto = (n) => (n >= 1000 ? "R$ " + (n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: n >= 1e4 ? 0 : 1 }) + " mil" : "R$ " + fmt(Math.round(n)));
  const hora = (t) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const diaHora = (t) => new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ }).replace(",", " ·");
  const soma = (l, f) => l.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const porT = (a, b) => a.t - b.t;
  const reduzir = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const primeiro = (n) => String(n || "").trim().split(/\s+/)[0] || "Cliente";
  const linkCurto = (p) => "https://yuridosanjos.com.br/pg/" + p.codigo.replace(/^BFA-/, "");
  const ic = (d) => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    zap: ic('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>'),
    seta: ic('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'),
    x: ic('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    copiar: ic('<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
    abrir: ic('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
    relogio: ic('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
    nota: ic('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
    check: ic('<path d="M20 6 9 17l-5-5"/>'),
  };
  function haQuanto(t) {
    const ms = typeof t === "number" ? t : Date.parse(t);
    const m = Math.max(0, Math.round((Date.now() - ms) / 6e4));
    if (m < 1) return "agora";
    if (m < 60) return m + " min";
    const h = Math.floor(m / 60);
    if (h < 24) return h + "h" + (m % 60 ? String(m % 60).padStart(2, "0") : "");
    return Math.floor(h / 24) + "d";
  }
  function telefone(t) {
    const d = String(t || "").replace(/\D/g, "");
    if (/^55\d{10,11}$/.test(d)) { const n = d.slice(4); return `+55 ${d.slice(2, 4)} ${n.slice(0, -4)}-${n.slice(-4)}`; }
    return d ? "+" + d : "";
  }
  function zap(p) {
    const d = String(p.tel || "").replace(/\D/g, "");
    const msg = p.status === "aguardando" && p.link
      ? `Segue: ${linkCurto(p)}\nSó mandar o comprovante`
      : `Olá, ${primeiro(p.nome)}! Aqui é do atendimento do Yuri dos Anjos, sobre o seu pedido ${p.codigo} da Black Friday Apocalíptica.`;
    return "https://wa.me/" + d + "?text=" + encodeURIComponent(msg);
  }

  // dinheiro de cada pedido
  const parcelas = (p) => { const m = /(\d+)\s*x/i.exec(p.metodo || ""); return m ? +m[1] : 1; };
  const ehCartao = (p) => /cart/i.test(p.metodo || "");
  function taxaDe(p) {
    if (!PAGOS.has(p.status) || !ehCartao(p)) return 0;
    if (Date.parse(p.pagoEm || p.criado) < TROCA_TAXA) return 0;
    return TAXA[Math.min(parcelas(p), 3)] || 0;
  }
  const liquidoDe = (p) => Math.round(p.total * (100 - taxaDe(p))) / 100;

  // ------------------------------------------------------------------ estado
  let PED = [];
  let DIA = "tudo", BUSCA = "", VER_CANC = false, ABERTO = null, ARRASTANDO = null;
  const BRILHO = new Map();
  try { DIA = localStorage.getItem("crm-dia") || "tudo"; VER_CANC = localStorage.getItem("crm-canc") === "1"; } catch {}
  if (DIA !== "tudo" && !FASES.some((f) => f.id === DIA)) DIA = "tudo";
  const faseDe = (p) => p.fase || (FASES.find((f) => { const t = Date.parse(p.criado); return t >= f.ini && t < f.fim; }) || {}).id || "";
  const doDia = () => PED.filter((p) => DIA === "tudo" || faseDe(p) === DIA);
  const etapa = (id) => ETAPAS.find((e) => e.id === id) || CANC;
  const proxima = (id) => { const k = ETAPAS.findIndex((e) => e.id === id); return k >= 0 && k < ETAPAS.length - 1 ? ETAPAS[k + 1] : null; };

  async function api(metodo, url, corpo) {
    const r = await fetch(BASE + url, { method: metodo, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
    if (r.status === 401) { location.href = BASE + "/"; throw new Error("login"); }
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }
  const trocar = (n) => { PED = PED.map((x) => (x.codigo === n.codigo ? n : x)); };

  // ------------------------------------------------------------------ números
  function numeros(lista) {
    const ativos = lista.filter((p) => p.status !== "cancelado");
    const pagos = ativos.filter((p) => PAGOS.has(p.status));
    const ag = ativos.filter((p) => p.status === "aguardando");
    const fat = soma(pagos, (p) => p.total);
    const liq = soma(pagos, liquidoDe);
    const ent = soma(ag, (p) => p.total);
    return {
      ativos, pagos, ag, fat, liq, ent, taxas: Math.round((fat - liq) * 100) / 100, pos: fat + ent,
      conv: ativos.length ? pagos.length / ativos.length : 0,
      ticket: pagos.length ? fat / pagos.length : 0,
      fazer: ativos.filter((p) => p.status === "pago" || p.status === "producao").length,
      canc: lista.filter((p) => p.status === "cancelado"),
    };
  }
  function moeda(x, comCentavos) {
    let r = Math.floor(x + 1e-9), c = Math.round((x - r) * 100);
    if (c === 100) { r++; c = 0; }
    return `<span class="moeda">R$</span>${fmt(r)}${comCentavos && c ? `<span class="cent">,${String(c).padStart(2, "0")}</span>` : ""}`;
  }
  function contar(el, v, comCentavos) {
    const de = Number(el.dataset.v || 0);
    el.dataset.v = v;
    const pinta = (x) => { el.innerHTML = moeda(x, comCentavos); };
    if (reduzir || de === v) return pinta(v);
    const t0 = performance.now(), dur = 700;
    const passo = (agora) => {
      const k = Math.min(1, (agora - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      pinta(k < 1 ? de + (v - de) * e : v);
      if (k < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  function kpis(n) {
    contar($("#k-liq"), n.liq, true);
    $("#k-liq-sub").innerHTML = n.pagos.length
      ? `${plural(n.pagos.length, "pedido pago", "pedidos pagos")}${n.taxas > 0 ? ` · <b>${brl(n.taxas)}</b> de taxa do cartão` : " · sem taxa de cartão"}`
      : "Nenhum pagamento ainda";
    contar($("#k-fat"), n.fat);
    $("#k-fat-sub").textContent = n.pagos.length ? `ticket médio ${brl0(n.ticket)}` : "—";
    contar($("#k-ent"), n.ent);
    const velho = n.ag.reduce((m, p) => Math.min(m, Date.parse(p.criado)), Infinity);
    $("#k-ent-sub").textContent = n.ag.length ? `${plural(n.ag.length, "pedido esperando", "pedidos esperando")} · o mais antigo há ${haQuanto(velho)}` : "Ninguém devendo";
    $("#ir-aguardando").hidden = !n.ag.length;
    contar($("#k-pos"), n.pos);
    $("#k-pos-sub").textContent = `${plural(n.pagos.length + n.ag.length, "pedido", "pedidos")}${n.canc.length ? ` · ${plural(n.canc.length, "cancelado fora", "cancelados fora")}` : ""}`;
    // barra pago × a entrar (parte de um todo)
    const seg = $("#k-seg"), tot = n.fat + n.ent;
    const partes = [{ id: "pago", nome: "Pago", v: n.fat }, { id: "entrar", nome: "A entrar", v: n.ent }].filter((x) => x.v > 0);
    seg.innerHTML = tot ? partes.map((x) => `<span class="seg__b seg__b--${x.id}" style="flex-grow:${x.v}" data-dica="${esc(x.nome)}|${brl(x.v)}|${Math.round((x.v / tot) * 100)}% do total"></span>`).join("") : '<span class="seg__vazio"></span>';
    seg.setAttribute("aria-label", tot ? partes.map((x) => `${x.nome}: ${brl(x.v)} (${Math.round((x.v / tot) * 100)}%)`).join("; ") : "Sem pedidos");
    requestAnimationFrame(() => { for (const b of seg.children) { const pct = b.dataset.dica ? b.dataset.dica.split("|")[2].split(" ")[0] : ""; b.textContent = b.offsetWidth >= 52 ? pct : ""; } });
    $("#k-seg-leg").innerHTML = `<li><i class="sw sw--pago"></i>Pago <b>${brl0(n.fat)}</b></li><li><i class="sw sw--entrar"></i>A entrar <b>${brl0(n.ent)}</b></li>`;
    // faixa de números
    $("#k-conv").textContent = Math.round(n.conv * 100) + "%";
    $("#k-conv-sub").textContent = `${n.pagos.length} de ${n.ativos.length} pagaram`;
    $("#k-fazer").textContent = n.fazer;
    $("#k-fazer-sub").textContent = n.fazer ? "pagos sem entrega" : "tudo entregue";
    $("#k-taxa").textContent = brl(n.taxas);
    $("#k-taxa-sub").textContent = "cartão até 3x sai do Yuri";
    $("#k-canc").textContent = n.canc.length ? brl0(soma(n.canc, (p) => p.total)) : "R$ 0";
    $("#k-canc-sub").textContent = plural(n.canc.length, "pedido cancelado", "pedidos cancelados");
  }

  function dias() {
    const agora = Date.now();
    const hoje = (FASES.find((f) => agora >= f.ini && agora < f.fim) || {}).id;
    for (const b of $$("[data-dia]")) {
      const id = b.dataset.dia;
      b.setAttribute("aria-pressed", String(id === DIA));
      b.classList.toggle("dia--hoje", id === hoje);
      const l = PED.filter((p) => PAGOS.has(p.status) && (id === "tudo" || faseDe(p) === id));
      b.querySelector("small").textContent = l.length ? curto(soma(l, (p) => p.total)) : "—";
    }
  }

  // ------------------------------------------------------------------ gráfico: pedido × pago no tempo
  let TEMPO = null;
  function passoBonito(bruto) {
    if (!(bruto > 0)) return 100;
    const mag = 10 ** Math.floor(Math.log10(bruto)), n = bruto / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }
  const eixoValor = (v) => (v >= 1000 ? (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil" : fmt(v));
  function ticksTempo(t0, t1, pw) {
    const span = t1 - t0, max = Math.max(2, Math.floor(pw / 62)), out = [];
    const rotDia = (t) => { const d = new Date(t - OFF); return String(d.getUTCDate()).padStart(2, "0") + "/" + String(d.getUTCMonth() + 1).padStart(2, "0"); };
    if (span <= 40 * H) {
      const passo = [1, 2, 3, 4, 6, 8, 12].map((h) => h * H).find((p) => span / p <= max) || 12 * H;
      for (let t = Math.ceil((t0 - OFF) / passo) * passo + OFF; t <= t1; t += passo) {
        const h = new Date(t - OFF).getUTCHours();
        out.push({ t, rot: h === 0 ? rotDia(t) : h + "h", dia: h === 0 });
      }
      return out;
    }
    const passo = 24 * H * Math.max(1, Math.ceil(span / (24 * H) / max));
    for (let t = Math.ceil((t0 - OFF) / (24 * H)) * 24 * H + OFF; t <= t1; t += passo) out.push({ t, rot: rotDia(t), dia: true });
    return out;
  }
  const acumulado = (S, t) => { let c = 0; for (const s of S) { if (s.t <= t) c = s.c; else break; } return c; };

  function grafTempo(lista) {
    const box = $("#g-tempo");
    const ativos = lista.filter((p) => p.status !== "cancelado");
    const evPed = ativos.map((p) => ({ t: Date.parse(p.criado), v: p.total, txt: `${p.nome || p.codigo} pediu` })).sort(porT);
    const evPag = ativos.filter((p) => PAGOS.has(p.status)).map((p) => ({ t: Date.parse(p.pagoEm || p.criado), v: p.total, txt: `${p.nome || p.codigo} pagou` })).sort(porT);
    tabelaTempo(lista);
    if (!evPed.length) { box.innerHTML = '<p class="graf__vazio">Nenhum pedido neste dia ainda.</p>'; TEMPO = null; return; }
    const W = Math.max(300, Math.floor(box.clientWidth)), estreito = W < 560;
    const Hh = estreito ? 230 : 310;
    const m = { t: 16, r: estreito ? 80 : 98, b: 30, l: 46 };
    const f = FASES.find((x) => x.id === DIA);
    const fim = f ? f.fim : FASES[FASES.length - 1].fim;
    const t0 = Math.min(f ? f.ini : FASES[0].ini, evPed[0].t, evPag.length ? evPag[0].t : Infinity);
    let t1 = Math.max(Math.min(Date.now(), fim), evPed[evPed.length - 1].t, evPag.length ? evPag[evPag.length - 1].t : 0);
    if (t1 - t0 < H) t1 = t0 + H;
    const acum = (ev) => { let c = 0; return ev.map((e) => ({ ...e, c: (c += e.v) })); };
    const P = acum(evPed), G = acum(evPag);
    const totP = P[P.length - 1].c, totG = G.length ? G[G.length - 1].c : 0;
    const passo = passoBonito(totP / 4), yMax = Math.max(passo, Math.ceil(totP / passo) * passo);
    const pw = W - m.l - m.r, ph = Hh - m.t - m.b;
    const X = (t) => m.l + ((t - t0) / (t1 - t0)) * pw;
    const Y = (v) => m.t + ph - (v / yMax) * ph;
    const r1 = (n) => Math.round(n * 10) / 10;
    const degraus = (S) => { let d = `M${r1(X(t0))},${r1(Y(0))}`; for (const s of S) d += `H${r1(X(s.t))}V${r1(Y(s.c))}`; return d + `H${r1(X(t1))}`; };
    const linhaP = degraus(P), linhaG = degraus(G);
    let volta = `V${r1(Y(totG))}`;
    for (let i = G.length - 1; i >= 0; i--) volta += `H${r1(X(G[i].t))}V${r1(Y(i ? G[i - 1].c : 0))}`;
    const areaEntre = linhaP + volta + `H${r1(X(t0))}Z`;
    const areaPago = linhaG + `V${r1(Y(0))}H${r1(X(t0))}Z`;
    let grade = "";
    for (let v = passo; v <= yMax + 1e-6; v += passo) grade += `<line class="grade" x1="${m.l}" x2="${m.l + pw}" y1="${r1(Y(v))}" y2="${r1(Y(v))}"/>`;
    for (let v = 0; v <= yMax + 1e-6; v += passo) grade += `<text class="eixo" x="${m.l - 8}" y="${r1(Y(v)) + 3.5}" text-anchor="end">${eixoValor(v)}</text>`;
    const ticks = ticksTempo(t0, t1, pw);
    const xs = ticks.map((k) => `${k.dia ? `<line class="dia-sep" x1="${r1(X(k.t))}" x2="${r1(X(k.t))}" y1="${m.t}" y2="${m.t + ph}"/>` : ""}<text class="eixo" x="${r1(X(k.t))}" y="${m.t + ph + 19}" text-anchor="middle">${k.rot}</text>`).join("");
    const xp = X(t1), yP = Y(totP), yG = Y(totG);
    const rot = (y, v, n) => `<text x="${r1(xp + 10)}" y="${r1(y + 4)}"><tspan class="fim__v">${v}</tspan><tspan class="fim__n" x="${r1(xp + 10)}" dy="14">${n}</tspan></text>`;
    const fins = Math.abs(yP - yG) >= 30 ? rot(yP, brl0(totP), "PEDIDO") + rot(yG, brl0(totG), "PAGO") : rot(yG, brl0(totG), "PAGO");
    box.innerHTML = `<svg class="graf__svg" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" role="img" tabindex="0"
      aria-label="${esc(`Pedidos somam ${brl0(totP)}; pago ${brl0(totG)}; falta entrar ${brl0(totP - totG)}. Setas para ver cada momento.`)}">
      ${grade}${xs}
      <path class="area area--entrar" d="${areaEntre}"/><path class="area area--pago" d="${areaPago}"/>
      <line class="base" x1="${m.l}" x2="${m.l + pw}" y1="${r1(Y(0))}" y2="${r1(Y(0))}"/>
      <path class="linha linha--entrar" d="${linhaP}"/><path class="linha linha--pago" d="${linhaG}"/>
      <circle class="ponto ponto--entrar" cx="${r1(xp)}" cy="${r1(yP)}" r="4"/><circle class="ponto ponto--pago" cx="${r1(xp)}" cy="${r1(yG)}" r="4"/>
      ${fins}
      <g class="mira" hidden><line class="mira__l" y1="${m.t}" y2="${m.t + ph}"/><circle class="ponto ponto--entrar mira__p" r="4.5"/><circle class="ponto ponto--pago mira__g" r="4.5"/></g>
    </svg><div class="dica" hidden></div>`;
    const T = [...new Set([...P, ...G].map((e) => e.t))].sort((a, b) => a - b);
    TEMPO = { T, X, Y, P, G, t0, t1, m, pw, W, box, k: null };
  }
  function mira(k) {
    if (!TEMPO) return;
    const { T, X, Y, P, G, W, box } = TEMPO;
    k = Math.max(0, Math.min(T.length - 1, k));
    TEMPO.k = k;
    const t = T[k], vp = acumulado(P, t), vg = acumulado(G, t), x = X(t);
    const g = box.querySelector(".mira");
    g.hidden = false;
    const l = g.querySelector(".mira__l"); l.setAttribute("x1", x); l.setAttribute("x2", x);
    const cp = g.querySelector(".mira__p"); cp.setAttribute("cx", x); cp.setAttribute("cy", Y(vp));
    const cg = g.querySelector(".mira__g"); cg.setAttribute("cx", x); cg.setAttribute("cy", Y(vg));
    const d = box.querySelector(".dica");
    d.replaceChildren();
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    d.append(el("div", "dica__t", diaHora(t)));
    for (const [cor, v, nome] of [["var(--pago)", vg, "pago"], ["var(--entrar)", vp - vg, "a entrar"], ["var(--t3)", vp, "total pedido"]]) {
      const r = el("div", "dica__r"); const k2 = el("i", "dica__k"); k2.style.background = cor;
      r.append(k2, el("b", "", brl0(v)), el("span", "", nome)); d.append(r);
    }
    for (const e of [...P, ...G].filter((e) => e.t === t)) d.append(el("div", "dica__ev", `${e.txt} · ${brl0(e.v)}`));
    d.hidden = false;
    const largura = d.offsetWidth || 200, escala = box.clientWidth / W;
    let left = x * escala + 14;
    if (left + largura > box.clientWidth) left = x * escala - 14 - largura;
    d.style.left = Math.max(0, left) + "px";
  }
  function semMira() {
    if (!TEMPO) return;
    const g = TEMPO.box.querySelector(".mira"); if (g) g.hidden = true;
    const d = TEMPO.box.querySelector(".dica"); if (d) d.hidden = true;
    TEMPO.k = null;
  }
  function ligarMira() {
    const box = $("#g-tempo");
    box.addEventListener("pointermove", (e) => {
      if (!TEMPO) return;
      const svg = box.querySelector("svg"); if (!svg) return;
      const r = svg.getBoundingClientRect();
      const px = (e.clientX - r.left) * (TEMPO.W / r.width);
      if (px < TEMPO.m.l - 12 || px > TEMPO.m.l + TEMPO.pw + 12) return semMira();
      const t = TEMPO.t0 + ((px - TEMPO.m.l) / TEMPO.pw) * (TEMPO.t1 - TEMPO.t0);
      let k = 0, melhor = Infinity;
      TEMPO.T.forEach((tt, i) => { const d = Math.abs(tt - t); if (d < melhor) { melhor = d; k = i; } });
      mira(k);
    });
    box.addEventListener("pointerleave", () => { if (!box.contains(document.activeElement)) semMira(); });
    box.addEventListener("focusin", () => TEMPO && mira(TEMPO.k ?? TEMPO.T.length - 1));
    box.addEventListener("focusout", semMira);
    box.addEventListener("keydown", (e) => {
      if (!TEMPO) return;
      const k = TEMPO.k ?? TEMPO.T.length - 1;
      const novo = { ArrowLeft: k - 1, ArrowRight: k + 1, Home: 0, End: TEMPO.T.length - 1 }[e.key];
      if (novo == null) { if (e.key === "Escape") semMira(); return; }
      e.preventDefault(); mira(novo);
    });
  }
  function tabelaTempo(lista) {
    const linhas = FASES.map((f) => {
      const l = lista.filter((p) => faseDe(p) === f.id && p.status !== "cancelado");
      const pg = l.filter((p) => PAGOS.has(p.status)), ag = l.filter((p) => p.status === "aguardando");
      return l.length ? `<tr><td>${f.dia}/11 ${f.sem}</td><td>${l.length}</td><td>${brl(soma(pg, (p) => p.total))}</td><td>${brl(soma(pg, liquidoDe))}</td><td>${brl(soma(ag, (p) => p.total))}</td></tr>` : "";
    }).join("");
    $("#t-tempo").innerHTML = linhas ? `<table class="tab"><thead><tr><th>Dia</th><th>Pedidos</th><th>Faturamento</th><th>Líquido</th><th>A entrar</th></tr></thead><tbody>${linhas}</tbody></table>` : "";
  }

  // ------------------------------------------------------------------ gráfico: receita por oferta
  function grafOfertas(lista) {
    const mapa = new Map();
    for (const p of lista) {
      const pago = PAGOS.has(p.status);
      if (!pago && p.status !== "aguardando") continue;
      const base = soma(p.itens, (i) => (i.preco || 0) * (i.qtd || 1));
      for (const i of p.itens) {
        const k = i.id || i.nome;
        const r = mapa.get(k) || { nome: i.nome || k, pago: 0, ent: 0, qp: 0, qe: 0 };
        const v = base ? (i.preco || 0) * (i.qtd || 1) : p.total / p.itens.length;
        if (pago) { r.pago += v; r.qp += i.qtd || 1; } else { r.ent += v; r.qe += i.qtd || 1; }
        mapa.set(k, r);
      }
    }
    const rows = [...mapa.values()].sort((a, b) => b.pago + b.ent - (a.pago + a.ent));
    const el = $("#g-ofertas");
    if (!rows.length) { el.innerHTML = '<p class="graf__vazio">Nenhuma oferta pedida neste dia ainda.</p>'; $("#t-ofertas").innerHTML = ""; return; }
    const max = rows[0].pago + rows[0].ent;
    el.innerHTML = rows.map((r) => {
      const qt = [r.qp ? `${r.qp} pag${r.qp > 1 ? "as" : "a"}` : "", r.qe ? `${r.qe} aguardando` : ""].filter(Boolean).join(" · ");
      const bP = r.pago ? `<span class="of__b of__b--pago${r.ent ? "" : " fim"}" style="--f:${(r.pago / max).toFixed(4)}" data-dica="${esc(r.nome)}|${brl0(r.pago)}|pago · ${r.qp} un."></span>` : "";
      const bE = r.ent ? `<span class="of__b of__b--entrar fim" style="--f:${(r.ent / max).toFixed(4)}" data-dica="${esc(r.nome)}|${brl0(r.ent)}|a entrar · ${r.qe} un."></span>` : "";
      return `<li class="of"><span class="of__nome">${esc(r.nome)}<small>${qt}</small></span><span class="of__trilho">${bP}${bE}<span class="of__v">${brl0(r.pago + r.ent)}</span></span></li>`;
    }).join("");
    $("#t-ofertas").innerHTML = `<table class="tab"><thead><tr><th>Oferta</th><th>Pagas</th><th>Pago</th><th>A entrar</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.nome)}</td><td>${r.qp}</td><td>${brl0(r.pago)}</td><td>${brl0(r.ent)}</td></tr>`).join("")}</tbody></table>`;
  }

  // ------------------------------------------------------------------ quadro
  const ORDEM = {
    aguardando: (a, b) => Date.parse(a.criado) - Date.parse(b.criado),
    pago: (a, b) => Date.parse(a.pagoEm || a.criado) - Date.parse(b.pagoEm || b.criado),
    producao: (a, b) => Date.parse(a.atualizado) - Date.parse(b.atualizado),
    entregue: (a, b) => Date.parse(b.entregueEm || b.atualizado) - Date.parse(a.entregueEm || a.atualizado),
    cancelado: (a, b) => Date.parse(b.atualizado) - Date.parse(a.atualizado),
  };
  function cartao(p) {
    const prox = proxima(p.status);
    const itens = p.itens.map((i) => (i.qtd > 1 ? i.qtd + "× " : "") + i.nome).join(" · ");
    const ent = p.itens.filter((i) => i.entregue).length;
    let meta = "";
    if (p.status === "aguardando") {
      const min = (Date.now() - Date.parse(p.criado)) / 6e4;
      meta = `<span class="card__meta${min > 60 ? " card__meta--alerta" : ""}" title="Pediu ${esc(diaHora(p.criado))}">${I.relogio}há ${haQuanto(p.criado)}</span>`;
    } else if (p.status === "pago") meta = `<span class="card__meta" title="Pago ${esc(diaHora(p.pagoEm || p.criado))}">pagou há ${haQuanto(p.pagoEm || p.criado)}</span>`;
    else if (p.status === "producao") meta = `<span class="card__meta">${ent}/${p.itens.length} entregues</span>`;
    else if (p.status === "entregue") meta = `<span class="card__meta">${I.check}${esc(diaHora(p.entregueEm || p.atualizado))}</span>`;
    else meta = `<span class="card__meta">cancelado</span>`;
    const prog = (p.status === "producao" || p.status === "pago") && p.itens.length > 1 ? `<div class="prog" aria-hidden="true">${p.itens.map((i) => `<i class="${i.entregue ? "ok" : ""}"></i>`).join("")}</div>` : "";
    const brilho = (BRILHO.get(p.codigo) || 0) > Date.now() ? " card--brilho" : "";
    return `<article class="card${brilho}" draggable="true" tabindex="0" data-c="${esc(p.codigo)}" aria-label="${esc(`${p.nome}, ${brl(p.total)}, ${etapa(p.status).curto}`)}">
      <div class="card__topo"><span class="card__cod">${esc(p.codigo.replace(/^BFA-/, ""))}</span><span>${esc(hora(p.criado))}</span>${p.metodo ? `<span class="tag">${esc(p.metodo)}</span>` : ""}${p.obs ? `<span class="tag tag--nota" title="Tem anotação">${I.nota}</span>` : ""}</div>
      <p class="card__nome">${esc(p.nome || "Sem nome")}</p>
      <p class="card__itens">${esc(itens)}</p>${prog}
      <div class="card__pe"><span class="card__total">${brl(p.total)}</span>${meta}
        ${p.tel ? `<a class="ico ico--zap" href="${esc(zap(p))}" target="_blank" rel="noopener" draggable="false" aria-label="WhatsApp de ${esc(p.nome)}" title="${p.status === "aguardando" ? "Mandar o link de novo" : "Abrir WhatsApp"}">${I.zap}</a>` : ""}
        ${prox ? `<button class="ico" type="button" data-mover="${prox.id}" aria-label="Mover para ${prox.curto}" title="Mover para ${prox.curto}">${I.seta}</button>` : ""}
      </div></article>`;
  }
  function quadro(lista) {
    const q = BUSCA;
    const vis = lista.filter((p) => !q || [p.nome, p.tel, p.codigo, p.obs, ...p.itens.map((i) => i.nome)].join(" ").toLowerCase().includes(q));
    const cols = VER_CANC ? [...ETAPAS, CANC] : ETAPAS;
    const foco = document.activeElement?.closest?.(".card")?.dataset.c;
    const el = $("#colunas");
    el.style.setProperty("--n", cols.length);
    el.innerHTML = cols.map((e) => {
      const l = vis.filter((p) => p.status === e.id).sort(ORDEM[e.id]);
      return `<section class="col col--${e.id}" data-drop="${e.id}" aria-label="${esc(e.nome)}">
        <header class="col__cab"><i class="col__ponto"></i><h3>${e.nome}</h3><span class="col__n">${l.length}</span><span class="col__soma">${l.length ? brl0(soma(l, (p) => p.total)) : ""}</span></header>
        <div class="col__lista">${l.length ? l.map(cartao).join("") : `<p class="col__vazio">${q ? "Nada com essa busca." : e.vazio}</p>`}</div></section>`;
    }).join("");
    $("#n-busca").textContent = q ? plural(vis.length, "pedido encontrado", "pedidos encontrados") : "";
    if (foco) $(`.card[data-c="${CSS.escape(foco)}"]`)?.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ desenho geral
  function desenhar() {
    const lista = doDia();
    const n = numeros(lista);
    dias(); kpis(n); grafTempo(lista); grafOfertas(lista); quadro(lista);
    const geral = numeros(PED);
    document.title = `${brl0(geral.liq)} líquido · CRM BFA`;
  }

  // ------------------------------------------------------------------ mover entre etapas
  async function mover(codigo, para, restaurar) {
    const p = PED.find((x) => x.codigo === codigo);
    if (!p || (!restaurar && p.status === para)) return;
    const antes = { status: p.status, pagoEm: p.pagoEm || null, entregues: p.itens.map((i) => !!i.entregue) };
    const copia = JSON.parse(JSON.stringify(p));
    const corpo = restaurar || { status: para };
    p.status = corpo.status;
    if (p.status === "entregue" && !restaurar) p.itens.forEach((i) => (i.entregue = true));
    if (PAGOS.has(p.status) && !p.pagoEm) p.pagoEm = new Date().toISOString();
    if (restaurar) { p.pagoEm = restaurar.pagoEm; p.itens.forEach((i, k) => (i.entregue = !!restaurar.entregues[k])); }
    desenhar();
    try {
      trocar(await api("PATCH", "/api/pedidos/" + encodeURIComponent(codigo), corpo));
      desenhar();
      if (ABERTO === codigo) gaveta();
      if (!restaurar) aviso(`${primeiro(p.nome)} → ${etapa(para).curto}${para === "pago" && antes.status === "aguardando" ? " (marcado à mão)" : ""}`, { acao: "Desfazer", fn: () => mover(codigo, antes.status, antes) });
    } catch (e) {
      if (e.message === "login") return;
      trocar(copia); desenhar();
      aviso("Não deu para mover. Tente de novo.", { tipo: "erro" });
    }
  }

  // ------------------------------------------------------------------ gaveta (detalhe)
  const dlg = $("#gaveta");
  function abrir(codigo) { ABERTO = codigo; gaveta(); if (!dlg.open) dlg.showModal(); }
  function gaveta() {
    const p = PED.find((x) => x.codigo === ABERTO);
    if (!p) { if (dlg.open) dlg.close(); return; }
    const k = ETAPAS.findIndex((e) => e.id === p.status);
    const pago = PAGOS.has(p.status);
    const opcoes = ["", "Pix", ...Array.from({ length: 12 }, (_, i) => `Cartão ${i + 1}x`), "Mercado Pago", "Remessa exterior"];
    const atual = /cart/i.test(p.metodo || "") ? `Cartão ${parcelas(p)}x` : p.metodo || "";
    const taxa = taxaDe(p);
    const ent = p.itens.filter((i) => i.entregue).length;
    $("#gaveta-conteudo").innerHTML = `<div class="gv">
      <header class="gv-cab"><div><p class="gv-cod">${esc(p.codigo)} · pediu ${esc(diaHora(p.criado))}</p><h2 id="gv-nome">${esc(p.nome || "Sem nome")}</h2>${p.tel ? `<p class="gv-tel">${esc(telefone(p.tel))}</p>` : ""}</div>
        <button class="ico" type="button" data-fechar aria-label="Fechar">${I.x}</button></header>
      <div class="gv-corpo">
        ${p.tel ? `<a class="btn btn--zap gv-zap" target="_blank" rel="noopener" href="${esc(zap(p))}">${I.zap}${p.status === "aguardando" && p.link ? "Mandar o link no WhatsApp" : "Abrir WhatsApp"}</a>` : ""}
        ${p.status === "cancelado" ? '<p class="gv-aviso">Pedido cancelado. Não entra em nenhuma soma.</p>' : ""}
        <nav class="etapas" aria-label="Etapa do pedido">${ETAPAS.map((e, i) => `<button type="button" class="etapa etapa--${e.id}${k >= 0 && i <= k ? " feita" : ""}" data-mover="${e.id}"${e.id === p.status ? ' aria-current="step"' : ""}><i></i>${e.curto}</button>`).join("")}</nav>
        <section class="gv-sec"><h3>Itens <span>${p.itens.length > 0 ? `${ent} de ${p.itens.length} entregue${p.itens.length > 1 ? "s" : ""}` : ""}</span></h3>
          <ul class="gv-itens">${p.itens.map((i, n) => `<li><label><input type="checkbox" data-ent="${n}" ${i.entregue ? "checked" : ""} aria-label="Entregue: ${esc(i.nome)}"><span>${i.qtd > 1 ? i.qtd + "× " : ""}${esc(i.nome)}</span></label><b>${i.preco ? brl(i.preco * (i.qtd || 1)) : ""}</b></li>`).join("")}</ul>
          <p class="gv-total"><span>Total do pedido</span><b>${brl(p.total)}</b></p></section>
        <section class="gv-sec"><h3>Pagamento</h3>
          <dl class="gv-dl">
            <dt>Situação</dt><dd>${pago ? `Pago ${esc(diaHora(p.pagoEm || p.criado))}` : p.status === "cancelado" ? "Cancelado" : "Aguardando"}</dd>
            ${pago ? `<dt>Forma</dt><dd><select id="g-metodo" aria-label="Forma de pagamento">${opcoes.map((o) => `<option value="${o}"${o === atual ? " selected" : ""}>${o || "não informada"}</option>`).join("")}</select></dd>
            <dt>Líquido</dt><dd class="gv-liq">${brl(liquidoDe(p))}${taxa ? ` <small style="color:var(--t3);font-weight:500">(taxa ${String(taxa).replace(".", ",")}%)</small>` : ""}</dd>` : ""}
            ${p.pagoValor ? `<dt>Cliente pagou</dt><dd>${brl(p.pagoValor)}</dd>` : ""}
            ${p.recibo ? `<dt>Comprovante</dt><dd><a href="${esc(p.recibo)}" target="_blank" rel="noopener">abrir</a></dd>` : ""}
          </dl>
          ${p.link ? `<div class="gv-link"><code>${esc(linkCurto(p).replace("https://", ""))}</code><button class="ico" type="button" data-copiar="${esc(linkCurto(p))}" aria-label="Copiar link" title="Copiar link">${I.copiar}</button><a class="ico" href="${esc(p.link)}" target="_blank" rel="noopener" aria-label="Abrir checkout" title="Abrir checkout">${I.abrir}</a></div>` : ""}
        </section>
        <section class="gv-sec"><h3><label for="g-obs">Anotações</label></h3>
          <textarea id="g-obs" class="gv-obs" placeholder="Pra quem é cada item, datas e horários de nascimento, prazos combinados">${esc(p.obs)}</textarea>
          <p class="gv-salvo" id="g-salvo" aria-live="polite"></p></section>
      </div>
      <footer class="gv-pe">${p.status === "cancelado" ? '<button class="btn btn--fantasma" type="button" data-mover="aguardando">Reabrir pedido</button>' : '<button class="btn btn--perigo" type="button" data-cancelar>Cancelar pedido</button>'}
        <span style="color:var(--t3);font-size:12px">Atualizado ${esc(diaHora(p.atualizado))}</span></footer></div>`;
  }
  dlg.addEventListener("close", () => { ABERTO = null; document.body.append($("#avisos")); });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  let obsTimer = null;
  async function salvarObs() {
    clearTimeout(obsTimer);
    const ta = $("#g-obs"); if (!ta || !ABERTO) return;
    const p = PED.find((x) => x.codigo === ABERTO);
    if (!p || ta.value === (p.obs || "")) return;
    $("#g-salvo").textContent = "Salvando…";
    try { trocar(await api("PATCH", "/api/pedidos/" + encodeURIComponent(ABERTO), { obs: ta.value })); $("#g-salvo").textContent = "Salvo"; quadro(doDia()); }
    catch { $("#g-salvo").textContent = "Não salvou. Tente de novo."; }
  }

  // ------------------------------------------------------------------ avisos
  function aviso(txt, { acao, fn, tipo } = {}) {
    const el = document.createElement("div");
    el.className = "aviso" + (tipo ? " aviso--" + tipo : "");
    el.setAttribute("role", tipo === "erro" ? "alert" : "status");
    const s = document.createElement("span"); s.textContent = txt; el.append(s);
    if (acao) { const b = document.createElement("button"); b.type = "button"; b.textContent = acao; b.onclick = () => { el.remove(); fn(); }; el.append(b); }
    // com a gaveta aberta o resto da página fica inerte: o aviso mora dentro dela para o "Desfazer" funcionar
    const caixa = $("#avisos"), lugar = dlg.open ? dlg : document.body;
    if (caixa.parentElement !== lugar) lugar.append(caixa);
    caixa.append(el);
    const vida = tipo === "pago" ? 9000 : 6500;
    setTimeout(() => el.classList.add("aviso--sai"), vida);
    setTimeout(() => el.remove(), vida + 400);
  }
  function mudancas(antes, depois) {
    const mapa = new Map(antes.map((p) => [p.codigo, p]));
    for (const p of depois) {
      const a = mapa.get(p.codigo);
      if (!a) { aviso(`Novo pedido · ${p.nome} · ${brl(p.total)}`); BRILHO.set(p.codigo, Date.now() + 8000); }
      else if (a.status === "aguardando" && PAGOS.has(p.status)) { aviso(`Pagou! ${p.nome} · ${brl(p.total)}${p.metodo ? " · " + p.metodo : ""}`, { tipo: "pago" }); BRILHO.set(p.codigo, Date.now() + 8000); }
    }
  }

  // dica flutuante (barras e segmentos)
  const flut = document.createElement("div");
  flut.className = "dica-flut"; flut.hidden = true; document.body.append(flut);
  document.addEventListener("pointerover", (e) => {
    const alvo = e.target.closest?.("[data-dica]");
    if (!alvo) { flut.hidden = true; return; }
    const [nome, valor, extra] = alvo.dataset.dica.split("|");
    flut.replaceChildren();
    const a = document.createElement("b"); a.textContent = valor;
    const b = document.createElement("span"); b.textContent = `${nome} · ${extra || ""}`;
    flut.append(a, b); flut.hidden = false;
  });
  document.addEventListener("pointermove", (e) => {
    if (flut.hidden) return;
    const x = Math.min(e.clientX + 14, innerWidth - flut.offsetWidth - 8);
    flut.style.left = x + "px"; flut.style.top = e.clientY + 16 + "px";
  });

  // ------------------------------------------------------------------ eventos
  document.addEventListener("click", async (e) => {
    const d = e.target.closest("[data-dia]");
    if (d) { DIA = d.dataset.dia; try { localStorage.setItem("crm-dia", DIA); } catch {} desenhar(); return; }
    const mv = e.target.closest("[data-mover]");
    if (mv) { const c = mv.closest("[data-c]")?.dataset.c || ABERTO; if (c) mover(c, mv.dataset.mover); return; }
    if (e.target.closest("[data-fechar]")) { dlg.close(); return; }
    const cp = e.target.closest("[data-copiar]");
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copiar); aviso("Link copiado"); } catch { aviso("Não deu para copiar", { tipo: "erro" }); } return; }
    const cn = e.target.closest("[data-cancelar]");
    if (cn) {
      if (!cn.classList.contains("confirmar")) { cn.classList.add("confirmar"); cn.textContent = "Confirmar cancelamento"; setTimeout(() => { if (cn.isConnected) { cn.classList.remove("confirmar"); cn.textContent = "Cancelar pedido"; } }, 4000); return; }
      mover(ABERTO, "cancelado"); return;
    }
    if (e.target.closest("#ir-aguardando")) { $(".col--aguardando")?.scrollIntoView({ behavior: reduzir ? "auto" : "smooth", block: "start", inline: "start" }); return; }
    const card = e.target.closest(".card");
    if (card && !e.target.closest("a,button")) abrir(card.dataset.c);
  });
  document.addEventListener("keydown", (e) => {
    const card = e.target.closest?.(".card");
    if (card && e.target === card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); abrir(card.dataset.c); }
  });
  document.addEventListener("change", async (e) => {
    if (e.target.matches("#gaveta [data-ent]")) {
      const c = ABERTO; const ent = $$("#gaveta [data-ent]").map((i) => i.checked);
      try {
        const n = await api("PATCH", "/api/pedidos/" + encodeURIComponent(c), { entregues: ent });
        trocar(n); desenhar(); gaveta();
        if (ent.every(Boolean) && (n.status === "pago" || n.status === "producao")) aviso(`Tudo entregue para ${primeiro(n.nome)}.`, { acao: "Mover para Entregue", fn: () => mover(c, "entregue") });
      } catch { aviso("Não salvou. Tente de novo.", { tipo: "erro" }); }
    }
    if (e.target.id === "g-metodo") {
      try { trocar(await api("PATCH", "/api/pedidos/" + encodeURIComponent(ABERTO), { metodo: e.target.value })); desenhar(); gaveta(); }
      catch { aviso("Não salvou. Tente de novo.", { tipo: "erro" }); }
    }
    if (e.target.id === "ver-canc") { VER_CANC = e.target.checked; try { localStorage.setItem("crm-canc", VER_CANC ? "1" : "0"); } catch {} quadro(doDia()); }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "g-obs") { $("#g-salvo").textContent = ""; clearTimeout(obsTimer); obsTimer = setTimeout(salvarObs, 900); }
    if (e.target.id === "busca") { BUSCA = e.target.value.trim().toLowerCase(); quadro(doDia()); }
  });
  document.addEventListener("focusout", (e) => { if (e.target.id === "g-obs") salvarObs(); });

  // arrastar e soltar (computador). No celular: botão → do cartão e etapas na gaveta.
  const colunas = $("#colunas");
  colunas.addEventListener("dragstart", (e) => {
    const c = e.target.closest?.(".card"); if (!c) return;
    ARRASTANDO = c.dataset.c;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", ARRASTANDO);
    requestAnimationFrame(() => c.classList.add("card--fantasma"));
  });
  colunas.addEventListener("dragend", () => {
    ARRASTANDO = null;
    $$(".col--alvo").forEach((x) => x.classList.remove("col--alvo"));
    $$(".card--fantasma").forEach((x) => x.classList.remove("card--fantasma"));
  });
  colunas.addEventListener("dragover", (e) => {
    const z = e.target.closest?.("[data-drop]"); if (!z || !ARRASTANDO) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "move";
    $$(".col--alvo").forEach((x) => x !== z && x.classList.remove("col--alvo"));
    z.classList.add("col--alvo");
  });
  colunas.addEventListener("dragleave", (e) => { const z = e.target.closest?.("[data-drop]"); if (z && !z.contains(e.relatedTarget)) z.classList.remove("col--alvo"); });
  colunas.addEventListener("drop", (e) => {
    const z = e.target.closest?.("[data-drop]"); if (!z) return;
    e.preventDefault();
    const c = e.dataTransfer.getData("text/plain") || ARRASTANDO;
    z.classList.remove("col--alvo"); ARRASTANDO = null;
    if (c) mover(c, z.dataset.drop);
  });

  // novo pedido (à mão; o normal é o pedido.mjs, que já gera o link)
  const novo = $("#dlg-novo");
  $("#novo").addEventListener("click", () => novo.showModal());
  novo.addEventListener("click", (e) => { if (e.target === novo) novo.close(); });
  $("#form-novo").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const itens = String(f.get("itens")).split("\n").map((s) => s.trim()).filter(Boolean).map((s) => { const m = /^(\d+)\s*[x×]\s*(.+)$/i.exec(s); return m ? { qtd: +m[1], nome: m[2] } : { qtd: 1, nome: s }; });
    const dig = String(f.get("tel")).replace(/\D/g, "");
    try {
      const r = await api("POST", "/api/pedidos", { nome: f.get("nome"), tel: dig.length === 10 || dig.length === 11 ? "55" + dig : dig, itens, total: +String(f.get("total")).replace(/[^\d,]/g, "").replace(",", "."), link: f.get("link"), status: f.get("status") });
      const p = r.pedidos[0]; PED.unshift(p); BRILHO.set(p.codigo, Date.now() + 8000);
      e.target.reset(); novo.close(); desenhar(); aviso(`Pedido ${p.codigo} criado`);
    } catch (err) { if (err.message !== "login") aviso("Não deu para criar. Confira os campos.", { tipo: "erro" }); }
  });
  $("#cancelar-novo").addEventListener("click", () => novo.close());

  // ------------------------------------------------------------------ ao vivo
  function vivo(ok) {
    const v = $("#vivo");
    v.classList.toggle("vivo--off", !ok);
    v.querySelector("span").textContent = ok ? "ao vivo · " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: TZ }) : "sem conexão";
  }
  async function carregar(primeira) {
    try {
      const novos = (await api("GET", "/api/pedidos")).pedidos;
      if (!primeira) mudancas(PED, novos);
      PED = novos; vivo(true);
      if (!ARRASTANDO) desenhar();
      const ativo = document.activeElement;
      if (ABERTO && !(dlg.contains(ativo) && ativo.matches("textarea,select,input"))) gaveta();
    } catch (e) { if (e.message !== "login") vivo(false); }
  }

  $("#ver-canc").checked = VER_CANC;
  ligarMira();
  let largura = 0;
  new ResizeObserver(() => { const w = $("#g-tempo").clientWidth; if (Math.abs(w - largura) > 2 && PED.length) { largura = w; grafTempo(doDia()); } }).observe($("#g-tempo"));
  carregar(true);
  setInterval(carregar, 20000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) carregar(); });
})();
