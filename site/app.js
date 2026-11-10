/* ==========================================================================
   /bfa-grupo — medição da página ponte (Meta Pixel)

   A página funciona inteira sem este arquivo: o botão é um link comum para o
   convite do grupo. Aqui só se registram dois sinais, e nenhum deles prova
   que a pessoa entrou no grupo:

     1. PageView            visita à página
     2. WhatsAppGroupClick  clique no botão (evento personalizado)

   Regras:
   - Sem ID do Pixel na <meta name="meta-pixel-id">, nada da Meta é carregado.
   - Se já existir um fbq global na página, não inicializa de novo nem repete
     o PageView; só registra o clique.
   - O clique nunca é bloqueado, atrasado ou redirecionado por este código.
   - Só os campos utm_source, utm_medium, utm_campaign e utm_content são lidos,
     e só com valores simples (letras, números, _ - .). Nada mais da URL vai
     nos parâmetros dos eventos. Sem Lead, sem dados pessoais.
   ========================================================================== */
(function () {
  "use strict";

  var EVENTO_CLIQUE = "WhatsAppGroupClick";
  var CAMPOS_UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
  var VALOR_UTM = /^[A-Za-z0-9_.\-]{1,100}$/;
  var ID_PIXEL = /^\d{8,20}$/;
  var FBEVENTS = "https://connect.facebook.net/en_US/fbevents.js";

  // um toque duplo ou um clique repetido no mesmo instante conta uma vez só
  var INTERVALO_MINIMO_MS = 1000;

  function lerUtms() {
    var dados = {};
    var busca;

    try {
      busca = new URLSearchParams(window.location.search);
    } catch (e) {
      return dados;
    }

    for (var i = 0; i < CAMPOS_UTM.length; i++) {
      var valor = busca.get(CAMPOS_UTM[i]);
      if (valor) valor = valor.trim();
      if (valor && VALOR_UTM.test(valor)) dados[CAMPOS_UTM[i]] = valor;
    }

    return dados;
  }

  function lerIdPixel() {
    var meta = document.querySelector('meta[name="meta-pixel-id"]');
    var id = meta ? (meta.getAttribute("content") || "").trim() : "";
    return ID_PIXEL.test(id) ? id : "";
  }

  // código-base oficial da Meta (fila + carregamento assíncrono do fbevents.js)
  function carregarFbq() {
    /* eslint-disable */
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script', FBEVENTS);
    /* eslint-enable */
  }

  var utms = lerUtms();
  var pixelGlobal = typeof window.fbq === "function";
  var podeMedir = pixelGlobal;

  if (!pixelGlobal) {
    var id = lerIdPixel();

    if (id) {
      try {
        carregarFbq();
        // modo manual: sem isto o Pixel registra cliques automáticos
        // (SubscribedButtonClick) e o mesmo toque viraria dois sinais
        window.fbq("set", "autoConfig", false, id);
        window.fbq("init", id);
        window.fbq("track", "PageView", utms);
        podeMedir = true;
      } catch (e) {
        podeMedir = false;
      }
    }
  }

  if (!podeMedir) return;

  var botao = document.querySelector('[data-cta="whatsapp-group"]');
  if (!botao) return;

  var ultimoClique = 0;

  botao.addEventListener("click", function () {
    var agora = Date.now();
    if (agora - ultimoClique < INTERVALO_MINIMO_MS) return;
    ultimoClique = agora;

    try {
      if (typeof window.fbq === "function") {
        window.fbq("trackCustom", EVENTO_CLIQUE, utms);
      }
    } catch (e) {
      /* medição nunca interfere no clique */
    }
  });
})();
