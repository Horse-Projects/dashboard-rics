"use strict";
const CONFIG = {
  colunaRequisicao: "Requisição de compra",
  colunaValor: "Valor RC",
  diasParaAtencao: 30, // DIAS_PARA_ATENCAO: pendente há mais dias que isto vira "Em atenção"
  locale: "pt-BR",
  moedaPadrao: "BRL"
};

// ---------- Mapeamento de colunas (chave interna -> [nome oficial, variações]) ----------
const CAMPOS = {
  perc: ["Perc"], status: ["Status"], req: [CONFIG.colunaRequisicao, "Requisicao compra"],
  itemReq: ["Item ReqC"], material: ["Material"], texto: ["Texto breve material"],
  qtd: ["Qtd.solicitada"], precoLiq: ["Preço líq.pedido"], valor: [CONFIG.colunaValor],
  dtSol: ["Data da solicitação"], ordem: ["Ordem"], cc: ["Centro custo"], conta: ["Cont.Contábil"],
  criado: ["Criado por"], moeda: ["Moeda"], um: ["UM pedido"],
  a1: ["Data Aprov 1 RC"], a2: ["Data Aprov 2 RC"], a3: ["Data Aprov 3 RC"], a4: ["Data Aprov 4 RC"],
  pedido: ["Pedido"], itemPed: ["Item"], grupo: ["Grupo de compradores"], fornecedor: ["Fornecedor"],
  nome: ["Nome"], dtPedido: ["Data Pedido"], migo: ["Registro MIGO"], dtMigo: ["Data MIGO"],
  ref: ["Referência"], dtComp: ["Data de compensação"], dtPlan: ["Data de planejamento"],
  pep: ["Elemento PEP"], requisitante: ["Requisitante"]
};
const DATAS = ["dtSol", "a1", "a2", "a3", "a4", "dtPedido", "dtMigo", "dtComp", "dtPlan"];
const SITUACOES = { pendente: "Pendente", aprovacao: "Em aprovação", pedido: "Com pedido", migo: "Com MIGO", compensada: "Compensada", atencao: "Em atenção" };
const PRIORIDADE = ["atencao", "aprovacao", "pendente", "pedido", "migo", "compensada"]; // situação da RIC = a menos avançada
const FILTROS = [
  ["req", "Requisição", "text"], ["status", "Status", "select"], ["cc", "Centro de custo", "select"],
  ["criado", "Criado por", "select"], ["requisitante", "Requisitante", "select"], ["grupo", "Grupo de compradores", "select"],
  ["pedido", "Pedido", "text"], ["fornecedor", "Fornecedor", "text"], ["nome", "Nome do fornecedor", "text"],
  ["material", "Material", "text"], ["texto", "Texto breve material", "text"], ["ordem", "Ordem", "text"],
  ["pep", "Elemento PEP", "text"], ["moeda", "Moeda", "select"], ["sit", "Situação calculada", "select"]
];
const COLUNAS = [["req", "Requisição"], ["itemReq", "Item"], ["material", "Material"], ["texto", "Descrição"], ["valor", "Valor RC"],
  ["dtSol", "Solicitação"], ["sitTxt", "Situação"], ["pedido", "Pedido"], ["nome", "Fornecedor"], ["requisitante", "Requisitante"]];

const $ = id => document.getElementById(id);
const state = { wb: null, rows: [], filtrados: [], faltando: [], ord: { k: "req", d: 1 }, pag: 0, charts: {}, temValor: false };

// ---------- Utilitários ----------
const norm = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const chave = s => norm(s).replace(/ /g, "");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const vazio = v => v === null || v === undefined || String(v).trim() === "";

