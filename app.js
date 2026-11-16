import { criarStore, novoId } from "./store.js";

// ---------- utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (c) => fmtBRL.format((c || 0) / 100);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const fmtData = (iso) => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const fmtMes = (ym) => { const [y, m] = ym.split("-"); return `${MESES[+m - 1]}/${y}`; };
const fmtMesLongo = (ym) => { const [y, m] = ym.split("-"); return `${MESES_LONGOS[+m - 1]} de ${y}`; };
const fmtPct = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: n > 0 && n < 10 ? 1 : 0 }) + "%";
const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);
const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const centavosParaTexto = (c) => (c ? (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");

// Aceita "1.234,56", "1234,56", "1234.56", "1.500", "R$ 10"
function parseValor(txt) {
  let s = String(txt || "").replace(/[R$\s]/g, "").trim();
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

const pref = {
  get(k, d) { try { const v = localStorage.getItem("minha-obra:pref:" + k); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("minha-obra:pref:" + k, v); } catch {} },
};

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 2600);
}

function baixarArquivo(nome, conteudo, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------- estado ----------
let store;
let S = { config: null, gastos: [] };
const filtro = { busca: "", mes: "", categoria: "", fonte: "" };
const rel = { periodo: "tudo", de: "", ate: "", categoria: "", fonte: "" };

const cats = () => S.config.categorias || [];
const fontes = () => S.config.fontes || [];
const nomeCat = (id) => cats().find((c) => c.id === id)?.nome || "Sem categoria";
const nomeFonte = (id) => fontes().find((f) => f.id === id)?.nome || "Sem origem";
const somar = (lista) => lista.reduce((t, g) => t + (g.valor || 0), 0);
function agrupar(lista, chave) {
  const m = new Map();
  for (const g of lista) { const k = chave(g); m.set(k, (m.get(k) || 0) + (g.valor || 0)); }
  return [...m].sort((a, b) => b[1] - a[1]);
}
const ordenar = (lista) => [...lista].sort((a, b) =>
  (b.data || "").localeCompare(a.data || "") || String(b.criadoEm || "").localeCompare(String(a.criadoEm || "")));
const autor = () => store.state.user?.email || "";
const quem = (email) => (email ? email.split("@")[0] : "");

// ---------- componentes ----------
function barras(itens, total, { classe = "" } = {}) {
  if (!itens.length) return `<p class="vazio-pequeno">Nada lançado ainda.</p>`;
  const max = Math.max(...itens.map((i) => i[1]));
  return `<ul class="barras ${classe}">${itens.map(([nome, v]) => `
    <li>
      <div class="barras-txt"><span>${esc(nome)}</span><span class="num">${money(v)} <small>${fmtPct(pct(v, total))}</small></span></div>
      <div class="barras-trilho"><span style="width:${max ? (v / max) * 100 : 0}%"></span></div>
    </li>`).join("")}</ul>`;
}

function itemGasto(g) {
  return `<li><button type="button" class="gasto" data-editar="${esc(g.id)}">
    <span class="gasto-info">
      <span class="gasto-desc">${esc(g.descricao || nomeCat(g.categoria))}</span>
      <span class="gasto-meta">${fmtData(g.data)} · ${esc(nomeCat(g.categoria))}</span>
    </span>
    <span class="gasto-dir">
      <span class="gasto-valor num">${money(g.valor)}</span>
      <span class="chip-fonte">${esc(nomeFonte(g.fonte))}</span>
    </span>
  </button></li>`;
}

function listaGastos(lista) {
  return `<ul class="lista-gastos">${lista.map(itemGasto).join("")}</ul>`;
}

// ---------- telas ----------
function telaInicio() {
  const total = somar(S.gastos);
  const meta = S.config.meta || 0;
  const p = pct(total, meta);
  const falta = meta - total;
  const mes = hoje().slice(0, 7);
  const doMes = somar(S.gastos.filter((g) => (g.data || "").startsWith(mes)));
  const vazio = !S.gastos.length;

  const blocoMeta = meta
    ? `<div class="barra-meta ${p > 100 ? "estourou" : ""}" role="progressbar" aria-valuenow="${Math.round(p)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.min(p, 100)}%"></span></div>
       <div class="meta-linha"><span>${fmtPct(p)} da meta</span><span>Meta ${money(meta)}</span></div>
       <p class="falta">${falta >= 0 ? `Faltam <strong>${money(falta)}</strong> para chegar à meta.` : `Já passou <strong>${money(-falta)}</strong> da meta.`}</p>`
    : `<p class="falta">Defina o valor final previsto para a obra em <a href="#ajustes">Ajustes</a> para acompanhar quanto falta.</p>`;

  const usoFontes = fontes().map((f) => {
    const gasto = somar(S.gastos.filter((g) => g.fonte === f.id));
    return { ...f, gasto };
  });
  const semFonte = somar(S.gastos.filter((g) => !fontes().some((f) => f.id === g.fonte)));
  if (semFonte) usoFontes.push({ id: "", nome: "Sem origem", valor: 0, gasto: semFonte });
  const fontesHtml = usoFontes.filter((f) => f.gasto || f.valor).map((f) => {
    const temLimite = f.valor > 0;
    const saldo = f.valor - f.gasto;
    return `<li class="fonte">
      <div class="fonte-topo"><span class="fonte-nome">${esc(f.nome)}</span><span class="num">${money(f.gasto)}</span></div>
      ${temLimite ? `
        <div class="barras-trilho ${f.gasto > f.valor ? "estourou" : ""}"><span style="width:${Math.min(pct(f.gasto, f.valor), 100)}%"></span></div>
        <p class="fonte-saldo">${saldo >= 0 ? `Sobram ${money(saldo)} de ${money(f.valor)}` : `Passou ${money(-saldo)} do previsto (${money(f.valor)})`}</p>`
        : `<p class="fonte-saldo">${fmtPct(pct(f.gasto, total))} do total gasto</p>`}
    </li>`;
  }).join("");

  return `
  <section class="painel-meta">
    <p class="rotulo">Total gasto até agora</p>
    <p class="valor-grande num">${money(total)}</p>
    ${blocoMeta}
  </section>

  <div class="mini-grid">
    <div class="mini"><p class="rotulo">Gasto em ${MESES_LONGOS[+mes.slice(5) - 1]}</p><p class="valor num">${money(doMes)}</p></div>
    <div class="mini"><p class="rotulo">Lançamentos</p><p class="valor num">${S.gastos.length}</p></div>
  </div>

  ${vazio ? `
  <section class="vazio">
    <h2>Nenhum gasto lançado ainda</h2>
    <p>Toque no botão <strong>+</strong> para lançar o primeiro gasto. Informe o valor, a data e de onde saiu o dinheiro.</p>
  </section>` : `
  <section>
    <h2>De onde saiu o dinheiro</h2>
    <ul class="fontes">${fontesHtml}</ul>
  </section>
  <section>
    <h2>Onde foi gasto</h2>
    ${barras(agrupar(S.gastos, (g) => nomeCat(g.categoria)).slice(0, 6), total)}
  </section>
  <section>
    <div class="sec-head"><h2>Últimos gastos</h2><a href="#gastos">Ver todos</a></div>
    ${listaGastos(ordenar(S.gastos).slice(0, 5))}
  </section>`}`;
}

function filtrarGastos() {
  const b = filtro.busca.trim().toLowerCase();
  return S.gastos.filter((g) =>
    (!filtro.mes || (g.data || "").startsWith(filtro.mes)) &&
    (!filtro.categoria || g.categoria === filtro.categoria) &&
    (!filtro.fonte || g.fonte === filtro.fonte) &&
    (!b || `${g.descricao} ${g.obs} ${nomeCat(g.categoria)} ${nomeFonte(g.fonte)}`.toLowerCase().includes(b)));
}

function htmlListaFiltrada() {
  const lista = ordenar(filtrarGastos());
  if (!lista.length) {
    return `<p class="vazio-pequeno">${S.gastos.length ? "Nenhum gasto encontrado com esses filtros." : "Nenhum gasto lançado ainda. Toque em + para lançar o primeiro."}</p>`;
  }
  const porMes = new Map();
  for (const g of lista) {
    const k = (g.data || "").slice(0, 7);
    if (!porMes.has(k)) porMes.set(k, []);
    porMes.get(k).push(g);
  }
  return `<p class="total-filtro">${lista.length} ${lista.length === 1 ? "gasto" : "gastos"} · <strong class="num">${money(somar(lista))}</strong></p>` +
    [...porMes].map(([mes, gs]) => `
      <div class="grupo-mes">
        <div class="grupo-cab"><h3>${mes ? fmtMesLongo(mes) : "Sem data"}</h3><span class="num">${money(somar(gs))}</span></div>
        ${listaGastos(gs)}
      </div>`).join("");
}

function opcoes(lista, sel, todos) {
  return `<option value="">${todos}</option>` + lista.map((x) => `<option value="${esc(x.id)}" ${x.id === sel ? "selected" : ""}>${esc(x.nome)}</option>`).join("");
}

function mesesDisponiveis() {
  return [...new Set(S.gastos.map((g) => (g.data || "").slice(0, 7)).filter(Boolean))].sort().reverse();
}

function telaGastos() {
  const meses = mesesDisponiveis();
  return `
  <section class="filtros">
    <input id="f-busca" type="search" placeholder="Buscar descrição, loja…" value="${esc(filtro.busca)}" aria-label="Buscar">
    <div class="filtros-linha">
      <select id="f-mes" aria-label="Mês"><option value="">Todos os meses</option>${meses.map((m) => `<option value="${m}" ${m === filtro.mes ? "selected" : ""}>${fmtMes(m)}</option>`).join("")}</select>
      <select id="f-categoria" aria-label="Categoria">${opcoes(cats(), filtro.categoria, "Todas as categorias")}</select>
      <select id="f-fonte" aria-label="Origem do dinheiro">${opcoes(fontes(), filtro.fonte, "Todas as origens")}</select>
    </div>
  </section>
  <section id="lista-filtrada">${htmlListaFiltrada()}</section>`;
}

// ----- relatório -----
function intervaloRel() {
  const h = hoje();
  if (rel.periodo === "mes") return [h.slice(0, 7) + "-01", h.slice(0, 7) + "-31"];
  if (rel.periodo === "mes-anterior") {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return [ym + "-01", ym + "-31"];
  }
  if (rel.periodo === "ano") return [h.slice(0, 4) + "-01-01", h.slice(0, 4) + "-12-31"];
  if (rel.periodo === "personalizado") return [rel.de, rel.ate];
  return ["", ""];
}
function gastosRel() {
  const [de, ate] = intervaloRel();
  return ordenar(S.gastos.filter((g) =>
    (!de || (g.data || "") >= de) && (!ate || (g.data || "") <= ate) &&
    (!rel.categoria || g.categoria === rel.categoria) && (!rel.fonte || g.fonte === rel.fonte)));
}
function descricaoPeriodo() {
  const [de, ate] = intervaloRel();
  let p = "Desde o início da obra";
  if (rel.periodo === "mes" || rel.periodo === "mes-anterior") p = fmtMesLongo(de.slice(0, 7));
  else if (rel.periodo === "ano") p = "Ano de " + de.slice(0, 4);
  else if (rel.periodo === "personalizado") p = de && ate ? `De ${fmtData(de)} a ${fmtData(ate)}` : de ? `A partir de ${fmtData(de)}` : ate ? `Até ${fmtData(ate)}` : "Todo o período";
  const extras = [];
  if (rel.categoria) extras.push("categoria " + nomeCat(rel.categoria));
  if (rel.fonte) extras.push("origem " + nomeFonte(rel.fonte));
  return p + (extras.length ? " · " + extras.join(" · ") : "");
}

function tabela(linhas, total, cab) {
  if (!linhas.length) return `<p class="vazio-pequeno">Sem lançamentos.</p>`;
  return `<div class="tabela-wrap"><table class="tabela">
    <thead><tr><th>${cab}</th><th class="num">Valor</th><th class="num">%</th></tr></thead>
    <tbody>${linhas.map(([n, v]) => `<tr><td>${esc(n)}</td><td class="num">${money(v)}</td><td class="num">${fmtPct(pct(v, total))}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td>Total</td><td class="num">${money(total)}</td><td class="num">100%</td></tr></tfoot>
  </table></div>`;
}

function documentoRelatorio() {
  const lista = gastosRel();
  const total = somar(lista);
  const totalGeral = somar(S.gastos);
  const meta = S.config.meta || 0;
  const agora = new Date();
  const geradoEm = `${agora.toLocaleDateString("pt-BR")} às ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  const porMes = agrupar(lista, (g) => (g.data || "").slice(0, 7)).sort((a, b) => a[0].localeCompare(b[0])).map(([m, v]) => [m ? fmtMesLongo(m) : "Sem data", v]);

  return `<article id="doc-relatorio" class="relatorio">
    <header class="rel-cab">
      <p class="eyebrow">Relatório de gastos da obra</p>
      <h2>${esc(S.config.nome || "Minha Casa")}</h2>
      <p class="rel-sub">${esc(descricaoPeriodo())} · gerado em ${geradoEm}</p>
    </header>
    <dl class="rel-resumo">
      <div><dt>Gasto no período</dt><dd class="num">${money(total)}</dd></div>
      <div><dt>Lançamentos</dt><dd class="num">${lista.length}</dd></div>
      <div><dt>Total gasto na obra</dt><dd class="num">${money(totalGeral)}</dd></div>
      ${meta ? `
      <div><dt>Meta do valor final</dt><dd class="num">${money(meta)}</dd></div>
      <div><dt>Da meta já usado</dt><dd class="num">${fmtPct(pct(totalGeral, meta))}</dd></div>
      <div><dt>${meta >= totalGeral ? "Falta para a meta" : "Acima da meta"}</dt><dd class="num">${money(Math.abs(meta - totalGeral))}</dd></div>` : ""}
    </dl>
    <h3>Por categoria</h3>
    ${tabela(agrupar(lista, (g) => nomeCat(g.categoria)), total, "Categoria")}
    <h3>Por origem do dinheiro</h3>
    ${tabela(agrupar(lista, (g) => nomeFonte(g.fonte)), total, "Origem")}
    <h3>Por mês</h3>
    ${tabela(porMes, total, "Mês")}
    <h3>Todos os lançamentos</h3>
    ${lista.length ? `<div class="tabela-wrap"><table class="tabela tabela-lanc">
      <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Origem</th><th class="num">Valor</th></tr></thead>
      <tbody>${lista.map((g) => `<tr>
        <td class="nowrap">${fmtData(g.data)}</td>
        <td>${esc(g.descricao || "—")}${g.obs ? `<br><small>${esc(g.obs)}</small>` : ""}</td>
        <td>${esc(nomeCat(g.categoria))}</td>
        <td>${esc(nomeFonte(g.fonte))}</td>
        <td class="num nowrap">${money(g.valor)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="4">Total</td><td class="num nowrap">${money(total)}</td></tr></tfoot>
    </table></div>` : `<p class="vazio-pequeno">Nenhum gasto neste período.</p>`}
  </article>`;
}

function telaRelatorio() {
  return `
  <section class="filtros nao-imprimir">
    <div class="filtros-linha">
      <select id="r-periodo" aria-label="Período">
        ${[["tudo", "Desde o início"], ["mes", "Este mês"], ["mes-anterior", "Mês passado"], ["ano", "Este ano"], ["personalizado", "Escolher datas"]]
          .map(([v, n]) => `<option value="${v}" ${rel.periodo === v ? "selected" : ""}>${n}</option>`).join("")}
      </select>
      <select id="r-categoria" aria-label="Categoria">${opcoes(cats(), rel.categoria, "Todas as categorias")}</select>
      <select id="r-fonte" aria-label="Origem">${opcoes(fontes(), rel.fonte, "Todas as origens")}</select>
    </div>
    ${rel.periodo === "personalizado" ? `<div class="filtros-linha">
      <label class="campo-inline">De <input id="r-de" type="date" value="${esc(rel.de)}"></label>
      <label class="campo-inline">Até <input id="r-ate" type="date" value="${esc(rel.ate)}"></label>
    </div>` : ""}
    <div class="acoes-rel">
      <button type="button" class="btn primario" data-acao="imprimir">Salvar PDF / imprimir</button>
      <button type="button" class="btn" data-acao="csv">Baixar planilha</button>
      <button type="button" class="btn" data-acao="compartilhar">Compartilhar</button>
    </div>
  </section>
  <div id="area-relatorio">${documentoRelatorio()}</div>`;
}

function gerarCSV(lista) {
  const cel = (v) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const linhas = [["Data", "Descrição", "Categoria", "Origem do dinheiro", "Valor (R$)", "Observação", "Lançado por"]];
  for (const g of lista) {
    linhas.push([fmtData(g.data), g.descricao, nomeCat(g.categoria), nomeFonte(g.fonte), centavosParaTexto(g.valor) || "0,00", g.obs, g.criadoPor]);
  }
  linhas.push(["", "Total", "", "", centavosParaTexto(somar(lista)) || "0,00", "", ""]);
  return "﻿" + linhas.map((l) => l.map(cel).join(";")).join("\r\n");
}

function textoResumo(lista) {
  const total = somar(lista);
  const meta = S.config.meta || 0;
  const totalGeral = somar(S.gastos);
  const l = [`Obra: ${S.config.nome || "Minha Casa"}`, descricaoPeriodo(), "", `Gasto no período: ${money(total)} (${lista.length} lançamentos)`];
  if (meta) l.push(`Total da obra: ${money(totalGeral)} de ${money(meta)} (${fmtPct(pct(totalGeral, meta))})`);
  l.push("", "Por categoria:");
  for (const [n, v] of agrupar(lista, (g) => nomeCat(g.categoria))) l.push(`• ${n}: ${money(v)}`);
  l.push("", "Por origem do dinheiro:");
  for (const [n, v] of agrupar(lista, (g) => nomeFonte(g.fonte))) l.push(`• ${n}: ${money(v)}`);
  return l.join("\n");
}

// ----- ajustes -----
function telaAjustes() {
  const usados = new Set(S.gastos.map((g) => g.categoria));
  const fontesUsadas = new Set(S.gastos.map((g) => g.fonte));
  const conta = store.modo === "nuvem"
    ? `<p>Conectado como <strong>${esc(store.state.user?.email)}</strong>. Os gastos ficam salvos na nuvem e aparecem no celular de vocês dois.</p>
       <button type="button" class="btn" data-acao="sair">Sair desta conta</button>`
    : `<p>Os gastos estão salvos <strong>só neste aparelho</strong>. Para você e sua esposa verem os mesmos dados, configure o Firebase seguindo o README do projeto. Antes disso, baixe um backup para levar os dados para a nuvem.</p>`;

  return `
  <section class="bloco">
    <h2>Obra</h2>
    <form id="form-obra" class="form-col">
      <label for="a-nome">Nome da obra</label>
      <input id="a-nome" value="${esc(S.config.nome || "")}" placeholder="Minha Casa">
      <label for="a-meta">Meta do valor final (R$)</label>
      <input id="a-meta" inputmode="decimal" value="${esc(centavosParaTexto(S.config.meta))}" placeholder="Ex.: 350.000,00">
      <p class="ajuda">Quanto vocês planejam gastar na obra inteira.</p>
      <button type="submit" class="btn primario">Salvar</button>
    </form>
  </section>

  <section class="bloco">
    <h2>Origens do dinheiro</h2>
    <p class="ajuda">De onde sai o dinheiro dos gastos. O valor previsto é opcional: se preencher, o app mostra quanto ainda sobra em cada origem.</p>
    <form id="form-fontes" class="form-col">
      <ul class="edit-lista">
        ${fontes().map((f) => `<li data-fonte="${esc(f.id)}">
          <input class="ef-nome" value="${esc(f.nome)}" aria-label="Nome da origem" placeholder="Nome">
          <input class="ef-valor" inputmode="decimal" value="${esc(centavosParaTexto(f.valor))}" aria-label="Valor previsto de ${esc(f.nome)}" placeholder="Previsto (R$)">
          <button type="button" class="btn icone" data-remover-fonte="${esc(f.id)}" aria-label="Remover ${esc(f.nome)}" ${fontesUsadas.has(f.id) ? "disabled title=\"Em uso por algum gasto\"" : ""}>✕</button>
        </li>`).join("")}
      </ul>
      <div class="linha-add">
        <input id="nova-fonte" placeholder="Nova origem (ex.: Empréstimo)">
        <button type="button" class="btn" data-acao="add-fonte">Adicionar</button>
      </div>
      <button type="submit" class="btn primario">Salvar origens</button>
    </form>
  </section>

  <section class="bloco">
    <h2>Categorias</h2>
    <ul class="chips">
      ${cats().map((c) => `<li class="chip">${esc(c.nome)}${usados.has(c.id) ? "" : `<button type="button" data-remover-cat="${esc(c.id)}" aria-label="Remover ${esc(c.nome)}">✕</button>`}</li>`).join("")}
    </ul>
    <div class="linha-add">
      <input id="nova-cat" placeholder="Nova categoria">
      <button type="button" class="btn" data-acao="add-cat">Adicionar</button>
    </div>
    <p class="ajuda">Categorias que já têm gastos não podem ser removidas.</p>
  </section>

  <section class="bloco">
    <h2>Conta e sincronização</h2>
    ${conta}
  </section>

  <section class="bloco">
    <h2>Backup</h2>
    <p class="ajuda">Guarde uma cópia de todos os dados em arquivo, ou restaure de um arquivo. Restaurar junta os dados do arquivo com os atuais, sem apagar nada.</p>
    <div class="acoes-rel">
      <button type="button" class="btn" data-acao="backup">Baixar backup</button>
      <label class="btn" for="input-restaurar">Restaurar backup</label>
      <input id="input-restaurar" type="file" accept="application/json,.json" hidden>
    </div>
  </section>
  <p class="rodape">Minha Obra · ${store.modo === "nuvem" ? "modo compartilhado" : "modo neste aparelho"}</p>`;
}

// ---------- render ----------
const TELAS = { inicio: telaInicio, gastos: telaGastos, relatorio: telaRelatorio, ajustes: telaAjustes };
function telaAtual() { const h = location.hash.slice(1); return TELAS[h] ? h : "inicio"; }

function render() {
  if (!S.config) return;
  const tela = telaAtual();
  const view = $("#view");
  // preserva o foco e o texto digitado entre atualizações vindas da nuvem
  const ativo = document.activeElement;
  const idAtivo = ativo && view.contains(ativo) ? ativo.id : null;
  const sel = idAtivo && "selectionStart" in ativo ? [ativo.selectionStart, ativo.selectionEnd] : null;
  const rascunhos = {};
  if (tela === "ajustes" && view.dataset.tela === "ajustes") {
    view.querySelectorAll("input[id]").forEach((i) => { if (i.type !== "file") rascunhos[i.id] = i.value; });
  }

  view.innerHTML = TELAS[tela]();
  view.dataset.tela = tela;

  for (const [id, v] of Object.entries(rascunhos)) { const el = document.getElementById(id); if (el) el.value = v; }
  if (idAtivo) {
    const el = document.getElementById(idAtivo);
    if (el) { el.focus(); if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch {} }
  }
  document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("ativo", a.dataset.tab === tela));
  $("#titulo-obra").textContent = S.config.nome || "Minha Casa";
  $("#fab").hidden = tela === "ajustes";
}

function renderSync(st) {
  const el = $("#sync");
  if (store.modo === "local") { el.textContent = "Só neste aparelho"; el.className = "sync local"; return; }
  if (!navigator.onLine) { el.textContent = "Sem internet"; el.className = "sync off"; return; }
  if (st.pendente) { el.textContent = "Enviando…"; el.className = "sync pend"; return; }
  el.textContent = "Sincronizado"; el.className = "sync ok";
}

// ---------- formulário de gasto ----------
const dlg = $("#dlg-gasto");
let editando = null;

function preencherSelects(catSel, fonteSel) {
  $("#g-categoria").innerHTML = cats().map((c) => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join("");
  $("#g-fonte").innerHTML = fontes().map((f) => `<option value="${esc(f.id)}">${esc(f.nome)}</option>`).join("");
  if (catSel && cats().some((c) => c.id === catSel)) $("#g-categoria").value = catSel;
  if (fonteSel && fontes().some((f) => f.id === fonteSel)) $("#g-fonte").value = fonteSel;
}

function abrirGasto(id) {
  const g = id ? S.gastos.find((x) => x.id === id) : null;
  editando = g ? g.id : null;
  $("#dlg-titulo").textContent = g ? "Editar gasto" : "Novo gasto";
  $("#g-valor").value = g ? centavosParaTexto(g.valor) : "";
  $("#g-data").value = g ? g.data : hoje();
  $("#g-descricao").value = g ? g.descricao : "";
  $("#g-obs").value = g ? g.obs || "" : "";
  preencherSelects(g ? g.categoria : pref.get("ultimaCategoria", ""), g ? g.fonte : pref.get("ultimaFonte", ""));
  $("#g-erro").textContent = "";
  $("#g-excluir").hidden = !g;
  $("#g-excluir").dataset.confirmar = "";
  $("#g-excluir").textContent = "Excluir";
  dlg.showModal();
  if (!g) setTimeout(() => $("#g-valor").focus(), 50);
}

$("#form-gasto").addEventListener("submit", (e) => {
  e.preventDefault();
  const valor = parseValor($("#g-valor").value);
  const erro = $("#g-erro");
  if (!(valor > 0)) { erro.textContent = "Informe um valor maior que zero, por exemplo 1.250,00."; $("#g-valor").focus(); return; }
  if (!$("#g-data").value) { erro.textContent = "Informe a data do gasto."; return; }
  const g = {
    valor,
    data: $("#g-data").value,
    descricao: $("#g-descricao").value.trim(),
    categoria: $("#g-categoria").value,
    fonte: $("#g-fonte").value,
    obs: $("#g-obs").value.trim(),
  };
  pref.set("ultimaCategoria", g.categoria);
  pref.set("ultimaFonte", g.fonte);
  const p = editando ? store.updateGasto(editando, g) : store.addGasto(g, autor());
  Promise.resolve(p).catch((err) => toast("Não foi possível salvar: " + (err.message || err)));
  dlg.close();
  toast(editando ? "Gasto atualizado" : `Gasto de ${money(valor)} lançado`);
});

$("#g-excluir").addEventListener("click", (e) => {
  const b = e.currentTarget;
  if (!b.dataset.confirmar) { b.dataset.confirmar = "1"; b.textContent = "Toque de novo para excluir"; return; }
  Promise.resolve(store.deleteGasto(editando)).catch((err) => toast("Não foi possível excluir: " + (err.message || err)));
  dlg.close();
  toast("Gasto excluído");
});

dlg.addEventListener("click", (e) => {
  if (e.target === dlg || e.target.closest("[data-fechar]")) dlg.close();
});

// formata o valor ao sair do campo
document.addEventListener("focusout", (e) => {
  const el = e.target;
  if (el.matches?.("#g-valor, #a-meta, .ef-valor")) {
    const v = parseValor(el.value);
    if (v > 0) el.value = centavosParaTexto(v);
  }
});

// ---------- eventos das telas ----------
const view = $("#view");

view.addEventListener("click", async (e) => {
  const ed = e.target.closest("[data-editar]");
  if (ed) return abrirGasto(ed.dataset.editar);

  const remCat = e.target.closest("[data-remover-cat]");
  if (remCat) {
    const id = remCat.dataset.removerCat;
    if (S.gastos.some((g) => g.categoria === id)) return toast("Essa categoria tem gastos e não pode ser removida.");
    salvarCfg({ categorias: cats().filter((c) => c.id !== id) });
    return toast("Categoria removida");
  }
  const remFonte = e.target.closest("[data-remover-fonte]");
  if (remFonte) {
    const id = remFonte.dataset.removerFonte;
    if (S.gastos.some((g) => g.fonte === id)) return toast("Essa origem tem gastos e não pode ser removida.");
    salvarCfg({ fontes: fontes().filter((f) => f.id !== id) });
    return toast("Origem removida");
  }

  const acao = e.target.closest("[data-acao]")?.dataset.acao;
  if (!acao) return;

  if (acao === "add-cat") {
    const nome = $("#nova-cat").value.trim();
    if (!nome) return toast("Escreva o nome da categoria.");
    if (cats().some((c) => c.nome.toLowerCase() === nome.toLowerCase())) return toast("Essa categoria já existe.");
    $("#nova-cat").value = "";
    salvarCfg({ categorias: [...cats(), { id: novoId(), nome }] });
    toast("Categoria adicionada");
  } else if (acao === "add-fonte") {
    const nome = $("#nova-fonte").value.trim();
    if (!nome) return toast("Escreva o nome da origem.");
    $("#nova-fonte").value = "";
    salvarCfg({ fontes: [...lerFontesDoForm(), { id: novoId(), nome, valor: 0 }] });
    toast("Origem adicionada");
  } else if (acao === "imprimir") {
    window.print();
  } else if (acao === "csv") {
    baixarArquivo(`gastos-obra-${hoje()}.csv`, gerarCSV(gastosRel()), "text/csv;charset=utf-8");
  } else if (acao === "compartilhar") {
    const texto = textoResumo(gastosRel());
    try {
      const arquivo = new File([gerarCSV(gastosRel())], `gastos-obra-${hoje()}.csv`, { type: "text/csv" });
      if (navigator.canShare?.({ files: [arquivo] })) {
        await navigator.share({ title: "Relatório da obra", text: texto, files: [arquivo] });
      } else if (navigator.share) {
        await navigator.share({ title: "Relatório da obra", text: texto });
      } else {
        await navigator.clipboard.writeText(texto);
        toast("Resumo copiado. Cole no WhatsApp ou e-mail.");
      }
    } catch (err) {
      if (err?.name !== "AbortError") toast("Não foi possível compartilhar neste aparelho.");
    }
  } else if (acao === "backup") {
    const dados = { app: "minha-obra", versao: 1, exportadoEm: new Date().toISOString(), config: S.config, gastos: S.gastos };
    baixarArquivo(`backup-obra-${hoje()}.json`, JSON.stringify(dados, null, 2), "application/json");
  } else if (acao === "sair") {
    await store.sair();
  }
});

// Na nuvem a resposta do servidor pode demorar (ou só chegar quando voltar a
// internet); a tela já se atualiza com a cópia local, então não esperamos.
function salvarCfg(patch) {
  Promise.resolve(store.saveConfig(patch)).catch((err) => toast("Não foi possível salvar: " + (err.message || err)));
}

function lerFontesDoForm() {
  return [...view.querySelectorAll("[data-fonte]")].map((li) => {
    const antigo = fontes().find((f) => f.id === li.dataset.fonte) || {};
    const v = parseValor(li.querySelector(".ef-valor").value);
    return { ...antigo, id: li.dataset.fonte, nome: li.querySelector(".ef-nome").value.trim() || antigo.nome || "Sem nome", valor: v > 0 ? v : 0 };
  });
}

view.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (e.target.id === "form-obra") {
    const metaTxt = $("#a-meta").value.trim();
    const meta = metaTxt ? parseValor(metaTxt) : 0;
    if (metaTxt && !(meta >= 0)) return toast("Não entendi o valor da meta. Use, por exemplo, 350.000,00.");
    salvarCfg({ nome: $("#a-nome").value.trim() || "Minha Casa", meta: meta || 0 });
    $("#view").dataset.tela = "";
    render();
    toast("Dados da obra salvos");
  } else if (e.target.id === "form-fontes") {
    salvarCfg({ fontes: lerFontesDoForm() });
    $("#view").dataset.tela = "";
    render();
    toast("Origens salvas");
  }
});

view.addEventListener("input", (e) => {
  if (e.target.id === "f-busca") {
    filtro.busca = e.target.value;
    $("#lista-filtrada").innerHTML = htmlListaFiltrada();
  }
});

view.addEventListener("change", async (e) => {
  const id = e.target.id;
  const mapa = { "f-mes": [filtro, "mes"], "f-categoria": [filtro, "categoria"], "f-fonte": [filtro, "fonte"],
    "r-periodo": [rel, "periodo"], "r-categoria": [rel, "categoria"], "r-fonte": [rel, "fonte"], "r-de": [rel, "de"], "r-ate": [rel, "ate"] };
  if (mapa[id]) {
    const [obj, k] = mapa[id];
    obj[k] = e.target.value;
    render();
    return;
  }
  if (id === "input-restaurar") {
    const arq = e.target.files?.[0];
    if (!arq) return;
    try {
      const dados = JSON.parse(await arq.text());
      if (!dados || !Array.isArray(dados.gastos)) throw new Error("arquivo não é um backup do Minha Obra");
      await store.importar(dados);
      toast(`Backup restaurado: ${dados.gastos.length} gastos`);
    } catch (err) {
      toast("Não foi possível restaurar: " + (err.message || err));
    }
    e.target.value = "";
  }
});

$("#fab").addEventListener("click", () => abrirGasto(null));
window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
window.addEventListener("online", () => renderSync(store.state));
window.addEventListener("offline", () => renderSync(store.state));

// ---------- login ----------
$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const erro = $("#login-erro");
  erro.textContent = "";
  const email = $("#login-email").value.trim();
  const senha = $("#login-senha").value;
  if (!email || !senha) { erro.textContent = "Preencha e-mail e senha."; return; }
  try {
    await store.entrar(email, senha);
  } catch (err) {
    const c = err.code || "";
    erro.textContent = c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")
      ? "E-mail ou senha incorretos."
      : c.includes("network") ? "Sem internet. Conecte-se para entrar pela primeira vez." : "Não foi possível entrar: " + (err.message || c);
  }
});
$("#btn-esqueci").addEventListener("click", async () => {
  const email = $("#login-email").value.trim();
  const erro = $("#login-erro");
  if (!email) { erro.textContent = "Escreva seu e-mail acima e toque em \"Esqueci a senha\" de novo."; return; }
  try { await store.recuperarSenha(email); erro.textContent = "Enviamos um link para redefinir a senha no seu e-mail."; }
  catch (err) { erro.textContent = "Não foi possível enviar o e-mail: " + (err.message || err); }
});

// ---------- início ----------
async function iniciar() {
  try {
    store = await criarStore();
  } catch (err) {
    $("#carregando").textContent = "Não foi possível carregar o app. Verifique a internet e abra de novo.";
    console.error(err);
    return;
  }
  store.subscribe((st) => {
    if (store.modo === "nuvem" && !st.authPronto) return;
    $("#carregando").hidden = true;
    $("#tela-login").hidden = st.logado;
    $("#app").hidden = !st.logado;
    if (!st.logado) { S = { config: null, gastos: [] }; return; }
    const aviso = $("#aviso-erro");
    aviso.hidden = !st.erro;
    aviso.textContent = st.erro || "";
    S = { config: st.config, gastos: st.gastos };
    if (!st.pronto) { $("#view").innerHTML = `<p class="vazio-pequeno">Carregando os gastos…</p>`; return; }
    render();
    renderSync(st);
  });
}
iniciar();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
