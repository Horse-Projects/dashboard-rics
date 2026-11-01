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
const FILTROS = [["sit", "Situação", "select"], ["prio", "Prioridade", "select"], ["requisitante", "Requisitante", "select"], ["cc", "Centro de custo", "select"],
  ["grupo", "Grupo de compradores", "select"], ["nome", "Fornecedor", "text"], ["pedido", "Pedido", "text"], ["moeda", "Moeda", "select"]];
const COLUNAS = [["sitTxt", "Situação", 1], ["prioTxt", "Prioridade", 1], ["req", "Requisição de compra", 1], ["dtSol", "Data da solicitação", 1], ["texto", "Texto breve material", 1],
  ["valor", "Valor RC", 1], ["requisitante", "Requisitante", 1], ["cc", "Centro de custo", 1], ["pedido", "Pedido", 1], ["nome", "Fornecedor", 1], ["dtMigo", "Data MIGO", 1],
  ["dtComp", "Data de compensação", 1], ["diasAberto", "Dias em aberto", 1], ["material", "Material", 0], ["itemReq", "Item", 0], ["status", "Status", 0], ["criado", "Criado por", 0],
  ["grupo", "Grupo de compradores", 0], ["ordem", "Ordem", 0], ["pep", "Elemento PEP", 0], ["qtd", "Qtd.", 0], ["moeda", "Moeda", 0]];

const $ = id => document.getElementById(id);
const state = { wb: null, rows: [], filtrados: [], faltando: [], ord: { k: "prioTxt", d: 1 }, rapido: "todas", extra: null, base: [], arquivo: "", hora: "", pag: 0, charts: {}, temValor: false };

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
      else { linhas.forEach((r, i) => r.id = i); state.rows = linhas; if (!state.temValor) erro("Coluna \"" + CONFIG.colunaValor + "\" não encontrada. O cálculo financeiro foi interrompido (\"Preço líq.pedido\" NÃO é usado como substituto)."); else $("msg").hidden = true; }
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
  definirPrioridade(r, temPed, temMigo, temComp);
}

// ---------- Prioridade (Crítica > Alta > Média > Normal) ----------
const PRIO = { critica: "Crítica", alta: "Alta", media: "Média", normal: "Normal" };
const PRIO_ORD = ["critica", "alta", "media", "normal"];
function definirPrioridade(r, temPed, temMigo, temComp) {
  r.diasAberto = r.dtSol ? Math.floor(dias(r.dtSol, r.dtComp || new Date())) : null;
  r.atrasada = !temComp && r.diasAberto > CONFIG.diasParaAtencao;
  const valorRuim = state.temValor && (!r.valorOk || r.valor <= 0);
  if (valorRuim || (!temComp && r.diasAberto > 2 * CONFIG.diasParaAtencao)) r.prio = "critica";
  else if (r.atrasada || r.sit === "atencao") r.prio = "alta";
  else if (!temComp && r.diasAberto > 7) r.prio = "media";
  else r.prio = "normal";
  r.prioTxt = PRIO[r.prio];
}
// Predicados usados pelos cards, botões rápidos e contadores de prioridade
const PRED = {
  todas: () => true, pendente: r => r.sit === "pendente", aprovacao: r => r.sit === "aprovacao", pedido: r => r.sit === "pedido",
  migo: r => r.sit === "migo", compensada: r => r.sit === "compensada", atencao: r => r.sit === "atencao", atrasada: r => r.atrasada,
  semPedido: r => !r.pedido && !r.dtComp, pedSemMigo: r => !!r.pedido && !r.migo && !r.dtMigo && !r.dtComp,
  migoSemComp: r => !!(r.migo || r.dtMigo) && !r.dtComp, valorInv: r => state.temValor && (!r.valorOk || r.valor <= 0),
  inconsist: r => r.motivos.some(m => !m.startsWith("Parada"))
};
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ---------- Validação / importação ----------
function mostrarValidacao(aba, cab, validas, vazias, semReq) {
  const el = $("validacao"); el.hidden = false;
  el.innerHTML = `<div><b>${esc(state.arquivo)}</b> · Aba: ${esc(aba)} · Atualizado em ${state.hora} · <b>${validas}</b> linhas processadas · ${vazias + semReq} ignoradas (${vazias} vazias, ${semReq} sem requisição)</div>
    ${state.faltando.length ? `<div style="color:#ff7b7b">Colunas obrigatórias não encontradas: ${state.faltando.map(esc).join(", ")}</div>` : ""}
    <details><summary>Cabeçalhos encontrados (${cab.filter(Boolean).length})</summary>${cab.filter(Boolean).map(esc).join(" | ")}</details>`;
}
function erro(t) { const m = $("msg"); m.textContent = t; m.className = "msg erro"; m.hidden = false; }
function lerArquivo(f) {
  if (!f) return;
  state.arquivo = f.name; state.hora = new Date().toLocaleString("pt-BR");
  $("loading").hidden = false;
  const fr = new FileReader();
  fr.onerror = () => { $("loading").hidden = true; erro("Não foi possível ler o arquivo."); };
  fr.onload = ev => {
    try {
      state.wb = XLSX.read(new Uint8Array(ev.target.result), { type: "array", cellDates: false });
      const nomes = state.wb.SheetNames;
      $("aba").innerHTML = nomes.map(n => `<option>${esc(n)}</option>`).join("");
      $("aba").value = nomes.map(n => [n, pontuar(state.wb.Sheets[n])]).sort((a, b) => b[1] - a[1])[0][0]; // aba com mais cabeçalhos reconhecidos
      processarAba($("aba").value);
    } catch (err) { $("loading").hidden = true; erro("Arquivo inválido: " + err.message); }
  };
  fr.readAsArrayBuffer(f);
}

