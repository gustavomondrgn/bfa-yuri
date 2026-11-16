# -*- coding: utf-8 -*-
"""
Pós-venda da Black Friday Apocalíptica: quem já recebeu o quê.

Puxa os pedidos do CRM da BFA (yuridosanjos.com.br/bfa-crm), cruza com o acompanhamento local
(pos-venda/dados/acompanhamento.yaml) e mostra, por pedido pago, o que falta mandar, o que está
esperando o cliente, o que está em produção e o que já foi entregue.

    python painel.py                      # puxa do CRM, imprime o resumo e gera dados/PAINEL.html
    python painel.py --offline            # usa a última cópia baixada (dados/pedidos.json)
    python painel.py marcar BFA-XXXX bussola agenda_enviada [--nota "..."] [--data 2026-11-20] [--para 2026-11-25 15h]

Acesso ao CRM, por variável de ambiente (nunca em arquivo versionado):
    CRM_CHAVE                         chave da API (a mesma do ofertas/.env), ou
    BFA_CRM_USUARIO + BFA_CRM_SENHA   o login do painel
    BFA_CRM_URL                       opcional; padrão https://yuridosanjos.com.br/bfa-crm
Se existir ofertas/.env com CRM_URL e CRM_CHAVE, ele é lido também.

O CRM é só LIDO. Marcar "entregue" no CRM continua sendo feito no próprio CRM.
Dados de cliente ficam em pos-venda/dados/, fora do git (o repositório é público).
"""
import argparse
import datetime as dt
import html
import http.cookiejar
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

import yaml

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
DADOS = AQUI / "dados"
ENTREGAS = json.loads((AQUI / "entregas.json").read_text(encoding="utf-8"))
ACOMP = DADOS / "acompanhamento.yaml"
CACHE = DADOS / "pedidos.json"
PAINEL = DADOS / "PAINEL.html"
FUSO = dt.timezone(dt.timedelta(hours=-3))
HOJE = dt.datetime.now(FUSO).date()

PRODUTOS = ENTREGAS["produtos"]
LINKS = ENTREGAS["links"]
ROTULOS = ENTREGAS["rotulos"]

# etapas em que a bola está com o cliente (cobrar depois de 2 dias)
ESPERANDO = {"agenda_enviada", "form_enviado", "dados_pedidos", "email_pedido"}
# etapas em que a bola está com o Yuri, com prazo correndo
PRODUCAO = {"form_preenchido", "dados_recebidos"}
COBRAR_APOS_DIAS = 2


# ------------------------------------------------------------------ acesso --
def ler_env_ofertas():
    env = {}
    f = RAIZ / "ofertas" / ".env"
    if f.exists():
        for ln in f.read_text(encoding="utf-8").splitlines():
            m = re.match(r"\s*([A-Z_]+)\s*=\s*(.*)\s*$", ln)
            if m:
                env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return env


def baixar_pedidos():
    envf = ler_env_ofertas()
    base = (os.environ.get("BFA_CRM_URL") or envf.get("CRM_URL") or "https://yuridosanjos.com.br/bfa-crm").rstrip("/")
    chave = os.environ.get("CRM_CHAVE") or envf.get("CRM_CHAVE")
    usuario, senha = os.environ.get("BFA_CRM_USUARIO"), os.environ.get("BFA_CRM_SENHA")
    jar = http.cookiejar.CookieJar()
    abrir = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    cab = {"User-Agent": "pos-venda-bfa"}
    if chave:
        cab["x-chave"] = chave
    elif usuario and senha:
        corpo = urllib.parse.urlencode({"usuario": usuario, "senha": senha}).encode()
        abrir.open(urllib.request.Request(base + "/entrar", data=corpo, headers=cab), timeout=30).read()
        if not any(c.name == "crm" for c in jar):
            sys.exit("O CRM recusou o login (usuário ou senha errados, ou muitas tentativas).")
    else:
        sys.exit("Falta acesso ao CRM: defina CRM_CHAVE, ou BFA_CRM_USUARIO e BFA_CRM_SENHA.")
    r = abrir.open(urllib.request.Request(base + "/api/pedidos", headers=cab), timeout=30)
    pedidos = json.loads(r.read().decode("utf-8"))["pedidos"]
    DADOS.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps(pedidos, ensure_ascii=False, indent=1), encoding="utf-8")
    return pedidos


