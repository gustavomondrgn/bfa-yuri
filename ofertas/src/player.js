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