// ---------- Filtros ----------
const valorFiltro = (r, k) => k === "sit" ? r.sitTxt : k === "prio" ? r.prioTxt : r[k];
function montarFiltros() {
  const box = $("filtrosSelect"); box.innerHTML = "";
  FILTROS.forEach(([k, label, tipo]) => {
    const w = document.createElement("label"); w.className = "small"; w.textContent = label;
    const c = document.createElement(tipo === "text" ? "input" : "select"); c.dataset.f = k;
    if (tipo === "text") c.addEventListener("input", debounce(aplicar, 300));
    else {
      c.addEventListener("change", aplicar);
      const vals = [...new Set(state.rows.map(r => valorFiltro(r, k)).filter(Boolean))].sort();
      c.innerHTML = `<option value="">Todos</option>` + vals.map(v => `<option>${esc(v)}</option>`).join("");
    }
    w.appendChild(c); box.appendChild(w);
  });
}
// ignorarRapido=true devolve a base usada pelos cards (todos os filtros, menos o botão rápido/gráfico)
function filtrar(ignorarRapido) {
  const f = {}; document.querySelectorAll("[data-f]").forEach(c => { if (c.value) f[c.dataset.f] = c.value.toLowerCase(); });
  const q = norm($("busca").value), ini = parseDate($("dtIni").value), fim = parseDate($("dtFim").value);
  const pred = ignorarRapido ? PRED.todas : PRED[state.rapido], ex = ignorarRapido ? null : state.extra;
  return state.rows.filter(r => {
    if (!pred(r) || (ex && String(ex.fn(r)) !== ex.v)) return false;
    for (const k in f) {
      const v = String(valorFiltro(r, k) ?? "").toLowerCase();
      if (FILTROS.find(x => x[0] === k)[2] === "select" ? v !== f[k] : !v.includes(f[k])) return false;
    }
    if (ini && (!r.dtSol || r.dtSol < ini)) return false;
    if (fim && (!r.dtSol || r.dtSol > fim)) return false;
    if (q) { r._q = r._q || norm(Object.values(r.raw).join(" ")); if (!r._q.includes(q)) return false; } // texto de busca calculado uma vez
    return true;
  });
}

// ---------- Valores (somente "Valor RC") ----------
// "todos": soma Valor RC de todas as linhas. "unico": usa 1 Valor RC (o primeiro diferente de zero) por Requisição.
function valoresEfetivos(rows) {
  const metodo = $("metodo").value, vistos = new Set();
  return rows.map(r => {
    if (!state.temValor) return { r, v: 0 };
    if (metodo === "todos") return { r, v: r.valor };
    if (vistos.has(r.req) || r.valor === 0) return { r, v: 0 };
    vistos.add(r.req); return { r, v: r.valor };
  });
}
function detectarRepeticao() { // só sugere; nunca troca o método sozinho
  const g = {}; state.rows.forEach(r => (g[r.req] = g[r.req] || []).push(r.valor));
  const multi = Object.values(g).filter(a => a.length > 1);
  return multi.length > 0 && multi.every(a => a.every(v => v === a[0]) && a[0] !== 0);
}
const somarPor = (itens, fn) => itens.reduce((m, { r, v }) => { const k = fn(r) || "(vazio)"; m[k] = (m[k] || 0) + v; return m; }, {});
function contarReq(rows, fn) {
  const m = {}; rows.forEach(r => { const k = fn(r); if (k == null) return; (m[k] = m[k] || new Set()).add(r.req); });
  return Object.fromEntries(Object.entries(m).map(([k, s]) => [k, s.size]));
}
const top10 = obj => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 10);