# ----------------------------------------------------------- acompanhamento --
def ler_acomp():
    if ACOMP.exists():
        return yaml.safe_load(ACOMP.read_text(encoding="utf-8")) or {}
    return {}


def gravar_acomp(a):
    DADOS.mkdir(exist_ok=True)
    cab = (
        "# Acompanhamento do pós-venda da BFA. Gerado e editado por painel.py (comando 'marcar').\n"
        "# Chave: código do pedido > id do produto. Campos: etapa, em (AAAA-MM-DD), para (data da consulta), nota.\n"
        "# DADO DE CLIENTE: esta pasta não entra no git.\n"
    )
    tmp = ACOMP.with_suffix(".tmp")
    tmp.write_text(cab + yaml.safe_dump(a, allow_unicode=True, sort_keys=True), encoding="utf-8")
    tmp.replace(ACOMP)


def sem_acento(s):
    return "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn").lower()


def id_do_item(item):
    """Itens criados pelo pedido.mjs têm id; os lançados à mão no CRM só têm nome."""
    if item.get("id") in PRODUTOS:
        return item["id"]
    n = sem_acento(item.get("nome", ""))
    for pid, p in PRODUTOS.items():
        if sem_acento(p["nome"]).split(" (")[0] in n or pid.replace("-", " ") in n:
            return pid
    return None


# ------------------------------------------------------------------ análise --
def primeiro_nome(nome):
    return (nome or "").strip().split(" ")[0].capitalize() or "tudo bem"


def data(s):
    try:
        return dt.date.fromisoformat(str(s)[:10])
    except Exception:
        return None


def analisar(pedidos, acomp):
    """Devolve, por pedido pago, a lista de itens com etapa, situação e o que fazer."""
    saida = []
    for p in pedidos:
        if p["status"] not in ("pago", "producao", "entregue"):  # CRM: aguardando → pago → producao → entregue
            continue
        reg = acomp.get(p["codigo"], {}) or {}
        itens = []
        for k, it in enumerate(p.get("itens", [])):
            pid = id_do_item(it)
            chave = pid or f"item{k}"
            r = reg.get(chave, {}) or {}
            prod = PRODUTOS.get(pid, {})
            etapas = prod.get("etapas", ["entregue"])
            etapa = r.get("etapa", "pendente")
            if it.get("entregue") or p["status"] == "entregue":
                etapa = "entregue"
            em = data(r.get("em"))
            dias = (HOJE - em).days if em else None
            if etapa == "entregue":
                sit = "entregue"
            elif etapa == "pendente":
                sit = "mandar"
            elif etapa in ESPERANDO:
                sit = "cobrar" if dias is not None and dias >= COBRAR_APOS_DIAS else "esperando"
            elif etapa in PRODUCAO:
                sit = "producao"
            elif etapa == "agendado":
                sit = "agendado"
            elif etapa == "horaria_guardada":
                sit = "guardado"  # o cliente manda a pergunta quando precisar; não se cobra
            else:
                sit = "seguir"
            prazo_fim = None
            if etapa in PRODUCAO and em and prod.get("prazo_dias"):
                prazo_fim = em + dt.timedelta(days=prod["prazo_dias"])
            prox = None
            if etapa in etapas and etapas.index(etapa) + 1 < len(etapas):
                prox = etapas[etapas.index(etapa) + 1]
            elif etapa == "pendente":
                prox = etapas[0]
            itens.append({
                "chave": chave, "pid": pid, "nome": it.get("nome") or prod.get("nome", "?"), "qtd": it.get("qtd", 1),
                "prod": prod, "etapa": etapa, "em": em, "dias": dias, "sit": sit, "prazo_fim": prazo_fim,
                "para": r.get("para"), "nota": r.get("nota"), "prox": prox, "crm_entregue": bool(it.get("entregue")),
            })
        tudo = bool(itens) and all(i["etapa"] == "entregue" for i in itens)
        saida.append({"p": p, "itens": itens, "tudo_entregue": tudo})
    return saida


