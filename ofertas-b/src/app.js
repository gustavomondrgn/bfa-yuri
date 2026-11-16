(function () {
  "use strict";
  var doc = document.documentElement;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var D = JSON.parse($("#dados").textContent);
  var Q = new URLSearchParams(location.search);
  var PREVIA = Q.has("previa");
  var PROPOSTA = PREVIA && Q.get("proposta") === "1";
  var PORTAO = false;
  var ESGOTAR = PREVIA && Q.get("esgotar") ? Q.get("esgotar").split(",") : [];
  var VICENTE = false;
  var CENARIO = D.cenarioCursos; // decidido: dois pacotes (Astrologia e Religião)
  // página B: pedido salvo à parte (não mistura com o da /bfa no mesmo aparelho)
  var CHAVE = "bfa-b-pedido-v1";
  // dados ao vivo da página A (mesmo domínio); se não houver, o reserva gerado com a B
  var JSON_URLS = ["/bfa/ofertas.json", "/bfa-b/ofertas.json"];
  // a mídia da A mora em /bfa/assets; aqui, a mesma cópia está em /bfa-b/assets
  function midia(u) { return String(u || "").replace(/^\/bfa\//, "/bfa-b/"); }
  var REDUZIR = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  doc.setAttribute("data-cenario", CENARIO);

  // ------------------------------------------------------------ Meta Pixel --
  // PageView, AddToCart e InitiateCheckout (envio ao WhatsApp). Nunca Purchase:
  // o pagamento acontece fora da página. Desligado na prévia, salvo ?pixel=1.
  var UTMS = {};
  try {
    ["utm_source", "utm_medium", "utm_campaign", "utm_content"].forEach(function (k) {
      var v = (Q.get(k) || "").trim();
      if (v && /^[A-Za-z0-9_.\-]{1,100}$/.test(v)) UTMS[k] = v;
    });
  } catch (e) {}
  var medir = function () {};
  (function () {
    var id = String(D.pixel || "").trim();
    if (!/^\d{8,20}$/.test(id) || (PREVIA && Q.get("pixel") !== "1")) return;
    try {
      if (typeof window.fbq !== "function") {
        !function (f, b, e, v, n, t, s) {
          if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
          if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
          t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0];
          var feito = false, uma = function () { if (!feito) { feito = true; s.parentNode.insertBefore(t, s); } };
          if (window.requestAnimationFrame) requestAnimationFrame(function () { setTimeout(uma, 0); });
          setTimeout(uma, 300);
        }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
        window.fbq("set", "autoConfig", false, id);
        window.fbq("init", id);
        window.fbq("track", "PageView", UTMS);
      }
      medir = function (evento, dados) {
        try { window.fbq("track", evento, Object.assign({}, UTMS, dados)); } catch (e) {}
      };
    } catch (e) {}
  })();

  // ------------------------------------------------------------ relógio --
  var offset = 0, simBase = null, simReal = 0;
  if (PREVIA && Q.get("agora")) {
    var t0 = Date.parse(Q.get("agora"));
    if (!isNaN(t0)) { simBase = t0; simReal = Date.now(); }
  }
  function agora() { return simBase !== null ? simBase + (Date.now() - simReal) : Date.now() + offset; }

  var fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  var fmtDia = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  function brl(n) { return "R$ " + n.toLocaleString("pt-BR"); }

  // -------------------------------------------------------------- dados --
  var itens = {};
  function indexar() { itens = {}; D.itens.forEach(function (i) { itens[i.id] = i; }); }
  indexar();
  function noCenario(i) { return !i.cenario || i.cenario === CENARIO; }

  function situacao(t) {
    var f = D.fases;
    if (t < Date.parse(f[0].inicio)) return { estado: "antes", fase: f[0], prox: Date.parse(f[0].inicio) };
    for (var k = 0; k < f.length; k++) {
      var ini = Date.parse(f[k].inicio), fim = Date.parse(f[k].fim);
      if (t >= ini && t < fim) return { estado: "ativa", fase: f[k], ini: ini, fim: fim };
    }
    return { estado: "encerrada", fase: f[f.length - 1] };
  }
  function faseDe(id) { for (var k = 0; k < D.fases.length; k++) if (D.fases[k].id === id) return D.fases[k]; return null; }

  function preco(i, fase) {
    if (!fase || !i.precos) return null;
    var v = i.precos[fase.id];
    if (v == null && PROPOSTA && D.regraProposta && D.regraProposta[fase.id] != null) {
      var base = i.precos[D.fases[0].id];
      var bruto = base + (i.referencia - base) * D.regraProposta[fase.id];
      v = Math.ceil((bruto - 7) / 10) * 10 + 7;
    }
    return v == null ? null : v;
  }
  function disponivel(i) {
    if (i.esgotado || ESGOTAR.indexOf(i.id) >= 0) return false;
    return i.vagas == null || i.vagas > 0;
  }
  function limite(i) { return i.vagas == null ? 5 : Math.min(i.vagas, 10); }

  // ------------------------------------------------------------- pedido --
  var pedido = { itens: {}, fase: null, codigo: null };
  try { var salvo = JSON.parse(localStorage.getItem(CHAVE)); if (salvo && salvo.itens) pedido = salvo; } catch (e) {}
  function salvar() { try { localStorage.setItem(CHAVE, JSON.stringify(pedido)); } catch (e) {} }
  function linhas() {
    return Object.keys(pedido.itens).filter(function (id) { return itens[id] && pedido.itens[id] > 0 && noCenario(itens[id]); });
  }
  function totais(fase) {
    var qtd = 0, total = 0, faltaPreco = false;
    linhas().forEach(function (id) {
      var q = pedido.itens[id], v = preco(itens[id], fase);
      qtd += q;
      if (v == null) faltaPreco = true; else total += v * q;
    });
    return { qtd: qtd, total: total, faltaPreco: faltaPreco };
  }
  function codigo() {
    var a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", s = "";
    for (var k = 0; k < 4; k++) s += a[Math.floor(Math.random() * a.length)];
    return "BFA-" + s;
  }

  // ------------------------------------------------------------- render --
  var atual = situacao(agora());
  function faseExibida() { return atual.fase; }
  // na prévia sem portão, o pedido funciona antes das 8h com os preços da abertura
  function podeVender() { return atual.estado === "ativa" || (atual.estado === "antes" && !PORTAO); }

  function renderPreco(el, i, fase, animar) {
    var v = preco(i, fase);
    var por = $("[data-por]", el), offEl = $("[data-off]", el), box = el.matches("[data-preco]") ? el : $("[data-preco]", el);
    if (!box) return;
    if (v == null) {
      por.innerHTML = '<span class="preco__breve">Preço de ' + fase.curto + " em breve</span>";
      offEl.hidden = true;
      return;
    }
    var antes = por.textContent;
    por.innerHTML = "<small>R$</small>" + v.toLocaleString("pt-BR");
    offEl.hidden = false;
    offEl.textContent = "−" + Math.round((1 - v / i.referencia) * 100) + "%";
    if (animar && antes !== por.textContent && !REDUZIR) {
      box.classList.remove("mare"); void box.offsetWidth; box.classList.add("mare");
    }
  }

  var C = 2 * Math.PI * 7;
  function renderVagas(el, i) {
    var p = $("[data-vagas]", el);
    if (!p) return;
    var estado, txt, frac = 1;
    if (!disponivel(i)) { estado = "esgotado"; txt = "Esgotado"; frac = 0; }
    else if (i.vagas == null) { estado = "livre"; txt = "Sem limite de vagas"; }
    else {
      frac = i.vagas / i.vagasIniciais;
      estado = i.vagas <= 2 ? "poucas" : "ok";
      txt = i.vagas < i.vagasIniciais
        ? "Restam <b>" + i.vagas + "</b> de " + i.vagasIniciais + " vagas"
        : "<b>" + i.vagas + "</b> vagas nesta Black Friday";
    }
    p.setAttribute("data-estado", estado);
    $("span", p).innerHTML = txt;
    var arco = $(".v-arco", p);
    if (arco) arco.setAttribute("stroke-dashoffset", (C * (1 - frac)).toFixed(2));
  }

  function renderCard(card, animar) {
    var i = itens[card.getAttribute("data-id")];
    if (!i) return;
    var fase = faseExibida();
    renderPreco(card, i, fase, animar);
    if (card.classList.contains("mini")) return;
    renderVagas(card, i);
    var q = pedido.itens[i.id] || 0;
    var ok = disponivel(i) && preco(i, fase) != null && atual.estado !== "encerrada";
    card.classList.toggle("esgotada", !disponivel(i));
    card.classList.toggle("no-pedido", q > 0);
    var add = $("[data-add]", card);
    add.disabled = !ok;
    add.textContent = !disponivel(i) ? "Esgotado" : atual.estado === "encerrada" ? "Encerrada" : preco(i, fase) == null ? "Em breve" : "Adicionar ao pedido";
    $("[data-qtd]", card).innerHTML = q + "<span>no pedido</span>";
    $("[data-mais]", card).disabled = q >= limite(i) || !ok;
  }

  function renderTudo(animar) {
    var fase = faseExibida();
    $$("[data-id]").forEach(function (el) { renderCard(el, animar); });
    // chamada principal: fixa em "até 80%" (decisão de Gustavo em 16/11), vem dos dados
    if (D.chamadaDesconto) {
      $("#max-off").textContent = D.chamadaDesconto;
      var gig = $("[data-gigante]");
      if (gig && gig.textContent !== D.chamadaDesconto + "%") gig.innerHTML = (D.chamadaDesconto + "%").split("").map(function (c, k) { return '<span style="--i:' + k + '">' + c + "</span>"; }).join("");
    }
    $("#sobre-fase").textContent = atual.estado === "encerrada" ? "Black Friday encerrada" : fase.rotulo;
    $("#validade").textContent = atual.estado === "encerrada"
      ? "A campanha terminou em 19/11, às 23h59."
      : "Esta condição vale " + fase.validade + ".";
    $$("[data-prova]").forEach(function (b) {
      var p = D.provas && D.provas[b.getAttribute("data-prova")];
      b.hidden = !((p && p.ativo) || VICENTE);
    });
    $$(".fita [data-validade]").forEach(function (s) { s.textContent = atual.estado === "encerrada" ? "Encerrada" : "Só " + fase.validade; });
    renderBarra();
    if ($("#pedido").open) renderPedido();
  }

  function renderBarra() {
    var t = totais(faseExibida());
    var barra = $("#barra");
    var ativa = t.qtd > 0 && (atual.estado !== "antes" || !PORTAO);
    barra.classList.toggle("ativa", ativa);
    barra.setAttribute("aria-hidden", ativa ? "false" : "true");
    $("#abrir-pedido").tabIndex = ativa ? 0 : -1;
    $("#esvaziar").tabIndex = ativa ? 0 : -1;
    $("#barra-qtd").textContent = t.qtd + (t.qtd === 1 ? " item no pedido" : " itens no pedido");
    var bt = $("#barra-total"), novoT = t.faltaPreco ? "—" : brl(t.total);
    if (bt.textContent !== novoT && !REDUZIR) { bt.classList.toggle("pulo", false); void bt.offsetWidth; bt.classList.add("pulo"); }
    bt.textContent = novoT;
  }

  // ------------------------------------------------------- folha pedido --
  var confirmarMudanca = false;
  function renderPedido() {
    var fase = faseExibida();
    var ids = linhas();
    var lista = $("#pedido-lista");
    var faseAntiga = pedido.fase && pedido.fase !== fase.id ? faseDe(pedido.fase) : null;
    lista.innerHTML = "";
    $("#pedido-vazio").hidden = ids.length > 0;
    var bloqueio = false;
    ids.forEach(function (id) {
      var i = itens[id], q = pedido.itens[id], v = preco(i, fase);
      var vAnt = faseAntiga ? preco(i, faseAntiga) : null;
      var li = document.createElement("li");
      li.className = "linha";
      li.setAttribute("data-linha", id);
      var alerta = "";
      if (!disponivel(i)) { alerta = "Esgotou. Tire este item para enviar o pedido."; bloqueio = true; }
      else if (i.vagas != null && q > i.vagas) { alerta = "Restam só " + i.vagas + ". Ajuste a quantidade."; bloqueio = true; }
      else if (v == null) { alerta = "Preço desta condição ainda não publicado."; bloqueio = true; }
      if (alerta) li.classList.add("linha--alerta");
      var unit = v == null ? "—" : brl(v) + (q > 1 ? " cada" : "");
      var sub = v == null ? "—" : brl(v * q);
      li.innerHTML =
        '<span class="linha__nome">' + i.nome + (i.subnome ? " · " + i.subnome : "") + "<small>" + q + "× " + unit + "</small></span>" +
        '<span class="linha__valor">' + (vAnt != null && vAnt !== v ? "<s>" + brl(vAnt * q) + "</s>" : "") + sub + "</span>" +
        (alerta ? '<span class="linha__alerta">' + alerta + "</span>" : "") +
        '<span class="linha__ctrl"><span class="qtd" role="group" aria-label="Quantidade de ' + i.nome + '">' +
        '<button type="button" data-l-menos aria-label="Tirar um ' + i.nome + '">−</button>' +
        "<output>" + q + "<span>no pedido</span></output>" +
        '<button type="button" data-l-mais aria-label="Mais um ' + i.nome + '"' + (q >= limite(i) || !disponivel(i) ? " disabled" : "") + ">+</button></span>" +
        '<button type="button" class="remover" data-l-remover>Remover</button></span>';
      lista.appendChild(li);
    });
    var t = totais(fase);
    var tAnt = faseAntiga ? totais(faseAntiga) : null;
    $("#pedido-total").innerHTML = (tAnt && !tAnt.faltaPreco && tAnt.total !== t.total ? "<s>" + brl(tAnt.total) + "</s>" : "") + (t.faltaPreco ? "—" : brl(t.total));
    $("#pedido-condicao").textContent = atual.estado === "encerrada" ? "A Black Friday Apocalíptica terminou." : "Condição vigente: " + fase.rotulo + ", válida " + fase.validade + ".";
    var mudou = $("#pedido-mudou");
    if (faseAntiga && ids.length) {
      mudou.hidden = false;
      mudou.textContent = "Os preços mudaram enquanto o pedido estava aberto: a condição “" + faseAntiga.rotulo + "” terminou. O total agora é " + (t.faltaPreco ? "—" : brl(t.total)) + (tAnt && !tAnt.faltaPreco ? " (antes, " + brl(tAnt.total) + ")" : "") + ".";
      confirmarMudanca = true;
    } else {
      mudou.hidden = true;
      confirmarMudanca = false;
    }
    var enviar = $("#enviar");
    enviar.disabled = !ids.length || bloqueio || !podeVender();
    $("#enviar-texto").textContent = confirmarMudanca ? "Enviar com o preço atual" : "Enviar pedido pelo WhatsApp";
  }

  var empurrou = false;
  function abrirPedido() {
    var dlg = $("#pedido");
    if (dlg.open) return;
    renderPedido();
    try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); }
    try { history.pushState({ bfaPedido: 1 }, ""); empurrou = true; } catch (e) {}
    setTimeout(function () { $("#fechar-pedido").focus(); }, 30);
  }
  function fecharPedido(viaHistorico) {
    var dlg = $("#pedido");
    if (!dlg.open) return;
    dlg.close();
    if (empurrou && !viaHistorico) { empurrou = false; try { history.back(); } catch (e) {} }
    empurrou = viaHistorico ? false : empurrou;
    var b = $("#abrir-pedido");
    if ($("#barra").classList.contains("ativa")) b.focus();
  }
  window.addEventListener("popstate", function () { if ($("#pedido").open) { empurrou = false; fecharPedido(true); } });

  // ------------------------------------------------------------- ações --
  function anunciar(msg) { var a = $("#anuncio"); a.textContent = ""; setTimeout(function () { a.textContent = msg; }, 50); }
  function mudarQtd(id, delta, absoluto) {
    var i = itens[id];
    if (!i) return;
    var q = pedido.itens[id] || 0;
    var novo = absoluto != null ? absoluto : q + delta;
    novo = Math.max(0, Math.min(novo, limite(i)));
    if (novo > q && (!disponivel(i) || atual.estado === "encerrada" || preco(i, faseExibida()) == null)) return;
    if (!linhas().length && novo > 0) { pedido.fase = faseExibida().id; pedido.codigo = codigo(); }
    if (novo === 0) delete pedido.itens[id]; else pedido.itens[id] = novo;
    if (!linhas().length) { pedido.fase = null; pedido.codigo = null; }
    salvar();
    $$('.oferta[data-id="' + id + '"]').forEach(function (c) { renderCard(c); });
    renderBarra();
    if ($("#pedido").open) renderPedido();
    var t = totais(faseExibida());
    anunciar(novo === 0 ? i.nome + " saiu do pedido. Total " + brl(t.total) + "."
      : i.nome + ": " + novo + " no pedido. Total " + brl(t.total) + ".");
    return novo;
  }

  document.addEventListener("click", function (ev) {
    var alvo = ev.target.closest("button, a[data-ir]");
    if (!alvo) return;
    var card = alvo.closest(".oferta");
    if (alvo.hasAttribute("data-add") && card) {
      var id = card.getAttribute("data-id");
      if (mudarQtd(id, 1) > 0) {
        var vAdd = preco(itens[id], faseExibida());
        medir("AddToCart", { content_ids: [id], content_name: itens[id].nome, content_type: "product", value: vAdd, currency: "BRL" });
      }
      var qtd = $(".qtd", card);
      if (!REDUZIR) { qtd.classList.remove("carimbo"); void qtd.offsetWidth; qtd.classList.add("carimbo"); }
      var mais = $("[data-mais]", card);
      (mais.disabled ? $("[data-menos]", card) : mais).focus();
    } else if (alvo.hasAttribute("data-mais") && card) {
      mudarQtd(card.getAttribute("data-id"), 1);
    } else if (alvo.hasAttribute("data-menos") && card) {
      var n = mudarQtd(card.getAttribute("data-id"), -1);
      if (n === 0) $("[data-add]", card).focus();
    } else if (alvo.hasAttribute("data-ir")) {
      ev.preventDefault();
      irPara(alvo.getAttribute("data-ir"), alvo.hasAttribute("data-abrir"));
    } else {
      var li = alvo.closest("[data-linha]");
      if (li) {
        var lid = li.getAttribute("data-linha");
        if (alvo.hasAttribute("data-l-mais")) mudarQtd(lid, 1);
        else if (alvo.hasAttribute("data-l-menos")) mudarQtd(lid, -1);
        else if (alvo.hasAttribute("data-l-remover")) mudarQtd(lid, 0, 0);
        var resto = $("#pedido-lista button");
        if (!$('[data-linha="' + lid + '"]')) (resto || $("#continuar")).focus();
        else { var b = $('[data-linha="' + lid + '"] ' + (alvo.hasAttribute("data-l-mais") ? "[data-l-mais]" : "[data-l-menos]")); if (b && !b.disabled) b.focus(); }
      }
    }
  });

  function irPara(id, abrir) {
    var card = $("#o-" + id);
    if (!card) return;
    var det = $(".mais", card);
    if (abrir && det) det.open = true;
    card.scrollIntoView({ behavior: REDUZIR ? "auto" : "smooth", block: "start" });
    card.classList.remove("realce"); void card.offsetWidth; card.classList.add("realce");
    try { history.replaceState(history.state, "", "#o-" + id); } catch (e) {}
    setTimeout(function () { $("[data-add]", card).focus({ preventScroll: true }); }, REDUZIR ? 0 : 500);
  }

  $("#abrir-pedido").addEventListener("click", abrirPedido);
  $("#fechar-pedido").addEventListener("click", function () { fecharPedido(false); });
  $("#continuar").addEventListener("click", function () { fecharPedido(false); });
  $("#pedido").addEventListener("cancel", function (e) { e.preventDefault(); fecharPedido(false); });
  $("#pedido").addEventListener("click", function (e) { if (e.target === this) fecharPedido(false); });
  $("#aviso-fechar").addEventListener("click", function () { $("#aviso").hidden = true; });

  // fechar "Saiba mais" devolve o card à tela
  $$(".mais").forEach(function (d) {
    d.addEventListener("toggle", function () {
      if (d.open) return;
      var card = d.closest(".oferta");
      if (card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: "start" });
    });
  });

  // ------------------------------------------------------------- envio --
  var ultimaBusca = 0;
  function buscarDados(limiteMs) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, limiteMs || 4000);
    var pegar = function (k) {
      return fetch(JSON_URLS[k] + "?t=" + Date.now(), { cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) { if (!r.ok && k + 1 < JSON_URLS.length) return pegar(k + 1); return r; }, function (e) { if (k + 1 < JSON_URLS.length && !(ctrl && ctrl.signal.aborted)) return pegar(k + 1); throw e; });
    };
    return pegar(0)
      .then(function (r) {
        clearTimeout(timer);
        var data = r.headers.get("Date");
        if (data && simBase === null) {
          var dif = Date.parse(data) - Date.now();
          offset = Math.abs(dif) > 60000 ? dif : 0;
        }
        if (!r.ok) throw new Error("http " + r.status);
        return r.json();
      })
      .then(function (novo) {
        if (!novo || !novo.itens || !novo.fases) return;
        D = novo; indexar(); ultimaBusca = Date.now();
        tick(true);
        renderTudo(false);
      })
      .catch(function () { clearTimeout(timer); });
  }

  function mensagem(fase) {
    var ids = linhas();
    var t = totais(fase);
    var quando = new Date(agora());
    var l = ["Olá! Quero fazer este pedido da Black Friday Apocalíptica:", ""];
    ids.forEach(function (id) {
      var i = itens[id], q = pedido.itens[id], v = preco(i, fase);
      var nome = i.nome + (i.subnome ? " (" + i.subnome + ")" : "");
      l.push("• " + q + "× " + nome + " — " + brl(v) + (q > 1 ? " cada (" + brl(v * q) + ")" : ""));
    });
    l.push("", "Total: " + brl(t.total));
    l.push("Condição: " + fase.rotulo + ", válida " + fase.validade);
    l.push("Pedido " + (pedido.codigo || codigo()) + " · " + fmtDia.format(quando) + " às " + fmtHora.format(quando));
    return l.join("\n");
  }

  var enviando = false;
  $("#enviar").addEventListener("click", function () {
    if (enviando) return;
    tick();
    if (!podeVender()) { renderPedido(); return; }
    if (confirmarMudanca) {
      pedido.fase = faseExibida().id; salvar();
      confirmarMudanca = false;
    } else if (pedido.fase && pedido.fase !== faseExibida().id) {
      renderPedido();
      $("#pedido-mudou").focus && $("#pedido-mudou").setAttribute("tabindex", "-1");
      $("#pedido-mudou").focus();
      return;
    }
    enviando = true;
    $("#enviar-texto").textContent = "Conferindo preços e vagas…";
    var antes = JSON.stringify([faseExibida().id, linhas().map(function (id) { return [id, pedido.itens[id], preco(itens[id], faseExibida()), disponivel(itens[id]), itens[id].vagas]; })]);
    var busca = Date.now() - ultimaBusca > 20000 ? buscarDados(2500) : Promise.resolve();
    busca.then(function () {
      enviando = false;
      tick();
      var fase = faseExibida();
      var depois = JSON.stringify([fase.id, linhas().map(function (id) { return [id, pedido.itens[id], preco(itens[id], fase), disponivel(itens[id]), itens[id].vagas]; })]);
      if (antes !== depois || pedido.fase !== fase.id) { renderPedido(); var m = $("#pedido-mudou"); if (!m.hidden) { m.setAttribute("tabindex", "-1"); m.focus(); } return; }
      var t = totais(fase);
      if (!linhas().length || t.faltaPreco || !podeVender()) { renderPedido(); return; }
      var url = "https://wa.me/" + D.whatsapp + "?text=" + encodeURIComponent(mensagem(fase));
      $("#enviar-texto").textContent = "Abrindo o WhatsApp…";
      pedido.enviadoEm = agora(); salvar();
      medir("InitiateCheckout", { content_ids: linhas(), num_items: t.qtd, value: t.total, currency: "BRL" });
      setTimeout(function () { renderPedido(); }, 2500);
      location.href = url;
    });
  });

  // ------------------------------------------------------- tempo e fase --
  function duas(n) { return (n < 10 ? "0" : "") + n; }
  function faltam(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return { h: h, m: m, s: ss, curto: h >= 1 ? h + "h " + duas(m) + "min" : duas(m) + ":" + duas(ss), longo: duas(h) + ":" + duas(m) + ":" + duas(ss) };
  }
  var ultimoTexto = "";
  function tick(silencioso) {
    var t = agora();
    var nova = situacao(t);
    var mudou = nova.estado !== atual.estado || nova.fase.id !== atual.fase.id;
    var antiga = atual;
    atual = nova;
    doc.classList.toggle("antes", atual.estado === "antes" && PORTAO);
    doc.classList.toggle("encerrada", atual.estado === "encerrada");
    var rot = $("#relogio-rotulo"), tempo = $("#relogio-tempo"), brasa = $("#anel-brasa");
    var txt, frac = 0;
    var fimFase = null;
    if (atual.estado === "antes") {
      fimFase = Date.parse(atual.fase.fim);
      rot.textContent = "Preço vale por mais";
      txt = faltam(fimFase - t).curto;
      frac = 1;
    } else if (atual.estado === "ativa") {
      fimFase = atual.fim;
      var r = faltam(atual.fim - t);
      rot.textContent = "Preço vale por mais";
      txt = r.curto;
      frac = (atual.fim - t) / (atual.fim - atual.ini);
    } else {
      rot.textContent = "Black Friday";
      txt = "Encerrada";
    }
    if (txt !== ultimoTexto) { tempo.textContent = txt; ultimoTexto = txt; }
    var cg = $("#contagem");
    if (cg) cg.textContent = fimFase ? faltam(fimFase - t).longo : "encerrada";
    brasa.setAttribute("stroke-dashoffset", (75.4 * (1 - frac)).toFixed(2));
    if (mudou && !silencioso) aoVirar(antiga, atual);
  }

  function aoVirar(antiga, nova) {
    renderTudo(true);
    var aviso = $("#aviso"), texto = $("#aviso-texto");
    if (antiga.estado === "antes" && nova.estado === "ativa") {
      texto.innerHTML = "<strong>As ofertas abriram.</strong> Os preços abaixo valem " + nova.fase.validade + ".";
      aviso.hidden = false;
    } else if (nova.estado === "ativa") {
      texto.innerHTML = "<strong>Os preços mudaram.</strong> A condição “" + antiga.fase.rotulo + "” terminou à meia-noite. Os valores abaixo já são os de " + nova.fase.curto + ", válidos " + nova.fase.validade + ".";
      aviso.hidden = false;
    } else if (nova.estado === "encerrada") {
      texto.innerHTML = "<strong>A Black Friday Apocalíptica terminou.</strong> Obrigado a quem participou.";
      aviso.hidden = false;
    }
    if ($("#pedido").open) renderPedido();
    buscarDados();
  }

  setInterval(tick, 1000);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      tick();
      if (Date.now() - ultimaBusca > 30000) buscarDados();
    }
  });

  // ------------------------------------------------- atalhos da categoria --
  var atalhos = $$("[data-atalho]");
  if ("IntersectionObserver" in window && atalhos.length) {
    var vis = {};
    var obs = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) { vis[e.target.id] = e.isIntersecting ? e.intersectionRatio : 0; });
      var melhor = null, mv = 0;
      Object.keys(vis).forEach(function (k) { if (vis[k] > mv) { mv = vis[k]; melhor = k; } });
      atalhos.forEach(function (a) {
        var on = a.getAttribute("data-atalho") === melhor;
        if (on && a.getAttribute("aria-current") !== "true") {
          var ul = a.closest("ul");
          ul.scrollTo({ left: a.parentNode.offsetLeft - 16, behavior: REDUZIR ? "auto" : "smooth" });
        }
        if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      });
    }, { rootMargin: "-35% 0px -55% 0px", threshold: [0, 0.01, 0.5, 1] });
    $$("main .secao").forEach(function (s) { obs.observe(s); });
  }

  // Simulação de testes (sem nada visível): ?previa=1&agora=...&esgotar=...
  // só desliga o Pixel e muda o relógio; a página fica igual à do público.

  // ------------------------------------------------- esvaziar e desfazer --
  var reserva = null, timerDesfazer = null;
  $("#esvaziar").addEventListener("click", function () {
    if (!linhas().length) return;
    reserva = JSON.parse(JSON.stringify(pedido));
    pedido = { itens: {}, fase: null, codigo: null }; salvar();
    renderTudo(false);
    var d = $("#desfazer"); d.hidden = false;
    $("#desfazer-btn").focus();
    clearTimeout(timerDesfazer);
    timerDesfazer = setTimeout(function () { d.hidden = true; reserva = null; }, 7000);
    anunciar("Pedido esvaziado.");
  });
  $("#desfazer-btn").addEventListener("click", function () {
    if (reserva) { pedido = reserva; reserva = null; salvar(); renderTudo(false); anunciar("Pedido recuperado."); }
    $("#desfazer").hidden = true;
    if ($("#barra").classList.contains("ativa")) $("#abrir-pedido").focus();
  });

  // ------------------------------------------------- marcador do menu --
  var marca = $(".atalhos__marca");
  function moverMarca() {
    var ativo = $('.atalhos a[aria-current="true"]');
    if (!marca) return;
    if (!ativo) { marca.classList.toggle("on", false); return; }
    marca.style.width = ativo.offsetWidth + "px";
    marca.style.transform = "translateX(" + ativo.parentNode.offsetLeft + "px)";
    marca.classList.add("on");
  }
  if (window.MutationObserver) new MutationObserver(moverMarca).observe($(".atalhos ul"), { attributes: true, subtree: true, attributeFilter: ["aria-current"] });
  window.addEventListener("resize", moverMarca);

  // revelação na rolagem: na página B, em movimento.js (GSAP + ScrollTrigger, desligado com reduzir movimento)

  // ---------------------------------------------------- vídeo de depoimento --
  var dlgV = $("#video"), vid = dlgV ? $("video", dlgV) : null, origemVideo = null, videoEmpurrou = false;
  function abrirVideo(id, botao) {
    var d = D.depoimentos && D.depoimentos[id];
    if (!d || !dlgV) return;
    origemVideo = botao;
    var foto = d.tipo === "imagem", img = $("#video-img");
    dlgV.classList.toggle("foto", foto);
    dlgV.classList.toggle("vertical", !foto && !!d.vertical);
    dlgV.setAttribute("aria-label", foto ? "Depoimento" : "Depoimento em vídeo");
    $("#video-leg").textContent = d.titulo;
    if (foto) {
      img.src = midia(d.img); if (d.w) img.width = d.w; if (d.h) img.height = d.h;
    } else {
      img.removeAttribute("src");
      vid.poster = midia(d.poster); vid.src = midia(d.mp4);
    }
    try { dlgV.showModal(); } catch (e) { dlgV.setAttribute("open", ""); }
    try { history.pushState({ bfaVideo: 1 }, ""); videoEmpurrou = true; } catch (e) {}
    if (!foto) { var pr = vid.play(); if (pr && pr.catch) pr.catch(function () {}); }
  }
  function fecharVideo(viaHistorico) {
    if (!dlgV || !dlgV.open) return;
    if (!dlgV.classList.contains("foto")) { vid.pause(); vid.setAttribute("src", ""); vid.load(); }
    dlgV.close();
    if (videoEmpurrou && !viaHistorico) { try { history.back(); } catch (e) {} }
    videoEmpurrou = false;
    if (origemVideo) origemVideo.focus();
  }
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-video]");
    if (b) { ev.preventDefault(); abrirVideo(b.getAttribute("data-video"), b); }
  });
  if (dlgV) {
    $("#fechar-video").addEventListener("click", function () { fecharVideo(false); });
    dlgV.addEventListener("cancel", function (e) { e.preventDefault(); fecharVideo(false); });
    dlgV.addEventListener("click", function (e) { if (e.target === dlgV) fecharVideo(false); });
    window.addEventListener("popstate", function () { if (dlgV.open) fecharVideo(true); });
  }

  // ---------------------------------------------------------------- início --
  tick(true);
  if ((pedido.fase && !faseDe(pedido.fase)) || (!pedido.fase && linhas().length)) pedido.fase = faseExibida().id;
  renderTudo(false);
  buscarDados();
  window.__bfa = { agora: agora, situacao: function () { return atual; }, pedido: function () { return pedido; }, mensagem: function () { return mensagem(faseExibida()); } };
})();