// Converte valores monetários em número. Inválido/vazio/hífen => 0. Nunca retorna NaN/Infinity.
function parseMoney(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v ?? "").replace(/R\$|\s|\u00a0/g, "");
  if (s === "" || /^[-–—]+$/.test(s)) return 0;
  let neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[()\-]/g, "");
  if (!/^[\d.,]+$/.test(s)) return 0;
  const ponto = s.lastIndexOf("."), virg = s.lastIndexOf(",");
  if (ponto >= 0 && virg >= 0) {
    const dec = ponto > virg ? "." : ",";
    s = dec === "," ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (virg >= 0) s = s.replace(/\./g, "").replace(",", ".");
  else if (ponto >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // 1.234 => milhar
  const n = parseFloat(s);
  return isFinite(n) ? (neg ? -n : n) : 0;
}
function valorValido(v) { // distingue "zero real" de "inválido" para a regra de atenção
  if (typeof v === "number") return isFinite(v);
  return /\d/.test(String(v ?? "")) && /^[\sR$\d.,()\-]+$/.test(String(v));
}
// Retorna Date (UTC), null (vazio) ou false (inválida)
function parseDate(v) {
  if (vazio(v)) return null;
  if (v instanceof Date) return isNaN(v) ? false : new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  if (typeof v === "number") return v > 20000 && v < 80000 ? new Date(Math.round((v - 25569) * 864e5)) : false;
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/), d, mo, y;
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
  else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCDate() === d && dt.getUTCMonth() === mo - 1 && y > 1990 ? dt : false;
}
const fmtData = d => d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "";
const fmtMoeda = (n, cod) => { try { return new Intl.NumberFormat(CONFIG.locale, { style: "currency", currency: cod || CONFIG.moedaPadrao }).format(n); } catch { return n.toFixed(2); } };
const dias = (a, b) => (a && b) ? (b - a) / 864e5 : null;

// ---------- Leitura da planilha ----------
function lerSheet(ws) {
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
  const aliases = {};
  Object.entries(CAMPOS).forEach(([k, nomes]) => nomes.forEach(n => aliases[chave(n)] = k));
  let melhor = { idx: 0, score: -1 };
  aoa.slice(0, 15).forEach((linha, i) => {
    const score = linha.filter(c => aliases[chave(c)]).length;
    if (score > melhor.score) melhor = { idx: i, score };
  });
  const cab = (aoa[melhor.idx] || []).map(c => String(c ?? "").replace(/\s+/g, " ").trim());
  const colPorCampo = {};
  cab.forEach((c, i) => { const k = aliases[chave(c)]; if (k && !(k in colPorCampo)) colPorCampo[k] = i; });
  return { aoa: aoa.slice(melhor.idx + 1), cab, colPorCampo, score: melhor.score };
}
function pontuar(ws) { try { return lerSheet(ws).score; } catch { return -1; } }

function processarAba(nome) {
  $("loading").hidden = false;
  setTimeout(() => {
    try {
      const { aoa, cab, colPorCampo } = lerSheet(state.wb.Sheets[nome]);
      state.faltando = Object.keys(CAMPOS).filter(k => !(k in colPorCampo) && ["req", "valor"].includes(k)).map(k => CAMPOS[k][0]);
      state.temValor = "valor" in colPorCampo;
      const linhas = []; let vazias = 0, semReq = 0;
      aoa.forEach(l => {
        if (l.every(vazio)) { vazias++; return; }
        const get = k => (k in colPorCampo ? l[colPorCampo[k]] : "");
        const req = String(get("req") ?? "").trim();
        if (!req) { semReq++; return; }
        linhas.push(montarLinha(get, req, l, cab));
      });
      mostrarValidacao(nome, cab, linhas.length, vazias, semReq);
      if (!("req" in colPorCampo)) { state.rows = []; erro("Coluna \"" + CONFIG.colunaRequisicao + "\" não encontrada. Cálculo interrompido."); }
      else { state.rows = linhas; if (!state.temValor) erro("Coluna \"" + CONFIG.colunaValor + "\" não encontrada. O cálculo financeiro foi interrompido (\"Preço líq.pedido\" NÃO é usado como substituto)."); else $("msg").hidden = true; }
      montarFiltros(); aplicar();
    } catch (e) { console.error(e); erro("Erro ao processar a aba: " + e.message); }
    $("loading").hidden = true;
  }, 20);
}

function montarLinha(get, req, linhaBruta, cab) {
  const r = { req, raw: {}, datasInvalidas: [] };
  cab.forEach((c, i) => { if (c) r.raw[c] = linhaBruta[i]; });
  Object.keys(CAMPOS).forEach(k => { r[k] = DATAS.includes(k) ? null : String(get(k) ?? "").trim(); });
  DATAS.forEach(k => {
    const d = parseDate(get(k));
    if (d === false) r.datasInvalidas.push(CAMPOS[k][0]); else r[k] = d;
  });
  const bruto = get("valor");
  r.valor = parseMoney(bruto); r.valorOk = valorValido(bruto);
  r.moeda = (r.moeda || CONFIG.moedaPadrao).toUpperCase();
  classificar(r);
  return r;
}