# ---------------------------------------------------------------- mensagem --
CHAMADA = {
    "bussola": "a Bússola", "revolucao-solar": "a Revolução Solar", "caixa-pandora": "a Caixa de Pandora",
    "consulta-natal": "a Consulta Natal", "compre-tempo": "o Compre Tempo", "sinastria": "a Sinastria",
    "natal-escrita": "a Natal Escrita", "temperamento": "o seu temperamento", "formula-felicidade": "a Fórmula da Felicidade",
}


def juntar(lista):
    return lista[0] if len(lista) == 1 else ", ".join(lista[:-1]) + " e " + lista[-1]


def mensagem_inicial(p, itens):
    """Uma mensagem por pedido, cobrindo todos os itens que ainda não começaram."""
    nome = primeiro_nome(p.get("nome"))
    blocos, form, agenda, dados_nasc, perguntas, curso = [], [], [], [], [], []
    # Potencial + Fórmula no mesmo pedido: a Fórmula é feita junto, pelo formulário do Potencial (Yuri, 16/11/2026)
    novos = {i["pid"] for i in itens}
    combo_formula = {"potencial-riqueza", "formula-felicidade"} <= novos
    for i in itens:
        pid, prod = i["pid"], i["prod"]
        canal = prod.get("canal", "")
        if combo_formula and pid == "formula-felicidade":
            continue
        if "formulario" in canal:
            form.append(f"{prod['nome']}: {LINKS.get(pid, '<link>')}")
        if canal in ("agenda",) or canal.endswith("agenda"):
            if pid == "mentoria":
                perguntas.append("Mentoria: me conta quais dias e horários da semana funcionam melhor para os nossos encontros")
            elif "formulario" not in canal:
                agenda.append(CHAMADA.get(pid, prod["nome"]))
        if canal == "whatsapp":
            if pid == "horaria":
                q = i["qtd"]
                perguntas.append("A sua Horária fica guardada com você: não precisa fazer a pergunta agora. Quando surgir a questão, "
                                 "é só me mandar aqui do jeito que ela estiver na sua cabeça, que em 24 a 48 horas eu te respondo em áudio"
                                 if q == 1 else
                                 f"As suas {q} Horárias ficam guardadas com você: não precisa fazer as perguntas agora. Quando surgir uma questão, "
                                 "é só me mandar aqui, uma de cada vez ou todas juntas, que em 24 a 48 horas eu te respondo em áudio")
            elif pid == "natal-escrita":
                dados_nasc.append(CHAMADA[pid])
                perguntas.append("Natal Escrita: me manda também as perguntas que você quer ver respondidas")
            else:
                dados_nasc.append(CHAMADA.get(pid, prod["nome"]))
        if canal == "curso":
            curso.append(prod["nome"])
    blocos.append(f"Oi, {nome}, tudo bem? Recebi aqui a confirmação do seu pagamento. Muito obrigado pela confiança.")
    if form:
        com_prazo = any(i["prod"].get("prazo_dias") and "formulario" in i["prod"].get("canal", "") for i in itens)
        if len(form) == 1:
            blocos.append("Para eu começar, preciso que você preencha o formulário:\n" + form[0]
                          + ("\nO prazo começa a contar quando ele chegar aqui." if com_prazo else ""))
        else:
            blocos.append("Para eu começar, preciso que você preencha os formulários (um para cada leitura):\n" + "\n".join(form)
                          + ("\nO prazo de cada leitura começa a contar quando o formulário dela chegar aqui." if com_prazo else ""))
    if combo_formula:
        blocos.append("Como você comprou também a Fórmula da Felicidade, deixa um lembrete disso em qualquer campo do "
                      "formulário do Potencial. Eu faço as duas leituras juntas.")
    if agenda:
        blocos.append(f"Para {juntar(agenda)}, escolhe o melhor horário aqui: {LINKS.get('agenda')}\n"
                      "Se não achar horário que funcione, me fala que nós encaixamos.")
    if dados_nasc:
        blocos.append(f"Para {juntar(dados_nasc)}, me manda aqui: data de nascimento, hora (a mais exata que tiver) e a cidade onde você nasceu.")
    if perguntas:
        blocos.append("\n".join(perguntas) + ".")
    if curso:
        blocos.append(f"Para liberar {'o ' + curso[0] if len(curso) == 1 else 'os pacotes de cursos'}, me manda o e-mail em que você quer receber o acesso.")
    return "\n\n".join(blocos)


