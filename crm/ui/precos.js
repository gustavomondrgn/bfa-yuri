// =============================================================================
//  CRM · tela Preços (/bfa-crm/precos). Lista todas as ofertas na ordem e nas seções
//  da página, com o preço de cada dia. Salvar grava no CRM (PUT /api/precos) e a
//  página /bfa usa na hora (ela lê /api/precos por cima do ofertas.json, sem deploy).
//  O catálogo (nomes, seções, preço cheio, dias) vem do ofertas.json da própria página.
// =============================================================================
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const BASE = document.body.dataset.base || "";
  const CATALOGO = document.body.dataset.catalogo || "/bfa/ofertas.json";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brl = (n) => "R$ " + Number(n).toLocaleString("pt-BR");

  let D = null;          // ofertas.json da página
  let salvo = {};        // o que está gravado no CRM
  let esgSalvo = new Set(); // ofertas esgotadas pelo CRM (gravado)
  const esgAtual = new Set(); // como está na tela agora
  let vale = {};         // preço que a página usa hoje: salvo ?? ofertas.json  (id -> dia -> n)
  let ofertas = [];      // itens na ordem da página

  function aviso(txt, tipo) {
    const el = document.createElement("div");
    el.className = "aviso" + (tipo ? " aviso--" + tipo : "");
    el.setAttribute("role", tipo === "erro" ? "alert" : "status");
    el.textContent = txt;
    $("#avisos").append(el);
    setTimeout(() => el.classList.add("aviso--sai"), 6500);
    setTimeout(() => el.remove(), 6900);
  }

  function situacao(f) {
    const t = Date.now();
    if (t >= Date.parse(f.fim)) return "passado";
    if (t >= Date.parse(f.inicio)) return "hoje";
    return "futuro";
  }
  function rotuloDia(f) {
    const d = new Date(f.inicio);
    const dia = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(d);
    const sem = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" }).format(d).replace(".", "");
    return { dia, sem };
  }
  const offDe = (v, ref) => (ref && v ? Math.round((1 - v / ref) * 100) : null);

  async function carregar() {
    const [cat, pr] = await Promise.all([
      fetch(CATALOGO + "?t=" + Date.now(), { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error("ofertas.json respondeu " + r.status); return r.json(); }),
      fetch(BASE + "/api/precos?t=" + Date.now(), { cache: "no-store", credentials: "same-origin" }).then((r) => { if (!r.ok) throw new Error("CRM respondeu " + r.status); return r.json(); }),
    ]);
    D = cat; salvo = pr.precos || {};
    esgSalvo = new Set(Array.isArray(pr.esgotados) ? pr.esgotados : []);
    ofertas = [];
    for (const s of D.secoes || []) for (const i of D.itens || []) {
      if (i.secao !== s.id || !i.precos || (i.cenario && i.cenario !== D.cenarioCursos)) continue;
      ofertas.push(i);
    }
    vale = {};
    for (const i of ofertas) {
      vale[i.id] = {};
      for (const f of D.fases) {
        const v = salvo[i.id]?.[f.id] ?? i.precos[f.id];
        vale[i.id][f.id] = Number.isInteger(v) && v > 0 ? v : null;
      }
    }
    info(pr.atualizado);
    montar();
  }

  function info(quando) {
    $("#pr-info").textContent = quando
      ? "Última vez salvo: " + new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(quando))
      : "Ainda nada salvo aqui: os valores abaixo são os da página.";
  }

  function montar() {
    const dias = D.fases.map((f) => ({ f, sit: situacao(f), ...rotuloDia(f) }));
    const cab = `<div class="pr-cab"><span>Oferta</span><span>Preço cheio</span>${dias.map((d) => `<span class="${d.sit}">${d.dia} ${d.sem}${d.sit === "hoje" ? " · no ar" : d.sit === "passado" ? " · encerrado" : ""}</span>`).join("")}<span>Esgotar</span></div>`;
    esgAtual.clear(); esgSalvo.forEach((id) => esgAtual.add(id));
    let html = "";
    let k = 0;
    for (const s of D.secoes) {
      const lista = ofertas.filter((i) => i.secao === s.id);
      if (!lista.length) continue;
      html += `<section class="cartao pr-sec" style="--i:${k++}"><h2>${esc(s.nome)}</h2>${cab}`;
      for (const i of lista) {
        const ref = i.referencia;
        html += `<div class="pr-linha" data-id="${esc(i.id)}"><div class="pr-nome"><b>${esc(i.nome)}${i.subnome ? ` <span>${esc(i.subnome)}</span>` : ""}</b><small>${esc([i.formato, i.detalhe].filter(Boolean).join(" · "))}</small></div>
          <div class="pr-ref">${ref ? brl(ref) : "—"}</div>`;
        for (const d of dias) {
          const v = vale[i.id][d.f.id];
          html += `<label class="pr-cel ${d.sit}"><span class="pr-dia">${d.dia} ${d.sem}</span><span class="pr-campo"><i>R$</i><input inputmode="numeric" autocomplete="off" data-id="${esc(i.id)}" data-f="${esc(d.f.id)}" value="${v ?? ""}"${d.sit === "passado" ? " disabled" : ""} aria-label="${esc(i.nome)}, ${d.dia}"></span><small class="pr-off"></small></label>`;
        }
        // esgotado no próprio ofertas.json não dá para reabrir daqui (só o arquivo manda nisso)
        const fixo = !!i.esgotado;
        html += `<div class="pr-esg-cel"><button type="button" class="pr-esg" data-esg="${esc(i.id)}" aria-pressed="${fixo || esgAtual.has(i.id)}"${fixo ? ' disabled title="Esgotado no arquivo da página"' : ""}><i aria-hidden="true"></i><span>${fixo || esgAtual.has(i.id) ? "Esgotado" : "Esgotar"}</span></button></div>`;
        html += `</div>`;
      }
      html += `</section>`;
    }
    $("#pr-tabela").innerHTML = html;
    $$("#pr-tabela input").forEach(conferir);
    $$("#pr-tabela .pr-esg").forEach(pintarEsg);
    barra();
  }

  const lerCampo = (inp) => { const s = inp.value.replace(/\D/g, ""); return s ? Number(s) : null; };
  function conferir(inp) {
    const cel = inp.closest(".pr-cel"), id = inp.dataset.id, f = inp.dataset.f;
    const v = lerCampo(inp), i = ofertas.find((o) => o.id === id), off = offDe(v, i.referencia);
    cel.classList.toggle("mudou", v !== vale[id][f]);
    cel.classList.toggle("erro", !v);
    const sm = $(".pr-off", cel);
    sm.classList.toggle("acima", off != null && off < 0);
    sm.textContent = !v ? "falta o preço" : off == null ? "" : off < 0 ? "acima do cheio" : `-${off}%`;
  }
  function mudancas() {
    return $$("#pr-tabela input:not(:disabled)").filter((inp) => lerCampo(inp) !== vale[inp.dataset.id][inp.dataset.f]).map((inp) => ({ inp, id: inp.dataset.id, f: inp.dataset.f, de: vale[inp.dataset.id][inp.dataset.f], para: lerCampo(inp) }));
  }
  function mudancasEsg() {
    const m = [];
    for (const i of ofertas) if (esgAtual.has(i.id) !== esgSalvo.has(i.id)) m.push({ id: i.id, esgotar: esgAtual.has(i.id) });
    return m;
  }
  function pintarEsg(btn) {
    const id = btn.dataset.esg, on = esgAtual.has(id) || btn.disabled;
    btn.setAttribute("aria-pressed", String(on));
    $("span", btn).textContent = on ? "Esgotado" : "Esgotar";
    btn.closest(".pr-linha").classList.toggle("esgotada", on);
    btn.classList.toggle("mudou", !btn.disabled && esgAtual.has(id) !== esgSalvo.has(id));
  }
  function barra() {
    const m = mudancas(), me = mudancasEsg(), erro = $$("#pr-tabela .pr-cel.erro input:not(:disabled)").length;
    const n = m.length + me.length;
    $("#pr-barra").hidden = !n;
    $("#pr-n").textContent = erro ? `${erro} campo(s) sem preço` : [m.length ? `${m.length} preço(s)` : "", me.length ? `${me.length} esgotar/reabrir` : ""].filter(Boolean).join(" · ") + " para salvar";
    $("#pr-salvar").disabled = !!erro;
  }
  $("#pr-tabela").addEventListener("click", (e) => {
    const btn = e.target.closest(".pr-esg");
    if (!btn || btn.disabled) return;
    const id = btn.dataset.esg;
    if (esgAtual.has(id)) esgAtual.delete(id); else esgAtual.add(id);
    pintarEsg(btn); barra();
  });

  $("#pr-tabela").addEventListener("input", (e) => {
    const inp = e.target.closest("input");
    if (!inp) return;
    const limpo = inp.value.replace(/\D/g, "").slice(0, 7);
    if (limpo !== inp.value) inp.value = limpo;
    conferir(inp); barra();
  });
  $("#pr-tabela").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("input")) { e.preventDefault(); const t = $$("#pr-tabela input:not(:disabled)"); const n = t[t.indexOf(e.target) + 1]; if (n) n.focus(); }
  });
  $("#pr-desfazer").addEventListener("click", () => { montar(); aviso("Voltou para os preços salvos."); });

  const dlg = $("#pr-conf");
  $("#pr-salvar").addEventListener("click", () => {
    const m = mudancas(), me = mudancasEsg();
    if (!m.length && !me.length) return;
    const nomeFase = (f) => { const x = D.fases.find((y) => y.id === f); return x ? rotuloDia(x).dia : f; };
    const nome = (id) => esc(ofertas.find((o) => o.id === id).nome);
    $("#pr-lista").innerHTML = me.map((x) => `<li class="${x.esgotar ? "li-esg" : ""}"><b>${nome(x.id)}</b>: ${x.esgotar ? "<b>ESGOTAR</b> (carimbo na página, compra bloqueada)" : "volta a vender"}</li>`).join("")
      + m.map((x) => `<li><b>${nome(x.id)}</b> · ${esc(nomeFase(x.f))}: ${x.de == null ? "sem preço" : brl(x.de)} → <b>${brl(x.para)}</b></li>`).join("");
    dlg.showModal();
  });
  dlg.addEventListener("close", async () => {
    if (dlg.returnValue !== "sim") return;
    // grava a tabela inteira (todas as ofertas, todos os dias), não só o que mudou
    const tudo = {};
    for (const i of ofertas) {
      tudo[i.id] = {};
      for (const f of D.fases) {
        const inp = $(`#pr-tabela input[data-id="${CSS.escape(i.id)}"][data-f="${CSS.escape(f.id)}"]`);
        const v = inp ? lerCampo(inp) : vale[i.id][f.id];
        if (v) tudo[i.id][f.id] = v;
      }
    }
    $("#pr-salvar").disabled = true;
    try {
      const r = await fetch(BASE + "/api/precos", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ precos: tudo, esgotados: [...esgAtual] }) });
      if (r.status === 401) { location.reload(); return; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.campos ? "valor inválido em " + j.campos.join(", ") : j.erro || "erro " + r.status);
      await carregar();
      aviso("Preços salvos. A página de ofertas já está usando.", "pago");
    } catch (e) {
      aviso("Não salvou: " + e.message, "erro");
      $("#pr-salvar").disabled = false;
    }
  });
  addEventListener("beforeunload", (e) => { if (D && (mudancas().length || mudancasEsg().length)) { e.preventDefault(); e.returnValue = ""; } });

  carregar().catch((e) => { $("#pr-tabela").innerHTML = `<p class="precos__carregando">Não consegui carregar: ${esc(e.message)}. Recarregue a página.</p>`; });
})();