// ---------- Atualização geral ----------
function aplicar() {
  state.base = filtrar(true); state.filtrados = filtrar(false); state.pag = 0;
  const reqs = new Set(state.filtrados.map(r => r.req)).size, total = new Set(state.rows.map(r => r.req)).size;
  const tot = {}; valoresEfetivos(state.filtrados).forEach(({ r, v }) => tot[r.moeda] = (tot[r.moeda] || 0) + v);
  const vtxt = state.temValor ? Object.entries(tot).map(([m, v]) => fmtMoeda(v, m)).join(" + ") : "";
  $("contador").innerHTML = `Exibindo <b>${reqs}</b> de ${total} RICs (${state.filtrados.length} itens)` + (vtxt ? ` · Valor RC exibido: <b>${vtxt}</b>` : "") +
    (state.extra ? ` · Filtro do gráfico: <b>${esc(state.extra.label)}</b> <button class="link" id="tiraExtra">remover</button>` : "");
  $("metodoAtual").textContent = "Método: " + ($("metodo").value === "todos" ? "somar todos os itens" : "um Valor RC por requisição") +
    (state.rows.length && detectarRepeticao() ? " · Valores idênticos repetidos nos itens da mesma RIC: avalie alternar o método." : "");
  cards(); prioridades(); graficos(); tabela();
  document.querySelectorAll("[data-r]").forEach(b => b.classList.toggle("on", b.dataset.r === state.rapido));
}
function setRapido(k) { state.rapido = k; state.extra = null; aplicar(); }

function cards() {
  const porReq = {}, atras = new Set();
  state.base.forEach(r => {
    const a = porReq[r.req]; if (!a || PRIORIDADE.indexOf(r.sit) < PRIORIDADE.indexOf(a)) porReq[r.req] = r.sit;
    if (r.atrasada) atras.add(r.req);
  });
  const cont = s => Object.values(porReq).filter(x => x === s).length;
  const tot = {}; valoresEfetivos(state.base).forEach(({ r, v }) => tot[r.moeda] = (tot[r.moeda] || 0) + v);
  const valorTxt = !state.temValor ? "—" : Object.keys(tot).length ? Object.entries(tot).map(([m, v]) => fmtMoeda(v, m)).join("<br>") : fmtMoeda(0);
  const k = [["RICs únicas", Object.keys(porReq).length, "todas"], ["Total de itens", state.base.length, "todas"], ["Valor total das RICs", valorTxt, "todas"],
    ["Pendentes", cont("pendente"), "pendente"], ["Em aprovação", cont("aprovacao"), "aprovacao"], ["Com pedido", cont("pedido"), "pedido"],
    ["Com MIGO", cont("migo"), "migo"], ["Compensadas", cont("compensada"), "compensada"], ["Em atenção", cont("atencao"), "atencao"],
    [`Atrasadas > ${CONFIG.diasParaAtencao} dias`, atras.size, "atrasada"]];
  $("kpis").innerHTML = k.map(([t, v, c]) => `<button class="kpi k-${c}${["aprovacao", "pedido", "migo", "compensada"].includes(c) ? " nex" : ""}" data-r="${c}"><span>${t}</span><b>${v}</b></button>`).join("");
}