def wa(tel, texto):
    return f"https://wa.me/{re.sub(r'[^0-9]', '', tel or '')}?text={urllib.parse.quote(texto)}"


# ------------------------------------------------------------------- saída --
def fmt(d):
    return d.strftime("%d/%m") if d else "?"


OPORT = DADOS / "oportunidades.yaml"


def resumo_oportunidades():
    """Leads da BFA que ainda não compraram (dados/oportunidades.yaml), pelo próximo toque."""
    if not OPORT.exists():
        return []
    ops = yaml.safe_load(OPORT.read_text(encoding="utf-8")) or {}
    abertas = [(k, o) for k, o in ops.items() if isinstance(o, dict) and not o.get("fechada")]
    if not abertas:
        return []
    agora = dt.datetime.now(FUSO).strftime("%Y-%m-%d %H:%M")
    abertas.sort(key=lambda ko: str(ko[1].get("proximo_toque") or "9999"))
    out = ["💬 OPORTUNIDADES (ainda não compraram)"]
    for k, o in abertas:
        pt = str(o.get("proximo_toque") or "sem data")
        marca = "⏰ " if pt != "sem data" and pt <= agora else "   "
        out.append(f"{marca}{pt}  {o.get('nome', k)} · {o.get('interesse', '')[:70]} · toques: {o.get('toques', 0)}")
    out.append("")
    return out


