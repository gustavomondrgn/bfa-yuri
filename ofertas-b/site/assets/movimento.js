/* =============================================================================
   Página B (/bfa-b) · movimento.
   Não mexe em nada do pedido: só aparência. Com "reduzir movimento" (ou sem
   JavaScript) nada disto roda e a página fica parada e completa.
   GSAP e ScrollTrigger são locais (assets/vendor) e só baixam depois que a
   página já está na tela. Se não carregarem, a página continua inteira.

   Referências do acervo (codegridpro/sections), adaptadas:
   · 349 Landonorris Text Reveal / 248 Nite Riot — palavras subindo da máscara
   · 058 Marquee Animation On Scroll + 035 Kove — fitas que trocam de sentido
   · 102 ScrollTrigger Clipmask / 186 Zentry Scroll — janela que abre na mentoria
   · 038 ScrollTrigger Text Reveal / 321 Telescope Text — palavras acendendo
   · 159 Radial Rotating Texts — anel da Bússola gira com a rolagem
   · 339 Cards Reveal Scroll Animation + 066 3D Card Hover — cards
   · 282 Capsules Animated Columns — colunas do mural em velocidades diferentes
   ========================================================================== */
(function () {
  "use strict";
  var doc = document.documentElement;
  var eu = document.currentScript;
  if (!doc.classList.contains("anima")) return;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var MOUSE = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;

  // ------------------------------------------------ luz dos cards (sem GSAP) --
  if (MOUSE) {
    var cardAtual = null, ev = null, pedido = 0;
    var pintar = function () {
      pedido = 0;
      if (!cardAtual || !ev) return;
      var r = cardAtual.getBoundingClientRect();
      var x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
      cardAtual.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
      cardAtual.style.setProperty("--my", (y * 100).toFixed(1) + "%");
      // inclinação discreta (máx. ~2,4°); cards altos (detalhes abertos) quase não inclinam
      var forca = Math.min(1, 520 / r.height);
      cardAtual.style.setProperty("--rx", ((0.5 - y) * 4.8 * forca).toFixed(2) + "deg");
      cardAtual.style.setProperty("--ry", ((x - 0.5) * 4.8 * forca).toFixed(2) + "deg");
    };
    document.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      var c = e.target.closest && e.target.closest(".oferta");
      if (c !== cardAtual && cardAtual) { cardAtual.style.removeProperty("--rx"); cardAtual.style.removeProperty("--ry"); }
      cardAtual = c; ev = e;
      if (c && !pedido) pedido = requestAnimationFrame(pintar);
    }, { passive: true });
  }

  // ------------------------------------- fogo na faixa do timer (canvas) --
  // O mesmo fogo de partículas do GIF "faltam menos de 2 horas"
  // (materiais/ultima-chamada-noite-2026-11-16/fogo.mjs), no tamanho da faixa:
  // chamas sobem da borda de baixo e brasas escapam por cima. ~30 quadros/s,
  // para sozinho com a aba escondida; sem JS ou com "reduzir movimento", fica o vermelho.
  (function () {
    var cv = $(".alerta__fogo");
    if (!cv || !cv.getContext) return;
    var c = cv.getContext("2d");
    if (!c) return;
    var W = 0, H = 0;
    var CORES = ["255,236,180", "255,186,80", "255,128,34", "240,70,15", "190,30,8", "110,16,5"];
    var sprites = CORES.map(function (k) {
      var s = document.createElement("canvas"); s.width = s.height = 64;
      var g = s.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(" + k + ",1)"); gr.addColorStop(0.45, "rgba(" + k + ",.42)"); gr.addColorStop(1, "rgba(" + k + ",0)");
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return s;
    });
    function medir() {
      var R = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = Math.round(W * R); cv.height = Math.round(H * R);
      c.setTransform(R, 0, 0, R, 0, 0);
    }
    medir();
    addEventListener("resize", medir);
    var P = [], ult = 0;
    function solta(brasa) {
      P.push({
        x: Math.random() * (W + 40) - 20, y: H + 4 + Math.random() * 6,
        vx: (Math.random() - 0.5) * (brasa ? 30 : 14), vy: -(brasa ? 30 + Math.random() * 40 : 20 + Math.random() * 30),
        vida: 1, gasto: brasa ? 0.5 + Math.random() * 0.5 : 1.2 + Math.random() * 1.1,
        r: brasa ? 0.8 + Math.random() * 0.9 : 7 + Math.random() * 9, brasa: brasa, fase: Math.random() * 6.28
      });
    }
    function quadro(t) {
      requestAnimationFrame(quadro);
      if (t - ult < 30) return;
      var dt = ult ? Math.min(0.05, (t - ult) / 1000) : 0.033;
      ult = t;
      var n = Math.ceil(W / 30);
      for (var i = 0; i < n; i++) solta(false);
      if (Math.random() < W / 700) solta(true);
      c.clearRect(0, 0, W, H);
      c.globalCompositeOperation = "lighter";
      for (var k = P.length - 1; k >= 0; k--) {
        var p = P[k];
        p.vx += Math.sin(p.fase + p.y * 0.08) * (p.brasa ? 40 : 18) * dt;
        p.vy -= (p.brasa ? 6 : 30) * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.vida -= p.gasto * dt;
        if (p.vida <= 0 || p.y < -8) { P.splice(k, 1); continue; }
        var gasto = 1 - p.vida;
        if (p.brasa) {
          c.globalAlpha = Math.min(1, p.vida * 1.5);
          c.fillStyle = "rgb(255," + ((200 - gasto * 90) | 0) + ",90)";
          c.fillRect(p.x, p.y, p.r, p.r);
          continue;
        }
        var raio = p.r * (0.6 + gasto * 0.8);
        c.globalAlpha = Math.min(1, p.vida * 1.2) * 0.5;
        c.drawImage(sprites[Math.min(5, (gasto * 6) | 0)], p.x - raio, p.y - raio, raio * 2, raio * 2);
      }
      c.globalAlpha = 1;
    }
    requestAnimationFrame(quadro);
  })();

  // ------------------------------------ fundo da abertura: tempestade --
  // Escolhida por Gustavo em 17/11 (no lugar do "80%" gigante). WebGL leve, em ~45% da resolução
  // (nuvem é macia); raios num canvas 2D. Para fora da tela e com a aba escondida.
  (function () {
    var abertura = $(".abertura"), cv = $(".ceu-tela");
    if (!abertura || !cv) return;
    var visivel = true;
    if ("IntersectionObserver" in window) new IntersectionObserver(function (e) { visivel = e[0].isIntersecting; }).observe(abertura);
    var t0 = performance.now();
    // com a abertura animada, o primeiro raio cai logo depois que a cortina sobe
    var depoisDaCortina = t0 + (doc.classList.contains("com-intro") ? 2300 : 500);
    try { tempestade(); } catch (e) { cv.style.display = "none"; }

    function tempestade() {
      var gl = cv.getContext("webgl", { antialias: false, alpha: false, depth: false, powerPreference: "low-power" }) || cv.getContext("experimental-webgl");
      if (!gl) return;
      var VS = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
      var FS = [
        "#ifdef GL_FRAGMENT_PRECISION_HIGH", "precision highp float;", "#else", "precision mediump float;", "#endif",
        "uniform vec2 R;uniform float T;uniform float F;uniform vec2 L;uniform float S;",
        "float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}",
        "float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}",
        "float fbm(vec2 p){float v=0.,a=.5;for(int k=0;k<5;k++){v+=a*n(p);p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(3.1,1.7);a*=.5;}return v;}",
        "void main(){",
        " vec2 uv=gl_FragCoord.xy/R;",
        " vec2 p=(gl_FragCoord.xy-vec2(.5*R.x,R.y))/S;",
        // redemoinho com o olho logo acima do topo, girando devagar
        " vec2 d=p-vec2(0.,.32);float r=length(d);",
        " float a=.9/(r+.45)+T*.04;float cs=cos(a),sn=sin(a);",
        " vec2 q=mat2(cs,-sn,sn,cs)*d*1.7;",
        " vec2 w=vec2(fbm(q+vec2(0.,T*.03)),fbm(q+vec2(5.2,1.3)-vec2(T*.025,0.)));",
        " float v=fbm(q*1.3+w*2.);",
        " vec3 c=mix(vec3(.018,.01,.008),vec3(.38,.032,.018),smoothstep(.3,.66,v));",
        " c=mix(c,vec3(.82,.1,.045),smoothstep(.58,.8,v));",
        " c+=vec3(1.,.45,.2)*pow(smoothstep(.66,.88,v),2.)*.35;",
        " c*=.55+.45*smoothstep(.3,.62,fbm(q*.7-w));",
        // brilho pela altura do céu (no celular o céu é estreito e alto) e um pouco pelo redemoinho
        " c*=(.42+.8*smoothstep(-.15,.85,uv.y))*(.55+.45*exp(-r*.5));",
        // clarão do raio: acende as nuvens perto dele
        " float fl=F*exp(-length((uv-L)*vec2(R.x/R.y,1.))*1.6);",
        " c+=fl*(.25+1.5*v*v)*vec3(1.,.48,.4)+F*.05*vec3(1.,.3,.25);",
        " gl_FragColor=vec4(c,1.);",
        "}"
      ].join("\n");
      function sh(tipo, src) {
        var o = gl.createShader(tipo); gl.shaderSource(o, src); gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
        return o;
      }
      var pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error("link");
      gl.useProgram(pr);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var la = gl.getAttribLocation(pr, "a"); gl.enableVertexAttribArray(la); gl.vertexAttribPointer(la, 2, gl.FLOAT, false, 0, 0);
      var uR = gl.getUniformLocation(pr, "R"), uT = gl.getUniformLocation(pr, "T"), uF = gl.getUniformLocation(pr, "F"),
          uL = gl.getUniformLocation(pr, "L"), uS = gl.getUniformLocation(pr, "S");

      var rc = $(".ceu-raios"), c2 = rc && rc.getContext("2d");
      var ESC = 0.45, W = 0, H = 0;
      function medir() {
        W = cv.clientWidth; H = cv.clientHeight;
        cv.width = Math.max(2, Math.round(W * ESC)); cv.height = Math.max(2, Math.round(H * ESC));
        gl.viewport(0, 0, cv.width, cv.height);
        gl.uniform2f(uR, cv.width, cv.height);
        gl.uniform1f(uS, Math.min(560, Math.max(300, W * 0.5)) * ESC);
        if (c2) {
          var k = Math.min(2, window.devicePixelRatio || 1);
          rc.width = Math.round(W * k); rc.height = Math.round(H * k);
          c2.setTransform(k, 0, 0, k, 0, 0);
        }
      }
      medir();
      addEventListener("resize", medir);

      // raio: deslocamento do ponto médio, com galhos; cai pelas laterais (longe do título)
      function desloca(x0, y0, x1, y1, d, prof, out) {
        if (!prof) { out.push(x1, y1); return; }
        var mx = (x0 + x1) / 2 + (Math.random() - 0.5) * d, my = (y0 + y1) / 2 + (Math.random() - 0.5) * d * 0.3;
        desloca(x0, y0, mx, my, d * 0.55, prof - 1, out);
        desloca(mx, my, x1, y1, d * 0.55, prof - 1, out);
      }
      var raio = null, proximo = depoisDaCortina, LX = 0.2, LY = 0.7;
      function novoRaio(t) {
        // cai nos vãos livres: fora do título e do card da Bússola (no celular, pela direita)
        var vaos = livres();
        var v = vaos[(Math.random() * vaos.length) | 0];
        var x0 = v[0] + Math.random() * (v[1] - v[0]);
        var y1 = H * (W < 1000 ? 0.24 + Math.random() * 0.24 : 0.36 + Math.random() * 0.34);
        var x1 = Math.max(v[0] - 20, Math.min(v[1] + 20, x0 + (Math.random() - 0.5) * (v[1] - v[0])));
        var tronco = [x0, -8]; desloca(x0, -8, x1, y1, Math.min(220, y1 * 0.4), 7, tronco);
        var ramos = [];
        for (var i = 8; i < tronco.length - 12; i += 2) {
          if (Math.random() < 0.07) {
            var bx = tronco[i], by = tronco[i + 1], comp = (y1 - by) * (0.3 + Math.random() * 0.4);
            var rm = [bx, by];
            desloca(bx, by, bx + (Math.random() < 0.5 ? -1 : 1) * comp * (0.4 + Math.random() * 0.6), by + comp, comp * 0.35, 5, rm);
            ramos.push(rm);
          }
        }
        LX = x1 / W; LY = 1 - (y1 * 0.6) / H;
        return { t0: t, tronco: tronco, ramos: ramos };
      }
      function livres() {
        if (W < 1000) return [[W * 0.8, W * 0.97]];
        var base = cv.getBoundingClientRect().left, ocup = [];
        [".abertura__texto", ".destaque"].forEach(function (s) { var e = $(s); if (e) { var r = e.getBoundingClientRect(); ocup.push([r.left - base - 30, r.right - base + 30]); } });
        ocup.sort(function (a, b) { return a[0] - b[0]; });
        var vaos = [], x = 12;
        ocup.forEach(function (o) { if (o[0] - x > 50) vaos.push([x, o[0]]); x = Math.max(x, o[1]); });
        if (W - 12 - x > 50) vaos.push([x, W - 12]);
        return vaos.length ? vaos : [[W * 0.02, W * 0.08]];
      }
      // tremulação de raio de verdade: acende, quase apaga, acende de novo e some
      function brilho(s) { return s < 0.06 ? 1 : s < 0.11 ? 0.15 : s < 0.19 ? 0.95 : s < 0.6 ? 0.95 * Math.pow(1 - (s - 0.19) / 0.41, 2) : 0; }
      function traco(pts) { c2.beginPath(); c2.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) c2.lineTo(pts[i], pts[i + 1]); c2.stroke(); }
      function desenhaRaio(b) {
        c2.clearRect(0, 0, W, H);
        c2.globalCompositeOperation = "lighter"; c2.lineCap = c2.lineJoin = "round";
        [[18, "255,40,24", 0.14], [6, "255,96,64", 0.5], [2.2, "255,240,234", 1]].forEach(function (ps) {
          c2.lineWidth = ps[0]; c2.strokeStyle = "rgba(" + ps[1] + "," + ps[2] * b + ")"; traco(raio.tronco);
          c2.lineWidth = ps[0] * 0.5; c2.strokeStyle = "rgba(" + ps[1] + "," + ps[2] * b * 0.7 + ")";
          raio.ramos.forEach(traco);
        });
      }
      var ult = 0, pronta = false, clarao = 0;
      function quadro(t) {
        requestAnimationFrame(quadro);
        if (!visivel || t - ult < 32) return;
        ult = t;
        var F = 0;
        if (c2 && !raio && t >= proximo) raio = novoRaio(t);
        if (raio) {
          var s = (t - raio.t0) / 1000;
          if (s > 0.6) {
            raio = null; c2.clearRect(0, 0, W, H);
            // às vezes cai um segundo logo em seguida
            proximo = t + (Math.random() < 0.22 ? 250 + Math.random() * 350 : 2800 + Math.random() * 5200);
          } else { F = brilho(s); desenhaRaio(F); }
        }
        if (F !== clarao) { clarao = F; abertura.style.setProperty("--clarao", F.toFixed(2)); }
        gl.uniform1f(uT, (t - t0) / 1000);
        gl.uniform1f(uF, F * 0.9);
        gl.uniform2f(uL, LX, LY);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (!pronta) { pronta = true; cv.classList.add("pronta"); }
      }
      requestAnimationFrame(quadro);
    }
  })();

  // ------------------------------------------------------ carregar o GSAP --
  function script(src) {
    return new Promise(function (ok, falha) {
      if (!src) return falha(new Error("sem src"));
      var s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = ok; s.onerror = falha;
      document.head.appendChild(s);
    });
  }
  var urlG = eu && eu.getAttribute("data-gsap"), urlS = eu && eu.getAttribute("data-st");
  script(urlG).then(function () { return script(urlS); }).then(iniciar).catch(function () {});

  // está abaixo da tela? (só esconde para revelar o que ainda não foi visto)
  function abaixo(el) { return el.getBoundingClientRect().top > innerHeight * 0.9; }

  function iniciar() {
    var gsap = window.gsap, ST = window.ScrollTrigger;
    if (!gsap || !ST) return;
    gsap.registerPlugin(ST);
    ST.config({ ignoreMobileResize: true });
    doc.classList.add("gsap");
    var topo = $(".topo");

    // ---------------------------------------- progresso + fitas na rolagem --
    var fitas = $$(".fita").map(function (f, k) {
      var tr = $(".fita__trilho", f);
      var ida = k % 2 === 0; // a vermelha vai para a esquerda, a escura volta
      return gsap.fromTo(tr, { xPercent: ida ? 0 : -50 }, { xPercent: ida ? -50 : 0, duration: ida ? 42 : 50, ease: "none", repeat: -1 });
    });
    var calma = 0, sentido = 1;
    ST.create({
      start: 0, end: "max",
      onUpdate: function (s) {
        if (topo) topo.style.setProperty("--p", s.progress.toFixed(4));
        sentido = s.direction || 1;
        var v = Math.min(7, 1 + Math.abs(s.getVelocity()) / 320);
        fitas.forEach(function (tw) { gsap.to(tw, { timeScale: sentido * v, duration: 0.25, overwrite: true }); });
        clearTimeout(calma);
        calma = setTimeout(function () { fitas.forEach(function (tw) { gsap.to(tw, { timeScale: sentido, duration: 1.4, ease: "power2.out", overwrite: true }); }); }, 140);
      }
    });
    var blocoFitas = $(".fitas");
    if (blocoFitas) ST.create({ trigger: blocoFitas, start: "top bottom", end: "bottom top", onToggle: function (s) { fitas.forEach(function (tw) { if (s.isActive) tw.play(); else tw.pause(); }); } });

    // --------------------------------------------------------- abertura --
    var abertura = $(".abertura");
    if (abertura) {
      // pausa as animações infinitas do topo quando ele sai da tela
      ST.create({ trigger: abertura, start: "top top", end: "bottom top", onLeave: function () { abertura.classList.add("parado"); }, onEnterBack: function () { abertura.classList.remove("parado"); } });
      gsap.to(".horizonte-fogo", { opacity: 0.25, ease: "none", scrollTrigger: { trigger: abertura, start: "top top", end: "bottom top", scrub: true } });
    }

    // anel da Bússola gira com a rolagem (por cima do giro lento do CSS)
    var anel = $(".dial__anel");
    if (anel) gsap.to(anel, { rotation: 300, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.8 } });

    // ------------------------------------------- cabeçalhos das seções --
    $$(".secao__cab, .mural__cab, .mentoria__cab").forEach(function (cab) {
      var fant = $(".secao__fantasma", cab);
      if (fant) gsap.fromTo(fant, { xPercent: 14 }, { xPercent: -14, ease: "none", scrollTrigger: { trigger: cab, start: "top bottom", end: "bottom top", scrub: 0.5 } });
      if (!abaixo(cab)) return;
      var palavras = $$("h2 .m > span", cab);
      var resto = $$(".secao__intro, .mural__intro, .sobretitulo, .secao__num, .mentoria__sub", cab);
      var regua = $(".secao__regua", cab);
      gsap.set(palavras, { yPercent: 118 });
      gsap.set(resto, { y: 22, opacity: 0 });
      if (regua) gsap.set(regua, { scaleX: 0 });
      ST.create({
        trigger: cab, start: "top 86%", once: true,
        onEnter: function () {
          gsap.to(palavras, { yPercent: 0, duration: 1.15, ease: "expo.out", stagger: 0.07 });
          gsap.to(resto, { y: 0, opacity: 1, duration: 1, ease: "power3.out", delay: 0.25, stagger: 0.08 });
          if (regua) gsap.to(regua, { scaleX: 1, duration: 1.6, ease: "expo.inOut", delay: 0.1 });
        }
      });
    });

    // ---------------------------------------------------------- horizontes --
    var hz = $(".horizonte");
    if (hz && abaixo(hz)) {
      var linhas = $$(".horizonte > div", hz), segs = $$(".regua i", hz);
      gsap.set(linhas, { y: 26, opacity: 0 });
      gsap.set(segs, { scaleX: 0 });
      ST.create({
        trigger: hz, start: "top 88%", once: true,
        onEnter: function () {
          gsap.to(linhas, { y: 0, opacity: 1, duration: 0.9, ease: "power3.out", stagger: 0.1 });
          gsap.to(segs, { scaleX: 1, duration: 0.7, ease: "power3.out", stagger: 0.035, delay: 0.25 });
        }
      });
    }

    // --------------------------------------------- cards: sobem da máscara --
    var cards = $$("main .grade > .oferta, main .grade--cursos > *, .oferta--mentoria, .depos > .depo").filter(abaixo);
    if (cards.length) {
      gsap.set(cards, { y: 80, opacity: 0, rotation: function (k) { return k % 2 ? 1.8 : -1.8; }, clipPath: "inset(-3rem -2rem 100% -2rem round 20px)" });
      ST.batch(cards, {
        start: "top 92%", once: true,
        onEnter: function (lote) {
          gsap.to(lote, { y: 0, opacity: 1, rotation: 0, clipPath: "inset(-3rem -2rem -3rem -2rem round 20px)", duration: 1.15, ease: "expo.out", stagger: 0.1, overwrite: true, clearProps: "transform,clipPath,opacity" });
        }
      });
    }
    // recibo dos pacotes: linha a linha
    $$(".recibo").filter(abaixo).forEach(function (rb) {
      var lis = $$("li", rb);
      gsap.set(lis, { x: -14, opacity: 0 });
      ST.create({ trigger: rb, start: "top 88%", once: true, onEnter: function () { gsap.to(lis, { x: 0, opacity: 1, duration: 0.6, ease: "power2.out", stagger: 0.045, clearProps: "transform,opacity" }); } });
    });

    // --------------------------------------------------------- mentoria --
    var faixa = $(".faixa-mentoria");
    if (faixa) {
      // janela que abre: de um recorte com cantos arredondados até a seção inteira
      gsap.fromTo(faixa, { clipPath: "inset(6% 5% 0% 5% round 40px)" }, { clipPath: "inset(0% 0% 0% 0% round 0px)", ease: "none", scrollTrigger: { trigger: faixa, start: "top bottom", end: "top 18%", scrub: 0.4 } });
      var ag = $(".aguia", faixa);
      if (ag) gsap.fromTo(ag, { y: 70, scale: 0.86 }, { y: -10, scale: 1, ease: "none", scrollTrigger: { trigger: faixa, start: "top bottom", end: "top top", scrub: 0.6 } });
      $$(".palavras", faixa).forEach(function (p) {
        var ws = $$(".w", p);
        gsap.fromTo(ws, { opacity: 0.17 }, { opacity: 1, ease: "none", stagger: 0.06, scrollTrigger: { trigger: p, start: "top 84%", end: "bottom 50%", scrub: 0.5 } });
      });
      var lista = $$(".mentoria__lista li", faixa).filter(abaixo);
      if (lista.length) {
        gsap.set(lista, { x: -18, opacity: 0 });
        ST.batch(lista, { start: "top 92%", once: true, onEnter: function (l) { gsap.to(l, { x: 0, opacity: 1, duration: 0.8, ease: "power3.out", stagger: 0.08, clearProps: "transform,opacity" }); } });
      }
    }

    // ------------------------------------------------------------- mural --
    var mural = $(".mural");
    if (mural) {
      ST.create({
        trigger: mural, start: "top bottom", end: "bottom top",
        onUpdate: function (s) {
          var cols = $$(".mural__col", mural);
          if (cols.length < 2) { cols.forEach(function (c) { c.style.transform = ""; }); return; }
          var f = [0, 1, 0.45];
          cols.forEach(function (c, k) { c.style.transform = "translate3d(0," + ((1 - s.progress) * 110 * (f[k] || 0)).toFixed(1) + "px,0)"; });
        }
      });
    }

    // ---------------------------------------------- manter tudo alinhado --
    // abrir "Ver detalhes", "Ver mais depoimentos" ou carregar imagens muda a altura
    // da página: recalcula os gatilhos (sem pin, nada empurra a página)
    var alt = document.body.scrollHeight, t = 0;
    var recalcular = function () { clearTimeout(t); t = setTimeout(function () { var h = document.body.scrollHeight; if (Math.abs(h - alt) > 2) { alt = h; ST.refresh(); } }, 220); };
    if ("ResizeObserver" in window) new ResizeObserver(recalcular).observe(document.body);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ST.refresh(); });
  }
})();