function prioridades() {
  const base = state.base, un = fn => new Set(base.filter(fn).map(r => r.req)).size;
  const chips = [[`Paradas há mais de ${CONFIG.diasParaAtencao} dias`, "atrasada"], ["Sem pedido", "semPedido"], ["Pedido sem MIGO", "pedSemMigo"],
    ["MIGO sem compensação", "migoSemComp"], ["Valor RC vazio/inválido/zero", "valorInv"], ["Inconsistências nos dados", "inconsist"]];
  const lista = (rows, n) => rows.slice(0, n).map(r => `<button class="prio p-${r.prio}" data-id="${r.id}"><b>${r.prioTxt}</b> · ${r.sitTxt} · RIC ${esc(r.req)} · ${state.temValor ? fmtMoeda(r.valor, r.moeda) : ""}<small>${esc(r.motivos[0] || (r.diasAberto != null ? r.diasAberto + " dias em aberto" : ""))}</small></button>`).join("") || "<p class='small'>Nenhuma RIC nesta lista.</p>";
  const urgentes = base.filter(r => !r.dtComp && r.prio !== "normal").sort((a, b) => PRIO_ORD.indexOf(a.prio) - PRIO_ORD.indexOf(b.prio) || b.valor - a.valor);
  const maiores = base.filter(r => r.sit === "pendente" || r.sit === "aprovacao").sort((a, b) => b.valor - a.valor);
  $("prioridades").innerHTML = `<h3>Prioridades do dia</h3><div class="chips">${chips.map(([t, c]) => `<button class="chip" data-r="${c}">${t}: <b>${un(PRED[c])}</b></button>`).join("")}</div>
    <div class="duas"><div><h4>Mais urgentes</h4>${lista(urgentes, 8)}</div><div><h4>Maiores valores pendentes</h4>${lista(maiores, 5)}</div></div>`;
}

// ---------- Gráficos (clique filtra a tabela) ----------
function desenhar(id, tipo, labels, data, titulo, clique, horizontal) {
  if (state.charts[id]) state.charts[id].destroy();
  state.charts[id] = new Chart($(id), { type: tipo, data: { labels, datasets: [{ label: titulo, data, backgroundColor: "#4aa3ff", borderColor: "#4aa3ff" }] },
    options: { indexAxis: horizontal ? "y" : "x", animation: { duration: 150 }, plugins: { legend: { display: false } },
      onClick: (e, els) => { if (clique && els.length) clique(labels[els[0].index]); },
      scales: { x: { ticks: { color: "#ccc" } }, y: { ticks: { color: "#ccc" } } } } });
}
const filtroGrafico = (rotulo, fn, v) => { state.extra = { label: `${rotulo}: ${v}`, fn, v }; aplicar(); };
function graficos() {
  if (document.body.classList.contains("sem-graficos")) return;
  Chart.defaults.color = "#ccc";
  const rows = state.filtrados, pend = r => r.sit === "pendente" || r.sit === "aprovacao";
  const porSit = contarReq(rows, r => r.sitTxt), cliqueSit = v => filtroGrafico("Situação", r => r.sitTxt, v);
  desenhar("g1", "bar", Object.keys(porSit), Object.values(porSit), "RICs", cliqueSit);
  const moedas = {}; rows.forEach(r => moedas[r.moeda] = (moedas[r.moeda] || 0) + 1); // valores só da moeda predominante
  const moeda = Object.keys(moedas).sort((a, b) => moedas[b] - moedas[a])[0] || CONFIG.moedaPadrao;
  const itens = valoresEfetivos(rows.filter(r => r.moeda === moeda));
  const s = somarPor(itens, r => r.sitTxt); desenhar("g2", "bar", Object.keys(s), Object.values(s), "Valor RC (" + moeda + ")", cliqueSit);
  const mk = (id, dados, rot, fn, titulo) => { const e = top10(dados); desenhar(id, "bar", e.map(x => x[0]), e.map(x => x[1]), titulo, v => filtroGrafico(rot, fn, v), true); };
  mk("g3", contarReq(rows.filter(pend), r => r.requisitante || "(vazio)"), "Pendentes de", r => pend(r) ? r.requisitante || "(vazio)" : null, "RICs pendentes");
  mk("g4", contarReq(rows, r => r.cc || "(vazio)"), "Centro de custo", r => r.cc || "(vazio)", "RICs");
  mk("g5", contarReq(rows, r => r.nome || "(vazio)"), "Fornecedor", r => r.nome || "(vazio)", "RICs");
  const mes = r => r.dtSol ? r.dtSol.toISOString().slice(0, 7) : null;
  const meses = contarReq(rows, mes), ks = Object.keys(meses).sort();
  desenhar("g6", "line", ks, ks.map(k => meses[k]), "Solicitações", v => filtroGrafico("Mês", mes, v));
  const pares = [["Solicitação → Pedido", "dtSol", "dtPedido"], ["Pedido → MIGO", "dtPedido", "dtMigo"], ["MIGO → Compensação", "dtMigo", "dtComp"]];
  let descartados = 0;
  const medias = pares.map(([, a, b]) => {
    const v = []; rows.forEach(r => { const d = dias(r[a], r[b]); if (d !== null && d >= 0) v.push(d); else if ((r[a] && r[b]) || r.datasInvalidas.length) descartados++; });
    return v.length ? +(v.reduce((x, y) => x + y, 0) / v.length).toFixed(1) : 0;
  });
  desenhar("g7", "bar", pares.map(p => p[0]), medias, "Dias");
  $("g7info").textContent = `Registros não utilizados (datas inválidas/inconsistentes): ${descartados}`;
}