def resumo_texto(an, pedidos):
    ag = sum(1 for p in pedidos if p["status"] == "aguardando")
    linhas = [f"Pós-venda BFA, {HOJE.strftime('%d/%m/%Y')}: {len(an)} pedidos pagos · {ag} aguardando pagamento (não entram aqui)\n"]
    grupos = [("mandar", "🔴 MANDAR AGORA (nada enviado ainda)"), ("cobrar", f"⏰ COBRAR RETORNO (enviado há {COBRAR_APOS_DIAS}+ dias, sem resposta)"),
              ("producao", "🛠  EM PRODUÇÃO (prazo correndo)"), ("agendado", "📅 CONSULTAS MARCADAS"),
              ("seguir", "➡️  SEGUIR PARA A PRÓXIMA ETAPA"), ("esperando", "⏳ ESPERANDO O CLIENTE (enviado há pouco)"),
              ("guardado", "🗂  HORÁRIAS GUARDADAS (o cliente manda quando precisar; não cobrar)")]
    for sit, titulo in grupos:
        bloco = []
        for x in an:
            for i in x["itens"]:
                if i["sit"] != sit:
                    continue
                p = x["p"]
                extra = ""
                if sit == "producao" and i["prazo_fim"]:
                    falta = (i["prazo_fim"] - HOJE).days
                    extra = f" · entregar até {fmt(i['prazo_fim'])}" + (" · ATRASADO" if falta < 0 else f" ({falta} d)")
                elif sit in ("cobrar", "esperando"):
                    extra = f" · {ROTULOS.get(i['etapa'], i['etapa'])} em {fmt(i['em'])}"
                elif sit == "agendado":
                    extra = f" · {i['para'] or 'data não anotada'}"
                elif sit == "seguir":
                    extra = f" · agora: {ROTULOS.get(i['etapa'], i['etapa'])} → próximo: {ROTULOS.get(i['prox'], i['prox'])}"
                elif sit == "mandar":
                    extra = f" · {i['prod'].get('canal', 'sem mapa de entrega!')}"
                bloco.append(f"  {p['codigo']}  {p.get('nome') or 'sem nome':<28} {i['qtd']}× {i['nome']}{extra}")
        if bloco:
            linhas.append(titulo)
            linhas += bloco
            linhas.append("")
    crm = [x["p"]["codigo"] + " " + (x["p"].get("nome") or "") for x in an if x["tudo_entregue"] and x["p"]["status"] != "entregue"]
    if crm:
        linhas.append("✅ TUDO ENTREGUE, MAS O CRM AINDA DIZ 'PAGO' → marcar entregue no CRM:")
        linhas += ["  " + c for c in crm]
        linhas.append("")
    linhas += resumo_oportunidades()
    sem_mapa = sorted({i["nome"] for x in an for i in x["itens"] if not i["pid"]})
    if sem_mapa:
        linhas.append("⚠️  Itens que não reconheci (sem mapa de entrega): " + "; ".join(sem_mapa))
    entregues = sum(1 for x in an for i in x["itens"] if i["sit"] == "entregue")
    total = sum(len(x["itens"]) for x in an)
    linhas.append(f"Itens entregues: {entregues} de {total}.")
    return "\n".join(linhas)


CSS = """:root{--f:#faf8f4;--c:#fff;--l:#e3ddd3;--t:#1d1915;--t2:#5d554c;--a:#b4471f;--ok:#1f7a45;--warn:#a86a00}
@media (prefers-color-scheme:dark){:root{--f:#0f0d0b;--c:#1a1612;--l:#352c23;--t:#f3eee6;--t2:#b5aa9c;--a:#ff8a3d;--ok:#5fd18e;--warn:#ffc35c}}
*{box-sizing:border-box}body{margin:0;background:var(--f);color:var(--t);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px}
main{max-width:1000px;margin:0 auto}h1{font-size:1.4rem;margin:.2rem 0}h2{font-size:1.05rem;margin:1.6rem 0 .6rem;color:var(--a)}
.sub{color:var(--t2);margin:0 0 1rem}.card{background:var(--c);border:1px solid var(--l);border-radius:12px;padding:12px 14px;margin:.5rem 0}
.cab{display:flex;justify-content:space-between;gap:.5rem;flex-wrap:wrap}.cod{font:600 .8rem ui-monospace,Consolas,monospace;color:var(--t2)}
ul{margin:.4rem 0 0;padding-left:1.1rem}li{margin:.15rem 0}.et{color:var(--t2);font-size:.88rem}.atr{color:#d23;font-weight:700}
pre{white-space:pre-wrap;background:var(--f);border:1px solid var(--l);border-radius:8px;padding:10px;font:14px/1.45 system-ui,sans-serif;margin:.5rem 0}
a.b,button{display:inline-block;border:0;border-radius:8px;padding:.45rem .8rem;font:600 .9rem system-ui;cursor:pointer;text-decoration:none;margin-right:.4rem}
a.b{background:#25D366;color:#062b14}button{background:var(--l);color:var(--t)}.ok{color:var(--ok)}.nota{color:var(--warn);font-size:.88rem}"""