// ---------- Classificação (regras de status: altere aqui) ----------
function classificar(r) {
  const temComp = !!r.dtComp, temMigo = !!(r.migo || r.dtMigo), temPed = !!r.pedido;
  // Etapa pelas regras auxiliares (datas/registros)
  let regra;
  if (temComp) regra = "compensada";
  else if (temMigo) regra = "migo";
  else if (temPed) regra = "pedido";
  else {
    // Sem nenhuma data de aprovação => em aprovação. Se ao menos um nível foi aprovado, o 4º vazio NÃO torna pendente.
    const aprovados = [r.a1, r.a2, r.a3, r.a4].filter(Boolean).length;
    regra = aprovados === 0 ? "aprovacao" : "pendente";
  }
  // Etapa pela coluna Status (prioritária, quando reconhecida)
  const st = norm(r.status); let porStatus = null;
  if (/compens|pag/.test(st)) porStatus = "compensada";
  else if (/migo|receb/.test(st)) porStatus = "migo";
  else if (/pedido/.test(st)) porStatus = "pedido";
  else if (/aprov/.test(st)) porStatus = "aprovacao";
  else if (/pend/.test(st)) porStatus = "pendente";
  let sit = porStatus || regra;

  const m = [];
  if (temComp && !temPed) m.push("Data de compensação preenchida sem pedido");
  if (temMigo && !temPed) m.push("MIGO preenchido sem pedido");
  if (temPed && !r.dtPedido) m.push("Pedido preenchido sem Data Pedido");
  if (!state.temValor || !r.valorOk) m.push("Valor RC vazio ou inválido");
  else if (r.valor <= 0) m.push("Valor RC negativo ou igual a zero");
  if (porStatus && ["compensada", "migo", "pedido"].includes(regra) && porStatus !== regra) m.push(`Status "${r.status}" incompatível com os registros (${SITUACOES[regra]})`);
  if (r.datasInvalidas.length) m.push("Data inválida: " + r.datasInvalidas.join(", "));
  if (["pendente", "aprovacao"].includes(sit) && r.dtSol) {
    const idade = dias(r.dtSol, new Date());
    if (idade > CONFIG.diasParaAtencao) m.push(`Parada há ${Math.floor(idade)} dias (limite ${CONFIG.diasParaAtencao})`);
  }
  r.sitBase = sit; r.motivos = m;
  r.sit = m.length ? "atencao" : sit; r.sitTxt = SITUACOES[r.sit];
}

// ---------- Validação ----------
function mostrarValidacao(aba, cab, validas, vazias, semReq) {
  const el = $("validacao"); el.hidden = false;
  el.innerHTML = `<b>Aba:</b> ${esc(aba)} · <b>Linhas válidas:</b> ${validas} · <b>Inválidas (sem requisição):</b> ${semReq} · <b>Vazias ignoradas:</b> ${vazias}
    ${state.faltando.length ? `<p style="color:#ff7b7b">Colunas obrigatórias não encontradas: ${state.faltando.map(esc).join(", ")}</p>` : ""}
    <details><summary>Cabeçalhos identificados (${cab.filter(Boolean).length})</summary>${cab.filter(Boolean).map(esc).join(" | ")}</details>`;
}
function erro(t) { const m = $("msg"); m.textContent = t; m.className = "msg erro"; m.hidden = false; }