// ---------- Tabela ----------
function cel(r, k) {
  const v = r[k];
  if (k === "sitTxt") return `<span class="badge s-${r.sit}">${v}</span>`;
  if (k === "prioTxt") return `<span class="badge p-${r.prio}">${v}</span>`;
  if (k === "valor") return state.temValor ? fmtMoeda(v, r.moeda) : "—";
  if (v instanceof Date) return fmtData(v);
  return v == null ? "" : esc(v);
}
function tabela() {
  const cols = COLUNAS.filter(c => state.cols.has(c[0])), { k, d } = state.ord;
  $("thead").innerHTML = "<tr>" + cols.map(([c, l]) => `<th data-k="${c}">${l}${k === c ? (d > 0 ? " ▲" : " ▼") : ""}</th>`).join("") + "<th>Ação</th></tr>";
  document.querySelectorAll("#thead th[data-k]").forEach(th => th.onclick = () => { state.ord = { k: th.dataset.k, d: k === th.dataset.k ? -d : 1 }; tabela(); });
  const val = r => k === "prioTxt" ? PRIO_ORD.indexOf(r.prio) : r[k] instanceof Date ? r[k].getTime() : r[k] === null ? -1 : r[k];
  const ord = [...state.filtrados].sort((a, b) => {
    const x = val(a), y = val(b);
    return (typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), "pt-BR", { numeric: true })) * d;
  });
  const pp = +$("porPagina").value, tp = Math.max(1, Math.ceil(ord.length / pp));
  state.pag = Math.min(state.pag, tp - 1);
  $("tbody").innerHTML = ord.slice(state.pag * pp, (state.pag + 1) * pp).map(r =>
    `<tr class="s-${r.sit}${r.atrasada ? " atrasada" : ""}">` + cols.map(([c]) => `<td>${cel(r, c)}</td>`).join("") + `<td><button class="btn" data-id="${r.id}">Ver detalhes</button></td></tr>`).join("");
  $("pagInfo").textContent = `Página ${state.pag + 1} de ${tp}`;
}

// ---------- Detalhes com linha do tempo ----------
function detalhe(r) {
  const p = (l, v) => `<p><b>${l}:</b> ${esc(v) || "—"}</p>`;
  const dd = (a, b) => a && b && b >= a ? Math.round(dias(a, b)) + " dias" : "—";
  const etapas = ["Solicitada", "Em aprovação", "Pedido criado", "MIGO realizado", "Compensada"];
  const atual = { aprovacao: 1, pendente: 1, pedido: 2, migo: 3, compensada: 4 }[r.sitBase] ?? 0;
  const ultAprov = [r.a4, r.a3, r.a2, r.a1].find(Boolean) || null;
  const itens = state.rows.filter(x => x.req === r.req);
  $("detalheCorpo").innerHTML = `<div class="det"><h3>RIC ${esc(r.req)}</h3>
    <p><span class="badge s-${r.sit}">${r.sitTxt}</span> <span class="badge p-${r.prio}">Prioridade ${r.prioTxt}</span></p>
    <ul class="tl">${etapas.map((e, i) => `<li class="${i < atual ? "ok" : i === atual ? "cur" : ""}">${e}</li>`).join("")}</ul>
    ${r.motivos.length ? `<h4>Motivo da classificação "Em atenção"</h4>${r.motivos.map(m => `<p>• ${esc(m)}</p>`).join("")}` : ""}
    <h4>1. Solicitação</h4>${p("Data", fmtData(r.dtSol))}${p("Requisitante", r.requisitante)}${p("Criado por", r.criado)}${p("Dias em aberto", r.diasAberto)}
    <h4>2. Aprovações (datas)</h4>${[r.a1, r.a2, r.a3, r.a4].map((a, i) => p("Nível " + (i + 1), fmtData(a))).join("")}${p("Dias até a última aprovação", dd(r.dtSol, ultAprov))}
    <h4>3. Pedido</h4>${p("Pedido", r.pedido)}${p("Data", fmtData(r.dtPedido))}${p("Fornecedor", (r.fornecedor + " " + r.nome).trim())}${p("Grupo de compradores", r.grupo)}${p("Dias aprovação → pedido", dd(ultAprov || r.dtSol, r.dtPedido))}
    <h4>4. MIGO</h4>${p("Registro", r.migo)}${p("Data", fmtData(r.dtMigo))}${p("Dias pedido → MIGO", dd(r.dtPedido, r.dtMigo))}
    <h4>5. Compensação</h4>${p("Data", fmtData(r.dtComp))}${p("Dias MIGO → compensação", dd(r.dtMigo, r.dtComp))}
    <h4>Alocação</h4>${p("Centro de custo", r.cc)}${p("Ordem", r.ordem)}${p("Elemento PEP", r.pep)}
    <h4>Itens da RIC (${itens.length})</h4><table><tr><th>Item</th><th>Material</th><th>Descrição</th><th>Qtd.</th><th>Valor RC</th></tr>
    ${itens.map(i => `<tr><td>${esc(i.itemReq)}</td><td>${esc(i.material)}</td><td>${esc(i.texto)}</td><td>${esc(i.qtd)}</td><td>${state.temValor ? fmtMoeda(i.valor, i.moeda) : "—"}</td></tr>`).join("")}</table></div>`;
  $("detalhe").showModal();
}