def gerar_html(an, pedidos):
    e = html.escape
    partes = [f"<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
              f"<title>Pós-venda BFA</title><style>{CSS}</style></head><body><main><h1>Pós-venda · Black Friday Apocalíptica</h1>"
              f"<p class='sub'>Gerado em {dt.datetime.now(FUSO).strftime('%d/%m/%Y %H:%M')} · {len(an)} pedidos pagos · "
              f"{sum(1 for p in pedidos if p['status']=='aguardando')} aguardando pagamento</p>"]

    def card(x, com_msg=False):
        p = x["p"]
        lis = []
        for i in x["itens"]:
            et = ROTULOS.get(i["etapa"], i["etapa"])
            info = f" · desde {fmt(i['em'])}" if i["em"] else ""
            if i["prazo_fim"]:
                atrasado = i["prazo_fim"] < HOJE
                info += f" · <span class='{'atr' if atrasado else ''}'>entregar até {fmt(i['prazo_fim'])}</span>"
            if i["para"]:
                info += f" · consulta {e(str(i['para']))}"
            if i["prox"] and i["etapa"] != "entregue":
                info += f" · próximo: {e(ROTULOS.get(i['prox'], i['prox']))}"
            nota = f"<br><span class='nota'>{e(str(i['nota']))}</span>" if i["nota"] else ""
            pn = i["prod"].get("nota")
            nota += f"<br><span class='et'>{e(pn)}</span>" if pn and i["etapa"] == "pendente" else ""
            ok = "✅ " if i["etapa"] == "entregue" else ""
            lis.append(f"<li>{ok}{i['qtd']}× <b>{e(i['nome'])}</b> <span class='et'>· {e(et)}{info}</span>{nota}</li>")
        msg = ""
        if com_msg:
            novos = [i for i in x["itens"] if i["sit"] == "mandar" and i["pid"]]
            if novos:
                t = mensagem_inicial(p, novos)
                msg = (f"<pre>{e(t)}</pre><a class='b' target='_blank' rel='noopener' href='{e(wa(p.get('tel'), t))}'>Abrir no WhatsApp com a mensagem</a>"
                       f"<button onclick='navigator.clipboard.writeText(this.previousElementSibling.previousElementSibling.textContent);this.textContent=\"Copiado\"'>Copiar</button>")
        return (f"<div class='card'><div class='cab'><b>{e(p.get('nome') or 'Sem nome')}</b><span class='cod'>{e(p['codigo'])} · {e(p.get('tel',''))} · "
                f"pago {fmt(data(p.get('pagoEm')))}</span></div><ul>{''.join(lis)}</ul>{msg}</div>")

    secoes = [
        ("mandar", "Mandar agora · nada enviado ainda", True),
        ("cobrar", f"Cobrar retorno · enviado há {COBRAR_APOS_DIAS} dias ou mais, sem resposta", False),
        ("producao", "Em produção · prazo correndo", False),
        ("agendado", "Consultas marcadas", False),
        ("seguir", "Seguir para a próxima etapa", False),
        ("esperando", "Esperando o cliente · enviado há pouco", False),
        ("guardado", "Horárias guardadas · o cliente manda a pergunta quando precisar, não cobrar", False),
    ]
    for sit, titulo, msg in secoes:
        sel = [x for x in an if any(i["sit"] == sit for i in x["itens"])]
        if sel:
            partes.append(f"<h2>{e(titulo)} ({len(sel)})</h2>" + "".join(card(x, msg) for x in sel))
    crm = [x for x in an if x["tudo_entregue"] and x["p"]["status"] != "entregue"]
    if crm:
        partes.append("<h2>Tudo entregue, falta marcar no CRM</h2>" + "".join(card(x) for x in crm))
    fim = [x for x in an if x["tudo_entregue"]]
    if fim:
        partes.append(f"<h2 class='ok'>Entregues ({len(fim)})</h2>" + "".join(card(x) for x in fim))
    partes.append("</main></body></html>")
    PAINEL.write_text("".join(partes), encoding="utf-8")