// ---------- Filtros ----------
function montarFiltros() {
  const box = $("filtrosSelect"); box.innerHTML = "";
  FILTROS.forEach(([k, label, tipo]) => {
    const w = document.createElement("label"); w.className = "small"; w.textContent = label;
    let c;
    if (tipo === "text") { c = document.createElement("input"); c.addEventListener("input", aplicar); }
    else {
      c = document.createElement("select"); c.addEventListener("change", aplicar);
      const vals = [...new Set(state.rows.map(r => k === "sit" ? r.sitTxt : r[k]).filter(Boolean))].sort();
      c.innerHTML = `<option value="">Todos</option>` + vals.map(v => `<option>${esc(v)}</option>`).join("");
    }
    c.dataset.f = k; w.appendChild(c); box.appendChild(w);
  });
}
function filtrar() {
  const f = {}; document.querySelectorAll("[data-f]").forEach(c => { if (c.value) f[c.dataset.f] = c.value.toLowerCase(); });
  const q = norm($("busca").value), ini = parseDate($("dtIni").value), fim = parseDate($("dtFim").value);
  return state.rows.filter(r => {
    for (const k in f) {
      const v = String(k === "sit" ? r.sitTxt : r[k]).toLowerCase();
      const select = FILTROS.find(x => x[0] === k)[2] === "select";
      if (select ? v !== f[k] : !v.includes(f[k])) return false;
    }
    if (ini && (!r.dtSol || r.dtSol < ini)) return false;
    if (fim && (!r.dtSol || r.dtSol > fim)) return false;
    if (q && !norm(Object.values(r.raw).join(" ") + " " + r.sitTxt).includes(q)) return false;
    return true;
  });
}

// ---------- Valores (Valor RC) ----------
// "todos": soma Valor RC de todas as linhas. "unico": considera 1 Valor RC (o primeiro não zero) por Requisição.
function valoresEfetivos(rows) {
  const metodo = $("metodo").value, vistos = new Set();
  return rows.map(r => {
    if (!state.temValor) return { r, v: 0 };
    if (metodo === "todos") return { r, v: r.valor };
    if (vistos.has(r.req) || r.valor === 0) return { r, v: 0 };
    vistos.add(r.req); return { r, v: r.valor };
  });
}
function detectarRepeticao() { // apenas sugere; não altera o método automaticamente
  const g = {}; state.rows.forEach(r => (g[r.req] = g[r.req] || []).push(r.valor));
  const multi = Object.values(g).filter(a => a.length > 1);
  return multi.length > 0 && multi.every(a => a.every(v => v === a[0]) && a[0] !== 0);
}
const somarPor = (itens, fn) => itens.reduce((m, { r, v }) => { const k = fn(r) || "(vazio)"; m[k] = (m[k] || 0) + v; return m; }, {});

// ---------- Atualização geral ----------
function aplicar() {
  state.filtrados = filtrar(); state.pag = 0;
  $("contador").textContent = `${state.filtrados.length} de ${state.rows.length} itens`;
  $("metodoAtual").textContent = "Método: " + ($("metodo").value === "todos" ? "somar todos os itens" : "um Valor RC por requisição") +
    (state.rows.length && detectarRepeticao() ? " · Atenção: valores idênticos repetidos nos itens da mesma RIC; considere alternar o método." : "");
  cards(); graficos(); tabela();
}

function cards() {
  const rows = state.filtrados, porReq = {};
  rows.forEach(r => { const a = porReq[r.req]; if (!a || PRIORIDADE.indexOf(r.sit) < PRIORIDADE.indexOf(a)) porReq[r.req] = r.sit; });
  const cont = s => Object.values(porReq).filter(x => x === s).length;
  const tot = {}; valoresEfetivos(rows).forEach(({ r, v }) => tot[r.moeda] = (tot[r.moeda] || 0) + v);
  const valorTxt = !state.temValor ? "—" : Object.keys(tot).length ? Object.entries(tot).map(([m, v]) => fmtMoeda(v, m)).join("<br>") : fmtMoeda(0);
  const k = [["RICs únicas", Object.keys(porReq).length], ["Total de itens", rows.length], ["Valor total das RICs", valorTxt],
    ["Pendentes", cont("pendente")], ["Em aprovação", cont("aprovacao")], ["Com pedido", cont("pedido")],
    ["Com MIGO", cont("migo")], ["Compensadas", cont("compensada")], ["Em atenção", cont("atencao")]];
  $("kpis").innerHTML = k.map(([t, v]) => `<div class="kpi"><span>${t}</span><b>${v}</b></div>`).join("");
  state.porReq = porReq;
}

