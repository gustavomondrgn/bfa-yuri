/* Player dos depoimentos em vídeo (/bfa).
 *
 * Porte em JavaScript puro do player da academia do Placidus (LessonPlayer.tsx,
 * branch wip/academia): a mesma casca (botão grande no centro, linha do tempo
 * que se clica e se arrasta com o buffer por baixo, tempo, som, tela cheia,
 * atalhos e controles que somem tocando), sem React e sem build.
 *
 * Uso:
 *   var p = BfaPlayer.montar(raiz, video);   // raiz contém o <video>
 *   p.destruir();                            // tira tudo e devolve o <video>
 *
 * O player tira o `controls` do <video>, monta os controles dentro de `raiz` e
 * lê o estado do próprio <video>: a página troca o `src`, chama play(), pause()
 * e load() à vontade, e ele acompanha. Sem fonte (src vazio), ele se esconde.
 *
 * Teclado, com o foco no player: espaço ou K tocar/pausar · ← → 5 s ·
 * Home/End na linha do tempo · F tela cheia · M som.
 */
(function () {
  "use strict";

  var SVG = "http://www.w3.org/2000/svg";
  var SUMIR_MS = 2500;

  // Ícones Hugeicons, os mesmos do Placidus (traço redondo, 1,75). A tela cheia
  // usa o FullScreen da mesma família: o Maximize01 do Placidus é uma mão em
  // pinça, que ninguém lê como "tela cheia". O "sair" é o mesmo desenho virado.
  var ICONES = {
    tocar: ["M18.8906 12.846C18.5371 14.189 16.8667 15.138 13.5257 17.0361C10.296 18.8709 8.6812 19.7884 7.37983 19.4196C6.8418 19.2671 6.35159 18.9776 5.95624 18.5787C5 17.6139 5 15.7426 5 12C5 8.2574 5 6.3861 5.95624 5.42132C6.35159 5.02245 6.8418 4.73288 7.37983 4.58042C8.6812 4.21165 10.296 5.12907 13.5257 6.96393C16.8667 8.86197 18.5371 9.811 18.8906 11.154C19.0365 11.7084 19.0365 12.2916 18.8906 12.846Z"],
    pausar: [
      "M4 7C4 5.58579 4 4.87868 4.43934 4.43934C4.87868 4 5.58579 4 7 4C8.41421 4 9.12132 4 9.56066 4.43934C10 4.87868 10 5.58579 10 7V17C10 18.4142 10 19.1213 9.56066 19.5607C9.12132 20 8.41421 20 7 20C5.58579 20 4.87868 20 4.43934 19.5607C4 19.1213 4 18.4142 4 17V7Z",
      "M14 7C14 5.58579 14 4.87868 14.4393 4.43934C14.8787 4 15.5858 4 17 4C18.4142 4 19.1213 4 19.5607 4.43934C20 4.87868 20 5.58579 20 7V17C20 18.4142 20 19.1213 19.5607 19.5607C19.1213 20 18.4142 20 17 20C15.5858 20 14.8787 20 14.4393 19.5607C14 19.1213 14 18.4142 14 17V7Z"
    ],
    voltar10: [
      "M12 5L10.8961 3.45459C10.4851 2.87911 10.2795 2.59137 10.4093 2.32411C10.5391 2.05684 10.8689 2.04153 11.5286 2.01092C11.6848 2.00367 11.842 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 8.72836 3.57111 5.82368 6 3.99927",
      "M7.99219 11.004C8.52019 10.584 9.00019 9.89143 9.30019 10.02C9.60019 10.1486 9.50419 10.572 9.50419 11.232C9.50419 11.892 9.50419 14.6847 9.50419 16.008",
      "M16.0022 12.6C16.0022 11.22 16.0682 10.848 15.8042 10.404C15.5402 9.96001 14.8802 9.99841 14.2202 9.99841C13.5602 9.99841 13.0802 9.96001 12.7622 10.32C12.3722 10.74 12.5402 11.52 12.4922 12.6C12.6002 14.04 12.3062 15.18 12.7562 15.66C13.0802 16.056 13.6553 15.996 14.3402 16.008C15.0201 15.9997 15.4322 16.032 15.7682 15.648C16.1402 15.312 15.9602 13.98 16.0022 12.6Z"
    ],
    avancar10: [
      "M12 5L13.1039 3.45459C13.5149 2.87911 13.7205 2.59137 13.5907 2.32411C13.4609 2.05684 13.1311 2.04153 12.4714 2.01092C12.3152 2.00367 12.158 2 12 2C6.4772 2 2 6.47715 2 12C2 17.5228 6.4772 22 12 22C17.5229 22 22 17.5228 22 12C22 8.72836 20.4289 5.82368 18 3.99927",
      "M7.99219 11.004C8.52019 10.584 9.00019 9.89143 9.30019 10.02C9.60019 10.1486 9.50419 10.572 9.50419 11.232C9.50419 11.892 9.50419 14.6847 9.50419 16.008",
      "M16.0022 12.6C16.0022 11.22 16.0682 10.848 15.8042 10.404C15.5402 9.96001 14.8802 9.99841 14.2202 9.99841C13.5602 9.99841 13.0802 9.96001 12.7622 10.32C12.3722 10.74 12.5402 11.52 12.4922 12.6C12.6002 14.04 12.3062 15.18 12.7562 15.66C13.0802 16.056 13.6553 15.996 14.3402 16.008C15.0201 15.9997 15.4322 16.032 15.7682 15.648C16.1402 15.312 15.9602 13.98 16.0022 12.6Z"
    ],
    som: [
      "M14 14.8135V9.18646C14 6.04126 14 4.46866 13.0747 4.0773C12.1494 3.68593 11.0603 4.79793 8.88232 7.02192C7.75439 8.17365 7.11085 8.42869 5.50604 8.42869C4.10257 8.42869 3.40084 8.42869 2.89675 8.77262C1.85035 9.48655 2.00852 10.882 2.00852 12C2.00852 13.118 1.85035 14.5134 2.89675 15.2274C3.40084 15.5713 4.10257 15.5713 5.50604 15.5713C7.11085 15.5713 7.75439 15.8264 8.88232 16.9781C11.0603 19.2021 12.1494 20.3141 13.0747 19.9227C14 19.5313 14 17.9587 14 14.8135Z",
      "M17 9C17.6254 9.81968 18 10.8634 18 12C18 13.1366 17.6254 14.1803 17 15",
      "M20 7C21.2508 8.36613 22 10.1057 22 12C22 13.8943 21.2508 15.6339 20 17"
    ],
    mudo: [
      "M14 14.8135V9.18646C14 6.04126 14 4.46866 13.0747 4.0773C12.1494 3.68593 11.0603 4.79793 8.88232 7.02192C7.75439 8.17365 7.11085 8.42869 5.50604 8.42869C4.10257 8.42869 3.40084 8.42869 2.89675 8.77262C1.85035 9.48655 2.00852 10.882 2.00852 12C2.00852 13.118 1.85035 14.5134 2.89675 15.2274C3.40084 15.5713 4.10257 15.5713 5.50604 15.5713C7.11085 15.5713 7.75439 15.8264 8.88232 16.9781C11.0603 19.2021 12.1494 20.3141 13.0747 19.9227C14 19.5313 14 17.9587 14 14.8135Z",
      "M18 10L22 14M18 14L22 10"
    ],
    cheia: ["M15.5 21C16.8956 21 17.5933 21 18.1611 20.8278C19.4395 20.44 20.44 19.4395 20.8278 18.1611C21 17.5933 21 16.8956 21 15.5M21 8.5C21 7.10444 21 6.40666 20.8278 5.83886C20.44 4.56046 19.4395 3.56004 18.1611 3.17224C17.5933 3 16.8956 3 15.5 3M8.5 21C7.10444 21 6.40666 21 5.83886 20.8278C4.56046 20.44 3.56004 19.4395 3.17224 18.1611C3 17.5933 3 16.8956 3 15.5M3 8.5C3 7.10444 3 6.40666 3.17224 5.83886C3.56004 4.56046 4.56046 3.56004 5.83886 3.17224C6.40666 3 7.10444 3 8.5 3"],
    sair: ["M3 8.5h2.5a3 3 0 0 0 3-3V3", "M15.5 3v2.5a3 3 0 0 0 3 3H21", "M3 15.5h2.5a3 3 0 0 1 3 3V21", "M21 15.5h-2.5a3 3 0 0 0-3 3V21"]
  };

  function icone(nome, tam, traco, classe) {
    var s = document.createElementNS(SVG, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("width", String(tam));
    s.setAttribute("height", String(tam));
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", String(traco || 1.75));
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("focusable", "false");
    s.setAttribute("class", "bplayer__ico" + (classe ? " " + classe : ""));
    for (var i = 0; i < ICONES[nome].length; i++) {
      var p = document.createElementNS(SVG, "path");
      p.setAttribute("d", ICONES[nome][i]);
      s.appendChild(p);
    }
    return s;
  }

  function el(tag, classe) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    return e;
  }

  function botao(classe, filhos) {
    var b = el("button", "bplayer__btn " + classe);
    b.type = "button";
    for (var i = 0; i < filhos.length; i++) b.appendChild(filhos[i]);
    return b;
  }

  function limitar(v, min, max) { return v < min ? min : v > max ? max : v; }

  // 0:07, 1:09, 1:02:03 (a função `clock` do Placidus).
  function relogio(s) {
    s = Math.max(0, Math.floor(s || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? h + ":" + (m < 10 ? "0" : "") + m : String(m)) + ":" + (r < 10 ? "0" : "") + r;
  }

  // Para o leitor de tela: "1 minuto e 9 segundos" em vez de "1:09".
  function falado(s) {
    s = Math.max(0, Math.floor(s || 0));
    var m = Math.floor(s / 60), r = s % 60, partes = [];
    if (m) partes.push(m + (m === 1 ? " minuto" : " minutos"));
    if (r || !m) partes.push(r + (r === 1 ? " segundo" : " segundos"));
    return partes.join(" e ");
  }

  function elementoCheio() { return document.fullscreenElement || document.webkitFullscreenElement || null; }

  function montar(raiz, video) {
    if (!raiz || !video) return null;
    if (raiz.__bplayer) return raiz.__bplayer;

    var tinhaControles = video.hasAttribute("controls");
    video.removeAttribute("controls");
    video.controls = false;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.classList.add("bplayer__video");
    raiz.classList.add("bplayer");

    // ------------------------------------------------------------ a casca --
    var ui = el("div", "bplayer__ui");
    ui.setAttribute("role", "group");
    ui.setAttribute("aria-label", "Player de vídeo");

    var palco = el("div", "bplayer__palco");
    palco.setAttribute("role", "button");
    palco.tabIndex = 0;
    var grande = el("span", "bplayer__grande");
    grande.setAttribute("aria-hidden", "true");
    grande.appendChild(icone("tocar", 28, 2));
    var espera = el("span", "bplayer__espera");
    espera.setAttribute("aria-hidden", "true");
    palco.appendChild(grande);
    palco.appendChild(espera);

    var erro = el("div", "bplayer__erro");
    erro.setAttribute("role", "alert");
    erro.hidden = true;
    var erroTxt = el("p");
    erroTxt.textContent = "O vídeo parou de carregar. Confira a internet e tente de novo.";
    var erroBtn = el("button", "bplayer__erro-btn");
    erroBtn.type = "button";
    erroBtn.textContent = "Tentar de novo";
    erro.appendChild(erroTxt);
    erro.appendChild(erroBtn);

    var barra = el("div", "bplayer__barra");

    var linha = el("div", "bplayer__linha");
    linha.setAttribute("role", "slider");
    linha.tabIndex = 0;
    linha.setAttribute("aria-label", "Posição no vídeo");
    linha.setAttribute("aria-valuemin", "0");
    linha.setAttribute("aria-valuemax", "0");
    linha.setAttribute("aria-valuenow", "0");
    linha.setAttribute("aria-valuetext", "0 segundos");
    var trilho = el("div", "bplayer__trilho");
    var carregado = el("span", "bplayer__carregado");
    var feito = el("span", "bplayer__feito");
    trilho.appendChild(carregado);
    trilho.appendChild(feito);
    var bolinha = el("span", "bplayer__bolinha");
    var dica = el("span", "bplayer__dica");
    dica.setAttribute("aria-hidden", "true");
    linha.appendChild(trilho);
    linha.appendChild(bolinha);
    linha.appendChild(dica);

    var fileira = el("div", "bplayer__fileira");
    var bTocar = botao("bplayer__tocar", [icone("tocar", 20, null, "bplayer__i-tocar"), icone("pausar", 20, null, "bplayer__i-pausar")]);
    var bVoltar = botao("bplayer__voltar", [icone("voltar10", 20)]);
    bVoltar.setAttribute("aria-label", "Voltar 10 segundos");
    var bAvancar = botao("bplayer__avancar", [icone("avancar10", 20)]);
    bAvancar.setAttribute("aria-label", "Avançar 10 segundos");
    var bSom = botao("bplayer__som", [icone("som", 19, null, "bplayer__i-som"), icone("mudo", 19, null, "bplayer__i-mudo")]);
    var volume = el("input", "bplayer__volume");
    volume.type = "range";
    volume.min = "0";
    volume.max = "1";
    volume.step = "0.05";
    volume.setAttribute("aria-label", "Volume");
    var tempo = el("span", "bplayer__tempo");
    var vao = el("span", "bplayer__vao");
    var bCheia = botao("bplayer__cheia", [icone("cheia", 18, null, "bplayer__i-cheia"), icone("sair", 18, null, "bplayer__i-sair")]);
    fileira.appendChild(bTocar);
    fileira.appendChild(bVoltar);
    fileira.appendChild(bAvancar);
    fileira.appendChild(bSom);
    fileira.appendChild(volume);
    fileira.appendChild(tempo);
    fileira.appendChild(vao);
    fileira.appendChild(bCheia);

    barra.appendChild(linha);
    barra.appendChild(fileira);
    ui.appendChild(palco);
    ui.appendChild(erro);
    ui.appendChild(barra);
    raiz.appendChild(ui);

    // iPhone: sem a API de tela cheia em elementos, só o vídeo nativo entra.
    var podeCheia = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled || video.webkitEnterFullscreen);
    if (!podeCheia) bCheia.hidden = true;

    // ------------------------------------------------------------ estado --
    var arrastando = false, idArraste = null, posArraste = 0, ultimoSeek = 0;
    var pendente = null;          // fração pedida antes de o vídeo dizer a duração
    var quadro = 0, timer = 0;
    var sobreBarra = false;
    var ocioAoTocar = false, tipoToque = "mouse";
    var ultimoSeg = -1, ultimaDur = -1;

    function duracao() { var d = video.duration; return isFinite(d) && d > 0 ? d : 0; }
    function tocando() { return !video.paused && !video.ended; }
    function temFonte() {
      var s = video.getAttribute("src");
      return !!(s && s.replace(/\s/g, "")) || !!video.querySelector("source[src]");
    }

    function rotular() {
      var t = tocando();
      raiz.classList.toggle("is-tocando", t);
      bTocar.setAttribute("aria-label", t ? "Pausar (K)" : "Tocar (K)");
      palco.setAttribute("aria-label", t ? "Pausar vídeo" : "Tocar vídeo");
      var mudo = video.muted || video.volume === 0;
      raiz.classList.toggle("is-mudo", mudo);
      bSom.setAttribute("aria-label", mudo ? "Ligar o som (M)" : "Tirar o som (M)");
      var v = mudo ? 0 : video.volume;
      volume.value = String(v);
      volume.style.setProperty("--bplayer-vol", (v * 100) + "%");
      volume.setAttribute("aria-valuetext", Math.round(v * 100) + "%");
      var cheia = elementoCheio() === raiz;
      raiz.classList.toggle("is-cheia", cheia);
      bCheia.setAttribute("aria-label", cheia ? "Sair da tela cheia (F)" : "Tela cheia (F)");
    }

    function desenhar() {
      var d = duracao();
      var t = arrastando ? posArraste : (video.currentTime || 0);
      var frac = d ? limitar(t / d, 0, 1) : (pendente !== null ? pendente : 0);
      if (!d && pendente !== null) t = 0;
      feito.style.width = (frac * 100) + "%";
      bolinha.style.left = (frac * 100) + "%";

      var fim = 0, b = video.buffered;
      try {
        for (var i = 0; i < b.length; i++) {
          if (b.start(i) <= t + 0.5 && b.end(i) >= t && b.end(i) > fim) fim = b.end(i);
        }
      } catch (e) {}
      carregado.style.width = d ? (limitar(fim / d, 0, 1) * 100) + "%" : "0%";

      var seg = Math.floor(t), dseg = Math.floor(d);
      if (seg !== ultimoSeg || dseg !== ultimaDur) {
        ultimoSeg = seg;
        ultimaDur = dseg;
        tempo.textContent = relogio(t) + " / " + (d ? relogio(d) : "--:--");
        linha.setAttribute("aria-valuemax", String(Math.round(d)));
        linha.setAttribute("aria-valuenow", String(Math.min(seg, Math.round(d))));
        linha.setAttribute("aria-valuetext", d ? falado(t) + " de " + falado(d) : falado(t));
      }
    }

    // A linha anda a cada quadro tocando (o timeupdate só vem 4 vezes por segundo).
    function laco() { quadro = 0; desenhar(); if (tocando()) quadro = requestAnimationFrame(laco); }
    function ligarLaco() { if (!quadro) quadro = requestAnimationFrame(laco); }
    function desligarLaco() { if (quadro) cancelAnimationFrame(quadro); quadro = 0; }

    // ------------------------------------------------------------ ações --
    function tocar() {
      if (!temFonte()) return;
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
    }
    function alternar() { if (tocando()) video.pause(); else tocar(); }
    function irPara(seg) {
      var d = duracao();
      if (!d) return;
      video.currentTime = limitar(seg, 0, Math.max(0, d - 0.05));
      desenhar();
    }
    function pular(delta) { irPara((video.currentTime || 0) + delta); }
    function alternarMudo() {
      if (video.muted || video.volume === 0) {
        video.muted = false;
        if (video.volume === 0) video.volume = 0.6;
      } else {
        video.muted = true;
      }
    }
    function telaCheia() {
      var atual = elementoCheio();
      if (atual) {
        var sair = document.exitFullscreen || document.webkitExitFullscreen;
        if (sair) { var ps = sair.call(document); if (ps && ps.catch) ps.catch(function () {}); }
        return;
      }
      var nativo = function () { try { if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); } catch (e) {} };
      if (document.fullscreenEnabled && raiz.requestFullscreen) {
        var p = raiz.requestFullscreen();
        if (p && p.catch) p.catch(nativo);
      } else if (document.webkitFullscreenEnabled && raiz.webkitRequestFullscreen) {
        raiz.webkitRequestFullscreen();
      } else {
        nativo();
      }
    }

    // ------------------------------------------- controles que somem tocando --
    function podeSumir() {
      if (!tocando() || arrastando || sobreBarra || !erro.hidden) return false;
      if (raiz.classList.contains("is-carregando")) return false;
      var a = document.activeElement;
      if (a && barra.contains(a)) {
        try { if (a.matches(":focus-visible")) return false; } catch (e) { return false; }
      }
      return true;
    }
    function talvezSumir() {
      timer = 0;
      if (podeSumir()) raiz.classList.add("is-ocioso");
      else if (tocando()) timer = setTimeout(talvezSumir, SUMIR_MS);
    }
    function mexeu() {
      raiz.classList.remove("is-ocioso");
      clearTimeout(timer);
      timer = tocando() ? setTimeout(talvezSumir, SUMIR_MS) : 0;
    }

    // ------------------------------------------------- linha do tempo --
    function fracNoPonto(x) {
      var r = linha.getBoundingClientRect();
      return r.width ? limitar((x - r.left) / r.width, 0, 1) : 0;
    }
    function mostrarDica(frac) {
      var d = duracao();
      if (!d) { dica.classList.remove("is-visivel"); return; }
      dica.textContent = relogio(frac * d);
      dica.classList.add("is-visivel");
      var w = linha.getBoundingClientRect().width, meia = dica.offsetWidth / 2;
      dica.style.left = limitar(frac * w, meia, Math.max(meia, w - meia)) + "px";
    }
    function arrastarPara(x, agora) {
      var frac = fracNoPonto(x), d = duracao();
      if (!d) { pendente = frac; desenhar(); return; }
      posArraste = frac * d;
      mostrarDica(frac);
      // Enquanto arrasta, o quadro acompanha o dedo sem pedir um seek por evento.
      var t = Date.now();
      if (agora || t - ultimoSeek > 120) { ultimoSeek = t; video.currentTime = Math.min(posArraste, Math.max(0, d - 0.05)); }
      desenhar();
    }
    function soltar(x) {
      if (!arrastando) return;
      if (typeof x === "number") arrastarPara(x, true);
      arrastando = false;
      idArraste = null;
      raiz.classList.remove("is-arrastando");
      dica.classList.remove("is-visivel");
      desenhar();
      mexeu();
    }

    function aoLinhaDown(e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      arrastando = true;
      idArraste = e.pointerId;
      raiz.classList.add("is-arrastando");
      try { linha.setPointerCapture(e.pointerId); } catch (er) {}
      arrastarPara(e.clientX, true);
    }
    function aoLinhaMove(e) {
      if (arrastando && e.pointerId === idArraste) { arrastarPara(e.clientX, false); return; }
      if (e.pointerType === "mouse") mostrarDica(fracNoPonto(e.clientX));
    }
    function aoLinhaUp(e) { if (arrastando && e.pointerId === idArraste) soltar(e.clientX); }
    function aoLinhaCancel(e) { if (arrastando && e.pointerId === idArraste) soltar(); }
    function aoLinhaSai() { if (!arrastando) dica.classList.remove("is-visivel"); }
    linha.addEventListener("pointerdown", aoLinhaDown);
    linha.addEventListener("pointermove", aoLinhaMove);
    linha.addEventListener("pointerup", aoLinhaUp);
    linha.addEventListener("pointercancel", aoLinhaCancel);
    linha.addEventListener("lostpointercapture", aoLinhaCancel);
    linha.addEventListener("pointerleave", aoLinhaSai);

    // ------------------------------------------------------ palco e botões --
    palco.addEventListener("pointerdown", function (e) {
      tipoToque = e.pointerType || "mouse";
      ocioAoTocar = raiz.classList.contains("is-ocioso");
    });
    palco.addEventListener("click", function () {
      // No toque, o primeiro toque com os controles escondidos só os mostra.
      if (tipoToque !== "mouse" && ocioAoTocar) { ocioAoTocar = false; mexeu(); return; }
      alternar();
      mexeu();
    });
    palco.addEventListener("dblclick", function () { if (tipoToque === "mouse") telaCheia(); });
    palco.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); alternar(); }
    });
    bTocar.addEventListener("click", alternar);
    bVoltar.addEventListener("click", function () { pular(-10); });
    bAvancar.addEventListener("click", function () { pular(10); });
    bSom.addEventListener("click", alternarMudo);
    bCheia.addEventListener("click", telaCheia);
    volume.addEventListener("input", function () {
      var v = parseFloat(volume.value) || 0;
      video.volume = v;
      video.muted = v === 0;
      rotular();
    });
    erroBtn.addEventListener("click", function () {
      esconderErro();
      try { video.load(); } catch (e) {}
      tocar();
    });
    barra.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") sobreBarra = true; });
    barra.addEventListener("pointerleave", function () { sobreBarra = false; });

    // ------------------------------------------- ouvintes na raiz e no doc --
    function aoTecla(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var k = e.key, alvo = e.target;
      var noControle = alvo && alvo.closest ? alvo.closest("button, a, input, select, textarea") : null;
      var naLinha = alvo === linha;
      if (k === " " || k === "Spacebar") {
        if (noControle) return;      // espaço num botão é o clique do botão
        e.preventDefault(); alternar();
      } else if (k === "k" || k === "K") {
        e.preventDefault(); alternar();
      } else if (k === "ArrowLeft" || k === "ArrowRight" || (naLinha && (k === "ArrowUp" || k === "ArrowDown"))) {
        if (alvo === volume) return; // as setas no volume mexem no volume
        e.preventDefault();
        pular(k === "ArrowLeft" || k === "ArrowDown" ? -5 : 5);
      } else if (naLinha && (k === "Home" || k === "End")) {
        e.preventDefault();
        irPara(k === "Home" ? 0 : duracao());
      } else if (k === "f" || k === "F") {
        e.preventDefault(); telaCheia();
      } else if (k === "m" || k === "M") {
        e.preventDefault(); alternarMudo();
      } else {
        return;
      }
      mexeu();
    }
    function aoMoverNaRaiz(e) { if (e.pointerType === "mouse") mexeu(); }
    function aoSairDaRaiz(e) {
      if (e.pointerType !== "mouse" || arrastando) return;
      sobreBarra = false;
      if (podeSumir()) { clearTimeout(timer); timer = 0; raiz.classList.add("is-ocioso"); }
    }
    raiz.addEventListener("keydown", aoTecla);
    raiz.addEventListener("pointermove", aoMoverNaRaiz);
    raiz.addEventListener("pointerdown", mexeu);
    raiz.addEventListener("pointerleave", aoSairDaRaiz);
    raiz.addEventListener("focusin", mexeu);

    function aoTelaCheia() { rotular(); mexeu(); }
    document.addEventListener("fullscreenchange", aoTelaCheia);
    document.addEventListener("webkitfullscreenchange", aoTelaCheia);

    // ------------------------------------------------ o que o <video> conta --
    function esconderErro() { erro.hidden = true; raiz.classList.remove("is-erro"); }
    function mostrarErro() {
      erro.hidden = false;
      raiz.classList.add("is-erro");
      raiz.classList.remove("is-carregando", "is-ocioso");
    }
    function atualizarVazio() { raiz.classList.toggle("is-vazio", !temFonte()); }

    // A fonte mudou (ou sumiu): tudo volta ao zero e é relido do <video>.
    function reiniciar() {
      pendente = null;
      if (arrastando) {
        arrastando = false;
        try { if (idArraste !== null) linha.releasePointerCapture(idArraste); } catch (e) {}
        idArraste = null;
      }
      raiz.classList.remove("is-arrastando", "is-carregando", "is-ocioso");
      dica.classList.remove("is-visivel");
      esconderErro();
      atualizarVazio();
      if (!temFonte() && elementoCheio() === raiz) telaCheia();
      ultimoSeg = -1;
      rotular();
      desenhar();
      if (tocando()) { ligarLaco(); mexeu(); } else { desligarLaco(); clearTimeout(timer); timer = 0; }
    }

    function aoMeta() {
      var d = duracao();
      if (d && pendente !== null) { video.currentTime = Math.min(pendente * d, Math.max(0, d - 0.05)); pendente = null; }
      ultimoSeg = -1;
      desenhar();
    }
    function aoTempo() { if (!quadro) desenhar(); }
    function aoTocar() { esconderErro(); rotular(); ligarLaco(); mexeu(); }
    function aoTocando() { raiz.classList.remove("is-carregando"); rotular(); ligarLaco(); }
    function aoPausar() {
      raiz.classList.remove("is-carregando", "is-ocioso");
      clearTimeout(timer);
      timer = 0;
      desligarLaco();
      rotular();
      desenhar();
    }
    function aoEsperar() { if (temFonte()) raiz.classList.add("is-carregando"); }
    function aoPoder() { raiz.classList.remove("is-carregando"); desenhar(); }
    function aoErro() {
      if (!temFonte()) { atualizarVazio(); return; }
      var c = video.error && video.error.code;
      if (!c || c === 1) return;    // 1 = abortado pela própria página
      mostrarErro();
    }
    function aoInicio() { esconderErro(); atualizarVazio(); }

    var ouvintes = [
      ["loadstart", aoInicio],
      ["emptied", reiniciar],
      ["loadedmetadata", aoMeta],
      ["durationchange", desenhar],
      ["timeupdate", aoTempo],
      ["progress", desenhar],
      ["seeked", aoPoder],
      ["play", aoTocar],
      ["playing", aoTocando],
      ["pause", aoPausar],
      ["ended", aoPausar],
      ["waiting", aoEsperar],
      ["canplay", aoPoder],
      ["volumechange", rotular],
      ["error", aoErro]
    ];
    for (var i = 0; i < ouvintes.length; i++) video.addEventListener(ouvintes[i][0], ouvintes[i][1]);

    // Trocar ou apagar o `src` nem sempre dispara `emptied` (no primeiro uso,
    // por exemplo); o observador garante o recomeço.
    var obs = null;
    if (window.MutationObserver) {
      obs = new MutationObserver(reiniciar);
      obs.observe(video, { attributes: true, attributeFilter: ["src"] });
    }

    reiniciar();

    var api = {
      destruir: function () {
        desligarLaco();
        clearTimeout(timer);
        if (obs) obs.disconnect();
        for (var j = 0; j < ouvintes.length; j++) video.removeEventListener(ouvintes[j][0], ouvintes[j][1]);
        raiz.removeEventListener("keydown", aoTecla);
        raiz.removeEventListener("pointermove", aoMoverNaRaiz);
        raiz.removeEventListener("pointerdown", mexeu);
        raiz.removeEventListener("pointerleave", aoSairDaRaiz);
        raiz.removeEventListener("focusin", mexeu);
        document.removeEventListener("fullscreenchange", aoTelaCheia);
        document.removeEventListener("webkitfullscreenchange", aoTelaCheia);
        if (ui.parentNode) ui.parentNode.removeChild(ui);
        raiz.classList.remove("bplayer", "is-tocando", "is-mudo", "is-cheia", "is-ocioso", "is-carregando", "is-arrastando", "is-erro", "is-vazio");
        video.classList.remove("bplayer__video");
        if (tinhaControles) video.controls = true;
        try { delete raiz.__bplayer; } catch (e) { raiz.__bplayer = undefined; }
      }
    };
    raiz.__bplayer = api;
    return api;
  }

  window.BfaPlayer = { montar: montar };
})();

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
  var CHAVE = "bfa-pedido-v1";
  var JSON_URL = "/bfa/ofertas.json";
  var VAGAS_URL = "/bfa-crm/api/vagas"; // unidades pagas por oferta (CRM); vagas = vagasIniciais − pagas
  var PRECOS_URL = "/bfa-crm/api/precos"; // preço de cada dia editado no CRM (tela Preços); vale por cima do ofertas.json
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
    if (D.chamadaDesconto) $("#max-off").textContent = D.chamadaDesconto;
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
    var vendidos = fetch(VAGAS_URL + "?t=" + Date.now(), { cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    var precosCrm = fetch(PRECOS_URL + "?t=" + Date.now(), { cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    return fetch(JSON_URL + "?t=" + Date.now(), { cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
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
        return Promise.all([vendidos, precosCrm]).then(function (res) {
          var v = res[0], pc = res[1];
          // preços salvos no CRM valem por cima do ofertas.json; sem resposta do CRM, fica o do arquivo
          if (pc && pc.precos) novo.itens.forEach(function (i) {
            var x = pc.precos[i.id];
            if (!x || !i.precos) return;
            for (var f in x) if (Object.prototype.hasOwnProperty.call(x, f) && typeof x[f] === "number" && x[f] > 0) i.precos[f] = x[f];
          });
          // esgotar pelo CRM (mesma tela): carimbo ESGOTADO e compra bloqueada
          if (pc && pc.esgotados && pc.esgotados.length) novo.itens.forEach(function (i) {
            if (pc.esgotados.indexOf(i.id) >= 0) i.esgotado = true;
          });
          // sem resposta do CRM, vale o número do ofertas.json
          if (v && v.vendidos) novo.itens.forEach(function (i) {
            if (i.vagasIniciais == null || i.vagas == null) return;
            i.vagas = Math.max(0, i.vagasIniciais - (Number(v.vendidos[i.id]) || 0));
          });
          D = novo; indexar(); ultimaBusca = Date.now();
          tick(true);
          renderTudo(false);
        });
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
  // vagas e preços ao vivo enquanto a página está aberta
  setInterval(function () { if (!document.hidden && Date.now() - ultimaBusca > 55000) buscarDados(); }, 60000);
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

  // ------------------------------------------- revelação suave na rolagem --
  if (!REDUZIR && "IntersectionObserver" in window) {
    var alvos = [];
    $$(".secao__cab, .horizonte, .grade, .grade--cursos, .mentoria").forEach(function (el) {
      var filhos = el.matches(".grade, .grade--cursos, .mentoria, .horizonte") ? Array.prototype.slice.call(el.children) : [el];
      filhos.forEach(function (f, k) { f.setAttribute("data-revela", ""); f.style.setProperty("--atraso", Math.min(k, 5) * 0.08 + "s"); alvos.push(f); });
    });
    doc.classList.add("revelar");
    var obsR = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("visto"); obsR.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    alvos.forEach(function (el) { obsR.observe(el); });
  }

  // ---------------------------------------------------- vídeo de depoimento --
  var dlgV = $("#video"), vid = dlgV ? $("video", dlgV) : null, origemVideo = null, videoEmpurrou = false;
  if (dlgV && vid && window.BfaPlayer) { try { window.BfaPlayer.montar($(".video-dlg__midia", dlgV), vid); } catch (e) {} }
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
      img.src = d.img; img.width = d.w; img.height = d.h;
    } else {
      img.removeAttribute("src");
      vid.poster = d.poster || ""; vid.src = d.mp4;
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

  // ------------------------------------------- mural "O que falam de mim" --
  (function () {
    var grade = $("#mural-grade"), corpo = $("#mural-corpo"), mais = $("#mural-mais");
    if (!grade || !corpo || !mais) return;
    var itens = $$(".mural__item", grade), ncols = 0, teto = 0;
    function colunas() { var w = corpo.clientWidth; return w >= 720 ? 3 : w >= 460 ? 2 : 1; }
    function montar() {
      var n = colunas();
      if (n === ncols) return;
      ncols = n;
      var cols = [], alt = [];
      for (var k = 0; k < n; k++) { var c = document.createElement("div"); c.className = "mural__col"; cols.push(c); alt.push(0); }
      itens.forEach(function (it) {
        var prop = parseFloat(it.style.getPropertyValue("--prop")) || 1;
        var k = alt.indexOf(Math.min.apply(null, alt));
        cols[k].appendChild(it);
        alt[k] += prop + 0.12;
      });
      grade.textContent = "";
      cols.forEach(function (c) { grade.appendChild(c); });
      grade.classList.add("js-mosaico");
    }
    function recolher() {
      if (corpo.getAttribute("data-aberto")) return;
      teto = Math.round(Math.max(1700, innerHeight * 2.6));
      corpo.style.setProperty("--teto", teto + "px");
      var longo = grade.scrollHeight > teto + 300;
      corpo.classList.toggle("recolhido", longo);
      mais.hidden = !longo;
    }
    function abrirTudo() {
      corpo.classList.remove("recolhido");
      corpo.setAttribute("data-aberto", "1");
      mais.hidden = true;
      mais.setAttribute("aria-expanded", "true");
    }
    mais.addEventListener("click", abrirTudo);
    corpo.addEventListener("focusin", function (e) {
      if (corpo.classList.contains("recolhido") && e.target.getBoundingClientRect().bottom > corpo.getBoundingClientRect().top + teto - 160) abrirTudo();
    });
    montar(); recolher();
    var t;
    window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(function () { montar(); recolher(); }, 150); });
  })();

  // ---------------------------------------------------------------- início --
  tick(true);
  if ((pedido.fase && !faseDe(pedido.fase)) || (!pedido.fase && linhas().length)) pedido.fase = faseExibida().id;
  renderTudo(false);
  buscarDados();
  window.__bfa = { agora: agora, situacao: function () { return atual; }, pedido: function () { return pedido; }, mensagem: function () { return mensagem(faseExibida()); } };
})();