# -------------------------------------------------------------------- main --
def marcar(a):
    acomp = ler_acomp()
    cod = a.codigo.upper()
    if not cod.startswith("BFA-"):
        cod = "BFA-" + cod
    pid = a.produto
    etapa = a.etapa
    validas = set(ROTULOS)
    if etapa not in validas:
        sys.exit(f"Etapa desconhecida: {etapa}. Válidas: {', '.join(sorted(validas))}")
    if pid in PRODUTOS and etapa not in PRODUTOS[pid]["etapas"] + ["pendente"]:
        sys.exit(f"{pid} não tem a etapa {etapa}. Etapas dele: {', '.join(PRODUTOS[pid]['etapas'])}")
    r = acomp.setdefault(cod, {}).setdefault(pid, {})
    r["etapa"] = etapa
    r["em"] = a.data or HOJE.isoformat()
    if a.para:
        r["para"] = a.para
    if a.nota:
        r["nota"] = a.nota
    gravar_acomp(acomp)
    print(f"{cod} · {pid} → {ROTULOS[etapa]} ({r['em']})")


def main():
    ap = argparse.ArgumentParser(description="Pós-venda da BFA")
    sub = ap.add_subparsers(dest="cmd")
    m = sub.add_parser("marcar", help="anota a etapa de um item")
    m.add_argument("codigo")
    m.add_argument("produto", help="id do produto (ver entregas.json)")
    m.add_argument("etapa")
    m.add_argument("--nota")
    m.add_argument("--data", help="AAAA-MM-DD (padrão: hoje)")
    m.add_argument("--para", help="data/hora da consulta marcada, ex.: '2026-11-25 15h'")
    ms = sub.add_parser("mensagem", help="mensagem pronta de um pedido, mesmo que o CRM ainda não o mostre como pago")
    ms.add_argument("codigo")
    ap.add_argument("--offline", action="store_true", help="não baixa; usa dados/pedidos.json")
    a = ap.parse_args()
    if a.cmd == "mensagem":
        pedidos = json.loads(CACHE.read_text(encoding="utf-8")) if a.offline and CACHE.exists() else baixar_pedidos()
        cod = a.codigo.upper() if a.codigo.upper().startswith("BFA-") else "BFA-" + a.codigo.upper()
        p = next((x for x in pedidos if x["codigo"] == cod), None)
        if not p:
            sys.exit(f"{cod} não está no CRM. Confira o código no print.")
        x = analisar([{**p, "status": "pago"}], ler_acomp())[0]
        novos = [i for i in x["itens"] if i["sit"] == "mandar" and i["pid"]]
        print(f"{cod} · {p.get('nome')} · {p.get('tel')} · status no CRM: {p['status']} · R$ {p.get('total')}")
        print("Itens: " + "; ".join(f"{i['qtd']}× {i['nome']} ({ROTULOS.get(i['etapa'], i['etapa'])})" for i in x["itens"]))
        if p["status"] == "aguardando":
            print("⚠️  O CRM ainda mostra AGUARDANDO: se o comprovante chegou, marque 'pago' no CRM.")
        print("\n" + (mensagem_inicial(p, novos) if novos else "Nada novo a mandar: todos os itens já começaram."))
        return
    if a.cmd == "marcar":
        marcar(a)
        if not a.offline and not CACHE.exists():
            return
    if a.offline or a.cmd == "marcar":
        if not CACHE.exists():
            sys.exit("Ainda não há cópia dos pedidos. Rode sem --offline.")
        pedidos = json.loads(CACHE.read_text(encoding="utf-8"))
    else:
        pedidos = baixar_pedidos()
    an = analisar(pedidos, ler_acomp())
    gerar_html(an, pedidos)
    print(resumo_texto(an, pedidos))
    print(f"\nPainel: {PAINEL}")


if __name__ == "__main__":
    for fluxo in (sys.stdout, sys.stderr):
        if hasattr(fluxo, "reconfigure"):
            fluxo.reconfigure(encoding="utf-8")
    main()