// ---------- Exportação ----------
function exportar(rows, nome) {
  if (!rows.length) return erro("Nenhum registro para exportar.");
  const dados = rows.map(r => ({ ...r.raw, "Situação calculada": r.sitTxt, "Prioridade": r.prioTxt, "Dias em aberto": r.diasAberto, "Motivo atenção": r.motivos.join("; ") }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dados), "RICs");
  XLSX.writeFile(wb, nome + ".xlsx");
}
function limparFiltros() {
  document.querySelectorAll("[data-f]").forEach(c => c.value = "");
  ["busca", "dtIni", "dtFim"].forEach(id => $(id).value = ""); state.rapido = "todas"; state.extra = null; aplicar();
}

// ---------- Eventos ----------
state.cols = new Set(COLUNAS.filter(c => c[2]).map(c => c[0]));
$("colsList").innerHTML = COLUNAS.map(([k, l]) => `<label><input type="checkbox" data-c="${k}" ${state.cols.has(k) ? "checked" : ""}> ${l}</label>`).join("");
$("colsList").addEventListener("change", e => { const k = e.target.dataset.c; e.target.checked ? state.cols.add(k) : state.cols.delete(k); tabela(); });
document.addEventListener("click", e => {
  const r = e.target.closest("[data-r]"), i = e.target.closest("[data-id]");
  if (r) setRapido(r.dataset.r);
  else if (i) detalhe(state.rows[+i.dataset.id]);
  else if (e.target.id === "tiraExtra") { state.extra = null; aplicar(); }
});
$("arquivo").addEventListener("change", e => { lerArquivo(e.target.files[0]); e.target.value = ""; });
const drop = $("drop");
["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("on"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("on"); }));
drop.addEventListener("drop", e => lerArquivo(e.dataTransfer.files[0]));
$("atualizar").onclick = () => $("arquivo").click();
$("aba").addEventListener("change", () => processarAba($("aba").value));
$("metodo").addEventListener("change", aplicar);
$("busca").addEventListener("input", debounce(aplicar, 300));
$("limparBusca").onclick = () => { $("busca").value = ""; aplicar(); };
["dtIni", "dtFim"].forEach(id => $(id).addEventListener("change", aplicar));
$("limpar").onclick = limparFiltros;
$("porPagina").addEventListener("change", () => { state.pag = 0; tabela(); });
$("ant").onclick = () => { state.pag = Math.max(0, state.pag - 1); tabela(); };
$("prox").onclick = () => { state.pag++; tabela(); };
$("fechar").onclick = () => $("detalhe").close();
$("expFiltrada").onclick = () => exportar(state.filtrados, "RICs_filtradas");
$("expPend").onclick = () => exportar(state.base.filter(r => r.sit === "pendente" || r.sit === "aprovacao"), "RICs_pendentes");
$("expAtencao").onclick = () => exportar(state.base.filter(PRED.atencao), "RICs_em_atencao");
$("modoExec").onclick = () => { const on = document.body.classList.toggle("exec"); $("modoExec").textContent = on ? "Sair do modo executivo" : "Modo executivo"; if (on) graficos(); };
$("togGraf").onclick = () => { const oculto = document.body.classList.toggle("sem-graficos"); $("togGraf").textContent = oculto ? "Mostrar gráficos" : "Ocultar gráficos"; if (!oculto) graficos(); };
aplicar(); $("metodoAtual").textContent = "Importe uma planilha para começar.";