// ---------- Gráficos ----------
function desenhar(id, tipo, labels, data, titulo) {
  if (state.charts[id]) state.charts[id].destroy();
  state.charts[id] = new Chart($(id), { type: tipo, data: { labels, datasets: [{ label: titulo, data, backgroundColor: "#e5b53b", borderColor: "#e5b53b" }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#ccc" } }, y: { ticks: { color: "#ccc" } } } } });
}
function top10(obj) { return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 10); }
function graficos() {
  Chart.defaults.color = "#ccc";
  const rows = state.filtrados;
  const porSit = {}; Object.values(state.porReq || {}).forEach(s => porSit[SITUACOES[s]] = (porSit[SITUACOES[s]] || 0) + 1);
  desenhar("g1", "bar", Object.keys(porSit), Object.values(porSit), "RICs");
  // Gráficos de valor usam a moeda predominante para não misturar moedas
  const moedas = {}; rows.forEach(r => moedas[r.moeda] = (moedas[r.moeda] || 0) + 1);
  const moeda = Object.keys(moedas).sort((a, b) => moedas[b] - moedas[a])[0] || CONFIG.moedaPadrao;
  const itens = valoresEfetivos(rows.filter(r => r.moeda === moeda));
  const t = "Valor RC (" + moeda + ")";
  const s = somarPor(itens, r => r.sitTxt); desenhar("g2", "bar", Object.keys(s), Object.values(s), t);
  [["g3", "cc"], ["g4", "requisitante"], ["g5", "nome"]].forEach(([id, c]) => {
    const e = top10(somarPor(itens, r => r[c])); desenhar(id, "bar", e.map(x => x[0]), e.map(x => x[1]), t);
  });
  const meses = {}, vistos = new Set();
  rows.forEach(r => { if (r.dtSol && !vistos.has(r.req)) { vistos.add(r.req); const k = r.dtSol.toISOString().slice(0, 7); meses[k] = (meses[k] || 0) + 1; } });
  const ks = Object.keys(meses).sort(); desenhar("g6", "line", ks, ks.map(k => meses[k]), "Solicitações");
  const pares = [["Solicitação → Pedido", "dtSol", "dtPedido"], ["Pedido → MIGO", "dtPedido", "dtMigo"], ["MIGO → Compensação", "dtMigo", "dtComp"]];
  let descartados = 0;
  const medias = pares.map(([, a, b]) => {
    const v = []; rows.forEach(r => { const d = dias(r[a], r[b]); if (d !== null && d >= 0) v.push(d); else if (r[a] && r[b] || r.datasInvalidas.length) descartados++; });
    return v.length ? +(v.reduce((x, y) => x + y, 0) / v.length).toFixed(1) : 0;
  });
  desenhar("g7", "bar", pares.map(p => p[0]), medias, "Dias");
  $("g7info").textContent = `Registros não utilizados (datas inválidas/inconsistentes): ${descartados}`;
}

// ---------- Tabela ----------
function tabela() {
  $("thead").innerHTML = "<tr>" + COLUNAS.map(([k, l]) => `<th data-k="${k}">${l}${state.ord.k === k ? (state.ord.d > 0 ? " ▲" : " ▼") : ""}</th>`).join("") + "<th>Detalhes</th></tr>";
  document.querySelectorAll("#thead th[data-k]").forEach(th => th.onclick = () => {
    state.ord = { k: th.dataset.k, d: state.ord.k === th.dataset.k ? -state.ord.d : 1 }; tabela();
  });
  const { k, d } = state.ord;
  const val = r => r[k] instanceof Date ? r[k].getTime() : r[k];
  const ord = [...state.filtrados].sort((a, b) => {
    const x = val(a), y = val(b);
    return (typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), "pt-BR", { numeric: true })) * d;
  });
  const pp = +$("porPagina").value, tp = Math.max(1, Math.ceil(ord.length / pp));
  state.pag = Math.min(state.pag, tp - 1);
  const fatia = ord.slice(state.pag * pp, (state.pag + 1) * pp);
  $("tbody").innerHTML = fatia.map(r => `<tr class="s-${r.sit}"><td>${esc(r.req)}</td><td>${esc(r.itemReq)}</td><td>${esc(r.material)}</td><td>${esc(r.texto)}</td>
    <td>${state.temValor ? fmtMoeda(r.valor, r.moeda) : "—"}</td><td>${fmtData(r.dtSol)}</td><td>${r.sitTxt}</td><td>${esc(r.pedido)}</td>
    <td>${esc(r.nome)}</td><td>${esc(r.requisitante)}</td><td><button class="btn" data-i="${state.rows.indexOf(r)}">Ver</button></td></tr>`).join("");
  document.querySelectorAll("#tbody button").forEach(b => b.onclick = () => detalhe(state.rows[+b.dataset.i]));
  $("pagInfo").textContent = `Página ${state.pag + 1} de ${tp}`;
}
function detalhe(r) {
  const p = (l, v) => `<p><b>${l}:</b> ${esc(v) || "—"}</p>`;
  $("detalheCorpo").innerHTML = `<div class="det"><h3>RIC ${esc(r.req)} · ${r.sitTxt}</h3>
    ${r.motivos.length ? `<h4>Motivo da atenção</h4>${r.motivos.map(m => `<p>• ${esc(m)}</p>`).join("")}` : ""}
    <h4>Requisição</h4>${p("Item", r.itemReq)}${p("Status", r.status)}${p("Data da solicitação", fmtData(r.dtSol))}${p("Perc", r.perc)}
    <h4>Material</h4>${p("Material", r.material)}${p("Descrição", r.texto)}${p("Quantidade", r.qtd)}${p("UM", r.um)}
    <h4>Valores</h4>${p("Valor RC", state.temValor ? fmtMoeda(r.valor, r.moeda) : "—")}${p("Moeda", r.moeda)}
    <h4>Responsáveis</h4>${p("Criado por", r.criado)}${p("Requisitante", r.requisitante)}${p("Grupo de compradores", r.grupo)}
    <h4>Aprovações</h4>${[r.a1, r.a2, r.a3, r.a4].map((a, i) => p("Aprovação " + (i + 1), fmtData(a))).join("")}
    <h4>Pedido / Fornecedor</h4>${p("Pedido", r.pedido)}${p("Item", r.itemPed)}${p("Data Pedido", fmtData(r.dtPedido))}${p("Fornecedor", r.fornecedor + " " + r.nome)}
    <h4>MIGO / Compensação</h4>${p("Registro MIGO", r.migo)}${p("Data MIGO", fmtData(r.dtMigo))}${p("Data de compensação", fmtData(r.dtComp))}
    <h4>Alocação</h4>${p("Centro de custo", r.cc)}${p("Ordem", r.ordem)}${p("Elemento PEP", r.pep)}</div>`;
  $("detalhe").showModal();
}

// ---------- Exportação (apenas filtrados) ----------
function exportar() {
  if (!state.filtrados.length) return erro("Nenhum registro para exportar.");
  const dados = state.filtrados.map(r => ({ ...r.raw, "Situação calculada": r.sitTxt, "Motivo atenção": r.motivos.join("; ") }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dados), "RICs filtradas");
  XLSX.writeFile(wb, "RICs_filtradas.xlsx");
}

// ---------- Eventos ----------
$("arquivo").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  $("loading").hidden = false;
  const fr = new FileReader();
  fr.onerror = () => { $("loading").hidden = true; erro("Falha ao ler o arquivo."); };
  fr.onload = ev => {
    try {
      state.wb = XLSX.read(new Uint8Array(ev.target.result), { type: "array", cellDates: false });
      const nomes = state.wb.SheetNames;
      $("aba").innerHTML = nomes.map(n => `<option>${esc(n)}</option>`).join("");
      // Escolhe a aba com mais cabeçalhos reconhecidos (não assume a primeira)
      $("aba").value = nomes.map(n => [n, pontuar(state.wb.Sheets[n])]).sort((a, b) => b[1] - a[1])[0][0];
      processarAba($("aba").value);
    } catch (err) { $("loading").hidden = true; erro("Arquivo inválido: " + err.message); }
  };
  fr.readAsArrayBuffer(f);
});
$("aba").addEventListener("change", () => processarAba($("aba").value));
$("metodo").addEventListener("change", aplicar);
["busca", "dtIni", "dtFim"].forEach(id => $(id).addEventListener("input", aplicar));
$("porPagina").addEventListener("change", () => { state.pag = 0; tabela(); });
$("ant").onclick = () => { state.pag = Math.max(0, state.pag - 1); tabela(); };
$("prox").onclick = () => { state.pag++; tabela(); };
$("exportar").onclick = exportar;
$("fechar").onclick = () => $("detalhe").close();
$("limpar").onclick = () => {
  document.querySelectorAll("[data-f]").forEach(c => c.value = ""); ["busca", "dtIni", "dtFim"].forEach(id => $(id).value = ""); aplicar();
};
cards(); tabela(); $("metodoAtual").textContent = "Carregue uma planilha para começar.";
